/* Simulaattori – törmäykset laitureihin, aallonmurtajiin, vesikiviin ja siltojen pilareihin (vaihe 3k).
 *
 * Aluksen runkopolygoni (hull_offsets.json: kansiviiva, keula ja uimataso, yhteensä 13,5 m x 4,41 m, kääntöpiste mallin x = 5,0 m eli sama kuin 3D-näkymän runko)
 * tarkistetaan joka askeleella esteitä vastaan:
 *  - laituri_kapea 2 m, laituri_leveä 5 m ja aallonmurtaja 4 m leveänä suorakulmiona (sama geometria ja jatkeet kuin laiturit3d.js:n verkossa, viivat leikattu ruutuun),
 *    alueena piirretyt laiturit ja aallonmurtajat monikulmioina
 *  - vesikivi_pinnassa ja vesikivi_pinnan_ylapuolella ympyränä, jonka halkaisija on 1,5 m
 *  - sillan pilarit 1,5 m neliöinä (sama sijoittelu kuin sillat3d.js:ssä: 25 m välein veden päällä, leveällä kannella 2-3 rinnakkain)
 * Esteet luetaan z16-ruuduista (vesieste-kerros, Laiturit3D.tileItems) alle 300 m:n päästä aluksesta ja pidetään TM35FIN-koordinaateissa (E, N), joten maailmakoordinaatiston
 * origon siirto ei vaikuta niihin. Sillat saadaan Sillat3D-moduulilta (spans), jotta vain 3D-näkymässä piirretyt pilarit ovat esteitä.
 *
 * Päätös (nopeus): kosketus alle 1,0 kn nopeudella on "kosketus", yli 1,0 kn on "törmäys". Päätöksen tekee kutsuja (sim.js), tämä moduuli palauttaa osuman ja
 * nopeusrajan. Moduulin puhtaat funktiot (hullPolygon, intersectHull, rectFrom, buildTile) toimivat myös Nodessa testejä varten. */
