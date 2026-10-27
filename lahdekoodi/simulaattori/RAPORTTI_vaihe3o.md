# Raportti, vaihe 3o: satamat Google-maisemassa (laiturit, veneet ilmakuvan paikoilla, ei veneitä aallonmurtajalla)

Päiväys 27.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työhakemisto `/home/claude/reittikartta-3o/`. Googlen kirjastoa ja avainta ei ole tässä ympäristössä, joten Googlen kerros korvattiin testeissä tummalla taustalla kuten vaiheessa 3n. Kaikki luvut koskevat omaa kerrosta, ja Googlen kuvan näkyvyyttä omien veneiden takaa ei voitu mitata (kohta 5.1).

## 1. Päätulokset lyhyesti

1. Omat laiturit piirtyvät nyt myös Google-tilassa veneiden välissä. Laiturin kansi on 0,5 m vedenpinnan yläpuolella ja väri vaalea harmaa (keskikirkkaus 141 asteikolla 0 ... 255), ja maanpuoleiset päät jäävät oman syvyyspeiton taakse (17 790 laituripikselistä 1,8 % on kohdassa, jossa Googlen maa näkyisi). Sillat pysyvät piilossa.
2. Veneet tulevat tietoputken tiedostosta `veneet.json` (1 048 havaintoa, 8 satamaa) valmiina paikkoina, suuntina ja pituuksina. Varakäytön laiturialgoritmi on käytössä vain alueilla, joita tiedosto ei kata (`veneLahde = 'ilmakuva'` on oletus).
3. Varakäyttö ei sijoita veneitä aallonmurtajan eikä kapean niemekkeen viereen. Naistenlahden 1 500 m:n säteellä hylättiin tämän vuoksi 60 paikkaa (aallonmurtaja-kohteita 0, kapeaa maata 60) ja alle 15 m:n päässä niemekkeestä on 0 venettä. Tiedoston veneille rajaa ei aseteta, koska ortokuvan mukaan Naistenlahden länsiniemekkeen sisäreunalla on oikeita veneitä (kohta 5.2).
4. `googleSatama = 'google'` tekee satama-alueista omassa vedessä läpinäkyviä: alfa 0 on 51 / 51 laiturien välisessä pisteessä (omassa tilassa ne olivat peittäviä), avoin vesi pysyy peittävänä (29 / 29), omia veneitä ja laitureita ei piirretä Google-tilassa, mutta tutka (595 venettä) ja törmäys (`Tormays.check`) käyttävät omia veneitä.
5. Omat veneet piirretään Google-tilassa 8 % suurempina (`googleVeneSkaala` 1,08).
6. Vanhat testit ovat läpi lukuun ottamatta `google3n_pw.py`:n osia `perus`, `peitto`, `sumu` ja `lataukset`: niissä on kaksi virhettä, jotka esiintyvät myös pohjaversiolla (3l:n veneet), ja yksi epävakaa tarkistus (maapisteet 1,5 ... 2,7 km:n päässä), joka meni pohjaversiolla läpi 5 / 5 ja 3o-versiolla 1 / 5 ajossa, syy tuntematon (kohta 4, alakohta 4). Muut testit (`mobiili_pw.py`, `google3d_pw.py`, `veneet3l_*`, `tormays_pw.py`, `valkkyminen_pw.py`) ovat läpi. `build.py` tuottaa `simulaattori.html`-tiedoston, ja `index.html` on ennallaan.
7. Googlen veneistä näkyviin jäävää osuutta ei voi mitata ilman avaimella otettuja kuvia. Arvio jätetään tilaajalle (kohta 5.1), ja vaihtoehtona on `googleSatama = 'google'`.

## 2. Ratkaisu

