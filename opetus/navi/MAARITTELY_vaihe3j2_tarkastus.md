# Määrittely, vaihe 3j-2: maisemavaiheen tarkastus ja viimeistely ennen yhdistämistä

Päiväys 26.10.2026. Tekijä: Sonnet-agentti (uusi). Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-3j/`, jossa edellinen agentti teki vaiheen 3j (maiseman ulkoasu) kahdella kierroksella mutta ei ehtinyt ajaa vanhoja testejä lopullisella koodilla eikä ottaa kaikkia kuvia. Lue ensin `lahdekoodi/simulaattori/RAPORTTI_vaihe3j.md`, `TYOLOKI.md` (osio Vaihe 3j, molemmat kierrokset) ja määrittely `/home/claude/opetus/navi/MAARITTELY_vaihe3j_maisema.md`. Tämä vaihe ei lisää uusia ominaisuuksia. Tavoite on saada 3j yhdistettäväksi: regressiot korjattu, kuvat otettu, ilmeiset virheet korjattu.

## 1. Tehtävät järjestyksessä

1. Aja vanhat testit lopullisella koodilla ja korjaa, mitä ne paljastavat: `mobiili_pw.py` (Chromium ja WebKit), `valkkyminen_pw.py`, `asettelu_3d_pw.py`, `katse_pw.py`, `kiikari3g_pw.py`, `kasky_pw.py`, `aika_pw.py`. Yksi ajo kerrallaan, lokitiedostoon, ja tulokset raporttiin lukuina. Jos testi kaatuu maiseman muutoksen takia (esimerkiksi `__view`-rajapinnan nimi muuttui), korjaa koodi, ei testiä, ellei testi mittaa poistettua asiaa (kirjaa silloin).
2. Katso kuva `shots/3j_A_jalkeen3.png`: vasemmalla veden päällä noin 150 m päässä on irrallinen vihreä kappale (todennäköisesti puu tai pensas, joka on sijoitettu veteen tai rakennetun rannan reunalle). Selvitä syy (puiden sijoitus vesialueelle, maskin reuna tai kapean kaistan sääntö) ja korjaa niin, että puita ei sijoiteta vesialueelle eikä rakennetulle rannalle. Tarkista myös, ettei puita ole laitureilla tai teillä.
3. Ota puuttuvat kuvat lopullisella koodilla `shots/`-hakemistoon: pisteet A, B ja C deck-asettelussa 1440 × 900 (`3j_final_A.png` jne.), samat Pixel 7 -profiililla (`3j_final_A_pixel7.png`), piste B kello 7.00 ja 19.30 (`3j_final_B_aamu.png`, `3j_final_B_ilta.png`), Naistenlahden läntinen aallonmurtaja 100 m päästä (`3j_final_aallonmurtaja.png`) ja kevyt laatu pisteestä A (`3j_final_A_kevyt.png`). Kuvat otetaan vasta, kun maasto on latautunut (`terrain.idle()`), ja koko näkymän kuvan lisäksi pelkkä 3D-canvas (`_3d`).
4. Suorituskyky: älä optimoi. Mittaa vain kevyt laatu pisteessä A Pixel 7 -profiililla samalla `ab3j_pw.py`-tavalla (vanha vs uusi kevyt) ja kirjaa suhde. Täyden laadun suhde 1,7 on jo tiedossa ja hyväksytään tässä ympäristössä, koska oikea laite mittaa sen uudelleen.
5. Korkeustarkistus uudelleen lopullisella koodilla (Pispalanharju ja Näsinneulan juuri, verkko z16 ja z13), koska ruudukon tiheyttä pienennettiin tarkistuksen jälkeen. Jos z13-korkeus poikkeaa laatasta yli 5 m, palauta tiheys.
6. `build.py` ja yhden tiedoston version `mobiili_pw.py` Chromiumilla.

## 2. Hyväksymiskriteerit

1. Kaikki kohdan 1.1 testit läpi (0 virhettä) tai perusteltu poikkeus kirjattuna.
2. Irrallinen kappale poissa, ja lokissa luku, montako puuta hylättiin vesialueella tai rakennetulla rannalla.
3. Kohdan 1.3 kuvat olemassa.
4. Kevyen laadun suhde mitattu ja kirjattu.
5. Korkeustarkistus kirjattu.
6. Raportti `RAPORTTI_vaihe3j.md`:n loppuun osiona "Tarkastus 3j-2" (ei uutta tiedostoa), lyhyt ja numeroitu, ja TYOLOKI.md jatkettu.

## 3. Työtapa

Kuten aiemmin: paketti portissa 8144 (tarkista), lähdesivu omalla portilla hakemistossa `lahdekoodi/` (esimerkiksi 8168, tarkista vapaus), `SIM` ja `PAKETTI` ympäristömuuttujat, Playwright asennettu (älä aja `playwright install`), SwiftShader-liput, WebKit `/opt/pw-browsers/webkit-2359`, yksi Playwright-ajo kerrallaan, lyhyet ajot, prosessien lopetus PID:llä. Älä koske muihin hakemistoihin kuin `/home/claude/reittikartta-3j/`. Älä muuta `plotteri.js`, `tutka.js`, `harjoitus.js`, `liike.js`, `runko.js`, merkkejä tai laitureita. Ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä, desimaalipilkku. Aikaraja: tavoite on valmis kolmessa tunnissa, joten älä jää hiomaan. Palauta lopuksi lyhyt yhteenveto: testitulokset lukuina, irrallisen kappaleen syy ja korjaus, kuvien polut, kevyen laadun suhde, korkeustarkistus. Älä liitä koodia vastaukseen.
