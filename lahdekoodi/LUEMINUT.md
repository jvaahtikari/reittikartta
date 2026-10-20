# Reittikartta

Reittikartta on selainpohjainen reittisuunnittelun työkalu suomalaisella merikartalla. Sen toiminnot mukailevat Meripelastusseuran SARNav-karttaohjelmaa: reittiluonnos, suuntanuotit, sivuutus- ja käännösetäisyydet, hyväksyntä aluskohtaiseen reittikirjastoon, omat merkit ja tehtäväpaikat. Sovellus ei ole Meripelastusseuran virallinen ohjelma.

**Verkkoversio:** https://reittikartta-6qn2.vercel.app

**Ei navigointikäyttöön.** Kartta-aineistot ovat avointa dataa, jota ei ole tarkoitettu navigointiin. Traficomin määritelmän mukaan myös reitin suunnittelu on navigointikäyttöä. Ajettavat reitit tarkistetaan ja hyväksytään SARNavissa virallista ENC-karttaa vasten.

## Suhde SARNaviin

Reittikartta ei ole SARNavin kanssa kilpaileva hanke, eikä sen tarkoituksena ole korvata SARNavia. SARNav on Meripelastusseuran virallinen karttaohjelma, ja ajettavat reitit tarkistetaan ja hyväksytään siinä.

Reittikartta on reittien luonnosteluun tarkoitettu apuväline. Valmiit reitit siirretään SARNaviin GPX-tiedostona. Sovelluksen toiminnot ja nimitykset mukailevat SARNavia, jotta siirtyminen sovelluksesta toiseen olisi luontevaa.

Sovellus ei sisällä SARNavin koodia eikä grafiikkaa. Se ei ole Meripelastusseuran tuote, eikä sitä ole tehty seuran toimeksiannosta.

## Ominaisuudet lyhyesti

- **Kolme karttapohjaa:** Traficomin rasterimerikartta, ENC-kartta perinteisin tai ECDIS-symbolein sekä vektorikartta, joka on terävä tasolle 20 asti. Rasterista ja ENC:stä siirrytään vektorikarttaan itsestään, kun zoomataan tasoa 17 lähemmäs.
- **Suomalaiset karttamerkit:** kivet, viitat, kummelit, linjamerkit ja loistot piirretään Traficomin merkkienselityksen mukaan. Valosektorit näkyvät värikaarina ja ympäri näkyvät valot värirenkaana.
- **Reittisuunnittelu SARNavin tapaan:**
  - suuntanuotit ja käännösmerkit 2 ja 1 kaapelia ennen käännöstä
  - sivuutus- ja käännösetäisyydet
  - reittipisteiden kiinnitys väylän pisteisiin
  - hyväksyntä aluskohtaiseen reittikirjastoon
- **Reititys väylää pitkin:** reitti lasketaan automaattisesti lähtöpisteestä määränpäähän Väyläviraston navigointilinjoja pitkin, ja vain annetun kulkusyvyyden täyttävät väylät kelpaavat. Reitti avautuu muokkaustilaan tarkistettavaksi.
- **Syvä vesi:** vesialueet väritetään aluksen turvasyvyyden mukaan ECDISin turvakäyrän tapaan.
- **Paikkahaku:** paikannimet, turvalaitteet, omat kohteet ja koordinaatit. Samannimiset paikat näytetään kartalla numeroituina, ja niille annetaan kunta sekä etäisyys meripeninkulmina ja suunta.
- **Tehtäväpaikat ja asema:** tehtäväpaikka haetaan nimellä ja tarkistetaan kartalla ennen luomista. Aktiivisen tehtävän suuntima ja etäisyys näytetään asemalta.
- **Oma sijainti:** laitteen sijainti, nopeus ja kulku. Puhelimessa sijainti käynnistyy sovelluksen avautuessa, kun käyttäjä sallii sen.
- **Työkalut:** harppi, suuntima, omat merkit, yönäyttö ja karttareunuksen minuuttiasteikko.
- **Laiturit ja aallonmurtajat** näkyvät vektorikartalla Maanmittauslaitoksen ja OpenStreetMapin aineistosta.
- **GPX:** reittien tuonti SARNavista ja vienti SARNaviin.
- **Puhelin ja tabletti:** kapeassa näytössä on oma asettelu ja kosketusohjaus.

## Käyttöönotto

Sovellusta käytetään verkko-osoitteesta https://reittikartta-6qn2.vercel.app. Asennuksia tai tunnuksia ei tarvita, ja sama osoite toimii tietokoneella, tabletissa ja puhelimessa. Kartat ja väylätiedot haetaan verkosta käytön aikana, joten laitteen pitää olla verkossa.

iPhonessa ja iPadissa sivu kannattaa lisätä Koti-valikkoon: Safarissa Jaa → Lisää Koti-valikkoon. Silloin sovellus aukeaa omana kuvakkeenaan ilman selaimen palkkeja, ja sen tallentamat tiedot säilyvät varmemmin (ks. Tallennus ja tietosuoja).

