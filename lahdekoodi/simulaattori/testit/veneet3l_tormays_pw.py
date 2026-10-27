"""Vaihe 3l, kriteeri 3: törmäys kiinnitettyyn veneeseen Naistenlahden satamassa koko sovelluksessa (simulaattori.html, deck-asettelu 1440 x 900).
Kohdeveneeksi valitaan sataman uloimpia veneitä, joihin pääsee suoraan avovedeltä: ajolinjalla ei ole laitureita eikä muita veneitä ennen kohdetta (tarkistus Tormays.check-kutsulla 2 m välein).
 1. 0,8 kn: kosketus veneeseen, alus pysähtyy, ajo jatkuu, lokiin rivi. Vene ei liiku.
 2. 4 kn: törmäys veneeseen, banneri "Törmäys veneeseen 4,0 kn", ajo pysähtyy, runko ei ole esteessä. Kuva 3l_tormays_vene.png.
 3. Jatka-nappi jatkaa ajoa, Purku listaa kosketuksen ja törmäyksen ja komentoloki rivit "Kosketus veneeseen" ja "Törmäys veneeseen".
Käyttö: SIM=... PAKETTI=... python3 veneet3l_tormays_pw.py"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
res = {}; fails = []
def ok(c, m):
    print(('OK    ' if c else 'VIRHE ') + m, flush=True)
    if not c: fails.append(m)

JS_KANDIDAATIT = """([kx, kn, avoin]) => { const b = __sim.boats, o = Paikka.getOrigin(), out = [];
  const vs = b.veneet.filter(v => v.lahde === 'laituri' && Math.hypot(v.e - kx, v.n - kn) < 420);
  vs.forEach(v => { v.__s = (v.e - kx) * Math.sin(avoin * Math.PI / 180) + (v.n - kn) * Math.cos(avoin * Math.PI / 180); });
  vs.sort((a, c) => c.__s - a.__s);
  for (const v of vs.slice(0, 60)) {
    for (let br = 0; br < 360; br += 5) {
      const a = br * Math.PI / 180, sx = Math.sin(a), sy = Math.cos(a), hdg = (br + 180) % 360;
      // alus lähtee veneestä bearing-suuntaan 120 m päähän ja ajaa kohti venettä (suunta hdg)
      let hitD = null, hitKind = null, bad = false;
      for (let d = 140; d >= 0; d -= 2) {
        const e = v.e + sx * d, n = v.n + sy * d;
        if (d > 6 && !window.__onVesi(e, n)) { bad = true; break; }
        const h = Tormays.check({ x: e - o.e, y: n - o.n, hdg: hdg, v: 0 });
        if (h) { hitD = d; hitKind = h.kind; break; }
      }
      if (bad || hitD === null) continue;
      if (hitKind !== 'vene' || hitD < 6 || hitD > 40) continue;
      out.push({ id: v.id, luokka: v.luokka, e: v.e, n: v.n, suunta: v.suunta, pituus: v.pituus, leveys: v.leveys, bearing: br, hdg: hdg, osumaEtaisyys: hitD, s: v.__s });
      break;
    }
    if (out.length >= 6) break;
  }
  return out; }"""

with sync_playwright() as pw:
    b, p, errs = avaa(pw, 'deck', None, naytot='both')
    hn = satama(p, 'naistenlahti'); res['naistenlahti'] = hn
    e0, n0, h0 = satama_asema(hn, 60); siirra(p, e0, n0, h0)
    p.evaluate('Tormays.preload(%f - Paikka.getOrigin().e, %f - Paikka.getOrigin().n, 400)' % (hn['keski']['e'], hn['keski']['n']))
    for _ in range(60):
        if p.evaluate('Tormays.idle()'): break
        p.wait_for_timeout(1000)
    kand = p.evaluate(JS_KANDIDAATIT, [hn['keski']['e'], hn['keski']['n'], hn['avoin']])
    print('kandidaatit', json.dumps(kand[:3]), flush=True)
    ok(len(kand) > 0, 'avovedeltä suoraan ajettavia kiinnitettyjä veneitä löytyi %d kpl' % len(kand))
    if not kand:
        print('virheet', errs[:6]); b.close(); sys.exit(1)
    K = kand[0]; res['kohde'] = K
    # kohteen veneen sijainti ennen kokeita (veneet eivät saa liikkua)
    pos0 = p.evaluate('(id) => { const v = __sim.boats.veneet.find(x => x.id === id); return { e: v.e, n: v.n, suunta: v.suunta }; }', K['id'])

    def place(dist, kn, direct):
        """Alus kohdeveneestä bearing-suuntaan dist metrin päähän, keula kohti venettä, nopeus kn (direct: ruorimies pois, vipu pitää nopeuden)."""
        a = math.radians(K['bearing']); e = K['e'] + math.sin(a) * dist; n = K['n'] + math.cos(a) * dist
        p.evaluate('''([e, n, h, kn, direct]) => { const G = __sim, S = G.S, o = Paikka.getOrigin(); S.x = e - o.e; S.y = n - o.n;
            const ll = Paikka.worldToLonLat(S.x, S.y); S.conv = Paikka.convergenceDeg(ll.lon, ll.lat); S.hdg = h;
            S.pending = []; S.sternTurn = null; S.hmStern = null; S.orderHdg = (h + S.conv + 360) % 360; S.hmHdg = S.orderHdg; S.rate = 0; S.rudder = 0; S.rudderCmd = 0; S.v = kn * Liike.KN;
            if (direct) { S.helmsman = false; S.leverCmd = Liike.leverForSpeed(kn * Liike.KN); S.lever = S.leverCmd; S.orderSpeedKn = 1; }
            else { S.helmsman = true; Harjoitus.settleSpeed(S, kn); S.orderSpeedKn = kn; }
            G.frozen = false; G.collision = null; }''', [e, n, K['hdg'], kn, direct])
        p.evaluate('Tormays.preload(__sim.S.x, __sim.S.y, 300)')
        p.evaluate('__view.piers.sync(__sim.S.x, __sim.S.y, true)')
        p.wait_for_timeout(1500)
        for _ in range(100):
            if p.evaluate('Tormays.idle() && __view.terrain.idle() && __view.bridges.idle() && __view.piers.idle() && __sim.boatInit && !__sim.boatBusy'): break
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
            go: !document.getElementById('groundGo').hidden, t: S.t, log: S.cmdLog.slice(-4).map(c => c.kind + ':' + JSON.stringify(c.value)), rec: G.rec.collisions.length,
            hit: Tormays.check({ x: S.x, y: S.y, hdg: S.hdg, v: 0 }) }; }''')

    def gap_ahead():
        return p.evaluate('''() => { const S = __sim.S, a = S.hdg * Math.PI / 180; for (let d = 0; d <= 3; d += 0.01) { if (Tormays.check({ x: S.x + Math.sin(a) * d, y: S.y + Math.cos(a) * d, hdg: S.hdg, v: 0 })) return d; } return 99; }''')

    # ---- 1. kosketus 0,8 kn ----
    place(K['osumaEtaisyys'] + 30, 0.8, True)
    p.evaluate('''() => { const G = __sim, S = G.S; G.rec = Harjoitus.createRecorder(G.route, G.origin); G.rec.t0 = S.t; S.cmdLog.length = 0; G.rec.sample(S, null, null); }''')
    p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 3')
    got = run_until('__sim.rec.collisions.length > 0 || __sim.ground', 120)
    st = state(); print('kosketus:', json.dumps({k: st[k] for k in ('frozen', 'v', 'n', 'banner', 'rec', 'log', 'ground')}), flush=True)
    ok(got and st['ground'] is None, 'kosketus: ajoa ei pysäyttänyt pohjakosketus (%s)' % st['ground'])
    ok(got and st['rec'] == 1 and st['log'] and st['log'][-1].startswith('kosketus'), 'kosketus kirjattu lokiin: %s' % st['log'][-1:])
    ok(not st['frozen'] and st['mode'] == 'run' and not st['banner'], 'kosketus: ajo jatkuu, ei bannerin pysäytystä')
    ok(abs(st['v']) < 0.01, 'kosketus: nopeus pysähtyi (%.3f kn)' % st['v'])
    ok(st['hit'] is None, 'kosketus: runko ei ole esteessä')
    if got:
        c0 = p.evaluate('__sim.rec.collisions[0]'); print('  kosketus:', c0['kn'], 'kn, laji', c0['kind'], c0['type'], flush=True)
        ok(c0['type'] == 'kosketus' and 0.5 < c0['kn'] < 1.0 and c0['kind'] == 'vene', 'kosketus: laji %s, nopeus %.2f kn (alle 1,0)' % (c0['kind'], c0['kn']))
        res['kosketus'] = c0
    g = gap_ahead(); ok(g < 0.5, 'kosketus: keula %.2f m veneestä' % g)
    # peruutus irti: ajo jatkuu kosketuksen jälkeen
    p.evaluate('__sim.S.helmsman = true'); p.evaluate('Liike.orderReverse(__sim.S, 2)')
    run_until('__sim.S.v < -0.5', 40)
    st = state(); ok(st['v'] < -0.5 and st['hit'] is None and not st['frozen'], 'kosketuksen jälkeen peruutus irti toimii (%.2f kn)' % st['v'])
    p.evaluate('Liike.orderSpeed(__sim.S, 0)'); p.wait_for_timeout(500)

    # ---- 2. törmäys 4 kn ----
    p.evaluate('document.getElementById("pauseBtn").click()')
    place(K['osumaEtaisyys'] + 90, 4, False)
    p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 3')
    got = run_until('__sim.frozen', 150)
    p.wait_for_timeout(1500)
    st = state(); print('törmäys:', json.dumps({k: st[k] for k in ('frozen', 'v', 'n', 'banner', 'title', 'text', 'go', 'rec', 'log', 'ground')}), flush=True)
    ok(got and st['coll'] is not None and st['ground'] is None, 'törmäys: ajo pysähtyi törmäykseen (ei pohjakosketukseen)')
    ok(st['banner'] and 'Törmäys veneeseen 4,0 kn' in (st['title'] + ' ' + st['text']), 'törmäys: banneri "%s": %s' % (st['title'], st['text']))
    ok(st['go'], 'törmäys: Jatka-nappi näkyy')
    c1 = st['coll']
    if c1:
        ok(c1['type'] == 'tormays' and c1['kind'] == 'vene' and c1['kn'] >= 3.5, 'törmäys: laji %s %s, nopeus %.2f kn' % (c1['type'], c1['kind'], c1['kn']))
        res['tormays'] = c1
    ok(st['hit'] is None, 'törmäys: runko ei ole esteessä pysähdyksen jälkeen')
    g = gap_ahead(); ok(g < 1.0, 'törmäys: keula %.2f m veneestä (raja: runko enintään 1 m läpi)' % g)
    res['tormays_keula_etaisyys_m'] = g
    ok(st['log'] and st['log'][-1].startswith('tormays'), 'törmäys kirjattu lokiin: %s' % st['log'][-1:])
    pos1 = p.evaluate('(id) => { const v = __sim.boats.veneet.find(x => x.id === id); return { e: v.e, n: v.n, suunta: v.suunta }; }', K['id'])
    ok(pos0 == pos1, 'kohdevene ei liikkunut törmäyksessä (%s)' % json.dumps(pos1)); res['vene_ennen'] = pos0; res['vene_jalkeen'] = pos1
    # kuva: banneri ja 3D-näkymä
    p.evaluate('__view.setGaze(0)'); p.wait_for_timeout(3000)
    p.screenshot(path=os.path.join(SHOTS, '3l_tormays_vene.png'), timeout=150000)

    # ---- 3. Jatka ja Purku ----
    p.click('#groundGo'); p.wait_for_timeout(500)
    st = state(); ok(not st['frozen'] and not st['banner'] and st['mode'] == 'run', 'Jatka: ajo jatkuu, banneri pois')
    # uusi törmäys 4 kn samaan veneeseen, jotta Purku näyttää molemmat laadut
    p.evaluate('document.getElementById("pauseBtn").click()')
    place(K['osumaEtaisyys'] + 90, 4, False)
    p.evaluate('document.getElementById("pauseBtn").click(); __sim.S.speedFactor = 3')
    got = run_until('__sim.frozen', 150); p.wait_for_timeout(800)
    st = state(); ok(got and st['coll'] is not None and st['coll']['kind'] == 'vene', 'toinen törmäys veneeseen pysäytti ajon (%s)' % (st['coll'] and '%.1f kn' % st['coll']['kn']))
    p.click('#groundBtn')
    try:
        p.wait_for_selector('#debrief:not([hidden])', timeout=30000); p.wait_for_timeout(2500)
        stat = p.inner_text('#dbStatus'); print('purku:', stat, flush=True)
        rows = p.evaluate('Array.from(document.querySelectorAll("#dbCollisions tbody tr")).map(r => Array.from(r.children).map(c => c.innerText.trim()).join(" | "))')
        print('törmäystaulukko:', rows, flush=True)
        ok(len(rows) == 3 and 'Kosketus' in rows[0] and 'Törmäys' in rows[1] and rows[0].endswith('kn'), 'purku listaa kosketuksen ja kaksi törmäystä aikoineen ja nopeuksineen')
        cmds = p.evaluate('Array.from(document.querySelectorAll("#dbCmds tbody tr")).map(r => r.children[1].innerText)')
        ok(any(x.startswith('Kosketus veneeseen') for x in cmds) and any(x.startswith('Törmäys veneeseen') for x in cmds), 'komentolokissa "Kosketus veneeseen" ja "Törmäys veneeseen": %s' % [x for x in cmds if 'vene' in x])
        res['loki'] = [x for x in cmds if 'vene' in x]
        p.evaluate('document.getElementById("dbCollisions").scrollIntoView({block: "center"})'); p.wait_for_timeout(800)
        p.screenshot(path=os.path.join(SHOTS, '3l_purku_tormays_vene.png'))
    except Exception as ex:
        ok(False, 'purku ei auennut: %s' % ex)
    cm = p.evaluate('__sim.collMs'); res['suorituskyky_ms'] = {'n': cm['n'], 'keskiarvo': cm['sum'] / max(1, cm['n']), 'suurin': cm['max']}
    print('törmäystarkistus sovelluksessa: %d askelta, keskiarvo %.4f ms, suurin %.3f ms' % (cm['n'], cm['sum'] / max(1, cm['n']), cm['max']), flush=True)
    ok(cm['n'] > 50 and cm['sum'] / cm['n'] < 1.0, 'törmäystarkistus sovelluksessa keskimäärin alle 1 ms askeleelta')
    print('virheet', errs[:6]); ok(not [e for e in errs if 'favicon' not in e[1]], 'ei konsolivirheitä')
    json.dump(res, open(os.path.join(SHOTS, 'tulos_3l_tormays.json'), 'w'), indent=1, ensure_ascii=False)
    b.close()
print('VIRHEITÄ %d' % len(fails) if fails else 'Kaikki läpi', flush=True)
sys.exit(1 if fails else 0)
