/* Reittikartta – paikkahaku: koordinaatit, omat kohteet, Väyläviraston turvalaitteet nimellä ja
 * numerolla, väylät, sulut ja avattavat sillat, Traficomin luotsipaikat ja VTS-ilmoittautumispisteet
 * sekä (API-avaimella tai välityspalvelulla) Maanmittauslaitoksen nimistörekisteri. Lisäksi haetaan
 * AIS-alukset nimen osalla, kutsutunnuksella ja MMSI-numeron alulla (ais.js).
 * Haku ei lue nimiä karttakuvasta, joten se toimii samoin kaikilla karttapohjilla.
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
  function wfs(layer, cql) {
    return fetch(VAYLA + '&TYPENAME=' + layer + '&CQL_FILTER=' + encodeURIComponent(cql))
      .then(function (r) { return r.ok ? r.json() : { features: [] }; })
      .then(function (j) { return j.features || []; }, function () { return []; });
  }
  function esc(q) { return q.replace(/'/g, "''"); }
  // geometrian edustava piste: piste sellaisenaan, viivalta keskimmäinen piste, alueelta reunan keskiarvo
  function repPoint(g) {
    if (!g) return null;
    var c = g.coordinates;
    if (g.type === 'Point') return c;
    if (g.type === 'MultiPoint') return c[0];
    if (g.type === 'LineString') return c[Math.floor(c.length / 2)];
    if (g.type === 'MultiLineString') { var all = [].concat.apply([], c); return all[Math.floor(all.length / 2)]; }
    var ring = g.type === 'Polygon' ? c[0] : g.type === 'MultiPolygon' ? c[0][0] : null;
    if (!ring || !ring.length) return null;
    var sx = 0, sy = 0; ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / ring.length, sy / ring.length];
  }
  function lineOf(g) {
    if (!g) return null;
    if (g.type === 'LineString') return g.coordinates.map(function (p) { return [p[1], p[0]]; });
    if (g.type === 'MultiLineString') return g.coordinates.map(function (c) { return c.map(function (p) { return [p[1], p[0]]; }); });
    return null;
  }
  // Väyläviraston turvalaitteet nimellä; pelkkä numero hakee turvalaitenumerolla (alusta)
  function aids(q) {
    var num = /^\d{2,}$/.test(q);
    var cql = num ? "turvalaitenumero LIKE '" + esc(q) + "%'" : "nimifi ILIKE '%" + esc(q) + "%'";
    var layers = ['vesivaylatiedot:turvalaitteet_uusi', 'vesivaylatiedot:turvalaitteet_muut_vaylanpitajat'];
    return Promise.all(layers.map(function (l) { return wfs(l, cql); })).then(function (lists) {
      var out = [];
      lists.forEach(function (fs) {
        fs.forEach(function (f) {
          var c = repPoint(f.geometry), p = f.properties || {};
          if (!c) return;
          out.push({ name: p.nimifi || 'Turvalaite', info: 'turvalaite, ' + (p.turvalaitetyyppifi || '').toLowerCase() + (p.turvalaitenumero ? ' ' + p.turvalaitenumero : ''), lat: c[1], lng: c[0], aid: true });
        });
      });
      return out;
    });
  }
  // Väyläviraston väylät nimellä: osuma osoittaa väylän keskikohtaan, ja valinta korostaa koko väylän
  function fairways(q) {
    if (/^\d+$/.test(q)) return Promise.resolve([]);
    return wfs('vesivaylatiedot:vaylat_uusi', "nimifi ILIKE '%" + esc(q) + "%'").then(function (fs) {
      var out = [];
      fs.forEach(function (f) {
        var c = repPoint(f.geometry), p = f.properties || {};
        if (!c) return;
        out.push({ name: p.nimifi || 'Väylä', info: 'väylä' + (p.vaylaluokkafi ? ', ' + p.vaylaluokkafi : '') + (p.mitoitussyvays != null ? ', ' + G.fmtNum(Number(p.mitoitussyvays), 1) + ' m' : ''), lat: c[1], lng: c[0], line: lineOf(f.geometry) });
      });
      return out;
    });
  }
  // sulut, kanavat ja avattavat sillat
  function canals(q) {
    if (/^\d+$/.test(q)) return Promise.resolve([]);
    return wfs('vesivaylatiedot:sulkukanavat_uusi', "nimi ILIKE '%" + esc(q) + "%'").then(function (fs) {
      var out = [];
      fs.forEach(function (f) {
        var c = repPoint(f.geometry), p = f.properties || {};
        if (!c) return;
        var kind = (p.kanavaaluetyyppi || 'kanava').toLowerCase();
        out.push({ name: p.nimi || 'Kanava', info: kind + (p.vesisto ? ', ' + p.vesisto : '') + (p.alussyvyys != null ? ', syväys ' + G.fmtNum(Number(p.alussyvyys), 1) + ' m' : ''), lat: c[1], lng: c[0] });
      });
      return out;
    });
  }
  // Traficomin luotsipaikat ja VTS-ilmoittautumispisteet: palvelu ei vastaa selaimen suodatettuihin
  // kyselyihin, joten koko pieni aineisto (noin sata pistettä) haetaan kerran ja suodatetaan täällä.
  var TRAFICOM = 'https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&TYPENAME=';
  var traficomCache = null;
  function traficomPoints() {
    if (traficomCache) return traficomCache;
    var layers = [['avoin:PilotBoardingPlace_P', 'luotsipaikka'], ['avoin:Rdocal_P', 'VTS-ilmoittautumispiste']];
    traficomCache = Promise.all(layers.map(function (l) {
      return fetch(TRAFICOM + l[0]).then(function (r) { return r.ok ? r.json() : { features: [] }; }).then(function (j) {
        return (j.features || []).map(function (f) {
          var c = repPoint(f.geometry), p = f.properties || {};
          if (!c || !p.OBJNAM) return null;
          return { name: p.OBJNAM, info: l[1] + (p.INFORM ? ', ' + p.INFORM : ''), lat: c[1], lng: c[0] };
        }).filter(Boolean);
      }, function () { return []; });
    })).then(function (lists) { return lists[0].concat(lists[1]); });
    traficomCache.then(function (all) { if (!all.length) traficomCache = null; });   // yritetään uudelleen seuraavalla haulla
    return traficomCache;
  }
  function traficom(q) {
    if (/^\d+$/.test(q)) return Promise.resolve([]);
    var n = norm(q);
    return traficomPoints().then(function (all) { return all.filter(function (it) { return norm(it.name).indexOf(n) >= 0; }); });
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
      aids(q), fairways(q), canals(q), traficom(q),
      hasNames() ? global.ChartAPI.searchNames(q, at).catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (res) {
      return place(res[4].concat(res[0], res[1], res[2], res[3]), at);
    });
  }
  // AIS-alukset nimen osalla, kutsutunnuksella tai MMSI-numerolla. Lupaus ei hylkäydy: virhe antaa tyhjän listan.
  function ships(q, at) {
    if (!global.Ais) return Promise.resolve([]);
    return global.Ais.search(q, at || ref).then(function (list) { return list; }, function () { return []; });
  }
  // Haku muille toiminnoille (tehtäväpaikka): koordinaatti, omat kohteet, AIS-alukset, turvalaitteet ja paikannimet
  // yhtenä listana lähimmästä kauimpaan. Palauttaa lupauksen.
  function find(q, at) {
    q = String(q || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    var p = G.parsePos(q);
    if (p) return Promise.resolve(place([{ name: G.fmtPos(p), info: 'koordinaatti', lat: p.lat, lng: p.lng, coord: true }], at));
    var mine = local(q);
    if (q.length < 3) return ships(q, at).then(function (sh) { return place(mine.concat(sh), at); });
    return Promise.all([remote(q, at), ships(q, at)]).then(function (res) {
      var all = place(mine.concat(res[1], res[0]), at);
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
        keyboard: false, zIndexOffset: i === sel ? 1000 : 0, pane: it.ais ? 'markerPane' : 'aidPane'
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

  function render(groups, pending, notes) {
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
    (notes || []).forEach(function (t) { if (t) h += '<div class="sn">' + UI.esc(t) + '</div>'; });
    box.innerHTML = h;
    box.hidden = false;
    drawMarkers();
  }

  function run(q) {
    q = q.trim();
    var my = ++seq;
    if (q.length < 2) { box.hidden = true; clearMarkers(); return; }
    if (!ref) { var c = map.getCenter(); ref = { lat: c.lat, lng: c.lng }; }
    // Tulosryhmät kootaan sitä mukaa kuin tieto saapuu: omat kohteet heti, alukset ja muu aineisto kun haku valmistuu.
    var cur = { coord: null, mine: [], ais: null, near: null, far: null, notes: [] };
    var p = G.parsePos(q);
    if (p) cur.coord = { name: G.fmtPos(p), info: 'siirry', lat: p.lat, lng: p.lng, coord: true };
    cur.mine = place(local(q)).slice(0, 8);
    var waiting = 0;
    function groups() {
      var g = [];
      if (cur.coord) g.push({ title: 'Koordinaatti', items: [cur.coord] });
      g.push({ title: 'Omat kohteet', items: cur.mine });
      if (cur.ais) g.push({ title: 'AIS-alukset', items: cur.ais });
      if (cur.near) { g.push({ title: 'Alle 27 mpk (50 km)', items: cur.near }); g.push({ title: 'Kauempana', items: cur.far }); }
      return g;
    }
    function show() { render(groups(), waiting > 0, cur.notes); }
    var wantRemote = q.length >= 3 && !p, wantShips = !p && !!global.Ais;
    if (wantRemote) waiting++;
    if (wantShips) waiting++;
    show();
    if (wantShips) {
      ships(q, ref).then(function (list) {
        if (my !== seq) return;
        cur.ais = place(list).slice(0, 10);
        var note = global.Ais.searchNote();
        if (note && !list.length) cur.notes.push(note);
        waiting--; show();
      });
    }
    if (wantRemote) {
      remote(q, ref).then(function (all) {
        if (my !== seq) return;
        var near = all.filter(function (it) { return it.km <= NEAR_KM; }).slice(0, 25);
        var far = all.filter(function (it) { return it.km > NEAR_KM; }).slice(0, 15);
        cur.near = near; cur.far = far;
        var note = namesNote();
        if (note) cur.notes.unshift(note);
        waiting--; show();
        // jos lähialueen tuloksia ei näy kartalla, siirretään kartta niihin kerran tätä hakua kohden
        var vis = global.App.visibleBounds(), nearPts = near.filter(function (it) { return vis.contains([it.lat, it.lng]); });
        if (near.length && !nearPts.length && fittedFor !== q) { fittedFor = q; fitResults(); }
      });
    }
  }

  function pick(i) {
    var it = results[i];
    if (!it) return;
    box.hidden = true;
    input.blur();
    clearMarkers();
    ref = null; fittedFor = null;
    if (it.ais && global.Ais) {
      // alus keskitetään ja sen kortti avataan, jolloin AIS-kerros kytketään tarvittaessa päälle
      global.App.centerOn([it.lat, it.lng], Math.max(map.getZoom(), 13));
      global.Ais.open(it.mmsi);
      return;
    }
    global.App.centerOn([it.lat, it.lng], Math.max(map.getZoom(), it.route ? 13 : 14));
    if (it.route && global.Routes) global.Routes.setHighlight(it.route, true);
    if (hlLayer) map.removeLayer(hlLayer);
    hlLayer = L.layerGroup([
      L.circleMarker([it.lat, it.lng], { radius: 16, color: '#c2188b', weight: 3, fill: false, interactive: false }),
      L.circleMarker([it.lat, it.lng], { radius: 3, color: '#c2188b', weight: 2, fillOpacity: 1, interactive: false })
    ]).addTo(map);
    // väylä korostetaan koko pituudeltaan ja sovitetaan näkymään
    if (it.line) {
      var pl = L.polyline(it.line, { color: '#c2188b', weight: 5, opacity: 0.6, interactive: false }).addTo(hlLayer);
      global.App.fitTo(pl.getBounds().pad(0.2), { maxZoom: 14 });
    }
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
