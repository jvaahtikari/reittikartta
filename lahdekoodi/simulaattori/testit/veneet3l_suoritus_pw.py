"""Vaihe 3l, kriteeri 4: suorituskyky pisteessä Naistenlahti (644 venettä) samassa istunnossa veneet pois ja päällä vuorotellen (__sim.setBoats).
Kuvaväli mitataan requestAnimationFrame-kutsujen välisestä ajasta (lohkon keskiarvo ja mediaani, ensisijaisena pienin lohko, koska ajoympäristö on jaettu ja toisen ajon kuorma nostaa yksittäisiä lohkoja), piirtokutsut ja kolmiot renderöijän tilastoista.
Käyttö: python3 veneet3l_suoritus_pw.py <deck|pixel> [laatu]    (deck: täysi laatu, raja 1,15-kertainen. pixel: kevyt laatu, raja 1,05-kertainen)"""
import sys, os, json, statistics
sys.path.insert(0, os.path.dirname(__file__))
from veneet3l_apu import *
dev = sys.argv[1] if len(sys.argv) > 1 else 'deck'
laatu = sys.argv[2] if len(sys.argv) > 2 else None
JS_KUVAVALI = """async (n) => { const t = []; await new Promise(res => { let i = 0, prev = 0; function f(ts) { if (prev) t.push(ts - prev); prev = ts; if (++i > n) res(); else requestAnimationFrame(f); } requestAnimationFrame(f); });
  t.sort((a, b) => a - b); const r = __view.rendererStats(); return { n: t.length, med: t[Math.floor(t.length / 2)], keski: t.reduce((a, b) => a + b, 0) / t.length, kutsut: r.calls, kolmiot: r.triangles }; }"""
res = {'laite': dev}
with sync_playwright() as pw:
    b, p, errs = avaa(pw, dev, laatu)
    hn = satama(p, 'naistenlahti'); res['naistenlahti'] = hn
    e, n, h = satama_asema(hn, 150); ok = siirra(p, e, n, h); print('valmis', ok, flush=True)
    p.evaluate('document.getElementById("pauseBtn").click()')   # ajo käyntiin: kuvaväli mitataan oikeassa silmukassa
    p.evaluate('__sim.S.speedFactor = 1; Liike.orderSpeed(__sim.S, 0)')
    p.evaluate('__view.setGaze(0)')
    res['laatu'] = p.evaluate('__view.getQuality()'); res['veneita'] = p.evaluate('__sim.boats.tilasto().veneita || __sim.boats.veneet.length')
    p.evaluate('__sim.setBoats(true)'); p.wait_for_timeout(4000)
    on, off = [], []
    for kierros in range(int(os.environ.get('KIERROKSIA', '8'))):
        for tila in ((False, True) if kierros % 2 == 0 else (True, False)):   # järjestys vuorotellen, jotta hidas ajautuminen ei kohdistu vain toiseen
            p.evaluate('__sim.setBoats(%s)' % ('true' if tila else 'false')); p.wait_for_timeout(1500)
            p.evaluate(JS_KUVAVALI, 4)
            r = p.evaluate(JS_KUVAVALI, 30); (on if tila else off).append(r)
            print('kierros %d veneet %-5s mediaani %7.1f ms keskiarvo %7.1f ms kutsut %d kolmiot %d' % (kierros, tila, r['med'], r['keski'], r['kutsut'], r['kolmiot']), flush=True)
    med = lambda L, k: statistics.median([x[k] for x in L])
    res['mediaani_on_ms'] = med(on, 'med'); res['mediaani_off_ms'] = med(off, 'med'); res['keski_on_ms'] = med(on, 'keski'); res['keski_off_ms'] = med(off, 'keski')
    res['keski_yhdistetty_on_ms'] = sum(x['keski'] for x in on) / len(on); res['keski_yhdistetty_off_ms'] = sum(x['keski'] for x in off) / len(off); res['min_on_ms'] = min(x['keski'] for x in on); res['min_off_ms'] = min(x['keski'] for x in off); res['suhde_pienin_lohko'] = res['min_on_ms'] / res['min_off_ms']; res['suhde_yhdistetty'] = res['keski_yhdistetty_on_ms'] / res['keski_yhdistetty_off_ms']; res['suhde_mediaani'] = res['mediaani_on_ms'] / res['mediaani_off_ms']; res['suhde_keskiarvo'] = res['keski_on_ms'] / res['keski_off_ms']
    res['kutsut_on'] = on[-1]['kutsut']; res['kolmiot_on'] = on[-1]['kolmiot']; res['kutsut_off'] = off[-1]['kutsut']; res['kolmiot_off'] = off[-1]['kolmiot']
    res['raakadata'] = {'on': on, 'off': off}
    print('suhde (pienin lohko, kuormasta vähiten häiriintynyt) %.3f, suhde (kaikkien lohkojen keskiarvo) %.3f, suhde (mediaani) %.3f, suhde (keskiarvo) %.3f, kutsut %d (ilman veneitä %d), kolmiot %d (ilman %d)' % (res['suhde_pienin_lohko'], res['suhde_yhdistetty'], res['suhde_mediaani'], res['suhde_keskiarvo'], res['kutsut_on'], res['kutsut_off'], res['kolmiot_on'], res['kolmiot_off']), flush=True)
    print('virheet', errs[:6]); res['virheet'] = errs[:6]
    json.dump(res, open(os.path.join(SHOTS, 'tulos_3l_suoritus_%s.json' % dev), 'w'), indent=1, ensure_ascii=False)
    b.close()
