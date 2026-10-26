/* Simulaattori – maamerkit 3D-malleina (Näsinneula, piiput, korkeat kapeat rakenteet).
 *
 * Pintamalli (DSM) ei tunne ohuita rakenteita luotettavasti: mediaanisuodatus poistaa ne, ja kapea huippu näkyisi pintamallissa
 * epätarkkana piikkinä. Siksi korkeat kapeat rakenteet mallinnetaan käsin maamerkit.json-tiedoston mitoista ja pintamalli tasataan
 * niiden kohdalta maanpintaan (Maasto.setFlatten). Voimalaitoksen rakennukset ja kuljetin jäävät pintamallin varaan.
 * Mitat: Näsinneulan korkeus on 168 m maanpinnasta (Wikipedia, luettu 26.10.2026), ja se on asetettu tunnetuksi arvoksi (ei pistepilvestä, koska harva pistepilvi antaa vain 152 m).
 * Aiempi versio käytti lukua 168 m järven pinnasta, mikä oli virhe (juuren maanpinta on 13,7 m järven pinnan yläpuolella). Laserkeilauksen korkein havaittu piste
 * on 152 m maasta, koska ohut masto ei näy keilauksessa täysin. Lautanen 27 m halkaisijaltaan, katon reuna 129 m maasta, varsi 9,1 m.
 * Naistenlahden voimalaitos (vaihe 3j): kattilarakennus, toinen suuri rakennus ja polttoainekuljetin (kuljetinsilta) erikoismalleina maamerkit.json-tiedoston ääriviivoista ja korkeuksista.
 * Piiput noin 90 m maasta. Tampellan piippu 100,7 m maasta. */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka;
  var LAKE = P.LAKE_Z;
  var SETTINGS = { nasinneulaHeightAboveGround: 168, shaftBaseR: 4.6, shaftTopR: 3.3, plateR: 13.5, chimneyBaseR: 4.2, chimneyTopR: 2.5, tampellaBaseR: 3.6, tampellaTopR: 2.0 };
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


    // ---------- yleiset rakennusosat (vaihe 3j) ----------
    // Kolmio, jonka kierto sovitetaan annettuun ulkonormaaliin
    function triN(b, p, q, r, n, c) {
      var ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { var t = q; q = r; r = t; }
      b.tri(p, q, r, n, n, n, c);
    }
    // Pystysuora nelikulmio (ulkonormaali n)
    function quadN(b, p0, p1, p2, p3, n, c) { triN(b, p0, p1, p2, n, c); triN(b, p0, p2, p3, n, c); }
    // Monikulmiopilari: poly = [[x, z], ...] maailmakoordinaateissa, seinät kerroksittain (bands = [[yAla, yYla, väri], ...]) ja tasakatto
    function prism(b, poly, y0, y1, wallC, roofC, bands) {
      var n = poly.length, area = 0, i;
      for (i = 0; i < n; i++) { var j = (i + 1) % n; area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; }
      var sg = area > 0 ? 1 : -1;
      bands = bands || [[y0, y1, wallC]];
      for (i = 0; i < n; i++) {
        var a = poly[i], c = poly[(i + 1) % n], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz); if (l < 0.01) continue;
        var nm = [sg * dz / l, 0, -sg * dx / l];
        for (var k = 0; k < bands.length; k++) {
          var ya = Math.max(y0, bands[k][0]), yb = Math.min(y1, bands[k][1]); if (yb <= ya) continue;
          quadN(b, [a[0], ya, a[1]], [c[0], ya, c[1]], [c[0], yb, c[1]], [a[0], yb, a[1]], nm, bands[k][2]);
        }
      }
      var cont = poly.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), idx;
      try { idx = THREE.ShapeUtils.triangulateShape(cont, []); } catch (e) { return; }
      for (i = 0; i < idx.length; i++) triN(b, [poly[idx[i][0]][0], y1, poly[idx[i][0]][1]], [poly[idx[i][1]][0], y1, poly[idx[i][1]][1]], [poly[idx[i][2]][0], y1, poly[idx[i][2]][1]], [0, 1, 0], roofC);
    }
    function scaled(poly, k) {
      var cx = 0, cz = 0; poly.forEach(function (p) { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
      return poly.map(function (p) { return [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]; });
    }
    function polyWorld(arr) { return arr.map(function (e) { var w = P.enToWorld(e[0], e[1]); return [w.x, -w.y]; }); }
    function centroidEN(arr) { var e = 0, n = 0; arr.forEach(function (p) { e += p[0]; n += p[1]; }); return [e / arr.length, n / arr.length]; }
    // Suorakulmainen putki kahden pisteen välillä (kuljetinsilta): leveys w, yläpinnan korkeudet yt0 ja yt1, paksuus th
    function gallery(b, p0, p1, w, yt0, yt1, th) {
      var dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1, ox = -dz / l * w / 2, oz = dx / l * w / 2;
      var L0 = [p0[0] + ox, p0[1] + oz], R0 = [p0[0] - ox, p0[1] - oz], L1 = [p1[0] + ox, p1[1] + oz], R1 = [p1[0] - ox, p1[1] - oz];
      var wall = [0.78, 0.80, 0.80], glass = [0.22, 0.27, 0.32], roof = [0.52, 0.54, 0.55], under = [0.45, 0.46, 0.46];
      var nl = [ox / (w / 2), 0, oz / (w / 2)], nr = [-nl[0], 0, -nl[2]];
      [[L0, L1, nl], [R0, R1, nr]].forEach(function (sd) {
        var a = sd[0], c = sd[1], nn = sd[2];
        var bands = [[0, 0.30, wall], [0.30, 0.72, glass], [0.72, 1.0, wall]];
        bands.forEach(function (bd) {
          var ya0 = yt0 - th + th * bd[0], yb0 = yt0 - th + th * bd[1], ya1 = yt1 - th + th * bd[0], yb1 = yt1 - th + th * bd[1];
          quadN(b, [a[0], ya0, a[1]], [c[0], ya1, c[1]], [c[0], yb1, c[1]], [a[0], yb0, a[1]], nn, bd[2]);
        });
      });
      var nt = [-dz / l * 0.0, 1, 0];
      quadN(b, [L0[0], yt0, L0[1]], [L1[0], yt1, L1[1]], [R1[0], yt1, R1[1]], [R0[0], yt0, R0[1]], nt, roof);
      quadN(b, [L0[0], yt0 - th, L0[1]], [L1[0], yt1 - th, L1[1]], [R1[0], yt1 - th, R1[1]], [R0[0], yt0 - th, R0[1]], [0, -1, 0], under);
    }
    // Naistenlahden voimalaitos: kattilarakennus (matala runko ja korkeampi kattilaosa), toinen suuri rakennus, kuljetinsilta tukineen ja piiput
    function plantBuildings(b, m) {
      var kb = m.kattilarakennus;
      if (kb && kb.ääriviiva) {
        var poly = polyWorld(kb.ääriviiva.epsg3067.slice(0, -1)), g0 = kb.z_maa_n2000_m - LAKE, ce = centroidEN(kb.ääriviiva.epsg3067), rmax = 0;
        kb.ääriviiva.epsg3067.forEach(function (p) { rmax = Math.max(rmax, Math.hypot(p[0] - ce[0], p[1] - ce[1])); });
        var low = 28, y0 = g0 - 2;
        var dark = [0.46, 0.49, 0.52], mid = [0.72, 0.74, 0.75], lite = [0.80, 0.81, 0.80], roofG = [0.55, 0.56, 0.57];
        prism(b, poly, y0, g0 + low, mid, roofG, [[y0, g0 + 4, dark], [g0 + 4, g0 + 12, mid], [g0 + 12, g0 + 14, dark], [g0 + 14, g0 + low, lite]]);
        var tall = scaled(poly, 0.42), top = g0 + (kb.korkeus_p95_maasta_m || 46);
        prism(b, tall, g0 + low - 0.5, top, [0.64, 0.66, 0.68], roofG, [[g0 + low, g0 + 34, [0.62, 0.64, 0.66]], [g0 + 34, g0 + 36, dark], [g0 + 36, top, [0.70, 0.72, 0.73]]]);
        flat.push({ e: ce[0], n: ce[1], r: rmax + 4, z: kb.z_maa_n2000_m, poly: kb.ääriviiva.epsg3067 });
      }
      (m.muut_suuret_rakennukset || []).forEach(function (mb) {
        if (!mb.ääriviiva) return;
        var poly = polyWorld(mb.ääriviiva.epsg3067.slice(0, -1)), g1 = mb.z_maa_n2000_m - LAKE, ce = centroidEN(mb.ääriviiva.epsg3067), rmax = 0;
        mb.ääriviiva.epsg3067.forEach(function (p) { rmax = Math.max(rmax, Math.hypot(p[0] - ce[0], p[1] - ce[1])); });
        var top = g1 + (mb.korkeus_p95_maasta_m || 20);
        prism(b, poly, g1 - 2, top, [0.74, 0.74, 0.70], [0.5, 0.5, 0.5], [[g1 - 2, g1 + 3, [0.52, 0.53, 0.55]], [g1 + 3, top, [0.74, 0.74, 0.70]]]);
        flat.push({ e: ce[0], n: ce[1], r: rmax + 4, z: mb.z_maa_n2000_m, poly: mb.ääriviiva.epsg3067 });
      });
      var cv = m.kuljetinsilta;
      if (cv && cv.korkeusprofiili_maasta_m && cv.korkeusprofiili_maasta_m.length > 1) {
        var prof = cv.korkeusprofiili_maasta_m, gr = (cv.z_p50_n2000_m || 117.4) - (cv.korkeus_maasta_p50_m || 19.6) - LAKE, wdt = cv.leveys_m || 6.7;
        var pts = prof.map(function (q) { var w = P.enToWorld(q.e, q.n); return [w.x, -w.y, gr + q.korkeus_maasta_m]; });
        for (var i = 0; i < pts.length - 1; i++) gallery(b, pts[i], pts[i + 1], wdt, pts[i][2], pts[i + 1][2], 3.2);
        // tukipilarit noin 12 m:n välein ja päissä
        var total = 0, seg = [];
        for (i = 0; i < pts.length - 1; i++) { var sl = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(sl); total += sl; }
        var nCol = Math.max(2, Math.round(total / 12)), c;
        for (c = 0; c <= nCol; c++) {
          var dd = c / nCol * total, k = 0; while (k < seg.length - 1 && dd > seg[k]) { dd -= seg[k]; k++; }
          var f = Math.min(1, dd / (seg[k] || 1)), px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pz = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f, py = pts[k][2] + (pts[k + 1][2] - pts[k][2]) * f - 3.2;
          if (py - gr > 1.5) prism(b, [[px - 0.4, pz - 0.4], [px + 0.4, pz - 0.4], [px + 0.4, pz + 0.4], [px - 0.4, pz + 0.4]], gr - 1, py, [0.6, 0.6, 0.6], [0.6, 0.6, 0.6]);
        }
        if (cv.suorakulmio && cv.suorakulmio.epsg3067) {
          var rc = cv.suorakulmio.epsg3067, cc = centroidEN(rc);
          flat.push({ e: cc[0], n: cc[1], r: (cv.pituus_m || 70) / 2 + 8, z: gr + LAKE, poly: rc });
        }
      }
    }

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
      var tip = g + S.nasinneulaHeightAboveGround;
      b.cyl(x, z, S.shaftBaseR, S.shaftTopR, g - 1, g + 118, C.concrete, 20, false);
      b.cyl(x, z, S.shaftTopR, S.plateR - 1.5, g + 118, g + 123, C.deck, 24, false);
      b.cyl(x, z, S.plateR - 1.5, S.plateR, g + 123, g + 124, C.deck, 24, false);
      b.cyl(x, z, S.plateR, S.plateR, g + 124, g + 129, C.glass, 24, false);
      b.cyl(x, z, S.plateR, S.plateR - 0.5, g + 129, g + 130, C.deck, 24, false);
      b.cyl(x, z, S.plateR - 0.5, 3.5, g + 130, g + 136, C.roof, 24, true);
      // masto: huippu on tip (168 m maasta), joten masto jaetaan lautasen katon (g + 136) ja huipun väliin
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
        if (m.tunnus === 'naistenlahden_voimalaitos') { piiput = m.piiput || []; plantBuildings(b, m); }
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
        // piipun ylälaippa (kehä) ja tummempi suuvaippa
        b.cyl(w2.x, -w2.y, S.tampellaTopR, S.tampellaTopR + 0.6, t2 - 3.2, t2 - 2.0, C.brick, 16, false);
        b.cyl(w2.x, -w2.y, S.tampellaTopR + 0.6, S.tampellaTopR + 0.6, t2 - 2.0, t2 - 0.5, [0.42, 0.24, 0.20], 16, false);
        b.cyl(w2.x, -w2.y, S.tampellaTopR + 0.6, S.tampellaTopR, t2 - 0.5, t2, C.brick, 16, true);
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
