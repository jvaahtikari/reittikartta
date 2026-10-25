/* Simulaattori – plotteri (Leaflet).
 *
 * Plotteri on simulaattorin oma Leaflet-näkymä, joka ei riipu Reittikartan sisäisistä rajapinnoista.
 * Pohjana on Traficomin rasterimerikartta (WMTS, sama osoite kuin Reittikartan chart.js-tiedostossa),
 * päällä aineistopaketin vektorikerrokset (väyläalueet, navigointilinjat, matalikko) ja turvalaitteet
 * Reittikartan symbols.js-merkeillä. Suunta ylös: karttaelementti kierretään CSS:llä aluksen suunnan
 * verran, ja merkit kierretään takaisin pystyyn. Alus on kuvassa alempana, jotta eteenpäin näkyy enemmän. */
(function (root) {
  'use strict';
  var RAST = 'https://julkinen.traficom.fi/rasteripalvelu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER=Traficom%3AMerikarttasarjat%20public&STYLE=&TILEMATRIXSET=WGS84_Pseudo-Mercator&TILEMATRIX=WGS84_Pseudo-Mercator%3A{z}' +
    '&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng';
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var OFFSET_FRAC = 0.2;            // aluksen siirtymä keskipisteestä alaspäin näytön korkeuden osuutena
  var SHALLOW_M = (root.Liike && root.Liike.SETTINGS.draftM) || 1.1;   // pohjakosketuksen raja: syvyysalueen suurin syvyys (DRVAL2) alle tämän (syväys 1,1 m)

  function create(container, opts) {
    opts = opts || {};
    var P = root.Paikka, L = root.L;
    var rot = container.querySelector('.plot-rot'), mapEl = container.querySelector('.plot-map');
    var map = L.map(mapEl, {
      zoomControl: false, attributionControl: false, zoomSnap: 0, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, tap: false,
      fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, inertia: false, minZoom: 6, maxZoom: 20
    });
    var rasterOn = true;
    var raster = L.tileLayer(RAST, { minZoom: 6, maxZoom: 20, maxNativeZoom: 15, errorTileUrl: BLANK, updateWhenZooming: false, keepBuffer: 2 });
    raster.addTo(map);
    map.setView([61.51, 23.77], 14, { animate: false });

    // vektorikerrokset
    var vec = null, PL = root.protomapsL;
    if (PL && root.Aineisto) {
      var src = root.Aineisto.leafletSource('vec');
      var rules = [
        { dataLayer: 'syvyysalue', minzoom: 10, filter: function (z, f) { return f.props.ylin != null && f.props.ylin < SHALLOW_M; },
          symbolizer: new PL.PolygonSymbolizer({ fill: '#d9262c', opacity: 0.28 }) },
        { dataLayer: 'vaylaalue', minzoom: 9, symbolizer: new PL.PolygonSymbolizer({ fill: '#b3319b', opacity: 0.09, stroke: '#b3319b', width: 0.8 }) },
        { dataLayer: 'navigointilinja', minzoom: 9, symbolizer: new PL.LineSymbolizer({ color: '#a21f8b', width: 1.1, dash: [6, 4], opacity: 0.9 }) },
        { dataLayer: 'taululinja', minzoom: 11, symbolizer: new PL.LineSymbolizer({ color: '#222222', width: 0.8, dash: [2, 4] }) }
      ];
      vec = PL.leafletLayer({ url: src, paintRules: rules, labelRules: [], tileSize: 256, maxDataZoom: 16, maxZoom: 20, keepBuffer: 2, updateWhenZooming: false, attribution: '' });
      vec.addTo(map);
    }

    var lyr = {
      route: L.polyline([], { color: '#c2188f', weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map),
      trail: L.polyline([], { color: '#1f4e9c', weight: 2.5, opacity: 0.8, interactive: false }).addTo(map),
      turns: L.layerGroup().addTo(map),
      next: L.circleMarker([0, 0], { radius: 9, color: '#c2188f', weight: 3, fill: false, interactive: false }),
      extra: L.layerGroup().addTo(map),
      aids: L.layerGroup().addTo(map)
    };
    var aidMarkers = new Map();
    var rangeNm = 1, lastView = null, w = 0, h = 0, hdgTrue = 0, hdgGrid = 0, lastAidSync = 0;

    function resize() {
      w = container.clientWidth; h = container.clientHeight;
      if (!w || !h) return;
      var d = Math.ceil(Math.hypot(w, h)) + 4;
      rot.style.width = d + 'px'; rot.style.height = d + 'px';
      map.invalidateSize({ animate: false });
      lastView = null;
    }
    function zoomFor(lat) {
      var mpp = rangeNm * 1852 / Math.max(200, h);
      return Math.log(156543.03392 * Math.cos(lat * Math.PI / 180) / mpp) / Math.LN2;
    }
    function setRangeNm(nm) { rangeNm = nm; lastView = null; }
    function getRangeNm() { return rangeNm; }

    // Aluksen paikka maailmakoordinaatistossa ja ruutusuunta
    function update(x, y, hdg) {
      if (!w) resize();
      if (!w) return;
      hdgGrid = hdg;
      hdgTrue = P.gridToTrue(hdg, x, y);
      var rangeM = rangeNm * 1852, off = rangeM * OFFSET_FRAC, a = hdg * P.RAD;
      var cx = x + Math.sin(a) * off, cy = y + Math.cos(a) * off;
      var ll = P.worldToLonLat(cx, cy), z = zoomFor(ll.lat);
      var key = ll.lat.toFixed(6) + ll.lon.toFixed(6) + z.toFixed(3);
      if (key !== lastView) {
        lastView = key;
        map.setView([ll.lat, ll.lon], z, { animate: false });
      }
      rot.style.transform = 'translate(-50%,-50%) rotate(' + (-hdgTrue).toFixed(2) + 'deg)';
      mapEl.style.setProperty('--unrot', hdgTrue.toFixed(2) + 'deg');
      var own = container.querySelector('.plot-own');
      if (own) own.style.top = (50 + OFFSET_FRAC * 100) + '%';
    }

    function setRoute(pts, turnPts) {
      lyr.route.setLatLngs(pts.map(function (p) { var l = P.worldToLonLat(p.x, p.y); return [l.lat, l.lon]; }));
      lyr.turns.clearLayers();
      (turnPts || []).forEach(function (p, i) {
        var l = P.worldToLonLat(p.x, p.y);
        L.circleMarker([l.lat, l.lon], { radius: 3.5, color: '#c2188f', weight: 1.5, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(lyr.turns);
      });
    }
    function setNext(p) {
      if (!p) { if (map.hasLayer(lyr.next)) map.removeLayer(lyr.next); return; }
      var l = P.worldToLonLat(p.x, p.y);
      lyr.next.setLatLng([l.lat, l.lon]);
      if (!map.hasLayer(lyr.next)) lyr.next.addTo(map);
    }
    function setTrail(pts) {
      lyr.trail.setLatLngs(pts.map(function (p) { var l = P.worldToLonLat(p.x, p.y); return [l.lat, l.lon]; }));
    }
    // Lisämerkit (esimerkiksi pohjakosketuksen paikka tai ajettu jälki purussa)
    function clearExtra() { lyr.extra.clearLayers(); }
    function addExtraLine(pts, style) {
      return L.polyline(pts.map(function (p) { var l = P.worldToLonLat(p.x, p.y); return [l.lat, l.lon]; }), L.extend({ interactive: false }, style)).addTo(lyr.extra);
    }
    function addExtraPoint(p, html, cls) {
      var l = P.worldToLonLat(p.x, p.y);
      return L.marker([l.lat, l.lon], { interactive: false, icon: L.divIcon({ className: cls || 'plot-pin', html: html || '', iconSize: [0, 0] }) }).addTo(lyr.extra);
    }

    // Turvalaitteet: vain näkyvän alueen laitteet, päivitys korkeintaan kerran sekunnissa
    function symbolFor(a) {
      var S = root.ChartSymbols;
      if (a.tyyppi === 'Viitta' && a.nl >= 1 && a.nl <= 9) return S.mark(a.nl, true);
      if (a.tyyppi === 'Kummeli') return S.cairn();
      if (/loisto/i.test(a.tyyppi)) return S.lightStructure();
      if (a.tyyppi === 'Viitta') return S.mark(0, true);
      return S.generic();
    }
    function syncAids(x, y, force) {
      var now = Date.now();
      if (!force && now - lastAidSync < 800) return;
      lastAidSync = now;
      var S = root.ChartSymbols, M = root.Merkit;
      if (!S || !M) return;
      var rad = rangeNm * 1852 * 1.1 + 200, list = M.near(x, y, rad), want = new Set();
      var showNames = rangeNm <= 0.5;
      list.forEach(function (a) {
        want.add(a.numero);
        var m = aidMarkers.get(a.numero);
        if (m && m._names === showNames) return;
        if (m) lyr.aids.removeLayer(m);
        var sym = symbolFor(a);
        var label = showNames && a.nimi ? '<span class="plot-aid-name" style="left:' + (sym.w - sym.ax + 2) + 'px;top:' + (sym.ay - 8) + 'px">' + a.nimi.replace(/</g, '&lt;') + '</span>' : '';
        var html = '<div class="plot-aid" style="transform:rotate(var(--unrot));transform-origin:' + sym.ax + 'px ' + sym.ay + 'px">' + sym.html + label + '</div>';
        var icon = L.divIcon({ className: 'plot-aid-ico', html: html, iconSize: [sym.w, sym.h], iconAnchor: [sym.ax, sym.ay] });
        var ll = P.worldToLonLat(a.x, a.y);
        m = L.marker([ll.lat, ll.lon], { icon: icon, interactive: false, keyboard: false });
        m._names = showNames;
        m.addTo(lyr.aids); aidMarkers.set(a.numero, m);
      });
      aidMarkers.forEach(function (m, k) { if (!want.has(k)) { lyr.aids.removeLayer(m); aidMarkers.delete(k); } });
    }

    function setRasterVisible(on) {
      rasterOn = on;
      if (on && !map.hasLayer(raster)) raster.addTo(map);
      if (!on && map.hasLayer(raster)) map.removeLayer(raster);
    }
    function redraw() { lastView = null; }
    function rebase() { lastView = null; aidMarkers.forEach(function (m) { lyr.aids.removeLayer(m); }); aidMarkers.clear(); }

    return {
      map: map, update: update, resize: resize, setRangeNm: setRangeNm, getRangeNm: getRangeNm, setRoute: setRoute, setNext: setNext,
      setTrail: setTrail, syncAids: syncAids, clearExtra: clearExtra, addExtraLine: addExtraLine, addExtraPoint: addExtraPoint,
      setRasterVisible: setRasterVisible, redraw: redraw, rebase: rebase, heading: function () { return hdgTrue; }
    };
  }

  var api = { create: create, OFFSET_FRAC: OFFSET_FRAC, SHALLOW_M: SHALLOW_M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Plotteri = api;
})(typeof window !== 'undefined' ? window : globalThis);
