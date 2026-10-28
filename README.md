# Reittikartta

Reittikartta on selainpohjainen reittisuunnittelun työkalu suomalaisella merikartalla. Sen tarkoitus on helpottaa paikkojen löytämistä kartalta ja reitin laatimista tehtävälle.

- **Paikan löytäminen:** paikannimet, turvalaitteet, väylät, sulut ja sillat löytyvät nimellä, ja paikan voi antaa myös koordinaatteina. Samannimiset paikat näytetään kartalla numeroituina etäisyyksineen, jotta oikean paikan tunnistaa.
- **Reitti tehtävälle:** Reititä tehtävälle laskee reitin virallista väylää pitkin omasta sijainnista, asemalta tai muusta paikasta tehtäväpaikalle niin, että aluksen kulkusyvyys täyttyy koko matkalla. Reitti avautuu tarkistettavaksi ja muokattavaksi.

Muut toiminnot mukailevat Meripelastusseuran SARNav-karttaohjelmaa: reittiluonnos, suuntanuotit, sivuutus- ja käännösetäisyydet, hyväksyntä aluskohtaiseen reittikirjastoon, omat merkit ja tehtäväpaikat. Sovellus ei ole Meripelastusseuran virallinen ohjelma.

**Verkkoversio:** https://reittikartta-6qn2.vercel.app

**Ei navigointikäyttöön.** Kartta-aineistot ovat avointa dataa, jota ei ole tarkoitettu navigointiin. Traficomin määritelmän mukaan myös reitin suunnittelu on navigointikäyttöä. Ajettavat reitit tarkistetaan ja hyväksytään SARNavissa virallista ENC-karttaa vasten.

## Suhde SARNaviin

Reittikartta ei ole SARNavin kanssa kilpaileva hanke, eikä sen tarkoituksena ole korvata SARNavia. SARNav on Meripelastusseuran virallinen karttaohjelma, ja ajettavat reitit tarkistetaan ja hyväksytään siinä.

Reittikartta on reittien luonnosteluun tarkoitettu apuväline. Valmiit reitit siirretään SARNaviin GPX-tiedostona. Sovelluksen toiminnot ja nimitykset mukailevat SARNavia, jotta siirtyminen sovelluksesta toiseen olisi luontevaa.

Sovellus ei sisällä SARNavin koodia eikä grafiikkaa. Se ei ole Meripelastusseuran tuote, eikä sitä ole tehty seuran toimeksiannosta.

## Ominaisuudet lyhyesti

- **Paikkahaku:** katuosoitteet ja kiinteistötunnukset (Näsijärven alue), paikannimet, turvalaitteet nimellä tai numerolla, väylät, sulut ja sillat, luotsipaikat, VTS-ilmoittautumispisteet, AIS-alukset, omat kohteet ja koordinaatit. Haku toimii samoin kaikilla karttapohjilla. Samannimiset paikat näytetään kartalla numeroituina, ja niille annetaan kunta sekä etäisyys meripeninkulmina ja suunta.
- **Reititys väylää pitkin:** reitti lasketaan automaattisesti lähtöpisteestä määränpäähän Väyläviraston navigointilinjoja pitkin, ja vain annetun kulkusyvyyden täyttävät väylät kelpaavat. Tehtävälle on oma reititys omasta sijainnista, asemalta tai muusta paikasta. Reitti avautuu muokkaustilaan tarkistettavaksi, ja kulkusyvyyttä voi muuttaa tarkastelun aikana.
- **Tehtäväpaikat ja asema:** tehtäväpaikka haetaan nimellä ja tarkistetaan kartalla ennen luomista. Aktiivisen tehtävän suuntima ja etäisyys näytetään asemalta.
- **Kolme karttapohjaa:** Traficomin rasterimerikartta, ENC-kartta perinteisin tai ECDIS-symbolein sekä vektorikartta, joka on terävä tasolle 20 asti. Rasterista ja ENC:stä siirrytään vektorikarttaan itsestään, kun zoomataan tasoa 17 lähemmäs.
- **Suomalaiset karttamerkit:** kivet, viitat, kummelit, linjamerkit ja loistot piirretään Traficomin merkkienselityksen mukaan. Valosektorit näkyvät värikaarina ENC-kartan mitoissa, ja ympäri näkyvät valot värirenkaana. Viitat voi värittää ECDISin tapaan.
- **Vesiliikennemerkit, sillat ja sulut:** vesiliikennemerkit piirretään vesiliikennelain mukaisina kilpinä, sillat alikulkukorkeuksineen ja sulut suurimman sallitun aluksen mittoineen.
- **Linjataulujen linjat** jatkuvat väylän päästä katkoviivana ENC:n tapaan, ja linjan tosisuunta on merkitty.
- **Reittisuunnittelu SARNavin tapaan:**
  - suuntanuotit ja käännösmerkit 2 ja 1 kaapelia ennen käännöstä
  - sivuutus- ja käännösetäisyydet
  - reittipisteiden kiinnitys väylän pisteisiin
  - hyväksyntä aluskohtaiseen reittikirjastoon
- **Syvä vesi:** vesialueet väritetään aluksen turvasyvyyden mukaan ECDISin turvakäyrän tapaan.
- **Oma sijainti:** laitteen sijainti, nopeus ja kulku. Puhelimessa sijainti käynnistyy sovelluksen avautuessa, kun käyttäjä sallii sen.
- **Työkalut:** harppi, suuntima, omat merkit, yönäyttö ja karttareunuksen minuuttiasteikko.
- **Laiturit ja aallonmurtajat** näkyvät vektorikartalla Maanmittauslaitoksen ja OpenStreetMapin aineistosta.
- **Maasto-tasot (Näsijärvi):** rakennukset, osoitteet, kiinteistörajat, maastotyyppi, varjostus ja tiet erillisestä aineistopaketista. Kaikki ovat oletuksena pois päältä.
- **AIS-alukset:** alusten sijainnit ja alustiedot Fintrafficin Digitraffic-rajapinnasta. Alukset näkyvät tyypin mukaan värjättyinä, pelastusalukset korostettuina, ja aluksen napautus avaa kortin, josta voi luoda tehtävän aluksen kohdalle. Alukset löytyvät myös hakukentästä nimellä, kutsutunnuksella tai MMSI-numerolla.
- **GPX:** reittien tuonti SARNavista ja vienti SARNaviin.
- **Puhelin ja tabletti:** kapeassa näytössä on oma asettelu ja kosketusohjaus.

## Käyttöönotto

Sovellusta käytetään verkko-osoitteesta https://reittikartta-6qn2.vercel.app. Asennuksia tai tunnuksia ei tarvita, ja sama osoite toimii tietokoneella, tabletissa ja puhelimessa. Kartat ja väylätiedot haetaan verkosta käytön aikana, joten laitteen pitää olla verkossa.

iPhonessa ja iPadissa sivu kannattaa lisätä Koti-valikkoon: Safarissa Jaa → Lisää Koti-valikkoon. Silloin sovellus aukeaa omana kuvakkeenaan ilman selaimen palkkeja, ja sen tallentamat tiedot säilyvät varmemmin (ks. Tallennus ja tietosuoja).

Ensimmäisellä käynnistyskerralla sovellus näyttää lyhyen esittelyn. Pikaohje on valikossa Ohje → Pikaohje, ja aineistojen lähteet ja käyttöehdot ovat kohdassa Ohje → Aineistot ja käyttöehdot.

Sovellus toimii myös yhtenä tiedostona ilman verkkopalvelinta. Repon juuren `index.html` on koko sovellus yhdessä tiedostossa, ja sen voi avata tietokoneen selaimessa tuplaklikkaamalla. Tiedostona avattuna Maanmittauslaitoksen aineistot (kivet, laiturit ja paikannimet) tarvitsevat oman maksuttoman API-avaimen, joka syötetään kohtaan Tiedosto → Asetukset. Myös oma sijainti voi jäädä toimimatta. iPhonen Safari ei aja HTML-tiedostoon kirjoitettua ohjelmaa, kun tiedosto avataan Tiedostot-sovelluksesta, joten iPhonessa käytetään verkkoversiota.

## Tallennus ja tietosuoja

