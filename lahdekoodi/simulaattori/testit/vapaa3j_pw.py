"""Vaihe 3j: vapaa kamera (ei hyttiä) samoista katselupisteistä kuin kuva3j_pw.py, jotta maisema nähdään kokonaan.
Käyttö: python3 vapaa3j_pw.py <sim-osoite> <tunniste> <pisteet esim. A,B,C> [aika=ISO] [w=1440] [h=600] [fov=60] [eye=3] [ulos=hakemisto] [nimi=3jv] [laatu=full|light] [vaihe=9] [dy=0] [nofix=1] [stat=1] [pt=NIMI:E:N:SUUNTA ...]
Tallentaa <nimi>_<piste>_<tunniste>.png. Pisteet ovat samat kuin kuva3j_pw.py:ssä (tosisuunta muunnetaan ruutusuunnaksi +2,86 astetta)."""
import sys, os, math, datetime
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; tag = sys.argv[2]; pts = sys.argv[3].split(',')
kw = dict(x.split('=', 1) for x in sys.argv[4:] if '=' in x)
ULOS = kw.get('ulos') or os.path.join(os.path.dirname(__file__), '..', 'shots')
NIMI = kw.get('nimi', '3jv'); W = int(kw.get('w', 1440)); H = int(kw.get('h', 600)); FOV = float(kw.get('fov', 60)); EYE = float(kw.get('eye', 3))
T0 = kw.get('aika', '2026-07-15T09:00:00Z'); DY = float(kw.get('dy', 0))
POINTS = {'A': (328010, 6823830, 112.0), 'B': (327330, 6824000, 182.0), 'C': (327895, 6824881, 100.0), 'N': (327330, 6824000, 140.0), 'D': (324000, 6829750, 280.0)}
CONV = 2.86
for x in sys.argv[4:]:
    if x.startswith('pt='):
        nm, e_, n_, h_ = x[3:].split(':'); POINTS[nm] = (float(e_), float(n_), float(h_))
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    for k in pts:
        E, N, hdg = POINTS[k]
        c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        p = c.new_page(); errs = []; collect(p, errs)
        if kw.get('vaihe'): p.add_init_script('window.__maastoStage=%s;' % kw['vaihe'])
        if kw.get('nofix'): p.add_init_script('window.__maastoNoFix=true;')
        p.goto(base + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=0&budget=14&pb=1.0&t=%s&aineisto=%s' % (E, N, T0, PAKETTI))
        p.wait_for_function('window.__lm===true && window.__aids===true', timeout=240000)
        if kw.get('laatu'): p.evaluate('__view.setQuality("%s")' % kw['laatu'])
        a = math.radians(hdg + CONV)
        p.evaluate('''([ex, ey, ez, tx, ty, tz, fov]) => { __view.rig.visible=false; window.__free=[ex,ey,ez,tx,ty,tz,fov]; }''', [0, EYE, 0, math.sin(a) * 200, EYE + DY, -math.cos(a) * 200, FOV])
        p.evaluate('__view.setSimTime(%d)' % int(datetime.datetime.fromisoformat(T0.replace('Z', '+00:00')).timestamp() * 1000))
        for _ in range(240):
            p.wait_for_timeout(1000)
            if p.evaluate('window.__ready===true && __view.terrain.idle()'): break
        try: p.wait_for_function('!__view.piers || __view.piers.idle()', timeout=120000)
        except Exception: pass
        p.wait_for_timeout(3000)
        name = '%s_%s_%s' % (NIMI, k, tag)
        p.screenshot(path=os.path.join(ULOS, name + '.png'), timeout=300000)
        info = p.evaluate('JSON.stringify({r:__view.rendererStats(), levels:__view.terrain.levels(), t:__view.terrain.info().trees})')
        print(name, info, errs[:4], flush=True)
        if kw.get('sonda'):
            for xy in kw['sonda'].split(';'):
                px, py = [float(v) for v in xy.split(',')]
                r = p.evaluate('''([px, py, W, H]) => {
                  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / W * 2 - 1, 1 - py / H * 2), __view.camera);
                  const hits = rc.intersectObjects(__view.scene.children, true).filter(h => h.object.visible).slice(0, 4);
                  return JSON.stringify(hits.map(h => { const o = h.object, ud = o.userData || {}, nd = ud.node; let col = null;
                    try { if (o.material && o.material.map && o.material.map.image && o.material.map.image.getContext && h.uv) { const img = o.material.map.image, c = img.getContext('2d').getImageData(Math.min(img.width - 1, Math.floor(h.uv.x * img.width)), Math.min(img.height - 1, Math.floor((1 - h.uv.y) * img.height)), 1, 1).data; col = [c[0], c[1], c[2]]; } } catch (e) {}
                    return { d: Math.round(h.distance), x: Math.round(h.point.x), y: +h.point.y.toFixed(2), z: Math.round(h.point.z), type: o.type, mat: o.material && o.material.type, name: o.name, node: nd ? [nd.z, nd.x, nd.y, o === nd.mesh ? 'maa' : o === nd.shell ? 'kuori' : o === nd.bmesh ? 'rak' : 'muu'] : null, col: col }; }));
                }''', [px, py, W, H])
                print('sonda', xy, r, flush=True)
        if kw.get('stat'):
            st = p.evaluate('''(() => { const o = {nodes: [], fix: [], built: []}; __view.terrain.nodes.forEach(n => { if (n.state !== 'built') return; const w = Paikka.enToWorld(n.e, n.n); const dc = Math.hypot(w.x, w.y);
              if (n.tmeshes) o.nodes.push([n.z, n.x, n.y, Math.round(dc), n.mode, n.recs ? n.recs.length / 10 : 0, n.tmeshes.map(m => m.visible ? m.count : -1).join('/'), !!n.shell]);
              if (n.fixStat && n.fixStat.land) o.fix.push([n.z, n.x, n.y, Math.round(dc), n.fixStat.land, n.fixStat.landS]);
              if (n.fixStat && n.fixStat.built) o.built.push([n.z, n.x, n.y, Math.round(dc), n.fixStat.built, n.fixStat.builtS]); }); return JSON.stringify(o); })()''')
            open(os.path.join(ULOS, name + '_stat.json'), 'w').write(st)
            print('stat', st[:3000], flush=True)
        c.close()
    b.close()
