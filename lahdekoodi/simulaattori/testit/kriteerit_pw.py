"""Hyväksymiskriteerit 2 ja 3 (paikat, maaston korkeus, maamerkkien korkeudet ja suunnat) selaimessa ja paketin vertailuarvoja vasten."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
import ref
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
which = sys.argv[1] if len(sys.argv) > 1 else 'all'
res = {}

def open_view(p, e, n, extra='', vp=None):
    p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=0%s' % (e, n, extra))
    p.wait_for_function('window.__ready===true', timeout=150000)
    p.wait_for_timeout(800)

with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    if which in ('all', 'c2a'):
        # kolme turvalaitetta: sijainti verkossa vs paketin koordinaatit (pyproj)
        for num in (29183, 26636, 26647):
            E, N, props = ref.aid_en(num)
            e0, n0 = int(E) + 150, int(N) + 150
            open_view(p, e0, n0)
            r = p.evaluate('''([num, ex, ey]) => {
              const pos = __view.aids.mesh.geometry.attributes.position.array, xs=[], zs=[];
              for (let i = 0; i < pos.length; i += 3) { if (Math.abs(pos[i]-ex) < 2.5 && Math.abs(pos[i+2]+ey) < 2.5 && pos[i+1] < 0.3) { xs.push(pos[i]); zs.push(pos[i+2]); } }
              const mx = xs.reduce((a,b)=>a+b,0)/xs.length, mz = zs.reduce((a,b)=>a+b,0)/zs.length;
              const a = Merkit.byNumber(num);
              return {n: xs.length, x: mx, y: -mz, ax: a.x, ay: a.y, name: a.nimi};
            }''', [str(num), E - e0, N - n0])
            err = math.hypot(r['x'] - (E - e0), r['y'] - (N - n0))
            print('C2 turvalaite', num, r['name'], 'verkon pisteitä', r['n'], 'virhe', round(err, 3), 'm', 'OK' if err < 2 else 'EI')
            res['c2_aid_%d' % num] = err
        p.screenshot(path=os.path.join(out, '_c2_viitta.png'))
    if which in ('all', 'c2b'):
        # maaston korkeus Pispalanharjun kohdalla
        e0, n0 = 325200, 6823700
        open_view(p, e0, n0, '&budget=14')
        pts = [(325200, 6823150), (325150, 6823100), (325300, 6823200), (325050, 6823050), (325400, 6823300)]
        worst = 0
        for (E, N) in pts:
            ref_h = ref.dem(E, N)
            h = p.evaluate('([x,y]) => __view.terrain.heightAt(x, y, true)', [E - e0, N - n0])
            if h is None: print('  ei ladattu', E, N); continue
            d = abs((h + 95.5) - ref_h); worst = max(worst, d)
            print('C2 maasto', E, N, 'verkko', round(h + 95.5, 2), 'paketti', round(ref_h, 2), 'ero', round(d, 2), 'm')
        print('C2 maasto suurin ero', round(worst, 2), 'm', 'OK' if worst < 2 else 'EI')
        res['c2_terrain'] = worst
    if which in ('all', 'c3'):
        e0, n0 = 327740, 6823980
        lm = json.load(open('/home/claude/opetus/navi/putki/ulos/maamerkit.json'))
        open_view(p, e0, n0, '&budget=14')
        info = p.evaluate('''() => { const t = __view.landmarks.tops(); const out = {}; const pos = __view.landmarks.mesh.geometry.attributes.position.array;
          for (const k in t) { let mx = -1e9, sx=0, sz=0, cnt=0; for (let i = 0; i < pos.length; i += 3) { if (Math.hypot(pos[i]-(t[k].e-%d), pos[i+2]+(t[k].n-%d)) < 6) { if (pos[i+1] > mx) mx = pos[i+1]; sx += pos[i]; sz += pos[i+2]; cnt++; } }
            out[k] = {maxY: mx, x: sx/cnt, y: -sz/cnt, cnt}; } return out; }''' % (e0, n0))
        for k, v in info.items():
            brg = math.degrees(math.atan2(v['x'], v['y'])) % 360
            print('C3', k, 'huippu verkossa', round(v['maxY'], 1), 'm järven pinnasta, suunta ruutusuunta', round(brg, 1))
        print('C3 Näsinneula huippu', round(info['nasinneula']['maxY'], 1), 'tavoite 168 +-3')
        pi = [round(math.degrees(math.atan2(v['x'], v['y'])) % 360, 1) for k, v in info.items() if k.startswith('piippu')]
        print('C3 piiput', [round(info[k]['maxY'], 1) for k in info if k.startswith('piippu')], 'm, suunnat', pi, 'tavoite 99-104')
        res['c3'] = info
        # panoraama: vapaa kamera, ruutusuunta 172, leveä kuva
        c2 = b.new_context(viewport={'width': 1700, 'height': 640}, device_scale_factor=1)
        p2 = c2.new_page(); collect(p2, errs)
        open_view(p2, e0, n0, '&budget=14&pb=1.0')
        hdg = math.radians(172)
        p2.evaluate('__view.rig.visible = false')
        p2.evaluate('''([h]) => { window.__free = [0, 2.5, 0, Math.sin(h)*1000, 120, -Math.cos(h)*1000, 100]; }''', [hdg])
        p2.wait_for_timeout(2500)
        p2.screenshot(path=os.path.join(out, 'naistenlahti_panoraama.png'))
        c2.close()
    print('virheet', errs[:10])
    b.close()
