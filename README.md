# Reittikartta

Selainpohjainen reittisuunnittelun työkalu suomalaisella merikartalla. Toiminnot mukailevat Meripelastusseuran SARNav-karttaohjelmaa, mutta sovellus ei ole SMPS:n virallinen ohjelma.

## Käyttö

Avaa tiedosto **Reittikartta.html** tuplaklikkaamalla. Asennuksia ei tarvita. Kartta ja väylätiedot haetaan verkosta, joten koneen pitää olla verkossa.

Reitit, merkit ja tehtävät tallentuvat selaimen muistiin tällä koneella ja tällä selaimella. Tee varmuuskopio valikosta Tiedosto → Tee varmuuskopio, koska selaimen tietojen tyhjennys poistaa ne. Varmuuskopion voi palauttaa samasta valikosta myös toiselle koneelle.

Pikaohje on sovelluksessa valikossa Ohje → Pikaohje.

## Puhelin ja tabletti

Sovellus mukautuu kapeaan näyttöön. Valikot ovat vasemman yläkulman valikkonapin takana, ja samasta valikosta valitaan alus ja näytettävät reitit. Puhelimessa valikko avautuu yläreunasta levynä, jossa on Takaisin ja Sulje, ja Näytä-valikko on jaettu osioihin (Karttapohja, Syvä vesi, Väylät merkit ja valot, Reitit sekä Maapohja ja näyttö). Jos valintoja on näkyvän osan alapuolella, levyn alareunassa lukee siitä. Kirjasto avautuu näytön alaosaan ja sulkeutuu itsestään, kun aloitat reitin tai muokkauksen. Kun kirjasto on auki, kartta keskitetään sen yläpuolelle jäävään osaan, ja valitun reitin toimintopainikkeet ovat heti nimen alla. Karttaa zoomataan nipistämällä, ja pitkä painallus vastaa hiiren oikeaa painiketta. Reittipisteitä lisättäessä ja harpilla mitattaessa ylhäällä ovat painikkeet Poista viimeinen ja Valmis, ja lukemat näyttävät juuri lisätyn välin suunnan ja pituuden. Lukemalaatikko, mittakaava ja vastuuvapausteksti eivät estä napauttamasta karttaa niiden kohdalta.

Tiedoston avaaminen puhelimessa riippuu laitteesta. Androidissa tiedoston voi yleensä avata Chromella puhelimen tiedostoista. iPhonen Safari ei aja tiedostoon kirjoitettua ohjelmaa, kun HTML-tiedosto avataan Tiedostot-sovelluksesta, joten iPhonessa sovellus tarvitsee verkko-osoitteen. Reitit tallentuvat kunkin laitteen omaan selaimeen, joten puhelimen ja tietokoneen välillä ne siirretään varmuuskopiolla (Tiedosto → Tee varmuuskopio ja Palauta varmuuskopio).

## Aineistot

Merikartat ovat Traficomin rasterimerikarttoja (rasteripalvelu, CC BY 4.0). Kartan tarkin taso on 15. Tasot 16–17 piirretään saman aineiston terävöitettynä suurennoksena: sovellus tunnistaa kartan omat värit ja piirtää värirajat uudelleen terävinä, mutta tarkkuutta ei synny lisää. Tarkalla näytöllä (esimerkiksi Windowsin 125 % tai 150 % skaalaus) tasoilla 14 ja sitä kauempana kuva kootaan yhtä tasoa tarkemmista tiilistä ja pienennetään, mikä on terävämpi kuin karkeamman tiilen venyttäminen. Kartta on terävimmillään, kun selaimen oma zoomaus on 100 % (Ctrl+0), koska muuten selain joutuu skaalaamaan karttakuvaa. Karttaa zoomataan hiiren rullalla.

Traficomin rasterissa näkyy paikoin karttalehtien rajaviivoja, esimerkiksi keltainen viiva, jonka alla on musta viiva. Ne ovat Traficomin aineistossa sellaisenaan eivätkä tämän sovelluksen piirtämiä.

