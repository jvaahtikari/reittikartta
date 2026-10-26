# Raportti, vaihe 3j: maiseman ulkoasu (kierrokset 1 ja 2)

Päiväys 26.10.2026. Työ tehtiin hakemistossa `/home/claude/reittikartta-3j/`. Työloki: `lahdekoodi/simulaattori/TYOLOKI.md`, osio "Vaihe 3j".

## 1. Yhteenveto kriteereistä

| Kriteeri | Tila |
|---|---|
| 1. Ennen- ja jälkeen-kuvat A, B, C | Täyttyy osittain. Deck-kuvat ennen ja jälkeen (kierrokset 1 ja 2) ovat olemassa. Pixel 7 -kuvia ja B-kuvia klo 7.00 ja 19.30 EI otettu. |
| 2. Korkeustarkistus | Tehty kierroksen 2 koodilla, EI uusittu lopullisella koodilla (ruudukon tiheys z12-z15 muuttui sen jälkeen). |
| 3. Suorituskyky | EI TÄYTY. Täysi laatu, piste A, deck: kuvaväli 1,7-kertainen vanhaan (raja 1,25). Pisteen B ja kevyen laadun (Pixel 7) mittaus tekemättä. Kolmiot ja piirtokutsut täyttävät rajat. |
| 4. Vanhat testit, build, kielletyt tiedostot | Build ja md5-tarkistukset kunnossa. Seitsemää vanhaa testiä EI ajettu kierroksen 2 lopullisella koodilla. |

Syy keskeytykseen: tilaajan ohje klo 19.28 lopettaa suorituskyvyn säätö ja uusintamittaukset.

## 2. Muutetut tiedostot

- `lahdekoodi/simulaattori/js/nakyma.js` (valaistus, ilmakehä, vesivarjostin, värinhallinta)
- `lahdekoodi/simulaattori/js/maasto.js` (maasto, kuori, puut, rakennukset, rakennettu ranta)
- `lahdekoodi/simulaattori/js/maamerkit3d.js` (Näsinneula, Tampellan piippu, Naistenlahden voimalaitos ja kuljetin)
- `lahdekoodi/simulaattori/js/sim.js`, vain laatuasetus: rivit 26, 38, 42, 45-50 (`gfxNow()`), 144, 459 (`mGfx`-napin käsittelijä) ja 792 (valikon teksti)
- `lahdekoodi/simulaattori/simulaattori.html` (nappi `mGfx`)
- Testit: `testit/kuva3j_pw.py`, `vapaa3j_pw.py`, `etsi3j_pw.py`, `koetin3j_pw.py`, `korkeus3j_pw.py`, `cpu3j_pw.py`, `prof3j_pw.py`, `rkoe3j_pw.py`, `tri3j_pw.py`, `stat3j_pw.py`, `ab3j_pw.py`
- Muuttumattomat (md5 tarkistettu alkutilaa vasten): `plotteri.js`, `tutka.js`, `harjoitus.js`, `liike.js`, `merkit.js`, `merimerkit3d.js`, `laiturit3d.js`. Repojuuren `index.html` md5 on edelleen edff5aed0e4cbb6603e33ef7c858dcce.

## 3. Kuvat (hakemisto `lahdekoodi/simulaattori/shots/`)

- Ennen: `3j_A_ennen.png`, `3j_B_ennen.png`, `3j_C_ennen.png` (ja `_3d.png`)
- Jälkeen, kierros 1: `3j_{A,B,C}_jalkeen.png` (ja `_3d.png`)
- Jälkeen, kierros 2: `3j_{A,B,C}_jalkeen2.png` (ja `_3d.png`)
- Jälkeen, lopullinen koodi, vain piste A: `3j_A_jalkeen3.png` ja `3j_A_jalkeen3_3d.png`. Kuva on lähes identtinen kierroksen 2 kanssa. Vesi näyttää hieman tasaisemmalta.
- Välivaiheet: `3j_A_vaihe1.png`, `3j_B_vaihe1.png`. Vaiheet 2-5 ovat ajettavissa vertailukopioista portissa 8168 (`/s1/`, `/s2/`).
- Rakennettu ranta: `3j_vapaa_BW_*`, `3j_vapaa_PIER1_*`, `3j_vapaa_H1_*` (ennen2 ja jalkeen2). H1 on otettu ennen leveyden tiukennusta, joten laatta on kuvassa noin kolminkertainen. Länsi aallonmurtajan 100 m:n kuvaa uudella leveydellä ei ehditty ottaa.
- Sininen maapuolella: `3j_vapaa_T2_ennen2.png` ja `3j_vapaa_T2_jalkeen2.png`.
- Kuvissa ohjaamon katto peittää osan näkymästä, koska kuvat otetaan ohjaamosta.
- EI otettu: Pixel 7 -kuvat (`3j_<A|B|C>_ennen_pixel7.png` ja jälkeen), B klo 7.00 ja klo 19.30.

