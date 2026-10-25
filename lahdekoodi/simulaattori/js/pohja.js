/* Simulaattori – pohjakosketuksen tunnistus.
 *
 * Pohjakosketus syntyy, kun aluksen keula tai keskipiste on (1) Traficomin syvyysalueella, jonka suurin syvyys (DRVAL2, kenttä ylin)
 * on pienempi kuin syväys (oletus 1,1 m, Liike.SETTINGS.draftM), tai (2) maa-alueella, jonka maastomallin korkeus on yli 0,35 m järven
 * pinnan yläpuolella (kutsuja antaa korkeusfunktion). Syvyysalueet luetaan z16-ruuduista aluksen edestä ennakkoon. */
(function (root) {
  'use strict';
  var Z = 16, tiles = new Map(), pending = new Set(), MAX_TILES = 120;
  var LAND_M = 0.35, HALF_LEN = 6.5;

  function inRing(ring, x, y) {
    var inside = false, n = ring.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPoly(parts, x, y) {   // parit: ulkoreuna ja reiät (even-odd)
    var c = 0;
    for (var i = 0; i < parts.length; i++) if (inRing(parts[i], x, y)) c++;
    return (c & 1) === 1;
  }
  function tileOf(x, y) {
    var ll = root.Paikka.worldToLonLat(x, y), t = root.Paikka.lonlatToTile(ll.lon, ll.lat, Z);
    return { tx: Math.floor(t.x), ty: Math.floor(t.y), u: t.x - Math.floor(t.x), v: t.y - Math.floor(t.y) };
  }
  function ensure(tx, ty) {
    var k = tx + '/' + ty;
    if (tiles.has(k) || pending.has(k)) return;
    pending.add(k);
    root.Aineisto.layers(Z, tx, ty, ['syvyysalue', 'vaylaalue']).then(function (l) {
      var polys = [], fw = [];
      if (l && l.vaylaalue) l.vaylaalue.features.forEach(function (f) { if (f.type === 3) fw.push(f.parts); });
      if (l && l.syvyysalue) l.syvyysalue.features.forEach(function (f) {
        if (f.type === 3 && f.props.ylin != null) polys.push({ ylin: Number(f.props.ylin), alin: Number(f.props.alin), parts: f.parts });
      });
      tiles.set(k, { polys: polys, fw: fw, extent: l && l.syvyysalue ? l.syvyysalue.extent : 4096, ok: !!l });
      pending.delete(k);
      if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value);
    }, function () { pending.delete(k); });
  }
  // Lataa ruudut pisteen (x, y) ympäriltä, ruutu on noin 600 m, joten säde 700 m riittää
  function preload(x, y, r) {
    var c = tileOf(x, y), k = Math.ceil((r || 700) / 450);
    for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) ensure(c.tx + dx, c.ty + dy);
  }
  // Syvyys pisteessä: { known, shallow, ylin } (ylin = suurin syvyys DRVAL2 pienimmän alueen mukaan)
  function depthAt(x, y) {
    var c = tileOf(x, y), T = tiles.get(c.tx + '/' + c.ty);
    if (!T) return { known: false };
    var px = c.u * T.extent, py = c.v * T.extent, best = null;
    for (var i = 0; i < T.polys.length; i++) {
      var p = T.polys[i];
      if (inPoly(p.parts, px, py) && (best == null || p.ylin < best)) best = p.ylin;
    }
    return { known: true, ylin: best };
  }
  // Väyläalueen sisällä: true, false tai null (ruutu ei vielä ladattu)
  function inFairway(x, y) {
    var c = tileOf(x, y), T = tiles.get(c.tx + '/' + c.ty);
    if (!T || !T.ok) return null;
    var px = c.u * T.extent, py = c.v * T.extent;
    for (var i = 0; i < T.fw.length; i++) if (inPoly(T.fw[i], px, py)) return true;
    return false;
  }
  // Tarkistus. groundFn(x, y) palauttaa maanpinnan korkeuden järven pinnasta tai null. Palauttaa null tai { reason, x, y, depth }.
  function check(S, groundFn, draft) {
    draft = draft || (root.Liike && root.Liike.SETTINGS.draftM) || 1.1;
    var a = S.hdg * Math.PI / 180, pts = [[S.x, S.y], [S.x + Math.sin(a) * HALF_LEN, S.y + Math.cos(a) * HALF_LEN]];
    for (var i = 0; i < pts.length; i++) {
      var d = depthAt(pts[i][0], pts[i][1]);
      if (d.known && d.ylin != null && d.ylin < draft) return { reason: 'matala', x: pts[i][0], y: pts[i][1], depth: d.ylin };
      if (groundFn) {
        var g = groundFn(pts[i][0], pts[i][1]);
        if (g != null && g > LAND_M) return { reason: 'maa', x: pts[i][0], y: pts[i][1], depth: -g };
      }
    }
    return null;
  }
  function clear() { tiles.clear(); pending.clear(); }
  function ready(x, y) { var c = tileOf(x, y); return tiles.has(c.tx + '/' + c.ty); }
  var api = { preload: preload, depthAt: depthAt, inFairway: inFairway, check: check, clear: clear, ready: ready, inPoly: inPoly, LAND_M: LAND_M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pohja = api;
})(typeof window !== 'undefined' ? window : globalThis);
