"""Valosektorit, nopeusrajoitusalueet, reittilegien suunnat, käännösmerkit, maapohjan valinta ja MML-kerros."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot, osm_log
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file:///home/claude/reittikartta/index.html')
fails = []


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("ChartAPI.setBase('vector'); Store.state.settings.base = 'vector'; App.map.setView([61.625, 23.765], 14)")
    page.wait_for_timeout(2500)

    cols = page.evaluate("""(() => { const c = new Set(); App.map.eachLayer(l => { if (l instanceof L.Polyline && l.options.weight === 5) c.add(l.options.color); }); return [...c]; })()""")
    check('#13a04a' in cols and '#e2211c' in cols and '#f2c311' in cols, 'valosektorit piirtyvät väreittäin (valkoinen keltaisena): %s' % cols)
    # valon pisara jokaisella valolla: loisto (3 väriä), valaistu itäviitta (valkoinen), apuloisto (punainen) ja sektoriapuloisto (vihreä)
    fl = page.evaluate("[...document.querySelectorAll('.flare-ico path')].map(p => p.getAttribute('fill'))")
    print('pisarat', fl)
    check(len(fl) >= 6 and fl.count('#e2211c') >= 2 and fl.count('#13a04a') >= 2 and fl.count('#f2c311') >= 2, 'valon pisarat myös ympäri näkyville loistoille ja apuloistoille')
    arcs = page.evaluate("""(() => { let n = 0; App.map.eachLayer(l => { if (l instanceof L.Polyline && l.options.weight === 5 && l.options.color === '#13a04a') n++; }); return n; })()""")
    check(arcs >= 2, 'apuloiston sektori turvalaitteen valosektoritiedoista (%d vihreää kaarta)' % arcs)
    rings = page.evaluate("""(() => { const c = []; App.map.eachLayer(l => { if (l instanceof L.Polyline && l.options.className === 'light-ring') c.push(l.options.color); }); return c; })()""")
    check('#e2211c' in rings and rings.count('#f2c311') >= 2, 'ympäri näkyvillä valoilla värikehä (punainen apuloisto, valkoiset keltaisena): %s' % rings)
    tops = page.evaluate("[...document.querySelectorAll('.aid-ico svg')].map(s => s.innerHTML.includes('class=\"pos\"'))")
    check(len(tops) >= 8 and sum(tops) >= 8, 'viitat asemaympyrällä (Suomen merikartan merkki)')
    check(page.evaluate("[...document.querySelectorAll('.lt-lab')].some(e => e.textContent.includes('VQ (3) 5 s'))"), 'loiston valotunnus näkyy')
    check(page.evaluate("[...document.querySelectorAll('.spd-lab')].some(e => e.textContent.includes('10 km/h'))"), 'nopeusrajoitusalue näkyy')

    # reitti väylän ulkopuolella: legisuunnat ja käännösmerkit
    page.evaluate("""(() => { const r = Store.newRoute([{lat:61.612,lng:23.740},{lat:61.628,lng:23.776},{lat:61.640,lng:23.770}]);
        r.name = 'Testireitti'; Store.emit('routes'); })()""")
    page.wait_for_timeout(600)
    legs = page.evaluate("[...document.querySelectorAll('.legnote')].map(e => e.textContent)")
    print('legit', legs)
    check(len(legs) >= 2 and all('°' in t and 'mpk' in t for t in legs), 'legien suuntanuotit näkyvät')
    fs = page.evaluate("parseFloat(getComputedStyle(document.querySelector('.legnote b')).fontSize)")
    check(fs >= 16, 'kulkusuunta isolla (%.0f px)' % fs)
    ticks = page.evaluate("[...document.querySelectorAll('.tick-lab')].map(e => e.textContent)")
    check(ticks.count('2') == 1 and ticks.count('1') == 1, 'käännösmerkit 2 ja 1 ennen käännöstä: %s' % ticks)
    d = page.evaluate("""(() => { const r = Store.state.routes[0], wp = r.points[1]; let best = []; App.map.eachLayer(l => {
        if (l instanceof L.Polyline && !(l instanceof L.Polygon) && l.getLatLngs().length === 2 && l.options.weight >= 2 && l.options.weight <= 3 && l.options.color === '#9a5b2a') {
          const ll = l.getLatLngs(); const m = L.latLng((ll[0].lat + ll[1].lat) / 2, (ll[0].lng + ll[1].lng) / 2); best.push(Math.round(m.distanceTo(L.latLng(wp)))); } });
        return best.sort((a, b) => a - b); })()""")
    print('merkkien etäisyys käännöksestä (m)', d)
    check(len(d) >= 2 and abs(d[0] - 185) < 6 and abs(d[1] - 370) < 8, 'merkit 1 kbl (185 m) ja 2 kbl (370 m) ennen käännöspistettä')
    shot(page, 'x1-legit-sektorit')

    # väylällä oleva legi ei saa omaa suuntamerkintää (väylän merkintä riittää)
    page.evaluate("""(() => { const r = Store.state.routes[0]; r.points[0].snap = {kind:'vertex', jnro:'9215'}; r.points[1].snap = {kind:'line', jnro:'9215'}; Store.emit('routes'); })()""")
    page.wait_for_timeout(400)
    check(page.evaluate("[...document.querySelectorAll('.legnote b')].some(e => e.textContent.startsWith('047'))"), 'väylällä kulkevakin legi saa suuntanuotin')
    arr = page.evaluate("""[...document.querySelectorAll('.legnote')].map(n => [parseInt(n.querySelector('b').textContent), parseInt((n.querySelector('.ln-arr').style.transform.match(/-?\\d+/) || [])[0])])""")
    check(arr and all(abs(((a - b + 540) % 360) - 180) <= 1 for a, b in arr), 'nuoli osoittaa kulkusuuntaan %s' % arr)
    # legin keskikohta ruudun ulkopuolella: nuotti siirtyy legin näkyvälle osalle
    page.evaluate("App.map.setView([61.614, 23.744], 16)"); page.wait_for_timeout(700)
    vis = page.evaluate("""(() => { const r = App.map.getContainer().getBoundingClientRect();
        return [...document.querySelectorAll('.legnote')].filter(e => { const b = e.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom; }).map(e => e.querySelector('b').textContent); })()""")
    check('047°' in vis, 'nuotti näkyy, vaikka legin keskikohta on ruudun ulkopuolella: %s' % vis)

    # maapohja OpenStreetMap
    page.click('.mi[data-menu="view"]')
    page.locator('#ctxmenu button', has_text='Maapohja: OpenStreetMap').first.click()
    page.wait_for_timeout(1200)
    check(page.evaluate("App.map.hasLayer(ChartAPI.base.osm) && !App.map.hasLayer(ChartAPI.base.mml)"), 'OpenStreetMap maapohjana')
    osm = page.evaluate("""(() => { const imgs = [...ChartAPI.base.osm.getContainer().querySelectorAll('img.leaflet-tile-loaded')];
        if (!imgs.length) return null; const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d');
        g.drawImage(imgs[0], 128, 128, 1, 1, 0, 0, 1, 1); return { n: imgs.length, px: Array.from(g.getImageData(0, 0, 1, 1).data) }; })()""")
    print('osm', osm, 'pyyntöjä', len(osm_log))
    check(osm is not None and osm['n'] > 0, 'OSM-tiilet latautuvat')
    check(osm is not None and osm['px'][0] < 250, 'OSM-tiili on oikea tiili eikä esto-tiili')
    check(len(osm_log) > 0 and all(osm_log), 'jokaisessa OSM-pyynnössä on sovelluksen tunniste')

    # MML: väärä ja oikea avain
    page.evaluate("Store.state.settings.mmlKey = 'VAARA'; ChartAPI.setMmlKey('VAARA'); App.map.setView([61.6255, 23.765], 14)")
    page.wait_for_timeout(1500)
    check('API-avain ei kelpaa' in (page.evaluate("ChartAPI.mmlInfo.err") or ''), 'väärästä avaimesta ilmoitus')
    page.evaluate("Store.state.settings.mmlKey = 'TESTI'; ChartAPI.setMmlKey('TESTI'); App.map.setView([61.6250, 23.765], 14)")
    page.wait_for_timeout(2500)
    info = page.evaluate("ChartAPI.mmlInfo")
    print('mml', info)
    check(info['cols'] and info['cols']['rock'] == 'vesikivi' and info['cols']['shoal'] == 'matalikko', 'kokoelmat tunnistettu palvelusta')
    check(page.evaluate("document.querySelectorAll('.rk-ico').length") >= 3, 'kivet piirtyvät')
    ds = page.evaluate("[...document.querySelectorAll('.rk-ico path')].map(p => p.getAttribute('d'))")
    check(any(d.startswith('M3 5.5H13') for d in ds) and any(d.startswith('M8 3V13') for d in ds) and any(d.startswith('M3 10.5H13') for d in ds),
          'kivet suomalaisin merkein: vedenalainen ⊤, vedenrajassa +, vedenpäällinen ⊥')
    check(page.evaluate("[...document.querySelectorAll('path.leaflet-interactive, svg path')].some(p => p.getAttribute('stroke-dasharray') === '1 3.2')"), 'matalikko rajattu vaarakäyrällä (pisteviiva)')
    check(page.evaluate("document.querySelectorAll('.nm-lab').length") >= 1, 'nimistö näkyy OSM-maapohjalla')
    shot(page, 'x2-mml-osm')

    # aiemman version esimerkkialukset poistuvat, paitsi jos reitti on hyväksytty alukselle
    page.evaluate("""(() => { const s = JSON.parse(localStorage.getItem('reittikartta.v1'));
        s.settings.vessels = ['PV Turva', 'AV Roni', 'PV Repa', 'Oma alus']; s.settings.currentVessel = 'PV Turva';
        delete s.settings.sampleVesselsDropped;
        s.routes = [{ id: 'x1', name: 'Vanha reitti', status: 'approved', vessels: ['AV Roni'], points: [{ lat: 61.6, lng: 23.7 }, { lat: 61.61, lng: 23.72 }], notes: [], passes: [], turns: [] }];
        localStorage.setItem('reittikartta.v1', JSON.stringify(s)); })()""")
    page.reload(); page.wait_for_timeout(2000)
    ves = page.evaluate("[Store.state.settings.vessels, Store.state.settings.currentVessel]")
    check(ves[0] == ['AV Roni', 'Oma alus'] and ves[1] == 'AV Roni', 'esimerkkialukset poistettu, käytössä oleva ja oma säilyvät: %s' % ves)
    page.evaluate("Store.state.settings.vessels = ['PV Turva']; Store.emit('settings')"); page.wait_for_timeout(400)
    page.reload(); page.wait_for_timeout(1500)
    check(page.evaluate("Store.state.settings.vessels") == ['PV Turva'], 'itse lisättyä samannimistä alusta ei poisteta myöhemmin')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