Ensimmäisellä käynnistyskerralla sovellus näyttää lyhyen esittelyn. Pikaohje on valikossa Ohje → Pikaohje, ja aineistojen lähteet ja käyttöehdot ovat kohdassa Ohje → Aineistot ja käyttöehdot.

Sovellus toimii myös yhtenä tiedostona ilman verkkopalvelinta. Repon juuren `index.html` on koko sovellus yhdessä tiedostossa, ja sen voi avata tietokoneen selaimessa tuplaklikkaamalla. Tiedostona avattuna Maanmittauslaitoksen aineistot (kivet, laiturit ja paikannimet) tarvitsevat oman maksuttoman API-avaimen, joka syötetään kohtaan Tiedosto → Asetukset. Myös oma sijainti voi jäädä toimimatta. iPhonen Safari ei aja HTML-tiedostoon kirjoitettua ohjelmaa, kun tiedosto avataan Tiedostot-sovelluksesta, joten iPhonessa käytetään verkkoversiota.

## Hiiren rulla ja zoomaus

Karttaa zoomataan hiiren rullalla yksi taso naksausta kohti. Sovelluksella on oma rullakäsittely, koska karttakirjaston oma pyöristää jokaisen 40 millisekunnin erän ylöspäin kokonaiseen tasoon. Tarkkuusrullat, kuten Logitechin MagSpeed-rulla pehmeällä vierityksellä, pilkkovat yhden naksauksen kymmeniin pieniin tapahtumiin, jolloin kirjaston käsittely zoomasi yhdellä naksauksella useita tasoja. Nyt rullaus kertyy, yksi taso vaatii naksauksen verran liikettä, ja saman purskeen loput tapahtumat jätetään huomiotta. Kosketuslevyn nipistys on herkempi.

## Tallennus ja tietosuoja

Sovellus tallentaa selaimen muistiin seuraavat tiedot:
- reitit, omat merkit ja tehtävät
- alukset, aseman ja turvasyvyydet
- Näytä-valikon valinnat, karttapohjan ja viimeisimmän karttanäkymän

Kun sivu avataan uudelleen samalla laitteella ja samalla selaimella, kaikki on tallessa. Mitään ei tallenneta palvelimelle. Tästä seuraa muutama rajoitus:

- **Laitteet ja käyttäjät:** tiedot ovat laite- ja selainkohtaisia. Puhelimella tehdyt reitit eivät näy tietokoneella, eivätkä eri käyttäjät näe toistensa reittejä.
- **Safari:** Safari voi tyhjentää sivuston tallentamat tiedot, jos sivulla ei ole käyty noin seitsemään päivään. Koti-valikkoon lisätty sovellus ei ole tämän rajoituksen alainen.
- **Yksityinen selaus:** yksityisessä ikkunassa tiedot katoavat, kun ikkuna suljetaan.
- **Varmuuskopio:** reitit siirretään laitteelta toiselle ja varmistetaan varmuuskopiolla. Varmuuskopio tehdään valikosta Tiedosto → Tee varmuuskopio, ja sen voi palauttaa samasta valikosta myös toiselle laitteelle.

Oma sijainti näytetään vain käyttäjän omalla näytöllä, eikä sitä tallenneta eikä lähetetä minnekään. Karttatiilet ja aineistot haetaan suoraan palveluista, jotka ovat Traficom, Väylävirasto, Maanmittauslaitos ja OpenStreetMap. Ne näkevät tavanomaisesti, miltä alueelta karttaa pyydetään. Verkkoversio laskee kävijämäärät ja sivulataukset Vercelin anonyymillä Web Analytics -laskurilla, joka ei käytä evästeitä eikä yksilöi käyttäjiä. Tiedostona avatussa sovelluksessa laskuria ei ladata.

## Karttapohjat

Karttapohja vaihdetaan kartan yläreunan painikkeilla Rasteri, ENC, ECDIS ja Vektori. Samat valinnat ovat valikossa Näytä ja näppäimissä R, E, Shift+E ja V. Valittu pohja on korostettu.

**Rasterikartta** on Traficomin skannattu paperimerikartta. Sen tarkin taso on 15, ja näytöllä yksi pikseli vastaa tasolla 15 noin 2,3:a metriä. Tasot 16–17 piirretään saman aineiston terävöitettynä suurennoksena. Sovellus tunnistaa kartan omat värit ja piirtää värirajat uudelleen terävinä, mutta tarkkuutta ei synny lisää. Tarkalla näytöllä kauempana kuva kootaan yhtä tasoa tarkemmista tiilistä ja pienennetään. Kartta on terävimmillään, kun selaimen oma zoomaus on 100 %. Rasterissa näkyy paikoin karttalehtien rajaviivoja, jotka ovat Traficomin aineistossa sellaisenaan.

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

