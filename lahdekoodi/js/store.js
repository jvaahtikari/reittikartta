/* Reittikartta – tila ja tallennus selaimen localStorageen. */
(function (global) {
  'use strict';

  var KEY = 'reittikartta.v1';

  var defaults = function () {
    return {
      version: 1,
      routes: [],
      marks: [],
      tasks: [],
      settings: {
        vessels: [],                // käyttäjä lisää omat aluksensa (Asetukset tai reitin hyväksyntä)
        currentVessel: '',
        routeFilter: 'vessel',      // 'vessel' = reitit tälle alukselle, 'all' = kaikki
        approvers: [],
        speed: 20,                  // oletusnopeus solmuina ajoaikaan
        station: null,              // { lat, lng, name }
        view: { lat: 61.66, lng: 23.86, zoom: 11 },
        show: {
          notes: true, passes: true, bearings: true, depths: true, lines: false,
          aids: false, aidNames: false, signs: null, border: true, hint: false, snap: true, safety: false,
          legBrg: true, turnTicks: true, lights: null, speed: null, mml: true, piers: true,
          bridges: null, ecdisMarks: false
        },
        safetyDepths: {},
        land: 'osm',                // maapohja: 'osm' (oletus, näyttää maa-alueiden nimet) | 'mml'
        mmlKey: '',                 // Maanmittauslaitoksen avoimen rajapinnan API-avain           // turvasyvyys aluksittain (m)
        base: 'raster',             // karttapohja: 'raster' | 'vector' | 'enc' | 'enc-ecdis'
        night: false,
        gps: null,                  // oma sijainti: null = puhelimessa päälle käynnistyessä, true/false = käyttäjän valinta
        panelOpen: true,
        turnWarnNM: 1.0             // käännösetäisyys punaiseksi tätä pidempänä
      }
    };
  };

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    Object.keys(extra).forEach(function (k) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        deepMerge(base[k], extra[k]);
      } else if (extra[k] !== undefined) base[k] = extra[k];
    });
    return base;
  }

  var state = defaults();
  var listeners = [];
  var storageOk = true;

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) state = deepMerge(defaults(), JSON.parse(raw));
    } catch (e) { storageOk = false; }
    dropSampleVessels();
    osmLandDefault();
    signsAutoDefault();
    return state;
  }

  // Aiemmat versiot täyttivät aluslistaan valmiiksi esimerkkialukset. Ne poistetaan kerran,
  // ellei jokin reitti ole hyväksytty niille (silloin ne ovat käyttäjän omassa käytössä).
  function dropSampleVessels() {
    var s = state.settings;
    if (s.sampleVesselsDropped) return;
    var SAMPLE = ['PV Turva', 'AV Roni', 'PV Repa'];
    var used = {};
    state.routes.forEach(function (r) { (r.vessels || []).forEach(function (v) { used[v] = true; }); });
    s.vessels = (s.vessels || []).filter(function (v) { return SAMPLE.indexOf(v) < 0 || used[v]; });
    if (s.vessels.indexOf(s.currentVessel) < 0) s.currentVessel = s.vessels[0] || '';
    s.sampleVesselsDropped = true;
    if (storageOk) save();
  }

  // OpenStreetMap-maapohja on oletus, jotta vektorikartalla näkyvät maa-alueiden paikannimet.
  // Aiemmin tallennettu oletus (MML) vaihdetaan kerran; käyttäjä voi palauttaa MML:n Näytä-valikosta.
  function osmLandDefault() {
    var s = state.settings;
    if (s.landOsmDefault) return;
    s.land = 'osm';
    s.landOsmDefault = true;
    if (storageOk) save();
  }

  // Vesiliikennemerkit näkyvät nyt oletuksena vektorikartalla (kuten valot). Aiempi oletus false
  // muutetaan kerran tyhjäksi; käyttäjän itse valitsema näkyvyys (true) säilyy.
  function signsAutoDefault() {
    var s = state.settings;
    if (s.signsAutoDefault) return;
    if (s.show && s.show.signs === false) s.show.signs = null;
    s.signsAutoDefault = true;
    if (storageOk) save();
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { global.localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
      catch (e) { storageOk = false; }
    }, 150);
  }

  function emit(what) {
    save();
    listeners.slice().forEach(function (fn) { try { fn(what); } catch (e) { console.error(e); } });
  }

  function on(fn) { listeners.push(fn); }

  function routeById(id) { return state.routes.find(function (r) { return r.id === id; }); }
  function markById(id) { return state.marks.find(function (m) { return m.id === id; }); }
  function taskById(id) { return state.tasks.find(function (t) { return t.id === id; }); }

  function newRoute(points) {
    var now = new Date().toISOString();
    var r = {
      id: uid('rt'), name: '', from: '', via: '', to: '', status: 'draft',
      points: (points || []).map(function (p) { return { lat: p.lat, lng: p.lng }; }),
      notes: [], passes: [], turns: [],
      speed: state.settings.speed, approver: '', approvedAt: '', vessels: [],
      created: now, modified: now, desc: ''
    };
    state.routes.push(r);
    return r;
  }

  function routeVisible(r) {
    if (state.settings.routeFilter === 'all' || !state.settings.currentVessel) return true;
    if (r.status !== 'approved') return true;           // luonnokset näkyvät aina tekijälleen
    return (r.vessels || []).indexOf(state.settings.currentVessel) >= 0;
  }

  function autoName(r) {
    var parts = [r.from, r.via, r.to].map(function (s) { return (s || '').trim(); }).filter(Boolean);
    return parts.join(' – ');
  }

  function replaceAll(data) {
    state = deepMerge(defaults(), data);
    emit('all');
  }

  global.Store = {
    get state() { return state; },
    load: load, save: save, emit: emit, on: on, uid: uid,
    routeById: routeById, markById: markById, taskById: taskById,
    newRoute: newRoute, routeVisible: routeVisible, autoName: autoName, replaceAll: replaceAll,
    get storageOk() { return storageOk; }
  };
})(window);
