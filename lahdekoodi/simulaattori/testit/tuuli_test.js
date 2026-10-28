/* Tuulimallin testit Nodessa (vaihe 4, kriteerit MAARITTELY_vaihe3m_google3d_tuuli.md kohta 3.3):  node testit/tuuli_test.js */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'liike.js'));
const E = require(path.join(__dirname, 'liike_ennen_tuuli.js'));   // liikemalli ennen tuulta (vertailu tyynellä)
const KN = L.KN;
let fails = 0;
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }
function aja(M, s, sek, h) { h = h || 0.02; for (let i = 0; i < Math.round(sek / h); i++) M.stepOnce(s, h); }
// alus pohjoiseen (tosisuunta 0), ruorimies pitää suunnan ja nopeuden
function alus(M, kn, from, ms) {
  const s = M.create({ hdg: 0, v: kn * KN, speedKn: kn, lever: kn ? M.leverForSpeed(kn * KN) : 0 });
  s.leverTrim = s.leverCmd; s.speedSense = kn;
  if (M.setWind) M.setWind(s, from, ms);
  return s;
}

// 1. Paikallaan 10 m/s sivutuulessa sorto 0,8 ... 1,5 kn 60 s jälkeen (tuuli idästä, sorto länteen)
{
  const s = alus(L, 0, 90, 10); aja(L, s, 60);
  const sorto = Math.abs(s.vs) / KN, keula = L.trueHdg(s);
  ehto('sorto paikallaan, sivutuuli 10 m/s, 60 s', sorto >= 0.8 && sorto <= 1.5, sorto.toFixed(2) + ' kn, sivunopeus ' + (s.vs < 0 ? 'vasemmalle (länteen)' : 'oikealle') + ', keula ' + keula.toFixed(1) + '° (ruorimies pitää suunnan 000)');
  ehto('sorto on myötätuuleen', s.vs < 0);
}
// 2. 20 kn ajossa 10 m/s sivutuuli: sorron kulma (COG - HDG) alle 3°
{
  const s = alus(L, 20, 90, 10); aja(L, s, 60);
  const d = L.wrap180(L.cogTrue(s) - L.trueHdg(s));
  ehto('sorron kulma 20 kn, sivutuuli 10 m/s', Math.abs(d) < 3 && Math.abs(d) > 0.2, d.toFixed(2) + '°, nopeus ' + (s.v / KN).toFixed(1) + ' kn');
}
// 3. Vastatuuli 10 m/s laskee 20 kn nopeutta alle 1 kn samalla vivulla (suora vipu), myötätuuli nostaa vähän
{
  const vipu = L.leverForSpeed(20 * KN);
  function suora(from, ms) { const s = L.create({ hdg: 0, v: 20 * KN, helmsman: false, lever: vipu }); L.setWind(s, from, ms); s.leverCmd = vipu; aja(L, s, 120); return s.v / KN; }
  const tyyni = suora(0, 0), vasta = suora(0, 10), myota = suora(180, 10);
  ehto('vastatuuli 10 m/s, 20 kn samalla vivulla', tyyni - vasta > 0 && tyyni - vasta < 1, tyyni.toFixed(2) + ' → ' + vasta.toFixed(2) + ' kn');
  ehto('myötätuuli 10 m/s nostaa nopeutta', myota > tyyni, myota.toFixed(2) + ' kn');
}
// 4. Tyynellä tulokset samat kuin ennen tuulimallia (sama käskysarja, sijainti, suunta ja nopeus)
{
  function sarja(M) {
    const s = alus(M, 0, 0, 0); const out = [];
    M.orderSpeed(s, 20); aja(M, s, 30); M.orderHeading(s, 45); aja(M, s, 30); M.orderSpeed(s, 6); M.orderHeading(s, 300); aja(M, s, 40);
    M.orderSpeed(s, -2); aja(M, s, 20); M.orderSpeed(s, 0); aja(M, s, 20);
    return [s.x, s.y, s.hdg, s.v, s.dist];
  }
  const a = sarja(L), b = sarja(E), ero = Math.max.apply(null, a.map((v, i) => Math.abs(v - b[i])));
  ehto('tyynellä identtinen aiempaan malliin', ero < 1e-9, 'suurin ero ' + ero.toExponential(1));
}
// 5. Paikallaan keula kääntyy tuulesta poispäin, kun ruorimies ei ohjaa (suora ohjaus, ruori 0)
{
  const s = L.create({ hdg: 0, helmsman: false }); L.setWind(s, 90, 10); aja(L, s, 5);
  ehto('keula kääntyy tuulesta poispäin (tuuli idästä, keula länteen)', s.rate < 0, 'kääntymisnopeus ' + s.rate.toFixed(2) + ' °/s');
}
// 6. Näennäinen tuuli: 20 kn vastatuulessa 10 m/s näennäinen noin 20,3 m/s suoraan edestä
{
  const s = alus(L, 20, 0, 10), a = L.apparentWind(s);
  ehto('näennäinen tuuli vastatuulessa', Math.abs(a.app - (10 + 20 * KN)) < 0.05 && (a.rel < 1 || a.rel > 359), a.app.toFixed(2) + ' m/s, suunta keulasta ' + a.rel.toFixed(0) + '°');
  const b = alus(L, 0, 90, 10), ab = L.apparentWind(b);
  ehto('näennäinen tuuli paikallaan oikealta', Math.abs(ab.rel - 90) < 1, ab.rel.toFixed(0) + '°');
}
console.log(fails ? 'VIRHEITÄ ' + fails : 'Kaikki tuulitestit läpi');
process.exit(fails ? 1 : 0);
