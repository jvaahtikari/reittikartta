"""Vaihe 3f, kriteeri 2 (päivitetty vaiheessa 3h: veto panoroi, joten EBL ja VRM asetetaan napautuksella): plotterin EBL ja VRM yhdellä napautuksella. Playwright vetää plotterilla pisteeseen, jonka tosisuuntima ja etäisyys tunnetaan,
ja lukemat täsmäävät 1° ja 0,02 mpk tarkkuudella. Risti on vedetyssä pisteessä, kartta ei liiku vedon aikana ja komentolokiin tulee yksi rivi per veto.
Käyttö: python3 plotteri_ev3f_pw.py chromium|webkit|desktop  (Pixel 7, iPhone 14, hiiri 1440 x 900)"""
import sys, os, json, math, re
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
SYNT = '''([id,type,x,y])=>{const c=document.querySelector('#plot canvas');c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1}));}'''
GEO = '''() => { const r = document.querySelector('#plot canvas').getBoundingClientRect(), v = __pl.view(); return {x: r.left + v.sx, y: r.top + v.sy, l: r.left, t: r.top, w: r.width, h: r.height, hdg: __pl.heading(), mpp: v.mpp, ship: __pl.toScreen(__sim.S.x + 300, __sim.S.y + 200)}; }'''
LOG = '''() => __sim.S.cmdLog.filter(c => ['evpiste','ebl','vrm'].includes(c.kind)).map(c => c.kind + ':' + JSON.stringify(c.value))'''
PT = '''([B, D]) => { const S = __sim.S, a = (B - S.conv) * Math.PI / 180, w = D * 1852, s = __pl.toScreen(S.x + Math.sin(a) * w, S.y + Math.cos(a) * w), r = document.querySelector('#plot canvas').getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; }'''
def pt_for(g, brg, dnm):
    # riippumaton laskenta: maailmapiste, joka on tosisuuntimalla brg ja etäisyydellä dnm (mpk) omasta aluksesta, kuvapisteeksi plotterin omalla projektiolla
    return tuple(PAGE.evaluate(PT, [brg % 360, dnm]))
def pt_view(g, brg, dnm):    # sama näkymän omista parametreista (risti)
    a = math.radians(brg - g['hdg']); r = dnm * 1852 / g['mpp']
    return g['x'] + math.sin(a) * r, g['y'] - math.cos(a) * r