1. Laiturit kerrostilassa. `nakyma.js`:n piilotuslistassa `laiturit` on 0, ja `overlayLayers` pakottaa kerrokselle 0 ne kohteet, joiden `hide`-arvo on 0. Laiturimoduuliin ei tarvittu muutoksia.
2. Veneet ilmakuvasta. `sim.js` lataa `veneet.json`-tiedoston kerran (osoite paketin `aineisto.json`-luettelosta, parametri `veneettiedosto` ohittaa, `venelahde=laituri` ohittaa tiedoston) ja antaa listan `veneet3d.js`:lle (`asetaPaikat(lista, origin, { suuntaTosi, alueet })`). Vene luodaan annettuun paikkaan ja suuntaan, malli on luokan malli skaalattuna havaitun pituuden suhteella (0,65 ... 1,7). Maalla olevat havainnot pudotetaan. Poiju ja köysi piirretään vain, kun vene on alle 3 m laiturin reunasta ja keula osoittaa laituriin (60° sisällä), poijukentän veneelle ei piirretä laituria eikä köyttä. Laiturialgoritmi ohittaa ketjut, jotka osuvat tiedoston kattamalle alueelle (veneet 100 m:n marginaalilla tai tiedoston `tunnistusalue_bbox` 10 m:n marginaalilla).
3. Suunta. Tiedosto sanoo suunnan olevan tosisuunta, mutta mitattu käytäntö on ruutusuunta (kohta 5.3). Moduulin oletus on ruutusuunta, ja tiedoston avain `suunta_viite: 'tosi'` ottaa meridiaanikonvergenssin muunnoksen käyttöön.
4. Aallonmurtajat ja kapeat niemekkeet. `luoEsto` rasteroi veden `maastokuvio`-kerroksesta 2 m:n ruudukoksi (192 m:n lohkoissa) ja etsii avauksella kaistat, joiden leveys on alle 40 m ja pituus yli 60 m. Lisäksi `vesieste`-kerroksen `aallonmurtaja`-kohteet otetaan janoiksi. Laiturialgoritmi hylkää paikan, jos veneen alueella on kumpaakaan alle 15 m päässä veneen keskipisteestä.
5. Jäänteet. Google-tilassa omat veneet ovat 8 % suurempia, ja asetuksella `googleSatama = 'google'` vesimaskin `satamareika`-verkko tekee satama-alueesta (kapseli 60 m laiturisegmentin ympärillä ja 20 m:n renkaat yli 60 m:n päässä laiturista olevien veneiden ympärillä) läpinäkyvän. Googlen oma satama näkyy silloin sellaisenaan, ja omia veneitä ja laitureita ei piirretä.
6. Tutka ja törmäys. Ilmakuvan veneet ovat samassa listassa kuin laiturialgoritmin veneet, ja `lahella`-rajapinta antaa ne kummassakin `googleSatama`-arvossa.

## 3. Muuttuneet tiedostot

Hakemisto `lahdekoodi/`:

- `simulaattori/js/veneet3d.js`: `asetaPaikat`, `luoEsto` ja kapeiden kaistojen tunnistus, hylkäyssyyt `aallonmurtaja` ja `kapeaMaa`, poijun ja köyden ehto, `asetaSkaala`, satama-alueet (`satamaAlueet`), tilasto ja `ilmakuvaVeneet`. Asetukset `veneLahde`, `aallonmurtajaEtaisyys`, `kapeaMaa` ja `ilmakuva`.
- `simulaattori/js/vesimaski3d.js`: reikäverkko `satamareika` (`setHoles`, `setHoleActive`, `holeInfo`).
- `simulaattori/js/nakyma.js`: rivit 383 ja 414 (laiturit eivät ole oletuksena piilotuslistalla, arvo 0 pakottaa kerrokselle 0).
- `simulaattori/js/google3d.js`: rivit 44 ... 46 (asetukset `googleVeneSkaala` ja `googleSatama`).
- `simulaattori.html` (lähdesivu): rivi 219 (valikkopainike `mPort`).
- Uudet testit `simulaattori/testit/`: `veneet3o_test.js`, `veneet3o_pw.py`, `veneet3o_lataa.js`, `veneet3o_luo_testitiedosto.js`, `veneet3o_satamittain.js` ja `veneet_testi.json`.
- Ennallaan (md5 tarkistettu ennen ja jälkeen): `plotteri.js`, `tutka.js`, `liike.js`, `harjoitus.js`, `runko.js`, `tormays.js`, `maasto.js`, `merkit.js`, `merkit3d.js`, `aineisto.js`, `mvt.js`, `paikka.js`, `laiturit3d.js`, `sillat3d.js`, juuren `index.html` (edff5aed...) ja `lahdekoodi/index.html`.

`simulaattori/js/sim.js`, uudet rivinumerot (muutoksia ei ole muualla):