Sovellus tallentaa selaimen muistiin seuraavat tiedot:
- reitit, omat merkit ja tehtävät, automaattisesti lasketun reitin osalta myös lähtöpaikan, määränpään ja kulkusyvyyden
- alukset, hyväksyjien nimet, aseman ja turvasyvyydet
- asetukset, kuten oletusnopeuden, oman Maanmittauslaitoksen API-avaimen ja Maastoaineiston osoitteen
- Näytä-valikon valinnat, karttapohjan ja viimeisimmän karttanäkymän
- OpenStreetMapista haetut laiturialueet 30 päivän välimuistiin

Kun sivu avataan uudelleen samalla laitteella ja samalla selaimella, kaikki on tallessa. Mitään ei tallenneta palvelimelle. Tästä seuraa muutama rajoitus:

- **Laitteet ja käyttäjät:** tiedot ovat laite- ja selainkohtaisia. Puhelimella tehdyt reitit eivät näy tietokoneella, eivätkä eri käyttäjät näe toistensa reittejä.
- **Safari:** Safari voi tyhjentää sivuston tallentamat tiedot, jos sivulla ei ole käyty noin seitsemään päivään. Koti-valikkoon lisätty sovellus ei ole tämän rajoituksen alainen.
- **Yksityinen selaus:** yksityisessä ikkunassa tiedot katoavat, kun ikkuna suljetaan.
- **Varmuuskopio:** reitit siirretään laitteelta toiselle ja varmistetaan varmuuskopiolla. Varmuuskopio tehdään valikosta Tiedosto → Tee varmuuskopio, ja sen voi palauttaa samasta valikosta myös toiselle laitteelle.

Oma sijainti näytetään vain käyttäjän omalla näytöllä, eikä sitä tallenneta eikä lähetetä minnekään. Karttatiilet ja aineistot haetaan suoraan Traficomin, Väyläviraston, Fintrafficin (AIS-alukset), OpenStreetMapin ja kartat.kapsi.fi:n palveluista. Fintrafficille ei lähetetä käyttäjää koskevia tietoja, eikä AIS-tietoja tallenneta selaimeen. Maasto-tasot sekä osoite- ja kiinteistötunnushaku hakevat Näsijärven aineistopaketin GitHub Pagesista (osoite on asetuksissa) vasta, kun jokin Maasto-taso kytketään päälle tai haetaan osoitetta tai tunnusta. Maanmittauslaitoksen aineistot haetaan verkkoversiossa sovelluksen omalla välityspalvelulla Vercelissä ja tiedostona avatussa sovelluksessa suoraan Maanmittauslaitokselta. Palvelut näkevät tavanomaisesti, miltä alueelta karttaa pyydetään. Verkkoversio laskee kävijämäärät ja sivulataukset Vercelin anonyymillä Web Analytics -laskurilla, joka ei käytä evästeitä eikä yksilöi käyttäjiä. Tiedostona avatussa sovelluksessa laskuria ei ladata.

## Karttapohjat

Karttapohja vaihdetaan kartan yläreunan painikkeilla Rasteri, ENC, ECDIS ja Vektori. Samat valinnat ovat valikossa Näytä ja näppäimissä R, E, Shift+E ja V. Valittu pohja on korostettu.

**Rasterikartta** on Traficomin skannattu paperimerikartta. Sen tarkin taso on 15, ja näytöllä yksi pikseli vastaa tasolla 15 noin 2,3:a metriä. Tasot 16–17 piirretään saman aineiston terävöitettynä suurennoksena, joten niissä ei ole lisää tarkkuutta. Kartta on terävimmillään, kun selaimen oma zoomaus on 100 %. Rasterissa näkyy paikoin karttalehtien rajaviivoja, jotka ovat Traficomin aineistossa sellaisenaan.

**ENC-kartta** tulee Traficomin S-57 WMS -palvelusta, joka piirtää ENC-aineiston kuvaksi pyydetyssä mittakaavassa. Se on terävä kaikilla tasoilla, ja väylät, turvalaitteet ja rantaviiva ovat ENC:n mukaisissa paikoissa. ENC kattaa rannikon ja osan sisävesistä, esimerkiksi Saimaan alueen. Näsijärvellä ENC-aineistoa ei ole. Missä aineistoa ei ole, sovellus näyttää rasterikartan ja kertoo siitä kartan oikeassa yläkulmassa.

**Vektorikartassa** vesialueet, syvyysvyöhykkeet, syvyyskäyrät, rantaviiva ja syvyysluvut piirretään Traficomin merikarttatietokannasta. Väylälinjat, väyläalueet ja turvalaitteet tulevat Väyläviraston aineistosta. Maapohjana on oletuksena OpenStreetMap, jonka päällä näytetään Maanmittauslaitoksen nimistörekisterin paikannimet. Maanmittauslaitoksen taustakartan voi valita tilalle valikosta Näytä. Vektorikartta kattaa myös Näsijärven, mutta siitä puuttuvat paperikartan nimistö ja erikoismerkinnät. Aineiston syvyysvälit ovat paikoin karkeita.

Rasteri- ja ENC-pohjaa näytetään tasolle 17 asti. Kun zoomataan lähemmäs, kartta vaihtuu itsestään vektorikarttaan, jota voi suurentaa tasolle 20 asti, eli näytön leveydellä noin sataan metriin. Vektori-painike näkyy silloin katkoviivoitettuna, ja uloszoomatessa palataan valittuun pohjaan. Suurennus ei tee aineistosta tarkempaa kuin se on.

## Karttamerkit, valot ja väylätiedot

Kivet, turvalaitteet ja valot piirretään Suomen merikarttojen merkeillä Traficomin virallisen merkkienselityksen mukaan:

- **Kivet:** vedenpäällinen kivi on ⊥, vedenrajassa oleva kivi + ja vedenalainen kivi ⊤. Kivikossa samoissa merkeissä on pisteet sivuilla.
- **Vesikivikot ja matalikot** rajataan mustalla pisteviivalla (vaarakäyrä).
- **Viitat** ovat mustia varsia, joiden alapäässä on asemaympyrä ja yläpäässä huippumerkki. Huippumerkki on vasemmassa sylinteri, oikeassa kartio, kardinaalimerkeissä kaksi kartiota, karimerkissä kaksi palloa, turvavesimerkissä pallo ja erikoismerkissä risti.
- **Kummeli, tunnusmajakka, linjamerkki, merimajakka ja tutkamajakka** ovat omilla merkeillään.

Merkkien selitys on myös sovelluksen pikaohjeessa.

Jokaisella loistolla, apuloistolla ja valaistulla viitalla on valon värinen pisara. Valkoinen valo on keltainen kuten merikartassa. Sektoriloistoilla näytetään valosektorit värikaarina, sektorirajat katkoviivoina ja loistorekisterin valotunnus, esimerkiksi VQ (3) 5 s. Ympäri näkyvä valo piirretään valon värisenä renkaana. Sektorien kulmat ovat loistoluettelon tapaan merelle päin katsottuina. Valosektorit piirretään ENC-kartan (S-52) mitoilla: sektorikaaren säde on näytöllä 20 mm ja sektorirajat ulottuvat 25 mm:iin zoomaustasosta riippumatta. Kauempaa ja kapealla näytöllä ne ovat hieman pienempiä.

Väyläviraston avoimesta rajapinnasta näytetään lisäksi seuraavat tiedot:
- vesiliikennemerkit vesiliikennelain mukaisina kilpinä
- sillat alikulkukorkeuksineen sekä sulut ja avattavat sillat
- väylien suunnat molempiin suuntiin ja kulkusyvyydet
- linjataulujen linjat tosisuuntineen
- nopeusrajoitusalueet
- muiden väylänpitäjien, kuten kaupunkien, väylät ja turvalaitteet

**Linjataulujen linjat** piirretään vektorikartalle ENC:n tapaan, ja muille pohjille ne tulevat väylälinjojen mukana. Ohut katkoviiva jatkuu väylän linjaosuuden päästä taulujen kautta, ja linjan tosisuunta, esimerkiksi 055,5°, on merkitty linjan ulommaiseen päähän. Aineisto on Väyläviraston taululinjat. Väylän suunta on navigointilinjan virallinen tosisuunta, kun se on saatavilla, ja muuten se lasketaan linjan geometriasta.

