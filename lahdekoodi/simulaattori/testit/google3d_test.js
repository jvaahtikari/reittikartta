/* Google 3D -näkymän kameralaskennan yksikkötesti Nodessa:  node testit/google3d_test.js
 * Annetaan aluksen sijainti ja suunta ja tarkistetaan kameran lat, lon, korkeus, heading ja tilt (0,00001° ja 0,1 m). Googlen palvelimia ei tarvita. */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'google3d.js'));
const P = require(path.join(__dirname, '..', 'js', 'paikka.js'));
const RAD = Math.PI / 180;
let fails = 0;
function check(nimi, arvo, odotus, tol, yks) {
  const ok = Math.abs(arvo - odotus) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + ': ' + arvo.toFixed(6) + ' (odotus ' + odotus.toFixed(6) + ' ± ' + tol + (yks ? ' ' + yks : '') + ')');
}
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }

// Riippumaton vertailu: WGS84-ellipsoidin kaarevuussäteet suljetussa muodossa
const A = 6378137, E2 = 0.00669437999014;
function radii(latDeg) { const s = Math.sin(latDeg * RAD), w = Math.sqrt(1 - E2 * s * s); return { M: A * (1 - E2) / (w * w * w), N: A / w }; }
function expectMove(lat, lon, brgDeg, d) {
  const r = radii(lat), b = brgDeg * RAD;
  return { lat: lat + d * Math.cos(b) / r.M / RAD, lon: lon + d * Math.sin(b) / (r.N * Math.cos(lat * RAD)) / RAD };
}
// Haversine-etäisyys ja alkusuunta pallolla (säde: paikallinen keskimääräinen säde), kunhan matka on lyhyt
function haversine(lat1, lon1, lat2, lon2) {
  const r = radii(lat1), R = Math.sqrt(r.M * r.N), f1 = lat1 * RAD, f2 = lat2 * RAD, dl = (lon2 - lon1) * RAD, df = f2 - f1;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(a));
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return { d, brg: ((Math.atan2(y, x) / RAD) + 360) % 360 };
}

const S = G.SETTINGS;
// Aloituspaikka: Mustalahti (TM35FIN 327184, 6823553)
const ll = P.enToLonLat(327184, 6823553);
console.log('Mustalahti lat ' + ll.lat.toFixed(6) + ' lon ' + ll.lon.toFixed(6));

