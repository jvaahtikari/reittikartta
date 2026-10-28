"""Vaihe 3k, mobiilin käytettävyys: peruutusnapit, Perä vasen / Perä oikea / Suoraan ja törmäysbanneri (Jatka, Purku) iPhonen WebKitissä (iPhone 14) ja Pixelin Chromiumissa (Pixel 7).
Tarkistaa kosketuskohteet (vähintään 44 px), tekstien mahtuminen, vaakavierityksen puuttumisen ja konsolivirheet sekä ottaa kuvat.
Käyttö: SIM=... PAKETTI=... python3 peruutus_mobiili_pw.py [--webkit | --chromium]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
which = 'webkit' if '--webkit' in sys.argv else 'chromium' if '--chromium' in sys.argv else 'both'
fails = []
def ok(c, m):
    print(('OK    ' if c else 'VIRHE ') + m, flush=True)
    if not c: fails.append(m)

def run(name, make):
    with sync_playwright() as pw:
        b, c = make(pw)
        p = c.new_page(); errs = []; collect(p, errs)
        p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&ff=3&t=2026-10-26T10:00:00Z')
        p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
        p.evaluate('window.__adaptOff=true')
        vp = p.viewport_size; print(name, 'näkymä', vp, flush=True)
        def boxes(sel):
            return p.evaluate('''(sel) => Array.from(document.querySelectorAll(sel)).map(b => { const r = b.getBoundingClientRect(), l = b.querySelector('.lbl') || b;
                return { id: b.id || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), vis: r.width > 0 && r.height > 0, clip: l.scrollWidth > l.clientWidth + 1, txt: l.textContent.trim() }; })''', sel)
        # peruutus päälle napilla
        p.tap('#bReverse'); p.wait_for_timeout(700)
        ok(p.evaluate('__sim.S.orderSpeedKn') == -2, name + ': Peruutus 2 -napin napautus antaa käskyn -2 kn')
        p.tap('#bReverse4'); p.wait_for_timeout(500)
        ok(p.evaluate('__sim.S.orderSpeedKn') == -4, name + ': Peruutus 4 -napin napautus antaa käskyn -4 kn')
        p.wait_for_timeout(2500)
        bx = boxes('#cmd .cb')
        for r in bx:
            ok(r['vis'] and r['h'] >= 44 and r['w'] >= 44, '%s: nappi "%s" %dx%d px (vähintään 44)' % (name, r['txt'], r['w'], r['h']))
            ok(not r['clip'], '%s: nappi "%s" teksti mahtuu' % (name, r['txt']))
            ok(r['x'] >= 0 and r['x'] + r['w'] <= vp['width'] and r['y'] + r['h'] <= vp['height'] + 1, '%s: nappi "%s" näkyy ruudulla (x %d, y %d)' % (name, r['txt'], r['x'], r['y']))
        txt = [r['txt'] for r in bx]
        ok('Perä vasen' in txt and 'Perä oikea' in txt and 'Suoraan' in txt and 'Peruutus 2' in txt and 'Peruutus 4' in txt, name + ': napit peruutuksessa: %s' % txt)
        ok(p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': ei vaakavieritystä')
        p.screenshot(path=os.path.join(out, '3k_mobiili_%s_peruutus.png' % name))
        # Perä vasen napautuksella
        p.tap('#bLeft'); p.wait_for_timeout(500)
        ok(p.evaluate('__sim.S.sternTurn') == 'vasen' and 'Perä vasen' in p.inner_text('#ordHdg'), name + ': Perä vasen -napin napautus: käsky "%s"' % p.inner_text('#ordHdg'))
        p.tap('#bRight'); p.wait_for_timeout(500)
        ok(p.evaluate('__sim.S.sternTurn') == 'oikea', name + ': Perä oikea -napin napautus')
        p.tap('#bGentle'); p.wait_for_timeout(500)
        ok(p.evaluate('__sim.S.sternTurn') is None and p.inner_text('#ordHdg').startswith('Suunta'), name + ': Suoraan-napin napautus: käsky "%s"' % p.inner_text('#ordHdg'))
        # eteenpäin: napit palaavat Vasen / Loiva / Oikea
        p.tap('#bStop')
        try: p.wait_for_function('document.querySelector("#bLeft .lbl").textContent === "Vasen"', timeout=15000)
        except Exception: pass
        txt = [r['txt'] for r in boxes('#cmd .cb')]
        ok('Vasen' in txt and 'Loiva' in txt and 'Oikea' in txt, name + ': Nopeus 0: napit Vasen, Loiva ja Oikea takaisin (%s)' % txt[:3])
        # törmäysbanneri (koekutsu: törmäys 6 kn)
        p.evaluate('''() => { const S = __sim.S; __sim.onCollision({ kind: 'laituri', type: 'tormays', kn: 6, x: S.x, y: S.y }); }''')
        p.wait_for_timeout(800)
        bb = boxes('#groundBanner .big')
        ok(len(bb) == 2 and all(r['vis'] and r['h'] >= 44 and r['w'] >= 44 for r in bb), '%s: bannerin napit %s' % (name, [(r['txt'], r['w'], r['h']) for r in bb]))
        ok(p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': banneri ei aiheuta vaakavieritystä')
        ok(not p.evaluate('document.getElementById("groundBanner").hidden') and 'Törmäys laituriin 6,0 kn' in p.inner_text('#groundText'), name + ': banneri "%s"' % p.inner_text('#groundText'))
        p.screenshot(path=os.path.join(out, '3k_mobiili_%s_tormays.png' % name))
        p.tap('#groundGo'); p.wait_for_timeout(500)
        ok(p.evaluate('__sim.frozen') is False and p.evaluate('document.getElementById("groundBanner").hidden'), name + ': Jatka napautuksella palauttaa ajon')
        p.evaluate('''() => { const S = __sim.S; __sim.onCollision({ kind: 'kivi', type: 'tormays', kn: 3.5, x: S.x, y: S.y }); }''')
        p.tap('#groundBtn'); p.wait_for_selector('#debrief:not([hidden])', timeout=30000); p.wait_for_timeout(1500)
        rows = p.evaluate('Array.from(document.querySelectorAll("#dbCollisions tbody tr")).map(r => r.innerText.replace(/\\s+/g, " "))')
        ok(len(rows) == 2 and 'Kivi' in rows[1] or len(rows) == 2 and 'Vesikivi' in rows[1], name + ': purun törmäystaulukko %s' % rows)
        ok(p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), name + ': purku ei vierity vaakasuunnassa')
        p.evaluate('document.getElementById("dbCollisions").scrollIntoView({block: "center"})'); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '3k_mobiili_%s_purku.png' % name))
        print(name, 'virheet', errs[:5]); ok(not [e for e in errs if 'favicon' not in e[1]], name + ': ei konsolivirheitä')
        b.close()

if which in ('chromium', 'both'): run('pixel', chromium)
if which in ('webkit', 'both'): run('iphone', webkit)
print('VIRHEITÄ %d' % len(fails) if fails else 'Kaikki läpi', flush=True)
sys.exit(1 if fails else 0)