**Vesiliikennemerkit** piirretään vesiliikennelain (782/2019) 4 luvun mukaisina merkkikilpinä pienennettyinä. Kielto-, määräys-, rajoitus- ja varoitusmerkit ovat neliöitä, joissa on punaiset reunat ja valkoisella pohjalla musta kuvio, ja kieltomerkissä lisäksi punainen diagonaaliviiva. Tiedotusmerkit ovat sinisiä neliöitä, kaapeli- ja johtotaulut keltaisia suorakaiteita ja suuntamerkit punaisia ympyröitä. Rajoitusmerkeissä näkyy rajoituksen arvo, esimerkiksi nopeusrajoitus tai alikulkukorkeus. Samassa paikassa olevat merkit pinotaan tolpaksi lain järjestyksessä, jolloin esimerkiksi rajoitetun alikulkukorkeuden merkki on ilmajohtomerkin yläpuolella. Merkin napautus näyttää lajit, arvot ja lisäkilpien tekstit. Merkit näkyvät tasolta 13 ja kaapelitaulut tasolta 14. Tuntematon laji näytetään yleisenä merkkinä (ks. Tunnetut rajoitukset).

**Sillat ja sulut.** Sillat, joille Väyläviraston taitorakennerekisterissä on alittavan vesiväylän alikulkukorkeus (noin 280 siltaa), piirretään INT 1:n tapaan kahtena kannen reunaviivana, joiden päät taittuvat ulospäin, ja alikulkukorkeus näkyy sillan vieressä. Rekisteri antaa vain sillan keskipisteen, joten kansi suunnataan poikki lähimmän navigointilinjan. Sulut ja avattavat sillat tulevat Väyläviraston sulkukanava-aineistosta. Avattavan sillan kannessa on aukko, ja sulun merkissä ovat kanavan seinämät ja portit. Napautus näyttää suurimman sallitun aluksen mitat, sulun mitat, putouskorkeuden ja käyttötavan. Avattavan sillan kohdalla aineiston korkeus on suurin sallittu aluksen korkeus sillan ollessa avattuna, ei suljetun sillan alikulkukorkeutta, joten sitä ei merkitä karttaan. Jos sama avattava silta on myös taitorakennerekisterissä (esimerkiksi Muroleen kanavan kääntösilta), aineistot yhdistetään: silta piirretään kerran, ja rekisterin alikulkukorkeus näkyy suljetun sillan alikulkukorkeutena, esimerkiksi ↕ 1 m · avattava. Sulku näkyy tasolta 15 kammion ääriviivana. Siltojen ja sulkujen merkinnät sijoitetaan niin, etteivät ne mene toistensa päälle, ja ahtaassa paikassa osa merkinnöistä tulee näkyviin vasta lähemmäs zoomattaessa.

**Viitat ECDIS-värein.** Viitat ovat oletuksena paperikartan merkkienselityksen mukaisesti mustia. Valinta Näytä → Viitat ECDIS-värein värittää ne ECDISin (S-52, IALA A) tapaan: vasen punainen, oikea vihreä, kardinaalit keltamustina värijaksoin, karimerkki mustapunamustana, turvavesimerkki punavalkoisena ja erikoismerkki keltaisena.

Vektoripohjalla valosektorit, nopeusrajoitukset, vesiliikennemerkit sekä sillat ja sulut ovat oletuksena näkyvissä. Muilla pohjilla ne saa päälle valikosta Näytä.

Vektoripohjalle voi lisätä Maanmittauslaitoksen maastotietokannasta kivet, vesikivikot ja matalikot (Näytä → Kivet, karikot ja nimistö). Maastotietokannan kivet on kartoitettu maastokartoituksessa eikä merenmittauksessa, joten ne eivät ole navigointitarkkoja.

## Laiturit ja aallonmurtajat

Vektorikartalla laiturit ja aallonmurtajat piirretään veden päälle, koska maapohjan laiturit jäisivät vektorikartan vesialueen alle. Ne näkyvät tasolta 14 alkaen. Laituriviivat ja aallonmurtajat tulevat Maanmittauslaitoksen maastotietokannasta. OpenStreetMapista lisätään alueina kartoitetut laiturit, aallonmurtajat ja pengerrykset, kun OpenStreetMapin Overpass-palvelu vastaa. Samaa laituria ei piirretä kahdesti.

Overpass on usein ruuhkainen. Ensimmäinen haku uudelle alueelle voi kestää puolikin minuuttia, ja tilarivillä lukee silloin Ladataan laitureita. Haetut alueet tallennetaan selaimeen 30 päiväksi. Kelluvat laiturit voivat olla kausittaisia. Laiturit saa pois valikosta Näytä.

## Maasto-tasot (Näsijärvi)

Valikon Näytä ryhmä Maasto (Näsijärvi) sisältää kuusi valintaa, jotka ovat kaikki oletuksena pois päältä:

| Valinta | Näkyy | Sisältö |
|---|---|---|
| Rakennukset | zoomista 15 | rakennuspolygonit, asuinrakennus harmaanruskeana ja muut harmaana. Napautus näyttää käyttötarkoituksen, kerrosluokan (1–2 tai 3 tai useampi), osoitteen ja maanpinnan korkeuden. |
| Osoitteet | pisteenä zoomista 16, tekstinä zoomista 17 | rakennusten osoitteet |
| Kiinteistörajat | zoomista 16 | rajat ohuina viivoina. Napautus näyttää lähimmän kiinteistötunnuksen, kun tunnuspiste on enintään 30 m päässä. |
| Maastotyyppi | zoomista 10 | läpikuultavat värit: pelto keltainen, suo violetinharmaa, kallio vaaleanharmaa, taajama vaaleanpunainen, puisto vihreä |
| Varjostus | zoomista 10 | vinovalovarjostus Terrain-RGB-korkeustiilistä, laskettu selaimessa. Tason 14 yli käytetään tason 14 tiiliä suurennettuna. Korkeuskäyriä ei piirretä. |
| Tiet | zoomista 12, nimet zoomista 15 | tiet luokan mukaan, pääväylät paksummin |

Tasot piirretään maapohjan ja merikartan päälle mutta karttamerkkien ja reittien alle. Piirtojärjestys alhaalta ylös on maastotyyppi, varjostus, kiinteistörajat, tiet, rakennukset ja osoitteet. Maastotyyppi ja varjostus ovat läpikuultavia, jotta maapohja näkyy läpi.

