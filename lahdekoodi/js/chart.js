/* Reittikartta – karttapohja (Traficomin rasterimerikartat), Väyläviraston
 * ajantasaiset väylätiedot, väylien suunnat, karttareunus ja mittakaava. */
(function (global) {
  'use strict';

  var G = global.Geo;
  var RAST = 'https://julkinen.traficom.fi/rasteripalvelu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER={layer}&STYLE=&TILEMATRIXSET=WGS84_Pseudo-Mercator&TILEMATRIX=WGS84_Pseudo-Mercator%3A{z}' +
    '&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng';
  var VAYLA_WMS = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ows';
  var VAYLA_WFS = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ows?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature' +
    '&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var ATTR_T = 'Merikartat: <a href="https://www.traficom.fi/fi/merikartoitus" target="_blank" rel="noopener">Traficom</a> CC BY 4.0, ei navigointikäyttöön';
  var ENC_WMS = 'https://julkinen.traficom.fi/s57/wms';
  var ATTR_E = 'ENC: <a href="https://www.traficom.fi/fi/merikartoitus" target="_blank" rel="noopener">Traficom</a> S-57 CC BY 4.0, ei navigointikäyttöön';
  var ATTR_V = 'Väylätiedot: <a href="https://vayla.fi/vaylista/aineistot/avoindata" target="_blank" rel="noopener">Väylävirasto</a> CC BY 4.0';

  var map, show;
  // Rasterimerikarttojen ja ENC-pohjan tarkin taso. Tätä lähempänä näytetään aina vektorikartta,
  // jonka Traficomin palvelu piirtää syvyystietokannasta mihin tahansa mittakaavaan (tasolle 20 asti).
  var MAX_CHART_Z = 17;

  // ---------------- rasterimerikartat ----------------
  // Kaikki karttasarjat kootaan yhdeksi teräväksi tasoksi (rastersharp.js).
  // Järjestys: pienimittakaavaisin alimmaksi, satamakartat päällimmäiseksi.
  function src(name, minZoom, maxZoom) {
    return {
      url: RAST.replace('{layer}', encodeURIComponent('Traficom:' + name)),
      minZoom: minZoom, maxZoom: maxZoom
    };
  }

  // OpenStreetMapin karttatiilet. OSM:n palvelimet estävät pyynnöt, joissa ei ole Referer-otsaketta,
  // ja tiedostona (file://) avattu sivu ei sitä lähetä: tavallisella <img>-latauksella tulee "Access blocked" -tiili.
  // Siksi tiilet haetaan fetchillä ja sovellus tunnistetaan X-Requested-With-otsakkeella, jonka OSM hyväksyy
  // sovelluksille, jotka eivät voi lähettää Refereriä. Selaimen välimuisti toimii normaalisti.
  var OSM_APP_ID = 'Reittikartta (SMPS route planner, local HTML)';
  var OsmTiles = L.TileLayer.extend({
    createTile: function (coords, done) {
      var img = document.createElement('img'), url = this.getTileUrl(coords);
      img.alt = ''; img.setAttribute('role', 'presentation');
      fetch(url, { mode: 'cors', headers: { 'X-Requested-With': OSM_APP_ID } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .then(function (b) {
          if (img.getAttribute('src')) return;          // tiili ehdittiin jo hylätä
          var ou = URL.createObjectURL(b);
          img.onload = function () { URL.revokeObjectURL(ou); done(null, img); };
          img.onerror = function () { URL.revokeObjectURL(ou); done(new Error('kuva'), img); };
          img.src = ou;
        })
        .catch(function (e) { done(e, img); });
      return img;
    }
  });

  function buildBase() {
    map.createPane('chartPane');
    map.getPane('chartPane').style.zIndex = 200;
    var group = new global.SharpChart([
      src('Yleiskartat 250k public', 5, 12),
      src('Yleiskartat 100k public', 8, 13),
      src('Rannikkokartat public', 7, 17),
      src('Merikarttasarjat public', 7, 17),
      src('Merikarttasarjojen erikoiskartat', 11, 17),
      src('Satamakartat', 12, 17)
    ], { pane: 'chartPane', attribution: ATTR_T, maxZoom: 20, maxNativeZoom: MAX_CHART_Z, minZoom: 5 }).addTo(map);
    var underlay = L.tileLayer('https://tiles.kartat.kapsi.fi/taustakartta/{z}/{x}/{y}.jpg', {
      maxZoom: 20, maxNativeZoom: 16, errorTileUrl: BLANK, opacity: 0.55,
      attribution: 'Taustakartta: <a href="https://www.maanmittauslaitos.fi" target="_blank" rel="noopener">MML</a> / kartat.kapsi.fi'
    });
    var osm = new OsmTiles('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, maxNativeZoom: 19, errorTileUrl: BLANK, opacity: 0.55,
      attribution: 'Maapohja: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-tekijät'
    });
    return { charts: group, underlay: underlay, mml: underlay, osm: osm };
  }

  // ---------------- ENC-karttapohja (Traficom S-57 WMS) ----------------
  // Palvelin piirtää ENC-aineiston kuvaksi pyydetyssä mittakaavassa, joten kartta on terävä
  // kaikilla tasoilla ja sijainnit ovat ENC:n mukaiset. ENC kattaa rannikon ja osan
  // sisävesistä (mm. Saimaan alueen); muualla, esimerkiksi Näsijärvellä, aineistoa ei ole.
  // Siksi näkymän kattavuus tarkistetaan läpinäkyvän maan tyylillä (vesialueet piirtyvät,
  // muu jää läpinäkyväksi): jos näkymässä ei ole ENC-vesialuetta, näytetään rasterikartta.
  var ENC_STYLES = { enc: 'style-id-245', 'enc-ecdis': 'style-id-202' };
  var baseRef = null, encLayer = null, baseMode = 'raster', encCovered = null, covSeq = 0, encNote = null, autoNote = null, lastShown = null;
  function makeEnc(style) {
    return L.tileLayer.wms(ENC_WMS, {
      layers: 'cells', styles: style, format: 'image/png', transparent: false, version: '1.3.0',
      tileSize: 512, detectRetina: true, pane: 'chartPane', maxZoom: 21, maxNativeZoom: MAX_CHART_Z, attribution: ATTR_E,
      errorTileUrl: BLANK
    });
  }
  // Vektorikartan tiilet latautuvat verkosta: edellinen pohja pidetään näkyvissä, kunnes ne ovat valmiit,
  // ettei kartta välähdä tyhjänä vaihdon aikana.
  function dropUnderVector(layer) {
    if (!layer || !map.hasLayer(layer)) return;
    var gone = false;
    function go() {
      if (gone) return; gone = true;
      vecLayer.off('load', go);
      if (vecOn() && map.hasLayer(layer)) map.removeLayer(layer);
    }
    if (!vecLayer.isLoading()) { go(); return; }
    vecLayer.on('load', go);
    setTimeout(go, 5000);
  }
  function applyBase() {
    lastShown = shownMode();
    if (autoNote) autoNote.hidden = !(lastShown === 'vector' && baseMode !== 'vector');
    if (lastShown === 'vector') {
      if (!vecLayer) vecLayer = new VectorChart();
      if (!map.hasLayer(vecLayer)) vecLayer.addTo(map);
      dropUnderVector(encLayer);
      dropUnderVector(baseRef.charts);
      if (!fairwayAreas) fairwayAreas = L.tileLayer.wms(VAYLA_WMS, {
        layers: 'vesivaylatiedot:vaylaalueet_uusi', format: 'image/png', transparent: true, version: '1.3.0',
        tileSize: 512, detectRetina: true, pane: 'chartPane', opacity: 0.55, minZoom: 10, maxZoom: 21
      });
      if (!map.hasLayer(fairwayAreas)) fairwayAreas.addTo(map);
      map.getContainer().classList.add('vec-base');
      map.getContainer().classList.toggle('land-osm', landKind === 'osm');
      // maapohja maan päälle nimistöä ja maastoa varten; vesialueet peittävät sen
      setUnderlayLayer(true, landKind === 'osm' ? 1 : 0.8);
      if (encNote) encNote.hidden = true;
      renderMml();
      return;
    }
    map.getContainer().classList.remove('land-osm');
    setUnderlayLayer(!!show.underlay, 0.55);
    if (vecLayer && map.hasLayer(vecLayer)) map.removeLayer(vecLayer);
    if (fairwayAreas && map.hasLayer(fairwayAreas)) map.removeLayer(fairwayAreas);
    map.getContainer().classList.remove('vec-base');
    var useEnc = baseMode !== 'raster' && encCovered === true && encLayer;
    if (useEnc) {
      if (!map.hasLayer(encLayer)) encLayer.addTo(map);
      if (map.hasLayer(baseRef.charts)) map.removeLayer(baseRef.charts);
    } else {
      if (encLayer && map.hasLayer(encLayer)) map.removeLayer(encLayer);
      if (!map.hasLayer(baseRef.charts)) baseRef.charts.addTo(map);
    }
    if (encNote) {
      var miss = baseMode !== 'raster' && encCovered === false;
      encNote.hidden = !miss;
      encNote.textContent = miss ? 'ENC-aineistoa ei ole tällä alueella – näytetään rasterikartta' : '';
    }
  }
  function checkEncCoverage() {
    if (baseMode === 'raster' || vecOn()) return;
    var b = map.getBounds();
    var sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
    var W = 96, H = 72;
    var url = ENC_WMS + '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=cells&STYLES=style-id-203' +
      '&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=' + W + '&HEIGHT=' + H +
      '&BBOX=' + [sw.x, sw.y, ne.x, ne.y].map(function (v) { return v.toFixed(1); }).join(',');
    var seq = ++covSeq;
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (bl) { return createImageBitmap(bl); }).then(function (bm) {
      if (seq !== covSeq || baseMode === 'raster') return;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d'); g.drawImage(bm, 0, 0, W, H);
      var d = g.getImageData(0, 0, W, H).data, n = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
      encCovered = n > 0;
      applyBase();
    }).catch(function () {
      // ENC-palvelu ei vastannut: näytetään rasterikartta, kunnes yhteys palaa
      if (seq === covSeq && encCovered === null) { encCovered = false; applyBase(); }
    });
  }
  function setBase(mode) {
    if (!ENC_STYLES[mode] && mode !== 'vector') mode = 'raster';
    baseMode = mode;
    if (encLayer) { if (map.hasLayer(encLayer)) map.removeLayer(encLayer); encLayer = null; }
    if (ENC_STYLES[mode]) encLayer = makeEnc(ENC_STYLES[mode]);
    encCovered = null;
    applyBase();
    checkEncCoverage();
    loadVisible(); renderFairways(); renderAids(); loadSoundings(); renderSoundings(); renderLights(); renderSpeed(); loadMml(); renderMml(); loadPiers(); renderPiers();
  }
  // näytettävä pohja: valittu pohja, paitsi rasteri- ja ENC-pohjan tarkimman tason jälkeen vektorikartta
  function shownMode() { return baseMode !== 'vector' && map.getZoom() > MAX_CHART_Z ? 'vector' : baseMode; }
  function vecOn() { return shownMode() === 'vector'; }
  // ---------------- maapohja: MML taustakartta tai OpenStreetMap ----------------
  var landKind = 'mml';
  function setUnderlayLayer(on, opacity) {
    var want = landKind === 'osm' ? baseRef.osm : baseRef.mml, other = want === baseRef.osm ? baseRef.mml : baseRef.osm;
    if (map.hasLayer(other)) map.removeLayer(other);
    want.setOpacity(opacity);
    if (on && !map.hasLayer(want)) want.addTo(map);
    if (!on && map.hasLayer(want)) map.removeLayer(want);
  }
  function setLand(kind) { landKind = kind === 'osm' ? 'osm' : 'mml'; applyBase(); renderMml(); }
  // efektiiviset näkyvyydet: loistosektorit ja nopeusrajoitusalueet oletuksena vektoripohjalla
  function lightsOn() { return show.lights === true || (show.lights == null && vecOn()); }
  function speedOn() { return show.speed === true || (show.speed == null && vecOn()); }

  // ---------------- syvä vesi ja turvasyvyys ----------------
  // Traficomin merikarttatietokannan syvyysalueet (INSPIRE-palvelu "rajoitettu"). Palvelin
  // piirtää kaksi peitettä: alueet, joiden pienin syvyys (DRVAL1) on alle turvasyvyyden, ja
  // alueet, joiden pienin syvyys on vähintään turvasyvyys. Selain värittää ne: syvä vesi
  // vaaleaksi ja varottava vesi siniseksi, ja niiden raja (turvakäyrä) piirretään viivana.
  // Logiikka vastaa ECDISin turvakäyrää: raja on aineiston lähin syvyyskäyrä, joka on vähintään
  // turvasyvyys (esim. 2,4 m → 3 m käyrä). Rajat ovat syvyystietokannasta, eivät rasterista.
  var DEPTH_WMS = 'https://julkinen.traficom.fi/inspirepalvelu/rajoitettu/wms';
  var DEPTH_WFS = 'https://julkinen.traficom.fi/inspirepalvelu/rajoitettu/wfs';
  var SAFE_FILL = 'rgba(255,255,255,0.45)', SHALLOW_FILL = 'rgba(40,128,214,0.5)', CONTOUR_RGB = [8, 52, 110];
  var safetyLayer = null, safetyDepth = null, safetyLabel = '', safetyChip = null, effSeq = 0, effTimer = null;
  function depthAttr() {
    var d = new Date();
    return 'Syvyysalueet: sisältää Liikenne- ja viestintäviraston merikarttatietokannan tietoa ' +
      G.pad(d.getMonth() + 1, 2) + '/' + d.getFullYear() + ' (lisenssi: Ohje → Aineistot), ei navigointikäyttöön';
  }
  function depthMask(bbox, W, H, cql, style) {
    var url = DEPTH_WMS + '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=rajoitettu:DepthArea_A&STYLES=' + (style || '') +
      '&FORMAT=image/png&TRANSPARENT=TRUE&CRS=EPSG:3857&WIDTH=' + W + '&HEIGHT=' + H + '&BBOX=' + bbox +
      (cql ? '&CQL_FILTER=' + encodeURIComponent(cql) : '');
    return fetch(url).then(function (r) {
      if (!r.ok || (r.headers.get('content-type') || '').indexOf('image') < 0) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) { return createImageBitmap(b); });
  }
  function tint(bm, W, H, fill) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.drawImage(bm, 0, 0, W, H);
    var a = g.getImageData(0, 0, W, H).data;
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = fill; g.fillRect(0, 0, W, H);
    return { canvas: c, alpha: a };
  }
  var SafetyLayer = L.GridLayer.extend({
    options: { tileSize: 512, pane: 'depthPane', minZoom: 10, maxZoom: 20, updateWhenZooming: false, keepBuffer: 1 },
    getAttribution: function () { return depthAttr(); },
    createTile: function (coords, done) {
      var size = this.getTileSize();
      var dpr = Math.min(2, Math.max(1, global.devicePixelRatio || 1));
      var W = Math.round(size.x * dpr), H = Math.round(size.y * dpr);
      var tile = document.createElement('canvas'); tile.width = W; tile.height = H;
      var nwP = coords.scaleBy(size), seP = nwP.add(size);
      var a = L.CRS.EPSG3857.project(this._map.unproject(nwP, coords.z));
      var b = L.CRS.EPSG3857.project(this._map.unproject(seP, coords.z));
      var bbox = [a.x, b.y, b.x, a.y].map(function (v) { return v.toFixed(2); }).join(',');
      var sd = safetyDepth;
      if (sd == null) { done(null, tile); return tile; }
      var lim = String(Math.round(sd * 100) / 100);
      Promise.all([
        depthMask(bbox, W, H, 'parseDouble(DRVAL1) < ' + lim),
        depthMask(bbox, W, H, 'parseDouble(DRVAL1) >= ' + lim)
      ]).then(function (m) {
        var g = tile.getContext('2d');
        var sh = tint(m[0], W, H, SHALLOW_FILL.replace(/[\d.]+\)$/, '1)'));
        var dp = tint(m[1], W, H, SAFE_FILL.replace(/[\d.]+\)$/, '1)'));
        g.globalAlpha = parseFloat(SHALLOW_FILL.match(/([\d.]+)\)$/)[1]); g.drawImage(sh.canvas, 0, 0);
        g.globalAlpha = parseFloat(SAFE_FILL.match(/([\d.]+)\)$/)[1]); g.drawImage(dp.canvas, 0, 0);
        g.globalAlpha = 1;
        // turvakäyrä: syvän ja matalan alueen yhteinen raja (ei rantaviivaa)
        var A = sh.alpha, B = dp.alpha, line = g.createImageData(W, H), L2 = line.data;
        var r = Math.max(1, Math.round(dpr));
        for (var y = r; y < H - r; y++) for (var x = r; x < W - r; x++) {
          var p = y * W + x;
          if (B[p * 4 + 3] < 128) continue;
          var hit = false;
          for (var dy = -r; dy <= r && !hit; dy++) for (var dx = -r; dx <= r; dx++) {
            if (A[((y + dy) * W + x + dx) * 4 + 3] >= 128) { hit = true; break; }
          }
          if (hit) { var o = p * 4; L2[o] = CONTOUR_RGB[0]; L2[o + 1] = CONTOUR_RGB[1]; L2[o + 2] = CONTOUR_RGB[2]; L2[o + 3] = 230; }
        }
        var lc = document.createElement('canvas'); lc.width = W; lc.height = H;
        lc.getContext('2d').putImageData(line, 0, 0);
        g.drawImage(lc, 0, 0);
        done(null, tile);
      }, function () { done(null, tile); });
      return tile;
    }
  });
  function fmtM(v) { return G.fmtNum(v, v % 1 ? 1 : 0); }
  function updateSafetyChip() {
    if (!safetyChip) return;
    if (safetyDepth == null) { safetyChip.hidden = true; return; }
    safetyChip.hidden = false;
    var head = '<span class="sw sw-deep"></span>syvä vesi <span class="sw sw-shallow"></span>varo · turvasyvyys ' +
      fmtM(safetyDepth) + ' m' + (safetyLabel ? ' (' + escapeHtml(safetyLabel) + ')' : '');
    if (map.getZoom() < 10) { safetyChip.innerHTML = head + '<div class="sub">Lähennä nähdäksesi syvän veden.</div>'; return; }
    safetyChip.innerHTML = head + '<div class="sub">Haetaan syvyysaluetietoja…</div>';
    clearTimeout(effTimer);
    effTimer = setTimeout(function () {
      var bb = map.getBounds(), seq = ++effSeq, sd = safetyDepth;
      var url = DEPTH_WFS + '?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json' +
        '&TYPENAME=rajoitettu:DepthArea_A&PROPERTYNAME=DRVAL1&BBOX=' +
        [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()].map(function (v) { return v.toFixed(5); }).join(',') + ',EPSG:4326';
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (seq !== effSeq || sd !== safetyDepth) return;
        var vals = (j.features || []).map(function (f) { return parseFloat(f.properties.DRVAL1); }).filter(isFinite);
        var deeper = vals.filter(function (v) { return v >= sd; });
        var sub;
        if (!vals.length) sub = 'Näkymässä ei ole syvyysaluetietoa.';
        else if (!deeper.length) sub = 'Koko näkymä on matalampaa kuin turvasyvyys.';
        else {
          var eff = Math.min.apply(null, deeper);
          sub = 'Turvakäyrä tässä näkymässä: ' + fmtM(eff) + ' m';
          if (eff - sd >= 1.5) sub += ' – aineisto ei erottele tarkemmin, joten osa ' + fmtM(sd) + '–' + fmtM(eff) + ' m vedestä näkyy varottavana.';
        }
        safetyChip.innerHTML = head + '<div class="sub">' + sub + '</div>';
      }).catch(function () {
        if (seq === effSeq) safetyChip.innerHTML = head + '<div class="sub">Syvyysaluetietojen haku epäonnistui.</div>';
      });
    }, 350);
  }
  function setSafety(depth, label) {
    var d = depth == null ? null : Math.max(0.1, Math.min(60, Number(depth)));
    if (d === safetyDepth && label === safetyLabel && (d == null) === !safetyLayer) { updateSafetyChip(); return; }
    safetyDepth = d; safetyLabel = label || '';
    if (safetyLayer) { map.removeLayer(safetyLayer); safetyLayer = null; }
    if (d != null) safetyLayer = new SafetyLayer().addTo(map);
    updateSafetyChip();
  }

  // ---------------- vektorikartta (merikarttatietokannan syvyysaineisto) ----------------
  // Palvelin piirtää syvyysalueet kuvaksi jokaisella zoomaustasolla erikseen, joten vesialueet,
  // syvyysvyöhykkeet, syvyyskäyrät ja rantaviiva ovat teräviä millä tahansa tasolla. Maa jää
  // läpinäkyväksi ja saa paperikartan keltaisen taustan (ja halutessa maastokartan alle).
  var VEC = {
    deep: [255, 255, 255], d10: [244, 249, 254], d6: [226, 240, 252], d3: [198, 226, 249],
    contour: [0, 150, 220], coast: [35, 35, 35]
  };
  function maskData(bm, W, H) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bm, 0, 0, W, H);
    return g.getImageData(0, 0, W, H).data;
  }
  var VectorChart = L.GridLayer.extend({
    options: { tileSize: 512, pane: 'chartPane', minZoom: 7, maxZoom: 20, updateWhenZooming: false, keepBuffer: 1 },
    getAttribution: function () { return depthAttr(); },
    createTile: function (coords, done) {
      var size = this.getTileSize();
      var dpr = Math.min(2, Math.max(1, global.devicePixelRatio || 1));
      var W = Math.round(size.x * dpr), H = Math.round(size.y * dpr);
      var tile = document.createElement('canvas'); tile.width = W; tile.height = H;
      var nwP = coords.scaleBy(size), seP = nwP.add(size);
      var a = L.CRS.EPSG3857.project(this._map.unproject(nwP, coords.z));
      var b = L.CRS.EPSG3857.project(this._map.unproject(seP, coords.z));
      var bbox = [a.x, b.y, b.x, a.y].map(function (v) { return v.toFixed(2); }).join(',');
      Promise.all([
        depthMask(bbox, W, H, null, 'polygon'),                 // vesialue + kaikki rajat (käyrät, ranta)
        depthMask(bbox, W, H, 'parseDouble(DRVAL1) < 10'),
        depthMask(bbox, W, H, 'parseDouble(DRVAL1) < 6'),
        depthMask(bbox, W, H, 'parseDouble(DRVAL1) < 3')
      ]).then(function (m) {
        var Wd = maskData(m[0], W, H), A10 = maskData(m[1], W, H), A6 = maskData(m[2], W, H), A3 = maskData(m[3], W, H);
        var g = tile.getContext('2d'), img = g.createImageData(W, H), o = img.data;
        var r = Math.max(1, Math.round(dpr * 0.8));
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
          var p = (y * W + x) * 4, wa = Wd[p + 3];
          if (wa < 8) continue;
          var R = VEC.deep[0], G2 = VEC.deep[1], B = VEC.deep[2], k;
          k = A10[p + 3] / 255; R += (VEC.d10[0] - R) * k; G2 += (VEC.d10[1] - G2) * k; B += (VEC.d10[2] - B) * k;
          k = A6[p + 3] / 255; R += (VEC.d6[0] - R) * k; G2 += (VEC.d6[1] - G2) * k; B += (VEC.d6[2] - B) * k;
          k = A3[p + 3] / 255; R += (VEC.d3[0] - R) * k; G2 += (VEC.d3[1] - G2) * k; B += (VEC.d3[2] - B) * k;
          // polygonityylin rajaviivat (täyttö harmaa 170, viiva musta) → syvyyskäyrät
          var lum = (Wd[p] + Wd[p + 1] + Wd[p + 2]) / 3;
          var ln = lum < 160 ? Math.min(1, (160 - lum) / 120) : 0;
          if (ln > 0) { R += (VEC.contour[0] - R) * ln; G2 += (VEC.contour[1] - G2) * ln; B += (VEC.contour[2] - B) * ln; }
          // rantaviiva: vesialueen reuna maata vasten
          if (wa >= 128 && x >= r && y >= r && x < W - r && y < H - r) {
            var coast = false;
            for (var dy = -r; dy <= r && !coast; dy++) for (var dx = -r; dx <= r; dx++) {
              if (Wd[((y + dy) * W + x + dx) * 4 + 3] < 64) { coast = true; break; }
            }
            if (coast) { R = VEC.coast[0]; G2 = VEC.coast[1]; B = VEC.coast[2]; }
          }
          o[p] = R; o[p + 1] = G2; o[p + 2] = B; o[p + 3] = wa;
        }
        g.putImageData(img, 0, 0);
        done(null, tile);
      }, function () { done(null, tile); });
      return tile;
    }
  });
  var vecLayer = null, fairwayAreas = null;
  // syvyysluvut (merikarttatietokanta), vain vektoripohjalla, tasolta 13
  var SOUND_CELL = { w: 0.125, h: 0.0625 }, soundStore = {}, soundLoaded = {}, soundLayer = null;
  function loadSoundings() {
    if (!vecOn() || map.getZoom() < 13) return;
    var bb = map.getBounds().pad(0.1);
    var cx0 = Math.floor(bb.getWest() / SOUND_CELL.w), cx1 = Math.floor(bb.getEast() / SOUND_CELL.w);
    var cy0 = Math.floor(bb.getSouth() / SOUND_CELL.h), cy1 = Math.floor(bb.getNorth() / SOUND_CELL.h);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 30) return;
    for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
      var key = cx + ':' + cy;
      if (soundLoaded[key]) continue;
      soundLoaded[key] = 'pending';
      (function (key, cx, cy) {
        var bbox = [cx * SOUND_CELL.w, cy * SOUND_CELL.h, (cx + 1) * SOUND_CELL.w, (cy + 1) * SOUND_CELL.h].map(function (v) { return v.toFixed(5); }).join(',');
        fetch(DEPTH_WFS + '?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326' +
          '&TYPENAME=rajoitettu:Sounding_P&BBOX=' + bbox + ',EPSG:4326')
          .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function (j) {
            (j.features || []).forEach(function (f) {
              var c = f.geometry && f.geometry.coordinates, d = f.properties && f.properties.DEPTH;
              if (!c || d == null) return;
              soundStore[c[0].toFixed(6) + ',' + c[1].toFixed(6)] = { lat: c[1], lng: c[0], d: Number(d) };
            });
            soundLoaded[key] = true;
            renderSoundings();
          }).catch(function () { delete soundLoaded[key]; });
      })(key, cx, cy);
    }
  }
  function soundHtml(d) {
    var v = Math.round(d * 10) / 10, i = Math.floor(v), dec = Math.round((v - i) * 10);
    return '<span class="snd">' + i + (dec && v < 31 ? '<sub>' + dec + '</sub>' : '') + '</span>';
  }
  function renderSoundings() {
    if (!soundLayer) return;
    soundLayer.clearLayers();
    if (!vecOn() || map.getZoom() < 13) return;
    var bb = map.getBounds().pad(0.05), grid = {}, cellPx = map.getZoom() >= 16 ? 30 : 38, n = 0;
    var list = Object.keys(soundStore).map(function (k) { return soundStore[k]; })
      .filter(function (s) { return bb.contains([s.lat, s.lng]); })
      .sort(function (a, b) { return a.d - b.d; });            // matalimmat ensin: ne jäävät näkyviin
    for (var i = 0; i < list.length && n < 700; i++) {
      var s = list[i], P = map.latLngToContainerPoint([s.lat, s.lng]);
      var gk = Math.floor(P.x / cellPx) + ':' + Math.floor(P.y / cellPx);
      if (grid[gk]) continue;
      grid[gk] = 1; n++;
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'snd-ico', html: soundHtml(s.d), iconSize: [0, 0] }),
        interactive: false, keyboard: false, pane: 'labelPane'
      }).addTo(soundLayer);
    }
  }

  // ---------------- Väyläviraston aineisto ----------------
  var CELL_W = 0.25, CELL_H = 0.125;
  var store = { navlines: {}, vaylat: {}, aids: {}, signs: {}, lights: {}, sectors: {}, speed: {}, taulu: {} };
  var loaded = {};      // "tyyppi:cx:cy" → true / 'pending'
  var LAYERS = {
    navlines: { type: 'vesivaylatiedot:navigointilinjat_uusi', id: 'navigointilinjaid', minZoom: 11 },
    vaylat: { type: 'vesivaylatiedot:vaylat_uusi', id: 'jnro', minZoom: 11 },
    aids: { type: 'vesivaylatiedot:turvalaitteet_uusi', id: 'id', minZoom: 12 },
    signs: { type: 'vesivaylatiedot:vesiliikennemerkit_uusi', id: 'id', minZoom: 12 },
    // muiden väylänpitäjien (esim. kuntien) väylät ja turvalaitteet samoihin tietovarastoihin
    navlines2: { type: 'vesivaylatiedot:navigointilinjat_muut_vaylanpitajat', id: 'navigointilinjaid', minZoom: 11, into: 'navlines', prefix: 'm' },
    aids2: { type: 'vesivaylatiedot:turvalaitteet_muut_vaylanpitajat', id: 'id', minZoom: 12, into: 'aids', prefix: 'm' },
    lights: { type: 'vesivaylatiedot:loistot_uusi', id: 'id', minZoom: 11 },
    sectors: { type: 'vesivaylatiedot:valosektorit_uusi', id: 'id', minZoom: 11 },
    speed: { type: 'vesivaylatiedot:vesivaylien_nopeusrajoitusalueet', id: 'id', minZoom: 11 },
    // linjataulujen linjat: taululinja kulkee takataulusta etutaulun kautta väylän linjaosuuden päähän
    taulu: { type: 'vesivaylatiedot:taululinjat_uusi', id: 'taululinjaid', minZoom: 11 }
  };
  var onDataCbs = [];
  var statusEl = null;
  var pending = 0, failed = 0;

  var tileErrAt = 0;
  global.addEventListener('rk-tile-error', function () { tileErrAt = Date.now(); setStatus(); setTimeout(setStatus, 10000); });

  function setStatus() {
    if (!statusEl) return;
    if (Date.now() - tileErrAt < 9000) { statusEl.textContent = 'Merikarttatiilien haku epäonnistui – tarkista verkkoyhteys'; statusEl.className = 'net err'; return; }
    if (pending > 0) { statusEl.textContent = 'Ladataan väylätietoja…'; statusEl.className = 'net busy'; }
    else if (failed > 0) { statusEl.textContent = 'Väylätietojen haku epäonnistui osittain (verkkoyhteys?)'; statusEl.className = 'net err'; }
    else if (pierBusy > 0) { statusEl.textContent = 'Ladataan laitureita (OpenStreetMap)…'; statusEl.className = 'net busy'; }
    else { statusEl.textContent = ''; statusEl.className = 'net'; }
  }

  function wanted() {
    var z = map.getZoom();
    var w = [];
    if (z >= LAYERS.navlines.minZoom && (show.bearings || show.depths || show.lines || vecOn() || show.snap !== false)) { w.push('navlines'); w.push('navlines2'); w.push('vaylat'); }
    if (z >= LAYERS.taulu.minZoom && (show.lines || vecOn())) w.push('taulu');
    if (z >= LAYERS.aids.minZoom && (show.aids || vecOn() || show.snap !== false)) { w.push('aids'); w.push('aids2'); }
    if (z >= LAYERS.lights.minZoom && lightsOn()) { w.push('lights'); w.push('sectors'); }
    if (z >= LAYERS.speed.minZoom && speedOn()) w.push('speed');
    if (z >= LAYERS.signs.minZoom && signsOn()) w.push('signs');
    return w;
  }

  function loadVisible() {
    var b = map.getBounds().pad(0.15);
    var w = wanted();
    if (!w.length) return;
    var cx0 = Math.floor(b.getWest() / CELL_W), cx1 = Math.floor(b.getEast() / CELL_W);
    var cy0 = Math.floor(b.getSouth() / CELL_H), cy1 = Math.floor(b.getNorth() / CELL_H);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 24) return;   // liian laaja näkymä
    w.forEach(function (kind) {
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var key = kind + ':' + cx + ':' + cy;
        if (loaded[key]) continue;
        loaded[key] = 'pending';
        fetchCell(kind, cx, cy, key);
      }
    });
  }

  function ingest(kind, feats) {
    var idKey = LAYERS[kind].id, into = LAYERS[kind].into || kind, pre = LAYERS[kind].prefix || '';
    feats.forEach(function (f) {
      var id = f.properties && f.properties[idKey];
      if (id == null) id = f.id;
      store[into][pre + id] = f;
    });
  }

  function fetchCell(kind, cx, cy, key) {
    var bbox = [cx * CELL_W, cy * CELL_H, (cx + 1) * CELL_W, (cy + 1) * CELL_H].map(function (v) { return v.toFixed(5); }).join(',');
    var url = VAYLA_WFS + '&TYPENAME=' + LAYERS[kind].type + '&BBOX=' + bbox + ',EPSG:4326';
    pending++; setStatus();
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      ingest(kind, j.features || []);
      loaded[key] = true;
      pending--; setStatus();
      onDataCbs.forEach(function (fn) { fn(LAYERS[kind].into || kind); });
    }).catch(function () {
      delete loaded[key];
      pending--; failed++; setStatus();
      setTimeout(function () { failed = Math.max(0, failed - 1); setStatus(); }, 8000);
    });
  }

  // ---------------- aluehaku reititystä varten ----------------
  // Automaattinen reititys tarvitsee navigointilinjat koko lähtö- ja määräpaikan väliseltä alueelta
  // zoomaustasosta riippumatta. Puuttuvat solut haetaan yhdellä pyynnöllä niiden yhteiseltä alueelta.
  // Jos palvelin katkaisee vastauksen (palautettuja vähemmän kuin osumia), alue jaetaan neljään osaan.
  function fetchBox(kind, bbox, depth) {
    var url = VAYLA_WFS + '&TYPENAME=' + LAYERS[kind].type + '&BBOX=' + bbox.map(function (v) { return v.toFixed(5); }).join(',') + ',EPSG:4326';
    pending++; setStatus();
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      pending--; setStatus();
      var feats = j.features || [];
      var total = j.totalFeatures != null ? Number(j.totalFeatures) : (j.numberMatched != null ? Number(j.numberMatched) : null);
      if (total != null && isFinite(total) && feats.length < total && depth < 4) {
        var mx = (bbox[0] + bbox[2]) / 2, my = (bbox[1] + bbox[3]) / 2;
        return Promise.all([[bbox[0], bbox[1], mx, my], [mx, bbox[1], bbox[2], my], [bbox[0], my, mx, bbox[3]], [mx, my, bbox[2], bbox[3]]]
          .map(function (b) { return fetchBox(kind, b, depth + 1); }));
      }
      ingest(kind, feats);
    }, function (e) {
      pending--; failed++; setStatus();
      setTimeout(function () { failed = Math.max(0, failed - 1); setStatus(); }, 8000);
      throw e;
    });
  }
  // Lataa navigointilinjat (myös muiden väylänpitäjien) ja väylät alueelta bounds. Palauttaa lupauksen.
  function loadRegion(bounds) {
    var kinds = ['navlines', 'navlines2', 'vaylat'];
    var cx0 = Math.floor(bounds.getWest() / CELL_W), cx1 = Math.floor(bounds.getEast() / CELL_W);
    var cy0 = Math.floor(bounds.getSouth() / CELL_H), cy1 = Math.floor(bounds.getNorth() / CELL_H);
    var jobs = [];
    kinds.forEach(function (kind) {
      var missing = [];
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var key = kind + ':' + cx + ':' + cy;
        if (loaded[key] === true) continue;
        missing.push({ cx: cx, cy: cy, key: key });
      }
      if (!missing.length) return;
      var mx0 = Infinity, mx1 = -Infinity, my0 = Infinity, my1 = -Infinity;
      missing.forEach(function (c) { mx0 = Math.min(mx0, c.cx); mx1 = Math.max(mx1, c.cx); my0 = Math.min(my0, c.cy); my1 = Math.max(my1, c.cy); });
      jobs.push(fetchBox(kind, [mx0 * CELL_W, my0 * CELL_H, (mx1 + 1) * CELL_W, (my1 + 1) * CELL_H], 0).then(function () {
        missing.forEach(function (c) { loaded[c.key] = true; });
      }));
    });
    return Promise.all(jobs).then(function () {
      vcache = null;
      onDataCbs.forEach(function (fn) { fn('navlines'); });
    });
  }
  // Navigointilinjat reititystä varten (Väyläviraston ja muiden väylänpitäjien linjat yhdessä).
  function navlineFeatures() {
    return Object.keys(store.navlines).map(function (id) { return store.navlines[id]; });
  }

  // ---------------- väylien suunnat ja kulkusyvyydet ----------------
  var labelLayer, lineLayer, aidLayer, signLayer, structLayer;

  function firstJnro(jnro) { return String(jnro == null ? '' : jnro).split(/\s+/)[0]; }
  function fairway(jnro) {
    var k = firstJnro(jnro);
    return store.vaylat[k] || store.vaylat[Number(k)] || null;
  }
  function fairwayClass(jnro) { var v = fairway(jnro); return v ? v.properties.vaylaluokkakoodi : null; }
  function fairwayName(jnro) { var v = fairway(jnro); return v ? v.properties.nimifi : ''; }

  // ---------------- kiinnitys väylän käännöspisteisiin ----------------
  // Väyläviraston navigointilinjat vastaavat ENC:n reittiviivoja (mitattu ero ≈ 1–2 m),
  // kun taas rasterikartan piirros voi poiketa niistä 5–20 m. Reittipiste kiinnitetään siksi
  // vektoriaineiston pisteeseen eikä rasterin kuvaan.
  var vcache = null, snapLayer = null, snapMarkersOn = false;
  function vertices() {
    if (vcache) return vcache;
    var seen = {}, out = [];
    Object.keys(store.navlines).forEach(function (id) {
      var f = store.navlines[id];
      lineCoords(f).forEach(function (c) {
        c.forEach(function (p) {
          var k = p[0].toFixed(6) + ',' + p[1].toFixed(6);
          if (seen[k]) return;
          seen[k] = 1;
          out.push({ lat: p[1], lng: p[0], jnro: firstJnro(f.properties.jnro) });
        });
      });
    });
    vcache = out;
    return out;
  }
  function snap(ll, tolV, tolL) {
    if (show.snap === false || map.getZoom() < LAYERS.navlines.minZoom) return null;
    tolV = tolV || 13; tolL = tolL == null ? 8 : tolL;
    var P = map.latLngToContainerPoint(ll);
    // Rajaus koordinaatteina ennen pikselilaskentaa, jotta haku pysyy nopeana laajallakin aineistolla.
    function box(tol) {
      var a = map.containerPointToLatLng([P.x - tol, P.y - tol]), b = map.containerPointToLatLng([P.x + tol, P.y + tol]);
      return { s: b.lat, n: a.lat, w: a.lng, e: b.lng };
    }
    var bx = box(tolV);
    var best = null, bd = tolV;
    vertices().forEach(function (v) {
      if (v.lat < bx.s || v.lat > bx.n || v.lng < bx.w || v.lng > bx.e) return;
      var Q = map.latLngToContainerPoint([v.lat, v.lng]);
      var d = Math.abs(Q.x - P.x) + Math.abs(Q.y - P.y) < tolV * 2 ? Math.hypot(Q.x - P.x, Q.y - P.y) : 1e9;
      if (d < bd) { bd = d; best = { lat: v.lat, lng: v.lng, kind: 'vertex', jnro: v.jnro }; }
    });
    if (best || !tolL) return best;
    bd = tolL; bx = box(tolL);
    Object.keys(store.navlines).forEach(function (id) {
      var f = store.navlines[id];
      lineCoords(f).forEach(function (c) {
        for (var i = 0; i < c.length - 1; i++) {
          var p0 = c[i], p1 = c[i + 1];
          if (Math.max(p0[1], p1[1]) < bx.s || Math.min(p0[1], p1[1]) > bx.n ||
              Math.max(p0[0], p1[0]) < bx.w || Math.min(p0[0], p1[0]) > bx.e) continue;
          var A = map.latLngToContainerPoint([c[i][1], c[i][0]]), B = map.latLngToContainerPoint([c[i + 1][1], c[i + 1][0]]);
          var vx = B.x - A.x, vy = B.y - A.y, len2 = vx * vx + vy * vy;
          if (!len2) continue;
          var t = Math.max(0, Math.min(1, ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2));
          var qx = A.x + vx * t, qy = A.y + vy * t;
          var d = Math.hypot(P.x - qx, P.y - qy);
          if (d < bd) {
            bd = d;
            var q = map.containerPointToLatLng([qx, qy]);
            best = { lat: q.lat, lng: q.lng, kind: 'line', jnro: firstJnro(f.properties.jnro) };
          }
        }
      });
    });
    return best;
  }
  function renderSnapMarkers() {
    if (!snapLayer) return;
    snapLayer.clearLayers();
    if (!snapMarkersOn || show.snap === false || map.getZoom() < 12) return;
    var b = map.getBounds().pad(0.05);
    vertices().forEach(function (v) {
      if (!b.contains([v.lat, v.lng])) return;
      L.circleMarker([v.lat, v.lng], {
        radius: 4, color: '#c2188b', weight: 1.6, fillColor: '#ffffff', fillOpacity: 0.9, interactive: false, pane: 'labelPane'
      }).addTo(snapLayer);
    });
  }

  // ---------------- kiinnitys turvalaitteisiin ----------------
  // Sivuutus- ja käännösetäisyyden kohde kiinnitetään Väyläviraston turvalaiterekisterin
  // sijaintiin (vastaa ENC:tä) eikä rasterikartan symboliin, joka voi olla 5–20 m sivussa.
  var aidSnapLayer = null, aidSnapOn = false;
  function aidPos(f) {
    var g = f && f.geometry;
    if (!g) return null;
    var c = g.type === 'MultiPoint' ? g.coordinates[0] : g.coordinates;
    return c && isFinite(c[0]) && isFinite(c[1]) ? c : null;
  }
  function aidKind(p) {
    var PRE = { 1: 'vasen ', 2: 'oikea ', 3: 'pohjois', 4: 'etelä', 5: 'länsi', 6: 'itä' };
    var t = (p.turvalaitetyyppifi || 'turvalaite').toLowerCase();
    var n = p.navigointilajikoodi;
    if (PRE[n] && (t === 'viitta' || t === 'poiju')) return PRE[n] + t;
    if (NAVL[n] && n >= 7) return t + ', ' + NAVL[n];
    return t;
  }
  function aidTol() {
    // Rasterikartan symboli on tasolla 15 noin 20 px korkea ja kasvaa suurennettaessa.
    var z = map.getZoom();
    return Math.max(16, Math.min(90, 20 * Math.pow(2, z - 15)));
  }
  function snapAid(ll, tol) {
    if (show.snap === false || map.getZoom() < LAYERS.aids.minZoom) return null;
    tol = tol || aidTol();
    var P = map.latLngToContainerPoint(ll);
    var a = map.containerPointToLatLng([P.x - tol, P.y - tol]), b = map.containerPointToLatLng([P.x + tol, P.y + tol]);
    var best = null, bd = tol;
    Object.keys(store.aids).forEach(function (id) {
      var f = store.aids[id], c = aidPos(f);
      if (!c || c[1] < b.lat || c[1] > a.lat || c[0] < a.lng || c[0] > b.lng) return;
      var Q = map.latLngToContainerPoint([c[1], c[0]]);
      var d = Math.hypot(Q.x - P.x, Q.y - P.y);
      if (d < bd) {
        bd = d;
        var p = f.properties || {};
        best = { lat: c[1], lng: c[0], kind: 'aid', id: p.id != null ? p.id : f.id, name: p.nimifi || '', type: aidKind(p), nro: p.turvalaitenumero || '' };
      }
    });
    return best;
  }
  function renderAidSnapMarkers() {
    if (!aidSnapLayer) return;
    aidSnapLayer.clearLayers();
    if (!aidSnapOn || show.snap === false || map.getZoom() < LAYERS.aids.minZoom) return;
    var b = map.getBounds().pad(0.05);
    Object.keys(store.aids).forEach(function (id) {
      var c = aidPos(store.aids[id]);
      if (!c || !b.contains([c[1], c[0]])) return;
      L.circleMarker([c[1], c[0]], {
        radius: 5, color: '#c2188b', weight: 1.8, fillColor: '#ffffff', fillOpacity: 0.35, interactive: false, pane: 'labelPane'
      }).addTo(aidSnapLayer);
    });
  }

  function lineCoords(f) {
    var g = f.geometry;
    if (!g) return [];
    if (g.type === 'LineString') return [g.coordinates];
    if (g.type === 'MultiLineString') return g.coordinates;
    return [];
  }

  function angDiff(a, b) { var d = Math.abs(G.norm360(a) - G.norm360(b)); return d > 180 ? 360 - d : d; }

  // Linjataulujen linjat kuten ENC:ssä (S-52 NAVLNE): ohut katkoviiva, joka jatkuu väylän linjaosuuden
  // päästä taulujen kautta, ja linjan tosisuunta merkittynä linjan ulommaiseen päähän ("055,5°").
  // Navigointilinja piirretään yhtenäisenä sen päälle, joten väylällä näkyy yhtenäinen viiva ja
  // väylän ulkopuolella katkoviiva.
  function renderLeadingLines(view, z) {
    if (!(show.lines || vecOn()) || z < LAYERS.taulu.minZoom) return;
    Object.keys(store.taulu).forEach(function (id) {
      var f = store.taulu[id], p = f.properties || {};
      var parts = lineCoords(f);
      if (!parts.length) return;
      // MultiLineString sisältää saman linjan kahdesti: piirretään vain ensimmäinen osa
      var coords = parts[0];
      var ll = coords.map(function (c) { return L.latLng(c[1], c[0]); });
      if (ll.length < 2 || !view.intersects(L.latLngBounds(ll))) return;
      L.polyline(ll, { color: '#1b1b1b', weight: 1.1, opacity: 0.9, dashArray: '7 5', interactive: false }).addTo(lineLayer);
      var brg = parseFloat(String(p.suunta == null ? '' : p.suunta).replace(',', '.'));
      if (!isFinite(brg) || z < 12) return;
      // merkintä linjan ulommaiseen päähän (taulut ovat linjan alkupäässä), 25 % matkaa päästä sisäänpäin
      var A = map.latLngToLayerPoint(ll[ll.length - 2]), B = map.latLngToLayerPoint(ll[ll.length - 1]);
      var len = A.distanceTo(B);
      if (len < 40) return;
      var t = Math.max(0.5, 1 - 60 / len);
      var mid = L.latLng(ll[ll.length - 2].lat + (ll[ll.length - 1].lat - ll[ll.length - 2].lat) * t, ll[ll.length - 2].lng + (ll[ll.length - 1].lng - ll[ll.length - 2].lng) * t);
      if (!view.contains(mid)) return;
      var theta = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
      if (theta > 90 || theta < -90) theta += 180;
      var html = '<div class="fw-lab" style="transform:translate(-50%,-50%) rotate(' + theta.toFixed(1) + 'deg) translateY(-9px)"><span class="fw-b ll">' + G.fmtBrg(brg, 1) + '</span></div>';
      L.marker(mid, { icon: L.divIcon({ className: 'fw-anchor', html: html, iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' }).addTo(labelLayer);
    });
  }

  function renderFairways() {
    labelLayer.clearLayers();
    lineLayer.clearLayers();
    var z = map.getZoom();
    if (z < LAYERS.navlines.minZoom) return;
    var view = map.getBounds().pad(0.05);
    renderLeadingLines(view, z);
    var minPx = z >= 14 ? 120 : z >= 13 ? 140 : 170;
    // Merkintä siirretään väylälinjan viereen kohtisuoraan linjaa vastaan (ei linjan päälle).
    // Rasterin viiva paksunee suurennettaessa, joten etäisyys kasvaa tasoilla 16–17.
    // Väyläviraston linja voi olla rasterin viivasta 5–15 m sivussa, joten väli kasvaa lähemmäs zoomattaessa.
    var off = 9 + 5 * Math.pow(2, Math.min(z, MAX_CHART_Z) - 15);
    Object.keys(store.navlines).forEach(function (id) {
      var f = store.navlines[id];
      var p = f.properties || {};
      var cls = fairwayClass(p.jnro);
      lineCoords(f).forEach(function (coords) {
        var ll = coords.map(function (c) { return L.latLng(c[1], c[0]); });
        if (!ll.length) return;
        var bb = L.latLngBounds(ll);
        if (!view.intersects(bb)) return;
        if (show.lines || vecOn()) {
          L.polyline(ll, {
            color: '#1b1b1b', weight: 1.6, opacity: 0.85, interactive: false,
            dashArray: cls && cls >= 3 ? '7 5' : null
          }).addTo(lineLayer);
        }
        // pisin osuus kulkusyvyyden paikaksi
        var segs = [], longest = -1, longestLen = 0;
        for (var i = 0; i < ll.length - 1; i++) {
          var a = map.latLngToLayerPoint(ll[i]), b = map.latLngToLayerPoint(ll[i + 1]);
          var len = a.distanceTo(b);
          segs.push({ a: a, b: b, la: ll[i], lb: ll[i + 1], len: len });
          if (len > longestLen) { longestLen = len; longest = i; }
        }
        segs.forEach(function (s, i) {
          var mid = L.latLng((s.la.lat + s.lb.lat) / 2, (s.la.lng + s.lb.lng) / 2);
          if (!view.contains(mid)) return;
          var showB = show.bearings && s.len >= minPx;
          var showD = show.depths && i === longest && p.mitoitussyvays != null && s.len >= 60;
          if (!showB && !showD) return;
          var b0 = G.bearing({ lat: s.la.lat, lng: s.la.lng }, { lat: s.lb.lat, lng: s.lb.lng });
          var official = false;
          if (p.tosisuunta != null && ll.length === 2) {
            if (angDiff(p.tosisuunta, b0) < 2) { b0 = p.tosisuunta; official = true; }
            else if (angDiff(p.tosisuunta + 180, b0) < 2) { b0 = G.norm360(p.tosisuunta + 180); official = true; }
          }
          var theta = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180 / Math.PI;
          var flipped = false;
          if (theta > 90 || theta < -90) { theta += 180; flipped = true; }
          var fwd = G.fmtBrg(b0, 1), rev = G.fmtBrg(b0 + 180, 1);
          var left = flipped ? fwd : rev, right = flipped ? rev : fwd;
          var html = '<div class="fw-lab" style="transform:translate(-50%,-50%) rotate(' + theta.toFixed(1) + 'deg) translateY(-' + off + 'px)">';
          if (showB) html += '<span class="fw-b' + (official ? ' off' : '') + '">◂ ' + left + '</span>';
          if (showD) html += '<span class="fw-d">' + G.fmtNum(p.mitoitussyvays, 1) + ' m</span>';
          if (showB) html += '<span class="fw-b' + (official ? ' off' : '') + '">' + right + ' ▸</span>';
          html += '</div>';
          L.marker(mid, {
            icon: L.divIcon({ className: 'fw-anchor', html: html, iconSize: [0, 0] }),
            interactive: false, keyboard: false, pane: 'labelPane'
          }).addTo(labelLayer);
        });
      });
    });
  }

  // ---------------- loistot, valosektorit ja nopeusrajoitusalueet (Väylävirasto) ----------------
  // Sektorin kulmat ovat loistoluettelon tapaan suuntia merelle päin katsottuna kohti loistoa,
  // joten loistosta katsottuna sektori on vastakkaiseen suuntaan (+180°).
  var lightLayer = null, speedLayer = null;
  function lightPos(f) {
    var g = f && f.geometry; if (!g) return null;
    var c = g.type === 'MultiPoint' ? g.coordinates[0] : g.coordinates;
    return c ? L.latLng(c[1], c[0]) : null;
  }
  // Valosektorit turvalaitteen kentästä valosektorien_tiedot, esim. "Alkukulma: 136, Loppukulma: 223, Väri: vi".
  function parseSectors(txt) {
    var out = [], m, re = /Alkukulma:\s*(-?\d+(?:[.,]\d+)?)\s*,\s*Loppukulma:\s*(-?\d+(?:[.,]\d+)?)\s*,\s*V[äa]ri:\s*([A-Za-zÄäÖö]+)/g;
    while ((m = re.exec(String(txt || '')))) out.push({ a0: parseFloat(m[1].replace(',', '.')), a1: parseFloat(m[2].replace(',', '.')), c: m[3].toLowerCase() });
    return out;
  }
  // Kaikki valot yhteen: valaistut turvalaitteet (myös apuloistot ja muiden väylänpitäjien laitteet)
  // sekä loistorekisterin loistot. Sama laite tunnistetaan turvalaitenumerosta.
  function collectLights() {
    var lights = {}, byLoisto = {};
    Object.keys(store.sectors).forEach(function (id) {
      var p = store.sectors[id].properties || {};
      (byLoisto[p.loisto] = byLoisto[p.loisto] || []).push({ a0: Number(p.alkukulma), a1: Number(p.loppukulma), c: String(p.vari || '').toLowerCase() });
    });
    Object.keys(store.aids).forEach(function (id) {
      var f = store.aids[id], p = f.properties || {};
      if (p.valaistu !== 'K') return;
      var c = f.geometry && (f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry.coordinates);
      if (!c) return;
      var key = p.turvalaitenumero ? 'T' + p.turvalaitenumero : 'A' + id;
      lights[key] = { ll: L.latLng(c[1], c[0]), sectors: parseSectors(p.valosektorien_tiedot), label: null, aid: true };
    });
    Object.keys(store.lights).forEach(function (id) {
      var f = store.lights[id], p = f.properties || {}, ll = lightPos(f);
      if (!ll) return;
      var key = p.turvalaitenumero ? 'T' + p.turvalaitenumero : 'L' + id;
      var li = lights[key] || (lights[key] = { ll: ll, sectors: [], label: null, aid: false });
      if (!li.sectors.length && byLoisto[p.id]) li.sectors = byLoisto[p.id];
      li.label = p.viralvalotunnuse || p.virallvalotunnus || null;
    });
    return lights;
  }
  function renderLights() {
    if (!lightLayer) return;
    lightLayer.clearLayers();
    var z = map.getZoom();
    if (!lightsOn() || z < LAYERS.lights.minZoom) return;
    var CS = global.ChartSymbols, view = map.getBounds().pad(0.2);
    // Sektorikaaret ja sektorirajat kuten ENC:ssä (S-52 LIGHTS05): kaari 20 mm ja rajaviivat 25 mm
    // näytöllä zoomaustasosta riippumatta. Kauempaa (tasot 11–12) ja kapealla näytöllä hieman pienempinä.
    var MM = 96 / 25.4, scale = (z >= 13 ? 1 : 0.65) * (map.getSize().x < 700 ? 0.8 : 1);
    var R = Math.round(20 * MM * scale), RLEG = Math.round(25 * MM * scale);
    var aidsDrawn = (show.aids || vecOn()) && z >= LAYERS.aids.minZoom;
    function px(ll, brg, r) {
      var P = map.latLngToContainerPoint(ll), a = brg * Math.PI / 180;
      return map.containerPointToLatLng([P.x + Math.sin(a) * r, P.y - Math.cos(a) * r]);
    }
    var lights = collectLights();
    Object.keys(lights).forEach(function (key) {
      var li = lights[key], ll = li.ll;
      if (!view.contains(ll)) return;
      var secs = li.sectors.filter(function (s) { return isFinite(s.a0) && isFinite(s.a1); });
      // sektorikaaret: kulmat ovat merelle päin katsottuja suuntimia valoon, joten kaari piirretään +180°
      secs.forEach(function (sc) {
        if (((sc.a1 - sc.a0) % 360 + 360) % 360 === 0) {
          // ympäri näkyvä valo: valon värinen kehä (sädekehä) loiston ympärille, pienempi kuin sektorikaaret
          var rr = Math.round(R * 0.3), ring = [];
          for (var q = 0; q <= 360; q += 6) ring.push(px(ll, q, rr));
          L.polyline(ring, { color: '#3a3a3a', weight: 6, opacity: 0.5, interactive: false, pane: 'flarePane' }).addTo(lightLayer);
          L.polyline(ring, { color: CS.lightColour(sc.c), weight: 4, opacity: 1, interactive: false, pane: 'flarePane', className: 'light-ring' }).addTo(lightLayer);
          return;
        }
        var s0 = sc.a0 + 180, s1 = sc.a1 + 180;
        if (s1 <= s0) s1 += 360;
        var pts = [];
        for (var b = s0; b < s1; b += 3) pts.push(px(ll, b, R));
        pts.push(px(ll, s1, R));
        L.polyline(pts, { color: '#3a3a3a', weight: 7, opacity: 0.5, interactive: false, lineCap: 'butt', pane: 'flarePane' }).addTo(lightLayer);
        L.polyline(pts, { color: CS.lightColour(sc.c), weight: 5, opacity: 1, interactive: false, lineCap: 'butt', pane: 'flarePane' }).addTo(lightLayer);
        [s0, s1].forEach(function (bb) {
          L.polyline([ll, px(ll, bb, RLEG)], { color: '#333', weight: 1, dashArray: '3 3', opacity: 0.85, interactive: false, pane: 'flarePane' }).addTo(lightLayer);
        });
      });
      // valon pisara jokaisella valolla (myös ympäri näkyvät loistot ja apuloistot), yksi kutakin väriä
      var cols = [];
      secs.forEach(function (sc) { if (cols.indexOf(sc.c) < 0) cols.push(sc.c); });
      if (!cols.length) cols = ['v'];
      cols.forEach(function (c, i) {
        var a = 135 + (i - (cols.length - 1) / 2) * 34;
        L.marker(ll, { icon: CS.icon(CS.flare(c, a), 'flare-ico'), interactive: false, keyboard: false, pane: 'flarePane' }).addTo(lightLayer);
      });
      // valon asemamerkki, jos turvalaitetta ei piirretä muuten
      if (!li.aid || !aidsDrawn) L.marker(ll, { icon: CS.icon(CS.lightStructure(), 'aid-ico'), interactive: false, keyboard: false, pane: 'aidPane' }).addTo(lightLayer);
      if (z >= 13 && li.label) {
        L.marker(ll, {
          icon: L.divIcon({ className: 'lt-ico', html: '<span class="lt-lab">' + escapeHtml(li.label) + '</span>', iconSize: [0, 0] }),
          interactive: false, keyboard: false, pane: 'labelPane'
        }).addTo(lightLayer);
      }
    });
  }
  function renderSpeed() {
    if (!speedLayer) return;
    speedLayer.clearLayers();
    var z = map.getZoom();
    if (!speedOn() || z < LAYERS.speed.minZoom) return;
    var view = map.getBounds().pad(0.1);
    Object.keys(store.speed).forEach(function (id) {
      var f = store.speed[id], g = f.geometry, p = f.properties || {};
      if (!g) return;
      var layer = L.geoJSON(g, { style: { color: '#7b3fa6', weight: 1.6, dashArray: '6 4', fill: false, interactive: false } });
      var b = layer.getBounds();
      if (!b.isValid() || !view.intersects(b)) return;
      layer.addTo(speedLayer);
      if (z >= 13 && p.suuruus) {
        var c = b.getCenter();
        if (map.getBounds().contains(c)) L.marker(c, {
          icon: L.divIcon({ className: 'spd-ico', html: '<span class="spd-lab">' + escapeHtml(String(p.suuruus)) + ' km/h</span>', iconSize: [0, 0] }),
          interactive: false, keyboard: false, pane: 'labelPane'
        }).addTo(speedLayer);
      }
    });
  }

  // ---------------- Maanmittauslaitoksen kivet, karikot ja nimistö (API-avain) ----------------
  // Avoin OGC API Features -palvelu vaatii maksuttoman API-avaimen. Kokoelmien tunnukset haetaan
  // palvelusta, jotta nimet eivät ole kovakoodattuja arvauksia.
  var MML_TOPO = 'https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1';
  var MML_NAMES = 'https://avoin-paikkatieto.maanmittauslaitos.fi/geographic-names/features/v1';
  var mmlKey = '', mmlCols = null, mmlColsErr = '', mmlStore = { rock: {}, rocks: {}, shoal: {}, name: {} }, mmlLoaded = {}, mmlLayer = null;
  var MML_CELL = { w: 0.05, h: 0.025 };
  // Verkkoversiossa (https) kutsut kulkevat sovelluksen oman välityspalvelun kautta (/api/mml), joka lisää
  // palvelimelle tallennetun API-avaimen; käyttäjän ei tarvitse hankkia omaa avainta. Käyttäjän oma avain
  // ja tiedostona avattu sovellus kutsuvat Maanmittauslaitosta suoraan.
  var MML_HOST = 'https://avoin-paikkatieto.maanmittauslaitos.fi';
  var mmlProxy = /^https?:$/.test(global.location.protocol), mmlProxyOk = null, mmlNameErr = '';
  function mmlAvailable() { return !!mmlKey || (mmlProxy && mmlProxyOk !== false); }
  // Sanallinen syy, miksi paikannimihaku ei toimi (näytetään hakutulosten alla), tai tyhjä.
  function namesNote() {
    if (mmlKey) return mmlNameErr;
    if (!mmlProxy) return 'Paikannimet haetaan Maanmittauslaitoksen nimistöstä, kun API-avain on asetettu (Tiedosto → Asetukset).';
    if (mmlProxyOk === false) return 'Paikannimihaku ei ole käytettävissä: palvelimella ei ole Maanmittauslaitoksen avainta (Vercelin ympäristömuuttuja MML_API_KEY puuttuu tästä julkaisusta). Oman avaimen voi antaa kohdassa Tiedosto → Asetukset.';
    return mmlNameErr;
  }
  function mmlUrl(base, path, extra) {
    if (!mmlKey && mmlProxy) return '/api/mml?p=' + encodeURIComponent(base.replace(MML_HOST, '') + path) + '&f=json' + (extra || '');
    return base + path + (path.indexOf('?') < 0 ? '?' : '&') + 'f=json&api-key=' + encodeURIComponent(mmlKey) + (extra || '');
  }
  function mmlStatus(t) { if (statusEl && t) { statusEl.textContent = t; statusEl.className = 'net err'; setTimeout(setStatus, 8000); } }
  function mmlDiscover() {
    if (mmlCols || !mmlAvailable()) return Promise.resolve(mmlCols);
    var viaProxy = !mmlKey;
    return fetch(mmlUrl(MML_TOPO, '/collections')).then(function (r) {
      if (viaProxy && (r.status === 503 || r.status === 404 || r.status === 405)) { mmlProxyOk = false; throw new Error('palvelin'); }
      if (r.status === 401 || r.status === 403) throw new Error('avain');
      if (viaProxy) mmlProxyOk = true;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var ids = (j.collections || []).map(function (c) { return c.id; });
      function find(re) { return ids.filter(function (id) { return re.test(id); })[0] || null; }
      mmlCols = { rock: find(/^vesikivi$/i) || find(/vesikivi(?!kko)/i), rocks: find(/vesikivikko/i), shoal: find(/matalikko/i),
        pier: find(/^pistolaituriviiva$/i), breakwater: find(/^aallonmurtaja$/i) };
      return mmlCols;
    }).catch(function (e) {
      mmlColsErr = e.message === 'avain' ? (viaProxy ? 'Palvelimen Maanmittauslaitoksen API-avain ei kelpaa' : 'Maanmittauslaitoksen API-avain ei kelpaa')
        : e.message === 'palvelin' ? '' : 'Maanmittauslaitoksen rajapintaan ei saada yhteyttä';
      if (mmlColsErr) mmlStatus(mmlColsErr);
      mmlCols = null;
      throw e;
    });
  }
  function mmlWanted() { return mmlAvailable() && vecOn() && map.getZoom() >= 13 && show.mml !== false; }
  function loadMml() {
    if (!mmlWanted()) return;
    var bb = map.getBounds().pad(0.1);
    var cx0 = Math.floor(bb.getWest() / MML_CELL.w), cx1 = Math.floor(bb.getEast() / MML_CELL.w);
    var cy0 = Math.floor(bb.getSouth() / MML_CELL.h), cy1 = Math.floor(bb.getNorth() / MML_CELL.h);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 40) return;
    mmlDiscover().then(function (cols) {
      if (!cols) return;
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var key = cx + ':' + cy;
        if (mmlLoaded[key]) continue;
        mmlLoaded[key] = 'pending';
        (function (key, cx, cy) {
          var bbox = '&bbox=' + [cx * MML_CELL.w, cy * MML_CELL.h, (cx + 1) * MML_CELL.w, (cy + 1) * MML_CELL.h].map(function (v) { return v.toFixed(5); }).join(',') + '&limit=2000';
          var jobs = [];
          ['rock', 'rocks', 'shoal'].forEach(function (k) {
            if (!cols[k]) return;
            jobs.push(fetch(mmlUrl(MML_TOPO, '/collections/' + cols[k] + '/items', bbox)).then(function (r) { return r.ok ? r.json() : { features: [] }; })
              .then(function (j) { (j.features || []).forEach(function (f, i) { mmlStore[k][f.id != null ? f.id : key + ':' + i] = f; }); }));
          });
          if (landKind === 'osm') {
            jobs.push(fetch(mmlUrl(MML_NAMES, '/collections/placenames_simple/items', bbox)).then(function (r) { return r.ok ? r.json() : { features: [] }; })
              .then(function (j) { (j.features || []).forEach(function (f, i) { mmlStore.name[f.id != null ? f.id : key + ':' + i] = f; }); }));
          }
          Promise.all(jobs).then(function () { mmlLoaded[key] = true; renderMml(); }, function () { delete mmlLoaded[key]; });
        })(key, cx, cy);
      }
    }, function () { /* virhe näytetty tilarivillä */ });
  }
  function mmlProp(p, keys) { for (var i = 0; i < keys.length; i++) if (p[keys[i]] != null && p[keys[i]] !== '') return p[keys[i]]; return null; }
  // Maastotietokannan vesikivet (kohdeluokka) Suomen merikarttojen merkeillä (ks. symbols.js):
  // 38511 vedenalainen ⊤, 38512 vedenpinnassa +, 38513 vedenpäällinen ⊥.
  var ROCK_LEVEL = { 38511: 'under', 38512: 'awash', 38513: 'above' };
  // Vesikivikko (38600) ja matalikko (38700) ovat alueita: ne rajataan mustalla pisteviivalla
  // (vaarakäyrä, kuten selitteen "Vaikeakulkuinen alue"), ja kivikkoon lisätään kivikkomerkki.
  var DANGER_AREA = { color: '#111', weight: 1.2, dashArray: '1 3.2', lineCap: 'round', fillColor: '#9fcaee', fillOpacity: 0.45, interactive: false };
  function renderMml() {
    if (!mmlLayer) return;
    mmlLayer.clearLayers();
    if (!mmlWanted()) return;
    var view = map.getBounds().pad(0.05);
    var CS = global.ChartSymbols;
    ['shoal', 'rocks'].forEach(function (k) {
      Object.keys(mmlStore[k]).forEach(function (id) {
        var f = mmlStore[k][id];
        if (!f || !f.geometry) return;
        if (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint') {
          var pc = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0];
          if (k === 'rocks' && view.contains([pc[1], pc[0]])) L.marker([pc[1], pc[0]], { icon: CS.icon(CS.rock('under', true), 'rk-ico'), interactive: false, keyboard: false, pane: 'aidPane' }).addTo(mmlLayer);
          return;
        }
        var lay = L.geoJSON(f.geometry, { style: DANGER_AREA });
        var b = lay.getBounds();
        if (!b.isValid() || !view.intersects(b)) return;
        lay.addTo(mmlLayer);
        if (k === 'rocks') {
          var c = b.getCenter(), P0 = map.latLngToContainerPoint(b.getSouthWest()), P1 = map.latLngToContainerPoint(b.getNorthEast());
          if (Math.abs(P1.x - P0.x) > 18 && Math.abs(P1.y - P0.y) > 14 && view.contains(c))
            L.marker(c, { icon: CS.icon(CS.rock('under', true), 'rk-ico'), interactive: false, keyboard: false, pane: 'aidPane' }).addTo(mmlLayer);
        }
      });
    });
    var n = 0;
    Object.keys(mmlStore.rock).forEach(function (id) {
      var f = mmlStore.rock[id], g = f.geometry;
      if (!g || n > 3000) return;
      var c = g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : null;
      if (!c || !view.contains([c[1], c[0]])) return;
      var cls = Number(mmlProp(f.properties || {}, ['kohdeluokka', 'kohdeluokkakoodi', 'luokka'])) || 38511;
      n++;
      L.marker([c[1], c[0]], {
        icon: CS.icon(CS.rock(ROCK_LEVEL[cls] || 'under', false), 'rk-ico'),
        interactive: false, keyboard: false, pane: 'aidPane'
      }).addTo(mmlLayer);
    });
    if (landKind === 'osm') {
      var grid = {}, cell = 70;
      Object.keys(mmlStore.name).forEach(function (id) {
        var f = mmlStore.name[id], g = f.geometry;
        if (!g) return;
        var c = g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : null;
        if (!c || !view.contains([c[1], c[0]])) return;
        var p = f.properties || {}, nm = mmlProp(p, ['spelling', 'name', 'nimi', 'text', 'kirjoitusasu']);
        if (!nm || typeof nm !== 'string') return;
        var P = map.latLngToContainerPoint([c[1], c[0]]), gk = Math.floor(P.x / cell) + ':' + Math.floor(P.y / (cell / 3));
        if (grid[gk]) return; grid[gk] = 1;
        L.marker([c[1], c[0]], {
          icon: L.divIcon({ className: 'nm-ico', html: '<span class="nm-lab">' + escapeHtml(nm) + '</span>', iconSize: [0, 0] }),
          interactive: false, keyboard: false, pane: 'labelPane'
        }).addTo(mmlLayer);
      });
    }
  }
  // Paikannimihaku nimistörekisteristä (Maanmittauslaitoksen dokumentoima parametri spelling_case_insensitive,
  // jokerimerkki * ja aluerajaus bbox). Samannimisiä paikkoja on Suomessa paljon, joten haetaan ensin
  // hakupisteen ympäriltä (noin 50 km) ja sitten koko maasta; tulokset yhdistetään ja järjestetään etäisyyden mukaan.
  // Kuntanumerot nimiksi (Tilastokeskus, Kunnat 2025). Nimistöpalvelu antaa kunnan ja paikkatyypin koodeina.
  var KUNTA = {};
  '020:Akaa;005:Alajärvi;009:Alavieska;010:Alavus;016:Asikkala;018:Askola;019:Aura;035:Brändö;043:Eckerö;046:Enonkoski;047:Enontekiö;049:Espoo;050:Eura;051:Eurajoki;052:Evijärvi;060:Finström;061:Forssa;062:Föglö;065:Geta;069:Haapajärvi;071:Haapavesi;072:Hailuoto;074:Halsua;075:Hamina;076:Hammarland;077:Hankasalmi;078:Hanko;079:Harjavalta;081:Hartola;082:Hattula;086:Hausjärvi;111:Heinola;090:Heinävesi;091:Helsinki;097:Hirvensalmi;098:Hollola;102:Huittinen;103:Humppila;105:Hyrynsalmi;106:Hyvinkää;108:Hämeenkyrö;109:Hämeenlinna;139:Ii;140:Iisalmi;142:Iitti;143:Ikaalinen;145:Ilmajoki;146:Ilomantsi;153:Imatra;148:Inari;149:Inkoo;151:Isojoki;152:Isokyrö;165:Janakkala;167:Joensuu;169:Jokioinen;170:Jomala;171:Joroinen;172:Joutsa;176:Juuka;177:Juupajoki;178:Juva;179:Jyväskylä;181:Jämijärvi;182:Jämsä;186:Järvenpää;202:Kaarina;204:Kaavi;205:Kajaani;208:Kalajoki;211:Kangasala;213:Kangasniemi;214:Kankaanpää;216:Kannonkoski;217:Kannus;218:Karijoki;224:Karkkila;226:Karstula;230:Karvia;231:Kaskinen;232:Kauhajoki;233:Kauhava;235:Kauniainen;236:Kaustinen;239:Keitele;240:Kemi;320:Kemijärvi;241:Keminmaa;322:Kemiönsaari;244:Kempele;245:Kerava;249:Keuruu;250:Kihniö;256:Kinnula;257:Kirkkonummi;260:Kitee;261:Kittilä;263:Kiuruvesi;265:Kivijärvi;271:Kokemäki;272:Kokkola;273:Kolari;275:Konnevesi;276:Kontiolahti;280:Korsnäs;284:Koski Tl;285:Kotka;286:Kouvola;287:Kristiinankaupunki;288:Kruunupyy;290:Kuhmo;291:Kuhmoinen;295:Kumlinge;297:Kuopio;300:Kuortane;301:Kurikka;304:Kustavi;305:Kuusamo;312:Kyyjärvi;316:Kärkölä;317:Kärsämäki;318:Kökar;398:Lahti;399:Laihia;400:Laitila;407:Lapinjärvi;402:Lapinlahti;403:Lappajärvi;405:Lappeenranta;408:Lapua;410:Laukaa;416:Lemi;417:Lemland;418:Lempäälä;420:Leppävirta;421:Lestijärvi;422:Lieksa;423:Lieto;425:Liminka;426:Liperi;444:Lohja;430:Loimaa;433:Loppi;434:Loviisa;435:Luhanka;436:Lumijoki;438:Lumparland;440:Luoto;441:Luumäki;475:Maalahti;478:Maarianhamina;480:Marttila;481:Masku;483:Merijärvi;484:Merikarvia;489:Miehikkälä;491:Mikkeli;494:Muhos;495:Multia;498:Muonio;499:Mustasaari;500:Muurame;503:Mynämäki;504:Myrskylä;505:Mäntsälä;508:Mänttä-Vilppula;507:Mäntyharju;529:Naantali;531:Nakkila;535:Nivala;536:Nokia;538:Nousiainen;541:Nurmes;543:Nurmijärvi;545:Närpiö;560:Orimattila;561:Oripää;562:Orivesi;563:Oulainen;564:Oulu;309:Outokumpu;576:Padasjoki;577:Paimio;578:Paltamo;445:Parainen;580:Parikkala;581:Parkano;599:Pedersören kunta;583:Pelkosenniemi;854:Pello;584:Perho;592:Petäjävesi;593:Pieksämäki;595:Pielavesi;598:Pietarsaari;601:Pihtipudas;604:Pirkkala;607:Polvijärvi;608:Pomarkku;609:Pori;611:Pornainen;638:Porvoo;614:Posio;615:Pudasjärvi;616:Pukkila;619:Punkalaidun;620:Puolanka;623:Puumala;624:Pyhtää;625:Pyhäjoki;626:Pyhäjärvi;630:Pyhäntä;631:Pyhäranta;635:Pälkäne;636:Pöytyä;678:Raahe;710:Raasepori;680:Raisio;681:Rantasalmi;683:Ranua;684:Rauma;686:Rautalampi;687:Rautavaara;689:Rautjärvi;691:Reisjärvi;694:Riihimäki;697:Ristijärvi;698:Rovaniemi;700:Ruokolahti;702:Ruovesi;704:Rusko;707:Rääkkylä;729:Saarijärvi;732:Salla;734:Salo;736:Saltvik;790:Sastamala;738:Sauvo;739:Savitaipale;740:Savonlinna;742:Savukoski;743:Seinäjoki;746:Sievi;747:Siikainen;748:Siikajoki;791:Siikalatva;749:Siilinjärvi;751:Simo;753:Sipoo;755:Siuntio;758:Sodankylä;759:Soini;761:Somero;762:Sonkajärvi;765:Sotkamo;766:Sottunga;768:Sulkava;771:Sund;777:Suomussalmi;778:Suonenjoki;781:Sysmä;783:Säkylä;831:Taipalsaari;832:Taivalkoski;833:Taivassalo;834:Tammela;837:Tampere;844:Tervo;845:Tervola;846:Teuva;848:Tohmajärvi;849:Toholampi;850:Toivakka;851:Tornio;853:Turku;857:Tuusniemi;858:Tuusula;859:Tyrnävä;886:Ulvila;887:Urjala;889:Utajärvi;890:Utsjoki;892:Uurainen;893:Uusikaarlepyy;895:Uusikaupunki;785:Vaala;905:Vaasa;908:Valkeakoski;092:Vantaa;915:Varkaus;918:Vehmaa;921:Vesanto;922:Vesilahti;924:Veteli;925:Vieremä;927:Vihti;931:Viitasaari;934:Vimpeli;935:Virolahti;936:Virrat;941:Vårdö;946:Vöyri;976:Ylitornio;977:Ylivieska;980:Ylöjärvi;981:Ypäjä;989:Ähtäri;992:Äänekoski'.split(';').forEach(function (x) { var i = x.indexOf(':'); KUNTA[x.slice(0, i)] = x.slice(i + 1); });
  function namePlace(f) {
    var g = f.geometry, c = g && (g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : null);
    var p = f.properties || {};
    var nm = mmlProp(p, ['spelling', 'name', 'nimi', 'text', 'kirjoitusasu']);
    if (!c || !nm) return null;
    var words = function (v) { return typeof v === 'string' && /[a-zåäö]/i.test(v) ? v : null; };
    var type = words(mmlProp(p, ['placeTypeDescription', 'placeTypeName', 'placeTypeDescriptionFi', 'paikkatyyppi']));
    var muni = words(mmlProp(p, ['municipalityName', 'municipalityNameFi', 'kuntanimi', 'kunta'])) || KUNTA[String(p.municipality || '').padStart(3, '0')] || null;
    return { id: f.id, name: String(nm), info: [type, muni].filter(Boolean).join(', ') || 'paikannimi', lat: c[1], lng: c[0], kind: 'name' };
  }
  function searchNames(q, center) {
    if (!mmlAvailable()) return Promise.resolve([]);
    var word = q.trim().replace(/[*?,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!word) return Promise.resolve([]);
    var path = '/collections/placenames_simple/items';
    // nimen alku (viitas* → Viitasaari, Viitasalmi); lähialueelta myös nimen keskeltä (*salmi* → Viitasalmi)
    var like = '&spelling_case_insensitive=' + encodeURIComponent(word + '*');
    var inner = '&spelling_case_insensitive=' + encodeURIComponent('*' + word + '*');
    var urls = [];
    if (center) {
      var dLat = 0.45, dLon = 0.45 / Math.cos(center.lat * Math.PI / 180);      // noin 50 km joka suuntaan
      var bb = [center.lng - dLon, center.lat - dLat, center.lng + dLon, center.lat + dLat].map(function (v) { return v.toFixed(4); }).join(',');
      urls.push(mmlUrl(MML_NAMES, path, '&limit=60&bbox=' + bb + like));
      if (word.length >= 3) urls.push(mmlUrl(MML_NAMES, path, '&limit=40&bbox=' + bb + inner));
    }
    urls.push(mmlUrl(MML_NAMES, path, '&limit=40' + like));
    var viaProxy = !mmlKey;
    mmlNameErr = '';
    function get(u) {
      return fetch(u).then(function (r) {
        if (viaProxy && (r.status === 503 || r.status === 404 || r.status === 405)) { mmlProxyOk = false; return { features: [] }; }
        if (r.status === 401 || r.status === 403) { mmlNameErr = 'Paikannimihaku ei onnistu: Maanmittauslaitoksen API-avainta ei hyväksytty (HTTP ' + r.status + ').'; return { features: [] }; }
        if (viaProxy) mmlProxyOk = true;
        if (!r.ok) { mmlNameErr = 'Paikannimihaku ei onnistu: Maanmittauslaitoksen palvelu vastasi HTTP ' + r.status + '.'; return { features: [] }; }
        return r.json();
      }).then(function (j) { return j.features || []; }, function () { mmlNameErr = mmlNameErr || 'Paikannimihaku ei onnistu: Maanmittauslaitoksen palveluun ei saatu yhteyttä.'; return []; });
    }
    return Promise.all(urls.map(get)).then(function (lists) {
      var seen = {}, out = [];
      lists.forEach(function (fs) { fs.forEach(function (f) {
        var r = namePlace(f);
        if (!r) return;
        var key = r.id != null ? r.id : r.name + r.lat.toFixed(5) + r.lng.toFixed(5);
        if (seen[key]) return; seen[key] = 1; out.push(r);
      }); });
      if (out.length) return out;
      // varalla tarkka nimi, jos jokerihaku ei olisi käytettävissä
      var Q = word.charAt(0).toUpperCase() + word.slice(1);
      return get(mmlUrl(MML_NAMES, path, '&limit=40&spelling=' + encodeURIComponent(Q))).then(function (fs) { return fs.map(namePlace).filter(Boolean); });
    });
  }
  function setMmlKey(k) {
    k = String(k || '').trim();
    if (k === mmlKey) return;
    mmlKey = k; mmlCols = null; mmlColsErr = ''; mmlLoaded = {}; mmlStore = { rock: {}, rocks: {}, shoal: {}, name: {} };
    mmlPierLoaded = {};
    renderMml(); loadMml();
  }

  // ---------------- turvalaitteet ----------------
  var NAVL = { 1: 'vasen', 2: 'oikea', 3: 'pohjois', 4: 'etelä', 5: 'länsi', 6: 'itä', 7: 'karimerkki', 8: 'turvavesimerkki', 9: 'erikoismerkki' };


  // Turvalaitteet Suomen merikarttojen merkeillä (symbols.js). Valon pisara ja sektorit piirretään
  // loistokerrokseen (renderLights), jotta ne ovat samat kaikille valaistuille laitteille.
  function aidSymbol(p) {
    var CS = global.ChartSymbols, t = (p.turvalaitetyyppifi || '').toLowerCase(), n = Number(p.navigointilajikoodi);
    var ec = !!show.ecdisMarks;
    if (n >= 1 && n <= 9) return CS.mark(n, ec);
    if (t.indexOf('kummeli') >= 0) return CS.cairn();
    if (t.indexOf('tunnusmajakka') >= 0) return CS.beaconTower();
    if (t.indexOf('linjamerkki') >= 0 || t.indexOf('linjataulu') >= 0) return CS.leadingMark();
    if (t.indexOf('tutkamajakka') >= 0) return CS.racon();
    if (t.indexOf('merimajakka') >= 0) return CS.lighthouse();
    if (t.indexOf('loisto') >= 0 || t.indexOf('majakka') >= 0) return CS.lightStructure();
    if (t.indexOf('viitta') >= 0 || t.indexOf('poiju') >= 0) return CS.mark(0, ec);
    return CS.generic();
  }
  function aidIcon(p) {
    var label = show.aidNames && p.nimifi ? '<span class="aid-name">' + escapeHtml(p.nimifi) + '</span>' : '';
    return global.ChartSymbols.icon(aidSymbol(p), 'aid-ico', label);
  }

  function aidPopup(p) {
    var rows = [
      ['Tyyppi', (p.turvalaitetyyppifi || '–') + (NAVL[p.navigointilajikoodi] ? ' (' + NAVL[p.navigointilajikoodi] + ')' : '')],
      ['Numero', p.turvalaitenumero || '–'],
      ['Valaistu', p.valaistu === 'K' ? 'kyllä' : 'ei'],
      ['Sijainti', p.sijaintifi || '–']
    ];
    return '<div class="pop"><b>' + escapeHtml(p.nimifi || 'Turvalaite') + '</b><table>' +
      rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + escapeHtml(String(r[1])) + '</td></tr>'; }).join('') +
      '</table><div class="pop-src">Väylävirasto, ajantasainen turvalaiterekisteri</div></div>';
  }

  function renderAids() {
    aidLayer.clearLayers();
    if (!(show.aids || vecOn()) || map.getZoom() < LAYERS.aids.minZoom) return;
    var view = map.getBounds().pad(0.1);
    Object.keys(store.aids).forEach(function (id) {
      var f = store.aids[id];
      var c = f.geometry && (f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry.coordinates);
      if (!c) return;
      var ll = L.latLng(c[1], c[0]);
      if (!view.contains(ll)) return;
      L.marker(ll, { icon: aidIcon(f.properties), pane: 'aidPane', keyboard: false })
        .bindPopup(aidPopup(f.properties)).addTo(aidLayer);
    });
  }

  // Vesiliikennemerkit vesiliikennelain mukaisina kilpinä (signs.js). Samassa paikassa olevat merkit
  // pinotaan tolpaksi lain järjestyksessä, ja ponnahdusikkuna luettelee ne lisäkilpineen.
  // Merkit näytetään tasolta 13 ja kaapeli- ja johtotaulut ja suuntamerkit tasolta 14, koska niitä on
  // rannoilla paljon (Helsingin keskustan näkymässä tasolla 12 olisi noin 600 merkkitolppaa).
  function signsOn() { return show.signs === true || (show.signs == null && vecOn()); }
  function signPopupRow(p, s) {
    var extra = [p.lisakilventeksti1, p.lisakilventeksti2].filter(function (t) { return t && String(t).trim(); });
    return '<div class="sg-row"><span class="sg-mini">' + s.html + '</span><div><b>' + escapeHtml(s.name) + (s.value ? ' ' + escapeHtml(s.value) : '') + '</b>' +
      (extra.length ? '<div>Lisäkilpi: ' + escapeHtml(extra.join(' · ')) + '</div>' : '') + '</div></div>';
  }
  function renderSigns() {
    signLayer.clearLayers();
    var z = map.getZoom();
    if (!signsOn() || z < 13) return;
    var CSg = global.ChartSigns;
    if (!CSg) return;
    var view = map.getBounds().pad(0.1), size = z >= 14 ? 20 : 16;
    var groups = {};
    Object.keys(store.signs).forEach(function (id) {
      var f = store.signs[id];
      var c = f.geometry && (f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry.coordinates);
      if (!c) return;
      var ll = L.latLng(c[1], c[0]);
      if (!view.contains(ll)) return;
      var p = f.properties || {}, s = CSg.info(p, size);
      if ((s.cat === 'taulu' || s.cat === 'suunta' || s.cat === 'suunta2') && z < 14) return;
      var key = c[1].toFixed(5) + ',' + c[0].toFixed(5);
      (groups[key] = groups[key] || { ll: ll, items: [] }).items.push({ p: p, s: s });
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      g.items.sort(function (a, b) { return a.s.order - b.s.order || a.s.code - b.s.code; });
      var html = '<div class="sg-post">' + g.items.map(function (it) { return it.s.html; }).join('') + '</div>';
      var p0 = g.items[0].p;
      var vn = String(p0.vaylan_nimi || '').replace(/^\[\d+:\s*/, '').replace(/\]\(.*$/, '');
      var pop = '<div class="pop">' + g.items.map(function (it) { return signPopupRow(it.p, it.s); }).join('') +
        (p0.sijaintifi ? '<div class="muted">' + escapeHtml(p0.sijaintifi) + '</div>' : '') +
        (vn ? '<div class="muted">' + escapeHtml(vn) + '</div>' : '') +
        (p0.nimifi ? '<div class="muted">Merkki ' + escapeHtml(p0.nimifi) + '</div>' : '') +
        '<div class="pop-src">Väylävirasto, vesiliikennemerkit</div></div>';
      L.marker(g.ll, { icon: L.divIcon({ className: 'sg-ico', html: html, iconSize: [0, 0] }), pane: 'aidPane', keyboard: false })
        .bindPopup(pop).addTo(signLayer);
    });
  }

  // ---------------- sillat ja sulut ----------------
  // Sillat, joille taitorakennerekisterissä on alittavan vesiväylän alikulkukorkeus, sekä sulut ja
  // avattavat sillat Väyläviraston sulkukanava-aineistosta. Molemmat aineistot ovat pieniä (noin 280 ja
  // 60 kohdetta), joten ne haetaan kerran. Silta piirretään INT 1:n tapaan kahtena kannen reunaviivana,
  // joiden päät taittuvat ulospäin; kansi suunnataan poikki lähimmän navigointilinjan, koska rekisteri
  // antaa vain sillan keskipisteen. Avattavan sillan kannessa on aukko, ja sulun merkki on kanavan
  // seinämät ja portit. Alikulkukorkeus näytetään sillan vieressä.
  var structs = { bridges: null, locks: null, loading: false };
  function structuresOn() { return show.bridges === true || (show.bridges == null && vecOn()); }
  function loadStructures() {
    if (!structuresOn() || map.getZoom() < 11 || structs.bridges || structs.loading) return;
    structs.loading = true; pending++; setStatus();
    function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) { return j.features || []; }); }
    Promise.all([
      get(VAYLA_WFS + '&TYPENAME=taitorakenteet:silta&CQL_FILTER=' + encodeURIComponent("alittav_vayla_korkraj_vesiv <> ''") +
        '&PROPERTYNAME=nimi,alittav_vayla_korkraj_vesiv,kayttotarkoitukset_nimi,nykyinen_omistaja,tunnus,sijaintikunnat,geom'),
      get(VAYLA_WFS + '&TYPENAME=vesivaylatiedot:sulkukanavat_uusi')
    ]).then(function (res) {
      structs.bridges = res[0]; structs.locks = res[1]; structs.merged = false;
      structs.loading = false; pending--; setStatus(); renderStructures();
    }, function () {
      structs.loading = false; pending--; failed++; setStatus();
      setTimeout(function () { failed = Math.max(0, failed - 1); setStatus(); }, 8000);
    });
  }
  // lähimmän navigointilinjan suunta näytöllä (astetta, x-akselista) enintään maxPx:n päästä, tai null
  function fairwayAngle(ll, maxPx) {
    var P = map.latLngToContainerPoint(ll), best = null, bd = maxPx;
    Object.keys(store.navlines).forEach(function (id) {
      lineCoords(store.navlines[id]).forEach(function (c) {
        for (var i = 0; i < c.length - 1; i++) {
          var A = map.latLngToContainerPoint([c[i][1], c[i][0]]), B = map.latLngToContainerPoint([c[i + 1][1], c[i + 1][0]]);
          var vx = B.x - A.x, vy = B.y - A.y, len2 = vx * vx + vy * vy;
          if (!len2) continue;
          var t = Math.max(0, Math.min(1, ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2));
          var d = Math.hypot(P.x - (A.x + vx * t), P.y - (A.y + vy * t));
          if (d < bd) { bd = d; best = Math.atan2(vy, vx) * 180 / Math.PI; }
        }
      });
    });
    return best;
  }
  function bridgeSvg(opening, len) {
    var e = len - 3, m = len / 2;
    var deck = opening
      ? 'M5 5H' + (m - 3) + 'M' + (m + 3) + ' 5H' + (e - 2) + 'M5 11H' + (m - 3) + 'M' + (m + 3) + ' 11H' + (e - 2) +
        'M' + (m - 3) + ' 3.6V12.4M' + (m + 3) + ' 3.6V12.4'
      : 'M5 5H' + (e - 2) + 'M5 11H' + (e - 2);
    var ends = 'M5 5L2 2M' + (e - 2) + ' 5L' + (e + 1) + ' 2M5 11L2 14M' + (e - 2) + ' 11L' + (e + 1) + ' 14';
    return '<svg viewBox="0 0 ' + len + ' 16" width="' + len + '" height="16" aria-hidden="true">' +
      '<path d="' + deck + ends + '" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="' + deck + ends + '" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }
  function lockSvg() {
    var d = 'M2 3H28M2 11H28M9 3L12.4 7L9 11M21 3L17.6 7L21 11';
    return '<svg viewBox="0 0 30 14" width="30" height="14" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function fm(v, u) { var n = num(v); return n == null ? null : G.fmtNum(n, n % 1 ? 1 : 0) + (u ? ' ' + u : ''); }
  function popTable(rows) {
    return '<table>' + rows.filter(function (r) { return r[1] != null && r[1] !== ''; })
      .map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + escapeHtml(String(r[1])) + '</td></tr>'; }).join('') + '</table>';
  }
  function bridgePopup(p) {
    return '<div class="pop"><b>' + escapeHtml(p.nimi || 'Silta') + '</b>' + popTable([
      ['Alikulkukorkeus', fm(p.alittav_vayla_korkraj_vesiv, 'm')], ['Käyttötarkoitus', p.kayttotarkoitukset_nimi ? String(p.kayttotarkoitukset_nimi).split(/\\n|\n/)[0] : null],
      ['Kunta', p.sijaintikunnat], ['Omistaja', p.nykyinen_omistaja], ['Tunnus', p.tunnus]
    ]) + '<div class="muted">Alikulkukorkeus taitorakennerekisterin mukaan. Tarkista sillan merkintä ja vedenkorkeus.</div>' +
      '<div class="pop-src">Väylävirasto, taitorakennerekisteri</div></div>';
  }
  function lockPopup(p) {
    var ves = [fm(p.aluspituus, 'm') && 'pituus ' + fm(p.aluspituus, 'm'), fm(p.alusleveys, 'm') && 'leveys ' + fm(p.alusleveys, 'm'),
      fm(p.alussyvyys, 'm') && 'syväys ' + fm(p.alussyvyys, 'm'), fm(p.aluskorkeus, 'm') && 'korkeus ' + fm(p.aluskorkeus, 'm')].filter(Boolean).join(', ');
    var lock = [fm(p.sulkuleveys, 'm') && 'leveys ' + fm(p.sulkuleveys, 'm'), fm(p.sulkuleveyspituus, 'm') && 'pituus ' + fm(p.sulkuleveyspituus, 'm')].filter(Boolean).join(', ');
    var fall = [num(p.putouskorkeus1), num(p.putouskorkeus2)].filter(function (v) { return v != null; });
    return '<div class="pop"><b>' + escapeHtml(p.nimi || 'Kanava') + '</b><div>' + escapeHtml(p.kanavaaluetyyppi || '') + (p.vesisto ? ', ' + escapeHtml(p.vesisto) : '') + '</div>' + popTable([
      ['Väli', p.mista && p.mihin ? p.mista + ' – ' + p.mihin : null], ['Suurin alus', ves || null],
      ['Sulku', lock || null], ['Putouskorkeus', fall.length ? fall.map(function (v) { return G.fmtNum(v, v % 1 ? 2 : 0); }).join(' / ') + ' m' : null],
      ['Käyttö', p.kayttoselite], ['Portit', p.porttiselite], ['Kiinnittyminen', p.kiinnittyminenselite ? String(p.kiinnittyminenselite).trim() : null],
      ['Numero', p.numero], ['Omistaja', p.omistaja]
    ]) + (/silta/i.test(p.kanavaaluetyyppi || '') ? '<div class="muted">Suurin aluksen korkeus sillan ollessa avattuna. Suljetun sillan alikulkukorkeus on sillan merkinnässä.</div>' : '') +
      '<div class="pop-src">Väylävirasto, sulkukanavat</div></div>';
  }
  function centroid(g) {
    var ring = g && (g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null);
    if (!ring || !ring.length) return g && g.type === 'Point' ? L.latLng(g.coordinates[1], g.coordinates[0]) : null;
    var sx = 0, sy = 0; ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return L.latLng(sy / ring.length, sx / ring.length);
  }
  function structMarker(ll, html, rot, cls) {
    return L.marker(ll, {
      icon: L.divIcon({ className: 'st-ico ' + (cls || ''), html: '<div class="st-sym" style="transform:translate(-50%,-50%) rotate(' + Math.round(rot) + 'deg)">' + html + '</div>', iconSize: [0, 0] }),
      pane: 'aidPane', keyboard: false
    });
  }
  // Merkinnät sijoitetaan törmäystarkistuksella: ensin kaikkien merkkien paikat, sitten merkinnät
  // vapaaseen kohtaan (sillalla ensisijaisesti väylän suuntaan, sululla sivulle). Jos tilaa ei ole,
  // merkintä jää pois ja tulee näkyviin lähemmäs zoomattaessa.
  function placeLabels(items) {
    var boxes = items.map(function (it) { var P = map.latLngToContainerPoint(it.ll); return { x: P.x, y: P.y, w: it.sym, h: it.sym }; });
    function free(b) {
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (Math.abs(o.x - b.x) < (o.w + b.w) / 2 && Math.abs(o.y - b.y) < (o.h + b.h) / 2) return false;
      }
      return true;
    }
    items.forEach(function (it) {
      if (!it.label) return;
      var P = map.latLngToContainerPoint(it.ll), w = it.label.replace(/<[^>]+>/g, '').length * 6.3 + 10, h = 17;
      var a0 = it.ang == null ? -90 : it.ang;
      var dirs = it.ang == null ? [-90, 90, 0, 180] : it.along ? [a0, a0 + 180, a0 + 90, a0 - 90] : [a0 + 90, a0 - 90, a0, a0 + 180];
      for (var k = 0; k < dirs.length * 2; k++) {
        var a = dirs[k % dirs.length] * Math.PI / 180, ext = Math.abs(Math.cos(a)) * w / 2 + Math.abs(Math.sin(a)) * h / 2;
        var d = it.sym / 2 + ext + (k < dirs.length ? 3 : 14);
        var b = { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, w: w, h: h };
        if (!free(b)) continue;
        boxes.push(b);
        L.marker(map.containerPointToLatLng([b.x, b.y]), { icon: L.divIcon({ className: 'st-lab-ico', html: '<span class="st-lab">' + it.label + '</span>', iconSize: [0, 0] }), interactive: false, keyboard: false, pane: 'labelPane' }).addTo(structLayer);
        return;
      }
    });
  }
  // Sama avattava silta voi olla sekä sulkukanava-aineistossa että taitorakennerekisterissä
  // (esim. Muroleen kanavan kääntösilta). Ne yhdistetään: rekisteristä saadaan suljetun sillan
  // alikulkukorkeus, ja silta piirretään kerran avattavan sillan merkillä.
  var OPENING_RE = /kääntö|nosto|avattav|läppä|siirto|sillan avaus/i;
  function mergeStructures() {
    structs.locks.forEach(function (f) {
      if (!/silta/i.test((f.properties || {}).kanavaaluetyyppi || '')) return;
      var c = centroid(f.geometry), best = null, bd = 150;
      if (!c) return;
      structs.bridges.forEach(function (b) {
        var g = b.geometry && b.geometry.coordinates;
        if (!g || b._merged) return;
        var d = G.distance(c, { lat: g[1], lng: g[0] });
        if (d < bd) { bd = d; best = b; }
      });
      if (best) { best._merged = true; f._reg = best.properties || {}; }
    });
  }
  function openingPopup(p, reg) {
    var base = lockPopup(p);
    if (!reg) return base;
    var extra = popTable([['Alikulkukorkeus suljettuna', fm(reg.alittav_vayla_korkraj_vesiv, 'm')], ['Rekisterissä', reg.nimi], ['Tunnus', reg.tunnus]]);
    return base.replace('<div class="pop-src">', extra + '<div class="pop-src">').replace('Väylävirasto, sulkukanavat', 'Väylävirasto, sulkukanavat ja taitorakennerekisteri');
  }
  function renderStructures() {
    if (!structLayer) return;
    structLayer.clearLayers();
    var z = map.getZoom();
    if (!structuresOn() || z < 11 || !structs.bridges) return;
    if (!structs.merged) { mergeStructures(); structs.merged = true; }
    var view = map.getBounds().pad(0.1), len = z >= 13 ? 36 : 28, items = [];
    structs.locks.forEach(function (f) {
      var ll = centroid(f.geometry);
      if (!ll || !view.contains(ll)) return;
      var p = f.properties || {}, ang = fairwayAngle(ll, 60), isBridge = /silta/i.test(p.kanavaaluetyyppi || '');
      if (isBridge) {
        structMarker(ll, bridgeSvg(true, len), ang == null ? 0 : ang + 90, 'st-open').bindPopup(openingPopup(p, f._reg)).addTo(structLayer);
        var hc = f._reg ? fm(f._reg.alittav_vayla_korkraj_vesiv, 'm') : null;
        // aineiston aluskorkeus on suurin aluksen korkeus sillan ollessa avattuna, ei suljetun sillan
        // alikulkukorkeus, joten karttaan merkitään vain rekisterin alikulkukorkeus
        items.push({ ll: ll, ang: ang, sym: len * 0.8, along: true, label: z >= 12 ? (hc ? '↕ ' + escapeHtml(hc) + ' · avattava' : 'avattava') : null });
        return;
      }
      // sulku: tasolta 15 kammion ääriviiva (napautettava), kauempana kanavan merkki
      if (z >= 15 && f.geometry && /Polygon/.test(f.geometry.type)) {
        L.geoJSON(f.geometry, { style: { color: '#111', weight: 1.6, fillColor: '#fff', fillOpacity: 0.35 } }).bindPopup(lockPopup(p)).addTo(structLayer);
        items.push({ ll: ll, ang: ang, sym: 14, along: false, label: escapeHtml(p.nimi || 'Sulku') + ' (sulku)' });
      } else {
        structMarker(ll, lockSvg(), ang == null ? 0 : ang, 'st-lock').bindPopup(lockPopup(p)).addTo(structLayer);
        items.push({ ll: ll, ang: ang, sym: 24, along: false, label: z >= 13 ? escapeHtml(p.nimi || '') : null });
      }
    });
    structs.bridges.forEach(function (f) {
      if (f._merged) return;
      var c = f.geometry && f.geometry.coordinates;
      if (!c) return;
      var ll = L.latLng(c[1], c[0]);
      if (!view.contains(ll)) return;
      var p = f.properties || {}, ang = fairwayAngle(ll, 60), opening = OPENING_RE.test(p.nimi || '');
      structMarker(ll, bridgeSvg(opening, len), ang == null ? 0 : ang + 90, opening ? 'st-open' : '').bindPopup(bridgePopup(p)).addTo(structLayer);
      var h = fm(p.alittav_vayla_korkraj_vesiv, 'm');
      items.push({ ll: ll, ang: ang, sym: len * 0.8, along: true, label: h && z >= 12 ? '↕ ' + escapeHtml(h) + (opening ? ' · avattava' : '') : null });
    });
    placeLabels(items);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // ---------------- karttareunus (minuuttiasteikko) ----------------
  var borderCanvas;
  var BAND = 9;
  function niceStep(pxPerMin, minPx, steps) {
    for (var i = 0; i < steps.length; i++) if (steps[i] * pxPerMin >= minPx) return steps[i];
    return steps[steps.length - 1];
  }
  function fmtMinLabel(valDeg, stepMin, isLat) {
    var sign = valDeg < 0 ? -1 : 1;
    var a = Math.abs(valDeg);
    var d = Math.floor(a + 1e-9);
    var m = (a - d) * 60;
    if (m > 59.999) { d += 1; m = 0; }
    var dec = stepMin < 0.1 ? 2 : stepMin < 1 ? 1 : 0;
    var ms = m.toFixed(dec).replace('.', ',');
    if (m < 10) ms = '0' + ms;
    return (sign < 0 ? '-' : '') + G.pad(d, isLat ? 2 : 3) + '°' + ms + "'";
  }

  function drawBorder() {
    if (!borderCanvas) return;
    var size = map.getSize();
    var dpr = window.devicePixelRatio || 1;
    borderCanvas.width = size.x * dpr; borderCanvas.height = size.y * dpr;
    borderCanvas.style.width = size.x + 'px'; borderCanvas.style.height = size.y + 'px';
    var g = borderCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.x, size.y);
    if (!show.border) return;
    var ink = getComputedStyle(document.body).getPropertyValue('--chart-ink').trim() || '#111';
    var paper = getComputedStyle(document.body).getPropertyValue('--chart-paper').trim() || '#fff';
    var c = map.getCenter();
    var y0 = map.latLngToContainerPoint([c.lat, c.lng]).y;
    var y1 = map.latLngToContainerPoint([c.lat + 1 / 60, c.lng]).y;
    var pxPerMinLat = Math.abs(y0 - y1);
    var x0 = map.latLngToContainerPoint([c.lat, c.lng]).x;
    var x1 = map.latLngToContainerPoint([c.lat, c.lng + 1 / 60]).x;
    var pxPerMinLon = Math.abs(x1 - x0);
    var steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    var labSteps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

    // reunat
    g.fillStyle = paper; g.globalAlpha = 0.92;
    g.fillRect(0, 0, size.x, BAND); g.fillRect(0, size.y - BAND, size.x, BAND);
    g.fillRect(0, 0, BAND, size.y); g.fillRect(size.x - BAND, 0, BAND, size.y);
    g.globalAlpha = 1;

    // Lukemia ei piirretä karttapainikkeiden ja -laatikoiden alle (puhelimessa ne ovat reunan päällä).
    var mr = map.getContainer().getBoundingClientRect(), avoid = [];
    Array.prototype.forEach.call(document.querySelectorAll('#baseSwitch, #toolbar, #editBanner, .map-notes > *, .leaflet-control-zoom, #readout, #disclaimer, .scale-nm'), function (el) {
      if (el.hidden || !el.offsetParent) return;
      var r = el.getBoundingClientRect();
      if (r.width && r.height) avoid.push([r.left - mr.left - 3, r.top - mr.top - 3, r.right - mr.left + 3, r.bottom - mr.top + 3]);
    });
    function covered(x0, y0, x1, y1) {
      return avoid.some(function (a) { return x0 < a[2] && x1 > a[0] && y0 < a[3] && y1 > a[1]; });
    }
    function bands(isLat) {
      var pxPer = isLat ? pxPerMinLat : pxPerMinLon;
      var step = niceStep(pxPer, 7, steps);
      var labStep = niceStep(pxPer, 90, labSteps);
      if (labStep < step) labStep = step;
      var b = map.getBounds();
      var lo = isLat ? b.getSouth() : b.getWest(), hi = isLat ? b.getNorth() : b.getEast();
      var stepDeg = step / 60;
      var k0 = Math.floor(lo / stepDeg) - 1, k1 = Math.ceil(hi / stepDeg) + 1;
      g.fillStyle = ink;
      for (var k = k0; k <= k1; k++) {
        if (Math.abs(k) % 2 === 1) continue;
        var vA = k * stepDeg, vB = (k + 1) * stepDeg;
        if (isLat) {
          var ya = map.latLngToContainerPoint([vA, c.lng]).y, yb = map.latLngToContainerPoint([vB, c.lng]).y;
          var top = Math.min(ya, yb), h = Math.abs(ya - yb);
          g.fillRect(0, top, BAND, h); g.fillRect(size.x - BAND, top, BAND, h);
        } else {
          var xa = map.latLngToContainerPoint([c.lat, vA]).x, xb = map.latLngToContainerPoint([c.lat, vB]).x;
          var left = Math.min(xa, xb), w = Math.abs(xa - xb);
          g.fillRect(left, 0, w, BAND); g.fillRect(left, size.y - BAND, w, BAND);
        }
      }
      // tekstit
      g.font = '600 10.5px "Segoe UI", system-ui, sans-serif';
      var labDeg = labStep / 60;
      var j0 = Math.floor(lo / labDeg), j1 = Math.ceil(hi / labDeg);
      for (var j = j0; j <= j1; j++) {
        var v = j * labDeg;
        var txt = fmtMinLabel(v, labStep, isLat) + (isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W'));
        g.lineWidth = 3; g.strokeStyle = paper; g.fillStyle = ink;
        if (isLat) {
          var y = map.latLngToContainerPoint([v, c.lng]).y;
          if (y < 40 || y > size.y - 40) continue;
          var tw = g.measureText(txt).width;
          if (covered(BAND, y - tw / 2, BAND + 18, y + tw / 2)) continue;
          g.save(); g.translate(BAND + 3, y); g.rotate(-Math.PI / 2);
          g.textAlign = 'center'; g.textBaseline = 'top';
          g.strokeText(txt, 0, 0); g.fillText(txt, 0, 0); g.restore();
          g.fillRect(BAND, y - 0.5, 5, 1);
        } else {
          var x = map.latLngToContainerPoint([c.lat, v]).x;
          if (x < 60 || x > size.x - 60) continue;
          var tw2 = g.measureText(txt).width;
          if (covered(x - tw2 / 2, BAND, x + tw2 / 2, BAND + 18)) continue;
          g.textAlign = 'center'; g.textBaseline = 'top';
          g.strokeText(txt, x, BAND + 3); g.fillText(txt, x, BAND + 3);
          g.fillRect(x - 0.5, BAND, 1, 5);
        }
      }
    }
    bands(true); bands(false);
    g.strokeStyle = ink; g.lineWidth = 1;
    g.strokeRect(BAND + 0.5, BAND + 0.5, size.x - 2 * BAND - 1, size.y - 2 * BAND - 1);
    g.strokeRect(0.5, 0.5, size.x - 1, size.y - 1);
  }

  // ---------------- mittakaava (mpk) ----------------
  var ScaleNM = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var d = L.DomUtil.create('div', 'scale-nm');
      d.innerHTML = '<div class="bar"><span></span><span></span><span></span><span></span></div><div class="lab"></div>';
      this._d = d;
      map.on('zoomend moveend', this._update, this);
      this._update();
      return d;
    },
    _update: function () {
      var c = map.getCenter();
      var p = map.latLngToContainerPoint(c);
      var c2 = map.containerPointToLatLng([p.x + 100, p.y]);
      var mPer100 = G.distance({ lat: c.lat, lng: c.lng }, { lat: c.lat, lng: c2.lng });
      var nmPer100 = mPer100 / G.NM;
      var choices = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50];
      var pick = choices[0];
      choices.forEach(function (v) { if (v <= nmPer100 * 1.6) pick = v; });
      var px = pick / nmPer100 * 100;
      this._d.querySelector('.bar').style.width = Math.round(px) + 'px';
      var m = pick * G.NM;
      this._d.querySelector('.lab').textContent = G.fmtNum(pick, pick < 1 ? (pick * 100 % 10 ? 2 : 1) : 0) + ' mpk  (' +
        (m >= 1000 ? G.fmtNum(m / 1000, 2) + ' km' : Math.round(m) + ' m') + ')';
    }
  });

  // ---------------- laiturit ja aallonmurtajat (OpenStreetMap) ----------------
  // Vektorikartan vesialue piirretään peittävänä maapohjan päälle, joten maapohjan laiturit jäisivät sen alle.
  // Siksi laiturit, aallonmurtajat ja pengerrykset haetaan OpenStreetMapista vektoreina (Overpass-rajapinta)
  // ja piirretään veden päälle. Overpass on usein hidas, joten haetut alueet tallennetaan selaimen
  // IndexedDB-välimuistiin 30 päiväksi (eri muistiin kuin reitit, jotta reittien tallennustila ei täyty).
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var PIER_CELL = { w: 0.2, h: 0.1 }, PIER_MINZ = 14, PIER_TTL = 30 * 864e5;
  var pierStore = {}, pierBounds = {}, pierLoaded = {}, pierFailAt = {}, pierLayer = null, pierRenderer = null, pierBusy = 0, pierDb = null, pierAttr = false;
  var ATTR_PIER = 'Laiturit: Maanmittauslaitos CC BY 4.0 ja &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-tekijät';
  // Maanmittauslaitoksen maastotietokannan laituriviivat (pistolaituriviiva) ja aallonmurtajat tulevat
  // välityspalvelun kautta luotettavasti myös silloin, kun Overpass on ruuhkautunut. Kun niitä on saatavilla,
  // OpenStreetMapista piirretään laitureista vain alueina kartoitetut, ettei sama laituri näy kahdesti.
  var mmlPierLoaded = {};
  function mmlPiersOn() { return mmlAvailable(); }
  function loadMmlPiers() {
    if (!mmlPiersOn()) return;
    var bb = map.getBounds().pad(0.2);
    var cx0 = Math.floor(bb.getWest() / MML_CELL.w), cx1 = Math.floor(bb.getEast() / MML_CELL.w);
    var cy0 = Math.floor(bb.getSouth() / MML_CELL.h), cy1 = Math.floor(bb.getNorth() / MML_CELL.h);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 24) return;
    mmlDiscover().then(function (cols) {
      if (!cols || !(cols.pier || cols.breakwater)) return;
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var key = cx + ':' + cy;
        if (mmlPierLoaded[key]) continue;
        mmlPierLoaded[key] = 'pending';
        (function (key, cx, cy) {
          var bbox = '&bbox=' + [cx * MML_CELL.w, cy * MML_CELL.h, (cx + 1) * MML_CELL.w, (cy + 1) * MML_CELL.h].map(function (v) { return v.toFixed(5); }).join(',') + '&limit=2000';
          pierBusy++; setStatus();
          Promise.all(['pier', 'breakwater'].filter(function (k) { return cols[k]; }).map(function (k) {
            return fetch(mmlUrl(MML_TOPO, '/collections/' + cols[k] + '/items', bbox)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
              .then(function (j) {
                (j.features || []).forEach(function (f, i) {
                  var g = f.geometry; if (!g) return;
                  var lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates
                    : g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(function (p) { return p[0]; }) : [];
                  var area = /Polygon/.test(g.type);
                  lines.forEach(function (ln, li) {
                    var pts = ln.map(function (c) { return [Math.round(c[1] * 1e6) / 1e6, Math.round(c[0] * 1e6) / 1e6]; });
                    if (pts.length < 2) return;
                    pierStore['m' + k.charAt(0) + (f.id != null ? f.id : key + ':' + i) + '_' + li] = { p: pts, a: area, w: 0, k: k === 'pier' ? 'pier' : 'breakwater', src: 'mml' };
                  });
                });
              });
          })).then(function () { mmlPierLoaded[key] = true; }, function () { delete mmlPierLoaded[key]; })
            .then(function () { pierBusy--; setStatus(); renderPiers(); });
        })(key, cx, cy);
      }
    }, function () { });
  }
  function piersOn() { return show.piers !== false && vecOn(); }
  function pierDbOpen() {
    if (pierDb) return pierDb;
    pierDb = new Promise(function (res) {
      try {
        var rq = global.indexedDB.open('reittikartta-osm', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('piers'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return pierDb;
  }
  function pierCacheGet(key) {
    return pierDbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var rq = db.transaction('piers').objectStore('piers').get(key);
          rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    });
  }
  function pierCachePut(key, val) {
    pierDbOpen().then(function (db) {
      if (!db) return;
      try { db.transaction('piers', 'readwrite').objectStore('piers').put(val, key); } catch (e) { /* välimuisti on vain apu */ }
    });
  }
  function overpass(q, i) {
    i = i || 0;
    if (i >= OVERPASS.length) return Promise.reject(new Error('overpass'));
    var ac = global.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ac) ac.abort(); }, i === 0 ? 45000 : 30000);
    return fetch(OVERPASS[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ac ? ac.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !j.elements) throw new Error('vastaus'); return { j: j, src: i }; })
      .catch(function () { clearTimeout(to); return overpass(q, i + 1); });
  }
  function pierParse(j) {
    var out = [];
    (j.elements || []).forEach(function (e) {
      var t = e.tags || {}, rings = [];
      if (e.type === 'way' && e.geometry) rings.push(e.geometry);
      else if (e.type === 'relation' && e.members) e.members.forEach(function (m) { if (m.geometry && m.role !== 'inner') rings.push(m.geometry); });
      var w = parseFloat(String(t.width || '').replace(',', '.'));
      rings.forEach(function (g, ri) {
        var pts = g.map(function (q) { return [Math.round(q.lat * 1e6) / 1e6, Math.round(q.lon * 1e6) / 1e6]; });
        if (pts.length < 2) return;
        var last = pts[pts.length - 1];
        var closed = pts.length >= 4 && pts[0][0] === last[0] && pts[0][1] === last[1];
        out.push({ id: e.type.charAt(0) + e.id + '_' + ri, a: closed && t.area !== 'no', p: pts, w: w > 0 && w < 40 ? w : 0, k: t.man_made });
      });
    });
    return out;
  }
  function addPiers(key, f) { f.forEach(function (x) { pierStore[x.id] = x; }); pierLoaded[key] = true; renderPiers(); }
  function loadPierCell(key, cx, cy) {
    pierCacheGet('c' + key).then(function (c) {
      var fresh = c && Date.now() - c.t < (c.src === 0 ? PIER_TTL : 864e5);
      if (fresh) { addPiers(key, c.f); return; }
      if (c) addPiers(key, c.f);                                  // vanha tieto näkyviin päivityksen ajaksi
      var s = cy * PIER_CELL.h, w = cx * PIER_CELL.w;
      var bbox = [s, w, s + PIER_CELL.h, w + PIER_CELL.w].map(function (v) { return v.toFixed(4); }).join(',');
      var sel = '["man_made"~"^(pier|breakwater|groyne)$"](' + bbox + ');';
      pierBusy++; setStatus();
      overpass('[out:json][timeout:40];(way' + sel + 'relation' + sel + ');out geom;').then(function (r) {
        var f = pierParse(r.j);
        pierCachePut('c' + key, { t: Date.now(), src: r.src, f: f });
        addPiers(key, f);
      }, function () {
        if (!c) { delete pierLoaded[key]; pierFailAt[key] = Date.now(); }
      }).then(function () { pierBusy--; setStatus(); });
    });
  }
  function loadPiers() {
    if (!piersOn() || map.getZoom() < PIER_MINZ) return;
    loadMmlPiers();
    var bb = map.getBounds().pad(0.2);
    var cx0 = Math.floor(bb.getWest() / PIER_CELL.w), cx1 = Math.floor(bb.getEast() / PIER_CELL.w);
    var cy0 = Math.floor(bb.getSouth() / PIER_CELL.h), cy1 = Math.floor(bb.getNorth() / PIER_CELL.h);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 9) return;
    for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
      var key = cx + ':' + cy;
      if (pierLoaded[key] || (pierFailAt[key] && Date.now() - pierFailAt[key] < 120000)) continue;
      pierLoaded[key] = 'pending';
      loadPierCell(key, cx, cy);
    }
  }
  function renderPiers() {
    if (!pierLayer) return;
    pierLayer.clearLayers();
    var on = piersOn() && map.getZoom() >= PIER_MINZ;
    if (on !== pierAttr) {
      pierAttr = on;
      if (on) map.attributionControl.addAttribution(ATTR_PIER); else map.attributionControl.removeAttribution(ATTR_PIER);
    }
    if (!on) return;
    var bb = map.getBounds().pad(0.1), c = map.getCenter();
    var mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8);   // metriä / pikseli
    var night = document.body.classList.contains('night');
    var fill = night ? '#4d4a40' : '#e6dcc0', edge = night ? '#cfc8b4' : '#333333';
    var haveMml = mmlPiersOn() && Object.keys(mmlPierLoaded).some(function (k) { return mmlPierLoaded[k] === true; });
    // Maanmittauslaitoksen kohteet ensin, OpenStreetMapin alueet niiden päälle
    var ids = Object.keys(pierStore).sort(function (a, b) { return (pierStore[a].src === 'mml' ? 0 : 1) - (pierStore[b].src === 'mml' ? 0 : 1); });
    ids.forEach(function (id) {
      var x = pierStore[id];
      if (haveMml && x.src !== 'mml' && !x.a && x.k === 'pier') return;
      var xb = pierBounds[id] || (pierBounds[id] = L.latLngBounds(x.p));      // ei tallenneta välimuistiin
      if (!bb.intersects(xb)) return;
      if (x.a) {
        L.polygon(x.p, { renderer: pierRenderer, color: edge, weight: 1, fillColor: fill, fillOpacity: 1, interactive: false }).addTo(pierLayer);
      } else {
        // viivana kartoitettu laituri: leveys tagista tai oletus (laituri 2,5 m, aallonmurtaja 4 m), vähintään 2 px
        var w = Math.max(2, (x.w || (x.k === 'pier' ? 2.5 : 4)) / mpp);
        L.polyline(x.p, { renderer: pierRenderer, color: edge, weight: w + 2, lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(pierLayer);
        L.polyline(x.p, { renderer: pierRenderer, color: fill, weight: w, lineCap: 'butt', lineJoin: 'round', interactive: false }).addTo(pierLayer);
      }
    });
  }

  // ---------------- julkinen ----------------
  function init(m, showRef, opts) {
    map = m; show = showRef;
    statusEl = opts && opts.statusEl;
    map.createPane('labelPane'); map.getPane('labelPane').style.zIndex = 450; map.getPane('labelPane').style.pointerEvents = 'none';
    map.createPane('aidPane'); map.getPane('aidPane').style.zIndex = 460;
    map.createPane('flarePane'); map.getPane('flarePane').style.zIndex = 455; map.getPane('flarePane').style.pointerEvents = 'none';
    var base = buildBase();
    baseRef = base;
    var notes = L.DomUtil.create('div', 'map-notes', map.getContainer());
    encNote = L.DomUtil.create('div', 'enc-note', notes);
    encNote.hidden = true;
    autoNote = L.DomUtil.create('div', 'enc-note auto-note', notes);
    autoNote.textContent = 'Vektorikartta: rasterikartan tarkkuus päättyy tasolla ' + MAX_CHART_Z + '. Uloszoomatessa palataan valittuun karttapohjaan.';
    autoNote.hidden = true;
    safetyChip = L.DomUtil.create('div', 'safety-chip', notes);
    safetyChip.hidden = true;
    map.createPane('depthPane'); map.getPane('depthPane').style.zIndex = 210;
    map.createPane('pierPane'); map.getPane('pierPane').style.zIndex = 215; map.getPane('pierPane').style.pointerEvents = 'none';
    pierRenderer = L.canvas({ pane: 'pierPane', padding: 0.2 });
    pierLayer = L.layerGroup().addTo(map);
    lineLayer = L.layerGroup().addTo(map);
    labelLayer = L.layerGroup().addTo(map);
    aidLayer = L.layerGroup().addTo(map);
    signLayer = L.layerGroup().addTo(map);
    structLayer = L.layerGroup().addTo(map);
    snapLayer = L.layerGroup().addTo(map);
    aidSnapLayer = L.layerGroup().addTo(map);
    soundLayer = L.layerGroup().addTo(map);
    lightLayer = L.layerGroup().addTo(map);
    speedLayer = L.layerGroup().addTo(map);
    mmlLayer = L.layerGroup().addTo(map);
    map.attributionControl.addAttribution(ATTR_V);

    borderCanvas = L.DomUtil.create('canvas', 'chart-border', map.getContainer());
    new ScaleNM().addTo(map);

    var renderAll = function () { renderFairways(); renderAids(); renderSigns(); renderStructures(); renderSnapMarkers(); renderAidSnapMarkers(); renderSoundings(); renderLights(); renderSpeed(); renderMml(); renderPiers(); };
    var t = null;
    map.on('moveend zoomend', function () {
      if (shownMode() !== lastShown) applyBase();
      loadVisible();
      loadStructures();
      checkEncCoverage();
      loadSoundings();
      loadMml();
      loadPiers();
      if (safetyDepth != null) updateSafetyChip();
      clearTimeout(t); t = setTimeout(renderAll, 30);
      drawBorder();
    });
    map.on('move resize', drawBorder);
    // Selaimen zoomauksen muutos vaihtaa pikselitiheyttä: piirretään kartta uudelleen uudella tarkkuudella.
    var lastDpr = global.devicePixelRatio || 1;
    global.addEventListener('resize', function () {
      var d = global.devicePixelRatio || 1;
      if (Math.abs(d - lastDpr) > 0.01) { lastDpr = d; base.charts.redraw(); drawBorder(); }
    });
    // Saapuneet tietolajit kerätään ja piirretään yhdellä kertaa (aiemmin vain viimeisin ajastettu laji piirtyi).
    var pendingKinds = {};
    onDataCbs.push(function (kind) {
      pendingKinds[kind] = true;
      clearTimeout(t);
      t = setTimeout(function () {
        var k = pendingKinds; pendingKinds = {};
        if (k.aids) { renderAids(); renderAidSnapMarkers(); renderLights(); }
        if (k.signs) renderSigns();
        if (k.lights || k.sectors) renderLights();
        if (k.speed) renderSpeed();
        if (k.navlines || k.vaylat || k.taulu) { vcache = null; renderFairways(); renderSnapMarkers(); renderStructures(); }
      }, 60);
    });
    loadVisible(); loadStructures(); renderAll(); setTimeout(drawBorder, 0);

    return {
      base: base,
      refresh: function () { loadVisible(); loadStructures(); loadPiers(); renderAll(); drawBorder(); },
      drawBorder: drawBorder,
      fairwayName: fairwayName,
      fairwayClass: fairwayClass,
      loadRegion: loadRegion,
      navlineFeatures: navlineFeatures,
      lineCoords: lineCoords,
      snap: snap,
      setSnapMarkers: function (on) { snapMarkersOn = !!on; renderSnapMarkers(); },
      snapAid: snapAid,
      setAidSnapMarkers: function (on) { aidSnapOn = !!on; renderAidSnapMarkers(); },
      setBase: setBase,
      setLand: setLand,
      setUnderlay: function (on) { if (!vecOn()) setUnderlayLayer(!!on, 0.55); },
      setMmlKey: setMmlKey,
      searchNames: searchNames,
      muniName: function (code) { return KUNTA[String(code || '').padStart(3, '0')] || ''; },
      namesNote: namesNote,
      get mmlInfo() { return { key: !!mmlKey, proxy: !mmlKey && mmlProxy && mmlProxyOk !== false, available: mmlAvailable(), cols: mmlCols, err: mmlColsErr, n: Object.keys(mmlStore.rock).length }; },
      get landKind() { return landKind; },
      setSafety: setSafety,
      get safetyDepth() { return safetyDepth; },
      get baseMode() { return baseMode; },
      get shownBase() { return shownMode(); },
      get pierCount() { return pierLayer ? pierLayer.getLayers().length : 0; },
      maxChartZoom: MAX_CHART_Z,
      get encShown() { return !!(encLayer && map.hasLayer(encLayer)); },
      get vectorShown() { return !!(vecLayer && map.hasLayer(vecLayer)); }
    };
  }

  global.Chart = { init: init, escapeHtml: escapeHtml };
})(window);
