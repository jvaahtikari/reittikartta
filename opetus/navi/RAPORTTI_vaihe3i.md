# Raportti, vaihe 3i: sillat 3D-näkymään

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Kuvat ovat hakemistossa `lahdekoodi/simulaattori/shots/` etuliitteellä `3i_`, testit hakemistossa `testit/` ja työvaiheet `TYOLOKI.md`:ssä (Vaihe 3i). Työ tehtiin vain hakemistossa `/home/claude/reittikartta-3i/`.

## Mitä tehtiin

1. Uusi moduuli `js/sillat3d.js` (`Sillat3D`, malli `laiturit3d.js`). Moduuli lukee paketin `tie`-kerroksen z14-ruuduista aluksen ympäriltä (säde 2 500 m), leikkaa `taso > 0` -viivat ruutuun ja tihentää ne 2 m välein. Vesi tunnistetaan maastokuvion `jarvi`- ja `virtavesi`-alueista. Ruudun reunoilla katkenneet viivat liitetään yhteen (`stitch`). Siltaosuus on veden päällä oleva jakso, jonka pituus on vähintään 10 m, ja siihen lisätään 15 m maata kummassakin päässä. Päällekkäiset jaksot yhdistetään. Kaikki sillat rakennetaan yhdeksi `BufferGeometry`-verkoksi ja piirretään yhdellä piirtokutsulla.
2. Rakenne. Kansi on 1,2 m paksu, ja sen alapinta on maanpinnan korkeus päissä lineaarisesti interpoloituna mutta vähintään 4 m vedenpinnan yläpuolella. Leveys tieluokan mukaan: valtatie ja kantatie (12111, 12112) 12 m, muu autotie 8 m, kevyen liikenteen väylä 4 m ja rautatie 5 m (tummanruskea teräs, paketissa ei ole yhtään rautatiesiltaa). Kaiteet ovat 1,1 m korkeat 0,2 m paksut reunapalkit tummemmalla harmaalla. Pilarit ovat 1,5 m leveät laatikot 25 m välein vain veden päällä, ja niitä on yksi, kaksi tai kolme rinnakkain kannen leveyden mukaan (alle 7 m, 7 ... 10 m ja vähintään 10 m). Maalle jäävät päät on viimeistelty kaltevalla pengerreunalla ja päätyseinällä, jotta kansi ei leiju ilmassa. Nimi, tieluokka, leveys, pituus ja veden päällä oleva pituus säilytetään olion tietona (`info().stats.list`), mutta niitä ei piirretä.
3. Maanpinnan korkeus luetaan suoraan z14-korkeusmallista (`maasto.pmtiles`, sama bilineaarinen näyte kuin `maasto.js`:n `sampleH`), koska kaukaisen maaston LOD-solmujen solukoko on noin 240 m eikä se kelpaa sillan päiden korkeudeksi.
4. Liitäntä ilman `nakyma.js`:n muutosta. `Sillat3D.attach(view)` kietoo `view.render`-kutsun niin, että `sync` ajetaan joka kuvalla, ja rekisteröi moduulin `view.addExtra`-kutsulla, jolloin `rebase` välittyy. Moduuli on myös `view.bridges`.
5. Muutokset olemassa oleviin tiedostoihin: `js/sim.js` rivi 137 (siltojen lataus ja piirto: `G.bridges = ... Sillat3D.attach(G.view)`) ja rivi 687 (latausnäytön valmis-ehtoon `G.bridges.idle()`). Muuta `sim.js`:ssä ei muutettu. `simulaattori.html` rivi 223: skriptiviite `simulaattori/js/sillat3d.js`. `build.py` ottaa moduulin mukaan HTML:n kautta eikä sitä itse muutettu.

## Kriteeri 1: siltaluettelo

