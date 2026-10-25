"""Vaihe 3d, kriteeri 1: plotterin välkkyminen 30 solmun ajossa. 20 sekunnin aikana joka sekunti otetaan kuva plotterin kartta-alueesta
(plotterin canvas luetaan sivun omasta kuvasta) ja lasketaan, onko yli 90 % kuvasta yhtä väriä (tyhjä ruutu). Lisäksi joka piirtokerralla
tarkistetaan, puuttuuko näkyvältä alueelta ruutu (pl.ready() epätosi) ja kuinka monta kertaa kuva muuttui (piirtokerrat).
Käyttö: python3 valkkyminen_pw.py chromium|webkit|desktop [sivu]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'chromium'
page_url = sys.argv[2] if len(sys.argv) > 2 else SIM + 'simulaattori.html'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
JS = '''() => { const c = document.querySelector('#plot canvas'); const t = document.createElement('canvas'); const s = Math.max(1, Math.floor(c.width / 300));
  t.width = Math.floor(c.width / s); t.height = Math.floor(c.height / s); const g = t.getContext('2d', {willReadFrequently: true}); g.drawImage(c, 0, 0, t.width, t.height);
  const d = g.getImageData(0, 0, t.width, t.height).data, m = new Map(); let n = 0;
  for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 3) * 1024 + (d[i+1] >> 3) * 32 + (d[i+2] >> 3); m.set(k, (m.get(k) || 0) + 1); n++; }
  let best = 0, bk = 0; m.forEach((v, k) => { if (v > best) { best = v; bk = k; } });
  return { share: best / n, colors: m.size, w: c.width, h: c.height, ready: __pl.ready(), speed: __sim.S.v / 0.514444, x: __sim.S.x, y: __sim.S.y }; }'''
with sync_playwright() as pw:
    if dev == 'webkit': b, c = webkit(pw)
    elif dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(page_url + ('&' if '?' in page_url else '?') + 'aineisto=' + PAKETTI + '&alku=1&auto=30&ff=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.wait_for_function('window.__sim.S.v/0.514444 > 27.5', timeout=170000)
    p.evaluate('''() => { window.__miss = 0; window.__frames = 0; (function f() { window.__frames++; if (!__pl.ready()) window.__miss++; if (window.__frames < 100000) requestAnimationFrame(f); })(); }''')
    rows = []
    for i in range(20):
        r = p.evaluate(JS); rows.append(r)
        if i in (0, 10, 19): p.screenshot(path=os.path.join(out, '_valk_%s_%d.png' % (dev, i)))
        p.wait_for_timeout(1000)
    mi = p.evaluate('({miss: window.__miss, frames: window.__frames, ci: __pl.cacheInfo()})')
    empty = sum(1 for r in rows if r['share'] > 0.9)
    print(json.dumps({'laite': dev, 'tyhjia': empty, 'ruutuja': len(rows), 'suurin_osuus': max(r['share'] for r in rows), 'pienin_varimaara': min(r['colors'] for r in rows),
                      'puuttuvia_ruutuja_piirrossa': mi['miss'], 'piirtoja': mi['frames'], 'valim': mi['ci'], 'nopeus': [round(r['speed'], 1) for r in rows][::5], 'canvas': [rows[0]['w'], rows[0]['h']], 'virheet': errs[:3]}, ensure_ascii=False))
    print('shares', [round(r['share'], 2) for r in rows])
    b.close()
