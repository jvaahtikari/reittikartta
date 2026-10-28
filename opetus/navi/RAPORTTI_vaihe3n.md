# Raportti, vaihe 3n: Google 3D maisemana, oma vesi, vene ja merkit sen päällä

Päiväys 27.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työhakemisto `/home/claude/reittikartta-3n/`. Googlen kirjastoa ja avainta ei ole tässä ympäristössä, joten Googlen kerros korvattiin testeissä tummalla taustalla. Kaikki luvut ovat tämän korvaavan kirjaston kanssa mitattuja, ja Googlen todellinen käytös on todennettava avaimella (kohdat 6 ja 7).

## 1. Päätulokset lyhyesti

1. Googlen 3D-kartta on alin kerros ja simulaattorin oma kangas on sen päällä läpinäkyvällä taustalla. Oma kerros piirtää vain veden, veneen, turvalaitteet, kiikarin maskin, kompassikaistan ja HUD:n. Taivas, maasto, puusto, rakennukset, laiturit, sillat ja maamerkit jäävät Googlelle, mutta maasto ja rakennukset piirretään syvyyspuskuriin, joten ne peittävät omia kohteita.
2. Kriteeri 1 täyttyy: taivaan alfa 0, veden alfa 255, maan alfa 0 noin 300 m päässä, peitto toimii (koetin maan takana peittyy, avovedessä oleva näkyy), kuvat otettu.
3. Kriteeri 2 täyttyy: kalibrointityökalu on kehitysvalinta `?kalibrointi=1`. Sovitus palauttaa tunnetun virheen (0,8°, 0,4°, kuvakulman kerroin 1,03) alle 0,001° tarkkuudella, ja ohje tilaajalle on kohdassa 7.
4. Kriteeri 3 täyttyy: sumukerroksen alfa noudattaa kaavaa 1 - exp(-d / näkyvyys). Esimerkiksi 1 km:n näkyvyydellä 1 014 m päässä oleva maapiste sai alfan 63,5 % (kaava 63,7 %), ja 2 km:n näkyvyydellä 2 667 m päässä 73,5 % (kaava 73,7 %). Keskiero kaavaan on 0,4 ... 0,7 alfa-askelta asteikolla 0 ... 255.
5. Kriteeri 4 täyttyy: kaikki vanhat testit ovat läpi (kohta 4). Oma näkymä pisteessä A on ennen ja jälkeen tavu tavulta sama (0,0000 % pikseleistä eroaa, kun keinunta ja veden aika kiinnitetään).
6. Karttalatauksia yhdessä tyypillisessä 30 minuutin sessiossa syntyy 1 (kohta 5).
7. Oman kerroksen piirtoaika Google-tilassa on 58 ... 61 % oman täyden näkymän piirtoajasta (kaksi ajoa: 557 ms ja 961 ms sekä 341 ms ja 558 ms ohjelmistopiirtäjällä kuormitetulla koneella, joten luku on suuntaa antava).

## 2. Ratkaisu

