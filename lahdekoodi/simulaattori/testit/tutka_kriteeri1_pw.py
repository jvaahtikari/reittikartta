"""Vaihe 3c, kriteeri 1: tutka simulaattorin sisällä vastaa esikatselun tutkaa Siilinkarin kohdalla alueella 1,5 mpk.
Ajetaan simulaattori (vapaa ajo, tauko), asetetaan alus Siilinkarin kohtaan (E 328045, N 6824881), pohjoinen ylös, ja verrataan
(1) sädekohtaista ensimmäistä osumaa esikatselun testisivun (hakemisto /home/claude/tutka, portti 8143) tutkaan kaikilla 360 säteellä,
(2) kuvakaappauksia: simulaattorin tutka, esikatselun tutka ja niiden erotus. Esikatselu: python3 -m http.server 8143 hakemistossa /home/claude/tutka."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
E, N = 328045, 6824881
ESI = os.environ.get('TUTKA', 'http://127.0.0.1:8143/')
with sync_playwright() as pw:
    b, c = chromium(pw)
    errs = []
    # esikatselun tutka (ei kopio simulaattorin tutkasta, vaan /home/claude/tutka/tutka.js)
    pe = c.new_page(); collect(pe, errs)
    pe.goto(ESI + 'testit/testisivu.html?ui=0&aineisto=' + PAKETTI); pe.wait_for_function('window.T')
    pe.evaluate('window.T.asetaAlue(1.5); window.T.asetaSuuntaYlos(false)')
    pe.evaluate('([E,N])=>{T.paivita({e:E,n:N,suunta:0,nopeus:0,aika:1000});return T.valmis()}', [E, N])
    pe.evaluate('(async()=>{await T.valmis();T.taytaKierros();T.piirra();})()'); pe.wait_for_timeout(500)
    ref = pe.evaluate('T.testi.ensiOsumat()')
    pe.locator('canvas').screenshot(path=os.path.join(out, '_3c_k1_esikatselu.png'))
    ge = pe.evaluate('(()=>{const g=T.testi.geom();return [g.cx,g.cy,g.r,devicePixelRatio]})()')
    # simulaattorin tutka
    p = c.new_page(); collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&naytot=radar')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=100000)
    p.keyboard.press('p'); p.wait_for_timeout(600)
    p.evaluate('([E,N])=>{const G=__sim,o=G.origin;G.S.x=E-o.e;G.S.y=N-o.n;G.S.v=0;G.S.hdg=0;G.S.conv=0;__radar.asetaSuuntaYlos(false);__radar.asetaAlue(1.5);}', [E, N])
    p.wait_for_timeout(1500)
    p.evaluate('__radar.valmis()'); p.wait_for_timeout(2000)
    sim = p.evaluate('(()=>{const l=__radar.lue();return {e:l.e,n:l.n,alue:l.alue,suuntaYlos:l.suuntaYlos}})()')
    print('sim tila', sim)
    p.evaluate('(async()=>{await __radar.valmis();__radar.taytaKierros();__radar.piirra();})()'); p.wait_for_timeout(500)
    got = p.evaluate('__radar.testi.ensiOsumat()')
    p.locator('#radar').screenshot(path=os.path.join(out, '_3c_k1_sim.png'))
    gs = p.evaluate('(()=>{const g=__radar.testi.geom();return [g.cx,g.cy,g.r,devicePixelRatio]})()')
    from PIL import Image, ImageDraw, ImageChops
    def kaiva(fn, g):
        im = Image.open(fn).convert('RGB'); k = g[3]
        return im.crop((int((g[0] - g[2]) * k), int((g[1] - g[2]) * k), int((g[0] + g[2]) * k), int((g[1] + g[2]) * k))).resize((560, 560), Image.LANCZOS)
    A = kaiva(os.path.join(out, '_3c_k1_esikatselu.png'), ge); B = kaiva(os.path.join(out, '_3c_k1_sim.png'), gs)
    W = Image.new('RGB', (560 * 3 + 40, 620), (10, 20, 30)); W.paste(A, (0, 60)); W.paste(B, (580, 60)); W.paste(ImageChops.difference(A, B), (1160, 60))
    d = ImageDraw.Draw(W); d.text((10, 20), 'Esikatselu (tutka.js, /home/claude/tutka)', fill=(230, 240, 250)); d.text((590, 20), 'Simulaattori (js/tutka.js, jaettu Aineisto)', fill=(230, 240, 250)); d.text((1170, 20), 'Erotus', fill=(230, 240, 250))
    W.save(os.path.join(out, '3c_kriteeri1_vertailu_siilinkari_1-5_mpk.png'))
    d = [abs(a - b2) for a, b2 in zip(got['h'], ref['h'])]
    n_hit = sum(1 for x in ref['h'] if x > 0)
    print('sädettä', got['n'], ref['n'], 'osumia', n_hit, 'suurin ero', max(d), 'm, täsmääviä', sum(1 for x in d if x < 0.01))
    # kolme sädettä erikseen, valitaan eri etäisyyksiltä (lähin, keskimatka, kaukainen)
    cand = sorted([(x, i) for i, x in enumerate(ref['h']) if x > 0])
    picks = [cand[len(cand) // 20], cand[len(cand) // 2], cand[-len(cand) // 20]]
    res = []
    for (x, i) in picks:
        th = i * 360 / ref['n']
        a = p.evaluate('(th)=>__radar.testi.profiili(th).ensiOsuma', th); r2 = pe.evaluate('(th)=>T.testi.profiili(th).ensiOsuma', th)
        res.append({'suunta_aste': th, 'esikatselu_m': round(r2, 2), 'simulaattori_m': round(a, 2), 'ero_m': round(abs(a - r2), 3)})
        print('säde', res[-1])
    json.dump({'paikka': [E, N], 'alue_mpk': 1.5, 'sateita': got['n'], 'osumia': n_hit, 'suurin_ero_m': max(d), 'kolme_sädettä': res}, open(os.path.join(os.path.dirname(__file__), 'tulos_3c_kriteeri1.json'), 'w'), indent=1, ensure_ascii=False)
    print('virheet', errs[:5])
    b.close()
