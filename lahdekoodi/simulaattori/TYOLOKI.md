# Työloki, vaihe 3

Merkinnät tehdään määrittelyn kohdan 8 askelten mukaan. Päiväys 25.10.2026.

## Askel 0: lähteiden luku
- Luettu määrittely, aineisto.json, hull_offsets.json, hull3d.js, maamerkit.json, vaiheiden 1b ja 2 raportit sekä Reittikartan symbols.js, geo.js ja chart.js (rasterin WMTS-osoite).
- Havaintoja: aineiston turvalaitepisteet on harvennettu matalilla zoomeilla (z14 sisältää 62 ja z16 98 laitetta Tampereen alueella), joten täydellinen laitejoukko on luettava z16-ruuduista. Maastokuviokerroksessa ei ole metsäluokkaa (metsä on se, mitä polygonit eivät peitä). Vaiheen 1b siluettien suunnat ovat TM35FIN-ruutusuuntia (meridiaanikonvergenssi Tampereella −2,86°). Järven pinta on maasto- ja pintatiilissä 95,5 m (kvantisointi 0,5 m).
- Runkomallin ohjaamo on umpinainen: alaseinäprisma on suljettu katetaso 3,0 m:ssä ja ikkunat ovat tummia läpinäkymättömiä tasoja. Kuljettajan näkymä tarvitsee siksi oman sisätilaversion (ikkunat auki, kate pois).
- Ohjauspaikkaa ei ole annettu hull_offsets.json-tiedostossa. Käytetään x 6,5 m, y 0.

## Askel 1: tila ja liikemalli
- js/paikka.js (TM35FIN-muunnokset, tarkistettu pyproj:ia vastaan alle 1 mm) ja js/liike.js (liikemalli) sekä testit/liike_test.js.
- Testit Nodessa: kiihtyvyys 0 → 28 kn 15,0 s, kaasun nollaus 28 → 6 kn 20,0 s, crash stop 28 kn:sta 40,0 m, kääntösäde 5 kn 12,0 m ja 30 kn 70,0 m, paikallaan 3,0 °/s, kallistus 8°.

## Askel 2: plotteri
- js/mvt.js (oma MVT-purkaja, tarkistettu Python-purkajaa vastaan), js/aineisto.js (PMTiles-lukija, välimuisti ja laskuri), js/merkit.js (turvalaitteet z16-ruuduista) ja js/plotteri.js (Leaflet, suunta ylös -tila pyörittämällä karttaelementtiä, oma alus alaosassa, reitti, jälki ja turvalaitemerkit).
- Traficomin rasteri (Merikarttasarjat public) toimii natiivisti z15:een asti. Matalan veden (DRVAL2 alle 1,0 m) punasävy ja väyläalueet piirretään vektoreina rasterin päälle.
- Testisivu testit/plotteri_testi.html ajettu Chromiumilla (Pixel 7): ei virheitä eikä epäonnistuneita pyyntöjä. Kuvat shots/_plot_a.png ja _plot_b.png katsottu, rasteri, reitti, alus ja pyöritys ovat kunnossa.

## Tilaajan tarkennukset (saatu askeleen 3 aikana)
- Ruorimiehen silmäpiste: x 6,1 m, y +0,75 m (SB), asetuksina. Päällikkö istuu oikealla takana ja navigoija vasemmalla edessä, joten ruorimiehen paikka on oletus.
- Syväys pohjakosketuksessa 1,1 m (Pv417:n perehdytysmateriaali), asetus liike.js:n SETTINGS.draftM. Plotterin matalikkoraja (DRVAL2 alle 1,1 m) lukee saman arvon.
- Kääntyminen paikallaan 10 °/s täydellä ruorilla (aiemmin 3 °/s), kirjataan oletuksena, joka kalibroidaan oikealla veneellä. Liikemallin testit päivitetty ja läpi.

