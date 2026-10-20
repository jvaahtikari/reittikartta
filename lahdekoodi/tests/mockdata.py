"""Testiaineisto: synteettiset merikarttatiilet ja väylätiedot.

Säiliöstä ei ole verkkoyhteyttä Traficomin tai Väyläviraston palveluihin,
joten testit korvaavat ne aineistolla, joka muistuttaa oikeaa: tasaväriset
maa- ja vesialueet, pehmennetty rantaviiva, syvyysluvut ja katkoviivakäyrät."""
import io
import json
import math

from PIL import Image, ImageDraw, ImageFont

LAND = (250, 240, 203)
SHALLOW = (196, 225, 246)
WATER = (226, 240, 250)
DEEP = (255, 255, 255)
COAST = (40, 40, 40)
CONTOUR = (0, 140, 200)
INK = (10, 10, 10)


def tile_bounds(z, x, y):
    n = 2 ** z
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon0, lat0, lon1, lat1


def field(lon, lat):
    # "syvyys" (m): positiivinen vesi, negatiivinen maa
    return (6 * math.sin(lon * 90) + 5 * math.cos(lat * 160) + 3 * math.sin((lon + lat) * 230)
            + 2 * math.sin(lon * 600) * math.cos(lat * 520) + 2.0)


def make_tile(z, x, y):
    S = 4  # ylinäytteistys pehmennystä varten
    W = 256 * S
    lon0, lat0, lon1, lat1 = tile_bounds(z, x, y)
    img = Image.new('RGB', (W, W), DEEP)
    px = img.load()
    for j in range(0, W, 2):
        lat = lat1 - (j + 0.5) / W * (lat1 - lat0)
        for i in range(0, W, 2):
            lon = lon0 + (i + 0.5) / W * (lon1 - lon0)
            d = field(lon, lat)
            c = LAND if d < 0 else SHALLOW if d < 3 else WATER if d < 6 else DEEP
            px[i, j] = c
            px[i + 1, j] = c
            px[i, j + 1] = c
            px[i + 1, j + 1] = c
    # rantaviiva ja syvyyskäyrät: reunat värirajoilla
    out = img.copy()
    op = out.load()
    for j in range(2, W - 2, 2):
        for i in range(2, W - 2, 2):
            c = px[i, j]
            r = px[i + 2, j]
            b = px[i, j + 2]
            if c != r or c != b:
                pair = {c, r, b}
                col = COAST if LAND in pair else CONTOUR
                if col == CONTOUR and ((i // 12 + j // 12) % 2 == 0):
                    continue  # katkoviiva
                for dj in range(-2, 2):
                    for di in range(-2, 2):
                        op[i + di, j + dj] = col
    dr = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf', 13 * S)
        small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf', 9 * S)
    except OSError:
        font = small = ImageFont.load_default()
    # syvyysluvut kiinteään maailmanruudukkoon (saumattomat)
    step = 0.004
    la = math.floor(lat0 / step) * step
    while la < lat1:
        lo = math.floor(lon0 / step) * step
        while lo < lon1:
            d = field(lo, la)
            if d > 0.5 and z >= 13:
                fx = (lo - lon0) / (lon1 - lon0) * W
                fy = (lat1 - la) / (lat1 - lat0) * W
                dr.text((fx, fy), str(int(d)), font=font, fill=INK)
                dr.text((fx + 9 * S, fy + 6 * S), str(int(d * 10) % 10), font=small, fill=INK)
            elif d < -4 and z >= 13:
                fx = (lo - lon0) / (lon1 - lon0) * W
                fy = (lat1 - la) / (lat1 - lat0) * W
                dr.rectangle([fx, fy, fx + 6 * S, fy + 6 * S], fill=INK)
            lo += step
        la += step
    out = out.resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, 'PNG')
    return buf.getvalue()


def fc(features):
    return json.dumps({'type': 'FeatureCollection', 'features': features}).encode()


def navlines():
    feats = []
    lines = [
        (9215, 2.4, 'Suora linja', [[23.700, 61.560], [23.760, 61.640]], 23.5),
        (9215, 2.4, 'Murtoviiva', [[23.760, 61.640], [23.800, 61.700], [23.880, 61.740], [23.900, 61.800]], None),
        (9250, 1.8, 'Murtoviiva', [[23.800, 61.700], [23.700, 61.720], [23.650, 61.760]], None),
        # reititystestit: matala oikotie (1,8 m) pääväylän mutkan ohi ja linja ilman kulkusyvyystietoa
        (9260, 1.8, 'Suora linja', [[23.760, 61.640], [23.900, 61.800]], None),
        (9270, None, 'Suora linja', [[23.900, 61.800], [23.950, 61.850]], None),
    ]
    for k, (jnro, d, typ, coords, tos) in enumerate(lines):
        feats.append({'type': 'Feature', 'id': 'nl.%d' % k, 'geometry': {'type': 'LineString', 'coordinates': coords},
                      'properties': {'navigointilinjaid': 1000 + k, 'tyyppi': typ, 'mitoitussyvays': d,
                                     'tosisuunta': tos, 'jnro': str(jnro)}})
    return fc(feats)


def vaylat():
    return fc([
        {'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [[23.700, 61.560], [23.760, 61.640], [23.900, 61.800]]},
         'properties': {'jnro': 9215, 'nimifi': 'Tampere - Virrat väylä', 'vaylaluokkakoodi': 3, 'vaylaluokkafi': 'VL3: Hyötyliikenteen matalaväylä', 'mitoitussyvays': 2.4}},
        {'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [[23.800, 61.700], [23.650, 61.760]]},
         'properties': {'jnro': 9250, 'nimifi': 'Tuomisto - Vahantalahti väylä', 'vaylaluokkakoodi': 5, 'vaylaluokkafi': 'VL5: Paikallisveneväylä', 'mitoitussyvays': 1.8}},
        {'type': 'Feature', 'geometry': None, 'properties': {'jnro': 9260, 'nimifi': 'Testioikotie', 'vaylaluokkakoodi': 5}},
        {'type': 'Feature', 'geometry': None, 'properties': {'jnro': 9270, 'nimifi': 'Testilinja ilman syvyyttä', 'vaylaluokkakoodi': 5}},
    ])


def canals():
    return fc([
        {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [[[23.790, 61.690], [23.792, 61.690], [23.792, 61.692], [23.790, 61.692], [23.790, 61.690]]]},
         'properties': {'id': 1, 'nimi': 'Testisulku', 'kanavaaluetyyppi': 'Sulku', 'vesisto': 'Kokemäenjoen vesistö', 'alussyvyys': 2.4}},
        {'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [[[23.650, 61.760], [23.652, 61.760], [23.652, 61.762], [23.650, 61.762], [23.650, 61.760]]]},
         'properties': {'id': 2, 'nimi': 'Testisilta', 'kanavaaluetyyppi': 'Avattava silta', 'vesisto': 'Kokemäenjoen vesistö', 'alussyvyys': None}},
    ])


