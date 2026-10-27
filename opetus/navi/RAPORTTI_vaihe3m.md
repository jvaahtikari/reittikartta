# Raportti, vaihe 3m: Googlen 3D-näkymä testiin ja tuulimallin siirtosuunnitelma

Päiväys 27.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable.

Tilaajan muutos klo 08.44 peruutti tuulimallin toteutuksen toistaiseksi. Tässä vaiheessa ei siis muutettu `liike.js`-tiedostoa eikä lisätty tuuliasetuksia. Tuulimalli on raportissa vain selvityksenä ja siirtosuunnitelmana (kohta 4). Kohdat 1–3 ja 5–6 koskevat Google 3D -näkymää.

## 1. Päätulokset lyhyesti

- Vertailusimulaattorin Google-näkymä on Maps JavaScript API:n `Map3DElement`, jonka päälle omat ja muiden alusten piirrokset tulevat erilliselle 2D-kankaalle. Kameraa ohjataan keskipisteellä, etäisyydellä (range), suunnalla, kallistuksella ja kuvakulmalla.
- Hinta: tarvitaan Google Cloudin laskutustili. Maps JavaScript API:n 3D-karttakutsu kuuluu Immersive Maps -tuotteeseen (Pro-luokka), jossa on 5 000 maksutonta karttalatausta kuukaudessa ja sen jälkeen 7,00 USD tuhatta latausta kohti (hintasivu päivitetty 23.10.2026). Koulutuskäytössä käyttö jää käytännössä ilmaisosuuden sisään, koska yksi lataus syntyy aina, kun käyttäjä valitsee Google 3D -näkymän.
- Kattavuus Tampereella: Tampereesta on fotogrammetrinen 3D-malli (todennettu käyttäjän Google Earth -kuvasta 27.10.2026, jossa Näsinneula, Särkänniemi, rakennukset ja puut ovat kappaleina ja kuvauspäivä 16.7.2025). Googlen kattavuussivu itse sanoo vain, että maastotieto on maailmanlaajuinen mutta rakennusten ja puiden pintatieto on rajattu sinisellä merkittyihin alueisiin, ja sen hakukenttä on interaktiivinen. Google Earthin kattavuus on varmennettu, ja sama aineisto on oletettavasti Maps JavaScript API:n 3D-kartassa. Sen varmistaa vasta oikealla avaimella tehtävä testi.
- Tärkeä rajoite: Suomi kuuluu ETA-alueeseen, ja ETA-laskutusosoitteella 8.7.2025 jälkeen luoduissa projekteissa Map Tiles API:n Photorealistic 3D Tiles ja satelliitti-2D-tiilet palauttavat virheen 403. Siksi Cesium-reitti ei ole käytettävissä suomalaisella avaimella, ja toteutus käyttää vain `Map3DElement`ia. Google nimeää itse 3D Mapsin korvaajaksi. `Map3DElement`illä ei löytynyt vastaavaa ETA-rajoitusta: Googlen ETA-sivun (`developers.google.com/maps/comms/eea/faq`, luettu 27.10.2026) mukaan teknisiä muutoksia on vain Maps Static API:ssa, Map Tiles API:ssa ja Solar API:ssa ja "at this time, only the Services listed above are changing". Maps JavaScript API:ta tai 3D Mapsia ei mainita rajoituksina. Googlen oma huomautus on, että sivu on ajankohtainen vain kirjoitushetkellä, joten varmuus saadaan vasta oikealla avaimella.
- Suositus: pidetään näkymä valinnaisena testinäkymänä ja arvioidaan sen arvo käyttäjän testin jälkeen (kohta 3).

## 2. Selvitys

### 2.1 Miten vertailusimulaattorin Google-näkymä toimii

Lähteet: `ui/web/forward_view/google_maps_3d.js` (1 300 riviä), `google_maps_3d.html`, `cesium_simple_view.js`, `docs/v2_1_forward_view.md` ja `THIRD_PARTY_NOTICES.md`, luettu 27.10.2026.

Näkymä on Qt-sovelluksen sisällä toimiva verkkosivu, ja siinä on kaksi vaihtoehtoista piirtäjää. Ensimmäinen käyttää Maps JavaScript API:n `maps3d`-kirjastoa ja `Map3DElement`ia. Toinen käyttää CesiumJS:ää (versio 1.145) ja lataa Googlen fotorealistiset 3D-tiilet osoitteesta `tile.googleapis.com/v1/3dtiles/root.json` Map Tiles API:n avaimella, ja siinä on `showCreditsOnScreen: true`. Asetuksissa on automaattivalinta, joka vaihtaa Cesiumista `Map3DElement`iin, kun suora tiilipyyntö estyy alueen vuoksi (koodissa `region-restricted`, ETA-yhteensopiva tila).

Kamera. `Map3DElement` luodaan asetuksilla `mode: "SATELLITE"`, `defaultUIHidden: true` ja `gestureHandling: "GREEDY"`. Kameraa ohjataan neljällä arvolla joka päivityksellä:

