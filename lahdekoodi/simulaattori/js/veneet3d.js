/* Veneet3D: venemallit, laituripaikat ja instanssipiirto Näsijärven simulaattoriin (three.js r128).
 *
 * Käyttö:  var veneet = Veneet3D.luoVeneet(scene, asetukset);
 *          veneet.asetaLaiturit(vesiesteTiilet, Paikka.getOrigin(), { onVesi: vesiTesti });
 *          joka kuva:  veneet.paivita(aikaSekunteina, { x: alus.x, y: alus.y });
 *
 * Koordinaatit: veneen oma malli on metreinä, x keulaan, y ylös, z styyrpuuriin (oikealle), origo vesilinjassa laivan keskellä.
 * Venetiedot säilytetään ETRS-TM35FIN-koordinaatteina (e, n), joten maailman origon siirto (rebase) ei hajota veneitä.
 * Simulaattorin maailmassa x = e - origo.e, y = ylös, z = -(n - origo.n). Suunnat ovat ruutusuuntia (asteina pohjoisesta myötäpäivään).
 *
 * Piirto: yksi InstancedMesh per malli ja tarkkuustaso (lähimalli alle 300 m, kaukomalli sen yli), yhteinen Lambert-materiaali,
 * runkojen ja kansien värit instanssikohtaisina attribuutteina (iHull, iDeck, iAks). Ei tekstuureita.
 * Mallit, mitat ja oletukset on kirjattu tiedostoon VENEET.md. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  if (!THREE && typeof require === 'function') { try { THREE = require('./lib/three.min.js'); } catch (e) { THREE = null; } }
  if (!THREE) throw new Error('Veneet3D tarvitsee three.js r128:n (THREE).');
  var Paikka = root.Paikka;
  if (!Paikka && typeof require === 'function') { try { Paikka = require('./lib/paikka.js'); } catch (e) { Paikka = null; } }

  var VERSIO = '1.0 (26.10.2026)';
  var PI = Math.PI, RAD = PI / 180;

  // ---------- asetukset ----------
  var ASETUKSET = {
    siemen: 0,                    // kokonaisluku, jolla koko satamat saadaan toisenlaisiksi (0 = oletus)
    taytto: 0.7,                  // venepaikkojen täyttöaste 0 ... 1 (kausivaihtelu myöhemmin tästä)
    luokkajakauma: { soutu: 0.15, pieni: 0.35, keski: 0.30, purje: 0.20 },
    paikkavali: 3.5,              // venepaikkojen väli laiturin suunnassa (m)
    keulaEtaisyys: 0.5,           // keulan etäisyys laiturin reunasta (m)
    poijuKerroin: 1.5,            // poijun etäisyys laiturin reunasta venepituuksina
    poijuHalkaisija: 0.4,         // poijun halkaisija (m)
    laituriLeveys: { narrow: 2, wide: 5 },   // laiturin leveys (m), kuten Laiturit3D.SETTINGS
    paatyMarginaali: 2.75,        // ensimmäisen ja viimeisen paikan keskipisteen vähimmäisetäisyys laiturin päästä tai kulmasta (m)
    kulmaRaja: 25,                // laiturin suunnanmuutos (astetta), jonka yli kulmassa ei ole paikkoja
    purje: { minEtaisyysRannasta: 12, minLaiturinPituus: 20 },   // purjeveneen paikan vapaan veden vähimmäissäde (m) ja kapean laiturin vähimmäispituus (m)
    keinunta: { amplitudi: [1, 2], jakso: [3, 6], nyokkays: 0.6, liikkuva: 0.5 },   // asteina ja sekunteina, nyokkays = nyökkäyksen amplitudin suhde kallistukseen
    nakyvyysRaja: 2500,           // venettä ei piirretä tätä kauempaa (m)
    kaukoRaja: 300,               // kaukomalli tämän etäisyyden yli (m)
    poijuRaja: 600,               // poijut ja kiinnitysköydet piirretään tätä lähempänä (m)
    kokoVaihtelu: true            // pituus ja leveys vaihtelevat tunnisteesta
  };
  function yhdista(a, oletus) {
    if (!a) return oletus;
    var o = {};
    for (var k in oletus) {
      var v = a[k], d = oletus[k];
      o[k] = v === undefined ? d : (d && typeof d === 'object' && !Array.isArray(d) && typeof v === 'object' && !Array.isArray(v) ? yhdista(v, d) : v);
    }
    return o;
  }

  // ---------- luokat ----------
  // pituus: vaihteluväli (m), nimellinen pituus on mallin oma koko, kaiku: tutkapoikkipinta-alan arvio (m2)
  var LUOKAT = {
    soutu: { nimi: 'Soutuvene', pituus: [4.0, 5.0], nom: 4.5, leveys: 1.5, kaiku: 1.0, perakorkeus: 0.3 },
    pieni: { nimi: 'Pieni moottorivene', pituus: [4.5, 5.5], nom: 5.0, leveys: 1.95, kaiku: 2.5, perakorkeus: 0.55 },
    keski: { nimi: 'Keskikokoinen moottorivene', pituus: [6.0, 8.0], nom: 7.0, leveys: 2.5, kaiku: 6.0, perakorkeus: 0.7 },
    purje: { nimi: 'Purjevene', pituus: [7.2, 9.9], nom: 8.5, leveys: 2.85, kaiku: 9.0, perakorkeus: 0.8, masto: 12.0 }
  };
  var LUOKKA_JARJESTYS = ['soutu', 'pieni', 'keski', 'purje'];

  // ---------- pienet apurit ----------
  function hash32(a, b) { var h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; return h || 1; }
  function hashStr(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h || 1; }
  function rng(seed) { var t = seed >>> 0; return function () { t = (t + 0x6D2B79F5) >>> 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // ---------- geometrian rakentaja ----------
  // Piste: sijainti, normaali, väri (kerroin tai todellinen väri) ja osa (0 kiinteä väri, 1 rungon väri, 2 kannen väri, 3 aksenttiväri)
  function Rak() { this.p = []; this.n = []; this.c = []; this.o = []; this.tris = 0; }
  Rak.prototype.tri = function (a, b, c, na, nb, nc, col) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-12) return;   // surkastunut kolmio jätetään pois
    var P = [a, b, c], N = [na, nb, nc];
    // kärkien järjestys vastapäivään normaalin suunnasta
    if (cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2]) < 0) { P = [a, c, b]; N = [na, nc, nb]; }
    for (var i = 0; i < 3; i++) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(N[i][0], N[i][1], N[i][2]);
      this.c.push(col[0], col[1], col[2]); this.o.push(col[3] || 0);
    }
    this.tris++;
  };
  Rak.prototype.flat = function (a, b, c, col) { var n = unit(cross(sub(b, a), sub(c, a))); this.tri(a, b, c, n, n, n, col); };
  // Nelikulmio annetulla normaalilla
  Rak.prototype.quadN = function (a, b, c, d, n, col) { this.tri(a, b, c, n, n, n, col); this.tri(a, c, d, n, n, n, col); };
  // Monikulmio viuhkana, normaali osoittaa suuntaan dir (vähintään sen puolelle)
  Rak.prototype.fan = function (pts, dir, col) {
    var n = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (dot(n, dir) < 0) n = mul(n, -1);
    for (var i = 1; i + 1 < pts.length; i++) this.tri(pts[0], pts[i], pts[i + 1], n, n, n, col);
  };
  // Laatikko, pohja jätetään pois (veden alla tai piilossa). skip: 'x-', 'x+', 'y-', 'y+', 'z-', 'z+'
  Rak.prototype.box = function (x0, x1, y0, y1, z0, z1, col, skip) {
    skip = skip || ['y-'];
    var self = this, ok = function (k) { return skip.indexOf(k) < 0; };
    var A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y1, z0], D = [x0, y1, z0], E = [x0, y0, z1], F = [x1, y0, z1], G = [x1, y1, z1], H = [x0, y1, z1];
    if (ok('y+')) self.quadN(D, C, G, H, [0, 1, 0], col);
    if (ok('y-')) self.quadN(A, E, F, B, [0, -1, 0], col);
    if (ok('x+')) self.quadN(B, F, G, C, [1, 0, 0], col);
    if (ok('x-')) self.quadN(A, D, H, E, [-1, 0, 0], col);
    if (ok('z+')) self.quadN(E, H, G, F, [0, 0, 1], col);
    if (ok('z-')) self.quadN(A, B, C, D, [0, 0, -1], col);
  };
  // Suikaleet kangas: rinkaat (taulukko pistetaulukoita), o: {closed, smooth, col, ref (sisäpiste) tai dir (haluttu normaali ensimmäiselle pinnalle)}
  Rak.prototype.loft = function (rings, o) {
    o = o || {};
    var N = rings.length, M = rings[0].length, closed = !!o.closed, MJ = closed ? M : M - 1, i, j;
    var fc = typeof o.col === 'function' ? o.col : function () { return o.col; };
    var P = function (ii, jj) { return rings[ii][jj % M]; };
    var fn = [];                                        // pintojen normaalit (painotettu pinta-alalla)
    for (i = 0; i < N - 1; i++) { fn.push([]); for (j = 0; j < MJ; j++) fn[i].push(cross(sub(P(i + 1, j + 1), P(i, j)), sub(P(i + 1, j), P(i, j + 1)))); }
    // suunta: haluttu normaali ensimmäiselle ei-surkastuneelle pinnalle
    var sg = 1, found = false;
    for (i = 0; i < N - 1 && !found; i++) for (j = 0; j < MJ && !found; j++) {
      var nn = fn[i][j]; if (len(nn) < 1e-9) continue;
      found = true;
      if (o.ref) { var cen = mul(add(add(P(i, j), P(i, j + 1)), add(P(i + 1, j), P(i + 1, j + 1))), 0.25); sg = dot(nn, sub(cen, o.ref)) < 0 ? -1 : 1; }
      else if (o.dir) sg = dot(nn, o.dir) < 0 ? -1 : 1;
    }
    var vn = function (ii, jj) {                         // kärjen normaali
      if (!o.smooth) return null;
      var s = [0, 0, 0], k;
      var js = closed ? [(jj - 1 + M) % M, jj % M] : [jj - 1, jj];
      for (var a = ii - 1; a <= ii; a++) { if (a < 0 || a > N - 2) continue; for (k = 0; k < 2; k++) { var jj2 = js[k]; if (jj2 < 0 || jj2 >= MJ) continue; s = add(s, fn[a][jj2]); } }
      var l = len(s); return l < 1e-9 ? null : mul(s, sg / l);
    };
    for (i = 0; i < N - 1; i++) for (j = 0; j < MJ; j++) {
      var a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j), col = fc(i, j);
      var f = fn[i][j], fl = len(f);
      var flatN = fl < 1e-9 ? [0, 1, 0] : mul(f, sg / fl);
      var na = vn(i, j) || flatN, nb = vn(i, j + 1) || flatN, nc = vn(i + 1, j + 1) || flatN, nd = vn(i + 1, j) || flatN;
      this.tri(a, b, c, na, nb, nc, col); this.tri(a, c, d, na, nc, nd, col);
    }
  };
  // Putki kahden pisteen välille (säteet ra ja rb, sivuja sides), päät avoimia tai suljettuja
  Rak.prototype.tube = function (a, b, ra, rb, sides, col, capB, rot) {
    var d = unit(sub(b, a)), u = cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); u = unit(u); var v = cross(d, u);
    var r0 = [], r1 = [], ph = rot === undefined ? PI / sides : rot;
    for (var k = 0; k < sides; k++) {
      var an = ph + k / sides * 2 * PI, ca = Math.cos(an), sa = Math.sin(an), dir = add(mul(u, ca), mul(v, sa));
      r0.push(add(a, mul(dir, ra))); r1.push(add(b, mul(dir, rb)));
    }
    var mid = mul(add(a, b), 0.5);
    this.loft([r0, r1], { closed: true, col: col, ref: mid, smooth: true });
    if (capB) this.fan(r1, d, col);
  };
  // Kapeneva laatikko: pohjarengas ja yläkansi (4 pistettä), sivut + kansi
  Rak.prototype.kartio = function (base, top, col, colTop) {
    var cen = [0, 0, 0], i; for (i = 0; i < 4; i++) { cen = add(cen, base[i]); cen = add(cen, top[i]); } cen = mul(cen, 1 / 8);
    this.loft([base, top], { closed: true, col: col, ref: cen });
    this.fan(top, [0, 1, 0], colTop || col);
  };
  // Ohut nauha pisteestä a pisteeseen b, leveys w suuntaan wd
  Rak.prototype.nauha = function (a, b, w, wd, col) {
    var h = mul(wd, w / 2), n = unit(cross(sub(b, a), wd));
    this.quadN(sub(a, h), add(a, h), add(b, h), sub(b, h), n, col);
  };
  Rak.prototype.geometria = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('osa', new THREE.Float32BufferAttribute(this.o, 1));
    g.computeBoundingSphere();
    g.userData = { kolmiot: this.tris };
    return g;
  };

  // ---------- värit ----------
  var F = {            // kiinteät värit [r, g, b, 0]
    lasi: [0.20, 0.27, 0.33, 0], tummaMetalli: [0.17, 0.18, 0.2, 0], moottori: [0.14, 0.14, 0.15, 0], kuori: [0.72, 0.74, 0.76, 0],
    pehmuste: [0.74, 0.74, 0.7, 0], valkoinen: [0.94, 0.94, 0.92, 0], mastoAlu: [0.78, 0.8, 0.82, 0], tangot: [0.72, 0.74, 0.77, 0],
    airo: [0.72, 0.56, 0.34, 0], purje: [0.9, 0.9, 0.87, 0], pohja: [0.2, 0.17, 0.2, 0], kumi: [0.1, 0.1, 0.11, 0], teak: [0.6, 0.43, 0.24, 0],
    poiju: [0.95, 0.95, 0.95, 0], koysi: [0.12, 0.12, 0.12, 0]
  };
  function T(k) { return [k, k, k, 1]; }       // rungon väri kertoimella k
  function D(k) { return [k, k, k, 2]; }       // kannen väri
  function K(k) { return [k, k, k, 3]; }       // aksenttiväri

  var RUNKOVARIT = [   // [nimi, rgb, paino]
    ['valkoinen', [0.93, 0.93, 0.91], 0.60], ['sininen', [0.10, 0.22, 0.46], 0.12], ['punainen', [0.66, 0.10, 0.09], 0.08],
    ['harmaa', [0.48, 0.5, 0.53], 0.08], ['tummanvihrea', [0.07, 0.24, 0.14], 0.06], ['puu', [0.56, 0.37, 0.19], 0.06]
  ];
  var SOUTUVARIT = [['valkoinen', [0.93, 0.93, 0.91], 0.45], ['vihrea', [0.10, 0.36, 0.2], 0.30], ['punainen', [0.68, 0.11, 0.09], 0.25]];
  var KANSIVARIT = [[0.78, 0.79, 0.8], [0.62, 0.45, 0.25]];       // vaalea harmaa tai teak
  var AKSENTTIVARIT = [[0.12, 0.2, 0.38], [0.15, 0.15, 0.17], [0.45, 0.1, 0.1], [0.1, 0.28, 0.2], [0.82, 0.82, 0.8]];
  function valitse(taulu, u) { var s = 0, i; for (i = 0; i < taulu.length; i++) s += taulu[i][2]; var x = u * s; for (i = 0; i < taulu.length; i++) { x -= taulu[i][2]; if (x <= 0) return taulu[i]; } return taulu[taulu.length - 1]; }

  // ---------- rungon poikkileikkaukset ----------
  // Aseman taulukko: s (0 perä ... 1 keula), hb (puolileveys suhteessa B/2), hs (kaarenkorkeus vesilinjasta)
  function asema(spec, i) { var st = spec.st[i], x = (st.s - 0.5) * spec.L, hz = st.hb * spec.B / 2; return { x: x, hz: hz, hs: st.hs }; }
  function hbAt(spec, x) {
    var s = clamp(x / spec.L + 0.5, 0, 1), st = spec.st, i = 0;
    while (i + 2 < st.length && st[i + 1].s < s) i++;
    var t = clamp((s - st[i].s) / (st[i + 1].s - st[i].s), 0, 1);
    return { hz: lerp(st[i].hb, st[i + 1].hb, t) * spec.B / 2, hs: lerp(st[i].hs, st[i + 1].hs, t) };
  }
  // Ulkokuoren rengas asemalle i: paapuurin laita, paapuurin kulma, köli, styyrpuurin kulma, styyrpuurin laita
  function ulkoRengas(spec, i) {
    var a = asema(spec, i);
    return [[a.x, a.hs, -a.hz], [a.x, spec.yc, -a.hz * spec.cf], [a.x, spec.yk, 0], [a.x, spec.yc, a.hz * spec.cf], [a.x, a.hs, a.hz]];
  }
  function RS(spec, i0, i1) { var r = []; for (var i = i0; i <= i1; i++) r.push(ulkoRengas(spec, i)); return r; }
  // Ulkokuori ja peilipoikkileikkaus (perälevy)
  function ulkokuori(rak, spec, i0, i1) {
    var colFn = function (i, j) { return (j === 1 || j === 2) ? T(0.6) : T(1); };   // vesirajan alapuoli rungon väriä tummempana, jos vesitaso ei sitä peitä
    rak.loft(RS(spec, i0, i1), { col: colFn, smooth: true, dir: [0, 0, -1] });
    if (i0 === 0) rak.fan(ulkoRengas(spec, 0), [-1, 0, 0], T(0.95));
    if (spec.juova) {   // kylkijuova aksenttivärillä: kaksi pistettä kummallakin laidalla, hieman rungon pinnan ulkopuolella
      [-1, 1].forEach(function (sd) {
        var rings = [];
        for (var i = i0; i <= i1; i++) {
          var a = asema(spec, i), pl = a.hs - spec.yc, t1 = spec.juova[0] / pl, t2 = spec.juova[1] / pl;
          var P = function (t) { return [a.x, a.hs + (spec.yc - a.hs) * t, sd * (a.hz + (a.hz * spec.cf - a.hz) * t + 0.03)]; };
          rings.push([P(t1), P(t2)]);
        }
        rak.loft(rings, { col: K(1), dir: [0, 0, sd] });
      });
    }
  }
  // Sisäkuori: laita sisäpuolelta, lattia. lattia: korkeus vesilinjasta, lf: lattiareunan osuus puolileveydestä
  function sisakuori(rak, spec, i0, i1, lattia, lf, laitaPaksuus, lattiaVari) {
    var rings = [];
    for (var i = i0; i <= i1; i++) {
      var a = asema(spec, i), hz = Math.max(0.01, a.hz - laitaPaksuus), fl = Math.min(lattia, a.hs - 0.05);
      rings.push([[a.x, a.hs, -hz], [a.x, fl, -hz * lf], [a.x, fl, hz * lf], [a.x, a.hs, hz]]);
    }
    rak.loft(rings, { col: function (i, j) { return j === 1 ? lattiaVari : T(0.9); }, smooth: false, dir: [0, 0, 1] });
  }
  // Laitalista (kaiteen yläpinta): ulko- ja sisälaidan väli
  function laitalista(rak, spec, i0, i1, paksuus, vari) {
    for (var side = -1; side <= 1; side += 2) {
      var rings = [];
      for (var i = i0; i <= i1; i++) { var a = asema(spec, i); rings.push([[a.x, a.hs, side * a.hz], [a.x, a.hs, side * Math.max(0.005, a.hz - paksuus)]]); }
      rak.loft(rings, { col: vari, dir: [0, 1, 0] });
    }
  }
  // Kansi: rinki paapuuri - keskilinja (kamara) - styyrpuuri
  function kansi(rak, spec, i0, i1, kamara, vari) {
    var rings = [];
    for (var i = i0; i <= i1; i++) { var a = asema(spec, i); rings.push([[a.x, a.hs, -a.hz], [a.x, a.hs + kamara, 0], [a.x, a.hs, a.hz]]); }
    rak.loft(rings, { col: vari, dir: [0, 1, 0] });
  }
  // Perämoottori: suojus, jalka. x = peilin sijainti (negatiivinen)
  function ulkoperaMoottori(rak, x, y0, koko, z) {
    z = z || 0; var k = koko;
    rak.box(x - 0.30 * k, x - 0.04, y0 + 0.02, y0 + 0.48 * k, z - 0.17 * k, z + 0.17 * k, F.kuori, ['y-']);          // suojus
    rak.box(x - 0.28 * k, x - 0.1, y0 - 0.5, y0 + 0.02, z - 0.07 * k, z + 0.07 * k, F.moottori, ['y-']);          // jalka
    rak.box(x - 0.06, x - 0.02, y0 + 0.0, y0 + 0.22 * k, z - 0.11 * k, z + 0.11 * k, F.tummaMetalli, ['y-', 'x+']);   // kiinnike
  }

  // ---------- venemallit (lähimallit) ----------
  var MALLIT = {};

  // Soutuvene
  MALLIT.soutu = function (rak) {
    var spec = {
      L: 4.5, B: 1.5, yk: -0.14, yc: -0.0, cf: 0.86, pohjaVari: [0.25, 0.2, 0.18],
      st: [{ s: 0, hb: 0.46, hs: 0.42 }, { s: 0.16, hb: 0.80, hs: 0.39 }, { s: 0.34, hb: 0.97, hs: 0.37 }, { s: 0.52, hb: 1.0, hs: 0.37 }, { s: 0.70, hb: 0.90, hs: 0.41 }, { s: 0.85, hb: 0.60, hs: 0.52 }, { s: 1.0, hb: 0.04, hs: 0.72 }]
    };
    var n = spec.st.length - 1;
    ulkokuori(rak, spec, 0, n);
    sisakuori(rak, spec, 0, n, 0.0, 0.6, 0.035, D(0.82));
    laitalista(rak, spec, 0, n, 0.04, D(0.9));
    // istuimet (kaksi permantoa)
    [-0.55, 0.45].forEach(function (x) {
      var h = hbAt(spec, x), hz = h.hz - 0.05;
      rak.box(x - 0.13, x + 0.13, 0.14, 0.17, -hz, hz, D(1.0), ['y-', 'z-', 'z+']);
    });
    // airot sisällä: varret ja lapat
    [[-1, -1], [1, 1]].forEach(function (p) {
      var z0 = p[0] * 0.22, z1 = p[1] * 0.1, a = [-1.15, 0.2, z0], b = [0.95, 0.2, z1];
      rak.tube(a, b, 0.024, 0.02, 4, F.airo, false, PI / 4);
      rak.box(0.88, 1.38, 0.19, 0.205, z1 - 0.055, z1 + 0.055, F.airo, ['y-']);
    });
  };

  // Pieni moottorivene (avovene, perämoottori, konsoli ja tuulilasi)
  MALLIT.pieni = function (rak) {
    var spec = {
      L: 5.0, B: 1.95, yk: -0.2, yc: -0.02, cf: 0.78, pohjaVari: [0.2, 0.17, 0.2], juova: [0.12, 0.2],
      st: [{ s: 0, hb: 0.88, hs: 0.70 }, { s: 0.15, hb: 0.96, hs: 0.67 }, { s: 0.32, hb: 1.0, hs: 0.65 }, { s: 0.50, hb: 1.0, hs: 0.66 }, { s: 0.68, hb: 0.92, hs: 0.74 }, { s: 0.84, hb: 0.62, hs: 0.88 }, { s: 1.0, hb: 0.04, hs: 1.08 }]
    };
    var n = spec.st.length - 1, iDeck = 4;
    ulkokuori(rak, spec, 0, n);
    sisakuori(rak, spec, 0, iDeck, 0.14, 0.7, 0.04, D(0.78));
    laitalista(rak, spec, 0, iDeck, 0.04, T(0.88));
    kansi(rak, spec, iDeck, n, 0.07, T(1.0));
    // konsoli ja tuulilasi
    rak.box(0.15, 0.75, 0.14, 0.98, -0.33, 0.33, T(0.96), ['y-', 'x-']);
    rak.box(0.1, 0.15, 0.2, 0.9, -0.28, 0.28, T(0.7), ['y-', 'y+', 'x+', 'z-', 'z+']);
    var a = [0.78, 0.98, -0.45], b = [0.78, 0.98, 0.45], c = [0.55, 1.42, 0.45], d = [0.55, 1.42, -0.45];
    rak.quadN(a, b, c, d, unit([-0.42, 0.23, 0]), F.lasi);
    rak.nauha([0.78, 0.98, -0.45], [0.55, 1.42, -0.45], 0.05, [0, 0, 1], F.tummaMetalli);
    rak.nauha([0.78, 0.98, 0.45], [0.55, 1.42, 0.45], 0.05, [0, 0, 1], F.tummaMetalli);
    rak.nauha([0.55, 1.42, -0.45], [0.55, 1.42, 0.45], 0.05, [1, 0, 0], F.tummaMetalli);
    // istuimet
    rak.box(-0.45, -0.1, 0.14, 0.52, -0.3, 0.3, F.pehmuste, ['y-']);
    rak.box(-1.65, -1.2, 0.14, 0.46, -0.8, 0.8, F.pehmuste, ['y-']);
    ulkoperaMoottori(rak, -2.5, 0.6, 1.0, 0);
  };

  // Keskikokoinen moottorivene. variantti 0 = daycruiser (tuulilasi, kaari, perämoottori), 1 = hyttivene (hytti, sisäperä)
  function keskiSpec() {
    return {
      L: 7.0, B: 2.5, yk: -0.3, yc: -0.04, cf: 0.74, pohjaVari: [0.2, 0.17, 0.2], juova: [0.16, 0.26],
      st: [{ s: 0, hb: 0.88, hs: 0.84 }, { s: 0.14, hb: 0.96, hs: 0.82 }, { s: 0.29, hb: 1.0, hs: 0.80 }, { s: 0.44, hb: 1.0, hs: 0.80 }, { s: 0.60, hb: 0.97, hs: 0.86 }, { s: 0.74, hb: 0.84, hs: 0.98 }, { s: 0.88, hb: 0.52, hs: 1.18 }, { s: 1.0, hb: 0.04, hs: 1.38 }]
    };
  }
  MALLIT.keski = function (rak, variantti) {
    var spec = keskiSpec(), n = spec.st.length - 1;
    ulkokuori(rak, spec, 0, n);
    if (variantti === 1) {
      // hyttivene: hytti keulaan päin, ohjaamo hytissä, peräkansi lyhyt
      var iK = 3;
      sisakuori(rak, spec, 0, iK, 0.18, 0.72, 0.045, D(0.8));
      laitalista(rak, spec, 0, iK, 0.045, T(0.88));
      kansi(rak, spec, iK, n, 0.08, T(1.0));
      var yd = 0.88 + 0.06, y1 = yd + 0.72;
      rak.kartio([[-0.45, yd, -0.9], [2.0, yd, -0.9], [2.0, yd, 0.9], [-0.45, yd, 0.9]], [[-0.45, y1, -0.84], [1.25, y1, -0.84], [1.25, y1, 0.84], [-0.45, y1, 0.84]], T(0.96), T(1.0));
      // ikkunat: sivuilla ja edessä
      [-1, 1].forEach(function (sd) {
        var zz = sd * 0.905, y0 = yd + 0.28, yy = yd + 0.58;
        rak.quadN([-0.2, y0, zz], [0.5, y0, zz], [0.5, yy, zz * 0.97], [-0.2, yy, zz * 0.97], [0, 0, sd], F.lasi);
        rak.quadN([0.62, y0, zz], [1.15, y0, zz], [1.1, yy, zz * 0.95], [0.62, yy, zz * 0.97], [0, 0, sd], F.lasi);
      });
      rak.quadN([1.43, yd + 0.3, -0.7], [1.43, yd + 0.3, 0.7], [1.2, y1 - 0.06, 0.7], [1.2, y1 - 0.06, -0.7], unit([0.6, 0.35, 0]), F.lasi);
      // kattoreunus
      rak.box(-0.5, 1.3, y1, y1 + 0.04, -0.9, 0.9, T(0.88), ['y-']);
      rak.box(-1.75, -1.0, 0.18, 0.5, -1.0, 1.0, F.pehmuste, ['y-']);
      // sisäperä: kylpytaso ja sivuvetolaite
      rak.box(-4.0, -3.5, 0.0, 0.2, -0.9, 0.9, D(0.95), ['y-']);
      rak.box(-3.55, -3.35, -0.2, 0.3, -0.18, 0.18, F.moottori, ['y-']);
      rak.nauha([-0.55, 1.2, -0.88], [-0.55, y1, -0.84], 0.04, [1, 0, 0], F.tangot);
    } else {
      // daycruiser: avoin ohjaamo, matala keulahytti, tuulilasi ja kaari
      var iD = 4;
      sisakuori(rak, spec, 0, iD, 0.18, 0.74, 0.045, D(0.8));
      laitalista(rak, spec, 0, iD, 0.045, T(0.88));
      kansi(rak, spec, iD, n, 0.08, T(1.0));
      rak.kartio([[1.3, 1.0, -0.62], [2.5, 1.0, -0.5], [2.5, 1.0, 0.5], [1.3, 1.0, 0.62]], [[1.4, 1.22, -0.5], [2.35, 1.22, -0.4], [2.35, 1.22, 0.4], [1.4, 1.22, 0.5]], T(0.97), T(1.0));
      var g0 = [0.92, 0.9, -1.0], g1 = [0.92, 0.9, 1.0], g2 = [0.6, 1.62, 0.95], g3 = [0.6, 1.62, -0.95];
      rak.quadN(g0, g1, g2, g3, unit([-0.72, 0.32, 0]), F.lasi);
      rak.nauha(g0, g3, 0.05, [0, 0, 1], F.tummaMetalli); rak.nauha(g1, g2, 0.05, [0, 0, 1], F.tummaMetalli);
      rak.nauha(g3, g2, 0.05, [1, 0, 0], F.tummaMetalli);
      // kuljettajan konsoli ja istuimet
      rak.box(0.1, 0.78, 0.18, 1.05, 0.12, 0.95, T(0.96), ['y-', 'x-']);
      rak.box(-0.5, -0.1, 0.18, 0.62, 0.25, 0.9, F.pehmuste, ['y-']);
      rak.box(-2.7, -1.95, 0.18, 0.55, -0.95, 0.95, F.pehmuste, ['y-']);
      // kaari ("arch") ohjaamon yllä
      var ka = [-1.15, 0.86, -1.0], kb = [-1.15, 0.86, 1.0], ka2 = [-1.0, 2.35, -0.9], kb2 = [-1.0, 2.35, 0.9];
      rak.nauha(ka, ka2, 0.06, [1, 0, 0], F.tangot); rak.nauha(kb, kb2, 0.06, [1, 0, 0], F.tangot); rak.nauha(ka2, kb2, 0.06, [1, 0, 0], F.tangot);
      ulkoperaMoottori(rak, -3.5, 0.66, 1.35, 0);
      rak.nauha([2.7, 1.28, -0.35], [3.2, 1.36, 0], 0.04, [0, 0, 1], F.tangot);
      rak.nauha([3.2, 1.36, 0], [2.7, 1.28, 0.35], 0.04, [0, 0, 1], F.tangot);
    }
  };

  // Purjevene: köli ei näy, masto 12,0 m vesilinjasta nimellispituudella, rullattu genoa, puomi ja pysyvä takila
  MALLIT.purje = function (rak) {
    var spec = {
      L: 8.5, B: 2.85, yk: -0.1, yc: -0.04, cf: 0.7, pohjaVari: [0.2, 0.17, 0.2], juova: [0.14, 0.22],
      st: [{ s: 0, hb: 0.64, hs: 0.86 }, { s: 0.12, hb: 0.84, hs: 0.83 }, { s: 0.30, hb: 0.97, hs: 0.8 }, { s: 0.44, hb: 1.0, hs: 0.78 }, { s: 0.58, hb: 0.98, hs: 0.8 }, { s: 0.74, hb: 0.82, hs: 0.88 }, { s: 0.88, hb: 0.46, hs: 1.0 }, { s: 1.0, hb: 0.03, hs: 1.14 }]
    };
    var n = spec.st.length - 1, iC = 2, L = spec.L;
    ulkokuori(rak, spec, 0, n);
    sisakuori(rak, spec, 0, iC, 0.35, 0.66, 0.05, D(0.9));
    kansi(rak, spec, iC, n, 0.07, T(1.0));
    // ohjaamon laidat (cockpit coamings) ja perän kaide
    [-1, 1].forEach(function (sd) {
      var a1 = asema(spec, 0), a2 = asema(spec, 1), a3 = asema(spec, 2);
      rak.box(a1.x + 0.1, a3.x, a1.hs, a1.hs + 0.22, sd * (a2.hz - 0.2) - 0.07, sd * (a2.hz - 0.2) + 0.07, T(0.92), ['y-']);
    });
    rak.box(-2.0, -1.75, 0.35, a2h(spec, -1.9) + 0.35, -0.9, 0.9, T(0.85), ['y-', 'x+']);        // ohjaamon etuseinä (hytin takaosa)
    // hytti
    var yd = 0.9, y1 = yd + 0.62;
    rak.kartio([[-1.75, yd, -0.98], [1.75, yd, -0.82], [1.75, yd, 0.82], [-1.75, yd, 0.98]], [[-1.6, y1, -0.84], [1.0, y1, -0.64], [1.0, y1, 0.64], [-1.6, y1, 0.84]], T(0.97), T(1.0));
    [-1, 1].forEach(function (sd) {
      rak.quadN([-1.1, yd + 0.24, sd * 0.945], [0.2, yd + 0.24, sd * 0.89], [0.2, yd + 0.5, sd * 0.78], [-1.1, yd + 0.5, sd * 0.82], [0, 0.1, sd], F.lasi);
      rak.quadN([0.45, yd + 0.24, sd * 0.87], [1.4, yd + 0.22, sd * 0.8], [1.0, yd + 0.5, sd * 0.66], [0.45, yd + 0.5, sd * 0.74], [0, 0.1, sd], F.lasi);
    });
    rak.quadN([-1.74, yd + 0.1, -0.5], [-1.74, yd + 0.1, 0.5], [-1.74, yd + 0.5, 0.45], [-1.74, yd + 0.5, -0.45], [-1, 0, 0], F.lasi);   // ohjaamoon avautuva kulkuaukko
    // masto, puomi ja takila
    var mx = 0.85, base = y1 - 0.02, H = 12.0, cz = 0.0;
    rak.tube([mx, base, 0], [mx, H, 0], 0.075, 0.045, 4, F.mastoAlu, true, PI / 4);
    var by = 2.25;
    rak.tube([mx - 0.12, by, 0], [-3.05, by + 0.08, 0], 0.045, 0.04, 4, F.mastoAlu, true, PI / 4);              // puomi
    rak.tube([mx - 0.2, by + 0.14, 0], [-2.9, by + 0.2, 0], 0.115, 0.11, 6, K(1.0), true);                       // rullattu isopurje (kansi)
    var bow = [4.0, 1.1, 0], head = [mx, H, 0];
    var gb = lerp3(bow, head, 0.04), gt = lerp3(bow, head, 0.76);
    rak.tube(gb, gt, 0.085, 0.045, 6, F.purje, true);                                                                // rullattu genoa
    rak.nauha(bow, head, 0.035, [0, 0, 1], F.tangot);                                                              // vaijeri (forestay)
    rak.nauha(head, [-4.15, 1.2, 0], 0.035, [0, 0, 1], F.tangot);                                                  // peräharus (backstay)
    var sp = 6.6;
    [-1, 1].forEach(function (sd) {
      rak.nauha([mx, sp, 0], [mx, sp, sd * 0.55], 0.03, [1, 0, 0], F.tangot);                                      // saalinki
      rak.nauha(head, [mx, sp, sd * 0.55], 0.03, [1, 0, 0], F.tangot);                                             // yläva
      rak.nauha([mx, sp, sd * 0.55], [mx + 0.05, yd - 0.05, sd * 1.32], 0.03, [1, 0, 0], F.tangot);
      rak.nauha([mx, sp - 0.4, 0], [mx + 0.55, yd - 0.05, sd * 1.3], 0.03, [1, 0, 0], F.tangot);                   // alava
    });
    // pieni perämoottori peilissä ja keulakaide
    ulkoperaMoottori(rak, -4.25, 0.5, 0.7, 0.35);
    rak.nauha([3.75, 1.3, -0.3], [4.1, 1.38, 0], 0.035, [0, 0, 1], F.tangot);
    rak.nauha([4.1, 1.38, 0], [3.75, 1.3, 0.3], 0.035, [0, 0, 1], F.tangot);
  };
  function a2h(spec, x) { return hbAt(spec, x).hs; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // ---------- kaukomallit (enintään 60 kolmiota) ----------
  // Yksinkertaistettu runko: viisi asemaa, laidat ja kansi (suljettu)
  function kaukoRunko(rak, spec, avoin) {
    var sts = spec.kst, rings = [], top = [], i;
    for (i = 0; i < sts.length; i++) {
      var x = (sts[i].s - 0.5) * spec.L, hz = sts[i].hb * spec.B / 2, hs = sts[i].hs;
      rings.push([[x, hs, -hz], [x, spec.yk, 0], [x, hs, hz]]); top.push([[x, hs, -hz], [x, hs, hz]]);
    }
    rak.loft(rings, { col: T(1), dir: [0, 0, -1] });
    rak.loft(top, { col: avoin ? D(0.8) : T(1), dir: [0, 1, 0] });
    rak.fan(rings[0], [-1, 0, 0], T(0.95));
  }
  function kaukoMallit() {
    var M2 = {};
    M2.soutu = function (rak) { kaukoRunko(rak, { L: 4.5, B: 1.5, yk: -0.14, kst: [{ s: 0, hb: 0.46, hs: 0.42 }, { s: 0.25, hb: 0.9, hs: 0.38 }, { s: 0.5, hb: 1.0, hs: 0.37 }, { s: 0.78, hb: 0.72, hs: 0.47 }, { s: 1.0, hb: 0.04, hs: 0.72 }] }, true); };
    M2.pieni = function (rak) {
      kaukoRunko(rak, { L: 5.0, B: 1.95, yk: -0.2, kst: [{ s: 0, hb: 0.88, hs: 0.7 }, { s: 0.25, hb: 0.98, hs: 0.66 }, { s: 0.5, hb: 1.0, hs: 0.66 }, { s: 0.78, hb: 0.8, hs: 0.8 }, { s: 1.0, hb: 0.04, hs: 1.08 }] }, true);
      rak.box(0.1, 0.75, 0.66, 1.0, -0.33, 0.33, T(0.96), ['y-']);
      rak.quadN([0.78, 1.0, -0.45], [0.78, 1.0, 0.45], [0.55, 1.42, 0.45], [0.55, 1.42, -0.45], unit([-0.42, 0.23, 0]), F.lasi);
      rak.box(-2.75, -2.5, 0.5, 1.0, -0.2, 0.2, F.moottori, ['y-']);
    };
    M2.keski = function (rak) {
      kaukoRunko(rak, { L: 7.0, B: 2.5, yk: -0.3, kst: [{ s: 0, hb: 0.88, hs: 0.84 }, { s: 0.25, hb: 0.99, hs: 0.8 }, { s: 0.5, hb: 1.0, hs: 0.82 }, { s: 0.78, hb: 0.76, hs: 1.04 }, { s: 1.0, hb: 0.04, hs: 1.38 }] }, false);
      rak.kartio([[-0.45, 0.9, -0.9], [2.0, 1.0, -0.8], [2.0, 1.0, 0.8], [-0.45, 0.9, 0.9]], [[-0.4, 1.6, -0.85], [1.2, 1.6, -0.8], [1.2, 1.6, 0.8], [-0.4, 1.6, 0.85]], T(0.97), T(1.0));
      rak.box(-3.6, -3.35, 0.5, 1.0, -0.25, 0.25, F.moottori, ['y-']);
      rak.quadN([1.45, 1.2, -0.7], [1.45, 1.2, 0.7], [1.2, 1.55, 0.7], [1.2, 1.55, -0.7], unit([0.6, 0.35, 0]), F.lasi);
    };
    M2.purje = function (rak) {
      kaukoRunko(rak, { L: 8.5, B: 2.85, yk: -0.1, kst: [{ s: 0, hb: 0.64, hs: 0.86 }, { s: 0.25, hb: 0.95, hs: 0.8 }, { s: 0.5, hb: 1.0, hs: 0.78 }, { s: 0.78, hb: 0.76, hs: 0.9 }, { s: 1.0, hb: 0.03, hs: 1.14 }] }, false);
      rak.kartio([[-1.75, 0.9, -0.95], [1.75, 0.9, -0.8], [1.75, 0.9, 0.8], [-1.75, 0.9, 0.95]], [[-1.6, 1.52, -0.84], [1.0, 1.52, -0.64], [1.0, 1.52, 0.64], [-1.6, 1.52, 0.84]], T(0.97), T(1.0));
      // masto ja puomi leveinä nauhoina, jotta ne näkyvät kaukaa (kaksi ristikkäistä nauhaa)
      var mx = 0.85, H = 12.0;
      rak.nauha([mx, 1.5, 0], [mx, H, 0], 0.16, [0, 0, 1], F.mastoAlu); rak.nauha([mx, 1.5, 0], [mx, H, 0], 0.16, [1, 0, 0], F.mastoAlu);
      rak.nauha([mx - 0.1, 2.3, 0], [-3.05, 2.38, 0], 0.16, [0, 1, 0], K(1.0));
      rak.nauha([4.0, 1.1, 0], [mx, H, 0], 0.14, [0, 0, 1], F.purje);
      rak.nauha([mx, H, 0], [-4.15, 1.2, 0], 0.1, [0, 0, 1], F.tangot);
    };
    return M2;
  }

  // Poiju: puolipallo vesirajan yläpuolella (6 sivua, 18 kolmiota)
  function poijuGeometria() {
    var rak = new Rak(), r = 0.5, rings = [], k, i;
    var kor = [0.0, 0.62, 1.0], rr = [1.0, 0.82, 0.0];
    for (i = 0; i < 3; i++) { var ring = []; for (k = 0; k < 6; k++) { var a = k / 6 * 2 * PI; ring.push([Math.cos(a) * r * rr[i], r * (kor[i]) * 0.9 - 0.1, Math.sin(a) * r * rr[i]]); } rings.push(ring); }
    rak.loft(rings, { closed: true, col: F.poiju, ref: [0, 0, 0], smooth: true });
    var g = rak.geometria();
    return g;
  }
  // Köysi (yksikköpituus x-suuntaan, leveys 1): skaalataan instanssimatriisilla
  function koysiGeometria() {
    var rak = new Rak();
    rak.quadN([0, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [0, 0, 0.5], [0, 1, 0], F.koysi);
    return rak.geometria();
  }

  var mallitCache = {};
  function mallinGeometria(id, taso) {
    var key = id + '/' + taso;
    if (mallitCache[key]) return mallitCache[key];
    var rak = new Rak();
    if (taso === 'lahi') {
      if (id === 'keski_a') MALLIT.keski(rak, 0); else if (id === 'keski_b') MALLIT.keski(rak, 1); else MALLIT[id](rak);
    } else {
      var kk = kaukoMallit(), luokka = id.replace(/_[ab]$/, '');
      kk[luokka](rak);
    }
    var g = rak.geometria();
    mallitCache[key] = g;
    return g;
  }
  // Malli-id:t: soutu, pieni, keski_a, keski_b, purje
  var MALLI_IDT = ['soutu', 'pieni', 'keski_a', 'keski_b', 'purje'];
  function kolmiotaulukko() {
    return MALLI_IDT.map(function (id) { return { malli: id, luokka: id.replace(/_[ab]$/, ''), lahi: mallinGeometria(id, 'lahi').userData.kolmiot, kauko: mallinGeometria(id, 'kauko').userData.kolmiot }; });
  }

  // ---------- jaettu materiaali ----------
  var materiaali = null;
  function annaMateriaali() {
    if (materiaali) return materiaali;
    var m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute float osa;\nattribute vec3 iHull;\nattribute vec3 iDeck;\nattribute vec3 iAks;\nvoid main() {')
        .replace('#include <color_vertex>', '#include <color_vertex>\n vColor = osa < 0.5 ? color : (osa < 1.5 ? color * iHull : (osa < 2.5 ? color * iDeck : color * iAks));');
      // pieni hajavalo, jotta valkoiset rungot eivät muutu harmaiksi varjopuolella (kuten Merimerkit3D)
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.16;');
    };
    m.customProgramCacheKey = function () { return 'veneet3d-v1'; };
    m.name = 'veneet';
    materiaali = m; return m;
  }

  // ---------- veneen tiedot ----------
  function valittuVari(tunnus, luokka, tunnisteHash) {
    var r = rng(tunnisteHash ^ 0x5bd1e995);
    var rv = valitse(luokka === 'soutu' ? SOUTUVARIT : RUNKOVARIT, r());
    var kv = KANSIVARIT[r() < 0.5 ? 0 : 1], av = AKSENTTIVARIT[Math.floor(r() * AKSENTTIVARIT.length)];
    return { runkoNimi: rv[0], runko: rv[1], kansi: kv, aksentti: av };
  }
  // Täydentää venetietueen puuttuvat kentät deterministisesti tunnisteesta
  function tayta(v, a) {
    var h = hashStr(v.id), r = rng(h), lk = LUOKAT[v.luokka];
    if (!lk) throw new Error('Tuntematon venekuokka: ' + v.luokka);
    if (v.pituus === undefined) v.pituus = a.kokoVaihtelu ? lerp(lk.pituus[0], lk.pituus[1], r()) : lk.nom; else r();
    var k = v.pituus / lk.nom;
    if (v.leveys === undefined) v.leveys = lk.leveys * k * (a.kokoVaihtelu ? 0.95 + 0.1 * r() : 1); else r();
    v.kerroin = k;
    if (v.variantti === undefined) v.variantti = r() < 0.5 ? 0 : 1; else r();
    if (!v.vari) v.vari = valittuVari(v.id, v.luokka, h);
    var kei = a.keinunta;
    v.amp = lerp(kei.amplitudi[0], kei.amplitudi[1], r()); v.jakso = lerp(kei.jakso[0], kei.jakso[1], r()); v.vaihe = r() * 2 * PI;
    v.nyokAmp = v.amp * kei.nyokkays * (0.7 + 0.6 * r()); v.nyokJakso = v.jakso * (0.8 + 0.4 * r()); v.nyokVaihe = r() * 2 * PI;
    v.malli = v.luokka === 'keski' ? (v.variantti ? 'keski_b' : 'keski_a') : v.luokka;
    v.avainLahi = v.malli + '/lahi'; v.avainKauko = v.malli + '/kauko';
    v.masto = v.luokka === 'purje' ? LUOKAT.purje.masto * k : 0;
    v.kaiku = lk.kaiku * k * k;
    return v;
  }

  // ---------- laitureiden käsittely: segmentit, ketjut, paikat ----------
  // Syötteen hyväksyntä: [{ segs, polys, ... }] (Laiturit3D.tileItems) tai [{ z, x, y, layer }] (Aineisto.layers-kerros vesieste)
  function clipSeg(x0, y0, x1, y1, ext) {
    var t0 = 0, t1 = 1, dx = x1 - x0, dy = y1 - y0, p = [-dx, dx, -dy, dy], q = [x0, ext - x0, y0, ext - y0];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  function kindOf(laji) { laji = String(laji || ''); if (laji === 'laituri_kapea') return 'narrow'; if (/^laituri/.test(laji)) return 'wide'; return null; }
  function ruudunSegmentit(z, tx, ty, layer) {
    var out = [];
    if (!layer || !layer.features || !Paikka) return out;
    var ext = layer.extent || 4096;
    function en(u, v) { var ll = Paikka.tileLonLat(z, tx, ty, u / ext, v / ext), e = Paikka.lonlatToEN(ll.lon, ll.lat); return [e.e, e.n]; }
    layer.features.forEach(function (f) {
      var kind = kindOf(f.props && f.props.laji); if (!kind || f.type !== 2) return;
      f.parts.forEach(function (a) {
        var np = a.length / 2;
        for (var s = 0; s + 1 < np; s++) {
          var c = clipSeg(a[2 * s], a[2 * s + 1], a[2 * s + 2], a[2 * s + 3], ext); if (!c) continue;
          var ux = a[2 * s + 2] - a[2 * s], uy = a[2 * s + 3] - a[2 * s + 1];
          var p0 = en(a[2 * s] + ux * c[0], a[2 * s + 1] + uy * c[0]), p1 = en(a[2 * s] + ux * c[1], a[2 * s + 1] + uy * c[1]);
          out.push({ k: kind, e0: p0[0], n0: p0[1], e1: p1[0], n1: p1[1], cutA: c[0] > 0, cutB: c[1] < 1 });
        }
      });
    });
    return out;
  }
  function kokoaSegmentit(syote) {
    var segs = [];
    (Array.isArray(syote) ? syote : [syote]).forEach(function (it) {
      if (!it) return;
      var lista = it.segs;
      if (!lista && it.layer) lista = ruudunSegmentit(it.z, it.x, it.y, it.layer);
      (lista || []).forEach(function (s) { if (s.k === 'narrow' || s.k === 'wide') segs.push(s); });
    });
    return segs;
  }

  // Solmujen yhdistäminen 0,2 m:n toleranssilla, ketjutus
  function ketjut(segs, tol) {
    tol = tol || 0.2;
    // kanoninen järjestys: tulos ei saa riippua siitä, missä järjestyksessä ruudut on ladattu
    function avain(s) { var sw = s.e0 > s.e1 || (s.e0 === s.e1 && s.n0 > s.n1); return sw ? [s.e1, s.n1, s.e0, s.n0] : [s.e0, s.n0, s.e1, s.n1]; }
    segs = segs.map(function (s) { return { s: s, k: avain(s) }; }).sort(function (x, y) { return x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2] || x.k[3] - y.k[3]; }).map(function (x) { return x.s; });
    var solmut = [], ruudukko = new Map();
    function solmu(e, n) {
      var cx = Math.floor(e / tol), cy = Math.floor(n / tol), best = null, bd = tol;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var lst = ruudukko.get((cx + dx) + '/' + (cy + dy)); if (!lst) continue;
        for (var i = 0; i < lst.length; i++) { var s = solmut[lst[i]], d = Math.hypot(s.e - e, s.n - n); if (d < bd) { bd = d; best = s; } }
      }
      if (best) return best;
      best = { id: solmut.length, e: e, n: n, reunat: [], kesken: false };
      solmut.push(best);
      var key = cx + '/' + cy; if (!ruudukko.has(key)) ruudukko.set(key, []); ruudukko.get(key).push(best.id);
      return best;
    }
    var reunat = [], nahty = new Set();
    segs.forEach(function (s) {
      var a = solmu(s.e0, s.n0), b = solmu(s.e1, s.n1);
      if (a === b) return;
      var k = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
      if (nahty.has(k)) return; nahty.add(k);
      var r = { a: a, b: b, k: s.k, kaytetty: false };
      a.reunat.push(r); b.reunat.push(r); reunat.push(r);
      if (s.cutA) a.kesken = true;
      if (s.cutB) b.kesken = true;
    });
    var tulos = [];
    function kulje(alku, r0) {
      var pts = [alku], kinds = [], viimeinen = alku, r = r0, kesk = alku.kesken && alku.reunat.length === 1;
      while (r) {
        r.kaytetty = true;
        var seur = r.a === viimeinen ? r.b : r.a;
        pts.push(seur); kinds.push(r.k); viimeinen = seur;
        if (seur.reunat.length !== 2) { if (seur.reunat.length === 1 && seur.kesken) kesk = true; break; }
        var uusi = seur.reunat[0] === r ? seur.reunat[1] : seur.reunat[0];
        if (uusi.kaytetty) break;
        r = uusi;
      }
      tulos.push({ pts: pts.map(function (s) { return [s.e, s.n]; }), kinds: kinds, kesken: kesk, suljettu: pts[0] === pts[pts.length - 1] });
    }
    solmut.forEach(function (s) { if (s.reunat.length !== 2) s.reunat.forEach(function (r) { if (!r.kaytetty) kulje(s, r); }); });
    reunat.forEach(function (r) { if (!r.kaytetty) kulje(r.a, r); });
    return tulos;
  }

  // Kokonaiset segmentit viiva-ketjuiksi, joissa on kaaren pituudet
  function valmisteleKetju(k) {
    var pts = k.pts, kinds = k.kinds, cum = [0], i;
    // kanoninen suunta: ketju alkaa leksikografisesti pienemmästä päätepisteestä (umpinaisella silmukalla pienimmästä pisteestä)
    function pienempi(p, q) { return p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]); }
    if (k.suljettu && pts.length > 3) {
      var mi = 0; for (i = 1; i < pts.length - 1; i++) if (pienempi(pts[i], pts[mi])) mi = i;
      pts = pts.slice(mi, pts.length - 1).concat(pts.slice(0, mi), [pts[mi]]); kinds = kinds.slice(mi).concat(kinds.slice(0, mi));
      if (pienempi(pts[pts.length - 2], pts[1])) { pts = pts.slice().reverse(); kinds = kinds.slice().reverse(); }
    } else if (pienempi(pts[pts.length - 1], pts[0])) { pts = pts.slice().reverse(); kinds = kinds.slice().reverse(); }
    k.pts = pts; k.kinds = kinds;
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    k.cum = cum; k.pituus = cum[cum.length - 1];
    // tunniste: molemmat päätepisteet leksikografisessa järjestyksessä (haarautuvat laiturit jakavat usein toisen päätepisteen)
    var a = pts[0], b = pts[pts.length - 1], aPieni = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])), c = aPieni ? a : b, d = aPieni ? b : a;
    k.tunnus = hash32(hash32(Math.round(c[0] * 10), Math.round(c[1] * 10)), hash32(Math.round(d[0] * 10), Math.round(d[1] * 10)));
    return k;
  }
  // Pistejoukon sijainti ja suunta kaaren pituudella s
  function ketjussa(k, s) {
    var cum = k.cum, pts = k.pts, i = 0;
    while (i + 2 < cum.length && cum[i + 1] < s) i++;
    var l = cum[i + 1] - cum[i] || 1, t = clamp((s - cum[i]) / l, 0, 1);
    var te = (pts[i + 1][0] - pts[i][0]) / l, tn = (pts[i + 1][1] - pts[i][1]) / l;
    return { e: lerp(pts[i][0], pts[i + 1][0], t), n: lerp(pts[i][1], pts[i + 1][1], t), te: te, tn: tn, seg: i };
  }
  // Jaa ketju kulmista osuuksiksi (kulmaRaja astetta)
  function jaaKulmista(k, kulmaRaja) {
    var pts = k.pts, aj = [0], i;
    for (i = 1; i + 1 < pts.length; i++) {
      var a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]), a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      var d = Math.abs(a2 - a1); if (d > PI) d = 2 * PI - d;
      if (d / RAD > kulmaRaja) aj.push(i);
    }
    aj.push(pts.length - 1);
    var osat = [];
    for (i = 0; i + 1 < aj.length; i++) osat.push({ s0: k.cum[aj[i]], s1: k.cum[aj[i + 1]], i0: aj[i], i1: aj[i + 1] });
    return osat;
  }

  // Suorakulmioiden (orientoitujen) päällekkäisyys, SAT. Suorakulmio: {e, n, ue, un (pitkittäisyksikkö), hl, hw}
  function suorakulmiotLeikkaavat(A, B) {
    var axes = [[A.ue, A.un], [-A.un, A.ue], [B.ue, B.un], [-B.un, B.ue]];
    for (var i = 0; i < 4; i++) {
      var ax = axes[i][0], ay = axes[i][1];
      var ra = A.hl * Math.abs(A.ue * ax + A.un * ay) + A.hw * Math.abs(-A.un * ax + A.ue * ay);
      var rb = B.hl * Math.abs(B.ue * ax + B.un * ay) + B.hw * Math.abs(-B.un * ax + B.ue * ay);
      if (Math.abs((B.e - A.e) * ax + (B.n - A.n) * ay) > ra + rb) return false;
    }
    return true;
  }
  function pisteJanalla(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  // Laitureiden käsittely venepaikoiksi ja veneiksi. vesi(e, n) on vesitesti (TM35FIN), jos puuttuu, kaikki on vettä.
  // Palauttaa { veneet, poijut, tilasto, ketjut }
  function kiinnitaVeneet(syote, a, vesi, rajaus) {
    var segs = kokoaSegmentit(syote);
    var tilasto = { laituriKohteita: 0, ketjuja: 0, keskenJaaneita: 0, osuuksia: 0, paikkoja: 0, tyhjia: 0, veneita: 0, luokittain: { soutu: 0, pieni: 0, keski: 0, purje: 0 }, hylatty: { maa: 0, matala: 0, tormays: 0 }, laiturit: { kapea: 0, leveä: 0 }, purjeKelpoisia: 0 };
    (Array.isArray(syote) ? syote : [syote]).forEach(function (it) { if (it && it.fl) tilasto.laituriKohteita += it.fl.filter(function (f) { return f.k === 'narrow' || f.k === 'wide'; }).length; });
    var kelvolliset = [];
    ketjut(segs).map(valmisteleKetju).forEach(function (k) {
      if (k.kesken) { tilasto.keskenJaaneita++; return; }
      if (k.pituus < 3) return;
      if (rajaus) {   // vain laiturit, joiden keskipiste on rajauksen sisällä
        var pm = ketjussa(k, k.pituus / 2);
        if (Math.hypot(pm.e - rajaus.e, pm.n - rajaus.n) > rajaus.sade) return;
      }
      kelvolliset.push(k);
    });
    kelvolliset.sort(function (x, y) { return x.tunnus - y.tunnus || x.pituus - y.pituus; });
    var kaytetyt = {};
    kelvolliset.forEach(function (k) { while (kaytetyt[k.tunnus]) k.tunnus = hash32(k.tunnus, 7); kaytetyt[k.tunnus] = true; });
    tilasto.ketjuja = kelvolliset.length;
    var w = a.laituriLeveys, vesiF = vesi || function () { return true; };
    var segLista = [];
    kelvolliset.forEach(function (k) {
      for (var i = 0; i + 1 < k.pts.length; i++) segLista.push({ e0: k.pts[i][0], n0: k.pts[i][1], e1: k.pts[i + 1][0], n1: k.pts[i + 1][1], w: k.kinds[i] === 'wide' ? w.wide : w.narrow });
    });
    function osuuLaituriin(e, n, r) {
      for (var i = 0; i < segLista.length; i++) { var s = segLista[i]; if (pisteJanalla(e, n, s.e0, s.n0, s.e1, s.n1) < r + s.w / 2) return true; }
      return false;
    }
    var veneet = [], poijut = [], ruutu = new Map(), RK = 10;
    function ruudutAlueelle(R, fn) {
      var ext = R.hl + R.hw + 0.5, c0 = Math.floor((R.e - ext) / RK), c1 = Math.floor((R.e + ext) / RK), r0 = Math.floor((R.n - ext) / RK), r1 = Math.floor((R.n + ext) / RK);
      for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) fn(cx + '/' + cy);
    }
    function osuuVeneisiin(R) {
      var osuu = false;
      ruudutAlueelle(R, function (key) { var lst = ruutu.get(key); if (!lst || osuu) return; for (var i = 0; i < lst.length; i++) if (suorakulmiotLeikkaavat(R, lst[i])) { osuu = true; return; } });
      return osuu;
    }
    var jakauma = a.luokkajakauma, KJ = LUOKKA_JARJESTYS;
    kelvolliset.forEach(function (k) {
      var osuudet = jaaKulmista(k, a.kulmaRaja), leveaMaara = 0;
      k.kinds.forEach(function (kk) { if (kk === 'wide') leveaMaara++; });
      var leveaLaituri = leveaMaara * 2 > k.kinds.length;
      if (leveaLaituri) tilasto.laiturit.leveä++; else tilasto.laiturit.kapea++;
      // 1. vaihe: laituriketjun kaikki kelvolliset venepaikat
      var paikat = [];
      osuudet.forEach(function (os, oi) {
        tilasto.osuuksia++;
        var pit = os.s1 - os.s0, m = a.paatyMarginaali;
        if (pit < 2 * m - 1e-6) return;
        var nPaikkaa = Math.floor((pit - 2 * m) / a.paikkavali + 1e-9) + 1, s0 = os.s0 + (pit - (nPaikkaa - 1) * a.paikkavali) / 2;
        for (var side = -1; side <= 1; side += 2) for (var q = 0; q < nPaikkaa; q++) {
          var pos = ketjussa(k, s0 + q * a.paikkavali);
          var ne = -pos.tn * side, nn = pos.te * side, half = (k.kinds[pos.seg] === 'wide' ? w.wide : w.narrow) / 2;
          var ee = pos.e + ne * half, en = pos.n + nn * half;
          if (!vesiF(ee + ne * 1.5, en + nn * 1.5) || !vesiF(ee + ne * 5, en + nn * 5)) { tilasto.hylatty.maa++; continue; }
          var r = rng(hash32(hash32(k.tunnus, oi * 4 + (side > 0 ? 1 : 2)), q + a.siemen * 977));
          var p = { ee: ee, en: en, ne: ne, nn: nn, id0: 'L' + k.tunnus.toString(36) + '.' + oi + (side > 0 ? 'v' : 'o') + '.' + q, side: side, uTaytto: r(), uLuokka: r(), purjeKelpaa: false };
          if (leveaLaituri || k.pituus >= a.purje.minLaiturinPituus) {
            p.purjeKelpaa = true;
            for (var dd = 0; dd < 12 && p.purjeKelpaa; dd++) {
              var an = dd / 12 * 2 * PI, R = a.purje.minEtaisyysRannasta;
              if (!vesiF(ee + ne * 4 + Math.cos(an) * R, en + nn * 4 + Math.sin(an) * R)) p.purjeKelpaa = false;
            }
          }
          paikat.push(p); tilasto.paikkoja++;
          if (p.purjeKelpaa) tilasto.purjeKelpoisia++;
        }
      });
      // 2. vaihe: purjeveneen osuus kelvollisissa paikoissa korotetaan niin, että koko laiturin jakauma vastaa asetusta
      var nKelp = 0; paikat.forEach(function (p) { if (p.purjeKelpaa) nKelp++; });
      var summaMuut = jakauma.soutu + jakauma.pieni + jakauma.keski, osuusPurje = jakauma.purje / (summaMuut + jakauma.purje);
      var pPurje = nKelp > 0 ? Math.min(0.6, osuusPurje * paikat.length / nKelp) : 0;
      paikat.forEach(function (p) {
        if (p.uTaytto >= a.taytto) { tilasto.tyhjia++; return; }
        var x = p.uLuokka, luokka = null, ci;
        if (p.purjeKelpaa && x < pPurje) luokka = 'purje';
        else {
          x = p.purjeKelpaa ? (x - pPurje) / (1 - pPurje) : x;
          x = x * summaMuut;
          for (ci = 0; ci < 3 && !luokka; ci++) { x -= jakauma[KJ[ci]]; if (x <= 0) luokka = KJ[ci]; }
          if (!luokka) luokka = 'keski';
        }
        var asetettu = false, ne = p.ne, nn = p.nn, ee = p.ee, en = p.en;
        for (var cj = KJ.indexOf(luokka); cj >= 0 && !asetettu; cj--) {
          var lk = KJ[cj], v = { id: p.id0, luokka: lk, lahde: 'laituri', kiinnitetty: true };
          tayta(v, a);
          var L = v.pituus, B = Math.min(v.leveys, a.paikkavali - 0.35); v.leveys = B;
          var bowE = ee + ne * a.keulaEtaisyys, bowN = en + nn * a.keulaEtaisyys;
          var cE = bowE + ne * L / 2, cN = bowN + nn * L / 2, sE = bowE + ne * L, sN = bowN + nn * L;
          var pE = ee + ne * (a.poijuKerroin * L), pN = en + nn * (a.poijuKerroin * L);
          var sivuE = -nn * (B / 2 + 0.1), sivuN = ne * (B / 2 + 0.1), ok = true, i;
          var vp = [[bowE, bowN], [cE, cN], [sE, sN], [pE, pN], [cE + sivuE, cN + sivuN], [cE - sivuE, cN - sivuN], [sE + sivuE, sN + sivuN], [sE - sivuE, sN - sivuN], [sE + ne * 1.5, sN + nn * 1.5]];
          for (i = 0; i < vp.length && ok; i++) if (!vesiF(vp[i][0], vp[i][1])) ok = false;
          if (!ok) { if (cj === 0) tilasto.hylatty.matala++; continue; }
          var Rk = { e: cE, n: cN, ue: -ne, un: -nn, hl: L / 2 + 0.15, hw: B / 2 + 0.1 }, tormaa = false;
          for (i = 0; i <= 4 && !tormaa; i++) {
            var tE = bowE + ne * L * i / 4, tN = bowN + nn * L * i / 4;
            if (osuuLaituriin(tE, tN, 0.05) || osuuLaituriin(tE + sivuE, tN + sivuN, 0.1) || osuuLaituriin(tE - sivuE, tN - sivuN, 0.1)) tormaa = true;
          }
          if (!tormaa && osuuVeneisiin(Rk)) tormaa = true;
          if (tormaa) { if (cj === 0) tilasto.hylatty.tormays++; continue; }
          v.e = cE; v.n = cN; v.suunta = ((Math.atan2(-ne, -nn) / RAD) + 360) % 360;
          v.kiinnitys = { laituri: k.tunnus, poiju: { e: pE, n: pN }, reuna: { e: ee, n: en }, puoli: p.side > 0 ? 'vasen' : 'oikea' };
          veneet.push(v); poijut.push({ id: v.id, e: pE, n: pN, pe: sE, pn: sN, ph: LUOKAT[lk].perakorkeus, L: L });
          tilasto.veneita++; tilasto.luokittain[lk]++;
          ruudutAlueelle(Rk, function (key) { var l = ruutu.get(key); if (!l) ruutu.set(key, l = []); l.push(Rk); });
          asetettu = true;
        }
        if (!asetettu) tilasto.tyhjia++;
      });
    });
    return { veneet: veneet, poijut: poijut, tilasto: tilasto, ketjut: kelvolliset };
  }

  // ---------- vesitesti maastokuvio-kerroksesta ----------
  // tiilet: [{ z, x, y, layer }] Aineisto.layers-tuloksen maastokuvio-kerroksista. Palauttaa onVesi(e, n) -funktion, joka antaa
  // true vedelle, false maalle ja tuntemattomalle alueelle (ruutua ei ole ladattu).
  function luoVesiTesti(tiilet, vesiLuokat) {
    var luokat = vesiLuokat || { jarvi: 1, virtavesi: 1 }, map = new Map(), Z = 16, kutsut = { tuntematon: 0 };
    function area(a) { var s = 0, n = a.length; for (var i = 0; i < n; i += 2) { var j = (i + 2) % n; s += a[i] * a[j + 1] - a[j] * a[i + 1]; } return s / 2; }
    function inRing(x, y, a) {
      var inside = false, n = a.length;
      for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
        var xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    tiilet.forEach(function (t) {
      var lst = [], layer = t.layer, ext = (layer && layer.extent) || 4096;
      ((layer && layer.features) || []).forEach(function (f) {
        if (f.type !== 3 || !luokat[f.props && f.props.luokka]) return;
        var outers = [], holes = [];
        f.parts.forEach(function (r) { var ar = area(r); (ar > 0 ? outers : holes).push({ a: r, ar: ar }); });
        outers.forEach(function (o) {
          var mn = [1e9, 1e9], mx = [-1e9, -1e9];
          for (var i = 0; i < o.a.length; i += 2) { mn[0] = Math.min(mn[0], o.a[i]); mx[0] = Math.max(mx[0], o.a[i]); mn[1] = Math.min(mn[1], o.a[i + 1]); mx[1] = Math.max(mx[1], o.a[i + 1]); }
          lst.push({ o: o.a, h: holes.filter(function (h) { return inRing(h.a[0], h.a[1], o.a); }).map(function (h) { return h.a; }), mn: mn, mx: mx });
        });
      });
      map.set(t.x + '/' + t.y, { lst: lst, ext: ext });
    });
    function onVesi(e, n) {
      var ll = Paikka.enToLonLat(e, n), tp = Paikka.lonlatToTile(ll.lon, ll.lat, Z), tx = Math.floor(tp.x), ty = Math.floor(tp.y);
      var t = map.get(tx + '/' + ty); if (!t) { kutsut.tuntematon++; return false; }
      var u = (tp.x - tx) * t.ext, v = (tp.y - ty) * t.ext;
      for (var i = 0; i < t.lst.length; i++) {
        var p = t.lst[i];
        if (u < p.mn[0] || u > p.mx[0] || v < p.mn[1] || v > p.mx[1]) continue;
        if (!inRing(u, v, p.o)) continue;
        var hole = false;
        for (var j = 0; j < p.h.length && !hole; j++) if (inRing(u, v, p.h[j])) hole = true;
        if (!hole) return true;
      }
      return false;
    }
    onVesi.tilastoa = kutsut;
    return onVesi;
  }

  // ---------- instanssimatriisi ----------
  // Rakentaa 4x4-matriisin (sarakkeittain) paikasta, ruutusuunnasta (rad), nyökkäyksestä, kallistuksesta ja mittakaavasta
  function kirjoitaMatriisi(arr, o, x, y, z, bearingRad, pitch, roll, s) {
    var th = PI / 2 - bearingRad, ct = Math.cos(th), st = Math.sin(th), cf = Math.cos(pitch), sf = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    arr[o] = ct * cf * s; arr[o + 1] = sf * s; arr[o + 2] = -st * cf * s; arr[o + 3] = 0;
    arr[o + 4] = (-ct * sf * cr + st * sr) * s; arr[o + 5] = cf * cr * s; arr[o + 6] = (st * sf * cr + ct * sr) * s; arr[o + 7] = 0;
    arr[o + 8] = (ct * sf * sr + st * cr) * s; arr[o + 9] = -cf * sr * s; arr[o + 10] = (-st * sf * sr + ct * cr) * s; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  // ---------- 3D-kohde ----------
  function luoVeneet(scene, asetuksetSyote) {
    var a = yhdista(asetuksetSyote, ASETUKSET);
    var origin = { e: 0, n: 0 };
    var veneet = [], byId = new Map(), poijut = [], poijuMap = new Map();
    var mat = annaMateriaali();
    var ryhma = new THREE.Group(); ryhma.name = 'veneet'; if (scene) scene.add(ryhma);
    var meshit = {};        // malli/taso -> { mesh, kapasiteetti, pohja, n }
    var viimeinen = { aika: 0, ms: 0, ajoja: 0, piirretty: 0, lahi: 0, kauko: 0, kolmiot: 0, poijut: 0 };
    var viim = { paikkoja: 0, tilasto: null };
    var indeksi = null;     // lahella-ruudukko (kiinnitetyt)
    var laskuriTyo = {}, listaTyo = [];   // paivita-funktion työtaulukot

    function annaMesh(id, taso, tarvittu) {
      var key = id + '/' + taso, m = meshit[key];
      if (m && m.kap >= tarvittu) return m;
      var kap = Math.max(32, m ? m.kap * 2 : 32); while (kap < tarvittu) kap *= 2;
      var pohja = taso === 'poiju' ? poijuGeometria() : (taso === 'koysi' ? koysiGeometria() : mallinGeometria(id, taso));
      var g = new THREE.BufferGeometry();
      ['position', 'normal', 'color', 'osa'].forEach(function (nm) { g.setAttribute(nm, pohja.getAttribute(nm)); });
      var ih = new THREE.InstancedBufferAttribute(new Float32Array(kap * 3), 3), idk = new THREE.InstancedBufferAttribute(new Float32Array(kap * 3), 3), iak = new THREE.InstancedBufferAttribute(new Float32Array(kap * 3), 3);
      [ih, idk, iak].forEach(function (x) { x.setUsage(THREE.DynamicDrawUsage); });
      g.setAttribute('iHull', ih); g.setAttribute('iDeck', idk); g.setAttribute('iAks', iak);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      var mesh = new THREE.InstancedMesh(g, mat, kap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'vene_' + key;
      if (m) { ryhma.remove(m.mesh); m.mesh.geometry.dispose(); }
      ryhma.add(mesh);
      m = { mesh: mesh, kap: kap, kolmiot: pohja.userData.kolmiot, ih: ih, idk: idk, iak: iak, n: 0 };
      meshit[key] = m; return m;
    }

    function lisaa(v) {
      if (!v || v.id === undefined) throw new Error('Veneellä pitää olla id.');
      if (!LUOKAT[v.luokka]) throw new Error('Tuntematon luokka: ' + v.luokka);
      v.id = String(v.id);
      if (v.e === undefined && v.x !== undefined) { v.e = v.x + origin.e; v.n = v.y + origin.n; }   // x ja y ovat maailman koordinaatteja (y pohjoiseen)
      if (byId.has(v.id)) poista(v.id);
      if (v.suunta === undefined) v.suunta = 0;
      tayta(v, a);
      veneet.push(v); byId.set(v.id, v); indeksi = null;
      return v;
    }
    function poista(id) {
      id = String(id); var v = byId.get(id); if (!v) return false;
      byId.delete(id); var i = veneet.indexOf(v); if (i >= 0) veneet.splice(i, 1); indeksi = null;
      return true;
    }
    function siirra(id, e, n, suunta) { var v = byId.get(String(id)); if (!v) return false; v.e = e; v.n = n; if (suunta !== undefined) v.suunta = suunta; if (v.kiinnitetty) indeksi = null; return true; }

    function asetaLaiturit(syote, orig, valinnat) {
      valinnat = valinnat || {};
      if (orig) origin = { e: orig.e, n: orig.n };
      // poistetaan edelliset laituriveneet
      for (var i = veneet.length - 1; i >= 0; i--) if (veneet[i].lahde === 'laituri') { byId.delete(veneet[i].id); veneet.splice(i, 1); }
      poijut = []; poijuMap.clear();
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var r = kiinnitaVeneet(syote, a, valinnat.onVesi || null, valinnat.rajaus || null);
      r.veneet.forEach(function (v) { veneet.push(v); byId.set(v.id, v); });
      poijut = r.poijut; indeksi = null;
      r.tilasto.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      viim.tilasto = r.tilasto;
      return r.tilasto;
    }
    function rebase(orig) { if (!orig && Paikka && Paikka.getOrigin) orig = Paikka.getOrigin(); if (orig) origin = { e: orig.e, n: orig.n }; }

    // Kuvittain: instanssimatriisit ja keinunta. aika sekunteina, oma = { x, y } maailman koordinaateissa
    function paivita(aika, oma) {
      var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      var oe = origin.e, on = origin.n, ox = oma ? oma.x : 0, oy = oma ? oma.y : 0, hasOma = !!oma;
      var raja2 = a.nakyvyysRaja * a.nakyvyysRaja, kauko2 = a.kaukoRaja * a.kaukoRaja, poiju2 = a.poijuRaja * a.poijuRaja;
      var kei = a.keinunta, i, v, n = veneet.length;
      // laskuri mallia ja tasoa kohti
      // työtaulukot säilytetään kuvien välillä, jotta kuvakohtaista roskaa ei synny
      var laskuri = laskuriTyo, lista = listaTyo, ln = 0;
      for (var lk0 in laskuri) laskuri[lk0] = 0;
      for (i = 0; i < n; i++) {
        v = veneet[i];
        var wx = v.e - oe, wy = v.n - on, dx = wx - ox, dy = wy - oy, d2 = dx * dx + dy * dy;
        if (hasOma && d2 > raja2) continue;
        var kauko = hasOma && d2 > kauko2;
        var key = kauko ? v.avainKauko : v.avainLahi;
        laskuri[key] = (laskuri[key] || 0) + 1;
        lista[ln++] = v; lista[ln++] = wx; lista[ln++] = wy; lista[ln++] = kauko; lista[ln++] = key;
      }
      for (var key2 in meshit) meshit[key2].n = 0;
      var lahiN = 0, kaukoN = 0, kolm = 0;
      for (i = 0; i < ln; i += 5) {
        v = lista[i]; var wx2 = lista[i + 1], wy2 = lista[i + 2], tk = lista[i + 3] ? 'kauko' : 'lahi', kk = lista[i + 4];
        var m = meshit[kk];
        if (!m || m.kap < laskuri[kk]) m = annaMesh(v.malli, tk, laskuri[kk]);
        var idx = m.n++;
        var amp = v.kiinnitetty ? 1 : kei.liikkuva, roll = 0, pitch = 0;
        if (v.keinunta !== false) {
          roll = amp * v.amp * RAD * Math.sin(2 * PI * aika / v.jakso + v.vaihe);
          pitch = amp * v.nyokAmp * RAD * Math.sin(2 * PI * aika / v.nyokJakso + v.nyokVaihe);
        }
        kirjoitaMatriisi(m.mesh.instanceMatrix.array, idx * 16, wx2, 0.0, -wy2, v.suunta * RAD, pitch, roll, v.kerroin);
        var vr = v.vari, o3 = idx * 3;
        m.ih.array[o3] = vr.runko[0]; m.ih.array[o3 + 1] = vr.runko[1]; m.ih.array[o3 + 2] = vr.runko[2];
        m.idk.array[o3] = vr.kansi[0]; m.idk.array[o3 + 1] = vr.kansi[1]; m.idk.array[o3 + 2] = vr.kansi[2];
        m.iak.array[o3] = vr.aksentti[0]; m.iak.array[o3 + 1] = vr.aksentti[1]; m.iak.array[o3 + 2] = vr.aksentti[2];
        if (tk === 'lahi') lahiN++; else kaukoN++;
      }
      for (var k3 in meshit) {
        var mm = meshit[k3]; mm.mesh.count = mm.n; mm.mesh.visible = mm.n > 0;
        if (k3 === 'poiju/poiju' || k3 === 'koysi/koysi') continue;
        mm.mesh.instanceMatrix.needsUpdate = true; mm.ih.needsUpdate = true; mm.idk.needsUpdate = true; mm.iak.needsUpdate = true;
        kolm += mm.n * mm.kolmiot;
      }
      // poijut ja köydet
      var pn = 0, pm = null, km = null;
      var tarvePoiju = 0;
      for (i = 0; i < poijut.length; i++) {
        var pj = poijut[i], px = pj.e - oe, py = pj.n - on; if (hasOma && (px - ox) * (px - ox) + (py - oy) * (py - oy) > poiju2) continue; tarvePoiju++;
      }
      if (tarvePoiju > 0 || meshit['poiju/poiju']) {
        pm = annaMesh('poiju', 'poiju', Math.max(1, tarvePoiju)); km = annaMesh('koysi', 'koysi', Math.max(1, tarvePoiju));
        pm.n = 0; km.n = 0;
        for (i = 0; i < poijut.length; i++) {
          var pj2 = poijut[i], px2 = pj2.e - oe, py2 = pj2.n - on;
          if (hasOma && (px2 - ox) * (px2 - ox) + (py2 - oy) * (py2 - oy) > poiju2) continue;
          kirjoitaMatriisi(pm.mesh.instanceMatrix.array, pm.n * 16, px2, 0.0, -py2, 0, 0, 0, a.poijuHalkaisija);
          pm.ih.array.set([1, 1, 1], pm.n * 3); pm.idk.array.set([1, 1, 1], pm.n * 3); pm.iak.array.set([1, 1, 1], pm.n * 3);
          pm.n++;
          // köysi perästä poijuun: alkaa veneen perältä (korkeus perakorkeus), päättyy poijuun
          var sx = pj2.pe - oe, sy = pj2.pn - on, ddx = px2 - sx, ddy = py2 - sy, ll = Math.hypot(ddx, ddy);
          var by = Math.atan2(ddx, ddy);   // ruutusuunta perästä poijuun
          kirjoitaMatriisi(km.mesh.instanceMatrix.array, km.n * 16, sx, pj2.ph * 0.6, -sy, by, -Math.atan2(pj2.ph * 0.6 - 0.06, Math.max(0.5, ll)), 0, 1);
          km.mesh.instanceMatrix.array[km.n * 16] *= ll; km.mesh.instanceMatrix.array[km.n * 16 + 1] *= ll; km.mesh.instanceMatrix.array[km.n * 16 + 2] *= ll;
          km.mesh.instanceMatrix.array[km.n * 16 + 8] *= 0.03; km.mesh.instanceMatrix.array[km.n * 16 + 9] *= 0.03; km.mesh.instanceMatrix.array[km.n * 16 + 10] *= 0.03;
          km.ih.array.set([1, 1, 1], km.n * 3); km.idk.array.set([1, 1, 1], km.n * 3); km.iak.array.set([1, 1, 1], km.n * 3);
          km.n++;
        }
        [pm, km].forEach(function (x) { x.mesh.count = x.n; x.mesh.visible = x.n > 0; x.mesh.instanceMatrix.needsUpdate = true; x.ih.needsUpdate = true; x.idk.needsUpdate = true; x.iak.needsUpdate = true; });
        kolm += pm.n * pm.kolmiot + km.n * km.kolmiot;
      }
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      viimeinen.aika = aika; viimeinen.ms = t1 - t0; viimeinen.ajoja++; viimeinen.piirretty = lahiN + kaukoN; viimeinen.lahi = lahiN; viimeinen.kauko = kaukoN; viimeinen.kolmiot = kolm; viimeinen.poijut = pm ? pm.n : 0;
      return viimeinen.ms;
    }

    // Ruudukko kiinnitetyille veneille (liikkuvat käydään läpi suoraan)
    function rakennaIndeksi() {
      indeksi = { ruudut: new Map(), liikkuvat: [], koko: 100 };
      veneet.forEach(function (v) {
        if (!v.kiinnitetty) { indeksi.liikkuvat.push(v); return; }
        var key = Math.floor(v.e / indeksi.koko) + '/' + Math.floor(v.n / indeksi.koko);
        var l = indeksi.ruudut.get(key); if (!l) indeksi.ruudut.set(key, l = []); l.push(v);
      });
    }
    // Veneet etäisyydellä sade (m) pisteestä (x, y) (maailman koordinaatit). Törmäystarkistukseen ja tutkaan.
    function lahella(x, y, sade) {
      if (!indeksi) rakennaIndeksi();
      var oe = origin.e, on = origin.n, E = x + oe, N = y + on, out = [], K = indeksi.koko;
      function ota(v) {
        var dx = v.e - E, dy = v.n - N, d = Math.hypot(dx, dy); if (d > sade) return;
        out.push({ id: v.id, x: v.e - oe, y: v.n - on, e: v.e, n: v.n, suunta: v.suunta, pituus: v.pituus, leveys: v.leveys, luokka: v.luokka, malli: v.malli, etaisyys: d, kiinnitetty: !!v.kiinnitetty, kaiku: v.kaiku, kaikuTaso: Math.min(1, Math.log10(1 + v.kaiku) / 1.3), masto: v.masto });
      }
      var c0 = Math.floor((E - sade) / K), c1 = Math.floor((E + sade) / K), r0 = Math.floor((N - sade) / K), r1 = Math.floor((N + sade) / K);
      for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) { var l = indeksi.ruudut.get(cx + '/' + cy); if (l) l.forEach(ota); }
      indeksi.liikkuvat.forEach(ota);
      out.sort(function (p, q) { return p.etaisyys - q.etaisyys; });
      return out;
    }
    function tilasto() {
      var luokittain = { soutu: 0, pieni: 0, keski: 0, purje: 0 }, kiinnitetyt = 0;
      veneet.forEach(function (v) { luokittain[v.luokka]++; if (v.kiinnitetty) kiinnitetyt++; });
      var piirtokutsut = 0, kolm = 0;
      for (var k in meshit) { var m = meshit[k]; if (m.mesh.visible && m.n > 0) { piirtokutsut++; } }
      return { veneita: veneet.length, kiinnitettyja: kiinnitetyt, luokittain: luokittain, poijuja: poijut.length, laituri: viim.tilasto, viimeinen: viimeinen, piirtokutsut: piirtokutsut, kolmiot: viimeinen.kolmiot, asetukset: a };
    }
    function hae(id) { return byId.get(String(id)) || null; }
    function nayta(v) { ryhma.visible = v !== false; }
    function pura() {
      for (var k in meshit) { ryhma.remove(meshit[k].mesh); meshit[k].mesh.geometry.dispose(); }
      meshit = {}; if (scene) scene.remove(ryhma);
    }
    return {
      ryhma: ryhma, asetaLaiturit: asetaLaiturit, lisaa: lisaa, poista: poista, siirra: siirra, hae: hae, paivita: paivita, lahella: lahella, tilasto: tilasto, rebase: rebase, nayta: nayta, pura: pura,
      veneet: veneet, asetukset: a, origin: function () { return origin; }
    };
  }

  var api = {
    VERSIO: VERSIO, luoVeneet: luoVeneet, luoVesiTesti: luoVesiTesti, kiinnitaVeneet: kiinnitaVeneet, ketjut: ketjut, ruudunSegmentit: ruudunSegmentit,
    mallinGeometria: mallinGeometria, kolmiotaulukko: kolmiotaulukko, poijuGeometria: poijuGeometria, annaMateriaali: annaMateriaali,
    LUOKAT: LUOKAT, MALLI_IDT: MALLI_IDT, ASETUKSET: ASETUKSET, hashStr: hashStr, rng: rng, tayta: tayta, kirjoitaMatriisi: kirjoitaMatriisi, Rak: Rak
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.Veneet3D = api; root.luoVeneet = luoVeneet; }
})(typeof window !== 'undefined' ? window : globalThis);
