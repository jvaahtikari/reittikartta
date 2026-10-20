"""Hiiren rullan zoomaus: tarkkuusrullan purske, tavallinen naksaus, pitkä pyöräytys ja liike alle kynnyksen."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={'width': 1200, 'height': 800})
    page.route('**/*', handle)
    page.goto(os.environ.get('TARGET', 'file://' + os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/index.html')); page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")'); page.evaluate("App.map.setView([61.64, 23.76], 12)"); page.wait_for_timeout(800)
    def burst(n, dy, gap):
        page.evaluate("""([n, dy, gap]) => new Promise(res => { const el = document.getElementById('map'); let i = 0;
          const t = setInterval(() => { el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, clientX: 600, clientY: 400, bubbles: true, cancelable: true })); if (++i >= n) { clearInterval(t); res(); } }, gap); })""", [n, dy, gap])
        page.wait_for_timeout(500)
    z0 = page.evaluate('App.map.getZoom()')
    burst(14, -8, 15)            # tarkkuusrullan naksaus: 14 pientä tapahtumaa 15 ms välein (112 px)
    z1 = page.evaluate('App.map.getZoom()'); print('MagSpeed-naksaus:', z0, '->', z1, 'OK' if z1 == z0 + 1 else 'FAIL')
    burst(1, -100, 1)            # tavallinen hiiri: yksi tapahtuma
    z2 = page.evaluate('App.map.getZoom()'); print('tavallinen naksaus:', z1, '->', z2, 'OK' if z2 == z1 + 1 else 'FAIL')
    for k in range(3): burst(1, 100, 1); page.wait_for_timeout(300)
    z3 = page.evaluate('App.map.getZoom()'); print('3 naksausta ulos 300 ms välein:', z2, '->', z3, 'OK' if z3 == z2 - 3 else 'FAIL')
    burst(40, -6, 12)            # pitkä pyöräytys: 40 tapahtumaa 480 ms (240 px)
    z4 = page.evaluate('App.map.getZoom()'); print('pitkä pyöräytys 240 px:', z3, '->', z4, 'OK' if 1 <= z4 - z3 <= 3 else 'FAIL')
    burst(3, -5, 20)             # pieni liike alle kynnyksen
    z5 = page.evaluate('App.map.getZoom()'); print('alle kynnyksen:', z4, '->', z5, 'OK' if z5 == z4 else 'FAIL')
    b.close()
