"""Vaihe 3j, kriteeri 3 (CPU-aika): prosessorin aika kuvaa kohden vanhalla ja uudella koodilla (SwiftShader, kone kuormitettu muilla ajoilla, joten seinäkelloaika ei kelpaa). Alkuperäinen kuvaus: kuvavälin vertailu vanha ja uusi samassa istunnossa (sama kone, vuorottelu), pisteissä A ja B.
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

import psutil
def cpu_of(root_pid):
    tot = 0.0
    try:
        procs = [psutil.Process(root_pid)] + psutil.Process(root_pid).children(recursive=True)
    except Exception: return 0.0
    for q in procs:
        try: t = q.cpu_times(); tot += t.user + t.system
        except Exception: pass
    return tot
def measure_cpu(p):
    p.evaluate("""() => { window.__fr = 0; window.__run = true; (function f(){ window.__fr++; if (window.__run) requestAnimationFrame(f); })(); }""")
    # Lämmittely: ensimmäiset sekunnit sisältävät taustatyötä (tekstuurien lataus, rakennus), joten mitataan viidessä jaksossa ja raportoidaan myös viimeinen jakso
    WARM = float(os.environ.get('WARM', '15'))
    p.wait_for_timeout(int(WARM * 1000))
    f0 = p.evaluate("() => window.__fr")
    c0 = cpu_of(os.getpid()); t0 = time.time(); chunks = []
    cc, ff = c0, f0
    for _ in range(4):
        p.wait_for_timeout(int(SEC * 250))
        c2 = cpu_of(os.getpid()); f2 = p.evaluate("() => window.__fr")
        chunks.append(round((c2 - cc) / max(1, f2 - ff) * 1000))
        cc, ff = c2, f2
    c1 = cpu_of(os.getpid()); t1 = time.time()
    fr = p.evaluate("() => { window.__run = false; return window.__fr; }") - f0
    st = p.evaluate("(() => { const r = __view.rendererStats(); return {calls: r.calls, triangles: r.triangles}; })()")
    return {'frames': fr, 'cpu_s': c1 - c0, 'wall_s': t1 - t0, 'ms_per_frame_cpu': (c1 - c0) / max(1, fr) * 1000, 'jaksot': chunks, 'calls': st['calls'], 'triangles': st['triangles']}
res = {}
with sync_playwright() as pw:
    for name in os.environ.get('PISTEET', 'A,B').split(','):
        for rd in range(ROUNDS):
            for lab, base, laatu in (('vanha', OLD, None), ('uusi', NEW, LAATU)):
                b, p, errs = setup(pw, base, laatu)
                place(p, name)
                r = measure_cpu(p); r['virheet'] = errs[:2]
                res.setdefault(name, {}).setdefault(lab, []).append(r)
                print(name, rd, lab, json.dumps(r), flush=True)
                b.close()
out = {}
for name in res:
    ov = sorted(x['ms_per_frame_cpu'] for x in res[name]['vanha']); nv = sorted(x['ms_per_frame_cpu'] for x in res[name]['uusi'])
    om, nm = ov[len(ov) // 2], nv[len(nv) // 2]
    out[name] = {'vanha_cpu_ms_med': om, 'uusi_cpu_ms_med': nm, 'suhde': nm / om, 'uusi_kutsut': res[name]['uusi'][-1]['calls'], 'uusi_kolmiot': res[name]['uusi'][-1]['triangles'], 'vanha_kutsut': res[name]['vanha'][-1]['calls'], 'vanha_kolmiot': res[name]['vanha'][-1]['triangles']}
    print(name, json.dumps(out[name]), flush=True)
json.dump({'tulos': out, 'raaka': res}, open(os.path.join(os.path.dirname(__file__), '..', 'shots', 'cpu3j_%s_%s.json' % (PROF, LAATU)), 'w'), indent=1)
