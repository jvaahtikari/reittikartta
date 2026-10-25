"""Vaihe 3b tehtävä 5: rantaviivan jyrkkyys (suurin korkeusero rantaviivalla vierekkäisten ruutujen välillä, taperilla ja ilman) ja luotojen tilastot."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
pts = [(331180, 6826560, 90), (327364, 6824694, 0), (325177, 6845144, 338), (334706, 6825456, 60)]
with sync_playwright() as pw:
    b, c = chromium(pw)
    for (e, n, h) in pts:
        p = c.new_page(); errs = []; collect(p, errs)
        p.goto(SIM + 'simulaattori/testit/nakyma_testi.html?e=%d&n=%d&h=%d&budget=14' % (e, n, h))
        p.wait_for_function('window.__ready===true', timeout=150000)
        p.wait_for_timeout(3000)
        r = p.evaluate('() => ({ shore: __view.terrain.shoreStats(), trees: __view.terrain.treeInfo(), lev: __view.terrain.levels() })')
        print(e, n, json.dumps(r))
        if e == 327364:
            print('luodot', json.dumps(p.evaluate('() => __view.terrain.isletStats()'), ensure_ascii=False))
        p.close()
    b.close()