Rasterikartta on skannattu paperikartta, joten se näkyy terävänä vain omassa mittakaavassaan. Näytöllä yksi pikseli vastaa tasolla 14 noin 4,5:tä metriä ja tasolla 15 noin 2,3:a metriä, ja lähempänä kuva on suurennos. Siksi valikosta Näytä voi valita myös **vektorikartan**. Siinä vesialueet, syvyysvyöhykkeet (0–3, 3–6, 6–10 ja yli 10 m), syvyyskäyrät, rantaviiva ja syvyysluvut piirretään Traficomin merikarttatietokannasta palvelimen kuvina jokaisella zoomaustasolla erikseen. Väylälinjat, väyläalueet ja turvalaitteet tulevat Väyläviraston aineistosta, ja maalla näkyy Maanmittauslaitoksen taustakartta. Vektorikartta on terävä kaikilla tasoilla ja kattaa myös Näsijärven, mutta siitä puuttuvat paperikartan nimistö ja erikoismerkinnät. Periaate on sama kuin esimerkiksi Loisto Marinerissa, mutta tässä käytetään Traficomin maksutonta rajattua aineistoa, jonka syvyysvälit ovat paikoin karkeita.

Rasteri- ja ENC-pohjaa näytetään tasolle 17 asti. Kun zoomaat sitä lähemmäs, kartta vaihtuu itsestään vektorikarttaan, jota voi suurentaa tasolle 20 asti, eli näytön leveydellä noin sataan metriin. Uloszoomatessa palataan valittuun pohjaan. Suurennus ei tee aineistosta tarkempaa kuin se on, vaan syvyysalueiden ja rantaviivan tarkkuus on merikarttatietokannan tarkkuus.

Kartan esitystavan vaihtaa kartan yläreunan painikkeilla Rasteri, ENC, ECDIS ja Vektori. Valittu pohja on korostettu, ja kun vektorikartta on vaihtunut itsestään tason 17 jälkeen, Vektori-painike näkyy katkoviivoitettuna. Samat valinnat ovat valikossa Näytä ja näppäimissä R, E, Shift+E ja V. Jos rasteri tai ENC valitaan tasoa 17 lähempänä, kartta zoomataan tasolle 17, jotta valittu pohja näkyy.

ENC-karttapohjan voi valita valikosta Näytä. Se tulee Traficomin S-57 WMS -palvelusta (CC BY 4.0, ei navigointikäyttöön), joka piirtää ENC-aineiston kuvaksi pyydetyssä mittakaavassa. Siksi ENC on terävä kaikilla tasoilla, ja väylät, turvalaitteet ja rantaviiva ovat ENC:n mukaisissa paikoissa. Valittavana on perinteiset (paperikartan) symbolit tai ECDIS-symbolit. ENC kattaa rannikon ja osan sisävesistä, esimerkiksi Saimaan alueen. Näsijärvellä ENC-aineistoa ei ole (tarkistettu 18.10.2026). Missä aineistoa ei ole, sovellus näyttää rasterikartan ja kertoo siitä kartan oikeassa yläkulmassa.

Väylien suunnat, kulkusyvyydet, turvalaitteet ja vesiliikennemerkit tulevat Väyläviraston avoimesta rajapinnasta (CC BY 4.0). Suunta on navigointilinjan virallinen tosisuunta, kun se on saatavilla, ja muuten se lasketaan linjan geometriasta.

**Ei navigointikäyttöön.** Traficomin määritelmän mukaan reitin suunnittelu on navigointikäyttöä, johon avoin aineisto ei ole tarkoitettu. Ajettavat reitit tarkistetaan ja hyväksytään SARNavissa virallista ENC-karttaa vasten.

## Paikkahaku ja koordinaatit

Yläpalkin hakukenttään voi kirjoittaa paikannimen, turvalaitteen nimen tai numeron, oman merkin tai tehtävän nimen tai koordinaatin. Turvalaitteet haetaan Väyläviraston aineistosta. Paikannimet haetaan Maanmittauslaitoksen nimistörekisteristä, mikä vaatii Maanmittauslaitoksen maksuttoman API-avaimen (Tiedosto → Asetukset).

Hakusanaksi riittää nimen alku: viitas löytää sekä Viitasaaret että Viitasalmet. Lähialueelta haetaan myös nimen keskeltä, joten salmi löytää esimerkiksi lähellä olevan Viitasalmen. Samannimisiä paikkoja on paljon, joten tulokset näytetään kartalla numeroituina ja listassa lähimmät ensin. Alle 27 meripeninkulman (50 km) päässä kartan keskeltä olevat ovat omana ryhmänään, ja jokaisella rivillä on etäisyys merimaileina ja suunta kartan keskeltä. Jos lähialueen tuloksia ei näy kartalla, kartta siirtyy niihin. Näytä kartalla -painike (tai Enter) näyttää kaikki lähialueen tulokset. Tuloksen voi valita listasta tai klikkaamalla sen numeroa kartalla. Numerot jäävät kartalle vertailua varten, kunnes paikka valitaan tai painetaan Esc.