def traficom_points(layer):
    if 'Pilot' in layer:
        return fc([{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.70, 61.56]}, 'properties': {'OBJNAM': 'Testiluotsi', 'INFORM': 'www.pilotorder.fi'}}])
    return fc([{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.88, 61.74]}, 'properties': {'OBJNAM': 'Testisalmi (10 min)', 'INFORM': 'Testi VTS, VHF 71'}}])


def aids():
    feats = []
    kinds = [(1, 'Viitta'), (2, 'Viitta'), (3, 'Viitta'), (4, 'Viitta'), (5, 'Viitta'), (6, 'Viitta'),
             (7, 'Viitta'), (8, 'Viitta'), (99, 'Kummeli'), (99, 'Linjamerkki'), (99, 'Sektoriloisto'),
             # valaistut: itäviitta (valkoinen), apuloisto ympäri näkyvä (punainen), apuloisto vihreällä sektorilla
             (6, 'Viitta', 'Alkukulma: 0, Loppukulma: 360, Väri: v'),
             (99, 'Apuloisto', 'Alkukulma: 0, Loppukulma: 360, Väri: p'),
             (99, 'Apuloisto', 'Alkukulma: 136, Loppukulma: 223, Väri: vi')]
    for k, kind in enumerate(kinds):
        nav, typ = kind[0], kind[1]
        sect = kind[2] if len(kind) > 2 else None
        lon = 23.735 + 0.004 * k
        lat = 61.615 + 0.0015 * (k % 3)
        feats.append({'type': 'Feature', 'geometry': {'type': 'MultiPoint', 'coordinates': [[lon, lat]]},
                      'properties': {'id': 500 + k, 'nimifi': 'Testi %d' % k, 'turvalaitetyyppifi': typ,
                                     'navigointilajikoodi': nav, 'turvalaitenumero': str(38000 + k), 'valaistu': 'K' if sect else 'E',
                                     'valosektorien_tiedot': sect, 'sijaintifi': 'Testisijainti'}})
    return fc(feats)


def signs():
    return fc([
        {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.745, 61.620]},
         'properties': {'id': 1, 'nimifi': 'Nopeus', 'vlmlajityyppi': 11, 'rajoitusarvo': 9}},
        {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.755, 61.622]},
         'properties': {'id': 2, 'nimifi': 'Silta', 'vlmlajityyppi': 15, 'rajoitusarvo': 7.4}},
    ])


def solid_png(w, h, rgba):
    from PIL import Image
    import io
    im = Image.new('RGBA', (w, h), rgba)
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def half_png(w, h, left=True):
    """Puoliksi peittävä maski: vasen puolisko (matala) tai oikea puolisko (syvä)."""
    from PIL import Image
    import io
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x0, x1 = (0, w // 2) if left else (w // 2, w)
    im.paste((145, 202, 243, 255), (x0, 0, x1, h))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def lights():
    return fc([{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.770, 61.630]},
                'properties': {'id': 9001, 'viralvalotunnuse': 'VQ (3) 5 s', 'virallvalotunnus': 'NPv-ESx (3) 5 s', 'turvalaitenumero': '777'}}])


def sectors():
    out = []
    for i, (a, b, c) in enumerate(((100, 140, 'vi'), (140, 150, 'v'), (150, 200, 'p'), (0, 360, 'v'))):
        out.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.770, 61.630]},
                    'properties': {'id': 9100 + i, 'tlnumero': 777, 'loisto': 9001, 'alkukulma': a, 'loppukulma': b, 'vari': c}})
    return fc(out)


def speed():
    return fc([{'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [[[23.74, 61.60], [23.78, 61.60], [23.78, 61.62], [23.74, 61.62], [23.74, 61.60]]]},
                'properties': {'id': 9300, 'suuruus': '10', 'rajoitustyyppi': 'Nopeusrajoitus'}}])
