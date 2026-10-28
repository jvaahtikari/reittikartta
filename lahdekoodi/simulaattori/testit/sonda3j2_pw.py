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
    if kw.get('dump'):
        wx, wz, rr = [float(v) for v in kw['dump'].split(',')]
        d = p.evaluate('''([wx, wz, rr]) => {
          const out = {verts: [], recs: [], nodes: []};
          __view.terrain.nodes.forEach(n => {
            if (n.state !== 'built' || !n.mesh) return;
            const m = n.mesh, pa = m.geometry.attributes.position, N1 = n.n1, CELLS = n.cells, sh = n.shell, sp = sh ? sh.geometry.attributes.position : null;
            let hit = false;
            for (let k = 0; k < N1 * N1; k++) {
              const x = pa.getX(k) + m.position.x, z = pa.getZ(k) + m.position.z;
              if (Math.hypot(x - wx, z - wz) > rr) continue; hit = true;
              out.verts.push([n.z, n.x, n.y, k % N1, Math.floor(k / N1), Math.round(x), Math.round(z), +pa.getY(k).toFixed(2), sp ? +(sp.getY(k) - pa.getY(k)).toFixed(2) : null, n.ggrid ? +(n.ggrid[k] - 95.5).toFixed(2) : null]);
            }
            if (hit) {
              out.nodes.push([n.z, n.x, n.y, n.fixStat ? JSON.stringify(n.fixStat) : '', n.recs ? n.recs.length / 10 : 0, n.mode]);
              if (n.recs) for (let q = 0; q < n.recs.length; q += 10) {
                const x = n.recs[q] + m.position.x, z = n.recs[q + 2] + m.position.z;
                if (Math.hypot(x - wx, z - wz) < rr) out.recs.push([n.z, Math.round(x), Math.round(z), +n.recs[q + 1].toFixed(2), +n.recs[q + 3].toFixed(1), +n.recs[q + 4].toFixed(1), n.recs[q + 9]]);
              }
            }
          });
          return JSON.stringify(out);
        }''', [wx, wz, rr])
        o = json.loads(d)
        print('solmut', o['nodes'])
        print('kärjet [z,x,y,i,j,wx,wz,maaY,kuoriLisäY,DEM-LAKE]')
        for v in sorted(o['verts'], key=lambda v: (v[6], v[5])): print(v)
        print('puut [z,wx,wz,y,leveys,korkeus,laji]')
        for r_ in o['recs']: print(r_)
    if kw.get('kuva'):
        el = p.query_selector('#v3'); el.screenshot(path=kw['kuva'], timeout=300000)
    print('virheet', errs[:4]); b.close()
