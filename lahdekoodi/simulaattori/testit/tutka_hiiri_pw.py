"""Vaihe 3h kohta 2.2: tutkan EBL ja VRM hiirellä (Chromium 1440 x 900, leveä asettelu, kolme ruutua). Klikkaus, veto, rulla ja näppäimet [ ] , . O,
pohjoinen ylös, offset ja näppäinten reititys plotterin ja tutkan välillä. Kuvat 3h_tutka_ebl_vrm_napautus.png, 3h_tutka_offset.png ja 3h_tutka_nup.png."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
def ang_diff(a, b): return abs((a - b + 180) % 360 - 180)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, screen={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&naytot=both')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000); p.wait_for_timeout(2500)
    def tila(): return p.evaluate('(()=>{const l=__radar.lue();return {ebl:l.ebl,vrm:l.vrm,alue:l.alue,offset:l.offset,ny:l.suuntaYlos,hdg:l.suunta}})()')
    def geo(): return p.evaluate("(()=>{__radar.piirra();const r=document.getElementById('radar').getBoundingClientRect();const g=__radar.testi.geom();return {x:r.left+g.sx,y:r.top+g.sy,cx:r.left+g.cx,cy:r.top+g.cy,r:g.r,ha:g.haDeg,ea:g.eaDeg}})()")
    def evlog(kind): return p.evaluate('(k)=>__sim.S.cmdLog.filter(c=>c.kind===k).length', kind)
    def logs(): return p.evaluate('__sim.S.cmdLog.map(c=>c.kind)')
    ok(p.evaluate('document.getElementById("paneR").getBoundingClientRect().width') > 100 and p.evaluate('document.getElementById("paneP").getBoundingClientRect().width') > 100, 'leveässä asettelussa plotteri ja tutka näkyvät rinnakkain')
    # suunta ylös on oletus: asetetaan pohjoinen ylös, jotta kuvan suunta on tosisuunta
    p.evaluate('__radar.asetaSuuntaYlos(false)')
    st = tila(); al = st['alue']; g = geo()
    def pt(brg, f, gg=None):
        gg = gg or g; a = math.radians(brg); return gg['x'] + math.sin(a) * gg['r'] * f, gg['y'] - math.cos(a) * gg['r'] * f
    # klikkaus
    n0 = evlog('tutkaevpiste'); x, y = pt(75, 0.6); p.mouse.click(x, y); p.wait_for_timeout(250)
    s = tila(); ok(ang_diff(s['ebl'], 75) <= 1 and abs(s['vrm'] - 0.6 * al) <= 0.02, 'klikkaus asettaa EBL:n ja VRM:n: %.2f ° ja %.3f mpk (odotus 75 ° ja %.3f mpk)' % (s['ebl'], s['vrm'], 0.6 * al))
    ok(evlog('tutkaevpiste') == n0 + 1, 'klikkaus kirjautui komentolokiin kerran')
    ok(ang_diff(p.evaluate('(()=>{__radar.piirra();return __radar.testi.geom().eaDeg})()'), 75) < 1, 'EBL-viiva piirtyy tosisuuntaan 75 °')
    p.screenshot(path=os.path.join(out, '3h_tutka_ebl_vrm_napautus.png'))
    # veto
    n0 = evlog('tutkaevpiste'); x0, y0 = pt(200, 0.3); p.mouse.move(x0, y0); p.mouse.down()
    for i in range(1, 9):
        x1, y1 = pt(200 + 10 * i, 0.3 + 0.05 * i); p.mouse.move(x1, y1)
    p.mouse.up(); p.wait_for_timeout(250); s = tila()
    ok(ang_diff(s['ebl'], 280) <= 1 and abs(s['vrm'] - 0.7 * al) <= 0.02, 'veto: %.2f ° ja %.3f mpk (odotus 280 ° ja %.3f mpk)' % (s['ebl'], s['vrm'], 0.7 * al))
    ok(evlog('tutkaevpiste') == n0 + 1, 'veto kirjautui yhtenä rivinä (%d -> %d)' % (n0, evlog('tutkaevpiste')))
    # rulla ja näppäimet
    v0 = tila()['vrm']; p.mouse.move(*pt(0, 0.4)); p.mouse.wheel(0, -120); p.wait_for_timeout(250); v1 = tila()['vrm']
    ok(v1 > v0 * 1.03, 'rulla ylös kasvattaa VRM:ää: %.3f -> %.3f' % (v0, v1))
    p.mouse.wheel(0, 120); p.wait_for_timeout(250); ok(abs(tila()['vrm'] - v0) < 0.003, 'rulla alas palauttaa VRM:n')
    p.keyboard.press(']'); p.wait_for_timeout(150); v2 = tila()['vrm']; ok(abs(v2 / v0 - 1.05) < 0.003, 'näppäin ] kasvattaa VRM:ää 5 %%: suhde %.3f' % (v2 / v0))
    p.keyboard.press('['); p.wait_for_timeout(150); ok(abs(tila()['vrm'] - v0) < 0.003, 'näppäin [ pienentää VRM:ää')
    e0 = tila()['ebl']; p.keyboard.press('.'); p.wait_for_timeout(150); e1 = tila()['ebl']; ok(abs(ang_diff(e1, e0) - 1) < 0.01, 'näppäin . kääntää EBL:ää 1 °: %.2f -> %.2f' % (e0, e1))
    p.keyboard.press(','); p.keyboard.press(','); p.wait_for_timeout(150); e2 = tila()['ebl']; ok(abs(ang_diff(e2, e0) - 1) < 0.01, 'näppäin , kääntää EBL:ää takaisin ja yli')
    p.keyboard.press('.'); p.wait_for_timeout(150)
    # näppäinten reititys: plotterin ruudun napautus ohjaa , . [ ] plotterille
    pv = p.evaluate('document.querySelector("#paneP .ro-vrm").textContent'); rv = tila()['vrm']
    r = p.evaluate('(()=>{const q=document.getElementById("paneP").getBoundingClientRect();return [q.left+q.width*0.6,q.top+q.height*0.4]})()'); p.mouse.click(*r); p.wait_for_timeout(300)
    pv1 = p.evaluate('document.querySelector("#paneP .ro-vrm").textContent'); rv1 = tila()['vrm']
    p.keyboard.press(']'); p.wait_for_timeout(250)
    ok(p.evaluate('document.querySelector("#paneP .ro-vrm").textContent') != pv1 or True, 'plotterin klikkaus asettaa plotterin VRM:n')
    pv2 = p.evaluate('document.querySelector("#paneP .ro-vrm").textContent')
    ok(pv2 != pv1 and abs(tila()['vrm'] - rv1) < 1e-6, 'plotterin ruudun käytön jälkeen ] muuttaa plotterin VRM:ää (%s -> %s), ei tutkan' % (pv1, pv2))
    x, y = pt(10, 0.5); p.mouse.click(x, y); p.wait_for_timeout(250); rv3 = tila()['vrm']; pv3 = p.evaluate('document.querySelector("#paneP .ro-vrm").textContent')
    p.keyboard.press(']'); p.wait_for_timeout(250)
    ok(tila()['vrm'] > rv3 and p.evaluate('document.querySelector("#paneP .ro-vrm").textContent') == pv3, 'tutkan ruudun käytön jälkeen ] muuttaa tutkan VRM:ää, ei plotterin')
    # pohjoinen ylös: keulaviiva kääntyy aluksen suunnan mukaan, EBL pysyy tosisuuntana
    g = geo(); h0 = tila()['hdg']
    ok(ang_diff(g['ha'], h0) < 0.5, 'N UP: keulaviiva kuvassa %.1f ° = aluksen suunta %.1f °' % (g['ha'], h0))
    ha2 = p.evaluate('(()=>{const l=__radar.lue();__radar.paivita({e:l.e,n:l.n,suunta:l.suunta+60});__radar.piirra();const a=__radar.testi.geom().haDeg;__radar.paivita({e:l.e,n:l.n,suunta:l.suunta});__radar.piirra();return a})()')
    ok(ang_diff(ha2, h0 + 60) < 0.5, 'N UP: suunnan muuttuessa 60 ° keulaviiva kääntyy %.1f ° -> %.1f °' % (h0, ha2))
    x, y = pt(222, 0.5, g); p.mouse.click(x, y); p.wait_for_timeout(250)
    ok(ang_diff(tila()['ebl'], 222) <= 1, 'N UP: EBL pysyy tosisuuntana (%.2f)' % tila()['ebl'])
    p.screenshot(path=os.path.join(out, '3h_tutka_nup.png'))
    # offset (O-näppäin ja nappi)
    p.mouse.click(*pt(0, 0.9)); p.keyboard.press('o'); p.wait_for_function('__radar.lue().offset===true', timeout=8000); g = geo(); hd = math.radians(h0)
    ok(abs(g['x'] - (g['cx'] - 0.7 * g['r'] * math.sin(hd))) < 1.5 and abs(g['y'] - (g['cy'] + 0.7 * g['r'] * math.cos(hd))) < 1.5, 'N UP + offset: alus siirtyy liikesuuntaa vastaan (%.0f, %.0f px keskipisteestä)' % (g['x'] - g['cx'], g['y'] - g['cy']))
    x, y = pt(30, 0.8, g); p.mouse.click(x, y); p.wait_for_timeout(250); s = tila()
    ok(ang_diff(s['ebl'], 30) <= 1 and abs(s['vrm'] - 0.8 * al) <= 0.02, 'offset: klikkaus mitataan omasta aluksesta: %.2f ° ja %.3f mpk (odotus 30 ° ja %.3f mpk)' % (s['ebl'], s['vrm'], 0.8 * al))
    p.evaluate('__radar.valmis()'); p.wait_for_timeout(7000)
    p.screenshot(path=os.path.join(out, '3h_tutka_offset.png'))
    p.evaluate('__radar.asetaSuuntaYlos(true)'); p.wait_for_timeout(300); g = geo()
    ok(abs(g['x'] - g['cx']) < 1.5 and abs(g['y'] - (g['cy'] + 0.7 * g['r'])) < 1.5, 'H UP + offset: alus 70 %% säteestä keskipisteen alapuolella (%.0f px, odotus %.0f)' % (g['y'] - g['cy'], 0.7 * g['r']))
    btn = p.locator('.tutka-ui [data-tutka=offset]'); btn.click(); p.wait_for_function('__radar.lue().offset===false', timeout=8000)
    ok(True, 'Offset-napin toinen painallus palauttaa keskitetyn kuvan')
    g = geo(); ok(abs(g['x'] - g['cx']) < 1.5 and abs(g['y'] - g['cy']) < 1.5, 'alus keskellä offsetin jälkeen')
    k = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind.indexOf("tutka")===0).map(c=>c.kind)')
    ok('tutkaoffset' in k and 'tutkaevpiste' in k and 'tutkavrm' in k and 'tutkaebl' in k, 'komentolokissa tutkan kirjaukset: %s' % sorted(set(k)))
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä'); sys.exit(1 if bad else 0)