Jokaisella loistolla, apuloistolla ja valaistulla viitalla on valon värinen pisara. Valkoinen valo on keltainen kuten merikartassa. Sektoriloistoilla näytetään valosektorit värikaarina, sektorirajat katkoviivoina ja loistorekisterin valotunnus, esimerkiksi VQ (3) 5 s. Ympäri näkyvä valo piirretään valon värisenä renkaana. Sektorien kulmat ovat loistoluettelon tapaan merelle päin katsottuina.

Väyläviraston avoimesta rajapinnasta näytetään lisäksi seuraavat tiedot:
- vesiliikennemerkit vesiliikennelain mukaisina kilpinä
- sillat alikulkukorkeuksineen sekä sulut ja avattavat sillat
- väylien suunnat molempiin suuntiin ja kulkusyvyydet
- linjataulujen linjat tosisuuntineen
- vesiliikennemerkit ja nopeusrajoitusalueet
- muiden väylänpitäjien, kuten kaupunkien, väylät ja turvalaitteet

Linjataulujen linjat piirretään vektorikartalle (ja väylälinjojen kanssa muillekin pohjille) ENC:n tapaan: ohut katkoviiva jatkuu väylän linjaosuuden päästä taulujen kautta, ja linjan tosisuunta, esimerkiksi 055,5°, on merkitty linjan ulommaiseen päähän. Aineisto on Väyläviraston taululinjat. Valosektorit piirretään ENC-kartan (S-52) mitoilla: sektorikaaren säde on näytöllä 20 mm ja sektorirajat ulottuvat 25 mm:iin zoomaustasosta riippumatta, kauempaa ja kapealla näytöllä hieman pienempinä. Väylän suunta on navigointilinjan virallinen tosisuunta, kun se on saatavilla, ja muuten se lasketaan linjan geometriasta. Vektoripohjalla valosektorit ja nopeusrajoitukset ovat oletuksena näkyvissä, ja muilla pohjilla ne saa päälle valikosta Näytä.

**Vesiliikennemerkit** piirretään vesiliikennelain (782/2019) 4 luvun mukaisina merkkikilpinä pienennettyinä. Kielto-, määräys-, rajoitus- ja varoitusmerkit ovat neliöitä, joissa on punaiset reunat ja valkoisella pohjalla musta kuvio, ja kieltomerkissä lisäksi punainen diagonaaliviiva. Tiedotusmerkit ovat sinisiä neliöitä, kaapeli- ja johtotaulut keltaisia suorakaiteita ja suuntamerkit punaisia ympyröitä. Rajoitusmerkeissä näkyy rajoituksen arvo, esimerkiksi nopeusrajoitus tai alikulkukorkeus. Samassa paikassa olevat merkit pinotaan tolpaksi lain järjestyksessä, jolloin esimerkiksi rajoitetun alikulkukorkeuden merkki on ilmajohtomerkin yläpuolella. Merkin napautus näyttää lajit, arvot ja lisäkilpien tekstit. Merkit näkyvät tasolta 13 ja kaapelitaulut tasolta 14. Väyläviraston rekisterissä merkin laji on vain numerokoodina, ja koodien merkitykset on päätelty rekisterin aineistosta: koodit noudattavat lain merkkien järjestystä, ja merkkien sijainnit ja lisäkilpien tekstit vahvistavat tulkinnan. Tuntematon laji näytetään yleisenä merkkinä.

**Sillat ja sulut.** Sillat, joille Väyläviraston taitorakennerekisterissä on alittavan vesiväylän alikulkukorkeus (noin 280 siltaa), piirretään INT 1:n tapaan kahtena kannen reunaviivana, joiden päät taittuvat ulospäin, ja alikulkukorkeus näkyy sillan vieressä. Rekisteri antaa vain sillan keskipisteen, joten kansi suunnataan poikki lähimmän navigointilinjan. Sulut ja avattavat sillat tulevat Väyläviraston sulkukanava-aineistosta. Avattavan sillan kannessa on aukko, ja sulun merkissä ovat kanavan seinämät ja portit. Napautus näyttää suurimman sallitun aluksen mitat, sulun mitat, putouskorkeuden ja käyttötavan. Avattavan sillan kohdalla aineiston korkeus on suurin sallittu aluksen korkeus sillan ollessa avattuna, ei suljetun sillan alikulkukorkeutta, joten sitä ei merkitä karttaan.

**Viitat ECDIS-värein.** Viitat ovat oletuksena paperikartan merkkienselityksen mukaisesti mustia. Valinta Näytä → Viitat ECDIS-värein värittää ne ECDISin (S-52, IALA A) tapaan: vasen punainen, oikea vihreä, kardinaalit keltamustina värijaksoin, karimerkki mustapunamustana, turvavesimerkki punavalkoisena ja erikoismerkki keltaisena.

Vesiliikennemerkit sekä sillat ja sulut ovat oletuksena näkyvissä vektorikartalla, ja muilla pohjilla ne saa päälle valikosta Näytä.

