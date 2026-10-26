/* Simulaattori – turvalaitteet 3D-malleina kuljettajan näkymässä (vaihe 3b).
 *
 * Mallit tulevat merimerkkimoduulista (js/merimerkit3d.js, Merimerkit3D.luoInstanssit): jokainen turvalaite piirtyy moduulin mallilla,
 * ja samanlaiset merkit piirretään yhdellä instanssikutsulla. Ryhmä uusitaan, kun alus on liikkunut 400 m.
 *  - Kelluvat merkit (viitat) seisovat vedenpinnassa (z = 0). Kiinteät merkit (kummeli, loistot) seisovat maastomallin maanpinnalla.
 *    Valon korkeus (valon_korkeus_vedesta) mitataan vedenpinnasta, joten loiston torni on valon korkeus miinus maanpinnan korkeus.
 *  - Linjataulut piirretään Linjamerkki-turvalaitteista. Taulun etupinnan suunta tulee taululinjan päätepisteestä: suunta merkistä linjaa pitkin
 *    tulevaa katsojaa kohti.
 *  - Vesiliikennemerkeillä ei ole aineistossa suuntaa, joten kilpi käännetään kohti alusta, kun ryhmä uusitaan (oletus).
 *  - Pienin näkyvä leveys (vaihe 3g): moduulin verteksisäädin (asetaPikseli) pitää ohuet osat vähintään yhden laitepikselin levyisinä, ohuen osan peittävyys on todellinen leveys / piirretty leveys,
 *    ja merkki häivytetään luokkansa näkyvyysrajalla (Merimerkit3D.ASETUKSET.nakyvyysRaja). Kiikarilla rajat kerrotaan suurennuksella (setBino).
 *  - Valolaitteiden (torni, valon korkeus, sektorit) tiedot kulkevat mukana funktiossa valot() vaihetta 4 (yönäkymä) varten.
 * Päivällä valot eivät pala. Tämän tiedoston Builder-luokkaa käyttää vain maamerkkimoduuli (maamerkit3d.js). */
