# Raportti, vaihe 3l: venemoduulin liittäminen simulaattoriin

Päiväys 27.10.2026. Tekijä: Sonnet-agentti. Työ tehtiin vain hakemistossa `/home/claude/reittikartta-3l/` ja tutkan osalta kopiona hakemistossa `/home/claude/tutka/` (`tutka.js` ja `TUTKA.md`). Kuvat ovat hakemistossa `lahdekoodi/simulaattori/shots/` (etuliite `3l_`), mittaustulokset tiedostoissa `shots/tulos_3l_*.json` ja regressioajojen lokit hakemistossa `shots/logs3l/`. Työvaiheet ovat tiedostossa `TYOLOKI.md` (vaihe 3l).

## Mitä tehtiin

1. Venemoduuli `js/veneet3d.js` kopioitiin muuttamattomana ja liitettiin `sim.js`:ään sillan ja laiturin tapaan. Koska `nakyma.js` ei saa muuttua, `view.render` kääritään ja moduuli rekisteröidään `view.addExtra`-kutsulla. Lataus on `vesieste`- ja `maastokuvio`-ruuduista (z16) 1 500 m:n säteellä, sijoitus `asetaLaiturit`-kutsulla omassa tehtävässään (noin 0,2 ... 0,5 s), keinunta `paivita`-kutsulla joka kuvalla ja latausnäytön ehtoon `boatInit`.
2. Vesitaso pilkottiin. Magenta-kokeessa vanhan kahden kolmion vesitason läpi näkyi 4 213 vedenalaisen rungon pikseliä (ilman vettä 8 213). `sim.js` korvaa vesitason geometrian porrastetulla ruudukolla (10 m kameran kohdalla, 6 272 kolmiota) ja jäljelle jää 278 pikseliä (ilman vettä 8 168), jotka ovat vesiviivan reunapikseleitä.
3. Laatuasetus: täysi laatu 1 500 m, lähimallit alle 300 m ja kaukomallit kauempana, kevyt laatu 600 m ja vain kaukomallit. Täyttöaste 70 % ja kausi kesä. Poijut ja köydet piirretään täydellä laadulla alle 300 m:n ja kevyellä alle 150 m:n päästä.
4. Tutka: kiinnitetyt veneet ovat pistekaikuja (soutuvene 0,25, moottorivene 0,45, purjevene 0,6, enimmäisetäisyys 2 500 m, ei välkyntää, näkyvyys ja varjo kuten merkeillä). Lähde on moduulin `lahella`-rajapinta. Muutos on `tutka.js`:ssä ja kopioitu `/home/claude/tutka/`-hakemistoon (md5 sama) sekä kuvattu `TUTKA.md`:n kohdassa 4.6.
5. Törmäys: `tormays.js` tarkistaa veneiden suorakulmat aluksen runkopolygonia vastaan. Alle 1 kn on kosketus (alus pysähtyy, ajo jatkuu) ja 1 kn tai yli törmäys (banneri, ajo pysähtyy). Lokiin ja purkuun tulee "Kosketus veneeseen" ja "Törmäys veneeseen". Veneet eivät liiku.
6. Plotteriin ei tehty muutoksia.

## Kriteerit

1. Kuvat. Naistenlahti 150 m päästä (`3l_naistenlahti_150m_deck.png`, `3l_naistenlahti_150m_silmapiste.png`), laiturin vierestä 20 m (`3l_laituri_20m_deck.png`), Mustalahti (`3l_mustalahti_deck.png`, `3l_mustalahti_silmapiste.png`) ja Pixel 7 kevyellä laadulla (`3l_naistenlahti_pixel7_kevyt.png`, `3l_naistenlahti_pixel7_kevyt_silmapiste.png`). Veneitä satamissa (täyttöaste 70 %):
   - Naistenlahti 644 venettä: soutuvene 106, pieni moottorivene 215, keskikokoinen moottorivene 204, purjevene 119.
   - Mustalahti 11 venettä: soutuvene 2, pieni moottorivene 5, keskikokoinen moottorivene 4, purjevene 0.
   - Koko lataus (säde 1 500 m) 770 venettä, hylätty paikka: maa 98, matala 5, törmäys 63.
