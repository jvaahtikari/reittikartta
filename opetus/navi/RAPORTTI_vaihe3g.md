# Raportti, vaihe 3g: merkit kaukana, kiikari ja valonheittimen ehdotus

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Kuvat ovat hakemistossa `lahdekoodi/simulaattori/shots/`, testit hakemistossa `testit/`, työvaiheet `TYOLOKI.md`:ssä (Vaihe 3g).

## Mitä tehtiin

1. Merimerkkien leveys ja näkyvyys etäisyyden mukaan (`js/merimerkit3d.js`, `js/merkit3d.js`). Merkin piirretty leveys on vähintään 1,0 laitepikseliä. Kun todellinen leveys on pienempi, merkki piirretään 1 px leveänä ja sen peittävyys on todellinen leveys jaettuna piirretyllä leveydellä, joten kaukainen merkki haalistuu eikä muutu tummaksi pisteeksi. Näkyvyysrajat ovat viitat ja poijut 1 200 m, kummelit ja pienet kiinteät merkit 2 500 m, linjataulut 4 000 m sekä loistot ja majakat 6 000 m. Merkki alkaa haalistua rajan 70 %:n kohdalta, on täysin läpinäkyvä rajalla eikä sitä piirretä rajan yli. Kiikarilla rajat kerrotaan seitsemällä. Luokka, raja ja leveys ovat vertex-attribuutteja (`nak`) ja yhteisiä uniformeja (`uRaja`, `uKerroin`, `uHaivytys`), joten materiaali on edelleen yksi ja piirtokutsujen määrä ei kasva. Merkkien lataussäde on 7 000 m, näyttösäde 6 500 m ja kiikarilla 9 000 m.
2. Kiikari (`js/nakyma.js`, `js/sim.js`, `simulaattori.html`, `css/sim.css`). Nappi "Kiikari" (76 x 44 px) ja näppäin B. Kuvakulma 7° (`kiikariHfovDeg`), veto-herkkyys jaetaan suurennuksella (7), pystyveto nostaa ja laskee katsetta. Pyöreä maski (leveällä kuvalla kaksi osittain päällekkäistä ympyrää, pystykuvalla soikio ja puhelimessa pienempi reunus), käden tärinä noin 0,15° ja noin 1,5 Hz, joka kasvaa nopeuden ja aallokon mukana, ja horisontin tasaus. Kompassikaistalla näkyy kiikarin suunta ja kapea sektori. Kiikari poistuu napilla, B:llä tai keskelle napauttamalla ja palauttaa entisen kuvakulman ja katseen. Päälle ja pois kirjataan komentolokiin suuntineen (`kiikari`). Kiikarin aikana aluksen oma runko piilotetaan, koska kiikaria pidetään ikkunan ulkopuolella eikä ohjaamon katto saa peittää kuvaa. Puhelimessa pieni karttaikkuna piilotetaan kiikarin ajaksi, koska se peittäisi kompassikaistan lukeman.
3. Valonheittimen toimintaperiaatteen ehdotus vaiheeseen 4 (alla). Ei toteutettu.

## Kriteerit

1. Kuvat. Käyttäjän kuvakaappauksen paikka (Vapaa ajo, Mustalahti, tosisuunta 347°, nopeus 0, Koukkuniemen viitta 30 m päässä): `3g_ennen_mustalahti_347.png` ja `3g_jalkeen_mustalahti_347.png`. Ennen-kuvassa horisontin kohdalla on tummia pisteitä, jälkeen-kuvassa ei. Sama lähtöpaikasta, jossa viitat ovat 1,4 ja 2,2 km päässä: `3g_ennen_lahtopaikka_347.png` (horisontilla tummia pisteitä) ja `3g_jalkeen_lahtopaikka_347.png` (ei pisteitä). Kiikari kohti viittoja: `3g_jalkeen_lahtopaikka_kiikari.png` (1 914 x 1 021, keltamusta pohjoismerkki 1,4 km päässä), `3g_kiikari_desktop.png` (1440 x 900, viitta 1,4 km päässä suunnassa 017°, keltamusta pohjoismerkki erottuu väreiltään) ja `3g_kiikari_puhelin.png` (Pixel 7) sekä `3g_kiikari_puhelin_webkit.png` (iPhone 14).
2. Leveysmittaus `testit/leveys3g_pw.py` (oikea Nakyma-moottori, viitta taivasta vasten, ikkuna 1 440 x 540, piirtopuskuri 0,55 eli 1,19 laitepikseliä puskuripikseliä kohti). Taulukossa piirretty leveys laitepikseleinä, peittävyys (1 = täysi väri) ja todellinen geometrinen leveys:

