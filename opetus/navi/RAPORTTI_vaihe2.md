# Raportti, vaihe 2: Maasto-tasot ja osoitehaku

Päiväys 25.10.2026. Työkopio `/home/claude/reittikartta-maasto/`. Määrittely: `/home/claude/opetus/navi/MAARITTELY_vaihe2_maastotasot.md`.

## 1. Tulos lyhyesti

Näytä-valikossa on ryhmä Maasto (Näsijärvi), jossa on kuusi oletuksena pois päältä olevaa valintaa: Rakennukset, Osoitteet, Kiinteistörajat, Maastotyyppi, Varjostus ja Tiet. Tasot piirretään suoraan vaiheen 1 PMTiles-paketista ilman omaa palvelinta. Hakukenttä ja tehtäväpaikan haku löytävät katuosoitteen ja kiinteistötunnuksen, vaikka tasot ovat pois päältä. Kiinteistörajojen ja rakennusten napautus näyttää kiinteistötunnuksen tai rakennuksen tiedot. Näsijärven alueen ulkopuolella näkyy huomautus Maastoaineisto kattaa vain Näsijärven, eikä paketista pyydetä yhtään tiiltä.

Kaikki kahdeksan hyväksymiskriteeriä täyttyvät. Mobiilitestit ajettiin myös oikealla WebKitillä iPhone 14 -profiililla (kohta 3). GitHubin putkiajo on tehtävä uudelleen, jotta julkaistu paketti sisältää osoite- ja kiinteistöhakemistot (kohta 6).

## 2. Hyväksymiskriteerit

| Nro | Kriteeri | Mitattu | Tulos |
| --- | --- | --- | --- |
| 1 | Osoitehaku alle 50 m, kelpaa tehtäväpaikaksi | Laiturikatu 8: 0,1 m, Rantatie 3: 0,4 m, Siilinkari 2: 0,6 m vaiheen 1 osoitepisteestä. Tulosrivillä laji osoite, kunta ja etäisyys. Valinta zoomaa tasolle 17 ja asettaa tehtäväpaikan. Toimii tasot pois päältä. | Hyväksytty |
| 2 | Kiinteistötunnushaku, kolme tunnusta | Tampereen keskusta 837-103-9902-0, Teisko 837-90-8002-2 ja Murole (Ylöjärvi) 980-452-6-22 löytyvät. Tunnus toimii väliviivoin, välilyönnein ja 14 numerona. Pisteet 0,4, 0,2 ja 0,3 m:n päässä lähdeaineiston pisteestä. | Hyväksytty |
| 3 | Tunnus napautuksella kolmessa paikassa | Napautus tunnuspisteen kohdalla näyttää tunnuksen 3/3. Sadan metrin päästä napautus ei näytä samaa tunnusta. Rakennuksen napautus (Kauppakatu 4) näyttää käyttötarkoituksen, kerrosluokan, osoitteen ja maanpinnan korkeuden. | Hyväksytty |
| 4 | Pixel 7: tiilen piirto alle 100 ms ja yhden näkymän siirto alle 2 Mt (rakennukset, tiet ja varjostus, Tampereen keskusta z15) | Siirto 0,16 Mt (käynnistys 0,18 Mt). Vektoritiilen piirto valmiista tiilestä: mediaani 14 ms, p95 23 ms, enintään 28 ms. Neljä kertaa hidastetulla suorittimella p95 61 ms. Varjostuksen laskenta enintään 21 ms tiiltä kohden. Tiilen haku, purku ja piirto kylmänä: mediaani 234 ms, kun kahdeksan tiiltä haetaan rinnakkain paikallisesta paketista. | Hyväksytty |
| 5 | Alueen ulkopuolella ei konsolivirheitä, ei tiilipyyntöjä, huomautus näkyy | Helsinki: 0 pyyntöä PMTiles-tiedostoihin, 0 konsolivirhettä, huomautus tekstillä Maastoaineisto kattaa vain Näsijärven. Siirtyminen alueelle ja pois sieltä tuo ja poistaa huomautuksen. | Hyväksytty |
| 6 | Nykyiset testit läpi ja uusi `terrain_test.py` kattaa kohdat 1-5 | Katso kohta 3 | Hyväksytty |
| 7 | Mobiilitestit | WebKit iPhone 14: terrain_test.py:n mobiiliosuus 10/10 ja mobile_test.py 28/28 läpi. Chromium Pixel 7: terrain_test.py:n mobiiliosuus 10/10 ja mobile_test.py läpi. Sivu mahtuu, Maasto-valinnat 43 px korkeita, haun tulosrivi 46 px, tietoikkuna mahtuu, ei konsolivirheitä. | Hyväksytty |
| 8 | Yhden tiedoston koko kasvaa alle 400 kt | 615 033 tavua ennen, 805 585 tavua nyt, kasvu 190 552 tavua (186 kt). | Hyväksytty |

