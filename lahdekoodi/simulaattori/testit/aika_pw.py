"""Vaihe 3d, kriteeri 4: aloitusnäytön oletusaika (valittu päivä klo 12.00), yöhuomautus ja tumma näkymä yöajalla.
Kuvat: 3d_aloitus_oletus_1440.png (aloitusnäyttö), 3d_naistenlahti_oletusaika.png (ajo oletusajalla, keula 050 kohti Naistenlahtea),
3d_aloitus_yo.png (valittu 22.00), 3d_nakyma_yo.png. Käyttö: python3 aika_pw.py"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&preserve=1')
    p.wait_for_selector('#startBtn', timeout=30000)
    seg = p.evaluate('document.querySelector("#segClock .on").dataset.v'); tm = p.evaluate('document.getElementById("clockIn").value'); dt = p.evaluate('document.getElementById("dateIn").value')
    hint = p.evaluate('document.getElementById("clockHint").textContent')
    ok(seg == 'custom' and tm == '12:00', 'oletus on Valittu aika, kello %s, päivä %s' % (tm, dt))
    ok(hint.startswith('Päivänäkymä'), 'vihje oletusajalla: %s' % hint)
    p.screenshot(path=os.path.join(out, '3d_aloitus_oletus_1440.png'))
    p.tap('#startBtn') if False else p.click('#startBtn')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_timeout(5000)
    clk = p.evaluate('new Date(__sim.S.clockMs).toLocaleTimeString("fi-FI",{timeZone:"Europe/Helsinki"})')
    ok(clk.startswith('12.00') or clk.startswith('12:00'), 'ajon kello oletuksena %s' % clk)
    p.screenshot(path=os.path.join(out, '3d_naistenlahti_oletusaika.png'))
    lum = p.evaluate('''() => { const c = document.querySelector('#v3 canvas'); const t = document.createElement('canvas'); t.width = 64; t.height = 32; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 32);
        const d = g.getImageData(0, 0, 64, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i+1] + d[i+2]) / 3; return s / (d.length / 4); }''')
    print('3D keskikirkkaus päivällä', round(lum, 1))
    # yö
    p2 = c.new_page(); collect(p2, errs)
    p2.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&preserve=1')
    p2.wait_for_selector('#startBtn', timeout=30000)
    p2.fill('#clockIn', '22:00'); p2.dispatch_event('#clockIn', 'input'); p2.wait_for_timeout(300)
    h2 = p2.evaluate('document.getElementById("clockHint").textContent')
    ok('auringonlaskun jälkeen' in h2 and 'Yönäkymä tulee myöhemmässä vaiheessa' in h2 and 'tumma' in h2, 'yövihje: %s' % h2)
    p2.screenshot(path=os.path.join(out, '3d_aloitus_yo.png'))
    p2.click('#startBtn'); p2.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000); p2.wait_for_timeout(4000)
    lum2 = p2.evaluate('''() => { const c = document.querySelector('#v3 canvas'); const t = document.createElement('canvas'); t.width = 64; t.height = 32; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 32);
        const d = g.getImageData(0, 0, 64, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i+1] + d[i+2]) / 3; return s / (d.length / 4); }''')
    ok(lum2 < lum * 0.5, '3D-näkymä on tumma yöllä: kirkkaus %.1f vs päivä %.1f' % (lum2, lum))
    p2.screenshot(path=os.path.join(out, '3d_nakyma_yo.png'))
    ok(not errs, 'ei konsolivirheitä (%s)' % errs[:3])
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