## 4. Oma arvio ulkoasusta kohdittain

1. Valaistus ja ilmakehä: huomattava parannus. Taivas vaihtuu auringon korkeuden mukaan, pilvet ja ilmaperspektiivi erottavat kaukomaaston. Aamu- ja iltavalon kuvia ei otettu, joten niiden arvio puuttuu.
2. Vesi: Fresnel-heijastus, aaltojen normaalikartta ja auringon kimallus toimivat. Kuvassa lopullisella koodilla aallot ovat hieman vähemmän näkyviä kuin kierroksella 2. Syynä on todennäköisesti kaukana tehty aaltoharvennus ja sRGB-approksimaatiot.
3. Maasto: pinta on puhdas DEM ja latvusto erillinen kuori, rannat eivät ole enää yhtenäistä vihreää pintaa. Jäljellä: pisteen A vesi/rantarenkaan juurisyy jäi selvittämättä (vanha ongelma, sininen kiila poistui).
4. Puut: lähellä instansoidut puut, kaukana billboardit ja kuori. Pisteessä A 4 610 billboardia, 248 instanssipuuta. Itäranta (B) näkyy jatkuvana latvustona kierroksen 2 kuvassa, mutta tihennystä ei mitattu uudelleen lopullisella koodilla.
5. Rakennukset ja maamerkit: korkeudet laserdatasta, harjakatot, ikkunarivit. Näsinneula 168 m, Tampellan piippu, voimalaitos ja polttoainekuljetin (katettu galleria, pilarit noin 12 m välein) näkyvät. Kaukorakennukset (z14 ja kauempana) piirretään vain, kun pohjapinta-ala on yli 220 m2, ja ääriviiva yksinkertaistetaan, joten kaukana pienet talot puuttuvat.
6. Laatuasetus: valikossa "Grafiikka: täysi / kevyt", oletus täysi leveällä näytöllä ja kevyt, kun lyhyempi sivu on alle 700 px. Osoiteparametri `laatu=kevyt|täysi` ohittaa muistin.

## 5. Korkeustarkistus (kriteeri 2), kierroksen 2 koodi

Tiedostot `shots/korkeus3j_vanha.json` ja `shots/korkeus3j_uusi.json`.

| Kohde | Tunnettu | Uusi verkko, z16 / z15 / z13 / z12 | Vanha verkko, z16 / z15 / z13 / z12 | Laatta (DEM) |
|---|---|---|---|---|
| Pispalanharju | noin 160 m | 159,8 / 159,0 / 155,6 / 147,0 | 159,8 / 158,2 / 145,7 / 126,0 | 160,0 |
| Näsinneulan juuri | 109,16 m | 112,4 / 112,2 / z14 110,6 / z13 110,1 | (ei lueteltu tässä) | 112,4 |

- Järven pinta 95,5 m: vesialueet pidetään korkeudessa LAKE (95,5) ja ruudukon pohja LAKE - 1,5. Maa-ruudut ovat vähintään 95,9 m (LAKE + 0,4). Land-fix nostaa Pyhäjärven puolen hyvin matalan maan (80-90 m) tasanteeksi 95,9 m. Tämä on tietoinen rajaus.
- Latvusto erotettu: maapinta on puhdas DEM (kenttä `ground` 64,3 m Pispalassa on puuston korkeus erillisenä), kuori lasketaan maa + 0,78 x puuston korkeus x kohina.
- Näsinneulan juuren laatta (112,4 m) on 3,2 m tunnettua korkeampi. Se kertoo DEM:n ja tunnetun arvon poikkeaman paikassa, ei verkon virhettä (verkko seuraa laattaa 0,01 m:n tarkkuudella z16:ssa).
- Näsinneulan korkeus: asetettu tunnettuun 168 metriin maanpinnasta (Wikipedia, luettu 26.10.2026, ja Yle 30.6.2025). Harva pistepilvi antaa vain 152 m, joten sitä ei käytetty. Molemmat arvot on kirjattu `maamerkit3d.js`:n kommenttiin (rivi 6).
- Ruudukon tiheys z12-z15 pienennettiin 24 ruutuun korkeustarkistuksen jälkeen (aiemmin 40, 32, 28, 28). Tämä voi heikentää kaukoverkon korkeuksia z12:ssa ja z13:ssa. Tarkistusta ei uusittu.

