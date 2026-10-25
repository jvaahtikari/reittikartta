# Määrittely, vaihe 3: simulaattorin ydin ja päivänavigointi

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Tausta: "Opetusohjelma/Navigointisimulaattori suunnitelma.md" (kohta 5, vaihe 3), aineistopaketin kuvaus `aineisto.json`, vaiheen 1b maamerkit ja korkeudet, ja Repan runkomalli vuotosimulaattorista.

## 1. Tavoite

Puhelimella toimiva sivu `simulaattori.html`, jossa käyttäjä ajaa Pv417 Repaa Näsijärvellä oikealla kartalla, oikeilla väylillä ja turvalaitteilla, oikealla nopeudella ja oikeassa ajassa. Tässä vaiheessa tehdään päivänavigointi: oma alus, aika, kuljettajan näkymä, plotteri ja yksi harjoitus. Yö, sumu ja tutka tulevat vaiheessa 4, tehtävät ja parityö vaiheessa 5, joten simulaation tila pidetään erillään näkymistä ja harjoituksen vaiheet erillisinä.

Opetuksellinen tavoite on aikabudjetti 30 solmussa, katse kaksi merkkiä eteenpäin, käännöksen ennakointi ja nopeuden valinta kapeikossa. Ei realistista hydrodynamiikkaa, ei valokuvantarkkaa maastoa.

## 2. Sijainti koodissa ja julkaisu

Työkopio on `/home/claude/reittikartta-sim/` (Reittikartan `maasto`-haara ilman `.git`-hakemistoa). Simulaattorin lähdekoodi tulee hakemistoon `lahdekoodi/simulaattori/` (omat js- ja css-tiedostot, three.js r128 kopioituna `lahdekoodi/simulaattori/lib/three.min.js`), ja `lahdekoodi/build.py` laajennetaan niin, että se tuottaa myös repon juureen `simulaattori.html`-tiedoston yhdeksi tiedostoksi samalla tavalla kuin `index.html`. Vercel julkaisee repon juuren sellaisenaan, joten sivu tulee osoitteeseen `/simulaattori.html`. Reittikartan omaa koodia (`lahdekoodi/js/`) ei muuteta tässä vaiheessa, mutta sen moduuleja saa kopioida tai upottaa simulaattoriin (esimerkiksi `symbols.js` karttamerkkeihin ja `geo.js` laskentaan). Lisenssi on sama PolyForm Noncommercial, ja aloitusnäytössä on sama "Ei navigointikäyttöön" -teksti ja lähdemerkinnät kuin Reittikartassa, täydennettynä `aineisto.json`-tiedoston `lahdemerkinta_yhteensa`-kentällä.

## 3. Aineistot

Kaikki tulee vaiheen 1 ja 1b paketista. Tuotannossa osoite on `https://jvaahtikari.github.io/reittikartta-aineisto/`, ja työtilassa paketti tarjoillaan paikallisesti hakemistosta `/home/claude/opetus/navi/putki/ulos/` (`python3 /home/claude/opetus/navi/putki/palvele.py 8140`, tukee range-pyyntöjä ja CORS:ia). Paketin osoite on asetus, oletus Pages-osoite.

