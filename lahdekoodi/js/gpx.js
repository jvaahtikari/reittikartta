/* Reittikartta – GPX-tuonti ja -vienti.
 * Vienti on GPX 1.1 -muotoa, jonka OpenCPN (ja siten SARNav) lukee: reitti
 * <rte>/<rtept>, merkit ja tehtäväpaikat <wpt>. Sovelluksen omat tiedot
 * (suuntanuotit, sivuutus- ja käännösetäisyydet, hyväksyntä) tallentuvat
 * <extensions>-osaan omalla nimiavaruudellaan, jonka muut ohjelmat ohittavat. */
(function (global) {
  'use strict';

  var NS = 'urn:reittikartta:1';
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  };
  var f7 = function (v) { return Number(v).toFixed(7); };

  function routeXml(r) {
    var meta = {
      status: r.status, from: r.from, via: r.via, to: r.to, speed: r.speed,
      approver: r.approver, approvedAt: r.approvedAt, vessels: r.vessels,
      notes: r.notes, passes: r.passes, turns: r.turns,
      snaps: r.points.map(function (p) { return p.snap || null; })
    };
    var s = '  <rte>\n    <name>' + esc(r.name || 'Reitti') + '</name>\n';
    if (r.desc) s += '    <desc>' + esc(r.desc) + '</desc>\n';
    s += '    <extensions>\n      <opencpn:viz>1</opencpn:viz>\n' +
      '      <rk:route>' + esc(JSON.stringify(meta)) + '</rk:route>\n    </extensions>\n';
    r.points.forEach(function (p, i) {
      s += '    <rtept lat="' + f7(p.lat) + '" lon="' + f7(p.lng) + '"><name>' +
        esc(p.name || global.Geo.pad(i + 1, 3)) + '</name><sym>diamond</sym></rtept>\n';
    });
    return s + '  </rte>\n';
  }

  function wptXml(p, name, sym, desc, ext) {
    return '  <wpt lat="' + f7(p.lat) + '" lon="' + f7(p.lng) + '"><name>' + esc(name) + '</name>' +
      (desc ? '<desc>' + esc(desc) + '</desc>' : '') + '<sym>' + esc(sym) + '</sym>' +
      (ext ? '<extensions><rk:item>' + esc(JSON.stringify(ext)) + '</rk:item></extensions>' : '') + '</wpt>\n';
  }

  function build(opts) {
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Reittikartta" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:opencpn="http://www.opencpn.org" xmlns:rk="' + NS + '">\n' +
      '  <metadata><time>' + new Date().toISOString() + '</time></metadata>\n';
    (opts.marks || []).forEach(function (m) {
      s += wptXml(m, m.name || 'Merkki', 'circle', m.desc, { kind: 'mark', type: m.type, status: m.status });
    });
    (opts.tasks || []).forEach(function (t) {
      s += wptXml(t, t.name || 'Tehtävä', 'circle', t.time ? 'Tehtävä ' + t.time : 'Tehtävä', { kind: 'task', time: t.time });
    });
    (opts.routes || []).forEach(function (r) { s += routeXml(r); });
    return s + '</gpx>\n';
  }

  // ---------- tuonti ----------
  function txt(el, tag) {
    var c = el.getElementsByTagName(tag)[0];
    return c ? c.textContent.trim() : '';
  }
  function ext(el, local) {
    var list = el.getElementsByTagNameNS(NS, local);
    if (!list.length) return null;
    try { return JSON.parse(list[0].textContent); } catch (e) { return null; }
  }
  function pts(el, tag) {
    return Array.prototype.map.call(el.getElementsByTagName(tag), function (p) {
      return { lat: parseFloat(p.getAttribute('lat')), lng: parseFloat(p.getAttribute('lon')), name: txt(p, 'name') };
    }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng); });
  }

  function parse(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Tiedosto ei ole kelvollista GPX-muotoa.');
    var out = { routes: [], tracks: [], marks: [], tasks: [] };
    Array.prototype.forEach.call(doc.getElementsByTagName('rte'), function (rte) {
      var p = pts(rte, 'rtept');
      if (p.length < 2) return;
      out.routes.push({ name: txt(rte, 'name'), desc: txt(rte, 'desc'), points: p, meta: ext(rte, 'route') });
    });
    Array.prototype.forEach.call(doc.getElementsByTagName('trk'), function (trk) {
      var p = pts(trk, 'trkpt');
      if (p.length >= 2) out.tracks.push({ name: txt(trk, 'name') || 'Jälki', points: p });
    });
    Array.prototype.forEach.call(doc.getElementsByTagName('wpt'), function (w) {
      var lat = parseFloat(w.getAttribute('lat')), lng = parseFloat(w.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lng)) return;
      var meta = ext(w, 'item') || {};
      var item = { lat: lat, lng: lng, name: txt(w, 'name'), desc: txt(w, 'desc') };
      if (meta.kind === 'task') { item.time = meta.time || ''; out.tasks.push(item); }
      else { item.type = meta.type || 'general'; item.status = meta.status || 'draft'; out.marks.push(item); }
    });
    return out;
  }

  global.GPX = { build: build, parse: parse };
})(window);
