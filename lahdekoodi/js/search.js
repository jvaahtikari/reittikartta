/* Reittikartta – paikkahaku: koordinaatit, omat kohteet, Väyläviraston turvalaitteet nimellä
 * ja (API-avaimella) Maanmittauslaitoksen nimistörekisteri.
 *
 * Suomessa on paljon samannimisiä paikkoja (esim. kymmeniä Viitasaaria), joten tulokset
 * järjestetään etäisyyden mukaan hakuhetken kartan keskipisteestä ja näytetään kartalla
 * numeroituina. Alle 50 km:n päässä olevat (sama vesialue) tulevat ensin. */
(function (global) {
  'use strict';

  var UI = global.UI, G = global.Geo, S = global.Store;
  var VAYLA = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ows?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature' +
    '&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&MAXFEATURES=40';
  var NEAR_KM = 50;
  var map, input, box, seq = 0, timer = null, results = [], sel = -1, hlLayer = null, resLayer = null;
  var ref = null;            // hakupiste: kartan keskipiste, kun haku aloitettiin
  var fittedFor = null;

  function norm(s) { return String(s || '').toLowerCase(); }
  function local(q) {
    var n = norm(q), out = [], st = S.state;
    st.marks.forEach(function (m) { if (norm(m.name).indexOf(n) >= 0) out.push({ name: m.name, info: 'oma merkki', lat: m.lat, lng: m.lng }); });
    st.tasks.forEach(function (t) { if (t.lat != null && norm(t.name).indexOf(n) >= 0) out.push({ name: t.name, info: 'tehtäväpaikka', lat: t.lat, lng: t.lng }); });
    st.routes.forEach(function (r) {
      if (r.points.length && norm(r.name).indexOf(n) >= 0) out.push({ name: r.name || 'Nimetön reitti', info: 'reitti', lat: r.points[0].lat, lng: r.points[0].lng, route: r.id });
    });
    var s0 = st.settings.station;
    if (s0 && norm(s0.name || 'asema').indexOf(n) >= 0) out.push({ name: s0.name || 'Asema', info: 'asema', lat: s0.lat, lng: s0.lng });
    return out;
  }
  function aids(q) {
    var cql = "nimifi ILIKE '%" + q.replace(/'/g, "''") + "%'";
    var layers = ['vesivaylatiedot:turvalaitteet_uusi', 'vesivaylatiedot:turvalaitteet_muut_vaylanpitajat'];
    return Promise.all(layers.map(function (l) {
      return fetch(VAYLA + '&TYPENAME=' + l + '&CQL_FILTER=' + encodeURIComponent(cql))
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (j) { return j.features || []; }, function () { return []; });
    })).then(function (lists) {
      var out = [];
      lists.forEach(function (fs) {
        fs.forEach(function (f) {
          var g = f.geometry, c = g && (g.type === 'MultiPoint' ? g.coordinates[0] : g.coordinates), p = f.properties || {};
          if (!c) return;
          out.push({ name: p.nimifi || 'Turvalaite', info: 'turvalaite, ' + (p.turvalaitetyyppifi || '').toLowerCase() + (p.turvalaitenumero ? ' ' + p.turvalaitenumero : ''), lat: c[1], lng: c[0] });
        });
      });
      return out;
    });
  }

  // etäisyys ja suunta hakupisteestä
  function place(items, at) {
    at = at || ref;
    items.forEach(function (it) {
      it.km = G.distance(at, it) / 1000;
      it.brg = G.bearing(at, it);
    });
    return items.sort(function (a, b) { return a.km - b.km; });
  }
  function hasNames() { return !!(global.ChartAPI && global.ChartAPI.searchNames && global.ChartAPI.mmlInfo.available); }
  // syy, miksi paikannimiä ei tullut (avain puuttuu, palvelin ei vastaa), tai tyhjä
  function namesNote() { return global.ChartAPI && global.ChartAPI.namesNote ? global.ChartAPI.namesNote() : ''; }
  // turvalaitteet ja paikannimet, etäisyysjärjestyksessä pisteestä at
  function remote(q, at) {
    return Promise.all([
      aids(q),
      hasNames() ? global.ChartAPI.searchNames(q, at).catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (res) {
      return place(res[1].concat(res[0].map(function (a) { a.aid = true; return a; })), at);
    });
  }
  // Haku muille toiminnoille (tehtäväpaikka): koordinaatti, omat kohteet, turvalaitteet ja paikannimet
  // yhtenä listana lähimmästä kauimpaan. Palauttaa lupauksen.
  function find(q, at) {
    q = String(q || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    var p = G.parsePos(q);
    if (p) return Promise.resolve(place([{ name: G.fmtPos(p), info: 'koordinaatti', lat: p.lat, lng: p.lng, coord: true }], at));
    var mine = local(q);
    if (q.length < 3) return Promise.resolve(place(mine, at));
    return remote(q, at).then(function (rem) {
      var all = place(mine.concat(rem), at);
      var near = all.filter(function (it) { return it.km <= NEAR_KM; }).slice(0, 25);
      var far = all.filter(function (it) { return it.km > NEAR_KM; }).slice(0, 15);
      return near.concat(far);
    });
  }
  // etäisyys merimaileina (alle 10 mpk kahdella desimaalilla, muuten yhdellä)
  function fmtKm(km) { return G.fmtNM(km * 1000); }

  function clearMarkers() { if (resLayer) resLayer.clearLayers(); }
  function drawMarkers() {
    clearMarkers();
    results.forEach(function (it, i) {
      if (it.coord) return;
      var m = L.marker([it.lat, it.lng], {
        icon: L.divIcon({ className: 'sres-ico', html: '<span class="sres' + (i === sel ? ' on' : '') + '">' + it.no + '</span>', iconSize: [0, 0] }),
        keyboard: false, zIndexOffset: i === sel ? 1000 : 0, pane: 'aidPane'
      });
      m.on('click', function (e) { L.DomEvent.stop(e); pick(i); });
      m.bindTooltip(UI.esc(it.name) + (it.info ? ' – ' + UI.esc(it.info) : '') + '<br>' + fmtKm(it.km) + ' · ' + G.fmtBrg(it.brg, 0), { direction: 'top', offset: [0, -12] });
      m.addTo(resLayer);
    });
  }
  // Näytä tulokset kartalla: lähialueen tulokset (tai kaikki, jos lähellä ei ole yhtään)
  function fitResults() {
    var pts = results.filter(function (it) { return !it.coord && it.km <= NEAR_KM; });
    if (!pts.length) pts = results.filter(function (it) { return !it.coord; });
    if (!pts.length) return;
    var b = L.latLngBounds(pts.map(function (it) { return [it.lat, it.lng]; }));
    global.App.fitTo(b.pad(0.25), { maxZoom: 13 });
  }

  function render(groups, pending) {
    results = []; sel = -1;
    var h = '', no = 0;
    groups.forEach(function (gr) {
      if (!gr.items.length) return;
      h += '<div class="sh">' + UI.esc(gr.title) + '</div>';
      gr.items.forEach(function (it) {
        results.push(it);
        var i = results.length - 1;
        if (!it.coord) it.no = ++no;
        var where = it.coord ? '' : '<em>' + fmtKm(it.km) + ' · ' + G.fmtBrg(it.brg, 0) + '</em>';
        h += '<div class="sr" data-i="' + i + '">' + (it.coord ? '' : '<i class="sn-no">' + it.no + '</i>') +
          '<div class="sr-t"><b>' + UI.esc(it.name) + '</b><span>' + UI.esc(it.info || '') + '</span></div>' + where + '</div>';
      });
    });
    var n = results.filter(function (it) { return !it.coord; }).length;
    if (!results.length) h = '<div class="sn">' + (pending ? 'Haetaan…' : 'Ei osumia. Kokeile nimen osaa tai koordinaatteja (esim. 61 35,1N 23 45,2E).') + '</div>';
    else {
      if (n > 1) h = '<div class="sr-top"><span>' + n + ' tulosta kartalla numeroituina, lähimmät ensin (etäisyys ja suunta kartan keskeltä)</span><button type="button" class="sr-fit">Näytä kartalla</button></div>' + h;
      if (pending) h += '<div class="sn">Haetaan lisää…</div>';
    }
    box.innerHTML = h;
    box.hidden = false;
    drawMarkers();
  }

  function run(q) {
    q = q.trim();
    var my = ++seq;
    if (q.length < 2) { box.hidden = true; clearMarkers(); return; }
    if (!ref) { var c = map.getCenter(); ref = { lat: c.lat, lng: c.lng }; }
    var groups = [];
    var p = G.parsePos(q);
    if (p) groups.push({ title: 'Koordinaatti', items: [{ name: G.fmtPos(p), info: 'siirry', lat: p.lat, lng: p.lng, coord: true }] });
    var mine = place(local(q)).slice(0, 8);
    groups.push({ title: 'Omat kohteet', items: mine });
    var more = q.length >= 3 && !p;
    render(groups, more);
    if (!more) return;
    remote(q, ref).then(function (all) {
      if (my !== seq) return;
      var near = all.filter(function (it) { return it.km <= NEAR_KM; }).slice(0, 25);
      var far = all.filter(function (it) { return it.km > NEAR_KM; }).slice(0, 15);
      groups.push({ title: 'Alle 27 mpk (50 km)', items: near });
      groups.push({ title: 'Kauempana', items: far });
      render(groups, false);
      var note = namesNote();
      if (note) box.insertAdjacentHTML('beforeend', '<div class="sn">' + UI.esc(note) + '</div>');
      // jos lähialueen tuloksia ei näy kartalla, siirretään kartta niihin kerran tätä hakua kohden
      var vis = global.App.visibleBounds(), nearPts = near.filter(function (it) { return vis.contains([it.lat, it.lng]); });
      if (near.length && !nearPts.length && fittedFor !== q) { fittedFor = q; fitResults(); }
    });
  }

  function pick(i) {
    var it = results[i];
    if (!it) return;
    box.hidden = true;
    input.blur();
    clearMarkers();
    ref = null; fittedFor = null;
    global.App.centerOn([it.lat, it.lng], Math.max(map.getZoom(), it.route ? 13 : 14));
    if (it.route && global.Routes) global.Routes.setHighlight(it.route, true);
    if (hlLayer) map.removeLayer(hlLayer);
    hlLayer = L.layerGroup([
      L.circleMarker([it.lat, it.lng], { radius: 16, color: '#c2188b', weight: 3, fill: false, interactive: false }),
      L.circleMarker([it.lat, it.lng], { radius: 3, color: '#c2188b', weight: 2, fillOpacity: 1, interactive: false })
    ]).addTo(map);
    var lay = hlLayer;
    setTimeout(function () { if (hlLayer === lay) { map.removeLayer(lay); hlLayer = null; } }, 8000);
  }

  // valinta listassa tai kartalla: korostetaan merkki ja tuodaan se näkyviin
  function select(i, scrollList) {
    sel = i;
    Array.prototype.forEach.call(box.querySelectorAll('.sr'), function (el) { el.classList.toggle('sel', Number(el.dataset.i) === sel); });
    drawMarkers();
    var it = results[sel];
    if (it && !it.coord && !global.App.visibleBounds().pad(-0.08).contains([it.lat, it.lng])) global.App.centerOn([it.lat, it.lng]);
    if (scrollList) { var el = box.querySelector('.sr[data-i="' + sel + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
  }
  function move(d) {
    if (!results.length) return;
    select((sel + d + results.length) % results.length, true);
  }

  function close(clear) {
    box.hidden = true;
    if (clear) { clearMarkers(); ref = null; fittedFor = null; }
  }

  function init(m) {
    map = m;
    input = UI.$('searchIn'); box = UI.$('searchRes');
    if (!input) return;
    resLayer = L.layerGroup().addTo(map);
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var v = input.value;
      if (!v.trim()) { close(true); return; }
      timer = setTimeout(function () { run(v); }, 350);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (sel >= 0) pick(sel);
        else if (results.length === 1) pick(0);
        else if (results.length) fitResults();
        else { clearTimeout(timer); run(input.value); }
      } else if (e.key === 'Escape') { close(true); input.blur(); }
      e.stopPropagation();
    });
    box.addEventListener('mousedown', function (e) {
      if (e.target.closest('.sr-fit')) { e.preventDefault(); fitResults(); return; }
      var el = e.target.closest('.sr');
      if (el) { e.preventDefault(); pick(Number(el.dataset.i)); }
    });
    box.addEventListener('mouseover', function (e) {
      var el = e.target.closest('.sr');
      if (el && Number(el.dataset.i) !== sel) { sel = Number(el.dataset.i); drawMarkers(); Array.prototype.forEach.call(box.querySelectorAll('.sr'), function (x) { x.classList.toggle('sel', x === el); }); }
    });
    // klikkaus kartalle sulkee listan mutta jättää numeroidut tulokset kartalle vertailua varten
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('#searchBox') && !e.target.closest('.sres-ico')) box.hidden = true; });
    input.addEventListener('focus', function () { if (box.innerHTML && input.value.trim().length >= 2) box.hidden = false; });
  }

  global.Search = { init: init, run: run, find: find, NEAR_KM: NEAR_KM, namesNote: namesNote, get hasNames() { return hasNames(); }, get results() { return results; } };
})(window);