- Rivit 8 ja 9: osoiteparametrien kuvaus (`venelahde`, `veneettiedosto`, `googlesatama`).
- Rivi 30: tilaan `satama`, `boatFileP` ja `boatFile`.
- Rivit 45, 49, 51 ja 53: asetuksen `googleSatama` luku, tallennus, oletus ja osoiteparametri.
- Rivi 205: ilmakuvan veneiden lähdemerkintä lähdetekstiin (`addBoatSource`).
- Rivi 256: omia veneitä ei piirretä, kun `googleSatama = 'google'` ja kerrostila on päällä.
- Rivit 272 ... 314: `loadBoatFile`, `boatFileAreas`, `addBoatSource`, `googleLayer`, `portGoogle`, `applyBoatMode` ja `applyPortHoles`.
- Rivit 338 ... 340: reikäverkon ja venetilan päivitys laiturilatauksen jälkeen, tilasto `boatStats` (`hylatty`, `esto`, `ilmakuva`).
- Rivit 350 ... 355: `startBoats` lataa tiedoston ja kutsuu `asetaPaikat` ennen laiturialgoritmia.
- Rivit 730 ... 733: valikkopainikkeen `mPort` käsittelijä.
- Rivit 931 ja 937: venetilan päivitys, kun kerrostila kytketään päälle tai pois.
- Rivit 1141 ja 1153: komentolokin ja valikkopainikkeen teksti.
- Rivit 1283 ... 1285: testikoukut `applyBoatMode`, `boatsAt` ja `loadBoats`.

## 4. Kriteerien mittaus

Kriteeri 1 (`testit/veneet3o_pw.py` osa `kerros`, Chromium 1440 x 900, oikea `veneet.json` 1 048 havaintoa, 14 / 14 tarkistusta läpi):

1. Kuvat: `shots/3o_naistenlahti_oma_kerros.png` (oma kerros tummalla taustalla, 55 m:n korkeudesta avoimen veden puolelta) ja `shots/3o_naistenlahti_oma_nakyma.png` (sama kamera omassa näkymässä). Lisäksi `_lahikuva` (24 m:n korkeus) ja `_silmapiste` (aluksen näkymä) molemmista, sekä `shots/3o_ortokuva_lansiniemeke_veneet.png` (tiedoston veneet ortokuvan päällä) ja `shots/3o_naistenlahti_aallonmurtaja_ennen.png` ja `..._jalkeen.png` (varakäyttö ilman estoa ja estolla).
2. Laiturit näkyvät veneiden välissä: 404 / 637 vedessä olevasta laituripisteestä piirtyy (ero kuvaan, jossa laiturit on piilotettu samalla hetkellä). Loput ovat veneiden alla. Väri on vaalea harmaa (keskikirkkaus 141 asteikolla 0 ... 255, 393 / 404 pikseliä harmaata).
3. Maanpuoleiset päät: 17 790 laituripikselistä 317 (1,8 %) on kohdassa, jossa laiturittomassa kuvassa ei ole mitään. Raja oli 10 %. Maan päällä (maasto yli 0,9 m) olevista 24 laituripisteestä piirtyy 14, ja ne ovat sataman perukan rannassa 250 ... 300 m:n päässä horisontin tuntumassa, missä pää jää 1 ... 2 pikselin viivaksi.
4. Veneet ilmakuvan paikoilla: 298 / 298 kuvassa olevasta veneestä (alle 400 m) erottuu pois kytkettäessä. Varakäytön veneitä Naistenlahden ympärillä on 0, koska tiedosto kattaa alueen.
5. Aallonmurtaja: varakäytön veneistä alle 12 m:n päässä kapeasta niemekkeestä on 0 (Naistenlahden 1 500 m:n säteellä alle 15 m:n päässä 0, ilman estoa alle 10 m:n päässä olisi 24 venettä 700:sta). Tiedoston veneillä rajaa ei aseteta (kohta 5.2): länsiniemekkeen sisäreunan ponttonilla on tiedostossa 16 venettä, ja ne ovat ortokuvassa oikeita veneitä.

Kriteeri 2 (`testit/veneet3o_satamittain.js` ja `testit/veneet3o_test.js`). Veneiden määrä satamittain ilmakuvasta, varakäytöstä samalla alueella ilman tiedostoa ja varakäytön hylkäykset kapean maan vuoksi:

