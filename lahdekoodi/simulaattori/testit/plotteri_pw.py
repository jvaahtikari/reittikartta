import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
os.makedirs(out, exist_ok=True)
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    reqs = []
    p.on('requestfailed', lambda r: reqs.append((r.url[:90], r.failure)))
    for name, qs in [('plot_a', 'x=0&y=0&h=53&mpk=1'), ('plot_b', 'x=1800&y=1500&h=75&mpk=0.5')]:
        p.goto(SIM + 'simulaattori/testit/plotteri_testi.html?' + qs)
        p.wait_for_function('window.__aidsReady===true', timeout=60000)
        p.wait_for_timeout(5000)
        p.screenshot(path=os.path.join(out, '_' + name + '.png'))
    print('virheet', errs[:10])
    print('epäonnistuneet pyynnöt', reqs[:10])
    b.close()
