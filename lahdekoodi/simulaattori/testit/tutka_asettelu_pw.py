"""Vaihe 3c: asettelut eri näyttökooilla (Chromium). Tarkistaa ruutujen järjestyksen, kosketuskohteet vähintään 44 px,
tutkan nappien ja pienen 3D-ikkunan päällekkäisyyden ja konsolivirheet. Käyttö: python3 tutka_asettelu_pw.py 915x412 1024x768 ..."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
SMALL = '''() => { const out = []; document.querySelectorAll('#game button').forEach(b => {
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
    if (r.width < 43.5 || r.height < 43.5) out.push((b.id || b.getAttribute('data-tutka') || b.textContent.trim().slice(0, 14)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  return out; }'''
sizes = sys.argv[1:] or ['915x412']
bad = 0
with sync_playwright() as pw:
    for sz in sizes:
        w, h = [int(x) for x in sz.split('x')]
        b, c = chromium(pw, viewport={'width': w, 'height': h}, screen={'width': w, 'height': h}, device_scale_factor=1, is_mobile=(w < 1000), has_touch=True)
        p = c.new_page(); errs = []; collect(p, errs)
        p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&naytot=both')
        p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=150000); p.wait_for_timeout(1500)
        res = {'koko': sz}
        res['layout'] = p.evaluate('__sim.layout'); res['instr_alussa'] = p.evaluate('__sim.instr')
        states = []
        for k in range(4):
            vis = p.evaluate('''() => ['paneP','paneR','pane3d'].filter(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(id => { const r = document.getElementById(id).getBoundingClientRect(); return id + ':' + Math.round(r.left) + ',' + Math.round(r.width) + 'x' + Math.round(r.height); })''')
            sm = p.evaluate(SMALL)
            ov = p.evaluate('''() => { const a = document.getElementById("pane3d"); if (!a.classList.contains("small")) return 0; const q = a.getBoundingClientRect(); let n = 0;
               document.querySelectorAll(".tutka-ui button, #rInstrBtn, #rOffBtn").forEach(e => { const cs = getComputedStyle(e); if (cs.display === "none") return; const r = e.getBoundingClientRect(); if (r.width && r.right > q.left && r.left < q.right && r.bottom > q.top && r.top < q.bottom) n++; }); return n; }''')
            states.append({'instr': p.evaluate('__sim.instr'), 'ruudut': vis, 'alle44': sm, 'paallekkain': ov})
            p.screenshot(path=os.path.join(os.path.dirname(__file__), '..', 'shots', '_3c_asettelu_%s_%d.png' % (sz, k)))
            if p.evaluate('document.getElementById("pInstrBtn").hidden === false && getComputedStyle(document.getElementById("pInstrBtn")).display !== "none" && document.getElementById("paneP").getBoundingClientRect().width > 0'):
                p.evaluate('document.getElementById("pInstrBtn").click()')
            else:
                p.evaluate('document.getElementById("rInstrBtn").click()')
            p.wait_for_timeout(900)
        res['tilat'] = states; res['virheet'] = errs[:3]
        for s_ in states:
            if s_['alle44'] or s_['paallekkain']: bad += 1
        if errs: bad += 1
        print(json.dumps(res, ensure_ascii=False), flush=True)
        b.close()
print('VIRHEITÄ', bad)
sys.exit(1 if bad else 0)