## Tilaajan päätökset 2 (saatu askeleen 3 aikana): navigoijan rooli ja voimamalli
- Liikemalli kirjoitettu uudelleen voimamalliksi: kiihtyvyys = (T - R) / m, m = 15 500 kg, T = 30 kN * kauha * (1 - 0,3 * v / 35 kn), vastuskäyrä huippu 16 kN 12 kn:ssa, 12 kN 17 kn:ssa ja 21 kN 35 kn:ssa. Vastuskäyrän nousu 17 -> 35 kn on kupera (eksponentti 1,3), jotta 28 kn pitää noin 73 % kauhalla.
- Tulokset: huippunopeus täydellä kauhalla 35,0 kn, 28 kn pitävä kauha 73 %, crash stop 28 kn:sta täydellä peruutuskauhalla 42,0 m (6,0 s), 0 -> 28 kn 17,1 s, kauha 0: 28 -> 6 kn 14,4 s. Hystereesi: 50 % kauha paikaltaan jää 10,9 kn:aan, 70 % ylittää kynnyksen, liu'ussa 50 % pitää 19 kn:ssa ja 40 % pudottaa 9,8 kn:aan.
- Ohjaus: käskyt (ruori ja kauha, 10 % askel) toteutuu viiveellä ruori 0,8 s ja kauha 1,5 s (asetukset). Crash stop on heti. Suora ohjaus on asetus (direct). Komentoloki aikaleimoin tilassa (cmdLog).
- Nakyma: silmäpisteen oletus on navigoijan paikka (x 6,1, y -0,75), ruorimiehen paikka asetuksena helmEyeY.
- Liikemallin testit päivitetty (testit/liike_test.js) ja läpi.

## Tilaajan tarkennus 3: tosisuunta- ja nopeuskäskyt (korvaa edellisen vipu- ja ruorikäskyt)
- Navigoija käskee tosisuunnan (5° askel, pitkä painallus 10°, loiva käännös erillisenä merkintänä) ja nopeuden (2 kn:n askel 0-35 kn, pikanapit 6, 12, 20 ja 28 kn, "peruutus hidas" -4 kn). Käyttöliittymässä ei käytetä sanaa kauha, sisäinen suure on vipu (-100 ... +100 %).
- Simuloitu ruorimies (liike.js): käskyn viive 0,8 s, suunnalle P-säädin (ruorikulma = 1,2 * virhe - 1,0 * kääntymisnopeus, tavallisessa käännöksessä enintään 15° ja loivassa 7°, ruorin täysi asento 35°), nopeudelle yksi vipu: ensiarvaus lineaarisesti, P-osa 0,04 vipua per solmu ja hidas integraali 0,006 per kn ja s, vivun liikenopeus 0,3/s ja nopeuden havainnon seuranta 2,5 s.
- Tulokset testeissä: 6, 20, 28 ja 35 kn käskyt asettuvat tarkasti (vaihtelu alle 0,1 kn), 10 ja 12 kn pysyvät, käsketty nopeus 15 ja 16 kn jää liukukynnyksen yläpuolella haettavaksi (nopeus vaihtelee 12 ... 18 kn), käännös 30° 20 kn:ssa tavallisena valmis 11,2 s ja loivana 15,6 s ilman ylitystä.
- Komentoloki (cmdLog) kirjaa suuntakäskyt, loivan merkinnän ja nopeuskäskyt aikaleimoin, sijainnin ja tosisuunnan.

## Jatkaminen 25.10.2026 (uusi agentti)
- Luettu määrittely, tarkennukset (ensisijaiset) ja tämä työloki. Liikemallin testit (testit/liike_test.js) ajettu Nodessa: kaikki läpi ("Kaikki liikemallin testit läpi").
- Jäljellä: askeleen 3 loppu (puusto ja maaston väritys, vesi, aurinko), askeleet 4-7. Jatketaan olemassa olevan koodin pohjalta, ei kirjoiteta toimivia moduuleja uudelleen.

