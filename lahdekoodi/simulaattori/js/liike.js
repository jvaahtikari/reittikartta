/* Simulaattori – aluksen liikemalli ja simulaation tila.
 *
 * Karkea ja tarkoituksella yksinkertainen malli Pv417 Repalle. Ei hydrodynamiikkaa mutta voimamalli:
 * kiihtyvyys = (T - R) / m, jossa työntö T(vipu, v) = Tmax * vipu * (1 - 0,3 * v / 35 kn) ja vastus R(v) on käyrä,
 * jossa on liukukynnys: uppoumavastus kasvaa neliöllisesti huippuun 16 kN noin 12 solmussa, laskee 12 kN:iin 17 solmussa
 * (vene nousee liukuun) ja nousee sitten tasaisesti 21 kN:iin 35 solmussa. Siksi sama vivun asento pitää veneen joko
 * liu'ussa tai sen alapuolella, kynnyksen ylitys vaatii hetkellisesti enemmän vipua, ja liu'un vaatimaa vähemmän vipua
 * käytettäessä nopeus putoaa uppoumanopeuteen. Kaikki luvut ovat SETTINGS-oliossa ja ne kalibroidaan oikealla veneellä.
 * Lähteet: Käsikirja 25.6.2014 (matkanopeus 28 kn, huippunopeus 35 kn, 2 x 375 kW, 2 x Rolls-Royce FF340,
 * massa 15 500 kg, crash stop matkanopeudesta noin 40 m) ja tilaajan tarkennukset (työntö, vastus, ohjausviiveet).
 *
 * Ohjaus: navigoija antaa tosisuuntakäskyjä (5 asteen askelin, loiva käännös erikseen) ja nopeuskäskyjä (solmuina, 2 kn:n askelin),
 * ja simuloitu ruorimies toteuttaa ne 0,8 s:n viiveellä: suunnalle P-säädin ruorikulmalle (tavallinen käännös noin 15 asteen
 * ruorilla, loiva noin 7 asteen) ja nopeudelle yksi yhdistetty vipu (kierrosluku ja vipu yhdessä, -100 ... +100 %), jota hän
 * nostaa, kunnes käsketty nopeus täyttyy, ja liukukynnyksen yli hän antaa hetkellisesti enemmän. Vipu on mallin sisäinen suure.
 * Suora ohjaus (helmsman = false, ruori ja vipu asetetaan suoraan) on asetus myöhempää parityötä varten.
 *
 * Peruutus (vaihe 3k): peruutusnopeus on 0-4 kn (askel 2 kn), ja peruutuksessa navigoija antaa suunnan perän suuntana ("Perä vasen", "Perä oikea", "Suoraan").
 * Perä vasemmalle tarkoittaa keulaa oikealle eli tosisuunta kasvaa, perä oikealle päinvastoin. Perän käsky pysyy voimassa, kunnes annetaan "Suoraan" tai uusi käsky.
 * Ruorimies toteuttaa suuntakäskyn ohjaimen oikealla suunnalla: vesisuihkussa ohjausvoima ja kääntymisen suunta kääntyvät, kun alus liikkuu perä edellä
 * (steerSign), joten sama suunnansäädin (P-säädin) pitää keulasuunnan myös peruutuksessa. Käsketty tosisuunta ei vaihdu peruutuksessa, eikä ruorimies yritä
 * ajaa peruuttaen käskettyyn suuntaan. Kääntymisnopeus peruutuksessa on enintään reverseTurnFactor (60 %) eteenpäin ajon arvosta samalla nopeudella,
 * ja paikallaan kääntyminen (turnStaticDegPerSec) säilyy. Lähde peruutuksen ohjaukselle on kuvattu RAPORTTI_vaihe3k.md:ssä.
 *
 * Tila on erillään näkymistä: sijainti (x, y metriä maailmakoordinaatistossa, ks. paikka.js), suunta
 * (ruutusuunta asteina), nopeus (m/s), vipu, ruori, trimmi, kallistus, aika ja komentoloki.
 *
 * Tuuli (vaihe 4, 28.10.2026, siirtosuunnitelma RAPORTTI_vaihe3m.md kohta 4.2, omin sanoin, idea maritime-ship-simulatorista, MPL-2.0, ei koodia):
 * näennäinen tuuli = todellinen tuuli miinus aluksen nopeus veden suhteen. Tuulen voima 0,5 x ilman tiheys x C x A x komponentti x |näennäinen|
 * (sivuprofiili 25 m², keulaprofiili 12 m²). Pitkittäisvoimasta lisätään vain ero tyyneen (nykyinen vastuskäyrä sisältää ilmanvastuksen),
 * ja tehollinen keulakerroin 0,2 on kalibrointivalinta: vastatuuli 10 m/s hidastaa 20 kn:n ajoa alle 1 kn. Sivuttaisnopeus vs (sorto) hidastuu
 * veden sivuvastukseen (neliöllinen osa) ja nostovoimaan, joka kasvaa vauhdin mukana, joten sorto on selvä paikallaan (noin 0,9 kn 10 m/s
 * sivutuulessa) ja pieni ajossa (alle 1,5° 20 kn:ssa). Kääntömomentti: tuulen vaikutuskeskus on veden sivuvastuksen keskiön edessä (ohjaamo
 * ja keula korkealla), joten hitaalla nopeudella keula kääntyy tuulesta poispäin. Vauhdissa suihkujen ja rungon suuntavakaus voittaa.
 * Momentti lisätään kääntymisnopeuden tavoitteeseen, ja ruorimiehen P-säädin korjaa sen ruorilla. Tyynellä (tuuli 0) malli on ennallaan.
 *
 * Moduuli toimii selaimessa (window.Liike) ja Nodessa (module.exports). */