(function (root) {
  'use strict';
  var Z = 16, MAX_TILES = 120, RADIUS = 300, ROCK_R = 0.75, EXT_CUT = 0.05, PIVOT_X = 5.0, TOUCH_KN = 1.0;
  var WIDTH = { narrow: 2, wide: 5, brk: 4 };   // laiturit3d.js:n SET-leveydet, päivitetään moduulista, jos se on ladattu
  var PIER = { w: 1.5, step: 25 };               // sillat3d.js:n pierW ja pierStep
  var KIND_NAME = { laituri: 'Laituri', aallonmurtaja: 'Aallonmurtaja', kivi: 'Vesikivi', pilari: 'Sillan pilari' };
  var KIND_ACC = { laituri: 'laituriin', aallonmurtaja: 'aallonmurtajaan', kivi: 'vesikiveen', pilari: 'sillan pilariin' };

  // ---------- runkopolygoni ----------
  // Kansiviivan puolileveys (hull_offsets.json deck_edge, mallin x peräpeilistä keulaan), keulan kärki (stem) ja uimataso (swim_platform). y positiivinen oikealle (SB).
  var DECK = [[0.0, 2.2053], [1.0, 2.2053], [2.0, 2.2065], [3.0, 2.2082], [4.0, 2.2087], [5.0, 2.2017], [6.0, 2.1655], [7.0, 2.0834], [8.0, 1.9397], [9.0, 1.7327], [10.0, 1.463], [11.0, 1.1123], [12.0, 0.5389], [12.25, 0.02]];
  var BOW_X = 12.257, PLATFORM = [[0.0, 1.87], [-1.26, 1.36]];   // uimataso: puolileveys peräpeilissä 1,87 m ja perässä 1,36 m
  // Palauttaa polygonin kärjet [x, y] aluksen koordinaatistossa (x eteen kääntöpisteestä, y oikealle), vastapäivään katsottuna ylhäältä (x oikealle, y ylös: y = vasen)
  function hullPolygon() {
    var sb = [], pts = [], i;
    sb.push([BOW_X - PIVOT_X, 0]);
    for (i = DECK.length - 1; i >= 0; i--) sb.push([DECK[i][0] - PIVOT_X, DECK[i][1]]);
    sb.push([PLATFORM[0][0] - PIVOT_X, PLATFORM[0][1]], [PLATFORM[1][0] - PIVOT_X, PLATFORM[1][1]]);
    // oikea laita keulasta perään, sitten vasen laita perästä keulaan
    for (i = 0; i < sb.length; i++) pts.push([sb[i][0], sb[i][1]]);
    for (i = sb.length - 1; i >= 1; i--) pts.push([sb[i][0], -sb[i][1]]);
    return pts;
  }
  var HULL = hullPolygon(), NH = HULL.length;
  var HULL_R = 0;
  (function () { for (var i = 0; i < NH; i++) HULL_R = Math.max(HULL_R, Math.hypot(HULL[i][0], HULL[i][1])); HULL_R += 0.05; })();

  // Aluksen runkopolygoni TM35FIN-koordinaateissa. e, n on kääntöpisteen paikka, hdgGrid ruutusuunta asteina.
  function worldHull(e, n, hdgGrid, out) {
    var a = hdgGrid * Math.PI / 180, sf = Math.sin(a), cf = Math.cos(a), i, xv, yv;
    out = out || new Float64Array(NH * 2);
    for (i = 0; i < NH; i++) {
      xv = HULL[i][0]; yv = HULL[i][1];            // eteen xv, oikealle yv
      out[2 * i] = e + sf * xv + cf * yv;
      out[2 * i + 1] = n + cf * xv - sf * yv;
    }
    return out;
  }

  // ---------- geometria ----------
  function pointInPoly(h, nh, x, y) {   // h: Float64Array [x0, y0, x1, y1, ...]
    var inside = false;
    for (var i = 0, j = nh - 1; i < nh; j = i++) {
      var xi = h[2 * i], yi = h[2 * i + 1], xj = h[2 * j], yj = h[2 * j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  }
  // Jana (x0,y0)-(x1,y1) leikkaa suorakulmion [-a, a] x [-b, b] (Liang-Barsky), päätepisteet laskettuna mukaan
  function segHitsBox(x0, y0, x1, y1, a, b) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dy = y1 - y0, p = [-dx, dx, -dy, dy], q = [x0 + a, a - x0, y0 + b, b - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  }
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    var d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy, den = d1x * d2y - d1y * d2x;
    if (den === 0) return false;
    var t = ((cx - ax) * d2y - (cy - ay) * d2x) / den, u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  // ---------- esteet ----------
  // Suorakulmio: keskipiste (cx, cy), yksikkövektori u (pitkittäinen), puolipituus a ja puolileveys b, kehän säde rad
  function rectFrom(e0, n0, e1, n1, w, extA, extB, kind) {
    var dx = e1 - e0, dy = n1 - n0, len = Math.hypot(dx, dy); if (len < 1e-4) return null;
    var ux = dx / len, uy = dy / len, ax = e0 - ux * extA, ay = n0 - uy * extA, bx = e1 + ux * extB, by = n1 + uy * extB;
    var a = Math.hypot(bx - ax, by - ay) / 2, b = w / 2;
    return { t: 'r', kind: kind, cx: (ax + bx) / 2, cy: (ay + by) / 2, ux: ux, uy: uy, a: a, b: b, rad: Math.hypot(a, b) };
  }
  function ringBox(ring) {
    var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    for (var i = 0; i < ring.length; i++) { var p = ring[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rad: Math.hypot(x1 - x0, y1 - y0) / 2 };
  }
  // Laiturit3D.tileItems-tuloksesta esteet: { segs, polys, rocks } -> lista
  function buildTile(items) {
    var obs = [], i, W = root.Laiturit3D && root.Laiturit3D.SETTINGS ? root.Laiturit3D.SETTINGS : null;
    var wN = W ? W.narrowW : WIDTH.narrow, wW = W ? W.wideW : WIDTH.wide, wB = W ? W.breakW : WIDTH.brk;
    (items.segs || []).forEach(function (s) {
      var w = s.k === 'narrow' ? wN : s.k === 'wide' ? wW : wB, ext = w / 2;
      var r = rectFrom(s.e0, s.n0, s.e1, s.n1, w, s.xa ? ext : (s.cutA ? EXT_CUT : 0), s.xb ? ext : (s.cutB ? EXT_CUT : 0), s.k === 'break' ? 'aallonmurtaja' : 'laituri');
      if (r) obs.push(r);
    });
    (items.polys || []).forEach(function (p) {
      var bb = ringBox(p.outer);
      obs.push({ t: 'p', kind: p.k === 'break' ? 'aallonmurtaja' : 'laituri', outer: p.outer, holes: p.holes || [], cx: bb.cx, cy: bb.cy, rad: bb.rad });
    });
    (items.rocks || []).forEach(function (r) { obs.push({ t: 'c', kind: 'kivi', cx: r.e, cy: r.n, r: ROCK_R, rad: ROCK_R }); });
    return obs;
  }
  // Sillan pilarit Sillat3D.spans()-listasta (sama sijoittelu kuin sillat3d.js:n addSpan-funktiossa)
  function pointAt(sp, s) {
    var S = sp.S, lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    var d = S[hi] - S[lo], f = d > 1e-9 ? Math.min(1, Math.max(0, (s - S[lo]) / d)) : 0;
    return { e: sp.E[lo] + (sp.E[hi] - sp.E[lo]) * f, n: sp.N[lo] + (sp.N[hi] - sp.N[lo]) * f, w: f < 0.5 ? sp.W[lo] : sp.W[hi] };
  }
  function pierObstacles(spans, widthOf) {
    var out = [], SB = root.Sillat3D && root.Sillat3D.SETTINGS ? root.Sillat3D.SETTINGS : null, pw = (SB ? SB.pierW : PIER.w) / 2, step = SB ? SB.pierStep : PIER.step;
    (spans || []).forEach(function (sp) {
      var hw = widthOf(sp.k) / 2, ncol = hw * 2 >= 10 ? 3 : hw * 2 >= 7 ? 2 : 1, L = sp.L;
      for (var s = step / 2; s < L; s += step) {
        var q = pointAt(sp, s); if (!q.w) continue;
        var q2 = pointAt(sp, Math.min(L, s + 1)), q1 = pointAt(sp, Math.max(0, s - 1)), tx = q2.e - q1.e, ty = q2.n - q1.n, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        var nx = ty, ny = -tx;                                   // oikea normaali (sama kuin sillat3d.js:n (nx, nz) = (-tz, tx) kun z = -N)
        for (var k = 0; k < ncol; k++) {
          var off = ncol === 1 ? 0 : (k - (ncol - 1) / 2) * ((hw * 2 - 3) / (ncol - 1));
          out.push({ t: 'r', kind: 'pilari', cx: q.e + nx * off, cy: q.n + ny * off, ux: tx, uy: ty, a: pw, b: pw, rad: pw * Math.SQRT2 });
        }
      }
    });
    return out;
  }

  // ---------- osumatesti ----------
  // Palauttaa null tai { pen, e, n }: pen = suurin tunkeuma metreinä, (e, n) = syvimmin esteessä oleva rungon kärki (tai esteen keskipiste)
  function hitRect(H, ob) {
    var ux = ob.ux, uy = ob.uy, vx = -uy, vy = ux, a = ob.a, b = ob.b, i, px, py, cnt = [];
    var lx = new Array(NH), ly = new Array(NH), any = false, best = -1, be = ob.cx, bn = ob.cy;
    for (i = 0; i < NH; i++) {
      var dx = H[2 * i] - ob.cx, dy = H[2 * i + 1] - ob.cy;
      px = dx * ux + dy * uy; py = dx * vx + dy * vy; lx[i] = px; ly[i] = py;
      if (px > -a && px < a && py > -b && py < b) {
        any = true; var d = Math.min(a - Math.abs(px), b - Math.abs(py));
        if (d > best) { best = d; be = H[2 * i]; bn = H[2 * i + 1]; }
      }
    }
    var cross = false;
    if (!any) {
      for (i = 0; i < NH; i++) { var j = (i + 1) % NH; if (segHitsBox(lx[i], ly[i], lx[j], ly[j], a, b)) { cross = true; break; } }
    }
    var inside = false;
    if (!any && !cross) {   // este kokonaan rungon sisällä (pieni pilari tai kivi keskilaivassa)
      inside = pointInPoly(H, NH, ob.cx, ob.cy);
    }
    if (!any && !cross && !inside) return null;
    if (!any) {   // ei yhtään rungon kärkeä esteessä: tunkeuma lasketaan esteen kulmien syvyydestä rungossa
      best = 0.05;
      var cs = [[a, b], [a, -b], [-a, b], [-a, -b]];
      for (i = 0; i < 4; i++) {
        var wx = ob.cx + cs[i][0] * ux + cs[i][1] * vx, wy = ob.cy + cs[i][0] * uy + cs[i][1] * vy;
        if (pointInPoly(H, NH, wx, wy)) {
          var dm = 1e18; for (var k = 0; k < NH; k++) { var k2 = (k + 1) % NH; dm = Math.min(dm, distSeg(wx, wy, H[2 * k], H[2 * k + 1], H[2 * k2], H[2 * k2 + 1])); }
          if (dm > best) { best = dm; be = wx; bn = wy; }
        }
      }
    }
    return { pen: best, e: be, n: bn };
  }
  function hitCircle(H, ob) {
    var dm = 1e18, i, j;
    for (i = 0; i < NH; i++) { j = (i + 1) % NH; dm = Math.min(dm, distSeg(ob.cx, ob.cy, H[2 * i], H[2 * i + 1], H[2 * j], H[2 * j + 1])); }
    var inside = pointInPoly(H, NH, ob.cx, ob.cy);
    if (!inside && dm > ob.r) return null;
    return { pen: inside ? ob.r + dm : ob.r - dm, e: ob.cx, n: ob.cy };
  }
  function ringHit(H, ring) {
    var n = ring.length, i, j, k, l;
    for (i = 0, j = n - 1; i < n; j = i++) {
      for (k = 0; k < NH; k++) { l = (k + 1) % NH; if (segSeg(ring[j][0], ring[j][1], ring[i][0], ring[i][1], H[2 * k], H[2 * k + 1], H[2 * l], H[2 * l + 1])) return true; }
    }
    return false;
  }
  function inRing(ring, x, y) {
    var inside = false, n = ring.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function hitPoly(H, ob) {
    var i, j, vin = false, be = ob.cx, bn = ob.cy, cross = ringHit(H, ob.outer);
    for (i = 0; i < ob.holes.length && !cross; i++) cross = ringHit(H, ob.holes[i]);
    for (i = 0; i < NH; i++) {
      var x = H[2 * i], y = H[2 * i + 1];
      if (inRing(ob.outer, x, y)) {
        var inHole = false; for (j = 0; j < ob.holes.length; j++) if (inRing(ob.holes[j], x, y)) { inHole = true; break; }
        if (!inHole) { vin = true; be = x; bn = y; break; }
      }
    }
    var cin = !vin && !cross && pointInPoly(H, NH, ob.outer[0][0], ob.outer[0][1]);   // este kokonaan rungon sisällä
    if (!vin && !cross && !cin) return null;
    return { pen: vin ? 0.5 : 0.1, e: be, n: bn };
  }
  function hitObstacle(H, ob) {
    return ob.t === 'r' ? hitRect(H, ob) : ob.t === 'c' ? hitCircle(H, ob) : hitPoly(H, ob);
  }
  // Etsii suurimman tunkeuman esteistä (lista), joiden kehä on rungon kehän sisällä. e, n = kääntöpisteen paikka.
  function intersectHull(H, e, n, list, best) {
    for (var q = 0; q < list.length; q++) {
      var ob = list[q], dx = ob.cx - e, dy = ob.cy - n, rr = HULL_R + ob.rad;
      if (dx * dx + dy * dy > rr * rr) continue;
      var h = hitObstacle(H, ob);
      if (h && (!best || h.pen > best.pen)) best = { kind: ob.kind, pen: h.pen, e: h.e, n: h.n };
    }
    return best;
  }

  // ---------- ruudut ja tila ----------
  var tiles = new Map(), pending = new Set(), bridgeSrc = null, bridgeCache = { spans: null, obs: [] }, scratch = new Float64Array(NH * 2);
  function P() { return root.Paikka; }
  function tileOfEN(e, n) {
    var ll = P().enToLonLat(e, n), t = P().lonlatToTile(ll.lon, ll.lat, Z);
    return { tx: Math.floor(t.x), ty: Math.floor(t.y), fx: t.x, fy: t.y, lat: ll.lat };
  }
  function ensure(tx, ty) {
    var k = tx + '/' + ty;
    if (tiles.has(k) || pending.has(k)) return;
    pending.add(k);
    root.Aineisto.layers(Z, tx, ty, ['vesieste']).then(function (l) {
      var items = l && l.vesieste ? root.Laiturit3D.tileItems(Z, tx, ty, l.vesieste) : { segs: [], polys: [], rocks: [] };
      tiles.set(k, { obs: buildTile(items), ok: !!l });
      pending.delete(k);
      if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value);
    }, function () { pending.delete(k); });
  }
  // Lataa ruudut, joiden lähin piste on alle r (oletus 300 m) päässä pisteestä (e, n) TM35FIN-metreinä
  function preloadEN(e, n, r) {
    r = r || RADIUS;
    var c = tileOfEN(e, n), size = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, Z), k = Math.ceil(r / size) + 1;
    for (var dy = -k; dy <= k; dy++) for (var dx = -k; dx <= k; dx++) {
      var tx = c.tx + dx, ty = c.ty + dy, ex = Math.max(0, Math.abs(tx + 0.5 - c.fx) - 0.5) * size, ey = Math.max(0, Math.abs(ty + 0.5 - c.fy) - 0.5) * size;
      if (Math.hypot(ex, ey) <= r) ensure(tx, ty);
    }
  }
  function preload(x, y, r, orig) { var o = orig || P().getOrigin(); preloadEN(x + o.e, y + o.n, r); }
  function idle() { return pending.size === 0; }
  function ready(x, y, orig) {
    var o = orig || P().getOrigin(), c = tileOfEN(x + o.e, y + o.n);
    return tiles.has(c.tx + '/' + c.ty);
  }
  function clear() { tiles.clear(); pending.clear(); bridgeCache = { spans: null, obs: [] }; }
  // Sillat: lähde palauttaa Sillat3D-kohteen spans()-listan. Pilarit lasketaan uudelleen vain, kun lista vaihtuu.
  function setBridgeSource(fn) { bridgeSrc = fn; }
  function bridgeObs() {
    var sp = bridgeSrc ? bridgeSrc() : null;
    if (sp !== bridgeCache.spans) {
      bridgeCache = { spans: sp, obs: sp && root.Sillat3D ? pierObstacles(sp, root.Sillat3D.widthOf) : [] };
    }
    return bridgeCache.obs;
  }
  // Lisää esteet käsin (testit): avain ja Laiturit3D.tileItems-tulos. Avain '*' tarkistetaan aina, muuten avain on ruudun x/y
  function addItems(key, items) { tiles.set(key, { obs: buildTile(items), ok: true }); }
  function addObstacles(key, obs) { tiles.set(key, { obs: obs, ok: true }); }

  // Törmäystarkistus. S on Liike-tila (x, y maailmakoordinaatteja, hdg ruutusuunta), orig = { e, n } (oletus Paikka.getOrigin()).
  // Palauttaa null tai { kind, pen, e, n, x, y, kn }. kn on aluksen nopeus solmuina.
  function check(S, orig) {
    var o = orig || P().getOrigin(), e = S.x + o.e, n = S.y + o.n, c = tileOfEN(e, n), best = null, H = worldHull(e, n, S.hdg, scratch);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var t = tiles.get((c.tx + dx) + '/' + (c.ty + dy)); if (t) best = intersectHull(H, e, n, t.obs, best);
    }
    var man = tiles.get('*'); if (man) best = intersectHull(H, e, n, man.obs, best);   // käsin lisätyt (testit)
    var bo = bridgeObs(); if (bo.length) best = intersectHull(H, e, n, bo, best);
    if (!best) return null;
    best.x = best.e - o.e; best.y = best.n - o.n; best.kn = Math.abs(S.v) / (1852 / 3600);
    return best;
  }
  // Ratkaisu askeleelle: S on juuri edistetty tila ja prev edellinen (törmäämätön) asento { x, y, hdg }. Jos runko osuu esteeseen, alus pysäytetään edelliseen asentoon
  // (runko ei tunkeudu esteeseen) ja nopeus ja kierto nollataan. Palauttaa null tai { kind, pen, e, n, x, y, kn, type }, jossa type on 'kosketus' (nopeus alle TOUCH_KN)
  // tai 'tormays'. Jos edellinen asento oli jo esteen päällä (esim. lähtö esteen kohdalta), osumaa ei huomioida, jotta alus pääsee irti.
  function resolve(S, prev, orig) {
    var hit = check(S, orig); if (!hit) return null;
    if (prev) {
      if (check({ x: prev.x, y: prev.y, hdg: prev.hdg, v: 0 }, orig)) return null;
      S.x = prev.x; S.y = prev.y; S.hdg = prev.hdg;
    }
    hit.type = hit.kn < TOUCH_KN ? 'kosketus' : 'tormays';
    S.v = 0; S.rate = 0;
    return hit;
  }
  var api = {
    check: check, resolve: resolve, preload: preload, preloadEN: preloadEN, idle: idle, ready: ready, clear: clear, setBridgeSource: setBridgeSource, addItems: addItems, addObstacles: addObstacles,
    hullPolygon: hullPolygon, worldHull: worldHull, rectFrom: rectFrom, buildTile: buildTile, pierObstacles: pierObstacles, intersectHull: intersectHull, hitObstacle: hitObstacle,
    TOUCH_KN: TOUCH_KN, RADIUS: RADIUS, ROCK_R: ROCK_R, HULL_R: HULL_R, KIND_NAME: KIND_NAME, KIND_ACC: KIND_ACC, info: function () { return { tiles: tiles.size, pending: pending.size, obstacles: Array.from(tiles.values()).reduce(function (a, t) { return a + t.obs.length; }, 0) }; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tormays = api;
})(typeof window !== 'undefined' ? window : globalThis);
