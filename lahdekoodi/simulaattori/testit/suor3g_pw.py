"""Vaihe 3g, kriteeri 4: kuvavälin vertailu vanha (8156) ja uusi (8154) samassa istunnossa (samat kone ja prosessi, vuorottelu).
Kuvataan kaksi paikkaa (A: Koukkuniemen lähellä, runsaasti merkkejä, B: lähtöpaikka), pb 0,55, 1440 x 900, ei kiikaria.
Jokaisesta sivusta mitataan rAF-välien mediaani ja p95 s sekunnin ajan, vuorotellen kierroksia kierros kerrallaan.
Käyttö: python3 suor3g_pw.py [vanha-osoite] [uusi-osoite] [kierrokset=2] [sekuntia=12]"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
OLD = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8156/'
NEW = sys.argv[2] if len(sys.argv) > 2 else SIM
ROUNDS = int(sys.argv[3]) if len(sys.argv) > 3 else 2
SEC = float(sys.argv[4]) if len(sys.argv) > 4 else 12
PLACES = {'A': (1254.0, 1541.0), 'B': None}
def setup(pw, base):
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(0.55)')
    p.evaluate('document.getElementById("pauseBtn").click()')
    return b, p
def place(p, name):
    if PLACES[name]:
        X, Y = PLACES[name]
        p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=347-S.conv; S.orderHdg=347; S.v=0;})()' % (X, Y))
    else:
        p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=347-S.conv; S.orderHdg=347; S.v=0;})()' % START)
    p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=120000)
    for _ in range(60):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)'); p.wait_for_timeout(3000)
def measure(p):
    p.evaluate('''() => { window.__ft = []; window.__run = true; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__run) requestAnimationFrame(f); })(last); }''')
    p.wait_for_timeout(int(SEC * 1000))
    return p.evaluate('''() => { window.__run = false; const ft = window.__ft.slice(5).sort((a,b)=>a-b); return { n: ft.length, median: ft[Math.floor(ft.length/2)], p95: ft[Math.floor(ft.length*0.95)], mean: ft.reduce((a,b)=>a+b,0)/ft.length, calls: __view.rendererStats().calls, tris: __view.rendererStats().triangles }; }''')
res = {}
with sync_playwright() as pw:
    bo, po = setup(pw, OLD); bn, pn = setup(pw, NEW)
    START = tuple(po.evaluate('[__sim.S.x, __sim.S.y]'))
    for name in ('A', 'B'):
        place(po, name); place(pn, name)
        for rd in range(ROUNDS):
            # vuorottelu: vain yksi sivu kerrallaan on näkyvissä (taustasivun rAF pysähtyy), järjestys vaihtuu joka kierros
            order = [('vanha', po, pn), ('uusi', pn, po)] if rd % 2 == 0 else [('uusi', pn, po), ('vanha', po, pn)]
            for lab, pa, pb in order:
                pa.bring_to_front(); r = measure(pa)
                res.setdefault(name, {}).setdefault(lab, []).append(r)
                print(name, rd, lab, json.dumps(r), flush=True)
    bo.close(); bn.close()
for name in res:
    for lab in ('vanha', 'uusi'):
        m = sorted(x['median'] for x in res[name][lab]); mean = sum(x['mean'] for x in res[name][lab]) / len(res[name][lab])
        print('%s %-5s mediaani %.1f ms, keskiarvo %.1f ms' % (name, lab, sum(m) / len(m), mean))
    ov = sum(x['mean'] for x in res[name]['vanha']) / len(res[name]['vanha']); nv = sum(x['mean'] for x in res[name]['uusi']) / len(res[name]['uusi'])
    print(name, 'uusi / vanha (keskiarvo) = %.3f' % (nv / ov))
json.dump(res, open(os.path.join(os.path.dirname(__file__), 'tulos_3g_suor.json'), 'w'), indent=1)