## 3. Testit

Uusi `lahdekoodi/tests/terrain_test.py` ajettiin kokonaisena yhdellä kertaa: 96 tarkistusta, kaikki läpi. Se kattaa osoite- ja tunnushaun, tehtäväpaikaksi valinnan, napautukset, tasojen näkyvyyden ja piirtojärjestyksen, lähdemerkinnät, asetuskentän, alueen ulkopuolen, verkon katkeamisen ja palautumisen, Pixel 7 -suorituskyvyn, ajon web-osoitteesta (http, eri alkuperä kuin aineistopaketti) sekä puhelinkierrokset. Testi osia voi ajaa erikseen muuttujalla `OSA`.

Kaikki aiemmat testit ajettiin uutta koontiversiota vastaan tiedostona avattuna: vector, enc, extra, safety, snap, wheel, legnote, structures, route, aid, search, task_gps, pier_gps, proxy ja mobile. Kaikki päättyivät paluukoodiin 0 ja 288 hyväksyttyä tarkistusta ilman yhtään virhettä. Lähtötilanteessa vastaava ajo antoi 283 hyväksyttyä, ja ainoa virhe (proxy_test) johtui siitä, että `dist/`-hakemistoa ei vielä ollut. Aiemmat testit eivät siis muuttuneet. Hyväksyttyjen määrän ero (288 ja 283) selittyy sillä, että proxy_test pääsi nyt läpi.

WebKit-ajo. Ympäristöön asennettiin myöhemmin WebKit (webkit-2359), ja mobiilitestit ajettiin uudelleen oikealla WebKitillä iPhone 14 -profiililla:

