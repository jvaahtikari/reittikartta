/* Vaihe 3o: testien yhteinen ruutulataaja Nodessa. Lataa vesieste- ja maastokuvio-ruudut (z16) pisteen ympäriltä pienissä erissä ja toistaa erän, jos jokin pyyntö epäonnistui
 * (rinnakkaisten pyyntöjen satunnaiset katkokset veivät aiemmin osan ruuduista, jolloin vesitesti luki puuttuvan ruudun maaksi). */
'use strict';
async function lataa(Aineisto, Paikka, e0, n0, reach) {
  const ll = Paikka.enToLonLat(e0, n0), tp = Paikka.lonlatToTile(ll.lon, ll.lat, 16), size = 40075016.686 * Math.cos(ll.lat * Math.PI / 180) / 65536, k = Math.ceil(reach / size) + 1;
  const tasks = []; for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) tasks.push([Math.floor(tp.x) + dx, Math.floor(tp.y) + dy]);
  const ves = new Map(), kuv = new Map();
  for (let i = 0; i < tasks.length; i += 16) {
    const erä = tasks.slice(i, i + 16);
    for (let yritys = 0; yritys < 6; yritys++) {
      const f0 = Aineisto.stats.fail;
      await Promise.all(erä.map(([tx, ty]) => Aineisto.layers(16, tx, ty, ['vesieste', 'maastokuvio']).then(r => {
        if (!r) return; const key = tx + '/' + ty;
        if (r.vesieste) ves.set(key, { z: 16, x: tx, y: ty, layer: r.vesieste }); if (r.maastokuvio) kuv.set(key, { z: 16, x: tx, y: ty, layer: r.maastokuvio });
      })));
      if (Aineisto.stats.fail === f0) break;
      if (yritys === 5) throw new Error('ruutujen lataus epäonnistui toistuvasti');
    }
  }
  return { ves: Array.from(ves.values()), kuv: Array.from(kuv.values()) };
}
module.exports = { lataa };