| Etäisyys | Näkö | Piirretty | Peittävyys | Todellinen |
|---|---|---|---|---|
| 100 m | paljain silmin | 1,39 px | 1,00 | 1,36 px |
| 300 m | paljain silmin | 1,19 px | 0,38 | 0,45 px |
| 500 m | paljain silmin | 1,19 px | 0,23 | 0,27 px |
| 800 m | paljain silmin | 1,19 px | 0,14 | 0,17 px |
| 1 000 m | paljain silmin | 1,19 px | 0,06 | 0,14 px |
| 1 150 m | paljain silmin | ei piirretä (haalistunut) | 0,01 | 0,12 px |
| 1 500 m | paljain silmin | ei piirretä | 0,01 | 0,09 px |
| 1 500 m | kiikari | 1,78 px | 0,99 | 1,77 px |
| 3 000 m | kiikari | 1,19 px | 0,70 | 0,88 px |
| 6 000 m | kiikari | 1,19 px | 0,27 | 0,44 px |
| 8 000 m | kiikari | ei piirretä | 0,03 | 0,33 px |

   Kohdat 300 m (noin 1 px, haalea), 800 m (1 px, haalea) ja 1 500 m paljain silmin (ei piirretä) täyttyvät. Vaatimus "kiikarilla 1 500 m:ssä vähintään 3 px" ei täyty: viitan todellinen leveys 0,225 m on 1 500 m:n päässä 0,0086°, ja 7° kuvakulma jakautuu 1 440 pikselille, joten leveys on 0,0086 / (7 / 1 440) = 1,77 px. Piirretty leveys on siis geometrisesti oikea, eikä sitä voi kasvattaa vääristämättä merkin kokoa. Kolmeen pikseliin pääsee vasta, kun kuvan leveys on noin 2 500 px (esimerkiksi 1 250 css-pikseliä ja laitepikselisuhde 2) tai kun merkin näkyvä leveys on noin 0,4 m (poiju, jäämerkki tai merkin lippu). Väri erottuu kaikilla näillä etäisyyksillä (peittävyys 0,99 kohdassa 1 500 m).
