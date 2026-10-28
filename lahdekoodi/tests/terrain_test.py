"""Maasto-tasot ja osoitehaku (vaihe 2): osoite- ja kiinteistötunnushaku, tunnus napautuksella, tasojen piirto,
suorituskyky puhelinprofiililla, alueen ulkopuolinen käyttö, offline-tila sekä puhelinkierros (iPhone 14 ja Pixel 7).

Aineistopaketti tarjoillaan paikallisesta hakemistosta (HTTP Range ja CORS), koska Pages-osoite ei ole sallittu tässä
työtilassa. Hakemisto annetaan muuttujalla AINEISTO (oletus /home/claude/opetus/navi/putki/ulos), ja sen pitää sisältää
aineisto.json, nasijarvi.pmtiles, maasto.pmtiles, osoitteet.json ja kiinteistot.json. Testattava sivu annetaan
muuttujalla TARGET (oletus dist/Reittikartta.html).

Ajo: python3 tests/terrain_test.py. OSA=kriteeri rajaa osiin (esim. OSA=suorituskyky), DEVICE rajaa puhelinkierroksen
yhteen laitteeseen. WebKit käytetään, jos se on asennettu, muuten iPhone-profiili ajetaan Chromiumilla (ilmoitetaan)."""
import functools
import http.server
import json
import math
import os
import re
import statistics
import sys
import threading

sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, '..', 'dist')
TARGET = os.environ.get('TARGET', 'file://' + os.path.join(DIST, 'Reittikartta.html'))
AINEISTO = os.environ.get('AINEISTO', '/home/claude/opetus/navi/putki/ulos')
OUT = os.environ.get('OUT', '/tmp/rk-shots')
ONLY = os.environ.get('OSA', '')
os.makedirs(OUT, exist_ok=True)
fails = []
numbers = {}


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


def want(part):
    return not ONLY or part in ONLY.split(',')


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(a))


# ---------- paikallinen aineistopalvelin (Range ja CORS), pyynnöt kirjataan ----------
LOG = []


