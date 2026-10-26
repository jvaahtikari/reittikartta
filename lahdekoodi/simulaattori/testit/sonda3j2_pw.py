"""Vaihe 3j-2: sonda. Siirtää aluksen pisteeseen (A, B, C), odottaa maaston latautumisen ja säteenheitolla kertoo, mikä kohde näkyy annetuissa kuvapisteissä.
Käyttö: python3 sonda3j2_pw.py <sim-osoite> <piste> <x,y;x,y...> [nofix=1] [kuva=polku]
Kuvapisteet ovat #v3-elementin sisäisiä (kuten _3d.png-kuvissa), 1440 x 511 deck-asettelussa."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; pt = sys.argv[2]; xy = sys.argv[3]
kw = dict(x.split('=', 1) for x in sys.argv[4:] if '=' in x)
POINTS = {'A': (328010, 6823830, 112.0), 'B': (327330, 6824000, 182.0), 'C': (327895, 6824881, 100.0)}
ORIGIN = (327184, 6823553)
T0 = '2026-07-15T09:00:00Z'
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    if kw.get('nofix'): p.add_init_script('window.__maastoNoFix=true;')
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=' + T0)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=240000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(0.8)')
    p.evaluate('document.getElementById("pauseBtn").click()')
    E, N, hdg = POINTS[pt]
    X, Y = E - ORIGIN[0], N - ORIGIN[1]
    p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=%f-S.conv; S.orderHdg=%f; if(S.hmHdg!==undefined) S.hmHdg=%f; S.v=0; S.orderSpeedKn=0;})()' % (X, Y, hdg, hdg, hdg))
    p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
    p.wait_for_function('window.__aidsOk===true', timeout=150000)
    for _ in range(170):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.wait_for_timeout(4000)
    r = p.evaluate('''(xy) => {
      const cv = document.querySelector('#v3 canvas') || document.querySelector('#v3'), rect = cv.getBoundingClientRect(), W = rect.width, H = rect.height;
      const out = [];
      xy.split(';').forEach(s => {
        const [px, py] = s.split(',').map(Number);
        const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / W * 2 - 1, 1 - py / H * 2), __view.camera);
        const hits = rc.intersectObjects(__view.scene.children, true).filter(h => h.object.visible).slice(0, 5);
        out.push({px, py, W, H, hits: hits.map(h => { const o = h.object, ud = o.userData || {}, nd = ud.node;
          const wpos = h.point;
          return { d: Math.round(h.distance), x: Math.round(wpos.x), y: +wpos.y.toFixed(2), z: Math.round(wpos.z), type: o.type, mat: o.material && o.material.type, name: o.name || '',
            node: nd ? [nd.z, nd.x, nd.y, o === nd.mesh ? 'maa' : o === nd.shell ? 'kuori' : o === nd.bmesh ? 'rakennus' : 'puut:' + (ud.kind || '?')] : null, inst: h.instanceId != null ? h.instanceId : null }; }) });
      });
      return JSON.stringify(out);
    }''', xy)
    for row in json.loads(r): print(json.dumps(row, ensure_ascii=False), flush=True)
    if kw.get('kuva'):
        el = p.query_selector('#v3'); el.screenshot(path=kw['kuva'], timeout=300000)
    print('virheet', errs[:4]); b.close()
