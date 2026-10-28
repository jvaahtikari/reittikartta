"""Vaihe 3k, kriteerit 2 ja 3: törmäys Naistenlahden sataman laituriin koko sovelluksessa (simulaattori.html, deck-asettelu 1440 x 900).
Laituri E 328 289,4, vapaa pää N 6 823 811,5 (laituri jatkuu pohjoiseen). Alus ajaa etelästä pohjoiseen laiturin keskilinjaa pitkin.
 1. 0,8 kn: kosketus, alus pysähtyy, ajo jatkuu, lokiin rivi.
 2. 6 kn: törmäys, banneri, ajo pysähtyy, runko ei ole esteessä (tunkeuma alle 1 m), lokiin rivi nopeuden kanssa. Kuva 3k_tormays_laituri.png.
 3. Jatka-nappi jatkaa ajoa. Uusi törmäys 6 kn, Purku-nappi: purussa kosketus ja törmäykset aikoineen ja nopeuksineen. Kuva 3k_purku_tormays.png.
 4. Törmäystarkistuksen kesto askeleelta (__sim.collMs).
Käyttö: SIM=... PAKETTI=... python3 tormays_pw.py"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
PIER_E, PIER_END_N = 328289.4, 6823811.5
res = {}; fails = []
def ok(c, m):
    print(('OK    ' if c else 'VIRHE ') + m, flush=True)
    if not c: fails.append(m)

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&naytot=both&t=2026-10-26T10:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true')
    t_run = time.time()

    def place(e, n, hdg, kn, direct):
        """Pysäytettynä: alus paikalleen (tosisuunta hdg, nopeus kn). direct: ruorimies pois ja vipu pitää nopeuden (matalat nopeudet)."""
        p.evaluate('''([e, n, h, kn, direct]) => { const G = __sim, S = G.S, o = Paikka.getOrigin(); S.x = e - o.e; S.y = n - o.n;
            const ll = Paikka.worldToLonLat(S.x, S.y); S.conv = Paikka.convergenceDeg(ll.lon, ll.lat); S.hdg = ((h - S.conv) % 360 + 360) % 360;
            S.pending = []; S.sternTurn = null; S.hmStern = null; S.orderHdg = h; S.hmHdg = h; S.rate = 0; S.rudder = 0; S.rudderCmd = 0; S.v = kn * Liike.KN;
            if (direct) { S.helmsman = false; S.leverCmd = Liike.leverForSpeed(kn * Liike.KN); S.lever = S.leverCmd; S.orderSpeedKn = 1; }
            else { S.helmsman = true; Harjoitus.settleSpeed(S, kn); S.orderSpeedKn = kn; }
            G.frozen = false; G.collision = null; }''', [e, n, hdg, kn, direct])
        p.evaluate('Tormays.preload(__sim.S.x, __sim.S.y, 300)')
        p.evaluate('Merkit.load(__sim.S.x, __sim.S.y, 2500)')
        p.evaluate('__view.piers.sync(__sim.S.x, __sim.S.y, true)')     # laiturien 3D-verkko uudelleen uuteen paikkaan (siirto yli 1 km)
        p.wait_for_timeout(1500)
        for _ in range(100):
            if p.evaluate('Tormays.idle() && __view.terrain.idle() && __view.bridges.idle() && __view.piers.idle() && __view.piers.info().stats && __view.piers.info().stats.total > 0'): break
            p.wait_for_timeout(1000)
        p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')

    def run_until(cond, secs):
        t0 = time.time()
        while time.time() - t0 < secs:
            if p.evaluate(cond): return True
            p.wait_for_timeout(250)
        return False

    def state():
        return p.evaluate('''() => { const G = __sim, S = G.S, o = Paikka.getOrigin(); return { frozen: G.frozen, mode: G.mode, coll: G.collision, ground: G.ground, v: S.v / Liike.KN, e: S.x + o.e, n: S.y + o.n,
            hdg: S.hdg, banner: !document.getElementById('groundBanner').hidden, title: document.getElementById('groundTitle').textContent, text: document.getElementById('groundText').textContent,
            go: !document.getElementById('groundGo').hidden, t: S.t, log: S.cmdLog.slice(-4).map(c => c.kind + ':' + JSON.stringify(c.value)), rec: G.rec.collisions.length, orderSpeed: S.orderSpeedKn,
            hit: Tormays.check({ x: S.x, y: S.y, hdg: S.hdg, v: 0 }) }; }''')

    def gap_ahead():
        """Suunnassa eteenpäin: pienin siirtymä (m), jolla runko osuu esteeseen (0 = jo kiinni, 99 = ei osu 3 m:ssä)."""
        return p.evaluate('''() => { const S = __sim.S, a = S.hdg * Math.PI / 180; for (let d = 0; d <= 3; d += 0.01) { if (Tormays.check({ x: S.x + Math.sin(a) * d, y: S.y + Math.cos(a) * d, hdg: S.hdg, v: 0 })) return d; } return 99; }''')

    p.evaluate('document.getElementById("pauseBtn").click()')    # tauko, kunnes paikka ja ruudut ovat valmiina
    # ---- 1. kosketus 0,8 kn ----
    place(PIER_E, PIER_END_N - 20, 0, 0.8, True)
    # siirto Mustalahdesta ei kuulu purkuun: tallenne ja komentoloki aloitetaan alusta uudessa paikassa
    p.evaluate('''() => { const G = __sim, S = G.S; G.rec = Harjoitus.createRecorder(G.route, G.origin); G.rec.t0 = S.t; S.cmdLog.length = 0; G.rec.sample(S, null, null); }''')
    ts = p.evaluate('__sim.collMs.n')
    p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 3')
    got = run_until('__sim.rec.collisions.length > 0 || __sim.ground', 90)
    st = state(); print('kosketus:', json.dumps({k: st[k] for k in ('frozen', 'v', 'n', 'banner', 'rec', 'log', 'orderSpeed', 'ground')}))
    ok(got and st['ground'] is None, 'kosketus: ajoa ei pysäyttänyt pohjakosketus (' + str(st['ground']) + ')')
    ok(got and st['rec'] == 1 and st['log'] and st['log'][-1].startswith('kosketus'), 'kosketus kirjattu lokiin: %s' % st['log'][-1:])
    ok(not st['frozen'] and st['mode'] == 'run' and not st['banner'], 'kosketus: ajo jatkuu, ei bannerin pysäytystä')
    ok(abs(st['v']) < 0.01, 'kosketus: nopeus pysähtyi (%.3f kn)' % st['v'])
    ok(st['hit'] is None, 'kosketus: runko ei ole esteessä')
    if got:
        c0 = p.evaluate('__sim.rec.collisions[0]'); print('  kosketus:', c0['kn'], 'kn, laji', c0['kind'], c0['type'])
        ok(c0['type'] == 'kosketus' and 0.5 < c0['kn'] < 1.0 and c0['kind'] == 'laituri', 'kosketus: laji %s, nopeus %.2f kn (alle 1,0)' % (c0['kind'], c0['kn']))
        res['kosketus'] = c0
    g = gap_ahead(); ok(g < 0.5, 'kosketus: keula %.2f m laiturin päästä' % g)
    # ajo jatkuu: nopeuskäsky toimii kosketuksen jälkeen
    p.evaluate('__sim.S.helmsman = true')
    p.evaluate('Liike.orderReverse(__sim.S, 2)')
    run_until('__sim.S.v < -0.5', 40)
    st = state(); ok(st['v'] < -0.5, 'kosketuksen jälkeen peruutus irti toimii (%.2f kn), jatkuva ajo' % st['v'])
    ok(st['hit'] is None and not st['frozen'], 'irtoaminen: ei uutta osumaa')
    p.evaluate('Liike.orderSpeed(__sim.S, 0)')
    p.wait_for_timeout(500)

    # ---- 2. törmäys 6 kn ----
    p.evaluate('document.getElementById("pauseBtn").click()')
    place(PIER_E, PIER_END_N - 80, 0, 6, False)
    p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 3')
    got = run_until('__sim.frozen', 120)
    p.wait_for_timeout(1500)
    st = state(); print('törmäys:', json.dumps({k: st[k] for k in ('frozen', 'v', 'n', 'banner', 'title', 'text', 'go', 'rec', 'log', 'ground')}))
    ok(got and st['coll'] is not None and st['ground'] is None, 'törmäys: ajo pysähtyi törmäykseen (ei pohjakosketukseen)')
    ok(st['banner'] and st['title'] == 'Törmäys' and '6,0 kn' in st['text'] or (st['banner'] and st['coll'] and abs(st['coll']['kn'] - 6) < 0.8), 'törmäys: banneri "%s": %s' % (st['title'], st['text']))
    ok(st['go'], 'törmäys: Jatka-nappi näkyy')
    c1 = st['coll']
    if c1:
        ok(c1['type'] == 'tormays' and c1['kind'] == 'laituri' and c1['kn'] >= 5.5, 'törmäys: laji %s %s, nopeus %.2f kn' % (c1['type'], c1['kind'], c1['kn']))
        res['tormays'] = c1
    ok(st['hit'] is None, 'törmäys: runko ei ole esteessä pysähdyksen jälkeen (tunkeuma 0 m, raja 1 m)')
    g = gap_ahead(); ok(g < 1.0, 'törmäys: keula %.2f m laiturin päästä (raja: runko enintään 1 m läpi)' % g)
    res['tormays_keula_etaisyys_m'] = g
    ok(st['log'] and st['log'][-1].startswith('tormays'), 'törmäys kirjattu lokiin: %s' % st['log'][-1:])
    # kuva 1: banneri ja 3D-näkymä
    p.evaluate('__view.setGaze(0)')
    p.wait_for_timeout(2500)
    p.screenshot(path=os.path.join(out, '3k_tormays_laituri.png'), timeout=150000)

    # ---- 3. Jatka ja uusi törmäys, Purku ----
    p.click('#groundGo'); p.wait_for_timeout(500)
    st = state(); ok(not st['frozen'] and not st['banner'] and st['mode'] == 'run', 'Jatka: ajo jatkuu, banneri pois')
    p.evaluate('''() => { const S = __sim.S; S.helmsman = true; Harjoitus.settleSpeed(S, 6); S.orderSpeedKn = 6; S.speedFactor = 3; }''')
    got = run_until('__sim.frozen', 60)
    st = state(); ok(got and st['coll'] is not None and st['hit'] is None, 'toinen törmäys Jatkan jälkeen pysäytti ajon (%s)' % (st['coll'] and '%.1f kn' % st['coll']['kn']))
    p.wait_for_timeout(800)
    p.click('#groundBtn')
    p.wait_for_selector('#debrief:not([hidden])', timeout=30000); p.wait_for_timeout(2500)
    stat = p.inner_text('#dbStatus'); print('purku:', stat)
    ok('Törmäys' in stat, 'purun tila: Törmäys')
    rows = p.evaluate('Array.from(document.querySelectorAll("#dbCollisions tbody tr")).map(r => Array.from(r.children).map(c => c.innerText.trim()).join(" | "))')
    print('törmäystaulukko:', rows)
    ok(len(rows) == 3 and 'Kosketus' in rows[0] and 'Törmäys' in rows[1] and rows[0].endswith('kn'), 'purku listaa kosketuksen ja kaksi törmäystä aikoineen ja nopeuksineen')
    ok(p.inner_text('#dbCrashCount').startswith('2') and p.inner_text('#dbTouchCount').startswith('1'), 'purun yhteenveto: törmäykset 2 kpl, kosketukset 1 kpl')
    cmds = p.evaluate('Array.from(document.querySelectorAll("#dbCmds tbody tr")).map(r => r.children[1].innerText)')
    ok(any(x.startswith('Kosketus laituriin') for x in cmds) and any(x.startswith('Törmäys laituriin') for x in cmds), 'komentolokissa kosketus ja törmäys nopeuksineen: %s' % [x for x in cmds if 'laituri' in x])
    p.evaluate('document.getElementById("dbCollisions").scrollIntoView({block: "center"})'); p.wait_for_timeout(800)
    p.screenshot(path=os.path.join(out, '3k_purku_tormays.png'))
    # 4. suorituskyky
    cm = p.evaluate('__sim.collMs')
    print('törmäystarkistus sovelluksessa: %d askelta, keskiarvo %.4f ms, suurin %.3f ms' % (cm['n'], cm['sum'] / max(1, cm['n']), cm['max']))
    res['suorituskyky_ms'] = {'n': cm['n'], 'keskiarvo': cm['sum'] / max(1, cm['n']), 'suurin': cm['max']}
    ok(cm['n'] > 50 and cm['sum'] / cm['n'] < 1.0, 'törmäystarkistus sovelluksessa keskimäärin alle 1 ms askeleelta')
    print('virheet', errs[:6]); ok(not [e for e in errs if 'favicon' not in e[1]], 'ei konsolivirheitä')
    json.dump(res, open(os.path.join(os.path.dirname(__file__), 'tulos_3k_tormays.json'), 'w'), indent=1)
    b.close()
print('VIRHEITÄ %d' % len(fails) if fails else 'Kaikki läpi', flush=True)
sys.exit(1 if fails else 0)
