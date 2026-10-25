"""AIS-alukset (Digitraffic): merkit ja pelastusalusten korostus, vanhan sijainnin piilotus, himmennys, nopeusvektori, nimet,
aluksen kortti ja tehtäväpainike, haku nimellä, kutsutunnuksella ja MMSI:llä, tehtävälomakkeen haku, hakujen ajastus
(from-parametri, koko haku, piilotettu sivu), kerroksen poisto, yönäyttö ja alusten enimmäismäärä.
Digitraffic korvataan testiaineistolla (run_ui.handle). Ajoaika on noin minuutti.
Ajo: TARGET=file:///.../dist/Reittikartta.html python3 tests/ais_test.py"""
import io
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot, ais_log, ais_state  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.environ.get('TARGET', 'file://' + ROOT + '/dist/Reittikartta.html')
fails = []


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


def attach_errors(page, errs):
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    # selain kirjaa jokaisen 4xx/5xx-vastauksen konsoliin, eikä se ole sovelluksen virhe
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)


def ids(page):
    return sorted(page.evaluate("[...document.querySelectorAll('.ais-w')].map(e => e.dataset.mmsi)"))


def fill_of(page, mmsi):
    return page.evaluate("(m) => { const s = document.querySelector('.ais-w[data-mmsi=\"' + m + '\"] .ais-s'); const e = s && s.querySelector('path, circle'); return e ? e.getAttribute('fill') : null; }", str(mmsi))


def locations(since=0):
    return [l for l in ais_log[since:] if l['path'] == '/locations']


def vessels_bulk(since=0):
    return [l for l in ais_log[since:] if l['path'] == '/vessels']


def pixel(page, mmsi):
    """Merkin keskipisteen väri kuvakaappauksesta."""
    box = page.locator('.ais-w[data-mmsi="%s"]' % mmsi).bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    im = Image.open(io.BytesIO(page.screenshot(clip={'x': cx - 4, 'y': cy - 4, 'width': 8, 'height': 8}))).convert('RGB')
    return im.getpixel((4, 4))


def close_to(px, hexcol, tol=14):
    want = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    return all(abs(a - b) <= tol for a, b in zip(px, want))


