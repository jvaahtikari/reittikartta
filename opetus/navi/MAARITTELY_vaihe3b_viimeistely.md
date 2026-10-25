# Määrittely, vaihe 3b: merimerkkimoduulin liittäminen ja näkymän viimeistely

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Tausta: vaihe 3 (`/home/claude/reittikartta-sim/`, raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3.md`, työloki `TYOLOKI.md`) ja merimerkkimoduuli (`/home/claude/merimerkit/`, kuvaus `MERKIT.md`). Työ tehdään hakemistossa `/home/claude/reittikartta-sim/`.

## 1. Tavoite

Kuljettajan näkymä viimeistellään niin, että turvalaitteet ovat oikean näköisiä ja puusto näyttää puustolta. Liikemalliin, plotteriin, komentoihin, harjoitukseen ja purkuun ei kosketa.

## 2. Tehtävät

1. Liitä `merimerkit3d.js` simulaattoriin `MERKIT.md`-ohjeen mukaan: `merkit3d.js` korvataan tai muutetaan käyttämään `luoInstanssit`-funktiota, varjostimen minimileveys säilyy, loistojen torni- ja sektoritiedot kulkevat mukana vaihetta 4 varten. `merkit.js` säilyttää vesiliikennemerkkien rajoitusarvon, jotta nopeusrajoitus näkyy kilvessä. Linjataulujen suunta tulee taululinjasta.
2. Kummelit: tilaajan mukaan kummelit ovat valkoisia kivikasoja, joissa on heijastin, eivät sileitä kartioita. Mallinna kummeli epäsäännöllisenä valkoiseksi maalattuna kivikasana (esimerkiksi 8–14 satunnaisesti aseteltua pyöristettyä lohkaretta kartiomaisessa kasassa, pohja noin 2–3 m, korkeus noin 1,5–2,5 m, sama siemen jokaiselle kummelille, jotta näkymä on toistettava) ja laita yläosaan heijastinlevy tai -nauha. Hae yksi tai kaksi kuvaa tai kuvausta suomalaisesta kummelista WebSearchilla mittojen tueksi ja kirjaa lähde.
3. Siilinkari: tilaajan mukaan Siilinkarin loistosta on paljon kuvia verkossa. Hae WebSearchilla ja WebFetchillä kuvauksia ja kuvia (esimerkiksi hakusanoilla "Siilinkari Näsijärvi majakka" ja "Siilinkarin loisto"), ja mallinna se niiden mukaan erikoismallina: muoto (koppi, torni vai pylväs), väritys, korkeus, aurinkopaneeli ja lyhty. Kirjaa lähteet päiväyksineen ja merkitse, mitkä mitat ovat kuvista arvioituja. Jos kuvia ei voi avata WebFetchillä, käytä tekstikuvauksia ja kirjaa se.
4. Puusto: nykyiset latvuslaatikot näyttävät rakennuksilta. Korvaa ne puumaisella latvuskerroksella: metsämaan päälle sijoitetaan puuryhmiä (esimerkiksi kartion ja pallon yhdistelmiä tai kaksi ristikkäistä pystylevyä puutekstuurilla) InstancedMesh-rakenteena, tiheys latvuspeiton mukaan, korkeus puuston keskipituus ±20 %, satunnainen mutta siemenellä toistettava sijoittelu. Lähellä (alle 600 m) puut yksittäisinä instansseina, kauempana latvus yhdistettynä maastoverkkoon kuten nyt. Kolmiobudjetti pysyy kriteerin 1 rajoissa, ja alle 1 ha saarilla korkeusraja 10 m säilyy.
5. Rannat: tarkista, että rantaviiva ei nouse jyrkkänä seinänä vedestä (maastoverkon reuna rantaviivassa interpoloidaan vedenpintaan) ja että matalat luodot näkyvät vaaleana kalliona, ei nurmena.

## 3. Hyväksymiskriteerit

1. Kriteerit 1 (suorituskyky), 2 (paikat) ja 7 (mobiilitestit WebKit ja Chromium) vaiheen 3 määrittelystä mitataan uudelleen ja täyttyvät. Kolmioita alle 300 000, piirtokutsuja alle 300, kuvan mediaani alle 60 ms SwiftShaderilla Pixel 7 -profiililla.
2. Kaikki 341 turvalaitetta piirtyvät merimerkkimoduulin malleilla, ja lokiin ei tule varamallimerkintöjä.
3. Kuvat ihmisen arvioitavaksi hakemistoon `lahdekoodi/simulaattori/shots/`: Siilinkarin ohitus 50 m, Siilinkari 300 m päästä, kummeli 100 m päästä, linjataulut 300 m päästä, metsäinen ranta 200 m päästä, ja Naistenlahden näkymä. Kuvissa pitää näkyä, että kummeli on kivikasa, Siilinkari on lähteiden mukainen ja puusto näyttää puilta.
4. `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` pysyy muuttumattomana, ja juuren `simulaattori.html` on päivitetty.

## 4. Työtapa

Kuten vaiheessa 3: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8140`), Playwright asennettu (Chromium ja WebKit, älä aja `playwright install`), lyhyet testiajot timeoutilla, työloki `TYOLOKI.md`, ei kysymyksiä tilaajalle, suomeksi ja ilman puolipisteitä. Älä koske hakemistoihin `/home/claude/reittikartta/`, `/home/claude/reittikartta-maasto/`, `/home/claude/reittikartta-aineisto/` ja `/home/claude/merimerkit/` (lue ja kopioi sieltä vapaasti). Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3b.md`: numeroitu ja lyhyt, kriteerit lukuina, lähteet Siilinkarille ja kummelille, mitä oletettiin.

Palauta lopuksi lyhyt yhteenveto: muuttuneet tiedostot, kriteerien 1–4 tulokset, Siilinkarin ja kummelin lähteet, ja kuvien polut. Älä liitä koodia vastaukseen.
