"""Vertailuarvot kriteerejä 2 ja 3 varten, laskettu paketista ilman selainta (pmtiles, PIL, pyproj)."""
import json, math, io, sys
from pmtiles.reader import Reader, MmapSource
from PIL import Image
import numpy as np
from pyproj import Transformer
PK = '/home/claude/opetus/navi/putki/ulos/'
T = Transformer.from_crs(3067, 4326, always_xy=True); TI = Transformer.from_crs(4326, 3067, always_xy=True)
_f = open(PK + 'maasto.pmtiles', 'rb'); _r = Reader(MmapSource(_f))
_cache = {}
def tile(z, x, y):
    k = (z, x, y)
    if k not in _cache:
        d = _r.get(z, x, y)
        if d is None: _cache[k] = None
        else:
            a = np.array(Image.open(io.BytesIO(d)).convert('RGB')).astype(np.float64)
            _cache[k] = -10000 + (a[..., 0] * 65536 + a[..., 1] * 256 + a[..., 2]) * 0.1
    return _cache[k]
def dem(e, n, z=14):
    lon, lat = T.transform(e, n)
    nn = 2 ** z; fx = (lon + 180) / 360 * nn
    fy = (0.5 - math.log((1 + math.sin(math.radians(lat))) / (1 - math.sin(math.radians(lat)))) / (4 * math.pi)) * nn
    tx, ty = int(fx), int(fy); h = tile(z, tx, ty)
    if h is None: return None
    H, W = h.shape; px = (fx - tx) * W - 0.5; py = (fy - ty) * H - 0.5
    px = min(max(px, 0), W - 1); py = min(max(py, 0), H - 1)
    x0, y0 = int(px), int(py); x1, y1 = min(W - 1, x0 + 1), min(H - 1, y0 + 1); ax, ay = px - x0, py - y0
    return (h[y0, x0] * (1 - ax) + h[y0, x1] * ax) * (1 - ay) + (h[y1, x0] * (1 - ax) + h[y1, x1] * ax) * ay
def aid_en(numero):
    for l in open('/home/claude/opetus/navi/putki/tyo/geojson/turvalaite.geojsonl'):
        f = json.loads(l)
        if str(f['properties'].get('numero')) == str(numero):
            e, n = TI.transform(*f['geometry']['coordinates']); return e, n, f['properties']
if __name__ == '__main__':
    # Pispalanharjun korkein kohta
    best = (0, None)
    for e in range(323600, 326200, 50):
        for n in range(6821200, 6823400, 50):
            h = dem(e, n)
            if h is not None and h > best[0]: best = (h, (e, n))
    print('Pispalanharju max', best)
    for a in (29183, 26636, 26647): print(a, aid_en(a))
