/* Merimerkit3D – suomalaisten turvalaitteiden ja vesiliikennemerkkien 3D-mallit (three.js r128).
 *
 * Simulaattorin kopio (vaihe 3b, 25.10.2026) hakemiston /home/claude/merimerkit/ moduulista. Muutos: kummeli on epäsäännöllinen valkoiseksi maalattu
 * kivikasa heijastinlevyineen (malliKummeli ja Rak.kivi), muuten identtinen.
 * Vaihe 3g (25.10.2026): pienin leveys on 1,0 laitepikseliä (ei 3,5), ohuempi merkki piirretään vähintään pikselin levyisenä mutta peittävyys on todellinen
 * leveys jaettuna piirretyllä leveydellä (haalea viiva, ei täysi piste), ja merkki häivytetään ja jätetään piirtämättä luokkansa näkyvyysrajalla
 * (viitat ja poijut 1 200 m, kummelit, reunamerkit ja kyltit 2 500 m, linjataulut 4 000 m, loistot ja majakat 6 000 m). Kiikari kertoo rajat suurennuksella.
 *
 * Käyttö:  var obj = Merimerkit3D.luoMerkki(turvalaite, asetukset);   // THREE.Object3D, metreinä
 *          var ryhma = Merimerkit3D.luoInstanssit([{ turvalaite: t, x: 10, y: 20, z: 0 }, ...], asetukset);
 *
 * Koordinaatisto: malli on tehty z ylös -koordinaatistossa (x = itä, y = pohjoinen, z = ylös), origo vedenpinnassa
 * tai maanpinnassa merkin juuressa. Asetuksella ylos: 'y' malli kääntyy simulaattorin y ylös -maailmaan
 * (x = itä, y = ylös, z = -pohjoinen).
 *
 * Kaikilla malleilla on yksi yhteinen materiaali ja yksi jaettu geometria mallia kohti, joten yksi merkki on yksi
 * piirtokutsu ja luoInstanssit piirtää kaikki samanlaiset merkit yhdellä kutsulla. Viitoissa ja poijuissa ei ole
 * huippumerkkejä (tilaajan kanta). Huippumerkit ovat vain reunamerkeissä.
 *
 * Lähteet, mitat ja oletukset on kirjattu tiedostoon MERKIT.md. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  if (!THREE && typeof require === 'function') { try { THREE = require('./lib/three.min.js'); } catch (e) { THREE = null; } }
  if (!THREE) throw new Error('Merimerkit3D tarvitsee three.js r128:n (THREE).');

  var VERSIO = '1.0 (25.10.2026)';

  // ---------- värit (samat kuin Reittikartan symbols.js, EC-taulukko) ----------
  var VARI_HEX = { r: '#e2211c', g: '#13a04a', y: '#f2c311', b: '#111111', w: '#ffffff', sini: '#1f5fbf' };
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  var V = {}, V_ = V;
  Object.keys(VARI_HEX).forEach(function (k) { V[k] = hex2rgb(VARI_HEX[k]); });
  V.kiviValk = [0.92, 0.92, 0.9];       // maalattu kivi tai betoni
  V.harmaa = [0.45, 0.47, 0.5];
  V.tummaHarmaa = [0.2, 0.21, 0.23];
  V.lasi = [0.14, 0.17, 0.2];
  V.lamppu = [0.9, 0.88, 0.8];
  V.heijastinHopea = [0.86, 0.88, 0.9];
  V.katto = [0.55, 0.15, 0.12];
  V.aurinkopaneeli = [0.1, 0.16, 0.34];
  V.neutraali = [0.55, 0.57, 0.6];

  // Valon värikoodit (Väylävirasto: v valkoinen, p punainen, vi vihreä, k keltainen, si sininen), fysikaalinen RGB yönäkymää varten
  var VALO_RGB = { v: [1, 0.96, 0.82], k: [1, 0.78, 0.12], p: [1, 0.1, 0.08], vi: [0.1, 1, 0.3], si: [0.2, 0.5, 1] };

  // ---------- oletusasetukset ----------
  var ASETUKSET = {
    ylos: 'z',               // 'z' (oletus, tehtävänanto) tai 'y' (simulaattorin maailma)
    minPx: 1.0,              // pienin näkyvä leveys laitepikseleinä (vaihe 3g). Ohuempi osa levennetään tähän, ja sen peittävyys on todellinen leveys / piirretty leveys
    maanpinta: 0,            // maanpinnan korkeus vedenpinnasta (m) kiinteille merkeille, vähennetään valon korkeudesta
    suunta: null,            // taulun etupinnan suunta asteina pohjoisesta myötäpäivään (linjataulut ja vesiliikennemerkit)
    kilpiKoko: 0.96,         // vesiliikennemerkin sivu (m), määräys 12.4.2017 5 §: havaitsemisetäisyys alle 300 m
    kilpikuvat: true,        // käytä signs.js-kuvakkeita tekstuurina, jos ChartSigns on ladattu
    linjatauluVari: 'keltapunainen',   // 'keltapunainen' tai 'valkopunainen'
    kummeliTunnus: 'ei',     // 'ei' tai 'musta' (musta yläosa)
    kummeliKaukana: false,   // true: kummeli yksinkertaisena valkoisena kartiona (turvalaitteen kenttä kaukana = true vaikuttaa vain siihen merkkiin)
    tulostaLoki: true,       // kirjaa varamallit myös konsoliin
    // näkyvyysrajat metreinä luokittain (vaihe 3g). Merkki häivytetään välillä haivytysAlku ... 1 x raja ja jätetään piirtämättä rajan ulkopuolella.
    nakyvyysRaja: { viitta: 1200, pieni: 2500, linjataulu: 4000, loisto: 6000 },
    haivytysAlku: 0.7        // häivytys alkaa tällä osuudella rajasta (0,7 = 70 %)
  };
  function asetukset(a) { if (!a) return ASETUKSET; var o = {}; for (var k in ASETUKSET) o[k] = a[k] !== undefined ? a[k] : ASETUKSET[k]; return o; }

  // ---------- loki ----------
  var loki = [], lokiAvaimet = {};
  function kirjaa(avain, teksti, a) {
    if (lokiAvaimet[avain]) { lokiAvaimet[avain]++; return; }
    lokiAvaimet[avain] = 1; loki.push({ avain: avain, teksti: teksti });
    if (!a || a.tulostaLoki !== false) { if (typeof console !== 'undefined') console.warn('[Merimerkit3D] ' + teksti); }
  }

  // ---------- tekstuuriatlas (valkoinen ruutu + vesiliikennemerkit), yksi materiaali kaikelle ----------
  var ATLAS_PX = 512, SOLU = 64, SOLUJA = ATLAS_PX / SOLU;
  var atlas = { canvas: null, ctx: null, tex: null, seuraava: 1, slotit: {} };
  function atlasAlusta() {
    if (atlas.tex) return atlas.tex;
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = c.height = ATLAS_PX;
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
      atlas.canvas = c; atlas.ctx = g;
      atlas.tex = new THREE.CanvasTexture(c);
      atlas.tex.generateMipmaps = true; atlas.tex.minFilter = THREE.LinearMipmapLinearFilter; atlas.tex.magFilter = THREE.LinearFilter;
      atlas.tex.anisotropy = 4;
    } else {
      atlas.tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
      atlas.tex.needsUpdate = true;
    }
    return atlas.tex;
  }
  var UV_VALKOINEN = [(SOLU / 2) / ATLAS_PX, 1 - (SOLU / 2) / ATLAS_PX];
  function slotUV(i, ruutuun) {
    var sx = (i % SOLUJA) * SOLU, sy = Math.floor(i / SOLUJA) * SOLU, p = 1.5;
    return { u0: (sx + p) / ATLAS_PX, u1: (sx + SOLU - p) / ATLAS_PX, vYla: 1 - (sy + p) / ATLAS_PX, vAla: 1 - (sy + SOLU - p) / ATLAS_PX, x: sx, y: sy };
  }

  // Vesiliikennemerkin laji → [nimi, luokka]. Koodit ja luokat kuten Reittikartan signs.js:ssä (päätelty rekisteristä ja vesiliikennelaista).
  var KILPI = {
    1: ['Ankkurin käyttökielto', 'kielto'], 2: ['Pysäköimiskielto', 'kielto'], 3: ['Kiinnittymiskielto', 'kielto'], 4: ['Ohittamiskielto', 'kielto'],
    5: ['Kohtaamiskielto', 'kielto'], 6: ['Aallokon aiheuttamisen kielto', 'kielto'], 7: ['Vesihiihtokielto', 'kielto'], 8: ['Purjelautailukielto', 'kielto'],
    9: ['Moottorivoimalla kulkeminen kielletty', 'kielto'], 10: ['Vesiskootterilla ajo kielletty', 'kielto'],
    11: ['Nopeusrajoitus', 'rajoitus'], 12: ['Pysähtymismerkki', 'maarays'], 13: ['Yleinen varoitusmerkki', 'varoitus'], 14: ['Annettava äänimerkki', 'maarays'],
    15: ['Rajoitettu alikulkukorkeus', 'rajoitus'], 16: ['Rajoitettu kulkusyvyys', 'rajoitus'], 17: ['Rajoitettu kulkuleveys', 'rajoitus'],
    18: ['Voimakas virtaus', 'varoitus'], 19: ['Väylän reuna', 'varoitus'],
    22: ['Pysäköiminen sallittu', 'tiedotus'], 23: ['Kiinnittyminen sallittu', 'tiedotus'], 24: ['Ilmajohto', 'tiedotus'], 25: ['Puhelin', 'tiedotus'],
    26: ['Lauttaväylän risteäminen', 'tiedotus'], 27: ['Lauttaväylän risteäminen', 'tiedotus'], 28: ['Radiopuhelinyhteys', 'tiedotus'], 29: ['Juomavesipiste', 'tiedotus'],
    30: ['Kiellon, määräyksen tai rajoituksen päättyminen', 'paattyminen'], 31: ['Kaapelitaulu', 'taulu'], 32: ['Johtotaulu', 'taulu'],
    33: ['Suuntamerkki, alempi', 'suunta'], 34: ['Suuntamerkki, ylempi', 'suunta'], 35: ['Kaapeli- tai johtotaulu', 'taulu']
  };
  function fmtLuku(v) { var n = Number(v); return isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : ''; }

  // Piirtää kilven kuvan atlasin soluun x, y (SOLU x SOLU px). Yksinkertainen oma kuvio, jonka ChartSigns-kuva korvaa, kun se on käytettävissä.
  function maalaaKilpi(g, x, y, k) {
    var S = SOLU, RED = '#d7191c', BLUE = '#1f5fbf';
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, S, S); g.clip();
    var cat = k.cat;
    if (cat === 'taulu') {
      // 2,5 : 1 -taulu venytetään neliöön, joten teksti piirretään kapeana
      g.fillStyle = '#f4c400'; g.fillRect(0, 0, S, S); g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
      g.fillStyle = '#111'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(S / 2, S / 2); g.scale(0.4, 1); g.fillText(k.teksti || (k.laji === 31 ? 'KAAPELI' : 'JOHTO'), 0, 0); g.restore();
    } else if (cat === 'suunta') {
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.46, 0, 7); g.fill();
      g.fillStyle = RED; g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, 7); g.fill();
    } else if (cat === 'tiedotus') {
      g.fillStyle = BLUE; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(2, 2, S - 4, S - 4);
      g.fillStyle = '#fff'; kuvio(g, S, k, '#fff');
    } else {
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.strokeStyle = RED; g.lineWidth = S * 0.13; g.strokeRect(S * 0.065, S * 0.065, S * 0.87, S * 0.87);
      if (cat === 'paattyminen') { g.strokeStyle = '#111'; g.lineWidth = 7; g.beginPath(); g.moveTo(S * 0.2, S * 0.8); g.lineTo(S * 0.8, S * 0.2); g.stroke(); }
      else kuvio(g, S, k, '#111');
      if (cat === 'kielto') { g.strokeStyle = RED; g.lineWidth = 6; g.beginPath(); g.moveTo(S * 0.14, S * 0.14); g.lineTo(S * 0.86, S * 0.86); g.stroke(); }
    }
    g.restore();
  }
  function kuvio(g, S, k, c) {
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 4; g.textAlign = 'center'; g.textBaseline = 'middle';
    var arvo = fmtLuku(k.arvo);
    if (k.laji === 11 || k.laji === 16 || k.laji === 17 || k.laji === 19) { g.font = 'bold ' + (arvo.length > 2 ? 22 : 30) + 'px Arial, sans-serif'; g.fillText(arvo, S / 2, S / 2 + 2); return; }
    if (k.laji === 15) {
      g.beginPath(); g.moveTo(S * 0.36, S * 0.24); g.lineTo(S * 0.64, S * 0.24); g.lineTo(S / 2, S * 0.36); g.fill();
      g.font = 'bold ' + (arvo.length > 2 ? 20 : 26) + 'px Arial, sans-serif'; g.fillText(arvo, S / 2, S * 0.6); return;
    }
    if (k.laji === 6) {   // aallokko
      for (var j = 0; j < 2; j++) { g.beginPath(); var yy = S * (0.42 + j * 0.2); g.moveTo(S * 0.2, yy); for (var i = 0; i < 4; i++) g.quadraticCurveTo(S * (0.2 + 0.15 * i + 0.075), yy - 7, S * (0.2 + 0.15 * (i + 1)), yy); g.stroke(); }
      return;
    }
    if (k.laji === 2 || k.laji === 22) { g.font = 'bold 34px Arial, sans-serif'; g.fillText('P', S / 2, S / 2 + 2); return; }
    if (k.laji === 1) { g.beginPath(); g.moveTo(S / 2, S * 0.28); g.lineTo(S / 2, S * 0.72); g.moveTo(S * 0.36, S * 0.4); g.lineTo(S * 0.64, S * 0.4); g.moveTo(S * 0.28, S * 0.58); g.quadraticCurveTo(S / 2, S * 0.86, S * 0.72, S * 0.58); g.stroke(); return; }
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, 7); g.fill();
  }
  function kilpiSlotti(k) {
    var avain = k.laji + '|' + (k.arvo == null ? '' : k.arvo) + '|' + (k.teksti || '');
    if (atlas.slotit[avain] !== undefined) return atlas.slotit[avain];
    atlasAlusta();
    var i = atlas.seuraava < SOLUJA * SOLUJA ? atlas.seuraava++ : SOLUJA * SOLUJA - 1;
    atlas.slotit[avain] = i;
    var s = slotUV(i);
    if (atlas.ctx) {
      maalaaKilpi(atlas.ctx, s.x, s.y, k); atlas.tex.needsUpdate = true;
      // ChartSigns-kuvake korvaa oman kuvion, kun se latautuu
      if (k.kuva !== false && root.ChartSigns && typeof root.Image !== 'undefined' && typeof root.btoa === 'function' && k.cat !== 'taulu' && k.cat !== 'suunta' && k.cat !== 'suunta2') {
        try {
          var inf = root.ChartSigns.info({ vlmlajityyppi: k.laji, rajoitusarvo: k.arvo, lisakilventeksti1: k.teksti }, 64);
          var svg = String(inf.html).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/width="\d+" height="\d+"/, 'width="64" height="64"');
          var img = new root.Image();
          img.onload = function () { atlas.ctx.clearRect(s.x, s.y, SOLU, SOLU); atlas.ctx.drawImage(img, s.x, s.y, SOLU, SOLU); atlas.tex.needsUpdate = true; if (typeof api.onPaivitys === 'function') api.onPaivitys(); };
          img.src = 'data:image/svg+xml;base64,' + root.btoa(unescape(encodeURIComponent(svg)));
        } catch (e) { /* oma kuvio jää voimaan */ }
      }
    }
    return i;
  }

  // ---------- jaettu materiaali ----------
  // Pikselikoko: x = maailmayksikköä laitepikseliä kohti 1 m etäisyydellä (2 tan(fov/2) / (korkeus css-px x dpr)), y = piirtopuskurin pikseliä kohti.
  // Piirretty minimileveys on vähintään yksi puskuripikseli, jotta ohut kappale ei katoa rasteroinnissa (antialias on pois päältä).
  var pikseli = { value: new THREE.Vector2(0, 0) };
  var rajat = { value: new THREE.Vector4(1200, 2500, 4000, 6000) };   // luokkien 0 ... 3 näkyvyysrajat (m), kerrotaan kertoimella
  var kerroin = { value: 1 };       // kiikarin suurennus (paljain silmin 1)
  var haivytys = { value: 0.7 };
  var materiaali = null;
  function annaMateriaali() {
    if (materiaali) return materiaali;
    var m = new THREE.MeshLambertMaterial({ vertexColors: true, map: atlasAlusta(), side: THREE.FrontSide, transparent: true, depthWrite: true });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uPix = pikseli; sh.uniforms.uRaja = rajat; sh.uniforms.uKerroin = kerroin; sh.uniforms.uHaivytys = haivytys;
      // simulaattorin muutos: päivänvalon hajavalo (varjopuolen kirkkaus), jotta valkoiseksi maalatut merkit näyttävät valkoisilta myös varjopuolella
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'varying float vNak;\nvoid main() {')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vNak );\n if (vNak <= 0.004) discard;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.2;');
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute vec4 laaj;\nattribute vec2 nak;\nattribute float heij;\nattribute float valo;\nuniform vec2 uPix;\nuniform vec4 uRaja;\nuniform float uKerroin;\nuniform float uHaivytys;\nvarying float vNak;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          '#ifdef USE_INSTANCING\n mat4 mm_ = modelViewMatrix * instanceMatrix;\n#else\n mat4 mm_ = modelViewMatrix;\n#endif\n' +
          ' vec4 mvp_ = mm_ * vec4(position, 1.0);\n' +
          ' float dv_ = length(mvp_.xyz);\n' +
          ' float dob_ = length(mm_[3].xyz);\n' +
          ' float raja_ = (nak.x < 0.5 ? uRaja.x : (nak.x < 1.5 ? uRaja.y : (nak.x < 2.5 ? uRaja.z : uRaja.w))) * uKerroin;\n' +
          ' float on_ = step(0.001, laaj.w);\n' +
          ' float mh_ = 0.5 * max(laaj.w * uPix.x, on_ * uPix.y);\n' +      // piirretyn minimipuoliskon leveys metriä kohti
          ' float ex_ = min(max(0.0, mh_ * dv_ - laaj.z), 12.0) * on_;\n' +
          ' transformed.xy += laaj.xy * ex_;\n' +
          ' float dh_ = max(nak.y, mh_ * dob_);\n' +
          ' float fade_ = clamp((raja_ - dob_) / (raja_ * max(0.02, 1.0 - uHaivytys)), 0.0, 1.0);\n' +
          ' vNak = (nak.y > 0.0 ? nak.y / dh_ : 1.0) * fade_;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n if (fade_ <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    };
    m.customProgramCacheKey = function () { return 'merimerkit3d-v2-3g'; };
    m.name = 'merimerkit';
    materiaali = m; return m;
  }
  // Kameran asetus: korkeusPx = piirtoalueen korkeus css-pikseleinä, dpr = laitepikselisuhde, puskuriKorkeusPx = piirtopuskurin korkeus (oletus korkeusPx x dpr).
  function asetaKamera(kamera, korkeusPx, dpr, puskuriKorkeusPx) {
    var k = 2 * Math.tan((kamera.fov * Math.PI / 180) / 2); dpr = dpr || 1;
    asetaPikseli(k / (korkeusPx * dpr), k / (puskuriKorkeusPx || korkeusPx * dpr));
    return pikseli.value.x;
  }
  // maailmaaPerLaitePx = maailmayksikköä per laitepikseli 1 m etäisyydellä, maailmaaPerPuskuriPx samoin piirtopuskurin pikselille (oletus sama)
  function asetaPikseli(maailmaaPerLaitePx, maailmaaPerPuskuriPx) {
    pikseli.value.set(maailmaaPerLaitePx, maailmaaPerPuskuriPx === undefined ? maailmaaPerLaitePx : maailmaaPerPuskuriPx);
  }
  // Näkyvyysrajat luetaan asetuksista (luokat: viitta, pieni, linjataulu, loisto). suurennus kertoo rajat (kiikari), häivytysAlku asetuksista.
  function asetaNakyvyys(suurennus, as) {
    var a = as || ASETUKSET, r = a.nakyvyysRaja || ASETUKSET.nakyvyysRaja;
    rajat.value.set(r.viitta, r.pieni, r.linjataulu, r.loisto);
    kerroin.value = suurennus > 0 ? suurennus : 1;
    haivytys.value = a.haivytysAlku !== undefined ? a.haivytysAlku : 0.7;
  }
  // Luokka 0 = kelluvat viitat ja poijut, 1 = pienet kiinteät merkit (kummeli, reunamerkki, vesiliikennemerkki), 2 = linjataulu, 3 = loistot ja majakat (torni)
  var LUOKKA = { viitta: 0, poiju: 0, linjamerkki: 2, apuloisto: 3, sektoriloisto: 3, suuntaloisto: 3, majakka: 3, tunnusmajakka: 3 };
  function luokka(avain) { return LUOKKA[avain] !== undefined ? LUOKKA[avain] : 1; }

  // ---------- geometrian rakentaja ----------
  function Rak() { this.p = []; this.n = []; this.c = []; this.uv = []; this.l = []; this.h = []; this.v = []; this.k = []; this.minPx = 0; this.heij = 0; this.valo = 0; this.fw = 0; this.tri_ = 0; }
  Rak.prototype.vert = function (d) {
    this.p.push(d.p[0], d.p[1], d.p[2]); this.n.push(d.n[0], d.n[1], d.n[2]); this.c.push(d.c[0], d.c[1], d.c[2]);
    var uv = d.uv || UV_VALKOINEN; this.uv.push(uv[0], uv[1]);
    var lx = d.lx || 0, ly = d.ly || 0;
    this.l.push(lx, ly, d.r0 || 0, (lx || ly) ? this.minPx : 0);
    this.h.push(this.heij); this.v.push(this.valo); this.k.push(this.minPx > 0 ? this.fw : 0);
  };
  Rak.prototype.tri = function (a, b, c) { this.vert(a); this.vert(b); this.vert(c); this.tri_++; };
  Rak.prototype.nelio = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  // pyörähdyskappale (sylinteri tai katkaistu kartio); vari = väri tai fn(i) → väri (esim. pystyraidat)
  Rak.prototype.rengas = function (o) {
    var seg = o.seg || 12, cx = o.cx || 0, cy = o.cy || 0, dz = o.z1 - o.z0, dr = o.r1 - o.r0, len = Math.hypot(dz, dr) || 1, nr = dz / len, nz = -dr / len;
    var fw0 = this.fw; this.fw = Math.max(o.r0, o.r1);   // kohteen puolileveys peittävyyttä varten (vaihe 3g)
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, col = typeof o.vari === 'function' ? o.vari(i) : o.vari;
      var P = function (a, z, r) { var ca = Math.cos(a), sa = Math.sin(a), k = r > 1e-6 ? 1 : 0; return { p: [cx + ca * r, cy + sa * r, z], n: [ca * nr, sa * nr, nz], c: col, lx: ca * k, ly: sa * k, r0: r }; };
      var p00 = P(a0, o.z0, o.r0), p01 = P(a1, o.z0, o.r0), p11 = P(a1, o.z1, o.r1), p10 = P(a0, o.z1, o.r1);
      if (o.r0 > 1e-6) this.tri(p00, p01, p11);
      if (o.r1 > 1e-6) this.tri(p00, p11, p10);
      var kc = o.kansiVari || col;
      if (o.ylakansi && o.r1 > 1e-6) {
        var C = { p: [cx, cy, o.z1], n: [0, 0, 1], c: kc }, q0 = { p: p10.p, n: [0, 0, 1], c: kc, lx: p10.lx, ly: p10.ly, r0: o.r1 }, q1 = { p: p11.p, n: [0, 0, 1], c: kc, lx: p11.lx, ly: p11.ly, r0: o.r1 };
        this.tri(C, q0, q1);
      }
      if (o.alakansi && o.r0 > 1e-6) {
        var D = { p: [cx, cy, o.z0], n: [0, 0, -1], c: kc }, e0 = { p: p00.p, n: [0, 0, -1], c: kc, lx: p00.lx, ly: p00.ly, r0: o.r0 }, e1 = { p: p01.p, n: [0, 0, -1], c: kc, lx: p01.lx, ly: p01.ly, r0: o.r0 };
        this.tri(D, e1, e0);
      }
    }
    this.fw = fw0;
  };
  Rak.prototype.pallo = function (cx, cy, cz, r, col, seg, stk) {
    seg = seg || 8; stk = stk || 5;
    var P = function (a, lat) { var cl = Math.cos(lat), n = [cl * Math.cos(a), cl * Math.sin(a), Math.sin(lat)]; return { p: [cx + n[0] * r, cy + n[1] * r, cz + n[2] * r], n: n, c: col }; };
    for (var j = 0; j < stk; j++) for (var i = 0; i < seg; i++) {
      var l0 = -Math.PI / 2 + Math.PI * j / stk, l1 = -Math.PI / 2 + Math.PI * (j + 1) / stk, a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var p00 = P(a0, l0), p01 = P(a1, l0), p11 = P(a1, l1), p10 = P(a0, l1);
      if (j > 0) this.tri(p00, p01, p11);
      if (j < stk - 1) this.tri(p00, p11, p10);
    }
  };
  // suuntalaatikko: keskipiste c ja puoliakselit ax, ay, az (vektoreita). Tahkojen kiertosuunta korjataan niin, että normaalit osoittavat ulospäin.
  Rak.prototype.laatikkoV = function (c, ax, ay, az, col) {
    var self = this;
    function add(s, t, u) { return [c[0] + s * ax[0] + t * ay[0] + u * az[0], c[1] + s * ax[1] + t * ay[1] + u * az[1], c[2] + s * ax[2] + t * ay[2] + u * az[2]]; }
    function face(p0, p1, p2, p3) {
      var e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      var f = [(p0[0] + p2[0]) / 2 - c[0], (p0[1] + p2[1]) / 2 - c[1], (p0[2] + p2[2]) / 2 - c[2]];
      if (n[0] * f[0] + n[1] * f[1] + n[2] * f[2] < 0) { var t = p1; p1 = p3; p3 = t; n = [-n[0], -n[1], -n[2]]; }
      self.nelio({ p: p0, n: n, c: col }, { p: p1, n: n, c: col }, { p: p2, n: n, c: col }, { p: p3, n: n, c: col });
    }
    [-1, 1].forEach(function (s) {
      face(add(s, -1, -1), add(s, 1, -1), add(s, 1, 1), add(s, -1, 1));
      face(add(-1, s, -1), add(1, s, -1), add(1, s, 1), add(-1, s, 1));
      face(add(-1, -1, s), add(1, -1, s), add(1, 1, s), add(-1, 1, s));
    });
  };
  // pystyasentoinen laatikko: pohjan keskipiste cx, cy, korkeus z0..z0+h, mitat wx x wy, kierto rot (rad)
  Rak.prototype.laatikko = function (cx, cy, z0, wx, wy, h, rot, col) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    this.laatikkoV([cx, cy, z0 + h / 2], [c * wx / 2, s * wx / 2, 0], [-s * wy / 2, c * wy / 2, 0], [0, 0, h / 2], col);
  };
  // nelisivuinen katkaistu pyramidi (torni): pohjaleveys w0, yläleveys w1, kierto rot
  Rak.prototype.prisma = function (cx, cy, z0, z1, w0, w1, rot, vari) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0), self = this, fw0 = this.fw; this.fw = Math.max(w0, w1) / 2;
    function K(i, z, w) { var sx = (i === 0 || i === 3) ? -1 : 1, sy = (i < 2) ? -1 : 1, x = sx * w / 2, y = sy * w / 2, px = cx + c * x - s * y, py = cy + s * x + c * y, r = Math.hypot(px - cx, py - cy) || 1; return { p: [px, py, z], lx: (px - cx) / r, ly: (py - cy) / r, r0: r }; }
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4, a = K(i, z0, w0), b = K(j, z0, w0), t = K(j, z1, w1), u = K(i, z1, w1);
      var e1 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], e2 = [u.p[0] - a.p[0], u.p[1] - a.p[1], u.p[2] - a.p[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      [a, b, t, u].forEach(function (v) { v.n = n; v.c = vari; });
      if (n[0] * (a.p[0] - cx) + n[1] * (a.p[1] - cy) < 0) { n = [-n[0], -n[1], -n[2]]; [a, b, t, u].forEach(function (v) { v.n = n; }); self.nelio(a, u, t, b); }
      else self.nelio(a, b, t, u);
    }
    this.fw = fw0;
  };
  Rak.prototype.pyramidi = function (cx, cy, z0, w, h, rot, col) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0), apex = [cx, cy, z0 + h];
    function K(i) { var sx = (i === 0 || i === 3) ? -1 : 1, sy = (i < 2) ? -1 : 1, x = sx * w / 2, y = sy * w / 2; return [cx + c * x - s * y, cy + s * x + c * y, z0]; }
    for (var i = 0; i < 4; i++) {
      var a = K(i), b = K((i + 1) % 4), e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[0] * (a[0] - cx) + n[1] * (a[1] - cy) < 0) { n = [-n[0], -n[1], -n[2]]; this.tri({ p: a, n: n, c: col }, { p: apex, n: n, c: col }, { p: b, n: n, c: col }); }
      else this.tri({ p: a, n: n, c: col }, { p: b, n: n, c: col }, { p: apex, n: n, c: col });
    }
  };
  Rak.prototype.oktaedri = function (cx, cy, cz, r, col) {
    var self = this;
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { [-1, 1].forEach(function (sz) {
      var pa = [cx + sx * r, cy, cz], pb = [cx, cy + sy * r, cz], pc = [cx, cy, cz + sz * r];
      var e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[0] * sx + n[1] * sy + n[2] * sz < 0) { n = [-n[0], -n[1], -n[2]]; self.tri({ p: pa, n: n, c: col }, { p: pc, n: n, c: col }, { p: pb, n: n, c: col }); }
      else self.tri({ p: pa, n: n, c: col }, { p: pb, n: n, c: col }, { p: pc, n: n, c: col });
    }); }); });
  };
  // Pystytaulu: keskipiste cx, cy, alareuna z0, leveys w, korkeus h, etupinnan suunta (asteina pohjoisesta myötäpäivään).
  // vari = etupinnan väri tai taulukko pystyraidoista [[osuus, väri], ...] vasemmalta oikealle katsojan kannalta. uv = atlasruutu.
  // Pienin näkyvä leveys levittää taulua koko leveydeltään tasaisesti (vaakasuunnassa).
  Rak.prototype.taulu = function (o) {
    var th = (o.suunta || 0) * Math.PI / 180, nx = Math.sin(th), ny = Math.cos(th), lx = Math.cos(th), ly = -Math.sin(th);   // (lx, ly) = katsojan vasen
    var off = o.paksuus === undefined ? 0.02 : o.paksuus, w = o.w, h = o.h, s0 = w / 2, self = this, z0 = o.z0, z1 = o.z0 + h, uv = o.uv, fw0 = this.fw; this.fw = s0;
    function V(s, z, sivu, n, c, uvp) { return { p: [o.cx + lx * s + nx * sivu, o.cy + ly * s + ny * sivu, z], n: n, c: c, uv: uvp, lx: lx * s / s0, ly: ly * s / s0, r0: s0 }; }
    var pal = Array.isArray(o.vari) ? o.vari : [[1, o.vari]], nf = [nx, ny, 0], nb = [-nx, -ny, 0], cur = s0;
    pal.forEach(function (st) {
      var sl = cur, sr = cur - st[0] * w; cur = sr;
      var ul = uv ? uv.u0 + (uv.u1 - uv.u0) * (s0 - sl) / w : 0, ur = uv ? uv.u0 + (uv.u1 - uv.u0) * (s0 - sr) / w : 0;
      var A = uv ? [ul, uv.vAla] : null, Bv = uv ? [ur, uv.vAla] : null, C = uv ? [ur, uv.vYla] : null, D = uv ? [ul, uv.vYla] : null;
      self.nelio(V(sl, z0, off, nf, st[1], A), V(sr, z0, off, nf, st[1], Bv), V(sr, z1, off, nf, st[1], C), V(sl, z1, off, nf, st[1], D));
    });
    var bc = o.takaVari || V_.harmaa;
    this.nelio(V(-s0, z0, -off, nb, bc), V(s0, z0, -off, nb, bc), V(s0, z1, -off, nb, bc), V(-s0, z1, -off, nb, bc));
    this.fw = fw0;
  };

  // luokka = näkyvyysluokka (0 ... 3), fwMalli = mallin puolileveys (m): kohteille, joilla ei ole omaa puolileveyttä, käytetään mallin leveyttä
  Rak.prototype.geometria = function (luokkaNro, fwMalli) {
    var g = new THREE.BufferGeometry(), nk = new Float32Array(this.k.length * 2);
    for (var q = 0; q < this.k.length; q++) { nk[2 * q] = luokkaNro || 0; nk[2 * q + 1] = this.k[q] > 0 ? this.k[q] : (fwMalli || 0); }
    g.setAttribute('nak', new THREE.BufferAttribute(nk, 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('laaj', new THREE.Float32BufferAttribute(this.l, 4));
    g.setAttribute('heij', new THREE.Float32BufferAttribute(this.h, 1));
    g.setAttribute('valo', new THREE.Float32BufferAttribute(this.v, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    // pienin näkyvä leveys levittää pintoja enintään 12 m, joten rajapallo kasvatetaan
    g.boundingSphere.radius += 12.5;
    return g;
  };

  // ---------- osat: värit ja heijastimet ----------
  // Raidoitus ylhäältä alas (kuten symbols.js BANDS). 'rw' = punavalkoiset pystyraidat.
  var RAIDAT = { 1: ['r'], 2: ['g'], 3: ['b', 'y'], 4: ['y', 'b'], 5: ['y', 'b', 'y'], 6: ['b', 'y', 'b'], 7: ['b', 'r', 'b'], 8: ['rw'], 9: ['y'] };
  // Heijastinraidat ylhäältä alas (Liikenneviraston määräys 28.5.2015, 9, 12, 14, 16 ja 18 §)
  var HEIJASTIN = { 1: ['r'], 2: ['g'], 3: ['sini', 'y'], 4: ['y', 'sini'], 5: ['y', 'y'], 6: ['sini', 'sini'], 7: ['r', 'sini'], 8: ['w', 'r'], 9: ['y'] };
  var NL_NIMI = { 1: 'lateraali vasen', 2: 'lateraali oikea', 3: 'kardinaali pohjoinen', 4: 'kardinaali etelä', 5: 'kardinaali länsi', 6: 'kardinaali itä', 7: 'karimerkki', 8: 'turvavesimerkki', 9: 'erikoismerkki' };

  // Pyörähdysrunko profiilista [[z, r], ...] raidoitettuna nl:n mukaan. Palauttaa korkeuden.
  function runko(B, profiili, nl, seg, minPx) {
    var H = profiili[profiili.length - 1][0], raidat = RAIDAT[nl] || ['neutr'];
    function vari(zm) { var i = Math.min(raidat.length - 1, Math.floor((1 - zm / H) * raidat.length)); var k = raidat[i]; return k === 'neutr' ? V.neutraali : V[k]; }
    B.minPx = minPx;
    for (var s = 0; s < profiili.length - 1; s++) {
      var a = profiili[s], b = profiili[s + 1], rajat = [a[0]];
      // jaa segmentti raitojen rajoilla
      for (var k = 1; k < raidat.length; k++) { var zr = H * (1 - k / raidat.length); if (zr > a[0] + 1e-6 && zr < b[0] - 1e-6) rajat.push(zr); }
      rajat.push(b[0]); rajat.sort(function (p, q) { return p - q; });
      for (var q = 0; q < rajat.length - 1; q++) {
        var z0 = rajat[q], z1 = rajat[q + 1], t0 = (z0 - a[0]) / (b[0] - a[0]), t1 = (z1 - a[0]) / (b[0] - a[0]);
        var r0 = a[1] + (b[1] - a[1]) * t0, r1 = a[1] + (b[1] - a[1]) * t1, zm = (z0 + z1) / 2;
        if (nl === 8) B.rengas({ z0: z0, z1: z1, r0: r0, r1: r1, seg: seg, vari: function (i) { return i % 2 ? V.w : V.r; }, ylakansi: q === rajat.length - 2 && s === profiili.length - 2, kansiVari: V.w });
        else B.rengas({ z0: z0, z1: z1, r0: r0, r1: r1, seg: seg, vari: vari(zm), ylakansi: q === rajat.length - 2 && s === profiili.length - 2 });
      }
    }
    B.minPx = 0;
    return H;
  }
  function sadeKorkeudella(profiili, z) {
    for (var i = 0; i < profiili.length - 1; i++) { var a = profiili[i], b = profiili[i + 1]; if (z >= a[0] && z <= b[0]) return a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); }
    return profiili[profiili.length - 1][1];
  }
  // heijastinnauhat rungon yläosaan (hieman rungon pinnan päälle)
  function heijastimet(B, profiili, nl, seg, minPx) {
    var H = profiili[profiili.length - 1][0], list = HEIJASTIN[nl] || ['w'], kork = 0.11, vali = 0.04, z = H - 0.18;
    B.heij = 1; B.minPx = minPx;
    list.forEach(function (k) {
      var z1 = z, z0 = z - kork, r0 = sadeKorkeudella(profiili, z0) + 0.004, r1 = sadeKorkeudella(profiili, z1) + 0.004;
      B.rengas({ z0: z0, z1: z1, r0: r0, r1: r1, seg: seg, vari: V[k] });
      z = z0 - vali;
    });
    B.heij = 0; B.minPx = 0;
  }
  function lyhty(B, zKeski, r, minPx) {
    B.valo = 1; B.minPx = minPx;
    B.rengas({ z0: zKeski - 0.15, z1: zKeski + 0.15, r0: r, r1: r, seg: 10, vari: V.lamppu, ylakansi: true });
    B.valo = 0; B.minPx = 0;
  }

  // ---------- mallit ----------
  // Palauttavat metatiedot {malli, korkeus, halkaisija, huippumerkki, pienin_nakyva_px, valoZ, osat[]}
  function malliViitta(B, p, a) {
    var jaa = p.jaaviitta, r = jaa ? 0.25 : 0.1125, seg = jaa ? 14 : 12;
    var Hrunko = jaa ? 3.6 : 2.0, valoZ = null;
    if (p.valaistu) { valoZ = Math.max(p.valoKorkeus || 2.5, Hrunko + 0.15); Hrunko = valoZ - 0.15; }
    var prof = [[0, r], [Hrunko, r]];
    runko(B, prof, p.nl, seg, a.minPx);
    heijastimet(B, prof, p.nl, seg, a.minPx);
    if (valoZ !== null) lyhty(B, valoZ, Math.min(r, 0.12) + 0.02, a.minPx);
    return { malli: (jaa ? 'jaaviitta' : 'viitta') + '_' + p.nl + (valoZ !== null ? '_valo' : ''), korkeus: valoZ !== null ? valoZ + 0.15 : Hrunko, halkaisija: 2 * r, huippumerkki: false, valoZ: valoZ,
      osat: ['runko (raidoitus ' + NL_NIMI[p.nl] + ')', 'heijastinnauhat'].concat(valoZ !== null ? ['valolaite'] : []) };
  }
  function malliPoiju(B, p, a) {
    var H = 3.0, valoZ = null;
    if (p.valaistu) { valoZ = Math.max(p.valoKorkeus || 3.2, 2.4); H = valoZ - 0.15; }
    var prof = [[0, 0.42], [1.0, 0.42], [1.7, 0.25], [H, 0.25]];
    runko(B, prof, p.nl, 14, a.minPx);
    heijastimet(B, prof, p.nl, 14, a.minPx);
    if (valoZ !== null) lyhty(B, valoZ, 0.2, a.minPx);
    return { malli: 'poiju_' + p.nl + (valoZ !== null ? '_valo' : ''), korkeus: valoZ !== null ? valoZ + 0.15 : H, halkaisija: 0.84, huippumerkki: false, valoZ: valoZ,
      osat: ['pilaripoijun runko (raidoitus ' + NL_NIMI[p.nl] + ')', 'heijastinnauhat'].concat(valoZ !== null ? ['valolaite'] : []) };
  }
  // huippumerkki reunamerkkiin; palauttaa nimen
  function huippumerkki(B, nl, z, minPx) {
    var R = 0.28, h = 0.42, g = 0.07;
    B.minPx = minPx;
    var kartio = function (z0, karkiYlos, col) { B.rengas({ z0: z0, z1: z0 + h, r0: karkiYlos ? R : 0, r1: karkiYlos ? 0 : R, seg: 10, vari: col, alakansi: karkiYlos, ylakansi: !karkiYlos }); };
    var nimi;
    switch (nl) {
      case 1: B.rengas({ z0: z + 0.04, z1: z + 0.54, r0: 0.27, r1: 0.27, seg: 10, vari: V.r, ylakansi: true, alakansi: true }); nimi = 'punainen lieriö'; break;
      case 2: B.rengas({ z0: z + 0.04, z1: z + 0.54, r0: 0.28, r1: 0, seg: 10, vari: V.g, alakansi: true }); nimi = 'vihreä kartio, kärki ylös'; break;
      case 3: kartio(z, true, V.b); kartio(z + h + g, true, V.b); nimi = 'kaksi mustaa kartiota, kärjet ylös'; break;
      case 4: kartio(z, false, V.b); kartio(z + h + g, false, V.b); nimi = 'kaksi mustaa kartiota, kärjet alas'; break;
      case 5: kartio(z, true, V.b); kartio(z + h + g, false, V.b); nimi = 'kaksi mustaa kartiota, kärjet vastakkain'; break;
      case 6: kartio(z, false, V.b); kartio(z + h + g, true, V.b); nimi = 'kaksi mustaa kartiota, kannat vastakkain'; break;
      case 7: B.pallo(0, 0, z + 0.2, 0.2, V.b); B.pallo(0, 0, z + 0.66, 0.2, V.b); nimi = 'kaksi mustaa palloa'; break;
      case 8: B.pallo(0, 0, z + 0.3, 0.3, V.r, 10, 6); nimi = 'yksi punainen pallo'; break;
      case 9:
        var d = 0.34, e = 0.06, t = 0.05;
        B.laatikkoV([0, 0, z + 0.45], [d, 0, d], [0, t, 0], [-e, 0, e], V.y);   // kaksi ristikkäistä levyä muodostaa X:n
        B.laatikkoV([0, 0, z + 0.45], [d, 0, -d], [0, t, 0], [e, 0, e], V.y);
        nimi = 'ristikkäiset keltaiset levyt'; break;
      default: nimi = null;
    }
    B.minPx = 0; return nimi;
  }
  function malliReunamerkki(B, p, a) {
    var F = p.valaistu ? (p.valoKorkeus || 4.5) : null;
    var Ht = Math.max((F !== null ? F - p.maanpinta : 4.0) + (F !== null ? 0.9 : 0), 3.0);
    var prof = [[0, 0.35], [Ht, 0.2]];
    runko(B, prof, p.nl, 10, a.minPx);
    heijastimet(B, prof, p.nl, 10, a.minPx);
    // tutkaheijastin kolmitahkoheijastimena (oktaedri) rungon sivulla
    B.minPx = a.minPx; B.laatikko(0.3, 0, Ht - 0.84, 0.5, 0.05, 0.05, 0, V.harmaa); B.oktaedri(0.55, 0, Ht - 0.82, 0.22, V.heijastinHopea); B.minPx = 0;
    var hm = huippumerkki(B, p.nl, Ht, a.minPx), valoZ = null;
    if (F !== null) { valoZ = Math.max(F - p.maanpinta, 1.5); lyhty(B, valoZ, sadeKorkeudella(prof, Math.min(valoZ, Ht)) + 0.05, a.minPx); }
    return { malli: 'reunamerkki_' + p.nl + (F !== null ? '_valo' : ''), korkeus: Ht + (hm ? 0.9 : 0), halkaisija: 0.7, huippumerkki: hm, valoZ: valoZ,
      osat: ['pylväs (raidoitus ' + NL_NIMI[p.nl] + ')', 'heijastinnauhat', 'tutkaheijastin'].concat(hm ? ['huippumerkki: ' + hm] : []).concat(F !== null ? ['valolaite'] : []) };
  }
  // Kummeli: pienistä kivistä (läpimitta noin 0,2-0,35 m) tiiviiksi kartioksi kasattu, valkoiseksi maalattu kivikasa ja yläosassa heijastinlevyt
  // (vaihe 3b, tilaajan kanta ja lähteet RAPORTTI_vaihe3b.md). Mitat ovat oletuksia: pohja noin 2,9 m, korkeus noin 2,3 m heijastimineen.
  // Lähimalli (alle noin 150 m): kivet kerroksina kartion pinnalla ja tummempi sisäkartio kivien välissä, jolloin pinta näyttää rakeiselta.
  // Kaukomalli (p.kaukana, yli noin 150 m): yksinkertainen valkoinen kartio samalla siluetilla. Sama siemen (1906) jokaiselle kummelille.
  function siemen(n) { return function () { n = (n + 0x6D2B79F5) | 0; var t = Math.imul(n ^ (n >>> 15), 1 | n); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // epäsäännöllinen lohkare: litistetty, kierretty ja kärkipisteistä hajautettu pallo (seg x stk), tasaiset tahkot. rnd = siemenfunktio.
  Rak.prototype.kivi = function (cx, cy, cz, rx, ry, rz, rot, col, seg, stk, rnd) {
    seg = seg || 7; stk = stk || 3; rnd = rnd || function () { return 0.5; };
    var cr = Math.cos(rot), sr = Math.sin(rot), self = this, V3 = [];
    for (var j = 0; j <= stk; j++) {
      var lat = -Math.PI / 2 + Math.PI * j / stk, cl = Math.cos(lat), row = [];
      for (var i = 0; i < seg; i++) {
        if ((j === 0 || j === stk) && i > 0) { row.push(row[0]); continue; }
        var a = i / seg * Math.PI * 2 + (rnd() - 0.5) * 0.35, k = 1 + (rnd() - 0.5) * 0.38;
        var px = cl * Math.cos(a) * rx * k, py = cl * Math.sin(a) * ry * k, pz = Math.sin(lat) * rz * (1 + (rnd() - 0.5) * 0.2);
        row.push([cx + cr * px - sr * py, cy + sr * px + cr * py, cz + pz]);
      }
      V3.push(row);
    }
    function face(p0, p1, p2) {
      var u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      var n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-9) return;
      n = [n[0] / l, n[1] / l, n[2] / l];
      var mx = (p0[0] + p1[0] + p2[0]) / 3 - cx, my = (p0[1] + p1[1] + p2[1]) / 3 - cy, mz = (p0[2] + p1[2] + p2[2]) / 3 - cz;
      if (n[0] * mx + n[1] * my + n[2] * mz < 0) { var t = p1; p1 = p2; p2 = t; n = [-n[0], -n[1], -n[2]]; }
      var sh = 0.93 + 0.07 * n[2];   // yläpinnat hieman vaaleampia
      var c = [col[0] * sh, col[1] * sh, col[2] * sh];
      self.tri({ p: p0, n: n, c: c }, { p: p1, n: n, c: c }, { p: p2, n: n, c: c });
    }
    for (var jj = 0; jj < stk; jj++) for (var ii = 0; ii < seg; ii++) {
      var i1 = (ii + 1) % seg, p00 = V3[jj][ii], p01 = V3[jj][i1], p10 = V3[jj + 1][ii], p11 = V3[jj + 1][i1];
      if (jj > 0) face(p00, p01, p11);
      if (jj < stk - 1) face(p00, p11, p10);
    }
  };
  function malliKummeli(B, p, a) {
    var rnd = siemen(1906), musta = a.kummeliTunnus === 'musta', kaukana = !!p.kaukana, n = 0, kork = 0;
    var HK = 1.75, R0 = 1.3;   // kasan korkeus (m) ja ulkokehän säde pohjalla (kivien keskipisteet)
    B.minPx = a.minPx;
    if (kaukana) {
      B.rengas({ z0: 0, z1: HK, r0: R0 + 0.15, r1: 0.18, vari: [V.kiviValk[0] * 0.93, V.kiviValk[1] * 0.93, V.kiviValk[2] * 0.93], seg: 12, ylakansi: true });
      kork = HK;
    } else {
      // sisäkartio: hieman kivien pintaa pienempi ja tummempi, näkyy kivien välistä
      B.rengas({ z0: 0, z1: HK - 0.05, r0: R0 - 0.1, r1: 0.1, vari: [V.kiviValk[0] * 0.66, V.kiviValk[1] * 0.66, V.kiviValk[2] * 0.66], seg: 10, ylakansi: true });
      for (var z = 0.12; z < HK - 0.02; z += 0.2) {
        var R = Math.max(0, R0 * (1 - z / (HK + 0.2))), m = Math.max(1, Math.round(2 * Math.PI * R / 0.3));
        for (var i = 0; i < m; i++) {
          var ang = (i + rnd() * 0.8) / m * Math.PI * 2, rr = R * (0.9 + rnd() * 0.2), r = 0.1 + rnd() * 0.075;   // läpimitta 0,2-0,35 m
          var sh = 0.84 + rnd() * 0.14, col = [V.kiviValk[0] * sh, V.kiviValk[1] * sh, V.kiviValk[2] * sh * (0.98 + rnd() * 0.02)];
          var zz = z + (rnd() - 0.5) * 0.06, rz = r * (0.7 + rnd() * 0.25);
          B.kivi(Math.cos(ang) * rr, Math.sin(ang) * rr, zz, r, r * (0.8 + rnd() * 0.3), rz, rnd() * 3.14, col, 6, 2, rnd);
          n++; kork = Math.max(kork, zz + rz);
        }
      }
    }
    // heijastin: kaksi ristikkäistä levyä lyhyellä tolpalla kasan päällä (heij = yönäkymän korostus)
    var zt = kork - 0.05;
    B.laatikko(0, 0, zt, 0.05, 0.05, 0.3, 0, V.tummaHarmaa);
    B.heij = 1;
    B.laatikko(0, 0.0, zt + 0.22, 0.42, 0.03, 0.34, 0, V.heijastinHopea);
    B.laatikko(0, 0.0, zt + 0.22, 0.03, 0.42, 0.34, 0, V.heijastinHopea);
    B.heij = 0;
    var H = zt + 0.56;
    if (musta) { B.laatikko(0, 0, H, 0.2, 0.2, 0.2, 0, V.b); H += 0.2; }
    B.minPx = 0;
    return { malli: 'kummeli' + (kaukana ? '_kaukana' : '') + (musta ? '_musta' : ''), korkeus: H, halkaisija: 2.9, huippumerkki: false, valoZ: null, lohkareita: n,
      osat: [kaukana ? 'valkoinen kartio (kaukomalli)' : 'valkoiseksi maalattu kivikasa (' + n + ' pientä kiveä)', 'heijastinlevyt'].concat(musta ? ['musta tunnus'] : []) };
  }
  function malliLinjamerkki(B, p, a) {
    var ylempi = /ylemp|taka|ylä/i.test(p.nimi || ''), w = ylempi ? 2.4 : 1.8, h = ylempi ? 3.2 : 2.4, zk = ylempi ? 9.0 : 5.0;   // taulun keskikorkeus
    var z0 = zk - h / 2, vari = a.linjatauluVari === 'valkopunainen' ? V.w : V.y;
    B.minPx = a.minPx;
    B.prisma(0, 0, 0, z0 + 0.2, 0.42, 0.32, 0, V.tummaHarmaa);          // ristikkomaston korvike (suorakaidepylväs)
    B.taulu({ cx: 0, cy: 0.26, z0: z0, w: w, h: h, suunta: 0, vari: [[0.32, vari], [0.36, V.r], [0.32, vari]], takaVari: V.harmaa, paksuus: 0.02 });
    var valoZ = null;
    if (p.valaistu) {
      valoZ = zk; B.valo = 1;
      B.laatikkoV([0, 0.42, zk], [0.12, 0, 0], [0, 0.12, 0], [0, 0, 0.12], V.lamppu); B.valo = 0;
    }
    B.minPx = 0;
    return { malli: 'linjamerkki_' + (ylempi ? 'taka' : 'etu'), korkeus: z0 + h, halkaisija: w, huippumerkki: false, valoZ: valoZ, osat: ['maston korvike', (ylempi ? 'takataulu ' : 'etutaulu ') + w + ' x ' + h + ' m, ' + (a.linjatauluVari === 'valkopunainen' ? 'valkoinen' : 'keltainen') + ' kenttä ja punainen pystyraita'] };
  }
  // loistotorni: pyöreä, hieman kapeneva valkoinen runko, lyhty huipulla (valon korkeus keskellä)
  function malliLoisto(B, p, a, laji) {
    var F = p.valoKorkeus || 5.0, Ht = Math.max(F - p.maanpinta, 2.5);   // valon korkeus mallin origosta
    var r0 = Math.max(0.18, Math.min(0.8, 0.06 * Ht)), r1 = r0 * 0.7;
    B.minPx = a.minPx;
    B.rengas({ z0: 0, z1: Ht - 0.3, r0: r0, r1: r1 * 0.95, seg: 10, vari: V.w, alakansi: true });
    B.valo = 1; B.rengas({ z0: Ht - 0.3, z1: Ht + 0.3, r0: r1 * 0.95 + 0.04, r1: r1 * 0.95 + 0.04, seg: 10, vari: V.lasi }); B.valo = 0;
    B.rengas({ z0: Ht + 0.3, z1: Ht + 0.7, r0: r1 * 0.95 + 0.08, r1: 0, seg: 10, vari: V.tummaHarmaa, alakansi: true });
    B.minPx = 0;
    return { malli: laji, korkeus: Ht + 0.7, halkaisija: 2 * r0, huippumerkki: false, valoZ: Ht, osat: ['valkoinen torni', 'lyhty (valon korkeus ' + Ht.toFixed(1) + ' m mallin juuresta)', 'kupolikatto'] };
  }
  // Siilinkari: pieni valkoinen loistokoppi luodolla, aurinkopaneeli kyljessä (Yle 2022, Pixeo)
  function malliSiilinkari(B, p, a) {
    var F = p.valoKorkeus || 6.5, Ht = Math.max(F - p.maanpinta, 3.0), r0 = 0.85, r1 = 0.6;
    B.minPx = a.minPx;
    B.rengas({ z0: 0, z1: Ht - 0.35, r0: r0, r1: r1, seg: 12, vari: V.w, alakansi: true });
    B.valo = 1; B.rengas({ z0: Ht - 0.35, z1: Ht + 0.35, r0: r1 + 0.05, r1: r1 + 0.05, seg: 12, vari: V.lasi }); B.valo = 0;
    B.rengas({ z0: Ht + 0.35, z1: Ht + 0.8, r0: r1 + 0.1, r1: 0, seg: 12, vari: V.tummaHarmaa, alakansi: true });
    B.laatikko(r1 + 0.1, 0, Ht - 2.1, 0.08, 0.9, 0.9, 0, V.aurinkopaneeli);
    B.minPx = 0;
    return { malli: 'apuloisto_siilinkari', korkeus: Ht + 0.8, halkaisija: 2 * r0, huippumerkki: false, valoZ: Ht, osat: ['valkoinen loistokoppi', 'lyhty', 'kupolikatto', 'aurinkopaneeli'] };
  }
  function malliMajakka(B, p, a) {
    var F = p.valoKorkeus || 15, Ht = Math.max(F - p.maanpinta, 6), r0 = Math.max(1.2, 0.07 * Ht), r1 = r0 * 0.62, rz = function (z) { return r0 + (r1 - r0) * z / (Ht - 1.2); };
    B.minPx = a.minPx;
    var n = 5, zT = Ht - 1.2;
    for (var i = 0; i < n; i++) B.rengas({ z0: zT * i / n, z1: zT * (i + 1) / n, r0: rz(zT * i / n), r1: rz(zT * (i + 1) / n), seg: 14, vari: i % 2 === 1 ? V.r : V.w, alakansi: i === 0 });
    B.rengas({ z0: zT, z1: zT + 0.15, r0: r1 + 0.5, r1: r1 + 0.5, seg: 14, vari: V.tummaHarmaa, alakansi: true, ylakansi: true });
    B.valo = 1; B.rengas({ z0: zT + 0.15, z1: Ht + 0.15, r0: r1 * 0.8, r1: r1 * 0.8, seg: 14, vari: V.lasi }); B.valo = 0;
    B.rengas({ z0: Ht + 0.15, z1: Ht + 0.15 + r1, r0: r1 * 0.85, r1: 0, seg: 14, vari: V.katto, alakansi: true });
    B.minPx = 0;
    return { malli: 'majakka', korkeus: Ht + 0.15 + r1, halkaisija: 2 * r0, huippumerkki: false, valoZ: Ht, osat: ['valkoinen torni punaisin vyöhykkein', 'kaide', 'lyhty', 'kupolikatto'] };
  }
  function malliTunnusmajakka(B, p, a) {
    var F = p.valoKorkeus || 14, Ht = Math.max(F - p.maanpinta, 8), w0 = Ht * 0.2, w1 = Ht * 0.12;
    B.minPx = a.minPx;
    B.prisma(0, 0, 0, Ht, w0, w1, 0, V.w);
    B.pyramidi(0, 0, Ht, w1 * 1.1, Ht * 0.14, 0, V.katto);
    B.minPx = 0;
    var valoZ = p.valaistu ? Ht - 0.8 : null;
    if (valoZ !== null) lyhty(B, valoZ, w1 * 0.5, a.minPx);
    return { malli: 'tunnusmajakka', korkeus: Ht * 1.14, halkaisija: w0, huippumerkki: false, valoZ: valoZ, osat: ['valkoinen nelikulmainen torni', 'pyramidikatto'] };
  }
  function malliKilpi(B, p, a) {
    var kk = p.kilpi, side = a.kilpiKoko, zA = 1.8, uv = null, aspect = 1;
    var k = { laji: kk.laji, cat: kk.cat, arvo: kk.arvo, teksti: kk.teksti, kuva: a.kilpikuvat };
    uv = slotUV(kilpiSlotti(k));
    var w = side, h = side;
    if (kk.cat === 'taulu') { h = 0.6; w = 1.5; zA = 1.9; }
    B.minPx = a.minPx;
    B.rengas({ z0: 0, z1: zA + h, r0: 0.05, r1: 0.05, seg: 6, vari: V.tummaHarmaa, ylakansi: true });
    B.minPx = a.minPx;
    B.taulu({ cx: 0, cy: 0.09, z0: zA, w: w, h: h, suunta: 0, vari: [[1, V.w]], uv: uv, takaVari: V.harmaa, paksuus: 0.02 });
    B.minPx = 0;
    return { malli: 'vesiliikennemerkki_' + kk.laji + (kk.arvo != null ? '_' + kk.arvo : ''), korkeus: zA + h, halkaisija: w, huippumerkki: false, valoZ: null, osat: ['tolppa', 'kilpi: ' + kk.nimi + (kk.arvo != null ? ' ' + fmtLuku(kk.arvo) : '')] };
  }
  function malliVara(B, p, a) {
    B.minPx = a.minPx;
    B.rengas({ z0: 0, z1: 3.0, r0: 0.18, r1: 0.18, seg: 8, vari: V.neutraali, alakansi: true, ylakansi: true });
    B.rengas({ z0: 2.6, z1: 3.0, r0: 0.2, r1: 0.2, seg: 8, vari: V.w, ylakansi: true });
    B.minPx = 0;
    return { malli: 'varamalli', korkeus: 3.0, halkaisija: 0.36, huippumerkki: false, valoZ: null, osat: ['neutraali harmaa pylväs'] };
  }

  // ---------- tyyppirekisteri ----------
  var LAJIT = {
    viitta: { nl: [1, 2, 3, 4, 5, 6, 7, 8, 9], rak: malliViitta, px: true },
    poiju: { nl: [1, 2, 3, 4, 5, 6, 7, 8, 9], rak: malliPoiju },
    reunamerkki: { nl: [1, 2, 3, 4, 5, 6, 7, 8, 9], rak: malliReunamerkki },
    kummeli: { rak: malliKummeli },
    linjamerkki: { rak: malliLinjamerkki },
    apuloisto: { rak: function (B, p, a) { return p.nimiAvain === 'siilinkari' ? malliSiilinkari(B, p, a) : malliLoisto(B, p, a, 'apuloisto'); } },
    sektoriloisto: { rak: function (B, p, a) { return malliLoisto(B, p, a, 'sektoriloisto'); } },
    suuntaloisto: { rak: function (B, p, a) { return malliLoisto(B, p, a, 'suuntaloisto'); } },
    majakka: { rak: malliMajakka },
    tunnusmajakka: { rak: malliTunnusmajakka },
    vesiliikennemerkki: { rak: malliKilpi }
  };

  var ASCII = { 'ä': 'a', 'ö': 'o', 'å': 'a' };
  function lajiAvain(s) { return String(s || '').trim().toLowerCase().replace(/[äöå]/g, function (c) { return ASCII[c]; }); }
  function numero(x) { if (x === null || x === undefined || x === '') return null; var n = Number(x); return isFinite(n) ? n : null; }
  function normalisoi(t, a) {
    t = t || {};
    var tyyppiRaaka = t.tyyppi, onKilpi = false;
    if (typeof tyyppiRaaka === 'number' || lajiAvain(tyyppiRaaka) === 'vesiliikennemerkki' || (/^\d+$/.test(String(tyyppiRaaka)) && (t.lajityyppi !== undefined || t.laji !== undefined))) onKilpi = true;
    var tyyppi = onKilpi ? 'vesiliikennemerkki' : lajiAvain(tyyppiRaaka);
    var nl = numero(t.navigointilaji != null ? t.navigointilaji : t.nl);
    var F = numero(t.valon_korkeus_vedesta != null ? t.valon_korkeus_vedesta : t.valoKorkeus);
    var sek = t.sektorit;
    if (typeof sek === 'string') { try { sek = JSON.parse(sek); } catch (e) { sek = null; } }
    var valaistu = t.valaistu === 'K' || t.valaistu === true;
    var suunta = numero(t.suunta); if (suunta === null) suunta = numero(a.suunta);
    var p = {
      tyyppiAvain: tyyppi, tyyppi: t.tyyppi, nl: nl, valaistu: valaistu, valoKorkeus: F !== null && F > 0 ? F : null, valotunnus: t.valotunnus || null, valotunnus_fi: t.valotunnus_fi || null,
      valon_laji: t.valon_laji || null, nakyvyys: numero(t.valon_nakyvyys), sektorit: Array.isArray(sek) ? sek : null, suunta: suunta, nimi: t.nimi || '', numero: t.numero != null ? String(t.numero) : null,
      maanpinta: numero(t.maanpinta) !== null ? numero(t.maanpinta) : (numero(a.maanpinta) || 0),
      kaukana: t.kaukana === true || a.kummeliKaukana === true,
      jaaviitta: /jää|jaa/i.test(String(t.alityyppi || '')) || t.jaaviitta === true || a.jaaviitta === true
    };
    p.nimiAvain = String(p.nimi).trim().toLowerCase();
    if (onKilpi) {
      var laji = numero(t.lajityyppi != null ? t.lajityyppi : t.laji), kk = KILPI[laji] || ['Vesiliikennemerkki', 'varoitus'];
      p.kilpi = { laji: laji, cat: kk[1], nimi: kk[0], arvo: numero(t.rajoitusarvo != null ? t.rajoitusarvo : t.arvo), teksti: String(t.lisakilpi1 || t.kilpi || '').trim() || null, tuntematon: !KILPI[laji] };
      if (p.kilpi.cat === 'taulu' && p.kilpi.teksti && !/^[A-Za-zÅÄÖåäö-]{3,16}$/.test(p.kilpi.teksti)) p.kilpi.teksti = null;
    }
    return p;
  }
  // valitsee mallin: {laji, vara, syy}
  function valitse(p, a) {
    var avain = lajiAvain(p.tyyppiAvain), lj = LAJIT[avain];
    if (!lj) return { vara: true, syy: 'tuntematon turvalaitetyyppi "' + p.tyyppi + '" (navigointilaji ' + p.nl + ')' };
    if (lj.nl && lj.nl.indexOf(p.nl) < 0) return { vara: true, syy: 'tyyppi ' + p.tyyppi + ' tuntemattomalla navigointilajilla ' + p.nl };
    return { lj: lj, avain: avain };
  }

  // ---------- geometriavälimuisti ----------
  var mallit = {};   // avain → { geom, meta }
  function mallinAvain(p, v, a) {
    if (v.vara) return 'vara';
    var A = v.avain, k = [A];
    if (lajiAvain(A) === 'vesiliikennemerkki') { k.push(p.kilpi.laji, p.kilpi.arvo, p.kilpi.teksti, a.kilpiKoko, a.kilpikuvat); }
    else {
      if (LAJIT[A].nl) k.push(p.nl);
      k.push(p.valaistu ? 'v' : 'e', p.valoKorkeus, p.maanpinta, a.minPx);
      if (A === 'viitta') k.push(p.jaaviitta ? 'jaa' : '');
      if (A === 'apuloisto' && p.nimiAvain === 'siilinkari') k.push('siilinkari');
      if (A === 'linjamerkki') k.push(/ylemp|taka|ylä/i.test(p.nimi) ? 'taka' : 'etu', p.valaistu ? 'valo' : '', a.linjatauluVari);
      if (A === 'kummeli') k.push(a.kummeliTunnus, p.kaukana ? 'kaukana' : 'lahi');
    }
    return k.join('|');
  }
  function annaMalli(p, a) {
    var v = valitse(p, a), avain = mallinAvain(p, v, a);
    if (v.vara) kirjaa('vara:' + p.tyyppi + ':' + p.nl, 'Varamalli: ' + v.syy, a);
    var m = mallit[avain];
    if (!m) {
      var B = new Rak(), meta;
      meta = v.vara ? malliVara(B, p, a) : v.lj.rak(B, p, a);
      var g = B.geometria(luokka(v.vara ? 'vara' : v.avain), (meta.halkaisija || 0) / 2);
      meta.nakyvyysluokka = luokka(v.vara ? 'vara' : v.avain);
      meta.pienin_nakyva_px = a.minPx; meta.kolmiot = B.tri_; meta.varamalli = !!v.vara; meta.tyyppi = v.vara ? 'varamalli' : p.tyyppi;
      meta.navigointilaji = p.nl; meta.avain = avain; meta.laji = v.vara ? 'vara' : v.avain;
      m = mallit[avain] = { geom: g, meta: meta, v: v };
    }
    return m;
  }

  function valoTieto(p, meta) {
    if (!p.valaistu && !p.valotunnus) return null;
    var sek = (p.sektorit || []).map(function (s) { return { alku: s.alku, loppu: s.loppu, vari: s.vari, rgb: VALO_RGB[String(s.vari).toLowerCase()] || VALO_RGB.v }; });
    return { z: meta.valoZ, korkeus_vedesta: p.valoKorkeus, valotunnus: p.valotunnus, valotunnus_fi: p.valotunnus_fi, valon_laji: p.valon_laji, nakyvyys_mpk: p.nakyvyys, sektorit: sek, valaistu: p.valaistu };
  }
  function kehys(a) { var k = new THREE.Object3D(); k.name = 'kehys'; if (a.ylos === 'y') k.rotation.x = -Math.PI / 2; return k; }

  function luoMerkki(t, as) {
    var a = asetukset(as), p = normalisoi(t, a), m = annaMalli(p, a);
    var mesh = new THREE.Mesh(m.geom, annaMateriaali());
    mesh.name = m.meta.malli; mesh.matrixAutoUpdate = true;
    if (p.suunta !== null) mesh.rotation.z = -p.suunta * Math.PI / 180;   // suunta: etupinnan suunta asteina pohjoisesta myötäpäivään
    var k = kehys(a); k.add(mesh);
    var root_ = new THREE.Group(); root_.name = 'merkki:' + m.meta.malli; root_.add(k);
    var u = root_.userData;
    u.malli = m.meta.malli; u.laji = m.meta.laji; u.tyyppi = p.tyyppi; u.navigointilaji = p.nl; u.nimi = p.nimi; u.numero = p.numero; u.varamalli = m.meta.varamalli;
    u.korkeus = m.meta.korkeus; u.halkaisija = m.meta.halkaisija; u.huippumerkki = m.meta.huippumerkki; u.pienin_nakyva_px = m.meta.pienin_nakyva_px;
    u.osat = m.meta.osat; u.kolmiot = m.meta.kolmiot; u.valo = valoTieto(p, m.meta); u.suunta = p.suunta;
    if (p.kilpi) u.kilpi = p.kilpi;
    return root_;
  }

  // Instanssit: lista [{turvalaite, x, y, z, suunta?}] (x = itä, y = pohjoinen, z = korkeus, aina z ylös -koordinaatistossa).
  function luoInstanssit(lista, as) {
    var a = asetukset(as), ryhmat = {}, ryhma = new THREE.Group(); ryhma.name = 'merkit_instanssit';
    var k = kehys(a); ryhma.add(k);
    var mat4 = new THREE.Matrix4(), rot = new THREE.Matrix4(), pos = new THREE.Matrix4();
    var tilasto = { kohteita: 0, piirtokutsuja: 0, kolmioita: 0, varamalleja: 0 };
    lista.forEach(function (it) {
      var t = it.turvalaite || it;
      var p = normalisoi(t, a), m = annaMalli(p, a);
      (ryhmat[m.meta.avain] = ryhmat[m.meta.avain] || { m: m, kohteet: [] }).kohteet.push({ it: it, p: p });
    });
    Object.keys(ryhmat).forEach(function (key) {
      var r = ryhmat[key], n = r.kohteet.length, im = new THREE.InstancedMesh(r.m.geom, annaMateriaali(), n);
      im.name = r.m.meta.malli; im.frustumCulled = false;
      r.kohteet.forEach(function (c, i) {
        var s = numero(c.it.suunta); if (s === null) s = c.p.suunta;
        pos.makeTranslation(c.it.x || 0, c.it.y || 0, c.it.z || 0);
        mat4.copy(pos);
        if (s !== null) { rot.makeRotationZ(-s * Math.PI / 180); mat4.multiply(rot); }
        im.setMatrixAt(i, mat4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.userData = { malli: r.m.meta.malli, lukumaara: n, kolmiot: r.m.meta.kolmiot };
      k.add(im);
      tilasto.kohteita += n; tilasto.piirtokutsuja++; tilasto.kolmioita += r.m.meta.kolmiot * n; if (r.m.meta.varamalli) tilasto.varamalleja += n;
    });
    ryhma.userData.tilasto = tilasto;
    return ryhma;
  }

  // ---------- esimerkkiluettelo (esikatselu, testit) ----------
  function viitat() {
    var l = [];
    for (var nl = 1; nl <= 9; nl++) l.push({ id: 'viitta_' + nl, ryhma: 'viitat', nimi: 'Viitta, ' + NL_NIMI[nl], syote: { tyyppi: 'Viitta', alityyppi: 'KELLUVA', navigointilaji: nl, valaistu: 'E' } });
    l.push({ id: 'jaaviitta_6', ryhma: 'viitat', nimi: 'Jääviitta, kardinaali itä', syote: { tyyppi: 'Viitta', alityyppi: 'JÄÄVIITTA', navigointilaji: 6, valaistu: 'E' } });
    l.push({ id: 'viitta_6_valo', ryhma: 'viitat', nimi: 'Valoviitta, itä (Toikonkari)', syote: { tyyppi: 'Viitta', alityyppi: 'KELLUVA', navigointilaji: 6, valaistu: 'K', valotunnus: 'VQ (3) 5 s', valon_korkeus_vedesta: 3, nimi: 'Toikonkari', sektorit: '[{"alku":0,"loppu":360,"vari":"v"}]' } });
    l.push({ id: 'viitta_5_valo', ryhma: 'viitat', nimi: 'Valoviitta, länsi (Pääskynkari)', syote: { tyyppi: 'Viitta', alityyppi: 'KELLUVA', navigointilaji: 5, valaistu: 'K', valotunnus: 'VQ (9) 10 s', valon_korkeus_vedesta: 3, nimi: 'Pääskynkari', sektorit: '[{"alku":0,"loppu":360,"vari":"v"}]' } });
    return l;
  }
  function esimerkit() {
    var l = viitat();
    [1, 2, 3, 8].forEach(function (nl) { l.push({ id: 'poiju_' + nl, ryhma: 'poijut', nimi: 'Poiju, ' + NL_NIMI[nl], syote: { tyyppi: 'Poiju', alityyppi: 'KELLUVA', navigointilaji: nl, valaistu: 'E' } }); });
    for (var nl = 1; nl <= 9; nl++) l.push({ id: 'reunamerkki_' + nl, ryhma: 'reunamerkit', nimi: 'Reunamerkki, ' + NL_NIMI[nl], syote: { tyyppi: 'Reunamerkki', alityyppi: 'KIINTEÄ', navigointilaji: nl, valaistu: 'E' } });
    l.push({ id: 'kummeli', ryhma: 'maa', nimi: 'Kummeli', syote: { tyyppi: 'Kummeli', alityyppi: 'KIINTEÄ', navigointilaji: 99, valaistu: 'E', maanpinta: 0 } });
    l.push({ id: 'linjamerkki_etu', ryhma: 'maa', nimi: 'Linjataulu, alempi (etu)', syote: { tyyppi: 'Linjamerkki', navigointilaji: 99, valaistu: 'E', nimi: 'Säynätsaari alempi' } });
    l.push({ id: 'linjamerkki_taka', ryhma: 'maa', nimi: 'Linjataulu, ylempi (taka)', syote: { tyyppi: 'Linjamerkki', navigointilaji: 99, valaistu: 'E', nimi: 'Säynätsaari ylempi' } });
    l.push({ id: 'apuloisto_3', ryhma: 'maa', nimi: 'Apuloisto 3 m (Solkiankari)', syote: { tyyppi: 'Apuloisto', navigointilaji: 99, valaistu: 'K', nimi: 'Solkiankari', valon_korkeus_vedesta: 3, valotunnus: 'Q', sektorit: '[{"alku":92,"loppu":215,"vari":"v"}]' } });
    l.push({ id: 'apuloisto_11', ryhma: 'maa', nimi: 'Apuloisto 11,5 m (Mustalahti)', syote: { tyyppi: 'Apuloisto', navigointilaji: 99, valaistu: 'K', nimi: 'Mustalahti', valon_korkeus_vedesta: 11.5, valotunnus: 'F', sektorit: '[{"alku":0,"loppu":360,"vari":"p"}]' } });
    l.push({ id: 'siilinkari', ryhma: 'maa', nimi: 'Siilinkari (apuloisto)', syote: { tyyppi: 'Apuloisto', navigointilaji: 99, valaistu: 'K', nimi: 'Siilinkari', numero: '28843', valon_korkeus_vedesta: 6.5, valotunnus: 'VQ (5) 6 s', sektorit: '[{"alku":0,"loppu":360,"vari":"k"}]' } });
    l.push({ id: 'sektoriloisto', ryhma: 'maa', nimi: 'Sektoriloisto (Rypynniemi)', syote: { tyyppi: 'Sektoriloisto', navigointilaji: 99, valaistu: 'K', nimi: 'Rypynniemi', valon_korkeus_vedesta: 7.9, valotunnus: 'VQ (2) 3 s', sektorit: '[{"alku":128,"loppu":142,"vari":"vi"},{"alku":142,"loppu":149,"vari":"v"},{"alku":149,"loppu":195,"vari":"p"},{"alku":195,"loppu":215,"vari":"v"}]' } });
    l.push({ id: 'suuntaloisto', ryhma: 'maa', nimi: 'Suuntaloisto', syote: { tyyppi: 'Suuntaloisto', navigointilaji: 99, valaistu: 'K', valon_korkeus_vedesta: 9, valotunnus: 'Iso 4 s', sektorit: '[{"alku":0,"loppu":10,"vari":"v"}]' } });
    l.push({ id: 'majakka', ryhma: 'maa', nimi: 'Majakka', syote: { tyyppi: 'Majakka', navigointilaji: 99, valaistu: 'K', valon_korkeus_vedesta: 18, valotunnus: 'Fl 5 s' } });
    l.push({ id: 'tunnusmajakka', ryhma: 'maa', nimi: 'Tunnusmajakka', syote: { tyyppi: 'Tunnusmajakka', navigointilaji: 99, valaistu: 'E', valon_korkeus_vedesta: 14 } });
    [[6, null, null, 'Aallokon aiheuttamisen kielto'], [11, 9, null, 'Nopeusrajoitus 9 km/h'], [15, 7, null, 'Alikulkukorkeus 7 m'], [24, null, null, 'Ilmajohto (tiedotus)'], [31, null, 'MAAKAASU', 'Kaapelitaulu / johtotaulu'], [32, null, null, 'Johtotaulu']].forEach(function (k) {
      l.push({ id: 'kilpi_' + k[0], ryhma: 'merkit', nimi: 'Vesiliikennemerkki: ' + k[3], syote: { tyyppi: 'Vesiliikennemerkki', lajityyppi: k[0], rajoitusarvo: k[1], lisakilpi1: k[2] } });
    });
    l.push({ id: 'vara', ryhma: 'muut', nimi: 'Varamalli (tuntematon tyyppi)', syote: { tyyppi: 'Tuntematon', navigointilaji: 77 } });
    return l;
  }

  var api = {
    VERSIO: VERSIO, luoMerkki: luoMerkki, luoInstanssit: luoInstanssit, asetaKamera: asetaKamera, asetaPikseli: asetaPikseli, asetaNakyvyys: asetaNakyvyys,
    esimerkit: esimerkit, ASETUKSET: ASETUKSET, VARI_HEX: VARI_HEX, VARI: V, RAIDAT: RAIDAT, HEIJASTIN: HEIJASTIN, NL_NIMI: NL_NIMI, VALO_RGB: VALO_RGB,
    loki: loki, tyhjennaLoki: function () { loki.length = 0; lokiAvaimet = {}; },
    materiaali: annaMateriaali, atlas: function () { return atlas; }, KILPI: KILPI,
    mallitaulu: function () { return Object.keys(mallit).map(function (k) { return mallit[k].meta; }); },
    _normalisoi: normalisoi
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Merimerkit3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