Vektoripohjalle voi lisätä Maanmittauslaitoksen maastotietokannasta kivet, vesikivikot ja matalikot (Näytä → Kivet, karikot ja nimistö). Maastotietokannan kivet on kartoitettu maastokartoituksessa eikä merenmittauksessa, joten ne eivät ole navigointitarkkoja.

## Laiturit ja aallonmurtajat

Vektorikartalla laiturit ja aallonmurtajat piirretään veden päälle, koska maapohjan laiturit jäisivät vektorikartan vesialueen alle. Ne näkyvät tasolta 14 alkaen. Laituriviivat ja aallonmurtajat tulevat Maanmittauslaitoksen maastotietokannasta. OpenStreetMapista lisätään alueina kartoitetut laiturit, aallonmurtajat ja pengerrykset, kun OpenStreetMapin Overpass-palvelu vastaa. Samaa laituria ei piirretä kahdesti.

Overpass on usein ruuhkainen. Ensimmäinen haku uudelle alueelle voi kestää puolikin minuuttia, ja tilarivillä lukee silloin Ladataan laitureita. Haetut alueet tallennetaan selaimeen 30 päiväksi. Kelluvat laiturit voivat olla kausittaisia. Laiturit saa pois valikosta Näytä.

## Reittisuunnittelu

Uusi reitti aloitetaan työkalupalkin reittipainikkeella, kirjaston painikkeella Uusi reitti tai näppäimillä Ctrl+R. Reittipisteet klikataan tai napautetaan kartalle. Lukemat näyttävät suunnan, legin pituuden ja kokonaismatkan. Del poistaa viimeisen pisteen, ja Esc lopettaa.

Reitti siirtyy muokkaustilaan, jonka tunnistaa ruskeasta ilmoituksesta. Muokkaustilassa reittipisteitä voi vetää. Reittiviivan valikosta (hiiren oikea painike tai pitkä painallus) lisätään reittipiste, suuntanuotti tai sivuutusetäisyys. Reittipisteen valikosta poistetaan piste, lisätään käännösetäisyys tai jatketaan reittiä.

Jokaiselle näkyvälle legille piirretään automaattisesti SARNavin tapaan suuntanuotti: kulkusuunta isolla, nuoli kulkusuuntaan sekä vastasuunta ja legin pituus. Nuotti sijoittuu legin näkyvälle osalle, ja pitkällä legillä nuotteja on useampia. Mutkikkaalla väylällä nuotit sijoitetaan pisimmistä legeistä alkaen, eikä nuottia piirretä, jos legi on näkymässä alle 60 pikseliä tai laatikko osuisi toisen päälle. Lähemmäs zoomattaessa puuttuvat nuotit tulevat näkyviin. Jokaisen käännöksen eteen piirretään seuran käytännön mukaiset merkit 2 ja 1 kaapelia ennen käännöspistettä.

Reitin ominaisuuksissa nimi muodostuu kentistä Mistä, Kautta ja Mihin. Hyväksy omaan kirjastoon kirjaa hyväksyjän ja alukset, ja hyväksytty reitti näkyy pinkkinä. Hyväksytyn reitin muokkaus aloitetaan erikseen kirjastosta, ja muutokset hyväksytään uudelleen.

Alus valitaan yläpalkista tai puhelimessa valikosta. Kirjasto näyttää valinnan mukaan joko valitun aluksen reitit tai kaikki reitit. Jos alusta ei ole valittu, kaikki hyväksytyt reitit näytetään yhdessä.

## Reititys väylää pitkin

Reitin voi myös laskea automaattisesti. Työkalupalkin reitityspainike, valikko Työkalut → Reititä väylää pitkin tai Ctrl+Shift+R avaa dialogin, jossa annetaan lähtöpiste, määränpää ja pienin kulkusyvyys. Lähtöpisteeksi voi valita oman sijainnin tai aseman, hakea paikan nimellä, poimia sen kartalta tai kirjoittaa koordinaatit. Määränpää annetaan samoilla tavoilla. Kartan oikea painike tarjoaa kohdan Reititä tähän väylää pitkin.

Tehtävälle on oma toiminto Reititä tehtävälle: työkalupalkin tehtäväreittipainike, valikko Tehtävät → Reititä tehtävälle, kirjaston Tehtävät-välilehden painike tai tehtäväpaikan valikko. Dialogissa valitaan tehtävä (aktiivinen tehtävä on valmiiksi valittuna) ja lähtöpiste, joka on oma sijainti, asema tai muu paikka. Painike Uusi tehtävä avaa tehtävälomakkeen, ja luotu tehtävä on valittuna, kun dialogiin palataan. Jos oma sijainti ei ole vielä päällä, sovellus käynnistää sen ja odottaa ensimmäistä paikannusta enintään 25 sekuntia. Reitti päättyy tehtäväpaikkaa lähimpään kelvolliseen väyläpisteeseen, ja viimeinen osuus väylältä tehtäväpaikalle lisätään tarvittaessa käsin.

