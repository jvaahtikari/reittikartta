"""Kevyt testi: Maanmittauslaitoksen laiturit Overpassin ollessa alhaalla, oma sijainti käynnistyy puhelimessa."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import run_ui
from run_ui import handle
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file:///home/claude/reittikartta/dist/Reittikartta.html')
DEVICE = os.environ.get('DEVICE', 'Pixel 7')
fails = []
def check(c, m):
    print(('OK   ' if c else 'VIKA ') + m)
    if not c: fails.append(m)

with sync_playwright() as pw:
    # 1) laiturit, kun Overpass ei vastaa
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1200, 'height': 800})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.route('**/*overpass*/**', lambda r: r.abort())
    page.route('**/overpass*', lambda r: r.abort())
    page.goto(TARGET); page.wait_for_timeout(1000)
    page.click('button:has-text("Aloita")')
    page.evaluate("Store.state.settings.mmlKey='TESTI'; ChartAPI.setMmlKey('TESTI'); ChartAPI.setBase('vector'); App.map.setView([61.5115, 23.7745], 16)")
    page.wait_for_timeout(2500)
    check(len(run_ui.mml_pier_log) > 0, 'laituriviivat haetaan Maanmittauslaitokselta (%d hakua)' % len(run_ui.mml_pier_log))
    check(page.evaluate("ChartAPI.pierCount") > 0, 'laiturit piirtyvät, vaikka Overpass ei vastaa (%d)' % page.evaluate("ChartAPI.pierCount"))
    check(not errs, 'ei JS-virheitä ' + '; '.join(errs[:2]))
    b.close()

    # 2) oma sijainti puhelimessa
    dev = pw.devices[DEVICE]
    br = pw.webkit.launch() if 'iPhone' in DEVICE else pw.chromium.launch()
    ctx = br.new_context(**dev, permissions=['geolocation'], geolocation={'latitude': 61.5115, 'longitude': 23.7745, 'accuracy': 12})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET); page.wait_for_timeout(1000)
    check(page.locator('.gps-dot').count() == 0, 'ennen tervetuloikkunan kuittausta sijaintia ei haeta')
    page.tap('button:has-text("Aloita")'); page.wait_for_timeout(1500)
    check(page.locator('.gps-dot').count() == 1, 'Aloita käynnistää oman sijainnin puhelimessa')
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.5115) < 0.02, 'kartta keskittyy omaan sijaintiin')
    page.reload(); page.wait_for_timeout(1800)
    check(page.locator('.gps-dot').count() == 1, 'seuraavalla avauksella sijainti käynnistyy itsestään')
    page.tap('#tbGps'); page.wait_for_timeout(300)
    check(page.locator('.gps-dot').count() == 0 and page.evaluate("Store.state.settings.gps") is False, 'painike lopettaa ja valinta muistetaan')
    page.reload(); page.wait_for_timeout(1800)
    check(page.locator('.gps-dot').count() == 0, 'lopetettu sijainti ei käynnisty itsestään')
    bb = page.locator('#tbGps').bounding_box()
    check(bb and bb['width'] >= 40 and bb['height'] >= 40 and page.locator('#tbGps').is_visible(), 'sijaintipainike näkyy puhelimessa (%sx%s)' % (bb and round(bb['width']), bb and round(bb['height'])))
    page.tap('#tbGps'); page.wait_for_timeout(1200)
    check(page.locator('.gps-dot').count() == 1 and page.evaluate("Store.state.settings.gps") is True, 'painike käynnistää uudelleen')
    check(not errs, 'ei JS-virheitä ' + '; '.join(errs[:2]))
    br.close()
print('VIKOJA', len(fails))
