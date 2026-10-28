"""Vaihe 3l, kriteeri 1: kuvat 3l_*. Käyttö: python3 veneet3l_kuvat_ml_pw.py (vain Mustalahti).
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
    json.dump(res, open('/tmp/claude-0/scratch3l/kuvat_ml.json', 'w'), indent=1)
    b.close()