Koordinaatissa asteen ja minuutin merkit voi korvata välilyönneillä. Heti perään kirjoitettu N tai E päättää luvun, joten 61 35,1N tarkoittaa 61°35,1′N, 61 35 11N tarkoittaa 61°35′11″N ja 61,5N tarkoittaa 61°30′N. Leveys ja pituus erotetaan välilyönnillä tai pilkulla, esimerkiksi 61 35,1N 23 45,6E. Tehtävän sijaintikentän alla näkyy heti, miten syöte tulkittiin.

Uutta tehtävää luotaessa paikan voi hakea lomakkeen kentästä Hae paikka samalla tavalla kuin yläpalkista. Kun osuma valitaan, lomake väistyy ja paikka näytetään kartalla magentalla renkaalla. Muut osumat näkyvät numeroituina, ja numeron napautus vaihtaa paikan. Paikkaa voi tarkentaa vetämällä rengasta tai napauttamalla karttaa. Vahvista paikka palaa lomakkeelle uusi paikka valittuna, ja tehtävä luodaan vasta painikkeesta Luo tehtävä. Takaisin palaa lomakkeelle muuttamatta paikkaa.

## Oma sijainti

Työkalupalkin sijaintipainike näyttää laitteen oman sijainnin sinisenä pisteenä ja tarkkuuden vaaleana ympyränä. Liikkeessä pisteen edessä on kulkusuunnan nuoli, ja lukemissa näkyvät sijainti, nopeus solmuina, kulku ja tarkkuus. Selain kysyy luvan ensimmäisellä kerralla. Sijaintia ei tallenneta eikä lähetetä minnekään. Kun seuranta on päällä, painike keskittää kartan sijaintiin, jos se on näkymän ulkopuolella, ja muuten lopettaa seurannan. Sijainti toimii verkkoversiossa. Tiedostona avatussa sivussa selain ei välttämättä anna sijaintia.

## Reitin suunnat ja käännösmerkit

Jokaiselle kuvassa näkyvälle legille piirretään automaattisesti SARNavin tapaan suuntanuotti: kulkusuunta isolla, nuoli kulkusuuntaan sekä vastasuunta ja legin pituus. Nuotti sijoittuu aina legin näkyvälle osalle, myös kun legin keskikohta on ruudun ulkopuolella, ja pitkällä legillä nuotteja on useampia. Jokaisen käännöksen eteen piirretään seuran käytännön mukaiset merkit 2 ja 1 kaapelia ennen käännöspistettä, merkittyinä numeroilla 2 ja 1. Sivuutus- ja käännösetäisyydet maamerkkeihin lisätään edelleen käsin reitin muokkaustilassa. Kaikki voi kytkeä pois valikosta Näytä.

## Karttamerkit

Kivet, turvalaitteet ja valot piirretään Suomen merikarttojen merkeillä Traficomin virallisen merkkienselityksen mukaan, samoin kuin rasterikartassa. Vedenpäällinen kivi on ⊥, vedenrajassa oleva kivi + ja vedenalainen kivi ⊤. Kivikossa samoissa merkeissä on pisteet sivuilla. Vesikivikot ja matalikot rajataan mustalla pisteviivalla (vaarakäyrä). Viitat ovat mustia varsia, joiden alapäässä on asemaympyrä ja yläpäässä huippumerkki: vasen sylinteri, oikea kartio, kardinaalimerkeissä kaksi kartiota, karimerkissä kaksi palloa, turvavesimerkissä pallo ja erikoismerkissä risti. Kummeli, tunnusmajakka ja linjamerkki ovat omilla merkeillään. Merkkien selitys on myös sovelluksen pikaohjeessa.

## Loistot, valosektorit ja muut väylätiedot

Jokaisella loistolla, apuloistolla ja valaistulla viitalla on valon värinen pisara, ja valkoinen valo on keltainen kuten merikartassa. Sektoriloistoilla näytetään lisäksi sektorit värikaarina. Valotiedot tulevat Väyläviraston turvalaite- ja loistorekistereistä, myös muiden väylänpitäjien laitteista.


