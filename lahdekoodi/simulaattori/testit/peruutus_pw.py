"""Vaihe 3k, kriteerit 0 ja 1 koko sovelluksessa (napit ja komentoloki): peruutus, Perä vasen ja Perä oikea, Suoraan, Peruutus 2 ja 4.
Vapaa ajo Mustalahden edustalta (aloitus E 327 184, N 6 823 553), aikakerroin 5.
 A. Käyttäjän tapaus: 12 kn, Nopeus 0, Peruutus 2, 60 s: keulasuunta pysyy +-5 astetta, COG 180 astetta keulasta +-10 astetta, alus ei käänny ympäri.
 B. Perä vasen kääntää tosisuuntaa kasvavaan suuntaan vähintään 10 astetta 20 s:ssa 3 kn:n peruutuksessa (käsketty nopeus -2 ja -4, mitataan 3 kn:n ohi), Perä oikea päinvastoin.
 C. Peruutus 2 ja Peruutus 4: nopeus 0,3 kn:n sisällä 60 s:ssa, ei yli 4 kn. Nappien tekstit ja komentoloki.
Käyttö: SIM=... PAKETTI=... python3 peruutus_pw.py [--webkit]"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
fails = []
def ok(c, m):
    print(('OK    ' if c else 'VIRHE ') + m, flush=True)
    if not c: fails.append(m)
def wrap(a): return (a + 180) % 360 - 180

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&naytot=both&ff=5&t=2026-10-26T10:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000)
    p.evaluate('window.__adaptOff=true')
    S = lambda expr: p.evaluate('(() => { const S = __sim.S; return ' + expr + '; })()')
    st = lambda: p.evaluate('''() => { const S = __sim.S; return { v: S.v / Liike.KN, th: Liike.trueHdg(S), cog: Liike.cogTrue(S), t: S.t, ground: !!__sim.ground, coll: !!__sim.collision, frozen: __sim.frozen,
        order: document.getElementById('ordSpd').textContent, orderH: document.getElementById('ordHdg').textContent, left: document.querySelector('#bLeft .lbl').textContent, right: document.querySelector('#bRight .lbl').textContent,
        mid: document.querySelector('#bGentle .lbl').textContent, rev: S.sternTurn, now: document.getElementById('nowSpd').textContent }; }''')
    def wait_sim(sec):
        t0 = S('S.t')
        p.wait_for_function('__sim.S.t >= %f || __sim.frozen' % (t0 + sec), timeout=int(sec * 1000 + 60000), polling=200)
    def tap(sel): p.evaluate('(s) => document.querySelector(s).click()', sel)

    p0 = p.evaluate('({ x: __sim.S.x, y: __sim.S.y, hdg: __sim.S.hdg, conv: __sim.S.conv })')
    def reset_pose(th):
        """Alus aloituspaikalle (Mustalahden edusta, avovesi pohjoiseen), tosisuunta th, seisaallaan, käskyt nollattu."""
        p.evaluate('''([p0, th]) => { const S = __sim.S; S.x = p0.x; S.y = p0.y; S.conv = p0.conv; S.hdg = ((th - p0.conv) % 360 + 360) % 360; Liike.halt(S); __sim.frozen = false; __sim.collision = null; }''', [p0, th])
        p.evaluate('document.getElementById("groundBanner").hidden = true')
    # ---- A. käyttäjän tapaus: 12 kn, Nopeus 0, Peruutus 2, 60 s ----
    tap('.cb.sp[data-kn="12"]'); wait_sim(60)
    s0 = st(); ok(abs(s0['v'] - 12) < 0.6, 'A: 12 kn saavutettu (%.2f kn), tosisuunta %.1f' % (s0['v'], s0['th']))
    h0 = s0['th']
    tap('#bStop'); tap('#bReverse')
    ok(True, 'A: napit Nopeus 0 ja Peruutus 2, käskyteksti "%s"' % st()['order'])
    maxdev, cogerr, speeds, rev_since = 0, [], [], None
    t_end = S('S.t') + 100
    while S('S.t') < t_end and not st()['frozen']:
        s = st(); maxdev = max(maxdev, abs(wrap(s['th'] - h0)))
        if s['v'] < -1.0:
            cogerr.append(abs(wrap(s['cog'] - (h0 + 180))))
        speeds.append(s['v'])
        if len(speeds) > 1 and s['t'] > S('S.t') - 0.1 and s['v'] < -1.9 and rev_since is None: rev_since = s['t']
        if rev_since is not None and s['t'] - rev_since > 60: break
        p.wait_for_timeout(300)
    sA = st()
    print('A: keulasuunnan suurin poikkeama %.2f astetta, COG-virhe suurin %.2f (%d näytettä), nopeus nyt %.2f kn, ground=%s coll=%s' % (maxdev, max(cogerr or [0]), len(cogerr), sA['v'], sA['ground'], sA['coll']))
    ok(not sA['ground'] and not sA['coll'], 'A: ei pohjakosketusta eikä törmäystä')
    ok(maxdev <= 5, 'A: keulasuunta pysyy 107-tyyppisenä: suurin poikkeama %.2f astetta (raja 5)' % maxdev)
    ok(cogerr and max(cogerr) <= 10, 'A: COG on 180 astetta keulasta (virhe %.2f astetta, raja 10)' % max(cogerr or [99]))
    ok(sA['v'] < -1.5 and sA['v'] >= -4.0, 'A: alus peruuttaa perä edellä (%.2f kn)' % sA['v'])
    p.screenshot(path=os.path.join(out, '3k_peruutus_2kn.png'))

    # ---- B. Perä vasen ja Perä oikea 3 kn:n peruutuksessa ----
    tap('#bStop'); wait_sim(30); reset_pose(170)     # keula etelään, perä edellä pohjoiseen (avovesi)
    tap('#bReverse4'); wait_sim(30)
    s = st(); ok(s['order'] == 'Peruutus 4 kn' and s['left'] == 'Perä vasen' and s['right'] == 'Perä oikea' and s['mid'] == 'Suoraan', 'B: peruutuksessa napit "%s", "%s", "%s", käsky "%s"' % (s['left'], s['right'], s['mid'], s['order']))
    ok(s['v'] < -3.3, 'B: peruutusnopeus %.2f kn' % s['v'])
    for name, sel, sgn in (('Perä vasen', '#bLeft', 1), ('Perä oikea', '#bRight', -1)):
        tap('#bGentle'); wait_sim(3)        # Suoraan: suunta pidetään
        a = st()
        # painallus = pointer-tapahtumat
        p.evaluate('''(sel) => { const b = document.querySelector(sel); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }''', sel)
        s1 = st(); ok(s1['orderH'] == name, 'B: %s: käskyteksti "%s"' % (name, s1['orderH']))
        wait_sim(20); d = st()
        dh = wrap(d['th'] - a['th'])
        print('B: %s: tosisuunta %.1f -> %.1f (%+.1f astetta 20 s:ssa), nopeus %.2f kn, COG %.1f' % (name, a['th'], d['th'], dh, d['v'], d['cog']))
        ok(sgn * dh >= 10, 'B: %s kääntää tosisuuntaa %s vähintään 10 astetta 20 s:ssa (%+.1f)' % (name, 'kasvavaan suuntaan' if sgn > 0 else 'pienenevään suuntaan', dh))
        ok(d['v'] < -2.5, 'B: peruutus jatkuu käännöksen aikana (%.2f kn)' % d['v'])
    tap('#bGentle'); wait_sim(8)
    s = st(); h1 = s['th']; wait_sim(10); s2 = st()
    ok(abs(wrap(s2['th'] - h1)) < 2 and s2['orderH'].startswith('Suunta'), 'B: Suoraan: suunta pysyy (%+.2f astetta 10 s:ssa), käsky "%s"' % (wrap(s2['th'] - h1), s2['orderH']))

    # ---- C. nopeudet: Peruutus 2, Peruutus 4, askellus ----
    tap('#bStop'); wait_sim(20); reset_pose(170)
    tap('#bReverse'); wait_sim(60); s = st()
    ok(abs(s['v'] + 2) <= 0.3, 'C: Peruutus 2: %.2f kn 60 s:ssa (raja +-0,3)' % s['v'])
    tap('#bReverse4'); wait_sim(60); s = st()
    ok(abs(s['v'] + 4) <= 0.3, 'C: Peruutus 4: %.2f kn 60 s:ssa (raja +-0,3), pohja=%s, törmäys=%s' % (s['v'], s['ground'], s['coll']))
    tap('#bStop'); wait_sim(5); seq = []
    for sel in ('#bSlower', '#bSlower', '#bSlower', '#bFaster', '#bFaster'):
        tap(sel); seq.append(S('S.orderSpeedKn'))
    p.wait_for_timeout(800); txt = st()['order']
    ok(seq == [-2, -4, -4, -2, 0], 'C: -2-nappi 0 -> -2 -> -4 -> ei alle -4 ja +2-nappi takaisin -2 -> 0: %s' % seq)
    ok(txt == 'Nopeus 0 kn', 'C: käskyteksti "%s"' % txt)
    # komentoloki
    cmds = p.evaluate('__sim.S.cmdLog.map(c => c.kind + ":" + JSON.stringify(c.value))')
    print('komentoloki:', cmds)
    ok(any(x.startswith('stern:"vasen"') for x in cmds) and any(x.startswith('stern:"oikea"') for x in cmds) and any(x.startswith('straight') for x in cmds), 'komentolokissa perän käskyt ja Suoraan')
    p.evaluate('document.getElementById("menuBtn").click()'); p.evaluate('document.getElementById("mAbort").click()')
    p.wait_for_selector('#debrief:not([hidden])', timeout=30000); p.wait_for_timeout(1500)
    labs = p.evaluate('Array.from(document.querySelectorAll("#dbCmds tbody tr")).map(r => r.children[1].innerText)')
    print('purun komentorivit:', [x for x in labs if 'Perä' in x or 'Peruutus' in x or x == 'Suoraan'][:10])
    ok(any(x == 'Perä vasemmalle' for x in labs) and any(x == 'Perä oikealle' for x in labs) and any(x == 'Peruutus 2 kn' for x in labs) and any(x == 'Peruutus 4 kn' for x in labs) and any(x == 'Suoraan' for x in labs), 'purun komentolokissa Perä vasemmalle, Perä oikealle, Suoraan, Peruutus 2 kn ja Peruutus 4 kn')
    print('virheet', errs[:6]); ok(not [e for e in errs if 'favicon' not in e[1]], 'ei konsolivirheitä')
    b.close()
print('VIRHEITÄ %d' % len(fails) if fails else 'Kaikki läpi', flush=True)
sys.exit(1 if fails else 0)
