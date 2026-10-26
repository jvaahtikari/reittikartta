/* Peruutuksen testit liikemallille Nodessa (vaihe 3k, kriteerit 0 ja 1).
 *   node testit/peruutus_test.js                 uusi liike.js (kaikki testit)
 *   LIIKE=testit/liike_ennen_3k.js node testit/peruutus_test.js   vaiheen 3k edeltävä liike.js: kirjaa nykyisen käyttäytymisen
 * Ennen korjausta mallissa ei ole perän käskyjä (orderStern), joten niitä käyttävät kokeet ohitetaan ja kirjataan "ei ole". */
'use strict';
const path = require('path');
const modPath = process.env.LIIKE ? path.resolve(process.env.LIIKE) : path.join(__dirname, '..', 'js', 'liike.js');
const L = require(modPath);
const KN = L.KN, UUSI = typeof L.orderStern === 'function';
let fails = 0;
const wrap = (d) => ((d + 180) % 360 + 360) % 360 - 180, norm = (d) => ((d % 360) + 360) % 360;
function ehto(nimi, ok, lisa) { if (!ok) fails++; console.log((ok ? 'OK    ' : 'VIRHE ') + nimi + (lisa ? ': ' + lisa : '')); }
function tieto(nimi, lisa) { console.log('TIETO ' + nimi + (lisa ? ': ' + lisa : '')); }

// Alus kulussa tasaisella nopeudella kn suuntaan hdg (ruutusuunta), konvergenssi conv
function kulussa(kn, hdg, conv) {
  const s = L.create({ hdg: hdg, conv: conv || 0, v: kn * KN, speedKn: kn });
  s.leverCmd = L.leverForSpeed(kn * KN); s.leverTrim = s.leverCmd; s.lever = s.leverCmd; s.speedSense = kn;
  return s;
}
// Ajaa sek sekuntia ja palauttaa näytteet 0,5 s välein. COG lasketaan sijainnin muutoksesta (0,5 s) tosisuuntana.
function aja(s, sek, naytteet) {
  const h = 0.02, n = Math.round(sek / h), out = [], hist = [];
  for (let i = 0; i < n; i++) {
    L.stepOnce(s, h);
    if (i % 25 === 0) {
      hist.push({ t: s.t, x: s.x, y: s.y });
      const j = Math.max(0, hist.length - 2), a = hist[j], dx = s.x - a.x, dy = s.y - a.y;    // COG 0,5 s:n siirtymästä
      const cog = Math.hypot(dx, dy) > 0.15 ? norm(Math.atan2(dx, dy) * 180 / Math.PI + s.conv) : null;
      out.push({ t: s.t, hdgT: norm(s.hdg + s.conv), vKn: s.v / KN, cog: cog, rate: s.rate, rudder: s.rudder });
    }
  }
  if (naytteet) naytteet.push(...out);
  return out;
}
function pysayta(s, maxSek) {
  let t = 0; while (s.v / KN > 0.05 && t < maxSek) { L.stepOnce(s, 0.02); t += 0.02; } return t;
}

// ---- Kriteeri 0: käyttäjän tapaus (12 kn suuntaan 107, Nopeus 0, Peruutus 2, 60 s) ----
function kriteeri0(peruutusKn, odotaPysahdys, conv, hairioDeg) {
  const s = kulussa(12, 107, conv), alkuHdgT = norm(s.hdg + s.conv);
  L.orderSpeed(s, 0);
  let tPysahdys = 0;
  if (odotaPysahdys) tPysahdys = pysayta(s, 120); else aja(s, 3, null);
  if (hairioDeg) s.hdg = norm(s.hdg + hairioDeg);        // pieni suuntavirhe pysähtyneenä (jäännös kääntymisestä, puuska, pyöristys)
  L.orderSpeed(s, peruutusKn);
  const ns = aja(s, 60, null);
  let maxErr = 0, cogMin = 999, cogMax = -999, cogN = 0, cogLista = [], vMin = 0;
  for (const n of ns) {
    maxErr = Math.max(maxErr, Math.abs(wrap(n.hdgT - alkuHdgT)));
    vMin = Math.min(vMin, n.vKn);
    if (n.vKn < -1 && n.cog !== null) { cogN++; cogLista.push(n.cog); }
  }
  let cogErr = 0; for (const c of cogLista) cogErr = Math.max(cogErr, Math.abs(wrap(c - norm(alkuHdgT + 180))));
  return { s, ns, maxErr, cogN, cogErr, vMin, tPysahdys, loppuHdgT: norm(s.hdg + s.conv), loppuV: s.v / KN, loppuCog: ns.length ? ns[ns.length - 1].cog : null };
}

