// Reittikartta – Google Maps -avaimen jakelu simulaattorin Google 3D -testinäkymälle.
// Avain luetaan Vercelin ympäristömuuttujasta GOOGLE_API eikä sitä kirjoiteta sivun koodiin.
// Avain on selaimessa käytettävä (Maps JavaScript API) ja rajattu Google Cloudissa viittaajaan, joten
// sen jakaminen samalle sivustolle on tarkoitettu käyttö. Vastaus annetaan vain saman isännän pyyntöihin.
module.exports = async function handler(req, res) {
  const key = process.env.GOOGLE_API;
  res.setHeader('Cache-Control', 'no-store');
  if (!key) { res.status(503).json({ error: 'GOOGLE_API puuttuu Vercelin asetuksista' }); return; }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const ref = String(req.headers.referer || req.headers.origin || '');
  if (!host || !ref || ref.indexOf('://' + host) < 0) { res.status(403).json({ error: 'vain oman sivuston käyttöön' }); return; }
  res.status(200).json({ key: key });
};
