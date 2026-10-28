"""Vaihe 3i, kriteeri 3: siltojen vaikutus 3D-kuvan piirtoaikaan samassa sivussa ja prosessissa.
Sovellus avataan 1440 x 900 -koossa, alus viedään paikkaan (E N), ja kuvaa piirretään kutsulla __view.render + gl.readPixels (pakottaa GPU:n valmistumaan) vuorotellen sillat päällä ja pois
(bridges.mesh.visible), jokaista tilaa N kertaa. Vuorottelu poistaa koneen kuormituksen ajautumisen vaikutuksen. Tulostaa mediaanin ja keskiarvon ja suhteen päällä / pois.
Käyttö: python3 suor3i_pw.py [E N hdg katse] [--n=60] [--pb=0.55]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
kw = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
E, N, HDG, LOOK = (float(pos[0]), float(pos[1]), float(pos[2]), float(pos[3])) if len(pos) >= 4 else (327930.0, 6823900.0, 112.0, 67.0)
n = int(kw.get('n', 60))
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=plot&t=2026-10-26T10:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(%s)' % kw.get('pb', '0.55'))
    p.evaluate('document.getElementById("pauseBtn").click()')
    p.evaluate('''([e, nn, hdg, look]) => { const S = __sim.S, o = __sim.origin; S.x = e - o.e; S.y = nn - o.n; S.hdg = hdg - S.conv; S.orderHdg = hdg; S.v = 0; window.__look = look - hdg; window.__X = S.x; window.__Y = S.y; }''', [E, N, HDG, LOOK])
    p.evaluate('Merkit.load(__X, __Y, 7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=120000)
    p.evaluate('__view.setGaze(__look)')
    for _ in range(120):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && __view.bridges.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)'); p.wait_for_timeout(3000)
    # pysäytetään sovelluksen oma piirtosilmukka, jotta vain mittaus piirtää
    p.evaluate('window.requestAnimationFrame = function () { return 0; }')
    p.wait_for_timeout(2500)
    r = p.evaluate('''(n) => { const gl = __view.renderer.getContext(), px = new Uint8Array(4), S = __sim.S, out = { paalla: [], pois: [] };
        const one = (on) => { __view.bridges.mesh.visible = on; const t0 = performance.now(); __view.render(S, 0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
        for (let i = 0; i < 4; i++) { one(true); one(false); }
        for (let i = 0; i < n; i++) { if (i % 2) { out.paalla.push(one(true)); out.pois.push(one(false)); } else { out.pois.push(one(false)); out.paalla.push(one(true)); } }
        __view.bridges.mesh.visible = true; out.tris = __view.rendererStats().triangles; out.calls = __view.rendererStats().calls; return out; }''', n)
    med = lambda a: sorted(a)[len(a) // 2]; avg = lambda a: sum(a) / len(a)
    q = lambda a, f: sorted(a)[int(len(a) * f)]
    print('piirto paalla: mediaani %.1f ms, keskiarvo %.1f ms, p25 %.1f ms' % (med(r['paalla']), avg(r['paalla']), q(r['paalla'], 0.25)))
    print('piirto pois:   mediaani %.1f ms, keskiarvo %.1f ms, p25 %.1f ms' % (med(r['pois']), avg(r['pois']), q(r['pois'], 0.25)))
    print('SUHDE paalla/pois: mediaani %.3f, keskiarvo %.3f, p25 %.3f' % (med(r['paalla']) / med(r['pois']), avg(r['paalla']) / avg(r['pois']), q(r['paalla'], 0.25) / q(r['pois'], 0.25)))
    print('kolmioita (sillat paalla)', r['tris'], 'piirtokutsuja', r['calls'])
    json.dump(r, open(os.path.join(os.path.dirname(__file__), 'tulos_3i_piirto.json'), 'w'))
    print('virheet', errs[:6])
    b.close()
