# Raportti, vaihe 3c: tutkan liittäminen simulaattoriin

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työloki on tiedostossa `TYOLOKI.md` (kohdat Vaihe 3c, askeleet 0–8).

## 1. Mitä tehtiin

1. Tutkamoduuli `tutka.js` kopioitiin sellaisenaan hakemistoon `js/` (md5 täsmää lähteen kanssa) ja ladataan `simulaattori.html`-sivulla `aineisto.js`:n jälkeen. Tutka saa sijaintinsa (`Paikka.worldToEN`), tosisuuntansa (`Liike.trueHdg`), nopeutensa (`S.v`) ja aikansa (`S.clockMs` lisättynä kuluvalla 0,1 sekunnin askeleella, jotta pyyhkäisy etenee tasaisesti) samasta tilasta `G.S` kuin plotteri. Tutka käyttää jaettua `Aineisto`-oliota eikä lue tiedostoja toiseen kertaan. Tilaa syötetään 50 ms:n välein, ja kuva piirretään 50 ms:n välein, kun tutka on puhelimen päänäkymä, ja muuten 100 ms:n välein.
2. Aloitusnäytössä on valinta Näytöt (plotteri, tutka, molemmat), oletuksena plotteri. Valinta rajaa käytettävissä olevat mittarit. Pelkällä tutkalla plotteria ei ole.
3. Puhelimessa pystyasennossa päänäkymän mittarin ruudussa on nappi (plotterissa Tutka, tutkassa Plotteri), jolla mittari vaihtuu. Pieni 3D-ikkuna pysyy kulmassa, ja sen napautus vaihtaa päänäkymän kuten ennenkin. Tutkan kuva alkaa pienen 3D-ikkunan alapuolelta, joten ikkuna ei peitä tutkan nappeja. Vaaka-asennossa olevan puhelimen tutkanäkymässä pieni 3D-ikkuna siirtyy vasempaan alakulmaan, koska tutkan napit ovat silloin oikeassa reunassa.
4. Rinnakkaisasettelu (`wide`) tulee nyt voimaan myös kaikilla vähintään 1024 px leveillä vaaka-asennon näytöillä, koska aiempi suhdeluku (ruudun leveys yli 1,25 kertaa korkeus) olisi jättänyt 1024 x 768 -tabletin puhelinasetteluun. Tabletilla mittarin ruutu (plotteri tai tutka) ja 3D ovat vierekkäin. Vähintään 1440 px leveällä näytöllä mittaria voi kiertää napilla plotteri, tutka ja molemmat, ja molemmat-tilassa plotteri, 3D ja tutka ovat kolmena ruutuna (alkutila Molemmat-valinnalla). Näppäin R kiertää samaa valintaa.
5. Kun tutka on pienenä ikkunana, sen napit piilotetaan ja kuva käyttää koko ikkunan.
6. Tutkan sammutus (nappi Tutka pois ja peitteen nappi Päälle) kirjataan komentolokiin lajilla `tutka` kuten plotterin sammutus, ja peitteen aikana tutkan päivitys lepää. Harjoituksen purkuun on lisätty rivit Tutka näkyvissä (osuus ajasta ja aika, näkyvissä tarkoittaa tutkan olevan päällä ja ruudulla), josta päänäkymänä tai omana ruutunaan, sekä Tutka pois päältä. Komentolokin teksti Tutka pois ja Tutka päälle tulee `sim.js`:stä, `harjoitus.js`:ään ei koskettu.
7. Tutkaa ei päivitetä, kun se ei ole näkyvissä, ja plotterin päivitys lepää samoin, kun mittarina on tutka. Ruudukko vapautetaan purkuun siirryttäessä.

## 2. Muuttuneet tiedostot

- `lahdekoodi/simulaattori/js/tutka.js` (uusi, kopio)
- `lahdekoodi/simulaattori/js/sim.js`
- `lahdekoodi/simulaattori/css/sim.css`
- `lahdekoodi/simulaattori.html` (lähde) ja build-tuote `/home/claude/reittikartta-sim/simulaattori.html`
- `lahdekoodi/simulaattori/TYOLOKI.md` ja tämä raportti
- Uudet testit hakemistossa `lahdekoodi/simulaattori/testit/`: `tutka_mobiili_pw.py`, `tutka_kuvat_pw.py`, `tutka_kriteeri1_pw.py` (tulos `tulos_3c_kriteeri1.json`), `tutka_suorituskyky_pw.py` ja `tutka_asettelu_pw.py`.

Ennallaan (md5 tarkistettu): `liike.js`, `harjoitus.js`, `merkit.js`, `maasto.js`, juuren `index.html` ja `dist/Reittikartta.html` (edff5aed...). Hakemistoihin `reittikartta`, `reittikartta-maasto`, `reittikartta-aineisto`, `merimerkit` ja `tutka` ei kosketettu (tutkan hakemistoa vain luettiin ja tarjoiltiin esikatseluvertailua varten).

## 3. Hyväksymiskriteerit

