"""Vaihe 3c, kriteeri 2: kuvaväli 30 solmun ajossa (Chromium Pixel 7, SwiftShader), automaattiohjaus, aikakerroin 1.
Tilanteet: plot (ei tutkaa, 3D päänäkymä), tutka_pieni (tutka pienenä ikkunana, 3D päänäkymä), tutka_paa (tutka päänäkymä, 3D pienenä),
kolme (1600 x 900, plotteri, 3D ja tutka rinnakkain), leveaplot ja leveatutka (1600 x 900, vain plotteri tai vain tutka 3D:n vieressä). Käyttö: python3 tutka_suorituskyky_pw.py <tilanne> [mittausaika s]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
tilanne = sys.argv[1] if len(sys.argv) > 1 else 'plot'
meas_s = float(sys.argv[2]) if len(sys.argv) > 2 else 20
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    if tilanne in ('kolme', 'leveaplot', 'leveatutka'):
        b, c = chromium(pw, viewport={'width': 1600, 'height': 900}, screen={'width': 1600, 'height': 900}, device_scale_factor=1, is_mobile=False, has_touch=False)
    else:
        b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    naytot = 'plot' if tilanne in ('plot', 'leveaplot') else ('both' if tilanne == 'kolme' else 'radar')
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&auto=30&ff=1&naytot=' + naytot)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    if tilanne in ('plot', 'tutka_pieni'):
        p.tap('#swapBtn'); p.wait_for_timeout(500)
    p.wait_for_function('window.__sim.S.v/0.514444 > 27.5', timeout=150000)
    p.wait_for_timeout(3000)
    p.evaluate('''() => { window.__ft = []; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__ft.length < 4000) requestAnimationFrame(f); })(last);
       window.__rt0 = __radar ? __radar.tilasto() : null; }''') if False else p.evaluate('''() => { window.__ft = []; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__ft.length < 4000) requestAnimationFrame(f); })(last); window.__rt0 = window.__radar ? JSON.parse(JSON.stringify(__radar.tilasto())) : null; }''')
    t1 = time.time()
    while time.time() - t1 < meas_s: p.wait_for_timeout(1000)
    r = p.evaluate('''() => { const ft = window.__ft.slice(5).sort((a,b)=>a-b); const q = x => ft[Math.floor(ft.length*x)];
      const t1 = window.__radar ? __radar.tilasto() : null, t0 = window.__rt0;
      return { n: ft.length, median: q(0.5), p95: q(0.95), max: ft[ft.length-1], v: __sim.S.v/0.514444, instr: __sim.instr, radarShown: __sim.radarShown, radarMain: __sim.radarMain, pb: __view.getPixelBudget(), size: [innerWidth, innerHeight],
        tutka: t1 && { piirtoa: t1.piirrot - t0.piirrot, piirtoMs: t1.piirtoMs, piirtoMax: t1.piirtoMax, sateita: t1.sateita - t0.sateita, ruutuja: t1.ruutuja } }; }''')
    print(tilanne, json.dumps(r))
    p.screenshot(path=os.path.join(out, '_3c_perf_%s.png' % tilanne))
    print('C2 %s: kuvavälin mediaani %.1f ms (p95 %.1f ms), virheet %s' % (tilanne, r['median'], r['p95'], errs[:3]))
    b.close()