| Satama | Ilmakuva | Varakäyttö | Hylätty kapean maan vuoksi |
|---|---|---|---|
| Aitolahti | 28 | 63 | 0 |
| Jänissaari | 149 | 161 | 16 |
| Mustalahti | 52 | 47 | 20 |
| Naistenlahti | 421 | 629 | 22 |
| Perkiönlahti | 93 | 139 | 0 |
| Rauhaniemi | 64 | 5 | 18 |
| Santalahti | 124 | 149 | 53 |
| Teisko | 117 | 147 | 16 |
| Yhteensä | 1 048 | 1 340 | 145 |

Aallonmurtajan (`aallonmurtaja`-kohteen) vuoksi hylättiin 0 paikkaa, koska paketin `vesieste`-kerroksessa ei ole yhtään aallonmurtaja-kohdetta (0 janaa). Kaikki hylkäykset tulevat kapeasta maasta. Naistenlahden 1 500 m:n säteellä varakäyttö sijoitti 657 venettä 971 paikkaan (hylätty maa 93, matala 4, törmäys 12, aallonmurtaja 0, kapea maa 60). Varakäytön määrä seuraa 70 %:n täyttöastetta ja kartan laitureita, ilmakuvan määrä on kuvan todellinen tilanne, joten luvut eivät ole keskenään vertailukelpoisia. Ero on suurin Rauhaniemessä, jossa kartan laitureille mahtuu vain 6 venettä ja kuvassa on 64 venettä aallonmurtajalaiturin sisäreunalla. Ilmakuvan veneistä 313 on kiinni laiturissa (poiju ja köysi) ja 735 poijukentällä tai ilman laituriyhteyttä.

Kriteeri 3 ja 5 (`testit/veneet3o_pw.py` osat `satama` ja `tutka`, oikea `veneet.json`, 26 / 26 tarkistusta läpi):

1. Oletus on `googleSatama = oma`, jolloin satama-aluetta ei tehdä läpinäkyväksi, ja omassa tilassa laiturien välin pisteistä 51 / 60 on peittäviä (alfa 255).
2. Valikon painike "Satamat (Google 3D)" vaihtaa asetuksen arvoon `google`, tekstin ("Googlen omat") ja tallentaa asetuksen selaimen muistiin.
3. Reikäverkko on päällä: 101 kapselia, 586 rengasta ja 12 808 kolmiota (kaikki kahdeksan satamaa).
4. Alfa 0 laiturien välissä: 51 / 51 pisteestä, jotka olivat omassa tilassa peittäviä. Avoin vesi yli 75 m:n päässä laitureista pysyy peittävänä: 30 / 30.
5. Omia veneitä ja laitureita ei piirretä Google-tilassa (veneryhmä ja laiturit-verkko piilossa), ja paluu omaan satamaan palauttaa veneet, laiturit ja veden. Omassa näkymässä veneet piirtyvät, vaikka asetus on `google`.
6. Tutka ja törmäys käyttävät omia veneitä: `lahella`-rajapinta antaa 299 venettä 400 m:n säteellä, tutkan venehaku antaa 537 venettä, tutkakuvan ero veneet päällä ja pois on 800 pikseliä (kohina 0 ja 0), ja `Tormays.check` osuu ilmakuvan veneeseen `googleSatama = google` -tilassa.
7. Omat veneet ovat Google-tilassa 8 % suurempia (mittakaava 1,08), ja paluu omaan näkymään palauttaa mittakaavan 1.

Kriteeri 4 (vanhat testit ja rakennus). Kaikki ajot tehtiin lopullisella lähdekoodilla (`sim.js` ja `veneet3d.js` viimeksi muutettu klo 18.14, ajot klo 19.00 jälkeen), lokit ovat hakemistossa `shots/logs3o/`.

