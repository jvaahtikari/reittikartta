/* Reittikartta – automaattinen reititys virallista väylää pitkin.
 *
 * Reitti lasketaan Väyläviraston navigointilinjoista (myös muiden väylänpitäjien linjat).
 * Linjoista rakennetaan verkko, jossa vain vaaditun kulkusyvyyden täyttävät osuudet kelpaavat,
 * ja lyhin reitti haetaan A*-algoritmilla. Lähtö- ja saapumispiste ovat lähimmät kelvolliset
 * väyläpisteet annettujen paikkojen lähellä. Tulos avataan muokkaustilaan tarkistettavaksi. */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  var map, App;

  var TOL = 2.5;            // solmujen yhdistämistoleranssi (m)
  var SIMPLIFY = 10;        // reittipisteiden harvennus: suurin poikkeama linjasta (m); kaarien alle 50 m:n pätkät yhdistyvät
  var MAX_ATTACH = 20000;   // lähtö- tai määräpaikka saa olla enintään näin kaukana kelvollisesta väylästä (m)

  // ---------- kulkusyvyys ----------
  // Linjan kulkusyvyys on merikartan kulkusyvyys (mitoitussyväys). Ilman tietoa olevaa linjaa ei
  // käytetä, koska vaatimuksen täyttymistä ei silloin voi todentaa.
  function lineDepth(f) {
    var p = f.properties || {};
    var d = p.mitoitussyvays;
    return d == null || d === '' || !isFinite(Number(d)) ? null : Number(d);
  }
  function firstJnro(jnro) { return String(jnro == null ? '' : jnro).split(/\s+/)[0]; }

  // ---------- verkko ----------
  // Koordinaatit muunnetaan paikalliseen metritasoon alueen keskipisteen ympärille. Kaarevuus
  // vääristää tasoa laajalla alueella hieman, mutta topologia (risteykset, lähimmät pisteet) säilyy.
  // Särmien pituudet lasketaan loksodromina.
  function Graph(origin) {
    this.origin = origin;
    this.nodes = [];          // { x, y, lat, lng, adj: [edgeIndex] }
    this.edges = [];          // { a, b, len, depth, jnro, other, line }
    this.grid = {};           // solmuhila yhdistämistä varten
  }
  Graph.prototype.toXY = function (lat, lng) { return G.toLocal(this.origin, { lat: lat, lng: lng }); };
  Graph.prototype.cellKey = function (x, y) { return Math.floor(x / 10) + ':' + Math.floor(y / 10); };
  Graph.prototype.node = function (lat, lng) {
    var p = this.toXY(lat, lng);
    var cx = Math.floor(p.x / 10), cy = Math.floor(p.y / 10);
    var best = -1, bd = TOL;
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
      var list = this.grid[(cx + i) + ':' + (cy + j)];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        var n = this.nodes[list[k]];
        var d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bd) { bd = d; best = list[k]; }
      }
    }
    if (best >= 0) return best;
    var id = this.nodes.length;
    this.nodes.push({ x: p.x, y: p.y, lat: lat, lng: lng, adj: [] });
    var key = cx + ':' + cy;
    (this.grid[key] = this.grid[key] || []).push(id);
    return id;
  };
  Graph.prototype.edge = function (a, b, info) {
    if (a === b) return -1;
    var na = this.nodes[a], nb = this.nodes[b];
    var e = { a: a, b: b, len: G.distance(na, nb), depth: info.depth, jnro: info.jnro, other: !!info.other, line: info.line };
    var id = this.edges.length;
    this.edges.push(e);
    na.adj.push(id); nb.adj.push(id);
    return id;
  };

  // Rakentaa verkon navigointilinjoista, joiden kulkusyvyys on vähintään minDepth.
  // Palauttaa myös tilastot: hylätyt linjat syvyyden ja puuttuvan tiedon vuoksi.
  function buildGraph(features, minDepth, origin) {
    var g = new Graph(origin);
    var stats = { lines: 0, used: 0, shallow: 0, unknown: 0 };
    var CA = global.ChartAPI;
    features.forEach(function (f) {
      stats.lines++;
      var d = lineDepth(f);
      if (d == null) { stats.unknown++; return; }
      if (d < minDepth) { stats.shallow++; return; }
      stats.used++;
      var p = f.properties || {};
      var info = { depth: d, jnro: firstJnro(p.jnro), other: (p.omistaja || '') !== 'Väylävirasto' && !!p.omistaja, line: p.navigointilinjaid != null ? p.navigointilinjaid : f.id };
      CA.lineCoords(f).forEach(function (coords) {
        var prev = -1;
        coords.forEach(function (c) {
          if (!isFinite(c[0]) || !isFinite(c[1])) return;
          var n = g.node(c[1], c[0]);
          if (prev >= 0 && prev !== n) g.edge(prev, n, info);
          prev = n;
        });
      });
    });
    splitCrossings(g);
    return { graph: g, stats: stats };
  }

  // Risteykset ja T-liitokset ilman yhteistä solmua: särmät jaetaan leikkauspisteessä, jotta
  // reitti voi vaihtaa väylältä toiselle siellä, missä linjat kohtaavat.
  function splitCrossings(g) {
    var CELL = 400, buckets = {};
    function cells(e) {
      var A = g.nodes[e.a], B = g.nodes[e.b], out = [];
      var x0 = Math.floor(Math.min(A.x, B.x) / CELL), x1 = Math.floor(Math.max(A.x, B.x) / CELL);
      var y0 = Math.floor(Math.min(A.y, B.y) / CELL), y1 = Math.floor(Math.max(A.y, B.y) / CELL);
      for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) out.push(x + ':' + y);
      return out;
    }
    g.edges.forEach(function (e, i) { cells(e).forEach(function (k) { (buckets[k] = buckets[k] || []).push(i); }); });
    var splits = {}, seen = {};
    function addSplit(ei, t, x, y) { (splits[ei] = splits[ei] || []).push({ t: t, x: x, y: y }); }
    Object.keys(buckets).forEach(function (k) {
      var list = buckets[k];
      for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        var ei = list[i], ej = list[j], pk = ei < ej ? ei + '-' + ej : ej + '-' + ei;
        if (seen[pk]) continue;
        seen[pk] = 1;
        var e1 = g.edges[ei], e2 = g.edges[ej];
        if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) {
          // yhteinen solmu: tarkistetaan vain, osuuko toisen vapaa pää ensimmäisen keskelle (ei tarvetta)
          continue;
        }
        var A = g.nodes[e1.a], B = g.nodes[e1.b], C = g.nodes[e2.a], D = g.nodes[e2.b];
        var rx = B.x - A.x, ry = B.y - A.y, sx = D.x - C.x, sy = D.y - C.y;
        var den = rx * sy - ry * sx;
        if (Math.abs(den) > 1e-9) {
          var t = ((C.x - A.x) * sy - (C.y - A.y) * sx) / den;
          var u = ((C.x - A.x) * ry - (C.y - A.y) * rx) / den;
          if (t > 0 && t < 1 && u > 0 && u < 1) {
            var px = A.x + rx * t, py = A.y + ry * t;
            addSplit(ei, t, px, py); addSplit(ej, u, px, py);
            continue;
          }
        }
        // T-liitos: särmän pää toisen särmän sisällä toleranssin päässä
        [[e2.a, ei], [e2.b, ei], [e1.a, ej], [e1.b, ej]].forEach(function (pr) {
          var P = g.nodes[pr[0]], e = g.edges[pr[1]], Pa = g.nodes[e.a], Pb = g.nodes[e.b];
          var vx = Pb.x - Pa.x, vy = Pb.y - Pa.y, len2 = vx * vx + vy * vy;
          if (!len2) return;
          var tt = ((P.x - Pa.x) * vx + (P.y - Pa.y) * vy) / len2;
          if (tt <= 0 || tt >= 1) return;
          var qx = Pa.x + vx * tt, qy = Pa.y + vy * tt;
          if (Math.hypot(P.x - qx, P.y - qy) < TOL) addSplit(pr[1], tt, P.x, P.y);
        });
      }
    });
    Object.keys(splits).forEach(function (ei) {
      var e = g.edges[ei];
      var pts = splits[ei].sort(function (p, q) { return p.t - q.t; });
      var prev = e.a, chain = [];
      pts.forEach(function (p) {
        var ll = G.fromLocal(g.origin, { x: p.x, y: p.y });
        var n = g.node(ll.lat, ll.lng);
        if (n !== prev) chain.push(n);
        prev = n;
      });
      if (!chain.length) return;
      // alkuperäinen särmä pois käytöstä, tilalle ketju
      e.dead = true;
      var info = { depth: e.depth, jnro: e.jnro, other: e.other, line: e.line };
      var from = e.a;
      chain.concat([e.b]).forEach(function (n) { if (n !== from) g.edge(from, n, info); from = n; });
    });
  }

  // ---------- lähimmän väyläpisteen haku ----------
  // Palauttaa lähimmän pisteen kelvollisella särmällä: { edge, t, lat, lng, dist }.
  function nearestOnGraph(g, ll) {
    var P = g.toXY(ll.lat, ll.lng), best = null;
    g.edges.forEach(function (e, i) {
      if (e.dead) return;
      var A = g.nodes[e.a], B = g.nodes[e.b];
      var vx = B.x - A.x, vy = B.y - A.y, len2 = vx * vx + vy * vy;
      var t = len2 ? Math.max(0, Math.min(1, ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2)) : 0;
      var qx = A.x + vx * t, qy = A.y + vy * t;
      var d = Math.hypot(P.x - qx, P.y - qy);
      if (!best || d < best.d) best = { edge: i, t: t, x: qx, y: qy, d: d };
    });
    if (!best) return null;
    var q = G.fromLocal(g.origin, { x: best.x, y: best.y });
    best.lat = q.lat; best.lng = q.lng;
    best.dist = G.distance(ll, q);
    return best;
  }
  // Liittää pisteen verkkoon väliaikaisena solmuna. Palauttaa solmun tunnuksen.
  function attach(g, at) {
    var e = g.edges[at.edge];
    if (at.t < 1e-6) return e.a;
    if (at.t > 1 - 1e-6) return e.b;
    var n = g.node(at.lat, at.lng);
    if (n === e.a || n === e.b) return n;
    // särmä jaetaan liitoskohdasta, jotta samalle linjalle osuva toinen piste liittyy oikeaan osuuteen
    e.dead = true;
    var info = { depth: e.depth, jnro: e.jnro, other: e.other, line: e.line };
    g.edge(e.a, n, info); g.edge(n, e.b, info);
    return n;
  }

  // ---------- A* ----------
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) {
    var a = this.a; a.push({ k: k, v: v });
    var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p].k <= a[i].k) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  function astar(g, s, t) {
    var N = g.nodes.length, dist = new Float64Array(N), parent = new Int32Array(N), via = new Int32Array(N), done = new Uint8Array(N);
    for (var i = 0; i < N; i++) { dist[i] = Infinity; parent[i] = -1; via[i] = -1; }
    var goal = g.nodes[t];
    function h(n) { return G.distance(g.nodes[n], goal) * 0.999; }
    var open = new Heap();
    dist[s] = 0; open.push(h(s), s);
    while (open.size()) {
      var cur = open.pop().v;
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur === t) break;
      var adj = g.nodes[cur].adj;
      for (var k = 0; k < adj.length; k++) {
        var e = g.edges[adj[k]];
        if (e.dead) continue;
        var nb = e.a === cur ? e.b : e.a;
        if (done[nb]) continue;
        var nd = dist[cur] + e.len;
        if (nd < dist[nb]) { dist[nb] = nd; parent[nb] = cur; via[nb] = adj[k]; open.push(nd + h(nb), nb); }
      }
    }
    if (!isFinite(dist[t])) return null;
    var path = [], edges = [], n = t;
    while (n !== -1) { path.push(n); if (via[n] >= 0) edges.push(via[n]); n = parent[n]; }
    path.reverse(); edges.reverse();
    return { nodes: path, edges: edges, len: dist[t] };
  }

  // ---------- reitin laskenta ----------
  // Hakualue laajenee vaiheittain, jos reittiä ei löydy: väylä voi kiertää kauempaa kuin suora linja.
  function searchBounds(a, b, step) {
    var pads = [0.3, 0.9, 2.0];
    if (step >= pads.length) return null;
    var pad = pads[step];
    var w = Math.max(0.12, Math.abs(a.lng - b.lng) * pad), h = Math.max(0.06, Math.abs(a.lat - b.lat) * pad);
    var b0 = L.latLngBounds([a.lat, a.lng], [b.lat, b.lng]);
    var out = L.latLngBounds([b0.getSouth() - h, b0.getWest() - w], [b0.getNorth() + h, b0.getEast() + w]);
    // enimmäisalue 4° × 2,5° (noin 220 × 280 km)
    if (out.getEast() - out.getWest() > 4 || out.getNorth() - out.getSouth() > 2.5) return null;
    return out;
  }

  function plan(from, to, minDepth, onStatus) {
    var CA = global.ChartAPI;
    if (!CA || !CA.loadRegion) return Promise.reject(new Error('Väyläaineisto ei ole käytettävissä.'));
    var origin = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
    var lastStats = null, lastNear = null;
    function attempt(step) {
      var bounds = searchBounds(from, to, step);
      if (!bounds) return Promise.resolve({ ok: false, reason: 'area', stats: lastStats, near: lastNear });
      if (onStatus) onStatus(step === 0 ? 'Haetaan väylätietoja…' : 'Laajennetaan hakualuetta…');
      return CA.loadRegion(bounds).then(function () {
        if (onStatus) onStatus('Lasketaan reittiä…');
        var feats = CA.navlineFeatures().filter(function (f) {
          // vain alueen linjat: nopeuttaa laajalla aineistolla
          var cs = CA.lineCoords(f);
          for (var i = 0; i < cs.length; i++) for (var j = 0; j < cs[i].length; j++) if (bounds.contains([cs[i][j][1], cs[i][j][0]])) return true;
          return false;
        });
        var built = buildGraph(feats, minDepth, origin), g = built.graph;
        lastStats = built.stats;
        if (!g.edges.length) return attempt(step + 1);
        // lähtöpiste liitetään ensin, jotta samalle linjalle osuva määränpää liittyy jaettuun osuuteen
        var nf = nearestOnGraph(g, from);
        if (!nf) return attempt(step + 1);
        if (nf.dist > MAX_ATTACH) return { ok: false, reason: 'far', stats: built.stats, near: { from: nf, to: nearestOnGraph(g, to) } };
        var s = attach(g, nf);
        var nt = nearestOnGraph(g, to);
        lastNear = { from: nf, to: nt };
        if (nt.dist > MAX_ATTACH) return { ok: false, reason: 'far', stats: built.stats, near: lastNear };
        var t = attach(g, nt);
        if (s === t) return { ok: false, reason: 'same', stats: built.stats, near: lastNear };
        var res = astar(g, s, t);
        if (!res) return attempt(step + 1);
        return finish(g, res, built.stats, nf, nt);
      });
    }
    return attempt(0);
  }

  function finish(g, res, stats, nf, nt) {
    var pts = res.nodes.map(function (n) { var nd = g.nodes[n]; return { lat: nd.lat, lng: nd.lng, node: n }; });
    // harvennus: suorat jatkokohdat ja tiheät kaaripisteet pois, poikkeama linjasta enintään SIMPLIFY m
    var keep = G.simplify(pts, SIMPLIFY);
    // kulkusyvyys ja väylät reitillä
    var minD = Infinity, minJnro = '', fairways = {}, order = [], other = 0;
    res.edges.forEach(function (ei) {
      var e = g.edges[ei];
      if (e.depth < minD) { minD = e.depth; minJnro = e.jnro; }
      if (!fairways[e.jnro]) { fairways[e.jnro] = { jnro: e.jnro, depth: e.depth, len: 0 }; order.push(e.jnro); }
      fairways[e.jnro].len += e.len;
      if (fairways[e.jnro].depth > e.depth) fairways[e.jnro].depth = e.depth;
      if (e.other) other += e.len;
    });
    var CA = global.ChartAPI;
    var onPath = {};
    res.edges.forEach(function (ei) { onPath[ei] = true; });
    // reitin pisteet ovat väyläaineiston pisteitä: merkitään kiinnitetyiksi kuten käsin kiinnitetyt.
    // Lähtö- ja saapumispiste ovat linjalla (kiinnitys linjaan), muut linjojen pisteitä.
    var points = keep.map(function (p, i) {
      var nd = g.nodes[p.node], jn = '';
      for (var k = 0; k < nd.adj.length; k++) { if (onPath[nd.adj[k]]) { jn = g.edges[nd.adj[k]].jnro; break; } }
      var mid = (i === 0 && nf.t > 1e-6 && nf.t < 1 - 1e-6) || (i === keep.length - 1 && nt.t > 1e-6 && nt.t < 1 - 1e-6);
      return { lat: p.lat, lng: p.lng, snap: { kind: mid ? 'line' : 'vertex', jnro: jn } };
    });
    return {
      ok: true, points: points, len: res.len, minDepth: minD, minJnro: minJnro, minName: CA.fairwayName(minJnro),
      fairways: order.map(function (j) { var f = fairways[j]; f.name = CA.fairwayName(j); return f; }),
      otherLen: other, stats: stats, near: { from: nf, to: nt }, rawPoints: res.nodes.length
    };
  }

  // ---------- reitin luonti ----------
  function fmtD(v) { return G.fmtNum(v, v % 1 ? 1 : 0); }
  function today() { var d = new Date(); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }

  function descText(res, minDepth) {
    var fw = res.fairways.map(function (f) { return (f.name || ('väylä ' + f.jnro)) + ' ' + fmtD(f.depth) + ' m'; });
    return 'Automaattinen reititys ' + today() + ' väylää pitkin, vaadittu kulkusyvyys ' + fmtD(minDepth) + ' m. ' +
      'Reitin pienin kulkusyvyys ' + fmtD(res.minDepth) + ' m' + (res.minName ? ' (' + res.minName + ')' : '') + '. ' +
      'Lähtöpiste on väylällä ' + G.fmtNM(res.near.from.dist) + ' annetusta paikasta ja saapumispiste ' + G.fmtNM(res.near.to.dist) + ' määränpäästä. ' +
      'Väylät: ' + fw.join('; ') + '. Tarkista reitti ennen käyttöä.';
  }
  // Reititysparametrit tallennetaan reitille (r.auto), jotta kulkusyvyyttä voi muuttaa tarkastelun aikana.
  function autoOf(from, to, minDepth) {
    return { from: { lat: from.lat, lng: from.lng, label: from.label || '' }, to: { lat: to.lat, lng: to.lng, label: to.label || '' }, depth: minDepth };
  }
  function createRoute(res, from, to, minDepth) {
    var r = S.newRoute(res.points);
    r.points.forEach(function (p, i) { p.snap = res.points[i].snap; });
    r.from = from.label || G.fmtPos(from); r.to = to.label || G.fmtPos(to);
    r.name = S.autoName(r);
    r.desc = descText(res, minDepth);
    r.auto = autoOf(from, to, minDepth);
    S.emit('routes');
    return r;
  }
  // Korvaa olemassa olevan reitin pisteet uudella laskennalla. Suuntanuotit, sivuutukset ja
  // käännösetäisyydet poistetaan, koska ne viittaavat vanhoihin legeihin. Nimi ja tila säilyvät.
  function replaceRoute(r, res, minDepth) {
    var old = r.desc || '';
    r.points = res.points.map(function (p) { return { lat: p.lat, lng: p.lng, snap: p.snap }; });
    r.notes = []; r.passes = []; r.turns = [];
    r.desc = /^Automaattinen reititys /.test(old) ? descText(res, minDepth) : (old ? old + '\n' : '') + descText(res, minDepth);
    r.auto.depth = minDepth;
    r.modified = new Date().toISOString();
    S.emit('routes');
    return r;
  }

  function summary(r, res, minDepth) {
    var fwRows = res.fairways.map(function (f) {
      return '<tr><td>' + UI.esc(f.name || ('Väylä ' + f.jnro)) + '</td><td>' + fmtD(f.depth) + ' m</td><td>' + G.fmtNM(f.len) + '</td></tr>';
    }).join('');
    var body = '<div class="help">' +
      '<p><b>' + UI.esc(r.name) + '</b>: ' + (r.points.length - 1) + ' legiä, ' + G.fmtNM(res.len) + '. ' +
      'Reitin pienin kulkusyvyys on <b>' + fmtD(res.minDepth) + ' m</b>' + (res.minName ? ' (' + UI.esc(res.minName) + ')' : '') +
      ', vaadittu vähintään ' + fmtD(minDepth) + ' m.</p>' +
      '<p>Lähtöpiste on lähin kelvollinen väyläpiste <b>' + G.fmtNM(res.near.from.dist) + '</b> annetusta lähtöpaikasta ja saapumispiste <b>' +
      G.fmtNM(res.near.to.dist) + '</b> määränpäästä.' +
      (res.near.from.dist > 50 || res.near.to.dist > 50 ? ' Reitti alkaa ja päättyy väylällä, joten mahdolliset väylän ulkopuoliset osuudet lisätään käsin.' : '') + '</p>' +
      (res.otherLen > 0 ? '<p>Reitistä ' + G.fmtNM(res.otherLen) + ' kulkee muun väylänpitäjän kuin Väyläviraston väylällä.</p>' : '') +
      '<table><tr><th>Väylä</th><th>Kulkusyvyys</th><th>Osuus</th></tr>' + fwRows + '</table>' +
      '<p class="meta">Reitti on muokkaustilassa: tarkista se ja säädä reittipisteet, suuntanuotit ja sivuutusetäisyydet. ' +
      'Reitti kulkee navigointilinjoilla, joiden kulkusyvyys on vähintään vaadittu; linjat, joilla ei ole kulkusyvyystietoa, on jätetty pois' +
      (res.stats.unknown ? ' (' + res.stats.unknown + ' kpl alueella)' : '') + '. Ei navigointikäyttöön.</p></div>';
    UI.modal({
      title: 'Reitti laskettu', body: body,
      buttons: [{ label: 'Muuta kulkusyvyyttä…', action: function () { setTimeout(function () { changeDepth(r.id); }, 0); } }, { label: 'Tarkista reitti', primary: true }]
    });
  }

  function failModal(res, from, to, minDepth, retry) {
    var why;
    if (res.reason === 'far') {
      var dfar = res.near.from.dist > res.near.to.dist ? 'Lähtöpaikka' : 'Määränpää';
      why = dfar + ' on yli ' + G.fmtNM(MAX_ATTACH) + ' päässä lähimmästä väylästä, jonka kulkusyvyys on vähintään ' + fmtD(minDepth) + ' m.';
    } else if (res.reason === 'same') {
      why = 'Lähtöpaikka ja määränpää osuvat samaan väyläpisteeseen.';
    } else if (res.stats && !res.stats.used && res.stats.lines) {
      why = 'Hakualueella ei ole yhtään navigointilinjaa, jonka kulkusyvyys on vähintään ' + fmtD(minDepth) + ' m' +
        (res.stats.unknown ? ' (' + res.stats.unknown + ' linjalta puuttuu kulkusyvyystieto)' : '') + '.';
    } else if (res.stats && !res.stats.lines) {
      why = 'Hakualueelta ei löytynyt navigointilinjoja. Tarkista verkkoyhteys ja että paikat ovat suomalaisella väylästöllä.';
    } else {
      why = 'Lähtöpaikan ja määränpään väliltä ei löytynyt yhtenäistä väylää, jonka kulkusyvyys on koko matkalla vähintään ' + fmtD(minDepth) + ' m. ' +
        'Hakualue laajennettiin enimmilleen.';
    }
    UI.modal({
      title: 'Reittiä ei löytynyt',
      body: '<div class="help"><p>' + UI.esc(why) + '</p><p class="meta">Kokeile pienempää kulkusyvyyttä, lähempänä väylää olevaa lähtö- tai määräpaikkaa tai jaa matka osiin. Linjat ilman kulkusyvyystietoa eivät kelpaa, koska vaatimusta ei voi silloin todentaa.</p></div>',
      buttons: [{ label: retry ? 'Muuta kulkusyvyyttä' : 'Muuta hakua', primary: true, action: function () { setTimeout(retry || function () { dialog({ from: from, to: to, depth: minDepth }); }, 0); } }, { label: 'Sulje' }]
    });
  }

  // Laskenta ilmoituksineen. onDone(res) saa tuloksen; palauttaa lupauksen reitistä tai null.
  function compute(from, to, minDepth, onDone) {
    var st = S.state.settings;
    st.routeDepth = minDepth; S.save();
    UI.banner({ kind: 'adding', text: 'Reititetään väylää pitkin: ' + (from.label || G.fmtPos(from)) + ' → ' + (to.label || G.fmtPos(to)) + ', kulkusyvyys ≥ ' + fmtD(minDepth) + ' m. Haetaan väylätietoja…' });
    App.setLabel('Reititys käynnissä');
    var t0 = Date.now();
    return plan(from, to, minDepth, function (msg) {
      UI.banner({ kind: 'adding', text: 'Reititetään väylää pitkin… ' + msg });
    }).then(function (res) {
      App.setLabel('');
      UI.banner(null);
      if (global.console && console.debug && res.ok) console.debug('Reititys', Date.now() - t0, 'ms', res.rawPoints, 'pistettä →', res.points.length);
      return onDone(res);
    }, function (e) {
      App.setLabel('');
      UI.banner(null);
      if (global.Routes.editingId) global.Routes.updateBanner();
      UI.toast('Reititys epäonnistui: ' + (e && e.message ? e.message : 'väylätietojen haku ei onnistunut.'), true);
      return null;
    });
  }
  function fitRoute(r) {
    App.fitTo(L.latLngBounds(r.points.map(function (p) { return [p.lat, p.lng]; })).pad(0.15), { maxZoom: 15 });
  }
  function run(from, to, minDepth) {
    return compute(from, to, minDepth, function (res) {
      if (!res.ok) { if (global.Routes.editingId) global.Routes.updateBanner(); failModal(res, from, to, minDepth); return null; }
      var r = createRoute(res, from, to, minDepth);
      global.Routes.enterEdit(r.id);
      fitRoute(r);
      summary(r, res, minDepth);
      return r;
    });
  }
  // Uudelleenreititys samalla lähtö- ja määräpaikalla mutta uudella kulkusyvyydellä. Nykyinen reitti
  // säilyy, jos uutta ei löydy.
  function reroute(id, minDepth) {
    var r = S.routeById(id);
    if (!r || !r.auto) return Promise.resolve(null);
    var a = r.auto;
    return compute(a.from, a.to, minDepth, function (res) {
      if (global.Routes.editingId === id) global.Routes.updateBanner();
      if (!res.ok) { failModal(res, a.from, a.to, minDepth, function () { changeDepth(id); }); return null; }
      replaceRoute(r, res, minDepth);
      if (global.Routes.editingId !== id) global.Routes.enterEdit(id); else global.Routes.updateBanner();
      fitRoute(r);
      summary(r, res, minDepth);
      return r;
    });
  }
  // Kulkusyvyyden muutos reitin tarkastelun aikana: pieni dialogi, joka reitittää uudelleen.
  function changeDepth(id) {
    var r = S.routeById(id);
    if (!r || !r.auto) { UI.toast('Reittiä ei ole laskettu automaattisesti, joten kulkusyvyyttä ei voi vaihtaa.', true); return; }
    var a = r.auto;
    var body = '<div class="form">' +
      '<label for="rdDepth">Pienin kulkusyvyys (m)</label><input id="rdDepth" type="number" min="0.1" max="30" step="0.1" value="' + a.depth + '">' +
      '<div class="hint">Nykyinen reitti on laskettu kulkusyvyydellä ' + fmtD(a.depth) + ' m. Reitti lasketaan uudelleen samalla lähtöpaikalla (' + UI.esc(a.from.label || G.fmtPos(a.from)) + ') ja määränpäällä (' + UI.esc(a.to.label || G.fmtPos(a.to)) + ').</div>' +
      '<div class="hint full">Reittipisteet korvataan uusilla, ja suuntanuotit, sivuutus- ja käännösetäisyydet poistetaan, koska ne viittaavat vanhoihin legeihin. Jos reittiä ei löydy, nykyinen reitti säilyy.</div>' +
      '<div class="err" id="rdErr" hidden></div></div>';
    UI.modal({
      title: 'Muuta kulkusyvyyttä', body: body, enterButton: 1,
      buttons: [{ label: 'Peruuta' }, {
        label: 'Reititä uudelleen', primary: true, action: function (md) {
          var d = parseFloat(String(md.querySelector('#rdDepth').value).replace(',', '.'));
          if (!isFinite(d) || d < 0.1 || d > 30) { var er = md.querySelector('#rdErr'); er.textContent = 'Anna pienin kulkusyvyys väliltä 0,1–30 m.'; er.hidden = false; return false; }
          d = Math.round(d * 10) / 10;
          if (d === a.depth) { UI.toast('Kulkusyvyys on jo ' + fmtD(d) + ' m.'); return; }
          setTimeout(function () { reroute(id, d); }, 0);
        }
      }],
      onOpen: function (md) { var i = md.querySelector('#rdDepth'); setTimeout(function () { i.focus(); i.select(); }, 40); }
    });
  }

  // ---------- dialogi ----------
  // Lähtöpiste: oma sijainti, asema, haku tai poiminta kartalta. Määränpää: haku tai poiminta kartalta.
  // ctx säilyttää kentät, kun dialogi suljetaan kartalta poimimisen ajaksi.
  function defaultDepth() {
    var st = S.state.settings;
    var d = (st.safetyDepths || {})[st.currentVessel];
    if (d != null && isFinite(d)) return Number(d);
    return st.routeDepth != null && isFinite(st.routeDepth) ? Number(st.routeDepth) : '';
  }
  function placeField(md, ctx, key, label, beforePick, reopen) {
    var q = md.querySelector('#rt' + key + 'Q'), box = md.querySelector('#rt' + key + 'Res'), pos = md.querySelector('#rt' + key),
      prev = md.querySelector('#rt' + key + 'Prev'), timer = null, seq = 0, results = [];
    function preview() {
      var v = pos.value.trim();
      var p = G.parsePos(v);
      var cur = ctx[key];
      if (!v) { prev.textContent = ''; prev.className = 'hint'; return; }
      if (p) {
        var same = cur && Math.abs(cur.lat - p.lat) < 5e-5 && Math.abs(cur.lng - p.lng) < 5e-5 && cur.label;
        prev.innerHTML = same ? UI.esc(cur.label) + ', ' + UI.esc(G.fmtPos(p)) : 'Tulkinta: ' + UI.esc(G.fmtPos(p));
        prev.className = 'hint ok';
        if (!same) ctx[key] = { lat: p.lat, lng: p.lng, label: '' };
      } else { prev.textContent = 'Koordinaatteja ei tunnistettu.'; prev.className = 'hint bad'; }
    }
    pos.addEventListener('input', preview);
    preview();
    function show(list, pending) {
      if (!q.value.trim()) { box.hidden = true; box.innerHTML = ''; return; }
      var h = '';
      if (!list.length) h = '<div class="sn">' + (pending ? 'Haetaan…' : 'Ei osumia. Kokeile nimen osaa tai koordinaatteja.') + '</div>';
      else list.forEach(function (it, i) {
        h += '<div class="sr" data-i="' + i + '"><i class="sn-no">' + (i + 1) + '</i>' +
          '<div class="sr-t"><b>' + UI.esc(it.name) + '</b><span>' + UI.esc(it.info || '') + '</span></div>' +
          '<em>' + G.fmtNM(it.km * 1000) + ' · ' + G.fmtBrg(it.brg, 0) + '</em></div>';
      });
      var note = !pending && q.value.trim().length >= 3 ? global.Search.namesNote() : '';
      if (note) h += '<div class="sn">' + UI.esc(note) + '</div>';
      box.innerHTML = h; box.hidden = false;
    }
    function find() {
      var s = q.value.trim(), my = ++seq;
      if (s.length < 2) { results = []; show([], false); return; }
      var c = map.getCenter();
      show([], true);
      global.Search.find(s, { lat: c.lat, lng: c.lng }).then(function (list) {
        if (my !== seq) return;
        results = list.slice(0, 20);
        show(results, false);
      });
    }
    function choose(i) {
      var it = results[i];
      if (!it) return;
      ctx[key] = { lat: it.lat, lng: it.lng, label: it.coord ? '' : it.name };
      pos.value = G.fmtPos(it);
      q.value = it.coord ? '' : it.name;
      box.hidden = true; box.innerHTML = '';
      preview();
    }
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(find, 350); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); clearTimeout(timer); if (results.length) choose(0); else find(); }
    });
    box.addEventListener('click', function (e) { var el = e.target.closest('.sr'); if (el) choose(Number(el.dataset.i)); });
    md.querySelector('#rt' + key + 'Pick').addEventListener('click', function () {
      if (beforePick) beforePick(md, ctx); else keep(md, ctx);
      UI.closeModal();
      global.Tools.pick(label + ' – ' + (UI.isTouch() ? 'napauta' : 'klikkaa') + ' paikka kartalta', function (ll) {
        ctx[key] = { lat: ll.lat, lng: ll.lng, label: '' };
        if (reopen) reopen(ctx); else dialog(ctx);
      });
    });
    var useGps = md.querySelector('#rt' + key + 'Gps'), useSt = md.querySelector('#rt' + key + 'St');
    if (useGps) useGps.addEventListener('click', function () {
      var p = App.gps && App.gps.position;
      if (!p) { UI.toast('Oma sijainti ei ole käytössä. Käynnistä se työkalupalkin sijaintipainikkeesta.', true); return; }
      ctx[key] = { lat: p.lat, lng: p.lng, label: 'Oma sijainti' }; pos.value = G.fmtPos(p); q.value = ''; preview();
    });
    if (useSt) useSt.addEventListener('click', function () {
      var s0 = S.state.settings.station;
      if (!s0) { UI.toast('Asemaa ei ole asetettu (Työkalut → Aseta asema kartalta).', true); return; }
      ctx[key] = { lat: s0.lat, lng: s0.lng, label: s0.name || 'Asema' }; pos.value = G.fmtPos(s0); q.value = ''; preview();
    });
  }
  function keep(md, ctx) {
    ['From', 'To'].forEach(function (k) {
      var p = G.parsePos(md.querySelector('#rt' + k).value);
      if (p) { if (!ctx[k] || Math.abs(ctx[k].lat - p.lat) > 5e-5 || Math.abs(ctx[k].lng - p.lng) > 5e-5) ctx[k] = { lat: p.lat, lng: p.lng, label: '' }; }
      else ctx[k] = null;
    });
    var d = parseFloat(String(md.querySelector('#rtDepth').value).replace(',', '.'));
    ctx.depth = isFinite(d) ? d : '';
  }
  function dialog(opts) {
    opts = opts || {};
    var ctx = { From: opts.from || opts.From || null, To: opts.to || opts.To || null, depth: opts.depth != null ? opts.depth : defaultDepth() };
    var st = S.state.settings;
    function fld(key, label, extra) {
      var cur = ctx[key];
      return '<label for="rt' + key + 'Q">' + label + '</label><div class="tfind">' +
        '<input id="rt' + key + 'Q" type="search" autocomplete="off" value="' + UI.esc(cur && cur.label ? cur.label : '') + '" placeholder="hae paikka, turvalaite tai kirjoita koordinaatit alle">' +
        '<div class="tsr" id="rt' + key + 'Res" hidden></div></div>' +
        '<label for="rt' + key + '">Koordinaatit</label><div class="rt-row"><input id="rt' + key + '" value="' + (cur ? UI.esc(G.fmtPos(cur)) : '') + '" placeholder="61°31,234\'N 023°45,678\'E">' +
        '<button type="button" class="btn small" id="rt' + key + 'Pick">Poimi kartalta</button>' + (extra || '') + '</div>' +
        '<div class="hint" id="rt' + key + 'Prev"></div>';
    }
    var startExtra = '<button type="button" class="btn small" id="rtFromGps">Oma sijainti</button>' +
      '<button type="button" class="btn small" id="rtFromSt"' + (st.station ? '' : ' disabled') + '>' + UI.esc((st.station && st.station.name) || 'Asema') + '</button>';
    var body = '<div class="form">' +
      '<div class="full group-h">Lähtöpiste</div>' + fld('From', 'Hae paikka', startExtra) +
      '<div class="full group-h">Määränpää</div>' + fld('To', 'Hae paikka') +
      '<div class="full group-h">Kulkusyvyys</div>' +
      '<label for="rtDepth">Pienin kulkusyvyys (m)</label><input id="rtDepth" type="number" min="0.1" max="30" step="0.1" value="' + (ctx.depth === '' ? '' : ctx.depth) + '">' +
      '<div class="hint">Reitti kulkee vain navigointilinjoilla, joiden kulkusyvyys on vähintään tämä. Oletus on aluksen turvasyvyys' + (st.currentVessel ? ' (' + UI.esc(st.currentVessel) + ')' : '') + '.</div>' +
      '<div class="hint full">Reitti kulkee virallista väylää pitkin Väyläviraston navigointilinjoja seuraten. Lähtö- ja saapumispiste ovat lähimmät kelvolliset väyläpisteet annettujen paikkojen lähellä. Laskettu reitti avataan muokkaustilaan tarkistettavaksi.</div>' +
      '<div class="err" id="rtErr" hidden></div></div>';
    UI.modal({
      title: 'Reititä väylää pitkin', body: body, enterButton: null, dismissable: true,
      buttons: [{ label: 'Peruuta' }, {
        label: 'Reititä', primary: true, action: function (md) {
          keep(md, ctx);
          var er = md.querySelector('#rtErr');
          function fail(msg) { er.textContent = msg; er.hidden = false; return false; }
          if (!ctx.From) return fail('Anna lähtöpaikka: hae nimellä, poimi kartalta tai kirjoita koordinaatit.');
          if (!ctx.To) return fail('Anna määränpää: hae nimellä, poimi kartalta tai kirjoita koordinaatit.');
          var d = ctx.depth;
          if (d === '' || !isFinite(d) || d < 0.1 || d > 30) return fail('Anna pienin kulkusyvyys väliltä 0,1–30 m.');
          if (G.distance(ctx.From, ctx.To) < 20) return fail('Lähtöpaikka ja määränpää ovat sama paikka.');
          setTimeout(function () { run(ctx.From, ctx.To, Math.round(d * 10) / 10); }, 0);
        }
      }],
      onOpen: function (md) {
        placeField(md, ctx, 'From', 'Lähtöpiste');
        placeField(md, ctx, 'To', 'Määränpää');
        md.querySelector('#rtDepth').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); md.querySelector('.btn.primary').click(); } });
        var first = !ctx.From ? '#rtFromQ' : !ctx.To ? '#rtToQ' : '#rtDepth';
        setTimeout(function () { var el = md.querySelector(first); if (el) { el.focus(); if (el.select) el.select(); } }, 40);
      }
    });
  }

  // ---------- reititys tehtävälle ----------
  // Määränpää on tehtäväpaikka ja lähtöpiste oma sijainti, asema tai muu paikka.
  // Jos oma sijainti ei ole vielä käytössä, se käynnistetään ja ensimmäistä paikannusta odotetaan.
  function waitGps(maxMs) {
    var p = App.gps && App.gps.position;
    if (p) return Promise.resolve(p);
    if (!App.gps || !App.gps.start) return Promise.resolve(null);
    App.gps.start();
    return new Promise(function (resolve) {
      var t0 = Date.now();
      UI.banner({ kind: 'adding', text: 'Haetaan omaa sijaintia reitin lähtöpisteeksi…', buttons: [{ label: 'Peruuta', action: function () { resolve(null); } }] });
      (function tick() {
        var q = App.gps.position;
        if (q) { resolve(q); return; }
        if (Date.now() - t0 > maxMs) { resolve(null); return; }
        setTimeout(tick, 400);
      })();
    }).then(function (q) { UI.banner(null); if (global.Routes.editingId) global.Routes.updateBanner(); return q; });
  }
  function taskDialog(taskId, ctx) {
    var st = S.state.settings;
    var tasks = S.state.tasks.slice().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0) || String(b.time).localeCompare(String(a.time)); });
    if (!tasks.length) {
      UI.modal({
        title: 'Reititä tehtävälle',
        body: '<div class="help"><p>Tehtäviä ei ole. Luo ensin tehtäväpaikka, niin reitti voidaan laskea sille.</p></div>',
        buttons: [{ label: 'Peruuta' }, { label: 'Uusi tehtävä…', primary: true, action: function () { setTimeout(function () { global.Tools.editTask(null, null); }, 0); } }]
      });
      return;
    }
    var active = tasks.filter(function (t) { return t.active; })[0];
    ctx = ctx || { task: taskId || (active ? active.id : tasks[0].id), start: (App.gps && App.gps.position) ? 'gps' : (st.station ? 'station' : (UI.isTouch() ? 'gps' : 'other')), From: null, depth: defaultDepth() };
    if (taskId) ctx.task = taskId;
    var opts = tasks.map(function (t) {
      return '<option value="' + UI.esc(t.id) + '"' + (t.id === ctx.task ? ' selected' : '') + '>' + UI.esc(t.name || 'Tehtävä') + (t.active ? ' (aktiivinen)' : '') + ' – ' + UI.esc(G.fmtPos(t)) + '</option>';
    }).join('');
    function radio(v, label, dis) {
      return '<label><input type="radio" name="rtStart" value="' + v + '"' + (ctx.start === v ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + label + '</label>';
    }
    var body = '<div class="form">' +
      '<label for="rtTask">Tehtävä</label><select id="rtTask">' + opts + '</select>' +
      '<label>Lähtöpiste</label><div class="checks rt-start">' +
      radio('gps', 'Oma sijainti' + (App.gps && App.gps.position ? '' : ' (käynnistetään)')) +
      radio('station', st.station ? UI.esc(st.station.name || 'Asema') : 'Asema (ei asetettu)', !st.station) +
      radio('other', 'Muu paikka') + '</div>' +
      '<div id="rtOther" class="full"' + (ctx.start === 'other' ? '' : ' hidden') + '><div class="form rt-sub">' +
      '<label for="rtFromQ">Hae paikka</label><div class="tfind"><input id="rtFromQ" type="search" autocomplete="off" value="' + UI.esc(ctx.From && ctx.From.label ? ctx.From.label : '') + '" placeholder="hae paikka, turvalaite tai kirjoita koordinaatit alle">' +
      '<div class="tsr" id="rtFromRes" hidden></div></div>' +
      '<label for="rtFrom">Koordinaatit</label><div class="rt-row"><input id="rtFrom" value="' + (ctx.From ? UI.esc(G.fmtPos(ctx.From)) : '') + '" placeholder="61°31,234\'N 023°45,678\'E">' +
      '<button type="button" class="btn small" id="rtFromPick">Poimi kartalta</button></div>' +
      '<div class="hint" id="rtFromPrev"></div></div></div>' +
      '<label for="rtDepth">Pienin kulkusyvyys (m)</label><input id="rtDepth" type="number" min="0.1" max="30" step="0.1" value="' + (ctx.depth === '' ? '' : ctx.depth) + '">' +
      '<div class="hint">Reitti kulkee vain navigointilinjoilla, joiden kulkusyvyys on vähintään tämä. Oletus on aluksen turvasyvyys' + (st.currentVessel ? ' (' + UI.esc(st.currentVessel) + ')' : '') + '.</div>' +
      '<div class="hint full">Reitti lasketaan virallista väylää pitkin lähtöpisteestä tehtäväpaikkaa lähimpään kelvolliseen väyläpisteeseen ja avataan muokkaustilaan tarkistettavaksi.</div>' +
      '<div class="err" id="rtErr" hidden></div></div>';
    function readStart(md) { var el = md.querySelector('input[name=rtStart]:checked'); return el ? el.value : 'other'; }
    UI.modal({
      title: 'Reititä tehtävälle', body: body, enterButton: null,
      buttons: [{ label: 'Peruuta' }, {
        label: 'Reititä', primary: true, action: function (md) {
          var er = md.querySelector('#rtErr');
          function fail(msg) { er.textContent = msg; er.hidden = false; return false; }
          ctx.task = md.querySelector('#rtTask').value; ctx.start = readStart(md);
          var t = S.taskById(ctx.task);
          if (!t || t.lat == null) return fail('Valitse tehtävä, jolla on paikka.');
          var d = parseFloat(String(md.querySelector('#rtDepth').value).replace(',', '.'));
          if (!isFinite(d) || d < 0.1 || d > 30) return fail('Anna pienin kulkusyvyys väliltä 0,1–30 m.');
          d = Math.round(d * 10) / 10;
          var to = { lat: t.lat, lng: t.lng, label: t.name || 'Tehtävä' };
          if (ctx.start === 'station') {
            if (!st.station) return fail('Asemaa ei ole asetettu.');
            setTimeout(function () { run({ lat: st.station.lat, lng: st.station.lng, label: st.station.name || 'Asema' }, to, d); }, 0);
            return;
          }
          if (ctx.start === 'gps') {
            setTimeout(function () {
              waitGps(25000).then(function (p) {
                if (!p) { UI.toast('Omaa sijaintia ei saatu. Salli sijainti tai valitse lähtöpisteeksi asema tai muu paikka.', true); taskDialog(null, ctx); return; }
                run({ lat: p.lat, lng: p.lng, label: 'Oma sijainti' }, to, d);
              });
            }, 0);
            return;
          }
          var p0 = G.parsePos(md.querySelector('#rtFrom').value);
          if (!p0) return fail('Anna lähtöpaikka: hae nimellä, poimi kartalta tai kirjoita koordinaatit.');
          var from = ctx.From && Math.abs(ctx.From.lat - p0.lat) < 5e-5 && Math.abs(ctx.From.lng - p0.lng) < 5e-5 ? ctx.From : { lat: p0.lat, lng: p0.lng, label: '' };
          if (G.distance(from, to) < 20) return fail('Lähtöpaikka ja tehtävä ovat sama paikka.');
          setTimeout(function () { run(from, to, d); }, 0);
        }
      }],
      onOpen: function (md) {
        var other = md.querySelector('#rtOther');
        md.querySelectorAll('input[name=rtStart]').forEach(function (rb) {
          rb.addEventListener('change', function () { ctx.start = readStart(md); other.hidden = ctx.start !== 'other'; if (!other.hidden) setTimeout(function () { md.querySelector('#rtFromQ').focus(); }, 30); });
        });
        md.querySelector('#rtTask').addEventListener('change', function () { ctx.task = this.value; });
        md.querySelector('#rtDepth').addEventListener('input', function () { var v = parseFloat(String(this.value).replace(',', '.')); ctx.depth = isFinite(v) ? v : ''; });
        // "Muu paikka" käyttää samaa hakukenttää kuin reititysdialogi; kartalta poiminta palaa tähän dialogiin
        placeField(md, ctx, 'From', 'Lähtöpiste', function () { ctx.task = md.querySelector('#rtTask').value; ctx.start = 'other'; var v = parseFloat(String(md.querySelector('#rtDepth').value).replace(',', '.')); ctx.depth = isFinite(v) ? v : ''; }, function () { taskDialog(null, ctx); });
        md.querySelector('#rtDepth').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); md.querySelector('.btn.primary').click(); } });
      }
    });
  }

  function init(m, app) { map = m; App = app; }

  global.Routing = {
    init: init, dialog: dialog, taskDialog: taskDialog, run: run, plan: plan, changeDepth: changeDepth, reroute: reroute,
    // reitin muokkausilmoituksen lisäpainike, kun reitti on laskettu automaattisesti
    bannerButton: function (r) {
      return r && r.auto ? { label: 'Kulkusyvyys ' + fmtD(r.auto.depth) + ' m', action: function () { changeDepth(r.id); } } : null;
    },
    // testattavaksi
    buildGraph: buildGraph, astar: astar, nearestOnGraph: nearestOnGraph, attach: attach, lineDepth: lineDepth
  };
})(window);
