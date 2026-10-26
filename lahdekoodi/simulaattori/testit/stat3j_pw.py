"""Vaihe 3j: asettumistesti. Mittaa saman sivun CPU-aikaa kuvaa kohden peräkkäisissä 10 sekunnin jaksoissa ilman mitään kytkimiä, jotta nähdään onko hidastuminen alussa taustatyötä vai pysyvää.
Käyttö: python3 stat3j_pw.py <osoite> <deck|pixel> <full|light|-> [jaksoja=8] [piste=A]"""
import sys, os, time, datetime
sys.argv += [''] * 0
sys.path.insert(0, os.path.dirname(__file__))
base, dev, laatu = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 8
PT = sys.argv[5] if len(sys.argv) > 5 else 'A'
sys.argv = [sys.argv[0], base, base, dev, laatu if laatu != '-' else '', '1', '10']
# käytetään cpu3j_pw:n apufunktioita lataamalla sen alkuosa
src = open(os.path.join(os.path.dirname(__file__), 'cpu3j_pw.py')).read().split('res = {}')[0]
exec(compile(src, 'cpu3j_pw_alku', 'exec'))
with sync_playwright() as pw:
    b, p, errs = setup(pw, base, laatu if laatu != '-' else None)
    place(p, PT)
    p.evaluate("() => { window.__fr = 0; window.__run = true; (function f(){ window.__fr++; if (window.__run) requestAnimationFrame(f); })(); }")
    t00 = time.time()
    for i in range(N):
        f0 = p.evaluate('() => window.__fr'); c0 = cpu_of(os.getpid()); t0 = time.time()
        p.wait_for_timeout(10000)
        c1 = cpu_of(os.getpid()); f1 = p.evaluate('() => window.__fr'); t1 = time.time()
        print(PT, 'jakso', i, 'aika', round(t1 - t00), 'kuvia', f1 - f0, 'cpu_ms_per_kuva', round((c1 - c0) / max(1, f1 - f0) * 1000), 'seinäkello_ms_per_kuva', round((t1 - t0) / max(1, f1 - f0) * 1000), flush=True)
    print(p.evaluate('JSON.stringify({r:__view.rendererStats(), t:__view.terrain.info().trees})'))
    b.close()