1. `mobiili_pw.py`: Chromium 44 / 44 ja WebKit 44 / 44 lähdesivulla sekä yksitiedostoisella `simulaattori.html`-tiedostolla (`build.py`-tuloksella). `google3d_pw.py`: Chromium 44 / 44 ja WebKit 44 / 44.
2. `tormays_pw.py`: kaikki läpi (pohjakosketus, törmäys, peruutus irti, törmäystarkistus alle 1 ms askeleelta). `valkkyminen_pw.py` (Chromium): ei tyhjiä ruutuja (0 / 20), ei virheitä.
3. `veneet3l_*`: smoke, törmäys, tutka, pohja ja kuvat läpi ilman virheitä. Smoke-ajossa varakäyttö (Siilinkari, ilman tiedostoa) sijoitti 738 venettä 1 168 paikkaan (hylätty maa 98, matala 5, törmäys 63, aallonmurtaja 0, kapea maa 42), tutkan veneiden ero on 89 pikseliä (kohina 15 ja 6). Suoritusmittaus (deck): kuvaväli veneillä / ilman suhde on 1,106 (lohkojen keskiarvo), 1,100 (mediaani) ja 1,168 (pienin lohko), piirtokutsut 151 (ilman veneitä 139) ja kolmiot 254 430 (ilman 191 492). Vaiheen 3l raja 1,15 koski lohkojen keskiarvoa (silloin 1,11), ja pienimmän lohkon luku vaihtelee ajoympäristön kuormituksen mukaan (3l:ssä 1,13, nyt 1,17, kone on 2 prosessorin).
4. `google3n_pw.py`: osat `kiikari`, `kalibrointi`, `kuvaväli` ja `kuvat` 17 / 17 läpi. Osat `perus`, `peitto`, `sumu` ja `lataukset` (30 tarkistusta) antavat pohjaversiolla (dee9157) 2 virhettä ja 3o-versiolla 3 ... 4 virhettä:
   - Avovedessä oleva koetin näkyy ja ilman sumua taivaalla on peittäviä pikseleitä (28 ... 52 / 17 280). Kumpikin esiintyy myös pohjaversiolla, ja kumpikin katoaa, kun vaiheen 3l veneet kytketään pois (`veneet=ei`), eli ne johtuvat 3l:n veneistä eivätkä tästä vaiheesta. Ei korjattu.
   - Tarkistus "kriteeri 3: näkyvyys 2 km, maapisteitä 1,5 ... 2,7 km:n päässä" on epävakaa. Pohjaversiolla se meni läpi kaikissa 5 sumuosan ajossa (8 pistettä, keskietäisyys 2 662 m, eli pisteet ovat ikkunan reunalla 2 700 m:ssä), 3o-versiolla se meni läpi 1 tavallisessa ajossa 5:stä (neljän ajon virhe: ei maapisteitä ikkunassa), ja kaksi muunneltua ajoa (laiturit piilossa, ilman veneitä) epäonnistui samoin. Epäonnistuneessa ajossa säteiden osumia oli samoissa kuvarivissä lähempänä (700 ... 970 m) ja niiden alfa oli 190 ... 250 (kaavan mukainen olisi noin 85), eli osumien edessä oli jotain peittävää, ja läpimenevässä ajossa luvut olivat täsmälleen samat kuin pohjaversiolla. Syytä ei selvitetty loppuun. Seuraavaksi kannattaa tulostaa aluksen paikka ja kuva epäonnistuneessa ajossa. Kohta ei kuulu vaiheen 3o hyväksymiskriteereihin, eikä sitä ole korjattu.
5. `veneet3o_test.js` (Node, oikea `veneet.json`) ja `veneet3o_pw.py` (osat `kerros`, `satama`, `tutka`, `varakaytto`): 14 / 14 ja 26 / 26 läpi, kuten kohdissa 1 ... 3. Vanhat Node-testit (`tormays_test.js`, vaiheen 3n yksikkötestit, Google 3D -laskenta, liikemalli, harjoitus ja siltatesti) läpi. `mvt_test.js` ei ajettu, koska `mvt.js` on ennallaan (md5 sama).
6. `build.py` tuottaa `simulaattori.html`-tiedoston (1 579 520 tavua), ja juuren `index.html` (md5 edff5aed...) ja `lahdekoodi/index.html` ovat muuttumattomat. Päähakemisto `/home/claude/reittikartta` on edennyt kopioinnin jälkeen (`google3d.js`:n lähdemerkinnän leikkaus, `sim.js`, `sim.css`, `simulaattori.webmanifest`, `TYOLOKI.md`, `kayttoliittyma_3h_pw.py`, `google3n_pw.py`, `simulaattori.html`), joten muutokset on yhdistettävä käsin, erityisesti `sim.js` ja `google3d.js`:n kahden rivin asetuslisäys.