Lähde on paketin `tie`-kerros (`/home/claude/opetus/navi/putki/ulos/nasijarvi.pmtiles`). Eteläisellä alueella (E 322 000 ... 332 500, N 6 819 500 ... 6 827 500) on 163 ruutuun leikattua `taso > 0` -osaa, yhteispituus 6 445 m. Niistä 39 ylittää vettä. Moduuli piirtää ne, joiden veden päällä oleva pituus on vähintään 10 m, eli 25 siltaa. Loput 14 ovat 4 ... 9 m pituisia purojen ja ojien ylityksiä, ja ne jätetään pois, koska 4 m vähimmäisalikulku tekisi niistä korkeita betonilohkoja. Veden päällä oleva pituus on laskettu myös erikseen shapely-kirjastolla, ja arvot täsmäävät (Paasikivensilta 151,4 m ja Puistosilta 173,6 m).

**Tammerkosken silta Mustalahden lähellä on mukana.** Se on kaksi rinnakkaista siltaa: Paasikivensilta (tie 12131, 8 m leveä) ja Puistosilta (kevyen liikenteen silta 12314, 4 m leveä).

| Alue | Nimi | Luokka | Leveys (m) | Veden päällä (m) | Osuus yhteensä (m) |
|---|---|---|---|---|---|
| Mustalahti ja Tammerkoski | Puistosilta | 12314 | 4 | 173 | 203 |
| Mustalahti ja Tammerkoski | Paasikivensilta | 12131 | 8 | 152 | 190 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 96 | 118 |
| Mustalahti ja Tammerkoski | Palatsinsilta | 12314 | 4 | 88 | 100 |
| Mustalahti ja Tammerkoski | Valssipadonraitti | 12314 | 4 | 75 | 91 |
| Mustalahti ja Tammerkoski | Satakunnankatu | 12122 | 8 | 68 | 96 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 61 | 71 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 53 | 58 |
| Eteläinen | Tampereen valtatie (kaksi ajorataa) | 12121 | 8 | 50 + 50 | 80 + 80 |
| Mustalahti ja Tammerkoski | Hämeenkatu | 12121 | 8 | 39 | 65 |
| Mustalahti ja Tammerkoski | Myllysaaren rantaraitti | 12314 | 4 | 38 | 40 |
| Mustalahti ja Tammerkoski | Ranta-Tampellan katu | 12131 | 8 | 28 | 32 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 22 | 35 |
| Naistenlahti | (nimetön) | 12314 | 4 | 19 | 22 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 17 | 18 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 14 | 24 |
| Eteläinen | (nimetön) | 12313 | 4 | 13 | 19 |
| Eteläinen | (nimetön) | 12314 | 4 | 12 | 20 |
| Mustalahti ja Tammerkoski | (nimetön) | 12314 | 4 | 12 | 24 |
| Eteläinen | Hatanpään valtatie (kolme osaa) | 12121 | 8 | 12, 11 ja 10 | 21, 22 ja 19 |
| Mustalahti ja Tammerkoski | Verstaankatu | 12131 | 8 | 11 | 24 |
| Eteläinen | (nimetön) | 12314 | 4 | 10 | 25 |

Santalahdessa on vain kolme alle 10 m ylitystä (kolme kertaa 7 m), joten sinne ei piirry siltoja. Naistenlahdessa on yksi silta, nimetön kevyen liikenteen silta kohdassa E 328 691, N 6 824 320. Tammerkosken ja Mustalahden lähellä on 16 piirrettävää siltaa. Nimet ovat paketin `nimi`-kentästä. Tieluokat ovat MML:n koodeja, ja leveyskartoitus on osin oletus (12111 ja 12112 valtatie, muut 121xx autotie, 12311 ... 12314 kevyen liikenteen väylä), koska pakettia ei ole liitetty koodiluetteloon. Talvitie (12316) on jätetty pois.

## Kriteeri 2: kuvat

