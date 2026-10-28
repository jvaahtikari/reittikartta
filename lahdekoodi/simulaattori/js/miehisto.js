/* Simulaattori – miehistötilan (kaksinpeli) yhteys, 28.10.2026.
 *
 * Kaksi laitetta samassa veneessä: ruorimies (isäntä) laskee aluksen liikkeen ja lähettää tilan, navigoija liittyy istuntokoodilla ja lähettää mittariensa säädöt.
 * Viestit kulkevat Supabase Realtimen Broadcast-kanavalla "repa-sim-KOODI" (ei tietokantaa, mitään ei tallenneta). Yhteysasetukset (osoite ja publishable-avain)
 * haetaan Vercelin reitiltä /api/simu (ympäristömuuttuja SIMU). Paikallisessa testissä (localhost, tiedosto tai ?yhteys=paikallinen) viestit kulkevat selaimen
 * BroadcastChannel-kanavalla saman selaimen ikkunoiden välillä.
 *
 * Viesti: { t: tyyppi, d: data, r: lähettäjän rooli ('helm' tai 'nav') }. */
(function (root) {
  'use strict';
  var CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ23456789';   // ei sekoittuvia merkkejä (I, O, Q, W, 0, 1)
  var cfgP = null;

  function newCode() { var s = ''; for (var i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  function isLocal() {
    try {
      if (/[?&]yhteys=paikallinen/.test(location.search)) return true;
      if (/[?&]yhteys=supabase/.test(location.search)) return false;
      var hn = String(location.hostname || '');
      return location.protocol === 'file:' || hn === 'localhost' || hn === '127.0.0.1' || hn === '';
    } catch (e) { return true; }
  }
  function config() {
    if (cfgP) return cfgP;
    cfgP = fetch('/api/simu', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return cfgP;
  }

  // Avaa istunnon kanavan. onMsg(viesti), onStatus(tila, lisätieto): 'yhdistetaan', 'yhdistetty', 'virhe', 'suljettu'.
  function open(code, role, onMsg, onStatus) {
    var closed = false, ch = null, client = null, ready = false, bc = null;
    var link = { code: code, role: role, kind: isLocal() ? 'paikallinen' : 'supabase', send: send, close: close, isReady: function () { return ready; } };
    function status(s, x) { if (!closed && onStatus) onStatus(s, x); }
    function deliver(m) { if (!closed && m && m.r !== role && onMsg) onMsg(m); }
    function send(t, d) {
      if (closed || !ready) return false;
      var m = { t: t, d: d, r: role };
      try {
        if (bc) bc.postMessage(m);
        else if (ch) ch.send({ type: 'broadcast', event: 'm', payload: m });
        return true;
      } catch (e) { return false; }
    }
    function close() {
      if (closed) return; closed = true; ready = false;
      try { if (bc) bc.close(); } catch (e) {}
      try { if (ch && client) client.removeChannel(ch); } catch (e) {}
    }
    status('yhdistetaan');
    if (link.kind === 'paikallinen') {
      if (typeof BroadcastChannel === 'undefined') { setTimeout(function () { status('virhe', 'Selain ei tue paikallista yhteyttä.'); }, 0); return link; }
      bc = new BroadcastChannel('repa-sim-' + code);
      bc.onmessage = function (e) { deliver(e.data); };
      setTimeout(function () { ready = true; status('yhdistetty'); }, 0);
      return link;
    }
    config().then(function (c) {
      if (closed) return;
      if (!c || !c.key) { status('virhe', 'Yhteyspalvelun avainta ei saatu (Vercelin SIMU).'); return; }
      if (!root.supabase || !root.supabase.createClient) { status('virhe', 'Yhteyskirjasto puuttuu.'); return; }
      client = root.supabase.createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } });
      ch = client.channel('repa-sim-' + code, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'm' }, function (p) { deliver(p && p.payload); });
      ch.subscribe(function (st, err) {
        if (st === 'SUBSCRIBED') { ready = true; status('yhdistetty'); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { ready = false; status('virhe', (err && err.message) || st); }
        else if (st === 'CLOSED') { ready = false; status('suljettu'); }
      });
    });
    return link;
  }

  root.Miehisto = { open: open, newCode: newCode, cleanCode: cleanCode, isLocal: isLocal };
})(typeof window !== 'undefined' ? window : globalThis);
