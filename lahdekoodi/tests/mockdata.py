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


def taulu():
    # linjataulujen linja: takataulusta etutaulun kautta väylän linjaosuuden päähän (sama linja kahdesti kuten aineistossa)
    line = [[23.690, 61.545], [23.700, 61.560], [23.760, 61.640]]
    return fc([{'type': 'Feature', 'geometry': {'type': 'MultiLineString', 'coordinates': [line, line]},
                'properties': {'taululinjaid': 77, 'jnro': '9215', 'suunta': '23.5', 'tyyppi': '2', 'etutlid': '500', 'takatlid': '501'}}])


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
    pt = lambda x, y: {'type': 'Point', 'coordinates': [x, y]}
    return fc([
        {'type': 'Feature', 'geometry': pt(23.745, 61.620), 'properties': {'id': 1, 'nimifi': 'Nopeus', 'vlmlajityyppi': 11, 'rajoitusarvo': 9}},
        # samassa tolpassa: rajoitettu alikulkukorkeus ja ilmajohto (90 §: alikulkukorkeus ylimpänä)
        {'type': 'Feature', 'geometry': pt(23.755, 61.622), 'properties': {'id': 3, 'nimifi': 'Johto', 'vlmlajityyppi': 24, 'lisakilventeksti1': 'Alikulkukorkeus 7,4 m'}},
        {'type': 'Feature', 'geometry': pt(23.755, 61.622), 'properties': {'id': 2, 'nimifi': 'Silta', 'vlmlajityyppi': 15, 'rajoitusarvo': 7.4, 'sijaintifi': 'Testisalmen silta'}},
        {'type': 'Feature', 'geometry': pt(23.760, 61.625), 'properties': {'id': 4, 'nimifi': 'Aallokko', 'vlmlajityyppi': 6, 'lisakilventeksti1': '1000'}},
        {'type': 'Feature', 'geometry': pt(23.766, 61.626), 'properties': {'id': 5, 'nimifi': 'Kaapeli', 'vlmlajityyppi': 31, 'lisakilventeksti1': 'Puhelinkaapeli'}},
        {'type': 'Feature', 'geometry': pt(23.770, 61.623), 'properties': {'id': 6, 'nimifi': 'Muu', 'vlmlajityyppi': 37, 'lisakilventeksti1': 'PONTTONISILTA'}},
    ])


def bridges():
    # silta navigointilinjalla (23.700,61.560)-(23.760,61.640), t = 0,8
    return fc([{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.748, 61.624]},
                'properties': {'id': 6, 'nimi': 'Testisalmen silta', 'alittav_vayla_korkraj_vesiv': '4.5', 'kayttotarkoitukset_nimi': 'Vesistösilta',
                               'nykyinen_omistaja': 'Väylävirasto', 'tunnus': 'H-28', 'sijaintikunnat': 'Testilä'}},
               # sama avattava silta kuin sulkukanava-aineiston Testisilta: yhdistetään, ei piirretä kahdesti
               {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [23.6512, 61.7612]},
                'properties': {'id': 7, 'nimi': 'Testisillan kääntösilta', 'alittav_vayla_korkraj_vesiv': '1', 'kayttotarkoitukset_nimi': 'Vesistösilta',
                               'nykyinen_omistaja': 'Väylävirasto', 'tunnus': 'H-1214', 'sijaintikunnat': 'Testilä'}}])


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