- `center` on aluksen sijainti (lat, lng) ja korkeus 2 m. Katsepisteeseen lisätään siirtymä eteenpäin (22 % etäisyydestä, TOP-tilassa 0).
- `heading` on aluksen suunta plus käyttäjän asettama kulma.
- `tilt` on 90° miinus korkeuskulma, rajattuna 0 ... 85°.
- `range` on etäisyys keskipisteestä kameraan, 80 ... 12 000 m, oletus 560 m.

Kamera siis kiertää aluksen vierellä olevaa pistettä ulkopuolelta eikä sijaitse aluksen silmäpisteessä. Kuvakulmaa (`fov`) ei aseteta, joten Googlen oletus 35° on voimassa. Päällepiirron oma projektiolaskenta käyttää kuitenkin oletuksena 45°:ta.

Alukset. Omaa ja muiden alusten runkoa ei lisätä karttaan 3D-objekteina. Kartan päälle on asetettu läpinäkyvä 2D-kangas (`navigationOverlay`), jolle rungon ääriviivat, AIS-kohteiden vektorit ja nimet piirretään sillä, että koodi laskee kameran (center, heading, tilt, range, fov) mukaisen projektion itse. Tämä on tarkoituksellista, koska maaston ja rakennusten piirto ei silloin peitä aluksia. Kartan sisäisiä polygoni- tai merkkielementtejä ei käytetä (diagnostiikassa niiden määrä on 0).

Avain ja virheet. Avain tulee Qt-sovelluksen asetusdialogista (tai ympäristömuuttujasta `MARITIME_SIM_GOOGLE_3D_TILES_API_KEY`) ja välitetään sivulle funktiolla `configureVisualRenderer`. Kirjasto ladataan script-elementillä osoitteesta `maps.googleapis.com/maps/api/js?key=...&v=weekly&loading=async&libraries=maps3d`. Avain puuttuu: näytetään teksti "A Google API key is required for Google 3D Maps." ja avaimen asetusnappi pysyy käytössä. Googlen avainhylkäys tulee `gm_authFailure`-takaisinkutsuna, kirjaston latausvirhe `onerror`-tapahtumana ja kartan alustusvirhe `gmp-error`-tapahtumana, ja kaikista näytetään virheteksti. Virhe jää näkyviin, ja avaimen asetusnappi pysyy käytössä.

Ei toimi ilman verkkoa. Kirjasto ja kaikki tiilet haetaan Googlelta suoratoistona. Lähdekoodin oma dokumentti toteaa, että ohjelma ei ole Googlen tiilien lataaja eikä offline-välimuisti. Ilman yhteyttä, ilman laskutustiliä tai ilman avainta näkymä ei toimi lainkaan.

### 2.2 Ehdot, hinta ja kattavuus (haettu Googlen omilta sivuilta 27.10.2026)

Hinta (hintasivu `developers.google.com/maps/billing-and-pricing/pricing`, päivitetty 23.10.2026):

| Tuote | Luokka | Maksuton määrä kuukaudessa | Hinta tuhatta tapahtumaa kohti |
| --- | --- | --- | --- |
| Immersive Maps (3D Maps Maps JavaScript API:ssa, laskutettava tapahtuma on onnistunut karttalataus) | Pro | 5 000 | 7,00 USD (enintään 100 000), 5,60 USD (100 001 – 500 000) |
| Map Tiles API: Photorealistic 3D Tiles (laskutettava tapahtuma on tiilipyyntö, joka palauttaa 3D-tiilen) | Enterprise | 1 000 | 6,00 USD (enintään 100 000), 5,10 USD (100 001 – 500 000) |

SKU-kuvaukset ovat sivulla `developers.google.com/maps/billing-and-pricing/sku-details`. Sivu ei mainitse `Map3DElement`ia nimeltä, mutta Immersive Maps -kuvaus on "3D Maps in Maps JavaScript API". Laskutustili vaaditaan (ohjesivun mukaan vaihtoehtona on vain testitarkoituksen "Maps Demo Key"). Vanha 200 dollarin kuukausikrediitti päättyi 28.2.2025, eikä sille ole korvaajaa tällä sivulla. Epävarmaa: en pystynyt varmistamaan, laskutetaanko `Map3DElement` Immersive Mapsina vai Dynamic Mapsina (10 000 maksutonta, sama hinta). Kumpikin tulkinta antaa ilmaisen käytön tässä mittakaavassa.

Esimerkki. Jos 20 koulutettavaa avaa Google-näkymän viisi kertaa kuukaudessa, kuukaudessa tulee 100 latausta, eli 2 % maksuttomasta määrästä. Hinta on silloin 0 euroa. Laskutustili (luottokortti) on silti pakollinen.