Reitti kulkee aina virallista väylää pitkin. Sovellus hakee Väyläviraston navigointilinjat lähtöpisteen ja määränpään väliseltä alueelta, rakentaa niistä verkon ja hakee lyhimmän reitin. Verkkoon otetaan vain linjat, joiden kulkusyvyys on vähintään annettu pienin kulkusyvyys, joten vaatimusta ei voi rikkoa. Linjat, joilta kulkusyvyystieto puuttuu, jätetään pois, koska vaatimuksen täyttymistä ei voi silloin todentaa. Mukana ovat myös muiden väylänpitäjien, kuten kuntien, väylät, ja yhteenveto kertoo, jos reitti kulkee osin niillä. Jos reittiä ei löydy, hakualuetta laajennetaan kahdesti, koska väylä voi kiertää kauempaa kuin suora linja.

Lähtöpiste ja saapumispiste ovat lähimmät kelvolliset väyläpisteet annettujen paikkojen lähellä. Reitti alkaa ja päättyy siis väylällä, ja esimerkiksi laiturilta väylälle johtava osuus lisätään käsin. Yhteenveto kertoo, kuinka kaukana nämä pisteet ovat annetuista paikoista.

Laskettu reitti avautuu muokkaustilaan, ja sitä säädetään kuten muitakin reittejä. Kulkusyvyyttä voi muuttaa tarkastelun aikana muokkausilmoituksen painikkeesta Kulkusyvyys, yhteenvedon painikkeesta Muuta kulkusyvyyttä tai reittiviivan valikosta. Reitti lasketaan silloin uudelleen samalla lähtöpaikalla ja määränpäällä, reittipisteet korvataan ja vanhoihin legeihin viittaavat suuntanuotit sekä sivuutus- ja käännösetäisyydet poistetaan. Jos uutta reittiä ei löydy, nykyinen reitti säilyy. Reititysparametrit tallentuvat reitille, joten kulkusyvyyden voi vaihtaa myöhemminkin kirjastosta avattuun reittiin. Reittipisteet ovat väyläaineiston pisteitä, ja ne näkyvät kiinnitettyinä. Suorat jatkokohdat ja kaarien välipisteet on harvennettu niin, että reittiviiva poikkeaa navigointilinjasta enintään kymmenen metriä, mikä pysyy väyläalueen sisällä. Pistokokeessa Helsingistä Porkkalaan (25 mpk) reitti laskettiin alle sekunnissa, ja Helsingin saariston mutkikkaalla väylällä reittiin jäi noin 50 legiä. Yhteenveto näyttää reitin pienimmän kulkusyvyyden, käytetyt väylät kulkusyvyyksineen ja osuuksineen sekä muistutuksen, että reitti tarkistetaan ennen käyttöä. Samat tiedot kirjataan reitin huomioihin. Oletuksena pienin kulkusyvyys on aluksen turvasyvyys.

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

Yläpalkin hakukenttään voi kirjoittaa paikannimen, turvalaitteen nimen tai numeron, väylän, sulun, kanavan tai avattavan sillan nimen, luotsipaikan tai VTS-ilmoittautumispisteen nimen, oman merkin tai tehtävän nimen tai koordinaatin. Paikannimet haetaan Maanmittauslaitoksen nimistörekisteristä, turvalaitteet, väylät, sulut ja sillat Väyläviraston aineistosta sekä luotsipaikat ja VTS-ilmoittautumispisteet Traficomin avoimesta aineistosta. Haku ei lue nimiä karttakuvasta, joten se toimii samoin rasteri-, ENC- ja vektoripohjalla. Väylän valinta korostaa koko väylän ja sovittaa sen näkymään. Jos paikannimiä ei tule, hakutulosten alla kerrotaan syy: tiedostoversiossa puuttuva API-avain tai verkkoversiossa julkaisu, jonka palvelimelle ei ole asetettu avainta (Vercelin ympäristömuuttuja `MML_API_KEY` pitää olla käytössä myös Preview-ympäristössä, jotta haaran esikatselujulkaisussa nimistöhaku toimii).

Hakusanaksi riittää nimen alku: viitas löytää sekä Viitasaaret että Viitasalmet. Lähialueelta haetaan myös nimen keskeltä, joten salmi löytää esimerkiksi lähellä olevan Viitasalmen.

Samannimisiä paikkoja on paljon, joten tulokset näytetään kartalla numeroituina ja listassa lähimmät ensin.
- Jokaisella rivillä on paikan laji tai kunta sekä etäisyys meripeninkulmina ja suunta kartan keskeltä.
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

## Oma sijainti

Työkalupalkin sijaintipainike näyttää laitteen sijainnin sinisenä pisteenä ja tarkkuuden vaaleana ympyränä. Liikkeessä pisteen edessä on kulkusuunnan nuoli, ja lukemissa näkyvät sijainti, nopeus solmuina, kulku ja tarkkuus.

