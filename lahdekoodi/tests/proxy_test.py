"""Verkkoversio: paikannimet ja kivet Maanmittauslaitoksen välityspalvelun (/api/mml) kautta ilman käyttäjän avainta."""
import os, sys, threading, functools, http.server, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
fails, proxied = [], []


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


class Req:
    def __init__(self, url): self.url, self.method, self.headers = url, 'GET', {}


def proxy(route, request):
    # sama kuin api/mml.js: polku p, muut parametrit, avain lisätään palvelimella
    u = urllib.parse.urlparse(request.url)
    q = urllib.parse.parse_qs(u.query)
    proxied.append(request.url)
    p = q.pop('p', [''])[0]
    q['api-key'] = ['TESTI']
    handle(route, Req('https://avoin-paikkatieto.maanmittauslaitos.fi' + p + '?' + urllib.parse.urlencode(q, doseq=True)))


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/Reittikartta.html' % srv.server_address[1]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', lambda route, req: proxy(route, req) if '/api/mml' in req.url else (route.continue_() if req.url.startswith('http://127.0.0.1') else handle(route, req)))
    page.goto(base); page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    check(page.evaluate("ChartAPI.mmlInfo.available && !ChartAPI.mmlInfo.key"), 'verkkoversiossa paikannimet käytössä ilman omaa avainta')
    page.evaluate("App.map.setView([61.70, 23.90], 11)"); page.wait_for_timeout(500)
    page.fill('#searchIn', 'viitas'); page.wait_for_timeout(1800)
    names = page.evaluate("Search.results.map(r => r.name)")
    check('Viitasalmi' in names and 'Viitasaari' in names, 'paikannimihaku välityspalvelun kautta: %s' % names)
    check(proxied and all('api-key' not in u for u in proxied), 'sivu ei lähetä avainta (%d välitettyä kutsua)' % len(proxied))
    page.keyboard.press('Escape')
    page.evaluate("ChartAPI.setBase('vector'); App.map.setView([61.6250, 23.765], 14)"); page.wait_for_timeout(2500)
    check(page.evaluate("document.querySelectorAll('.rk-ico').length") >= 3, 'kivet välityspalvelun kautta')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()
srv.shutdown()
print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
