"""Vaihe 3e: tutkan viritysvalinta simulaattorissa. Tarkistaa valikon valinnan (oletus hyvä), komentolokin merkinnän, tutkan tilan ja asetuksen muistin,
ja ottaa kuvat shots/3e_*.png (leveä 1440x900 tutkalla, puhelin WebKit iPhone 14 tutkanäkymässä, valikko).
Käyttö: python3 tutka_viritys_pw.py"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

def kaynnista(p, qs):
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1&' + qs)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)

with sync_playwright() as pw:
    # leveä asettelu, plotteri + 3D + tutka
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    kaynnista(p, 'naytot=both')
    p.evaluate('__radar.valmis()'); p.wait_for_function('__radar.tilasto().sateita >= 1300', timeout=60000); p.wait_for_timeout(500)   # vähintään kaksi täyttä kierrosta (2 x 600 sädettä)
    ok(p.evaluate('__radar.tila().viritys') == 'hyva', 'oletusviritys on hyvä')
    ok(p.evaluate('document.getElementById("mTune").textContent') == 'Tutkan viritys: hyvä', 'valikon teksti: hyvä')
    p.screenshot(path=os.path.join(out, '3e2_asettelu_1440x900_tutkalla.png'))
    p.click('#menuBtn') if p.query_selector('#menuBtn') else p.evaluate('document.getElementById("menu").hidden=false')
    p.wait_for_timeout(300)
    p.screenshot(path=os.path.join(out, '3e2_valikko_viritys.png'))
    n0 = p.evaluate('__sim.S.cmdLog.length')
    p.evaluate('document.getElementById("mTune").click()'); p.wait_for_timeout(300)
    ok(p.evaluate('document.getElementById("mTune").textContent') == 'Tutkan viritys: huono', 'valikon teksti vaihtuu: huono')
    ok(p.evaluate('__radar.tila().viritys') == 'huono', 'tutkan tila: huono')
    last = p.evaluate('__sim.S.cmdLog[__sim.S.cmdLog.length-1]')
    ok(p.evaluate('__sim.S.cmdLog.length') == n0 + 1 and last['kind'] == 'tutkaviritys' and last['value'] == 0, 'komentolokiin kirjautui tutkaviritys 0 (%s)' % json.dumps({k: last[k] for k in ('kind', 'value')}))
    ok(p.evaluate('JSON.parse(localStorage.getItem("sim.asetukset")).radarTune') == 'huono', 'asetus tallentui muistiin')
    p.evaluate('document.getElementById("menu").hidden=true'); n1 = p.evaluate('__radar.tilasto().sateita'); p.wait_for_function('__radar.tilasto().sateita >= %d' % (n1 + 400), timeout=60000)
    p.screenshot(path=os.path.join(out, '3e2_asettelu_1440x900_tutkalla_huono.png'))
    p.evaluate('document.getElementById("mTune").click()'); p.wait_for_timeout(300)
    ok(p.evaluate('__radar.tila().viritys') == 'hyva' and p.evaluate('__sim.S.cmdLog[__sim.S.cmdLog.length-1].value') == 1, 'takaisin hyvään ja loki value 1')
    p.evaluate('document.getElementById("mTune").click()'); p.evaluate('document.getElementById("mTune").click()')
    ok(not errs, 'konsolivirheet: %s' % errs)
    b.close()
    # puhelin WebKit iPhone 14, tutkanäkymä
    b, c = webkit(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    kaynnista(p, 'naytot=radar')
    p.evaluate('__radar.valmis()'); p.wait_for_function('__radar.tilasto().sateita >= 1300', timeout=90000); p.wait_for_timeout(500)
    ok(p.evaluate('__radar.tila().viritys') == 'hyva', 'WebKit: oletusviritys hyvä')
    p.screenshot(path=os.path.join(out, '3e2_puhelin_webkit_tutka.png'))
    ok(not errs, 'WebKit konsolivirheet: %s' % errs)
    b.close()
bad = [m for k, m in checks if not k]
print('YHTEENSÄ', len(checks), 'tarkistusta, virheitä', len(bad))
