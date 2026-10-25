/* Liikemallin testit Nodessa:  node testit/liike_test.js */
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'liike.js'));
const KN = L.KN;
let fails = 0;
function check(nimi, arvo, odotus, tol) {
  const ok = Math.abs(arvo - odotus) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + ': ' + arvo.toFixed(2) + ' (odotus ' + odotus + ' ± ' + tol + ')');
}
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }
function aja(s, sek, dt) { const h = dt || 0.02; for (let i = 0; i < Math.round(sek / h); i++) L.stepOnce(s, h); }
function suora(v) { const s = L.create({ helmsman: false }); if (v) s.v = v * KN; return s; }    // ruori ja vipu asetetaan suoraan
function vipu(s, x) { s.leverCmd = x; }
const wrap = L.wrap180;

// 1. Voimamalli: huippunopeus, matkanopeus, crash stop
{
  const s = suora(); vipu(s, 1); aja(s, 240, 0.02);
  check('huippunopeus täydellä vivulla, kn', s.v / KN, 35, 0.3);
  check('28 kn:n pitävä vipu, %', L.leverForSpeed(28 * KN) * 100, 73, 3);
  const b = suora(20); vipu(b, 0.73); aja(b, 120, 0.02);
  check('28 kn:n lähellä 73 % vivulla liu\'ussa, kn', b.v / KN, 28, 0.8);
  const r = L.crashStopDistance(28);
  check('crash stop 28 kn:sta, matka m', r.dist, 40, 3);
  console.log('      crash stop aika ' + r.time.toFixed(1) + ' s');
}
// 2. Liukukynnys ja hystereesi (suora vipu)
{
  const a = suora(); vipu(a, 0.5); aja(a, 200, 0.02);
  ehto('50 % vipu paikaltaan jää uppoumanopeuteen', a.v / KN < 12.5, (a.v / KN).toFixed(1) + ' kn');
  const b = suora(); vipu(b, 0.7); aja(b, 200, 0.02);
  ehto('70 % vipu ylittää liukukynnyksen', b.v / KN > 25, (b.v / KN).toFixed(1) + ' kn');
  const c = suora(28); vipu(c, 0.5); aja(c, 200, 0.02);
  ehto('liu\'ussa 50 % vipu pitää veneen liu\'ussa (hystereesi)', c.v / KN > 15, (c.v / KN).toFixed(1) + ' kn');
  const d = suora(28); vipu(d, 0.4); aja(d, 200, 0.02);
  ehto('liu\'ussa 40 % vipu pudottaa veneen uppoumanopeuteen', d.v / KN < 12.5, (d.v / KN).toFixed(1) + ' kn');
  const e = suora(); vipu(e, 1); let t = 0; while (e.v / KN < 28 && t < 200) { L.stepOnce(e, 0.01); t += 0.01; }
  console.log('      kiihtyvyys 0 -> 28 kn täydellä vivulla ' + t.toFixed(1) + ' s');
}
// 3. Simuloitu ruorimies: nopeuskäskyt
function nopeusKoe(kn, sek, alku) {
  const s = L.create(); if (alku) { s.v = alku * KN; s.speedSense = alku; s.hmSpeedKn = alku; s.orderSpeedKn = alku; s.leverCmd = L.leverForSpeed(alku * KN); s.leverTrim = s.leverCmd; }
  L.orderSpeed(s, kn); const lo = []; const h = 0.02;
  for (let i = 0; i < Math.round(sek / h); i++) { L.stepOnce(s, h); lo.push(s.v / KN); }
  return { s, lo };
}
{
  for (const kn of [6, 20, 28, 35]) {
    const r = nopeusKoe(kn, 180);
    const loppu = r.lo.slice(-500);   // viimeiset 10 s
    check('nopeuskäsky ' + kn + ' kn paikaltaan, nopeus 180 s kuluttua, kn', r.s.v / KN, kn, kn >= 28 ? 0.8 : 0.7);
    const vaihtelu = Math.max(...loppu) - Math.min(...loppu);
    ehto('nopeuskäsky ' + kn + ' kn: vaihtelu viimeisten 10 s aikana alle 1 kn', vaihtelu < 1, vaihtelu.toFixed(2) + ' kn');
  }
  for (const [kn, hakee] of [[10, false], [12, false], [15, true], [16, true], [18, false]]) {
    const k = nopeusKoe(kn, 300), loppu = k.lo.slice(-3000), min = Math.min(...loppu), max = Math.max(...loppu);
    ehto('nopeuskäsky ' + kn + ' kn (liukukynnys): viimeisten 60 s vaihteluväli ' + min.toFixed(1) + ' ... ' + max.toFixed(1) + ' kn', hakee ? (max - min) > 2 : (max - min) < 1, hakee ? 'vene hakee' : 'pysyy');
  }
  const alas = nopeusKoe(10, 90, 28);
  ehto('liu\'usta 28 kn nopeuskäsky 10 kn: asettuu uppoumanopeuteen', Math.abs(alas.s.v / KN - 10) < 1.2, (alas.s.v / KN).toFixed(1) + ' kn');
  const peru = nopeusKoe(-4, 60); ehto('peruutus hidas: nopeus noin -4 kn', Math.abs(peru.s.v / KN + 4) < 0.8, (peru.s.v / KN).toFixed(1) + ' kn');
  // nopeuskäsky nollaan pysäyttää
  const st = nopeusKoe(0, 90, 20); ehto('nopeuskäsky 0 pysäyttää 90 s:ssa', st.s.v / KN < 0.3, (st.s.v / KN).toFixed(2) + ' kn');
}
// 4. Käskyviive ja komentoloki
{
  const s = L.create({ hdg: 0, conv: 0 }); L.orderHeading(s, 30);
  aja(s, 0.7, 0.01); ehto('suuntakäsky ei vielä toteudu 0,7 s:ssa', s.hmHdg === 0);
  aja(s, 0.2, 0.01); ehto('suuntakäsky toteutuu 0,8 s:n jälkeen', s.hmHdg === 30);
  const u = L.create({ hdg: 123, conv: 0 }); ehto('alkusuunta käsketty suunta 123', u.orderHdg === 123);
  L.stepHeadingOrder(u, 1); L.stepHeadingOrder(u, -1, true); check('suuntakäsky +5 ja -10 asteen askel', u.orderHdg, 118, 0);
  L.toggleGentle(u); L.orderHeading(u, 100); ehto('loiva-merkintä kuluu suuntakäskyyn', !u.gentleNext && u.cmdLog[u.cmdLog.length - 1].gentle === true);
  L.stepSpeedOrder(u, 1); L.stepSpeedOrder(u, 1); check('nopeuskäsky kaksi painallusta ylös', u.orderSpeedKn, 4, 0);
  L.stepSpeedOrder(u, -1); L.stepSpeedOrder(u, -1); L.stepSpeedOrder(u, -1); check('nopeuskäsky ei mene alle nollan', u.orderSpeedKn, 0, 0);
  ehto('tekstit', L.headingText(47) === 'Suunta 047' && L.headingText(5) === 'Suunta 005' && L.speedText(12) === 'Nopeus 12 kn' && L.speedText(-4) === 'Peruutus hidas', L.headingText(47) + ' / ' + L.speedText(12));
  ehto('komentoloki aikaleimoin', u.cmdLog.every(c => typeof c.t === 'number' && c.kind), u.cmdLog.map(c => c.kind + '=' + c.value).join(' '));
}
// 5. Simuloitu ruorimies: suuntakäskyt
function kaannosKoe(nopeusKn, delta, loiva) {
  const s = L.create({ hdg: 0, conv: 0, v: nopeusKn * KN, speedKn: nopeusKn }); s.leverCmd = L.leverForSpeed(nopeusKn * KN); s.leverTrim = s.leverCmd; s.speedSense = nopeusKn;
  s.rate = 0; let h = s.hdg; const tgt = (h + delta + 360) % 360;
  if (loiva) L.toggleGentle(s); L.orderHeading(s, tgt);
  let maxRudder = 0, maxOver = 0, t0 = null, t1 = null, t = 0;
  for (let i = 0; i < 20000; i++) {
    L.stepOnce(s, 0.01); t += 0.01; maxRudder = Math.max(maxRudder, Math.abs(s.rudder));
    const e = wrap(tgt - s.hdg), signedOver = delta > 0 ? -e : e;   // ylitys: positiivinen kun suunta on mennyt käskyn ohi
    maxOver = Math.max(maxOver, signedOver);
    if (t0 === null && Math.abs(s.rate) > 0.2) t0 = t;
    if (Math.abs(e) < 1.0 && Math.abs(s.rate) < 0.5) { t1 = t; break; }
  }
  return { s, maxRudder, maxOver, t0, t1, t };
}
{
  for (const [kn, d, loiva] of [[20, 30, false], [20, 30, true], [28, 60, false], [10, -45, false]]) {
    const r = kaannosKoe(kn, d, loiva);
    const rudDeg = r.maxRudder * L.SETTINGS.rudderMaxDeg;
    ehto('käännös ' + d + '° ' + kn + ' kn' + (loiva ? ' loiva' : '') + ': valmis ' + r.t.toFixed(1) + ' s, suurin ruori ' + rudDeg.toFixed(1) + '°, ylitys ' + r.maxOver.toFixed(1) + '°',
      r.t1 !== null && rudDeg <= (loiva ? 7.5 : 15.5) && r.maxOver < 3, '');
  }
}
// 6. Kääntösäde ja paikallaan kääntyminen (suora ruori)
for (const [kn, R] of [[5, 12], [30, 70]]) {
  const s = suora(kn); vipu(s, L.leverForSpeed(kn * KN)); s.leverCmd = L.leverForSpeed(kn * KN); s.rudderCmd = 1; s.rudder = 1;
  aja(s, 5, 0.01);
  let kulma = 0, hPrev = s.hdg; const pts = [];
  for (let i = 0; i < 6000 && kulma < 359; i++) {
    L.stepOnce(s, 0.01); let dh = s.hdg - hPrev; if (dh < -180) dh += 360; if (dh > 180) dh -= 360; kulma += dh; hPrev = s.hdg; pts.push([s.x, s.y]);
  }
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  let r = 0; for (const p of pts) r += Math.hypot(p[0] - cx, p[1] - cy); r /= pts.length;
  check('kääntösäde ' + kn + ' kn:ssa täydellä ruorilla, m', r, R, 0.08 * R);
}
{
  const s = suora(); s.rudderCmd = 1; aja(s, 4, 0.01);
  check('kääntymisnopeus paikallaan täydellä ruorilla, °/s', s.rate, 10, 0.05);
}
// 7. Trimmi sidottu liukukynnykseen
{
  let best = 0, bestKn = 0;
  for (let kn = 0; kn <= 35; kn += 0.5) { const t = L.trimTarget(kn * KN); if (t > best) { best = t; bestKn = kn; } }
  ehto('trimmin huippu on liukukynnyksellä 10-14 kn', bestKn >= 10 && bestKn <= 14, best.toFixed(1) + '° ' + bestKn + ' kn');
  check('trimmi 28 kn:ssa, °', L.trimTarget(28 * KN), 2.5, 0.01);
  check('trimmi 35 kn:ssa, °', L.trimTarget(35 * KN), 2.5, 0.01);
}
// 8. Kallistus ja matka
{
  const s = suora(28); s.leverCmd = L.leverForSpeed(28 * KN); s.rudderCmd = 1; aja(s, 8, 0.02);
  check('kallistus täydessä käännöksessä 28 kn:ssa, °', s.roll, 8, 0.3);
  const q = suora(30); q.hdg = 90; q.leverCmd = L.leverForSpeed(30 * KN); aja(q, 60, 0.02);
  check('matka 60 s:ssa 30 kn:lla, m', q.dist, 30 * KN * 60, 8);
}
// 9. Crash stop ruorimiehen kanssa
{
  const s = L.create({ v: 28 * KN, speedKn: 28 }); s.leverCmd = L.leverForSpeed(28 * KN); s.leverTrim = s.leverCmd; s.speedSense = 28; const d0 = s.dist;
  L.crashStop(s); aja(s, 20, 0.005);
  check('crash stop ruorimiehen kanssa, matka m', s.dist - d0, 40, 3.5);
  ehto('crash stopin jälkeen nopeuskäsky 0 ja vene seisoo', s.v === 0 && s.orderSpeedKn === 0 && !s.crashActive);
}
console.log(fails ? ('\n' + fails + ' testiä epäonnistui') : '\nKaikki liikemallin testit läpi');
process.exit(fails ? 1 : 0);