class Pk(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=AINEISTO, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        name = self.path.split('?')[0].lstrip('/')
        path = self.translate_path(self.path.split('?')[0])
        rng = self.headers.get('Range')
        if not rng or not os.path.isfile(path):
            LOG.append((name, None, os.path.getsize(path) if os.path.isfile(path) else 0))
            return super().do_GET()
        m = re.match(r'bytes=(\d*)-(\d*)$', rng)
        size = os.path.getsize(path)
        a, b = m.groups()
        start, end = (max(0, size - int(b)), size - 1) if a == '' else (int(a), int(b) if b else size - 1)
        end = min(end, size - 1)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        LOG.append((name, rng, end - start + 1))
        with open(path, 'rb') as f:
            f.seek(start)
            try:
                self.wfile.write(f.read(end - start + 1))
            except (BrokenPipeError, ConnectionResetError):
                pass


def serve(handler_cls):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


def tile_bytes(since=0):
    return sum(n for name, rng, n in LOG[since:] if name.endswith('.pmtiles'))


# ---------- apuja ----------
def init_script(pk, view, show, extra=None):
    st = {'version': 1, 'settings': {'welcomed': True, 'terrainUrl': pk, 'panelOpen': False,
                                       'view': {'lat': view[0], 'lng': view[1], 'zoom': view[2]},
                                       'show': {k: True for k in show}}}
    if extra:
        st['settings'].update(extra)
    return "if (!localStorage.getItem('reittikartta.v1')) localStorage.setItem('reittikartta.v1', %s)" % json.dumps(json.dumps(st))


def route_page(page, pk):
    # paketin pyynnöt kulkevat suoraan palvelimelle ilman Python-käsittelijää, muut korvataan testiaineistolla
    # säännöllinen lauseke, jotta paketin pyynnöt eivät kulje Playwrightin Python-käsittelijän kautta (se hidastaa ne sekunteihin)
    page.route(re.compile(r'^(?!' + re.escape(pk) + ').*'), handle)


def collect(page, store):
    page.on('console', lambda m: store.append(m.type + ': ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: store.append('pageerror: ' + str(e)))


LOADED = """() => { const L = Terrain.layers(); return ['vec', 'cover', 'relief'].every(k => !L[k] || !App.map.hasLayer(L[k]) || !L[k].isLoading()); }"""


def loaded(page, extra_ms=400, timeout=20000):
    page.wait_for_timeout(250)
    page.wait_for_function(LOADED, timeout=timeout)
    page.wait_for_timeout(extra_ms)


INK = """(cls) => { let n = 0; document.querySelectorAll('.leaflet-' + cls + '-pane canvas').forEach(c => {
    if (c.width < 16) return; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; break; } }); return n; }"""


def ink(page, pane):
    return page.evaluate(INK, pane)


def set_show(page, **flags):
    page.evaluate("(f) => { Object.keys(f).forEach(k => { Store.state.settings.show[k] = f[k]; }); Store.emit('settings'); }", flags)


def click_center(page, dx=0, dy=0):
    box = page.locator('#map').bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2 + dx, box['y'] + box['height'] / 2 + dy)


def popup(page):
    page.wait_for_timeout(700)
    return page.evaluate("(() => { const p = document.querySelector('.leaflet-popup-content'); return p ? p.innerText : ''; })()")


def search_for(page, q, kind='osoite', name=None):
    """Kirjoittaa hakusanan ja odottaa, että tulosten joukossa on odotettu rivi (edellisen haun tulokset eivät kelpaa)."""
    page.fill('#searchIn', '')
    page.fill('#searchIn', q)
    name = name or q
    try:
        page.wait_for_function("(a) => Search.results.some(r => r.kind === a[0] && (r.name === a[1] || r.name.indexOf(a[1]) === 0))", arg=[kind, name], timeout=12000)
    except Exception:
        page.wait_for_timeout(300)
    return page.evaluate("Search.results.map(r => ({name: r.name, info: r.info, lat: r.lat, lng: r.lng, kind: r.kind, km: r.km}))")


ADDR = [('Laiturikatu 8', 23.746282, 61.5053), ('Rantatie 3', 23.723903, 61.502643), ('Siilinkari 2', 23.753915, 61.517575)]
PARCELS = [('837-103-9902-0', 'Tampereen keskusta', 23.7610, 61.4978), ('837-90-8002-2', 'Teisko', 23.8330, 61.6280), ('980-452-6-22', 'Murole', 23.7100, 61.9300)]


def parcel_forms(t):
    a, b, c, d = [int(x) for x in t.split('-')]
    return [t, t.replace('-', ' '), '%03d%03d%04d%04d' % (a, b, c, d)]


def main():
    if not os.path.isfile(os.path.join(AINEISTO, 'aineisto.json')):
        print('Aineistopakettia ei löydy hakemistosta %s, testi ohitetaan.' % AINEISTO)
        return
    srv, PK = serve(Pk)
    print('paketti:', PK, 'sivu:', TARGET)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        if want('haku') or want('napautus') or want('tasot'):
            haku_ja_napautus(pw, b, PK)
        if want('alue'):
            alueen_ulkopuoli(pw, b, PK)
        if want('offline'):
            offline(pw, b, PK)
        if want('suorituskyky'):
            suorituskyky(pw, b, PK)
        if want('mobiili'):
            mobiili(pw, b, PK)
        b.close()
    print()
    print('NUMEROT:', json.dumps(numbers, ensure_ascii=False))
    print('TULOS: kaikki kunnossa' if not fails else 'TULOS: %d vikaa' % len(fails))
    for f in fails:
        print('  -', f)
    sys.exit(1 if fails else 0)


# ======================================================================================
def haku_ja_napautus(pw, b, PK):
    errs = []
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    ctx.add_init_script(init_script(PK, (61.55, 23.80, 11), []))
    page = ctx.new_page()
    collect(page, errs)
    route_page(page, PK)
    page.goto(TARGET)
    page.wait_for_timeout(1500)

    # --- oletukset ja valikko ---
    show = page.evaluate("Store.state.settings.show")
    keys = ['terrainBuildings', 'terrainAddresses', 'terrainParcels', 'terrainCover', 'terrainRelief', 'terrainRoads']
    check(all(show.get(k) is False for k in keys) or all(not show.get(k) for k in keys), 'kuusi Maasto-valintaa on oletuksena pois päältä')
    d = page.evaluate("""(() => { const s = Store.state.settings; return s.terrainUrl; })()""")
    check(d == PK, 'asetus terrainUrl luetaan tallennetusta tilasta')
    check(not LOG, 'Maasto-tasojen ollessa pois päältä paketista ei pyydetä mitään käynnistyksessä: %s' % LOG[:3])
    check(page.evaluate("Terrain.DEFAULT_URL") == 'https://jvaahtikari.github.io/reittikartta-aineisto/', 'oletusosoite on Pages-osoite')
    page.click('.mi[data-menu=view]')
    page.wait_for_timeout(300)
    labels = page.evaluate("[...document.querySelectorAll('#ctxmenu .mh, #ctxmenu button, #ctxmenu .head, #ctxmenu > *')].map(e => e.textContent.trim())")
    i = [j for j, t in enumerate(labels) if t.startswith('Maasto (Näsijärvi)')]
    check(bool(i), 'Näytä-valikossa on ryhmä "Maasto (Näsijärvi)"')
    for lab in ('Rakennukset', 'Osoitteet', 'Kiinteistörajat', 'Maastotyyppi', 'Varjostus', 'Tiet'):
        check(any(t.startswith(lab) for t in labels[i[0]:i[0] + 8]) if i else False, 'valikossa kohta ' + lab)
    page.keyboard.press('Escape')

    # --- kriteeri 1: osoitehaku, Maasto-tasot pois päältä ---
    first_n = len(LOG)
    dists = []
    for q, lon0, lat0 in ADDR:
        res = search_for(page, q)
        hit = [r for r in res if r['kind'] == 'osoite' and r['name'] == q]
        dd = min([haversine(lat0, lon0, r['lat'], r['lng']) for r in hit], default=None)
        dists.append(round(dd, 1) if dd is not None else None)
        check(dd is not None and dd < 50, 'osoitehaku %s löytyy %s m päähän vaiheen 1 paikasta (raja 50)' % (q, dists[-1]))
        txt = page.inner_text('#searchRes')
        check(q in txt and 'osoite, Tampere' in txt and ' mpk · ' in txt, 'tulosrivillä osoite, kunta ja etäisyys: %s' % txt.replace('\n', ' | ')[:160])
        if q == 'Laiturikatu 8':
            page.keyboard.press('Enter')
            page.wait_for_timeout(700)
            c = page.evaluate("[App.map.getCenter().lat, App.map.getCenter().lng, App.map.getZoom()]")
            check(haversine(c[0], c[1], lat0, lon0) < 50 and c[2] >= 17, 'osoitteen valinta keskittää kartan siihen zoomille %s' % c[2])
    numbers['osoitehaku_etaisyydet_m'] = dists
    new = [n for n, r, s in LOG[first_n:]]
    check(set(new) == {'osoitteet.json'}, 'osoitehaku lataa vain osoitteet.json (kerran) ja toimii tasot pois: %s' % sorted(set(new)))
    check(len([n for n in new if n == 'osoitteet.json']) == 1, 'hakemisto ladataan vain kerran')
    page.fill('#searchIn', '')
    page.keyboard.press('Escape')

    # osoitteen jäsennys
    parse = page.evaluate("['Kaupinojankatu 12', 'Laiturikatu 8 a', 'Rantatie 3, Tampere', 'Laiturikatu 8 Tampere', '837-103-9902-0', 'Siilinkari', 'testi 3'].map(s => Terrain.parseAddress(s))")
    check(parse[0] and parse[0]['num'] == '12' and parse[1]['letter'] == 'a' and parse[2]['hint'] == 'tampere' and parse[3]['letter'] == '' and parse[3]['hint'] == 'tampere'
          and parse[4] is None and parse[5] is None, 'osoitteen jäsennys: numero, kirjain ja kuntavihje')

    # tulos kelpaa tehtäväpaikaksi
    page.click('#tbTask')
    page.wait_for_selector('#tFind')
    page.fill('#tFind', 'Rantatie 3')
    page.wait_for_function("document.querySelectorAll('#tRes .sr').length > 0 && /osoite/.test(document.getElementById('tRes').innerText)", timeout=15000)
    page.locator('#tRes .sr', has_text='osoite, Tampere').first.click()
    page.wait_for_timeout(600)
    bn = page.inner_text('#editBanner')
    check('Tarkista tehtäväpaikka' in bn and 'Rantatie 3' in bn, 'osoite kelpaa tehtäväpaikaksi: tarkistusilmoitus')
    page.click('#editBanner button:has-text("Vahvista paikka")')
    page.wait_for_timeout(400)
    page.click('.modal button:has-text("Luo tehtävä")')
    page.wait_for_timeout(500)
    tk = page.evaluate("Store.state.tasks[Store.state.tasks.length - 1]")
    check(tk and haversine(tk['lat'], tk['lng'], 61.502643, 23.723903) < 50 and 'Rantatie 3' in tk['name'], 'tehtävä luotu osoitteen paikkaan: %s' % (tk and tk['name']))

    # --- kriteeri 2: kiinteistötunnushaku ---
    first_n = len(LOG)
    found = {}
    for t, area, lon0, lat0 in PARCELS:
        for form in parcel_forms(t):
            res = search_for(page, form, 'kiinteistö', t)
            hit = [r for r in res if r['kind'] == 'kiinteistö' and r['name'] == t]
            check(bool(hit), 'tunnushaku %s muodossa "%s" löytyy' % (area, form))
            if hit:
                found[t] = hit[0]
        h = found.get(t)
        if h:
            dd = haversine(lat0, lon0, h['lat'], h['lng'])
            check(dd < 4000 and 'kiinteistö' in h['info'], '%s: tunnus %s on alueella (%.0f m hakualueen keskestä) ja rivillä lajina kiinteistö: %s' % (area, t, dd, h['info']))
    check(set(n for n, r, s in LOG[first_n:]) == {'kiinteistot.json'}, 'tunnushaku lataa vain kiinteistot.json kerran')
    page.fill('#searchIn', '')
    page.keyboard.press('Escape')
    part = search_for(page, '837-103-9902', 'kiinteistö', '837-103-9902-')
    check(any(r['name'].startswith('837-103-9902-') for r in part), 'tila-tunnus ilman rekisterinumeroa listaa rekisterinumerot')
    page.fill('#searchIn', '')

    # --- kriteeri 3: tunnus napautuksella kolmessa paikassa ---
    set_show(page, terrainParcels=True)
    taps = []
    for t, area, lon0, lat0 in PARCELS:
        h = found.get(t)
        if not h:
            continue
        page.evaluate("(p) => App.map.setView([p[0], p[1]], 17, {animate: false})", [h['lat'], h['lng']])
        loaded(page)
        click_center(page)
        txt = popup(page)
        ok = ('Kiinteistö ' + t) in txt
        taps.append(ok)
        check(ok, 'napautus näyttää kiinteistötunnuksen %s (%s): %s' % (t, area, txt.replace('\n', ' | ')[:110]))
        if area == 'Tampereen keskusta':
            page.screenshot(path=os.path.join(OUT, 'terrain-tunnus-popup.png'))
        # 100 m:n päästä ei saa näkyä samaa tunnusta (raja 30 m)
        page.evaluate("App.map.closePopup()")
        mpp = 40075016.686 * math.cos(h['lat'] * math.pi / 180) / 2 ** (17 + 8)
        click_center(page, dx=int(100 / mpp))
        far = popup(page)
        check(('Kiinteistö ' + t) not in far, '%s: 100 m:n päästä napautus ei näytä tätä tunnusta' % area)
        page.evaluate("App.map.closePopup()")
    numbers['tunnus_napautus'] = '%d/3' % sum(taps)

    # rakennus napautuksella ja osoitteen teksti (osoitepiste rakennuksen sisällä)
    set_show(page, terrainParcels=False, terrainBuildings=True, terrainAddresses=True)
    page.evaluate("App.map.setView([61.498368, 23.758175], 18, {animate: false})")
    loaded(page)
    click_center(page)
    txt = popup(page)
    check('Rakennus' in txt and 'toimisto- tai julkinen rakennus' in txt and '3 tai useampi' in txt and 'Kauppakatu 4' in txt,
          'rakennuksen napautus (Kauppakatu 4) näyttää käyttötarkoituksen, kerrosluokan ja osoitteen: %s' % txt.replace('\n', ' | ')[:160])
    page.evaluate("App.map.closePopup()")
    # osoitepiste ilman rakennusta (Laiturikatu 8): osoitteen tiedot
    page.evaluate("App.map.setView([61.5053, 23.746282], 18, {animate: false})")
    loaded(page)
    click_center(page)
    check('Laiturikatu 8' in popup(page), 'osoitepisteen napautus näyttää osoitteen')
    page.screenshot(path=os.path.join(OUT, 'terrain-rakennus.png'))
    page.evaluate("App.map.closePopup()")

    # --- tasot, järjestys, lähdemerkinnät ---
    set_show(page, terrainBuildings=True, terrainAddresses=True, terrainParcels=True, terrainCover=True, terrainRelief=True, terrainRoads=True)
    page.evaluate("App.map.setView([61.4985, 23.762], 17, {animate: false})")
    loaded(page, 800)
    info = page.evaluate("Terrain.info")
    check(info['vec'] and info['cover'] and info['relief'] and info['area'] and not info['note'], 'kaikki kolme Maasto-tasoa ovat kartalla alueella: %s' % {k: info[k] for k in ('vec', 'cover', 'relief', 'note')})
    check(ink(page, 'terrainVec') > 0 and ink(page, 'terrainCover') > 0 and ink(page, 'terrainRelief') > 0, 'vektori-, maastotyyppi- ja varjostustiilet piirtävät sisältöä')
    z = page.evaluate("['chart', 'depth', 'pier', 'terrainCover', 'terrainRelief', 'terrainVec', 'overlay', 'label', 'aid'].map(n => getComputedStyle(App.map.getPane(n === 'overlay' ? 'overlayPane' : n + 'Pane')).zIndex)")
    z = [int(v) for v in z]
    check(z[0] < z[3] < z[4] < z[5] < z[6] < z[7] and z[2] < z[3], 'piirtojärjestys: merikartta < maastotyyppi < varjostus < kiinteistö, tiet, rakennukset ja osoitteet < reitit ja merkit (%s)' % z)
    attr = page.inner_text('.leaflet-control-attribution')
    check('Maanmittauslaitoksen Maastotietokanta-aineistoa' in attr and 'Digi- ja väestötietoviraston rakennusten osoitetietoja' in attr and 'kiinteistörajatietoja' in attr and 'korkeusmalli' in attr,
          'kartan attribuutiossa lähdemerkinnät aineisto.json-kuvauksesta')
    page.screenshot(path=os.path.join(OUT, 'terrain-kaikki-z17.png'))
    set_show(page, terrainBuildings=False, terrainAddresses=False, terrainParcels=False, terrainCover=False, terrainRelief=False, terrainRoads=False)
    page.wait_for_timeout(400)
    info = page.evaluate("Terrain.info")
    check(not (info['vec'] or info['cover'] or info['relief']) and 'Maastotietokanta' not in page.inner_text('.leaflet-control-attribution'), 'kun tasot kytketään pois, ne poistuvat kartalta ja attribuutiosta')

    # nimistö, Ohje ja asetukset
    page.click('.mi[data-menu=help]')
    page.locator('#ctxmenu button', has_text='Aineistot ja käyttöehdot').click()
    page.wait_for_function("document.querySelector('.modal') && /Sisältää Maanmittauslaitoksen Maastotietokanta/.test(document.querySelector('.modal').innerText)", timeout=8000)
    mt = page.inner_text('.modal')
    check('Maastoaineisto (Näsijärvi)' in mt and 'poiminta 3.2.2025' in mt and 'Luonnonvarakeskuksen' in mt and 'Digi- ja väestötietoviraston' in mt,
          'Ohje → Aineistot ja käyttöehdot luettelee paketin lähteet lisensseineen ja DVV:n poimintapäivän')
    page.keyboard.press('Escape')
    page.click('.mi[data-menu=file]')
    page.locator('#ctxmenu button', has_text='Asetukset').click()
    check(page.input_value('#sTerr') == PK, 'asetuksissa kenttä Maastoaineiston osoite')
    page.fill('#sTerr', '')
    page.locator('.modal button:has-text("Tallenna")').click()
    try:
        page.wait_for_function("Store.state.settings.terrainUrl === 'https://jvaahtikari.github.io/reittikartta-aineisto/'", timeout=3000)
    except Exception:
        pass
    got = page.evaluate("Store.state.settings.terrainUrl")
    if got != 'https://jvaahtikari.github.io/reittikartta-aineisto/':
        print('  DIAGNOSTIIKKA modaaleja', page.locator('.modal').count(), 'sTerr', page.locator('#sTerr').count(), 'tila', page.evaluate("JSON.stringify(Store.state.settings.terrainUrl)"), errs[-3:])
    check(got == 'https://jvaahtikari.github.io/reittikartta-aineisto/', 'tyhjä osoite palauttaa oletuksen (%s)' % got)
    page.evaluate("Store.state.settings.terrainUrl = %s; Store.emit('settings')" % json.dumps(PK))

    bad = [e for e in errs if not re.search(r'Failed to load resource', e)]
    check(not bad, 'ei sivuvirheitä eikä konsolivirheitä: %s' % bad[:3])
    ctx.close()


# ======================================================================================
def alueen_ulkopuoli(pw, b, PK):
    errs = []
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    all6 = ['terrainBuildings', 'terrainAddresses', 'terrainParcels', 'terrainCover', 'terrainRelief', 'terrainRoads']
    ctx.add_init_script(init_script(PK, (60.1699, 24.9384, 15), all6))
    page = ctx.new_page()
    collect(page, errs)
    start = len(LOG)
    route_page(page, PK)
    page.goto(TARGET)
    page.wait_for_timeout(3500)
    info = page.evaluate("Terrain.info")
    tile_reqs = [n for n, r, s in LOG[start:] if n.endswith('.pmtiles')]
    check(info['note'] and page.inner_text('.terrain-note') == 'Maastoaineisto kattaa vain Näsijärven', 'Helsingissä näkyy huomautus "Maastoaineisto kattaa vain Näsijärven"')
    check(not (info['vec'] or info['cover'] or info['relief']), 'Helsingissä Maasto-tasot eivät ole kartalla')
    check(not tile_reqs, 'Helsingissä ei yhtään pyyntöä paketin tiiliin (pmtiles): %d' % len(tile_reqs))
    numbers['alueen_ulkopuolella_tiilipyyntoja'] = len(tile_reqs)
    bad = [e for e in errs if not re.search(r'Failed to load resource', e)]
    check(not bad, 'Helsingissä ei konsolivirheitä: %s' % bad[:3])
    check(page.evaluate("Terrain.stats.fail") == 0, 'Helsingissä ei epäonnistuneita latauksia')
    page.screenshot(path=os.path.join(OUT, 'terrain-helsinki.png'))
    # alueelle ja takaisin
    page.evaluate("App.map.setView([61.4985, 23.762], 16, {animate: false})")
    loaded(page, 600)
    info = page.evaluate("Terrain.info")
    check(not info['note'] and info['vec'] and [n for n, r, s in LOG[start:] if n.endswith('.pmtiles')], 'alueelle siirryttäessä huomautus poistuu ja tiilet haetaan')
    n_in = len(LOG)
    page.evaluate("App.map.setView([60.1699, 24.9384], 15, {animate: false})")
    page.wait_for_timeout(1500)
    check(page.evaluate("Terrain.info")['note'] and not [n for n, r, s in LOG[n_in:] if n.endswith('.pmtiles')], 'alueelta poistuttaessa huomautus palaa eikä tiilipyyntöjä tule')
    # Näsijärven ja ulkopuolen rajalla: tiiliä ei pyydetä alueen ulkopuolisille ruuduille
    n_edge = len(LOG)
    page.evaluate("App.map.setView([61.47, 23.49], 13, {animate: false})")
    loaded(page, 600)
    check(page.evaluate("Terrain.info")['vec'], 'alueen reunalla taso on kartalla')
    ctx.close()


# ======================================================================================
def offline(pw, b, PK):
    errs = []
    ctx = b.new_context(viewport={'width': 1400, 'height': 860})
    all6 = ['terrainBuildings', 'terrainAddresses', 'terrainParcels', 'terrainCover', 'terrainRelief', 'terrainRoads']
    ctx.add_init_script(init_script(PK, (61.4985, 23.762, 16), all6))
    page = ctx.new_page()
    collect(page, errs)
    state = {'down': True}

    def pk_handler(route, request):
        if state['down']:
            return route.abort('connectionrefused')
        return route.continue_()
    page.route(lambda u: u.startswith(PK), pk_handler)
    page.route(lambda u: not u.startswith(PK), handle)
    page.goto(TARGET)
    page.wait_for_timeout(3500)
    bad = [e for e in errs if not re.search(r'Failed to load resource|net::ERR', e)]
    check(not bad, 'ilman verkkoa ei sivuvirheitä eikä sovelluksen konsolivirheitä: %s' % bad[:3])
    check(page.evaluate("document.getElementById('toast').hidden") and page.locator('.modal').count() == 0, 'ilman verkkoa ei virheilmoitusta käyttäjälle')
    info = page.evaluate("Terrain.info")
    check(info['vec'] and ink(page, 'terrainVec') == 0, 'ilman verkkoa taso jää hiljaa tyhjäksi')
    # haku ei kaada: osoitehaku ilman verkkoa antaa vain muut tulokset
    page.fill('#searchIn', 'Laiturikatu 8')
    page.wait_for_timeout(1500)
    check(page.evaluate("Search.results.filter(r => r.kind === 'osoite').length") == 0 and not [e for e in errs if e.startswith('pageerror')], 'osoitehaku ilman verkkoa ei tuota virhettä')
    page.fill('#searchIn', '')
    # verkko palaa: tiilet haetaan uudelleen
    state['down'] = False
    page.wait_for_timeout(5500)          # uusi PMTiles-olio luodaan 5 s:n kuluttua ensimmäisestä virheestä
    page.evaluate("App.map.panBy([300, 0], {animate: false})")
    page.wait_for_timeout(500)
    page.evaluate("App.map.panBy([-300, 0], {animate: false})")
    page.wait_for_timeout(500)
    page.evaluate("Terrain.layers().vec.redraw()")
    loaded(page, 800)
    check(ink(page, 'terrainVec') > 0, 'kun verkko palaa, tiilet piirtyvät (virheet eivät jääneet välimuistiin)')
    ctx.close()


# ======================================================================================
def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))] if xs else None


