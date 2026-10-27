"""Vaihe 3l: yhteiset apurit veneiden kuville, tutkalle, törmäykselle ja suorituskyvylle (Playwright, simulaattori.html).
Satamat: Naistenlahti (E 328250, N 6823780, sade 420 m) ja Mustalahti (E 326940, N 6823415, sade 170 m), kuten veneet/esikatselu.html."""
import sys, os, json, math, time
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
SHOTS = os.path.join(os.path.dirname(__file__), '..', 'shots')
SATAMAT = {'naistenlahti': (328250, 6823780, 420), 'mustalahti': (326940, 6823415, 170)}

JS_ONVESI = """async ([cx, cy, reach]) => {
  const ll = Paikka.enToLonLat(cx, cy), tp = Paikka.lonlatToTile(ll.lon, ll.lat, 16), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / 65536, k = Math.ceil(reach / size) + 1, jobs = [], kuv = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const tx = Math.floor(tp.x) + dx, ty = Math.floor(tp.y) + dy;
    jobs.push(Aineisto.layers(16, tx, ty, ['maastokuvio']).then(r => { if (r && r.maastokuvio) kuv.push({ z: 16, x: tx, y: ty, layer: r.maastokuvio }); })); }
  await Promise.all(jobs); window.__onVesi = Veneet3D.luoVesiTesti(kuv); return kuv.length; }"""

JS_SATAMA = """([cx, cy, sade]) => {
  const b = __sim.boats, onVesi = window.__onVesi;
  const vs = b.veneet.filter(v => v.lahde === 'laituri' && Math.hypot(v.e - cx, v.n - cy) <= sade);
  const luok = { soutu: 0, pieni: 0, keski: 0, purje: 0 }; vs.forEach(v => luok[v.luokka]++);
  let kx = 0, kn = 0; vs.forEach(v => { kx += v.e; kn += v.n; }); if (vs.length) { kx /= vs.length; kn /= vs.length; } else { kx = cx; kn = cy; }
  let paras = 0, pp = -1;
  for (let a = 0; a < 360; a += 10) { let d = 0; while (d < 1200 && onVesi(kx + Math.sin(a * Math.PI / 180) * (d + 25), kn + Math.cos(a * Math.PI / 180) * (d + 25))) d += 25; if (d > pp) { pp = d; paras = a; } }
  const ox = Math.sin(paras * Math.PI / 180), on = Math.cos(paras * Math.PI / 180); let reuna = 0; vs.forEach(v => { reuna = Math.max(reuna, (v.e - kx) * ox + (v.n - kn) * on); });
  return { veneita: vs.length, luokittain: luok, keski: { e: kx, n: kn }, avoin: paras, avoinMatka: pp, reuna: reuna }; }"""

def avaa(pw, dev='deck', laatu=None, extra='', naytot='both', t='2026-07-15T09:00:00Z', harj='free', timeout=240000):
    """Avaa simulaattorin (deck 1440 x 900, Pixel 7 Chromium tai iPhone 14 WebKit), odottaa ajotilaa ja veneiden latausta. Palauttaa (b, p, errs)."""
    if dev == 'pixel': b, c = chromium(pw)
    elif dev == 'iphone': b, c = webkit(pw)
    else:
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    q = SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=' + harj + '&preserve=1&naytot=' + naytot + '&t=' + t + ('&laatu=' + laatu if laatu else '') + extra
    p.goto(q)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=timeout)
    p.evaluate('window.__adaptOff=true')
    p.evaluate('document.getElementById("pauseBtn").click()')
    if dev != 'deck': p.evaluate('(()=>{const b=document.getElementById("swapBtn"); if(b && !b.hidden) b.click();})()')
    return b, p, errs