# ---------- AIS (Fintrafficin Digitraffic Marine) ----------
# Alukset Näsijärven testialueella. Nimissä on @-täytemerkkejä ja ylimääräisiä välilyöntejä kuten oikeassa aineistossa.
# age = sijainnin ikä sekunteina, bulk = onko alus mukana alustietojen bulkkivastauksessa.
AIS_SHIPS = [
    dict(mmsi=230100001, name='TESTI  RAHTI@@@', call='OHRA1@@', imo=9194098, type=70, dest='NAANTALI@@@@', draught=60, eta=703104,
         ref=(83, 16, 7, 7), lat=61.625, lng=23.770, sog=11.2, cog=45.0, hd=47, nav=0, age=20, bulk=True),
    dict(mmsi=230100002, name='MS MATKUSTAJA', call='OHPX', imo=0, type=60, dest='', draught=0, eta=0,
         ref=(60, 15, 8, 8), lat=61.618, lng=23.745, sog=0.0, cog=360.0, hd=511, nav=5, age=120, bulk=True),
    dict(mmsi=230100003, name='PV PELASTAJA', call='OHSAR', imo=0, type=51, dest='TAMPERE', draught=0, eta=0,
         ref=(8, 4, 2, 2), lat=61.630, lng=23.752, sog=8.5, cog=270.0, hd=272, nav=0, age=10, bulk=True),
    dict(mmsi=230100004, name='PV LEPOLAITURI', call='OHLEP', imo=0, type=51, dest='', draught=0, eta=0,
         ref=(8, 4, 2, 2), lat=61.612, lng=23.760, sog=0.1, cog=360.0, hd=511, nav=5, age=60, bulk=True),
    dict(mmsi=230100005, name='VANHA ALUS', call='OHOLD', imo=0, type=70, dest='', draught=0, eta=0,
         ref=(40, 10, 5, 5), lat=61.640, lng=23.800, sog=5.0, cog=90.0, hd=90, nav=0, age=90 * 60, bulk=True),
    dict(mmsi=230100006, name='HIMMEA ALUS', call='OHDIM', imo=0, type=80, dest='', draught=0, eta=0,
         ref=(70, 10, 6, 6), lat=61.605, lng=23.790, sog=0.0, cog=200.0, hd=511, nav=1, age=15 * 60, bulk=True),
    # alustiedot puuttuvat bulkkivastauksesta mutta löytyvät kutsulla /vessels/{mmsi}
    dict(mmsi=230100007, name='YKSITTAIS ALUS', call='OH7777', imo=0, type=37, dest='', draught=15, eta=0,
         ref=(6, 3, 2, 2), lat=61.622, lng=23.735, sog=4.0, cog=120.0, hd=511, nav=8, age=40, bulk=False),
    # alustietoja ei ole lainkaan: /vessels/{mmsi} vastaa 404
    dict(mmsi=230100008, name='', call='', imo=0, type=0, dest='', draught=0, eta=0, ref=(0, 0, 0, 0),
         lat=61.608, lng=23.775, sog=0.0, cog=360.0, hd=511, nav=15, age=30, bulk=False, vessel=False),
    # nimien päällekkäisyys: kaksi alusta lähes samassa pisteessä
    dict(mmsi=230100009, name='SAMASSA A', call='OHSA', imo=0, type=30, dest='', draught=0, eta=0,
         ref=(10, 5, 3, 3), lat=61.600, lng=23.700, sog=0.0, cog=360.0, hd=511, nav=1, age=50, bulk=True),
    dict(mmsi=230100010, name='SAMASSA B', call='OHSB', imo=0, type=36, dest='', draught=0, eta=0,
         ref=(10, 5, 3, 3), lat=61.60001, lng=23.70002, sog=0.0, cog=360.0, hd=511, nav=1, age=50, bulk=True),
    dict(mmsi=230100011, name='VAINO TESTI', call='OHVT', imo=0, type=31, dest='', draught=0, eta=0,
         ref=(12, 6, 3, 3), lat=61.615, lng=23.785, sog=3.0, cog=200.0, hd=201, nav=0, age=70, bulk=True),
    # satama: laiturissa olevia aluksia, joilla on keulasuunta ja mitat (rungot todellisessa mittakaavassa). Laiturissa olevan aluksen
    # kulku (cog) on kohinaa, ja sen on tarkoituksella eri kuin keulasuunta.
    dict(mmsi=230100012, name='LAITURIN RAHTI', call='OHLR', imo=0, type=70, dest='', draught=0, eta=0,
         ref=(83, 16, 7, 7), lat=61.7000, lng=23.9000, sog=0.0, cog=200.0, hd=90, nav=5, age=60, bulk=True),
    dict(mmsi=230100013, name='LAITURIN TANKKI', call='OHLT', imo=0, type=80, dest='', draught=0, eta=0,
         ref=(110, 20, 9, 9), lat=61.7000, lng=23.90265, sog=0.1, cog=33.0, hd=90, nav=5, age=45, bulk=True),
    dict(mmsi=230100014, name='HINAAJA CHARLIE', call='OHTC', imo=0, type=52, dest='', draught=0, eta=0,
         ref=(14, 6, 5, 5), lat=61.7000, lng=23.90568, sog=0.0, cog=360.0, hd=270, nav=5, age=45, bulk=True),
    dict(mmsi=230100015, name='LUOTSI 1', call='OHL1', imo=0, type=50, dest='', draught=0, eta=0,
         ref=(10, 5, 3, 3), lat=61.70027, lng=23.9010, sog=0.0, cog=360.0, hd=0, nav=5, age=45, bulk=True),
]
AIS_EXTRA_FIRST = 231000000


