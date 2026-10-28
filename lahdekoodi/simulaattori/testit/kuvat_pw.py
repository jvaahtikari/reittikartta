"""Kuvakaappaukset ihmisen arvioitavaksi: työpöytäasettelu ajon aikana (plotteri ja kuljettajan näkymä) sekä purkunäkymä."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
url = sys.argv[1] if len(sys.argv) > 1 else SIM + 'simulaattori.html'
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(url + ('&' if '?' in url else '?') + 'aineisto=' + PAKETTI + '&alku=1&auto=30&ff=25&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=120000)
    p.wait_for_function('window.__sim.S.t > 150 && window.__sim.S.v > 14', timeout=120000)
    p.wait_for_timeout(1500)
    p.screenshot(path=os.path.join(out, '4_ajo_plotteri_ja_nakyma.png'))
    t1 = time.time()
    while time.time() - t1 < 150 and p.evaluate('window.__sim.mode') != 'debrief':
        p.wait_for_timeout(2000)
    print('tila', p.evaluate('window.__sim.mode'), 'ajoaika', round(time.time() - t1, 1))
    if p.evaluate('window.__sim.mode') == 'debrief':
        p.wait_for_timeout(9000)
        p.screenshot(path=os.path.join(out, '5_purku.png'))
        p.evaluate('document.getElementById("debrief").scrollTop = 1400'); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '5_purku_komentoloki.png'))
    print('virheet', errs[:5])
    b.close()
