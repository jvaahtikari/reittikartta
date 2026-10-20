/* Reittikartta – terävä merikarttarasteri.
 *
 * Traficomin rasterimerikarttojen tarkin taso on 15 (n. 2,3 m/pikseli
 * Suomen leveyksillä). Sitä lähempänä, ja korkean pikselitiheyden näytöillä,
 * selain venyttäisi kuvan sumeaksi. Merikartta on kuitenkin tasavärinen
 * viivapiirros, joten sen voi suurentaa värien tasolla:
 *
 *  1. Lähdetiilen hallitsevista väreistä muodostetaan paletti. Reunojen
 *     pehmennyksestä syntyvät sekävärit tunnistetaan ja jätetään pois.
 *  2. Jokainen lähdepikseli selitetään yhdellä palettivärillä tai kahden
 *     palettivärin sekoituksena (esim. musta rantaviiva veden päällä).
 *  3. Suurennuksessa kunkin värin peitto interpoloidaan kuutiollisesti, ja
 *     näyttöpikseli saa suurimman peiton värin. Raja jää teräväksi noin
 *     yhden näyttöpikselin pehmennyksellä, eikä väliin synny vieraita värejä.
 *  4. Tarkalla näytöllä tasoilla alle 15 käytetään tarkempia tiiliä
 *     pienennettyinä.
 *
 * Tarkkuutta ei synny lisää: tiedot ovat kartan omat, mutta ne piirtyvät
 * terävinä tasoille 16–17 asti. */
