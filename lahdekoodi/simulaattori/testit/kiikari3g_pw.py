"""Vaihe 3g, kriteeri 3: kiikaritoiminto. Ajetaan Mustalahden vapaassa ajossa (Kaikumatalan viitta 2,2 km päässä suunnassa 012°).
Tarkistetaan: nappi ja B kytkevät kiikarin, kuvakulma on 7°, maski piirtyy, veto kääntää katsetta (herkkyys / 7) ja nostaa katsetta, napautus keskelle ja B poistavat kiikarin
ja palauttavat entisen kuvakulman ja katseen, komentolokissa on rivit (päälle ja pois suuntineen), reunanapit piiloutuvat ja nappi on vähintään 44 px.
Käyttö: python3 kiikari3g_pw.py desktop|chromium|webkit [osoite]   (desktop = Chromium 1440 x 900, chromium = Pixel 7, webkit = iPhone 14)"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
base = sys.argv[2] if len(sys.argv) > 2 else SIM
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
PE = """([type, x, y, id, ptype]) => { const v = document.getElementById('v3');
  v.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: ptype, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); }"""
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true')
    tap = (lambda s: p.tap(s)) if dev != 'desktop' else (lambda s: p.click(s))
    if dev != 'desktop': p.tap('#swapBtn'); p.wait_for_timeout(1500)
    p.evaluate('document.getElementById("pauseBtn").click()')
    p.evaluate('(()=>{const S=__sim.S; S.hdg=347-S.conv; S.orderHdg=347; S.v=0;})()')
    p.evaluate('(()=>{const S=__sim.S; window.__X=S.x; window.__Y=S.y;})()')
    p.evaluate('Merkit.load(__X,__Y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=120000)
    for _ in range(60):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
    tg = p.evaluate('''(()=>{const S=__sim.S; const L=Merkit.near(S.x,S.y,4000).filter(a=>a.tyyppi==="Viitta").map(a=>{const dx=a.x-S.x, dy=a.y-S.y; return {d:Math.hypot(dx,dy), b:(Math.atan2(dx,dy)*180/Math.PI+360)%360, n:a.navigointilaji};}).filter(a=>a.d>900).sort((p,q)=>p.d-q.d); return {conv:S.conv, l:L.slice(0,4)};})()''')
    print('viitat', tg)
    BEAR = ((tg['l'][0]['b'] + tg['conv']) % 360) if tg['l'] else 12.0
    GZ = ((BEAR - 347 + 540) % 360) - 180
    p.evaluate('__view.setGaze(%f)' % GZ); p.wait_for_timeout(3000)
    hf0 = p.evaluate('__view.hfov()'); g0 = p.evaluate('__view.getGazeNow()')
    print('ennen kiikaria: kuvakulma %.2f°, katse %.2f°' % (hf0, g0))
    box = p.evaluate('(()=>{const r=document.getElementById("binoBtn").getBoundingClientRect();return [r.width,r.height]})()')
    ok(box[0] >= 44 and box[1] >= 44, 'Kiikari-nappi vähintään 44 px (%d x %d)' % (box[0], box[1]))
    ok(p.evaluate('getComputedStyle(document.getElementById("gazeL")).display') != 'none', 'reunanapit näkyvissä ennen kiikaria')
    # 1. nappi kytkee
    tap('#binoBtn'); p.wait_for_timeout(2500)
    on = p.evaluate('__view.isBino()'); hf1 = p.evaluate('__view.hfov()'); g1 = p.evaluate('__view.getGazeNow()')
    ok(on, 'nappi kytkee kiikarin päälle')
    ok(abs(hf1 - 7) < 0.05, 'kuvakulma kiikarissa %.3f° (odotus 7°)' % hf1)
    ok(abs(g1 - g0) < 0.5, 'katse säilyy kiikariin mentäessä (%.2f° -> %.2f°)' % (g0, g1))
    ok(p.evaluate('document.getElementById("binoBtn").getAttribute("aria-pressed")') == 'true', 'nappi on painettu (aria-pressed)')
    ok(p.evaluate('getComputedStyle(document.getElementById("gazeL")).display') == 'none', 'reunanapit piiloon kiikarin ajaksi')
    # maski: reuna musta, keskusta läpinäkyvä
    m = p.evaluate('''(()=>{const c=document.getElementById("v3bino");const g=c.getContext("2d");const w=c.width,h=c.height;
      const px=(x,y)=>Array.from(g.getImageData(Math.floor(x),Math.floor(y),1,1).data);
      return {hidden:c.hidden,w:w,h:h,keski:px(w/2,h/2),vasenYla:px(2,2),oikeaAla:px(w-3,h-3),vasenKeski:px(w*0.03,h/2),sivuReuna:px(w/2+w*0.3,h/2)}})()''')
    ok(not m['hidden'] and m['keski'][3] < 10, 'maski piirtyy, keskusta läpinäkyvä (alfa %d)' % m['keski'][3])
    ok(m['vasenYla'][3] > 240 and m['oikeaAla'][3] > 240, 'maskin kulmat mustat (alfa %d ja %d)' % (m['vasenYla'][3], m['oikeaAla'][3]))
    print('maski', m)
    # 2. veto (hiiri tai CDP-kosketus tai tapahtumat), vaaka 200 px oikealle ja pysty 100 px alas
    r = p.evaluate('(()=>{const r=document.getElementById("v3").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height*0.6,r.width,r.height]})()')
    sens = 0.25 / 7
    def drag(dx, dy, steps=10):
        if dev == 'desktop':
            p.mouse.move(r[0], r[1]); p.mouse.down(); p.mouse.move(r[0] + dx, r[1] + dy, steps=steps); p.mouse.up()
        else:
            p.evaluate(PE, ['pointerdown', r[0], r[1], 7, 'touch'])
            for k in range(1, steps + 1): p.evaluate(PE, ['pointermove', r[0] + dx * k / steps, r[1] + dy * k / steps, 7, 'touch'])
            p.evaluate(PE, ['pointerup', r[0] + dx, r[1] + dy, 7, 'touch'])
    pit0 = p.evaluate('__view.getBinoPitch()')
    gc0 = p.evaluate('__view.getGaze()'); drag(-200, 0); p.wait_for_timeout(600); gc1 = p.evaluate('__view.getGaze()')
    ok(abs((gc1 - gc0) - 200 * sens) < 0.6, 'veto 200 px vasemmalle kääntää katsetta %.2f° (odotus %.2f°, herkkyys 0,25 / 7 °/px)' % (gc1 - gc0, 200 * sens))
    drag(0, 100); p.wait_for_timeout(600); pit1 = p.evaluate('__view.getBinoPitch()')
    ok(abs((pit1 - pit0) - 100 * sens) < 0.6, 'pystyveto 100 px alas nostaa katsetta %.2f° (odotus %.2f°)' % (pit1 - pit0, 100 * sens))
    # tärinä: suunta vaihtelee kuvien välillä
    ys = []
    for _ in range(8): ys.append(p.evaluate('__view.binoState().shakeYaw')); p.wait_for_timeout(250)
    ok(max(ys) - min(ys) > 0.01 and max(abs(y) for y in ys) < 1.0, 'käden tärinä: vaihteluväli %.3f° (suurin %.3f°)' % (max(ys) - min(ys), max(abs(y) for y in ys)))
    # kuva (kiikari kohti Kaikumatalaa)
    p.evaluate('__view.setGaze(%f); __view.setBinoPitch(0)' % g0); p.wait_for_timeout(3500)
    shot = '3g_kiikari_%s.png' % ('desktop' if dev == 'desktop' else ('puhelin' if dev == 'chromium' else 'puhelin_webkit'))
    p.screenshot(path=os.path.join(out, shot)); print('kuva', shot)
    # 3. B poistaa, palauttaa kuvakulman ja katseen
    p.keyboard.press('b'); p.wait_for_timeout(2500)
    off = not p.evaluate('__view.isBino()'); hf2 = p.evaluate('__view.hfov()'); g2 = p.evaluate('__view.getGazeNow()')
    ok(off, 'B poistaa kiikarin')
    ok(abs(hf2 - hf0) < 0.05, 'kuvakulma palaa (%.2f° -> %.2f°)' % (hf0, hf2))
    ok(abs(g2 - g0) < 0.5, 'katse palaa (%.2f° -> %.2f°)' % (g0, g2))
    ok(p.evaluate('document.getElementById("v3bino").hidden') is True, 'maski piiloon')
    ok(p.evaluate('getComputedStyle(document.getElementById("gazeL")).display') != 'none', 'reunanapit takaisin')
    # B kytkee päälle, napautus keskelle poistaa
    p.keyboard.press('b'); p.wait_for_timeout(1500)
    ok(p.evaluate('__view.isBino()'), 'B kytkee kiikarin päälle')
    if dev == 'desktop': p.mouse.click(r[0], r[3] * 0.5 + 60)
    else: p.touchscreen.tap(r[0], r[1])
    p.wait_for_timeout(1500)
    ok(not p.evaluate('__view.isBino()'), 'napautus keskelle poistaa kiikarin')
    ok(abs(p.evaluate('__view.hfov()') - hf0) < 0.05, 'kuvakulma palaa napautuksen jälkeen')
    # toinen napautus napista poistaa
    tap('#binoBtn'); p.wait_for_timeout(1200); ok(p.evaluate('__view.isBino()'), 'nappi kytkee uudelleen')
    tap('#binoBtn'); p.wait_for_timeout(1200); ok(not p.evaluate('__view.isBino()'), 'toinen napautus napista poistaa')
    # 4. komentoloki
    lg = p.evaluate('__sim.S.cmdLog.filter(c=>c.kind==="kiikari").map(c=>c.value)')
    print('komentoloki', lg)
    ok(len(lg) == 6 and [x['on'] for x in lg] == [True, False, True, False, True, False], 'komentolokissa 6 kiikaririvia (päälle ja pois vuorotellen)')
    ok(all(isinstance(x['suunta'], (int, float)) for x in lg), 'jokaisella rivillä suunta')
    ok(abs(((lg[0]['suunta'] - BEAR + 540) % 360) - 180) < 3, 'ensimmäisen rivin suunta %.1f° (odotus %.1f°)' % (lg[0]['suunta'], BEAR))
    lab = p.evaluate('(()=>{const t=document.createElement("div");return 1})()')
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
print('YHTEENSÄ', len(checks), 'tarkistusta,', len([1 for x in checks if not x[0]]), 'virhettä')