ETA-rajoitus. Sivun `developers.google.com/maps/comms/eea/map-tiles` (päivitetty 23.10.2026) mukaan Photorealistic 3D tiles ja 2D Tilesin satelliittikuvatiilet "are not available" projekteissa, jotka on luotu 8.7.2025 jälkeen ja jotka on liitetty ETA-laskutusosoitteeseen. Pyyntö palauttaa virheen 403. Sivu ehdottaa korvaajaksi 3D Mapsia Maps JavaScript API:ssa. ETA-rajaus perustuu laskutusosoitteeseen, ei loppukäyttäjän sijaintiin (ETA-usein kysytyt kysymykset, 27.10.2026), ja Suomi on listalla. Näkymä rakennettiin siksi vain `Map3DElement`in varaan. Muut ETA-sivut (`developers.google.com/maps/comms/eea/` ja `.../maps-js`) eivät latautuneet tässä ympäristössä. Epävarmaa: ETA-sivut eivät mainitse `Map3DElement`ia, joten rajoituksen puuttuminen perustuu siihen, ettei sitä ole listattu. ETA-ehdot (Service Specific Terms, EEA, muokattu 10.6.2026) eivät myöskään sisällä 3D-karttaa koskevia lausekkeita.

Käyttöehdot (Map Tiles API Policies, `developers.google.com/maps/documentation/tile/policies`, luettu 27.10.2026):

- Tiilien esihaku, indeksointi, tallennus ja välimuistitus on kielletty, ja välimuistiotsikoita (`Cache-Control`) pitää noudattaa. Offline-käyttö on kielletty. Tiilien välimuistitus omaan käyttöön ei siis ole sallittua.
- Käyttö on rajattu kartan visualisointiin. Kuva-analyysi, koneellinen tulkinta, kohteiden tunnistus sekä geodatan irrotus ja jälleenmyynti on kielletty. Tästä seuraa, ettei Googlen kuvaa saa käyttää esimerkiksi tutkakuvan, maaston korkeuksien tai rakennusten muotojen tuottamiseen. Päällepiirrot ovat sallittuja, jos kohteita ei ole johdettu tiilistä käsin tai koneellisesti.
- Lähdemerkinnät: Google Maps -logo (tai teksti) ja tietolähteet täydellisinä, yleensä oikeassa alakulmassa. Logoa ei saa muuttaa. Toteutuksessa `Map3DElement` näyttää merkinnät itse, ja oma käyttöliittymä pidetään pois alakulmasta (kartan kokonaan peittävä laatikko ei peitä sitä).
- Ei-kaupallisia tai opetuskäytön poikkeuksia ei löytynyt. Simulaattoreista tai koulutuksesta ei mainita mitään. Epävarmaa: Maps JavaScript API:n omia käyttöehtoja (jotka koskevat `Map3DElement`ia) ei saatu luettua, koska palvelun ehtosivu ei kuvaa 3D-karttaa. Ne pitää tarkistaa ennen Meripelastusseuran käyttöä, jos se on tulossa.

Kattavuus. Googlen sivu `developers.google.com/maps/documentation/javascript/3d/coverage` (päivitetty 21.10.2026, kattavuus päivittyy päivittäin klo 11.00 UTC) sanoo: "3D terrain data is available worldwide." ja "3D surface data is limited to the areas highlighted in blue on the map". Sivun hakukenttä on kartan päällä, eikä sitä voi lukea tekstinä, joten Tampereen tilaa ei saatu sivulta. Hakukoneella ei löytynyt Tampereesta muuta kuin vanha Google Earth -blogi vuodelta 2009 (eri tuote, ennen fotorealistista mallia).

Todennus käyttäjän kuvasta: käyttäjä näytti 27.10.2026 Google Earthin (earth.google.com, iPad) kuvan Näsinneulasta ja Särkänniemestä. Kuvassa rakennukset, puut ja Näsinneula ovat fotogrammetrisia kappaleita, ja kuvauspäivä 16.7.2025 näkyy kuvan alareunassa. Tampereesta on siis fotogrammetrinen 3D-malli Google Earthissa. Oletus on, että sama malli on käytettävissä Maps JavaScript API:n 3D-kartassa, mutta sitä ei ole varmennettu, ja ETA-laskutuksen mahdollinen vaikutus selviää vasta oikealla avaimella tehtävässä testissä. Hyödyllinen havainto: mallin kuvauspäivä on kesäkuukausi, joten lehtipuut ovat lehdessä ja valaistus on kesäpäivän.

### 2.3 Arvio ja suositus

Mihin Google-näkymä sopii (Tampereen fotogrammetrinen malli on todennettu):

- Maamerkkien tunnistaminen (Näsinneula, Naistenlahden ja Tampellan piiput, kaupunkisiluetti) oikeana valokuvamaisena vertailukuvana oman maiseman rinnalla.
- Rakennusten ja rantojen ulkonäön vertailu oman maiseman parantamiseen. Näkymän saa samaan paikkaan ja samalle kuvakulmalle kuin oma näkymä, joten vertailu on suoraviivaista (testin kameralaskenta on tehty juuri tätä varten).