def rescue_menu(page, text):
    page.locator('.mi', has_text='Näytä').click()
    page.wait_for_timeout(150)
    page.locator('#ctxmenu button', has_text=text).first.click()
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # ======================= sivu 1: piirto, kortti ja haku (kerros päällä) =======================
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    page = ctx.new_page()
    errs = []
    attach_errors(page, errs)
    page.route('**/*', handle)
    n0 = len(ais_log)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.62, 23.76], 13)")
    page.wait_for_function("window.Ais && Ais.drawnCount >= 9", timeout=8000)
    page.wait_for_timeout(800)   # yksittäisten alustietojen haku ja uudelleenpiirto

    # --- haut ---
    loc = locations(n0)
    check(len(loc) == 1 and 'from' not in loc[0]['query'], 'ensimmäinen sijaintihaku ilman from-parametria (koko aineisto kerralla)')
    ves = vessels_bulk(n0)
    check(len(ves) == 1 and abs(int(ves[0]['query']['from']) - (time.time() * 1000 - 7 * 86400000)) < 300000, 'alustiedot haetaan seitsemän vuorokauden aikaikkunalla')
    check(all(l['user'] == 'Reittikartta' for l in ais_log[n0:]) and len(ais_log) > n0, 'jokaisessa kutsussa otsake Digitraffic-User: Reittikartta (%d kutsua)' % (len(ais_log) - n0))
    page.evaluate("App.map.setZoom(12)"); page.wait_for_timeout(500)
    page.evaluate("App.map.setZoom(14)"); page.wait_for_timeout(500)
    page.evaluate("App.map.setView([61.62, 23.76], 13)"); page.wait_for_timeout(500)
    sing = [l['path'] for l in ais_log[n0:] if l['path'].startswith('/vessels/')]
    check(sorted(sing) == ['/vessels/230100007', '/vessels/230100008'], 'puuttuvat alustiedot haetaan yksitellen kerran, 404-vastaus muistetaan: %s' % sing)

    # --- merkit ---
    got = ids(page)
    want = ['230100001', '230100002', '230100003', '230100004', '230100006', '230100007', '230100008', '230100009', '230100010', '230100011']
    check(got == want, 'merkit piirtyvät (10 alusta, yli tunnin vanha puuttuu): %s' % got)
    check('230100005' not in got, 'yli 60 minuuttia vanha sijainti ei näy')
    check(page.evaluate("Ais.count") == 11, 'vanha sijainti on silti haettu aineistoon (11 alusta)')
    check(page.evaluate("getComputedStyle(document.querySelector('.leaflet-ais-pane')).zIndex") == '465', 'AIS-pane turvalaitteiden (460) yläpuolella')
    check(page.evaluate("document.querySelectorAll('.leaflet-ais-pane .ais-ico').length") == 10, 'merkit ovat aisPanessa')
    check('AIS: Fintraffic / Digitraffic, CC BY 4.0' in page.inner_text('.leaflet-control-attribution'), 'attribuutio näkyy, kun kerros on päällä')

    # --- värit ja muodot ---
    cols = {230100001: '#2e9e44', 230100002: '#1f6fe0', 230100003: '#ff6a13', 230100004: '#ff6a13', 230100006: '#d4282f',
            230100007: '#b05cd6', 230100008: '#9aa3ab', 230100009: '#a0672b', 230100010: '#b05cd6', 230100011: '#19a7c6'}
    bad = {m: fill_of(page, m) for m, c in cols.items() if fill_of(page, m) != c}
    check(not bad, 'värit aluksen tyypin mukaan (rahti, matkustaja, pelastus, säiliö, huvi, tuntematon, kalastus, purje, hinaaja): %s' % bad)
    shapes = page.evaluate("Object.fromEntries([...document.querySelectorAll('.ais-w')].map(e => [e.dataset.mmsi, e.dataset.shape]))")
    check(shapes['230100001'] == 'nuoli' and shapes['230100003'] == 'nuoli' and shapes['230100011'] == 'nuoli', 'liikkuva alus on nuolenkärki')
    check(shapes['230100002'] == 'ympyra' and shapes['230100004'] == 'ympyra' and shapes['230100006'] == 'ympyra', 'kiinnitetty, ankkurissa ja paikallaan oleva alus on ympyrä')
    rot = page.evaluate("document.querySelector('.ais-w[data-mmsi=\"230100001\"] .ais-s').style.transform")
    check(rot == 'rotate(47deg)', 'nuoli kiertyy keulasuuntaan (heading 47°): %s' % rot)
    rot = page.evaluate("document.querySelector('.ais-w[data-mmsi=\"230100007\"] .ais-s').style.transform")
    check(rot == 'rotate(120deg)', 'keulasuunnan puuttuessa käytetään kulkusuuntaa (cog 120°): %s' % rot)
    dims = page.evaluate("Object.fromEntries([...document.querySelectorAll('.ais-w')].map(e => [e.dataset.mmsi, [+e.querySelector('svg').getAttribute('width'), +e.querySelector('svg').getAttribute('height')]]))")
    check(dims['230100001'] == [14, 22] and dims['230100002'] == [10, 10], 'tavallisen aluksen koot: nuoli 14×22, ympyrä 10 px: %s %s' % (dims['230100001'], dims['230100002']))
    check(dims['230100003'][0] > dims['230100001'][0] and dims['230100004'][0] > dims['230100002'][0], 'pelastusalus on suurempi kuin tavallinen alus')
    sw = page.evaluate("Object.fromEntries([...document.querySelectorAll('.ais-w')].map(e => [e.dataset.mmsi, +e.querySelector('path, circle').getAttribute('stroke-width')]))")
    check(sw['230100004'] > sw['230100002'] and sw['230100003'] > sw['230100001'], 'pelastusaluksen reuna on paksumpi')
    check(page.evaluate("document.querySelector('.ais-w[data-mmsi=\"230100001\"] path').getAttribute('stroke')") == '#0d1b26', 'ohut tumma reunaviiva')

    # --- himmennys ---
    op = page.evaluate("Object.fromEntries([...document.querySelectorAll('.ais-w')].map(e => [e.dataset.mmsi, getComputedStyle(e).opacity]))")
    check(op['230100006'] == '0.45' and op['230100001'] == '1', 'yli 10 minuuttia vanha sijainti himmeänä (0,45), tuore täytenä: %s / %s' % (op['230100006'], op['230100001']))

    # --- nopeusvektori ---
    vec = page.evaluate("""[...document.querySelectorAll('path.ais-vec')].map(p => {
        const m = p.getAttribute('d').match(/-?[\\d.]+/g).map(Number);
        return [Math.hypot(m[2] - m[0], m[3] - m[1]), p.getAttribute('stroke'), p.getAttribute('stroke-opacity'), p.getAttribute('pointer-events') || p.getAttribute('class')];
    })""")
    mpp = 40075016.686 * math.cos(math.radians(61.62)) / 2 ** 21
    exp = sorted([11.2, 8.5, 4.0, 3.0])
    gotlen = sorted(v[0] for v in vec)
    ok = len(vec) == 4 and all(abs(g - e * 185.2 / mpp) / (e * 185.2 / mpp) < 0.04 for g, e in zip(gotlen, exp))
    check(ok, 'nopeusvektori vain liikkuville, pituus sog × 0,1 mpk: %s px, odotettu %s' % ([round(g) for g in gotlen], [round(e * 185.2 / mpp) for e in exp]))
    check(sorted(v[1] for v in vec) == sorted(['#2e9e44', '#ff6a13', '#b05cd6', '#19a7c6']), 'vektori aluksen värillä')
    check(page.evaluate("[...document.querySelectorAll('path.ais-vec')].every(p => !p.classList.contains('leaflet-interactive'))"), 'vektori ei ole interaktiivinen')

    # --- nimet ---
    labs = page.evaluate("Object.fromEntries([...document.querySelectorAll('.ais-w')].map(e => [e.dataset.mmsi, (e.querySelector('.ais-n') || {}).textContent || '']))")
    check(labs['230100001'] == 'TESTI RAHTI', 'nimi siistitty (@-merkit ja kaksoisvälilyönti pois): %r' % labs['230100001'])
    check(labs['230100007'] == 'YKSITTAIS ALUS', 'yksittäin haetun aluksen nimi näkyy')
    check(labs['230100008'] == '', 'aluksella ilman alustietoja ei ole nimeä')
    check([labs['230100009'], labs['230100010']].count('') == 1, 'päällekkäin menevä nimi jätetään pois: %r / %r' % (labs['230100009'], labs['230100010']))
    shot(page, 'ais-01-kartta-z13')
    page.evaluate("App.map.setView([61.62, 23.76], 11)"); page.wait_for_timeout(700)
    labs = sorted(page.evaluate("[...document.querySelectorAll('.ais-n')].map(e => e.textContent)"))
    check(labs == ['PV LEPOLAITURI', 'PV PELASTAJA'], 'tasolla 11 vain pelastusalusten nimet: %s' % labs)
    check(page.evaluate("document.querySelectorAll('.ais-n.sar').length") == 2, 'pelastusalusten nimi korostettuna')
    page.evaluate("App.map.setView([61.62, 23.76], 9)"); page.wait_for_timeout(700)
    check(page.locator('.ais-n').count() == 0 and len(ids(page)) >= 9, 'tasolla 9 ei nimiä, alukset näkyvät')
    page.evaluate("App.map.setView([61.62, 23.76], 7)"); page.wait_for_timeout(700)
    check(len(ids(page)) == 0 and page.evaluate("Ais.count") == 11, 'alle tason 8 aluksia ei piirretä, tieto säilyy')
    check(not page.locator('.leaflet-control-attribution:has-text("AIS:")').count() == 0, 'attribuutio säilyy, kun kerros on päällä')
    page.evaluate("App.map.setView([62.5, 25.0], 13)"); page.wait_for_timeout(700)
    check(len(ids(page)) == 0, 'näkymän ulkopuoliset alukset eivät piirry')
    page.evaluate("App.map.setView([61.62, 23.76], 13)"); page.wait_for_timeout(700)

    # --- yönäyttö: värit eivät käänny tai katoa ---
    px_day = {m: pixel(page, m) for m in (230100001, 230100004, 230100002)}
    check(close_to(px_day[230100001], '#2e9e44') and close_to(px_day[230100004], '#ff6a13') and close_to(px_day[230100002], '#1f6fe0'), 'päivällä merkkien keskipisteen värit oikein: %s' % px_day)
    rescue_menu(page, 'Yönäyttö')
    check(page.evaluate("document.body.classList.contains('night')"), 'yönäyttö päällä')
    px_night = {m: pixel(page, m) for m in (230100001, 230100004, 230100002)}
    check(close_to(px_night[230100001], '#2e9e44') and close_to(px_night[230100004], '#ff6a13') and close_to(px_night[230100002], '#1f6fe0'), 'yöllä merkkien värit samat: %s' % px_night)
    check(page.evaluate("getComputedStyle(document.querySelector('.leaflet-ais-pane')).filter") == 'none' and
          page.evaluate("getComputedStyle(document.querySelector('.ais-w .ais-s path')).fill") != 'none', 'AIS-pane ei saa yönäytön suodatinta')
    nameC = page.evaluate("getComputedStyle(document.querySelector('.ais-n')).color")
    check(nameC.replace(' ', '') in ('rgb(238,238,238)', 'rgb(255,154,92)'), 'nimet vaaleita yöllä: %s' % nameC)
    shot(page, 'ais-02-yonaytto')
    rescue_menu(page, 'Yönäyttö')
    check(not page.evaluate("document.body.classList.contains('night')"), 'yönäyttö pois')

    # --- kortti ---
    page.locator('.ais-w[data-mmsi="230100001"]').click()
    page.wait_for_selector('.leaflet-popup .ais-pop')
    page.wait_for_timeout(300)
    txt = page.inner_text('.leaflet-popup')
    for frag in ['TESTI RAHTI', 'Rahtialus', '230100001', '9194098', 'OHRA1', 'kulussa konevoimalla', '11,2 kn', '045°', '047°', 'NAANTALI',
                 '23.10. 10:00 UTC', '6,0 m', '99 × 14 m', "61°37,500'N 023°46,200'E", 'sitten', 'Fintraffic / Digitraffic']:
        check(frag in txt, 'kortissa: %s' % frag)
    check('@' not in txt, 'kortissa ei @-merkkejä')
    labels = page.evaluate("[...document.querySelectorAll('.ais-pop th')].map(e => e.textContent)")
    check(labels == ['MMSI', 'IMO', 'Kutsutunnus', 'Tila', 'Nopeus', 'Kulku', 'Keula', 'Määränpää', 'ETA', 'Syväys', 'Pituus × leveys', 'Sijainti', 'Sijainnin ikä'], 'kortin rivit järjestyksessä: %s' % labels)
    bb = page.locator('.ais-task').bounding_box()
    check(bb and bb['height'] >= 40 and bb['width'] >= 40 and page.locator('.ais-task').inner_text() == 'Uusi tehtävä aluksen kohdalle', 'tehtäväpainike näkyy ja on vähintään 40 px (%s × %s)' % (round(bb['width']), round(bb['height'])))
    pop = page.locator('.leaflet-popup').bounding_box()
    check(pop['x'] >= 0 and pop['y'] >= 0 and pop['x'] + pop['width'] <= 1400 and pop['y'] + pop['height'] <= 860, 'kortti mahtuu näytölle')
    shot(page, 'ais-03-kortti')
    page.locator('.ais-task').click()
    page.wait_for_selector('#tPos')
    check(page.locator('.modal h2').inner_text() == 'Uusi tehtäväpaikka' and page.input_value('#tPos') == "61°37,500'N 023°46,200'E", 'painike avaa tehtävälomakkeen aluksen sijainnilla')
    page.locator('.modal button', has_text='Peruuta').click(); page.wait_for_timeout(200)

    # kortti, jossa on vain osa tiedoista
    page.keyboard.press('Escape')
    page.locator('.ais-w[data-mmsi="230100002"]').click(); page.wait_for_timeout(500)
    labels = page.evaluate("[...document.querySelectorAll('.ais-pop th')].map(e => e.textContent)")
    check(labels == ['MMSI', 'Kutsutunnus', 'Tila', 'Nopeus', 'Pituus × leveys', 'Sijainti', 'Sijainnin ikä'], 'puuttuvat rivit jätetään pois: %s' % labels)
    check('kiinnitetty' in page.inner_text('.leaflet-popup') and 'Matkustaja-alus' in page.inner_text('.leaflet-popup') and '75 × 16 m' in page.inner_text('.leaflet-popup'), 'kiinnitetyn matkustaja-aluksen kortti')
    page.evaluate("document.querySelector('.leaflet-popup-close-button').click()"); page.wait_for_timeout(200)
    page.locator('.ais-w[data-mmsi="230100008"]').click(); page.wait_for_timeout(500)
    check('Alus 230100008' in page.inner_text('.leaflet-popup') and 'ei ole saatavilla' in page.inner_text('.leaflet-popup'), 'aluksella ilman alustietoja kortti kertoo sen')
    page.keyboard.press('Escape'); page.mouse.click(700, 700); page.wait_for_timeout(200)

    # --- haku ---
    def search(q, wait=900):
        page.fill('#searchIn', q)
        page.wait_for_timeout(wait)
        return page.inner_text('#searchRes')

    t = search('rahti')
    check('AIS-ALUKSET' in t.upper() and 'TESTI RAHTI' in t and 'AIS-alus, rahtialus, 11,2 kn' in t, 'haku nimen osalla (rahti) löytää aluksen ja näyttää lisätiedon')
    check(' mpk · ' in t and page.evaluate("Search.results[0].no") == 1, 'sama etäisyys- ja suuntamuotoilu sekä numerointi kuin muilla tuloksilla')
    check('TESTI RAHTI' in search('ahti') and 'TESTI RAHTI' in search('testi r') and 'TESTI RAHTI' in search('RAHTI'), 'haku nimen keskeltä ja alusta, kirjainkoosta riippumatta')
    check('VAINO TESTI' in search('väinö'), 'ä ja ö löytävät AIS-nimen A:n ja O:n')
    check('TESTI RAHTI' in search('ohra1') and 'TESTI RAHTI' in search('OHRA'), 'haku kutsutunnuksella')
    t = search('2301000')
    check(t.count('AIS-alus') == 10 or page.evaluate("Search.results.filter(r => r.ais).length") == 10, 'MMSI:n alulla löytyvät alukset (vanha sijainti pois): %s' % page.evaluate("Search.results.filter(r => r.ais).length"))
    t = search('230100003')
    check('PV PELASTAJA' in t and 'AIS-alus, etsintä- ja pelastusalus, 8,5 kn' in t, 'haku koko MMSI:llä')
    t = search('23')
    check('AIS-ALUKSET' not in t.upper(), 'kahdella numerolla ei haeta MMSI:llä')
    check('VANHA' not in search('vanha alus'), 'yli tunnin vanhaa sijaintia ei löydetä haulla')
    t = search('pv ')
    km = page.evaluate("Search.results.filter(r => r.ais).map(r => r.km)")
    check(len(km) == 2 and km == sorted(km), 'tulokset lähimmästä alkaen')
    t = search('yksittais')
    check('YKSITTAIS ALUS' in t and 'huvialus' in t, 'yksittäin haetun aluksen nimi löytyy haulla')
    # valinta keskittää ja avaa kortin
    search('pelastaja')
    page.locator('#searchRes .sr', has_text='PV PELASTAJA').first.click()
    page.wait_for_timeout(1000)
    c = page.evaluate("App.map.getCenter()")
    check(abs(c['lat'] - 61.63) < 0.02 and abs(c['lng'] - 23.752) < 0.03, 'valinta keskittää kartan alukseen')
    check(page.locator('.leaflet-popup .ais-pop').count() == 1 and 'PV PELASTAJA' in page.inner_text('.leaflet-popup'), 'valinta avaa aluksen kortin')
    check(page.evaluate("document.querySelectorAll('.sres').length") == 0, 'hakutulosten numerot poistuvat valinnan jälkeen')
    shot(page, 'ais-04-haun-valinta')

    # --- tehtävälomakkeen paikkahaku ---
    page.keyboard.press('Escape'); page.mouse.click(700, 760); page.wait_for_timeout(200)
    page.click('#tbTask'); page.wait_for_selector('#tFind')
    page.fill('#tFind', 'pelastaja'); page.wait_for_timeout(1200)
    rt = page.inner_text('#tRes')
    check('PV PELASTAJA' in rt and 'AIS-alus' in rt, 'tehtävälomakkeen paikkahaku löytää aluksen nimellä')
    page.locator('#tRes .sr', has_text='PV PELASTAJA').first.click(); page.wait_for_timeout(600)
    check('Tarkista tehtäväpaikka' in page.inner_text('#editBanner') and 'PV PELASTAJA' in page.inner_text('#editBanner'), 'valittu alus tarkistetaan kartalla tehtäväpaikkana')
    page.click('#editBanner button:has-text("Vahvista paikka")'); page.wait_for_timeout(400)
    check('tarkistettu kartalla' in page.inner_text('#tPrev'), 'vahvistus palaa lomakkeelle')
    page.locator('.modal button', has_text='Peruuta').click(); page.wait_for_timeout(200)

    # --- kerroksen poisto ---
    page.locator('.mi', has_text='Näytä').click(); page.wait_for_timeout(150)
    chk = page.evaluate("[...document.querySelectorAll('#ctxmenu button')].filter(b => b.textContent.indexOf('AIS-alukset (Digitraffic)') >= 0).map(b => b.className)")
    check(chk == ['chk'], 'Näytä-valikossa valinta AIS-alukset (Digitraffic) valittuna: %s' % chk)
    page.locator('#ctxmenu button', has_text='AIS-alukset (Digitraffic)').click()
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    check(page.locator('.ais-w').count() == 0 and page.locator('.ais-ico').count() == 0 and page.locator('path.ais-vec').count() == 0, 'kerroksen poisto poistaa merkit ja vektorit')
    check(page.evaluate("Store.state.settings.show.ais") is False and page.evaluate("Ais.running") is False, 'asetus tallentuu ja haku pysähtyy')
    check('AIS:' not in page.inner_text('.leaflet-control-attribution'), 'attribuutio poistuu')
    # kerroksen ollessa pois päältä haku löytää alukset välimuistista
    t = search('pelastaja')
    check('PV PELASTAJA' in t, 'haku toimii kerroksen ollessa pois päältä')
    page.locator('#searchRes .sr', has_text='PV PELASTAJA').first.click(); page.wait_for_timeout(1000)
    check(page.evaluate("Store.state.settings.show.ais") is True and page.evaluate("Ais.running") is True, 'tuloksen valinta kytkee kerroksen päälle')
    check(page.locator('.leaflet-popup .ais-pop').count() == 1 and page.locator('.ais-w[data-mmsi="230100003"]').count() == 1, 'kortti auki ja alus piirretty')
    check('AIS:' in page.inner_text('.leaflet-control-attribution'), 'attribuutio palaa')
    check(not errs, 'ei JS-virheitä (sivu 1) %s' % errs[:3])
    ctx.close()

    # ======================= sivu 2: kerros pois päältä käynnistettäessä, ajastus =======================
    ais_state['extra'] = 30
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    page = ctx.new_page()
    errs = []
    attach_errors(page, errs)
    page.route('**/*', handle)
    page.clock.install()
    seed = {'version': 1, 'routes': [], 'marks': [], 'tasks': [], 'settings': {'welcomed': True, 'show': {'ais': False}, 'view': {'lat': 61.62, 'lng': 23.76, 'zoom': 12}}}
    page.add_init_script("if (!localStorage.getItem('reittikartta.v1')) localStorage.setItem('reittikartta.v1', %s)" % json.dumps(json.dumps(seed)))
    n0 = len(ais_log)
    ais_state['maxes'][:] = []
    page.goto(TARGET)
    page.wait_for_timeout(2000)
    check(len(ais_log) == n0 and page.evaluate("Ais.running") is False and page.locator('.ais-w').count() == 0, 'kerros pois päältä: ei hakuja eikä merkkejä käynnistyksessä')
    check('AIS:' not in page.inner_text('.leaflet-control-attribution'), 'ei attribuutiota kerroksen ollessa pois päältä')
    page.fill('#searchIn', 'extra 1')
    page.wait_for_timeout(1500)
    loc, ves = locations(n0), vessels_bulk(n0)
    check(len(loc) == 1 and len(ves) == 1, 'haku käynnistää tiedon haun kerran (sijainnit ja alustiedot)')
    t = page.inner_text('#searchRes')
    res = page.evaluate("Search.results.filter(r => r.ais).map(r => [r.name, r.km])")
    check(len(res) == 10 and [r[1] for r in res] == sorted(r[1] for r in res), 'enintään 10 lähintä alusta, lähin ensin: %d' % len(res))
    check('AIS-ALUKSET' in t.upper() and page.locator('.ais-w').count() == 0 and page.evaluate("Ais.running") is False, 'tulokset näkyvät, kerros pysyy pois päältä')
    page.fill('#searchIn', 'extra 2')
    page.wait_for_timeout(1200)
    check(len(locations(n0)) == 1, 'tuore aineisto jaetaan: seuraava haku ei hae uudelleen')
    page.fill('#searchIn', 'pelastaja'); page.wait_for_timeout(1000)
    page.locator('#searchRes .sr', has_text='PV PELASTAJA').first.click(); page.wait_for_timeout(1200)
    check(page.evaluate("Store.state.settings.show.ais") is True and page.locator('.leaflet-popup .ais-pop').count() == 1, 'valinta kytkee kerroksen päälle ja avaa kortin')
    ais_state['extra'] = 0

    # --- päivityshaku 30 s välein: from = edellisen haun suurin aika - 60 s ---
    page.wait_for_timeout(500)
    k = len(locations(n0))
    page.clock.fast_forward(31000); page.wait_for_timeout(800)
    loc = locations(n0)
    check(len(loc) == k + 1 and 'from' in loc[-1]['query'], '30 sekunnin kuluttua päivityshaku from-parametrilla')
    prev_max = ais_state['maxes'][len(loc) - 2]
    check(int(loc[-1]['query']['from']) == prev_max - 60000, 'from = edellisen haun suurin timestampExternal - 60 s (%s)' % (int(loc[-1]['query']['from']) - prev_max))
    check(page.locator('.ais-w[data-mmsi="230100003"]').count() == 1 and page.evaluate("Ais.count") >= 11, 'päivitys yhdistyy aineistoon MMSI:n mukaan')

    # --- virhe: huomautus näkyviin vasta toistuvasta virheestä, ja poistuu onnistuneella haulla ---
    ais_state['fail'] = True
    page.clock.fast_forward(31000); page.wait_for_timeout(500)
    page.clock.fast_forward(31000); page.wait_for_timeout(500)
    check(page.locator('.ais-note').is_visible(), 'toistuva hakuvirhe näkyy huomautuksena kartalla')
    check(page.locator('.ais-w').count() >= 9, 'virheen aikana aiemmat alukset pysyvät kartalla')
    shot(page, 'ais-05-virhe')
    ais_state['fail'] = False
    page.clock.fast_forward(31000); page.wait_for_timeout(500)
    check(not page.locator('.ais-note').is_visible(), 'huomautus poistuu, kun haku onnistuu')

    # --- sivu piilossa: haku pysähtyy, näkyviin tullessa haetaan heti ---
    hide = "Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));"
    show = "Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'));"
    page.evaluate(hide); page.wait_for_timeout(200)
    k = len(ais_log)
    page.clock.fast_forward(95000); page.wait_for_timeout(600)
    check(len(ais_log) == k and page.evaluate("Ais.running") is False, 'piilotetulla sivulla ei haeta')
    page.evaluate(show); page.wait_for_timeout(800)
    check(len(ais_log) > k and page.evaluate("Ais.running") is True, 'sivun tullessa näkyviin haetaan heti')

    # --- koko haku 10 minuutin välein ja alustietojen päivitys 15 minuutin välein ---
    k = len(ais_log)
    t_first_bulk = vessels_bulk(n0)[0]['at']
    page.clock.fast_forward(16 * 60000); page.wait_for_timeout(1000)
    new = ais_log[k:]
    nl = [l for l in new if l['path'] == '/locations']
    nv = [l for l in new if l['path'] == '/vessels']
    check(nl and 'from' not in nl[-1]['query'], '10 minuutin kuluttua haetaan koko aineisto uudelleen (ilman from-parametria)')
    check(len(nv) == 1 and abs(int(nv[0]['query']['from']) - (t_first_bulk - 60000)) < 5000, 'alustiedot päivittyvät 15 minuutin välein: from = edellinen hakuhetki - 60 s')

    # --- kerroksen poisto pysäyttää haun ---
    page.evaluate("Store.state.settings.show.ais = false; Ais.sync()"); page.wait_for_timeout(300)
    k = len(ais_log)
    page.clock.fast_forward(95000); page.wait_for_timeout(600)
    check(len(ais_log) == k and page.locator('.ais-w').count() == 0, 'kerros pois päältä: haku pysähtyy eikä merkkejä ole')
    check(not errs, 'ei JS-virheitä (sivu 2) %s' % errs[:3])
    ctx.close()

    # ======================= sivu 3: enintään 400 alusta =======================
    ais_state['extra'] = 900
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    page = ctx.new_page()
    errs = []
    attach_errors(page, errs)
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.57, 23.68], 10)")
    page.wait_for_function("window.Ais && Ais.count > 800", timeout=10000)
    page.wait_for_timeout(800)
    t0 = page.evaluate("(() => { const t = performance.now(); Ais.sync(); return performance.now() - t; })()")
    n = page.locator('.ais-w').count()
    check(n == 400 and page.evaluate("Ais.count") == 911, 'näkymässä enintään 400 alusta (aineistossa %d)' % page.evaluate("Ais.count"))
    check(page.locator('.ais-w[data-rescue="1"]').count() == 2, 'pelastusalukset ovat mukana, kun alukset joudutaan rajaamaan')
    check(page.locator('.ais-w[data-moving="1"]').count() >= 398, 'liikkuvat alukset ovat etusijalla paikallaan olevien edellä')
    print('     piirto 400 aluksella: %.0f ms' % t0)
    shot(page, 'ais-06-400-alusta')
    check(not errs, 'ei JS-virheitä (sivu 3) %s' % errs[:3])
    ctx.close()
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
for f in fails:
    print('  VIKA:', f)
sys.exit(1 if fails else 0)