2. Tutka. `3l_tutka_naistenlahti_veneet.png` (plotteri ja tutka rinnakkain, 0,25 mpk) ja vertailu `3l_tutka_naistenlahti_vertailu.png` (veneet päällä, pois ja erotus). Veneiden kaiut näkyvät laiturien välissä ja vierellä: erotuskuvassa 966 pikseliä, kun kahden samanlaisen kierroksen ero on 0 ... 1 pikseliä. Siilinkarissa ei ole veneitä, mutta kuva ei ole täsmälleen ennallaan. Naistenlahden 655 venettä ovat noin 1,1 km:n päässä 2 500 m:n kantaman sisällä ja tuottavat muutaman heikon kaiun (erotus 90 pikseliä, kohina 6 ... 15 pikseliä, `3l_tutka_siilinkari_vertailu.png`). Pääpiirteet ovat ennallaan.
3. Törmäys (`3l_tormays_vene.png`, `3l_purku_tormays_vene.png`). Kohdevene on yksi sataman uloimmista kiinnitetyistä veneistä, johon on suora ajolinja avovedeltä. Ajo 0,8 kn: kosketus, nopeus 0,00 kn, keula 0,03 m veneestä, lokiin "Kosketus veneeseen 0,8 kn", ajo jatkuu ja peruutus irti toimii. Ajo 4 kn: banneri "Törmäys veneeseen 4,0 kn. Alus on pysäytetty.", keula 0,19 m veneestä (raja 1 m), loki "Törmäys veneeseen 4,0 kn". Vene ei liikkunut (paikka ja suunta samat ennen ja jälkeen). Purku listaa kosketuksen ja kaksi törmäystä aikoineen. Törmäystarkistus sovelluksessa keskimäärin 0,038 ms askeleelta. Testi `veneet3l_tormays_pw.py` 0 virhettä.
4. Suorituskyky (Naistenlahti 150 m päästä, 719 venettä latauksessa, samassa istunnossa veneet pois ja päällä vuorotellen, 6 kierrosta, 30 kuvaa lohkossa):
   - Deck, täysi laatu: kuvaväli suhde 1,11 (lohkojen keskiarvo), mediaani 1,08 ja pienin lohko 1,13. Raja 1,15 täyttyy. Piirtokutsut 151 (ilman veneitä 139), kolmiot 258 809 (ilman 191 492). Rajat 300 ja 450 000 täyttyvät.
   - Pixel 7, kevyt laatu: suhde 1,04 (lohkojen keskiarvo), mediaani 0,99 ja pienin lohko 1,11. Raja 1,05 täyttyy keskiarvolla ja mediaanilla mutta ei pienimmällä lohkolla. Piirtokutsut 112, kolmiot 184 423.
   - Luotettavuus: ajoympäristössä on 2 prosessoria ja toinen agentti ajoi rinnakkain, joten absoluuttiset kuvavälit vaihtelivat 450 ... 1 350 ms ja yksittäisten lohkojen suhteet 0,9 ... 1,3. Ennen poijurajan tiukennusta (600 m, 258 809 kolmion sijaan 267 749) deck-suhde oli 1,17 ... 1,24, joten poijut rajattiin 300 m:iin.
   - Veneiden pohja ei näy veden läpi: magentapikselit 4 213 ennen ja 278 jälkeen (kohta Mitä tehtiin 2). Lähikuvat `3l_pohja_lahikuva_a.png`, `_b.png` ja `_c.png`.
5. Regressio (ajettu lopullisella koodilla, lokit `shots/logs3l/`): `mobiili_pw.py` Chromium 44/0 ja WebKit 44/0, `valkkyminen_pw.py` 0 tyhjää ruutua 20:stä, `asettelu_3d_pw.py` 89/0, `tormays_pw.py` läpi, `peruutus_pw.py` läpi, `kayttoliittyma_3h_pw.py` 18/0 ja `tutka_viritys_pw.py` 10/0. `build.py` tuotti `simulaattori.html`:n (1 471 320 tavua, ei ulkoisia riippuvuuksia lisätty), yksitiedostoversio käynnistyy ja lataa veneet (770, ei konsolivirheitä). Repojuuren `index.html` md5 edff5aed... ja `lahdekoodi/index.html` ovat muuttumattomat. `plotteri.js`, `liike.js`, `nakyma.js`, `maasto.js`, `runko.js` ja merkkitiedostot ovat md5-tarkistuksella muuttumattomat.

## Muuttuneet tiedostot

- `lahdekoodi/simulaattori/js/sim.js`: rivit 8, 27, 186-188 (vesitason pilkonta ja venemoduulin liitäntä), 194-279 (veneblokki: `BOAT` 198, `splitWater` 202-218, `attachBoats` 219, `applyBoatsQuality` 230, `boatsAt` 235, `loadBoats` 239, `startBoats` 269, `maybeLoadBoats` 275), 420 (törmäyslähde), 453 (`startBoats`), 486 (tutkan `veneet`), 642 (laatuvalikko), 884 (rebase), 899 (latausnäytön ehto), 915 (silmukka) ja 1128 (testikoukku `setBoats`).
- `js/veneet3d.js` (uusi, muuttamaton kopio), `js/tormays.js`, `js/tutka.js`, `js/harjoitus.js`, `simulaattori.html` (script-viite) ja `simulaattori.html` repojuuressa (build).
- `/home/claude/tutka/tutka.js` ja `/home/claude/tutka/TUTKA.md`.
- Testit `testit/veneet3l_*.py` (apu, smoke, kuvat, kuvat_ml, pohja, tutka, tormays, suoritus).

## Rajoitukset

1. Kuvavälin mittaus on epätarkka jaetussa 2 prosessorin ympäristössä. Luvut ovat lohkojen keskiarvoja vuorottelevista mittauksista, ja pienimmän lohkon suhde kevyellä laadulla (1,11) ylittää rajan 1,05. Sama mittaus kannattaa toistaa kuormittamattomalla koneella.
2. Siilinkarin tutkakuva sisältää heikkoja kaikuja Naistenlahden veneistä (kohta Kriteerit 2).
3. Vesitason pilkonta jättää vesiviivan reunapikseleitä (3,4 % ilman vettä -kokeen pikseleistä).
