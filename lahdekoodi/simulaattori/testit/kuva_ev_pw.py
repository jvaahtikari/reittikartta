"""Vaihe 3d: plotterikuva, jossa keulaviiva, COG/SOG-vektori, EBL ja VRM näkyvät yhdessä (liikkeessä). Käyttö: python3 kuva_ev_pw.py chromium|desktop"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&auto=12&ff=1&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_function('window.__sim.S.v/0.514444 > 11', timeout=170000)
    p.evaluate('__sim.setSpeedFactor && __sim.setSpeedFactor(1)')
    p.evaluate('__pl.setVectorIdx(2); __pl.setEBL(((__pl.heading()+55)%360)); __pl.setVRM(0.3); __pl.setRangeNm(1)')
    p.wait_for_timeout(2500)
    p.screenshot(path=os.path.join(out, '3d_plotteri_viivat_vektori_ebl_vrm_%s.png' % dev))
    print('virheet', errs[:3], 'sog', p.evaluate('__sim.S.v/0.514444'))
    b.close()
