import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
W, H = (int(x) for x in sys.argv[1].split('x')); extra = sys.argv[2] if len(sys.argv) > 2 else ''
name = sys.argv[3] if len(sys.argv) > 3 else '_pika'
wait = float(sys.argv[4]) if len(sys.argv) > 4 else 4
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.on('requestfailed', lambda r: errs.append(('reqfail', r.url[:100])))
    t0 = time.time()
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1' + extra)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    print('lataus', round(time.time() - t0, 1))
    p.wait_for_timeout(int(wait * 1000))
    p.screenshot(path=os.path.join(os.path.dirname(__file__), '..', 'shots', name + '.png'))
    print(p.evaluate('JSON.stringify({layout:__sim.layout, ci:__pl.cacheInfo(), v:__pl.view(), ready:__pl.ready()})'))
    print('virheet', errs[:8])
    b.close()