- `nasijarvi.pmtiles` (MVT, zoom 8–16, 512 px). Simulaattori käyttää kerroksia `turvalaite` (kentät `numero`, `nimi`, `tyyppi`, `navigointilaji`, `valaistu`, `valotunnus`, `sektorit`, `valon_korkeus_vedesta`), `navigointilinja`, `vaylaalue`, `vayla`, `taululinja`, `vesiliikennemerkki`, `syvyysalue` (DRVAL1, DRVAL2), `rantaviiva`, `maastokuvio` ja `rakennus` (`krs`, `z`). Kenttien tarkat nimet ovat `aineisto.json`-tiedoston kohdassa `tiilet.vektori.kerrokset`, lue ne sieltä.
- `maasto.pmtiles`: Terrain-RGB, zoom 8–14, Mapbox-koodaus (korkeus = -10000 + (R·65536 + G·256 + B)·0,1), N2000. Järven pinta on noin 95,4 m N2000.
- `puusto.pmtiles`: puuston keskipituus ja latvuspeitto, zoom 10–14, koodaus `aineisto.json`-tiedostossa.
- `pinta.pmtiles`: pintamalli rantavyöhykkeeltä Tampereen rannalla (vaihe 1b, Terrain-RGB, zoom 12–16, vain alueella, jolla tiiliä on). Missä pintamallia on, sitä käytetään maaston ja rakennusten sijasta sellaisenaan, koska siinä ovat voimalaitos, piiput, kuljetin ja Näsinneula oikean korkuisina. Muualla maasto = `maasto.pmtiles` + puuston keskipituus metsäkuvioilla + pursotetut rakennukset (`krs` 1-2 → 6 m, 3+ → 12 m, tai `rakennuskorkeudet.json`-tiedoston `h_p90`, kun `ei_keilattu` ei ole 1).
- `maamerkit.json`: Näsinneulan, voimalaitoksen piippujen ja kuljettimen sekä Tampellan piipun mitat. Näsinneula mallinnetaan käsin näistä mitoista (varsi, lautanen 27 m halkaisijaltaan 129 m korkeudella, huippu 168 m), koska pintamalli ei tunne ulokkeita. Piiput sylintereinä mitoista. Muut maamerkit jäävät pintamallin varaan.

Paketti ei kata Tampereen uusinta rakennuskantaa pintamallissa (keilaus 2008), ja se korjataan myöhemmin aineistopuolella, ei simulaattorissa.

## 4. Oma alus

Repan runkomalli on valmiina: `/home/claude/opetus/repa/hull_offsets.json` (asemat, kansi, ohjaamo, masto, kaiteet, väritys) ja `/home/claude/opetus/repa/hull3d.js` (three.js r128 -rakennuskoodi, globaalit `HULL`, `boat`, `LIVERY`, funktiot `buildHull`, `stationAt`, `zDeck`). Koordinaatisto: x peräpeilistä keulaan, y SB positiivinen, z köliviivasta ylös. Käytä samaa mallia ja väritystä, älä mallinna uudelleen. `hull3d.js` luo oman `renderer`-, `scene`- ja `water`-olion, joten irrota rakennusosa niin, että se tuottaa `THREE.Group`-olion annettuun sceneen.

Käsikirjan tiedot (Käsikirja 25.6.2014): matkanopeus 28 solmua, huippunopeus 35 solmua, 2 × 375 kW, 2 × Rolls-Royce FF340 vesisuihkua, massa täydellä kuormalla 15 500 kg, suurin syväys 0,9 m, crash stop matkanopeudesta noin 40 m. Käsikirja varoittaa liukukynnysnopeudesta, jolla keulan nousu haittaa näkyvyyttä, mutta ei anna trimmikulmia.

Liikemalli, karkea ja tarkoituksella yksinkertainen, kaikki arvot asetuksina tiedoston alussa:

- Nopeus 0–35 kn. Kaasu 0–100 % antaa tavoitenopeuden, ja nopeus lähestyy sitä aikavakiolla: kiihtyvyys 0 → 28 kn noin 15 s (oletus), kaasun nollaus hidastaa 28 → 6 kn noin 20 s (oletus), crash stop (erillinen nappi) pysäyttää 28 solmusta 40 metrissä (käsikirja).
- Kääntyminen: ruorikulma -100…100 %, kääntymisnopeus = ruori × v / R(v), jossa kääntösäde R kasvaa nopeuden mukana, oletus R = 12 m 5 solmussa ja 70 m 30 solmussa, välillä lineaarisesti. Vesisuihkualus kääntyy myös paikallaan hitaasti (3°/s täydellä ruorilla nollanopeudella). Kallistus käännöksessä sisäänpäin, enintään 8°, näkymää varten.
- Trimmi (keulan nousu) nopeuden funktiona, oletus 0° alle 8 kn, nousee 5° kohdalla 12–15 kn (liukukynnys), laskee 2,5° yli 25 kn. Nämä ovat oletuksia, ja ne kirjataan raporttiin oletuksina.
- Syväys 0,9 m. Pohjakosketus, kun alus on syvyysalueella, jonka DRVAL2 (suurin syvyys) on alle 1,0 m, tai kun alus osuu maastokuvion maa-alueeseen tai rantaviivan sisäpuolelle. Pohjakosketus pysäyttää harjoituksen ja näyttää paikan kartalla.