1. Kerrostus. `#v3`-ruudussa Googlen kartta on z-indeksillä 0 ja oma kangas (`alpha: true`, tyhjennysalfa 0) z-indeksillä 1. Kartan tapahtumat on estetty, joten hiiri ja sormi kääntävät katsetta kuten ennenkin. Oman kankaan alareunasta rajataan 24 px pois, jotta Googlen logo ja lähdemerkintä pysyvät näkyvissä.
2. Kamera. Oma kamera irrotetaan aluksen keinunnasta ja asetetaan silmäpisteeseen aluksen suunnan mukaan (1,1 m kääntöpisteestä eteen, 0,75 m vasemmalle, 2,72 m vedenpinnan yläpuolelle), ja katse on aina vaakasuora. Googlen kamera saa samat sijainnin, suunnan (tosisuunta plus katse) ja pystykuvakulman, korkeus on 95,5 + 2,72 = 98,22 m. Pystykuvakulma rajataan Googlen sallimaan väliin 5 ... 80°. Kiikarissa tärinä on pois ja nousukulma rajataan arvoon enintään 0, koska Googlen tilt ei ylety vaakatason yläpuolelle.
3. Peitto ja sumu. Piirto on kaksivaiheinen kerroksilla ilman muutoksia `maasto.js`:ään. Vaihe 1 piirtää maastoverkon ja rakennukset ohitusmateriaalilla, joka kirjoittaa vain syvyyden ja sumun värin alfalla 1 - exp(-d / näkyvyys). Vaihe 2 piirtää veden, veneen, turvalaitteet ja taivaan sumukupolin syvyystestattuna vaiheen 1 syvyyttä vasten. Sumun näkyvyys valitaan valikosta (ei sumukerrosta, 20, 10, 5, 2 ja 1 km), ja se tallentuu asetuksiin.
4. Oma vesi (`js/vesimaski3d.js`). Vesimaski rakennetaan `maastokuvio`-kerroksen `jarvi`- ja `virtavesi`-polygoneista (z13-ruudut) 5 km säteellä aluksesta, ja rengasta siirretään 1,5 m maan puolelle. Ulkoasu on sama vesivarjostin kuin omassa näkymässä. Ääretöntä vesitasoa ei piirretä.
5. Kalibrointi (`js/kalibrointi.js` ja `google3d.js`). Työkalu piirtää ristit tunnettuihin pisteisiin oman kameramallin mukaan, näyttää suunnan, korkeuskulman, välimatkan ja kuvakoordinaatit sekä sovittaa suunnan, nousukulman ja kuvakulman kertoimen käyttäjän osoittamista kohdista.

## 3. Muuttuneet tiedostot

Hakemisto `lahdekoodi/`:

- `simulaattori/js/vesimaski3d.js` (uusi): oma vesi.
- `simulaattori/js/kalibrointi.js` (uusi): kalibrointipaneeli.
- `simulaattori/js/google3d.js`: kalibrointifunktiot, kameran katse alaspäin, kartan uudelleenkäyttö (yksi lataus), 24 px:n reunus ja sumuportaat.
- `simulaattori/js/nakyma.js`: läpinäkyvä kangas, kerrostila (`setOverlay`), kaksivaiheinen piirto, sumu, kamera silmäpisteessä, `vfovRequested`, `eyeAboveWaterM`.
- `simulaattori/css/sim.css`: kartan z-indeksi 0 ja kerrostilan säännöt.
- `simulaattori.html`: valikkonappi `mVis` ja kaksi skriptiä.
- Testit: `testit/google3n_pw.py`, `testit/google3n_test.js`, `testit/vertailu3n_pw.py` ja päivitetty `testit/google3d_pw.py`.
- Ennallaan (md5 tarkistettu): `plotteri.js`, `tutka.js`, `liike.js`, `harjoitus.js`, `tormays.js`, `runko.js`, `maasto.js`, kaikki merkkien mallit, `aineisto.js`, `mvt.js`, `paikka.js`.

`simulaattori/js/sim.js`, uudet rivinumerot (muutoksia ei ole muualla):

- Rivi 28: tilaan `fogKm`.
- Rivit 41 ja 45: sumun tallennus ja luku asetuksista.
- Rivi 199: kalibrointityökalun liitos, kun osoitteessa on `kalibrointi=1`.
- Rivit 570–573: valikkonapin `mVis` käsittelijä.
- Rivi 747: Googlen kameran parametrit (pyydetty pystykuvakulma ja silmän korkeus).
- Rivit 770–772 ja 776–778: ulkonäkymän vaihto, oma kangas pysyy näkyvissä ja kerrostila päälle tai pois.
- Rivit 904–906 ja 908: Google-tilan harvennus poistettu, oma kerros piirtyy kuten oma näkymä.
- Rivit 978 ja 990: komennon `nakyvyys` ja valikkonapin teksti.

## 4. Kriteerien mittaus

Kriteeri 1 (`testit/google3n_pw.py`, osat perus ja peitto, Chromium 1440 x 900, 3D-ikkuna 1244 x 441):

