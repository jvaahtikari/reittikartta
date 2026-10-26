"""Vaihe 3j, kriteeri 3 (profilointi): CPU-aika kuvaa kohden, kun yksittäisiä osia (taivas, vesi, maasto, kuori, puut, rakennukset, pilvet) kytketään pois. Alkuperäinen kuvaus: kuvavälin vertailu vanha ja uusi samassa istunnossa (sama kone, vuorottelu), pisteissä A ja B.
Käyttö: python3 suor3j_pw.py <vanha-osoite> <uusi-osoite> <profiili: deck|pixel> <laatu: full|light> [kierrokset=3] [sekuntia=12] [pb=0.8]
Mitataan rAF-välien keskiarvo ja mediaani sekunnin ajan, vuorotellen vanha ja uusi, ja tulostetaan myös piirtokutsut ja kolmiot (WebGL-tilasto) sekä puiden luvut."""
import sys, os, json, time, datetime
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
OLD, NEW, PROF, LAATU = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ROUNDS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
SEC = float(sys.argv[6]) if len(sys.argv) > 6 else 12
PB = sys.argv[7] if len(sys.argv) > 7 else '0.8'
POINTS = {'A': (328010, 6823830, 112.0), 'B': (327330, 6824000, 182.0)}
ORIGIN = (327184, 6823553)
T0 = '2026-07-15T09:00:00Z'
def setup(pw, base, laatu):
    if PROF == 'pixel':
        b, c = chromium(pw)
    else:
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    extra = ('&laatu=' + laatu) if laatu else ''
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=' + T0 + extra)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=300000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(%s)' % PB)
    p.evaluate('document.getElementById("pauseBtn").click()')
    if PROF == 'pixel':
        p.evaluate('(()=>{const b=document.getElementById("swapBtn"); if(b && !b.hidden) b.click();})()')
    return b, p, errs
def place(p, k):
    E, N, hdg = POINTS[k]
    X, Y = E - ORIGIN[0], N - ORIGIN[1]
    p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=%f-S.conv; S.orderHdg=%f; if(S.hmHdg!==undefined) S.hmHdg=%f; S.v=0; S.orderSpeedKn=0;})()' % (X, Y, hdg, hdg, hdg))
    p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=300000)
    for _ in range(240):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.setSimTime(%d)' % int(datetime.datetime.fromisoformat(T0.replace('Z', '+00:00')).timestamp() * 1000))
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)'); p.wait_for_timeout(4000)
def measure(p):
    p.evaluate('''() => { window.__ft = []; window.__run = true; let last = performance.now(); (function f(now){ window.__ft.push(now - last); last = now; if (window.__run) requestAnimationFrame(f); })(last); }''')
    p.wait_for_timeout(int(SEC * 1000))
    return p.evaluate('''() => { window.__run = false; const ft = window.__ft.slice(5).sort((a,b)=>a-b); const r = __view.rendererStats(); return { n: ft.length, median: ft[Math.floor(ft.length/2)], p95: ft[Math.floor(ft.length*0.95)], mean: ft.reduce((a,b)=>a+b,0)/ft.length, calls: r.calls, triangles: r.triangles, trees: __view.terrain.info().trees }; }''')

import psutil
def cpu_of(root_pid):
    tot = 0.0
    try: procs = [psutil.Process(root_pid)] + psutil.Process(root_pid).children(recursive=True)
    except Exception: return 0.0
    for q in procs:
        try: t = q.cpu_times(); tot += t.user + t.system
        except Exception: pass
    return tot
def meas(p, sec):
    # yksi pysyvä rAF-laskuri (aiempi versio käynnisti jokaisella jaksolla uuden ketjun ja kuvaluvut paisuivat)
    p.evaluate("""() => { if (!window.__cnt) { window.__cnt = 1; (function f(){ window.__cnt++; requestAnimationFrame(f); })(); } }""")
    f0 = p.evaluate("() => window.__cnt"); c0 = cpu_of(os.getpid()); t0 = time.time(); p.wait_for_timeout(int(sec * 1000)); c1 = cpu_of(os.getpid()); t1 = time.time()
    fr = p.evaluate("() => window.__cnt") - f0
    return round((c1 - c0) / max(1, fr) * 1000), round((t1 - t0) / max(1, fr) * 1000), fr
CONF = {
 'perus': ('', ''),
 'ei_taivasta': ('__view.scene.children.forEach(o => { if (o.renderOrder === 100) o.visible = false; })', '__view.scene.children.forEach(o => { if (o.renderOrder === 100) o.visible = true; })'),
 'ei_vetta': ('__view.scene.children.forEach(o => { if (o.renderOrder === -5) o.visible = false; })', '__view.scene.children.forEach(o => { if (o.renderOrder === -5) o.visible = true; })'),
 'ei_maastoa': ('__view.terrain.group.visible = false', '__view.terrain.group.visible = true'),
 'ei_kuoria': ('__view.terrain.nodes.forEach(n => { if (n.shell) n.shell.material.visible = false; })', '__view.terrain.nodes.forEach(n => { if (n.shell) n.shell.material.visible = true; })'),
 'ei_puita': ('__view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = false); })', '__view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = true); })'),
 'ei_rakennuksia': ('__view.terrain.nodes.forEach(n => { if (n.bmesh) n.bmesh.material.visible = false; })', '__view.terrain.nodes.forEach(n => { if (n.bmesh) n.bmesh.material.visible = true; })'),
 'ei_pilvia': ('window.__uc = __view.uniforms.uCloud.value; __view.uniforms.uCloud.value = 0', '__view.uniforms.uCloud.value = window.__uc'),
 'ei_mitaan': ('__view.scene.children.forEach(o => { if (o.renderOrder === 100 || o.renderOrder === -5) o.visible = false; }); __view.terrain.group.visible = false', ''),
}
with sync_playwright() as pw:
    b, p, errs = setup(pw, NEW, LAATU)
    for name in ('A',):
        place(p, name)
        meas(p, 25)  # lämmittely
        seq = []
        for k in CONF:
            if k != 'perus': seq += ['perus', k]
        seq.append('perus')
        for k in seq:
            on, off = CONF[k]
            if on: p.evaluate('() => {' + on + '}')
            r = meas(p, SEC)
            if off: p.evaluate('() => {' + off + '}')
            print(name, k, r, flush=True)
    b.close()
