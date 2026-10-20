"""Syvä vesi / turvasyvyys. Testipalvelin palauttaa matalan alueen maskin tiilen vasemmalle
puoliskolle ja syvän oikealle; syvyysalueiden DRVAL1-arvot ovat 0, 3, 6 ja 10 m."""
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


PIX = """(() => {
  const c = [...document.querySelectorAll('.leaflet-depth-pane canvas')].find(t => t.width > 0 && t.style.opacity !== '0');
  if (!c) return null;
  const g = c.getContext('2d'), W = c.width, H = c.height, y = Math.floor(H / 2);
  const px = x => Array.from(g.getImageData(x, y, 1, 1).data);
  return { n: document.querySelectorAll('.leaflet-depth-pane canvas').length, left: px(Math.floor(W * 0.2)), right: px(Math.floor(W * 0.8)),
           edge: px(Math.floor(W / 2)), edge2: px(Math.floor(W / 2) - 1) };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    depth_urls = []
    page.on('request', lambda r: depth_urls.append(r.url) if 'rajoitettu/wms' in r.url else None)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("Store.state.settings.vessels = ['PV Turva', 'AV Roni']; Store.state.settings.currentVessel = 'PV Turva'; Store.emit('settings')")
    page.evaluate("App.map.setView([61.66, 23.80], 13)")
    page.wait_for_timeout(1200)
    check(page.evaluate("document.querySelectorAll('.leaflet-depth-pane canvas').length") == 0, 'oletuksena pois')

    page.click('#tbDeep')
    page.wait_for_timeout(2000)
    p = page.evaluate(PIX)
    print('pikselit', p)
    check(p is not None, 'syvyystiilet piirtyvät')
    if p:
        check(p['left'][3] > 80 and p['left'][2] > p['left'][0] + 40, 'matala alue sininen')
        check(p['right'][3] > 80 and min(p['right'][:3]) > 230, 'syvä alue vaalea')
        e = p['edge'] if p['edge'][3] > 200 else p['edge2']
        check(e[3] > 200 and max(e[:3]) < 120, 'turvakäyrä tummana rajalla')
    chip = page.inner_text('.safety-chip')
    print('ilmoitus:', chip.replace('\n', ' | '))
    check('turvasyvyys 2 m' in chip and 'Turvakäyrä tässä näkymässä: 3 m' in chip, 'oletus 2 m → turvakäyrä 3 m')
    check(page.evaluate("document.getElementById('tbDeep').classList.contains('on')"), 'työkalupainike aktiivinen')
    shot(page, 's1-syva-vesi')

    # turvasyvyyden asetus valikosta
    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='Aseta turvasyvyys').first.click()
    page.fill('#sdVal', '7')
    page.locator('.modal button', has_text='Näytä syvä vesi').click()
    page.wait_for_timeout(1500)
    chip = page.inner_text('.safety-chip')
    print('ilmoitus:', chip.replace('\n', ' | '))
    check('turvasyvyys 7 m' in chip and '10 m' in chip and 'ei erottele' in chip, '7 m → 10 m ja huomautus karkeudesta')
    st = page.evaluate("Store.state.settings.safetyDepths")
    check(st.get('PV Turva') == 7, 'arvo tallentui alukselle')
    url = depth_urls[-1] if depth_urls else ''
    check('DRVAL1' in url and url.endswith('%207'), 'pyyntö käyttää turvasyvyyttä')

    # aluksen vaihto: oma arvo (oletus 2 m)
    page.select_option('#vesselSel', 'AV Roni')
    page.wait_for_timeout(1500)
    chip = page.inner_text('.safety-chip')
    check('turvasyvyys 2 m (AV Roni)' in chip, 'toisella aluksella oma turvasyvyys')

    # pois päältä
    page.click('#tbDeep')
    page.wait_for_timeout(500)
    check(page.evaluate("document.querySelectorAll('.leaflet-depth-pane canvas').length") == 0 and
          page.evaluate("document.querySelector('.safety-chip').hidden"), 'pois päältä')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
