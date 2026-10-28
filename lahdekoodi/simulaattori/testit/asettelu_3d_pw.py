"""Vaihe 3d, kriteerit 4 ja 5: leveä asettelu (deck) koissa 1024x768, 1366x768, 1440x900 ja 1920x1080, tabletti pystyssä 768x1024, puhelin pystyssä (Pixel 7).
Mitataan: 3D-ikkuna ylhäällä noin 60 % korkeudesta koko leveydeltä, plotteri, tutka ja komennot rivissä alla (komennot oikealla), 3D-canvas täyttää ikkunansa,
kosketuskohteet vähintään 44 px, ei vaakavieritystä. Kuvat shots/3d_asettelu_*.png. Käyttö: python3 asettelu_3d_pw.py [koot...]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
SMALL = '''() => { const o = []; document.querySelectorAll('#game button, #game input').forEach(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return; let q = b, hid = false; while (q && q !== document.body) { if (q.hidden || getComputedStyle(q).display === 'none') { hid = true; break; } q = q.parentElement; } if (hid) return;
    if (r.width < 43.5 || r.height < 43.5) o.push((b.id || b.getAttribute('data-tutka') || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); return o; }'''
BOX = '''() => { const g = id => { const e = document.querySelector(id); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none') return null; const r = e.getBoundingClientRect(); return r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
  const cv = document.querySelector('#v3 canvas'); return { layout: document.getElementById('game').className, p3: g('#pane3d'), pp: g('#paneP'), pr: g('#paneR'), cmd: g('#cmd'), cv: cv ? [cv.clientWidth, cv.clientHeight, cv.width, cv.height] : null, vp: [innerWidth, innerHeight], sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; }'''
SIZES = [('1024x768', 1024, 768), ('1366x768', 1366, 768), ('1440x900', 1440, 900), ('1920x1080', 1920, 1080), ('tabletti_768x1024', 768, 1024)]
only = sys.argv[1:]
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    for name, W, H in SIZES + [('puhelin', 0, 0)]:
        if only and name not in only: continue
        if W: c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=(name.startswith('tabletti')))
        else:
            dev = pw.devices['Pixel 7']; c = b.new_context(**dev)
        for disp in (['both', 'plot'] if W else ['plot']):
            p = c.new_page(); errs = []; collect(p, errs)
            p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1&naytot=' + disp)
            p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
            p.wait_for_timeout(3500)
            r = p.evaluate(BOX); tag = '%s/%s' % (name, disp)
            if W and name != 'tabletti_768x1024':
                ok('deck' in r['layout'].split(), '%s: asettelu deck (%s)' % (tag, r['layout']))
                p3 = r['p3']; ok(p3[0] == 0 and abs(p3[2] - W) <= 1 and 0.55 <= p3[3] / (H - 48) <= 0.66, '%s: 3D ylhäällä koko leveydeltä, korkeus %d px = %.0f %% päänäytöstä' % (tag, p3[3], 100 * p3[3] / (H - 48)))
                ok(r['pp'] and r['pp'][1] >= p3[1] + p3[3] - 2 and r['cmd'][1] >= p3[1] + p3[3] - 2, '%s: plotteri ja komennot 3D:n alla' % tag)
                ok(r['cmd'][0] >= r['pp'][0] + r['pp'][2] - 2, '%s: komennot plotterin oikealla puolella' % tag)
                if disp == 'both': ok(r['pr'] and r['pr'][0] >= r['pp'][0] + r['pp'][2] - 2 and r['pr'][0] + r['pr'][2] <= r['cmd'][0] + 2, '%s: tutka plotterin ja komentojen välissä' % tag)
                else: ok(r['pr'] is None, '%s: tutka pois, plotteri ja komennot jakavat rivin (plotterin leveys %d, komennot %d)' % (tag, r['pp'][2], r['cmd'][2]))
            elif name == 'tabletti_768x1024':
                ok('deck' in r['layout'].split() and 'tp' in r['layout'].split(), '%s: asettelu %s' % (tag, r['layout']))
                ok(r['cmd'][1] >= r['pp'][1] + r['pp'][3] - 2, '%s: komennot rivin alla' % tag)
            else:
                ok('deck' not in r['layout'].split(), '%s: puhelin pystyssä, asettelu %s' % (tag, r['layout']))
            cv = r['cv']; ok(cv and abs(cv[0] - r['p3'][2]) <= 6 and abs(cv[1] - r['p3'][3]) <= 6, '%s: 3D-canvas täyttää ikkunansa (%s vs %s)' % (tag, cv[:2] if cv else None, r['p3'][2:]))
            ok(r['sw'] <= r['vp'][0] + 1, '%s: ei vaakavieritystä' % tag)
            sm = p.evaluate(SMALL); ok(not sm, '%s: kosketuskohteet vähintään 44 px (pienet: %s)' % (tag, sm))
            p.screenshot(path=os.path.join(out, '3d_asettelu_%s%s.png' % (name, '_tutkalla' if disp == 'both' else '')))
            ok(not errs, '%s: ei konsolivirheitä (%s)' % (tag, errs[:2]))
            p.close()
        c.close()
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
