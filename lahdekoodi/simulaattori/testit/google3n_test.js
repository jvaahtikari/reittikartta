/* Vaihe 3n: yksikkötestit Nodessa:  node testit/google3n_test.js
 * Kalibroinnin sovitus (tunnettu virhe löytyy), projektio edestakaisin, kameran katse alaspäin ja vesimaskin renkaan siirto. */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'google3d.js'));
const V = require(path.join(__dirname, '..', 'js', 'vesimaski3d.js'));
const RAD = Math.PI / 180;
let fails = 0;
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }

// 1. projektio: keskelle osoittava säde menee kuvan keskelle, kuvakulman reuna kuvan reunalle
{
  const cam = { heading: 100, pitch: 0, vfov: 45, tanScale: 1, w: 1440, h: 900 };
  const c = G.projectRay(100, 0, cam);
  ehto('kameran suunta osuu kuvan keskelle', Math.abs(c.u - 720) < 1e-6 && Math.abs(c.v - 450) < 1e-6);
  const e = G.projectRay(100, 22.5, cam);
  ehto('pystykuvakulman puolikas osuu yläreunaan', Math.abs(e.v - 0) < 1e-6, 'v ' + e.v.toFixed(6));
  const r = G.projectRay(110, 0, cam);
  ehto('kymmenen astetta oikealle on kuvan oikealla puolella', r.u > 720, 'u ' + r.u.toFixed(1));
  ehto('kameran takana oleva kohde palauttaa tyhjän', G.projectRay(280, 0, cam) === null);
  const up = G.projectRay(100, 5, Object.assign({}, cam, { pitch: 5 }));
  ehto('nousukulma 5 astetta ja kohde 5 asteen korkeudella osuu keskelle', Math.abs(up.v - 450) < 1e-6);
  const ts = G.projectRay(100, 10, Object.assign({}, cam, { tanScale: 1.1 }));
  const t0 = G.projectRay(100, 10, cam);
  ehto('kuvakulman kerroin 1,1 pienentää pisteen etäisyyttä keskustasta suhteessa 1 / 1,1', Math.abs((450 - ts.v) / (450 - t0.v) - 1 / 1.1) < 1e-3, 'suhde ' + ((450 - ts.v) / (450 - t0.v)).toFixed(4));
}

// 2. sovitus: tunnettu virhe löytyy ilman kohinaa ja kohinan kanssa
function mk(trueCal, n, noisePx, seed) {
  let s = seed || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const cams = [{ az: 184, el: 8, d: 1500 }, { az: 190, el: 3.1, d: 700 }, { az: 178, el: 1.2, d: 900 }, { az: 195, el: 4, d: 2000 }, { az: 172, el: 0.5, d: 400 }];
  const S = [];
  for (let i = 0; i < n; i++) {
    const t = cams[i], heading = 185;
    const q = G.projectRay(t.az, t.el, { heading: heading + trueCal.dh, pitch: trueCal.dp, vfov: 45, tanScale: trueCal.k, w: 1440, h: 900 });
    S.push({ az: t.az, el: t.el, heading, pitch: 0, vfov: 45, w: 1440, h: 900, u: q.u + rnd() * 2 * noisePx, v: q.v + rnd() * 2 * noisePx });
  }
  return S;
}
{
  const f = G.fitCalibration(mk({ dh: 0.8, dp: -0.4, k: 1.03 }, 4, 0));
  ehto('sovitus ilman kohinaa: suunta, nousu ja kerroin', Math.abs(f.dHeadingDeg - 0.8) < 1e-3 && Math.abs(f.dPitchDeg + 0.4) < 1e-3 && Math.abs(f.tanScale - 1.03) < 1e-4, f.dHeadingDeg.toFixed(4) + ', ' + f.dPitchDeg.toFixed(4) + ', ' + f.tanScale.toFixed(5));
  ehto('jäännökset ovat lähes nolla', Math.max.apply(null, f.residuals.map(r => Math.max(Math.abs(r.fitHorDeg), Math.abs(r.fitVerDeg)))) < 1e-3);
  const g = G.fitCalibration(mk({ dh: -1.2, dp: 0.6, k: 0.97 }, 5, 1.5, 7));
  const maxH = Math.max.apply(null, g.residuals.map(r => Math.abs(r.fitHorDeg))), maxV = Math.max.apply(null, g.residuals.map(r => Math.abs(r.fitVerDeg)));
  ehto('sovitus 1,5 pikselin kohinalla: virhe alle 0,15 astetta', Math.abs(g.dHeadingDeg + 1.2) < 0.15 && Math.abs(g.dPitchDeg - 0.6) < 0.15 && Math.abs(g.tanScale - 0.97) < 0.02, g.dHeadingDeg.toFixed(3) + ', ' + g.dPitchDeg.toFixed(3) + ', ' + g.tanScale.toFixed(4));
  ehto('jäännökset rajoissa 0,5 ja 0,3 astetta', maxH <= 0.5 && maxV <= 0.3, 'vaaka ' + maxH.toFixed(3) + ', pysty ' + maxV.toFixed(3));
  const one = G.fitCalibration(mk({ dh: 0.5, dp: 0.2, k: 1 }, 1, 0));
  ehto('yhdellä osoituksella sovitetaan vain suunta ja nousu', one.fittedScale === false && one.tanScale === 1 && Math.abs(one.dHeadingDeg - 0.5) < 1e-3 && Math.abs(one.dPitchDeg - 0.2) < 1e-3);
  ehto('kameran takana oleva näyte palauttaa tyhjän', G.fitCalibration([{ az: 5, el: 0, heading: 185, pitch: 0, vfov: 45, w: 100, h: 100, u: 50, v: 50 }]) === null);
}

