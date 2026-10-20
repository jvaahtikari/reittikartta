/* Reittikartta – reittikirjasto (oikea paneeli): reitit, merkit ja tehtävät. */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  var map, App;
  var selRoute = null;
  var tab = 'routes';

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    return isNaN(d) ? '' : d.toLocaleDateString('fi-FI');
  }

  function routeItem(r) {
    var len = global.Routes.totalLen(r);
    var color = r.status === 'approved' ? 'var(--approved)' : 'var(--draft)';
    var meta = r.status === 'approved'
      ? (r.vessels || []).join(', ') + (r.approver ? ' · ' + r.approver : '')
      : 'Luonnos' + (r.modified ? ' · muokattu ' + fmtDate(r.modified) : '');
    return '<div class="item' + (r.id === selRoute ? ' sel' : '') + '" data-id="' + r.id + '" tabindex="0">' +
      '<span class="sw" style="background:' + color + '"></span>' +
      '<div style="min-width:0"><div class="nm">' + UI.esc(r.name || 'Nimetön reitti') + '</div><div class="meta">' + UI.esc(meta) + '</div></div>' +
      '<div class="side">' + G.fmtNM(len) + '<br>' + Math.max(0, r.points.length - 1) + ' legiä</div></div>';
  }

  function renderRoutes() {
    var el = UI.$('tab-routes');
    var st = S.state.settings;
    var routes = S.state.routes.filter(function (r) { return r.points.length >= 2; });
    var drafts = routes.filter(function (r) { return r.status !== 'approved'; });
    var noVessel = !st.currentVessel;      // aluksia ei ole lisätty: kaikki hyväksytyt samaan ryhmään
    var mine = routes.filter(function (r) { return r.status === 'approved' && (noVessel || (r.vessels || []).indexOf(st.currentVessel) >= 0); });
    var others = routes.filter(function (r) { return r.status === 'approved' && !noVessel && (r.vessels || []).indexOf(st.currentVessel) < 0; });
    var h = '<div class="p-actions">' +
      '<button class="btn primary" data-act="new">Uusi reitti</button>' +
      '<button class="btn" data-act="import">Tuo GPX…</button>' +
      '<button class="btn" data-act="exportAll"' + (routes.length ? '' : ' disabled') + '>Vie kirjasto GPX</button></div>';
    if (!routes.length) {
      h += '<div class="empty">Kirjastossa ei ole vielä reittejä.<br>Aloita <b>Uusi reitti</b> -painikkeella' + (UI.isTouch() ? ' ja napauta' : ' (Ctrl+R) ja klikkaa') + ' reittipisteet kartalle, tai tuo SARNavista viety GPX-tiedosto.</div>';
    } else {
      h += '<div class="group-h">Hyväksytyt' + (noVessel ? '' : ' – ' + UI.esc(st.currentVessel)) + ' (' + mine.length + ')</div><div class="list">' + (mine.map(routeItem).join('') || '<div class="empty">' + (noVessel ? 'Ei hyväksyttyjä reittejä.' : 'Ei tälle alukselle hyväksyttyjä reittejä.') + '</div>') + '</div>';
      h += '<div class="group-h">Luonnokset (' + drafts.length + ')</div><div class="list">' + (drafts.map(routeItem).join('') || '<div class="empty">Ei luonnoksia.</div>') + '</div>';
      if (others.length) {
        h += '<div class="group-h">Muille aluksille hyväksytyt (' + others.length + ')' + (st.routeFilter === 'vessel' ? ' – piilossa kartalla' : '') + '</div><div class="list">' + others.map(routeItem).join('') + '</div>';
      }
    }
    var r = selRoute && S.routeById(selRoute);
    if (r) h += detail(r);
    el.innerHTML = h;
    // valitun reitin tiedot näkyviin: puhelimessa ne ovat muuten alalevyn näkyvän osan alapuolella
    if (scrollDetail && r) {
      scrollDetail = false;
      var d = el.querySelector('.detail');
      if (d) el.scrollTop = Math.max(0, d.offsetTop - el.offsetTop - 6);
    }

    el.querySelectorAll('.item').forEach(function (it) {
      it.addEventListener('click', function () { select(it.dataset.id, true); });
      it.addEventListener('keydown', function (e) { if (e.key === 'Enter') select(it.dataset.id, true); });
      it.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var id = it.dataset.id;
        select(id, false);
        UI.menu(e.clientX, e.clientY, [
          { label: 'Ominaisuudet…', action: function () { global.Routes.openProperties(id); } },
          { label: 'Muokkaa reittiä ja merkkejä', action: function () { global.Routes.enterEdit(id); global.Routes.center(id); } },
          { label: 'Keskitä reittiin', action: function () { global.Routes.center(id); } },
          { label: 'Vie GPX-tiedostoksi', action: function () { global.Routes.exportRoute(id); } },
          { sep: true },
          { label: 'Poista reitti…', action: function () { global.Routes.deleteRoute(id); } }
        ], 'Reittikirjasto');
      });
    });
    el.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { action(b.dataset.act, b.dataset.id); });
    });
  }

  function detail(r) {
    var ls = global.Routes.legs(r);
    var speed = r.speed || S.state.settings.speed;
    var cum = 0;
    var rows = ls.map(function (l) {
      cum += l.dist;
      var sn = function (k) { return r.points[k] && r.points[k].snap ? '<span title="Kiinnitetty väylän pisteeseen" style="color:#c2188b">◆</span>' : ''; };
      return '<tr><td>' + sn(l.i) + (l.i + 1) + '→' + (l.i + 2) + sn(l.i + 1) + '</td><td>' + G.fmtBrg(l.brg, 0) + '</td><td>' + G.fmtNum(l.dist / G.NM, 2) + '</td><td>' + G.fmtNum(cum / G.NM, 2) + '</td><td>' + G.fmtDuration(l.dist / G.NM / speed) + '</td></tr>';
    }).join('');
    var editing = global.Routes.editingId === r.id;
    // puhelimessa toimintopainikkeet heti nimen alle, jotta ne näkyvät alalevyssä ilman vieritystä
    var phone = UI.isPhone();
    var actions = '<div class="p-actions">' +
      (editing ? '<button class="btn" data-act="stopEdit">Lopeta muokkaus</button>' : '<button class="btn" data-act="edit" data-id="' + r.id + '">Muokkaa</button>') +
      '<button class="btn" data-act="props" data-id="' + r.id + '">Ominaisuudet</button>' +
      '<button class="btn" data-act="center" data-id="' + r.id + '">Keskitä</button>' +
      '<button class="btn" data-act="gpx" data-id="' + r.id + '">Vie GPX</button>' +
      '<button class="btn danger" data-act="del" data-id="' + r.id + '">Poista</button></div>';
    return '<div class="detail"><h3>' + UI.esc(r.name || 'Nimetön reitti') + '</h3>' +
      '<span class="chip ' + (r.status === 'approved' ? 'approved' : 'draft') + '">' + (r.status === 'approved' ? 'Hyväksytty' : 'Luonnos') + '</span>' +
      (editing ? '<span class="chip">Muokkaustilassa</span>' : '') +
      (phone ? actions : '') +
      '<div class="kv">' +
      '<span>Mistä</span><b>' + UI.esc(r.from || '–') + '</b>' +
      '<span>Kautta</span><b>' + UI.esc(r.via || '–') + '</b>' +
      '<span>Mihin</span><b>' + UI.esc(r.to || '–') + '</b>' +
      '<span>Pituus</span><b>' + G.fmtNM(global.Routes.totalLen(r)) + '</b>' +
      '<span>Ajoaika</span><b>' + G.fmtDuration(global.Routes.totalLen(r) / G.NM / speed) + ' (' + speed + ' kn)</b>' +
      (r.status === 'approved' ? '<span>Hyväksyjä</span><b>' + UI.esc(r.approver || '–') + ', ' + fmtDate(r.approvedAt) + '</b><span>Alukset</span><b>' + UI.esc((r.vessels || []).join(', ') || '–') + '</b>' : '') +
      '<span>Nuotit</span><b>' + r.notes.length + ' (' + r.notes.filter(function (n) { return n.ok; }).length + ' vahvistettu)</b>' +
      '<span>Väyläkiinnitys</span><b>' + r.points.filter(function (p) { return p.snap; }).length + ' / ' + r.points.length + ' reittipistettä</b>' +
      '<span>Sivuutukset</span><b>' + r.passes.length + '</b><span>Käännökset</span><b>' + r.turns.length + '</b>' +
      (r.passes.length + r.turns.length ? '<span>Turvalaitekiinnitys</span><b>' + r.passes.concat(r.turns).filter(function (x) { return x.tgt && x.tgt.aid; }).length + ' / ' + (r.passes.length + r.turns.length) + ' kohdetta</b>' : '') +
      '</div>' +
      (r.desc ? '<p class="meta">' + UI.esc(r.desc) + '</p>' : '') +
      (phone ? '' : actions) +
      '<div class="tbl-wrap"><table class="legs"><thead><tr><th>Legi</th><th>Suunta</th><th>mpk</th><th>Kertymä</th><th>Aika</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function action(act, id) {
    var R = global.Routes;
    // puhelimessa kirjasto peittää kartan alaosan: suljetaan se, kun toiminto tapahtuu kartalla
    if (UI.isPhone() && ['new', 'edit', 'center', 'newMark'].indexOf(act) >= 0) App.closePanel();
    switch (act) {
      case 'new': R.startNew(); break;
      case 'import': App.importFile(); break;
      case 'exportAll': App.exportLibrary(); break;
      case 'edit': R.enterEdit(id); R.center(id); break;
      case 'stopEdit': R.finishEdit(); break;
      case 'props': R.openProperties(id); break;
      case 'center': R.center(id); break;
      case 'gpx': R.exportRoute(id); break;
      case 'del': R.deleteRoute(id); break;
      case 'newMark': Tools().pick('Uusi merkki – klikkaa paikka kartalta', function (ll) { Tools().editMark(null, ll); }); break;
      case 'newTask': Tools().editTask(null, null); break;
      case 'routeTask': global.Routing.taskDialog(); break;
    }
  }
  function Tools() { return global.Tools; }

  var scrollDetail = false;
  function select(id, centerIt) {
    selRoute = id; scrollDetail = true;
    global.Routes.setHighlight(id);
    if (centerIt) {
      var r = S.routeById(id);
      if (r && r.points.length) {
        var b = L.latLngBounds(r.points.map(function (p) { return [p.lat, p.lng]; }));
        if (!map.getBounds().contains(b)) global.Routes.center(id);
      }
    }
    render();
  }

  function renderMarks() {
    var el = UI.$('tab-marks');
    var h = '<div class="p-actions"><button class="btn primary" data-act="newMark">Uusi merkki</button></div>';
    if (!S.state.marks.length) h += '<div class="empty">Omat merkit täydentävät karttaa: uudet viitat, kivet, matalikot, nopeusrajoitukset. Lisää merkki kartalta ' + (UI.isTouch() ? 'pitkällä painalluksella' : 'hiiren oikealla painikkeella') + ': <b>Lisää merkki tähän</b>.</div>';
    else {
      h += '<div class="list">' + S.state.marks.map(function (m) {
        return '<div class="item" data-id="' + m.id + '" tabindex="0"><span class="sw" style="background:' + (m.status === 'approved' ? 'var(--approved)' : 'var(--draft)') + '"></span>' +
          '<div style="min-width:0;display:flex;gap:8px;align-items:center">' + Tools().markSvg(m.type) +
          '<div style="min-width:0"><div class="nm">' + UI.esc(m.name || Tools().typeName(m.type)) + '</div><div class="meta">' + UI.esc(Tools().typeName(m.type)) + ' · ' + G.fmtPos(m) + '</div></div></div>' +
          '<div class="side">' + (m.status === 'approved' ? 'kirjasto' : 'luonnos') + '</div></div>';
      }).join('') + '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('.item').forEach(function (it) {
      var m = S.markById(it.dataset.id);
      it.addEventListener('click', function () { App.centerOn([m.lat, m.lng], Math.max(map.getZoom(), 14)); });
      it.addEventListener('dblclick', function () { Tools().editMark(m.id); });
      it.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Ominaisuudet…', action: function () { Tools().editMark(m.id); } },
          { label: 'Keskitä', action: function () { App.centerOn([m.lat, m.lng], Math.max(map.getZoom(), 14)); } },
          { label: 'Poista merkki…', action: function () {
            UI.confirm('Poistetaanko merkki "' + (m.name || Tools().typeName(m.type)) + '"?', 'Poista', function () {
              S.state.marks = S.state.marks.filter(function (x) { return x.id !== m.id; }); S.emit('marks');
            }, true);
          } }
        ], m.name || 'Merkki');
      });
    });
    el.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { action(b.dataset.act); }); });
  }

  function renderTasks() {
    var el = UI.$('tab-tasks');
    var st = S.state.settings.station;
    var h = '<div class="p-actions"><button class="btn primary" data-act="newTask">Uusi tehtävä</button>' +
      (S.state.tasks.length ? '<button class="btn" data-act="routeTask">Reititä tehtävälle</button>' : '') + '</div>';
    if (!st) h += '<div class="meta" style="margin-bottom:8px">Aseta asema kartalta (' + (UI.isTouch() ? 'pitkä painallus' : 'oikea painike') + ' → <b>Aseta asema tähän</b>), niin tehtävän suuntima ja etäisyys asemalta näkyvät.</div>';
    if (!S.state.tasks.length) h += '<div class="empty">Ei tehtäviä. Kun saat tehtävän koordinaatit, valitse <b>Uusi tehtävä</b> ja kirjoita koordinaatit hälytysviestistä. Tehtäväpaikka näkyy kartalla kaksoisympyränä.</div>';
    else {
      var list = S.state.tasks.slice().sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
      h += '<div class="list">' + list.map(function (t) {
        var side = st ? G.fmtBrg(G.bearing(st, t), 0) + '<br>' + G.fmtNM(G.distance(st, t)) : '';
        return '<div class="item' + (t.active ? ' sel' : '') + '" data-id="' + t.id + '" tabindex="0"><span class="sw" style="background:' + (t.active ? '#c8102e' : 'var(--ui-line)') + '"></span>' +
          '<div style="min-width:0"><div class="nm">' + UI.esc(t.name || 'Tehtävä') + (t.active ? ' · aktiivinen' : '') + '</div><div class="meta">' + UI.esc(Tools().fmtTime(t.time)) + ' · ' + G.fmtPos(t) + '</div></div>' +
          '<div class="side">' + side + '</div></div>';
      }).join('') + '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('.item').forEach(function (it) {
      var t = S.taskById(it.dataset.id);
      it.addEventListener('click', function () { App.centerOn([t.lat, t.lng], Math.max(map.getZoom(), 13)); });
      it.addEventListener('dblclick', function () { Tools().editTask(t.id); });
      it.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        UI.menu(e.clientX, e.clientY, [
          { label: 'Ominaisuudet…', action: function () { Tools().editTask(t.id); } },
          { label: t.active ? 'Poista aktiivisuus' : 'Aseta aktiiviseksi', action: function () { Tools().setActiveTask(t.active ? null : t.id); } },
          { label: 'Reititä tehtävälle väylää pitkin…', action: function () { global.Routing.taskDialog(t.id); } },
          { label: 'Kopioi koordinaatit', action: function () { Tools().copyText(G.fmtPos(t)); } },
          { label: 'Poista tehtävä…', action: function () {
            UI.confirm('Poistetaanko tehtävä "' + (t.name || 'Tehtävä') + '"?', 'Poista', function () {
              S.state.tasks = S.state.tasks.filter(function (x) { return x.id !== t.id; }); S.emit('tasks');
            }, true);
          } }
        ], t.name || 'Tehtävä');
      });
    });
    el.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { action(b.dataset.act); }); });
  }

  function setTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    ['routes', 'marks', 'tasks'].forEach(function (n) { UI.$('tab-' + n).hidden = n !== name; });
    render();
  }

  function render() {
    if (selRoute && !S.routeById(selRoute)) selRoute = null;
    if (tab === 'routes') renderRoutes();
    else if (tab === 'marks') renderMarks();
    else renderTasks();
  }

  function init(m, app) {
    map = m; App = app;
    document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
    global.Routes.onChange(function (what) {
      if (what === 'highlight' && global.Routes.highlightId !== selRoute) selRoute = global.Routes.highlightId;
      render();
    });
    render();
  }

  global.Library = { init: init, render: render, setTab: setTab, select: select };
})(window);