Väyläviraston avoimesta rajapinnasta näytetään loistojen valosektorit värikaarina (valkoinen, keltainen, vihreä, punainen) ja sektorirajat katkoviivoina, valotunnus (esimerkiksi VQ (3) 5 s), nopeusrajoitusalueet sekä muiden väylänpitäjien, kuten kaupunkien, väylät ja turvalaitteet. Sektorien kulmat ovat loistoluettelon tapaan merelle päin katsottuina. Vektoripohjalla nämä ovat oletuksena näkyvissä, ja muilla pohjilla ne saa päälle valikosta Näytä.

## Maapohja ja Maanmittauslaitoksen aineistot

Maapohja on oletuksena OpenStreetMap, jotta vektorikartalla näkyvät maa-alueiden paikannimet. Tilalle voi valita Maanmittauslaitoksen taustakartan (valikko Näytä). OpenStreetMapin palvelimet estävät karttatiilet sivuilta, jotka eivät lähetä Referer-tietoa, ja tiedostona avattu sivu ei sitä lähetä. Siksi sovellus hakee OSM-tiilet erikseen ja tunnistaa itsensä X-Requested-With-otsakkeella, jonka OSM hyväksyy tällaisille sovelluksille. Jos OSM muuttaa käytäntöään ja tiilet näkyvät taas Access blocked -ruutuina, käytä Maanmittauslaitoksen maapohjaa. Vektoripohjalle voi lisätä Maanmittauslaitoksen maastotietokannasta vedenalaiset (⊤), vedenpinnassa olevat (+) ja vedenpäälliset (⊥) kivet, vesikivikot ja matalikot, ja OpenStreetMap-maapohjalla myös nimistörekisterin nimet. Verkkoversiossa nämä toimivat ilman omaa avainta. Tiedostona avattu versio tarvitsee Maanmittauslaitoksen maksuttoman API-avaimen, joka syötetään kohtaan Tiedosto → Asetukset. Aineistot ovat CC BY 4.0 -lisensoituja. Maastotietokannan kivet on kartoitettu maastokartoituksessa, eivät merenmittauksessa, joten ne eivät ole navigointitarkkoja.

## Laiturit ja aallonmurtajat

Vektorikartalla laiturit, aallonmurtajat ja pengerrykset haetaan OpenStreetMapista ja piirretään veden päälle, koska maapohjan laiturit jäisivät vektorikartan vesialueen alle. Ensimmäinen haku uudelle alueelle voi kestää OSM:n Overpass-palvelimen kuormasta riippuen puolikin minuuttia, ja tilarivillä lukee silloin Ladataan laitureita. Haetut alueet tallennetaan selaimeen 30 päiväksi, joten seuraavalla kerralla ne näkyvät heti. OpenStreetMap on vapaaehtoisten kartoittama, joten laiturit ovat yleensä oikeissa paikoissa, mutta niitä ei ole tarkastettu merenkulun tarpeisiin, ja kelluvat laiturit voivat olla kausittaisia. Laiturit saa pois valikosta Näytä.

## Syvä vesi ja turvasyvyys

Työkalurivin aaltopainike tai valikko Näytä → Syvä vesi värittää vesialueet aluksen turvasyvyyden mukaan. Turvasyvyyttä syvempi vesi näkyy vaaleana, varottava vesi sinisenä, ja niiden välinen raja eli turvakäyrä tummana viivana. Turvasyvyys on syväys lisättynä pohjavaralla, ja se asetetaan aluskohtaisesti valikosta Näytä → Aseta turvasyvyys.

Logiikka vastaa ECDISin turvakäyrää. Alue on syvää vettä, kun sen pienin syvyys on vähintään turvasyvyys, joten raja asettuu aineiston lähimpään syvyyskäyrään, joka on vähintään turvasyvyys. Esimerkiksi turvasyvyys 2,4 m tarkoittaa, että 3 metrin käyrä toimii rajana. Kartan oikeassa yläkulmassa näkyy, mikä käyrä on rajana nykyisessä näkymässä.

