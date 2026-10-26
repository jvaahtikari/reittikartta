/* Simulaattori – sovellus: aloitusnäyttö, näkymät, komennot, harjoitus ja purku.
 *
 * Yksi simulaation tila (Liike.create), kolme näkymää (plotteri, tutka ja kuljettajan näkymä). Puhelimessa yksi mittari (plotteri tai tutka)
 * ja kuljettajan näkymä vaihtavat päänäkymää napilla, tutka ja plotteri vaihtuvat toisiinsa mittarin omalla napilla. Leveällä näytöllä (vähintään
 * 1024 px) mittari ja 3D ovat rinnakkain, ja vähintään 1440 px leveällä näytöllä plotteri, 3D ja tutka ovat kolmena ruutuna.
 * Simulaatio etenee 0,1 s:n kiinteillä askelilla, joten tallenne ja automaattiohjaus ovat samat nopeutuksesta riippumatta.
 * URL-parametrit (kehitys ja testit): aineisto (paketin osoite), harjoitus (h1, free, rk1, rk2 ... tai Reittikartan reitin tunniste), suunta=kaanteinen (lähtö viimeisestä pisteestä), auto (automaattiohjauksen tavoitenopeus kn),
 * ff (aikakerroin), t (alkuhetki ISO-muodossa), nopeus (tavoitenopeus), naytot (plot, radar tai both), alku=1 (ohita aloitusnäyttö). */
