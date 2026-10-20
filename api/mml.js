// Reittikartta – välityspalvelu Maanmittauslaitoksen avoimeen rajapintaan.
// API-avain luetaan Vercelin ympäristömuuttujasta MML_API_KEY, joten se ei näy sivun koodissa.
// Vain sovelluksen käyttämät polut (maastotiedot ja nimistö, kokoelmat ja kohteet) välitetään.
// Vastaukset tallennetaan Vercelin välimuistiin vuorokaudeksi, mikä vähentää kutsuja Maanmittauslaitokselle.
const BASE = 'https://avoin-paikkatieto.maanmittauslaitos.fi';
const PATH_OK = /^\/(maastotiedot|geographic-names)\/features\/v1\/collections(\/[A-Za-z0-9_-]+\/items)?$/;

module.exports = async function handler(req, res) {
  const key = process.env.MML_API_KEY;
  if (!key) { res.status(503).json({ error: 'MML_API_KEY puuttuu Vercelin asetuksista' }); return; }
  const q = req.query || {};
  const path = String(Array.isArray(q.p) ? q.p[0] : q.p || '');
  if (!PATH_OK.test(path)) { res.status(400).json({ error: 'polku ei ole sallittu' }); return; }
  const params = new URLSearchParams();
  Object.keys(q).forEach(function (k) {
    if (k === 'p' || k.toLowerCase() === 'api-key') return;
    [].concat(q[k]).forEach(function (v) { params.append(k, String(v)); });
  });
  params.set('api-key', key);
  try {
    const r = await fetch(BASE + path + '?' + params.toString());
    const body = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    if (r.ok) res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'Maanmittauslaitoksen rajapintaan ei saatu yhteyttä' });
  }
};
