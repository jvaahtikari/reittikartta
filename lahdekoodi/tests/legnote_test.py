"""Legien suuntanuotit mutkikkaalla reitillä: laatikot eivät mene päällekkäin, lyhyet legit jäävät ilman
laatikkoa ja lähemmäs zoomattaessa laatikoita tulee lisää."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file://' + os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/index.html')
fails = []
def check(c, m):
    print(('OK  ' if c else 'FAIL') + ' ' + m)
    if not c: fails.append(m)

with sync_playwright() as pw:
    b = pw.chromium.launch(); page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET); page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    # siksak-reitti: 30 legiä, joista joka toinen on lyhyt (noin 150 m) ja joka toinen pitkä (noin 900 m)
    page.evaluate("""(() => {
      const pts = []; let lat = 61.60, lng = 23.70;
      for (let i = 0; i < 31; i++) { pts.push({ lat, lng }); if (i % 2) { lat += 0.008; lng += 0.004; } else { lat += 0.0012; lng -= 0.002; } }
      const r = Store.newRoute(pts); r.name = 'Siksak'; Store.emit('routes');
      App.map.setView([61.68, 23.72], 13);
    })()""")
    page.wait_for_timeout(800)
    def boxes():
        return page.evaluate("""[...document.querySelectorAll('.legnote')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })""")
    def overlaps(bs):
        n = 0
        for i in range(len(bs)):
            for j in range(i + 1, len(bs)):
                a, c = bs[i], bs[j]
                if a[0] < c[2] - 2 and c[0] < a[2] - 2 and a[1] < c[3] - 2 and c[1] < a[3] - 2: n += 1
        return n
    z0 = page.evaluate('App.map.getZoom()')
    b0 = boxes(); print('taso', z0, 'laatikoita', len(b0), 'päällekkäin', overlaps(b0))
    check(len(b0) >= 5, 'pitkille legeille tuli laatikoita')
    check(overlaps(b0) == 0, 'laatikot eivät mene päällekkäin')
    check(len(b0) < 30, 'kaikkia 30 legiä ei merkitä ahtaassa näkymässä')
    shot(page, 'l1-siksak')
    page.evaluate('App.map.zoomIn(1)'); page.wait_for_timeout(900)
    b1 = boxes(); print('taso', page.evaluate('App.map.getZoom()'), 'laatikoita', len(b1), 'päällekkäin', overlaps(b1))
    check(overlaps(b1) == 0, 'lähempänä laatikot eivät mene päällekkäin')
    check(len(b1) > 0, 'lähempänä laatikoita on')
    shot(page, 'l2-siksak-lahempaa')
    check(not errs, 'ei JS-virheitä %s' % errs)
    b.close()
print('TULOS:', 'OK' if not fails else 'VIRHEITÄ %d' % len(fails))
sys.exit(1 if fails else 0)
