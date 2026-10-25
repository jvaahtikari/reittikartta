/* Simulaattori – paikka ja koordinaatit.
 *
 * Simulaation maailmakoordinaatisto on ETRS-TM35FIN (EPSG:3067) metrein, origo siirretty aluksen lähelle.
 * TM35FIN on Tampereen kohdalla lähes mittatarkka (mittakaavakerroin 1,0000 ± 0,0001), joten E ja N ovat
 * suoraan metrejä. Koordinaatisto on kuitenkin käännetty todelliseen pohjoiseen nähden meridiaanikonvergenssin
 * verran (Tampereella noin −2,85°), joten simulaation suunnat ovat ruutusuuntia. Näytölle ja plotterille
 * suunta muunnetaan todelliseksi suunnaksi funktiolla gridToTrue. Aineiston navigointilinjojen tosisuunta on
 * todellinen suunta. Vaiheen 1b siluettikuvien suunnat (piiput 99–104°, Näsinneula 239°) ovat ruutusuuntia.
 *
 * Korkeudet: z = 0 on järven pinta (LAKE_Z m N2000). Vaiheen 1 maastopaketissa järven pinta on 95,5 m
 * (0,5 m:n kvantisointi), vaiheen 1b pintamallin kuvauksessa 95,42 m. Käytetään pakettien yhteistä arvoa 95,5.
 *
 * Moduuli toimii selaimessa (window.Paikka) ja Nodessa (module.exports). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  // GRS80 ja TM35FIN
  var A = 6378137.0, F = 1 / 298.257222101, LON0 = 27 * RAD, K0 = 0.9996, FE = 500000, FN = 0;
  var n = F / (2 - F), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  var AA = A / (1 + n) * (1 + n2 / 4 + n4 / 64);
  var al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240];
  var be = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480];
  var de = [2 * n - 2 * n2 / 3 - 2 * n3, 7 * n2 / 3 - 8 * n3 / 5, 56 * n3 / 15];
  var LAKE_Z = 95.5;

  function lonlatToEN(lon, lat) {
    var phi = lat * RAD, dl = lon * RAD - LON0;
    var c = 2 * Math.sqrt(n) / (1 + n);
    var t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
    var xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    var E = eta, N = xi;
    for (var j = 1; j <= 3; j++) {
      E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    }
    return { e: FE + K0 * AA * E, n: FN + K0 * AA * N };
  }
  function enToLonLat(e, nn) {
    var xi0 = (nn - FN) / (K0 * AA), eta0 = (e - FE) / (K0 * AA), xi = xi0, eta = eta0;
    for (var j = 1; j <= 3; j++) {
      xi -= be[j - 1] * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
      eta -= be[j - 1] * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
    }
    var chi = Math.asin(Math.sin(xi) / Math.cosh(eta)), phi = chi;
    for (j = 1; j <= 3; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
    var lam = LON0 + Math.atan2(Math.sinh(eta), Math.cos(xi));
    return { lon: lam / RAD, lat: phi / RAD };
  }
  // Meridiaanikonvergenssi asteina: todellinen suunta = ruutusuunta + gamma
  function convergenceDeg(lon, lat) {
    return Math.atan(Math.tan(lon * RAD - LON0) * Math.sin(lat * RAD)) / RAD;
  }
  function norm360(b) { b = b % 360; return b < 0 ? b + 360 : b; }

  // Maailmakoordinaatiston origo (TM35FIN E, N)
  var origin = { e: 327000, n: 6823500 };
  function setOrigin(e, nn) { origin.e = e; origin.n = nn; }
  function getOrigin() { return { e: origin.e, n: origin.n }; }
  function enToWorld(e, nn) { return { x: e - origin.e, y: nn - origin.n }; }
  function worldToEN(x, y) { return { e: x + origin.e, n: y + origin.n }; }
  function lonlatToWorld(lon, lat) { var p = lonlatToEN(lon, lat); return { x: p.e - origin.e, y: p.n - origin.n }; }
  function worldToLonLat(x, y) { return enToLonLat(x + origin.e, y + origin.n); }

  // Ruutusuunta -> todellinen suunta paikassa (world x, y)
  function gridToTrue(hdg, x, y) {
    var ll = worldToLonLat(x, y);
    return norm360(hdg + convergenceDeg(ll.lon, ll.lat));
  }
  function trueToGrid(hdg, x, y) {
    var ll = worldToLonLat(x, y);
    return norm360(hdg - convergenceDeg(ll.lon, ll.lat));
  }

  // Web Mercator -ruutu (z, x, y) -> lon, lat pisteessä (u, v) ruudun sisällä (0..1, v alaspäin)
  function tileLonLat(z, x, y, u, v) {
    var nn = Math.pow(2, z);
    return {
      lon: (x + u) / nn * 360 - 180,
      lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v) / nn))) / RAD
    };
  }
  function lonlatToTile(lon, lat, z) {
    var nn = Math.pow(2, z), s = Math.sin(lat * RAD);
    return { x: (lon + 180) / 360 * nn, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * nn };
  }

  // Suunta ja etäisyys world-pisteestä toiseen: bearing ruutusuuntana (0 = pohjoinen, myötäpäivään)
  function bearing(x0, y0, x1, y1) { return norm360(Math.atan2(x1 - x0, y1 - y0) / RAD); }
  function dist(x0, y0, x1, y1) { return Math.hypot(x1 - x0, y1 - y0); }

  var api = {
    RAD: RAD, LAKE_Z: LAKE_Z, lonlatToEN: lonlatToEN, enToLonLat: enToLonLat, convergenceDeg: convergenceDeg,
    norm360: norm360, setOrigin: setOrigin, getOrigin: getOrigin, enToWorld: enToWorld, worldToEN: worldToEN,
    lonlatToWorld: lonlatToWorld, worldToLonLat: worldToLonLat, gridToTrue: gridToTrue, trueToGrid: trueToGrid,
    tileLonLat: tileLonLat, lonlatToTile: lonlatToTile, bearing: bearing, dist: dist
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Paikka = api;
})(typeof window !== 'undefined' ? window : globalThis);
