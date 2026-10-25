# Raportti, vaihe 3b: merimerkkimoduulin liittäminen ja näkymän viimeistely

Päiväys 25.10.2026. Työ tehty hakemistossa `/home/claude/reittikartta-sim/`. Liikemalliin, plotteriin, komentoihin, harjoitukseen ja purkuun ei koskettu.

## 1. Tulokset hyväksymiskriteereittäin

1. Kriteeri 1 (suorituskyky, Chromium Pixel 7 -profiili, SwiftShader, 30 kn automaattiohjauksella Mustalahden edustalla). Kuvavälin mediaani on 50 ms, p95 100 ms, kolmioita enintään 67 600 ja piirtokutsuja 53. Yhdeksästä ajosta (seitsemän lähdesivulla ja kaksi yhden tiedoston `simulaattori.html`:llä) kahdeksassa mediaani oli 50,0 ms ja yhdessä 66,6 ms. Mediaani asettuu 16,7 ms:n ruutuvälin kerrannaisiin, joten raja 60 ms ylittyy vain, jos kone on kuormitettu. Tiheimmässä metsärannassa (kuva 3b_5) kolmioita oli noin 110 000, joten raja 300 000 jää kaukana. Verkkosiirto 1,1 Mt simulaatiominuutissa.
2. Kriteeri 2 (paikat). Kiinteiden turvalaitteiden paikkavirhe 0,03 ... 0,04 m. Maaston korkeusero paketin arvoon enintään 0,36 m (raja 2 m). Näsinneulan huippu 168 m ja piippujen suunnat tavoitteissa.
3. Kriteeri 7 (mobiili). Chromium Pixel 7 ja WebKit iPhone 14: 42 tarkistusta, 0 virhettä sekä lähdesivulla että yhden tiedoston `simulaattori.html`:llä. Yhden WebKit-ajon yksi virhe oli verkkoyhteyden katkeaminen (palvelin katkaisi yhteyden), ja uusinta meni läpi.
4. Kaikki 341 turvalaitetta piirtyvät moduulin malleilla 22 piirtokutsulla, varamalleja 0 ja moduulin loki tyhjä (`testit/merkit_kaikki_pw.py`, laitteet ladattu koko Näsijärven alueelta). Kolmioita on tässä kaikki kerralla -testissä 136 000, koska 67 kummelia on piirretty lähimallilla. Ajossa lähimalli on käytössä vain alle 150 m:n päässä.
5. Kuvat ovat hakemistossa `shots/` (luku 8).
6. `build.py` tuottaa `simulaattori.html`:n (1,3 Mt) ja päivittää repon juuren `simulaattori.html`:n. Repon juuren `index.html` ja `lahdekoodi/dist/Reittikartta.html` ovat muuttumattomia (md5 edff5aed0e4cbb6603e33ef7c858dcce).

## 2. Merkit (tehtävä 1)

1. `js/merimerkit3d.js` on kopio moduulista, ja `js/merkit3d.js` on kirjoitettu käyttämään `luoInstanssit`-funktiota. Samanlaiset merkit piirtyvät yhdellä kutsulla. Alukselta 3,5 km:n sisällä olevat laitteet piirretään ja ryhmä uusitaan 400 m:n välein.
2. Pienin näkyvä leveys säilyy: moduulin verteksisäädin pitää ohuet osat noin 3,5 kuvapisteen levyisinä, ja `nakyma.js` päivittää kuvapisteen koon joka kuvassa.
3. Kiinteät merkit (loistot, kummelit, linjamerkit) seisovat maastomallin maanpinnalla. Valon korkeus on mitattu vedenpinnasta, joten loiston tornin korkeudesta vähennetään maanpinnan korkeus.
4. Linjataulun suunta tulee taululinjan päätepisteestä (lähin päätepiste 800 m:n sisällä, koska alempi taulu on jopa 390 m ylemmän edessä). Vesiliikennemerkkiä ei ole aineistossa suunnattu, joten se käännetään kohti alusta (oletus).
5. `merkit.js` säilyttää vesiliikennemerkin rajoitusarvon (`arvo`), ja `signs.js` on mukana kilpikuvakkeita varten.
6. Loistojen torni-, valokorkeus- ja sektoritiedot kulkevat vaihetta 4 varten funktiossa `valot()` ja ryhmän kentässä `userData.valot`.