// 1. Katse suoraan eteen, suunta 350° (tosisuunta), silmäpiste kääntöpisteen edessä ja vasemmalla
{
  const c = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 350, lookDeg: 0, vfovDeg: 45 });
  // silmäpiste: 1,1 m eteen ja 0,75 m vasemmalle (SB-positiivinen -0,75)
  const hr = 350 * RAD;
  const eE = Math.sin(hr) * S.eyeFwdM + Math.cos(hr) * S.eyeStbdM, eN = Math.cos(hr) * S.eyeFwdM - Math.sin(hr) * S.eyeStbdM;
  const eyeExp = { lat: ll.lat + eN / radii(ll.lat).M / RAD, lon: ll.lon + eE / (radii(ll.lat).N * Math.cos(ll.lat * RAD)) / RAD };
  check('silmäpiste lat', c.eye.lat, eyeExp.lat, 0.00001, '°');
  check('silmäpiste lon', c.eye.lng, eyeExp.lon, 0.00001, '°');
  const ce = expectMove(eyeExp.lat, eyeExp.lon, 350, S.rangeM);
  check('keskipiste lat', c.lat, ce.lat, 0.00001, '°');
  check('keskipiste lon', c.lng, ce.lon, 0.00001, '°');
  check('korkeus m (95,5 + 2,72)', c.altitude, 95.5 + 2.72, 0.1, 'm');
  check('heading', c.heading, 350, 0.01, '°');
  check('tilt', c.tilt, 90, 0.01, '°');
  check('range', c.range, S.rangeM, 0.01, 'm');
  check('fov', c.fov, 45, 0.01, '°');
  // Kamera (keskipiste miinus range katseen suunnassa) on silmäpisteessä: etäisyys silmästä keskipisteeseen on range ja suunta heading
  const h = haversine(c.eye.lat, c.eye.lng, c.lat, c.lng);
  check('silmästä keskipisteeseen etäisyys m', h.d, S.rangeM, 0.1, 'm');
  check('silmästä keskipisteeseen suunta', h.brg, 350, 0.05, '°');
}
// 2. Katseen kääntö: 60° vasemmalle suunnasta 107° antaa headingin 47°, ja istuen korkeus on pienempi
{
  const c = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 107, lookDeg: -60, vfovDeg: 60, seated: true });
  check('heading 107 - 60', c.heading, 47, 0.01, '°');
  check('korkeus istuen m (95,5 + 2,67)', c.altitude, 95.5 + 2.67, 0.1, 'm');
  const h = haversine(c.eye.lat, c.eye.lng, c.lat, c.lng);
  check('suunta silmästä keskipisteeseen', h.brg, 47, 0.05, '°');
  // silmäpiste ei riipu katseesta
  const c0 = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 107, lookDeg: 0, vfovDeg: 60, seated: true });
  check('silmäpiste ei muutu katseen mukana (lat)', c.eye.lat, c0.eye.lat, 1e-9);
  check('silmäpiste ei muutu katseen mukana (lon)', c.eye.lng, c0.eye.lng, 1e-9);
}
// 3. Suunnan kierto yli 360° ja negatiivinen katse
{
  const c = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 20, lookDeg: -60, vfovDeg: 45 });
  check('heading 20 - 60 = 320', c.heading, 320, 0.01, '°');
  const d = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 350, lookDeg: 30, vfovDeg: 45 });
  check('heading 350 + 30 = 20', d.heading, 20, 0.01, '°');
}
// 4. Kuvakulma: rajaus 5 ... 80 asteeseen ja vaakakulman muunnos
{
  check('fov kiikarissa rajautuu 5 asteeseen', G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 0, vfovDeg: 3.9 }).fov, 5, 0.001, '°');
  check('fov rajautuu 80 asteeseen', G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 0, vfovDeg: 95 }).fov, 80, 0.001, '°');
  check('vaakakulma 100° kuvasuhteella 16:9 antaa pystykulman', G.vfovFromHfov(100, 16 / 9), 67.6, 0.2, '°');
}
// 5. Muu sijainti (Siilinkari, TM35FIN 327895, 6824881) ja eri suunnat: etäisyys ja suunta täsmäävät
for (const [e, n, brg] of [[327895, 6824881, 100], [328010, 6823830, 112], [327330, 6824000, 182], [326000, 6822000, 275]]) {
  const q = P.enToLonLat(e, n), c = G.camera({ lat: q.lat, lon: q.lon, hdgTrue: brg, lookDeg: 0, vfovDeg: 45 });
  const h = haversine(c.eye.lat, c.eye.lng, c.lat, c.lng);
  check('(' + e + ', ' + n + ') suunta ' + brg + ': etäisyys silmästä keskipisteeseen m', h.d, S.rangeM, 0.1, 'm');
  check('(' + e + ', ' + n + ') suunta ' + brg + ': suunta', h.brg, brg, 0.05, '°');
  const ce = expectMove(c.eye.lat, c.eye.lng, brg, S.rangeM);
  check('(' + e + ', ' + n + ') keskipiste lat', c.lat, ce.lat, 0.00001, '°');
  check('(' + e + ', ' + n + ') keskipiste lon', c.lng, ce.lon, 0.00001, '°');
}
// 6. Kääntöpisteen ja silmäpisteen etäisyys on sama kuin asetus (1,1 m eteen, 0,75 m sivulle)
{
  const c = G.camera({ lat: ll.lat, lon: ll.lon, hdgTrue: 0, vfovDeg: 45 });
  const h = haversine(ll.lat, ll.lon, c.eye.lat, c.eye.lng);
  check('silmäpisteen etäisyys kääntöpisteestä m', h.d, Math.hypot(S.eyeFwdM, S.eyeStbdM), 0.02, 'm');
}
// 7. Avain: ilman localStoragea (Node) funktiot eivät kaadu
{
  ehto('getKey ilman muistia palauttaa tyhjän', G.getKey() === '');
  ehto('setKey ilman muistia ei kaadu', G.setKey('  ') === '');
  ehto('ohje kertoo, että avain tulee Vercelistä', G.HELP_LINES.length === 2 && /GOOGLE_API/.test(G.HELP_LINES[0]));
}
console.log(fails ? ('\n' + fails + ' testiä epäonnistui') : '\nKaikki Google 3D -laskennan testit läpi');
process.exit(fails ? 1 : 0);
