"""Paikkahaku ja tehtävän koordinaattien syöttö."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot, mml_name_log
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
    page.evaluate("App.map.setView([61.70, 23.90], 11)")

    # koordinaatti hakukenttään
    page.fill('#searchIn', '61 35,1N 23 45,2E')
    page.wait_for_timeout(600)
    check('61°35,100' in page.inner_text('#searchRes'), 'koordinaatti tunnistetaan hakukentässä')
    page.press('#searchIn', 'Enter'); page.wait_for_timeout(500)
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.585) < 1e-4 and abs(c['lng'] - 23.75333) < 1e-4, 'kartta siirtyy koordinaattiin')

    # turvalaite nimellä (Väylävirasto)
    page.fill('#searchIn', 'testi 3')
    page.wait_for_timeout(1200)
    txt = page.inner_text('#searchRes')
    print('tulokset:', txt.replace('\n', ' | '))
    check('Testi 3' in txt and 'turvalaite' in txt.lower(), 'turvalaite löytyy nimellä')
    page.locator('#searchRes .sr', has_text='Testi 3').first.click(); page.wait_for_timeout(500)
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.615) < 1e-3 and abs(c['lng'] - 23.747) < 1e-3, 'kartta siirtyy turvalaitteeseen')

    # oma merkki
    page.evaluate("Store.state.marks.push({id:'mk-x',lat:61.66,lng:23.81,name:'Rantasauna',type:'general',status:'approved'}); Store.emit('marks')")
    page.fill('#searchIn', 'rantas'); page.wait_for_timeout(800)
    check('Rantasauna' in page.inner_text('#searchRes'), 'oma merkki löytyy')

    # paikannimi Maanmittauslaitokselta API-avaimella
    page.evaluate("Store.state.settings.mmlKey = 'TESTI'; ChartAPI.setMmlKey('TESTI')")
    page.fill('#searchIn', 'testisaa'); page.wait_for_timeout(1200)
    txt = page.inner_text('#searchRes')
    print('nimet:', txt.replace('\n', ' | ')); check('Testisaari' in txt, 'paikannimi löytyy nimistöstä')
    page.keyboard.press('Escape')

    # samannimiset paikat: lähialue ensin, etäisyys ja suunta, numerot kartalla
    page.evaluate("App.map.setView([61.70, 23.90], 11)"); page.wait_for_timeout(500)
    del mml_name_log[:]
    page.fill('#searchIn', 'viitasaa'); page.wait_for_timeout(1500)
    rs = page.evaluate("Search.results.map(r => [r.name, Math.round(r.km), r.no])")
    print('viitasaaret:', rs)
    kms = [r[1] for r in rs]
    check(len(rs) == 5 and kms == sorted(kms), 'viisi samannimistä, järjestys etäisyyden mukaan: %s' % kms)
    txt = page.inner_text('#searchRes')
    check('ALLE 27 MPK' in txt.upper() and 'KAUEMPANA' in txt.upper() and txt.upper().index('ALLE 27 MPK') < txt.upper().index('KAUEMPANA'), 'lähialue ennen kauempana olevia')
    check(' mpk · ' in txt and '°' in txt, 'etäisyys merimaileina ja suunta näkyvät')
    check(page.evaluate("document.querySelectorAll('.sres').length") == 5, 'tulokset numeroituina kartalla')
    check(any('bbox=' in u for u in mml_name_log) and any('bbox=' not in u for u in mml_name_log) and all('viitasaa' in u for u in mml_name_log),
          'haku sekä lähialueelta että koko maasta jokerihaulla')
    page.keyboard.press('ArrowDown'); page.wait_for_timeout(200)
    check(page.evaluate("document.querySelector('.sres.on') && document.querySelector('.sres.on').textContent") == '1', 'nuolinäppäin korostaa tuloksen kartalla')
    shot(page, 'h2-samannimiset')
    # kartalla olevan numeron klikkaus valitsee paikan
    page.locator('.sres', has_text='2').first.click(); page.wait_for_timeout(600)
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.80) < 1e-3 and abs(c['lng'] - 24.10) < 1e-3, 'numeron klikkaus kartalla siirtää paikkaan')
    check(page.evaluate("document.querySelectorAll('.sres').length") == 0, 'valinnan jälkeen numerot poistuvat')

    # sanan alku: viitas → sekä Viitasaaret että Viitasalmi; nimen keskeltä lähialueelta: salmi → Viitasalmi
    page.evaluate("App.map.setView([61.70, 23.90], 11)"); page.wait_for_timeout(400)
    page.fill('#searchIn', 'viitas'); page.wait_for_timeout(1500)
    names = page.evaluate("Search.results.map(r => r.name)")
    check('Viitasalmi' in names and 'Viitasaari' in names, 'osittainen sana viitas löytää Viitasaaret ja Viitasalmen: %s' % names)
    page.fill('#searchIn', 'salmi'); page.wait_for_timeout(1500)
    check('Viitasalmi' in page.evaluate("Search.results.map(r => r.name)"), 'nimen keskeltä haku lähialueelta (salmi → Viitasalmi)')
    page.keyboard.press('Escape')

    # lähialueen tulokset eivät näy: kartta siirtyy niihin kerran
    page.evaluate("App.map.setView([61.70, 23.90], 16)"); page.wait_for_timeout(500)
    page.fill('#searchIn', 'viitasaari'); page.wait_for_timeout(1500)
    z = page.evaluate("App.map.getZoom()")
    vis = page.evaluate("Search.results.filter(r => r.km <= 50).every(r => App.map.getBounds().contains([r.lat, r.lng]))")
    check(z <= 13 and vis, 'kartta näyttää lähialueen tulokset (taso %d)' % z)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(page.evaluate("document.querySelectorAll('.sres').length") == 0, 'Esc poistaa tulokset kartalta')

    # tehtävän koordinaatit
    page.click('#tbTask'); page.wait_for_timeout(300)
    page.fill('#tPos', '61 35,1N')
    check('lisää vielä pituus' in page.inner_text('#tPrev'), 'pelkkä leveys: pyydetään pituus')
    page.fill('#tPos', '61 35 11N 23 45 30E')
    check("61°35,183'N 023°45,500'E" in page.inner_text('#tPrev'), 'asteet minuutit sekunnit välilyönnein')
    page.fill('#tPos', '61,5N 23,75E')
    check("61°30,000'N 023°45,000'E" in page.inner_text('#tPrev'), 'desimaaliasteet')
    page.fill('#tPos', '61 35,1N 23 45,2E')
    check("61°35,100'N 023°45,200'E" in page.inner_text('#tPrev'), 'asteet ja minuutit välilyönnein')
    page.locator('.modal button', has_text='Luo tehtävä').click(); page.wait_for_timeout(400)
    t = page.evaluate("Store.state.tasks[Store.state.tasks.length-1]")
    check(abs(t['lat'] - 61.585) < 1e-9 and abs(t['lng'] - 23.7533333) < 1e-6, 'tehtävä tallentui oikeaan paikkaan')
    shot(page, 'h1-haku')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
