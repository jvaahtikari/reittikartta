#!/usr/bin/env python3
"""Kokoaa Reittikartan yhdeksi tiedostoksi (dist/Reittikartta.html).

Kaikki tyylit ja skriptit, myös Leaflet, upotetaan sivuun, jotta valmis
sovellus on yksi tuplaklikattava tiedosto ilman asennuksia."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def css_tag(m):
    return '<style>\n' + read(m.group(1)) + '\n</style>'


def js_tag(m):
    src = read(m.group(1))
    if '</script' in src.lower():
        raise SystemExit('Skriptissä %s on </script>-merkkijono' % m.group(1))
    return '<script>\n' + src + '\n</script>'


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_tag, html)
html = re.sub(r'<script src="([^"]+)"></script>', js_tag, html)

out = ROOT / 'dist' / 'Reittikartta.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, len(html.encode('utf-8')), 'tavua')
