"""Puhelin ja tabletti: sivu mahtuu näytölle, valikot valikkonapin takana, kirjasto alhaalta,
reitin lisäys napauttamalla ja painikkeilla, dialogit yhdessä sarakkeessa."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file:///home/claude/reittikartta/index.html')
fails = []


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


def inside(page, sel):
    return page.evaluate("""(s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect();
        return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }""", sel)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1500)
    check(page.evaluate("document.documentElement.scrollWidth") <= 390, 'sivu mahtuu puhelimen leveyteen')
    check(inside(page, '.modal button.primary'), 'tervetuloikkunan painike näkyy')
    page.locator('button:has-text("Aloita")').first.tap()
    page.evaluate("App.map.setView([61.617, 23.75], 14)"); page.wait_for_timeout(2000)
    for sel in ('#menuBtn', '#searchIn', '#panelToggle', '#baseSwitch', '#toolbar', '#disclaimer'):
        check(inside(page, sel), sel + ' näkyy kokonaan')
    check(not page.locator('#readout').is_visible(), 'tyhjä lukemalaatikko piilossa puhelimessa')
    check(page.evaluate("document.body.classList.contains('panel-closed')"), 'kirjasto kiinni käynnistyksessä')
    check(page.evaluate("getComputedStyle(document.getElementById('menubar')).display") == 'none', 'valikkorivi piilossa')
    check(page.evaluate("Math.min(...[...document.querySelectorAll('#toolbar .tb')].map(b => b.getBoundingClientRect().height))") >= 40, 'työkalupainikkeet vähintään 40 px')

    # valikkonappi: valikot, alus ja reittisuodatin
    page.tap('#menuBtn'); page.wait_for_timeout(300)
    labels = page.evaluate("[...document.querySelectorAll('#ctxmenu button')].map(b => b.textContent.trim())")
    check(not page.evaluate("document.getElementById('ctxmenu').hidden") and any(l.startswith('Näytä') for l in labels) and 'Lisää alus…' in labels, 'valikkonappi avaa valikon: %s' % labels)
    page.locator('#ctxmenu button', has_text='Näytä').first.tap(); page.wait_for_timeout(300)
    check(page.evaluate("document.querySelector('#ctxmenu .mh-t').textContent") == 'Näytä' and inside(page, '#ctxmenu'), 'Näytä-valikko aukeaa ja mahtuu näytölle')
    page.keyboard.press('Escape')
    shot(page, 'm1-puhelin')

    # kirjasto alhaalta
    page.tap('#panelToggle'); page.wait_for_timeout(400)
    r = page.evaluate("(() => { const r = document.getElementById('panel').getBoundingClientRect(); return [r.left, r.right, r.bottom, r.height]; })()")
    check(r[0] == 0 and abs(r[1] - 390) < 1 and abs(r[2] - 844) < 1 and 300 < r[3] < 600, 'kirjasto avautuu alhaalta koko leveydelle: %s' % r)
    page.locator('#panel button', has_text='Uusi reitti').first.tap(); page.wait_for_timeout(400)
    check(page.evaluate("document.body.classList.contains('panel-closed')"), 'kirjasto sulkeutuu, kun reitti aloitetaan')

    # reittipisteet napauttamalla, poisto ja valmis painikkeilla
    for x, y in ((150, 300), (230, 420), (300, 520), (330, 600)):
        page.touchscreen.tap(x, y); page.wait_for_timeout(250)
    check(page.evaluate("Store.state.routes[0].points.length") == 4, 'neljä reittipistettä napauttamalla')
    page.locator('#editBanner button', has_text='Poista viimeinen').tap(); page.wait_for_timeout(200)
    check(page.evaluate("Store.state.routes[0].points.length") == 3, 'Poista viimeinen -painike')
    page.locator('#editBanner button', has_text='Valmis').tap(); page.wait_for_timeout(400)
    check(page.evaluate("App.mode()") == 'idle' and page.evaluate("Store.state.routes.length") == 1, 'Valmis lopettaa lisäyksen')
    shot(page, 'm2-reitti')

    # ominaisuudet: yksi sarake, alus kirjoitetaan
    rid = page.evaluate("Store.state.routes[0].id")
    page.evaluate(f"Routes.openProperties('{rid}')"); page.wait_for_timeout(400)
    check(page.evaluate("getComputedStyle(document.querySelector('.modal .form')).gridTemplateColumns.split(' ').length") == 1, 'dialogi yhdessä sarakkeessa')
    check(inside(page, '.modal'), 'dialogi mahtuu näytölle')
    check(page.evaluate("parseFloat(getComputedStyle(document.getElementById('pFrom')).fontSize)") >= 16, 'syöttökentissä 16 px fontti (iOS ei suurenna)')
    shot(page, 'm3-ominaisuudet')
    page.keyboard.press('Escape')

    # esitystavan painike kosketuksella
    page.tap('#baseSwitch [data-base=vector]'); page.wait_for_timeout(1200)
    check(page.evaluate("ChartAPI.baseMode") == 'vector', 'Vektori-painike toimii kosketuksella')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    ctx.close()

    # tabletti pystyssä ja puhelin vaakatasossa
    for W, H in ((768, 1024), (844, 390)):
        ctx = b.new_context(viewport={'width': W, 'height': H}, is_mobile=True, has_touch=True)
        page = ctx.new_page(); page.route('**/*', handle)
        page.goto(TARGET); page.wait_for_timeout(1200)
        page.locator('button:has-text("Aloita")').first.tap(); page.wait_for_timeout(800)
        check(page.evaluate("document.documentElement.scrollWidth") <= W, '%dx%d: sivu mahtuu leveyteen' % (W, H))
        check(inside(page, '#menuBtn') and inside(page, '#baseSwitch') and inside(page, '#toolbar'), '%dx%d: painikkeet näkyvissä' % (W, H))
        ctx.close()
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
