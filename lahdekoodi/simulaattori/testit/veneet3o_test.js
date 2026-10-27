/* Vaihe 3o: Node-testit (veneet3d.js) oikealla aineistolla. Ajo: PAKETTI=http://127.0.0.1:8144/ node veneet3o_test.js [veneet.json]
 * 1. Kapeiden maakaistojen tunnistus synteettisellä ruudukolla (aallonmurtajan tapainen niemeke).
 * 2. Ilmakuvan veneet (asetaPaikat): suunnan muunnos, koko, tunniste, maalla olevat pois, poiju ja köysi vain laiturin viereen keula laituriin päin, poijukentällä ei.
 * 3. Laiturialgoritmi varakäytössä: ohittaa tiedoston kattamat satamat, ei veneitä aallonmurtajan eikä kapean maan lähellä, veneLahde = 'laituri' palauttaa algoritmin.
 * 4. Lähella-rajapinta (tutka ja törmäys) antaa ilmakuvan veneet. Satama-alueet (läpinäkyvä alue) kattavat laiturit ja poijukentän veneet.
 * Tulostaa myös veneiden määrät satamittain (kriteeri 2). */
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
let virheita = 0;
function ok(c, msg) { if (!c) virheita++; console.log((c ? 'OK    ' : 'VIRHE ') + msg); }
const { lataa: lataaYhteinen } = require('./veneet3o_lataa.js');
const lataa = (e0, n0, reach) => lataaYhteinen(Aineisto, Paikka, e0, n0, reach);
function pisteJanalla(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }

// ---------- 1. kapeat kaistat synteettisesti ----------
function kaistaTesti() {
  const W = 200, H = 120, solu = 2;
  function kokeile(maaFn) { const w = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w[y * W + x] = maaFn(x, y) ? 0 : 1; return V.kapeatKaistat(w, W, H, solu, 40, 60); }
  const a = kokeile((x, y) => x >= 20 && x < 150 && y >= 55 && y < 65);          // 20 m leveä, 260 m pitkä niemeke
  ok(a.komponentteja === 1 && a.soluja > 600, 'kapea niemeke (20 m x 260 m) tunnistetaan (komponentteja ' + a.komponentteja + ', soluja ' + a.soluja + ')');
  const b = kokeile((x, y) => x >= 20 && x < 40 && y >= 55 && y < 60);           // 40 m x 10 m: liian lyhyt
  ok(b.komponentteja === 0, 'lyhyttä kaistaa (alle 60 m) ei tunnisteta');
  const c = kokeile((x, y) => x >= 20 && x < 150 && y >= 40 && y < 80);          // 80 m leveä: leveä maa
  ok(c.komponentteja === 0, 'leveää maa-aluetta (80 m) ei tunnisteta kapeaksi');
  const d = kokeile((x, y) => x >= 0 && x < W && y >= 60);                       // suora ranta, vettä vain yhdellä puolella
  ok(d.komponentteja === 0, 'suoraa rantaa (maa-alue reunasta reunaan) ei tunnisteta kapeaksi');
  const e = kokeile((x, y) => (x >= 20 && x < 150 && y >= 55 && y < 65) || (x >= 20 && x < 150 && y >= 95));   // niemeke ja leveä ranta samassa ruudukossa
  ok(e.komponentteja === 1, 'niemeke tunnistetaan, vaikka vieressä on leveä ranta (komponentteja ' + e.komponentteja + ')');
}

