"""Vaihe 3b: puubudjetin vaikutus kuvan kestoon (vuorotellen eri budjetit samalla reitillä)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
budgets = [int(x) for x in sys.argv[1].split(',')]
slice_s = float(sys.argv[2]) if len(sys.argv) > 2 else 8
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&auto=30&ff=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    p.tap('#swapBtn'); p.wait_for_timeout(500)
    p.wait_for_function('window.__sim.S.v/0.514444 > 27.5', timeout=150000)
    p.evaluate('''() => { window.__ft = []; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__ft.length < 8000) requestAnimationFrame(f); })(last); }''')
    res = {}
    for rep in range(2):
        for bu in budgets:
            p.evaluate('([b]) => { __view.terrain.setTreeBudget(b); window.__ft.length = 0; }', [bu])
            p.wait_for_timeout(int(slice_s * 1000))
            r = p.evaluate('''() => { const ft = window.__ft.slice(3).sort((a,b)=>a-b); const s = __view.rendererStats(); return { med: ft[Math.floor(ft.length/2)], mean: ft.reduce((a,b)=>a+b,0)/ft.length, n: ft.length, tris: s.triangles, calls: s.calls, trees: __view.terrain.treeInfo() }; }''')
            res.setdefault(bu, []).append(r)
            print(bu, json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in r.items() if k != 'trees'}), r['trees']['instances'], flush=True)
    print('stats', json.dumps(p.evaluate('__view.terrain.info().stats')))
    print('virheet', errs[:5])
    b.close()
