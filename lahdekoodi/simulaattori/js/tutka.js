/* Tutka – navigoijan tutkanäkymä (canvas 2D).
 *
 * Moduuli vie luoTutka(canvas, asetukset) ja palauttaa olion, jolla on paivita(tila), asetaAlue(mpk), asetaSuuntaYlos(bool),
 * asetaEBL(aste), asetaVRM(mpk), asetaSade(voimakkuus) ja asetaHairio(kuvaus). Kuvaus, kaikumallin oletukset ja liittäminen
 * simulaattoriin ovat tiedostossa TUTKA.md.
 *
 * Tutka lukee aineistopaketin (PMTiles) itse: maastokuviot, rakennukset ja turvalaitteet vektoriruuduista (nasijarvi.pmtiles),
 * maanpinnan korkeuden maasto.pmtiles-tiedostosta ja puuston puusto.pmtiles-tiedostosta. Niistä rakennetaan EPSG:3067-koordinaatistoon
 * kiinnitetty ruudukko (maa- ja vesimaski sekä esteen korkeus järven pinnasta), jota säteet marssitaan. Ruudukon rakennuslogiikka
 * (koordinaattimuunnos, MVT-purku, PMTiles-luku) on kopioitu simulaattorin moduuleista paikka.js, mvt.js ja aineisto.js, jotta
 * tiedosto toimii yksinään. Jos asetuksissa annetaan simulaattorin Aineisto-olio (asetukset.aineisto), ruudut luetaan sen välimuistin kautta.
 *
 * Moduuli toimii selaimessa (window.Tutka) ja Nodessa (module.exports, vain apufunktiot). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, NM = 1852;
  var DEFAULT_URL = 'https://jvaahtikari.github.io/reittikartta-aineisto/';
  var LAKE_Z = 95.5;                         // järven pinta, m N2000 (sama kuin simulaattorissa)
  var ALUEET = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 6];   // mpk
  var JALJET = [0, 15, 30, 60, 180];         // jäljen kesto, s (0 = pois)
  var OFFSET_K = 1.7, OFFSET_OSUUS = 0.7;    // offset (siirretty keskipiste): oma alus 70 % säteestä keskipisteen alapuolella, eteenpäin näkyy 1,7 × alue

  // Kaikumallin vakiot (perustelut TUTKA.md:ssä)
  var M = {
    antenniM: 5.4,           // antennin korkeus vedenpinnasta, m (runkomallissa antenni z 5,45–5,55 m)
    kerroinK: 4 / 3,         // vakiotaittuman kerroin: tehollinen maapallon säde 4/3 R
    maaR: 6371000,
    pulssiM: 12,             // pulssin pituus metreinä (lyhyin pulssi 0,08 µs)
    minEtaisyysM: 15,        // kuollut alue lähellä
    veneet: { soutu: { v: 0.25, hs: 0.6 }, pieni: { v: 0.45, hs: 1.0 }, keski: { v: 0.45, hs: 2.0 }, purje: { v: 0.6, hs: 0.75 }, maxR: 2500, haku: 2650, paivitysM: 100, paivitysMs: 1500 },   // vaihe 3l: kiinnitetyt veneet pistekaikuina, voimakkuus luokittain, hs = kaiun korkeus vedestä (purjeveneellä kerroin mastoon), ei välkyntää
    keilaAste: 2.0,          // vaakakeilan leveys, 3 dB (avoin antenni, noin 4 jalkaa)
    kierrosMin: 24,          // antennin kierrosnopeus
    ikkunaM: 12,             // rinteen jyrkkyys lasketaan tämän pituiselta matkalta (pulssin pituus)
    nakyvyysM: 1.5,          // korkeus varjorajan yläpuolella, jolla kaiku on täysi
    latvusKerroin: 0.5,      // puuston keskipituudesta esteenä (X-kaistan säde läpäisee lehvästöä osittain)
    // Vesirakenteet ja sillat (vaihe 3h): maskin lippu 4 = laituri, 5 = aallonmurtaja, 6 = vesikivi, 7 = silta, 8 = rautatiesilta (vain veden päällä).
    // rakenneH = korkeus vedenpinnasta (m), rakenneE = kaiun voimakkuus hyvässä virityksessä (huonossa kerrotaan rakenneHuono:lla), rakenneL = leveys (m)
    rakenneH: { 4: 0.8, 5: 2.0, 6: 0.5, 7: 6, 8: 8 }, rakenneE: { 4: 0.8, 5: 1.0, 6: 0.5, 7: 1.0, 8: 1.0 }, rakenneHuono: 0.6,
    rakenneL: { laituri_kapea: 2, laituri_leveä: 5, aallonmurtaja: 4, vesikivi: 1.5 },
    sillanLeveys: { valtatie: 12, autotie: 8, kevyt: 5, rata: 5 },
    minKorkeusM: 1.2,        // maa-alueen vähimmäiskorkeus (kivet, ruovikko, laiturit, rantapenkka), ei näy paljaassa korkeusmallissa
    latvusPeitto: 30,        // latvuspeitto (%), jolla puusto lasketaan esteeksi
    rakennusKrs: { '3+': 12, '1-2': 6, none: 5 },
    rakennusLapaisy: 0.6,    // hyvässä virityksessä rakennuksen varjokorkeus on (1 - tämä) × korkeus (kortteleiden väleistä ja katujen suunnista näkee läpi)
    taajamaLuokat: { taajama: 1, varastoalue: 1 },   // maastokuvion luokat, joiden maa on rakennettua aluetta (hyvässä virityksessä kaiun pohjataso kohonnut)
    nb: 512,                 // sädettä kohden askelia
    // Kaikumallin viritystilat (vaihe 3e). 'huono' toistaa vaiheen 3c kuvan (ensimmäinen osuma kirkkain, loiva ranta heikko, jälkihehku nopea),
    // 'hyva' kuvaa oikein viritettyä tutkaa: yhtenäinen kirkas rantaviiva ja maa-alue täyttyneenä niin pitkälle kuin se näkyy.
    //   pohjaMaa, pohjaMetsa: tasaisen näkyvän maan voimakkuus (ennen etäisyysvaimennusta), pohjaKorkeus: korkeuden lisä (kerrotaan sqrt(H/25))
    //   rinneOsuus: osuus, jonka korkeus ja rinne vaikuttavat rinnekaiun voimakkuuteen (0,3 + 0,7 Hf = 0,3 ja 0,7)
    //   rantaE, rantaLeveysM: rantaviivan kaiun alaraja (rantapenkka, kivet, rantapuusto) ja sen leveys, joka hiipuu kohti pohjatasoa
    //   nakyvyysM, nakyvyysPohja: varjorajan yläpuolella korkeus, jolla kaiku on täysi, ja heikoin kerroin heti varjorajan yläpuolella
    //   rangeR0: etäisyysvaimennuksen mittakaava (1 / (1 + (s / R0)^2)), jalkihehku: [pysyvä osa, nopeasti haalistuva osa]
    //   kiintePDet: kiinteiden merkkien havaintotodennäköisyys (null = luokan oma), kiinteaVaihtelu: kiinteiden merkkien amplitudin vaihtelu +-
    //   kohinaViritys: vastaanottimen kohina, jonka viritys lisää (hairio.kohina), svelyMaxM: rantaviivan pitkittäissivelyn enimmäispituus metreinä, svelyHiipuu: sivelyn hiipuminen
    huono: { pohjaMaa: 0.14, pohjaMetsa: 0.28, pohjaKorkeus: 0.08, rinneAlku: 0.3, rantaE: 0.3, rantaLeveysM: 0, nakyvyysM: 1.5, nakyvyysPohja: 0,
      rangeR0: 7000, jalkihehku: [0.55, 0.45], kiintePDet: null, kiinteaVaihtelu: [0.9, 1.0], kohinaViritys: 0.3 },
    hyva: { pohjaMaa: 0.55, pohjaMetsa: 0.72, pohjaKorkeus: 0, rinneAlku: 0, rantaE: 1.0, rantaLeveysM: 20, nakyvyysM: 0.3, nakyvyysPohja: 1.0,
      rangeR0: 14000, jalkihehku: [0.95, 0.05], sateita3: 600, kiintePDet: 1.0, kiinteaVaihtelu: [1, 1], kohinaViritys: 0, pehmeys: 0.5, svelyMaxM: 500, svelyHiipuu: 0.35,
      rakennusE: 1.0, taajamaE: 0.8, rinneKaltevuus: 0.4, varjoTol: 0.008, varjoMatkaM: 200, varjoE: 0.85 }
  };
  var TS = 128;                              // ruudukon ruudun sivu soluina
  // Solukoon mukaan: vektoriruudun, korkeusruudun ja puustoruudun zoom
  var LOD = { 1: { zv: 16, zd: 14, zt: 13 }, 2: { zv: 16, zd: 14, zt: 13 }, 4: { zv: 15, zd: 14, zt: 13 }, 8: { zv: 13, zd: 13, zt: 13 }, 16: { zv: 12, zd: 12, zt: 12 } };
  function soluKoko(mpk) { return mpk <= 0.25 ? 1 : mpk <= 0.75 ? 2 : mpk <= 1.5 ? 4 : mpk <= 3 ? 8 : 16; }

  // ---------- koordinaatit (paikka.js) ----------
  var K = (function () {
    var A = 6378137.0, F = 1 / 298.257222101, LON0 = 27 * RAD, K0 = 0.9996, FE = 500000, FN = 0;
    var n = F / (2 - F), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
    var AA = A / (1 + n) * (1 + n2 / 4 + n4 / 64);
    var al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240];
    var be = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480];
    var de = [2 * n - 2 * n2 / 3 - 2 * n3, 7 * n2 / 3 - 8 * n3 / 5, 56 * n3 / 15];
    function lonlatToEN(lon, lat) {
      var phi = lat * RAD, dl = lon * RAD - LON0;
      var c = 2 * Math.sqrt(n) / (1 + n);
      var t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
      var xi = Math.atan2(t, Math.cos(dl)), eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
      var E = eta, N = xi;
      for (var j = 1; j <= 3; j++) {
        E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
        N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      }
      return { e: FE + K0 * AA * E, n: FN + K0 * AA * N };
    }
    function enToLonLat(e, nn) {
      var xi0 = (nn - FN) / (K0 * AA), eta0 = (e - FE) / (K0 * AA), xi = xi0, eta = eta0;
      for (var j = 1; j <= 3; j++) {
        xi -= be[j - 1] * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
        eta -= be[j - 1] * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
      }
      var chi = Math.asin(Math.sin(xi) / Math.cosh(eta)), phi = chi;
      for (j = 1; j <= 3; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
      var lam = LON0 + Math.atan2(Math.sinh(eta), Math.cos(xi));
      return { lon: lam / RAD, lat: phi / RAD };
    }
    function convergenceDeg(lon, lat) { return Math.atan(Math.tan(lon * RAD - LON0) * Math.sin(lat * RAD)) / RAD; }
    function lonlatToTile(lon, lat, z) {
      var nn = Math.pow(2, z), s = Math.sin(lat * RAD);
      return { x: (lon + 180) / 360 * nn, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * nn };
    }
    function tileLonLat(z, x, y, u, v) {
      var nn = Math.pow(2, z);
      return { lon: (x + u) / nn * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v) / nn))) / RAD };
    }
    return { lonlatToEN: lonlatToEN, enToLonLat: enToLonLat, convergenceDeg: convergenceDeg, lonlatToTile: lonlatToTile, tileLonLat: tileLonLat };
  })();
  function norm360(b) { b = b % 360; return b < 0 ? b + 360 : b; }

  // ---------- MVT-purku (mvt.js) ----------
  var Mvt = (function () {
    var TD = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    function Reader(buf) { this.b = buf; this.p = 0; this.n = buf.length; }
    Reader.prototype.varint = function () {
      var b = this.b, r = 0, shift = 0, x;
      do { x = b[this.p++]; r += (x & 127) * Math.pow(2, shift); shift += 7; } while (x & 128);
      return r;
    };
    Reader.prototype.skip = function (wt) {
      if (wt === 0) this.varint(); else if (wt === 1) this.p += 8; else if (wt === 2) { var l = this.varint(); this.p += l; }
      else if (wt === 5) this.p += 4; else throw new Error('tuntematon wiretype ' + wt);
    };
    Reader.prototype.str = function (len) {
      var s = TD ? TD.decode(this.b.subarray(this.p, this.p + len)) : String.fromCharCode.apply(null, this.b.subarray(this.p, this.p + len));
      this.p += len; return s;
    };
    function zz(n) { return (n >>> 1) ^ -(n & 1); }
    function readValue(buf, start, end) {
      var r = new Reader(buf); r.p = start; var val = null;
      while (r.p < end) {
        var tag = r.varint(), f = tag >> 3, wt = tag & 7;
        if (f === 1 && wt === 2) { var l = r.varint(); val = r.str(l); }
        else if (f === 2 && wt === 5) { val = new DataView(buf.buffer, buf.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
        else if (f === 3 && wt === 1) { val = new DataView(buf.buffer, buf.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
        else if (f === 4 || f === 5) { val = r.varint(); }
        else if (f === 6) { var u = r.varint(); val = u % 2 ? -(u + 1) / 2 : u / 2; }
        else if (f === 7) { val = r.varint() !== 0; }
        else r.skip(wt);
      }
      return val;
    }
    function decodeGeometry(buf, start, end, type) {
      var r = new Reader(buf); r.p = start;
      var parts = [], cur = null, x = 0, y = 0;
      while (r.p < end) {
        var ci = r.varint(), cmd = ci & 7, cnt = ci >> 3;
        if (cmd === 1 || cmd === 2) {
          for (var i = 0; i < cnt; i++) {
            x += zz(r.varint()); y += zz(r.varint());
            if (cmd === 1) { if (cur) parts.push(Int32Array.from(cur)); cur = [x, y]; } else cur.push(x, y);
          }
        } else if (cmd === 7) { if (cur) cur.push(cur[0], cur[1]); }
      }
      if (cur) parts.push(Int32Array.from(cur));
      return parts;
    }
    function decodeLayer(buf, start, end) {
      var r = new Reader(buf); r.p = start;
      var extent = 4096, keys = [], vals = [], feats = [];
      while (r.p < end) {
        var tag = r.varint(), f = tag >> 3, wt = tag & 7;
        if (f === 1 && wt === 2) { r.skip(wt); }
        else if (f === 2 && wt === 2) { var l = r.varint(); feats.push([r.p, r.p + l]); r.p += l; }
        else if (f === 3 && wt === 2) { var lk = r.varint(); keys.push(r.str(lk)); }
        else if (f === 4 && wt === 2) { var lv = r.varint(); vals.push(readValue(buf, r.p, r.p + lv)); r.p += lv; }
        else if (f === 5 && wt === 0) extent = r.varint();
        else r.skip(wt);
      }
      var features = [];
      for (var i = 0; i < feats.length; i++) {
        var fr = new Reader(buf); fr.p = feats[i][0];
        var fend = feats[i][1], type = 0, props = {}, gs = 0, ge = 0;
        while (fr.p < fend) {
          var ft = fr.varint(), ff = ft >> 3, fw = ft & 7;
          if (ff === 2 && fw === 2) {
            var lt = fr.varint(), te = fr.p + lt;
            while (fr.p < te) { var k = fr.varint(), v = fr.varint(); props[keys[k]] = vals[v]; }
          } else if (ff === 3 && fw === 0) type = fr.varint();
          else if (ff === 4 && fw === 2) { var lg = fr.varint(); gs = fr.p; ge = fr.p + lg; fr.p = ge; }
          else fr.skip(fw);
        }
        features.push({ type: type, props: props, parts: ge > gs ? decodeGeometry(buf, gs, ge, type) : [] });
      }
      return { extent: extent, features: features };
    }
    function decode(buf, want) {
      var out = {}, r = new Reader(buf);
      while (r.p < r.n) {
        var tag = r.varint(), f = tag >> 3, wt = tag & 7;
        if (f !== 3 || wt !== 2) { r.skip(wt); continue; }
        var len = r.varint(), end = r.p + len, start = r.p;
        var name = null, q = new Reader(buf); q.p = start;
        while (q.p < end) {
          var t2 = q.varint(), f2 = t2 >> 3, w2 = t2 & 7;
          if (f2 === 1 && w2 === 2) { var l2 = q.varint(); name = q.str(l2); break; }
          q.skip(w2);
        }
        if (name !== null && (!want || want.indexOf(name) >= 0)) out[name] = decodeLayer(buf, start, end);
        r.p = end;
      }
      return out;
    }
    return { decode: decode };
  })();

  // ---------- aineiston luku (aineisto.js) ----------
  // Palauttaa lukijan: vektori(z, x, y, kerrokset) ja kuva(laji, z, x, y) = { w, h, data }. Laji on 'dem' tai 'tree'.
  function luoLukija(base, ulkoinen) {
    if (ulkoinen && typeof ulkoinen.layers === 'function') {
      return {
        base: ulkoinen.getBase ? ulkoinen.getBase() : base,
        vektori: function (z, x, y, n) { return ulkoinen.layers(z, x, y, n); },
        kuva: function (laji, z, x, y) { return ulkoinen.png(laji, z, x, y); },
        tilasto: ulkoinen.stats || {}
      };
    }
    base = String(base || DEFAULT_URL); if (!/\/$/.test(base)) base += '/';
    var FILES = { vec: 'nasijarvi.pmtiles', dem: 'maasto.pmtiles', tree: 'puusto.pmtiles' };
    var pms = {}, stats = { requests: 0, bytes: 0, tiles: 0, fail: 0 };
    var rawCache = new Map(), layerCache = new Map(), inflight = new Map(), RAW_MAX = 300, LAYER_MAX = 400, pngCanvas = null;
    function Source(url) { this.url = url; }
    Source.prototype.getKey = function () { return this.url; };
    Source.prototype.getBytes = function (offset, length, signal) {
      stats.requests++;
      return fetch(this.url, { signal: signal, headers: { range: 'bytes=' + offset + '-' + (offset + length - 1) } }).then(function (r) {
        if (r.status >= 300 && r.status !== 416) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer().then(function (buf) {
          stats.bytes += buf.byteLength;
          return { data: buf, etag: (r.headers.get('Etag') || '').replace(/^W\//, '') || undefined, cacheControl: r.headers.get('Cache-Control') || undefined, expires: r.headers.get('Expires') || undefined };
        });
      });
    };
    function pm(kind) {
      if (!pms[kind]) {
        if (!root.pmtiles) throw new Error('pmtiles.js puuttuu (lataa se ennen tutka.js:ää)');
        pms[kind] = new root.pmtiles.PMTiles(new Source(base + FILES[kind]));
      }
      return pms[kind];
    }
    function raw(kind, z, x, y) {
      var key = kind + '/' + z + '/' + x + '/' + y;
      if (rawCache.has(key)) { var v = rawCache.get(key); rawCache.delete(key); rawCache.set(key, v); return Promise.resolve(v); }
      if (inflight.has(key)) return inflight.get(key);
      var p;
      try { p = pm(kind).getZxy(z, x, y); } catch (e) { return Promise.reject(e); }
      p = p.then(function (r) {
        var out = r ? new Uint8Array(r.data) : null;
        if (out) stats.tiles++;
        rawCache.set(key, out);
        if (rawCache.size > RAW_MAX) rawCache.delete(rawCache.keys().next().value);
        inflight.delete(key);
        return out;
      }, function () { inflight.delete(key); stats.fail++; return null; });
      inflight.set(key, p);
      return p;
    }
    function vektori(z, x, y, names) {
      return raw('vec', z, x, y).then(function (buf) {
        if (!buf) return null;
        var out = {}, need = [], i, key;
        for (i = 0; i < names.length; i++) {
          key = z + '/' + x + '/' + y + '/' + names[i];
          if (layerCache.has(key)) out[names[i]] = layerCache.get(key); else need.push(names[i]);
        }
        if (need.length) {
          var d = Mvt.decode(buf, need);
          for (i = 0; i < need.length; i++) {
            key = z + '/' + x + '/' + y + '/' + need[i];
            var l = d[need[i]] || { extent: 4096, features: [] };
            layerCache.set(key, l); out[need[i]] = l;
            if (layerCache.size > LAYER_MAX) layerCache.delete(layerCache.keys().next().value);
          }
        }
        return out;
      });
    }
    function kuvaPurku(blob) {
      var p = (typeof createImageBitmap === 'function')
        ? createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(function () { return createImageBitmap(blob); })
        : Promise.reject(new Error('ei createImageBitmap'));
      return p.catch(function () {
        return new Promise(function (res, rej) {
          var im = new Image(), u = URL.createObjectURL(blob);
          im.onload = function () { URL.revokeObjectURL(u); res(im); };
          im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('kuvan purku epäonnistui')); };
          im.src = u;
        });
      });
    }
    function kuva(laji, z, x, y) {
      return raw(laji, z, x, y).then(function (buf) {
        if (!buf) return null;
        return kuvaPurku(new Blob([buf], { type: 'image/png' })).then(function (bm) {
          var w = bm.width, h = bm.height;
          if (!pngCanvas) pngCanvas = document.createElement('canvas');
          if (pngCanvas.width !== w || pngCanvas.height !== h) { pngCanvas.width = w; pngCanvas.height = h; }
          var g = pngCanvas.getContext('2d', { willReadFrequently: true });
          g.clearRect(0, 0, w, h); g.drawImage(bm, 0, 0);
          var id = g.getImageData(0, 0, w, h);
          if (bm.close) bm.close();
          return { w: id.width, h: id.height, data: id.data };
        });
      }, function () { return null; });
    }
    return { base: base, vektori: vektori, kuva: kuva, tilasto: stats };
  }

  // ---------- monikulmion täyttö ruudukkoon ----------
  var rivit = [];
  // renkaat: lista litteitä [x0, y0, x1, y1, ...] soluavaruudessa (solun keskipiste i + 0,5, j + 0,5). Parillinen-pariton sääntö.
  // Täyttää taulukon arvolla val ja palauttaa täytettyjen solujen määrän.
  function taytaMonikulmio(renkaat, arr, val, ts) {
    var ymin = Infinity, ymax = -Infinity, r, k, ring, n;
    for (r = 0; r < renkaat.length; r++) {
      ring = renkaat[r]; n = ring.length / 2;
      for (k = 0; k < n; k++) { var y = ring[2 * k + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    }
    var j0 = Math.max(0, Math.ceil(ymin - 0.5)), j1 = Math.min(ts - 1, Math.ceil(ymax - 0.5) - 1);
    if (j1 < j0) return 0;
    var nr = j1 - j0 + 1, j;
    while (rivit.length < nr) rivit.push([]);
    for (j = 0; j < nr; j++) rivit[j].length = 0;
    for (r = 0; r < renkaat.length; r++) {
      ring = renkaat[r]; n = ring.length / 2;
      for (k = 0; k < n - 1; k++) {
        var x0 = ring[2 * k], y0 = ring[2 * k + 1], x1 = ring[2 * k + 2], y1 = ring[2 * k + 3];
        if (y0 === y1) continue;
        var ya = y0 < y1 ? y0 : y1, yb = y0 < y1 ? y1 : y0;
        var ja = Math.max(j0, Math.ceil(ya - 0.5)), jb = Math.min(j1, Math.ceil(yb - 0.5) - 1);
        var dxdy = (x1 - x0) / (y1 - y0);
        for (j = ja; j <= jb; j++) rivit[j - j0].push(x0 + (j + 0.5 - y0) * dxdy);
      }
    }
    var count = 0;
    for (j = 0; j < nr; j++) {
      var xs = rivit[j];
      if (xs.length < 2) continue;
      xs.sort(function (a, b) { return a - b; });
      for (k = 0; k + 1 < xs.length; k += 2) {
        var i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(ts - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        var base = (j + j0) * ts;
        for (var i = i0; i <= i1; i++) { arr[base + i] = val; count++; }
      }
    }
    return count;
  }

  // ---------- apuja ----------
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fnum(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','); }
  function pad3(n) { n = Math.round(n) % 360; return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function nmTxt(v) { return v < 0.1 ? fnum(v, 3) : v < 1 ? fnum(v, v * 100 % 1 === 0 ? 2 : 3) : fnum(v, v % 1 === 0 ? 0 : (v * 10 % 1 === 0 ? 1 : 2)); }
  function nearestRange(v) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < ALUEET.length; i++) { var d = Math.abs(Math.log(ALUEET[i] / v)); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // ---------- paletit ----------
  function lut(stops) {   // stops: [[v, r, g, b], ...] 0..255, palauttaa Uint32Array(256) (ABGR, little endian)
    var out = new Uint32Array(256);
    for (var v = 0; v < 256; v++) {
      var i = 1; while (i < stops.length - 1 && v > stops[i][0]) i++;
      var a = stops[i - 1], b = stops[i], t = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (v - a[0]) / (b[0] - a[0])));
      var r = Math.round(a[1] + (b[1] - a[1]) * t), g = Math.round(a[2] + (b[2] - a[2]) * t), bl = Math.round(a[3] + (b[3] - a[3]) * t);
      out[v] = (255 << 24) | (bl << 16) | (g << 8) | r;
    }
    return out;
  }
  var BG = [3, 20, 10];
  var PAL_E = lut([[0, BG[0], BG[1], BG[2]], [24, 8, 56, 24], [70, 18, 120, 36], [130, 120, 200, 40], [190, 230, 224, 36], [255, 255, 150, 30]]);
  var PAL_T = lut([[0, BG[0], BG[1], BG[2]], [40, 8, 40, 36], [255, 44, 130, 118]]);
  var BG32 = (255 << 24) | (BG[2] << 16) | (BG[1] << 8) | BG[0];

  // ======================================================================================
  function luoTutka(canvas, opt) {
    opt = opt || {};
    var NB = M.nb;
    var lukija = opt.lukija || luoLukija(opt.aineistoUrl, opt.aineisto);
    var onMuutos = typeof opt.onMuutos === 'function' ? opt.onMuutos : null;
    var kirjaa = typeof opt.onKirjaus === 'function' ? opt.onKirjaus : null;     // (laji, arvo): evpiste {ebl, vrm}, ebl, vrm, offset, suunta, ev
    var veneLahde = typeof opt.veneet === 'function' ? opt.veneet : null;      // (e, n, sade): kiinnitetyt veneet TM35FIN-koordinaateissa, kuten Veneet3D.lahella palauttaa (e, n, luokka, kaikuTaso, masto)

    // ---------- tila ----------
    var C = {
      alueIdx: 5, suuntaYlos: opt.suuntaYlos !== false, ebl: 0, vrm: 0.5, sade: 0, sadeSuodatin: 0, jalkiIdx: 0, vahvistus: 1, ev: opt.eblVrm !== false, offset: false,
      hairio: { kohina: 0, suuntavirhe: 0, heikko: 0, pois: false }, antenniM: opt.antenniM || M.antenniM,
      meri: { hs: 0, tuuliMista: 0, tuuliMs: 0 },   // keli (30.10.2026): merkitsevä aallonkorkeus (m) ja tuuli, simulaattori antaa asetaMeri-kutsulla
      sea: 0,                                     // merivälkkeen vaimennus (SEA, STC): 0 = pois, 1-3 = käsin, -1 = AUTO
      viritys: opt.viritys === 'huono' ? 'huono' : 'hyva'
    };
    if (opt.alue) C.alueIdx = nearestRange(opt.alue);
    var S = { e: 0, n: 0, hdg: 0, kn: 0, t: 0, conv: 0, convE: 1e9, convN: 1e9, onTila: false };
    var NR = 360, rangeM = 0, step = 1, cell = 4, TSm = TS * cell, invC = 1 / cell, invTSm = 1 / TSm;
    var raw = null, trail = null, rayT = null, hit = null, firstB = null, mf5 = null, hitI = null, endI = null;
    var Hb = new Float32Array(NB), Sb = new Float32Array(NB), Tb = new Uint8Array(NB), Fb = new Uint8Array(NB), Eb = new Float32Array(NB), Ab = new Float32Array(NB), Mb = new Float32Array(NB);
    var acc = 0, nextK = 0, rev = 0, lastT = null, tilasto = { kierrosMs: 0, piirtoMs: 0, piirtoMax: 0, piirrot: 0, sateita: 0, ruutuja: 0, rakennusMs: 0, veneita: 0 };

    // ---------- ruudukko ----------
    var ruudut = new Map(), MAX_RUUTUA = 800, odottaa = new Map(), jono = [], rakennetaan = 0, MAXPAR = 6;
    var viimeVarmistus = { e: 1e9, n: 1e9, cell: 0, r: 0 }, odottajat = [];
    var demCache = new Map(), treeCache = new Map();

    function ruutuAvain(c, ti, tj) { return (c * 4194304 + (ti + 2097152)) * 4194304 + (tj + 2097152); }

    function demRuutu(z, x, y) {
      var key = z + '/' + x + '/' + y;
      if (demCache.has(key)) return Promise.resolve(demCache.get(key));
      return lukija.kuva('dem', z, x, y).then(function (img) {
        var out = null;
        if (img) {
          var n = img.w * img.h, v = new Float32Array(n), d = img.data;
          for (var i = 0; i < n; i++) {
            var r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
            v[i] = (r === 0 && g === 0 && b === 0) ? NaN : -10000 + (r * 65536 + g * 256 + b) * 0.1;
          }
          out = { w: img.w, h: img.h, v: v };
        }
        demCache.set(key, out); if (demCache.size > 60) demCache.delete(demCache.keys().next().value);
        return out;
      });
    }
    function puuRuutu(z, x, y) {
      var key = z + '/' + x + '/' + y;
      if (treeCache.has(key)) return Promise.resolve(treeCache.get(key));
      return lukija.kuva('tree', z, x, y).then(function (img) {
        var out = null;
        if (img) {
          var n = img.w * img.h, v = new Float32Array(n), d = img.data;
          for (var i = 0; i < n; i++) {
            if (d[4 * i + 3] > 0 && d[4 * i + 2] >= M.latvusPeitto) v[i] = (d[4 * i] * 256 + d[4 * i + 1]) / 10;
          }
          out = { w: img.w, h: img.h, v: v };
        }
        treeCache.set(key, out); if (treeCache.size > 40) treeCache.delete(treeCache.keys().next().value);
        return out;
      });
    }
    function kuvaHaku(f, z, mx0, my0, mx1, my1) {   // hakee kaikki ruudut, jotka peittävät normalisoidun mercator-laatikon
      var N = Math.pow(2, z), x0 = Math.floor(mx0 * N), x1 = Math.floor(mx1 * N), y0 = Math.floor(my0 * N), y1 = Math.floor(my1 * N), list = [], ps = [];
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { list.push({ x: x, y: y }); ps.push(f(z, x, y)); }
      return Promise.all(ps).then(function (res) { return { x0: x0, y0: y0, nx: x1 - x0 + 1, ny: y1 - y0 + 1, tiles: res, list: list }; });
    }

    // Rakentaa yhden ruudukon ruudun (solukoko c, ruudun indeksit ti, tj). Palauttaa lupauksen.
    function haeSyotteet(c, ti, tj) {
      var L = LOD[c], size = TS * c, e0 = ti * size, n0 = tj * size;
      var cs = [[e0, n0], [e0 + size, n0], [e0, n0 + size], [e0 + size, n0 + size]].map(function (p) {
        var ll = K.enToLonLat(p[0], p[1]); return K.lonlatToTile(ll.lon, ll.lat, 0);
      });
      var mxMin = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x), mxMax = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x);
      var myMin = Math.min(cs[0].y, cs[1].y, cs[2].y, cs[3].y), myMax = Math.max(cs[0].y, cs[1].y, cs[2].y, cs[3].y);
      var names = ['maastokuvio', 'vesieste', 'tie'].concat(L.zv >= 13 ? ['rakennus'] : []);
      var pad = 1 / Math.pow(2, 20);
      return Promise.all([
        kuvaHaku(function (z, x, y) { return lukija.vektori(z, x, y, names); }, L.zv, mxMin, myMin, mxMax, myMax),
        kuvaHaku(demRuutu, L.zd, mxMin - pad, myMin - pad, mxMax + pad, myMax + pad),
        kuvaHaku(puuRuutu, L.zt, mxMin, myMin, mxMax, myMax)
      ]).then(function (r) { return { c: c, ti: ti, tj: tj, cs: cs, vec: r[0], dem: r[1], tree: r[2], L: L }; });
    }

    function rakennaRuutu(s) {
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var c = s.c, L = s.L, cs = s.cs;
      var m00x = cs[0].x, m00y = cs[0].y, ax = cs[1].x - m00x, ay = cs[1].y - m00y, bx = cs[2].x - m00x, by = cs[2].y - m00y;
      var det = ax * by - ay * bx, N = TS * TS, i, j, k;
      var flag = new Uint8Array(N), gr = new Float32Array(N), bh = null, qa = new Uint8Array(N);   // qa: bitti 7 = rakennettu alue (taajama), alabitit = korkeuslisä (puusto) tai varjokorkeuden vähennys (rakennus), yksikkö 0,5 m
      // 1) maa oletuksena kaikkialla, missä vektoriruutu on
      var vecTiles = [];
      for (k = 0; k < s.vec.list.length; k++) if (s.vec.tiles[k]) vecTiles.push({ x: s.vec.list[k].x, y: s.vec.list[k].y, d: s.vec.tiles[k] });
      var Zv = Math.pow(2, L.zv);
      function kerroin(vt, ext) {   // soluavaruuden kertoimet: cx = c0x + kxx * px + kxy * py
        var tx = vt.x / Zv - m00x, ty = vt.y / Zv - m00y, sx = 1 / (ext * Zv);
        var o = {};
        o.c0x = TS / det * (by * tx - bx * ty); o.kxx = TS / det * by * sx; o.kxy = TS / det * (-bx) * sx;
        o.c0y = TS / det * (-ay * tx + ax * ty); o.kyx = TS / det * (-ay) * sx; o.kyy = TS / det * ax * sx;
        return o;
      }
      function muunna(part, o, out) {
        var n = part.length / 2;
        for (var q = 0; q < n; q++) {
          var px = part[2 * q], py = part[2 * q + 1];
          out[2 * q] = o.c0x + o.kxx * px + o.kxy * py; out[2 * q + 1] = o.c0y + o.kyx * px + o.kyy * py;
        }
        return out;
      }
      var seen = 0;
      vecTiles.forEach(function (vt) {
        var o = kerroin(vt, 4096);
        var sq = new Float64Array(10), ext = 4096, corners = [[0, 0], [ext, 0], [ext, ext], [0, ext], [0, 0]];
        for (var q = 0; q < 5; q++) { sq[2 * q] = o.c0x + o.kxx * corners[q][0] + o.kxy * corners[q][1]; sq[2 * q + 1] = o.c0y + o.kyx * corners[q][0] + o.kyy * corners[q][1]; }
        seen += taytaMonikulmio([sq], flag, 1, TS);
      });
      // 2) vesialueet (järvet ja virtavedet, saaret reikinä)
      vecTiles.forEach(function (vt) {
        var mk = vt.d.maastokuvio; if (!mk) return;
        var o = kerroin(vt, mk.extent);
        mk.features.forEach(function (f) {
          var lk = f.props.luokka;
          if (f.type !== 3) return;
          if (M.taajamaLuokat[lk]) { taytaMonikulmio(f.parts.map(function (p) { return muunna(p, o, new Float64Array(p.length)); }), qa, 128, TS); return; }
          if (lk !== 'jarvi' && lk !== 'virtavesi') return;
          var rings = f.parts.map(function (p) { return muunna(p, o, new Float64Array(p.length)); });
          taytaMonikulmio(rings, flag, 0, TS);
        });
      });
      // 3) maanpinta (korkeusmalli, bilinear)
      var dems = s.dem, ND = Math.pow(2, L.zd) * 256;
      for (j = 0; j < TS; j++) {
        var fv = (j + 0.5) / TS;
        for (i = 0; i < TS; i++) {
          var idx = j * TS + i;
          if (!flag[idx]) continue;
          var fu = (i + 0.5) / TS;
          var gx = (m00x + ax * fu + bx * fv) * ND - 0.5, gy = (m00y + ay * fu + by * fv) * ND - 0.5;
          var tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), tix = tx - dems.x0, tiy = ty - dems.y0, g = NaN;
          var T = (tix >= 0 && tiy >= 0 && tix < dems.nx && tiy < dems.ny) ? dems.tiles[tiy * dems.nx + tix] : null;
          if (T) {
            var px = gx - tx * 256, py = gy - ty * 256;
            var xa = Math.floor(px), ya = Math.floor(py), fx = px - xa, fy = py - ya;
            var xb = xa + 1, yb = ya + 1;
            if (xa < 0) xa = 0; if (ya < 0) ya = 0; if (xb > T.w - 1) xb = T.w - 1; if (yb > T.h - 1) yb = T.h - 1; if (xa > T.w - 1) xa = T.w - 1; if (ya > T.h - 1) ya = T.h - 1;
            var v = T.v, a = v[ya * T.w + xa], b = v[ya * T.w + xb], cc = v[yb * T.w + xa], d = v[yb * T.w + xb];
            if (a === a && b === b && cc === cc && d === d) g = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
            else g = a === a ? a : b === b ? b : cc === cc ? cc : d;
          }
          gr[idx] = g === g ? g - LAKE_Z : 0;
        }
      }
      // 4) puusto (lähin pikseli) ja rakennukset
      var treeH = new Float32Array(N), trs = s.tree, NT = Math.pow(2, L.zt) * 256;
      var anyTree = false;
      for (k = 0; k < trs.tiles.length; k++) if (trs.tiles[k]) { anyTree = true; break; }
      if (anyTree) {
        for (j = 0; j < TS; j++) {
          var fv2 = (j + 0.5) / TS;
          for (i = 0; i < TS; i++) {
            var idx2 = j * TS + i;
            if (!flag[idx2]) continue;
            var fu2 = (i + 0.5) / TS;
            var hx = (m00x + ax * fu2 + bx * fv2) * NT, hy = (m00y + ay * fu2 + by * fv2) * NT;
            var ux = Math.floor(hx / 256), uy = Math.floor(hy / 256), jx = ux - trs.x0, jy = uy - trs.y0;
            var TT = (jx >= 0 && jy >= 0 && jx < trs.nx && jy < trs.ny) ? trs.tiles[jy * trs.nx + jx] : null;
            if (!TT) continue;
            var qx = Math.min(TT.w - 1, Math.max(0, Math.floor(hx - ux * 256))), qy = Math.min(TT.h - 1, Math.max(0, Math.floor(hy - uy * 256)));
            treeH[idx2] = TT.v[qy * TT.w + qx];
          }
        }
      }
      if (L.zv >= 13) {
        bh = new Float32Array(N);
        vecTiles.forEach(function (vt) {
          var rk = vt.d.rakennus; if (!rk) return;
          var o = kerroin(vt, rk.extent);
          rk.features.forEach(function (f) {
            if (f.type !== 3) return;
            var hh = M.rakennusKrs[f.props.krs] || M.rakennusKrs.none;
            var rings = f.parts.map(function (p) { return muunna(p, o, new Float64Array(p.length)); });
            // rajaus soluavaruudessa, kokonaan ulkopuolella olevat ohitetaan
            var xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9;
            rings.forEach(function (r) { for (var q = 0; q < r.length / 2; q++) { var x = r[2 * q], y = r[2 * q + 1]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; } });
            if (xmax < 0 || ymax < 0 || xmin > TS || ymin > TS) return;
            var cnt = taytaMonikulmio(rings, flag, 2, TS);
            if (cnt === 0) {   // solua pienempi rakennus: merkitään keskipisteen solu
              var ci = Math.floor((xmin + xmax) / 2), cj = Math.floor((ymin + ymax) / 2);
              if (ci >= 0 && cj >= 0 && ci < TS && cj < TS && flag[cj * TS + ci] !== 0) { flag[cj * TS + ci] = 2; bh[cj * TS + ci] = hh; }
            } else {
              // täytetyt solut: asetetaan korkeus (täyttö kirjoitti vain lipun)
              var j0 = Math.max(0, Math.floor(ymin)), j1 = Math.min(TS - 1, Math.ceil(ymax)), i0 = Math.max(0, Math.floor(xmin)), i1 = Math.min(TS - 1, Math.ceil(xmax));
              for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) if (flag[jj * TS + ii] === 2 && bh[jj * TS + ii] === 0) bh[jj * TS + ii] = hh;
            }
          });
        });
      }
      // 4b) vesirakenteet (laiturit, aallonmurtajat, vesikivet) ja sillat esteinä veden päällä. Ohut viiva rasteroidaan vähintään noin yhden solun levyiseksi
      // (keskipisteen etäisyys viivaan enintään 0,75 solua), jotta se ei katoa suurilla solukooilla eikä säde mene sen väliin.
      var st = null, RANK = { 6: 1, 4: 2, 5: 3, 7: 4, 8: 5 }, tmpA = null;
      function asetaSolu(ci, cj, code) {
        if (ci < 0 || cj < 0 || ci >= TS || cj >= TS) return;
        var q = cj * TS + ci, old = st[q];
        if (!old || RANK[code] >= RANK[old]) st[q] = code;
      }
      function rastViiva(cp, hw, code) {   // cp: litteä [x0, y0, x1, y1, ...] soluavaruudessa
        var np = cp.length / 2;
        for (var si = 0; si < Math.max(1, np - 1); si++) {
          var ax0 = cp[2 * si], ay0 = cp[2 * si + 1], bx0 = np > 1 ? cp[2 * si + 2] : ax0, by0 = np > 1 ? cp[2 * si + 3] : ay0;
          var ddx = bx0 - ax0, ddy = by0 - ay0, ll = ddx * ddx + ddy * ddy;
          var ci0 = Math.max(0, Math.floor(Math.min(ax0, bx0) - hw)), ci1 = Math.min(TS - 1, Math.ceil(Math.max(ax0, bx0) + hw));
          var cj0 = Math.max(0, Math.floor(Math.min(ay0, by0) - hw)), cj1 = Math.min(TS - 1, Math.ceil(Math.max(ay0, by0) + hw));
          for (var cj = cj0; cj <= cj1; cj++) for (var ci = ci0; ci <= ci1; ci++) {
            var px = ci + 0.5 - ax0, py = cj + 0.5 - ay0, u = ll > 0 ? (px * ddx + py * ddy) / ll : 0;
            if (u < 0) u = 0; else if (u > 1) u = 1;
            var ex = px - u * ddx, ey = py - u * ddy;
            if (ex * ex + ey * ey <= hw * hw) asetaSolu(ci, cj, code);
          }
        }
      }
      function rastAla(rings, code) {
        if (!tmpA) tmpA = new Uint8Array(N); else tmpA.fill(0);
        var cnt = taytaMonikulmio(rings, tmpA, code, TS);
        if (cnt === 0) { rings.forEach(function (r) { rastViiva(r, 0.75, code); }); return; }
        for (var q = 0; q < N; q++) if (tmpA[q]) { if (!st[q] || RANK[code] >= RANK[st[q]]) st[q] = code; }
      }
      function hwSolua(leveysM) { return Math.max(leveysM / (2 * c), 0.75); }
      vecTiles.forEach(function (vt) {
        var vs = vt.d.vesieste, te = vt.d.tie, o;
        if (vs && vs.features && vs.features.length) {
          o = kerroin(vt, vs.extent);
          vs.features.forEach(function (f) {
            var laji = String((f.props && f.props.laji) || ''), code = 0, lev = 0;
            if (laji === 'laituri_kapea') { code = 4; lev = M.rakenneL.laituri_kapea; }
            else if (/^laituri/.test(laji)) { code = 4; lev = M.rakenneL.laituri_leveä; }
            else if (/aallonmurt/.test(laji)) { code = 5; lev = M.rakenneL.aallonmurtaja; }
            else if (/^vesikivi_pinnassa|^vesikivi_pinnan_yl/.test(laji)) { code = 6; lev = M.rakenneL.vesikivi; }
            if (!code) return;
            if (!st) st = new Uint8Array(N);
            if (f.type === 1) { for (var pi = 0; pi < f.parts.length; pi++) rastViiva(muunna(f.parts[pi], o, new Float64Array(f.parts[pi].length)), hwSolua(lev), code); }
            else if (f.type === 2) { f.parts.forEach(function (p) { rastViiva(muunna(p, o, new Float64Array(p.length)), hwSolua(lev), code); }); }
            else if (f.type === 3) { rastAla(f.parts.map(function (p) { return muunna(p, o, new Float64Array(p.length)); }), code); }
          });
        }
        if (te && te.features && te.features.length) {
          o = kerroin(vt, te.extent);
          te.features.forEach(function (f) {
            if (f.type !== 2 || !f.props || !(f.props.taso > 0)) return;     // silta: tasosijainti suurempi kuin 0
            var lk = f.props.luokka, tn = f.props.tienumero, rata = lk >= 14000 && lk < 15000, lev, code = rata ? 8 : 7;
            if (rata) lev = M.sillanLeveys.rata;
            else if (lk === 12111 || lk === 12112 || (tn > 0 && tn < 100 && lk < 12300)) lev = M.sillanLeveys.valtatie;
            else if (lk < 12300) lev = M.sillanLeveys.autotie;
            else lev = M.sillanLeveys.kevyt;
            if (!st) st = new Uint8Array(N);
            f.parts.forEach(function (p) { rastViiva(muunna(p, o, new Float64Array(p.length)), hwSolua(lev), code); });
          });
        }
      });
      if (st) for (k = 0; k < N; k++) if (st[k] && flag[k] === 0) flag[k] = st[k];     // vain veden päällä
      // 5) korkeus järven pinnasta, desimetreinä
      var hdm = new Int16Array(N);
      for (k = 0; k < N; k++) {
        if (!flag[k]) continue;
        if (flag[k] >= 4) { hdm[k] = Math.round(M.rakenneH[flag[k]] * 10); continue; }
        var g0 = gr[k] > 0 ? gr[k] : 0, H;
        if (flag[k] === 2) { var bk = bh && bh[k] ? bh[k] : M.rakennusKrs.none; H = g0 + bk; qa[k] |= Math.min(127, Math.round(2 * M.rakennusLapaisy * bk)); }
        else { H = g0 + treeH[k] * M.latvusKerroin; if (treeH[k] > 0) { flag[k] = 3; qa[k] |= Math.min(127, Math.round(treeH[k] * 2 * (1 - M.latvusKerroin))); } }
        if (H < M.minKorkeusM) H = M.minKorkeusM;
        hdm[k] = Math.min(32000, Math.round(H * 10));
      }
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      tilasto.rakennusMs += t1 - t0; tilasto.ruutuja++;
      var maa = false, hmx = 0; for (k = 0; k < N; k++) if (flag[k]) { maa = true; var hk = hdm[k] + (flag[k] === 3 ? (qa[k] & 127) * 5 : 0); if (hk > hmx) hmx = hk; }
      return { f: flag, h: hdm, q: qa, vain: seen, maa: maa, hmax: hmx * 0.1 };
    }

    function tallennaRuutu(c, ti, tj, tile) {
      if (tile.hmax > hmaxM) hmaxM = tile.hmax;     // varjoraja seuraa korkeinta ladattua estettä
      ruudut.set(ruutuAvain(c, ti, tj), tile);
      if (ruudut.size > MAX_RUUTUA) ruudut.delete(ruudut.keys().next().value);
    }

    function kasitteleJono() {
      while (rakennetaan < MAXPAR && jono.length) {
        var job = jono.shift(), key = ruutuAvain(job.c, job.ti, job.tj);
        if (ruudut.has(key) || odottaa.has(key)) continue;
        rakennetaan++;
        odottaa.set(key, true);
        (function (job, key) {
          haeSyotteet(job.c, job.ti, job.tj).then(function (s) {
            return new Promise(function (res) { setTimeout(function () { res(s); }, 0); });
          }).then(function (s) {
            tallennaRuutu(job.c, job.ti, job.tj, rakennaRuutu(s));
          }).catch(function (e) {
            if (typeof console !== 'undefined') console.warn('Tutka: ruudun rakennus epäonnistui', e);
            tallennaRuutu(job.c, job.ti, job.tj, { f: new Uint8Array(TS * TS), h: new Int16Array(TS * TS), q: null, vain: 0, maa: false });
          }).then(function () {
            odottaa.delete(key); rakennetaan--; kasitteleJono(); ilmoitaValmis();
          });
        })(job, key);
      }
    }
    function tarvittavatRuudut(c, e, n, r) {
      var size = TS * c, out = [], ti0 = Math.floor((e - r) / size), ti1 = Math.floor((e + r) / size), tj0 = Math.floor((n - r) / size), tj1 = Math.floor((n + r) / size);
      for (var tj = tj0; tj <= tj1; tj++) for (var ti = ti0; ti <= ti1; ti++) {
        var cx = (ti + 0.5) * size, cy = (tj + 0.5) * size, dx = Math.max(0, Math.abs(cx - e) - size / 2), dy = Math.max(0, Math.abs(cy - n) - size / 2);
        if (Math.hypot(dx, dy) <= r) out.push({ c: c, ti: ti, tj: tj, d: Math.hypot(cx - e, cy - n) });
      }
      out.sort(function (a, b) { return a.d - b.d; });
      return out;
    }
    function puuttuvat() {
      if (!S.onTila || !rangeM) return [];
      var list = tarvittavatRuudut(cell, S.e, S.n, rangeM * 1.02), out = [];
      for (var i = 0; i < list.length; i++) if (!ruudut.has(ruutuAvain(list[i].c, list[i].ti, list[i].tj))) out.push(list[i]);
      return out;
    }
    function ilmoitaValmis() {
      if (rakennetaan === 0 && jono.length === 0 && aidsPending === 0 && odottajat.length && puuttuvat().length > 0) { varmista(true); return; }   // varmuus: ruutu poistui rakennuksen aikana
      if (rakennetaan === 0 && jono.length === 0 && aidsPending === 0 && puuttuvat().length === 0 && odottajat.length) {
        var w = odottajat.splice(0); w.forEach(function (f) { f(); });
      }
    }
    function varmista(pakota) {
      if (!S.onTila || !rangeM) return;
      var moved = Math.hypot(S.e - viimeVarmistus.e, S.n - viimeVarmistus.n);
      if (!pakota && cell === viimeVarmistus.cell && rangeM === viimeVarmistus.r && moved < TSm * 0.25) return;
      viimeVarmistus = { e: S.e, n: S.n, cell: cell, r: rangeM };
      var list = tarvittavatRuudut(cell, S.e, S.n, rangeM * 1.02);
      // Tuoreena käytetyt ruudut siirretään Map-järjestyksen loppuun, jotta FIFO-poisto ei syö juuri tarvittavia ruutuja (ruutu poistui ennen: valmis() jäi odottamaan)
      list.forEach(function (t) { var k = ruutuAvain(t.c, t.ti, t.tj), v = ruudut.get(k); if (v) { ruudut.delete(k); ruudut.set(k, v); } });
      jono = list.filter(function (t) { var k = ruutuAvain(t.c, t.ti, t.tj); return !ruudut.has(k) && !odottaa.has(k); });
      kasitteleJono();
      lataaTurvalaitteet();
      ilmoitaValmis();
    }

    // ---------- turvalaitteet ----------
    var aids = new Map(), aidsLoaded = new Set(), aidsPending = 0, aidList = [], aidDirty = true;
    function aidLuokka(a) {
      var t = a.tyyppi || '';
      if (/loisto/i.test(t)) return { hs: a.valoKorkeus || 8, v: 0.88, maxR: 11000, p0: 1.0, kiinteä: true };
      if (/kummeli/i.test(t)) return { hs: 3, v: 0.62, maxR: 5200, p0: 1.0, kiinteä: true };
      if (/viitta/i.test(t)) return { hs: 1.2, v: 0.5, maxR: 2600, p0: 0.98, kiinteä: false, kelluva: true };     // 30.10.2026: tyynellä selvä ja vakaa kaiku
      if (/poiju/i.test(t)) return { hs: 2.6, v: 0.62, maxR: 4000, p0: 0.98, kiinteä: false, kelluva: true };   // pilaripoiju (tutkaheijastin)
      return { hs: 2.5, v: 0.5, maxR: 3800, p0: 0.95, kiinteä: a.alityyppi === 'KIINTEÄ' };
    }
    function kasitteleAidsTile(z, tx, ty, layer) {
      if (!layer) return;
      layer.features.forEach(function (f) {
        if (f.type !== 1 || !f.parts.length) return;
        var p = f.props, num = String(p.numero);
        if (aids.has(num)) return;
        var q = f.parts[0], ll = K.tileLonLat(z, tx, ty, q[0] / layer.extent, q[1] / layer.extent), en = K.lonlatToEN(ll.lon, ll.lat);
        var a = { numero: num, nimi: p.nimi || '', tyyppi: p.tyyppi || '', alityyppi: p.alityyppi || '', valoKorkeus: p.valon_korkeus_vedesta == null ? null : Number(p.valon_korkeus_vedesta), e: en.e, n: en.n };
        a.luokka = aidLuokka(a);
        aids.set(num, a); aidDirty = true;
      });
    }
    function lataaTurvalaitteet() {
      if (!S.onTila || !rangeM) return;
      // lähellä (enintään 2,2 km) täysi aineisto z16-ruuduista, kauempana ruudukon ruutujen zoomista (harvennettu)
      var plans = [{ z: 16, r: Math.min(rangeM * 1.02, 2200) }];
      if (rangeM > 2200) plans.push({ z: LOD[cell].zv, r: rangeM * 1.02 });
      plans.forEach(function (pl) {
        var ll = K.enToLonLat(S.e, S.n), tt = K.lonlatToTile(ll.lon, ll.lat, pl.z);
        var tw = 40075016.686 * Math.cos(ll.lat * RAD) / Math.pow(2, pl.z), k = Math.ceil(pl.r / tw) + 1;
        for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) {
          var tx = Math.floor(tt.x) + dx, ty = Math.floor(tt.y) + dy, key = pl.z + '/' + tx + '/' + ty;
          if (aidsLoaded.has(key)) continue;
          var cn = K.tileLonLat(pl.z, tx, ty, 0.5, 0.5), ce = K.lonlatToEN(cn.lon, cn.lat);
          if (Math.hypot(ce.e - S.e, ce.n - S.n) > pl.r + tw * 0.75) continue;
          aidsLoaded.add(key); aidsPending++;
          (function (z, tx, ty) {
            lukija.vektori(z, tx, ty, ['turvalaite']).then(function (l) { if (l) kasitteleAidsTile(z, tx, ty, l.turvalaite); }, function () {}).then(function () { aidsPending--; ilmoitaValmis(); });
          })(pl.z, tx, ty);
        }
      });
    }
    var aidRel = [];    // [{r, b (tosisuunta), luokka, num}]
    function paivitaAidRel() {
      aidRel = [];
      var gam = S.conv;
      aids.forEach(function (a) {
        var dx = a.e - S.e, dy = a.n - S.n, r = Math.hypot(dx, dy);
        if (r < M.minEtaisyysM || r > rangeM * 1.01) return;
        aidRel.push({ r: r, b: norm360(Math.atan2(dx, dy) / RAD + gam), a: a, hg: 0 });
      });
      aidDirty = false;
    }

    // ---------- veneet (vaihe 3l) ----------
    // Kiinnitetyt veneet haetaan lähteestä (opt.veneet) 100 m:n tai 1,5 s:n välein ja suhteellinen suunta ja etäisyys lasketaan joka päivityksellä.
    var boatCache = null, boatCacheE = 1e18, boatCacheN = 1e18, boatCacheT = -1e9, boatRel = [];
    function veneLuokka(v) {
      var c = M.veneet[v.luokka] || M.veneet.pieni;
      return { v: c.v, hs: v.luokka === 'purje' ? Math.max(3, (v.masto || 12) * c.hs) : c.hs };
    }
    function paivitaVeneRel() {
      boatRel = [];
      if (!veneLahde) return;
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (!boatCache || Math.hypot(S.e - boatCacheE, S.n - boatCacheN) > M.veneet.paivitysM || now - boatCacheT > M.veneet.paivitysMs) {
        var l = null; try { l = veneLahde(S.e, S.n, M.veneet.haku); } catch (e) { l = null; }
        boatCache = (l || []).filter(function (v) { return v.kiinnitetty !== false; }); boatCacheE = S.e; boatCacheN = S.n; boatCacheT = now;
        tilasto.veneita = boatCache.length;
      }
      var gam = S.conv, rmax = Math.min(M.veneet.maxR, rangeM * 1.01);
      for (var i = 0; i < boatCache.length; i++) {
        var v = boatCache[i], dx = v.e - S.e, dy = v.n - S.n, r = Math.hypot(dx, dy);
        if (r < M.minEtaisyysM || r > rmax) continue;
        var c = veneLuokka(v);
        boatRel.push({ r: r, b: norm360(Math.atan2(dx, dy) / RAD + gam), v: c.v * (v.kaikuVahvuus || 1), hs: c.hs });
      }
      boatDirty = false;
    }
    var boatDirty = true;

    // ---------- sädelaskenta ----------
    function haeRuutu(ti, tj) {
      var key = ruutuAvain(cell, ti, tj), t = ruudut.get(key);
      return t || null;
    }
    var segB = new Int16Array(64), segE = new Int16Array(64), segT = new Array(64), segC = new Float64Array(128), hSuf = new Float64Array(65);   // säteen ruutujaksot
    var NOLLA = new Uint8Array(TS * TS);   // tyhjä lisätietotaulukko (huono viritys ja ruudut ilman lisätietoa)
    var hmaxM = 70;   // korkein mahdollinen este (m vedenpinnasta, myös loistojen valot): varjoraja
    var K2 = 1 / (2 * M.kerroinK * M.maaR), ensiIdx = -1, ensiEnd = -1, alW = new Float64Array(NB), invS = new Float64Array(NB), attG = new Float64Array(NB), attB = new Float64Array(NB);
    // Marssii yhden säteen (tosisuunta th, aste) ja täyttää Eb (0..1), Hb, Fb, Ab (näkyvyyskulma), Mb (varjokulma) taulukot.
    // Palauttaa ensimmäisen maaosuman etäisyyden (m) tai 0.
    function marssi(th, aikaS, revNo, seed, ilmanKohinaa) {
      var gb = (th - S.conv) * RAD, dx = Math.sin(gb), dy = Math.cos(gb);
      var oe = S.e, on = S.n, i, s, j;
      var ti = 0, tj = 0, tile = null, ce0 = 0, cn0 = 0, tf = null, th2 = null, tq = NOLLA;
      var firstLand = -1, firstAny = -1;     // firstLand: ensimmäinen todellinen maa (rantaviivan mittaukset), firstAny: myös vesirakenteet ja sillat (kaiun pulssi)
      var amax = -1e9, jW = Math.max(1, Math.round(M.ikkunaM / step)), g = C.vahvistus * (1 - 0.5 * C.hairio.heikko);
      var ensiEndAuki = true; ensiEnd = -1;
      Eb.fill(0);
      var P = C.viritys === 'huono' ? M.huono : M.hyva, rr0 = 1 / P.rangeR0, nBand = Math.max(1, Math.round(P.rantaLeveysM / step)), maaJ = 0, m0 = P.rinneAlku, m1 = 1 - m0;
      var varjoRaja = P === M.hyva, hyvaM = varjoRaja, tol = hyvaM ? P.varjoTol : 0, iEdge = -1, nPen = hyvaM ? Math.max(1, Math.round(P.varjoMatkaM / step)) : 0, att = hyvaM ? attG : attB, invRK = hyvaM ? 1 / P.rinneKaltevuus : 0;           // hyvässä virityksessä säde lopetetaan, kun mikään kauempana oleva ei enää voi näkyä
      // Ruutu kerrallaan: ensin näytteenotto (maski ja korkeus) ruudun matkalta, sitten näkyvyys ja kaiun voimakkuus samalta matkalta.
      // Ruudun poistumisaskel lasketaan etukäteen. Ruudut, joissa ei ole lainkaan maata (tai ruutua ei ole), ohitetaan kerralla vetenä.
      // Kulma al = (H - ha) / s - s K2 = alW[i] + H invS[i] (taulukot lasketaan alueen vaihtuessa), joten jakolaskua ei tarvita.
      // 0) säteen ruutujaksot etukäteen (ruutu, ensimmäinen ja viimeinen askel) ja jäljellä olevien ruutujen korkein este (varjorajan pysäytykseen)
      var nSeg = 0, q0 = 0;
      while (q0 < NB) {
        s = (q0 + 1) * step;
        var e = oe + s * dx, n = on + s * dy;
        ti = Math.floor(e * invTSm); tj = Math.floor(n * invTSm);
        var tl = haeRuutu(ti, tj), ce = ti * TSm, cn = tj * TSm;
        var ex = dx > 1e-9 ? (ce + TSm - oe) / dx : dx < -1e-9 ? (ce - oe) / dx : 1e18, ey = dy > 1e-9 ? (cn + TSm - on) / dy : dy < -1e-9 ? (cn - on) / dy : 1e18;
        var qe = Math.floor((ex < ey ? ex : ey) / step - 1e-6);      // ensimmäinen askel, joka ei enää ole tässä ruudussa
        if (qe <= q0) qe = q0 + 1; if (qe > NB) qe = NB;
        segB[nSeg] = q0; segE[nSeg] = qe; segT[nSeg] = tl; segC[2 * nSeg] = ce; segC[2 * nSeg + 1] = cn; nSeg++; q0 = qe;
      }
      if (varjoRaja) {
        hSuf[nSeg] = 0;
        for (var qs = nSeg - 1; qs >= 0; qs--) { var tt = segT[qs], hv = tt && tt.maa ? tt.hmax : 0; hSuf[qs] = hSuf[qs + 1] > hv ? hSuf[qs + 1] : hv; }
      }
      for (var sgi = 0; sgi < nSeg; sgi++) {
        i = segB[sgi]; var iEnd = segE[sgi]; tile = segT[sgi]; ce0 = segC[2 * sgi]; cn0 = segC[2 * sgi + 1];
        var i1 = i;
        if (!tile || !tile.maa) {
          Hb.fill(0, i, iEnd); Fb.fill(0, i, iEnd);
        } else {
          tf = tile.f; th2 = tile.h; tq = (hyvaM && tile.q) || NOLLA;
          var fx = (oe + (i + 1) * step * dx - ce0) * invC, fy = (on + (i + 1) * step * dy - cn0) * invC, sx = step * dx * invC, sy = step * dy * invC;   // solukoordinaatit, askel kerrallaan
          for (j = i; j < iEnd; j++, fx += sx, fy += sy) {
            s = (j + 1) * step;
            var ci = fx | 0, cj = fy | 0;
            if (ci < 0) ci = 0; else if (ci >= TS) ci = TS - 1; if (cj < 0) cj = 0; else if (cj >= TS) cj = TS - 1;
            var id = cj * TS + ci, f = tf[id];
            Fb[j] = f;
            if (f) {
              var hh = th2[id] * 0.1, sh = hh, qv = tq[id];
              if (qv) { if (f === 3) hh += (qv & 127) * 0.5; else if (f === 2) sh = hh - (qv & 127) * 0.5; }   // hyvä viritys: latvuston yläpinta kaikuu (varjo vanhalla korkeudella), rakennuksen varjo huokoinen
              Hb[j] = hh; Sb[j] = sh; Tb[j] = qv >> 7;
              if (s >= M.minEtaisyysM) { if (firstAny < 0) firstAny = j; if (firstLand < 0 && f < 4) firstLand = j; }
            } else Hb[j] = 0;
          }
        }
        // 2) näkyvyys ja kaiun voimakkuus tämän ruudun askelille
        for (i = i1; i < iEnd; i++) {
          var fl = Fb[i];
          if (!fl) {                                              // vesi: kulma kasvaa etäisyyden mukana, joten se on samalla suurin tähän asti nähty kulma
            var aw = alW[i]; Ab[i] = aw; if (aw > amax) { amax = aw; iEdge = i; } Mb[i] = amax; maaJ = 0;
            if (ensiEndAuki && firstLand >= 0 && i > firstLand) { ensiEnd = i - 1; ensiEndAuki = false; }
            continue;
          }
          s = (i + 1) * step; maaJ++;
          var H = Hb[i], al = alW[i] + H * invS[i], E = 0;
          Ab[i] = al;
          if (al <= amax && (al <= amax - tol || i - iEdge > nPen)) { Mb[i] = amax; continue; }       // varjossa (hyvässä virityksessä varjon reunan taipuma-alue, enintään varjoTol kulmaa ja varjoMatkaM matkaa varjon reunasta, jää tämän yli)
          var als = Sb[i] === H ? al : alW[i] + Sb[i] * invS[i];             // varjokulma (latvuston ja rakennuksen läpäisy)
          if (s >= M.minEtaisyysM) {
            var dh = (al - amax) * s;                            // korkeus varjorajan yläpuolella, m (varjon reunalla negatiivinen)
            var vis = dh >= P.nakyvyysM ? 1 : dh > 0 ? P.nakyvyysPohja + (1 - P.nakyvyysPohja) * dh / P.nakyvyysM : P.varjoE * (1 - (amax - al) / tol) * (1 - (i - iEdge) / nPen);
            if (hyvaM) {
              // Hyvä viritys: tasainen näkyvä maa pohjatasolla, rinne, ranta ja rakennukset kirkkaammin, metsä (latvusto) aina vähintään pohjaMetsa
              if (fl >= 4) E = M.rakenneE[fl];
              else if (fl === 2) E = P.rakennusE;
              else {
                var B = fl === 3 ? P.pohjaMetsa : P.pohjaMaa;
                if (Tb[i] && B < P.taajamaE) B = P.taajamaE;
                E = B;
                var sg = i >= jW ? (H - Hb[i - jW]) / (jW * step) : H / (jW * step);   // rinteen nousu tutkaa kohti
                if (sg > 0) { var xs = sg * invRK; if (xs > 1) xs = 1; E += (1 - B) * xs * (2 - xs); }   // rinteen kaiku kasvaa nopeasti loivillakin rinteillä (kuten neliöjuuri, ilman neliöjuurta)
                if (maaJ <= nBand) {                             // rantapenkka, kivet ja rantakasvillisuus kaikuvat aina: alaraja hiipuu rannasta sisämaahan
                  var cb = nBand > 1 ? P.rantaE - (P.rantaE - B) * (maaJ - 1) / nBand : P.rantaE;
                  if (E < cb) E = cb;
                }
              }
            } else {
              if (fl >= 4) E = M.rakenneE[fl] * M.rakenneHuono;
              else if (fl === 2) E = 0.9 + 0.1 * Math.min(1, H / 14);
              else {
                var Hp2 = i - jW >= 0 ? Hb[i - jW] : 0;
                var sg2 = (H - Hp2) / (jW * step);
                var F = sg2 <= 0 ? 0 : Math.sqrt(Math.min(1, sg2 / 0.6));
                var Hf = Math.sqrt(Math.min(1, H / 25));
                var B2 = (fl === 3 ? P.pohjaMetsa : P.pohjaMaa) + P.pohjaKorkeus * Hf;
                E = B2 + (1 - B2) * F * (m0 + m1 * Hf);
                if (maaJ <= nBand) { var cb2 = nBand > 1 ? P.rantaE - (P.rantaE - B2) * (maaJ - 1) / nBand : P.rantaE; if (E < cb2) E = cb2; }
              }
              if (fl === 2 && maaJ <= nBand && E < P.rantaE) E = P.rantaE;
            }
            E *= vis * att[i] * g;
          }
          if (als > amax) { amax = als; iEdge = i; } Mb[i] = amax;
          Eb[i] = E > 1 ? 1 : E;
        }
        // varjoraja: jos jäljellä olevissa ruuduissa ei ole maata tai niiden korkein este ei enää nouse suurimman nähdyn kulman (miinus taipuma) yläpuolelle, loppu on varjoa
        if (varjoRaja && sgi + 1 < nSeg) {
          var hs = hSuf[sgi + 1];
          if (hs <= 0 || amax - tol > ((hs > C.antenniM ? hs : C.antenniM) - C.antenniM) * invS[iEnd] - (iEnd + 1) * step * K2) {
            Hb.fill(0, iEnd); Fb.fill(0, iEnd); Mb.fill(amax, iEnd); Ab.set(alW.subarray(iEnd), iEnd);
            if (ensiEndAuki && firstLand >= 0) { ensiEnd = iEnd - 1; ensiEndAuki = false; }
            break;
          }
        }
      }
      ensiIdx = firstLand; if (firstLand >= 0 && ensiEndAuki) ensiEnd = NB - 1;   // ensimmäisen yhtenäisen maa-alueen viimeinen askel
      // 3) pulssin pituus: kaiku jatkuu muutaman askeleen eteenpäin (vain ensimmäisen maa-askeleen jälkeen, sitä ennen kaiku on nolla)
      var tail = Math.min(3, Math.round(M.pulssiM / step));
      if (P === M.hyva) {
        // Hyvä viritys: kaiku jatkuu pulssin pituudelta kaikilla alueilla (voimakas kaiku pidempään kuin heikko): q = max(E, q - askel / (1,25 pulssia))
        if (firstAny >= 0) { var dec = step / (1.25 * M.pulssiM), qd = 0; for (i = firstAny; i < NB; i++) { qd -= dec; if (Eb[i] > qd) qd = Eb[i]; else Eb[i] = qd > 0 ? qd : 0; if (qd < 0) qd = 0; } }
      } else if (tail > 0 && firstAny >= 0) for (i = NB - 1; i > firstAny; i--) {
        var q = 0.62 * Eb[i - 1]; if (tail > 1 && i > 1) q = Math.max(q, 0.35 * Eb[i - 2]); if (tail > 2 && i > 2) q = Math.max(q, 0.18 * Eb[i - 3]);
        if (q > Eb[i]) Eb[i] = q;
      }
      return firstLand >= 0 ? refineHit(oe, on, dx, dy, firstLand) : 0;
    }
    function landAt(oe, on, dx, dy, s) {
      var e = oe + s * dx, n = on + s * dy, ti = Math.floor(e * invTSm), tj = Math.floor(n * invTSm), t = haeRuutu(ti, tj);
      if (!t) return 0;
      var ci = ((e - ti * TSm) * invC) | 0, cj = ((n - tj * TSm) * invC) | 0;
      var fv = t.f[cj * TS + ci]; return fv >= 4 ? 0 : fv;
    }
    function refineHit(oe, on, dx, dy, i) {   // puolitushaku edellisen askeleen (vesi) ja tämän askeleen (maa) välillä
      var hi = (i + 1) * step, lo = i * step;
      // ruutu haetaan kerran: kaikki haun pisteet ovat askeleen sisällä, eli (lähes aina) samassa ruudussa kuin ensimmäinen maa-askel
      var e1 = oe + hi * dx, n1 = on + hi * dy, ti1 = Math.floor(e1 * invTSm), tj1 = Math.floor(n1 * invTSm), t1 = haeRuutu(ti1, tj1), tf1 = t1 ? t1.f : null;
      function maa(s) {
        var e = oe + s * dx, n = on + s * dy, ti = Math.floor(e * invTSm), tj = Math.floor(n * invTSm);
        if (ti !== ti1 || tj !== tj1) return landAt(oe, on, dx, dy, s);
        if (!tf1) return 0;
        var fq = tf1[(((n - tj * TSm) * invC) | 0) * TS + (((e - ti * TSm) * invC) | 0)]; return fq >= 4 ? 0 : fq;
      }
      if (i === 0 || maa(lo)) return hi;
      for (var it = 0; it < 7; it++) {
        var mid = (lo + hi) / 2;
        if (maa(mid)) hi = mid; else lo = mid;
      }
      return hi;
    }

    // Kaiun lisäykset: turvalaitteet, veden kohina, sadeharso, vastaanottimen kohina
    var rng = mulberry(12345);
    // Vastaanottimen kohina: käyttäjän asettama (asetaHairio) tai viritystilan oma, kumpi on suurempi
    function kohinaTeho() { var v = (C.viritys === 'huono' ? M.huono : M.hyva).kohinaViritys; return C.hairio.kohina > v ? C.hairio.kohina : v; }
    // merivälkkeen voimakkuus A (0 tyyni ... noin 1,5 kova keli) ja ulottuvuus Rc (m) aallonkorkeudesta
    function meriKaiku() { var hs = C.meri.hs || 0; return { A: Math.min(1.5, hs / 0.5), Rc: 70 + 430 * Math.min(1, hs / 0.8) }; }   // ulottuvuus: Hs 0,3 m noin 230 m, Hs 0,8 m noin 500 m (tihein lähellä)
    // SEA (STC): lähikaikujen vaimennus etäisyyden mukaan. Käsin tasot 1-3, AUTO sovittaa vaimennuksen merivälkkeen voimakkuuteen ja ulottuvuuteen.
    function stcTaso() {
      if (C.sea === -1) { var mk = meriKaiku(); return { L: Math.min(0.92, mk.A * 0.7), R: mk.Rc * 0.9 }; }
      return [{ L: 0, R: 1 }, { L: 0.45, R: 350 }, { L: 0.7, R: 650 }, { L: 0.88, R: 1000 }][C.sea] || { L: 0, R: 1 };
    }
    function lisaaStc() {
      var t = stcTaso(); if (t.L <= 0) return;
      for (var i = 0; i < NB; i++) { var s = (i + 1) * step; if (s > 4 * t.R) break; var f = 1 - t.L * Math.exp(-s / t.R); Eb[i] = Eb[i] * f; if (Eb[i] < 0.07) Eb[i] = 0; }
    }
    function lisaaHairio(th, aikaS, revNo) {
      var i, s;
      // merivälke (sea clutter, 30.10.2026): aallokon harjoista tuleva kaiku lähellä alusta. Voimakkuus ja ulottuvuus kasvavat aallonkorkeuden mukana,
      // tuulen yläpuolella (aaltojen tulosuunta) välke on selvästi voimakkaampaa kuin alapuolella, ja kuvio vaihtuu kierroksesta toiseen (pilkkumainen).
      // Tyynellä vain aivan lähellä muutama heikko piste.
      var rs = mulberry((Math.round(th * 4) * 7919 + revNo * 104729) | 0), mk = meriKaiku();
      if (mk.A < 0.05) {
        if (rs() < 0.5) { s = -40 * Math.log(1 - rs() * 0.95); if (s >= M.minEtaisyysM && s < 120) { i = Math.floor(s / step); if (i < NB && !Fb[i]) { var v0 = 0.06 + 0.08 * rs(); if (v0 > Eb[i]) Eb[i] = v0; } } }
      } else {
        var dW = (th - C.meri.tuuliMista) * RAD, up = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(dW)), Aup = mk.A * up, Rc = mk.Rc * (0.7 + 0.5 * up), sMax = Math.min(rangeM, 3.5 * Rc);
        for (i = Math.floor(M.minEtaisyysM / step); i < NB; i++) {
          s = (i + 1) * step; if (s > sMax) break; if (Fb[i]) continue;
          var q = s / Rc, ex = Math.exp(-q * Math.sqrt(q)), pc = Math.min(0.85, Aup * 0.8 * ex);
          if (rs() < pc) { var vc = (0.18 + 0.62 * rs() * rs()) * Math.min(1.2, Aup) * (0.35 + 0.65 * ex); if (vc > Eb[i]) Eb[i] = vc; }
        }
      }
      // sadeharso
      var sade = C.sade;
      if (sade > 0) {
        var sup = 1 - 0.9 * C.sadeSuodatin, gb = (th - S.conv) * RAD, dx = Math.sin(gb), dy = Math.cos(gb);
        for (i = 0; i < NB; i++) {
          s = (i + 1) * step;
          if (s < M.minEtaisyysM) continue;
          var e = S.e + s * dx, n = S.n + s * dy;
          var cl = Math.sin(e * 0.0011 + aikaS * 0.02) * Math.sin(n * 0.0013 - aikaS * 0.015) + 0.6 * Math.sin((e + n) * 0.0021 + 1.3) - 0.15;
          if (cl <= 0) continue;
          cl = Math.min(1, cl * 1.6) * sade / (1 + s / 3500);
          if (rs() < cl * 0.55) { var vv = (0.12 + 0.38 * rs()) * sup; if (vv > Eb[i]) Eb[i] = vv; }
        }
      }
      var kohina = kohinaTeho();
      if (kohina > 0) {
        var pk = Math.min(0.5, 0.01 * kohina), lq = Math.log(1 - pk);   // jokainen askel on kohinapiste todennäköisyydellä pk: välit arvotaan geometrisella jakaumalla (yksi arvonta pistettä kohden)
        i = Math.floor(Math.log(1 - rs()) / lq);
        while (i < NB) { var vk = 0.10 + 0.3 * rs(); if (vk > Eb[i]) Eb[i] = vk; i += 1 + Math.floor(Math.log(1 - rs()) / lq); }
      }
    }
    function lisaaAidit(k, th, revNo) {
      if (aidDirty) paivitaAidRel();
      var hw = M.keilaAste * 0.5 * 1.35;
      for (var q = 0; q < aidRel.length; q++) {
        var a = aidRel[q], d = a.b - th; if (d < 0) d = -d; if (d > 180) d = 360 - d;
        if (d > hw) continue;
        var cl = a.a.luokka, r = a.r;
        if (r > cl.maxR) continue;
        var rr = mulberry((parseInt(a.a.numero, 10) || q) * 2654435 + revNo * 40503);
        var PV = C.viritys === 'huono' ? M.huono : M.hyva, kv = PV.kiinteaVaihtelu;
        // kelluvat merkit: tyynellä havainto lähes varma noin 1,5 km:iin asti ja kaiku tasainen. Aallokossa merkki keinuu ja jää välillä aallon taakse:
        // havainto harvenee ja kaiku vaihtelee kierroksesta toiseen (Hs 0,6 m: noin puolet kierroksista).
        var meriH = Math.min(1, (C.meri.hs || 0) / 0.6), pdet, amp;
        if (cl.kiinteä) pdet = PV.kiintePDet != null ? PV.kiintePDet : cl.p0;
        else pdet = Math.max(0.1, Math.min(cl.p0, 1.0 - Math.max(0, r - 1500) / (cl.maxR - 1500) * 0.7)) * (1 - 0.5 * meriH);
        if (rr() > pdet) continue;
        amp = cl.v * (cl.kiinteä ? (kv[0] + (kv[1] - kv[0]) * rr()) : (0.85 + 0.15 * rr()) * (1 - meriH * 0.55 * rr())) * (1 - d / (hw * 1.15));
        // näkyvyys: antennin näkölinja ei saa jäädä esteen taakse
        var bi = Math.min(NB - 1, Math.floor(r / step) - 1); if (bi < 0) continue;
        var Ha = Math.max(cl.hs, Hb[bi]), al = (Ha - C.antenniM) / r - r * K2, ref = Mb[Math.max(0, bi - 3)];
        if (al < ref - 0.0009) continue;
        amp *= C.vahvistus * (1 - 0.5 * C.hairio.heikko) / (1 + r * r / 49e6);
        var span = Math.max(1, Math.round(M.pulssiM / step)), b0 = bi;
        for (var u = -1; u <= span; u++) {
          var bb = b0 + u; if (bb < 0 || bb >= NB) continue;
          var w = u < 0 ? 0.45 : (u === 0 ? 1 : Math.max(0.4, 1 - 0.18 * u));
          if (amp * w > Eb[bb]) Eb[bb] = amp * w;
        }
      }
      // veneet: pistekaiku kuten kiinteällä merkillä, mutta aina havaittu ja vakiovoimakkuudella (ei välkyntää). Näkyvyys ja varjo samalla kulmakaavalla kuin merkeillä.
      if (veneLahde) {
        if (boatDirty) paivitaVeneRel();
        for (var qb = 0; qb < boatRel.length; qb++) {
          var bt = boatRel[qb], db = bt.b - th; if (db < 0) db = -db; if (db > 180) db = 360 - db;
          if (db > hw) continue;
          var rb = bt.r, bi2 = Math.min(NB - 1, Math.floor(rb / step) - 1); if (bi2 < 0) continue;
          var ampb = bt.v * (1 - db / (hw * 1.15));
          var Hab = Math.max(bt.hs, Hb[bi2]), alb = (Hab - C.antenniM) / rb - rb * K2, refb = Mb[Math.max(0, bi2 - 3)];
          if (alb < refb - 0.0009) continue;
          ampb *= C.vahvistus * (1 - 0.5 * C.hairio.heikko) / (1 + rb * rb / 49e6);
          var spanb = Math.max(1, Math.round(M.pulssiM / step));
          for (var ub = -1; ub <= spanb; ub++) {
            var bbb = bi2 + ub; if (bbb < 0 || bbb >= NB) continue;
            var wb = ub < 0 ? 0.45 : (ub === 0 ? 1 : Math.max(0.4, 1 - 0.18 * ub));
            if (ampb * wb > Eb[bbb]) Eb[bbb] = ampb * wb;
          }
        }
      }
    }

    // Tallentaa säteen k tuloksen (Eb) puskureihin
    function talleta(k, t) {
      var base = k * NB, tf = C.sadeSuodatin, i;
      var jd = JALJET[C.jalkiIdx];
      var trailV = 0;
      if (jd > 0 && trail) {
        var age = (t - rayT[k]) / 1000, fac = rayT[k] < -1e8 ? 0 : Math.max(0, 1 - age / jd);
        for (i = 0; i < NB; i++) {
          var e8 = Eb[i] * 255 + 0.5 | 0;
          var old = trail[base + i] * fac, nw = e8 * 0.75;
          trail[base + i] = old > nw ? old : nw;
        }
      }
      var fb = NB, i0 = 0;
      while (i0 < NB && Eb[i0] === 0) i0++;       // kaiku alkaa vasta ensimmäisestä nollasta poikkeavasta askeleesta (vesi lähellä on nollaa)
      if (i0 > 0) raw.fill(0, base, base + i0);
      if (tf > 0) {
        for (i = i0; i < NB; i++) {
          var E = Eb[i];
          if (E < 0.35) E *= (1 - 0.45 * tf);
          var q8 = E * 255 + 0.5 | 0;
          raw[base + i] = q8;
          if (q8 > 0 && fb === NB) fb = i;
        }
      } else {
        for (i = i0; i < NB; i++) raw[base + i] = Eb[i] * 255 + 0.5 | 0;
        for (i = i0; i < NB; i++) if (raw[base + i] > 0) { fb = i; break; }
      }
      firstB[k] = (jd > 0 && trail) ? 0 : fb;
      rayT[k] = t;
    }
    function sade(k, aikaS, t) {
      var th = k * 360 / NR;
      var h = marssi(th, aikaS, rev);
      hit[k] = h; hitI[k] = ensiIdx; endI[k] = ensiEnd;
      if (C.hairio.pois) { for (var i = 0; i < NB; i++) Eb[i] = 0; talleta(k, t); return; }
      lisaaHairio(th, aikaS, rev);
      lisaaAidit(k, th, rev);
      lisaaStc();
      talleta(k, t);
    }

    // ---------- alue ja puskurit ----------
    function alustaPuskurit() {
      var mpk = ALUEET[C.alueIdx] * (C.offset ? OFFSET_K : 1);     // offset-tilassa säteet marssitaan 1,7-kertaiselle matkalle, jotta kuvan yläreuna täyttyy
      rangeM = mpk * NM; step = rangeM / NB;
      for (var q = 0; q < NB; q++) { var sq = (q + 1) * step; alW[q] = -C.antenniM / sq - sq * K2; invS[q] = 1 / sq; attG[q] = 1 / (1 + sq * sq / (M.hyva.rangeR0 * M.hyva.rangeR0)); attB[q] = 1 / (1 + sq * sq / (M.huono.rangeR0 * M.huono.rangeR0)); }
      NR = mpk <= 0.75 ? 720 : C.viritys === 'huono' ? 360 : mpk <= 3.2 ? M.hyva.sateita3 : 360;   // 720 sädettä pienillä alueilla, hyvässä virityksessä tihennetty (sateita3) aina 3 mpk:iin asti, huonossa vaiheen 3c tapaan
      cell = soluKoko(mpk); TSm = TS * cell; invC = 1 / cell; invTSm = 1 / TSm;
      raw = new Uint8Array(NR * NB); rayT = new Float64Array(NR).fill(-1e9); hit = new Float32Array(NR); hitI = new Int16Array(NR).fill(-1); endI = new Int16Array(NR).fill(-1); firstB = new Uint16Array(NR).fill(NB); mf5 = new Uint16Array(NR).fill(NB);
      trail = JALJET[C.jalkiIdx] > 0 ? new Uint8Array(NR * NB) : null;
      acc = 0; nextK = 0;
      aidDirty = true; boatDirty = true; boatCache = null; lutDirty = true;
      viimeVarmistus.cell = 0;
    }

    // ---------- pyyhkäisy ----------
    function paivita(tila) {
      if (tila) {
        if (tila.e != null && tila.n != null) { S.e = Number(tila.e); S.n = Number(tila.n); }
        else if (tila.lat != null && tila.lon != null) { var en = K.lonlatToEN(Number(tila.lon), Number(tila.lat)); S.e = en.e; S.n = en.n; }
        var h = tila.suunta != null ? tila.suunta : (tila.hdg != null ? tila.hdg : tila.tosisuunta);
        if (h != null) S.hdg = norm360(Number(h));
        if (tila.nopeus != null) S.kn = Number(tila.nopeus); else if (tila.nopeusMs != null) S.kn = Number(tila.nopeusMs) * 3600 / NM;
        if (tila.aika != null) S.t = Number(tila.aika);
        S.onTila = true;
        if (Math.hypot(S.e - S.convE, S.n - S.convN) > 300) {
          var ll = K.enToLonLat(S.e, S.n); S.conv = K.convergenceDeg(ll.lon, ll.lat); S.convE = S.e; S.convN = S.n;
        }
        aidDirty = true; boatDirty = true;
      }
      if (!S.onTila) return;
      varmista(false);
      if (lastT == null) lastT = S.t;
      var dt = (S.t - lastT) / 1000;
      if (dt < 0) { lastT = S.t; dt = 0; }
      if (dt > 0) {
        lastT = S.t;
        acc += dt * M.kierrosMin / 60 * NR;
        var n = Math.min(NR, Math.floor(acc));
        if (n > 0) {
          acc -= Math.floor(acc);
          var t0 = S.t - dt * 1000;
          for (var q = 0; q < n; q++) {
            sade(nextK, S.t / 1000, t0 + (q + 1) / n * dt * 1000);
            nextK++; if (nextK >= NR) { nextK = 0; rev++; }
          }
          tilasto.sateita += n;
        }
      }
      var nyt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (nyt - lastDraw >= (opt.kuvavali || 50)) piirra();
    }
    // Laskee koko kierroksen heti nykyisellä sijainnilla. Palauttaa laskentaan kuluneen ajan (ms).
    function taytaKierros() {
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var t = S.t;
      for (var k = 0; k < NR; k++) sade(k, t / 1000, t);
      acc = 0; nextK = 0; rev++;
      var ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      tilasto.kierrosMs = ms;
      return ms;
    }

    // ---------- näyttö ----------
    var ctx = canvas.getContext('2d'), ec = null, ectx = null, eimg = null, e32 = null, EP = 0;
    var geom = { w: 0, h: 0, dpr: 1, cx: 0, cy: 0, r: 0, ui: null };
    var lutDirty = true, lutAng = null, lutB0 = null, lutBn = null, lastDraw = -1e9, fA = null, fT = null;
    var ui = null, vbuf = null;    // vbuf: testikäytössä kaikuruudun voimakkuus (0 ... 255) pikseleittäin ennen väripalettia

    function asettelu() {
      var cw = canvas.clientWidth || canvas.width || 300, ch = canvas.clientHeight || canvas.height || 300;
      var dpr = Math.min(2, root.devicePixelRatio || 1);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
      // PPI täyttää ruutunsa: halkaisija on pienempi sivu miinus 4 px. Napit ja numerolukemat ovat kuvan päällä reunoilla ja kulmissa.
      var r = Math.max(40, Math.min(cw, ch) / 2 - 2), k = C.offset ? OFFSET_K : 1;
      geom = { w: cw, h: ch, dpr: dpr, cx: cw / 2, cy: ch / 2, r: r, sx: cw / 2, sy: ch / 2, k: k, by: ch - 8, uiSig: '' };
      var ep = Math.max(160, Math.min(Math.round((opt.kaikuPx || 440) * (C.offset ? 1.5 : 1)), Math.round(2 * r * k * Math.min(dpr, 1.4))));
      if (ep !== EP) {
        EP = ep;
        ec = document.createElement('canvas'); ec.width = EP; ec.height = EP; ectx = ec.getContext('2d');
        eimg = ectx.createImageData(EP, EP); e32 = new Uint32Array(eimg.data.buffer);
        lutDirty = true;
      }
      if (ui) asetteleUi();
    }
    function rakennaLut() {
      var n = EP * EP, half = EP / 2, f = NB / half, hw = C.viritys === 'huono' ? 0.5 : 0.71;   // pikselin säteittäinen peitto (hyvässä: pikselin koko lävistäjä, jottei rantaviivan pikseli jää tyhjäksi)
      lutAng = new Float32Array(n); lutB0 = new Uint16Array(n); lutBn = new Uint8Array(n);
      for (var py = 0; py < EP; py++) for (var px = 0; px < EP; px++) {
        var x = px + 0.5 - half, y = py + 0.5 - half, rr = Math.sqrt(x * x + y * y), p = py * EP + px;
        if (rr >= half) { lutBn[p] = 0; continue; }
        var a = Math.atan2(x, -y); if (a < 0) a += 2 * Math.PI;
        lutAng[p] = a / (2 * Math.PI) * NR;
        var b0, bn;
        if (f <= 1) { b0 = Math.min(NB - 1, Math.floor(rr * f)); bn = 1; }
        else { b0 = Math.max(0, Math.floor((rr - hw) * f)); var b1 = Math.min(NB - 1, Math.floor((rr + hw) * f)); bn = Math.max(1, Math.min(6, b1 - b0 + 1)); }
        lutB0[p] = b0; lutBn[p] = bn;
      }
      fA = new Float32Array(NR); fT = new Float32Array(NR);
      lutDirty = false;
    }
    // Rantaviivan pitkittäissively (vain hyvä viritys). Vaakakeila on 2° leveä, joten viistosti säteeseen nähden kulkeva ranta kaikuu keilassa koko matkaltaan:
    // säteen ensimmäisen osuman kaiku levitetään niiden askelten yli, jotka ovat viereisten säteiden ensimmäisten osumien välissä, kunhan maa-alue on yhtenäinen (enintään M.hyva.svelyMaxM).
    // Näin rantaviiva ei katkea säteiden väliin (maksimi, joten ei kaksinkertaista kaikua), eikä saaren ja kaukaisen rannan välille synny viirua.
    function rantaSively() {
      var P = M.hyva, e0, i0, kl, kr, n, lo, hi, lim, j, base, v, cap = Math.max(1, Math.round(P.svelyMaxM / step));
      for (var k = 0; k < NR; k++) {
        i0 = hitI[k]; if (i0 < 0) continue;
        base = k * NB; e0 = raw[base + i0]; if (e0 < 40) continue;
        kl = k === 0 ? NR - 1 : k - 1; kr = k === NR - 1 ? 0 : k + 1;
        lo = i0; hi = i0;
        // naapurin ranta kauempana: sively omaa maa-aluetta pitkin naapurin osumaan asti. Naapurin ranta lähempänä: sively naapurin maa-aluetta vastaan, jos se ulottuu tämän säteen osumaan
        n = hitI[kl]; if (n >= 0) { if (n > i0) { if (n > hi) hi = n; } else if (n < i0 && endI[kl] >= i0 - 1 && n < lo) lo = n; }
        n = hitI[kr]; if (n >= 0) { if (n > i0) { if (n > hi) hi = n; } else if (n < i0 && endI[kr] >= i0 - 1 && n < lo) lo = n; }
        if (hi > endI[k]) hi = endI[k];
        if (lo === hi) continue;
        if (hi > i0 + cap) hi = i0 + cap; if (lo < i0 - cap) lo = i0 - cap;
        for (j = i0 + 1; j <= hi; j++) { v = e0 * (1 - P.svelyHiipuu * (j - i0) / (hi - i0 + 1)) + 0.5 | 0; if (v > raw[base + j]) raw[base + j] = v; }
        for (j = i0 - 1; j >= lo; j--) { v = e0 * (1 - P.svelyHiipuu * (i0 - j) / (i0 - lo + 1)) + 0.5 | 0; if (v > raw[base + j]) raw[base + j] = v; }
        if (lo < firstB[k]) firstB[k] = lo;
      }
    }
    function kuvaKaiut(nytMs) {
      if (lutDirty) rakennaLut();
      if (C.viritys !== 'huono') rantaSively();
      var jd = JALJET[C.jalkiIdx], k, jh = (C.viritys === 'huono' ? M.huono : M.hyva).jalkihehku;
      for (k = 0; k < NR; k++) {
        var age = (nytMs - rayT[k]) / 1000;
        fA[k] = age > 1e5 ? 0 : (jh[0] + jh[1] * Math.exp(-age / 1.3));
        fT[k] = (jd > 0 && trail && age < 1e5) ? Math.max(0, 1 - age / jd) : 0;
      }
      var off = (C.suuntaYlos ? S.hdg + C.hairio.suuntavirhe : 0) / 360 * NR, n = EP * EP, p, NRm = NR;
      var useTrail = jd > 0 && trail;
      for (k = 0; k < NR; k++) {
        var m5 = firstB[k], kq;
        kq = k === 0 ? NR - 1 : k - 1; if (firstB[kq] < m5) m5 = firstB[kq];
        kq = kq === 0 ? NR - 1 : kq - 1; if (firstB[kq] < m5) m5 = firstB[kq];
        kq = k === NR - 1 ? 0 : k + 1; if (firstB[kq] < m5) m5 = firstB[kq];
        kq = kq === NR - 1 ? 0 : kq + 1; if (firstB[kq] < m5) m5 = firstB[kq];
        mf5[k] = m5;
      }
      // vaakakeilan leveys: naapurisäteiden kaiku painotettuna Gaussin keilalla (3 dB:n leveys M.keilaAste)
      var sig = M.keilaAste / 2.355, dlt = 360 / NR, w1 = Math.exp(-0.5 * Math.pow(dlt / sig, 2)), w2 = Math.exp(-0.5 * Math.pow(2 * dlt / sig, 2));
      var SOFT_W = M.hyva.pehmeys, wide = NR > 400, hyva = C.viritys !== 'huono';
      if (hyva) {
        // Hyvä viritys: pikselin kaiku on viiden lähimmän säteen painotettu maksimi, ja paino on Gaussin keilan arvo pikselin todellisella kulmaetäisyydellä säteestä
        // (ei lähimmän säteen kokopainoa), jolloin rintamien reunat pehmenevät eikä yksittäisiä rakeita synny.
        var QN = 16, wt = new Float32Array(QN * 5), qq, oo;
        for (qq = 0; qq < QN; qq++) for (oo = -2; oo <= 2; oo++) { var dd = (oo - ((qq + 0.5) / QN - 0.5)) * dlt; wt[qq * 5 + oo + 2] = Math.exp(-0.5 * dd * dd / (sig * sig)); }
        for (p = 0; p < n; p++) {
          var cnt2 = lutBn[p];
          if (!cnt2) { e32[p] = 0; if (vbuf) vbuf[p] = 0; continue; }
          var u2 = lutAng[p] + off + 0.5, k0 = u2 | 0, fq = ((u2 - k0) * QN) | 0; if (k0 >= NRm) k0 -= NRm; if (k0 >= NRm) k0 -= NRm;
          var b00 = lutB0[p];
          if (b00 + cnt2 <= mf5[k0]) { e32[p] = BG32; if (vbuf) vbuf[p] = 0; continue; }
          var ka = k0 - 2; if (ka < 0) ka += NRm; var kb = ka + 1; if (kb >= NRm) kb -= NRm; var kc = k0, kd = kc + 1; if (kd >= NRm) kd -= NRm; var ke = kd + 1; if (ke >= NRm) ke -= NRm;
          // k0 = ray nearest (u2 - 0.5 rounding is handled by the weights: offset o relative to nearest)
          var wq = fq * 5, ca = fA[ka] * wt[wq], cb2 = fA[kb] * wt[wq + 1], cc = fA[kc] * wt[wq + 2], cd = fA[kd] * wt[wq + 3], ce = fA[ke] * wt[wq + 4];
          var ba = ka * NB, bb = kb * NB, bc = kc * NB, bd = kd * NB, be = ke * NB, vt2 = 0, b2, bj, y;
          var ma = 0, mb = 0, mc = 0, md = 0, me = 0;   // säteittäinen maksimi kullakin säteellä
          for (b2 = 0; b2 < cnt2; b2++) {
            bj = b00 + b2;
            y = raw[ba + bj]; if (y > ma) ma = y;
            y = raw[bb + bj]; if (y > mb) mb = y;
            y = raw[bc + bj]; if (y > mc) mc = y;
            y = raw[bd + bj]; if (y > md) md = y;
            y = raw[be + bj]; if (y > me) me = y;
            if (useTrail) { var y1 = trail[bc + bj] * fT[kc]; if (y1 > vt2) vt2 = y1; }
          }
          ma *= ca; mb *= cb2; mc *= cc; md *= cd; me *= ce;
          var vv = ma > mb ? ma : mb; if (mc > vv) vv = mc; if (md > vv) vv = md; if (me > vv) vv = me;
          vv = vv * (1 - SOFT_W) + SOFT_W * (ma + mb + mc + md + me) / (wt[wq] + wt[wq + 1] + wt[wq + 2] + wt[wq + 3] + wt[wq + 4]);   // pehmennys: keilapainotettu maksimi ja keilapainotettu keskiarvo
          if (vv > 255) vv = 255;
          if (vbuf) vbuf[p] = vv;
          e32[p] = (vt2 * 0.5 > vv) ? PAL_T[vt2 | 0] : PAL_E[vv | 0];
        }
        ectx.putImageData(eimg, 0, 0);
        return;
      }
      for (p = 0; p < n; p++) {
        var cnt = lutBn[p];
        if (!cnt) { e32[p] = 0; if (vbuf) vbuf[p] = 0; continue; }
        var u = lutAng[p] + off + 0.5, kk = u | 0; if (kk >= NRm) kk -= NRm; if (kk >= NRm) kk -= NRm;
        var kl = kk === 0 ? NRm - 1 : kk - 1, kr = kk === NRm - 1 ? 0 : kk + 1, b0 = lutB0[p];
        if (b0 + cnt <= mf5[kk]) { e32[p] = BG32; if (vbuf) vbuf[p] = 0; continue; }
        var kl2 = kl === 0 ? NRm - 1 : kl - 1, kr2 = kr === NRm - 1 ? 0 : kr + 1;
        var v = 0, vt = 0, b, bi, x0, x1, x2;
        for (b = 0; b < cnt; b++) {
          bi = b0 + b;
          x0 = raw[kk * NB + bi] * fA[kk];
          x1 = raw[kl * NB + bi] * fA[kl] * w1; x2 = raw[kr * NB + bi] * fA[kr] * w1;
          if (x1 > x0) x0 = x1; if (x2 > x0) x0 = x2;
          if (wide) {
            x1 = raw[kl2 * NB + bi] * fA[kl2] * w2; x2 = raw[kr2 * NB + bi] * fA[kr2] * w2;
            if (x1 > x0) x0 = x1; if (x2 > x0) x0 = x2;
          }
          if (x0 > v) v = x0;
          if (useTrail) { var y0 = trail[kk * NB + bi] * fT[kk]; if (y0 > vt) vt = y0; }
        }
        if (v > 255) v = 255;
        if (vbuf) vbuf[p] = v;
        e32[p] = (vt * 0.5 > v) ? PAL_T[vt | 0] : PAL_E[v | 0];
      }
      ectx.putImageData(eimg, 0, 0);
    }
    function pistePolku(rad, a) { return [geom.cx + Math.sin(a) * rad, geom.cy - Math.cos(a) * rad]; }
    function tekstiHalolla(t, x, y, align) {
      ctx.textAlign = align || 'left';
      if (geom.luk) { var tw = ctx.measureText(t).width, fm = /([0-9.]+)px/.exec(ctx.font), fz = fm ? parseFloat(fm[1]) : 11, x0 = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x; geom.luk.push({ t: t, x0: x0, y0: y - fz, x1: x0 + tw, y1: y + 2 }); }   // lukemien suorakulmiot (testikäyttö: lukemat eivät saa peittää nappeja)
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,12,6,0.85)'; ctx.strokeText(t, x, y);
      ctx.fillStyle = '#cfe9cf'; ctx.fillText(t, x, y);
    }
    function piirra() {
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      lastDraw = t0;
      if (!raw) return;
      if (canvas.clientWidth !== geom.w || canvas.clientHeight !== geom.h) asettelu();
      var nytMs = S.t, d = geom.dpr, r = geom.r, cx = geom.cx, cy = geom.cy;
      var mpk = ALUEET[C.alueIdx], hdgOff = C.suuntaYlos ? S.hdg + C.hairio.suuntavirhe : 0;
      var ha = (S.hdg - hdgOff) * RAD, k = C.offset ? OFFSET_K : 1, sx = cx, sy = cy;
      geom.haDeg = norm360(S.hdg - hdgOff); geom.eaDeg = norm360(C.ebl - hdgOff);   // keulaviivan ja EBL:n suunta kuvassa (testikäyttö)
      // offset: oma alus siirtyy keulasuunnan vastaiseen suuntaan 70 % säteestä (suunta ylös -tilassa suoraan alas, pohjoinen ylös -tilassa keulan vastaiseen suuntaan)
      if (C.offset) { sx = cx - Math.sin(ha) * OFFSET_OSUUS * r; sy = cy + Math.cos(ha) * OFFSET_OSUUS * r; }
      geom.sx = sx; geom.sy = sy; geom.k = k;
      if (ui) asetteleUi();
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#020a06'; ctx.fillRect(0, 0, geom.w, geom.h);
      kuvaKaiut(nytMs);
      ctx.imageSmoothingEnabled = true;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip();
      ctx.drawImage(ec, sx - r * k, sy - r * k, 2 * r * k, 2 * r * k);
      // etäisyysrenkaat oman aluksen ympärillä
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,205,130,0.42)';
      for (var i = 1; i <= Math.floor(4 * k + 1e-6); i++) { ctx.beginPath(); ctx.arc(sx, sy, r * i / 4, 0, 2 * Math.PI); ctx.stroke(); }
      // keulaviiva
      var hp = [sx + Math.sin(ha) * r * 3, sy - Math.cos(ha) * r * 3];
      ctx.strokeStyle = '#f2f2b0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
      // oma alus
      ctx.fillStyle = '#f2f2b0'; ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 2 * Math.PI); ctx.fill();
      // EBL ja VRM omasta aluksesta
      var naytaEV = opt.eblVrm !== false && C.ev;
      if (naytaEV) {
        var ea = (C.ebl - hdgOff) * RAD;
        ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(ea) * r * 3, sy - Math.cos(ea) * r * 3); ctx.stroke();
        if (C.vrm <= mpk * k) {
          ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.arc(sx, sy, r * C.vrm / mpk, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
          // risti EBL-viivan ja VRM-renkaan leikkauspisteeseen
          var xr = sx + Math.sin(ea) * r * C.vrm / mpk, yr = sy - Math.cos(ea) * r * C.vrm / mpk;
          ctx.strokeStyle = '#d98bff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(xr - 5, yr - 5); ctx.lineTo(xr + 5, yr + 5); ctx.moveTo(xr - 5, yr + 5); ctx.lineTo(xr + 5, yr - 5); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,205,130,0.75)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
      // pohjoisen merkki
      var na = (0 - hdgOff) * RAD, np = pistePolku(r + 9, na);
      var fs = geom.w < 500 ? 11 : 12;
      ctx.font = '600 ' + Math.max(8, fs - 2) + 'px ui-monospace,Menlo,Consolas,monospace'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cfe9cf'; ctx.textAlign = 'center'; ctx.fillText('N', Math.max(6, Math.min(geom.w - 6, np[0])), Math.max(6, Math.min(geom.h - 6, np[1])));
      // numerolukemat kulmissa, englanninkieliset laitetermit ja desimaalipiste: vasen yläkulma RANGE ja RR, oikea yläkulma HDG ja SOG tiloineen, alakulmat EBL ja VRM.
      // Napit ovat kulmissa lukemien vieressä (≡ oikeassa yläkulmassa, RANGE + ja − vasemmassa ja EBL/VRM ja OFFSET oikeassa alakulmassa), joten lukemat jäävät niiden sisäpuolelle.
      ctx.font = '600 ' + fs + 'px ui-monospace,Menlo,Consolas,monospace'; ctx.textBaseline = 'alphabetic';
      geom.luk = [];
      // pikkukuva (puhelimen pieni vaihtoikkuna, 28.10.2026): vain alue, koska kulmalukemat menivät päällekkäin. Pikkukuvaa ei säädetä, napautus vaihtaa näkymän.
      if (geom.w < 260 || geom.h < 180) { tekstiHalolla(nmTxt(mpk).replace(',', '.') + ' NM', 4, geom.h - 5, 'left'); piirtoTilasto(t0); return; }
      var sh = siirrot(), lh = fs + 3, lx = 6, rx = geom.w - UI_BW - 6, ty = fs + 5, ryy = sh.tr + fs + 3, by = geom.by, ebx = sh.eblX;
      var pt = function (x) { return nmTxt(x).replace(',', '.'); };
      tekstiHalolla('RANGE ' + pt(mpk) + ' NM', lx, ty, 'left');
      tekstiHalolla('RR ' + pt(mpk / 4) + ' NM', lx, ty + lh, 'left');
      if (C.offset) tekstiHalolla('OFFSET', lx, ty + 2 * lh, 'left');
      tekstiHalolla('HDG ' + pad3(S.hdg) + '\u00b0 ' + (C.suuntaYlos ? 'H UP' : 'N UP'), rx, ryy, 'right');
      tekstiHalolla('SOG ' + fnum(S.kn, 1).replace(',', '.') + ' kn', rx, ryy + lh, 'right');
      var ry2 = ryy + 2 * lh;
      if (JALJET[C.jalkiIdx] > 0) { tekstiHalolla('TRAIL ' + (JALJET[C.jalkiIdx] >= 60 ? JALJET[C.jalkiIdx] / 60 + ' min' : JALJET[C.jalkiIdx] + ' s'), rx, ry2, 'right'); ry2 += lh; }
      if (C.sadeSuodatin > 0) { tekstiHalolla('RAIN', rx, ry2, 'right'); ry2 += lh; }
      if (C.viritys === 'huono') { tekstiHalolla('DETUNED', rx, ry2, 'right'); ry2 += lh; }
      if (C.hairio.pois) { tekstiHalolla('STBY', rx, ry2, 'right'); ry2 += lh; }
      if (naytaEV) {
        tekstiHalolla('EBL ' + pad3(C.ebl) + '\u00b0 T', ebx, by, 'left');
        tekstiHalolla('VRM ' + pt(C.vrm) + ' NM', rx, by, 'right');
      }
      if (S.onTila && (jono.length || rakennetaan || aidsPending)) tekstiHalolla('LOADING…', geom.cx, geom.cy + r * 0.45, 'center');
      piirtoTilasto(t0);
    }
    function piirtoTilasto(t0) {
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      tilasto.piirtoMs = t1 - t0; tilasto.piirrot++;
      if (t1 - t0 > tilasto.piirtoMax) tilasto.piirtoMax = t1 - t0;
    }

    // ---------- käyttöliittymä ----------
    // Napit (vaihe 3h, toinen kierros) ovat puoliläpinäkyviä PPI:n päällä: kosketuskohde 52 x 44 px, piirretty 48 x 32 px, teksti 11 px englanniksi kuten laitteissa.
    // Aina näkyvissä on neljä usein tarvittavaa nappia (RANGE + ja RANGE − päällekkäin vasemmassa alakulmassa, EBL/VRM ja OFFSET päällekkäin oikeassa alakulmassa)
    // ja ≡-nappi oikeassa yläkulmassa. Harvoin tarvittavat (H UP / N UP, TRAIL, RAIN, TUNE ja STBY) ovat ≡-napin pystyvalikossa, joka sulkeutuu valinnan jälkeen.
    // Nykyinen tila näkyy kulmalukemissa. Pieni 3D-ikkuna voi peittää kulman, jolloin sen kulman napit ja lukemat siirtyvät ikkunan viereen (siirrot).
    var STYLE_ID = 'tutka-tyylit';
    function lisaaTyylit() {
      if (document.getElementById(STYLE_ID)) return;
      var st = document.createElement('style'); st.id = STYLE_ID;
      st.textContent = '.tutka-ui{position:absolute;pointer-events:none;z-index:5;font:650 11px/1.05 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#e7eef3}' +
        '.tutka-ui button{pointer-events:auto;position:absolute;display:flex;align-items:center;justify-content:center;width:52px;height:44px;min-width:44px;min-height:44px;margin:0;padding:6px 2px;box-sizing:border-box;border-radius:12px;border:0;' +
        'background:rgba(14,28,40,0.58);background-clip:content-box;color:#e7eef3;font:inherit;text-align:center;white-space:normal;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
        '.tutka-ui button:active{background-color:rgba(15,127,179,0.85)}' +
        '.tutka-ui button[aria-pressed=true]{background-color:rgba(15,127,179,0.72);color:#fff}' +
        '.tutka-ui button[hidden]{display:none}.tutka-ui button:disabled{opacity:.45}' +
        '.tutka-ui button:focus-visible{outline:2px solid #7cc4e8;outline-offset:-3px}';
      document.head.appendChild(st);
    }
    var napit = {}, jarjestys = [], ulkoiset = [], menyAuki = false, MENU_IDS = ['suunta', 'jalki', 'sade', 'viritys'];
    function suljeMeny() { if (!menyAuki) return; menyAuki = false; paivitaUi(); asetteleUi(); }
    function luoUi() {
      lisaaTyylit();
      var par = canvas.parentNode;
      if (par && root.getComputedStyle(par).position === 'static') par.style.position = 'relative';
      ui = document.createElement('div'); ui.className = 'tutka-ui';
      par.appendChild(ui);
      function nappi(id, teksti, nimi, fn, valikko) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = teksti; b.setAttribute('aria-label', nimi); b.setAttribute('data-tutka', id);
        b.addEventListener('click', function (ev) { ev.preventDefault(); fn(); if (valikko) suljeMeny(); });
        ui.appendChild(b); napit[id] = b; jarjestys.push(id); return b;
      }
      nappi('alue+', 'RANGE +', 'Suurenna alue', function () { asetaAlue(ALUEET[Math.min(ALUEET.length - 1, C.alueIdx + 1)]); });
      nappi('alue-', 'RANGE −', 'Pienennä alue', function () { asetaAlue(ALUEET[Math.max(0, C.alueIdx - 1)]); });
      ['alue+', 'alue-'].forEach(function (id) { var m = id === 'alue+' ? '+' : '\u2212'; napit[id].style.flexDirection = 'column'; napit[id].innerHTML = '<span style="font-size:9px;letter-spacing:.3px">RANGE</span><b style="font-size:17px;line-height:13px;font-weight:700">' + m + '</b>'; });   // RANGE pienellä ja merkki isolla, jotta nappi näkyy yhdellä silmäyksellä
      nappi('sea', 'SEA', 'Merivälkkeen vaimennus (SEA): pois, 1, 2, 3, AUTO (näppäin S)', function () { var n = C.sea === -1 ? 0 : C.sea === 3 ? -1 : C.sea + 1; asetaSea(n); kirjaa && kirjaa('sea', n); });
      nappi('ev', 'EBL VRM', 'EBL ja VRM päälle tai pois', function () { asetaEV(!C.ev); kirjaa && kirjaa('ev', C.ev ? 1 : 0); });
      nappi('offset', 'OFFSET', 'Offset: oma alus alas, eteenpäin näkyy 1,7-kertainen matka (näppäin O)', function () { asetaOffset(!C.offset); kirjaa && kirjaa('offset', C.offset ? 1 : 0); });
      nappi('meny', '≡', 'Näytä tai piilota tutkan valikko', function () { menyAuki = !menyAuki; paivitaUi(); asetteleUi(); });
      nappi('suunta', 'H UP', 'Vaihda suunta ylös (H UP) ja pohjoinen ylös (N UP)', function () { asetaSuuntaYlos(!C.suuntaYlos); kirjaa && kirjaa('suunta', C.suuntaYlos ? 1 : 0); }, true);
      nappi('jalki', 'TRAIL', 'Jäljen kesto', function () { asetaJalki(JALJET[(C.jalkiIdx + 1) % JALJET.length]); }, true);
      nappi('sade', 'RAIN', 'Sadesuodatin', function () { asetaSadeSuodatin(C.sadeSuodatin > 0 ? 0 : 0.6); }, true);
      nappi('viritys', 'TUNED', 'Viritys hyvä tai huono', function () { var v = C.viritys === 'huono' ? 'hyva' : 'huono'; if (opt.onViritys) opt.onViritys(v); else asetaViritys(v); }, true);
      // ulkoiset napit (esim. tutkan sammutus, STBY) siirretään samaan valikkoon ja palautetaan tuhottaessa
      (opt.ulkoisetNapit || []).forEach(function (el) {
        if (!el) return;
        ulkoiset.push({ el: el, par: el.parentNode, next: el.nextSibling });
        ui.appendChild(el); jarjestys.push(el);
        el.addEventListener('click', suljeMeny);
      });
      paivitaUi();
      asetteleUi();
    }
    function paivitaUi() {
      if (!ui) return;
      napit['suunta'].textContent = C.suuntaYlos ? 'H UP' : 'N UP';
      napit['suunta'].setAttribute('aria-pressed', C.suuntaYlos ? 'true' : 'false');
      napit['jalki'].textContent = JALJET[C.jalkiIdx] > 0 ? 'TRAIL ' + (JALJET[C.jalkiIdx] >= 60 ? JALJET[C.jalkiIdx] / 60 + ' min' : JALJET[C.jalkiIdx] + ' s') : 'TRAIL';
      napit['jalki'].setAttribute('aria-pressed', JALJET[C.jalkiIdx] > 0 ? 'true' : 'false');
      napit['sade'].setAttribute('aria-pressed', C.sadeSuodatin > 0 ? 'true' : 'false');
      napit['sea'].innerHTML = '<span style="font-size:9px;letter-spacing:.3px">SEA</span><b style="font-size:13px;line-height:13px;font-weight:700">' + (C.sea === -1 ? 'AUTO' : C.sea === 0 ? 'OFF' : C.sea) + '</b>';
      napit['sea'].style.flexDirection = 'column'; napit['sea'].setAttribute('aria-pressed', C.sea !== 0 ? 'true' : 'false');
      napit['viritys'].textContent = C.viritys === 'huono' ? 'DETUNED' : 'TUNED';
      napit['viritys'].setAttribute('aria-pressed', C.viritys === 'huono' ? 'true' : 'false');
      napit['ev'].setAttribute('aria-pressed', C.ev ? 'true' : 'false');
      napit['offset'].setAttribute('aria-pressed', C.offset ? 'true' : 'false');
      napit['meny'].setAttribute('aria-pressed', menyAuki ? 'true' : 'false');
      napit['alue-'].disabled = C.alueIdx === 0; napit['alue+'].disabled = C.alueIdx === ALUEET.length - 1;
    }
    function nappiEl(x) { return typeof x === 'string' ? napit[x] : x; }
    // Pieni 3D-ikkuna (varaus) voi peittää kulman. Palauttaa kulmien siirrot: tr = oikean yläkulman (≡ ja lukemat) ylin y, bl = vasemman alakulman nappien alareuna, eblX = EBL-lukeman vasen reuna.
    var UI_BW = 52, UI_BH = 44, UI_MW = 104;
    function siirrot() {
      var o = { tr: 2, bl: geom.h - 2, eblX: UI_BW + 6 }, v = varaus, W = geom.w, H = geom.h;
      if (!v) return o;
      var hit = function (x0, y0, x1, y1) { return v.r > x0 && v.l < x1 && v.b > y0 && v.t < y1; };
      if (hit(W - UI_BW - 130, 0, W, 4 + UI_BH)) o.tr = Math.round(v.b) + 2;
      if (hit(0, H - 2 * UI_BH - 6, UI_BW + 4, H)) o.bl = Math.round(v.t) - 2;
      if (hit(0, H - 24, UI_BW + 130, H)) o.eblX = Math.round(v.r) + 6;
      return o;
    }
    function asetteleUi() {
      if (!ui) return;
      var cr = canvas.getBoundingClientRect(), pr = canvas.parentNode.getBoundingClientRect();
      ui.style.left = (cr.left - pr.left + canvas.parentNode.scrollLeft) + 'px'; ui.style.top = (cr.top - pr.top + canvas.parentNode.scrollTop) + 'px';
      ui.style.width = cr.width + 'px'; ui.style.height = cr.height + 'px';
      var W = geom.w, H = geom.h, BW = UI_BW, BH = UI_BH, sh = siirrot(), i;
      var valikko = [];
      for (i = 0; i < jarjestys.length; i++) {
        var el = nappiEl(jarjestys[i]);
        if (typeof el === 'object' && el.getAttribute('data-tutka') == null) { if (el.hidden || root.getComputedStyle(el).display === 'none') continue; valikko.push(el); }
        else if (MENU_IDS.indexOf(el.getAttribute('data-tutka')) >= 0) valikko.push(el);
      }
      var sig = [W, H, menyAuki, sh.tr, sh.bl, sh.eblX, valikko.map(function (e) { return e.getAttribute('data-tutka') || e.id; }).join(',')].join('|');
      if (geom.uiSig === sig) return;
      geom.uiSig = sig;
      function put(el, x, y, w) { el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.width = (w || BW) + 'px'; el.style.height = BH + 'px'; el.style.visibility = ''; }
      var x0 = 2, x1 = W - BW - 2;
      put(napit['alue+'], x0, sh.bl - 2 * BH); put(napit['alue-'], x0, sh.bl - BH); put(napit['sea'], x0, sh.bl - 3 * BH - 6);
      put(napit['ev'], x1, H - 2 - 2 * BH); put(napit['offset'], x1, H - 2 - BH);
      put(napit['meny'], x1, sh.tr);
      valikko.forEach(function (e, n) {
        if (menyAuki) put(e, W - UI_MW - 2, sh.tr + BH + n * BH, UI_MW); else e.style.visibility = 'hidden';
      });
      geom.by = H - 8;
    }

    // ---------- kosketus ja hiiri ----------
    // Napautus tai klikkaus asettaa EBL:n ja VRM:n napautettuun pisteeseen (omasta aluksesta mitattuna), veto siirtää niitä jatkuvasti ja vedon päättyessä
    // lukema kirjataan kerran. Kahden sormen nipistys säätää VRM:ää, rulla ja hakasulut hienosäätävät VRM:ää ja pilkku ja piste EBL:ää.
    var ptrs = new Map(), gest = null, logT = {}, varaus = null;
    // Ulkopuolinen peittävä ikkuna (pieni 3D-ikkuna): suorakulmio kuvan pikseleinä {l, t, r, b} tai null
    function asetaVaraus(v) { varaus = v || null; piirraPian(); }
    function maxVrm() { return ALUEET[C.alueIdx] * (C.offset ? OFFSET_K : 1); }
    function pisteTapahtumasta(ev) {
      var rc = canvas.getBoundingClientRect(), x = ev.clientX - rc.left - geom.sx, y = ev.clientY - rc.top - geom.sy;
      var phi = Math.atan2(x, -y) / RAD, off = C.suuntaYlos ? S.hdg + C.hairio.suuntavirhe : 0;
      return { b: norm360(phi + off), mpk: Math.hypot(x, y) / geom.r * ALUEET[C.alueIdx] };
    }
    function asetaPiste(ev) {
      var q = pisteTapahtumasta(ev);
      C.ebl = q.b; C.vrm = Math.max(0.005, Math.min(maxVrm(), q.mpk)); paivitaMuutos();
    }
    function kirjaaPiste() { if (kirjaa) kirjaa('evpiste', { ebl: Math.round(C.ebl) % 360, vrm: Math.round(C.vrm * 100) / 100 }); }
    function kirjaaMyohemmin(laji) {
      if (!kirjaa) return;
      clearTimeout(logT[laji]);
      logT[laji] = setTimeout(function () { kirjaa(laji, laji === 'ebl' ? Math.round(C.ebl) % 360 : Math.round(C.vrm * 100) / 100); }, 500);
    }
    function pDown(ev) {
      if (ev.button != null && ev.button > 0) return;
      if (menyAuki) { suljeMeny(); return; }   // napautus valikon ulkopuolelle sulkee valikon eikä aseta EBL:ää
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 1) {
        gest = { mode: 'piste', ebl0: C.ebl, vrm0: C.vrm };
        if (C.ev) asetaPiste(ev);
      } else if (ptrs.size === 2) {
        var ps = Array.from(ptrs.values());
        if (gest) { C.ebl = gest.ebl0; C.vrm = gest.vrm0; }
        gest = { mode: 'vrm', d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), vrm0: C.vrm, ebl0: C.ebl };
        paivitaMuutos();
      }
      ev.preventDefault();
    }
    function pMove(ev) {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (gest && gest.mode === 'piste' && ptrs.size === 1) { if (C.ev) asetaPiste(ev); }
      else if (gest && gest.mode === 'vrm' && ptrs.size >= 2) {
        var ps = Array.from(ptrs.values()), d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (gest.d0 > 8) asetaVRM(gest.vrm0 * d / gest.d0);
      }
      ev.preventDefault();
    }
    function pUp(ev) {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (ptrs.size === 0) {
        if (gest && gest.mode === 'piste' && ev.type === 'pointerup' && C.ev) { asetaPiste(ev); kirjaaPiste(); }
        else if (gest && gest.mode === 'vrm' && ev.type === 'pointerup') kirjaaMyohemmin('vrm');
        gest = null;
      } else if (ptrs.size === 1) gest = { mode: 'jaa' };   // sormen nosto nipistyksen jälkeen ei siirrä EBL:ää
    }
    function onWheel(ev) {
      ev.preventDefault();
      asetaVRM(C.vrm * (ev.deltaY < 0 ? 1.06 : 1 / 1.06)); kirjaaMyohemmin('vrm');
    }
    // Näppäimet: palauttaa true, jos tutka käsitteli näppäimen (sim.js reitittää myös globaalit näppäimet tänne, kun tutka on aktiivinen ruutu)
    function kasitteleNappain(k, shift) {
      if (k === 'ArrowLeft' || k === ',') { asetaEBL(C.ebl - (shift ? 10 : 1)); kirjaaMyohemmin('ebl'); }
      else if (k === 'ArrowRight' || k === '.') { asetaEBL(C.ebl + (shift ? 10 : 1)); kirjaaMyohemmin('ebl'); }
      else if (k === 'ArrowUp' || k === ']') { asetaVRM(C.vrm * 1.05); kirjaaMyohemmin('vrm'); }
      else if (k === 'ArrowDown' || k === '[') { asetaVRM(C.vrm / 1.05); kirjaaMyohemmin('vrm'); }
      else if (k === '+' || k === '=') asetaAlue(ALUEET[Math.min(ALUEET.length - 1, C.alueIdx + 1)]);
      else if (k === '-' || k === '_') asetaAlue(ALUEET[Math.max(0, C.alueIdx - 1)]);
      else if (k === 'o' || k === 'O') { asetaOffset(!C.offset); kirjaa && kirjaa('offset', C.offset ? 1 : 0); }
      else if (k === 's' || k === 'S') { napit['sea'] && napit['sea'].click(); }
      else return false;
      return true;
    }
    function onKey(ev) { if (kasitteleNappain(ev.key, ev.shiftKey)) ev.preventDefault(); }

    // ---------- asetukset ----------
    function paivitaMuutos() { if (onMuutos) { try { onMuutos(lue()); } catch (e) {} } piirraPian(); }
    function piirraPian() { if (raw && !piirtoOdottaa) { piirtoOdottaa = true; var f = root.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); }; f(function () { piirtoOdottaa = false; piirra(); }); } }
    var piirtoOdottaa = false;
    function asetaAlue(mpk) {
      var idx = nearestRange(Number(mpk));
      if (idx === C.alueIdx && raw) return ALUEET[idx];
      var vanha = ALUEET[C.alueIdx];
      C.alueIdx = idx;
      // VRM säilyttää suhteellisen kohdan, jos se jäisi alueen ulkopuolelle
      if (C.vrm > ALUEET[idx] * (C.offset ? OFFSET_K : 1)) C.vrm = ALUEET[idx] * (C.offset ? OFFSET_K : 1) * 0.5;
      alustaPuskurit();
      varmista(true);
      paivitaUi(); paivitaMuutos();
      return ALUEET[idx];
    }
    function asetaSuuntaYlos(b) { C.suuntaYlos = !!b; paivitaUi(); paivitaMuutos(); }
    function asetaEBL(aste) { C.ebl = norm360(Number(aste)); paivitaMuutos(); }
    function asetaVRM(mpk) { C.vrm = Math.max(0.005, Math.min(maxVrm(), Number(mpk))); paivitaMuutos(); }
    function asetaEV(b) { C.ev = !!b; paivitaUi(); paivitaMuutos(); }
    // Offset: oma alus siirtyy kuvassa alaspäin (70 % säteestä), säteet marssitaan 1,7-kertaiselle matkalle ja kuva piirretään vastaavasti suurennettuna
    function asetaOffset(b) {
      b = !!b; if (b === C.offset) return b;
      C.offset = b;
      alustaPuskurit(); asettelu(); varmista(true);
      if (C.vrm > maxVrm()) C.vrm = maxVrm() * 0.5;
      paivitaUi(); paivitaMuutos();
      return b;
    }
    function asetaSade(v) { C.sade = Math.max(0, Math.min(1, Number(v) || 0)); paivitaMuutos(); }
    function asetaSadeSuodatin(v) { C.sadeSuodatin = Math.max(0, Math.min(1, Number(v) || 0)); paivitaUi(); paivitaMuutos(); }
    function asetaJalki(s) {
      var i = JALJET.indexOf(Number(s)); if (i < 0) i = 0;
      C.jalkiIdx = i;
      trail = i > 0 ? new Uint8Array(NR * NB) : null;
      paivitaUi(); paivitaMuutos();
    }
    // Tutkan viritys: 'hyva' (oletus, yhtenäinen rantaviiva ja täyttynyt maa-alue) tai 'huono' (vaiheen 3c kuva ja vastaanottimen kohina 0,3)
    function asetaViritys(v) {
      var uusi = v === 'huono' ? 'huono' : 'hyva';
      if (uusi === C.viritys) return uusi;
      C.viritys = uusi; paivitaUi();
      alustaPuskurit();       // säteiden määrä riippuu virityksestä, joten kuva piirtyy uudelleen seuraavalla pyyhkäisyllä
      varmista(true);
      paivitaMuutos();
      return uusi;
    }
    function asetaMeri(o) { if (!o) return; if (o.hs != null) C.meri.hs = Math.max(0, Number(o.hs) || 0); if (o.tuuliMista != null) C.meri.tuuliMista = Number(o.tuuliMista) || 0; if (o.tuuliMs != null) C.meri.tuuliMs = Number(o.tuuliMs) || 0; }
    function asetaSea(v) { v = Number(v); C.sea = v === -1 ? -1 : Math.max(0, Math.min(3, v | 0)); paivitaUi(); paivitaMuutos(); }
    function asetaVahvistus(v) { C.vahvistus = Math.max(0.2, Math.min(1.5, Number(v) || 1)); }
    // Häiriöt vaihetta 5 varten: { kohina: 0..1, heikko: 0..1 (lähettimen teho), suuntavirhe: aste, pois: boolean, sade: 0..1 }
    function asetaHairio(h) {
      h = h || {};
      if (h.kohina != null) C.hairio.kohina = Math.max(0, Math.min(1, Number(h.kohina)));
      if (h.heikko != null) C.hairio.heikko = Math.max(0, Math.min(1, Number(h.heikko)));
      if (h.suuntavirhe != null) C.hairio.suuntavirhe = Number(h.suuntavirhe);
      if (h.pois != null) C.hairio.pois = !!h.pois;
      if (h.sade != null) C.sade = Math.max(0, Math.min(1, Number(h.sade)));
      paivitaMuutos();
    }
    function lue() {
      var h = JSON.parse(JSON.stringify(C.hairio)); h.kohina = kohinaTeho();   // viritystilan kohina mukana
      return { alue: ALUEET[C.alueIdx], rengasvali: ALUEET[C.alueIdx] / 4, suuntaYlos: C.suuntaYlos, ebl: C.ebl, vrm: C.vrm, sade: C.sade, sadeSuodatin: C.sadeSuodatin,
        jalkiS: JALJET[C.jalkiIdx], sea: C.sea, offset: C.offset, ev: C.ev, hairio: h, viritys: C.viritys, suunta: S.hdg, nopeus: S.kn, e: S.e, n: S.n, sateita: NR, askel: step, solu: cell };
    }
    function valmis() {
      return new Promise(function (res) {
        function tarkista() {
          varmista(false);
          if (rakennetaan === 0 && jono.length === 0 && aidsPending === 0 && puuttuvat().length === 0) res(); else odottajat.push(tarkista);
        }
        tarkista();
      });
    }

    // ---------- oma silmukka (valinnainen) ----------
    var kaynnissa = false, tilaFn = null, raf = null;
    function silmukka() {
      if (!kaynnissa) return;
      var t = tilaFn ? tilaFn() : null;
      if (t) { if (t.aika == null) t.aika = performance.now(); paivita(t); }
      else { var nyt = performance.now(); paivita({ aika: nyt }); }
      raf = (root.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(silmukka);
    }
    function kaynnista(fn) { tilaFn = fn || null; if (!kaynnissa) { kaynnissa = true; silmukka(); } }
    function pysayta() { kaynnissa = false; if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); }

    // ---------- analyysi- ja testirajapinta ----------
    // Marssii säteen annetussa tosisuunnassa ja palauttaa profiilin taulukkoina (ei kirjoita puskureihin).
    function profiili(suuntaDeg) {
      var h = marssi(norm360(suuntaDeg), S.t / 1000, rev);
      var out = { s: [], H: [], F: [], alfa: [], amax: [], E: [], ensiOsuma: h, ensiIdx: ensiIdx };
      for (var i = 0; i < NB; i++) { out.s.push((i + 1) * step); out.H.push(Hb[i]); out.F.push(Fb[i]); out.alfa.push(Ab[i]); out.amax.push(Mb[i]); out.E.push(Eb[i]); }
      return out;
    }
    function ensiOsumat() {   // jokaisen kierroksen säteen ensimmäinen maaosuma (m), 0 = ei osumaa
      var out = new Float32Array(NR);
      for (var k = 0; k < NR; k++) out[k] = marssi(k * 360 / NR, S.t / 1000, rev);
      return { n: NR, h: Array.from(out) };
    }
    function maaAt(e, n) {   // ruudukon maa (0 vesi, 1 maa, 2 rakennus) ja korkeus (m) pisteessä, tai null
      var ti = Math.floor(e * invTSm), tj = Math.floor(n * invTSm), t = haeRuutu(ti, tj);
      if (!t) return null;
      var ci = ((e - ti * TSm) * invC) | 0, cj = ((n - tj * TSm) * invC) | 0, id = cj * TS + ci;
      return { f: t.f[id], h: t.h[id] * 0.1 };
    }
    // Riippumaton vertailuaineisto: rantaviivan viivageometria (nasijarvi.pmtiles, kerros rantaviiva, z16) EPSG:3067-segmentteinä
    // pisteen (S.e, S.n) ympäriltä. Ei käytä maskia, joten sillä voi todentaa maskin rantaviivan.
    function rantaviivaSegmentit(r) {
      var z = 16, ll = K.enToLonLat(S.e, S.n), tt = K.lonlatToTile(ll.lon, ll.lat, z);
      var tw = 40075016.686 * Math.cos(ll.lat * RAD) / Math.pow(2, z), k = Math.ceil(r / tw) + 1, ps = [], segs = [];
      for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) {
        (function (tx, ty) {
          var cn = K.tileLonLat(z, tx, ty, 0.5, 0.5), ce = K.lonlatToEN(cn.lon, cn.lat);
          if (Math.hypot(ce.e - S.e, ce.n - S.n) > r + tw * 0.8) return;
          ps.push(lukija.vektori(z, tx, ty, ['rantaviiva']).then(function (l) {
            if (!l || !l.rantaviiva) return;
            var ext = l.rantaviiva.extent;
            l.rantaviiva.features.forEach(function (f) {
              f.parts.forEach(function (p) {
                var prev = null;
                for (var q = 0; q < p.length / 2; q++) {
                  var g = K.tileLonLat(z, tx, ty, p[2 * q] / ext, p[2 * q + 1] / ext), en = K.lonlatToEN(g.lon, g.lat);
                  if (prev) segs.push(prev[0], prev[1], en.e, en.n);
                  prev = [en.e, en.n];
                }
              });
            });
          }));
        })(Math.floor(tt.x) + dx, Math.floor(tt.y) + dy);
      }
      return Promise.all(ps).then(function () { return segs; });
    }
    // Vesialueiden (jarvi, virtavesi) renkaat z16-ruuduista EPSG:3067-koordinaatteina: täysi tarkkuus ilman ruudukkoa (testivertailuun)
    function vesiRenkaat(r) {
      var z = 16, ll = K.enToLonLat(S.e, S.n), tt = K.lonlatToTile(ll.lon, ll.lat, z);
      var tw = 40075016.686 * Math.cos(ll.lat * RAD) / Math.pow(2, z), k = Math.ceil(r / tw) + 1, ps = [], feats = [];
      for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) {
        (function (tx, ty) {
          var cn = K.tileLonLat(z, tx, ty, 0.5, 0.5), ce = K.lonlatToEN(cn.lon, cn.lat);
          if (Math.hypot(ce.e - S.e, ce.n - S.n) > r + tw * 0.8) return;
          ps.push(lukija.vektori(z, tx, ty, ['maastokuvio']).then(function (l) {
            if (!l || !l.maastokuvio) return;
            var ext = l.maastokuvio.extent;
            l.maastokuvio.features.forEach(function (f) {
              if (f.type !== 3 || (f.props.luokka !== 'jarvi' && f.props.luokka !== 'virtavesi')) return;
              feats.push(f.parts.map(function (p) {
                var out = new Float64Array(p.length);
                for (var q = 0; q < p.length / 2; q++) { var g = K.tileLonLat(z, tx, ty, p[2 * q] / ext, p[2 * q + 1] / ext), en = K.lonlatToEN(g.lon, g.lat); out[2 * q] = en.e; out[2 * q + 1] = en.n; }
                return out;
              }));
            });
          }));
        })(Math.floor(tt.x) + dx, Math.floor(tt.y) + dy);
      }
      return Promise.all(ps).then(function () { return feats.map(function (f) { return f.map(function (a) { return Array.from(a); }); }); });
    }
    function kohteet() {
      return Array.from(aids.values()).map(function (a) { return { numero: a.numero, nimi: a.nimi, tyyppi: a.tyyppi, e: a.e, n: a.n }; });
    }
    // Vapauttaa ruudukon ja aineistovälimuistit (puskurit säilyvät, joten viimeisin kuva piirtyy edelleen)
    function vapautaRuudut() { ruudut.clear(); demCache.clear(); treeCache.clear(); }
    function tuhoa() {
      pysayta();
      canvas.removeEventListener('pointerdown', pDown); canvas.removeEventListener('pointermove', pMove);
      canvas.removeEventListener('pointerup', pUp); canvas.removeEventListener('pointercancel', pUp); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      if (ro) ro.disconnect();
      ulkoiset.forEach(function (u) { u.el.style.visibility = ''; u.el.style.left = u.el.style.top = u.el.style.width = u.el.style.height = ''; if (u.par) u.par.insertBefore(u.el, u.next && u.next.parentNode === u.par ? u.next : null); });
      ulkoiset = [];
      if (ui && ui.parentNode) ui.parentNode.removeChild(ui);
    }

    // ---------- käynnistys ----------
    canvas.style.touchAction = 'none';
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Tutkakuva');
    canvas.addEventListener('pointerdown', pDown); canvas.addEventListener('pointermove', pMove);
    canvas.addEventListener('pointerup', pUp); canvas.addEventListener('pointercancel', pUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    if (opt.ui !== false) luoUi();
    alustaPuskurit();
    asettelu();
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { asettelu(); piirraPian(); }); ro.observe(canvas); }
    if (opt.tila) paivita(opt.tila);

    return {
      paivita: paivita, asetaViritys: asetaViritys, tila: lue, asetaAlue: asetaAlue, asetaSuuntaYlos: asetaSuuntaYlos, asetaOffset: asetaOffset, asetaVaraus: asetaVaraus, asetaEV: asetaEV, nappain: kasitteleNappain, asetaEBL: asetaEBL, asetaVRM: asetaVRM, asetaSade: asetaSade,
      asetaSadeSuodatin: asetaSadeSuodatin, asetaMeri: asetaMeri, asetaSea: asetaSea, asetaJalki: asetaJalki, asetaVahvistus: asetaVahvistus, asetaHairio: asetaHairio,
      lue: lue, vapautaRuudut: vapautaRuudut, valmis: valmis, taytaKierros: taytaKierros, piirra: piirra, kaynnista: kaynnista, pysayta: pysayta, tuhoa: tuhoa, kohteet: kohteet,
      tilasto: function () { return JSON.parse(JSON.stringify(tilasto)); },
      verkko: function () { return lukija.tilasto; },
      testi: { kaikuPuskuri: function (paalle) { vbuf = paalle ? new Uint8Array(EP * EP) : null; }, kaikuKuva: function () { return vbuf ? { n: EP, v: vbuf, r: EP / 2, nb: NB, nr: NR, askel: step } : null; }, raaka: function () { return { raw: raw, nb: NB, nr: NR, askel: step }; }, jonotila: function () { return { puuttuu: puuttuvat().length, jono: jono.length, rakennetaan: rakennetaan, aids: aidsPending, ruudut: ruudut.size, odottajia: odottajat.length, cell: cell, rangeM: rangeM }; }, profiili: profiili, ensiOsumat: ensiOsumat, maaAt: maaAt, rantaviivaSegmentit: rantaviivaSegmentit, vesiRenkaat: vesiRenkaat, konvergenssi: function () { return S.conv; }, vakiot: M, ruutuja: function () { return ruudut.size; }, geom: function () { return geom; } }
    };
  }

  var api = { luoTutka: luoTutka, luoLukija: luoLukija, ALUEET: ALUEET, LAKE_Z: LAKE_Z, K: K, Mvt: Mvt, M: M, soluKoko: soluKoko };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tutka = api;
})(typeof window !== 'undefined' ? window : globalThis);
