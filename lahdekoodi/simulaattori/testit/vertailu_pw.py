"""Vaihe 3d, kriteeri 2: simulaattorin plotteri ja Reittikartan vektorikartta samasta paikasta (Mustalahti, 1 mpk koko kuvan korkeudella)
rinnakkain. Reittikartan index.html ajetaan oikeaa Traficomin palvelua vastaan. Näytteistää myös heksavärit."""
import sys, os, json, subprocess, time
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
from PIL import Image
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
W, H = 1000, 813       # zoomilla 15 (61,5 N) 813 px = 1852 m
RK = os.environ.get('RK', 'http://127.0.0.1:8151/index.html')
LAT, LON = 61.50686376, 23.75196703
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori/testit/plotteri_testi.html?n=1&route=0&x=0&y=0&h=0&mpk=1')
    p.wait_for_function('window.__aidsReady===true', timeout=60000)
    p.wait_for_timeout(5000)
    p.screenshot(path=os.path.join(out, '_vert_sim.png'))
    sim_px = p.evaluate('''() => { const c = document.querySelector('#plot canvas'); const g = c.getContext('2d'); const m = new Map();
      const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 16) { const k = ((d[i]<<16)|(d[i+1]<<8)|d[i+2]); m.set(k, (m.get(k)||0)+1); }
      return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(e => ['#'+e[0].toString(16).padStart(6,'0'), e[1]]); }''')
    print('sim', sim_px)
    c2 = b.new_context(viewport={'width': 1440, 'height': 920}, device_scale_factor=1)
    q = c2.new_page(); collect(q, errs)
    q.goto(RK); q.wait_for_timeout(1500)
    q.click('button:has-text("Aloita")')
    q.evaluate("App.map.setView([%f, %f], 15)" % (LAT, LON)); q.wait_for_timeout(1500)
    q.click('.mi[data-menu="view"]'); q.locator('#ctxmenu button', has_text='vektorikartta').first.click()
    q.wait_for_timeout(8000)
    q.evaluate("App.map.setView([%f, %f], 15, {animate:false})" % (LAT, LON)); q.wait_for_timeout(5000)
    q.evaluate("document.querySelectorAll('.leaflet-control, .leaflet-top, .leaflet-bottom').forEach(e => e.style.visibility = 'hidden')")
    print('vektori', q.evaluate('ChartAPI.vectorShown'))
    bb = q.evaluate("(() => { const r = App.map.getContainer().getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    print('kartta', bb)
    q.screenshot(path=os.path.join(out, '_vert_rk.png'), clip={'x': bb[0] + (bb[2] - W) / 2, 'y': bb[1] + (bb[3] - H) / 2, 'width': W, 'height': H})
    rk_px = q.evaluate('''() => { const m = new Map(); [...document.querySelectorAll('.leaflet-chart-pane canvas')].forEach(c => { const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 16) { if (d[i+3] < 250) continue; const k = ((d[i]<<16)|(d[i+1]<<8)|d[i+2]); m.set(k, (m.get(k)||0)+1); } });
      return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(e => ['#'+e[0].toString(16).padStart(6,'0'), e[1]]); }''')
    print('rk', rk_px)
    print('virheet', errs[:5])
    b.close()
a = Image.open(os.path.join(out, '_vert_sim.png')).convert('RGB'); r = Image.open(os.path.join(out, '_vert_rk.png')).convert('RGB')
im = Image.new('RGB', (a.width + r.width + 10, a.height), (255, 255, 255)); im.paste(a, (0, 0)); im.paste(r, (a.width + 10, 0))
im.save(os.path.join(out, '3d_plotteri_vs_reittikartta_mustalahti_1mpk.png'))
