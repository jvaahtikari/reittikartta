"""Vaihe 3j: kolmiot ja piirtokutsut luokittain (maapinta, kuori, rakennukset, puut) näkyvistä solmuista pisteessä A tai B.
Käyttö: python3 tri3j_pw.py <osoite> <deck|pixel> <full|light|-> [piste=A]"""
import sys, os, json
base, dev, laatu = sys.argv[1], sys.argv[2], sys.argv[3]
PT = sys.argv[4] if len(sys.argv) > 4 else 'A'
sys.argv = [sys.argv[0], base, base, dev, laatu if laatu != '-' else '', '1', '10']
sys.path.insert(0, os.path.dirname(__file__))
src = open(os.path.join(os.path.dirname(__file__), 'cpu3j_pw.py')).read().split('res = {}')[0]
exec(compile(src, 'cpu3j_pw_alku', 'exec'))
JS = """() => {
  const T = __view.terrain, out = {}; const cam = __view.camera; cam.updateMatrixWorld(); const fr = new THREE.Frustum(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  function add(k, m) { if (!m || !m.visible || !m.parent) return; m.updateWorldMatrix(true, false); if (m.frustumCulled !== false && !fr.intersectsObject(m)) return; const g = m.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; const inst = m.isInstancedMesh ? m.count : 1; const o = out[k] || (out[k] = { meshes: 0, tris: 0 }); o.meshes++; o.tris += n * inst; }
  T.nodes.forEach(n => { const z = 'z' + n.z; add('maa_' + z, n.mesh); add('kuori_' + z, n.shell); add('rak_' + z, n.bmesh); if (n.tmeshes) n.tmeshes.forEach(m => add('puut_' + z + (m.userData.kind || ''), m)); });
  return JSON.stringify({ out, stats: __view.rendererStats(), group: T.group.children.length });
}"""
with sync_playwright() as pw:
    b, p, errs = setup(pw, base, laatu if laatu != '-' else None)
    place(p, PT)
    p.wait_for_timeout(5000)
    r = json.loads(p.evaluate(JS))
    for k in sorted(r['out']): print(PT, k, r['out'][k])
    print(r['stats'], r['group'])
    b.close()