(function (global) {
  'use strict';

  var NATIVE_MAX = 15;
  var NONE = 255;

  function LRU(max, onEvict) { this.max = max; this.map = new Map(); this.onEvict = onEvict; }
  LRU.prototype.get = function (k) {
    var v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  };
  LRU.prototype.set = function (k, v) {
    this.map.set(k, v);
    while (this.map.size > this.max) {
      var first = this.map.keys().next().value;
      if (this.onEvict) this.onEvict(this.map.get(first));
      this.map.delete(first);
    }
  };
  LRU.prototype.del = function (k) { this.map.delete(k); };

  var bitmaps = new LRU(500, function (bm) { if (bm && bm.close) { try { bm.close(); } catch (e) { /* ohita */ } } });
  var inflight = new Map();
  var sources = new LRU(80);

  // Lataa tiilen kuvaksi. null = ei kuvaa (alueen ulkopuolella), undefined = verkkovirhe.
  function loadBitmap(url) {
    var hit = bitmaps.get(url);
    if (hit !== undefined) return Promise.resolve(hit);
    if (inflight.has(url)) return inflight.get(url);
    var p = fetch(url).then(function (r) {
      if (!r.ok) return null;
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('image') < 0) return null;
      return r.blob().then(function (b) { return createImageBitmap(b); });
    }).then(function (bm) {
      inflight.delete(url); bitmaps.set(url, bm); return bm;
    }, function () {
      inflight.delete(url);
      try { global.dispatchEvent(new CustomEvent('rk-tile-error')); } catch (e) { /* ohita */ }
      return undefined;
    });
    inflight.set(url, p);
    return p;
  }

  // ---------- paletti ----------
  function buildPalette(d, W, H) {
    var n = W * H, keys = new Int32Array(n), counts = new Map(), total = 0;
    for (var p = 0, i = 0; p < n; p++, i += 4) {
      if (d[i + 3] < 128) { keys[p] = -1; continue; }
      var k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      keys[p] = k;
      var e = counts.get(k);
      if (!e) { e = [0, 0, 0, 0, 0]; counts.set(k, e); }
      e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2];
      total++;
    }
    // "sisäpikselit": kaikki neljä naapuria samaa väriä → tasainen täyttö, ei reunasekoitus
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      var q = y * W + x, kk = keys[q];
      if (kk < 0) continue;
      if (keys[q - 1] === kk && keys[q + 1] === kk && keys[q - W] === kk && keys[q + W] === kk) counts.get(kk)[4]++;
    }
    var arr = [];
    counts.forEach(function (e) { arr.push(e); });
    arr.sort(function (a, b) { return b[0] - a[0]; });
    var minCount = Math.max(8, total * 0.0002);
    var cands = [];
    for (var j = 0; j < arr.length && cands.length < 48; j++) {
      var e2 = arr[j];
      if (e2[0] < minCount) break;
      var c = { r: e2[1] / e2[0], g: e2[2] / e2[0], b: e2[3] / e2[0], n: e2[0], inner: e2[4] };
      var m = null;
      for (var t = 0; t < cands.length; t++) {
        var o = cands[t], dr = o.r - c.r, dg = o.g - c.g, db = o.b - c.b;
        if (dr * dr + dg * dg + db * db < 100) { m = o; break; }
      }
      if (m) { m.n += c.n; m.inner += c.inner; } else cands.push(c);
    }
    // Selvästi tasaiset täyttövärit hyväksytään suoraan. Muut käsitellään yleisimmästä
    // harvinaisimpaan: väri on reunasekoitus vain, jos se on kahden jo hyväksytyn ja selvästi
    // yleisemmän värin välissä. Näin ohuen viivan oma väri (esim. syvyyskäyrän syaani, jolla ei
    // ole yhtään "sisäpikseliä") hyväksytään ennen omia sekoituksiaan, eivätkä sekoitukset voi
    // pudottaa toisiaan ja aitoa väriä ketjuna pois.
    var acc = [], rest = [];
    cands.forEach(function (c) { c.fill = c.inner / c.n > 0.25 || c.n > total * 0.05; (c.fill ? acc : rest).push(c); });
    rest.sort(function (a, b) { return b.n - a.n; });
    rest.forEach(function (c) {
      for (var a = 0; a < acc.length; a++) {
        var A = acc[a];
        if (A.n < c.n * 2) continue;
        for (var b = a + 1; b < acc.length; b++) {
          var B = acc[b];
          if (B.n < c.n * 2) continue;
          var vr = B.r - A.r, vg = B.g - A.g, vb = B.b - A.b, vv = vr * vr + vg * vg + vb * vb;
          if (vv < 400) continue;
          var tt = ((c.r - A.r) * vr + (c.g - A.g) * vg + (c.b - A.b) * vb) / vv;
          if (tt < 0.06 || tt > 0.94) continue;
          var pr = A.r + vr * tt - c.r, pg = A.g + vg * tt - c.g, pb = A.b + vb * tt - c.b;
          if (pr * pr + pg * pg + pb * pb < 200) return;            // sekoitus → pois
        }
      }
      acc.push(c);
    });
    // neljäs arvo: 1 = viivan tai tekstin väri ("muste"), 0 = täyttöväri
    return acc.map(function (c) { return [c.r, c.g, c.b, c.fill ? 0 : 1]; });
  }

  // ---------- pikselin selitys palettiväreillä ----------
  function labelBlend(d, n, pal) {
    var P = pal.length, l1 = new Uint8Array(n), l2 = new Uint8Array(n), bt = new Uint8Array(n);
    // Sekoituspari etsitään kymmenen lähimmän värin joukosta. Esim. mustan viivan ja vaalean
    // veden välinen harmaa reunapikseli on värietäisyydeltään lähempänä syaanin sävyjä kuin
    // kumpaakaan oikeaa väriään, joten liian pieni joukko tulkitsisi sen syaaniksi.
    var Kn = Math.min(10, P);
    var di = new Float32Array(P), top = new Int16Array(Math.max(1, Kn));
    for (var p = 0, i = 0; p < n; p++, i += 4) {
      if (d[i + 3] < 128 || P === 0) { l1[p] = NONE; l2[p] = NONE; continue; }
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var n0 = 0;
      for (var k = 0; k < P; k++) {
        var dr = r - pal[k][0], dg = g - pal[k][1], db = b - pal[k][2];
        di[k] = dr * dr + dg * dg + db * db;
        if (di[k] < di[n0]) n0 = k;
      }
      if (di[n0] <= 40) { l1[p] = n0; l2[p] = NONE; bt[p] = 0; continue; }   // tasainen väri
      for (var s = 0; s < Kn; s++) {
        var bi = -1, bv = 1e12;
        for (var k2 = 0; k2 < P; k2++) {
          var used = false;
          for (var u = 0; u < s; u++) if (top[u] === k2) { used = true; break; }
          if (!used && di[k2] < bv) { bv = di[k2]; bi = k2; }
        }
        top[s] = bi;
      }
      var d0 = di[top[0]], best = d0, A = top[0], B = NONE, F = 0;
      if (d0 > 40) {
        for (var x = 0; x < Kn; x++) for (var y = x + 1; y < Kn; y++) {
          var a = pal[top[x]], c = pal[top[y]];
          var vr = c[0] - a[0], vg = c[1] - a[1], vb = c[2] - a[2], vv = vr * vr + vg * vg + vb * vb;
          if (vv < 1) continue;
          var t = ((r - a[0]) * vr + (g - a[1]) * vg + (b - a[2]) * vb) / vv;
          if (t <= 0 || t >= 1) continue;
          var er = a[0] + vr * t - r, eg = a[1] + vg * t - g, eb = a[2] + vb * t - b;
          var res = er * er + eg * eg + eb * eb;
          if (res < best * 0.5) {
            best = res;
            if (t < 0.5) { A = top[x]; B = top[y]; F = t; } else { A = top[y]; B = top[x]; F = 1 - t; }
          }
        }
      }
      l1[p] = A; l2[p] = B; bt[p] = Math.round(F * 255);
    }
    return { l1: l1, l2: l2, t: bt };
  }

  // ---------- suurennus värikohtaisina peittokenttinä ----------
  // Jokainen lähdepikseli on selitetty yhdellä palettivärillä tai kahden värin sekoituksena
  // (osuudet 1 − t ja t). Kunkin värin peitto interpoloidaan Catmull–Rom-kuutiolla 4×4
  // naapurustosta, ja näyttöpikseli saa suurimman peiton värin. Raja pehmennetään noin yhden
  // näyttöpikselin levyiseksi. Viiva- ja tekstivärit voittavat tasatilanteen, jotta ohuet,
  // pehmennetyt viivat pysyvät yhtenäisinä. Yksi vaihe riittää mihin tahansa suurennukseen,
  // eikä yksittäisistä väärin tulkituista pikseleistä synny läiskiä.
  var INK = 1.25;
  function cubicW(t, w) {
    var t2 = t * t, t3 = t2 * t;
    w[0] = -0.5 * t3 + t2 - 0.5 * t;
    w[1] = 1.5 * t3 - 2.5 * t2 + 1;
    w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
    w[3] = 0.5 * t3 - 0.5 * t2;
  }
  function axis(s0, span, outN, N) {
    var f = outN / span, idx = new Int16Array(outN * 4), wt = new Float32Array(outN * 4), w = [0, 0, 0, 0];
    for (var o = 0; o < outN; o++) {
      var sf = s0 + (o + 0.5) / f - 0.5, i0 = Math.floor(sf);
      cubicW(sf - i0, w);
      for (var k = 0; k < 4; k++) {
        var ii = i0 - 1 + k;
        idx[o * 4 + k] = ii < 0 ? 0 : ii >= N ? N - 1 : ii;
        wt[o * 4 + k] = w[k];
      }
    }
    return { idx: idx, wt: wt };
  }
  // flat[p] = 1, kun pikselin 5×5-ympäristö on yhtä ja samaa palettiväriä: suurennuksessa
  // tällaisen kohdan näyttöpikselit saavat värin suoraan ilman peittolaskentaa.
  function flatMap(L, d, W, H) {
    var l1 = L.l1, l2 = L.l2, n = W * H, h = new Uint8Array(n), f = new Uint8Array(n);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var p = y * W + x, a = l1[p], ok = a !== NONE;
      for (var k = -2; ok && k <= 2; k++) {
        var xx = x + k < 0 ? 0 : x + k >= W ? W - 1 : x + k, q = y * W + xx;
        if (l1[q] !== a || l2[q] !== NONE || d[q * 4 + 3] < 128) ok = false;
      }
      h[p] = ok ? 1 : 0;
    }
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      var p2 = y2 * W + x2, ok2 = h[p2] === 1;
      for (var k2 = -2; ok2 && k2 <= 2; k2++) {
        var yy = y2 + k2 < 0 ? 0 : y2 + k2 >= H ? H - 1 : y2 + k2, q2 = yy * W + x2;
        if (!h[q2] || l1[q2] !== l1[p2]) ok2 = false;
      }
      f[p2] = ok2 ? 1 : 0;
    }
    return f;
  }

  function sharpenRegion(S, sx, sy, span, outW, outH) {
    var W = 256, H = 256, L = S.L, l1 = L.l1, l2 = L.l2, bt = L.t, pal = S.pal, P = pal.length;
    var d = S.d;
    if (!S.flat) S.flat = flatMap(L, d, W, H);
    var flat = S.flat;
    var out = new Uint8ClampedArray(outW * outH * 4);
    var f = outW / span;
    var AX = axis(sx, span, outW, W), AY = axis(sy, span, outH, H);
    var m = new Float32Array(P + 1), stamp = new Int32Array(P + 1), touched = new Int16Array(40), bias = new Float32Array(P), id = 0;
    for (var k = 0; k < P; k++) bias[k] = pal[k][3] ? INK : 1;
    var aa = f * 0.5;
    for (var oy = 0; oy < outH; oy++) {
      var yb = oy * 4;
      for (var ox = 0; ox < outW; ox++) {
        var xb = ox * 4, nt = 0, alpha = 0;
        var p0 = AY.idx[yb + 1] * W + AX.idx[xb + 1];
        if (flat[p0]) {
          var PF = pal[l1[p0]], of = (oy * outW + ox) * 4;
          out[of] = PF[0]; out[of + 1] = PF[1]; out[of + 2] = PF[2]; out[of + 3] = 255;
          continue;
        }
        id++;
        for (var j = 0; j < 4; j++) {
          var wy = AY.wt[yb + j], row = AY.idx[yb + j] * W;
          for (var i = 0; i < 4; i++) {
            var w = wy * AX.wt[xb + i], p = row + AX.idx[xb + i];
            if (d[p * 4 + 3] < 128) continue;
            alpha += w;
            var a = l1[p], b = l2[p];
            if (a === NONE) continue;
            if (stamp[a] !== id) { stamp[a] = id; m[a] = 0; if (nt < 40) touched[nt++] = a; }
            if (b === NONE) { m[a] += w; continue; }
            var tb = bt[p] / 255;
            m[a] += w * (1 - tb);
            if (stamp[b] !== id) { stamp[b] = id; m[b] = 0; if (nt < 40) touched[nt++] = b; }
            m[b] += w * tb;
          }
        }
        var o = (oy * outW + ox) * 4;
        if (alpha < 0.5 || nt === 0) {
          if (alpha >= 0.5) {           // ei palettiväriä: tavallinen interpolointi
            var pc = (AY.idx[yb + 1] * W + AX.idx[xb + 1]) * 4;
            out[o] = d[pc]; out[o + 1] = d[pc + 1]; out[o + 2] = d[pc + 2]; out[o + 3] = 255;
          }
          continue;
        }
        var A = -1, B = -1, mA = -1e9, mB = -1e9;
        for (var q = 0; q < nt; q++) {
          var c = touched[q], v = m[c] * bias[c];
          if (v > mA) { mB = mA; B = A; mA = v; A = c; } else if (v > mB) { mB = v; B = c; }
        }
        var PA = pal[A];
        if (B < 0) { out[o] = PA[0]; out[o + 1] = PA[1]; out[o + 2] = PA[2]; out[o + 3] = 255; continue; }
        var t = 0.5 + (mA - mB) * aa;
        if (t >= 1) { out[o] = PA[0]; out[o + 1] = PA[1]; out[o + 2] = PA[2]; out[o + 3] = 255; continue; }
        var PB = pal[B];
        out[o] = PB[0] + (PA[0] - PB[0]) * t;
        out[o + 1] = PB[1] + (PA[1] - PB[1]) * t;
        out[o + 2] = PB[2] + (PA[2] - PB[2]) * t;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  /* SharpChart: GridLayer, joka kokoaa WMTS-tasopinon yhdeksi kuvaksi ja
   * piirtää sen terävänä. layers: [{ url, minZoom, maxZoom }], url-mallissa {z} {x} {y}. */
  var SharpChart = L.GridLayer.extend({
    options: { tileSize: 256, maxZoom: 17, updateWhenZooming: false, keepBuffer: 2, sharpen: true },

    initialize: function (layers, options) {
      this._layers = layers;
      L.setOptions(this, options);
    },

    setSharpen: function (on) { this.options.sharpen = !!on; this.redraw(); },

    _source: function (z, sz, px, py) {
      var self = this, active = [];
      this._layers.forEach(function (l, i) {
        if (z >= (l.minZoom || 0) && z <= (l.maxZoom || 99)) active.push(i);
      });
      var key = sz + '/' + px + '/' + py + '|' + active.join(',');
      var hit = sources.get(key);
      if (hit) return hit;
      var prom = Promise.all(active.map(function (i) {
        return loadBitmap(self._layers[i].url.replace('{z}', sz).replace('{x}', px).replace('{y}', py));
      })).then(function (bms) {
        if (bms.some(function (bm) { return bm === undefined; })) sources.del(key);  // yritä myöhemmin uudelleen
        var c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        var g = c.getContext('2d', { willReadFrequently: true });
        var any = false;
        bms.forEach(function (bm) { if (bm) { any = true; g.drawImage(bm, 0, 0, 256, 256); } });
        return any ? { canvas: c, d: null, pal: null, L: null } : null;
      });
      sources.set(key, prom);
      return prom;
    },

    // Voiko tason z näkymän koota yhtä tasoa tarkemmista tiilistä (kaikki tason z karttasarjat
    // ovat saatavilla myös tasolla z + 1)?
    _canUp: function (z) {
      if (z + 1 > NATIVE_MAX) return false;
      return this._layers.every(function (l) {
        return !(z >= (l.minZoom || 0) && z <= (l.maxZoom || 99)) || (l.maxZoom || 99) >= z + 1;
      });
    },

    createTile: function (coords, done) {
      var self = this;
      // Selaimen zoomaus muuttaa pikselitiheyttä (esim. 80 % → 0,8). Tiili piirretään aina
      // näytön omalla tarkkuudella, jotta selaimen ei tarvitse skaalata sitä jälkikäteen.
      var dpr = Math.min(2, Math.max(0.5, global.devicePixelRatio || 1));
      var tile = document.createElement('canvas');
      var size = this.getTileSize();
      var outW = Math.max(1, Math.round(size.x * dpr)), outH = Math.max(1, Math.round(size.y * dpr));
      tile.width = outW; tile.height = outH;
      var z = coords.z;
      var finish = function () { done(null, tile); };
      function smooth(g) {
        g.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
      }

      // Tarkka näyttö (esim. Windowsin 125 % / 150 % skaalaus) tasoilla alle 15: kootaan näkymä
      // yhtä tasoa tarkemmista tiilistä ja pienennetään. Traficomin tasot ovat saman kartan
      // pienennöksiä, joten sisältö on sama, mutta kuva on terävämpi kuin venytetty tiili.
      if (dpr > 1.05 && this._canUp(z)) {
        var kids = [];
        for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) kids.push(this._source(z, z + 1, coords.x * 2 + i, coords.y * 2 + j));
        Promise.all(kids).then(function (S4) {
          if (!S4.some(Boolean)) { finish(); return; }
          var big = document.createElement('canvas');
          big.width = 512; big.height = 512;
          var bg = big.getContext('2d');
          S4.forEach(function (S, k) { if (S) bg.drawImage(S.canvas, (k % 2) * 256, Math.floor(k / 2) * 256); });
          var g = tile.getContext('2d');
          smooth(g);
          g.drawImage(big, 0, 0, 512, 512, 0, 0, outW, outH);
          finish();
        }, finish);
        return tile;
      }

      var sz = Math.min(z, NATIVE_MAX);
      var dz = z - sz;
      var px = coords.x >> dz, py = coords.y >> dz;
      var span = 256 / Math.pow(2, dz);
      var sx = (coords.x - (px << dz)) * span, sy = (coords.y - (py << dz)) * span;
      this._source(z, sz, px, py).then(function (S) {
        if (!S) { finish(); return; }
        var g = tile.getContext('2d');
        var f = outW / span;
        if (!self.options.sharpen || f <= 1.05) {
          smooth(g);
          g.drawImage(S.canvas, sx, sy, span, span, 0, 0, outW, outH);
          finish();
          return;
        }
        try {
          if (!S.L) {
            S.d = S.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 256, 256).data;
            S.pal = buildPalette(S.d, 256, 256);
            S.L = labelBlend(S.d, 65536, S.pal);
          }
          var px2 = sharpenRegion(S, sx, sy, span, outW, outH);
          g.putImageData(new ImageData(px2, outW, outH), 0, 0);
        } catch (e) {
          smooth(g);
          g.drawImage(S.canvas, sx, sy, span, span, 0, 0, outW, outH);
        }
        finish();
      }, finish);
      return tile;
    }
  });

  global.SharpChart = SharpChart;
  global.SharpChart.NATIVE_MAX = NATIVE_MAX;
})(window);
