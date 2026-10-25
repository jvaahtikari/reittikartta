/* Simulaattori – plotteri (canvas, Reittikartan vektorimerikartan tyyli).
 *
 * Plotteri piirtää aineistopaketin MVT-ruudut (maastokuvio, syvyysalue, syvyyskäyrä, rantaviiva, väylät, vesieste, tiet ja rakennukset)
 * Reittikartan vektorikartan väreillä (chart.js: VEC, SAFE_FILL ja viivojen värit). Jokainen ruutu maalataan kerran bittikartaksi
 * (512 tai 384 px, 1/64 reunamarginaali ruudun omasta puskuriaineistosta), ja jokaisella päivityksellä piirretään vain kierretyt
 * bittikartat sekä päälle syvyysluvut, turvalaitteet, reitti, jälki, EBL, VRM, heading line ja COG/SOG-vektori. Karttaa ei lataa uudelleen
 * eikä sitä pyöritetä DOM:ssa, joten kuva ei välky. Puuttuvan ruudun tilalla näkyy edellinen tai tarkempi ruutu.
 * Suunta ylös: kartta kierretään aluksen tosisuunnan verran, alus on näkymän alakolmanneksessa. Pohjoinen ylös on valittavissa.
 * Rasterimerikartta (Traficom WMTS) on valinnainen pohja (oletus pois), jolloin ruudun pohjana on rasterikuva ja päällä vektorikerrokset.
 * Koordinaatit: Web Mercator -metrit vähennettynä kiinteällä referenssipisteellä (float32-tarkkuus riittää). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, RE = 6378137, PIR = Math.PI * RE;
  var RAST = 'https://julkinen.traficom.fi/rasteripalvelu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER=Traficom%3AMerikarttasarjat%20public&STYLE=&TILEMATRIXSET=WGS84_Pseudo-Mercator&TILEMATRIX=WGS84_Pseudo-Mercator%3A{z}' +
    '&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng';
  var OFFSET_FRAC = 0.2;            // aluksen siirtymä näkymän keskipisteestä alaspäin näytön korkeuden osuutena (suunta ylös)
  var SHALLOW_M = (root.Liike && root.Liike.SETTINGS.draftM) || 1.1;   // pohjakosketuksen raja: syvyysalueen suurin syvyys (DRVAL2) alle tämän
  var NM = 1852;
  // Reittikartan vektorikartan värit (chart.js VEC, laiturien täyttö ja navigointilinjat)
  var COL = {
    land: '#faf0cb', deep: '#ffffff', d10: '#f4f9fe', d6: '#e2f0fc', d3: '#c6e2f9', contour: '#0096dc', coast: '#232323',
    pierFill: '#e6dcc0', pierEdge: '#333333', nav: '#1b1b1b', fairway: '#b3319b', shallow: 'rgba(217,38,44,0.28)',
    ink: '#111111', danger: '#9fcaee'
  };
  var FONT = '"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
  var VEC_SEC = [30, 60, 180, 360];
  var LAYER_NAMES = ['maastokuvio', 'syvyysalue', 'syvyyskayra', 'syvyyspiste', 'rantaviiva', 'vesieste', 'tie', 'rakennus', 'vaylaalue', 'navigointilinja', 'taululinja', 'vayla'];

  // ---------- projektio ----------
  var REF = { lon: 23.77, lat: 61.5 };
  function mercX(lon) { return RE * lon * RAD; }
  function mercY(lat) { return RE * Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2)); }
  var OX = mercX(REF.lon), OY = mercY(REF.lat);
  function worldToPlot(x, y) { var l = root.Paikka.worldToLonLat(x, y); return [mercX(l.lon) - OX, mercY(l.lat) - OY, l.lat]; }
  function fnum(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','); }
  function pad3(n) { n = Math.round(((n % 360) + 360) % 360) % 360; return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function norm360(b) { b = b % 360; return b < 0 ? b + 360 : b; }

  // ---------- ruutuvälimuisti (jaettu kaikkien plotterien kesken) ----------
  var DPR = Math.min(2, Math.max(1, root.devicePixelRatio || 1));
  var BAKE = DPR > 1.5 ? { B: 512, M: 8 } : { B: 384, M: 6 };
  var MAXT = Math.floor(64e6 / (4 * Math.pow(BAKE.B + 2 * BAKE.M, 2)));
  var TILES = new Map(), loadQ = [], active = 0, MAXACTIVE = 4, bakeQ = [], bakeTimer = null, stamp = 0, listeners = [];
  var rasterMode = false;
  // tila: 0 uusi, 1 latautuu, 2 purettu (odottaa maalausta), 3 valmis, 4 ei ruutua aineistossa
  function tkey(z, x, y) { return (rasterMode ? 'r' : 'v') + z + '/' + x + '/' + y; }
  function notify() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  function getTile(z, x, y, create) {
    var k = tkey(z, x, y), e = TILES.get(k);
    if (!e && create) { e = { key: k, z: z, x: x, y: y, st: 0, bm: null, snd: [], used: 0, want: 0, ras: rasterMode }; TILES.set(k, e); }
    return e;
  }
  function loadTile(e) {
    e.st = 1; active++;
    var done = function () { active--; pump(); };
    var rimg = null, rp = Promise.resolve(null);
    if (e.ras) {
      var rz = Math.min(15, e.z), sh = e.z - rz, rx = e.x >> sh, ry = e.y >> sh;
      rp = new Promise(function (res) {
        var im = new Image(); im.onload = function () { res({ img: im, sh: sh, sx: e.x - (rx << sh), sy: e.y - (ry << sh) }); }; im.onerror = function () { res(null); };
        im.src = RAST.replace('{z}', rz).replace('{x}', rx).replace('{y}', ry);
      });
    }
    Promise.all([root.Aineisto.layers(e.z, e.x, e.y, LAYER_NAMES), rp]).then(function (r) {
      e.data = r[0]; e.rimg = r[1];
      if (!e.data) { e.st = 4; done(); notify(); return; }
      e.st = 2; bakeQ.push(e); scheduleBake(); done();
    }, function () { e.st = 4; done(); });
  }
  function pump() {
    while (active < MAXACTIVE && loadQ.length) {
      var e = loadQ.shift();
      if (e.st === 0) loadTile(e);
    }
  }
  function scheduleBake() {
    if (bakeTimer != null) return;
    bakeTimer = setTimeout(function () {
      bakeTimer = null;
      var idx = -1, i;
      for (i = 0; i < bakeQ.length; i++) if (bakeQ[i].want === stamp || bakeQ[i].want === stamp - 1) { idx = i; break; }
      if (idx < 0 && bakeQ.length) idx = 0;
      if (idx >= 0) {
        var e = bakeQ.splice(idx, 1)[0];
        try { bake(e); e.st = 3; } catch (err) { e.st = 4; if (root.console) console.error('plotteri: ruudun maalaus epäonnistui', err); }
        e.data = null; e.rimg = null;
        evict(); notify();
      }
      if (bakeQ.length) scheduleBake();
    }, 12);
  }
  function evict() {
    var ready = [];
    TILES.forEach(function (e) { if (e.st === 3) ready.push(e); });
    if (ready.length <= MAXT) return;
    ready.sort(function (a, b) { return a.used - b.used; });
    for (var i = 0; ready.length - i > MAXT && i < ready.length; i++) {
      var e = ready[i]; if (e.used >= stamp - 1) break;
      if (e.bm) { e.bm.width = 0; e.bm = null; }
      TILES.delete(e.key);
    }
  }

  // ---------- ruudun maalaus ----------
  function ring(g, a) {
    var n = a.length;
    g.moveTo(a[0], a[1]);
    for (var i = 2; i < n; i += 2) g.lineTo(a[i], a[i + 1]);
  }
  function fillPolys(g, feats, style) {
    if (!feats.length) return;
    g.beginPath();
    for (var i = 0; i < feats.length; i++) for (var j = 0; j < feats[i].parts.length; j++) { ring(g, feats[i].parts[j]); g.closePath(); }
    g.fillStyle = style; g.fill('evenodd');
  }
  function strokeLines(g, feats) {
    g.beginPath();
    for (var i = 0; i < feats.length; i++) for (var j = 0; j < feats[i].parts.length; j++) ring(g, feats[i].parts[j]);
    g.stroke();
  }
  function rockMark(g, kind, x, y, u) {   // ⊥ (pinnan yläpuolella), + (pinnassa), ⊤ (vedenalainen). u = yksikköä per 1 px
    var s = 4.5 * u;
    g.beginPath();
    if (kind === 'above') { g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y); g.lineTo(x, y - s * 1.4); }
    else if (kind === 'under') { g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y); g.lineTo(x, y + s * 1.4); }
    else { g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); }
    g.stroke();
  }
  function bake(e) {
    var B = BAKE.B, M = BAKE.M, S = B + 2 * M, D = e.data, c = document.createElement('canvas'); c.width = S; c.height = S;
    var g = c.getContext('2d');
    var ext = (D.maastokuvio && D.maastokuvio.extent) || 4096, sc = B / ext;
    var u = ext / B * (B / 256);                  // yksikköä per 1 css-px, kun ruutu näkyy 256 css-px leveänä
    function L(layer) { return D[layer] ? D[layer].features : []; }
    g.lineJoin = 'round'; g.lineCap = 'round';
    // pohja: maa
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = COL.land; g.fillRect(0, 0, S, S);
    if (e.ras && e.rimg) {
      var im = e.rimg.img, n = 256 >> e.rimg.sh;
      g.imageSmoothingEnabled = true;
      g.drawImage(im, e.rimg.sx * n, e.rimg.sy * n, n, n, M - 1, M - 1, B + 2, B + 2);
    }
    g.setTransform(sc, 0, 0, sc, M, M);
    var tzm = 40075016.686 * Math.cos(61.5 * RAD) / Math.pow(2, e.z);   // ruudun leveys todellisina metreinä
    var mPerUnit = tzm / ext;
    if (!e.ras) {
      // taajama hieman tummemmalla paperilla, vesialueet valkoisella pohjalla
      fillPolys(g, L('maastokuvio').filter(function (f) { return f.props.luokka === 'taajama'; }), '#f3e7b9');
      fillPolys(g, L('maastokuvio').filter(function (f) { return f.props.luokka === 'jarvi' || f.props.luokka === 'virtavesi'; }), COL.deep);
      // syvyysalueet: DRVAL1 alle 3 m, 3-6 m, 6-10 m (Reittikartan VEC.d3, d6 ja d10), syvemmät jäävät valkoisiksi
      var sa = L('syvyysalue');
      fillPolys(g, sa.filter(function (f) { var a = Number(f.props.alin); return a >= 6 && a < 10; }), COL.d10);
      fillPolys(g, sa.filter(function (f) { var a = Number(f.props.alin); return a >= 3 && a < 6; }), COL.d6);
      fillPolys(g, sa.filter(function (f) { var a = Number(f.props.alin); return a < 3; }), COL.d3);
      // tiet ja rakennukset
      if (e.z >= 12) {
        var roads = L('tie');
        var major = roads.filter(function (f) { return /^121/.test(String(f.props.luokka)) && Number(f.props.luokka) < 12130; });
        var minor = roads.filter(function (f) { var k = Number(f.props.luokka); return k >= 12130 && k < 12200; });
        var paths = roads.filter(function (f) { var k = Number(f.props.luokka); return k >= 12300 && k !== 12316; });
        g.strokeStyle = '#e8dcae'; g.lineWidth = 0.8 * u; if (e.z >= 14) strokeLines(g, paths);
        g.strokeStyle = '#e0cf93'; g.lineWidth = 1.1 * u; strokeLines(g, minor);
        g.strokeStyle = '#d6bf7a'; g.lineWidth = 1.8 * u; strokeLines(g, major);
      }
      if (e.z >= 14) {
        var bl = L('rakennus');
        fillPolys(g, bl, COL.pierFill);
        g.strokeStyle = '#b8aa80'; g.lineWidth = 0.5 * u; g.beginPath();
        for (var bi = 0; bi < bl.length; bi++) for (var bj = 0; bj < bl[bi].parts.length; bj++) { ring(g, bl[bi].parts[bj]); g.closePath(); }
        g.stroke();
      }
      // syvyyskäyrät ja rantaviiva
      g.strokeStyle = COL.contour; g.lineWidth = 1.0 * u; strokeLines(g, L('syvyyskayra'));
      g.strokeStyle = COL.coast; g.lineWidth = 1.2 * u; strokeLines(g, L('rantaviiva'));
    }
    // matalikko, jossa syväys ei riitä (DRVAL2 alle syväyksen)
    fillPolys(g, L('syvyysalue').filter(function (f) { return f.props.ylin != null && Number(f.props.ylin) < SHALLOW_M; }), COL.shallow);
    // vesieste: laiturit, kivet ja kivikot
    var ve = L('vesieste');
    var pw = { laituri_kapea: 2.5, 'laituri_leveä': 5 };
    ['laituri_kapea', 'laituri_leveä'].forEach(function (k) {
      var fs = ve.filter(function (f) { return f.props.laji === k && f.type === 2; }); if (!fs.length) return;
      var wU = Math.max(2 * u, pw[k] / mPerUnit);
      g.strokeStyle = COL.pierEdge; g.lineCap = 'butt'; g.lineWidth = wU + 1.6 * u; strokeLines(g, fs);
      g.strokeStyle = COL.pierFill; g.lineWidth = wU; strokeLines(g, fs); g.lineCap = 'round';
    });
    var kik = ve.filter(function (f) { return /kivikko|matalikko/.test(String(f.props.laji)) && f.type === 3; });
    if (kik.length) {
      g.beginPath();
      for (var ki = 0; ki < kik.length; ki++) for (var kj = 0; kj < kik[ki].parts.length; kj++) { ring(g, kik[ki].parts[kj]); g.closePath(); }
      g.fillStyle = 'rgba(159,202,238,0.45)'; g.fill('evenodd');
      g.strokeStyle = COL.ink; g.lineWidth = 1.2 * u; g.setLineDash([0.1 * u, 3.2 * u]); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = COL.ink; g.lineWidth = 1.5 * u; g.lineCap = 'butt';
    ve.forEach(function (f) {
      if (f.type !== 1) return;
      var lj = String(f.props.laji), kind = /pinnan_yl/.test(lj) ? 'above' : /pinnassa/.test(lj) ? 'awash' : /vesikivi/.test(lj) ? 'under' : null;
      if (!kind) return;
      for (var i = 0; i < f.parts.length; i++) rockMark(g, kind, f.parts[i][0], f.parts[i][1], u);
    });
    g.lineCap = 'round';
    // väyläalue, navigointilinjat ja taululinjat
    var va = L('vaylaalue');
    if (va.length) {
      fillPolys(g, va, 'rgba(0,0,0,0.065)');
      g.strokeStyle = COL.fairway; g.lineWidth = 0.8 * u; g.beginPath();
      for (var vi = 0; vi < va.length; vi++) for (var vj = 0; vj < va[vi].parts.length; vj++) { ring(g, va[vi].parts[vj]); g.closePath(); }
      g.stroke();
    }
    var cls = {};
    L('vayla').forEach(function (f) { var m = /^VL(\d)/.exec(String(f.props.luokka || '')); if (m) cls[f.props.jnro] = Number(m[1]); });
    var nav = L('navigointilinja');
    g.strokeStyle = COL.nav; g.globalAlpha = 0.85; g.lineWidth = 1.6 * u;
    [false, true].forEach(function (dashed) {
      var fs = nav.filter(function (f) { var k = cls[f.props.jnro]; return (k != null && k >= 3) === dashed; });
      if (!fs.length) return;
      g.setLineDash(dashed ? [7 * u, 5 * u] : []); strokeLines(g, fs);
    });
    g.setLineDash([]); g.globalAlpha = 1;
    var tl = L('taululinja');
    if (tl.length) { g.strokeStyle = COL.nav; g.lineWidth = 1.1 * u; g.globalAlpha = 0.9; g.setLineDash([7 * u, 5 * u]); strokeLines(g, tl); g.setLineDash([]); g.globalAlpha = 1; }
    e.bm = c;
    // syvyysluvut (plot-koordinaatit)
    var T = 2 * PIR / Math.pow(2, e.z), X0 = e.x * T - PIR - OX, Yt = PIR - e.y * T - OY;
    e.snd = [];
    L('syvyyspiste').forEach(function (f) {
      var p = f.parts[0]; if (!p || f.props.syvyys == null) return;
      if (p[0] < -4 || p[0] > ext + 4 || p[1] < -4 || p[1] > ext + 4) return;
      e.snd.push({ X: X0 + p[0] / ext * T, Y: Yt - p[1] / ext * T, d: Number(f.props.syvyys) });
    });
  }

  // ---------- symbolit (SVG -> kuva) ----------
  var symCache = {};
  function symImage(key, sym) {
    var s = symCache[key];
    if (s) return s;
    var svg = sym.html.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/width="[\d.]+" height="[\d.]+"/, 'width="' + sym.w * DPR + '" height="' + sym.h * DPR + '"');
    var img = new Image(); s = symCache[key] = { img: img, w: sym.w, h: sym.h, ax: sym.ax, ay: sym.ay, ok: false };
    img.onload = function () { s.ok = true; notify(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return s;
  }
  function symbolFor(a) {
    var S = root.ChartSymbols;
    if (a.tyyppi === 'Viitta' && a.nl >= 1 && a.nl <= 9) return ['m' + a.nl, function () { return S.mark(a.nl, true); }];
    if (a.tyyppi === 'Kummeli') return ['k', S.cairn];
    if (/loisto/i.test(a.tyyppi)) return ['l', S.lightStructure];
    if (a.tyyppi === 'Viitta') return ['m0', function () { return S.mark(0, true); }];
    return ['g', S.generic];
  }

  // ---------- plotteri ----------
  function create(container, opts) {
    opts = opts || {};
    var P = root.Paikka;
    var interactive = opts.interactive !== false;
    var canvas = document.createElement('canvas'); canvas.className = 'plot-canvas';
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none';
    container.insertBefore(canvas, container.firstChild);
    var ctx = canvas.getContext('2d');
    var overlay = document.createElement('div'); overlay.className = 'plot-overlay'; container.appendChild(overlay);
    var own = container.querySelector('.plot-own');
    var rangeNm = 1, w = 0, h = 0;
    var S = { x: 0, y: 0, hdg: 0, cog: 0, sog: 0, hdgTrue: 0, cogTrue: 0, px: 0, py: 0, lat: 61.5, has: false };
    var headUp = opts.fixedHeadUp ? true : opts.headUp !== false;
    var evOn = interactive && opts.ev !== false, ebl = 0, vrm = 0.5, vecIdx = 1, onEV = opts.onEV || null;
    var route = { pts: [], turns: [] }, nextPt = null, trail = { src: null, n: 0, arr: [] };
    var extraLines = [], extraPts = [];
    var aidList = [], lastAidSync = 0, wantStamp = 0, lastNeedKey = '', dirty = false, readyFlag = false, destroyed = false;
    var view = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, s: 1, sx: 0, sy: 0 };

    function resize() {
      w = container.clientWidth; h = container.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
      dirty = true; draw();
    }
    function setRangeNm(nm) { rangeNm = nm; dirty = true; if (S.has) draw(); }
    function getRangeNm() { return rangeNm; }
    function listener() { if (destroyed) return; if (!dirty) { dirty = true; (root.requestAnimationFrame || setTimeout)(function () { if (dirty) draw(); }); } }
    listeners.push(listener);

    // ---- piirto ----
    function computeView() {
      var sxp = w / 2, syp = headUp ? h * (0.5 + OFFSET_FRAC) : h / 2;
      var mpp = rangeNm * NM / Math.max(200, h), cl = Math.cos(S.lat * RAD), s = cl / mpp;
      var th = headUp ? S.hdgTrue * RAD : 0, cs = Math.cos(th), sn = Math.sin(th);
      var a = s * cs, b = -s * sn, c = -s * sn, d = -s * cs;
      view.a = a; view.b = b; view.c = c; view.d = d; view.s = s; view.sx = sxp; view.sy = syp;
      view.e = sxp - a * S.px - c * S.py; view.f = syp - b * S.px - d * S.py;
      view.z = Math.log(156543.03392 * cl / mpp) / Math.LN2; view.mpp = mpp; view.cl = cl;
    }
    function toScreen(X, Y) { return [view.a * X + view.c * Y + view.e, view.b * X + view.d * Y + view.f]; }
    function toPlot(u, v) {      // kuvapiste -> plot-koordinaatit (käänteismuunnos)
      var det = view.a * view.d - view.b * view.c, uu = u - view.e, vv = v - view.f;
      return [(view.d * uu - view.c * vv) / det, (-view.b * uu + view.a * vv) / det];
    }
    function neededTiles() {
      var Zt = Math.max(8, Math.min(16, Math.round(view.z))), T = 2 * PIR / Math.pow(2, Zt), out = [];
      var corners = [toPlot(0, 0), toPlot(w, 0), toPlot(0, h), toPlot(w, h)], xs = corners.map(function (p) { return p[0]; }), ys = corners.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var tx0 = Math.floor((x0 + OX + PIR) / T) - 1, tx1 = Math.floor((x1 + OX + PIR) / T) + 1;
      var ty0 = Math.floor((PIR - (y1 + OY)) / T) - 1, ty1 = Math.floor((PIR - (y0 + OY)) / T) + 1;
      var nmax = Math.pow(2, Zt) - 1, halfDiag = T * view.s * 0.7072, hw = w / 2, hh = h / 2;
      for (var ty = Math.max(0, ty0); ty <= Math.min(nmax, ty1); ty++) for (var tx = Math.max(0, tx0); tx <= Math.min(nmax, tx1); tx++) {
        var cp = toScreen(tx * T + T / 2 - PIR - OX, PIR - ty * T - T / 2 - OY);
        var dx = Math.abs(cp[0] - hw), dy = Math.abs(cp[1] - hh);
        // ruudun keskipiste lähellä näkymää (ylimääräinen rengas ennakkolatausta varten)
        if (dx > hw + halfDiag + T * view.s * 0.9 || dy > hh + halfDiag + T * view.s * 0.9) continue;
        var vis = !(dx > hw + halfDiag || dy > hh + halfDiag);
        out.push({ z: Zt, x: tx, y: ty, T: T, vis: vis, dist: Math.hypot(cp[0] - hw, cp[1] - hh) });
      }
      out.sort(function (p, q) { return p.dist - q.dist; });
      return out;
    }
    function drawTile(e, T) {
      var k = T / BAKE.B, M = BAKE.M;
      var X0 = e.x * T - PIR - OX - M * k, Yt = PIR - e.y * T - OY + M * k;
      var a = view.a, b = view.b, c = view.c, d = view.d;
      ctx.setTransform(DPR * a * k, DPR * b * k, -DPR * c * k, -DPR * d * k, DPR * (a * X0 + c * Yt + view.e), DPR * (b * X0 + d * Yt + view.f));
      ctx.drawImage(e.bm, 0, 0);
    }
    function draw() {
      dirty = false;
      if (!w || !h || !S.has || destroyed) return;
      computeView();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = COL.land; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      // ruudut
      stamp++;
      var need = neededTiles(), drawn = [], fall = [], i, miss = 0, wantQ = [];
      ctx.imageSmoothingQuality = 'medium';
      for (i = 0; i < need.length; i++) {
        var nt = need[i], e = getTile(nt.z, nt.x, nt.y, true);
        e.want = stamp; e.used = stamp;
        if (e.st === 3) { if (nt.vis) drawn.push([e, nt.T]); else e.used = stamp; continue; }
        if (e.st === 0) wantQ.push(e);
        if (!nt.vis || e.st === 4) continue;
        miss++;
        // varaksi tarkempi (lapset) tai karkeampi (vanhemmat) valmis ruutu
        var found = false, q;
        for (q = 1; q <= 3 && !found; q++) {
          var pa = getTile(nt.z - q, nt.x >> q, nt.y >> q, false);
          if (pa && pa.st === 3) { pa.used = stamp; fall.push([pa, 2 * PIR / Math.pow(2, nt.z - q)]); found = true; }
        }
        if (!found && nt.z < 16) {
          for (var cx = 0; cx < 2; cx++) for (var cy = 0; cy < 2; cy++) {
            var ch = getTile(nt.z + 1, nt.x * 2 + cx, nt.y * 2 + cy, false);
            if (ch && ch.st === 3) { ch.used = stamp; fall.push([ch, 2 * PIR / Math.pow(2, nt.z + 1)]); }
          }
        }
      }
      loadQ = wantQ; pump();
      fall.sort(function (p, q) { return p[1] - q[1]; });
      var seen = {};
      for (i = 0; i < fall.length; i++) { if (seen[fall[i][0].key]) continue; seen[fall[i][0].key] = 1; drawTile(fall[i][0], fall[i][1]); }
      for (i = 0; i < drawn.length; i++) drawTile(drawn[i][0], drawn[i][1]);
      readyFlag = miss === 0;
      // päällekkäiset piirrot normaalissa kuvassa
      ctx.setTransform(DPR * view.a, DPR * view.b, DPR * view.c, DPR * view.d, DPR * view.e, DPR * view.f);
      var inv = 1 / view.s;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      drawRouteLayers(inv);
      drawOwnLines(inv);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawSoundings(drawn);
      drawAids();
      drawEV();
      placeOverlay();
    }
    function polyPath(arr) { ctx.beginPath(); for (var i = 0; i < arr.length; i += 2) { if (i) ctx.lineTo(arr[i], arr[i + 1]); else ctx.moveTo(arr[i], arr[i + 1]); } }
    function drawRouteLayers(inv) {
      if (route.pts.length >= 4) { polyPath(route.pts); ctx.strokeStyle = 'rgba(194,24,143,0.85)'; ctx.lineWidth = 4 * inv; ctx.stroke(); }
      route.turns.forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.5 * inv, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#c2188f'; ctx.lineWidth = 1.5 * inv; ctx.stroke();
      });
      if (trail.arr.length >= 4) { polyPath(trail.arr); ctx.strokeStyle = 'rgba(31,78,156,0.8)'; ctx.lineWidth = 2.5 * inv; ctx.stroke(); }
      extraLines.forEach(function (l) {
        if (l.pts.length < 4) return;
        polyPath(l.pts); ctx.strokeStyle = l.style.color || '#000'; ctx.globalAlpha = l.style.opacity == null ? 1 : l.style.opacity; ctx.lineWidth = (l.style.weight || 3) * inv; ctx.stroke(); ctx.globalAlpha = 1;
      });
      if (nextPt) { ctx.beginPath(); ctx.arc(nextPt[0], nextPt[1], 9 * inv, 0, 2 * Math.PI); ctx.strokeStyle = '#c2188f'; ctx.lineWidth = 3 * inv; ctx.stroke(); }
    }
    // heading line ja COG/SOG-vektori (plot-koordinaateissa)
    function drawOwnLines(inv) {
      if (opts.noOwnLines) return;
      var hh = S.hdgTrue * RAD, far = (w + h) * inv * 1.5;
      ctx.beginPath(); ctx.moveTo(S.px, S.py); ctx.lineTo(S.px + Math.sin(hh) * far, S.py + Math.cos(hh) * far);
      ctx.strokeStyle = 'rgba(17,17,17,0.85)'; ctx.lineWidth = 1 * inv; ctx.stroke();
      // COG/SOG-vektori: pituus = nopeus * aika, poikkiviivat minuutin välein, loppupäässä nuoli
      var sec = VEC_SEC[vecIdx], ch = S.cogTrue * RAD, sx = Math.sin(ch), sy = Math.cos(ch), cl = view.cl;
      var len = S.sog * sec / cl;                      // plot-metrejä (Mercator-venymä huomioitu)
      if (len * view.s < 3) return;
      var ex = S.px + sx * len, ey = S.py + sy * len;
      ctx.beginPath(); ctx.moveTo(S.px, S.py); ctx.lineTo(ex, ey); ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.2 * inv; ctx.stroke();
      var nx = -sy, ny = sx, tk = 5 * inv;
      ctx.lineWidth = 1.6 * inv; ctx.beginPath();
      for (var t = 60; t < sec + 1; t += 60) {
        var d = S.sog * t / cl, tx = S.px + sx * d, ty = S.py + sy * d;
        ctx.moveTo(tx - nx * tk, ty - ny * tk); ctx.lineTo(tx + nx * tk, ty + ny * tk);
      }
      ctx.stroke();
      // nuolenkärki
      var ah = 8 * inv; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - sx * ah + nx * ah * 0.45, ey - sy * ah + ny * ah * 0.45); ctx.lineTo(ex - sx * ah - nx * ah * 0.45, ey - sy * ah - ny * ah * 0.45); ctx.closePath();
      ctx.fillStyle = '#e8590c'; ctx.fill();
    }
    function haloText(txt, x, y, font, fill, align) {
      ctx.font = font; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
    }
    function drawSoundings(drawn) {
      if (view.z < 13) return;
      var cellPx = view.z >= 16 ? 30 : 38, list = [], i, j;
      for (i = 0; i < drawn.length; i++) {
        var sn = drawn[i][0].snd;
        for (j = 0; j < sn.length; j++) {
          var p = toScreen(sn[j].X, sn[j].Y);
          if (p[0] < -10 || p[0] > w + 10 || p[1] < -10 || p[1] > h + 10) continue;
          list.push([p[0], p[1], sn[j].d]);
        }
      }
      list.sort(function (p, q) { return p[2] - q[2]; });
      var grid = {}, n = 0;
      for (i = 0; i < list.length && n < 700; i++) {
        var s = list[i], gk = Math.floor(s[0] / cellPx) + ':' + Math.floor(s[1] / cellPx);
        if (grid[gk]) continue; grid[gk] = 1; n++;
        var v = Math.round(s[2] * 10) / 10, ip = Math.floor(v), dec = Math.round((v - ip) * 10);
        var big = 'italic 500 11px ' + FONT, small = 'italic 500 8px ' + FONT;
        ctx.font = big; var wi = ctx.measureText(String(ip)).width, wd = 0, hasDec = dec && v < 31;
        if (hasDec) { ctx.font = small; wd = ctx.measureText(String(dec)).width + 0.5; }
        var x0 = s[0] - (wi + wd) / 2;
        haloText(String(ip), x0, s[1], big, '#222', 'left');
        if (hasDec) haloText(String(dec), x0 + wi + 0.5, s[1] + 3.5, small, '#222', 'left');
      }
    }
    function drawAids() {
      var showNames = rangeNm <= 0.5, i;
      for (i = 0; i < aidList.length; i++) {
        var a = aidList[i], p = toScreen(a.X, a.Y);
        if (p[0] < -40 || p[0] > w + 40 || p[1] < -40 || p[1] > h + 40) continue;
        var s = symImage(a.key, a.make());
        if (s.ok) ctx.drawImage(s.img, p[0] - s.ax, p[1] - s.ay, s.w, s.h);
        if (showNames && a.nimi) haloText(a.nimi, p[0] + (s.w - s.ax) + 3, p[1], '600 11px ' + FONT, '#10294a', 'left');
      }
    }
    // EBL, VRM ja niiden leikkauspiste
    function drawEV() {
      if (!evOn) return;
      var sx = view.sx, sy = view.sy, eb = (ebl - (headUp ? S.hdgTrue : 0)) * RAD, dx = Math.sin(eb), dy = -Math.cos(eb);
      var far = (w + h) * 1.5;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * far, sy + dy * far); ctx.strokeStyle = '#0a84c8'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
      var r = vrm * NM / view.mpp;
      if (r > 2 && r < 20000) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI); ctx.strokeStyle = '#b27d00'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
      var cx = sx + dx * r, cy = sy + dy * r;
      if (r > 2 && r < 20000) {
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 6, cy + 6); ctx.moveTo(cx - 6, cy + 6); ctx.lineTo(cx + 6, cy - 6);
        ctx.strokeStyle = '#7a1fa2'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.lineCap = 'round';
    }
    // DOM: oma alus, lisämerkit, lukemat
    function placeOverlay() {
      if (own) {
        own.style.left = view.sx + 'px'; own.style.top = view.sy + 'px';
        own.style.transform = 'translate(-50%,-50%) rotate(' + (headUp ? 0 : S.hdgTrue).toFixed(1) + 'deg)';
      }
      for (var i = 0; i < extraPts.length; i++) {
        var q = extraPts[i], p = toScreen(q.X, q.Y);
        q.el.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px)';
      }
    }
    function updateReadouts() {
      var info = container.parentNode && container.parentNode.querySelector('.plot-info');
      if (!info || !interactive) return;
      var el = info.querySelector('.ro-ebl'), vr = info.querySelector('.ro-vrm'), vb = info.querySelector('.ro-vec'), tg = info.querySelector('.ro-tgl');
      if (el) { el.hidden = !evOn; el.textContent = 'EBL ' + pad3(ebl) + '° T'; }
      if (vr) { vr.hidden = !evOn; vr.textContent = 'VRM ' + fnum(vrm, 2) + ' mpk'; }
      if (vb) vb.textContent = 'Vektori ' + (VEC_SEC[vecIdx] < 60 ? VEC_SEC[vecIdx] + ' s' : VEC_SEC[vecIdx] / 60 + ' min');
      if (tg) tg.setAttribute('aria-pressed', evOn ? 'true' : 'false');
    }

    // ---- tila ----
    function update(x, y, hdg, cog, sog) {
      if (!w) resize();
      if (!w) return;
      S.x = x; S.y = y; S.hdg = hdg; S.cog = cog == null ? hdg : cog; S.sog = sog || 0;
      S.hdgTrue = P.gridToTrue(hdg, x, y); S.cogTrue = P.gridToTrue(S.cog, x, y);
      var p = worldToPlot(x, y); S.px = p[0]; S.py = p[1]; S.lat = p[2]; S.has = true;
      draw();
      return view;
    }
    function ready() { return !w || !S.has || readyFlag; }
    function cvt(pts) { var a = new Float64Array(pts.length * 2); for (var i = 0; i < pts.length; i++) { var p = worldToPlot(pts[i].x, pts[i].y); a[2 * i] = p[0]; a[2 * i + 1] = p[1]; } return a; }
    function setRoute(pts, turnPts) {
      route.pts = cvt(pts); route.turns = (turnPts || []).map(function (p) { var q = worldToPlot(p.x, p.y); return [q[0], q[1]]; }); dirty = true;
    }
    function setNext(p) { if (!p) { nextPt = null; return; } var q = worldToPlot(p.x, p.y); nextPt = [q[0], q[1]]; }
    function setTrail(pts) {
      if (!pts || !pts.length) { trail = { src: null, n: 0, arr: [] }; return; }
      if (trail.src === pts[0] && pts.length >= trail.n) {
        var add = pts.slice(trail.n), ex = cvt(add), na = new Float64Array(trail.arr.length + ex.length); na.set(trail.arr); na.set(ex, trail.arr.length); trail.arr = na;
      } else trail.arr = cvt(pts);
      trail.src = pts[0]; trail.n = pts.length;
    }
    function clearExtra() { extraLines = []; extraPts.forEach(function (q) { if (q.el.parentNode) q.el.parentNode.removeChild(q.el); }); extraPts = []; dirty = true; }
    function addExtraLine(pts, style) { var l = { pts: cvt(pts), style: style || {} }; extraLines.push(l); dirty = true; return l; }
    function addExtraPoint(p, html, cls) {
      var q = worldToPlot(p.x, p.y), el = document.createElement('div');
      el.className = cls || 'plot-pin'; el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:5'; el.innerHTML = html || '';
      overlay.appendChild(el); var it = { X: q[0], Y: q[1], el: el }; extraPts.push(it); dirty = true; return it;
    }
    function syncAids(x, y, force) {
      var now = Date.now();
      if (!force && now - lastAidSync < 800) return;
      lastAidSync = now;
      var M = root.Merkit;
      if (!root.ChartSymbols || !M) return;
      var rad = rangeNm * NM * 1.1 + 200, list = M.near(x, y, rad);
      aidList = list.map(function (a) { var q = worldToPlot(a.x, a.y), sk = symbolFor(a); return { X: q[0], Y: q[1], key: sk[0], make: sk[1], nimi: a.nimi || '' }; });
    }
    function setRasterVisible(on) {
      on = !!on; if (on === rasterMode) return;
      rasterMode = on; dirty = true; notify();
    }
    function redraw() { dirty = true; if (S.has) draw(); }
    function rebase() { aidList = []; lastAidSync = 0; trail = { src: null, n: 0, arr: [] }; }
    function setHeadUp(on) { if (opts.fixedHeadUp) return; headUp = !!on; if (S.has) draw(); }

    // ---- EBL, VRM ja vektori ----
    var logT = {};
    function logLater(kind) {
      if (!onEV) return;
      clearTimeout(logT[kind]);
      logT[kind] = setTimeout(function () { onEV(kind, kind === 'ebl' ? Math.round(ebl) : Math.round(vrm * 100) / 100); }, 500);
    }
    function setEBL(deg, silent) { ebl = norm360(Number(deg)); if (!silent) logLater('ebl'); updateReadouts(); if (S.has) draw(); }
    function setVRM(nm, silent) { vrm = Math.max(0.01, Math.min(6, Number(nm))); if (!silent) logLater('vrm'); updateReadouts(); if (S.has) draw(); }
    function stepEBL(d) { setEBL(ebl + d); }
    function scaleVRM(f) { setVRM(vrm * f); }
    function setEV(on, silent) { on = !!on; if (on === evOn) return; evOn = on; updateReadouts(); if (S.has) draw(); if (!silent && opts.onToggle) opts.onToggle('eblvrm', on); }
    function setVecIdx(i) { vecIdx = ((i % VEC_SEC.length) + VEC_SEC.length) % VEC_SEC.length; updateReadouts(); if (S.has) draw(); }
    function cycleVec() { setVecIdx(vecIdx + 1); return VEC_SEC[vecIdx]; }

    if (interactive) {
      var ptrs = new Map(), gest = null;
      var bearingOf = function (ev) {
        var rc = canvas.getBoundingClientRect(), x = ev.clientX - rc.left - view.sx, y = ev.clientY - rc.top - view.sy;
        return norm360(Math.atan2(x, -y) / RAD + (headUp ? S.hdgTrue : 0));
      };
      canvas.addEventListener('pointerdown', function (ev) {
        if (!evOn || (ev.button != null && ev.button > 0)) return;
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
        ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (ptrs.size === 1) { gest = { mode: 'ebl', ebl0: ebl }; setEBL(bearingOf(ev)); }
        else if (ptrs.size === 2) {
          var ps = Array.from(ptrs.values()); setEBL(gest ? gest.ebl0 : ebl, true);
          gest = { mode: 'vrm', d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), vrm0: vrm, ebl0: ebl };
        }
        ev.preventDefault();
      });
      canvas.addEventListener('pointermove', function (ev) {
        if (!ptrs.has(ev.pointerId)) return;
        ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (gest && gest.mode === 'ebl' && ptrs.size === 1) setEBL(bearingOf(ev));
        else if (gest && gest.mode === 'vrm' && ptrs.size >= 2) {
          var ps = Array.from(ptrs.values()), d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
          if (gest.d0 > 8) setVRM(gest.vrm0 * d / gest.d0);
        }
        ev.preventDefault();
      });
      var up = function (ev) {
        ptrs.delete(ev.pointerId);
        try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
        if (ptrs.size === 0) gest = null; else if (ptrs.size === 1) gest = { mode: 'jaa', ebl0: ebl };
      };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', function (ev) { if (!evOn) return; ev.preventDefault(); scaleVRM(ev.deltaY < 0 ? 1.06 : 1 / 1.06); }, { passive: false });
      var info = container.parentNode && container.parentNode.querySelector('.plot-info');
      if (info) {
        var tg = info.querySelector('.ro-tgl'), vb = info.querySelector('.ro-vec');
        if (tg) tg.addEventListener('click', function () { setEV(!evOn); });
        if (vb) vb.addEventListener('click', function () { cycleVec(); });
      }
      updateReadouts();
    }
    function destroy() { destroyed = true; var i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); }

    return {
      update: update, resize: resize, setRangeNm: setRangeNm, getRangeNm: getRangeNm, setRoute: setRoute, setNext: setNext,
      setTrail: setTrail, syncAids: syncAids, clearExtra: clearExtra, addExtraLine: addExtraLine, addExtraPoint: addExtraPoint,
      setRasterVisible: setRasterVisible, isRaster: function () { return rasterMode; }, redraw: redraw, rebase: rebase, ready: ready,
      setHeadUp: setHeadUp, isHeadUp: function () { return headUp; },
      heading: function () { return S.hdgTrue; },
      setEBL: setEBL, setVRM: setVRM, stepEBL: stepEBL, scaleVRM: scaleVRM, setEV: setEV, getEV: function () { return { on: evOn, ebl: ebl, vrm: vrm }; },
      setVectorIdx: setVecIdx, getVecIdx: function () { return vecIdx; }, cycleVector: cycleVec, vectorSec: function () { return VEC_SEC[vecIdx]; },
      toScreen: function (x, y) { var p = worldToPlot(x, y); return toScreen(p[0], p[1]); },
      canvas: canvas, destroy: destroy, view: function () { return { z: view.z, mpp: view.mpp, sx: view.sx, sy: view.sy, w: w, h: h }; },
      cacheInfo: function () { var n = 0, r = 0; TILES.forEach(function (e) { n++; if (e.st === 3) r++; }); return { tiles: n, ready: r, max: MAXT, B: BAKE.B }; }
    };
  }

  var api = { create: create, OFFSET_FRAC: OFFSET_FRAC, SHALLOW_M: SHALLOW_M, COL: COL, VEC_SEC: VEC_SEC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Plotteri = api;
})(typeof window !== 'undefined' ? window : globalThis);