Puhelimessa sijainti käynnistyy, kun sovellus avataan, ja selain kysyy luvan ensimmäisellä kerralla. Tietokoneella sijainti käynnistetään painikkeesta. Kun seuranta on päällä, painike keskittää kartan sijaintiin, jos piste on näkymän ulkopuolella, ja muuten lopettaa seurannan. Jos käyttäjä lopettaa seurannan tai kieltää luvan, sovellus muistaa valinnan eikä käynnistä sijaintia enää itsestään.

iPhonessa sijainnin pitää olla sallittu myös kohdassa Asetukset → Tietosuoja ja suojaus → Sijaintipalvelut → Safarin verkkosivustot. Selain antaa sijainnin vain suojatulle https-sivulle, joten sijainti toimii verkkoversiossa.

## Työkalut ja pikanäppäimet

| Näppäin | Toiminto |
|---|---|
| Ctrl+R | Uusi reitti |
| M | Harppi: matka usean legin kautta, ja sen voi muuttaa reitiksi |
| F6 | Suuntima: tosisuuntima ja etäisyys asemalta tai valitusta pisteestä |
| R, E, Shift+E, V | Karttapohjaksi rasteri, ENC, ENC ECDIS-symbolein tai vektori |
| Del | Poistaa viimeisen reittipisteen |
| Esc | Lopettaa työkalun tai muokkauksen |
| Alt | Ohittaa väyläkiinnityksen |
| Kaksoisklikkaus | Keskittää kartan |
| Oikea painike | Kartan valikko: merkit, tehtäväpaikat, asema, harppi, suuntima ja koordinaattien kopiointi |

Työkalupalkissa ovat myös painikkeet, joilla reittinuotit ja sivuutusetäisyydet kytketään näkyviin tai pois, sekä lippupainike, jolla lisätään oma merkki. Omia merkkejä on monta lajia: yleinen merkki, havaintopiste, kivi tai vaara, matala, lateraali- ja kardinaalimerkit, nopeusrajoitus sekä huolto tai laituri. Valikossa Näytä ovat myös yönäyttö ja karttareunuksen minuuttiasteikko.

## Puhelin ja tabletti

Kapeassa näytössä valikot ovat vasemman yläkulman valikkonapin takana, ja samasta valikosta valitaan alus ja näytettävät reitit. Puhelimessa valikko avautuu yläreunasta levynä, jossa on Takaisin ja Sulje. Näytä-valikko on jaettu osioihin: Karttapohja, Syvä vesi, Väylät merkit ja valot, Reitit sekä Maapohja ja näyttö.

Kirjasto avautuu näytön alaosaan ja sulkeutuu itsestään, kun reitti tai muokkaus aloitetaan. Kun kirjasto on auki, kartta keskitetään sen yläpuolelle jäävään osaan, ja valitun reitin toimintopainikkeet ovat heti nimen alla.

Karttaa zoomataan nipistämällä, ja pitkä painallus vastaa hiiren oikeaa painiketta. Reittipisteitä lisättäessä ja harpilla mitattaessa ylhäällä ovat painikkeet Poista viimeinen ja Valmis, ja lukemat näyttävät juuri lisätyn välin suunnan ja pituuden. Kosketuskohteet ovat vähintään 40 pikselin kokoisia.

## SARNav ja GPX

Reitti viedään GPX-tiedostoksi reitin valikosta tai reittikirjastosta, ja koko kirjaston voi viedä kerralla. Reittipisteet siirtyvät OpenCPN-pohjaiseen ohjelmaan, kuten SARNaviin. Suuntanuotit, sivuutus- ja käännösetäisyydet sekä hyväksyntätiedot tallentuvat tiedostoon sovelluksen omana lisäosana, ja ne palautuvat vain tähän sovellukseen tuotaessa. SARNavista viety GPX-reitti tuodaan valikosta Tiedosto → Tuo GPX.

## Aineistot ja lisenssit

| Aineisto | Lähde | Lisenssi |
|---|---|---|
| Rasterimerikartat | Traficom, rasteripalvelu (WMTS) | CC BY 4.0, ei navigointikäyttöön |
| ENC-karttapohja | Traficom, S-57 WMS | CC BY 4.0, ei navigointikäyttöön |
| Syvyysalueet, -käyrät ja -luvut | Traficomin merikarttatietokanta (INSPIRE-palvelu) | Traficomin hydrografisen aineiston lisenssi: muuhun kuin navigointiin ja ei-kaupallisesti, lähdemerkintä tiedonsiirron ajankohtineen |
| Väylät, turvalaitteet, loistot, valosektorit, vesiliikennemerkit, nopeusrajoitukset, sulut ja avattavat sillat | Väylävirasto, avoin rajapinta | CC BY 4.0 |
| Siltojen alikulkukorkeudet | Väylävirasto, taitorakennerekisteri (avoin rajapinta) | CC BY 4.0 |
| Luotsipaikat ja VTS-ilmoittautumispisteet (haku) | Traficom, avoin INSPIRE-palvelu | CC BY 4.0 |
| Kivet, karikot, laiturit, aallonmurtajat ja paikannimet | Maanmittauslaitos, maastotietokanta ja nimistörekisteri (OGC API Features) | CC BY 4.0 |
| Maanmittauslaitoksen taustakartta | Maanmittauslaitos, kartat.kapsi.fi | CC BY 4.0 |
| Maapohja ja laiturialueet | OpenStreetMap-tekijät, tiilet ja Overpass-rajapinta | ODbL |
| Kuntien nimet | Tilastokeskus, kuntaluokitus 2025 | CC BY 4.0 |
| Karttakirjasto | Leaflet 1.9.4 | BSD-2 |