## 3. Kummeli (tehtävä 2)

1. Malli on valkoiseksi maalattu kivikasa, jossa on 130 pientä kiveä (läpimitta 0,2 ... 0,35 m) tiiviinä kartiona, tummempi sisäkartio kivien välissä ja yläosassa heijastinlevyt tolpalla. Siemen on 1906 jokaiselle kummelille, joten näkymä toistuu. Pohja 2,9 m, korkeus 2,35 m heijastimineen, 1 626 kolmiota.
2. Kauempaa (yli 150 m, hystereesi 20 m) piirretään yksinkertainen valkoinen kartio samalla siluetilla (72 kolmiota). Lähi- ja kaukomalli ovat omat instanssiryhmänsä, ja taso vaihdetaan kuvassa, joten uudelleenrakennusta ei tarvita.
3. Lähteet (haettu 25.10.2026): Wikimedia Commons -luokka Sea cairns in Finland ja sen peilikopio (download.osmand.net/wiki/Category:Sea_cairns): kummeli on perinteisesti valkoiseksi maalatun kivikasan muotoinen merimerkki, uudemmat voivat olla betonirenkaita tai valkoisia lautoja. IALA:n sanakirja (iala.int, Cairn): kasaan kasattuja kiviä, käytetään päivämerkkinä. Traficomin määräykset (TM 2/2007, TM 25-26/2008) mainitsevat kummelit vain lajimuutosten yhteydessä.
4. Mitat ja heijastimen koko ovat oletuksia (määrittelyn mukaan pohja 2 ... 3 m ja korkeus 1,5 ... 2,5 m), koska lähteissä ei ollut mittoja eikä heijastimen kuvausta. Kivien koko perustuu tilaajan kuvapalautteeseen.

## 4. Siilinkari (tehtävä 3)

1. Malli: valkoinen kapeneva torni (säde 0,85 m alhaalla ja 0,6 m ylhäällä), valon korkeus 6,5 m, tumma lyhty ja kupu, aurinkopaneeli tornin kyljessä. Se seisoo vaaleana kallioluotona.
2. Lähteet (haettu 25.10.2026): Yle 31.12.2025 (loistokoppi, led-valolaite, aurinkopaneeli majakan kyljessä, rakennettu 1906), Yle 8.8.2016 (valo syttyi 8.8.1906, led-lamppu, kunnostettu), Pixeo (pixeoapp.com, Siilinkari lighthouse Lake Näsijärvi: pieni valkoinen majakka matalalla paljaalla kallioluodolla), Flickr milko_hakimsan 6.3.2017 (torni 6,5 m, sektoriloistotorni, 1906), kirjastot.fi 22.2.2021 (sektoriloisto muutettu apuloistoksi syksyllä 2015, valkoinen vilkkuva valo, kantama 6 mpk), elamaajaelamyksia.blogspot.com 2012 (talvikuvia majakasta).
3. Kuvatiedostoja ei saatu auki (WebFetch antoi palvelinvirheen ja curl-lataus estyi välityspalvelimessa, 403), joten malli perustuu tekstikuvauksiin.
4. Lähteistä tulevat tiedot: muoto (valkoinen torni), valon korkeus 6,5 m, valkoinen väri, led-valo ja aurinkopaneeli. Arvioituja mittoja ovat rungon säteet, tornin kapeneminen, lyhdyn ja kuvun koko, paneelin koko ja paikka sekä tumman ikkunan paikka.

## 5. Puusto (tehtävä 4)