1. Taivas: neljässä sarakkeessa ensimmäisen läpinäkyvän jakson alussa alfa 0, ja jakso on horisontin yläpuolella. Ohjaamon katto piirtyy alfalla 255 (kohta 6).
2. Vesi: alfa 255 pisteessä 60 m aluksen edessä. Viidessä sarakkeessa on läpinäkyviä pikseleitä ja peittäviä pikseleitä, ei yhtään puoliläpinäkyvää.
3. Maa: korkea ranta 300 m päässä (maanpinta 5,9 m), pikselin alfa 0.
4. Peitto: koetinpari etsittiin oman maastoverkon säteenseurannalla. Laatikko 429 m päässä, maan takana (140 m peitto, maanpinta 9,8 m), peittyi (alfa 0, ei punainen). Laatikko avovedessä 399 m päässä näkyi (punainen, alfa 255).
5. Kuvat tummalla taustalla: `shots/3n_oma_kerros_naistenlahti.png` ja `shots/3n_oma_kerros_siilinkari.png`. Lisäksi `shots/3n_oma_kerros_siilinkari_sumu5km.png`, `shots/3n_kiikari_google_raaka.png`, `shots/3n_kalibrointi_paneeli.png` ja `shots/3n_peitto_koettimet_raaka.png`.

Kriteeri 2: työkalu ja sovitus. `testit/google3n_test.js` (23 tarkistusta) ja `google3n_pw.py` osa kalibrointi. Keinotekoinen Googlen kuva (suunta +0,8°, nousu +0,4°, kuvakulman kerroin 1,03) sovittuu jäännöksillä alle 0,001°, ja 1,5 pikselin kohinalla jäännökset ovat enintään 0,07° vaakasuunnassa ja 0,06° pystysuunnassa, eli selvästi rajojen 0,5° ja 0,3° sisällä.

Kriteeri 3: sumu. Mittaus säteenseurannalla (oma maastoverkko ja rakennukset, reunapikselit ohitettu, rannan jatke ohitettu): näkyvyys 2 km, keskiero kaavaan 0,5 alfa-askelta (372 pistettä 154 ... 1 014 m), näkyvyys 1 km 0,7 askelta, näkyvyys 5 km 0,4 askelta. Pisteet, joiden etäisyys on lähellä näkyvyyttä: 1 km näkyvyydellä 1 014 m, alfa 162 (63,5 %, kaava 63,7 %). Ilman sumua taivaan alue on täysin läpinäkyvä (0 / 12 896 pikseliä), ja sumun ollessa päällä taivaan yläreuna pysyy läpinäkyvänä. Aiemmassa erillisessä ajossa 5 km näkyvyydellä 4 946 m päässä oleva piste sai alfan 62,4 % (kaava 62,8 %).

Kriteeri 4 (lokit `shots/logs3n/`):

