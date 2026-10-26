# Määrittely, vaihe 3i: sillat 3D-näkymään

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-3i/` (kopio Reittikartan `maasto`-haarasta, commit 5e6e111). Rinnakkain toinen agentti tekee vaiheen 3h hakemistossa `/home/claude/reittikartta-3h/` (plotteri, tutka, reitti, ja sillat tutkan kaikumalliin), joten tässä vaiheessa ei kosketa tiedostoihin `plotteri.js`, `tutka.js`, `harjoitus.js` eikä `sim.js`:n muihin kohtiin kuin yhteen lataus- ja piirtokutsuun, joka listataan raportissa rivinumeroin.

## 1. Käyttäjän havainto

Tammerkosken ylittävä silta Mustalahden lähellä puuttuu 3D-näkymästä (ja tutkasta, joka tehdään vaiheessa 3h). Sillat ovat sisävesillä tärkeitä maamerkkejä ja navigoinnin esteitä (alikulkukorkeus).

## 2. Aineisto

Paketin kerroksessa `tie` (viivat, z8–16, `/home/claude/opetus/navi/putki/ulos/aineisto.json`) on kentät `luokka` (MML:n tieluokka), `nimi`, `tienumero`, `paallyste` ja `taso` (MML:n tasosijainti). Silta on tieosuus, jonka `taso` on suurempi kuin 0. `maasto.js` piirtää tiet maaston tekstuuriin (rivit noin 579–600), mutta ei siltoja rakenteina. Selvitä ensin, montako `taso > 0` -osuutta paketissa on Näsijärven eteläpään alueella (Mustalahti, Tammerkoski, Naistenlahti, Santalahti) ja mitkä niistä ylittävät vettä (maastokuvion `jarvi` tai `virtavesi`). Kirjaa luettelo raporttiin nimineen. Jos Tammerkosken silta puuttuu paketista kokonaan (esimerkiksi koska tie-kerros on rajattu rantapuskuriin tai `taso` jää pois), kirjaa se ja ehdota tietoputken korjaus (`/home/claude/reittikartta-aineisto/rakenna.py`, `tee_tie`), mutta älä muuta tietoputkea.

## 3. Tehtävät

1. Uusi moduuli `js/sillat3d.js` (malli `laiturit3d.js`): rakentaa sillat yhdistettynä geometriana alle 2 500 m etäisyydellä aluksesta. Siltaosuus on `tie`-viiva, jonka `taso > 0`, ja siitä otetaan veden päällä oleva osa sekä 15 m maalle kummassakin päässä. Kansi: leveys tieluokan mukaan (valtatie ja kantatie 12 m, muu autotie 8 m, kevyen liikenteen väylä 4 m, rautatie 5 m), paksuus 1,2 m, kannen alapinta korkeudella, joka on tien maanpinnan korkeus päissä (korkeusmallista `maasto.pmtiles`) lineaarisesti interpoloituna, mutta vähintään 4 m vedenpinnan yläpuolella (asetus). Kaiteet 1,1 m korkeina ohuina reunapalkkeina, ja pilarit 1,5 m leveinä laatikoina 25 m välein vedestä kanteen. Väri vaalea betoninharmaa, kaiteet tummempi harmaa, rautatiesilta tummanruskea teräs. Jos tieosuudella on `nimi`, se säilytetään olion tietona myöhempää käyttöä varten (ei piirretä nyt).
2. Liitä moduuli `sim.js`:ään samaan kohtaan kuin laiturit (lataus solmuittain ja piirto), ja `simulaattori.html`:ään skriptiviite. `build.py` ottaa sen mukaan.
3. Alikulkukorkeus: jos vaiheessa 2 löytyy lähde (esimerkiksi Väyläviraston `vesivaylat`-aineiston alikulkukorkeus tai paketin turvalaitteet), kirjaa se raporttiin, mutta älä toteuta.

## 4. Hyväksymiskriteerit

1. Raportissa luettelo paketin siltaosuuksista alueella (nimi, tieluokka, pituus veden päällä) ja todettu, onko Tammerkosken silta Mustalahden lähellä mukana.
2. Kuvat `lahdekoodi/simulaattori/shots/` etuliitteellä `3i_`: Tammerkosken silta Mustalahden edustalta 300 m päästä ja sillan alta tai vierestä 50 m päästä, Naistenlahden tai Santalahden mahdolliset sillat, ja koko näkymä 1440 × 900 deck-asettelussa samasta paikasta kuin käyttäjän kuva `/mnt/user-data/attachments/09de4811-b059-506c-8fe2-f0c820c90e7e/017c8f0c-image.png` (Naistenlahden satama, suunta 112°, katse 067°).
3. Kolmioita siltojen osalta alle 20 000 ja koko kuvan kolmiomäärä alle 300 000. Kuvaväli samassa istunnossa ennen ja jälkeen enintään +5 %.
4. Vanhat testit läpi (`mobiili_pw.py`, `valkkyminen_pw.py`, `asettelu_3d_pw.py`, `katse_pw.py`, `kiikari3g_pw.py`), `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` muuttumaton (md5 edff5aed...). `plotteri.js`, `tutka.js`, `harjoitus.js`, `liike.js`, `nakyma.js`, merkit, laiturit ja maasto eivät muutu.

## 5. Työtapa

Kuten aiemmin: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8144` on todennäköisesti käynnissä, tarkista), lähdesivu `python3 -m http.server 8162 --bind 127.0.0.1` hakemistossa `lahdekoodi/`, testit käyttävät ympäristömuuttujia `SIM` ja `PAKETTI` (`testit/pw.py`). Playwright asennettu (älä aja `playwright install`), Chromium SwiftShader-liput `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, WebKit `/opt/pw-browsers/webkit-2359`, lyhyet ajot timeoutilla (ympäristö on hidas, toinen agentti ajaa testejä rinnakkain, joten aikarajat väljiksi), työloki `TYOLOKI.md` (jatka vaiheella 3i), ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä, desimaalipilkku. Älä koske muihin hakemistoihin kuin `/home/claude/reittikartta-3i/` (lue vapaasti). Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3i.md`, lyhyt ja numeroitu, ja lopuksi lyhyt yhteenveto tilaajalle: siltaluettelo, muuttuneet tiedostot (`sim.js` rivinumeroin), kriteerien 1–4 tulokset ja kuvien polut. Älä liitä koodia vastaukseen.