## 5. Näkymät ja ohjaus

Yksi simulaation tila (sijainti, suunta, nopeus, aika, ruori, kaasu, loki), kaksi näkymää, joiden välillä vaihdetaan napilla ja jotka pysyvät synkronissa. Puhelimen pystyasennossa näkymä on koko ruutu ja toinen näkymä pieni ikkuna kulmassa (plotteri kuljettajan näkymän kulmassa), jonka napautus vaihtaa päänäkymän. Vaaka-asennossa ja tabletilla näkymät rinnakkain.

### 5.1 Kuljettajan näkymä (three.js)

- Kamera ohjaajan silmäpisteessä: ohjaamon lattia on z 1,55 m köliviivasta, silmä seisten 1,65 m lattian yläpuolella ja istuen 1,25 m (valittavissa), x noin 6,5 m (ohjauspaikka ohjaamon etuosassa, tarkista `hull_offsets.json`-tiedoston `wheelhouse`-kohdasta), y 0 tai SB-puoli ohjauspaikan mukaan. Kamera seuraa trimmiä ja kallistusta, joten liu'ussa keula nousee näkymään ja peittää lähialueen. Ohjaamon ikkunan kehys, tuulilasin pilarit ja Repan keula näkyvät (ne tulevat runkomallista itsestään, kun kamera on ohjaamon sisällä).
- Katselukulma 70° vaakasuunnassa oletuksena, ja käyttäjä voi kääntää katsetta sormella vetämällä 90° kumpaankin suuntaan, palautus napilla.
- Maasto paikallisessa tasokoordinaatistossa (ENU, origo järven pinnalla aluksen lähellä, päivitetään kun alus liikkuu yli 5 km), ladattu tiilinä 6 km säteelle: lähellä (alle 1,5 km) zoom 14 maasto ja pintamalli zoom 15–16, kauempana zoom 12–13. Maasto korkeuskenttäverkkona (yksi verkko per tiili), väri maastokuvion mukaan (metsä tumma vihreä, pelto keltainen, kallio harmaa, taajama vaaleanharmaa), rakennukset pursotettuina laatikoina. Vesi tasona z 0, väri taivaan ja auringon mukaan, kevyt aaltotekstuuri ilman fysiikkaa.
- Turvalaitteet 3D-symboleina oikeassa paikassa ja koossa: viitat sylintereinä (halkaisija 0,2 m, korkeus 1,5 m vedestä, väri navigointilajin mukaan: lateraalit punainen ja vihreä, kardinaalit musta-keltaiset, karimerkki musta-punainen, turvavesi puna-valkoinen, erikoismerkki keltainen; käytä Reittikartan `symbols.js`-värejä), kummelit valkoisina kartioina 2 m, linjataulut suorakaiteina oikealla värillä ja korkeudella (oletus 3 × 1,5 m taulu 6 m korkeudella, kirjataan oletuksena), loistot sylintereinä `valon_korkeus_vedesta`-korkeudella, lyhyemmät kuin viitat jos tietoa ei ole. Päivällä valot eivät pala.
- Aurinko päivämäärän ja kellonajan mukaan (yksinkertainen aurinkokulma leveysasteelle 61,5°), vastavalossa kontrasti laskee ja vedessä häikäisy. Taivas gradienttina.
- Suorituskyky: kolmioita enintään 300 000 näkyvissä, piirtokutsuja alle 300, tiilet ladataan taustalla eikä lataus pysäytä piirtoa. Mittaa ja kirjaa.

### 5.2 Plotteri (Leaflet)

