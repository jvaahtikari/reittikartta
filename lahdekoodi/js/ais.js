/* Reittikartta – AIS-alukset.
 * Alusten sijainnit ja alustiedot haetaan Fintrafficin Digitraffic Marine -rajapinnasta
 * (meri.digitraffic.fi, lisenssi CC BY 4.0) ja piirretään kartalle omaan paneeseensa.
 * Moduuli huolehtii myös tiedon haun ajastuksesta, aluksen kortista sekä alusten hausta
 * nimellä, kutsutunnuksella ja MMSI-numerolla. Haku on käynnissä vain silloin, kun kerros
 * on päällä ja sivu näkyvissä. Tieto on viiveellistä, eikä se sovellu navigointiin tai
 * törmäysten välttämiseen. */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;

  var API = 'https://meri.digitraffic.fi/api/ais/v1';
  var USER = 'Reittikartta';                 // Fintraffic pyytää sovelluksia tunnistautumaan tällä otsakkeella
  var ATTR = 'AIS: <a href="https://www.digitraffic.fi/meriliikenne/" target="_blank" rel="noopener">Fintraffic / Digitraffic</a>, CC BY 4.0';

  // hakujen ajastus
  var POS_MS = 30000;                        // sijaintien päivitys
  var POS_FULL_MS = 600000;                  // koko aineisto haetaan uudelleen, jolloin vanhat poistuvat
  var VES_MS = 900000;                       // alustietojen päivitys
  var VES_WINDOW_MS = 7 * 86400000;          // ensimmäisellä haulla alustiedot seitsemän vuorokauden ajalta
  var OVERLAP_MS = 60000;                    // päivityshaut alkavat minuutin ennen edellistä, ettei mitään jää väliin
  var FRESH_MS = 120000;                     // haun ajaksi kerroksen ollessa pois päältä riittävän tuore aineisto

  // piirto
  var PANE_Z = 465;                          // chart.js: aidPane 460, flarePane 455, labelPane 450. Leafletin markerPane 600 jää tämän päälle
  var MIN_Z = 8;                             // alukset näkyvät tästä zoomaustasosta alkaen
  var LABEL_Z = 12;                          // nimet tästä tasosta alkaen
  var LABEL_Z_SAR = 10;                      // pelastusalusten nimet jo tästä tasosta alkaen
  var MAX_DRAWN = 400;
  var MOVING_KN = 0.5;                       // tätä nopeammin kulkeva alus on liikkeessä
  var DIM_MS = 600000;                       // yli 10 minuuttia vanha sijainti himmeänä
  var DIM_OPACITY = 0.45;
  var MAX_AGE_MS = 3600000;                  // yli tunnin vanhaa sijaintia ei piirretä eikä haeta
  var VECTOR_MIN = 0.1;                      // nopeusvektori: 6 minuuttia eli 0,1 tuntia
  var HULL_MIN_PX = 18;                      // runko piirretään todellisessa mittakaavassa, kun sen pituus näytöllä on vähintään tämä
  var HULL_BOW = 0.18;                       // keula kapenee kärkeen noin 18 % rungon pituudesta
  var CIRCLE_MAX = 40;                       // suunnattoman aluksen ympyrä kasvaa aluksen pituuden mukaan, enintään tähän kokoon
  var GRAY = '#9aa3ab';
  var SAR = '#ff6a13';
  var EDGE = '#0d1b26';

  var map, layer, noteEl = null, attrOn = false;
  var pos = {};                              // MMSI -> { lat, lng, t, sog, cog, heading, navStat }
  var ves = {};                              // MMSI -> alustiedot
  var noVes = {};                            // MMSI, joille rajapinta vastasi 404, jottei samaa kysytä uudelleen
  var drawn = {};                            // MMSI -> kartalla oleva merkki
  var lastMax = 0, lastFullAt = 0, posOkAt = 0, vesAt = 0, vesLoaded = false;
  var inflightPos = null, inflightVes = null, failStreak = 0;
  var running = false, busy = false, timer = null, renderTimer = null;
  var pinned = null, pendingOpen = null, openTimer = null, openMmsi = null;
  var singleQ = [], singleBusy = 0, singleWait = {}, singleFail = {};

  // ---------- apufunktiot ----------
  function enabled() { var sh = S.state.settings.show; return !sh || sh.ais !== false; }
  function visible() { return document.visibilityState !== 'hidden'; }
  // AIS-nimissä on usein @-täytemerkkejä ja ylimääräisiä välilyöntejä
  function clean(s) { return String(s == null ? '' : s).replace(/@+/g, ' ').replace(/\s+/g, ' ').trim(); }
  // vertailumuoto hakua varten: pienet kirjaimet ja ilman tarkkeita, jolloin ä ja ö löytävät A:n ja O:n
  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* vanha selain */ }
    return s;
  }
  function num(v) { var n = Number(v); return v != null && isFinite(n) ? n : null; }

  // ---------- tyypit ja tilat suomeksi ----------
  function typeColor(t) {
    if (t == null) return GRAY;
    if (t === 51) return SAR;
    if (t >= 70 && t <= 79) return '#2e9e44';
    if (t >= 80 && t <= 89) return '#d4282f';
    if (t >= 60 && t <= 69) return '#1f6fe0';
    if (t >= 40 && t <= 49) return '#e8c21a';
    if (t === 30) return '#a0672b';
    if (t === 36 || t === 37) return '#b05cd6';
    if ((t >= 31 && t <= 34) || t === 50 || (t >= 52 && t <= 59)) return '#19a7c6';
    if (t === 35) return '#6b7b8c';
    return GRAY;
  }
  function typeName(t) {
    if (t == null) return 'tuntematon';
    if (t >= 20 && t <= 29) return 'siipialus';
    if (t >= 40 && t <= 49) return 'pika-alus';
    if (t >= 60 && t <= 69) return 'matkustaja-alus';
    if (t >= 70 && t <= 79) return 'rahtialus';
    if (t >= 80 && t <= 89) return 'säiliöalus';
    if (t >= 90 && t <= 99) return 'muu alus';
    switch (t) {
      case 30: return 'kalastusalus';
      case 31: case 32: case 52: return 'hinaaja';
      case 33: return 'ruoppaaja';
      case 34: return 'sukellustoiminta';
      case 35: return 'sotilasalus';
      case 36: return 'purjealus';
      case 37: return 'huvialus';
      case 50: return 'luotsialus';
      case 51: return 'etsintä- ja pelastusalus';
      case 53: return 'satama-alus';
      case 54: return 'ympäristöntorjunta-alus';
      case 55: return 'viranomaisalus';
      case 58: return 'sairaankuljetus';
      default: return 'tuntematon';
    }
  }
  var NAV = {
    0: 'kulussa konevoimalla', 1: 'ankkurissa', 2: 'ei komennossa', 3: 'rajoitettu ohjailukyky', 4: 'syväyksensä rajoittama',
    5: 'kiinnitetty', 6: 'karilla', 7: 'kalastamassa', 8: 'purjehtimassa', 14: 'AIS-SART tai hätälähetin'
  };
  function navName(n) { return NAV[n] || 'ei määritelty'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ETA on pakattu UTC-aika (kuukausi, päivä, tunti, minuutti). Puuttuvan arvon merkkinä ovat nolla kuukausi tai päivä, tunti 24 ja minuutti 60.
  function fmtEta(eta) {
    if (!eta || eta < 0) return '';
    var mo = (eta >> 16) & 15, d = (eta >> 11) & 31, h = (eta >> 6) & 31, mi = eta & 63;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return '';
    return G.pad(d, 2) + '.' + G.pad(mo, 2) + '. ' + G.pad(h, 2) + ':' + G.pad(mi, 2) + ' UTC';
  }
  function fmtAge(ms) {
    var m = Math.floor(Math.max(0, ms) / 60000);
    if (m < 1) return 'alle minuutti sitten';
    if (m < 60) return m + ' min sitten';
    return Math.floor(m / 60) + ' h ' + G.pad(m % 60, 2) + ' min sitten';
  }

  // ---------- rajapintakutsut ----------
  // Ainoa oma otsake on Digitraffic-User. Aikakatkaisu estää jumiin jääneen haun tukkimasta ajastusta.
  function getJson(path, ms) {
    var ctl = global.AbortController ? new global.AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, ms || 30000) : null;
    var opts = { headers: { 'Digitraffic-User': USER } };
    if (ctl) opts.signal = ctl.signal;
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 404) { var e = new Error('ei löytynyt'); e.status = 404; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { clearTimeout(to); return j; }, function (e) { clearTimeout(to); throw e; });
  }

  // Sijaintivastaus kootaan MMSI:n mukaan. Koko haku rakentaa aineiston alusta, päivityshaku yhdistyy aiempaan.
  function parsePositions(j, base, baseMax) {
    var fs = (j && j.features) || [], next = base, max = baseMax;
    var stamp = j && j.dataUpdatedTime ? Date.parse(j.dataUpdatedTime) : NaN;
    fs.forEach(function (f) {
      var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
      var mmsi = f.mmsi != null ? f.mmsi : p.mmsi;
      if (mmsi == null || !c || c.length < 2) return;
      var lng = Number(c[0]), lat = Number(c[1]);
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;   // 91° ja 181° tarkoittavat, ettei sijaintia ole
      var t = Number(p.timestampExternal);
      if (!isFinite(t) || t <= 0) t = stamp;
      if (!isFinite(t) || t <= 0) return;
      var old = next[mmsi];
      if (old && old.t >= t) return;
      var sog = num(p.sog), cog = num(p.cog), hd = num(p.heading);
      next[mmsi] = {
        mmsi: String(mmsi), lat: lat, lng: lng, t: t,
        sog: sog != null && sog >= 0 && sog < 102.3 ? sog : null,
        cog: cog != null && cog >= 0 && cog < 360 ? cog : null,
        heading: hd != null && hd >= 0 && hd < 360 ? hd : null,
        navStat: num(p.navStat)
      };
      if (t > max) max = t;
    });
    return { pos: next, max: max, n: fs.length };
  }

  function normVessel(v) {
    var n = function (x) { x = num(x); return x != null && x > 0 ? x : 0; };
    var name = clean(v.name), call = clean(v.callSign);
    return {
      name: name, callSign: call, imo: n(v.imo), destination: clean(v.destination),
      draught: n(v.draught), eta: n(v.eta), shipType: num(v.shipType),
      a: n(v.referencePointA), b: n(v.referencePointB), c: n(v.referencePointC), d: n(v.referencePointD),
      nameKey: fold(name), callKey: fold(call).replace(/\s+/g, '')       // hakua varten
    };
  }

  function setNote() {
    if (!noteEl) return;
    var bad = enabled() && (failStreak >= 2 || (failStreak >= 1 && !posOkAt));
    noteEl.hidden = !bad;
  }

  // Jos sama haku on jo kesken, palautetaan sen lupaus. Lupaus ei koskaan hylkäydy, vaan antaa arvon true tai false.
  function loadPositions(full) {
    if (inflightPos) return inflightPos;
    var whole = !!full || !lastMax;
    var url = '/locations' + (whole ? '' : '?from=' + (lastMax - OVERLAP_MS));
    inflightPos = getJson(url).then(function (j) {
      var res = parsePositions(j, whole ? {} : pos, whole ? 0 : lastMax);
      // tyhjä vastaus koko haulle ei tyhjennä kartan aineistoa
      if (whole && !res.n && Object.keys(pos).length) throw new Error('tyhjä vastaus');
      pos = res.pos; lastMax = res.max;
      posOkAt = Date.now();
      if (whole) lastFullAt = posOkAt;
      failStreak = 0;
      return true;
    }).then(null, function () { failStreak++; return false; }).then(function (ok) {
      inflightPos = null; setNote();
      return ok;
    });
    return inflightPos;
  }

  function loadVessels(initial) {
    if (inflightVes) return inflightVes;
    var started = Date.now();
    var from = initial || !vesAt ? started - VES_WINDOW_MS : vesAt - OVERLAP_MS;
    inflightVes = getJson('/vessels?from=' + Math.round(from), 60000).then(function (arr) {
      if (!Array.isArray(arr)) throw new Error('virheellinen vastaus');
      arr.forEach(function (v) {
        if (!v || v.mmsi == null) return;
        ves[v.mmsi] = normVessel(v);
        delete noVes[v.mmsi];
      });
      vesAt = started; vesLoaded = true;
      return true;
    }).then(null, function () { return false; }).then(function (ok) { inflightVes = null; return ok; });
    return inflightVes;
  }

  // Yksittäisen aluksen tiedot haetaan vasta, kun alus avataan tai sen nimeä tarvitaan. Samanaikaisia kutsuja on enintään kolme.
  function needVessel(k) {
    if (ves[k]) return Promise.resolve(ves[k]);
    if (noVes[k]) return Promise.resolve(null);
    if (singleFail[k] && Date.now() - singleFail[k] < 120000) return Promise.resolve(null);
    if (singleWait[k]) return singleWait[k];
    if (singleQ.length >= 40) return Promise.resolve(null);
    singleWait[k] = new Promise(function (resolve) { singleQ.push({ k: k, resolve: resolve }); });
    pumpSingles();
    return singleWait[k];
  }
  function pumpSingles() {
    while (singleBusy < 3 && singleQ.length) {
      (function (job) {
        singleBusy++;
        getJson('/vessels/' + encodeURIComponent(job.k), 15000).then(function (v) {
          if (Array.isArray(v)) v = v[0];
          if (v && typeof v === 'object') { ves[job.k] = normVessel(v); job.resolve(ves[job.k]); }
          else { singleFail[job.k] = Date.now(); job.resolve(null); }
        }, function (e) {
          if (e && e.status === 404) noVes[job.k] = true; else singleFail[job.k] = Date.now();
          job.resolve(null);
        }).then(function () { singleBusy--; delete singleWait[job.k]; pumpSingles(); });
      })(singleQ.shift());
    }
  }

  // ---------- ajastus ----------
  function tick() {
    if (!running || busy) return;
    busy = true;
    var full = !lastFullAt || Date.now() - lastFullAt >= POS_FULL_MS;
    var jobs = [loadPositions(full)];
    if (!vesLoaded || Date.now() - vesAt >= VES_MS) jobs.push(loadVessels(!vesLoaded));
    Promise.all(jobs).then(function () { busy = false; render(); }, function () { busy = false; });
  }
  // Haku käy vain, kun kerros on päällä ja sivu näkyvissä. Sivun tullessa näkyviin haetaan heti.
  function sync() {
    if (!map) return;
    var on = enabled(), want = on && visible();
    if (want && !running) { running = true; tick(); timer = setInterval(tick, POS_MS); }
    else if (!want && running) { running = false; clearInterval(timer); timer = null; }
    if (on !== attrOn) {
      attrOn = on;
      if (on) map.attributionControl.addAttribution(ATTR); else map.attributionControl.removeAttribution(ATTR);
    }
    setNote();
    if (on) render(); else clearAll();
  }

  // ---------- piirto ----------
  function kindOf(p, v) {
    var t = v ? v.shipType : null, sog = p.sog;
    var moving = sog != null && sog >= MOVING_KN;
    // laiturissa tai ankkurissa olevan aluksen GPS-kohina ei tee siitä liikkuvaa
    if (moving && (p.navStat === 1 || p.navStat === 5) && sog < 2) moving = false;
    var dir = p.heading != null ? p.heading : p.cog;
    // rungon suunta: liikkuvalla keulasuunta tai sen puuttuessa kulku, paikallaan olevalla vain keulasuunta, koska levossa olevan aluksen kulku on kohinaa
    var hdir = moving ? dir : p.heading;
    return { rescue: t === 51, moving: moving, color: typeColor(t), dir: dir, hdir: hdir, arrow: moving && dir != null, vdir: p.cog != null ? p.cog : p.heading };
  }

  // Merkki: liikkuva alus on keulasuuntaan kierretty nuolenkärki, muut ympyrä. Pelastusalus on suurempi ja sen reuna paksumpi.
  function arrowSvg(kind) {
    var c = kind.color, w = kind.rescue ? 17 : 14, ht = kind.rescue ? 27 : 22, sw = kind.rescue ? 1.7 : 1;
    return '<svg class="ais-s" width="' + w + '" height="' + ht + '" viewBox="0 0 14 22" style="transform:rotate(' + Math.round(kind.dir) + 'deg)" aria-hidden="true">' +
      '<path d="M7 1.2L12.6 20.2L7 16.4L1.4 20.2Z" fill="' + c + '" stroke="' + EDGE + '" stroke-width="' + sw + '" stroke-linejoin="round"/></svg>';
  }
  function circleSvg(kind, d) {
    var s2 = kind.rescue ? 2.2 : 1;
    return '<svg class="ais-s" width="' + d + '" height="' + d + '" viewBox="0 0 ' + d + ' ' + d + '" aria-hidden="true">' +
      '<circle cx="' + d / 2 + '" cy="' + d / 2 + '" r="' + (d / 2 - s2 / 2) + '" fill="' + kind.color + '" stroke="' + EDGE + '" stroke-width="' + s2 + '"/></svg>';
  }

  // Rungon ääriviiva todellisessa mittakaavassa. AIS-sijainti on antennin vertailupiste: A metriä keulaan, B perään,
  // C paapuuriin (vasemmalle) ja D styyrpuuriin (oikealle). Runko on suora ja keula kapenee kärkeen, perä on suora.
  // Aluksen omassa koordinaatistossa u osoittaa keulaan ja v styyrpuuriin, ja ne käännetään keulasuunnan mukaan kartan pikseleiksi.
  function hullPoints(v, dir, mpp) {
    var rad = dir * Math.PI / 180, fx = Math.sin(rad), fy = -Math.cos(rad), sx = Math.cos(rad), sy = Math.sin(rad);
    var bow = (v.a + v.b) * HULL_BOW, tip = (v.d - v.c) / 2;
    return [[-v.b, -v.c], [-v.b, v.d], [v.a - bow, v.d], [v.a, tip], [v.a - bow, -v.c]].map(function (q) {
      return [(q[0] * fx + q[1] * sx) / mpp, (q[0] * fy + q[1] * sy) / mpp];
    });
  }
  function r1(x) { return Math.round(x * 10) / 10; }

  // Valitsee aluksen piirtotavan: runko, nuoli vai ympyrä. mpp on metrejä pikseliä kohden aluksen leveysasteella.
  function shapeOf(c, mpp, hit) {
    var k = c.kind, v = c.v, len = v ? v.a + v.b : 0, wid = v ? v.c + v.d : 0;
    if (k.hdir != null && len > 0 && wid > 0 && len / mpp >= HULL_MIN_PX) {
      var pts = hullPoints(v, k.hdir, mpp), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      var sw = k.rescue ? 2 : 1;
      var hw = Math.max(6, hit - wid / mpp);        // läpinäkyvä napautusalue levittää kapean rungon sormelle sopivaksi
      var pad = Math.ceil(hw / 2 + sw) + 1;
      var str = pts.map(function (q) { return r1(q[0] - x0 + pad) + ',' + r1(q[1] - y0 + pad); }).join(' ');
      var w = r1(x1 - x0 + 2 * pad), h = r1(y1 - y0 + 2 * pad);
      return {
        shape: 'runko', box: { x0: x0, y0: y0, x1: Math.max(x1, 3), y1: y1 }, popupY: Math.round(Math.min(y0, -hit / 2)) + 2, lenPx: len / mpp,
        svg: '<svg class="ais-s ais-hull-s" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="left:' + r1(hit / 2 + x0 - pad) + 'px;top:' + r1(hit / 2 + y0 - pad) + 'px" aria-hidden="true">' +
          '<polygon class="ais-hit" points="' + str + '" fill="none" stroke="transparent" stroke-width="' + r1(hw) + '" stroke-linejoin="round"/>' +
          '<polygon class="ais-hull" points="' + str + '" fill="' + k.color + '" stroke="' + EDGE + '" stroke-width="' + sw + '" stroke-linejoin="round"/></svg>'
      };
    }
    if (k.arrow) {
      var ah = k.rescue ? 27 : 22;
      var aw = k.rescue ? 17 : 14;
      return { shape: 'nuoli', box: { x0: -aw / 2, y0: -ah / 2, x1: aw / 2, y1: ah / 2 }, popupY: -Math.round(hit / 2) + 2, svg: arrowSvg(k) };
    }
    // ilman suuntaa aluksen ympyrä kasvaa tarkemmilla tasoilla aluksen pituuden mukaiseksi, jotta laiturissa oleva alus erottuu
    var d = k.rescue ? 15 : 10;
    if (k.hdir == null && len > 0) d = Math.round(Math.min(CIRCLE_MAX, Math.max(d, len / mpp)));
    return { shape: 'ympyra', box: { x0: -d / 2, y0: -d / 2, x1: d / 2, y1: d / 2 }, popupY: -Math.round(hit / 2) + 2, svg: circleSvg(k, d) };
  }

  // Merkin ympärillä on läpinäkyvä napautusalue, jotta pieni ympyrä on helppo osua myös sormella.
  // Rungolla napautuksen ottaa vastaan vain rungon oma muoto ja sen ympärillä oleva läpinäkyvä reunus (ks. css), jottei vierekkäisten alusten napautusalueet peitä toisiaan.
  function build(c, label, hit) {
    var k = c.kind, s = c.shape, b = s.box, h2 = hit / 2, lab = '';
    if (label) {
      // nimi oikealla rungon vieressä, ja ahtaassa paikassa rungon ylä-, ala- tai vasemmalla puolella
      var pos = label.pos, st = pos === 'r' ? 'left:' + Math.round(h2 + b.x1 + 3) + 'px'
        : pos === 'l' ? 'left:' + Math.round(h2 + b.x0 - 3) + 'px'
        : 'left:' + Math.round(h2 + (b.x0 + b.x1) / 2) + 'px;top:' + Math.round(h2 + (pos === 't' ? b.y0 - 2 : b.y1 + 2)) + 'px';
      lab = '<span class="ais-n' + (pos === 'r' ? '' : ' ' + pos) + (k.rescue ? ' sar' : '') + '" style="' + st + '">' + UI.esc(label.name) + '</span>';
    }
    var html = '<div class="ais-w" data-mmsi="' + c.k + '" data-moving="' + (k.moving ? 1 : 0) + '" data-rescue="' + (k.rescue ? 1 : 0) +
      '" data-shape="' + s.shape + '"' + (s.shape === 'runko' ? ' data-len="' + Math.round(s.lenPx) + '" data-dir="' + Math.round(k.hdir) + '"' : '') +
      (c.dim ? ' style="opacity:' + DIM_OPACITY + '"' : '') + '>' + s.svg + lab + '</div>';
    return { html: html, size: hit, popupY: s.popupY, cls: s.shape === 'runko' ? 'ais-ico ais-hullico' : 'ais-ico', zio: c.k === pinned ? 2000 : k.rescue ? 1000 : k.moving ? 300 : 0 };
  }
  function mkIcon(b) {
    return L.divIcon({ className: b.cls, html: b.html, iconSize: [b.size, b.size], iconAnchor: [b.size / 2, b.size / 2], popupAnchor: [0, b.popupY] });
  }

  function clearAll() {
    if (layer) layer.clearLayers();
    drawn = {};
  }
  function removeShip(k) {
    var d = drawn[k];
    if (!d) return;
    layer.removeLayer(d.m);
    if (d.vec) layer.removeLayer(d.vec);
    delete drawn[k];
  }

  function renderSoon() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 40); }

  function render() {
    if (!map || !layer) return;
    var z = map.getZoom();
    if (!enabled() || z < MIN_Z) { clearAll(); return; }
    var now = Date.now(), view = map.getBounds().pad(0.1), ctr = map.getCenter();
    var cands = [];
    Object.keys(pos).forEach(function (k) {
      var p = pos[k], age = now - p.t;
      if (age > MAX_AGE_MS) return;
      if (k !== pinned && !view.contains([p.lat, p.lng])) return;
      var v = ves[k], kind = kindOf(p, v);
      var dl = p.lat - ctr.lat, dn = p.lng - ctr.lng;
      cands.push({ k: k, p: p, v: v, kind: kind, dim: age > DIM_MS, rank: k === pinned ? -1 : kind.rescue ? 0 : kind.moving ? 1 : 2, d2: dl * dl + dn * dn });
    });
    // enintään 400 alusta: pelastusalukset ja liikkuvat alukset ovat etusijalla
    cands.sort(function (a, b) { return a.rank - b.rank || a.d2 - b.d2; });
    if (cands.length > MAX_DRAWN) cands.length = MAX_DRAWN;

    var hit = UI.isTouch() ? 38 : 26;
    // metrejä pikseliä kohden aluksen leveysasteella (Web Mercator venyttää, joten mittakaava riippuu leveysasteesta)
    var mppAt = function (lat) { return 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z + 8); };
    cands.forEach(function (c) { c.shape = shapeOf(c, mppAt(c.p.lat), hit); });
    // nimet: etusijajärjestyksessä. Nimi sijoitetaan aluksen oikealle puolelle, ja jos se osuisi jo sijoitetun nimen tai toisen aluksen rungon päälle,
    // rungolle kokeillaan vielä ylä-, ala- ja vasenta puolta. Jos mikään paikka ei ole vapaa, nimi jätetään pois.
    var placed = [], labels = {}, wanted = 0;
    cands.forEach(function (c) {
      c.pt = map.latLngToContainerPoint([c.p.lat, c.p.lng]);
      var bx = c.shape.box;
      c.rect = { x0: c.pt.x + bx.x0, x1: c.pt.x + bx.x1, y0: c.pt.y + bx.y0, y1: c.pt.y + bx.y1 };
    });
    var overlaps = function (r, o) { return r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0; };
    var sz = map.getSize();
    var clash = function (r, self) {
      var i;
      // rungon nimi ei saa jäädä osittain näytön ulkopuolelle
      if (self.shape.shape === 'runko' && (r.x0 < 0 || r.x1 > sz.x || r.y0 < 0 || r.y1 > sz.y)) return true;
      for (i = 0; i < placed.length; i++) if (overlaps(r, placed[i])) return true;
      for (i = 0; i < cands.length; i++) {
        var o = cands[i];
        // merkin nimi saa osua toiseen pieneen merkkiin, kuten ennenkin, mutta rungon nimi väistää kaikkia aluksia ja muut nimet runkoja ja suurennettuja ympyröitä
        var obstacle = self.shape.shape === 'runko' || o.shape.shape === 'runko' || o.rect.x1 - o.rect.x0 >= 18;
        if (o !== self && obstacle && overlaps(r, o.rect)) return true;
      }
      return false;
    };
    cands.forEach(function (c) {
      if (!(z >= LABEL_Z || (c.kind.rescue && z >= LABEL_Z_SAR))) return;
      if (!c.v || !c.v.name) {
        if (wanted < 8 && !noVes[c.k]) { wanted++; needVessel(c.k).then(function (v) { if (v) renderSoon(); }); }
        return;
      }
      var pt = c.pt, bx = c.shape.box, w = c.v.name.length * 7.2 + 4, cx = pt.x + (bx.x0 + bx.x1) / 2;
      var opts = [{ pos: 'r', x0: pt.x + bx.x1 + 3, y0: pt.y - 8 }];
      if (c.shape.shape === 'runko') {
        opts.push({ pos: 't', x0: cx - w / 2, y0: pt.y + bx.y0 - 18 }, { pos: 'b', x0: cx - w / 2, y0: pt.y + bx.y1 + 2 }, { pos: 'l', x0: pt.x + bx.x0 - 3 - w, y0: pt.y - 8 });
      }
      for (var i = 0; i < opts.length; i++) {
        var r = { x0: opts[i].x0, x1: opts[i].x0 + w, y0: opts[i].y0, y1: opts[i].y0 + 16 };
        if (clash(r, c)) continue;
        placed.push(r);
        labels[c.k] = { name: c.v.name, pos: opts[i].pos };
        return;
      }
    });

    var mpp = mppAt(ctr.lat);
    var seen = {};
    cands.forEach(function (c) {
      var k = c.k, b = build(c, labels[k], hit), d = drawn[k], ll = [c.p.lat, c.p.lng];
      seen[k] = true;
      if (!d) {
        d = drawn[k] = { m: L.marker(ll, { icon: mkIcon(b), pane: 'aisPane', keyboard: false, zIndexOffset: b.zio }), html: b.html, size: b.size, zio: b.zio, lat: c.p.lat, lng: c.p.lng, vec: null, vk: '' };
        bindCard(d.m, k);
        d.m.addTo(layer);
      } else {
        if (d.html !== b.html || d.size !== b.size) { d.m.setIcon(mkIcon(b)); d.html = b.html; d.size = b.size; }
        if (d.zio !== b.zio) { d.m.setZIndexOffset(b.zio); d.zio = b.zio; }
        if (d.lat !== c.p.lat || d.lng !== c.p.lng) { d.m.setLatLng(ll); d.lat = c.p.lat; d.lng = c.p.lng; }
      }
      // ECDISin tapainen nopeusvektori: kuuden minuutin matka kulkusuuntaan, aluksen värillä
      var dist = c.kind.moving && c.kind.vdir != null ? c.p.sog * VECTOR_MIN * G.NM : 0;
      if (dist / mpp >= 4) {
        var end = G.destination({ lat: c.p.lat, lng: c.p.lng }, c.kind.vdir, dist);
        var vk = [c.p.lat, c.p.lng, end.lat.toFixed(6), end.lng.toFixed(6), c.kind.color, c.dim ? 1 : 0, c.kind.rescue ? 1 : 0].join(',');
        if (!d.vec) {
          d.vec = L.polyline([ll, [end.lat, end.lng]], { pane: 'aisPane', interactive: false, className: 'ais-vec', color: c.kind.color, weight: c.kind.rescue ? 2 : 1.5, opacity: c.dim ? DIM_OPACITY : 0.9, lineCap: 'butt' }).addTo(layer);
          d.vk = vk;
        } else if (d.vk !== vk) {
          d.vec.setLatLngs([ll, [end.lat, end.lng]]);
          d.vec.setStyle({ color: c.kind.color, weight: c.kind.rescue ? 2 : 1.5, opacity: c.dim ? DIM_OPACITY : 0.9 });
          d.vk = vk;
        }
      } else if (d.vec) { layer.removeLayer(d.vec); d.vec = null; d.vk = ''; }
    });
    Object.keys(drawn).forEach(function (k) { if (!seen[k]) removeShip(k); });
    refreshPopup();
  }

  // ---------- aluksen kortti ----------
  function row(label, val) { return val == null || val === '' ? '' : '<tr><th>' + label + '</th><td>' + UI.esc(val) + '</td></tr>'; }
  function card(k) {
    var p = pos[k];
    if (!p) return '<div class="pop ais-pop"><b>Alus</b><div class="muted">Aluksen sijaintia ei enää ole tiedossa.</div></div>';
    var v = ves[k], len = v ? v.a + v.b : 0, wid = v ? v.c + v.d : 0;
    var size = len && wid ? len + ' × ' + wid + ' m' : len ? len + ' m' : wid ? wid + ' m' : '';
    var sizeLabel = len && wid ? 'Pituus × leveys' : len ? 'Pituus' : 'Leveys';
    var sub = v ? cap(typeName(v.shipType)) : (noVes[k] || singleFail[k] ? 'Alustietoja ei ole saatavilla' : 'Alustietoja haetaan…');
    var rows = row('MMSI', k) + (v ? row('IMO', v.imo || '') + row('Kutsutunnus', v.callSign) : '') +
      row('Tila', p.navStat != null ? navName(p.navStat) : '') +
      row('Nopeus', p.sog != null ? G.fmtNum(p.sog, 1) + ' kn' : '') +
      row('Kulku', p.cog != null ? G.fmtBrg(p.cog, 0) : '') +
      row('Keula', p.heading != null ? G.fmtBrg(p.heading, 0) : '') +
      (v ? row('Määränpää', v.destination) + row('ETA', fmtEta(v.eta)) + row('Syväys', v.draught ? G.fmtNum(v.draught / 10, 1) + ' m' : '') + row(sizeLabel, size) : '') +
      row('Sijainti', G.fmtPos(p)) + row('Sijainnin ikä', fmtAge(Date.now() - p.t));
    return '<div class="pop ais-pop"><b class="ais-t">' + UI.esc(v && v.name ? v.name : 'Alus ' + k) + '</b><div class="ais-sub">' + UI.esc(sub) + '</div>' +
      '<div class="ais-rows"><table>' + rows + '</table></div>' +
      '<button type="button" class="ais-task" data-mmsi="' + UI.esc(k) + '">Uusi tehtävä aluksen kohdalle</button>' +
      '<div class="pop-src">AIS: Fintraffic / Digitraffic, CC BY 4.0. Tieto on viiveellistä, eikä se sovellu navigointiin.</div></div>';
  }
  // Avoimen kortin sisältö päivitetään paikallaan, jottei painike vaihdu kesken napautuksen eikä kartta hypähdä.
  function refreshPopup() {
    var d = openMmsi && drawn[openMmsi];
    if (!d || !d.m.isPopupOpen()) return;
    var el = d.m.getPopup().getElement();
    if (!el) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = card(openMmsi);
    ['.ais-t', '.ais-sub', '.ais-rows'].forEach(function (sel) {
      var a = el.querySelector(sel), b = tmp.querySelector(sel);
      if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
    });
  }
  function newTask(k) {
    var p = pos[k];
    if (!p) return;
    map.closePopup();
    global.Tools.editTask(null, { lat: p.lat, lng: p.lng });
  }
  function onCardClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('.ais-task') : null;
    if (b) newTask(b.getAttribute('data-mmsi'));
  }
  function bindCard(m, k) {
    m.bindPopup(function () { return card(k); }, {
      className: 'ais-popup', minWidth: 230, maxWidth: 280, autoPanPaddingTopLeft: [72, 70], autoPanPaddingBottomRight: [16, 56]
    });
    m.on('popupopen', function (e) {
      openMmsi = k; pinned = k;
      var el = e.popup.getElement();
      if (el && !el._aisBound) { el._aisBound = true; el.addEventListener('click', onCardClick); }
      if (!ves[k] && !noVes[k]) needVessel(k).then(function () { if (openMmsi === k) { refreshPopup(); renderSoon(); } });
    });
    m.on('popupclose', function () { if (openMmsi === k) { openMmsi = null; pinned = null; } });
  }

  // Avaa aluksen kortin. Kerros kytketään tarvittaessa päälle. Kortti avataan hetken kuluttua, kun kartan siirtymä on päättynyt.
  function open(mmsi) {
    mmsi = String(mmsi);
    var sh = S.state.settings.show;
    if (sh.ais === false) { sh.ais = true; S.save(); }
    pinned = mmsi; pendingOpen = mmsi;
    sync();
    clearTimeout(openTimer);
    openTimer = setTimeout(function () {
      var k = pendingOpen; pendingOpen = null;
      if (!k) return;
      render();
      if (drawn[k]) drawn[k].m.openPopup(); else if (pinned === k) pinned = null;
    }, 350);
  }

  // ---------- haku ----------
  // Haku toimii myös silloin, kun kerros on pois päältä: tieto haetaan kerran ja jaetaan samanaikaisten hakujen kesken.
  function ensureData() {
    var jobs = [];
    if (!posOkAt || Date.now() - posOkAt > FRESH_MS) jobs.push(loadPositions(true));
    if (!vesLoaded) jobs.push(loadVessels(true));
    return Promise.all(jobs);
  }
  function within(ms, promise, fallback) {
    return new Promise(function (resolve) {
      var done = false, to = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      var fin = function (v) { if (!done) { done = true; clearTimeout(to); resolve(v); } };
      promise.then(fin, function () { fin(fallback); });
    });
  }
  function shipInfo(p, v) {
    var t = v ? v.shipType : null;
    return 'AIS-alus' + (t != null && typeName(t) !== 'tuntematon' ? ', ' + typeName(t) : '') +
      (p.sog != null ? (p.sog >= MOVING_KN ? ', ' + G.fmtNum(p.sog, 1) + ' kn' : ', paikallaan') : '');
  }
  // Palauttaa lupauksen lähimmistä (enintään 10) hakua vastaavista aluksista. Mukaan otetaan vain ajantasaisen sijainnin alukset.
  function search(q, at) {
    q = String(q || '').trim();
    if (q.length < 2) return Promise.resolve([]);
    var nq = fold(q), nsp = nq.replace(/\s+/g, ''), digits = /^\d{3,}$/.test(q) ? q : null;
    var from = at || map.getCenter();
    return within(8000, ensureData().then(function () {
      var now = Date.now(), hits = [];
      Object.keys(pos).forEach(function (k) {
        var p = pos[k];
        if (now - p.t > MAX_AGE_MS) return;
        var v = ves[k];
        var hit = (v && v.nameKey && v.nameKey.indexOf(nq) >= 0) ||
          (v && v.callKey && v.callKey.indexOf(nsp) === 0) ||
          (digits && k.indexOf(digits) === 0);
        if (hit) hits.push({ k: k, d: G.distance(from, p) });
      });
      hits.sort(function (a, b) { return a.d - b.d; });
      hits = hits.slice(0, 10);
      // MMSI-numerolla löytyneen aluksen nimi haetaan erikseen, jos sitä ei ole bulkkiaineistossa
      return Promise.all(hits.map(function (h) { return needVessel(h.k); })).then(function () {
        return hits.map(function (h) {
          var p = pos[h.k], v = ves[h.k];
          return { name: v && v.name ? v.name : 'MMSI ' + h.k, info: shipInfo(p, v), lat: p.lat, lng: p.lng, ais: true, mmsi: h.k };
        });
      });
    }), []);
  }
  // Selitys, jos haku ei saanut tietoa Digitrafficista
  function searchNote() { return failStreak > 0 && (!posOkAt || Date.now() - posOkAt > FRESH_MS) ? 'AIS-tietoa ei saatu Digitrafficista, joten alukset eivät ole mukana hakutuloksissa.' : ''; }

  // ---------- käynnistys ----------
  function init(m) {
    map = m;
    map.createPane('aisPane');
    map.getPane('aisPane').style.zIndex = PANE_Z;
    layer = L.layerGroup().addTo(map);
    var notes = map.getContainer().querySelector('.map-notes');
    if (notes) {
      noteEl = L.DomUtil.create('div', 'enc-note ais-note', notes);
      noteEl.textContent = 'AIS-tietoa ei saatu. Kartan alukset voivat olla vanhentuneita.';
      noteEl.hidden = true;
    }
    map.on('moveend zoomend', renderSoon);
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  global.Ais = {
    init: init, sync: sync, search: search, searchNote: searchNote, open: open,
    typeName: typeName, MIN_ZOOM: MIN_Z,
    get running() { return running; },
    get count() { return Object.keys(pos).length; },
    get drawnCount() { return Object.keys(drawn).length; }
  };
})(window);