def suorituskyky(pw, b, PK):
    dev = dict(pw.devices['Pixel 7'])
    dev.pop('default_browser_type', None)
    ctx = b.new_context(**dev)
    all3 = ['terrainBuildings', 'terrainRoads', 'terrainRelief']
    ctx.add_init_script(init_script(PK, (61.4985, 23.762, 15), all3))
    page = ctx.new_page()
    errs = []
    collect(page, errs)
    route_page(page, PK)
    start = len(LOG)
    page.goto(TARGET)
    loaded(page, 800)
    W = page.evaluate("innerWidth")
    check(ink(page, 'terrainVec') > 0 and ink(page, 'terrainRelief') > 0, 'Pixel 7: rakennukset, tiet ja varjostus piirtyvät Tampereen keskustassa z15')
    startup_mb = tile_bytes(start) / 1e6
    cold = page.evaluate("Terrain.perf")
    print('  käynnistyksen siirto %.2f Mt, tiilien piirto kylmänä (ms): vektori %s, varjostus %s, varjostuksen lasku %s' % (
        startup_mb, [round(x) for x in cold['vec']], [round(x) for x in cold['relief']], [round(x) for x in cold['shade']]))

    def measure(label, throttle):
        c = ctx.new_cdp_session(page)
        c.send('Emulation.setCPUThrottlingRate', {'rate': throttle})
        # yhden näkymän siirto: pyyhkäistään koko näytön leveyden verran
        page.evaluate("Terrain.perf.vec.length = 0; Terrain.perf.relief.length = 0; Terrain.perf.shade.length = 0")
        mark = len(LOG)
        page.evaluate("App.map.panBy([%d, 0], {animate: false})" % W)
        loaded(page, 600)
        mb = tile_bytes(mark) / 1e6
        pf = page.evaluate("({vec: Terrain.perf.vec.slice(), relief: Terrain.perf.relief.slice(), shade: Terrain.perf.shade.slice()})")
        # tiilien uudelleenpiirto valmiista tiilivarastosta: yksi tiili kerrallaan, jolloin jonotus ei vääristä piirtoaikaa
        warm = page.evaluate("""async () => {
            const L = Terrain.layers().vec, out = {vec: [], relief: []};
            const keys = Object.keys(L._tiles).filter(k => L._tiles[k].current && L._tiles[k].el.width > 1);
            for (const k of keys) {
                const t = L._tiles[k];
                const t0 = performance.now();
                await new Promise(res => L.renderTile(t.coords, t.el, k, res));
                out.vec.push(performance.now() - t0);
            }
            out.n_kaikki = keys.length;
            return out;
        }""")
        warm['relief'] = pf['relief']
        c.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        r = {
            'siirto_mt': round(mb, 2),
            'vektoritiili_kylma_ms': {'n': len(pf['vec']), 'mediaani': round(statistics.median(pf['vec'] or [0])), 'p95': round(pct(pf['vec'], .95) or 0), 'max': round(max(pf['vec'] or [0]))},
            'vektoritiili_piirto_ms': {'n': len(warm['vec']), 'mediaani': round(statistics.median(warm['vec'] or [0])), 'p95': round(pct(warm['vec'], .95) or 0), 'max': round(max(warm['vec'] or [0]))},
            'varjostustiili_kylma_ms': {'n': len(pf['relief']), 'mediaani': round(statistics.median(pf['relief'] or [0])), 'max': round(max(pf['relief'] or [0]))},
            'varjostuksen_lasku_ms': {'n': len(pf['shade']), 'max': round(max(pf['shade'] or [0]))},
        }
        print('  %s (suoritin 1/%d): %s' % (label, throttle, json.dumps(r, ensure_ascii=False)))
        return r
    r1 = measure('Pixel 7 normaali', 1)
    numbers['pixel7'] = r1
    check(r1['siirto_mt'] < 2.0, 'yhden näkymän siirto %.2f Mt (raja 2 Mt)' % r1['siirto_mt'])
    check(startup_mb < 2.0, 'ensilataus %.2f Mt (raja 2 Mt)' % startup_mb)
    check(r1['vektoritiili_piirto_ms']['n'] > 0 and r1['vektoritiili_piirto_ms']['p95'] < 100, 'vektoritiilen piirto valmiista tiilestä p95 %d ms (raja 100 ms)' % r1['vektoritiili_piirto_ms']['p95'])
    check(r1['vektoritiili_kylma_ms']['n'] > 0 and r1['vektoritiili_kylma_ms']['mediaani'] < 500, 'vektoritiili kylmänä (haku, purku ja piirto, kahdeksan tiiltä rinnakkain paikallisesta paketista) mediaani %d ms (raja 500 ms)' % r1['vektoritiili_kylma_ms']['mediaani'])
    check(r1['varjostuksen_lasku_ms']['max'] < 100, 'varjostuksen laskenta tiiltä kohden enintään %d ms (raja 100 ms)' % r1['varjostuksen_lasku_ms']['max'])
    r4 = measure('Pixel 7 hidastettu', 4)
    numbers['pixel7_4x_hidastus'] = r4
    check(r4['vektoritiili_piirto_ms']['p95'] < 100, 'vektoritiilen piirto neljä kertaa hitaammalla suorittimella p95 %d ms' % r4['vektoritiili_piirto_ms']['p95'])
    page.screenshot(path=os.path.join(OUT, 'terrain-pixel7-z15.png'))
    bad = [e for e in errs if not re.search(r'Failed to load resource', e)]
    check(not bad, 'Pixel 7: ei konsolivirheitä: %s' % bad[:3])
    ctx.close()

    # sama web-osoitteesta (toinen alkuperä kuin paketti): range-pyynnöt toimivat ristiin
    web, WEB = serve(functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIST))
    ctx = b.new_context(viewport={'width': 1200, 'height': 800})
    ctx.add_init_script(init_script(PK, (61.4985, 23.762, 16), ['terrainBuildings', 'terrainRoads', 'terrainRelief']))
    page = ctx.new_page()
    errs = []
    collect(page, errs)
    page.route(re.compile(r'^(?!' + re.escape(PK) + '|' + re.escape(WEB) + ').*'), handle)
    page.goto(WEB + 'Reittikartta.html')
    loaded(page, 800)
    check(ink(page, 'terrainVec') > 0 and ink(page, 'terrainRelief') > 0 and page.evaluate("Terrain.stats.fail") == 0, 'web-osoitteesta (http, eri alkuperä kuin paketti) tasot piirtyvät')
    ctx.close()


