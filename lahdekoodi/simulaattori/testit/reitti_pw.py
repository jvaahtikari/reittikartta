"""Vaihe 3h, kriteeri 3: reitti Reittikartasta. Playwright tallentaa localStorage-avaimeen reittikartta.v1 kaksi reittiä (Mustalahti – Siilinkari neljällä pisteellä ja
Naistenlahti – Aitolahti), aloitusnäyttö listaa ne, valinta käynnistää ajon ensimmäisestä pisteestä legin suuntaan (tosisuunta 1° sisällä), reitti piirtyy plotterille,
auto=12 ajaa reitin loppuun ja purku näyttää reitin käännökset. Ilman tallennettuja reittejä aloitusnäytössä on ohje ja linkki Reittikarttaan.
Käyttö: python3 reitti_pw.py [vaihe]   vaihe = lista | ajo1 | ajo2 | kaanteinen (oletus: kaikki ajetaan peräkkäin, pitkä ajo kannattaa ajaa taustalla)
Kuvat shots/3h_aloitus_reittilista.png, 3h_plotteri_reitti.png, 3h_purku_reitti.png sekä 3h_aloitus_ei_reitteja.png."""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
vaihe = sys.argv[1] if len(sys.argv) > 1 else 'kaikki'
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

# reittipisteet ETRS-TM35FIN-metreinä (Harjoitus 1:n väylän pisteitä, joten legit ovat vesialueella)
R1 = [(327184, 6823553), (327771, 6823999), (328045, 6824881), (329293, 6825131)]
R2 = [(327771, 6823999), (328045, 6824881), (332200, 6825714), (333273, 6825987), (333726, 6825700), (334352, 6826392), (334417, 6826553), (334459, 6826731), (334475, 6826862), (334499, 6826941), (334551, 6826982), (334658, 6827038), (334769, 6827049)]

STORE_JS = '''([r1, r2]) => {
  const ll = (a) => a.map(p => { const q = Paikka.enToLonLat(p[0], p[1]); return { lat: q.lat, lng: q.lon }; });
  const base = { notes: [], passes: [], turns: [], approver: '', approvedAt: '', vessels: [], created: '2026-10-26T10:00:00Z', modified: '2026-10-26T10:00:00Z', desc: '' };
  const st = { version: 1, routes: [
    Object.assign({ id: 'rt-test-1', name: '', from: 'Mustalahti', via: '', to: 'Siilinkari', status: 'draft', points: ll(r1), speed: 12 }, base),
    Object.assign({ id: 'rt-test-2', name: 'Naistenlahti – Aitolahti', from: 'Naistenlahti', via: '', to: 'Aitolahti', status: 'approved', points: ll(r2), speed: 15 }, base) ],
    marks: [], tasks: [], settings: { show: { legBrg: true, turnTicks: true } } };
  localStorage.setItem('reittikartta.v1', JSON.stringify(st)); return st.routes.map(r => r.points.length); }'''

