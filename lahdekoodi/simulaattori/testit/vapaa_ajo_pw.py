"""Vaihe 3h: vapaan ajon purku (reitti on valinnainen, sama createRecorder ja analyze). Ajo alkaa Mustalahdesta ilman reittiä, auto=12 antaa 12 kn:n nopeuskäskyn ja alus
lähtee kulussa. Testi antaa muutaman komennon (suunta, nopeus, plotterin EBL ja VRM, kiikari ja tutkan sammutus), ajaa noin kolme minuuttia simulaatioaikaa ja
keskeyttää ajon. Purun on näytettävä ajettu matka ja aika, suurin ja keskinopeus, koko jälki plotterilla alku- ja loppumerkillä, aikaleimattu komentoloki,
pienin etäisyys rantaan ja matalikkoon, sivuutetut turvalaitteet sekä väyläalueen ulkopuolella ajettu matka. Matkan on oltava nopeus x aika 5 %:n sisällä ja
komentolokin rivimäärän sama kuin simulaation lokissa. Kuva shots/3h_purku_vapaa_ajo.png. Käyttö: python3 vapaa_ajo_pw.py"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&auto=12&ff=5&naytot=both&preserve=1')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000); p.wait_for_timeout(1500)
    ok(p.evaluate('__sim.route') is None, 'vapaa ajo: ei reittiä')
    v0 = p.evaluate('__sim.S.v / Liike.KN'); ok(abs(v0 - 12) < 0.6, 'lähtönopeus %.1f kn (auto=12)' % v0)
    def simt(): return p.evaluate('__sim.S.t')
    def odota(t):
        p.wait_for_function('__sim.S.t >= %f' % t, timeout=170000)
    t0 = simt()
    odota(t0 + 20)
    # suuntakäskyt ja nopeuskäskyt, jotka kumoavat toisensa, jotta nopeus pysyy 12 kn:ssä
    p.keyboard.press('ArrowRight'); p.keyboard.press('ArrowRight'); odota(simt() + 15)
    p.keyboard.press('ArrowLeft'); p.keyboard.press('ArrowLeft'); odota(simt() + 15)
    p.keyboard.press('ArrowUp'); p.keyboard.press('ArrowDown'); odota(simt() + 10)
    # plotterin EBL ja VRM napautuksella
    box = p.evaluate('(() => { const r = document.getElementById("plot").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()')
    p.mouse.click(box[0] + box[2] * 0.55, box[1] + box[3] * 0.3); odota(simt() + 10)
    # kiikari päälle ja pois, tutka pois ja päälle
    p.keyboard.press('b'); odota(simt() + 6); p.keyboard.press('b'); odota(simt() + 6)
    p.evaluate('document.getElementById("rOffBtn").click()'); odota(simt() + 6); p.evaluate('document.getElementById("radarOnBtn").click()')
    odota(t0 + 180)
    p.evaluate('document.getElementById("menuBtn").click()'); p.click('#mAbort')
    p.wait_for_function('document.getElementById("debrief").hidden === false', timeout=60000); p.wait_for_timeout(3000)
    an = p.evaluate('''() => { const a = __analysis; const lg = __sim.S.cmdLog.filter(c => c.kind !== 'lever0');
      return { hasRoute: a.hasRoute, time: a.timeSec, dist: a.distM, avg: a.avgKn, max: a.maxKn, minShore: a.minShore, minShoal: a.minShoal, outside: a.outsideM, outPct: a.outsidePct, fwKnown: a.fairwayKnownPct,
        aids: a.aids.length, cmdRows: document.querySelectorAll('#dbCmds tbody tr').length, logN: lg.length, kinds: lg.map(c => c.kind), cmdLog: a.cmdLog.length,
        text: document.getElementById('dbBody').innerText, status: document.getElementById('dbStatus').innerText, dbPlot: !!document.querySelector('#dbPlot canvas'),
        nearRows: document.querySelectorAll('#dbNear tbody tr').length }; }''')
    exp = 12 * 1852 / 3600 * an['time']
    ok(not an['hasRoute'], 'purku ilman reittiä (%s)' % an['status'].replace('\n', ' '))
    ok(abs(an['dist'] / exp - 1) <= 0.05, 'ajettu matka %.0f m, nopeus x aika = 12 kn x %.0f s = %.0f m (ero %.1f %%)' % (an['dist'], an['time'], exp, (an['dist'] / exp - 1) * 100))
    ok(an['time'] >= 170, 'ajon kesto %.0f s' % an['time'])
    ok(11 < an['avg'] < 13 and an['max'] >= an['avg'], 'keskinopeus %.1f kn, suurin nopeus %.1f kn' % (an['avg'], an['max']))
    ok(an['cmdRows'] == an['logN'] == an['cmdLog'], 'komentolokin rivit: taulukossa %d, simulaation lokissa %d, purussa %d (lajit %s)' % (an['cmdRows'], an['logN'], an['cmdLog'], an['kinds']))
    need = ['heading', 'speed', 'evpiste', 'kiikari', 'tutka']
    ok(all(any(k.startswith(n) for k in an['kinds']) for n in need), 'loki sisältää suunta-, nopeus-, EBL/VRM-, kiikari- ja tutkarivit')
    ok(an['minShore'] is not None, 'pienin etäisyys rantaan %s m' % (round(an['minShore']['m']) if an['minShore'] else None))
    ok(an['nearRows'] == 2, 'ranta ja matalikko omina riveinään (matalikko %s m)' % (round(an['minShoal']['m']) if an['minShoal'] else 'yli 290'))
    ok(an['outPct'] is not None and an['outside'] >= 0, 'väyläalueen ulkopuolella %.0f m (%.0f %% matkasta), tieto %.0f %%:lla näytteistä' % (an['outside'] or 0, an['outPct'] or 0, an['fwKnown']))
    ok(an['dbPlot'], 'jälki plotterilla')
    for kw in ['Kokonaisaika', 'Ajettu matka', 'Keskinopeus', 'Suurin nopeus', 'Komentoloki', 'Lähin rantaviiva', 'Väyläalueen ulkopuolella', 'Sivuutetut turvalaitteet']:
        ok(kw in an['text'], 'purussa on "%s"' % kw)
    ok('Aikabudjetti' not in an['text'] and 'Suurin poikkeama' not in an['text'], 'reittiin sidotut osat puuttuvat')
    p.screenshot(path=os.path.join(out, '3h_purku_vapaa_ajo.png'), full_page=False)
    ok(not errs, 'konsolivirheitä ei tullut %s' % (errs[:3],))
    json.dump({k: an[k] for k in ('time', 'dist', 'avg', 'max', 'minShore', 'minShoal', 'outside', 'outPct', 'aids', 'cmdRows', 'kinds')}, open('/tmp/claude-0/vapaa_ajo_tulos.json', 'w'), ensure_ascii=False, indent=1)
    b.close()
bad = sum(1 for c_, _ in checks if not c_)
print('tarkistuksia %d, virheitä %d' % (len(checks), bad))
sys.exit(1 if bad else 0)