1. Oma näkymä pisteessä A (`testit/vertailu3n_pw.py`): vanha koodi (oma kopio portissa 8177, `nakyma.js` ja `sim.js` ennen vaihetta) ja uusi koodi, keinunta ja veden aika kiinnitettyinä. Kuvat `shots/3n_A_vanha_3d.png` ja `shots/3n_A_uusi_3d.png` (1440 x 512) ovat tavu tavulta samat, eli 0,0000 % pikseleistä eroaa (raja 1 %). Ilman kiinnitystä ero oli 18,8 % pikseleistä yli 16 kanavaaskeleen, koska aluksen keinunta ja veden aika riippuvat kellosta, joten vertailu tehtiin kiinnitettynä.
2. `mobiili_pw.py`: Chromium 44/0 ja WebKit 44/0 sekä yhden tiedoston `simulaattori.html` (build.py:n tuottama, Chromium) 44/0.
3. `google3d_pw.py`: Chromium 44/0 ja WebKit 44/0. Kaksi 3m-tarkistusta päivitettiin (kohta 6.7), ja yksi tarkistus lisättiin.
4. `katse_pw.py` 5/0, `kiikari3g_pw.py` 26/0, `kasky_pw.py` 11/0, `kayttoliittyma_3h_pw.py` 18/0 ja `valkkyminen_pw.py` (Chromium) 0 tyhjää ruutua 20:stä, puuttuvia ruutuja piirrossa 0.
5. Node: `liike_test.js`, `harjoitus_test.js`, `peruutus_test.js`, `sillat3d_test.js`, `google3d_test.js` ja uusi `google3n_test.js` (23 tarkistusta) läpi.
6. `google3n_pw.py`: täysi ajo antoi 39 hyväksyttyä tarkistusta ja 0 virhettä, mutta 25 minuutin aikaraja katkaisi ajon kuvien osassa. Perus-, kiikari- ja kuvaosat ajettiin uudelleen erikseen: 18/0.
7. Ensimmäisellä regressioajolla jokaisessa Playwright-testissä oli yksi virhe, jonka syy oli sama: konsolin 404 osoitteesta `/api/google`. Staattinen testipalvelin ei tarjoa palvelimen avainta, ja `sim.js` hakee sen jo ennen vaihetta 3n (vanhan `sim.js`:n rivi 160), joten virhe ei johdu tästä vaiheesta. Lisäksi `kasky_pw.py` antoi yhden aikavirheen (kompassikaista ei ollut ehtinyt piirtyä kuormitetulla koneella). Uusinta palvelimella, joka vastaa osoitteeseen `/api/google` tyhjällä vastauksella, antoi 0 virhettä kaikissa edellä luetelluissa testeissä.
8. `build.py` ajettu: `simulaattori.html` repon juuressa 1 460 675 tavua ilman ulkoisia viittauksia. Repon juuren `index.html` ja `dist/Reittikartta.html` ovat muuttumattomat (md5 edff5aed...). Kielletyt tiedostot ovat byte-identtiset (md5 tarkistettu).

## 5. Karttalataukset (laskutus)

Yksi `Map3DElement` luodaan, kun käyttäjä valitsee Google 3D:n ensimmäisen kerran. Vaihto omaan näkymään vain piilottaa laatikon (`display: none`), ja paluu näyttää sen uudelleen. Testissä kahdeksan näkymänvaihtoa ja kiikarin kytkentä tuottivat `loads` = 1 ja yhden karttaelementin sivulla. Uusi lataus syntyy vain sivun uudelleenlatauksesta tai virheestä (`gmp-error` tai latausvirhe), jolloin elementti tuhotaan ja seuraava valinta luo uuden.

Tyypillinen 30 minuutin sessio tuottaa siis 1 latauksen (tavoite 1). Jos käyttäjä lataa sivun uudelleen kesken session tai virhe tapahtuu, latauksia on yksi lisää kutakin kohden.

## 6. Poikkeamat ja huomiot

1. Vesi ei piirry ilman syvyystestiä, kuten määrittelyn kohta 2.3 sanoo, vaan syvyystestattuna maaston syvyyttä vasten. Muuten oma vesi maalaisi Googlen saaret ja niemet, kun vesimaskin polygoni ja maaston korkeus eroavat. Maastoa lasketaan 0,25 m, jotta rannan 1,5 m jatke voittaa maaston matalilla rannoilla. Jos rannan oman maastoverkon korkeus ylittää 0,25 m, jatke jää maaston alle. Arvo on `overlaySettings.lower`, ja sitä voi säätää, jos Googlen ja oman rantaviivan rako näkyy.
2. Ohjaamon katto ja ikkunapylväät ovat osa omaa venettä ja piirtyvät, kuten omassa näkymässä. Googlen kuva näkyy ikkunoista.
3. Siilinkarin loisto seisoo matalikolla, ja oman maastoverkon korkeus siellä on -1,5 m. Peittoa ei voi testata Siilinkarin saarella, joten se testattiin Naistenlahden rannalla. Kuva pisteestä C on silti otettu.
4. Piirtoajan mittaus tehtiin ohjelmistopiirtäjällä, ja kone oli kuormitettu (kuormaluku noin 5), joten suhde 58 ... 61 % on suuntaa antava.
5. Kiikarin tärinä on kerrostilassa pois, ja nousukulma rajataan arvoon enintään 0. Syy on Googlen tilt, joka ei katso vaakatason yläpuolelle.
6. Vaiheen 3l laiturien veneet ja poijut piirtyvät automaattisesti, kun ne lisätään sceneen oletuskerrokseen (0) ilman nimeä `laiturit`. Valmius on olemassa mutta vaihetta 3l ei ole tässä haarassa.
7. `google3d_pw.py`:n 3m-tarkistukset päivitettiin (oma kangas on nyt näkyvissä, ja virhe laukaistaan olemassa olevalle elementille).