def angdiff(a, b): return ((a - b + 180) % 360) - 180
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs); PAGE = p
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_timeout(2500)
    g = p.evaluate(GEO)
    ok(p.evaluate('__pl.getEV().on'), '%s: EBL/VRM päällä, plotteri %dx%d, alus (%.0f, %.0f), keula %.1f° T' % (dev, g['w'], g['h'], g['x'] - g['l'], g['y'] - g['t'], g['hdg']))
    if dev != 'desktop': ok(p.evaluate('document.getElementById("paneP").getBoundingClientRect().width > 100'), '%s: plotteri näkyvissä' % dev)
    cdp = c.new_cdp_session(p) if dev == 'chromium' else None
    def tp(typ, pts): cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': q[0], 'y': q[1], 'id': k} for k, q in enumerate(pts)]})
    def drag(start, mid, end):
        """vaihe 3h: napautus kohtaan end (start ja mid ohitetaan); palauttaa kiintopisteen ruutupaikan napautuksen jälkeen"""
        if dev == 'desktop': p.mouse.click(*end)
        elif dev == 'chromium': tp('touchStart', [end]); tp('touchEnd', [])
        else: p.evaluate(SYNT, [1, 'pointerdown', end[0], end[1]]); p.evaluate(SYNT, [1, 'pointerup', end[0], end[1]])
        return p.evaluate('__pl.toScreen(__sim.S.x + 300, __sim.S.y + 200)')
    # tunnetut pisteet: tosisuuntima (tarkistetaan 1°) ja etäisyys mpk (tarkistetaan 0,02)
    tests = [(g['hdg'] + 52, 0.30), (g['hdg'] - 38, 0.22), (g['hdg'] + 10, 0.41)]
    nlog0 = len(p.evaluate(LOG)); nd = 0
    for (B, D) in tests:
        B = B % 360
        tx, ty = pt_for(g, B, D); sx_, sy_ = pt_for(g, B - 20, D * 0.4); mx, my = pt_for(g, B - 8, D * 0.8)
        inside = g['l'] + 2 < tx < g['l'] + g['w'] - 2 and g['t'] + 2 < ty < g['t'] + g['h'] - 2
        ok(inside, '%s: vedon kohde (%.0f° T, %.2f mpk) on plotterin sisällä (%.0f, %.0f)' % (dev, B, D, tx - g['l'], ty - g['t']))
        before = p.evaluate(GEO)
        mid_scr = drag((sx_, sy_), (mx, my), (tx, ty)); nd += 1
        p.wait_for_timeout(900)
        e = p.evaluate('__pl.getEV()'); after = p.evaluate(GEO)
        ok(abs(angdiff(e['ebl'], B)) <= 1.0, '%s: EBL %.2f° T, odotus %.2f° T (ero %.2f°)' % (dev, e['ebl'], B, angdiff(e['ebl'], B)))
        ok(abs(e['vrm'] - D) <= 0.02, '%s: VRM %.3f mpk, odotus %.2f mpk (ero %.3f)' % (dev, e['vrm'], D, e['vrm'] - D))
        # risti vedetyssä pisteessä: EBL-viivan ja VRM-renkaan leikkaus
        cx, cy = pt_view(after, e['ebl'], e['vrm']); err = math.hypot(cx - tx, cy - ty)
        ok(err < 2.5, '%s: risti vedetyssä pisteessä (poikkeama %.2f px)' % (dev, err))
        # kartta ei liiku vedon aikana (alus levossa): kiinteän pisteen ruutupaikka ennallaan
        mv = math.hypot(mid_scr[0] - before['ship'][0], mid_scr[1] - before['ship'][1])
        ok(mv < 0.5, '%s: kartta ei panoroidu napautuksessa (kiintopisteen siirtymä %.2f px)' % (dev, mv))
        ro = p.evaluate('[document.querySelector(".ro-ebl").textContent, document.querySelector(".ro-vrm").textContent]')
        ok(ro[0] == 'EBL %03d° T' % (round(e['ebl']) % 360) and ro[1] == 'VRM %.2f mpk' % round(e['vrm'] + 1e-9, 2) if False else (ro[0] == 'EBL %03d° T' % (round(e['ebl']) % 360) and ro[1] == ('VRM %.2f mpk' % e['vrm']).replace('.', ',')), '%s: lukemat %s' % (dev, ro))
    # napautus ilman vetoa tekee saman
    B, D = (g['hdg'] + 75) % 360, 0.18
    tx, ty = pt_for(g, B, D)
    if dev == 'desktop': p.mouse.click(tx, ty)
    elif dev == 'chromium': tp('touchStart', [(tx, ty)]); tp('touchEnd', [])
    else:
        p.evaluate(SYNT, [1, 'pointerdown', tx, ty]); p.evaluate(SYNT, [1, 'pointerup', tx, ty])
    nd += 1; p.wait_for_timeout(900)
    e = p.evaluate('__pl.getEV()')
    ok(abs(angdiff(e['ebl'], B)) <= 1.0 and abs(e['vrm'] - D) <= 0.02, '%s: napautus asettaa molemmat: EBL %.2f (odotus %.2f), VRM %.3f (odotus %.2f)' % (dev, e['ebl'], B, e['vrm'], D))
    log = p.evaluate(LOG)[nlog0:]
    ev = [x for x in log if x.startswith('evpiste')]
    ok(len(ev) == nd and len(log) == nd, '%s: komentolokiin yksi rivi per veto (%d vetoa, %d riviä, muita ebl/vrm-rivejä %d): %s' % (dev, nd, len(ev), len(log) - len(ev), log))
    # hienosäätö: näppäimet ja rulla toimivat edelleen ja kirjautuvat omina riveinään
    if dev == 'desktop':
        e0 = p.evaluate('__pl.getEV()'); p.keyboard.press('.'); p.keyboard.press('.'); p.wait_for_timeout(900)
        e1 = p.evaluate('__pl.getEV()'); ok(abs(angdiff(e1['ebl'], e0['ebl']) - 2) < 0.01 and abs(e1['vrm'] - e0['vrm']) < 1e-9, 'desktop: näppäin piste siirtää EBL:ää 2° (%.1f -> %.1f), VRM ennallaan' % (e0['ebl'], e1['ebl']))
        p.keyboard.press(']'); p.wait_for_timeout(900)
        e2 = p.evaluate('__pl.getEV()'); ok(abs(e2['vrm'] / e1['vrm'] - 1.05) < 0.002 and abs(e2['ebl'] - e1['ebl']) < 1e-9, 'desktop: ]-näppäin säätää VRM:ää (%.3f -> %.3f), EBL ennallaan' % (e1['vrm'], e2['vrm']))
        log2 = p.evaluate(LOG)[nlog0 + len(log):]
        ok(any(x.startswith('ebl') for x in log2) and any(x.startswith('vrm') for x in log2), 'desktop: hienosäätö kirjautuu omina riveinään %s' % log2)
    # kuva: viimeinen veto, EBL ja VRM sekä risti
    B, D = (g['hdg'] + 45) % 360, 0.33
    tx, ty = pt_for(g, B, D)
    if dev == 'desktop': p.mouse.click(tx, ty)
    elif dev == 'chromium': tp('touchStart', [(tx, ty)]); tp('touchEnd', [])
    else: p.evaluate(SYNT, [1, 'pointerdown', tx, ty]); p.evaluate(SYNT, [1, 'pointerup', tx, ty])
    p.wait_for_timeout(900)
    p.screenshot(path=os.path.join(out, '_3h_ebl_vrm_napautus_%s.png' % dev))
    ok(not errs, '%s: ei konsolivirheitä (%s)' % (dev, errs[:3]))
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
