"""Kriteeri 5: pohjakosketus pysäyttää harjoituksen, kun alus ajetaan suoraan Siilinkarin saareen."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&ff=3')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=120000)
    # sijoitetaan alus 400 m saaren eteläpuolelle, keula kohti saarta (apuloisto 327347, 6824741)
    p.evaluate('''() => { const G = __sim, S = G.S; const w = Paikka.enToWorld(327347, 6824300); S.x = w.x; S.y = w.y; S.hdg = 0; S.conv = Paikka.convergenceDeg(...Object.values(Paikka.worldToLonLat(w.x, w.y)).slice(0,2)); 
       G.S.speedFactor = 3; Liike.orderHeading(S, Math.round((0 + S.conv + 360) % 360)); S.hmHdg = S.orderHdg; S.v = 8; Liike.orderSpeed(S, 12); }''')
    t0 = time.time(); st = None
    while time.time() - t0 < 120:
        st = p.evaluate('({fr: __sim.frozen, g: __sim.ground, t: __sim.S.t, v: __sim.S.v/0.514444, x: __sim.S.x, y: __sim.S.y, ban: !document.getElementById("groundBanner").hidden})')
        if st['fr']: break
        p.wait_for_timeout(1000)
    print('tila', st)
    p.wait_for_timeout(1500)
    p.screenshot(path=os.path.join(out, '_ground.png'))
    ok = st['fr'] and st['g'] and st['ban']
    en = p.evaluate('({e: __sim.S.x + __sim.origin.e, n: __sim.S.y + __sim.origin.n})')
    print('alus E %.0f N %.0f, nopeus %.1f kn' % (en['e'], en['n'], st['v']))
    print('C5 pohjakosketus pysäytti harjoituksen:', 'OK' if ok else 'EI', '| syy', st['g'] and st['g']['reason'], '| syvyys', st['g'] and st['g']['depth'])
    p.tap('#groundBtn'); p.wait_for_selector('#debrief:not([hidden])', timeout=20000); p.wait_for_timeout(1000)
    print('purku:', p.evaluate('document.getElementById("dbStatus").innerText'))
    p.screenshot(path=os.path.join(out, '_ground_purku.png'))
    print('virheet', errs[:5])
    b.close()
