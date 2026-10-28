"""Vaihe 3o: satamat Google-kerroksessa. Testi ilman oikeaa Googlen kirjastoa (korvaava testikirjasto, tumma tausta esittää Googlen kerrosta, kuten vaiheessa 3n).
Osat (python3 veneet3o_pw.py [osa,osa,...], oletus kaikki):
  kerros     Kriteeri 1: Naistenlahden oma kerros tummalla taustalla. Laiturit näkyvät veneiden välissä (piirto päällä ja pois), veneet ilmakuvan paikoilla, ei veneitä aallonmurtajan vieressä.
             Kuvat 3o_naistenlahti_oma_kerros.png ja 3o_naistenlahti_oma_nakyma.png (sama kamera omassa näkymässä).
  satama     Kriteeri 3: googleSatama = 'google' (valikon painike): alfa 0 laiturien välissä, avoin vesi pysyy peittävänä, omia veneitä ja laitureita ei piirretä, mutta lahella-rajapinta antaa veneet.
  tutka      Kriteeri 3 ja 5: tutka ja törmäys käyttävät omia veneitä googleSatama-tilassa (tutkan venehaku, kaikukuvan ero, Tormays.check).
  varakaytto Kriteeri 1 ja 2: ilman tiedostoa (venelahde=laituri) varakäytön veneet eivät ole aallonmurtajan eikä kapean maan vieressä (kuvat ennen ja jälkeen).
Ympäristö: SIM (lähdesivun osoite), PAKETTI (aineistopaketti), VENEET (testi = testit/veneet_testi.json, paketti = paketin veneet.json)."""
import sys, os, json, math, re, io
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
from PIL import Image, ImageChops

parts = (sys.argv[1] if len(sys.argv) > 1 else 'kerros,satama,tutka,varakaytto').split(',')
KEY = 'TESTIAVAIN-EI-OIKEA-123456'
VENEET = os.environ.get('VENEET', 'testi')
checks = []
FAILS = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

FAKE = """
(function(){
  window.google = { maps: { importLibrary: function(n){ return Promise.resolve({ Map3DElement: function(o){
    window.__fakeN = (window.__fakeN || 0) + 1;
    var el = document.createElement('div'); el.className = 'fake-map3d'; el.style.cssText = 'background:linear-gradient(#3a4651,#232b32 55%,#161b20);width:100%;height:100%';
    el.__opts = o; el.center = o.center; el.heading = o.heading; el.tilt = o.tilt; el.range = o.range; el.fov = o.fov;
    window.__fakeMap = el;
    setTimeout(function(){ var ev = new Event('gmp-steadychange'); ev.isSteady = true; el.dispatchEvent(ev); }, 300);
    return el;
  } }); } } };
})();
"""
def handler(route):
    m = re.search(r'callback=([^&]+)', route.request.url)
    route.fulfill(status=200, content_type='application/javascript', body=FAKE + '\n' + (m.group(1) + '();' if m else ''))

HELP = """
window.__O = {
  cap: async function(){ const c = __view.canvas; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const im = new Image(); im.src = c.toDataURL('image/png'); await im.decode(); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(im, 0, 0);
    window.__img = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data }; return [c.width, c.height]; },
  scr: function(E, N, h){ const o = Paikka.getOrigin(), c = __view.canvas; __view.camera.updateMatrixWorld(true); const v = new THREE.Vector3(E - o.e, h, -(N - o.n)).project(__view.camera);
    return { x: (v.x * 0.5 + 0.5) * c.width, y: (0.5 - v.y * 0.5) * c.height, z: v.z }; },
  px: function(x, y){ const d = window.__img; x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= d.w || y >= d.h) return null; const i = (y * d.w + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]]; },
  inFrame: function(s){ const c = __view.canvas; return s.z > -1 && s.z < 1 && s.x >= 2 && s.y >= 2 && s.x < c.width - 2 && s.y < c.height - 2; },
  segD: function(px, py, ax, ay, bx, by){ const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); },
  pierD: function(e, n){ let d = 1e9; __sim.boats.laiturisegmentit().forEach(s => { d = Math.min(d, __O.segD(e, n, s.e0, s.n0, s.e1, s.n1) - s.w / 2); }); return d; },
  inHole: function(e, n){ const sa = __sim.boats.satamaAlueet(); return sa.kapselit.some(k => __O.segD(e, n, k[0], k[1], k[2], k[3]) <= sa.sade) || sa.renkaat.some(r => Math.hypot(e - r[0], n - r[1]) <= sa.veneSade); }
};
"""

