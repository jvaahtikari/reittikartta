"""Vaihe 3j: ennen- ja jälkeen-kuvat kolmesta katselupisteestä (A, B, C) samalla sivulla, yksi selain kerrallaan.
Käyttö: python3 kuva3j_pw.py <sim-osoite> <tunniste: ennen|jalkeen|muu> <laite: deck|pixel> <pisteet esim. A,B,C> [aika=...] [pb=0.8] [ulos=hakemisto] [nimi=3j] [laatu=full|light] [vaihe=3|4|5|9] [pre=3j_final_ suf=_aamu]
Pisteet (TM35FIN, ruutusuunta lasketaan tosisuunnasta): A Naistenlahden satama (tosisuunta 112, käyttäjän kuva), B Mustalahden edusta kohti kaupunkia
(Näsinneula ja Tampellan piippu näkyvissä), C Siilinkarin ohitus 150 m lännestä kohti itärantaa.
Aika: ISO-aika UTC:nä (oletus 2026-07-15T09:00:00Z eli klo 12.00 Helsingin aikaa), aamu 2026-07-15T04:00:00Z (klo 7.00), ilta 2026-07-15T16:30:00Z (klo 19.30).
Jokaisesta pisteestä tallentuu koko ruutu (deck 1440 x 900 tai Pixel 7 pystyssä) nimellä <nimi>_<piste>_<tunniste>[_pixel7].png ja deckistä lisäksi pelkkä 3D-ikkuna (_3d.png)."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; tag = sys.argv[2]; dev = sys.argv[3]; pts = sys.argv[4].split(',')
kw = dict(x.split('=', 1) for x in sys.argv[5:] if '=' in x)
ULOS = kw.get('ulos') or os.path.join(os.path.dirname(__file__), '..', 'shots')
NIMI = kw.get('nimi', '3j')
T0 = kw.get('aika', '2026-07-15T09:00:00Z')
PB = kw.get('pb', '0.8')
POINTS = {'A': (328010, 6823830, 112.0), 'B': (327330, 6824000, 182.0), 'C': (327895, 6824881, 100.0), 'D': (324000, 6829750, 280.0)}
ORIGIN = (327184, 6823553)


def wait_idle(p, secs=170):
    for _ in range(secs):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'):
            break


with sync_playwright() as pw:
    if dev == 'pixel':
        b, c = chromium(pw)
    else:
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
        c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    if kw.get('vaihe'): p.add_init_script('window.__maastoStage=%s;' % kw['vaihe'])
    extra = '&laatu=' + kw['laatu'] if kw.get('laatu') else ''
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&t=' + T0 + extra)
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=240000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(%s)' % PB)
    p.evaluate('document.getElementById("pauseBtn").click()')
    if dev == 'pixel':
        p.evaluate('(()=>{const b=document.getElementById("swapBtn"); if(b && !b.hidden) b.click();})()')
    for k in pts:
        E, N, hdg = POINTS[k]
        X, Y = E - ORIGIN[0], N - ORIGIN[1]
        p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=%f-S.conv; S.orderHdg=%f; if(S.hmHdg!==undefined) S.hmHdg=%f; S.v=0; S.orderSpeedKn=0;})()' % (X, Y, hdg, hdg, hdg))
        p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
        p.wait_for_function('window.__aidsOk===true', timeout=150000)
        wait_idle(p)
        p.evaluate('__view.setSimTime(%d)' % int(__import__('datetime').datetime.fromisoformat(T0.replace('Z', '+00:00')).timestamp() * 1000))
        p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
        p.wait_for_timeout(4000)
        if kw.get('pre'): name = '%s%s%s%s' % (kw['pre'], k, kw.get('suf', ''), '_pixel7' if dev == 'pixel' else '')   # 3j-2: nimi = pre + piste + suf (+ _pixel7)
        else: name = '%s_%s_%s%s' % (NIMI, k, tag, '_pixel7' if dev == 'pixel' else '')
        p.screenshot(path=os.path.join(ULOS, name + '.png'), timeout=300000)
        el = p.query_selector('#v3')
        if el:
            try: el.screenshot(path=os.path.join(ULOS, name + '_3d.png'), timeout=300000)
            except Exception as e_: print('3d-kuva ei onnistunut', str(e_)[:80])
        info = p.evaluate('JSON.stringify({r:__view.rendererStats(), levels:__view.terrain.levels(), t:__view.terrain.info().trees, st:__view.terrain.info().stats})')
        print(name, info, flush=True)
    print('virheet', errs[:6])
    b.close()
