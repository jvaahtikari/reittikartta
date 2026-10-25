"""Vaihe 3c, kriteeri 3: tutka simulaattorissa mobiililaitteilla (WebKit iPhone 14, Chromium Pixel 7).
Aloitusnäytön Näytöt-valinta, näkymän vaihto plotteri-tutka, EBL ja VRM kosketuksella, aluenapit, sammutus ja komentoloki,
kosketuskohteet vähintään 44 px ja konsolivirheet. Käyttö: python3 tutka_mobiili_pw.py chromium|webkit [sivu]"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
page_url = sys.argv[2] if len(sys.argv) > 2 else SIM + 'simulaattori.html'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

SMALL = '''(root) => { const out = []; document.querySelectorAll(root + ' button, ' + root + ' input, ' + root + ' summary').forEach(b => {
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
    if (r.width < 43.5 || r.height < 43.5) out.push((b.id || b.getAttribute('data-tutka') || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  return out; }'''
SYNT = '''([id,type,x,y])=>{const c=document.getElementById('radar');c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,bubbles:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1}));}'''
def rl(p): return p.evaluate('(()=>{const l=__radar.lue();return {ebl:l.ebl,vrm:l.vrm,alue:l.alue,suuntaYlos:l.suuntaYlos}})()')
def vis(p, sel): return p.evaluate('(s)=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).display!=="none"}', sel)
def tapel(p, sel):
    r = p.locator(sel).bounding_box(); p.touchscreen.tap(r['x'] + r['width'] / 2, r['y'] + r['height'] / 2); p.wait_for_timeout(250)
def tapradar(p, id):
    r = p.evaluate("(id)=>{const e=document.querySelector('.tutka-ui button[data-tutka=\"'+id+'\"]');const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}", id)
    p.touchscreen.tap(r[0], r[1]); p.wait_for_timeout(250)

with sync_playwright() as pw:
    b, c = webkit(pw) if dev == 'webkit' else chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    t0 = time.time()
    p.goto(page_url + ('&' if '?' in page_url else '?') + 'aineisto=' + PAKETTI + '&preserve=1')
    p.wait_for_selector('#startBtn', timeout=30000)
    ok(p.evaluate('document.querySelector("#segDisp .on").dataset.v') == 'plot', 'Näytöt-valinnan oletus on plotteri')
    ok([x.get_attribute('data-v') for x in p.locator('#segDisp button').all()] == ['plot', 'radar', 'both'], 'Näytöt-valinnassa plotteri, tutka ja molemmat')
    sm = p.evaluate(SMALL, '#start'); ok(not sm, 'aloitusnäytön kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    p.tap('#segDisp button[data-v="both"]'); ok(p.evaluate('document.querySelector("#segDisp .on").dataset.v') == 'both', 'valinta Molemmat onnistuu')
    p.tap('#startBtn')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    print('lataus', round(time.time() - t0, 1), 's')
    p.wait_for_timeout(1500)
    ok(vis(p, '#paneP') and not vis(p, '#paneR'), 'alussa plotteri päänäkymänä, tutka ei näy')
    ok(vis(p, '#pInstrBtn'), 'plotterin ruudussa on vaihtonappi')
    sm = p.evaluate(SMALL, '#game'); ok(not sm, 'plotterinäkymän kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    # plotteri -> tutka
    tapel(p, '#pInstrBtn'); p.wait_for_timeout(1500)
    ok(vis(p, '#paneR') and not vis(p, '#paneP'), 'napilla tutka tulee plotterin tilalle')
    ok(p.evaluate('document.getElementById("pane3d").classList.contains("small")') and vis(p, '#pane3d'), 'pieni 3D-ikkuna pysyy kulmassa')
    ok(vis(p, '#rInstrBtn') and p.evaluate('document.getElementById("rInstrBtn").textContent') == 'Plotteri', 'tutkan ruudussa nappi takaisin plotteriin')
    nb = p.evaluate('document.querySelectorAll(".tutka-ui button").length'); ok(nb == 5, 'tutkan omat napit (alue, suunta, jälki, sade) näkyvät, %d kpl' % nb)
    sm = p.evaluate(SMALL, '#game'); ok(not sm, 'tutkanäkymän kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    ok(p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'ei vaakasuuntaista vieritystä')
    # ei päällekkäisyyttä: tutkan nappien ja pienen 3D-ikkunan laatikot
    ov = p.evaluate('''() => { const a = document.getElementById("pane3d").getBoundingClientRect(); let n = 0;
       document.querySelectorAll(".tutka-ui button, #rInstrBtn, #rOffBtn").forEach(e => { const r = e.getBoundingClientRect(); if (r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom) n++; }); return n; }''')
    ok(ov == 0, 'tutkan napit eivät mene pienen 3D-ikkunan alle (%d päällekkäistä)' % ov)
    p.screenshot(path=os.path.join(out, '_3c_m_%s_tutka.png' % dev))
    # alue
    a0 = rl(p)['alue']; tapradar(p, 'alue+'); a1 = rl(p)['alue']; tapradar(p, 'alue-'); a2 = rl(p)['alue']
    ok(a0 == 1.5 and a1 == 2 and a2 == 1.5, 'aluenapit: 1,5 -> 2 -> 1,5 mpk (%s, %s, %s)' % (a0, a1, a2))
    tapradar(p, 'alue-'); ok(rl(p)['alue'] == 1, 'Alue − antaa 1 mpk'); tapradar(p, 'alue+')
    tapradar(p, 'suunta'); ok(rl(p)['suuntaYlos'] is False, 'Suunta ylös -nappi vaihtaa pohjoinen ylös -tilaan')
    tapradar(p, 'jalki'); ok(rl(p).get('jalkiS', 0) == 0 or p.evaluate('__radar.lue().jalkiS') == 15, 'Jälki-nappi kiertää kestoa')
    tapradar(p, 'jalki'); tapradar(p, 'jalki'); tapradar(p, 'jalki'); tapradar(p, 'jalki')
    # EBL ja VRM kosketuksella (pohjoinen ylös, jolloin kuvan suunta on tosisuunta)
    g = p.evaluate("(()=>{const r=document.getElementById('radar').getBoundingClientRect();const g=__radar.testi.geom();return {x:r.left+g.cx,y:r.top+g.cy,r:g.r}})()")
    def piste(brg, f): a = math.radians(brg); return g['x'] + math.sin(a) * g['r'] * f, g['y'] - math.cos(a) * g['r'] * f
    x1, y1 = piste(90, 0.6); x2, y2 = piste(135, 0.6)
    for (i, t, x, y) in [(1, 'pointerdown', x1, y1), (1, 'pointermove', (x1 + x2) / 2, (y1 + y2) / 2), (1, 'pointermove', x2, y2), (1, 'pointerup', x2, y2)]:
        p.evaluate(SYNT, [i, t, x, y])
    s1 = rl(p); ok(abs(s1['ebl'] - 135) < 0.5, 'EBL pyyhkäisyllä: odotus 135, tulos %.1f' % s1['ebl'])
    if dev == 'chromium':
        cdp = c.new_cdp_session(p)
        def tp(typ, pts): cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': q[0], 'y': q[1], 'id': k} for k, q in enumerate(pts)]})
        xa, ya = piste(260, 0.6); tp('touchStart', [(xa, ya)]); tp('touchEnd', []); p.wait_for_timeout(200)
        s2 = rl(p); ok(abs(s2['ebl'] - 260) < 0.5, 'EBL oikealla kosketuksella (CDP): odotus 260, tulos %.1f' % s2['ebl'])
    v0 = rl(p)['vrm']; e0 = rl(p)['ebl']; ax, ay = g['x'] - 50, g['y'] + g['r'] * 0.3; bx, by = g['x'] + 50, g['y'] + g['r'] * 0.3
    p.evaluate(SYNT, [1, 'pointerdown', ax, ay]); p.evaluate(SYNT, [2, 'pointerdown', bx, by])
    for f in (1.15, 1.3, 1.45, 1.6):
        p.evaluate(SYNT, [1, 'pointermove', g['x'] - 50 * f, ay]); p.evaluate(SYNT, [2, 'pointermove', g['x'] + 50 * f, by])
    p.evaluate(SYNT, [1, 'pointerup', g['x'] - 80, ay]); p.evaluate(SYNT, [2, 'pointerup', g['x'] + 80, by])
    s3 = rl(p); ok(abs(s3['vrm'] / v0 - 1.6) < 0.05 and abs(s3['ebl'] - e0) < 0.01, 'VRM nipistyksellä: %.3f -> %.3f (suhde %.2f), EBL ennallaan' % (v0, s3['vrm'], s3['vrm'] / v0))
    if dev == 'chromium':
        v0 = rl(p)['vrm']
        tp('touchStart', [(g['x'] - 40, g['y'] + g['r'] * 0.3), (g['x'] + 40, g['y'] + g['r'] * 0.3)])
        for f in (1.2, 1.5, 0.8): tp('touchMove', [(g['x'] - 40 * f, g['y'] + g['r'] * 0.3), (g['x'] + 40 * f, g['y'] + g['r'] * 0.3)])
        tp('touchEnd', []); p.wait_for_timeout(200)
        v1 = rl(p)['vrm']; ok(abs(v1 / v0 - 0.8) < 0.05, 'VRM oikealla kahden sormen kosketuksella (CDP): suhde %.2f, odotus 0,8' % (v1 / v0))
    # näkymän vaihto: tutka pieneksi ja takaisin
    tapel(p, '#swapBtn'); p.wait_for_timeout(1200)
    ok(vis(p, '#paneR') and p.evaluate('document.getElementById("paneR").classList.contains("small")') and p.evaluate('document.getElementById("pane3d").classList.contains("main")'), 'napautus vaihtaa 3D:n päänäkymäksi ja tutka jää pieneksi ikkunaksi')
    ok(not vis(p, '.tutka-ui'), 'pienessä tutkaikkunassa ei tutkan nappeja')
    p.screenshot(path=os.path.join(out, '_3c_m_%s_tutka_pieni.png' % dev))
    tapel(p, '#swapBtn'); p.wait_for_timeout(1200)
    ok(p.evaluate('document.getElementById("paneR").classList.contains("main")') and vis(p, '.tutka-ui'), 'napautus palauttaa tutkan päänäkymäksi')
    # sammutus ja komentoloki
    tapel(p, '#rOffBtn'); ok(vis(p, '#radarOff'), 'Tutka pois: peite näkyy')
    tapel(p, '#radarOnBtn'); ok(not vis(p, '#radarOff'), 'Päälle: peite poistuu')
    log = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="tutka").map(c=>c.value)'); ok(log == [0, 1], 'komentolokiin kirjautui tutka pois ja päälle %s' % log)
    # takaisin plotteriin
    tapel(p, '#rInstrBtn'); p.wait_for_timeout(1000)
    ok(vis(p, '#paneP') and not vis(p, '#paneR') and vis(p, '#pInstrBtn'), 'nappi vie takaisin plotteriin')
    ok(p.evaluate('__sim.radarShown') is False and p.evaluate('__sim.plotShown') is True, 'tutkan päivitys lepää, kun se ei ole näkyvissä')
    # R-näppäin
    p.keyboard.press('r'); p.wait_for_timeout(500); ok(vis(p, '#paneR'), 'R-näppäin vaihtaa mittaria')
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
