"""Vaihe 3f, kriteeri 3: kompassikaistan käskymerkki. Testi antaa käskyn "Suunta 090" (Oikea-napilla 5 asteen askelin lähtösuunnasta 050),
tarkistaa, että kaistassa on vihreä merkki kohdassa 090 (sijainti lasketaan kuvakulmasta ja tarkistetaan kuvapisteistä) ja katseen merkki
(keskellä, lukema) kohdassa 050, sekä että käskysuunnan ollessa kaistan ulkopuolella reunassa on nuoli. Kuva shots/3f_kompassikaista_kasky.png.
Käyttö: python3 kasky_pw.py desktop|chromium|webkit"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)
INFO = '''() => { const cv = document.getElementById('v3compass'), g = cv.getContext('2d'), dpr = cv.width / cv.clientWidth;
  const row = (y) => g.getImageData(0, Math.round(y * dpr), cv.width, 1).data;
  // vihreän (#3ddc6f) pikselit alareunan riviltä ja ylempää riviltä
  const green = (data) => { const xs = []; for (let i = 0; i < data.length; i += 4) if (data[i] < 90 && data[i + 1] > 190 && data[i + 2] < 150 && data[i + 3] > 200) xs.push(i / 4 / dpr); return xs; };
  const yel = (data) => { const xs = []; for (let i = 0; i < data.length; i += 4) if (data[i] > 220 && data[i + 1] > 190 && data[i + 2] < 60 && data[i + 3] > 200) xs.push(i / 4 / dpr); return xs; };
  const gx = green(row(cv.clientHeight - 3)), gm = green(row(cv.clientHeight / 2)), yx = yel(row(1.5));
  const mean = a => a.length ? a.reduce((p, q) => p + q, 0) / a.length : null;
  return { w: cv.clientWidth, h: cv.clientHeight, comp: __sim.compass, ord: __sim.S.orderHdg, ordTxt: document.getElementById('ordHdg').textContent,
    look: Math.round(((__sim.S.hdg + __sim.S.conv + __view.getGazeNow()) % 360 + 360) % 360), hfov: __view.hfov(), greenX: mean(gx), greenN: gx.length, greenMidN: gm.length, greenMidX: mean(gm), yellowX: mean(yel(row(2.5))), yellowN: yel(row(2.5)).length }; }'''
with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    if dev != 'desktop': p.tap('#swapBtn'); p.wait_for_timeout(800)
    p.wait_for_timeout(2500)
    p.evaluate('document.getElementById("pauseBtn").click()')   # tauko: alus ei käänny, katse pysyy
    p.wait_for_timeout(800)
    r0 = p.evaluate(INFO)
    ok(r0['ord'] == 50 and r0['look'] == 50, '%s: lähtötilanne: käsky %d° ja katse %d° T (kaistassa %s)' % (dev, r0['ord'], r0['look'], r0['comp']))
    ok(r0['comp'] and r0['comp']['inBand'] and abs(r0['greenX'] - r0['w'] / 2) < 8 and r0['greenN'] > 0, '%s: käsky = katse: vihreä merkki keskellä katseen merkin alla (vihreä x %.1f, keskikohta %.1f, keltainen x %s)' % (dev, r0['greenX'] or -1, r0['w'] / 2, r0['yellowX']))
    tap = (lambda s: p.tap(s)) if dev != 'desktop' else (lambda s: p.click(s))
    for _ in range(8): tap('#bRight')
    p.wait_for_timeout(500)     # käskymerkin on päivityttävä heti (ei odoteta kuvia): tarkistetaan lyhyen viiveen jälkeen
    r = p.evaluate(INFO)
    ok(r['ord'] == 90 and 'Suunta 090' in r['ordTxt'], '%s: käsky on "%s" (orderHdg %d)' % (dev, r['ordTxt'], r['ord']))
    ok(r['look'] == 50, '%s: katseen merkki kohdassa %d° T' % (dev, r['look']))
    hf = math.radians(r['hfov']); k = (r['w'] / 2) / math.tan(hf / 2)
    exp = r['w'] / 2 + math.tan(math.radians(90 - r['comp']['look'])) * k
    inband = exp >= 8 and exp <= r['w'] - 8
    print('kaistan leveys', r['w'], 'vaakakuvakulma %.1f' % r['hfov'], 'odotettu x %.1f' % exp, 'tulos', json.dumps(r['comp']), flush=True)
    if inband:
        ok(r['comp']['inBand'] and abs(r['comp']['x'] - exp) < 0.6, '%s: käskymerkki kaistassa kohdassa 090 (x %.1f, odotus %.1f)' % (dev, r['comp']['x'] or -1, exp))
        ok(r['greenX'] is not None and abs(r['greenX'] - exp) < 2.0, '%s: vihreä merkki kuvapisteissä x %.1f (odotus %.1f)' % (dev, r['greenX'] or -1, exp))
    else:
        ok(not r['comp']['inBand'] and r['comp']['side'] == 1, '%s: 090 on kaistan oikean reunan ulkopuolella (kuvakulma %.0f°), reunassa nuoli oikealle (side %s)' % (dev, r['hfov'], r['comp']['side']))
        ok(r['greenMidN'] > 0, '%s: nuolen vihreitä kuvapisteitä näkyy kaistan reunassa' % dev)
    ok(r['yellowX'] is not None and abs(r['yellowX'] - r['w'] / 2) < 8, '%s: katseen merkki (keltainen) keskellä x %.1f' % (dev, r['yellowX'] or -1))
    ok(abs(r['comp']['diff'] - 40) < 0.5, '%s: käskyn ja katseen ero %.1f° (odotus 40)' % (dev, r['comp']['diff']))
    # kuva leveällä kuvakulmalla: 090 on kaistassa (hfov 110 -> reuna 55°): katse käännetty hieman oikealle (+20°), jolloin 090 on 20° vasemmalla keskeltä
    p.evaluate('__view.setGaze(20)'); p.wait_for_timeout(2500); p.evaluate('document.getElementById("v3").dispatchEvent(new Event("x"))')
    p.evaluate('document.getElementById("pauseBtn").click()'); p.wait_for_timeout(700); p.evaluate('document.getElementById("pauseBtn").click()')
    p.wait_for_timeout(600)
    r2 = p.evaluate(INFO)
    exp2 = r2['w'] / 2 + math.tan(math.radians(90 - r2['comp']['look'])) * ((r2['w'] / 2) / math.tan(math.radians(r2['hfov']) / 2))
    ok(r2['comp']['inBand'] and abs(r2['comp']['x'] - exp2) < 0.6 and r2['look'] == 70, '%s: katse 070° T, käskymerkki 090 kaistassa x %.1f (odotus %.1f), katseen merkki keskellä' % (dev, r2['comp']['x'] or -1, exp2))
    shot = os.path.join(out, '3f_kompassikaista_kasky.png' if dev == 'desktop' else '3f_kompassikaista_kasky_%s.png' % dev)
    p.locator('#pane3d').screenshot(path=shot) if dev == 'desktop' else p.screenshot(path=shot)
    # kaistan ulkopuolinen käsky: katse käännetty 60° vasemmalle, käsky 090 on kaistan oikealla puolella
    p.evaluate('__view.setGaze(-60)'); p.wait_for_timeout(2500)
    r3 = p.evaluate(INFO)
    ok(not r3['comp']['inBand'] and r3['comp']['side'] == 1 and r3['greenMidN'] > 0, '%s: katse -60°: käsky 090 kaistan oikean reunan ulkopuolella, reunassa nuoli (side %s, vihreitä pikseleitä reunan keskirivillä %d, x %.0f)' % (dev, r3['comp']['side'], r3['greenMidN'], r3['greenMidX'] or -1))
    p.screenshot(path=os.path.join(out, '3f_kompassikaista_kasky_reunanuoli%s.png' % ('' if dev == 'desktop' else '_' + dev))) if dev != 'desktop' else p.locator('#pane3d').screenshot(path=os.path.join(out, '3f_kompassikaista_kasky_reunanuoli.png'))
    ok(not errs, '%s: ei konsolivirheitä (%s)' % (dev, errs[:3]))
    b.close()
bad = [m for okk, m in checks if not okk]
print('YHTEENSÄ', len(checks), 'tarkistusta,', len(bad), 'virhettä')
sys.exit(1 if bad else 0)