Mihin se ei sovi:

- Vesi ja turvalaitteet. Karttakuva on staattinen otos, jossa ei ole viittoja, valoja tai linjatauluja, ja vesi on kuvauspäivän vesi. Simulaattorin vesi, merimerkit ja väylänmerkinnät ovat vain omassa näkymässä.
- Yö, sää ja vuorokaudenaika. Kuva on kuvauspäivän päivänvalokuva eikä seuraa simulaattorin kelloa.
- Oma vene ja ohjaamo. Googlen näkymässä ei ole Repan runkoa, ikkunoita tai kojelautaa. Silmäpiste on sama, mutta runkoa ei piirretä.
- Offline-käyttö ja puhelin. Ehdot kieltävät offline-käytön, ja suoratoisto vaatii hyvää verkkoyhteyttä ja WebGL-suorituskykyä. Mobiilissa kuormitus ja datan määrä ovat suuria.
- Tutka, törmäys- ja pohjakosketuslogiikka. Ne perustuvat omiin aineistoihin, eikä Googlen kuvaa saa käyttää niiden tuottamiseen (ehdot, kohta 2.2).

Suositus: pidetään näkymä valinnaisena testinäkymänä (se on jo toteutettu, ja ilman avainta se ei vaikuta mihinkään) ja käytetään sitä referenssinä oman maiseman parantamiseen silmämääräisesti (ei aineistona, koska ehdot kieltävät johdetun datan). Ei käytetä sitä simulaattorin pääasiallisena näkymänä.

- Jos oikealla avaimella Tampere näkyy fotogrammetrisena myös `Map3DElement`issa, näkymä jää valinnaiseksi vertailu- ja maamerkkinäkymäksi.
- Jos `Map3DElement` ei ETA-laskutuksella näytä pintamallia tai kuva ei aukea, näkymä poistetaan, koska siitä ei ole silloin hyötyä simulaattorissa.
- Simulaattoria ei rakenneta riippuvaiseksi Googlesta. Omat aineistot (Maanmittauslaitos, Väylävirasto) ovat avoimia ja toimivat ilman laskutustiliä.

## 3. Toteutus

Uudet ja muuttuneet tiedostot (hakemisto `lahdekoodi/`):

- `simulaattori/js/google3d.js` (uusi, 189 riviä). Kameran laskenta, avaimen tallennus, kirjaston lataus ja ohjain.
- `simulaattori/js/sim.js`. Rivit 27–28 (tila `ext` ja `g3`), 153–164 ja 179 (avainkenttä aloitusnäytössä), 196 (ohjaimen luonti), 334 (uusi ajo palauttaa oman näkymän), 566–572 (valikon ja ohjeruudun napit), 736–777 (Google-näkymän funktiot), 864 (kuvalaskuri testille), 893–895 ja 897 (oma näkymä piirtyy harvemmin, kun Google on päällä), 899 (kameran päivitys), 930 (purku palauttaa oman näkymän), 967 (komentolokin teksti), 977 (valikon teksti).
- `simulaattori/js/nakyma.js`. Yksi uusi funktio `stepGaze` (katseen tasoitus ilman piirtoa). Tarvitaan, koska katseen tasoitus tehdään `render`-kutsun sisällä, ja oma näkymä piirtyy Google-tilassa vain joka kahdeksannella kuvalla. Ilman sitä kompassikaista ja Google-kamera seuraisivat katseen kääntöä viiveellä (mittaus: 3,5 s:n kuluttua 30,7° 60°:sta).
- `simulaattori.html`. Avainkenttä ja ohje aloitusnäytössä, valikkonappi `mView`, ohjeruutu `g3dInfo`, tilakilpi `g3dBadge` ja script-viite. Rakennettu `simulaattori.html` (repon juuri) kasvoi.
- `simulaattori/css/sim.css`. Tyylit uusille elementeille sekä yksi korjaus: `.sheet-box` sai `max-height: 100%` ja `overflow-y: auto`. Uusi valikkonappi kasvatti valikon korkeutta, ja iPhonen (WebKit) pienessä näkymässä valikon ylin nappi (Keskeytä ja näytä purku) jäi näytön yläreunan ulkopuolelle, jolloin vanha `mobiili_pw.py` ei voinut napauttaa sitä. Korjauksen jälkeen valikko vieritettävä.
- `simulaattori/testit/google3d_test.js` (Node, kameralaskenta) ja `simulaattori/testit/google3d_pw.py` (Playwright).
- `liike.js`, `plotteri.js`, `tutka.js`, `maasto.js`, `runko.js`, merkit ja laiturit eivät muuttuneet (md5 tarkistettu).

Toimintatapa:

