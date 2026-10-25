/* Simulaattori – turvalaitteiden ja merkkien tietovarasto.
 *
 * Aineiston turvalaitepisteet on harvennettu pienillä zoomeilla (z14: 62 ja z16: 98 laitetta Tampereen alueella),
 * joten täydellinen joukko luetaan z16-ruuduista aluksen ympäriltä. Laitteet pidetään maailmakoordinaateissa. */
(function (root) {
  'use strict';
  var Z = 16, aids = new Map(), signs = new Map(), boards = new Map(), loaded = new Set(), pending = new Set();
  var loading = 0, MAX_PAR = 8;

  function tileRange(cx, cy, r) {
    var ll = root.Paikka.worldToLonLat(cx, cy), t = root.Paikka.lonlatToTile(ll.lon, ll.lat, Z);
    var o = root.Paikka.getOrigin();
    // ruudun leveys metreinä tällä leveysasteella
    var tw = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, Z) * 1.0;
    var k = Math.ceil(r / tw) + 1, list = [];
    for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) {
      var tx = Math.floor(t.x) + dx, ty = Math.floor(t.y) + dy;
      var centre = root.Paikka.tileLonLat(Z, tx, ty, 0.5, 0.5), w = root.Paikka.lonlatToWorld(centre.lon, centre.lat);
      var d = Math.hypot(w.x - cx, w.y - cy);
      if (d <= r + tw * 0.75) list.push({ x: tx, y: ty, d: d });
    }
    list.sort(function (a, b) { return a.d - b.d; });
    return list;
  }

  // Taululinjojen päätepisteet (linjataulut) ja vesiliikennemerkit. Ruudun reunalla katkaistun linjan reunapiste ohitetaan.
  function ingestBoards(z, tx, ty, layer) {
    if (!layer) return;
    var ext = layer.extent, P = root.Paikka;
    layer.features.forEach(function (f, fi) {
      if (f.type !== 2) return;
      f.parts.forEach(function (ln, pi) {
        var n = ln.length / 2; if (n < 2) return;
        [[0, 1], [n - 1, n - 2]].forEach(function (ends) {
          var i = ends[0], j = ends[1], qx = ln[2 * i], qy = ln[2 * i + 1];
          if (qx <= 1 || qy <= 1 || qx >= ext - 1 || qy >= ext - 1) return;
          var a = P.tileLonLat(z, tx, ty, qx / ext, qy / ext), b = P.tileLonLat(z, tx, ty, ln[2 * j] / ext, ln[2 * j + 1] / ext);
          var wa = P.lonlatToWorld(a.lon, a.lat), wb = P.lonlatToWorld(b.lon, b.lat), en = P.lonlatToEN(a.lon, a.lat);
          var key = Math.round(en.e) + '/' + Math.round(en.n);
          if (boards.has(key)) return;
          // taulu on käännetty linjan suuntaan (kohti linjaa pitkin tulevaa katsojaa): normaali osoittaa pois linjasta
          boards.set(key, { key: key, x: wa.x, y: wa.y, e: en.e, n: en.n, dirX: wa.x - wb.x, dirY: wa.y - wb.y, nimi: (layer.features[fi].props.vaylan_nimi || '') });
        });
      });
    });
  }
  function ingestSigns(z, tx, ty, layer) {
    if (!layer) return;
    layer.features.forEach(function (f) {
      if (f.type !== 1 || !f.parts.length) return;
      var p = f.props, q = f.parts[0], ll = root.Paikka.tileLonLat(z, tx, ty, q[0] / layer.extent, q[1] / layer.extent);
      var en = root.Paikka.lonlatToEN(ll.lon, ll.lat), key = Math.round(en.e) + '/' + Math.round(en.n) + '/' + (p.nimi || '');
      if (signs.has(key)) return;
      var w = root.Paikka.lonlatToWorld(ll.lon, ll.lat);
      signs.set(key, { key: key, nimi: p.nimi || '', laji: Number(p.lajityyppi), tyyppi: Number(p.tyyppi), kilpi: p.lisakilpi1 || '', arvo: p.rajoitusarvo == null ? null : Number(p.rajoitusarvo), x: w.x, y: w.y, e: en.e, n: en.n });
    });
  }

  function ingest(z, tx, ty, layer) {
    if (!layer) return;
    layer.features.forEach(function (f) {
      if (f.type !== 1 || !f.parts.length) return;
      var p = f.props, num = String(p.numero);
      if (aids.has(num)) return;
      var q = f.parts[0], ll = root.Paikka.tileLonLat(z, tx, ty, q[0] / layer.extent, q[1] / layer.extent);
      var w = root.Paikka.lonlatToWorld(ll.lon, ll.lat), en = root.Paikka.lonlatToEN(ll.lon, ll.lat);
      var sektorit = null;
      try { sektorit = p.sektorit ? JSON.parse(p.sektorit) : null; } catch (e) { sektorit = null; }
      aids.set(num, {
        numero: num, nimi: p.nimi || '', tyyppi: p.tyyppi || '', alityyppi: p.alityyppi || '',
        nl: p.navigointilaji == null ? 0 : Number(p.navigointilaji), valaistu: p.valaistu === 'K',
        valotunnus: p.valotunnus || '', valoKorkeus: p.valon_korkeus_vedesta == null ? null : Number(p.valon_korkeus_vedesta),
        sektorit: sektorit, vayla: p.vayla || '', lon: ll.lon, lat: ll.lat, e: en.e, n: en.n, x: w.x, y: w.y
      });
    });
  }

  // Lataa laitteet säteellä r (m) pisteen (cx, cy) ympäriltä. Palauttaa lupauksen, joka täyttyy, kun kaikki ruudut on luettu.
  function load(cx, cy, r) {
    var list = tileRange(cx, cy, r).filter(function (t) { var k = t.x + '/' + t.y; return !loaded.has(k) && !pending.has(k); });
    if (!list.length) return Promise.resolve(aids.size);
    return new Promise(function (resolve) {
      var i = 0, active = 0;
      function next() {
        while (active < MAX_PAR && i < list.length) {
          (function (t) {
            var k = t.x + '/' + t.y; pending.add(k); active++;
            root.Aineisto.layers(Z, t.x, t.y, ['turvalaite', 'taululinja', 'vesiliikennemerkki']).then(function (l) { if (l) { ingest(Z, t.x, t.y, l.turvalaite); ingestBoards(Z, t.x, t.y, l.taululinja); ingestSigns(Z, t.x, t.y, l.vesiliikennemerkki); } }, function () {}).then(function () {
              pending.delete(k); loaded.add(k); active--;
              if (i >= list.length && active === 0) resolve(aids.size); else next();
            });
          })(list[i++]);
        }
      }
      next();
    });
  }
  function near(cx, cy, r) {
    var out = [], r2 = r * r;
    aids.forEach(function (a) { var dx = a.x - cx, dy = a.y - cy; if (dx * dx + dy * dy <= r2) out.push(a); });
    return out;
  }
  function all() { return Array.from(aids.values()); }
  function nearList(map, cx, cy, r) { var out = [], r2 = r * r; map.forEach(function (a) { var dx = a.x - cx, dy = a.y - cy; if (dx * dx + dy * dy <= r2) out.push(a); }); return out; }
  function nearBoards(cx, cy, r) { return nearList(boards, cx, cy, r); }
  function nearSigns(cx, cy, r) { return nearList(signs, cx, cy, r); }
  function byNumber(n) { return aids.get(String(n)); }
  function clear() { aids.clear(); signs.clear(); boards.clear(); loaded.clear(); pending.clear(); }
  // Origon vaihtuessa maailmakoordinaatit lasketaan uudelleen
  function rebase() { [aids, signs, boards].forEach(function (m) { m.forEach(function (a) { var w = root.Paikka.enToWorld(a.e, a.n); a.x = w.x; a.y = w.y; }); }); }

  var api = { load: load, near: near, nearBoards: nearBoards, nearSigns: nearSigns, all: all, byNumber: byNumber, clear: clear, rebase: rebase, Z: Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Merkit = api;
})(typeof window !== 'undefined' ? window : globalThis);
