"""ENC-karttapohja: valinta, kattavuuden tarkistus ja paluu rasteriin.
Testipalvelin kertoo ENC:n kattavan vain alueet, joiden näkymän keskikohta on itään 23,75°:sta."""
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


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.66, 23.80], 14)")
    page.wait_for_timeout(1500)
    n_enc = lambda: page.evaluate("document.querySelectorAll('.leaflet-chart-pane img[src*=\"s57/wms\"]').length")
    raster_on = lambda: page.evaluate("App.map.hasLayer(ChartAPI.base.charts)")
    check(raster_on() and n_enc() == 0, 'oletuksena rasterikartta')

    # valinta valikosta
    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='ENC, perinteiset symbolit').first.click()
    page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.encShown") and n_enc() > 0, 'ENC-tiilet näkyvät katetulla alueella')
    check(not raster_on(), 'rasteri on pois ENC:n alta')
    check(page.evaluate("ChartAPI.base.charts.options.pane") == 'chartPane', 'rasteritaso on edelleen karttapaneelissa')
    url = page.evaluate("document.querySelector('.leaflet-chart-pane img[src*=\"s57/wms\"]').src")
    check('style-id-245' in url and 'crs=epsg%3a3857' in url.lower(), 'pyyntö: perinteiset symbolit ja EPSG:3857')
    check(page.evaluate("document.querySelector('.enc-note').hidden"), 'ei huomautusta katetulla alueella')
    shot(page, 'e1-enc')

    # siirto alueelle, jota ENC ei kata
    page.evaluate("App.map.setView([61.66, 23.70], 14)")
    page.wait_for_timeout(1500)
    check(raster_on() and not page.evaluate("ChartAPI.encShown"), 'kattamattomalla alueella näytetään rasteri')
    note = page.evaluate("(() => { const n = document.querySelector('.enc-note'); return n.hidden ? '' : n.textContent; })()")
    check('ENC-aineistoa ei ole' in note, 'huomautus näkyy: ' + note)
    shot(page, 'e2-ei-kattavuutta')

    # takaisin katetulle alueelle ja ECDIS-tyyli
    page.evaluate("App.map.setView([61.66, 23.80], 14)")
    page.wait_for_timeout(1200)
    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='ENC, ECDIS-symbolit').first.click()
    page.wait_for_timeout(1500)
    url = page.evaluate("(() => { const i = document.querySelector('.leaflet-chart-pane img[src*=\"s57/wms\"]'); return i ? i.src : ''; })()")
    check('style-id-202' in url, 'ECDIS-symbolit käytössä')

    # valinta säilyy uudelleenlatauksessa
    page.wait_for_timeout(400)
    page.reload(); page.wait_for_timeout(2500)
    check(page.evaluate("ChartAPI.baseMode") == 'enc-ecdis', 'valinta säilyy uudelleenlatauksen yli')

    # takaisin rasteriin
    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='rasterikartta').first.click()
    page.wait_for_timeout(1200)
    check(raster_on() and n_enc() == 0, 'paluu rasterikarttaan')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