- Valikosta Ulkonäkymä: oma / Google 3D (testi). Valinta avaa `Map3DElement`in `#v3`-ruutuun oman three.js-kankaan päälle. Oma kangas piilotetaan (`visibility: hidden`), ei tuhota. Valinnan voi tehdä vain ajon aikana. Takaisin pääsee valikosta tai kartan päällä olevasta Oma näkymä -napista. Uusi ajo ja purku palauttavat oman näkymän.
- Kamera kopioi oman näkymän: sijainti aluksen kääntöpisteestä silmäpisteeseen (1,1 m eteen, 0,75 m vasemmalle, kuten `nakyma.js`:ssä), suunta aluksen tosisuunta plus katseen kääntö, vaakasuoraan katsova kallistus (tilt 90°) ja pystykuvakulma suoraan oman kameran arvosta. Päivitys tapahtuu joka kuvalla, enintään noin 30 kertaa sekunnissa.
- Kompassikaista, katseen napit, vetäminen ja kiikari toimivat kuten omassa näkymässä. Kiikarin kuvakulma 7° tuottaisi alle 5° pystykulman, ja Googlen alaraja on 5°, joten kiikarissa pystykulma rajataan 5 asteeseen.
- Karttaelementti on `pointer-events: none`, jolloin veto ja napautus menevät `#v3`-ruudun omille käsittelijöille.
- Oma vene ei ole Google-näkymässä. Plotteri, tutka ja komennot ovat ennallaan.

Silmäpisteen korkeus: tehtävänanto mainitsi silmäkorkeudeksi 3,5 m, mutta arvo 3,50 m on `nakyma.js`:ssä mitattu köliviivasta. Vedenpinnasta silmä on seisten 3,50 m − 0,78 m = 2,72 m ja istuen 3,45 m − 0,78 m = 2,67 m. Käytin vedenpinnasta mitattuja arvoja, jotta Google-näkymä on samassa korkeudessa kuin oma näkymä. Kameran korkeus on 95,5 m + 2,72 m = 98,22 m.

Korkeuden vertailutaso: Googlen ohje sanoo, että ABSOLUTE-korkeus mitataan keskimerenpinnasta EGM96-mallin mukaan. Suomen N2000 poikkeaa siitä alle noin metrillä (arvio, ei varmennettu), joten muunnosta ei tehdä. Jos kamera osuu käytännössä veden alle tai yläpuolelle, korjaus on selaimen muistissa avaimella `sim.googleAltOffset` (metriä, oletus 0). Tämä on piilotettu asetus eikä näy käyttöliittymässä.

Keskipisteen etäisyys (range) on 25 m. Vaakasuoraan katsovan kameran keskipiste on silmästä katseen suuntaan range metrin päässä samalla korkeudella, ja kamera on silloin täsmälleen silmäpisteessä.

Avain ja virheet:

- Aloitusnäytössä on kenttä Google Maps -avain (testi) ja ohje Näin saat avaimen. Avain tallentuu `localStorage`-avaimeen `sim.googleKey` (try/catch-suojattuna) eikä siirry osoitteeseen, komentolokiin, konsoliin tai palvelimelle. Playwright-testi tarkistaa nämä.
- Ilman avainta valikon valinta avaa ohjeruudun ja pysyy omassa näkymässä. Ohjeruudussa voi syöttää avaimen kesken ajon (Tallenna ja avaa).
- Lataus epäonnistuu: kirjasto ei lataudu, Google hylkää avaimen (`gm_authFailure`), `importLibrary` hylätään tai kartta antaa `gmp-error`-virheen. Näkymä palaa omaan näkymään ja ohjeruutu kertoo syyn. Jos kartta ei vakiinnu 25 sekunnissa, näytetään vain huomautus tilakilvessä, koska tämän voi aiheuttaa myös hidas verkko.
- Googlen kirjastoa ei upoteta tiedostoon. `build.py` upottaa vain `google3d.js`:n, ja Googlen kirjasto ladataan vasta, kun avain on annettu ja Google 3D valitaan.

Lisenssi: `google3d.js` on kirjoitettu itse. Vertailusimulaattorista (MPL-2.0) otettiin vain periaatteet (lataustapa, kameran parametrit, virhekäsittely), eikä koodia kopioitu. Tiedoston otsikossa mainitaan lähde, ja tiedosto pysyy projektin omassa lisenssissä. `THIRD_PARTY`-merkintää ei tarvita.

## 4. Tuulimalli: kuvaus ja siirtosuunnitelma (ei toteutettu)

### 4.1 Vertailusimulaattorin tuulimalli

Lähteet: `src/maritime_simulator/simulation/environment.py` ja `dynamics.py` sekä alusprofiilit tiedostossa `ui/simulation.py`.

