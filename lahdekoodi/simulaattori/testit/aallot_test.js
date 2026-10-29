/* Aaltomallin testit Nodessa (vaihe 4):  node testit/aallot_test.js
 * Kaavat (JONSWAP) ja pyyhkäisymatkan ruudukko keinotekoisella rannalla: maata pohjoisessa y > 1000 m ja pieni saari. */
'use strict';
const path = require('path');
let fails = 0;
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }
// three.js- ja Paikka-tynkä: ruutukoordinaatit = tosikoordinaatit
globalThis.THREE = { DataTexture: function (d, w, h) { this.image = { data: d, width: w, height: h }; }, LuminanceFormat: 0, UnsignedByteType: 0, LinearFilter: 0, ClampToEdgeWrapping: 0 };
globalThis.Paikka = { trueToGrid: function (d) { return d; } };
const A = require(path.join(__dirname, '..', 'js', 'aallot.js'));
function V2() { return { x: 0, y: 0, set(a, b) { this.x = a; this.y = b; } }; }

// 1. Kaavat
ehto('Hs 10 m/s, 5 km noin 0,36 m', Math.abs(A.waveHs(10, 5000) - 0.36) < 0.01, A.waveHs(10, 5000).toFixed(3));
ehto('Tp 10 m/s, 5 km noin 2,3 s', Math.abs(A.waveTp(10, 5000) - 2.3) < 0.1, A.waveTp(10, 5000).toFixed(2));
ehto('lyhyt pyyhkäisymatka antaa pienemmät aallot', A.waveHs(10, 300) < A.waveHs(10, 3000) / 2);
ehto('tyynellä ei aaltoja', A.waveHs(0, 5000) === 0);
ehto('täysin kehittynyt yläraja', A.waveHs(14, 1e9) <= 0.243 * 14 * 14 / 9.81 + 1e-9);

// 2. Ruudukko keinotekoisella rannalla
const land = (x, y) => y > 1000 || Math.hypot(x - 600, y + 300) < 120;   // pohjoisranta ja saari
const U = { uSeaTex: { value: null }, uSeaO: { value: V2() }, uSeaU: { value: V2() }, uSeaV: { value: V2() }, uSeaHalf: { value: 0 }, uSeaOn: { value: 0 }, uWaveAmp: { value: 1 } };
let sea = null;
const view = { uniforms: U, terrain: { heightAt: (x, y) => land(x, y) ? 5 : 0 }, setSea: o => { sea = o; } };
const W = A.create(view), S = A.SETTINGS, N = Math.round(2 * S.halfM / S.cellM);
function aja(st) { for (let i = 0; i < 40; i++) W.paivita(st, 0.1); }
function solu(x, y) {   // ruudukon arvo maailman pisteessä (sama kaava kuin varjostimessa)
  const dx = x - U.uSeaO.value.x, dz = -y - U.uSeaO.value.y;
  const u = (dx * U.uSeaU.value.x + dz * U.uSeaU.value.y) / (2 * S.halfM) + 0.5, v = (dx * U.uSeaV.value.x + dz * U.uSeaV.value.y) / (2 * S.halfM) + 0.5;
  const k = Math.floor(u * N), r = Math.floor(v * N); return U.uSeaTex.value.image.data[r * N + k] / 255 * S.ampMax;
}
// pohjoistuuli: alus 0,0 on 1000 m rannasta etelään
aja({ x: 0, y: 0, windFrom: 0, windSpeed: 10 });
ehto('pyyhkäisymatka pohjoistuulessa noin 1000 m', Math.abs(W.tila().fetch - 1000) <= 50, W.tila().fetch + ' m, Hs ' + W.tila().hs.toFixed(2) + ' m');
const lahella = solu(0, 920), kaukana = solu(0, -1000);
ehto('rannan suojassa aallot pienemmät kuin ulompana', lahella < kaukana * 0.5, 'rannan alla ' + lahella.toFixed(2) + ', 2 km rannasta ' + kaukana.toFixed(2));
const saarenTakana = solu(600, -500), saarenVieressa = solu(900, -500);
ehto('saaren suojapuolella tyynempää', saarenTakana < saarenVieressa, 'saaren takana ' + saarenTakana.toFixed(2) + ', vieressä ' + saarenVieressa.toFixed(2));
// eteläntuuli: avoin vesi 10 km
aja({ x: 0, y: 0, windFrom: 180, windSpeed: 10 });
ehto('eteläntuulessa pitkä pyyhkäisymatka', W.tila().fetch >= 9000, W.tila().fetch + ' m, Hs ' + W.tila().hs.toFixed(2) + ' m');
ehto('keinunta saa aallokon (setSea)', sea && sea.hs > 0.3 && Math.abs(((sea.toGrid % 360) + 360) % 360) < 1e-6, sea && ('Hs ' + sea.hs.toFixed(2) + ', suunta ' + sea.toGrid));

