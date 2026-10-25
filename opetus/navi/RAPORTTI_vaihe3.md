# Raportti, vaihe 3: navigointisimulaattori

Päivitetty 25.10.2026. Tämä raportti kuvaa, mitä vaiheessa 3 tehtiin, kuinka hyväksymiskriteerit täyttyivät mittauksin ja mitä jäi epävarmaksi. Ei navigointikäyttöön.

## 1. Mitä valmistui

Simulaattori toimii yhtenä sivuna (`simulaattori.html` repon juuressa, lähde `lahdekoodi/simulaattori.html`). Rooli on navigoija, ja ohjelma toimii yksin käytettynä. Navigoija antaa tosisuuntakäskyjä (5 asteen askel, pitkä painallus tai Shift 10 astetta, erillinen loiva käännös) ja nopeuskäskyjä (2 kn:n askel, pikanapit 6, 12, 20 ja 28 kn, peruutus hidas, nopeus 0 ja crash stop). Simuloitu ruorimies toteuttaa käskyt 0,8 sekunnin viiveellä. Puhelimessa plotteri on päänäkymä ja kuljettajan näkymä pieni ikkuna kulmassa, napautus vaihtaa näkymät. Tabletilla ja tietokoneella näkymät ovat rinnakkain. Kuljettajan näkymän silmäpiste on oletuksena navigoijan paikka (x 6,1 m, y −0,75 m), ruorimiehen paikka (y +0,75 m) valitaan aloitusnäytöllä.

Harjoitus 1 kulkee Mustalahdesta Siilinkarin kohdan, Pirttiniemen ja Kiikisensaaren kautta Aitolahteen (9 345 m, seitsemän käännöstä). Ajon lopussa purku näyttää yhteenvedon, väylällä olon, suurimman poikkeaman navigointilinjasta, käännösten alkukohdat, sivuutetut viitat, plotterikuvan väritetyllä jäljellä ja aikaleimatun komentolokin käännöspisteisiin nähden. Pohjakosketus (syvyysalue alle 1,1 m tai maa-alue yli 0,35 m keulassa tai keskipisteessä) pysäyttää ajan ja johtaa purkuun.

## 2. Hyväksymiskriteerit

| Nro | Kriteeri | Mittaus | Tulos |
| --- | --- | --- | --- |
| 1 | Kuvan mediaani alle 60 ms, alle 300 000 kolmiota ja alle 300 piirtokutsua | Chromium Pixel 7, SwiftShader, 30 kn, plotteri päällä pienenä ikkunana, valmis simulaattori.html: mediaani 50 ms, p95 117 ms, 88 000 kolmiota, 41 piirtokutsua (mitattu uudelleen korjauskierroksen jälkeen) | Hyväksytty |
| 2 | Kolmen turvalaitteen paikka 2 m:n sisällä ja Pispalanharjun korkeus 2 m:n sisällä | Virheet 0,04 m (Mustalahti 29183), 0,04 m (Siilinkari 26636) ja 0,03 m (Kiikisensaari 26647). Maaston korkeus viidessä pisteessä, suurin ero 0,36 m (huippu 160,0 m N2000). Mitattu uudelleen sen jälkeen, kun maastoverkko muutettiin pelkäksi maanpinnaksi | Hyväksytty |
| 3 | Näsinneulan huippu 168 m ±3 m, piiput noin 90 m, Naistenlahden siluetti samoissa suunnoissa | Näsinneula 168,0 m järven pinnasta ja suunta 239,1°. Piiput 93,5 ja 93,0 m suunnissa 99,4° ja 104,1°. Tampellan piippu 104,1 m suunnassa 172,3°. Panoraama `shots/naistenlahti_panoraama.png` | Hyväksytty |
| 4 | Harjoitus 1 automaattiohjauksella 30 kn:ssa valmistuu, purku syntyy ja aika vastaa matkaa jaettuna nopeudella ±10 % | Selaimessa aika 10:04, odotus 10:05, keskinopeus 29,6 kn, väylällä 100 %, suurin poikkeama 38 m. Nodessa 30 kn 10:05 ja 10 kn 29:54 (odotus 30:16, suhde 0,988) | Hyväksytty |
| 5 | Pohjakosketus pysäyttää harjoituksen, kun ajetaan Siilinkarin saareen | Alus ajettiin 12 kn:ssa saareen, kosketus 14 m majakasta, nopeus nollaan, ilmoitus ja purku "Pohjakosketus" | Hyväksytty |
| 6 | Verkkosiirto alle 3 Mt minuutissa 30 kn:ssa | 0,76 Mt simulaatiominuutissa (487 m, 30 s, 30,2 kn). Pintamallia (pinta.pmtiles) ei enää ladata | Hyväksytty |
| 7 | Mobiilitestit (WebKit iPhone 14, Chromium Pixel 7): aloitusnäyttö, näkymän vaihto, kosketusohjaus, plotterin sammutus, purku, ei konsolivirheitä, kosketuskohteet vähintään 44 px | Kummassakin 42 tarkistusta, 0 virhettä, 0 konsolivirhettä | Hyväksytty |
| 8 | `build.py` tuottaa yhden tiedoston `simulaattori.html`, `index.html` ennallaan | simulaattori.html 1 212 851 tavua, ei ulkoisia script- tai link-viittauksia. Juuren `index.html` md5 edff5aed0e4cbb6603e33ef7c858dcce ennallaan ja `dist/Reittikartta.html` on byte-identtinen sen kanssa. Mobiilitestit ajettu myös yhdelle tiedostolle (kohta 3) | Hyväksytty |
| 9 | Kolme kuvakaappausta sekä plotteri- ja purkukuva hakemistoon `shots/` | Katso kohta 4 | Tehty, arvioitava ihmisen silmin |

