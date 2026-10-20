"""Vektorikartta: syvyysalueista piirretty pohja, syvyysluvut ja pakotetut väylälinjat."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot, overpass_log, overpass_fail_main
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
    overpass_fail_main.append(1)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.66, 23.80], 13)")
    page.wait_for_timeout(1200)

    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='vektorikartta').first.click()
    page.wait_for_timeout(2500)
    check(page.evaluate("ChartAPI.vectorShown"), 'vektoripohja näkyy')
    check(not page.evaluate("App.map.hasLayer(ChartAPI.base.charts)"), 'rasteri pois')
    check(page.evaluate("App.map.getContainer().classList.contains('vec-base')"), 'maan taustaväri käytössä')
    px = page.evaluate("""(() => {
      const c = [...document.querySelectorAll('.leaflet-chart-pane canvas')].find(t => t.width >= 512);
      if (!c) return null;
      const g = c.getContext('2d'), W = c.width, H = c.height;
      return { left: Array.from(g.getImageData(Math.floor(W*0.2), H>>1, 1, 1).data), right: Array.from(g.getImageData(Math.floor(W*0.8), H>>1, 1, 1).data) };
    })()""")
    print('pikselit', px)
    check(px is not None and px['right'][3] > 200 and px['left'][3] < 20, 'vesialue piirtyy, maa läpinäkyvä')
    n_snd = page.evaluate("document.querySelectorAll('.snd').length")
    check(n_snd > 10, 'syvyysluvut näkyvät (%d)' % n_snd)
    check(page.evaluate("document.querySelector('.snd sub') !== null"), 'desimaali alaindeksinä')
    shot(page, 'v1-vektori')
    # turvalaitemerkit tarkalleen omissa paikoissaan (ei kasautuvaa siirtymää merkistä toiseen)
    page.evaluate("App.map.setView([61.617, 23.75], 13)"); page.wait_for_timeout(1500)
    for z in (13, 15):
        page.evaluate(f"App.map.setZoom({z})"); page.wait_for_timeout(1200)
        offs = page.evaluate("""(() => { const out = []; const m = App.map, rect = m.getContainer().getBoundingClientRect();
          m.eachLayer(l => { if (l instanceof L.Marker && l.options.pane === 'aidPane') { const el = l.getElement(); if (!el) return;
            const c = el.querySelector('svg circle.pos'); if (!c) return; const r = c.getBoundingClientRect(), P = m.latLngToContainerPoint(l.getLatLng());
            out.push(Math.hypot(r.left + r.width / 2 - rect.left - P.x, r.top + r.height / 2 - rect.top - P.y)); } });
          return out; })()""")
        check(len(offs) >= 3 and max(offs) < 1.0, 'tasolla %d turvalaitteet paikallaan (suurin poikkeama %.1f px, %d merkkiä)' % (z, max(offs) if offs else -1, len(offs)))

    page.evaluate("App.map.setView([61.66, 23.80], 12)")
    page.wait_for_timeout(1200)
    check(page.evaluate("document.querySelectorAll('.snd').length") == 0, 'syvyysluvut piilossa kaukana')

    # laiturit OpenStreetMapista veden päällä; pääpalvelin ei vastaa (asetettu testin alussa) → varapalvelin
    page.evaluate("App.map.setView([61.6172, 23.7495], 17)"); page.wait_for_timeout(2500)
    print('overpass', [u.split('/')[2] for u in overpass_log])
    check(page.evaluate("ChartAPI.pierCount") >= 3, 'laiturit piirtyvät (%d kuviota)' % page.evaluate("ChartAPI.pierCount"))
    check(len(overpass_log) >= 2 and 'kumi' in overpass_log[-1], 'varapalvelin käytössä, kun pääpalvelin ei vastaa')
    pier_px = page.evaluate("""(() => { const c = document.querySelector('.leaflet-pier-pane canvas'); if (!c) return null;
        const r = c.getBoundingClientRect(), P = App.map.latLngToContainerPoint([61.61695, 23.75]), M = App.map.getContainer().getBoundingClientRect();
        const sx = c.width / r.width, x = (P.x + M.left - r.left) * sx, y = (P.y + M.top - r.top) * sx;
        return Array.from(c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data); })()""")
    print('laituripikseli', pier_px)
    check(pier_px is not None and pier_px[3] > 200, 'laituri näkyy vesialueen päällä')
    check('OpenStreetMap' in page.inner_text('.leaflet-control-attribution'), 'OSM mainittu lähteenä')
    shot(page, 'v3-laiturit')
    del overpass_fail_main[:]
    n_req = len(overpass_log)
    page.reload(); page.wait_for_timeout(2500)
    page.evaluate("App.map.setView([61.6172, 23.7495], 17)"); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.pierCount") >= 3 and len(overpass_log) == n_req, 'uudelleenlatauksen jälkeen laiturit välimuistista ilman uutta hakua')

    # syvä zoom vektorikartalla
    page.evaluate("App.map.setView([61.617, 23.75], 20)"); page.wait_for_timeout(2500)
    check(page.evaluate("App.map.getZoom()") == 20 and page.evaluate("ChartAPI.vectorShown"), 'vektorikarttaa voi suurentaa tasolle 20')
    px20 = page.evaluate("""(() => { const c = [...document.querySelectorAll('.leaflet-chart-pane canvas')].filter(t => t.width >= 512 && t.closest('.leaflet-tile-container').style.visibility !== 'hidden');
        return c.length; })()""")
    check(px20 > 0, 'vektoritiilet piirtyvät tasolla 20 (%d)' % px20)
    page.evaluate("App.map.setView([61.66, 23.80], 13)"); page.wait_for_timeout(1200)

    page.wait_for_timeout(400)
    page.reload(); page.wait_for_timeout(2500)
    check(page.evaluate("ChartAPI.baseMode") == 'vector' and page.evaluate("ChartAPI.vectorShown"), 'valinta säilyy')

    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='rasterikartta').first.click()
    page.wait_for_timeout(1200)
    check(page.evaluate("App.map.hasLayer(ChartAPI.base.charts)") and not page.evaluate("ChartAPI.vectorShown"), 'paluu rasteriin')
    check(not page.evaluate("App.map.getContainer().classList.contains('vec-base')"), 'taustaväri palautui')
    check(page.evaluate("ChartAPI.pierCount") == 0, 'rasterikartalla laitureita ei piirretä (ne ovat kartassa)')

    # rasterin tarkkuuden loppuessa vektorikartta tulee itsestään päälle ja uloszoomatessa poistuu
    page.evaluate("App.map.setView([61.66, 23.80], 17)"); page.wait_for_timeout(1500)
    check(page.evaluate("App.map.hasLayer(ChartAPI.base.charts) && !ChartAPI.vectorShown"), 'tasolla 17 rasteri')
    page.evaluate("App.map.setZoom(18)"); page.wait_for_timeout(2500)
    check(page.evaluate("ChartAPI.vectorShown && ChartAPI.shownBase === 'vector' && ChartAPI.baseMode === 'raster'"), 'tasolla 18 vektorikartta, valintana edelleen rasteri')
    check(not page.evaluate("App.map.hasLayer(ChartAPI.base.charts)"), 'rasteri poistuu, kun vektoritiilet ovat valmiit')
    check(not page.evaluate("document.querySelector('.auto-note').hidden"), 'huomautus automaattisesta vaihdosta näkyy')
    shot(page, 'v2-automaattinen-vektori')
    page.evaluate("App.map.setZoom(17)"); page.wait_for_timeout(1500)
    check(page.evaluate("App.map.hasLayer(ChartAPI.base.charts) && !ChartAPI.vectorShown"), 'uloszoomatessa takaisin rasteriin')
    check(page.evaluate("document.querySelector('.auto-note').hidden"), 'huomautus poistuu')

    # esitystavan painikkeet kartalla
    sel = lambda: page.evaluate("[...document.querySelectorAll('#baseSwitch button[aria-checked=true]')].map(b => b.dataset.base)")
    check(sel() == ['raster'], 'painikkeissa valittuna rasteri: %s' % sel())
    page.click('#baseSwitch [data-base=vector]'); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.baseMode") == 'vector' and page.evaluate("ChartAPI.vectorShown") and sel() == ['vector'], 'Vektori-painike vaihtaa vektorikarttaan')
    page.click('#baseSwitch [data-base=enc]'); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.baseMode") == 'enc' and sel() == ['enc'], 'ENC-painike')
    page.click('#baseSwitch [data-base=enc-ecdis]'); page.wait_for_timeout(1000)
    check(page.evaluate("ChartAPI.baseMode") == 'enc-ecdis' and sel() == ['enc-ecdis'], 'ECDIS-painike')
    page.click('#baseSwitch [data-base=raster]'); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.baseMode") == 'raster' and page.evaluate("App.map.hasLayer(ChartAPI.base.charts)"), 'Rasteri-painike')
    page.evaluate("App.map.setZoom(18)"); page.wait_for_timeout(2000)
    check(sel() == ['raster'] and page.evaluate("document.querySelector('#baseSwitch [data-base=vector]').classList.contains('auto')"),
          'tasolla 18 rasteri valittuna ja Vektori-painike merkitty automaattiseksi')
    shot(page, 'v4-painikkeet-auto')
    page.click('#baseSwitch [data-base=raster]'); page.wait_for_timeout(1500)
    check(page.evaluate("App.map.getZoom()") == 17 and not page.evaluate("document.querySelector('#baseSwitch [data-base=vector]').classList.contains('auto')"),
          'Rasteri-painike tasolla 18 zoomaa tasolle 17')
    page.evaluate("App.map.setZoom(15)"); page.wait_for_timeout(800)
    shot(page, 'v5-painikkeet')

    # pikanäppäimet
    page.mouse.click(700, 450); page.wait_for_timeout(300)
    page.keyboard.press('v'); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.baseMode") == 'vector' and page.evaluate("ChartAPI.vectorShown"), 'V vaihtaa vektorikarttaan')
    page.keyboard.press('e'); page.wait_for_timeout(1500)
    check(page.evaluate("ChartAPI.baseMode") == 'enc', 'E vaihtaa ENC-karttaan')
    page.keyboard.press('Shift+E'); page.wait_for_timeout(1000)
    check(page.evaluate("ChartAPI.baseMode") == 'enc-ecdis', 'Shift+E vaihtaa ECDIS-symboleihin')
    page.evaluate("App.map.setZoom(19)"); page.wait_for_timeout(2000)
    check(page.evaluate("ChartAPI.vectorShown"), 'ENC-pohjallakin vektorikartta tason 17 jälkeen')
    page.keyboard.press('r'); page.wait_for_timeout(1800)
    check(page.evaluate("ChartAPI.baseMode") == 'raster' and page.evaluate("App.map.getZoom()") == 17 and page.evaluate("App.map.hasLayer(ChartAPI.base.charts)"),
          'R tasolla 19: rasterikartta ja zoom tasolle 17')
    page.fill('#searchIn', 'r'); page.wait_for_timeout(300)
    check(page.evaluate("ChartAPI.baseMode") == 'raster', 'kirjoittaminen hakukenttään ei vaihda pohjaa')
    page.fill('#searchIn', '')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