## Askel 3, loppu (jatko)
- Maaston väritys: peiteteksturiin maalataan puuston latvuspeitto (puusto.pmtiles) tumman vihreänä kaikkialla, missä on metsämaata, myös taajama-polygonien päälle (aiemmin ranta näytti paljaan harmaalta, koska "taajama" ja "kallio" -luokat olivat vaaleanharmaita). Kallio ja taajama on vaihdettu vihertäviksi sävyiksi. Puuston keskipituus oli jo mukana verkon korkeudessa (kerroin 0,9). Canvas-lukua nopeutettu (willReadFrequently), pisin yksittäinen rakennusviipale 26 ms.
- Vesi (varjostin, aallot, Fresnel-heijastus), aurinko (päivämäärä ja kellonaika, 61,5 N, vastavalon harso) ja taivas olivat jo valmiina nakyma.js:ssä.
- Askel 4 alku: merkit.js lukee nyt myös taululinjat (päätepisteet, ruudun reunan katkaisemat ohitetaan) ja vesiliikennemerkit; merkit3d.js piirtää linjataulut (3 x 1,5 m keltainen taulu 6 m korkeudella, oletus) ja vesiliikennemerkit (0,8 m kilpi 2 m korkeudella tolpassa).
- js/harjoitus.js: harjoitus 1 (Mustalahti, Naistenlahden väylän alku, Siilinkarin kohta, Pirttiniemi, Kiikisensaari, Nupinnokka, Aitolahti; navigointilinjojen 9235, 9220 ja 9225 taitepisteet, yhteensä 9 345 m, 7 käännöspistettä), reitin projektio, seuraava käännös, automaattiohjaus (antaa Liike-moduulin tosisuunta- ja nopeuskäskyt kuten käyttäjä), tallenne ja purkuanalyysi (väyläalueella olo, suurin poikkeama, käännösten alkukohdat ruorin 20 % rajalla, viittojen näkyvyysajat, komentoloki käännöspisteisiin nähden).
- testit/harjoitus_test.js (Node): automaattiohjaus 30 kn: aika 10:05 (odotus 10:05), suurin poikkeama 38 m; 10 kn: aika 29:54 (odotus 30:16, suhde 0,988), suurin poikkeama 21 m. Läpi.

## Askel 4 ja 5: merkit, sovellus (js/sim.js, simulaattori.html, css/sim.css)
- Askel 4: vesiliikennemerkit ja linjataulut mukana (merkit.js, merkit3d.js), js/pohja.js lukee z16-ruuduista syvyysalueet ja väyläalueet (pohjakosketus: DRVAL2 alle 1,1 m tai maa-alue maastomallissa yli 0,35 m, tarkistus keulasta ja keskipisteestä).
- Askel 5: lahdekoodi/simulaattori.html (lähde) ja js/sim.js. Aloitusnäyttö (harjoitus tai vapaa ajo, tavoitenopeus 10/20/30 kn, silmäpiste navigoija/ruorimies, oikea kello tai valittu aika, lähteet ja "Ei navigointikäyttöön"), latausnäkymä, plotteri päänäkymänä ja 3D pienenä ikkunana kulmassa (napautus vaihtaa), rinnakkain tabletilla ja tietokoneella. Komentonapit: Vasen, Oikea (napautus 5 astetta, pitkä painallus 10), Loiva, nopeuspikanapit 6, 12, 20 ja 28, -2 ja +2, Peruutus hidas, Nopeus 0 ja Crash stop. Näppäimet: nuolet, välilyönti, L, Q ja E (katse), Tab (näkymät), P (tauko), 1, 2, 5 ja 0 (aikakerroin). Aikakerroin 1x, 2x, 5x ja 10x sekä tauko. Plotterin sammutus kirjataan komentolokiin.
- Askel 6 (koodi): harjoituksen seuranta (näkyvyys viitoille raycastilla runkoon ja ohjaamoon, maaston peittoon ja kuvakenttään), pohjakosketus (pysäyttää ajan ja näyttää paikan plotterilla), perillä, keskeytys, purku (yhteenveto, väylä, suurin poikkeama, käännökset, viitat, komentoloki ja plotterikuva väritetyllä jäljellä).
- build.py laajennettu: tuottaa lisäksi repon juureen simulaattori.html (index.html ei kosketa).

