/* Vaihe 3o: tekee testitiedoston veneet_testi.json, jonka muoto on sama kuin tietoputken vaiheen 1d veneet.json.
 * Veneet ovat laiturialgoritmin paikat (Naistenlahti ja Mustalahti, aallonmurtajan esto päällä) pienellä satunnaisella poikkeamalla paikassa, suunnassa ja pituudessa, osa jätetty pois
 * (täyttöaste vaihtelee), lisäksi poijukentän veneitä (40 ... 120 m laiturista, avoimessa vedessä), kolme "maalla olevaa havaintoa" (pitää pudota pois) ja kolme laituriin päin
 * osoittamatonta venettä laiturin vieressä (poijua ei piirretä). Suunta annetaan keulan tosuuntana (ruutusuunta + meridiaanikonvergenssi), kuten tiedostomääritys vaatii.
 * Käyttö: PAKETTI=http://127.0.0.1:8144/ node veneet3o_luo_testitiedosto.js [ulostulo.json] */
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

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const { lataa: lataaYhteinen } = require('./veneet3o_lataa.js');
const lataa = (e0, n0, reach) => lataaYhteinen(Aineisto, Paikka, e0, n0, reach);
function pisteJanalla(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }

(async () => {
  Paikka.setOrigin(328000, 6823000);
  const R = rng(3030), out = [];
  const SATAMAT = [['Naistenlahti', 328250, 6823780, 560], ['Mustalahti', 326940, 6823415, 260]];
  const tilasto = {};
  for (const [nimi, E0, N0, sade] of SATAMAT) {
    const { ves, kuv } = await lataa(E0, N0, sade + 300);
    const a = Object.assign({}, V.ASETUKSET), onVesi = V.luoVesiTesti(kuv), esto = V.luoEsto(ves, kuv, a);
    const r = V.kiinnitaVeneet(ves, a, onVesi, { e: E0, n: N0, sade }, { esto });
    const segs = r.segLista || [];
    let n = 0, poijukentta = 0, maalla = 0, irti = 0;
    r.veneet.forEach(v => {
      if (R() < 0.18) return;   // ei jokaista paikkaa täytetä
      const e = v.e + (R() - 0.5) * 2.4, nn = v.n + (R() - 0.5) * 2.4, grid = v.suunta + (R() - 0.5) * 8, L = v.pituus * (0.92 + R() * 0.16);
      const ll = Paikka.enToLonLat(e, nn), conv = Paikka.convergenceDeg(ll.lon, ll.lat), tosi = ((grid + conv) % 360 + 360) % 360;
      out.push({ e: +e.toFixed(1), n: +nn.toFixed(1), suunta: +tosi.toFixed(1), pituus: +L.toFixed(1), leveys: +(v.leveys * (0.95 + R() * 0.1)).toFixed(1), luokka: v.luokka, varmuus: +(0.6 + R() * 0.35).toFixed(2), satama: nimi });
      n++;
    });
    // poijukenttä: avoin vesi 40 ... 120 m laiturista, keula mielivaltaiseen suuntaan
    let yrityksia = 0;
    while (poijukentta < (nimi === 'Naistenlahti' ? 14 : 5) && yrityksia++ < 20000) {
      const e = E0 + (R() - 0.5) * 2 * sade, nn = N0 + (R() - 0.5) * 2 * sade;
      if (!onVesi(e, nn)) continue;
      let dmin = 1e9; segs.forEach(s => { dmin = Math.min(dmin, pisteJanalla(e, nn, s.e0, s.n0, s.e1, s.n1)); });
      if (dmin < 40 || dmin > 120) continue;
      let ok = true; for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4; if (!onVesi(e + 12 * Math.sin(q), nn + 12 * Math.cos(q))) ok = false; }
      if (!ok) continue;
      const luokat = ['pieni', 'keski', 'keski', 'purje'], l = luokat[Math.floor(R() * 4)], pit = { pieni: 4.6, keski: 6.8, purje: 9.0 }[l];
      out.push({ e: +e.toFixed(1), n: +nn.toFixed(1), suunta: +(R() * 360).toFixed(1), pituus: pit, leveys: +(pit * 0.36).toFixed(1), luokka: l, varmuus: 0.55, satama: nimi }); poijukentta++;
    }
    // kolme maalla olevaa havaintoa: etsitään maapiste, jonka ympärillä ei ole vettä 15 m:ssä
    yrityksia = 0;
    while (maalla < 3 && yrityksia++ < 20000) {
      const e = E0 + (R() - 0.5) * 2 * sade, nn = N0 + (R() - 0.5) * 2 * sade;
      let kaikkiMaata = !onVesi(e, nn); for (let k = 0; k < 8 && kaikkiMaata; k++) { const q = k * Math.PI / 4; if (onVesi(e + 15 * Math.sin(q), nn + 15 * Math.cos(q))) kaikkiMaata = false; }
      if (!kaikkiMaata) continue;
      out.push({ e: +e.toFixed(1), n: +nn.toFixed(1), suunta: +(R() * 360).toFixed(1), pituus: 5.2, leveys: 1.9, luokka: 'keski', varmuus: 0.4, satama: nimi }); maalla++;
    }
    // kolme venettä laiturin vieressä, keula poispäin laiturista (poijua ei piirretä): perä 1,2 m laiturin reunasta
    yrityksia = 0;
    while (irti < 3 && yrityksia++ < 5000 && segs.length) {
      const s = segs[Math.floor(R() * segs.length)], l = Math.hypot(s.e1 - s.e0, s.n1 - s.n0); if (l < 12) continue;
      const t = 0.3 + 0.4 * R(), px = s.e0 + (s.e1 - s.e0) * t, py = s.n0 + (s.n1 - s.n0) * t, nx = -(s.n1 - s.n0) / l, ny = (s.e1 - s.e0) / l;
      for (const sg of [1, -1]) {
        const d = s.w / 2 + 1.2 + 3.1, e = px + nx * sg * d, nn = py + ny * sg * d;   // keskipiste: laiturin reuna + 1,2 + puolet pituudesta 3,1
        if (!onVesi(e, nn)) continue;
        let lahin = 1e9; segs.forEach(q => { lahin = Math.min(lahin, pisteJanalla(e, nn, q.e0, q.n0, q.e1, q.n1) - q.w / 2); });
        if (lahin < 1.5) continue;
        const keulaAlas = Math.atan2(nx * sg, ny * sg) * 180 / Math.PI, h = ((keulaAlas % 360) + 360) % 360;   // keula poispäin laiturista
        const ll = Paikka.enToLonLat(e, nn), conv = Paikka.convergenceDeg(ll.lon, ll.lat);
        out.push({ e: +e.toFixed(1), n: +nn.toFixed(1), suunta: +((h + conv + 360) % 360).toFixed(1), pituus: 6.2, leveys: 2.2, luokka: 'keski', varmuus: 0.7, satama: nimi }); irti++; break;
      }
    }
    tilasto[nimi] = { laituriveneista: n, poijukentalla: poijukentta, maalla, laituriin_selin: irti, segmentteja: segs.length };
  }
  const tiedosto = { lahde: 'Testitiedosto (laiturialgoritmin paikat poikkeamalla, poijukentän veneitä ja koe-erikoistapauksia), ei oikeaa ilmakuvatunnistusta', lisenssi: 'ei sovellu (testi)', lahdemerkinta: 'Testitiedosto veneet_testi.json (vaihe 3o).', ortokuvat: [], koordinaatisto: 'EPSG:3067', suunta_viite: 'tosi', veneet: out };
  const dst = process.argv[2] || path.join(__dirname, 'veneet_testi.json');
  fs.writeFileSync(dst, JSON.stringify(tiedosto));
  console.log('kirjoitettu', dst, out.length, 'venettä', JSON.stringify(tilasto));
})().catch(e => { console.error(e); process.exit(1); });
