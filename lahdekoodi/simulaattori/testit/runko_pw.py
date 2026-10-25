import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    for name, qs in [('runko_ulko', 'interior=0'), ('runko_sisa', 'interior=1&fov=70'), ('runko_ulko_yhd', 'interior=0&merge=0')]:
        p.goto(SIM + 'simulaattori/testit/runko_testi.html?' + qs)
        p.wait_for_function('window.__ready===true', timeout=60000)
        print(name, p.evaluate('JSON.stringify(window.__info)'))
        p.screenshot(path=os.path.join(out, '_' + name + '.png'))
    print('virheet', errs[:10])
    b.close()