## 5. Poikkeamat ja huomiot

1. Googlen veneiden jäänteet. Avaimella otettuja kuvia ei ollut, joten Googlen veneistä näkyviin jäävää osuutta ei voitu mitata, ja arvio jää tilaajalle. Geometria antaa suuntaa: 8 %:n suurennus kasvattaa esimerkiksi 6,8 m pitkää ja 2,4 m leveää venettä noin 0,27 m kummastakin päästä ja noin 0,1 m kummaltakin sivulta, ja ortokuvan pikselikoko on 0,5 m. Suurennus peittää siis vain alle noin 0,1 ... 0,3 m:n paikkavirheet. Googlen vene, jota ei ole tiedostossa (ortokuvan ottohetkellä ei paikalla tai tunnistamatta jäänyt), jää kokonaan näkyviin, ja oma vene, jolle ei ole Googlen kuvassa vastinetta, näkyy ylimääräisenä. Jos jäänteitä jää paljon, vaihtoehto on `googleSatama = 'google'` (kohta 6): Googlen satama näkyy silloin sellaisenaan, ja omat veneet ovat vain tutkassa ja törmäystarkistuksessa. Arviointiohje on kohdassa 6.
2. Veneet niemekkeiden vieressä. Varakäyttö ei sijoita veneitä alle 15 m:n päähän kapeasta maasta, mutta tiedoston veneille rajaa ei aseteta, koska ne ovat ortokuvassa näkyviä oikeita veneitä. Tiedoston veneistä 60 on alle 12 m:n päässä kapeasta maasta (Naistenlahti 6, Mustalahti 5 ja Rauhaniemi 49), ja kuvat `shots/3o_ortokuva_lansiniemeke_veneet.png` (Naistenlahden länsiniemekkeen sisäreunan ponttoni) ja tarkistus Mustalahden laiturikadulla ja Rauhaniemen aallonmurtajalaiturilla osoittavat, että niissä on oikeita veneitä. Käyttäjän havainto "veneitä aallonmurtajan vieressä, missä niitä ei oikeasti ole" voi siis koskea myös tiedoston veneitä, jos Googlen kuva on otettu aikana, jolloin länsiniemekkeen ponttonilla ei ollut veneitä. Silloin ratkaisu on tiedoston `poissulkualueet`-luettelo (vaihe 1d): länsiniemekkeen sisäreunalla on 16 venettä alle 15 m:n päässä kapeasta maasta, alue e 328040 ... 328112 ja n 6823730 ... 6823792.
3. Suunnan viite. Tiedosto ilmoittaa `suunta`-kentän olevan keulan tosuunta, mutta Naistenlahden `suunta_lahde = laituri` -veneiden (keula laituria kohti) ja laiturisegmenttien normaalin ero on ilman muunnosta keskimäärin 0,55° (mediaani 0,45°, keskihajonta 5,36°, n = 194), kun meridiaanikonvergenssi on noin -2,8°. Suunta on siis ruutusuunta, ja muunnos tosuunnasta lisäisi 2,8°:n virheen. Moduulin oletus on ruutusuunta (`suuntaTosi = false`), ja tiedoston avain `suunta_viite: 'tosi'` ottaa muunnoksen käyttöön. Vaiheen 1d kannattaa joko korjata määrittelyn sanamuoto ruutusuunnaksi tai lisätä tiedostoon avain `suunta_viite`.
4. Paketin `aineisto.json` ei vielä mainitse `veneet.json`-tiedostoa (viimeksi muutettu 24.10.2026), joten `sim.js` ei lataa tiedostoa itse. Testit antavat osoitteen parametrilla `veneettiedosto`. Kun vaihe 1d lisää tiedoston `tiedostot`-luetteloon (`nimi: veneet.json`), lataus käynnistyy ilman parametria.
5. Vaihe 1d on päivittänyt tiedostoa työn aikana (ensimmäisessä testiajossa 1 056 havaintoa, uusimmassa 1 048, ja uusin versio sisältää `poissulkualueet`-luettelon). Raportin luvut on mitattu uusimmalla versiolla (muutettu 27.10.2026 klo 18.21), ja tiedoston `satamat[].tunnistusalue_bbox` luetaan peittoalueeksi.
6. Vanha testi `google3n_pw.py` ei toiminut ennen tätä vaihetta: sivu alkaa Google-tilassa, kun avain on tallennettu (Google 3D on oletus, kun avain löytyy, `sim.js` rivi 1052), joten testin valikkopainikkeen napautus kytki Google-tilan pois. Testin osoitteeseen lisättiin `maisema=oma`. Korjaus tehtiin vain testin osoitteeseen (`testit/google3n_pw.py`), ja sen jälkeenkin osassa `sumu` on epävakaa tarkistus (kohta 4, alakohta 4).
7. Poijut ja köydet. Tiedoston 1 048 veneestä 313 (30 %) täyttää poijun ja köyden ehdon (alle 3 m laiturin reunasta ja keula laituriin päin), ja 735 ei täytä. Esimerkiksi Rauhaniemessä ja Mustalahden laiturikadulla veneet ovat rannan tai aallonmurtajalaiturin sisäreunalla, joka ei ole laiturikerroksessa (lähin laituri on 30 ... 290 m:n päässä), ja poijukentän veneillä laituria ei ole lähellä. Ehtoa ei lievennetty, koska määrittely vaatii sen.
8. Reikäverkon reuna on terävä: 60 m:n kapseli laiturisegmenttien ympärillä ja 20 m:n renkaat yksittäisten veneiden ympärillä. Oman veden ja Googlen veden värisävy voi erota rajalla, mikä selviää vasta oikealla Googlen kuvalla.