## 7. Kalibrointiohje tilaajalle

1. Avaa `simulaattori.html?kalibrointi=1` esikatselussa. Anna Google Maps -avain aloitusnäytön avainkenttään ja käynnistä vapaa ajo.
2. Avaa valikko ja valitse Ulkonäkymä: Google 3D. Oikeaan yläkulmaan tulee kalibrointipaneeli. Siinä näkyy Googlen kameran lukemat (fov, tilt, heading, range ja kameran korkeus), käytössä oleva kalibrointi sekä kuusi tunnettua kohdetta suuntineen, korkeuskulmineen, välimatkoineen ja kuvakoordinaatteineen.
3. Valitse katselupiste B (Mustalahden edusta, Näsinneula ja Tampellan piippu), A (Naistenlahden satama, aallonmurtajan päät ja voimalaitoksen piippu) tai C (Siilinkarin ohitus). Alus siirtyy ja simulaatio pysähtyy.
4. Punaiset ristit näyttävät, mihin kohtaan oma kamera olettaa kohteen olevan. Jos ristit osuvat Googlen kuvassa oikeisiin kohteisiin, vaaka ero on alle 0,5° ja pysty alle 0,3° (kun 3D-ikkunan korkeus on 441 pikseliä ja pystykuvakulma 45,85°, asteessa on 9,6 pikseliä, joten raja on noin 5 pikseliä vaakasuunnassa ja 3 pikseliä pystysuunnassa).
5. Jos ristit eivät osu, valitse kohde, paina Käännä kohti valittua kohdetta, paina Osoita valittu kohde ja napauta kohteen todellinen paikka Googlen kuvassa. Tee sama vähintään kahdelle toisistaan eroavassa suunnassa olevalle kohteelle (kolme on parempi) ja paina Sovita. Taulukko näyttää jäännökset ennen ja jälkeen sovituksen, ja ne ovat vihreitä, kun rajat 0,5° ja 0,3° täyttyvät.
6. Paina Ota käyttöön ja tallenna. Kalibrointi tallentuu selaimen muistiin (`sim.googleKalib`) ja on heti käytössä. Nollaa kalibrointi -nappi palauttaa oletuksen.
7. Jos Googlen vesi ja oma vesi eivät kohtaa rannassa pystysuunnassa, säädä Googlen kameran korkeutta painikkeilla (±0,1, ±0,5 ja ±1 m).
8. Lue erityisesti: sovituksen kuvakulman kerroin (1,000 tarkoittaa, että Googlen fov vastaa pyydettyä), nousukulma (poikkeaa nollasta, jos Googlen tilt 90° rajataan) ja suunta (vakio, jos Googlen heading poikkeaa tosisuunnasta).

## 8. Varmentamattomat kohdat

1. Googlen todellinen käytös: tilt 90° rajaus (vertailusimulaattori rajaa 85°), fov-määritelmä, kameran korkeuden vertailutaso ja lähdemerkinnän korkeus (24 px on arvio) vaativat avaimella tehdyn ajon.
2. Rantaviivan 1,5 m jatkeen vaikutus Googlen todellista rantaa vasten (kohta 6.1).
3. Piirtoaika todellisella näytönohjaimella. Googlen kirjastoa ei voi ajaa tässä ympäristössä, joten mittaus koskee vain omaa kerrosta.

## 9. Googlen ehdot

Lähdemerkintä pysyy näkyvissä (24 px:n reunus). Karttaa ei välimuistiteta eikä kuvakaappauksia tallenneta. Puran kuvat otetaan edelleen omasta näkymästä.
