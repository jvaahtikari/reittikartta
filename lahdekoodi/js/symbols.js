/* Reittikartta – Suomen merikarttojen karttamerkit.
 *
 * Merkit on piirretty Traficomin virallisen merkkienselityksen mukaan
 * (traficom.fi/files/media/file/merkkienselitys_net_1.pdf, sivu 2: "Kivet, hylyt, esteet",
 * "Viittojen karttamerkit", "Linjat ja linjamerkit", "Kummeli", "Tunnusmajakka", "Loistot").
 *
 *   Kivet:   vedenpäällinen kivi ⊥, vedenrajassa oleva kivi +, vedenalainen kivi ⊤.
 *            Kivikossa samat merkit, joiden sivuilla on pisteet.
 *   Viitat:  musta varsi, jonka alapäässä asemaympyrä ja yläpäässä huippumerkki:
 *            vasen = sylinteri (avoin suorakaide), oikea = kartio (musta kolmio),
 *            pohjois = kartiot ylös, etelä = kartiot alas, itä = kantat vastakkain,
 *            länsi = kärjet vastakkain, karimerkki = kaksi palloa, turvavesi = pallo (avoin),
 *            erikoismerkki = risti.
 *   Valot:   valon värinen pisara asemapisteestä (valkoinen valo keltaisena, kuten selitteessä).
 *
 * Kaikki funktiot palauttavat { html, w, h, ax, ay }, jossa (ax, ay) on merkin asemapiste
 * pikseleinä kuvan vasemmasta yläkulmasta.
 */
