"""Vaihe 3b: kuvan kesto osia piilottamalla (vuorotellen, 30 kn ajossa)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
sl = float(sys.argv[1]) if len(sys.argv) > 1 else 6
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&auto=30&ff=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    p.tap('#swapBtn'); p.wait_for_timeout(500)
    p.wait_for_function('window.__sim.S.v/0.514444 > 27.5', timeout=150000)
    p.wait_for_timeout(5000)
    p.evaluate('''() => { window.__ft = []; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__ft.length < 9000) requestAnimationFrame(f); })(last);
      const V = __view; window.__hide = function (what) {
        const all = []; V.terrain.group.traverse(o => { if (o.isInstancedMesh) all.push(o); });
        V.terrain.group.visible = true; V.aids.group.visible = true; V.landmarks.visible = true; V.scene.children.forEach(o => { if (o.type === 'Group' && o !== V.terrain.group && o !== V.aids.group) o.visible = true; });
        if (what === 'trees') { window.__ti = all; } 
        if (what === 'aids') V.aids.group.visible = false;
        if (what === 'landmarks') V.landmarks.visible = false;
        if (what === 'terrain') V.terrain.group.visible = false;
        if (what === 'rig') V.rig.visible = false; else V.rig.visible = true;
        V.terrain.setTreeBudget(what === 'trees' ? 0 : 110000);
      }; }''')
    names = ['base', 'trees', 'aids', 'landmarks', 'terrain', 'rig']
    for rep in range(2):
        for nm in names:
            p.evaluate('([n]) => { __hide(n); window.__ft.length = 0; }', [nm])
            p.wait_for_timeout(int(sl * 1000))
            r = p.evaluate('''() => { const ft = window.__ft.slice(3).sort((a,b)=>a-b); const s = __view.rendererStats(); return { med: Math.round(ft[Math.floor(ft.length/2)]*10)/10, mean: Math.round(ft.reduce((a,b)=>a+b,0)/ft.length*10)/10, n: ft.length, tris: s.triangles, calls: s.calls }; }''')
            print(nm, json.dumps(r), flush=True)
    print('virheet', errs[:5])
    b.close()
