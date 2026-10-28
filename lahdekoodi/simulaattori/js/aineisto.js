/* Simulaattori – aineistopaketin luku (PMTiles, MVT ja Terrain-RGB).
 *
 * Paketin osoite on asetus. Tuotanto-oletus on GitHub Pages, työtilassa paketti tarjoillaan paikallisesti
 * (python3 palvele.py 8140) ja osoite annetaan sivun parametrilla ?aineisto=http://127.0.0.1:8140/.
 * PMTiles-tiedostoja luetaan HTTP Range -pyynnöillä, joten vain tarvittavat ruudut siirtyvät.
 * Kaikki ruudut kulkevat tämän moduulin välimuistin kautta (myös plotterin vektorikerrokset). */
(function (root) {
  'use strict';
  var DEFAULT_URL = 'https://jvaahtikari.github.io/reittikartta-aineisto/';
  var FILES = { vec: 'nasijarvi.pmtiles', dem: 'maasto.pmtiles', tree: 'puusto.pmtiles', surf: 'pinta.pmtiles' };
  var base = DEFAULT_URL, pms = {}, metaP = null, maamerkitP = null;
  var stats = { requests: 0, bytes: 0, tiles: 0, fail: 0 };
  var rawCache = new Map(), RAW_MAX = 400;
  var layerCache = new Map(), LAYER_MAX = 600;
  var inflight = new Map();
  var pngCanvas = null;

  function setBase(url) {
    url = String(url || DEFAULT_URL);
    if (!/\/$/.test(url)) url += '/';
    if (url !== base) { base = url; pms = {}; metaP = null; maamerkitP = null; rawCache.clear(); layerCache.clear(); inflight.clear(); }
    return base;
  }
  function getBase() { return base; }

  // PMTiles-lähde, joka laskee siirretyt tavut
  function CountingSource(url) { this.url = url; }
  CountingSource.prototype.getKey = function () { return this.url; };
  CountingSource.prototype.getBytes = function (offset, length, signal, etag) {
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
    if (!pms[kind]) pms[kind] = new root.pmtiles.PMTiles(new CountingSource(base + FILES[kind]));
    return pms[kind];
  }
  // Ruudun pakkaamaton sisältö (Uint8Array) tai null
  function raw(kind, z, x, y) {
    var key = kind + '/' + z + '/' + x + '/' + y;
    if (rawCache.has(key)) { var v = rawCache.get(key); rawCache.delete(key); rawCache.set(key, v); return Promise.resolve(v); }
    if (inflight.has(key)) return inflight.get(key);
    var p = pm(kind).getZxy(z, x, y).then(function (r) {
      var out = r ? new Uint8Array(r.data) : null;
      if (out) stats.tiles++;
      rawCache.set(key, out);
      if (rawCache.size > RAW_MAX) rawCache.delete(rawCache.keys().next().value);
      inflight.delete(key);
      return out;
    }, function (e) {
      inflight.delete(key); stats.fail++;
      if (e && e.name === 'AbortError') return null;
      return null;
    });
    inflight.set(key, p);
    return p;
  }
  // Vektoriruudun halutut kerrokset: { nimi: {extent, features} } tai null, jos ruutua ei ole
  function layers(z, x, y, names) {
    return raw('vec', z, x, y).then(function (buf) {
      if (!buf) return null;
      var out = {}, need = [], i, key;
      for (i = 0; i < names.length; i++) {
        key = z + '/' + x + '/' + y + '/' + names[i];
        if (layerCache.has(key)) out[names[i]] = layerCache.get(key); else need.push(names[i]);
      }
      if (need.length) {
        var d = root.Mvt.decode(buf, need);
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
  // PNG-ruutu RGBA-tavuina: { w, h, data } tai null
  function png(kind, z, x, y) {
    return raw(kind, z, x, y).then(function (buf) {
      if (!buf) return null;
      var blob = new Blob([buf], { type: 'image/png' });
      return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(function () { return createImageBitmap(blob); }).then(function (bm) {
        if (!pngCanvas) { pngCanvas = document.createElement('canvas'); }
        if (pngCanvas.width !== bm.width || pngCanvas.height !== bm.height) { pngCanvas.width = bm.width; pngCanvas.height = bm.height; }
        var g = pngCanvas.getContext('2d', { willReadFrequently: true });
        g.clearRect(0, 0, bm.width, bm.height);
        g.drawImage(bm, 0, 0);
        var id = g.getImageData(0, 0, bm.width, bm.height);
        if (bm.close) bm.close();
        return { w: id.width, h: id.height, data: id.data };
      });
    });
  }
  // Terrain-RGB -> korkeudet (m N2000), NaN = ei dataa
  function terrainHeights(img) {
    var n = img.w * img.h, out = new Float32Array(n), d = img.data;
    for (var i = 0; i < n; i++) {
      var r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
      out[i] = (r === 0 && g === 0 && b === 0) ? NaN : -10000 + (r * 65536 + g * 256 + b) * 0.1;
    }
    return out;
  }

  function getJson(name) {
    return fetch(base + name).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function meta() { if (!metaP) metaP = getJson('aineisto.json').catch(function () { metaP = null; return null; }); return metaP; }
  function maamerkit() { if (!maamerkitP) maamerkitP = getJson('maamerkit.json').catch(function () { maamerkitP = null; return null; }); return maamerkitP; }

  // protomaps-leafletin lähdeolio: ruudut aineiston välimuistin kautta
  function leafletSource(kind) {
    return {
      getZxy: function (z, x, y, signal) {
        return raw(kind, z, x, y).then(function (b) { return b ? { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : undefined; });
      }
    };
  }

  var api = {
    DEFAULT_URL: DEFAULT_URL, FILES: FILES, setBase: setBase, getBase: getBase, raw: raw, layers: layers, png: png,
    terrainHeights: terrainHeights, meta: meta, maamerkit: maamerkit, stats: stats, leafletSource: leafletSource
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Aineisto = api;
})(typeof window !== 'undefined' ? window : globalThis);
