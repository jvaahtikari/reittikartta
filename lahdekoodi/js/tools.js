/* Reittikartta – harppi, suuntima, omat merkit, tehtäväpaikat ja asema. */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  var map, App, markLayer, taskLayer, stationLayer, tempLayer;
  var RED = '#d22a2a';

  // ---------- symbolit ----------
  var MARK_TYPES = [
    ['general', 'Yleinen merkki'], ['observation', 'Havaintopiste'], ['danger', 'Kivi / vaara'], ['shallow', 'Matala'],
    ['port', 'Lateraali vasen'], ['starboard', 'Lateraali oikea'],
    ['north', 'Kardinaali pohjoinen'], ['east', 'Kardinaali itä'], ['south', 'Kardinaali etelä'], ['west', 'Kardinaali länsi'],
    ['speed', 'Nopeusrajoitus'], ['service', 'Huolto / laituri']
  ];
  function typeName(t) { var f = MARK_TYPES.find(function (x) { return x[0] === t; }); return f ? f[1] : 'Merkki'; }

  // Viittatyypit piirretään samoilla Suomen merikarttojen merkeillä kuin Väyläviraston turvalaitteet.
  var MARK_NL = { port: 1, starboard: 2, north: 3, south: 4, west: 5, east: 6 };
  function markSym(t) {
    if (MARK_NL[t]) return global.ChartSymbols.mark(MARK_NL[t]);
    return { html: markSvg(t), w: 22, h: 22, ax: 11, ay: 11 };
  }
  function markSvg(t) {
    var Y = '#f2c200', K = '#111';
    var spar = function (bands, top) {
      var s = '<svg viewBox="0 0 20 22" width="20" height="22"><g transform="rotate(18 10 19.5)">';
      bands.forEach(function (b) { s += '<rect x="8.4" y="' + (8 + b[1] * 11) + '" width="3.2" height="' + ((b[2] - b[1]) * 11) + '" fill="' + b[0] + '"/>'; });
      s += '<rect x="8.4" y="8" width="3.2" height="11" fill="none" stroke="#111" stroke-width=".8"/>' + (top || '') + '</g><circle cx="10" cy="19.5" r="1.5" fill="#111"/></svg>';
      return s;
    };
    var cone = function (up, y) { return up ? '<path d="M10 ' + y + 'L12.6 ' + (y + 3.2) + 'L7.4 ' + (y + 3.2) + 'Z" fill="#111"/>' : '<path d="M7.4 ' + y + 'L12.6 ' + y + 'L10 ' + (y + 3.2) + 'Z" fill="#111"/>'; };
    switch (t) {
      case 'port': return spar([['#d7191c', 0, 1]], '<rect x="8.2" y="4.4" width="3.6" height="3" fill="#d7191c" stroke="#111" stroke-width=".6"/>');
      case 'starboard': return spar([['#14853b', 0, 1]], '<path d="M10 3.6L12.4 7.4H7.6Z" fill="#14853b" stroke="#111" stroke-width=".6"/>');
      case 'north': return spar([[K, 0, .5], [Y, .5, 1]], cone(true, .6) + cone(true, 4.2));
      case 'south': return spar([[Y, 0, .5], [K, .5, 1]], cone(false, .6) + cone(false, 4.2));
      case 'east': return spar([[K, 0, .33], [Y, .33, .67], [K, .67, 1]], cone(true, .6) + cone(false, 4.2));
      case 'west': return spar([[Y, 0, .33], [K, .33, .67], [Y, .67, 1]], cone(false, .6) + cone(true, 4.2));
      // kivi tai muu vaara: vedenalaisen kiven merkki (⊤) mustan vaarakäyrän (pisteviiva) sisällä
      case 'danger': return '<svg viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="8.5" fill="rgba(159,202,238,.55)" stroke="#111" stroke-width="1.4" stroke-dasharray=".1 2.6" stroke-linecap="round"/><path d="M6.5 8.5H15.5M11 8.5V15" stroke="#111" stroke-width="1.6"/></svg>';
      case 'shallow': return '<svg viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="8.5" fill="#bfe0f5" stroke="#0b4f7a" stroke-width="1.6" stroke-dasharray="2.2 1.6"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="#0b4f7a" font-family="Segoe UI,Arial">M</text></svg>';
      case 'speed': return '<svg viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="8.5" fill="#fff" stroke="#d7191c" stroke-width="3"/><text x="11" y="14.6" text-anchor="middle" font-size="8.5" font-weight="700" fill="#111" font-family="Segoe UI,Arial">km/h</text></svg>';
      case 'service': return '<svg viewBox="0 0 22 22" width="22" height="22"><rect x="3" y="3" width="16" height="16" rx="2" fill="#1f4fa3" stroke="#fff" stroke-width="1.2"/><path d="M7 15V8h5a2.5 2.5 0 0 1 0 5H7" fill="none" stroke="#fff" stroke-width="1.8"/></svg>';
      case 'observation': return '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M11 2L20 18H2Z" fill="#fff" stroke="#111" stroke-width="1.6"/><circle cx="11" cy="13" r="2" fill="#111"/></svg>';
      default: return '<svg viewBox="0 0 22 22" width="22" height="22"><circle cx="11" cy="11" r="7" fill="#fff" stroke="#111" stroke-width="1.8"/><circle cx="11" cy="11" r="2.2" fill="#111"/></svg>';
    }
  }

  function taskSvg(active) {
    var c = active ? '#c8102e' : '#8b1a2b';
    return '<svg viewBox="0 0 30 30" width="30" height="30"><circle cx="15" cy="15" r="12" fill="none" stroke="#fff" stroke-width="4.5"/><circle cx="15" cy="15" r="12" fill="none" stroke="' + c + '" stroke-width="2.4"/>' +
      '<circle cx="15" cy="15" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="15" cy="15" r="6.5" fill="none" stroke="' + c + '" stroke-width="2.2"/></svg>';
  }

  // ---------- harppi ----------
  var measure = null;
  function startMeasure(first) {
    measure = { pts: [] };
    var line = L.polyline([], { color: RED, weight: 2, interactive: false }).addTo(tempLayer);
    var rubber = L.polyline([], { color: RED, weight: 1.5, dashArray: '5 5', interactive: false }).addTo(tempLayer);
    var dots = L.layerGroup().addTo(tempLayer);
    function total() {
      var s = 0;
      for (var i = 1; i < measure.pts.length; i++) s += G.distance(measure.pts[i - 1], measure.pts[i]);
      return s;
    }
    function add(ll) {
      measure.pts.push({ lat: ll.lat, lng: ll.lng });
      line.setLatLngs(measure.pts.map(function (p) { return [p.lat, p.lng]; }));
      L.circleMarker(ll, { radius: 3, color: RED, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(dots);
    }
    // kosketusnäytöllä viimeisen välin suunta ja pituus sekä kokonaismatka
    function lastLeg() {
      var n = measure.pts.length, a = measure.pts[n - 2], b = measure.pts[n - 1];
      UI.readout(a ? { brg: G.bearing(a, b), dist: G.distance(a, b), total: total() } : { brg: null, dist: null, total: 0 });
    }
    function removeLast() {
      if (!measure.pts.length) return;
      measure.pts.pop();
      line.setLatLngs(measure.pts.map(function (p) { return [p.lat, p.lng]; }));
      var ls = dots.getLayers(); if (ls.length) dots.removeLayer(ls[ls.length - 1]);
      lastLeg();
    }
    function upd(ll) {
      var last = measure.pts[measure.pts.length - 1];
      if (!last) return;
      rubber.setLatLngs([[last.lat, last.lng], [ll.lat, ll.lng]]);
      var d = G.distance(last, ll);
      UI.readout({ brg: G.bearing(last, ll), dist: d, total: total() + d });
    }
    App.setMode('measure', {
      label: 'Harppi', cursor: true, button: 'tbMeasure',
      click: function (e) { add(e.latlng); if (UI.isTouch()) lastLeg(); else upd(e.latlng); },
      move: function (e) { upd(e.latlng); },
      key: function (e) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && measure.pts.length) {
          e.preventDefault();
          removeLast();
          return true;
        }
        return false;
      },
      menu: function (e) {
        UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
          { label: 'Lopeta mittaus', key: 'Esc', action: function () { App.clearMode(); } },
          { label: 'Muuta reitiksi', disabled: measure.pts.length < 2, action: function () {
            var pts = measure.pts.slice(); App.clearMode();
            var r = S.newRoute(pts); S.emit('routes'); global.Routes.enterEdit(r.id);
          } }
        ], 'Harppi');
      },
      cancel: function () {
        tempLayer.clearLayers(); measure = null; UI.clearMeasure();
        if (UI.isTouch()) { UI.banner(null); if (global.Routes.editingId) global.Routes.updateBanner(); }
      }
    });
    if (UI.isTouch()) UI.banner({
      kind: 'adding', text: 'Harppi – napauta pisteet kartalle.',
      buttons: [
        { label: 'Poista viimeinen', action: function () { removeLast(); } },
        { label: 'Muuta reitiksi', action: function () {
          if (measure.pts.length < 2) { UI.toast('Reittiin tarvitaan vähintään kaksi pistettä.'); return; }
          var pts = measure.pts.slice(); App.clearMode();
          var r = S.newRoute(pts); S.emit('routes'); global.Routes.enterEdit(r.id);
        } },
        { label: 'Valmis', action: function () { App.clearMode(); } }
      ]
    });
    if (first) add(first);
  }

  // ---------- suuntima ----------
  function startEbl(origin) {
    var st = S.state.settings.station;
    var o = origin || (st ? { lat: st.lat, lng: st.lng } : null);
    var line = L.polyline([], { color: '#0b4f7a', weight: 1.6, dashArray: '7 5', interactive: false }).addTo(tempLayer);
    var ring = L.circle([0, 0], { radius: 1, color: '#0b4f7a', weight: 1, dashArray: '3 6', fill: false, interactive: false });
    var dot = null;
    function setO(ll) {
      o = { lat: ll.lat, lng: ll.lng };
      if (dot) tempLayer.removeLayer(dot);
      dot = L.circleMarker(ll, { radius: 4, color: '#0b4f7a', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(tempLayer);
    }
    if (o) setO(o);
    App.setMode('ebl', {
      label: o ? 'Suuntima' : 'Suuntima – klikkaa alkupiste', cursor: true, button: 'tbEbl',
      click: function (e) { setO(e.latlng); App.setLabel('Suuntima'); },
      move: function (e) {
        if (!o) return;
        line.setLatLngs([[o.lat, o.lng], [e.latlng.lat, e.latlng.lng]]);
        var d = G.distance(o, e.latlng);
        ring.setLatLng([o.lat, o.lng]).setRadius(d);
        if (!tempLayer.hasLayer(ring)) ring.addTo(tempLayer);
        UI.readout({ brg: G.bearing(o, e.latlng), dist: d, total: null });
      },
      menu: function (e) {
        UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
          { label: 'Aseta alkupiste tähän', action: function () { setO(e.latlng); } },
          { label: 'Lopeta suuntima', key: 'Esc', action: function () { App.clearMode(); } }
        ], 'Suuntima');
      },
      cancel: function () { tempLayer.clearLayers(); UI.clearMeasure(); }
    });
  }

  // ---------- poiminta kartalta ----------
  function pick(label, cb) {
    App.setMode('pick', {
      label: label, cursor: true,
      click: function (e) { App.clearMode(); cb(e.latlng); },
      cancel: function () { }
    });
  }

  // ---------- omat merkit ----------
  function renderMarks() {
    markLayer.clearLayers();
    S.state.marks.forEach(function (m) {
      var sym = markSym(m.type);
      var html = sym.html + (m.name ? '<span class="mk-name">' + UI.esc(m.name) + '</span>' : '');
      var mk = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ className: 'mk' + (m.status === 'approved' ? '' : ' draft'), html: html, iconSize: [sym.w, sym.h], iconAnchor: [sym.ax, sym.ay] }),
        draggable: !!m._moving, keyboard: false, bubblingMouseEvents: false
      });
      mk.bindTooltip(UI.esc(typeName(m.type)) + (m.status === 'approved' ? '' : ' (luonnos)') + '<br>' + G.fmtPos(m), { direction: 'top', offset: [0, -10] });
      mk.on('contextmenu', function (e) { L.DomEvent.stop(e); markMenu(m, e); });
      mk.on('dblclick', function (e) { L.DomEvent.stop(e); editMark(m.id); });
      mk.on('dragend', function (e) {
        var q = e.target.getLatLng(); m.lat = q.lat; m.lng = q.lng; delete m._moving; S.emit('marks');
      });
      mk.addTo(markLayer);
    });
  }

  function markMenu(m, e) {
    UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
      { label: 'Ominaisuudet…', action: function () { editMark(m.id); } },
      { label: 'Siirrä merkkiä', action: function () { m._moving = true; renderMarks(); UI.toast('Vedä merkki uuteen paikkaan.'); } },
      { label: 'Suuntima tästä', action: function () { startEbl({ lat: m.lat, lng: m.lng }); } },
      { sep: true },
      { label: 'Poista merkki…', action: function () {
        UI.confirm('Poistetaanko merkki "' + (m.name || typeName(m.type)) + '"?', 'Poista', function () {
          S.state.marks = S.state.marks.filter(function (x) { return x.id !== m.id; }); S.emit('marks');
        }, true);
      } }
    ], m.name || typeName(m.type));
  }

  function markForm(m) {
    return '<div class="form">' +
      '<label for="mName">Nimi</label><input id="mName" value="' + UI.esc(m.name || '') + '" placeholder="esim. Uusi punainen lateraali">' +
      '<label for="mType">Tyyppi</label><select id="mType">' + MARK_TYPES.map(function (t) {
        return '<option value="' + t[0] + '"' + (t[0] === m.type ? ' selected' : '') + '>' + t[1] + '</option>';
      }).join('') + '</select>' +
      '<label for="mPos">Koordinaatit</label><input id="mPos" value="' + UI.esc(G.fmtPos(m)) + '">' +
      '<div class="hint">Esim. 61°31,234\'N 023°45,678\'E tai 61.5206 23.7613</div>' +
      '<label for="mDesc">Selite</label><textarea id="mDesc">' + UI.esc(m.desc || '') + '</textarea>' +
      '<div class="err" id="mErr" hidden></div></div>';
  }

  function editMark(id, newPos) {
    var isNew = !id;
    var m = isNew ? { id: S.uid('mk'), name: '', type: 'general', lat: newPos.lat, lng: newPos.lng, desc: '', status: 'draft' } : S.markById(id);
    if (!m) return;
    function save(md, status) {
      var pos = G.parsePos(md.querySelector('#mPos').value);
      if (!pos) { var er = md.querySelector('#mErr'); er.textContent = 'Koordinaatteja ei tunnistettu. Tarkista muoto.'; er.hidden = false; return false; }
      m.name = md.querySelector('#mName').value.trim();
      m.type = md.querySelector('#mType').value;
      m.desc = md.querySelector('#mDesc').value;
      m.lat = pos.lat; m.lng = pos.lng;
      if (status) m.status = status;
      if (isNew) S.state.marks.push(m);
      S.emit('marks');
    }
    var buttons = [{ label: 'Peruuta' }, { label: 'Tallenna luonnoksena', action: function (md) { return save(md, m.status === 'approved' ? 'approved' : 'draft'); } }];
    if (m.status !== 'approved') buttons.push({ label: 'Hyväksy kirjastoon', approve: true, action: function (md) { return save(md, 'approved'); } });
    else buttons[1].label = 'Tallenna';
    UI.modal({ title: isNew ? 'Uusi merkki' : 'Merkin ominaisuudet', body: markForm(m), buttons: buttons, enterButton: 1 });
  }

  // ---------- tehtäväpaikat ----------
  function renderTasks() {
    taskLayer.clearLayers();
    S.state.tasks.forEach(function (t) {
      var html = taskSvg(t.active) + '<span class="task-name">' + UI.esc(t.name || 'Tehtävä') + '</span>';
      var mk = L.marker([t.lat, t.lng], {
        icon: L.divIcon({ className: 'mk', html: html, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: true, keyboard: false, bubblingMouseEvents: false, zIndexOffset: 700
      });
      mk.bindTooltip(G.fmtPos(t) + (t.time ? '<br>' + UI.esc(fmtTime(t.time)) : ''), { direction: 'top', offset: [0, -14] });
      mk.on('contextmenu', function (e) { L.DomEvent.stop(e); taskMenu(t, e); });
      mk.on('dblclick', function (e) { L.DomEvent.stop(e); editTask(t.id); });
      mk.on('dragend', function (e) { var q = e.target.getLatLng(); t.lat = q.lat; t.lng = q.lng; S.emit('tasks'); });
      mk.addTo(taskLayer);
    });
    updateTaskReadout();
  }

  function fmtTime(s) {
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function taskMenu(t, e) {
    UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
      { label: 'Ominaisuudet…', action: function () { editTask(t.id); } },
      { label: t.active ? 'Poista aktiivisuus' : 'Aseta aktiiviseksi', action: function () { setActiveTask(t.active ? null : t.id); } },
      { label: 'Suuntima tehtävään asemalta', disabled: !S.state.settings.station, action: function () {
        var st = S.state.settings.station;
        startEbl({ lat: st.lat, lng: st.lng });
      } },
      { label: 'Uusi reitti asemalta tehtävään', disabled: !S.state.settings.station, action: function () {
        var st = S.state.settings.station;
        var r = S.newRoute([{ lat: st.lat, lng: st.lng }, { lat: t.lat, lng: t.lng }]);
        r.from = st.name || 'Asema'; r.to = t.name || 'Tehtävä'; r.name = S.autoName(r);
        S.emit('routes'); global.Routes.enterEdit(r.id);
        UI.toast('Suora reittiluonnos luotu. Lisää reittipisteitä oikealla napilla reittiviivasta.');
      } },
      { label: 'Reititä tehtävälle väylää pitkin…', action: function () { global.Routing.taskDialog(t.id); } },
      { sep: true },
      { label: 'Poista tehtävä…', action: function () {
        UI.confirm('Poistetaanko tehtävä "' + (t.name || 'Tehtävä') + '"?', 'Poista', function () {
          S.state.tasks = S.state.tasks.filter(function (x) { return x.id !== t.id; }); S.emit('tasks');
        }, true);
      } }
    ], t.name || 'Tehtävä');
  }

  function setActiveTask(id) {
    S.state.tasks.forEach(function (t) { t.active = t.id === id; });
    S.emit('tasks');
  }

  function localDT(d) {
    var p = G.pad;
    return d.getFullYear() + '-' + p(d.getMonth() + 1, 2) + '-' + p(d.getDate(), 2) + 'T' + p(d.getHours(), 2) + ':' + p(d.getMinutes(), 2);
  }

  // Tehtäväpaikan voi antaa koordinaatteina, poimia kartalta tai hakea nimellä. Haun tulos tarkistetaan
  // kartalla ennen vahvistusta: numeroidut osumat näkyvät, ja merkkiä voi siirtää tai napauttaa karttaa.
  // draft on lomakkeen keskeneräinen tila (uusi tehtävä tai muokattavan kopio); ctx säilyttää haun.
  function editTask(id, newPos, draft, ctx) {
    var isNew = !id;
    var orig = isNew ? null : S.taskById(id);
    if (!isNew && !orig) return;
    var nowD = new Date();
    var t = draft || (isNew
      ? { id: S.uid('tk'), name: 'Tehtävä ' + G.pad(nowD.getHours(), 2) + ':' + G.pad(nowD.getMinutes(), 2), lat: newPos ? newPos.lat : null, lng: newPos ? newPos.lng : null, time: localDT(nowD), active: true }
      : L.extend({}, orig));
    ctx = ctx || { q: '', results: [], ref: null, place: null };
    var body = '<div class="form">' +
      '<label for="tName">Nimi</label><input id="tName" value="' + UI.esc(t.name || '') + '" placeholder="esim. Keikka 1234 – vene karilla">' +
      '<label for="tFind">Hae paikka</label><div class="tfind"><input id="tFind" type="search" autocomplete="off" value="' + UI.esc(ctx.q || '') + '" placeholder="saari, kylä, turvalaite tai koordinaatit">' +
      '<div class="tsr" id="tRes" hidden></div></div>' +
      '<label for="tPos">Koordinaatit</label><div style="display:flex;gap:6px"><input id="tPos" value="' + (t.lat != null ? UI.esc(G.fmtPos(t)) : '') + '" placeholder="61°31,234\'N 023°45,678\'E"><button type="button" class="btn small" id="tPick">Poimi kartalta</button></div>' +
      '<div class="hint" id="tPrev">Asteet, minuutit ja sekunnit voi erottaa välilyönnein: <b>61 35,1N 23 45,2E</b> (asteet ja minuutit), <b>61 35 11N 23 45 30E</b> (asteet, minuutit ja sekunnit) tai <b>61,5N 23,75E</b> (asteet desimaaleina).</div>' +
      '<label for="tTime">Aika</label><input id="tTime" type="datetime-local" value="' + UI.esc(t.time || localDT(nowD)) + '">' +
      '<label for="tAct">Aktiivinen</label><div class="checks"><label><input type="checkbox" id="tAct"' + (t.active ? ' checked' : '') + '> näytä suuntima ja etäisyys asemalta</label></div>' +
      '<div class="err" id="tErr" hidden></div></div>';
    function keepForm(md) {
      t.name = md.querySelector('#tName').value; t.time = md.querySelector('#tTime').value; t.active = md.querySelector('#tAct').checked;
      var p = G.parsePos(md.querySelector('#tPos').value);
      if (p) { t.lat = p.lat; t.lng = p.lng; }
      ctx.q = md.querySelector('#tFind').value;
    }
    function reopen() { editTask(isNew ? null : orig.id, null, t, ctx); }
    UI.modal({
      title: isNew ? 'Uusi tehtäväpaikka' : 'Tehtäväpaikka', body: body, enterButton: 1,
      buttons: [{ label: 'Peruuta' }, {
        label: isNew ? 'Luo tehtävä' : 'Tallenna', primary: true, action: function (md) {
          var pos = G.parsePos(md.querySelector('#tPos').value);
          if (!pos) { var er = md.querySelector('#tErr'); er.textContent = 'Paikka puuttuu tai koordinaatteja ei tunnistettu. Hae paikka nimellä, poimi se kartalta tai tarkista koordinaattien muoto.'; er.hidden = false; return false; }
          t.name = md.querySelector('#tName').value.trim() || 'Tehtävä';
          t.lat = pos.lat; t.lng = pos.lng;
          t.time = md.querySelector('#tTime').value;
          var act = md.querySelector('#tAct').checked;
          var task = t;
          if (isNew) S.state.tasks.push(t); else { L.extend(orig, t); task = orig; }
          if (act) S.state.tasks.forEach(function (x) { x.active = x.id === task.id; }); else task.active = false;
          S.emit('tasks');
          App.centerOn([task.lat, task.lng], Math.max(map.getZoom(), 13));
        }
      }],
      onOpen: function (md) {
        var inp = md.querySelector('#tPos'), prev = md.querySelector('#tPrev'), hint0 = prev.innerHTML;
        function preview() {
          var v = inp.value.trim();
          if (!v) { prev.innerHTML = hint0; prev.className = 'hint'; return; }
          var p = G.parsePos(v);
          if (p) {
            var same = ctx.place && Math.abs(ctx.place.lat - p.lat) < 5e-5 && Math.abs(ctx.place.lng - p.lng) < 5e-5;
            prev.innerHTML = same ? 'Paikka tarkistettu kartalla: <b>' + UI.esc(ctx.place.label) + '</b>, ' + UI.esc(G.fmtPos(p))
              : 'Tulkinta: <b>' + UI.esc(G.fmtPos(p)) + '</b>';
            prev.className = 'hint ok';
          } else {
            var hasN = /[NSP]/i.test(v), hasE = /[EWIL]/i.test(v.replace(/[0-9\s,.'°"]/g, ''));
            prev.textContent = hasN && !hasE ? 'Leveys tunnistettu – lisää vielä pituus (E).' : 'Koordinaatteja ei vielä tunnistettu.';
            prev.className = 'hint bad';
          }
        }
        inp.addEventListener('input', preview);
        if (inp.value) preview();
        md.querySelector('#tPick').addEventListener('click', function () {
          keepForm(md);
          UI.closeModal();
          pick('Tehtäväpaikka – ' + (UI.isTouch() ? 'napauta' : 'klikkaa') + ' paikka kartalta', function (ll) {
            t.lat = ll.lat; t.lng = ll.lng; ctx.place = null;
            reopen();
          });
        });

        // --- paikkahaku ---
        var fin = md.querySelector('#tFind'), box = md.querySelector('#tRes'), timer = null, seq = 0;
        function show(list, pending) {
          if (!fin.value.trim()) { box.hidden = true; box.innerHTML = ''; return; }
          var h = '';
          if (!list.length) h = '<div class="sn">' + (pending ? 'Haetaan…' : 'Ei osumia. Kokeile nimen osaa, esim. viitas.') + '</div>';
          else {
            h = '<div class="sn">Valitse paikka, niin se näytetään kartalla tarkistettavaksi. Etäisyys ja suunta kartan keskeltä.</div>';
            var nearDone = false;
            list.forEach(function (it, i) {
              if (!nearDone && it.km > global.Search.NEAR_KM) { nearDone = true; if (i) h += '<div class="sh">Kauempana</div>'; }
              h += '<div class="sr" data-i="' + i + '"><i class="sn-no">' + (i + 1) + '</i>' +
                '<div class="sr-t"><b>' + UI.esc(it.name) + '</b><span>' + UI.esc(it.info || '') + '</span></div>' +
                '<em>' + G.fmtNM(it.km * 1000) + ' · ' + G.fmtBrg(it.brg, 0) + '</em></div>';
            });
            if (pending) h += '<div class="sn">Haetaan lisää…</div>';
          }
          var note = !pending && fin.value.trim().length >= 3 ? global.Search.namesNote() : '';
          if (note) h += '<div class="sn">' + UI.esc(note) + '</div>';
          box.innerHTML = h; box.hidden = false;
        }
        function runFind() {
          var q = fin.value.trim(), my = ++seq;
          if (q.length < 2) { ctx.results = []; show([], false); return; }
          var c = map.getCenter();
          ctx.ref = { lat: c.lat, lng: c.lng };
          show([], true);
          global.Search.find(q, ctx.ref).then(function (list) {
            if (my !== seq) return;
            ctx.results = list.slice(0, 30); ctx.resQ = q;
            show(ctx.results, false);
          });
        }
        fin.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runFind, 350); });
        fin.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            clearTimeout(timer);
            if (ctx.results.length && fin.value.trim() === ctx.resQ) { choose(0); return; }
            runFind();
          }
        });
        function choose(i) {
          keepForm(md);
          UI.closeModal();
          verifyTaskPlace(t, ctx, i, reopen);
        }
        box.addEventListener('click', function (e) {
          var el = e.target.closest('.sr');
          if (el) choose(Number(el.dataset.i));
        });
        if (ctx.results.length) show(ctx.results, false);
        // uudelle tehtävälle ilman paikkaa kohdistus suoraan hakuun
        if (isNew && t.lat == null) setTimeout(function () { fin.focus(); }, 40);
      }
    });
  }

  // Tehtäväpaikan tarkistus kartalla: valittu hakutulos keskitetään ja merkitään siirrettävällä merkillä,
  // muut osumat näkyvät numeroituina (napautus vaihtaa). Kartan napautus siirtää merkin siihen kohtaan.
  var verifyLayer = null;
  function verifyTaskPlace(t, ctx, idx, back) {
    var list = ctx.results, cur = list[idx], pos = L.latLng(cur.lat, cur.lng), label = cur.name, moved = false, done = false;
    if (verifyLayer) map.removeLayer(verifyLayer);
    verifyLayer = L.layerGroup().addTo(map);
    var cand = null;
    function bannerText() {
      return 'Tarkista tehtäväpaikka: ' + label + (moved ? ' (siirretty)' : '') + ', ' + G.fmtPos(pos) + '. ' +
        (UI.isTouch() ? 'Napauta karttaa tai vedä merkkiä, jos paikkaa pitää tarkentaa.' : 'Klikkaa karttaa tai vedä merkkiä, jos paikkaa pitää tarkentaa.');
    }
    function draw() {
      verifyLayer.clearLayers();
      list.forEach(function (it, i) {
        var on = it === cur;
        if (on) return;          // valittu paikka näkyy tarkistusrenkaana
        var m = L.marker([it.lat, it.lng], {
          icon: L.divIcon({ className: 'sres-ico', html: '<span class="sres' + (on ? ' on' : '') + '">' + (i + 1) + '</span>', iconSize: [0, 0] }),
          keyboard: false, zIndexOffset: on ? 1000 : 0, pane: 'aidPane', bubblingMouseEvents: false
        });
        m.bindTooltip(UI.esc(it.name) + (it.info ? ' – ' + UI.esc(it.info) : ''), { direction: 'top', offset: [0, -12] });
        m.on('click', function (e) { L.DomEvent.stop(e); cur = it; label = it.name; moved = false; pos = L.latLng(it.lat, it.lng); draw(); App.centerOn(pos); banner(); });
        m.addTo(verifyLayer);
      });
      cand = L.marker(pos, {
        icon: L.divIcon({ className: 'tv-ico', html: '<span class="tv-ring"></span><span class="tv-dot"></span>', iconSize: [0, 0] }),
        draggable: true, keyboard: false, zIndexOffset: 2000, bubblingMouseEvents: false
      }).addTo(verifyLayer);
      cand.on('dragend', function () { pos = cand.getLatLng(); moved = true; banner(); });
    }
    function finish(ok) {
      done = true;
      if (ok) {
        t.lat = pos.lat; t.lng = pos.lng;
        ctx.place = { lat: pos.lat, lng: pos.lng, label: label + (moved ? ' (siirretty)' : '') };
        // oletusnimeen lisätään paikan nimi, jos käyttäjä ei ole nimennyt tehtävää itse
        if (/^Tehtävä \d\d:\d\d$/.test(t.name || '')) t.name = t.name + ' – ' + label;
      }
      App.clearMode();
    }
    function banner() {
      UI.banner({
        kind: 'adding', text: bannerText(),
        buttons: [
          { label: 'Takaisin', action: function () { finish(false); } },
          { label: 'Vahvista paikka', action: function () { finish(true); } }
        ]
      });
    }
    App.setMode('pick', {
      label: 'Tehtäväpaikan tarkistus', cursor: true,
      click: function (e) { pos = e.latlng; moved = true; cand.setLatLng(pos); banner(); },
      cancel: function () {
        if (verifyLayer) { map.removeLayer(verifyLayer); verifyLayer = null; }
        UI.banner(null);
        if (global.Routes && global.Routes.editingId) global.Routes.updateBanner();
        // Esc ja Takaisin palaavat lomakkeelle; jos käyttäjä aloitti toisen työkalun, lomaketta ei avata
        var confirmed = done;
        setTimeout(function () { if (confirmed || App.mode() === 'idle') back(); }, 0);
      }
    });
    draw();
    banner();
    App.centerOn(pos, Math.max(map.getZoom(), 13));
  }

  function updateTaskReadout() {
    var t = S.state.tasks.find(function (x) { return x.active; });
    if (!t) { UI.readout({ task: null }); return; }
    var st = S.state.settings.station;
    if (st) UI.readout({ task: G.fmtBrg(G.bearing(st, t), 0) + '  ' + G.fmtNM(G.distance(st, t)) + ' asemalta' });
    else UI.readout({ task: G.fmtPos(t) });
  }

  // ---------- asema ----------
  function renderStation() {
    stationLayer.clearLayers();
    var st = S.state.settings.station;
    if (!st) return;
    var svg = '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#0f5e86" stroke="#fff" stroke-width="1.6"/>' +
      '<path d="M12 6v12M8.5 9h7M6.8 13.5c.8 2.6 2.8 4 5.2 4s4.4-1.4 5.2-4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';
    var mk = L.marker([st.lat, st.lng], {
      icon: L.divIcon({ className: 'mk', html: svg + '<span class="mk-name">' + UI.esc(st.name || 'Asema') + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      keyboard: false, bubblingMouseEvents: false, zIndexOffset: 650
    });
    mk.on('contextmenu', function (e) {
      L.DomEvent.stop(e);
      UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
        { label: 'Suuntima asemalta', action: function () { startEbl({ lat: st.lat, lng: st.lng }); } },
        { label: 'Uusi reitti asemalta', action: function () { startRouteAt(L.latLng(st.lat, st.lng)); } },
        { label: 'Reititä asemalta väylää pitkin…', action: function () { global.Routing.dialog({ from: { lat: st.lat, lng: st.lng, label: st.name || 'Asema' } }); } },
        { label: 'Nimeä asema…', action: function () { nameStation(st); } },
        { sep: true },
        { label: 'Poista asema', action: function () { S.state.settings.station = null; S.emit('settings'); } }
      ], st.name || 'Asema');
    });
    mk.addTo(stationLayer);
  }

  function nameStation(st, isNew) {
    UI.modal({
      title: isNew ? 'Aseta asema' : 'Nimeä asema',
      body: '<div class="form"><label for="sName">Nimi</label><input id="sName" value="' + UI.esc(st.name || 'Asema') + '"><div class="hint">Asemalta lasketaan aktiivisen tehtävän suuntima ja etäisyys.</div></div>',
      enterButton: 1,
      buttons: [{ label: 'Peruuta' }, { label: 'Tallenna', primary: true, action: function (md) {
        st.name = md.querySelector('#sName').value.trim() || 'Asema';
        S.state.settings.station = st; S.emit('settings');
      } }]
    });
  }

  function startRouteAt(ll) {
    global.Routes.startNew();
    // ensimmäinen piste suoraan annettuun kohtaan
    App.dispatchClick(ll);
  }

  // ---------- kartan kontekstivalikko ----------
  function mapMenu(e) {
    var ll = e.latlng;
    var pos = G.fmtPos(ll);
    UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
      { label: 'Lisää merkki tähän', action: function () { editMark(null, ll); } },
      { label: 'Lisää tehtävä tähän', action: function () { editTask(null, ll); } },
      { label: 'Aseta asema tähän', action: function () { nameStation({ lat: ll.lat, lng: ll.lng, name: (S.state.settings.station || {}).name || 'Asema' }, true); } },
      { sep: true },
      { label: 'Uusi reitti tästä', key: 'Ctrl+R', action: function () { startRouteAt(ll); } },
      { label: 'Reititä tähän väylää pitkin…', action: function () { global.Routing.dialog({ to: { lat: ll.lat, lng: ll.lng, label: '' } }); } },
      { label: 'Harppi tästä', key: 'M', action: function () { startMeasure(ll); } },
      { label: 'Suuntima tästä', key: 'F6', action: function () { startEbl({ lat: ll.lat, lng: ll.lng }); } },
      { sep: true },
      { label: 'Kopioi koordinaatit', action: function () { copyText(pos); } },
      { label: 'Keskitä kartta tähän', action: function () { App.centerOn(ll); } }
    ], pos);
  }

  function copyText(s) {
    var ok = function () { UI.toast('Kopioitu: ' + s); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(ok, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { UI.toast('Kopiointi ei onnistunut: ' + s, true); }
      ta.remove();
    }
  }

  function render() { renderMarks(); renderTasks(); renderStation(); }

  function init(m, app) {
    map = m; App = app;
    tempLayer = L.layerGroup().addTo(map);
    markLayer = L.layerGroup().addTo(map);
    stationLayer = L.layerGroup().addTo(map);
    taskLayer = L.layerGroup().addTo(map);
    render();
  }

  global.Tools = {
    init: init, render: render, renderMarks: renderMarks, renderTasks: renderTasks, renderStation: renderStation,
    startMeasure: startMeasure, startEbl: startEbl, editMark: editMark, editTask: editTask, mapMenu: mapMenu,
    setActiveTask: setActiveTask, typeName: typeName, markSvg: markSvg, fmtTime: fmtTime, pick: pick,
    updateTaskReadout: updateTaskReadout, copyText: copyText
  };
})(window);
