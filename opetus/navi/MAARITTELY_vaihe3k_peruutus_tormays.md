# Määrittely, vaihe 3k: peruutuksen logiikka, peruutusnopeudet ja törmäykset laitureihin

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-3k/` (kopio Reittikartan `maasto`-haarasta, commit eafcc28, jossa vaiheet 3h ja 3i on yhdistetty). Lue ensin `lahdekoodi/simulaattori/TYOLOKI.md` (vaiheet 3, 3d, 3f, 3h), `RAPORTTI_vaihe3.md` (liikemalli), `SELVITYS_kasittely_ja_navigoijan_nakyma.md` (`/home/claude/opetus/navi/`, kohta vesisuihkuohjauksesta) ja tiedostot `js/liike.js`, `js/pohja.js`, `js/laiturit3d.js`, `js/harjoitus.js` ja `js/sim.js` (komennot ja `onGround`).

## 1. Käyttäjän havainnot 26.10.2026 klo 10.55

1. Peruutuksen logiikka pitää tarkistaa: mitä tapahtuu, kun vene peruuttaa ja annetaan käsky vasemmalle tai oikealle. Repa on vesisuihkuvene (Rolls-Royce Kamewa FF -suihkut, Vector Stick -ohjaus), jossa ruorimies ohjaa sauvalla. `liike.js` rivillä 246 kääntymisnopeuden merkki vaihtuu peruutuksessa (`s.v < -0.01 ? -1 : 1`), mutta ruorimiehen säädin `helmRudder` laskee ruorin suuntavirheestä samalla kaavalla kuin eteenpäin ajossa, joten peruutuksessa suuntakäsky todennäköisesti kasvattaa virhettä sen sijaan, että korjaisi sen. Todenna tämä testillä ennen korjausta ja kirjaa tulos.
2. Peruutusnopeus on 0–4 solmua. Nyt on vain yksi käsky "Peruutus hidas" (−4 kn).
3. Mallissa voi ajaa laitureiden läpi ilman seurauksia. Pohjakosketus maahan (`pohja.js`, `onGround`) on olemassa, mutta laiturit, aallonmurtajat ja vesikivet (`vesieste`-kerros, jonka `laiturit3d.js` piirtää) eivät ole esteitä.

## 2. Vesisuihkun ohjaus peruutuksessa

Hae WebSearchilla valmistajan ohje (Rolls-Royce tai Kongsberg Kamewa FF-jet, Vector Stick, tai HamiltonJet-ohjekirja, jossa sama periaate) siitä, mihin suuntaan perä liikkuu peruutettaessa, kun ohjainta käännetään, ja kirjaa lähde päiväyksineen. Yleinen periaate vesisuihkuveneissä on, että peruutettaessa perä liikkuu samaan suuntaan kuin ohjainta käännetään (kuten auto peruuttaessa), ja Vector Stick -ohjauksessa sauva osoittaa suuntaan, johon vene liikkuu. Jos lähde sanoo toisin, noudata lähdettä.

Simulaattorissa navigoijan käsky peruutuksessa annetaan perän suuntana, koska niin se annetaan oikeassa veneessä: komentopalstan napit "Vasen" ja "Oikea" muuttuvat peruutuksessa (käsketty nopeus alle 0) napeiksi "Perä vasen" ja "Perä oikea", ja käsky kirjataan komentolokiin muodossa "Perä vasemmalle" tai "Perä oikealle". Ruorimies toteuttaa sen oikealla ohjaimen suunnalla, ja aluksen suunta muuttuu vastaavasti (perä vasemmalle eli keula oikealle, tosisuunta kasvaa). Suuntakäskyä asteina ei peruutuksessa anneta, vaan perän suunta pidetään, kunnes annetaan "Suoraan" tai uusi käsky. Kääntymisnopeus peruutuksessa on enintään 60 % eteenpäin ajon arvosta samalla nopeudella (asetus), ja paikallaan sauvalla kääntyminen (10 °/s) säilyy.

## 3. Tehtävät

1. `liike.js`: korjaa ruorimiehen säädin peruutuksessa kohdan 2 mukaan (`helmRudder` ja kääntymisnopeuden merkki yhdessä niin, että käsky toteutuu oikein), lisää asetus `reverseTurnFactor` (0,6) ja peruutusnopeuden rajaksi 4 kn (`reverseMaxKn`). Nopeuskäskyn askellus: napit −2 ja +2 toimivat myös nollan alapuolella (0 → −2 → −4, ei alle −4), ja "Peruutus hidas" -nappi korvataan napeilla "Peruutus 2" ja "Peruutus 4" (tai askelluksella, kirjaa valinta). `speedText` näyttää "Peruutus 2 kn" ja "Peruutus 4 kn".
2. Törmäys laitureihin, aallonmurtajiin ja vesikiviin (`pohja.js` tai uusi `tormays.js`): aluksen runkopolygoni (pituus 14 m, leveys 4,2 m, käytä `hull_offsets`-tietoa tai yksinkertaistettua 8-kulmiota) tarkistetaan joka askeleella `vesieste`-kerroksen viivoja (laiturit 2 m ja 5 m levyisinä, aallonmurtaja 4 m) ja pisteitä (kivet pinnassa ja pinnan yläpuolella, halkaisija 1,5 m) vastaan, 300 m säteellä ladatuista tiilistä. Kosketus alle 1,0 kn nopeudella on "kosketus laituriin": alus pysähtyy siihen (nopeus 0, ei heittoa), lokiin rivi, ajo jatkuu. Kosketus yli 1,0 kn on "törmäys laituriin": sama kuin pohjakosketus (banneri, ajo pysähtyy, purkuun merkintä nopeuden kanssa), ja käyttäjä voi jatkaa tai lopettaa kuten pohjakosketuksessa. Sillat: jos `sillat3d.js` on tässä vaiheessa mukana (vaihe 3i), pilarit ovat esteitä samalla säännöllä.
3. `harjoitus.js`: purkuun törmäykset ja kosketukset aikoineen ja nopeuksineen (sama lista kuin pohjakosketukset, laji erotellen).
4. `sim.js`: nappien tekstit ja komentolokin rivit kohdan 2 mukaan, ohjeteksti päivitetään.

Käyttäjän kuvaus nykyisestä virheestä (26.10. klo 10.57): alus ajaa eteenpäin käsketyssä suunnassa 107°. Kun alus pysäytetään ja aletaan peruuttaa, se kääntyy 180° ympäri ja alkaa peruuttaa suuntaan 107°. Oikea käyttäytyminen: keula pysyy suunnassa 107° (tai siinä, mihin perän käskyt sitä kääntävät), ja alus liikkuu perä edellä, jolloin COG on noin 287°. Käsketty tosisuunta ei vaihdu peruutuksessa, eikä ruorimies yritä ajaa peruuttaen käskettyyn suuntaan.

## 4. Hyväksymiskriteerit

0. Käyttäjän tapaus testinä: eteenpäin 12 kn suuntaan 107°, "Nopeus 0", sitten "Peruutus 2" ja 60 sekuntia. Keulasuunta pysyy 107° ± 5° koko ajan, COG on 287° ± 10°, kun nopeus on yli 1 kn perä edellä, eikä alus käänny ympäri. Sama testi ennen korjausta kirjaa nykyisen käyttäytymisen.
1. Testi `peruutus_pw.py` (tai Node-testi liikemallille ilman selainta): alus peruuttaa 3 kn, käsky "Perä vasen" kääntää tosisuuntaa kasvavaan suuntaan (keula oikealle) vähintään 10° 20 sekunnissa, ja "Perä oikea" päinvastoin. Ennen korjausta sama testi kirjaa, mitä tapahtui (todennus kohdan 1.1 väitteelle). Peruutusnopeus ei ylitä 4 kn täydellä peruutusvivulla, ja −2 ja −4 kn käskyt toteutuvat 0,3 kn tarkkuudella 60 sekunnissa.
2. Törmäystesti: alus ajaa Naistenlahden sataman laituria kohti 6 kn, ajo pysähtyy törmäysbanneriin ennen kuin runko on yli 1 m laiturin läpi, lokiin ja purkuun tulee rivi nopeuksineen. Sama 0,8 kn: kosketus, alus pysähtyy, ajo jatkuu. Kuvat `3k_tormays_laituri.png` ja `3k_purku_tormays.png`.
3. Suorituskyky: törmäystarkistus alle 1 ms askeleelta (mittaa).
4. Vanhat testit läpi (`mobiili_pw.py`, `valkkyminen_pw.py`, `asettelu_3d_pw.py`, `kasky_pw.py`, vaiheen 3h testit), `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` muuttumaton. `plotteri.js`, `tutka.js`, `nakyma.js`, `maasto.js`, merkit ja laiturit eivät muutu.

## 5. Työtapa

Kuten aiemmin (paketti portissa 8144, lähdesivu omalla portilla, `SIM` ja `PAKETTI` ympäristömuuttujat, Playwright asennettu, SwiftShader-liput, WebKit `/opt/pw-browsers/webkit-2359`, lyhyet ajot, yksi Playwright-ajo kerrallaan, työloki `TYOLOKI.md` vaiheella 3k, ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä, desimaalipilkku). Älä koske muihin hakemistoihin kuin `/home/claude/reittikartta-3k/` (lue vapaasti). Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3k.md`, lyhyt ja numeroitu, lähde peruutuksen ohjauksesta, ja lopuksi lyhyt yhteenveto tilaajalle: muuttuneet tiedostot, kriteerien 1–4 tulokset lukuina ja kuvien polut. Älä liitä koodia vastaukseen.
