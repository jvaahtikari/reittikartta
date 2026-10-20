"""Sivuutus- ja käännösetäisyyden kohteen kiinnitys Väyläviraston turvalaitteisiin.
Testiaineiston turvalaite k sijaitsee pisteessä (23.735 + 0.004k, 61.615 + 0.0015*(k % 3)), id 500 + k."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from run_ui import handle, shot
from playwright.sync_api import sync_playwright

TARGET = os.environ.get('TARGET', 'file:///home/claude/reittikartta/index.html')


def aid(k):
    return 61.615 + 0.0015 * (k % 3), 23.735 + 0.004 * k


fails = []


def check(cond, msg):
    print(('OK   ' if cond else 'VIKA ') + msg)
    if not cond:
        fails.append(msg)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.route('**/*', handle)
    page.goto(TARGET)
    page.wait_for_timeout(1200)
    page.click('button:has-text("Aloita")')
    page.evaluate("App.map.setView([61.618, 23.75], 14)")
    page.wait_for_timeout(2500)
    rid = page.evaluate("""(() => { const r = Store.newRoute([{lat:61.610,lng:23.735},{lat:61.626,lng:23.765},{lat:61.632,lng:23.758}]);
        r.name = 'Testi'; Store.emit('routes'); Routes.enterEdit(r.id); return r.id; })()""")
    page.wait_for_timeout(400)

    def px(lat, lng):
        return page.evaluate(f"(()=>{{const p=App.map.latLngToContainerPoint([{lat},{lng}]); const r=App.map.getContainer().getBoundingClientRect(); return [p.x+r.left, p.y+r.top];}})()")

    route = lambda: page.evaluate(f"Store.routeById('{rid}')")

    # 1) sivuutusetäisyys: kohde klikataan 9 px turvalaitteen 3 viereen
    page.evaluate(f"Routes.placePass(Store.routeById('{rid}'), 0)")
    ax, ay = px(*aid(3))
    page.mouse.move(ax + 5, ay - 8); page.wait_for_timeout(150)
    lab = page.inner_text('#roMode')
    print('lukema:', lab)
    check('KIINNITTYY TURVALAITTEESEEN' in lab.upper(), 'kohdistin näyttää kiinnityksen turvalaitteeseen')
    dots = page.evaluate("document.querySelectorAll('.leaflet-label-pane path.leaflet-interactive, .leaflet-labelPane-pane path').length")
    shot(page, 'a1-sivuutus-kohde')
    page.mouse.click(ax + 5, ay - 8); page.wait_for_timeout(100)
    page.mouse.click(ax + 30, ay + 40); page.wait_for_timeout(300)
    p0 = route()['passes'][0]
    lat3, lng3 = aid(3)
    check(p0['tgt'].get('aid', {}).get('id') == 503, 'sivuutuksen kohde on turvalaite 503')
    check(abs(p0['tgt']['lat'] - lat3) < 1e-9 and abs(p0['tgt']['lng'] - lng3) < 1e-9, 'kohde on täsmälleen rekisterin koordinaatissa')

    # 2) käännösetäisyys Alt pohjassa: ei kiinnitystä
    page.evaluate(f"Routes.placeTurn(Store.routeById('{rid}'), 1)")
    bx, by = px(*aid(6))
    page.keyboard.down('Alt'); page.mouse.click(bx + 4, by - 6); page.keyboard.up('Alt'); page.wait_for_timeout(300)
    t0 = route()['turns'][0]
    check('aid' not in t0['tgt'], 'Alt ohittaa kiinnityksen')

    # 3) käännösetäisyys ilman Altia: kiinnittyy turvalaitteeseen 6
    page.evaluate(f"Routes.placeTurn(Store.routeById('{rid}'), 1)")
    page.mouse.move(bx + 4, by - 6); page.wait_for_timeout(100)
    page.mouse.click(bx + 4, by - 6); page.wait_for_timeout(300)
    t1 = route()['turns'][1]
    check(t1['tgt'].get('aid', {}).get('id') == 506, 'käännösetäisyyden kohde on turvalaite 506')

    # 4) sivuutuksen kohteen siirto vetämällä: kiinnittyy turvalaitteeseen 4
    hx, hy = px(p0['tgt']['lat'], p0['tgt']['lng'])
    cx, cy = px(*aid(4))
    page.mouse.move(hx, hy); page.mouse.down(); page.mouse.move(cx - 6, cy + 7, steps=10); page.wait_for_timeout(150)
    shot(page, 'a2-kohteen-siirto')
    page.mouse.up(); page.wait_for_timeout(300)
    p0 = route()['passes'][0]
    check(p0['tgt'].get('aid', {}).get('id') == 504, 'vedetty kohde kiinnittyy turvalaitteeseen 504')

    # 5) merkinnät näkyvät ja tiedot säilyvät GPX-viennissä
    page.wait_for_timeout(200)
    check(page.evaluate("document.querySelectorAll('.handle.snapped').length") == 2, 'kiinnitetyt kohteet on merkitty muokkaustilassa')
    meta = page.evaluate(f"GPX.parse(GPX.build({{routes:[Store.routeById('{rid}')]}})).routes[0].meta")
    check(meta['passes'][0]['tgt']['aid']['id'] == 504 and meta['turns'][1]['tgt']['aid']['id'] == 506, 'kiinnitys säilyy GPX-tiedostossa')
    page.evaluate(f"Routes.finishEdit(true); Library.select('{rid}')")
    page.wait_for_timeout(300)
    txt = page.inner_text('#panel')
    check('Turvalaitekiinnitys' in txt and '2 / 3 kohdetta' in txt, 'reittikirjasto näyttää kiinnitettyjen kohteiden määrän')
    shot(page, 'a3-kirjasto')
    check(not errs, 'ei sivuvirheitä ' + str(errs))
    b.close()

print('TULOS:', 'kaikki kunnossa' if not fails else '%d vikaa' % len(fails))
sys.exit(1 if fails else 0)