- Todellinen tuuli annetaan suuntana, josta tuulee (`wind_from_deg`), ja nopeutena solmuina. Näennäinen tuuli (apparent wind) lasketaan vähentämällä todellisesta tuulesta aluksen maavektori (COG ja SOG). Tulos on suhteellinen tuulensuunta keulasta ja suhteellinen nopeus. Näennäinen tuuli on vain näytettävä suure eikä vaikuta liikkeeseen.
- Vaikutus liikkeeseen on kinemaattinen eikä voimamalli. Tuulen suunta muunnetaan suunnaksi, johon tuuli puhaltaa, ja suhteellinen kulma aluksen keulasuuntaan otetaan väliltä −180 ... 180°.
- Vaimennus nopeuden mukaan: `damping = 1 / (1 + STW / (0,45 x enimmäisnopeus))`, rajattuna alhaalta profiilin lattiaan (`wind_damping_floor` 0,26 ... 0,48) ja ylhäältä arvoon 1. Nopeus vaimentaa tuulen vaikutuksen arvoon noin puolet, kun alus kulkee 0,45-kertaisella enimmäisnopeudellaan.
- Sivuttaisnopeus (sorto) solmuina: tuulen nopeus x `windage` x `wind_lateral_gain` x sin(suhteellinen kulma) x vaimennus. Pitkittäinen muutos: tuulen nopeus x `windage` x `wind_forward_gain` x cos(suhteellinen kulma) x vaimennus. Profiilien arvot ovat `windage` 0,010 ... 0,036, sivuttaisvahvistus 1,30 ... 2,20 ja pitkittäisvahvistus 0,46 ... 0,66. Sorto paikallaan on siis noin 1,6 ... 7,9 % tuulen nopeudesta.
- Vaikutus maavektoriin: pitkittäinen komponentti lisätään veden suhteen kulkevaan nopeuteen (STW), sivuttainen lisätään kääntymisestä aiheutuvaan sivuttaisliikkeeseen, ja virta lisätään vektorina. Näistä lasketaan COG ja SOG, joten COG ja keulasuunta (HDG) eroavat sorron verran.
- Kääntömomenttia ei ole. Tuuli ei kierrä alusta, eikä massaa tai pinta-aloja käytetä. Tuulen vaikutus on aina lineaarinen tuulen nopeuteen nähden.

### 4.2 Siirtosuunnitelma Repan liikemalliin

Nykytila `liike.js`:ssä: sijainti etenee vain keulasuunnassa (`s.x += sin(hm) * ds`), joten COG on aina sama kuin HDG (peruutuksessa 180° eri). Sivuttaisnopeutta ei ole. `sim.js`:n kommentti `cogOf` odottaa tuulen erottavan COG:n ja HDG:n. `nakyma.js` sisältää jo tuuliasetuksen (`windFromDeg` 225, `windSpeed` 3 m/s sekä `setWind` ja `getWind`), jonka vesi lukee, joten tuuli pidetään yhtenä arvona lukemalla se sieltä.

Ehdotettu rakenne:

1. Tilaan lisätään sivuttaisnopeus `vs` (m/s, positiivinen oikealle), ja sijainti päivitetään summana keulasuuntaisesta ja sivuttaisesta nopeudesta. `halt` nollaa myös `vs`:n. COG lasketaan nopeusvektorin suunnasta, ja plotterille annettava nopeus on SOG (vektorin pituus).
2. Voimamalli, jossa on kolme osaa. Näennäinen tuuli saadaan vähentämällä aluksen nopeus todellisesta tuulesta. Tuulen voima on `0,5 x ilman tiheys x Cx x A x näennäinen komponentti x näennäisen tuulen nopeus`, missä sivuprofiili on noin 25 m², keulaprofiili noin 12 m², ilman tiheys 1,225 kg/m³. Sivuttaisliike hidastuu veden vastukseen, jossa on neliöllinen osa (`0,5 x veden tiheys x Cd x sivuvastuksen ala`, ala noin 12,25 m x 0,9 m) ja nopeuteen verrannollinen nostovoimaosa, joka kasvaa aluksen vauhdin mukana. Näin vaimennus nopeuden mukaan syntyy fysikaalisesti vertailumallin tapaan (vertailumallin kaava on `1 / (1 + v / vmax-osuus)`).
3. Kääntömomentti on sivuvoima kertaa varsi. Oletus: tuulen vaikutuskeskus on veden sivuvastuksen keskiön edessä (ohjaamo ja keula korkealla), joten paikallaan keula kääntyy tuulesta poispäin (keula putoaa myötätuuleen). Vauhdin kasvaessa vesisuihkujen ja rungon suuntavakaus voittaa, ja momentin vaikutus pienenee nopeuden mukana. Perustelu on kirjattava työlokiin toteutuksen yhteydessä. Momentti lisätään kääntymisnopeuden tavoitteeseen (`wTarget`), jolloin ruorimiehen P-säädin korjaa sitä ruorilla.
4. Tyyni on identtinen: kun tuulen nopeus on 0, funktio palaa heti. Pitkittäiseen voimaan lisätään vain ero tuulettomaan tilanteeseen (`F(näennäinen) − F(oma nopeus)`), koska nykyinen vastuskäyrä sisältää jo ilmanvastuksen tyynellä.
5. Käyttöliittymä: aloitusnäytön asetukset tuulen suunnalle ja nopeudelle (oletus 225°, 3 m/s kuten `nakyma.js`:ssä), "Nyt"-rivillä pieni teksti (esim. "Tuuli 240° 3 m/s, suht. 020° 12 m/s"), purun yhteenvedossa tuulen asetus.