1. Tammerkosken silta Mustalahden edustalta 300 m päästä: `shots/3i_tammerkoski_300m.png`. Lisäksi 100 m päästä `shots/3i_tammerkoski_100m.png`.
2. Sillan vierestä 50 m päästä: `shots/3i_tammerkoski_vierella_50m.png`, ja sillan alta `shots/3i_tammerkoski_alta.png`.
3. Naistenlahden silta 70 m päästä: `shots/3i_naistenlahti_silta_70m.png`. Santalahdessa ei ole siltoja, joten sieltä ei ole kuvaa.
4. Koko näkymä 1440 x 900 deck-asettelussa käyttäjän kuvan paikasta (Naistenlahden satama, aluksen suunta 112°, katse 067°, E 327 930, N 6 823 900): `shots/3i_koko_naistenlahti_1440x900.png`.
5. Koko näkymä 1440 x 900 Mustalahden edustalta suuntaan 160°, jossa Tammerkosken sillat näkyvät horisontissa: `shots/3i_koko_mustalahti_silta_1440x900.png`.

## Kriteeri 3: kolmiot ja kuvaväli

1. Siltojen kolmiot ovat selaimessa 2 148 ... 2 680 (17 ... 24 siltaa ja 53 ... 64 pilaria sijainnista riippuen), joten raja 20 000 alittuu selvästi. Yksittäisen sillan kolmiot ovat noin 40 ... 450.
2. Koko kuvan kolmiot ovat 57 157 ... 109 020 kaikissa ottamissani kuvissa, joten raja 300 000 alittuu. Deck-asettelussa Naistenlahden satamasta kolmioita on 88 148 (siltoja 19, niiden osuus 2 356 kolmiota) ja Mustalahden edustalla 109 020. Siltojen osuus koko kuvan kolmioista on noin 2,7 %.
3. Kuvaväli. Mittaus tehtiin samassa sivussa ja samassa prosessissa vuorotellen siltoja piirtäen ja piirtämättä (`testit/suor3i_pw.py`, 60 + 60 kuvaa, piirtopuskuri 0,55, `gl.readPixels` pakottaa GPU:n valmiiksi). Piirtoaika siltojen kanssa on mediaani 464,4 ms ja keskiarvo 482,2 ms, ilman siltoja mediaani 457,8 ms ja keskiarvo 471,7 ms. Suhde on 1,014 mediaanista ja 1,022 keskiarvosta, eli kasvu on 1,4 ... 2,2 %, mikä on alle 5 %:n rajan. Ympäristö on ohjelmallinen GL (SwiftShader) ja hidas, joten yksittäinen kuva kestää noin 460 ms ja hajonta on suuri (alaneljännes 1,080). Toinen, kuormitetumpi ajo `testit/kuva3i_sim_pw.py` (requestAnimationFrame-välit, tulos `testit/tulos_3i_kuvavali.json`) antoi keskiarvosuhteeksi 0,980 ja mediaanisuhteeksi 1,066. Se on liian kohinainen johtopäätökseen, koska rinnakkain ajettiin toisen agentin testejä. Todellinen lisäkustannus on yksi piirtokutsu ja noin 2,7 % lisää kolmioita.
4. Verkon rakennus: noin 9 ms geometria ja 2,6 ... 7 ms kokoaminen Node-ympäristössä, selaimessa enintään 50 ms raskaassa kuormassa. Rakennus tapahtuu vain kun alus ylittää ruudun rajan tai uusi ruutu latautuu (5 rakennusta latauksen aikana).

## Kriteeri 4: vanhat testit ja rakennus

1. Vanhat testit, kaikki läpi (ympäristömuuttujat `SIM` ja `PAKETTI`, ajettu peräkkäin): `mobiili_pw.py` Chromium 42/0, WebKit 42/0 ja yhden tiedoston versio (`simulaattori.html` repon juuressa, Chromium) 42/0, `valkkyminen_pw.py` Chromium 0/20 tyhjää ruutua, `asettelu_3d_pw.py` 89/0, `katse_pw.py` 5/0 ja `kiikari3g_pw.py` 26/0. Siltamoduulille on lisäksi oma Node-testi `testit/sillat3d_test.js` oikealla paketilla (tulos "Kaikki siltatestit läpi").
2. `build.py` tuotti `simulaattori.html`-tiedoston (1 225 627 tavua, `sillat3d.js` mukana, ei ulkoisia script- tai link-viittauksia). `index.html` ja `lahdekoodi/dist/Reittikartta.html` ovat muuttumattomat (md5 `edff5aed0e4cbb6603e33ef7c858dcce`).
3. `plotteri.js`, `tutka.js`, `harjoitus.js`, `liike.js`, `nakyma.js`, merkit (`merkit.js`, `merkit3d.js`, `merimerkit3d.js`, `maamerkit3d.js`), `laiturit3d.js`, `maasto.js` ja muut 19 seurattua tiedostoa ovat tavu tavulta samat kuin ennen työtä (md5-vertailu). `sim.js`:ssä on täsmälleen kaksi muutettua riviä (137 ja 687).
4. `asettelu_3d_pw.py` ja `valkkyminen_pw.py` luovat kuvia hakemistoon `shots/` (`3d_asettelu_*`, `_valk_*`), jotka poistettiin ajon jälkeen, koska niitä ei ollut ennen työtä.

