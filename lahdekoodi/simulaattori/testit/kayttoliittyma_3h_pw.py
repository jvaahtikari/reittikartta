"""Vaihe 3h, toinen kierros: tutkan, plotterin ja komentopalstan napit ja lukemat (tiivis asettelu, nappien kosketuskohde 44 px, piirretty 32 px).
Mittaa jokaisella koolla: tutkakuvan halkaisija suhteessa ruudun pienempään sivuun (vähintään 98 %), tutkassa näkyvien nappien määrä (enintään 5), plotterissa (enintään 4),
kosketuskohteet (vähintään 44 px, piirretty korkeus 32 px), että yksikään nappi ei peitä ympyrän keskialuetta (säde alle 70 % vapaana), että lukemat eivät peitä nappeja,
että ≡-valikko avautuu ja sulkeutuu valinnan jälkeen, plotterin mittakaavajana nappien yläpuolella sekä komentopalstan leveys, nappien koot ja vieritystarve.
Käyttö: python3 kayttoliittyma_3h_pw.py 1440x900 [1024x768 ...] tai pixel7 tai iphone14. Kuvat shots/3h_tutka_*.png, 3h_plotteri_napit_*.png, 3h_komennot_*.png."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
configs = sys.argv[1:] or ['1440x900']
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

METRICS = r'''() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const rc = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const lab = (e) => e.getAttribute('data-tutka') || e.id || e.textContent.trim().slice(0, 12);
  const out = {};
  const pr = document.getElementById('paneR'), rr = pr.getBoundingClientRect();
  if (rr.width > 10 && !pr.classList.contains('small') && window.__radar) {
    __radar.piirra();
    const g = __radar.testi.geom(), cv = document.getElementById('radar').getBoundingClientRect();
    const cx = cv.left + g.cx, cy = cv.top + g.cy;
    const btn = [...document.querySelectorAll('.tutka-ui button')].filter(vis);
    const pad = (e) => { const cs = getComputedStyle(e); return { dh: e.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), dw: e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), fs: parseFloat(cs.fontSize) }; };
    const dist = (r) => { const dx = Math.max(r.l - cx, 0, cx - r.r), dy = Math.max(r.t - cy, 0, cy - r.b); return Math.hypot(dx, dy); };
    // piirretty alue (sisältöalue) on kosketuskohteen sisällä: keskialueen testi tehdään piirretylle alueelle ja kosketuskohteelle
    out.radar = { w: g.w, h: g.h, ratio: 2 * g.r / Math.min(g.w, g.h), r: g.r, n: btn.length,
      btn: btn.map(e => Object.assign({ id: lab(e), hit: rc(e), minFrac: dist(rc(e)) / g.r }, pad(e))),
      luk: (g.luk || []).map(x => ({ t: x.t, l: x.x0 + cv.left, t0: x.y0 + cv.top, r: x.x1 + cv.left, b: x.y1 + cv.top })) };
    const pane3 = document.getElementById('pane3d'), small = pane3.classList.contains('small') ? rc(pane3) : null;
    out.radar.small = small;
    out.radar.txt = [...document.querySelectorAll('.tutka-ui button')].filter(vis).map(e => e.textContent.trim());
  }
  const pp = document.getElementById('paneP'), pq = pp.getBoundingClientRect();
  if (pq.width > 10 && !pp.classList.contains('small')) {
    const btn = [...pp.querySelectorAll('button')].filter(vis);
    const sc = document.getElementById('scaleBox'), zm = document.getElementById('zoomBox'), vec = document.getElementById('vecBtn');
    out.plot = { n: btn.length, btn: btn.map(e => ({ id: lab(e), hit: rc(e) })), scale: vis(sc) ? rc(sc) : null, zoom: rc(zm), vec: vis(vec) ? rc(vec) : null,
      info: rc(document.querySelector('.plot-info')), pane: { l: pq.left, t: pq.top, r: pq.right, b: pq.bottom, w: pq.width, h: pq.height },
      small: (document.getElementById('pane3d').classList.contains('small') ? rc(document.getElementById('pane3d')) : null) };
  }
  const cm = document.getElementById('cmd'), cb = [...cm.querySelectorAll('button')].filter(vis);
  const st = cm.querySelector('.status').getBoundingClientRect();
  out.cmd = { w: cm.getBoundingClientRect().width, h: cm.getBoundingClientRect().height, scrollH: cm.scrollHeight, clientH: cm.clientHeight, n: cb.length, status: { w: st.width, h: st.height },
    btn: cb.map(e => ({ id: lab(e), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, l: e.getBoundingClientRect().left, r: e.getBoundingClientRect().right, t: e.getBoundingClientRect().top, b: e.getBoundingClientRect().bottom })),
    rect: rc(cm), docScroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 };
  return out;
}'''

def overlap(a, b):
    return a['r'] > b['l'] and a['l'] < b['r'] and a['b'] > b['t'] and a['t'] < b['b']

def tap(p, sel, touch):
    p.tap(sel) if touch else p.click(sel)

def check_radar(tag, m, touch, p):
    r = m.get('radar')
    if not r:
        return
    ok(r['ratio'] >= 0.98, '%s: tutkakuvan halkaisija %.1f %% ruudun pienemmästä sivusta (%dx%d, vaatimus vähintään 98 %%)' % (tag, r['ratio'] * 100, r['w'], r['h']))
    ok(r['n'] <= 5, '%s: tutkassa %d nappia näkyvissä %s (enintään 5)' % (tag, r['n'], r['txt']))
    small = [b for b in r['btn'] if b['hit']['w'] < 43.5 or b['hit']['h'] < 43.5]
    ok(not small, '%s: tutkan kosketuskohteet vähintään 44 px (pienin %.0f x %.0f)' % (tag, min(b['hit']['w'] for b in r['btn']), min(b['hit']['h'] for b in r['btn'])))
    ok(all(abs(b['dh'] - 32) < 1.5 for b in r['btn']), '%s: piirretty korkeus %s px, kirjasin %s px' % (tag, sorted(set(round(b['dh']) for b in r['btn'])), sorted(set(round(b['fs']) for b in r['btn']))))
    ok(all(b['minFrac'] >= 0.7 for b in r['btn']), '%s: yksikään nappi ei peitä ympyrän keskialuetta (lähin nappi %.0f %% säteestä)' % (tag, min(b['minFrac'] for b in r['btn']) * 100))
    bad = []
    for l in r['luk']:
        lr = {'l': l['l'], 'r': l['r'], 't': l['t0'], 'b': l['b']}
        for b in r['btn']:
            h = b['hit']; dr = {'l': h['l'] + 2, 'r': h['r'] - 2, 't': h['t'] + 6, 'b': h['b'] - 6}   # piirretty alue
            if overlap(lr, dr): bad.append((l['t'], b['id']))
    ok(not bad, '%s: lukemat (%d kpl) eivät peitä nappeja %s' % (tag, len(r['luk']), bad))
    if r['small']:
        sb = [b['id'] for b in r['btn'] if overlap(b['hit'], r['small'])]
        sl = [l['t'] for l in r['luk'] if overlap({'l': l['l'], 'r': l['r'], 't': l['t0'], 'b': l['b']}, r['small'])]
        ok(not sb and not sl, '%s: pieni 3D-ikkuna ei peitä tutkan nappeja (%s) eikä lukemia (%s)' % (tag, sb, sl))

def check_plot(tag, m):
    q = m.get('plot')
    if not q:
        return
    ok(q['n'] <= 4, '%s: plotterissa %d nappia näkyvissä %s (enintään 4)' % (tag, q['n'], [b['id'] for b in q['btn']]))
    ok(all(b['hit']['w'] >= 43.5 and b['hit']['h'] >= 43.5 for b in q['btn']), '%s: plotterin kosketuskohteet vähintään 44 px (pienin %.0f x %.0f)' % (tag, min(b['hit']['w'] for b in q['btn']), min(b['hit']['h'] for b in q['btn'])))
    z = q['zoom']; pn = q['pane']
    ok(z['l'] - pn['l'] < 8 and pn['b'] - z['b'] < 8, '%s: + − Keskitä pinottuna vasemmassa alakulmassa (reuna %.0f ja %.0f px)' % (tag, z['l'] - pn['l'], pn['b'] - z['b']))
    if q['scale']:
        ok(q['scale']['b'] <= z['t'] + 1 and q['scale']['l'] - pn['l'] < 16, '%s: mittakaavajana vasemmassa alakulmassa nappien yläpuolella (jana alareuna %.0f, nappien yläreuna %.0f)' % (tag, q['scale']['b'], z['t']))
    ok(q['vec'] is not None, '%s: vektorin aika on lukema, jota napautetaan (ei erillistä nappia)' % tag)
    if q['small']:
        bad = [b['id'] for b in q['btn'] if overlap(b['hit'], q['small'])] + (['lukemat'] if overlap(q['info'], q['small']) else [])
        ok(not bad, '%s: pieni 3D-ikkuna ei peitä plotterin nappeja eikä lukemia %s' % (tag, bad))

def check_cmd(tag, m, wide):
    c = m['cmd']
    if wide:
        ok(c['w'] <= 250.5, '%s: komentopalstan leveys %.0f px (enintään 250)' % (tag, c['w']))
    sizes = sorted(set((round(b['w']), round(b['h'])) for b in c['btn']))
    ok(all(43.5 <= b['h'] <= 48.5 for b in c['btn']), '%s: komentonappien korkeus %s px (44 ... 48), nappeja %d' % (tag, sorted(set(round(b['h']) for b in c['btn'])), c['n']))
    ok(c['scrollH'] <= c['clientH'] + 1 and not c['docScroll'], '%s: komentopalstassa ei vieritystä (sisältö %d, ikkuna %d px)' % (tag, c['scrollH'], c['clientH']))
    if wide:
        rows = {}
        for b in c['btn']: rows.setdefault(round(b['t'] / 6), []).append(b['id'])
        ok(len(rows) == 4, '%s: nappeja neljällä rivillä (%s)' % (tag, [len(v) for k, v in sorted(rows.items())]))

with sync_playwright() as pw:
    for cfg in configs:
        touch = cfg in ('pixel7', 'iphone14')
        if cfg == 'pixel7': b, c = chromium(pw)
        elif cfg == 'iphone14': b, c = webkit(pw)
        else:
            w, h = [int(x) for x in cfg.split('x')]
            b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
            c = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=w < 1000, is_mobile=w < 700)
        p = c.new_page(); errs = []; collect(p, errs)
        p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&naytot=both')
        p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=170000); p.wait_for_timeout(2500)
        wide = p.evaluate('__sim.layout.wide'); tp = p.evaluate('__sim.layout.tp')
        def tutkavalmis():
            try: p.wait_for_function('window.__radar && __radar.tilasto().sateita >= 1300', timeout=100000)
            except Exception: pass
            p.wait_for_timeout(600)
        tag = cfg
        if wide:
            tutkavalmis()
            m = p.evaluate(METRICS)
            check_radar(tag, m, touch, p); check_plot(tag, m); check_cmd(tag, m, not tp)
            p.screenshot(path=os.path.join(out, '3h_tutka_%s.png' % cfg))
            p.screenshot(path=os.path.join(out, '3h_plotteri_napit_%s.png' % cfg))
        else:
            # puhelin: plotteri, sitten tutka (vaihtonappi yläpalkissa)
            m = p.evaluate(METRICS); check_plot(tag + ' plotteri', m); check_cmd(tag, m, False)
            p.screenshot(path=os.path.join(out, '3h_plotteri_napit_%s.png' % cfg))
            if not p.evaluate('document.getElementById("instrBtn").hidden'):
                ok(True, '%s: mittarin vaihtonappi yläpalkissa (%s)' % (tag, p.inner_text('#instrBtn')))
                tap(p, '#instrBtn', touch); p.wait_for_timeout(2500)
                tutkavalmis()
                m = p.evaluate(METRICS); check_radar(tag + ' tutka', m, touch, p)
                p.screenshot(path=os.path.join(out, '3h_tutka_%s.png' % cfg))
            else:
                ok(False, '%s: vaihtonappi puuttuu' % tag)
        # ≡-valikko: avautuu, sisältää viisi tai vähemmän valintaa ja sulkeutuu valinnan jälkeen
        if p.evaluate('!!window.__radar && document.getElementById("paneR").getBoundingClientRect().width > 10'):
            tap(p, '.tutka-ui [data-tutka="meny"]', touch); p.wait_for_timeout(500)
            mm = p.evaluate('''() => [...document.querySelectorAll('.tutka-ui button')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).map(e => ({ id: e.getAttribute('data-tutka') || e.id, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, t: e.textContent.trim() }))''')
            ids = [x['id'] for x in mm]
            ok(all(x in ids for x in ['suunta', 'jalki', 'sade', 'viritys', 'rOffBtn']) and all(x['h'] >= 43.5 and x['w'] >= 43.5 for x in mm), '%s: ≡-valikossa %s, kosketuskohteet vähintään 44 px' % (tag, [x['t'] for x in mm]))
            p.screenshot(path=os.path.join(out, '3h_tutka_valikko_%s.png' % cfg))
            tap(p, '.tutka-ui [data-tutka="suunta"]', touch); p.wait_for_timeout(600)
            n2 = p.evaluate('''() => [...document.querySelectorAll('.tutka-ui button')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).length''')
            nu = p.evaluate('__radar.lue().suuntaYlos') if p.evaluate('typeof __radar.lue === "function"') else None
            ok(n2 == 5, '%s: valinnan jälkeen valikko sulkeutui (näkyviä nappeja %d, suunta ylös: %s)' % (tag, n2, nu))
        ok(not errs, '%s: konsolivirheitä ei tullut %s' % (tag, errs[:2]))
        if cfg in ('1440x900', 'pixel7'):
            p.screenshot(path=os.path.join(out, '3h_komennot_%s.png' % ('1440x900' if cfg == '1440x900' else 'puhelin')))
        b.close()
bad = sum(1 for c_, _ in checks if not c_)
print('tarkistuksia %d, virheitä %d' % (len(checks), bad))
sys.exit(1 if bad else 0)