console.log('Moduuli: ' + path.relative(process.cwd(), modPath) + (UUSI ? ' (perän käskyt mukana)' : ' (ennen vaihetta 3k)'));
const peruutusKn = UUSI ? -2 : -2;
for (const [nimi, odota, conv, hairio] of [['pysähdys ensin, konvergenssi 0', true, 0, 0], ['pysähdys ensin, konvergenssi -2,86', true, -2.86, 0], ['peruutus 3 s Nopeus 0:n jälkeen (vauhdissa)', false, 0, 0],
    ['pysähdys ensin, suuntavirhe 0,6° alussa', true, 0, 0.6], ['pysähdys ensin, suuntavirhe 1,0° alussa', true, 0, 1.0], ['pysähdys ensin, suuntavirhe 2,0° alussa', true, 0, 2.0], ['pysähdys ensin, suuntavirhe -1,5° alussa', true, 0, -1.5]]) {
  const r = kriteeri0(peruutusKn, odota, conv, hairio);
  tieto('0. ' + nimi, 'pysähtyi ' + r.tPysahdys.toFixed(1) + ' s, suurin suuntapoikkeama 107:stä ' + r.maxErr.toFixed(1) + '°, loppusuunta ' + r.loppuHdgT.toFixed(1) + '°, loppunopeus ' + r.loppuV.toFixed(2) + ' kn, COG-ero 287:stä (kun alle -1 kn, ' + r.cogN + ' näytettä) ' + r.cogErr.toFixed(1) + '°, loppu-COG ' + (r.loppuCog === null ? '–' : r.loppuCog.toFixed(1)));
  if (UUSI) {
    ehto('0. ' + nimi + ': keulasuunta pysyy 107° ± 5°', r.maxErr <= 5, r.maxErr.toFixed(2) + '°');
    ehto('0. ' + nimi + ': COG 287° ± 10° kun perä edellä yli 1 kn', r.cogN > 0 ? r.cogErr <= 10 : false, r.cogN + ' näytettä, suurin ero ' + r.cogErr.toFixed(1) + '°');
    ehto('0. ' + nimi + ': alus ei käänny ympäri', r.maxErr < 90);
  }
}
// Peruutus hidas (-4) vanhalla ohjauksella samassa tapauksessa
if (!UUSI) { const r = kriteeri0(-4, true, 0); tieto('0. vanha "Peruutus hidas" -4 kn', 'suurin suuntapoikkeama ' + r.maxErr.toFixed(1) + '°, loppusuunta ' + r.loppuHdgT.toFixed(1) + '°, loppunopeus ' + r.loppuV.toFixed(2) + ' kn, loppu-COG ' + (r.loppuCog === null ? '–' : r.loppuCog.toFixed(1))); }

// ---- Kriteeri 1: suuntakäskyt peruutuksessa 3 kn ----
// Vanhalla mallilla tutkitaan, mitä tapahtuu, kun navigoija antaa peruutuksessa suuntakäskyn kuten eteenpäin ajossa: Oikea (tosisuunta + 20°) ja Vasen (tosisuunta - 20°).
function peruutusKoe(kn, komento) {
  const s = L.create({ hdg: 107, conv: 0, v: 0, speedKn: 0 });
  L.orderSpeed(s, -kn); aja(s, 40, null);                      // tasaantuu peruutusnopeuteen
  const v0 = s.v / KN, h0 = norm(s.hdg);
  komento(s);
  const ns = aja(s, 20, null);
  let maxVastaan = 0; for (const n of ns) maxVastaan = Math.max(maxVastaan, Math.abs(wrap(n.hdgT - h0)));
  return { v0, h0, h1: norm(s.hdg), dh: wrap(s.hdg - h0), v1: s.v / KN, ns: ns };
}
if (!UUSI) {
  for (const [nimi, d] of [['Oikea +20°', 20], ['Vasen -20°', -20]]) {
    const r = peruutusKoe(3, (s) => L.orderHeading(s, s.orderHdg + d));
    tieto('1. vanha, peruutus 3 kn, suuntakäsky ' + nimi, 'tosisuunta ennen ' + r.h0.toFixed(1) + '°, 20 s kuluttua ' + r.h1.toFixed(1) + '° (muutos ' + r.dh.toFixed(1) + '°), nopeus ' + r.v0.toFixed(2) + ' -> ' + r.v1.toFixed(2) + ' kn');
  }
} else {
  const kn3 = peruutusKoe(3, () => {});
  tieto('1. peruutus 3 kn', 'nopeus ' + kn3.v0.toFixed(2) + ' kn, tosisuunta ' + kn3.h0.toFixed(1));   // -3 ei ole käskettävissä, tämä on vain tasaantumistarkistus
  for (const [nimi, kasky, odotus] of [['Perä vasen', (s) => L.orderStern(s, 'vasen'), 1], ['Perä oikea', (s) => L.orderStern(s, 'oikea'), -1]]) {
    const r = peruutusKoe(3, kasky);
    ehto('1. ' + nimi + ' 3 kn peruutuksessa: tosisuunta muuttuu ' + (odotus > 0 ? 'kasvavaan' : 'pienenevään') + ' suuntaan vähintään 10° 20 s:ssa', r.dh * odotus >= 10, 'muutos ' + r.dh.toFixed(1) + '°, nopeus ' + r.v0.toFixed(2) + ' -> ' + r.v1.toFixed(2) + ' kn');
  }
}

