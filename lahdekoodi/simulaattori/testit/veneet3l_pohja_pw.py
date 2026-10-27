"""Vaihe 3l, kriteeri 4 (veneiden pohja ei näy veden läpi): veneiden materiaali korvataan koemateriaalilla, joka piirtää vain vedenalaiset osat (leikkaustaso y > 0 pois) kirkkaan magentana.
Veneen osa, joka jää veden alle, on magentaa vain, jos vesitaso ei peitä sitä. Jokaisesta kamerapisteestä lasketaan magentat pikselit canvasilta (preserveDrawingBuffer).
Vertailukohtana on koe ilman vesitasoa (vesi piilotettu): silloin magentaa pitää näkyä, jotta koe on pätevä.
Käyttö: python3 veneet3l_pohja_pw.py [nimi]   (nimi = tunniste tulostiedostolle, oletus nyt)"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
nimi = sys.argv[1] if len(sys.argv) > 1 else 'nyt'
JS_ASENNA = """() => { const m0 = __sim.boats.ryhma.children.find(c => c.material).material;
  const m2 = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m2.onBeforeCompile = function (sh) { m0.onBeforeCompile(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);'); };
  m2.customProgramCacheKey = () => 'veneet-pohjakoe'; m2.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
  __view.renderer.localClippingEnabled = true; window.__pohjaM = m2; window.__vanhaM = m0;
  __sim.boats.ryhma.children.forEach(c => { if (c.material) c.material = m2; });
  const w = __view.scene.children.find(o => o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters && o.geometry.parameters.width === 60000) || __view.scene.children.find(o => o.renderOrder === -5);
  window.__vesi = w; return !!w; }"""
JS_LASKE = """() => { const cv = __view.renderer.domElement, c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
  const d = g.getImageData(0, 0, c2.width, c2.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] < 12 && d[i + 2] > 240) n++; return { n: n, w: c2.width, h: c2.height }; }"""
res = {'kamerat': []}
with sync_playwright() as pw:
    b, p, errs = avaa(pw, 'deck', None, naytot='plot')
    hn = satama(p, 'naistenlahti')
    e0, n0, h0 = satama_asema(hn, 150); ok = siirra(p, e0, n0, h0); print('valmis', ok, flush=True)
    print('vesitaso', p.evaluate(JS_ASENNA), json.dumps(p.evaluate('(()=>{const w=__vesi; return {tyyppi:w.geometry.type, par:w.geometry.parameters, kolmiot:w.geometry.index? w.geometry.index.count/3 : w.geometry.attributes.position.count/3}})()')), flush=True)
    k = hn['keski']; a = math.radians(hn['avoin']); ox, on = math.sin(a), math.cos(a)
    # kamerapisteet: avoimen veden suunnassa uloimmasta veneestä etäisyyksillä 15, 40, 100 ja 250 m, korkeudet 1,5, 6 ja 25 m, katse sataman reunaan
    for d in (15, 40, 100, 250):
        for h in (1.5, 6, 25):
            ce = k['e'] + ox * (hn['reuna'] + d); cn = k['n'] + on * (hn['reuna'] + d)
            siirra(p, ce, cn, (hn['avoin'] + 180) % 360, odota=False)
            for fov, ky in ((17, 0.3), (45, -1.0)):
                vapaa_kamera(p, ce, cn, h, k['e'] + ox * (hn['reuna'] - 10), k['n'] + on * (hn['reuna'] - 10), 0.5 if ky > 0 else 0.5, fov)
                p.wait_for_timeout(1600)
                r = p.evaluate(JS_LASKE)
                p.evaluate('__vesi.visible = false'); p.wait_for_timeout(1600); c = p.evaluate(JS_LASKE); p.evaluate('__vesi.visible = true')
                row = {'etaisyys': d, 'korkeus': h, 'fov': fov, 'magenta_vedella': r['n'], 'magenta_ilman_vetta': c['n'], 'pikseleita': r['w'] * r['h']}
                res['kamerat'].append(row); print(json.dumps(row), flush=True)
    res['yhteensa_vedella'] = sum(x['magenta_vedella'] for x in res['kamerat']); res['yhteensa_ilman_vetta'] = sum(x['magenta_ilman_vetta'] for x in res['kamerat'])
    print('yhteensä: vedellä %d, ilman vettä %d' % (res['yhteensa_vedella'], res['yhteensa_ilman_vetta']), flush=True)
    print('virheet', errs[:6]); res['virheet'] = errs[:6]
    json.dump(res, open(os.path.join(SHOTS, 'tulos_3l_pohja_%s.json' % nimi), 'w'), indent=1)
    b.close()