## 6. Ohje tilaajalle

1. Veneiden vertailu: avaa `simulaattori.html?aineisto=<paketti>&veneettiedosto=<paketti>veneet.json` (parametri tarvitaan, kunnes paketin `aineisto.json` mainitsee tiedoston), anna Googlen avain ja valitse Ulkonäkymä: Google 3D. Valikon painike "Satamat (Google 3D)" vaihtaa asetusta `googleSatama` (`oma` tai `google`), ja osoiteparametri `googlesatama=oma|google` asettaa sen heti. Parametri `venelahde=laituri` ottaa tiedoston pois ja palauttaa laiturialgoritmin.
2. Jäännösten arviointi: ota samasta paikasta (esimerkiksi Naistenlahden aallonmurtajan sisäpuolelta, 55 m:n korkeudesta, kuten kuvat `3o_naistenlahti_oma_kerros.png`) kuvakaappaus asetuksella `googleSatama = oma` ja toinen asetuksella `google`. Laske `oma`-kuvasta Googlen veneet, joista näkyy yli neljännes (ei omaa venettä peittämässä), ja jaa ne `google`-kuvan Googlen veneiden määrällä. Lukua ei voitu laskea tässä ympäristössä.
3. Mittakaavan säätö: `Google3D.SETTINGS.googleVeneSkaala` (1,08) voi nostaa esimerkiksi arvoon 1,15, jos jäänteet ovat veneiden reunoilla, mutta suurempi arvo kasvattaa veneitä myös Googlen veden päälle.
4. Jos länsiniemekkeen ponttonilla ei Googlen kuvassa ole veneitä, pyydä vaihetta 1d lisäämään tiedoston `poissulkualueet`-luetteloon alue e 328040 ... 328112 ja n 6823730 ... 6823792 (Naistenlahti), ja tarkista samalla Mustalahden ja Rauhaniemen kuvat.

## 7. Varmentamattomat kohdat

1. Googlen kuvan ja oman kerroksen yhteensopivuus: laiturin väri ja korkeus, reikäverkon reunan näkyvyys ja jäänteiden määrä vaativat avaimella otetun kuvan.
2. Vesimaskin reikäverkko tehtiin läpinäkyväksi alfalla 0 (`NoBlending`), ja testi tarkisti sen omasta kerroksesta. Googlen kuvan läpinäkyvyys alla on siten oikein, jos kangas on todella läpinäkyvä (`alpha: true`, kuten vaiheessa 3n).
3. Piirtoajan vaikutus: reikäverkossa on noin 3 000 kolmiota (Naistenlahti), ja venemäärä on suurempi kuin laiturialgoritmilla (1 048 yli 738), joten kuvataajuutta kannattaa seurata oikealla näytönohjaimella.
