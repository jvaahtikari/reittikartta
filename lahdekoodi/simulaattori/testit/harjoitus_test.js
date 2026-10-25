// Harjoituksen automaattiohjauksen testi Nodessa: ajetaan harjoitus 1 ilman piirtoa samoilla komennoilla kuin käyttäjä.
'use strict';
const Paikka = require('../js/paikka.js'); global.Paikka = Paikka;
const Liike = require('../js/liike.js'); global.Liike = Liike;
const H = require('../js/harjoitus.js');
const KN = Liike.KN;
let fail = 0;
function ok(c, msg) { console.log((c ? 'OK    ' : 'VIRHE ') + msg); if (!c) fail++; }

const ex = H.EXERCISES.h1, route = H.buildRoute(ex);
const origin = { e: 331000, n: 6825700 }; Paikka.setOrigin(origin.e, origin.n);
console.log('reitti', Math.round(route.total), 'm, käännöksiä', route.turns.length, route.turns.map(t => t.no + ':' + Math.round(t.delta) + '°').join(' '));

function run(targetKn) {
  const p0 = Paikka.enToWorld(route.pts[0].e, route.pts[0].n);
  const ll = Paikka.worldToLonLat(p0.x, p0.y), conv = Paikka.convergenceDeg(ll.lon, ll.lat);
  const S = Liike.create({ x: p0.x, y: p0.y, hdg: route.legs[0].brg, conv: conv });
  const A = H.createAuto(route, targetKn, origin), R = H.createRecorder(route, origin);
  let acc = 0, steps = 0, maxDev = 0, maxRudder = 0;
  while (!A.done && S.t < 6000) {
    Liike.advance(S, 0.1); steps++;
    if (steps % 10 === 0) { const l = Paikka.worldToLonLat(S.x, S.y); S.conv = Paikka.convergenceDeg(l.lon, l.lat); }
    A.step(S);
    acc += 0.1; if (acc >= 0.5) { acc = 0; R.sample(S, null); }
    maxRudder = Math.max(maxRudder, Math.abs(S.rudder));
  }
  R.finished = A.done; R.t0 = 0;
  return { S, R, A, an: H.analyze(R, S) };
}
for (const kn of [30, 10]) {
  const t0 = Date.now(), r = run(kn), an = r.an;
  const expect = route.total / (kn * KN);
  console.log('--- ' + kn + ' kn: aika ' + H.mmss(an.timeSec) + ', odotus ' + H.mmss(expect) + ', matka ' + Math.round(an.distM) + ' m (reitti ' + Math.round(route.total) + '), keskinopeus ' + H.fmt1(an.avgKn) + ' kn, suurin poikkeama ' + Math.round(an.maxDev.m) + ' m, ajoaika ' + (Date.now() - t0) + ' ms');
  ok(r.A.done, kn + ' kn: harjoitus valmistuu');
  ok(Math.abs(an.timeSec / expect - 1) <= 0.10, kn + ' kn: aika vastaa matkaa jaettuna nopeudella +-10 % (suhde ' + (an.timeSec / expect).toFixed(3) + ')');
  ok(an.maxDev.m < 120, kn + ' kn: suurin poikkeama alle 120 m (' + an.maxDev.m.toFixed(0) + ' m)');
  an.turns.forEach(t => console.log('   käännös ' + t.no + ' ' + Math.round(t.delta) + '° alku ' + (t.startOffsetM == null ? '-' : Math.round(t.startOffsetM) + ' m') + ', lähin ohitus ' + (t.cutM == null ? '-' : Math.round(t.cutM) + ' m')));
  ok(an.turns.every(t => t.startOffsetM != null), kn + ' kn: jokaiselle käännökselle saatiin alkukohta');
  ok(an.cmdLog.length > 5, kn + ' kn: komentoloki syntyi (' + an.cmdLog.length + ' riviä)');
}
console.log(fail ? ('\n' + fail + ' VIRHETTÄ') : '\nKaikki harjoitustestit läpi');
process.exit(fail ? 1 : 0);