## 3. Yhden tiedoston testi

Mobiilitestit ajettiin lisäksi paikallisesti tarjoillulle `simulaattori.html`-tiedostolle yhdessä verkkopaketin kanssa. Chromium Pixel 7 ja WebKit iPhone 14 läpäisivät kumpikin 42 tarkistusta ilman virheitä ja konsolivirheitä myös yhden tiedoston versiolla.

## 4. Kuvat (`lahdekoodi/simulaattori/shots/`)

1. `1_naistenlahti_etelaan.png`, Naistenlahden poukamasta etelään (E 327 740, N 6 823 980, suunta 172°).
2. `2_mustalahti_siilinkari_30kn.png`, Mustalahden ja Siilinkarin välinen väylä 30 kn:ssa liu'ussa (trimmi 2,5°). Järvi on avoin, joten viitat näkyvät vain pieninä pisteinä.
3. `3_siilinkari_ohitus_50m.png`, Siilinkarin apuloisto 50 m:n etäisyydeltä.
4. `4_ajo_plotteri_ja_nakyma.png`, työpöytäasettelu ajon aikana.
5. `5_purku.png` ja `5_purku_komentoloki.png`, purkunäkymä.
6. `naistenlahti_panoraama.png`, leveä panoraama kriteeriä 3 varten.

## 5. Liikemallin oletukset

Kaikki arvot ovat `js/liike.js`:n SETTINGS-oliossa ja ne kalibroidaan oikealla veneellä.

| Suure | Oletus | Peruste |
| --- | --- | --- |
| Massa | 15 500 kg | Käsikirja 25.6.2014 |
| Työntö | T = 30 kN · vipu · (1 − 0,3 · v / 35 kn) | Tilaajan tarkennus |
| Vastus | 16 kN 12 kn:ssa (liukukynnys), 12 kN 17 kn:ssa, 21 kN 35 kn:ssa, eksponentti 1,3 välillä 17–35 kn | Tilaajan tarkennus |
| Huippunopeus | 35,0 kn täydellä vivulla | Käsikirja |
| Matkanopeuden pito | 28 kn noin 73 % vivulla | Malli |
| Crash stop 28 kn:sta | 42 m, 6,0 s (ruorimiehen viiveellä 41,9 m) | Käsikirja noin 40 m |
| Kiihtyvyys | 0 → 28 kn 17,1 s, vipu 0: 28 → 6 kn 14,4 s | Malli |
| Kääntösäde | 12 m 5 kn:ssa, 70 m 30 kn:ssa | Oletus |
| Kääntyminen paikallaan | 10 °/s täydellä ruorilla | Tilaajan tarkennus, kalibroidaan |
| Kallistus | enintään 8° käännöksessä sisäänpäin | Oletus |
| Trimmi | huippu 5° 10–14 kn:ssa, 2,5° 28 kn:sta ylöspäin | Oletus liukukynnyksestä |
| Syväys | 1,1 m | Pv417:n perehdytysmateriaali |
| Ruorimiehen viive | 0,8 s | Tilaajan tarkennus |
| Ruorikulma | tavallinen 15°, loiva 7°, täysi 35° | Oletus |
| Käskyaskeleet | suunta 5° (pitkä 10°), nopeus 2 kn, peruutus hidas −4 kn | Tilaajan tarkennus |
| Silmäpiste | navigoija (6,1, −0,75), ruorimies (6,1, +0,75) | Tilaajan tarkennus |
| Linjataulu | 3 × 1,5 m, korkeus 6 m | Oletus, tietoa ei aineistossa |
| Väyläalue puuttuvan polygonin kohdalla | 40 m navigointilinjan molemmin puolin | Oletus |
| Perille tulo | 80 m reitin päästä | Oletus |
| Viittojen näkyvyys | 700 m, vaakakuvakulma 70° | Oletus |

