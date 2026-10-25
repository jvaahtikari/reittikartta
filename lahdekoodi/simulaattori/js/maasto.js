/* Simulaattori – maasto kuljettajan näkymään (three.js).
 *
 * Maasto on nelipuu: juuret ovat z12-ruutuja, ja aluksen lähellä ruutu jaetaan neljään aina z16:een asti.
 * Jokainen solmu on yksi korkeuskenttäverkko (CELLS x CELLS ruutua) ja yksi peiteteksturi.
 * Maastoverkko käyttää vain maanpinnan korkeutta (maasto.pmtiles). Järven pinta on 95,5 m N2000 ja kuvassa y = 0, joten maailman y = korkeus - 95,5.
 * Lähdeaineiston vesialueet (korkeus alle 95,75 m) painetaan veden alle, jotta vesitaso peittää ne.
 *
 * Puusto (vaihe 3b): puuston keskipituus ja latvuspeitto (puusto.pmtiles) ohjaavat kasvillisuutta metsämaalla, jossa latvuspeitto on vähintään 30 %.
 *  - Lähellä (z16-solmut, solmun keskipiste alle 600 m aluksesta) kasvillisuus on yksittäisiä instansseja (InstancedMesh): keskipituus alle 5 m on
 *    pensaikkoa (pyöreähköt 1-3 m tuuheat muodot), 5-8 m pieniä puita ja yli 8 m puita, joiden korkeus on keskipituus +-20 %. Sijoittelu on satunnainen
 *    mutta siemenellä toistettava (siemen = ruudun koordinaatit), ja tiheys seuraa latvuspeittoa. Kolmiobudjetti rajataan harventamalla kaukaisia instansseja.
 *  - Kauempana (z15 ja karkeammat solmut sekä z16-solmut yli 600 m päässä) latvuskerros yhdistetään maastoverkon korkeuteen. Verkon korkeus loivenee
 *    rantaviivalla vedenpintaan, ettei ranta nouse seinänä vedestä.
 *  - Alle 1 ha:n saarilla (yhtenäinen maa-alue, joka ei kosketa ruudun reunaa) käytetään pensaikkoa, ellei keskipituus ylitä 8 m. Siilinkarin kaltaisilla
 *    saarilla, joilla on kiinteä turvalaite (loisto tai kummeli), kasvillisuus on aina matalaa pensaikkoa, jotta merkki näkyy kasvillisuuden yli.
 *    Yli 8 m:n keskipituudella olevien pienten saarten korkeus rajataan 10 m:iin. Matalat alle 1 ha:n luodot maalataan vaaleana kalliona.
 * Pintamallin ohuet piikit (piiput, torni) poistetaan tasaamalla maamerkkien kohdalla, koska ne mallinnetaan erikseen mitoista.
 * Verkot rakennetaan aikaviipaleissa (aikabudjetti kuvaa kohden), eikä lataus pysäytä piirtoa. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var P = root.Paikka, A = root.Aineisto;
  var CELLS_Z = { 12: 20, 13: 22, 14: 24, 15: 24, 16: 28 }, TEXN = 256;   // verkon ruutujen määrä sivulla solmun zoomin mukaan
  var Z_MIN = 12, Z_MAX = 16;
  var SPLIT = { 12: 4000, 13: 2000, 14: 900, 15: 380 };   // solmu jaetaan, jos sen lähin etäisyys alukseen on alle tämän (m)
  var MAX_DIST = 6000;                                      // kauempana olevia ruutuja ei piirretä (määrittely: 6 km säde)
  var LAKE = P.LAKE_Z, WATERMAX = LAKE + 0.25, WATERFLOOR = LAKE - 1.5;
  var MAX_BUILT = 150, MAX_ACTIVE = 3;
  var TREE_FACTOR = 0.9, TREE_MIN_CANOPY = 20;   // TREE_FACTOR: yhdistetyn latvuskerroksen korkeus maastoverkossa suhteessa keskipituuteen
  var CANOPY_MIN = 30, ISLET_AREA_M2 = 10000, ISLET_CANOPY_MAX = 10;   // latvuskerros: vähintään 30 % peittoa, alle 1 ha:n saarilla enintään 10 m
  var ISLET_LOW_M = 3.0;                                   // matala luoto: korkein kohta alle tämän järven pinnasta (m), maalataan kallioksi
  var SHRUB_MAX = 5, SMALL_TREE_MAX = 8;                   // keskipituus < 5 m: pensaikko, 5-8 m: pieni puu, yli: puu
  var TREE_NEAR_M = 600, TREE_NEAR_OUT = 650;              // yksittäiset puuinstanssit solmun keskipisteen etäisyydellä alle tämän (hystereesi ulos)
  var TREE_TRI_BUDGET = 110000;                            // puuinstanssien kolmiobudjetti koko kuvassa
  var LOD_DIST = [220, 380, 520], LOD_F = [1, 0.5, 0.25, 0.13];   // harvennus solmun etäisyyden mukaan
  var SHORE_TAPER = [0, 0.3, 0.65];                        // yhdistetyn latvuskerroksen kerroin 1, 2 ja 3 ruudun päässä vedestä
  var treeGeo = null, treeMat = null;

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
  // Kasvillisuuden tehollinen korkeus (m): keskipituus alle 5 m on pensaikkoa, jonka korkeus on 1-3 m
  function shrubH(h) { return Math.min(3, Math.max(1, 0.45 * h + 0.45)); }
  function effH(h) { return h > 0 && h < SHRUB_MAX ? shrubH(h) : h; }
  function hash32(a, b, c) { var h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0; return h || 1; }
  function rng(seed) { var t = seed >>> 0; return function () { t = (t + 0x6D2B79F5) >>> 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

  // Yhtenäisten maa-alueiden (8-naapuruus) pinta-ala: alle 1 ha:n saarilla, jotka eivät kosketa ruudun reunaa, noudatetaan pensaikkosääntöä.
  // Palauttaa saarimaskin (bitti 1 = alle 1 ha:n saari, 2 = matala luoto, 4 = pelkkä pensaikko) ja kirjaa saarten tilastot tulokseen.
  //  - tilaajan päätös: kaikki alle 1 ha:n saaret piirretään korkeintaan pensaikkona puuston keskipituudesta riippumatta (16 m:n ruudut sekoittuvat viereisiin saariin),
  //    kunnes luodon puustosta on muu lähde (laserkeilaus tai maastotietokanta). Keskipituus kirjataan vain tilastoon.
  function islands(g, tht, E, Nn, N1, CELLS, cellM, stats) {
    var seen = new Uint8Array(N1 * N1), stack = [], comp = [], mask = new Uint8Array(N1 * N1);
    for (var s0 = 0; s0 < g.length; s0++) {
      if (seen[s0] || g[s0] <= WATERMAX) continue;
      comp.length = 0; stack.length = 0; stack.push(s0); seen[s0] = 1; var border = false, maxH = 0;
      while (stack.length) {
        var c = stack.pop(); comp.push(c); if (g[c] - LAKE > maxH) maxH = g[c] - LAKE;
        var ci = c % N1, cj = (c - ci) / N1;
        if (ci === 0 || cj === 0 || ci === CELLS || cj === CELLS) border = true;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni > CELLS || nj > CELLS) continue;
          var nk = nj * N1 + ni; if (seen[nk] || g[nk] <= WATERMAX) continue;
          seen[nk] = 1; stack.push(nk);
        }
      }
      var area = comp.length * cellM * cellM;
      if (border || area >= ISLET_AREA_M2) continue;
      var sum = 0, cnt = 0, q;
      for (q = 0; q < comp.length; q++) if (tht[comp[q]] > 0) { sum += tht[comp[q]]; cnt++; }
      var mean = cnt ? sum / cnt : 0;
      var shrubOnly = cnt > 0, low = maxH < ISLET_LOW_M, cap = SHRUB_MAX - 0.1;
      for (q = 0; q < comp.length; q++) {
        var k2 = comp[q]; mask[k2] = 1 | (low ? 2 : 0) | (shrubOnly ? 4 : 0);
        if (tht[k2] > 0) tht[k2] = Math.min(tht[k2], cap);
      }
      if (stats && cnt) stats.push({ e: Math.round(E[comp[0]]), n: Math.round(Nn[comp[0]]), areaM2: Math.round(area), meanH: Math.round(mean * 10) / 10, canopyCells: cnt, shrubOnly: shrubOnly, low: low });
    }
    return mask;
  }
  // Etäisyys vedestä ruutuina (0 = vesi, enintään 3) latvuskerroksen loiventamiseen rantaviivalla
  function waterDist(g, N1) {
    var d = new Uint8Array(N1 * N1).fill(9), q = [], i;
    for (i = 0; i < g.length; i++) if (g[i] <= WATERMAX) { d[i] = 0; q.push(i); }
    for (var h = 0; h < q.length; h++) {
      var c = q[h], ci = c % N1, cj = (c - ci) / N1, dc = d[c]; if (dc >= 3) continue;
      var nb = [ci > 0 ? c - 1 : -1, ci < N1 - 1 ? c + 1 : -1, cj > 0 ? c - N1 : -1, cj < N1 - 1 ? c + N1 : -1];
      for (i = 0; i < 4; i++) { var nk = nb[i]; if (nk >= 0 && d[nk] > dc + 1) { d[nk] = dc + 1; q.push(nk); } }
    }
    return d;
  }

  // ---------- puumallit ----------
  // Kolme jaettua mallia yksikkökoossa (korkeus 1, ympyrän säde 0,5): kuusimainen havupuu (kaksi kartiota), lehtipuu tai mänty (pallomainen latvus) ja pensas (kupu).
  function mkTreeGeo(parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (pt) {
      var seg = pt.seg || 6, rot = pt.rot || 0;
      for (var i = 0; i < seg; i++) {
        var a0 = rot + i / seg * Math.PI * 2, a1 = rot + (i + 1) / seg * Math.PI * 2;
        var rings = pt.rings, c = pt.col;
        for (var r = 0; r < rings.length - 1; r++) {
          var lo = rings[r], hi = rings[r + 1];   // [y, säde]
          var p00 = [Math.cos(a0) * lo[1], lo[0], Math.sin(a0) * lo[1]], p01 = [Math.cos(a1) * lo[1], lo[0], Math.sin(a1) * lo[1]];
          var p10 = [Math.cos(a0) * hi[1], hi[0], Math.sin(a0) * hi[1]], p11 = [Math.cos(a1) * hi[1], hi[0], Math.sin(a1) * hi[1]];
          var tris = [];
          if (lo[1] > 1e-6) tris.push([p00, p11, p01]);   // vasen kolmio (ulospäin)
          if (hi[1] > 1e-6) tris.push([p00, p10, p11]);
          if (lo[1] > 1e-6 && hi[1] > 1e-6) { /* nelikulmio: kaksi kolmiota */ }
          tris.forEach(function (t) {
            var ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2], vx = t[2][0] - t[0][0], vy = t[2][1] - t[0][1], vz = t[2][2] - t[0][2];
            var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            var mx = (t[0][0] + t[1][0] + t[2][0]) / 3, mz = (t[0][2] + t[1][2] + t[2][2]) / 3;
            if (nx * mx + nz * mz < 0) { var tmp = t[1]; t[1] = t[2]; t[2] = tmp; nx = -nx; ny = -ny; nz = -nz; }
            // lievästi ylöspäin kallistetut normaalit pehmentävät varjostusta
            ny = ny * 0.7 + 0.35; l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
            for (var v = 0; v < 3; v++) {
              pos.push(t[v][0], t[v][1], t[v][2]);
              if (pt.smooth !== undefined) {   // pyöreä muoto: sileät normaalit kohti muodon keskipistettä
                var sx = t[v][0], sy = t[v][1] - pt.smooth, sz = t[v][2], sl = Math.hypot(sx, sy, sz) || 1; nor.push(sx / sl, sy / sl, sz / sl);
              } else nor.push(nx, ny, nz);
              var sh = 0.82 + 0.18 * Math.min(1, Math.max(0, t[v][1]));   // alaosa hieman tummempi
              col.push(c[0] * sh, c[1] * sh, c[2] * sh);
            }
          });
        }
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.userData.tris = pos.length / 9;
    return g;
  }
  function getTreeGeo() {
    if (treeGeo) return treeGeo;
    treeGeo = {
      conifer: mkTreeGeo([{ seg: 6, col: [0.12, 0.26, 0.12], rings: [[-0.02, 0.5], [0.62, 0]] }, { seg: 6, rot: 0.52, col: [0.15, 0.30, 0.14], rings: [[0.36, 0.36], [1.0, 0]] }]),
      broad: mkTreeGeo([{ seg: 6, smooth: 0.55, col: [0.27, 0.41, 0.15], rings: [[0.14, 0], [0.5, 0.5], [0.88, 0.34], [1.0, 0]] }]),
      shrub: mkTreeGeo([{ seg: 6, smooth: 0.35, col: [0.34, 0.43, 0.17], rings: [[-0.05, 0.5], [0.5, 0.46], [0.88, 0.22], [1.0, 0]] }])
    };
    return treeGeo;
  }
  function getTreeMat() {
    if (!treeMat) treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return treeMat;
  }
  // Instanssien matriisit: sijainti, kierto ja koko (leveys w, korkeus h); widen levittää harvennettuja kruunuja
  function writeMatrices(im, widen) {
    var b = im.userData.base, n = b.length / 6, arr = im.instanceMatrix.array, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (var i = 0; i < n; i++) {
      var o = i * 6; q.setFromAxisAngle(up, b[o + 5]); p.set(b[o], b[o + 1], b[o + 2]); sc.set(b[o + 3] * widen, b[o + 4], b[o + 3] * widen);
      m.compose(p, q, sc); m.toArray(arr, i * 16);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  // Puiden ja pensaiden sijoittelu solmun ruudukkoon: tiheys latvuspeiton mukaan, korkeus keskipituus +-20 %, siemen = solmun koordinaatit.
  // Palauttaa solmun instanssimeshit (havupuu, lehtipuu, pensas).
  function buildTrees(n, c) {
    var CELLS = n.cells, N1 = n.n1, cellM = n.size / CELLS, rnd = rng(hash32(n.z, n.x, n.y)), G = getTreeGeo(), kinds = { conifer: [], broad: [], shrub: [] }, i, j;
    var avoid = c.avoid, total = 0;
    for (j = 0; j < CELLS; j++) for (i = 0; i < CELLS; i++) {
      var k00 = j * N1 + i, k10 = k00 + 1, k01 = k00 + N1, k11 = k01 + 1, ks = [k00, k10, k01, k11], cov = 0, hs = 0, hn = 0, q;
      for (q = 0; q < 4; q++) { var kq = ks[q]; if (c.tht[kq] > 0) { cov += c.tcv[kq] / 100; hs += c.tht[kq]; hn++; } }
      if (!hn) continue;
      cov /= 4; var hm = hs / hn;
      var shrub = hm < SHRUB_MAX, w0 = shrub ? shrubH(hm) * 1.6 : Math.min(8, Math.max(2.4, 0.34 * hm + 0.9));
      var expect = (shrub ? 1.5 : 1.15) * cov * cellM * cellM / (Math.PI * 0.25 * w0 * w0), cnt = Math.floor(expect + rnd());
      for (var t = 0; t < cnt; t++) {
        var u = rnd(), v = rnd(), pu = (1 - u) * (1 - v), p10 = u * (1 - v), p01 = (1 - u) * v, p11 = u * v;
        var gy = c.gm[k00] * pu + c.gm[k10] * p10 + c.gm[k01] * p01 + c.gm[k11] * p11 - LAKE;
        var lx = c.lx[k00] * pu + c.lx[k10] * p10 + c.lx[k01] * p01 + c.lx[k11] * p11, lz = c.lz[k00] * pu + c.lz[k10] * p10 + c.lz[k01] * p01 + c.lz[k11] * p11;
        var r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd();
        if (gy < 0.2) continue;
        var skip = false;
        for (q = 0; q < avoid.length; q++) if (Math.hypot(lx - avoid[q][0], lz - avoid[q][1]) < 8) { skip = true; break; }
        for (q = 0; q < c.corr.length && !skip; q++) {
          var CR = c.corr[q], rx = lx - (CR.e - n.e), rz = lz + (CR.n - n.n), tt = rx * CR.ux - rz * CR.uy;   // paikallinen z = -(N - n.n), joten pohjoinen = -z
          if (tt > -8 && tt < CR.len && Math.abs(rx * CR.uy + rz * CR.ux) < CR.half) skip = true;
        }
        if (skip) continue;
        var h, w, kind;
        if (shrub) { h = shrubH(hm) * (0.8 + 0.4 * r1); h = Math.min(3, Math.max(1, h)); w = h * (1.3 + 0.5 * r2); kind = 'shrub'; }
        else {
          h = hm * (0.8 + 0.4 * r1); if (c.cap10 && h > ISLET_CANOPY_MAX && c.capMask[k00]) h = ISLET_CANOPY_MAX;
          w = Math.min(8, Math.max(2.4, (0.34 * h + 0.9) * (0.85 + 0.3 * r2)));
          kind = r3 < (hm < SMALL_TREE_MAX ? 0.4 : 0.65) ? 'conifer' : 'broad';
        }
        var shade = 0.82 + 0.36 * r4, tone = 0.9 + 0.2 * r5;
        kinds[kind].push([lx, gy - 0.25, lz, w, h, rnd() * 6.283, shade * tone, shade, shade * (2 - tone)]);
        total++;
      }
    }
    var meshes = [];
    Object.keys(kinds).forEach(function (kd) {
      var list = kinds[kd]; if (!list.length) return;
      for (var a = list.length - 1; a > 0; a--) { var b = Math.floor(rnd() * (a + 1)), tmp = list[a]; list[a] = list[b]; list[b] = tmp; }   // satunnaisjärjestys: etuliite on tasainen otos
      var geo = G[kd].clone(); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), n.size * 0.78 + 40);
      var im = new THREE.InstancedMesh(geo, getTreeMat(), list.length), base = new Float32Array(list.length * 6), cols = new THREE.Color();
      for (var q2 = 0; q2 < list.length; q2++) {
        var L = list[q2]; base.set([L[0], L[1], L[2], L[3], L[4], L[5]], q2 * 6);
        cols.setRGB(L[6], L[7], L[8]); im.setColorAt(q2, cols);
      }
      im.userData = { base: base, kind: kd, total: list.length, trisPer: G[kd].userData.tris, node: n, widen: 1, level: -1 };
      im.instanceColor.needsUpdate = true;
      im.frustumCulled = true; im.matrixAutoUpdate = false;
      writeMatrices(im, 1);
      meshes.push(im);
    });
    n.treeCount = total;
    return meshes;
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
      n = { key: k, z: z, x: x, y: y, cells: CELLS_Z[z], n1: CELLS_Z[z] + 1, e: en.e, n: en.n, size: sizeM(z, c.lat), state: 'new', mesh: null, bmesh: null, tmeshes: null, mode: 'merged', hgrid: null, ggrid: null, children: null, last: 0, noKids: false };
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
            if (tree.data[q + 3] > 0 && tree.data[q + 2] >= CANOPY_MIN) { tht[k] = (tree.data[q] * 256 + tree.data[q + 1]) * 0.1; tcv[k] = tree.data[q + 2]; }
          }
        }
      }
      // kiinteät turvalaitteet (loistot, apuloistot, kummelit) lähellä solmua: saarisääntö, puuttomuus merkin ympärillä ja sijoittelun väistö
      var fixedPts = [], avoid = [];
      if (root.Merkit) {
        var fx = root.Merkit.all();
        for (var fa = 0; fa < fx.length; fa++) {
          var A0 = fx[fa]; if (A0.tyyppi === 'Viitta') continue;
          if (Math.abs(A0.e - n.e) > n.size * 0.8 + 30 || Math.abs(A0.n - n.n) > n.size * 0.8 + 30) continue;
          fixedPts.push(A0); avoid.push([A0.e - n.e, -(A0.n - n.n)]);
        }
      }
      // linjamerkkien näkölinja: linjataulujen edestä raivataan 20 m leveä käytävä 600 m:n päähän linjaa pitkin (aineistossa ei ole raivausta, oletus)
      var corr = [];
      for (var fc = 0; fc < fixedPts.length; fc++) {
        var LM = fixedPts[fc]; if (LM.tyyppi !== 'Linjamerkki' || !root.Merkit.nearBoards) continue;
        var bs = root.Merkit.nearBoards(LM.x, LM.y, 800), bb = null, bdm = 1e9;
        for (var bi = 0; bi < bs.length; bi++) { var dm = Math.hypot(bs[bi].x - LM.x, bs[bi].y - LM.y); if (dm < bdm) { bdm = dm; bb = bs[bi]; } }
        if (!bb) continue;
        var bl = Math.hypot(bb.dirX, bb.dirY) || 1;
        corr.push({ e: LM.e, n: LM.n, ux: -bb.dirX / bl, uy: -bb.dirY / bl, len: 600, half: 10 });
      }
      // pienet saaret (alle 1 ha, ei kosketa ruudun reunaa): pelkkä pensaikko
      var isl = islands(g, tht, E, Nn, N1, CELLS, n.size / CELLS, n.isletStats = []);
      // maamerkkien kohdalla latvuskerros poistetaan
      for (var f = 0; f < flatten.length; f++) {
        var L = flatten[f];
        if (Math.abs(L.e - n.e) > n.size * 0.8 + L.r * 2 || Math.abs(L.n - n.n) > n.size * 0.8 + L.r * 2) continue;
        for (var kk = 0; kk < tht.length; kk++) {
          var dd = Math.hypot(E[kk] - L.e, Nn[kk] - L.n);
          if (dd < L.r * 1.35) tht[kk] *= dd <= L.r ? 0 : (dd - L.r) / (L.r * 0.35);
        }
      }
      // kiinteiden turvalaitteiden (majakat, apuloistot) ympäriltä poistetaan puut (pensaat jäävät), ettei puusto peitä tornia
      for (var fb = 0; fb < fixedPts.length; fb++) {
        var A1 = fixedPts[fb]; if (A1.tyyppi === 'Kummeli') continue;
        for (var kf = 0; kf < tht.length; kf++) { if (tht[kf] < SHRUB_MAX) continue; var df = Math.hypot(E[kf] - A1.e, Nn[kf] - A1.n); if (df < 14) tht[kf] = 0; }
      }
      for (var cq = 0; cq < corr.length; cq++) {
        var CR = corr[cq];
        for (var kc2 = 0; kc2 < tht.length; kc2++) {
          if (tht[kc2] < SHRUB_MAX) continue;
          var rx = E[kc2] - CR.e, ry = Nn[kc2] - CR.n, tt = rx * CR.ux + ry * CR.uy;
          if (tt > -8 && tt < CR.len && Math.abs(rx * CR.uy - ry * CR.ux) < CR.half + n.size / CELLS * 0.5) tht[kc2] = 0;
        }
      }
      var gmBare = new Float32Array(N1 * N1);
      for (var m = 0; m < h.length; m++) {
        if (g[m] <= WATERMAX) { gm[m] = WATERFLOOR; h[m] = WATERFLOOR; tht[m] = 0; } else { gm[m] = g[m]; h[m] = g[m] + effH(tht[m]) * TREE_FACTOR; anyLand = true; }
        gmBare[m] = gm[m];
      }
      // yhdistetty latvuskerros maastoverkon korkeuteen (kaukana ja z16-solmuilla yli 600 m päässä): loivenee rantaviivalla vedenpintaan
      var wd = waterDist(g, N1), gmMerged = new Float32Array(N1 * N1);
      for (var mf = 0; mf < gm.length; mf++) {
        var tp = wd[mf] >= 3 ? 1 : (wd[mf] === 0 ? 0 : SHORE_TAPER[wd[mf]]);
        gmMerged[mf] = tht[mf] > 0 ? gm[mf] + effH(tht[mf]) * TREE_FACTOR * tp : gm[mf];
      }
      // rantaviivan jyrkkyys: vedenpinnan yläpuolinen nousu rannan viimeisen maapisteen ja vesipisteen välillä (korkeusero / ruudun leveys), taperoituna ja ilman taperia
      var cM = n.size / CELLS, st = { n: 0, maxT: 0, maxU: 0, sumT: 0, sumU: 0 };
      for (var ks2 = 0; ks2 < gm.length; ks2++) {
        if (wd[ks2] !== 1) continue;
        var up = (gmBare[ks2] + (tht[ks2] > 0 ? effH(tht[ks2]) * TREE_FACTOR : 0) - gmBare[ks2] + (gmBare[ks2] - WATERFLOOR)) / cM, tp2 = (gmMerged[ks2] - WATERFLOOR) / cM;
        st.n++; st.sumT += tp2; st.sumU += up; if (tp2 > st.maxT) st.maxT = tp2; if (up > st.maxU) st.maxU = up;
      }
      n.shoreStat = st;
      var hasTrees = z === Z_MAX;
      if (!hasTrees) gm = gmMerged;
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
      // z16-solmuilla verkon korkeus vaihtuu kahden tilan välillä: pelkkä maanpinta (puut instansseina) tai yhdistetty latvuskerros (kaukana)
      n.setMerged = function (merged) {
        var src = merged ? gmMerged : gmBare, pa = geo.attributes.position.array;
        for (var kv2 = 0; kv2 < nv; kv2++) pa[kv2 * 3 + 1] = src[kv2] - LAKE;
        for (var qs = 0; qs < skirt; qs++) { var sv = edge[qs]; pa[(top + qs) * 3 + 1] = pa[sv * 3 + 1]; pa[(base + qs) * 3 + 1] = pa[sv * 3 + 1] - drop; }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        var na = geo.attributes.normal.array;
        for (var q5 = nv; q5 < tot; q5++) { na[q5 * 3] = 0; na[q5 * 3 + 1] = 1; na[q5 * 3 + 2] = 0; }
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        n.mode = merged ? 'merged' : 'inst';
      };
      n.mode = hasTrees ? 'inst' : 'merged';
      yield;
      // --- peiteteksturi ---
      var lyr = null;
      var vp = A.layers(z, n.x, n.y, names).then(function (r) { lyr = r; }, function () { lyr = null; });
      yield vp;
      var cv = document.createElement('canvas'); cv.width = TEXN; cv.height = TEXN;
      var cg = cv.getContext('2d', { willReadFrequently: true });
      paintCover(cg, lyr, tree, oxt, oyt, sct);
      paintIslets(cg, isl, gmBare, tree, oxt, oyt, sct, CELLS, N1, n);
      paintShore(cg, gmBare, CELLS, N1);
      var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 2; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      var mat = new THREE.MeshLambertMaterial({ map: tex });
      mat.onBeforeCompile = lakeFloorShader; mat.customProgramCacheKey = function () { return 'maasto-lake'; };
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.node = n; mesh.frustumCulled = true; mesh.matrixAutoUpdate = false;
      n.mesh = mesh;
      yield;
      if (hasTrees) {
        var lx = new Float32Array(N1 * N1), lz = new Float32Array(N1 * N1), capMask = new Uint8Array(N1 * N1);
        for (var kc = 0; kc < lx.length; kc++) { lx[kc] = E[kc] - n.e; lz[kc] = -(Nn[kc] - n.n); capMask[kc] = isl[kc] && !(isl[kc] & 4) ? 1 : 0; }
        n.tmeshes = buildTrees(n, { tht: tht, tcv: tcv, gm: gmBare, lx: lx, lz: lz, avoid: avoid, corr: corr, cap10: true, capMask: capMask });
      }
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
          var c = Math.min(100, td[q + 2]) / 100, hraw = (td[q] * 256 + td[q + 1]) * 0.1, hm = Math.min(25, hraw) / 25;
          var k = 0.45 + 0.35 * (1 - c) - 0.12 * hm;     // 0 = tumma, 1 = vaalea
          if (hraw < SHRUB_MAX) k = 0.8 + 0.15 * (1 - c); // matala kasvillisuus (pensaikko) on vaaleampaa
          d[o] = 52 + 56 * k; d[o + 1] = 82 + 62 * k; d[o + 2] = 44 + 36 * k;
        }
      }
      g.putImageData(id, 0, 0);
    }

    // Alle 1 ha:n saaret: matalat luodot maalataan vaaleana kalliona (ei nurmena), ja pelkkää pensaikkoa kasvavilla saarilla latvuspeitteinen osa saa pensaikon sävyn.
    // Pikseli kuuluu saareen, jos jokin ympäröivistä ruudukon pisteistä on saarimaskissa ja korkeusmallin pinta on vedenpinnan yläpuolella.
    function paintIslets(g, isl, gh, tree, oxt, oyt, sct, CELLS, N1, n) {
      var any = false; for (var q0 = 0; q0 < isl.length; q0++) if (isl[q0]) { any = true; break; }
      if (!any) return;
      var id = g.getImageData(0, 0, TEXN, TEXN), d = id.data, td = tree ? tree.data : null, rnd = rng(hash32(n.z, n.x, n.y) ^ 0x5bd1e995);
      for (var ty = 0; ty < TEXN; ty++) {
        var fy = (ty + 0.5) / TEXN * CELLS, j = Math.min(CELLS - 1, Math.floor(fy)), ay = fy - j;
        for (var tx = 0; tx < TEXN; tx++) {
          var fx = (tx + 0.5) / TEXN * CELLS, i = Math.min(CELLS - 1, Math.floor(fx)), ax = fx - i, k = j * N1 + i;
          var mk = isl[k] | isl[k + 1] | isl[k + N1] | isl[k + N1 + 1];
          if (!(mk & 1)) continue;
          var o = (ty * TEXN + tx) * 4, canopy = false;
          if (d[o + 2] > d[o] + 10) continue;     // veden värinen pikseli jätetään (rantaviiva korjataan paintShore-funktiossa)
          if (td) {
            var py = Math.min(tree.h - 1, Math.floor((oyt + (ty + 0.5) / TEXN) / sct * tree.h)), px = Math.min(tree.w - 1, Math.floor((oxt + (tx + 0.5) / TEXN) / sct * tree.w)), q = (py * tree.w + px) * 4;
            canopy = td[q + 3] > 0 && td[q + 2] >= CANOPY_MIN;
          }
          var nz = 0.92 + 0.16 * rnd();
          if (canopy && (mk & 4)) { d[o] = 146 * nz; d[o + 1] = 150 * nz; d[o + 2] = 126 * nz; }           // kalliota ja pensaikon varjostamaa maata
          else if (mk & 2) { d[o] = 176 * nz; d[o + 1] = 176 * nz; d[o + 2] = 170 * nz; }                 // vaalea kallio
        }
      }
      g.putImageData(id, 0, 0);
    }

    // Vesipolygonin ja korkeusmallin rantaviiva eivät osu täysin yhteen: veden värinen pikseli, jonka kohdalla verkko on vedenpinnan yläpuolella, maalataan rannan väriseksi.
    function paintShore(g, h, CELLS, N1) {
      var id = g.getImageData(0, 0, TEXN, TEXN), d = id.data, sh = [0xa9, 0xa9, 0x9a];
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
    function meshesOf(n) { var a = []; if (n.mesh) a.push(n.mesh); if (n.bmesh) a.push(n.bmesh); if (n.tmeshes) for (var i = 0; i < n.tmeshes.length; i++) a.push(n.tmeshes[i]); return a; }
    var QSTEPS = [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05, 0.03];
    function quant(f) { for (var i = 0; i < QSTEPS.length; i++) if (QSTEPS[i] <= f * 1.001) return QSTEPS[i]; return QSTEPS[QSTEPS.length - 1]; }
    var treeInfo = { nodes: 0, instances: 0, tris: 0, total: 0, scale: 1 };
    // Puiden valinta: z16-solmu piirtää yksittäiset puut, kun sen keskipiste on alle 600 m:n päässä, muuten yhdistetty latvuskerros on maastoverkossa.
    // Instanssien määrä harvennetaan etäisyyden mukaan (satunnaisjärjestyksen etuliite on tasainen otos), ja kolmiobudjetti rajaa kokonaismäärän.
    function updateTrees(list) {
      var inst = [], total = 0;
      list.forEach(function (n) {
        if (!n.tmeshes || !n.setMerged) return;
        var w = P.enToWorld(n.e, n.n), dc = Math.hypot(w.x - boat.x, w.y - boat.y);
        var want = n.mode === 'inst' ? dc < TREE_NEAR_OUT : dc < TREE_NEAR_M;
        if (want && n.mode !== 'inst') n.setMerged(false); else if (!want && n.mode === 'inst') n.setMerged(true);
        n.tmeshes.forEach(function (im) { im.visible = want; });
        if (!want) return;
        var L = dc < LOD_DIST[0] ? 0 : dc < LOD_DIST[1] ? 1 : dc < LOD_DIST[2] ? 2 : 3, f = LOD_F[L];
        inst.push({ n: n, f: f });
        n.tmeshes.forEach(function (im) { total += im.userData.total * f * im.userData.trisPer; });
      });
      var scale = total > TREE_TRI_BUDGET ? TREE_TRI_BUDGET / total : 1, cnt = 0, tris = 0, all = 0;
      inst.forEach(function (o) {
        var f = quant(Math.max(0.03, o.f * scale));
        o.n.tmeshes.forEach(function (im) {
          var u = im.userData, k = Math.max(1, Math.ceil(u.total * f)), widen = Math.min(2.4, 1 / Math.sqrt(f));
          im.count = k;
          if (Math.abs(widen - u.widen) > 0.01) { u.widen = widen; writeMatrices(im, widen); }
          cnt += k; tris += k * u.trisPer; all += u.total;
        });
      });
      treeInfo = { nodes: inst.length, instances: cnt, tris: tris, total: all, scale: scale };
    }
    function placeMesh(n) {
      var w = P.enToWorld(n.e, n.n);
      meshesOf(n).forEach(function (m) { m.position.set(w.x, 0, -w.y); m.updateMatrix(); m.matrixWorldNeedsUpdate = true; });
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
      shown.forEach(function (n) { if (!show.has(n)) meshesOf(n).forEach(function (m) { group.remove(m); }); });
      out.forEach(function (n) {
        if (n.mesh && n.mesh.parent !== group) { group.add(n.mesh); placeMesh(n); }
        if (n.bmesh && n.bmesh.parent !== group) { group.add(n.bmesh); placeMesh(n); }
        if (n.tmeshes) n.tmeshes.forEach(function (m) { if (m.parent !== group) { group.add(m); placeMesh(n); } });
      });
      shown = out;
      updateTrees(out);
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
      meshesOf(n).forEach(function (m) {
        if (m.parent) m.parent.remove(m);
        m.geometry.dispose(); if (m.isInstancedMesh) { m.dispose(); return; }
        if (m.material.map) m.material.map.dispose(); m.material.dispose();
      });
      if (n.children) n.children.forEach(function (c) { if (c.state === 'new') nodes.delete(c.key); });
      n.mesh = null; n.bmesh = null; n.tmeshes = null; n.setMerged = null; n.mode = 'merged'; n.hgrid = null; n.ggrid = null; n.state = 'new'; n.children = null;
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
    function rebase() { nodes.forEach(function (n) { if (n.mesh) placeMesh(n); }); dirty = true; lastSel.x = lastSel.y = 1e9; }
    function idle() { return !jobs.length && !queue.length && !dirty; }
    function setWireframe(on) { wireframe = on; nodes.forEach(function (n) { if (n.mesh) n.mesh.material.wireframe = on; }); }
    function info() {
      var tris = 0, vis = 0;
      shown.forEach(function (n) { vis++; if (n.mesh) tris += n.mesh.geometry.index.count / 3; if (n.bmesh) tris += n.bmesh.geometry.attributes.position.count / 3; });
      return { nodes: nodes.size, shown: vis, jobs: jobs.length, queued: queue.length, trianglesAll: tris + treeInfo.tris, trees: treeInfo, stats: stats };
    }
    function levels() { var o = {}; shown.forEach(function (n) { o[n.z] = (o[n.z] || 0) + 1; }); return o; }
    return { group: group, setBoat: setBoat, tick: tick, heightAt: heightAt, blocked: blocked, setFlatten: setFlatten, setGate: setGate, rebase: rebase, idle: idle, info: info, levels: levels, setWireframe: setWireframe, nodes: nodes, setTreeBudget: function (b) { TREE_TRI_BUDGET = b; }, treeInfo: function () { return treeInfo; }, shoreStats: function () { var o = { nodes: 0, n: 0, maxT: 0, maxU: 0, sumT: 0, sumU: 0 }; shown.forEach(function (n) { var t = n.shoreStat; if (!t || !t.n) return; o.nodes++; o.n += t.n; o.sumT += t.sumT; o.sumU += t.sumU; o.maxT = Math.max(o.maxT, t.maxT); o.maxU = Math.max(o.maxU, t.maxU); }); return o; }, isletStats: function () { var o = []; nodes.forEach(function (n) { if (n.isletStats && n.isletStats.length) o.push({ z: n.z, x: n.x, y: n.y, islets: n.isletStats }); }); return o; } };
  }

  var api = { create: create, COVER: COVER, CELLS_Z: CELLS_Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Maasto = api;
})(typeof window !== 'undefined' ? window : globalThis);
