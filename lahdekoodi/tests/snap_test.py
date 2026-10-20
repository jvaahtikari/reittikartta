import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, state, shot
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(os.environ.get('TARGET','file:///home/claude/reittikartta/index.html'))
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.64, 23.76], 13)")
    page.wait_for_timeout(2500)
    px = lambda lat, lng: page.evaluate(f"(()=>{{const p=App.map.latLngToContainerPoint([{lat},{lng}]); const r=App.map.getContainer().getBoundingClientRect(); return [p.x+r.left, p.y+r.top];}})()")
    vx, vy = px(61.640, 23.760)          # käännöspiste testiaineistossa
    lx, ly = px(61.628, 23.751)          # piste suoralla linjalla (23.700,61.560)-(23.760,61.640), t=0,85
    page.keyboard.press('Control+r')
    page.mouse.move(vx + 6, vy - 5); page.wait_for_timeout(150)
    shot(page, 's1-kiinnitys-osoitin')
    print('tila:', page.inner_text('#roMode'))
    n = lambda: page.evaluate('Store.state.routes.map(r=>r.points.length)')
    page.mouse.click(vx + 6, vy - 5); page.wait_for_timeout(250); print('1:', n())
    page.mouse.move(lx + 5, ly + 3); page.wait_for_timeout(150)
    print('el:', page.evaluate(f'document.elementFromPoint({lx+5},{ly+3}).className.baseVal ?? document.elementFromPoint({lx+5},{ly+3}).className'))
    page.mouse.click(lx + 5, ly + 3); page.wait_for_timeout(250); print('2:', n())
    page.keyboard.down('Alt'); page.mouse.click(lx + 120, ly + 40); page.keyboard.up('Alt'); page.wait_for_timeout(250); print('3:', n())
    print('virheet nyt:', errs)
    print('ennen Esc:', page.evaluate('Store.state.routes.map(r=>r.points.length)'))
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    print('jälkeen:', page.evaluate('Store.state.routes.map(r=>r.points.length)'))
    r = page.evaluate('Store.state.routes')[0]
    for p in r['points']:
        print(round(p['lat'], 6), round(p['lng'], 6), p.get('snap'))
    # siirto: vedä 3. piste lähelle käännöspistettä (23.800, 61.700)
    page.evaluate("App.map.setView([61.66, 23.78], 12)"); page.wait_for_timeout(1500)
    wx, wy = px(r['points'][2]['lat'], r['points'][2]['lng'])
    tx, ty = px(61.700, 23.800)
    page.mouse.move(wx, wy); page.mouse.down(); page.mouse.move(tx - 4, ty + 6, steps=8); page.wait_for_timeout(100)
    shot(page, 's2-siirto')
    page.mouse.up(); page.wait_for_timeout(300)
    p3 = page.evaluate('Store.state.routes')[0]['points'][2]
    print('siirretty:', round(p3['lat'], 6), round(p3['lng'], 6), p3.get('snap'))
    print('virheet:', errs)
    b.close()
