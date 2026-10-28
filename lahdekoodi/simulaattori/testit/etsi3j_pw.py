"""Vaihe 3j: etsii vesieste-kerroksen laiturit ja aallonmurtajat (laji, keskipiste TM35FIN) annetun pisteen ympäriltä.
Käyttö: python3 etsi3j_pw.py <sim-osoite> <E> <N> [säde_m=1500]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; E = float(sys.argv[2]); N = float(sys.argv[3]); R = float(sys.argv[4]) if len(sys.argv) > 4 else 1500
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    p = b.new_context(viewport={'width': 800, 'height': 500}).new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=0&budget=14&pb=0.3&aineisto=%s' % (E, N, PAKETTI))
    p.wait_for_function('window.__lm===true', timeout=240000)
    r = p.evaluate('''async ([E, N, R]) => {
      const out = [], ll = Paikka.lonlatToTile ? null : null;
      const c = Paikka.enToLonLat ? Paikka.enToLonLat(E, N) : null;
      return JSON.stringify({keys: Object.keys(Paikka)});
    }''', [E, N, R])
    print(r)
    r = p.evaluate('''async ([E, N, R]) => {
      const ll = Paikka.worldToLonLat(E - 327184, N - 6823553), t = Paikka.lonlatToTile(ll.lon, ll.lat, 16), out = [];
      const rt = Math.ceil(R / 290);
      for (let dy = -rt; dy <= rt; dy++) for (let dx = -rt; dx <= rt; dx++) {
        const tx = Math.floor(t.x) + dx, ty = Math.floor(t.y) + dy;
        let lay = null; try { lay = await Aineisto.layers(16, tx, ty, ['vesieste']); } catch (e) { continue; }
        if (!lay || !lay.vesieste) continue;
        const L = lay.vesieste, ext = L.extent || 4096;
        for (const f of L.features) {
          const laji = String(f.props && f.props.laji || ''); if (!/laituri|aallonmurt/.test(laji)) continue;
          const a = f.parts[0]; if (!a || a[0] < 0 || a[0] >= ext || a[1] < 0 || a[1] >= ext) continue;
          let sx = 0, sy = 0, n = 0; for (let i = 0; i < a.length; i += 2) { sx += a[i]; sy += a[i + 1]; n++; }
          const q = Paikka.tileLonLat(16, tx, ty, sx / n / ext, sy / n / ext), en = Paikka.lonlatToEN(q.lon, q.lat);
          out.push([laji, f.type, Math.round(en.e), Math.round(en.n), n]);
        }
      }
      return JSON.stringify(out);
    }''', [E, N, R])
    arr = json.loads(r)
    arr.sort(key=lambda x: (x[2] - E) ** 2 + (x[3] - N) ** 2)
    for a in arr[:60]: print(a)
    print('virheet', errs[:3]); b.close()