JS_TILA = """(() => ({ terrain: __view.terrain.idle(), piers: __view.piers.idle(), bridges: __view.bridges.idle(), tormays: Tormays.idle(), boatInit: __sim.boatInit, boatBusy: __sim.boatBusy, stats: !!__sim.boatStats && !__sim.boatStats.virhe }))()"""
def valmis(p, secs=240):
    """Odottaa maaston, laiturien, siltojen, törmäysruutujen ja veneiden latausta."""
    for _ in range(secs):
        p.wait_for_timeout(1000)
        t = p.evaluate(JS_TILA)
        if t['terrain'] and t['piers'] and t['bridges'] and t['tormays'] and t['boatInit'] and not t['boatBusy'] and t['stats']: return True
    print('valmis-aikakatkaisu', t, flush=True)
    return False

def siirra(p, e, n, ruutusuunta, odota=True):
    """Alus paikalleen (TM35FIN, ruutusuunta), nopeus 0. Lataukset käynnistyvät silmukassa, odottaa niiden valmistumista."""
    p.evaluate('''([e, n, h]) => { const G = __sim, S = G.S, o = Paikka.getOrigin(); S.x = e - o.e; S.y = n - o.n;
        const ll = Paikka.worldToLonLat(S.x, S.y); S.conv = Paikka.convergenceDeg(ll.lon, ll.lat); S.hdg = ((h % 360) + 360) % 360;
        S.pending = []; S.sternTurn = null; S.hmStern = null; S.orderHdg = (S.hdg + S.conv + 360) % 360; S.hmHdg = S.orderHdg; S.rate = 0; S.rudder = 0; S.rudderCmd = 0; S.v = 0; S.orderSpeedKn = 0; G.frozen = false; G.collision = null; }''', [e, n, ruutusuunta])
    p.evaluate('Tormays.preload(__sim.S.x, __sim.S.y, 300)')
    p.evaluate('Merkit.load(__sim.S.x, __sim.S.y, 2500)')
    p.evaluate('__view.piers.sync(__sim.S.x, __sim.S.y, true)')
    p.wait_for_timeout(1500)
    if odota:
        ok = valmis(p)
        p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
        return ok

def satama(p, nimi):
    """Rakentaa vesitestin ja laskee sataman tiedot (veneet luokittain, keskipiste, avoimen veden suunta, uloimman veneen etäisyys)."""
    cx, cy, sade = SATAMAT[nimi]
    p.evaluate(JS_ONVESI, [cx, cy, 1700])
    return p.evaluate(JS_SATAMA, [cx, cy, sade])

def satama_asema(h, etaisyys):
    """Aluksen paikka avoimen veden puolella etäisyyden (m) päässä uloimmasta veneestä ja ruutusuunta sataman keskustaan."""
    a = math.radians(h['avoin']); d = h['reuna'] + etaisyys
    e = h['keski']['e'] + math.sin(a) * d; n = h['keski']['n'] + math.cos(a) * d
    return e, n, (h['avoin'] + 180) % 360

def kuva(p, nimi, odota=2500, dev=''):
    p.wait_for_timeout(odota)
    path = os.path.join(SHOTS, nimi + '.png')
    p.screenshot(path=path, timeout=300000)
    return path

def vapaa_kamera(p, e, n, korkeus, kohde_e, kohde_n, kohde_h, fov, runko=False):
    """Vapaa kamera (TM35FIN-koordinaatit): paikka (e, n, korkeus), katse (kohde_e, kohde_n, kohde_h), pystykuvakulma fov. Aluksen runko piilotetaan, ellei runko=True."""
    p.evaluate("""([e, n, h, te, tn, th, fov, runko]) => { const o = Paikka.getOrigin(); __view.setFree([e - o.e, h, -(n - o.n)], [te - o.e, th, -(tn - o.n)], fov); __view.boat.boat.visible = !!runko; }""", [e, n, korkeus, kohde_e, kohde_n, kohde_h, fov, runko])

def tyhja_kamera(p):
    p.evaluate("__view.clearFree(); __view.boat.boat.visible = true")
