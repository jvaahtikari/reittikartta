"""Vaihe 3d, kriteeri 7: kuljettajan näkymä navigoijan ja ruorimiehen paikalta istuen ja seisten. Kuvat shots/3d_nakyma_*.png.
Mittaa lisäksi kojelaudan osuuden kuvan korkeudesta: kuvan alaosan rivit, joilla ei ole vettä tai taivasta (rivin vesi- tai taivaspikselien osuus alle 20 %)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
W, H = (int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else '1440x900').split('x'))
t = sys.argv[2] if len(sys.argv) > 2 else '2026-10-25T10:00:00Z'
stand = sys.argv[3] if len(sys.argv) > 3 else None
prefix = sys.argv[4] if len(sys.argv) > 4 else '3d_nakyma'
res = []
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1&t=' + t)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000); p.wait_for_timeout(2500)
    if stand: p.evaluate('z => { __view.settings.eyeStandZ = z; }', float(stand))
    for eye in ('nav', 'helm'):
        for seat in (False, True):
            p.evaluate('([eye, seat]) => { __view.setEye(6.1, eye === "helm" ? __view.settings.helmEyeY : -0.75); __view.setSeat(seat); }', [eye, seat])
            p.wait_for_timeout(5000)
            name = prefix + '_%s_%s' % ('navigoija' if eye == 'nav' else 'ruorimies', 'istuen' if seat else 'seisten')
            el = p.locator('#pane3d'); path = os.path.join(out, name + '.png'); el.screenshot(path=path)
            r = p.evaluate('''() => { const c = document.querySelector('#v3 canvas'), r = c.getBoundingClientRect(), pr = document.getElementById('pane3d').getBoundingClientRect();
                return { canvas: [Math.round(r.width), Math.round(r.height)], pane: [Math.round(pr.width), Math.round(pr.height)], buf: [c.width, c.height], eyeZ: __view.camera.position.y + __view.settings.waterlineZ }; }''')
            # kojelauta: kuva luetaan WebGL-puskurista (preserve=1)
            m = p.evaluate('''() => { const c = document.querySelector('#v3 canvas'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
                const g = t.getContext('2d'); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, t.width, t.height).data, w = t.width, h = t.height; const rows = [];
                for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 4, R = d[i], G = d[i+1], B = d[i+2]; if (B > 70 && B >= R - 5) n++; } rows.push(n / (w / 4)); }
                let lastGood = -1; for (let y = h - 1; y >= 0; y--) if (rows[y] > 0.2) { lastGood = y; break; }
                return { h: h, dashRows: h - 1 - lastGood, frac: (h - 1 - lastGood) / h }; }''')
            r.update(m); r['nimi'] = name; res.append(r); print(json.dumps(r))
    print('virheet', errs[:5])
    b.close()
