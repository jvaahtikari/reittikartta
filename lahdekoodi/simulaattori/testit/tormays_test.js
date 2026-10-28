/* Vaihe 3k: törmäysmoduulin Node-testi. Synteettiset esteet (laituri, aallonmurtaja, kivi, sillan pilari, monikulmio) ja oikea aineisto
 * (Naistenlahden laiturit, paketin palvelin portissa 8144, osoite PAKETTI-ympäristömuuttujalla). Mittaa myös tarkistuksen keston.
 * Ajo: node testit/tormays_test.js */
'use strict';
const path = require('path'), fs = require('fs');
const js = (f) => path.join(__dirname, '..', 'js', f);
globalThis.THREE = require(path.join(__dirname, '..', 'lib', 'three.min.js'));
const pmSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'pmtiles.js'), 'utf8');
globalThis.pmtiles = new Function(pmSrc + '; return pmtiles;')();
globalThis.Paikka = require(js('paikka.js')); globalThis.Mvt = require(js('mvt.js')); globalThis.Aineisto = require(js('aineisto.js'));
Aineisto.setBase(process.env.PAKETTI || 'http://127.0.0.1:8144/');
globalThis.Laiturit3D = require(js('laiturit3d.js'));
globalThis.Sillat3D = require(js('sillat3d.js'));
const T = require(js('tormays.js'));
const KN = 1852 / 3600;
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'OK    ' : 'VIRHE ') + m); };
const f = (x, d) => x.toFixed(d === undefined ? 2 : d).replace('.', ',');

// Paikallinen origo: E 328000, N 6823000, alus S.x = E - 328000
const O = { e: 328000, n: 6823000 };
Paikka.setOrigin(O.e, O.n);
const at = (e, n, hdg, vKn) => ({ x: e - O.e, y: n - O.n, hdg: hdg, v: (vKn || 0) * KN, rate: 0 });

