/* Simulaattori – harjoitukset, automaattiohjaus, tallennus ja purku.
 *
 * Harjoitus 1 on Mustalahti–Siilinkari–Aitolahti virallista väylää pitkin. Reittipisteet ovat Väyläviraston navigointilinjojen
 * taitepisteitä (9235 Naistenlahti–Tervalahti, 9220 Olkahisten väylä, 9225 Aitolahden väylä), ja Mustalahden satamasta
 * Naistenlahden väylän alkuun on lyhyt avovesiosuus. Kaikki sijainnit ovat ETRS-TM35FIN-metrejä (E, N), joten tallenne ja purku eivät
 * riipu maailmakoordinaatiston origosta.
 *
 * Tämä moduuli ei käytä näkymiä. Se toimii selaimessa (window.Harjoitus) ja Nodessa (module.exports), joten sama automaattiohjaus
 * ajetaan testissä ilman piirtoa. Automaattiohjaus antaa samat komennot kuin käyttäjä (tosisuunta ja nopeus) Liike-moduulin
 * funktioilla, eikä se koske ruoriin tai vipuun. */
(function (root) {
  'use strict';
  var Liike = root.Liike || (typeof require !== 'undefined' ? require('./liike.js') : null);
  var Paikka = root.Paikka || (typeof require !== 'undefined' ? require('./paikka.js') : null);
  var KN = 1852 / 3600, RAD = Math.PI / 180;

  var SETTINGS = {
    turnMinDeg: 12,            // taitepiste on käännöspiste, jos suunta muuttuu vähintään näin paljon
    rudderStartFrac: 0.2,      // käännös alkaa, kun ruorin käyttö ylittää 20 % (määrittely kohta 6.3)
    sampleSec: 0.5,            // tallenteen näytteenottoväli (simulaatioaika)
    visRangeM: 700,            // viitan näkyvyys: etäisyys alle tämän
    visSampleSec: 1.0,         // näkyvyyden näytteenottoväli
    passedAidMaxM: 450,        // viitta lasketaan sivuutetuksi, jos lähin etäisyys jäljestä on alle tämän
    fairwayHalfM: 40,          // väyläalueen käytävä navigointilinjan molemmin puolin, kun aineistossa ei ole väyläaluepolygonia (aineistossa polygoni vain osalle väylistä)
    finishM: 80,               // perillä, kun etäisyys viimeiseen pisteeseen on alle tämän
    autoXteGain: 0.12,         // automaattiohjaus: suuntakorjaus (aste) sivupoikkeaman metriä kohti
    autoXteMaxDeg: 15,
    autoMinCmdGapSec: 1.5      // automaattiohjaus: vähimmäisväli suuntakäskyjen välillä
  };

  // ---------- Harjoitukset ----------
  var EXERCISES = {
    h1: {
      id: 'h1', nimi: 'Harjoitus 1', kuvaus: 'Mustalahti – Siilinkari – Aitolahti',
      route: [
        { e: 327184, n: 6823553, nimi: 'Mustalahti' },
        { e: 327771, n: 6823999, nimi: 'Naistenlahden väylän alku' },
        { e: 328045, n: 6824881, nimi: 'Siilinkarin kohta' },
        { e: 332200, n: 6825714, nimi: 'Pirttiniemi' },
        { e: 333273, n: 6825987, nimi: 'Kiikisensaari' },
        { e: 333726, n: 6825700 },
        { e: 334352, n: 6826392, nimi: 'Nupinnokka' },
        { e: 334417, n: 6826553 },
        { e: 334459, n: 6826731 },
        { e: 334475, n: 6826862 },
        { e: 334499, n: 6826941 },
        { e: 334551, n: 6826982 },
        { e: 334658, n: 6827038 },
        { e: 334769, n: 6827049, nimi: 'Aitolahti' }
      ],
      suggestKn: [10, 30],
      startKn: 0,                // sisäänrakennettu harjoitus alkaa levosta kuten ennen vaihetta 3h
      builtin: true
    }
  };

  // ---------- Reitti Reittikartasta (vaihe 3h) ----------
  // Reittikartta tallentaa reitit selaimen localStorage-avaimeen reittikartta.v1 (routes[], kentät id, name, from, via, to, status, points[{lat, lng}], speed).
  // Tallennettu reitti muunnetaan samaan muotoon kuin Harjoitus 1 (route: [{e, n, nimi}]), joten reitin geometria, automaattiohjaus ja purku käyttävät yhtä koodipolkua.
  var STORE_KEY = 'reittikartta.v1', DEFAULT_START_KN = 12;
  function storedName(r) {
    var nm = String(r.name || '').trim();
    if (nm) return nm;
    var parts = [r.from, r.via, r.to].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    return parts.length ? parts.join(' – ') : 'Nimetön reitti';
  }
  function fromStored(r) {
    if (!r || !Array.isArray(r.points)) return null;
    var pts = r.points.filter(function (p) { return p && isFinite(Number(p.lat)) && isFinite(Number(p.lng)); });
    if (pts.length < 2) return null;
    var route = pts.map(function (p) { var en = Paikka.lonlatToEN(Number(p.lng), Number(p.lat)); return { e: en.e, n: en.n, nimi: '' }; });
    if (r.from && String(r.from).trim()) route[0].nimi = String(r.from).trim();
    if (r.to && String(r.to).trim()) route[route.length - 1].nimi = String(r.to).trim();
    var total = 0;
    for (var i = 1; i < route.length; i++) total += Math.hypot(route[i].e - route[i - 1].e, route[i].n - route[i - 1].n);
    var sp = Number(r.speed);
    return {
      id: 'rk:' + r.id, rkId: r.id, nimi: storedName(r), kuvaus: '', route: route, builtin: false,
      status: r.status === 'approved' ? 'approved' : 'draft', pisteita: route.length, lengthM: total,
      startKn: sp > 0 && isFinite(sp) ? sp : DEFAULT_START_KN, speedFromRoute: sp > 0 && isFinite(sp)
    };
  }
  // Lukee Reittikartan reitit annetusta tallennuksesta (oletus window.localStorage). Virheellinen tai puuttuva tieto antaa tyhjän listan.
  function listStored(storage) {
    try {
      storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      var txt = storage && storage.getItem(STORE_KEY); if (!txt) return [];
      var st = JSON.parse(txt), rs = st && Array.isArray(st.routes) ? st.routes : [], out = [];
      rs.forEach(function (r) { var ex = fromStored(r); if (ex) out.push(ex); });
      return out;
    } catch (e) { return []; }
  }
  // Reittikartan asetukset, jotka vaikuttavat reittimerkintöihin plotterilla (legin suunta ja matka, käännösmerkit)
  function storedShow(storage) {
    var o = { legBrg: true, turnTicks: true };
    try {
      storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      var st = JSON.parse(storage.getItem(STORE_KEY) || '{}'), sh = st && st.settings && st.settings.show;
      if (sh) { if (sh.legBrg === false) o.legBrg = false; if (sh.turnTicks === false) o.turnTicks = false; }
    } catch (e) {}
    return o;
  }
  // Käänteinen reitti: viimeisestä pisteestä ensimmäiseen
  function reversed(ex) {
    var c = {}; Object.keys(ex).forEach(function (k) { c[k] = ex[k]; });
    c.route = ex.route.slice().reverse().map(function (p) { return { e: p.e, n: p.n, nimi: p.nimi || '' }; });
    c.reverse = true;
    return c;
  }
  // Lähtönopeus: tallennetun hetken tasapainotila. Alus voi aloittaa kulussa, jolloin simuloidaan irrallisessa kopiossa tasainen kulku ja siirretään sen nopeus ja vivun tila oikeaan tilaan.
  function settleSpeed(S, kn) {
    if (!(kn > 0)) return;
    var T = Liike.create({ x: 0, y: 0, hdg: S.hdg, conv: S.conv, clockMs: S.clockMs, v: kn * KN, speedKn: kn });
    for (var i = 0; i < 2400; i++) Liike.advance(T, 0.1);
    ['v', 'speedSense', 'leverTrim', 'leverCmd', 'lever', 'trim', 'rate', 'roll', 'rudder', 'rudderCmd'].forEach(function (k) { if (T[k] != null) S[k] = T[k]; });
    S.orderSpeedKn = kn; S.hmSpeedKn = kn; S.v = T.v;
  }

  function wrap180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function fmt1(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60, h = Math.floor(m / 60);
    if (h > 0) return h + ':' + ('0' + (m % 60)).slice(-2) + ':' + ('0' + s).slice(-2);
    return m + ':' + ('0' + s).slice(-2);
  }

  // ---------- Reitin geometria (EN-metreinä) ----------
  function buildRoute(ex) {
    var pts = ex.route.map(function (p) { return { e: p.e, n: p.n, nimi: p.nimi || '' }; });
    var legs = [], cum = 0, i;
    for (i = 0; i < pts.length - 1; i++) {
      var dx = pts[i + 1].e - pts[i].e, dy = pts[i + 1].n - pts[i].n, len = Math.hypot(dx, dy);
      legs.push({ i: i, len: len, brg: norm360(Math.atan2(dx, dy) / RAD), cum0: cum, ux: dx / len, uy: dy / len });
      cum += len;
    }
    var turns = [];
    for (i = 1; i < pts.length - 1; i++) {
      var d = wrap180(legs[i].brg - legs[i - 1].brg);
      pts[i].cum = legs[i].cum0;
      if (Math.abs(d) >= SETTINGS.turnMinDeg) turns.push({ idx: i, ptIndex: i, delta: d, e: pts[i].e, n: pts[i].n, cum: legs[i].cum0, nimi: pts[i].nimi });
    }
    pts[0].cum = 0; pts[pts.length - 1].cum = cum;
    turns.forEach(function (t, k) { t.no = k + 1; });
    return { id: ex.id, nimi: ex.nimi, kuvaus: ex.kuvaus || '', pts: pts, legs: legs, turns: turns, total: cum, startKn: ex.startKn || 0, builtin: !!ex.builtin, reverse: !!ex.reverse, status: ex.status || 'approved' };
  }

  // Pisteen (e, n) projektio reitille. Palauttaa lähimmän jakson, matkan reitillä (cum), sivupoikkeaman (xte, positiivinen = reitin oikealla puolella) ja etäisyyden.
  function project(route, e, n, hintLeg) {
    var best = null, from = 0, to = route.legs.length - 1;
    if (hintLeg != null) { from = Math.max(0, hintLeg - 1); to = Math.min(route.legs.length - 1, hintLeg + 2); }
    for (var i = from; i <= to; i++) {
      var L = route.legs[i], p = route.pts[i], rx = e - p.e, ry = n - p.n;
      var along = rx * L.ux + ry * L.uy, cross = rx * L.uy - ry * L.ux;   // cross > 0: oikealla (ux, uy) = (sin, cos)
      var ca = Math.max(0, Math.min(L.len, along)), dist = Math.hypot(rx - L.ux * ca, ry - L.uy * ca);
      if (!best || dist < best.dist) best = { leg: i, along: along, cum: L.cum0 + ca, xte: cross, dist: dist, brg: L.brg };
    }
    return best;
  }
  function distToRoute(route, e, n) { return project(route, e, n, null); }

  // ---------- Seuraava käännös plotterin lukemaan ----------
  function nextTurn(route, cumNow, v) {
    for (var i = 0; i < route.turns.length; i++) {
      var t = route.turns[i];
      if (t.cum > cumNow - 5) {
        var d = Math.max(0, t.cum - cumNow);
        return { turn: t, distM: d, etaSec: v > 0.8 ? d / v : null };
      }
    }
    return null;
  }

  // ---------- Automaattiohjaus: antaa samat komennot kuin käyttäjä ----------
  function createAuto(route, targetKn, origin) {
    var A = { route: route, targetKn: targetKn, started: false, lastCmdT: -1e9, leg: 0, done: false, origin: origin };
    A.step = function (S) {
      if (A.done) return;
      if (!A.started) { if (S.orderSpeedKn !== A.targetKn) Liike.orderSpeed(S, A.targetKn); A.started = true; }   // kulussa aloittava alus on jo tavoitenopeudessa: samaa käskyä ei anneta uudelleen, koska käsky aiheuttaisi nopeuden notkahduksen
      if (!route) { A.done = true; return; }          // vapaa ajo: automaattiohjaus antaa vain nopeuskäskyn, suunnasta huolehtii käyttäjä
      var e = S.x + A.origin.e, n = S.y + A.origin.n;
      var pr = project(route, e, n, A.leg);
      if (pr.leg > A.leg) A.leg = pr.leg;
      var li = A.leg, L = route.legs[li], vkn = S.v / KN;
      var toEnd = L.len - (pr.cum - L.cum0);                      // metriä jakson loppuun
      var aim = li;
      // käännöksen ennakointi: käännös aloitetaan käännöspisteen edestä käännöksen keston ja ruorimiehen viiveen verran
      if (li < route.legs.length - 1) {
        var d = wrap180(route.legs[li + 1].brg - L.brg), rateDeg = Math.max(2, Liike.maxTurnRate(S.v) / RAD * (Liike.SETTINGS.rudderNormalDeg / Liike.SETTINGS.rudderMaxDeg) * 0.75);
        var lead = S.v * (Liike.SETTINGS.helmsmanDelaySec + 0.5 * Math.abs(d) / rateDeg) + 6;
        lead = Math.min(lead, 0.45 * L.len);
        if (Math.abs(d) >= 4 && toEnd < lead) aim = li + 1;
        else if (Math.abs(d) < 4 && toEnd < 30) aim = li + 1;
      }
      var Ta = route.legs[aim], pa = project(route, e, n, aim), xte = (aim === li ? pr.xte : (function () {
        var p = route.pts[aim], rx = e - p.e, ry = n - p.n; return rx * Ta.uy - ry * Ta.ux; })());
      var corr = Math.max(-SETTINGS.autoXteMaxDeg, Math.min(SETTINGS.autoXteMaxDeg, -SETTINGS.autoXteGain * xte));
      var grid = Ta.brg + corr;
      var tr = norm360(grid + S.conv), cmd = norm360(Math.round(tr / 5) * 5);
      if (Math.abs(wrap180(cmd - S.orderHdg)) >= 5 && S.t - A.lastCmdT >= SETTINGS.autoMinCmdGapSec) {
        Liike.orderHeading(S, cmd); A.lastCmdT = S.t;
      }
      var last = route.pts[route.pts.length - 1];
      if (Math.hypot(e - last.e, n - last.n) < SETTINGS.finishM) A.done = true;
    };
    return A;
  }

  // ---------- Tallenne ----------
  function createRecorder(route, origin) {
    var R = {
      route: route, origin: origin, startMs: null, endMs: null,
      t: [], e: [], n: [], hdgTrue: [], v: [], rudder: [], inFw: [],   // inFw: 1 sisällä, 0 ulkona, -1 ei tietoa
      dShore: [], dShoal: [],                                          // etäisyys rantaviivaan ja alle 2 m:n syvyysalueeseen (m) tai null, kun tietoa ei ole
      aids: {}, groundings: [], collisions: [], plotter: [{ t: 0, on: true }], _acc: 1e9, _visAcc: 1e9, cmdLogStart: 0, finished: false, aborted: false
    };
    R.sample = function (S, inFairway, near) {
      R._acc += 0; // ajastus kutsujalla
      R.t.push(S.t); R.e.push(S.x + origin.e); R.n.push(S.y + origin.n); R.hdgTrue.push(Liike.trueHdg(S));
      R.v.push(S.v); R.rudder.push(S.rudder); R.inFw.push(inFairway == null ? -1 : (inFairway ? 1 : 0));
      R.dShore.push(near && near.shore != null ? near.shore : null); R.dShoal.push(near && near.shoal != null ? near.shoal : null);
    };
    // Viitan näkyvyyden seuranta: aid = {numero, nimi, e, n, tyyppi}, vis = boolean. Kutsutaan ajastetusti (visSampleSec).
    R.sampleAid = function (S, aid, vis, dt) {
      var d = Math.hypot(S.x + origin.e - aid.e, S.y + origin.n - aid.n);
      var a = R.aids[aid.numero];
      if (!a) {
        if (d > SETTINGS.visRangeM) return;
        a = R.aids[aid.numero] = { numero: aid.numero, nimi: aid.nimi, tyyppi: aid.tyyppi, nl: aid.nl, e: aid.e, n: aid.n, minD: d, tMin: S.t, seen: 0, passed: false, firstSeenD: null, firstSeenT: null, lastD: d, side: 0 };
      }
      if (a.passed) return;
      if (d < a.minD) { a.minD = d; a.tMin = S.t; a.side = sideOf(S, aid, origin); }
      else if (d > a.minD + 15) { a.passed = true; return; }
      if (d <= SETTINGS.visRangeM && vis) {
        a.seen += dt;
        if (a.firstSeenD == null) { a.firstSeenD = d; a.firstSeenT = S.t; }
      }
      a.lastD = d;
    };
    return R;
  }
  function sideOf(S, aid, origin) {
    // positiivinen = viitta aluksen oikealla puolella (ruutusuunnan suhteen)
    var dx = aid.e - (S.x + origin.e), dy = aid.n - (S.y + origin.n), a = S.hdg * RAD;
    return (dx * Math.cos(a) - dy * Math.sin(a)) > 0 ? 1 : -1;
  }

  // ---------- Purku ----------
  // Reitti (R.route) on valinnainen: vapaassa ajossa se on null, ja reittiin sidotut osat (poikkeama, käännökset, viittojen reittikohta) jäävät pois.
  // Väyläalueen käyttö: käytetään tallenteen inFw-kenttää (1 sisällä, 0 ulkona, -1 ei tietoa).
  function analyze(R, S) {
    var route = R.route, out = { ok: R.t.length > 2, hasRoute: !!route }, i, N = R.t.length;
    if (!out.ok) return out;
    var dur = R.t[N - 1] - R.t[0];
    // 5. kokonaisaika, keskinopeus, kuljettu matka
    var distTravelled = 0, maxV = 0;
    for (i = 1; i < N; i++) distTravelled += Math.hypot(R.e[i] - R.e[i - 1], R.n[i] - R.n[i - 1]);
    for (i = 0; i < N; i++) if (R.v[i] > maxV) maxV = R.v[i];
    out.timeSec = dur; out.distM = distTravelled; out.avgKn = dur > 0 ? distTravelled / dur / KN : 0; out.maxKn = maxV / KN;
    if (route) { var last = project(route, R.e[N - 1], R.n[N - 1], null); out.routeProgressM = last.cum; out.routeTotalM = route.total; }
    // matka väyläalueen ulkopuolella (näytevälin pituus lasketaan väylätiedon kuntoon, kun loppupään näyte on tiedossa)
    var knownM = 0, outM = 0;
    for (i = 1; i < N; i++) {
      if (R.inFw[i] < 0) continue;
      var seg = Math.hypot(R.e[i] - R.e[i - 1], R.n[i] - R.n[i - 1]); knownM += seg; if (R.inFw[i] === 0) outM += seg;
    }
    out.outsideM = outM; out.fairwayKnownM = knownM; out.outsidePct = knownM > 0 ? outM / knownM * 100 : null;
    // lähin rantaviiva ja lähin alle 2 m:n syvyysalue
    function minOf(arr) {
      var bi = -1, bd = 1e12; if (!arr) return null;
      for (var k = 0; k < arr.length; k++) if (arr[k] != null && arr[k] < bd) { bd = arr[k]; bi = k; }
      return bi < 0 ? null : { m: bd, e: R.e[bi], n: R.n[bi], t: R.t[bi] };
    }
    out.minShore = minOf(R.dShore); out.minShoal = minOf(R.dShoal);
    out.startE = R.e[0]; out.startN = R.n[0]; out.endE = R.e[N - 1]; out.endN = R.n[N - 1];
    out.groundings = R.groundings.slice();
    // törmäykset (nopeus 1,0 kn tai yli, ajo pysähtyi) ja kosketukset (alle 1,0 kn, ajo jatkui) esteisiin: laituri, aallonmurtaja, vesikivi, sillan pilari
    out.collisions = (R.collisions || []).map(function (c) { return { t: c.t - (R.t0 || 0), type: c.type, kind: c.kind, kn: c.kn, e: c.e, n: c.n }; });
    out.crashCount = out.collisions.filter(function (c) { return c.type === 'tormays'; }).length;
    out.touchCount = out.collisions.filter(function (c) { return c.type === 'kosketus'; }).length;
    out.finished = R.finished; out.aborted = R.aborted;
    // 1. osuus ajasta väyläalueen sisällä
    var known = 0, inside = 0;
    for (i = 0; i < N; i++) { if (R.inFw[i] >= 0) { known++; if (R.inFw[i] === 1) inside++; } }
    out.fairwayPct = known ? inside / known * 100 : null;
    out.fairwayKnownPct = known / N * 100;
    // 2. suurin poikkeama navigointilinjasta
    var maxD = 0, maxI = 0, hint = 0, cums = [];
    if (route) {
      for (i = 0; i < N; i++) {
        var p = project(route, R.e[i], R.n[i], null);
        if (p.dist > maxD) { maxD = p.dist; maxI = i; }
      }
      out.maxDev = { m: maxD, e: R.e[maxI], n: R.n[maxI], t: R.t[maxI], cum: project(route, R.e[maxI], R.n[maxI], null).cum };
      // 3. käännökset
      for (i = 0; i < N; i++) cums.push(project(route, R.e[i], R.n[i], i ? hintOf(cums[i - 1]) : null));
    }
    out.turns = (route ? route.turns : []).map(function (T) {
      var res = { no: T.no, nimi: T.nimi, delta: T.delta, startOffsetM: null, cutM: null };
      // lähin hetki käännöspisteeseen
      var bi = -1, bd = 1e12;
      for (var k = 0; k < N; k++) { var dd = Math.hypot(R.e[k] - T.e, R.n[k] - T.n); if (dd < bd) { bd = dd; bi = k; } }
      if (bi < 0 || bd > 400) return res;
      res.cutM = bd; res.t = R.t[bi];
      var sgn = T.delta > 0 ? 1 : -1, thr = SETTINGS.rudderStartFrac;
      // etsi ruorin käyttöjakso (etumerkki oikea, yli 20 %), joka sisältää lähimmän hetken tai on sitä lähinnä (enintään 40 s)
      var s0 = -1;
      var lo = bi, hi = bi, found = false, win = 40;
      for (var w = 0; w <= win * 2 && !found; w++) {   // 0,5 s:n välein
        var cand = [bi - w, bi + w];
        for (var c = 0; c < 2; c++) {
          var j = cand[c]; if (j < 0 || j >= N) continue;
          if (R.rudder[j] * sgn > thr) { s0 = j; found = true; break; }
        }
      }
      if (found) {
        while (s0 > 0 && R.rudder[s0 - 1] * sgn > thr) s0--;
        res.startOffsetM = cums[s0].cum - T.cum;       // negatiivinen = ennen käännöspistettä
        res.startT = R.t[s0];
        res.startE = R.e[s0]; res.startN = R.n[s0];
      }
      return res;
    });
    function hintOf(p) { return p ? p.leg : null; }
    // 4. sivuutetut viitat
    var aidsOut = [];
    Object.keys(R.aids).forEach(function (k) {
      var a = R.aids[k];
      if (a.minD > SETTINGS.passedAidMaxM) return;
      aidsOut.push({ numero: a.numero, nimi: a.nimi, tyyppi: a.tyyppi, nl: a.nl, minD: a.minD, tPass: a.tMin, seenSec: a.seen, firstSeenD: a.firstSeenD, side: a.side, e: a.e, n: a.n, cum: route ? project(route, a.e, a.n, null).cum : null });
    });
    aidsOut.sort(function (a, b) { return a.tPass - b.tPass; });
    out.aids = aidsOut;
    // plotterin sammutusaika
    var off = 0, t0 = R.t[0], tEnd = R.t[N - 1];
    for (i = 0; i < R.plotter.length; i++) {
      if (!R.plotter[i].on) { var tn = i + 1 < R.plotter.length ? R.plotter[i + 1].t : tEnd; off += Math.max(0, Math.min(tn, tEnd) - Math.max(R.plotter[i].t, t0)); }
    }
    out.plotterOffSec = off;
    // 8. komentoloki suhteessa käännöspisteisiin
    var log = [];
    (S.cmdLog || []).forEach(function (c) {
      if (c.kind === 'lever0') return;
      var e = c.e != null ? c.e : (c.x + R.origin.e), n = c.n != null ? c.n : (c.y + R.origin.n);
      var nt = null, best = 1e12;
      if (route) {
        var pr = project(route, e, n, null);
        route.turns.forEach(function (T) { var d = pr.cum - T.cum; if (Math.abs(d) < best) { best = Math.abs(d); nt = { no: T.no, nimi: T.nimi, offsetM: d }; } });
      }
      log.push({ t: c.t - (R.t0 || 0), kind: c.kind, value: c.value, gentle: !!c.gentle, e: e, n: n, hdgTrue: c.hdgTrue, vKn: c.v != null ? c.v / KN : null, offsetM: nt ? nt.offsetM : null, turnNo: nt ? nt.no : null, turnName: nt ? nt.nimi : '' });
    });
    out.cmdLog = log;
    return out;
  }

  // Esteeseen osuminen tekstinä: kosketus (alle 1,0 kn) tai törmäys, kohde, nopeus. value = { kind, kn }
  var ACC = { laituri: 'laituriin', aallonmurtaja: 'aallonmurtajaan', kivi: 'vesikiveen', pilari: 'sillan pilariin', vene: 'veneeseen' };
  function collisionText(type, v) {
    return (type === 'kosketus' ? 'Kosketus ' : 'Törmäys ') + (ACC[v && v.kind] || 'esteeseen') + ' ' + (Math.round((v ? v.kn : 0) * 10) / 10).toFixed(1).replace('.', ',') + ' kn';
  }
  // Komentorivi tekstinä
  function cmdText(c) {
    if (c.kind === 'heading') return Liike.headingText(c.value) + (c.gentle ? ' (loiva)' : '');
    if (c.kind === 'gentle') return c.value ? 'Loiva merkitty' : 'Loiva poistettu';
    if (c.kind === 'speed') return Liike.speedText(c.value);
    if (c.kind === 'stern') return c.value === 'vasen' ? 'Perä vasemmalle' : 'Perä oikealle';
    if (c.kind === 'straight') return 'Suoraan';
    if (c.kind === 'kosketus' || c.kind === 'tormays') return collisionText(c.kind, c.value);
    if (c.kind === 'crash') return 'Crash stop';
    if (c.kind === 'plotter') return c.value ? 'Plotteri päälle' : 'Plotteri pois';
    return c.kind;
  }

  var api = {
    SETTINGS: SETTINGS, EXERCISES: EXERCISES, buildRoute: buildRoute, project: project, distToRoute: distToRoute, nextTurn: nextTurn,
    createAuto: createAuto, createRecorder: createRecorder, analyze: analyze, cmdText: cmdText, collisionText: collisionText, mmss: mmss, fmt1: fmt1, wrap180: wrap180, norm360: norm360,
    fromStored: fromStored, listStored: listStored, storedShow: storedShow, reversed: reversed, settleSpeed: settleSpeed, DEFAULT_START_KN: DEFAULT_START_KN, STORE_KEY: STORE_KEY
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Harjoitus = api;
})(typeof window !== 'undefined' ? window : globalThis);