// 3. kameran katse alaspäin: keskipiste lähemmäs ja alemmas, tilt pienenee, silmäpiste ei muutu
{
  const base = G.camera({ lat: 61.5, lon: 23.76, hdgTrue: 90, vfovDeg: 45 });
  const dn = G.camera({ lat: 61.5, lon: 23.76, hdgTrue: 90, vfovDeg: 45, pitchDownDeg: 10 });
  ehto('tilt 90 vaakasuoraan ja 80 kymmenen asteen alaspäin', base.tilt === 90 && Math.abs(dn.tilt - 80) < 1e-9, base.tilt + ' ja ' + dn.tilt);
  ehto('silmäpiste on sama', Math.abs(base.eye.lat - dn.eye.lat) < 1e-9 && Math.abs(base.eye.lng - dn.eye.lng) < 1e-9 && base.eye.altitude === dn.eye.altitude);
  ehto('alaspäin katsottaessa keskipisteen korkeus on pienempi (range * sin 10 astetta)', Math.abs((base.altitude - dn.altitude) - base.range * Math.sin(10 * RAD)) < 1e-6, (base.altitude - dn.altitude).toFixed(3) + ' m');
  const up = G.camera({ lat: 61.5, lon: 23.76, hdgTrue: 90, vfovDeg: 45, pitchDownDeg: -15 });
  ehto('ylöspäin katsominen ei ole mahdollista (rajataan vaakatasoon)', up.tilt === 90);
}

// 4. kalibroinnin tallennus ilman selaimen muistia ei kaadu ja rajaa arvot
{
  const c0 = G.getCalib();
  ehto('oletuskalibrointi on nollakorjaus', c0.dHeadingDeg === 0 && c0.dPitchDeg === 0 && c0.tanScale === 1, JSON.stringify(c0));
  G.setCalib({ dHeadingDeg: 99, dPitchDeg: -99, tanScale: 5, altOffsetM: 0.3 });
  const c1 = G.getCalib();
  ehto('liian suuret arvot rajataan', Math.abs(c1.dHeadingDeg) <= 10 && Math.abs(c1.dPitchDeg) <= 10 && c1.tanScale >= 0.7 && c1.tanScale <= 1.4, JSON.stringify(c1));
  G.setCalib(null);
  ehto('nollaus palauttaa oletuksen', G.getCalib().dHeadingDeg === 0 && G.getCalib().tanScale === 1);
}

// 5. vesimaskin renkaan siirto
{
  const sq = (x0, y0, x1, y1, ccw) => { const p = ccw ? [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0] : [x0, y0, x0, y1, x1, y1, x1, y0, x0, y0]; return Int32Array.from(p); };
  const outer = sq(100, 100, 300, 300, true), hole = sq(160, 160, 190, 190, false);
  const polys = V.groupRings([outer, hole]);
  ehto('rengasryhmittely: yksi monikulmio ja yksi reikä', polys.length === 1 && polys[0].holes.length === 1, 'ala ' + V.ringArea(outer) + ' ja ' + V.ringArea(hole));
  const o = V.offsetRing(outer, 10, -80, 4176), xs = [], ys = [];
  for (let i = 0; i < o.length; i += 2) { xs.push(o[i]); ys.push(o[i + 1]); }
  ehto('ulkoreuna siirtyy 10 yksikköä ulospäin', Math.min.apply(null, xs) === 90 && Math.max.apply(null, xs) === 310 && Math.min.apply(null, ys) === 90 && Math.max.apply(null, ys) === 310, xs.join(',') + ' / ' + ys.join(','));
  const h = V.offsetRing(hole, 10, -80, 4176), hx = [], hy = [];
  for (let i = 0; i < h.length; i += 2) { hx.push(h[i]); hy.push(h[i + 1]); }
  ehto('reikä pienenee eli maa-alue levenee', Math.min.apply(null, hx) === 170 && Math.max.apply(null, hx) === 180 && Math.min.apply(null, hy) === 170 && Math.max.apply(null, hy) === 180, Math.min.apply(null, hx) + ' ... ' + Math.max.apply(null, hx));
  const clip = Int32Array.from([-80, 100, 200, 100, 200, 300, -80, 300, -80, 100]);
  const cc = V.offsetRing(clip, 10, -80, 4176);
  ehto('leikkausreunan pisteet eivät liiku', cc[0] === -80 && cc[2 * 3] === -80, cc[0] + ', ' + cc[6]);
}
console.log(fails ? ('\n' + fails + ' testiä epäonnistui') : '\nKaikki vaiheen 3n yksikkötestit läpi');
process.exit(fails ? 1 : 0);