## 6. Muutetut ja uudet tiedostot

Uusia tiedostoja tässä vaiheen osassa: `js/harjoitus.js` (reitti, automaattiohjaus, tallenne ja purkuanalyysi), `js/pohja.js` (syvyys- ja väyläalueet, pohjakosketus), `js/sim.js` (sovellus), `lahdekoodi/simulaattori.html`, `css/sim.css`-tyylit, testit `harjoitus_test.js`, `app_pw.py`, `kriteerit_pw.py`, `grounding_pw.py`, `mobiili_pw.py`, `suorituskyky_pw.py`, `kuvat_pw.py` ja `ref.py`. Muutettuja tiedostoja: `js/maasto.js` (puuston ja rannan väritys, `heightAt`-funktion minZ-parametri, ruutumäärien supistus), `js/nakyma.js` (runko kahteen verkkoon, mukautuva pikselibudjetti), `js/merkit.js` ja `js/merkit3d.js` (linjataulut ja vesiliikennemerkit), `js/maamerkit3d.js` (Näsinneulan mastokorjaus) ja `build.py`. Reittikartan `lahdekoodi/js/*` ja `index.html` eivät muuttuneet.

## 7. Yksinkertaistukset ja epävarmuudet

1. **Kuvanopeus.** Mittaus on tehty SwiftShader-ohjelmistopiirrolla, joka ei kerro oikean puhelimen GPU:n suorituskykyä. Mediaani 50 ms täyttää rajan, mutta pikselibudjetti putoaa tarvittaessa 0,1 megapikseliin, jolloin kuva on pehmeä. Oikealla laitteella tulos on todennäköisesti parempi, mutta sitä ei ole mitattu.
2. **Maaston muoto.** Maaston verkon ruutumäärää supistettiin suorituskyvyn vuoksi, ja korkeudet täsmäävät aineistoon (kriteeri 2). Puusto on korjauskierroksen jälkeen erillinen latvuskerros, ja maastoverkko on pelkkä maanpinta. Latvuskerros on laatikkomainen (ks. kohta 8), joten metsä näyttää läheltä kulmikkaalta ja yksivärisen tummalta.
3. **Väyläprosentti.** Väyläaluepolygoneja on aineistossa vain osalle väylistä, joten muualla käytetään 40 m:n käytävää navigointilinjan molemmin puolin. Purku kertoo tämän.
4. **Harjoituksen alkuosa.** Ensimmäinen osuus Mustalahdesta Naistenlahden väylälle on avoveden hyppy, ei virallinen väylä.
5. **Automaattiohjaus.** Se antaa samat käskyt kuin käyttäjä (5 asteen askeleet), joten pitkillä suorilla se vaihtelee suunnissa 075 ja 080 ja komentoloki on pitkä. Vaihtelu on hyväksytty, koska se vastaa käyttäjän mahdollisia käskyjä.
6. **Viittojen näkyvyys purussa.** Siilinkarin viitta (371 m paapuurissa) ja Tapatora 2 näkyvät 0 sekuntia, koska ne ovat kuvakentän (±35°) ulkopuolella. Tämä on oikein, mutta voi vaikuttaa purussa siltä, ettei viittoja olisi huomattu.
7. **Vesiliikennemerkkien värit ja suunnat** ovat arvauksia aineiston `laji`-kentän pohjalta.
8. **Näsinneulan korkeus** on mitattu järven pinnasta (168 m) määrittelyn mukaan.
9. **Rasterikartta.** Traficomin rasterikartan kattavuus päättyy Tampereen eteläpuolelle, ja tyhjä alue plotterissa ja purun kartassa on aineiston ominaisuus, ei vika.
10. **Liikemallin kalibrointi.** Kääntyminen paikallaan, kääntösäteet, kallistus ja trimmi ovat oletuksia, jotka kalibroidaan oikealla veneellä.
11. **Veden pinta.** Vedessä näkyy kaukana hienoa kuviointia (moiré), jota ei ole korjattu.