## Askel 7 (osa): suorituskyky, rantaväri, kuvat, build
- Suorituskyky: runko yhdistetty kahdeksi värillisiksi verkoksi, Lambert-materiaalit, maaston verkon ruutumäärä ja jakoetäisyydet pienennetty (CELLS_Z 20/24/28/36/36, SPLIT 4000/2000/900/380), pikselibudjetti mukautuu todelliseen kuvaväliin (alaraja 0,1 Mpix), pieni plotteri päivittyy 4 kertaa sekunnissa. Tulos 30 kn:ssa: kuvaväli mediaani 50 ms (p95 100 ms), 28 piirtokutsua, 71 500 kolmiota (kriteeri 1 läpi). Verkkosiirto 1,48 Mt simulaatiominuutissa (kriteeri 6 läpi).
- Kriteeri 2 uudelleen ajettu supistuksen jälkeen: maaston korkeus Pispalanharjulla suurin ero 0,36 m.
- Rantaväri: peiteteksturissa veden värinen pikseli maalataan rannan väriseksi, jos verkko on siinä yli 0,4 m vedenpinnan yläpuolella (paintShore). Poisti sinisen läiskät saarten rinteiltä.
- Mobiilitestit uudelleen: Chromium Pixel 7 42 tarkistusta 0 virhettä, WebKit iPhone 14 42 tarkistusta 0 virhettä.
- Kuvat shots/: 1_naistenlahti_etelaan, 2_mustalahti_siilinkari_30kn, 3_siilinkari_ohitus_50m, 4_ajo_plotteri_ja_nakyma, 5_purku, 5_purku_komentoloki ja naistenlahti_panoraama (kriteeri 3).
- build.py ajettu: simulaattori.html (1,2 Mt, ei ulkoisia script- tai link-viittauksia), index.html byte-identtinen (md5 edff5aed...), dist/Reittikartta.html identtinen index.html:n kanssa.
- Mobiilitestit ajettu myös yhden tiedoston simulaattori.html:lle: Chromium 42/0 ja WebKit 42/0 virhettä. Raportti RAPORTTI_vaihe3.md kirjoitettu.

## Korjauskierros (tilaajan kuvatarkastus)
- maasto.js: maastoverkko pelkkä maanpinta (DEM), pintamallia ei ladata. Puusto erillisinä pystyseinäisinä latvuslaatikkoina (n.cmesh) z15- ja z16-ruuduissa, latvuspeitto vähintään 30 %, alle 1 ha:n saarilla korkeus enintään 10 m, kaukana (z14 ja karkeammat) latvuskerros yhdistetty maastoverkkoon. Latvuskerros poistetaan 14 m:n säteeltä kiinteistä turvalaitteista ja maamerkeistä, ja maasto rakennetaan vasta turvalaitteiden ja maamerkkien luvun jälkeen (setGate).
- merkit3d.js: pylväiden vähimmäisleveys noin 3 px varjostimessa. nakyma.js päivittää kuvapisteen koon joka kuvassa.
- Mitattu uudelleen: C1 mediaani 50 ms (p95 117 ms, 88 000 kolmiota, 41 kutsua), C2 aineisto 0,04 m ja maasto 0,36 m, C3 ennallaan, C4 10:04, C5 ok, C6 0,76 Mt, C7 42/0 ja 42/0. Uudet kuvat 1, 2 ja 3 sekä 4 ja 5 ovat hakemistossa shots. simulaattori.html rakennettu uudelleen, index.html ennallaan.
