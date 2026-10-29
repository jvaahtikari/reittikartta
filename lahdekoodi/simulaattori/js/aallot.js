/* Simulaattori – aaltomalli (vaihe 4, 29.10.2026): aallokko tuulen ja pyyhkäisymatkan (fetch) mukaan.
 *
 * Aallonkorkeus riippuu tuulen nopeudesta ja siitä, kuinka pitkän matkan tuuli on puhaltanut avoimen veden yli (pyyhkäisymatka).
 * Tuulen yläpuolisen rannan suojassa vesi on tyyntä ja aallokko kasvaa ulapalle mentäessä. Merkitsevä aallonkorkeus ja huippujakso
 * lasketaan JONSWAP-kaavoilla (Hasselmann ym. 1973, rajoitettu täysin kehittyneeseen Pierson-Moskowitz-aallokkoon):
 *   g Hs / U² = 0,0016 (g F / U²)^0,5   ja   g Tp / U = 0,286 (g F / U²)^(1/3),
 * missä U on tuulen nopeus (m/s) ja F pyyhkäisymatka (m). Esimerkki: 10 m/s ja 5 km antavat Hs noin 0,36 m ja Tp noin 2,3 s.
 *
 * Pyyhkäisymatka lasketaan ruudukkoon tuulen suuntaisessa koordinaatistossa: jokaista riviä kuljetaan tuulen yläpuolelta (enintään 10 km)
 * myötätuuleen, ja matka kasvaa vesisoluissa ja nollautuu maassa (maastomalli: maanpinta yli 0,6 m järven pinnasta). Aluksen ympärille
 * 2,4 x 2,4 km:n alue tallennetaan tekstuuriksi, josta veden varjostin lukee aaltojen voimakkuuden paikan mukaan. Laskenta jaetaan
 * useaan kuvaan ja tehdään uudelleen, kun alus liikkuu 300 m tai tuuli muuttuu.
 *
 * Merenkäynti ja aluksen vaste (createMeri, 29.10.2026): aallokko ei ole yksi säännöllinen aalto vaan JONSWAP-spektristä poimittu 16 aallon summa
 * (eri pituudet, suunnat tuulen suunnan ympärillä ja satunnaiset vaiheet, siemen kiinteä, joten miehistötilan molemmat laitteet näkevät saman meren).
 * Aaltojen summa tuottaa ryhmiä: välillä tulee useampi isompi aalto peräkkäin ja välillä on tyynempää. Pinnan korkeus lasketaan rungon alla
 * keulassa, keskellä, perässä ja kyljillä aluksen mukana liikkuvissa pisteissä, joten kohtaamistaajuus ja rungon pituuden suodatus syntyvät itsestään.
 * Liukuvarunkoinen Pv417 (12,25 x 3,6 m):
 *   - hitaasti (uppouma, alle noin 10 kn) koko runko on vedessä: alus myötäilee pitkiä aaltoja nousten ja nyökäten, lyhyet aallot keskiarvoistuvat
 *     rungon pituudella, sivuaallokossa kallistus on suuri ja heikosti vaimeneva (ominaisjakso noin 2,6 s), ja myötäaallokko työntää ja kääntää
 *     perää (surffaus, kun aaltojen nopeus on lähellä aluksen nopeutta, ja sorto sivulle)
 *   - liukukynnyksellä (10-17 kn) keula on pystyssä ja nyökkäys on suurimmillaan
 *   - liu'ussa (yli noin 17 kn) runko kantaa perän lyhyellä märällä pinnalla: lyhyt aallokko jää alle ja tuntuu tärinänä, mutta isompi aalto
 *     heittää rungon ilmaan, kun aallon pinta laskee nopeammin kuin painovoima ehtii (pystykiihtyvyys rajattu -g:hen), ja alus iskeytyy
 *     seuraavaan aaltoon (isku = pystykiihtyvyyden piikki). Vasta-aallokossa iskut tihenevät nopeuden mukana ja hidastavat (lisävastus).
 * Vaste on toisen kertaluvun jousi-vaimennin (nousu, nyökkäys, kallistus), jonka jäykkyys ja vaimennus vaihtuvat uppoumasta liukuun.
 * Liikemallille annetaan pitkittäisvoima (lisävastus ja aallon rinteen työntö) ja kääntymisen häiriö (S.waveFx, S.waveYaw).
 *
 * Moduuli toimii selaimessa (window.Aallot) ja Nodessa (module.exports: kaavat testattavissa). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, G = 9.81;

  // Merkitsevä aallonkorkeus (m) ja huippujakso (s) tuulen nopeudesta U (m/s) ja pyyhkäisymatkasta F (m)
  function waveHs(U, F) {
    if (!(U > 0) || !(F > 0)) return 0;
    return Math.min(1.6e-3 * U * Math.sqrt(F / G), 0.243 * U * U / G);
  }
  function waveTp(U, F) {
    if (!(U > 0) || !(F > 0)) return 0;
    return Math.min(0.286 * U / G * Math.pow(G * F / (U * U), 1 / 3), 7.69 * U / G);
  }
  function waveLength(tp) { return G * tp * tp / (2 * Math.PI); }

  var SET = {
    cellM: 50, halfM: 1200, upM: 10000, landM: 0.6, moveM: 300, rowsPerFrame: 4,
    ampRefHs: 0.11,        // aallonkorkeus, jolla veden aaltokuvio on entisellään (3 m/s ja 5 km)
    ampMax: 4, ampMin: 0.08
  };

  function create(view, opts) {
    var THREE = root.THREE, P = root.Paikka, U = view.uniforms, terrain = view.terrain;
    var N = Math.round(2 * SET.halfM / SET.cellM), data = new Uint8Array(N * N);
    var tex = new THREE.DataTexture(data, N, N, THREE.LuminanceFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    U.uSeaTex.value = tex;
    var job = null, done = null, local = { hs: 0, tp: 0, fetch: 0, toGrid: 0 }, last = { x: 1e9, y: 1e9, from: -1, spd: -1 };

    function isLand(x, y) { var h = terrain.heightAt(x, y, true); return h != null && h > SET.landM; }
    function amp(hs) { return Math.max(SET.ampMin, Math.min(SET.ampMax, hs / SET.ampRefHs)); }

    // uusi laskenta: tuulen suunta (tosisuunta, josta tuulee), nopeus ja keskipiste
    function start(x, y, fromTrue, spd) {
      var th = P.trueToGrid(fromTrue + 180, x, y) * RAD;   // myötätuulen suunta ruutukoordinaateissa
      job = { x: x, y: y, spd: spd, from: fromTrue, ux: Math.sin(th), uy: Math.cos(th), vx: Math.cos(th), vy: -Math.sin(th), th: th, row: 0, out: new Uint8Array(N * N), fetchMid: 0 };
      last.x = x; last.y = y; last.from = fromTrue; last.spd = spd;
    }
    function stepJob() {
      var j = job, c = SET.cellM, n0 = Math.round(SET.upM / c);
      for (var r = 0; r < SET.rowsPerFrame && j.row < N; r++, j.row++) {
        var v = -SET.halfM + (j.row + 0.5) * c, f = 0;
        // rivi: tuulen yläpuolelta (upM ennen aluetta) myötätuuleen alueen loppuun
        for (var k = -n0; k < N; k++) {
          var u = -SET.halfM + (k + 0.5) * c, px = j.x + j.ux * u + j.vx * v, py = j.y + j.uy * u + j.vy * v;
          if (isLand(px, py)) f = 0; else f += c;
          if (k >= 0) {
            j.out[j.row * N + k] = Math.round(amp(waveHs(j.spd, f)) / SET.ampMax * 255);
            if (j.row === N / 2 && k === N / 2) j.fetchMid = f;
          }
        }
      }
      if (j.row >= N) {
        data.set(j.out); tex.needsUpdate = true; done = j; job = null;
        U.uSeaO.value.set(j.x, -j.y); U.uSeaU.value.set(j.ux, -j.uy); U.uSeaV.value.set(j.vx, -j.vy); U.uSeaHalf.value = SET.halfM; U.uSeaOn.value = j.spd > 0 ? 1 : 0;
      }
    }
    // pyyhkäisymatka aluksen kohdalla (nopea yksittäinen haku)
    function fetchAt(x, y, fromTrue) {
      var th = P.trueToGrid(fromTrue, x, y) * RAD, sx = Math.sin(th), sy = Math.cos(th), c = SET.cellM, d = 0;
      for (d = c / 2; d < SET.upM; d += c) if (isLand(x + sx * d, y + sy * d)) break;
      return Math.min(d, SET.upM);
    }

    // joka kuvalla: st = aluksen tila (x, y, windFrom, windSpeed)
    var fetchT = 0;
    function paivita(st, dt) {
      var spd = st.windSpeed || 0, from = st.windFrom || 0;
      if (!job && (Math.hypot(st.x - last.x, st.y - last.y) > SET.moveM || Math.abs(from - last.from) > 2 || Math.abs(spd - last.spd) > 0.3)) start(st.x, st.y, from, spd);
      if (job) stepJob();
      fetchT -= dt || 0;
      if (fetchT <= 0) {
        fetchT = 1.5;
        var F = spd > 0 ? fetchAt(st.x, st.y, from) : 0;
        local = { hs: waveHs(spd, F), tp: waveTp(spd, F), fetch: F, toGrid: P.trueToGrid(from + 180, st.x, st.y) };
        U.uWaveAmp.value = spd > 0 ? amp(local.hs) : SET.ampMin;
        // veden aaltokenttä: huippuaallonpituus ja jyrkkyys (pi Hs / aallonpituus) aluksen kohdalta, tyynellä lyhyt ja loiva väre
        var lam = local.tp ? waveLength(local.tp) : 0;
        if (U.uWaveLen) { U.uWaveLen.value = lam > 0.6 ? lam : 0.8; U.uSteep.value = lam > 0.6 ? Math.min(0.2, Math.max(0.015, Math.PI * local.hs / lam)) : 0.012; }
        if (view.setSea) view.setSea(local);
      }
    }
    function rebase() { last.x = 1e9; job = null; }
    return { paivita: paivita, rebase: rebase, sea: function () { return local; }, tila: function () { return { hs: local.hs, tp: local.tp, fetch: local.fetch, aallonpituus: local.tp ? waveLength(local.tp) : 0, laskenta: job ? job.row + '/' + N : 'valmis' }; }, settings: SET };
  }

  // ---------- merenkäynti ja aluksen vaste ----------
  var HULL = {
    L: 12.25, B: 3.6, wetSlow: 10, wetPlane: 4.5, planeAft: -3.0,   // märkä pituus (m) uppoumassa ja liu'ussa, liu'ussa märkä pinta perässä
    heaveW: [3.4, 5.5], heaveZ: [0.32, 0.6],     // nousun ominaiskulmataajuus (rad/s) ja vaimennussuhde: uppouma, liuku
    pitchW: [3.0, 5.0], pitchZ: [0.30, 0.42],
    rollW: [2.4, 3.0], rollZ: [0.25, 0.35],       // kallistus: ominaisjakso noin 2,6 s, uppoumassa heikommin vaimeneva
    rollGain: [0.85, 0.3], airPitch: -0.6,         // kallistuksen herkkyys aallon kaltevuudelle (liu'ussa dynaaminen nostovoima vakauttaa), ilmassa keula painuu (rad/s²)
    surge: [0.55, 0.15],                           // aallon rinteen työntö (osuus m g x rinne)
    addRes: [1.0, 2.5],                            // lisävastuksen kerroin vasta-aallokossa
    yaw: [0.35, 0.05],                             // myötä- ja viistoaallokon kääntävä vaikutus (rad/s rinne-eroa kohti)
    planeKn: [10, 18], humpKn: [9, 16]
  };
  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // JONSWAP-spektri (gamma 3,3) Hs = 1 ja huippujakso tp: 16 komponenttia, amplitudit skaalataan Hs:llä myöhemmin
  function spectrum(tp, seed) {
    var r = rng(seed), wp = 2 * Math.PI / tp, n = 16, w0 = 0.72 * wp, w1 = 2.6 * wp, dw = (w1 - w0) / n, comp = [], m0 = 0;
    for (var i = 0; i < n; i++) {
      var w = w0 + (i + r()) * dw, sg = w <= wp ? 0.07 : 0.09, g = Math.pow(3.3, Math.exp(-Math.pow(w - wp, 2) / (2 * sg * sg * wp * wp)));
      var Sw = Math.pow(w, -5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * g, a2 = 2 * Sw * dw;
      // suuntahajonta tuulen suunnan ympärillä (normaalijakauma, keskihajonta 25°, lyhyet aallot hajoavat enemmän)
      var u1 = Math.max(1e-9, r()), u2 = r(), nd = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      comp.push({ w: w, k: w * w / G, a2: a2, dir: nd * (20 + 15 * (w / wp - 1)) * RAD, ph: r() * 2 * Math.PI });
      m0 += a2 / 2;
    }
    comp.forEach(function (c) { c.a = Math.sqrt(c.a2) / (4 * Math.sqrt(m0)); });   // Hs = 4 sqrt(m0) = 1
    return comp;
  }
  function createMeri(seed) {
    var st = { comp: null, tp: 0, hs: 0, hsT: 0, to: 0, z: 0, zv: 0, p: 0, pv: 0, r: 0, rv: 0, zs0: null, ps0: null, air: 0, slam: 0, slamT: 0, az: 0 };
    // pinnan korkeus pisteessä (x, y ruutukoordinaatit) hetkellä t
    function eta(x, y, t) {
      var c = st.comp, h = 0; if (!c || st.hs <= 0) return 0;
      for (var i = 0; i < c.length; i++) { var q = c[i], d = st.to + q.dir; h += q.a * Math.cos(q.k * (x * Math.sin(d) + y * Math.cos(d)) - q.w * t + q.ph); }
      return h * st.hs;
    }
    // S: aluksen tila (x, y, hdg ruutusuunta, v m/s, t), sea: { hs, tp, toGrid } aluksen kohdalta, dt sekuntia
    function step(S, sea, dt) {
      if (!sea || !(sea.tp > 0.3)) { st.hs += (0 - st.hs) * Math.min(1, dt); if (st.hs < 0.005) { S.waveFx = 0; S.waveYaw = 0; S.wave = null; return null; } }
      else {
        if (!st.comp || Math.abs(sea.tp - st.tp) / st.tp > 0.12) { st.comp = spectrum(sea.tp, 4177); st.tp = sea.tp; }
        st.hs += (sea.hs - st.hs) * Math.min(1, dt / 4); st.to = sea.toGrid * RAD;
      }
      var n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n, out = null;
      for (var i = 0; i < n; i++) out = sub(S, h, S.t - dt + (i + 1) * h);
      return out;
    }
    function sub(S, h, t) {
      var kn = Math.abs(S.v) / 0.514444, pl = sm(HULL.planeKn[0], HULL.planeKn[1], kn), hump = sm(HULL.humpKn[0], 12, kn) * (1 - sm(14, HULL.humpKn[1], kn));
      var hd = S.hdg * RAD, fx = Math.sin(hd), fy = Math.cos(hd), rx = Math.cos(hd), ry = -Math.sin(hd);
      // aluksen paikka tällä alihetkellä (S.x, S.y on askeleen lopussa, ero on pieni)
      var Lw = HULL.wetSlow + (HULL.wetPlane - HULL.wetSlow) * pl, c0 = HULL.planeAft * pl, B2 = HULL.B / 2;
      function at(a, b) { return eta(S.x + fx * a + rx * b, S.y + fy * a + ry * b, t); }
      var eb = at(c0 + Lw / 2, 0), em = at(c0, 0), es = at(c0 - Lw / 2, 0), ep = at(c0, -B2), esb = at(c0, B2);
      var ebp = at(c0 + Lw / 2, -B2), ebs = at(c0 + Lw / 2, B2), esp = at(c0 - Lw / 2, -B2), ess = at(c0 - Lw / 2, B2);
      var zs = (eb + 2 * em + es + ep + esb) / 6, ps = Math.atan2(eb - es, Lw), rs = Math.atan2(ep - esb, HULL.B) * (HULL.rollGain[0] + (HULL.rollGain[1] - HULL.rollGain[0]) * pl);
      var zsv = st.zs0 == null ? 0 : (zs - st.zs0) / h, psv = st.ps0 == null ? 0 : (ps - st.ps0) / h; st.zs0 = zs; st.ps0 = ps;
      function mix(arr) { return arr[0] + (arr[1] - arr[0]) * pl; }
      // nousu: vesi voi vain kannatella, ei vetää alas nopeammin kuin painovoima (liu'ussa isosta aallosta ilmaan)
      var wz = mix(HULL.heaveW), zz = mix(HULL.heaveZ), az = wz * wz * (zs - st.z) + 2 * zz * wz * (zsv - st.zv);
      var airborne = az < -G; if (airborne) az = -G;
      if (st.air > 0.15 && !airborne && az > 1.2 * G) { st.slam = Math.min(4, az / G); st.slamT = t; }   // isku ilmalennon jälkeen
      st.air = airborne ? st.air + h : 0;
      st.zv += az * h; st.z += st.zv * h; st.az = az;
      // nyökkäys (keula ylös positiivinen), liukukynnyksellä nyökkäys suurimmillaan
      var wp = mix(HULL.pitchW), zp = mix(HULL.pitchZ) * (1 - 0.35 * hump), ap = airborne ? HULL.airPitch : wp * wp * (ps * (1 + 0.6 * hump) - st.p) + 2 * zp * wp * (psv - st.pv);
      st.pv += ap * h; st.p += st.pv * h;
      // kallistus (oikea kylki alas positiivinen)
      var wr = mix(HULL.rollW), zr = mix(HULL.rollZ), ar = wr * wr * (rs - st.r) - 2 * zr * wr * st.rv;
      st.rv += ar * h; st.r += st.rv * h;
      // voimat liikemallille: aallon rinteen työntö (alamäki eteenpäin) ja lisävastus vasta-aallokossa, kääntävä vaikutus myötä- ja viistoaallokossa
      var rel = Math.cos(st.to - hd), head = (1 - rel) / 2, m = 15500;
      var surge = -m * G * Math.sin(ps) * mix(HULL.surge);
      var addR = 0.5 * 1000 * G * Math.pow(st.hs / 2, 2) * HULL.B * mix(HULL.addRes) * head * (S.v > 0 ? 1 : 0) + (t - st.slamT < 0.3 ? st.slam * 2500 : 0);
      S.waveFx = surge - addR;
      S.waveYaw = ((ebp - ebs) - (esp - ess)) / HULL.B * mix(HULL.yaw) * (1 - head);
      var slamNow = t - st.slamT < 0.4 ? st.slam * (1 - (t - st.slamT) / 0.4) : 0;
      S.wave = { z: st.z, pitch: st.p / RAD, roll: st.r / RAD, az: st.az, slam: slamNow, air: st.air > 0, hs: st.hs, planing: pl };
      return S.wave;
    }
    return { step: step, eta: eta, state: function () { return st; } };
  }

  var api = { waveHs: waveHs, waveTp: waveTp, waveLength: waveLength, create: create, createMeri: createMeri, spectrum: spectrum, HULL: HULL, SETTINGS: SET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Aallot = api;
})(typeof window !== 'undefined' ? window : globalThis);