- terrain_test.py:n mobiiliosuus (`DEVICE="iPhone 14" OSA=mobiili`): 10/10 tarkistusta läpi. Moottori oli webkit, eikä Chromium-varaa tarvittu.
- mobile_test.py WebKitillä (iPhone 14 -profiili, näkymän korkeus 844 px kuten testissä): 28/28 tarkistusta läpi. Testitiedostoa ei muutettu, vaan ajo tehtiin tilapäisellä kopiolla, jossa vain selain ja profiili vaihdettiin, ja kopio poistettiin.
- PMTiles-luku Range-pyynnöillä WebKitissä paikallista palvelinta vasten: sekä tiedostona avattuna (file://) että web-osoitteesta (http, eri alkuperä kuin aineistopaketti) 7 Range-pyyntöä tiedostoihin nasijarvi.pmtiles ja maasto.pmtiles, siirto 0,15 Mt, vektori-, maastotyyppi- ja varjostustiilet piirtyvät (6 tiiltä kustakin), 0 epäonnistunutta latausta ja 0 sovelluksen konsolivirhettä. Konsolin ainoat 400-virheet tulivat testin korvaamasta Traficomin WMTS-karttapalvelusta, kuten kaikissa muissakin testeissä.
- Kuvakaappaukset hakemistossa `shots/`: `webkit-iphone14-nayta-maasto.png` (Näytä-valikon Maasto-ryhmä), `webkit-iphone14-osoitehaku.png` (osoitehaun tulos), `webkit-iphone14-rakennus-tietoikkuna.png` (rakennuksen tietoikkuna) ja `webkit-iphone14-kartta-z15.png` (Tampereen keskusta z15 kaikki tasot päällä).

Ajo tehtiin tiedostona avattuna (file://) ja web-osoitteesta (http-palvelin, eri alkuperä kuin aineistopaketti), mikä vastaa tuplaklikattua tiedostoa ja Vercel-tyyppistä käyttöä.

## 4. Päätökset ja oletukset

1. **Kirjasto.** Valittu protomaps-leaflet 5.1.0 ja pmtiles 4.5.0 (molemmat BSD-3, lisenssitekstit tiedostossa `lahdekoodi/lib/LISENSSIT.txt`). Perusteet: lukee PMTiles-tiedoston suoraan Range-pyynnöillä ja piirtää MVT-tiilet Leafletin GridLayerina, joten nykyinen Leaflet 1.9.4 -rakenne säilyy. MapLibre GL olisi vaatinut toisen karttamoottorin ja WebGL-tuen rinnakkain Leafletin kanssa tai koko kartan uudelleenkirjoituksen. Kokoa ei verrattu mittaamalla. Kirjastot ovat yhdessä 149 kt.
2. **Vaihtoehto a.** Osoite- ja kiinteistöhaku käyttää putken tuottamia `osoitteet.json` ja `kiinteistot.json` -hakemistoja (vaihtoehto a). Ne on lisätty putken `rakenna.py`-tiedostoon ja kuvattu `aineisto.json`:n hakemistot-kentässä. Tiedostokoot 1,69 Mt (330 kt pakattuna) ja 1,08 Mt (256 kt), ladataan vasta ensimmäisellä haulla.
3. **Määrittelyn kiinteistöarvio oli väärä.** Määrittelyssä arvioitiin noin 200 000 kiinteistöriviä. Alueella on 28 219 tunnusta (32 007 pistettä) ja 42 427 osoitetta 2 745 kadulla.
4. **Osoitepiste vasta tasolta 16.** Paketin osoitekerroksen pienin zoom on 15 ja sen data on tasolla 15-16. Osoitepiste piirretään zoomista 16 ja teksti zoomista 17. Määrittelyn raja z16 on toteutettu datarajana.
5. **Kiinteistörajat z16.** Raja-aineisto on tasolla 16, joten rajat näkyvät zoomista 16.
6. **Alueen tunnistus.** Alue on suorakulmio aineisto.json:n `alue`-kentästä (23,494; 61,476; 24,105; 62,021). Kartan näkymän ja tiilen on leikattava tämä, muuten tasoa ei lisätä eikä tiiltä pyydetä.
7. **Napautus.** Rakennuksen napautus hyväksyy pisteen rakennuksen sisällä tai enintään 3 m reunasta (myös viereisten tiilien rakennukset). Lähin osoite enintään 20 m, kiinteistötunnus enintään 30 m (enintään kolme tunnusta) ja tien nimi enintään 8 m. Napautus ei avaa tietoikkunaa, kun sovellus on muokkaus- tai mittaustilassa tai kun napautus osuu interaktiiviseen kohteeseen.
8. **Varjostus.** Laskettu selaimessa Terrain-RGB-tiilestä (tasoon 14 asti, sen yli suurennettuna), valo luoteesta ja korostus 2,4. Ei korkeuskäyriä. Varjostetut tiilet ovat 40 tiilen LRU-välimuistissa.
9. **Lähdemerkinnät.** Kartan oikeassa alakulmassa näkyvät vain päällä olevien tasojen lähteet (aineisto.json:n lähdekohtaiset merkinnät). Ohje → Aineistot ja käyttöehdot luettelee kaikki paketin lähteet lisensseineen ja DVV:n poimintapäivän. Kaikki teksti luetaan aineisto.json:sta, ja se haetaan kerran.
10. **Verkkovirheet.** Tason lataus ei näytä virheilmoitusta eikä kirjoita konsoliin. Virhe muunnetaan hiljaiseksi keskeytykseksi, jolloin tyhjää tiiltä ei tallenneta. Kirjasto jättää epäonnistuneen otsikkohaun välimuistiinsa, joten uusi PMTiles-olio luodaan 5 sekunnin kuluttua ensimmäisestä virheestä, ja kun verkko palaa, tiilet piirretään uudelleen. aineisto.json- ja hakemistohaut uusitaan enintään 30 sekunnin välein.
11. **Piirtojärjestys.** Uudet paneelit ovat 220 (maastotyyppi), 225 (varjostus) ja 230 (tiet, rakennukset, osoitteet ja kiinteistörajat), eli merikartan (200-215) päällä ja karttamerkkien, reittien (400) ja tekstien (450-460) alla. Yötilan suodatin ulottuu uusiin paneeleihin. Kiinteistörajat, tiet, rakennukset ja osoitteet ovat yhdessä vektoritasossa, ja piirtojärjestys niiden välillä tulee tyylisäännöistä.
12. **Putken korjaus.** Vaiheen 1 DVV-osoitetaulun dbf luettiin väärällä merkistöllä (ä ja ö hajosivat). Putki lukee nyt dbf:n UTF-8-merkistöllä, ja osoitteet.json on rakennettu uudelleen.
13. **Murolen testipiste.** Vaiheen 1 tarkistuksen Murole-piste oli merellä (tunnusta ei löytynyt). Pisteeksi vaihdettiin (23,7100; 61,9300), ja tarkista.py molemmat kopiot päivitettiin.

## 5. Mikä ei toiminut tai on rajoitettu

1. **Safari ja GitHub Pages.** WebKit-ajo (kohta 3) osoittaa, että PMTiles-luku Range-pyynnöillä toimii WebKitissä paikallista palvelinta vasten, myös ristiin eri alkuperästä. Se ei kuitenkaan ole oikea Safari iPhonella, eikä GitHub Pagesin omaa Range- ja CORS-käytöstä ole testattu.
2. **GitHub Pages ei tavoitettavissa.** Aineistopaketti palveltiin paikallisella palvelimella, joka tukee Range-pyyntöjä ja CORS-otsikoita. Oikean GitHub Pages -osoitteen (`https://jvaahtikari.github.io/reittikartta-aineisto/`) toiminta on varmistettava putkiajon jälkeen.
3. **Vaiheiden aikana löydetyt virheet korjattu.** Offline-palautuminen (tiilet eivät piirtyneet, kun verkko palasi) johtui PMTiles-kirjaston välimuistiin jäävästä epäonnistuneesta otsikkohausta, ja se korjattiin luomalla PMTiles-olio uudelleen. Testin suorituskykymittaus oli aluksi sekunteja liian hidas, koska Playwrightin Python-käsittelijä jonotti paketin pyynnöt. Paketin pyynnöt ohitetaan nyt käsittelijällä.
4. **Satunnainen testihäiriö.** Testi Tyhjä osoite palauttaa oletuksen epäonnistui kerran noin 15 ajosta. Lisäsin odotuksen ja diagnostiikan, ja sen jälkeen kymmenen peräkkäistä ajoa meni läpi. Syytä ei tunnistettu, ja epäilen testiajon kilpailutilannetta.
5. **Kylmä tiili.** Kriteerin 4 piirtoaika mitataan valmiista tiilestä. Tiilen haku ja purku yhdessä kestää Pixel 7 -profiilissa 234 ms (mediaani, kahdeksan rinnakkaista tiiltä), ja neljä kertaa hitaammalla suorittimella 409 ms. Todellisessa verkossa lisäys on verkon viive.
6. **Zoom 17 ja 18.** Vektoridata loppuu tasolle 16, joten tasoilla 17-18 tiilet ovat suurennettuja ja viivat voivat näyttää karkeilta.

## 6. GitHub-putken uusintaajo tarvitaan

Paikallinen `ulos/`-hakemisto (`/home/claude/opetus/navi/putki/ulos/`) on rakennettu uudelleen ja sisältää uudet `osoitteet.json`, `kiinteistot.json` ja päivitetyn `aineisto.json`:n. Julkaistu GitHub Pages -paketti ei vielä sisällä niitä. Putken GitHub-työnkulku lataa koko `ulos`-hakemiston, joten uusi ajo julkaisee tiedostot automaattisesti. Ennen uusintaajoa pitää kopioida päivitetyt `rakenna.py`, `asetukset.py`, `lataa.py`, `tarkista.py` ja `LUEMINUT.md` (työkopiossa `/home/claude/reittikartta-aineisto/` ja kopiot hakemistossa `/home/claude/opetus/navi/putki/`) repositorioon `reittikartta-aineisto`. Muutoksia ei ole commitoitu.

Kunnes uusintaajo on tehty, kartta toimii ilman osoite- ja kiinteistöhakua: hakemistojen lataus epäonnistuu hiljaa, eikä tulosrivejä tule, mutta Maasto-tasot toimivat.

## 7. Muutetut tiedostot

Sovellus (`/home/claude/reittikartta-maasto/`):

| Tiedosto | Muutos |
| --- | --- |
| `lahdekoodi/js/terrain.js` | uusi: Maasto-tasot, alueen tunnistus, napautus, osoite- ja tunnushaku, lähdemerkinnät |
| `lahdekoodi/js/app.js` | valikkoryhmä, asetuskenttä Maastoaineiston osoite, Pikaohje, Ohje → Aineistot ja käyttöehdot |
| `lahdekoodi/js/search.js` | osoite- ja tunnushaku hakukenttään ja tehtäväpaikan hakuun |
| `lahdekoodi/js/store.js` | oletukset `terrain*` ja `terrainUrl` |
| `lahdekoodi/js/chart.js` | `muniName` kuntakoodin nimeksi |
| `lahdekoodi/css/app.css` | yötilan suodatin uusille paneeleille ja tietoikkunoiden välistys |
| `lahdekoodi/index.html` | skriptiviitteet |
| `lahdekoodi/lib/pmtiles.js`, `lib/protomaps-leaflet.js`, `lib/LISENSSIT.txt` | uudet kirjastot ja lisenssit |
| `lahdekoodi/tests/terrain_test.py` | uusi testi |
| `README.md`, `lahdekoodi/LUEMINUT.md` | uusi osio, aineistotaulukko, lisenssit, tietosuoja, rajoitukset |
| `index.html` | uusi yhden tiedoston koontiversio |

Tietoputki (`/home/claude/reittikartta-aineisto/` ja kopio `/home/claude/opetus/navi/putki/`): `rakenna.py` (hakemistot, UTF-8-korjaus), `asetukset.py`, `lataa.py`, `tarkista.py` (hakemistotarkistus), `LUEMINUT.md`. Tuotokset hakemistossa `/home/claude/opetus/navi/putki/ulos/`: `osoitteet.json`, `kiinteistot.json`, `aineisto.json`, `tarkistus.json`.
