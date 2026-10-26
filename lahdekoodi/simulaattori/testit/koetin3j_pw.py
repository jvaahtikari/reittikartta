"""Vaihe 3j: koetin. Ottaa maastoverkon korkeuden ja peiteteksturin värin pisteiden jonosta (säteenheitto alaspäin vain maastoverkkoon).
Käyttö: python3 koetin3j_pw.py <sim-osoite> <E0> <N0> <E1> <N1> [askel=3] [nofix=1] [ruudukko=1]
Ruudukko: E0..E1 x N0..N1 -suorakulmio, tulostaa vain pisteet, joissa verkko on vedenpinnan yläpuolella (y > -0,02) ja väri on sininen."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; E0, N0, E1, N1 = [float(x) for x in sys.argv[2:6]]
kw = dict(x.split('=', 1) for x in sys.argv[6:] if '=' in x); ST = float(kw.get('askel', 3))
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    p = b.new_context(viewport={'width': 640, 'height': 360}).new_page(); errs = []; collect(p, errs)
    if kw.get('nofix'): p.add_init_script('window.__maastoNoFix=true;')
    p.goto(base + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=0&budget=14&pb=0.3&aineisto=%s' % ((E0 + E1) / 2, (N0 + N1) / 2, PAKETTI))
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=300000)
    for _ in range(240):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle()'): break
    p.wait_for_timeout(2000)
    if kw.get('ruudukko'):
        r = p.evaluate('''([E0, N0, E1, N1, st]) => {
          const out = [], ms = [];
          __view.terrain.group.children.forEach(m => { if (m.userData && m.userData.node && m === m.userData.node.mesh) { m.updateMatrixWorld(true); ms.push(m); } });
          let tot = 0, up = 0;
          for (let E = E0; E <= E1; E += st) for (let N = N0; N <= N1; N += st) {
            const w = Paikka.enToWorld(E, N), rc = new THREE.Raycaster(new THREE.Vector3(w.x, 900, -w.y), new THREE.Vector3(0, -1, 0), 0, 2000), hit = rc.intersectObjects(ms, false);
            if (!hit.length) continue; tot++;
            const h = hit[0], img = h.object.material.map.image, uv = h.uv, px = Math.min(img.width - 1, Math.floor(uv.x * img.width)), py = Math.min(img.height - 1, Math.floor((1 - uv.y) * img.height));
            const d = img.getContext('2d').getImageData(px, py, 1, 1).data;
            if (h.point.y > -0.02) { up++; if (d[2] > d[0] + 30) out.push([Math.round(E), Math.round(N), h.object.userData.node.z, +h.point.y.toFixed(2), d[0], d[1], d[2]]); }
          }
          return JSON.stringify({tot, up, sini: out.length, esim: out.slice(0, 40)});
        }''', [E0, N0, E1, N1, ST])
        print(r); b.close(); sys.exit(0)
    n = int(math.hypot(E1 - E0, N1 - N0) / ST)
    r = p.evaluate('''([E0, N0, E1, N1, n]) => {
      const out = [], ms = [];
      __view.terrain.group.children.forEach(m => { if (m.userData && m.userData.node && m === m.userData.node.mesh) { m.updateMatrixWorld(true); ms.push(m); } });
      for (let i = 0; i <= n; i++) {
        const E = E0 + (E1 - E0) * i / n, N = N0 + (N1 - N0) * i / n, w = Paikka.enToWorld(E, N);
        const rc = new THREE.Raycaster(new THREE.Vector3(w.x, 900, -w.y), new THREE.Vector3(0, -1, 0), 0, 2000), hit = rc.intersectObjects(ms, false);
        if (!hit.length) { out.push([i, null]); continue; }
        const h = hit[0], nd = h.object.userData.node, img = h.object.material.map.image, uv = h.uv;
        const px = Math.min(img.width - 1, Math.floor(uv.x * img.width)), py = Math.min(img.height - 1, Math.floor((1 - uv.y) * img.height));
        const d = img.getContext('2d').getImageData(px, py, 1, 1).data;
        out.push([i, Math.round(E), Math.round(N), nd.z, +(h.point.y).toFixed(2), d[0], d[1], d[2]]);
      }
      return JSON.stringify(out);
    }''', [E0, N0, E1, N1, n])
    for row in json.loads(r): print(row)
    print('virheet', errs[:3]); b.close()