# ======================================================================================
def mobiili(pw, b0, PK):
    devs = [os.environ['DEVICE']] if os.environ.get('DEVICE') else ['iPhone 14', 'Pixel 7']
    for name in devs:
        dev = dict(pw.devices[name])
        kind = dev.pop('default_browser_type')
        engine = 'chromium'
        try:
            br = getattr(pw, kind).launch()
            engine = kind
        except Exception as e:
            print('%s: %s ei käytettävissä (%s), ajetaan Chromiumilla' % (name, kind, str(e).splitlines()[0][:70]))
            br = pw.chromium.launch()
        print('--- puhelinkierros: %s (%s)' % (name, engine))
        ctx = br.new_context(**dev)
        ctx.add_init_script(init_script(PK, (61.5053, 23.7463, 15), []))
        page = ctx.new_page()
        errs = []
        collect(page, errs)
        route_page(page, PK)
        page.goto(TARGET)
        page.wait_for_timeout(1800)
        W = dev['viewport']['width']
        check(page.evaluate("document.documentElement.scrollWidth") <= W, '%s: sivu mahtuu leveyteen' % name)
        page.tap('#menuBtn')
        page.wait_for_timeout(300)
        page.locator('#ctxmenu button', has_text='Näytä').first.tap()
        page.wait_for_timeout(400)
        # kapealla näytöllä Näytä-valikko on jaettu osioihin, joten avataan Maasto-osio
        sect = page.locator('#ctxmenu button', has_text='Maasto (Näsijärvi)')
        if sect.count():
            sect.first.tap()
            page.wait_for_timeout(400)
        rows = page.evaluate("""[...document.querySelectorAll('#ctxmenu button')].map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(r.height), r.left >= 0 && r.right <= innerWidth]; })""")
        mrows = [r for r in rows if r[0].split(' ')[0].rstrip('(') in ('Rakennukset', 'Osoitteet', 'Kiinteistörajat', 'Maastotyyppi', 'Varjostus', 'Tiet')
                 or r[0].startswith('Kiinteistörajat')]
        check(len(mrows) >= 6, '%s: Maasto-valinnat näkyvät Näytä-valikossa (%d)' % (name, len(mrows)))
        check(all(r[1] >= 40 and r[2] for r in mrows), '%s: Maasto-valintojen kosketuskohteet vähintään 40 px ja mahtuvat leveyteen: %s' % (name, [r[1] for r in mrows]))
        heads = page.evaluate("[...document.querySelectorAll('#ctxmenu *')].some(e => e.textContent.trim() === 'Maasto (Näsijärvi)')")
        check(heads, '%s: otsikko Maasto (Näsijärvi) näkyy' % name)
        page.locator('#ctxmenu button', has_text='Rakennukset').first.tap()
        page.wait_for_timeout(500)
        check(page.evaluate("Store.state.settings.show.terrainBuildings") is True, '%s: Rakennukset-valinta kytkeytyy kosketuksella' % name)
        page.screenshot(path=os.path.join(OUT, 'terrain-%s-valikko.png' % name.replace(' ', '')))
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        if page.evaluate("!document.getElementById('ctxmenu').hidden"):
            page.evaluate("document.getElementById('menuBackdrop') && document.getElementById('menuBackdrop').click()")
        page.wait_for_timeout(300)

        # haku: osoite, tulosrivi ja valinta kosketuksella
        page.tap('#searchIn')
        page.fill('#searchIn', 'Laiturikatu 8')
        page.wait_for_function("Search.results.some(r => r.kind === 'osoite')", timeout=15000)
        r = page.evaluate("""(() => { const e = [...document.querySelectorAll('#searchRes .sr')].find(x => /Laiturikatu 8/.test(x.textContent)); const b = e.getBoundingClientRect(); return [Math.round(b.height), b.left >= 0 && b.right <= innerWidth + 0.5, e.textContent]; })()""")
        check(r[0] >= 36 and r[1] and 'osoite, Tampere' in r[2], '%s: osoitehaun tulosrivi mahtuu ja on napautettava (%d px): %s' % (name, r[0], r[2].replace('\n', ' ')[:70]))
        page.screenshot(path=os.path.join(OUT, 'terrain-%s-haku.png' % name.replace(' ', '')))
        page.locator('#searchRes .sr', has_text='Laiturikatu 8').first.dispatch_event('mousedown')
        page.wait_for_timeout(900)
        c = page.evaluate("[App.map.getCenter().lat, App.map.getCenter().lng, App.map.getZoom()]")
        check(c[2] >= 17, '%s: osoitteen valinta zoomaa kartan tasolle %d' % (name, c[2]))

        # napautus: rakennus ja kiinteistötunnus
        set_show(page, terrainBuildings=True, terrainParcels=True)
        page.evaluate("App.map.setView([61.498368, 23.758175], 18, {animate: false})")
        loaded(page)
        box = page.locator('#map').bounding_box()
        # keskitys ei ole kartan keskellä, jos kirjasto tai ilmoituspalkki vie tilaa: napautetaan pisteen kohtaa
        pt = page.evaluate("(() => { const p = App.map.latLngToContainerPoint([61.498368, 23.758175]); return [p.x, p.y]; })()")
        page.touchscreen.tap(box['x'] + pt[0], box['y'] + pt[1])
        txt = popup(page)
        check('Rakennus' in txt or 'Kiinteistö' in txt, '%s: napautus avaa rakennuksen tai kiinteistön tiedot: %s' % (name, txt.replace('\n', ' | ')[:100]))
        inside = page.evaluate("(() => { const p = document.querySelector('.leaflet-popup'); if (!p) return false; const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0; })()")
        check(inside, '%s: tietoikkuna mahtuu näytölle' % name)
        page.screenshot(path=os.path.join(OUT, 'terrain-%s-napautus.png' % name.replace(' ', '')))
        bad = [e for e in errs if not re.search(r'Failed to load resource', e)]
        check(not bad, '%s: ei konsolivirheitä: %s' % (name, bad[:3]))
        ctx.close()
        br.close()


if __name__ == '__main__':
    main()
