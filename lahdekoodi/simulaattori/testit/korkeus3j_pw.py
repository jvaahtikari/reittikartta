"""Vaihe 3j, kriteeri 2: korkeustarkistus. Pispalanharjun korkein kohta ja Näsinneulan juuri: piirrettävä maastoverkko (säteenheitto alaspäin vain maastoverkon pintaan, ei latvuskuoreen)
verrattuna korkeusmallin ruutuun (maasto.pmtiles z14, bilinear) ja tunnettuun arvoon (Pispalanharju noin 160 m N2000, Näsinneulan juuri 109,16 m maamerkit.json-tiedostosta).
Kamera siirretään eri etäisyyksille (250 m, 1 km, 3 km, 6 km), jolloin kohta piirtyy eri zoom-tasoilla (z16 ... z12).
Käyttö: python3 korkeus3j_pw.py <sim-osoite> <tunniste>. Tulos tulostetaan ja tallennetaan shots/korkeus3j_<tunniste>.json."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base, tag = sys.argv[1], sys.argv[2]
ULOS = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 640, 'height': 360}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori/testit/nakyma_testi.html?e=325200&n=6823150&h=0&budget=14&pb=0.3&aineisto=' + PAKETTI)
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=300000)
    p.evaluate('''() => {
      window.demAt = async (E, N) => {
        const ll = Paikka.enToLonLat(E, N), t = Paikka.lonlatToTile(ll.lon, ll.lat, 14), tx = Math.floor(t.x), ty = Math.floor(t.y);
        const img = await Aineisto.png('dem', 14, tx, ty); if (!img) return null;
        const h = Aineisto.terrainHeights(img), W = img.w, H = img.h;
        let px = (t.x - tx) * W - 0.5, py = (t.y - ty) * H - 0.5; px = Math.max(0, Math.min(W - 1, px)); py = Math.max(0, Math.min(H - 1, py));
        const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = px - x0, fy = py - y0;
        return (h[y0 * W + x0] * (1 - fx) + h[y0 * W + x1] * fx) * (1 - fy) + (h[y1 * W + x0] * (1 - fx) + h[y1 * W + x1] * fx) * fy;
      };
      window.meshAt = (E, N) => {
        const w = Paikka.enToWorld(E, N), rc = new THREE.Raycaster(new THREE.Vector3(w.x, 900, -w.y), new THREE.Vector3(0, -1, 0), 0, 2000);
        const ms = []; __view.terrain.group.children.forEach(m => { if (m.userData && m.userData.node && m === m.userData.node.mesh) { m.updateMatrixWorld(true); ms.push(m); } });
        const hit = rc.intersectObjects(ms, false);
        return hit.length ? { y: hit[0].point.y + 95.5, z: hit[0].object.userData.node.z } : null;
      };
      window.shellAt = (E, N) => {
        const w = Paikka.enToWorld(E, N), rc = new THREE.Raycaster(new THREE.Vector3(w.x, 900, -w.y), new THREE.Vector3(0, -1, 0), 0, 2000);
        const ms = []; __view.terrain.group.children.forEach(m => { if (m.userData && m.userData.node && m === m.userData.node.shell && m.visible) { m.updateMatrixWorld(true); ms.push(m); } });
        const hit = rc.intersectObjects(ms, false);
        return hit.length ? hit[0].point.y + 95.5 : null;
      };
    }''')
    # Pispalanharjun korkein kohta korkeusmallista: haku 600 m:n alueelta pisteen (325200, 6823150) ympäriltä
    top = p.evaluate('''async () => { let best = null; for (let dE = -600; dE <= 600; dE += 40) for (let dN = -600; dN <= 600; dN += 40) { const h = await demAt(325200 + dE, 6823150 + dN); if (h != null && (!best || h > best.h)) best = { E: 325200 + dE, N: 6823150 + dN, h }; } return best; }''')
    print('Pispalanharjun korkein DEM-kohta', json.dumps(top), flush=True)
    targets = {'Pispalanharju': (top['E'], top['N'], 160.0), 'Nasinneulan_juuri': (326711.4, 6823363.8, 109.16)}
    out = {}
    for name, (E, N, known) in targets.items():
        for d in (250, 1000, 3000, 6000):
            # kamera d metrin päähän kohteesta idän suuntaan
            p.evaluate('([E,N,d]) => { const w = Paikka.enToWorld(E + d, N); __state.x = w.x; __state.y = w.y; }', [E, N, d])
            p.wait_for_timeout(1500)
            for _ in range(240):
                p.wait_for_timeout(1000)
                if p.evaluate('__view.terrain.idle()'): break
            p.wait_for_timeout(1500)
            r = p.evaluate('async ([E,N]) => ({ mesh: meshAt(E, N), tile: await demAt(E, N), shell: shellAt(E, N), ground: __view.terrain.heightAt(Paikka.enToWorld(E,N).x, Paikka.enToWorld(E,N).y, true) })', [E, N])
            r['tunnettu'] = known; r['etaisyys_m'] = d
            out.setdefault(name, []).append(r)
            print(name, d, json.dumps(r), flush=True)
    json.dump({'huippu': top, 'tulos': out}, open(os.path.join(ULOS, 'korkeus3j_%s.json' % tag), 'w'), indent=1)
    print('virheet', errs[:3]); b.close()
