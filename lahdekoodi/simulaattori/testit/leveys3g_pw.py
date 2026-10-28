"""Vaihe 3g, kriteeri 2: viitan piirretty leveys laitepikseleinä eri etäisyyksillä, paljain silmin ja kiikarilla.
Testi käyttää oikeaa Nakyma-moottoria (testit/nakyma_testi.html, vapaa kamera) ja oikeaa merkkimoduulia. Viitta (nl 2, vihreä, 2 m korkea, 0,225 m leveä)
asetetaan taivasta vasten (ei veden väreilyä), ja jokainen etäisyys piirretään kahdesti, viitan kanssa ja ilman. Kuvien erotuksesta luetaan viitan pikselit:
  px = pikselien lukumäärä viitan keskiosan rivillä, joissa erotus on yli kynnyksen (mediaani riveittäin),
  peitto = suurin erotus jaettuna lähikuvan (30 m) suurimmalla erotuksella, eli arvio piirretyn viitan peittävyydestä (1 = täysi väri).
Piirtopuskuri on laitepikselin kokoinen (pb=1.4 ja ikkuna 1000 x 600, laitepikselisuhde 1).
Käyttö: python3 leveys3g_pw.py [osoite, oletus http://127.0.0.1:8154/] [leveys=1000] [korkeus=600] [pb=1.4]
Peitto-arvio ja pikselit lasketaan piirtopuskurin pikseleinä. Kun puskuri on laitepikseliä karkeampi (pb pieni), laitepikselit = puskuripikselit x (css-leveys / puskurin leveys)."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1] if len(sys.argv) > 1 and '=' not in sys.argv[1] else SIM
kw = dict(x.split('=', 1) for x in sys.argv[1:] if '=' in x)
W, H = int(kw.get('leveys', 1000)), int(kw.get('korkeus', 600)); PB = kw.get('pb', '1.4')
JS = r"""
(args) => {
  const view = window.__view, THREE = window.THREE;
  const D = args.d, bino = args.bino, hup = args.hup;
  const cv = view.canvas, w = cv.width, h = cv.height;
  const grp = window.__testGrp || (window.__testGrp = (() => {
    const g = Merimerkit3D.luoInstanssit([{ turvalaite: { tyyppi: 'Viitta', alityyppi: 'KELLUVA', navigointilaji: 2, valaistu: 'E' }, x: 0, y: 0, z: 0 }], { ylos: 'y', tulostaLoki: false });
    view.scene.add(g); return g; })());
  // viitta D metrin päähän pohjoiseen ja kameran tason yläpuolelle kulmaan hup (aste), jotta taustana on taivas
  const camY = 5, up = D * Math.tan(hup * Math.PI / 180);
  const inst = grp.children[0].children[0];
  const m = new THREE.Matrix4().makeTranslation(0, D, up - 0.0);   // malli z ylös -koordinaatistossa: (itä, pohjoinen, ylös)
  inst.setMatrixAt(0, m); inst.instanceMatrix.needsUpdate = true;
  grp.position.set(0, camY, 0);
  const st = { x: 0, y: 0, hdg: 0, v: 0, roll: 0, trim: 0 };
  view.rig.visible = false;
  view.setBinoculars(!!bino);
  view.setFree([0, camY, 0], [0, camY + up, -D], 0);
  const sel = document.createElement('canvas'); sel.width = w; sel.height = h; const g2 = sel.getContext('2d');
  function shot(vis) { grp.visible = vis; view.render(st, 1e-6); g2.drawImage(cv, 0, 0); return g2.getImageData(0, 0, w, h).data; }
  const fovR0 = view.camera.fov * Math.PI / 180, pxm0 = 2 * Math.tan(fovR0 / 2) / h * D;   // metriä per puskuripikseli viitan kohdalla
  const bgd = shot(false);
  // viitta piirretään N sivuttaissiirrolla (0 ... 1 pikseliä), ja pikselimäärä keskiarvoistetaan, jotta rasteroinnin hyppäykset (ei antialiasia) eivät vääristä leveyttä
  const N = args.n || 6, thr = 6;
  let peak = 0, sumCount = 0, nRows = 0, bbox = null, cnts = [];
  for (let k = 0; k < N; k++) {
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(pxm0 * k / N, D, up)); inst.instanceMatrix.needsUpdate = true;
    const a = shot(true);
    let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1; const rows = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.max(Math.abs(a[i] - bgd[i]), Math.abs(a[i + 1] - bgd[i + 1]), Math.abs(a[i + 2] - bgd[i + 2]));
      if (d > peak) peak = d;
      if (d > thr) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); (rows[y] = rows[y] || []).push(x); }
    }
    if (maxx >= 0) {
      const ys = Object.keys(rows).map(Number).sort((p, q) => p - q), lo = Math.floor(ys.length * 0.25), hi = Math.ceil(ys.length * 0.75);
      const cs = ys.slice(lo, hi).map(y => rows[y].length); const m = cs.reduce((p, q) => p + q, 0) / Math.max(1, cs.length);
      cnts.push(m); if (!bbox) bbox = [minx, miny, maxx, maxy];
    } else cnts.push(0);
  }
  const medianPx = cnts.reduce((p, q) => p + q, 0) / cnts.length, maxx = bbox ? 1 : -1;
  // todellinen leveys laitepikseleinä: 0,225 m / (D x pikselikoko)
  const fovR = view.camera.fov * Math.PI / 180, pxm = 2 * Math.tan(fovR / 2) / h * D;
  const kerr = cv.clientWidth / cv.width;   // laitepikseleitä (dpr 1) per puskuripikseli
  const o = { d: D, kerr: kerr, laite_px: medianPx * kerr, puskuri: [cv.width, cv.height], bino: !!bino, fov: view.camera.fov, hfov: view.hfov(), px: Math.round(medianPx * 100) / 100, bbox: bbox, vaiheet: cnts, peak: peak, pikselikoko_m: pxm, todellinen_px: 0.225 * kerr / pxm, visible: maxx >= 0 };
  return o;
}
"""
res = []
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori/testit/nakyma_testi.html?pb=%s&t=2026-10-25T10:00:00Z' % PB)
    p.wait_for_function('window.__view && window.__view.renderer', timeout=120000)
    p.evaluate('window.__free = null')
    p.wait_for_timeout(2000)
    ref = p.evaluate(JS, {'d': 30, 'bino': False, 'hup': 8, 'n': 1})
    print('lähikuva 30 m', json.dumps(ref))
    for D, bino in [(100, False), (300, False), (500, False), (800, False), (1000, False), (1150, False), (1500, False),
                    (1500, True), (3000, True), (6000, True), (8000, True)]:
        r = p.evaluate(JS, {'d': D, 'bino': bino, 'hup': 8, 'n': 6})
        r['peitto'] = round(r['peak'] / max(1, ref['peak']), 2)
        res.append(r)
        print('%5d m %-9s puskuripx %s (laitepx %.2f)  peitto %.2f  todellinen %.2f laitepx  kuvakulma %.2f° (vaaka %.2f°)  bbox %s' % (D, 'kiikari' if bino else 'silmin', r['px'], r['laite_px'], r['peitto'], r['todellinen_px'], r['fov'], r['hfov'], r['bbox']), flush=True)
    print('virheet', errs[:5])
    json.dump({'ikkuna': [W, H], 'pb': PB, 'ref': ref, 'tulokset': res}, open(os.path.join(os.path.dirname(__file__), 'tulos_3g_leveys_%dx%d.json' % (W, H)), 'w'), indent=1)
    b.close()
