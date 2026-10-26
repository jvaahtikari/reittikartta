"""Vaihe 3j: piirtokutsun (renderer.render + gl.finish) kesto sivun sisällä, kun osia kytketään pois. Erottaa 3D-piirron muusta kuvakustannuksesta.
Käyttö: python3 rkoe3j_pw.py <osoite> <deck|pixel> <full|light|-> [piste=A]"""
import sys, os, time, datetime, json
base, dev, laatu = sys.argv[1], sys.argv[2], sys.argv[3]
PT = sys.argv[4] if len(sys.argv) > 4 else 'A'
sys.argv = [sys.argv[0], base, base, dev, laatu if laatu != '-' else '', '1', '10']
sys.path.insert(0, os.path.dirname(__file__))
src = open(os.path.join(os.path.dirname(__file__), 'cpu3j_pw.py')).read().split('res = {}')[0]
exec(compile(src, 'cpu3j_pw_alku', 'exec'))
JS_INSTALL = """() => { const r = __view.renderer, o = r.render.bind(r), gl = r.getContext(); window.__rt = []; r.render = function (s, c) { const t = performance.now(); o(s, c); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, window.__px || (window.__px = new Uint8Array(4))); window.__rt.push(performance.now() - t); }; }"""
EXTRA = {
 'ei_kuoria': ('() => { __view.terrain.nodes.forEach(n => { if (n.shell) n.shell.visible = false; }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.shell) n.shell.visible = true; }) }'),
 'ei_puita': ('() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = false); }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = true); }) }'),
 'ei_rakennuksia': ('() => { __view.terrain.nodes.forEach(n => { if (n.bmesh) n.bmesh.visible = false; }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.bmesh) n.bmesh.visible = true; }) }'),
 'ei_maa': ('() => { __view.terrain.nodes.forEach(n => { if (n.mesh) n.mesh.visible = false; }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.mesh) n.mesh.visible = true; }) }'),
}
CONFS = {
 'kaikki': ('() => {}', '() => {}'),
 'ei_maastoa': ('() => { __view.terrain.group.visible = false }', '() => { __view.terrain.group.visible = true }'),
 'ei_taivasta': ('() => { window.__hid = []; __view.scene.children.forEach(o => { if (o.geometry && o.geometry.type === "SphereGeometry" && o.geometry.parameters.radius === 1000) { o.visible = false; window.__hid.push(o); } }) }', '() => { window.__hid.forEach(o => o.visible = true) }'),
 'ei_vetta': ('() => { window.__hid = []; __view.scene.children.forEach(o => { if (o.material && o.material.uniforms && o.material.uniforms.uWaveTex && o.geometry.type !== "SphereGeometry") { o.visible = false; window.__hid.push(o); } }) }', '() => { window.__hid.forEach(o => o.visible = true) }'),
 'tyhja': ('() => { window.__hid = []; __view.scene.children.forEach(o => { if (o.visible) { o.visible = false; window.__hid.push(o); } }) }', '() => { window.__hid.forEach(o => o.visible = true) }'),
}
EXTRA['ei_bill'] = ('() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => { if (m.userData.kind === "bill") m.material.visible = false; }); }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = true); }) }')
EXTRA['ei_inst'] = ('() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => { if (m.userData.kind !== "bill") m.material.visible = false; }); }) }', '() => { __view.terrain.nodes.forEach(n => { if (n.tmeshes) n.tmeshes.forEach(m => m.material.visible = true); }) }')
EXTRA['ei_muu'] = ('() => { const own = new Set(); __view.terrain.nodes.forEach(n => { [n.mesh, n.shell, n.bmesh].forEach(m => m && own.add(m)); if (n.tmeshes) n.tmeshes.forEach(m => own.add(m)); }); window.__hid = []; __view.terrain.group.children.forEach(o => { if (!own.has(o) && o.visible) { o.visible = false; window.__hid.push(o); } }); window.__nhid = window.__hid.length; }', '() => { window.__hid.forEach(o => o.visible = true) }')
EXTRA2 = {'pb_0,3': ('() => __view.setPixelBudget(0.3)', '() => __view.setPixelBudget(0.8)'), 'pb_0,15': ('() => __view.setPixelBudget(0.15)', '() => __view.setPixelBudget(0.8)')}
if os.environ.get('VAIN_PB'): CONFS = dict([('kaikki', CONFS['kaikki'])] + list(EXTRA2.items()))
elif os.environ.get('VAIN_EXTRA'): CONFS = dict([('kaikki', CONFS['kaikki'])] + list(EXTRA.items()))
else: CONFS.update(EXTRA)
with sync_playwright() as pw:
    b, p, errs = setup(pw, base, laatu if laatu != '-' else None)
    place(p, PT)
    p.wait_for_timeout(8000)
    if os.environ.get('PB'): p.evaluate('__view.setPixelBudget(%s)' % os.environ['PB'])
    p.evaluate(JS_INSTALL)
    for rd in range(2):
        for k, (on, off) in CONFS.items():
            p.evaluate(on); p.evaluate('() => { window.__rt = [] }')
            p.wait_for_timeout(9000)
            r = p.evaluate('() => { const a = window.__rt.slice(1).sort((x, y) => x - y); return [a.length, a.length ? Math.round(a[Math.floor(a.length / 2)]) : null] }')
            p.evaluate(off)
            print(PT, rd, k, 'kuvia', r[0], 'render_ms_med', r[1], flush=True)
    print(p.evaluate('JSON.stringify(__view.rendererStats())'))
    b.close()