JS_ESTO = """async ([cx, cy, reach]) => {
  const ll = Paikka.enToLonLat(cx, cy), tp = Paikka.lonlatToTile(ll.lon, ll.lat, 16), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / 65536, k = Math.ceil(reach / size) + 1, jobs = [], kuv = [], ves = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const tx = Math.floor(tp.x) + dx, ty = Math.floor(tp.y) + dy;
    jobs.push(Aineisto.layers(16, tx, ty, ['vesieste', 'maastokuvio']).then(r => { if (!r) return; if (r.maastokuvio) kuv.push({ z: 16, x: tx, y: ty, layer: r.maastokuvio }); if (r.vesieste) ves.push({ z: 16, x: tx, y: ty, layer: r.vesieste }); })); }
  await Promise.all(jobs); window.__onVesi = Veneet3D.luoVesiTesti(kuv); window.__esto = Veneet3D.luoEsto(ves, kuv, Veneet3D.ASETUKSET); return [ves.length, kuv.length]; }"""
JS_SATAMA3O = JS_SATAMA.replace("v.lahde === 'laituri'", "!v.maalla")

def avaa3o(pw, extra='', veneet=None):
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    FAILS.clear(); p.on('requestfailed', lambda r: FAILS.append(r.url[:140]))
    p.add_init_script('try{localStorage.setItem("sim.googleKey","%s")}catch(e){}' % KEY)
    c.route('https://maps.googleapis.com/**', handler)
    # paketti: paketin aineisto.json ei vielä mainitse veneet.json-tiedostoa (vaihe 1d ei ole päivittänyt sitä), joten osoite annetaan suoraan
    tied = ('&veneettiedosto=' + PAKETTI + 'veneet.json') if (veneet or VENEET) == 'paketti' else '&veneettiedosto=' + SIM + 'simulaattori/testit/veneet_testi.json'
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&maisema=oma&t=2026-07-15T09:00:00Z' + tied + extra)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=300000)
    p.evaluate('window.__adaptOff=true'); p.evaluate('document.getElementById("pauseBtn").click()')
    p.evaluate(HELP)
    return b, p, errs

def kuva_v3(p, nimi, odota=2500):
    p.wait_for_timeout(odota)
    path = os.path.join(SHOTS, nimi + '.png')
    p.locator('#v3').screenshot(path=path, timeout=300000)
    return path

def menu(p, id_):
    p.evaluate('document.getElementById("menuBtn").click()'); p.wait_for_timeout(300)
    p.evaluate('document.getElementById("%s").click()' % id_); p.wait_for_timeout(900)
    if id_ != 'mView': p.evaluate('document.getElementById("mClose").click()'); p.wait_for_timeout(300)

def wait_wmask(p, secs=240):
    for _ in range(secs):
        if p.evaluate('__view.wmask.idle() && __view.terrain.idle() && __view.piers.idle()'): break
        p.wait_for_timeout(1000)
    p.wait_for_timeout(1500)

def asema(p, nimi='naistenlahti', etaisyys=130, korkeus=8.0, fov=40):
    """Alus avovedelle etäisyyden (m) päähän uloimmasta veneestä ja vapaa kamera satamaa kohti. Palauttaa sataman tiedot."""
    cx, cy, sade = SATAMAT[nimi]
    p.evaluate(JS_ESTO, [cx, cy, 1700])
    h = p.evaluate(JS_SATAMA3O, [cx, cy, sade])
    e, n, hd = satama_asema(h, etaisyys)
    siirra(p, e, n, hd)
    a = math.radians(h['avoin'])
    vapaa_kamera(p, e, n, korkeus, h['keski']['e'] + math.sin(a) * h['reuna'] * 0.15, h['keski']['n'] + math.cos(a) * h['reuna'] * 0.15, 1.0, fov)
    p.wait_for_timeout(1500)
    return h, (e, n, hd)

def kamera_ylhaalta(p, h, korkeus=55, etaisyys=110, fov=50, sivu=0.0):
    """Vapaa kamera sataman yläpuolella avoimen veden puolella: korkeus (m) vedenpinnasta, etaisyys (m) uloimmasta veneestä, katse sataman keskipisteeseen (sivu m sivuun)."""
    a = math.radians(h['avoin']); k = h['keski']; d = h['reuna'] * 0.6 + etaisyys
    ce = k['e'] + math.sin(a) * d + math.cos(a) * sivu; cn = k['n'] + math.cos(a) * d - math.sin(a) * sivu
    vapaa_kamera(p, ce, cn, korkeus, k['e'], k['n'], 0.0, fov)
    p.wait_for_timeout(1500)

