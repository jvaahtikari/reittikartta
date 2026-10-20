/* Reittikartta – reittisuunnittelu SARNavin mallin mukaan:
 * reittiluonnos (ruskea) → muokkaustila → suuntanuotit, sivuutus- ja
 * käännösetäisyydet → ominaisuudet → hyväksyntä omaan kirjastoon (pinkki). */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  var C = {
    draft: '#9a5b2a', approved: '#d4237f', hl: '#ffd400', hint: '#8b9298',
    pass: '#0b4f7a', turn: '#6a3b8f', temp: '#d22a2a'
  };

  var map, App, root, tempLayer;
  var editingId = null, snapshot = null, dirty = false;
  var highlightId = null;
  var adding = null;
  var changeCbs = [];

  function show() { return S.state.settings.show; }
  // Kiinnitys väylän käännöspisteeseen tai väylälinjaan (Väyläviraston aineisto ≈ ENC). Alt ohittaa.
  function snapPt(ll, oe) {
    if (oe && oe.altKey) return null;
    var c = global.ChartAPI;
    return c ? c.snap(ll) : null;
  }
  function snapLabel(s) {
    if (!s) return '';
    var nm = global.ChartAPI && global.ChartAPI.fairwayName(s.jnro);
    return (s.kind === 'vertex' ? 'kiinnittyy väylän käännöspisteeseen' : 'kiinnittyy väylälinjaan') + (nm ? ' (' + nm + ')' : (s.jnro ? ' (väylä ' + s.jnro + ')' : ''));
  }
  function snapRing(s) {
    L.circleMarker([s.lat, s.lng], { radius: 9, color: '#c2188b', weight: 2.5, fill: false, interactive: false }).addTo(tempLayer);
  }
  // Kiinnitys Väyläviraston turvalaitteeseen sivuutus- ja käännösetäisyyden kohteena. Alt ohittaa.
  function aidSnap(ll, oe) {
    if (oe && oe.altKey) return null;
    var c = global.ChartAPI;
    return c && c.snapAid ? c.snapAid(ll) : null;
  }
  function aidLabel(s) {
    if (!s) return '';
    return 'kiinnittyy turvalaitteeseen: ' + (s.name ? s.name + ' (' + s.type + ')' : s.type);
  }
  function aidTip(a) {
    return 'Kohde: ' + (a.name || 'nimetön') + (a.type ? ' (' + a.type + ')' : '') + (a.nro ? ', nro ' + a.nro : '') + ' – Väyläviraston turvalaiterekisteri';
  }
  function tgtFrom(ll, s) {
    return s ? { lat: s.lat, lng: s.lng, aid: { id: s.id, name: s.name, type: s.type, nro: s.nro } } : { lat: ll.lat, lng: ll.lng };
  }
  function aidMarkers(on) { if (global.ChartAPI && global.ChartAPI.setAidSnapMarkers) global.ChartAPI.setAidSnapMarkers(on); }
  // Kohteen vetokahva muokkaustilassa: kiinnittyy turvalaitteeseen vedon aikana.
  function tgtHandle(g, obj, r, after, preview) {
    var h = divMarker([obj.tgt.lat, obj.tgt.lng], 'handle' + (obj.tgt.aid ? ' snapped' : ''), '', { draggable: true, zIndexOffset: 540 });
    var last = null;
    h.on('dragstart', function () { aidMarkers(true); });
    h.on('drag', function (e) {
      tempLayer.clearLayers();
      last = aidSnap(e.latlng, e.originalEvent);
      if (last) { e.target.setLatLng([last.lat, last.lng]); snapRing(last); }
      App.setLabel(last ? 'Kohde ' + aidLabel(last) : '');
      if (preview) preview(e.target.getLatLng());
    });
    h.on('dragend', function (e) {
      tempLayer.clearLayers(); aidMarkers(false); App.setLabel('');
      obj.tgt = tgtFrom(e.target.getLatLng(), last);
      if (after) after();
      markDirty(r); S.emit('routes');
    });
    if (obj.tgt.aid) h.bindTooltip(aidTip(obj.tgt.aid), { direction: 'top', offset: [0, -8] });
    h.addTo(g);
  }
  function now() { return new Date().toISOString(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function changed(what) { changeCbs.forEach(function (fn) { fn(what); }); }

  // ---------- laskenta ----------
  function legs(r) {
    var out = [];
    for (var i = 0; i < r.points.length - 1; i++) {
      var a = r.points[i], b = r.points[i + 1];
      var rh = G.rhumb(a, b);
      out.push({ i: i, a: a, b: b, brg: rh.brg, dist: rh.dist });
    }
    return out;
  }
  function totalLen(r) { return legs(r).reduce(function (s, l) { return s + l.dist; }, 0); }
  function courseText(r, leg) {
    var a = r.points[leg], b = r.points[leg + 1];
    if (!a || !b) return '';
    return G.pad(Math.round(G.bearing(a, b)) % 360, 3) + '°';
  }
  function nearestLeg(r, ll) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < r.points.length - 1; i++) {
      var pr = G.projectToSegment(ll, r.points[i], r.points[i + 1], true);
      if (pr.d < bd) { bd = pr.d; best = i; }
    }
    return best;
  }
  // Janan A–B leikkaus suorakaiteella (Liang–Barsky); palauttaa näkyvän osan päätepisteet tai null.
  function clipSeg(A, B, x0, y0, x1, y1) {
    var dx = B.x - A.x, dy = B.y - A.y, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [A.x - x0, x1 - A.x, A.y - y0, y1 - A.y];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; continue; }
      var t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [{ x: A.x + dx * t0, y: A.y + dy * t0 }, { x: A.x + dx * t1, y: A.y + dy * t1 }];
  }
  function pxDistToSegment(p, a, b) {
    var P = map.latLngToContainerPoint(p), A = map.latLngToContainerPoint(a), B = map.latLngToContainerPoint(b);
    var vx = B.x - A.x, vy = B.y - A.y, len2 = vx * vx + vy * vy;
    var t = len2 ? ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2 : 0;
    var tc = Math.max(0, Math.min(1, t));
    var dx = P.x - (A.x + vx * tc), dy = P.y - (A.y + vy * tc);
    return { d: Math.sqrt(dx * dx + dy * dy), t: t };
  }
  function noteOk(r, n) {
    var a = r.points[n.leg], b = r.points[n.leg + 1];
    if (!a || !b) return false;
    var q = pxDistToSegment(n, a, b);
    return q.t >= -0.05 && q.t <= 1.05 && q.d >= 12 && q.d <= 110;
  }
  function passFoot(r, p) {
    var a = r.points[p.leg], b = r.points[p.leg + 1];
    if (!a || !b) return null;
    return G.projectToSegment(p.tgt, a, b, false);
  }
  function passBad(r, p) {
    var pr = passFoot(r, p);
    if (!pr || !p.lab) return true;
    var q = pxDistToSegment(p.lab, pr.foot, p.tgt);
    return q.d > 70;
  }

  function markDirty(r) {
    r.modified = now();
    if (r.id === editingId && r.status === 'approved') dirty = true;
  }

  // ---------- piirto ----------
  function divMarker(ll, cls, html, opts) {
    return L.marker(ll, Object.assign({
      icon: L.divIcon({ className: '', html: '<div class="' + cls + '">' + html + '</div>', iconSize: [0, 0] }),
      keyboard: false, bubblingMouseEvents: false
    }, opts || {}));
  }

  // Suuntanuottien törmäystarkistus: näkymän aikana sijoitetut laatikot (pikseleinä), jotta
  // mutkikkaalla väylällä laatikot eivät kasaudu päällekkäin. Nollataan jokaisessa piirrossa.
  var placedBoxes = [];
  var NOTE_W = 96, NOTE_H = 42;       // laatikon koko pikseleinä (likimain)
  function boxFree(x, y) {
    for (var i = 0; i < placedBoxes.length; i++) {
      var b = placedBoxes[i];
      if (Math.abs(b.x - x) < NOTE_W && Math.abs(b.y - y) < NOTE_H) return false;
    }
    return true;
  }
  function render() {
    root.clearLayers();
    placedBoxes = [];
    if (global.ChartAPI) global.ChartAPI.setSnapMarkers(!!adding || !!editingId);
    S.state.routes.forEach(function (r) {
      if (r.points.length < 1) return;
      var vis = S.routeVisible(r) || r.id === editingId || r.id === highlightId || (adding && adding.r === r);
      if (!vis) return;
      drawRoute(r);
    });
  }

  function drawRoute(r) {
    var g = L.layerGroup().addTo(root);
    var ll = r.points.map(function (p) { return [p.lat, p.lng]; });
    var isEdit = r.id === editingId;
    var isAdding = adding && adding.r === r;
    var color = r.status === 'approved' ? C.approved : C.draft;
    var sh = show();

    if (r.id === highlightId) L.polyline(ll, { color: C.hl, weight: 12, opacity: 0.8, interactive: false }).addTo(g);
    else if (sh.hint && !isEdit) L.polyline(ll, { color: C.hint, weight: 9, opacity: 0.55, interactive: false }).addTo(g);

    var line = L.polyline(ll, { color: color, weight: isEdit ? 4 : 3, opacity: 0.95, bubblingMouseEvents: false }).addTo(g);
    line.on('contextmenu', function (e) { L.DomEvent.stop(e); lineMenu(r, e); });
    line.on('click', function (e) {
      if (App.mode() !== 'idle') return;
      L.DomEvent.stop(e);
      setHighlight(r.id, true);
    });
    var tip = (r.name || 'Nimetön reitti') + (r.status === 'approved' ? ' (hyväksytty)' : ' (luonnos)');
    line.bindTooltip(tip, { sticky: true, direction: 'top', opacity: 0.9 });

    // legien suuntanuotit: jokaiselle näkymässä näkyvälle legille, myös väylällä kulkeville.
    // Vaakasuora laatikko kuten SARNavissa: kulkusuunta isolla, nuoli kulkusuuntaan, vastasuunta ja matka pienellä.
    // Nuotti sijoitetaan legin näkyvälle osalle (myös kun legin keskikohta on ruudun ulkopuolella),
    // legin oikealle puolelle kulkusuuntaan nähden; pitkälle näkyvälle osuudelle nuotteja toistetaan.
    var z = map.getZoom();
    if (sh.legBrg !== false && !isAdding) {
      var vs = map.getSize(), M = 70;
      // Ehdokkaat kerätään ja sijoitetaan pisimmästä näkyvästä legistä alkaen. Laatikko jätetään pois,
      // jos legi on näkymässä liian lyhyt tai laatikko osuisi jo sijoitetun päälle (myös toisen reitin).
      // Lähemmäs zoomattaessa legit pitenevät ja laatikot tulevat näkyviin.
      var cands = [];
      for (var li = 0; li < r.points.length - 1; li++) {
        var pa = r.points[li], pb = r.points[li + 1];
        var A = map.latLngToContainerPoint([pa.lat, pa.lng]), B = map.latLngToContainerPoint([pb.lat, pb.lng]);
        var vis = clipSeg(A, B, M, M, vs.x - M, vs.y - M);
        if (!vis) continue;
        var plen = A.distanceTo(B);
        if (plen < 1) continue;
        var vlen = Math.hypot(vis[1].x - vis[0].x, vis[1].y - vis[0].y);
        if (vlen < 60) continue;
        cands.push({ pa: pa, pb: pb, A: A, B: B, plen: plen, vis: vis, vlen: vlen });
      }
      cands.sort(function (a, b) { return b.vlen - a.vlen; });
      cands.forEach(function (c) {
        var rh = G.rhumb(c.pa, c.pb);
        var ux = (c.B.x - c.A.x) / c.plen, uy = (c.B.y - c.A.y) / c.plen, nx = -uy, ny = ux;
        var off = 12 + Math.abs(nx) * 52 + Math.abs(ny) * 21;      // laatikko ei peitä reittiviivaa missään kulmassa
        var reps = Math.max(1, Math.min(6, Math.floor(c.vlen / 520)));
        var html = '<div class="legnote ' + (r.status === 'approved' ? 'ap' : 'dr') + '">' +
          '<span class="ln-top"><svg class="ln-arr" viewBox="-7 -7 14 14" style="transform:rotate(' + Math.round(rh.brg) + 'deg)">' +
          '<path d="M0,-6.5 L4.8,5.5 L0,3 L-4.8,5.5 Z"/></svg>' +
          '<b>' + G.fmtBrg(rh.brg, 0) + '</b></span>' +
          '<small>' + G.fmtBrg(rh.brg + 180, 0) + ' \u00B7 ' + G.fmtNM(rh.dist) + '</small></div>';
        for (var k = 1; k <= reps; k++) {
          var tt = k / (reps + 1);
          var bx = c.vis[0].x + (c.vis[1].x - c.vis[0].x) * tt, by = c.vis[0].y + (c.vis[1].y - c.vis[0].y) * tt;
          // ensisijaisesti legin oikealle puolelle, muuten vasemmalle; jos kumpikaan ei ole vapaa, laatikko jää pois
          var mx = bx + nx * off, my = by + ny * off;
          if (!boxFree(mx, my)) { mx = bx - nx * off; my = by - ny * off; if (!boxFree(mx, my)) continue; }
          placedBoxes.push({ x: mx, y: my });
          L.marker(map.containerPointToLatLng([mx, my]), {
            icon: L.divIcon({ className: 'leg-anchor', html: html, iconSize: [0, 0] }),
            interactive: false, keyboard: false, pane: 'labelPane'
          }).addTo(g);
        }
      });
    }

    // käännösmerkit seuran käytännön mukaan: 2 ja 1 kaapelia ennen jokaista käännöstä
    if (sh.turnTicks !== false && !isAdding && z >= 12) {
      for (var ti = 1; ti < r.points.length - 1; ti++) {
        var prev = r.points[ti - 1], wpT = r.points[ti];
        var legLen = G.distance(prev, wpT), back = G.bearing(wpT, prev);
        [2, 1].forEach(function (kbl) {
          var d = kbl * G.NM / 10;
          if (legLen < d + 15) return;
          var q = G.destination(wpT, back, d);
          var Q = map.latLngToContainerPoint([q.lat, q.lng]);
          var ang = (back + 90) * Math.PI / 180, hl = 9;
          var e1 = map.containerPointToLatLng([Q.x + Math.sin(ang) * hl, Q.y - Math.cos(ang) * hl]);
          var e2 = map.containerPointToLatLng([Q.x - Math.sin(ang) * hl, Q.y + Math.cos(ang) * hl]);
          L.polyline([e1, e2], { color: color, weight: kbl === 1 ? 3 : 2, opacity: 0.95, interactive: false }).addTo(g);
          if (z >= 14) {
            var lp = map.containerPointToLatLng([Q.x + Math.sin(ang) * 20, Q.y - Math.cos(ang) * 20]);
            L.marker(lp, { icon: L.divIcon({ className: 'tick-ico', html: '<span class="tick-lab">' + kbl + '</span>', iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' }).addTo(g);
          }
        });
      }
    }

    // reittipisteet
    r.points.forEach(function (p, i) {
      if (isEdit) {
        var m = divMarker([p.lat, p.lng], 'wp edit' + (r.status === 'approved' ? ' approved' : '') + (p.snap ? ' snapped' : ''),
          '<span class="wp-num">' + (i + 1) + '</span>', { draggable: true, zIndexOffset: 500 });
        var lastSnap = null;
        m.on('drag', function (e) {
          tempLayer.clearLayers();
          lastSnap = snapPt(e.latlng, e.originalEvent);
          if (lastSnap) { e.target.setLatLng([lastSnap.lat, lastSnap.lng]); snapRing(lastSnap); }
          App.setLabel(lastSnap ? 'Reittipiste ' + snapLabel(lastSnap) : '');
          var pts = line.getLatLngs();
          pts[i] = e.target.getLatLng();
          line.setLatLngs(pts);
        });
        m.on('dragend', function (e) {
          tempLayer.clearLayers();
          App.setLabel('');
          var q = e.target.getLatLng();
          r.points[i] = { lat: q.lat, lng: q.lng, name: p.name };
          if (lastSnap) r.points[i].snap = { kind: lastSnap.kind, jnro: lastSnap.jnro };
          r.notes.forEach(function (n) { if (n.leg === i || n.leg === i - 1) n.ok = false; });
          r.passes.forEach(function (ps) { if (ps.leg === i || ps.leg === i - 1) ps.ok = !passBad(r, ps); });
          markDirty(r);
          S.emit('routes');
        });
        m.on('contextmenu', function (e) { L.DomEvent.stop(e); wpMenu(r, i, e); });
        m.addTo(g);
      } else if (!isAdding) {
        divMarker([p.lat, p.lng], 'wp-dot' + (r.status === 'approved' ? ' approved' : ''), '', { interactive: false }).addTo(g);
      } else {
        divMarker([p.lat, p.lng], 'wp', '', { interactive: false }).addTo(g);
      }
    });

    // suuntanuotit
    if (sh.notes) {
      r.notes.forEach(function (n, k) {
        if (!r.points[n.leg + 1]) return;
        var cls = 'note' + (n.ok ? ' ok' : '') + (isEdit ? ' edit' : ' view');
        var m = divMarker([n.lat, n.lng], cls, courseText(r, n.leg), { draggable: isEdit, zIndexOffset: 600 });
        if (isEdit) {
          m.on('dragend', function (e) {
            var q = e.target.getLatLng();
            n.lat = q.lat; n.lng = q.lng;
            n.ok = noteOk(r, n);
            markDirty(r);
            S.emit('routes');
          });
          m.on('contextmenu', function (e) {
            L.DomEvent.stop(e);
            UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
              { label: 'Poista suuntanuotti', action: function () { r.notes.splice(k, 1); markDirty(r); S.emit('routes'); } }
            ], 'Suuntanuotti');
          });
        }
        m.addTo(g);
      });
    }

    // sivuutus- ja käännösetäisyydet
    if (sh.passes) {
      r.passes.forEach(function (p, k) {
        var pr = passFoot(r, p);
        if (!pr) return;
        var bad = p.ok === false;
        var col = bad ? C.temp : C.pass;
        L.polyline([[pr.foot.lat, pr.foot.lng], [p.tgt.lat, p.tgt.lng]], { color: col, weight: 2, dashArray: '5 4', interactive: false }).addTo(g);
        // poikkiviiva kohteen päässä
        var brg = G.bearing(pr.foot, p.tgt);
        var c1 = G.destination(p.tgt, brg + 90, 12), c2 = G.destination(p.tgt, brg - 90, 12);
        L.polyline([[c1.lat, c1.lng], [c2.lat, c2.lng]], { color: col, weight: 2, interactive: false }).addTo(g);
        var lab = divMarker([p.lab.lat, p.lab.lng], 'pass-lab' + (bad ? ' bad' : '') + (isEdit ? ' edit' : ''),
          G.fmtKbl(pr.d), { draggable: isEdit, zIndexOffset: 550 });
        if (isEdit) {
          lab.on('dragend', function (e) { var q = e.target.getLatLng(); p.lab = { lat: q.lat, lng: q.lng }; p.ok = !passBad(r, p); markDirty(r); S.emit('routes'); });
          lab.on('contextmenu', function (e) {
            L.DomEvent.stop(e);
            UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
              { label: 'Poista sivuutusetäisyys', action: function () { r.passes.splice(k, 1); markDirty(r); S.emit('routes'); } }
            ], 'Sivuutusetäisyys');
          });
          tgtHandle(g, p, r, function () { p.ok = !passBad(r, p); }, function (q) {
            var pq = G.projectToSegment(q, r.points[p.leg], r.points[p.leg + 1], false);
            L.polyline([[pq.foot.lat, pq.foot.lng], [q.lat, q.lng]], { color: C.pass, weight: 2, dashArray: '5 4', interactive: false }).addTo(tempLayer);
            UI.readout({ brg: G.bearing(pq.foot, q), dist: pq.d, total: null });
          });
        }
        if (p.tgt.aid) lab.bindTooltip(aidTip(p.tgt.aid), { direction: 'top', offset: [0, -10] });
        lab.addTo(g);
      });

      r.turns.forEach(function (t, k) {
        var wp = r.points[t.wp];
        if (!wp) return;
        var d = G.distance(wp, t.tgt);
        var bad = d > (S.state.settings.turnWarnNM || 1) * G.NM;
        var col = bad ? C.temp : C.turn;
        L.polyline([[wp.lat, wp.lng], [t.tgt.lat, t.tgt.lng]], { color: col, weight: 2, dashArray: '2 5', interactive: false }).addTo(g);
        var mid = { lat: (wp.lat + t.tgt.lat) / 2, lng: (wp.lng + t.tgt.lng) / 2 };
        var lab = divMarker([mid.lat, mid.lng], 'turn-lab' + (bad ? ' bad' : ''), '↻ ' + G.fmtKbl(d), { interactive: isEdit });
        if (isEdit) {
          lab.on('contextmenu', function (e) {
            L.DomEvent.stop(e);
            UI.menu(e.originalEvent.clientX, e.originalEvent.clientY, [
              { label: 'Poista käännösetäisyys', action: function () { r.turns.splice(k, 1); markDirty(r); S.emit('routes'); } }
            ], 'Käännösetäisyys');
          });
          tgtHandle(g, t, r, null, function (q) {
            L.polyline([[wp.lat, wp.lng], [q.lat, q.lng]], { color: C.turn, weight: 2, dashArray: '2 5', interactive: false }).addTo(tempLayer);
            UI.readout({ brg: G.bearing(wp, q), dist: G.distance(wp, q), total: null });
          });
        }
        if (t.tgt.aid && isEdit) lab.bindTooltip(aidTip(t.tgt.aid), { direction: 'top', offset: [0, -10] });
        lab.addTo(g);
      });
    }
  }

  // ---------- valikot ----------
  function ev(e) { return e.originalEvent || e; }

  function lineMenu(r, e) {
    var x = ev(e).clientX, y = ev(e).clientY;
    var leg = nearestLeg(r, e.latlng);
    if (r.id === editingId) {
      UI.menu(x, y, [
        { label: 'Lisää reittipiste tähän', action: function () { insertPoint(r, leg, e.latlng); } },
        { sep: true },
        { label: 'Suuntanuotit kaikille reittiosuuksille', action: function () { notesAll(r); } },
        { label: 'Suuntanuotti', action: function () { placeNote(r, leg); } },
        { label: 'Sivuutusetäisyys', action: function () { placePass(r, leg); } },
        { sep: true },
        r.auto ? { label: 'Muuta kulkusyvyyttä ja reititä uudelleen…', action: function () { global.Routing.changeDepth(r.id); } } : null,
        { label: 'Ominaisuudet…', action: function () { openProperties(r.id); } },
        { label: 'Lopeta muokkaus', action: finishEdit },
        { sep: true },
        { label: 'Poista reitti…', action: function () { deleteRoute(r.id); } }
      ], (r.status === 'approved' ? 'Kirjastoreitti' : 'Reittiluonnos') + ' – legi ' + (leg + 1));
    } else {
      UI.menu(x, y, [
        { label: 'Ominaisuudet…', action: function () { openProperties(r.id); } },
        { label: r.status === 'approved' ? 'Muokkaa kirjastoreittiä' : 'Muokkaa reittiä', action: function () { enterEdit(r.id); } },
        r.auto ? { label: 'Muuta kulkusyvyyttä ja reititä uudelleen…', action: function () { enterEdit(r.id); global.Routing.changeDepth(r.id); } } : null,
        { label: 'Korosta', action: function () { setHighlight(r.id, true); } },
        { label: 'Keskitä reittiin', action: function () { center(r.id); } },
        { label: 'Vie GPX-tiedostoksi', action: function () { exportRoute(r.id); } },
        { sep: true },
        { label: 'Poista reitti…', action: function () { deleteRoute(r.id); } }
      ], r.name || 'Nimetön reitti');
    }
  }

  function wpMenu(r, i, e) {
    var last = r.points.length - 1;
    UI.menu(ev(e).clientX, ev(e).clientY, [
      { label: 'Poista reittipiste', disabled: r.points.length <= 2, action: function () { deletePoint(r, i); } },
      { label: 'Käännösetäisyys', action: function () { placeTurn(r, i); } },
      (i === last || i === 0) ? { label: 'Jatka reittiä tästä', action: function () { startAdding(r, i === 0 && last > 0 ? 'start' : 'end'); } } : null,
      { sep: true },
      { label: 'Ominaisuudet…', action: function () { openProperties(r.id); } },
      { label: 'Lopeta muokkaus', action: finishEdit }
    ], 'Reittipiste ' + (i + 1));
  }

  // ---------- muokkausoperaatiot ----------
  function shiftLegs(r, fromLeg, delta) {
    r.notes.forEach(function (n) { if (n.leg > fromLeg) n.leg += delta; });
    r.passes.forEach(function (p) { if (p.leg > fromLeg) p.leg += delta; });
    r.turns.forEach(function (t) { if (t.wp > fromLeg) t.wp += delta; });
  }

  function insertPoint(r, leg, ll) {
    var pr = G.projectToSegment(ll, r.points[leg], r.points[leg + 1], true);
    shiftLegs(r, leg, 1);
    r.points.splice(leg + 1, 0, { lat: pr.foot.lat, lng: pr.foot.lng });
    r.notes.forEach(function (n) { if (n.leg === leg) n.ok = false; });
    // sivuutukset jaetulla legillä: valitaan kumpaan puolikkaaseen kohde osuu
    r.passes.forEach(function (p) {
      if (p.leg !== leg) return;
      var q = G.projectToSegment(p.tgt, r.points[leg], r.points[leg + 1], false);
      if (q.t > 1) p.leg = leg + 1;
    });
    markDirty(r);
    S.emit('routes');
  }

  function deletePoint(r, i) {
    var n = r.points.length;
    if (n <= 2) return;
    r.points.splice(i, 1);
    // vanha legi → uusi legi (-1 = poistuu). Välipisteen poisto yhdistää legit i-1 ja i.
    var mapLeg = function (L0) {
      if (i === 0) return L0 === 0 ? -1 : L0 - 1;
      if (i === n - 1) return L0 === n - 2 ? -1 : L0;
      if (L0 < i - 1) return L0;
      if (L0 === i - 1 || L0 === i) return i - 1;
      return L0 - 1;
    };
    r.notes = r.notes.map(function (nt) {
      var nl = mapLeg(nt.leg);
      if (nl < 0) return null;
      if (nt.leg === i - 1 || nt.leg === i) nt.ok = false;
      nt.leg = nl;
      return nt;
    }).filter(Boolean);
    r.passes = r.passes.map(function (p) {
      var nl = mapLeg(p.leg);
      if (nl < 0) return null;
      p.leg = nl;
      return p;
    }).filter(Boolean);
    r.turns = r.turns.filter(function (t) { return t.wp !== i; });
    r.turns.forEach(function (t) { if (t.wp > i) t.wp--; });
    markDirty(r);
    S.emit('routes');
  }

  function notesAll(r) {
    r.notes = legs(r).map(function (l) {
      return { leg: l.i, lat: (l.a.lat + l.b.lat) / 2, lng: (l.a.lng + l.b.lng) / 2, ok: false };
    });
    markDirty(r);
    if (!show().notes) { show().notes = true; changed('show'); }
    S.emit('routes');
    UI.toast('Suuntanuotit lisätty. Siirrä kukin nuotti reittiviivan viereen, jolloin se vahvistuu vihreäksi.');
  }

  // ---------- sijoitustilat (nuotti, sivuutus, käännös) ----------
  function clearTemp() { tempLayer.clearLayers(); }

  function placeNote(r, leg) {
    var temp = null;
    App.setMode('place', {
      label: 'Suuntanuotti – klikkaa paikka',
      move: function (e) {
        if (!temp) temp = divMarker(e.latlng, 'note', courseText(r, leg), { interactive: false }).addTo(tempLayer);
        else temp.setLatLng(e.latlng);
      },
      click: function (e) {
        var n = { leg: leg, lat: e.latlng.lat, lng: e.latlng.lng, ok: false };
        n.ok = noteOk(r, n);
        r.notes.push(n);
        markDirty(r);
        App.clearMode();
        S.emit('routes');
      },
      cancel: clearTemp
    });
  }

  function placePass(r, leg) {
    var step = 1, tgt = null;
    if (!show().passes) { show().passes = true; show().notes = true; changed('show'); S.emit('routes'); }
    App.setMode('place', {
      label: 'Sivuutusetäisyys – 1) klikkaa kohde',
      move: function (e) {
        clearTemp();
        var a = r.points[leg], b = r.points[leg + 1];
        if (step === 1) {
          var sp = aidSnap(e.latlng, e.originalEvent);
          var ll = sp ? L.latLng(sp.lat, sp.lng) : e.latlng;
          App.setLabel('Sivuutusetäisyys – 1) klikkaa kohde' + (sp ? ' – ' + aidLabel(sp) : ''));
          if (sp) snapRing(sp);
          var pr = G.projectToSegment(ll, a, b, false);
          L.polyline([[pr.foot.lat, pr.foot.lng], [ll.lat, ll.lng]], { color: C.pass, weight: 2, dashArray: '5 4', interactive: false }).addTo(tempLayer);
          UI.readout({ brg: G.bearing(pr.foot, ll), dist: pr.d, total: null });
        } else {
          if (tgt.aid) snapRing(tgt);
          var pr2 = G.projectToSegment(tgt, a, b, false);
          L.polyline([[pr2.foot.lat, pr2.foot.lng], [tgt.lat, tgt.lng]], { color: C.pass, weight: 2, dashArray: '5 4', interactive: false }).addTo(tempLayer);
          divMarker(e.latlng, 'pass-lab', G.fmtKbl(pr2.d), { interactive: false }).addTo(tempLayer);
        }
      },
      click: function (e) {
        if (step === 1) {
          tgt = tgtFrom(e.latlng, aidSnap(e.latlng, e.originalEvent));
          step = 2;
          aidMarkers(false);
          App.setLabel('Sivuutusetäisyys – 2) klikkaa lukeman paikka' + (tgt.aid ? ' (kohde ' + (tgt.aid.name || tgt.aid.type) + ')' : ''));
          return;
        }
        var np = { leg: leg, tgt: tgt, lab: { lat: e.latlng.lat, lng: e.latlng.lng } };
        np.ok = !passBad(r, np);
        r.passes.push(np);
        markDirty(r);
        App.clearMode();
        S.emit('routes');
      },
      cancel: function () { clearTemp(); UI.clearMeasure(); aidMarkers(false); }
    });
    aidMarkers(true);
  }

  function placeTurn(r, wpIndex) {
    if (!show().passes) { show().passes = true; show().notes = true; changed('show'); S.emit('routes'); }
    App.setMode('place', {
      label: 'Käännösetäisyys – klikkaa maamerkki',
      move: function (e) {
        clearTemp();
        var wp = r.points[wpIndex];
        var sp = aidSnap(e.latlng, e.originalEvent);
        var ll = sp ? L.latLng(sp.lat, sp.lng) : e.latlng;
        App.setLabel('Käännösetäisyys – klikkaa maamerkki' + (sp ? ' – ' + aidLabel(sp) : ''));
        if (sp) snapRing(sp);
        L.polyline([[wp.lat, wp.lng], [ll.lat, ll.lng]], { color: C.turn, weight: 2, dashArray: '2 5', interactive: false }).addTo(tempLayer);
        UI.readout({ brg: G.bearing(wp, ll), dist: G.distance(wp, ll), total: null });
      },
      click: function (e) {
        r.turns.push({ wp: wpIndex, tgt: tgtFrom(e.latlng, aidSnap(e.latlng, e.originalEvent)) });
        markDirty(r);
        App.clearMode();
        S.emit('routes');
      },
      cancel: function () { clearTemp(); UI.clearMeasure(); aidMarkers(false); }
    });
    aidMarkers(true);
  }

  // ---------- uusi reitti / pisteiden lisäys ----------
  function startNew() {
    if (editingId) finishEdit(true);
    var r = S.newRoute([]);
    startAdding(r, 'end');
  }

  function startAdding(r, where) {
    if (editingId && editingId !== r.id) finishEdit(true);
    adding = { r: r, where: where || 'end', rubber: null };
    var isNew = r.points.length === 0;
    App.setMode('add', {
      label: 'Uusi reitti',
      cursor: true,
      click: function (e) {
        var sp = snapPt(e.latlng, e.originalEvent);
        var p = sp ? { lat: sp.lat, lng: sp.lng, snap: { kind: sp.kind, jnro: sp.jnro } } : { lat: e.latlng.lat, lng: e.latlng.lng };
        if (adding.where === 'start') {
          shiftLegs(r, -1, 1);
          r.points.unshift(p);
        } else r.points.push(p);
        markDirty(r);
        render();
        if (UI.isTouch()) lastLeg(); else update(e.latlng, e.originalEvent);
      },
      move: function (e) { update(e.latlng, e.originalEvent); },
      key: function (e) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLast(); return true; }
        return false;
      },
      menu: function (e) {
        UI.menu(ev(e).clientX, ev(e).clientY, [
          { label: 'Lopeta reittipisteiden lisäys', key: 'Esc', action: function () { App.clearMode(); } },
          { label: 'Poista viimeinen reittipiste', key: 'Del', disabled: !r.points.length, action: removeLast }
        ], 'Uusi reitti');
      },
      cancel: function () { stopAdding(isNew); }
    });
    UI.banner({
      kind: 'adding',
      text: UI.isTouch() ? 'Reittipisteiden lisäys – napauta pisteet kartalle.' : 'Reittipisteiden lisäys – klikkaa pisteet kartalle. Esc lopettaa, Del poistaa viimeisen.',
      buttons: [
        { label: 'Poista viimeinen', action: function () { removeLast(); } },
        { label: 'Valmis', action: function () { App.clearMode(); } }
      ]
    });
    render();

    function anchor() { return adding.where === 'start' ? r.points[0] : r.points[r.points.length - 1]; }
    function update(ll, oe) {
      tempLayer.clearLayers();
      var sp = snapPt(ll, oe);
      App.setLabel(sp ? 'Uusi reitti – ' + snapLabel(sp) : 'Uusi reitti');
      if (sp) { snapRing(sp); ll = L.latLng(sp.lat, sp.lng); }
      var a = anchor();
      if (!a) { UI.readout({ brg: null, dist: null, total: null }); return; }
      L.polyline([[a.lat, a.lng], [ll.lat, ll.lng]], { color: C.draft, weight: 2, dashArray: '6 5', interactive: false }).addTo(tempLayer);
      var d = G.distance(a, ll);
      UI.readout({ brg: adding.where === 'start' ? G.bearing(ll, a) : G.bearing(a, ll), dist: d, total: totalLen(r) + d });
    }
    // kosketusnäytöllä ei ole osoitinta: lukemat näyttävät juuri lisätyn legin suunnan ja pituuden
    function lastLeg() {
      var n = r.points.length;
      var a = adding.where === 'start' ? r.points[0] : r.points[n - 2], b = adding.where === 'start' ? r.points[1] : r.points[n - 1];
      if (!a || !b) { UI.readout({ brg: null, dist: null, total: n ? 0 : null }); return; }
      UI.readout({ brg: G.bearing(a, b), dist: G.distance(a, b), total: totalLen(r) });
    }
    function removeLast() {
      if (!r.points.length) return;
      if (adding.where === 'start') { r.points.shift(); shiftLegs(r, 0, -1); }
      else r.points.pop();
      var nLegs = Math.max(0, r.points.length - 1);
      r.notes = r.notes.filter(function (n) { return n.leg >= 0 && n.leg < nLegs; });
      r.passes = r.passes.filter(function (p) { return p.leg >= 0 && p.leg < nLegs; });
      r.turns = r.turns.filter(function (t) { return t.wp >= 0 && t.wp < r.points.length; });
      markDirty(r);
      render();
      if (UI.isTouch()) lastLeg();
    }
  }

  function stopAdding(isNew) {
    tempLayer.clearLayers();
    UI.clearMeasure();
    var r = adding && adding.r;
    adding = null;
    UI.banner(null);
    if (!r) return;
    if (r.points.length < 2) {
      if (isNew) {
        S.state.routes = S.state.routes.filter(function (x) { return x !== r; });
        UI.toast('Reitti vaatii vähintään kaksi reittipistettä. Luonnosta ei tallennettu.');
      }
      S.emit('routes');
      return;
    }
    S.emit('routes');
    enterEdit(r.id);
  }

  // ---------- muokkaustila ----------
  function enterEdit(id) {
    var r = S.routeById(id);
    if (!r) return;
    if (editingId && editingId !== id) finishEdit(true);
    editingId = id;
    snapshot = clone(r);
    dirty = false;
    updateBanner();
    S.emit('routes');
    changed('edit');
  }

  function updateBanner() {
    var r = S.routeById(editingId);
    if (!r) { UI.banner(null); return; }
    UI.banner({
      kind: r.status === 'approved' ? 'approved' : 'draft',
      text: r.status === 'approved' ? 'Kirjastoreitin muokkaus aktiivinen' : 'Luonnosreitin muokkaus aktiivinen',
      buttons: [
        global.Routing && global.Routing.bannerButton ? global.Routing.bannerButton(r) : null,
        { label: 'Ominaisuudet', action: function () { openProperties(r.id); } },
        { label: 'Lopeta muokkaus', action: function () { finishEdit(); } }
      ].filter(Boolean)
    });
  }

  function finishEdit(silent) {
    if (!editingId) return;
    var r = S.routeById(editingId);
    var done = function () {
      editingId = null; snapshot = null; dirty = false;
      UI.banner(null);
      S.emit('routes');
      changed('edit');
    };
    if (r && r.status === 'approved' && dirty) {
      if (silent) {   // toinen toiminto keskeytti: muutokset peruutetaan turvallisesti
        Object.assign(r, snapshot);
        UI.toast('Hyväksymättömät muutokset kirjastoreittiin peruttiin.');
        done();
        return;
      }
      UI.modal({
        title: 'Kirjastoreittiä on muutettu',
        body: '<p>Muutokset tulevat voimaan, kun ne hyväksytään. Hyväksyjän nimi kirjataan reitille.</p>',
        buttons: [
          { label: 'Jatka muokkausta' },
          { label: 'Peru muutokset', danger: true, action: function () { Object.assign(r, snapshot); done(); } },
          { label: 'Hyväksy muutokset…', approve: true, action: function () { setTimeout(function () { openProperties(r.id, { approveChanges: true, after: done }); }, 0); } }
        ]
      });
      return;
    }
    done();
  }

  // ---------- ominaisuudet ja hyväksyntä ----------
  function openProperties(id, opts) {
    opts = opts || {};
    var r = S.routeById(id);
    if (!r) return;
    var st = S.state.settings;
    var len = totalLen(r);
    var auto = S.autoName(r);
    var nameTouched = !!r.name && r.name !== auto;
    var vesselChecks = st.vessels.map(function (v, i) {
      var on = (r.vessels && r.vessels.length ? r.vessels.indexOf(v) >= 0 : v === st.currentVessel);
      return '<label><input type="checkbox" id="pv-' + i + '" value="' + UI.esc(v) + '"' + (on ? ' checked' : '') + '> ' + UI.esc(v) + '</label>';
    }).join('');
    // aluksia ei vielä ole: alus kirjoitetaan tähän ja lisätään samalla aluslistaan
    var vesselField = st.vessels.length ? '<div class="checks">' + vesselChecks + '</div>'
      : '<input id="pVesNew" placeholder="Aluksen nimi (useampi pilkulla erotettuna)" value="' + UI.esc((r.vessels || []).join(', ')) + '">' +
        '<div class="hint">Aluksia ei ole vielä lisätty. Kirjoitettu alus lisätään aluslistaan, ja listaa voi muokata kohdasta Tiedosto → Asetukset.</div>';
    var statusTxt = r.status === 'approved'
      ? 'Hyväksytty ' + (r.approvedAt ? new Date(r.approvedAt).toLocaleString('fi-FI') : '') + (r.approver ? ' – ' + UI.esc(r.approver) : '')
      : 'Luonnos';
    var body =
      '<div class="form">' +
      '<label for="pFrom">Mistä</label><input id="pFrom" value="' + UI.esc(r.from) + '" placeholder="Lähtöpaikka">' +
      '<label for="pVia">Kautta</label><input id="pVia" value="' + UI.esc(r.via) + '" placeholder="Välietappi / tunniste">' +
      '<label for="pTo">Mihin</label><input id="pTo" value="' + UI.esc(r.to) + '" placeholder="Päätepiste">' +
      '<label for="pName">Nimi</label><input id="pName" value="' + UI.esc(r.name || auto) + '">' +
      '<div class="hint">Muodostuu kentistä Mistä – Kautta – Mihin. Vähintään 3 merkkiä.</div>' +
      '<label for="pSpeed">Nopeus (kn)</label><input id="pSpeed" type="number" min="1" max="60" step="1" value="' + (r.speed || st.speed) + '">' +
      '<label>Pituus</label><div>' + G.fmtNM(len) + ' · ' + Math.max(0, r.points.length - 1) + ' legiä</div>' +
      '<label>Ajoaika</label><div id="pTime">' + G.fmtDuration(len / G.NM / (r.speed || st.speed)) + '</div>' +
      '<label>Tila</label><div>' + statusTxt + '</div>' +
      '<label for="pDesc">Huomiot</label><textarea id="pDesc">' + UI.esc(r.desc || '') + '</textarea>' +
      '<div class="full group-h">Hyväksyntä</div>' +
      '<label for="pAppr">Hyväksyjä</label><input id="pAppr" list="pApprList" value="' + UI.esc(opts.approveChanges ? '' : (r.approver || (st.approvers[0] || ''))) + '" placeholder="Etunimi Sukunimi">' +
      '<datalist id="pApprList">' + st.approvers.map(function (a) { return '<option value="' + UI.esc(a) + '">'; }).join('') + '</datalist>' +
      '<label' + (st.vessels.length ? '' : ' for="pVesNew"') + '>Alukset</label>' + vesselField +
      (r.notes.some(function (n) { return !n.ok; }) ? '<div class="hint">Huom: ' + r.notes.filter(function (n) { return !n.ok; }).length + ' suuntanuottia on vahvistamatta (punaisia).</div>' : '') +
      '<div class="err" id="pErr" hidden></div>' +
      '</div>';

    function read(m) {
      return {
        from: m.querySelector('#pFrom').value.trim(), via: m.querySelector('#pVia').value.trim(), to: m.querySelector('#pTo').value.trim(),
        name: m.querySelector('#pName').value.trim(), speed: parseFloat(m.querySelector('#pSpeed').value) || st.speed,
        desc: m.querySelector('#pDesc').value, approver: m.querySelector('#pAppr').value.trim(),
        vessels: Array.prototype.map.call(m.querySelectorAll('.checks input:checked'), function (c) { return c.value; })
          .concat(m.querySelector('#pVesNew') ? m.querySelector('#pVesNew').value.split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean) : [])
      };
    }
    function fail(m, msg) { var e = m.querySelector('#pErr'); e.textContent = msg; e.hidden = false; return false; }
    function apply(v) {
      r.from = v.from; r.via = v.via; r.to = v.to; r.name = v.name; r.speed = v.speed; r.desc = v.desc;
      r.modified = now();
    }
    function approve(m) {
      var v = read(m);
      if (v.name.length < 3) return fail(m, 'Reitin nimessä pitää olla vähintään 3 merkkiä.');
      if (!v.approver) return fail(m, 'Kirjoita hyväksyjän nimi.');
      if (!v.vessels.length) return fail(m, st.vessels.length ? 'Valitse vähintään yksi alus, jolle reitti hyväksytään.' : 'Kirjoita alus, jolle reitti hyväksytään.');
      apply(v);
      r.status = 'approved'; r.approver = v.approver; r.approvedAt = now(); r.vessels = v.vessels;
      var newVes = v.vessels.filter(function (x) { return st.vessels.indexOf(x) < 0; });
      if (newVes.length) {
        st.vessels = st.vessels.concat(newVes);
        if (!st.currentVessel) st.currentVessel = v.vessels[0];
        S.emit('settings');
      }
      if (st.approvers.indexOf(v.approver) < 0) st.approvers.unshift(v.approver);
      if (r.id === editingId) { snapshot = clone(r); dirty = false; updateBanner(); }
      S.emit('routes');
      UI.toast('Reitti hyväksytty kirjastoon: ' + r.name);
      if (opts.after) opts.after();
    }

    var buttons = [{ label: 'Peruuta' }];
    if (r.status !== 'approved') {
      buttons.push({
        label: 'Tallenna luonnoksena', action: function (m) {
          var v = read(m);
          if (v.name.length < 3) return fail(m, 'Reitin nimessä pitää olla vähintään 3 merkkiä.');
          apply(v); S.emit('routes'); UI.toast('Luonnos tallennettu.');
        }
      });
      buttons.push({ label: 'Hyväksy omaan kirjastoon', approve: true, action: approve });
    } else {
      buttons.push({ label: opts.approveChanges ? 'Hyväksy muutokset' : 'Tallenna ja hyväksy', approve: true, action: approve });
    }

    UI.modal({
      title: 'Reitin ominaisuudet', body: body, buttons: buttons, enterButton: null,
      onOpen: function (m) {
        var nameEl = m.querySelector('#pName');
        nameEl.addEventListener('input', function () { nameTouched = true; });
        ['#pFrom', '#pVia', '#pTo'].forEach(function (sel) {
          m.querySelector(sel).addEventListener('input', function () {
            if (nameTouched) return;
            var v = read(m);
            nameEl.value = [v.from, v.via, v.to].filter(Boolean).join(' – ');
          });
        });
        m.querySelector('#pSpeed').addEventListener('input', function () {
          var sp = parseFloat(this.value);
          m.querySelector('#pTime').textContent = sp > 0 ? G.fmtDuration(len / G.NM / sp) : '–';
        });
      }
    });
  }

  // ---------- muut ----------
  function setHighlight(id) {
    highlightId = id;
    render();
    changed('highlight');
  }
  function clearHighlight() { highlightId = null; render(); changed('highlight'); }

  function center(id) {
    var r = S.routeById(id);
    if (!r || !r.points.length) return;
    App.fitTo(L.latLngBounds(r.points.map(function (p) { return [p.lat, p.lng]; })).pad(0.2), { maxZoom: 15 });
  }

  function deleteRoute(id) {
    var r = S.routeById(id);
    if (!r) return;
    UI.confirm('Poistetaanko reitti "' + (r.name || 'Nimetön reitti') + '" pysyvästi?', 'Poista reitti', function () {
      if (editingId === id) { editingId = null; snapshot = null; dirty = false; UI.banner(null); }
      if (highlightId === id) highlightId = null;
      S.state.routes = S.state.routes.filter(function (x) { return x.id !== id; });
      S.emit('routes');
      changed('edit');
    }, true);
  }

  function exportRoute(id) {
    var r = S.routeById(id);
    if (!r) return;
    UI.download(UI.safeFile(r.name) + '.gpx', global.GPX.build({ routes: [r] }), 'application/gpx+xml');
  }

  function addImported(data) {
    var r = S.newRoute(data.points);
    r.name = data.name || 'Tuotu reitti';
    r.desc = data.desc || '';
    var m = data.meta;
    if (m) {
      ['from', 'via', 'to', 'speed', 'approver', 'approvedAt'].forEach(function (k) { if (m[k] != null) r[k] = m[k]; });
      if (m.status === 'approved') r.status = 'approved';
      r.vessels = Array.isArray(m.vessels) ? m.vessels : [];
      r.notes = Array.isArray(m.notes) ? m.notes : [];
      r.passes = Array.isArray(m.passes) ? m.passes : [];
      r.turns = Array.isArray(m.turns) ? m.turns : [];
      if (Array.isArray(m.snaps)) r.points.forEach(function (p, i) { if (m.snaps[i]) p.snap = m.snaps[i]; });
      if (m.auto && m.auto.from && m.auto.to) r.auto = m.auto;
    }
    return r;
  }

  function fromTrack(track, tolM) {
    var pts = G.simplify(track.points, tolM || 12);
    var r = S.newRoute(pts);
    r.name = (track.name || 'Jälki') + ' (jäljestä)';
    return r;
  }

  function init(m, app) {
    map = m; App = app;
    root = L.layerGroup().addTo(map);
    tempLayer = L.layerGroup().addTo(map);
    // suuntanuotit ja käännösmerkit sijoitellaan näkymän pikseleinä, joten ne piirretään uudelleen siirron ja zoomauksen jälkeen
    map.on('moveend', render);
    render();
  }

  global.Routes = {
    init: init, render: render, legs: legs, totalLen: totalLen,
    startNew: startNew, enterEdit: enterEdit, finishEdit: finishEdit, openProperties: openProperties,
    setHighlight: setHighlight, clearHighlight: clearHighlight, center: center, deleteRoute: deleteRoute,
    exportRoute: exportRoute, addImported: addImported, fromTrack: fromTrack,
    placePass: placePass, placeTurn: placeTurn,
    onChange: function (fn) { changeCbs.push(fn); },
    get editingId() { return editingId; }, get highlightId() { return highlightId; }, updateBanner: updateBanner,
    get adding() { return !!adding; }
  };
})(window);