## 6. Suorituskyky (kriteeri 3)

Mittausmenetelmä: seinäkelloaika ja prosessoriaika vaihtelivat koneen kuorman mukaan (kaksi muuta agenttia ajoi rinnakkain, SwiftShader pyörittää ohjelmistopiirtoa), joten lopullinen vertailu tehtiin vuorotellen vanha, uusi, vanha, uusi tuoreissa selaimissa saman ajon sisällä (`testit/ab3j_pw.py`). Mitataan `renderer.render`-kutsun kesto readPixels-synkronoituna ja kuvaväli. Kuvaruutu 1440 x 900, pikselibudjetti 0,8 Mpx, adaptiivinen resoluutio pois.

Piste A, deck, täysi laatu, lopullinen koodi:

| | Vanha (portti 8166) | Uusi (portti 8164) | Suhde |
|---|---|---|---|
| Piirtokutsun mediaani, ajo 1 | 388 ms | 643 ms | 1,66 |
| Piirtokutsun mediaani, ajo 2 | 387 ms | 675 ms | 1,74 |
| Kuvavälin mediaani | 395 ms | 672 ms | 1,70 |
| Piirtokutsut | 92 | 147 | alle 300, täyttyy |
| Kolmiot | 110 400 | 164 585 | alle 400 000, täyttyy |

Raakatulokset: `shots/ab3j_deck_full.json`. Aiempi ajo ennen keventäviä muutoksia: 421 ms ja 769 ms (suhde 1,85), ja 3 kierrosta 20 sekunnin prosessoriaikamittaus (`shots/cpu3j_deck_full.json`) antoi suhteen 2,7 (prosessoriaika paisuu kuormassa SwiftShaderin kierrosodotuksen takia, joten sitä ei käytetä).

Tulos: täysi laatu ei täytä rajaa 1,25 (mitattu 1,66-1,74). Pisteen B täyden laadun ja pisteiden A ja B kevyen laadun (Pixel 7, raja 1,1) mittausta EI tehty.

Syyt, mitattu osissa (piste A, ms, kun osa kytketään pois, uusi koodi, 0,8 Mpx): maasto kokonaisuutena noin 300 ms, maapinta noin 150, rakennukset noin 100, billboardit noin 90 (ennen yhdistämistä noin 250), kuori noin 30, taivas ja vesi yhteensä noin 100. Vanhassa koodissa maasto maksaa kokonaisuutena noin 195 ms.

- SwiftShader on kolmio-, instanssi- ja pikselikohtaisesti hidas. Oikealla näytönohjaimella suhde on todennäköisesti pienempi, mutta sitä ei mitattu.
- sRGB-ulostulo ja ACES-tonemapping maksavat noin 20 ms miljoonaa fragmenttia kohden (mikrotesti), tekstuurien anisotropia 4 noin 25 ms. Molempia kevennettiin.
- Instansoitu piirto on SwiftShaderissa noin 3,4 kertaa hitaampaa kuin yhdistetty verkko (mikrotesti 4 500 billboardia: 135 ms ja 40 ms). Billboardit yhdistettiin, z16-instanssipuut ovat vielä instansoituja. Lähipuita on pisteessä A vain 248, mutta pisteessä C ne voivat painaa enemmän. C:n suoritusmittausta ei tehty.

Keventävät muutokset tässä kierroksessa: sRGB-muunnokset ja taivaan sekä veden `pow`-kutsut korvattu polynomeilla ja neliöjuurilla, billboardien yhdistäminen, ruudukon tiheys z12-z15 24 ruutuun, kaukorakennusten yksinkertaistus, takapintojen poisto rakennuksilta (katon kolmiot käännetty ylöspäin), anisotropia 2.