Alustavat luvut tehtyä siirtoa varten (laskettu tämän vaiheen aikana nykyisellä `liike.js`:llä, ei toteutettu):

| Tilanne | Arvo | Huomio |
| --- | --- | --- |
| Sorto paikallaan, sivutuuli 10 m/s, Cy = 1,0, sivuvastus Cd = 1,2 | 0,92 kn pysyvässä tilassa | Sopii tehtävän väliin 0,8–1,5 kn. Tasaantumisaika noin 4–5 s, joten 60 s riittää. |
| Sorto 20 kn ajossa, sivutuuli 10 m/s, nostovoimakerroin 800 ... 2 000 | 1,25° ... 0,57° | Alittaa rajan 3° selvästi. |
| Vastatuuli 10 m/s, 20 kn ja sama vipu (0,52), Cx = 0,8 | nopeus putoaa 20 → 10,6 kn | Nykyinen vastuskäyrä on liu'un yläpuolella tasainen (noin 380 N/kn), joten fysikaalinen Cx pudottaisi veneen liukukynnyksen alle. |
| Sama, Cx = 0,4 | 18,2 kn (−1,8 kn) | Ei alita tavoitetta. |
| Sama, Cx = 0,2 | 19,1 kn (−0,9 kn) | Täyttää tavoitteen "alle 1 kn". Myötätuulessa nopeus on 20,3 kn. |

Johtopäätös: tavoite "vastatuuli alle 1 kn" edellyttää tehollista keulakerrointa noin 0,2 eikä aidon pinnan 0,8:aa. Tämä on kalibrointivalinta, jonka voi perustella suoja- ja virtaviivaisuusvaikutuksella tai nykyisen vastuskäyrän tasaisuudella. Se on kirjattava toteutuksessa. Muita huomioita siirtoon:

- Paikallaan oleva alus ajautuu satamarakenteita vasten, ja `tormays.js` laskisi kosketuksen joka askeleella. Toteutuksessa tarvitaan sama ratkaisu kuin muissa pysäytystiloissa, esimerkiksi hiljainen kosketus alle 0,3 kn nopeudella samaan esteeseen.
- Vertailulaskenta on tehty `liike.js`:n funktioilla `resistance`, `thrust` ja `leverForSpeed`.

## 5. Hyväksymiskriteerit

Kriteeri 1 (selvitysraportti lukuineen ja lähteineen): kohdat 1 ja 2 tässä raportissa. Hinta ja kattavuus on annettu lukuina sekä epävarmuudet merkitty.

Kriteeri 2 (Google-näkymä):

- Ilman avainta valinta näyttää ohjeen ja pysyy omassa näkymässä: Playwright `testit/google3d_pw.py` läpi kolmella laitteella, 43 tarkistusta ja 0 virhettä kullakin (Chromium 1440 x 900, Pixel 7 Chromium ja iPhone 14 WebKit, lokit `shots/logs3m/g3d_*.log`). Testi kattaa avainkentän ja ohjeen (3 riviä, korkeus 48 px), valinnan ilman avainta (ohje auki, oma näkymä näkyvissä, Googlea ei pyydetä), latauksen epäonnistumisen (palaa omaan näkymään ja kertoo syyn), korvaavan Google-kirjaston (heading, tilt 90°, korkeus 98,22 m, range 25 m, fov = oman näkymän pystykulma, katse 60° vasemmalle −60,0°, kiikari, päivitys joka kuvalla), `gmp-error`-paluun, ettei avain päädy osoitteeseen, komentolokiin eikä konsoliin, ja purun.
- Kameran laskenta, `testit/google3d_test.js`: 107 riviä, kaikki tarkistukset läpi. Tarkistetaan neljässä paikassa ja suunnassa, että keskipisteen lat ja lon täsmäävät riippumattomalla ellipsoidikaavalla 0,00001° sisällä, korkeus 0,1 m sisällä (98,22 m seisten, 98,17 m istuen), heading 0,01° sisällä ja tilt 90°. Lisäksi silmäpisteestä keskipisteeseen mitattu etäisyys on 25 m ± 0,1 m ja suunta ± 0,05°.
- Avaimen luontiohje on aloitusnäytön ohjeessa ja alla kohdassa 6.

Kriteeri 3 (tuulimalli): peruttu tilaajan muutoksella klo 08.44.

Kriteeri 4 (vanhat testit ja rakennus):

