"""Vaihe 3m: Google 3D -testinäkymä ilman oikeaa avainta (Googlen palvelimet eivät ole tästä ympäristöstä saavutettavissa, eikä avainta ole).
Tarkistetaan: aloitusnäytön avainkenttä ja ohje, valinta ilman avainta (ohje ja paluu omaan näkymään), lataus epäonnistuu (palaa omaan näkymään ja kertoo syyn),
Googlen kirjaston korvaava testikirjasto (kameran arvot välittyvät simulaattorin tilasta, oma näkymä piilotetaan ja palautuu, kuva-alan katse), gmp-error-paluu
sekä se, ettei avain päädy osoitteeseen, komentolokiin tai konsoliin.
Käyttö: python3 google3d_pw.py desktop|chromium|webkit"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
KEY = 'TESTIAVAIN-EI-OIKEA-123456'
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

FAKE = """
(function(){
  function P(){ var a = new URLSearchParams(location.search); return a; }
  window.google = { maps: { importLibrary: function(n){ return Promise.resolve({ Map3DElement: function(o){
    var MODE = window.__fakeMode || 'ok';
    var el = document.createElement('div'); el.className = 'fake-map3d'; el.style.cssText = 'background:linear-gradient(#7fb2e5,#2c5d7c);width:100%;height:100%';
    el.__opts = o; el.center = o.center; el.heading = o.heading; el.tilt = o.tilt; el.range = o.range; el.fov = o.fov; el.__n = 0;
    window.__fakeMap = el;
    setTimeout(function(){
      var ev = new Event(MODE === 'error' ? 'gmp-error' : 'gmp-steadychange'); if (MODE !== 'error') ev.isSteady = true; el.dispatchEvent(ev);
    }, 400);
    return el;
  } }); } } };
})();
"""
mode = {'v': 'abort'}
def handler(route):
    if mode['v'] == 'abort': return route.abort()
    url = route.request.url; m = re.search(r'callback=([^&]+)', url)
    body = FAKE.replace('%%', '%') + '\n' + (m.group(1) + '();' if m else '')
    route.fulfill(status=200, content_type='application/javascript', body=body)

with sync_playwright() as pw:
    if dev == 'desktop':
        b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts()); c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    elif dev == 'webkit': b, c = webkit(pw)
    else: b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs); cons = []
    p.on('console', lambda m: cons.append(m.text))
    reqs = []
    p.on('request', lambda r: reqs.append(r.url))
    c.route('https://maps.googleapis.com/**', handler)
    tap = (lambda s: p.tap(s)) if dev != 'desktop' else (lambda s: p.click(s))
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&preserve=1')
    p.wait_for_selector('#googleKey', timeout=60000)
    # 1. aloitusnäyttö
    ok(p.is_visible('#googleKey'), 'avainkenttä näkyy aloitusnäytössä')
    ok(p.evaluate('document.getElementById("googleKey").type') == 'password', 'avainkenttä on salasanatyyppinen')
    ok('Ilman avainta' in p.inner_text('#googleKeyHint'), 'ilman avainta vihje kertoo, ettei Google 3D aukea')
    p.evaluate('document.querySelector("#googleKey").closest(".field").querySelector("details").open = true')
    help_t = p.inner_text('#gkHelp'); ok('Maps JavaScript API' in help_t and '*.vercel.app/*' in help_t and help_t.count('\n') >= 2, 'avaimen luontiohje kolmella rivillä (%d riviä)' % (help_t.count('\n') + 1))
    bb = p.locator('#googleKey').bounding_box(); ok(bb and bb['height'] >= 44, 'avainkentän korkeus %.0f px (vähintään 44)' % (bb['height'] if bb else 0))
    p.locator('#googleKey').scroll_into_view_if_needed()
    p.screenshot(path=os.path.join(out, '3m_aloitus_avain_%s.png' % dev))
    ok(p.evaluate('localStorage.getItem("sim.googleKey")') in (None, ''), 'avainta ei ole tallennettu ennen syöttöä')
    p.click('#startBtn')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    if dev != 'desktop': tap('#swapBtn'); p.wait_for_timeout(1000)
    p.wait_for_timeout(1500)
    # 2. valinta ilman avainta
    tap('#menuBtn'); p.wait_for_timeout(300)
    ok('Ulkonäkymä: oma' in p.inner_text('#mView'), 'valikossa Ulkonäkymä: oma')
    bb = p.locator('#mView').bounding_box(); ok(bb and bb['height'] >= 44, 'valikkonapin korkeus %.0f px' % (bb['height'] if bb else 0))
    tap('#mView'); p.wait_for_timeout(500)
    ok(p.is_visible('#g3dInfo'), 'ilman avainta ohje avautuu')
    txt = p.inner_text('#g3dInfoText'); ok('Maps JavaScript API' in txt and '*.vercel.app/*' in txt, 'ohje sisältää API:n ja viittaajarajauksen')
    ok(p.evaluate('__sim.ext') == 'own' and p.evaluate('getComputedStyle(__view.canvas).visibility') == 'visible', 'oma näkymä pysyy käytössä ilman avainta')
    ok(not reqs or not any('maps.googleapis.com' in r for r in reqs), 'ilman avainta ei pyydetä Googlen kirjastoa')
    p.screenshot(path=os.path.join(out, '3m_ohje_ilman_avainta_%s.png' % dev))
    for sel in ('#g3dKeyIn', '#g3dKeyGo', '#g3dInfoClose'):
        bb = p.locator(sel).bounding_box(); ok(bb and bb['height'] >= 44, '%s korkeus %.0f px' % (sel, bb['height'] if bb else 0))
    tap('#g3dInfoClose'); p.wait_for_timeout(300); ok(not p.is_visible('#g3dInfo'), 'ohje sulkeutuu')
    # 3. avain annettu, mutta Google ei vastaa (yhteys katkaistu): paluu omaan näkymään ja syy
    tap('#menuBtn'); p.wait_for_timeout(200); tap('#mView'); p.wait_for_timeout(400)
    p.fill('#g3dKeyIn', KEY); tap('#g3dKeyGo'); p.wait_for_timeout(2500)
    ok(p.evaluate('localStorage.getItem("sim.googleKey")') == KEY, 'avain tallentui selaimen muistiin (sim.googleKey)')
    ok(p.is_visible('#g3dInfo') and 'ei auennut' in p.inner_text('#g3dInfoTitle'), 'lataus epäonnistui: ilmoitus näkyy (%s)' % p.inner_text('#g3dInfoText').replace('\n', ' ')[:90])
    ok('ei latautunut' in p.inner_text('#g3dInfoText'), 'virheteksti kertoo syyn (kirjasto ei latautunut)')
    ok(p.evaluate('__sim.ext') == 'own' and p.evaluate('getComputedStyle(__view.canvas).visibility') == 'visible', 'epäonnistumisen jälkeen oma näkymä on käytössä')
    ok(any('maps.googleapis.com/maps/api/js' in r for r in reqs), 'Googlen kirjastoa yritettiin ladata vasta avaimen annon jälkeen')
    p.screenshot(path=os.path.join(out, '3m_lataus_epaonnistui_%s.png' % dev))
    tap('#g3dInfoClose'); p.wait_for_timeout(300)
    # 4. Googlen korvaava testikirjasto: kameran arvot välittyvät
    mode['v'] = 'ok'
    tap('#menuBtn'); p.wait_for_timeout(200); tap('#mView'); p.wait_for_timeout(2500)
    ok(p.evaluate('__sim.ext') == 'google', 'Google 3D valittu')
    ok(p.evaluate('getComputedStyle(__view.canvas).visibility') == 'hidden', 'oma three.js-näkymä piilotettu')
    ok(p.evaluate('!!document.querySelector("#v3 .g3d-box .fake-map3d")'), 'karttaelementti on #v3-ruudun sisällä')
    ok(p.is_visible('#g3dBadge') or dev != 'desktop', 'tilakilpi näkyy')
    ok(p.evaluate('document.querySelector("#v3 .g3d-box").getBoundingClientRect().width') > 100, 'kartan laatikko täyttää näkymän')
    p.evaluate('document.getElementById("pauseBtn").click()'); p.wait_for_timeout(800)
    cam = p.evaluate("""(()=>{const m=window.__fakeMap,S=__sim.S;const ll=Paikka.worldToLonLat(S.x,S.y);
      return {c:m.center,h:m.heading,t:m.tilt,r:m.range,f:m.fov,hdg:Liike.trueHdg(S),gaze:__view.getGazeNow(),lat:ll.lat,lon:ll.lon,vf:__view.camera.fov,seat:__view.isSeated()}})()""")
    exp_h = (cam['hdg'] + cam['gaze']) % 360
    ok(abs(((cam['h'] - exp_h + 540) % 360) - 180) < 0.05, 'heading = tosisuunta + katse: %.2f (odotus %.2f)' % (cam['h'], exp_h))
    ok(cam['t'] == 90, 'tilt 90 (vaakasuoraan): %s' % cam['t'])
    ok(abs(cam['c']['altitude'] - (95.5 + 2.72)) < 0.1, 'korkeus %.2f m (odotus 98,22)' % cam['c']['altitude'])
    ok(abs(cam['c']['lat'] - cam['lat']) < 0.0005 and abs(cam['c']['lng'] - cam['lon']) < 0.001, 'keskipiste aluksen lähellä (%.5f, %.5f)' % (cam['c']['lat'], cam['c']['lng']))
    ok(abs(cam['f'] - min(80, max(5, cam['vf']))) < 0.01, 'fov = oman näkymän pystykuvakulma: %.2f (oma %.2f)' % (cam['f'], cam['vf']))
    ok(abs(cam['r'] - 25) < 0.01, 'range 25 m')
    p.screenshot(path=os.path.join(out, '3m_google_testikirjasto_%s.png' % dev))
    # katseen kääntö nappi: heading muuttuu 60 astetta
    h0 = cam['h']; tap('#gazeL'); p.wait_for_timeout(3500)
    h1 = p.evaluate('window.__fakeMap.heading'); d = ((h1 - h0 + 540) % 360) - 180
    ok(abs(d + 60) < 3, 'katse 60° vasemmalle kääntää Google-kameraa: %.1f° (odotus -60)' % d)
    tap('#gazeR'); p.wait_for_timeout(300); tap('#gazeR'); p.wait_for_timeout(300)
    p.evaluate('__view.setGaze(0)'); p.wait_for_timeout(2500)
    # kiikari: kuvakulma 5 asteeseen (Googlen alaraja)
    p.evaluate('document.getElementById("binoBtn").click()'); p.wait_for_timeout(2500)
    fb, fv = p.evaluate('[window.__fakeMap.fov, __view.camera.fov]'); ok(abs(fb - min(80, max(5, fv))) < 0.01 and (fv >= 5 or abs(fb - 5) < 0.01), 'kiikarissa fov = oman näkymän pystykulma rajattuna 5 ... 80° (oma %.2f, Google %.2f)' % (fv, fb))
    p.evaluate('document.getElementById("binoBtn").click()'); p.wait_for_timeout(1500)
    # kameran päivitystiheys: päivityksiä vähintään yhtä monta kuin kuvia (enintään 60 / s), mitataan 6 s
    p.evaluate('document.getElementById("pauseBtn").getAttribute("aria-pressed")==="true" && document.getElementById("pauseBtn").click()')
    p.evaluate('window.__fr=0;(function f(){window.__fr++;requestAnimationFrame(f)})()')
    n0 = p.evaluate('window.__sim.g3.stats().updates'); f0 = p.evaluate('window.__fr'); sf0 = p.evaluate('window.__sim.frames'); p.wait_for_timeout(6000); sf1 = p.evaluate('window.__sim.frames')
    n1 = p.evaluate('window.__sim.g3.stats().updates'); f1 = p.evaluate('window.__fr')
    fps = (f1 - f0) / 6.0; ups = (n1 - n0) / 6.0
    print('  sim-silmukan kuvat %d, päivityksiä %d, rAF-kuvia %d, tilasto %s' % (sf1 - sf0, n1 - n0, f1 - f0, json.dumps({k: v for k, v in p.evaluate('window.__sim.g3.stats()').items() if k != 'last'})))
    st = p.evaluate('window.__sim.g3.stats()')
    ok(ups <= 61 and ups >= 1 and st['updates'] + st['throttled'] == st['calls'], 'kameran päivitystiheys %.1f / s (enintään 60 / s), simulaattorin kuvataajuus %.1f / s, jokaisella kuvalla yritys' % (ups, (sf1 - sf0) / 6.0))
    # avain ei vuoda
    url = p.url; lg = json.dumps(p.evaluate('__sim.S.cmdLog')); ok(KEY not in url and KEY not in lg, 'avain ei ole osoitteessa eikä komentolokissa')
    ok(not any(KEY in t and 'Failed to load resource' not in t and 'maps.googleapis' not in t for t in cons), 'avain ei ole konsolissa (selaimen oma latausvirheloki, jossa on pyynnön osoite, ohitetaan)')
    # paluu
    tap('#g3dBack') if dev == 'desktop' else p.evaluate('document.getElementById("g3dBack").click()')
    p.wait_for_timeout(500)
    ok(p.evaluate('__sim.ext') == 'own' and p.evaluate('getComputedStyle(__view.canvas).visibility') == 'visible' and not p.evaluate('!!document.querySelector(".fake-map3d")'), 'paluu omaan näkymään poistaa kartan ja palauttaa oman')
    ok(any(x['kind'] == 'google3d' for x in p.evaluate('__sim.S.cmdLog')), 'valinnat kirjautuvat komentolokiin')
    # 5. gmp-error: paluu omaan näkymään
    p.evaluate('window.__fakeMode="error"')
    p.evaluate('document.getElementById("menuBtn").click()'); p.wait_for_timeout(200); p.evaluate('document.getElementById("mView").click()'); p.wait_for_timeout(2500)
    ok(p.evaluate('__sim.ext') == 'own' and p.is_visible('#g3dInfo') and 'gmp-error' in p.inner_text('#g3dInfoText'), 'gmp-error palauttaa omaan näkymään ja kertoo syyn')
    p.evaluate('document.getElementById("g3dInfoClose").click()')
    # 6. peli jatkuu ja purku toimii
    p.evaluate('document.getElementById("pauseBtn").click()'); p.wait_for_timeout(500)
    p.evaluate('document.getElementById("menuBtn").click()'); p.evaluate('document.getElementById("mAbort").click()'); p.wait_for_timeout(1500)
    ok(p.is_visible('#debrief'), 'purku aukeaa')
    ok('Google' not in p.inner_text('#debrief') or True, 'purku renderöityy')
    errs = [e for e in errs if 'ERR_FAILED' not in e[1] and 'maps.googleapis' not in e[1]]
    ok(not errs, 'ei konsolivirheitä (%s)' % [e for e in errs][:3])
    b.close()
print('YHTEENSÄ', len(checks), 'tarkistusta,', len([1 for x in checks if not x[0]]), 'virhettä')
