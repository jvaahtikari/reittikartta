# Raportti, vaihe 3f: korjaukset käyttäjän toisen testin perusteella

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Kuvat ovat hakemistossa `lahdekoodi/simulaattori/shots/`, testit hakemistossa `testit/`, työvaiheet `TYOLOKI.md`:ssä (Vaihe 3f).

## Mitä tehtiin

1. Laiturit ja vesikivet 3D-näkymään. Uusi `js/laiturit3d.js` lukee paketin kerroksen `vesieste` z16-ruuduista alle 1 500 m aluksesta ja rakentaa yhden yhdistetyn verkon (yksi piirtokutsu). Kapea laituri on 2 m leveä, kansi 0,5 m vedenpinnan yläpuolella ja vaalea harmaa 0,5 m sivupinta. Leveä laituri on 5 m leveä, aallonmurtaja 1,0 m korkea harmaa kivimuuri 4 m leveydellä. Pinnassa ja pinnan yläpuolella olevat vesikivet ovat 1–2 m leveitä ja 0,3–0,6 m korkeita, ja ne toistuvat samoina siemenestä. Vedenalaisia ei piirretä. Verkko rakennetaan uudelleen, kun alus on siirtynyt vähintään 120 m tai uusia ruutuja on tullut.
2. EBL ja VRM yhdessä. Veto tai napautus plotterilla asettaa EBL:n tosisuuntimaksi ja VRM:n etäisyydeksi (mpk, kaksi desimaalia) vedetyn pisteen mukaan, ja risti piirtyy pisteeseen. Kartta ei panoroidu vedon aikana. Komentolokiin tulee yksi rivi per veto. Nipistys, rulla ja näppäimet ovat hienosäätöä.
3. Kompassikaistan käskymerkki. Vihreä kolmio kaistan alareunassa osoittaa komennetun tosisuunnan ja päällekkäin katseen merkin kanssa, kun suunnat ovat samat. Kaistan ulkopuolella reunassa on nuoli. Merkki päivittyy heti, kun käsky annetaan.
4. Tehtävä 2.4 (komentopalstan leikkautuminen) ja kriteeri 3.4 peruttiin tilaajan korjauksella. Asettelu on vaiheen 3d tilassa ja CSS on muuttumaton.

## Kriteerit

1. Kuvat `3f_naistenlahti_laiturit_150m.png`, `3f_mustalahti_laiturit_200m.png` (ja `_b`) sekä `3f_vesikivet_120m.png`. Naistenlahti: 40 kapeaa laituria, 0 leveää, 0 aallonmurtajaa ja 5 kiveä. Mustalahti: 42 kapeaa, 2 leveää, 0 aallonmurtajaa ja 4 kiveä. Laiturien ja kivien kolmioita enintään 1 120, koko kuvan kolmioita enintään 65 000, raja 300 000 täyttyy.
2. EBL ja VRM: Chromium Pixel 7 24/24, WebKit iPhone 14 24/24 ja hiiri 1440 x 900 25/25. Veto 60° T ja 0,41 mpk antoi 59,88° ja 0,409 mpk, napautus 124,96° ja 0,180 mpk, joten ero on enintään 0,04° ja 0,001 mpk (vaatimus 1° ja 0,02 mpk). Neljä vetoa antoi neljä lokiriviä. Kuvat `3f_ebl_vrm_veto_desktop.png`, `_chromium.png` ja `_webkit.png`.
3. Käsky "Suunta 090": desktop 11/11, Chromium 11/11 ja WebKit 11/11. Merkki on kohdassa 090 (x 1 228,4, odotus 1 228,4) ja katseen merkki kohdassa 050. Kuva `3f_kompassikaista_kasky.png`, laitekohtaiset `_chromium` ja `_webkit`, reunanuoli `_reunanuoli`.
4. Peruttu.
5. Vanhat testit läpi: `mobiili_pw.py` 42/0 (Chromium ja WebKit), `tutka_mobiili_pw.py` 32/0 ja 30/0, `tutka_asettelu_pw.py` 0 virhettä neljässä koossa, `valkkyminen_pw.py` 0/20 kolmella laitteella, `asettelu_3d_pw.py` 89/0, `katse_pw.py` 5/0, 5/0 ja 4/0, `plotteri_ev_pw.py` 14/0, 12/0 ja 12/0. `build.py` tuottaa `simulaattori.html`-tiedoston (1,16 Mt, ei ulkoisia viittauksia) ja se läpäisee `mobiili_pw.py` 42/0. `index.html` ja `dist/Reittikartta.html` ovat muuttumattomat (md5 `edff5aed...`). `tutka.js`, `liike.js`, `harjoitus.js`, merkit, `maasto.js` ja puusto ovat muuttumattomat.

## sim.js:n muutokset (tilaajan käsin yhdistettäväksi)

1. Rivi 318, `onEV`: `evpiste`-rivi torjutaan vain, jos edellinen lokirivi on sama `evpiste` samoilla `ebl`- ja `vrm`-arvoilla.
2. Rivi 328, `cmdHeading`: kutsun `L.stepHeadingOrder(G.S, dir, long)` perään `updateUi()`, jotta käskyteksti ja merkki päivittyvät heti.
3. Rivi 599, `drawCompass`: lopussa `G.compass = root.Nakyma.drawCommandMarker(g, w, h, look, hf / RAD, G.S.orderHdg);`.
4. Rivi 644, latausvalmiusehto: lisätty `(!v.piers || v.piers.idle()) &&`.
5. Rivi 728, `cmdLabel`: uusi haara `evpiste` ("Plotterin EBL 060° T ja VRM 0,41 mpk").

Muut muuttuneet tiedostot: `js/laiturit3d.js` (uusi), `js/nakyma.js` (laiturit ja `drawCommandMarker`), `js/plotteri.js` (osoitinkäsittelijät), `simulaattori.html` (skriptiviite ja ohjeteksti), testit `pw.py`, `nakyma_testi.html`, `kuva3b_pw.py`, `plotteri_ev_pw.py`, `plotteri_ev3f_pw.py` (uusi) ja `kasky_pw.py` (uusi).

## Muuta

1. Paketissa ei ole aallonmurtajia eikä aluemaisia leveitä laitureita, joten ne on tarkistettu vain synteettisillä Node-testeillä (muoto, normaalit, kolmioiden kierto). Aineiston täydentyessä ne piirtyvät samalla koodilla.
2. Vesikiviä ei ole lähellä Naistenlahtea eikä Mustalahtea, joten niille on oma kuva. Mustalahden laiturit ovat lyhyitä, ja ne erottuvat 200 m päästä vain ohuina viivoina.
3. Puhelimen kapealla kaistalla (kuvakulma 62–79°) suunta 090 on 40° päässä katseesta ja jää kaistan ulkopuolelle, jolloin merkkinä on reunanuoli.
4. Lambert-materiaalin kaksipuolisessa pinnassa kolmion kierron on vastattava normaalia, muuten kansi näyttää tummalta. Kierto pakotetaan funktiossa `Acc.tri`.
