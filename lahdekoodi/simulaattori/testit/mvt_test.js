/* MVT-purkajan testi: vertaa Python-purkajaan (python3 testit/mvt_oraakkeli.py tulostaa vertailuluvut).
 * Ajo: node testit/mvt_test.js  (paketin palvelin portissa 8140) */
'use strict';
const path = require('path'), fs = require('fs');
const Mvt = require(path.join(__dirname, '..', 'js', 'mvt.js'));
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'pmtiles.js'), 'utf8');
const pmtiles = new Function(src + '; return pmtiles;')();
(async () => {
  const pm = new pmtiles.PMTiles('http://127.0.0.1:8140/nasijarvi.pmtiles');
  const r = await pm.getZxy(14, 9272, 4617);
  const d = Mvt.decode(new Uint8Array(r.data), ['rakennus', 'turvalaite', 'maastokuvio', 'navigointilinja']);
  const sum = {};
  for (const k of Object.keys(d)) sum[k] = d[k].features.length;
  console.log(JSON.stringify(sum));
  const t = d.turvalaite.features[0];
  console.log('turvalaite', JSON.stringify(t.props).slice(0, 120), Array.from(t.parts[0]));
  const b = d.rakennus.features[0];
  console.log('rakennus 0', JSON.stringify(b.props), b.parts.length, Array.from(b.parts[0].slice(0, 6)), 'ala', Mvt.ringArea(b.parts[0]));
  console.log('maastokuvio', d.maastokuvio.features.map(f => f.props.luokka).join(','));
})();
