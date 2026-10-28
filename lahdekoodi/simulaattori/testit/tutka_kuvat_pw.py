"""Vaihe 3c, kriteeri 4: kuvakaappaukset hakemistoon shots/ (etuliite 3c_).
Käyttö: python3 tutka_kuvat_pw.py puhelin|tabletti|tietokone|purku|webkit"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
which = sys.argv[1] if len(sys.argv) > 1 else 'puhelin'
SIILI = (328045, 6824881)

def kaynnista(p, qs):
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&' + qs)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=100000)

def siilinkarille(p, limit=70):
    """Nopea ajo (ff 10) automaattiohjauksella, kunnes alus on alle 500 m:n päässä Siilinkarin kohdalta, sitten reaaliaika."""
    t1 = time.time()
    while time.time() - t1 < limit:
        d = p.evaluate('(()=>{const S=__sim.S,o=__sim.origin;return Math.hypot(S.x+o.e-%d,S.y+o.n-%d)})()' % SIILI)
        if d < 500: break
        p.wait_for_timeout(1000)
    p.keyboard.press('1')
    print('etäisyys Siilinkarista', round(d), 'm, v', round(p.evaluate('__sim.S.v/0.514444'), 1), 'kn', flush=True)

def tutkavalmis(p):
    p.evaluate('__radar.valmis()'); p.wait_for_timeout(11000)

with sync_playwright() as pw:
    errs = []
    if which == 'puhelin':
        b, c = chromium(pw); p = c.new_page(); collect(p, errs)
        kaynnista(p, 'auto=30&ff=10&naytot=radar')
        siilinkarille(p); tutkavalmis(p)
        p.screenshot(path=os.path.join(out, '3c_puhelin_tutka_ajo.png'))
        print(p.evaluate('JSON.stringify({v:__sim.S.v/0.514444, l:__radar.lue(), t:__radar.tilasto()})'))
    elif which == 'webkit':
        b, c = webkit(pw); p = c.new_page(); collect(p, errs)
        kaynnista(p, 'auto=30&ff=10&naytot=both')
        p.tap('#instrBtn')
        siilinkarille(p); tutkavalmis(p)
        p.screenshot(path=os.path.join(out, '3c_puhelin_webkit_tutka_ajo.png'))
    elif which == 'tabletti':
        b, c = chromium(pw, viewport={'width': 1024, 'height': 768}, screen={'width': 1024, 'height': 768}, device_scale_factor=1, is_mobile=False, has_touch=True)
        p = c.new_page(); collect(p, errs)
        kaynnista(p, 'auto=30&ff=10&naytot=both')
        p.tap('#instrBtn')
        siilinkarille(p); tutkavalmis(p)
        print(p.evaluate('JSON.stringify({wide:__sim.layout, instr:__sim.instr})'))
        p.screenshot(path=os.path.join(out, '3c_tabletti_3d_ja_tutka.png'))
    elif which == 'tietokone':
        b, c = chromium(pw, viewport={'width': 1600, 'height': 900}, screen={'width': 1600, 'height': 900}, device_scale_factor=1, is_mobile=False, has_touch=False)
        p = c.new_page(); collect(p, errs)
        kaynnista(p, 'auto=30&ff=10&naytot=both')
        siilinkarille(p); tutkavalmis(p)
        print(p.evaluate('JSON.stringify({layout:__sim.layout, instr:__sim.instr})'))
        p.screenshot(path=os.path.join(out, '3c_tietokone_kolme_ruutua.png'))
    elif which == 'purku':
        b, c = chromium(pw); p = c.new_page(); collect(p, errs)
        kaynnista(p, 'auto=30&ff=10&naytot=both')
        p.wait_for_timeout(8000)
        p.tap('#instrBtn'); p.wait_for_timeout(15000)
        p.tap('.tutka-ui [data-tutka=meny]'); p.wait_for_timeout(300); p.tap('#rOffBtn'); p.wait_for_timeout(2500); p.tap('#radarOnBtn')
        t1 = time.time()
        while time.time() - t1 < 100 and p.evaluate('__sim.mode') != 'debrief': p.wait_for_timeout(2000)
        print('tila', p.evaluate('__sim.mode'), 'ajoaika', round(time.time() - t1))
        if p.evaluate('__sim.mode') != 'debrief':
            p.tap('#menuBtn'); p.tap('#mAbort'); p.wait_for_timeout(1500)
        p.wait_for_timeout(6000)
        print(p.evaluate('JSON.stringify({vis:__analysis.radarVisPct, main:__analysis.radarMainPct, off:__analysis.radarOffSec, aika:__analysis.timeSec})'))
        p.evaluate('document.getElementById("debrief").scrollTop = 0')
        r = p.evaluate('(()=>{const e=document.querySelector("#dbBody table");return e.getBoundingClientRect().top + document.getElementById("debrief").scrollTop})()')
        p.evaluate('(y)=>{document.getElementById("debrief").scrollTop = y - 60}', r); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '3c_purku_tutkatieto.png'))
        # komentoloki
        y = p.evaluate('(()=>{const hs=[...document.querySelectorAll("#dbBody h2")].find(h=>h.textContent==="Komentoloki");return hs.getBoundingClientRect().top + document.getElementById("debrief").scrollTop})()')
        p.evaluate('(y)=>{document.getElementById("debrief").scrollTop = y - 20}', y); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '3c_purku_komentoloki.png'))
    print('virheet', errs[:5])
    b.close()
