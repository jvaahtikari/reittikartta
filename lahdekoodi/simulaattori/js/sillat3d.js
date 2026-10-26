/* Simulaattori – sillat 3D-näkymään (three.js).
 *
 * Lähde on aineistopaketin kerros tie (nasijarvi.pmtiles) ja sen kenttä taso (MML:n tasosijainti). Silta on tieosuus, jonka taso on suurempi kuin 0.
 * Veden päällä oleva osa tunnistetaan saman ruudun maastokuvioista (jarvi ja virtavesi). Piirretään alle 2 500 m:n päässä aluksesta:
 *  - siltaosuus = veden päällä oleva osa + 15 m maalle kummassakin päässä (rajattuna taso > 0 -osuuteen), ruutujen rajalla katkenneet osat ommellaan yhteen
 *  - kansi: leveys tieluokan mukaan (valtatie ja kantatie 12 m, muu autotie 8 m, kevyen liikenteen väylä 4 m, rautatie 5 m), paksuus 1,2 m,
 *    alapinta lineaarisesti päiden maanpinnan korkeuden välillä (maastomalli), mutta vähintään 4 m vedenpinnan yläpuolella
 *  - kaiteet 1,1 m korkeina ohuina reunapalkkeina, pilarit 1,5 m leveinä laatikoina 25 m välein vedestä kanteen (leveällä kannella useampi rinnakkain)
 *  - maalle jäävät päät suljetaan sivuseinällä maanpintaan (maatuki), jotta kansi ei leiju ilmassa
 *  - väri vaalea betoninharmaa, kaiteet tummempi harmaa, rautatiesilta tummanruskea teräs
 * Ruudut luetaan zoomilla 14: siltojen viivat ja vesialueet ovat samat kuin z16:ssa (vertailu: veden päällä olevan osan pituus eroaa alle 1 %), mutta ruutuja on noin 16 kertaa vähemmän.
 * Kaikki yhdeksi yhdistetyksi verkoksi (yksi piirtokutsu), joka rakennetaan uudelleen, kun alus on liikkunut yli 150 m, uusia ruutuja on tullut tai maasto on tarkentunut.
 * Siltaosuuden nimi (tieluokan nimi-kenttä) säilytetään tiedoissa (list ja info), mutta sitä ei piirretä.
 * Moduulin puhtaat funktiot (tileItems, assemble ja buildGeometry) toimivat myös Nodessa testejä varten. */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka, A = root.Aineisto;
  var Z = 14, DEM_Z = 14, RADIUS = 2500, REBUILD_M = 150, MAX_ACTIVE = 4, MAX_TILES = 220, RAD = Math.PI / 180;
  var SET = {
    widthMajor: 12, widthRoad: 8, widthPath: 4, widthRail: 5,   // kannen leveys (m)
    deckT: 1.2,                                                    // kannen paksuus (m)
    minClear: 4,                                                   // alapinnan vähimmäiskorkeus vedenpinnasta (m)
    railH: 1.1, railW: 0.2,                                        // kaiteen korkeus ja paksuus (m)
    pierW: 1.5, pierStep: 25, pierBottom: -2.5,                    // pilarin leveys, väli ja alapää vedenpinnasta (m)
    landExt: 15,                                                   // maalle jäävä osa kummassakin päässä (m)
    step: 2,                                                       // veden tunnistuksen näytevälin (m)
    minWater: 10,                                                  // lyhyempää vesiylitystä (puro, lampi) ei piirretä (m): neljän metrin vähimmäiskorkeus tekisi siitä korkean laatikon
    rdpTol: 0.3,                                                   // kaarevan sillan yksinkertaistus (m)
    stitchTol: 1.5                                                 // ruudun rajalla katkenneiden osien yhdistämistoleranssi (m)
  };
  var C = {
    deck: [0.74, 0.74, 0.72], deckSide: [0.62, 0.62, 0.60], rail: [0.42, 0.42, 0.43], pier: [0.66, 0.66, 0.64],
    railDeck: [0.34, 0.22, 0.15], railRail: [0.25, 0.16, 0.11], railPier: [0.30, 0.20, 0.14]
  };

  // tieluokka -> sillan laji: major (valtatie, kantatie), road (muu autotie), path (kevyen liikenteen väylä), rail (rautatie), null (ei siltaa, esim. talvitie)
  function kindOf(luokka) {
    var k = Number(luokka);
    if (k === 12111 || k === 12112) return 'major';
    if (k >= 12100 && k < 12300) return 'road';
    if (k === 12311 || k === 12312 || k === 12313 || k === 12314) return 'path';
    if (k >= 14000 && k < 15000) return 'rail';
    return null;
  }
  function widthOf(kind) { return kind === 'major' ? SET.widthMajor : kind === 'road' ? SET.widthRoad : kind === 'rail' ? SET.widthRail : SET.widthPath; }

  // ---------- ruudun kohteet ----------
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
  // Vesialueet (jarvi, virtavesi): lista { x0, y0, x1, y1, rings } ja piste-vedessä-testi (parillinen-pariton sääntö, reiät mukana)
  function waterIndex(layer) {
    var out = [];
    if (!layer || !layer.features) return out;
    layer.features.forEach(function (f) {
      var lk = f.props && f.props.luokka;
      if (f.type !== 3 || (lk !== 'jarvi' && lk !== 'virtavesi')) return;
      var x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
      f.parts.forEach(function (r) { for (var i = 0; i < r.length; i += 2) { if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i]; if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1]; } });
      out.push({ x0: x0, y0: y0, x1: x1, y1: y1, rings: f.parts });
    });
    return out;
  }
  function inWater(wi, u, v) {
    for (var k = 0; k < wi.length; k++) {
      var w = wi[k];
      if (u < w.x0 || u > w.x1 || v < w.y0 || v > w.y1) continue;
      var inside = false;
      for (var ri = 0; ri < w.rings.length; ri++) {
        var a = w.rings[ri], n = a.length;
        for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
          var xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
          if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }
  // layers: { tie, maastokuvio } (Aineisto.layers-tuloksen kerrokset). Palauttaa { pieces } ruudun omalla alueella olevista taso > 0 -tieosista.
  // Osa: { k, luokka, name, num, E, N, W } (TM35FIN E ja N, W = piste veden päällä), pisteväli enintään SET.step.
  function tileItems(z, tx, ty, layers) {
    var out = { pieces: [] }, tie = layers && layers.tie;
    if (!tie || !tie.features) return out;
    var ext = tie.extent || 4096, cand = [];
    for (var fi = 0; fi < tie.features.length; fi++) {
      var f = tie.features[fi], pr = f.props || {};
      if (f.type !== 2 || !(Number(pr.taso) > 0)) continue;
      var kind = kindOf(pr.luokka); if (!kind) continue;
      cand.push({ f: f, kind: kind });
    }
    if (!cand.length) return out;
    var wi = waterIndex(layers.maastokuvio);
    var mid = P.tileLonLat(z, tx, ty, 0.5, 0.5), mPerUnit = 40075016.686 * Math.cos(mid.lat * RAD) / Math.pow(2, z) / ext, stepU = SET.step / mPerUnit;
    function en(u, v) { var ll = P.tileLonLat(z, tx, ty, u / ext, v / ext), e = P.lonlatToEN(ll.lon, ll.lat); return [e.e, e.n]; }
    function emit(c, pl) {   // pl: [u0, v0, u1, v1, ...] ruudun omalla alueella
      if (pl.length < 4) return;
      var E = [], N = [], W = [];
      var add = function (u, v) { var q = en(u, v); E.push(q[0]); N.push(q[1]); W.push(inWater(wi, u, v) ? 1 : 0); };
      add(pl[0], pl[1]);
      for (var i = 2; i < pl.length; i += 2) {
        var u0 = pl[i - 2], v0 = pl[i - 1], u1 = pl[i], v1 = pl[i + 1], n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, v1 - v0) / stepU));
        for (var s = 1; s <= n; s++) add(u0 + (u1 - u0) * s / n, v0 + (v1 - v0) * s / n);
      }
      var pr = c.f.props;
      out.pieces.push({ k: c.kind, luokka: Number(pr.luokka), name: pr.nimi || null, num: pr.tienumero || null, taso: Number(pr.taso), E: E, N: N, W: W });
    }
    cand.forEach(function (c) {
      c.f.parts.forEach(function (a) {
        var np = a.length / 2, pl = [];
        for (var s = 0; s + 1 < np; s++) {
          var cl = clipSeg(a[2 * s], a[2 * s + 1], a[2 * s + 2], a[2 * s + 3], ext);
          if (!cl) { emit(c, pl); pl = []; continue; }
          var ux = a[2 * s + 2] - a[2 * s], uy = a[2 * s + 3] - a[2 * s + 1];
          if (cl[0] > 0 && pl.length) { emit(c, pl); pl = []; }
          if (!pl.length) pl.push(a[2 * s] + ux * cl[0], a[2 * s + 1] + uy * cl[0]);
          pl.push(a[2 * s] + ux * cl[1], a[2 * s + 1] + uy * cl[1]);
          if (cl[1] < 1) { emit(c, pl); pl = []; }
        }
        emit(c, pl);
      });
    });
    return out;
  }

  // ---------- siltaosuuksien kokoaminen ----------
  // Osat ommellaan ketjuiksi (päätepisteet alle stitchTol:n päässä, sama luokka ja nimi, ei risteyksiä), ketjusta otetaan vesiylitykset + landExt maalle kummassakin päässä.
  function stitch(pieces) {
    var tol = SET.stitchTol, n = pieces.length, used = new Array(n).fill(false), chains = [];
    function same(a, b) { return a.luokka === b.luokka && (a.name || '') === (b.name || ''); }
    function match(self, pt) {
      var hit = null, cnt = 0;
      for (var j = 0; j < n; j++) {
        if (used[j] || j === self || !same(pieces[self], pieces[j])) continue;
        var p = pieces[j];
        if (Math.hypot(p.E[0] - pt[0], p.N[0] - pt[1]) <= tol) { hit = { j: j, rev: false }; cnt++; }
        if (Math.hypot(p.E[p.E.length - 1] - pt[0], p.N[p.N.length - 1] - pt[1]) <= tol) { hit = { j: j, rev: true }; cnt++; }
      }
      return cnt === 1 ? hit : null;
    }
    function grow(c, seed, atTail) {
      var cur = seed;
      for (;;) {
        var pt = atTail ? [c.E[c.E.length - 1], c.N[c.N.length - 1]] : [c.E[0], c.N[0]], h = match(cur, pt);
        if (!h) return;
        used[h.j] = true; cur = h.j;
        var p = pieces[h.j], E = p.E.slice(), N = p.N.slice(), W = p.W.slice();
        // tail: uusi osa alkaa pisteestä pt (rev = false) tai päättyy siihen (rev = true). head: päinvastoin.
        var flip = atTail ? h.rev : !h.rev;
        if (flip) { E.reverse(); N.reverse(); W.reverse(); }
        if (atTail) { for (var q = 1; q < E.length; q++) { c.E.push(E[q]); c.N.push(N[q]); c.W.push(W[q]); } }
        else { var m = E.length - 1; c.E = E.slice(0, m).concat(c.E); c.N = N.slice(0, m).concat(c.N); c.W = W.slice(0, m).concat(c.W); }
        if (!c.num && p.num) c.num = p.num;
      }
    }
    for (var i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      var p0 = pieces[i], c = { k: p0.k, luokka: p0.luokka, name: p0.name, num: p0.num, E: p0.E.slice(), N: p0.N.slice(), W: p0.W.slice() };
      grow(c, i, true); grow(c, i, false);
      chains.push(c);
    }
    return chains;
  }

  function cum(E, N) { var S = [0]; for (var i = 1; i < E.length; i++) S.push(S[i - 1] + Math.hypot(E[i] - E[i - 1], N[i] - N[i - 1])); return S; }
  // Ketjun piste kaarenpituudella s (interpoloitu) ja veden lippu (lähin näyte)
  function pointAt(c, S, s) {
    var lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    var d = S[hi] - S[lo], f = d > 1e-9 ? Math.min(1, Math.max(0, (s - S[lo]) / d)) : 0;
    return { e: c.E[lo] + (c.E[hi] - c.E[lo]) * f, n: c.N[lo] + (c.N[hi] - c.N[lo]) * f, w: f < 0.5 ? c.W[lo] : c.W[hi] };
  }
  // Ketjuista siltaosuudet: { k, luokka, name, num, E, N, W, S, L, sw0, sw1, waterM, runs }. sw0 ja sw1 = ensimmäisen ja viimeisen veden päällä olevan kohdan kaarenpituudet osuuden alusta.
  function spansOf(chains) {
    var out = [];
    chains.forEach(function (c) {
      var S = cum(c.E, c.N), total = S[S.length - 1], runs = [], i = 0, n = c.W.length;
      while (i < n) {
        if (!c.W[i]) { i++; continue; }
        var i0 = i; while (i < n && c.W[i]) i++;
        var i1 = i - 1, w0 = i0 > 0 ? S[i0] - SET.step / 2 : S[i0], w1 = i1 < n - 1 ? S[i1] + SET.step / 2 : S[i1];
        if (w1 - w0 < SET.minWater) continue;
        runs.push({ w0: Math.max(0, w0), w1: Math.min(total, w1) });
      }
      if (!runs.length) return;
      // vesiylitysten ympärille landExt, päällekkäiset yhdistetään
      var rs = runs.map(function (r) { return { a: Math.max(0, r.w0 - SET.landExt), b: Math.min(total, r.w1 + SET.landExt), runs: [r] }; }), merged = [];
      rs.forEach(function (r) {
        var last = merged[merged.length - 1];
        if (last && r.a <= last.b) { last.b = Math.max(last.b, r.b); last.runs = last.runs.concat(r.runs); } else merged.push(r);
      });
      merged.forEach(function (m) {
        var E = [], N = [], W = [], pa = pointAt(c, S, m.a);
        E.push(pa.e); N.push(pa.n); W.push(m.a <= 0 && c.W[0] ? 1 : 0);
        for (var j = 0; j < S.length; j++) if (S[j] > m.a + 1e-6 && S[j] < m.b - 1e-6) { E.push(c.E[j]); N.push(c.N[j]); W.push(c.W[j]); }
        var pb = pointAt(c, S, m.b); E.push(pb.e); N.push(pb.n); W.push(m.b >= total && c.W[c.W.length - 1] ? 1 : 0);
        var S2 = cum(E, N), waterM = 0;
        m.runs.forEach(function (r) { waterM += r.w1 - r.w0; });
        out.push({
          k: c.k, luokka: c.luokka, name: c.name, num: c.num, E: E, N: N, W: W, S: S2, L: S2[S2.length - 1],
          sw0: m.runs[0].w0 - m.a, sw1: m.runs[m.runs.length - 1].w1 - m.a, waterM: waterM, runs: m.runs.map(function (r) { return [r.w0 - m.a, r.w1 - m.a]; }), startCut: m.a > 0, endCut: m.b < total
        });
      });
    });
    return out;
  }
  // items: [tileItems-tulos, ...]
  function assemble(items) {
    var pcs = []; items.forEach(function (it) { it.pieces.forEach(function (p) { pcs.push(p); }); });
    return spansOf(stitch(pcs));
  }

  // ---------- geometria ----------
  function Acc() { this.pos = []; this.nor = []; this.col = []; this.tris = 0; }
  // Kolmio annetulla pinnan normaalilla: kärkien järjestys käännetään tarvittaessa vastapäivään normaalin suunnasta katsottuna (Lambert + kaksipuolinen pinta)
  Acc.prototype.tri = function (a, b, c, n, col) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) { var t = b; b = c; c = t; }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (var i = 0; i < 3; i++) { this.nor.push(n[0], n[1], n[2]); this.col.push(col[0], col[1], col[2]); }
    this.tris++;
  };
  Acc.prototype.quad = function (a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); };
  function shade(col, f) { return [Math.min(1, col[0] * f), Math.min(1, col[1] * f), Math.min(1, col[2] * f)]; }

  // Douglas-Peucker: säilytettävät indeksit pisteistä (x = E, y = N)
  function rdp(E, N, tol) {
    var n = E.length, keep = new Array(n).fill(false), stack = [[0, n - 1]];
    keep[0] = keep[n - 1] = true;
    while (stack.length) {
      var s = stack.pop(), a = s[0], b = s[1], dmax = 0, im = -1, dx = E[b] - E[a], dy = N[b] - N[a], l = Math.hypot(dx, dy);
      for (var i = a + 1; i < b; i++) {
        var d = l > 1e-9 ? Math.abs((E[i] - E[a]) * dy - (N[i] - N[a]) * dx) / l : Math.hypot(E[i] - E[a], N[i] - N[a]);
        if (d > dmax) { dmax = d; im = i; }
      }
      if (dmax > tol && im > 0) { keep[im] = true; stack.push([a, im], [im, b]); }
    }
    var out = []; for (var k = 0; k < n; k++) if (keep[k]) out.push(k);
    return out;
  }

  // Yksi siltaosuus verkoksi. groundAt(e, n) = maanpinnan korkeus vedenpinnasta (m) tai null. Palauttaa { tris: {deck, rails, piers, abut}, deckBottomA, deckBottomB, groundA, groundB, unknown }
  function addSpan(acc, sp, oe, on, groundAt) {
    var hw = widthOf(sp.k) / 2, rail = sp.k === 'rail', L = sp.L, S = sp.S;
    var cDeck = rail ? C.railDeck : C.deck, cSide = rail ? shade(C.railDeck, 0.85) : C.deckSide, cRail = rail ? C.railRail : C.rail, cPier = rail ? C.railPier : C.pier;
    var gA = groundAt(sp.E[0], sp.N[0]), gB = groundAt(sp.E[sp.E.length - 1], sp.N[sp.N.length - 1]), unknown = (gA == null ? 1 : 0) + (gB == null ? 1 : 0);
    var hA = gA == null ? 0 : gA, hB = gB == null ? 0 : gB;
    // alapinnan korkeus kaarenpituudella: lineaarinen päiden maanpinnan korkeuksien välillä, vähintään minClear
    var hb = function (s) { return Math.max(SET.minClear, hA + (hB - hA) * (L > 0 ? s / L : 0)); };
    // pisteet: Douglas-Peucker, lisäksi kohdat, joissa alapinnan viiva taittuu (minClear) ja joissa maalle jäävä pää alkaa
    var idx = rdp(sp.E, sp.N, SET.rdpTol), sv = idx.map(function (i) { return S[i]; });
    if ((hA - SET.minClear) * (hB - SET.minClear) < 0) sv.push(L * (SET.minClear - hA) / (hB - hA));
    var swA = sp.sw0 > 1 ? sp.sw0 : 0, swB = sp.sw1 < L - 1 ? sp.sw1 : L;
    if (swA > 0) sv.push(swA); if (swB < L) sv.push(swB);
    sv.sort(function (a, b) { return a - b; });
    var vs = []; sv.forEach(function (s) { if (!vs.length || s - vs[vs.length - 1] > 0.05) vs.push(s); });
    var cp = { E: sp.E, N: sp.N, W: sp.W }, V = vs.map(function (s) {
      var q = pointAt(cp, S, s), yb = hb(s);
      var bot = yb;   // sivuseinän alareuna: maalle jäävissä päissä maanpintaan (loiva rinne päästä vesirajaan)
      if (swA > 0 && s <= swA + 1e-6) bot = Math.min(yb, (hA - 0.3) * (1 - s / swA) + (-0.3) * (s / swA));
      if (swB < L && s >= swB - 1e-6) bot = Math.min(yb, (hB - 0.3) * ((s - swB) / (L - swB)) + (-0.3) * (1 - (s - swB) / (L - swB)));
      return { s: s, x: q.e - oe, z: -(q.n - on), yb: yb, yt: yb + SET.deckT, bot: bot };
    });
    var nV = V.length, t0 = acc.tris, tris = { deck: 0, rails: 0, piers: 0, abut: 0 };
    // kehykset: tangentti, vasen normaali ja jiirikerroin
    var tg = [], i;
    for (i = 0; i + 1 < nV; i++) { var dx = V[i + 1].x - V[i].x, dz = V[i + 1].z - V[i].z, l = Math.hypot(dx, dz) || 1; tg.push([dx / l, dz / l]); }
    var fr = V.map(function (v, j) {
      var a = tg[Math.max(0, j - 1)], b = tg[Math.min(tg.length - 1, j)], na = [-a[1], a[0]], nb = [-b[1], b[0]], bx = na[0] + nb[0], bz = na[1] + nb[1], bl = Math.hypot(bx, bz);
      if (bl < 1e-6) { bx = na[0]; bz = na[1]; } else { bx /= bl; bz /= bl; }
      var m = Math.min(2, 1 / Math.max(0.5, bx * nb[0] + bz * nb[1]));
      return { bx: bx * m, bz: bz * m };
    });
    var edge = function (j, off, y) { return [V[j].x + fr[j].bx * off, y, V[j].z + fr[j].bz * off]; };
    for (i = 0; i + 1 < nV; i++) {
      var t = tg[i], nrm = [-t[1], 0, t[0]], nrmN = [t[1], 0, -t[0]], a = V[i], b = V[i + 1], t1;
      t1 = acc.tris;
      acc.quad(edge(i, hw, a.yt), edge(i, -hw, a.yt), edge(i + 1, -hw, b.yt), edge(i + 1, hw, b.yt), [0, 1, 0], cDeck);                     // kansi
      acc.quad(edge(i, hw, a.yb), edge(i, -hw, a.yb), edge(i + 1, -hw, b.yb), edge(i + 1, hw, b.yb), [0, -1, 0], shade(cSide, 0.8));        // alapinta
      acc.quad(edge(i, hw, a.bot), edge(i + 1, hw, b.bot), edge(i + 1, hw, b.yt), edge(i, hw, a.yt), nrm, cSide);                          // sivut
      acc.quad(edge(i, -hw, a.bot), edge(i + 1, -hw, b.bot), edge(i + 1, -hw, b.yt), edge(i, -hw, a.yt), nrmN, cSide);
      tris.deck += acc.tris - t1; t1 = acc.tris;
      [1, -1].forEach(function (sg) {                                                                                                       // kaiteet
        var o = sg * hw, ii = sg * (hw - SET.railW), top = SET.railH;
        acc.quad(edge(i, o, a.yt + top), edge(i, ii, a.yt + top), edge(i + 1, ii, b.yt + top), edge(i + 1, o, b.yt + top), [0, 1, 0], cRail);
        acc.quad(edge(i, o, a.yt), edge(i + 1, o, b.yt), edge(i + 1, o, b.yt + top), edge(i, o, a.yt + top), sg > 0 ? nrm : nrmN, cRail);
        acc.quad(edge(i, ii, a.yt), edge(i + 1, ii, b.yt), edge(i + 1, ii, b.yt + top), edge(i, ii, a.yt + top), sg > 0 ? nrmN : nrm, shade(cRail, 0.9));
      });
      tris.rails += acc.tris - t1;
    }
    // päätyseinät (maatuet) ja kaiteiden päät
    t1 = acc.tris;
    [[0, [-tg[0][0], 0, -tg[0][1]]], [nV - 1, [tg[tg.length - 1][0], 0, tg[tg.length - 1][1]]]].forEach(function (e) {
      var j = e[0], v = V[j];
      acc.quad(edge(j, hw, v.bot), edge(j, -hw, v.bot), edge(j, -hw, v.yt), edge(j, hw, v.yt), e[1], cSide);
      [1, -1].forEach(function (sg) { acc.quad(edge(j, sg * hw, v.yt), edge(j, sg * (hw - SET.railW), v.yt), edge(j, sg * (hw - SET.railW), v.yt + SET.railH), edge(j, sg * hw, v.yt + SET.railH), e[1], cRail); });
    });
    tris.abut += acc.tris - t1;
    // pilarit: 1,5 m laatikot pisteissä, jotka ovat veden päällä; leveällä kannella 2-3 rinnakkain
    t1 = acc.tris;
    var ncol = hw * 2 >= 10 ? 3 : hw * 2 >= 7 ? 2 : 1, pw = SET.pierW / 2, piers = 0;
    for (var s = SET.pierStep / 2; s < L; s += SET.pierStep) {
      var q = pointAt(cp, S, s); if (!q.w) continue;
      var q2 = pointAt(cp, S, Math.min(L, s + 1)), q1 = pointAt(cp, S, Math.max(0, s - 1)), tx = q2.e - q1.e, tz = -(q2.n - q1.n), tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      var nx = -tz, nz = tx, top = hb(s) + 0.1, bot = SET.pierBottom, cx = q.e - oe, cz = -(q.n - on);
      for (var k = 0; k < ncol; k++) {
        var off = ncol === 1 ? 0 : (k - (ncol - 1) / 2) * ((hw * 2 - 3) / (ncol - 1)), px = cx + nx * off, pz = cz + nz * off;
        var c4 = [[px + tx * pw + nx * pw, pz + tz * pw + nz * pw], [px + tx * pw - nx * pw, pz + tz * pw - nz * pw], [px - tx * pw - nx * pw, pz - tz * pw - nz * pw], [px - tx * pw + nx * pw, pz - tz * pw + nz * pw]];
        for (var f = 0; f < 4; f++) {
          var p0 = c4[f], p1 = c4[(f + 1) % 4], mx = (p0[0] + p1[0]) / 2 - px, mz = (p0[1] + p1[1]) / 2 - pz, ml = Math.hypot(mx, mz) || 1;
          acc.quad([p0[0], bot, p0[1]], [p1[0], bot, p1[1]], [p1[0], top, p1[1]], [p0[0], top, p0[1]], [mx / ml, 0, mz / ml], f % 2 ? shade(cPier, 0.9) : cPier);
        }
        piers++;
      }
    }
    tris.piers += acc.tris - t1;
    return { tris: tris, total: acc.tris - t0, piers: piers, deckBottomA: hb(0), deckBottomB: hb(L), groundA: gA, groundB: gB, unknown: unknown };
  }

  // spans: assemble-tulos. Palauttaa { geometry, stats } osuuksista, joiden lähin piste on alle radius metrin päässä (x, y) (kuvan maailmakoordinaatit, origo orig).
  function buildGeometry(spans, x, y, radius, orig, groundAt) {
    var oe = orig.e, on = orig.n, bx = x + oe, by = y + on, r2 = radius * radius, acc = new Acc();
    var st = { bridges: 0, tris: { deck: 0, rails: 0, piers: 0, abut: 0 }, piers: 0, unknown: 0, list: [] };
    spans.forEach(function (sp) {
      var near = false;
      for (var i = 0; i < sp.E.length && !near; i++) { var dx = sp.E[i] - bx, dy = sp.N[i] - by; if (dx * dx + dy * dy <= r2) near = true; }
      if (!near) return;
      var r = addSpan(acc, sp, oe, on, groundAt);
      st.bridges++; st.piers += r.piers; st.unknown += r.unknown;
      for (var k in r.tris) st.tris[k] += r.tris[k];
      st.list.push({
        name: sp.name, num: sp.num, luokka: sp.luokka, k: sp.k, width: widthOf(sp.k), length: sp.L, waterM: sp.waterM, tris: r.total, piers: r.piers,
        e0: sp.E[0], n0: sp.N[0], e1: sp.E[sp.E.length - 1], n1: sp.N[sp.N.length - 1], deckBottomA: r.deckBottomA, deckBottomB: r.deckBottomB, groundA: r.groundA, groundB: r.groundB
      });
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
  // opts: radius, groundAt(x, y) (valinnainen: maailmakoordinaatit -> maanpinnan korkeus vedenpinnasta tai null, oletuksena korkeusmalli z14)
  function create(scene, opts) {
    opts = opts || {};
    var radius = opts.radius || RADIUS;
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.name = 'sillat'; mesh.frustumCulled = false; mesh.visible = false; mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    var tiles = new Map(), queue = [], active = 0, dirty = true, last = { x: 1e9, y: 1e9 }, boat = { x: 0, y: 0 }, stats = null, gen = 0, spans = [], spansKey = '', msMax = 0, builds = 0;
    // Maanpinnan korkeus päissä suoraan korkeusmallista (maasto.pmtiles, z14, sama aineisto ja näytteistys kuin maastoverkon z14-z16-solmuilla), joten korkeus ei riipu maaston tarkkuustasosta.
    var dem = new Map(), demPending = 0;
    function demLoad(key, tx, ty) {
      var en = { st: 0, g: null }; dem.set(key, en); demPending++;
      var fin = function (g) { en.g = g; en.st = 1; demPending--; dirty = true; };
      A.png('dem', DEM_Z, tx, ty).then(function (img) { fin(img ? { w: img.w, h: img.h, v: A.terrainHeights(img) } : null); }, function () { fin(null); });
      if (dem.size > 40) { var k0 = dem.keys().next().value; if (dem.get(k0).st === 1) dem.delete(k0); }
    }
    function sampleDem(g, fx, fy) {
      var w = g.w, h = g.h, px = Math.min(w - 1, Math.max(0, fx * w - 0.5)), py = Math.min(h - 1, Math.max(0, fy * h - 0.5));
      var x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = px - x0, ty = py - y0, v = g.v;
      var a = v[y0 * w + x0], b = v[y0 * w + x1], c = v[y1 * w + x0], d = v[y1 * w + x1];
      if (a !== a || b !== b || c !== c || d !== d) return NaN;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
    // TM35FIN-piste -> maanpinnan korkeus vedenpinnasta (m), null kunnes ruutu on ladattu
    var groundAtEN = function (e, n) {
      if (opts.groundAt) { var w = P.enToWorld(e, n), h = opts.groundAt(w.x, w.y); return h == null || h !== h ? null : h; }
      var ll = P.enToLonLat(e, n), t = P.lonlatToTile(ll.lon, ll.lat, DEM_Z), tx = Math.floor(t.x), ty = Math.floor(t.y), key = tx + '/' + ty, en = dem.get(key);
      if (!en) { demLoad(key, tx, ty); return null; }
      if (en.st === 0) return null;
      if (!en.g) return 0;
      var hv = sampleDem(en.g, t.x - tx, t.y - ty);
      return Math.max(0, (hv !== hv ? P.LAKE_Z : hv) - P.LAKE_Z);
    };

    function pump() {
      while (active < MAX_ACTIVE && queue.length) {
        var t = queue.shift(); if (t.st !== 0) continue;
        t.st = 1; active++;
        (function (t, g) {
          var done = function (it) { active--; if (g === gen) { t.items = it; t.st = 2; dirty = true; } pump(); };
          A.layers(Z, t.x, t.y, ['tie', 'maastokuvio']).then(function (r) { done(r ? tileItems(Z, t.x, t.y, r) : null); }, function () { done(null); });
        })(t, gen);
      }
    }
    function want() {
      var ll = P.worldToLonLat(boat.x, boat.y), tp = P.lonlatToTile(ll.lon, ll.lat, Z), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, Z);
      var reach = radius + 150, rr = Math.ceil(reach / size) + 1, cx = Math.floor(tp.x), cy = Math.floor(tp.y), out = [];
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        var x = cx + dx, y = cy + dy, k = x + '/' + y;
        var ex = Math.max(0, Math.abs(x + 0.5 - tp.x) - 0.5) * size, ey = Math.max(0, Math.abs(y + 0.5 - tp.y) - 0.5) * size;
        if (Math.hypot(ex, ey) > reach) continue;
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
      var list = [], key = [];
      ts.forEach(function (t) { if (t.st === 2 && t.items) { list.push(t.items); if (t.items.pieces.length) key.push(t.key); } });
      key.sort(); var k = key.join('|') + '#' + ts.filter(function (t) { return t.st === 2; }).length, t0 = performance.now(), asmMs = 0;
      if (k !== spansKey) { spans = assemble(list); spansKey = k; asmMs = performance.now() - t0; }
      var r = buildGeometry(spans, boat.x, boat.y, radius, P.getOrigin(), groundAtEN);
      r.stats.ms = performance.now() - t0; r.stats.asmMs = asmMs; msMax = Math.max(msMax, r.stats.ms); builds++;
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
    function reset() { tiles.clear(); queue.length = 0; active = 0; gen++; dirty = true; spansKey = ''; spans = []; last.x = last.y = 1e9; }
    function idle() { var busy = false; tiles.forEach(function (t) { if (t.st < 2) busy = true; }); return !busy && !dirty && !demPending; }
    function info() { return { tiles: tiles.size, loaded: Array.from(tiles.values()).filter(function (t) { return t.st === 2; }).length, stats: stats, visible: mesh.visible, dem: dem.size, builds: builds, msMax: msMax }; }
    function list() { return stats ? stats.list.slice() : []; }
    return { mesh: mesh, sync: sync, rebase: rebase, reset: reset, idle: idle, info: info, list: list, spans: function () { return spans; }, settings: SET };
  }

  // Liittää sillat näkymään (Nakyma.create-tulos): sillat piirtyvät joka kuvalla ennen render-kutsua ja seuraavat origon siirtoa (addExtra).
  // Maanpinnan korkeus luetaan korkeusmallista (maasto.pmtiles) samalla näytteistyksellä kuin maastoverkko.
  function attach(view, opts) {
    opts = opts || {};
    var b = create(view.scene, { radius: opts.radius, groundAt: opts.groundAt });
    var r0 = view.render;
    view.render = function (st) { b.sync(st.x, st.y); return r0.apply(view, arguments); };
    if (view.addExtra) view.addExtra(b);
    view.bridges = b;
    return b;
  }

  var api = { create: create, attach: attach, tileItems: tileItems, assemble: assemble, stitch: stitch, spansOf: spansOf, buildGeometry: buildGeometry, kindOf: kindOf, widthOf: widthOf, SETTINGS: SET, RADIUS: RADIUS, COLORS: C, Z: Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sillat3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