### Ehdotus: mitä kevyt laatu pudottaa pois

Kevyt laatu pudottaa jo nyt lähipuut (billboardit vain, harvennus 0,6) ja ikkunatekstuurin sekä veden normaalikartan. Jos suhde on kevyessä laadussa vielä yli 1,1, seuraavat pudotukset mittausten perusteella ovat tehokkaimmat:

1. Latvuskuori pois (ei erillistä kuorikerrosta, väri vain pohjatekstuurissa). Säästö noin 30 ms ja yksi piirtokutsu per solmu.
2. Billboardit vain alle 2 200 m:n päässä ja harvennus 0,3 (nyt alle 3 800 m).
3. Rakennukset vain alle 3 km:n päässä ja kaukorakennuskynnys 400 m2.
4. Vesi: analyyttiset aallot ilman pilviheijastusta, taivas ilman pilviä (säästö noin 50 ms).
5. Maaruudukko z16 28 ruutua (nyt 32) ja z12-z13 20 ruutua.
6. Yksinkertaisempi tonemapping (esimerkiksi Narkowiczin ACES-sovitus, noin 8 ms parempi miljoonaa fragmenttia kohden, mikrotestissä).

Tilaaja päättää, riittääkö nykytila.

## 7. Kierroksen 2 asiat

1. Metsä ei näkynyt ja rannat olivat tasaista vihreää: tarkistettu, että tasot lataantuvat (pisteessä A 4 610 billboardia 21 solmussa, 248 instanssipuuta, kuoret mukana), billboardin ja kuoren etäisyydet ja budjetit nostettu, kuoreen latvuksen yksityiskohtatekstuuri ja puistopuut. Mittaus ennen ja jälkeen: kierroksen 1 pisteessä A billboardeja oli selvästi vähemmän, eikä tarkkaa vertailulukua tallennettu lukuun ottamatta yllä olevia lopullisia lukuja. Tihennystä (70 % latvuspeitto, noin yksi puu 25-40 m2:llä) ei mitattu uudelleen lopullisella koodilla.
2. Rakennettu ranta: uusi luokka. Kapea maa-alue (alle 12 m, molemmin puolin vettä tai laiturin ja aallonmurtajan alueella) saa harmaan kiven ja betonin värin, tasaisen korkeuden 1,0-1,5 m vedenpinnan yläpuolelle ja pystysuoran reunan, ei vihreää eikä puita. Naistenlahden länsi aallonmurtaja ei ole paketin `vesieste`-tasossa vaan noin 30 m leveä niemeke `maastokuvio`-maassa, joten se tunnistetaan kapean kaistan säännöllä (ruutujen avaus 18 m:n säteellä, leveys 36 m, pituus vähintään 50 m, ala vähintään 300 m2). Rakennettu ranta rajoitettiin kohtiin, joissa maa on enintään LAKE + 3 m, ettei Mustalahden kaupunkirantoja litistetä. Debug-lippu `window.__maastoNoFix` poistaa kierroksen 2 korjaukset vertailua varten.
3. Sininen maapuolella: maa-ruutujen korkeus vähintään 95,9 m, painaminen vain vesialueille, kolmioiden korkeus samalla tavalla kuin verkossa (`triH`). Kuva `3j_vapaa_T2_*`. Pisteen A sininen kiila poistui. Rengas vesisondissa ei poistunut, juurisyy tuntematon.
4. Polttoainekuljetin (vahvistettu 26.10. klo 13.56): mallinnettu `maamerkit.json`-tiedostosta ja vaiheen 1b laserhahmotelmasta (katettu galleria, pilarit noin 12 m välein, tasoitus maastoon).
5. Näsinneula 168 m (katso kohta 5).

## 8. Oletukset ja tunnetut puutteet

