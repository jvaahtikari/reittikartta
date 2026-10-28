"""Vaihe 3n, kriteeri 4: oma näkymä (ei Google) piirtyy pisteessä A samoin kuin ennen. Kuva otetaan vanhalla ja uudella koodilla samoin ehdoin, ja kuvat vertaillaan.
Aallokon keinunta (nousu, kierto ja nostoliike) ja veden aika kiinnitetään, jotta kuvat eivät eroa kellon mukaan. Kuvat tallentuvat nimellä 3n_A_<tunniste>_3d.png.
Käyttö: python3 vertailu3n_pw.py <sim-osoite> <tunniste: vanha|uusi>     Vertailu: python3 vertailu3n_pw.py vertaa"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
if sys.argv[1] == 'vertaa':
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(os.path.join(out, '3n_A_vanha_3d.png')).convert('RGB')).astype(int)
    b = np.asarray(Image.open(os.path.join(out, '3n_A_uusi_3d.png')).convert('RGB')).astype(int)
    print('koko', a.shape, b.shape)
    d = np.abs(a - b).max(axis=2); n = d.size
    for t in (0, 2, 8, 16, 32):
        print('kanavaero yli %2d: %.4f %% pikseleistä' % (t, 100.0 * (d > t).sum() / n))
    sys.exit(0)
from pw import *
base, tag = sys.argv[1], sys.argv[2]
E, N, HDG = 328010, 6823830, 112.0
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=2026-07-15T09:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=400000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(0.8)')
    p.evaluate('document.getElementById("pauseBtn").click()')
    p.evaluate('(()=>{const S=__sim.S; S.x=%f-__sim.origin.e; S.y=%f-__sim.origin.n; S.hdg=%f-S.conv; S.orderHdg=%f; if(S.hmHdg!==undefined) S.hmHdg=%f; S.v=0; S.orderSpeedKn=0;})()' % (E, N, HDG, HDG, HDG))
    p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=200000)
    for _ in range(200):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.setSimTime(%d)' % int(__import__('datetime').datetime.fromisoformat('2026-07-15T09:00:00+00:00').timestamp() * 1000))
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
    # kiinnitetään keinunta ja veden aika
    p.evaluate("""(()=>{ const S=__view.settings; S.bobPitchDeg=0; S.bobRollDeg=0; S.bobHeaveM=0; Object.defineProperty(__view.uniforms.uTime,'value',{get:()=>5,set:()=>{}}); })()""")
    p.wait_for_timeout(5000)
    el = p.query_selector('#v3')
    el.screenshot(path=os.path.join(out, '3n_A_%s_3d.png' % tag), timeout=300000)
    print('tallennettu', tag, p.evaluate('JSON.stringify(__view.rendererStats())')[:120], flush=True)
    b.close()