## 8. Korjauskierros tilaajan kuvatarkastuksen jälkeen

1. **Puusto erillisenä latvuskerroksena.** Maastoverkko käyttää vain maanpinnan korkeutta (maasto.pmtiles), eikä pintamallia (pinta.pmtiles) ladata enää lainkaan. Puusto (puusto.pmtiles) piirretään metsämaan päälle pystyseinäisinä latvuslaatikoina, joiden yläpinta on maanpinta plus puuston keskipituus (kerroin 0,9) ja joiden korkeuteen on lisätty ±15 prosentin vaihtelu. Laatikko tehdään vain siellä, missä latvuspeitto on vähintään 30 %. Alle 1 ha:n saarilla (yhtenäinen maa-alue, joka ei kosketa ruudun reunaa) latvuskerroksen korkeus rajataan 10 metriin. Kauempana (z14 ja karkeammat ruudut, yli noin 900 m) latvuskerros yhdistetään maastoverkon korkeuteen, jotta siluetit säilyvät ilman 25 000 lisäkolmiota. Latvuskerros poistetaan 14 m:n säteeltä kiinteiden turvalaitteiden ja maamerkkien ympäriltä.
2. **Siilinkarin majakka.** Kiinteät loistot ja apuloistot piirretään torneina, joiden korkeus on valon_korkeus_vedesta (Siilinkarin apuloisto 6,5 m) ja jotka ovat valkoisia punaisella yläosalla ja tummalla lyhdyllä. Tämä toteutus oli jo olemassa, mutta torni peittyi aiemmin puustoon, koska pintamalli nosti saaren yli 10 metriin. Siilinkarin luoto on maastomallissa enintään 0,8 m vedenpinnan yläpuolella, ja se näkyy nyt matalana nurmisena luotona majakoineen. Majakka on kuvassa 3 ja kuvassa 2 suoraan edessä.
3. **Vähimmäisleveys viitoille ja torneille.** Turvalaitteiden pylväiden sivupinnat levennetään varjostimessa niin, että leveys on kuvakulmasta riippumatta vähintään noin 3 kuvapistettä (enintään 4 m säteen lisäys). Todellinen halkaisija 0,2 m on ennallaan, ja leventäminen vaikuttaa vain, kun todellinen leveys on alle 3 px. Korkeutta ei suurenneta.
4. **Trimmi.** Trimmi on mukana kamerassa: kamera on rungon mukana kääntyvässä telineessä. Vertailu samasta paikasta kuvaa 2 (2,5° trimmi, 30 kn) ja trimmitöntä kuvaa vasten: horisontti on 40 kuvapistettä alempana (720 px:n korkuisessa kuvassa), eli keula nousee näkymässä noin kolme astetta. Ohjaamon sisärakenteet pysyvät kuvassa paikallaan, koska ne kääntyvät kameran mukana, ja siksi nousu näkyy vain horisontin ja veden paikan muutoksena.
5. **Maasto rakennetaan vasta, kun turvalaitteet ja maamerkit on luettu**, jotta latvuskerros jää pois majakoiden ympäriltä. Rakennukset muodostetaan aina jalanjäljistä (aiemmin ne tulivat pintamallista).

Mitattu uudelleen: kriteeri 1 (mediaani 50 ms, p95 117 ms, 88 000 kolmiota, 41 piirtokutsua), kriteeri 2 (kohta 2), kriteeri 3 (Näsinneula 168,0 m, piiput 93,5 ja 93,0 m), kriteeri 4 (10:04), kriteeri 5 (pohjakosketus 'maa' 14 m majakasta), kriteeri 6 (0,76 Mt) ja kriteeri 7 (Chromium 42 ja WebKit 42 tarkistusta, 0 virhettä). Uudet kuvat: `shots/1_naistenlahti_etelaan.png`, `2_mustalahti_siilinkari_30kn.png`, `3_siilinkari_ohitus_50m.png`, `4_ajo_plotteri_ja_nakyma.png`, `5_purku.png` ja `5_purku_komentoloki.png`.

Jäljellä oleva epävarmuus: laatikkomainen latvuskerros näyttää 50 m:n etäisyydeltä kulmikkaalta, ja viereiset puustoiset luodot ovat kuvassa 3 tummia 10 m:n korkuisia kuutioita. Kuvan 2 majakka on 300 m:n etäisyydeltä noin 10 pikselin korkuinen, koska 6,5 m:n torni on todellisuudessakin matala.