(async () => {
  // 1. Runkopolygoni
  const H = T.hullPolygon();
  let xmin = 1e9, xmax = -1e9, ymax = 0; for (const p of H) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymax = Math.max(ymax, Math.abs(p[1])); }
  console.log('runko: x ' + f(xmin) + ' ... ' + f(xmax) + ' m (kääntöpisteestä), puolileveys ' + f(ymax) + ' m, kärkiä ' + H.length);
  ok(Math.abs((xmax - xmin) - 13.52) < 0.1 && Math.abs(ymax * 2 - 4.41) < 0.05, 'runko 13,5 m x 4,4 m');
  ok(Math.abs(xmax - 7.257) < 0.01, 'keula 7,26 m kääntöpisteen edessä');

  // 2. Suorakulmio (laituri 2 m): pystysuora laituri E = 328000, N 6823100 ... 6823200, vene ajaa etelästä pohjoiseen (hdg 0) ja osuu laiturin päähän
  T.clear();
  T.addItems('*', { segs: [{ k: 'narrow', e0: 328000, n0: 6823100, e1: 328000, n1: 6823200, xa: false, xb: false, cutA: false, cutB: false }], polys: [], rocks: [] });
  // 2a: lähestyminen päähän 6 kn: kun runko ensi kerran osuu, alus on pysäytettävä edelliseen asentoon (tunkeuma 0)
  function aja(e, n, hdg, kn, dt, step) {   // palauttaa { hit, prev, step } ensimmäisestä osumasta
    const S = at(e, n, hdg, kn), sgn = kn < 0 ? -1 : 1, a = hdg * Math.PI / 180;
    let prev = { x: S.x, y: S.y, hdg: S.hdg }, k = 0;
    for (; k < 8000; k++) {
      S.x += Math.sin(a) * S.v * dt; S.y += Math.cos(a) * S.v * dt;
      const h = T.resolve(S, prev);
      if (h) return { hit: h, prev: prev, S: S, k: k, sgn: sgn };
      prev = { x: S.x, y: S.y, hdg: S.hdg };
    }
    return null;
  }
  let r = aja(328000, 6823000, 0, 6, 0.1);
  ok(r && r.hit.type === 'tormays', '6 kn laiturin päähän: törmäys (nopeus ' + (r && f(r.hit.kn, 1)) + ' kn, laji ' + (r && r.hit.kind) + ')');
  // runko ei saa olla yli 1 m esteen sisällä: tarkistetaan, että pysäytetty asento on törmäämätön ja keula on enintään askeleen verran päässä
  const gapEnd = r ? (6823100 - (r.S.y + O.n + 7.257)) : 99;
  ok(r && !T.check({ x: r.S.x, y: r.S.y, hdg: r.S.hdg, v: 0 }) && gapEnd >= 0 && gapEnd < 0.4, 'pysäytetty asento ei ole esteessä, keulan etäisyys laiturin päästä ' + f(gapEnd) + ' m');
  ok(r && r.S.v === 0, 'nopeus nollattu');
  r = aja(328000, 6823000, 0, 0.8, 0.1);
  ok(r && r.hit.type === 'kosketus', '0,8 kn laiturin päähän: kosketus (' + (r && f(r.hit.kn, 2)) + ' kn)');
  r = aja(328000, 6823000, 0, 0.99, 0.1); ok(r && r.hit.type === 'kosketus', '0,99 kn: kosketus');
  r = aja(328000, 6823000, 0, 1.01, 0.1); ok(r && r.hit.type === 'tormays', '1,01 kn: törmäys');
  // 2b: sivuttain: vene ajaa itään kohti laiturin kylkeä (hdg 90), laituri on kulkusuuntaa vasten
  r = aja(327950, 6823150, 90, 4, 0.1);
  ok(r && r.hit.type === 'tormays' && r.hit.kind === 'laituri', 'sivuttain laiturin kylkeen 4 kn: törmäys, laji laituri');
  const gapSide = r ? (328000 - 1 - (r.S.x + O.e + 7.257)) : 99;   // laiturin länsireuna x = 327999
  ok(r && Math.abs(gapSide) < 0.5, 'keulan etäisyys laiturin reunasta ' + f(gapSide) + ' m');
  // 2c: peruutus: perä edellä laiturin päähän (hdg 180, nopeus negatiivinen). Perä on uimataso x = -6,26 kääntöpisteestä
  r = aja(328000, 6823300, 0, -3, 0.1);
  ok(r && r.hit.type === 'tormays', 'perä edellä laiturin päähän 3 kn: törmäys (' + (r && f(r.hit.kn, 1)) + ' kn)');
  // 2d: laiturin ohi vierestä ei osu: alus ajaa 3 m:n etäisyydellä laiturin vierestä
  r = aja(328003.6, 6823000, 0, 6, 0.1);   // laiturin itäreuna 328001, rungon puolileveys 2,21 m -> 0,39 m väli
  ok(r === null, 'ohitus 1,4 m:n välillä ei osu');
  r = aja(328003.3, 6823000, 0, 6, 0.1);   // laiturin itäreuna 328001, rungon reuna 328001,09 -> 0,09 m ohi
  ok(r === null, 'ohitus 0,09 m:n välillä ei osu');
  r = aja(328002.1, 6823000, 0, 6, 0.1);   // väli -0,1 m
  ok(r && r.hit.type === 'tormays', 'ohitus 0,1 m:n päällekkäisyydellä osuu (runko 2,2 m + laituri 1 m)');

  // 3. Jatke (xa, xb): ketjun jatko-osa jatkuu puolen leveyden verran. Kaksi laiturin osaa kulmassa, kulma täyttyy
  T.clear();
  T.addItems('*', { segs: [
    { k: 'narrow', e0: 328000, n0: 6823100, e1: 328000, n1: 6823200, xa: false, xb: true, cutA: false, cutB: false },
    { k: 'narrow', e0: 328000, n0: 6823200, e1: 328050, n1: 6823200, xa: true, xb: false, cutA: false, cutB: false }], polys: [], rocks: [] });
  r = aja(327990, 6823190, 90, 3, 0.1);   // lähestyy kulmaa idästä länteen? Ajetaan kulman länsipuolelta itään osuen osuuden 1 kylkeen
  ok(r && r.hit.type === 'tormays', 'kulmaosuus: osuu ketjun kulmaan');
  // kulman ulkopuolella oleva piste (E 328000.9, N 6823200.9) kuuluu jatkeeseen
  const ob = T.buildTile({ segs: [{ k: 'narrow', e0: 0, n0: 0, e1: 0, n1: 10, xa: false, xb: true }] })[0];
  ok(Math.abs(ob.a - 5.5) < 1e-9 && Math.abs(ob.b - 1) < 1e-9 && Math.abs(ob.cy - 5.5) < 1e-9, 'jatke xb: puolipituus 5,5 ja keskipiste 5,5 (laiturit3d.js:n box-geometria)');

  // 4. Aallonmurtaja 4 m, vesikivi 0,75 m säde
  T.clear();
  T.addItems('*', { segs: [{ k: 'break', e0: 328000, n0: 6823100, e1: 328040, n1: 6823100, xa: false, xb: false, cutA: false, cutB: false }], polys: [], rocks: [{ e: 328100, n: 6823100, k: 'vesikivi_pinnassa' }] });
  r = aja(328020, 6823000, 0, 3, 0.1);
  ok(r && r.hit.kind === 'aallonmurtaja' && r.hit.type === 'tormays', 'aallonmurtajaan 3 kn: törmäys, laji aallonmurtaja');
  const gapB = r ? (6823100 - 2 - (r.S.y + O.n + 7.257)) : 99; ok(r && gapB >= 0 && gapB < 0.4, 'aallonmurtajan reunan (4 m leveä) etäisyys keulasta ' + f(gapB) + ' m');
  r = aja(328100, 6823000, 0, 3, 0.1);
  ok(r && r.hit.kind === 'kivi' && r.hit.type === 'tormays', 'vesikiveen 3 kn: törmäys, laji kivi');
  const gapK = r ? (6823100 - 0.75 - (r.S.y + O.n + 7.257)) : 99; ok(r && gapK >= -0.1 && gapK < 0.4, 'kiven reunan etäisyys keulasta ' + f(gapK) + ' m');
  r = aja(328100, 6823000, 0, 0.7, 0.1);
  ok(r && r.hit.kind === 'kivi' && r.hit.type === 'kosketus', 'vesikiveen 0,7 kn: kosketus');
  r = aja(328103, 6823000, 0, 6, 0.1);   // kivi 3 m sivussa, rungon puolileveys 2,2 -> väli 0,05... kiven reuna 2,25 m: ei osu (2,25 > 2,2)
  ok(r === null || r.hit.kind !== 'kivi', 'kivi 3 m sivussa (reuna 2,25 m, runko 2,2 m): ei osu');
  r = aja(328102.5, 6823000, 0, 6, 0.1);
  ok(r && r.hit.kind === 'kivi', 'kivi 2,5 m sivussa osuu rungon keskilaivaan (reuna 1,75 m)');

  // 5. Kivi aivan rungon sisällä (pieni kohde ei saa livahtaa läpi): alus ajaa 20 kn pienellä kivellä, askel 0,25 s = 2,6 m
  r = aja(328100, 6823000, 0, 20, 0.25);
  ok(r && r.hit.kind === 'kivi', 'kivi 20 kn ja 0,25 s askeleella tunnistetaan');

  // 6. Sillan pilari
  T.clear();
  const spans = [{ k: 'road', L: 60, S: [0, 60], E: [328000, 328000], N: [6823100, 6823160], W: [1, 1], name: 'testi' }];
  T.setBridgeSource(() => spans);
  const pil = T.pierObstacles(spans, Sillat3D.widthOf);
  console.log('pilareita ' + pil.length + ': ' + pil.map((p) => '(' + f(p.cx, 1) + ', ' + f(p.cy, 1) + ')').join(' '));
  ok(pil.length >= 2, 'pilarit syntyvät 25 m:n välein');
  r = aja(pil[0].cx, 6823000, 0, 4, 0.1);
  ok(r && r.hit.kind === 'pilari' && r.hit.type === 'tormays', 'sillan pilariin 4 kn: törmäys, laji pilari');
  T.setBridgeSource(null);

  // 7. Monikulmio (alueena piirretty laituri) reikineen
  T.clear();
  const sq = (e, n, h) => [[e - h, n - h], [e + h, n - h], [e + h, n + h], [e - h, n + h]];
  T.addItems('*', { segs: [], polys: [{ k: 'wide', outer: sq(328000, 6823100, 10), holes: [sq(328000, 6823100, 3)] }], rocks: [] });
  r = aja(328000, 6823000, 0, 3, 0.1);
  ok(r && r.hit.kind === 'laituri', 'monikulmioon 3 kn: törmäys');
  // alus kokonaan reiässä, reunat 3 m: runko 4,4 x 13,5 m ei mahdu, mutta pienempää reikää ei testata. Reikään ajo suoraan: alus pienen kivikentän vieressä ohi
  // 8. Lähtö esteen kohdalta: edellinen asento esteessä -> ei osumaa (pääsee irti)
  const S0 = at(328000, 6823100, 0, 0), p0 = { x: S0.x, y: S0.y, hdg: 0 };
  ok(T.resolve(S0, p0) === null, 'edellinen asento esteen päällä: osumaa ei lasketa');

  // 9. Hidastus: kosketuksessa alus pysähtyy ja voi ajaa irti peruuttamalla
  T.clear();
  T.addItems('*', { segs: [{ k: 'narrow', e0: 328000, n0: 6823100, e1: 328000, n1: 6823200 }], polys: [], rocks: [] });
  r = aja(328000, 6823000, 0, 0.8, 0.1);
  const S1 = r.S; let prev1 = { x: S1.x, y: S1.y, hdg: S1.hdg }, rel = 0;
  for (let i = 0; i < 100; i++) { S1.y -= 0.3 * 0.1; const h = T.resolve(S1, prev1); if (h) rel++; prev1 = { x: S1.x, y: S1.y, hdg: S1.hdg }; }
  ok(rel === 0, 'kosketuksen jälkeen peruutus irti ei anna uusia osumia (' + rel + ')');

  // 10. Oikea aineisto: Naistenlahden laiturit, laituri E 328289,4 N 6823913 -> 6823811 (vapaa pää etelässä), ajetaan etelästä pohjoiseen laiturin keskilinjaa pitkin
  T.clear();
  const tIdle = async () => { for (let i = 0; i < 400 && !T.idle(); i++) await new Promise((r) => setTimeout(r, 100)); };
  T.preloadEN(328289, 6823800, 300); await tIdle();
  const inf = T.info(); console.log('ladattu', JSON.stringify(inf));
  ok(inf.tiles > 0 && inf.obstacles > 20, 'ruudut ja esteet ladattu (' + inf.obstacles + ' estettä)');
  r = aja(328290, 6823700, 0, 6, 0.1);
  ok(r && r.hit.type === 'tormays' && r.hit.kind === 'laituri', 'Naistenlahden laiturin päähän 6 kn: törmäys (' + (r && r.hit.kind) + ', ' + (r && f(r.hit.kn, 1)) + ' kn, N ' + (r && f(r.S.y + O.n, 1)) + ')');
  if (r) {
    // laiturin pään N on 6823811.5 ja keula 7,26 m: pysähdys N noin 6823804
    const keula = r.S.y + O.n + 7.257, gap = 6823811.5 - keula;
    ok(gap >= -0.1 && gap < 0.5, 'pysähdys: keula ' + f(gap) + ' m laiturin päästä, ei yli 1 m läpi');
  }
  r = aja(328290, 6823700, 0, 0.8, 0.1);
  ok(r && r.hit.type === 'kosketus', 'Naistenlahden laituriin 0,8 kn: kosketus');

  // 11. Suorituskyky: Naistenlahden tilanne (kaikki ladatut ruudut) ja synteettinen tiheä tilanne
  const S = at(328272, 6823860, 5, 6), N = 20000; let hits = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { S.hdg = (i % 360); S.x = 272 + (i % 40) * 0.05; if (T.check(S)) hits++; }
  const dt = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log('check, Naistenlahti (laiturikuja, 42 estettä): ' + f(dt * 1000, 1) + ' µs / askel, osumia ' + hits + '/' + N);
  ok(dt < 1, 'törmäystarkistus ' + f(dt, 4) + ' ms/askel < 1 ms');
  T.clear();
  const dense = []; for (let i = 0; i < 4000; i++) dense.push({ t: 'r', kind: 'laituri', cx: 328000 + (i % 80) * 3, cy: 6823000 + Math.floor(i / 80) * 3, ux: 0, uy: 1, a: 1.5, b: 1, rad: Math.hypot(1.5, 1) });
  T.addObstacles('*', dense);
  const S2 = at(328100, 6823050, 0, 6); const t1 = process.hrtime.bigint(); let hh = 0;
  for (let i = 0; i < 5000; i++) { S2.hdg = i % 360; if (T.check(S2)) hh++; }
  const dt2 = Number(process.hrtime.bigint() - t1) / 1e6 / 5000;
  console.log('check, tiheä synteettinen (4000 estettä yhdessä ruudussa): ' + f(dt2 * 1000, 1) + ' µs / askel, osumia ' + hh);
  ok(dt2 < 1, 'tiheä tilanne ' + f(dt2, 4) + ' ms/askel < 1 ms');

  console.log(fails ? 'VIRHEITÄ ' + fails : 'Kaikki törmäystestit läpi');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