- Lehtipuuosuus oletuksena 0,4, kanavakohtainen tunnistus säännöllisellä lausekkeella. MAX_DIST 12 km.
- Piipun korkeudet laserdatasta, ei verifioitavissa verkosta.
- Lisäkatselupiste D (324000, 6829750, 280).
- Billboardit ovat nyt yhdistettyjä verkkoja (`Mesh`, ei `InstancedMesh`). Muisti noin 0,2-0,3 kt per billboard.
- Ei ajettu lopullisella koodilla: seitsemän vanhaa testiä (`mobiili_pw.py`, `valkkyminen_pw.py`, `asettelu_3d_pw.py`, `katse_pw.py`, `kiikari3g_pw.py`, `kasky_pw.py`, `aika_pw.py`), vaiheittaiset kuvat uudelleen, `mGfx`-napin vaikutus näihin testeihin. Kierroksen 2 muutokset (rakennettu ranta, billboardien yhdistäminen, rakennusten takapintojen poisto) ovat testaamatta. Rakennusten takapintojen poisto perustuu laskelmaan kolmioiden kiertosuunnasta. Visuaalisesti pisteen A kuvassa seinät ja katot näkyvät, mutta kaikkia katsomissuuntia ei tarkistettu.
- Build: `lahdekoodi/build.py` ajettu, `simulaattori.html` 1 272 181 tavua (alle 2,5 Mt, ei ulkoisia tiedostoja), `dist/Reittikartta.html` 805 585 tavua.
- Työkalu: ympäristö oli kuormitettu, joten yksittäiset ajot kestivät 5-15 minuuttia. Playwright-ajot tehtiin yksi kerrallaan.


## 9. Tarkastus 3j-2 (26.10.2026, Sonnet-agentti)

Tämä osio kuvaa vaiheen 3j tarkastuksen ja viimeistelyn. Mitään uutta ominaisuutta ei lisätty. Lokit ovat hakemistossa `shots/logs3j2/`.

