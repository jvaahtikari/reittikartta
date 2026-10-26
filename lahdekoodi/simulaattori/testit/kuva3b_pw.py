"""Vaihe 3b: yksittäinen kuva kuljettajan näkymän moottorilla vapaalla kameralla.
Käyttö: python3 kuva3b_pw.py nimi tE tN tZ suunta etaisyys kameraKorkeus fov leveys korkeus [t=ISO] [aika=ms] [pb=1.0] [out=polku]
Kohde (tE, tN) on TM35FIN-koordinaatit, tZ kohteen korkeus järven pinnasta, suunta on katsesuunta (ruutusuunta, aste),
etäisyys kamerasta kohteeseen (m). Alus (ja turvalaitteiden päivitys) viedään kameran paikkaan, runko piilotetaan."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
a = sys.argv[1:]
name = a[0]; tE, tN, tZ, brg, dist, camH, fov, W, H = [float(x) for x in a[1:10]]
kw = dict(x.split('=', 1) for x in a[10:])
out = kw.get('out') or os.path.join(os.path.dirname(__file__), '..', 'shots', name + '.png')
b_ = math.radians(brg)
cx, cy = -dist * math.sin(b_), -dist * math.cos(b_)       # kameran paikka kohteen suhteen (E, N)
t = kw.get('t', '2026-10-25T10:00:00Z')
qs = 'e=%d&n=%d&h=%g&budget=14&pb=%s&t=%s' % (tE, tN, brg, kw.get('pb', '1.0'), t)
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = br.new_context(viewport={'width': int(W), 'height': int(H)}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?' + qs)
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=120000)
    # alus kameran paikkaan, jotta maasto ja merkit latautuvat kameran ympärille
    ox, oy = tE - int(tE), tN - int(tN)
    p.evaluate('''([cx, cy, ox, oy, h, camH, tz, fov, tx, ty]) => {
        __state.x = cx + ox; __state.y = cy + oy; __state.hdg = 0; __view.rig.visible = false;
        window.__free = [cx + ox, camH, -(cy + oy), ox, tz, -oy, fov]; }''', [cx, cy, ox, oy, brg, camH, tZ, fov, tE, tN])
    p.wait_for_function('window.__ready===true', timeout=150000)
    # odotetaan, että maasto asettuu uuden paikan ympärille
    p.wait_for_timeout(500)
    for _ in range(60):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__state.x, __state.y, true)')
    p.wait_for_timeout(2500)
    if kw.get('lisa'): p.evaluate(kw['lisa'])
    p.wait_for_timeout(1200)
    p.screenshot(path=out)
    if kw.get('eval'):
        r = p.evaluate('() => (' + kw['eval'] + ')')
        import base64
        def strip(o):
            if isinstance(o, dict): return {k: strip(v) for k, v in o.items()}
            if isinstance(o, list): return [strip(v) for v in o]
            if isinstance(o, str) and o.startswith('data:image/png;base64,'):
                fn = out.replace('.png', '_tex%d.png' % strip.n); strip.n += 1
                open(fn, 'wb').write(base64.b64decode(o.split(',', 1)[1])); return fn
            return o
        strip.n = 0
        print('EVAL', json.dumps(strip(r), ensure_ascii=False)[:3000])
    print(name, 'tallennettu', out)
    print(p.evaluate('JSON.stringify({r:__view.rendererStats(),f:__view.frameStats(),t:__view.aids.tilasto(),levels:__view.terrain.levels()})'))
    print('virheet', errs[:6])
    br.close()
