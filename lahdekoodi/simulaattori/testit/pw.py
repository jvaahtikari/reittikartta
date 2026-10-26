"""Playwright-apurit simulaattorin testeille (Chromium Pixel 7, WebKit iPhone 14).
Selaimet ovat polussa /opt/pw-browsers (ei playwright install -ajoa)."""
import os, json, time
from playwright.sync_api import sync_playwright

GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
SIM = os.environ.get('SIM', 'http://127.0.0.1:8154/')
PAKETTI = os.environ.get('PAKETTI', 'http://127.0.0.1:8144/')


def proxy_opts():
    if not PROXY:
        return None
    return {'server': PROXY, 'bypass': 'localhost,127.0.0.1'}


def chromium(pw, headless=True, **ctx):
    b = pw.chromium.launch(headless=headless, args=GL_ARGS, proxy=proxy_opts())
    dev = pw.devices['Pixel 7']
    d = dict(dev); d.update(ctx)
    c = b.new_context(**d)
    return b, c


def webkit(pw, **ctx):
    b = pw.webkit.launch(proxy=proxy_opts())
    dev = pw.devices['iPhone 14']
    d = dict(dev); d.update(ctx)
    c = b.new_context(**d)
    return b, c


def collect(page, store):
    """Kerää konsolivirheet ja sivun virheet listaan."""
    page.on('console', lambda m: store.append(('console.' + m.type, m.text)) if m.type in ('error',) else None)
    page.on('pageerror', lambda e: store.append(('pageerror', str(e))))
