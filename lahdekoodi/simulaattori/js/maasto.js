/* Simulaattori – maasto kuljettajan näkymään (three.js).
 *
 * Maasto on nelipuu: juuret ovat z12-ruutuja, ja aluksen lähellä ruutu jaetaan neljään aina z16:een asti.
 * Jokainen solmu on yksi korkeuskenttäverkko (CELLS x CELLS ruutua) ja yksi peiteteksturi.
 * Maastoverkko käyttää vain maanpinnan korkeutta (maasto.pmtiles). Puusto on erillinen latvuskerros (n.cmesh) metsämaan päällä:
 * puuston keskipituus (puusto.pmtiles) maanpinnan yläpuolella siellä, missä latvuspeitto on vähintään 30 %, ja alle 1 ha:n saarilla enintään 10 m. Järven pinta on 95,5 m N2000 ja kuvassa y = 0, joten maailman y = korkeus - 95,5.
 * Lähdeaineiston vesialueet (korkeus alle 95,75 m) painetaan veden alle, jotta vesitaso peittää ne.
 * Pintamallin ohuet piikit (piiput, torni) poistetaan mediaanisuodatuksella ja maamerkkien kohdalla tasaamalla,
 * koska ne mallinnetaan erikseen mitoista.
 * Verkot rakennetaan aikaviipaleissa (aikabudjetti kuvaa kohden), eikä lataus pysäytä piirtoa. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var P = root.Paikka, A = root.Aineisto;
  var CELLS_Z = { 12: 20, 13: 24, 14: 28, 15: 36, 16: 36 }, TEXN = 256;   // verkon ruutujen määrä sivulla solmun zoomin mukaan
  var Z_MIN = 12, Z_MAX = 16;
  var SPLIT = { 12: 4000, 13: 2000, 14: 900, 15: 380 };   // solmu jaetaan, jos sen lähin etäisyys alukseen on alle tämän (m)
  var MAX_DIST = 6000;                                      // kauempana olevia ruutuja ei piirretä (määrittely: 6 km säde)
  var LAKE = P.LAKE_Z, WATERMAX = LAKE + 0.25, WATERFLOOR = LAKE - 1.5;
  var MAX_BUILT = 150, MAX_ACTIVE = 3;
  var TREE_FACTOR = 0.9, TREE_MIN_CANOPY = 20;
  var CANOPY_MIN = 30, ISLET_AREA_M2 = 10000, ISLET_CANOPY_MAX = 10;   // latvuskerros: vähintään 30 % peittoa, alle 1 ha:n saarilla enintään 10 m
  var canopyMat = null;

  var COVER = {
    forest: '#3f6234', open: '#9bb25c', kallio: '#7a8068', pelto: '#cdb867', niitty: '#b3bf67', puisto: '#78a158', puutarha: '#a3b96d',
    taajama: '#8f9b7d', urheilu_virkistys: '#8db45e', autoliikenne: '#7a7a7a', suo: '#7f9461', soistuma: '#7f9461', varastoalue: '#9a9d8a',
    hautausmaa: '#6c9556', lentokentta: '#a9b07b', hietikko: '#d8cc9a', maatuva_vesialue: '#5f8f78', jarvi: '#3f6e8c', virtavesi: '#3f6e8c'
  };

  // Järven pohjaksi painetut pisteet (y alle -1) viedään kauempana syvemmälle, koska syvyyspuskurin erotuskyky heikkenee
  // etäisyyden neliössä, ja muuten vesitaso ja maaston vesialueet vilkkuisivat (z-fighting) kaukana.
  function lakeFloorShader(shader) {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n float dd = length((modelMatrix * vec4(position, 1.0)).xz - cameraPosition.xz);\n if (position.y < -1.0) transformed.y -= dd * dd * 8.0e-7;');
  }
  // Yhtenäisten maa-alueiden (8-naapuruus) pinta-ala: alle 1 ha:n saarilla, jotka eivät kosketa ruudun reunaa, latvuskerros rajataan.
  function islandCap(g, tht, N1, CELLS, cellM) {
    var seen = new Uint8Array(N1 * N1), stack = [], comp = [];
    for (var s0 = 0; s0 < g.length; s0++) {
      if (seen[s0] || g[s0] <= WATERMAX) continue;
      comp.length = 0; stack.length = 0; stack.push(s0); seen[s0] = 1; var border = false;
      while (stack.length) {
        var c = stack.pop(); comp.push(c);
        var ci = c % N1, cj = (c - ci) / N1;
        if (ci === 0 || cj === 0 || ci === CELLS || cj === CELLS) border = true;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni > CELLS || nj > CELLS) continue;
          var nk = nj * N1 + ni; if (seen[nk] || g[nk] <= WATERMAX) continue;
          seen[nk] = 1; stack.push(nk);
        }
      }
      if (!border && comp.length * cellM * cellM < ISLET_AREA_M2) for (var q = 0; q < comp.length; q++) if (tht[comp[q]] > ISLET_CANOPY_MAX) tht[comp[q]] = ISLET_CANOPY_MAX;
    }
  }
  function getCanopyMat() {
    if (!canopyMat) canopyMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    return canopyMat;
  }
  // Latvuskerros: yksi pystyseinäinen laatikko jokaista latvuspeitteistä verkkopistettä kohti (sivu = verkon ruudun koko, yläpinta = maanpinta + puuston keskipituus).
  // Naapurilaatikoiden väliset seinät jätetään pois, ja alapää ulottuu maanpinnan ja ranta-alueen alle, joten puusto seisoo maassa eikä leiju.
  function buildCanopy(n, geo, gm, tht, tcv, CELLS, N1, cellM) {
    var src = geo.attributes.position.array, half = cellM * 0.5, pos = [], nor = [], col = [], cnt = 0;
    var DX = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
    // latvuksen korkeuteen lisätään pieni vaihtelu (±15 %), ettei metsä näytä tasaiselta laatikolta
    function topOf(k) { return gm[k] - LAKE + tht[k] * (0.85 + 0.3 * (((k * 2654435761) >>> 7) % 100) / 100); }
    function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, c) {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (var q = 0; q < 6; q++) { nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); }
    }
    for (var j = 0; j <= CELLS; j++) for (var i = 0; i <= CELLS; i++) {
      var k = j * N1 + i; if (!(tht[k] > 0)) continue;
      var x = src[k * 3], z = src[k * 3 + 2], top = topOf(k);
      var cc = Math.min(100, tcv[k]) / 100, hm = Math.min(25, tht[k]) / 25;
      var kk = 0.62 + 0.3 * (1 - cc) - 0.15 * hm + ((k * 37) % 7) / 7 * 0.1;
      var c = [(52 + 56 * kk) / 255, (82 + 62 * kk) / 255, (44 + 36 * kk) / 255], cs = [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92];
      quad(x - half, top, z - half, x - half, top, z + half, x + half, top, z + half, x + half, top, z - half, 0, 1, 0, c); cnt++;
      for (var d = 0; d < 4; d++) {
        var ni = i + DX[d], nj = j + DJ[d], nk = (ni < 0 || nj < 0 || ni > CELLS || nj > CELLS) ? -1 : nj * N1 + ni, y0;
        if (nk >= 0 && tht[nk] > 0) { y0 = topOf(nk); if (top - y0 < 0.3) continue; }
        else y0 = Math.min(gm[k], nk >= 0 ? gm[nk] : gm[k]) - LAKE - 0.5;
        var ex = DX[d] * half, ez = DJ[d] * half, px = -DJ[d] * half, pz = DX[d] * half;   // seinän keskipiste ja sivusuunta
        quad(x + ex - px, y0, z + ez - pz, x + ex + px, y0, z + ez + pz, x + ex + px, top, z + ez + pz, x + ex - px, top, z + ez - pz, DX[d], 0, DJ[d], cs); cnt++;
      }
    }
    if (!cnt) return null;
    var cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    cg.computeBoundingSphere(); cg.computeBoundingBox();
    var cm = new THREE.Mesh(cg, getCanopyMat());
    cm.userData.node = n; cm.frustumCulled = true; cm.matrixAutoUpdate = false;
    return cm;
  }
  function sizeM(z, lat) { return 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z); }

  // ---------- korkeus- ja puustoruutujen apurit ----------
  var hCache = new Map();
  function demHeights(kind, z, x, y) {
    var key = kind + '/' + z + '/' + x + '/' + y;
    if (hCache.has(key)) return Promise.resolve(hCache.get(key));
    return A.png(kind, z, x, y).then(function (img) {
      var out = null;
      if (img) out = { w: img.w, h: img.h, v: A.terrainHeights(img) };
      hCache.set(key, out);
      if (hCache.size > 60) hCache.delete(hCache.keys().next().value);
      return out;
    });
  }
  var tCache = new Map();
  function treeImg(z, x, y) {
    var key = z + '/' + x + '/' + y;
    if (tCache.has(key)) return Promise.resolve(tCache.get(key));
    return A.png('tree', z, x, y).then(function (img) {
      tCache.set(key, img);
      if (tCache.size > 30) tCache.delete(tCache.keys().next().value);
      return img;
    });
  }
  // bilinear, NaN jos jokin neljästä on NaN
  function sampleH(g, fx, fy) {
    var w = g.w, h = g.h, px = fx * w - 0.5, py = fy * h - 0.5;
    if (px < 0) px = 0; else if (px > w - 1) px = w - 1;
    if (py < 0) py = 0; else if (py > h - 1) py = h - 1;
    var x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = px - x0, ty = py - y0, v = g.v;
    var a = v[y0 * w + x0], b = v[y0 * w + x1], c = v[y1 * w + x0], d = v[y1 * w + x1];
    if (a !== a || b !== b || c !== c || d !== d) return NaN;
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  function sampleValid(g, fx, fy) {   // lähin pikseli
    var w = g.w, h = g.h, px = Math.min(w - 1, Math.max(0, Math.floor(fx * w))), py = Math.min(h - 1, Math.max(0, Math.floor(fy * h)));
    return g.v[py * w + px];
  }
  function median5(a, b, c, d, e) {
    var s = [a, b, c, d, e].sort(function (p, q) { return p - q; });
    return s[2];
  }

  function create(scene, opts) {
    opts = opts || {};
    var group = new THREE.Group(); group.name = 'maasto'; scene.add(group);
    var nodes = new Map(), roots = [], jobs = [], queue = [], shown = [];
    var boat = { x: 0, y: 0 }, gate = false, flatten = [], dirty = true, lastSel = { x: 1e9, y: 1e9 };
    var stats = { built: 0, empty: 0, builds: 0, buildMs: 0, maxJobMs: 0, jobsDone: 0 };
    var wireframe = false;
    var useBuildings = opts.buildings !== false;
    var baseLat = 61.5;

    function key(z, x, y) { return z + '/' + x + '/' + y; }
    function getNode(z, x, y) {
      var k = key(z, x, y), n = nodes.get(k);
      if (n) return n;
      var c = P.tileLonLat(z, x, y, 0.5, 0.5), en = P.lonlatToEN(c.lon, c.lat);
      n = { key: k, z: z, x: x, y: y, cells: CELLS_Z[z], n1: CELLS_Z[z] + 1, e: en.e, n: en.n, size: sizeM(z, c.lat), state: 'new', mesh: null, bmesh: null, cmesh: null, hgrid: null, ggrid: null, children: null, last: 0, noKids: false };
      nodes.set(k, n);
      return n;
    }
    function kids(n) {
      if (!n.children) {
        var z = n.z + 1, x = n.x * 2, y = n.y * 2;
        n.children = [getNode(z, x, y), getNode(z, x + 1, y), getNode(z, x, y + 1), getNode(z, x + 1, y + 1)];
      }
      return n.children;
    }
    function nearDist(n) {
      var w = P.enToWorld(n.e, n.n);
      return Math.max(0, Math.hypot(w.x - boat.x, w.y - boat.y) - n.size * 0.62);
    }
    function shouldSplit(n) { return n.z < Z_MAX && nearDist(n) < SPLIT[n.z]; }
    function isDone(n) { return n.state === 'built' || n.state === 'empty' || n.state === 'water'; }

    // ---------- solmun rakennus ----------
    function* buildGen(n) {
      var t0 = performance.now();
      var CELLS = n.cells, N1 = n.n1;
      var z = n.z, zd = Math.min(z, 14), sc = Math.pow(2, z - zd), dx = Math.floor(n.x / sc), dy = Math.floor(n.y / sc);
      var zt = Math.min(Math.max(z, 10), 14), sct = Math.pow(2, z - zt), tdx = Math.floor(n.x / sct), tdy = Math.floor(n.y / sct);
      var res = null;
      var wantB = useBuildings && z >= 15;
      var names = ['maastokuvio', 'tie'].concat(wantB ? ['rakennus'] : []);
      var pr = Promise.all([demHeights('dem', zd, dx, dy), Promise.resolve(null), z >= 10 ? treeImg(zt, tdx, tdy) : Promise.resolve(null)]).then(function (r) { res = r; });
      yield pr;
      var dem = res[0], surf = res[1], tree = res[2];
      if (!dem) { n.state = 'water'; return; }
      var tStart = performance.now();
      // --- korkeudet ---
      var h = new Float32Array(N1 * N1), g = new Float32Array(N1 * N1), E = new Float64Array(N1 * N1), Nn = new Float64Array(N1 * N1);
      var tht = new Float32Array(N1 * N1), tcv = new Float32Array(N1 * N1), gm = new Float32Array(N1 * N1);
      var ox = n.x - dx * sc, oy = n.y - dy * sc, oxt = n.x - tdx * sct, oyt = n.y - tdy * sct;
      var cellU = 1 / CELLS, anyLand = false, hasSurf = false;
      for (var j = 0; j <= CELLS; j++) {
        for (var i = 0; i <= CELLS; i++) {
          var u = i * cellU, v = j * cellU, k = j * N1 + i;
          var ll = P.tileLonLat(z, n.x, n.y, u, v), en = P.lonlatToEN(ll.lon, ll.lat);
          E[k] = en.e; Nn[k] = en.n;
          var gh = LAKE;
          if (dem) { gh = sampleH(dem, (ox + u) / sc, (oy + v) / sc); if (gh !== gh) gh = LAKE; }
          g[k] = gh;
          if (tree && gh > WATERMAX && z >= 13) {
            var q = (Math.min(tree.h - 1, Math.floor((oyt + v) / sct * tree.h)) * tree.w + Math.min(tree.w - 1, Math.floor((oxt + u) / sct * tree.w))) * 4;
            if (tree.data[q + 3] > 0 && tree.data[q + 2] >= CANOPY_MIN) { tht[k] = (tree.data[q] * 256 + tree.data[q + 1]) * 0.1 * TREE_FACTOR; tcv[k] = tree.data[q + 2]; }
          }
        }
      }
      // pienet saaret (alle 1 ha, ei kosketa ruudun reunaa): latvuskerroksen korkeus enintään 10 m
      islandCap(g, tht, N1, CELLS, n.size / CELLS);
      // maamerkkien kohdalla latvuskerros poistetaan
      for (var f = 0; f < flatten.length; f++) {
        var L = flatten[f];
        if (Math.abs(L.e - n.e) > n.size * 0.8 + L.r * 2 || Math.abs(L.n - n.n) > n.size * 0.8 + L.r * 2) continue;
        for (var kk = 0; kk < tht.length; kk++) {
          var dd = Math.hypot(E[kk] - L.e, Nn[kk] - L.n);
          if (dd < L.r * 1.35) tht[kk] *= dd <= L.r ? 0 : (dd - L.r) / (L.r * 0.35);
        }
      }
      // kiinteiden turvalaitteiden (majakat, apuloistot) ympäriltä poistetaan latvuskerros, ettei puusto peitä tornia
      if (root.Merkit) {
        var fx = root.Merkit.all();
        for (var fa = 0; fa < fx.length; fa++) {
          var A0 = fx[fa]; if (A0.tyyppi === 'Viitta' || A0.tyyppi === 'Kummeli') continue;
          if (Math.abs(A0.e - n.e) > n.size * 0.8 + 30 || Math.abs(A0.n - n.n) > n.size * 0.8 + 30) continue;
          for (var kf = 0; kf < tht.length; kf++) { var df = Math.hypot(E[kf] - A0.e, Nn[kf] - A0.n); if (df < 14) tht[kf] = 0; }
        }
      }
      for (var m = 0; m < h.length; m++) {
        if (g[m] <= WATERMAX) { gm[m] = WATERFLOOR; h[m] = WATERFLOOR; tht[m] = 0; } else { gm[m] = g[m]; h[m] = g[m] + tht[m]; anyLand = true; }
      }
      // kaukana (z14 ja karkeammat solmut) latvuskerros yhdistetään maastoverkon korkeuteen, jotta rantojen siluetit säilyvät ilman erillisiä laatikoita
      var farCanopy = n.z <= 14;
      if (farCanopy) for (var mf = 0; mf < gm.length; mf++) if (tht[mf] > 0) gm[mf] += tht[mf];
      n.hgrid = h; n.ggrid = g; n.hasSurf = hasSurf;
      if (!anyLand) { n.state = 'empty'; return; }
      yield;
      // --- geometria (paikalliset koordinaatit solmun keskipisteen suhteen) ---
      var w0 = P.enToWorld(n.e, n.n);
      var nv = N1 * N1, skirt = 4 * CELLS, tot = nv + skirt * 2;
      var pos = new Float32Array(tot * 3), uv = new Float32Array(tot * 2), idx = new Uint16Array(CELLS * CELLS * 6 + skirt * 6);
      for (var j2 = 0; j2 <= CELLS; j2++) for (var i2 = 0; i2 <= CELLS; i2++) {
        var kv = j2 * N1 + i2;
        pos[kv * 3] = E[kv] - n.e; pos[kv * 3 + 1] = gm[kv] - LAKE; pos[kv * 3 + 2] = -(Nn[kv] - n.n);
        uv[kv * 2] = i2 / CELLS; uv[kv * 2 + 1] = 1 - j2 / CELLS;
      }
      var ti = 0;
      for (var j3 = 0; j3 < CELLS; j3++) for (var i3 = 0; i3 < CELLS; i3++) {
        var a = j3 * N1 + i3, b = (j3 + 1) * N1 + i3, c = j3 * N1 + i3 + 1, d2 = (j3 + 1) * N1 + i3 + 1;
        idx[ti++] = a; idx[ti++] = b; idx[ti++] = c; idx[ti++] = b; idx[ti++] = d2; idx[ti++] = c;
      }
      // reunahelmat (skirts): reunan pisteet kopioituna alas, jotta eritasoisten naapureiden väliin ei jää rakoja
      var drop = Math.min(120, Math.max(6, n.size * 0.05)), sk = nv, edge = [];
      for (var e1 = 0; e1 < CELLS; e1++) edge.push(e1);                                     // pohjoinen (j=0), i kasvaa
      for (var e2 = 0; e2 < CELLS; e2++) edge.push(e2 * N1 + CELLS);                        // itä (i=CELLS), j kasvaa
      for (var e3 = 0; e3 < CELLS; e3++) edge.push(CELLS * N1 + (CELLS - e3));              // etelä, i pienenee
      for (var e4 = 0; e4 < CELLS; e4++) edge.push((CELLS - e4) * N1);                      // länsi, j pienenee
      var edge2 = edge.map(function (s, q) { return edge[(q + 1) % edge.length]; });
      // jokaiselle reunalle (4 x CELLS) kaksi uutta pistettä: [alku alas], [loppu alas]
      var top = nv, base = nv + skirt;
      for (var q2 = 0; q2 < skirt; q2++) {
        var s0 = edge[q2], s1 = edge2[q2];
        // vierekkäisten reunojen kulmat: viimeinen piste kytketään seuraavan reunan ensimmäiseen
        pos[(top + q2) * 3] = pos[s0 * 3]; pos[(top + q2) * 3 + 1] = pos[s0 * 3 + 1]; pos[(top + q2) * 3 + 2] = pos[s0 * 3 + 2];
        uv[(top + q2) * 2] = uv[s0 * 2]; uv[(top + q2) * 2 + 1] = uv[s0 * 2 + 1];
        pos[(base + q2) * 3] = pos[s0 * 3]; pos[(base + q2) * 3 + 1] = pos[s0 * 3 + 1] - drop; pos[(base + q2) * 3 + 2] = pos[s0 * 3 + 2];
        uv[(base + q2) * 2] = uv[s0 * 2]; uv[(base + q2) * 2 + 1] = uv[s0 * 2 + 1];
      }
      for (var q3 = 0; q3 < skirt; q3++) {
        var nx = (q3 + 1) % skirt;
        // nelikulmio (top q3, top nx, base nx, base q3); kulmat sulkeutuvat, koska edge-listan viimeinen pari on (edge[last], edge[0])
        var t0i = top + q3, t1i = top + nx, b0i = base + q3, b1i = base + nx;
        // t1i:n sijainti on reunan seuraava piste, ja se on tässä listassa seuraavan segmentin alku
        idx[ti++] = t0i; idx[ti++] = t1i; idx[ti++] = b0i; idx[ti++] = b0i; idx[ti++] = t1i; idx[ti++] = b1i;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      // reunahelmojen normaalit ylös, ettei valaistus tummenna niitä
      var nrm = geo.attributes.normal.array;
      for (var q4 = nv; q4 < tot; q4++) { nrm[q4 * 3] = 0; nrm[q4 * 3 + 1] = 1; nrm[q4 * 3 + 2] = 0; }
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      yield;
      // --- peiteteksturi ---
      var lyr = null;
      var vp = A.layers(z, n.x, n.y, names).then(function (r) { lyr = r; }, function () { lyr = null; });
      yield vp;
      var cv = document.createElement('canvas'); cv.width = TEXN; cv.height = TEXN;
      var cg = cv.getContext('2d', { willReadFrequently: true });
      paintCover(cg, lyr, tree, oxt, oyt, sct);
      paintShore(cg, gm, CELLS, N1);
      var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 2; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      var mat = new THREE.MeshLambertMaterial({ map: tex });
      mat.onBeforeCompile = lakeFloorShader; mat.customProgramCacheKey = function () { return 'maasto-lake'; };
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.node = n; mesh.frustumCulled = true; mesh.matrixAutoUpdate = false;
      n.mesh = mesh;
      n.cmesh = farCanopy ? null : buildCanopy(n, geo, gm, tht, tcv, CELLS, N1, n.size / CELLS);
      yield;
      if (wantB && lyr && lyr.rakennus && lyr.rakennus.features.length) {
        var bm = buildBuildings(n, lyr.rakennus, null, h);
        if (bm) { n.bmesh = bm; }
      }
      n.state = 'built';
      var ms = performance.now() - t0;
      stats.builds++; stats.buildMs += performance.now() - tStart;
    }

    // Puuston peittävyys (LUKE MVMI) maalataan peiteteksturin päälle: metsämaa on tummanvihreää ja sen sävy seuraa latvuspeittoa,
    // vaikka maastokuvio olisi taajama tai muu. Vesialueet (sinertävä pikseli) jätetään koskematta.
    function paintTrees(g, tree, oxt, oyt, sct) {
      if (!tree) return;
      var id = g.getImageData(0, 0, TEXN, TEXN), d = id.data, td = tree.data;
      for (var ty = 0; ty < TEXN; ty++) {
        var py = Math.min(tree.h - 1, Math.floor((oyt + (ty + 0.5) / TEXN) / sct * tree.h));
        for (var tx = 0; tx < TEXN; tx++) {
          var px = Math.min(tree.w - 1, Math.floor((oxt + (tx + 0.5) / TEXN) / sct * tree.w)), q = (py * tree.w + px) * 4;
          if (td[q + 3] === 0 || td[q + 2] < TREE_MIN_CANOPY) continue;
          var o = (ty * TEXN + tx) * 4;
          if (d[o + 2] > d[o] + 10) continue;
          var c = Math.min(100, td[q + 2]) / 100, hm = Math.min(25, (td[q] * 256 + td[q + 1]) * 0.1) / 25;
          var k = 0.45 + 0.35 * (1 - c) - 0.12 * hm;     // 0 = tumma, 1 = vaalea
          d[o] = 52 + 56 * k; d[o + 1] = 82 + 62 * k; d[o + 2] = 44 + 36 * k;
        }
      }
      g.putImageData(id, 0, 0);
    }

    // Vesipolygonin ja korkeusmallin rantaviiva eivät osu täysin yhteen: veden värinen pikseli, jonka kohdalla verkko on vedenpinnan yläpuolella, maalataan rannan väriseksi.
    function paintShore(g, h, CELLS, N1) {
      var id = g.getImageData(0, 0, TEXN, TEXN), d = id.data, sh = [0x7a, 0x80, 0x68];
      for (var ty = 0; ty < TEXN; ty++) {
        var fy = (ty + 0.5) / TEXN * CELLS, j = Math.min(CELLS - 1, Math.floor(fy)), ay = fy - j;
        for (var tx = 0; tx < TEXN; tx++) {
          var o = (ty * TEXN + tx) * 4;
          if (d[o + 2] <= d[o] + 10) continue;
          var fx = (tx + 0.5) / TEXN * CELLS, i = Math.min(CELLS - 1, Math.floor(fx)), ax = fx - i, k = j * N1 + i;
          var hh = (h[k] * (1 - ax) + h[k + 1] * ax) * (1 - ay) + (h[k + N1] * (1 - ax) + h[k + N1 + 1] * ax) * ay;
          if (hh > LAKE + 0.4) { d[o] = sh[0]; d[o + 1] = sh[1]; d[o + 2] = sh[2]; }
        }
      }
      g.putImageData(id, 0, 0);
    }

    function paintCover(g, lyr, tree, oxt, oyt, sct) {
      g.fillStyle = COVER.forest; g.fillRect(0, 0, TEXN, TEXN);
      if (!lyr) { paintTrees(g, tree, oxt, oyt, sct); return; }
      var mk = lyr.maastokuvio, ext;
      if (mk) {
        ext = mk.extent;
        // järvet ensin, sitten muut (järvipolygonit eivät saa peittää saaria)
        var order = { jarvi: 0, virtavesi: 0, maatuva_vesialue: 1 };
        var fs = mk.features.slice().sort(function (a, b) { return (order[a.props.luokka] != null ? order[a.props.luokka] : 2) - (order[b.props.luokka] != null ? order[b.props.luokka] : 2); });
        for (var i = 0; i < fs.length; i++) {
          var f = fs[i]; if (f.type !== 3) continue;
          var col = COVER[f.props.luokka]; if (!col) continue;
          g.fillStyle = col; g.beginPath();
          for (var r = 0; r < f.parts.length; r++) {
            var ring = f.parts[r], s = TEXN / ext;
            g.moveTo(ring[0] * s, ring[1] * s);
            for (var k = 2; k < ring.length; k += 2) g.lineTo(ring[k] * s, ring[k + 1] * s);
            g.closePath();
          }
          g.fill('evenodd');
        }
      }
      paintTrees(g, tree, oxt, oyt, sct);
      var tie = lyr.tie;
      if (tie) {
        ext = tie.extent; var s2 = TEXN / ext;
        g.strokeStyle = '#6d6d6a'; g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = Math.max(1, TEXN / 128);
        g.beginPath();
        for (var a = 0; a < tie.features.length; a++) {
          var tf = tie.features[a]; if (tf.type !== 2) continue;
          for (var p = 0; p < tf.parts.length; p++) {
            var ln = tf.parts[p]; g.moveTo(ln[0] * s2, ln[1] * s2);
            for (var q = 2; q < ln.length; q += 2) g.lineTo(ln[q] * s2, ln[q + 1] * s2);
          }
        }
        g.stroke();
      }
    }

    // ---------- rakennukset (vain siellä, missä ei ole pintamallia) ----------
    function buildBuildings(n, layer, surf, h) {
      var CELLS = n.cells, N1 = n.n1;
      var ext = layer.extent, pos = [], col = [], tris = 0, tmp = [];
      var wallC = new THREE.Color('#d6d0c4'), roofC = new THREE.Color('#77736f');
      for (var i = 0; i < layer.features.length; i++) {
        var f = layer.features[i]; if (f.type !== 3 || !f.parts.length) continue;
        var ring = f.parts[0], np = ring.length / 2;
        if (np > 1 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1]) np--;
        if (np < 3) continue;
        // pintamalli kattaa rakennuksen: ohitetaan
        var cx = 0, cy = 0; for (var k = 0; k < np; k++) { cx += ring[2 * k]; cy += ring[2 * k + 1]; }
        cx /= np * ext; cy /= np * ext;
        if (surf) { var sv = sampleH(surf, cx, cy); if (sv === sv) continue; }
        var krs = f.props.krs, hh = krs === '3+' ? 12 : (krs === '1-2' ? 6 : 5);
        var contour = [], pts = [];
        for (var k2 = 0; k2 < np; k2++) {
          var ll = P.tileLonLat(n.z, n.x, n.y, ring[2 * k2] / ext, ring[2 * k2 + 1] / ext), en = P.lonlatToEN(ll.lon, ll.lat);
          pts.push([en.e - n.e, en.n - n.n]); contour.push(new THREE.Vector2(en.e - n.e, en.n - n.n));
        }
        var gz = f.props.z != null ? Number(f.props.z) : null;
        if (gz == null || !isFinite(gz)) {
          var gi = Math.min(CELLS, Math.max(0, Math.round(cx * CELLS))), gj = Math.min(CELLS, Math.max(0, Math.round(cy * CELLS)));
          gz = n.ggrid[gj * N1 + gi];
        }
        var y0 = gz - LAKE - 0.5, y1 = gz - LAKE + hh;
        if (y1 < 0.5) continue;
        var tri = THREE.ShapeUtils.triangulateShape(contour, []);
        for (var t = 0; t < tri.length; t++) {
          for (var v = 0; v < 3; v++) { var pp = pts[tri[t][v]]; pos.push(pp[0], y1, -pp[1]); col.push(roofC.r, roofC.g, roofC.b); }
          tris++;
        }
        for (var s = 0; s < np; s++) {
          var a = pts[s], b = pts[(s + 1) % np];
          var q = [[a[0], y0, -a[1]], [b[0], y0, -b[1]], [b[0], y1, -b[1]], [a[0], y0, -a[1]], [b[0], y1, -b[1]], [a[0], y1, -a[1]]];
          for (var w = 0; w < 6; w++) { pos.push(q[w][0], q[w][1], q[w][2]); col.push(wallC.r, wallC.g, wallC.b); }
          tris += 2;
        }
      }
      if (!tris) return null;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false; m.userData.node = n;
      return m;
    }

    // ---------- valinta ja aikataulutus ----------
    function placeMesh(n) {
      var w = P.enToWorld(n.e, n.n);
      [n.mesh, n.bmesh, n.cmesh].forEach(function (m) { if (!m) return; m.position.set(w.x, 0, -w.y); m.updateMatrix(); m.matrixWorldNeedsUpdate = true; });
    }
    function select() {
      var out = [], want = [];
      // juuret z12
      var ll = P.worldToLonLat(boat.x, boat.y), t = P.lonlatToTile(ll.lon, ll.lat, Z_MIN);
      var rr = Math.ceil(MAX_DIST / sizeM(Z_MIN, ll.lat)) + 1;
      var rts = [];
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) rts.push(getNode(Z_MIN, Math.floor(t.x) + dx, Math.floor(t.y) + dy));
      function visit(n) {
        if (nearDist(n) > MAX_DIST) return true;
        n.last = performance.now();
        if (n.state === 'water') return true;
        if (n.state === 'new') { want.push(n); return false; }
        if (n.state === 'loading') return false;
        var split = shouldSplit(n);
        if (!split || n.noKids) { if (n.state === 'built') out.push(n); return true; }
        var ks = kids(n), ready = true, i;
        for (i = 0; i < 4; i++) { var c = ks[i]; if (nearDist(c) > MAX_DIST) continue; if (!isDone(c)) { ready = false; if (c.state === 'new') want.push(c); } }
        if (ready) { for (i = 0; i < 4; i++) if (nearDist(ks[i]) <= MAX_DIST) visit(ks[i]); return true; }
        if (n.state === 'built') out.push(n);
        return true;
      }
      rts.forEach(visit);
      want.sort(function (a, b) { return nearDist(a) - nearDist(b); });
      queue = want;
      // näkyvyys
      var show = new Set(out);
      shown.forEach(function (n) { if (!show.has(n)) { if (n.mesh) group.remove(n.mesh); if (n.bmesh) group.remove(n.bmesh); if (n.cmesh) group.remove(n.cmesh); } });
      out.forEach(function (n) {
        if (n.mesh && n.mesh.parent !== group) { group.add(n.mesh); placeMesh(n); }
        if (n.bmesh && n.bmesh.parent !== group) { group.add(n.bmesh); placeMesh(n); }
        if (n.cmesh && n.cmesh.parent !== group) { group.add(n.cmesh); placeMesh(n); }
      });
      shown = out;
      evict();
    }
    function evict() {
      if (nodes.size <= MAX_BUILT * 2) return;
      var now = performance.now(), list = [];
      nodes.forEach(function (n) { if (n.state === 'built' || n.state === 'empty') list.push(n); });
      if (list.length <= MAX_BUILT) return;
      var keepSet = new Set(shown);
      list.sort(function (a, b) { return a.last - b.last; });
      var drop = list.length - MAX_BUILT;
      for (var i = 0; i < list.length && drop > 0; i++) {
        var n = list[i];
        if (keepSet.has(n) || now - n.last < 3000) continue;
        disposeNode(n); drop--;
      }
    }
    function disposeNode(n) {
      [n.mesh, n.bmesh, n.cmesh].forEach(function (m) {
        if (!m) return; if (m.parent) m.parent.remove(m);
        m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); if (m.material !== canopyMat) m.material.dispose();
      });
      if (n.children) n.children.forEach(function (c) { if (c.state === 'new') nodes.delete(c.key); });
      n.mesh = null; n.bmesh = null; n.cmesh = null; n.hgrid = null; n.ggrid = null; n.state = 'new'; n.children = null;
    }

    // Aikaviipaleet: ajaa rakennustöitä enintään budgetMs millisekuntia. Palauttaa true, jos kuvaan tuli uutta.
    function tick(budgetMs) {
      if (gate) return false;
      var t0 = performance.now(), changed = false;
      if (dirty) { dirty = false; select(); }
      while (jobs.length < MAX_ACTIVE && queue.length) {
        var n = queue.shift();
        if (n.state !== 'new') continue;
        n.state = 'loading';
        jobs.push({ node: n, gen: buildGen(n), wait: null });
      }
      var guard = 0;
      while (jobs.length && performance.now() - t0 < budgetMs && guard++ < 40) {
        var progressed = false;
        for (var i = 0; i < jobs.length && performance.now() - t0 < budgetMs; i++) {
          var job = jobs[i];
          if (job.wait) continue;
          var s = performance.now(), r;
          try { r = job.gen.next(); } catch (e) { r = { done: true }; job.node.state = 'water'; if (root.console) console.error('maasto', e); }
          stats.maxJobMs = Math.max(stats.maxJobMs, performance.now() - s);
          progressed = true;
          if (r.done) {
            jobs.splice(i, 1); i--; stats.jobsDone++; changed = true;
            if (job.node.state === 'built') stats.built++; else stats.empty++;
          } else if (r.value && typeof r.value.then === 'function') {
            job.wait = r.value; (function (j) { j.wait.then(function () { j.wait = null; }, function () { j.wait = null; }); })(job);
          }
        }
        if (!progressed) break;
      }
      if (changed) dirty = true;
      return changed;
    }

    function setBoat(x, y) {
      boat.x = x; boat.y = y;
      if (Math.hypot(x - lastSel.x, y - lastSel.y) > 25) { lastSel.x = x; lastSel.y = y; dirty = true; }
    }

    // Maanpinnan korkeus pisteessä (m järven pinnasta). ground=true: pelkkä maastomalli ilman puustoa ja rakennuksia.
    function heightAt(x, y, ground, minZ) {
      var ll = P.worldToLonLat(x, y);
      for (var z = Z_MAX; z >= (minZ || Z_MIN); z--) {
        var t = P.lonlatToTile(ll.lon, ll.lat, z), tx = Math.floor(t.x), ty = Math.floor(t.y), n = nodes.get(key(z, tx, ty));
        if (!n || n.state !== 'built' || !n.hgrid) continue;
        var CELLS = n.cells, N1 = n.n1;
        var g = ground ? n.ggrid : n.hgrid, fx = (t.x - tx) * CELLS, fy = (t.y - ty) * CELLS;
        var i = Math.min(CELLS - 1, Math.floor(fx)), j = Math.min(CELLS - 1, Math.floor(fy)), a = fx - i, b = fy - j;
        var h00 = g[j * N1 + i], h10 = g[j * N1 + i + 1], h01 = g[(j + 1) * N1 + i], h11 = g[(j + 1) * N1 + i + 1];
        var hv = (h00 * (1 - a) + h10 * a) * (1 - b) + (h01 * (1 - a) + h11 * a) * b;
        return Math.max(0, hv - LAKE);
      }
      return null;
    }
    // Näkölinja maaston läpi: true, jos maasto peittää pisteen (x1, y1, z1) silmästä (x0, y0, z0)
    function blocked(x0, y0, z0, x1, y1, z1) {
      var d = Math.hypot(x1 - x0, y1 - y0), steps = Math.min(60, Math.max(4, Math.floor(d / 60)));
      for (var i = 1; i < steps; i++) {
        var f = i / steps, h = heightAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        if (h != null && h > z0 + (z1 - z0) * f + 0.5) return true;
      }
      return false;
    }
    function setFlatten(list) { flatten = list || []; }
    function setGate(on) { gate = !!on; }
    function rebase() { nodes.forEach(function (n) { if (n.mesh || n.bmesh || n.cmesh) placeMesh(n); }); dirty = true; lastSel.x = lastSel.y = 1e9; }
    function idle() { return !jobs.length && !queue.length && !dirty; }
    function setWireframe(on) { wireframe = on; nodes.forEach(function (n) { if (n.mesh) n.mesh.material.wireframe = on; }); }
    function info() {
      var tris = 0, vis = 0;
      shown.forEach(function (n) { vis++; if (n.mesh) tris += n.mesh.geometry.index.count / 3; if (n.bmesh) tris += n.bmesh.geometry.attributes.position.count / 3; if (n.cmesh) tris += n.cmesh.geometry.attributes.position.count / 3; });
      return { nodes: nodes.size, shown: vis, jobs: jobs.length, queued: queue.length, trianglesAll: tris, stats: stats };
    }
    function levels() { var o = {}; shown.forEach(function (n) { o[n.z] = (o[n.z] || 0) + 1; }); return o; }
    return { group: group, setBoat: setBoat, tick: tick, heightAt: heightAt, blocked: blocked, setFlatten: setFlatten, setGate: setGate, rebase: rebase, idle: idle, info: info, levels: levels, setWireframe: setWireframe, nodes: nodes };
  }

  var api = { create: create, COVER: COVER, CELLS_Z: CELLS_Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Maasto = api;
})(typeof window !== 'undefined' ? window : globalThis);
