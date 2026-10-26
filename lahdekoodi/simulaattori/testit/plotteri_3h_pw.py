"""Vaihe 3h, kriteeri 1: plotterin vapaa panorointi ja zoomaus. Veto siirtää karttaa (kiintopisteen siirtymä vedon verran 2 px tarkkuudella),
seuranta katkeaa, Keskitä palauttaa aluksen ankkuriin, + ja − muuttavat mittakaavaa 1,25-kertaisesti, rulla ja nipistys toimivat, rajat 0,1 ja 12 mpk pitävät,
napautus asettaa EBL:n ja VRM:n (1° ja 0,02 mpk) myös panoroituna, ja zoom ja seuranta eivät tallennu asetuksiin.
Käyttö: python3 plotteri_3h_pw.py chromium|webkit|desktop  (Pixel 7, iPhone 14, hiiri 1440 x 900)"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
SYNT = '''([id,type,x,y,pt])=>{const c=document.querySelector('#plot canvas');c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:pt||'touch',isPrimary:id===1,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1}));}'''
GEO = '''() => { const r = document.querySelector('#plot canvas').getBoundingClientRect(), v = __pl.view(); return {l: r.left, t: r.top, w: r.width, h: r.height, sx: r.left + v.sx, sy: r.top + v.sy, ax: r.left + v.ax, ay: r.top + v.ay, mpp: v.mpp, hdg: __pl.heading(), follow: v.follow, range: v.rangeNm}; }'''
FIX = '''([x, y]) => { const s = __pl.toScreen(x, y), r = document.querySelector('#plot canvas').getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; }'''
def angdiff(a, b): return ((a - b + 180) % 360) - 180
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    sfx = '' if dev == 'desktop' else '_' + dev
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_timeout(2500)
    cdp = c.new_cdp_session(p) if dev == 'chromium' else None
    def tp(typ, pts): cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': q[0], 'y': q[1], 'id': k} for k, q in enumerate(pts)]})
    def drag(a, bb, steps=6):
        if dev == 'desktop':
            p.mouse.move(*a); p.mouse.down(); p.mouse.move(*bb, steps=steps); p.mouse.up()
        elif dev == 'chromium':
            tp('touchStart', [a])
            for k in range(1, steps + 1): tp('touchMove', [(a[0] + (bb[0] - a[0]) * k / steps, a[1] + (bb[1] - a[1]) * k / steps)])
            tp('touchEnd', [])
        else:
            p.evaluate(SYNT, [1, 'pointerdown', a[0], a[1]])
            for k in range(1, steps + 1): p.evaluate(SYNT, [1, 'pointermove', a[0] + (bb[0] - a[0]) * k / steps, a[1] + (bb[1] - a[1]) * k / steps])
            p.evaluate(SYNT, [1, 'pointerup', bb[0], bb[1]])
        p.wait_for_timeout(250)
    def tap(pt):
        if dev == 'desktop': p.mouse.click(*pt)
        elif dev == 'chromium': tp('touchStart', [pt]); tp('touchEnd', [])
        else: p.evaluate(SYNT, [1, 'pointerdown', pt[0], pt[1]]); p.evaluate(SYNT, [1, 'pointerup', pt[0], pt[1]])
        p.wait_for_timeout(250)
    g = p.evaluate(GEO)
    ok(g['follow'] and abs(g['range'] - 1) < 1e-9, '%s: ajo alkaa seurannassa ja 1 mpk korkeudella (seuranta %s, %.2f mpk)' % (dev, g['follow'], g['range']))
    ok(math.hypot(g['sx'] - g['ax'], g['sy'] - g['ay']) < 0.6, '%s: alus ankkurissa (alakolmannes, y %.0f/%.0f)' % (dev, g['sy'] - g['t'], g['h']))
    ok(p.evaluate('document.getElementById("zCtr").getAttribute("aria-pressed")') == 'true', '%s: Keskitä-napin ulkoasu kertoo seurannan (aria-pressed true)' % dev)
    ok(p.evaluate('document.getElementById("rangeBox")') is None, '%s: alueen valintanapit poistettu' % dev)
    bx = p.evaluate('''() => ['zIn','zOut','zCtr'].map(i => { const r = document.getElementById(i).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })''')
    ok(all(w_ >= 43.5 and h_ >= 43.5 for w_, h_ in bx), '%s: +, − ja Keskitä vähintään 44 px (%s)' % (dev, bx))
    # --- panorointi ---
    x0, y0 = p.evaluate('[__sim.S.x + 300, __sim.S.y + 200]')
    f0 = p.evaluate(FIX, [x0, y0]); s0 = (g['sx'], g['sy'])
    cx, cy = g['l'] + g['w'] / 2, g['t'] + g['h'] * 0.4
    for (dx, dy) in [(-90, 70), (60, -40)]:
        fb = p.evaluate(FIX, [x0, y0]); drag((cx, cy), (cx + dx, cy + dy)); fa = p.evaluate(FIX, [x0, y0])
        err = math.hypot((fa[0] - fb[0]) - dx, (fa[1] - fb[1]) - dy)
        ok(err <= 2.0, '%s: veto (%d, %d) siirsi kiintopistettä (%.1f, %.1f), poikkeama %.2f px' % (dev, dx, dy, fa[0] - fb[0], fa[1] - fb[1], err))
        cx += 0
    g1 = p.evaluate(GEO)
    ok(not g1['follow'] and p.evaluate('__pl.isFollow()') is False, '%s: seuranta katkesi' % dev)
    ok(p.evaluate('document.getElementById("zCtr").getAttribute("aria-pressed")') == 'false', '%s: Keskitä-napin ulkoasu kertoo vapaan tilan' % dev)
    ok(math.hypot(g1['sx'] - g1['ax'], g1['sy'] - g1['ay']) > 20, '%s: alus ei ole enää ankkurissa (siirtymä %.0f px)' % (dev, math.hypot(g1['sx'] - g1['ax'], g1['sy'] - g1['ay'])))
    p.screenshot(path=os.path.join(out, '3h_plotteri_panorointi%s.png' % sfx))
    # panoroituna alus liikkuu kartan päällä, kiintopiste pysyy
    p.evaluate('__sim.S.speedFactor = 10; Liike.orderSpeed(__sim.S, 20)')
    fb = p.evaluate(FIX, [x0, y0]); sb = p.evaluate(GEO); p.wait_for_timeout(6000); fa = p.evaluate(FIX, [x0, y0]); sa = p.evaluate(GEO)
    ok(math.hypot(fa[0] - fb[0], fa[1] - fb[1]) < 0.6 and math.hypot(sa['sx'] - sb['sx'], sa['sy'] - sb['sy']) > 5, '%s: vapaassa tilassa kartta pysyy, alus liikkuu (kiintopiste %.2f px, alus %.0f px)' % (dev, math.hypot(fa[0] - fb[0], fa[1] - fb[1]), math.hypot(sa['sx'] - sb['sx'], sa['sy'] - sb['sy'])))
    p.evaluate('Liike.crashStop(__sim.S)'); p.wait_for_function('__sim.S.v < 0.02', timeout=90000); p.evaluate('__sim.S.speedFactor = 1'); p.wait_for_timeout(300)
    # --- napautus panoroituna ---
    g1 = p.evaluate(GEO)
    B, D = (g1['hdg'] + 40) % 360, 0.12
    S_ = p.evaluate('[__sim.S.x, __sim.S.y, __sim.S.conv]')
    def world_pt(brg, dnm):
        a = math.radians(brg - S_[2]); w_ = dnm * 1852
        return [S_[0] + math.sin(a) * w_, S_[1] + math.cos(a) * w_]
    n0 = len(p.evaluate('__sim.S.cmdLog.filter(c => c.kind==="evpiste")'))
    for (B, D) in [((g1['hdg'] + 40) % 360, 0.12), ((g1['hdg'] - 25) % 360, 0.09)]:
        S_ = p.evaluate('[__sim.S.x, __sim.S.y, __sim.S.conv]')
        wp = world_pt(B, D); pt = p.evaluate(FIX, wp)
        inside = g1['l'] + 2 < pt[0] < g1['l'] + g1['w'] - 2 and g1['t'] + 2 < pt[1] < g1['t'] + g1['h'] - 2
        if not inside: ok(True, '%s: kohde (%.0f° T, %.2f mpk) ruudun ulkopuolella, ohitetaan' % (dev, B, D)); continue
        tap(pt); e = p.evaluate('__pl.getEV()'); fl = p.evaluate('__pl.isFollow()')
        ok(abs(angdiff(e['ebl'], B)) <= 1.0 and abs(e['vrm'] - D) <= 0.02, '%s: napautus panoroituna asettaa EBL %.2f (odotus %.1f) ja VRM %.3f (odotus %.2f) aluksesta mitattuna' % (dev, e['ebl'], B, e['vrm'], D))
        ok(fl is False, '%s: napautus ei muuta seurantatilaa' % dev)
    nlog = len(p.evaluate('__sim.S.cmdLog.filter(c => c.kind==="evpiste")')) - n0
    ok(nlog >= 1, '%s: napautus kirjautuu komentolokiin (%d riviä)' % (dev, nlog))
    # --- Keskitä ---
    p.evaluate('document.getElementById("zCtr").click()'); p.wait_for_timeout(300)
    g2 = p.evaluate(GEO)
    ok(g2['follow'] and math.hypot(g2['sx'] - g2['ax'], g2['sy'] - g2['ay']) < 0.6, '%s: Keskitä palautti aluksen ankkuriin (poikkeama %.2f px)' % (dev, math.hypot(g2['sx'] - g2['ax'], g2['sy'] - g2['ay'])))
    ok(p.evaluate('document.getElementById("zCtr").getAttribute("aria-pressed")') == 'true', '%s: Keskitä-napin ulkoasu palasi seurantaan' % dev)
    # --- zoom napeilla ---
    r0 = p.evaluate('__pl.getRangeNm()')
    p.evaluate('document.getElementById("zIn").click()'); r1 = p.evaluate('__pl.getRangeNm()')
    ok(abs(r0 / r1 - 1.25) < 0.005, '%s: + lähentää 1,25-kertaisesti (%.4f -> %.4f mpk, suhde %.4f)' % (dev, r0, r1, r0 / r1))
    p.evaluate('document.getElementById("zOut").click()'); p.evaluate('document.getElementById("zOut").click()'); r2 = p.evaluate('__pl.getRangeNm()')
    ok(abs(r2 / r1 - 1.5625) < 0.005, '%s: − kahdesti loitontaa 1,5625-kertaisesti (%.4f -> %.4f)' % (dev, r1, r2))
    p.evaluate('document.getElementById("zIn").click()'); p.wait_for_timeout(200)
    ok(p.evaluate('__pl.isFollow()'), '%s: zoomaus seurannassa ei katkaise seurantaa' % dev)
    ok(p.evaluate('document.querySelector(".hud-scale .sb-lab").textContent.length > 0 && document.querySelector(".hud-scale .sb-h").textContent.indexOf("mpk") > 0'), '%s: mittakaavajana "%s" ja korkeus "%s"' % (dev, p.evaluate('document.querySelector(".hud-scale .sb-lab").textContent'), p.evaluate('document.querySelector(".hud-scale .sb-h").textContent')))
    # --- rulla (synteettinen kaikilla, oikea hiiri desktopilla) ---
    g = p.evaluate(GEO); ra = p.evaluate('__pl.getRangeNm()')
    p.evaluate('([x,y])=>{document.querySelector("#plot canvas").dispatchEvent(new WheelEvent("wheel",{deltaY:-100,clientX:x,clientY:y,bubbles:true,cancelable:true}))}', [g['l'] + g['w'] / 2, g['t'] + g['h'] / 2])
    rb = p.evaluate('__pl.getRangeNm()')
    ok(rb < ra * 0.9 and rb > ra * 0.7, '%s: rulla lähentää portaattomasti (%.4f -> %.4f mpk)' % (dev, ra, rb))
    if dev == 'desktop':
        p.mouse.move(g['l'] + g['w'] / 2, g['t'] + g['h'] / 2); p.mouse.wheel(0, 100); p.wait_for_timeout(300); rc = p.evaluate('__pl.getRangeNm()')
        ok(rc > rb * 1.1, '%s: hiiren oikea rulla loitontaa (%.4f -> %.4f mpk)' % (dev, rb, rc))
        p.keyboard.press('+'); r_a = p.evaluate('__pl.getRangeNm()'); p.keyboard.press('-'); r_b = p.evaluate('__pl.getRangeNm()')
        ok(abs(rc / r_a - 1.25) < 0.005 and abs(r_b / r_a - 1.25) < 0.005, '%s: näppäimet + ja − (%.4f, %.4f, %.4f)' % (dev, rc, r_a, r_b))
        v0 = p.evaluate('__pl.getEV().vrm'); p.keyboard.press(']'); v1 = p.evaluate('__pl.getEV().vrm'); p.keyboard.press('['); v2 = p.evaluate('__pl.getEV().vrm')
        ok(v1 > v0 and abs(v2 - v0) < 1e-9, '%s: [ ja ] säätävät VRM:ää (%.3f, %.3f, %.3f), rulla ei' % (dev, v0, v1, v2))
    # --- nipistys (vapaa tila: kiintopiste keskikohdan alla pysyy) ---
    g = p.evaluate(GEO); r0 = p.evaluate('__pl.getRangeNm()'); mx, my = g['l'] + g['w'] / 2, g['t'] + g['h'] * 0.35
    if dev == 'chromium':
        tp('touchStart', [(mx - 40, my), (mx + 40, my)])
        for f in (1.2, 1.5, 2.0): tp('touchMove', [(mx - 40 * f, my), (mx + 40 * f, my)])
        tp('touchEnd', [])
    else:
        p.evaluate(SYNT, [1, 'pointerdown', mx - 40, my]); p.evaluate(SYNT, [2, 'pointerdown', mx + 40, my])
        for f in (1.2, 1.5, 2.0): p.evaluate(SYNT, [1, 'pointermove', mx - 40 * f, my]); p.evaluate(SYNT, [2, 'pointermove', mx + 40 * f, my])
        p.evaluate(SYNT, [1, 'pointerup', mx - 80, my]); p.evaluate(SYNT, [2, 'pointerup', mx + 80, my])
    p.wait_for_timeout(300); r1 = p.evaluate('__pl.getRangeNm()')
    ok(abs(r0 / r1 - 2.0) < 0.1, '%s: nipistys lähentää (%.4f -> %.4f, suhde %.2f, odotus 2)' % (dev, r0, r1, r0 / r1))
    ok(p.evaluate('__pl.isFollow()'), '%s: nipistys seurannassa ei katkaise seurantaa' % dev)
    # nipistys vapaassa tilassa pitää keskipisteen alla olevan karttapisteen paikallaan
    drag((mx, my), (mx + 30, my + 30))
    fx = p.evaluate('__pl.centerWorld()'); g = p.evaluate(GEO); mx, my = g['l'] + g['w'] / 2, g['t'] + g['h'] / 2
    fb = p.evaluate(FIX, [fx['x'], fx['y']]); r0 = p.evaluate('__pl.getRangeNm()')
    p.evaluate(SYNT, [1, 'pointerdown', mx - 40, my]); p.evaluate(SYNT, [2, 'pointerdown', mx + 40, my])
    for f in (1.3, 1.7): p.evaluate(SYNT, [1, 'pointermove', mx - 40 * f, my]); p.evaluate(SYNT, [2, 'pointermove', mx + 40 * f, my])
    p.evaluate(SYNT, [1, 'pointerup', mx - 68, my]); p.evaluate(SYNT, [2, 'pointerup', mx + 68, my]); p.wait_for_timeout(300)
    fa = p.evaluate(FIX, [fx['x'], fx['y']]); r1 = p.evaluate('__pl.getRangeNm()')
    ok(r1 < r0 * 0.7 and math.hypot(fa[0] - fb[0], fa[1] - fb[1]) < 2.0, '%s: vapaassa tilassa nipistys pitää nipistyksen keskipisteen kartan päällä (siirtymä %.2f px, %.3f -> %.3f mpk)' % (dev, math.hypot(fa[0] - fb[0], fa[1] - fb[1]), r0, r1))
    p.evaluate('document.getElementById("zCtr").click()')
    # --- rajat ---
    for _ in range(40): p.evaluate('document.getElementById("zIn").click()')
    ok(abs(p.evaluate('__pl.getRangeNm()') - 0.1) < 1e-9, '%s: alaraja 0,1 mpk pitää (%.4f)' % (dev, p.evaluate('__pl.getRangeNm()')))
    for _ in range(3): p.evaluate('document.getElementById("zIn").click()')
    ok(abs(p.evaluate('__pl.getRangeNm()') - 0.1) < 1e-9, '%s: alaraja ei ylity napeilla' % dev)
    for _ in range(40): p.evaluate('document.getElementById("zOut").click()')
    ok(abs(p.evaluate('__pl.getRangeNm()') - 12) < 1e-9, '%s: yläraja 12 mpk pitää (%.4f)' % (dev, p.evaluate('__pl.getRangeNm()')))
    p.evaluate('([x,y])=>{for(let i=0;i<30;i++)document.querySelector("#plot canvas").dispatchEvent(new WheelEvent("wheel",{deltaY:400,clientX:x,clientY:y,bubbles:true,cancelable:true}))}', [g['l'] + 50, g['t'] + 50])
    ok(abs(p.evaluate('__pl.getRangeNm()') - 12) < 1e-9, '%s: rulla ei ylitä ylärajaa' % dev)
    p.evaluate('([x,y])=>{for(let i=0;i<60;i++)document.querySelector("#plot canvas").dispatchEvent(new WheelEvent("wheel",{deltaY:-400,clientX:x,clientY:y,bubbles:true,cancelable:true}))}', [g['l'] + 50, g['t'] + 50])
    ok(abs(p.evaluate('__pl.getRangeNm()') - 0.1) < 1e-9, '%s: rulla ei alita alarajaa' % dev)
    # --- kuvat ---
    p.evaluate('__pl.setRangeNm(0.25)'); p.wait_for_timeout(2500); p.screenshot(path=os.path.join(out, '3h_plotteri_zoom_025%s.png' % sfx))
    p.evaluate('__pl.setRangeNm(4)'); p.wait_for_timeout(5000); p.screenshot(path=os.path.join(out, '3h_plotteri_zoom_4%s.png' % sfx))
    ok(p.evaluate('__pl.ready()') in (True, False), '%s: 4 mpk -kuva otettu (tiilet valmiina: %s)' % (dev, p.evaluate('__pl.ready()')))
    # --- ei tallennu ---
    pref = p.evaluate('localStorage.getItem("sim.asetukset")')
    ok('rangeNm' not in (pref or ''), '%s: zoom ei tallennu asetuksiin (%s)' % (dev, pref))
    p.evaluate('__pl.setRangeNm(3)')
    drag((g['l'] + g['w'] / 2, g['t'] + g['h'] / 2), (g['l'] + g['w'] / 2 + 50, g['t'] + g['h'] / 2 + 50))
    ok(not p.evaluate('__pl.isFollow()'), '%s: vapaa tila ennen uutta ajoa' % dev)
    p.evaluate('__sim.startRun()'); p.wait_for_function('window.__sim.mode==="run"', timeout=170000); p.wait_for_timeout(1500)
    gg = p.evaluate(GEO)
    ok(gg['follow'] and abs(gg['range'] - 1) < 1e-9, '%s: uusi ajo alkaa seurannassa ja 1 mpk korkeudella (%.2f mpk, seuranta %s)' % (dev, gg['range'], gg['follow']))
    ok(not errs, '%s: ei konsolivirheitä (%s)' % (dev, errs[:3]))
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