JS_TALLETA = """async (nimi) => { await __O.cap(); window[nimi] = window.__img; return 1; }"""
# laiturinäytteet: vertailu kuvaan, jossa laiturit on piilotettu (sama hetki, veneet liikkuvat vain senttejä), ja maan päällä olevat näytteet
JS_PIERS = """() => {
  const A = window.__imgP, B = window.__imgH, segs = __sim.boats.laiturisegmentit(), o = Paikka.getOrigin();
  const diff = (x, y) => { x = Math.round(x); y = Math.round(y); const i = (y * A.w + x) * 4; return Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) + Math.abs(A.data[i + 3] - B.data[i + 3]); };
  const out = { vesi: 0, piirtyy: 0, maa: 0, maaAlfa0: 0, maaPiirtyy: 0, maaEsim: [], kirkkaus: 0, harmaa: 0 }; let br = 0;
  segs.forEach(s => { const L = Math.hypot(s.e1 - s.e0, s.n1 - s.n0), n = Math.max(1, Math.floor(L / 3));
    for (let i = 0; i <= n; i++) { const t = i / n, e = s.e0 + (s.e1 - s.e0) * t, nn = s.n0 + (s.n1 - s.n0) * t, sc = __O.scr(e, nn, 0.5); if (!__O.inFrame(sc)) continue;
      const hh = __view.terrain.heightAt(e - o.e, nn - o.n), ia = (Math.round(sc.y) * A.w + Math.round(sc.x)) * 4, q = [A.data[ia], A.data[ia + 1], A.data[ia + 2], A.data[ia + 3]];
      if (hh != null && hh >= 0.9) { out.maa++; if (q[3] === 0) out.maaAlfa0++; if (diff(sc.x, sc.y) > 45) out.maaPiirtyy++; if (out.maaEsim.length < 6) out.maaEsim.push({ e: Math.round(e), n: Math.round(nn), h: +hh.toFixed(2), q, k: s.k }); continue; }
      out.vesi++; if (diff(sc.x, sc.y) > 45) { out.piirtyy++; const mx = Math.max(q[0], q[1], q[2]), mn = Math.min(q[0], q[1], q[2]); br += (q[0] + q[1] + q[2]) / 3; if (mx - mn < 60) out.harmaa++; } } });
  out.kirkkaus = out.piirtyy ? br / out.piirtyy : 0;
  // koko kuvan pikselit: laituripikselit = kuvat eroavat, ja niistä ne, joiden kohdalla laiturittomassa kuvassa on läpinäkyvä pikseli (alfa 0, eli oman vedenkin ulkopuolella: Googlen maa tai taivas)
  let ero = 0, lapinakyvalla = 0; const n = A.w * A.h;
  for (let i = 0; i < n; i++) { const j = i * 4; if (Math.abs(A.data[j] - B.data[j]) + Math.abs(A.data[j + 1] - B.data[j + 1]) + Math.abs(A.data[j + 2] - B.data[j + 2]) + Math.abs(A.data[j + 3] - B.data[j + 3]) > 45) { ero++; if (B.data[j + 3] === 0) lapinakyvalla++; } }
  out.laituripikseleita = ero; out.maanPaalla = lapinakyvalla; return out; }"""

JS_VENEKUVA = """async () => { await __O.cap(); window.__img1 = window.__img; return 1; }"""
JS_VENEERO = """async (maxD) => {
  const o = Paikka.getOrigin(), A = window.__img1, cam = __view.camera.position; await __O.cap(); const B = window.__img;
  let n = 0, nak = 0;
  __sim.boats.veneet.filter(v => !v.maalla).forEach(v => { if (Math.hypot(v.e - o.e - cam.x, v.n - o.n + cam.z) > maxD) return;
    const sc = __O.scr(v.e, v.n, 0.8); if (!__O.inFrame(sc)) return; n++;
    let sum = 0, cnt = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = Math.round(sc.x) + dx, y = Math.round(sc.y) + dy; if (x < 0 || y < 0 || x >= A.w || y >= A.h) continue; const i = (y * A.w + x) * 4;
      sum += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) + Math.abs(A.data[i + 3] - B.data[i + 3]); cnt++; }
    if (cnt && sum / cnt > 18) nak++; });
  return { n, nak }; }"""

