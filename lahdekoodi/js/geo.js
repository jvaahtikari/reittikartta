/* Reittikartta – geodesia ja muotoilu.
 * Suunnat ja matkat lasketaan loksodromina (Mercator-kartan suora viiva)
 * WGS84-ellipsoidin kaarevuussäteillä legin keskileveydellä. */
(function (global) {
  'use strict';

  var A = 6378137.0;            // WGS84 isoakseli
  var E2 = 0.00669437999014;    // WGS84 e^2
  var NM = 1852;                // meripeninkulma metreinä
  var RAD = Math.PI / 180;

  function radii(latDeg) {
    var s = Math.sin(latDeg * RAD);
    var w = 1 - E2 * s * s;
    return { M: A * (1 - E2) / Math.pow(w, 1.5), N: A / Math.sqrt(w) };
  }

  function norm360(b) { b = b % 360; return b < 0 ? b + 360 : b; }

  // Loksodromi: suunta (astetta, tosi) ja matka (m) pisteestä a pisteeseen b
  function rhumb(a, b) {
    var lat1 = a.lat * RAD, lat2 = b.lat * RAD;
    var dLon = (b.lng - a.lng) * RAD;
    if (Math.abs(dLon) > Math.PI) dLon = dLon > 0 ? dLon - 2 * Math.PI : dLon + 2 * Math.PI;
    var dPsi = Math.log(Math.tan(Math.PI / 4 + lat2 / 2) / Math.tan(Math.PI / 4 + lat1 / 2));
    var brg = norm360(Math.atan2(dLon, dPsi) / RAD);
    // matka paikallisilla kaarevuussäteillä (tarkka lyhyillä ja keskipitkillä legeillä)
    var midLat = (a.lat + b.lat) / 2;
    var r = radii(midLat);
    var dy = (b.lat - a.lat) * RAD * r.M;
    var q = Math.abs(dPsi) > 1e-12 ? (lat2 - lat1) / dPsi : Math.cos(lat1);
    var dx = dLon * r.N * q;
    return { brg: brg, dist: Math.sqrt(dx * dx + dy * dy) };
  }

  function bearing(a, b) { return rhumb(a, b).brg; }
  function distance(a, b) { return rhumb(a, b).dist; }

  // Määränpää loksodromia pitkin
  function destination(p, brgDeg, distM) {
    var r = radii(p.lat);
    var t = brgDeg * RAD;
    var dLat = distM * Math.cos(t) / r.M / RAD;
    var lat2 = p.lat + dLat;
    var r2 = radii((p.lat + lat2) / 2);
    var dLon = distM * Math.sin(t) / (r2.N * Math.cos(((p.lat + lat2) / 2) * RAD)) / RAD;
    return { lat: lat2, lng: p.lng + dLon };
  }

  // Paikallinen metritaso origon ympärillä (lyhyet etäisyydet)
  function toLocal(origin, p) {
    var r = radii(origin.lat);
    return {
      x: (p.lng - origin.lng) * RAD * r.N * Math.cos(origin.lat * RAD),
      y: (p.lat - origin.lat) * RAD * r.M
    };
  }
  function fromLocal(origin, v) {
    var r = radii(origin.lat);
    return {
      lat: origin.lat + v.y / r.M / RAD,
      lng: origin.lng + v.x / (r.N * Math.cos(origin.lat * RAD)) / RAD
    };
  }

  // Pisteen projektio janalle a–b. t = 0..1 janalla, d = kohtisuora etäisyys (m),
  // side = +1 oikealla / -1 vasemmalla kulkusuunnassa a→b, foot = kohtisuoran kantapiste suoralla
  function projectToSegment(p, a, b, clamp) {
    var A0 = { x: 0, y: 0 };
    var B0 = toLocal(a, b);
    var P0 = toLocal(a, p);
    var vx = B0.x, vy = B0.y;
    var len2 = vx * vx + vy * vy;
    var t = len2 > 0 ? ((P0.x - A0.x) * vx + (P0.y - A0.y) * vy) / len2 : 0;
    var tc = clamp ? Math.max(0, Math.min(1, t)) : t;
    var fx = vx * tc, fy = vy * tc;
    var dx = P0.x - fx, dy = P0.y - fy;
    var cross = vx * P0.y - vy * P0.x;
    return {
      t: t,
      d: Math.sqrt(dx * dx + dy * dy),
      side: cross < 0 ? 1 : -1,
      foot: fromLocal(a, { x: fx, y: fy })
    };
  }

  // ---------- muotoilu ----------
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

  function fmtDDM(v, isLat) {
    var hemi = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    var a = Math.abs(v);
    var deg = Math.floor(a);
    var min = (a - deg) * 60;
    if (min >= 59.9995) { deg += 1; min = 0; }
    var ms = min.toFixed(3).replace('.', ',');
    if (min < 10) ms = '0' + ms;
    return pad(deg, isLat ? 2 : 3) + '°' + ms + "'" + hemi;
  }
  function fmtPos(p) { return fmtDDM(p.lat, true) + ' ' + fmtDDM(p.lng, false); }

  function fmtNum(v, dec) { return v.toFixed(dec).replace('.', ','); }
  function fmtBrg(b, dec) {
    dec = dec == null ? 1 : dec;
    var v = norm360(b);
    var s = v.toFixed(dec);
    if (parseFloat(s) >= 360) s = (0).toFixed(dec);
    var intPart = s.split('.')[0];
    s = pad(intPart, 3) + (dec > 0 ? ',' + s.split('.')[1] : '');
    return s + '°';
  }
  function fmtNM(m) {
    var nm = m / NM;
    return fmtNum(nm, nm < 10 ? 2 : 1) + ' mpk';
  }
  function fmtKbl(m) { return fmtNum(m / (NM / 10), 1) + ' kbl'; }
  function fmtDuration(hours) {
    if (!isFinite(hours) || hours <= 0) return '–';
    var totalMin = Math.round(hours * 60);
    var h = Math.floor(totalMin / 60), mm = totalMin % 60;
    return h > 0 ? h + ' h ' + pad(mm, 2) + ' min' : mm + ' min';
  }

  // ---------- koordinaattien jäsennys ----------
  // Hyväksyy mm.: 61°31,234'N 023°45,678'E | 61 31.234 N 23 45.678 E |
  // N61 31.234 E023 45.678 | 61.52057, 23.76130 | 61°31'14"N 23°45'40"E
  function parsePos(text) {
    if (!text) return null;
    var s = String(text).trim().toUpperCase();
    // desimaalipilkku → piste (numero,numero), muut pilkut erottimiksi
    s = s.replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/[°º'’′"”″,;]/g, ' ');
    var tokens = s.match(/[NSEWPIL]|-?\d+(?:\.\d+)?/g);
    if (!tokens) return null;
    var groups = [], cur = { nums: [], hemi: null }, anyHemi = false;
    tokens.forEach(function (t) {
      if (/^[NSEWPIL]$/.test(t)) {
        anyHemi = true;
        var h = t === 'P' ? 'N' : t === 'I' ? 'E' : t === 'L' ? 'W' : t;
        if (cur.nums.length) { cur.hemi = cur.hemi || h; groups.push(cur); cur = { nums: [], hemi: null }; }
        else cur.hemi = h;
      } else cur.nums.push(parseFloat(t));
    });
    if (cur.nums.length) groups.push(cur);
    // ilman ilmansuuntia: jaetaan luvut puoliksi (jos ilmansuunta on annettu, yksi ryhmä on vain toinen koordinaatti)
    if (groups.length === 1 && !anyHemi && groups[0].nums.length % 2 === 0) {
      var n = groups[0].nums, half = n.length / 2;
      groups = [{ nums: n.slice(0, half), hemi: null }, { nums: n.slice(half), hemi: null }];
    }
    if (groups.length !== 2) return null;
    function toDeg(g) {
      var n = g.nums, v;
      if (n.length === 1) v = Math.abs(n[0]);
      else if (n.length === 2) v = Math.abs(n[0]) + n[1] / 60;
      else if (n.length === 3) v = Math.abs(n[0]) + n[1] / 60 + n[2] / 3600;
      else return NaN;
      var neg = n[0] < 0 || g.hemi === 'S' || g.hemi === 'W';
      return neg ? -v : v;
    }
    var g1 = groups[0], g2 = groups[1];
    var latG = g1, lonG = g2;
    if ((g1.hemi === 'E' || g1.hemi === 'W') || (g2.hemi === 'N' || g2.hemi === 'S')) { latG = g2; lonG = g1; }
    var lat = toDeg(latG), lng = toDeg(lonG);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  // Douglas–Peucker reittipisteiden harventamiseen (toleranssi metreinä)
  function simplify(points, tolM) {
    if (points.length < 3) return points.slice();
    var keep = new Array(points.length);
    keep[0] = keep[points.length - 1] = true;
    (function rec(i0, i1) {
      var maxD = 0, idx = -1;
      for (var i = i0 + 1; i < i1; i++) {
        var pr = projectToSegment(points[i], points[i0], points[i1], true);
        if (pr.d > maxD) { maxD = pr.d; idx = i; }
      }
      if (maxD > tolM && idx > 0) { keep[idx] = true; rec(i0, idx); rec(idx, i1); }
    })(0, points.length - 1);
    return points.filter(function (_, i) { return keep[i]; });
  }

  global.Geo = {
    NM: NM, rhumb: rhumb, bearing: bearing, distance: distance, destination: destination,
    projectToSegment: projectToSegment, toLocal: toLocal, fromLocal: fromLocal,
    fmtDDM: fmtDDM, fmtPos: fmtPos, fmtNum: fmtNum, fmtBrg: fmtBrg, fmtNM: fmtNM, fmtKbl: fmtKbl,
    fmtDuration: fmtDuration, parsePos: parsePos, norm360: norm360, simplify: simplify, pad: pad
  };
})(window);
