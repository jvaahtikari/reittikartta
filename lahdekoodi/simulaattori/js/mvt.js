/* Simulaattori – Mapbox Vector Tile -purkaja.
 *
 * Purkaa MVT-ruudun (pakkaamaton protobuf) ja palauttaa vain halutut kerrokset.
 * Geometria on ruudun omissa kokonaisluvuissa (0..extent, y alaspäin) litteinä Int32Array-taulukkoina:
 * pisteillä yksi taulukko per piste ja viivoilla ja polygoneilla yksi per viiva tai rengas.
 *
 * Tulos: { kerros: { extent, features: [ { type: 1|2|3, props: {...}, parts: [Int32Array, ...] } ] } }
 * Polygonin renkaan suunta kertoo, onko se ulkoreuna (ala > 0 y alaspäin) vai reikä (ala < 0). */
(function (root) {
  'use strict';
  var TD = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function Reader(buf) { this.b = buf; this.p = 0; this.n = buf.length; }
  Reader.prototype.varint = function () {
    var b = this.b, r = 0, shift = 0, x;
    do {
      x = b[this.p++];
      r += (x & 127) * Math.pow(2, shift);   // sallii yli 32 bitin arvot (liukuluvun tarkkuuden rajoissa)
      shift += 7;
    } while (x & 128);
    return r;
  };
  Reader.prototype.skip = function (wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.p += 8;
    else if (wt === 2) { var l = this.varint(); this.p += l; }
    else if (wt === 5) this.p += 4;
    else throw new Error('tuntematon wiretype ' + wt);
  };
  Reader.prototype.str = function (len) {
    var s = TD ? TD.decode(this.b.subarray(this.p, this.p + len)) : String.fromCharCode.apply(null, this.b.subarray(this.p, this.p + len));
    this.p += len; return s;
  };
  function zz(n) { return (n >>> 1) ^ -(n & 1); }

  function readValue(buf, start, end) {
    var r = new Reader(buf); r.p = start;
    var val = null;
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
          if (cmd === 1) { if (cur) parts.push(Int32Array.from(cur)); cur = [x, y]; }
          else cur.push(x, y);
        }
        if (type === 1 && cmd === 1) { /* pisteet: jokainen MoveTo on oma osa */ }
      } else if (cmd === 7) {
        if (cur) { cur.push(cur[0], cur[1]); }
      }
    }
    if (cur) parts.push(Int32Array.from(cur));
    return parts;
  }

  function decode(buf, want) {
    var out = {}, r = new Reader(buf);
    while (r.p < r.n) {
      var tag = r.varint(), f = tag >> 3, wt = tag & 7;
      if (f !== 3 || wt !== 2) { r.skip(wt); continue; }
      var len = r.varint(), end = r.p + len, start = r.p;
      // ensin kerroksen nimi (kenttä 1), muut kentät luetaan vain jos kerros halutaan
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

  // Renkaan etumerkillinen ala (y alaspäin: positiivinen = ulkoreuna)
  function ringArea(a) {
    var s = 0, n = a.length / 2;
    for (var i = 0; i < n - 1; i++) s += a[2 * i] * a[2 * i + 3] - a[2 * i + 2] * a[2 * i + 1];
    return s / 2;
  }

  var api = { decode: decode, ringArea: ringArea };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mvt = api;
})(typeof window !== 'undefined' ? window : globalThis);