3. Kiikaritesti `testit/kiikari3g_pw.py`: Chromium 1440 x 900 26/0, Chromium Pixel 7 26/0 ja WebKit iPhone 14 26/0 (tarkistuksia 26, virheitä 0). Kuvakulma 7,000°, veto 200 px antaa 7,14° (odotus 0,25 / 7 °/px) ja pystyveto 100 px antaa 3,57°, tärinä vaihtelee 0,18–0,24° (suurin poikkeama 0,13°), maskin kulmat ovat mustat ja keskusta läpinäkyvä, B, nappi ja keskelle napautus poistavat kiikarin ja palauttavat kuvakulman (100,00° ja 62,30°) ja katseen, komentolokissa on 6 riviä suuntineen ja konsolivirheitä ei ole. Kosketuskohteet vähintään 44 px.
4. Kuvaväli samassa istunnossa `testit/suor3g_pw.py` (vanha 8156 ja uusi 8154 vuorotellen samassa prosessissa, 1 440 x 900, pb 0,55, kaksi kierrosta kummassakin paikassa): paikka A uusi/vanha 1,010 (390,2 ms ja 386,2 ms) ja paikka B 0,966 (393,1 ms ja 407,1 ms). Ero on alle +10 %. Kuvaväli on ympäristössä hidas (noin 390 ms), joten absoluuttiset luvut eivät kuvaa oikeaa laitetta.
5. Vanhat testit ja vaiheen 3f testit läpi (ajettu kaksi virtaa rinnakkain): `mobiili_pw.py` 42/0 Chromium ja 42/0 WebKit, `tutka_mobiili_pw.py` 32/0 ja 30/0, `tutka_asettelu_pw.py` 0 virhettä koissa 915 x 412, 1024 x 768, 1600 x 900 ja 412 x 839, `valkkyminen_pw.py` 0/20 tyhjää ruutua kolmella laitteella (Chromium, WebKit, hiiri), `asettelu_3d_pw.py` 89 tarkistusta OK ja 0 virhettä (ajon aikaraja 900 s täyttyi juuri loppuyhteenvedon alla, kaikki 89 riviä ovat OK), `katse_pw.py` 5/0, 5/0 ja 4/0, `aika_pw.py` 6/0, `plotteri_ev_pw.py` 14/0 ja 12/0, sekä 3f:n `plotteri_ev3f_pw.py` 24/0 (Chromium), 24/0 (WebKit) ja 25/0 (hiiri) ja `kasky_pw.py` 11/0 kolmella laitteella. `build.py` tuotti `simulaattori.html`-tiedoston (1 175 894 tavua, ei ulkoisia script- tai link-viittauksia). Yhden tiedoston versio läpäisee `mobiili_pw.py` Chromium 42/0 (ensimmäisellä ajolla yksi "Vasen kahdesti" -tarkistus meni ohi, kun kaksi muuta testiä ajoi samaan aikaan, ja uusinta yksin antoi 42/0) ja `kiikari3g_pw.py` 26/0. `index.html` ja `lahdekoodi/dist/Reittikartta.html` ovat muuttumattomat (md5 `edff5aed0e4cbb6603e33ef7c858dcce`). Tiedostot `tutka.js` (3a830ee6), `liike.js` (0f319e29), `harjoitus.js` (1a537d51), `plotteri.js` (2b6718cc) ja `maasto.js` (05bb0270, puusto) ovat muuttumattomat md5:llä tarkistettuna.
6. Valonheitinehdotus alla.

## Valonheitin, ehdotus vaiheeseen 4

Tämä on ehdotus. Mitään ei ole toteutettu.

**Käyttötarkoitus.** Pimeässä alus ei näe viittoja, kummeleita, laitureita eikä pieniä veneitä muuten kuin niiden oman valon tai tutkan avulla. Valonheitin antaa kuljettajalle ja tähystäjälle kapean kirkkaan kiilan, jolla voi tunnistaa viitan tai laiturin noin 300–500 m:n päästä.

