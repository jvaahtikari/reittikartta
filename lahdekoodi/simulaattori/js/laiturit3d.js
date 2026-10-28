/* Simulaattori – laiturit, aallonmurtajat ja vesikivet 3D-näkymään (three.js).
 *
 * Lähde on aineistopaketin kerros vesieste (nasijarvi.pmtiles, z16-ruudut). Z16 valitaan, koska harvemmilla zoomeilla pisteet (kivet) on harvennettu pois.
 * Piirretään alle 1 500 m:n päässä aluksesta:
 *  - laituri_kapea (viiva): 2 m leveä taso, jonka kansi on 0,5 m vedenpinnan yläpuolella ja jonka reunassa on harmaa sivupinta
 *  - laituri_leveä (viiva tai alue): viiva 5 m leveänä tasona, alue sellaisenaan, samalla tavalla kuin kapea
 *  - aallonmurtaja (viiva tai alue): 1,0 m korkea harmaa kivimuuri, viivana 4 m leveä
 *  - vesikivi_pinnassa ja vesikivi_pinnan_ylapuolella (piste): pieni harmaa kivi, halkaisija 1-2 m ja korkeus 0,3-0,6 m, muoto ja koko toistuvat paikan mukaisella siemenellä
 *  - vedenalaisia kiviä, kivikoita ja matalikkoja ei piirretä.
 * Kaikki yhdeksi yhdistetyksi verkoksi (yksi piirtokutsu), joka rakennetaan uudelleen, kun alus on liikkunut yli 120 m tai uusia ruutuja on tullut.
 * Ruudun reunan puskurialueen kohteet (MVT:n kaksoiskappaleet) jätetään pois: viivat leikataan ruudun omaan alueeseen ja pisteet tarkistetaan ruudun alueelle.
 * Yksittäisten kohteiden lukumäärä lasketaan kohteen ensimmäisen pisteen perusteella, joten tiilirajan yli menevä laituri lasketaan kerran.
 * Moduulin puhtaat funktiot (tileItems ja buildGeometry) toimivat myös Nodessa testejä varten. */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka, A = root.Aineisto;
  var Z = 16, RADIUS = 1500, REBUILD_M = 120, MAX_ACTIVE = 6, MAX_TILES = 900;
  var SET = {
    narrowW: 2, wideW: 5, breakW: 4,            // leveydet (m)
    deckY: 0.5, deckBottom: -0.25,              // laiturin kannen korkeus ja sivupinnan alareuna vedenpinnasta (m)
    breakH: 1.0,                                // aallonmurtajan korkeus (m)
    rockD: [1, 2], rockH: [0.3, 0.6], rockBase: -0.3   // kiven halkaisija, korkeus ja pohjan taso (m)
  };
  var C = {
    deck: [0.70, 0.69, 0.67], side: [0.58, 0.58, 0.57], stone: [0.55, 0.55, 0.54], stoneTop: [0.62, 0.62, 0.60], rock: [0.58, 0.58, 0.56]
  };

  function hash32(a, b) { var h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; return h || 1; }
  function rng(seed) { var t = seed >>> 0; return function () { t = (t + 0x6D2B79F5) >>> 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function kindOf(laji) {
    laji = String(laji || '');
    if (laji === 'laituri_kapea') return 'narrow';
    if (/^laituri/.test(laji)) return 'wide';
    if (/aallonmurt/.test(laji)) return 'break';
    if (/vesikivi_pinnan_yl/.test(laji)) return 'above';
    if (/vesikivi_pinnassa/.test(laji)) return 'awash';
    return null;
  }

  // ---------- ruudun kohteet (TM35FIN E ja N) ----------
  // Liang-Barsky: janan osa ruudun omalla alueella [0, ext], palauttaa [t0, t1] tai null
  function clipSeg(x0, y0, x1, y1, ext) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dy = y1 - y0, p = [-dx, dx, -dy, dy], q = [x0, ext - x0, y0, ext - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  function ringArea(a) { var s = 0, n = a.length; for (var i = 0; i < n; i += 2) { var j = (i + 2) % n; s += a[i] * a[j + 1] - a[j] * a[i + 1]; } return s / 2; }
  function pointInRing(x, y, a) {
    var inside = false, n = a.length;
    for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
      var xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // layer: Aineisto.layers-tuloksen kerros vesieste. Palauttaa { segs, polys, rocks, feats } kohteista, joiden kuuluvat tälle ruudulle.
  function tileItems(z, tx, ty, layer) {
    var out = { segs: [], polys: [], rocks: [], fl: [] };
    if (!layer || !layer.features) return out;
    var ext = layer.extent || 4096;
    function en(u, v) { var ll = P.tileLonLat(z, tx, ty, u / ext, v / ext), e = P.lonlatToEN(ll.lon, ll.lat); return [e.e, e.n]; }
    for (var fi = 0; fi < layer.features.length; fi++) {
      var f = layer.features[fi], kind = kindOf(f.props && f.props.laji);
      if (!kind) continue;
      var first = f.parts && f.parts[0];
      var own = first && first.length >= 2 && first[0] >= 0 && first[0] < ext && first[1] >= 0 && first[1] < ext;   // alkupiste tämän ruudun alueella
      if (kind === 'above' || kind === 'awash') {
        if (f.type !== 1 || !own) continue;
        var q = en(first[0], first[1]);
        out.rocks.push({ k: kind, e: q[0], n: q[1] });
        continue;
      }
      if (own) { var q0 = en(first[0], first[1]); out.fl.push({ k: kind, e: q0[0], n: q0[1] }); }   // yksittäisen kohteen laskenta
      if (f.type === 2) {
        for (var pi = 0; pi < f.parts.length; pi++) {
          var a = f.parts[pi], np = a.length / 2;
          for (var s = 0; s + 1 < np; s++) {
            var c = clipSeg(a[2 * s], a[2 * s + 1], a[2 * s + 2], a[2 * s + 3], ext);
            if (!c) continue;
            var ux = a[2 * s + 2] - a[2 * s], uy = a[2 * s + 3] - a[2 * s + 1];
            var p0 = en(a[2 * s] + ux * c[0], a[2 * s + 1] + uy * c[0]), p1 = en(a[2 * s] + ux * c[1], a[2 * s + 1] + uy * c[1]);
            // jatkuvan viivan sisäpisteissä jana jatketaan puolella leveydellä (mutkan ulkokulma), ruudun rajalla ja viivan päissä ei
            out.segs.push({ k: kind, e0: p0[0], n0: p0[1], e1: p1[0], n1: p1[1], xa: s > 0 && c[0] === 0, xb: s + 2 < np && c[1] === 1, cutA: c[0] > 0, cutB: c[1] < 1 });
          }
        }
      } else if (f.type === 3) {
        // polygonin renkaat: ulkoreunat (ala > 0) ja reiät (ala < 0), jokainen reikä sille ulkoreunalle, jonka sisällä se on
        var rings = [];
        for (var ri = 0; ri < f.parts.length; ri++) {
          var r = f.parts[ri], rn = r.length;
          if (rn >= 4 && r[0] === r[rn - 2] && r[1] === r[rn - 1]) r = r.subarray(0, rn - 2);
          if (r.length < 6) continue;
          rings.push({ a: r, area: ringArea(r) });
        }
        var outers = rings.filter(function (g) { return g.area > 0; }), holes = rings.filter(function (g) { return g.area < 0; });
        outers.forEach(function (o) {
          var enr = function (g) { var arr = []; for (var i = 0; i < g.a.length; i += 2) arr.push(en(g.a[i], g.a[i + 1])); return arr; };
          var myHoles = holes.filter(function (h) { return pointInRing(h.a[0], h.a[1], o.a); }).map(enr);
          out.polys.push({ k: kind, outer: enr(o), holes: myHoles });
        });
      }
    }
    return out;
  }

  // ---------- geometria ----------
  function Acc() { this.pos = []; this.nor = []; this.col = []; this.tris = 0; }
    // Kolmio annetulla pinnan normaalilla: kärkien järjestys käännetään tarvittaessa vastapäivään normaalin suunnasta katsottuna,
  // koska Lambert-materiaali valaisee kaksipuolisen pinnan takapuolen vastakkaisella normaalilla (väärin päin oleva kolmio olisi tumma).
  Acc.prototype.tri = function (a, b, c, n, col) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) { var t = b; b = c; c = t; }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (var i = 0; i < 3; i++) { this.nor.push(n[0], n[1], n[2]); this.col.push(col[0], col[1], col[2]); }
    this.tris++;
  };
  Acc.prototype.quad = function (a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); };
  // Kolmio, jonka normaali valitaan kärkien mukaan ja käännetään osoittamaan pois pisteestä o (kupumaisen kappaleen sisäpiste)
  Acc.prototype.triN = function (a, b, c, col, o) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    var mx = (a[0] + b[0] + c[0]) / 3 - o[0], my = (a[1] + b[1] + c[1]) / 3 - o[1], mz = (a[2] + b[2] + c[2]) / 3 - o[2];
    if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    this.tri(a, b, c, [nx, ny, nz], col);
  };