1. Tutka toimii simulaattorissa ajon aikana. Siilinkarin kohdalla (E 328045, N 6824881, 1,5 mpk, pohjoinen ylös) simulaattorin tutka ja esikatselun tutka antavat kaikilla 360 säteellä saman ensimmäisen osuman (suurin ero 0,00 m, 174 osumaa). Kolme erikseen poimittua sädettä: 142° 705,78 m, 192° 1 250,77 m ja 234° 2 653,00 m, molemmissa samat. Silmämääräinen vertailu on kuvassa `3c_kriteeri1_vertailu_siilinkari_1-5_mpk.png` (esikatselu, simulaattori ja erotus), ja kuvat ovat samanlaiset. Erotuskuvassa näkyy vain heikko VRM-renkaan ja kuvan skaalauksen ero. Vertailu tehtiin paikassa ja pysäytetyssä tilassa, ei ajossa, koska ajossa paikka ja pyyhkäisyn vaihe muuttuvat joka hetki.
2. Kuvaväli 30 solmun ajossa (Chromium Pixel 7, SwiftShader, automaattiohjaus, aikakerroin 1, 20 s mittaus). Ilman tutkaa 3D päänäkymänä mediaani 50,0 ms (p95 100 ms), raja alle 60 ms täyttyy. Tutka päällä pienenä ikkunana ja 3D päänäkymänä mediaani 49,9 ms (p95 83 ms), raja alle 70 ms täyttyy. Tutka päänäkymänä ja 3D pienenä mediaani 16,8 ms (p95 117 ms). Leveällä 1600 x 900 -näytöllä pelkkä plotteri ja kolme ruutua antoivat molemmat 133 ms, joten tämä hitaus johtuu ohjelmistopiirrosta ja suuresta 3D-ikkunasta eikä tutkasta. Tutkan oma piirto kesti 1–10 ms. Oikeaa Pixel 7:ää ei ole mitattu.
3. Mobiilitestit (`tutka_mobiili_pw.py`): Chromium Pixel 7 32 tarkistusta ja WebKit iPhone 14 30 tarkistusta, kaikki läpi sekä lähdesivulla että yhden tiedoston `simulaattori.html`:llä. Näkymän vaihto plotteri–tutka, 3D-ikkuna kulmassa, aluenapit (1,5 → 2 → 1,5 → 1 mpk), Suunta ylös ja Jälki, EBL pyyhkäisyllä (135,0° ja Chromiumin oikealla kosketuksella 260,0°), VRM nipistyksellä (0,50 → 0,80 mpk, suhde 1,60, ja oikealla kosketuksella suhde 0,80), sammutus ja komentoloki, ei vaakavieritystä, ei konsolivirheitä, kaikki kosketuskohteet vähintään 44 px. Vanha `mobiili_pw.py` läpi molemmilla laitteilla (42/0). Asettelutesti (`tutka_asettelu_pw.py`) koissa 915 x 412, 1024 x 768, 1280 x 800, 1440 x 900 ja 1920 x 1080: ei alle 44 px kohteita, ei päällekkäisyyksiä, ei konsolivirheitä.
4. Kuvakaappaukset hakemistossa `/home/claude/reittikartta-sim/lahdekoodi/simulaattori/shots/`:
   - `3c_puhelin_tutka_ajo.png` (Chromium Pixel 7, 30 kn) ja `3c_puhelin_webkit_tutka_ajo.png` (WebKit iPhone 14)
   - `3c_tabletti_3d_ja_tutka.png` (1024 x 768, 3D ja tutka rinnakkain)
   - `3c_tietokone_kolme_ruutua.png` (1600 x 900, plotteri, 3D ja tutka)
   - `3c_purku_tutkatieto.png` ja `3c_purku_komentoloki.png` (koko ajo, tutka näkyvissä 82 % ajasta, pois päältä 0:26)
   - `3c_kriteeri1_vertailu_siilinkari_1-5_mpk.png`
5. `build.py` tuottaa `simulaattori.html`-tiedoston (1,39 Mt, ei ulkoisia script- tai link-viittauksia). Juuren `index.html` ja `dist/Reittikartta.html` ovat byte-identtiset aiemman kanssa (md5 edff5aed...).

## 4. Poikkeamat, huomiot ja rajoitukset

- Moduulissa ei ole EBL- ja VRM-nappeja. EBL ja VRM ovat moduulin omia kosketus- ja hiirieleitä (veto ja nipistys) sekä näppäimiä, kuten `TUTKA.md` kuvaa. Moduulin napit ovat Alue −, Alue +, Suunta ylös, Jälki ja Sade, ja niitä ei muutettu. Nappeja ei lisätty simulaattorin puolelle.
- Koska `tutka.js` on kopioitu muuttamattomana, tutkan nappien leveys skaalautuu kapealla ruudulla (alle 347 px leveällä ruudulla yksittäinen nappi voisi jäädä alle 44 px, mutta moduulin `min-width` pitää sen 44 pikselissä). Kaikki testatut koot täyttävät 44 px.
- Löytyi vanha puute: vaaka-asennon komentopalstan −2- ja +2-napit olivat 40 px leveitä. Korjattu yhdellä CSS-säännöllä (`#game.land .row.r6`). Liikemalliin tai harjoitukseen tämä ei vaikuta.
- Näkyvyysaika lasketaan simulaatioajassa. Pienenä ikkunana oleva tutka lasketaan näkyvissä olevaksi mutta ei päänäkymäksi. Koko ajossa, jossa tutka oli aina päänäkymä, luvut ovat siksi samat (82 % ja 82 %).
- Pelkällä tutkalla pohjakosketuksessa plotteria ei voi näyttää, joten paikka nähdään vasta purussa. Molemmat-valinnalla ruutu vaihtuu pohjakosketuksessa plotteriin.
- Muistia: tutkan ruudukko on enintään noin 39 Mt ja se jaetaan Aineiston välimuistin kanssa vain lukemisen osalta. Pitkän ajan piilotuksen ruudukon vapautusta ei käytetä ajon aikana, koska moduulin `varmista` ei rakentaisi vapautettuja ruutuja uudelleen ennen kuin alus on liikkunut. Vapautus tehdään vasta purkuun siirryttäessä.
- Suorituskyky on mitattu simuloidulla Pixel 7:llä ohjelmistopiirrolla. WebKitillä monisormikosketus on testattu vain synteettisillä pointer-tapahtumilla (ei Playwrightin monisormirajapintaa).
