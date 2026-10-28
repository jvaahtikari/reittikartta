/* Simulaattori – yön valot (vaihe 4, 28.10.2026): loistojen ja valoviittojen valot valotunnusten mukaan sekä aluksen valonheitin.
 *
 * Loistot: Merkit3D.valot() -lista (Väyläviraston turvalaiterekisteri: valotunnus, valon korkeus, sektorit, näkyvyys). Jokainen valo piirretään hehkuvana
 * pisteenä (additiivinen, syvyystesti päällä, joten maasto peittää valon). Väri on katsojan suunnassa olevan sektorin väri, ja sektorin ulkopuolelta
 * valoa ei näy. Sektorit ovat merikartan tapaan suuntia merelta valoa kohti. Kirkkaus himmenee näkyvyysetäisyyden mukaan ja hämärän mukaan
 * (pimeys 0 päivällä, 1 yöllä). Rytmi tulkitaan valotunnuksesta (rytmi()).
 *
 * Valonheitin: kohdevalo (THREE.SpotLight) ohjaamon katolla, suunta keulasta (aste, positiivinen oikealle). Valaisee Lambert-materiaalit (maasto,
 * rakennukset, veneet, sillat, laiturit), vesi saa valaistun alueen omassa shaderissaan (nakyma.js uSpot*), ja keila näkyy ilmassa heikkona kartiona.
 * Valo on aina näkymässä (voimakkuus 0, kun pois), jotta valojen määrän muutos ei käännä varjostimia uudelleen kesken ajon.
 *
 * Moduuli toimii selaimessa (window.Valot3D) ja Nodessa (module.exports, vain valotunnusten tulkinta). */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;

  // ---------- valotunnus ----------
  // Tulkitsee esim. "VQ (3) 5 s", "Fl 5 s", "Q", "Iso 4 s", "Oc (2) 8 s", "LFl 10 s", "F", "Al WR". Palauttaa { laji, ryhma, jakso } (jakso sekunteina).
  function tulkitse(txt) {
    var s = String(txt || '').replace(/,/g, '.').trim();
    var m = /^(?:Al\.?\s*)?(F|LFl|Fl|IVQ|IQ|VQ|UQ|Q|Iso|Oc|Mo)\b\s*(?:\(([^)]*)\))?\s*(?:[A-Za-z]{1,3}\.?\s+)?(\d+(?:\.\d+)?)?\s*s?/i.exec(s);
    if (!m) return { laji: 'F', ryhma: 1, jakso: 0 };
    var laji = m[1].toUpperCase().replace('LFL', 'LFl').replace('FL', 'Fl').replace('ISO', 'Iso').replace('OC', 'Oc').replace('MO', 'Mo');
    var ryhma = 1, g = m[2] ? m[2].split('+').map(function (x) { return parseInt(x, 10) || 0; }).reduce(function (a, b) { return a + b; }, 0) : 1;
    if (g > 0 && laji !== 'Mo') ryhma = g;
    return { laji: laji, ryhma: ryhma, jakso: m[3] ? Number(m[3]) : 0 };
  }
  // Valon tila hetkellä t (s): 0 ... 1, reunat pehmennetty hieman
  function rytmi(tun, t) {
    var L = tun.laji, n = tun.ryhma, P = tun.jakso, ph;
    function pulssit(kesto, vali) {   // n välähdystä (kesto, väli) jakson alussa, loppu pimeää
      var x = ph, jaks = kesto + vali;
      for (var i = 0; i < n; i++) { if (x < kesto) return 1; if (x < jaks) return 0; x -= jaks; }
      return 0;
    }
    if (L === 'F') return 1;
    if (L === 'Q' || L === 'VQ' || L === 'UQ' || L === 'IQ' || L === 'IVQ') {
      var f = L === 'Q' || L === 'IQ' ? 1 : L === 'UQ' ? 4 : 2, jj = 1 / f, on = jj * 0.42;
      if (n > 1 || P > 0) {             // ryhmä tai jakso: n välähdystä, sitten pimeää jakson loppuun (IQ: jatkuva, mutta tauko jakson lopussa)
        var Pq = P || (n * jj + 2);
        ph = ((t % Pq) + Pq) % Pq;
        if (L === 'IQ' || L === 'IVQ') { var dark = Math.max(0.5, Pq * 0.25); return ph > Pq - dark ? 0 : (ph % jj) < on ? 1 : 0; }
        return pulssit(on, jj - on);
      }
      ph = ((t % jj) + jj) % jj; return ph < on ? 1 : 0;
    }
    if (L === 'Iso') { var Pi = P || 2; ph = ((t % Pi) + Pi) % Pi; return ph < Pi / 2 ? 1 : 0; }
    if (L === 'Oc') {                    // pimennys: valo on päällä suurimman osan jaksosta, n lyhyttä pimennystä
      var Po = P || 4; ph = ((t % Po) + Po) % Po;
      var d = Math.min(1, Po * 0.2), x2 = ph;
      for (var k = 0; k < n; k++) { if (x2 < d) return 0; if (x2 < d * 2) return 1; x2 -= d * 2; }
      return 1;
    }
    if (L === 'LFl') { var Pl = P || 10; ph = ((t % Pl) + Pl) % Pl; return pulssit(2, Math.max(1, Pl / Math.max(1, n) - 2)); }
    if (L === 'Mo') { var Pm = P || 8; ph = ((t % Pm) + Pm) % Pm; return ph < 0.4 || (ph > 0.8 && ph < 2.0) ? 1 : 0; }
    // Fl (välähdys): 0,5 s tai jakson mukaan lyhyempi
    var Pf = P || Math.max(2, n * 1.5 + 1); ph = ((t % Pf) + Pf) % Pf;
    var kesto = Math.min(0.6, Pf / (n * 3)); return pulssit(kesto, Math.max(0.6, kesto * 2));
  }
  // Sektorin valinta katsojan suunnasta: suunta merelta valoa kohti (tosisuunta, aste)
  function sektori(sek, suunta) {
    if (!sek || !sek.length) return null;
    for (var i = 0; i < sek.length; i++) {
      var a = ((Number(sek[i].alku) % 360) + 360) % 360, b = ((Number(sek[i].loppu) % 360) + 360) % 360, s = ((suunta % 360) + 360) % 360;
      if (a === b ? true : a < b ? s >= a && s <= b : s >= a || s <= b) return sek[i];
    }
    return false;
  }

  // ---------- selain: valot ja valonheitin ----------
  function create(view, opts) {
    opts = opts || {};
    var THREE = root.THREE, P = root.Paikka, scene = view.scene, U = view.uniforms;
    var S = { valoPx: 15, heitinKulma: 5.5, heitinMatka: 900, heitinI: 3.2, heitinX: 1.6, heitinY: 2.35, keilaPituus: 320, keilaAlfa: 0.075 };
    if (opts.settings) for (var k in opts.settings) S[k] = opts.settings[k];

    // loistot: pistepilvi, jonka attribuutit päivitetään joka kuvalla
    var maxN = 400, pos = new Float32Array(maxN * 3), col = new Float32Array(maxN * 3), alf = new Float32Array(maxN);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aI', new THREE.BufferAttribute(alf, 1));
    geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: S.valoPx }, uDpr: { value: 1 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      vertexShader: 'attribute vec3 aColor; attribute float aI; uniform float uPx; uniform float uDpr; varying vec3 vC; varying float vI; void main(){ vC = aColor; vI = aI; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aI > 0.001 ? uPx * uDpr * (0.55 + 0.45 * aI) : 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vI; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float core = smoothstep(0.35, 0.0, r); float halo = pow(1.0 - r, 2.2) * 0.55; gl_FragColor = vec4(vC * (core * 1.6 + halo) * vI + vec3(core * 0.6 * vI), 1.0); }'
    });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 50; scene.add(pts);
    var lista = [], listaSrc = null, vaihe = [];

    // valonheitin aluksen katolla (rig: +x keula, +y ylös, +z oikea puoli)
    var spot = new THREE.SpotLight(0xfff1d6, 0, S.heitinMatka, S.heitinKulma * RAD, 0.45, 1);
    spot.position.set(S.heitinX, S.heitinY, 0); view.rig.add(spot);
    var tgt = new THREE.Object3D(); view.rig.add(tgt); spot.target = tgt;
    // näkyvä keila: kartio kärki valossa, avautuu valon suuntaan
    var keilaGeo = new THREE.ConeGeometry(Math.tan(S.heitinKulma * RAD) * S.keilaPituus, S.keilaPituus, 28, 1, true);
    keilaGeo.translate(0, -S.keilaPituus / 2, 0); keilaGeo.rotateZ(Math.PI / 2);   // kärki origossa, kartio +x-suuntaan
    var keilaMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uL: { value: S.keilaPituus } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
      vertexShader: 'varying float vX; varying vec3 vN; varying vec3 vP; void main(){ vX = position.x; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; uniform float uL; varying float vX; varying vec3 vN; varying vec3 vP; void main(){ float r = abs(dot(normalize(vN), normalize(-vP))); float a = uA * r * r * pow(1.0 - clamp(vX / uL, 0.0, 1.0), 1.6) * smoothstep(0.0, 6.0, vX); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, 1.0); }'
    });
    var keila = new THREE.Mesh(keilaGeo, keilaMat); keila.frustumCulled = false; keila.renderOrder = 60; keila.position.copy(spot.position); view.rig.add(keila);
    var heitin = { on: false, kulma: 0, korotus: -1.5 };
    var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

    function asetaHeitin(on) { heitin.on = !!on; }
    function asetaSuunta(deg) { heitin.kulma = Math.max(-170, Math.min(170, Number(deg) || 0)); }

    function rakennaLista() {
      var v = view.aids.valot ? view.aids.valot() : [];
      if (v === listaSrc) return;
      listaSrc = v; lista = (v || []).slice(0, maxN); vaihe = [];
      lista.forEach(function (l, i) {
        var h = l.valoKorkeus != null ? Number(l.valoKorkeus) : 3;
        pos[i * 3] = l.x; pos[i * 3 + 1] = (l.maanpinta || 0) + (h > 0 ? h : 3); pos[i * 3 + 2] = -l.y;
        l._tun = tulkitse(l.valotunnus);
        var s = String(l.numero || l.nimi || i); var hsh = 0; for (var c = 0; c < s.length; c++) hsh = (hsh * 31 + s.charCodeAt(c)) % 9973;
        vaihe[i] = (hsh / 9973) * 30;     // toistettava vaihe, etteivät kaikki valot vilku samaan tahtiin
      });
      geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, lista.length);
    }

    // Päivitys joka kuvalla: st = aluksen tila (x, y, hdg ruutusuuntana), simSek = simulaatioaika (s), pimeys 0 ... 1
    function paivita(st, simSek, pimeys) {
      rakennaLista();
      var cam = view.camera.getWorldPosition(tmpA), n = lista.length;
      mat.uniforms.uDpr.value = view.renderer.getPixelRatio();
      for (var i = 0; i < n; i++) {
        var l = lista[i], dx = cam.x - pos[i * 3], dy = -cam.z - (-pos[i * 3 + 2]), d = Math.hypot(dx, dy);
        var I = 0, r = 1, g = 1, b = 0.8;
        if (pimeys > 0.01) {
          var range = (Number(l.nakyvyys) > 0 ? Number(l.nakyvyys) : 3) * 1852 * 1.2;
          var vis = 1 - Math.min(1, d / range); vis = vis > 0 ? Math.sqrt(vis) : 0;
          if (vis > 0) {
            // suunta merelta valoa kohti (tosisuunta): katsojasta valoon
            var gridBrg = Math.atan2(-dx, -dy) / RAD, tos = P ? P.gridToTrue(gridBrg, pos[i * 3], -pos[i * 3 + 2]) : gridBrg;
            var sk = sektori(l.sektorit, tos);
            if (sk !== false) {
              var rgb = sk && sk.rgb ? sk.rgb : (l.sektorit && l.sektorit[0] && l.sektorit[0].rgb) || [1, 0.95, 0.75];
              r = rgb[0] > 1 ? rgb[0] / 255 : rgb[0]; g = rgb[1] > 1 ? rgb[1] / 255 : rgb[1]; b = rgb[2] > 1 ? rgb[2] / 255 : rgb[2];
              I = rytmi(l._tun, simSek + vaihe[i]) * vis * pimeys;
            }
          }
        }
        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; alf[i] = I;
      }
      geo.attributes.aColor.needsUpdate = true; geo.attributes.aI.needsUpdate = true;
      pts.visible = pimeys > 0.01 && n > 0;
      // valonheitin
      var a = heitin.kulma * RAD, e = heitin.korotus * RAD;
      tgt.position.set(S.heitinX + Math.cos(a) * Math.cos(e) * 100, S.heitinY + Math.sin(e) * 100, Math.sin(a) * Math.cos(e) * 100);
      spot.intensity = heitin.on ? S.heitinI : 0;
      keila.rotation.set(0, -a, e); keilaMat.uniforms.uA.value = heitin.on ? S.keilaAlfa * Math.max(0.15, pimeys) : 0; keila.visible = heitin.on;
      // vesi: valonheittimen paikka ja suunta maailmassa
      if (U && U.uSpotI) {
        view.rig.updateMatrixWorld(true);
        spot.getWorldPosition(tmpA); tgt.getWorldPosition(tmpB);
        U.uSpotPos.value.copy(tmpA); U.uSpotDir.value.copy(tmpB.sub(tmpA).normalize());
        U.uSpotCos.value = Math.cos(S.heitinKulma * RAD); U.uSpotI.value = heitin.on ? 1 : 0;
      }
    }
    function rebase() { listaSrc = null; }
    function tila() { return { valoja: lista.length, palaa: alf.reduce(function (s, v) { return s + (v > 0.05 ? 1 : 0); }, 0), heitin: { on: heitin.on, kulma: heitin.kulma } }; }
    return { paivita: paivita, asetaHeitin: asetaHeitin, asetaSuunta: asetaSuunta, heitin: function () { return { on: heitin.on, kulma: heitin.kulma }; }, rebase: rebase, tila: tila, settings: S };
  }

  var api = { tulkitse: tulkitse, rytmi: rytmi, sektori: sektori, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Valot3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