Syvyysalueet tulevat Traficomin merikarttatietokannasta (INSPIRE-palvelu), joten rajat ovat syvyystietokannan mukaiset eivätkä rasterikartan piirroksen. Aineiston syvyysvälit vaihtelevat alueittain. Näsijärvellä välit ovat 0–3, 3–6, 6–10, 10–20 ja 20–50 m, mutta esimerkiksi Helsingin edustalla vain 0–10, 10–20 ja 20–50 m. Karkealla alueella osa turvasyvyyttä syvemmästäkin vedestä näkyy varottavana, ja sovellus kertoo siitä. Aineiston lisenssi sallii käytön muuhun kuin navigointiin ja ei-kaupallisesti, ja se edellyttää lähdemerkinnän tiedonsiirron ajankohtineen. Lisenssiteksti on sovelluksessa kohdassa Ohje → Aineistot ja käyttöehdot.

## Sijaintitarkkuus ja väyläkiinnitys

Rasterimerikartta on skannattu paperikartta, eikä sen piirros osu täsmälleen samaan kohtaan kuin ENC-kartta. Pistokokeissa (lokakuu 2026, 8 aluetta) väylälinjan paikka rasterikartalla poikkesi ENC:stä tyypillisesti noin 5 metriä ja suurimmillaan noin 16 metriä Savonlinnan Kyrönsalmessa, jossa rasterin piirros ei myöskään seurannut nykyistä väylää. Näsijärvellä poikkeama oli järjestelmällinen, noin 5–6 metriä luoteeseen. Väyläviraston navigointilinjat poikkesivat ENC:stä noin 1–2 metriä, mikä on mittaustarkkuuden luokkaa.

Tämän vuoksi reittipisteet kiinnittyvät automaattisesti väylän käännöspisteisiin ja navigointilinjoihin Väyläviraston aineistosta, kun piste lisätään tai siirretään lähelle niitä. Kiinnitys näkyy magentana renkaana, ja reittikirjasto kertoo, moniko reitin pisteistä on kiinnitetty. Alt-näppäin ohittaa kiinnityksen, ja sen voi kytkeä pois valikosta Näytä. Kiinnitys toimii tasolta 11 alkaen alueilla, joilla Väyläviraston navigointilinjoja on. Väylän ulkopuolelle sijoitettu vapaa piste perii rasterikartan virheen.

Sivuutus- ja käännösetäisyyksien kohteet kiinnittyvät samalla periaatteella lähimpään Väyläviraston turvalaitteeseen (viitta, poiju, loisto, kummeli, linjamerkki) tasolta 12 alkaen. Kun kohdetta valitaan tai sen kahvaa vedetään, kiinnitettävät turvalaitteet näkyvät magentoina renkaina ja lukemissa näkyy turvalaitteen nimi ja laji. Etäisyys lasketaan silloin rekisterin koordinaatista eikä rasterikartan symbolista. Alt-näppäin ohittaa kiinnityksen, ja maamerkki, jota rekisterissä ei ole (esimerkiksi niemenkärki), jää rasterikartan tarkkuuden varaan. Turvalaitteiden sijainteja ei mitattu erikseen ENC:tä vasten, joten niiden osalta vastaavuus perustuu siihen, että sama rekisteri näkyi väylälinjoissa 1–2 metrin päässä ENC:stä.

## SARNav ja GPX

Reitti viedään GPX-tiedostoksi reitin valikosta tai reittikirjastosta. Reittipisteet siirtyvät OpenCPN-pohjaiseen ohjelmaan. Suuntanuotit, sivuutus- ja käännösetäisyydet sekä hyväksyntätiedot tallentuvat tiedostoon sovelluksen omana lisäosana, ja ne palautuvat vain tähän sovellukseen tuotaessa. SARNavista viety GPX-reitti tuodaan valikosta Tiedosto → Tuo GPX.

## Lähdekoodi

Kansio `lahdekoodi` sisältää sovelluksen erillisinä tiedostoina:

- `index.html`, `css/app.css` ja `js/` – sovellus
- `js/rastersharp.js` – merikarttarasterin terävä suurennus
- `js/chart.js` – karttapohja, väylien suunnat ja turvalaitteet
- `js/routes.js` – reittisuunnittelu ja hyväksyntä
- `lib/` – Leaflet 1.9.4
- `build.py` – kokoaa yhden tiedoston version (`python3 build.py` → `dist/Reittikartta.html`)
- `tests/` – käyttöliittymätesti, jossa verkkopalvelut korvataan testiaineistolla
