"""Vaihe 3j, kriteeri 3 (vuorotteluvertailu): vanha ja uusi koodi mitataan vuorotellen (vanha, uusi, vanha, uusi) tuoreissa selaimissa samassa ajossa, jotta koneen kuorman vaihtelu jakautuu molemmille.
Mitataan renderer.render-kutsun kesto (readPixels pakottaa piirron valmiiksi) ja kuvaväli. Pisteet A ja B.
Käyttö: python3 ab3j_pw.py <vanha-osoite> <uusi-osoite> <deck|pixel> <full|light> [ikkunat=3] [sekuntia=20] [pisteet=A,B]"""
import sys, os, json, time, datetime
OLD, NEW, PROF, LAATU = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ROUNDS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
SEC = float(sys.argv[6]) if len(sys.argv) > 6 else 20
PTS = (sys.argv[7] if len(sys.argv) > 7 else 'A,B').split(',')
_R, _S, _P = ROUNDS, SEC, PTS
sys.argv = [sys.argv[0], OLD, NEW, PROF, LAATU, '1', '10']
sys.path.insert(0, os.path.dirname(__file__))
src = open(os.path.join(os.path.dirname(__file__), 'cpu3j_pw.py')).read().split('res = {}')[0]
exec(compile(src, 'cpu3j_pw_alku', 'exec'))
ROUNDS, SEC, PTS = _R, _S, _P
JS_INSTALL = """() => { const r = __view.renderer, o = r.render.bind(r), gl = r.getContext(); window.__rt = []; window.__ts = []; window.__skip = false; r.render = function (s, c) { if (window.__skip) return; const t = performance.now(); o(s, c); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, window.__px || (window.__px = new Uint8Array(4))); window.__rt.push(performance.now() - t); window.__ts.push(t); }; }"""
JS_RES = """() => { const a = window.__rt.slice(1).sort((x, y) => x - y), t = window.__ts, gaps = []; for (let i = 2; i < t.length; i++) gaps.push(t[i] - t[i - 1]); gaps.sort((x, y) => x - y); const r = __view.rendererStats();
  return { n: a.length, render_med: a.length ? a[Math.floor(a.length / 2)] : null, gap_med: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, gap_mean: gaps.length ? gaps.reduce((x, y) => x + y, 0) / gaps.length : null, calls: r.calls, triangles: r.triangles }; }"""
def med(v):
    v = sorted(x for x in v if x is not None); return v[len(v) // 2] if v else None
def med(v):
    v = sorted(x for x in v if x is not None); return v[len(v) // 2] if v else None
res = {}
with sync_playwright() as pw:
    for name in PTS:
        for rd in range(ROUNDS):
            for lab, base, laatu in (('vanha', OLD, None), ('uusi', NEW, LAATU)):
                b, p, errs = setup(pw, base, laatu)
                place(p, name)
                p.wait_for_timeout(6000)
                p.evaluate(JS_INSTALL)
                p.wait_for_timeout(8000)
                p.evaluate('() => { window.__rt = []; window.__ts = [] }')
                p.wait_for_timeout(int(SEC * 1000))
                r = p.evaluate(JS_RES); r['virheet'] = errs[:2]
                print(name, rd, lab, json.dumps(r), flush=True)
                res.setdefault(name, {'vanha': [], 'uusi': []})[lab].append(r)
                b.close()
    out = {}
    for name in res:
        o = res[name]['vanha']; n = res[name]['uusi']
        out[name] = {'vanha_render_ms': med([x['render_med'] for x in o]), 'uusi_render_ms': med([x['render_med'] for x in n]),
                     'vanha_kuvavali_ms': med([x['gap_med'] for x in o]), 'uusi_kuvavali_ms': med([x['gap_med'] for x in n]),
                     'vanha_kutsut': o[-1]['calls'], 'uusi_kutsut': n[-1]['calls'], 'vanha_kolmiot': o[-1]['triangles'], 'uusi_kolmiot': n[-1]['triangles']}
        out[name]['suhde_render'] = (out[name]['uusi_render_ms'] or 0) / (out[name]['vanha_render_ms'] or 1)
        out[name]['suhde_kuvavali'] = (out[name]['uusi_kuvavali_ms'] or 0) / (out[name]['vanha_kuvavali_ms'] or 1)
        print(name, json.dumps(out[name]), flush=True)
    json.dump({'tulos': out, 'raaka': res}, open(os.path.join(os.path.dirname(__file__), '..', 'shots', 'ab3j_%s_%s.json' % (PROF, LAATU)), 'w'), indent=1)
