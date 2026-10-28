"""Vaihe 3j, kriteeri 3: kuvavälin vertailu vanha ja uusi samassa istunnossa (sama kone, vuorottelu), pisteissä A ja B.
Käyttö: python3 suor3j_pw.py <vanha-osoite> <uusi-osoite> <profiili: deck|pixel> <laatu: full|light> [kierrokset=3] [sekuntia=12] [pb=0.8]
Mitataan rAF-välien keskiarvo ja mediaani sekunnin ajan, vuorotellen vanha ja uusi, ja tulostetaan myös piirtokutsut ja kolmiot (WebGL-tilasto) sekä puiden luvut."""
import sys, os, json, time, datetime
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
OLD, NEW, PROF, LAATU = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ROUNDS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
SEC = float(sys.argv[6]) if len(sys.argv) > 6 else 12
PB = sys.argv[7] if len(sys.argv) > 7 else '0.8'
POINTS = {'A': (328010, 6823830, 112.0), 'B': (327330, 6824000, 182.0)}
ORIGIN = (327184, 6823553)
T0 = '2026-07-15T09:00:00Z'
def setup(pw, base, laatu):
    if PROF == 'pixel':
        b, c = chromium(pw)
    else:
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    extra = ('&laatu=' + laatu) if laatu else ''
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=' + T0 + extra)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=300000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(%s)' % PB)
    p.evaluate('document.getElementById("pauseBtn").click()')
    if PROF == 'pixel':
        p.evaluate('(()=>{const b=document.getElementById("swapBtn"); if(b && !b.hidden) b.click();})()')
    return b, p, errs
def place(p, k):
    E, N, hdg = POINTS[k]
    X, Y = E - ORIGIN[0], N - ORIGIN[1]
    p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=%f-S.conv; S.orderHdg=%f; if(S.hmHdg!==undefined) S.hmHdg=%f; S.v=0; S.orderSpeedKn=0;})()' % (X, Y, hdg, hdg, hdg))
    p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=300000)
    for _ in range(240):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.setSimTime(%d)' % int(datetime.datetime.fromisoformat(T0.replace('Z', '+00:00')).timestamp() * 1000))
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)'); p.wait_for_timeout(4000)
def measure(p):
    p.evaluate('''() => { window.__ft = []; window.__run = true; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__run) requestAnimationFrame(f); })(last); }''')
    p.wait_for_timeout(int(SEC * 1000))
    return p.evaluate('''() => { window.__run = false; const ft = window.__ft.slice(5).sort((a,b)=>a-b); const r = __view.rendererStats(); return { n: ft.length, median: ft[Math.floor(ft.length/2)], p95: ft[Math.floor(ft.length*0.95)], mean: ft.reduce((a,b)=>a+b,0)/ft.length, calls: r.calls, triangles: r.triangles, trees: __view.terrain.info().trees }; }''')
res = {}
with sync_playwright() as pw:
    bo, po, eo = setup(pw, OLD, None); bn, pn, en = setup(pw, NEW, LAATU)
    print('laatu uusi:', pn.evaluate('__view.getQuality ? __view.getQuality() : "?"'), flush=True)
    for name in ('A', 'B'):
        place(po, name); place(pn, name)
        for rd in range(ROUNDS):
            order = [('vanha', po), ('uusi', pn)] if rd % 2 == 0 else [('uusi', pn), ('vanha', po)]
            for lab, pa in order:
                pa.bring_to_front(); r = measure(pa)
                res.setdefault(name, {}).setdefault(lab, []).append(r)
                print(name, rd, lab, json.dumps(r), flush=True)
    print('virheet vanha', eo[:3], 'uusi', en[:3])
    bo.close(); bn.close()
out = {}
for name in res:
    ov = sum(x['mean'] for x in res[name]['vanha']) / len(res[name]['vanha']); nv = sum(x['mean'] for x in res[name]['uusi']) / len(res[name]['uusi'])
    omed = sorted(x['median'] for x in res[name]['vanha'])[len(res[name]['vanha']) // 2]; nmed = sorted(x['median'] for x in res[name]['uusi'])[len(res[name]['uusi']) // 2]
    out[name] = {'vanha_ka_ms': ov, 'uusi_ka_ms': nv, 'suhde_ka': nv / ov, 'vanha_med_ms': omed, 'uusi_med_ms': nmed, 'suhde_med': nmed / omed,
                 'uusi_kutsut': res[name]['uusi'][-1]['calls'], 'uusi_kolmiot': res[name]['uusi'][-1]['triangles'], 'vanha_kutsut': res[name]['vanha'][-1]['calls'], 'vanha_kolmiot': res[name]['vanha'][-1]['triangles']}
    print(name, json.dumps(out[name]), flush=True)
json.dump({'tulos': out, 'raaka': res}, open(os.path.join(os.path.dirname(__file__), '..', 'shots', 'suor3j_%s_%s.json' % (PROF, LAATU)), 'w'), indent=1)
