/* Simulaattori – kuljettajan näkymä (three.js).
 *
 * Maailmakoordinaatit: three.js (x, y, z) = (E, ylös, -N) metreinä origon suhteen (Paikka.enToWorld), järven pinta on y = 0.
 * Alus: rig-ryhmä on aluksen kääntö- ja kallistuspiste, ja runkomalli (malli: x keulaan, y SB, z ylös) on sen alla.
 * Kamera on ohjaamon sisällä ruorimiehen silmäpisteessä ja liikkuu rungon mukana, joten trimmi ja kallistus näkyvät.
 * Taivas ja vesi ovat omia varjostimiaan, ja sumu on sama kaava kummassakin kuin maastolla (FogExp2).
 *
 * Vaihe 3n, kerrostila (setOverlay): Google 3D on näkymän alin kerros ja tämä kangas on sen päällä läpinäkyvällä taustalla. Silloin taivas, maastoväri, puusto, laiturit, sillat ja maamerkit
 * eivät piirry (Google näyttää ne), vesi piirretään vain vesipolygoneista (vesimaski3d.js) ja maastoverkko ja rakennukset piirretään vain syvyyspuskuriin (peitto) tai, jos sumukerros on päällä,
 * sumun värisenä ja etäisyydestä riippuvalla peittävyydellä. Kamera irrotetaan rungon keinunnasta ja asetetaan samaan paikkaan ja suuntaan kuin Googlen kamera. */
