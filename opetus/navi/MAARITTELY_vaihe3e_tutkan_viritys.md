# Määrittely, vaihe 3e: tutkan viritys

Päiväys 26.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään tutkamoduulin hakemistossa `/home/claude/tutka/` (`tutka.js`, `TUTKA.md`, `esikatselu.html`, `testit/`) ja sen jälkeen simulaattorin hakemistossa `/home/claude/reittikartta-sim/` (kopio `lahdekoodi/simulaattori/js/tutka.js` ja asetus `sim.js`-tiedostoon). Tausta: `TUTKA.md` kohdat 4 ja 7, vaiheen 3c raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3c.md` ja vaiheen 3d työloki `TYOLOKI.md` (plotteri, asettelu ja sim.js ovat juuri muuttuneet, älä riko niitä).

## 1. Käyttäjän palaute

Käyttäjä (Repan päällikkö, käyttää DRS6A-tutkaa oikeasti) katsoi tutkakuvan läppärillä 25.10.2026: nykyinen kuva vastaa huonosti viritettyä tutkaa tai tilannetta, jossa on paljon sadeharsoa tai muuta clutteria. Rannat piirtyvät hajanaisina pisteinä ja katkonaisina kaarina. Hyvissä olosuhteissa oikein viritetyllä tutkalla rannat piirtyvät selvästi paremmin: rantaviiva on yhtenäinen ja kirkas, ja rannan takana oleva maa näkyy täyttyneenä alueena niin pitkälle kuin maasto nousee näkyviin, ei pelkkänä ohuena reunana. Katso kuva `/home/claude/reittikartta-sim/lahdekoodi/simulaattori/shots/3d_asettelu_1440x900_tutkalla.png` (tutka keskellä alhaalla, 1,5 mpk, Mustalahti): näin ei saa näyttää oletuksena.

Päätös: nykyinen kuva jää valittavaksi tilaksi "huonosti viritetty" (ja sadeharso omana säätönään kuten nyt), ja oletukseksi tehdään hyvin viritetty tutka.

## 2. Todennäköiset syyt nykyiseen ulkoasuun (tarkista koodista, älä oleta)

1. Säde päättyy ensimmäiseen osumaan ja kaiku jatkuu vain kolme askelta (pulssin pituus 12 m). Maa piirtyy siten ohuena reunana, vaikka oikea tutka näkee rannan takana nousevan maaston koko näkyvältä osaltaan ja maa-alue täyttyy kuvassa.
2. Näkyvyyskerroin `min(1, dh / 1,5 m)` ja maan vähimmäiskorkeus 1,2 m tekevät matalan rannan kaiusta heikon, kun antenni on 5,4 m korkeudella ja etäisyys on yli muutaman sadan metrin. Loiva ranta saa pohjatason 0,14–0,22, joka piirtyy himmeänä ja katkonaisena.
3. Säteitä on 360 alueella 1,5 mpk, jolloin säteiden väli alueen reunalla on 48 m ja 2,0°:n Gaussin keila ei riitä täyttämään väliä, kun kaiku on yhdessä askeleessa.
4. Jälkihehku ja satunnainen amplitudi tekevät kuvasta rakeisen.

## 3. Tehtävät

1. Lisää moduuliin viritystila `asetaViritys('hyva' | 'huono')`, oletus `hyva`. Tila näkyy `tila()`-oliossa ja tutkan kulmatekstissä (esimerkiksi "VIRITYS HUONO" vain huonossa tilassa, hyvässä ei tekstiä).
2. Hyvä viritys: maa piirretään alueena. Säde ei pääty ensimmäiseen osumaan vaan jatkaa alueen reunaan asti, ja jokainen näkyvä maasolu (kulma yli varjokulman) saa kaiun, jonka voimakkuus on rantaviivassa ja rinteessä suurin ja tasaisella maalla pienempi mutta selvästi näkyvä (esimerkiksi vähintään 0,45 näytön asteikolla), ja varjoon jäävä maa jää tyhjäksi kuten nyt. Rantaviivan kaiku on yhtenäinen: ensimmäisen osuman voimakkuus on vähintään 0,7 kaikilla rannoilla, joissa näkölinja ei ole varjossa, myös loivilla ja matalilla rannoilla (oikealla tutkalla rantapenkka, kivet ja rantapuusto kaikuvat aina kirkkaasti muutaman mailin päähän). Näkyvyyskerroin pehmennetään niin, että matala ranta 1,5 mpk etäisyydellä ei haalistu. Kaiun amplitudin satunnaisvaihtelu kiinteillä kohteilla enintään ±5 %. Etäisyysvaimennus mitoitetaan niin, että 3 mpk ranta näkyy vielä selvästi (voimakkuus vähintään 0,5), 6 mpk alueella haaleana.
3. Huono viritys: nykyinen ulkoasu (ensimmäinen osuma, nykyiset voimakkuudet ja satunnaisuus) ja lisäksi vastaanottimen kohina `hairio.kohina` noin 0,3. Sadeharso (`asetaSade`) ja sadesuodatin pysyvät erillisinä säätöinä molemmissa tiloissa.
4. Varjo, turvalaitteet (viitat heikkoina ja välkkyvinä, kiinteät vakaina), EBL, VRM, alueet, suunta ylös, jälki ja pyyhkäisy toimivat kuten ennen. `TUTKA.md` kohta 4 päivitetään uuden mallin mukaan ja kohtaan 3 lisätään viritystila.
5. Suorituskyky: säteen marssi koko alueen matkalta ei saa nostaa pyyhkäisyn laskenta-aikaa yli 1,5-kertaiseksi nykyiseen verrattuna samassa istunnossa mitattuna (mittaa vanha ja uusi peräkkäin samalla testillä, ympäristön nopeus vaihtelee). Keinoja: maasolun kaiku lasketaan kerran per solu per pyyhkäisy ja välimuistitetaan, kaukana olevat askeleet harvennetaan, tai näkyvyys lasketaan 2–4 askeleen välein.
6. Simulaattori: kopioi uusi `tutka.js` hakemistoon `/home/claude/reittikartta-sim/lahdekoodi/simulaattori/js/`, lisää `sim.js`-asetusvalikkoon valinta "Tutkan viritys: hyvä / huono" (oletus hyvä) ja kirjaa vaihto komentolokiin kuten muut tutkamuutokset. Aja `build.py`, jotta `simulaattori.html` päivittyy.

## 4. Hyväksymiskriteerit

1. Rantaviivan yhtenäisyys hyvässä virityksessä: kolmessa testipaikassa (Mustalahden edusta, Siilinkarin kohta, Muroleen kanavan suu) alueella 1,5 mpk vähintään 95 % niistä säteistä, joiden ensimmäinen maaosuma ei ole varjossa, piirtyy ensimmäisessä osumassa voimakkuudella vähintään 0,7, ja peräkkäisten tällaisten säteiden välissä ei ole tyhjää pikseliä rantaviivan kohdalla (mitataan piirretystä canvasista säteiden välistä).
2. Maa alueena: Mustalahden edustalla 1,5 mpk alueella rannasta 200 m sisämaahan ulottuvalla, näkyvällä vyöhykkeellä vähintään 80 % pikseleistä on piirretty (voimakkuus yli 0,3). Varjotesti vaiheen 3c tapaan (Siilinkarin takana oleva matala ranta ei näy, korkeampi ranta kauempana näkyy) menee edelleen läpi numeroin.
3. Huono viritys toistaa vanhan kuvan: vertailukuva vanhasta `tutka.js`-tiedostosta (kopioi se ennen muutoksia nimellä `tutka_3c.js`) ja uudesta huonossa tilassa samasta paikasta, silmämääräisesti sama ja ensimmäisen osuman voimakkuuksien keskiarvo 10 %:n sisällä vanhasta.
4. Suorituskyky kohdan 3.5 mukaan: vanha ja uusi mitattu peräkkäin samassa istunnossa, uusi enintään 1,5 × vanha, luvut raporttiin.
5. Kuvat hakemistoon `/home/claude/tutka/shots/` ja simulaattorin `lahdekoodi/simulaattori/shots/` etuliitteellä `3e_`: kolme testipaikkaa alueilla 0,5, 1,5 ja 3 mpk hyvässä virityksessä rinnakkain karttakuvan kanssa (esikatselu), sama paikka hyvä ja huono rinnakkain, simulaattorin leveä asettelu 1440 × 900 tutkalla (vertailu kuvaan `3d_asettelu_1440x900_tutkalla.png`) ja puhelin WebKit iPhone 14 tutkanäkymässä.
6. Vanhat testit läpi: tutkamoduulin omat testit, simulaattorin `mobiili_pw.py`, `tutka_mobiili_pw.py`, `tutka_asettelu_pw.py`, `valkkyminen_pw.py` ja `asettelu_3d_pw.py` (Chromium ja WebKit kuten ennen). `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` muuttumaton. `plotteri.js`, `nakyma.js`, `liike.js`, `harjoitus.js`, merkit ja `maasto.js` eivät muutu.

## 5. Työtapa

Kuten aiemmin: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8142` tutkalle ja `8140` simulaattorille, tarkista ovatko jo käynnissä), Playwright asennettu (älä aja `playwright install`), lyhyet ajot timeoutilla, työloki `/home/claude/tutka/TYOLOKI.md` ja simulaattorin `TYOLOKI.md`, ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä, desimaalipilkku. Hakemistoihin `/home/claude/reittikartta/`, `/home/claude/reittikartta-aineisto/` ja `/home/claude/merimerkit/` ei kosketa. Raportti `/home/claude/tutka/RAPORTTI_vaihe3e.md` (kopio simulaattorin `lahdekoodi/simulaattori/RAPORTTI_vaihe3e.md`), lyhyt ja numeroitu: mitä kaikumallissa muuttui, kriteerit 1–6 lukuina, kuvien polut. Lopuksi lyhyt yhteenveto tilaajalle: muuttuneet tiedostot, kriteerien tulokset ja kuvien polut. Älä liitä koodia vastaukseen.
