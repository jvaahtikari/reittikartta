"""Vaihe 3g: kuvat samasta paikasta kuin käyttäjän kuvakaappauksessa (Vapaa ajo, Mustalahden edusta, tosisuunta 347°, nopeus 0).
Käyttö: python3 kuva3g_pw.py <sim-osoite> <kuvan nimi> [kiikari] [kulma=27] [x=1254] [y=1541] [leveys=1914] [korkeus=1021] [pb=0.55]
Paikka (x, y) on ruutukoordinaatteina vapaan ajon origosta (Mustalahti): oletus 1254, 1541 on Koukkuniemen viitan (nl 5) lounaispuolella 30 m:n päässä, jolloin viitta on vasemmalla edessä ja Uusikarin viitat (nl 5 ja 6) noin 1,2 km päässä oikealla.
sim-osoite on lähdesivun osoite (esim. http://127.0.0.1:8154/ nykyiselle ja http://127.0.0.1:8156/ vanhalle versiolle).
Kuva tallentuu hakemistoon shots/. Kun toinen argumentti 'kiikari' on annettu, kiikari kytketään nappia painamalla ja katse käännetään kulman (aste, suhteessa keulaan) suuntaan."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
base = sys.argv[1]; name = sys.argv[2]
kw = dict(x.split('=', 1) for x in sys.argv[3:] if '=' in x)
bino = 'kiikari' in sys.argv[3:]
W = int(kw.get('leveys', 1914)); H = int(kw.get('korkeus', 1021))
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(base + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true; __view.setPixelBudget(%s)' % kw.get('pb', '0.55'))
    # tosisuunta 347 ja nopeus 0, tauko, siirto kuvauspaikkaan ja merkkien lataus
    p.evaluate('document.getElementById("pauseBtn").click()')
    X = float(kw.get('x', '1254')); Y = float(kw.get('y', '1541'))
    p.evaluate('(()=>{const S=__sim.S; S.x=%f; S.y=%f; S.hdg=347-S.conv; S.orderHdg=347; if(S.hmHdg!==undefined) S.hmHdg=347; S.v=0; S.orderSpeedKn=0;})()' % (X, Y))
    p.evaluate('Merkit.load(%f,%f,7500).then(()=>{window.__aidsOk=true})' % (X, Y))
    p.wait_for_function('window.__aidsOk===true', timeout=120000)
    for _ in range(80):
        p.wait_for_timeout(1000)
        if p.evaluate('__view.terrain.idle() && (!__view.piers || __view.piers.idle())'): break
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
    if bino:
        ang = float(kw.get('kulma', '27'))
        p.evaluate('document.getElementById("binoBtn").click()')
        p.evaluate('__view.setGaze(%f)' % ang)
    p.wait_for_timeout(9000)
    p.screenshot(path=os.path.join(out, name + '.png'))
    info = p.evaluate('JSON.stringify({hfov:__view.hfov(), gaze:__view.getGazeNow(), calls:__view.rendererStats().calls, aids:__view.aids.tilasto()})')
    print(name, info)
    print('virheet', errs[:5])
    b.close()
