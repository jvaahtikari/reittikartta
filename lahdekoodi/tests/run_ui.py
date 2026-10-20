"""Reittikartan käyttöliittymätesti Playwrightilla (verkkopalvelut korvattu testiaineistolla)."""
import json
import os
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
import mockdata  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('OUT', '/tmp/rk-shots')
os.makedirs(OUT, exist_ok=True)
TARGET = os.environ.get('TARGET', 'file://' + ROOT + '/index.html')

tile_cache = {}
errors = []


ENC_EAST = 23.75


osm_log = []
mml_name_log = []
mml_pier_log = []
overpass_log = []
overpass_fail_main = []


def handle(route, request):
    url = request.url
    cors = {'Access-Control-Allow-Origin': '*'}
    if 'rasteripalvelu/wmts' in url:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        layer = q.get('LAYER', [''])[0]
        z = int(q.get('TILEMATRIX', ['x:0'])[0].split(':')[-1])
        x = int(q.get('TILECOL', ['0'])[0])
        y = int(q.get('TILEROW', ['0'])[0])
        if 'Merikarttasarjat public' not in layer or z > 15:
            return route.fulfill(status=400, headers=cors, content_type='text/xml', body='<e/>')
        key = (z, x, y)
        if key not in tile_cache:
            tile_cache[key] = mockdata.make_tile(z, x, y)
        return route.fulfill(status=200, headers=cors, content_type='image/png', body=tile_cache[key])
    if 'inspirepalvelu/avoin' in url:
        t = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('TYPENAME', [''])[0]
        return route.fulfill(status=200, headers=cors, content_type='application/json', body=mockdata.traficom_points(t))
    if 'inspirepalvelu/rajoitettu' in url:
        q = {k.upper(): v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}
        if q.get('SERVICE', '').upper() == 'WFS' and 'Sounding_P' in q.get('TYPENAME', ''):
            bb = [float(v) for v in q.get('BBOX', '0,0,0,0').split(',')[:4]]
            feats = []
            for i in range(12):
                for j in range(6):
                    lon = bb[0] + (bb[2] - bb[0]) * (i + 0.5) / 12
                    lat = bb[1] + (bb[3] - bb[1]) * (j + 0.5) / 6
                    feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [lon, lat, 0]},
                                  'properties': {'DEPTH': round(1.2 + (i * 7 + j * 3) % 25 * 0.7, 1)}})
            return route.fulfill(status=200, headers=cors, content_type='application/json',
                                 body=json.dumps({'type': 'FeatureCollection', 'features': feats}))
        if q.get('SERVICE', '').upper() == 'WFS':
            feats = [{'type': 'Feature', 'geometry': None, 'properties': {'DRVAL1': v}} for v in ('0', '3', '6', '10')]
            return route.fulfill(status=200, headers=cors, content_type='application/json',
                                 body=json.dumps({'type': 'FeatureCollection', 'features': feats}))
        w, h = int(q.get('WIDTH', '256')), int(q.get('HEIGHT', '256'))
        shallow = '<' in q.get('CQL_FILTER', '') and '>=' not in q.get('CQL_FILTER', '')
        return route.fulfill(status=200, headers=cors, content_type='image/png', body=mockdata.half_png(w, h, left=shallow))
    if 's57/wms' in url:
        q = {k.upper(): v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}
        w, h = int(q.get('WIDTH', '256')), int(q.get('HEIGHT', '256'))
        if q.get('STYLES') == 'style-id-203':
            # kattavuustesti: ENC kattaa vain itäpuolen (BBOX:n keskikohta x > 23.75° itää)
            bb = [float(v) for v in q.get('BBOX', '0,0,0,0').split(',')]
            lon = (bb[0] + bb[2]) / 2 / 6378137 * 180 / 3.141592653589793
            covered = lon > ENC_EAST
            body = mockdata.solid_png(w, h, (100, 170, 255, 255) if covered else (0, 0, 0, 0))
        else:
            body = mockdata.solid_png(w, h, (110, 180, 250, 255))
        return route.fulfill(status=200, headers=cors, content_type='image/png', body=body)
    if 'vaylapilvi' in url and 'GetMap' in url:
        q = {k.upper(): v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}
        return route.fulfill(status=200, headers=cors, content_type='image/png',
                             body=mockdata.solid_png(int(q.get('WIDTH', '256')), int(q.get('HEIGHT', '256')), (0, 0, 0, 0)))
    if '/api/interpreter' in url:
        # Overpass: laituri alueena ja viivana Näsijärven testialueella
        overpass_log.append(url)
        if 'overpass-api.de' in url and overpass_fail_main:
            return route.fulfill(status=504, headers=cors, content_type='text/plain', body='busy')
        body = json.dumps({'elements': [
            {'type': 'way', 'id': 1, 'tags': {'man_made': 'pier'}, 'geometry': [
                {'lat': 61.6168, 'lon': 23.7495}, {'lat': 61.6168, 'lon': 23.7505}, {'lat': 61.6171, 'lon': 23.7505},
                {'lat': 61.6171, 'lon': 23.7495}, {'lat': 61.6168, 'lon': 23.7495}]},
            {'type': 'way', 'id': 2, 'tags': {'man_made': 'pier', 'floating': 'yes'}, 'geometry': [
                {'lat': 61.6175, 'lon': 23.7480}, {'lat': 61.6180, 'lon': 23.7490}]}]})
        return route.fulfill(status=200, headers=cors, content_type='application/json', body=body)
    if 'tile.openstreetmap.org' in url:
        # kuten oikea OSM: ilman Refereriä tai X-Requested-With-otsaketta palautuu "Access blocked" -tiili (HTTP 200)
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers={**cors, 'Access-Control-Allow-Headers': '*'})
        h = request.headers
        ok = h.get('x-requested-with') or h.get('referer')
        osm_log.append(bool(ok))
        col = (242, 239, 233, 255) if ok else (255, 0, 0, 255)
        return route.fulfill(status=200, headers=cors, content_type='image/png', body=mockdata.solid_png(256, 256, col))
    if 'avoin-paikkatieto.maanmittauslaitos.fi' in url:
        u = urllib.parse.urlparse(url)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if q.get('api-key') != 'TESTI':
            return route.fulfill(status=401, headers=cors, content_type='application/json', body='{"error":"unauthorized"}')
        if u.path.endswith('/collections'):
            cols = [{'id': c} for c in ('tieviiva', 'vesikivi', 'vesikivikko', 'matalikko', 'syvyyspiste', 'pistolaituriviiva', 'aallonmurtaja')]
            return route.fulfill(status=200, headers=cors, content_type='application/json', body=json.dumps({'collections': cols}))
        bb = [float(v) for v in q.get('bbox', '0,0,0,0').split(',')]
        cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        feats = []
        if '/vesikivi/' in u.path:
            for i, k in enumerate((38511, 38512, 38513)):
                feats.append({'type': 'Feature', 'id': '%s-%d' % (q['bbox'], i), 'geometry': {'type': 'Point', 'coordinates': [cx + 0.004 * i, cy]}, 'properties': {'kohdeluokka': k}})
        elif '/pistolaituriviiva/' in u.path:
            mml_pier_log.append(url)
            feats.append({'type': 'Feature', 'id': 'pl' + q['bbox'], 'geometry': {'type': 'LineString', 'coordinates': [[cx, cy], [cx + 0.0008, cy + 0.0002]]}, 'properties': {'kohdeluokka': 45111}})
        elif '/matalikko/' in u.path:
            feats.append({'type': 'Feature', 'id': 'm' + q['bbox'], 'geometry': {'type': 'Polygon', 'coordinates': [[[cx, cy + 0.003], [cx + 0.006, cy + 0.003], [cx + 0.006, cy + 0.006], [cx, cy + 0.006], [cx, cy + 0.003]]]}, 'properties': {}})
        elif 'placenames' in u.path and ('spelling' in q or 'spelling_case_insensitive' in q):
            # samannimisiä paikkoja eri puolilla; bbox rajaa kuten oikea palvelu
            raw = (q.get('spelling_case_insensitive') or q.get('spelling', '')).lower()
            contains = raw.startswith('*')
            pat = raw.strip('*')
            places = [('hs', 'Testisaari', 23.762, 61.621, 'saari'),
                      ('v1', 'Viitasaari', 23.920, 61.720, 'saari'), ('v2', 'Viitasaari', 24.100, 61.800, 'saari'),
                      ('v3', 'Viitasaarenlahti', 23.600, 61.950, 'lahti'), ('v4', 'Viitasaari', 25.860, 63.070, 'kaupunki'),
                      ('v5', 'Viitasaari', 22.500, 60.200, 'saari'), ('v6', 'Viitasalmi', 23.880, 61.690, 'salmi')]
            hasbb = 'bbox' in q
            for pid, nm, lon, lat, typ in places:
                if not (pat in nm.lower() if contains else nm.lower().startswith(pat)):
                    continue
                if hasbb and not (bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3]):
                    continue
                feats.append({'type': 'Feature', 'id': pid, 'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                              'properties': {'spelling': nm, 'placeTypeDescription': typ}})
            mml_name_log.append(url)
        elif 'placenames' in u.path:
            feats.append({'type': 'Feature', 'id': 'n' + q['bbox'], 'geometry': {'type': 'Point', 'coordinates': [cx, cy - 0.004]}, 'properties': {'spelling': 'Testisaari'}})
        return route.fulfill(status=200, headers=cors, content_type='application/geo+json', body=json.dumps({'type': 'FeatureCollection', 'features': feats}))
    if 'vaylapilvi' in url:
        t = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('TYPENAME', [''])[0]
        if '_muut_' in t:
            return route.fulfill(status=200, headers=cors, content_type='application/json', body=mockdata.fc([]))
        qq = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        cql = qq.get('CQL_FILTER', [''])[0]
        if cql and ('turvalaitteet' in t or 'vaylat_uusi' in t or 'sulkukanavat' in t):
            import re
            m = re.search(r"'([^']*)'", cql)
            term = (m.group(1) if m else '').replace('%', '').lower()
            src = mockdata.aids if 'turvalaitteet' in t else mockdata.vaylat if 'vaylat_uusi' in t else mockdata.canals
            field = 'turvalaitenumero' if 'turvalaitenumero' in cql else 'nimi' if 'sulkukanavat' in t else 'nimifi'
            data = json.loads(src())
            if field == 'turvalaitenumero':
                data['features'] = [f for f in data['features'] if str(f['properties'].get('turvalaitenumero') or '').startswith(term)]
            else:
                data['features'] = [f for f in data['features'] if term in (f['properties'].get(field) or '').lower()]
            return route.fulfill(status=200, headers=cors, content_type='application/json', body=json.dumps(data))
        extra = {'loistot_uusi': mockdata.lights, 'valosektorit_uusi': mockdata.sectors, 'nopeusrajoitusalueet': mockdata.speed, 'taululinjat': mockdata.taulu}
        for k, fn in extra.items():
            if k in t:
                return route.fulfill(status=200, headers=cors, content_type='application/json', body=fn())
        body = {'navigointilinjat': mockdata.navlines, 'vaylat_uusi': mockdata.vaylat,
                'turvalaitteet': mockdata.aids, 'vesiliikennemerkit': mockdata.signs,
                'taitorakenteet:silta': mockdata.bridges, 'sulkukanavat': mockdata.canals}
        for k, fn in body.items():
            if k in t:
                return route.fulfill(status=200, headers=cors, content_type='application/json', body=fn())
        return route.fulfill(status=200, headers=cors, content_type='application/json', body=mockdata.fc([]))
    if url.startswith('file://') or url.startswith('data:') or url.startswith('blob:'):
        return route.continue_()
    return route.fulfill(status=404, headers=cors, body='')


def shot(page, name):
    p = os.path.join(OUT, name + '.png')
    page.screenshot(path=p)
    print('kuva', p)


def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('reittikartta.v1') || '{}')")


def menu_click(page, text):
    page.locator('#ctxmenu button', has_text=text).first.click()


def scenario(page):
    m = page.mouse
    # --- uusi reitti ---
    page.keyboard.press('Control+r')
    for x, y in [(300, 300), (450, 430), (620, 380), (760, 540)]:
        m.click(x, y)
        page.wait_for_timeout(120)
    m.move(820, 600)
    page.wait_for_timeout(200)
    shot(page, '03-reitin-lisays')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    shot(page, '04-muokkaustila')
    st = state(page)
    assert len(st['routes']) == 1 and len(st['routes'][0]['points']) == 4, st['routes']

    # --- suuntanuotit ---
    m.click(375, 365, button='right')
    page.wait_for_timeout(200)
    shot(page, '05-reittivalikko')
    menu_click(page, 'Suuntanuotit kaikille')
    page.wait_for_timeout(300)
    notes = page.locator('.note')
    print('nuotteja', notes.count())
    box = notes.first.bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    m.move(cx, cy); m.down(); m.move(cx + 30, cy - 30, steps=6); m.up()
    page.wait_for_timeout(300)
    st = state(page)
    print('nuotit', [(n['leg'], n['ok']) for n in st['routes'][0]['notes']])

    # --- sivuutusetäisyys legille 2 ---
    m.click(492, 418, button='right')
    page.wait_for_timeout(150)
    menu_click(page, 'Sivuutusetäisyys')
    m.move(560, 470); page.wait_for_timeout(100)
    m.click(560, 470)
    m.move(590, 495); page.wait_for_timeout(100)
    m.click(590, 495)
    page.wait_for_timeout(300)

    # --- käännösetäisyys reittipisteeseen 2 ---
    m.click(450, 430, button='right')
    page.wait_for_timeout(150)
    menu_click(page, 'Käännösetäisyys')
    m.move(400, 470); m.click(400, 470)
    page.wait_for_timeout(300)
    shot(page, '06-nuotit-sivuutus-kaannos')
    st = state(page)
    r = st['routes'][0]
    print('sivuutukset', r['passes'], 'käännökset', r['turns'])

    # --- ominaisuudet ja hyväksyntä ---
    page.locator('#editBanner button', has_text='Ominaisuudet').click()
    page.wait_for_selector('#pFrom'); page.wait_for_timeout(300)
    page.fill('#pFrom', 'Naistenlahti')
    page.fill('#pVia', 'Siilinkari')
    page.fill('#pTo', 'Kämmenniemi')
    page.fill('#pAppr', 'Testi Hyväksyjä')
    page.fill('#pVesNew', 'PV Testi')
    shot(page, '07-ominaisuudet')
    page.locator('.modal button', has_text='Hyväksy omaan kirjastoon').click()
    page.wait_for_timeout(300)
    shot(page, '08-hyvaksytty-muokkaus')
    page.locator('#editBanner button', has_text='Lopeta muokkaus').click()
    page.wait_for_timeout(300)
    st = state(page)
    r = st['routes'][0]
    assert r['status'] == 'approved' and r['name'] == 'Naistenlahti – Siilinkari – Kämmenniemi', r
    assert r['vessels'] == ['PV Testi'] and st['settings']['vessels'] == ['PV Testi'] and st['settings']['currentVessel'] == 'PV Testi', (r['vessels'], st['settings']['vessels'])
    print('hyväksynnässä kirjoitettu alus lisättiin aluslistaan')
    page.locator('.item').first.click()
    page.wait_for_timeout(400)
    shot(page, '09-kirjasto')

    # --- GPX-vienti ja -tuonti ---
    with page.expect_download() as dl:
        page.locator('.detail button', has_text='Vie GPX').click()
    path = dl.value.path()
    gpx = open(path, encoding='utf-8').read()
    print('GPX', len(gpx), 'merkkiä;', gpx.count('<rtept'), 'reittipistettä')
    assert gpx.count('<rtept') == 4
    page.set_input_files('#fileInput', files=[{'name': 'testi.gpx', 'mimeType': 'application/gpx+xml', 'buffer': gpx.encode()}])
    page.wait_for_timeout(300)
    shot(page, '10-tuonti')
    page.locator('.modal button', has_text='Tuo').click()
    page.wait_for_timeout(400)
    st = state(page)
    assert len(st['routes']) == 2, len(st['routes'])
    print('tuotu reitti', st['routes'][1]['name'], st['routes'][1]['status'], len(st['routes'][1]['notes']), 'nuottia')

    # --- asema ja tehtävä ---
    m.click(260, 650, button='right')
    page.wait_for_timeout(150)
    menu_click(page, 'Aseta asema tähän')
    page.fill('#sName', 'Tampereen asema')
    page.locator('.modal button', has_text='Tallenna').click()
    page.locator('.mi', has_text='Tehtävät').click()
    menu_click(page, 'Uusi tehtävä')
    page.fill('#tName', 'Keikka 1234 – vene karilla')
    page.fill('#tPos', "61°37,800'N 023°47,400'E")
    page.locator('.modal button', has_text='Tallenna').click()
    page.wait_for_timeout(1200)
    shot(page, '11-tehtava')
    print('tehtävälukema', page.inner_text('#roTask'))

    # --- harppi ---
    page.evaluate("App.map.setView([61.62, 23.76], 13)")
    page.wait_for_timeout(800)
    page.keyboard.press('m')
    for x, y in [(200, 200), (400, 260), (500, 420)]:
        m.click(x, y)
    m.move(650, 500)
    page.wait_for_timeout(200)
    shot(page, '12-harppi')
    print('harppi', page.inner_text('#readout'))
    page.keyboard.press('Escape')

    # --- lähizoomi ---
    page.evaluate("App.map.setView([61.6235, 23.770], 16)")
    page.wait_for_timeout(5000)
    shot(page, '13-zoom16')
    page.evaluate("App.map.setView([61.6235, 23.770], 17)")
    page.wait_for_timeout(5000)
    shot(page, '14-zoom17')

    # --- yönäyttö ---
    page.evaluate("App.map.setView([61.62, 23.76], 13)")
    page.locator('.mi', has_text='Näytä').click()
    menu_click(page, 'Yönäyttö')
    page.keyboard.press('Escape')
    page.wait_for_timeout(1500)
    shot(page, '15-yonaytto')

    # --- säilyvyys ---
    page.reload()
    page.wait_for_timeout(1500)
    st = state(page)
    print('uudelleenlatauksen jälkeen', len(st['routes']), 'reittiä,', len(st['tasks']), 'tehtävää')


def main():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={'width': 1400, 'height': 860}, device_scale_factor=float(os.environ.get('DPR', '1')),
                            accept_downloads=True)
        page = ctx.new_page()
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.route('**/*', handle)
        page.goto(TARGET)
        page.wait_for_timeout(1500)
        shot(page, '01-tervetuloa')
        page.click('button:has-text("Aloita")')
        ves = page.evaluate("[Store.state.settings.vessels, [...document.querySelectorAll('#vesselSel option')].map(o => o.textContent)]")
        print('alukset alussa', ves)
        assert ves[0] == [] and ves[1][0] == 'Ei aluksia', ves
        page.evaluate("App.map.setView([61.62, 23.76], 13)")
        page.wait_for_timeout(2500)
        shot(page, '02-kartta-z13')
        if os.environ.get('SCEN', '1') != '0':
            scenario(page)
        b.close()
    print('VIRHEET:' if errors else 'Ei konsolivirheitä.')
    for e in errors:
        print(' ', e)


if __name__ == '__main__':
    main()