Plotteri rakennetaan simulaattorin omaksi Leaflet-näkymäksi paketin kerroksista, ei upottamalla koko Reittikarttaa, jotta vaihe 3 ei riipu Reittikartan sisäisistä rajapinnoista. Reittikartan ulkonäköä jäljitellään: Traficomin rasterimerikartta pohjana (WMTS, sama osoite kuin Reittikartan `chart.js`-tiedostossa) ja paketin vektorikerrokset päällä (väyläalueet, navigointilinjat, turvalaitteet Reittikartan `symbols.js`-merkeillä, syvyysalueet). Suunta ylös, oma alus keskellä kolmiona, nopeus, suunta ja kello näkyvissä, mittakaavan valinta (0,25, 0,5, 1, 2 mpk näytön korkeudella), reitti ja seuraava reittipiste, etäisyys ja aika seuraavaan käännökseen nykyisellä nopeudella. Plotterin voi sammuttaa harjoituksessa (nappi, jonka tila kirjataan lokiin).

### 5.3 Ohjaus

- Puhelin: vasen puolisko kaasu (pystyveto, pysyy asennossaan), oikea puolisko ruori (vaakaveto, palautuu keskelle vapautettaessa, lukitus pitkällä painalluksella), crash stop -nappi, kahden sormen veto kuljettajan näkymässä kääntää katsetta.
- Näppäimistö: nuolet ylös ja alas kaasu, vasen ja oikea ruori, välilyönti crash stop, Q ja E katse.
- Aika: oikea kello oletuksena, nopeutus 1×, 2×, 5×, 10×, tauko. Nopeutus vaikuttaa simulaatioon mutta ei kuvataajuuteen.

## 6. Harjoitus 1: Mustalahti–Siilinkari–Aitolahti

Reitti virallista väylää pitkin Mustalahden satamasta Siilinkarin ohi Aitolahteen (navigointilinjat paketista, agentti valitsee linjat ja kirjaa reittipisteet). Harjoituksen voi ajaa valitulla tavoitenopeudella, ja ohjelma ehdottaa 10 ja 30 solmua. Lopussa, tai keskeytyksen jälkeen, näytetään purku:

1. Ajettu jälki plotterilla väyläalueeseen nähden, ja osuus ajasta väyläalueen sisällä prosentteina.
2. Suurin poikkeama navigointilinjasta metreinä ja missä.
3. Jokaisesta käännöksestä, kuinka monta metriä ennen tai jälkeen käännöspisteen käännös alkoi (ruorin käyttö yli 20 %).
4. Jokaisesta sivuutetusta viitasta, kuinka monta sekuntia se oli näkyvissä kuljettajan näkymässä ennen sivuutusta (näkyvyys: etäisyys alle 700 m, näkökentässä, ei maaston takana, ei keulan peitossa).
5. Kokonaisaika, keskinopeus ja pohjakosketukset.

Purku on pelkkää tekstiä ja plotterikuva, ei pisteytystä.

## 7. Hyväksymiskriteerit lukuina

