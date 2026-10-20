/* Reittikartta – vesiliikennemerkit karttamerkkeinä.
 *
 * Merkit piirretään vesiliikennelain (782/2019) 4 luvun mukaisina merkkikilpinä pienennettyinä:
 *   - kielto-, määräys-, rajoitus- ja varoitusmerkki: neliö, punaiset reunat, valkoinen keskusta
 *     ja musta kuvio tai merkintä (59–62 §); kieltomerkissä lisäksi punainen diagonaaliviiva (59 §)
 *   - tiedotusmerkki: neliö, sinisellä pohjalla valkoinen kuvio (63 §)
 *   - kaapeli- ja johtotaulu: krominkeltainen suorakaide, mustat isot kirjaimet (98 §)
 *   - suuntamerkki: punainen ympyrä valkoisella reunuksella, ylemmässä lisäksi kärjellään oleva
 *     punareunainen neliö (99 §)
 *
 * Väyläviraston rekisterissä merkin laji on vain koodina (vlmlajityyppi). Koodien merkitykset on
 * päätelty rekisterin aineistosta: koodit noudattavat lain merkkien järjestystä (kieltomerkit 1–10
 * kuten 66–75 §, tiedotusmerkit 22–30 kuten 88–95 §), ja merkkien sijainnit ja lisäkilpien tekstit
 * vahvistavat tulkinnan (esim. koodi 17 siltapilareissa 12,2 m = kulkuleveys, koodi 10
 * "300 m rannasta" = vesiskootterikielto). Tuntematon koodi näytetään yleisenä merkkinä. */
