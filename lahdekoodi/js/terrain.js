/* Reittikartta – Maasto-tasot (Näsijärven aineistopaketti) sekä osoite- ja kiinteistötunnushaku.
 *
 * Aineisto luetaan erillisestä paketista (asetus terrainUrl, oletuksena GitHub Pages):
 *   aineisto.json     paketin kuvaus: alue, lähteet, lähdemerkinnät
 *   nasijarvi.pmtiles vektoritiilet (MVT): rakennus, osoite, kiinteistoraja, kiinteistotunnus, maastokuvio, tie
 *   maasto.pmtiles    Terrain-RGB-korkeustiilet, joista varjostus lasketaan selaimessa
 *   osoitteet.json    osoitehakemisto (ladataan kerran, kun haetaan osoitetta)
 *   kiinteistot.json  kiinteistötunnushakemisto (ladataan kerran, kun haetaan tunnusta)
 * PMTiles-tiedostoja luetaan HTTP Range -pyynnöillä, joten vain näkyvän alueen tiilet siirtyvät.
 *
 * Kaikki tasot ovat oletuksena pois päältä. Alueen ulkopuolella tasot poistetaan kartalta eikä
 * paketin tiiliä pyydetä. Ilman verkkoyhteyttä tasot jäävät tyhjiksi ilman virheilmoitusta.
 *
 * Piirtojärjestys (alhaalta ylös, kaikki maapohjan ja merikartan päällä mutta reittien alla):
 * maastotyyppi, varjostus, kiinteistörajat, tiet, rakennukset, osoitteet. Maastotyyppi on omalla
 * tasollaan varjostuksen alla, muut vektorikohteet yhdellä tasolla, ja kumpikin käyttää samaa
 * tiilivarastoa (yksi lataus ja purku tiiltä kohden). */
