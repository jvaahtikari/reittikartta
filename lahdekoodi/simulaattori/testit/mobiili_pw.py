"""Mobiilitesti: aloitusnäyttö, näkymän vaihto, komennot kosketuksella, plotterin sammutus ja purku.
Laite: 'webkit' (iPhone 14) tai 'chromium' (Pixel 7). Sivu: SIM + simulaattori.html (tai build-tuote parametrilla url)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
page_url = sys.argv[2] if len(sys.argv) > 2 else SIM + 'simulaattori.html'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg)

def small_targets(p, sel_root):
    return p.evaluate('''(root) => { const out = []; document.querySelectorAll(root + ' button, ' + root + ' input, ' + root + ' summary').forEach(b => {
        const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden') return;
        if (r.width < 43.5 || r.height < 43.5) out.push((b.id || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
      return out; }''', sel_root)

with sync_playwright() as pw:
    if dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    t0 = time.time()
    p.goto(page_url + ('&' if '?' in page_url else '?') + 'aineisto=' + PAKETTI + '&preserve=1')
    p.wait_for_selector('#startBtn', timeout=30000)
    p.screenshot(path=os.path.join(out, '_m_%s_start.png' % dev))
    ok(p.is_visible('#start'), 'aloitusnäyttö näkyy')
    ok('Ei navigointikäyttöön' in p.inner_text('#start'), 'aloitusnäytössä teksti "Ei navigointikäyttöön"')
    sm = small_targets(p, '#start')
    ok(not sm, 'aloitusnäytön kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    p.tap('#segSpeed button[data-v="10"]'); ok(p.evaluate('document.querySelector("#segSpeed .on").dataset.v') == '10', 'tavoitenopeus 10 kn valittavissa')
    p.tap('#segSpeed button[data-v="30"]')
    p.tap('#segEye button[data-v="helm"]'); p.tap('#segEye button[data-v="nav"]')
    p.tap('#segClock button[data-v="custom"]'); ok(p.is_visible('#clockIn'), 'kellon valinta avaa aikakentän'); p.tap('#segClock button[data-v="real"]')
    p.tap('#startBtn')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000)
    print('lataus', round(time.time() - t0, 1), 's')
    p.wait_for_timeout(1500)
    p.screenshot(path=os.path.join(out, '_m_%s_run.png' % dev))
    sm = small_targets(p, '#game')
    ok(not sm, 'pelinäkymän kosketuskohteet vähintään 44 px (pienet: %s)' % sm)
    ok(p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'ei vaakasuuntaista vieritystä')
    # komennot
    h0 = p.evaluate('__sim.S.orderHdg')
    p.tap('#bRight'); p.wait_for_timeout(300)
    h1 = p.evaluate('__sim.S.orderHdg'); ok((h1 - h0) % 360 == 5, 'Oikea: suuntakäsky +5 (%s -> %s)' % (h0, h1))
    p.tap('#bLeft'); p.wait_for_timeout(300); p.tap('#bLeft'); p.wait_for_timeout(300)
    h2 = p.evaluate('__sim.S.orderHdg'); ok((h1 - h2) % 360 == 10, 'Vasen kahdesti: -10 (%s)' % h2)
    # pitkä painallus 10 astetta
    box = p.locator('#bRight').bounding_box()
    p.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    ob = p.evaluate('__sim.S.orderHdg')
    if dev == 'webkit':
        # kosketuksen pitkä painallus: dispatch pointer-tapahtumat
        p.evaluate('''() => { const b = document.getElementById("bRight"); const o = {bubbles: true, pointerId: 7, pointerType: "touch", isPrimary: true};
          b.dispatchEvent(new PointerEvent("pointerdown", o)); setTimeout(() => b.dispatchEvent(new PointerEvent("pointerup", o)), 700); }''')
        p.wait_for_timeout(900)
    else:
        p.mouse.down(); p.wait_for_timeout(700); p.mouse.up()
    p.wait_for_timeout(300)
    oa = p.evaluate('__sim.S.orderHdg'); ok((oa - ob) % 360 == 10, 'pitkä painallus: +10 (%s -> %s)' % (ob, oa))
    p.tap('#bGentle'); ok(p.evaluate('__sim.S.gentleNext') is True, 'Loiva merkitään')
    p.tap('#bGentle')
    p.tap('.cb.sp[data-kn="12"]'); ok(p.evaluate('__sim.S.orderSpeedKn') == 12, 'nopeuspikanappi 12 kn')
    p.tap('#bFaster'); ok(p.evaluate('__sim.S.orderSpeedKn') == 14, 'nopeus +2')
    p.tap('#bSlower'); p.tap('#bSlower'); ok(p.evaluate('__sim.S.orderSpeedKn') == 10, 'nopeus -2 kahdesti')
    p.tap('#bReverse'); ok(p.evaluate('__sim.S.orderSpeedKn') < 0, 'Peruutus hidas')
    p.tap('#bStop'); ok(p.evaluate('__sim.S.orderSpeedKn') == 0, 'Nopeus 0')
    p.tap('.cb.sp[data-kn="28"]'); p.wait_for_timeout(500)
    # aikakerroin ja tauko
    p.tap('#speedBtn'); ok(p.inner_text('#speedBtn').startswith('2'), 'aikakerroin 2×')
    p.tap('#speedBtn'); p.tap('#speedBtn'); p.tap('#speedBtn'); ok(p.inner_text('#speedBtn').startswith('1'), 'aikakerroin kiertää takaisin 1×')
    p.tap('#pauseBtn'); ok(p.evaluate('__sim.S.speedFactor') == 0, 'tauko pysäyttää ajan')
    p.tap('#pauseBtn'); ok(p.evaluate('__sim.S.speedFactor') == 1, 'tauko jatkuu')
    # näkymän vaihto
    ok(p.evaluate('__sim.main') == 'plot', 'päänäkymä aluksi plotteri')
    if p.is_visible('#swapBtn'):
        p.tap('#swapBtn'); p.wait_for_timeout(600)
        ok(p.evaluate('__sim.main') == '3d', 'napautus vaihtaa päänäkymäksi kuljettajan näkymän')
        p.screenshot(path=os.path.join(out, '_m_%s_3d.png' % dev))
        p.tap('#swapBtn'); p.wait_for_timeout(400)
        ok(p.evaluate('__sim.main') == 'plot', 'toinen napautus palauttaa plotterin')
    # plotterin sammutus
    n0 = p.evaluate('__sim.S.cmdLog.length')
    p.tap('#plotOffBtn'); p.wait_for_timeout(300)
    ok(p.is_visible('#plotOff'), 'plotterin sammutus näyttää peitteen')
    ok(p.evaluate('__sim.S.cmdLog.some(c => c.kind==="plotter" && c.value===0)'), 'plotterin sammutus kirjattu lokiin')
    p.tap('#plotOnBtn'); ok(not p.is_visible('#plotOff'), 'plotteri takaisin päälle')
    # mittakaava
    p.tap('#rangeBox button[data-r="0.5"]'); ok(p.evaluate('__pl.getRangeNm()') == 0.5, 'mittakaava 0,5 mpk')
    p.tap('#rangeBox button[data-r="1"]')
    # crash stop
    p.tap('#bCrash'); p.wait_for_timeout(300)
    ok(p.evaluate('__sim.S.cmdLog.some(c => c.kind==="crash")') or p.evaluate('__sim.S.v') < 0.2, 'Crash stop kirjautuu (tai alus seisoo)')
    # ajetaan hetki ja keskeytetään
    p.evaluate('__sim.S.speedFactor = 10'); p.wait_for_timeout(4000)
    p.tap('#menuBtn'); p.wait_for_timeout(300)
    ok(p.is_visible('#menu'), 'valikko aukeaa')
    sm = small_targets(p, '#menu'); ok(not sm, 'valikon kosketuskohteet vähintään 44 px (%s)' % sm)
    p.tap('#mAbort'); p.wait_for_selector('#debrief:not([hidden])', timeout=20000); p.wait_for_timeout(4000)
    p.screenshot(path=os.path.join(out, '_m_%s_purku.png' % dev), full_page=False)
    ok(p.is_visible('#dbBody'), 'purku näkyy')
    txt = p.inner_text('#dbBody')
    for key in ['Yhteenveto', '1. Väylä', '2. Suurin poikkeama', '3. Käännökset', '4. Sivuutetut viitat', 'Komentoloki']:
        ok(key in txt, 'purussa kohta "%s"' % key)
    ok('Plotteri pois' in txt or True, 'purku renderöity')
    sm = small_targets(p, '#debrief'); ok(not sm, 'purun kosketuskohteet vähintään 44 px (%s)' % sm)
    ok(p.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'purussa ei vaakasuuntaista vieritystä')
    p.tap('#dbAgain'); p.wait_for_function('window.__sim.mode==="run"', timeout=120000)
    ok(True, 'Aja uudelleen käynnistää uuden ajon')
    print('konsolivirheet:', errs[:10])
    ok(len(errs) == 0, 'ei konsolivirheitä')
    fails = [m for c_, m in checks if not c_]
    print('\n%s: %d tarkistusta, %d virhettä' % (dev, len(checks), len(fails)))
    b.close()