**Kolmiulotteinen toteutus.**
1. Yksi `THREE.SpotLight` aluksen ohjaamon katolla, kohdassa x noin 5,5 m ja z noin 3,9 m (mallikoordinaatit, x keulaan ja z ylös), kiinni `rig`-ryhmään, jotta se seuraa aluksen kallistusta ja keinuntaa. Kartion kokonaisaukeama noin 6° (`angle` 3°), reunan pehmennys (`penumbra`) 0,3 ja kantama (`distance`) 500 m. Varjoja ei lasketa (`castShadow` pois), koska varjokartta maksaisi enemmän kuin hyöty.
2. Valo vaikuttaa Lambert-materiaaleihin (merimerkit, maamerkit, laiturit, runko) three.js:n omalla valolaskennalla, mutta vesi, taivas ja maasto ovat omia varjostimiaan. Niihin lisätään sama kartiolaskenta yhteisenä uniformina (`uSpot`: sijainti, suunta, kartion sisä- ja ulkokosini, kirkkaus), samalla tavalla kuin kiikarivaiheen `onBeforeCompile`-lisäys merkeissä. Maaston ja veden varjostimiin tulee yksi lisärivi fragmenttivaiheessa.
3. Suuntaus. Oletuksena kiila seuraa kuljettajan katsetta (`gaze`) vaakasuunnassa, jolloin lisäohjaimia ei tarvita ja puhelimessa toimii sama veto ja reunanapit. Pystykulma on säädettävä väliltä -5° ... +10° (kiikarin pystyvedolla on jo vastaava mekanismi). Vaihtoehto, jos tilaaja haluaa erillisen ohjaimen: erillinen suuntakulma kahdella napilla ja näppäimillä. Päälle ja pois nappi "Valonheitin" ja näppäin L.
4. Heijastavat merkit. Viittoihin, kummeleihin ja linjatauluihin lisätään heijastinosuus (`retro`, 0 ... 1), joka kirkastaa merkin värin, kun valo ja katsoja ovat lähellä toisiaan (valonheitin on katsojan vieressä). Kirkkaus vaimenee etäisyyden neliöön ja kartion reunaan. Heijastavan merkin näkyvyysraja valossa on 500 m ja tavallisen maalatun pinnan 150–250 m. Tämä on yksi vertex-attribuutti lisää ja nykyiset `nak`-luokat riittävät pohjaksi.
5. Vesi ja roiskeet. Vesi ei heijasta valoa takaisin kohti katsojaa, joten kiilan sisällä vesi näkyy vain vaaleampana ja aaltojen suuntaisena kimalluksena (veden normaalin ja katselusuunnan mukainen lisäys kiilan sisällä). Roiskevettä ja sadepartikkeleita ei mallinneta. Tämä jätetään vaiheen 4 ulkopuolelle ja kysytään tilaajalta.
6. Kartio sumussa ja sateessa. Kun sumu (`FogExp2`, nyt tiheys 0,000075) tai sade on päällä, kiila piirretään näkyvänä läpikuultavana kartiona (`ConeGeometry`, additiivinen sekoitus, yksi piirtokutsu), jonka kirkkaus kasvaa sumun tiheyden mukana. Kirkas kiila sumussa myös heikentää kauas näkyvyyttä (takaisinsironta), mikä voidaan toteuttaa kirkastamalla sumun väriä kiilan suunnassa. Tämä on harjoituksen kannalta opettavaa, mutta lisäasetus.

**Muutokset `nakyma.js`:n yövalaistukseen.** Nykyinen yö on `setSimTime`-funktiossa: `hemi.intensity` 0,28 ja `sunL.intensity` 0,15 yöllä, ja taivas ja sumun väri tummenevat `day`-kertoimella. Valonheitin ei saa muuttaa tätä. Lisäykset: (a) `SpotLight` ja sen `target` `create`-funktioon, (b) `render`-funktiossa suunnan ja päällä-tilan päivitys, (c) uniform `uSpot` veden, maaston ja merkkien varjostimiin, (d) valonheitin on päällä vain, kun `day` on alle noin 0,5 tai käyttäjä sytyttää sen, (e) valon osuus omaan runkoon rajataan kerrosten tai `userData`-lipun avulla, jotta ohjaamon katto ei häikäise. Lisävalo kasvattaa Lambert-ohjelmien valomäärää yhdellä, joten kaikki Lambert-ohjelmat käännetään uudelleen kerran. Kuvavälin muutosta ei ole mitattu, arvio on +5 ... +10 % ja mitataan vaiheessa 4 samalla vertailulla kuin kriteeri 4.

**Oletukset.**
1. Valonheitin on yksi, ohjaamon katolla ja kiinteällä paikalla, ja sen kiila on noin 6° ja kantama 300–500 m.
2. Valonheitin seuraa katsetta eikä sillä ole omaa ohjainta.
3. Viitoissa ja kummeleissa on heijastinteippi, jonka näkyvyys on selvästi maalattua pintaa parempi.
4. Roiskeita ja sadetta ei mallinneta, mutta sumussa kiila näkyy.
5. Valonheitin vaikuttaa vain 3D-näkymään, ei tutkaan eikä plotteriin.

