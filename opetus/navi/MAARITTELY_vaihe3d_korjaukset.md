# Määrittely, vaihe 3d: korjaukset käyttäjän ensimmäisen testin perusteella

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-sim/`. Tausta: työloki `lahdekoodi/simulaattori/TYOLOKI.md`, raportit vaiheista 3, 3b ja 3c, ja käyttäjän testivideo läppärillä 25.10.2026 klo 20.33 (ruudut `/tmp/claude-0/-home-claude/09de4811-b059-506c-8fe2-f0c820c90e7e/scratchpad/video/f_01.png` … `f_10.png`, katso ne).

## 1. Havainnot videosta

1. Plotteri välkkyy pahasti: kuva vaihtelee tyhjän vaaleansinisen ja piirretyn rasterikartan välillä joka päivityksellä. Syy on todennäköisesti se, että suunta ylös on toteutettu pyörittämällä Leafletin karttaelementtiä ja asettamalla näkymä joka ruudulla, jolloin tiilet latautuvat ja piirtyvät uudestaan.
2. Ulkonäkymä on lähes musta, koska simulaattori käyttää oletuksena oikeaa kelloa ja testi tehtiin illalla pimeän aikaan. Yötilaa ei ole vielä (vaihe 4).
3. Läppärin asettelu on väärä: plotteri vasemmalla, kapea 3D-näkymä keskellä, komennot oikealla. Käyttäjä haluaa ulkonäkymän hallitsevaksi ja plotterin sekä tutkan sen alle.
4. Plotterin ulkoasu on outo sekoitus Traficomin rasterikarttaa ja vektoripiirtoa. Käyttäjä haluaa SARNavia muistuttavan näkymän, eli Reittikartan vektorimerikartan tyylin.

## 2. Tehtävät

1. Plotterin välkkyminen pois. Suunta ylös toteutetaan niin, että kartta piirretään pohjoinen ylös piilotettuun karttaan tai canvasiin riittävällä marginaalilla (näkymän halkaisija kertaa 1,5) ja näkyvä kuva on sen pyöritetty kopio canvasilla, tai Leafletin näkymää siirretään vain, kun alus on liikkunut yli 10 % näkymän koosta, ja pyöritys tehdään CSS-muunnoksella ilman tiilien uudelleenlatausta. Tiilit eivät saa kadota ja palata. Mittaa: 30 solmun ajossa 20 sekunnin aikana plotterin canvasin tyhjien ruutujen osuus on 0 (testi ottaa kuvakaappauksen sekunnin välein ja laskee, kuinka monessa kartta-alue on yli 90 % yhtä väriä).
2. Plotteri Reittikartan vektorimerikartan tyyliin. Pohjaksi ei rasterikarttaa vaan Reittikartan vektorikartta: vesialueet ja syvyysalueet Traficomin merikarttatietokannan väreillä kuten Reittikartassa (`chart.js` vektoripohjan väritys ja syvyysalueiden sävyt), rantaviiva ja maa-alue vaaleana, syvyyskäyrät ja syvyysluvut paketin `syvyysalue`, `syvyyskayra` ja `syvyyspiste` -kerroksista, väylät ja navigointilinjat Reittikartan tapaan, turvalaitteet `symbols.js`-merkeillä, paikannimet paketin `maastokuvio`- tai nimistöstä, jos saatavilla (muuten ilman). Yhtenäinen tyyli, ei sekoitusta rasterin kanssa. Rasteri jää valinnaksi asetuksiin, oletus pois. Suunta ylös oletuksena, pohjoinen ylös valittavissa, oma alus näkymän alakolmanneksessa, keulaviiva, reitti ja seuraava reittipiste kuten nyt. Lue `lahdekoodi/js/chart.js` vektorikartan piirtoperiaatteet (värit, viivanpaksuudet, zoomrajat) ja käytä samoja arvoja, jotta plotteri näyttää Reittikartalta.
3. Aika: aloitusnäytön oletus on valittu päivä ja kello 12.00 (päivä), ja "oikea kello" on valinta. Kun valittu aika on auringonlaskun jälkeen, aloitusnäytössä lukee, että yönäkymä tulee myöhemmässä vaiheessa ja näkymä on tumma. Ajon aikana kello näkyy kuten nyt.
4. Asettelu leveillä näytöillä (vähintään 1024 px leveä vaaka-asento): ulkonäkymä ylhäällä koko leveydeltä noin 60 % korkeudesta, sen alla rivissä plotteri, tutka ja komentopalsta (komennot oikealla). Kun tutka on pois päältä, plotteri ja komennot jakavat rivin. Puhelimen pystyasennon asettelu pysyy ennallaan. Tabletilla pystyasennossa sama kuin leveä, mutta komentopalsta rivin alle. Kaikki kosketuskohteet vähintään 44 px, ja asettelutesti ajetaan koissa 1024 × 768, 1366 × 768, 1440 × 900 ja 1920 × 1080.

## 3. Hyväksymiskriteerit

1. Välkkymistesti kohdan 2.1 mukaan: tyhjiä plotteriruutuja 0 kahdestakymmenestä 30 solmun ajossa, Chromium Pixel 7 ja WebKit iPhone 14 sekä 1440 × 900 Chromium.
2. Plotterikuva Mustalahdesta 1 mpk alueella rinnakkain Reittikartan vektorikartan kuvan kanssa samasta paikasta (Reittikartan `index.html` ajettuna Playwrightilla vektoripohjalla) ihmisen arvioitavaksi, ja värit täsmäävät (syvyysalueiden ja maan värit samat heksakoodit).
3. Kuvaväli 30 solmun ajossa edelleen alle 60 ms SwiftShaderilla Pixel 7 -profiililla ilman tutkaa ja alle 70 ms tutkan kanssa.
4. Aloitusnäyttö oletuksena päiväaikaan, ja kuvakaappaus Naistenlahdesta oletusajalla näyttää päivän.
5. Asettelukuvat 1440 × 900 ja 1024 × 768 (ulkonäkymä ylhäällä, plotteri ja tutka alla) sekä puhelin pystyssä, hakemistoon `lahdekoodi/simulaattori/shots/` etuliitteellä `3d_`.
6. Vanhat mobiilitestit ja tutkatestit edelleen läpi, `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` muuttumaton.

## 4. Työtapa

Kuten aiemmin: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8140`), Playwright asennettu (älä aja `playwright install`), lyhyet ajot timeoutilla, työloki, ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä. Liikemalliin, harjoituksen laskentaan, merkkeihin, maastoon ja tutkamoduuliin ei kosketa. Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3d.md`, lyhyt ja numeroitu, ja lopuksi lyhyt yhteenveto tilaajalle: muuttuneet tiedostot, kriteerien 1–6 tulokset ja kuvien polut. Älä liitä koodia vastaukseen.
