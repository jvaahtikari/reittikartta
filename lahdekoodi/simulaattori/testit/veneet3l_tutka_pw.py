"""Vaihe 3l, kriteeri 2: tutkakuva Naistenlahden satamasta 0,25 mpk alueella (veneet päällä ja pois) rinnakkain plotterin kanssa, ja Siilinkarin kuva 1,5 mpk (veneet päällä ja pois).
Kuvat: 3l_tutka_naistenlahti_veneet.png (plotteri ja tutka, veneet päällä), 3l_tutka_naistenlahti_ilman_veneita.png, 3l_tutka_siilinkari_1-5_mpk.png (veneet päällä) ja _ilman_veneita.
Veneiden vaikutus mitataan tutkan kuvasta: erotuskuvan pikselit verrattuna kahden veneettömän kierroksen eroon (kohina arvotaan kierroksittain)."""
import sys, os, json, io
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
from PIL import Image, ImageChops
res = {}

def tutka_kuva(p, alue, ylos=False):
    p.evaluate('__radar.asetaSuuntaYlos(%s)' % ('true' if ylos else 'false'))
    p.evaluate('__radar.asetaAlue(%s)' % alue)
    p.evaluate('async () => { await __radar.valmis(); }')
    p.wait_for_timeout(1500)

def kierros(p):
    """Laskee koko pyyhkäisyn nykyisellä sijainnilla (veneet haetaan uudelleen 1,5 s:n välein) ja palauttaa tutkan canvasin kuvan."""
    p.evaluate('async () => { await __radar.valmis(); __radar.taytaKierros(); __radar.piirra(); }')
    p.wait_for_timeout(400)
    png = p.query_selector('#radar').screenshot(timeout=120000)
    return Image.open(io.BytesIO(png)).convert('RGB')

def ero(a, b, kynnys=40):
    d = ImageChops.difference(a, b).convert('L'); px = d.load(); w, h = d.size
    n = sum(1 for x in range(w) for y in range(h) if px[x, y] > kynnys)
    return n

def eropisteet(a, b, kynnys=40):
    """Erokuvan pikselien rajaus ja keskipiste (kuvan koordinaatit) sekä etäisyys tutkan kiekon keskipisteestä (canvasin keskipiste)."""
    d = ImageChops.difference(a, b).convert('L'); px = d.load(); w, h = d.size; pts = [(x, y) for x in range(w) for y in range(h) if px[x, y] > kynnys]
    if not pts: return None
    xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
    return {'n': len(pts), 'x': [min(xs), max(xs)], 'y': [min(ys), max(ys)], 'kuva': [w, h]}

