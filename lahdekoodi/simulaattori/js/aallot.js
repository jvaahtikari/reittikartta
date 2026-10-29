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
 * Aluksen keinunta: nyökkäys ja kallistus aaltojen jyrkkyydestä (Hs / aallonpituus) ja aaltojen tulosuunnasta keulaan nähden, kohtaamistaajuus
 * aluksen nopeuden mukaan. Alle rungon mittaiset aallot keinuttavat vähemmän (vastekerroin aallonpituus / 12 m).
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
        if (view.setSea) view.setSea(local);
      }
    }
    function rebase() { last.x = 1e9; job = null; }
    return { paivita: paivita, rebase: rebase, tila: function () { return { hs: local.hs, tp: local.tp, fetch: local.fetch, aallonpituus: local.tp ? waveLength(local.tp) : 0, laskenta: job ? job.row + '/' + N : 'valmis' }; }, settings: SET };
  }

  var api = { waveHs: waveHs, waveTp: waveTp, waveLength: waveLength, create: create, SETTINGS: SET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Aallot = api;
})(typeof window !== 'undefined' ? window : globalThis);
