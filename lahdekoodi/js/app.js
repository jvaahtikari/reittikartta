/* Reittikartta – sovelluksen käynnistys: kartta, tilat, valikot, näppäimet,
 * tiedostojen tuonti ja vienti sekä asetukset. */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  S.load();
  var st = S.state.settings;
  if (st.night) document.body.classList.add('night');
  // puhelimessa kirjasto avataan tarvittaessa, jottei se peitä karttaa käynnistyksessä
  if (global.matchMedia('(max-width: 900px)').matches) st.panelOpen = false;
  if (!st.panelOpen) document.body.classList.add('panel-closed');

  // ---------- kartta ----------
  var map = L.map('map', {
    minZoom: 5, maxZoom: 20, zoomSnap: 1, doubleClickZoom: false, wheelPxPerZoomLevel: 80,
    zoomControl: true, attributionControl: true, worldCopyJump: false
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  if (st.view && st.view.zoom) map.setView([st.view.lat, st.view.lng], Math.min(20, st.view.zoom));
  else map.fitBounds([[61.48, 23.55], [62.0, 24.2]]);

  // ---------- tilat (harppi, suuntima, reitin lisäys, sijoitus, poiminta) ----------
  var mode = 'idle', handlers = null;
  var App = {
    mode: function () { return mode; },
    setMode: function (name, h) {
      if (mode !== 'idle') App.clearMode();
      mode = name; handlers = h || {};
      map.getContainer().classList.toggle('mode-cross', !!handlers.cursor || name === 'place' || name === 'pick');
      App.setLabel(handlers.label || '');
      syncToolbar();
    },
    clearMode: function () {
      var h = handlers;
      mode = 'idle'; handlers = null;
      map.getContainer().classList.remove('mode-cross');
      App.setLabel('');
      if (h && h.cancel) h.cancel();
      syncToolbar();
    },
    setLabel: function (t) { UI.readout({ mode: t }); },
    dispatchClick: function (ll) { if (handlers && handlers.click) handlers.click({ latlng: L.latLng(ll) }); },
    importFile: function () { UI.$('fileInput').click(); },
    closePanel: function () { if (st.panelOpen) UI.$('panelToggle').click(); },
    // Puhelimessa alhaalta avautuva kirjasto peittää kartan alaosan: keskitys ja rajaus tehdään näkyvään osaan.
    centerOn: function (ll, zoom) {
      var pad = sheetPad(); zoom = zoom == null ? map.getZoom() : zoom;
      if (!pad) { map.setView(ll, zoom); return; }
      // kohde näkyvän kaistan keskelle: yläreunan painikkeiden ja ilmoitusten alapuolelle, levyn yläpuolelle
      var shift = (pad - topPad()) / 2;
      map.setView(map.unproject(map.project(L.latLng(ll), zoom).add([0, shift]), zoom), zoom);
    },
    fitTo: function (b, opts) {
      opts = L.extend({}, opts || {});
      var pad = sheetPad();
      if (pad) { opts.paddingBottomRight = [0, pad]; opts.paddingTopLeft = [0, topPad()]; }
      map.fitBounds(b, opts);
    },
    visibleBounds: function () {
      var pad = sheetPad(), sz = map.getSize();
      return pad ? L.latLngBounds(map.containerPointToLatLng([0, 0]), map.containerPointToLatLng([sz.x, Math.max(1, sz.y - pad)])) : map.getBounds();
    },
    exportLibrary: exportLibrary,
    map: map
  };
  global.App = App;
  function topPad() {
    var m = map.getContainer().getBoundingClientRect(), b = m.top;
    ['baseSwitch', 'editBanner'].forEach(function (id) {
      var el = UI.$(id);
      if (el && !el.hidden && el.offsetParent) b = Math.max(b, el.getBoundingClientRect().bottom);
    });
    return Math.max(0, Math.round(b - m.top + 6));
  }
  function sheetPad() {
    if (!st.panelOpen || !UI.isPhone()) return 0;
    var p = UI.$('panel').getBoundingClientRect(), m = map.getContainer().getBoundingClientRect();
    return Math.max(0, Math.round(m.bottom - p.top));
  }

  map.on('click', function (e) { if (handlers && handlers.click) handlers.click(e); });
  map.on('mousemove', function (e) {
    UI.readout({ pos: e.latlng });
    if (handlers && handlers.move) handlers.move(e);
  });
  map.on('mouseout', function () { UI.readout({ pos: null }); });
  map.on('contextmenu', function (e) {
    if (handlers && handlers.menu) handlers.menu(e);
    else if (mode === 'idle') global.Tools.mapMenu(e);
    else App.clearMode();
  });
  map.on('dblclick', function (e) { if (mode === 'idle') map.panTo(e.latlng); });
  map.on('moveend', function () {
    var c = map.getCenter();
    st.view = { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() };
    S.save();
  });

  // ---------- moduulit ----------
  var chart = global.Chart.init(map, st.show, { statusEl: UI.$('netStatus') });
  global.ChartAPI = chart;
  chart.setLand(st.land || 'osm');
  chart.setUnderlay(!!st.show.underlay);
  chart.setMmlKey(st.mmlKey || '');
  if (st.show.sharpen === false) chart.base.charts.setSharpen(false);
  chart.setBase(st.base || 'raster');
  // ---------- syvä vesi / turvasyvyys ----------
  function safetyFor(v) {
    var d = (st.safetyDepths || {})[v || st.currentVessel];
    return d != null && isFinite(d) ? Number(d) : 2.0;
  }
  function applySafety() { chart.setSafety(st.show.safety ? safetyFor() : null, st.currentVessel); }
  function fmtDepth(v) { return G.fmtNum(v, v % 1 ? 1 : 0); }
  function safetyDialog() {
    var cur = safetyFor();
    UI.modal({
      title: 'Turvasyvyys' + (st.currentVessel ? ' – ' + st.currentVessel : ''),
      body: '<div class="form"><label for="sdVal">Turvasyvyys (m)</label><input id="sdVal" type="number" min="0.5" max="40" step="0.1" value="' + cur + '">' +
        '<p class="meta full">Turvasyvyys on aluksen syväys lisättynä pohjavaralla. Vesialue näytetään syvänä vetenä, kun sen pienin syvyys on vähintään turvasyvyys. ' +
        'Raja on aineiston lähin syvyyskäyrä, joka on vähintään turvasyvyys (esimerkiksi 2,4 m → 3 m käyrä), samoin kuin ECDISin turvakäyrä. ' +
        'Syvyysalueet tulevat Traficomin merikarttatietokannasta. Aineiston syvyysvälit vaihtelevat alueittain, ja rannikolla ne voivat olla karkeita (esimerkiksi 0–10 m).</p>' +
        '<p class="meta full">Arvo tallentuu aluskohtaisesti.</p></div>',
      onOpen: function () { var i = UI.$('sdVal'); i.focus(); i.select(); },
      enterButton: 1,
      buttons: [
        { label: 'Peruuta' },
        { label: 'Näytä syvä vesi', primary: true, action: function () {
          var v = parseFloat(String(UI.$('sdVal').value).replace(',', '.'));
          if (!isFinite(v) || v < 0.5 || v > 40) { UI.toast('Anna turvasyvyys väliltä 0,5–40 m.', true); return false; }
          st.safetyDepths = st.safetyDepths || {};
          st.safetyDepths[st.currentVessel] = Math.round(v * 10) / 10;
          st.show.safety = true; S.emit('settings');
        } }
      ]
    });
  }
  App.safetyDialog = safetyDialog;
  applySafety();
  global.Routes.init(map, App);
  global.Tools.init(map, App);
  global.Library.init(map, App);
  if (global.Search) global.Search.init(map);
  UI.startClock();
  // Selaimen zoomaus alle 100 %: karttakuvaa joudutaan pienentämään, jolloin se pehmenee.
  var zoomHinted = false;
  function zoomHint() {
    if (zoomHinted || (global.devicePixelRatio || 1) >= 0.95) return;
    zoomHinted = true;
    setTimeout(function () {
      UI.toast('Selaimen zoomaus on alle 100 %, joten merikartta näkyy pienennettynä ja pehmeämpänä. Terävin kuva saadaan selaimen zoomauksella 100 % (Ctrl+0); karttaa zoomataan hiiren rullalla.', true);
    }, 1500);
  }
  zoomHint();
  global.addEventListener('resize', zoomHint);

  S.on(function (what) {
    if (what === 'routes' || what === 'all') global.Routes.render();
    if (what === 'marks' || what === 'all') global.Tools.renderMarks();
    if (what === 'tasks' || what === 'all') global.Tools.renderTasks();
    if (what === 'settings' || what === 'all') {
      global.Tools.renderStation(); global.Tools.updateTaskReadout(); global.Routes.render();
      syncTop(); chart.refresh(); applySafety();
    }
    global.Library.render();
    syncToolbar();
  });
  global.Routes.onChange(function (what) { if (what === 'show') { syncToolbar(); S.save(); } });

  // ---------- yläpalkki ----------
  function syncTop() {
    var sel = UI.$('vesselSel');
    sel.innerHTML = (st.vessels.length
      ? st.vessels.map(function (v) { return '<option' + (v === st.currentVessel ? ' selected' : '') + '>' + UI.esc(v) + '</option>'; }).join('')
      : '<option value="" selected>Ei aluksia</option>') +
      '<option value="__edit">' + (st.vessels.length ? 'Muokkaa aluksia…' : 'Lisää alus…') + '</option>';
    UI.$('routeFilter').value = st.routeFilter;
    UI.$('panelToggle').setAttribute('aria-pressed', st.panelOpen ? 'true' : 'false');
  }
  UI.$('vesselSel').addEventListener('change', function () {
    if (this.value === '__edit') { this.value = st.currentVessel; settings(); return; }
    st.currentVessel = this.value; S.emit('settings');
  });
  UI.$('routeFilter').addEventListener('change', function () { st.routeFilter = this.value; S.emit('settings'); });
  UI.$('panelToggle').addEventListener('click', function () {
    st.panelOpen = !st.panelOpen;
    document.body.classList.toggle('panel-closed', !st.panelOpen);
    syncTop(); S.save();
    setTimeout(function () { map.invalidateSize(); chart.drawBorder(); }, 30);
  });
  syncTop();

  // ---------- työkalupalkki ----------
  function syncToolbar() {
    var on = handlers && handlers.button;
    UI.$('tbMeasure').classList.toggle('on', on === 'tbMeasure');
    UI.$('tbEbl').classList.toggle('on', on === 'tbEbl');
    UI.$('tbRoute').classList.toggle('on', mode === 'add');
    UI.$('tbNotes').classList.toggle('on', !!st.show.notes);
    UI.$('tbPasses').classList.toggle('on', !!st.show.passes);
    UI.$('tbDeep').classList.toggle('on', !!st.show.safety);
  }
  function toggleMeasure() { if (mode === 'measure') App.clearMode(); else global.Tools.startMeasure(); }
  function toggleEbl() { if (mode === 'ebl') App.clearMode(); else global.Tools.startEbl(); }
  UI.$('tbMeasure').addEventListener('click', toggleMeasure);
  UI.$('tbEbl').addEventListener('click', toggleEbl);
  UI.$('tbRoute').addEventListener('click', function () { if (mode === 'add') App.clearMode(); else global.Routes.startNew(); });
  UI.$('tbNotes').addEventListener('click', function () {
    st.show.notes = !st.show.notes;
    if (!st.show.notes) st.show.passes = false;           // sivuutukset eivät näy ilman nuotteja
    S.emit('routes');
  });
  UI.$('tbPasses').addEventListener('click', function () {
    st.show.passes = !st.show.passes;
    if (st.show.passes) st.show.notes = true;
    S.emit('routes');
  });
  UI.$('tbMark').addEventListener('click', function () {
    global.Tools.pick('Uusi merkki – klikkaa paikka kartalta', function (ll) { global.Tools.editMark(null, ll); });
  });
  UI.$('tbTask').addEventListener('click', function () { global.Tools.editTask(null, null); });

  // ---------- oma sijainti ----------
  // Selaimen sijainti (GPS puhelimessa) vain käyttäjän pyynnöstä: selain kysyy luvan ensimmäisellä kerralla.
  // Ensimmäinen sijainti keskitetään; jos sijainti on näkymän ulkopuolella, painike keskittää, muuten se lopettaa.
  var gps = { watch: null, layer: null, last: null, first: false };
  function gpsText(c) {
    var t = G.fmtPos({ lat: c.latitude, lng: c.longitude });
    if (c.speed != null && c.speed >= 0) t += ' · ' + G.fmtNum(c.speed * 3600 / G.NM, 1) + ' kn';
    if (c.heading != null && !isNaN(c.heading) && c.speed > 0.3) t += ' · ' + G.fmtBrg(c.heading, 0);
    return t + ' (±' + Math.round(c.accuracy) + ' m)';
  }
  function gpsShow(p) {
    var c = p.coords, ll = L.latLng(c.latitude, c.longitude);
    gps.last = ll;
    if (!gps.layer) gps.layer = L.layerGroup().addTo(map);
    gps.layer.clearLayers();
    L.circle(ll, { radius: c.accuracy, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.1, interactive: false }).addTo(gps.layer);
    var moving = c.heading != null && !isNaN(c.heading) && c.speed > 0.3;
    L.marker(ll, {
      icon: L.divIcon({ className: 'gps-ico', html: (moving ? '<span class="gps-dir" style="transform:rotate(' + Math.round(c.heading) + 'deg)"></span>' : '') + '<span class="gps-dot"></span>', iconSize: [0, 0] }),
      keyboard: false, zIndexOffset: 2000
    }).bindTooltip('Oma sijainti<br>' + UI.esc(gpsText(c)), { direction: 'top', offset: [0, -10] }).addTo(gps.layer);
    UI.readout({ gps: gpsText(c) });
    if (gps.first) { gps.first = false; App.centerOn(ll, Math.max(map.getZoom(), 14)); }
  }
  // Valinta muistetaan: puhelimessa sijainti käynnistyy oletuksena sovelluksen avautuessa (selain kysyy luvan),
  // ja jos käyttäjä lopettaa seurannan tai kieltää luvan, sitä ei enää käynnistetä itsestään.
  function gpsRemember(on) { if (st.gps !== on) { st.gps = on; S.save(); } }
  function gpsStop(byUser) {
    if (byUser) gpsRemember(false);
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null; gps.last = null;
    if (gps.layer) { map.removeLayer(gps.layer); gps.layer = null; }
    UI.$('tbGps').classList.remove('on');
    UI.readout({ gps: null });
  }
  function gpsStart(auto) {
    if (!navigator.geolocation) { if (!auto) UI.toast('Tämä selain ei anna sijaintia.', true); return; }
    if (global.isSecureContext === false) { if (!auto) UI.toast('Selain antaa sijainnin vain suojatulle (https) sivulle. Käytä verkkoversiota.', true); return; }
    if (!auto) gpsRemember(true);
    UI.$('tbGps').classList.add('on');
    gps.first = true;
    if (!auto) UI.toast('Haetaan sijaintia…');
    gps.watch = navigator.geolocation.watchPosition(gpsShow, function (err) {
      var msg = err.code === 1 ? 'Sijainnin käyttö on estetty. Salli se selaimen tai puhelimen asetuksista (iPhone: Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut → Safarin verkkosivustot), ja napauta sitten sijaintipainiketta.'
        : err.code === 3 ? 'Sijaintia ei saatu ajoissa. Yritetään edelleen.' : 'Sijaintia ei saatu.';
      UI.toast(msg, true);
      if (err.code === 1) gpsStop(true);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  UI.$('tbGps').addEventListener('click', function () {
    if (gps.watch == null) { gpsStart(); return; }
    if (gps.last && !App.visibleBounds().pad(-0.1).contains(gps.last)) { App.centerOn(gps.last); return; }
    gpsStop(true);
  });
  function gpsAuto() { return st.gps === true || (st.gps == null && UI.isTouch()); }
  App.gps = { get position() { return gps.last; }, stop: gpsStop };
  UI.$('tbDeep').addEventListener('click', function () {
    st.show.safety = !st.show.safety; S.emit('settings');
    if (st.show.safety) UI.toast('Syvä vesi: turvasyvyys ' + fmtDepth(safetyFor()) + ' m' + (st.currentVessel ? ' (' + st.currentVessel + ')' : '') + '. Muuta arvoa valikosta Näytä → Aseta turvasyvyys.');
  });
  syncToolbar();

  // ---------- valikot ----------
  function toggleShow(key, after) {
    return {
      label: null, checked: !!st.show[key], keepOpen: true,
      action: function () {
        st.show[key] = !st.show[key];
        if (after) after(st.show[key]);
        chart.refresh(); global.Routes.render(); syncToolbar(); S.save();
      }
    };
  }
  function item(label, obj) { obj.label = label; return obj; }

  var menus = {
    file: function () {
      return [
        { label: 'Tuo GPX-tiedosto…', action: App.importFile },
        { label: 'Vie reittikirjasto GPX-tiedostoksi', action: exportLibrary },
        { sep: true },
        { label: 'Tee varmuuskopio (JSON)', action: backup },
        { label: 'Palauta varmuuskopio…', action: App.importFile },
        { sep: true },
        { label: 'Asetukset…', action: settings }
      ];
    },
    tools: function () {
      return [
        { label: 'Uusi reitti', key: 'Ctrl+R', action: function () { global.Routes.startNew(); } },
        { label: 'Harppi', key: 'M', action: toggleMeasure },
        { label: 'Suuntima', key: 'F6', action: toggleEbl },
        { sep: true },
        { label: 'Reittikirjaston hallinta', action: function () { openPanel('routes'); } },
        { label: 'Lisää merkki kartalta', action: function () { UI.$('tbMark').click(); } },
        { label: 'Aseta asema kartalta', action: function () {
          global.Tools.pick('Asema – klikkaa paikka kartalta', function (ll) {
            st.station = { lat: ll.lat, lng: ll.lng, name: (st.station || {}).name || 'Asema' }; S.emit('settings');
          });
        } },
        global.Routes.editingId ? { label: 'Lopeta reitin muokkaus', action: function () { global.Routes.finishEdit(); } } : null
      ];
    },
    tasks: function () {
      return [
        { label: 'Uusi tehtävä…', action: function () { global.Tools.editTask(null, null); } },
        { label: 'Poimi tehtäväpaikka kartalta', action: function () {
          global.Tools.pick('Tehtäväpaikka – klikkaa paikka kartalta', function (ll) { global.Tools.editTask(null, ll); });
        } },
        { label: 'Tehtävälista', action: function () { openPanel('tasks'); } }
      ];
    },
    view: function () {
      function base(mode, label, key) {
        return { label: label, key: key, checked: (st.base || 'raster') === mode, action: function () {
          chooseBase(mode);
          if (mode === 'vector') UI.toast('Vektorikartta: syvyysalueet, -käyrät ja -luvut Traficomin merikarttatietokannasta, väylät ja turvalaitteet Väylävirastolta. Terävä kaikilla tasoilla, mutta ilman paperikartan nimistöä.');
          else if (mode !== 'raster') UI.toast('ENC-karttapohja: Traficomin S-57-palvelu. Missä ENC-aineistoa ei ole, näytetään rasterikartta.');
        } };
      }
      return [
        { head: 'Karttapohja' },
        base('raster', 'Karttapohja: rasterikartta (paperikartat)', 'R'),
        base('vector', 'Karttapohja: vektorikartta (terävä, syvyystietokanta)', 'V'),
        base('enc', 'Karttapohja: ENC, perinteiset symbolit', 'E'),
        base('enc-ecdis', 'Karttapohja: ENC, ECDIS-symbolit', 'Shift+E'),
        { head: 'Syvä vesi' },
        { label: 'Syvä vesi (turvasyvyys ' + fmtDepth(safetyFor()) + ' m)', checked: !!st.show.safety, action: function () {
          st.show.safety = !st.show.safety; S.emit('settings');
        } },
        { label: 'Aseta turvasyvyys…', action: safetyDialog },
        { head: 'Väylät, merkit ja valot' },
        item('Väylien suunnat molempiin suuntiin', toggleShow('bearings')),
        item('Kulkusyvyydet', toggleShow('depths')),
        item('Väylälinjat (ajantasainen aineisto)', toggleShow('lines')),
        item('Turvalaitteet (ajantasainen aineisto)', toggleShow('aids')),
        item('Turvalaitteiden nimet', toggleShow('aidNames')),
        item('Vesiliikennemerkit', toggleShow('signs')),
        { label: 'Loistot ja valosektorit', checked: st.show.lights === true || (st.show.lights == null && st.base === 'vector'), keepOpen: true, action: function () {
          var cur = st.show.lights === true || (st.show.lights == null && st.base === 'vector'); st.show.lights = !cur; chart.refresh(); S.save(); } },
        { label: 'Nopeusrajoitusalueet', checked: st.show.speed === true || (st.show.speed == null && st.base === 'vector'), keepOpen: true, action: function () {
          var cur = st.show.speed === true || (st.show.speed == null && st.base === 'vector'); st.show.speed = !cur; chart.refresh(); S.save(); } },
        { label: 'Laiturit ja aallonmurtajat (vektoripohja)', checked: st.show.piers !== false, keepOpen: true, action: function () {
          st.show.piers = st.show.piers === false; chart.refresh(); S.save(); } },
        { label: 'Kivet, karikot ja nimistö (MML, vektoripohja)', checked: st.show.mml !== false && chart.mmlInfo.available, keepOpen: true, action: function () {
          if (!chart.mmlInfo.available) { UI.closeMenu(); settings(); return; }
          st.show.mml = st.show.mml === false; chart.refresh(); S.save(); } },
        { head: 'Reitit' },
        item('Reittinuotit', toggleShow('notes', function (on) { if (!on) st.show.passes = false; })),
        item('Sivuutus- ja käännösetäisyydet', toggleShow('passes', function (on) { if (on) st.show.notes = true; })),
        { label: 'Reittilegien suuntanuotit', checked: st.show.legBrg !== false, keepOpen: true, action: function () { st.show.legBrg = st.show.legBrg === false; global.Routes.render(); S.save(); } },
        { label: 'Käännösmerkit 2 ja 1 kaapelia ennen käännöstä', checked: st.show.turnTicks !== false, keepOpen: true, action: function () { st.show.turnTicks = st.show.turnTicks === false; global.Routes.render(); S.save(); } },
        item('Uusi reitin korostus (kaikki reitit harmaalla)', toggleShow('hint')),
        { label: 'Kiinnitä reittipisteet väylän pisteisiin (Alt ohittaa)', checked: st.show.snap !== false, keepOpen: true, action: function () {
          st.show.snap = st.show.snap === false; chart.refresh(); global.Routes.render(); S.save();
        } },
        { sep: true },
        { label: 'Reitit tälle alukselle', checked: st.routeFilter === 'vessel', action: function () { st.routeFilter = 'vessel'; S.emit('settings'); } },
        { label: 'Kaikki reitit', checked: st.routeFilter === 'all', action: function () { st.routeFilter = 'all'; S.emit('settings'); } },
        { head: 'Maapohja ja näyttö' },
        item('Karttareunus (minuuttiasteikko)', toggleShow('border')),
        item('Maapohja merikartan alla (rasteri- ja ENC-pohjalla)', toggleShow('underlay', function (on) { chart.setUnderlay(on); })),
        { label: 'Maapohja: Maanmittauslaitoksen taustakartta', checked: st.land === 'mml', action: function () { st.land = 'mml'; chart.setLand('mml'); S.save(); } },
        { label: 'Maapohja: OpenStreetMap', checked: (st.land || 'osm') === 'osm', action: function () { st.land = 'osm'; chart.setLand('osm'); S.save(); } },
        { label: 'Terävä suurennus (rasteri)', checked: st.show.sharpen !== false, keepOpen: true, action: function () {
          st.show.sharpen = st.show.sharpen === false; chart.base.charts.setSharpen(st.show.sharpen); S.save();
        } },
        { label: 'Yönäyttö', checked: !!st.night, keepOpen: true, action: function () {
          st.night = !st.night; document.body.classList.toggle('night', st.night); chart.drawBorder(); S.save();
        } }
      ];
    },
    help: function () {
      return [
        { label: 'Pikaohje', action: help },
        { label: 'Aineistot ja käyttöehdot', action: sources },
        { label: 'Tietoja', action: about }
      ];
    }
  };

  document.querySelectorAll('.mi[data-menu]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = b.classList.contains('open');
      UI.closeMenu();
      if (wasOpen) return;
      b.classList.add('open');
      var r = b.getBoundingClientRect();
      UI.menu(r.left, r.bottom, menus[b.dataset.menu]());
    });
  });

  // kapealla näytöllä valikot ovat yhden valikkonapin takana; samassa valikossa alus ja näytettävät reitit
  var MENU_NAMES = [['file', 'Tiedosto'], ['tools', 'Työkalut'], ['tasks', 'Tehtävät'], ['view', 'Näytä'], ['help', 'Ohje']];
  // pitkä valikko (Näytä) jaetaan puhelimessa otsikoidensa mukaisiin osiin
  function sections(items) {
    var out = [], cur = null;
    items.forEach(function (it) {
      if (it && it.head) { cur = { title: it.head, items: [] }; out.push(cur); }
      else if (cur && it && !it.sep) cur.items.push(it);
    });
    return out;
  }
  function openSub(key, label, r) {
    var items = menus[key](), secs = UI.isPhone() ? sections(items) : [];
    if (secs.length > 1) {
      UI.menu(r.left, r.bottom, secs.map(function (sc) {
        return { label: sc.title, sub: true, action: function () {
          var fresh = sections(menus[key]()).filter(function (x) { return x.title === sc.title; })[0];      // valintojen nykytila
          UI.menu(r.left, r.bottom, fresh.items, sc.title, { back: function () { openSub(key, label, r); } });
        } };
      }), label, { back: function () { openRoot(r); } });
    } else UI.menu(r.left, r.bottom, items, label, { back: function () { openRoot(r); } });
  }
  function openRoot(r) {
    var items = MENU_NAMES.map(function (m) {
      return { label: m[1], sub: true, action: function () { openSub(m[0], m[1], r); } };
    });
    items.push({ sep: true });
    st.vessels.forEach(function (v) {
      items.push({ label: 'Alus: ' + v, checked: v === st.currentVessel, action: function () { st.currentVessel = v; S.emit('settings'); } });
    });
    items.push({ label: st.vessels.length ? 'Muokkaa aluksia…' : 'Lisää alus…', action: settings });
    items.push({ sep: true });
    items.push({ label: 'Reitit tälle alukselle', checked: st.routeFilter === 'vessel', action: function () { st.routeFilter = 'vessel'; S.emit('settings'); } });
    items.push({ label: 'Kaikki reitit', checked: st.routeFilter === 'all', action: function () { st.routeFilter = 'all'; S.emit('settings'); } });
    UI.$('menuBtn').classList.add('open');
    UI.menu(r.left, r.bottom, items, 'Valikko');
  }
  UI.$('menuBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var btn = this, wasOpen = btn.classList.contains('open');
    UI.closeMenu();
    if (wasOpen) return;
    openRoot(btn.getBoundingClientRect());
  });

  // lähdetiedot ovat puhelimessa yhdellä rivillä; napautus avaa koko tekstin
  map.attributionControl.getContainer().addEventListener('click', function (e) {
    if (e.target.tagName === 'A') return;
    this.classList.toggle('open');
  });

  function openPanel(tabName) {
    if (!st.panelOpen) UI.$('panelToggle').click();
    global.Library.setTab(tabName);
  }

  // ---------- karttapohjan valinta ----------
  // Rasteri- ja ENC-pohjaa näytetään tasolle 17 asti; sitä lähempänä kartta vaihtuu itsestään vektorikarttaan.
  // Jos rasteri tai ENC valitaan tätä lähempänä, kartta zoomataan tasolle 17, jotta valittu pohja näkyy.
  var BASE_NAMES = { raster: 'Rasterikartta', vector: 'Vektorikartta', enc: 'ENC, perinteiset symbolit', 'enc-ecdis': 'ENC, ECDIS-symbolit' };
  function chooseBase(mode) {
    st.base = mode; chart.setBase(mode); S.save();
    var zoomed = mode !== 'vector' && map.getZoom() > chart.maxChartZoom;
    if (zoomed) {
      map.setZoom(chart.maxChartZoom);
      UI.toast(BASE_NAMES[mode] + ': zoomattu tasolle ' + chart.maxChartZoom + ', karttapohjan tarkimpaan');
    }
    updateBaseSwitch();
  }
  // painikkeet kartan yläreunassa: valittu pohja korostettuna; jos vektorikartta on vaihtunut
  // itsestään (rasterin tai ENC:n tarkimman tason jälkeen), Vektori-painike on katkoviivoitettu
  var baseSwitch = UI.$('baseSwitch');
  function updateBaseSwitch() {
    var chosen = st.base || 'raster', shown = chart.shownBase;
    Array.prototype.forEach.call(baseSwitch.querySelectorAll('button[data-base]'), function (b) {
      var m = b.getAttribute('data-base');
      b.setAttribute('aria-checked', m === chosen ? 'true' : 'false');
      b.classList.toggle('auto', m === 'vector' && shown === 'vector' && chosen !== 'vector');
      if (m === 'vector') b.title = b.classList.contains('auto')
        ? 'Vektorikartta näytetään nyt itsestään, koska ' + (chosen === 'raster' ? 'rasterikartan' : 'ENC-kartan') + ' tarkkuus päättyy tasolla ' + chart.maxChartZoom + ' (V valitsee vektorikartan pysyvästi)'
        : 'Vektorikartta – terävä kaikilla tasoilla, tasolle 20 asti (V)';
    });
  }
  baseSwitch.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-base]');
    if (b) chooseBase(b.getAttribute('data-base'));
  });
  map.on('zoomend', updateBaseSwitch);
  updateBaseSwitch();

  // ---------- näppäimet ----------
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'Escape') {
      if (!UI.$('ctxmenu').hidden) { UI.closeMenu(); return; }
      if (UI.modalOpen) { UI.closeModal(); return; }
      if (mode !== 'idle') { App.clearMode(); return; }
      if (global.Routes.editingId) { global.Routes.finishEdit(); return; }
      if (global.Routes.highlightId) { global.Routes.clearHighlight(); return; }
      return;
    }
    if (typing || UI.modalOpen) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); global.Routes.startNew(); return; }
    if (e.key === 'F6') { e.preventDefault(); toggleEbl(); return; }
    if (handlers && handlers.key && handlers.key(e)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'm' || e.key === 'M')) { toggleMeasure(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
      var k = (e.key || '').toLowerCase();
      if (k === 'r') { chooseBase('raster'); return; }
      if (k === 'v') { chooseBase('vector'); return; }
      if (k === 'e') { chooseBase(e.shiftKey ? 'enc-ecdis' : 'enc'); return; }
    }
  });

  // ---------- tuonti ----------
  UI.$('fileInput').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || '');
      if (/\.json$/i.test(f.name) || /^\s*\{/.test(text)) restore(text, f.name);
      else importGpx(text, f.name);
    };
    rd.onerror = function () { UI.toast('Tiedoston lukeminen epäonnistui.', true); };
    rd.readAsText(f);
  });

  function importGpx(text, fname) {
    var data;
    try { data = global.GPX.parse(text); } catch (e) { UI.toast(e.message, true); return; }
    var n = data.routes.length + data.tracks.length + data.marks.length + data.tasks.length;
    if (!n) { UI.toast('Tiedostosta ei löytynyt reittejä, jälkiä eikä reittipisteitä.', true); return; }
    var hasMeta = data.routes.some(function (r) { return r.meta && r.meta.status === 'approved'; });
    var body = '<p>Tiedosto <b>' + UI.esc(fname) + '</b> sisältää:</p><div class="form">' +
      (data.routes.length ? '<label>Reitit</label><div class="checks"><label><input type="checkbox" id="iR" checked> ' + data.routes.length + ' reittiä luonnoksina</label></div>' : '') +
      (hasMeta ? '<label></label><div class="checks"><label><input type="checkbox" id="iKeep"> säilytä Reittikartan hyväksyntätiedot</label></div>' : '') +
      (data.tracks.length ? '<label>Jäljet</label><div class="checks"><label><input type="checkbox" id="iT" checked> tee ' + data.tracks.length + ' jäljestä reittiluonnokset</label></div>' : '') +
      (data.marks.length ? '<label>Reittipisteet</label><div class="checks"><label><input type="checkbox" id="iM" checked> ' + data.marks.length + ' omaksi merkiksi</label></div>' : '') +
      (data.tasks.length ? '<label>Tehtävät</label><div class="checks"><label><input type="checkbox" id="iK" checked> ' + data.tasks.length + ' tehtäväpaikkaa</label></div>' : '') +
      '</div><p class="meta">Tuodut reitit tulevat luonnoksina (ruskea). Ne hyväksytään uudelleen ominaisuuksista.</p>';
    UI.modal({
      title: 'Tuo GPX', body: body,
      buttons: [{ label: 'Peruuta' }, {
        label: 'Tuo', primary: true, action: function (m) {
          var chk = function (id) { var el = m.querySelector('#' + id); return el && el.checked; };
          var keep = chk('iKeep');
          var bounds = L.latLngBounds([]);
          var added = 0;
          if (chk('iR')) data.routes.forEach(function (rd) {
            var r = global.Routes.addImported(rd);
            if (!keep) { r.status = 'draft'; r.approver = ''; r.approvedAt = ''; }
            r.points.forEach(function (p) { bounds.extend([p.lat, p.lng]); }); added++;
          });
          if (chk('iT')) data.tracks.forEach(function (tr) {
            var r = global.Routes.fromTrack(tr, 12);
            r.points.forEach(function (p) { bounds.extend([p.lat, p.lng]); }); added++;
          });
          if (chk('iM')) data.marks.forEach(function (w) {
            S.state.marks.push({ id: S.uid('mk'), name: w.name, type: w.type || 'general', lat: w.lat, lng: w.lng, desc: w.desc, status: 'draft' });
            bounds.extend([w.lat, w.lng]);
          });
          if (chk('iK')) data.tasks.forEach(function (w) {
            S.state.tasks.push({ id: S.uid('tk'), name: w.name, lat: w.lat, lng: w.lng, time: w.time || '', active: false });
            bounds.extend([w.lat, w.lng]);
          });
          S.emit('all');
          if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
          openPanel('routes');
          UI.toast('Tuotu: ' + added + ' reittiä.');
        }
      }]
    });
  }

  function restore(text, fname) {
    var data;
    try { data = JSON.parse(text); } catch (e) { UI.toast('Varmuuskopio ei ole kelvollista JSON-muotoa.', true); return; }
    if (!data || !Array.isArray(data.routes)) { UI.toast('Tiedosto ei ole Reittikartan varmuuskopio.', true); return; }
    UI.confirm('Palautetaanko varmuuskopio "' + fname + '"? Nykyiset reitit, merkit ja tehtävät korvataan (' +
      data.routes.length + ' reittiä, ' + (data.marks || []).length + ' merkkiä, ' + (data.tasks || []).length + ' tehtävää).', 'Palauta', function () {
      S.replaceAll(data);
      st = S.state.settings;
      location.reload();
    }, true);
  }

  // ---------- vienti ----------
  function today() { var d = new Date(); return d.getFullYear() + '-' + G.pad(d.getMonth() + 1, 2) + '-' + G.pad(d.getDate(), 2); }
  function exportLibrary() {
    var routes = S.state.routes.filter(function (r) { return r.points.length >= 2; });
    if (!routes.length && !S.state.marks.length) { UI.toast('Kirjasto on tyhjä.'); return; }
    UI.download('reittikirjasto-' + today() + '.gpx', global.GPX.build({ routes: routes, marks: S.state.marks, tasks: S.state.tasks }), 'application/gpx+xml');
  }
  function backup() {
    UI.download('reittikartta-varmuuskopio-' + today() + '.json', JSON.stringify(S.state, null, 1), 'application/json');
  }

  // ---------- asetukset ----------
  function settings() {
    var body = '<div class="form">' +
      '<label for="sVes">Alukset</label><textarea id="sVes">' + UI.esc(st.vessels.join('\n')) + '</textarea>' +
      '<div class="hint">Yksi alus riviä kohti. Reitit hyväksytään aluskohtaisesti, ja turvasyvyys tallentuu aluksittain.</div>' +
      '<label for="sApp">Hyväksyjät</label><textarea id="sApp">' + UI.esc(st.approvers.join('\n')) + '</textarea>' +
      '<div class="hint">Muistetut hyväksyjien nimet. Yksi riviä kohti.</div>' +
      '<label for="sSpd">Oletusnopeus (kn)</label><input id="sSpd" type="number" min="1" max="60" value="' + st.speed + '">' +
      '<label for="sTurn">Käännösetäisyys (mpk)</label><input id="sTurn" type="number" min="0.1" max="10" step="0.1" value="' + st.turnWarnNM + '">' +
      '<div class="hint">Tätä pidempi käännösetäisyys näytetään punaisena.</div>' +
      '<label for="sMml">MML API-avain</label><input id="sMml" type="text" autocomplete="off" spellcheck="false" value="' + UI.esc(st.mmlKey || '') + '">' +
      '<div class="hint">Maanmittauslaitoksen avoimen rajapinnan maksuton avain (kivet, karikot, matalikot ja nimistö vektoripohjalle). Avaimen saa Maanmittauslaitoksen verkkosivuilta.' + (/^https?:$/.test(location.protocol) ? ' Verkkoversiossa avain on valmiiksi palvelimella, joten kenttä voi jäädä tyhjäksi.' : '') + '</div>' +
      '</div>';
    UI.modal({
      title: 'Asetukset', body: body,
      buttons: [{ label: 'Peruuta' }, { label: 'Tallenna', primary: true, action: function (m) {
        var lines = function (id) { return m.querySelector(id).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); };
        var ves = lines('#sVes');
        st.vessels = ves;
        if (ves.indexOf(st.currentVessel) < 0) st.currentVessel = ves[0] || '';
        st.approvers = lines('#sApp');
        st.speed = parseFloat(m.querySelector('#sSpd').value) || st.speed;
        st.turnWarnNM = parseFloat(m.querySelector('#sTurn').value) || st.turnWarnNM;
        st.mmlKey = m.querySelector('#sMml').value.trim();
        chart.setMmlKey(st.mmlKey);
        S.emit('settings');
      } }]
    });
  }

  // ---------- ohjeet ----------
  // merkkien selitys samoilla piirroksilla kuin kartalla (symbols.js)
  function legend() {
    var C = global.ChartSymbols;
    function cell(sym, txt) { return '<div class="lg-c"><span class="lg-s">' + sym.html + '</span><span>' + txt + '</span></div>'; }
    function grp(title, cells) { return '<div class="lg-h">' + title + '</div><div class="lg">' + cells.join('') + '</div>'; }
    return grp('Kivet', [cell(C.rock('above'), 'Vedenpäällinen kivi'), cell(C.rock('awash'), 'Vedenrajassa oleva kivi'), cell(C.rock('under'), 'Vedenalainen kivi'),
        cell(C.rock('above', true), 'Vedenpäällinen kivikko'), cell(C.rock('awash', true), 'Vedenrajassa oleva kivikko'), cell(C.rock('under', true), 'Vedenalainen kivikko')]) +
      grp('Viitat', [cell(C.mark(1), 'Vasen'), cell(C.mark(2), 'Oikea'), cell(C.mark(3), 'Pohjois'), cell(C.mark(4), 'Etelä'), cell(C.mark(6), 'Itä'), cell(C.mark(5), 'Länsi'),
        cell(C.mark(7), 'Karimerkki'), cell(C.mark(8), 'Turvavesi'), cell(C.mark(9), 'Erikoismerkki')]) +
      grp('Muut turvalaitteet ja valot', [cell(C.cairn(), 'Kummeli'), cell(C.beaconTower(), 'Tunnusmajakka'), cell(C.leadingMark(), 'Linjamerkki'), cell(C.lightStructure(), 'Loisto, apuloisto'),
        cell(C.lightLegend('v'), 'Valkoinen valo'), cell(C.lightLegend('p'), 'Punainen valo'), cell(C.lightLegend('vi'), 'Vihreä valo')]);
  }
  function help() {
    UI.modal({
      title: 'Pikaohje',
      body: '<div class="help">' +
        '<h3>Reitin tekeminen</h3><ol>' +
        '<li><b>Uusi reitti</b> (<kbd>Ctrl</kbd>+<kbd>R</kbd>): klikkaa reittipisteet kartalle. Lukemat oikeassa alakulmassa näyttävät suunnan, legin pituuden ja kokonaismatkan. <kbd>Del</kbd> poistaa viimeisen pisteen, <kbd>Esc</kbd> lopettaa.</li>' +
        '<li>Reitti siirtyy <b>muokkaustilaan</b> (ruskea ilmoitus). Vedä reittipisteitä. Oikea painike reittiviivalla: lisää reittipiste, suuntanuotit, sivuutusetäisyys. Oikea painike reittipisteessä: poista, käännösetäisyys, jatka reittiä.</li>' +
        '<li><b>Väyläkiinnitys</b>: kun osoitin on lähellä väylän käännöspistettä tai navigointilinjaa, piste kiinnittyy siihen (magentan rengas ja teksti lukemissa). Kiinnitetty piste on Väyläviraston väyläaineiston koordinaatissa, joka vastaa ENC-karttaa, eikä rasterikartan piirroksessa. Pidä <kbd>Alt</kbd> pohjassa, kun haluat vapaan pisteen. Kiinnitys toimii tasolta 11 alkaen ja sen voi kytkeä pois valikosta Näytä.</li>' +
        '<li>Myös <b>sivuutus- ja käännösetäisyyden kohde</b> kiinnittyy lähimpään Väyläviraston turvalaitteeseen (viitta, loisto, kummeli, linjamerkki) tasolta 12 alkaen. Kiinnitettävät turvalaitteet näkyvät kohdetta valittaessa magentoina renkaina. <kbd>Alt</kbd> ohittaa tämänkin kiinnityksen.</li>' +
        '<li><b>Suuntanuotit</b> ilmestyvät punaisina legien keskelle. Siirrä nuotti reittiviivan viereen, jolloin se vahvistuu vihreäksi.</li>' +
        '<li><b>Ominaisuudet</b>: Mistä – Kautta – Mihin muodostavat nimen. <b>Hyväksy omaan kirjastoon</b> kirjaa hyväksyjän ja alukset; reitti muuttuu pinkiksi.</li>' +
        '<li>Hyväksytyn reitin muokkaus aloitetaan erikseen kirjastosta, ja muutokset hyväksytään uudelleen.</li></ol>' +
        '<h3>Työkalut</h3><table>' +
        '<tr><td><kbd>M</kbd></td><td>Harppi – matka usean legin kautta (oikea painike: muuta reitiksi)</td></tr>' +
        '<tr><td><kbd>R</kbd></td><td>Karttapohjaksi rasterikartta</td></tr>' +
        '<tr><td><kbd>V</kbd></td><td>Karttapohjaksi vektorikartta</td></tr>' +
        '<tr><td><kbd>E</kbd> / <kbd>Shift</kbd>+<kbd>E</kbd></td><td>Karttapohjaksi ENC perinteisin / ECDIS-symbolein</td></tr>' +
        '<tr><td><kbd>F6</kbd></td><td>Suuntima – tosisuuntima ja etäisyys asemalta tai valitusta pisteestä</td></tr>' +
        '<tr><td><kbd>Esc</kbd></td><td>Lopettaa työkalun tai muokkauksen</td></tr>' +
        '<tr><td>Kaksoisklikkaus</td><td>Keskittää kartan</td></tr>' +
        '<tr><td>Oikea painike</td><td>Merkit, tehtäväpaikat, asema, koordinaattien kopiointi</td></tr></table>' +
        '<h3>Syvä vesi</h3><p>Työkalurivin aaltopainike tai <b>Näytä → Syvä vesi</b> värittää vesialueet aluksen turvasyvyyden mukaan: turvasyvyyttä syvempi vesi vaaleana, varottava vesi sinisenä ja niiden raja tummana viivana. Turvasyvyys asetetaan aluskohtaisesti (<b>Näytä → Aseta turvasyvyys</b>). Kartan oikeassa yläkulmassa näkyy, mikä syvyyskäyrä toimii rajana tässä näkymässä. Aineiston syvyysvälit ovat paikoin karkeita.</p>' +
        '<h3>Reitin suunnat ja käännösmerkit</h3><p>Jokaiselle kuvassa näkyvälle legille piirretään automaattisesti suuntanuotti: kulkusuunta isolla, nuoli kulkusuuntaan sekä vastasuunta ja legin pituus. Nuotti siirtyy legin näkyvälle osalle, kun karttaa liikutetaan, ja pitkällä legillä nuotteja on useampia. Jokaisen käännöksen eteen piirretään seuran käytännön mukaiset merkit 2 ja 1 kaapelia ennen käännöspistettä. Molemmat voi kytkeä pois valikosta Näytä.</p>' +
        '<h3>Karttamerkit</h3><p>Kivet, turvalaitteet ja valot piirretään Suomen merikarttojen merkeillä Traficomin virallisen merkkienselityksen mukaan, samoin kuin rasterikartassa.</p>' + legend() +
        '<h3>Loistot, sektorit ja muut väylätiedot</h3><p>Jokaisella loistolla, apuloistolla ja valaistulla viitalla on valon värinen pisara (valkoinen valo keltaisena, kuten merikartassa). Sektoriloistoilla näytetään lisäksi valosektorit värikaarina ja sektorirajat pisteviivoina sekä loistorekisterin valotunnus (esim. VQ (3) 5 s). Ympäri näkyvä valo piirretään valon värisenä renkaana. Valotiedot tulevat Väyläviraston turvalaite- ja loistorekistereistä, myös muiden väylänpitäjien laitteista. Lisäksi näytetään nopeusrajoitusalueet ja muiden väylänpitäjien (esim. kaupunkien) väylät ja turvalaitteet. Vektoripohjalla ne ovat oletuksena näkyvissä, muilla pohjilla ne saa päälle valikosta Näytä.</p>' +
        '<h3>Laiturit ja aallonmurtajat</h3><p>Vektorikartalla laiturit ja aallonmurtajat haetaan Maanmittauslaitoksen maastotietokannasta ja OpenStreetMapista ja piirretään veden päälle, koska maapohjan laiturit jäisivät vesialueen alle. Maanmittauslaitoksen laituriviivat tulevat aina, OpenStreetMapista lisätään alueina kartoitetut laiturit, aallonmurtajat ja pengerrykset, kun OpenStreetMapin Overpass-palvelu vastaa. Ensimmäinen haku uudelle alueelle voi kestää OSM:n palvelimen kuormasta riippuen puolikin minuuttia. Haetut alueet tallennetaan selaimeen 30 päiväksi, joten seuraavalla kerralla ne näkyvät heti. OpenStreetMap on vapaaehtoisten kartoittama, joten laiturit ovat yleensä oikeissa paikoissa, mutta niitä ei ole tarkastettu merenkulun tarpeisiin, ja kelluvat laiturit voivat olla kausittaisia.</p>' +
        '<h3>Maanmittauslaitoksen kivet, karikot ja nimistö</h3><p>Vektoripohjalle voi lisätä Maanmittauslaitoksen maastotietokannasta vedenalaiset (⊤), vedenpinnassa olevat (+) ja vedenpäälliset (⊥) kivet sekä vesikivikot ja matalikot, jotka rajataan mustalla pisteviivalla (vaarakäyrä). Vektorikartan maapohja on oletuksena OpenStreetMap, ja sen päällä näytetään myös nimistörekisterin paikannimet. Maanmittauslaitoksen taustakartan voi valita Näytä-valikosta. Verkkoversiossa Maanmittauslaitoksen aineisto toimii ilman omaa avainta. Tiedostona avattu versio tarvitsee maksuttoman API-avaimen, joka syötetään kohtaan <b>Tiedosto → Asetukset</b>. Maastotietokannan kivet on kartoitettu maastokartoituksessa, eivät merenmittauksessa.</p>' +
        '<h3>Vektorikartta</h3><p>Karttapohjaksi voi valita myös vektorikartan. Siinä syvyysalueet, syvyyskäyrät, syvyysluvut ja rantaviiva piirretään Traficomin merikarttatietokannasta ja väylät ja turvalaitteet Väyläviraston aineistosta, joten kartta on terävä kaikilla tasoilla ja kattaa myös Näsijärven. Maalla näkyy oletuksena OpenStreetMap ja sen päällä Maanmittauslaitoksen paikannimet. Paperikartan nimistö ja erikoismerkinnät puuttuvat.</p>' +
        '<h3>Paikkahaku ja koordinaatit</h3><p>Yläpalkin hakukenttään voi kirjoittaa paikannimen, turvalaitteen nimen tai numeron, oman merkin tai tehtävän nimen tai koordinaatin. Turvalaitteet haetaan Väyläviraston aineistosta. Paikannimet haetaan Maanmittauslaitoksen nimistörekisteristä. Verkkoversiossa nimistö toimii ilman omaa avainta, ja tiedostona avattu versio tarvitsee Maanmittauslaitoksen API-avaimen (Tiedosto → Asetukset).</p>' +
        '<p>Hakusanaksi riittää nimen alku: <b>viitas</b> löytää sekä Viitasaaret että Viitasalmet. Lähialueelta haetaan myös nimen keskeltä, joten <b>salmi</b> löytää esimerkiksi lähellä olevan Viitasalmen. Samannimisiä paikkoja on paljon, joten tulokset näytetään kartalla numeroituina ja listassa lähimmät ensin. Alle 27 meripeninkulman (50 km) päässä kartan keskeltä olevat ovat omana ryhmänään, ja jokaisella rivillä on etäisyys merimaileina ja suunta kartan keskeltä. Jos lähialueen tuloksia ei näy kartalla, kartta siirtyy niihin. <b>Näytä kartalla</b> (tai Enter) näyttää kaikki lähialueen tulokset. Nuolinäppäimet ja hiiren vienti listan riville korostavat tuloksen kartalla, ja tuloksen voi valita listasta tai klikkaamalla sen numeroa kartalla. Numerot jäävät kartalle vertailua varten, kunnes valitset paikan tai painat Esc.</p>' +
        '<p>Koordinaatissa asteen ja minuutin merkit voi korvata välilyönneillä. Heti perään kirjoitettu N tai E päättää luvun: <b>61 35,1N</b> = 61°35,1′N, <b>61 35 11N</b> = 61°35′11″N ja <b>61,5N</b> = 61°30′N. Leveys ja pituus erotetaan välilyönnillä tai pilkulla, esimerkiksi <b>61 35,1N 23 45,6E</b>. Tehtävän sijaintikentän alla näkyy heti, miten syöte tulkittiin.</p>' +
        '<h3>Tehtäväpaikan haku</h3><p>Uutta tehtävää luotaessa paikan voi hakea lomakkeen kentästä Hae paikka samalla tavalla kuin yläpalkista. Kun osuma valitaan, lomake väistyy ja paikka näytetään kartalla magentalla renkaalla. Muut osumat näkyvät numeroituina, ja numeron napautus vaihtaa paikan. Paikkaa voi tarkentaa vetämällä rengasta tai napauttamalla karttaa. Vahvista paikka palaa lomakkeelle uusi paikka valittuna, ja tehtävä luodaan vasta painikkeesta Luo tehtävä. Takaisin palaa lomakkeelle muuttamatta paikkaa.</p>' +
        '<h3>Oma sijainti</h3><p>Työkalupalkin sijaintipainike näyttää laitteen oman sijainnin sinisenä pisteenä ja tarkkuuden vaaleana ympyränä. Liikkeessä pisteen edessä on kulkusuunnan nuoli, ja lukemissa näkyvät sijainti, nopeus solmuina, kulku ja tarkkuus. Puhelimessa sijainti käynnistyy, kun sovellus avataan, ja selain kysyy luvan ensimmäisellä kerralla. Tietokoneella sijainti käynnistetään painikkeesta. Sijaintia ei tallenneta eikä lähetetä minnekään. Jos lopetat seurannan tai kiellät luvan, sovellus muistaa valinnan eikä käynnistä sijaintia enää itsestään. iPhonessa sijainnin pitää olla sallittu myös kohdassa Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut → Safarin verkkosivustot. Kun seuranta on päällä, painike keskittää kartan sijaintiin, jos se on näkymän ulkopuolella, ja muuten lopettaa seurannan. Sijainti toimii verkkoversiossa. Tiedostona avatussa sivussa selain ei välttämättä anna sijaintia.</p>' +
        '<h3>Puhelimessa ja tabletissa</h3><p>Kapealla näytöllä valikot ovat vasemman yläkulman valikkonapin takana, ja samasta valikosta valitaan alus ja näytettävät reitit. Puhelimessa valikko avautuu yläreunasta levynä, jossa on <b>Takaisin</b> ja <b>Sulje</b>, ja Näytä-valikko on jaettu osioihin. Jos valintoja on näkyvän osan alapuolella, levyn alareunassa lukee siitä. <b>Kirjasto</b> avautuu näytön alaosaan ja sulkeutuu itsestään, kun aloitat reitin tai muokkauksen. Kun kirjasto on auki, kartta keskitetään sen yläpuolelle jäävään osaan. Karttaa zoomataan nipistämällä, ja pitkä painallus vastaa hiiren oikeaa painiketta. Reittipisteitä lisättäessä ja harpilla mitattaessa ylhäällä ovat painikkeet <b>Poista viimeinen</b> ja <b>Valmis</b>, ja lukemat näyttävät juuri lisätyn välin suunnan ja pituuden.</p>' +
        '<h3>Karttapohja</h3><p>Kartan yläreunan painikkeilla <b>Rasteri</b>, <b>ENC</b>, <b>ECDIS</b> ja <b>Vektori</b>, valikosta <b>Näytä</b> tai näppäimillä <kbd>R</kbd>, <kbd>E</kbd>, <kbd>Shift</kbd>+<kbd>E</kbd> ja <kbd>V</kbd> voi valita rasterikartan (Traficomin paperikartat), vektorikartan tai ENC-kartan, jonka Traficomin palvelu piirtää ENC-aineistosta. ENC-aineistoa ei ole kaikilla vesillä, esimerkiksi Näsijärvellä. Silloin sovellus näyttää rasterikartan ja kertoo siitä kartan oikeassa yläkulmassa.</p>' +
        '<p>Rasteri- ja ENC-pohjaa näytetään tasolle 17 asti. Kun zoomaat sitä lähemmäs, kartta vaihtuu itsestään vektorikarttaan, jota voi suurentaa tasolle 20 asti (näytön leveydellä noin sata metriä). Uloszoomatessa palataan valittuun pohjaan. Kun vektorikartta on vaihtunut itsestään, Vektori-painike näkyy katkoviivoitettuna. Vektorikartan syvyysalueiden ja rantaviivan tarkkuus on merikarttatietokannan tarkkuus, joten suurennus ei tee aineistosta tarkempaa kuin se on.</p>' +
        '<h3>SARNav ja GPX</h3><p>Vie reitti GPX-tiedostoksi (reitin valikko tai kirjasto). Reitin pisteet siirtyvät OpenCPN-pohjaiseen ohjelmaan; suuntanuotit, sivuutukset ja hyväksyntätiedot säilyvät vain tämän sovelluksen omassa tiedostomuodossa. SARNavista viedyn GPX-reitin voi tuoda <b>Tiedosto → Tuo GPX</b>.</p>' +
        '<h3>Tallennus</h3><p>Reitit, merkit, tehtävät ja asetukset tallentuvat tämän selaimen muistiin tällä laitteella, eikä niitä lähetetä palvelimelle. Toisella laitteella tai toisella käyttäjällä on oma kirjastonsa. Tee säännöllisesti varmuuskopio (<b>Tiedosto → Tee varmuuskopio</b>), koska selaimen tietojen tyhjennys poistaa tiedot. iPhonessa sovellus kannattaa lisätä Koti-valikkoon (Jaa → Lisää Koti-valikkoon), koska Safari voi muuten tyhjentää tiedot, jos sivulla ei ole käyty noin viikkoon.</p>' +
        '</div>',
      buttons: [{ label: 'Sulje', primary: true }]
    });
  }

  function sources() {
    UI.modal({
      title: 'Aineistot ja käyttöehdot',
      body: '<div class="help">' +
        '<h3>Merikartat</h3><p>Rasterimerikartat: Liikenne- ja viestintävirasto Traficom, rasteripalvelu (WMTS), lisenssi CC BY 4.0. <b>Ei navigointikäyttöön. Ei täytä asianmukaisen merikartan vaatimuksia.</b> Kartan tarkin taso on 15; tasot 16–17 piirretään saman aineiston terävöitettynä suurennoksena, eikä niissä ole lisää tarkkuutta.</p>' +
        '<h3>ENC-karttapohja</h3><p>Valinnainen ENC-karttapohja: Liikenne- ja viestintävirasto Traficom, S-57 WMS -palvelu, lisenssi CC BY 4.0. <b>Ei navigointikäyttöön.</b> Palvelin piirtää ENC-aineiston kuvaksi, joten kartta on terävä kaikilla tasoilla. ENC kattaa rannikon ja osan sisävesistä (mm. Saimaan alueen). Missä ENC-aineistoa ei ole, esimerkiksi Näsijärvellä, sovellus näyttää rasterikartan.</p>' +
        '<h3>Syvyysalueet (syvä vesi)</h3><p>Sisältää Liikenne- ja viestintäviraston merikarttatietokannasta saatua tietoa ' + G.pad(new Date().getMonth() + 1, 2) + '/' + new Date().getFullYear() + ' (INSPIRE-palvelu, syvyysalueet). Tiedot haetaan palvelusta käytön aikana. Lisenssi sallii käytön muuhun kuin navigointiin ja ei-kaupallisesti; Traficomin määritelmän mukaan reitin suunnittelu on navigointia. Lisenssiteksti alla.</p>' +
        '<details><summary>Traficomin hydrografisen aineiston lisenssi (englanniksi, palvelun kuvauksesta)</summary><p class="meta">The Finnish Transport and Communications Agency\'s hydrographic data license. 1. General information: The Finnish Transport and Communications Agency (hereinafter the Licensor) as the holder of the incorporeal rights, has granted a license to use a copy of the data or part of it (hereinafter data) on the terms and conditions mentioned below. A Licensee is a natural or legal person, who uses the data covered by the license. The Licensee accepts the terms and conditions of this licence by receiving the data covered by the licence. This license agreement does not create a cooperation or business relationship between the Licensee and Licensor. 2. Terms and conditions of the licence. 2.1. Right of use: This licence grants a worldwide and free of charge parallel right of use. According to the terms and conditions of the licence, data received by the Licensor can for other than navigational purposes freely be: copied, distributed and published, modified and utilised non-commercially, combined with other products and, used as part of an application or service. Navigational purposes refer to all maritime operations, such as route planning, positioning, determining the best direction and ensuring the vessel\'s safe passage. 2.2. Duties and responsibilities of the License: When distributing the data or an application including the data it, the Licensee should in a reasonable way, in the distribution media or application used, mention: the name of the Licensor, the data and the time of the data transfer (for example: contains information received from the Finnish Transport and Communications Agency\'s nautical chart data base 06/2020) present a copy of this licence or a link to it, and omit the name of the Licensor in connection with the product or service, on the request of the Licensor. The Licensee must not in connection with the data that is being used indicate that the Licensor supports or recommends the the data use in question. 2.3 Duties and responsibilities of the Licensor: The Licensor is responsible for ensuring that the Licensor has the right to transfer the rights to the data covered by this license. The data has been licensed "as is", and the Licensor shall not be held responsible for any errors or omissions in the data, or any inconsistencies or discontinuities between the vertical coordinate reference systems used therein, disclaims any warranty for the validity or up-to-date status of the data and shall be free from liability for direct or consequential damages arising from the use of data provided by the Licensor, and is not obliged to ensure the continuous availability of the data, nor to announce in advance the interruption or cessation of availability, and the licensor shall be free from liability for direct or consequential damages arising from any such interruption or cessation. 3. Jurisdiction: Finnish law shall apply to this licence. 4. Amendments to this licence: The Licensor may at any time change the terms and conditions of the license or apply a different license to the material. The terms and conditions in this license shall, however, still apply to such data that has been transferred prior to the amendments to the terms and conditions or the change of the license.</p></details>' +
        '<h3>Maapohja</h3><p>Maanmittauslaitoksen taustakartta kartat.kapsi.fi-palvelun kautta, CC BY 4.0. OpenStreetMap-maapohja: &copy; OpenStreetMap-tekijät, ODbL; tiilet OpenStreetMap Foundationin palvelimilta. Koska tiedostona avattu sivu ei lähetä selaimen Referer-tietoa, sovellus tunnistaa itsensä OSM:n palvelimille erillisellä otsakkeella. Jos OSM muuttaa käytäntöään ja tiilet estyvät, käytä Maanmittauslaitoksen maapohjaa.</p>' +
        '<h3>Laiturit</h3><p>Laiturit, aallonmurtajat ja pengerrykset vektorikartalla: &copy; OpenStreetMap-tekijät, ODbL, haettu Overpass-rajapinnan kautta (overpass-api.de, varalla overpass.kumi.systems).</p>' +
        '<h3>Väylätiedot</h3><p>Navigointilinjat, väylät, turvalaitteet ja vesiliikennemerkit: Väylävirasto, avoin rajapinta, CC BY 4.0. Väylien suunnat ovat navigointilinjojen virallisia tosisuuntia, kun ne ovat saatavilla, muuten ne on laskettu linjan geometriasta (loksodromi).</p>' +
        '<h3>Sijaintitarkkuus</h3><p>Rasterimerikartta on skannattu paperikartta, ja sen piirros poikkeaa ENC-kartasta. Pistokokeissa väylälinjan sijainti rasterikartalla poikkesi ENC:stä tyypillisesti noin 5 metriä ja suurimmillaan noin 16 metriä (Savonlinna, Kyrönsalmi), ja Näsijärvellä koko piirros oli siirtynyt noin 5–6 metriä luoteeseen. Väyläviraston navigointilinjat poikkesivat ENC:stä noin 1–2 metriä. Siksi reittipisteet kiinnitetään väyläaineistoon ja sivuutus- ja käännösetäisyyksien kohteet Väyläviraston turvalaiterekisterin sijainteihin. Turvalaitteiden sijainteja ei ole mitattu erikseen ENC:tä vasten. Vapaa piste tai kohde perii rasterikartan virheen.</p>' +
        '<h3>Käyttötarkoitus</h3><p>Traficomin määritelmän mukaan aluksen reitin suunnittelu on navigointikäyttöä, johon avoin aineisto ei ole tarkoitettu. Tämä sovellus soveltuu koulutukseen, havainnollistamiseen ja reittien luonnosteluun. Ajettavat reitit tarkistetaan ja hyväksytään SARNavissa virallista ENC-merikarttaa vasten.</p>' +
        '<h3>Laskenta</h3><p>Suunnat ovat tosisuuntia ja matkat loksodromimatkoja WGS84-ellipsoidilla. 1 mpk = 1852 m, 1 kaapeli = 0,1 mpk.</p>' +
        '</div>',
      buttons: [{ label: 'Sulje', primary: true }]
    });
  }

  function about() {
    UI.modal({
      title: 'Tietoja',
      body: '<div class="help"><p><b>Reittikartta</b> on selainpohjainen reittisuunnittelun työkalu, jonka toiminnot mukailevat SARNav-karttaohjelmaa: reittiluonnos, suuntanuotit, sivuutus- ja käännösetäisyydet, hyväksyntä aluskohtaiseen reittikirjastoon, omat merkit ja tehtäväpaikat. Se ei ole Meripelastusseuran virallinen ohjelma.</p>' +
        '<p>Sovellus toimii selaimessa ilman asennusta, verkko-osoitteessa tai yhtenä tiedostona. Karttatiilet ja väylätiedot haetaan verkosta.</p></div>',
      buttons: [{ label: 'Sulje', primary: true }]
    });
  }

  // ---------- ensimmäinen käynnistys ----------
  if (!st.welcomed) {
    st.welcomed = true; S.save();
    setTimeout(function () {
      UI.modal({
        title: 'Tervetuloa Reittikarttaan',
        body: '<div class="help"><p>Kartta on Traficomin suomalainen merikartta. Väylille piirtyvät suunnat molempiin suuntiin (◂ ▸) ja kulkusyvyydet Väyläviraston ajantasaisesta aineistosta.</p>' +
          (UI.isTouch()
            ? '<p>Aloita reitti työkalupalkin reittipainikkeella tai kirjastosta <b>Uusi reitti</b>. Aseta asemasi kartalle pitkällä painalluksella, niin tehtäväpaikkojen suuntima ja etäisyys lasketaan siitä.</p>'
            : '<p>Aloita reitti painikkeella <b>Uusi reitti</b> tai <kbd>Ctrl</kbd>+<kbd>R</kbd>. Aseta asemasi kartalle oikealla painikkeella, niin tehtäväpaikkojen suuntima ja etäisyys lasketaan siitä.</p>') +
          '<p class="meta">Ei navigointikäyttöön. Ajettavat reitit tarkistetaan ja hyväksytään SARNavissa virallista ENC-karttaa vasten.</p></div>',
        buttons: [{ label: 'Pikaohje', action: function () { if (gpsAuto()) gpsStart(true); setTimeout(help, 0); } }, { label: 'Aloita', primary: true, action: function () { if (gpsAuto()) gpsStart(true); } }]
      });
    }, 400);
  } else if (gpsAuto()) setTimeout(function () { if (gps.watch == null) gpsStart(true); }, 600);
  if (!S.storageOk) UI.toast('Selaimen tallennustila ei ole käytettävissä. Tee varmuuskopio ennen sulkemista.', true);

  setTimeout(function () { map.invalidateSize(); chart.drawBorder(); }, 50);
  window.addEventListener('resize', function () { chart.drawBorder(); });
})(window);
