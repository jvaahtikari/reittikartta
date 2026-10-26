# Määrittely, vaihe 3g: merimerkit kaukana, kiikari ja valonheittimen toimintaperiaate

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-3f/` vaiheen 3f jälkeen (lue `TYOLOKI.md`:n vaiheet 3d ja 3f ja `RAPORTTI_vaihe3f.md` ensin). Käyttäjän kuvakaappaus läppäriltä 25.10.2026 klo 23.43: `/mnt/user-data/attachments/09de4811-b059-506c-8fe2-f0c820c90e7e/3f1a6af7-image.png` (katso se: Koukkuniemen viitta lähellä on oikean näköinen, mutta horisontissa noin 2–3 km päässä olevat viitat näkyvät paksuina tummina pisteinä).

## 1. Käyttäjän havainto ja toiveet

1. Merimerkit näyttävät kaukaa paksummilta kuin pitäisi ja näkyvät liian kauas. Läheltä ne ovat oikein. Syy on `merimerkit3d.js`-asetus `minPx: 3.5` (pienin leveys CSS-pikseleinä), joka tekee 20–30 cm leveästä viitasta kilometrien päässä 3,5 pikselin levyisen kappaleen. Oikeasti viitta näkyy paljain silmin hyvällä säällä noin 0,5–1 km päähän, suuremmat kiinteät merkit (linjataulut, kummelit, loistot) 2–5 km päähän.
2. Kiikaritoiminto: käyttäjä voi katsoa kiikarilla haluamaansa sektoriin, jolloin kaukana olevat merkit erottuvat.
3. Valonheittimen toimintaperiaate yöajoa varten (vaihe 4) mietitään samalla, mutta sitä ei toteuteta nyt.

## 2. Tehtävät

1. Merkkien leveys ja näkyvyys etäisyyden mukaan (`merimerkit3d.js`, tarvittaessa `merkit3d.js`):
   - Pienin leveys lasketaan laitepikseleinä, ei CSS-pikseleinä, ja se on 1,0 laitepikseliä (asetus). Kiikarilla leveys skaalautuu suurennuksen mukana, joten sama asetus toimii molemmissa.
   - Näkyvyysraja ja häivytys merkkiluokittain (asetuksina): kelluvat viitat ja poijut 1 200 m, kummelit ja muut pienet kiinteät merkit 2 500 m, linjataulut 4 000 m, loistot ja majakat (torni) 6 000 m. Merkki häivytetään läpinäkyvyydellä välillä 70–100 % rajasta ja jätetään piirtämättä rajan ulkopuolella. Paljain silmin katsottaessa raja on asetus, kiikarilla raja kerrotaan suurennuksella (7×), jolloin viitta näkyy noin 8 km päähän, mutta maaston varjostus pätee kuten nyt.
   - Varjostimen minimileveys ei saa kasvattaa merkin korkeutta eikä tehdä siitä tummaa pistettä: kun mitattu leveys on alle 1 laitepikselin, väri sekoitetaan taustaan leveyden suhteessa (peittävyys = leveys pikseleinä), jolloin ohut merkki näkyy haaleana viivana, ei täytenä pisteenä.
2. Kiikari (`nakyma.js` ja `sim.js`, nappi `sim.css`):
   - Nappi "Kiikari" 3D-näkymän reunassa (vähintään 44 px) ja näppäin B. Kiikarissa vaakakuvakulma on 7° (7×50-kiikari, asetus `kiikariHfovDeg`), katseen suunta on sama kuin pään kääntö ennen kiikarin ottoa, ja katsetta voi kääntää vetämällä kuten nyt, mutta herkkyys on jaettu suurennuksella. Reunoille piirretään pyöreä kiikarimaski (kaksi osittain päällekkäistä ympyrää tai yksi soikio) ja kuvaan lisätään pieni käden tärinä (satunnaiskävely, amplitudi noin 0,15°, taajuus noin 1–2 Hz, kasvaa nopeuden ja aallokon mukana, asetus). Kompassikaista näyttää kiikarin suunnan ja kapean sektorin. Toinen napautus napista, B tai napautus keskelle poistaa kiikarin ja palauttaa entisen kuvakulman ja katseen.
   - Kiikarissa ollessa komennot toimivat normaalisti ja kiikarin käyttö kirjataan komentolokiin (päälle ja pois, suunta), jotta purku näyttää, milloin navigoija katsoi kiikarilla.
   - Puhelimessa sama nappi, maski pienemmällä reunuksella.
3. Valonheittimen toimintaperiaate (vain dokumentti, raportin osa "Valonheitin, ehdotus vaiheeseen 4"): kuvaa 1–2 sivulla, miten valonheitin toteutetaan three.js:ssä: `SpotLight` ohjaamon katolla (paikka rungon mallista, noin x 5,5 m, z 3,9 m), keilan kulma noin 6°, kantama 300–500 m, suuntaus samalla veto-ohjauksella kuin katse (tai erillinen "Valonheitin seuraa katsetta" -valinta), heijastinmerkit (kummelin heijastin, viittojen heijastinnauhat, linjataulut) palauttavat valon kirkkaana (emissiivinen tai heijastava materiaali, joka reagoi keilan osumaan), vesi ja roiskeet valaistuina, keila näkyvänä kartiona sumussa tai sateessa, ja mitä `nakyma.js`:n valaistukseen (yön ympäristövalo, kuun valo) pitää muuttaa. Kirjaa oletukset ja mitä pitää kysyä tilaajalta (esimerkiksi Repan valonheittimen todellinen teho ja paikka). Käyttäjä on Repan päällikkö ja voi vastata.

## 3. Hyväksymiskriteerit

1. Kuvat ihmisen arvioitavaksi hakemistoon `lahdekoodi/simulaattori/shots/` etuliitteellä `3g_`: sama paikka kuin käyttäjän kuvassa (Mustalahden edusta, suunta 347°, Koukkuniemen viitta lähellä ja viitat 2–3 km päässä) ennen ja jälkeen leveyskorjauksen, ja sama paikka kiikarilla viittojen suuntaan. Kaukana olevat viitat eivät saa näkyä tummina pisteinä paljain silmin, kiikarilla niiden väri ja muoto erottuvat.
2. Mittaus: Playwright-testi lukee viitan piirretyn leveyden laitepikseleinä 300 m, 800 m ja 1 500 m etäisyydeltä (luo testiympäristö tai lue canvasin pikselit): 300 m noin 1–2 px, 800 m 1 px ja haalea, 1 500 m ei piirry. Kiikarilla 1 500 m viitta on vähintään 3 px leveä ja väri erottuu.
3. Kiikaritesti Chromium 1440 × 900, Chromium Pixel 7 ja WebKit iPhone 14: nappi ja B kytkevät kiikarin, kuvakulma 7°, maski piirtyy, veto kääntää katsetta, poistuminen palauttaa kuvakulman (100° tai 75°) ja katseen, komentolokissa rivit. Kuvat `3g_kiikari_desktop.png` ja `3g_kiikari_puhelin.png`.
4. Suorituskyky ei huonone: kuvaväli mitattuna samassa istunnossa ennen ja jälkeen enintään +10 %.
5. Vanhat testit läpi (`mobiili_pw.py`, `tutka_mobiili_pw.py`, `tutka_asettelu_pw.py`, `valkkyminen_pw.py`, `asettelu_3d_pw.py`, `katse_pw.py`, `plotteri_ev_pw.py` ja vaiheen 3f testit), `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` muuttumaton. `tutka.js`, `liike.js`, `harjoitus.js`, `plotteri.js` ja puusto eivät muutu.
6. Raportissa osa "Valonheitin, ehdotus vaiheeseen 4" kohdan 2.3 mukaan.

## 4. Työtapa

Kuten aiemmin: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8144`, tarkista onko jo käynnissä), Playwright asennettu (älä aja `playwright install`), Chromium SwiftShader-liput `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, WebKit `/opt/pw-browsers/webkit-2359`, lyhyet ajot timeoutilla, työloki `TYOLOKI.md` (jatka vaiheella 3g), ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä, desimaalipilkku. Älä koske hakemistoihin `/home/claude/reittikartta/`, `/home/claude/reittikartta-sim/`, `/home/claude/tutka/`, `/home/claude/reittikartta-aineisto/` ja `/home/claude/merimerkit/` (lue vapaasti). Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3g.md`, lyhyt ja numeroitu, ja lopuksi lyhyt yhteenveto tilaajalle: muuttuneet tiedostot, kriteerien 1–6 tulokset ja kuvien polut. Älä liitä koodia vastaukseen.
