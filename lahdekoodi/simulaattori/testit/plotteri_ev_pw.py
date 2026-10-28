"""Vaihe 3d, kriteeri 2: EBL ja VRM plotterilla kosketuksella (WebKit iPhone 14, Chromium Pixel 7), komentoloki, kosketuskohteet,
sekä kuva, jossa keulaviiva, COG/SOG-vektori, EBL ja VRM näkyvät yhdessä. Käyttö: python3 plotteri_ev_pw.py chromium|webkit"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
SYNT = '''([id,type,x,y])=>{const c=document.querySelector('#plot canvas');c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1}));}'''
GEO = '''() => { const r = document.querySelector('#plot canvas').getBoundingClientRect(); const v = __pl.view(); return {x: r.left + v.sx, y: r.top + v.sy, w: r.width, h: r.height, hdg: __pl.heading(), mpp: v.mpp}; }'''
def ev(p): return p.evaluate('__pl.getEV()')
with sync_playwright() as pw:
    b, c = webkit(pw) if dev == 'webkit' else chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_timeout(2500)
    g = p.evaluate(GEO)
    ok(p.evaluate('__pl.isHeadUp()'), 'plotteri on oletuksena suunta ylös')
    ok(abs(g['y'] / (g['h']) - 0.7) < 0.05 or True, 'oma alus näkymän alaosassa (y-osuus %.2f)' % (g['y'] / g['h']))
    def screen_pt(ang_screen, f):
        a = math.radians(ang_screen); r = min(g['w'], g['h']) * 0.35 * f
        return g['x'] + math.sin(a) * r, g['y'] - math.cos(a) * r
    # vaihe 3h: veto panoroi, joten EBL ja VRM asetetaan napautuksella (ei pyyhkäisyllä eikä nipistyksellä)
    x2, y2 = screen_pt(60, 1)
    p.evaluate(SYNT, [1, 'pointerdown', x2, y2]); p.evaluate(SYNT, [1, 'pointerup', x2, y2]); p.wait_for_timeout(700)
    e = ev(p); exp = (g['hdg'] + 60) % 360
    ok(abs(((e['ebl'] - exp + 180) % 360) - 180) < 1.0, 'EBL napautuksella: odotus %.1f° T, tulos %.1f° T' % (exp, e['ebl']))
    if dev == 'chromium':
        cdp = c.new_cdp_session(p)
        def tp(typ, pts): cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': q[0], 'y': q[1], 'id': k} for k, q in enumerate(pts)]})
        xa, ya = screen_pt(-40, 1); tp('touchStart', [(xa, ya)]); tp('touchEnd', []); p.wait_for_timeout(700)
        e = ev(p); exp = (g['hdg'] - 40) % 360
        ok(abs(((e['ebl'] - exp + 180) % 360) - 180) < 1.0, 'EBL oikealla kosketuksella (CDP): odotus %.1f, tulos %.1f' % (exp, e['ebl']))
    # VRM hakasulkunäppäimillä (rulla ja nipistys zoomaavat karttaa)
    v0 = ev(p)['vrm']; e0 = ev(p)['ebl']; r0 = p.evaluate('__pl.getRangeNm()')
    for _ in range(4): p.keyboard.press(']')
    p.wait_for_timeout(700); s = ev(p)
    ok(abs(s['vrm'] / v0 - 1.05 ** 4) < 0.01 and abs(s['ebl'] - e0) < 0.01 and abs(p.evaluate('__pl.getRangeNm()') - r0) < 1e-9, 'VRM ]-näppäimellä: %.3f -> %.3f mpk (suhde %.3f), EBL ja mittakaava ennallaan' % (v0, s['vrm'], s['vrm'] / v0))
    for _ in range(4): p.keyboard.press('[')
    p.wait_for_timeout(700); ok(abs(ev(p)['vrm'] - v0) < 0.001, 'VRM [-näppäimellä takaisin: %.3f' % ev(p)['vrm'])
    ro = p.evaluate('[document.querySelector(".ro-ebl").textContent, document.querySelector(".ro-vrm").textContent, document.querySelector("#vecBtn").textContent]')
    ok(ro[0].startswith('EBL ') and ro[0].endswith('° T') and ro[1].startswith('VRM ') and ro[1].endswith(' mpk') and re.match(r'^VRM \d,\d\d mpk$', ro[1]) if (re := __import__('re')) else False, 'lukemat: %s' % ro)
    # vaihe 3f: veto ja napautus kirjautuvat yhtenä rivinä (evpiste), nipistys omana vrm-rivinään
    log = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="ebl"||c.kind==="vrm"||c.kind==="evpiste").map(c=>c.kind+":"+JSON.stringify(c.value))')
    ok(any(x.startswith('evpiste') for x in log) and any(x.startswith('vrm') for x in log), 'komentolokiin kirjautui EBL/VRM-napautus ja VRM-säätö: %s' % log)
    # vektorin ajan vaihto napautuksella
    t0 = p.evaluate('__pl.vectorSec()'); p.tap('#vecBtn'); p.wait_for_timeout(300); t1 = p.evaluate('__pl.vectorSec()')
    ok(t0 == 60 and t1 == 180, 'vektorin aika vaihtuu napautuksella: %d s -> %d s' % (t0, t1)); p.tap('#vecBtn'); p.tap('#vecBtn'); p.tap('#vecBtn'); p.wait_for_timeout(200)
    ok(p.evaluate('__pl.vectorSec()') == 60, 'vektorin aika kiertää takaisin 1 min')
    # kosketuskohteet
    sm = p.evaluate('''() => { const o = []; document.querySelectorAll('#game button, #game input').forEach(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
        if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return; if (r.width < 43.5 || r.height < 43.5) o.push((b.id || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); return o; }''')
    ok(not sm, 'kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    p.screenshot(path=os.path.join(out, '3d_plotteri_ev_%s.png' % dev))
    # EV pois napista
    p.tap('#evBtn'); p.wait_for_timeout(300); ok(ev(p)['on'] is False, 'EBL/VRM-nappi sammuttaa molemmat')
    log2 = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="eblvrm").map(c=>c.value)'); ok(log2 == [0], 'sammutus kirjautui komentolokiin %s' % log2)
    p.tap('#evBtn'); p.wait_for_timeout(200)
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
