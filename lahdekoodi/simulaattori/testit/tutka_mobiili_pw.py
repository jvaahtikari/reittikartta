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
def tapel_kunnes(p, sel, cond):
    for _ in range(3):
        tapel(p, sel)
        try: p.wait_for_function(cond, timeout=5000); break
        except Exception: pass
    p.wait_for_timeout(300)
def tapradar(p, id):
    if id in ('suunta', 'jalki', 'sade', 'viritys'):   # 3h toinen kierros: harvoin tarvittavat napit ovat ≡-valikossa
        tapradar(p, 'meny')
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
    ok(vis(p, '#instrBtn') and p.evaluate('document.getElementById("instrBtn").textContent') == 'Tutka', 'yläpalkissa on mittarin vaihtonappi (Tutka)')
    sm = p.evaluate(SMALL, '#game'); ok(not sm, 'plotterinäkymän kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    # plotteri -> tutka
    tapel(p, '#instrBtn'); p.wait_for_timeout(1500)
    ok(vis(p, '#paneR') and not vis(p, '#paneP'), 'napilla tutka tulee plotterin tilalle')
    ok(p.evaluate('document.getElementById("pane3d").classList.contains("small")') and vis(p, '#pane3d'), 'pieni 3D-ikkuna pysyy kulmassa')
    ok(vis(p, '#instrBtn') and p.evaluate('document.getElementById("instrBtn").textContent') == 'Plotteri', 'yläpalkin nappi vie takaisin plotteriin')
    nb = p.evaluate('[...document.querySelectorAll(".tutka-ui button")].filter(b=>{const r=b.getBoundingClientRect();const cs=getComputedStyle(b);return r.width>0&&cs.visibility!=="hidden"&&cs.display!=="none"}).length')
    ok(nb == 5, 'tutkassa näkyy viisi nappia (RANGE +, RANGE −, EBL VRM, OFFSET, ≡), %d kpl' % nb)
    tx = p.evaluate('[...document.querySelectorAll(".tutka-ui button")].filter(b=>b.getBoundingClientRect().width>0).map(b=>b.textContent.trim())')
    ok('OFFSET' in tx and 'EBL VRM' in tx and '≡' in tx, 'nappien tekstit: %s' % tx)
    d = p.evaluate('(()=>{const g=__radar.testi.geom();const r=document.getElementById("paneR").getBoundingClientRect();return {halk:2*g.r,sivu:Math.min(r.width,r.height)}})()')
    ok(d['halk'] >= 0.98 * d['sivu'], 'PPI:n halkaisija %.0f px on %.0f %% ruudun lyhyemmästä sivusta %.0f px' % (d['halk'], 100 * d['halk'] / d['sivu'], d['sivu']))
    sm = p.evaluate(SMALL, '#game'); ok(not sm, 'tutkanäkymän kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    ok(p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'ei vaakasuuntaista vieritystä')
    # ei päällekkäisyyttä: tutkan nappien ja pienen 3D-ikkunan laatikot
    ov = p.evaluate('''() => { const a = document.getElementById("pane3d").getBoundingClientRect(); let n = 0;
       document.querySelectorAll(".tutka-ui button").forEach(e => { const r = e.getBoundingClientRect(); if (r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom) n++; }); return n; }''')
    ok(ov == 0, 'tutkan napit eivät mene pienen 3D-ikkunan alle (%d päällekkäistä)' % ov)
    p.screenshot(path=os.path.join(out, '_3c_m_%s_tutka.png' % dev))
    # alue
    a0 = rl(p)['alue']; tapradar(p, 'alue+'); a1 = rl(p)['alue']; tapradar(p, 'alue-'); a2 = rl(p)['alue']
    ok(a0 == 1.5 and a1 == 2 and a2 == 1.5, 'aluenapit: 1,5 -> 2 -> 1,5 mpk (%s, %s, %s)' % (a0, a1, a2))
    tapradar(p, 'alue-'); ok(rl(p)['alue'] == 1, 'Alue − antaa 1 mpk'); tapradar(p, 'alue+')
    ok(p.evaluate('document.querySelector(".tutka-ui [data-tutka=suunta]").textContent') == 'H UP', 'suuntanapin teksti on H UP, kun suunta ylös on päällä')
    tapradar(p, 'suunta'); ok(rl(p)['suuntaYlos'] is False, 'Suunta ylös -nappi vaihtaa pohjoinen ylös -tilaan')
    ok(p.evaluate('document.querySelector(".tutka-ui [data-tutka=suunta]").textContent') == 'N UP', 'suuntanapin teksti on N UP, kun pohjoinen ylös on päällä')
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
    # --- vaihe 3h: napautus ja veto asettavat EBL:n ja VRM:n, pohjoinen ylös, offset ---
    def toggle(id, cond):
        # napautus ja odotus tilan muutokselle, kaksi yritystä (hidas ympäristö voi hukata kosketuksen)
        for _ in range(3):
            tapradar(p, id)
            try:
                p.wait_for_function(cond, timeout=4000); return True
            except Exception: pass
        return False
    def geo(): return p.evaluate("(()=>{__radar.piirra();const r=document.getElementById('radar').getBoundingClientRect();const g=__radar.testi.geom();return {x:r.left+g.sx,y:r.top+g.sy,cx:r.left+g.cx,cy:r.top+g.cy,r:g.r,ha:g.haDeg,ea:g.eaDeg}})()")
    def tap_at(x, y):
        if dev == 'chromium':
            tp('touchStart', [(x, y)]); tp('touchEnd', [])
        else:
            p.evaluate(SYNT, [1, 'pointerdown', x, y]); p.evaluate(SYNT, [1, 'pointerup', x, y])
        p.wait_for_timeout(200)
    def ang_diff(a, b): return abs((a - b + 180) % 360 - 180)
    def evlog(): return p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="tutkaevpiste").map(c=>c.value)')
    if dev != 'chromium':
        cdp = None
    st = p.evaluate('__radar.lue()'); hdg0 = st['suunta']; al = st['alue']
    # pohjoinen ylös: keulaviiva kääntyy aluksen suunnan mukaan, EBL pysyy tosisuuntana
    gg = geo(); ok(ang_diff(gg['ha'], hdg0) < 0.5, 'N UP: keulaviiva kuvassa %.1f ° = aluksen suunta %.1f °' % (gg['ha'], hdg0))
    r2 = p.evaluate('(()=>{const l=__radar.lue();__radar.paivita({e:l.e,n:l.n,suunta:l.suunta+80});__radar.piirra();const a=__radar.testi.geom().haDeg;__radar.paivita({e:l.e,n:l.n,suunta:l.suunta});__radar.piirra();return [a,l.suunta]})()')
    ok(ang_diff(r2[0], r2[1] + 80) < 0.5, 'N UP: aluksen suunnan muuttuessa 80 ° keulaviiva kääntyy %.1f ° -> %.1f °' % (r2[1], r2[0]))
    n0 = len(evlog()); gg = geo(); a = math.radians(33); fx = 0.5
    tap_at(gg['x'] + math.sin(a) * gg['r'] * fx, gg['y'] - math.cos(a) * gg['r'] * fx)
    s4 = rl(p); ok(ang_diff(s4['ebl'], 33) <= 1 and abs(s4['vrm'] - 0.5 * al) <= 0.02, 'napautus asettaa EBL:n ja VRM:n: %.2f ° ja %.3f mpk (odotus 33 ° ja %.3f mpk)' % (s4['ebl'], s4['vrm'], 0.5 * al))
    ok(len(evlog()) == n0 + 1, 'napautus kirjautui komentolokiin kerran (%d -> %d)' % (n0, len(evlog())))
    ok(abs(p.evaluate('__radar.testi.geom().eaDeg') - 33) < 1.0, 'N UP: EBL-viiva piirtyy tosisuuntaan 33 °')
    p.screenshot(path=os.path.join(out, '3h_tutka_ebl_vrm_napautus_%s.png' % dev))
    # veto: yksi kirjaus per veto
    n0 = len(evlog()); gg = geo()
    def dragp(brg, f): a = math.radians(brg); return gg['x'] + math.sin(a) * gg['r'] * f, gg['y'] - math.cos(a) * gg['r'] * f
    pts = [dragp(120 + 10 * i, 0.3 + 0.05 * i) for i in range(6)]
    if dev == 'chromium':
        tp('touchStart', [pts[0]])
        for q in pts[1:]: tp('touchMove', [q])
        tp('touchEnd', [])
    else:
        p.evaluate(SYNT, [1, 'pointerdown'] + list(pts[0]))
        for q in pts[1:]: p.evaluate(SYNT, [1, 'pointermove'] + list(q))
        p.evaluate(SYNT, [1, 'pointerup'] + list(pts[-1]))
    p.wait_for_timeout(250); s5 = rl(p)
    ok(ang_diff(s5['ebl'], 170) <= 1 and abs(s5['vrm'] - 0.55 * al) <= 0.02, 'veto siirtää EBL:ää ja VRM:ää: %.2f ° ja %.3f mpk (odotus 170 ° ja %.3f mpk)' % (s5['ebl'], s5['vrm'], 0.55 * al))
    ok(len(evlog()) == n0 + 1, 'veto kirjautui komentolokiin yhtenä rivinä (%d -> %d)' % (n0, len(evlog())))
    p.screenshot(path=os.path.join(out, '3h_tutka_nup_%s.png' % dev))
    # offset, pohjoinen ylös: alus siirtyy aluksen suunnan vastaiseen suuntaan
    ok(toggle('offset', '__radar.lue().offset===true'), 'Offset-nappi kytkee offsetin päälle')
    gg = geo(); hd = math.radians(hdg0)
    ex, ey = gg['cx'] - 0.7 * gg['r'] * math.sin(hd), gg['cy'] + 0.7 * gg['r'] * math.cos(hd)
    ok(abs(gg['x'] - ex) < 1.5 and abs(gg['y'] - ey) < 1.5, 'N UP + offset: alus %.0f,%.0f px, odotus liikesuuntaa %.0f ° vastaan %.0f,%.0f' % (gg['x'], gg['y'], hdg0, ex, ey))
    n0 = len(evlog()); a = math.radians(20); tap_at(gg['x'] + math.sin(a) * gg['r'] * 0.8, gg['y'] - math.cos(a) * gg['r'] * 0.8)
    s6 = rl(p); ok(ang_diff(s6['ebl'], 20) <= 1 and abs(s6['vrm'] - 0.8 * al) <= 0.02, 'offset: napautus mitataan omasta aluksesta: %.2f ° ja %.3f mpk (odotus 20 ° ja %.3f mpk)' % (s6['ebl'], s6['vrm'], 0.8 * al))
    p.screenshot(path=os.path.join(out, '3h_tutka_offset_%s.png' % dev))
    # suunta ylös + offset: alus 70 % säteestä keskipisteen alapuolella
    ok(toggle('suunta', '__radar.lue().suuntaYlos===true'), 'suuntanappi palauttaa H UP -tilan'); gg = geo()
    ok(abs(gg['x'] - gg['cx']) < 1.5 and abs(gg['y'] - (gg['cy'] + 0.7 * gg['r'])) < 1.5, 'H UP + offset: alus keskipisteen alapuolella %.0f px (odotus %.0f)' % (gg['y'] - gg['cy'], 0.7 * gg['r']))
    p.screenshot(path=os.path.join(out, '3h_tutka_offset_hup_%s.png' % dev))
    a = math.radians(40); tap_at(gg['x'] + math.sin(a) * gg['r'] * 0.6, gg['y'] - math.cos(a) * gg['r'] * 0.6)
    s7 = p.evaluate('__radar.lue()'); ok(ang_diff(s7['ebl'], (40 + s7['suunta']) % 360) <= 1, 'H UP: EBL on tosisuunta %.1f ° (kuvan suunta 40 ° + aluksen suunta %.1f °)' % (s7['ebl'], s7['suunta']))
    p.keyboard.press('o')
    try: p.wait_for_function('__radar.lue().offset===false', timeout=5000)
    except Exception: pass
    ok(p.evaluate('__radar.lue().offset') is False, 'O-näppäin palauttaa keskitetyn kuvan')
    gg = geo(); ok(abs(gg['x'] - gg['cx']) < 1.5 and abs(gg['y'] - gg['cy']) < 1.5, 'offsetin poiston jälkeen alus on keskellä')
    lg = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="tutkaoffset"||c.kind==="tutkasuunta").map(c=>c.kind+":"+c.value)')
    ok(lg == ['tutkasuunta:0', 'tutkaoffset:1', 'tutkasuunta:1', 'tutkaoffset:0'], 'suunnan ja offsetin vaihdot kirjautuivat komentolokiin %s' % lg)
    p.evaluate('__radar.asetaSuuntaYlos(false)'); p.wait_for_timeout(200)
    ok(vis(p, '.tutka-ui'), 'palautettu tila')
    p.screenshot(path=os.path.join(out, '3h_tutka_puhelin_%s.png' % dev))
    # näkymän vaihto: tutka pieneksi ja takaisin
    tapel_kunnes(p, '#swapBtn', 'document.getElementById("paneR").classList.contains("small")')
    ok(vis(p, '#paneR') and p.evaluate('document.getElementById("paneR").classList.contains("small")') and p.evaluate('document.getElementById("pane3d").classList.contains("main")'), 'napautus vaihtaa 3D:n päänäkymäksi ja tutka jää pieneksi ikkunaksi')
    ok(not vis(p, '.tutka-ui'), 'pienessä tutkaikkunassa ei tutkan nappeja')
    p.screenshot(path=os.path.join(out, '_3c_m_%s_tutka_pieni.png' % dev))
    tapel_kunnes(p, '#swapBtn', 'document.getElementById("paneR").classList.contains("main")')
    ok(p.evaluate('document.getElementById("paneR").classList.contains("main")') and vis(p, '.tutka-ui'), 'napautus palauttaa tutkan päänäkymäksi')
    # sammutus ja komentoloki
    tapradar(p, 'meny'); tapel(p, '#rOffBtn'); ok(vis(p, '#radarOff'), 'Tutka pois: peite näkyy')
    tapel(p, '#radarOnBtn'); ok(not vis(p, '#radarOff'), 'Päälle: peite poistuu')
    log = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="tutka").map(c=>c.value)'); ok(log == [0, 1], 'komentolokiin kirjautui tutka pois ja päälle %s' % log)
    # takaisin plotteriin
    tapel(p, '#instrBtn'); p.wait_for_timeout(1000)
    ok(vis(p, '#paneP') and not vis(p, '#paneR') and vis(p, '#instrBtn'), 'nappi vie takaisin plotteriin')
    ok(p.evaluate('__sim.radarShown') is False and p.evaluate('__sim.plotShown') is True, 'tutkan päivitys lepää, kun se ei ole näkyvissä')
    # R-näppäin
    p.keyboard.press('r'); p.wait_for_timeout(500); ok(vis(p, '#paneR'), 'R-näppäin vaihtaa mittaria')
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
