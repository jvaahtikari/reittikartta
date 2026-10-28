"""Vaihe 3b kriteeri 2: kaikki Näsijärven turvalaitteet simulaattorin Merkit-tietovarastosta piirretään merimerkkimoduulin malleilla (ei varamalleja).
Lataa laitteet koko järven alueelta pala kerrallaan simulaattorin omalla Merkit.load-funktiolla ja kutsuu Merimerkit3D.luoInstanssit-funktiota."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
with sync_playwright() as pw:
    b, c = chromium(pw)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?e=333250&n=6848800&h=0&budget=2')
    p.wait_for_function('window.__lm===true && window.__aids===true', timeout=120000)
    t0 = time.time()
    centers = [(e, n) for e in range(316000, 347500, 6000) for n in range(6821000, 6880000, 6000)]
    res = p.evaluate('''async (cs) => {
        const out = [];
        const ws = cs.map(([e, n]) => Paikka.enToWorld(e, n));
        for (let i = 0; i < ws.length; i += 6) await Promise.all(ws.slice(i, i + 6).map(w => Merkit.load(w.x, w.y, 4500)));
        return Merkit.all().length;
    }''', centers)
    print('ladattu', res, 'laitetta', round(time.time() - t0, 1), 's')
    r = p.evaluate('''() => {
        Merimerkit3D.tyhjennaLoki();
        const list = Merkit.all().map(a => { const gz = 0; return { turvalaite: a, x: a.x, y: a.y, z: 0 }; });
        const g = Merimerkit3D.luoInstanssit(list, { ylos: 'y', tulostaLoki: false });
        const byModel = {}; g.traverse(o => { if (o.isInstancedMesh) byModel[o.userData.malli] = (byModel[o.userData.malli] || 0) + o.userData.lukumaara; });
        const tys = {}; Merkit.all().forEach(a => { const k = a.tyyppi + '/' + a.nl; tys[k] = (tys[k] || 0) + 1; });
        const si = Merkit.all().filter(a => a.nimi === 'Siilinkari').map(a => a.tyyppi + ' ' + a.numero);
        return { n: list.length, tilasto: g.userData.tilasto, byModel, tyypit: tys, loki: Merimerkit3D.loki.slice(), siilinkari: si };
    }''')
    print(json.dumps(r, ensure_ascii=False, indent=1))
    print('virheet', errs[:5])
    b.close()