(async () => {
  Paikka.setOrigin(328000, 6823000);
  kaistaTesti();
  const E0 = 328250, N0 = 6823780;
  const { ves, kuv } = await lataa(E0, N0, 1800);
  console.log('ladattu ruutuja: vesieste', ves.length, 'maastokuvio', kuv.length);
  ok(ves.length >= 200 && kuv.length >= 200, 'ruudut ladattiin (vesieste ' + ves.length + ', maastokuvio ' + kuv.length + ')');
  const onVesi = V.luoVesiTesti(kuv);
  const raj = { e: E0, n: N0, sade: 1500 };
  const tiedostoPolku = process.argv[2] || path.join(__dirname, 'veneet_testi.json');
  const tiedosto = JSON.parse(fs.readFileSync(tiedostoPolku, 'utf8'));
  console.log('veneet-tiedosto', tiedostoPolku, tiedosto.veneet.length, 'havaintoa');
  const scene = new THREE.Scene();
  const koe = /^Testitiedosto/.test(tiedosto.lahde || '');   // koetiedoston erikoistapaukset (maalla olevat, selin olevat, poijukenttä) tarkistetaan vain sille

  // ---------- 3a. varakäyttö ilman tiedostoa ----------
  const b0 = V.luoVeneet(scene, {});
  const s0 = b0.asetaLaiturit(ves, Paikka.getOrigin(), { onVesi, rajaus: raj, kuvio: kuv });
  const hyl = s0.hylatty || {};
  console.log('varakäyttö (ei tiedostoa): veneitä', s0.veneita, 'paikkoja', s0.paikkoja, 'hylätty', JSON.stringify(hyl), 'esto', JSON.stringify(s0.esto));
  ok(s0.veneita > 500, 'laiturialgoritmi sijoittaa veneitä (' + s0.veneita + ')');
  ok((hyl.kapeaMaa || 0) + (hyl.aallonmurtaja || 0) > 0, 'aallonmurtajan ja kapean maan vuoksi hylättiin paikkoja: aallonmurtaja ' + (hyl.aallonmurtaja || 0) + ', kapea maa ' + (hyl.kapeaMaa || 0));
  const estoFn = V.luoEsto(ves, kuv, V.ASETUKSET);
  let lahella = 0; b0.veneet.forEach(v => { if (estoFn(v.e, v.n, 10)) lahella++; });
  ok(lahella === 0, 'varakäytön veneistä ei yksikään ole alle 10 m:n päässä aallonmurtajasta tai kapeasta maasta (' + lahella + ')');
  let lahella15 = 0; b0.veneet.forEach(v => { if (estoFn(v.e, v.n, 15)) lahella15++; });
  ok(lahella15 === 0, 'eikä alle 15 m:n päässä (' + lahella15 + ' venettä, laskettu veneen keskipisteestä)');
  const vertailu = V.kiinnitaVeneet(ves, Object.assign({}, V.ASETUKSET, { aallonmurtajaEtaisyys: 0 }), onVesi, raj, {});
  let ilmanEstoa = 0; vertailu.veneet.forEach(v => { if (estoFn(v.e, v.n, 10)) ilmanEstoa++; });
  console.log('  vertailu: ilman estoa veneitä ' + vertailu.tilasto.veneita + ', joista alle 10 m kapeasta maasta ' + ilmanEstoa + ', estolla ' + s0.veneita);
  ok(ilmanEstoa > 0, 'ilman estoa osa veneistä olisi kapean maan vieressä (' + ilmanEstoa + '), eli esto vaikuttaa');

  // ---------- 2. ilmakuvan veneet ----------
  const b1 = V.luoVeneet(scene, {});
  const tosi = tiedosto.suunta_viite === 'tosi', alueet = (tiedosto.satamat || []).filter(q => q && q.tunnistusalue_bbox && q.tunnistusalue_bbox.length === 4).map(q => ({ nimi: q.nimi, e0: q.tunnistusalue_bbox[0], n0: q.tunnistusalue_bbox[1], e1: q.tunnistusalue_bbox[2], n1: q.tunnistusalue_bbox[3] }));
  const t1 = b1.asetaPaikat(tiedosto.veneet, Paikka.getOrigin(), { suuntaTosi: tosi, alueet });
  const s1 = b1.asetaLaiturit(ves, Paikka.getOrigin(), { onVesi, rajaus: raj, kuvio: kuv });
  console.log('ilmakuva: tiedoston veneitä', t1.saatu, 'luotu', t1.luotu, 'satamittain', JSON.stringify(t1.satamittain), 'peittoalueita', t1.peittoalueita);
  console.log('  ilmakuvan tarkistus:', JSON.stringify(s1.ilmakuva));
  console.log('  varakäyttö tiedoston rinnalla: veneitä', s1.veneita, 'ketjuja ohitettu peiton vuoksi', s1.peitettyjaKetjuja, 'hylätty', JSON.stringify(s1.hylatty));
  ok(t1.luotu === tiedosto.veneet.length, 'kaikki havainnot luotiin veneiksi (' + t1.luotu + ' / ' + tiedosto.veneet.length + ')');
  const ik = b1.ilmakuvaVeneet();
  ok(ik.length === t1.luotu, 'ilmakuvaVeneet-lista vastaa luotuja');
  const raakaA = tiedosto.veneet[0], vA = ik[0];
  const llA = Paikka.enToLonLat(raakaA.e, raakaA.n), convA = Paikka.convergenceDeg(llA.lon, llA.lat);
  const odotettu = (((raakaA.suunta - (tosi ? convA : 0)) % 360) + 360) % 360;
  ok(Math.abs(vA.suunta - odotettu) < 1e-6 && Math.abs(vA.e - raakaA.e) < 1e-9 && Math.abs(vA.n - raakaA.n) < 1e-9, 'suunta muunnetaan tosuunnasta ruutusuunnaksi, kun tiedosto ilmoittaa tosuunnan (konvergenssi ' + convA.toFixed(2) + ' astetta: ' + raakaA.suunta + ' -> ' + vA.suunta.toFixed(2) + ') ja paikka säilyy');
  const bR = V.luoVeneet(scene, {}); bR.asetaPaikat(tiedosto.veneet, Paikka.getOrigin(), { suuntaTosi: false });
  ok(Math.abs(bR.ilmakuvaVeneet()[0].suunta - ((raakaA.suunta % 360) + 360) % 360) < 1e-6, 'ilman suuntaTosi-valintaa suunta käytetään ruutusuuntana sellaisenaan (veneet.json-tiedoston mitattu käytäntö)');
  const bA = V.luoVeneet(scene, {}); bA.asetaPaikat(tiedosto.veneet, Paikka.getOrigin(), { suuntaTosi: tosi, alueet: [{ nimi: 'Koe', e0: 328000, n0: 6823600, e1: 328500, n1: 6824000 }] });
  ok(bA.peittoalueet().some(p => p.annettu && p.nimi === 'Koe' && p.e0 === 327990), 'tiedoston ilmoittama tunnistusalue (alueet) otetaan peittoalueeksi 10 m marginaalilla');
  let koonVirhe = 0; ik.forEach((v, i) => { const r = tiedosto.veneet[i]; const nom = V.LUOKAT[r.luokka].nom, odotettuPit = nom * Math.max(0.65, Math.min(1.7, r.pituus / nom)); if (Math.abs(v.pituus - odotettuPit) > 0.02) koonVirhe++; });
  ok(koonVirhe === 0, 'veneen pituus on luokan mallin pituus kerrottuna havaitun pituuden suhteella (rajattu 0,65 ... 1,7), virheitä ' + koonVirhe);
  const idt = new Set(ik.map(v => v.id)); ok(idt.size === ik.length, 'tunnisteet ovat yksilöllisiä');
  const maalla = ik.filter(v => v.maalla);
  const maaHavainnot = tiedosto.veneet.filter(r => r.leveys === 1.9 && r.pituus === 5.2 && r.varmuus === 0.4 && Math.hypot(r.e - raj.e, r.n - raj.n) <= raj.sade).length;
  if (koe) ok(maaHavainnot >= 3 && maalla.length === maaHavainnot, 'maalla olevat havainnot (rajauksen sisällä ' + maaHavainnot + ') pudotetaan (' + maalla.length + ')');
  const poijut = b1.poijut().filter(p => p.lahde === 'ilmakuva');
  const laituriin = ik.filter(v => v.laituriin), kentalla = ik.filter(v => !v.maalla && !v.laituriin);
  console.log('  laituriin kiinnitettyjä', laituriin.length, 'poijukentällä ja irti', kentalla.length, 'poijuja', poijut.length, 'maalla', maalla.length);
  ok(poijut.length <= laituriin.length && poijut.length >= laituriin.length - 5, 'poiju ja köysi vain laituriin päin keulalla olevilla veneillä (' + poijut.length + ' poijua, ' + laituriin.length + ' laituriveneä, erotus on veneitä, joiden köyden pää jäisi maalle)');
  if (koe) ok(laituriin.length > 300 && kentalla.length >= 19 && kentalla.length < laituriin.length, 'suurin osa laituriveneistä (' + laituriin.length + ') saa poijun, poijukentän ja selin olevat (' + kentalla.length + ') eivät');
  const idLaituriin = new Set(laituriin.map(v => v.id)); ok(poijut.every(p => idLaituriin.has(p.id)), 'jokainen poiju kuuluu laituriveneelle');
  // poijukentän veneet: oikeasti yli 3 m laiturista
  const segs = b1.laiturisegmentit();
  let vaaraPoiju = 0; poijut.forEach(p => { const v = b1.hae(p.id); const L = v.pituus, h = v.suunta * Math.PI / 180, bowE = v.e + Math.sin(h) * L / 2, bowN = v.n + Math.cos(h) * L / 2; let d = 1e9; segs.forEach(s => { d = Math.min(d, pisteJanalla(bowE, bowN, s.e0, s.n0, s.e1, s.n1) - s.w / 2); }); if (d >= 3) vaaraPoiju++; });
  ok(vaaraPoiju === 0, 'kaikilla poijullisilla veneillä keula on alle 3 m laiturin reunasta (' + vaaraPoiju + ' poikkeusta)');
  // peittoalue: varakäytön veneet eivät ole tiedoston kattamalla alueella
  const peitto = b1.peittoalueet();
  const varaVeneet = b1.veneet.filter(v => v.lahde === 'laituri');
  const peiton = (e, n) => peitto.some(p => e >= p.e0 && e <= p.e1 && n >= p.n0 && n <= p.n1);
  const peittoVara = varaVeneet.filter(v => peiton(v.e, v.n)).length;
  ok(peittoVara === 0, 'laiturialgoritmi ei sijoita veneitä tiedoston kattamille alueille (' + peittoVara + ' venettä peiton sisällä, ' + varaVeneet.length + ' venettä muilla alueilla)');
  // veneLahde = 'laituri' palauttaa algoritmin
  const b2 = V.luoVeneet(scene, { veneLahde: 'laituri' });
  const t2 = b2.asetaPaikat(tiedosto.veneet, Paikka.getOrigin(), {});
  const s2 = b2.asetaLaiturit(ves, Paikka.getOrigin(), { onVesi, rajaus: raj, kuvio: kuv });
  ok(t2.luotu === 0 && s2.veneita === s0.veneita && b2.veneet.every(v => v.lahde === 'laituri'), 'veneLahde = laituri: tiedoston veneitä ei käytetä ja algoritmi tuottaa samat ' + s2.veneita + ' venettä kuin ilman tiedostoa');
  // lähella-rajapinta (tutka ja törmäys)
  const o = b1.origin(), ref = ik.find(v => !v.maalla);
  const l = b1.lahella(ref.e - o.e + 3, ref.n - o.n + 2, 12);
  ok(l.length > 0 && l.some(x => x.id === ref.id && x.lahde === 'ilmakuva'), 'lahella-rajapinta (tutka ja törmäys) antaa ilmakuvan veneen (' + l.length + ' venettä 12 m:n säteellä)');
  if (maalla.length) { const ml = maalla[0]; const l2 = b1.lahella(ml.e - o.e, ml.n - o.n, 3); ok(!l2.some(x => x.id === ml.id), 'maalla olevaa havaintoa ei anneta tutkalle eikä törmäykselle'); }
  else console.log('  (tiedostossa ei ole maalla olevia havaintoja, tutka- ja törmäystarkistus ohitetaan)');
  // satama-alueet
  const sa = b1.satamaAlueet();
  console.log('  satama-alueet: kapseleita', sa.kapselit.length, 'rengasta', sa.renkaat.length, 'säde', sa.sade, 'm');
  ok(sa.kapselit.length >= segs.length && segs.length > 20, 'satama-alueen kapseli jokaiselle laiturisegmentille (' + sa.kapselit.length + ' kapselia, ' + segs.length + ' rajauksen sisäistä segmenttiä)');
  const kapKaikki = (e, n) => sa.kapselit.some(k => pisteJanalla(e, n, k[0], k[1], k[2], k[3]) <= sa.sade) || sa.renkaat.some(r => Math.hypot(e - r[0], n - r[1]) <= sa.veneSade);
  const ulkona = ik.filter(v => !v.maalla && !kapKaikki(v.e, v.n)).length;
  ok(ulkona === 0, 'jokainen ilmakuvan vene on satama-alueen sisällä (' + ulkona + ' ulkopuolella)');
  // skaala
  b1.asetaSkaala(1.08); ok(b1.skaala() === 1.08, 'piirtomittakaava 1,08 asettuu');
  b1.asetaSkaala(1);

  // ---------- kriteeri 2: veneiden määrät satamittain ----------
  console.log('\nKriteeri 2, veneiden määrät (tämä tiedosto ' + path.basename(tiedostoPolku) + '):');
  Object.keys(t1.satamittain).forEach(n => console.log('  ilmakuvasta ' + n + ': ' + t1.satamittain[n] + ' havaintoa'));
  console.log('  ilmakuvasta yhteensä ' + t1.luotu + ' (laituriin ' + laituriin.length + ', poijukentällä tai irti ' + kentalla.length + ', maalla pudotettu ' + maalla.length + ')');
  console.log('  varakäyttö ilman tiedostoa (Naistenlahden ympäristö, säde 1 500 m): ' + s0.veneita + ' venettä, hylätty aallonmurtajan vuoksi ' + (hyl.aallonmurtaja || 0) + ' ja kapean maan vuoksi ' + (hyl.kapeaMaa || 0) + ' paikkaa');
  console.log('  varakäyttö tiedoston rinnalla: ' + varaVeneet.length + ' venettä tiedoston kattamien alueiden ulkopuolella');
  console.log(virheita ? '\n' + virheita + ' VIRHETTÄ' : '\nKaikki tarkistukset läpi');
  process.exit(virheita ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
