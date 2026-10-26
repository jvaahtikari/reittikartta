/* Simulaattori – maasto kuljettajan näkymään (three.js).
 *
 * Maasto on nelipuu: juuret ovat z12-ruutuja, ja aluksen lähellä ruutu jaetaan neljään aina z16:een asti.
 * Jokainen solmu on yksi korkeuskenttäverkko (CELLS x CELLS ruutua) ja yksi peiteteksturi.
 * Maanpinta on aina pelkkä korkeusmalli (maasto.pmtiles). Järven pinta on 95,5 m N2000 ja kuvassa y = 0, joten maailman y = korkeus - 95,5.
 * Lähdeaineiston vesialueet (korkeus alle 95,75 m) painetaan veden alle, jotta vesitaso peittää ne.
 *
 * Vaihe 3j (ulkoasu):
 *  - Maanpinnan väri lasketaan pikseleittäin: maastokuvion luokka, puuston peittävyys ja lajisekoitus (lehtipuuosuus), pintakohina, jyrkät rinteet (yli 30 astetta)
 *    paljaana kalliona ja 3-8 m:n kivinen rantakaista veden ja kasvillisuuden välissä. Normaalit lasketaan laajennetusta korkeusruudukosta, joten reunoissa ei näy saumoja.
 *  - Latvus ei ole enää mukana maastoverkon korkeudessa. Se on oma kerroksensa (latvuskuori, 'shell'): epätasainen kupera pinta ja tekstuuri, joka näkyy kaukana
 *    ja keskietäisyydellä puiden alla. Maastoverkon korkeus pysyy korkeusmallin mukaisena (korkeustarkistus: heightAt ja groundMeshAt).
 *  - Puusto: lähellä (z16-solmut) yksittäisiä puita InstancedMesh-rakenteena (kuusi, mänty, koivu, pensas), keskietäisyydellä (z15 ja z14) ristikkäisinä
 *    billboard-tasoina (kuva-atlas piirretään koodilla), kaukana pelkkä latvuskuori. Kevyessä grafiikassa lähipuutkin ovat billboardeja.
 *  - Rakennukset: korkeus rakennuskorkeudet.json-tiedostosta tai kerrosluokasta, harjakatot, julkisivuvärit ja ikkunarivit.
 * Pintamallin ohuet piikit (piiput, torni) poistetaan tasaamalla maamerkkien kohdalla, koska ne mallinnetaan erikseen mitoista.
 * Verkot rakennetaan aikaviipaleissa (aikabudjetti kuvaa kohden), eikä lataus pysäytä piirtoa. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var P = root.Paikka, A = root.Aineisto;
  var CELLS_Z = { 12: 24, 13: 24, 14: 24, 15: 24, 16: 32 }, TEXN = 256, CANTEX = 128;   // verkon ruutujen määrä sivulla solmun zoomin mukaan
  var Z_MIN = 12, Z_MAX = 16;
  var SPLIT = { 12: 4000, 13: 2000, 14: 900, 15: 380 };   // solmu jaetaan, jos sen lähin etäisyys alukseen on alle tämän (m)
  var MAX_DIST = 12000;                                     // kauempana olevia ruutuja ei piirretä (kaukomaasto näkyy siluettina sumussa)
  var LAKE = P.LAKE_Z, WATERMAX = LAKE + 0.25, WATERFLOOR = LAKE - 1.5;
  var MAX_BUILT = 150, MAX_ACTIVE = 3;
  var CANOPY_MIN = 30, ISLET_AREA_M2 = 10000, ISLET_CANOPY_MAX = 10;   // latvuskerros: vähintään 30 % peittoa, alle 1 ha:n saarilla enintään 10 m
  var ISLET_LOW_M = 3.0;                                   // matala luoto: korkein kohta alle tämän järven pinnasta (m), maalataan kallioksi
  var SHRUB_MAX = 5, SMALL_TREE_MAX = 8;                   // keskipituus < 5 m: pensaikko, 5-8 m: pieni puu, yli: puu
  var SHELL_F = 0.78;                                      // latvuskuoren korkeus suhteessa keskipituuteen (puiden latvat ovat keskipituutta korkeammalla, mutta aukot alentavat pintaa)
  var TREE_NEAR_M = 300, TREE_FAR_M = 700;                 // z16-solmu: alle 300 m pelkät puuinstanssit, 300-700 m harvennetut puut ja latvuskuori
  var TREE_TRI_BUDGET = 120000, BILL_TRI_BUDGET = 150000;   // puuinstanssien ja billboardien kolmiobudjetit koko kuvassa
  var LOD_DIST = [160, 300, 480], LOD_F = [1, 0.5, 0.28, 0.14];   // harvennus z16-solmun etäisyyden mukaan
  var BILL_DIST = [1200, 2200, 3800], BILL_F = [1, 0.62, 0.4];    // billboardien harvennus solmun etäisyyden mukaan, yli 3800 m ei billboardeja
  var STEP_M = { 16: 4.8, 15: 8, 14: 15 };                 // puiden sijoitteluruudukon askel (m) solmun zoomin mukaan
  var PARK_COV = { puisto: 45, hautausmaa: 30, puutarha: 18, open: 10, niitty: 8, urheilu_virkistys: 8 };   // puuttoman luokan puiden peitto (%), kun puustoaineisto ei kata aluetta (puistot, pihat, rannat)
  var BUILT_NARROW_M = 18;                                 // rakennetun rannan leveysraja: maakaista alle 2 x tämä (m) leveä, vettä molemmin puolin
  var BUILT_MAXH = 3.0;                                    // rakennettu ranta vain matalalle maalle: korkeusmallin korkeus enintään tämän verran vedenpinnan yläpuolella (m)
  var BUILT_H = 1.2;                                       // rakennetun rannan (laituri, aallonmurtaja) pinnan korkeus vedenpinnan yläpuolella (m)
  function NOFIX() { return !!root.__maastoNoFix; }        // kuvavertailua varten: ohittaa 3j:n toisen kierroksen korjaukset (maa-alueen korkeusraja, rakennettu ranta, puistopuut)
  var LEAF_DEFAULT = 0.4;                                  // lehtipuuosuus, kun aineistossa ei ole lehtipuukanavaa
  var treeGeo = null, treeMat = null, atlasTex = null, billMat = null, canopyDetail = null;
  var quality = 'full';

  // maastokuvion luokkien pohjavärit (sRGB), joiden päälle pikselikohtainen värinä lasketaan
  var COVER = {
    forest: '#2f4a2a', open: '#8fa65a', kallio: '#86877b', pelto: '#c7b56a', niitty: '#aab665', puisto: '#6f9a52', puutarha: '#86a463',
    taajama: '#838c74', urheilu_virkistys: '#78a352', autoliikenne: '#6e6e6c', suo: '#6f7a4c', soistuma: '#6f7a4c', varastoalue: '#8a8c7e',
    hautausmaa: '#648c4f', lentokentta: '#a2a87a', hietikko: '#d3c595', maatuva_vesialue: '#587a62', jarvi: '#27536f', virtavesi: '#27536f'
  };
  var CLS_NOISE = { forest: 0.2, open: 0.22, kallio: 0.3, pelto: 0.16, niitty: 0.2, puisto: 0.2, puutarha: 0.2, taajama: 0.14, urheilu_virkistys: 0.1, autoliikenne: 0.1, suo: 0.28, soistuma: 0.28, varastoalue: 0.12, hautausmaa: 0.14, lentokentta: 0.12, hietikko: 0.1, maatuva_vesialue: 0.1 };
  var CLS_BY_RGB = null;
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function clsTable() {
    if (CLS_BY_RGB) return CLS_BY_RGB;
    CLS_BY_RGB = new Map();
    Object.keys(COVER).forEach(function (k) { var c = hexRgb(COVER[k]); CLS_BY_RGB.set((c[0] << 16) | (c[1] << 8) | c[2], k); });
    return CLS_BY_RGB;
  }
  var C_SPRUCE = [30, 54, 36], C_PINE = [56, 80, 46], C_BROAD = [76, 104, 46], C_MOSS = [96, 112, 62], C_EARTH = [78, 64, 44];
  var C_ROCK = [132, 130, 122], C_ROCK2 = [108, 112, 100], C_SHORE1 = [138, 135, 126], C_SHORE2 = [160, 152, 134], C_ROAD = [92, 92, 90];

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
  // Arvokohina (value noise) maailmakoordinaateissa, jotta sävy jatkuu solmusta toiseen saumattomasti
  function ihash(x, y, s) { var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = ihash(xi, yi, s), b = ihash(xi + 1, yi, s), c = ihash(xi, yi + 1, s), d = ihash(xi + 1, yi + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function fbm(x, y, s) { return 0.55 * vnoise(x, y, s) + 0.3 * vnoise(2.13 * x + 7.1, 2.13 * y + 3.7, s + 1) + 0.15 * vnoise(4.37 * x + 1.3, 4.37 * y + 9.2, s + 2); }
  function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

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
  // Yksikkökoossa (korkeus 1, latvuksen halkaisija 1): kuusi (kolme kartiota), mänty (ohut runko ja litteä latvus), koivu (vaalea runko ja munamainen latvus), pensas (kupu).
  // Jokainen osa on kiertosymmetrinen rengaslista [y, säde]. Alaosa on tummempi, ja instanssikohtainen väri vaihtelee +-10 %.
  function mkTreeGeo(parts) {
    var pos = [], nor = [], col = [];
    parts.forEach(function (pt) {
      var seg = pt.seg || 6, rot = pt.rot || 0, ox = pt.ox || 0, oz = pt.oz || 0;
      for (var i = 0; i < seg; i++) {
        var a0 = rot + i / seg * Math.PI * 2, a1 = rot + (i + 1) / seg * Math.PI * 2;
        var rings = pt.rings, c = pt.col;
        for (var r = 0; r < rings.length - 1; r++) {
          var lo = rings[r], hi = rings[r + 1];
          var p00 = [ox + Math.cos(a0) * lo[1], lo[0], oz + Math.sin(a0) * lo[1]], p01 = [ox + Math.cos(a1) * lo[1], lo[0], oz + Math.sin(a1) * lo[1]];
          var p10 = [ox + Math.cos(a0) * hi[1], hi[0], oz + Math.sin(a0) * hi[1]], p11 = [ox + Math.cos(a1) * hi[1], hi[0], oz + Math.sin(a1) * hi[1]];
          var tris = [];
          if (lo[1] > 1e-6) tris.push([p00, p11, p01]);
          if (hi[1] > 1e-6) tris.push([p00, p10, p11]);
          tris.forEach(function (t) {
            var ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2], vx = t[2][0] - t[0][0], vy = t[2][1] - t[0][1], vz = t[2][2] - t[0][2];
            var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            var mx = (t[0][0] + t[1][0] + t[2][0]) / 3 - ox, mz = (t[0][2] + t[1][2] + t[2][2]) / 3 - oz;
            if (nx * mx + nz * mz < 0) { var tmp = t[1]; t[1] = t[2]; t[2] = tmp; nx = -nx; ny = -ny; nz = -nz; }
            ny = ny * 0.7 + 0.35; l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;   // lievästi ylöspäin kallistetut normaalit pehmentävät varjostusta
            for (var v = 0; v < 3; v++) {
              pos.push(t[v][0], t[v][1], t[v][2]);
              if (pt.smooth !== undefined) {
                var sx = t[v][0] - ox, sy = t[v][1] - pt.smooth, sz = t[v][2] - oz, sl = Math.hypot(sx, sy, sz) || 1; nor.push(sx / sl, sy / sl, sz / sl);
              } else nor.push(nx, ny, nz);
              var sh = pt.flat ? 1 : 0.74 + 0.26 * Math.min(1, Math.max(0, t[v][1]));
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
    var TR = [0.46, 0.34, 0.24], BR = [0.80, 0.78, 0.70];
    treeGeo = [
      // 0 kuusi: kolme kartiota
      mkTreeGeo([{ seg: 6, col: [0.10, 0.24, 0.13], rings: [[0.06, 0.5], [0.50, 0]] }, { seg: 6, rot: 0.5, col: [0.12, 0.27, 0.14], rings: [[0.30, 0.38], [0.76, 0]] }, { seg: 6, col: [0.14, 0.30, 0.15], rings: [[0.56, 0.26], [1.0, 0]] }]),
      // 1 mänty: runko ja kaksi litteää latvustyynyä
      mkTreeGeo([{ seg: 3, flat: true, col: TR, rings: [[0, 0.05], [0.62, 0.03]] }, { seg: 6, smooth: 0.72, col: [0.17, 0.30, 0.15], rings: [[0.42, 0], [0.56, 0.5], [0.80, 0.40], [1.0, 0]] }]),
      // 2 koivu: vaalea runko ja munamainen latvus
      mkTreeGeo([{ seg: 3, flat: true, col: BR, rings: [[0, 0.035], [0.5, 0.025]] }, { seg: 6, smooth: 0.55, col: [0.32, 0.46, 0.17], rings: [[0.26, 0], [0.56, 0.5], [1.0, 0]] }]),
      // 3 pensas: kupu
      mkTreeGeo([{ seg: 5, smooth: 0.3, col: [0.34, 0.43, 0.17], rings: [[-0.05, 0.5], [0.62, 0.42], [1.0, 0]] }])
    ];
    return treeGeo;
  }
  function getTreeMat() {
    if (!treeMat) { treeMat = new THREE.MeshLambertMaterial({ vertexColors: true }); treeMat.userData.shared = true; }
    return treeMat;
  }

  // ---------- billboard-atlas: 3 x 2 kuvaa (kuusi, mänty, koivu, kuusiryhmä, lehtipuuryhmä, pensas), piirretään koodilla ----------
  function drawAtlas() {
    var T = 256, cv = document.createElement('canvas'); cv.width = T * 3; cv.height = T * 2;
    var g = cv.getContext('2d'), rnd = rng(20261026);
    function rgb(c, k) { return 'rgb(' + Math.round(Math.min(255, c[0] * k)) + ',' + Math.round(Math.min(255, c[1] * k)) + ',' + Math.round(Math.min(255, c[2] * k)) + ')'; }
    function spruce(cx, base, h, w, k) {
      var tiers = 8;
      g.fillStyle = rgb([70, 50, 34], k); g.fillRect(cx - w * 0.03, base - h * 0.12, w * 0.06, h * 0.14);
      for (var t = 0; t < tiers; t++) {
        var f0 = t / tiers, f1 = (t + 1.9) / tiers, yTop = base - h * (1 - f0 * 0.93) + h * 0.05, yBot = base - h * (1 - f1) * 0.96 - h * 0.02 + h * 0.10;
        var yb = Math.min(base - h * 0.06, yTop + h * (0.30 - 0.12 * f0)), half = w * (0.12 + 0.40 * (t + 1) / tiers) * (0.94 + 0.12 * rnd());
        var shade = (0.82 + 0.34 * rnd()) * k;
        g.fillStyle = rgb(C_SPRUCE, shade * 1.15 + 0.1 * (1 - f0)); g.beginPath();
        g.moveTo(cx, yTop);
        g.lineTo(cx + half * 0.55, yTop + (yb - yTop) * 0.55); g.lineTo(cx + half, yb); g.lineTo(cx + half * 0.5, yb - (yb - yTop) * 0.12);
        g.lineTo(cx, yb - (yb - yTop) * 0.06); g.lineTo(cx - half * 0.5, yb - (yb - yTop) * 0.12); g.lineTo(cx - half, yb); g.lineTo(cx - half * 0.55, yTop + (yb - yTop) * 0.55);
        g.closePath(); g.fill();
      }
    }
    function blob(cx, cy, rx, ry, cols, n) {
      for (var i = 0; i < n; i++) {
        var a = rnd() * 6.283, rr = Math.sqrt(rnd()), x = cx + Math.cos(a) * rx * rr, y = cy + Math.sin(a) * ry * rr, r = (0.14 + 0.16 * rnd()) * Math.min(rx, ry) * 2;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, 6.283); g.fill();
      }
    }
    function pine(cx, base, h, w, k) {
      g.strokeStyle = rgb([104, 70, 46], k); g.lineCap = 'round'; g.lineWidth = Math.max(3, w * 0.06);
      g.beginPath(); g.moveTo(cx, base); g.quadraticCurveTo(cx + w * 0.05, base - h * 0.45, cx - w * 0.02, base - h * 0.78); g.stroke();
      var cols = [rgb(C_PINE, 0.85 * k), rgb(C_PINE, 1.05 * k), rgb(C_PINE, 1.3 * k), rgb([40, 64, 40], k)];
      blob(cx - w * 0.14, base - h * 0.80, w * 0.28, h * 0.075, cols, 26);
      blob(cx + w * 0.16, base - h * 0.68, w * 0.26, h * 0.07, cols, 24);
      blob(cx, base - h * 0.90, w * 0.30, h * 0.085, cols, 30);
    }
    function birch(cx, base, h, w, k) {
      g.strokeStyle = rgb([226, 224, 214], k); g.lineCap = 'round'; g.lineWidth = Math.max(2.5, w * 0.045);
      g.beginPath(); g.moveTo(cx, base); g.lineTo(cx + w * 0.02, base - h * 0.55); g.stroke();
      var cols = [rgb(C_BROAD, 0.8 * k), rgb(C_BROAD, 1.0 * k), rgb(C_BROAD, 1.2 * k), rgb([104, 134, 56], k)];
      blob(cx, base - h * 0.66, w * 0.5, h * 0.32, cols, 70);
    }
    function tile(i, fn) { g.save(); g.translate((i % 3) * T, Math.floor(i / 3) * T); g.beginPath(); g.rect(0, 0, T, T); g.clip(); fn(); g.restore(); }
    tile(0, function () { spruce(T / 2, T - 6, T - 14, T * 0.50, 1); });
    tile(1, function () { pine(T / 2, T - 6, T - 12, T * 0.62, 1); });
    tile(2, function () { birch(T / 2, T - 6, T - 12, T * 0.68, 1); });
    tile(3, function () { spruce(T * 0.30, T - 6, T * 0.72, T * 0.36, 0.95); spruce(T * 0.72, T - 6, T * 0.80, T * 0.40, 1.05); spruce(T * 0.50, T - 6, T - 14, T * 0.48, 1); });
    tile(4, function () { birch(T * 0.28, T - 6, T * 0.76, T * 0.50, 0.95); spruce(T * 0.74, T - 6, T * 0.70, T * 0.34, 1); birch(T * 0.52, T - 6, T - 14, T * 0.58, 1.05); });
    tile(5, function () { blob(T / 2, T * 0.72, T * 0.44, T * 0.22, [rgb(C_MOSS, 0.8), rgb(C_MOSS, 1.0), rgb(C_MOSS, 1.25), rgb(C_BROAD, 0.9)], 70); });
    return cv;
  }
  function getAtlas() {
    if (atlasTex) return atlasTex;
    atlasTex = new THREE.CanvasTexture(drawAtlas());
    atlasTex.encoding = THREE.sRGBEncoding; atlasTex.anisotropy = 2; atlasTex.generateMipmaps = true;
    atlasTex.minFilter = THREE.LinearMipmapLinearFilter; atlasTex.magFilter = THREE.LinearFilter;
    return atlasTex;
  }
  function getBillMat() {
    if (billMat) return billMat;
    billMat = new THREE.MeshLambertMaterial({ map: getAtlas(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true });
    billMat.userData.shared = true;
    billMat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vUv = uv * vec2(0.33333, 0.5) + vec2(floor(mod(aTile + 0.5, 3.0)), (1.0 - floor((aTile + 0.5) / 3.0)) * 0.5) * vec2(0.33333, 1.0);');
    };
    billMat.customProgramCacheKey = function () { return 'maasto-bill2'; };
    return billMat;
  }
  var billGeoCache = null;
  // kaksi ristikkäistä pystytasoa, pohja y = 0, korkeus 1, leveys 1
  function getBillGeo() {
    if (billGeoCache) return billGeoCache;
    var pos = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5];
    var uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], nor = [];
    for (var i = 0; i < 8; i++) nor.push(0, 1, 0);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    g.userData.tris = 4;
    billGeoCache = g;
    return g;
  }
  // Instanssien matriisit: sijainti, kierto ja koko (leveys w, korkeus h); widen levittää harvennettuja kruunuja.
  // base: [x, y, z, w, h, rot] kuutta lukua per instanssi, jotta uudelleenkirjoitus on halpaa
  function writeMatrices(im, widen) {
    var b = im.userData.base, n = b.length / 6, arr = im.instanceMatrix.array, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (var i = 0; i < n; i++) {
      var o = i * 6; q.setFromAxisAngle(up, b[o + 5]); p.set(b[o], b[o + 1], b[o + 2]); sc.set(b[o + 3] * widen, b[o + 4], b[o + 3] * widen);
      m.compose(p, q, sc); m.toArray(arr, i * 16);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  // Billboardit yhdistetään yhdeksi verkoksi solmua kohden (kahdeksan kärkeä per puu), koska ohjelmistopiirtäjässä (SwiftShader) instansoitu piirto on noin kolminkertaisesti hitaampaa.
  // Kärkien asemat lasketaan prosessorilla (sijainti, kierto, koko ja levennys), ja näkyvien puiden määrä rajataan piirtoalueella (drawRange), koska puut ovat satunnaisjärjestyksessä.
  var BILL_P = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5];
  var BILL_UV = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], BILL_IX = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  function writeBill(mesh, widen) {
    var b = mesh.userData.base, n = b.length / 6, arr = mesh.geometry.attributes.position.array, i, v, o, k = 0, c, s, w, h;
    for (i = 0; i < n; i++) {
      o = i * 6; c = Math.cos(b[o + 5]); s = Math.sin(b[o + 5]); w = b[o + 3] * widen; h = b[o + 4];
      for (v = 0; v < 8; v++) {
        var lx = BILL_P[v * 3] * w, ly = BILL_P[v * 3 + 1] * h, lz = BILL_P[v * 3 + 2] * w;
        arr[k++] = b[o] + lx * c + lz * s; arr[k++] = b[o + 1] + ly; arr[k++] = b[o + 2] - lx * s + lz * c;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
  }
  function makeBillMesh(base, tiles, cols, cnt, bsph) {
    var nv = cnt * 8, nor = new Int8Array(nv * 3), uv = new Uint8Array(nv * 2), col = new Float32Array(nv * 3), tl = new Uint8Array(nv), ix = nv > 65000 ? new Uint32Array(cnt * 12) : new Uint16Array(cnt * 12), i, v;
    for (i = 0; i < cnt; i++) {
      for (v = 0; v < 8; v++) {
        var q = i * 8 + v; nor[q * 3 + 1] = 127; uv[q * 2] = BILL_UV[v * 2] * 255; uv[q * 2 + 1] = BILL_UV[v * 2 + 1] * 255; tl[q] = tiles[i];
        col[q * 3] = cols[i * 3]; col[q * 3 + 1] = cols[i * 3 + 1]; col[q * 3 + 2] = cols[i * 3 + 2];
      }
      for (v = 0; v < 12; v++) ix[i * 12 + v] = i * 8 + BILL_IX[v];
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2, true));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aTile', new THREE.BufferAttribute(tl, 1));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.boundingSphere = bsph;
    var m = new THREE.Mesh(g, getBillMat());
    m.userData = { base: base, kind: 'bill', total: cnt, trisPer: 4, widen: 1 };
    writeBill(m, 1);
    return m;
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

  // Lajijakauma paikassa (nx, ny: maailmakoordinaatit metreinä): lehtipuun osuus bf (0-1) ja männyn osuus havupuista pf (0-1).
  // Lehtipuuosuus ls on aineiston kanavasta tai oletus 0,4. Laikut (noin 55 m) tekevät kuusikoista, koivikoista ja mäntykangasta erottuvia.
  function species(nx, ny, ls) {
    var sp = fbm(nx / 55, ny / 55, 31), bf = sstep(0.28, 0.72, ls + (sp - 0.5) * 1.5 + (vnoise(nx / 9, ny / 9, 37) - 0.5) * 0.3);
    var pf = sstep(0.38, 0.62, fbm(nx / 42 + 11, ny / 42 - 5, 41));
    return { bf: bf, pf: pf };
  }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function create(scene, opts) {
    opts = opts || {};
    var group = new THREE.Group(); group.name = 'maasto'; scene.add(group);
    var nodes = new Map(), roots = [], jobs = [], queue = [], shown = [];
    var boat = { x: 0, y: 0 }, gate = false, flatten = [], dirty = true, lastSel = { x: 1e9, y: 1e9 };
    var stats = { built: 0, empty: 0, builds: 0, buildMs: 0, maxJobMs: 0, jobsDone: 0 };
    var wireframe = false;
    var useBuildings = opts.buildings !== false;
    var stage = typeof root.__maastoStage === 'number' ? root.__maastoStage : 9;   // kuvausvaiheet: 3 maasto ja latvuskuori, 4 puut, 5 rakennukset, 9 kaikki
    var leafChan = -1, bHeights = null, bHeightsP = null;

    function key(z, x, y) { return z + '/' + x + '/' + y; }
    function getNode(z, x, y) {
      var k = key(z, x, y), n = nodes.get(k);
      if (n) return n;
      var c = P.tileLonLat(z, x, y, 0.5, 0.5), en = P.lonlatToEN(c.lon, c.lat);
      n = { key: k, z: z, x: x, y: y, cells: CELLS_Z[z], n1: CELLS_Z[z] + 1, e: en.e, n: en.n, size: sizeM(z, c.lat), state: 'new', mesh: null, shell: null, bmesh: null, tmeshes: null, mode: 'far', hgrid: null, ggrid: null, children: null, last: 0, noKids: false };
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

    // Lehtipuuosuuden kanava: jos paketin kuvauksessa (aineisto.json, tiilet.puusto.koodaus) mainitaan lehtipuuosuus kanavassa (R, G, B tai A), käytetään sitä
    // (arvo 0-100 prosenttia, A-kanavassa 0 = ei metsää, joten A-kanavaa ei käytetä ellei sitä erikseen mainita). Muuten oletus.
    if (A && A.meta) A.meta().then(function (m) {
      try {
        var s = JSON.stringify(m && m.tiilet && m.tiilet.puusto || ''), mm = /lehtipuu\w*[_%\s=]*[^A-Za-z]{0,6}\b([RGBA])\b/i.exec(s);
        if (mm) leafChan = 'RGBA'.indexOf(mm[1].toUpperCase());
      } catch (e) { /* oletus */ }
    }, function () { });

    // ---------- solmun rakennus ----------
    // Normaalit laajennetusta (N1+2)^2 korkeusruudukosta keskeisdifferensseillä: paikallinen x = E, y = korkeus, z = -N (j kasvaa etelään eli z kasvaa)
    function gridNormals(ge, N1, cM) {
      var W = N1 + 2, nrm = new Float32Array(N1 * N1 * 3), nyv = new Float32Array(N1 * N1);
      for (var j = 0; j < N1; j++) for (var i = 0; i < N1; i++) {
        var q = (j + 1) * W + (i + 1), dx = (ge[q + 1] - ge[q - 1]) / (2 * cM), dz = (ge[q + W] - ge[q - W]) / (2 * cM);
        var l = Math.sqrt(dx * dx + 1 + dz * dz), k = j * N1 + i;
        nrm[k * 3] = -dx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -dz / l; nyv[k] = 1 / l;
      }
      return { nrm: nrm, ny: nyv };
    }

    function* buildGen(n) {
      var t0 = performance.now();
      var CELLS = n.cells, N1 = n.n1;
      var z = n.z, zd = Math.min(z, 14), sc = Math.pow(2, z - zd), dx = Math.floor(n.x / sc), dy = Math.floor(n.y / sc);
      var zt = Math.min(Math.max(z, 10), 14), sct = Math.pow(2, z - zt), tdx = Math.floor(n.x / sct), tdy = Math.floor(n.y / sct);
      var res = null;
      var wantB = useBuildings && (z >= 15 || (z === 14 && stage >= 5));
      var names = ['maastokuvio', 'tie'].concat(wantB ? ['rakennus'] : []).concat(z >= 15 && !NOFIX() ? ['vesieste'] : []);
      var pr = Promise.all([demHeights('dem', zd, dx, dy), Promise.resolve(null), z >= 10 ? treeImg(zt, tdx, tdy) : Promise.resolve(null), wantB ? loadBuildingHeights() : Promise.resolve(null)]).then(function (r) { res = r; });
      yield pr;
      var dem = res[0], tree = res[2];
      if (!dem) { n.state = 'water'; return; }
      // maastokuvion ja vesieste-kerroksen lataus ennen korkeuksia: maa-alueet ja rakennettu ranta vaikuttavat verkon korkeuteen
      var lyr = null;
      var vp = A.layers(z, n.x, n.y, names).then(function (r) { lyr = r; }, function () { lyr = null; });
      yield vp;
      var cv = document.createElement('canvas'); cv.width = TEXN; cv.height = TEXN;
      var cg = cv.getContext('2d', { willReadFrequently: true });
      paintPolys(cg, lyr);
      var LM = landRasters(cg, z >= 15), landPx = LM.land, parkCov = LM.park, builtPx = (z >= 15 && !NOFIX() && lyr) ? builtShore(n, lyr.vesieste, landPx) : null;
      if (builtPx && parkCov) for (var bpi = 0; bpi < builtPx.length; bpi++) if (builtPx[bpi]) parkCov[bpi] = 0;
      var tStart = performance.now();
      // --- korkeudet ---
      var g = new Float32Array(N1 * N1), E = new Float64Array(N1 * N1), Nn = new Float64Array(N1 * N1);
      var tht = new Float32Array(N1 * N1), tcv = new Float32Array(N1 * N1), gm = new Float32Array(N1 * N1);
      var ox = n.x - dx * sc, oy = n.y - dy * sc, oxt = n.x - tdx * sct, oyt = n.y - tdy * sct;
      var cellU = 1 / CELLS, anyLand = false, cM = n.size / CELLS;
      for (var j = 0; j <= CELLS; j++) {
        for (var i = 0; i <= CELLS; i++) {
          var u = i * cellU, v = j * cellU, k = j * N1 + i;
          var ll = P.tileLonLat(z, n.x, n.y, u, v), en = P.lonlatToEN(ll.lon, ll.lat);
          E[k] = en.e; Nn[k] = en.n;
          var gh = sampleH(dem, (ox + u) / sc, (oy + v) / sc); if (gh !== gh) gh = LAKE;
          g[k] = gh;
          if (tree && gh > WATERMAX && z >= 13) {
            var q = (Math.min(tree.h - 1, Math.floor((oyt + v) / sct * tree.h)) * tree.w + Math.min(tree.w - 1, Math.floor((oxt + u) / sct * tree.w))) * 4;
            if (tree.data[q + 3] > 0 && tree.data[q + 2] >= CANOPY_MIN) { tht[k] = (tree.data[q] * 256 + tree.data[q + 1]) * 0.1; tcv[k] = tree.data[q + 2]; }
          }
        }
      }
      // laajennettu ruudukko (yksi ruutu joka suuntaan reunan yli) normaaleja varten: reunat eivät saa näkyä saumoina
      var W2 = N1 + 2, ge = new Float32Array(W2 * W2);
      for (var je = -1; je <= CELLS + 1; je++) for (var ie = -1; ie <= CELLS + 1; ie++) {
        var gh2 = sampleH(dem, (ox + ie * cellU) / sc, (oy + je * cellU) / sc); if (gh2 !== gh2 || gh2 < LAKE) gh2 = LAKE;
        ge[(je + 1) * W2 + (ie + 1)] = gh2;
      }
      var NR = gridNormals(ge, N1, cM);
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
      var isl = islands(g, tht, E, Nn, N1, CELLS, cM, n.isletStats = []);
      // maamerkkien kohdalla latvuskerros poistetaan (ympyrä tai monikulmio)
      var flatHere = [];
      for (var f = 0; f < flatten.length; f++) {
        var L = flatten[f];
        if (Math.abs(L.e - n.e) > n.size * 0.8 + L.r * 2 || Math.abs(L.n - n.n) > n.size * 0.8 + L.r * 2) continue;
        flatHere.push(L);
        for (var kk = 0; kk < tht.length; kk++) {
          var dd = L.poly ? (inPoly(L.poly, E[kk], Nn[kk]) ? 0 : L.r * 2) : Math.hypot(E[kk] - L.e, Nn[kk] - L.n);
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
          if (tt > -8 && tt < CR.len && Math.abs(rx * CR.uy - ry * CR.ux) < CR.half + cM * 0.5) tht[kc2] = 0;
        }
      }
      // maanpinta: pelkkä korkeusmalli, vesialueet painetaan veden alle
      // Maa-alue (maastokuvion maa) ei koskaan painu veden alle: solun korkeus on vähintään LAKE + 0,4. Rakennettu ranta (laituri, aallonmurtaja, kapea maakaista) on tasainen 1,2 m vedenpinnan yläpuolella.
      var bv = null, fixN = 0, fixS = [], builtN = 0, builtS = [];
      if (!NOFIX()) {
        var cpx = TEXN / CELLS;
        if (builtPx) {
          bv = new Uint8Array(N1 * N1);
          var hwp = Math.max(1, Math.floor(cpx * 0.55));
          for (var bj = 0; bj <= CELLS; bj++) for (var bi2 = 0; bi2 <= CELLS; bi2++) {
            var bx0 = Math.round(bi2 * cpx), by0 = Math.round(bj * cpx), cnt = 0, tot2 = 0;
            for (var yy = Math.max(0, by0 - hwp); yy <= Math.min(TEXN - 1, by0 + hwp); yy++) for (var xx = Math.max(0, bx0 - hwp); xx <= Math.min(TEXN - 1, bx0 + hwp); xx++) { tot2++; if (builtPx[yy * TEXN + xx]) cnt++; }
            if (tot2 && cnt / tot2 >= 0.3) bv[bj * N1 + bi2] = 1;
          }
        }
        for (var m0 = 0; m0 < g.length; m0++) {
          var mi = m0 % N1, mj = (m0 - mi) / N1, lvk = landPx[Math.min(TEXN - 1, Math.round(mj * cpx)) * TEXN + Math.min(TEXN - 1, Math.round(mi * cpx))];
          if (bv && bv[m0] && g[m0] <= LAKE + BUILT_MAXH) { builtN++; if (builtS.length < 6) builtS.push([Math.round(E[m0]), Math.round(Nn[m0]), +g[m0].toFixed(2)]); g[m0] = LAKE + 1.2; tht[m0] = 0; }
          else if (g[m0] <= WATERMAX && lvk) { fixN++; if (g[m0] < LAKE - 0.2 && fixS.length < 6) fixS.push([Math.round(E[m0]), Math.round(Nn[m0]), +g[m0].toFixed(2)]); g[m0] = LAKE + 0.4; }
        }
      }
      if (bv) for (var zk = 0; zk < bv.length; zk++) if (bv[zk]) {   // latvus pois myös rakennetun rannan viereisiltä pisteiltä
        var zi = zk % N1, zj = (zk - zi) / N1;
        for (var zb = -1; zb <= 1; zb++) for (var za = -1; za <= 1; za++) { var zi2 = zi + za, zj2 = zj + zb; if (zi2 >= 0 && zj2 >= 0 && zi2 < N1 && zj2 < N1) tht[zj2 * N1 + zi2] = 0; }
      }
      n.fixStat = { land: fixN, built: builtN, landS: fixS, builtS: builtS };
      for (var m = 0; m < g.length; m++) {
        if (g[m] <= WATERMAX) { gm[m] = WATERFLOOR; tht[m] = 0; } else { gm[m] = g[m]; anyLand = true; }
      }
      // latvuskuoren korkeus (m maanpinnan yläpuolella): latvus loivenee rantaviivalla, ja pinta on epätasainen (kohina)
      var wd = waterDist(g, N1), shv = new Float32Array(N1 * N1), hcan = new Float32Array(N1 * N1);
      for (var mf = 0; mf < gm.length; mf++) {
        var dMeters = wd[mf] * cM, tp = wd[mf] === 0 ? 0 : (wd[mf] >= 3 ? 1 : Math.min(1, dMeters / 30));
        var hh0 = tht[mf] > 0 ? effH(tht[mf]) * SHELL_F * tp * (0.82 + 0.36 * fbm((n.x + (mf % N1) / CELLS) * n.size / 28, (n.y + Math.floor(mf / N1) / CELLS) * n.size / 28, 3)) : 0;
        shv[mf] = hh0; hcan[mf] = g[mf] + hh0;
      }
      // rantaviivan jyrkkyys (tilastoon): maanpinnan nousu rannan viimeisen maapisteen ja vesipisteen välillä (korkeusero / ruudun leveys)
      var st = { n: 0, maxT: 0, maxU: 0, sumT: 0, sumU: 0 };
      for (var ks2 = 0; ks2 < gm.length; ks2++) {
        if (wd[ks2] !== 1) continue;
        var up = (gm[ks2] - WATERFLOOR) / cM;
        st.n++; st.sumT += up; st.sumU += up; if (up > st.maxT) st.maxT = up; if (up > st.maxU) st.maxU = up;
      }
      n.shoreStat = st;
      n.hgrid = hcan; n.ggrid = g; n.gmgrid = gm;
      if (!anyLand) { n.state = 'empty'; return; }
      yield;
      // --- geometria (paikalliset koordinaatit solmun keskipisteen suhteen) ---
      var nv = N1 * N1, skirt = 4 * CELLS, tot = nv + skirt * 2;
      var pos = new Float32Array(tot * 3), uv = new Float32Array(tot * 2), idx = new Uint16Array(CELLS * CELLS * 6 + skirt * 6), nrm = new Float32Array(tot * 3);
      for (var j2 = 0; j2 <= CELLS; j2++) for (var i2 = 0; i2 <= CELLS; i2++) {
        var kv = j2 * N1 + i2;
        pos[kv * 3] = E[kv] - n.e; pos[kv * 3 + 1] = gm[kv] - LAKE; pos[kv * 3 + 2] = -(Nn[kv] - n.n);
        uv[kv * 2] = i2 / CELLS; uv[kv * 2 + 1] = 1 - j2 / CELLS;
        nrm[kv * 3] = NR.nrm[kv * 3]; nrm[kv * 3 + 1] = NR.nrm[kv * 3 + 1]; nrm[kv * 3 + 2] = NR.nrm[kv * 3 + 2];
      }
      var ti = 0;
      for (var j3 = 0; j3 < CELLS; j3++) for (var i3 = 0; i3 < CELLS; i3++) {
        var a = j3 * N1 + i3, b = (j3 + 1) * N1 + i3, c = j3 * N1 + i3 + 1, d2 = (j3 + 1) * N1 + i3 + 1;
        idx[ti++] = a; idx[ti++] = b; idx[ti++] = c; idx[ti++] = b; idx[ti++] = d2; idx[ti++] = c;
      }
      // reunahelmat (skirts): reunan pisteet kopioituna alas, jotta eritasoisten naapureiden väliin ei jää rakoja
      var drop = Math.min(120, Math.max(6, n.size * 0.05)), edge = [];
      for (var e1 = 0; e1 < CELLS; e1++) edge.push(e1);                                     // pohjoinen (j=0), i kasvaa
      for (var e2 = 0; e2 < CELLS; e2++) edge.push(e2 * N1 + CELLS);                        // itä (i=CELLS), j kasvaa
      for (var e3 = 0; e3 < CELLS; e3++) edge.push(CELLS * N1 + (CELLS - e3));              // etelä, i pienenee
      for (var e4 = 0; e4 < CELLS; e4++) edge.push((CELLS - e4) * N1);                      // länsi, j pienenee
      var top = nv, base = nv + skirt;
      for (var q2 = 0; q2 < skirt; q2++) {
        var s0 = edge[q2];
        pos[(top + q2) * 3] = pos[s0 * 3]; pos[(top + q2) * 3 + 1] = pos[s0 * 3 + 1]; pos[(top + q2) * 3 + 2] = pos[s0 * 3 + 2];
        uv[(top + q2) * 2] = uv[s0 * 2]; uv[(top + q2) * 2 + 1] = uv[s0 * 2 + 1];
        pos[(base + q2) * 3] = pos[s0 * 3]; pos[(base + q2) * 3 + 1] = pos[s0 * 3 + 1] - drop; pos[(base + q2) * 3 + 2] = pos[s0 * 3 + 2];
        uv[(base + q2) * 2] = uv[s0 * 2]; uv[(base + q2) * 2 + 1] = uv[s0 * 2 + 1];
      }
      for (var q3 = 0; q3 < skirt; q3++) {
        var nx = (q3 + 1) % skirt, t0i = top + q3, t1i = top + nx, b0i = base + q3, b1i = base + nx;
        idx[ti++] = t0i; idx[ti++] = t1i; idx[ti++] = b0i; idx[ti++] = b0i; idx[ti++] = t1i; idx[ti++] = b1i;
      }
      for (var q4 = nv; q4 < tot; q4++) { nrm[q4 * 3] = 0; nrm[q4 * 3 + 1] = 1; nrm[q4 * 3 + 2] = 0; }   // reunahelmojen normaalit ylös
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      yield;
      // --- peiteteksturi ---
      var cctx = { n: n, tree: tree, oxt: oxt, oyt: oyt, sct: sct, g: g, ny: NR.ny, isl: isl, CELLS: CELLS, N1: N1, cM: cM, built: builtPx, gm: gm };
      finishCover(cg, cctx);
      paintRoads(cg, lyr);
      var tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 2; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      var mat = new THREE.MeshLambertMaterial({ map: tex });
      mat.onBeforeCompile = lakeFloorShader; mat.customProgramCacheKey = function () { return 'maasto-lake'; };
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.node = n; mesh.frustumCulled = true; mesh.matrixAutoUpdate = false;
      n.mesh = mesh;
      yield;
      // --- latvuskuori ---
      if (tree && z >= 13) {
        var sh = buildShell(n, { pos: pos, uv: uv, shv: shv, tree: tree, oxt: oxt, oyt: oyt, sct: sct, CELLS: CELLS, N1: N1, gm: gm, E: E, Nn: Nn, g: g });
        if (sh) n.shell = sh;
      }
      yield;
      // --- puut ---
      if (tree && z >= 14 && stage >= 4) {
        var lx = new Float32Array(N1 * N1), lz = new Float32Array(N1 * N1), capMask = new Uint8Array(N1 * N1);
        for (var kc = 0; kc < lx.length; kc++) { lx[kc] = E[kc] - n.e; lz[kc] = -(Nn[kc] - n.n); capMask[kc] = isl[kc] && !(isl[kc] & 4) ? 1 : 0; }
        n.recs = placeTrees(n, { tree: tree, oxt: oxt, oyt: oyt, sct: sct, tht: tht, gm: gm, lx: lx, lz: lz, avoid: avoid, corr: corr, flat: flatHere, capMask: capMask, isl: isl, ny: NR.ny, park: parkCov });
        n.tmeshes = makeTreeMeshes(n);
      }
      yield;
      if (wantB && lyr && lyr.rakennus && lyr.rakennus.features.length && stage >= 3) {
        var bm = stage >= 5 ? buildBuildings(n, lyr.rakennus, g, flatHere) : buildBuildingsOld(n, lyr.rakennus, null, g);
        if (bm) { n.bmesh = bm; }
      }
      n.mode = 'far';
      n.state = 'built';
      stats.builds++; stats.buildMs += performance.now() - tStart;
    }
    function inPoly(poly, e, nn) {
      var inside = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if (((yi > nn) !== (yj > nn)) && (e < (xj - xi) * (nn - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }

    // ---------- peiteteksturi ----------
    // Kruunun väri paikassa: sekametsän sävy lajijakauman mukaan (kuusi tumma sinivihreä, mänty oliivinvihreä, koivu kirkas vihreä)
    function crownColor(nx, ny, ls, speck) {
      var sp = species(nx, ny, ls), conif = mix3(C_SPRUCE, C_PINE, sp.pf), col = mix3(conif, C_BROAD, sp.bf), k = 0.78 + 0.36 * speck;
      return [col[0] * k, col[1] * k, col[2] * k];
    }
    function leafAt(td, q) {
      if (leafChan < 0) return LEAF_DEFAULT;
      return Math.min(1, td[q + leafChan] / (leafChan === 3 ? 255 : 100));
    }
    // Maastokuviopolygonit pohjaväreinä: järvet ensin, sitten muut (järvipolygonit eivät saa peittää saaria)
    function paintPolys(g, lyr) {
      g.fillStyle = COVER.forest; g.fillRect(0, 0, TEXN, TEXN);
      if (!lyr || !lyr.maastokuvio) return;
      var mk = lyr.maastokuvio, ext = mk.extent, order = { jarvi: 0, virtavesi: 0, maatuva_vesialue: 1 };
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
    // Etäisyysmuunnos (tekseleinä): etäisyys lähimpään nollamaskin (zero[i] = 1) pikseliin, kaksi läpikäyntiä
    function distTo(zero) {
      var N = TEXN * TEXN, W = TEXN, dist = new Float32Array(N), di, tx, ty, i;
      for (i = 0; i < N; i++) dist[i] = zero[i] ? 0 : 99;
      for (ty = 0; ty < TEXN; ty++) for (tx = 0; tx < TEXN; tx++) {
        i = ty * W + tx; di = dist[i];
        if (tx > 0 && dist[i - 1] + 1 < di) di = dist[i - 1] + 1;
        if (ty > 0) {
          if (dist[i - W] + 1 < di) di = dist[i - W] + 1;
          if (tx > 0 && dist[i - W - 1] + 1.414 < di) di = dist[i - W - 1] + 1.414;
          if (tx < W - 1 && dist[i - W + 1] + 1.414 < di) di = dist[i - W + 1] + 1.414;
        }
        dist[i] = di;
      }
      for (ty = TEXN - 1; ty >= 0; ty--) for (tx = TEXN - 1; tx >= 0; tx--) {
        i = ty * W + tx; di = dist[i];
        if (tx < W - 1 && dist[i + 1] + 1 < di) di = dist[i + 1] + 1;
        if (ty < TEXN - 1) {
          if (dist[i + W] + 1 < di) di = dist[i + W] + 1;
          if (tx < W - 1 && dist[i + W + 1] + 1.414 < di) di = dist[i + W + 1] + 1.414;
          if (tx > 0 && dist[i + W - 1] + 1.414 < di) di = dist[i + W - 1] + 1.414;
        }
        dist[i] = di;
      }
      return dist;
    }
    // Maapikselit (vesi = sininen pohjaväri) ja puistopuiden peitto maastokuvion luokasta (vain z15 ja z16)
    function landRasters(g, wantPark) {
      var d = g.getImageData(0, 0, TEXN, TEXN).data, N = TEXN * TEXN, land = new Uint8Array(N), park = wantPark ? new Uint8Array(N) : null, tbl = clsTable(), i, o;
      for (i = 0; i < N; i++) {
        o = i * 4;
        if (d[o + 2] <= d[o] + 10) land[i] = 1;
        if (park && land[i]) { var cls = tbl.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]); if (cls && PARK_COV[cls]) park[i] = PARK_COV[cls]; }
      }
      return { land: land, park: park };
    }
    // Rakennettu ranta: (1) maa-alue, joka osuu vesieste-kerroksen laiturin tai aallonmurtajan kohdalle, ja (2) kapea maakaista (alle 2 x BUILT_NARROW_M leveä, vettä molemmin puolin),
    // jonka pituus on vähintään 50 m ja pinta-ala vähintään 300 m2 (aallonmurtajat ja laiturit, jotka maastokuviossa ovat maata). Kapea = avaus (eroosio + laajennus BUILT_NARROW_M) ei säilytä kaistaa.
    function builtShore(n, ves, landPx) {
      var feats = ves ? ves.features : [], ext = ves ? ves.extent || 4096 : 4096, s = TEXN / ext, texM = n.size / TEXN, N = TEXN * TEXN, f, r, k, p, i;
      var cv2 = document.createElement('canvas'); cv2.width = TEXN; cv2.height = TEXN;
      var g2 = cv2.getContext('2d', { willReadFrequently: true });
      g2.strokeStyle = '#fff'; g2.fillStyle = '#fff'; g2.lineCap = 'butt'; g2.lineJoin = 'round';
      for (i = 0; i < feats.length; i++) {
        f = feats[i]; var laji = String(f.props && f.props.laji || ''), narrow = laji === 'laituri_kapea', isP = /^laituri/.test(laji), isB = /aallonmurt/.test(laji);
        if (!isP && !isB) continue;
        var w = narrow ? 2 : (isP ? 5 : 4);
        if (f.type === 2) {
          g2.lineWidth = Math.max(2, (w + 5) / texM); g2.beginPath();
          for (p = 0; p < f.parts.length; p++) { var ln = f.parts[p]; g2.moveTo(ln[0] * s, ln[1] * s); for (k = 2; k < ln.length; k += 2) g2.lineTo(ln[k] * s, ln[k + 1] * s); }
          g2.stroke();
        } else if (f.type === 3) {
          g2.beginPath();
          for (r = 0; r < f.parts.length; r++) { var ring = f.parts[r]; g2.moveTo(ring[0] * s, ring[1] * s); for (k = 2; k < ring.length; k += 2) g2.lineTo(ring[k] * s, ring[k + 1] * s); g2.closePath(); }
          g2.fill('evenodd'); g2.lineWidth = Math.max(2, 6 / texM); g2.stroke();
        }
      }
      var d = g2.getImageData(0, 0, TEXN, TEXN).data, built = new Uint8Array(N), water = new Uint8Array(N), nb = 0;
      for (i = 0; i < N; i++) { water[i] = landPx[i] ? 0 : 1; if (landPx[i] && d[i * 4 + 3] > 100) { built[i] = 1; nb++; } }
      var dw = distTo(water), rr = BUILT_NARROW_M / texM, er = new Uint8Array(N), anyLand = false;
      for (i = 0; i < N; i++) { if (landPx[i] && dw[i] > rr) er[i] = 1; if (water[i]) anyLand = anyLand || false; }
      var de = distTo(er), cand = new Uint8Array(N), lab = new Int32Array(N), stack = new Int32Array(N), W = TEXN, nc = 0;
      for (i = 0; i < N; i++) if (landPx[i] && de[i] > rr) { cand[i] = 1; nc++; }
      if (nc) {
        var pm2 = texM * texM, id = 0;
        for (i = 0; i < N; i++) {
          if (!cand[i] || lab[i]) continue;
          id++; var sp = 0, cnt = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, members = [];
          stack[sp++] = i; lab[i] = id;
          while (sp) {
            var q = stack[--sp], qx = q % W, qy = (q - qx) / W; members.push(q); cnt++;
            if (qx < minx) minx = qx; if (qx > maxx) maxx = qx; if (qy < miny) miny = qy; if (qy > maxy) maxy = qy;
            for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue; var x2 = qx + dx, y2 = qy + dy; if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= W) continue;
              var q2 = y2 * W + x2; if (cand[q2] && !lab[q2]) { lab[q2] = id; stack[sp++] = q2; }
            }
          }
          var longM = Math.hypot(maxx - minx + 1, maxy - miny + 1) * texM;
          if (longM >= 50 && cnt * pm2 >= 300) for (var mi = 0; mi < members.length; mi++) { if (!built[members[mi]]) { built[members[mi]] = 1; nb++; } }
        }
      }
      return nb ? built : null;
    }
    function paintRoads(g, lyr) {
      var tie = lyr && lyr.tie; if (!tie) return;
      var s2 = TEXN / tie.extent;
      g.strokeStyle = 'rgb(' + C_ROAD[0] + ',' + C_ROAD[1] + ',' + C_ROAD[2] + ')'; g.lineCap = 'round'; g.lineJoin = 'round';
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
    // Pikselikohtainen väritys: luokan pohjaväri + kohina, puuston peittävyys ja lajisekoitus, jyrkät rinteet kallioksi ja kivinen rantakaista.
    // Veden värinen pikseli, jonka kohdalla verkko on vedenpinnan yläpuolella, muuttuu rannaksi (vesipolygoni ja korkeusmallin rantaviiva eivät osu täysin yhteen).
    // Kolmioiden mukainen korkeus ruudussa (kuten maastoverkko: lävistäjä b-c, kolmiot (a,b,c) ja (b,d,c)), ax ja ay ruudun sisällä 0-1
    function triH(h, k, N1, ax, ay) {
      var a = h[k], c = h[k + 1], b = h[k + N1], d = h[k + N1 + 1];
      return ax + ay <= 1 ? a + ax * (c - a) + ay * (b - a) : d + (1 - ax) * (b - d) + (1 - ay) * (c - d);
    }
    function finishCover(g, c) {
      var n = c.n, tree = c.tree, td = tree ? tree.data : null, id = g.getImageData(0, 0, TEXN, TEXN), d = id.data, tbl = clsTable();
      var N = TEXN * TEXN, W = TEXN, wat = new Uint8Array(N), forced = new Uint8Array(N), CELLS = c.CELLS, N1 = c.N1, gg = c.gm || c.g, nyg = c.ny;
      var texM = n.size / TEXN, k2 = Math.min(1, 7 / texM), crown = n.z < 13, tx, ty, i, o;
      var conc = c.built ? new Uint8Array(N) : null, distB = c.built ? distTo(c.built) : null, bdil = (TEXN / CELLS) * 0.3;
      for (ty = 0; ty < TEXN; ty++) {
        var fy = (ty + 0.5) / TEXN * CELLS, jj = Math.min(CELLS - 1, Math.floor(fy)), ay = fy - jj;
        for (tx = 0; tx < TEXN; tx++) {
          i = ty * W + tx; o = i * 4;
          var fx = (tx + 0.5) / TEXN * CELLS, ii = Math.min(CELLS - 1, Math.floor(fx)), ax = fx - ii, kk = jj * N1 + ii, hh;
          if (conc) {
            hh = triH(gg, kk, N1, ax, ay);
            if ((c.built[i] && hh < LAKE + BUILT_MAXH + 0.2) || (distB[i] <= bdil && hh > LAKE + 0.8 && hh < LAKE + BUILT_MAXH + 0.2)) { conc[i] = 1; continue; }
          }
          if (d[o + 2] <= d[o] + 10) continue;
          hh = NOFIX() ? (gg[kk] * (1 - ax) + gg[kk + 1] * ax) * (1 - ay) + (gg[kk + N1] * (1 - ax) + gg[kk + N1 + 1] * ax) * ay : triH(gg, kk, N1, ax, ay);
          if (hh > LAKE + (NOFIX() ? 0.4 : 0.1)) forced[i] = 1; else wat[i] = 1;
        }
      }
      // vesipikselit aivan rannan vieressä: märkä hiekka, jotta vedenpinnan yläpuolelle jäävä vesipolygonin pohja ei näy sinisenä
      var landZ = new Uint8Array(N), dl = null, nearTex = Math.max(1.6, 3 / texM);
      if (!NOFIX()) { for (i = 0; i < N; i++) landZ[i] = wat[i] ? 0 : 1; dl = distTo(landZ); }
      // etäisyys vedestä (tekseleinä), kaksi läpikäyntiä
      var dist = new Float32Array(N), BIG = 99, di;
      for (i = 0; i < N; i++) dist[i] = wat[i] ? 0 : BIG;
      for (ty = 0; ty < TEXN; ty++) for (tx = 0; tx < TEXN; tx++) {
        i = ty * W + tx; di = dist[i];
        if (tx > 0 && dist[i - 1] + 1 < di) di = dist[i - 1] + 1;
        if (ty > 0) {
          if (dist[i - W] + 1 < di) di = dist[i - W] + 1;
          if (tx > 0 && dist[i - W - 1] + 1.414 < di) di = dist[i - W - 1] + 1.414;
          if (tx < W - 1 && dist[i - W + 1] + 1.414 < di) di = dist[i - W + 1] + 1.414;
        }
        dist[i] = di;
      }
      for (ty = TEXN - 1; ty >= 0; ty--) for (tx = TEXN - 1; tx >= 0; tx--) {
        i = ty * W + tx; di = dist[i];
        if (tx < W - 1 && dist[i + 1] + 1 < di) di = dist[i + 1] + 1;
        if (ty < TEXN - 1) {
          if (dist[i + W] + 1 < di) di = dist[i + W] + 1;
          if (tx < W - 1 && dist[i + W + 1] + 1.414 < di) di = dist[i + W + 1] + 1.414;
          if (tx > 0 && dist[i + W - 1] + 1.414 < di) di = dist[i + W - 1] + 1.414;
        }
        dist[i] = di;
      }
      for (ty = 0; ty < TEXN; ty++) {
        var fy2 = (ty + 0.5) / TEXN * CELLS, j2 = Math.min(CELLS - 1, Math.floor(fy2)), by = fy2 - j2, vv = (ty + 0.5) / TEXN, wy = (n.y + vv) * n.size;
        var py = tree ? Math.min(tree.h - 1, Math.floor((c.oyt + vv) / c.sct * tree.h)) : 0;
        for (tx = 0; tx < TEXN; tx++) {
          i = ty * W + tx; o = i * 4;
          if (wat[i]) {
            if (dl && dl[i] <= nearTex) { var wet = mix3([104, 106, 98], [92, 98, 92], vnoise((n.x + (tx + 0.5) / TEXN) * n.size / 4, (n.y + (ty + 0.5) / TEXN) * n.size / 4, 79)); d[o] = wet[0]; d[o + 1] = wet[1]; d[o + 2] = wet[2]; }
            continue;
          }
          var uu = (tx + 0.5) / TEXN, wx = (n.x + uu) * n.size, fx2 = uu * CELLS, i2 = Math.min(CELLS - 1, Math.floor(fx2)), bx = fx2 - i2, kq = j2 * N1 + i2;
          var n1 = fbm(wx / 14, wy / 14, 11), n2 = 0.5 + (fbm(wx / 3.6, wy / 3.6, 17) - 0.5) * k2, n3 = fbm(wx / 90, wy / 90, 5);
          if (conc && conc[i]) {
            // betoni- tai kivipinta: harmaa ja hienoa kohinaa
            var cc0 = mix3([126, 125, 119], [100, 100, 95], n1), cs = 0.9 + 0.2 * n2;
            d[o] = cc0[0] * cs; d[o + 1] = cc0[1] * cs; d[o + 2] = cc0[2] * cs; continue;
          }
          var col, cls = tbl.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
          if (forced[i]) { col = mix3(C_SHORE1, C_SHORE2, n1); cls = 'hietikko'; }
          else {
            col = [d[o], d[o + 1], d[o + 2]];
            var amp = cls && CLS_NOISE[cls] != null ? CLS_NOISE[cls] : 0.15, kv = 1 + amp * ((n1 - 0.5) * 1.5 + (n2 - 0.5) * 1.0);
            col[0] *= kv * (1 + 0.07 * (n3 - 0.5)); col[1] *= kv; col[2] *= kv * (1 - 0.07 * (n3 - 0.5));
            if (cls === 'kallio') col = mix3(col, C_ROCK2, sstep(0.4, 0.65, n1) * 0.6);
            else if (cls === 'suo' || cls === 'soistuma') col = mix3(col, C_EARTH, sstep(0.55, 0.75, n1) * 0.5);
            else if (cls === 'pelto') { var fur = 0.5 + 0.5 * Math.sin((wx * 0.866 + wy * 0.5) / 5.5); col = [col[0] * (1 + 0.06 * (fur - 0.5) * k2), col[1] * (1 + 0.06 * (fur - 0.5) * k2), col[2] * (1 + 0.05 * (fur - 0.5) * k2)]; }
          }
          // metsämaa: puuston peittävyyden ja lajisekoituksen mukainen sävy
          var q = 0, isTree = false, hraw = 0, cov = 0;
          if (td) {
            var px = Math.min(tree.w - 1, Math.floor((c.oxt + uu) / c.sct * tree.w)); q = (py * tree.w + px) * 4;
            if (td[q + 3] > 0 && td[q + 2] >= CANOPY_MIN && !forced[i]) { isTree = true; hraw = (td[q] * 256 + td[q + 1]) * 0.1; cov = Math.min(100, td[q + 2]) / 100; }
          }
          if (isTree || cls === 'forest') {
            var ls = isTree ? leafAt(td, q) : LEAF_DEFAULT, cc = crownColor(wx, wy, ls, n2), fl;
            if (crown) fl = cc;
            else {
              fl = [cc[0] * 0.66, cc[1] * 0.66, cc[2] * 0.62];
              fl = mix3(fl, C_MOSS, (1 - cov) * 0.45 * (0.5 + n1));
              fl = mix3(fl, C_EARTH, sstep(0.6, 0.82, n1) * 0.3);
            }
            if (isTree && hraw < SHRUB_MAX) fl = mix3(fl, C_MOSS, 0.5);
            col = (cls === 'kallio' && isTree) ? mix3(col, fl, 0.5) : fl;
          }
          // jyrkät rinteet (yli 30 astetta) paljaana kalliona
          var nyv = (nyg[kq] * (1 - bx) + nyg[kq + 1] * bx) * (1 - by) + (nyg[kq + N1] * (1 - bx) + nyg[kq + N1 + 1] * bx) * by, rf = 1 - sstep(0.80, 0.92, nyv);
          if (rf > 0.01) { var rk = mix3(C_ROCK, C_ROCK2, n1), rs = 0.85 + 0.3 * n2; col = mix3(col, [rk[0] * rs, rk[1] * rs, rk[2] * rs], rf * 0.95); }
          // kivinen rantakaista, leveys 3-8 m
          if (dist[i] < 12 && cls !== 'autoliikenne') {
            var wS = 3 + 5 * vnoise(wx / 9, wy / 9, 71), dm = dist[i] * texM, aS = Math.min(1, Math.max(0, (wS - dm) / texM + 0.5));
            if (aS > 0) {
              var cw = cls === 'taajama' || cls === 'varastoalue' ? 0.45 : 1, sc2 = mix3(C_SHORE1, C_SHORE2, vnoise(wx / 5, wy / 5, 73)), ss = 0.88 + 0.24 * n2;
              col = mix3(col, [sc2[0] * ss, sc2[1] * ss, sc2[2] * ss], aS * 0.92 * cw);
            }
          }
          d[o] = Math.max(0, Math.min(255, col[0])); d[o + 1] = Math.max(0, Math.min(255, col[1])); d[o + 2] = Math.max(0, Math.min(255, col[2]));
        }
      }
      islets(d, c);
      g.putImageData(id, 0, 0);
    }
    // Alle 1 ha:n saaret: matalat luodot maalataan vaaleana kalliona, ja pelkkää pensaikkoa kasvavilla saarilla latvuspeitteinen osa saa pensaikon sävyn.
    function islets(d, c) {
      var isl = c.isl, any = false, q0; for (q0 = 0; q0 < isl.length; q0++) if (isl[q0]) { any = true; break; }
      if (!any) return;
      var n = c.n, tree = c.tree, td = tree ? tree.data : null, rnd = rng(hash32(n.z, n.x, n.y) ^ 0x5bd1e995), CELLS = c.CELLS, N1 = c.N1;
      for (var ty = 0; ty < TEXN; ty++) {
        var fy = (ty + 0.5) / TEXN * CELLS, j = Math.min(CELLS - 1, Math.floor(fy));
        for (var tx = 0; tx < TEXN; tx++) {
          var fx = (tx + 0.5) / TEXN * CELLS, i = Math.min(CELLS - 1, Math.floor(fx)), k = j * N1 + i;
          var mk = isl[k] | isl[k + 1] | isl[k + N1] | isl[k + N1 + 1];
          if (!(mk & 1)) continue;
          var o = (ty * TEXN + tx) * 4, canopy = false;
          if (d[o + 2] > d[o] + 10) continue;
          if (td) {
            var py = Math.min(tree.h - 1, Math.floor((c.oyt + (ty + 0.5) / TEXN) / c.sct * tree.h)), px = Math.min(tree.w - 1, Math.floor((c.oxt + (tx + 0.5) / TEXN) / c.sct * tree.w)), q = (py * tree.w + px) * 4;
            canopy = td[q + 3] > 0 && td[q + 2] >= CANOPY_MIN;
          }
          var nz = 0.92 + 0.16 * rnd();
          if (canopy && (mk & 4)) { d[o] = 146 * nz; d[o + 1] = 150 * nz; d[o + 2] = 126 * nz; }
          else if (mk & 2) { d[o] = 176 * nz; d[o + 1] = 176 * nz; d[o + 2] = 170 * nz; }
        }
      }
    }

    // Latvuksen yksityiskohtakuva: toistuva 128 x 128 -kuva puiden latvuksista (kirkas keskus, tumma rako), kokonaiskeskiarvo 0,5. Mipmap tasoittaa sen kauempana tasaiseksi.
    function getCanopyDetail() {
      if (canopyDetail) return canopyDetail;
      var S = 128, C = 8, cs = S / C, pts = [], rnd = rng(0x51ed270b), i, j, a, b, data = new Uint8Array(S * S * 4), vals = new Float32Array(S * S), sum = 0;
      for (j = 0; j < C; j++) for (i = 0; i < C; i++) pts.push([(i + 0.2 + 0.6 * rnd()) * cs, (j + 0.2 + 0.6 * rnd()) * cs, 0.8 + 0.4 * rnd()]);
      for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
        var ci = Math.floor(x / cs), cj = Math.floor(y / cs), best = 1e9, bs = 1;
        for (b = -1; b <= 1; b++) for (a = -1; a <= 1; a++) {
          var ii = ((ci + a) % C + C) % C, jj = ((cj + b) % C + C) % C, p = pts[jj * C + ii];
          var px = p[0] + (ci + a - ii) * cs, py = p[1] + (cj + b - jj) * cs, dd = Math.hypot(x - px, y - py) / p[2];
          if (dd < best) { best = dd; bs = p[2]; }
        }
        var t = Math.min(1, best / (cs * 0.62)), v = 0.9 - 0.78 * Math.pow(t, 1.4) + 0.06 * (rnd() - 0.5);
        vals[y * S + x] = v; sum += v;
      }
      var k = 0.5 / (sum / (S * S));
      for (i = 0; i < S * S; i++) { var vv = Math.max(0.04, Math.min(0.98, vals[i] * k)) * 255; data[i * 4] = vv; data[i * 4 + 1] = vv; data[i * 4 + 2] = vv; data[i * 4 + 3] = 255; }
      canopyDetail = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
      canopyDetail.wrapS = canopyDetail.wrapT = THREE.RepeatWrapping; canopyDetail.generateMipmaps = true;
      canopyDetail.minFilter = THREE.LinearMipmapLinearFilter; canopyDetail.magFilter = THREE.LinearFilter; canopyDetail.anisotropy = 2; canopyDetail.needsUpdate = true;
      return canopyDetail;
    }
    // Kuorimateriaalin varjostin: lakeFloorShader + latvuksen yksityiskohta (puun mittakaava ja metsikön mittakaava) väriin
    function shellShader(shader) {
      lakeFloorShader(shader);
      shader.uniforms.uDet = { value: getCanopyDetail() };
      shader.vertexShader = 'varying vec2 vDW;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDW = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = 'uniform sampler2D uDet;\nvarying vec2 vDW;\n' + shader.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n float dA = texture2D(uDet, vDW / 38.0).r; float dB = texture2D(uDet, vDW / 103.0 + vec2(0.37, 0.61)).r;\n diffuseColor.rgb *= mix(1.0, 2.0 * dA, 0.9) * (0.62 + 0.76 * dB);');
    }

    // ---------- latvuskuori ----------
    // Oma verkko, joka seuraa maanpintaa + latvuksen korkeus (kohinalla epätasaiseksi). Tekstuurin alfa leikkaa kuoren pois metsättömiltä alueilta.
    function buildShell(n, c) {
      var CELLS = c.CELLS, N1 = c.N1, shv = c.shv, nv = N1 * N1, idx = [], j, i;
      for (j = 0; j < CELLS; j++) for (i = 0; i < CELLS; i++) {
        var a = j * N1 + i, b = a + N1, cc = a + 1, d2 = b + 1;
        if (shv[a] > 0 || shv[b] > 0 || shv[cc] > 0 || shv[d2] > 0) idx.push(a, b, cc, b, d2, cc);
      }
      if (!idx.length) return null;
      var pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), k;
      for (k = 0; k < nv; k++) { pos[k * 3] = c.pos[k * 3]; pos[k * 3 + 1] = c.pos[k * 3 + 1] + shv[k]; pos[k * 3 + 2] = c.pos[k * 3 + 2]; uv[k * 2] = c.uv[k * 2]; uv[k * 2 + 1] = c.uv[k * 2 + 1]; }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx.length > 65000 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      var tree = c.tree, td = tree.data, ct = new Uint8Array(CANTEX * CANTEX * 4), tx, ty;
      for (ty = 0; ty < CANTEX; ty++) {
        var vv = (ty + 0.5) / CANTEX, py = Math.min(tree.h - 1, Math.floor((c.oyt + vv) / c.sct * tree.h)), fy = vv * CELLS, jj = Math.min(CELLS - 1, Math.floor(fy)), by = fy - jj, wy = (n.y + vv) * n.size;
        for (tx = 0; tx < CANTEX; tx++) {
          var uu = (tx + 0.5) / CANTEX, px = Math.min(tree.w - 1, Math.floor((c.oxt + uu) / c.sct * tree.w)), q = (py * tree.w + px) * 4;
          var fx = uu * CELLS, ii = Math.min(CELLS - 1, Math.floor(fx)), bx = fx - ii, kq = jj * N1 + ii;
          var sb = (shv[kq] * (1 - bx) + shv[kq + 1] * bx) * (1 - by) + (shv[kq + N1] * (1 - bx) + shv[kq + N1 + 1] * bx) * by;
          var present = td[q + 3] > 0 && td[q + 2] >= CANOPY_MIN && sb >= 1.0, wx = (n.x + uu) * n.size;
          var col = crownColor(wx, wy, leafAt(td, q), vnoise(wx / 3, wy / 3, 53) * 0.6 + ihash(tx, ty, n.x + n.y * 7) * 0.4), o = ((CANTEX - 1 - ty) * CANTEX + tx) * 4;
          ct[o] = Math.min(255, col[0]); ct[o + 1] = Math.min(255, col[1]); ct[o + 2] = Math.min(255, col[2]); ct[o + 3] = present ? 255 : 0;
        }
      }
      var tex = new THREE.DataTexture(ct, CANTEX, CANTEX, THREE.RGBAFormat);
      tex.encoding = THREE.sRGBEncoding; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 2; tex.needsUpdate = true;
      var mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
      mat.onBeforeCompile = shellShader; mat.customProgramCacheKey = function () { return 'maasto-shell2'; };
      var mesh = new THREE.Mesh(geo, mat);
      mesh.userData.node = n; mesh.frustumCulled = true; mesh.matrixAutoUpdate = false; mesh.visible = true;
      return mesh;
    }

    // ---------- puiden sijoittelu ----------
    // Hajautettu ruudukko (askel STEP_M[z]): jokaisessa ruudussa puu todennäköisyydellä latvuspeitto. Korkeus puuston keskipituudesta +-25 %, laji lajijakauman mukaan.
    // Tulos: Float32Array, 10 lukua per puu: x, y, z (paikallinen), leveys, korkeus, kierto, väri r, g, b, laji (0 kuusi, 1 mänty, 2 koivu, 3 pensas).
    function placeTrees(n, c) {
      var z = n.z, step = STEP_M[z], M = Math.max(8, Math.floor(n.size / step)), CELLS = n.cells, N1 = n.n1, tree = c.tree, td = tree.data, gm = c.gm;
      var rnd = rng(hash32(z, n.x, n.y) ^ 0x2545f491), out = [], bill = z < 16, avoid = c.avoid, corr = c.corr, flat = c.flat, i, j;
      for (var jj = 0; jj < M; jj++) for (var ii = 0; ii < M; ii++) {
        var u = (ii + rnd()) / M, v = (jj + rnd()) / M, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd(), r7 = rnd();
        var px = Math.min(tree.w - 1, Math.floor((c.oxt + u) / c.sct * tree.w)), py = Math.min(tree.h - 1, Math.floor((c.oyt + v) / c.sct * tree.h)), q = (py * tree.w + px) * 4;
        if (td[q + 3] === 0 && !c.park) continue;
        var cov = td[q + 2], park = false;
        if (cov < CANOPY_MIN) {
          var pc = c.park && !NOFIX() ? c.park[Math.min(TEXN - 1, Math.floor(v * TEXN)) * TEXN + Math.min(TEXN - 1, Math.floor(u * TEXN))] : 0;
          if (!pc || r1 * 100 > pc) continue;
          park = true;
        } else if (r1 * 100 > cov) continue;
        var fi = u * CELLS, fj = v * CELLS; i = Math.min(CELLS - 1, Math.floor(fi)); j = Math.min(CELLS - 1, Math.floor(fj));
        var a = fi - i, b = fj - j, k00 = j * N1 + i, k10 = k00 + 1, k01 = k00 + N1, k11 = k01 + 1, gy;
        if (a + b <= 1) gy = gm[k00] + a * (gm[k10] - gm[k00]) + b * (gm[k01] - gm[k00]);
        else gy = gm[k11] + (1 - a) * (gm[k01] - gm[k11]) + (1 - b) * (gm[k10] - gm[k11]);
        gy -= LAKE; if (gy < 0.3) continue;
        var th = (c.tht[k00] * (1 - a) + c.tht[k10] * a) * (1 - b) + (c.tht[k01] * (1 - a) + c.tht[k11] * a) * b; if (th <= 0 && !park) continue;
        var lx = (c.lx[k00] * (1 - a) + c.lx[k10] * a) * (1 - b) + (c.lx[k01] * (1 - a) + c.lx[k11] * a) * b, lz = (c.lz[k00] * (1 - a) + c.lz[k10] * a) * (1 - b) + (c.lz[k01] * (1 - a) + c.lz[k11] * a) * b;
        var skip = false, hraw = park ? 6 + 8 * r2 : (td[q] * 256 + td[q + 1]) * 0.1, mk = c.isl[k00] | c.isl[k10] | c.isl[k01] | c.isl[k11], kq;
        for (kq = 0; kq < avoid.length && !skip; kq++) if (Math.hypot(lx - avoid[kq][0], lz - avoid[kq][1]) < 8) skip = true;
        for (kq = 0; kq < corr.length && !skip; kq++) {
          var CR = corr[kq], rx = lx - (CR.e - n.e), rz = lz + (CR.n - n.n), tt = rx * CR.ux - rz * CR.uy;
          if (tt > -8 && tt < CR.len && Math.abs(rx * CR.uy + rz * CR.ux) < CR.half) skip = true;
        }
        for (kq = 0; kq < flat.length && !skip; kq++) {
          var FL = flat[kq], fe = lx + n.e, fn = n.n - lz;
          if (FL.poly ? inPoly(FL.poly, fe, fn) : Math.hypot(fe - FL.e, fn - FL.n) < FL.r * 1.2) skip = true;
        }
        if (skip) continue;
        var wx = (n.x + u) * n.size, wy = (n.y + v) * n.size, sp = species(wx, wy, park ? 0.7 : leafAt(td, q)), kind, h, w;
        if (hraw < SHRUB_MAX || (mk & 4)) { kind = 3; h = Math.min(3, Math.max(1, shrubH(Math.min(hraw, 4.9)) * (0.8 + 0.4 * r2))); w = h * (1.3 + 0.5 * r3); }
        else {
          h = hraw * (0.75 + 0.5 * r2); if ((mk & 1) && h > ISLET_CANOPY_MAX) h = ISLET_CANOPY_MAX;
          if (r3 < sp.bf) { kind = 2; w = Math.min(7, Math.max(2, (0.42 * h + 0.9) * (0.85 + 0.3 * r4))); }
          else if (r4 < Math.min(0.85, 0.1 + 0.6 * sp.pf + (c.ny[k00] < 0.93 ? 0.15 : 0))) { kind = 1; w = Math.min(6, Math.max(2, (0.34 * h + 0.8) * (0.85 + 0.3 * r5))); }
          else { kind = 0; w = Math.min(5.5, Math.max(1.6, (0.30 * h + 0.9) * (0.85 + 0.3 * r5))); }
        }
        if (bill) { w = Math.max(w, step * 0.95); if (kind === 3) h = Math.max(h, 2); }
        var shade = 0.86 + 0.28 * r6, tone = 1 + 0.2 * (r7 - 0.5);
        out.push(lx, gy - 0.25, lz, w, h, rnd() * 6.283, shade * tone, shade, shade * (2 - tone), kind);
      }
      return Float32Array.from(out);
    }
    // Tallennetuista puista meshit: z16-solmuilla yksittäiset puut (täysi laatu) tai billboardit (kevyt laatu ja z15/z14-solmut)
    function makeTreeMeshes(n) {
      var recs = n.recs, cnt = recs.length / 10, rnd = rng(hash32(n.z, n.x, n.y) ^ 0x1b873593), order = new Uint32Array(cnt), q, a, b, tmp;
      if (!cnt) return [];
      for (q = 0; q < cnt; q++) order[q] = q;
      for (a = cnt - 1; a > 0; a--) { b = Math.floor(rnd() * (a + 1)); tmp = order[a]; order[a] = order[b]; order[b] = tmp; }   // satunnaisjärjestys: etuliite on tasainen otos
      var bsph = new THREE.Sphere(new THREE.Vector3(0, 10, 0), n.size * 0.78 + 40), meshes = [], bill = n.z < 16 || quality === 'light';
      if (bill) {
        var base = new Float32Array(cnt * 6), tiles = new Float32Array(cnt), cols = new Float32Array(cnt * 3), clusterP = n.z === 14 ? 0.5 : (n.z === 15 ? 0.3 : 0), TILE = [0, 1, 2, 5];
        for (q = 0; q < cnt; q++) {
          var o = order[q] * 10, kind = recs[o + 9], tile = TILE[kind], wm = 1, hm = 1;
          if (clusterP && (kind === 0 || kind === 2) && ihash(q, n.x, n.y) < clusterP) { tile = kind === 0 ? 3 : 4; wm = 1.5; hm = 1.1; }
          base[q * 6] = recs[o]; base[q * 6 + 1] = recs[o + 1]; base[q * 6 + 2] = recs[o + 2]; base[q * 6 + 3] = recs[o + 3] * wm * (n.z === 16 ? 1.25 : 1); base[q * 6 + 4] = recs[o + 4] * hm; base[q * 6 + 5] = recs[o + 5];
          tiles[q] = tile; cols[q * 3] = recs[o + 6]; cols[q * 3 + 1] = recs[o + 7]; cols[q * 3 + 2] = recs[o + 8];
        }
        var im = makeBillMesh(base, tiles, cols, cnt, bsph);
        im.userData.node = n;
        im.frustumCulled = true; im.matrixAutoUpdate = false; im.visible = false;
        meshes.push(im);
      } else {
        var G = getTreeGeo(), lists = [[], [], [], []];
        for (q = 0; q < cnt; q++) lists[recs[order[q] * 10 + 9]].push(order[q]);
        for (var kd = 0; kd < 4; kd++) {
          var list = lists[kd]; if (!list.length) continue;
          var g2 = G[kd].clone(); g2.boundingSphere = bsph;
          var im2 = new THREE.InstancedMesh(g2, getTreeMat(), list.length), base2 = new Float32Array(list.length * 6), cols2 = new Float32Array(list.length * 3);
          for (var q2 = 0; q2 < list.length; q2++) {
            var o2 = list[q2] * 10;
            base2.set([recs[o2], recs[o2 + 1], recs[o2 + 2], recs[o2 + 3], recs[o2 + 4], recs[o2 + 5]], q2 * 6);
            cols2[q2 * 3] = recs[o2 + 6]; cols2[q2 * 3 + 1] = recs[o2 + 7]; cols2[q2 * 3 + 2] = recs[o2 + 8];
          }
          im2.instanceColor = new THREE.InstancedBufferAttribute(cols2, 3);
          im2.userData = { base: base2, kind: 'inst', total: list.length, trisPer: G[kd].userData.tris, node: n, widen: 1 };
          im2.frustumCulled = true; im2.matrixAutoUpdate = false; im2.visible = false;
          writeMatrices(im2, 1);
          meshes.push(im2);
        }
      }
      n.treeCount = cnt;
      return meshes;
    }

    // ---------- rakennukset ----------
    // Korkeus rakennuskorkeudet.json-tiedostosta (laserkeilauksen h_p90 ja h_max), kun rakennus löytyy keskipisteen ja pinta-alan perusteella, muuten kerrosluokasta.
    // Pienet rakennukset (jalanala alle 250 m2, korkeus alle 9 m) saavat harjakaton (harja pitkän sivun suuntaan, kaltevuus noin 25 astetta), suuret tasakaton.
    // Julkisivun väri ja katon väri vaihtelevat deterministisesti rakennuksen sijainnista. Ikkunarivit ovat toistuva tekstuuri (kerroskorkeus 2,9-3,0 m).
    var BH_CELL = 50;
    function loadBuildingHeights() {
      if (bHeightsP) return bHeightsP;
      bHeightsP = fetch(A.getBase() + 'rakennuskorkeudet.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.rakennukset) return null;
        var map = new Map(), cnt = 0;
        Object.keys(d.rakennukset).forEach(function (fid) {
          var b = d.rakennukset[fid], k = Math.floor(b.e / BH_CELL) * 1000000 + Math.floor(b.n / BH_CELL), l = map.get(k);
          if (!l) { l = []; map.set(k, l); } l.push(b); cnt++;
        });
        bHeights = { map: map, count: cnt };
        return bHeights;
      }).catch(function () { return null; });
      return bHeightsP;
    }
    function matchHeight(e, nn, area) {
      if (!bHeights) return null;
      var ex = Math.floor(e / BH_CELL), ny = Math.floor(nn / BH_CELL), best = null, bd = 12;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var l = bHeights.map.get((ex + dx) * 1000000 + ny + dy); if (!l) continue;
        for (var i = 0; i < l.length; i++) {
          var b = l[i], dd = Math.hypot(b.e - e, b.n - nn); if (dd >= bd) continue;
          var r = b.ala_m2 > 0 ? area / b.ala_m2 : 1; if (r < 0.5 || r > 2) continue;
          bd = dd; best = b;
        }
      }
      return best;
    }
    var P_HOUSE = [[0.28, [143, 56, 44]], [0.44, [222, 190, 102]], [0.62, [226, 224, 214]], [0.72, [150, 150, 146]], [0.86, [206, 176, 128]], [0.92, [96, 70, 54]], [1.0, [160, 176, 168]]];
    var P_FLAT = [[0.28, [222, 214, 196]], [0.48, [200, 196, 184]], [0.68, [150, 86, 70]], [0.84, [168, 168, 162]], [1.0, [226, 212, 160]]];
    var P_IND = [[0.4, [150, 152, 150]], [0.65, [120, 60, 50]], [0.85, [110, 122, 138]], [1.0, [180, 170, 140]]];
    var P_OFFICE = [[0.4, [190, 192, 190]], [0.7, [214, 206, 188]], [1.0, [150, 156, 164]]];
    var P_ROOF = [[0.36, [66, 68, 72]], [0.6, [138, 54, 44]], [0.78, [40, 40, 44]], [0.92, [96, 72, 58]], [1.0, [112, 114, 116]]];
    var P_FLATROOF = [[0.5, [104, 106, 108]], [0.8, [132, 132, 128]], [1.0, [78, 80, 82]]];
    function pick(pal, r) { for (var i = 0; i < pal.length; i++) if (r <= pal[i][0]) return pal[i][1]; return pal[pal.length - 1][1]; }
    var winTex = null, bMat = null;
    function getWinTex() {
      if (winTex) return winTex;
      var S = 128, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      var g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#ececea'; g.fillRect(30, 22, 68, 82);        // karmi
      var gr = g.createLinearGradient(0, 28, 0, 98); gr.addColorStop(0, '#46586a'); gr.addColorStop(1, '#1f2a36');
      g.fillStyle = gr; g.fillRect(34, 26, 60, 74);
      g.fillStyle = 'rgba(160,190,215,0.35)'; g.beginPath(); g.moveTo(34, 26); g.lineTo(62, 26); g.lineTo(34, 70); g.closePath(); g.fill();
      g.fillStyle = '#ececea'; g.fillRect(62, 26, 4, 74); g.fillRect(34, 60, 60, 3);   // ikkunaristikko
      g.fillStyle = '#c9c8c2'; g.fillRect(28, 104, 72, 4);       // ikkunalauta
      winTex = new THREE.CanvasTexture(cv);
      winTex.encoding = THREE.sRGBEncoding; winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.anisotropy = 2;
      winTex.generateMipmaps = true; winTex.minFilter = THREE.LinearMipmapLinearFilter; winTex.magFilter = THREE.LinearFilter;
      return winTex;
    }
    function getBMat() {
      if (bMat) return bMat;
      bMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: quality === 'light' ? null : getWinTex(), side: THREE.FrontSide });
      bMat.userData.shared = true;
      return bMat;
    }
    function applyBuildingQuality() {
      if (!bMat) return;
      var want = quality === 'light' ? null : getWinTex();
      if (bMat.map !== want) { bMat.map = want; bMat.needsUpdate = true; }
    }
    function ringArea2(pts) { var s = 0; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return s / 2; }
    // Douglas-Peucker-yksinkertaistus suljetulle ääriviivalle (kaukana olevien rakennusten seinäkolmioiden vähentämiseen)
    function simplifyRing(pts, tol) {
      var n = pts.length, i, far = 0, fd = -1;
      for (i = 1; i < n; i++) { var dd = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (dd > fd) { fd = dd; far = i; } }
      var keep = new Array(n).fill(false); keep[0] = true; keep[far] = true;
      function dp(a, b) {
        if (b - a < 2) return;
        var pa = pts[a % n], pb = pts[b % n], dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1e-9, md = -1, mi = -1, k;
        for (k = a + 1; k < b; k++) { var pk = pts[k % n], d = Math.abs((pk[0] - pa[0]) * dy - (pk[1] - pa[1]) * dx) / L; if (d > md) { md = d; mi = k; } }
        if (md > tol) { keep[mi % n] = true; dp(a, mi); dp(mi, b); }
      }
      dp(0, far); dp(far, n);
      var out = []; for (i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
      return out.length >= 3 ? out : pts;
    }
    function buildBuildings(n, layer, g, flatHere) {
      var CELLS = n.cells, N1 = n.n1, ext = layer.extent, simple = n.z < 15, pos = [], uv = [], col = [], tris = 0;
      var polys = flatHere.filter(function (L) { return L.poly; });
      function vtx(x, y, zl, u, v, c) { pos.push(x, y, zl); uv.push(u, v); col.push(c[0] / 255, c[1] / 255, c[2] / 255); }
      for (var bi = 0; bi < layer.features.length; bi++) {
        var f = layer.features[bi]; if (f.type !== 3 || !f.parts.length) continue;
        var ring = f.parts[0], np = ring.length / 2;
        if (np > 1 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1]) np--;
        if (np < 3) continue;
        var pts = [], ce = 0, cn = 0, k;
        for (k = 0; k < np; k++) {
          var ll = P.tileLonLat(n.z, n.x, n.y, ring[2 * k] / ext, ring[2 * k + 1] / ext), en = P.lonlatToEN(ll.lon, ll.lat);
          pts.push([en.e - n.e, en.n - n.n]); ce += en.e; cn += en.n;
        }
        ce /= np; cn /= np;
        var area = ringArea2(pts); if (area < 0) { pts.reverse(); area = -area; }
        if (simple && area < 220) continue;
        if (simple && pts.length > 5) { pts = simplifyRing(pts, 2.5); np = pts.length; area = ringArea2(pts); }   // kaukana (z14 ja kauempana) vain suuret rakennukset, pienet olisivat alle pikselin kokoisia
        if (area < 6) continue;
        var skip = false, q;
        for (q = 0; q < polys.length && !skip; q++) if (inPoly(polys[q].poly, ce, cn)) skip = true;
        for (q = 0; q < flatHere.length && !skip; q++) if (!flatHere[q].poly && Math.hypot(ce - flatHere[q].e, cn - flatHere[q].n) < Math.min(flatHere[q].r, 25)) skip = true;   // tornit ja piiput mallinnetaan erikseen
        if (skip) continue;
        var hs = hash32(Math.round(ce * 2), Math.round(cn * 2), 7), rr = rng(hs), r1 = rr(), r2 = rr(), r3 = rr(), r4 = rr();
        var kay = f.props.kaytto || '', krs = f.props.krs, ent = matchHeight(ce, cn, area), H, laser = false;
        if (ent && ent.pisteita >= 5 && ent.h_max >= 2 && !ent.epavarma && !ent.ei_keilattu && ent.h_p90 >= 2.5) { H = ent.h_p90 + 0.35 * Math.max(0, ent.h_max - ent.h_p90); laser = true; }
        else if (area < 40) H = 3.0 + 0.6 * r1;
        else if (krs === '3+') H = (area > 600 ? 13 : 11.5) + 5 * r1;
        else if (krs === '1-2') H = 5.2 + 3.4 * r1 * (area > 120 ? 1 : 0.4);
        else H = 4.5 + 1.5 * r1;
        var gz = f.props.z != null && isFinite(Number(f.props.z)) ? Number(f.props.z) : null;
        if (gz == null) { gz = gridH(g, CELLS, N1, Math.min(CELLS, Math.max(0, ((ce - n.e) / n.size + 0.5) * CELLS)), Math.min(CELLS, Math.max(0, (0.5 - (cn - n.n) / n.size) * CELLS))); }
        var gy = gz - LAKE; if (gy + H < 0.5) continue;
        var type = /teollisuus|varasto|liike/.test(kay) ? 'ind' : (/toimisto|julkinen|kirkko|uskonn/.test(kay) ? 'office' : ((krs === '3+' || H > 9) && area > 150 ? 'flat' : 'house'));
        var wallC = pick(type === 'ind' ? P_IND : (type === 'office' ? P_OFFICE : (type === 'flat' ? P_FLAT : P_HOUSE)), r2);
        var gable = !simple && area < 250 && H < 9 && type !== 'ind', roofC = gable ? pick(P_ROOF, r3) : pick(P_FLATROOF, r3);
        var bayW = type === 'ind' ? 7.5 : (type === 'office' ? 2.8 : (type === 'flat' ? 3.0 : 3.8)), floorH = type === 'ind' ? 5.5 : (type === 'house' ? 3.0 : 2.9);
        // ruutukohtainen maanpinta rakennuksen reunalla: perustus ulottuu maanpinnan alapuolelle, ettei rinteessä jää rakoa
        var base = gy, kv;
        for (kv = 0; kv < pts.length; kv++) {
          var hb = gridH(g, CELLS, N1, Math.min(CELLS, Math.max(0, (pts[kv][0] / n.size + 0.5) * CELLS)), Math.min(CELLS, Math.max(0, (0.5 - pts[kv][1] / n.size) * CELLS))) - LAKE;
          if (hb < base) base = hb;
        }
        var y0 = base - 0.8, ringP = pts, eave = H, rise = 0, c0 = 0, halfW = 1, cross = null, ridgeD = null;
        if (gable) {
          // pienin suunnattu suorakulmio reunan suuntien joukosta: harja pidemmän sivun suuntaan
          var bestA = 1e18, bd = null;
          for (kv = 0; kv < np; kv++) {
            var a1 = pts[kv], b1 = pts[(kv + 1) % np], ex = b1[0] - a1[0], ey = b1[1] - a1[1], el = Math.hypot(ex, ey); if (el < 0.5) continue;
            var dxn = ex / el, dyn = ey / el, smin = 1e9, smax = -1e9, tmin = 1e9, tmax = -1e9;
            for (q = 0; q < np; q++) { var s = pts[q][0] * dxn + pts[q][1] * dyn, t = -pts[q][0] * dyn + pts[q][1] * dxn; if (s < smin) smin = s; if (s > smax) smax = s; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
            var aa = (smax - smin) * (tmax - tmin);
            if (aa < bestA) { bestA = aa; bd = { dx: dxn, dy: dyn, ls: smax - smin, lt: tmax - tmin, s0: (smax + smin) / 2, t0: (tmax + tmin) / 2 }; }
          }
          if (bd && Math.min(bd.ls, bd.lt) > 3) {
            var alongD = bd.ls >= bd.lt;
            halfW = Math.min(bd.ls, bd.lt) / 2; c0 = alongD ? bd.t0 : bd.s0;
            cross = alongD ? function (p) { return -p[0] * bd.dy + p[1] * bd.dx - c0; } : function (p) { return p[0] * bd.dx + p[1] * bd.dy - c0; };
            rise = Math.min(3.2, halfW * 0.466, H * 0.45); eave = H - rise;
            if (eave < 2.4) { eave = 2.4; rise = Math.max(0.6, H - eave); }
            // reunat, jotka ylittävät harjalinjan, jaetaan harjan kohdalta
            var rp = [];
            for (kv = 0; kv < np; kv++) {
              var pa = pts[kv], pb = pts[(kv + 1) % np], ca = cross(pa), cb = cross(pb); rp.push(pa);
              if (ca * cb < 0) { var tt = ca / (ca - cb); rp.push([pa[0] + (pb[0] - pa[0]) * tt, pa[1] + (pb[1] - pa[1]) * tt]); }
            }
            ringP = rp;
          } else gable = false;
        }
        function topY(p) { return gy + (gable ? eave + rise * Math.max(0, 1 - Math.abs(cross(p)) / halfW) : H); }
        // seinät
        var cum = 0, nr = ringP.length;
        for (kv = 0; kv < nr; kv++) {
          var pa2 = ringP[kv], pb2 = ringP[(kv + 1) % nr], len = Math.hypot(pb2[0] - pa2[0], pb2[1] - pa2[1]);
          if (len < 0.05) continue;
          var ta = topY(pa2), tb = topY(pb2), ua = cum / bayW, ub = (cum + len) / bayW, va0 = (y0 - gy) / floorH, vaA = (ta - gy) / floorH, vaB = (tb - gy) / floorH;
          cum += len;
          var xa = pa2[0], za = -pa2[1], xb = pb2[0], zb = -pb2[1];
          vtx(xa, y0, za, ua, va0, wallC); vtx(xb, y0, zb, ub, va0, wallC); vtx(xb, tb, zb, ub, vaB, wallC);
          vtx(xa, y0, za, ua, va0, wallC); vtx(xb, tb, zb, ub, vaB, wallC); vtx(xa, ta, za, ua, vaA, wallC);
          tris += 2;
        }
        // katto
        function tri(poly2) {
          if (poly2.length < 3) return;
          var cont = poly2.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), idx;
          try { idx = THREE.ShapeUtils.triangulateShape(cont, []); } catch (e) { return; }
          for (var ti = 0; ti < idx.length; ti++) {
            // Katon kolmiot käännetään ylöspäin katsoviksi (takapintojen poisto)
            var t0 = poly2[idx[ti][0]], t1 = poly2[idx[ti][1]], t2 = poly2[idx[ti][2]], order = ((t1[0] - t0[0]) * (t2[1] - t0[1]) - (t1[1] - t0[1]) * (t2[0] - t0[0])) >= 0 ? [0, 1, 2] : [0, 2, 1];
            for (var vi = 0; vi < 3; vi++) { var p = poly2[idx[ti][order[vi]]]; vtx(p[0], topY(p), -p[1], 0.06, 0.06, roofC); }
          }
          tris += idx.length;
        }
        if (gable) {
          var half1 = [], half2 = [];
          for (kv = 0; kv < nr; kv++) { var cv2 = cross(ringP[kv]); if (cv2 >= -1e-6) half1.push(ringP[kv]); if (cv2 <= 1e-6) half2.push(ringP[kv]); }
          tri(half1); tri(half2);
        } else tri(pts);
      }
      if (!tris) return null;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      var m = new THREE.Mesh(geo, getBMat());
      m.matrixAutoUpdate = false; m.userData.node = n; m.userData.tris = tris;
      return m;
    }

    // vanha versio (vaiheet 3-4 kuvissa): rakennukset tasakattoisina laatikoina
    function buildBuildingsOld(n, layer, surf, g) {
      var CELLS = n.cells, N1 = n.n1;
      var ext = layer.extent, pos = [], col = [], tris = 0;
      var wallC = new THREE.Color('#d6d0c4'), roofC = new THREE.Color('#77736f');
      for (var i = 0; i < layer.features.length; i++) {
        var f = layer.features[i]; if (f.type !== 3 || !f.parts.length) continue;
        var ring = f.parts[0], np = ring.length / 2;
        if (np > 1 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1]) np--;
        if (np < 3) continue;
        var cx = 0, cy = 0; for (var k = 0; k < np; k++) { cx += ring[2 * k]; cy += ring[2 * k + 1]; }
        cx /= np * ext; cy /= np * ext;
        var krs = f.props.krs, hh = krs === '3+' ? 12 : (krs === '1-2' ? 6 : 5);
        var contour = [], pts = [];
        for (var k2 = 0; k2 < np; k2++) {
          var ll = P.tileLonLat(n.z, n.x, n.y, ring[2 * k2] / ext, ring[2 * k2 + 1] / ext), en = P.lonlatToEN(ll.lon, ll.lat);
          pts.push([en.e - n.e, en.n - n.n]); contour.push(new THREE.Vector2(en.e - n.e, en.n - n.n));
        }
        var gz = f.props.z != null ? Number(f.props.z) : null;
        if (gz == null || !isFinite(gz)) {
          var gi = Math.min(CELLS, Math.max(0, Math.round(cx * CELLS))), gj = Math.min(CELLS, Math.max(0, Math.round(cy * CELLS)));
          gz = g[gj * N1 + gi];
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
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.matrixAutoUpdate = false; m.userData.node = n;
      return m;
    }

    // ---------- valinta ja aikataulutus ----------
    function meshesOf(n) { var a = []; if (n.mesh) a.push(n.mesh); if (n.shell) a.push(n.shell); if (n.bmesh) a.push(n.bmesh); if (n.tmeshes) for (var i = 0; i < n.tmeshes.length; i++) a.push(n.tmeshes[i]); return a; }
    var QSTEPS = [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05, 0.03];
    function quant(f) { for (var i = 0; i < QSTEPS.length; i++) if (QSTEPS[i] <= f * 1.001) return QSTEPS[i]; return QSTEPS[QSTEPS.length - 1]; }
    var treeInfo = { nodes: 0, instances: 0, tris: 0, total: 0, scale: 1, bills: 0, billTris: 0 };
    // Puiden näkyvyys ja harvennus. z16-solmu: alle 300 m (keskipisteestä) pelkät puut ja paljas maanpinta, 300-700 m harvennetut puut ja latvuskuori, kauempana pelkkä latvuskuori.
    // z15- ja z14-solmut: billboardit alle 2300 m:n päässä (harvennus etäisyyden mukaan), latvuskuori aina. Satunnaisjärjestyksen etuliite on tasainen otos,
    // ja harvennetut puut levennetään (widen). Kolmiobudjetit rajaavat kokonaismäärän.
    function updateTrees(list) {
      var inst = [], bill = [], totI = 0, totB = 0;
      list.forEach(function (n) {
        if (!n.tmeshes || !n.tmeshes.length) return;
        var w = P.enToWorld(n.e, n.n), dc = Math.hypot(w.x - boat.x, w.y - boat.y), f, vis;
        if (n.z === 16) {
          var near = n.mode === 'near' ? dc < TREE_NEAR_M + 25 : dc < TREE_NEAR_M, mid = n.mode === 'far' ? dc < TREE_FAR_M : dc < TREE_FAR_M + 40;
          n.mode = near ? 'near' : (mid ? 'mid' : 'far');
          if (n.shell) n.shell.visible = n.mode !== 'near';
          vis = n.mode !== 'far';
          f = LOD_F[dc < LOD_DIST[0] ? 0 : dc < LOD_DIST[1] ? 1 : dc < LOD_DIST[2] ? 2 : 3] * (quality === 'light' ? 0.6 : 1);
        } else {
          var bi = dc < BILL_DIST[0] ? 0 : dc < BILL_DIST[1] ? 1 : dc < BILL_DIST[2] ? 2 : -1;
          vis = bi >= 0; f = vis ? BILL_F[bi] * (quality === 'light' ? 0.6 : 1) : 0;
        }
        n.tmeshes.forEach(function (im) { im.visible = vis; });
        if (!vis) return;
        var rec = { n: n, f: f };
        n.tmeshes.forEach(function (im) { var t = im.userData.total * f * im.userData.trisPer; if (im.userData.kind === 'bill') totB += t; else totI += t; });
        (n.tmeshes[0].userData.kind === 'bill' ? bill : inst).push(rec);
      });
      var sI = totI > TREE_TRI_BUDGET ? TREE_TRI_BUDGET / totI : 1, sB = totB > BILL_TRI_BUDGET ? BILL_TRI_BUDGET / totB : 1, cnt = 0, tris = 0, all = 0, bc = 0, bt = 0;
      function apply(o, scale, isBill) {
        var fq = quant(Math.max(0.03, o.f * scale));
        o.n.tmeshes.forEach(function (im) {
          var u = im.userData, k = Math.max(1, Math.ceil(u.total * fq)), widen = Math.min(isBill ? 1.9 : 2.4, 1 / Math.sqrt(fq));
          if (im.isInstancedMesh) im.count = k; else im.geometry.setDrawRange(0, k * 12);
          if (Math.abs(widen - u.widen) > 0.01) { u.widen = widen; if (im.isInstancedMesh) writeMatrices(im, widen); else writeBill(im, widen); }
          if (isBill) { bc += k; bt += k * u.trisPer; } else { cnt += k; tris += k * u.trisPer; all += u.total; }
        });
      }
      inst.forEach(function (o) { apply(o, sI, false); });
      bill.forEach(function (o) { apply(o, sB, true); });
      treeInfo = { nodes: inst.length, instances: cnt, tris: tris, total: all, scale: sI, bills: bc, billTris: bt, billScale: sB, billNodes: bill.length };
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
        meshesOf(n).forEach(function (m) { if (m.parent !== group) { group.add(m); placeMesh(n); } });
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
    function disposeMeshes(ms) {
      ms.forEach(function (m) {
        if (m.parent) m.parent.remove(m);
        m.geometry.dispose(); if (m.isInstancedMesh) { m.dispose(); return; }
        if (m.material.userData && m.material.userData.shared) return;
        if (m.material.map) m.material.map.dispose(); m.material.dispose();
      });
    }
    function disposeNode(n) {
      disposeMeshes(meshesOf(n));
      if (n.children) n.children.forEach(function (c) { if (c.state === 'new') nodes.delete(c.key); });
      n.mesh = null; n.shell = null; n.bmesh = null; n.tmeshes = null; n.recs = null; n.mode = 'far'; n.hgrid = null; n.ggrid = null; n.gmgrid = null; n.state = 'new'; n.children = null;
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

    // Solmun ruudukon korkeus pisteessä kolmioiden mukaan (sama jako kuin piirrettävässä verkossa)
    function gridH(g, CELLS, N1, fx, fy) {
      var i = Math.min(CELLS - 1, Math.floor(fx)), j = Math.min(CELLS - 1, Math.floor(fy)), a = fx - i, b = fy - j, k00 = j * N1 + i, k10 = k00 + 1, k01 = k00 + N1, k11 = k01 + 1;
      return a + b <= 1 ? g[k00] + a * (g[k10] - g[k00]) + b * (g[k01] - g[k00]) : g[k11] + (1 - a) * (g[k01] - g[k11]) + (1 - b) * (g[k10] - g[k11]);
    }
    // Maanpinnan korkeus pisteessä (m järven pinnasta). ground=true: pelkkä maastomalli ilman latvusta.
    function heightAt(x, y, ground, minZ) {
      var ll = P.worldToLonLat(x, y);
      for (var z = Z_MAX; z >= (minZ || Z_MIN); z--) {
        var t = P.lonlatToTile(ll.lon, ll.lat, z), tx = Math.floor(t.x), ty = Math.floor(t.y), n = nodes.get(key(z, tx, ty));
        if (!n || n.state !== 'built' || !n.hgrid) continue;
        var hv = gridH(ground ? n.ggrid : n.hgrid, n.cells, n.n1, (t.x - tx) * n.cells, (t.y - ty) * n.cells);
        return Math.max(0, hv - LAKE);
      }
      return null;
    }
    // Piirrettävän maastoverkon korkeus pisteessä (m järven pinnasta) ja sen solmun zoom. Korkeustarkistusta varten: verkko vs. korkeusmallin ruutu.
    function groundMeshAt(x, y, zWant) {
      var ll = P.worldToLonLat(x, y);
      for (var z = zWant || Z_MAX; z >= Z_MIN; z--) {
        var t = P.lonlatToTile(ll.lon, ll.lat, z), tx = Math.floor(t.x), ty = Math.floor(t.y), n = nodes.get(key(z, tx, ty));
        if (!n || n.state !== 'built' || !n.gmgrid) continue;
        return { z: z, h: gridH(n.gmgrid, n.cells, n.n1, (t.x - tx) * n.cells, (t.y - ty) * n.cells) - LAKE };
      }
      return null;
    }
    // Korkeusmallin ruudun arvo (m N2000, bilinear) pisteessä: asynkroninen, lukee ruudun suoraan paketista
    function demAt(x, y) {
      var ll = P.worldToLonLat(x, y), t = P.lonlatToTile(ll.lon, ll.lat, 14), tx = Math.floor(t.x), ty = Math.floor(t.y);
      return demHeights('dem', 14, tx, ty).then(function (g) { return g ? sampleH(g, t.x - tx, t.y - ty) : null; });
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
    // Grafiikka: 'full' tai 'light'. Kevyessä tilassa lähipuutkin ovat billboardeja ja rakennukset ilman ikkunatekstuuria.
    function setQuality(q) {
      q = q === 'light' ? 'light' : 'full';
      if (q === quality) return;
      quality = q;
      nodes.forEach(function (n) {
        if (n.state !== 'built') return;
        if (n.z === 16 && n.recs) {
          var wasShown = n.tmeshes && n.tmeshes.length && n.tmeshes[0].parent === group;
          if (n.tmeshes) disposeMeshes(n.tmeshes);
          n.tmeshes = makeTreeMeshes(n);
          if (wasShown) n.tmeshes.forEach(function (m) { group.add(m); placeMesh(n); });
        }
        if (n.bmesh) applyBuildingQuality(n.bmesh);
      });
      dirty = true;
    }
    function info() {
      var tris = 0, vis = 0;
      shown.forEach(function (n) { vis++; if (n.mesh) tris += n.mesh.geometry.index.count / 3; if (n.shell && n.shell.visible) tris += n.shell.geometry.index.count / 3; if (n.bmesh) tris += (n.bmesh.geometry.index ? n.bmesh.geometry.index.count : n.bmesh.geometry.attributes.position.count) / 3; });
      return { nodes: nodes.size, shown: vis, jobs: jobs.length, queued: queue.length, trianglesAll: tris + treeInfo.tris + treeInfo.billTris, trees: treeInfo, stats: stats };
    }
    function levels() { var o = {}; shown.forEach(function (n) { o[n.z] = (o[n.z] || 0) + 1; }); return o; }
    return { group: group, setBoat: setBoat, tick: tick, heightAt: heightAt, groundMeshAt: groundMeshAt, demAt: demAt, blocked: blocked, setFlatten: setFlatten, setGate: setGate, rebase: rebase, idle: idle, info: info, levels: levels, setWireframe: setWireframe, setQuality: setQuality, getQuality: function () { return quality; }, nodes: nodes, setTreeBudget: function (b) { TREE_TRI_BUDGET = b; }, treeInfo: function () { return treeInfo; }, shoreStats: function () { var o = { nodes: 0, n: 0, maxT: 0, maxU: 0, sumT: 0, sumU: 0 }; shown.forEach(function (n) { var t = n.shoreStat; if (!t || !t.n) return; o.nodes++; o.n += t.n; o.sumT += t.sumT; o.sumU += t.sumU; o.maxT = Math.max(o.maxT, t.maxT); o.maxU = Math.max(o.maxU, t.maxU); }); return o; }, isletStats: function () { var o = []; nodes.forEach(function (n) { if (n.isletStats && n.isletStats.length) o.push({ z: n.z, x: n.x, y: n.y, islets: n.isletStats }); }); return o; } };
  }

  var api = { create: create, COVER: COVER, CELLS_Z: CELLS_Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Maasto = api;
})(typeof window !== 'undefined' ? window : globalThis);