def vertailu(on, off, nimi, t1, t2, kerr):
    """Kuvapari (päällä, pois) ja vahvistettu erotuskuva rinnakkain, suurennettuna kerr-kertaisesti (lähin naapuri)."""
    from PIL import ImageDraw, ImageFont
    try: ft = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except Exception: ft = None
    w0, h0 = on.size; q = min(w0, h0); box = ((w0 - q) // 2, (h0 - q) // 2, (w0 - q) // 2 + q, (h0 - q) // 2 + q); on = on.crop(box); off = off.crop(box)
    d = ImageChops.difference(on, off).convert('L').point(lambda v: 255 if v > 40 else 0).convert('RGB')
    w, h = on.size; W = Image.new('RGB', (w * kerr * 3 + 40, h * kerr + 40), (10, 20, 30)); dr = ImageDraw.Draw(W)
    for i, (im, t) in enumerate(((on, t1), (off, t2), (d, 'Ero (yli 40 harmaasävyä)'))):
        W.paste(im.resize((w * kerr, h * kerr), Image.NEAREST), (i * (w * kerr + 20), 40)); dr.text((i * (w * kerr + 20) + 6, 12), t, fill=(230, 240, 250), font=ft)
    W.save(os.path.join(SHOTS, nimi))

with sync_playwright() as pw:
    b, p, errs = avaa(pw, 'deck', None, naytot='both')
    hn = satama(p, 'naistenlahti'); res['naistenlahti'] = hn
    # selvä vesipaikka sataman altaasta: lähin keskipisteeseen, jossa on vähintään 30 m tilaa lähimpään veneeseen ja runko ei osu mihinkään
    pt = p.evaluate("""([kx, kn]) => { const b = __sim.boats, o = Paikka.getOrigin(); let best = null;
        for (let dx = -300; dx <= 300; dx += 10) for (let dy = -300; dy <= 300; dy += 10) { const e = kx + dx, n = kn + dy; if (!window.__onVesi(e, n)) continue;
            const near = b.lahella(e - o.e, n - o.n, 60); const cl = near.length ? near[0].etaisyys : 60; if (cl < 30) continue;
            let hit = false; [0, 45, 90, 135].forEach(h => { if (Tormays.check({ x: e - o.e, y: n - o.n, hdg: h, v: 0 })) hit = true; }); if (hit) continue;
            const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { e, n, d, cl }; }
        return best; }""", [hn['keski']['e'], hn['keski']['n']])
    print('altaan piste', json.dumps(pt), flush=True); res['piste'] = pt
    ok = siirra(p, pt['e'], pt['n'], 0); print('valmis', ok, flush=True)
    p.evaluate('__pl.setHeadUp(false); __pl.setRangeNm(0.25); __pl.recenter()')
    tutka_kuva(p, 0.25)
    p.wait_for_timeout(2500)
    on1 = kierros(p)
    res['veneita_haussa'] = p.evaluate('__radar.tilasto().veneita'); print('tutkan veneet haussa', res['veneita_haussa'], flush=True)
    # kuva: plotteri ja tutka rinnakkain (alarivi vasemmalla)
    def rinnakkain(nimi):
        r1 = p.evaluate('(()=>{const a=document.getElementById("paneP").getBoundingClientRect(), c=document.getElementById("paneR").getBoundingClientRect(); return {x:a.left, y:Math.min(a.top,c.top), w:c.right-a.left, h:Math.max(a.bottom,c.bottom)-Math.min(a.top,c.top)}})()')
        p.screenshot(path=os.path.join(SHOTS, nimi), clip={'x': r1['x'], 'y': r1['y'], 'width': r1['w'], 'height': r1['h']}, timeout=120000)
    p.wait_for_timeout(500); on1 = kierros(p); rinnakkain('3l_tutka_naistenlahti_veneet.png')
    on2 = kierros(p)
    p.evaluate('__sim.setBoats(false)'); p.wait_for_timeout(2500)
    off1 = kierros(p); rinnakkain('3l_tutka_naistenlahti_ilman_veneita.png'); off2 = kierros(p)
    vertailu(on1, off1, '3l_tutka_naistenlahti_vertailu.png', 'Veneet päällä', 'Veneet pois', 2)
    res['nl_ero_on_vs_off'] = ero(on1, off1); res['nl_ero_on_vs_on'] = ero(on1, on2); res['nl_ero_off_vs_off'] = ero(off1, off2)
    print('NL ero pikseleina: on/off %d, on/on %d, off/off %d' % (res['nl_ero_on_vs_off'], res['nl_ero_on_vs_on'], res['nl_ero_off_vs_off']), flush=True)
    p.evaluate('__sim.setBoats(true)'); p.wait_for_timeout(2500)
    # Siilinkari
    ok = siirra(p, 328045, 6824881, 100); print('Siilinkari valmis', ok, flush=True)
    p.evaluate('__pl.setRangeNm(1.5); __pl.recenter()')
    tutka_kuva(p, 1.5); p.wait_for_timeout(2500)
    sk_on1 = kierros(p); p.wait_for_timeout(300); sk_on1 = kierros(p); res['sk_veneita_haussa'] = p.evaluate('__radar.tilasto().veneita'); rinnakkain('3l_tutka_siilinkari_1-5_mpk.png'); sk_on2 = kierros(p)
    p.evaluate('__sim.setBoats(false)'); p.wait_for_timeout(2500)
    sk_off1 = kierros(p); rinnakkain('3l_tutka_siilinkari_1-5_mpk_ilman_veneita.png'); sk_off2 = kierros(p)
    vertailu(sk_on1, sk_off1, '3l_tutka_siilinkari_vertailu.png', 'Veneet päällä', 'Veneet pois', 1)
    res['sk_ero_on_vs_off'] = ero(sk_on1, sk_off1); res['sk_eropisteet'] = eropisteet(sk_on1, sk_off1); res['sk_ero_on_vs_on'] = ero(sk_on1, sk_on2); res['sk_ero_off_vs_off'] = ero(sk_off1, sk_off2)
    print('SK veneitä haussa %s, ero pikseleinä: on/off %d, on/on %d, off/off %d' % (res['sk_veneita_haussa'], res['sk_ero_on_vs_off'], res['sk_ero_on_vs_on'], res['sk_ero_off_vs_off']), flush=True)
    print('virheet', errs[:6]); res['virheet'] = errs[:6]
    json.dump(res, open(os.path.join(SHOTS, 'tulos_3l_tutka.json'), 'w'), indent=1, ensure_ascii=False)
    b.close()