Lisenssiteksti ja lähdemerkinnät ovat sovelluksessa kohdassa Ohje → Aineistot ja käyttöehdot.

Traficom edellyttää merikartta-aineistolle lähdemerkintää muodossa: *Lähde: Liikenne- ja viestintävirasto. Ei navigointikäyttöön. Ei täytä asianmukaisen merikartan vaatimuksia.* Merkintä on sovelluksen Tietoja-ikkunassa ja kohdassa Aineistot ja käyttöehdot.

## Lisenssi

Sovelluksen oma koodi on lisensoitu ehdoilla **PolyForm Noncommercial 1.0.0**. Lisenssiteksti on tiedostossa `LICENSE.md` ja osoitteessa https://polyformproject.org/licenses/noncommercial/1.0.0. Koodia saa vapaasti kopioida, muokata ja jakaa ei-kaupalliseen tarkoitukseen. Yleishyödylliset yhteisöt, julkisen turvallisuuden organisaatiot, oppilaitokset ja viranomaiset saavat käyttää sitä rahoituksestaan riippumatta, joten esimerkiksi Meripelastusseura ja sen yhdistykset voivat ottaa sovelluksen käyttöön ilman erillistä lupaa. Kaupallinen käyttö vaatii luvan tekijältä.

Required Notice: Copyright 2026 Jussi Vaahtikari

Ei-kaupallinen rajaus vastaa sovelluksen käyttämän aineiston ehtoja. Traficomin syvyysaineiston lisenssi sallii aineiston hyödyntämisen vain ei-kaupallisesti ja muuhun kuin navigointiin, joten vapaampi koodilisenssi antaisi luvan, jota sovellus ei aineistonsa puolesta voi käyttää. Lisenssi ei ole OSI:n määritelmän mukainen avoimen lähdekoodin lisenssi, vaikka lähdekoodi on julkinen.

Lisenssi koskee vain sovelluksen omaa koodia. Kartta-aineistot ovat omien lisenssiensä alaisia (taulukko edellä), ja mukana tuleva Leaflet on BSD-2-lisensoitu; sen tekijänoikeusilmoitus säilyy kirjaston alussa. SARNav on Meripelastusseuran ohjelma, ja nimeä käytetään tässä vain kuvailevasti.

OpenStreetMapin palvelimet estävät karttatiilet sivuilta, jotka eivät lähetä Referer-tietoa, eikä tiedostona avattu sivu lähetä sitä. Siksi sovellus hakee OSM-tiilet erikseen ja tunnistaa itsensä X-Requested-With-otsakkeella. Jos tiilet näkyvät joskus Access blocked -ruutuina, maapohjaksi voi valita Maanmittauslaitoksen taustakartan.

## Repon rakenne

| Polku | Sisältö |
|---|---|
| `index.html` | Koko sovellus yhtenä tiedostona. Vercel julkaisee tämän. |
| `api/mml.js` | Vercelin palvelinfunktio: välityspalvelu Maanmittauslaitoksen rajapintaan |
| `README.md` | Tämä ohje (kopio tiedostosta `lahdekoodi/LUEMINUT.md`) |
| `LICENSE.md` | Koodin lisenssi, PolyForm Noncommercial 1.0.0 |
| `lahdekoodi/index.html`, `lahdekoodi/css/app.css` | Sovelluksen runko ja tyylit |
| `lahdekoodi/js/app.js` | Käynnistys, valikot, näppäimet, oma sijainti ja asetukset |
| `lahdekoodi/js/chart.js` | Karttapohjat, vektorikartta, väylätiedot, valot, Maanmittauslaitoksen aineistot ja laiturit |
| `lahdekoodi/js/symbols.js` | Suomen merikarttojen karttamerkit |
| `lahdekoodi/js/signs.js` | Vesiliikennemerkit vesiliikennelain mukaisina kilpinä |
| `lahdekoodi/js/rastersharp.js` | Merikarttarasterin terävä suurennus |
| `lahdekoodi/js/routes.js` | Reittisuunnittelu ja hyväksyntä |
| `lahdekoodi/js/routing.js` | Automaattinen reititys väylää pitkin: verkko navigointilinjoista, kulkusyvyysrajoite, lyhimmän reitin haku ja dialogi |
| `lahdekoodi/js/tools.js` | Harppi, suuntima, omat merkit, tehtäväpaikat ja asema |
| `lahdekoodi/js/search.js` | Paikkahaku |
| `lahdekoodi/js/library.js` | Reittikirjasto |
| `lahdekoodi/js/gpx.js` | GPX-tuonti ja -vienti |
| `lahdekoodi/js/geo.js` | Suunnat, matkat ja koordinaattien muotoilu |
| `lahdekoodi/js/store.js` | Tila ja tallennus selaimeen |
| `lahdekoodi/js/ui.js` | Valikot, dialogit, ilmoitukset ja lukemat |
| `lahdekoodi/lib/` | Leaflet 1.9.4 (BSD-2) |
| `lahdekoodi/build.py` | Kokoaa yhden tiedoston version |
| `lahdekoodi/tests/` | Käyttöliittymätestit |