## Alikulkukorkeus (tehtävä 3, ei toteutettu)

1. Paketista ei löydy alikulkukorkeutta Tampereen silloille. Ainoa korkeutta muistuttava kenttä on `sulkukanava.aluskorkeus`, 12 m, joka kuuluu Murolen sulkukanavalle eikä ole eteläpäässä.
2. Mahdollinen lähde on Väyläviraston avoin vesiväyläaineisto (WFS-kerrokset `vesivaylatiedot:sulkukanavat_avattavat_sillat` ja vastaavat). Sitä ei ole tarkistettu eikä sen kattavuutta Tampereen kaupunkisilloille tiedetä. Tammerkosken kaupunkisiltojen osalta aineisto saattaa olla vajaa, koska ne eivät ole varsinaisen kulkuväylän siltoja.
3. Ehdotus: jos alikulkukorkeus halutaan, otetaan Väyläviraston kerros mukaan tietoputkeen (`lataa.py` ja `rakenna.py`) ja tallennetaan sillan alapinnan korkeus vesipinnasta uuteen kenttään. Sillat3D lukisi sen ja käyttäisi kannen alapinnan korkeutena nykyisen 4 m vähimmäisarvon sijaan. Tietoputkea ei muutettu.
4. Nykyinen kannen alapinta (4 ... 5,7 m vedenpinnasta, maanpinnan korkeuden mukaan) on arvio eikä sovellu alikulkuharjoitukseen sellaisenaan.

## Havaintoja ja ehdotus tietoputkeen

1. Paketissa ei ole yhtään rautatietä (luokat 14xxx), eli rautatiesillat puuttuvat kokonaan. Rautatiekoodi on moduulissa valmiina (5 m leveä tummanruskea teräskansi) ja testattu synteettisellä aineistolla. Ehdotus: lisää rautatiekerros (MML `rautatie`) tiedostoihin `/home/claude/reittikartta-aineisto/lataa.py` ja `rakenna.py` (`tee_tie`). Tietoputkea ei muutettu.
2. Tammerkosken silta ei puuttunut paketista, joten korjausta tietoputkeen ei tarvita. Silta oli puuttunut vain 3D-näkymästä.
3. Vaiheen 3h tutkan kaikumalli voi käyttää samaa dataa. `view.bridges.info().stats.list` sisältää jokaisesta sillasta nimen, luokan, leveyden, pituuden, veden päällä olevan pituuden, päiden koordinaatit (E ja N), kannen alapinnan korkeuden ja maanpinnan korkeuden päissä.

## Suunnittelupäätökset

1. Ruutujen lukeminen z14-tasolta z16:n sijaan. Veden päällä oleva pituus poikkeaa alle 1 %, ja ruutuja on noin 16 kertaa vähemmän.
2. Veden päällä olevan jakson vähimmäispituus 10 m (asetus `minWater`). Alle 10 m ylitykset (purot ja ojat) jäivät kokeessa korkeiksi betonilohkoiksi 4 m vähimmäisalikulun takia.
3. Pilarien määrä kannen leveyden mukaan, jotta kevyen liikenteen silta ei näytä aidan päällä seisovalta laatikolta.
4. Alikulku 4 m on asetus (`minClear`) eikä mitattu arvo.