// 3. Merenkäynti ja liukuvarungon vaste (createMeri)
{
  const KN = 0.514444;
  function ajo(kn, from, hs, sek) {   // keula pohjoiseen, aallot suunnasta 'from' (0 = vasta, 180 = myötä, 90 = sivulta)
    const M = A.createMeri(), S = { x: 0, y: 0, hdg: 0, v: kn * KN, t: 0 }, r = { p: 0, r: 0, slams: 0, air: 0, fx: 0, n: 0 };
    const sea = { hs: hs, tp: A.waveTp(hs < 0.3 ? 6 : hs < 0.6 ? 10 : 13, 6000), toGrid: (from + 180) % 360 }; let edell = 0;
    for (let i = 0; i < sek * 10; i++) {
      S.t += 0.1; S.y += S.v * 0.1; const w = M.step(S, sea, 0.1);
      if (i > 100 && w) { r.p = Math.max(r.p, Math.abs(w.pitch)); r.r = Math.max(r.r, Math.abs(w.roll)); r.air += w.air ? 0.1 : 0; r.fx += S.waveFx; r.n++; if (w.slam > 1.5 && !edell) r.slams++; edell = w.slam > 1.5 ? 1 : 0; }
    }
    r.fx /= r.n; return r;
  }
  const pienet = ajo(30, 0, 0.2, 180), isot = ajo(30, 0, 0.8, 180);
  ehto('liu\'ussa lyhyt aallokko jää rungon alle', pienet.p < 3 && pienet.slams === 0, 'Hs 0,2 m, 30 kn: nyökkäys ' + pienet.p.toFixed(1) + '°, iskuja ' + pienet.slams);
  ehto('liu\'ussa iso vasta-aallokko heittää ilmaan ja iskee', isot.slams >= 2 && isot.air > 1, 'Hs 0,8 m, 30 kn: iskuja ' + isot.slams + ' / 3 min, ilmassa ' + isot.air.toFixed(1) + ' s');
  const hidasSivu = ajo(0, 90, 0.5, 180), nopeaSivu = ajo(30, 90, 0.5, 180);
  ehto('sivuaallokko kallistaa paikallaan enemmän kuin liu\'ussa', hidasSivu.r > 2 * nopeaSivu.r && hidasSivu.r < 15, 'paikallaan ' + hidasSivu.r.toFixed(1) + '°, 30 kn ' + nopeaSivu.r.toFixed(1) + '°');
  const v6 = ajo(6, 0, 0.5, 120), v30 = ajo(30, 0, 0.5, 120);
  ehto('vasta-aallokko hidastaa, liu\'ussa enemmän', v6.fx < 0 && v30.fx < v6.fx, '6 kn ' + (v6.fx / 1000).toFixed(1) + ' kN, 30 kn ' + (v30.fx / 1000).toFixed(1) + ' kN');
  // epäsäännöllisyys: aaltojen korkeudet vaihtelevat (nollan ylitysten välinen huipusta pohjaan)
  const M = A.createMeri(), S = { x: 0, y: 0, hdg: 0, v: 0, t: 0 }; M.step(S, { hs: 0.5, tp: 2.4, toGrid: 0 }, 0.1); M.state().hs = 0.5;
  const h = []; let mx = -1, mn = 1, ed = 0;
  for (let t = 0; t < 600; t += 0.05) { const e = M.eta(0, 0, t); mx = Math.max(mx, e); mn = Math.min(mn, e); if (ed < 0 && e >= 0) { h.push(mx - mn); mx = -1; mn = 1; } ed = e; }
  const ka = h.reduce((a, b) => a + b, 0) / h.length, sd = Math.sqrt(h.reduce((a, b) => a + (b - ka) * (b - ka), 0) / h.length), suurin = Math.max.apply(null, h);
  ehto('aallot ovat erikokoisia', sd > 0.25 * ka && suurin > 1.4 * 0.5 && suurin < 2.2 * 0.5, h.length + ' aaltoa, keskikorkeus ' + ka.toFixed(2) + ' m, hajonta ' + sd.toFixed(2) + ', suurin ' + suurin.toFixed(2) + ' m (Hs 0,5)');
  const M2 = A.createMeri(); M2.step(S, { hs: 0.5, tp: 2.4, toGrid: 0 }, 0.1); M2.state().hs = 0.5;
  ehto('sama meri molemmilla laitteilla (kiinteä siemen)', Math.abs(M.eta(12, 34, 56) - M2.eta(12, 34, 56)) < 1e-12);
}
console.log(fails ? 'VIRHEITÄ ' + fails : 'Kaikki aaltotestit läpi');
process.exit(fails ? 1 : 0);