def osa_kerros(pw):
    b, p, errs = avaa3o(pw)
    try:
        print('boatStats', json.dumps(p.evaluate('__sim.boatStats'))[:300], flush=True)
        print('veneiden tiedosto', json.dumps(p.evaluate('__sim.boatFile'))[:300], flush=True)
        ok(valmis(p), 'maasto, laiturit, törmäysruudut ja veneet latautuivat')
        h, st = asema(p)
        print('  sataman tiedot', json.dumps(h), flush=True)
        ik = p.evaluate('__sim.boats.ilmakuvaVeneet().length'); fb = p.evaluate('__sim.boats.veneet.filter(v => v.lahde === "laituri").length')
        ok(ik > 300, 'ilmakuvan veneitä %d (tiedoston paikat), varakäytön veneitä %d' % (ik, fb))
        ok(p.evaluate('__sim.boats.skaala()') == 1, 'omassa näkymässä veneet piirretään mittakaavalla 1')
        # kuvat: ylhäältä (laiturit ja veneet erottuvat) ja lähempää
        NIMET = [('', 55, 110, 50, 0.0), ('_lahikuva', 24, 30, 55, 0.0)]
        for suff, kork, et, fov, sivu in NIMET:
            kamera_ylhaalta(p, h, kork, et, fov, sivu); kuva_v3(p, '3o_naistenlahti_oma_nakyma' + suff, 3500)
        # kerrostila
        menu(p, 'mView')
        ok(p.evaluate('__sim.ext') == 'google' and p.evaluate('__view.isOverlay()'), 'Google 3D (korvaava testikirjasto) valittu ja oma kerros päällä')
        wait_wmask(p)
        sk = p.evaluate('__sim.boats.skaala()'); ok(abs(sk - 1.08) < 1e-9, 'kerrostilassa veneet piirretään 8 %% suurempina (mittakaava %s)' % sk)
        ok(p.evaluate('__view.overlaySettings.hide.laiturit') == 0 and p.evaluate('__view.overlaySettings.hide.sillat') == 1, 'omat laiturit eivät ole piilotuslistalla, sillat ovat')
        ok(p.evaluate('(()=>{const o=__view.scene.children.find(x=>x.name==="laiturit"); return !!o && o.layers.mask===1;})()'), 'laiturit-verkko on kerroksella 0 (piirtyy) kerrostilassa')
        for suff, kork, et, fov, sivu in NIMET:
            kamera_ylhaalta(p, h, kork, et, fov, sivu); p.wait_for_timeout(2500)
            if suff == '': kuva_v3(p, '3o_naistenlahti_oma_kerros', 2500)
            else: kuva_v3(p, '3o_naistenlahti_oma_kerros' + suff, 2500)
        # mittaukset ylhäältä otetusta näkymästä
        kamera_ylhaalta(p, h, 55, 110, 50, 0.0); p.wait_for_timeout(3000)
        p.evaluate(JS_TALLETA, '__imgP')
        p.evaluate('__view.overlaySettings.hide.laiturit = 1'); p.wait_for_timeout(2000)
        p.evaluate(JS_TALLETA, '__imgH')
        p.evaluate('__view.overlaySettings.hide.laiturit = 0'); p.wait_for_timeout(1500)
        pa = p.evaluate(JS_PIERS)
        print('  laiturinäytteet:', json.dumps(pa), flush=True)
        ok(pa['vesi'] >= 40 and pa['piirtyy'] >= 0.3 * pa['vesi'], 'laiturit näkyvät veneiden välissä: %d / %d vedessä olevasta laituripisteestä piirtyy (ero kuvaan, jossa laiturit on piilotettu)' % (pa['piirtyy'], pa['vesi']))
        ok(pa['piirtyy'] > 0 and 95 < pa['kirkkaus'] < 235 and pa['harmaa'] >= 0.8 * pa['piirtyy'], 'laiturin väri on vaalea harmaa (keskikirkkaus %.0f, harmaita %d / %d)' % (pa['kirkkaus'], pa['harmaa'], pa['piirtyy']))
        ok(pa['laituripikseleita'] >= 200 and pa['maanPaalla'] <= 0.1 * pa['laituripikseleita'], 'laiturin maanpuoleinen pää jää oman syvyyspeiton taakse: laituripikseleistä (%d) vain %d on kohdassa, jossa kuvassa ilman laitureita ei ole mitään (Googlen maa), eli %.1f %%' % (pa['laituripikseleita'], pa['maanPaalla'], 100.0 * pa['maanPaalla'] / max(1, pa['laituripikseleita'])))
        print('  maan päällä olevista laituripisteistä (maasto yli 0,9 m, vain kaukana horisontin tuntumassa) piirtyy %d / %d' % (pa['maaPiirtyy'], pa['maa']), flush=True)
        # veneet ilmakuvan paikoilla: veneryhmän piilotus ja kuvaero
        p.evaluate(JS_VENEKUVA)                       # veneet päällä -> __img1
        p.evaluate('__sim.boats.nayta(false)'); p.wait_for_timeout(1500)
        er = p.evaluate(JS_VENEERO, 400)             # pois -> __img, vertailu
        p.evaluate('__sim.boats.nayta(true)'); p.wait_for_timeout(1000)
        ok(er['n'] >= 30 and er['nak'] >= 0.7 * er['n'], 'ilmakuvan veneet näkyvät omassa kerroksessa paikoillaan: %d / %d kuvassa olevasta veneestä (alle 400 m) erottuu pois kytkettäessä' % (er['nak'], er['n']))
        # ei veneitä aallonmurtajan eikä kapean maan vieressä. Varakäytön (laiturialgoritmin) veneillä raja on ehdoton. Paketin veneet.json-tiedoston veneet ovat ortokuvassa näkyviä oikeita veneitä,
        # ja osa niistä on oikeasti kiinni niemekkeen sisäreunan ponttonissa tai laiturikadussa (tarkistettu ortokuvasta: Naistenlahden länsiniemeke ja Mustalahden kaide), joten niille rajaa ei aseteta.
        # Testitiedoston sijainnit on johdettu varakäytöstä, ja sillä sama ehdoton raja koskee myös tiedoston veneitä.
        r = p.evaluate("""() => { let n = 0, ik = 0, vara = 0, ikLaituriin = 0; __sim.boats.veneet.forEach(v => { if (v.maalla) return; if (__esto(v.e, v.n, 12)) { n++; if (v.lahde === 'ilmakuva') { ik++; if (v.laituriin) ikLaituriin++; } else vara++; } }); return { n, ik, vara, ikLaituriin, kaikki: __sim.boats.veneet.filter(v => !v.maalla).length }; }""")
        if VENEET == 'paketti':
            ok(r['vara'] == 0, 'varakäytön veneistä ei yksikään ole alle 12 m:n päässä aallonmurtajasta tai kapeasta niemekkeestä (%d)' % r['vara'])
            print('  ilmakuvan veneitä alle 12 m:n päässä kapeasta maasta (oikeita veneitä niemekkeen ja kaiteen vieressä): %d / %d, joista laituriveneitä %d' % (r['ik'], r['kaikki'], r['ikLaituriin']), flush=True)
        else:
            ok(r['n'] == 0, 'ei yhtään venettä alle 12 m:n päässä aallonmurtajasta tai kapeasta niemekkeestä (%d / %d venettä, ilmakuvan %d, varakäytön %d)' % (r['n'], r['kaikki'], r['ik'], r['vara']))
        # silmäpiste (aluksen näkymä) kerrostilassa ja omassa näkymässä
        tyhja_kamera(p); p.evaluate('__view.setGaze(0)')
        kuva_v3(p, '3o_naistenlahti_oma_kerros_silmapiste', 3000)
        menu(p, 'mView'); p.wait_for_timeout(1500)
        kuva_v3(p, '3o_naistenlahti_oma_nakyma_silmapiste', 3000)
        ok(p.evaluate('__sim.boats.skaala()') == 1, 'paluu omaan näkymään palauttaa veneiden mittakaavan 1:een')
        print('  epäonnistuneet pyynnöt:', FAILS[:8], flush=True)
        virheet = [e for e in errs if e[0] == 'pageerror' or 'googleapis' not in e[1]]
        ok(not virheet, 'ei konsolivirheitä eikä sivun virheitä (%s)' % [e[1][:100] for e in virheet[:3]])
    finally:
        b.close()