(function (global) {
  'use strict';

  var INK = '#111';
  function svg(vw, vh, w, h, body) {
    return '<svg viewBox="0 0 ' + vw + ' ' + vh + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + body + '</svg>';
  }
  function dot(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 1.1) + '" fill="' + INK + '"/>'; }

  // ---------- kivet ----------
  // level: 'above' (vedenpäällinen), 'awash' (vedenrajassa), 'under' (vedenalainen)
  function rock(level, cluster) {
    var sw = 1.5, b = '';
    var line = function (d) { return '<path d="' + d + '" stroke="' + INK + '" stroke-width="' + sw + '" fill="none" stroke-linecap="butt"/>'; };
    var ax = 8, ay = 8;
    if (level === 'above') {            // ⊥: perusviiva alhaalla, asemapiste viivojen liitoskohdassa
      b = line('M3 10.5H13M8 10.5V3.5');
      if (cluster) b += dot(4.4, 6.6) + dot(11.6, 6.6);
      ay = 10.5;
    } else if (level === 'under') {     // ⊤: poikkiviiva ylhäällä
      b = line('M3 5.5H13M8 5.5V12.5');
      if (cluster) b += dot(4.4, 9.4) + dot(11.6, 9.4);
      ay = 5.5;
    } else {                            // +: vedenrajassa
      b = line('M8 3V13M3 8H13');
      if (cluster) b += dot(5, 5) + dot(11, 5) + dot(5, 11) + dot(11, 11);
    }
    return { html: svg(16, 16, 16, 16, b), w: 16, h: 16, ax: ax, ay: ay };
  }

  // ---------- viitat ja muut navigointilajin merkit ----------
  // navigointilajikoodi (Väylävirasto): 1 vasen, 2 oikea, 3 pohjois, 4 etelä, 5 länsi, 6 itä,
  // 7 karimerkki, 8 turvavesimerkki, 9 erikoismerkki
  // ECDIS-värit (S-52 / IALA A, Suomi): vasen punainen, oikea vihreä, kardinaalit keltamustia,
  // karimerkki mustapunamusta, turvavesi punavalkoinen, erikoismerkki keltainen. Paperikartan
  // merkkienselityksen mukaiset mustat merkit ovat oletus.
  var EC = { r: '#e2211c', g: '#13a04a', y: '#f2c311', b: '#111', w: '#fff' };
  // varren värijaksot ylhäältä alas
  var BANDS = { 1: ['r'], 2: ['g'], 3: ['b', 'y'], 4: ['y', 'b'], 5: ['y', 'b', 'y'], 6: ['b', 'y', 'b'], 7: ['b', 'r', 'b'], 8: ['rw'], 9: ['y'], 0: ['b'] };
  function body(nl, top) {
    var bands = BANDS[nl] || ['b'], y0 = top, y1 = 24.1, hgt = (y1 - y0) / bands.length, s = '';
    bands.forEach(function (c, i) {
      var y = y0 + i * hgt;
      if (c === 'rw') s += '<rect x="8.5" y="' + y + '" width="1.5" height="' + hgt + '" fill="' + EC.r + '"/><rect x="10" y="' + y + '" width="1.5" height="' + hgt + '" fill="#fff"/>';
      else s += '<rect x="8.5" y="' + y + '" width="3" height="' + hgt + '" fill="' + EC[c] + '"/>';
    });
    return s + '<rect x="8.5" y="' + y0 + '" width="3" height="' + (y1 - y0) + '" fill="none" stroke="' + INK + '" stroke-width=".6"/>';
  }
  function topmark(nl, ec) {
    var f = ' fill="' + INK + '"';
    if (ec) {
      if (nl === 1) return '<rect x="8.3" y="3.6" width="3.4" height="6.4" fill="' + EC.r + '" stroke="' + INK + '" stroke-width=".7"/>';
      if (nl === 2) return '<path d="M10 2.8L13.2 10H6.8Z" fill="' + EC.g + '" stroke="' + INK + '" stroke-width=".7"/>';
      if (nl === 8) return '<circle cx="10" cy="6.6" r="2.7" fill="' + EC.r + '" stroke="' + INK + '" stroke-width=".7"/>';
      if (nl === 9) return '<path d="M7.4 3.4L12.6 8.6M12.6 3.4L7.4 8.6" stroke="' + INK + '" stroke-width="2.6"/><path d="M7.4 3.4L12.6 8.6M12.6 3.4L7.4 8.6" stroke="' + EC.y + '" stroke-width="1.5"/>';
    }
    switch (nl) {
      case 1: return '<rect x="8.3" y="3.6" width="3.4" height="6.4" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>';
      case 2: return '<path d="M10 2.8L13.2 10H6.8Z"' + f + '/>';
      case 3: return '<path d="M10 1L12.9 5.3H7.1ZM10 5.9L12.9 10.2H7.1Z"' + f + '/>';
      case 4: return '<path d="M7.1 1H12.9L10 5.3ZM7.1 5.9H12.9L10 10.2Z"' + f + '/>';
      case 5: return '<path d="M7.1 1H12.9L10 5.3ZM10 5.9L12.9 10.2H7.1Z"' + f + '/>';
      case 6: return '<path d="M10 1L12.9 5.3H7.1ZM7.1 5.9H12.9L10 10.2Z"' + f + '/>';
      case 7: return '<circle cx="10" cy="3.3" r="2.2"' + f + '/><circle cx="10" cy="8.1" r="2.2"' + f + '/>';
      case 8: return '<circle cx="10" cy="6.6" r="2.7" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>';
      case 9: return '<path d="M7.4 3.4L12.6 8.6M12.6 3.4L7.4 8.6" stroke="' + INK + '" stroke-width="1.6"/>';
      default: return '';
    }
  }
  function base(cx, cy) {
    return '<path d="M' + (cx - 4.6) + ' ' + cy + 'H' + (cx - 1.9) + 'M' + (cx + 1.9) + ' ' + cy + 'H' + (cx + 4.6) + '" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<circle class="pos" cx="' + cx + '" cy="' + cy + '" r="1.9" fill="#fff" stroke="' + INK + '" stroke-width="1.1"/>';
  }
  function mark(nl, ec) {
    var top = (nl === 2 || nl === 8) ? 10 : 10.2;
    var b = (ec ? body(nl || 0, top) : '<path d="M10 ' + top + 'V24.1" stroke="' + INK + '" stroke-width="1.3"/>') + topmark(nl, ec) + base(10, 26);
    // näytöllä 18 x 27 px; asemapiste on asemaympyrän keskellä
    return { html: svg(20, 30, 18, 27, b), w: 18, h: 27, ax: 9, ay: 23.4 };
  }

  // Kummeli: musta kumpu perusviivalla
  function cairn() {
    var b = '<path d="M2 11H18" stroke="' + INK + '" stroke-width="1.1"/><path d="M6.3 11L7.7 6.2H12.3L13.7 11Z" fill="' + INK + '"/>';
    return { html: svg(20, 14, 20, 14, b), w: 20, h: 14, ax: 10, ay: 11 };
  }
  // Tunnusmajakka: tornin ääriviiva ja asemaympyrä
  function beaconTower() {
    var b = '<path d="M6.8 19.2L7.8 5.5H12.2L13.2 19.2" fill="none" stroke="' + INK + '" stroke-width="1.3"/>' + base(10, 21);
    return { html: svg(20, 24, 20, 24, b), w: 20, h: 24, ax: 10, ay: 21 };
  }
  // Linjamerkki: pystysuora taulu (puoliksi musta) varren päässä
  function leadingMark() {
    var b = '<rect x="6.5" y="3" width="2.5" height="9" fill="' + INK + '"/><rect x="6.5" y="3" width="5" height="9" fill="none" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M9 12V19.1" stroke="' + INK + '" stroke-width="1.3"/>' + base(9, 21);
    return { html: svg(18, 24, 18, 24, b), w: 18, h: 24, ax: 9, ay: 21 };
  }
  // Loisto, apuloisto ja sektoriloisto: asemaympyrä (valon pisara piirretään erikseen)
  function lightStructure() {
    var b = '<circle class="pos" cx="8" cy="8" r="2.6" fill="#fff" stroke="' + INK + '" stroke-width="1.3"/><circle cx="8" cy="8" r=".9" fill="' + INK + '"/>';
    return { html: svg(16, 16, 16, 16, b), w: 16, h: 16, ax: 8, ay: 8 };
  }
  // Merimajakka: tähti ympyrässä
  function lighthouse() {
    var star = '<path d="M11 4.6L16.5 14.1H5.5ZM11 17.4L5.5 7.9H16.5Z" fill="none" stroke="' + INK + '" stroke-width="1.1"/>';
    var b = '<circle cx="11" cy="11" r="9" fill="none" stroke="#9b2c8f" stroke-width="1.4"/>' + star;
    return { html: svg(22, 22, 22, 22, b), w: 22, h: 22, ax: 11, ay: 11 };
  }
  // Tutkamajakka: magentan värinen ympyrä
  function racon() {
    var b = '<circle cx="9" cy="9" r="7" fill="none" stroke="#9b2c8f" stroke-width="1.6"/><circle cx="9" cy="9" r="1.6" fill="' + INK + '"/>';
    return { html: svg(18, 18, 18, 18, b), w: 18, h: 18, ax: 9, ay: 9 };
  }
  function generic() {
    var b = '<circle cx="8" cy="8" r="2.6" fill="#fff" stroke="' + INK + '" stroke-width="1.3"/>';
    return { html: svg(16, 16, 16, 16, b), w: 16, h: 16, ax: 8, ay: 8 };
  }

  // ---------- valot ----------
  // Väylävirasto: v valkoinen, p punainen, vi vihreä, k keltainen, si sininen.
  // Selitteessä valkoisen valon pisara ja sektori on keltainen.
  var LIGHT_COL = { v: '#f2c311', k: '#f2c311', p: '#e2211c', vi: '#13a04a', si: '#2a6fd6' };
  function lightColour(code) { return LIGHT_COL[String(code || '').toLowerCase()] || '#d3239c'; }
  // Valon pisara asemapisteestä suuntaan angle (astetta pohjoisesta myötäpäivään).
  function flare(code, angle) {
    var col = lightColour(code), a = angle == null ? 135 : angle;
    var d = 'M0 3.2C-2.9 8 -4 13.4 -3.2 17.6C-2.5 21.2 2.5 21.2 3.2 17.6C4 13.4 2.9 8 0 3.2Z';
    var b = '<g transform="translate(24 24) rotate(' + (a - 180) + ')"><path d="' + d + '" fill="' + col + '" stroke="rgba(0,0,0,.45)" stroke-width=".5"/></g>';
    return { html: svg(48, 48, 48, 48, b), w: 48, h: 48, ax: 24, ay: 24 };
  }

  // selitykseen: asemaympyrä ja valon pisara yhdessä luonnollisessa koossa
  function lightLegend(code) {
    var d = 'M0 3.2C-2.9 8 -4 13.4 -3.2 17.6C-2.5 21.2 2.5 21.2 3.2 17.6C4 13.4 2.9 8 0 3.2Z';
    var b = '<g transform="translate(8 8) rotate(-45)"><path d="' + d + '" fill="' + lightColour(code) + '" stroke="rgba(0,0,0,.45)" stroke-width=".5"/></g>' +
      '<circle cx="8" cy="8" r="2.6" fill="#fff" stroke="' + INK + '" stroke-width="1.3"/><circle cx="8" cy="8" r=".9" fill="' + INK + '"/>';
    return { html: svg(30, 30, 30, 30, b), w: 30, h: 30, ax: 8, ay: 8 };
  }
  function icon(sym, cls, extra) {
    return L.divIcon({ className: cls || 'sym-ico', html: sym.html + (extra || ''), iconSize: [sym.w, sym.h], iconAnchor: [sym.ax, sym.ay] });
  }

  global.ChartSymbols = {
    rock: rock, mark: mark, cairn: cairn, beaconTower: beaconTower, leadingMark: leadingMark,
    lightStructure: lightStructure, lighthouse: lighthouse, racon: racon, generic: generic,
    flare: flare, lightColour: lightColour, lightLegend: lightLegend, icon: icon
  };
})(window);
