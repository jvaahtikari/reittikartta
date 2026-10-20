"""Puhelinkierros: oletuksena WebKit iPhone 15 -profiililla (DEVICE='Pixel 7' ajaa Android-Chromella) (393 x 659, 3x, kosketus). Valikot levynä,
lukemat eivät nappaa napautuksia, keskitys kirjastolevyn ollessa auki, reitin tiedot näkyviin,
näppäinoikotiet piilossa, valikon rivit samassa linjassa, vaakatila ja uudelleenlataus.
WebKit haetaan muuttujan PLAYWRIGHT_BROWSERS_PATH osoittamasta kansiosta; jos sitä ei ole, käytetään Chromiumia."""
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


def rect(page, sel):
    return page.evaluate("(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }", sel)


with sync_playwright() as pw:
    DEVICE = os.environ.get('DEVICE', 'iPhone 15')
    dev = dict(pw.devices[DEVICE])
    try:
        b = getattr(pw, dev['default_browser_type']).launch(); engine = dev['default_browser_type']
    except Exception as e:
        print('%s ei käytettävissä (%s), käytetään Chromiumia' % (dev['default_browser_type'], str(e).splitlines()[0][:80]))
        b = pw.chromium.launch(); engine = 'chromium'
    TAG = 'a-' if 'Pixel' in DEVICE else ''
    print('selain:', engine, DEVICE, dev['viewport'])
    ctx = b.new_context(**{k: v for k, v in dev.items() if k != 'default_browser_type'})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1500)
    W, H = dev['viewport']['width'], dev['viewport']['height']
    check(page.evaluate("document.documentElement.scrollWidth") <= W, 'sivu mahtuu leveyteen')
    page.locator('button:has-text("Aloita")').first.tap()
    page.evaluate("App.map.setView([61.617, 23.75], 14)"); page.wait_for_timeout(1500)

    # --- alareuna: kiinteät laatikot eivät peitä karttaa napautuksilta ---
    dz = page.evaluate("""(() => { const m = App.map.getContainer(); let blocked = 0, n = 0;
        for (let y = innerHeight - 110; y < innerHeight - 4; y += 12) for (let x = 20; x < innerWidth - 20; x += 25) {
          n++; const e = document.elementFromPoint(x, y); if (e && !m.contains(e)) blocked++; }
        return [blocked, n]; })()""")
    check(dz[0] / dz[1] < 0.15, 'alimmat 110 pistettä ottavat napautukset vastaan kartalle (%d / %d pistettä peitossa)' % tuple(dz))
    small = page.evaluate("""[...document.querySelectorAll('#topbar button, #topbar input, #baseSwitch button, #toolbar .tb')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 40 || r.width < 40); }).map(e => e.id || e.textContent.trim())""")
    check(not small, 'yläpalkin, karttapohjan ja työkalujen kosketuskohteet vähintään 40 px %s' % small)

    # --- valikot: levy, osiot, Takaisin, Sulje, vierityksen vihje, ei näppäinoikoteitä ---
    page.tap('#menuBtn'); page.wait_for_timeout(300)
    check(page.evaluate("document.getElementById('ctxmenu').classList.contains('sheet')"), 'valikko avautuu levynä')
    page.locator('#ctxmenu button', has_text='Näytä').first.tap(); page.wait_for_timeout(300)
    secs = page.evaluate("[...document.querySelectorAll('#ctxmenu button:not(.mh-back):not(.mh-x)')].map(b => b.textContent.replace('›', '').trim())")
    print('Näytä-osiot:', secs)
    check(len(secs) >= 4 and len(secs) <= 8, 'Näytä jaettu osioihin (%d riviä)' % len(secs))
    nrows = []
    for sname in secs:
        page.locator('#ctxmenu button', has_text=sname).first.tap(); page.wait_for_timeout(250)
        info = page.evaluate("""(() => { const m = document.getElementById('ctxmenu'); const r = m.getBoundingClientRect();
            const rows = [...m.querySelectorAll('button:not(.mh-back):not(.mh-x)')];
            return { n: rows.length, h: m.scrollHeight, ch: m.clientHeight, bottom: r.bottom, more: !!(m.querySelector('.more') && !m.querySelector('.more').hidden),
                     back: !!m.querySelector('.mh-back'), close: !!m.querySelector('.mh-x'),
                     keys: [...m.querySelectorAll('.k')].map(k => k.textContent).filter(t => t !== '›'),
                     lefts: [...new Set(rows.map(b => Math.round(b.querySelector('span').getBoundingClientRect().left)))] }; })()""")
        nrows.append(info['n'])
        ok_scroll = info['h'] <= info['ch'] + 2 or info['more']
        check(info['back'] and info['close'] and info['bottom'] <= H and ok_scroll and not info['keys'] and len(info['lefts']) == 1,
              'osio %s: %d riviä, Takaisin ja Sulje, mahtuu tai vihje vierityksestä, ei näppäinoikoteitä, rivit linjassa %s' % (sname, info['n'], info['lefts']))
        page.locator('#ctxmenu .mh-back').tap(); page.wait_for_timeout(200)
    check(sum(nrows) >= 28, 'kaikki Näytä-valikon %d valintaa löytyvät osioista' % sum(nrows))
    # Maapohja ja näyttö -osion alin rivi (Yönäyttö) on saavutettavissa vierittämällä
    page.locator('#ctxmenu button', has_text='Maapohja ja näyttö').first.tap(); page.wait_for_timeout(250)
    page.locator('#ctxmenu button', has_text='Yönäyttö').first.scroll_into_view_if_needed()
    check(page.locator('#ctxmenu button', has_text='Yönäyttö').first.is_visible(), 'Yönäyttö saavutettavissa')
    shot(page, TAG + 'i1-valikko')
    page.locator('#ctxmenu .mh-x').tap(); page.wait_for_timeout(200)
    check(page.evaluate("document.getElementById('ctxmenu').hidden"), 'Sulje-painike sulkee valikon')
    page.tap('#menuBtn'); page.wait_for_timeout(200)
    page.touchscreen.tap(W // 2, H - 30); page.wait_for_timeout(250)
    check(page.evaluate("document.getElementById('ctxmenu').hidden") and page.evaluate("App.mode()") == 'idle', 'taustan napautus sulkee valikon ilman karttatoimintoa')

    # --- lukemat: piilossa tyhjänä, eivät nappaa napautuksia ---
    check(not page.locator('#readout').is_visible(), 'tyhjä lukemalaatikko piilossa')
    page.tap('#tbRoute'); page.wait_for_timeout(300)
    pts = [(170, 260), (250, 330), (300, 420), (W - 40, H - 60)]     # viimeinen oikeaan alakulmaan
    for i, (x, y) in enumerate(pts):
        page.touchscreen.tap(x, y); page.wait_for_timeout(350)
        if i == 1:
            ro = page.evaluate("[document.getElementById('roBrg').textContent, document.getElementById('roDist').textContent]")
            check('°' in ro[0] and 'mpk' in ro[1], 'lukemat näyttävät lisätyn legin suunnan ja pituuden: %s' % ro)
    n = page.evaluate("Store.state.routes.length ? Store.state.routes[Store.state.routes.length - 1].points.length : 0")
    check(n == 4, 'kaikki neljä reittipistettä lisättiin, myös lukemalaatikon kohdalle (%d)' % n)
    shot(page, TAG + 'i2-reitti')
    page.locator('#editBanner button', has_text='Valmis').tap(); page.wait_for_timeout(400)

    # --- kirjasto: reitin valinta tuo tiedot näkyviin ---
    page.tap('#panelToggle'); page.wait_for_timeout(400)
    page.locator('#tab-routes .item').first.tap(); page.wait_for_timeout(500)
    pr = rect(page, '#panel'); dr = page.evaluate("(() => { const d = document.querySelector('#tab-routes .detail'); const r = d.getBoundingClientRect(); return [r.top, r.bottom]; })()")
    btn = page.evaluate("(() => { const b = document.querySelector('#tab-routes .detail [data-act=gpx]'); const r = b.getBoundingClientRect(); return [r.top, r.bottom]; })()")
    check(dr[0] >= pr[1] - 1 and btn[1] <= pr[3] + 1, 'valitun reitin tiedot ja Vie GPX näkyvät levyssä ilman vieritystä')
    shot(page, TAG + 'i3-kirjasto')

    tb = rect(page, '#toolbar')
    check(tb[3] <= pr[1] + 1, 'työkalupalkki ei jää kirjastolevyn alle (%.0f / %.0f)' % (tb[3], pr[1]))
    # --- uusi tehtävä kirjaston ollessa auki: merkki näkyy levyn yläpuolella ---
    page.locator('#panel .tab', has_text='Tehtävät').tap(); page.wait_for_timeout(200)
    page.locator('#panel button', has_text='Uusi tehtävä').tap(); page.wait_for_timeout(300)
    page.fill('#tName', 'Testitehtävä') if page.locator('#tName').count() else None
    page.fill('#tPos', '61 37,5N 23 46,0E'); page.wait_for_timeout(200)
    page.locator('.modal button', has_text='Tallenna').tap(); page.wait_for_timeout(700)
    t = page.evaluate("Store.state.tasks[Store.state.tasks.length - 1]")
    pt = page.evaluate("(t) => App.map.latLngToContainerPoint([t.lat, t.lng]).y + App.map.getContainer().getBoundingClientRect().top", t)
    pr = rect(page, '#panel')
    check(pt < pr[1] - 10, 'tallennettu tehtävä näkyy levyn yläpuolella (y %.0f, levy alkaa %.0f)' % (pt, pr[1]))
    hit = page.evaluate("""(t) => { const P = App.map.latLngToContainerPoint([t.lat, t.lng]), r = App.map.getContainer().getBoundingClientRect();
        const e = document.elementFromPoint(r.left + P.x, r.top + P.y); return e ? (e.closest('#editBanner, #baseSwitch, #toolbar, #panel, .map-notes') ? e.closest('#editBanner, #baseSwitch, #toolbar, #panel, .map-notes').id || 'peitetty' : 'kartta') : null; }""", t)
    check(hit == 'kartta', 'tehtävämerkin kohdalla ei ole ilmoitusta tai painikkeita (%s)' % hit)
    shot(page, TAG + 'i4-tehtava')
    page.tap('#panelToggle'); page.wait_for_timeout(300)

    # --- ominaisuudet ja hyväksyntä ---
    rid = page.evaluate("Store.state.routes[0].id")
    page.evaluate(f"Routes.openProperties('{rid}')"); page.wait_for_timeout(400)
    mr = rect(page, '.modal'); fr = rect(page, '.modal .mf')
    check(mr and mr[3] <= H and fr[3] <= H, 'ominaisuusdialogin painikkeet näkyvissä')
    page.fill('#pFrom', 'Laituri'); page.fill('#pTo', 'Kari'); page.fill('#pAppr', 'Testi'); page.fill('#pVesNew', 'PV Testi')
    page.locator('.modal button', has_text='Hyväksy').first.tap(); page.wait_for_timeout(400)
    check(page.evaluate(f"Store.routeById('{rid}').status") == 'approved', 'hyväksyntä onnistuu')

    # --- karttapohja ja harppi ---
    page.tap('#baseSwitch [data-base=vector]'); page.wait_for_timeout(800)
    check(page.evaluate("ChartAPI.baseMode") == 'vector', 'Vektori-painike')
    page.tap('#tbMeasure'); page.wait_for_timeout(200)
    page.touchscreen.tap(150, 300); page.wait_for_timeout(200); page.touchscreen.tap(250, 360); page.wait_for_timeout(300)
    check(page.locator('#editBanner button', has_text='Poista viimeinen').count() == 1 and 'mpk' in page.inner_text('#roDist'), 'harpissa painikkeet ja välin pituus')
    page.locator('#editBanner button', has_text='Valmis').tap(); page.wait_for_timeout(200)
    check(page.evaluate("App.mode()") == 'idle' and page.locator('#editBanner button', has_text='Poista viimeinen').count() == 0, 'harppi päättyy (reitin muokkausilmoitus palaa, jos reitti on muokkaustilassa)')

    # --- karttareunuksen lukemat eivät ole painikkeiden alla (tarkistus piirron perusteella) ---
    shot(page, TAG + 'i5-reunus')
    check(not errs, 'ei sivuvirheitä ' + str(errs))

    # --- uudelleenlataus ja vaakatila ---
    page.reload(); page.wait_for_timeout(1500)
    check(page.evaluate("Store.state.routes.length") >= 1 and page.evaluate("Store.state.tasks.length") >= 1, 'tiedot säilyvät uudelleenlatauksessa')
    ctx.close()
    land = dict(pw.devices[DEVICE + ' landscape'])
    ctx = b.new_context(**{k: v for k, v in land.items() if k != 'default_browser_type'})
    page = ctx.new_page(); page.route('**/*', handle)
    page.goto(TARGET); page.wait_for_timeout(1200)
    page.locator('button:has-text("Aloita")').first.tap(); page.wait_for_timeout(500)
    LW = land['viewport']['width']
    check(page.evaluate("document.documentElement.scrollWidth") <= LW, 'vaakatila: sivu mahtuu')
    page.tap('#panelToggle'); page.wait_for_timeout(300)
    check(rect(page, '#panel')[3] <= land['viewport']['height'] + 1, 'vaakatila: kirjasto avautuu')
    shot(page, TAG + 'i6-vaaka')
    ctx.close()
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
