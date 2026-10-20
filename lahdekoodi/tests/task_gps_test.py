"""Kevyt testi: OSM-maapohja oletuksena, haun merimailit, tehtäväpaikan haku ja tarkistus kartalla, oma sijainti."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file:///home/claude/reittikartta/dist/Reittikartta.html')
OUT = os.environ.get('OUT', '/tmp/claude-0/-home-claude/74e0aa7c-c475-5fe4-b667-8f06c2ef4f56/scratchpad')
fails = []
def check(c, m):
    print(('OK   ' if c else 'VIKA ') + m)
    if not c: fails.append(m)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 860}, permissions=['geolocation'],
                        geolocation={'latitude': 61.62, 'longitude': 23.80, 'accuracy': 15})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET); page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    check(page.evaluate("Store.state.settings.land") == 'osm' and page.evaluate("ChartAPI.landKind") == 'osm', 'uusi käyttäjä: OSM-maapohja oletuksena')
    # aiemmin tallennettu MML vaihtuu kerran OSM:ksi
    key = page.evaluate("Object.keys(localStorage).find(function(k){return /reitti/i.test(k)})")
    st = json.loads(page.evaluate("localStorage.getItem('%s')" % key))
    st['settings']['land'] = 'mml'; st['settings'].pop('landOsmDefault', None)
    page.evaluate("v => localStorage.setItem('%s', v)" % key, json.dumps(st))
    page.reload(); page.wait_for_timeout(1200)
    if page.locator('button:has-text("Aloita")').count(): page.click('button:has-text("Aloita")')
    check(page.evaluate("Store.state.settings.land") == 'osm', 'tallennettu MML-oletus vaihtuu OSM:ksi')

    page.evaluate("Store.state.settings.mmlKey = 'TESTI'; ChartAPI.setMmlKey('TESTI'); App.map.setView([61.70, 23.90], 11)")
    page.wait_for_timeout(400)
    page.fill('#searchIn', 'viitas'); page.wait_for_timeout(1500)
    txt = page.inner_text('#searchRes')
    check('ALLE 27 MPK' in txt.upper() and ' mpk · ' in txt and ' km' not in txt, 'yläpalkin haku: etäisyys merimaileina')
    page.keyboard.press('Escape')

    # tehtäväpaikan haku
    page.click('#tbTask'); page.wait_for_timeout(300)
    check(page.evaluate("document.activeElement.id") == 'tFind', 'uusi tehtävä: kohdistus hakukenttään')
    page.fill('#tFind', 'viitas'); page.wait_for_timeout(1500)
    rt = page.inner_text('#tRes'); print('tehtävähaku:', rt.replace('\n', ' | ')[:300])
    check(page.locator('#tRes .sr').count() >= 3 and ' mpk · ' in rt, 'lomakkeen haku näyttää osumat merimaileina')
    page.screenshot(path=OUT + '/task_search.png')
    first = page.locator('#tRes .sr b').first.inner_text()
    page.locator('#tRes .sr').first.click(); page.wait_for_timeout(600)
    check(page.locator('.modal').count() == 0, 'valinta sulkee lomakkeen')
    bn = page.inner_text('#editBanner')
    check('Tarkista tehtäväpaikka' in bn and first in bn, 'kartalla tarkistusilmoitus valitun paikan nimellä')
    check(page.locator('.tv-ring').count() == 1 and page.locator('.sres').count() >= 3, 'tarkistusmerkki ja numeroidut osumat kartalla')
    page.screenshot(path=OUT + '/task_verify.png')
    # Esc palaa lomakkeelle muuttamatta paikkaa
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check(page.locator('.modal #tFind').count() == 1 and page.input_value('#tPos') == '' and page.locator('#tRes .sr').count() >= 3, 'Esc palaa lomakkeelle, haku säilyy, paikka ennallaan')
    page.locator('#tRes .sr').first.click(); page.wait_for_timeout(500)
    # kartan napautus tarkentaa paikkaa
    box = page.locator('#map').bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2 + 60, box['y'] + box['height'] / 2 + 40); page.wait_for_timeout(300)
    check('(siirretty)' in page.inner_text('#editBanner'), 'kartan napautus siirtää paikkaa')
    pos = page.evaluate("(function(){var m=document.querySelector('.tv-ico');return m? m._leaflet_pos:null})()")
    page.click('#editBanner button:has-text("Vahvista paikka")'); page.wait_for_timeout(400)
    check(page.locator('.modal').count() == 1 and 'tarkistettu kartalla' in page.inner_text('#tPrev'), 'vahvistus palaa lomakkeelle, paikka merkitty tarkistetuksi')
    nm = page.input_value('#tName'); print('nimi:', nm)
    check(first in nm, 'oletusnimeen lisätään paikan nimi')
    check(page.locator('#editBanner').is_hidden() and page.locator('.tv-ring').count() == 0, 'tarkistusmerkki ja ilmoitus poistuvat')
    page.click('.modal button:has-text("Luo tehtävä")'); page.wait_for_timeout(400)
    tk = page.evaluate("Store.state.tasks")
    check(len(tk) == 1 and tk[0]['lat'] is not None, 'tehtävä luodaan tarkistettuun paikkaan')

    # oma sijainti
    page.click('#tbGps'); page.wait_for_timeout(1200)
    check(page.locator('.gps-dot').count() == 1 and page.evaluate("document.getElementById('tbGps').classList.contains('on')"), 'oma sijainti näkyy luvan jälkeen')
    ro = page.inner_text('#roGps'); print('lukema:', ro)
    check(page.locator('#roGps').is_visible() and '61°' in ro and '±15 m' in ro, 'lukemissa oma sijainti ja tarkkuus')
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.62) < 0.05, 'ensimmäinen sijainti keskitetään')
    page.screenshot(path=OUT + '/gps.png')
    page.click('#tbGps'); page.wait_for_timeout(300)
    check(page.locator('.gps-dot').count() == 0 and page.locator('#roGps').is_hidden(), 'toinen napautus lopettaa seurannan')
    check(not errs, 'ei JS-virheitä ' + '; '.join(errs[:3]))
    b.close()
print('VIKOJA', len(fails))