- `mobiili_pw.py`: Chromium 44/0 ja WebKit 44/0 (korjauksen `.sheet-box` jälkeen). Ensimmäisellä ajolla WebKit kaatui valikon ylimmän napin tavoittamattomuuteen (korjattu, katso yllä) ja Chromium antoi yhden virheen (pitkä painallus +20 eikä +10, aikariippuvainen testi, koska kone oli kuormitettu. Uusinnassa 0 virhettä).
- `peruutus_pw.py` läpi (Kaikki läpi), `tormays_pw.py` läpi (Kaikki läpi), `kasky_pw.py desktop` 11/0, `katse_pw.py desktop` 5/0, `kiikari3g_pw.py desktop` 26/0, `kayttoliittyma_3h_pw.py 1440x900` 18/0. Lokit hakemistossa `shots/logs3m/`.
- Node-testit: `liike_test.js`, `harjoitus_test.js`, `peruutus_test.js`, `sillat3d_test.js` ja uusi `google3d_test.js` läpi. `mvt_test.js` tarvitsee erillisen palvelimen portissa 8140, jota ei ole käynnissä, ja `mvt.js` ei muuttunut.
- `build.py` ajettu: `simulaattori.html` (repon juuri) 1 411 934 tavua, `dist/Reittikartta.html` 805 585 tavua. Googlen kirjastoa ei upoteta, vain `google3d.js`. `index.html` (md5 edff5aed...), `lahdekoodi/index.html` ja `dist/Reittikartta.html` ovat muuttumattomat.
- Muuttumattomat (md5): `liike.js`, `plotteri.js`, `tutka.js`, `maasto.js`, `runko.js`, `merkit.js`, `merkit3d.js`, `laiturit3d.js` ja muut aiemmin muuttumattomat.

## 6. Avaimen luontiohje

1. Google Cloud -konsolissa (console.cloud.google.com) luo projekti, ota laskutus käyttöön ja ota käyttöön Maps JavaScript API. Map Tiles API:ta ei tarvita, koska `Map3DElement` käyttää vain Maps JavaScript API:a (tehtävänannossa mainittu Map Tiles API tarvitaan vain Cesium-reitillä, joka ei toimi ETA-laskutuksella).
2. Luo API-avain kohdassa APIs & Services, Credentials, ja rajaa se HTTP-viittaajaan `*.vercel.app/*`.
3. Liitä avain aloitusnäytön kenttään Google Maps -avain (testi) tai ajon aikana ohjeruutuun. Avain tallentuu vain tämän selaimen muistiin.

## 7. Poikkeamat ja avoimet kohdat

- Tuulimallin toteutus jätettiin pois tilaajan muutoksen mukaan.
- Silmäkorkeus 2,72 m (ei 3,5 m) ja Map Tiles API:n jättäminen pois avaimen ohjeesta on perusteltu edellä.
- Googlen palvelimet eivät ole tästä ympäristöstä saavutettavissa. Playwright-testit käyttävät Google-kirjaston korvaajaa, joka antaa `Map3DElement`in liittymän (konstruktori, ominaisuudet, tapahtumat). Se todistaa kytkennän, ei todellista kuvaa. Todellinen käyttäytyminen (kameran korkeus, `tilt` 90°, `maxTilt` ja kokoon sovitettu attribuutio) varmistuu vasta käyttäjän testissä oikealla avaimella.
- Ei varmennettu: tilt 90° voi olla `Map3DElement`in rajoittama (reaalimaailman kamera ei välttämättä salli täysin vaakasuoraa). Jos kuva on kallistunut alaspäin, arvo on muutettava `SETTINGS.tiltDeg`-asetuksesta (esimerkiksi 88°).
- Ei varmennettu: `Map3DElement`in kattavuus Tampereella ja toiminta ETA-laskutuksella (Google Earthin kattavuus on varmennettu käyttäjän kuvasta) sekä Maps JavaScript API:n 3D-kartan tarkat käyttöehdot.

## 8. Lähteet (luettu 27.10.2026)

- Google Maps Platform pricing list, developers.google.com/maps/billing-and-pricing/pricing (päivitetty 23.10.2026).
- SKU details, developers.google.com/maps/billing-and-pricing/sku-details.
- Maps JavaScript API usage and billing, developers.google.com/maps/documentation/javascript/usage-and-billing (23.10.2026).
- Map3DElement-luokka, developers.google.com/maps/documentation/javascript/reference/3d-map.
- Altitude modes, developers.google.com/maps/documentation/javascript/3d/altitude-modes.
- 3D Maps coverage, developers.google.com/maps/documentation/javascript/3d/coverage (21.10.2026).
- Photorealistic 3D Tiles overview ja Map Tiles API Policies, developers.google.com/maps/documentation/tile/3d-tiles ja .../tile/policies.
- Map Tiles API adjustments for EEA customers, developers.google.com/maps/comms/eea/map-tiles (23.10.2026), EEA FAQ ja Service Specific Terms (EEA, muokattu 10.6.2026).
- Maps API key -ohje, developers.google.com/maps/documentation/javascript/get-api-key.
- maritime-ship-simulator (MPL-2.0), kloonattu 27.10.2026.
