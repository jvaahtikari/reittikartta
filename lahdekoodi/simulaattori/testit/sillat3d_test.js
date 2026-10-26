/* Vaihe 3i: siltamoduulin Node-testi oikealla aineistolla (paketin palvelin portissa 8144, osoite PAKETTI-ympäristömuuttujalla).
 * Lukee z14-ruudut annetun pisteen ympäriltä, ajaa tileItems -> assemble -> buildGeometry ja tulostaa siltaluettelon.
 * Ajo: node testit/sillat3d_test.js [E N sade] */
'use strict';
const path = require('path'), fs = require('fs');
const js = (f) => path.join(__dirname, '..', 'js', f);
globalThis.THREE = require(path.join(__dirname, '..', 'lib', 'three.min.js'));
const pmSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'pmtiles.js'), 'utf8');
globalThis.pmtiles = new Function(pmSrc + '; return pmtiles;')();
globalThis.Paikka = require(js('paikka.js')); globalThis.Mvt = require(js('mvt.js')); globalThis.Aineisto = require(js('aineisto.js'));
Aineisto.setBase(process.env.PAKETTI || 'http://127.0.0.1:8144/');
const S3 = require(js('sillat3d.js'));
const a = process.argv.slice(2).map(Number);
const E0 = a[0] || 327184, N0 = a[1] || 6823553, R = a[2] || 2500;
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'OK    ' : 'VIRHE ') + m); };
(async () => {
  Paikka.setOrigin(E0, N0);
  const ll = Paikka.enToLonLat(E0, N0), tp = Paikka.lonlatToTile(ll.lon, ll.lat, S3.Z), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, S3.Z);
  const rr = Math.ceil((R + 150) / size) + 1, items = [];
  const jobs = [];
  for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) jobs.push([Math.floor(tp.x) + dx, Math.floor(tp.y) + dy]);
  const t0 = Date.now();
  for (const [x, y] of jobs) {
    const l = await Aineisto.layers(S3.Z, x, y, ['tie', 'maastokuvio']);
    if (l) items.push(S3.tileItems(S3.Z, x, y, l));
  }
  const t1 = Date.now();
  const spans = S3.assemble(items), t2 = Date.now();
  console.log('ruutuja', jobs.length, 'luku ja purku', t1 - t0, 'ms, kokoaminen', t2 - t1, 'ms, osia', items.reduce((s, i) => s + i.pieces.length, 0), 'siltaosuuksia', spans.length);
  const r = S3.buildGeometry(spans, 0, 0, R, Paikka.getOrigin(), () => 3), t3 = Date.now();
  console.log('geometria', t3 - t2, 'ms, kolmioita', r.stats.total, JSON.stringify(r.stats.tris), 'pilareita', r.stats.piers);
  r.stats.list.sort((p, q) => q.waterM - p.waterM).forEach((b) => console.log(
    (b.name || '(nimetön)').padEnd(24), String(b.luokka).padEnd(6), b.k.padEnd(6), 'kansi', b.width + ' m', 'osuus', b.length.toFixed(0).padStart(4), 'm, vesi', b.waterM.toFixed(0).padStart(4), 'm, kolmioita', String(b.tris).padStart(4), 'E', Math.round(b.e0), 'N', Math.round(b.n0), '->', Math.round(b.e1), Math.round(b.n1)));
  // tarkistukset
  const paasi = r.stats.list.find((b) => b.name === 'Paasikivensilta'), puisto = r.stats.list.find((b) => b.name === 'Puistosilta');
  ok(!!paasi && Math.abs(paasi.waterM - 151) < 8, 'Paasikivensilta mukana, vesi ' + (paasi && paasi.waterM.toFixed(1)) + ' m (shapely 151,4 m)');
  ok(!!puisto && Math.abs(puisto.waterM - 174) < 10, 'Puistosilta mukana, vesi ' + (puisto && puisto.waterM.toFixed(1)) + ' m (shapely 173,6 m)');
  ok(r.stats.total < 20000, 'kolmioita ' + r.stats.total + ' < 20 000');
  const g = r.geometry, pos = g.getAttribute('position'); ok(pos.count === r.stats.total * 3, 'verkon kärkimäärä täsmää');
  let bad = 0; for (let i = 0; i < pos.count * 3; i++) if (!isFinite(pos.array[i])) bad++; ok(!bad, 'ei NaN-arvoja geometriassa');
  console.log(fails ? 'VIRHEITÄ ' + fails : 'Kaikki siltatestit läpi');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
