/* Simulaattori – maamerkit 3D-malleina (Näsinneula, piiput, korkeat kapeat rakenteet).
 *
 * Pintamalli (DSM) ei tunne ohuita rakenteita luotettavasti: mediaanisuodatus poistaa ne, ja kapea huippu näkyisi pintamallissa
 * epätarkkana piikkinä. Siksi korkeat kapeat rakenteet mallinnetaan käsin maamerkit.json-tiedoston mitoista ja pintamalli tasataan
 * niiden kohdalta maanpintaan (Maasto.setFlatten). Voimalaitoksen rakennukset ja kuljetin jäävät pintamallin varaan.
 * Mitat: Näsinneulan huippu 168 m järven pinnasta (laserkeilauksen korkein havaittu piste 165,7 m, ohut masto ei näy täysin),
 * lautanen 27 m halkaisijaltaan 129 m maasta, varsi 9,1 m. Piiput noin 90 m maasta. Tampellan piippu 100,7 m maasta. */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka;
  var LAKE = P.LAKE_Z;
  var SETTINGS = { nasinneulaTipAboveLake: 168.0, shaftBaseR: 4.6, shaftTopR: 3.3, plateR: 13.5, chimneyBaseR: 4.2, chimneyTopR: 2.5, tampellaBaseR: 3.6, tampellaTopR: 2.0 };
  var C = {
    concrete: [0.74, 0.73, 0.70], deck: [0.66, 0.66, 0.65], glass: [0.18, 0.23, 0.28], roof: [0.80, 0.80, 0.78],
    white: [0.93, 0.93, 0.92], red: [0.70, 0.19, 0.16], brick: [0.55, 0.31, 0.24], mast: [0.56, 0.57, 0.59]
  };

  function create(scene) {
    var Builder = root.Merkit3D.Builder;
    var S = {}; for (var k in SETTINGS) S[k] = SETTINGS[k];
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.name = 'maamerkit'; mesh.visible = false;
    scene.add(mesh);
    var data = null, flat = [], tops = {};

    function chimney(b, x, z, yBase, yTop, rb, rt, body, bandTop) {
      var h = yTop - yBase, r = function (y) { return rb + (rt - rb) * (y - yBase) / h; };
      var y1 = yBase + h * 0.80, y2 = yBase + h * 0.87, y3 = yBase + h * 0.94;
      b.cyl(x, z, rb, r(y1), yBase, y1, body, 16, false);
      if (bandTop) {
        b.cyl(x, z, r(y1), r(y2), y1, y2, C.red, 16, false); b.cyl(x, z, r(y2), r(y3), y2, y3, C.white, 16, false); b.cyl(x, z, r(y3), rt, y3, yTop, C.red, 16, true);
      } else b.cyl(x, z, r(y1), rt, y1, yTop, body, 16, true);
    }
    function nasinneula(b, m) {
      var e = m.sijainti.epsg3067, w = P.enToWorld(e[0], e[1]), x = w.x, z = -w.y, g = m.z_maa_n2000_m - LAKE;
      var tip = S.nasinneulaTipAboveLake;
      b.cyl(x, z, S.shaftBaseR, S.shaftTopR, g - 1, g + 118, C.concrete, 20, false);
      b.cyl(x, z, S.shaftTopR, S.plateR - 1.5, g + 118, g + 123, C.deck, 24, false);
      b.cyl(x, z, S.plateR - 1.5, S.plateR, g + 123, g + 124, C.deck, 24, false);
      b.cyl(x, z, S.plateR, S.plateR, g + 124, g + 129, C.glass, 24, false);
      b.cyl(x, z, S.plateR, S.plateR - 0.5, g + 129, g + 130, C.deck, 24, false);
      b.cyl(x, z, S.plateR - 0.5, 3.5, g + 130, g + 136, C.roof, 24, true);
      // masto: huippu on tip (168 m järven pinnasta, tilaajan mitta), joten masto jaetaan lautasen katon (g + 136) ja huipun väliin
      var m0 = g + 136, mh = tip - m0;
      b.cyl(x, z, 0.9, 0.62, m0, m0 + mh * 0.38, C.white, 10, false);
      b.cyl(x, z, 0.62, 0.45, m0 + mh * 0.38, m0 + mh * 0.72, C.red, 10, false);
      b.cyl(x, z, 0.45, 0.15, m0 + mh * 0.72, tip, C.white, 10, true);
      flat.push({ e: e[0], n: e[1], r: S.shaftBaseR + 14, z: m.z_maa_n2000_m });
      tops.nasinneula = { e: e[0], n: e[1], y: tip };
    }
    function build(d) {
      data = d || data; if (!data) return;
      var b = new Builder(); flat = []; tops = {};
      var piiput = [], tamp = null, used = [];
      (data.maamerkit || []).forEach(function (m) {
        if (m.tunnus === 'nasinneula') nasinneula(b, m);
        if (m.tunnus === 'naistenlahden_voimalaitos') piiput = m.piiput || [];
        if (m.tunnus === 'tampellan_tehdasrakennukset' && m.korkea_piippu_lahella && m.korkea_piippu_lahella[0]) tamp = m.korkea_piippu_lahella[0];
      });
      var nn = tops.nasinneula;
      piiput.forEach(function (c, i) {
        var e = c.sijainti.epsg3067, w = P.enToWorld(e[0], e[1]), top = c.z_huippu_n2000_m - LAKE, base = top - c.korkeus_maasta_m;
        chimney(b, w.x, -w.y, base - 1, top, S.chimneyBaseR, S.chimneyTopR, C.concrete, true);
        flat.push({ e: e[0], n: e[1], r: S.chimneyBaseR + 4, z: c.z_huippu_n2000_m - c.korkeus_maasta_m });
        used.push(e); tops['piippu' + (i + 1)] = { e: e[0], n: e[1], y: top };
      });
      if (tamp) {
        var e2 = tamp.sijainti.epsg3067, w2 = P.enToWorld(e2[0], e2[1]), t2 = tamp.z_huippu_n2000_m - LAKE, b2 = t2 - tamp.korkeus_maasta_m;
        chimney(b, w2.x, -w2.y, b2 - 1, t2, S.tampellaBaseR, S.tampellaTopR, C.brick, false);
        flat.push({ e: e2[0], n: e2[1], r: S.tampellaBaseR + 4, z: tamp.z_huippu_n2000_m - tamp.korkeus_maasta_m });
        used.push(e2); tops.tampella = { e: e2[0], n: e2[1], y: t2 };
      }
      // muut korkeat kapeat rakenteet (mastot ja piiput) ohuina kartioina
      (data.korkeat_kapeat_rakenteet_vyohykkeella || []).forEach(function (s) {
        var dup = (nn && Math.hypot(s.e - nn.e, s.n - nn.n) < 40) || used.some(function (u) { return Math.hypot(s.e - u[0], s.n - u[1]) < 40; });
        if (dup) return;
        var w = P.enToWorld(s.e, s.n), top = s.z_huippu - LAKE, base = top - s.h_maasta, rad = Math.max(0.45, Math.min(2.5, (s.ylaosan_leveys_m || 1.5) / 2));
        b.cyl(w.x, -w.y, rad * 1.5, rad, base - 1, top, C.mast, 8, true);
        flat.push({ e: s.e, n: s.n, r: rad * 1.5 + 4, z: s.z_huippu - s.h_maasta });
      });
      var old = mesh.geometry; mesh.geometry = b.geometry(); old.dispose(); mesh.visible = b.pos.length > 0;
    }
    return { mesh: mesh, build: build, flatten: function () { return flat; }, tops: function () { return tops; }, rebase: function () { build(); }, settings: S };
  }
  var api = { create: create, SETTINGS: SETTINGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Maamerkit3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
