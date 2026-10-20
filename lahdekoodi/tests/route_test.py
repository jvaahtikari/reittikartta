"""Automaattinen reititys väylää pitkin: syvyysrajoite, lähin kelvollinen väyläpiste,
linjat ilman kulkusyvyyttä, risteykset ilman yhteistä solmua ja dialogi.
Testiaineisto: pääväylä 9215 (2,4 m) A(23.70,61.56)–B(23.76,61.64)–P1(23.80,61.70)–P2(23.88,61.74)–C(23.90,61.80),
oikotie 9260 (1,8 m) B–C, linja 9270 ilman syvyyttä C–D(23.95,61.85)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot
from playwright.sync_api import sync_playwright

DEVICE = os.environ.get('DEVICE')
TARGET = os.environ.get('TARGET', 'file://' + os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/index.html')
fails = []


def check(cond, msg):
    print(('OK  ' if cond else 'FAIL') + ' ' + msg)
    if not cond:
        fails.append(msg)


def route_via_dialog(page, frm, to, depth, expect_ok=True):
    """Avaa dialogin pikanäppäimellä, täyttää koordinaatit ja reitittää. Palauttaa luodun reitin tai None."""
    n0 = page.evaluate('Store.state.routes.length')
    page.keyboard.press('Control+Shift+r')
    page.wait_for_selector('#rtFrom')
    page.wait_for_timeout(120)         # dialogin kohdistus kenttään ehtii tapahtua
    page.fill('#rtFrom', frm)
    page.fill('#rtTo', to)
    page.fill('#rtDepth', str(depth))
    page.click('.modal .btn.primary')
    page.wait_for_selector('.modal h2', timeout=15000)
    title = page.inner_text('.modal h2')
    if title == 'Reititä väylää pitkin':
        print('   dialogin virhe:', page.inner_text('#rtErr'))
    if expect_ok:
        check(title == 'Reitti laskettu', 'yhteenveto avautuu (%s)' % title)
        summary = page.inner_text('.modal .mb')
        page.click('.modal .btn.primary')
        page.wait_for_timeout(200)
        check(page.evaluate('Store.state.routes.length') == n0 + 1, 'reitti luotiin')
        check(page.evaluate('!!Routes.editingId'), 'reitti on muokkaustilassa')
        r = page.evaluate('Store.state.routes[Store.state.routes.length-1]')
        r['_summary'] = summary
        return r
    check(title == 'Reittiä ei löytynyt', 'virheilmoitus avautuu (%s)' % title)
    body = page.inner_text('.modal .mb')
    page.click('.modal .btn:not(.primary)')
    page.wait_for_timeout(200)
    check(page.evaluate('Store.state.routes.length') == n0, 'reittiä ei luotu')
    return body


with sync_playwright() as pw:
    # sijaintilupa annetaan alusta asti: WebKit ei hyväksy kesken istunnon annettua lupaa
    GEO = {'permissions': ['geolocation'], 'geolocation': {'latitude': 61.57, 'longitude': 23.71, 'accuracy': 10}}
    if DEVICE:
        dev = pw.devices[DEVICE]
        bt = pw.webkit if dev.get('default_browser_type') == 'webkit' else pw.chromium
        b = bt.launch(); ctx = b.new_context(**dev, **GEO); page = ctx.new_page()
    else:
        b = pw.chromium.launch(); ctx = b.new_context(viewport={'width': 1400, 'height': 860}, **GEO); page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.68, 23.80], 11)")
    page.wait_for_timeout(1500)

    # 1) kulkusyvyys 2,0 m: oikotie (1,8 m) ei kelpaa → mutka pääväylää pitkin
    r = route_via_dialog(page, '61 33.6N 23 42.0E', '61 48.0N 23 54.0E', 2.0)
    if r:
        pts = [(round(p['lat'], 3), round(p['lng'], 3)) for p in r['points']]
        print('   pisteet:', pts)
        check(len(pts) == 5, '5 reittipistettä pääväylän mutkan kautta')
        check((61.7, 23.8) in pts and (61.74, 23.88) in pts, 'mutkan pisteet P1 ja P2 reitillä')
        check(all(p.get('snap') for p in r['points']), 'kaikki pisteet kiinnitetty väylään')
        check('2,4 m' in r['_summary'] and 'Tampere - Virrat' in r['_summary'], 'yhteenveto: pienin kulkusyvyys 2,4 m, väylän nimi')
        check(r['from'] and r['to'] and r['name'], 'nimi muodostui')
        shot(page, 'r1-reitti-2m')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 2) kulkusyvyys 1,5 m: oikotie kelpaa → A–B–C
    r = route_via_dialog(page, '61 33.6N 23 42.0E', '61 48.0N 23 54.0E', 1.5)
    if r:
        pts = [(round(p['lat'], 3), round(p['lng'], 3)) for p in r['points']]
        print('   pisteet:', pts)
        check(len(pts) == 3, '3 reittipistettä oikotietä pitkin')
        check('1,8 m' in r['_summary'] and 'Testioikotie' in r['_summary'], 'yhteenveto: pienin kulkusyvyys 1,8 m (Testioikotie)')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 3) määränpää linjan 9270 (ei syvyystietoa) päässä: saapumispiste on C, ei D
    r = route_via_dialog(page, '61 33.6N 23 42.0E', '61 51.0N 23 57.0E', 1.0)
    if r:
        last = r['points'][-1]
        print('   viimeinen:', round(last['lat'], 3), round(last['lng'], 3))
        check(abs(last['lat'] - 61.80) < 1e-3 and abs(last['lng'] - 23.90) < 1e-3, 'saapumispiste on viimeinen kelvollinen väyläpiste C')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 4) lähtöpaikka ja määränpää saman linjan keskellä: reitti linjaa pitkin, ei pääte­pisteiden kautta
    r = route_via_dialog(page, '61 35.0N 23 42.5E', '61 37.5N 23 44.5E', 2.0)
    if r:
        print('   pisteet:', [(round(p['lat'], 4), round(p['lng'], 4), p['snap']['kind']) for p in r['points']])
        check(len(r['points']) == 2 and r['points'][0]['snap']['kind'] == 'line', 'kaksi pistettä samalla linjalla, kiinnitys linjaan')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 4b) kulkusyvyyden muutos tarkastelun aikana: 2,0 m (5 pistettä) → 1,5 m (3 pistettä) → 3,0 m ei löydy, reitti säilyy
    r = route_via_dialog(page, '61 33.6N 23 42.0E', '61 48.0N 23 54.0E', 2.0)
    if r:
        rid = r['id']
        check(r.get('auto') and r['auto']['depth'] == 2.0, 'reititysparametrit tallessa reitillä')
        btn = page.locator('#editBanner button', has_text='Kulkusyvyys')
        check(btn.count() == 1 and '2 m' in btn.inner_text(), 'muokkausilmoituksessa painike Kulkusyvyys 2 m')
        page.evaluate("Store.state.routes[Store.state.routes.length-1].notes.push({leg:0,lat:61.6,lng:23.73,ok:false})")
        btn.click()
        page.wait_for_selector('#rdDepth')
        shot(page, 'r4b-kulkusyvyys-dialogi')
        page.fill('#rdDepth', '1.5')
        page.click('.modal .btn.primary')
        page.wait_for_selector('.modal h2', timeout=15000)
        check(page.inner_text('.modal h2') == 'Reitti laskettu', 'uudelleenreititys näyttää yhteenvedon')
        page.click('.modal .btn.primary'); page.wait_for_timeout(200)
        r2 = page.evaluate("Store.routeById(%r)" % rid)
        check(len(r2['points']) == 3 and r2['auto']['depth'] == 1.5, 'sama reitti korvattiin oikotiereitillä (3 pistettä, 1,5 m)')
        check(r2['name'] == r['name'] and not r2['notes'], 'nimi säilyi, vanhat suuntanuotit poistettiin')
        check(page.evaluate('Routes.editingId') == rid, 'reitti on edelleen muokkaustilassa')
        check('1,5 m' in page.locator('#editBanner button', has_text='Kulkusyvyys').inner_text(), 'painike näyttää uuden kulkusyvyyden')
        page.locator('#editBanner button', has_text='Kulkusyvyys').click()
        page.wait_for_selector('#rdDepth'); page.fill('#rdDepth', '3'); page.click('.modal .btn.primary')
        page.wait_for_selector('.modal h2', timeout=15000)
        check(page.inner_text('.modal h2') == 'Reittiä ei löytynyt', 'kelvoton kulkusyvyys antaa virheilmoituksen')
        page.click('.modal .btn:not(.primary)'); page.wait_for_timeout(200)
        r3 = page.evaluate("Store.routeById(%r)" % rid)
        check(len(r3['points']) == 3 and r3['auto']['depth'] == 1.5, 'nykyinen reitti säilyi, kun uutta ei löytynyt')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 5) kulkusyvyys 3,0 m: ei yhtään kelvollista linjaa
    body = route_via_dialog(page, '61 33.6N 23 42.0E', '61 48.0N 23 54.0E', 3.0, expect_ok=False)
    check('3 m' in body, 'virheilmoitus mainitsee vaaditun kulkusyvyyden')
    shot(page, 'r5-ei-reittia')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 6) risteys ilman yhteistä solmua (synteettinen verkko suoraan moduulille)
    res = page.evaluate("""(() => {
      const f = (id, d, c) => ({ id, geometry: { type: 'LineString', coordinates: c }, properties: { navigointilinjaid: id, mitoitussyvays: d, jnro: String(id) } });
      const feats = [f(1, 2.4, [[23.70, 61.60], [23.80, 61.60]]), f(2, 2.4, [[23.75, 61.55], [23.75, 61.65]])];
      const b = Routing.buildGraph(feats, 2.0, { lat: 61.6, lng: 23.75 });
      const g = b.graph;
      const s = Routing.attach(g, Routing.nearestOnGraph(g, { lat: 61.60, lng: 23.70 }));
      const t = Routing.attach(g, Routing.nearestOnGraph(g, { lat: 61.65, lng: 23.75 }));
      const p = Routing.astar(g, s, t);
      return { nodes: g.nodes.length, path: p ? p.nodes.map(n => [+g.nodes[n].lat.toFixed(3), +g.nodes[n].lng.toFixed(3)]) : null };
    })()""")
    print('   risteys:', res)
    check(res['path'] is not None and len(res['path']) == 3 and res['path'][1] == [61.6, 23.75], 'risteyksessä vaihto linjalta toiselle')

    # 7) dialogi: haku nimellä täyttää koordinaatit; asema-painike
    page.evaluate("Store.state.settings.station = { lat: 61.56, lng: 23.70, name: 'Testiasema' }; Store.emit('settings')")
    page.keyboard.press('Control+Shift+r')
    page.wait_for_selector('#rtToQ')
    page.wait_for_timeout(120)
    page.click('#rtFromSt')
    check('61°33' in page.input_value('#rtFrom'), 'asema täyttää lähtöpaikan')
    page.fill('#rtToQ', 'Testi 3')
    page.wait_for_selector('#rtToRes .sr', timeout=5000)
    page.click('#rtToRes .sr')
    page.wait_for_timeout(100)
    check(page.input_value('#rtTo') != '' and 'Testi 3' in page.inner_text('#rtToPrev'), 'haun osuma täyttää määränpään koordinaatit')
    shot(page, 'r7-dialogi')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 8) reititys tehtävälle: tehtävä C:n lähellä, lähtö muusta paikasta ja asemalta
    page.evaluate("Store.state.tasks.push({ id: 'tk-test', name: 'Keikka 1', lat: 61.81, lng: 23.91, time: '2026-10-20T12:00', active: true }); Store.emit('tasks')")
    n0 = page.evaluate('Store.state.routes.length')
    page.click('#tbTaskRoute')
    page.wait_for_selector('#rtTask'); page.wait_for_timeout(120)
    check('Keikka 1' in page.inner_text('#rtTask option:checked'), 'aktiivinen tehtävä valmiiksi valittuna')
    page.check('input[name=rtStart][value=other]')
    check(not page.evaluate("document.getElementById('rtOther').hidden"), 'muu paikka avaa hakukentät')
    page.fill('#rtFrom', '61 33.6N 23 42.0E'); page.fill('#rtDepth', '2.0')
    shot(page, 'r8-tehtava-dialogi')
    page.click('.modal .btn.primary')
    page.wait_for_selector('.modal h2', timeout=15000)
    check(page.inner_text('.modal h2') == 'Reitti laskettu', 'tehtäväreitti laskettu (%s)' % page.inner_text('.modal h2'))
    page.click('.modal .btn.primary'); page.wait_for_timeout(200)
    rt = page.evaluate('Store.state.routes[Store.state.routes.length-1]')
    check(page.evaluate('Store.state.routes.length') == n0 + 1 and rt['to'] == 'Keikka 1' and abs(rt['points'][-1]['lat'] - 61.80) < 1e-3, 'reitti päättyy tehtävää lähimpään väyläpisteeseen C, Mihin = tehtävän nimi')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.click('#tbTaskRoute'); page.wait_for_selector('#rtTask'); page.wait_for_timeout(120)
    page.check('input[name=rtStart][value=station]'); page.fill('#rtDepth', '2.0'); page.click('.modal .btn.primary')
    page.wait_for_selector('.modal h2', timeout=15000)
    check(page.inner_text('.modal h2') == 'Reitti laskettu', 'tehtäväreitti asemalta laskettu')
    page.click('.modal .btn.primary'); page.wait_for_timeout(200)
    rt = page.evaluate('Store.state.routes[Store.state.routes.length-1]')
    check(rt['from'] == 'Testiasema' and rt['to'] == 'Keikka 1', 'Mistä = asema, Mihin = tehtävä')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # oma sijainti: selaimen sijainti annetaan testissä; tietokoneella sijainti ei ole vielä päällä, joten se käynnistetään
    if page.evaluate('window.isSecureContext'):
        page.click('#tbTaskRoute'); page.wait_for_selector('#rtTask'); page.wait_for_timeout(120)
        page.check('input[name=rtStart][value=gps]'); page.fill('#rtDepth', '2.0'); page.click('.modal .btn.primary')
        page.wait_for_selector('.modal h2', timeout=30000)
        check(page.inner_text('.modal h2') == 'Reitti laskettu', 'tehtäväreitti omasta sijainnista laskettu (sijainti käynnistettiin)')
        page.click('.modal .btn.primary'); page.wait_for_timeout(200)
        rt = page.evaluate('Store.state.routes[Store.state.routes.length-1]')
        check(rt['from'] == 'Oma sijainti', 'Mistä = oma sijainti')
        shot(page, 'r8-tehtavareitti')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
    else:
        print('   (oma sijainti ohitettu: selain ei anna sijaintia file://-sivulle)')

    check(not errs, 'ei JavaScript-virheitä: %s' % errs)
    b.close()

print('\nTULOS:', 'OK' if not fails else 'VIRHEITÄ %d' % len(fails))
sys.exit(1 if fails else 0)