function shade(col, f) { return [Math.min(1, col[0] * f), Math.min(1, col[1] * f), Math.min(1, col[2] * f)]; }

  // Jana laatikkona: kansi y = top, sivut top ... bot. (x0,z0)-(x1,z1) three-koordinaateissa (x = E, z = -N)
  function box(acc, x0, z0, x1, z1, w, top, bot, topCol, sideCol, extA, extB) {
    var dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 1e-4) return;
    var ux = dx / len, uz = dz / len, nx = -uz, nz = ux, h = w / 2;
    var ax = x0 - ux * extA, az = z0 - uz * extA, bx = x1 + ux * extB, bz = z1 + uz * extB;
    var A1 = [ax + nx * h, top, az + nz * h], A2 = [ax - nx * h, top, az - nz * h], B1 = [bx + nx * h, top, bz + nz * h], B2 = [bx - nx * h, top, bz - nz * h];
    acc.quad(A1, A2, B2, B1, [0, 1, 0], topCol);
    var A1b = [A1[0], bot, A1[2]], A2b = [A2[0], bot, A2[2]], B1b = [B1[0], bot, B1[2]], B2b = [B2[0], bot, B2[2]];
    acc.quad(A1b, B1b, B1, A1, [nx, 0, nz], sideCol);
    acc.quad(A2b, A2, B2, B2b, [-nx, 0, -nz], sideCol);
    acc.quad(A1b, A1, A2, A2b, [-ux, 0, -uz], sideCol);
    acc.quad(B1b, B2b, B2, B1, [ux, 0, uz], sideCol);
  }
  // Polygoni tasona: kansi y = top, sivut top ... bot
  function polyPrism(acc, outer, holes, oe, on, top, bot, topCol, sideCol) {
    var tx = function (p) { return [p[0] - oe, -(p[1] - on)]; };
    var o = outer.map(tx), hs = holes.map(function (h) { return h.map(tx); });
    var all = o.slice(); hs.forEach(function (h) { all = all.concat(h); });
    var V = function (p) { return new THREE.Vector2(p[0], p[1]); };
    var tri = THREE.ShapeUtils.triangulateShape(o.map(V), hs.map(function (h) { return h.map(V); }));
    for (var i = 0; i < tri.length; i++) {
      var a = all[tri[i][0]], b = all[tri[i][1]], c = all[tri[i][2]];
      acc.tri([a[0], top, a[1]], [b[0], top, b[1]], [c[0], top, c[1]], [0, 1, 0], topCol);
    }
    var wall = function (ring, hole) {
      var cx = 0, cz = 0, j; for (j = 0; j < ring.length; j++) { cx += ring[j][0]; cz += ring[j][1]; } cx /= ring.length; cz /= ring.length;
      for (j = 0; j < ring.length; j++) {
        var p = ring[j], q = ring[(j + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < 1e-4) continue;
        var nx = dz / l, nz = -dx / l, out = (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[1] + q[1]) / 2 - cz)) >= 0;   // ulospäin renkaan keskipisteestä, reiässä sisäänpäin
        if (out === !!hole) { nx = -nx; nz = -nz; }
        acc.quad([p[0], bot, p[1]], [q[0], bot, q[1]], [q[0], top, q[1]], [p[0], top, p[1]], [nx, 0, nz], sideCol);
      }
    };
    wall(o, false); hs.forEach(function (h) { wall(h, true); });
  }
  // Kivi: matala kupu (3 rengasta, 8 sivua), jonka koko ja muoto määräytyvät paikan siemenestä
  function rock(acc, x, z, seed) {
    var rnd = rng(seed), d = SET.rockD[0] + (SET.rockD[1] - SET.rockD[0]) * rnd(), h = SET.rockH[0] + (SET.rockH[1] - SET.rockH[0]) * rnd();
    var rot = rnd() * Math.PI * 2, sx = 0.5 * d * (0.85 + 0.3 * rnd()), sz = 0.5 * d * (0.85 + 0.3 * rnd()), tone = 0.88 + 0.24 * rnd();
    var NS = 8, rings = [[SET.rockBase, 1.0], [0.45 * h, 0.96], [0.88 * h, 0.58]], apex = [h, 0], R = [], i, j;
    for (j = 0; j < rings.length; j++) {
      var ring = [];
      for (i = 0; i < NS; i++) {
        var a = rot + i / NS * Math.PI * 2, jr = 0.88 + 0.24 * rnd();
        ring.push([x + Math.cos(a) * sx * rings[j][1] * jr, rings[j][0], z + Math.sin(a) * sz * rings[j][1] * jr]);
      }
      R.push(ring);
    }
    var top = [x + (rnd() - 0.5) * 0.15 * d, apex[0], z + (rnd() - 0.5) * 0.15 * d], col = shade(C.rock, tone), ctr = [x, SET.rockBase, z];
    for (j = 0; j + 1 < R.length; j++) for (i = 0; i < NS; i++) {
      var k = (i + 1) % NS, p0 = R[j][i], p1 = R[j][k], p2 = R[j + 1][k], p3 = R[j + 1][i];
      acc.triN(p0, p1, p2, col, ctr); acc.triN(p0, p2, p3, col, ctr);
    }
    var last = R[R.length - 1];
    for (i = 0; i < NS; i++) acc.triN(last[i], last[(i + 1) % NS], top, shade(col, 1.08), ctr);
  }

  // items: [tileItems-tulos, ...]. Palauttaa { geometry, stats } kohteista, joiden etäisyys (x, y) on alle radius. Koordinaatit ovat kuvan maailmakoordinaatteja (origo Paikka.getOrigin).
  function buildGeometry(list, x, y, radius, orig) {
    var oe = orig.e, on = orig.n, bx = x + oe, by = y + on, acc = new Acc();
    var st = { narrow: { feats: 0, segs: 0 }, wide: { feats: 0, segs: 0 }, break: { feats: 0, segs: 0 }, above: 0, awash: 0, polys: 0, tris: { narrow: 0, wide: 0, break: 0, rocks: 0 } };
    var r2 = radius * radius, t0;
    list.forEach(function (it) {
      var q;
      for (q = 0; q < it.segs.length; q++) {
        var s = it.segs[q], mx = (s.e0 + s.e1) / 2 - bx, my = (s.n0 + s.n1) / 2 - by;
        if (mx * mx + my * my > r2) continue;
        var w = s.k === 'narrow' ? SET.narrowW : s.k === 'wide' ? SET.wideW : SET.breakW, ext = w / 2, ca = s.cutA ? 0.05 : 0, cb = s.cutB ? 0.05 : 0;
        var tn = ((s.e0 * 7 + s.n0 * 13) % 1 + 1) % 1, tone = 0.95 + 0.1 * tn;
        t0 = acc.tris;
        if (s.k === 'break') box(acc, s.e0 - oe, -(s.n0 - on), s.e1 - oe, -(s.n1 - on), w, SET.breakH, SET.deckBottom - 0.5, shade(C.stoneTop, tone), shade(C.stone, tone), s.xa ? ext : ca, s.xb ? ext : cb);
        else box(acc, s.e0 - oe, -(s.n0 - on), s.e1 - oe, -(s.n1 - on), w, SET.deckY, SET.deckBottom, shade(C.deck, tone), C.side, s.xa ? ext : ca, s.xb ? ext : cb);
        st[s.k].segs++; st.tris[s.k] += acc.tris - t0;
      }
      for (q = 0; q < it.polys.length; q++) {
        var pg = it.polys[q], p0 = pg.outer[0], dx = p0[0] - bx, dy = p0[1] - by;
        if (dx * dx + dy * dy > r2) continue;
        t0 = acc.tris;
        if (pg.k === 'break') polyPrism(acc, pg.outer, pg.holes, oe, on, SET.breakH, SET.deckBottom - 0.5, C.stoneTop, C.stone);
        else polyPrism(acc, pg.outer, pg.holes, oe, on, SET.deckY, SET.deckBottom, C.deck, C.side);
        st.polys++; st.tris[pg.k] += acc.tris - t0;
      }
      for (q = 0; q < it.rocks.length; q++) {
        var rk = it.rocks[q], rx = rk.e - bx, ry = rk.n - by;
        if (rx * rx + ry * ry > r2) continue;
        t0 = acc.tris;
        rock(acc, rk.e - oe, -(rk.n - on), hash32(Math.round(rk.e * 20), Math.round(rk.n * 20)));
        st[rk.k]++; st.tris.rocks += acc.tris - t0;
      }
      for (q = 0; q < it.fl.length; q++) { var fk = it.fl[q], fx = fk.e - bx, fy = fk.n - by; if (fx * fx + fy * fy <= r2) st[fk.k].feats++; }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
    g.computeBoundingSphere();
    st.total = acc.tris;
    return { geometry: g, stats: st };
  }

  // ---------- 3D-kohde ----------
  function create(scene, opts) {
    opts = opts || {};
    var radius = opts.radius || RADIUS;
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.name = 'laiturit'; mesh.frustumCulled = false; mesh.visible = false; mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    var tiles = new Map(), queue = [], active = 0, dirty = true, last = { x: 1e9, y: 1e9 }, boat = { x: 0, y: 0 }, stats = null, gen = 0;

    function pump() {
      while (active < MAX_ACTIVE && queue.length) {
        var t = queue.shift(); if (t.st !== 0) continue;
        t.st = 1; active++;
        (function (t, g) {
          var done = function (it) { active--; if (g === gen) { t.items = it; t.st = 2; dirty = true; } pump(); };
          A.layers(Z, t.x, t.y, ['vesieste']).then(function (r) { done(r ? tileItems(Z, t.x, t.y, r.vesieste) : null); }, function () { done(null); });
        })(t, gen);
      }
    }
    function want() {
      var ll = P.worldToLonLat(boat.x, boat.y), tp = P.lonlatToTile(ll.lon, ll.lat, Z), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, Z);
      var rr = Math.ceil(radius / size) + 1, cx = Math.floor(tp.x), cy = Math.floor(tp.y), out = [];
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        var x = cx + dx, y = cy + dy, k = x + '/' + y;
        // ruudun lähin piste alukseen
        var ex = Math.max(0, Math.abs(x + 0.5 - tp.x) - 0.5) * size, ey = Math.max(0, Math.abs(y + 0.5 - tp.y) - 0.5) * size;
        if (Math.hypot(ex, ey) > radius) continue;
        var t = tiles.get(k);
        if (!t) { t = { key: k, x: x, y: y, st: 0, items: null, d: Math.hypot(ex, ey) }; tiles.set(k, t); queue.push(t); }
        t.used = performance.now(); out.push(t);
      }
      queue.sort(function (a, b) { return a.d - b.d; });
      if (tiles.size > MAX_TILES) {
        var arr = []; tiles.forEach(function (t) { if (t.st === 2) arr.push(t); });
        arr.sort(function (a, b) { return a.used - b.used; });
        for (var i = 0; i < arr.length && tiles.size > MAX_TILES * 0.8; i++) tiles.delete(arr[i].key);
      }
      pump();
      return out;
    }
    function rebuild(ts) {
      var list = []; ts.forEach(function (t) { if (t.st === 2 && t.items) list.push(t.items); });
      var r = buildGeometry(list, boat.x, boat.y, radius, P.getOrigin());
      var old = mesh.geometry; mesh.geometry = r.geometry; old.dispose();
      mesh.visible = r.stats.total > 0; stats = r.stats;
      last.x = boat.x; last.y = boat.y; dirty = false;
    }
    function sync(x, y, force) {
      boat.x = x; boat.y = y;
      var moved = Math.hypot(x - last.x, y - last.y);
      if (!force && !dirty && moved < REBUILD_M) return;
      var ts = want();
      if (force || dirty || moved >= REBUILD_M) rebuild(ts);
    }
    function rebase() { dirty = true; last.x = last.y = 1e9; }
    function reset() { tiles.clear(); queue.length = 0; active = 0; gen++; dirty = true; last.x = last.y = 1e9; }
    function idle() { var busy = false; tiles.forEach(function (t) { if (t.st < 2) busy = true; }); return !busy && !dirty; }
    function info() { return { tiles: tiles.size, loaded: Array.from(tiles.values()).filter(function (t) { return t.st === 2; }).length, stats: stats, visible: mesh.visible }; }
    return { mesh: mesh, sync: sync, rebase: rebase, reset: reset, idle: idle, info: info, settings: SET };
  }

  var api = { create: create, tileItems: tileItems, buildGeometry: buildGeometry, kindOf: kindOf, SETTINGS: SET, RADIUS: RADIUS, COLORS: C };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Laiturit3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