def hdg_err(p, idx):
    """Aluksen tosisuunta ja ensimmäisen legin loksodromin suunta (Geo.rhumb) tallennetuista reittipisteistä."""
    return p.evaluate('''(idx) => { const st = JSON.parse(localStorage.getItem('reittikartta.v1')); const r = st.routes[idx], rev = __sim.route.reverse;
      const pts = rev ? r.points.slice().reverse() : r.points; const rh = Geo.rhumb(pts[0], pts[1]);
      const tr = (__sim.S.hdg + __sim.S.conv + 360) % 360; let d = ((tr - rh.brg + 540) % 360) - 180;
      const w = Paikka.lonlatToWorld(pts[0].lng, pts[0].lat);
      const pr = Harjoitus.project(__sim.route, __sim.S.x + __sim.origin.e, __sim.S.y + __sim.origin.n, null);
      return { true: tr, rhumb: rh.brg, diff: d, dx: __sim.S.x - w.x, dy: __sim.S.y - w.y, cum: pr.cum, xte: pr.dist, leg: pr.leg }; }''', idx)

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    url = SIM + 'simulaattori.html?aineisto=' + PAKETTI
    # --- 1. ilman tallennettuja reittejä ---
    if vaihe in ('kaikki', 'lista'):
        p.goto(url); p.wait_for_selector('#segEx')
        hint = p.inner_text('#routeHint'); href = p.get_attribute('#rkLink', 'href')
        ok('Suunnittele reitti Reittikartassa' in hint and href == 'index.html', 'ilman reittejä: ohje "%s" ja linkki %s' % (hint, href))
        ok(p.locator('#segEx button[data-rk]').count() == 0, 'ilman reittejä: lista sisältää vain sisäänrakennetut (%d painiketta)' % p.locator('#segEx button').count())
        p.screenshot(path=os.path.join(out, '3h_aloitus_ei_reitteja.png'))
        # --- 2. kaksi tallennettua reittiä ---
        npts = p.evaluate(STORE_JS, [R1, R2]); ok(npts == [4, 13], 'tallennettu kaksi reittiä (pisteitä %s)' % npts)
        p.goto(url); p.wait_for_selector('#segEx button[data-rk]')
        names = p.eval_on_selector_all('#segEx button[data-rk]', 'els => els.map(e => e.innerText.replace(/\\n/g, " | "))')
        ok(len(names) == 2 and 'Mustalahti – Siilinkari' in names[0] and 'Naistenlahti – Aitolahti' in names[1], 'aloitusnäyttö listaa reitit: %s' % names)
        ok('luonnos' in names[0] and 'hyväksytty' in names[1] and 'mpk' in names[0] and '4 pistettä' in names[0] and '13 pistettä' in names[1], 'lista näyttää tilan, pituuden ja pisteiden määrän')
        allb = p.eval_on_selector_all('#segEx button', 'els => els.map(e => e.getAttribute("data-v"))')
        ok(allb == ['h1', 'rk:rt-test-1', 'rk:rt-test-2', 'free'], 'lista sisältää Harjoitus 1:n, reitit ja vapaan ajon: %s' % allb)
        ok(not p.is_visible('#routeHint a') or 'Avaa Reittikartta' in p.inner_text('#routeHint'), 'tallennettujen reittien kanssa ohje on vaihtunut linkiksi Reittikarttaan')
        p.click('#segEx button[data-v="rk:rt-test-1"]'); p.wait_for_timeout(300)
        info = p.inner_text('#exInfo'); ok('Lähtönopeus 12 kn (reitin nopeus)' in info and p.is_visible('#fldDir') and not p.is_visible('#fldSpeed'), 'valitun reitin tiedot: %s' % info)
        p.screenshot(path=os.path.join(out, '3h_aloitus_reittilista.png'), full_page=False)
        p.evaluate('window.scrollTo(0,0)')
    else:
        p.goto(url); p.evaluate(STORE_JS, [R1, R2])

    def ajo(idx, extra='', rev=False, nimi=''):
        sel = 'rk:rt-test-%d' % (idx + 1)
        p.goto(url + extra); p.wait_for_selector('#segEx button[data-rk]')
        p.click('#segEx button[data-v="%s"]' % sel)
        if rev: p.click('#segDir button[data-v="rev"]')
        p.click('#startBtn')
        p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000); p.wait_for_timeout(1200)

    if vaihe in ('kaikki', 'ajo1'):
        # --- 3. reitti 1: Mustalahti – Siilinkari, auto=12 ajaa loppuun ---
        ajo(0, '&auto=12&ff=30&preserve=1')
        e = hdg_err(p, 0)
        ok(abs(e['diff']) <= 1.0 and e['xte'] < 3 and e['cum'] < 600 and e['leg'] == 0, 'reitti 1: alus ensimmäisen legin alussa (matka %.0f m, sivupoikkeama %.1f m) ja tosisuunta %.2f° (legin suunta %.2f°, ero %.2f°)' % (e['cum'], e['xte'], e['true'], e['rhumb'], e['diff']))
        v0 = p.evaluate('__sim.S.v / Liike.KN'); ok(abs(v0 - 12) < 0.6, 'lähtönopeus %.1f kn (auto=12)' % v0)
        rt = p.evaluate('({ n: __sim.route.pts.length, turns: __sim.route.turns.length, total: __sim.route.total, nimi: __sim.route.nimi, builtin: __sim.route.builtin })')
        ok(rt['n'] == 4 and rt['turns'] == 2 and not rt['builtin'], 'reitti ladattu: %s' % rt)
        p.evaluate('document.getElementById("pauseBtn").click()'); p.wait_for_timeout(400)
        p.evaluate('__pl.setRangeNm(3.0); __pl.recenter()'); p.wait_for_timeout(2500)
        # reittiviivan väri (luonnos #9a5b2a) näkyy plotterin kuvassa
        px = p.evaluate('''() => { const cv = document.querySelector('#plot canvas'); const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0, w = 0;
            for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - 0x9a) < 18 && Math.abs(d[i + 1] - 0x5b) < 18 && Math.abs(d[i + 2] - 0x2a) < 18) n++; if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) w++; } return { route: n, white: w }; }''')
        ok(px['route'] > 300, 'reittiviiva näkyy plotterilla (%d reitin väristä pikseliä)' % px['route'])
        p.screenshot(path=os.path.join(out, '3h_plotteri_reitti.png'))
        p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 30')   # jatkuu 30-kertaisella nopeudella (aikakerroin 30 ei ole painikkeen askel)
        p.wait_for_function('document.getElementById("debrief").hidden === false', timeout=400000); p.wait_for_timeout(2500)
        an = p.evaluate('({ finished: __analysis.finished, turns: __analysis.turns.length, startOff: __analysis.turns.map(t => t.startOffsetM), maxDev: __analysis.maxDev.m, fw: __analysis.fairwayPct, time: __analysis.timeSec, dist: __analysis.distM, total: __analysis.routeTotalM, rows: document.querySelectorAll("#dbTurns tbody tr").length })')
        ok(an['finished'], 'reitti 1: auto=12 ajoi reitin loppuun (aika %.0f s, matka %.0f m, reitti %.0f m)' % (an['time'], an['dist'], an['total']))
        ok(an['turns'] == 2 and an['rows'] == 2 and all(o is not None for o in an['startOff']), 'purku näyttää reitin käännökset: %d käännöstä, taulukossa %d riviä, alkukohdat %s' % (an['turns'], an['rows'], [round(o) for o in an['startOff'] if o is not None]))
        ok(an['maxDev'] < 60, 'suurin poikkeama reitistä %.0f m' % an['maxDev'])
        p.screenshot(path=os.path.join(out, '3h_purku_reitti.png'))

    if vaihe in ('kaikki', 'ajo2'):
        # --- 4. reitti 2: Naistenlahti – Aitolahti, auto=12, ajetaan niin pitkälle kuin 150 s ehtii, sitten keskeytys ---
        ajo(1, '&auto=12&ff=10')
        e = hdg_err(p, 1)
        ok(abs(e['diff']) <= 1.0 and e['xte'] < 3 and e['cum'] < 600 and e['leg'] == 0, 'reitti 2: alus ensimmäisen legin alussa (matka %.0f m, sivupoikkeama %.1f m) ja tosisuunta %.2f° (legin suunta %.2f°, ero %.2f°)' % (e['cum'], e['xte'], e['true'], e['rhumb'], e['diff']))
        p.wait_for_timeout(15000)
        prog = p.evaluate('(() => { const r = __sim.route; const pr = Harjoitus.project(r, __sim.S.x + __sim.origin.e, __sim.S.y + __sim.origin.n, null); return { cum: pr.cum, dist: pr.dist, total: r.total, v: __sim.S.v / Liike.KN }; })()')
        ok(prog['cum'] > 300 and prog['dist'] < 40, 'reitti 2: auto=12 seuraa reittiä (matka reitillä %.0f / %.0f m, sivupoikkeama %.0f m, nopeus %.1f kn)' % (prog['cum'], prog['total'], prog['dist'], prog['v']))
        p.evaluate('document.getElementById("menuBtn").click()'); p.click('#mAbort'); p.wait_for_function('document.getElementById("debrief").hidden === false', timeout=30000)
        ok(p.evaluate('__analysis.turns.length') == p.evaluate('__sim.route.turns.length') and p.evaluate('__analysis.turns.length') > 0, 'reitti 2: keskeytetyn ajon purku näyttää reitin käännökset (%d)' % p.evaluate('__analysis.turns.length'))

    if vaihe in ('kaikki', 'kaanteinen'):
        # --- 5. käänteinen lähtö: reitti 2 viimeisestä pisteestä ---
        ajo(1, '&auto=12&ff=1', rev=True)
        e = hdg_err(p, 1)
        w = p.evaluate('({ first: __sim.route.pts[0], rev: __sim.route.reverse, name: document.getElementById("exName").textContent })')
        ok(w['rev'] and abs(e['diff']) <= 1.0 and e['xte'] < 3 and e['cum'] < 600 and e['leg'] == 0, 'käänteinen lähtö: alus viimeisessä pisteessä, tosisuunta %.2f° (legin suunta %.2f°, ero %.2f°), otsikko "%s"' % (e['true'], e['rhumb'], e['diff'], w['name']))

    ok(not errs, 'konsolivirheitä ei tullut %s' % (errs[:3],))
    b.close()
bad = sum(1 for c_, _ in checks if not c_)
print('tarkistuksia %d, virheitä %d' % (len(checks), bad))
sys.exit(1 if bad else 0)
