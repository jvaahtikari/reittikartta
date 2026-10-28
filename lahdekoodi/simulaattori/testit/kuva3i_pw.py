"""Vaihe 3i: siltakuvat vapaalla kameralla nakyma_testi.html-sivulla (sama Nakyma-moottori kuin sovelluksessa, sillat liitetty Sillat3D.attach-kutsulla).
Käyttö: python3 kuva3i_pw.py nimi:tE:tN:tZ:suunta:etaisyys:kameraKorkeus:fov[:aika] ... [--leveys=1440] [--korkeus=900] [--pb=1.0]
Kohde (tE, tN) on TM35FIN-koordinaatit, tZ kohteen korkeus järven pinnasta, suunta on katsesuunta (ruutusuunta, aste), etäisyys kamerasta kohteeseen (m).
Alus viedään kameran paikkaan (maasto ja sillat latautuvat sen ympärille) ja runko piilotetaan. Kaikki kuvat otetaan samassa selainistunnossa.
Tulostaa kuvan tilastot: piirtokutsut, kolmiot, siltojen kolmiot ja kuvaväli."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
args = [a for a in sys.argv[1:] if not a.startswith('--')]
kw = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
W, H = int(kw.get('leveys', 1440)), int(kw.get('korkeus', 900))
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
shots = []
for a in args:
    f = a.split(':'); shots.append(dict(name=f[0], tE=float(f[1]), tN=float(f[2]), tZ=float(f[3]), brg=float(f[4]), dist=float(f[5]), camH=float(f[6]), fov=float(f[7]), t=f[8] if len(f) > 8 else '2026-10-26T10:00:00Z'))
s0 = shots[0]
qs = 'aineisto=%s&e=%d&n=%d&h=%g&budget=14&pb=%s&t=%s' % (PAKETTI, s0['tE'], s0['tN'], s0['brg'], kw.get('pb', '1.0'), s0['t'])
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = br.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?' + qs)
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=120000)
    ox0, oy0 = s0['tE'] - int(s0['tE']), s0['tN'] - int(s0['tN'])
    for sh in shots:
        b_ = math.radians(sh['brg']); cx, cy = -sh['dist'] * math.sin(b_), -sh['dist'] * math.cos(b_)
        # kohteen paikka suhteessa sivun origoon (origo = ensimmäisen kuvan kohde, kokonaisluku E ja N)
        dE, dN = sh['tE'] - int(s0['tE']), sh['tN'] - int(s0['tN'])
        p.evaluate('''([x, y, camH, tz, tx, ty, fov, t]) => { __view.setSimTime(Date.parse(t)); __state.x = x; __state.y = y; __state.hdg = 0; __view.rig.visible = false;
            window.__free = [x, camH, -y, tx, tz, -ty, fov]; window.__ready = false; }''', [dE + cx, dN + cy, sh['camH'], sh['tZ'], dE, dN, sh['fov'], sh['t']])
        p.wait_for_timeout(800)
        for _ in range(80):
            p.wait_for_timeout(1000)
            if p.evaluate('__view.terrain.idle() && __view.bridges.idle() && (!__view.piers || __view.piers.idle())'): break
        p.evaluate('__view.aids.sync(__state.x, __state.y, true)')
        p.wait_for_timeout(2500)
        p.evaluate('__view.resetFrameStats()'); p.wait_for_timeout(2500)
        p.screenshot(path=os.path.join(out, sh['name'] + '.png'), timeout=150000)
        st = p.evaluate('JSON.stringify({r:__view.rendererStats(),f:__view.frameStats(),b:__view.bridges.info().stats && {n:__view.bridges.info().stats.bridges,tris:__view.bridges.info().stats.total,piers:__view.bridges.info().stats.piers,unknown:__view.bridges.info().stats.unknown}})')
        print(sh['name'], st, flush=True)
    names = p.evaluate('JSON.stringify(__view.bridges.list().map(b=>[b.name,b.k,Math.round(b.length),Math.round(b.waterM),b.tris,b.deckBottomA&&+b.deckBottomA.toFixed(1),b.deckBottomB&&+b.deckBottomB.toFixed(1),b.groundA,b.groundB]))')
    print('siltalista(viimeinen paikka)', names)
    if kw.get('eval'): print('EVAL', json.dumps(p.evaluate('() => (' + kw['eval'] + ')'), ensure_ascii=False)[:4000])
    print('virheet', errs[:6])
    br.close()