JS_VALIPISTEET = """() => {
  const out = []; const vs = __sim.boats.laiturisegmentit(); if (!vs.length) return out;
  let ke = 0, kn = 0; vs.forEach(s => { ke += (s.e0 + s.e1) / 2; kn += (s.n0 + s.n1) / 2; }); ke /= vs.length; kn /= vs.length;
  for (let dx = -300; dx <= 300; dx += 3) for (let dy = -300; dy <= 300; dy += 3) {
    const e = ke + dx, n = kn + dy; if (!__onVesi(e, n)) continue;
    const sc = __O.scr(e, n, 0); if (!__O.inFrame(sc)) continue;
    const d = __O.pierD(e, n);
    if (d >= 1.5 && d <= 8 && __O.inHole(e, n)) out.push({ e, n, x: sc.x, y: sc.y, d });
  }
  return out; }"""
# avoin vesi: yli 75 m laiturista ja yli 40 m satama-alueen renkaista, kameran lähellä
JS_KONTROLLI = """() => {
  const o = Paikka.getOrigin(), cam = __view.camera.position, out = [], sa = __sim.boats.satamaAlueet();
  for (let dx = -300; dx <= 300; dx += 4) for (let dy = -300; dy <= 300; dy += 4) {
    const e = cam.x + o.e + dx, n = -cam.z + o.n + dy; if (!__onVesi(e, n)) continue;
    const sc = __O.scr(e, n, 0); if (!__O.inFrame(sc)) continue;
    const d = __O.pierD(e, n); if (d < 75) continue;
    if (sa.renkaat.some(r => Math.hypot(e - r[0], n - r[1]) < sa.veneSade + 40)) continue;
    out.push({ e, n, x: sc.x, y: sc.y, d });
  }
  return out; }"""

def kamera_alas(p, h):
    """Vapaa kamera avoveden yllä 150 m uloimman veneen ulkopuolella, 40 m korkeudessa, katse alas 70 m eteenpäin: kuvassa on avovettä yli 75 m päässä laitureista."""
    a = math.radians(h['avoin']); k = h['keski']; d = h['reuna'] + 150
    ce = k['e'] + math.sin(a) * d; cn = k['n'] + math.cos(a) * d
    vapaa_kamera(p, ce, cn, 40, ce - math.sin(a) * 70, cn - math.cos(a) * 70, 0.0, 60)
    p.wait_for_timeout(1500)

