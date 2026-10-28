"""Sovelluksen savutesti: ajaa harjoituksen automaattiohjauksella nopeutettuna ja kerää virheet, kuvaajat ja mittarit."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
qs = sys.argv[1] if len(sys.argv) > 1 else 'alku=1&auto=30&ff=10'
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 110
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    t0 = time.time()
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&' + qs)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=90000)
    print('lataus', round(time.time() - t0, 1), 's')
    p.screenshot(path=os.path.join(out, '_app_run0.png'))
    t1 = time.time()
    while time.time() - t1 < limit:
        m = p.evaluate('window.__sim.mode')
        if m == 'debrief': break
        p.wait_for_timeout(2000)
    print('tila', p.evaluate('window.__sim.mode'), 'sim t', p.evaluate('window.__sim.S.t'), 'ajoaika', round(time.time() - t1, 1))
    if p.evaluate('window.__sim.mode') == 'debrief':
        p.wait_for_timeout(9000)
        p.screenshot(path=os.path.join(out, '_app_purku1.png'))
        print(p.inner_text('#dbBody'))
        p.evaluate('document.getElementById("debrief").scrollTop = 1600'); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '_app_purku2.png'))
        p.evaluate('document.getElementById("debrief").scrollTop = 3200'); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '_app_purku3.png'))
    p.screenshot(path=os.path.join(out, '_app_end.png'))
    print('virheet', errs[:10])
    b.close()