1. Kuvataajuus: Playwright Chromiumilla Pixel 7 -profiililla (SwiftShader, liput `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`) kuljettajan näkymässä Mustalahden edustalla 30 solmussa kuvan mediaanikesto alle 60 ms (SwiftShader on ohjelmistopiirto, joten oikealla puhelimella tämä vastaa yli 25 kuvaa sekunnissa). Lisäksi näkyvien kolmioiden määrä ja piirtokutsut kirjataan `renderer.info`-oliosta, ja niiden pitää olla alle 300 000 ja 300.
2. Paikat: kolmen turvalaitteen (Mustalahti, Siilinkari ja yksi Aitolahden viitta) sijainti kuljettajan näkymässä vastaa paketin koordinaatteja alle 2 m, mitattuna projisoimalla ja vertaamalla ENU-muunnosta. Maaston korkeus Pispalanharjun kohdalla 3D-näkymässä vastaa `maasto.pmtiles`-arvoa alle 2 m.
3. Näsinneulan huippu on 3D-näkymässä 168 m järven pinnan yläpuolella ±3 m ja voimalaitoksen piiput noin 90 m, ja kuvakaappaus Naistenlahden poukamasta (E 327 740, N 6 823 980, suunta 172°) näyttää piiput, kuljettimen ja Näsinneulan samoissa suunnissa kuin vaiheen 1b siluetti (piiput 99–104°, Näsinneula 239°).
4. Harjoitus 1 ajettuna 30 solmussa automaattiohjauksella (testi ohjaa alusta reittipisteitä kohti) valmistuu, purku syntyy, ja ajan pitää vastata matkaa jaettuna nopeudella ±10 %.
5. Pohjakosketus pysäyttää harjoituksen, kun alus ajetaan suoraan Siilinkarin saareen.
6. Verkkosiirto 30 solmun ajossa alle 3 Mt minuutissa mitattuna Playwrightilla.
7. Mobiilitestit (mobile-ux-test: oikea WebKit iPhone 14 ja Chromium Pixel 7, WebKit on asennettu polkuun /opt/pw-browsers) läpi: aloitusnäyttö, näkymän vaihto, kaasu ja ruori kosketuksella, plotterin sammutus, purku. Ei konsolivirheitä. Kosketuskohteet vähintään 44 px.
8. `build.py` tuottaa `simulaattori.html`-tiedoston, joka toimii yhtenä tiedostona verkon kanssa, ja `index.html` pysyy muuttumattomana (tavuvertailu).
9. Kolme kuvakaappausta ihmisen arvioitavaksi hakemistoon `lahdekoodi/simulaattori/shots/`: Naistenlahden poukamasta etelään, Mustalahdesta kohti Siilinkaria 30 solmussa liu'ussa, ja Siilinkarin ohitus 50 m etäisyydeltä. Lisäksi plotterikuva ja purkunäkymä.

## 8. Työtapa

- Lue ensin `aineisto.json`, `hull_offsets.json` ja `hull3d.js` kokonaan, sitten Reittikartan `symbols.js`, `geo.js` ja `chart.js` tarvittavilta osin (rasterikartan WMTS-osoite ja väylämerkkien piirto).
- Järjestys: (1) tila ja liikemalli Node-testattavana moduulina ja sen testit (nopeus, crash stop 40 m, kääntösäde), (2) plotteri, (3) kuljettajan näkymä maasto ja vesi, (4) turvalaitteet ja maamerkit, (5) ohjaus ja näkymien vaihto, (6) harjoitus ja purku, (7) testit, kuvakaappaukset, build, raportti. Tallenna välituloksia usein ja raportoi jokaisen askeleen jälkeen lyhyesti tiedostoon `lahdekoodi/simulaattori/TYOLOKI.md`.
- Verkko: `jvaahtikari.github.io` ei ole sallittu tästä työtilasta, paketti tarjoillaan paikallisesti. `julkinen.traficom.fi` (rasterikartta) on sallittu. Playwright on asennettu, älä aja `playwright install`.
- Älä muuta Reittikartan `lahdekoodi/js/`-tiedostoja äläkä `index.html`-tiedostoa. Älä koske hakemistoihin `/home/claude/reittikartta/`, `/home/claude/reittikartta-maasto/` ja `/home/claude/reittikartta-aineisto/`.
- Älä kysy tilaajalta kesken työn, tee ratkaisut itse ja kirjaa ne raporttiin. Jos jokin osa ei onnistu (esimerkiksi pintamallin yhdistäminen maastoon), tee yksinkertaisempi versio ja kirjaa se.
- Suomeksi, kokonaisin lausein, desimaalipilkku, ei puolipisteitä. Käyttöliittymätekstit lyhyitä ja Reittikartan tyylisiä, ei AI-maneereita.
- Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3.md`: numeroitu, lyhyt, kriteerien 1–9 tulokset lukuina, liikemallin oletukset taulukkona, muuttuneet ja uudet tiedostot, mitä yksinkertaistettiin, mikä ei onnistunut.

Palauta lopuksi lyhyt yhteenveto: tiedostojen polut, kriteerien 1–9 tulokset lukuina ja hyväksytty tai ei, liikemallin oletukset, ja mitä jäi epävarmaksi. Älä liitä koodia vastaukseen.
