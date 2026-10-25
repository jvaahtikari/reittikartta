/* Simulaattori – kuljettajan näkymä (three.js).
 *
 * Maailmakoordinaatit: three.js (x, y, z) = (E, ylös, -N) metreinä origon suhteen (Paikka.enToWorld), järven pinta on y = 0.
 * Alus: rig-ryhmä on aluksen kääntö- ja kallistuspiste, ja runkomalli (malli: x keulaan, y SB, z ylös) on sen alla.
 * Kamera on ohjaamon sisällä ruorimiehen silmäpisteessä ja liikkuu rungon mukana, joten trimmi ja kallistus näkyvät.
 * Taivas ja vesi ovat omia varjostimiaan, ja sumu on sama kaava kummassakin kuin maastolla (FogExp2). */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka;
  var RAD = Math.PI / 180;

  // Näkymän asetukset (kaikki muutettavissa)
  var SETTINGS = {
    hfovDeg: 70,              // vaakasuuntainen katselukulma vaakanäytöllä
    portraitVfovDeg: 80,      // pystynäytöllä pystykulma, jotta vaakakulma ei kasva liian suureksi
    eyeX: 6.1, eyeY: -0.75,   // silmäpiste: x malli-m peräpeilistä, y SB positiivinen. Oletus on navigoijan paikka vasemmalla edessä (y -0,75)
    helmEyeY: 0.75,           // ruorimiehen paikka oikealla edessä (asetus, valitaan eyeY:ksi)
    floorZ: 1.55,             // ohjaamon lattia köliviivasta (hull_offsets.json)
    eyeStandM: 1.65, eyeSitM: 1.25,   // silmä lattian yläpuolella seisten ja istuen
    pivotX: 5.0,              // aluksen kääntöpiste malli-x
    waterlineZ: 0.78,         // vesiviivan korkeus köliviivasta kääntöpisteen kohdalla (syväys perässä 0,942 ja keulassa 0,615)
    fogDensity: 0.000075,     // FogExp2 (näkyvyys noin 20 km)
    maxDist: 8000,
    pixelBudgetMp: 0.55,      // piirtopuskurin pikselien enimmäismäärä (miljoonaa), tarkentuu kuvanopeuden mukaan
    pixelMinMp: 0.1, pixelMaxMp: 1.4,
    bobPitchDeg: 0.35, bobRollDeg: 0.5, bobHeaveM: 0.04   // pieni aallokko nopeudessa
  };

  var GLSL_SKY = [
    'uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunGlow;',
    'vec3 skyCol(vec3 d){',
    '  float e = clamp(d.y, 0.0, 1.0);',
    '  vec3 c = mix(uHorizon, uZenith, pow(e, 0.42));',
    '  float s = max(dot(d, uSunDir), 0.0);',
    '  c += uSunColor * (pow(s, 5.0) * 0.20 * uSunGlow + pow(s, 60.0) * 0.30 * uSunGlow + pow(s, 3000.0) * 6.0 * uSunGlow);',
    '  return c;',
    '}'
  ].join('\n');

  function skyMaterial(U) {
    return new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: GLSL_SKY + '\nvarying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir)), 1.0); }'
    });
  }
  function waterMaterial(U) {
    return new THREE.ShaderMaterial({
      uniforms: U, fog: false,
      vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: GLSL_SKY + [
        'uniform float uTime; uniform vec3 uDeep; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uDay;',
        'varying vec3 vW; varying float vDepth;',
        'void main(){',
        '  vec2 p = vW.xz; float t = uTime; float dist = length(cameraPosition - vW);',
        '  float fade = 1.0 / (1.0 + dist * 0.004);',
        '  vec2 g = vec2(0.0);',
        '  g += vec2(0.80, 0.60) * 0.022 * cos(dot(vec2(0.80, 0.60), p) * 0.55 + t * 1.10);',
        '  g += vec2(-0.55, 0.83) * 0.016 * cos(dot(vec2(-0.55, 0.83), p) * 1.30 + t * 1.55);',
        '  g += (vec2(0.30, -0.95) * 0.011 * cos(dot(vec2(0.30, -0.95), p) * 3.10 + t * 2.20)) * (0.2 + 0.8 * fade);',
        '  g += (vec2(-0.95, -0.30) * 0.007 * cos(dot(vec2(-0.95, -0.30), p) * 7.30 + t * 3.10)) * fade * fade;',
        '  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float nv = max(dot(n, v), 0.0);',
        '  float fr = 0.03 + 0.97 * pow(1.0 - nv, 5.0);',
        '  vec3 r = reflect(-v, n); r.y = abs(r.y);',
        '  vec3 refl = skyCol(r);',
        '  vec3 body = uDeep * (0.25 + 0.75 * uDay) + uZenith * 0.10 * uDay;',
        '  vec3 c = mix(body, refl, clamp(fr * 0.95, 0.0, 1.0));',
        '  float f = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));',
        '  c = mix(c, uFogColor, clamp(f, 0.0, 1.0));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
  }

  // Auringon paikka (korkeus ja todellinen atsimuutti, aste). Yksinkertainen tähtitieteellinen kaava, tarkkuus noin 0,1 astetta.
  function sunPosition(ms, latDeg, lonDeg) {
    var n = ms / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, eps = (23.439 - 0.0000004 * n) * RAD;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (18.697374558 + 24.06570982441908 * n) % 24; if (gmst < 0) gmst += 24;
    var ha = (gmst * 15 + lonDeg) * RAD - ra, lat = latDeg * RAD;
    var el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    return { elevDeg: el / RAD, azDeg: ((az / RAD) % 360 + 360) % 360 };
  }

  function create(container, opts) {
    opts = opts || {};
    var S = {}; for (var k in SETTINGS) S[k] = SETTINGS[k];
    if (opts.settings) for (var k2 in opts.settings) S[k2] = opts.settings[k2];
    var canvas = document.createElement('canvas'); canvas.className = 'view3d-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    container.appendChild(canvas);
    var veil = document.createElement('div'); veil.className = 'view3d-veil';
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0';
    container.appendChild(veil);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    renderer.setClearColor(0xcfdce8, 1);
    renderer.info.autoReset = false;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, 1, 0.25, 40000);
    camera.rotation.order = 'YXZ';

    // ---- valot, taivas, vesi ----
    var hemi = new THREE.HemisphereLight(0xdfeaf5, 0x6f7a5c, 0.62); scene.add(hemi);
    var sunL = new THREE.DirectionalLight(0xfff2d8, 0.62); scene.add(sunL); scene.add(sunL.target);
    var U = {
      uHorizon: { value: new THREE.Color('#cfe0ee') }, uZenith: { value: new THREE.Color('#4a86c7') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff2d8') }, uSunGlow: { value: 1 },
      uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1c4c66') }, uFogColor: { value: new THREE.Color('#cfe0ee') }, uFogDensity: { value: S.fogDensity }, uDay: { value: 1 }
    };
    var sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), skyMaterial(U));
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
    var water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), waterMaterial(U));
    water.rotation.x = -Math.PI / 2; water.frustumCulled = false; water.renderOrder = -5; scene.add(water);
    scene.fog = new THREE.FogExp2(0xcfe0ee, S.fogDensity);

    // ---- maasto ----
    var terrain = root.Maasto.create(scene, { buildings: opts.buildings });
    var aids3d = root.Merkit3D.create(scene, { groundAt: function (x, y) { return terrain.heightAt(x, y, true); } }), landmarks = root.Maamerkit3D.create(scene);
    // ---- alus ----
    var runko = root.Runko.build(THREE, root.Runko.DATA, { interior: true, merge: true });
    // Suorituskyky: rungon PBR-materiaalit (MeshStandardMaterial) vaihdetaan Lambert-materiaaleiksi, koska ohjelmistopiirrossa ja heikoilla puhelimilla
    // PBR-varjostin hidastaa kuvaa moninkertaisesti eikä ulkoasussa ole eroa tasaisilla pinnoilla.
    runko.boat.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var m = o.material;
      if (m.isMeshStandardMaterial) {
        var l = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null, vertexColors: m.vertexColors, side: m.side, transparent: m.transparent, opacity: m.opacity, emissive: m.emissive || new THREE.Color(0) });
        if (m.name) l.name = m.name; o.material = l; m.dispose();
      }
    });
    var rig = new THREE.Group(); rig.rotation.order = 'YZX'; scene.add(rig);
    runko.boat.position.set(-S.pivotX, -S.waterlineZ, 0); rig.add(runko.boat);
    // sisätilan täytevalo: ohjaamon punainen pinta saa hieman omaa kirkkautta, koska sisätilassa ei ole erillistä valaistusta
    runko.boat.traverse(function (o) { if (o.isMesh && o.material && o.material.color && o.material.color.getHexString() === 'd8402a') { o.material.emissive = o.material.color.clone().multiplyScalar(0.28); } });
    // Piirtokutsujen vähentäminen: rungon Lambert-verkot yhdistetään kahdeksi (yksipuolinen ja kaksipuolinen) verkoksi kärkivärein.
    // Ohjelmistopiirrossa ja heikoilla puhelimilla jokainen piirtokutsu maksaa, ja runkomallissa on yli 40 materiaalia.
    (function mergeBoat() {
      var bp = runko.boat.position.clone(); runko.boat.position.set(0, 0, 0); runko.boat.updateMatrixWorld(true);
      var buckets = { 0: [], 2: [] }, drop = [];
      runko.boat.traverse(function (o) {
        if (!o.isMesh || !o.material || !o.material.isMeshLambertMaterial || o.material.map || o.material.transparent || !o.visible) return;
        buckets[o.material.side === THREE.DoubleSide ? 2 : 0].push(o); drop.push(o);
      });
      [0, 2].forEach(function (side) {
        var list = buckets[side]; if (!list.length) return;
        var n = 0; list.forEach(function (o) { var g = o.geometry; n += g.index ? g.index.count : g.attributes.position.count; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), k = 0, v = new THREE.Vector3(), nm = new THREE.Matrix3();
        list.forEach(function (o) {
          var g = o.geometry, P3 = g.attributes.position, N3 = g.attributes.normal, idx = g.index, cnt = idx ? idx.count : P3.count, c = o.material.color, e = o.material.emissive;
          var r = Math.min(1, c.r + (e ? e.r : 0)), gg = Math.min(1, c.g + (e ? e.g : 0)), b = Math.min(1, c.b + (e ? e.b : 0));
          nm.getNormalMatrix(o.matrixWorld);
          for (var i = 0; i < cnt; i++) {
            var vi = idx ? idx.getX(i) : i;
            v.fromBufferAttribute(P3, vi).applyMatrix4(o.matrixWorld); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
            if (N3) { v.fromBufferAttribute(N3, vi).applyMatrix3(nm).normalize(); nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z; }
            col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = b; k++;
          }
        });
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.computeBoundingSphere();
        var m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: side === 2 ? THREE.DoubleSide : THREE.FrontSide }));
        m.name = 'runko_yhdistetty_' + side; m.frustumCulled = false; runko.boat.add(m);
      });
      drop.forEach(function (o) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); });
      runko.boat.position.copy(bp); runko.boat.updateMatrixWorld(true);
    })();
    var seated = false;
    function eyeZ() { return S.floorZ + (seated ? S.eyeSitM : S.eyeStandM); }
    rig.add(camera);
    function placeCamera() { camera.position.set(S.eyeX - S.pivotX, eyeZ() - S.waterlineZ, S.eyeY); }
    placeCamera();

    // ---- tila ----
    var gaze = 0, gazeCmd = 0, w = 1, h = 1, dpr = Math.min(root.devicePixelRatio || 1, 3), pixelMp = S.pixelBudgetMp;
    var sun = { elevDeg: 45, azDeg: 180 }, sunDirW = new THREE.Vector3(0, 1, 0), simMs = Date.now();
    var frames = [], lastT = 0, bobT = 0, camPitchDeg = 0;
    var extra = [];     // lisäobjektit, joilla on rebase()
    var freeCam = false;
    // Vapaa kamera testikuviin ja purkuun (maailmakoordinaatit: x = E, y = ylös, z = -N)
    function setFree(pos, look, fov) {
      if (!freeCam) { rig.remove(camera); scene.add(camera); camera.rotation.order = 'XYZ'; freeCam = true; }
      camera.position.set(pos[0], pos[1], pos[2]); camera.up.set(0, 1, 0); camera.lookAt(look[0], look[1], look[2]);
      if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
    function clearFree() { if (freeCam) { scene.remove(camera); rig.add(camera); camera.rotation.order = 'YXZ'; freeCam = false; placeCamera(); updateFov(); } }

    function setSize(cw, ch) {
      w = Math.max(1, cw); h = Math.max(1, ch);
      applyPixelRatio();
      updateFov();
    }
    function applyPixelRatio() {
      var scale = Math.min(dpr, Math.sqrt(pixelMp * 1e6 / (w * h)));
      scale = Math.max(0.25, scale);
      renderer.setPixelRatio(scale);
      renderer.setSize(w, h, false);
    }
    function updateFov() {
      var asp = w / h, v;
      if (asp >= 1) v = 2 * Math.atan(Math.tan(S.hfovDeg * RAD / 2) / asp) / RAD; else v = S.portraitVfovDeg;
      camera.fov = v; camera.aspect = asp; camera.updateProjectionMatrix();
    }
    function setPixelBudget(mp) { pixelMp = Math.max(S.pixelMinMp, Math.min(S.pixelMaxMp, mp)); applyPixelRatio(); }
    function getPixelBudget() { return pixelMp; }

    function setSimTime(ms) {
      simMs = ms;
      var s = sun = sunPosition(ms, 61.5, 23.77);
      var e = s.elevDeg;
      var day = Math.min(1, Math.max(0, (e + 2) / 14));          // 0 yöllä ja 1 yli 12 asteen korkeudella
      var gridAz = P.trueToGrid(s.azDeg, 0, 0);
      var a = gridAz * RAD, ce = Math.cos(Math.max(e, -5) * RAD);
      sunDirW.set(Math.sin(a) * ce, Math.sin(Math.max(e, -5) * RAD), -Math.cos(a) * ce).normalize();
      U.uSunDir.value.copy(sunDirW);
      // värit auringon korkeuden mukaan (matalalla aurinko punertaa)
      var warm = Math.max(0, 1 - e / 22);
      var hor = new THREE.Color('#cfe0ee').lerp(new THREE.Color('#f0cfa5'), Math.min(1, warm * 0.8)).multiplyScalar(0.25 + 0.75 * day);
      var zen = new THREE.Color('#3f78b8').lerp(new THREE.Color('#5d78a8'), Math.min(1, warm * 0.5)).multiplyScalar(0.18 + 0.82 * day);
      U.uHorizon.value.copy(hor); U.uZenith.value.copy(zen); U.uFogColor.value.copy(hor);
      U.uDay.value = day; U.uSunGlow.value = Math.min(1, Math.max(0, (e + 1.5) / 6));
      var sc = new THREE.Color('#fff4de').lerp(new THREE.Color('#ffb070'), Math.min(1, warm));
      U.uSunColor.value.copy(sc); sunL.color.copy(sc);
      sunL.intensity = 0.15 + 0.55 * day * Math.min(1, Math.max(0, e / 12 + 0.3));
      hemi.intensity = 0.28 + 0.38 * day;
      hemi.color.copy(zen).lerp(new THREE.Color('#ffffff'), 0.65);
      scene.fog.color.copy(hor);
      renderer.setClearColor(hor, 1);
    }
    function sunScreen() {
      // auringon paikka kuvassa ja katseen suunta: päivän sumennus vastavalossa
      var v = sunDirW.clone().multiplyScalar(1000).add(camera.getWorldPosition(new THREE.Vector3())).project(camera);
      var dir = camera.getWorldDirection(new THREE.Vector3()), d = dir.dot(sunDirW);
      return { x: (v.x * 0.5 + 0.5) * 100, y: (1 - (v.y * 0.5 + 0.5)) * 100, front: v.z < 1 && d > 0, dot: d };
    }

    // ---- kuvan päivitys ----
    function setGaze(deg) { gazeCmd = Math.max(-90, Math.min(90, deg)); }
    function getGaze() { return gazeCmd; }
    function setSeat(sit) { seated = !!sit; placeCamera(); }
    function setEye(x, y) { S.eyeX = x; S.eyeY = y; placeCamera(); }

    function render(st, dtReal) {
      var t0 = performance.now();
      var dt = Math.min(0.2, dtReal || 0.016);
      bobT += dt;
      // aluksen asento
      var spd = st.v / 0.514444 / 35, sp = Math.min(1, spd);
      var bobP = Math.sin(bobT * 2.3) * S.bobPitchDeg * sp + Math.sin(bobT * 5.1) * S.bobPitchDeg * 0.4 * sp;
      var bobR = Math.sin(bobT * 1.7 + 1) * S.bobRollDeg * Math.min(1, 0.25 + sp);
      var heave = Math.sin(bobT * 2.0) * S.bobHeaveM * (0.3 + sp);
      rig.position.set(st.x, heave, -st.y);
      var yaw = Math.PI / 2 - st.hdg * RAD;
      rig.rotation.set((st.roll + bobR) * RAD, yaw, (st.trim + bobP) * RAD);
      // katse
      gaze += (gazeCmd - gaze) * Math.min(1, dt * 8);
      if (!freeCam) camera.rotation.set(camPitchDeg * RAD, -Math.PI / 2 - gaze * RAD, 0);
      rig.updateMatrixWorld(true);
      // vesi ja taivas seuraavat kameraa
      var cp = camera.getWorldPosition(new THREE.Vector3());
      water.position.set(cp.x, 0, cp.z); sky.position.copy(cp);
      U.uTime.value += dt;
      terrain.setBoat(st.x, st.y); aids3d.sync(st.x, st.y);
      aids3d.setPixel(2 * Math.tan(camera.fov * RAD / 2) / Math.max(1, renderer.domElement.height));
      // vastavalon sumennus
      var ss = sunScreen();
      if (sun.elevDeg > -2) {
        var gl = Math.max(0, ss.dot - 0.55) / 0.45, a = Math.min(0.5, gl * gl * 0.55) * Math.min(1, Math.max(0, sun.elevDeg / 10));
        veil.style.opacity = a.toFixed(3);
        veil.style.background = 'radial-gradient(circle at ' + ss.x.toFixed(1) + '% ' + ss.y.toFixed(1) + '%, rgba(255,246,222,0.95), rgba(255,246,222,0.35) 45%, rgba(255,246,222,0.12) 100%)';
      } else veil.style.opacity = 0;
      renderer.info.reset();
      renderer.render(scene, camera);
      var t1 = performance.now();
      frames.push(t1 - t0); if (frames.length > 240) frames.shift();
      return t1 - t0;
    }
    function rendererStats() {
      var i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frames: frames.length };
    }
    function frameStats() {
      if (!frames.length) return { median: 0, p95: 0, n: 0 };
      var s = frames.slice().sort(function (a, b) { return a - b; });
      return { median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], n: s.length };
    }
    function resetFrameStats() { frames = []; }
    function rebase() { terrain.rebase(); aids3d.rebase(); landmarks.rebase(); extra.forEach(function (e) { if (e.rebase) e.rebase(); }); }
    function addExtra(o) { extra.push(o); return o; }

    return {
      scene: scene, camera: camera, renderer: renderer, rig: rig, boat: runko, terrain: terrain, aids: aids3d, landmarks: landmarks, canvas: canvas, settings: S, uniforms: U, veil: veil,
      setSize: setSize, render: render, setSimTime: setSimTime, setGaze: setGaze, getGaze: getGaze, setSeat: setSeat, setEye: setEye,
      setPixelBudget: setPixelBudget, getPixelBudget: getPixelBudget, rendererStats: rendererStats, frameStats: frameStats, resetFrameStats: resetFrameStats,
      rebase: rebase, addExtra: addExtra, sunScreen: sunScreen, sun: function () { return sun; },
      setFree: setFree, clearFree: clearFree,
      setCameraPitch: function (d) { camPitchDeg = d; }, isSeated: function () { return seated; }
    };
  }

  var api = { create: create, SETTINGS: SETTINGS, sunPosition: sunPosition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Nakyma = api;
})(typeof window !== 'undefined' ? window : globalThis);
