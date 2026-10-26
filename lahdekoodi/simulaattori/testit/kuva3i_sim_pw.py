"""Vaihe 3i, kriteerit 2 ja 3: koko sovellus (simulaattori.html, deck-asettelu 1440 x 900) käyttäjän kuvan paikasta (Naistenlahden satama, suunta 112, katse 067)
sekä siltojen vaikutus kuvaväliin samassa istunnossa: sillat päällä ja pois (bridges.mesh.visible) vuorotellen.
Käyttö: python3 kuva3i_sim_pw.py [E N hdg katse] [--kierrokset=4] [--sekuntia=6] [--kuva=3i_koko_naistenlahti_1440x900]"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
kw = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
E, N, HDG, LOOK = (float(pos[0]), float(pos[1]), float(pos[2]), float(pos[3])) if len(pos) >= 4 else (328050.0, 6823700.0, 112.0, 67.0)
out = os.path.join(os.path.dirname(__file__), '..', 'shots', kw.get('kuva', '3i_koko_naistenlahti_1440x900') + '.png')
rounds, secs = int(kw.get('kierrokset', 4)), float(kw.get('sekuntia', 6))
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=2026-10-26T10:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true')
    p.evaluate('document.getElementById("pauseBtn").click()')
    p.evaluate('''([e, n, hdg, look]) => { const S = __sim.S, o = __sim.origin || Paikka.getOrigin(); S.x = e - o.e; S.y = n - o.n; S.hdg = hdg - S.conv; S.orderHdg = hdg; S.v = 0;
        window.__look = look - hdg; window.__X = S.x; window.__Y = S.y; }''', [E, N, HDG, LOOK])
    p.evaluate('Merkit.load(__X, __Y, 7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=120000)
    p.evaluate('__view.setGaze(__look)')
    for _ in range(120):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && __view.bridges.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
    p.wait_for_timeout(3000)
    p.screenshot(path=out, timeout=150000)
    st = p.evaluate('JSON.stringify({r:__view.rendererStats(), b:__view.bridges.info().stats && {n:__view.bridges.info().stats.bridges, tris:__view.bridges.info().stats.total, piers:__view.bridges.info().stats.piers, list:__view.bridges.info().stats.list.map(x=>[x.name,x.k,Math.round(x.length),Math.round(x.waterM),x.tris])}})')
    print('koko', st, flush=True)
    print('siltojen rakennus', p.evaluate('JSON.stringify({builds:__view.bridges.info().builds, msMax:__view.bridges.info().msMax, ms:__view.bridges.info().stats.ms, asmMs:__view.bridges.info().stats.asmMs, tiles:__view.bridges.info().loaded, dem:__view.bridges.info().dem})'), flush=True)
    # kuvaväli (rAF-välien mediaani ja keskiarvo, kuten suor3g_pw.py): sillat päällä ja pois vuorotellen samassa sivussa ja prosessissa
    p.evaluate('__view.setPixelBudget(0.55)')
    def measure():
        p.evaluate('''() => { window.__ft = []; window.__run = true; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__run) requestAnimationFrame(f); })(last); }''')
        p.wait_for_timeout(int(secs * 1000))
        return p.evaluate('''() => { window.__run = false; const ft = window.__ft.slice(3).sort((a,b)=>a-b); return { n: ft.length, median: ft[Math.floor(ft.length/2)], p95: ft[Math.floor(ft.length*0.95)], mean: ft.reduce((a,b)=>a+b,0)/ft.length, calls: __view.rendererStats().calls, tris: __view.rendererStats().triangles }; }''')
    res = {'paalla': [], 'pois': []}
    for r in range(rounds):
        for tila in (('pois', 'paalla') if r % 2 == 0 else ('paalla', 'pois')):
            p.evaluate('__view.bridges.mesh.visible = %s' % ('true' if tila == 'paalla' else 'false'))
            p.wait_for_timeout(1500)
            m = measure(); res[tila].append(m)
            print(r, tila, json.dumps(m), flush=True)
    if not rounds:
        print('virheet', errs[:6]); b.close(); sys.exit(0)
    avg = lambda a, k: sum(x[k] for x in a) / len(a)
    med = lambda a: sorted(x['median'] for x in a)[len(a) // 2]
    print('KUVAVALI keskiarvo paalla %.1f ms, pois %.1f ms, suhde %.3f' % (avg(res['paalla'], 'mean'), avg(res['pois'], 'mean'), avg(res['paalla'], 'mean') / avg(res['pois'], 'mean')))
    print('KUVAVALI mediaani paalla %.1f ms, pois %.1f ms, suhde %.3f' % (med(res['paalla']), med(res['pois']), med(res['paalla']) / med(res['pois'])))
    json.dump(res, open(os.path.join(os.path.dirname(__file__), 'tulos_3i_kuvavali.json'), 'w'), indent=1)
    print('virheet', errs[:6])
    b.close()
