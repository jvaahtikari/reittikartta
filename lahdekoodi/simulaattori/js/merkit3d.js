/* Simulaattori – turvalaitteet 3D-symboleina kuljettajan näkymässä.
 *
 * Kaikki turvalaitteet yhdistetään yhdeksi verkoksi (yksi piirtokutsu). Mitat ovat oikeat:
 *  - viitta (kelluva): sylinteri halkaisijaltaan 0,2 m, 1,5 m vedenpinnan yläpuolella, väri navigointilajin mukaan ja huippumerkki
 *    (värit samat kuin Reittikartan symbols.js: vasen punainen, oikea vihreä, kardinaalit keltamustat, karimerkki musta-punainen,
 *    turvavesi puna-valkoinen, erikoismerkki keltainen),
 *  - kummeli: valkoinen kartio 2 m,
 *  - apuloisto ja muut kiinteät loistot: sylinteri valon korkeudelle (valon_korkeus_vedesta, oletus 5 m, jos tietoa ei ole),
 *  - linjataulut: 3 x 1,5 m suorakaide 6 m korkeudella (oletus, jos taululinjan päätepisteessä ei ole tarkempaa tietoa).
 * Päivällä valot eivät pala. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var EC = { r: [0.886, 0.129, 0.110], g: [0.075, 0.627, 0.290], y: [0.949, 0.765, 0.067], b: [0.07, 0.07, 0.07], w: [0.95, 0.95, 0.95], k: [0.9, 0.9, 0.88] };
  var BANDS = { 1: ['r'], 2: ['g'], 3: ['b', 'y'], 4: ['y', 'b'], 5: ['y', 'b', 'y'], 6: ['b', 'y', 'b'], 7: ['b', 'r', 'b'], 8: ['rw'], 9: ['y'], 0: ['b'] };
  var SETTINGS = { sparRadius: 0.1, sparHeight: 1.5, cairnHeight: 2.0, cairnRadius: 1.1, lightDefaultHeight: 5.0, boardW: 3.0, boardH: 1.5, boardZ: 6.0, signZ: 2.0, loadRadius: 4000, showRadius: 3500, scaleFar: 1.0, minPx: 3 };

  function Builder() { this.pos = []; this.nor = []; this.col = []; this.wid = []; this.wide = false; }
  // sylinteri tai katkaistu kartio: (x, z) keskipiste, säteet r0 (alhaalla) ja r1 (ylhäällä), y0..y1, väri [r,g,b]
  Builder.prototype.cyl = function (x, z, r0, r1, y0, y1, c, seg, capTop) {
    seg = seg || 8;
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      var p = [[x + c0 * r0, y0, z + s0 * r0], [x + c1 * r0, y0, z + s1 * r0], [x + c1 * r1, y1, z + s1 * r1], [x + c0 * r1, y1, z + s0 * r1]];
      var n0 = [c0, 0, s0], n1 = [c1, 0, s1];
      this.tri(p[0], p[2], p[1], n0, n1, n1, c); this.tri(p[0], p[3], p[2], n0, n0, n1, c);
      if (capTop && r1 > 0.001) { var t = [x, y1, z]; this.tri(t, p[2], p[3], [0, 1, 0], [0, 1, 0], [0, 1, 0], c); }
    }
  };
  Builder.prototype.tri = function (a, b, c, na, nb, nc, col) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    for (var i = 0; i < 3; i++) { this.col.push(col[0], col[1], col[2]); this.wid.push(this.wide ? 1 : 0); }
  };
  // pysty suorakaide (taulu): keskipiste, leveys, korkeus, suunta (kulma radiaaneina x-akselista), z0 alareuna
  Builder.prototype.board = function (x, z, w, h, y0, ang, c, thick) {
    var dx = Math.cos(ang) * w / 2, dz = Math.sin(ang) * w / 2, t = thick || 0.1, nx = -Math.sin(ang), nz = Math.cos(ang);
    var A = [x - dx, y0, z - dz], B = [x + dx, y0, z + dz], C = [x + dx, y0 + h, z + dz], D = [x - dx, y0 + h, z - dz];
    var n = [nx, 0, nz], m = [-nx, 0, -nz];
    this.tri(A, B, C, n, n, n, c); this.tri(A, C, D, n, n, n, c);
    this.tri(A, C, B, m, m, m, c); this.tri(A, D, C, m, m, m, c);
  };
  Builder.prototype.sphere = function (x, y, z, r, c) {   // pieni pallo karkeana kaksoiskartiona
    this.cyl(x, z, 0.001, r, y - r, y, c, 8, false); this.cyl(x, z, r, 0.001, y, y + r, c, 8, false);
  };
  Builder.prototype.geometry = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('wid', new THREE.Float32BufferAttribute(this.wid, 1));
    g.computeBoundingSphere();
    return g;
  };

  // Yksi turvalaite verkkoon. x, z maailmakoordinaatit (three: x = E, z = -N)
  function addAid(b, a, S) {
    var x = a.x, z = -a.y, k = S.scaleFar;
    b.wide = true;
    if (a.tyyppi === 'Viitta') {
      var nl = a.nl >= 1 && a.nl <= 9 ? a.nl : 0, bands = BANDS[nl] || ['b'], H = S.sparHeight, r = S.sparRadius;
      if (a.valoKorkeus && a.valoKorkeus > H) H = a.valoKorkeus;           // valolliset viitat voivat olla korkeampia
      var hh = H / bands.length;
      for (var i = 0; i < bands.length; i++) {
        var cc = bands[i];
        if (cc === 'rw') { b.cyl(x, z, r, r, 0, hh / 2, EC.r, 8, false); b.cyl(x, z, r, r, hh / 2, hh, EC.w, 8, false); }
        else b.cyl(x, z, r, r, i * hh, (i + 1) * hh, EC[cc], 8, false);
      }
      // huippumerkit (IALA A, Suomi)
      var y = H, m = 0.42, rr = 0.2;
      switch (nl) {
        case 1: b.cyl(x, z, 0.17, 0.17, y, y + 0.45, EC.r, 8, true); break;                       // vasen: punainen lieriö
        case 2: b.cyl(x, z, 0.24, 0.001, y, y + 0.5, EC.g, 8, false); break;                      // oikea: vihreä kartio kärki ylös
        case 3: b.cyl(x, z, 0.2, 0.001, y, y + 0.35, EC.b, 8, false); b.cyl(x, z, 0.2, 0.001, y + 0.4, y + 0.75, EC.b, 8, false); break;
        case 4: b.cyl(x, z, 0.001, 0.2, y, y + 0.35, EC.b, 8, false); b.cyl(x, z, 0.001, 0.2, y + 0.4, y + 0.75, EC.b, 8, false); break;
        case 5: b.cyl(x, z, 0.001, 0.2, y, y + 0.35, EC.b, 8, false); b.cyl(x, z, 0.2, 0.001, y + 0.4, y + 0.75, EC.b, 8, false); break;
        case 6: b.cyl(x, z, 0.2, 0.001, y, y + 0.35, EC.b, 8, false); b.cyl(x, z, 0.001, 0.2, y + 0.4, y + 0.75, EC.b, 8, false); break;
        case 7: b.sphere(x, y + 0.2, z, 0.18, EC.b); b.sphere(x, y + 0.65, z, 0.18, EC.b); break;
        case 8: b.sphere(x, y + 0.3, z, 0.24, EC.r); break;
        case 9: b.cyl(x, z, 0.17, 0.17, y, y + 0.1, EC.y, 8, true); b.cyl(x, z, 0.001, 0.2, y + 0.1, y + 0.45, EC.y, 8, false); break;
        default: break;
      }
    } else if (a.tyyppi === 'Kummeli') {
      b.cyl(x, z, S.cairnRadius, 0.12, 0, S.cairnHeight, EC.w, 10, true);
    } else {
      // loistot, apuloistot ja muut kiinteät: pylväs valon korkeudelle, valkoinen runko ja musta yläosa, ylhäällä lyhty
      var h = a.valoKorkeus && a.valoKorkeus > 0 ? a.valoKorkeus : S.lightDefaultHeight, rb = Math.max(0.35, Math.min(1.2, h * 0.07));
      b.cyl(x, z, rb, rb * 0.75, 0, h * 0.7, EC.w, 10, false);
      b.cyl(x, z, rb * 0.75, rb * 0.65, h * 0.7, h, [0.75, 0.2, 0.18], 10, false);
      b.cyl(x, z, rb * 0.9, rb * 0.9, h, h + Math.max(0.5, h * 0.06), [0.2, 0.2, 0.2], 10, true);
    }
  }

  function create(scene, opts) {
    opts = opts || {};
    var S = {}; for (var k in SETTINGS) S[k] = SETTINGS[k];
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // Kuvakulmasta riippumaton vähimmäisleveys: pylväiden ja tornien sivupinnat levennetään niin, että leveys on vähintään noin 3 kuvapistettä
    // (säde 1,5 px), jolloin viitat erottuvat näytöllä kaukaa kuten silmällä noin 500 m:n päästä.
    var pixU = { value: 0.0015 };
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uPix = pixU; sh.uniforms.uMinPx = { value: S.minPx };
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uPix;\nuniform float uMinPx;\nattribute float wid;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n float dd = length((modelViewMatrix * vec4(position, 1.0)).xyz);\n float ex = clamp(0.5 * uMinPx * uPix * dd - 0.1, 0.0, 4.0) * wid;\n transformed.xz += normalize(objectNormal.xz + vec2(1.0e-5)) * ex * step(abs(objectNormal.y), 0.5);');
    };
    mat.customProgramCacheKey = function () { return 'merkit-minpx'; };
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'turvalaitteet';
    scene.add(mesh);
    var last = { x: 1e9, y: 1e9, n: -1 }, count = 0;

    // Linjataulut taululinjojen päätepisteisiin (oletusmitat)
    function sync(x, y, force) {
      var M = root.Merkit;
      if (!M) return;
      if (!force && Math.hypot(x - last.x, y - last.y) < 400) return;
      var list = M.near(x, y, S.showRadius);
      if (!force && list.length === last.n && Math.hypot(x - last.x, y - last.y) < 800) return;
      last.x = x; last.y = y; last.n = list.length;
      var b = new Builder();
      list.forEach(function (a) { addAid(b, a, S); });
      b.wide = false;
      M.nearBoards(x, y, S.showRadius).forEach(function (bd) {
        var ang = Math.atan2(-bd.dirY, bd.dirX) + Math.PI / 2;
        b.cyl(bd.x, -bd.y, 0.08, 0.08, 0, S.boardZ, [0.3, 0.3, 0.3], 6, false);
        b.board(bd.x, -bd.y, S.boardW, S.boardH, S.boardZ, ang, [0.96, 0.78, 0.08], 0.1);
        b.board(bd.x, -bd.y, S.boardW * 0.9, S.boardH * 0.18, S.boardZ + S.boardH * 0.41, ang, [0.1, 0.1, 0.1], 0.1);
      });
      M.nearSigns(x, y, S.showRadius).forEach(function (sg) {
        var c = sg.laji === 6 ? [0.85, 0.15, 0.15] : sg.laji === 11 ? [0.95, 0.75, 0.1] : sg.laji === 15 ? [0.85, 0.15, 0.15] : [0.1, 0.3, 0.7];
        var ang = sg.laji ? sg.laji : 0;   // ei tietoa suunnasta: taulu käännetty vakiosuuntaan, näkyy molemmilta puolilta
        b.cyl(sg.x, -sg.y, 0.05, 0.05, 0, S.signZ + 0.4, [0.35, 0.35, 0.35], 6, false);
        b.board(sg.x, -sg.y, 0.8, 0.8, S.signZ, 0.6, c, 0.05);
        b.board(sg.x, -sg.y, 0.56, 0.56, S.signZ + 0.12, 0.6, [0.96, 0.96, 0.96], 0.05);
      });
      var old = mesh.geometry; mesh.geometry = b.geometry(); old.dispose();
      mesh.visible = b.pos.length > 0; count = list.length;
    }
    function rebase() { last.n = -1; last.x = 1e9; }
    function setPixel(worldPerPx) { pixU.value = worldPerPx; }
    return { mesh: mesh, sync: sync, setPixel: setPixel, rebase: rebase, settings: S, count: function () { return count; }, addAid: addAid, Builder: Builder };
  }

  var api = { create: create, Builder: Builder, SETTINGS: SETTINGS, EC: EC, BANDS: BANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Merkit3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
