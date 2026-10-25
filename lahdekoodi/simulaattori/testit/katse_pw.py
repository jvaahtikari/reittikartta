"""Vaihe 3d, kriteeri 7: katseen kääntö. Ajetaan Siilinkarin (E 328045, N 6824881) lähelle, painetaan katse 60 astetta vasemmalle -nappia,
otetaan kuva sekä tarkistetaan kompassikaistan lukema, tosisuunta ja sormikäsittely (vedolla, napeilla ja napautuksella keskelle).
Käyttö: python3 katse_pw.py desktop|chromium|webkit"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
SIILI = (328045, 6824881)
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1&auto=30&ff=10')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    if dev != 'desktop': p.tap('#swapBtn'); p.wait_for_timeout(1200)
    t1 = time.time(); d = 9999; rel = 0; slow = False
    REL = """(()=>{const S=__sim.S;const a=Merkit.all().filter(a=>a.nimi==='Siilinkari');if(!a.length)return [9999,0,0];
      let best=null;a.forEach(q=>{const dd=Math.hypot(q.x-S.x,q.y-S.y);if(!best||dd<best[0])best=[dd,q];});const q=best[1];
      const dx=q.x-S.x,dy=q.y-S.y;const brg=(Math.atan2(dx,dy)*180/Math.PI+360)%360;let r=brg-S.hdg;r=((r+540)%360)-180;return [best[0],r,a.length]})()"""
    while time.time() - t1 < 170:
        d, rel, na = p.evaluate(REL)
        if d < 1300 and not slow: p.keyboard.press('1'); slow = True
        if slow and d < 520 and -76 < rel < -44: break
        p.wait_for_timeout(120)
    print('suhteellinen suuntima', round(rel), '°')
    p.evaluate('document.getElementById("pauseBtn").click()')
    p.wait_for_timeout(2500)
    print('etäisyys Siilinkarista', round(d), 'm')
    hdg = p.evaluate('__sim.S.hdg'); print('keulasuunta', hdg)
    g0 = p.evaluate('__view.getGazeNow()')
    tap = (lambda s: p.tap(s)) if dev != 'desktop' else (lambda s: p.click(s))
    tap('#gazeL'); p.wait_for_timeout(9000)
    g1 = p.evaluate('__view.getGazeNow()')
    ok(abs(g1 + 60) < 3, 'katse vasemmalle nappi: %.1f° -> %.1f° (odotus -60)' % (g0, g1))
    comp = p.evaluate('document.getElementById("v3compass").textContent')
    print('kompassikaista', comp[:60].replace('\n', ' '))
    shot = '3d_katse_60vasen_siilinkari_%s.png' % dev
    p.locator('#pane3d').screenshot(path=os.path.join(out, shot)) if dev == 'desktop' else p.screenshot(path=os.path.join(out, shot))
    p.evaluate('document.getElementById("pauseBtn").click()')
    tap('#gazeR'); p.wait_for_timeout(2500); tap('#gazeR'); p.wait_for_timeout(2500)
    g2 = p.evaluate('__view.getGazeNow()'); ok(abs(g2 - 60) < 3 or abs(g2) > 55, 'katse oikealle kaksi painallusta: %.1f°' % g2)
    # napautus keskelle palauttaa eteen
    r = p.evaluate('(()=>{const r=document.getElementById("v3").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height*0.6]})()')
    if dev == 'desktop': p.mouse.dblclick(r[0], r[1])
    else: p.touchscreen.tap(r[0], r[1])
    p.wait_for_timeout(2500); g3 = p.evaluate('__view.getGazeNow()'); ok(abs(g3) < 3, 'napautus keskelle palauttaa eteen: %.1f°' % g3)
    # veto kääntää
    if dev == 'desktop':
        p.mouse.move(r[0], r[1]); p.mouse.down(); p.mouse.move(r[0] + 150, r[1], steps=8); p.mouse.up()
    else:
        cdp = c.new_cdp_session(p) if dev == 'chromium' else None
        if cdp:
            tp = lambda typ, pts: cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': q[0], 'y': q[1], 'id': k} for k, q in enumerate(pts)]})
            tp('touchStart', [(r[0], r[1])])
            for k in range(1, 9): tp('touchMove', [(r[0] + 20 * k, r[1])])
            tp('touchEnd', [])
    p.wait_for_timeout(1500); g4 = p.evaluate('__view.getGazeNow()')
    if dev != 'webkit': ok(abs(g4) > 10, 'vetäminen kääntää katsetta: %.1f°' % g4)
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
print('YHTEENSÄ', len(checks), 'tarkistusta,', len([1 for x in checks if not x[0]]), 'virhettä')