(function (root) {
  'use strict';
  var THREE = root.THREE, P = root.Paikka;
  var RAD = Math.PI / 180;

  // Näkymän asetukset (kaikki muutettavissa)
  var SETTINGS = {
    hfovDeg: 100,             // vaakasuuntainen katselukulma leveällä ruudulla (asetus). Ihmisen käytännön näkökenttä on tätäkin laajempi, 100° on kompromissi vääristymän kanssa
    hfovCompactDeg: 75,       // vaakasuuntainen katselukulma pienessä tai puhelimen ruudussa, jossa ruutu ei ole leveä (asetus, 70-80°)
    portraitVfovDeg: 80,      // pystyruudussa (leveys pienempi kuin korkeus) pystykulma, jotta vaakakulma ei kasva liian suureksi (asetus, 70-80°)
    eyeX: 6.1, eyeY: -0.75,   // silmäpiste: x malli-m peräpeilistä, y SB positiivinen. Oletus on navigoijan paikka vasemmalla edessä (y -0,75)
    helmEyeY: 0.75,           // ruorimiehen paikka oikealla edessä (asetus, valitaan eyeY:ksi)
    floorZ: 1.55,             // ohjaamon lattia köliviivasta (hull_offsets.json)
    eyeStandZ: 3.50, eyeSitZ: 3.45,   // silmän korkeus köliviivasta seisten ja istuen (asetuksia). Tilaajan toivoma seisten-arvo 3,65 m on ikkunan yläreunan (window_top_z 3,62 m) yläpuolella eli katon sisällä, joten oletus on 3,50 m (pää juuri katon alla). Istuen silmä on tuulilasin alareunan (3,0 m) yläpuolella
    pivotX: 5.0,              // aluksen kääntöpiste malli-x
    waterlineZ: 0.78,         // vesiviivan korkeus köliviivasta kääntöpisteen kohdalla (syväys perässä 0,942 ja keulassa 0,615)
    fogDensity: 0.000139,     // ilmaperspektiivi: läpäisy exp(-tiheys x etäisyys), 5 km:n päässä kontrasti noin puolet (0,50), 15 km:n päässä noin 0,12, eli kaukomaasto erottuu vielä siluettina (vaihe 3j)
    exposure: 1.0,            // tonemappingin valotus (ACES Filmic)
    windFromDeg: 225, windSpeed: 3,   // tuuli: suunta, josta tuulee (tosisuunta, oletus lounas) ja nopeus (m/s). Vesi lukee nämä, vaihe 4 voi muuttaa asetuksia (setWind)
    cloudCover: 0.55,         // pilvien peitto 0...1 (kevyt grafiikka ei piirrä pilviä), sää asettaa (setWeather)
    weather: 'puoli',         // sää (vaihe 4): 'selkea', 'puoli' tai 'pilvi'. Pilvisyys himmentää päivän auringon ja yön kuun ja tähdet
    moonMode: 'auto',         // kuu: 'auto' = kalenterin mukaan (vaihe ja korkeus), 'taysi' = täysikuu korkealla, 'ei' = ei kuuta
    maxDist: 8000,
    pixelBudgetMp: 0.55,      // piirtopuskurin pikselien enimmäismäärä (miljoonaa), tarkentuu kuvanopeuden mukaan
    pixelMinMp: 0.1, pixelMaxMp: 1.4,
    bobPitchDeg: 0.35, bobRollDeg: 0.5, bobHeaveM: 0.04,  // pieni aallokko nopeudessa
    // kiikari (vaihe 3g): 7x50-kiikarin vaakakuvakulma 7 astetta ja suurennus 7 (näkyvyysrajat ja katseen herkkyys), käden tärinän amplitudi asteina
    // (taajuus noin 1-2 Hz, kasvaa nopeuden ja aallokon mukana) sekä pystykatseen enimmäiskulmat (kiikari pitää vaakatason vakaana, pystykatsetta voi säätää vetämällä)
    kiikariHfovDeg: 7, kiikariSuurennus: 7, kiikariTarinaDeg: 0.15, kiikariPitchMin: -8, kiikariPitchMax: 12
  };

  // ---- värinhallinta (vaihe 3j) ----
  // Ulostulo on sRGB ja tonemapping ACES Filmic. Materiaalien värit (heksat) ja kärkivärit on määritelty sRGB-arvoina, joten Lambert-varjostin muuntaa ne lineaarisiksi
  // (diffuse, emissive ja kärkivärit pow 2,2) ennen valaistusta. Sumu lasketaan three.js r128:ssa tonemappingin ja koodauksen jälkeen eli näyttöavaruudessa, ja sen kaava
  // vaihdetaan muotoon 1 - exp(-tiheys x etäisyys), jotta kaukomaasto ei häviä kokonaan (5 km: kontrasti noin 0,5, 15 km: noin 0,12). Taivas ja vesi piirretään suoraan näyttöavaruuteen.
  (function patchThree() {
    if (!THREE || THREE.__nakyma3j) return; THREE.__nakyma3j = true;
    var SC = THREE.ShaderChunk, SL = THREE.ShaderLib;
    SL.lambert.fragmentShader = SL.lambert.fragmentShader
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * ( diffuse * ( diffuse * 0.305306011 + 0.682171111 ) + 0.012522878 ), opacity );')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * ( emissive * ( emissive * 0.305306011 + 0.682171111 ) + 0.012522878 );');
    // Ohjelmistopiirtäjässä (SwiftShader) pow on kallis: sRGB-muunnokset korvataan monikulmiolla (sRGB -> lineaarinen) ja neliöjuurisarjalla (lineaarinen -> sRGB), virhe alle 1 %
    SC.encodings_pars_fragment = SC.encodings_pars_fragment
      .replace(/vec4 sRGBToLinear\( in vec4 value \) \{[\s\S]*?\n\}/, 'vec4 sRGBToLinear( in vec4 value ) {\n\treturn vec4( value.rgb * ( value.rgb * ( value.rgb * 0.305306011 + 0.682171111 ) + 0.012522878 ), value.a );\n}')
      .replace(/vec4 LinearTosRGB\( in vec4 value \) \{[\s\S]*?\n\}/, 'vec4 LinearTosRGB( in vec4 value ) {\n\tvec3 v = max( value.rgb, vec3( 0.0 ) ); vec3 s1 = sqrt( v ); vec3 s2 = sqrt( s1 ); vec3 s3 = sqrt( s2 );\n\treturn vec4( 0.662002687 * s1 + 0.684122060 * s2 - 0.323583601 * s3 - 0.0225411470 * v, value.a );\n}');
    SC.color_vertex = SC.color_vertex + '\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n\tvColor.rgb = vColor.rgb * ( vColor.rgb * ( vColor.rgb * 0.305306011 + 0.682171111 ) + 0.012522878 );\n#endif';
    SC.fog_fragment = SC.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );', 'float fogFactor = 1.0 - exp( - fogDensity * fogDepth );');
  })();
  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function smooth01(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }
  // Avainkehykset auringon korkeuden (aste) mukaan: taivaan ja sumun värit (näyttöavaruus), auringon väri, auringon ja hemisfäärivalon voimakkuus (lineaarinen) ja pilvien värit
  var SKY_KEYS = [
    { e: -9, hor: '#161d30', zen: '#05070f', sun: '#ff9a4a', sunI: 0.00, hemiSky: '#2b3a5c', hemiGnd: '#1a1d22', hemiI: 0.10, cloudLit: '#2a3248', cloudShade: '#10141f' },
    { e: -3, hor: '#4a4a66', zen: '#12203f', sun: '#ff8a3a', sunI: 0.03, hemiSky: '#47557a', hemiGnd: '#2b2724', hemiI: 0.20, cloudLit: '#7a6a7e', cloudShade: '#2a2c40' },
    { e: 1.5, hor: '#f2b27a', zen: '#3b5f9a', sun: '#ff9b4a', sunI: 0.34, hemiSky: '#8fa3c8', hemiGnd: '#5a4a3c', hemiI: 0.34, cloudLit: '#ffc890', cloudShade: '#7a6878' },
    { e: 8, hor: '#f1d4a8', zen: '#4a7fbd', sun: '#ffc27a', sunI: 0.62, hemiSky: '#a8c0de', hemiGnd: '#6a6048', hemiI: 0.42, cloudLit: '#ffe6c4', cloudShade: '#98a4b8' },
    { e: 20, hor: '#e4e6dc', zen: '#3472bd', sun: '#ffe2b8', sunI: 0.86, hemiSky: '#b4cde8', hemiGnd: '#6e6b4c', hemiI: 0.48, cloudLit: '#fffaf0', cloudShade: '#a9b9cf' },
    { e: 45, hor: '#dfe6e8', zen: '#2b6bba', sun: '#fff0d8', sunI: 0.98, hemiSky: '#b9d2ee', hemiGnd: '#6e6f4e', hemiI: 0.52, cloudLit: '#ffffff', cloudShade: '#b0c0d6' }
  ];
  var KEYC = null;
  function keyColors() {
    return SKY_KEYS.map(function (k) {
    return { e: k.e, hor: new THREE.Color(k.hor), zen: new THREE.Color(k.zen), sun: new THREE.Color(k.sun), sunI: k.sunI, hemiSky: lin(k.hemiSky), hemiGnd: lin(k.hemiGnd), hemiI: k.hemiI, cloudLit: new THREE.Color(k.cloudLit), cloudShade: new THREE.Color(k.cloudShade) };
    });
  }
  // Auringon korkeuden mukaan interpoloitu taivasmalli
  function skyModel(e) {
    if (!KEYC) KEYC = keyColors();
    var i = 0; while (i < KEYC.length - 2 && e > KEYC[i + 1].e) i++;
    var a = KEYC[i], b = KEYC[i + 1], f = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
    function mc(x, y) { return x.clone().lerp(y, f); }
    return { hor: mc(a.hor, b.hor), zen: mc(a.zen, b.zen), sun: mc(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * f, hemiSky: mc(a.hemiSky, b.hemiSky), hemiGnd: mc(a.hemiGnd, b.hemiGnd), hemiI: a.hemiI + (b.hemiI - a.hemiI) * f, cloudLit: mc(a.cloudLit, b.cloudLit), cloudShade: mc(a.cloudShade, b.cloudShade) };
  }

  // Tileable arvokohina (fbm) pilvitekstuuriksi: 4 oktaavia, 256 x 256, punainen kanava. Generoidaan koodilla, ei tiedostoja.
  function makeCloudTexture() {
    var N = 256, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    var g = cv.getContext('2d'), id = g.createImageData(N, N), d = id.data, seed = 1337;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var layers = [], oct = [4, 8, 16, 32], amp = [0.50, 0.27, 0.15, 0.08], o, i, j;
    for (o = 0; o < oct.length; o++) { var L = new Float32Array(oct[o] * oct[o]); for (i = 0; i < L.length; i++) L[i] = rnd(); layers.push(L); }
    function sm(t) { return t * t * (3 - 2 * t); }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var v = 0;
      for (o = 0; o < oct.length; o++) {
        var n = oct[o], fx = i / N * n, fy = j / N * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, Lq = layers[o];
        x0 %= n; y0 %= n;
        v += amp[o] * ((Lq[y0 * n + x0] * (1 - tx) + Lq[y0 * n + x1] * tx) * (1 - ty) + (Lq[y1 * n + x0] * (1 - tx) + Lq[y1 * n + x1] * tx) * ty);
      }
      var c = Math.max(0, Math.min(255, Math.round(v * 255 / 1.0))), q = (j * N + i) * 4; d[q] = c; d[q + 1] = c; d[q + 2] = c; d[q + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    var tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Taivas: liukuväri horisontista (vaalea, hieman kellertävä) lakeen, auringon kehä ja hohto sekä kevyet pilvet (tekstuurikohina, hidas liike). Kaikki näyttöavaruudessa.
  var GLSL_SKY = [
    'uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunGlow;',
    'uniform sampler2D uCloudTex; uniform float uCloud; uniform float uTime; uniform vec3 uCloudLit; uniform vec3 uCloudShade;',
    'uniform vec3 uMoonDir; uniform float uMoonI; uniform float uStars;',
    'float cloudCov(vec2 uv, float t){',
    '  float n1 = texture2D(uCloudTex, uv + vec2(t * 0.0042, t * 0.0016)).r;',
    '  float n2 = texture2D(uCloudTex, uv * 2.7 + vec2(0.37 - t * 0.0025, 0.11 + t * 0.0012)).r;',
    '  return n1 * 0.72 + n2 * 0.28;',
    '}',
    'vec3 skyBase(vec3 d){',
    '  float e = clamp(d.y, 0.0, 1.0);',
    '  vec3 c = mix(uHorizon, uZenith, mix(sqrt(e), sqrt(sqrt(e)), 0.16));',
    '  float s = max(dot(d, uSunDir), 0.0);',
    '  float s2 = s * s, s3 = s2 * s, s6 = s3 * s3, s12 = s6 * s6, s24 = s12 * s12, s48 = s24 * s24, s70 = s48 * s12 * s6 * s3 * s;',
    '  float s140 = s70 * s70, s280 = s140 * s140, s700 = s280 * s280 * s140;',
    '  c += uSunColor * (s6 * 0.16 + s70 * 0.26 + s700 * 0.30) * uSunGlow;',
    '  c = mix(c, uSunColor * 1.7, smoothstep(0.99992, 0.99997, s) * uSunGlow);',
    // kuu: kiekko (hieman todellista suurempi, jotta näkyy pienellä ruudulla) ja heikko kehä
    '  if (uMoonI > 0.0) { float m = max(dot(d, uMoonDir), 0.0); float m2 = m * m, m4 = m2 * m2, m8 = m4 * m4, m16 = m8 * m8, m64 = m16 * m16 * m16 * m16;',
    '    c += vec3(0.80, 0.84, 0.95) * uMoonI * (smoothstep(0.99993, 0.99996, m) * 0.9 + m64 * m64 * m16 * 0.05); }',
    '  return c;',
    '}',
    // Kevyt versio vesiheijastukseen: yksi pilvitekstuurihaku, ei auringon puoleista valaistusta (aaltoilevassa pinnassa yksityiskohta ei näy)
    'vec3 skyColW(vec3 d){',
    '  vec3 c = skyBase(d);',
    '  if (uCloud > 0.0 && d.y > 0.012) {',
    '    vec2 uv = d.xz / (d.y + 0.20) * 0.62;',
    '    float cv = texture2D(uCloudTex, uv + vec2(uTime * 0.0042, uTime * 0.0016)).r * 0.72 + 0.14;',
    '    float thr = 0.60 - 0.22 * uCloud;',
    '    float a = smoothstep(thr, thr + 0.16, cv) * smoothstep(0.012, 0.16, d.y) * 0.92;',
    '    c = mix(c, mix(uCloudShade, uCloudLit, 0.62), a);',
    '  }',
    '  return c;',
    '}',
    'vec3 skyCol(vec3 d){',
    '  vec3 c = skyBase(d);',
    // tähdet selkeänä yönä: suunnan ruudukosta satunnaiset pisteet, kirkkaus vaihtelee
    '  if (uStars > 0.0 && d.y > 0.02) { vec3 q = d * 420.0; vec3 cell = floor(q); float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
    '    if (h > 0.9965) { vec3 f = fract(q) - 0.5; float st = smoothstep(0.32, 0.0, length(f)) * (h - 0.9965) * 285.0; c += vec3(0.9, 0.93, 1.0) * st * uStars * smoothstep(0.02, 0.15, d.y); } }',
    '  if (uCloud > 0.0 && d.y > 0.012) {',
    '    vec2 uv = d.xz / (d.y + 0.20) * 0.62;',
    '    float t = uTime, cv = cloudCov(uv, t);',
    '    float thr = 0.60 - 0.22 * uCloud;',
    '    float a = smoothstep(thr, thr + 0.16, cv) * smoothstep(0.012, 0.16, d.y) * 0.92;',
    '    vec2 toSun = uSunDir.xz * 0.045;',
    '    float lit = clamp(0.62 + (cv - cloudCov(uv + toSun, t)) * 4.5, 0.0, 1.0);',
    '    vec3 cc = mix(uCloudShade, uCloudLit, lit);',
    '    float s = max(dot(d, uSunDir), 0.0);',
    '    float q2 = s * s, q4 = q2 * q2, q8 = q4 * q4, q20 = q8 * q8 * q4;',
    '    cc += uSunColor * q20 * 0.25 * uSunGlow * (1.0 - a * 0.4);',
    '    c = mix(c, cc, a);',
    '  }',
    '  return c;',
    '}'
  ].join('\n');

  function skyMaterial(U) {
    return new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: GLSL_SKY + '\nvarying vec3 vDir; void main(){ vec3 c = skyCol(normalize(vDir)); c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; gl_FragColor = vec4(c, 1.0); }'
    });
  }
  // Aaltojen normaalikartta: tileable fbm-korkeuskenttä (256 x 256, aallonpituudet 0,4 ... 3 m kun kuvio toistuu 12 m:n välein), josta lasketaan kaltevuudet (R ja G, 0,5 = tasainen).
  function makeWaveTexture() {
    var N = 256, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    var g = cv.getContext('2d'), id = g.createImageData(N, N), d = id.data, seed = 90210, h = new Float32Array(N * N), o, i, j;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var oct = [4, 8, 16, 32], amp = [1, 0.62, 0.38, 0.22], L = [];
    for (o = 0; o < oct.length; o++) { var A = new Float32Array(oct[o] * oct[o]); for (i = 0; i < A.length; i++) A[i] = rnd(); L.push(A); }
    function sm(t) { return t * t * (3 - 2 * t); }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var v = 0;
      for (o = 0; o < oct.length; o++) {
        var n = oct[o], fx = i / N * n, fy = j / N * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, Q = L[o];
        x0 %= n; y0 %= n;
        var q = (Q[y0 * n + x0] * (1 - tx) + Q[y0 * n + x1] * tx) * (1 - ty) + (Q[y1 * n + x0] * (1 - tx) + Q[y1 * n + x1] * tx) * ty;
        v += amp[o] * (o >= 2 ? 1 - Math.abs(2 * q - 1) : q);   // pienemmät aallot teräväharjaisia
      }
      h[j * N + i] = v;
    }
    var mx = 1e-6, sx = new Float32Array(N * N), sy = new Float32Array(N * N);
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var ip = (i + 1) % N, im = (i + N - 1) % N, jp = (j + 1) % N, jm = (j + N - 1) % N;
      var gx = (h[j * N + ip] - h[j * N + im]) * 0.5, gy = (h[jp * N + i] - h[jm * N + i]) * 0.5;
      sx[j * N + i] = gx; sy[j * N + i] = gy; mx = Math.max(mx, Math.abs(gx), Math.abs(gy));
    }
    var k = 0.5 / (mx * 0.45);   // keskimääräinen kaltevuus noin 0,2 ja huiput saturoituvat
    for (j = 0; j < N * N; j++) {
      var q2 = j * 4; d[q2] = Math.max(0, Math.min(255, Math.round(128 + sx[j] * k * 127))); d[q2 + 1] = Math.max(0, Math.min(255, Math.round(128 + sy[j] * k * 127))); d[q2 + 2] = 128; d[q2 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    var tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
    return tex;
  }

  // Vesi: Fresnel-heijastus taivaasta (ja pilvistä), auringon kimallus, kahden eri suuntiin liikkuvan kohinakerroksen normaalikartta (tuulen suunta ja voima uniformeina)
  // ja kaukana sileä pinta. full = true käyttää normaalikarttaa ja pilviheijastusta, false (kevyt grafiikka) kolmea analyyttistä aaltoa. Rantaviivan vaalea ja läpikuultava vyöhyke
  // piirretään maastosolmujen mukana (maasto.js, rantavesi), koska vesitaso on yksi suuri taso.
  function waterMaterial(U, full) {
    return new THREE.ShaderMaterial({
      uniforms: U, fog: false, toneMapped: false, defines: full ? { WATER_TEX: 1 } : {},
      vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: GLSL_SKY + [
        'uniform vec3 uDeep; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uDay;',
        'uniform sampler2D uWaveTex; uniform vec2 uWindDir; uniform float uWaveAmp;',
        'uniform vec3 uSpotPos; uniform vec3 uSpotDir; uniform float uSpotCos; uniform float uSpotI;',
        'uniform vec3 uSpotPos2; uniform vec3 uSpotDir2; uniform float uSpotI2;',
        'varying vec3 vW; varying float vDepth;',
        // valonheittimen valaisema vesi: keilan sisällä lämmin valo, joka himmenee etäisyyden mukaan, aallot välkehtivät
        'vec3 spotVesi(vec3 sP, vec3 sD, float sI, vec3 n, vec3 v){',
        '  vec3 sl = vW - sP; float sd = length(sl); float sc = dot(sl / max(sd, 0.001), sD);',
        '  if (sc <= uSpotCos) return vec3(0.0);',
        '  float edge = smoothstep(uSpotCos, uSpotCos + (1.0 - uSpotCos) * 0.45, sc);',
        '  float att = 1.0 / (1.0 + sd * sd * 0.00012);',
        '  vec3 sv = normalize(sP - vW); vec3 sh = normalize(sv + v); float sp = pow(max(dot(n, sh), 0.0), 60.0);',
        '  return vec3(1.0, 0.94, 0.82) * sI * edge * att * (0.10 + 1.6 * sp);',
        '}',
        'void main(){',
        '  vec2 p = vW.xz; float t = uTime; float dist = length(cameraPosition - vW);',
        '  float fade = 1.0 / (1.0 + dist * 0.004);',
        '  vec2 g = vec2(0.0);',
        '  g += vec2(0.80, 0.60) * 0.020 * cos(dot(vec2(0.80, 0.60), p) * 0.55 + t * 1.10);',
        '  g += vec2(-0.55, 0.83) * 0.014 * cos(dot(vec2(-0.55, 0.83), p) * 1.30 + t * 1.55);',
        '#ifdef WATER_TEX',
        '  vec2 w1 = vec2(uWindDir.x * 0.940 - uWindDir.y * 0.342, uWindDir.x * 0.342 + uWindDir.y * 0.940);',
        '  vec2 w2 = vec2(uWindDir.x * 0.866 + uWindDir.y * 0.500, -uWindDir.x * 0.500 + uWindDir.y * 0.866);',
        '  if (dist < 5500.0) {',
        '    vec2 s1 = texture2D(uWaveTex, p * 0.0833 - w1 * (t * 0.125)).rg * 2.0 - 1.0;',
        '    vec2 s2 = texture2D(uWaveTex, p * 0.2900 - w2 * (t * 0.215) + vec2(0.31, 0.57)).rg * 2.0 - 1.0;',
        '    g += (s1 * 0.050 + s2 * 0.032 * (0.25 + 0.75 * fade)) * uWaveAmp * (0.15 + 0.85 * fade) * (1.0 - smoothstep(1500.0, 5500.0, dist));',
        '  }',
        '#else',
        '  g += (vec2(0.30, -0.95) * 0.011 * cos(dot(vec2(0.30, -0.95), p) * 3.10 + t * 2.20)) * (0.2 + 0.8 * fade) * uWaveAmp;',
        '  g += (vec2(-0.95, -0.30) * 0.007 * cos(dot(vec2(-0.95, -0.30), p) * 7.30 + t * 3.10)) * fade * fade * uWaveAmp;',
        '#endif',
        '  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float nv = max(dot(n, v), 0.0);',
        '  float om = 1.0 - nv, om2 = om * om;',
        '  float fr = 0.02 + 0.98 * om2 * om2 * om;',
        '  vec3 r = reflect(-v, n); r.y = abs(r.y);',
        '  vec3 refl = skyColW(r);',
        '  vec3 body = uDeep * (0.25 + 0.75 * uDay) + uZenith * 0.10 * uDay;',
        '  vec3 c = mix(body, refl, clamp(fr, 0.0, 1.0));',
        '  vec3 h = normalize(uSunDir + v);',
        '  float nh = max(dot(n, h), 0.0);',
        '  float glit = 0.0;',
        '  if (nh > 0.9) {',
        '    float n2 = nh * nh, n4 = n2 * n2, n8 = n4 * n4, n16 = n8 * n8, n32 = n16 * n16, n64 = n32 * n32;',
        '    float n90 = n64 * n16 * n8 * n2, n180 = n90 * n90, n360 = n180 * n180, n630 = n360 * n180 * n90, n650 = n630 * n16 * n4;',
        '    glit = n650 * 2.2 + n90 * 0.18;',
        '  }',
        '  c += uSunColor * glit * uSunGlow * smoothstep(0.0, 0.08, uSunDir.y) * (0.35 + 0.65 * smoothstep(0.0, 0.5, fr * 4.0)) * (1.0 - smoothstep(2000.0, 6000.0, dist));',
        '  if (uSpotI > 0.0) c += spotVesi(uSpotPos, uSpotDir, uSpotI, n, v);',
        '  if (uSpotI2 > 0.0) c += spotVesi(uSpotPos2, uSpotDir2, uSpotI2, n, v);',
        '  float f = 1.0 - exp(-vDepth * uFogDensity);',
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

  // Kuun paikka ja valaistu osuus (vaihe 4, 28.10.2026). Lyhennetty kuurata (päätermit), tarkkuus noin 1 aste, riittää valaistukseen ja kiekon paikkaan.
  // Valaistu osuus auringon ja kuun kulmaerosta (sama kaava kuin SunCalc-kirjastossa).
  function moonPosition(ms, latDeg, lonDeg) {
    var d = ms / 86400000 + 2440587.5 - 2451545.0, eps = 23.4397 * RAD;
    var L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.229350 * d) * RAD;
    var l = L + 6.289 * RAD * Math.sin(M), b = 5.128 * RAD * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
    var ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)), dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24; if (gmst < 0) gmst += 24;
    var ha = (gmst * 15 + lonDeg) * RAD - ra, lat = latDeg * RAD;
    var el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    // aurinko samalla hetkellä (rektaskensio ja deklinaatio)
    var g = (357.528 + 0.9856003 * d) * RAD, lam = (280.460 + 0.9856474 * d) * RAD + 1.915 * RAD * Math.sin(g) + 0.020 * RAD * Math.sin(2 * g);
    var sra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), sdec = Math.asin(Math.sin(eps) * Math.sin(lam)), sdist = 149598000;
    var phi = Math.acos(Math.max(-1, Math.min(1, Math.sin(sdec) * Math.sin(dec) + Math.cos(sdec) * Math.cos(dec) * Math.cos(sra - ra))));
    var inc = Math.atan2(sdist * Math.sin(phi), dist - sdist * Math.cos(phi));
    var waxing = Math.sin(ra - sra) > 0;
    return { elevDeg: el / RAD, azDeg: ((az / RAD) % 360 + 360) % 360, illum: (1 + Math.cos(inc)) / 2, waxing: waxing };
  }

  // Yön valoisuus (vaihe 4): kuu (vaihe x korkeus, pilvet peittävät), tähdet selkeällä ja Tampereen valojen hehku pilvien pohjasta.
  // nl on suhteessa aiempaan oletusyöhön (0,6 = ennallaan): selkeä kuuton noin 0,26, pilvinen kuuton noin 0,12, selkeä täysikuu noin 1,0.
  var WEATHER = { selkea: 0.15, puoli: 0.55, pilvi: 0.95 };
  function nightEnv(ms, cloud, moonMode) {
    var mp = moonPosition(ms, 61.5, 23.77), o = { elevDeg: mp.elevDeg, azDeg: mp.azDeg, illum: mp.illum, waxing: mp.waxing, show: mp.elevDeg > -1 ? 1 : 0 };
    if (moonMode === 'ei') { o.illum = 0; o.show = 0; o.elevDeg = -10; }
    else if (moonMode === 'taysi') { o.illum = 1; o.show = 1; if (o.elevDeg < 25) o.elevDeg = 25; }
    o.light = o.illum * smooth01(o.elevDeg / 15) * (o.show ? 1 : 0);
    var moonLight = o.light * (1 - 0.85 * cloud), nl = Math.max(0.06, 0.18 * (1 - cloud) + 0.04 + 0.04 * cloud + 0.85 * moonLight);
    return { nl: nl, moon: o, moonLight: moonLight, cloud: cloud };
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
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });   // alpha: kerrostila (vaihe 3n) tarvitsee läpinäkyvän taustan, oma näkymä piirtää kuten ennen (tausta alfa 1)
    renderer.setClearColor(0xcfdce8, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = S.exposure;
    renderer.info.autoReset = false;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, 1, 0.25, 40000);
    camera.rotation.order = 'YXZ';

    // ---- valot, taivas, vesi ----
    var hemi = new THREE.HemisphereLight(0xdfeaf5, 0x6f7a5c, 0.62); scene.add(hemi);
    var sunL = new THREE.DirectionalLight(0xfff2d8, 0.62); scene.add(sunL); scene.add(sunL.target);
    var moonL = new THREE.DirectionalLight(0xb9c8ff, 0); scene.add(moonL); scene.add(moonL.target);   // kuunvalo (vaihe 4), aina näkymässä, ettei varjostimia käännetä uudelleen
    var cloudTex = makeCloudTexture();
    var U = {
      uHorizon: { value: new THREE.Color('#cfe0ee') }, uZenith: { value: new THREE.Color('#4a86c7') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff2d8') }, uSunGlow: { value: 1 },
      uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1c4c66') }, uFogColor: { value: new THREE.Color('#cfe0ee') }, uFogDensity: { value: S.fogDensity }, uDay: { value: 1 },
      uCloudTex: { value: cloudTex }, uCloud: { value: S.cloudCover }, uWaveTex: { value: makeWaveTexture() }, uWindDir: { value: new THREE.Vector2(0.7, -0.7) }, uWaveAmp: { value: 1 }, uCloudLit: { value: new THREE.Color('#ffffff') }, uCloudShade: { value: new THREE.Color('#b0c0d6') },
      // valonheitin (vaihe 4, valot3d.js): paikka ja suunta maailmassa, keilan kosini ja päällä (1) tai pois (0)
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonI: { value: 0 }, uStars: { value: 0 },
      uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(1, 0, 0) }, uSpotCos: { value: 0.995 }, uSpotI: { value: 0 }, uSpotPos2: { value: new THREE.Vector3() }, uSpotDir2: { value: new THREE.Vector3(1, 0, 0) }, uSpotI2: { value: 0 }
    };
    var sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), skyMaterial(U));
    sky.renderOrder = 100; sky.frustumCulled = false; scene.add(sky);
    var waterFull = waterMaterial(U, true), waterLight = waterMaterial(U, false);
    var water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), waterFull);
    water.rotation.x = -Math.PI / 2; water.frustumCulled = false; water.renderOrder = -5; scene.add(water);
    scene.fog = new THREE.FogExp2(0xcfe0ee, S.fogDensity);
    // vaihe 3n: oma vesi vain vesipolygoneista (kerrostila)
    var wmask = root.Vesimaski3D ? root.Vesimaski3D.create(scene, { material: waterFull }) : null;
    // tuuli: aallot etenevät myötätuuleen, amplitudi kasvaa tuulen voiman mukana (3 m/s = 1)
    function setWind(fromDeg, speed) {
      if (fromDeg != null) S.windFromDeg = fromDeg; if (speed != null) S.windSpeed = speed;
      var gdir = P.trueToGrid(S.windFromDeg + 180, 0, 0) * RAD;
      U.uWindDir.value.set(Math.sin(gdir), -Math.cos(gdir));
      U.uWaveAmp.value = Math.min(3, Math.max(0.25, S.windSpeed / 3));
    }
    setWind();
    // grafiikan laatu (vaihe 3j): 'full' tai 'light'. Kevyt: ei pilviä, vesi ilman normaalikarttaa
    var quality = 'full';
    function setQuality(q) {
      quality = q === 'light' ? 'light' : 'full';
      var full = quality === 'full';
      water.material = full ? waterFull : waterLight; if (wmask) wmask.setMaterial(water.material);
      U.uCloud.value = full ? S.cloudCover : 0;   // (setWeather asettaa saman)
      if (terrain && terrain.setQuality) terrain.setQuality(quality);
    }

    // ---- maasto ----
    var terrain = root.Maasto.create(scene, { buildings: opts.buildings });
    var aids3d = root.Merkit3D.create(scene, { groundAt: function (x, y) { return terrain.heightAt(x, y, true); } }), landmarks = root.Maamerkit3D.create(scene);
    // laiturit, aallonmurtajat ja vesikivet (aineiston kerros vesieste), alle 1 500 m:n päässä
    var piers = root.Laiturit3D ? root.Laiturit3D.create(scene) : null;
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
    // kankaalle piirretyt tekstuurit (rungon tekstit) ovat sRGB-arvoja
    runko.boat.traverse(function (o) { if (o.isMesh && o.material && o.material.map && o.material.map.isCanvasTexture) { o.material.map.encoding = THREE.sRGBEncoding; o.material.map.needsUpdate = true; } });
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
    function eyeZ() { return seated ? S.eyeSitZ : S.eyeStandZ; }
    rig.add(camera);
    function placeCamera() { camera.position.set(S.eyeX - S.pivotX, eyeZ() - S.waterlineZ, S.eyeY); }
    placeCamera();

    // ---- kerrostila (vaihe 3n) ----
    // ov.on: Google-kerroksen päällä piirtävä tila. fogKm: sumukerroksen näkyvyys (0 = ei sumukerrosta). cal: kalibrointi (oman kameran korjaukset Googlen todelliseen käytökseen).
    var horColor = new THREE.Color(0xcfdce8);
    var ov = { on: false, fogKm: 0, cal: { dHeadingDeg: 0, dPitchDeg: 0, tanScale: 1 }, fovMin: 5, fovMax: 80, lower: 0.1, domeDist: 14000, domeElevDeg: 12, hide: { maamerkit: 1, laiturit: 0, sillat: 1 }, hidden: [] };
    ov.mat = new THREE.ShaderMaterial({
      uniforms: { uFogColor: { value: U.uFogColor.value }, uInvVis: { value: 0 }, uLower: { value: ov.lower } },
      blending: THREE.NoBlending, fog: false, toneMapped: false, colorWrite: false,
      vertexShader: 'varying vec3 vW; uniform float uLower; void main(){ vec4 w0 = modelMatrix * vec4(position, 1.0); float dd = length(w0.xz - cameraPosition.xz); vec3 p = position; if (position.y < -1.0) p.y -= dd * dd * 8.0e-7; p.y -= uLower; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uFogColor; uniform float uInvVis; varying vec3 vW; void main(){ float d = length(cameraPosition - vW); float a = 1.0 - exp(-d * uInvVis); gl_FragColor = vec4(uFogColor * a, a); }'
    });
    // taivaan sumukupu: kaukana (yli maastoaineiston) horisontin lähellä oleva sumu, kun sumukerros on päällä
    ov.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), new THREE.ShaderMaterial({
      uniforms: { uFogColor: { value: U.uFogColor.value }, uFarA: { value: 0 }, uElev: { value: ov.domeElevDeg } },
      side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: 'uniform vec3 uFogColor; uniform float uFarA; uniform float uElev; varying vec3 vDir; void main(){ float el = degrees(asin(clamp(vDir.y, -1.0, 1.0))); float a = uFarA * (1.0 - smoothstep(0.0, uElev, el)); gl_FragColor = vec4(uFogColor, a); }'
    }));
    ov.dome.frustumCulled = false; ov.dome.visible = false; ov.dome.renderOrder = 90; scene.add(ov.dome);
    function applyFog() {
      var dens = ov.on && ov.fogKm > 0 ? 1 / (ov.fogKm * 1000) : S.fogDensity;
      scene.fog.density = dens; U.uFogDensity.value = dens;
      ov.mat.uniforms.uInvVis.value = ov.on && ov.fogKm > 0 ? 1 / (ov.fogKm * 1000) : 0;
      ov.mat.colorWrite = ov.on && ov.fogKm > 0;
      ov.dome.material.uniforms.uFarA.value = ov.on && ov.fogKm > 0 ? 1 - Math.exp(-ov.domeDist / (ov.fogKm * 1000)) : 0;
      ov.dome.visible = ov.on && ov.fogKm > 0;
    }
    function layerSet(o, l) { if (o && o.layers) o.layers.set(l); }
    // kerrostilassa piirrettävät ja piilotettavat: maastoverkko ja rakennukset ovat tasolla 2 (syvyys- ja sumukierros), latvusto ja puut tasolla 3 (ei piirretä)
    function overlayLayers() {
      var i;
      if (terrain && terrain.nodes) terrain.nodes.forEach(function (n) {
        layerSet(n.mesh, 2); layerSet(n.bmesh, 2); layerSet(n.shell, 3);
        if (n.tmeshes) for (var q = 0; q < n.tmeshes.length; q++) layerSet(n.tmeshes[q], 3);
      });
      for (i = 0; i < scene.children.length; i++) { var o = scene.children[i]; if (ov.hide[o.name] || ov.hidden.indexOf(o) >= 0) layerSet(o, 1); else if (o.name && ov.hide[o.name] === 0) layerSet(o, 0); }
    }
    function restoreLayers() {
      if (terrain && terrain.nodes) terrain.nodes.forEach(function (n) {
        layerSet(n.mesh, 0); layerSet(n.bmesh, 0); layerSet(n.shell, 0);
        if (n.tmeshes) for (var q = 0; q < n.tmeshes.length; q++) layerSet(n.tmeshes[q], 0);
      });
      for (var i = 0; i < scene.children.length; i++) layerSet(scene.children[i], 0);
    }
    function overlayCamera() { return ov.on && !freeCam; }
    function setOverlay(on) {
      on = !!on; if (on === ov.on) return;
      ov.on = on;
      applyPixelRatio();
      if (on) {
        layerSet(sky, 1); layerSet(water, 1);
        if (wmask) { wmask.setMaterial(water.material); wmask.setActive(true); }
        renderer.setClearColor(0x000000, 0);
        if (!freeCam) { rig.remove(camera); scene.add(camera); camera.rotation.order = 'YXZ'; }
        veil.style.display = 'none';
      } else {
        if (wmask) wmask.setActive(false);
        restoreLayers();
        renderer.setClearColor(horColor, 1);
        if (!freeCam) { scene.remove(camera); rig.add(camera); camera.rotation.order = 'YXZ'; placeCamera(); }
        veil.style.display = '';
      }
      applyFog(); updateFov();
    }
    function setFogKm(km) { ov.fogKm = Math.max(0, +km || 0); applyFog(); }
    function setCalib(c) { c = c || {}; ov.cal.dHeadingDeg = +c.dHeadingDeg || 0; ov.cal.dPitchDeg = +c.dPitchDeg || 0; ov.cal.tanScale = (+c.tanScale > 0.3 && +c.tanScale < 3) ? +c.tanScale : 1; updateFov(); }
    function overlayHide(o) { if (ov.hidden.indexOf(o) < 0) ov.hidden.push(o); if (ov.on) layerSet(o, 1); }

    // ---- tila ----
    var gaze = 0, gazeCmd = 0, w = 1, h = 1, dpr = Math.min(root.devicePixelRatio || 1, 3), pixelMp = S.pixelBudgetMp;
    var sun = { elevDeg: 45, azDeg: 180 }, sunDirW = new THREE.Vector3(0, 1, 0), simMs = Date.now(), moonDirW = new THREE.Vector3(0, -1, 0), night = null;
    var frames = [], lastT = 0, bobT = 0, camPitchDeg = 0;
    var extra = [];     // lisäobjektit, joilla on rebase()
    // kiikari: tila (päällä, katseen ja pystykulman talteenotto) ja käden tärinä (kaksi vaimennettua värähtelijää, joita satunnaisliike ajaa)
    var tmpDir = new THREE.Vector3();
    var bino = { on: false, gaze0: 0, pitch: 0, sh: { p: [0, 0], v: [0, 0] }, shakeYaw: 0, shakePitch: 0 };
    var freeCam = false;
    // Vapaa kamera testikuviin ja purkuun (maailmakoordinaatit: x = E, y = ylös, z = -N)
    function setFree(pos, look, fov) {
      if (!freeCam) { rig.remove(camera); scene.add(camera); camera.rotation.order = 'XYZ'; freeCam = true; }
      camera.position.set(pos[0], pos[1], pos[2]); camera.up.set(0, 1, 0); camera.lookAt(look[0], look[1], look[2]);
      if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
    function clearFree() { if (freeCam) { scene.remove(camera); camera.rotation.order = 'YXZ'; freeCam = false; if (ov.on) scene.add(camera); else { rig.add(camera); placeCamera(); } updateFov(); } }

    var compact = false, reqVfov = 45;
    function setSize(cw, ch, compactMode) {
      w = Math.max(1, cw); h = Math.max(1, ch); compact = !!compactMode;
      applyPixelRatio();
      updateFov();
    }
    function applyPixelRatio() {
      var scale = Math.min(dpr, Math.sqrt(pixelMp * 1e6 / (w * h)));
      scale = Math.max(0.25, scale);
      // Google-tilassa (vaihe 3n) oma kerros on kevyt, mutta Googlen piirto hidastaa kokonaiskuvaväliä, jolloin mukautuva tarkkuus laskisi
      // Repan ja merkkien ääriviivat porrastuneiksi. Siksi kerrostilassa tarkkuus on vähintään näytön oma (enintään 2x).
      if (ov && ov.on) scale = Math.max(scale, Math.min(dpr, 2));
      renderer.setPixelRatio(scale);
      renderer.setSize(w, h, false);
    }
    function updateFov() {
      var asp = w / h, v;
      if (bino.on) v = 2 * Math.atan(Math.tan(S.kiikariHfovDeg * RAD / 2) / asp) / RAD;   // kiikarissa vaakakuvakulma on aina kiikariHfovDeg
      else v = baseVfov(asp);
      // kerrostila: Googlen fov hyväksyy vain 5 ... 80 astetta (pyydetty arvo), ja oma kamera käyttää Googlen todellista kuvakulmaa (kalibroitu tangentin kerroin)
      if (ov.on) v = Math.min(ov.fovMax, Math.max(ov.fovMin, v));
      reqVfov = v;
      if (ov.on) v = 2 * Math.atan(Math.tan(v * RAD / 2) * ov.cal.tanScale) / RAD;
      camera.fov = v; camera.aspect = asp; camera.updateProjectionMatrix();
    }
    function baseVfov(asp) { return asp >= 1 ? 2 * Math.atan(Math.tan((compact ? S.hfovCompactDeg : S.hfovDeg) * RAD / 2) / asp) / RAD : S.portraitVfovDeg; }
    // tavallinen (kiikaritta) vaakakuvakulma asteina, kompassikaista käyttää sitä myös kiikarin aikana
    function baseHfov() { var asp = w / h; return 2 * Math.atan(Math.tan(baseVfov(asp) * RAD / 2) * asp) / RAD; }
    // Kiikari päälle tai pois. Päälle: kuvakulma kiikariHfovDeg ja katseen suunta säilyy. Pois: kuvakulma ja katse palautuvat entisiin (gaze0).
    function setBinoculars(on) {
      on = !!on; if (on === bino.on) return;
      if (on) { bino.gaze0 = gazeCmd; bino.pitch = 0; bino.sh.p = [0, 0]; bino.sh.v = [0, 0]; bino.shakeYaw = bino.shakePitch = 0; }
      bino.on = on;
      runko.boat.visible = !on;   // kiikaria pidetään ikkunan ulkopuolella, joten ohjaamon katto ja ikkunapuitteet eivät peitä kuvaa
      if (!on) { gazeCmd = bino.gaze0; gaze = bino.gaze0; bino.pitch = 0; bino.shakeYaw = bino.shakePitch = 0; }
      updateFov();
      aids3d.setBino(on, S.kiikariSuurennus);
      if (!freeCam) camera.rotation.set(0, -Math.PI / 2 - gaze * RAD, 0);
    }
    function setBinoPitch(d) { bino.pitch = Math.max(S.kiikariPitchMin, Math.min(S.kiikariPitchMax, d)); }
    // satunnainen kaksiakselinen tärinä: vaimennettu värähtelijä (noin 1,5 Hz), jonka keskihajonta on amp astetta
    function shakeStep(dt, amp) {
      var w0 = 2 * Math.PI * 1.5, z = 0.35, q = amp * amp * 4 * z * w0 * w0 * w0, sh = bino.sh, n = Math.max(1, Math.ceil(dt / 0.016)), h2 = dt / n;
      for (var k = 0; k < n; k++) for (var i = 0; i < 2; i++) {
        var r = Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
        sh.v[i] += (-w0 * w0 * sh.p[i] - 2 * z * w0 * sh.v[i]) * h2 + Math.sqrt(q * h2) * r;
        sh.p[i] += sh.v[i] * h2;
      }
      bino.shakeYaw = sh.p[0]; bino.shakePitch = sh.p[1];
    }
    function setPixelBudget(mp) { pixelMp = Math.max(S.pixelMinMp, Math.min(S.pixelMaxMp, mp)); applyPixelRatio(); }
    function getPixelBudget() { return pixelMp; }

    function setSimTime(ms) {
      simMs = ms;
      var s = sun = sunPosition(ms, 61.5, 23.77);
      var e = s.elevDeg;
      var day = smooth01((e + 3) / 14);          // 0 yöllä ja 1 yli 11 asteen korkeudella
      var gridAz = P.trueToGrid(s.azDeg, 0, 0);
      var a = gridAz * RAD, ce = Math.cos(Math.max(e, -5) * RAD);
      sunDirW.set(Math.sin(a) * ce, Math.sin(Math.max(e, -5) * RAD), -Math.cos(a) * ce).normalize();
      U.uSunDir.value.copy(sunDirW);
      // taivas, sumu ja valot auringon korkeuden mukaan (keskipäivällä hieman lämmin valkoinen, aamulla ja illalla kullankeltainen, yöllä sininen hämärä)
      var m = skyModel(e);
      U.uHorizon.value.copy(m.hor); U.uZenith.value.copy(m.zen); U.uFogColor.value.copy(m.hor);
      U.uDay.value = day; U.uSunGlow.value = smooth01((e + 1.5) / 6);
      U.uSunColor.value.copy(m.sun); U.uCloudLit.value.copy(m.cloudLit); U.uCloudShade.value.copy(m.cloudShade);
      sunL.color.copy(lin('#' + m.sun.getHexString()));
      sunL.intensity = m.sunI * smooth01((e + 2) / 6);
      hemi.color.copy(m.hemiSky); hemi.groundColor.copy(m.hemiGnd); hemi.intensity = m.hemiI;
      // yön pimeys (vaihe 4): kuun vaihe ja korkeus, tähdet ja kaupungin hehku pilvien mukaan. Valoisuus nl suhteessa aiempaan oletusyöhön (0,6 = ennallaan)
      var ne = nightEnv(ms, S.cloudCover, S.moonMode), cl = ne.cloud, mo = ne.moon, moonLight = ne.moonLight, nl = ne.nl;
      var nightW = smooth01((-e - 1) / 8), kk = 1 + (Math.min(1.4, nl / 0.6) - 1) * nightW, kc = 1 + (Math.max(0.1, Math.min(1.25, nl / 0.6)) - 1) * nightW;
      hemi.intensity = m.hemiI * kk;
      U.uHorizon.value.multiplyScalar(kc); U.uZenith.value.multiplyScalar(kc); U.uFogColor.value.copy(U.uHorizon.value);
      U.uCloudLit.value.multiplyScalar(kc); U.uCloudShade.value.multiplyScalar(kc);
      // pilvisyys himmentää päivän auringon ja harmaannuttaa taivaan
      sunL.intensity *= 1 - 0.75 * Math.max(0, cl - 0.3) / 0.7;
      var gr = smooth01((cl - 0.4) / 0.5) * day * 0.7;
      if (gr > 0) [U.uHorizon.value, U.uZenith.value].forEach(function (c) { var y = (c.r + c.g + c.b) / 3 * 0.88; c.lerp(new THREE.Color(y, y, y * 1.02), gr); });
      moonL.intensity = 0.16 * moonLight * nightW;
      if (mo.elevDeg > -2) {
        var ma = P.trueToGrid(mo.azDeg, 0, 0) * RAD, mce = Math.cos(mo.elevDeg * RAD);
        moonDirW.set(Math.sin(ma) * mce, Math.sin(mo.elevDeg * RAD), -Math.cos(ma) * mce).normalize();
      } else moonDirW.set(0, -1, 0);
      moonL.position.copy(moonDirW).multiplyScalar(1000); U.uMoonDir.value.copy(moonDirW);
      U.uMoonI.value = mo.elevDeg > -1 ? (0.25 + 0.75 * mo.illum) * mo.show * (0.35 + 0.65 * nightW) : 0;
      U.uStars.value = nightW * (1 - smooth01((cl - 0.25) / 0.6)) * (1 - 0.5 * Math.min(1, moonLight * 1.5));
      night = { nl: nl, moon: mo, cloud: cl };
      scene.fog.color.copy(U.uHorizon.value);
      horColor.copy(U.uHorizon.value); if (!ov.on) renderer.setClearColor(horColor, 1);
    }
    // sää: 'selkea', 'puoli' tai 'pilvi' (pilvien peitto) ja kuu: 'auto', 'taysi' tai 'ei'
    function setWeather(w, moon) {
      if (w && WEATHER[w] != null) { S.weather = w; S.cloudCover = WEATHER[w]; }
      if (moon) S.moonMode = moon;
      U.uCloud.value = quality === 'full' ? S.cloudCover : 0;
      setSimTime(simMs);
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
    // Katseen tasoitus ilman piirtoa (vaihe 3m): kun ulkonäkymänä on Google 3D, oma näkymä piirretään harvoin, mutta kompassikaista ja Google-kamera tarvitsevat tasoitetun katseen joka kuvalla.
    function stepGaze(dtReal) { var dt = Math.min(0.2, dtReal || 0.016); gaze += (gazeCmd - gaze) * Math.min(1, dt * 8); }
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
      if (!freeCam && ov.on) {
        // kerrostila: kamera ei keinu rungon mukana vaan on samassa paikassa ja suunnassa kuin Googlen kamera (silmäpiste aluksen suunnan mukaan, vaakasuora katse, ei kiikarin tärinää)
        bino.shakeYaw = 0; bino.shakePitch = 0;
        var hr = st.hdg * RAD, fw = S.eyeX - S.pivotX, sb = S.eyeY;
        camera.position.set(st.x + Math.sin(hr) * fw + Math.cos(hr) * sb, eyeZ() - S.waterlineZ, -(st.y + Math.cos(hr) * fw - Math.sin(hr) * sb));
        camera.rotation.set(ov.cal.dPitchDeg * RAD, -(st.hdg + gaze + ov.cal.dHeadingDeg) * RAD, 0);
      } else if (!freeCam) {
        if (bino.on) {
          rig.updateMatrixWorld(true);
          // käden tärinä kasvaa nopeuden ja aallokon mukana (keskihajonta = puolet asetuksen amplitudista)
          var waveK = Math.min(1, (Math.abs(bobP) + Math.abs(bobR)) / (S.bobPitchDeg + S.bobRollDeg));
          shakeStep(dt, S.kiikariTarinaDeg * 0.5 * (1 + 1.5 * sp + waveK));
          var yawC = -Math.PI / 2 - (gaze + bino.shakeYaw) * RAD, pit = bino.pitch + bino.shakePitch;
          // kiikari pitää vaakatason: aluksen trimmi ja pystyaallokko poistetaan katsesuunnasta kahdella kierroksella
          var corr = 0, dirv = tmpDir;
          for (var it = 0; it < 2; it++) {
            camera.rotation.set((pit + corr) * RAD, yawC, 0); camera.updateMatrixWorld(true);
            camera.getWorldDirection(dirv);
            corr -= Math.asin(Math.max(-1, Math.min(1, dirv.y))) / RAD - pit;
          }
          camera.rotation.set((pit + corr) * RAD, yawC, 0);
        } else camera.rotation.set(camPitchDeg * RAD, -Math.PI / 2 - gaze * RAD, 0);
      }
      rig.updateMatrixWorld(true);
      // vesi ja taivas seuraavat kameraa
      var cp = camera.getWorldPosition(new THREE.Vector3());
      water.position.set(cp.x, 0, cp.z); sky.position.copy(cp); ov.dome.position.copy(cp);
      U.uTime.value += dt;
      terrain.setBoat(st.x, st.y); aids3d.sync(st.x, st.y); if (piers) piers.sync(st.x, st.y);
      var kpx = 2 * Math.tan(camera.fov * RAD / 2);   // kuvapikselin koko: laitepikselinä (css-korkeus x laitepikselisuhde) ja piirtopuskurin pikselinä
      aids3d.setPixel(kpx / Math.max(1, h * (root.devicePixelRatio || 1)), kpx / Math.max(1, renderer.domElement.height));
      // vastavalon sumennus
      var ss = sunScreen();
      if (sun.elevDeg > -2) {
        var gl = Math.max(0, ss.dot - 0.55) / 0.45, a = Math.min(0.5, gl * gl * 0.55) * Math.min(1, Math.max(0, sun.elevDeg / 10));
        veil.style.opacity = a.toFixed(3);
        veil.style.background = 'radial-gradient(circle at ' + ss.x.toFixed(1) + '% ' + ss.y.toFixed(1) + '%, rgba(255,246,222,0.95), rgba(255,246,222,0.35) 45%, rgba(255,246,222,0.12) 100%)';
      } else veil.style.opacity = 0;
      renderer.info.reset();
      if (ov.on) { overlayLayers(); if (wmask) { wmask.sync(st.x, st.y); wmask.tick(4); } }
      drawScene();
      var t1 = performance.now();
      frames.push(t1 - t0); if (frames.length > 240) frames.shift();
      return t1 - t0;
    }
    // Piirto: tavallisesti yksi kierros. Kerrostilassa ensin maastoverkko ja rakennukset (taso 2) syvyyspuskuriin ja sumun värisinä, sitten muu (vesi, vene, turvalaitteet, sumukupu) syvyystestillä.
    function drawScene() {
      if (!ov.on) { renderer.render(scene, camera); return; }
      var ac = renderer.autoClear;
      renderer.autoClear = true; camera.layers.set(2); scene.overrideMaterial = ov.mat; renderer.render(scene, camera);
      scene.overrideMaterial = null; camera.layers.set(0); renderer.autoClear = false; renderer.render(scene, camera);
      renderer.autoClear = ac;
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
    function rebase() { if (wmask) wmask.rebase(); terrain.rebase(); aids3d.rebase(); landmarks.rebase(); if (piers) piers.rebase(); extra.forEach(function (e) { if (e.rebase) e.rebase(); }); }
    function addExtra(o) { extra.push(o); return o; }

    return {
      scene: scene, camera: camera, renderer: renderer, rig: rig, boat: runko, terrain: terrain, aids: aids3d, landmarks: landmarks, piers: piers, canvas: canvas, settings: S, uniforms: U, veil: veil,
      setSize: setSize, render: render, setSimTime: setSimTime, setGaze: setGaze, getGaze: getGaze, stepGaze: stepGaze, getGazeNow: function () { return gaze; }, hfov: function () { return 2 * Math.atan(Math.tan(camera.fov * RAD / 2) * camera.aspect) / RAD; }, setHfov: function (d) { S.hfovDeg = d; updateFov(); }, setSeat: setSeat, setEye: setEye,
      setPixelBudget: setPixelBudget, getPixelBudget: getPixelBudget, rendererStats: rendererStats, frameStats: frameStats, resetFrameStats: resetFrameStats,
      rebase: rebase, addExtra: addExtra, sunScreen: sunScreen, sun: function () { return sun; }, night: function () { return night; }, setWeather: setWeather, weather: function () { return { weather: S.weather, moon: S.moonMode, cloud: S.cloudCover }; },
      setFree: setFree, clearFree: clearFree,
      setOverlay: setOverlay, isOverlay: function () { return ov.on; }, setFogKm: setFogKm, getFogKm: function () { return ov.fogKm; }, setCalib: setCalib, getCalib: function () { return { dHeadingDeg: ov.cal.dHeadingDeg, dPitchDeg: ov.cal.dPitchDeg, tanScale: ov.cal.tanScale }; },
      vfovRequested: function () { return reqVfov; }, eyeAboveWaterM: function () { return eyeZ() - S.waterlineZ; }, overlayHide: overlayHide, wmask: wmask, overlayMat: ov.mat, overlayDome: ov.dome, overlaySettings: ov,
      setCameraPitch: function (d) { camPitchDeg = d; }, isSeated: function () { return seated; },
      setWind: setWind, getWind: function () { return { fromDeg: S.windFromDeg, speed: S.windSpeed }; }, setQuality: setQuality, getQuality: function () { return quality; },
      setBinoculars: setBinoculars, isBino: function () { return bino.on; }, setBinoPitch: setBinoPitch, getBinoPitch: function () { return bino.pitch; },
      baseHfov: baseHfov, gazeSens: function () { return bino.on ? 1 / S.kiikariSuurennus : 1; }, binoState: function () { return { on: bino.on, gaze0: bino.gaze0, pitch: bino.pitch, shakeYaw: bino.shakeYaw, shakePitch: bino.shakePitch }; }
    };
  }

  // Kompassinauhan käskymerkki: vihreä kolmio nauhan alareunassa komennetun tosisuunnan kohdalla (sama suunta kuin komentopalstan "Käsky Suunta").
  // g = nauhan 2D-konteksti, w ja h nauhan koko (css-px), look = katseen tosisuunta (aste), hfovDeg = kameran vaakakuvakulma, cmd = käsketty tosisuunta (aste).
  // Kun käsky ja katse ovat samassa suunnassa, merkki on keskellä katseen merkin alla. Kun käskysuunta on nauhan ulkopuolella, reunassa on nuoli ja suunnan lukema.
  // Palauttaa { inBand, x, side, cmd, look } testejä ja käyttöliittymää varten.
  function drawCommandMarker(g, w, h, look, hfovDeg, cmd) {
    var hf = hfovDeg * RAD, k = (w / 2) / Math.tan(hf / 2), d = ((cmd - look) % 360 + 540) % 360 - 180, off = d * RAD;
    var x = Math.abs(off) < 1.5 ? w / 2 + Math.tan(off) * k : (d < 0 ? -1e4 : 1e4);
    var inBand = x >= 8 && x <= w - 8, c = '#3ddc6f', dark = '#0a3a1c';
    g.save();
    g.lineJoin = 'round';
    if (inBand) {
      g.strokeStyle = 'rgba(61,220,111,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 12); g.stroke();
      g.fillStyle = c; g.strokeStyle = dark; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x - 8, h - 0.5); g.lineTo(x + 8, h - 0.5); g.lineTo(x, h - 14); g.closePath(); g.fill(); g.stroke();
    } else {
      var left = d < 0, ex = left ? 3 : w - 3, dir = left ? 1 : -1, y = h / 2;
      g.fillStyle = c; g.strokeStyle = dark; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + dir * 13, y - 8); g.lineTo(ex + dir * 13, y + 8); g.closePath(); g.fill(); g.stroke();
      var txt = (cmd < 10 ? '00' : cmd < 100 ? '0' : '') + Math.round(cmd), tw;
      g.font = '700 12px ui-monospace,Menlo,Consolas,monospace'; g.textBaseline = 'middle'; tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(left ? ex + 15 : ex - 15 - tw - 4, y - 8, tw + 4, 16);
      g.fillStyle = c; g.textAlign = 'left'; g.fillText(txt, left ? ex + 17 : ex - 15 - tw - 2, y + 0.5);
    }
    g.restore();
    return { inBand: inBand, x: inBand ? x : null, side: inBand ? 0 : (d < 0 ? -1 : 1), cmd: cmd, look: look, diff: d };
  }

  // Kiikarimaski (vaihe 3g): musta reunus ja pehmeä reuna. Leveällä kuvalla kaksi osittain päällekkäistä ympyrää, jotka ulottuvat lähes koko leveydelle ja jatkuvat kuvan ylä- ja alareunan yli,
  // kapealla tai pystykuvalla (puhelin) yksi soikio. phone = true tekee reunuksesta pienemmän. Palauttaa kuvauksen testejä varten.
  function drawBinoMask(cv, w, h, phone) {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    var m = phone ? 0.012 : 0.03, info;
    function disc(cx, cy, rx, ry) {   // pehmeä reunainen soikio: täysin läpinäkyvä sisäosa ja 4 % pehmeä reuna
      g.save(); g.translate(cx, cy); g.scale(rx, ry);
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.96, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    }
    if (w >= 1.25 * h) {
      var R = (0.5 - m) * w / 1.45, c = 0.45 * R;
      disc(w / 2 - c, h / 2, R, R); disc(w / 2 + c, h / 2, R, R);
      info = { muoto: 'kaksi ympyrää', r: R, keskiero: 2 * c, vasen: w / 2 - c - R, oikea: w / 2 + c + R };
    } else {
      var rx = (0.5 - m) * w, ry = (0.5 - m) * h; disc(w / 2, h / 2, rx, ry);
      info = { muoto: 'soikio', rx: rx, ry: ry, vasen: w / 2 - rx, oikea: w / 2 + rx };
    }
    g.globalCompositeOperation = 'source-over';
    return info;
  }

  var api = { create: create, SETTINGS: SETTINGS, sunPosition: sunPosition, moonPosition: moonPosition, nightEnv: nightEnv, WEATHER: WEATHER, drawCommandMarker: drawCommandMarker, drawBinoMask: drawBinoMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Nakyma = api;
})(typeof window !== 'undefined' ? window : globalThis);