## Julkaisu Verceliin

Vercel-projekti on kytketty tähän repoon, ja jokainen `main`-haaraan tuleva commit julkaistaan automaattisesti osoitteeseen https://reittikartta-6qn2.vercel.app. Vercel julkaisee repon juuren `index.html`-tiedoston sellaisenaan, eikä palvelimella ajeta koontivaihetta.

Maanmittauslaitoksen avoin rajapinta vaatii API-avaimen. Verkkoversiossa avain on Vercelin ympäristömuuttujassa `MML_API_KEY` (Settings → Environment Variables), eikä se näy sivun koodissa. Avaimen muuttamisen jälkeen projekti julkaistaan uudelleen (Redeploy).

Sovellus kutsuu Maanmittauslaitosta osoitteen `/api/mml` kautta. Välityspalvelu lisää avaimen ja välittää vain sovelluksen käyttämät polut (maastotiedot ja nimistö). Vastaukset tallentuvat Vercelin välimuistiin vuorokaudeksi. Jos avainta ei ole asetettu, palvelu vastaa koodilla 503. Sovellus toimii silloin ilman Maanmittauslaitoksen aineistoja, ja käyttäjä voi syöttää oman avaimen asetuksiin.

Käytännön huomio: Vercel ei julkaissut committeja, joiden tekijän sähköpostiosoite ei ollut liitetty Vercel-tiliin. Commitit tehdään siksi tilin osoitteella.

## Kehitys ja testaus

Lähdekoodia muokataan kansiossa `lahdekoodi`. Yhden tiedoston versio kootaan komennolla `python3 build.py`. Se kirjoittaa tiedoston `dist/Reittikartta.html`, joka kopioidaan repon juureen nimelle `index.html`. Kopioi myös `LUEMINUT.md` juureen nimelle `README.md`.

Testit ajetaan Playwrightilla (Python), ja verkkopalvelut korvataan niissä testiaineistolla (`tests/run_ui.py` ja `tests/mockdata.py`). Testi ajetaan komennolla `python3 tests/<testi>.py`. Testattava sivu annetaan ympäristömuuttujalla `TARGET`. Puhelintesteissä laiteprofiili valitaan muuttujalla `DEVICE`, esimerkiksi `DEVICE="iPhone 15"` (WebKit) tai `DEVICE="Pixel 7"` (Chromium).

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
| `task_gps_test.py` | Tehtäväpaikan haku, merimailit ja oma sijainti |
| `pier_gps_test.py` | Laiturit sekä oma sijainti puhelimessa |
| `proxy_test.py` | Maanmittauslaitoksen välityspalvelu |
| `mobile_test.py`, `iphone_test.py` | Puhelinasettelu ja kosketuskäyttö |

## Tunnetut rajoitukset

- **Laitekohtaiset tiedot:** reitit ja merkit eivät ole jaettuja käyttäjien tai laitteiden kesken, vaan ne siirretään varmuuskopiolla.
- **ENC:n kattavuus:** ENC-aineistoa ei ole kaikilla vesillä, esimerkiksi Näsijärvellä.
- **Syvyysvälit:** vektorikartan ja syvän veden syvyysvälit ovat paikoin karkeita.
- **Reititys:** reitti alkaa ja päättyy väylällä, eikä se huomioi väylän ulkopuolisia vesialueita, nopeusrajoituksia, siltojen alikulkukorkeuksia tai kanavia. Linjat ilman kulkusyvyystietoa eivät kelpaa. Hakualue on enintään noin 4° × 2,5°, joten hyvin pitkä matka jaetaan osiin.
- **Overpass:** OpenStreetMapin Overpass-palvelu on usein ruuhkainen, jolloin OpenStreetMapin laiturialueet tulevat viiveellä tai jäävät tulematta. Maanmittauslaitoksen laituriviivat näkyvät silti.
- **Paikannimihaku:** nimistörekisterin paikan lajia ei vielä näytetä tuloksissa sanallisesti, vaan rivillä on kunta. Väylät, sulut ja sillat haetaan vain Väyläviraston aineistosta ja luotsipaikat Traficomin aineistosta, joten muiden toimijoiden kohteet voivat puuttua.
