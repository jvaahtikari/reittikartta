import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
name = sys.argv[1] if len(sys.argv) > 1 else 'nakyma_a'
qs = sys.argv[2] if len(sys.argv) > 2 else 'h=0'
with sync_playwright() as pw:
    vp = os.environ.get('VP')
    b, c = chromium(pw, **({'viewport': {'width': int(vp.split('x')[0]), 'height': int(vp.split('x')[1])}, 'device_scale_factor': 1} if vp else {}))
    p = c.new_page(); errs = []; collect(p, errs)
    t0 = time.time()
    p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?' + qs)
    try:
        p.wait_for_function('window.__ready===true', timeout=180000)
    except Exception as e:
        print('aikakatkaisu', e)
    p.wait_for_timeout(1500)
    print('valmis', round(time.time() - t0, 1), 's')
    print(p.evaluate('JSON.stringify({info:__view.terrain.info(),levels:__view.terrain.levels(),r:__view.rendererStats(),f:__view.frameStats(),budget:__view.getPixelBudget(),net:Aineisto.stats})'))
    p.screenshot(path=os.path.join(out, '_' + name + '.png'))
    print('turvalaitteet', p.evaluate('JSON.stringify({n:Merkit.all().length,bytes:window.__aidBytes,shown:__view.aids.count()})'))
    print('virheet', errs[:10])
    b.close()