(function (root) {
  'use strict';
  var THREE = root.THREE, MM = root.Merimerkit3D;
  var EC = { r: [0.886, 0.129, 0.110], g: [0.075, 0.627, 0.290], y: [0.949, 0.765, 0.067], b: [0.07, 0.07, 0.07], w: [0.95, 0.95, 0.95], k: [0.9, 0.9, 0.88] };
  var SETTINGS = { loadRadius: 7000, showRadius: 6500, binoRadius: 9000, resync: 400, minPx: 1.0, maanpintaRaja: 0.25, kummeliLahi: 150, kummeliHyst: 20 };   // showRadius kattaa loistojen 6 000 m:n rajan, binoRadius kiikarin 8,4 km:n viittarajan

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

  var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function bearing(dx, dy) { return ((Math.atan2(dx, dy) * 180 / Math.PI) % 360 + 360) % 360; }

  function create(scene, opts) {
    opts = opts || {};
    var S = {}; for (var k in SETTINGS) S[k] = SETTINGS[k];
    var holder = new THREE.Group(); holder.name = 'turvalaitteet'; scene.add(holder);
    var last = { x: 1e9, y: 1e9, n: -1, unknown: 0, t: 0 }, count = 0, valotList = [], stats = { kohteita: 0, piirtokutsuja: 0, kolmioita: 0, varamalleja: 0 };
    var groundAt = opts.groundAt || function () { return null; };
    MM.ASETUKSET.minPx = S.minPx; MM.asetaNakyvyys(1);
    var bino = false;

    // Linjataulun suunta: lähin taululinjan päätepiste (enintään 800 m: linjan pää on ylemmän taulun kohdalla, alempi taulu on sen edessä), suunta päätepisteestä linjaa pitkin
    function boardFacing(a, boards) {
      var best = null, bd = 800;
      boards.forEach(function (b) { var d = Math.hypot(b.x - a.x, b.y - a.y); if (d < bd) { bd = d; best = b; } });
      return best ? bearing(-best.dirX, -best.dirY) : null;
    }

    function clearOld() {
      for (var i = holder.children.length - 1; i >= 0; i--) {
        var g = holder.children[i]; holder.remove(g);
        g.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); });   // geometriat ja materiaali ovat jaettuja, niitä ei vapauteta
      }
    }

    // Kummelin tarkkuustaso: alle kummeliLahi metrin päässä piirretään pienistä kivistä kasattu malli, kauempana yksinkertainen kartio samalla siluetilla.
    // Molemmat mallit ovat omina instanssiryhminään, ja taso vaihdetaan kuvassa nollaamalla toisen ryhmän instanssin koko (hystereesi kummeliHyst).
    var kum = [];
    function lodKummelit(x, y) {
      for (var i = 0; i < kum.length; i++) {
        var c = kum[i], d = Math.hypot(c.x - x, c.y - y), near = c.near ? d < S.kummeliLahi + S.kummeliHyst : d < S.kummeliLahi;
        if (near === c.near) continue;
        c.near = near;
        c.mNear.setMatrixAt(c.i, near ? c.A : ZERO); c.mFar.setMatrixAt(c.i, near ? ZERO : c.A);
        c.mNear.instanceMatrix.needsUpdate = true; c.mFar.instanceMatrix.needsUpdate = true;
      }
    }
    function sync(x, y, force) {
      syncInner(x, y, force);
      lodKummelit(x, y);
    }
    function syncInner(x, y, force) {
      var M = root.Merkit;
      if (!M) return;
      var now = performance.now();
      var due = Math.hypot(x - last.x, y - last.y) >= S.resync || (last.unknown > 0 && now - last.t > 2500);
      if (!force && !due) return;
      var list = M.near(x, y, radius());
      if (!force && list.length === last.n && !(last.unknown > 0 && now - last.t > 2500) && Math.hypot(x - last.x, y - last.y) < 800) return;
      last.x = x; last.y = y; last.n = list.length; last.t = now;
      var boards = M.nearBoards(x, y, radius()), items = [], unknown = 0, lights = [], kumItems = [];
      list.forEach(function (a) {
        var fixed = a.tyyppi !== 'Viitta' && a.tyyppi !== 'Poiju';
        var gz = 0, t = a;
        if (fixed) {
          var gh = groundAt(a.x, a.y);
          if (gh == null) { unknown++; gh = 0; }
          gz = Math.max(0, gh);
          var mp = Math.round(gz / S.maanpintaRaja) * S.maanpintaRaja;
          if (a.valoKorkeus && mp > a.valoKorkeus - 2.5) mp = Math.max(0, a.valoKorkeus - 2.5);
          t = Object.create(a); t.maanpinta = mp;
        }
        var it = { turvalaite: t, x: a.x, y: a.y, z: gz };
        if (a.tyyppi === 'Linjamerkki') { var f = boardFacing(a, boards); if (f != null) it.suunta = f; }
        else if (a.tyyppi === 'Kummeli') {
          it.suunta = (Number(a.numero) * 37) % 360;   // toistettava kääntö, jotta kummelit eivät ole identtisiä
          var tf = Object.create(t); tf.kaukana = true;
          kumItems.push({ x: a.x, y: a.y, it: it, itFar: { turvalaite: tf, x: a.x, y: a.y, z: gz, suunta: it.suunta } });
          return;
        }
        items.push(it);
        if (a.valaistu || a.valotunnus) {
          var p = MM._normalisoi(t, MM.ASETUKSET);
          lights.push({ numero: a.numero, nimi: a.nimi, tyyppi: a.tyyppi, x: a.x, y: a.y, maanpinta: gz, valoKorkeus: a.valoKorkeus, valotunnus: a.valotunnus, nakyvyys: p.nakyvyys, valaistu: a.valaistu,
            sektorit: (a.sektorit || []).map(function (s) { return { alku: s.alku, loppu: s.loppu, vari: s.vari, rgb: MM.VALO_RGB[String(s.vari).toLowerCase()] || MM.VALO_RGB.v }; }) });
        }
      });
      last.unknown = unknown;
      M.nearSigns(x, y, radius()).forEach(function (sg) {
        var ts = { tyyppi: 'Vesiliikennemerkki', lajityyppi: sg.laji, rajoitusarvo: sg.arvo, lisakilpi1: sg.kilpi, nimi: sg.nimi };
        items.push({ turvalaite: ts, x: sg.x, y: sg.y, z: Math.max(0, groundAt(sg.x, sg.y) || 0), suunta: bearing(x - sg.x, y - sg.y) });
      });
      // kummelit: sama joukko sekä lähi- että kaukomallina, tarkkuustaso valitaan lodKummelit-funktiossa
      kumItems.forEach(function (c) { items.push(c.it); });
      kumItems.forEach(function (c) { items.push(c.itFar); });
      var g = MM.luoInstanssit(items, { ylos: 'y', minPx: S.minPx, tulostaLoki: false });
      clearOld();
      kum = [];
      if (kumItems.length) {
        var mN = null, mF = null;
        g.traverse(function (o) { if (o.isInstancedMesh) { if (/^kummeli_kaukana/.test(o.name)) mF = o; else if (/^kummeli/.test(o.name)) mN = o; } });
        if (mN && mF) kumItems.forEach(function (c, i) { var A = new THREE.Matrix4(); mN.getMatrixAt(i, A); kum.push({ x: c.x, y: c.y, i: i, A: A, mNear: mN, mFar: mF, near: null }); });
      }
      holder.add(g);
      stats = g.userData.tilasto;
      if (kum.length) stats.kohteita -= kum.length;   // kummelit on listattu kahdesti (lähi- ja kaukomalli), mutta piirtyy kummastakin vain toinen
      valotList = lights; count = list.length;   // (vaihe 3g: tämä rivi oli aiemmin kommentin jatkona, joten valot()-lista jäi tyhjäksi)
      holder.userData.valot = valotList; holder.userData.tilasto = stats;
    }
    function rebase() { last.n = -1; last.x = 1e9; }
    function radius() { return bino ? S.binoRadius : S.showRadius; }
    // kuvapikselin koko: maailmayksikköä per laitepikseli ja per piirtopuskurin pikseli 1 m etäisyydellä
    function setPixel(worldPerDevPx, worldPerBufPx) { MM.asetaPikseli(worldPerDevPx, worldPerBufPx); }
    // kiikari päälle tai pois: näkyvyysrajat kerrotaan suurennuksella (mult) ja näytettävien laitteiden säde kasvaa. Kutsuja huolehtii latauksesta (loadRadius).
    function setBino(on, mult) { bino = !!on; MM.asetaNakyvyys(bino ? mult : 1); last.n = -1; last.x = 1e9; }
    return { group: holder, sync: sync, setPixel: setPixel, setBino: setBino, radius: radius, rebase: rebase, settings: S, count: function () { return count; }, valot: function () { return valotList; }, tilasto: function () { return stats; }, addAid: null, Builder: Builder };
  }

  var api = { create: create, Builder: Builder, SETTINGS: SETTINGS, EC: EC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Merkit3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
