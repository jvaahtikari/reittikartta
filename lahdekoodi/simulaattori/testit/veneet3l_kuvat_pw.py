"""Vaihe 3l, kriteeri 1: kuvat 3l_*. Käyttö: python3 veneet3l_kuvat_pw.py <deck|pixel> [laatu].
deck (1440 x 900): Naistenlahti 150 m päästä (vapaa kamera 6 m ja aluksen silmäpiste), laiturin vierestä 20 m, lähikuva (pohja ei näy veden läpi), Mustalahti.
pixel (Pixel 7, kevyt laatu): Naistenlahti 150 m."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'deck'
laatu = sys.argv[2] if len(sys.argv) > 2 else None
res = {}
def stats(p):
    return p.evaluate('(()=>{const r=__view.rendererStats(); const t=__sim.boats.tilasto(); return {kutsut:r.calls, kolmiot:r.triangles, laatu:__view.getQuality(), lahi:t.viimeinen.lahi, kauko:t.viimeinen.kauko, poijut:t.viimeinen.poijut, boatKolmiot:t.viimeinen.kolmiot}})()')
with sync_playwright() as pw:
    b, p, errs = avaa(pw, dev, laatu)
    print('boatStats', json.dumps(p.evaluate('__sim.boatStats')), flush=True)
    hn = satama(p, 'naistenlahti'); hm = satama(p, 'mustalahti')
    print('Naistenlahti', json.dumps(hn), flush=True); print('Mustalahti', json.dumps(hm), flush=True)
    res['naistenlahti'] = hn; res['mustalahti'] = hm; res['laatu'] = p.evaluate('__view.getQuality()')
    k = hn['keski']; a = math.radians(hn['avoin'])
    if dev == 'deck':
        # 1. Naistenlahti 150 m uloimmasta veneestä: alus ja vapaa kamera (6 m)
        e, n, h = satama_asema(hn, 150); ok = siirra(p, e, n, h); print('NL150 valmis', ok, flush=True)
        vapaa_kamera(p, e, n, 6, k['e'] + math.sin(a) * hn['reuna'] * 0.2, k['n'] + math.cos(a) * hn['reuna'] * 0.2, 2, 17)
        kuva(p, '3l_naistenlahti_150m_deck', 4000); res['nl150_vapaa'] = stats(p); print('NL150 vapaa', json.dumps(res['nl150_vapaa']), flush=True)
        tyhja_kamera(p); p.evaluate('__view.setGaze(0)')
        kuva(p, '3l_naistenlahti_150m_silmapiste', 3000); res['nl150_silmapiste'] = stats(p)
        # 2. laiturin vierestä 20 m: laituri, jolla on eniten veneitä sataman keskellä
        g = p.evaluate("""() => { const c = %s, v = __sim.boats.veneet.filter(v => v.lahde === 'laituri' && Math.hypot(v.e - c.e, v.n - c.n) < 120), m = {}; v.forEach(x => { (m[x.kiinnitys.laituri] = m[x.kiinnitys.laituri] || []).push(x); });
            let best = null; Object.keys(m).forEach(k => { if (!best || m[k].length > best.length) best = m[k]; });
            const v0 = best[0]; let mx = 0, mn = 0; best.forEach(x => { mx += x.e; mn += x.n; });
            const cand = []; const dirE = Math.sin(v0.suunta * Math.PI / 180), dirN = Math.cos(v0.suunta * Math.PI / 180), re = v0.kiinnitys.reuna;
            [12, -12, 20, -20, 6, -6, 30, -30, 0].forEach(s => { const px = re.e - dirE * 20 - dirN * s, pn = re.n - dirN * 20 + dirE * s; let vapaa = window.__onVesi(px, pn);
                __sim.boats.veneet.forEach(x => { if (Math.hypot(x.e - px, x.n - pn) < 6 + x.pituus / 2) vapaa = false; }); if (vapaa) cand.push([px, pn]); });
            return { pos: cand[0], keski: [mx / best.length, mn / best.length], suunta: v0.suunta, n: best.length, reuna: [re.e, re.n] }; }""" % json.dumps(k))
        print('laituri', json.dumps(g), flush=True); res['laituri'] = g
        px, pn = g['pos']; ok = siirra(p, px, pn, g['suunta']); print('laituri valmis', ok, flush=True)
        vapaa_kamera(p, px, pn, 2.4, g['keski'][0], g['keski'][1], 0.8, 40)
        kuva(p, '3l_laituri_20m_deck', 3500); res['laituri_vapaa'] = stats(p)
        # 3. lähikuva: pohja ei näy veden läpi (kamera 1,0 m, 9 m veneen sivulta)
        v0 = p.evaluate("""() => { const c = __sim.boats.veneet.filter(v => v.lahde === 'laituri' && v.luokka === 'keski' && Math.hypot(v.e - %f, v.n - %f) < 140)[0]; return { e: c.e, n: c.n, s: c.suunta, l: c.pituus, id: c.id }; }""" % (k['e'], k['n']))
        print('lahikuva vene', v0, flush=True)
        sa = math.radians(v0['s'] + 90)
        for nm, (d, hh) in {'a': (7, 0.8), 'b': (12, 1.6), 'c': (4.5, 0.5)}.items():
            cx, cn = v0['e'] + math.sin(sa) * d, v0['n'] + math.cos(sa) * d
            siirra(p, cx, cn, v0['s'] + 270, odota=(nm == 'a'))
            vapaa_kamera(p, cx, cn, hh, v0['e'], v0['n'], 0.3, 45)
            kuva(p, '3l_pohja_lahikuva_' + nm, 2500)
        # 4. Mustalahti: 45 m uloimmasta veneestä
        e, n, h = satama_asema(hm, 45); ok = siirra(p, e, n, h); print('ML valmis', ok, flush=True)
        km = hm['keski']; am = math.radians(hm['avoin'])
        vapaa_kamera(p, e, n, 3, km['e'], km['n'], 1.0, 16)
        kuva(p, '3l_mustalahti_deck', 4000); res['ml_vapaa'] = stats(p)
        tyhja_kamera(p); p.evaluate('__view.setGaze(0)'); kuva(p, '3l_mustalahti_silmapiste', 3000)
    else:
        e, n, h = satama_asema(hn, 150); ok = siirra(p, e, n, h); print('valmis', ok, flush=True)
        p.evaluate('__view.setGaze(0)'); kuva(p, '3l_naistenlahti_pixel7_kevyt_silmapiste', 3500); res['silmapiste'] = stats(p)
        # kamera ylös: puhelimen pieni 3D-ikkuna ei ole päänäkymä, joten vaihdetaan 3D päänäkymäksi on jo tehty. Vapaa kamera 6 m
        vapaa_kamera(p, e, n, 6, k['e'] + math.sin(a) * hn['reuna'] * 0.2, k['n'] + math.cos(a) * hn['reuna'] * 0.2, 2, 30)
        kuva(p, '3l_naistenlahti_pixel7_kevyt', 3500); res['vapaa'] = stats(p); print(json.dumps(res['vapaa']), flush=True)
    print('virheet', errs[:6])
    json.dump(res, open('/tmp/claude-0/scratch3l/kuvat_%s.json' % dev, 'w'), indent=1)
    b.close()
