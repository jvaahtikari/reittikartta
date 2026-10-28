"""Kriteerit 1 ja 6: kuvataajuus kuljettajan näkymässä 30 solmussa Mustalahden edustalla ja verkkosiirto minuutissa.
Ajetaan oikeassa sovelluksessa automaattiohjauksella (auto=30), 3D päänäkymänä, aikakerroin 1."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
page_url = sys.argv[1] if len(sys.argv) > 1 else SIM + 'simulaattori.html'
meas_s = float(sys.argv[2]) if len(sys.argv) > 2 else 20
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(page_url + ('&' if '?' in page_url else '?') + 'aineisto=' + PAKETTI + '&alku=1&auto=30&ff=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    p.tap('#swapBtn'); p.wait_for_timeout(500)
    # odotetaan 30 kn
    p.wait_for_function('window.__sim.S.v/0.514444 > 27.5', timeout=150000)
    p.evaluate('''() => { window.__ft = []; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__ft.length < 4000) requestAnimationFrame(f); })(last);
       window.__b0 = Aineisto.stats.bytes; window.__t0 = __sim.S.t; window.__d0 = __sim.S.dist; window.__rinfo = []; }''')
    t1 = time.time()
    while time.time() - t1 < meas_s:
        p.evaluate('window.__rinfo.push(__view.rendererStats())')
        p.wait_for_timeout(1000)
    r = p.evaluate('''() => { const ft = window.__ft.slice(5).sort((a,b)=>a-b); const med = ft[Math.floor(ft.length/2)], p95 = ft[Math.floor(ft.length*0.95)];
      const ri = window.__rinfo; return { n: ft.length, median: med, p95: p95, tris: Math.max(...ri.map(x=>x.triangles)), calls: Math.max(...ri.map(x=>x.calls)),
        bytes: Aineisto.stats.bytes - window.__b0, simT: __sim.S.t - window.__t0, dist: __sim.S.dist - window.__d0, v: __sim.S.v/0.514444, fs: __view.frameStats(), pb: __view.getPixelBudget(), size: [innerWidth, innerHeight] }; }''')
    p.screenshot(path=os.path.join(out, '_perf.png'))
    print(json.dumps(r))
    mpm = r['bytes'] / 1e6 / (r['simT'] / 60)
    print('C1 kuvan mediaanikesto %.1f ms (p95 %.1f ms), render-kutsut %d, kolmiot %d' % (r['median'], r['p95'], r['calls'], r['tris']))
    print('C1', 'OK' if r['median'] < 60 and r['tris'] < 300000 and r['calls'] < 300 else 'EI')
    print('C6 verkkosiirto %.2f Mt / simulaatiominuutti (%.0f m, %.0f s, %.1f kn)' % (mpm, r['dist'], r['simT'], r['v']), 'OK' if mpm < 3 else 'EI')
    print('virheet', errs[:5])
    b.close()
