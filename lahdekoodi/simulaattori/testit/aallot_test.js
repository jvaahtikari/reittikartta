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
console.log(fails ? 'VIRHEITÄ ' + fails : 'Kaikki aaltotestit läpi');
process.exit(fails ? 1 : 0);