(function (root) {
  'use strict';
  var P = root.Paikka, L = root.Liike, H = root.Harjoitus, KN = L.KN, RAD = Math.PI / 180;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  var qs = new URLSearchParams(location.search);
  var cfgBase = qs.get('aineisto');
  root.Aineisto.setBase(cfgBase || root.Aineisto.DEFAULT_URL);

  var G = {
    S: null, view: null, pl: null, route: null, auto: null, rec: null, mode: 'start', main: 'plot', origin: { e: 0, n: 0 },
    ex: 'h1', dir: 'fwd', stored: [], showRk: { legBrg: true, turnTicks: true }, budgetKn: 30, targetKn: 30, eye: 'nav', clockMode: 'custom', clockStr: '12:00', dateStr: '', running: false, frozen: false, acc: 0, lastT: 0,
    plotterOn: true, lastPlotT: 0, lastTrailT: 0, trail: [], gazeKey: 0, lastMerkitLoad: { x: 1e9, y: 1e9 }, lastVis: -1e9,
    speedSteps: [1, 2, 5, 10], speedIdx: 0, seated: false, ground: null, lastConvT: -1e9, loadedLandmarks: false, ready: false,
    layout: { land: false, wide: false, tri: false, tp: false }, fwKnown: 0, lastPohjaT: 0, endTimer: null, dbPl: null, budgetSec: null, finishedAt: null,
    // mittarit: disp = aloitusvalinta (plot, radar, both), instr = näytettävä mittari (plot, radar, both = kolme ruutua)
    disp: 'plot', instr: 'plot', plotShown: true, radar: null, radarOpt: null, radarOn: true, radarShown: false, radarMain: false, radarReady: true,
    collision: null, collMs: { n: 0, sum: 0, max: 0 }, lastTorE: 1e9, lastTorN: 1e9,
    lastRadarT: 0, radarSec: 0, radarMainSec: 0, northUp: false, raster: false, radarTune: 'hyva', vecIdx: 1, fovDeg: 100, evOn: true, lastTapT: 0
  };
  root.__sim = G;

  // ---------- asetukset (selaimen muisti, vain mukavuus) ----------
  function loadPrefs() {
    try {
      var o = JSON.parse(localStorage.getItem('sim.asetukset') || '{}');
      if (o.northUp != null) G.northUp = !!o.northUp; if (o.raster != null) G.raster = !!o.raster;
      if (o.vecIdx != null) G.vecIdx = Math.max(0, Math.min(3, o.vecIdx | 0)); if (o.fovDeg) G.fovDeg = Number(o.fovDeg);
      if (o.evOn != null) G.evOn = !!o.evOn;
      if (o.radarTune === 'hyva' || o.radarTune === 'huono') G.radarTune = o.radarTune;
    } catch (e) {}
  }
  function savePrefs() {
    try { localStorage.setItem('sim.asetukset', JSON.stringify({ northUp: G.northUp, raster: G.raster, vecIdx: G.vecIdx, fovDeg: G.fovDeg, evOn: G.evOn, radarTune: G.radarTune })); } catch (e) {}
  }
  loadPrefs();

  // ---------- apuja ----------
  function two(n) { return (n < 10 ? '0' : '') + n; }
  var fmtClock = (function () {
    try {
      var f = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return function (ms) { return f.format(new Date(ms)); };
    } catch (e) { return function (ms) { var d = new Date(ms); return two(d.getHours()) + '.' + two(d.getMinutes()) + '.' + two(d.getSeconds()); }; }
  })();
  function fnum(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','); }
  function pad3(n) { n = Math.round(n); return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function helsinkiOffsetMin(ms) {
    try {
      var s = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Helsinki', timeZoneName: 'shortOffset' }).format(new Date(ms)), m = /GMT([+-]\d+)/.exec(s);
      return m ? Number(m[1]) * 60 : 120;
    } catch (e) { return 120; }
  }

  // ---------- aloitusnäyttö ----------
  function segInit(id, cb) {
    var seg = $(id);
    seg.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      Array.prototype.forEach.call(seg.children, function (c) { c.classList.toggle('on', c === b); });
      cb(b.getAttribute('data-v'));
    });
  }
  // Reittikartan reitit (localStorage reittikartta.v1) luetaan aloitusnäytön avautuessa ja aina, kun toinen välilehti muuttaa niitä.
  function refreshStored() {
    G.stored = H.listStored(); G.showRk = H.storedShow();
    if (G.ex !== 'h1' && G.ex !== 'free' && !G.stored.some(function (x) { return x.id === G.ex; })) G.ex = 'h1';
    renderExList();
  }
  function statusText(ex) { return ex.status === 'approved' ? 'hyväksytty' : 'luonnos'; }
  function renderExList() {
    var seg = $('segEx'), freeBtn = seg.querySelector('button[data-v="free"]');
    Array.prototype.slice.call(seg.querySelectorAll('button[data-rk]')).forEach(function (b) { seg.removeChild(b); });
    G.stored.forEach(function (ex) {
      var b = doc.createElement('button'), sm = doc.createElement('small');
      b.type = 'button'; b.setAttribute('data-v', ex.id); b.setAttribute('data-rk', '1');
      b.appendChild(doc.createTextNode(ex.nimi));
      sm.textContent = statusText(ex) + ' · ' + fnum(ex.lengthM / 1852, 2) + ' mpk · ' + ex.pisteita + ' pistettä';
      b.appendChild(sm); seg.insertBefore(b, freeBtn);
    });
    Array.prototype.forEach.call(seg.children, function (c) { c.classList.toggle('on', c.getAttribute('data-v') === G.ex); });
    var hint = $('routeHint');
    hint.textContent = '';
    var a = doc.createElement('a'); a.href = 'index.html'; a.id = 'rkLink';
    if (G.stored.length) { hint.appendChild(doc.createTextNode('Reitit ovat Reittikartasta. ')); a.textContent = 'Avaa Reittikartta'; hint.appendChild(a); }
    else { hint.appendChild(doc.createTextNode('Tallennettuja reittejä ei löytynyt. ')); a.textContent = 'Suunnittele reitti Reittikartassa'; hint.appendChild(a); hint.appendChild(doc.createTextNode('.')); }
    updateBudgetHint();
  }
  // Valittu reitti (null = vapaa ajo), käänteisenä, jos lähtö on viimeisestä pisteestä
  function currentEx() {
    if (G.ex === 'free') return null;
    var ex = G.ex === 'h1' ? H.EXERCISES.h1 : (G.stored.filter(function (x) { return x.id === G.ex; })[0] || H.EXERCISES.h1);
    return G.dir === 'rev' ? H.reversed(ex) : ex;
  }
  function updateBudgetHint() {
    var h = $('budgetHint'), info = $('exInfo'), ex = currentEx();
    $('fldDir').hidden = !ex; $('fldSpeed').hidden = !(ex && ex.builtin);
    if (!ex) { h.textContent = ''; info.textContent = 'Alus lähtee Mustalahdesta levosta, ei reittiä. Purku näyttää ajetun matkan, nopeudet, komennot ja etäisyydet rantaan ja matalikkoon.'; return; }
    var rt = H.buildRoute(ex), sec = rt.total / (G.targetKn * KN);
    if (ex.builtin) { info.textContent = ''; h.textContent = 'Reitti ' + fnum(rt.total / 1852, 1) + ' mpk. Aikabudjetti ' + H.mmss(sec) + ' (' + G.targetKn + ' kn koko matkan).'; }
    else {
      h.textContent = '';
      info.textContent = 'Reitti ' + fnum(rt.total / 1852, 2) + ' mpk, ' + rt.pts.length + ' pistettä, ' + rt.turns.length + ' käännöstä. Lähtönopeus ' + fnum(ex.startKn, 0) + ' kn (' + (ex.speedFromRoute ? 'reitin nopeus' : 'oletus') + '), aikabudjetti ' + H.mmss(rt.total / (ex.startKn * KN)) + '.';
    }
  }
  function updateDispHint() {
    var h = { plot: 'Plotteri ja kuljettajan näkymä.', radar: 'Tutka ja kuljettajan näkymä, ei plotteria.', both: 'Plotteri ja tutka. Puhelimessa mittari vaihtuu napilla, vähintään 1440 px leveällä näytöllä kaikki kolme ovat rinnakkain.' };
    $('dispHint').textContent = h[G.disp] || '';
  }
  function todayHelsinki() {
    try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { var d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  }
  // Valitun hetken aurinko: kellonaika Helsingin aikaa -> UTC
  function customClockMs() {
    var dm = /^(\d{4})-(\d\d)-(\d\d)/.exec(G.dateStr || todayHelsinki()) || [0, 2026, 10, 25], tm = /^(\d\d):(\d\d)/.exec(G.clockStr) || [0, '12', '00'];
    var wall = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0);
    var off = helsinkiOffsetMin(wall - 2 * 3600000);
    off = helsinkiOffsetMin(wall - off * 60000);
    return wall - off * 60000;
  }
  function updateClockHint() {
    var ms = G.clockMode === 'real' ? Date.now() : customClockMs(), el = $('clockHint');
    var sun = root.Nakyma.sunPosition(ms, 61.5, 23.77), night = sun.elevDeg < -0.8;
    $('clockRow').hidden = G.clockMode === 'real';
    el.classList.toggle('start-night', night);
    if (night) {
      var hr = new Date(ms + helsinkiOffsetMin(ms) * 60000).getUTCHours(), after = hr >= 12;
      el.textContent = (after ? 'Valittu aika on auringonlaskun jälkeen. ' : 'Valittu aika on ennen auringonnousua. ') + 'Yönäkymä tulee myöhemmässä vaiheessa, ja näkymä on tumma.';
    } else el.textContent = 'Päivänäkymä. Auringon korkeus ' + Math.round(sun.elevDeg) + '°.';
  }
  function initStart() {
    segInit('segEx', function (v) { G.ex = v; updateBudgetHint(); });
    segInit('segDir', function (v) { G.dir = v; updateBudgetHint(); });
    refreshStored();
    root.addEventListener('storage', function (e) { if (G.mode === 'start' && (!e.key || e.key === H.STORE_KEY)) refreshStored(); });
    root.addEventListener('focus', function () { if (G.mode === 'start') refreshStored(); }); root.addEventListener('pageshow', function () { if (G.mode === 'start') refreshStored(); });
    segInit('segSpeed', function (v) { G.targetKn = Number(v); updateBudgetHint(); });
    segInit('segEye', function (v) { G.eye = v; });
    segInit('segDisp', function (v) { G.disp = v; updateDispHint(); });
    G.dateStr = todayHelsinki(); $('dateIn').value = G.dateStr;
    segInit('segClock', function (v) { G.clockMode = v; updateClockHint(); });
    $('clockIn').addEventListener('input', function () { G.clockStr = $('clockIn').value || '12:00'; updateClockHint(); });
    $('dateIn').addEventListener('input', function () { G.dateStr = $('dateIn').value || todayHelsinki(); updateClockHint(); });
    updateClockHint();
    $('startBtn').addEventListener('click', startRun);
    var dq = qs.get('naytot');
    if (dq === 'plot' || dq === 'radar' || dq === 'both') {
      G.disp = dq;
      Array.prototype.forEach.call($('segDisp').children, function (c) { c.classList.toggle('on', c.getAttribute('data-v') === dq); });
    }
    updateDispHint();
    root.Aineisto.meta().then(function (m) { if (m && m.lahdemerkinta_yhteensa) $('srcText').textContent = m.lahdemerkinta_yhteensa; }, function () {});
  }

  // ---------- peli: rakennus ----------
  function ensureViews() {
    if (G.view) return;
    G.pl = root.Plotteri.create($('plot'), { headUp: !G.northUp, onEV: onEV, onToggle: function (k, v) { G.evOn = v; savePrefs(); if (G.S) logCustom(k, v ? 1 : 0); } });
    G.pl.setRasterVisible(G.raster); G.pl.setVectorIdx(G.vecIdx); G.pl.setEV(G.evOn, true);
    G.view = root.Nakyma.create($('v3'), { preserve: !!qs.get('preserve'), settings: { hfovDeg: G.fovDeg } });
    root.__view = G.view; root.__pl = G.pl;
    G.bridges = root.Sillat3D ? root.Sillat3D.attach(G.view) : null;   // sillat (vaihe 3i): piirto joka kuvalla view.render-kutsun yhteydessä, rebase addExtra-kautta
    new ResizeObserver(function () { layout(); }).observe($('stage'));
    new ResizeObserver(function () { sizeViews(); }).observe($('pane3d'));
    root.addEventListener('resize', layout);
    root.addEventListener('orientationchange', function () { setTimeout(layout, 200); });
  }
  // Asettelut: puhelin (yksi päänäkymä ja pieni ikkuna), puhelimen vaaka-asento (komennot oikealla) ja leveä asettelu (deck):
  // vähintään 1024 px leveä vaaka-asento tai tabletti pystyasennossa (leveys vähintään 700 px). Deckissä ulkonäkymä on ylhäällä
  // koko leveydeltä noin 60 % korkeudesta ja alla rivissä plotteri, tutka ja komentopalsta (tabletilla pystyssä komennot rivin alla).
  function layout() {
    var g = $('game'), vw = root.innerWidth, vh = root.innerHeight;
    var land = vw > vh * 1.1 && vw >= 640;
    var deck = land ? vw >= 1024 : vw >= 700;
    var tp = deck && !land;
    g.classList.toggle('land', land && !deck); g.classList.toggle('deck', deck); g.classList.toggle('tp', tp);
    G.layout.land = land; G.layout.wide = deck; G.layout.tp = tp; G.layout.tri = false;
    applyPanes();
    sizeViews();
  }
  // Mittarin tila: aloitusvalinta rajaa vaihtoehdot. Kolme ruutua (both) kelpaa vain, kun leveys riittää.
  function resolveInstr() {
    if (G.disp === 'plot') G.instr = 'plot';
    else if (G.disp === 'radar') G.instr = 'radar';
    else if (G.layout.wide) G.instr = 'both';
    else if (G.instr === 'both') G.instr = 'plot';
    return G.instr;
  }
  function nextInstr() {
    if (G.disp !== 'both') return G.instr;
    if (G.instr === 'plot') return 'radar';
    return 'plot';
  }
  // Plotterin ja tutkan yhteiset näppäimet (, . [ ] + - O): tutka saa ne, kun vain tutka on näkyvissä tai viimeksi käytetty ruutu oli tutka. O on vain tutkan.
  G.keyTarget = 'plot';
  function radarKeyTarget() { return !!G.radar && G.radarShown && (!G.plotShown || G.keyTarget === 'radar'); }
  function updateInstrButtons() {
    var n = nextInstr(), label = n === 'radar' ? 'Tutka' : n === 'both' ? 'Molemmat' : 'Plotteri', show = G.disp === 'both';
    var ib = $('instrBtn'); ib.hidden = !show || G.layout.wide; if (ib.textContent !== label) ib.textContent = label; ib.setAttribute('aria-label', 'Näytä ' + label.toLowerCase());
  }
  function applyPanes() {
    var st = resolveInstr(), wide = G.layout.wide;
    var pp = $('paneP'), pr = $('paneR'), p3 = $('pane3d'), sw = $('swapBtn');
    var showP = st !== 'radar', showR = st !== 'plot';
    $('game').classList.toggle('r2', wide && st === 'both');
    pp.hidden = !showP; pr.hidden = !showR;
    var ip = showR && !showP ? pr : pp;               // yhden mittarin tilassa mittarin ruutu
    var instrMain = G.main === 'plot';                // mittari (plotteri tai tutka) päänäkymänä
    [pp, pr].forEach(function (pane) {
      var mine = wide || pane === ip;
      pane.classList.toggle('main', !wide && mine && instrMain); pane.classList.toggle('small', !wide && mine && !instrMain);
      pane.style.zIndex = wide || (mine && instrMain) ? 1 : 30;
    });
    p3.classList.toggle('main', !wide && !instrMain); p3.classList.toggle('small', !wide && instrMain);
    p3.style.zIndex = wide || !instrMain ? 1 : 30;
    // vaaka-asennon puhelimessa tutkan napit ovat oikeassa reunassa, joten pieni 3D-ikkuna siirretään vasempaan alakulmaan
    p3.classList.toggle('bl', !wide && instrMain && ip === pr && G.layout.land);
    // vaihtopainike peittää pienen ikkunan
    sw.hidden = wide;
    if (!wide) {
      var small = instrMain ? p3 : ip, r = small.getBoundingClientRect(), s = $('stage').getBoundingClientRect();
      sw.style.left = (r.left - s.left) + 'px'; sw.style.top = (r.top - s.top) + 'px'; sw.style.width = r.width + 'px'; sw.style.height = r.height + 'px';
    }
    // tutkan kuva täyttää ruudun, napit ovat sen päällä
    var radarSmall = showR && !wide && !instrMain;
    G.plotShown = showP; G.radarShown = showR; G.radarMain = showR && !radarSmall;
    updateInstrButtons();
    updateRadarReserve();
    $('gazeBtn').hidden = !(wide || !instrMain) || Math.abs(G.view ? G.view.getGaze() : 0) < 1;
    if (G.view && G.view.isBino() && !(wide || !instrMain)) setBino(false);   // kiikari vain, kun 3D on päänäkymä
  }
  // pieni 3D-ikkuna peittää osan tutkan kuvasta: tutka siirtää peittyvät lukemat ikkunan viereen
  function updateRadarReserve() {
    if (!G.radar) return;
    var p3 = $('pane3d'), cv = $('radar'), v = null;
    if (!G.layout.wide && p3.classList.contains('small') && G.radarShown) {
      var a = p3.getBoundingClientRect(), c = cv.getBoundingClientRect();
      v = { l: a.left - c.left, t: a.top - c.top, r: a.right - c.left, b: a.bottom - c.top };
    }
    G.radar.asetaVaraus(v);
  }
  function sizeViews() {
    if (!G.view) return;
    setTimeout(updateRadarReserve, 0);
    var p3 = $('pane3d'), r = p3.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) G.view.setSize(Math.round(r.width), Math.round(r.height), !G.layout.wide && $('pane3d').classList.contains('small'));
    if (G.plotShown) { G.pl.resize(); if (G.trail) G.pl.setTrail(G.trail); }
    if (G.view.isBino()) drawBinoMask();
    G.lastPlotT = 0;
  }
  function swapViews() {
    if (G.layout.wide) return;
    G.main = G.main === 'plot' ? '3d' : 'plot';
    applyPanes(); sizeViews();
  }
  // Mittarin vaihto: plotteri, tutka ja (leveällä näytöllä) molemmat
  function cycleInstr() {
    if (G.disp !== 'both') return;
    G.instr = nextInstr();
    applyPanes(); sizeViews();
  }

  // ---------- peli: aloitus ----------
  function startClockMs() {
    if (qs.get('t')) return Date.parse(qs.get('t'));
    if (G.clockMode === 'real') return Date.now();
    return customClockMs();
  }
  function setLoad(p, text) { $('loadBar').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; }

  // Reitin lyhyt tunniste URL-parametrista: h1, free, rk1 (Reittikartan ensimmäinen reitti) tai reitin oma tunniste
  function exFromParam(v) {
    if (!v) return null;
    if (v === 'h1' || v === 'free') return v;
    var m = /^rk(\d+)$/.exec(v);
    if (m && G.stored[Number(m[1]) - 1]) return G.stored[Number(m[1]) - 1].id;
    var id = v.indexOf('rk:') === 0 ? v : 'rk:' + v;
    return G.stored.some(function (x) { return x.id === id; }) ? id : null;
  }
  // Tavoitenopeus ja lähtönopeus: sisäänrakennettu harjoitus alkaa levosta, tallennettu reitti ja vapaa ajo kulussa (reitin nopeus tai 12 kn, vapaassa ajossa auto-parametrin nopeus)
  function startSpeedKn(ex) {
    var auto = Number(qs.get('auto')) > 0 ? Number(qs.get('auto')) : 0;
    if (!ex) return auto;
    if (ex.builtin) return 0;
    return auto > 0 ? auto : ex.startKn;
  }
  function startRun() {
    refreshStored();
    G.ex = exFromParam(qs.get('harjoitus')) || G.ex;
    if (qs.get('suunta')) G.dir = qs.get('suunta') === 'kaanteinen' ? 'rev' : 'fwd';
    if (qs.get('nopeus')) G.targetKn = Number(qs.get('nopeus'));
    $('start').hidden = true; $('debrief').hidden = true; $('game').hidden = false; $('loading').hidden = false;
    G.mode = 'loading'; G.ready = false; G.frozen = false; G.ground = null; G.finishedAt = null;
    if (G.paused) { G.paused = false; $('pauseIco').innerHTML = '<path d="M7 5v14M17 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'; }
    $('groundBanner').hidden = true;
    ensureViews();
    var ex = currentEx();
    G.route = ex ? H.buildRoute(ex) : null;
    G.budgetKn = ex && !ex.builtin ? startSpeedKn(ex) : G.targetKn;
    // maailmakoordinaatiston origo: harjoituksessa reitin keskipiste, vapaassa ajossa Mustalahti
    if (G.route) {
      var es = G.route.pts.map(function (p) { return p.e; }), ns = G.route.pts.map(function (p) { return p.n; });
      G.origin.e = Math.round((Math.min.apply(null, es) + Math.max.apply(null, es)) / 2); G.origin.n = Math.round((Math.min.apply(null, ns) + Math.max.apply(null, ns)) / 2);
    } else { G.origin.e = 327184; G.origin.n = 6823553; }
    P.setOrigin(G.origin.e, G.origin.n);
    root.Merkit.clear(); root.Pohja.clear(); root.Tormays.clear();
    root.Tormays.setBridgeSource(function () { return G.bridges ? G.bridges.spans() : null; });
    G.collision = null; G.collMs = { n: 0, sum: 0, max: 0 }; G.lastTorE = G.lastTorN = 1e9; $('groundGo').hidden = true; $('groundTitle').textContent = 'Pohjakosketus';
    var st = G.route ? { e: G.route.pts[0].e, n: G.route.pts[0].n, brg: G.route.legs[0].brg } : { e: 327184, n: 6823553, brg: 350 };
    var w0 = P.enToWorld(st.e, st.n), ll = P.worldToLonLat(w0.x, w0.y), conv = P.convergenceDeg(ll.lon, ll.lat);
    G.S = L.create({ x: w0.x, y: w0.y, hdg: st.brg, conv: conv, clockMs: startClockMs() });
    G.S.speedFactor = 1; G.speedIdx = 0; $('speedBtn').textContent = '1×';
    if (qs.get('ff')) { var ff = Number(qs.get('ff')); G.S.speedFactor = ff; G.speedIdx = Math.max(0, G.speedSteps.indexOf(ff)); $('speedBtn').textContent = ff + '×'; }
    var sk = startSpeedKn(ex);
    if (sk > 0) H.settleSpeed(G.S, sk);
    G.rec = H.createRecorder(G.route, G.origin);       // reitti on valinnainen: vapaassa ajossa tallenne ja purku toimivat ilman reittiä
    G.rec.t0 = 0;
    G.auto = qs.get('auto') ? H.createAuto(G.route, Number(qs.get('auto')), G.origin) : null;
    G.plotterOn = true; $('plotOff').hidden = true; G.trail = []; G.acc = 0; G.lastVis = -1e9; G.lastConvT = -1e9; G.lastPohjaT = 0;
    G.view.setSimTime(G.S.clockMs);
    G.view.setEye(6.1, G.eye === 'helm' ? G.view.settings.helmEyeY : -0.75);
    G.view.setGaze(0); if (G.view.isBino()) { G.view.setBinoculars(false); binoUi(false); }
    $('exName').textContent = G.route ? G.route.nimi + (G.route.kuvaus ? ': ' + G.route.kuvaus : '') + (G.route.reverse ? ' (käänteinen)' : '') : 'Vapaa ajo, Mustalahti';
    setPlotterRoute(G.pl, G.route);
    G.pl.setTrail([]); G.pl.clearExtra();
    G.pl.setRangeNm(1); G.pl.recenter();      // ajo alkaa aina seurannassa ja 1 mpk korkeudella, zoomia ja seurantaa ei tallenneta
    G.main = 'plot'; G.instr = G.disp === 'radar' ? 'radar' : 'plot'; layout();
    G.pl.setHeadUp(!G.northUp); G.pl.setRasterVisible(G.raster); G.view.setHfov(G.fovDeg);
    updateMenuLabels();
    setupRadar();
    // kokonaiskuormitus: maamerkit, turvalaitteet, maasto
    // maasto rakennetaan vasta, kun maamerkit ja turvalaitteet on luettu (latvuskerros jätetään majakoiden ja maamerkkien ympäriltä pois)
    G.view.terrain.setGate(true);
    var gateN = 2; function gateDone() { if (--gateN === 0) G.view.terrain.setGate(false); }
    root.Aineisto.maamerkit().then(function (d) { G.view.landmarks.build(d); G.view.terrain.setFlatten(G.view.landmarks.flatten()); G.loadedLandmarks = true; gateDone(); }, gateDone);
    root.Merkit.load(G.S.x, G.S.y, 2200).then(function () { G.view.aids.sync(G.S.x, G.S.y, true); G.pl.syncAids(G.S.x, G.S.y, true); G.lastMerkitLoad = { x: G.S.x, y: G.S.y }; gateDone(); }, gateDone);
    root.Pohja.preload(G.S.x, G.S.y, 900);
    root.Tormays.preload(G.S.x, G.S.y, root.Tormays.RADIUS);
    G.view.rebase(); G.pl.rebase();
    G.t0load = performance.now(); G.lastT = performance.now();
    requestAnimationFrame(loop);
  }

  // Reitti plotterille Reittikartan tapaan: reittiviiva ja -pisteet, legin tosisuunta ja matka sekä käännösmerkit (Reittikartan asetusten mukaan)
  function setPlotterRoute(pl, rt) {
    if (!rt) { pl.setRoute([], [], {}); return; }
    var wp = rt.pts.map(function (p) { return P.enToWorld(p.e, p.n); }), legs = [];
    for (var i = 0; i < rt.pts.length - 1; i++) {
      var a = rt.pts[i], b = rt.pts[i + 1], brg, dist;
      if (root.Geo) {
        var la = P.enToLonLat(a.e, a.n), lb = P.enToLonLat(b.e, b.n), rh = root.Geo.rhumb({ lat: la.lat, lng: la.lon }, { lat: lb.lat, lng: lb.lon });
        brg = rh.brg; dist = rh.dist;
      } else { brg = P.gridToTrue(rt.legs[i].brg, wp[i].x, wp[i].y); dist = rt.legs[i].len; }
      legs.push({ a: wp[i], b: wp[i + 1], brg: brg, dist: dist });
    }
    pl.setRoute(wp, rt.turns.map(function (t) { return P.enToWorld(t.e, t.n); }), { legs: legs, legBrg: G.showRk.legBrg, turnTicks: G.showRk.turnTicks, approved: rt.status !== 'draft' });
  }

  // ---------- tutka ----------
  // Tutka saa oman sijaintinsa, tosisuuntansa, nopeutensa ja aikansa samasta tilasta (G.S) kuin plotteri ja käyttää jaettua Aineisto-moduulia.
  // Aika on simulaatioaika ja kuluva 0,1 s:n askel mukana, jolloin pyyhkäisy etenee tasaisesti, pysähtyy tauolla ja kulkee nopeutetussa ajossa mukana.
  function feedRadar() {
    var S = G.S, w = P.worldToEN(S.x, S.y);
    G.radar.paivita({ e: w.e, n: w.n, suunta: L.trueHdg(S), nopeusMs: Math.abs(S.v), aika: S.clockMs + G.acc * 1000 });
  }
  function setupRadar() {
    if (G.radar) { try { G.radar.tuhoa(); } catch (e) {} G.radar = null; }
    G.radarOn = true; $('radarOff').hidden = true; G.radarSec = 0; G.radarMainSec = 0; G.lastRadarT = 0; G.radarReady = true;
    if (G.rec) G.rec.radar = [{ t: 0, on: true }];
    if (G.disp === 'plot') { G.radarOpt = null; return; }
    G.radarOpt = { aineisto: root.Aineisto, alue: 1.5, suuntaYlos: true, ui: true, eblVrm: true, kuvavali: 50, viritys: G.radarTune,
      ulkoisetNapit: [$('rOffBtn')], onViritys: setRadarTune, onKirjaus: function (kind, value) { onEV('tutka' + kind, value); } };
    G.radar = root.Tutka.luoTutka($('radar'), G.radarOpt);
    root.__radar = G.radar;
    applyPanes();
    G.radarReady = false;
    feedRadar();
    G.radar.valmis().then(function () { G.radarReady = true; });
  }
  // Tutkan viritys (hyvä tai huono): valikon valinta, vaihto kirjataan komentolokiin kuten muut tutkan muutokset (1 = hyvä, 0 = huono)
  function setRadarTune(v) {
    if (G.radarTune === v) return;
    G.radarTune = v; savePrefs();
    if (G.radar) G.radar.asetaViritys(v);
    if (G.S && G.mode === 'run') logCustom('tutkaviritys', v === 'hyva' ? 1 : 0);
    updateMenuLabels();
  }
  function setRadar(on) {
    if (G.radarOn === on) return;
    G.radarOn = on; $('radarOff').hidden = on;
    if (G.radar) { G.radar.asetaHairio({ pois: !on }); if (on && G.S) feedRadar(); }
    if (G.S) { logCustom('tutka', on ? 1 : 0); if (G.rec) G.rec.radar.push({ t: G.S.t, on: on }); }
  }

  // COG: simulaattorissa ei ole sortoa, joten COG = HDG. Piirretään silti erikseen (vaiheen 4 tuuli erottaa ne).
  function cogOf(S) { return L.cogGrid(S); }   // kulku (COG): perä edellä liikuttaessa 180° keulasuunnasta
  function onEV(kind, value) {
    if (!(G.S && G.mode === 'run')) return;
    var last = null, lg = G.S.cmdLog; for (var i = lg.length - 1; i >= 0; i--) if (lg[i].kind === kind) { last = lg[i]; break; }
    if (kind === 'evpiste') { if (last && lg[lg.length - 1] === last && last.value.ebl === value.ebl && last.value.vrm === value.vrm) return; }   // veto tai napautus: EBL ja VRM yhtenä rivinä
    else if (last && Math.abs(last.value - value) < 0.005) return;   // sama arvo kuin edellinen kirjaus (esim. EBL palautuu nipistyksen alussa)
    logCustom(kind, value);
  }

  // ---------- komennot ----------
  function logCustom(kind, value) {
    var S = G.S; S.cmdLog.push({ t: S.t, clockMs: S.clockMs, kind: kind, value: value, x: S.x, y: S.y, hdg: S.hdg, hdgTrue: L.trueHdg(S), v: S.v });
  }
  function canCmd() { return G.mode === 'run' && !G.frozen; }
  function cmdHeading(dir, long) {
    if (!canCmd()) return;
    if (G.S.orderSpeedKn < 0) L.stepSternOrder(G.S, dir);   // peruutuksessa käsky annetaan perän suuntana: Perä vasen (dir -1) tai Perä oikea (dir +1)
    else L.stepHeadingOrder(G.S, dir, long);
    updateUi();   // käskymerkki ja käskyteksti päivittyvät heti
  }   // käskymerkki ja käskyteksti päivittyvät heti
  function cmdSpeed(kn) { if (!canCmd()) return; L.orderSpeed(G.S, kn); }
  function bindHold(btn, dir) {
    var timer = null, longDone = false, repeat = null;
    function down(ev) {
      ev.preventDefault(); if (btn.setPointerCapture && ev.pointerId != null) { try { btn.setPointerCapture(ev.pointerId); } catch (e) {} }
      btn.classList.add('press'); longDone = false;
      timer = setTimeout(function () {
        longDone = true; cmdHeading(dir, true);
        repeat = setInterval(function () { cmdHeading(dir, true); }, 450);
      }, 450);
    }
    function up(ev) {
      if (timer === null && repeat === null && !btn.classList.contains('press')) return;
      clearTimeout(timer); timer = null; clearInterval(repeat); repeat = null;
      var wasPress = btn.classList.contains('press'); btn.classList.remove('press');
      if (wasPress && !longDone && ev.type !== 'pointercancel') cmdHeading(dir, false);
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // pelkkä klikki (näppäimistö, apuväline) toimii myös, jos pointer-tapahtumia ei tullut
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); } });
  }
  function toggleGentle() {
    if (!canCmd()) return;
    if (G.S.orderSpeedKn < 0) { L.orderStraight(G.S); updateUi(); return; }   // peruutuksessa sama nappi on Suoraan
    L.toggleGentle(G.S);
  }
  function crash() { if (!canCmd()) return; L.crashStop(G.S); }
  function setPlotter(on) {
    if (G.plotterOn === on) return; G.plotterOn = on; $('plotOff').hidden = on;
    if (G.S) { logCustom('plotter', on ? 1 : 0); if (G.rec) G.rec.plotter.push({ t: G.S.t, on: on }); }
    if (on) G.lastPlotT = 0;
  }
  function setSpeedFactor(idx) {
    G.speedIdx = idx; var f = G.speedSteps[idx]; $('speedBtn').textContent = f + '×';
    if (G.S && !G.paused) G.S.speedFactor = f;
  }
  function togglePause() {
    G.paused = !G.paused;
    if (G.S) G.S.speedFactor = G.paused ? 0 : G.speedSteps[G.speedIdx];
    $('pauseIco').innerHTML = G.paused ? '<path d="M7 4l12 8-12 8z" fill="currentColor"/>' : '<path d="M7 5v14M17 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
    $('pauseBtn').setAttribute('aria-pressed', G.paused ? 'true' : 'false');
    toast(G.paused ? 'Tauko' : 'Jatkuu', 900);
  }
  function bindControls() {
    bindHold($('bLeft'), -1); bindHold($('bRight'), 1);
    $('bGentle').addEventListener('click', toggleGentle);
    $('bSlower').addEventListener('click', function () { if (canCmd()) L.stepSpeedOrder(G.S, -1); });
    $('bFaster').addEventListener('click', function () { if (canCmd()) L.stepSpeedOrder(G.S, 1); });
    Array.prototype.forEach.call(doc.querySelectorAll('.cb.sp'), function (b) { b.addEventListener('click', function () { cmdSpeed(Number(b.getAttribute('data-kn'))); }); });
    $('bReverse').addEventListener('click', function () { if (canCmd()) L.orderReverse(G.S, 2); });
    $('bReverse4').addEventListener('click', function () { if (canCmd()) L.orderReverse(G.S, 4); });
    $('groundGo').addEventListener('click', resumeAfterCollision);
    $('bStop').addEventListener('click', function () { cmdSpeed(0); });
    $('bCrash').addEventListener('click', crash);
    $('speedBtn').addEventListener('click', function () { setSpeedFactor((G.speedIdx + 1) % G.speedSteps.length); });
    $('pauseBtn').addEventListener('click', togglePause);
    $('swapBtn').addEventListener('click', swapViews);
    $('mPlotOff').addEventListener('click', function () { $('menu').hidden = true; setPlotter(false); });
    $('plotOnBtn').addEventListener('click', function () { setPlotter(true); });
    $('rOffBtn').addEventListener('click', function () { setRadar(false); });
    $('radarOnBtn').addEventListener('click', function () { setRadar(true); });
    $('instrBtn').addEventListener('click', cycleInstr);
    $('gazeBtn').addEventListener('click', function () { G.view.setGaze(0); G.view.setBinoPitch(0); });
    $('binoBtn').addEventListener('click', function () { setBino(!G.view.isBino()); });
    $('menuBtn').addEventListener('click', function () { $('menu').hidden = false; });
    $('mClose').addEventListener('click', function () { $('menu').hidden = true; });
    $('mAbort').addEventListener('click', function () { $('menu').hidden = true; endRun('aborted'); });
    $('mSeat').addEventListener('click', function () { G.seated = !G.seated; G.view.setSeat(G.seated); toast(G.seated ? 'Istuen' : 'Seisten', 1000); });
    $('mEye').addEventListener('click', function () {
      G.eye = G.eye === 'nav' ? 'helm' : 'nav'; G.view.setEye(6.1, G.eye === 'helm' ? G.view.settings.helmEyeY : -0.75);
      $('mEye').textContent = 'Silmäpiste: ' + (G.eye === 'nav' ? 'navigoija' : 'ruorimies');
    });
    $('mHelp').addEventListener('click', function () { $('helpText').hidden = !$('helpText').hidden; });
    $('groundBtn').addEventListener('click', function () { endRun(G.collision ? 'collision' : 'ground'); });
    $('dbAgain').addEventListener('click', function () { $('debrief').hidden = true; startRun(); });
    $('dbStart').addEventListener('click', function () { $('debrief').hidden = true; $('game').hidden = true; $('start').hidden = false; G.mode = 'start'; });
    // katseen kääntö vetämällä 3D-näkymässä (hiiri ja yksi sormi). Kosketuksen lyhyt napautus palauttaa katseen eteen, hiirellä tuplaklikkaus.
    var v3 = $('v3'), drag = null;
    function gazeActive() { return G.layout.wide || G.main === '3d'; }
    v3.addEventListener('pointerdown', function (e) {
      if (!gazeActive()) return;
      drag = { x: e.clientX, y: e.clientY, g: G.view.getGaze(), p: G.view.getBinoPitch(), id: e.pointerId, t: performance.now(), moved: false, type: e.pointerType };
      try { v3.setPointerCapture(e.pointerId); } catch (x) {}
    });
    v3.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x; if (Math.abs(dx) > 8 || Math.abs(e.clientY - drag.y) > 8) drag.moved = true;
      if (drag.moved) {
        var sens = G.view.gazeSens();   // kiikarissa herkkyys on jaettu suurennuksella, ja pystyveto nostaa ja laskee katsetta
        G.view.setGaze(drag.g - dx * 0.25 * sens);
        if (G.view.isBino()) G.view.setBinoPitch(drag.p + (e.clientY - drag.y) * 0.25 * sens);
      }
    });
    function dragEnd(e) {
      var d = drag; drag = null; if (!d || e.type === 'pointercancel') return;
      var now = performance.now();
      if (!d.moved && now - d.t < 450 && G.view.isBino()) {   // kiikarissa napautus keskelle poistaa kiikarin
        var rc = v3.getBoundingClientRect();
        if (Math.abs(e.clientX - (rc.left + rc.width / 2)) < rc.width * 0.25 && Math.abs(e.clientY - (rc.top + rc.height / 2)) < rc.height * 0.35) setBino(false);
      } else if (!d.moved && now - d.t < 450) {
        if (d.type !== 'mouse') G.view.setGaze(0);
        else { if (now - G.lastTapT < 400) G.view.setGaze(0); G.lastTapT = now; }
      }
    }
    v3.addEventListener('pointerup', dragEnd); v3.addEventListener('pointercancel', dragEnd);
    $('vecBtn').addEventListener('click', function () { setTimeout(function () { G.vecIdx = G.pl.getVecIdx(); savePrefs(); }, 0); });
    $('gazeL').addEventListener('click', function () { G.view.setGaze(-60); });
    $('gazeR').addEventListener('click', function () { G.view.setGaze(60); });
    $('mOrient').addEventListener('click', function () { G.northUp = !G.northUp; G.pl.setHeadUp(!G.northUp); updateMenuLabels(); savePrefs(); });
    $('mTune').addEventListener('click', function () { setRadarTune(G.radarTune === 'huono' ? 'hyva' : 'huono'); });
    $('mRaster').addEventListener('click', function () { G.raster = !G.raster; G.pl.setRasterVisible(G.raster); updateMenuLabels(); savePrefs(); });
    $('mFov').addEventListener('click', function () {
      var opts = [70, 80, 90, 100, 110], i = opts.indexOf(G.fovDeg); G.fovDeg = opts[(i + 1) % opts.length]; G.view.setHfov(G.fovDeg); updateMenuLabels(); savePrefs();
    });
    // viimeksi käytetty mittari (plotteri tai tutka) saa yhteiset näppäimet
    doc.addEventListener('pointerdown', function (e) { var t = e.target; if (t && t.closest) { if (t.closest('#paneR')) G.keyTarget = 'radar'; else if (t.closest('#paneP')) G.keyTarget = 'plot'; } }, true);
    // näppäimistö
    doc.addEventListener('keydown', function (e) {
      if (G.mode !== 'run' || e.target.tagName === 'INPUT') return;
      var k = e.key, handled = true;
      var radarKeys = ',.[]+=-_oO'.indexOf(k) >= 0 && k.length === 1;
      if (radarKeys && G.radar && (e.target.id === 'radar' || radarKeyTarget() || ((k === 'o' || k === 'O') && G.radarShown))) { if (e.target.id !== 'radar') { if (G.radar.nappain(k, e.shiftKey)) e.preventDefault(); } return; }   // tutkan ruutu on aktiivinen: tutka käsittelee näppäimen (kohdistettuna tutkalla se on jo käsitellyt sen itse)
      if (k === 'ArrowLeft') cmdHeading(-1, e.shiftKey);
      else if (k === 'ArrowRight') cmdHeading(1, e.shiftKey);
      else if (k === 'ArrowUp') { if (canCmd()) L.stepSpeedOrder(G.S, 1); }
      else if (k === 'ArrowDown') { if (canCmd()) L.stepSpeedOrder(G.S, -1); }
      else if (k === ' ') crash();
      else if (k === 'l' || k === 'L') toggleGentle();
      else if (k === 'b' || k === 'B') setBino(!G.view.isBino());
      else if (k === 'q' || k === 'Q') { if (!e.repeat) G.gazeT = performance.now(); G.gazeKey = -1; }
      else if (k === 'e' || k === 'E') { if (!e.repeat) G.gazeT = performance.now(); G.gazeKey = 1; }
      else if (k === ',') G.pl.stepEBL(e.shiftKey ? -10 : -1);
      else if (k === '.') G.pl.stepEBL(e.shiftKey ? 10 : 1);
      else if (k === '[') G.pl.scaleVRM(1 / 1.05);
      else if (k === ']') G.pl.scaleVRM(1.05);
      else if (k === '+' || k === '=') G.pl.zoomBy(G.pl.limits.step);
      else if (k === '-' || k === '_') G.pl.zoomBy(1 / G.pl.limits.step);
      else if (k === 'c' || k === 'C') G.pl.recenter();
      else if (k === 'v' || k === 'V') { G.pl.cycleVector(); G.vecIdx = G.pl.getVecIdx(); savePrefs(); }
      else if (k === 'Tab') swapViews();
      else if (k === 'r' || k === 'R') cycleInstr();
      else if (k === 'p' || k === 'P') togglePause();
      else if (k === '1') setSpeedFactor(0); else if (k === '2') setSpeedFactor(1); else if (k === '5') setSpeedFactor(2); else if (k === '0') setSpeedFactor(3);
      else handled = false;
      if (handled) e.preventDefault();
    });
    doc.addEventListener('keyup', function (e) {
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        // lyhyt painallus (alle 200 ms) palauttaa katseen eteen, pitkä jättää katseen sivulle
        if (G.gazeKey && performance.now() - (G.gazeT || 0) < 200 && G.view) G.view.setGaze(0);
        G.gazeKey = 0;
      }
    });
  }

  // ---------- simulaation askel ----------
  function groundHeight(x, y) { return G.view.terrain.heightAt(x, y, true, 16); }   // vain z16-ruudut: karkeampi ruutu liioittelisi rantaviivaa

  function aidVisible(a, S) {
    // viitan huippu näkyy kuljettajan näkymässä: alle 700 m, kuvakentässä, ei maaston takana, ei rungon eikä ohjaamon peitossa
    var v = G.view, THREE = root.THREE;
    var h = Math.max(1.0, Math.min(a.valoKorkeus || 1.5, 8) * 0.9);
    var tgt = new THREE.Vector3(a.x, h, -a.y);
    var cam = v.camera.getWorldPosition(new THREE.Vector3());
    var d = cam.distanceTo(tgt); if (d > H.SETTINGS.visRangeM) return false;
    var fr = G._frustum || (G._frustum = new THREE.Frustum()), m = G._pm || (G._pm = new THREE.Matrix4());
    v.camera.updateMatrixWorld(); m.multiplyMatrices(v.camera.projectionMatrix, v.camera.matrixWorldInverse); fr.setFromProjectionMatrix(m);
    if (!fr.containsPoint(tgt)) return false;
    if (v.terrain.blocked(cam.x, -cam.z, cam.y, a.x, a.y, h)) return false;
    var rc = G._ray || (G._ray = new THREE.Raycaster()), dir = tgt.clone().sub(cam).normalize();
    rc.set(cam, dir); rc.far = d - 0.5; rc.near = 0.05;
    var hits = rc.intersectObject(v.boat.boat, true);
    return hits.length === 0;
  }

  // Väyläalue: Väyläviraston väyläaluepolygoni tai, kun polygonia ei ole, käytävä navigointilinjan molemmin puolin
  function inFairwayNow(S) {
    var poly = root.Pohja.inFairway(S.x, S.y);
    if (poly === true) return true;
    if (!G.route) return poly;
    var d = H.project(G.route, S.x + G.origin.e, S.y + G.origin.n, null).dist;
    return d <= H.SETTINGS.fairwayHalfM;
  }
  function tick(dt, prev) {
    var S = G.S;
    // meridiaanikonvergenssi
    if (S.t - G.lastConvT > 2) { G.lastConvT = S.t; var l = P.worldToLonLat(S.x, S.y); S.conv = P.convergenceDeg(l.lon, l.lat); }
    if (G.auto && !G.auto.done) G.auto.step(S);
    var e = S.x + G.origin.e, n = S.y + G.origin.n;
    // törmäys laituriin, aallonmurtajaan, vesikiveen tai sillan pilariin (vaihe 3k): ruudut ladataan 300 m:n säteellä aluksesta, osuessa alus palautetaan edelliseen asentoon
    if (Math.hypot(e - G.lastTorE, n - G.lastTorN) > 25) { G.lastTorE = e; G.lastTorN = n; root.Tormays.preloadEN(e, n, root.Tormays.RADIUS); }
    var tc0 = performance.now(), chit = root.Tormays.resolve(S, prev, G.origin), tcd = performance.now() - tc0;
    G.collMs.n++; G.collMs.sum += tcd; if (tcd > G.collMs.max) G.collMs.max = tcd;
    if (chit) { e = S.x + G.origin.e; n = S.y + G.origin.n; if (onCollision(chit)) return; }
    if (G.radar && G.radarShown && G.radarOn) { G.radarSec += dt; if (G.radarMain) G.radarMainSec += dt; }
    // tallenne
    if (G.rec) {
      G.rec._acc += dt;
      if (G.rec._acc >= H.SETTINGS.sampleSec) { G.rec._acc = 0; G.rec.sample(S, inFairwayNow(S), root.Pohja.near(S.x, S.y)); }
      G.rec._visAcc += dt;
      if (G.rec._visAcc >= H.SETTINGS.visSampleSec && G.view) {
        var vdt = G.rec._visAcc; G.rec._visAcc = 0;
        root.Merkit.near(S.x, S.y, H.SETTINGS.visRangeM + 150).forEach(function (a) {
          if (a.tyyppi !== 'Viitta' && G.route) return;      // reittiajossa seurataan viittoja kuten ennen, vapaassa ajossa kaikkia turvalaitteita
          G.rec.sampleAid(S, { numero: a.numero, nimi: a.nimi, tyyppi: a.tyyppi, nl: a.nl, e: a.e, n: a.n }, aidVisible(a, S), vdt);
        });
      }
    }
    // pohjakosketus
    if (S.v > 0.3 || true) {
      root.Pohja.preload(S.x + Math.sin(S.hdg * RAD) * 150, S.y + Math.cos(S.hdg * RAD) * 150, 700);
      if (S.t > 3) {
        var hit = root.Pohja.check(S, groundHeight);
        if (hit) { onGround(hit); return; }
      }
    }
    // perillä
    if (G.route) {
      var last = G.route.pts[G.route.pts.length - 1];
      if (Math.hypot(e - last.e, n - last.n) < H.SETTINGS.finishM) { onFinish(); return; }
    }
  }
  // Esteeseen osuminen. Kosketus (alle 1,0 kn) pysäyttää aluksen ja ajo jatkuu, törmäys (1,0 kn tai yli) pysäyttää ajon ja näyttää bannerin (Jatka tai Purku).
  // Palauttaa true, kun ajo pysähtyi.
  function onCollision(hit) {
    var S = G.S, kind = hit.kind, text = H.collisionText(hit.type, { kind: kind, kn: hit.kn });
    L.halt(S);
    var ev = { t: S.t, x: hit.x, y: hit.y, e: hit.x + G.origin.e, n: hit.y + G.origin.n, kind: kind, type: hit.type, kn: hit.kn };
    if (G.rec) G.rec.collisions.push(ev);
    S.cmdLog.push({ t: S.t, clockMs: S.clockMs, kind: hit.type, value: { kind: kind, kn: hit.kn }, x: S.x, y: S.y, hdg: S.hdg, hdgTrue: L.trueHdg(S), v: hit.kn * KN });
    if (hit.type === 'kosketus') { toast(text, 2200); return false; }
    G.frozen = true; G.collision = ev; G.ground = null;
    $('groundTitle').textContent = 'Törmäys'; $('groundText').textContent = text + '. Alus on pysäytetty.';
    $('groundGo').hidden = false; $('groundBanner').hidden = false;
    G.pl.addExtraPoint({ x: hit.x, y: hit.y }, '<div class="grd">✕</div>', 'plot-pin');
    G.pl.update(S.x, S.y, S.hdg, cogOf(S), Math.abs(S.v));
    return true;
  }
  function resumeAfterCollision() {
    if (G.mode !== 'run' || !G.frozen || !G.collision) return;
    G.frozen = false; G.collision = null; G.lastT = performance.now();
    $('groundBanner').hidden = true; $('groundGo').hidden = true; G.pl.clearExtra();
  }
  function onGround(hit) {
    var S = G.S; if (G.frozen) return;
    G.frozen = true; G.ground = hit; G.collision = null; S.v = 0; S.crashCmd = false;
    $('groundTitle').textContent = 'Pohjakosketus'; $('groundGo').hidden = true;
    if (G.rec) { G.rec.groundings.push({ t: S.t, x: hit.x, y: hit.y, e: hit.x + G.origin.e, n: hit.y + G.origin.n, reason: hit.reason, depth: hit.depth }); }
    $('groundText').textContent = hit.reason === 'maa' ? 'Alus ajoi maalle.' : 'Syvyys alle ' + fnum(root.Liike.SETTINGS.draftM, 1) + ' m, syväys ' + fnum(root.Liike.SETTINGS.draftM, 1) + ' m.';
    $('groundBanner').hidden = false;
    // näytä paikka kartalla
    if (G.disp !== 'radar' && G.instr === 'radar') G.instr = 'plot';
    G.main = 'plot'; applyPanes(); sizeViews();
    G.pl.addExtraPoint({ x: hit.x, y: hit.y }, '<div class="grd">✕</div>', 'plot-pin');
    G.pl.update(S.x, S.y, S.hdg, cogOf(S), Math.abs(S.v));
  }
  function onFinish() {
    if (G.frozen) return; G.frozen = true; G.finishedAt = G.S.t; if (G.rec) G.rec.finished = true;
    toast('Perillä', 2500);
    clearTimeout(G.endTimer); G.endTimer = setTimeout(function () { endRun('finish'); }, 1500);
  }

  function stepSim(realDt) {
    var S = G.S;
    if (S.speedFactor > 0 && !G.frozen) {
      G.acc += Math.min(realDt, 0.25) * S.speedFactor;
      var guard = 0;
      while (G.acc >= 0.1 && !G.frozen && guard++ < 400) { var pp = { x: S.x, y: S.y, hdg: S.hdg }; L.advance(S, 0.1); G.acc -= 0.1; tick(0.1, pp); }
    }
  }

  // ---------- kuvan päivitys ----------
  // ---------- kiikari (vaihe 3g) ----------
  function lookTrue() { return P_norm(L.trueHdg(G.S) + G.view.getGazeNow()); }
  function loadAids(r) { root.Merkit.load(G.S.x, G.S.y, r).then(function () { if (G.view && G.mode === 'run') G.view.aids.sync(G.S.x, G.S.y, true); }, function () {}); }
  function drawBinoMask() { var r = $('pane3d').getBoundingClientRect(); root.Nakyma.drawBinoMask($('v3bino'), Math.round(r.width), Math.round(r.height), r.width < 700); }
  function binoUi(on) {
    $('binoBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); $('pane3d').classList.toggle('binoon', on); $('game').classList.toggle('binoon', on); $('v3bino').hidden = !on;
    if (on) drawBinoMask();
  }
  // Kiikari päälle tai pois. Päälle: 3D tulee päänäkymäksi, kiikarin kuvakulma 7° ja kauempana olevat merkit ladataan. Pois: entinen katse ja kuvakulma palaavat. Molemmat kirjataan komentolokiin suuntineen.
  function setBino(on) {
    on = !!on; if (!G.view || G.view.isBino() === on || (on && G.mode !== 'run')) return;
    if (on && !(G.layout.wide || G.main === '3d')) { G.main = '3d'; applyPanes(); sizeViews(); }
    var look = lookTrue();
    G.view.setBinoculars(on); binoUi(on);
    if (on) loadAids(G.view.aids.settings.binoRadius + 500);
    if (G.S && G.mode === 'run') logCustom('kiikari', { on: on, suunta: Math.round(look * 10) / 10 });
    updateUi();
  }
  // Kompassinauha 3D-näkymän yläreunassa: tosisuunta, johon katsotaan (aluksen tosisuunta + katseen kulma). Asteikko seuraa kameran vaakakuvakulmaa.
  function drawCompass() {
    var cv = $('v3compass'), pane = $('pane3d');
    if (pane.classList.contains('small')) return;
    var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var bino = G.view.isBino(), look = P_norm(L.trueHdg(G.S) + G.view.getGazeNow()), hf = (bino ? G.view.baseHfov() : G.view.hfov()) * RAD, k = (w / 2) / Math.tan(hf / 2);   // kiikarin aikana asteikko pysyy tavallisena ja kiikarin sektori piirretään siihen
    g.fillStyle = 'rgba(14,28,40,0.74)'; g.fillRect(0, 0, w, h);
    if (bino) {
      var bh = G.view.settings.kiikariHfovDeg * RAD / 2, bx0 = w / 2 - Math.tan(bh) * k, bx1 = w / 2 + Math.tan(bh) * k;
      g.fillStyle = 'rgba(255,212,0,0.22)'; g.fillRect(bx0, 0, bx1 - bx0, h); g.strokeStyle = 'rgba(255,212,0,0.85)'; g.lineWidth = 1; g.strokeRect(bx0 + 0.5, 0.5, bx1 - bx0 - 1, h - 1);
    }
    g.font = '600 12px ui-monospace,Menlo,Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var span = hf / RAD / 2 + 6, a0 = Math.floor((look - span) / 5) * 5;
    for (var b = a0; b <= look + span; b += 5) {
      var off = (b - look) * RAD; if (Math.abs(off) >= 1.5) continue;
      var x = w / 2 + Math.tan(off) * k; if (x < -20 || x > w + 20) continue;
      var bb = P_norm(b), major = bb % 30 === 0, mid = bb % 10 === 0;
      g.strokeStyle = major ? '#fff' : 'rgba(255,255,255,0.7)'; g.lineWidth = major ? 1.6 : 1;
      g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - (major ? 9 : mid ? 6 : 3.5)); g.stroke();
      if (major && Math.abs(x - w / 2) > 30) { g.fillStyle = '#d7e6f2'; g.fillText(pad3(bb), x, 10); }
    }
    // keskimerkki ja lukema
    g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(w / 2 - 5, 0); g.lineTo(w / 2 + 5, 0); g.lineTo(w / 2, 7); g.closePath(); g.fill();
    var txt = bino ? 'Kiikari ' + (look < 100 ? '0' : '') + (look < 10 ? '0' : '') + fnum(look, 1) + '°' : pad3(look) + '°'; g.font = '700 13px ui-monospace,Menlo,Consolas,monospace'; var tw = g.measureText(txt).width + 12;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w / 2 - tw / 2, 8, tw, 18); g.fillStyle = '#ffd400'; g.fillText(txt, w / 2, 17.5);
    G.compass = root.Nakyma.drawCommandMarker(g, w, h, look, hf / RAD, G.S.orderHdg);   // käskymerkki (komennettu tosisuunta)
  }
  function P_norm(b) { b = b % 360; return b < 0 ? b + 360 : b; }
  function updateUi() {
    var S = G.S;
    setText($('clock'), fmtClock(S.clockMs));
    setText($('ordHdg'), L.orderHeadingText(S)); setText($('ordSpd'), L.speedText(S.orderSpeedKn));
    // peruutuksessa (käsketty nopeus alle 0) suuntanapit ovat Perä vasen ja Perä oikea ja Loiva-nappi on Suoraan
    var rev = S.orderSpeedKn < 0;
    setText($('bLeft').querySelector('.lbl'), rev ? 'Perä vasen' : 'Vasen'); setText($('bRight').querySelector('.lbl'), rev ? 'Perä oikea' : 'Oikea'); setText($('bGentle').querySelector('.lbl'), rev ? 'Suoraan' : 'Loiva');
    $('bLeft').setAttribute('aria-label', rev ? 'Perä vasen' : 'Vasen'); $('bRight').setAttribute('aria-label', rev ? 'Perä oikea' : 'Oikea');
    $('ordGentle').hidden = rev || !S.gentleNext; $('bGentle').setAttribute('aria-pressed', !rev && S.gentleNext ? 'true' : 'false');
    $('bReverse').classList.toggle('cur', S.orderSpeedKn === -2); $('bReverse4').classList.toggle('cur', S.orderSpeedKn === -4);
    var hdgT = L.trueHdg(S);
    setText($('nowHdg'), pad3(hdgT) + '°'); setText($('nowSpd'), fnum(S.v / KN, 1) + ' kn');   // negatiivinen = perä edellä
    setText($('v3hud'), pad3(hdgT) + '° · ' + fnum(S.v / KN, 1) + ' kn');
    Array.prototype.forEach.call(doc.querySelectorAll('.cb.sp'), function (b) { b.classList.toggle('cur', Number(b.getAttribute('data-kn')) === S.orderSpeedKn); });
    $('gazeBtn').hidden = !(G.layout.wide || G.main === '3d') || Math.abs(G.view.getGaze()) < 1;
    drawCompass();
  }
  function maybeLoadAids() {
    var S = G.S;
    if (Math.hypot(S.x - G.lastMerkitLoad.x, S.y - G.lastMerkitLoad.y) > 400) {
      G.lastMerkitLoad = { x: S.x, y: S.y };
      loadAids(G.view.aids.radius() + 500);
    }
  }
  function maybeRebase() {
    var S = G.S;
    if (G.route || Math.hypot(S.x, S.y) < 6000) return;
    var dx = S.x, dy = S.y;
    G.origin.e += dx; G.origin.n += dy; P.setOrigin(G.origin.e, G.origin.n);
    S.x = 0; S.y = 0; G.trail = []; G.acc = G.acc;
    root.Merkit.rebase(); G.view.rebase(); G.pl.rebase(); root.Pohja.clear(); G.lastMerkitLoad = { x: 0, y: 0 };
  }

  var frameN = 0;
  function loop(now) {
    if (G.mode === 'start' || G.mode === 'debrief' && $('game').hidden) { return; }
    requestAnimationFrame(loop);
    var dtReal = Math.min(0.25, (now - G.lastT) / 1000); G.lastT = now; frameN++;
    var S = G.S, v = G.view;
    if (G.mode === 'loading') {
      v.terrain.tick(14);
      var j = v.terrain.info(), t = (performance.now() - G.t0load) / 1000;
      var prog = Math.min(0.95, 0.15 + 0.8 * Math.min(1, t / 12));
      if (G.radar && performance.now() - G.lastRadarT >= 100) { G.lastRadarT = performance.now(); feedRadar(); }
      if (G.plotShown && G.plotterOn) G.pl.update(S.x, S.y, S.hdg, cogOf(S), Math.abs(S.v));
      var idle = v.terrain.idle() && (!v.piers || v.piers.idle()) && (!G.bridges || G.bridges.idle()) && G.loadedLandmarks && root.Pohja.ready(S.x, S.y) && root.Tormays.idle() && t > 1.2 && G.radarReady && (!G.plotShown || G.pl.ready());
      setLoad(idle ? 1 : prog, 'Ladataan maastoa ' + (j.jobs + j.queued) + ' ruutua');
      v.render(S, dtReal);
      if (idle || t > 60) {
        $('loading').hidden = true; G.mode = 'run'; G.ready = true; G.lastT = performance.now();
        if (G.auto == null && !G.route) toast('Anna nopeus ja suunta', 1800);
        if (G.route) toast('Anna nopeus ja suunta. Aikabudjetti ' + H.mmss(G.route.total / (G.budgetKn * KN)), 2600);
        if (G.rec) G.rec.sample(S, inFairwayNow(S), root.Pohja.near(S.x, S.y));
        applyPanes(); sizeViews();
        loadAids(v.aids.settings.loadRadius);   // loistojen ja linjataulujen näkyvyysrajat ovat kilometrejä, joten kauempana olevat laitteet luetaan taustalla
      }
      return;
    }
    if (G.mode === 'run') {
      if (G.gazeKey) v.setGaze(v.getGaze() + G.gazeKey * 90 * dtReal * v.gazeSens());
      stepSim(dtReal);
      maybeLoadAids(); maybeRebase();
    }
    v.terrain.tick(G.mode === 'run' ? 4 : 8);
    // 3D piirretään joka kuvalla, kun se on päänäkymä, ja joka toisella pienenä ikkunana
    var big3d = G.layout.wide || G.main === '3d';
    if (big3d || (frameN & 1) === 0) {
      v.render(S, dtReal);
      adaptPixels(dtReal * 1000, big3d);
    }
    // plotteri ja käyttöliittymä
    var nowMs = performance.now();
    if (G.plotterOn && G.plotShown && nowMs - G.lastPlotT > ((G.layout.wide || G.main === 'plot') ? 70 : 250)) {
      G.lastPlotT = nowMs; G.pl.update(S.x, S.y, S.hdg, cogOf(S), Math.abs(S.v)); G.pl.syncAids(S.x, S.y, false);
    }
    if (nowMs - G.lastTrailT > 1000 && S.v > 0.3) {
      G.lastTrailT = nowMs; G.trail.push({ x: S.x, y: S.y }); if (G.trail.length > 3000) G.trail.shift(); if (G.plotterOn && G.plotShown) G.pl.setTrail(G.trail);
    }
    // tutka: tila 50 ms:n välein, kuva 50 ms:n välein kun tutka on puhelimen päänäkymä ja muuten 100 ms:n välein, ettei 3D-piirto kärsi
    if (G.radar && G.radarShown && G.radarOn && nowMs - G.lastRadarT >= 50) {
      G.lastRadarT = nowMs; G.radarOpt.kuvavali = (G.radarMain && !G.layout.wide) ? 50 : 100; feedRadar();
    }
    if (frameN % 3 === 0) updateUi();
  }
  // Kuvakoko sovitetaan todelliseen kuvaväliin (render-kutsun oma kesto ei kerro GPU:n aikaa): yli 45 ms pienennetään, alle 22 ms suurennetaan
  var adaptSum = 0, adaptN = 0;
  function adaptPixels(dtMs, big) {
    if (root.__adaptOff || !big) return;
    adaptSum += dtMs; adaptN++;
    if (adaptN < 30) return;
    var avg = adaptSum / adaptN; adaptSum = 0; adaptN = 0;
    var v = G.view, pb = v.getPixelBudget();
    if (avg > 45) v.setPixelBudget(pb * 0.8); else if (avg < 22) v.setPixelBudget(pb * 1.12);
  }

  // ---------- keskeytys ja purku ----------
  function endRun(why) {
    if (G.mode === 'debrief') return;
    clearTimeout(G.endTimer);
    G.mode = 'debrief'; G.frozen = true;
    if (G.view && G.view.isBino()) { G.view.setBinoculars(false); binoUi(false); }
    if (G.radar) G.radar.vapautaRuudut();     // tutkan ruudukko (enintään noin 39 Mt) vapautetaan, uusi ajo rakentaa sen uudelleen
    if (G.rec) { G.rec.aborted = why === 'aborted'; G.rec.endMs = G.S.clockMs; }
    $('groundBanner').hidden = true; $('toast').hidden = true; $('menu').hidden = true;
    $('game').hidden = true; $('debrief').hidden = false;
    var an = H.analyze(G.rec, G.S); root.__analysis = an;
    radarStats(an);
    renderDebrief(an, why);
    requestAnimationFrame(function () { renderDebriefMap(an); });
  }

  // Tutkan käyttö purkua varten: kuinka suuren osan ajasta tutka oli näkyvissä (päällä ja ruudulla) ja kuinka paljon sitä katsottiin suurena ruutuna
  function radarStats(an) {
    an.radarUsed = G.disp !== 'plot'; an.radarVisSec = 0; an.radarVisPct = null; an.radarMainSec = 0; an.radarMainPct = null; an.radarOffSec = 0;
    if (!an.radarUsed || !an.ok || !(an.timeSec > 0)) return;
    an.radarVisSec = Math.min(an.timeSec, G.radarSec); an.radarMainSec = Math.min(an.radarVisSec, G.radarMainSec);
    an.radarVisPct = an.radarVisSec / an.timeSec * 100; an.radarMainPct = an.radarMainSec / an.timeSec * 100;
    var ev = G.rec.radar || [], t0 = G.rec.t[0], tEnd = G.rec.t[G.rec.t.length - 1], off = 0;
    for (var i = 0; i < ev.length; i++) {
      if (!ev[i].on) { var tn = i + 1 < ev.length ? ev[i + 1].t : tEnd; off += Math.max(0, Math.min(tn, tEnd) - Math.max(ev[i].t, t0)); }
    }
    an.radarOffSec = off;
  }
  function cmdLabel(c) {
    if (c.kind === 'tutka') return c.value ? 'Tutka päälle' : 'Tutka pois';
    if (c.kind === 'tutkaviritys') return c.value ? 'Tutkan viritys: hyvä' : 'Tutkan viritys: huono';
    if (c.kind === 'ebl') return 'Plotterin EBL ' + pad3(c.value) + '° T';
    if (c.kind === 'vrm') return 'Plotterin VRM ' + fnum(c.value, 2) + ' mpk';
    if (c.kind === 'evpiste') return 'Plotterin EBL ' + pad3(c.value.ebl) + '° T ja VRM ' + fnum(c.value.vrm, 2) + ' mpk';
    if (c.kind === 'tutkaevpiste') return 'Tutkan EBL ' + pad3(c.value.ebl) + '° T ja VRM ' + fnum(c.value.vrm, 2) + ' mpk';
    if (c.kind === 'tutkaebl') return 'Tutkan EBL ' + pad3(c.value) + '° T';
    if (c.kind === 'tutkavrm') return 'Tutkan VRM ' + fnum(c.value, 2) + ' mpk';
    if (c.kind === 'tutkaoffset') return c.value ? 'Tutkan offset päälle' : 'Tutkan offset pois';
    if (c.kind === 'tutkasuunta') return c.value ? 'Tutka: suunta ylös (H UP)' : 'Tutka: pohjoinen ylös (N UP)';
    if (c.kind === 'tutkaev') return c.value ? 'Tutkan EBL ja VRM päälle' : 'Tutkan EBL ja VRM pois';
    if (c.kind === 'kiikari') return c.value.on ? 'Kiikari päälle, suunta ' + pad3(c.value.suunta) + '°' : 'Kiikari pois, suunta ' + pad3(c.value.suunta) + '°';
    if (c.kind === 'eblvrm') return c.value ? 'Plotterin EBL ja VRM päälle' : 'Plotterin EBL ja VRM pois';
    return H.cmdText(c);
  }
  function updateMenuLabels() {
    $('mOrient').textContent = 'Plotteri: ' + (G.northUp ? 'pohjoinen ylös' : 'suunta ylös');
    $('mRaster').textContent = 'Plotterin pohja: ' + (G.raster ? 'rasterimerikartta' : 'vektorikartta');
    $('mFov').textContent = 'Kuvakulma: ' + G.fovDeg + '°';
    $('mTune').textContent = 'Tutkan viritys: ' + (G.radarTune === 'huono' ? 'huono' : 'hyvä');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function offsetText(m) {
    if (m == null) return '–';
    var a = Math.round(Math.abs(m));
    if (a === 0) return 'käännöspisteellä';
    return a + ' m ' + (m < 0 ? 'ennen' : 'jälkeen');
  }
  // Purku. Reitti on valinnainen: vapaassa ajossa (G.route == null) reittiin sidotut osat (poikkeama, käännökset, aikabudjetti) jäävät pois ja tilalle tulevat
  // ajetun matkan, nopeuksien, rannan ja matalikon etäisyyksien sekä väyläalueen ulkopuolella ajetun matkan tiedot.
  function renderDebrief(an, why) {
    var rt = G.route, S = G.S, h = [], free = !rt;
    $('dbTitle').textContent = 'Purku';
    var stat = why === 'finish' ? '<span class="pill ok">Perillä</span>' : why === 'ground' ? '<span class="pill bad">Pohjakosketus</span>' : why === 'collision' ? '<span class="pill bad">Törmäys</span>' : free ? '<span class="pill">Päättynyt</span>' : '<span class="pill">Keskeytetty</span>';
    $('dbStatus').innerHTML = (free ? 'Vapaa ajo' : esc(rt.nimi + (rt.kuvaus ? ': ' + rt.kuvaus : '') + (rt.reverse ? ' (käänteinen)' : ''))) + ' ' + stat;
    if (!an.ok) { $('dbBody').innerHTML = '<p>Ajoa ei ole tarpeeksi purettavaksi.</p>'; return; }
    // 5. yhteenveto
    var budgetSec = rt ? rt.total / (G.budgetKn * KN) : 0;
    h.push('<div class="db-sec"><h2>Yhteenveto</h2><div class="tblwrap"><table class="db"><tbody>' +
      '<tr><td>Kokonaisaika</td><td class="n" id="dbTime">' + H.mmss(an.timeSec) + '</td></tr>' +
      '<tr><td>Ajettu matka</td><td class="n" id="dbDist">' + fnum(an.distM / 1852, 2) + ' mpk' + (rt ? ' (reitti ' + fnum(rt.total / 1852, 2) + ' mpk)' : '') + '</td></tr>' +
      '<tr><td>Keskinopeus</td><td class="n">' + fnum(an.avgKn, 1) + ' kn</td></tr>' +
      (free ? '<tr><td>Suurin nopeus</td><td class="n">' + fnum(an.maxKn, 1) + ' kn</td></tr>' : '') +
      (rt ? '<tr><td>Aikabudjetti ' + fnum(G.budgetKn, 0) + ' kn</td><td class="n">' + H.mmss(budgetSec) + (an.finished ? ' (' + (an.timeSec <= budgetSec ? '−' : '+') + H.mmss(Math.abs(an.timeSec - budgetSec)) + ')' : '') + '</td></tr>' : '') +
      '<tr><td>Pohjakosketukset</td><td class="n">' + (an.groundings.length ? an.groundings.length + ' kpl' : 'ei yhtään') + '</td></tr>' +
      '<tr><td>Törmäykset esteisiin</td><td class="n" id="dbCrashCount">' + (an.crashCount ? an.crashCount + ' kpl' : 'ei yhtään') + '</td></tr>' +
      '<tr><td>Kosketukset esteisiin</td><td class="n" id="dbTouchCount">' + (an.touchCount ? an.touchCount + ' kpl' : 'ei yhtään') + '</td></tr>' +
      (an.plotterOffSec > 0 ? '<tr><td>Plotteri pois päältä</td><td class="n">' + H.mmss(an.plotterOffSec) + '</td></tr>' : '') +
      (an.radarUsed && an.radarVisPct != null ? '<tr><td>Tutka näkyvissä</td><td class="n">' + fnum(an.radarVisPct, 0) + ' % ajasta (' + H.mmss(an.radarVisSec) + ')</td></tr>' +
        '<tr><td class="dim">josta päänäkymänä tai omana ruutunaan</td><td class="n">' + fnum(an.radarMainPct, 0) + ' % ajasta (' + H.mmss(an.radarMainSec) + ')</td></tr>' : '') +
      (an.radarOffSec > 0 ? '<tr><td>Tutka pois päältä</td><td class="n">' + H.mmss(an.radarOffSec) + '</td></tr>' : '') +
      '</tbody></table></div></div>');
    // törmäykset ja kosketukset: laituri, aallonmurtaja, vesikivi, sillan pilari. Törmäys = nopeus 1,0 kn tai yli (ajo pysähtyi), kosketus = alle 1,0 kn (ajo jatkui)
    if (an.collisions && an.collisions.length) {
      var cr = an.collisions.map(function (c) {
        return '<tr><td>' + H.mmss(c.t) + '</td><td>' + (c.type === 'tormays' ? '<span class="pill bad">Törmäys</span>' : '<span class="pill">Kosketus</span>') + '</td><td>' + esc(root.Tormays.KIND_NAME[c.kind] || c.kind) + '</td><td class="n">' + fnum(c.kn, 1) + ' kn</td></tr>';
      }).join('');
      h.push('<div class="db-sec"><h2>Törmäykset ja kosketukset</h2><p class="dim">Törmäys on osuma nopeudella 1,0 kn tai yli, kosketus alle 1,0 kn nopeudella. Alus pysäytettiin kummassakin.</p>' +
        '<div class="tblwrap"><table class="db" id="dbCollisions"><thead><tr><th>Aika</th><th>Laji</th><th>Este</th><th class="n">Nopeus</th></tr></thead><tbody>' + cr + '</tbody></table></div></div>');
    }
    // 1. väyläalue
    if (free) {
      h.push('<div class="db-sec"><h2>Väylä</h2>' + (an.outsidePct == null ? '<p>Väyläalueen tietoa ei ollut saatavilla.</p>' :
        '<p id="dbOutside">Väyläalueen ulkopuolella ' + fnum(an.outsideM / 1852, 2) + ' mpk eli ' + fnum(an.outsidePct, 0) + ' % ajetusta matkasta. Väyläalueen sisällä ' + fnum(an.fairwayPct, 0) + ' % ajasta. <span class="dim">Väyläalue on Väyläviraston väyläaluepolygoni.' + (an.fairwayKnownPct < 95 ? ' Tieto oli ' + fnum(an.fairwayKnownPct, 0) + ' %:lla näytteistä.' : '') + '</span></p>') +
        '<p class="dim">Kuvassa sininen jälki on väyläalueella ja punainen sen ulkopuolella.</p></div>');
      var near = function (m, name) { return m ? '<tr><td>' + name + '</td><td class="n">' + Math.round(m.m) + ' m</td><td>ajan ' + H.mmss(m.t) + ' kohdalla</td></tr>' : '<tr><td>' + name + '</td><td class="n">yli 290 m</td><td></td></tr>'; };
      h.push('<div class="db-sec"><h2>Etäisyys rantaan ja matalikkoon</h2><div class="tblwrap"><table class="db" id="dbNear"><tbody>' + near(an.minShore, 'Lähin rantaviiva') + near(an.minShoal, 'Lähin alle 2 m:n syvyysalue') + '</tbody></table></div></div>');
      var arf = an.aids.map(function (a) {
        return '<tr><td>' + esc(a.nimi || a.numero) + '</td><td>' + esc(a.tyyppi || '') + '</td><td class="n">' + Math.round(a.minD) + ' m</td><td>' + (a.side > 0 ? 'oikealla' : 'vasemmalla') + '</td></tr>';
      }).join('');
      h.push('<div class="db-sec"><h2>Sivuutetut turvalaitteet</h2><p class="dim">Lähin etäisyys turvalaitteeseen ja sivuutuspuoli (alle 450 m).</p>' +
        (arf ? '<div class="tblwrap"><table class="db"><thead><tr><th>Turvalaite</th><th>Tyyppi</th><th class="n">Lähin</th><th>Puoli</th></tr></thead><tbody>' + arf + '</tbody></table></div>' : '<p>Ei sivuutettuja turvalaitteita.</p>') + '</div>');
    } else {
      h.push('<div class="db-sec"><h2>1. Väylä</h2>' + (an.fairwayPct == null ? '<p>Väyläalueen tietoa ei ollut saatavilla.</p>' :
        '<p>Väyläalueen sisällä ' + fnum(an.fairwayPct, 0) + ' % ajasta. <span class="dim">Väyläalue on Väyläviraston väyläaluepolygoni tai, missä sitä ei ole, ' + H.SETTINGS.fairwayHalfM + ' m navigointilinjan molemmin puolin.</span>' + (an.fairwayKnownPct < 95 ? ' <span class="dim">(tieto ' + fnum(an.fairwayKnownPct, 0) + ' %:lla näytteistä)</span>' : '') + '</p>') +
        '<p class="dim">Kuvassa sininen jälki on väyläalueella ja punainen sen ulkopuolella. Violetti viiva on navigointilinja.</p></div>');
      // 2. suurin poikkeama
      var md = an.maxDev, nr = nearestPointName(md.cum);
      h.push('<div class="db-sec"><h2>2. Suurin poikkeama navigointilinjasta</h2><p>' + Math.round(md.m) + ' m, reitin kohdassa ' + fnum(md.cum / 1852, 2) + ' mpk' + (nr ? ' (' + esc(nr) + ' lähellä)' : '') + ', ajan ' + H.mmss(md.t) + ' kohdalla.</p></div>');
      // 3. käännökset
      var tr = an.turns.map(function (t) {
        return '<tr><td>' + t.no + (t.nimi ? ' ' + esc(t.nimi) : '') + '</td><td class="n">' + Math.round(Math.abs(t.delta)) + '° ' + (t.delta > 0 ? 'oik' : 'vas') + '</td><td>' + offsetText(t.startOffsetM) + '</td><td class="n">' + (t.cutM == null ? '–' : Math.round(t.cutM) + ' m') + '</td></tr>';
      }).join('');
      h.push('<div class="db-sec"><h2>3. Käännökset</h2><p class="dim">Käännös katsotaan alkaneeksi, kun ruorin käyttö ylitti 20 %.</p>' + (tr ? '<div class="tblwrap"><table class="db" id="dbTurns"><thead><tr><th>Käännös</th><th class="n">Kulma</th><th>Alkoi</th><th class="n">Ohitus pisteestä</th></tr></thead><tbody>' + tr + '</tbody></table></div>' : '<p>Reitillä ei ole käännöksiä.</p>') + '</div>');
      // 4. viitat
      var ar = an.aids.filter(function (a) { return a.tyyppi === 'Viitta'; }).map(function (a) {
        return '<tr><td>' + esc(a.nimi || a.numero) + '</td><td class="n">' + Math.round(a.seenSec) + ' s</td><td class="n">' + (a.firstSeenD == null ? '–' : Math.round(a.firstSeenD) + ' m') + '</td><td class="n">' + Math.round(a.minD) + ' m ' + (a.side > 0 ? 'oik' : 'vas') + '</td></tr>';
      }).join('');
      h.push('<div class="db-sec"><h2>4. Sivuutetut viitat</h2><p class="dim">Näkyvissä ennen sivuutusta: alle 700 m, kuvakentässä, ei maaston, rungon tai ohjaamon peitossa.</p>' +
        (ar ? '<div class="tblwrap"><table class="db"><thead><tr><th>Viitta</th><th class="n">Näkyi</th><th class="n">Ensi näkö</th><th class="n">Sivuutus</th></tr></thead><tbody>' + ar + '</tbody></table></div>' : '<p>Ei sivuutettuja viittoja.</p>') + '</div>');
    }
    // komentoloki: vapaassa ajossa aika, komento ja aluksen suunta ja nopeus komennon hetkellä, reittiajossa komennon paikka suhteessa käännöspisteeseen
    var cl = an.cmdLog.map(function (c) {
      var rel = free ? (c.hdgTrue != null ? 'suunta ' + pad3(c.hdgTrue) + '°, ' + fnum(c.vKn || 0, 1) + ' kn' : '') :
        c.turnNo == null ? '' : (Math.abs(c.offsetM) < 1 ? 'käännöspisteellä ' : Math.round(Math.abs(c.offsetM)) + ' m ' + (c.offsetM < 0 ? 'ennen ' : 'jälkeen ')) + 'käännös ' + c.turnNo;
      return '<tr><td>' + H.mmss(c.t) + '</td><td>' + esc(cmdLabel(c)) + '</td><td class="dim">' + esc(rel) + '</td></tr>';
    }).join('');
    h.push('<div class="db-sec"><h2>Komentoloki</h2>' + (cl ? '<div class="tblwrap"><table class="db" id="dbCmds"><thead><tr><th>Aika</th><th>Komento</th><th>' + (free ? 'Alus' : 'Paikka') + '</th></tr></thead><tbody>' + cl + '</tbody></table></div>' : '<p>Ei komentoja.</p>') + '</div>');
    $('dbBody').innerHTML = h.join('');
  }
  function nearestPointName(cum) {
    var best = null, bd = 1e12;
    G.route.pts.forEach(function (p) { if (!p.nimi) return; var d = Math.abs(p.cum - cum); if (d < bd) { bd = d; best = p.nimi; } });
    return bd < 900 ? best : null;
  }
  function renderDebriefMap(an) {
    var rec = G.rec, rt = G.route;
    if (!G.dbPl) G.dbPl = root.Plotteri.create($('dbPlot'), { interactive: false, fixedHeadUp: true, noOwnLines: true });
    var pl = G.dbPl; pl.resize();
    var es = rt ? rec.e.concat(rt.pts.map(function (p) { return p.e; })) : rec.e.slice(), ns = rt ? rec.n.concat(rt.pts.map(function (p) { return p.n; })) : rec.n.slice();
    if (!es.length) return;
    var emin = Math.min.apply(null, es), emax = Math.max.apply(null, es), nmin = Math.min.apply(null, ns), nmax = Math.max.apply(null, ns);
    var cE = (emin + emax) / 2, cN = (nmin + nmax) / 2, w = $('dbPlot').clientWidth, h = $('dbPlot').clientHeight;
    var rangeM = Math.max((nmax - nmin) * 1.18 + 200, (emax - emin) * 1.18 * h / Math.max(100, w) + 200);
    pl.setRangeNm(rangeM / 1852);
    setPlotterRoute(pl, rt); pl.setNext(null); pl.setTrail([]); pl.clearExtra();
    // jälki väyläalueen mukaan väritettynä
    var seg = [], cur = null;
    for (var i = 0; i < rec.e.length; i++) {
      var f = rec.inFw[i] === 0 ? 0 : 1, w1 = P.enToWorld(rec.e[i], rec.n[i]);
      if (!cur || cur.f !== f) { if (cur) cur.pts.push(w1); cur = { f: f, pts: [w1] }; seg.push(cur); } else cur.pts.push(w1);
    }
    seg.forEach(function (s) { pl.addExtraLine(s.pts, { color: s.f ? '#1f4e9c' : '#e02424', weight: 3.5, opacity: 0.95 }); });
    var pin = function (e, n, txt, color) { pl.addExtraPoint(P.enToWorld(e, n), '<div style="transform:translate(-50%,-50%);background:' + color + ';color:#fff;border:2px solid #fff;border-radius:11px;min-width:22px;height:22px;padding:0 5px;font:700 12px/18px sans-serif;text-align:center;white-space:nowrap">' + txt + '</div>', 'plot-pin'); };
    pin(rec.e[0], rec.n[0], 'Alku', '#2a7a48');
    pin(rec.e[rec.e.length - 1], rec.n[rec.n.length - 1], an.finished ? 'Perillä' : 'Loppu', '#222');
    if (rt) {
      pin(an.maxDev.e, an.maxDev.n, 'Maks. poikkeama ' + Math.round(an.maxDev.m) + ' m', '#a06a00');
      an.turns.forEach(function (t) { if (t.startE != null) pin(t.startE, t.startN, 'K' + t.no, '#6a3d9a'); });
    } else {
      if (an.minShore) pin(an.minShore.e, an.minShore.n, 'Lähin ranta ' + Math.round(an.minShore.m) + ' m', '#6a3d9a');
      if (an.minShoal) pin(an.minShoal.e, an.minShoal.n, 'Lähin matalikko ' + Math.round(an.minShoal.m) + ' m', '#a06a00');
    }
    an.groundings.forEach(function (g) { pin(g.e, g.n, '✕ Pohjakosketus', '#c00'); });
    (an.collisions || []).forEach(function (c) { pin(c.e, c.n, c.type === 'tormays' ? '✕ Törmäys ' + fnum(c.kn, 1) + ' kn' : 'Kosketus ' + fnum(c.kn, 1) + ' kn', c.type === 'tormays' ? '#c00' : '#a06a00'); });
    pl.syncAids(0, 0, true);
    // keskitys: update siirtää keskipistettä aluksen suunnassa 20 % alaspäin, joten korjataan siirto
    var off = rangeM * root.Plotteri.OFFSET_FRAC;
    pl.update(cE - G.origin.e, cN - G.origin.n - off, P.trueToGrid(0, cE - G.origin.e, cN - G.origin.n));
    var tries = 0;
    (function again() { pl.resize(); pl.redraw(); if (tries++ < 3) setTimeout(again, 500); })();
  }

  // ---------- käynnistys ----------
  function init() {
    initStart(); bindControls();
    root.__sim.startRun = startRun;
    root.__sim.onCollision = onCollision;   // testikoukku: kutsutaan osumalla { kind, type, kn, x, y }
    if (qs.get('alku') === '1') startRun();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