Aineisto luetaan erillisestä paketista, jonka osoite on Tiedosto → Asetukset → Maastoaineiston osoite (oletus https://jvaahtikari.github.io/reittikartta-aineisto/). PMTiles-tiedostoja luetaan HTTP Range -pyynnöillä, joten selaimeen siirtyy vain näkyvän alueen tiilet, tyypillisesti alle megatavu näkymää kohden. Paketin kuvaus (`aineisto.json`) luetaan kerran, kun jokin taso kytketään päälle. Kun jokin taso on päällä ja kartta on Näsijärven aineiston alueen ulkopuolella, oikeaan yläkulmaan tulee huomautus Maastoaineisto kattaa vain Näsijärven, eikä paketin tiiliä pyydetä. Ilman verkkoyhteyttä tasot jäävät hiljaa tyhjiksi. Lähdemerkinnät luetaan paketin kuvauksesta, ja ne näkyvät kartan attribuutiossa tasojen ollessa päällä sekä kohdassa Ohje → Aineistot ja käyttöehdot.

Kirjastot: pmtiles 4.5.0 ja protomaps-leaflet 5.1.0 (molemmat BSD-3-Clause). protomaps-leaflet piirtää vektoritiilet canvasille, ja se valittiin Leaflet.VectorGridin sijaan, koska se toimi paketin testisivulla ja täytti suorituskykyrajat puhelinprofiililla (ks. `RAPORTTI_vaihe2.md`).

## AIS-alukset

Kartalla näkyvät alukset, jotka lähettävät AIS-sijaintia. Sijainnit ja alustiedot tulevat Fintrafficin Digitraffic Marine -rajapinnasta (meri.digitraffic.fi), jonka aineisto on lisensoitu ehdoilla CC BY 4.0. Kerros on oletuksena päällä, ja sen saa pois valikosta Näytä → Väylät, merkit ja valot → AIS-alukset (Digitraffic). Kun kerros on päällä, kartan lähdemerkinnässä lukee AIS: Fintraffic / Digitraffic, CC BY 4.0.

**Merkit.** Alukset piirretään tasolta 8 alkaen, ja vain näkymässä olevat alukset (enintään 400 kerrallaan) piirretään. Jos aluksia on enemmän, etusijalla ovat pelastusalukset ja liikkuvat alukset.
- Liikkuva alus, jonka nopeus on vähintään 0,5 solmua, on nuolenkärki keulan suuntaan. Jos keulasuuntaa ei ole, käytetään kulkusuuntaa.
- Paikallaan oleva, ankkurissa oleva tai kiinnitetty alus on ympyrä.
- Tarkemmilla tasoilla alus piirretään AIS-ilmoituksen mittojen mukaisena runkona todellisessa mittakaavassa, sekä liikkuva että paikallaan oleva. Runko tulee näkyviin, kun sen pituus näytöllä on vähintään noin 18 pikseliä, joten 100 metrin alus on runko tasolta 14 alkaen ja 20 metrin hinaaja tasolta 17 alkaen. Runko on suora ja sen keula kapenee kärkeen. AIS-sijainti on antennin kohdalla, eikä se ole rungon keskellä, ja nopeusvektori lähtee siitä. Rungon napautus avaa saman kortin kuin merkin, ja nimi näkyy rungon vieressä.
- Runko käännetään aluksen keulasuuntaan. Liikkuvalle alukselle käytetään keulasuunnan puuttuessa kulkusuuntaa, mutta paikallaan olevalle vain keulasuuntaa, koska levossa olevan aluksen kulkusuunta on kohinaa.
- Jos mittoja tai keulasuuntaa ei ole, alus piirretään merkkinä. Suunnattoman aluksen ympyrä kasvaa tarkemmilla tasoilla aluksen pituuden mukaiseksi, enintään 40 pikselin kokoon, jotta laiturissa oleva alus erottuu.
- Väri kertoo aluksen tyypin.
- Liikkuvalle alukselle piirretään ohut kuuden minuutin nopeusvektori, jonka pituus on matka, jonka alus kulkee kuudessa minuutissa nykyisellä nopeudellaan.
- Etsintä- ja pelastusalus (tyyppi 51) on kirkkaan oranssi ja paksureunainen, ja merkkinä se on hieman tavallista suurempi. Sen nimi näkyy jo tasolta 10. Muiden alusten nimet näkyvät tasolta 12. Runkojen nimi siirtyy ahtaassa paikassa rungon ylä- tai alapuolelle, ja päällekkäin menevä nimi jätetään pois.
- Yli kymmenen minuuttia vanha sijainti piirretään himmeänä, rungotkin, eikä yli tunnin vanhaa sijaintia piirretä lainkaan.
- Yönäyttö ei muuta AIS-merkkien värejä.

| Tyyppi | Väri |
|---|---|
| Rahtialus (70–79) | vihreä |
| Säiliöalus (80–89) | punainen |
| Matkustaja-alus (60–69) | sininen |
| Pika-alus (40–49) | keltainen |
| Kalastusalus (30) | ruskea |
| Purje- ja huvialus (36–37) | violetti |
| Hinaaja, luotsialus ja viranomaisalus (31–34, 50, 52–59) | turkoosi |
| Sotilasalus (35) | harmaa |
| Muut ja tuntemattomat | vaaleanharmaa |
| Etsintä- ja pelastusalus (51) | oranssi, korostettu |

**Kortti.** Aluksen napautus tai klikkaus avaa kortin, jossa ovat nimi, aluksen tyyppi, MMSI, IMO, kutsutunnus, kulkutila, nopeus, kulku, keula, määränpää, ETA, syväys, pituus ja leveys, sijainti ja sijainnin ikä. Tiedot, joita alus ei ole lähettänyt, jätetään pois. Kortin painike Uusi tehtävä aluksen kohdalle avaa tehtävälomakkeen aluksen sijainnilla. Painikkeet ja sulkupainike ovat puhelimessakin vähintään 40 pikseliä korkeita.

**Päivittyminen.** Sijainnit päivittyvät noin puolen minuutin välein, kun kerros on päällä ja sivu on näkyvissä. Jos tietoa ei saada, kartalla näkyy huomautus, ja aiemmin haetut alukset pysyvät näkyvissä, kunnes ne vanhenevat.

**Rajoitukset.** AIS-tieto on viiveellistä, ja sijainti voi olla minuutteja vanha. Kaikki alukset eivät lähetä AIS-sijaintia, joten esimerkiksi pienveneitä voi puuttua. Tietoa ei saa käyttää törmäysten välttämiseen eikä navigointiin.

## Reittisuunnittelu

Uusi reitti aloitetaan työkalupalkin reittipainikkeella, kirjaston painikkeella Uusi reitti tai näppäimillä Ctrl+R. Reittipisteet klikataan tai napautetaan kartalle. Lukemat näyttävät suunnan, legin pituuden ja kokonaismatkan. Del poistaa viimeisen pisteen, ja Esc lopettaa.

Reitti siirtyy muokkaustilaan, jonka tunnistaa ruskeasta ilmoituksesta. Muokkaustilassa reittipisteitä voi vetää. Reittiviivan valikosta (hiiren oikea painike tai pitkä painallus) lisätään reittipiste, suuntanuotti tai sivuutusetäisyys. Reittipisteen valikosta poistetaan piste, lisätään käännösetäisyys tai jatketaan reittiä.

Jokaiselle näkyvälle legille piirretään automaattisesti SARNavin tapaan suuntanuotti: kulkusuunta isolla, nuoli kulkusuuntaan sekä vastasuunta ja legin pituus. Nuotti sijoittuu legin näkyvälle osalle, ja pitkällä legillä nuotteja on useampia. Mutkikkaalla väylällä nuotit eivät mene toistensa päälle, vaan lyhyiden legien nuotit tulevat näkyviin lähemmäs zoomattaessa. Jokaisen käännöksen eteen piirretään seuran käytännön mukaiset merkit 2 ja 1 kaapelia ennen käännöspistettä.

Reitin ominaisuuksissa nimi muodostuu kentistä Mistä, Kautta ja Mihin. Hyväksy omaan kirjastoon kirjaa hyväksyjän ja alukset, ja hyväksytty reitti näkyy pinkkinä. Hyväksytyn reitin muokkaus aloitetaan erikseen kirjastosta, ja muutokset hyväksytään uudelleen.

Alus valitaan yläpalkista tai puhelimessa valikosta. Kirjasto näyttää valinnan mukaan joko valitun aluksen reitit tai kaikki reitit. Jos alusta ei ole valittu, kaikki hyväksytyt reitit näytetään yhdessä.

## Reititys väylää pitkin

Reitin voi myös laskea automaattisesti. Työkalupalkin reitityspainike, valikko Työkalut → Reititä väylää pitkin tai Ctrl+Shift+R avaa dialogin, jossa annetaan lähtöpiste, määränpää ja pienin kulkusyvyys. Lähtöpisteeksi voi valita oman sijainnin tai aseman, hakea paikan nimellä, poimia sen kartalta tai kirjoittaa koordinaatit. Määränpää annetaan samoilla tavoilla. Kartan oikea painike tarjoaa kohdan Reititä tähän väylää pitkin.

Tehtävälle on oma toiminto Reititä tehtävälle: työkalupalkin tehtäväreittipainike, valikko Tehtävät → Reititä tehtävälle, kirjaston Tehtävät-välilehden painike tai tehtäväpaikan valikko. Dialogissa valitaan tehtävä (aktiivinen tehtävä on valmiiksi valittuna) ja lähtöpiste, joka on oma sijainti, asema tai muu paikka. Painike Uusi tehtävä avaa tehtävälomakkeen, ja luotu tehtävä on valittuna, kun dialogiin palataan. Jos oma sijainti ei ole vielä päällä, sovellus käynnistää sen ja odottaa ensimmäistä paikannusta enintään 25 sekuntia. Reitti päättyy tehtäväpaikkaa lähimpään kelvolliseen väyläpisteeseen, ja viimeinen osuus väylältä tehtäväpaikalle lisätään tarvittaessa käsin.

Reitti kulkee aina virallista väylää pitkin. Sovellus hakee Väyläviraston navigointilinjat lähtöpisteen ja määränpään väliseltä alueelta, rakentaa niistä verkon ja hakee lyhimmän reitin. Verkkoon otetaan vain linjat, joiden kulkusyvyys on vähintään annettu pienin kulkusyvyys, joten vaatimusta ei voi rikkoa. Linjat, joilta kulkusyvyystieto puuttuu, jätetään pois, koska vaatimuksen täyttymistä ei voi silloin todentaa. Mukana ovat myös muiden väylänpitäjien, kuten kuntien, väylät, ja yhteenveto kertoo, jos reitti kulkee osin niillä. Jos reittiä ei löydy, hakualuetta laajennetaan kahdesti, koska väylä voi kiertää kauempaa kuin suora linja.

Lähtöpiste ja saapumispiste ovat lähimmät kelvolliset väyläpisteet annettujen paikkojen lähellä. Reitti alkaa ja päättyy siis väylällä, ja esimerkiksi laiturilta väylälle johtava osuus lisätään käsin. Yhteenveto kertoo, kuinka kaukana nämä pisteet ovat annetuista paikoista.

Laskettu reitti avautuu muokkaustilaan, ja sitä säädetään kuten muitakin reittejä. Yhteenveto näyttää reitin pienimmän kulkusyvyyden, käytetyt väylät kulkusyvyyksineen ja osuuksineen sekä muistutuksen, että reitti tarkistetaan ennen käyttöä. Samat tiedot kirjataan reitin huomioihin. Oletuksena pienin kulkusyvyys on aluksen turvasyvyys.

Reittipisteet ovat väyläaineiston pisteitä, ja ne näkyvät kiinnitettyinä. Suorat jatkokohdat ja kaarien välipisteet on harvennettu niin, että reittiviiva poikkeaa navigointilinjasta enintään kymmenen metriä, mikä pysyy väyläalueen sisällä.

Kulkusyvyyttä voi muuttaa tarkastelun aikana muokkausilmoituksen painikkeesta Kulkusyvyys, yhteenvedon painikkeesta Muuta kulkusyvyyttä tai reittiviivan valikosta. Reitti lasketaan silloin uudelleen samalla lähtöpaikalla ja määränpäällä. Reittipisteet korvataan, ja vanhoihin legeihin viittaavat suuntanuotit sekä sivuutus- ja käännösetäisyydet poistetaan. Jos uutta reittiä ei löydy, nykyinen reitti säilyy. Reititysparametrit tallentuvat reitille, joten kulkusyvyyden voi vaihtaa myöhemminkin kirjastosta avattuun reittiin.

## Väyläkiinnitys ja sijaintitarkkuus

Rasterimerikartta on skannattu paperikartta, eikä sen piirros osu täsmälleen samaan kohtaan kuin ENC-kartta. Pistokokeissa lokakuussa 2026 kahdeksalla alueella väylälinjan paikka rasterikartalla poikkesi ENC:stä tyypillisesti noin 5 metriä. Suurin poikkeama oli noin 16 metriä Savonlinnan Kyrönsalmessa, jossa rasterin piirros ei myöskään seurannut nykyistä väylää. Näsijärvellä poikkeama oli järjestelmällinen, noin 5–6 metriä luoteeseen. Väyläviraston navigointilinjat poikkesivat ENC:stä noin 1–2 metriä.

Tämän vuoksi reittipisteet kiinnittyvät väylän käännöspisteisiin ja navigointilinjoihin Väyläviraston aineistosta, kun piste lisätään tai siirretään niiden lähelle.
- Kiinnitys näkyy magentana renkaana, ja reittikirjasto kertoo, moniko reitin pisteistä on kiinnitetty.
- Kiinnitys toimii tasolta 11 alkaen alueilla, joilla Väyläviraston navigointilinjoja on.
- Väylän ulkopuolelle sijoitettu vapaa piste perii rasterikartan virheen.

Sivuutus- ja käännösetäisyyksien kohteet kiinnittyvät samalla periaatteella lähimpään Väyläviraston turvalaitteeseen tasolta 12 alkaen. Etäisyys lasketaan silloin rekisterin koordinaatista eikä rasterikartan symbolista. Maamerkki, jota rekisterissä ei ole, esimerkiksi niemenkärki, jää rasterikartan tarkkuuden varaan.

Alt-näppäin ohittaa molemmat kiinnitykset, ja kiinnityksen voi kytkeä pois valikosta Näytä.

## Syvä vesi ja turvasyvyys

Työkalurivin aaltopainike tai valikko Näytä → Syvä vesi värittää vesialueet aluksen turvasyvyyden mukaan. Turvasyvyyttä syvempi vesi näkyy vaaleana, varottava vesi sinisenä ja niiden välinen raja eli turvakäyrä tummana viivana. Turvasyvyys on syväys lisättynä pohjavaralla, ja se asetetaan aluskohtaisesti valikosta Näytä → Aseta turvasyvyys.

Logiikka vastaa ECDISin turvakäyrää. Alue on syvää vettä, kun sen pienin syvyys on vähintään turvasyvyys, joten raja asettuu aineiston lähimpään syvyyskäyrään, joka on vähintään turvasyvyys. Esimerkiksi turvasyvyydellä 2,4 m rajana toimii 3 metrin käyrä. Kartan oikeassa yläkulmassa näkyy, mikä käyrä on rajana nykyisessä näkymässä.

Syvyysalueet tulevat Traficomin merikarttatietokannasta. Aineiston syvyysvälit vaihtelevat alueittain. Näsijärvellä välit ovat 0–3, 3–6, 6–10, 10–20 ja 20–50 m, mutta esimerkiksi Helsingin edustalla vain 0–10, 10–20 ja 20–50 m. Karkealla alueella osa turvasyvyyttä syvemmästäkin vedestä näkyy varottavana, ja sovellus kertoo siitä.

## Paikkahaku ja koordinaatit

Yläpalkin hakukenttään voi kirjoittaa seuraavia:
- paikannimen
- turvalaitteen nimen tai numeron
- väylän, sulun, kanavan tai avattavan sillan nimen
- luotsipaikan tai VTS-ilmoittautumispisteen nimen
- katuosoitteen (esimerkiksi Laiturikatu 8) tai kiinteistötunnuksen (esimerkiksi 837-123-4-56), Näsijärven alueella
- AIS-aluksen nimen, kutsutunnuksen tai MMSI-numeron
- oman merkin tai tehtävän nimen
- koordinaatin

Paikannimet haetaan Maanmittauslaitoksen nimistörekisteristä. Turvalaitteet, väylät, sulut ja sillat haetaan Väyläviraston aineistosta, ja luotsipaikat ja VTS-ilmoittautumispisteet Traficomin avoimesta aineistosta. Haku ei lue nimiä karttakuvasta, joten se toimii samoin rasteri-, ENC- ja vektoripohjalla. Väylän valinta korostaa koko väylän ja sovittaa sen näkymään. Sama haku on käytössä myös tehtävä- ja reititysdialogeissa.

Katuosoite- ja kiinteistötunnushaku käyttää Näsijärven aineistopaketin hakemistoja (`osoitteet.json` ja `kiinteistot.json`), jotka ladataan selaimeen kerran, kun haetaan ensimmäistä kertaa osoitetta tai tunnusta. Haku toimii myös silloin, kun Maasto-tasot ovat pois päältä. Osoitteeksi tunnistetaan kirjaimia ja lopussa numero (esimerkiksi Kaupinojankatu 12, Laiturikatu 8 a tai Rantatie 3, Tampere). Kiinteistötunnus kirjoitetaan väliviivoin (837-123-4-56) tai 14 numerona ilman väliviivoja (kunta 3, kylä 3, tila 4 ja rekisterinumero 4 numeroa). Tuloksella on laji osoite tai kiinteistö, kunta ja etäisyys, ja se kelpaa tehtäväpaikaksi. Osoitteet ovat Digi- ja väestötietoviraston poiminta 3.2.2025, joten uudet osoitteet puuttuvat.

Jos paikannimiä ei tule, hakutulosten alla kerrotaan syy. Tiedostona avatusta sovelluksesta voi puuttua API-avain, ja verkkoversiossa julkaisun palvelimelta voi puuttua avain (ks. Julkaisu Verceliin).

Hakusanaksi riittää nimen alku: viitas löytää sekä Viitasaaret että Viitasalmet. Lähialueelta haetaan myös nimen keskeltä, joten salmi löytää esimerkiksi lähellä olevan Viitasalmen.

AIS-alukset löytyvät nimen osalla, kutsutunnuksen alulla tai MMSI-numeron alulla, kun numeroita on vähintään kolme. Haku alkaa jo kahdesta merkistä, ja siitä näytetään kymmenen lähintä alusta omassa ryhmässään. Aluksen valinta keskittää kartan alukseen ja avaa sen kortin (ks. AIS-alukset). Haku löytää alukset myös silloin, kun AIS-kerros on pois päältä, ja tuloksen valinta kytkee kerroksen silloin päälle.

Samannimisiä paikkoja on paljon, joten tulokset näytetään kartalla numeroituina ja listassa lähimmät ensin.
- Jokaisella rivillä on paikan kunta tai tuloksen laji (esimerkiksi turvalaite, väylä tai sulku) sekä etäisyys meripeninkulmina ja suunta kartan keskeltä.
- Alle 27 meripeninkulman (50 km) päässä olevat tulokset ovat omana ryhmänään.
- Jos lähialueen tuloksia ei näy kartalla, kartta siirtyy niihin.
- Näytä kartalla -painike tai Enter näyttää kaikki lähialueen tulokset.
- Tuloksen voi valita listasta tai sen numerosta kartalla. Numerot jäävät kartalle vertailua varten, kunnes paikka valitaan tai painetaan Esc.

Koordinaatissa asteen ja minuutin merkit voi korvata välilyönneillä. Heti perään kirjoitettu N tai E päättää luvun, joten 61 35,1N tarkoittaa 61°35,1′N, 61 35 11N tarkoittaa 61°35′11″N ja 61,5N tarkoittaa 61°30′N. Leveys ja pituus erotetaan välilyönnillä tai pilkulla, esimerkiksi 61 35,1N 23 45,6E.

## Tehtäväpaikat ja asema

Uusi tehtävä luodaan työkalupalkin painikkeella Uusi tehtäväpaikka, valikosta Tehtävät tai kartan valikosta kohdasta Lisää tehtävä tähän. Paikka annetaan kolmella tavalla: haetaan nimellä, kirjoitetaan koordinaatteina tai poimitaan kartalta. Koordinaattikentän alla näkyy heti, miten syöte tulkittiin.

Lomakkeen kenttä Hae paikka toimii kuin yläpalkin haku. Kun osuma valitaan, lomake väistyy ja paikka näytetään kartalla magentalla renkaalla.
- Muut osumat näkyvät numeroituina, ja numeron napautus vaihtaa paikan.
- Paikkaa voi tarkentaa vetämällä rengasta tai napauttamalla karttaa.
- Vahvista paikka palaa lomakkeelle uusi paikka valittuna, ja tehtävä luodaan vasta painikkeesta Luo tehtävä.
- Takaisin tai Esc palaa lomakkeelle muuttamatta paikkaa.

Jos tehtävää ei ole nimetty itse, oletusnimeen lisätään paikan nimi.

Asema asetetaan kartan valikosta kohdasta Aseta asema tähän, tietokoneella hiiren oikealla painikkeella ja puhelimessa pitkällä painalluksella. Aktiivisen tehtävän suuntima ja etäisyys asemalta näkyvät lukemissa.

Reitti tehtäväpaikalle lasketaan toiminnolla Reititä tehtävälle (ks. Reititys väylää pitkin).

## Oma sijainti

Työkalupalkin sijaintipainike näyttää laitteen sijainnin sinisenä pisteenä ja tarkkuuden vaaleana ympyränä. Liikkeessä pisteen edessä on kulkusuunnan nuoli, ja lukemissa näkyvät sijainti, nopeus solmuina, kulku ja tarkkuus.

Puhelimessa sijainti käynnistyy, kun sovellus avataan, ja selain kysyy luvan ensimmäisellä kerralla. Tietokoneella sijainti käynnistetään painikkeesta. Kun seuranta on päällä, painike keskittää kartan sijaintiin, jos piste on näkymän ulkopuolella, ja muuten lopettaa seurannan. Jos käyttäjä lopettaa seurannan tai kieltää luvan, sovellus muistaa valinnan eikä käynnistä sijaintia enää itsestään.

iPhonessa sijainnin pitää olla sallittu myös kohdassa Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut → Safarin verkkosivustot. Selain antaa sijainnin vain suojatulle https-sivulle, joten sijainti toimii verkkoversiossa.

## Työkalut ja pikanäppäimet

| Näppäin | Toiminto |
|---|---|
| Ctrl+R | Uusi reitti |
| Ctrl+Shift+R | Reititä väylää pitkin |
| M | Harppi: matka usean legin kautta, ja sen voi muuttaa reitiksi |
| F6 | Suuntima: tosisuuntima ja etäisyys asemalta tai valitusta pisteestä |
| R, E, Shift+E, V | Karttapohjaksi rasteri, ENC, ENC ECDIS-symbolein tai vektori |
| Del | Poistaa viimeisen reittipisteen |
| Esc | Lopettaa työkalun tai muokkauksen |
| Alt | Ohittaa väyläkiinnityksen |
| Kaksoisklikkaus | Keskittää kartan |
| Oikea painike | Kartan valikko: merkit, tehtäväpaikat, asema, harppi, suuntima ja koordinaattien kopiointi |

Työkalupalkin painikkeet ovat ylhäältä alkaen:
- harppi ja suuntima
- uusi reitti ja reititys väylää pitkin
- reittinuottien, sivuutusetäisyyksien ja syvän veden näkyvyys
- oma merkki, oma sijainti, uusi tehtäväpaikka ja reititys tehtävälle

Omia merkkejä on monta lajia: yleinen merkki, havaintopiste, kivi tai vaara, matala, lateraali- ja kardinaalimerkit, nopeusrajoitus sekä huolto tai laituri. Valikossa Näytä ovat myös yönäyttö ja karttareunuksen minuuttiasteikko.

## Puhelin ja tabletti

Kapeassa näytössä valikot ovat vasemman yläkulman valikkonapin takana, ja samasta valikosta valitaan alus ja näytettävät reitit. Puhelimessa valikko avautuu yläreunasta levynä, jossa on Takaisin ja Sulje. Näytä-valikko on jaettu osioihin: Karttapohja, Syvä vesi, Väylät merkit ja valot, Reitit sekä Maapohja ja näyttö.

Kirjasto avautuu näytön alaosaan ja sulkeutuu itsestään, kun reitti tai muokkaus aloitetaan. Kun kirjasto on auki, kartta keskitetään sen yläpuolelle jäävään osaan, ja valitun reitin toimintopainikkeet ovat heti nimen alla.

Karttaa zoomataan nipistämällä, ja pitkä painallus vastaa hiiren oikeaa painiketta. Reittipisteitä lisättäessä ja harpilla mitattaessa ylhäällä ovat painikkeet Poista viimeinen ja Valmis, ja lukemat näyttävät juuri lisätyn välin suunnan ja pituuden.

## SARNav ja GPX

Reitti viedään GPX-tiedostoksi reitin valikosta tai reittikirjastosta, ja koko kirjaston voi viedä kerralla. Reittipisteet siirtyvät OpenCPN-pohjaiseen ohjelmaan, kuten SARNaviin. Suuntanuotit, sivuutus- ja käännösetäisyydet, hyväksyntätiedot, väyläkiinnitykset ja automaattisen reitityksen tiedot tallentuvat tiedostoon sovelluksen omana lisäosana, ja ne palautuvat vain tähän sovellukseen tuotaessa. SARNavista viety GPX-reitti tuodaan valikosta Tiedosto → Tuo GPX.

## Aineistot ja lisenssit

| Aineisto | Lähde | Lisenssi |
|---|---|---|
| Rasterimerikartat | Traficom, rasteripalvelu (WMTS) | CC BY 4.0, ei navigointikäyttöön |
| ENC-karttapohja | Traficom, S-57 WMS | CC BY 4.0, ei navigointikäyttöön |
| Syvyysalueet, -käyrät ja -luvut | Traficomin merikarttatietokanta (INSPIRE-palvelu) | Traficomin hydrografisen aineiston lisenssi: muuhun kuin navigointiin ja ei-kaupallisesti, lähdemerkintä tiedonsiirron ajankohtineen |
| Navigointilinjat, väylät, turvalaitteet, loistot, valosektorit, linjataulujen linjat, vesiliikennemerkit, nopeusrajoitukset, sulut ja avattavat sillat | Väylävirasto, avoin rajapinta | CC BY 4.0 |
| Siltojen alikulkukorkeudet | Väylävirasto, taitorakennerekisteri (avoin rajapinta) | CC BY 4.0 |
| Luotsipaikat ja VTS-ilmoittautumispisteet (haku) | Traficom, avoin INSPIRE-palvelu | CC BY 4.0 |
| AIS-sijainnit ja alustiedot | Fintraffic, Digitraffic Marine (meri.digitraffic.fi) | CC BY 4.0, ei navigointikäyttöön |
| Kivet, karikot, laiturit, aallonmurtajat ja paikannimet | Maanmittauslaitos, maastotietokanta ja nimistörekisteri (OGC API Features) | CC BY 4.0 |
| Maanmittauslaitoksen taustakartta | Maanmittauslaitos, kartat.kapsi.fi | CC BY 4.0 |
| Maapohja ja laiturialueet | OpenStreetMap-tekijät, tiilet ja Overpass-rajapinta | ODbL |
| Kuntien nimet | Tilastokeskus, kuntaluokitus 2025 | CC BY 4.0 |
| Maasto-tasot: rakennukset, maastotyyppi ja tiet | Maanmittauslaitos, maastotietokanta 04/2025 (Näsijärven aineistopaketti) | CC BY 4.0 |
| Maasto-tasot: kiinteistörajat ja kiinteistötunnukset (haku ja napautus) | Maanmittauslaitos, kiinteistörajatiedot 05/2025 | CC BY 4.0 |
| Maasto-tasot: varjostus | Maanmittauslaitos, korkeusmalli 2 m ja 10 m | CC BY 4.0 |
| Maasto-tasot: osoitteet ja osoitehaku | Digi- ja väestötietovirasto, rakennusten osoitetiedot, poiminta 3.2.2025 | CC BY 4.0 |
| Karttakirjastot | Leaflet 1.9.4, pmtiles 4.5.0, protomaps-leaflet 5.1.0 | BSD-2, BSD-3, BSD-3 |

Lisenssiteksti ja lähdemerkinnät ovat sovelluksessa kohdassa Ohje → Aineistot ja käyttöehdot.

Traficom edellyttää merikartta-aineistolle lähdemerkintää muodossa: *Lähde: Liikenne- ja viestintävirasto. Ei navigointikäyttöön. Ei täytä asianmukaisen merikartan vaatimuksia.* Merkintä on sovelluksen Tietoja-ikkunassa ja kohdassa Aineistot ja käyttöehdot.

## Lisenssi

Sovelluksen oma koodi on lisensoitu ehdoilla **PolyForm Noncommercial 1.0.0**. Lisenssiteksti on tiedostossa `LICENSE.md` ja osoitteessa https://polyformproject.org/licenses/noncommercial/1.0.0. Koodia saa vapaasti kopioida, muokata ja jakaa ei-kaupalliseen tarkoitukseen. Yleishyödylliset yhteisöt, julkisen turvallisuuden organisaatiot, oppilaitokset ja viranomaiset saavat käyttää sitä rahoituksestaan riippumatta, joten esimerkiksi Meripelastusseura ja sen yhdistykset voivat ottaa sovelluksen käyttöön ilman erillistä lupaa. Kaupallinen käyttö vaatii luvan tekijältä.

Required Notice: Copyright 2026 Jussi Vaahtikari

Ei-kaupallinen rajaus vastaa sovelluksen käyttämän aineiston ehtoja. Traficomin syvyysaineiston lisenssi sallii aineiston hyödyntämisen vain ei-kaupallisesti ja muuhun kuin navigointiin, joten vapaampi koodilisenssi antaisi luvan, jota sovellus ei aineistonsa puolesta voi käyttää. Lisenssi ei ole OSI:n määritelmän mukainen avoimen lähdekoodin lisenssi, vaikka lähdekoodi on julkinen.

Lisenssi koskee vain sovelluksen omaa koodia. Kartta-aineistot ovat omien lisenssiensä alaisia (taulukko edellä), ja mukana tulevat Leaflet (BSD-2) sekä pmtiles ja protomaps-leaflet (BSD-3) on lisensoitu omilla ehdoillaan; tekijänoikeusilmoitukset säilyvät kirjastojen alussa ja lisenssitekstit ovat tiedostossa `lahdekoodi/lib/LISENSSIT.txt`. SARNav on Meripelastusseuran ohjelma, ja nimeä käytetään tässä vain kuvailevasti.

## Repon rakenne

| Polku | Sisältö |
|---|---|
| `index.html` | Koko sovellus yhtenä tiedostona. Vercel julkaisee tämän. |
| `api/mml.js` | Vercelin palvelinfunktio: välityspalvelu Maanmittauslaitoksen rajapintaan |
| `README.md` | Tämä ohje (kopio tiedostosta `lahdekoodi/LUEMINUT.md`) |
| `LICENSE.md` | Koodin lisenssi, PolyForm Noncommercial 1.0.0 |
| `lahdekoodi/LUEMINUT.md` | Tämän ohjeen lähde, josta `README.md` kopioidaan |
| `lahdekoodi/index.html`, `lahdekoodi/css/app.css` | Sovelluksen runko ja tyylit |
| `lahdekoodi/js/app.js` | Käynnistys, valikot, näppäimet, oma sijainti ja asetukset |
| `lahdekoodi/js/chart.js` | Karttapohjat, vektorikartta, väylätiedot, linjataulujen linjat, valot, vesiliikennemerkit, sillat ja sulut, Maanmittauslaitoksen aineistot ja laiturit |
| `lahdekoodi/js/symbols.js` | Suomen merikarttojen karttamerkit ja viittojen ECDIS-värit |
| `lahdekoodi/js/signs.js` | Vesiliikennemerkit vesiliikennelain mukaisina kilpinä |
| `lahdekoodi/js/rastersharp.js` | Merikarttarasterin terävä suurennus |
| `lahdekoodi/js/routes.js` | Reittisuunnittelu ja hyväksyntä |
| `lahdekoodi/js/routing.js` | Automaattinen reititys väylää pitkin: verkko navigointilinjoista, kulkusyvyysrajoite, lyhimmän reitin haku ja dialogi |
| `lahdekoodi/js/tools.js` | Harppi, suuntima, omat merkit, tehtäväpaikat ja asema |
| `lahdekoodi/js/ais.js` | AIS-alukset: Digitraffic-haku ja ajastus, alusten merkit, nopeusvektorit ja nimet, aluksen kortti sekä alushaku |
| `lahdekoodi/js/search.js` | Paikkahaku: paikannimet, turvalaitteet, väylät, sulut ja sillat, luotsipaikat, VTS-pisteet, AIS-alukset, osoitteet ja kiinteistötunnukset |
| `lahdekoodi/js/terrain.js` | Maasto-tasot (Näsijärven aineistopaketti): tasot, napautus sekä osoite- ja kiinteistötunnushakemistot |
| `lahdekoodi/js/library.js` | Reittikirjasto |
| `lahdekoodi/js/gpx.js` | GPX-tuonti ja -vienti |
| `lahdekoodi/js/geo.js` | Suunnat, matkat ja koordinaattien muotoilu |
| `lahdekoodi/js/store.js` | Tila ja tallennus selaimeen |
| `lahdekoodi/js/ui.js` | Valikot, dialogit, ilmoitukset ja lukemat |
| `lahdekoodi/lib/` | Leaflet 1.9.4 (BSD-2), pmtiles 4.5.0 ja protomaps-leaflet 5.1.0 (BSD-3), lisenssitekstit tiedostossa `LISENSSIT.txt` |
| `lahdekoodi/build.py` | Kokoaa yhden tiedoston version |
| `lahdekoodi/tests/` | Käyttöliittymätestit |

## Julkaisu Verceliin

Vercel-projekti on kytketty tähän repoon, ja jokainen `main`-haaraan tuleva commit julkaistaan automaattisesti osoitteeseen https://reittikartta-6qn2.vercel.app. Vercel julkaisee repon juuren `index.html`-tiedoston sellaisenaan, eikä palvelimella ajeta koontivaihetta.

Maanmittauslaitoksen avoin rajapinta vaatii API-avaimen. Verkkoversiossa avain on Vercelin ympäristömuuttujassa `MML_API_KEY` (Settings → Environment Variables), eikä se näy sivun koodissa. Avaimen muuttamisen jälkeen projekti julkaistaan uudelleen (Redeploy).

Sovellus kutsuu Maanmittauslaitosta osoitteen `/api/mml` kautta. Välityspalvelu lisää avaimen ja välittää vain sovelluksen käyttämät polut (maastotiedot ja nimistö). Vastaukset tallentuvat Vercelin välimuistiin vuorokaudeksi. Jos avainta ei ole asetettu, palvelu vastaa koodilla 503. Sovellus toimii silloin ilman Maanmittauslaitoksen aineistoja, kertoo hakutuloksissa, miksi paikannimiä ei tule, ja käyttäjä voi syöttää oman avaimen asetuksiin.

Muut kuin `main`-haarat julkaistaan Vercelin esikatseluosoitteisiin. Jotta nimistöhaku toimii myös niissä, ympäristömuuttujan `MML_API_KEY` pitää olla valittuna myös Preview-ympäristölle. Esikatselut ovat oletuksena Vercel-kirjautumisen takana (Settings → Deployment Protection).

Verkkoversio lataa Vercelin Web Analytics -kävijälaskurin vain vercel.app-osoitteessa. Laskuri kerää tietoja, kun Web Analytics on kytketty päälle projektin Analytics-sivulla.

Käytännön huomio: Vercel ei julkaissut committeja, joiden tekijän sähköpostiosoite ei ollut liitetty Vercel-tiliin. Commitit tehdään siksi tilin osoitteella.

## Kehitys ja testaus

Lähdekoodia muokataan kansiossa `lahdekoodi`. Yhden tiedoston versio kootaan komennolla `python3 build.py`. Se kirjoittaa tiedoston `dist/Reittikartta.html`, joka kopioidaan repon juureen nimelle `index.html`. Kopioi myös `LUEMINUT.md` juureen nimelle `README.md`.

Testit ajetaan Playwrightilla (Python), ja verkkopalvelut korvataan niissä testiaineistolla (`tests/run_ui.py` ja `tests/mockdata.py`). Testi ajetaan komennolla `python3 tests/<testi>.py`. Testattava sivu annetaan ympäristömuuttujalla `TARGET`. Maastotesti ajetaan komennolla `AINEISTO=<pakettihakemisto> python3 tests/terrain_test.py` (osat valitaan muuttujalla `OSA`, esimerkiksi `OSA=suorituskyky`). Puhelintesteissä laiteprofiili valitaan muuttujalla `DEVICE`, esimerkiksi `DEVICE="iPhone 15"` (WebKit) tai `DEVICE="Pixel 7"` (Chromium).

| Testi | Kattaa |
|---|---|
| `vector_test.py` | Vektorikartta: syvyysalueet, syvyysluvut ja väylälinjat |
| `enc_test.py` | ENC-pohja, kattavuuden tarkistus ja paluu rasteriin |
| `extra_test.py` | Karttamerkit, valosektorit, nopeusrajoitukset, suuntanuotit, käännösmerkit, maapohja ja Maanmittauslaitoksen kerros |
| `safety_test.py` | Syvä vesi ja turvasyvyys |
| `snap_test.py` | Reittipisteiden väyläkiinnitys |
| `wheel_test.py` | Hiiren rullan zoomaus, myös tarkkuusrullan purskeet |
| `legnote_test.py` | Legien suuntanuottien sijoittelu mutkikkaalla reitillä (ei päällekkäisyyksiä) |
| `structures_test.py` | Vesiliikennemerkit, sillat ja sulut sekä viittojen ECDIS-värit (`DEVICE` valitsee puhelinprofiilin) |
| `route_test.py` | Reititys väylää pitkin: kulkusyvyysrajoite, lähin kelvollinen väyläpiste, linjat ilman kulkusyvyyttä, risteykset ja dialogi (`DEVICE` valitsee puhelinprofiilin) |
| `aid_test.py` | Sivuutus- ja käännösetäisyyksien kiinnitys turvalaitteisiin |
| `search_test.py` | Paikkahaku |
| `ais_test.py` | AIS-alukset: merkit, värit, pelastusalukset, nopeusvektori, nimet, kortti ja tehtäväpainike, haku, päivitysajastus, piilotettu sivu, kerroksen poisto ja yönäyttö (Digitraffic korvataan testiaineistolla) |
| `task_gps_test.py` | Tehtäväpaikan haku, merimailit ja oma sijainti |
| `pier_gps_test.py` | Laiturit sekä oma sijainti puhelimessa |
| `proxy_test.py` | Maanmittauslaitoksen välityspalvelu |
| `terrain_test.py` | Maasto-tasot ja osoitehaku: osoite- ja kiinteistötunnushaku, tunnus ja rakennus napautuksella, tasojen piirto, alueen ulkopuolinen käyttö, offline-tila, suorituskyky Pixel 7 -profiililla ja puhelinkierros (iPhone 14 ja Pixel 7). Tarvitsee aineistopaketin hakemistona (`AINEISTO`), jonka testi tarjoilee paikallisesti |
| `mobile_test.py`, `iphone_test.py` | Puhelinasettelu ja kosketuskäyttö |

## Tunnetut rajoitukset

- **Maasto-tasot:** aineisto kattaa vain Näsijärven (Tampereen Mustalahdesta Muroleen kanavan kautta Ruoveden suuntaan, rantoineen). Huomautuksen raja on paketin alueen suorakulmio, joten sen sisällä voi olla ruutuja, joille ei ole aineistoa. Osoitteet ovat poiminta 3.2.2025 eikä niitä päivitetä, koska DVV lopetti avoimen jakelun 14.3.2025. Maasto-tasot ja osoite- ja tunnushaku tarvitsevat verkkoyhteyden, ja Pages-osoitteen ollessa tavoittamattomissa ne jäävät hiljaa tyhjiksi. Kiinteistötunnus näkyy napautuksella vain, kun tunnuspiste on enintään 30 m päässä.
- **Laitekohtaiset tiedot:** reitit ja merkit eivät ole jaettuja käyttäjien tai laitteiden kesken, vaan ne siirretään varmuuskopiolla.
- **ENC:n kattavuus:** ENC-aineistoa ei ole kaikilla vesillä, esimerkiksi Näsijärvellä.
- **Syvyysvälit:** vektorikartan ja syvän veden syvyysvälit ovat paikoin karkeita.
- **Reititys:** reitti alkaa ja päättyy väylällä, eikä se kulje väylän ulkopuolisilla vesialueilla. Kulkusyvyyden lisäksi muita rajoituksia ei huomioida, joten nopeusrajoitukset, siltojen alikulkukorkeudet ja sulkujen mitat tarkistetaan itse. Linjat ilman kulkusyvyystietoa eivät kelpaa. Hakualue on enintään noin 4° × 2,5°, joten hyvin pitkä matka jaetaan osiin.
- **Vesiliikennemerkit:** merkin lajin merkitys on päätelty rekisterin numerokoodista. Epävarmimpia ovat väylän reunan merkki (koodi 19) ja lauttaväylän merkit, joissa vaijerilauttaa ei erotella vapaasti kulkevasta lautasta, ellei lisäkilpi mainitse vaijeria.
- **Sillat:** alikulkukorkeus on taitorakennerekisterissä vain noin 280 sillalle. Muiden siltojen alikulkukorkeus näkyy vain vesiliikennemerkeissä ja karttapohjassa. Rekisterin korkeuden vertaustaso ei käy aineistosta ilmi.
- **OpenStreetMapin maapohja:** jos OpenStreetMapin tiilet näkyvät Access blocked -ruutuina, maapohjaksi voi valita Maanmittauslaitoksen taustakartan valikosta Näytä.
- **Overpass:** OpenStreetMapin Overpass-palvelu on usein ruuhkainen, jolloin OpenStreetMapin laiturialueet tulevat viiveellä tai jäävät tulematta. Maanmittauslaitoksen laituriviivat näkyvät silti.
- **AIS-alukset:** sijainnit ovat viiveellisiä, eikä kaikilla aluksilla ole AIS-lähetintä. Sijaintien ikä lasketaan laitteen kellosta, joten väärin käyvällä kellolla sijainnit näyttävät joko vanhoilta tai tuoreilta. Jos selain ei pääse Digitraffic-rajapintaan, esimerkiksi verkon rajausten vuoksi, kartalla näkyy huomautus eikä aluksia näytetä. Aineisto ei sovellu navigointiin eikä törmäysten välttämiseen.
- **Paikannimihaku:** nimistörekisterin paikan lajia ei vielä näytetä tuloksissa sanallisesti, vaan rivillä on kunta. Väylät, sulut ja sillat haetaan vain Väyläviraston aineistosta ja luotsipaikat Traficomin aineistosta, joten muiden toimijoiden kohteet voivat puuttua.
