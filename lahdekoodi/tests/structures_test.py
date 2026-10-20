"""Vesiliikennemerkit vesiliikennelain mukaisina kilpinä, sillat ja sulut sekä viittojen ECDIS-värit.
DEVICE valitsee puhelinprofiilin (esim. "iPhone 15" tai "Pixel 7")."""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file://' + os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/index.html')
DEVICE = os.environ.get('DEVICE')
fails = []


def check(c, m):
    print(('OK  ' if c else 'FAIL') + ' ' + m)
    if not c:
        fails.append(m)


with sync_playwright() as pw:
    if DEVICE:
        dev = pw.devices[DEVICE]
        bt = pw.webkit if dev.get('default_browser_type') == 'webkit' else pw.chromium
        b = bt.launch(); page = b.new_context(**dev).new_page()
    else:
        b = pw.chromium.launch(); page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET); page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("ChartAPI.setBase('vector'); Store.state.settings.base = 'vector'; App.map.setView([61.623, 23.755], 14)")
    try:
        page.wait_for_function("document.querySelectorAll('.sg-post').length >= 4 && !!document.querySelector('.st-ico')", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(500)

    # --- vesiliikennemerkit ---
    posts = page.evaluate("[...document.querySelectorAll('.sg-post')].map(p => p.querySelectorAll(':scope > svg').length)")
    print('   tolpat:', posts)
    check(len(posts) >= 4, 'merkit näkyvät vektorikartalla oletuksena (%d tolppaa)' % len(posts))
    check(2 in posts, 'samassa paikassa olevat merkit samassa tolpassa')
    # pinon järjestys: alikulkukorkeus (rajoitus) ylimpänä, ilmajohto (tiedotus, sininen) alla
    order = page.evaluate("""(() => { const p = [...document.querySelectorAll('.sg-post')].find(p => p.querySelectorAll(':scope > svg').length === 2);
      return p ? [...p.querySelectorAll(':scope > svg')].map(s => s.querySelector('rect').getAttribute('fill')) : null; })()""")
    check(order == ['#fff', '#1f5fbf'], 'alikulkukorkeus ylimpänä, ilmajohto (sininen tiedotusmerkki) alla: %s' % order)
    # muodot: kaikki päämerkit neliöitä (ei ympyröitä), kieltomerkissä punainen diagonaali, taulu keltainen
    shapes = page.evaluate("""(() => [...document.querySelectorAll('.sg-post svg')].map(s => {
      const r = s.querySelector('rect'); return { fill: r && r.getAttribute('fill'), stroke: r && r.getAttribute('stroke'),
        circle: !!s.querySelector(':scope > circle[stroke="#d7191c"]'), diag: !!s.querySelector('path[d="M3.2 3.2L16.8 16.8"]'), text: s.textContent }; }))()""")
    speed = [s for s in shapes if s['text'] == '9']
    check(speed and speed[0]['stroke'] == '#d7191c' and not speed[0]['circle'], 'nopeusrajoitus on punareunainen neliö (ei pyöreä)')
    check(any(s['diag'] for s in shapes), 'kieltomerkissä punainen diagonaaliviiva')
    check(any(s['fill'] == '#f4c400' and 'PUHELINKAAPELI' in s['text'] for s in shapes), 'kaapelitaulu keltaisena, teksti lisäkilvestä')
    check(any(s['text'] == '…' for s in shapes), 'tuntematon laji yleisenä merkkinä')
    # ponnahdusikkuna: lajin nimi, arvo yksiköineen ja lisäkilpi
    page.evaluate("""(() => { const p = [...document.querySelectorAll('.sg-post')].find(p => p.querySelectorAll(':scope > svg').length === 2); p.click(); })()""")
    page.wait_for_timeout(300)
    pop = page.inner_text('.leaflet-popup-content') if page.query_selector('.leaflet-popup-content') else ''
    print('   ponnahdus:', pop.replace('\n', ' | '))
    check('Rajoitettu alikulkukorkeus 7,4 m' in pop and 'Ilmajohto' in pop and 'Lisäkilpi: Alikulkukorkeus 7,4 m' in pop, 'ponnahdusikkuna: lajit, arvo ja lisäkilpi')
    page.evaluate("App.map.closePopup()")
    shot(page, 'st1-merkit')

    # --- sillat ja sulut ---
    br = page.evaluate("""(() => { const ic = document.querySelector('.st-ico:not(.st-lock):not(.st-open) .st-sym'); if (!ic) return null;
      const m = (ic.style.transform.match(/rotate\\(([-\\d.]+)deg\\)/) || [])[1];
      const A = App.map.latLngToContainerPoint([61.560, 23.700]), B = App.map.latLngToContainerPoint([61.640, 23.760]);
      return { rot: +m, nav: Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI, labs: [...document.querySelectorAll('.st-lab')].map(e => e.textContent) }; })()""")
    print('   silta:', br)
    check(br is not None, 'silta piirtyy')
    if br:
        diff = abs(((br['rot'] - br['nav']) % 180 + 180) % 180 - 90)
        check(diff < 2, 'sillan kansi poikki väylän (kulmaero 90° ± %.1f°)' % diff)
        check('↕ 4,5 m' in br['labs'], 'alikulkukorkeus merkitty sillan viereen')
    page.evaluate("document.querySelector('.st-ico:not(.st-lock):not(.st-open) .st-sym').click()"); page.wait_for_timeout(300)
    pop = page.inner_text('.leaflet-popup-content')
    check('Testisalmen silta' in pop and 'Alikulkukorkeus' in pop and '4,5 m' in pop, 'sillan ponnahdusikkuna')
    page.evaluate("App.map.closePopup(); App.map.setView([61.691, 23.791], 15)"); page.wait_for_timeout(1500)
    lock = page.evaluate("!!document.querySelector('.st-lock')")
    check(lock, 'sulku piirtyy')
    page.evaluate("document.querySelector('.st-lock .st-sym').click()"); page.wait_for_timeout(300)
    pop = page.inner_text('.leaflet-popup-content')
    print('   sulku:', pop.replace('\n', ' | '))
    check('Testisulku' in pop and 'Suurin alus' in pop and 'syväys 2,4 m' in pop, 'sulun ponnahdusikkuna: suurin alus')
    check('Testisulku' in page.inner_text('#map'), 'sulun nimi kartalla')
    shot(page, 'st2-sulku')
    page.evaluate("App.map.closePopup(); App.map.setView([61.761, 23.651], 14)"); page.wait_for_timeout(1500)
    check(page.evaluate("!!document.querySelector('.st-open')"), 'avattava silta omalla merkillään')

    # --- ECDIS-värit ---
    # testiaineiston viitat ovat 23,735–23,787° välillä: kapealla näytöllä taso 13, jotta kaikki ovat näkyvissä
    page.evaluate("App.map.setView([61.616, 23.761], innerWidth < 700 ? 13 : 15)"); page.wait_for_timeout(1500)
    red0 = page.evaluate("[...document.querySelectorAll('.aid-ico rect')].filter(r => r.getAttribute('fill') === '#e2211c').length")
    page.evaluate("Store.state.settings.show.ecdisMarks = true; ChartAPI.refresh()"); page.wait_for_timeout(500)
    cols = page.evaluate("[...new Set([...document.querySelectorAll('.aid-ico rect')].map(r => r.getAttribute('fill')))]")
    print('   ECDIS-värit:', cols)
    check(red0 == 0, 'oletuksena paperikartan mustat viitat')
    check('#e2211c' in cols and '#13a04a' in cols and '#f2c311' in cols, 'ECDIS-värit: punainen vasen, vihreä oikea, keltamusta kardinaali')
    shot(page, 'st3-ecdis')
    page.evaluate("Store.state.settings.show.ecdisMarks = false; ChartAPI.refresh()")

    # --- muut pohjat: oletuksena pois, valikosta päälle ---
    page.evaluate("ChartAPI.setBase('raster'); Store.state.settings.base = 'raster'; App.map.setView([61.623, 23.755], 14)"); page.wait_for_timeout(1500)
    check(page.evaluate("document.querySelectorAll('.sg-post, .st-ico').length") == 0, 'rasteripohjalla oletuksena ei päällekkäisiä merkkejä')
    page.evaluate("Store.state.settings.show.signs = true; Store.state.settings.show.bridges = true; ChartAPI.refresh()"); page.wait_for_timeout(1500)
    check(page.evaluate("document.querySelectorAll('.sg-post').length") >= 4 and page.evaluate("document.querySelectorAll('.st-ico').length") >= 1,
          'valittuna merkit ja sillat näkyvät myös rasteripohjalla')

    check(not errs, 'ei JS-virheitä %s' % errs)
    b.close()

print('TULOS:', 'OK' if not fails else 'VIRHEITÄ %d' % len(fails))
sys.exit(1 if fails else 0)