// ---- Peruutusnopeuden raja 4 kn ja käskettyjen nopeuksien tarkkuus ----
if (UUSI) {
  for (const kn of [2, 4]) {
    const s = L.create({ hdg: 107, conv: 0 }); L.orderSpeed(s, -kn); aja(s, 60, null);
    ehto('-' + kn + ' kn käsky toteutuu 0,3 kn tarkkuudella 60 s:ssa', Math.abs(s.v / KN + kn) <= 0.3, (s.v / KN).toFixed(2) + ' kn');
  }
  { // täysi peruutusvipu (suora vipu -1) ei ylitä 4 kn
    const s = L.create({ hdg: 107, conv: 0, helmsman: false }); s.leverCmd = -1; let vmin = 0;
    for (let i = 0; i < 6000; i++) { L.stepOnce(s, 0.02); vmin = Math.min(vmin, s.v / KN); }
    ehto('täysi peruutusvipu 120 s: nopeus ei ylitä 4 kn peruutukseen', vmin >= -4.0 - 1e-6, 'suurin peruutusnopeus ' + (-vmin).toFixed(3) + ' kn');
  }
  { // nopeusaskellus: 0 -> -2 -> -4 -> ei alle -4 -> -2 -> 0 -> 2
    const s = L.create({}); const seq = [];
    for (const d of [-1, -1, -1, 1, 1, 1]) { L.stepSpeedOrder(s, d); seq.push(s.orderSpeedKn); }
    ehto('nopeusaskellus -2/+2 nollan alapuolella', JSON.stringify(seq) === JSON.stringify([-2, -4, -4, -2, 0, 2]), JSON.stringify(seq));
    ehto('speedText', L.speedText(-2) === 'Peruutus 2 kn' && L.speedText(-4) === 'Peruutus 4 kn' && L.speedText(12) === 'Nopeus 12 kn', L.speedText(-2) + ' / ' + L.speedText(-4));
  }
}
// ---- Perän käskyt: Suoraan, toisto, kääntymisnopeuden raja, perän käsky päättyy nopeuskäskyyn ----
if (UUSI) {
  { // Suoraan pysäyttää kierron ja pitää suunnan
    const s = L.create({ hdg: 107, conv: 0 }); L.orderSpeed(s, -2); aja(s, 30, null);
    L.orderStern(s, 'vasen'); aja(s, 15, null); const h1 = norm(s.hdg), r1 = s.rate;
    L.orderStraight(s); const ns = aja(s, 20, null), hs = norm(s.hdg), ord = s.orderHdg;
    ehto('Suoraan: kierto loppuu 20 s:ssa (kääntymisnopeus alle 0,3 °/s), suunta pysyy', Math.abs(s.rate) < 0.3 && Math.abs(wrap(norm(ns[ns.length - 1].hdgT) - norm(ns[ns.length - 8].hdgT))) < 0.5, 'perän käsky 15 s: suunta ' + h1.toFixed(1) + '° (kierto ' + r1.toFixed(2) + ' °/s), Suoraan: loppusuunta ' + hs.toFixed(1) + '°, käsketty ' + ord + '°, kierto ' + s.rate.toFixed(2) + ' °/s');
    ehto('Suoraan: käsketty suunta on 2° sisällä loppusuunnasta', Math.abs(wrap(hs - ord)) <= 2, Math.abs(wrap(hs - ord)).toFixed(2) + '°');
    const hHold = norm(s.hdg); aja(s, 30, null); ehto('Suoraan: suunta pysyy 30 s lisää alle 1° muutoksella', Math.abs(wrap(norm(s.hdg) - hHold)) < 1, wrap(norm(s.hdg) - hHold).toFixed(2) + '°');
  }
  { // sama käsky kahdesti ei kirjaudu kahdesti, uusi käsky vaihtaa suunnan
    const s = L.create({ hdg: 107, conv: 0 }); L.orderSpeed(s, -2);
    const a = L.orderStern(s, 'vasen'), b = L.orderStern(s, 'vasen'), n = s.cmdLog.filter(c => c.kind === 'stern').length;
    ehto('perän käsky: toisto ei kirjaudu uudelleen', a === true && b === false && n === 1, 'kirjauksia ' + n);
    aja(s, 10, null); L.orderStern(s, 'oikea'); const d0 = s.hdg; aja(s, 25, null);
    ehto('perä vasen -> perä oikea: suunta kääntyy takaisin pienenevään suuntaan', wrap(s.hdg - d0) < -5, wrap(s.hdg - d0).toFixed(1) + '°');
    ehto('käskyteksti', L.orderHeadingText(s) === 'Perä oikea' && L.sternText('vasen') === 'Perä vasen', L.orderHeadingText(s));
  }
  { // peruutuksen päättyessä perän käsky päättyy ja suunta pidetään
    const s = L.create({ hdg: 107, conv: 0 }); L.orderSpeed(s, -2); aja(s, 30, null); L.orderStern(s, 'vasen'); aja(s, 10, null);
    L.orderSpeed(s, 0); const hs = s.orderHdg; aja(s, 40, null);
    ehto('Nopeus 0 päättää perän käskyn: sternTurn tyhjä, kierto loppuu ja suunta on käsketty', s.sternTurn === null && Math.abs(s.rate) < 0.3 && Math.abs(wrap(norm(s.hdg) - hs)) < 2, 'suunta ' + norm(s.hdg).toFixed(1) + '°, käsketty ' + hs + '°');
  }
  { // kääntymisnopeus peruutuksessa enintään 60 % eteenpäin ajon arvosta samalla nopeudella, paikallaan 10 °/s
    const f = L.create({ helmsman: false, hdg: 0, conv: 0 }); f.v = 3 * KN; f.leverCmd = L.leverForSpeed(3 * KN); f.rudderCmd = 1; aja(f, 6, null);
    const b = L.create({ helmsman: false, hdg: 0, conv: 0 }); b.v = -3 * KN; b.leverCmd = L.leverForSpeed(-3 * KN); b.rudderCmd = 1; aja(b, 6, null);
    ehto('peruutuksen kääntymisnopeus 3 kn:ssa täydellä ruorilla on enintään 60 % eteenpäin ajon arvosta', Math.abs(b.rate) <= 0.6 * Math.abs(f.rate) + 0.05, 'eteenpäin ' + f.rate.toFixed(2) + ' °/s, peruutus ' + b.rate.toFixed(2) + ' °/s');
    const z = L.create({ helmsman: false, hdg: 0, conv: 0 }); z.rudderCmd = 1; aja(z, 4, null);
    ehto('kääntyminen paikallaan säilyy 10 °/s:ssa', Math.abs(z.rate - 10) < 0.1, z.rate.toFixed(2) + ' °/s');
    ehto('maxTurnRate peruutuksessa 3 kn', Math.abs(L.maxTurnRate(-3 * KN) / (Math.PI / 180) - 6) < 0.05, (L.maxTurnRate(-3 * KN) / (Math.PI / 180)).toFixed(2) + ' °/s');
  }
  { // Perä vasen: perä liikkuu vasemmalle. Alus kääntyy keula oikealle ja liikkuu perä edellä, joten sijainti siirtyy keulasuuntaan nähden vasemmalle taakse
    const s = L.create({ hdg: 0, conv: 0, x: 0, y: 0 }); L.orderSpeed(s, -2); aja(s, 30, null); const x0 = s.x; L.orderStern(s, 'vasen'); aja(s, 20, null);
    ehto('perä vasen: alus kääntyy keula oikealle (suunta 0 -> positiivinen) ja perä liikkuu vasemmalle (x pienenee)', wrap(s.hdg) > 10 && s.x < x0, 'suunta ' + wrap(s.hdg).toFixed(1) + '°, x ' + (s.x - x0).toFixed(1) + ' m');
  }
}
console.log(fails ? ('\n' + fails + ' testiä epäonnistui') : '\nPeruutustestit valmiit');
process.exit(fails ? 1 : 0);
