/* Simulaattori – Google 3D -kerroksen kalibrointityökalu (vaihe 3n, kehitysvalinta).
 *
 * Käynnistys: osoitteeseen lisätään ?kalibrointi=1 (esimerkiksi simulaattori.html?kalibrointi=1&alku=1&harjoitus=free). Kun Google 3D on valittuna (valikko, Ulkonäkymä),
 * oikeaan yläkulmaan tulee kalibrointipaneeli. Työkalu piirtää omaan kerrokseen ristit tunnettuihin pisteisiin (Näsinneulan huippu, Tampellan piippu, Siilinkarin loisto,
 * Naistenlahden aallonmurtajan päät ja voimalaitoksen piippu) oman kameramallin mukaisiin kohtiin ja näyttää niiden lasketut suunnat, korkeuskulmat ja kuvakoordinaatit.
 * Kun ristit eivät osu Googlen kuvan kohteisiin, käyttäjä valitsee kohteen, painaa Osoita ja napauttaa kohteen oikean paikan Googlen kuvassa. Kahdesta kolmeen osoitusta riittää
 * sovittamaan oman kameran suunnan, nousukulman ja kuvakulman Googlen todelliseen kameraan (pienimmän neliösumman sovitus, google3d.js fitCalibration). Tulos tallentuu selaimen muistiin
 * (sim.googleKalib) ja tulee heti käyttöön. Hyväksymisraja on 0,5 astetta vaakasuunnassa ja 0,3 astetta pystysuunnassa.
 * Työkalu ei lähetä mitään verkkoon. */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  function f1(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ','); }
  var VIEWPOINTS = [
    { id: 'B', nimi: 'Mustalahden edusta (Näsinneula, Tampella)', e: 327330, n: 6824000, hdgTrue: 184.9 },
    { id: 'A', nimi: 'Naistenlahden satama (voimalaitos, aallonmurtaja)', e: 328010, n: 6823830, hdgTrue: 114.9 },
    { id: 'C', nimi: 'Siilinkarin ohitus (loisto)', e: 327895, n: 6824881, hdgTrue: 102.9 }
  ];
  var LIM_H = 0.5, LIM_V = 0.3;

  function attach(ctx) {
    var G = ctx.G, doc = ctx.doc, Gg = root.Google3D;
    var st = { sel: Gg.CAL_TARGETS[0].id, pick: false, samples: [], fit: null, lastTxt: '' };
    var css = doc.createElement('style');
    css.textContent = '#kalPanel{position:fixed;right:6px;top:44px;width:340px;max-width:calc(100vw - 12px);max-height:70vh;overflow:auto;z-index:60;background:rgba(10,20,30,.93);color:#e8f0f6;border:1px solid #4a6a85;border-radius:10px;padding:8px 10px;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace}' +
      '#kalPanel h3{margin:0 0 4px;font:700 13px sans-serif}#kalPanel button{min-height:36px;margin:2px 2px 2px 0;padding:2px 8px;border-radius:8px;border:1px solid #6b8aa5;background:#16324a;color:#fff;font:600 12px sans-serif}' +
      '#kalPanel button.on{background:#b3541e}#kalPanel table{border-collapse:collapse;width:100%}#kalPanel td,#kalPanel th{padding:1px 3px;text-align:left;vertical-align:top}#kalPanel .ok{color:#7be08a}#kalPanel .bad{color:#ff8f80}' +
      '#kalCross{position:absolute;left:0;top:0;width:100%;height:100%;z-index:24;pointer-events:none}#kalCross.pick{pointer-events:auto;cursor:crosshair}#kalPanel[hidden]{display:none}';
    doc.head.appendChild(css);
    var panel = doc.createElement('div'); panel.id = 'kalPanel'; panel.hidden = true; doc.body.appendChild(panel);
    var cv = doc.createElement('canvas'); cv.id = 'kalCross'; doc.getElementById('pane3d').appendChild(cv);

    function camera() {
      var S = G.S, v = G.view, s = v.settings, hr = S.hdg * RAD, fw = s.eyeX - s.pivotX, sb = s.eyeY;
      var look = S.hdg + v.getGazeNow(), r = cv.getBoundingClientRect(), cal = Gg.getCalib();
      return {
        eyeE: S.x + G.origin.e + Math.sin(hr) * fw + Math.cos(hr) * sb, eyeN: S.y + G.origin.n + Math.cos(hr) * fw - Math.sin(hr) * sb, eyeZ: 95.5 + v.eyeAboveWaterM() + (cal.altOffsetM || 0),
        look: look, vfov: v.vfovRequested(), w: r.width, h: r.height, cal: cal
      };
    }
    function targetAngles(c, t) { return Gg.viewAngles(t.e - c.eyeE, t.n - c.eyeN, t.z - c.eyeZ); }
    function predict(c, a, useCal) {
      var cal = useCal ? c.cal : { dHeadingDeg: 0, dPitchDeg: 0, tanScale: 1 };
      return Gg.projectRay(a.az, a.el, { heading: c.look + cal.dHeadingDeg, pitch: cal.dPitchDeg, vfov: c.vfov, tanScale: cal.tanScale, w: c.w, h: c.h });
    }
    function googleInfo() {
      var m = G.g3 && G.g3.element ? G.g3.element() : null; if (!m) return 'Googlen kartta ei ole luotu';
      var o = [];
      ['fov', 'tilt', 'heading', 'range'].forEach(function (k) { try { if (m[k] != null) o.push(k + ' ' + f1(+m[k], 2)); } catch (e) {} });
      try { var cp = m.cameraPosition; if (cp && cp.altitude != null) o.push('kamera korkeus ' + f1(cp.altitude, 2) + ' m'); } catch (e) {}
      return o.join(', ') || 'ei luettavia ominaisuuksia';
    }

    function draw() {
      var on = G.ext === 'google' && G.mode === 'run';
      panel.hidden = !on; cv.style.display = on ? 'block' : 'none';
      if (!on) return;
      var r = cv.getBoundingClientRect(), dpr = 1;
      if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
      var g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      var c = camera(), rows = [];
      Gg.CAL_TARGETS.forEach(function (t) {
        var a = targetAngles(c, t), p = predict(c, a, true), vis = p && p.u >= 0 && p.u <= c.w && p.v >= 0 && p.v <= c.h;
        rows.push({ t: t, a: a, p: p, vis: vis });
        if (vis) {
          var sel = t.id === st.sel;
          g.strokeStyle = sel ? '#ffd400' : '#ff3b30'; g.lineWidth = sel ? 2.5 : 1.5;
          g.beginPath(); g.moveTo(p.u - 14, p.v); g.lineTo(p.u + 14, p.v); g.moveTo(p.u, p.v - 14); g.lineTo(p.u, p.v + 14); g.stroke();
          g.font = '12px sans-serif'; g.fillStyle = sel ? '#ffd400' : '#ff9a90'; g.fillText(t.nimi, p.u + 8, p.v - 8);
        }
      });
      st.samples.forEach(function (s) { if (s.cur) { g.strokeStyle = '#4cd964'; g.lineWidth = 2; g.beginPath(); g.arc(s.u, s.v, 7, 0, 7); g.stroke(); } });
      var txt = renderPanel(c, rows);
      if (txt !== st.lastTxt) { st.lastTxt = txt; panel.innerHTML = txt; bind(); }
    }

    function renderPanel(c, rows) {
      var h = ['<h3>Google 3D -kalibrointi</h3>'];
      h.push('<div>Googlen kamera: ' + googleInfo() + '</div>');
      var cal = c.cal; h.push('<div>Käytössä: suunta ' + f1(cal.dHeadingDeg, 2) + '°, nousu ' + f1(cal.dPitchDeg, 2) + '°, kuvakulman kerroin ' + f1(cal.tanScale, 4) + ', korkeuskorjaus ' + f1(cal.altOffsetM || 0, 2) + ' m</div>');
      h.push('<div>Googlen kameran korkeus: ' + [-1, -0.5, -0.1, 0.1, 0.5, 1].map(function (d) { return '<button data-alt="' + d + '">' + (d > 0 ? '+' : '') + String(d).replace('.', ',') + ' m</button>'; }).join('') + '</div>');
      h.push('<div>Katselupisteet: ' + VIEWPOINTS.map(function (v) { return '<button data-vp="' + v.id + '" title="' + v.nimi + '">' + v.id + '</button>'; }).join('') + ' ' + VIEWPOINTS.map(function (v) { return v.id + ' ' + v.nimi.split(' (')[0]; }).join(', ') + '</div>');
      h.push('<table><tr><th></th><th>Kohde</th><th>Suunta</th><th>Kork.</th><th>Väli</th><th>Kuva (x, y)</th></tr>');
      rows.forEach(function (rw) {
        h.push('<tr><td><input type="radio" name="kalSel" data-t="' + rw.t.id + '"' + (rw.t.id === st.sel ? ' checked' : '') + '></td><td>' + rw.t.nimi + '</td><td>' + f1((((rw.a.az + (G.S ? G.S.conv : 0)) % 360) + 360) % 360, 2) + '°</td><td>' + f1(rw.a.el, 2) + '°</td><td>' + Math.round(rw.a.dist) + ' m</td><td>' +
          (rw.p ? (rw.vis ? Math.round(rw.p.u) + ', ' + Math.round(rw.p.v) : 'kuvan ulkopuolella') : 'takana') + '</td></tr>');
      });
      h.push('</table>');
      h.push('<div><button id="kalTurn">Käännä kohti valittua kohdetta</button></div>');
      h.push('<div><button id="kalPick" class="' + (st.pick ? 'on' : '') + '">' + (st.pick ? 'Napauta kohteen paikkaa kuvassa' : 'Osoita valittu kohde') + '</button><button id="kalFit">Sovita (' + st.samples.length + ' osoitusta)</button><button id="kalClr">Tyhjennä osoitukset</button></div>');
      if (st.fit) {
        var f = st.fit, okAll = true;
        h.push('<div>Sovitus: suunta ' + f1(f.dHeadingDeg, 2) + '°, nousu ' + f1(f.dPitchDeg, 2) + '°, kuvakulman kerroin ' + f1(f.tanScale, 4) + (f.fittedScale ? '' : ' (ei sovitettu, yksi osoitus)') + ', keskivirhe ' + f1(f.rmsPx, 1) + ' px</div>');
        h.push('<table><tr><th>Kohde</th><th>Ennen vaaka/pysty</th><th>Jälkeen vaaka/pysty</th></tr>');
        f.residuals.forEach(function (rs, i) {
          var ok = Math.abs(rs.fitHorDeg) <= LIM_H && Math.abs(rs.fitVerDeg) <= LIM_V; if (!ok) okAll = false;
          h.push('<tr><td>' + st.samples[i].name + '</td><td>' + f1(rs.rawHorDeg, 2) + '° / ' + f1(rs.rawVerDeg, 2) + '°</td><td class="' + (ok ? 'ok' : 'bad') + '">' + f1(rs.fitHorDeg, 2) + '° / ' + f1(rs.fitVerDeg, 2) + '°</td></tr>');
        });
        h.push('</table><div class="' + (okAll ? 'ok' : 'bad') + '">' + (okAll ? 'Sovitus täyttää rajat (vaaka 0,5°, pysty 0,3°).' : 'Sovitus ei täytä rajoja (vaaka 0,5°, pysty 0,3°). Lisää osoituksia tai tarkista kohteen paikka.') + '</div>');
        h.push('<div><button id="kalSave">Ota käyttöön ja tallenna</button></div>');
      }
      h.push('<div><button id="kalReset">Nollaa kalibrointi</button><button id="kalHide">Piilota ristit</button></div>');
      return h.join('');
    }

    function bind() {
      Array.prototype.forEach.call(panel.querySelectorAll('[data-t]'), function (el) { el.addEventListener('change', function () { st.sel = el.getAttribute('data-t'); st.lastTxt = ''; }); });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-alt]'), function (el) { el.addEventListener('click', function () { adjAlt(parseFloat(el.getAttribute('data-alt'))); }); });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-vp]'), function (el) { el.addEventListener('click', function () { goTo(el.getAttribute('data-vp')); }); });
      var q = function (id, fn) { var e = panel.querySelector('#' + id); if (e) e.addEventListener('click', fn); };
      q('kalPick', function () { st.pick = !st.pick; cv.classList.toggle('pick', st.pick); st.lastTxt = ''; });
      q('kalTurn', function () { turnTo(st.sel); });
      q('kalFit', function () { runFit(); });
      q('kalClr', function () { st.samples = []; st.fit = null; st.lastTxt = ''; });
      q('kalSave', function () { if (!st.fit) return; var cal = Gg.getCalib(); Gg.setCalib({ dHeadingDeg: st.fit.dHeadingDeg, dPitchDeg: st.fit.dPitchDeg, tanScale: st.fit.tanScale, altOffsetM: cal.altOffsetM }); G.view.setCalib(Gg.getCalib()); st.samples = []; st.fit = null; st.lastTxt = ''; if (ctx.toast) ctx.toast('Kalibrointi tallennettu', 1800); });
      q('kalReset', function () { Gg.setCalib(null); G.view.setCalib(Gg.getCalib()); st.fit = null; st.lastTxt = ''; });
      q('kalHide', function () { cv.style.opacity = cv.style.opacity === '0' ? '1' : '0'; });
    }

    function adjAlt(d) {   // Googlen kameran korkeuskorjaus: siirtää Googlen maisemaa pystysuunnassa oman veden suhteen (rantaviivan korkeus)
      var cal = Gg.getCalib();
      Gg.setCalib({ dHeadingDeg: cal.dHeadingDeg, dPitchDeg: cal.dPitchDeg, tanScale: cal.tanScale, altOffsetM: Math.round(((cal.altOffsetM || 0) + d) * 100) / 100 });
      G.view.setCalib(Gg.getCalib()); st.lastTxt = '';
    }
    function goTo(id) {
      var vp = VIEWPOINTS.filter(function (v) { return v.id === id; })[0], S = G.S; if (!vp) return;
      var hdgGrid = vp.hdgTrue - S.conv;
      if (!G.paused) { var pb = doc.getElementById('pauseBtn'); if (pb) pb.click(); }
      S.x = vp.e - G.origin.e; S.y = vp.n - G.origin.n; S.hdg = hdgGrid; S.orderHdg = hdgGrid; if (S.hmHdg !== undefined) S.hmHdg = hdgGrid; S.v = 0; S.orderSpeedKn = 0;
      G.view.setGaze(0); st.samples = []; st.fit = null; st.lastTxt = '';
    }

    function turnTo(id) {   // aluksen kokka suoraan kohti valittua kohdetta (katse 0), jotta risti osuu kuvan keskelle
      var t = Gg.CAL_TARGETS.filter(function (x) { return x.id === id; })[0], S = G.S; if (!t) return;
      var a = targetAngles(camera(), t), g = a.az;
      S.hdg = g; S.orderHdg = g; if (S.hmHdg !== undefined) S.hmHdg = g;
      G.view.setGaze(0); st.lastTxt = '';
    }
    cv.addEventListener('pointerdown', function (ev) {
      if (!st.pick) return;
      var r = cv.getBoundingClientRect(), c = camera(), t = Gg.CAL_TARGETS.filter(function (x) { return x.id === st.sel; })[0], a = targetAngles(c, t);
      st.samples = st.samples.filter(function (s) { return s.id !== t.id; });
      st.samples.push({ id: t.id, name: t.nimi, az: a.az, el: a.el, heading: c.look, pitch: 0, vfov: c.vfov, w: c.w, h: c.h, u: ev.clientX - r.left, v: ev.clientY - r.top, cur: true });
      st.pick = false; cv.classList.remove('pick'); st.fit = null; st.lastTxt = '';
      ev.preventDefault(); ev.stopPropagation();
    });
    function runFit() {
      if (!st.samples.length) return;
      st.fit = Gg.fitCalibration(st.samples.map(function (s) { return { az: s.az, el: s.el, heading: s.heading, pitch: s.pitch, vfov: s.vfov, w: s.w, h: s.h, u: s.u, v: s.v }; }));
      st.lastTxt = '';
    }
    root.__kal = { state: st, camera: camera, targetAngles: targetAngles, predict: predict, runFit: runFit, goTo: goTo, turnTo: turnTo, adjAlt: adjAlt };
    setInterval(draw, 120);
  }
  root.Kalibrointi = { attach: attach, VIEWPOINTS: VIEWPOINTS };
})(window);
