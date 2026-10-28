"""Vaihe 3l, savukoe: simulaattori käynnistyy veneillä, ei konsolivirheitä, veneiden lataus ja tilasto Mustalahdessa."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    t0 = time.time()
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=2026-07-15T09:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=240000)
    print('lataus', round(time.time() - t0, 1), flush=True)
    print(json.dumps(p.evaluate('__sim.boatStats')), flush=True)
    print(json.dumps(p.evaluate('(()=>{const t=__sim.boats.tilasto(); return {veneita:t.veneita, luokittain:t.luokittain, poijuja:t.poijuja, piirtokutsut:t.piirtokutsut, kolmiot:t.kolmiot, viimeinen:t.viimeinen}})()')), flush=True)
    p.wait_for_timeout(3000)
    p.screenshot(path='/tmp/claude-0/scratch3l/smoke.png', timeout=150000)
    print('virheet', errs[:8])
    b.close()