def _ais_extra(n):
    """Lisää n liikkuvaa rahtialusta ruudukkoon testialueen näkymässä (rajoituksen 400 alusta kokeiluun)."""
    out = []
    cols = 30
    for i in range(n):
        out.append(dict(mmsi=AIS_EXTRA_FIRST + i, name='EXTRA %d' % i, call='', imo=0, type=70, dest='', draught=0, eta=0,
                        ref=(30, 10, 5, 5), lat=61.50 + (i // cols) * 0.0045, lng=23.50 + (i % cols) * 0.012,
                        sog=6.0, cog=45.0, hd=45, nav=0, age=30, bulk=True))
    return out


def ais_ships(extra=0):
    return AIS_SHIPS + _ais_extra(extra)


def _iso(ms):
    import datetime
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def ais_locations(now_ms, frm=None, mmsi=None, extra=0, drop=()):
    """Digitrafficin /locations: sijainnit, joiden aika on vähintään frm (oletuksena vuorokausi sitten)."""
    frm = now_ms - 86400000 if frm is None else frm
    feats = []
    for s in ais_ships(extra):
        t = now_ms - s['age'] * 1000
        if s['mmsi'] in drop or t < frm or (mmsi is not None and s['mmsi'] != mmsi):
            continue
        feats.append({'type': 'Feature', 'mmsi': s['mmsi'], 'geometry': {'type': 'Point', 'coordinates': [s['lng'], s['lat']]},
                      'properties': {'mmsi': s['mmsi'], 'sog': s['sog'], 'cog': s['cog'], 'navStat': s['nav'], 'rot': -128,
                                     'posAcc': True, 'raim': False, 'heading': s['hd'], 'timestamp': 5, 'timestampExternal': t}})
    return json.dumps({'type': 'FeatureCollection', 'dataUpdatedTime': _iso(now_ms), 'features': feats}).encode(), \
        max([f['properties']['timestampExternal'] for f in feats] or [0])


def ais_vessel(s, now_ms):
    a, b, c, d = s['ref']
    return {'mmsi': s['mmsi'], 'name': s['name'], 'callSign': s['call'], 'imo': s['imo'], 'destination': s['dest'],
            'draught': s['draught'], 'eta': s['eta'], 'posType': 1, 'referencePointA': a, 'referencePointB': b,
            'referencePointC': c, 'referencePointD': d, 'shipType': s['type'], 'timestamp': now_ms - 86400000}


def ais_vessels(now_ms, frm, extra=0):
    """Digitrafficin /vessels?from=: alustiedot taulukkona. Bulkkivastauksesta puuttuvat alukset eivät ole mukana."""
    return json.dumps([ais_vessel(s, now_ms) for s in ais_ships(extra)
                       if s['bulk'] and s.get('vessel', True) and now_ms - 86400000 >= frm]).encode()


def ais_vessel_one(mmsi, now_ms):
    for s in AIS_SHIPS:
        if s['mmsi'] == mmsi and s.get('vessel', True):
            return json.dumps(ais_vessel(s, now_ms)).encode()
    return None
