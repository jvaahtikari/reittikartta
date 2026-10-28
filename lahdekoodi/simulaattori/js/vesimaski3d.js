/* Simulaattori – oma vesi Google 3D -kerroksen päälle (vaihe 3n).
 *
 * Googlen kartan vesi korvataan simulaattorin omalla vedellä, mutta vain siellä missä vesi todella on: vesimaski rakennetaan maastokuvio-kerroksen
 * jarvi- ja virtavesi-polygoneista kolmioituna (sama lähde kuin maastossa, ruudut z13), enintään 5 km säteellä aluksesta. Ääretöntä vesitasoa ei piirretä,
 * joten maa ja saaret jäävät Googlen kuvan varaan. Rantaviivassa vesi ulottuu 1,5 m maan puolelle (ja saarien reunoilla 1,5 m saaren puolelle),
 * jotta Googlen vesi ei pilkota reunasta, jos rantaviivat eroavat toisistaan senttejä tai metrin. Ruutujen leikkausreunat (MVT-puskuri) pidetään paikallaan,
 * jotta ruutujen saumoihin ei tule rakoja.
 *
 * Mesh on yksi verkko (kaikki ladatut ruudut yhdistettynä), jonka kärkipisteet ovat TM35FIN-koordinaateissa kiintopisteen (REF) suhteen. Verkon paikka
 * päivitetään rebase()-kutsulla, kun maailman origo siirtyy. Materiaali annetaan ulkopuolelta (nakyma.js:n vesivarjostin), joten ulkoasu on sama kuin omassa näkymässä.
 *
 * Vaihe 3o: setHoles(alueet) tekee satama-alueista (kapselit laiturisegmenttien ympärillä ja renkaat) läpinäkyviä: reikäverkko kirjoittaa vesimaskin päälle värin ja alfan 0 (ei sekoitusta),
 * jolloin Googlen oma satama (vesi, laiturit ja veneet) näkyy sellaisenaan. Reikä ei kirjoita syvyyttä, joten myöhemmin piirrettävät kohteet (turvalaitteet) toimivat normaalisti.
 *
 * Moduuli toimii selaimessa (window.Vesimaski3D) ja Nodessa (module.exports: rengasjako ja siirto, testattavissa ilman three.js:ää). */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka, A = root.Aineisto;
  var SET = {
    z: 13,                 // maastokuvio-ruutujen zoom (ruutu noin 2,3 km)
    radiusM: 5000,         // vesi ladataan tälle säteelle aluksesta
    extendM: -1.0,         // negatiivinen: oma vesi päättyy tämän verran ennen rantaviivaa, jotta Googlen ranta, laiturit ja rantamuurit jäävät näkyviin (27.10.2026, käyttäjän palaute: talot näyttivät seisovan vedessä)
    reselectM: 250,        // ruutuvalinta tehdään uudelleen, kun alus on liikkunut tämän verran
    buffer: 80,            // MVT-ruudun puskuri (yksikköä), jonka leikkausreunat pidetään paikallaan
    refE: 327000, refN: 6823500,
    gridN: 8,              // ruudun muunnosruudukko (gridN x gridN väliä), välissä bilineaarinen
    classes: { jarvi: 1, virtavesi: 1 }
  };

  // Renkaiden ryhmittely monikulmioiksi: positiivinen ala = ulkoreuna, negatiivinen = reikä (MVT, y alaspäin). ring = Int32Array [x0, y0, x1, y1, ...] suljettuna.
  function ringArea(a) { var s = 0, n = a.length / 2; for (var i = 0; i < n - 1; i++) s += a[2 * i] * a[2 * i + 3] - a[2 * i + 2] * a[2 * i + 1]; return s / 2; }
  function groupRings(parts) {
    var polys = [], cur = null;
    for (var i = 0; i < parts.length; i++) {
      var r = parts[i]; if (r.length < 8) continue;
      var a = ringArea(r);
      if (a > 0) { cur = { outer: r, holes: [] }; polys.push(cur); }
      else if (a < 0 && cur) cur.holes.push(r);
    }
    return polys;
  }
  /* Renkaan siirto veden suunnasta pois ext yksikköä (kaikissa renkaissa suunta (dy, -dx) normalisoituna: ulkoreunalla ulos, reiällä reiän sisään). Palauttaa Float64Array [x, y, ...]
   * ilman sulkevaa toistopistettä. Leikkausreunalla (arvo -buffer tai extent + buffer) olevat pisteet eivät liiku, eikä niiden välisten reunojen normaali vaikuta naapuriin. */
  function offsetRing(r, ext, lo, hi) {
    var n = r.length / 2 - 1, out = new Float64Array(n * 2), i, tol = 1.01;
    function pinned(k) { var x = r[2 * k], y = r[2 * k + 1]; return x <= lo + tol || x >= hi - tol || y <= lo + tol || y >= hi - tol; }
    function clipEdge(a, b) {   // reuna kulkee leikkausviivaa pitkin
      var xa = r[2 * a], ya = r[2 * a + 1], xb = r[2 * b], yb = r[2 * b + 1];
      return (Math.abs(xa - lo) < tol && Math.abs(xb - lo) < tol) || (Math.abs(xa - hi) < tol && Math.abs(xb - hi) < tol) || (Math.abs(ya - lo) < tol && Math.abs(yb - lo) < tol) || (Math.abs(ya - hi) < tol && Math.abs(yb - hi) < tol);
    }
    for (i = 0; i < n; i++) {
      var ip = (i + n - 1) % n, inx = (i + 1) % n;
      out[2 * i] = r[2 * i]; out[2 * i + 1] = r[2 * i + 1];
      if (pinned(i)) continue;
      var nx = 0, ny = 0, cnt = 0, n1 = null, n2 = null;
      if (!clipEdge(ip, i)) { var dx = r[2 * i] - r[2 * ip], dy = r[2 * i + 1] - r[2 * ip + 1], l = Math.hypot(dx, dy); if (l > 0) { n1 = [dy / l, -dx / l]; } }
      if (!clipEdge(i, inx)) { var ex = r[2 * inx] - r[2 * i], ey = r[2 * inx + 1] - r[2 * i + 1], l2 = Math.hypot(ex, ey); if (l2 > 0) { n2 = [ey / l2, -ex / l2]; } }
      if (n1 && n2) {
        var dot = n1[0] * n2[0] + n1[1] * n2[1], k = 1 / Math.max(0.4, 1 + dot);   // miter, rajattu
        nx = (n1[0] + n2[0]) * k; ny = (n1[1] + n2[1]) * k; var ml = Math.hypot(nx, ny); if (ml > 2.2) { nx *= 2.2 / ml; ny *= 2.2 / ml; }
      } else if (n1) { nx = n1[0]; ny = n1[1]; } else if (n2) { nx = n2[0]; ny = n2[1]; } else continue;
      out[2 * i] += nx * ext; out[2 * i + 1] += ny * ext;
    }
    return out;
  }

  function create(scene, opts) {
    opts = opts || {};
    var mat = opts.material, set = {}; for (var k0 in SET) set[k0] = SET[k0]; if (opts.settings) for (var k1 in opts.settings) set[k1] = opts.settings[k1];
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.name = 'vesimaski'; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = -5; mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    var tiles = new Map(), queue = [], wanted = [], last = { x: 1e9, y: 1e9 }, dirty = false, version = 0, stats = { tiles: 0, loaded: 0, empty: 0, tris: 0, verts: 0, buildMs: 0, maxMs: 0, rings: 0 };
    var active = false, jobs = 0;
    // reikäverkko (vaihe 3o): kirjoittaa alfan 0 vesimaskin päälle. Sama REF-koordinaatisto kuin vesimaskissa.
    var holeMat = new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
      blending: THREE.NoBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, toneMapped: false
    });
    var holeMesh = new THREE.Mesh(new THREE.BufferGeometry(), holeMat); holeMesh.name = 'satamareika'; holeMesh.frustumCulled = false; holeMesh.visible = false; holeMesh.renderOrder = -4; holeMesh.matrixAutoUpdate = false;
    scene.add(holeMesh);
    var holeOn = false, holeInfo = { kapselit: 0, renkaat: 0, kolmiot: 0 };

    function sizeM(z, lat) { return 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z); }
    function key(z, x, y) { return z + '/' + x + '/' + y; }
    // ruudun muunnosruudukko (u, v = -0,05 ... 1,05) TM35FIN-koordinaateiksi: tarkka muunnos ruudukon pisteissä, välissä bilineaarinen
    function gridOf(z, x, y) {
      var N = set.gridN, g = new Float64Array((N + 1) * (N + 1) * 2), u0 = -0.05, du = 1.1 / N;
      for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) {
        var c = P.tileLonLat(z, x, y, u0 + i * du, u0 + j * du), en = P.lonlatToEN(c.lon, c.lat), q = (j * (N + 1) + i) * 2;
        g[q] = en.e; g[q + 1] = en.n;
      }
      return g;
    }
    function mapPt(g, u, v) {
      var N = set.gridN, fu = (u + 0.05) / 1.1 * N, fv = (v + 0.05) / 1.1 * N, i = Math.max(0, Math.min(N - 1, Math.floor(fu))), j = Math.max(0, Math.min(N - 1, Math.floor(fv))), a = fu - i, b = fv - j;
      var q00 = (j * (N + 1) + i) * 2, q10 = q00 + 2, q01 = q00 + (N + 1) * 2, q11 = q01 + 2;
      return [
        g[q00] * (1 - a) * (1 - b) + g[q10] * a * (1 - b) + g[q01] * (1 - a) * b + g[q11] * a * b,
        g[q00 + 1] * (1 - a) * (1 - b) + g[q10 + 1] * a * (1 - b) + g[q01 + 1] * (1 - a) * b + g[q11 + 1] * a * b
      ];
    }

    // Ruudun kolmioverkko: { pos: Float32Array (E - refE, 0, -(N - refN)), idx: Uint32Array }
    function buildTile(t, lyr) {
      var mk = lyr && lyr.maastokuvio; if (!mk) return null;
      var ext = mk.extent, lo = -set.buffer, hi = ext + set.buffer, g = gridOf(t.z, t.x, t.y);
      var mPerUnit = sizeM(t.z, P.tileLonLat(t.z, t.x, t.y, 0.5, 0.5).lat) / ext, extU = set.extendM / mPerUnit;
      var pos = [], idx = [], nRings = 0;
      for (var fi = 0; fi < mk.features.length; fi++) {
        var f = mk.features[fi];
        if (f.type !== 3 || !set.classes[f.props.luokka]) continue;
        var polys = groupRings(f.parts);
        for (var pi = 0; pi < polys.length; pi++) {
          var pl = polys[pi], rings = [offsetRing(pl.outer, extU, lo, hi)];
          for (var hi2 = 0; hi2 < pl.holes.length; hi2++) {
            var h = pl.holes[hi2], minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
            for (var q = 0; q < h.length; q += 2) { minx = Math.min(minx, h[q]); maxx = Math.max(maxx, h[q]); miny = Math.min(miny, h[q + 1]); maxy = Math.max(maxy, h[q + 1]); }
            // aivan pientä reikää (alle 6 m) ei siirretä sisäänpäin, ettei se kutistu käänteiseksi
            rings.push(Math.max(maxx - minx, maxy - miny) * mPerUnit < 6 ? offsetRing(h, 0, lo, hi) : offsetRing(h, extU, lo, hi));
          }
          var contour = [], holes = [], base = pos.length / 3, r, i;
          for (r = 0; r < rings.length; r++) {
            var ring = rings[r], vs = [];
            for (i = 0; i < ring.length; i += 2) {
              var en = mapPt(g, ring[i] / ext, ring[i + 1] / ext);
              pos.push(en[0] - set.refE, 0, -(en[1] - set.refN));
              vs.push(new THREE.Vector2(ring[i], ring[i + 1]));
            }
            if (r === 0) contour = vs; else holes.push(vs);
            nRings++;
          }
          var tri;
          try { tri = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { tri = []; }
          for (i = 0; i < tri.length; i++) {   // kolmion pinta ylöspäin (normaalin y positiivinen), jotta FrontSide-materiaali ei karsi sitä
            var a = tri[i], p0 = (base + a[0]) * 3, p1 = (base + a[1]) * 3, p2 = (base + a[2]) * 3;
            var ny = (pos[p1 + 2] - pos[p0 + 2]) * (pos[p2] - pos[p0]) - (pos[p1] - pos[p0]) * (pos[p2 + 2] - pos[p0 + 2]);
            if (ny >= 0) idx.push(base + a[0], base + a[1], base + a[2]); else idx.push(base + a[0], base + a[2], base + a[1]);
          }
        }
      }
      stats.rings += nRings;
      if (!idx.length) return { pos: new Float32Array(0), idx: new Uint32Array(0) };
      return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
    }

    function select(x, y) {
      last.x = x; last.y = y;
      var ll = P.worldToLonLat(x, y), t = P.lonlatToTile(ll.lon, ll.lat, set.z), sz = sizeM(set.z, ll.lat), rr = Math.ceil(set.radiusM / sz) + 1, cx = Math.floor(t.x), cy = Math.floor(t.y);
      var out = [], bw = P.lonlatToEN(ll.lon, ll.lat);
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        var tx = cx + dx, ty = cy + dy, c = P.tileLonLat(set.z, tx, ty, 0.5, 0.5), en = P.lonlatToEN(c.lon, c.lat);
        if (Math.hypot(en.e - bw.e, en.n - bw.n) - sz * 0.72 > set.radiusM) continue;
        var k = key(set.z, tx, ty), tl = tiles.get(k);
        if (!tl) { tl = { k: k, z: set.z, x: tx, y: ty, state: 'new', geo: null, d: Math.hypot(en.e - bw.e, en.n - bw.n) }; tiles.set(k, tl); }
        tl.d = Math.hypot(en.e - bw.e, en.n - bw.n); out.push(tl);
      }
      out.sort(function (a, b) { return a.d - b.d; });
      wanted = out; queue = out.filter(function (t2) { return t2.state === 'new'; });
      dirty = true;
      // muistista poistetaan kaukaiset ruudut
      if (tiles.size > 120) { var keep = new Set(out.map(function (t3) { return t3.k; })); tiles.forEach(function (t4, k4) { if (!keep.has(k4) && t4.state !== 'loading') tiles.delete(k4); }); }
    }

    function rebuild() {
      var np = 0, ni = 0, list = [];
      wanted.forEach(function (t) { if (t.state === 'ready' && t.geo && t.geo.idx.length) { list.push(t); np += t.geo.pos.length; ni += t.geo.idx.length; } });
      var pos = new Float32Array(np), idx = new Uint32Array(ni), po = 0, io = 0;
      list.forEach(function (t) {
        pos.set(t.geo.pos, po); var vo = po / 3;
        for (var i = 0; i < t.geo.idx.length; i++) idx[io + i] = t.geo.idx[i] + vo;
        po += t.geo.pos.length; io += t.geo.idx.length;
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      var old = mesh.geometry; mesh.geometry = geo; if (old) old.dispose();
      mesh.visible = active && ni > 0; stats.tris = ni / 3; stats.verts = np / 3; version++;
      placeMesh();
    }
    function placeMesh() {
      var w = P.enToWorld(set.refE, set.refN);
      mesh.position.set(w.x, 0, -w.y); mesh.updateMatrix(); mesh.matrixWorldNeedsUpdate = true;
      holeMesh.position.set(w.x, 0.04, -w.y); holeMesh.updateMatrix(); holeMesh.matrixWorldNeedsUpdate = true;
    }
    function holeVisible() { holeMesh.visible = active && holeOn && holeInfo.kolmiot > 0; }
    // Satama-alueet: alueet = { kapselit: [[e0, n0, e1, n1], ...], renkaat: [[e, n], ...], sade, veneSade } (TM35FIN). Kapseli = suorakulmio ja kaksi 16-kulmaista kiekkoa, rengas = kiekko.
    function setHoles(alueet) {
      var pos = [], R = (alueet && alueet.sade) || 60, rr = (alueet && alueet.veneSade) || 20, SEG = 16, i;
      function P3(e, n) { pos.push(e - set.refE, 0, -(n - set.refN)); }
      function disc(e, n, r) { for (var k = 0; k < SEG; k++) { var a0 = k / SEG * 2 * Math.PI, a1 = (k + 1) / SEG * 2 * Math.PI; P3(e, n); P3(e + r * Math.cos(a0), n + r * Math.sin(a0)); P3(e + r * Math.cos(a1), n + r * Math.sin(a1)); } }
      var kap = (alueet && alueet.kapselit) || [], ren = (alueet && alueet.renkaat) || [];
      for (i = 0; i < kap.length; i++) {
        var s0 = kap[i], dx = s0[2] - s0[0], dy = s0[3] - s0[1], l = Math.hypot(dx, dy);
        if (l > 0.5) { var nx = -dy / l * R, ny = dx / l * R; P3(s0[0] + nx, s0[1] + ny); P3(s0[0] - nx, s0[1] - ny); P3(s0[2] + nx, s0[3] + ny); P3(s0[2] + nx, s0[3] + ny); P3(s0[0] - nx, s0[1] - ny); P3(s0[2] - nx, s0[3] - ny); }
        disc(s0[0], s0[1], R); disc(s0[2], s0[3], R);
      }
      for (i = 0; i < ren.length; i++) disc(ren[i][0], ren[i][1], rr);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
      var old = holeMesh.geometry; holeMesh.geometry = geo; if (old) old.dispose();
      holeInfo = { kapselit: kap.length, renkaat: ren.length, kolmiot: pos.length / 9 };
      placeMesh(); holeVisible();
    }
    function setHoleActive(on) { holeOn = !!on; holeVisible(); }

    // Aikaviipale: lataa ja rakentaa enintään yhden ruudun kerrallaan
    function tick(budgetMs) {
      if (!active) return false;
      var t0 = performance.now(), changed = false;
      while (queue.length && jobs < 2 && performance.now() - t0 < budgetMs) {
        var t = queue.shift(); if (t.state !== 'new') continue;
        t.state = 'loading'; jobs++;
        (function (tl) {
          A.layers(tl.z, tl.x, tl.y, ['maastokuvio']).then(function (lyr) { tl.lyr = lyr; tl.state = 'built-wait'; jobs--; }, function () { tl.state = 'empty'; jobs--; });
        })(t);
      }
      // rakennus yksi ruutu kerrallaan
      for (var i = 0; i < wanted.length && performance.now() - t0 < budgetMs; i++) {
        var w = wanted[i];
        if (w.state !== 'built-wait') continue;
        var s = performance.now();
        if (!w.lyr) { w.state = 'empty'; stats.empty++; changed = true; continue; }
        try { w.geo = buildTile(w, w.lyr); w.state = w.geo ? 'ready' : 'empty'; } catch (e) { w.state = 'empty'; if (root.console) console.error('vesimaski', e); }
        w.lyr = null; stats.loaded++; changed = true;
        var d = performance.now() - s; stats.buildMs += d; stats.maxMs = Math.max(stats.maxMs, d);
        break;
      }
      if (changed || dirty) { dirty = false; rebuild(); }
      return changed;
    }
    function sync(x, y) {
      if (!active) return;
      if (Math.hypot(x - last.x, y - last.y) > set.reselectM) select(x, y);
    }
    function setActive(on) {
      on = !!on; if (on === active) return; active = on;
      if (!on) mesh.visible = false; else { last.x = last.y = 1e9; if (mesh.geometry.index) mesh.visible = true; }
      holeVisible();
    }
    function rebase() { placeMesh(); last.x = last.y = 1e9; }
    function idle() { return active && !queue.length && jobs === 0 && !wanted.some(function (t) { return t.state === 'built-wait' || t.state === 'loading' || t.state === 'new'; }); }
    function setMaterial(m) { mat = m; mesh.material = m; }
    function info() { return { tiles: tiles.size, wanted: wanted.length, ready: wanted.filter(function (t) { return t.state === 'ready'; }).length, empty: wanted.filter(function (t) { return t.state === 'empty'; }).length, stats: stats, visible: mesh.visible, version: version }; }
    return { mesh: mesh, holeMesh: holeMesh, sync: sync, tick: tick, setActive: setActive, setHoles: setHoles, setHoleActive: setHoleActive, holeInfo: function () { return { on: holeOn, visible: holeMesh.visible, kapselit: holeInfo.kapselit, renkaat: holeInfo.renkaat, kolmiot: holeInfo.kolmiot }; }, rebase: rebase, idle: idle, setMaterial: setMaterial, info: info, settings: set };
  }

  var api = { create: create, SETTINGS: SET, groupRings: groupRings, offsetRing: offsetRing, ringArea: ringArea };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Vesimaski3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