def osa_satama(pw):
    b, p, errs = avaa3o(pw)
    try:
        ok(valmis(p), 'ladattu')
        h, st = asema(p)
        kamera_ylhaalta(p, h, 55, 110, 50, 0.0)
        menu(p, 'mView'); wait_wmask(p)
        ok(p.evaluate('__sim.satama') == 'oma', 'googleSatama on oletuksena oma')
        ok(not p.evaluate('__view.wmask.holeInfo().visible'), 'oletuksena satama-aluetta ei tehdä läpinäkyväksi')
        p.wait_for_timeout(2500)
        pts = p.evaluate(JS_VALIPISTEET)
        # valitaan enintään 60 välipistettä tasaisesti ja 30 avoimen veden pistettä (toisesta kamerasta)
        def poimi(l, n): return l[::max(1, len(l) // n)][:n]
        vali = poimi(pts, 60)
        kamera_alas(p, h); p.wait_for_timeout(2500)
        avoin = poimi(p.evaluate(JS_KONTROLLI), 30)
        print('  välipisteitä kuvassa %d (poimittu %d), avoimen veden pisteitä poimittu %d' % (len(pts), len(vali), len(avoin)), flush=True)
        ok(len(vali) >= 20 and len(avoin) >= 8, 'testipisteitä riittävästi (välissä %d, avoin %d)' % (len(vali), len(avoin)))
        def lue(p):
            kamera_ylhaalta(p, h, 55, 110, 50, 0.0); p.wait_for_timeout(2500)
            a = p.evaluate("""async (v) => { await __O.cap(); return v.map(q => __O.px(q.x, q.y)); }""", vali)
            kamera_alas(p, h); p.wait_for_timeout(2500)
            o = p.evaluate("""async (v) => { await __O.cap(); return v.map(q => __O.px(q.x, q.y)); }""", avoin)
            kamera_ylhaalta(p, h, 55, 110, 50, 0.0); p.wait_for_timeout(2500)
            return {'v': a, 'o': o}
        oma = lue(p)
        v_oma = [i for i, q in enumerate(oma['v']) if q and q[3] == 255]; o_oma = [i for i, q in enumerate(oma['o']) if q and q[3] == 255]
        ok(len(v_oma) >= 15, 'oma satama: laiturien välin pisteistä peittäviä (alfa 255) %d / %d' % (len(v_oma), len(vali)))
        kuva_v3(p, '3o_naistenlahti_satama_oma', 2500)
        # valikon painike: googleSatama = google
        menu(p, 'mPort')
        ok(p.evaluate('__sim.satama') == 'google', 'valikon painike vaihtaa asetuksen googleSatama = google')
        ok('Googlen omat' in p.evaluate('document.getElementById("mPort").textContent'), 'painikkeen teksti: %s' % p.evaluate('document.getElementById("mPort").textContent'))
        ok('googleSatama' in p.evaluate('localStorage.getItem("sim.asetukset")'), 'asetus tallentuu selaimen muistiin')
        p.wait_for_timeout(2500)
        hi = p.evaluate('__view.wmask.holeInfo()'); print('  reikäverkko', json.dumps(hi), flush=True)
        ok(hi['visible'] and hi['kolmiot'] > 500, 'reikäverkko on päällä (kapseleita %d, renkaita %d, kolmioita %d)' % (hi['kapselit'], hi['renkaat'], hi['kolmiot']))
        ok(p.evaluate('__sim.boats.ryhma.visible') is False, 'omia veneitä ei piirretä Google-tilassa (veneryhmä piilossa)')
        ok(p.evaluate('__view.overlaySettings.hide.laiturit') == 1, 'omia laitureita ei piirretä Googlen satamatilassa')
        gg = lue(p)
        v_g = [i for i in v_oma if gg['v'][i] and gg['v'][i][3] == 0]
        o_g = [i for i in o_oma if gg['o'][i] and gg['o'][i][3] == 255]
        ok(len(v_g) >= 0.9 * len(v_oma), 'alfa 0 laiturien välissä: %d / %d pisteestä, jotka olivat omassa tilassa peittäviä' % (len(v_g), len(v_oma)))
        ok(len(o_g) >= 0.9 * len(o_oma), 'avoin vesi (yli 75 m laitureista) pysyy peittävänä: %d / %d pisteestä' % (len(o_g), len(o_oma)))
        kuva_v3(p, '3o_naistenlahti_satama_google', 2500)
        # lahella-rajapinta ja tutkan venehaku
        l = p.evaluate("""() => { const o = Paikka.getOrigin(), c = __view.camera.position; const e = c.x + o.e, n = -c.z + o.n; return __sim.boatsAt(e, n, 400).length; }""")
        ok(l > 20, 'lahella-rajapinta (tutka ja törmäys) antaa omat veneet googleSatama-tilassa (%d venettä 400 m:n säteellä)' % l)
        # paluu: oma
        menu(p, 'mPort'); p.wait_for_timeout(2500)
        ok(p.evaluate('__sim.satama') == 'oma' and p.evaluate('__sim.boats.ryhma.visible') is True and p.evaluate('__view.overlaySettings.hide.laiturit') == 0 and not p.evaluate('__view.wmask.holeInfo().visible'), 'paluu omaan satamaan palauttaa veneet, laiturit ja veden')
        oma2 = lue(p)
        ok(sum(1 for i in v_oma if oma2['v'][i] and oma2['v'][i][3] == 255) >= 0.9 * len(v_oma), 'laiturien välinen vesi peittää taas')
        # Google-tilasta pois ja takaisin: googleSatama ei vaikuta omaan näkymään
        menu(p, 'mPort'); menu(p, 'mView'); p.wait_for_timeout(1500)
        ok(p.evaluate('__sim.boats.ryhma.visible') is True and not p.evaluate('__view.wmask.holeInfo().visible'), 'omassa näkymässä veneet piirtyvät, vaikka googleSatama = google')
        ok(not any(e[0] == 'pageerror' for e in errs), 'ei sivun virheitä (%s)' % [e[1][:90] for e in errs[:3]])
    finally:
        b.close()

def kierros(p):
    p.evaluate('async () => { await __radar.valmis(); __radar.taytaKierros(); __radar.piirra(); }')
    p.wait_for_timeout(400)
    return Image.open(io.BytesIO(p.query_selector('#radar').screenshot(timeout=120000))).convert('RGB')
def ero(a, b, kynnys=40):
    d = ImageChops.difference(a, b).convert('L'); px = d.load(); w, h = d.size
    return sum(1 for x in range(w) for y in range(h) if px[x, y] > kynnys)

def osa_tutka(pw):
    b, p, errs = avaa3o(pw)
    try:
        ok(valmis(p), 'ladattu')
        h, st = asema(p, etaisyys=60)
        # selvä vesipaikka sataman altaasta, kuten vaiheen 3l tutkakokeessa
        pt = p.evaluate("""([kx, kn]) => { const b = __sim.boats, o = Paikka.getOrigin(); let best = null;
            for (let dx = -300; dx <= 300; dx += 10) for (let dy = -300; dy <= 300; dy += 10) { const e = kx + dx, n = kn + dy; if (!window.__onVesi(e, n)) continue;
                const near = b.lahella(e - o.e, n - o.n, 60); const cl = near.length ? near[0].etaisyys : 60; if (cl < 30) continue;
                let hit = false; [0, 45, 90, 135].forEach(hh => { if (Tormays.check({ x: e - o.e, y: n - o.n, hdg: hh, v: 0 })) hit = true; }); if (hit) continue;
                const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { e, n, d, cl }; }
            return best; }""", [h['keski']['e'], h['keski']['n']])
        print('  altaan piste', json.dumps(pt), flush=True)
        ok(pt is not None, 'sataman altaasta löytyi vapaa piste')
        siirra(p, pt['e'], pt['n'], 0)
        menu(p, 'mView'); wait_wmask(p)
        menu(p, 'mPort')
        ok(p.evaluate('__sim.satama') == 'google' and p.evaluate('__view.wmask.holeInfo().visible'), 'googleSatama = google ja Google-kerros päällä')
        p.evaluate('__pl.setHeadUp(false); __pl.setRangeNm(0.25); __pl.recenter()')
        p.evaluate('__radar.asetaSuuntaYlos(false); __radar.asetaAlue(0.25)'); p.evaluate('async () => { await __radar.valmis(); }'); p.wait_for_timeout(2500)
        on1 = kierros(p); on2 = kierros(p)
        v = p.evaluate('__radar.tilasto().veneita'); print('  tutkan venehaku:', v, flush=True)
        ok(v > 10, 'tutka hakee omat veneet googleSatama-tilassa (%d venettä)' % v)
        p.evaluate('__sim.setBoats(false)'); p.wait_for_timeout(2500)
        off1 = kierros(p); off2 = kierros(p)
        e_on_off, e_on_on, e_off_off = ero(on1, off1), ero(on1, on2), ero(off1, off2)
        print('  tutkakuvan ero pikseleinä: päällä/pois %d, päällä/päällä %d, pois/pois %d' % (e_on_off, e_on_on, e_off_off), flush=True)
        ok(e_on_off > 3 * max(e_on_on, e_off_off, 10), 'veneet näkyvät tutkakuvassa googleSatama-tilassa (ero %d, kohina %d ja %d)' % (e_on_off, e_on_on, e_off_off))
        p.evaluate('__sim.setBoats(true)'); p.wait_for_timeout(1500)
        ok(p.evaluate('__sim.boats.ryhma.visible') is False, 'setBoats(true) ei tuo omia veneitä näkyviin googleSatama-tilassa')
        # törmäys: poijukentän vene (laiturista yli 30 m) ja alus sen päällä
        k = p.evaluate("""() => { const o = Paikka.getOrigin(); const vs = __sim.boats.ilmakuvaVeneet().filter(v => !v.maalla && !v.laituriin); const out = [];
            for (const v of vs) { Tormays.preload(v.e - o.e, v.n - o.n, 80); out.push({ e: v.e, n: v.n, s: v.suunta, id: v.id, l: v.pituus }); if (out.length >= 3) break; } return out; }""")
        print('  poijukentän veneitä kokeeseen', len(k), flush=True)
        for _ in range(60):
            if p.evaluate('Tormays.idle()'): break
            p.wait_for_timeout(1000)
        osuma = None
        for q in k:
            r = p.evaluate("""(q) => { const o = Paikka.getOrigin(); return Tormays.check({ x: q.e - o.e, y: q.n - o.n, hdg: q.s, v: 0 }); }""", q)
            print('   ', q['id'], json.dumps(r)[:160], flush=True)
            if r and r.get('kind') == 'vene': osuma = r; break
        ok(osuma is not None, 'törmäystarkistus (Tormays.check) osuu ilmakuvan veneeseen googleSatama-tilassa')
        ok(not any(e[0] == 'pageerror' for e in errs), 'ei sivun virheitä (%s)' % [e[1][:90] for e in errs[:3]])
    finally:
        b.close()

JS_AALLONMURTAJA = """() => { const out = { n: 0, vara: 0, kaikki: 0, lahimmat: [] }; __sim.boats.veneet.forEach(v => { if (v.maalla) return; out.kaikki++; if (__esto(v.e, v.n, 15)) { out.n++; if (v.lahde === 'laituri') out.vara++; } }); return out; }"""
def osa_vara(pw):
    b, p, errs = avaa3o(pw, extra='&venelahde=laituri', veneet='paketti')
    try:
        ok(valmis(p), 'ladattu (venelahde=laituri, ei ilmakuvan tiedostoa)')
        ok(p.evaluate('__sim.boats.ilmakuvaVeneet().length') == 0 and p.evaluate('__sim.boats.veneet.length') > 300, 'vain laiturialgoritmin veneitä (%d)' % p.evaluate('__sim.boats.veneet.length'))
        # aallonmurtaja: Naistenlahden länsipuolen niemeke (E 328049 ... 328097, N 6823741 ... 6823784 oli aiemmin täynnä veneitä)
        p.evaluate(JS_ESTO, [328250, 6823780, 1700])
        h = p.evaluate(JS_SATAMA3O, [328250, 6823780, 420]); st = p.evaluate('__sim.boatStats')
        print('  varakäytön tilasto:', json.dumps({k: st.get(k) for k in ('veneita', 'paikkoja', 'hylatty', 'esto')}), flush=True)
        ok((st['hylatty'].get('kapeaMaa', 0) + st['hylatty'].get('aallonmurtaja', 0)) > 0, 'aallonmurtajan ja kapean maan vuoksi hylättyjä paikkoja %d (aallonmurtaja %d, kapea maa %d)' % (st['hylatty'].get('kapeaMaa', 0) + st['hylatty'].get('aallonmurtaja', 0), st['hylatty'].get('aallonmurtaja', 0), st['hylatty'].get('kapeaMaa', 0)))
        r = p.evaluate(JS_AALLONMURTAJA)
        ok(r['n'] == 0, 'varakäytön veneistä ei yksikään ole alle 15 m:n päässä aallonmurtajasta tai kapeasta niemekkeestä (%d / %d)' % (r['n'], r['kaikki']))
        kohde = (328073, 6823762)
        def kuva_niemeke(nimi):
            e, n = 328100, 6823690
            siirra(p, e, n, 330)
            vapaa_kamera(p, e, n, 10, kohde[0], kohde[1], 0.5, 38)
            kuva_v3(p, nimi, 3500)
        kuva_niemeke('3o_naistenlahti_aallonmurtaja_jalkeen')
        # vertailu: ilman estoa (aallonmurtajaEtaisyys 0) algoritmi täyttäisi niemekkeen reunat veneillä
        t0 = p.evaluate('JSON.stringify(__sim.boatStats)')
        p.evaluate("(() => { __sim.boats.asetukset.aallonmurtajaEtaisyys = 0; __sim.boats.asetukset.kapeaMaa = { leveys: 0, pituus: 1e9, solu: 2 }; __sim.loadBoats(); })()")
        for _ in range(120):
            p.wait_for_timeout(1000)
            if p.evaluate('__sim.boatInit && !__sim.boatBusy') and p.evaluate('JSON.stringify(__sim.boatStats)') != t0: break
        p.wait_for_timeout(1500)
        r0 = p.evaluate("() => { let n = 0; __sim.boats.veneet.forEach(v => { if (!v.maalla && __esto(v.e, v.n, 10)) n++; }); return { n, kaikki: __sim.boats.veneet.length }; }")
        print('  ilman estoa (aallonmurtajaEtaisyys 0): alle 10 m kapeasta maasta %d venettä %d:sta' % (r0['n'], r0['kaikki']), flush=True)
        ok(r0['n'] > 0, 'vertailu: ilman estoa niemekkeen vieressä olisi veneitä (%d)' % r0['n'])
        kuva_niemeke('3o_naistenlahti_aallonmurtaja_ennen')
        ok(not any(e[0] == 'pageerror' for e in errs), 'ei sivun virheitä (%s)' % [e[1][:90] for e in errs[:3]])
    finally:
        b.close()

with sync_playwright() as pw:
    if 'kerros' in parts: print('== kerros ==', flush=True); osa_kerros(pw)
    if 'satama' in parts: print('== satama ==', flush=True); osa_satama(pw)
    if 'tutka' in parts: print('== tutka ==', flush=True); osa_tutka(pw)
    if 'varakaytto' in parts: print('== varakäyttö ==', flush=True); osa_vara(pw)
bad = [m for c, m in checks if not c]
print('\n%d / %d tarkistusta läpi' % (len(checks) - len(bad), len(checks)))
for m in bad: print('  VIRHE: ' + m)
sys.exit(1 if bad else 0)