(function (global) {
  'use strict';

  var G = global.Geo, S = global.Store, UI = global.UI;
  var DEFAULT_URL = 'https://jvaahtikari.github.io/reittikartta-aineisto/';
  var FILE_VEC = 'nasijarvi.pmtiles', FILE_DEM = 'maasto.pmtiles';
  // Paketin kattama alue (lon0, lat0, lon1, lat1), jos aineisto.json ei ole (vielä) luettavissa
  var FALLBACK_AREA = [23.49384, 61.47597, 24.1053, 62.02149];
  var KEYS = ['terrainCover', 'terrainRelief', 'terrainParcels', 'terrainRoads', 'terrainBuildings', 'terrainAddresses'];
  var NAMES = {
    terrainCover: 'Maastotyyppi', terrainRelief: 'Varjostus', terrainParcels: 'Kiinteistörajat',
    terrainRoads: 'Tiet', terrainBuildings: 'Rakennukset', terrainAddresses: 'Osoitteet'
  };
  // pienin kartan zoom, jolta taso näkyy (vektoritiilen data on kartan zoomia yhden pienemmällä tasolla)
  var MIN_Z = { terrainCover: 10, terrainRelief: 10, terrainParcels: 16, terrainRoads: 12, terrainBuildings: 15, terrainAddresses: 16 };
  var TEXT_Z = 17;               // osoitteet tekstinä
  var ROAD_NAME_Z = 15;          // tien nimet
  var MAX_DATA_Z = 16;           // vektoritiilten suurin data-taso
  var DEM_MAX_Z = 14;            // korkeustiilten suurin taso (sitä suuremmilla käytetään suurennettua tason 14 tiiltä)
  var TAP_PARCEL_M = 30;         // kiinteistötunnus napautuksella: lähin tunnuspiste tämän säteellä
  var BUILDING_TOL_M = 3;        // rakennus napautuksella: myös reunan lähellä oleva napautus kelpaa
  var RETRY_MS = 30000;          // epäonnistuneen latauksen uusinta ei useammin kuin näin usein
  var NOTE_TEXT = 'Maastoaineisto kattaa vain Näsijärven';

  var map = null, noteEl = null, attrText = '';
  var meta = null, metaP = null, metaUrl = '', metaFailAt = 0;
  var vec = null, cover = null, relief = null, layerUrl = '', ruleSig = null;
  var dirs = {};                 // ladatut hakemistot: { osoitteet: {url, p, data, failAt}, kiinteistot: ... }
  var clickTimer = null;
  var stats = { ok: 0, fail: 0, metaLoads: 0, dirLoads: 0 };
  var perf = { vec: [], cover: [], relief: [], shade: [] };
  var reliefCache = {}, reliefOrder = [], reliefPm = null;

  function esc(s) { return UI.esc(String(s == null ? '' : s)); }
  function settings() { return S.state.settings; }
  function baseUrl() {
    var u = String(settings().terrainUrl || '').trim() || DEFAULT_URL;
    u = u.replace(/aineisto\.json$/i, '');
    return u.charAt(u.length - 1) === '/' ? u : u + '/';
  }
  function isOn(key) { return !!(settings().show && settings().show[key]); }
  function anyOn() { return KEYS.some(isOn); }
  function rec(list, ms) { list.push(ms); if (list.length > 600) list.shift(); }
  function muni(code) {
    var c = String(code || '').padStart(3, '0');
    return (global.ChartAPI && global.ChartAPI.muniName && global.ChartAPI.muniName(c)) || ('kunta ' + c);
  }

  // ---------- aineistokuvaus ja alue ----------
  function loadMeta() {
    var url = baseUrl();
    if (metaP && metaUrl === url) return metaP;
    if (metaUrl === url && metaFailAt && Date.now() - metaFailAt < RETRY_MS) return Promise.resolve(null);
    metaUrl = url; meta = null; stats.metaLoads++;
    var mine = metaP = fetch(url + 'aineisto.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (metaP !== mine) return null;
      meta = j; metaFailAt = 0;
      sync();
      return j;
    }, function () {
      if (metaP === mine) { metaP = null; metaFailAt = Date.now(); }
      return null;       // ei virheilmoitusta: tasot toimivat varatiedoilla tai jäävät tyhjiksi
    });
    return mine;
  }
  function areaBounds() {
    var b = (meta && meta.alue && meta.alue.bbox_wgs84) || FALLBACK_AREA;
    return L.latLngBounds([b[1], b[0]], [b[3], b[2]]);
  }
  function inArea() { return areaBounds().intersects(map.getBounds()); }

  // lähdemerkintä kartan attribuutioon: vain näkyvien tasojen lähteet aineisto.json-tiedoston lahteet-kentästä
  function attribution() {
    var ids = [];
    function add(id) { if (ids.indexOf(id) < 0) ids.push(id); }
    if (isOn('terrainCover') || isOn('terrainRoads') || isOn('terrainBuildings')) add('mml_maastotietokanta');
    if (isOn('terrainParcels')) add('mml_kiinteisto');
    if (isOn('terrainRelief')) add('mml_korkeusmalli');
    if (isOn('terrainAddresses')) add('dvv_osoitteet');
    var parts = [];
    if (meta && meta.lahteet) {
      ids.forEach(function (id) {
        meta.lahteet.forEach(function (l) { if (l.id === id && l.lahdemerkinta) parts.push(l.lahdemerkinta); });
      });
    }
    if (!parts.length && meta && meta.lahdemerkinta_yhteensa) parts.push(meta.lahdemerkinta_yhteensa);
    if (!parts.length) parts.push('Maasto: Maanmittauslaitos ja Digi- ja väestötietovirasto (CC BY 4.0).');
    return esc(parts.join(' '));
  }
  function setAttribution(visible) {
    if (!map) return;
    var next = visible ? attribution() : '';
    if (next === attrText) return;
    if (attrText) map.attributionControl.removeAttribution(attrText);
    attrText = next;
    if (attrText) map.attributionControl.addAttribution(attrText);
  }
  function setNote(show) {
    if (noteEl) noteEl.hidden = !show;
  }

  // ---------- PMTiles-lähde ----------
  // Verkkovirhe ei saa tulla konsoliin protomaps-leafletin virheilmoituksena, eikä tyhjää tiiltä saa jäädä
  // välimuistiin: virhe muutetaan AbortErroriksi, jonka kirjasto ohittaa hiljaa ja jonka tiili haetaan myöhemmin uudelleen.
  // PMTiles-kirjasto jättää epäonnistuneen otsikkohaun välimuistiinsa, joten virheen jälkeen (RETRY_TILE_MS kuluttua)
  // luodaan uusi PMTiles-olio. Kun verkko palaa, jo piirretyt tyhjät tiilet piirretään uudelleen.
  var RETRY_TILE_MS = 5000;
  function pmSource(url) {
    var PM = global.pmtiles, pm = new PM.PMTiles(url), failAt = 0;
    return {
      getZxy: function (z, x, y, signal) {
        if (failAt && Date.now() - failAt > RETRY_TILE_MS) pm = new PM.PMTiles(url);
        var cur = pm;
        return cur.getZxy(z, x, y, signal).then(function (r) {
          stats.ok++;
          if (failAt && cur === pm) {
            failAt = 0;
            setTimeout(function () { [vec, cover, relief].forEach(function (l) { if (l && map.hasLayer(l)) l.redraw(); }); }, 0);
          }
          return r;
        }, function (e) {
          if (e && e.name === 'AbortError') throw e;
          stats.fail++;
          if (!failAt) failAt = Date.now();
          var a = new Error('maastoaineisto ei saatavilla'); a.name = 'AbortError'; throw a;
        });
      }
    };
  }

  // ---------- tyylit ----------
  function cls(name) { return function (z, f) { return f.props.luokka === name; }; }
  function clsIn(list) { return function (z, f) { return list.indexOf(f.props.luokka) >= 0; }; }
  var ROAD_BIG = [12111, 12112, 12121, 12122], ROAD_MID = [12131, 12132], ROAD_SMALL = [12141];
  var ROAD_PATH = [12311, 12312, 12313, 12314, 12315, 12316], RAIL = [14111, 14112, 14121, 14131];
  function roadOther(z, f) {
    var c = f.props.luokka;
    return c >= 12000 && c < 13000 && ROAD_BIG.concat(ROAD_MID, ROAD_SMALL, ROAD_PATH).indexOf(c) < 0;
  }
  function w(small, mid, big) { return function (z) { return z < 13 ? small : z < 15 ? mid : big; }; }

  // Maastotyypin värit: läpikuultavia, jotta maapohja näkyy läpi. Vesialueet jätetään pois (merikartta piirtää ne).
  function coverRules(P) {
    function poly(luokka, fill, op) { return { dataLayer: 'maastokuvio', filter: luokka, symbolizer: new P.PolygonSymbolizer({ fill: fill, opacity: op }) }; }
    return [
      poly(cls('pelto'), '#f0dd6a', 0.5),
      poly(cls('niitty'), '#d3e59b', 0.4),
      poly(cls('puutarha'), '#cfe5a8', 0.45),
      poly(cls('suo'), '#a697bb', 0.5),
      poly(cls('soistuma'), '#bcb1ca', 0.4),
      poly(cls('kallio'), '#cdcac4', 0.65),
      poly(cls('kivikko'), '#bdb8af', 0.55),
      poly(cls('hietikko'), '#f2dfa3', 0.65),
      poly(cls('avoin_alue'), '#e8e3c6', 0.3),
      poly(clsIn(['puisto', 'urheilu_virkistys', 'hautausmaa']), '#98d085', 0.5),
      poly(clsIn(['autoliikenne', 'varastoalue', 'louhos', 'maa_aines', 'kaatopaikka', 'taytemaa', 'lentokentta']), '#cbc6bf', 0.55),
      poly(cls('taajama'), '#efb4c0', 0.3)
    ];
  }

  // Osoitteen teksti pisteen vieressä (oikealla ja hieman alapuolella), kuten rakennuksen viereen kirjoitettu numero
  function addressLabel(P) {
    return {
      place: function (layout, geom, feature) {
        var t = feature.props.osoite;
        if (!t) return undefined;
        var ctx = layout.scratch;
        ctx.font = '600 11px sans-serif';
        var wd = ctx.measureText(t).width;
        var a = { x: geom[0][0].x + 5, y: geom[0][0].y + 4 };
        return [{
          anchor: a,
          bboxes: [{ minX: a.x - 1, minY: a.y - 10, maxX: a.x + wd + 1, maxY: a.y + 3 }],
          draw: function (c) {
            c.font = '600 11px sans-serif';
            c.lineWidth = 3; c.lineJoin = 'round';
            c.strokeStyle = 'rgba(255,255,255,0.92)'; c.strokeText(t, 0, 0);
            c.fillStyle = '#0b4a6f'; c.fillText(t, 0, 0);
          }
        }];
      }
    };
  }

  // Vektoritason säännöt valittujen tasojen mukaan. Järjestys on piirtojärjestys.
  function vecRules(P) {
    var paint = [], label = [], minZ = 99;
    function use(key) { minZ = Math.min(minZ, MIN_Z[key]); }
    if (isOn('terrainParcels')) {
      use('terrainParcels');
      paint.push({ dataLayer: 'kiinteistoraja', minzoom: MIN_Z.terrainParcels, symbolizer: new P.LineSymbolizer({ color: '#a0489e', width: 0.8, opacity: 0.8, dash: [4, 3] }) });
    }
    if (isOn('terrainRoads')) {
      use('terrainRoads');
      var rz = MIN_Z.terrainRoads;
      paint.push(
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_BIG), symbolizer: new P.LineSymbolizer({ color: '#9c5a1a', width: w(3, 5.5, 8) }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_MID), symbolizer: new P.LineSymbolizer({ color: '#9a8f7f', width: w(2.2, 4, 6) }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_SMALL), symbolizer: new P.LineSymbolizer({ color: '#aaa397', width: w(1.6, 3, 4.6) }) },
        { dataLayer: 'tie', minzoom: rz, filter: roadOther, symbolizer: new P.LineSymbolizer({ color: '#aaa397', width: w(1.4, 2.6, 4) }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_BIG), symbolizer: new P.LineSymbolizer({ color: '#ffbd5a', width: w(1.6, 3.4, 5.4) }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_MID), symbolizer: new P.LineSymbolizer({ color: '#fff3c4', width: w(1.1, 2.4, 4) }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(ROAD_SMALL), symbolizer: new P.LineSymbolizer({ color: '#ffffff', width: w(0.8, 1.8, 3) }) },
        { dataLayer: 'tie', minzoom: rz, filter: roadOther, symbolizer: new P.LineSymbolizer({ color: '#ffffff', width: w(0.7, 1.4, 2.4) }) },
        { dataLayer: 'tie', minzoom: 13, filter: clsIn(ROAD_PATH), symbolizer: new P.LineSymbolizer({ color: '#7a5a3a', width: 1.1, dash: [3, 2] }) },
        { dataLayer: 'tie', minzoom: rz, filter: clsIn(RAIL), symbolizer: new P.LineSymbolizer({ color: '#555555', width: 1.6, dash: [6, 4] }) }
      );
      label.push({
        dataLayer: 'tie', minzoom: ROAD_NAME_Z, filter: function (z, f) { return !!f.props.nimi; },
        symbolizer: new P.LineLabelSymbolizer({ labelProps: ['nimi'], fill: '#333333', stroke: '#ffffff', width: 3, fontSize: 11, fontFamily: 'sans-serif' })
      });
    }
    if (isOn('terrainBuildings')) {
      use('terrainBuildings');
      paint.push({
        dataLayer: 'rakennus', minzoom: MIN_Z.terrainBuildings,
        symbolizer: new P.PolygonSymbolizer({
          fill: function (z, f) { return f.props.kaytto === 'asuinrakennus' ? '#b9a999' : '#b4b4b4'; },
          stroke: function (z, f) { return f.props.kaytto === 'asuinrakennus' ? '#7d6e5f' : '#6f6f6f'; },
          width: 0.6, opacity: 0.92
        })
      });
    }
    if (isOn('terrainAddresses')) {
      use('terrainAddresses');
      paint.push({ dataLayer: 'osoite', minzoom: MIN_Z.terrainAddresses, symbolizer: new P.CircleSymbolizer({ radius: 2.2, fill: '#0b6fa4', stroke: '#ffffff', width: 0.7 }) });
      label.push({ dataLayer: 'osoite', minzoom: TEXT_Z, symbolizer: addressLabel(P) });
    }
    return { paint: paint, label: label, minZ: minZ };
  }

  // ---------- varjostus (maasto.pmtiles, Terrain-RGB) ----------
  function decodePng(data) {
    var blob = new Blob([data], { type: 'image/png' });
    return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(function () { return createImageBitmap(blob); });
  }
  // Vinovalovarjostus luoteesta. Tulos on läpikuultava: varjot mustalla ja valoisat rinteet valkoisella, tasainen
  // maa (ja järven pinta) jää läpinäkyväksi, jotta maapohja ja maastotyyppi näkyvät varjostuksen alla.
  function hillshade(id, z, y) {
    var n = id.width, d = id.data, h = new Float32Array(n * n), i;
    for (i = 0; i < n * n; i++) {
      var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      h[i] = (r === 0 && g === 0 && b === 0) ? NaN : -10000 + (r * 65536 + g * 256 + b) * 0.1;
    }
    var latT = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / Math.pow(2, z))));
    var res = 156543.03392804097 / Math.pow(2, z) * 256 / n * Math.cos(latT);       // metriä pikseliä kohden
    var out = new ImageData(n, n), o = out.data;
    var lx = -0.5, ly = -0.5, lz = 0.7071, ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    lx /= ll; ly /= ll; lz /= ll;
    var flat = lz, exaggeration = 2.4;
    for (var yy = 0; yy < n; yy++) {
      for (var xx = 0; xx < n; xx++) {
        var k = yy * n + xx, e = h[k];
        if (e !== e) continue;
        var xl = h[yy * n + (xx > 0 ? xx - 1 : 0)], xr = h[yy * n + (xx < n - 1 ? xx + 1 : n - 1)];
        var yu = h[(yy > 0 ? yy - 1 : 0) * n + xx], yd = h[(yy < n - 1 ? yy + 1 : n - 1) * n + xx];
        if (xl !== xl) xl = e; if (xr !== xr) xr = e; if (yu !== yu) yu = e; if (yd !== yd) yd = e;
        var dzdx = (xr - xl) / (2 * res) * exaggeration, dzdy = (yd - yu) / (2 * res) * exaggeration;
        var nl = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        var ill = Math.max(0, (-dzdx * lx + dzdy * ly) / nl + lz / nl);
        var dl = ill - flat;
        if (dl < 0) { o[k * 4 + 3] = Math.min(150, -dl * 360); }
        else { o[k * 4] = o[k * 4 + 1] = o[k * 4 + 2] = 255; o[k * 4 + 3] = Math.min(80, dl * 240); }
      }
    }
    return out;
  }
  function shadedTile(z, x, y) {
    var key = z + '/' + x + '/' + y;
    if (reliefCache[key]) return reliefCache[key];
    var p = reliefPm.getZxy(z, x, y).then(function (r) {
      stats.ok++;
      if (!r) return null;
      return decodePng(r.data).then(function (bm) {
        var t0 = performance.now();
        var c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        var g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(bm, 0, 0);
        var vs = hillshade(g.getImageData(0, 0, bm.width, bm.height), z, y);
        g.putImageData(vs, 0, 0);
        if (bm.close) bm.close();
        rec(perf.shade, performance.now() - t0);
        return c;
      });
    }).catch(function () {
      stats.fail++;
      delete reliefCache[key];            // yritetään uudelleen, kun tiili pyydetään seuraavan kerran
      return null;
    });
    reliefCache[key] = p;
    reliefOrder.push(key);
    while (reliefOrder.length > 40) delete reliefCache[reliefOrder.shift()];
    return p;
  }

  // ---------- tasojen luonti ----------
  function tileOutside(layer, coords) {
    return !areaBounds().intersects(layer._tileCoordsToBounds(coords));
  }
  function blankTile(done) {
    var el = document.createElement('canvas');
    el.width = el.height = 1;
    L.Util.requestAnimFrame(function () { done(null, el); });
    return el;
  }
  // tiilen piirtoajan mittaus (kehittäjälle ja testeille)
  function timed(layer, list) {
    var orig = layer.renderTile;
    layer.renderTile = function (coords, el, key, done) {
      var t0 = performance.now();
      return orig.call(this, coords, el, key, function () { rec(list, performance.now() - t0); if (done) done(); });
    };
  }
  function pxRatio() { return Math.min(2, global.devicePixelRatio || 1); }

  function destroyLayers() {
    [vec, cover, relief].forEach(function (l) { if (l && map.hasLayer(l)) map.removeLayer(l); });
    vec = cover = relief = null; ruleSig = null; reliefCache = {}; reliefOrder = [];
  }
  function ensureLayers() {
    var url = baseUrl();
    if (vec && layerUrl === url) return true;
    var P = global.protomapsL, PM = global.pmtiles;
    if (!P || !PM) return false;
    if (vec) destroyLayers();
    layerUrl = url;
    var source = pmSource(url + FILE_VEC);
    var common = { tileSize: 256, maxZoom: 20, keepBuffer: 1, updateWhenZooming: false, attribution: '', devicePixelRatio: pxRatio(), tileDelay: 1 };
    function opts(pane, extra) { var o = L.extend({}, common, { pane: pane }); return L.extend(o, extra || {}); }
    vec = P.leafletLayer(opts('terrainVecPane', { url: source, paintRules: [], labelRules: [], maxDataZoom: MAX_DATA_Z }));
    cover = P.leafletLayer(opts('terrainCoverPane', { url: source, paintRules: coverRules(P), labelRules: [], maxDataZoom: MAX_DATA_Z }));
    cover.views = vec.views;                                // yhteinen tiilivarasto
    [vec, cover].forEach(function (l) {
      var orig = l.createTile;
      l.createTile = function (coords, done) { return tileOutside(this, coords) ? blankTile(done) : orig.call(this, coords, done); };
    });
    timed(vec, perf.vec); timed(cover, perf.cover);
    reliefPm = pmSource(url + FILE_DEM);
    var Relief = L.GridLayer.extend({
      options: { tileSize: 256, pane: 'terrainReliefPane', minZoom: MIN_Z.terrainRelief, maxZoom: 20, keepBuffer: 1, updateWhenZooming: false },
      createTile: function (c, done) {
        if (tileOutside(this, c) || c.z < MIN_Z.terrainRelief) return blankTile(done);
        var t0 = performance.now(), el = document.createElement('canvas');
        el.width = el.height = 256;
        var nz = Math.min(c.z, DEM_MAX_Z), dz = c.z - nz, nx = c.x >> dz, ny = c.y >> dz;
        shadedTile(nz, nx, ny).then(function (cv) {
          if (cv) {
            var g = el.getContext('2d'), part = cv.width >> dz;
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(cv, (c.x - (nx << dz)) * part, (c.y - (ny << dz)) * part, part, part, 0, 0, 256, 256);
          }
          rec(perf.relief, performance.now() - t0);
          done(null, el);
        });
        return el;
      }
    });
    relief = new Relief();
    return true;
  }
  // ---------- tilan täsmäytys ----------
  function sync() {
    if (!map) return;
    if (!anyOn()) {
      if (vec) [vec, cover, relief].forEach(function (l) { if (l && map.hasLayer(l)) map.removeLayer(l); });
      setNote(false); setAttribution(false);
      return;
    }
    loadMeta();
    var area = inArea(), z = map.getZoom();
    setNote(!area);
    if (!area) {
      if (vec) [vec, cover, relief].forEach(function (l) { if (l && map.hasLayer(l)) map.removeLayer(l); });
      setAttribution(false);
      return;
    }
    if (!ensureLayers()) return;
    var P = global.protomapsL;
    var rules = vecRules(P);
    var sig = KEYS.filter(isOn).join(',');
    if (sig !== ruleSig) {
      ruleSig = sig;
      vec.paintRules = rules.paint; vec.labelRules = rules.label;
      vec.clearLayout();
      if (map.hasLayer(vec)) vec.rerenderTiles();
    }
    function place(layer, want) {
      var has = map.hasLayer(layer);
      if (want && !has) layer.addTo(map);
      else if (!want && has) map.removeLayer(layer);
    }
    place(cover, isOn('terrainCover') && z >= MIN_Z.terrainCover);
    place(relief, isOn('terrainRelief') && z >= MIN_Z.terrainRelief);
    place(vec, rules.paint.length > 0 && z >= rules.minZ);
    setAttribution(true);
  }

  // Valikon valinta muuttui: päivitä ja kerro, jos taso ei vielä näy tällä zoomilla
  function changed(key, on) {
    sync();
    if (on && map && map.getZoom() < MIN_Z[key]) {
      UI.toast(NAMES[key] + ' näkyy zoomista ' + MIN_Z[key] + ' alkaen. Lähennä karttaa.');
    }
  }

  // ---------- napautus: rakennus, osoite, kiinteistötunnus, tie ----------
  function tileNum(lat, lng, z) {
    var n = Math.pow(2, z);
    return {
      x: (lng + 180) / 360 * n,
      y: (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
    };
  }
  function inRings(px, py, rings) {
    var inside = false;
    rings.forEach(function (ring) {
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var a = ring[i], b = ring[j];
        if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
    });
    return inside;
  }
  function segDist(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
    var qx = a.x + t * dx - px, qy = a.y + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  // Lukee näkyvän vektoritason tiilivarastosta kohteet napautuskohdan ympäriltä (vain jo ladatut tiilet)
  function nearby(ll) {
    var view = vec && vec.views && vec.views.get('');
    if (!view) return null;
    var dz = Math.min(Math.round(map.getZoom()) - 1, MAX_DATA_Z);
    if (dz < 0) return null;
    var t = tileNum(ll.lat, ll.lng, dz), tx = Math.floor(t.x), ty = Math.floor(t.y);
    var size = view.tileCache.tileSize;
    var mpp = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / (Math.pow(2, dz) * size);      // metriä tiilen pikseliä kohden
    var out = { mpp: mpp, own: {}, around: {} };
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var entry = view.tileCache.cache.get((tx + dx) + ':' + (ty + dy) + ':' + dz);
        if (!entry) continue;
        // napautuskohta tämän tiilen pikseleinä
        var px = (t.x - (tx + dx)) * size, py = (t.y - (ty + dy)) * size;
        entry.data.forEach(function (list, name) {
          (out.around[name] = out.around[name] || []).push({ list: list, px: px, py: py });
          if (!dx && !dy) out.own[name] = { list: list, px: px, py: py };
        });
      }
    }
    return out;
  }
  var KRS = { '1-2': '1–2', '3+': '3 tai useampi' };
  var ROAD_NAMES = {
    12111: 'autotie', 12112: 'autotie', 12121: 'autotie', 12122: 'autotie', 12131: 'katu tai tie', 12132: 'katu tai tie',
    12141: 'ajotie', 12311: 'polku', 12312: 'polku', 12313: 'kävely- ja pyörätie', 12314: 'kävely- ja pyörätie', 12316: 'polku'
  };
  function identify(ll) {
    var q = nearby(ll);
    if (!q) return '';
    var html = '', t, items;
    function row(k, v) { return '<tr><th>' + k + '</th><td>' + esc(v) + '</td></tr>'; }
    function section(title, rows) { html += '<div class="pop"><b>' + esc(title) + '</b><table>' + rows.join('') + '</table></div>'; }
    // lähin piste annetulla kerroksella (metreinä)
    function nearestPoints(layer, maxM) {
      var found = [];
      (q.around[layer] || []).forEach(function (o) {
        o.list.forEach(function (f) {
          var p = f.geom[0][0], d = Math.sqrt(Math.pow(p.x - o.px, 2) + Math.pow(p.y - o.py, 2)) * q.mpp;
          if (d <= maxM) found.push({ f: f, d: d, p: p, tile: o });
        });
      });
      found.sort(function (a, b) { return a.d - b.d; });
      return found;
    }
    // rakennus: polygoni, jonka sisällä napautus on
    var building = null, buildingTile = null;
    if (isOn('terrainBuildings')) {
      // napautuskohta voi olla tiilen reunalla, joten tarkistetaan myös viereiset tiilet
      var edge = BUILDING_TOL_M, insideFound = false;
      (q.around.rakennus || []).forEach(function (o) {
        o.list.forEach(function (f) {
          if (insideFound) return;
          if (inRings(o.px, o.py, f.geom)) { building = f; buildingTile = o; insideFound = true; return; }
          // sormella ei osu rakennuksen sisään tarkasti: reunan lähellä (muutama metri) oleva napautus kelpaa
          f.geom.forEach(function (ring) {
            for (var i = 0; i < ring.length - 1; i++) {
              var d = segDist(o.px, o.py, ring[i], ring[i + 1]) * q.mpp;
              if (d <= edge) { edge = d; building = f; buildingTile = o; }
            }
          });
        });
      });
    }
    var addrs = isOn('terrainAddresses') || building ? nearestPoints('osoite', 20) : [];
    if (building) {
      var p = building.props, rows = [row('Käyttötarkoitus', p.kaytto || 'ei tiedossa')];
      rows.push(row('Kerroksia', p.krs ? (KRS[p.krs] || p.krs) : 'ei tiedossa'));
      // osoite: piste rakennuksen sisällä tai lähin alle 20 m päässä
      var inside = addrs.filter(function (a) { return a.tile.px === buildingTile.px && a.tile.py === buildingTile.py && inRings(a.p.x, a.p.y, building.geom); })[0] || addrs[0];
      if (inside) rows.push(row('Osoite', inside.f.props.osoite + (inside.f.props.postinumero ? ', ' + inside.f.props.postinumero : '')));
      if (p.z != null) rows.push(row('Maanpinta (N2000)', G.fmtNum(Number(p.z), 1) + ' m'));
      section('Rakennus', rows);
    } else if (isOn('terrainAddresses') && addrs.length && addrs[0].d <= 12) {
      var ap = addrs[0].f.props;
      section('Osoite', [row('Osoite', ap.osoite), row('Postinumero', ap.postinumero || '–')]);
    }
    if (isOn('terrainParcels')) {
      items = nearestPoints('kiinteistotunnus', TAP_PARCEL_M).slice(0, 3);
      items.forEach(function (it) {
        section('Kiinteistö ' + it.f.props.tunnus, [
          row('Kunta', muni(it.f.props.kunta || String(it.f.props.tunnus).split('-')[0])),
          row('Etäisyys tunnuspisteeseen', Math.round(it.d) + ' m')
        ]);
      });
    }
    if (isOn('terrainRoads') && !building) {
      var best = null;
      (q.around.tie || []).forEach(function (o) {
        o.list.forEach(function (f) {
          if (!f.props.nimi) return;
          f.geom.forEach(function (line) {
            for (var i = 0; i < line.length - 1; i++) {
              var d = segDist(o.px, o.py, line[i], line[i + 1]) * q.mpp;
              if (d <= 8 && (!best || d < best.d)) best = { d: d, f: f };
            }
          });
        });
      });
      if (best) section('Tie', [row('Nimi', best.f.props.nimi), row('Laji', ROAD_NAMES[best.f.props.luokka] || 'tie')]);
    }
    if (!html) return '';
    return html + '<div class="pop-src">Maanmittauslaitos, Digi- ja väestötietovirasto (CC BY 4.0). Ei navigointikäyttöön.</div>';
  }
  function onMapClick(e) {
    if (!vec || !map.hasLayer(vec)) return;
    if (global.App && global.App.mode && global.App.mode() !== 'idle') return;
    var t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest('.leaflet-interactive, .leaflet-marker-icon, .leaflet-control, .leaflet-popup')) return;
    clearTimeout(clickTimer);
    // kaksoisklikkaus siirtää karttaa: odotetaan, ettei toinen klikkaus seuraa
    clickTimer = setTimeout(function () {
      var html = identify(e.latlng);
      if (html) L.popup({ maxWidth: 280, className: 'terrain-pop' }).setLatLng(e.latlng).setContent(html).openOn(map);
    }, 260);
  }

  // ---------- haku ----------
  function loadDir(tag, file) {
    var url = baseUrl() + file, d = dirs[tag];
    if (d && d.url === url) {
      if (d.p) return d.p;
      if (d.failAt && Date.now() - d.failAt < RETRY_MS) return Promise.resolve(null);
    }
    d = dirs[tag] = { url: url, p: null, failAt: 0 };
    stats.dirLoads++;
    d.p = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return j; }, function () { d.p = null; d.failAt = Date.now(); return null; });
    return d.p;
  }
  var LETTER = 'A-Za-zÅÄÖåäö';
  // "Kaupinojankatu 12", "Laiturikatu 8 a", "Rantatie 3, Tampere" -> katu, numero, kirjain, kuntavihje
  function parseAddress(q) {
    var m = new RegExp('^(\\D*[^\\d\\s,])\\s+(\\d+)(?:\\s*([' + LETTER + '])(?![' + LETTER + '0-9]))?(.*)$').exec(q.trim());
    if (!m || !/[A-Za-zÅÄÖåäö]{2}/.test(m[1]) || m[1].length < 3) return null;
    var hint = (m[4] || '').replace(/[\d,]+/g, ' ').trim().toLowerCase();
    return { street: m[1].trim().toLowerCase(), num: m[2], letter: (m[3] || '').toLowerCase(), hint: hint };
  }
  function rowRank(rn, a) {
    rn = String(rn).toLowerCase();
    if (rn === a.num + a.letter) return 1;
    var rg = /^(\d+)-(\d+)$/.exec(rn);
    if (rg && !a.letter && (Number(rg[1]) <= Number(a.num) && Number(a.num) <= Number(rg[2]))) return 2;
    if (!a.letter && rn.indexOf(a.num) === 0 && !/\d/.test(rn.charAt(a.num.length) || '0')) return 3;    // 8 -> 8a
    if (a.letter && rn === a.num) return 4;                                                              // 8 b -> 8
    return 0;
  }
  function searchAddress(q) {
    var a = parseAddress(q);
    if (!a) return Promise.resolve([]);
    return loadDir('osoitteet', 'osoitteet.json').then(function (dir) {
      if (!dir || !dir.kadut) return [];
      if (!dir.low) { dir.low = {}; Object.keys(dir.kadut).forEach(function (k) { dir.low[k.toLowerCase()] = k; }); }
      var keys = [];
      if (dir.low[a.street]) keys.push(dir.low[a.street]);
      Object.keys(dir.low).forEach(function (k) {
        // saarten ja kylien osoitteet, joissa numero on osa nimeä (esim. "Antinsaarentie 34 Antinsaari")
        if (k.indexOf(a.street + ' ' + a.num) === 0) keys.push(dir.low[k]);
      });
      if (!keys.length && a.street.length >= 4) {
        Object.keys(dir.low).forEach(function (k) { if (k.indexOf(a.street) === 0 && keys.length < 4) keys.push(dir.low[k]); });
      }
      var hits = [];
      keys.forEach(function (key) {
        dir.kadut[key].forEach(function (r) {
          var rank = rowRank(r[0], a);
          // kadun nimeen sisältyvä numero (saaret): kaikki rivit kelpaavat
          if (!rank && key.toLowerCase().indexOf(a.street + ' ' + a.num) === 0) rank = 1;
          if (rank) hits.push({ rank: rank, key: key, r: r });
        });
      });
      if (!hits.length) return [];
      var best = Math.min.apply(null, hits.map(function (h) { return h.rank; }));
      hits = hits.filter(function (h) { return h.rank === best; });
      if (a.hint) {
        var byMuni = hits.filter(function (h) { return muni(h.r[2]).toLowerCase().indexOf(a.hint) === 0; });
        if (byMuni.length) hits = byMuni;
      }
      var out = [];
      hits.forEach(function (h) {
        // samalla paikalla olevat toistuvat rivit (usea rakennus samassa pisteessä) yhdistetään
        if (out.some(function (o) { return o.name === h.key + ' ' + h.r[0] && Math.abs(o.lat - h.r[3]) < 0.0001 && Math.abs(o.lng - h.r[4]) < 0.0002; })) return;
        out.push({
          name: h.key + ' ' + h.r[0], info: 'osoite, ' + muni(h.r[2]) + (h.r[1] ? ' ' + h.r[1] : ''),
          lat: h.r[3], lng: h.r[4], kind: 'osoite', zoom: 17
        });
      });
      return out.slice(0, 12);
    });
  }
  // Kiinteistötunnus: 837-123-4-56 (väliviivat, pisteet tai välilyönnit) tai 14 numeroa (kunta 3, kylä 3, tila 4, rno 4)
  function parseParcel(q) {
    var s = q.trim(), parts = null;
    if (/^\d{14}$/.test(s)) parts = [s.slice(0, 3), s.slice(3, 6), s.slice(6, 10), s.slice(10, 14)];
    else if (/^\d{1,3}[-.:\/\s]+\d{1,4}[-.:\/\s]+\d{1,4}([-.:\/\s]+\d{1,4})?$/.test(s)) parts = s.split(/[-.:\/\s]+/);
    if (!parts) return null;
    var nums = parts.map(function (p) { return String(parseInt(p, 10)); });
    return { key: nums.join('-'), full: nums.length === 4 };
  }
  function searchParcel(q) {
    var p = parseParcel(q);
    if (!p) return Promise.resolve([]);
    return loadDir('kiinteistot', 'kiinteistot.json').then(function (dir) {
      if (!dir || !dir.tunnukset) return [];
      var out = [];
      function add(tunnus, pts) {
        var kunta = tunnus.split('-')[0], n = pts.length / 2;
        for (var i = 0; i < pts.length && out.length < 12; i += 2) {
          out.push({
            name: tunnus, info: 'kiinteistö, ' + muni(kunta) + (n > 1 ? ', palsta ' + (i / 2 + 1) + '/' + n : ''),
            lat: pts[i], lng: pts[i + 1], kind: 'kiinteistö', zoom: 16
          });
        }
      }
      if (p.full) {
        if (dir.tunnukset[p.key]) add(p.key, dir.tunnukset[p.key]);
      } else {
        // kunta-kylä-tila: kaikki rekisterinumerot (enintään 8 tunnusta)
        var n = 0;
        Object.keys(dir.tunnukset).some(function (k) {
          if (k.indexOf(p.key + '-') === 0) { add(k, dir.tunnukset[k].slice(0, 2)); n++; }
          return n >= 8;
        });
      }
      return out;
    });
  }
  function search(q) {
    return Promise.all([searchAddress(q), searchParcel(q)]).then(function (res) { return res[0].concat(res[1]); }, function () { return []; });
  }

  // ---------- Ohje: aineistot ja käyttöehdot ----------
  function sourcesBody() {
    var h = '<p>Maasto-tasot ja osoite- ja kiinteistötunnushaku käyttävät erillistä aineistopakettia (Näsijärvi), jonka osoite on Tiedosto → Asetukset. ' +
      'Paketin sisältämät lähteet ja lähdemerkinnät luetaan paketin kuvauksesta (aineisto.json).</p>';
    if (!meta) return h + '<p class="meta">Aineistokuvausta ei ole saatavilla (ei verkkoyhteyttä tai aineistopaketin osoite on väärä). Aineistona ovat Maanmittauslaitoksen maastotietokanta, kiinteistörajat ja korkeusmalli sekä Digi- ja väestötietoviraston rakennusten osoitteet, kaikki CC BY 4.0.</p>';
    if (meta.lahdemerkinta_yhteensa) h += '<p><b>' + esc(meta.lahdemerkinta_yhteensa) + '</b></p>';
    h += '<ul>';
    (meta.lahteet || []).forEach(function (l) {
      h += '<li><b>' + esc(l.nimi) + '</b>, ' + esc(l.tuottaja) + ', lisenssi ' +
        (l.lisenssi_url ? '<a href="' + esc(l.lisenssi_url) + '" target="_blank" rel="noopener">' + esc(l.lisenssi) + '</a>' : esc(l.lisenssi)) +
        (l.huomio ? '. ' + esc(l.huomio) : '') + '</li>';
    });
    h += '</ul>';
    var r = meta.kayttorajoitukset || {};
    if (r.dvv_osoitteet) h += '<p>' + esc(r.dvv_osoitteet) + ' Osoitteet ovat siis poiminta 3.2.2025.</p>';
    if (r.navigointi) h += '<p><b>' + esc(r.navigointi) + '</b></p>';
    h += '<p class="meta">Reittikartta käyttää paketista maastotietokantaa (rakennukset, maastotyyppi, tiet), kiinteistörajoja ja -tunnuksia, korkeusmallia ja osoitteita. Paketin muut kerrokset (turvalaitteet, syvyydet, puusto) ovat simulaattoria varten, eikä Reittikartta käytä niitä.</p>';
    return h;
  }
  // Palauttaa kohdan HTML:n ja täydentää sen, kun aineistokuvaus on ladattu
  function sourcesHtml() {
    var id = 'terrainSrc' + Date.now();
    if (!meta) {
      loadMeta().then(function () {
        var el = document.getElementById(id);
        if (el) el.innerHTML = sourcesBody();
      });
    }
    return '<h3>Maastoaineisto (Näsijärvi)</h3><div id="' + id + '">' + (meta ? sourcesBody() : '<p class="meta">Ladataan aineistokuvausta…</p>') + '</div>';
  }

  // ---------- käynnistys ----------
  function init(m) {
    map = m;
    var panes = [['terrainCoverPane', 220], ['terrainReliefPane', 225], ['terrainVecPane', 230]];
    panes.forEach(function (p) {
      map.createPane(p[0]);
      map.getPane(p[0]).style.zIndex = p[1];
      map.getPane(p[0]).style.pointerEvents = 'none';
    });
    var notes = map.getContainer().querySelector('.map-notes') || L.DomUtil.create('div', 'map-notes', map.getContainer());
    noteEl = L.DomUtil.create('div', 'enc-note terrain-note', notes);
    noteEl.textContent = NOTE_TEXT;
    noteEl.hidden = true;
    map.on('moveend zoomend', sync);
    map.on('click', onMapClick);
    map.on('dblclick movestart zoomstart', function () { clearTimeout(clickTimer); });
    if (anyOn()) sync();
  }

  global.Terrain = {
    init: init, sync: sync, changed: changed, search: search, searchAddress: searchAddress, searchParcel: searchParcel,
    loadMeta: loadMeta, sourcesHtml: sourcesHtml, identify: identify, parseAddress: parseAddress, parseParcel: parseParcel,
    DEFAULT_URL: DEFAULT_URL, KEYS: KEYS, MIN_Z: MIN_Z,
    get meta() { return meta; },
    get stats() { return stats; },
    get perf() { return perf; },
    get info() {
      return {
        url: baseUrl(), meta: !!meta, area: map ? inArea() : null, note: !!(noteEl && !noteEl.hidden), attribution: attrText,
        vec: !!(vec && map.hasLayer(vec)), cover: !!(cover && map.hasLayer(cover)), relief: !!(relief && map.hasLayer(relief)),
        stats: stats
      };
    },
    layers: function () { return { vec: vec, cover: cover, relief: relief }; }
  };
})(window);
