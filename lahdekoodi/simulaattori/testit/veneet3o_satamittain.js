/* Vaihe 3o, kriteeri 2: veneiden määrät satamittain ilmakuvasta (veneet.json) ja laiturialgoritmin varakäytöstä samalla alueella.
 * Varakäyttö ajetaan jokaiselle tiedoston satamalle erikseen ilman ilmakuvan veneitä (asetaLaiturit, rajaus satama-alueen ympäripiirretty ympyrä) ja lasketaan vain ne veneet, jotka ovat tiedoston
 * ilmoittamalla tunnistusalueella (tunnistusalue_bbox). Hylkäyslukumäärät koskevat koko rajausympyrää (aallonmurtaja, kapea maa, maa, matala, törmäys).
 * Ajo: PAKETTI=http://127.0.0.1:8144/ node veneet3o_satamittain.js [veneet.json] */
'use strict';
const fs = require('fs'), path = require('path');
const SIM = path.join(__dirname, '..');
globalThis.THREE = require(SIM + '/lib/three.min.js');
const pmSrc = fs.readFileSync(path.join(SIM, '..', 'lib', 'pmtiles.js'), 'utf8');
globalThis.pmtiles = new Function(pmSrc + '; return pmtiles;')();
globalThis.Paikka = require(SIM + '/js/paikka.js'); globalThis.Mvt = require(SIM + '/js/mvt.js'); globalThis.Aineisto = require(SIM + '/js/aineisto.js');
Aineisto.setBase(process.env.PAKETTI || 'http://127.0.0.1:8144/');
globalThis.Laiturit3D = require(SIM + '/js/laiturit3d.js');
const V = require(SIM + '/js/veneet3d.js');
const { lataa } = require('./veneet3o_lataa.js');
(async () => {
  const tiedostoPolku = process.argv[2] || '/home/claude/opetus/navi/putki/ulos/veneet.json';
  const d = JSON.parse(fs.readFileSync(tiedostoPolku, 'utf8'));
  const nimet = Array.from(new Set(d.veneet.map(b => b.satama)));
  const alueet = {}; (d.satamat || []).forEach(s => { if (s.tunnistusalue_bbox) alueet[s.nimi] = s.tunnistusalue_bbox; });
  nimet.forEach(n => { if (!alueet[n]) { const bs = d.veneet.filter(b => b.satama === n); alueet[n] = [Math.min(...bs.map(b => b.e)) - 60, Math.min(...bs.map(b => b.n)) - 60, Math.max(...bs.map(b => b.e)) + 60, Math.max(...bs.map(b => b.n)) + 60]; } });
  console.log('Tiedosto', tiedostoPolku, d.veneet.length, 'havaintoa,', nimet.length, 'satamaa');
  console.log('satama | ilmakuvasta | varakäytöstä (laiturialgoritmi) | hylätty: maa, matala, törmäys, aallonmurtaja, kapea maa | paikkoja');
  const yht = { ik: 0, vara: 0, am: 0, km: 0 };
  for (const nimi of nimet) {
    const [e0, n0, e1, n1] = alueet[nimi], ce = (e0 + e1) / 2, cn = (n0 + n1) / 2, sade = Math.hypot(e1 - e0, n1 - n0) / 2;
    Paikka.setOrigin(Math.round(ce), Math.round(cn));
    const { ves, kuv } = await lataa(Aineisto, Paikka, ce, cn, sade + 300);
    const onVesi = V.luoVesiTesti(kuv);
    const b = V.luoVeneet(new THREE.Scene(), {});
    const st = b.asetaLaiturit(ves, Paikka.getOrigin(), { onVesi, rajaus: { e: ce, n: cn, sade }, kuvio: kuv });
    const sisalla = b.veneet.filter(v => v.e >= e0 && v.e <= e1 && v.n >= n0 && v.n <= n1).length;
    const h = st.hylatty || {}, ik = d.veneet.filter(v => v.satama === nimi).length;
    console.log([nimi, ik, sisalla, [h.maa || 0, h.matala || 0, h.tormays || 0, h.aallonmurtaja || 0, h.kapeaMaa || 0].join(', '), st.paikkoja].join(' | '));
    yht.ik += ik; yht.vara += sisalla; yht.am += h.aallonmurtaja || 0; yht.km += h.kapeaMaa || 0;
  }
  console.log('yhteensä | ' + yht.ik + ' | ' + yht.vara + ' | aallonmurtajan vuoksi hylätty ' + yht.am + ', kapean maan vuoksi ' + yht.km);
})().catch(e => { console.error(e); process.exit(1); });
