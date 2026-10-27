/* Simulaattori – Google 3D -näkymä (testi, vaihe 3m, kerrostus vaihe 3n).
 *
 * Valinnainen ulkonäkymä, joka korvaa oman three.js-näkymän Googlen Maps JavaScript API:n 3D-kartalla (Map3DElement, fotorealistiset 3D-tiilet).
 * Oma näkymä piilotetaan eikä tuhota, joten paluu on heti. Kirjasto ladataan vasta, kun käyttäjä on antanut oman API-avaimen,
 * eikä sitä upoteta tiedostoon. Avain tallennetaan vain selaimen localStorage-muistiin (sim.googleKey), eikä sitä koskaan kirjoiteta
 * repoon, lokiin tai palvelimelle.
 *
 * Rakenne on tehty itse. Vertailukohta oli avoimen lähdekoodin maritime-ship-simulator (MPL-2.0, ui/web/forward_view/google_maps_3d.js), josta otettiin
 * vain periaatteet: kirjaston lataus script-elementillä (libraries=maps3d), Map3DElementin kamera (center, range, heading, tilt, fov) ja virheiden käsittely.
 * Koodia ei ole kopioitu.
 *
 * Kamera: Map3DElementin kamera kiertää keskipistettä (center) etäisyydeltä range. Vaakasuoraan katsova silmäpiste saadaan asettamalla tilt 90 astetta
 * (0 = suoraan alas), jolloin kamera on keskipisteen kanssa samalla korkeudella range metriä keskipisteen takana. Keskipiste lasketaan siis silmäpisteestä
 * katseen suuntaan range metrin päähän. Korkeus on metreinä keskimerenpinnan yläpuolella (Googlen ohje: ABSOLUTE = EGM96-keskimerenpinta), eli
 * järven pinta 95,5 m N2000 plus silmän korkeus vedenpinnasta. N2000:n ja EGM96:n ero on Suomessa alle noin metrin (arvio, ei varmennettu),
 * ja korjaus on asetus altOffsetM (selaimen muisti sim.googleAltOffset).
 *
 * Vaihe 3n: Map3DElement on #v3-ruudun alin kerros ja oma three.js-kangas (läpinäkyvä tausta) on sen päällä, joten kartta ei enää piilota omaa näkymää.
 * Kartta luodaan ajon aikana vain kerran (Immersive Maps laskuttaa karttalatauksen) ja pidetään elossa piilotettuna (display:none), kun käyttäjä vaihtaa omaan näkymään.
 * Uusi lataus syntyy vain sivun uudelleenlatauksesta tai virheestä, joka pakottaa elementin hylkäämään (stats.loads laskee luodut elementit).
 * Kalibrointi (calib) koskee vain omaa kameraa: Googlelle lähetetään aina nimelliset arvot ja oma kamera sovitetaan Googlen todelliseen käytökseen.
 *
 * Moduuli toimii selaimessa (window.Google3D) ja Nodessa (module.exports, vain laskenta). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;

  var SETTINGS = {
    waterN2000M: 95.5,        // järven pinta, m N2000 (sama kuin Paikka.LAKE_Z)
    altOffsetM: 0,            // lisäkorjaus korkeuteen (m), jos N2000:n ja Googlen keskimerenpinnan ero näkyy
    eyeFwdM: 1.1,             // silmä aluksen kääntöpisteen edessä (nakyma.js: eyeX 6,1 - pivotX 5,0)
    eyeStbdM: -0.75,          // silmä kääntöpisteen oikealla puolella (negatiivinen = vasemmalla, navigoijan paikka)
    eyeStandM: 2.72,          // silmän korkeus vedenpinnasta seisten: eyeStandZ 3,50 m köliviivasta - vesiviiva 0,78 m
    eyeSitM: 2.67,            // istuen: 3,45 m - 0,78 m
    rangeM: 25,               // keskipisteen etäisyys silmästä (m)
    tiltDeg: 90,              // 0 = suoraan alas, 90 = vaakasuoraan
    fovMinDeg: 5, fovMaxDeg: 80,   // Map3DElementin fov (pystysuuntainen) hyväksyy 5 ... 80 astetta
    minIntervalMs: 15,        // kameran päivitys joka kuvalla, enintään noin 60 kertaa sekunnissa
    steadyTimeoutMs: 25000,   // jos kartta ei vakiinnu tässä ajassa, näytetään huomautus
    keyStore: 'sim.googleKey',
    altStore: 'sim.googleAltOffset',
    calibStore: 'sim.googleKalib',
    attribClipPx: 26, attribClipW: 170,   // vain vasemman alakulman lovi (logo ja tietolähteet), ei koko alareunan kaistaa (27.10.2026)
    attribClipPxOld: 24,         // oman kankaan alareunasta rajataan tämän verran pois, jotta Googlen lähdemerkintä (logo ja tietolähteet) jää näkyviin
    fogLevelsKm: [0, 20, 10, 5, 2, 1]   // sumukerroksen näkyvyys (km), 0 = ei sumukerrosta
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function norm360(d) { return ((d % 360) + 360) % 360; }

  // Metrejä yhtä leveys- ja pituusastetta kohden WGS84:ssä (sarjakehitelmä)
  function metersPerDegLat(latDeg) {
    var p = latDeg * RAD;
    return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p);
  }
  function metersPerDegLon(latDeg) {
    var p = latDeg * RAD;
    return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p);
  }
  // Siirto (itä, pohjoinen metreinä) pisteestä
  function offsetLatLon(lat, lon, eastM, northM) {
    return { lat: lat + northM / metersPerDegLat(lat), lon: lon + eastM / metersPerDegLon(lat) };
  }
  // Siirto suunnassa (tosisuunta, aste) etäisyyden verran
  function moveAlong(lat, lon, bearingDeg, distM) {
    var b = bearingDeg * RAD;
    return offsetLatLon(lat, lon, Math.sin(b) * distM, Math.cos(b) * distM);
  }

  // Pystykuvakulma (aste) vaakakuvakulmasta ja kuvasuhteesta (leveys / korkeus), rajattuna Googlen sallimaan väliin
  function vfovFromHfov(hfovDeg, aspect) {
    return 2 * Math.atan(Math.tan(hfovDeg * RAD / 2) / aspect) / RAD;
  }

  /* Kameran laskenta (puhdas funktio, yksikkötesti testit/google3d_test.js).
   * Syöte p: lat, lon (aluksen kääntöpiste, aste), hdgTrue (aluksen tosisuunta), lookDeg (katseen kääntö, positiivinen oikealle),
   * vfovDeg (näkymän pystykuvakulma), seated (istuen), valinnaisesti eyeFwdM, eyeStbdM, eyeAboveWaterM, rangeM, tiltDeg, altOffsetM.
   * Tulos: lat, lng, altitude (keskipiste, Map3DElementin center), range, heading, tilt, fov sekä eye (silmäpiste). */
  function camera(p, cfg) {
    var S = cfg || SETTINGS;
    var fwd = p.eyeFwdM != null ? p.eyeFwdM : S.eyeFwdM, stbd = p.eyeStbdM != null ? p.eyeStbdM : S.eyeStbdM;
    var up = p.eyeAboveWaterM != null ? p.eyeAboveWaterM : (p.seated ? S.eyeSitM : S.eyeStandM);
    var range = p.rangeM != null ? p.rangeM : S.rangeM, tilt = p.tiltDeg != null ? p.tiltDeg : S.tiltDeg;
    var off = p.altOffsetM != null ? p.altOffsetM : S.altOffsetM;
    var h = norm360(p.hdgTrue), look = norm360(h + (p.lookDeg || 0));
    // silmäpiste: kääntöpisteestä eteen ja sivulle aluksen suunnassa
    var hr = h * RAD, east = Math.sin(hr) * fwd + Math.cos(hr) * stbd, north = Math.cos(hr) * fwd - Math.sin(hr) * stbd;
    var eye = offsetLatLon(p.lat, p.lon, east, north);
    var alt = S.waterN2000M + up + off;
    // keskipiste: silmästä katseen suuntaan range metrin päähän samalla korkeudella (tilt 90), jolloin kamera on silmäpisteessä
    // katse alaspäin (pitchDownDeg, vain alaspäin, koska Googlen tilt ei sisällä vaakatason yläpuolta): kamera on keskipisteen yläpuolella
    var pd = clamp(p.pitchDownDeg || 0, 0, 60), c = moveAlong(eye.lat, eye.lon, look, range * Math.cos(pd * RAD));
    var fov = clamp(p.vfovDeg != null ? p.vfovDeg : 45, S.fovMinDeg, S.fovMaxDeg);
    return { lat: c.lat, lng: c.lon, altitude: alt - range * Math.sin(pd * RAD), range: range, heading: look, tilt: tilt - pd, fov: fov, eye: { lat: eye.lat, lng: eye.lon, altitude: alt } };
  }

  // ---------- avain (selaimen muisti) ----------
  // Palvelimen avain (Vercelin ympäristömuuttuja GOOGLE_API, polku /api/google): haetaan kerran, pidetään vain muistissa
  var serverKey = '', serverKeyAsked = false;
  function fetchServerKey(cb) {
    if (serverKeyAsked) { if (cb) cb(serverKey); return; }
    serverKeyAsked = true;
    // Paikallisella testipalvelimella (localhost, 127.0.0.1, file) ei ole reittiä, joten ei turhaa 404-kutsua
    var hn = String(location.hostname || '');
    if (location.protocol === 'file:' || hn === 'localhost' || hn === '127.0.0.1' || hn === '') { if (cb) cb(''); return; }
    try {
      fetch('/api/google', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        serverKey = (j && j.key) ? String(j.key).trim() : '';
        if (cb) cb(serverKey);
      }).catch(function () { if (cb) cb(''); });
    } catch (e) { if (cb) cb(''); }
  }
  function getKey() { try { return String(localStorage.getItem(SETTINGS.keyStore) || '').trim() || serverKey; } catch (e) { return serverKey; } }
  function hasServerKey() { return !!serverKey; }
  function setKey(k) {
    k = String(k || '').trim();
    try { if (k) localStorage.setItem(SETTINGS.keyStore, k); else localStorage.removeItem(SETTINGS.keyStore); } catch (e) {}
    return k;
  }
  function altOffset() {
    try { var v = parseFloat(localStorage.getItem(SETTINGS.altStore)); return isFinite(v) ? v : SETTINGS.altOffsetM; } catch (e) { return SETTINGS.altOffsetM; }
  }


  // ---------- kalibrointi (vaihe 3n) ----------
  // Oman kameran korjaukset Googlen todelliseen käytökseen: dHeadingDeg (suunta), dPitchDeg (nousukulma, positiivinen = ylös), tanScale (kuvakulman tangentin kerroin,
  // 1 = Googlen fov täsmää) ja altOffsetM (Googlen kameran korkeuskorjaus, sama kuin vaiheen 3m sim.googleAltOffset). Tallennus selaimen muistiin (sim.googleKalib).
  var CAL0 = { dHeadingDeg: 0, dPitchDeg: 0, tanScale: 1, altOffsetM: null };
  var memCalib = null;   // muistissa pidettävä kopio, jotta kalibrointi toimii myös silloin, kun selaimen muisti on estetty
  function getCalib() {
    var c = { dHeadingDeg: 0, dPitchDeg: 0, tanScale: 1, altOffsetM: altOffset() };
    try {
      var o = null;
      try { o = JSON.parse(localStorage.getItem(SETTINGS.calibStore) || 'null'); } catch (e0) { o = null; }
      if (!o) o = memCalib;
      if (o) {
        if (isFinite(o.dHeadingDeg)) c.dHeadingDeg = clamp(+o.dHeadingDeg, -10, 10);
        if (isFinite(o.dPitchDeg)) c.dPitchDeg = clamp(+o.dPitchDeg, -10, 10);
        if (isFinite(o.tanScale)) c.tanScale = clamp(+o.tanScale, 0.7, 1.4);
        if (isFinite(o.altOffsetM)) c.altOffsetM = clamp(+o.altOffsetM, -50, 50);
      }
    } catch (e) {}
    return c;
  }
  function setCalib(c) {
    memCalib = c ? JSON.parse(JSON.stringify(c)) : null;
    try { if (c) localStorage.setItem(SETTINGS.calibStore, JSON.stringify(c)); else localStorage.removeItem(SETTINGS.calibStore); } catch (e) {}
    return getCalib();
  }

  // Tunnetut kohteet (TM35FIN E, N ja korkeus N2000). Näsinneula: huippu 168 m maasta (maanpinta 109,16 m), Tampellan piippu ja Naistenlahden piippu:
  // vuoden 2008 keilauksen huippu (maamerkit.json), Siilinkarin loisto: valon korkeus 6,5 m vedestä (Väyläviraston turvalaiteaineisto), aallonmurtajan päät:
  // vesieste-kerroksen viivan päätepisteet (korkeus 1,2 m vedestä, sama kuin vaiheen 3j rakennetun rannan korkeus).
  var CAL_TARGETS = [
    { id: 'nasinneula', nimi: 'Näsinneulan huippu', e: 326712.7, n: 6823364.1, z: 109.16 + 168 },
    { id: 'tampella', nimi: 'Tampellan piipun huippu', e: 327814.7, n: 6823430.5, z: 199.62 },
    { id: 'siilinkari', nimi: 'Siilinkarin loisto (valo)', e: 328045.6, n: 6824882.4, z: 95.5 + 6.5 },
    { id: 'naistenlahti', nimi: 'Naistenlahden voimalaitoksen piippu', e: 328508.2, n: 6823853.2, z: 189.02, huom: 'uusi piippu, näkyy vain jos Googlen malli on tuore' },
    { id: 'aallonmurtaja1', nimi: 'Naistenlahden aallonmurtajan eteläpää', e: 328375, n: 6823674, z: 95.5 + 1.2 },
    { id: 'aallonmurtaja2', nimi: 'Naistenlahden aallonmurtajan pohjoispää', e: 328457, n: 6823887, z: 95.5 + 1.2 }
  ];

  // Kohteen suunta (ruutusuunta, aste), korkeuskulma (aste) ja etäisyys silmästä. dE, dN, dU metreinä. Maan kaarevuus otetaan huomioon (Googlen maapallo).
  function viewAngles(dE, dN, dU, noCurv) {
    var d = Math.hypot(dE, dN), up = dU - (noCurv ? 0 : d * d / (2 * 6371000));
    return { az: ((Math.atan2(dE, dN) / RAD) % 360 + 360) % 360, el: Math.atan2(up, d) / RAD, dist: Math.hypot(d, dU) };
  }
  // Suunta/korkeuskulma -> kuvapiste. cam: heading (aste), pitch (aste, ylös positiivinen), vfov (aste), tanScale, w, h (kuvan koko). Palauttaa { u, v, z } tai null, jos kohde on kameran takana.
  function projectRay(az, el, cam) {
    var b = az * RAD, e = el * RAD, h = cam.heading * RAD, p = (cam.pitch || 0) * RAD;
    var dx = Math.sin(b) * Math.cos(e), dy = Math.sin(e), dz = Math.cos(b) * Math.cos(e);
    var fz = Math.sin(h) * Math.cos(p) * dx + Math.sin(p) * dy + Math.cos(h) * Math.cos(p) * dz;
    if (fz <= 1e-6) return null;
    var rx = Math.cos(h) * dx - Math.sin(h) * dz, uy = -Math.sin(h) * Math.sin(p) * dx + Math.cos(p) * dy - Math.cos(h) * Math.sin(p) * dz;
    var f = (cam.h / 2) / (Math.tan(cam.vfov * RAD / 2) * (cam.tanScale || 1));
    return { u: cam.w / 2 + f * rx / fz, v: cam.h / 2 - f * uy / fz, z: fz, f: f };
  }
  /* Sovitus: näytteet [{ az, el, heading, pitch, vfov, w, h, u, v }] (u, v = käyttäjän osoittama kohdan paikka Googlen kuvassa). Etsitään korjaukset
   * (dHeadingDeg, dPitchDeg, tanScale), joilla oman kameran ennuste osuu osoitettuihin pisteisiin (pienimmän neliösumman Gauss-Newton, Levenberg-Marquardt).
   * Yhdellä näytteellä sovitetaan vain suunta ja nousukulma, kahdella tai useammalla myös kuvakulma. Palauttaa korjaukset ja jäännökset asteina (vaaka ja pysty). */
  function fitCalibration(samples, opts) {
    opts = opts || {};
    var n = samples.length, fitK = opts.fitScale != null ? !!opts.fitScale : n >= 2;
    var th = [0, 0, 1];   // dh, dp, k
    function resid(t, list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i], pr = projectRay(s.az, s.el, { heading: s.heading + t[0], pitch: (s.pitch || 0) + t[1], vfov: s.vfov, tanScale: t[2], w: s.w, h: s.h });
        if (!pr) return null;
        out.push(pr.u - s.u, pr.v - s.v);
      }
      return out;
    }
    var r = resid(th, samples); if (!r) return null;
    function sse(rr) { var q = 0; for (var i = 0; i < rr.length; i++) q += rr[i] * rr[i]; return q; }
    var lam = 1e-3, cost = sse(r), np = fitK ? 3 : 2;
    for (var it = 0; it < 60; it++) {
      var J = [], steps = [0.01, 0.01, 0.0005];
      for (var j = 0; j < np; j++) {
        var t2 = th.slice(); t2[j] += steps[j]; var r2 = resid(t2, samples); if (!r2) return null;
        J.push(r2.map(function (v, i) { return (v - r[i]) / steps[j]; }));
      }
      var A = [], g = [];
      for (var a = 0; a < np; a++) { A.push([]); g.push(0); for (var b2 = 0; b2 < np; b2++) { var q = 0; for (var i2 = 0; i2 < r.length; i2++) q += J[a][i2] * J[b2][i2]; A[a].push(q); } for (var i3 = 0; i3 < r.length; i3++) g[a] += J[a][i3] * r[i3]; }
      var improved = false;
      for (var tries = 0; tries < 12; tries++) {
        var M = A.map(function (row, ri) { return row.map(function (v, ci) { return ri === ci ? v * (1 + lam) + 1e-9 : v; }); });
        var dx = solve(M, g.map(function (v) { return -v; })); if (!dx) { lam *= 10; continue; }
        var t3 = th.slice(); for (var k = 0; k < np; k++) t3[k] += dx[k];
        var r3 = resid(t3, samples);
        if (r3 && sse(r3) < cost) { th = t3; r = r3; cost = sse(r3); lam = Math.max(1e-9, lam / 3); improved = true; break; }
        lam *= 4;
      }
      if (!improved) break;
    }
    var res = samples.map(function (s, i) {
      var f = projectRay(s.az, s.el, { heading: s.heading + th[0], pitch: (s.pitch || 0) + th[1], vfov: s.vfov, tanScale: th[2], w: s.w, h: s.h }).f;
      var pr0 = projectRay(s.az, s.el, { heading: s.heading, pitch: s.pitch || 0, vfov: s.vfov, tanScale: 1, w: s.w, h: s.h });
      return { fitHorDeg: r[2 * i] / f / RAD, fitVerDeg: r[2 * i + 1] / f / RAD, rawHorDeg: pr0 ? (pr0.u - s.u) / pr0.f / RAD : null, rawVerDeg: pr0 ? (pr0.v - s.v) / pr0.f / RAD : null };
    });
    return { dHeadingDeg: th[0], dPitchDeg: th[1], tanScale: th[2], rmsPx: Math.sqrt(cost / Math.max(1, n)), residuals: res, fittedScale: fitK };
  }
  function solve(M, b) {   // Gaussin eliminointi
    var n = b.length, A = M.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-14) return null;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      for (var r2 = c + 1; r2 < n; r2++) { var f = A[r2][c] / A[c][c]; for (var k = c; k <= n; k++) A[r2][k] -= f * A[c][k]; }
    }
    var x = new Array(n);
    for (var i = n - 1; i >= 0; i--) { var sum = A[i][n]; for (var j = i + 1; j < n; j++) sum -= A[i][j] * x[j]; x[i] = sum / A[i][i]; }
    return x;
  }

  // Ohjeteksti avaimen luontiin (kolme riviä), käytetään aloitusnäytössä ja ohjeruudussa
  var HELP_LINES = [
    '1. Google Cloud -konsolissa (console.cloud.google.com) luo projekti, ota laskutus käyttöön ja ota käyttöön Maps JavaScript API.',
    '2. Luo API-avain (APIs & Services, Credentials) ja rajaa se HTTP-viittaajaan *.vercel.app/*.',
    '3. Liitä avain Google Maps -avain -kenttään. Avain tallentuu vain tämän selaimen muistiin.'
  ];

  // ---------- kirjaston lataus ----------
  var libPromise = null;
  function loadLibrary(key) {
    if (root.google && root.google.maps && root.google.maps.importLibrary) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var cb = '__googleMapsReady' + Date.now(), s = document.createElement('script');
      root[cb] = function () { try { delete root[cb]; } catch (e) { root[cb] = undefined; } resolve(); };
      root.gm_authFailure = function () {
        libPromise = null;
        reject(new Error('Google hylkäsi avaimen (gm_authFailure). Tarkista, että Maps JavaScript API on käytössä, laskutus on päällä ja avaimen viittaajarajaus sallii tämän osoitteen.'));
      };
      s.async = true;
      s.onerror = function () { libPromise = null; reject(new Error('Googlen Maps JavaScript API -kirjasto ei latautunut (verkko tai selaimen esto).')); };
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&loading=async&libraries=maps3d&callback=' + cb;
      document.head.appendChild(s);
    });
    return libPromise;
  }

  /* Ohjain. host = elementti, johon kartta lisätään (#v3), opts.onFail(syy) kutsutaan, kun näkymä ei aukea tai kaatuu,
   * opts.onStatus(teksti) kertoo tilan. active on tosi, kun Google-näkymä on valittuna (myös latauksen aikana).
   * Kartta luodaan kerran ja pidetään elossa: disable() vain piilottaa sen (display:none) ja enable() näyttää sen uudelleen ilman uutta latausta. */
  function create(host, opts) {
    opts = opts || {};
    var box = null, map = null, active = false, ready = false, seq = 0, lastMs = 0, steadyTimer = null, lib = null, building = false;
    var stats = { updates: 0, calls: 0, throttled: 0, last: null, loads: 0, shows: 0 };

    function status(t) { if (opts.onStatus) opts.onStatus(t); }
    function fail(msg) { var wasActive = active; active = false; destroy(); status(''); if (wasActive && opts.onFail) opts.onFail(msg); }

    function enable() {
      var key = getKey();
      if (!key && !map && !building) return { ok: false, reason: 'ei-avainta' };
      if (active) return { ok: true };
      active = true; stats.shows++;
      if (map && box) {            // kartta on jo luotu: näytetään vain uudelleen (ei uutta karttalatausta)
        box.style.display = '';
        status(ready ? 'Google 3D (testi)' : 'Google 3D: ladataan kuvaa');
        return { ok: true, reused: true };
      }
      if (building) { status('Google 3D: ladataan'); return { ok: true }; }
      building = true; ready = false; var my = ++seq;
      status('Google 3D: ladataan');
      box = document.createElement('div'); box.className = 'g3d-box'; box.setAttribute('aria-label', 'Google 3D -näkymä (testi)');
      host.insertBefore(box, host.firstChild);
      loadLibrary(key).then(function () { return root.google.maps.importLibrary('maps3d'); }).then(function (L) {
        if (my !== seq) return;
        lib = L;
        var c0 = opts.initial ? opts.initial() : null, cam = c0 ? camera(c0) : { lat: 61.5, lng: 23.77, altitude: SETTINGS.waterN2000M + SETTINGS.eyeStandM, range: SETTINGS.rangeM, heading: 0, tilt: SETTINGS.tiltDeg, fov: 45 };
        map = new L.Map3DElement({ center: { lat: cam.lat, lng: cam.lng, altitude: cam.altitude }, range: cam.range, tilt: cam.tilt, heading: cam.heading, fov: cam.fov, mode: 'SATELLITE', defaultUIHidden: true });
        stats.loads++; building = false;
        try { map.maxTilt = 90; } catch (e) {}
        map.style.cssText = 'display:block;width:100%;height:100%';
        map.addEventListener('gmp-error', function (ev) { if (my === seq) { var em = ev && ((ev.error && ev.error.message) || ev.message); fail('Google 3D -kartta ei alustunut' + (em ? ': ' + em : ' (gmp-error). Syynä voi olla avain, laskutus tai alue.')); } });
        map.addEventListener('gmp-steadychange', function (ev) { if (my === seq && ev && ev.isSteady) { ready = true; clearTimeout(steadyTimer); if (active) status('Google 3D (testi)'); } });
        box.appendChild(map);
        if (!active) box.style.display = 'none';
        else status('Google 3D: ladataan kuvaa');
        steadyTimer = setTimeout(function () { if (my === seq && active && !ready) status('Google 3D: ei vielä valmis 25 s kuluttua. Tarkista avain ja laskutus tai palaa omaan näkymään.'); }, SETTINGS.steadyTimeoutMs);
      }).catch(function (e) {
        building = false;
        if (my === seq) fail((e && e.message) ? e.message : 'Google 3D -näkymän lataus epäonnistui.');
      });
      return { ok: true };
    }
    // Piilotus: kartta pysyy elossa, mutta ei päivity eikä näy
    function disable() {
      active = false;
      if (box) box.style.display = 'none';
      status('');
    }
    // Hylkäys (vain virheessä): seuraava enable luo uuden kartan
    function destroy() {
      seq++; ready = false; building = false; clearTimeout(steadyTimer);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null; map = null;
    }
    // Kameran päivitys simulaattorin tilasta. p kuten camera()-funktiolla.
    function update(p, force) {
      if (!active || !map) return null;
      stats.calls++;
      var now = performance.now(); if (!force && now - lastMs < SETTINGS.minIntervalMs) { stats.throttled++; return null; }
      lastMs = now;
      var cal = getCalib(); p.altOffsetM = cal.altOffsetM;
      var c = camera(p);
      try {
        map.center = { lat: c.lat, lng: c.lng, altitude: c.altitude };
        map.heading = c.heading; map.tilt = c.tilt; map.range = c.range; map.fov = c.fov;
      } catch (e) { fail('Google 3D -kameran päivitys epäonnistui: ' + (e && e.message ? e.message : e)); return null; }
      stats.updates++; stats.last = c;
      return c;
    }
    return { enable: enable, disable: disable, destroy: destroy, update: update, isActive: function () { return active; }, isReady: function () { return ready; }, hasMap: function () { return !!map; }, loads: function () { return stats.loads; }, stats: function () { return stats; }, element: function () { return map; } };
  }

  var api = {
    SETTINGS: SETTINGS, HELP_LINES: HELP_LINES, CAL_TARGETS: CAL_TARGETS, camera: camera, getCalib: getCalib, setCalib: setCalib, viewAngles: viewAngles, projectRay: projectRay, fitCalibration: fitCalibration, vfovFromHfov: vfovFromHfov, metersPerDegLat: metersPerDegLat, metersPerDegLon: metersPerDegLon,
    offsetLatLon: offsetLatLon, moveAlong: moveAlong, getKey: getKey, fetchServerKey: fetchServerKey, hasServerKey: hasServerKey, setKey: setKey, create: create
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Google3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