(function (root) {
  'use strict';
  var KN = 1852 / 3600;        // yksi solmu m/s
  var RAD = Math.PI / 180;

  var SETTINGS = {
    massKg: 15500,             // massa täydellä kuormalla (käsikirja)
    tMaxN: 30000,              // enimmäistyöntö paikallaan täydellä vivulla (paaluveto noin 3 000 kg, crash stopin peruutustyöntö 25-29 kN)
    thrustSpeedLoss: 0.3,      // työnnön väheneminen nopeuden mukana: T = Tmax * vipu * (1 - 0,3 * v / vRef)
    thrustRefKn: 35,
    rHumpN: 16000, humpKn: 12,            // vastuksen liukukynnyshuippu
    rPlaneN: 12000, planeKn: 17,          // vastus liu'un alussa
    rTopN: 21000, topKn: 35,              // vastus huippunopeudella
    planeExp: 1.3,                        // vastuskäyrän kupera nousu 17 -> 35 kn (28 kn:n pitävä vipu noin 73 %)
    rLowN: 1500,                          // pieni nopeuden lineaarinen vastus, jotta paikalleen pysähtyminen ei veny (kN-yksikössä 1,0 * v_kn * exp(-v_kn / 3))
    reverseDragFactor: 2.5,               // peruutuksessa vastus kasvaa nopeammin (suihkut eivät tuota täyttä työntöä), peruutusnopeus noin 10 kn
    crashLever: -1,                       // crash stop: täysi peruutusvipu heti
    crashEndMs: 0.15,                     // crash stop päättyy, kun nopeus alle tämän (m/s)
    helmsmanDelaySec: 0.8,                // simuloidun ruorimiehen viive käskylle (asetus)
    headingStepDeg: 5, headingStepLongDeg: 10,   // suuntakäskyn askel (pitkä painallus tai Shift: 10)
    speedStepKn: 2,                       // nopeuskäskyn askel
    reverseMaxKn: 4,                      // suurin peruutusnopeus (kn): nopeuskäsky ei mene alle -4 kn, ja nopeus rajataan tähän täydelläkin peruutusvivulla
    reverseTurnFactor: 0.6,               // kääntymisnopeus peruutuksessa enintään tämä osuus eteenpäin ajon arvosta samalla nopeudella
    reverseTurnBlendKn: 0.5,              // paikallaan 100 % (10 °/s), tästä nopeudesta alkaen reverseTurnFactor
    sternTurnDeg: 15,                     // perän käskyn ruorikulma (aste), sama kuin tavallisen käännöksen
    sternStopLeadSec: 0.6,                // "Suoraan": tavoitesuunta = suunta + kääntymisnopeus * tämä (ruori ehtii vaimentaa kierron)
    rudderMaxDeg: 35,                     // ruorikulma 100 %:n kohdalla (vesisuihkun suutin)
    rudderNormalDeg: 15, rudderGentleDeg: 7,   // ruorimiehen tavallisen ja loivan käännöksen ruorikulma
    hdgKp: 1.2, hdgKd: 1.0,               // suunnan P-säätö: ruorikulma = Kp * virhe - Kd * kääntymisnopeus (aste, aste/s)
    hdgDeadDeg: 0.5,
    hdgKi: 0.25, hdgIMax: 40,             // tuulessa: suuntavirheen integraali (aste x s) ruorikulmaan, enimmäisarvo
    leverKpPerKn: 0.04,                   // vivun lisäys nopeusvirhettä kohti (liukukynnyksen yli hän antaa enemmän)
    leverKiPerKnSec: 0.006,               // vivun hidas korjaus nopeusvirheen integraalista (ruorimies hakee oikean asennon)
    leverGuessPerKn: 1 / 35,              // ruorimiehen ensiarvaus vivun asennosta käsketyllä nopeudella (lineaarinen, 28 kn = 80 %)
    leverRatePerSec: 0.3,                 // vivun liikuttamisnopeus (osuutta koko liikkeestä sekunnissa)
    speedSenseLagSec: 2.5,                // ruorimiehen nopeuden havainnon seuranta
    radiusLowKn: 5, radiusLowM: 12,       // kääntösäde 5 kn:ssa (oletus)
    radiusHighKn: 30, radiusHighM: 70,    // kääntösäde 30 kn:ssa (oletus)
    turnStaticDegPerSec: 10,   // kääntyminen paikallaan täydellä ruorilla (oletus, tilaajan tarkennus, kalibroidaan oikealla veneellä)
    draftM: 1.1,               // syväys pohjakosketuksessa (Pv417:n perehdytysmateriaali 1,1 m, käsikirjan 0,9 m on sarjan yleisarvo)
    rudderLagSec: 0.35,        // ruorin seuranta, s
    yawLagSec: 0.4,            // kääntymisnopeuden seuranta, s
    heelMaxDeg: 8,             // kallistus käännöksessä sisäänpäin, enintään
    heelRefAccel: 3.0,         // keskihakukiihtyvyys, jolla enimmäiskallistus saavutetaan, m/s2
    heelLagSec: 0.6,
    // Trimmi (keulan nousu) sidotaan vastuskäyrän liukukynnykseen: piste [kn kynnyksen 12 kn:n suhteessa, aste]
    trimPoints: [[0, 0], [6, 0.4], [10, 4.6], [12, 5], [14, 5], [17, 4.2], [22, 3.2], [28, 2.5], [35, 2.5]],
    trimLagSec: 1.0,
    maxSubStep: 0.05,          // integroinnin enimmäisaskel, s
    // tuuli (vaihe 4)
    airRho: 1.225, waterRho: 1000,
    windSideAreaM2: 25, windFrontAreaM2: 12,   // tuulipinta-alat (arvio piirustuksista)
    windCy: 1.0, windCx: 0.2,                 // sivuttainen kerroin ja tehollinen keulakerroin (kalibroitu, ks. otsikko)
    latDragCd: 1.2, latAreaM2: 11.0,          // veden sivuvastus: kerroin ja ala (12,25 m x 0,9 m)
    latLiftNs2: 1200,                         // nostovoiman vaimennus N / (m/s)² (vauhti x sivunopeus)
    latMassFactor: 1.4,                       // sivuttaisliikkeen lisätty massa
    windYawRadPerN: 4.5e-5,                   // tuulen kääntövaikutus paikallaan (rad/s newtonia kohti), 10 m/s sivutuulessa noin 4 °/s
    windYawFadeKn: 5                          // kääntövaikutus vaimenee nopeuden mukana: 1 / (1 + (kn / 5)²)
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Vastus N nopeudella v (m/s, voi olla negatiivinen)
  function resistance(v) {
    var S = SETTINGS, kn = Math.abs(v) / KN, r;
    if (v < 0) {
      r = S.reverseDragFactor * S.rHumpN * Math.pow(kn / S.humpKn, 2) + S.rLowN * kn * Math.exp(-kn / 3);
      return -r;
    }
    if (kn <= S.humpKn) r = S.rHumpN * Math.pow(kn / S.humpKn, 2);
    else if (kn <= S.planeKn) r = lerp(S.rHumpN, S.rPlaneN, (kn - S.humpKn) / (S.planeKn - S.humpKn));
    else r = S.rPlaneN + (S.rTopN - S.rPlaneN) * Math.pow(Math.min(1.2, (kn - S.planeKn) / (S.topKn - S.planeKn)), S.planeExp);
    return r + S.rLowN * kn * Math.exp(-kn / 3);
  }
  // Työntö N vivun asennolla (-1..1) ja nopeudella v (m/s)
  function thrust(lever, v) {
    var S = SETTINGS, f = Math.max(0, 1 - S.thrustSpeedLoss * Math.abs(v) / (S.thrustRefKn * KN));
    return S.tMaxN * clamp(lever, -1, 1) * f;
  }
  // Crash stopin matka ja aika annetusta nopeudesta (testikäyttöön)
  function crashStopDistance(fromKn) {
    var s = create({ v: fromKn * KN, helmsman: false }); s.crashCmd = true; var d0 = s.dist, t = 0;
    while (s.v > 0 && t < 120) { stepOnce(s, 0.005); t += 0.005; }
    return { dist: s.dist - d0, time: t };
  }

  // Kääntösäde m nopeudella v (m/s): lineaarinen kahden pisteen välillä, alle alarajan vakio
  function turnRadius(v) {
    var kn = Math.abs(v) / KN, S = SETTINGS;
    var r = S.radiusLowM + (kn - S.radiusLowKn) / (S.radiusHighKn - S.radiusLowKn) * (S.radiusHighM - S.radiusLowM);
    return Math.max(S.radiusLowM, r);
  }
  // Suurin kääntymisnopeus rad/s täydellä ruorilla
  function maxTurnRate(v) {
    var r = Math.max(SETTINGS.turnStaticDegPerSec * RAD, Math.abs(v) / turnRadius(v));
    if (v < 0) r *= lerp(1, SETTINGS.reverseTurnFactor, clamp(Math.abs(v) / (SETTINGS.reverseTurnBlendKn * KN), 0, 1));   // peruutuksessa enintään 60 %, paikallaan 100 %
    return r;
  }
  function trimTarget(v) {
    var S = SETTINGS, k = S.humpKn / 12, kn = Math.max(0, v) / KN / k, p = S.trimPoints;
    if (kn <= p[0][0]) return p[0][1];
    for (var i = 1; i < p.length; i++) {
      if (kn <= p[i][0]) return lerp(p[i - 1][1], p[i][1], (kn - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
    }
    return p[p.length - 1][1];
  }

  function wrap180(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function trueHdg(s) { return norm360(s.hdg + s.conv); }

  function create(init) {
    init = init || {};
    var conv = init.conv || 0, hdg = init.hdg || 0, ht = Math.round(norm360(hdg + conv));
    return {
      t: 0,                    // simulaatioaika s
      clockMs: init.clockMs || Date.now(),   // kellonaika (ms, UTC)
      x: init.x || 0, y: init.y || 0,        // m, maailmakoordinaatisto
      hdg: hdg,                              // ruutusuunta, aste (tosisuunta = ruutusuunta + conv)
      conv: conv,                            // meridiaanikonvergenssi (aste), sovellus päivittää sijainnin mukaan
      v: init.v || 0,                        // m/s
      vs: 0,                                 // sivuttaisnopeus veden suhteen (sorto), m/s, positiivinen oikealle
      windFrom: init.windFrom || 0, windSpeed: init.windSpeed || 0,   // todellinen tuuli: tosisuunta, josta tuulee (aste) ja nopeus (m/s)
      // navigoijan käskyt
      orderHdg: ht,                          // käsketty tosisuunta, aste
      orderSpeedKn: init.speedKn || 0,       // käsketty nopeus, solmua (negatiivinen = peruutus)
      gentleNext: false,                     // seuraava käännös merkitty loivaksi
      sternTurn: null,                       // peruutuksessa annettu perän käsky: 'vasen', 'oikea' tai null (Suoraan)
      // ruorimiehen toteuttamat käskyt (viiveen jälkeen)
      hmHdg: ht, hmSpeedKn: init.speedKn || 0, hmGentle: false, hmStern: null,
      pending: [],                           // viiveessä olevat käskyt {at, kind, value, gentle}
      helmsman: init.helmsman !== false,     // false: ruori ja vipu asetetaan suoraan (rudderCmd, leverCmd)
      speedSense: init.v ? init.v / KN : 0,  // ruorimiehen havaitsema nopeus, kn
      leverTrim: 0,                          // ruorimiehen vivun perusasento (integraattori)
      leverCmd: init.lever || 0,             // vivun tavoite (ruorimiehen käsi)
      rudderCmd: 0,                          // ruorin tavoite -1..1 (positiivinen oikealle)
      crashCmd: false, crashActive: false,
      rudder: 0,                             // toteutunut ruori -1..1
      lever: init.lever || 0,                // toteutunut vipu -1..1
      rate: 0,                               // kääntymisnopeus aste/s, positiivinen = oikealle
      trim: 0, roll: 0,                      // aste
      dist: 0,                               // kuljettu matka m
      speedFactor: 1,                        // aikakerroin (vaikuttaa vain stepFrame-funktioon)
      cmdLog: []                             // komentoloki: {t, clockMs, kind, value, gentle, x, y, hdg, v}
    };
  }

  function logCmd(s, kind, value, extra) {
    var e = { t: s.t, clockMs: s.clockMs, kind: kind, value: value, x: s.x, y: s.y, hdg: s.hdg, hdgTrue: trueHdg(s), v: s.v };
    if (extra) for (var k in extra) e[k] = extra[k];
    s.cmdLog.push(e);
  }
  function queue(s, kind, value, gentle) {
    var d = SETTINGS.helmsmanDelaySec;
    if (!s.helmsman || d <= 0) apply(s, { kind: kind, value: value, gentle: gentle });
    else s.pending.push({ at: s.t + d, kind: kind, value: value, gentle: gentle });
  }
  function apply(s, o) {
    if (o.kind === 'heading') { s.hmHdg = o.value; s.hmGentle = !!o.gentle; }
    else if (o.kind === 'speed') { s.hmSpeedKn = o.value; s.leverTrim = o.value < 0 ? leverForSpeed(o.value * KN) : Math.max(0, o.value) * SETTINGS.leverGuessPerKn; }
    else if (o.kind === 'stern') { s.hmStern = o.value; }
    else if (o.kind === 'straight') {                  // Suoraan: ruorimies pitää suunnan, jossa alus on (ruorin vaimennus huomioiden)
      s.hmStern = null; s.hmGentle = false;
      s.hmHdg = norm360(Math.round((trueHdg(s) + s.rate * SETTINGS.sternStopLeadSec) * 10) / 10);
      s.orderHdg = norm360(Math.round(s.hmHdg));
    }
  }
  // Suuntakäsky (tosisuunta, aste). Jos loiva on merkitty, käsky ja merkintä kirjataan yhdessä ja merkintä kuluu.
  function orderHeading(s, trueDeg) {
    var h = norm360(Math.round(trueDeg)), g = s.gentleNext;
    s.orderHdg = h; s.gentleNext = false; s.sternTurn = null;
    logCmd(s, 'heading', h, { gentle: g });
    queue(s, 'heading', h, g);
  }
  function stepHeadingOrder(s, dir, long) {
    var st = long ? SETTINGS.headingStepLongDeg : SETTINGS.headingStepDeg;
    orderHeading(s, s.orderHdg + dir * st);
  }
  // Loiva käännös: merkitsee seuraavan suuntakäskyn loivaksi (kytkin)
  function toggleGentle(s) {
    s.gentleNext = !s.gentleNext;
    logCmd(s, 'gentle', s.gentleNext ? 1 : 0);
  }
  function orderSpeed(s, kn) {
    kn = clamp(Math.round(kn), -SETTINGS.reverseMaxKn, 35);
    if (kn >= 0 && s.sternTurn) orderStraight(s);      // perän käsky päättyy, kun peruutus päättyy: ruorimies pitää senhetkisen suunnan
    s.orderSpeedKn = kn; logCmd(s, 'speed', kn); queue(s, 'speed', kn, false);
  }
  // Nopeuskäskyn askel (2 kn) toimii myös nollan alapuolella: 0 -> -2 -> -4 (ei alle -4) ja takaisin -2 -> 0 -> 2
  function stepSpeedOrder(s, dir) {
    orderSpeed(s, clamp(s.orderSpeedKn + dir * SETTINGS.speedStepKn, -SETTINGS.reverseMaxKn, 35));
  }
  function orderReverse(s, kn) { orderSpeed(s, -Math.abs(kn)); }
  // Perän käsky peruutuksessa: dir 'vasen' (perä vasemmalle, keula oikealle, tosisuunta kasvaa) tai 'oikea'. Sama käsky uudestaan ei kirjaudu uudelleen.
  function orderStern(s, dir) {
    if (dir !== 'vasen' && dir !== 'oikea') return false;
    if (s.sternTurn === dir) return false;
    s.sternTurn = dir; s.gentleNext = false;
    logCmd(s, 'stern', dir); queue(s, 'stern', dir, false);
    return true;
  }
  // Nappien askel: dir -1 = vasen nappi (perä vasen), +1 = oikea nappi (perä oikea)
  function stepSternOrder(s, dir) { return orderStern(s, dir < 0 ? 'vasen' : 'oikea'); }
  // Suoraan: perän käsky päättyy ja nykyinen keulasuunta pidetään
  function orderStraight(s) {
    // käsketty suunta = suunta, johon alus asettuu (nykyinen suunta ja kierto ruorimiehen viiveen ja vaimennuksen ajan), joten käskyrivin suunta ei hypi, kun ruorimies toteuttaa käskyn
    var d = s.helmsman ? SETTINGS.helmsmanDelaySec : 0;
    s.sternTurn = null; s.orderHdg = norm360(Math.round(trueHdg(s) + s.rate * (d + SETTINGS.sternStopLeadSec)));
    logCmd(s, 'straight', 1); queue(s, 'straight', null, false);
  }
  // Crash stop: heti, ei viivettä. Täysi peruutusvipu, kunnes alus on pysähtynyt, ja nopeuskäsky nollataan.
  function crashStop(s) {
    if (s.v > SETTINGS.crashEndMs) {
      s.crashCmd = true; s.pending = s.pending.filter(function (p) { return p.kind !== 'speed'; });
      s.orderSpeedKn = 0; s.hmSpeedKn = 0; logCmd(s, 'crash', 1);
    }
  }

  // Pysäytys esteeseen osuttaessa (laituri, kivi, silta): nopeus, kierto ja vipu nollataan, nopeuskäsky nollataan eikä ruorimies yritä ajaa uudelleen esteeseen
  // (käskyä ei kirjata komentolokiin, esteeseen osuminen kirjataan erikseen). Suunta pidetään siinä, mihin alus jäi, ja perän käsky päättyy.
  function halt(s) {
    s.v = 0; s.vs = 0; s.rate = 0; s.lever = 0; s.leverCmd = 0; s.leverTrim = 0; s.speedSense = 0; s.rudderCmd = 0; s.rudder = 0;
    s.crashCmd = false; s.crashActive = false;
    s.pending = s.pending.filter(function (p) { return p.kind === 'gentle'; });
    s.orderSpeedKn = 0; s.hmSpeedKn = 0; s.sternTurn = null; s.hmStern = null; s.gentleNext = false; s.hmGentle = false;
    s.orderHdg = norm360(Math.round(trueHdg(s))); s.hmHdg = trueHdg(s);
  }

  // Ruorimiehen suunnansäätö: ruorikulma -1..1
  // Ohjausmerkki: kun alus liikkuu perä edellä, sama ruorin asento kääntää alusta toisin päin kuin eteenpäin ajossa (vesisuihkun ohjausvoima ja virtaus kääntyvät).
  // Ruorimies kertoo säätimen tuloksen tällä merkillä, joten ruorin asennon seuraus keulasuuntaan on aina sama kuin käsketty (liike ja säädin käyttävät samaa funktiota).
  function steerSign(s) { return s.v < -0.01 ? -1 : 1; }
  function helmRudder(s) {
    var S = SETTINGS, sg = steerSign(s);
    if (s.hmStern) {                                  // pidetty perän käsky: perä vasemmalle = keula oikealle = tosisuunta kasvaa
      var dir = s.hmStern === 'vasen' ? 1 : -1;
      return clamp(sg * dir * S.sternTurnDeg / S.rudderMaxDeg, -1, 1);
    }
    var e = wrap180(s.hmHdg - trueHdg(s)), lim = s.hmGentle ? S.rudderGentleDeg : S.rudderNormalDeg;
    if (Math.abs(e) < S.hdgDeadDeg && Math.abs(s.rate) < 0.3) {
      if (s.hmGentle) s.hmGentle = false;           // käännös valmis, loiva-merkintä kuluu
      return 0;
    }
    if (Math.abs(e) < 1.0 && Math.abs(s.rate) < 0.6 && s.hmGentle) s.hmGentle = false;
    // tuulessa ruorimies pitää ruoria tuulta vastaan (hidas korjaus suuntavirheen integraalista), tyynellä ei käytössä
    if (s.windSpeed > 0 && Math.abs(e) < 20) s.hdgI = clamp((s.hdgI || 0) + e * s._dt, -S.hdgIMax, S.hdgIMax); else s.hdgI = 0;
    var rd = clamp(S.hdgKp * e - S.hdgKd * s.rate + S.hdgKi * (s.hdgI || 0), -lim, lim);
    return clamp(sg * rd / S.rudderMaxDeg, -1, 1);
  }
  // Ruorimiehen nopeussäätö: vivun tavoite -1..1. Pito-ohjaus (vipu, joka pitää käsketyn nopeuden) ja virhe lisää vipua.
  function helmLever(s, dt) {
    var S = SETTINGS, vt = s.hmSpeedKn;
    s.speedSense += (s.v / KN - s.speedSense) * (1 - Math.exp(-dt / S.speedSenseLagSec));
    if (vt === 0) { s.leverTrim = 0; return 0; }
    var err = vt - s.speedSense;
    s.leverTrim = clamp(s.leverTrim + S.leverKiPerKnSec * err * dt, -1, 1);
    return clamp(s.leverTrim + S.leverKpPerKn * err, -1, 1);
  }

  // Tuulen voimat: { fx: pitkittäisvoiman ero tyyneen (N, + eteenpäin), fy: sivuvoima (N, + oikealle), app: näennäisen tuulen nopeus m/s, rel: näennäisen tuulen suunta keulasta (aste, mistä tuulee) }
  function windForces(s) {
    var S = SETTINGS, h = trueHdg(s) * RAD, to = (s.windFrom + 180) * RAD;
    // todellinen tuuli (tosikoordinaatit, itä ja pohjoinen) aluksen akseleille: eteen ja oikealle
    var we = Math.sin(to) * s.windSpeed, wn = Math.cos(to) * s.windSpeed;
    var wf = we * Math.sin(h) + wn * Math.cos(h), wr = we * Math.cos(h) - wn * Math.sin(h);
    var ax = wf - s.v, ay = wr - s.vs, aa = Math.hypot(ax, ay), q = 0.5 * S.airRho;
    var fx = q * S.windCx * S.windFrontAreaM2 * (ax * aa - (-s.v) * Math.abs(s.v));
    var fy = q * S.windCy * S.windSideAreaM2 * ay * aa;
    return { fx: fx, fy: fy, app: aa, rel: norm360(Math.atan2(-ay, -ax) / RAD) };
  }
  function apparentWind(s) { if (!(s.windSpeed > 0) && !s.vs) return { app: Math.abs(s.v), rel: s.v >= 0 ? 0 : 180 }; var f = windForces(s); return { app: f.app, rel: f.rel }; }
  function setWind(s, fromDeg, speed) { s.windFrom = norm360(Number(fromDeg) || 0); s.windSpeed = Math.max(0, Number(speed) || 0); }

  // Yksi integrointiaskel dt (s)
  function stepOnce(s, dt) {
    var S = SETTINGS;
    while (s.pending.length && s.pending[0].at <= s.t) apply(s, s.pending.shift());
    if (s.helmsman) {
      s._dt = dt;
      s.rudderCmd = helmRudder(s);
      var lt = helmLever(s, dt), maxd = S.leverRatePerSec * dt;
      s.leverCmd += clamp(lt - s.leverCmd, -maxd, maxd);
    }
    // ruori
    s.rudder += (s.rudderCmd - s.rudder) * (1 - Math.exp(-dt / S.rudderLagSec));
    // nopeus: kiihtyvyys = (T - R) / m
    if (s.crashCmd && !s.crashActive) s.crashActive = true;
    var lv = s.crashActive ? S.crashLever : s.leverCmd;
    s.lever = lv;
    var windOn = s.windSpeed > 0 || s.vs !== 0, wf = windOn ? windForces(s) : null;
    var a = (thrust(lv, s.v) - resistance(s.v) + (wf ? wf.fx : 0)) / S.massKg, v0 = s.v;
    s.v += a * dt;
    if (wf) {   // sorto: sivuvoima vastaan veden sivuvastus ja nostovoima
      var dl = 0.5 * S.waterRho * S.latDragCd * S.latAreaM2 * s.vs * Math.abs(s.vs) + S.latLiftNs2 * Math.abs(s.v) * s.vs;
      s.vs += (wf.fy - dl) / (S.massKg * S.latMassFactor) * dt;
      if (!(s.windSpeed > 0) && Math.abs(s.vs) < 0.005) s.vs = 0;
    }
    if (s.v < -S.reverseMaxKn * KN) s.v = -S.reverseMaxKn * KN;   // peruutusnopeuden rajoitin: täydelläkään peruutusvivulla ei yli reverseMaxKn
    if (s.crashActive) {
      if (s.v <= S.crashEndMs) {            // pysähtynyt: vipu neutraaliksi
        s.v = 0; s.crashActive = false; s.crashCmd = false; s.leverCmd = 0; s.speedSense = 0;
        logCmd(s, 'lever0', 0);
      }
    } else if (lv === 0 && Math.abs(s.v) < 0.02 && !(s.windSpeed > 0)) s.v = 0;
    else if (lv === 0 && v0 * s.v < 0) s.v = 0;
    // suunta
    var wTarget = s.rudder * maxTurnRate(s.v) * steerSign(s);   // rad/s
    if (wf) { var kn0 = Math.abs(s.v) / KN; wTarget += S.windYawRadPerN * wf.fy / (1 + Math.pow(kn0 / S.windYawFadeKn, 2)); }   // keula kääntyy tuulesta poispäin (sivuvoiman suuntaan)
    var w = s.rate * RAD;
    w += (wTarget - w) * (1 - Math.exp(-dt / S.yawLagSec));
    s.rate = w / RAD;
    var h0 = s.hdg * RAD;
    s.hdg = ((s.hdg + s.rate * dt) % 360 + 360) % 360;
    var hm = h0 + 0.5 * w * dt;
    var ds = s.v * dt, dsl = s.vs * dt;
    s.x += Math.sin(hm) * ds + Math.cos(hm) * dsl;
    s.y += Math.cos(hm) * ds - Math.sin(hm) * dsl;
    s.dist += Math.hypot(ds, dsl);
    // trimmi ja kallistus
    s.trim += (trimTarget(s.v) - s.trim) * (1 - Math.exp(-dt / S.trimLagSec));
    var ac = s.v * w;                                    // keskihakukiihtyvyys, positiivinen oikealle
    var rollT = clamp(ac / S.heelRefAccel, -1, 1) * S.heelMaxDeg;
    s.roll += (rollT - s.roll) * (1 - Math.exp(-dt / S.heelLagSec));
    s.t += dt;
    s.clockMs += dt * 1000;
  }

  // Edistää simulaatiota dt sekuntia (jaetaan osa-askeliin)
  function advance(s, dt) {
    var n = Math.max(1, Math.ceil(dt / SETTINGS.maxSubStep)), h = dt / n;
    for (var i = 0; i < n; i++) stepOnce(s, h);
  }
  // Kuvakohtainen askel: todellinen kulunut aika kerrottuna aikakertoimella, enintään 0,25 s todellista aikaa
  function stepFrame(s, realDt) {
    if (!(s.speedFactor > 0)) return 0;
    var dt = Math.min(realDt, 0.25) * s.speedFactor;
    advance(s, dt);
    return dt;
  }
  // Vipu, jolla nopeus pysyy v:ssä, apu- ja testikäyttöön
  function leverForSpeed(v) {
    var f = Math.max(1e-6, 1 - SETTINGS.thrustSpeedLoss * Math.abs(v) / (SETTINGS.thrustRefKn * KN));
    return resistance(v) / (SETTINGS.tMaxN * f);
  }
  // Tekstit käyttöliittymälle
  function headingText(h) { var n = Math.round(norm360(h)); return 'Suunta ' + (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function speedText(kn) { return kn < 0 ? 'Peruutus ' + Math.round(-kn) + ' kn' : 'Nopeus ' + Math.round(kn) + ' kn'; }
  function sternText(dir) { return dir === 'vasen' ? 'Perä vasen' : dir === 'oikea' ? 'Perä oikea' : 'Suoraan'; }
  // Käskyn suuntarivi: perän käsky (peruutuksessa) tai suunta
  function orderHeadingText(s) { return s.sternTurn ? sternText(s.sternTurn) : headingText(s.orderHdg); }
  // Kulku (COG) tosisuuntana ja ruutusuuntana: perä edellä liikkuessa 180 astetta keulasuunnan vastaisesti
  // Tuulessa kulku on nopeusvektorin suunta (keulasuunta + sorron kulma).
  function driftDeg(s) { return Math.atan2(s.vs || 0, s.v) / RAD; }
  function cogTrue(s) { return s.vs && Math.hypot(s.v, s.vs) > 0.02 ? norm360(trueHdg(s) + driftDeg(s)) : norm360(trueHdg(s) + (s.v < -0.01 ? 180 : 0)); }
  function cogGrid(s) { return s.vs && Math.hypot(s.v, s.vs) > 0.02 ? norm360(s.hdg + driftDeg(s)) : norm360(s.hdg + (s.v < -0.01 ? 180 : 0)); }
  function sog(s) { return Math.hypot(s.v, s.vs || 0); }

  var api = {
    KN: KN, SETTINGS: SETTINGS, create: create, stepOnce: stepOnce, advance: advance, stepFrame: stepFrame,
    orderHeading: orderHeading, stepHeadingOrder: stepHeadingOrder, toggleGentle: toggleGentle, orderSpeed: orderSpeed,
    stepSpeedOrder: stepSpeedOrder, orderReverse: orderReverse, orderStern: orderStern, stepSternOrder: stepSternOrder, orderStraight: orderStraight, crashStop: crashStop, halt: halt, trueHdg: trueHdg, wrap180: wrap180,
    steerSign: steerSign, cogTrue: cogTrue, cogGrid: cogGrid, sog: sog, windForces: windForces, apparentWind: apparentWind, setWind: setWind, sternText: sternText, orderHeadingText: orderHeadingText,
    resistance: resistance, thrust: thrust, leverForSpeed: leverForSpeed, crashStopDistance: crashStopDistance,
    turnRadius: turnRadius, maxTurnRate: maxTurnRate, trimTarget: trimTarget, headingText: headingText, speedText: speedText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Liike = api;
})(typeof window !== 'undefined' ? window : globalThis);