1. Vanhat testit lopullisella koodilla (portit 8164 ja 8144), kaikki läpi: `mobiili_pw.py` Chromium 42 tarkistusta 0 virhettä ja WebKit 42 / 0, sama Chromiumilla yhden tiedoston versiolla (`simulaattori.html` portista 8170) 42 / 0, `valkkyminen_pw.py` Chromium ja WebKit 0 tyhjää ruutua ja 0 puuttuvaa ruutua 20 näytteestä, `asettelu_3d_pw.py` 89 tarkistusta 0 virhettä, `katse_pw.py` 5 / 0, `kiikari3g_pw.py` 26 / 0, `kasky_pw.py` 11 / 0, `aika_pw.py` 6 / 0. Mikään testi ei kaatunut maiseman muutoksen takia, joten testeihin ei tehty muutoksia. Ajot tehtiin kahdesti: ensin ennen korjauksia ja uudelleen lopullisella koodilla (tiedostot `L_*.log`).
2. Irrallinen vihreä kappale (`3j_A_jalkeen3.png`) oli latvuskuori ja kuoren alla oleva puuaineiston mukainen puusto Naistenlahden läntisen aallonmurtajan koillispäässä. Säteenheitto kuvapisteestä osui solmun z16 37094/18468 latvuskuoreen noin 89 m päässä, ja kärkitarkastelu näytti, että aallonmurtaja ylittää ruudun reunan. Rakennetun rannan tunnistus toimii ruutu kerrallaan ja vaati kaistalta pituuden vähintään 50 m ja alan vähintään 300 m2, joten reunan yli jatkuva aallonmurtajan pätkä jäi tunnistamatta ja sai luonnollisen maan, puita ja latvuskuoren. Kyse ei ollut vedestä vaan rakennetun rannan tunnistuksen reunavirheestä.
3. Korjaus (`js/maasto.js`): kapea kaista hyväksytään rakennetuksi rannaksi, kun se osuu ruudun reunaan enintään yhden kaistan levyisenä, jolloin suuren maa-alueen rantasiivu ruudun kulmassa ei tulkita rakennetuksi. Lisäksi puiden sijoitus hylkää nyt puun, jos sen kohdalla on vesipikseli, rakennettu ranta (laituri, aallonmurtaja, kapea kaista tai rakennetun rannan vyöhyke) tai tie (tiemaski 3 m keskilinjasta). Latvuskuoren alfa leikataan pois rakennetun rannan ja vesipikselien kohdalta. Ylhäältä otetut kuvat ennen ja jälkeen: kappale poistui, ja uusi pisteen A kuva `3j_final_A_3d.png` on puhdas.
4. Hylätyt puut pisteen A kuvassa (deck, kaikki ladatut solmut, 113 solmua): vesialueella 959, rakennetulla rannalla 154 ja teillä 1 468. Pisteessä B vastaavasti 1 040, 67 ja 963 ja pisteessä C 1 526, 173 ja 1 190. Luvut ovat `__view.terrain.info().stats`-kentissä `rejWater`, `rejBuilt` ja `rejRoad`. Laitureilla ei näkynyt puita: laiturit ovat `vesieste`-kerroksessa, ja niiden alue on mukana rakennetun rannan maskissa.
5. Kuvat (hakemisto `shots/`, jokaisesta myös `_3d.png` pelkästä 3D-ikkunasta): `3j_final_A.png`, `3j_final_B.png`, `3j_final_C.png` (deck 1440 x 900), `3j_final_A_pixel7.png`, `3j_final_B_pixel7.png`, `3j_final_C_pixel7.png`, `3j_final_B_aamu.png` (klo 7.00), `3j_final_B_ilta.png` (klo 19.30), `3j_final_aallonmurtaja.png` (vapaa kamera 100 m päästä) ja `3j_final_A_kevyt.png`. Kuvat otettiin vasta, kun `terrain.idle()` oli tosi. Kuvat B, C, Pixel 7, aamu, ilta, aallonmurtaja ja kevyt laatu on otettu ruudukon tiheydellä 24, ja vain `3j_final_A.png` ja `_3d.png` on otettu lopullisella tiheydellä (kohta 7). Ero näkyy vain kaukomaaston verkossa.
6. Kevyt laatu, piste A, Pixel 7, vuorotteleva vertailu vanha ja uusi (`ab3j_pw.py`): ruudukon tiheys 24: piirtokutsun mediaani 284 ms ja 349 ms (suhde 1,23), kuvaväli 1,23, kolmen kierroksen mediaanit. Lopullinen tiheys (40, 32, 28, 28, kaksi kierrosta): 308 ms ja 372 ms, suhde 1,21, kuvaväli 1,20, kolmiot 97 798 ja 155 914, piirtokutsut 80 ja 109. Raja 1,1 ei täyty. Ero johtuu pääosin maaston lisäyksestä (veden ja taivaan varjostimet, rakennukset, billboardit), ja kevyt laatu ei sitä riitä poistamaan. Ehdotukset keventämiseen ovat tämän raportin kohdassa 6. Täyden laadun suhde 1,7 on jätetty hyväksytysti ennalleen.
7. Korkeustarkistus lopullisella koodilla (`shots/korkeus3j_lopullinen.json`, ruudukon tiheys z12-z15 kuten ennen 3j:n pienennystä, 40, 32, 28, 28): Pispalanharju laatta 160,0 m, verkko z16 159,8, z15 159,0, z13 155,6 ja z12 147,0 m. Näsinneulan juuri laatta 112,4 m, verkko z16 112,4, z15 112,2, z14 110,6 ja z13 110,1 m. Tiheydellä 24 Pispalanharjun z13-korkeus oli 144,8 m eli 15,3 m laattaa matalampi, ja z12 137,9 m. Se ylitti rajan 5 m, joten tiheys palautettiin arvoihin 40, 32, 28 ja 28. Nyt z13-poikkeama on 4,4 m, ja Näsinneulalla 2,3 m. Jäännösvirhe z12:ssa (13 m) on tuttu ja koskee vain yli 6 km:n päässä olevaa maastoa.
8. Build: `lahdekoodi/build.py` ajettu, `simulaattori.html` (repojuuressa) 1 275 221 tavua (alle 2,5 Mt, ei ulkoisia tiedostoja), `dist/Reittikartta.html` 805 585 tavua. Repojuuren `index.html` md5 edff5aed0e4cbb6603e33ef7c858dcce on muuttumaton. Tiedostot `plotteri.js`, `tutka.js`, `harjoitus.js`, `liike.js`, `runko.js`, `merkit.js`, `merimerkit3d.js` ja `laiturit3d.js` on tarkistettu md5-summalla alkutilaa vasten: muuttumattomat.
9. Muutetut tiedostot tässä vaiheessa: `js/maasto.js` (rakennetun rannan reunakaista, puiden hylkäys, tiemaski, kuoren alfa, ruudukon tiheys), testityökalut `testit/sonda3j2_pw.py` (säteenheitto ja kärkitulostus), `testit/ylhaalta3j2_pw.py` (kuva suoraan ylhäältä) ja `testit/kuva3j_pw.py` (valitsimet `pre` ja `suf`).