(function (global) {
  'use strict';

  var RED = '#d7191c', BLUE = '#1f5fbf', INK = '#111', YEL = '#f4c400';

  // kuviot 20 × 20 -ruudukossa (merkin sisäala noin 4…16); c = kuvion väri
  var P = {
    anchor: function (c) {
      return '<circle cx="10" cy="4.6" r="1.4" fill="none" stroke="' + c + '" stroke-width="1.2"/>' +
        '<path d="M10 6V15.6M7.4 7.8H12.6M5.4 11.6Q10 18.2 14.6 11.6" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linecap="round"/>';
    },
    letterP: function (c) { return '<text x="10" y="14.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="' + c + '">P</text>'; },
    bollard: function (c) {
      return '<path d="M7.6 8.4H12.4V15.4H7.6Z M6.6 7H13.4V8.6H6.6Z" fill="' + c + '"/>' +
        '<path d="M4 7.6Q6.4 9.8 7.6 11.4" fill="none" stroke="' + c + '" stroke-width="1.3"/>';
    },
    arrowsSame: function (c) {
      return '<path d="M7 15.5V6.2M13 15.5V6.2" stroke="' + c + '" stroke-width="1.6"/>' +
        '<path d="M7 4L4.9 7.4H9.1ZM13 4L10.9 7.4H15.1Z" fill="' + c + '"/>';
    },
    arrowsOpp: function (c) {
      return '<path d="M7 15.5V6.2M13 4.5V13.8" stroke="' + c + '" stroke-width="1.6"/>' +
        '<path d="M7 4L4.9 7.4H9.1ZM13 16L10.9 12.6H15.1Z" fill="' + c + '"/>';
    },
    waves: function (c) {
      return '<path d="M4 8.4Q5.5 6.6 7 8.4T10 8.4T13 8.4T16 8.4M4 12.6Q5.5 10.8 7 12.6T10 12.6T13 12.6T16 12.6" fill="none" stroke="' + c + '" stroke-width="1.4"/>';
    },
    skier: function (c) {
      return '<circle cx="12.4" cy="5" r="1.4" fill="' + c + '"/>' +
        '<path d="M12.2 6.6L10.6 11.2L12.6 13.6M11.4 8.4L5 7.4M7.4 14.6H16" fill="none" stroke="' + c + '" stroke-width="1.4" stroke-linecap="round"/>';
    },
    windsurf: function (c) {
      return '<path d="M10.2 4L15 13.4H10.2Z" fill="' + c + '"/><path d="M4.6 15H15.6M10.2 4V15" stroke="' + c + '" stroke-width="1.3"/>';
    },
    propeller: function (c) {
      return '<circle cx="10" cy="10" r="1.5" fill="' + c + '"/>' +
        '<path d="M10 10C7.6 7.4 8.4 4 10.6 4.4C12.4 4.8 11.6 7.6 10 10ZM10 10C12.4 12.6 11.6 16 9.4 15.6C7.6 15.2 8.4 12.4 10 10Z" fill="' + c + '"/>';
    },
    jetski: function (c) {
      return '<circle cx="9.6" cy="5.4" r="1.4" fill="' + c + '"/>' +
        '<path d="M9.4 7L8.6 10.6L11 11.6M9.2 8.4L13 9.6" fill="none" stroke="' + c + '" stroke-width="1.3" stroke-linecap="round"/>' +
        '<path d="M4.4 12.4H14.6L16 11.2L15 14.4H5.6Z" fill="' + c + '"/>';
    },
    hline: function (c) { return '<path d="M4.2 10H15.8" stroke="' + c + '" stroke-width="2.4"/>'; },
    vline: function (c) { return '<path d="M10 4.2V15.8" stroke="' + c + '" stroke-width="2.4"/>'; },
    circle: function (c) { return '<circle cx="10" cy="10" r="3.6" fill="' + c + '"/>'; },
    current: function (c) {
      return '<path d="M4 11.4Q6 7.4 8.4 10.6T12.8 9.8" fill="none" stroke="' + c + '" stroke-width="1.5"/>' +
        '<path d="M16.2 8.6L12 7.6L13.4 11.8Z" fill="' + c + '"/>';
    },
    lightning: function (c) { return '<path d="M11.6 3.6L6.4 11H9.8L8.2 16.4L13.8 8.6H10.4Z" fill="' + c + '"/>'; },
    phone: function (c) {
      return '<path d="M6 5.2C5 6.2 5.2 9.4 7.8 12.2C10.6 15 13.8 15.2 14.8 14.2L15.4 13.4L12.8 11.2L11.6 12.2C10.4 11.6 8.4 9.6 7.8 8.4L8.8 7.2L6.6 4.6Z" fill="' + c + '"/>';
    },
    ferry: function (c, cable) {
      return (cable ? '<path d="M3.6 8.2H16.4" stroke="' + c + '" stroke-width="1"/>' : '') +
        '<path d="M4.2 11.4H15.8L14.2 14.6H5.8Z M7.4 9.2H12.6V11.4H7.4Z" fill="' + c + '"/>';
    },
    vhf: function (c) { return '<text x="10" y="12.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="6.6" fill="' + c + '">VHF</text>'; },
    tap: function (c) {
      return '<path d="M5 7H11.4V9.4H8.4V10.6H6.8V9.4H5Z M11.4 7.6H13.6V9H11.4Z" fill="' + c + '"/>' +
        '<path d="M7.6 12.4Q6.6 14 7.6 15Q8.6 14 7.6 12.4Z" fill="' + c + '"/>';
    }
  };

  function txt(v, y, size, c) {
    return '<text x="10" y="' + y + '" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="' + size + '" fill="' + c + '">' + v + '</text>';
  }
  function fmt(v) { var n = Number(v); return isFinite(n) ? String(Math.round(n * 10) / 10).replace('.', ',') : ''; }
  function numSize(s) { return s.length >= 4 ? 5.6 : s.length === 3 ? 6.8 : 8.4; }

  // rajoitusmerkkien kuviot arvon kanssa (80–83 §, väylän reuna 86 §)
  var V = {
    speed: function (v) { var s = fmt(v); return s ? txt(s, 13.2, numSize(s) + 0.6, INK) : ''; },
    headroom: function (v) { var s = fmt(v); return '<path d="M7.2 3.8H12.8L10 6.8Z" fill="' + INK + '"/>' + (s ? txt(s, 14.4, numSize(s), INK) : ''); },
    depth: function (v) { var s = fmt(v); return '<path d="M7.2 16.2H12.8L10 13.2Z" fill="' + INK + '"/>' + (s ? txt(s, 11.4, numSize(s), INK) : ''); },
    width: function (v) {
      var s = fmt(v);
      return '<path d="M3.6 7.2V12.8L6.4 10ZM16.4 7.2V12.8L13.6 10Z" fill="' + INK + '"/>' + (s ? txt(s, 12.3, Math.min(6.4, numSize(s)), INK) : '');
    },
    edge: function (v) {
      var s = fmt(v);
      return '<path d="M3.6 15.4L10 4.2L16.4 15.4Z" fill="none" stroke="' + INK + '" stroke-width="1.3"/>' + (s ? txt(s, 14, Math.min(5.8, numSize(s)), INK) : '');
    }
  };

  // lajikoodi → { nimi, luokka, kuvio, yksikkö }
  var K = {
    1: ['Ankkurin käyttökielto', 'kielto', 'anchor'],
    2: ['Pysäköimiskielto', 'kielto', 'letterP'],
    3: ['Kiinnittymiskielto', 'kielto', 'bollard'],
    4: ['Ohittamiskielto', 'kielto', 'arrowsSame'],
    5: ['Kohtaamiskielto', 'kielto', 'arrowsOpp'],
    6: ['Aallokon aiheuttamisen kielto', 'kielto', 'waves'],
    7: ['Vesihiihtokielto', 'kielto', 'skier'],
    8: ['Purjelautailukielto', 'kielto', 'windsurf'],
    9: ['Kulkeminen moottorivoimaa käyttäen kielletty', 'kielto', 'propeller'],
    10: ['Vesiskootterilla ajo kielletty', 'kielto', 'jetski'],
    11: ['Nopeusrajoitus', 'rajoitus', 'speed', 'km/h'],
    12: ['Pysähtymismerkki', 'maarays', 'hline'],
    13: ['Yleinen varoitusmerkki', 'varoitus', 'vline'],
    14: ['Annettava äänimerkki', 'maarays', 'circle'],
    15: ['Rajoitettu alikulkukorkeus', 'rajoitus', 'headroom', 'm'],
    16: ['Rajoitettu kulkusyvyys', 'rajoitus', 'depth', 'm'],
    17: ['Rajoitettu kulkuleveys', 'rajoitus', 'width', 'm'],
    18: ['Voimakas virtaus', 'varoitus', 'current'],
    19: ['Väylän reuna', 'varoitus', 'edge', 'm'],
    22: ['Pysäköiminen sallittu', 'tiedotus', 'letterP'],
    23: ['Kiinnittyminen sallittu', 'tiedotus', 'bollard'],
    24: ['Ilmajohto', 'tiedotus', 'lightning'],
    25: ['Puhelin', 'tiedotus', 'phone'],
    26: ['Lauttaväylän risteäminen', 'tiedotus', 'ferry'],
    27: ['Lauttaväylän risteäminen', 'tiedotus', 'ferry'],
    28: ['Mahdollisuus radiopuhelinyhteyteen', 'tiedotus', 'vhf'],
    29: ['Juomavesipiste', 'tiedotus', 'tap'],
    30: ['Kiellon, määräyksen tai rajoituksen päättyminen', 'paattyminen'],
    31: ['Kaapelitaulu', 'taulu'],
    32: ['Johtotaulu', 'taulu'],
    33: ['Kaapelin tai johdon suuntamerkki, alempi', 'suunta'],
    34: ['Kaapelin tai johdon suuntamerkki, ylempi', 'suunta2'],
    35: ['Kaapeli- tai johtotaulu', 'taulu']
  };
  // pinon järjestys tolpassa: kielto, määräys, rajoitus, varoitus ylimpänä ja tiedotus alla
  // (90 §: rajoitettu alikulkukorkeus ylimpänä ilmajohtomerkin päällä)
  var ORDER = { kielto: 1, maarays: 2, rajoitus: 3, varoitus: 4, tiedotus: 5, paattyminen: 6, muu: 7, taulu: 8, suunta2: 9, suunta: 9 };

  function svg(w, h, vw, vh, body) {
    return '<svg viewBox="0 0 ' + vw + ' ' + vh + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + body + '</svg>';
  }
  function plate(cat, body) {
    if (cat === 'tiedotus') return '<rect x=".8" y=".8" width="18.4" height="18.4" rx="1" fill="' + BLUE + '" stroke="#fff" stroke-width="1.2"/>' + body;
    var s = '<rect x="1.2" y="1.2" width="17.6" height="17.6" rx=".8" fill="#fff" stroke="' + RED + '" stroke-width="2.4"/>' + body;
    if (cat === 'kielto') s += '<path d="M3.2 3.2L16.8 16.8" stroke="' + RED + '" stroke-width="2"/>';
    return s;
  }
  // taulun teksti: lisäkilven sana, jos se on lyhyt (esim. VESIJOHTO, MAAKAASU), muuten lajin mukaan
  function boardText(code, p) {
    var t = String(p.lisakilventeksti1 || '').trim();
    if (/^[A-Za-zÅÄÖåäö-]{3,16}$/.test(t)) return t.toUpperCase();
    return code === 31 ? 'KAAPELI' : 'JOHTO';
  }

  // p = rekisterin ominaisuudet; size = kilven koko näytöllä (px)
  function info(p, size) {
    size = size || 18;
    var code = Number(p.vlmlajityyppi), k = K[code];
    var name = k ? k[0] : 'Vesiliikennemerkki', cat = k ? k[1] : 'muu';
    var unit = k && k[3] ? k[3] : '', val = p.rajoitusarvo;
    var html, w = size, h = size;
    if (cat === 'taulu') {
      var t = boardText(code, p), tw = Math.max(26, t.length * 4.3 + 6);
      w = Math.round(size * tw / 20); h = Math.round(size * 0.6);
      html = svg(w, h, tw, 12, '<rect x=".6" y=".6" width="' + (tw - 1.2) + '" height="10.8" fill="' + YEL + '" stroke="' + INK + '" stroke-width="1"/>' +
        '<text x="' + (tw / 2) + '" y="8.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7" fill="' + INK + '">' + t + '</text>');
    } else if (cat === 'suunta' || cat === 'suunta2') {
      var ring = '<circle cx="10" cy="7" r="5.6" fill="' + RED + '" stroke="#fff" stroke-width="1.4"/><circle cx="10" cy="7" r="6.4" fill="none" stroke="' + INK + '" stroke-width=".5"/>';
      w = Math.round(size * 0.8);
      if (cat === 'suunta2') { h = Math.round(w * 1.3); html = svg(w, h, 20, 26, ring + '<path d="M10 13.4L15.4 18.8L10 24.2L4.6 18.8Z" fill="#fff" stroke="' + RED + '" stroke-width="1.6"/>'); }
      else { h = Math.round(w * 0.7); html = svg(w, h, 20, 14, ring); }
    } else if (cat === 'paattyminen') {
      html = svg(w, h, 20, 20, '<rect x="1.2" y="1.2" width="17.6" height="17.6" rx=".8" fill="#fff" stroke="#444" stroke-width="1.4"/><path d="M4 16L16 4" stroke="' + INK + '" stroke-width="2.6"/>');
    } else if (cat === 'muu') {
      html = svg(w, Math.round(size * 0.7), 20, 14, '<rect x=".8" y=".8" width="18.4" height="12.4" rx="1" fill="#fff" stroke="#444" stroke-width="1.2"/>' + txt('…', 9.6, 9, INK));
      h = Math.round(size * 0.7);
    } else {
      var col = cat === 'tiedotus' ? '#fff' : INK;
      var body = V[k[2]] ? V[k[2]](val) : P[k[2]](col, code === 26 || /vaijer/i.test(String(p.lisakilventeksti1 || '') + String(p.lisakilventeksti2 || '')));
      html = svg(w, h, 20, 20, plate(cat, body));
    }
    var valTxt = val != null && val !== '' && unit ? fmt(val) + ' ' + unit : '';
    return { code: code, name: name, cat: cat, order: ORDER[cat] || 7, html: html, w: w, h: h, value: valTxt };
  }

  // selitykseen: kukin luokka yhdellä esimerkillä
  function legend() {
    var ex = [[{ vlmlajityyppi: 1 }, 'Kieltomerkki (ankkurin käyttökielto)'], [{ vlmlajityyppi: 14 }, 'Määräysmerkki (annettava äänimerkki)'],
      [{ vlmlajityyppi: 11, rajoitusarvo: 10 }, 'Rajoitusmerkki (nopeusrajoitus km/h)'], [{ vlmlajityyppi: 15, rajoitusarvo: 4.5 }, 'Rajoitettu alikulkukorkeus (m)'],
      [{ vlmlajityyppi: 13 }, 'Varoitusmerkki (yleinen)'], [{ vlmlajityyppi: 24 }, 'Tiedotusmerkki (ilmajohto)'],
      [{ vlmlajityyppi: 31 }, 'Kaapelitaulu'], [{ vlmlajityyppi: 30 }, 'Kiellon päättyminen']];
    return ex.map(function (e) { var s = info(e[0], 18); return { html: s.html, label: e[1] }; });
  }

  global.ChartSigns = { info: info, legend: legend, names: K };
})(window);