1. Latvuslaatikot on korvattu instansseina piirretyillä puilla: havupuu (kaksi kartiota), lehtipuu (pyöreä) ja pensas (matala kupu). Alle 600 m:n päässä olevat z16-ruudut piirtävät yksittäiset puut. Kauempana latvuskerros on yhdistetty maastoverkkoon, ja puiden määrä harvenee etäisyyden mukaan (220, 380 ja 520 m). Kolmiobudjetti on 110 000 puuinstanssin kolmiota, eikä se ole ylittynyt mittauksissa.
2. Tiheys seuraa latvuspeittoa (vähintään 30 %), korkeus on ruudun keskipituus ±20 % ja sijoittelu on siemenellä (solmun koordinaatit) toistettava. Puita ei ole 14 m:n säteellä kiinteistä turvalaitteista eikä 8 m:n säteellä pensaitakaan, ja linjamerkkien edestä on 20 m leveä raivattu käytävä.
3. Tilaajan lisäys keskipituudesta: alle 5 m on tiheää pensaikkoa (pyöreitä 1 ... 3 m:n muotoja), 5 ... 8 m pieniä puita ja yli 8 m puita.
4. Tilaajan myöhempi päätös: kaikki alle 1 ha:n saaret piirretään korkeintaan pensaikkona keskipituudesta riippumatta, koska 16 m:n ruudut sekoittuvat viereisiin saariin ja luodon arvo ei ole luotettava. Poikkeus tulee vasta, jos toinen lähde (laserkeilaus tai maastotietokanta) osoittaa luodolla puustoa, eikä sellaista ole käytössä. Aiemmin lisätty turvalaitteeseen sidottu erikoissääntö on poistettu tarpeettomana, ja 10 m:n korkeusraja ei enää tule käyttöön saarilla, koska ne ovat pensaikkoa.
5. Siilinkarin saari on 590 ... 760 m² (pinta-ala riippuu ruudun zoomista). Puustoaineiston keskipituus saaren latvusruuduissa on 18,7 m z16-ruudussa (5 latvusruutua) ja 15,8 m z15-ruudussa (1 latvusruutu), suurimmillaan noin 24 m. Arvo on tulkittu epäluotettavaksi: 16 m:n ruutu sekoittaa saaren viereisen mantereen tai saaren puiden korkeuteen, ja saaressa on lähteiden mukaan paljasta kalliota. Siksi saari piirretään pensaikkona ja tornin 6,5 m:n valo näkyy pensaiden yläpuolella.

## 6. Rannat (tehtävä 5)

1. Yhdistetty latvuskerros loivenee rantaviivalla: kerroin 0,3, 0,65 ja 1,0 yhden, kahden ja kolmen ruudun päässä vedestä.
2. Rantaviivan jyrkkyys mitattiin viimeisen maaruudun ja vesiruudun välisenä nousuna ruudun leveyteen suhteutettuna (nousu sisältää veden 1,5 m:n pohjasyvyyden). Neljässä paikassa keskiarvo on 0,12 ... 0,23 taperin kanssa ja 0,19 ... 0,49 ilman sitä (metsäranta 0,20 ja 0,41, Siilinkari 0,12 ja 0,19). Suurin arvo on 0,5 ... 1,2 taperin kanssa ja 1,2 ... 3,0 ilman sitä. Jäljelle jäävä suurin arvo johtuu maaston omasta rantapenkereestä, jota ei ole eritelty.
3. Matalat luodot (korkein kohta alle 3 m vedenpinnasta) maalataan vaaleana kalliona (176, 176, 170) ja pensaiden alla vaihtelevan sävyisenä kalliomaana, eikä nurmena. Ranta-alueen väri maalataan paljaan maan korkeudella.

## 7. Oletukset ja rajoitukset

1. Maaston verkon tarkkuutta on vähennetty suorituskyvyn takia (ruutuja sivulla z13 22, z14 24, z15 24 ja z16 28). Maaston korkeusero pysyy alle 0,4 m.
2. Maamerkkien (rakennusten) harmaat laatikot näkyvät edelleen kuvissa kummelin ja luotojen takana. Ne kuuluvat vaiheen 3 maamerkkimalliin eikä niitä muutettu.
3. Suorituskykyä oikealla näytönohjaimella ei mitattu, koska mittaus tehtiin SwiftShaderilla.

## 8. Kuvat (`lahdekoodi/simulaattori/shots/`)

1. `3b_1_siilinkari_ohitus_50m.png`
2. `3b_2_siilinkari_300m.png`
3. `3b_3_kummeli_100m.png` (lähimalli), `3b_3b_kummeli_25m.png`, `3b_3c_kummeli_10m.png` ja `3b_3d_kummeli_250m_kartio.png` (kaukomalli)
4. `3b_4_linjataulut_300m.png`
5. `3b_5_metsainen_ranta_200m.png`
6. `3b_6_naistenlahti.png`

Kuvat on otettu apuskriptillä `testit/kuva3b_pw.py` (vapaa kamera, SwiftShader).
