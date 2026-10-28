"""Vaihe 3j-2: ylhäältä-kuva (vapaa kamera suoraan alas) annetusta pisteestä nakyma_testi.html:ssä.
Käyttö: python3 ylhaalta3j2_pw.py <sim-osoite> <E> <N> <korkeus_m> <ulos.png> [fov=40] [nofix=1] [laatu=full|light]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; E = float(sys.argv[2]); N = float(sys.argv[3]); H = float(sys.argv[4]); out = sys.argv[5]
kw = dict(x.split('=', 1) for x in sys.argv[6:] if '=' in x)
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1000, 'height': 700}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    if kw.get('nofix'): p.add_init_script('window.__maastoNoFix=true;')
    p.goto(base + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=0&budget=14&pb=1.0&aineisto=%s' % (E, N, PAKETTI))
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=240000)
    if kw.get('laatu'): p.evaluate('__view.setQuality("%s")' % kw['laatu'])
    p.evaluate('([h, fov]) => { __view.rig.visible=false; window.__free=[0, h, 0, 0, 0, -0.001, fov]; }', [H, float(kw.get('fov', 40))])
    for _ in range(200):
        p.wait_for_timeout(1000)
        if p.evaluate('window.__ready===true && __view.terrain.idle()'): break
    p.wait_for_timeout(3000)
    p.screenshot(path=out, timeout=300000)
    print('virheet', errs[:4]); b.close()
