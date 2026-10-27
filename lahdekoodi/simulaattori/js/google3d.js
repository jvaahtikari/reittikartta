/* Simulaattori – Google 3D -näkymä (testi, vaihe 3m).
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
    altStore: 'sim.googleAltOffset'
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
    var c = moveAlong(eye.lat, eye.lon, look, range);
    var fov = clamp(p.vfovDeg != null ? p.vfovDeg : 45, S.fovMinDeg, S.fovMaxDeg);
    return { lat: c.lat, lng: c.lon, altitude: alt, range: range, heading: look, tilt: tilt, fov: fov, eye: { lat: eye.lat, lng: eye.lon, altitude: alt } };
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
   * opts.onStatus(teksti) kertoo tilan. active on tosi, kun Google-näkymä on valittuna (myös latauksen aikana). */
  function create(host, opts) {
    opts = opts || {};
    var box = null, map = null, active = false, ready = false, seq = 0, lastMs = 0, steadyTimer = null, lib = null;
    var stats = { updates: 0, calls: 0, throttled: 0, last: null };

    function status(t) { if (opts.onStatus) opts.onStatus(t); }
    function fail(msg) { var wasActive = active; disable(); if (wasActive && opts.onFail) opts.onFail(msg); }

    function enable() {
      var key = getKey();
      if (!key) return { ok: false, reason: 'ei-avainta' };
      if (active) return { ok: true };
      active = true; ready = false; var my = ++seq;
      status('Google 3D: ladataan');
      box = document.createElement('div'); box.className = 'g3d-box'; box.setAttribute('aria-label', 'Google 3D -näkymä (testi)');
      host.appendChild(box);
      loadLibrary(key).then(function () { return root.google.maps.importLibrary('maps3d'); }).then(function (L) {
        if (my !== seq || !active) return;
        lib = L;
        var c0 = opts.initial ? opts.initial() : null, cam = c0 ? camera(c0) : { lat: 61.5, lng: 23.77, altitude: SETTINGS.waterN2000M + SETTINGS.eyeStandM, range: SETTINGS.rangeM, heading: 0, tilt: SETTINGS.tiltDeg, fov: 45 };
        map = new L.Map3DElement({ center: { lat: cam.lat, lng: cam.lng, altitude: cam.altitude }, range: cam.range, tilt: cam.tilt, heading: cam.heading, fov: cam.fov, mode: 'SATELLITE', defaultUIHidden: true });
        try { map.maxTilt = 90; } catch (e) {}
        map.style.cssText = 'display:block;width:100%;height:100%';
        map.addEventListener('gmp-error', function (ev) { if (my === seq) var em = ev && ((ev.error && ev.error.message) || ev.message); fail('Google 3D -kartta ei alustunut' + (em ? ': ' + em : ' (gmp-error). Syynä voi olla avain, laskutus tai alue.')); });
        map.addEventListener('gmp-steadychange', function (ev) { if (my === seq && ev && ev.isSteady) { ready = true; clearTimeout(steadyTimer); status('Google 3D (testi)'); } });
        box.appendChild(map);
        status('Google 3D: ladataan kuvaa');
        steadyTimer = setTimeout(function () { if (my === seq && active && !ready) status('Google 3D: ei vielä valmis 25 s kuluttua. Tarkista avain ja laskutus tai palaa omaan näkymään.'); }, SETTINGS.steadyTimeoutMs);
      }).catch(function (e) {
        if (my === seq) fail((e && e.message) ? e.message : 'Google 3D -näkymän lataus epäonnistui.');
      });
      return { ok: true };
    }
    function disable() {
      active = false; ready = false; seq++; clearTimeout(steadyTimer);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null; map = null;
      status('');
    }
    // Kameran päivitys simulaattorin tilasta. p kuten camera()-funktiolla.
    function update(p, force) {
      if (!active || !map) return null;
      stats.calls++;
      var now = performance.now(); if (!force && now - lastMs < SETTINGS.minIntervalMs) { stats.throttled++; return null; }
      lastMs = now;
      p.altOffsetM = altOffset();
      var c = camera(p);
      try {
        map.center = { lat: c.lat, lng: c.lng, altitude: c.altitude };
        map.heading = c.heading; map.tilt = c.tilt; map.range = c.range; map.fov = c.fov;
      } catch (e) { fail('Google 3D -kameran päivitys epäonnistui: ' + (e && e.message ? e.message : e)); return null; }
      stats.updates++; stats.last = c;
      return c;
    }
    return { enable: enable, disable: disable, update: update, isActive: function () { return active; }, isReady: function () { return ready; }, stats: function () { return stats; }, element: function () { return map; } };
  }

  var api = {
    SETTINGS: SETTINGS, HELP_LINES: HELP_LINES, camera: camera, vfovFromHfov: vfovFromHfov, metersPerDegLat: metersPerDegLat, metersPerDegLon: metersPerDegLon,
    offsetLatLon: offsetLatLon, moveAlong: moveAlong, getKey: getKey, fetchServerKey: fetchServerKey, hasServerKey: hasServerKey, setKey: setKey, create: create
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Google3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