**Kysymykset tilaajalle.**
1. Millainen valonheitin aluksessa on (valonlähde, kiilan leveys, kantama) ja missä se on? Onko niitä useampi?
2. Onko suunta käsin ohjattava, sähköinen kauko-ohjaus vai ohjaamon ikkunan kautta oleva hakuvalo, ja halutaanko erillinen suuntaus katseesta riippumatta?
3. Onko Suomen väyläviittojen heijastinteippi (väri ja ala) selvitetty, ja ovatko nykyiset viitat, kummelit ja linjataulut mallissa oikeilla pinnoilla (Traficomin ja Väyläviraston merkkikuvaukset)?
4. Pitääkö roiskeet, sade ja häikäisy (kiilan takaisinsironta sumussa kuljettajan silmiin) mallintaa, vai riittääkö näkyvä kiila?
5. Kirjataanko valonheittimen käyttö komentolokiin suuntineen kuten kiikari?
6. Käytetäänkö harjoituksissa pimeää (yö) ja hämärää jo nyt, jotta valonheittimestä on hyötyä? Aloituksen aikavalinta tukee tätä.

## sim.js:n muutokset (tilaajan käsin yhdistettäväksi)

Rivinumerot ovat uuden sim.js:n rivejä, yhteensä 55 muutettua riviä verrattuna vaiheen 3f lopputilaan.

1. Rivi 204 (`applyPanes`): kiikari poistetaan, jos 3D ei ole päänäkymä.
2. Rivi 211 (`sizeViews`): maski piirretään uudelleen koon muuttuessa.
3. Rivi 262 (`startRun`): kiikari pois ajon alussa.
4. Rivit 394–395: Katse suoraan nollaa myös kiikarin pystykulman, ja uusi `binoBtn`-kuuntelija.
5. Rivit 413 ja 419–423: veto-herkkyys jaetaan kiikarin suurennuksella ja pystyveto säätää kiikarin pystykulmaa.
6. Rivit 428–431: keskelle napautus poistaa kiikarin.
7. Rivi 455: näppäin B.
8. Rivit 586–603: uudet funktiot `lookTrue`, `loadAids`, `drawBinoMask`, `binoUi` ja `setBino` (komentolokiin `kiikari`).
9. Rivit 612–617 ja 630: kompassikaista piirtää kiikarin aikana tavallisen asteikon, kapean sektorin ja luvun "Kiikari 017,3°".
10. Rivit 652 ja 685 (`maybeLoadAids`): kaukana olevien merkkien lataus (`loadAids`), latausetäisyys `loadRadius`.
11. Rivi 690: katse-näppäimen nopeus jaetaan kiikarin suurennuksella.
12. Rivi 732 (`endRun`): kiikari pois ajon päättyessä.
13. Rivi 763 (`cmdLabel`): kiikari-rivi.

Muut muuttuneet tiedostot: `js/merimerkit3d.js` (varjostin, näkyvyys, leveys), `js/merkit3d.js` (asetukset, `setPixel`, `setBino`, `valotList`-kommenttivirheen korjaus), `js/nakyma.js` (kiikari, tärinä, maski, API), `simulaattori.html` (maski, nappi, ohjeteksti), `css/sim.css`, uudet testit `kiikari3g_pw.py`, `leveys3g_pw.py`, `suor3g_pw.py` ja `kuva3g_pw.py`. Muuttumattomat: `tutka.js`, `liike.js`, `harjoitus.js`, `plotteri.js`, puusto ja `maamerkit3d.js`.

## Muuta

1. Määrittelyn oletus siitä, että käyttäjän kuvakaappauksen viitat ovat 2–3 km päässä, ei täsmää kuvan pikselikokoihin: kuvan tummat pisteet vastaavat noin 160–250 m:n etäisyyttä, eikä alueella ole merkkiryhmää kauempana. Kuvat on otettu Koukkuniemen läheltä (A) ja lähtöpaikasta (B), joissa viitat ovat 1,4 ja 2,2 km päässä.
2. Pikselin alle jäävät piirteet vilkkuvat rasteroinnissa, koska kuvaa ei reunanpehmennetä. Siksi piirretty minimi on 1 puskuripikseli ja peittävyys sovitetaan todelliseen leveyteen, ei laitepikseliin.
3. `valotList = lights; count = list.length;` -kommenttivirhe `merkit3d.js`:ssä (rivit olivat yhdellä rivillä kommentin takana) korjattu.
