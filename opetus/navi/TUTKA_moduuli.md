# Tutkamoduuli navigoijalle

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Moduuli on vaiheen 4 tutkaosa. Se laskee ja piirtää tutkakuvan Repan navigoijan harjoitusta varten aineistopaketin maastosta, rannoista, rakennuksista ja turvalaitteista. Tarkoitus on opettaa rantaviivan ja saarten tulkintaa tutkakuvasta sekä ajamista tutkalla ja kompassilla huonossa näkyvyydessä. Moduuli ei jäljittele Furunon käyttöliittymää, eikä siinä ole valmistajan logoja.

## 1. Tiedostot

| Tiedosto | Sisältö |
|---|---|
| `tutka.js` | Koko moduuli, yksi tiedosto ilman riippuvuuksia lukuun ottamatta `pmtiles.js`:ää (globaali `pmtiles`). Selaimessa globaali `Tutka`, Nodessa `module.exports`. |
| `esikatselu.html` | Elävä tutka sekä kolme paikkaa (Mustalahden edusta, Siilinkarin kohta, Muroleen kanavan suu) alueilla 0,5, 1,5 ja 3 mpk tutka ja plotterikuva vierekkäin. Parametri `?aineisto=` vaihtaa paketin osoitteen. |
| `lib/` | Kopiot paketin `pmtiles.js`, `leaflet.js`, `leaflet.css` ja `protomaps-leaflet.js` esikatselua varten (lisenssit `LISENSSIT.txt`). Itse moduuli tarvitsee vain `pmtiles.js`:n. |
| `shots/` | Playwright-kuvakaappaukset (22 kuvaa, ks. kohta 8). |
| `testit/` | Hyväksymiskriteerien testit (`kriteeri1.py` … `kriteeri4.py`, `kuvat.py`), apurit (`pw.py`, `testisivu.html`) ja tulokset `tulos_*.json`. |

Esikatselun ja testien ajo:

```
python3 /home/claude/opetus/navi/putki/palvele.py 8142
cd /home/claude/tutka && python3 -m http.server 8143 --bind 127.0.0.1
cd /home/claude/tutka/testit && python3 kriteeri1.py
```

Tuotannossa paketin oletusosoite on `https://jvaahtikari.github.io/reittikartta-aineisto/`. Moduuli lukee PMTiles-tiedostot HTTP Range -pyynnöillä samoin kuin simulaattori.

## 2. Käyttö

```js
const tutka = Tutka.luoTutka(canvas, {
  aineistoUrl: 'http://127.0.0.1:8142/',   // tai lukija: Tutka.luoLukija(url), jolloin useat tutkat jakavat välimuistin
  alue: 1.5,                               // mpk
  suuntaYlos: true,                        // false = pohjoinen ylös
  ui: true,                                // napit canvasin päälle, false = vain kuva
  eblVrm: true,                            // false = ei EBL:ää eikä VRM:ää
  kuvavali: 50,                            // ms, kuinka usein kuva piirretään
  viritys: 'hyva',                         // 'hyva' (oletus) tai 'huono', ks. kohta 4.5a
  onMuutos: function (t) {}                // kutsutaan, kun alue, EBL, VRM tai muu asetus muuttuu
})
tutka.paivita({ e: 327184, n: 6823800, suunta: 90, nopeus: 8, aika: performance.now() })
```

Rajapinta:

| Kutsu | Vaikutus |
|---|---|
| `paivita(tila)` | Oma sijainti (`e`, `n` EPSG:3067 tai `lat`, `lon`), tosisuunta (`suunta`), nopeus solmuina (`nopeus`, tai `nopeusMs` metreinä sekunnissa) ja aika millisekunteina (`aika`). Kutsutaan joka ruudulla. Antenni kiertää `aika`-arvon etenemisen mukaan, joten pyyhkäisy etenee simulaatioajassa ja pysähtyy, kun `aika` ei kasva. |
| `asetaAlue(mpk)` | Lähin alue luvuista 0,125, 0,25, 0,5, 0,75, 1, 1,5, 2, 3 ja 6 mpk. |
| `asetaSuuntaYlos(bool)` | Suunta ylös (keula ylhäällä) tai pohjoinen ylös. |
| `asetaEBL(aste)` | Suuntima tosisuuntana, 0 … 360. |
| `asetaVRM(mpk)` | Etäisyysrengas, rajoitetaan valittuun alueeseen. |
| `asetaSade(0…1)` | Sadeharso (sadekuuro) ja `asetaSadeSuodatin(0…1)` sadesuodatin, joka vaimentaa harsoa ja heikentää samalla pieniä kaikuja. |
| `asetaJalki(s)` | Jäljen (trail) kesto 0, 15, 30, 60 tai 180 s. |
| `asetaVahvistus(0,2…1,5)` | Vastaanottimen vahvistus (gain). |
| `asetaHairio({kohina, heikko, suuntavirhe, pois, sade})` | Vaihetta 5 varten. `kohina` 0…1 lisää vastaanottimen kohinaa, `heikko` 0…1 heikentää lähettimen tehoa, `suuntavirhe` lisää astetta suuntaan (gyron ryömintä, vain suunta ylös -tilassa), `pois: true` sammuttaa kuvan (tyhjä ruutu), `sade` 0…1 on sama kuin `asetaSade`. |
| `asetaViritys('hyva' \| 'huono')` | Vastaanottimen viritys. Hyvä (oletus) piirtää rannan yhtenäisenä ja maan alueena, huono toistaa vaiheen 3c kuvan (ohut rantakaiku, rakeinen maa) ja lisää vastaanottimen kohinaa. Sadeharso ja sadesuodatin ovat erillisiä säätöjä kummassakin tilassa. |
| `lue()`, `tila()` | Nykyinen alue, rengasväli, EBL, VRM, suunta, nopeus, sijainti ja viritys (`viritys`). `tila()` on sama kutsu toisella nimellä. `hairio.kohina` on huonossa virityksessä vähintään 0,3. |
| `valmis()` | Lupaus, joka toteutuu, kun nykyisen alueen ruudukko ja turvalaitteet on ladattu. Esikatselu ja testit käyttävät tätä. |
| `taytaKierros()` | Laskee koko pyyhkäisyn heti ja palauttaa keston millisekunteina (testeihin ja pysäytettyyn esikatseluun). |
| `piirra()`, `kaynnista(tilaFn)`, `pysayta()`, `tuhoa()` | Piirto, oma `requestAnimationFrame`-silmukka (valinnainen, `tilaFn` palauttaa `paivita`-olion), pysäytys ja siivous. |
| `kohteet()`, `tilasto()`, `verkko()` | Ladatut turvalaitteet, mittarit ja verkkopyyntöjen määrät. |
| `vapautaRuudut()` | Vapauttaa ruudukon muistin (viimeisin kuva jää näkyviin). |

## 3. Näyttö ja käyttö

- Tausta on lähes musta tummanvihreä, kaiut keltavihreästä oranssiin voimakkuuden mukaan. Napit ja kehykset on tehty Reittikartan tumman tyylin sävyillä (tummansininen tausta, vaaleat tekstit), mutta värejä ei ole poimittu suoraan `plotteri.js`:stä tai `sim.css`:stä.
- Viritystila: hyvässä virityksessä kulmissa ei ole lisätekstiä, huonossa virityksessä vasemmassa yläkulmassa alueen ja rengasvälin alla lukee `VIRITYS HUONO` (kapealla canvasilla `VIR HUONO`). Tila vaihdetaan kutsulla `asetaViritys`, ja se näkyy `tila()`-oliossa kentässä `viritys`.
- Keulaviiva, neljä etäisyysrengasta (rengasväli on alue jaettuna neljällä) ja pohjoisen merkki `N`.
- Kulmissa alue, rengasväli, suunta (`SUUNTA YLÖS 000°` tai `N↑ 000°`), nopeus, EBL ja VRM. Kapealla canvasilla (alle 300 px) tekstit lyhenevät.
- EBL on yksi viiva keskeltä reunaan tosisuuntana (näytetään `EBL 075° T`). VRM on katkoviivarengas ja sen lukema on `VRM 0,40 mpk`.
- Kosketus: yhden sormen kosketus tai pyyhkäisy asettaa EBL:n sormen suuntaan. Kahden sormen nipistys muuttaa VRM:ää suhteessa sormien väliin. Hiirellä vedetään ja rullalla muutetaan VRM:ää. Näppäimistöllä nuolet vasen ja oikea siirtävät EBL:ää (Shift 10 astetta), nuolet ylös ja alas VRM:ää ja `+` ja `-` vaihtavat aluetta.
- Napit: `Alue −`, `Alue +`, `Suunta ylös` / `Pohjoinen ylös`, `Jälki` (kiertää kestot 0, 15, 30, 60 ja 180 s) ja `Sade` (sadesuodatin päälle ja pois). Jokainen on vähintään 46 × 46 px.

## 4. Kaikumalli ja sen oletukset

Malli on yksinkertainen mutta noudattaa tutkahorisontin ja varjon fysiikkaa. Kaikki vakiot ovat `tutka.js`:n objektissa `M` ja ne voi lukea `tutka.testi.vakiot`-kentästä.

### 4.1 Aineisto

- Maa- ja vesimaski rakennetaan paketin `nasijarvi.pmtiles`-tiedoston kerroksesta `maastokuvio`. Luokat `jarvi` ja `virtavesi` ovat vettä (saaret ovat polygonien reikiä), kaikki muu on maata. Kerroksen `rantaviiva` viivoja ei käytetä maskina, koska niissä on myös järvi- ja virtavesipolygonien saumoja, jotka eivät ole rantoja.
- Maan korkeus tulee `maasto.pmtiles`-tiedoston Terrain-RGB-ruuduista (bilineaarinen näytteenotto) ja järven pinta on 95,5 m (N2000) kuten simulaattorissa. Korkeus vedenpinnasta on `max(0, maasto − 95,5)`.
- Puusto (`puusto.pmtiles`) lisää esteen: kun latvuspeitto on vähintään 30 %, esteen varjokorkeus on maanpinta plus 0,5 × puuston korkeus. Kerroin 0,5 (`latvusKerroin`) kuvaa sitä, että X-kaistan säde läpäisee lehvästöä osittain. Huonossa virityksessä tämä on koko esteen korkeus. Hyvässä virityksessä (vaihe 3e-2) metsäsolu kaikuu latvuston yläpinnasta (maanpinta plus koko puuston korkeus, ei kerrointa), ja kerroin 0,5 koskee vain varjoa, eli läpäisyä kauemmas. Ruudun lisätieto `q` tallentaa latvuston lisäkorkeuden (0,5 m:n yksiköissä).
- Rakennukset (`rakennus`) ovat esteitä, joiden korkeus tulee kerrosluokasta: 3 kerrosta tai enemmän 12 m, 1–2 kerrosta 6 m ja tuntematon 5 m (vedenpinnasta maanpinnan lisäksi). Hyvässä virityksessä rakennuksen varjokorkeus on 40 % korkeudesta (`rakennusLapaisy` 0,6), koska kortteleiden välistä ja katujen suunnista näkee läpi, mutta rakennus itse kaikuu koko korkeudestaan. Maastokuvion luokat `taajama` ja `varastoalue` merkitään rakennetuksi alueeksi (ruudun lisätieto `q`, bitti 7).
- Maan vähimmäiskorkeus on 1,2 m (rantapenkka, kivet, ruovikko ja laiturit, joita korkeusmalli ei näytä).
- Turvalaitteet tulevat kerroksesta `turvalaite` (lähellä z16, kauempana ruudukon zoomista, jolloin aineisto on harvennettu).

### 4.2 Ruudukko ja tarkkuus

Ennen laskentaa maski ja korkeus rasteroidaan 128 × 128 solun ruuduiksi, joiden solukoko riippuu alueesta: 1 m (0,125 ja 0,25 mpk), 2 m (0,5 ja 0,75), 4 m (1 ja 1,5), 8 m (2 ja 3) ja 16 m (6 mpk). Polygonit täytetään skannausviivalla ja korkeusmalli ja puusto lasketaan soluihin affiinimuunnoksella Mercatorista solukoordinaatteihin. Ruutuja säilytetään enintään 800 kappaletta (noin 39 Mt), ja viimeksi tarvitut siirretään jonon loppuun ennen poistoa. Jos jono ehtii poistaa tarvittavan ruudun, `valmis()` lataa sen uudelleen.

### 4.3 Säteet ja askel

Jokaisessa säteessä on 512 askelta alueen mitalta. Huonossa virityksessä säteitä on 360 ja alueilla enintään 0,75 mpk 720 (kuten vaiheessa 3c). Hyvässä virityksessä säteitä on 720 alueilla enintään 0,75 mpk, 600 alueilla 1–3 mpk ja 360 alueella 6 mpk. Säteiden väli alueen reunalla on siten hyvässä virityksessä 29 m (1,5 mpk) ja 58 m (3 mpk), kun se huonossa on 48 m ja 97 m. Luku 600 on valittu suorituskyvyn vuoksi (kohta 5), koska 720 sädettä nosti laskenta-ajan yli 1,5-kertaiseksi. Askel on siten 1,8 m alueella 0,5 mpk, 5,4 m alueella 1,5 mpk, 10,9 m alueella 3 mpk ja 21,7 m alueella 6 mpk. Ensimmäinen osuma tarkennetaan puolitushaulla askeleen sisällä (7 puolitusta).

### 4.4 Antenni, näkyvyys ja varjo

Antennin korkeus vedenpinnasta on 5,4 m (koodin kommentin mukaan runkomallissa antenni on korkeudella 5,45–5,55 m). Kulma antennista pisteeseen, jonka korkeus on H ja etäisyys s, on

```
alfa(s) = (H − ha) / s − s / (2 · k · R)
```

missä `ha` on antennin korkeus, `k = 4/3` (vakiotaittuma) ja `R = 6 371 km`. Säde marssitaan lähimmästä pisteestä uloimpaan ja pidetään kirjaa suurimmasta tähän asti nähdystä kulmasta `alfa_max`. Piste näkyy vain, jos `alfa > alfa_max`. Korkeus varjorajan yläpuolella on `dh = (alfa − alfa_max) · s`, ja näkyvyyskerroin on huonossa virityksessä `min(1, dh / 1,5 m)` ja hyvässä `0,9 + 0,1 · dh / 0,3 m` (enintään 1), joten matala ranta ei haalistu 1,5 mpk etäisyydellä. Näin matala ranta saaren takana jää varjoon, mutta korkeampi ranta kauempana näkyy, jos se nousee edellisen esteen varjokulman yli. Vesipinta ei estä näkyvyyttä (H = 0 ja kulma on pienempi kuin esteillä). Varjo lasketaan jatkuvasti säteen mukana, joten useampi peräkkäinen este toimii oikein. Hyvässä virityksessä varjon reunalla on vielä taipumavyöhyke: solu, jonka kulma on enintään 8 mrad varjokulman alapuolella ja enintään 200 m varjon reunasta (viimeisestä varjokulmaa nostaneesta solusta), kaikuu heikennettynä (`0,85 · (1 − ero / 8 mrad) · (1 − matka / 200 m)`). Sitä kauempana oleva varjo on täysin tyhjä. Varjorajan pysäytys: kun jäljellä olevissa säteen ruuduissa ei ole maata tai niiden korkein este ei voi enää ylittää varjokulmaa, säteen loppu merkitään varjoksi marssimatta sitä.

Oma vene ei kaiu: lähin 15 m on kuollut alue, eikä vene ole maskissa.

### 4.5 Kaiun voimakkuus

Voimakkuus `E` on välillä 0 … 1.

- Rakennus: `E = 0,9 + 0,1 · min(1, H / 14)`.
- Muu maa: rinteen nousu tutkaa kohti `sg = (H − H12) / 12 m`, missä `H12` on korkeus 12 m (pulssin pituus) lähempänä. `F = sqrt(min(1, sg / 0,6))`, kun `sg > 0`, muuten 0. Korkeuskerroin `Hf = sqrt(min(1, H / 25))`. Pohjataso `B = 0,14 + 0,08 · Hf` (metsäisellä maalla `0,28 + 0,08 · Hf`). Lopuksi `E = B + (1 − B) · F · (0,3 + 0,7 · Hf)`. Jyrkkä korkea ranta on siis kirkas ja loiva matala ranta heikko mutta ei tyhjä.
- Rannan kulma: jos edellinen näyte on vettä ja piste ei ole rakennus, `E` on vähintään 0,3. Rantapenkka ja rantakasvillisuus kaikuvat aina jonkin verran.
- Etäisyysvaimennus ja vahvistus: `E · näkyvyys / (1 + (s / 7000 m)²) · vahvistus`.
- Pulssin pituus: kaiku jatkuu seuraaviin askeliin painoilla 0,62, 0,35 ja 0,18 (12 m pulssi, enintään kolme askelta).
- Vaakakeila: viereisten säteiden kaiku painotetaan Gaussin keilalla, jonka 3 dB:n leveys on 2,0° (avoin antenni, noin 4 jalkaa). Kuva ei siis koskaan ole terävämpi kuin keila sallii.
- Jälkihehku (afterglow): kaiku haalistuu pyyhkäisyn jälkeen vakiolla `0,55 + 0,45 · exp(−ikä / 1,3 s)`. Jälki (trail) pitää heikentyneen kaiun näkyvissä valitun ajan (0–180 s), jolloin esimerkiksi oman aluksen liike rantaan nähden jättää kuvaan jäljen.
- Pyyhkäisy: antenni kiertää 24 kierrosta minuutissa eli 2,5 s kierros. Säteet lasketaan ajan mukaan sitä mukaa kuin antenni ohittaa ne, joten kuva päivittyy pyyhkäisynä eikä kerralla.

### 4.5a Viritys (vaiheet 3e ja 3e-2)

Kaikumalli on kaksi vakiojoukkoa, `M.hyva` ja `M.huono` (luettavissa `tutka.testi.vakiot`-kentästä). Huono viritys on vaiheen 3c malli sellaisenaan. Hyvän virityksen voimakkuudet ovat seuraavat.

| Kohde | Hyvä | Huono (vaihe 3c) |
|---|---|---|
| Tasainen näkyvä maa | 0,55 riippumatta rinteestä ja korkeudesta | 0,14 + 0,08 · Hf (Hf = sqrt(min(1, H / 25 m))) |
| Metsäsolu (latvusto) | vähintään 0,72, kun latvuspeitto on yli 30 % | 0,28 + 0,08 · Hf |
| Rakennussolu | 1,0 | 0,9 + 0,1 · min(1, H / 14 m) |
| Rakennettu alue (`taajama`, `varastoalue`) | pohjataso vähintään 0,8 | ei erillistä |
| Rinne (nousu tutkaa kohti, 12 m:n matkalla) | `E = pohja + (1 − pohja) · x · (2 − x)`, `x = min(1, nousu / 0,4)`, eli jyrkkä rinne 1,0 | `B + (1 − B) · F · (0,3 + 0,7 Hf)` |
| Rantaviiva | 1,0 rannassa, hiipuu pohjatasoon 20 m:ssä | alaraja 0,3 vain ensimmäisessä näytteessä |
| Näkyvyyden pehmennys | ei (kerroin 1, kun solu on varjokulman yläpuolella) | `dh / 1,5 m` |
| Etäisyysvaimennus | `1 / (1 + (s / 14 000 m)²)` | `1 / (1 + (s / 7000 m)²)` |
| Jälkihehku | `0,95 + 0,05 · exp(−ikä / 1,3 s)` | `0,55 + 0,45 · exp(−ikä / 1,3 s)` |
| Kiinteiden kohteiden amplitudi | vakio (ei satunnaisvaihtelua), havaintotodennäköisyys 1,0 | 0,9 … 1,0, kuten ennen |
| Vastaanottimen kohina | 0 | 0,3 (`hairio.kohina`) |

Viitat välkkyvät kummassakin tilassa (amplitudi 0,55 … 1,0 ja etäisyyden mukana laskeva havaintotodennäköisyys).

Rakenteelliset erot hyvässä virityksessä:

- Säde ei pääty ensimmäiseen osumaan. Jokainen näkyvä maasolu (kulma yli varjokulman tai taipumavyöhykkeessä) saa kaiun alueen reunaan asti, ja varjoon jäävä maa jää tyhjäksi.
- Metsä kaikuu itse: metsäsolun näkyvyys ja kaiku lasketaan latvuston yläpinnasta. Varjo tulee latvuston korkeudesta kertoimella 0,5 (läpäisy) ja rakennuksen korkeudesta kertoimella 0,4 (huokoisuus). Varjon taustalla oleva metsä- tai taajamaranta näkyy siis, jos sen latvusto tai katot nousevat edessä olevan esteen varjokulman yläpuolelle.
- Pulssin pituus: kaiun häntä on vähennyslasku (`1 / (1,25 · 12 m)` askelta kohden) ensimmäisestä maasolusta alkaen, joten kaiku pysyy paksuna rannan kohdalla myös pienellä alueella.
- Rantasively (`rantaSively`): kun kahden vierekkäisen säteen ensimmäiset osumat ovat samassa yhtenäisessä maa-alueessa, rannan kaiku levitetään osumien välille säteen suunnassa, enintään 500 m. Suojaus: levitystä ei tehdä, jos naapurisäteen yhtenäinen maa-alue loppuu ennen (silloin on kyse eri kohteesta, esimerkiksi saaresta).
- Näytön piirto ja tasoitus: säteen pikselin säteittäinen peitto on 0,71 pikseliä (hyvä) ja 0,5 pikseliä (huono), joten säteittäin kaiku on tasoitettu noin 2 askeleen (pikselin koko) yli. Poikittain pikseli saa viiden vierekkäisen säteen Gaussin painotetun suurimman ja keskiarvon (`pehmeys` 0,5, keilan Gaussin leveys 2,0°, eli noin 1,5° laatikkosuodatusta vastaava tasoitus), joten yksittäisiä pikselipisteitä ei jää ja reuna on pehmeä.
- Kohina: huonossa virityksessä hajapisteitä lisätään geometrisilla väleillä (ei arvontaa joka askelta), jolloin kohinan laskenta maksaa vähän.

Ilman kohinaa huono viritys tuottaa vaiheen 3c kuvan pikselilleen samana (0 eroavaa pikseliä 563 600:sta kolmessa paikassa), ja ensimmäisen osuman voimakkuuden keskiarvo on sama (suhde 1,000).

### 4.6 Turvalaitteet

Turvalaite piirtyy pistekaikuna, kun se on säteen kohdalla (±1,35 × puolikeilan leveys), sen näkölinja ei jää esteen taakse ja se on luokan enimmäisetäisyyden sisällä.

| Luokka | Korkeus `hs` | Voimakkuus | Enimmäisetäisyys | Havaintotodennäköisyys |
|---|---|---|---|---|
| Loisto | valon korkeus vedestä (oletus 8 m) | 0,88 | 11 000 m | 1,0 |
| Kummeli | 3 m | 0,62 | 5 200 m | 1,0 |
| Muu kiinteä | 2,5 m | 0,50 | 3 800 m | 0,95 |
| Viitta (kelluva) | 1,2 m | 0,32 | 2 600 m | `max(0,12, min(0,95, 1,25 − r / 2000 m))` |

Viittojen kaiku on heikko ja välkkyvä: jokaisella pyyhkäisyllä amplitudi arvotaan väliltä 0,55–1,0 ja havainnon todennäköisyys laskee etäisyyden mukana. Kiinteät merkit ovat vakaita (amplitudi 0,9–1,0 huonossa ja vakio hyvässä virityksessä). Näkyvyys testataan samalla kulmakaavalla kuin maalle. Merkin korkeus on luokan `hs` tai ympäröivän maan korkeus sen mukaan, kumpi on suurempi, ja merkki jää piiloon, jos sen kulma on yli 0,0009 rad pienempi kuin säteen suurin aiempi kulma kolme askelta lähempänä.

### 4.7 Häiriöt

- Sea clutter: sisävedellä lähellä (alle 300 m) on vain noin 0,9 hajapistettä sädettä kohden, voimakkuus 0,10–0,24. Kohina on siis vähäistä, kuten tavallisesti sisävesillä.
- Sadeharso: `asetaSade(0…1)` lisää liikkuvia pilvikuvioita (kolmen siniaallon summa, ajan funktio), jotka heikkenevät etäisyyden mukana. `asetaSadeSuodatin` vaimentaa harsoa ja heikentää samalla alle 0,35:n kaikuja eli pieniä kohteita ja viittoja. Näin sadesuodatin toimii kuten oikeassa tutkassa: harso häviää, mutta myös osa todellisista kaiuista.
- Vastaanottimen kohina, lähettimen heikkeneminen ja suuntavirhe ovat `asetaHairio`-kutsun kautta vaihetta 5 varten.

### 4.8 Mitä malli ei tee

- Ei laske hajontaa lehtipuun ja havupuun välillä, ei lumikuormaa, ei jäätä eikä aaltoja.
- Ei mallinna vertikaalikeilaa (noin 25° pystysuunnassa), joten lähimmän veden kohina on yksinkertaistettu.
- Ei mallinna sivukeiloja, haamukaikuja (mastot, oma runko) eikä monitiekaikuja.
- Ei mallinna muiden alusten kaikuja. Niitä ei ole toteutettu, ja `lisaaAidit` on luonteva malli niiden lisäämiselle.

## 5. Suorituskyky

Mittaukset on tehty Chromiumilla Pixel 7 -profiililla ja ohjelmistopiirrolla (`--disable-gpu`), joten ne ovat tämän koneen (2 jaettua suoritinta, toinen agentti ajoi samaan aikaan, kuorma noin 3) tulos eikä oikean Pixel 7:n. CPU-hidastus x4 kuvaa selvästi heikompaa puhelinta.

| Mittaus | CPU x1 | CPU x4 |
|---|---|---|
| Yksi täysi pyyhkäisy, mediaani, alueet 0,5 / 1,5 / 3 / 6 mpk | 3,5–7,5 ms (720 sädettä alueella 0,5 mpk 6,5–7,5 ms) | 21–32 ms (1,5 ja 3 mpk) |
| Yksi täysi pyyhkäisy, p95 | 3,9–14 ms | 30–189 ms (vain 10 toistoa, joten p95 on sama kuin suurin) |
| Yksi täysi pyyhkäisy, suurin | 4,1–39 ms | 30–189 ms |
| Yhden kuvan piirto (412 × 839 px, tarkkuus x2) | mediaani 5,5–7,2 ms, p95 7–14 ms | mediaani 24–37 ms, p95 34–64 ms |
| Ruudun rakennus (128 × 128 solua) | noin 2–4 ms ruutua kohden | |

Vaiheen 3e hyvässä virityksessä säteitä on 600 alueilla 1–3 mpk (kohta 4.3), ja täyden kierroksen laskenta-aika on vaiheessa 3e-2 yhteensä 1,04–1,3-kertainen vaiheen 3e-1 hyvään virityksen nähden (kohta 6, mittaus on kohinaista). Huonon virityksen kierros on pikselilleen vanha ja yhtä nopea kuin ennen. Kierros on noin 4–12 ms, mikä on alle 0,5 % kierroksen 2,5 sekunnin kestosta.

Pyyhkäisy lasketaan normaalikäytössä vähitellen: 24 kierrosta minuutissa on 144 sädettä sekunnissa, eli noin 9 sädettä 60 ms:n piirtovälillä, mikä maksaa murto-osan millisekunnista.

Piirto 60 ms:n kuvavälillä ja alus liikkuu 30 solmua (8 s, Playwright-mittaus):

- CPU x1: ruudun väli mediaani 16,7 ms ja p95 16,8–33,3 ms. Yli 100 ms:n ruutuja oli 0–2 kappaletta noin 450:stä (pisin 167 ms). Pitkiä tehtäviä (yli 50 ms) oli 0–9 kappaletta kahdeksassa sekunnissa, pisin 129 ms. `paivita`-kutsun mediaani on 0,1–0,2 ms, p95 8–12 ms ja suurin 28–123 ms.
- CPU x4: ruudun väli mediaani 33–50 ms, p95 67–100 ms ja yli 100 ms:n ruutuja 1–5 kappaletta 115–161:stä.

Muisti: ruudukko enintään noin 39 Mt, säteiden puskuri 720 × 512 tavua (kaiut) ja saman verran jäljelle. Verkosta ensimmäinen näkymä 6 mpk alueella Murolen kohdalla haki 308 pyyntöä ja 4,5 Mt. Pyyntöjen määrä riippuu alueesta ja ruutujen rajoista, ja Range-pyynnöt kuuluvat selaimen välimuistiin.

Jos alue on hidas laitteella, `asetaAlue` kannattaa valita ainakin 1,5 mpk, ja `kaikuPx` (oletus 440) voi laskea kaiun ruudun kokoa.

## 6. Hyväksymiskriteerien tulokset

Testit ovat hakemistossa `testit/` ja tulokset `tulos_*.json`-tiedostoissa. Paketti oli paikallinen (`palvele.py 8142`).

### Kriteeri 1: rantaviiva 20 m:n sisällä 1,5 mpk alueella

Testi `kriteeri1.py` ajaa kolmessa paikassa säteet 0,5 asteen välein (720 sädettä) ja vertaa kunkin säteen ensimmäistä maaosumaa (marssin `ensiOsuma`) tiedoston `nasijarvi.pmtiles` z16-vesipolygonien reunaan (täysi tarkkuus ilman ruudukkoa). Vertailu käyttää samaa lähdeaineistoa kuin maski, joten se mittaa rasteroinnin ja LOD-valinnan tarkkuutta, ei aineiston oikeellisuutta kartan suhteen.

| Paikka | Osumia | Rantaviiva alle 20 m:n päässä osumasta | Ensimmäisen rantaviivan eron mediaani | p95 | Vain maskissa |
|---|---|---|---|---|---|
| Mustalahden edusta | 481 | 478 (99,4 %) | 1,1 m | 4,0 m | 0 |
| Siilinkarin kohta | 348 | 343 (98,6 %) | 1,2 m | 6,3 m | 1 |
| Muroleen kanavan suu | 713 | 711 (99,7 %) | 1,1 m | 3,6 m | 0 |

Ensimmäinen luku mittaa vaatimusta suoraan: säteen ensimmäisen osuman 20 m:n sisällä on veden ja maan raja. Toinen mittaus, ero säteen ensimmäiseen pysyvään rantaviivan ylitykseen, antaa 98,1 %, 96,8 % ja 99,3 % ja suurin ero on 418 m, 511 m ja 214 m. Nämä poikkeamat ovat harvoja säteitä, joiden syytä ei ole selvitetty. Todennäköisiä syitä ovat solukokoa (4 m) ohuemmat maakaistat ja laiturit sekä rantaviivan suuntaisesti kulkevat säteet. Kriteeri täyttyy kaikissa paikoissa, mutta ei 100 %:lla säteistä.

### Kriteeri 2: varjo

Testi `kriteeri2.py` käyttää havaintopistettä E 326397, N 6826385, suuntaa 146,5° (tosisuunta) ja aluetta 3 mpk. Säteellä on Siilinkarin saari (apuloisto, 1899 m, korkeus 8,4 m, yksi 10,9 m:n askel) ja sen takana matala ranta sekä kauempana korkeampi ranta.

| Kohde | Etäisyys | Korkeus | Näkyviä askelia / askelia | Suurin kulma `alfa` |
|---|---|---|---|---|
| Saari | 1 899 m | 8,4 m | 1 / 1 | 0,00147 |
| Matala ranta saaren takana | 3 093 m | 9,3 m | 0 / 4 | 0,00107 |
| Korkeampi ranta kauempana | 3 190 m | 29,4 m | 5 / 132 | 0,00682 |

Kun saari jätetään pois varjokulman laskennasta (kontrolli), saaren takana oleva ranta näkyy 2 askeleella neljästä. Matalan rannan kulma 0,00107 jää saaren kulman 0,00147 alle (varjo), ja korkeamman rannan kulma 0,00682 ylittää sen. Matalan rannan kaiun voimakkuus on 0,000, korkeamman 0,814 ja saaren 0,747. Varjo toimii siis yhdellä säteellä numeroin ja molemmat tapaukset (piilossa ja näkyvä) täyttyvät.

### Kriteeri 3: suorituskyky

Täysi pyyhkäisy 3,5–7,5 ms (mediaani), p95 enintään 14 ms ja suurin 39 ms Chromiumilla Pixel 7 -profiililla ohjelmistopiirrolla. Raja 40 ms täyttyy tässä ajossa (yksi poikkeama 39,2 ms), mutta CPU x4 -hidastuksella mediaani on 21–32 ms ja yksittäisiä pyyhkäisyjä kestää yli 40 ms. Piirto 60 ms:n välein ilman hidastusta: ruudun väli mediaani 16,7 ms ja yli 100 ms:n ruutuja 0–2 kappaletta noin 450:stä. Täsmällisiä lukuja ja varauksia on kohdassa 5. Alle 40 ms täyttyy siis tavallisella konekannalla, mutta oikeaa Pixel 7:ää ei ole mitattu.

### Kriteeri 4: kosketuskohteet, konsolivirheet ja kosketus

- Kosketuskohteet: kaikki 9 näkyvää painiketta, valikkoa ja kenttää sivulla ovat vähintään 44 × 44 px (tutkan 5 nappia 46 × 46 px tai suurempia). Alle 44 px:n kohteita ei ole.
- Konsolivirheitä ei ollut Chromiumilla (Pixel 7 ja iPhone 14 -profiili) eikä WebKitillä (iPhone 14). Esikatselun lataus kesti 21 s Chromiumilla ja 35 s WebKitillä.
- EBL pyyhkäisyllä: asetus 135° antoi 135,0° molemmilla selaimilla (ero 0,0°). Oikealla kosketuksella (CDP:n `Input.dispatchTouchEvent`, Chromium) asetus 260° antoi 260,0°.
- VRM nipistyksellä: sormien väli 100 → 160 px muutti VRM:n 0,50 → 0,80 mpk (suhde 1,6, odotus 1,6) molemmilla selaimilla ja EBL pysyi ennallaan. Oikealla kosketuksella (Chromium) viimeinen väli oli 0,9 kertaa alkuperäinen ja VRM 0,80 → 0,72 mpk (suhde 0,9).
- Napit: `Alue +` 1,5 → 2 mpk, `Alue −` 2 → 1,5 mpk ja `Suunta ylös` vaihtoi tilan, napautettuna `page.touchscreen.tap`-kutsulla molemmilla selaimilla.

WebKitin kosketustestit on tehty pointer-tapahtumilla (`pointerType: 'touch'`), koska WebKitille ei ole Playwrightissa monisormikosketuksen rajapintaa. Oikea kahden sormen kosketus testattiin vain Chromiumilla.

### Kriteeri 5: kuvakaappaukset

Hakemistossa `shots/` on 22 kuvaa:

- `chromium_iphone14_<paikka>_<alue>_mpk.png` ja `webkit_iphone14_<paikka>_<alue>_mpk.png`: paikat `mustalahti`, `siilinkari` ja `murole`, alueet `0-5`, `1-5` ja `3-0` mpk. Jokaisessa kuvassa on tutka (pohjoinen ylös) vasemmalla ja plotterikuva samassa mittakaavassa oikealla. Plotterikuvassa on rantaviiva, turvalaitteet (violetti piste on viitta ja musta neliö kiinteä merkki), rengasväli ja oma sijainti. Jokaiselle selaimelle yhdeksän kuvaa.
- `<selain>_iphone14_elava_keula_ylos_EBL_VRM.png` ja `<selain>_iphone14_elava_pohjoinen_ylos.png`: elävä tutka Mustalahdessa 1,5 mpk alueella, EBL 75° ja VRM 0,40 mpk, jälki 30 s.

Huomioita kuvista:

- Mustalahden ja Siilinkarin kuvissa rannan muoto, saaret ja niiden varjot vastaavat karttaa. Kaukaiset matalat rannat Siilinkarin kohdalla 3 mpk alueella näkyvät vain, kun ne nousevat lähempien esteiden varjokulman yli.
- Muroleen kanavan suulla havaintopiste on kapeassa salmessa, jossa metsäinen ranta on 140–580 m:n päässä joka suunnassa (ensimmäiset osumat 10 asteen välein). Lähirannat varjostavat suurimman osan kauempana olevasta maastosta, joten tutkakuva on kartan avovesiin verrattuna huomattavan harva. Tämä on mallin mukaan oikein, mutta se on silti kuvasarjan harvin kuva ja sen arvioiminen on ihmisen tehtävä.
- Siilinkarin apuloisto (0,4 mpk länteen) näkyy 3 mpk alueella vain pienenä pisteenä, koska saari on vain yhden 10,9 m:n askeleen levyinen.

### Vaihe 3e: viritys (hyvä oletus, huono vanha kuva)

Mittaukset ovat tiedostoissa `testit/tulos_3e_kriteeri1_2_760.json`, `testit/tulos_3e_kriteeri3.json` ja `testit/tulos_3e_suoritus.json`, ja skriptit ovat `testit/kriteeri_3e_1_2.py`, `kriteeri_3e_3.py` ja `suoritus_3e.py`.

- Rannan ensimmäinen osuma, alue 1,5 mpk, hyvä viritys: säteen voimakkuus vähintään 0,7 kaikilla (100 %) näkyvän ensimmäisen osuman säteillä kaikissa kolmessa paikassa. Piirretyssä canvasissa (3 × 3 pikselin ympäristössä) vähintään 0,7 on 97,0 % (Mustalahti), 96,9 % (Siilinkari) ja 99,8 % (Murole).
- Tyhjiä pikseleitä säteiden välisissä rantaviivan kohdissa on tarkalla pikselillä 4, 7 ja 4 kappaletta (1 185, 863 ja 1 779 mittauspisteestä) ja 3 × 3 pikselin toleranssilla 0 kaikissa kolmessa.
- Maa alueena, Mustalahti, 200 m rannasta sisämaahan: 99,4 % näkyvän vyöhykkeen ensimmäisen rannan pikseleistä piirretty (voimakkuus yli 0,3), kaikkien rantojen pikseleistä 98,7 %.
- Varjotesti (kriteeri 2 yllä): varjossa oleva matala ranta 0,000, näkyvä korkeampi ranta 0,879 ja saari 0,957. Menee läpi.
- Huono viritys ilman kohinaa on pikselilleen sama kuin `tutka_3c.js` (0 eroavaa pikseliä 563 600:sta), ensimmäisen osuman voimakkuuden keskiarvo 0,422 / 0,469 / 0,616 sekä vanhalla että uudella (suhde 1,000). Hyvässä virityksessä vastaava keskiarvo on 0,986 / 0,971 / 0,999.
- Suorituskyky (täysi kierros, vanha `tutka_3c.js` ja uusi peräkkäin samassa Chromium-istunnossa, alueet 0,5, 1,5, 3 ja 6 mpk kolmessa paikassa, 12 kierrosta kutakin): kaikkien yhdistelmien summa vanha 94,95 ms, uusi hyvä 94,9 ms (suhde 1,00) ja uusi huono 97,45 ms (1,03). Yksittäisten paikka- ja aluepareittain suhde on 0,48 … 1,56, suurin Siilinkarin 3 mpk (1,56), muut enintään 1,47. Mittausympäristö oli kuormitettu, joten yksittäiset suhteet vaihtelevat noin ±0,2.

### Vaihe 3e-2: metsä ja rakennukset kaikuvat, taajama-alueen pohjataso

Mittaukset ovat tiedostoissa `testit/tulos_3e2_kriteeri.json`, `tulos_3e2_kriteeri2.json`, `tulos_3e2_kriteeri3.json` ja `tulos_3e_suoritus.json`. Skriptit ovat `kriteeri_3e2.py`, `kriteeri2_3e2.py`, `kriteeri_3e_3.py` ja `suoritus_3e.py`.

- Mustalahti, alue 1,5 mpk, hyvä viritys: maamaskin 60 094 pikselistä geometrisesti näkyviä on 9 575 (15,9 %), ja niistä 99,25 % piirretään voimakkuudella yli 0,5 ja 100 % yli 0,3. Vaatimus 90 % täyttyy. Loput 84 % maskista on todellisessa maastovarjossa (Tampereen harju varjostaa kaupungin), eikä niissä ole kaikua. Koko maskista voimakkuus yli 0,3 on 36,4 %.
- Naistenlahden rantaviiva (suuntimat 10–150 astetta): 142 peräkkäisten osumien paria, pisin tyhjä jakso 3 pikseliä ja yli 3 pikselin rakoja 0 kappaletta. Koko kehällä on 6 paria, joissa tyhjä jakso on 4–6 pikseliä (suuntimat noin 169–172, 239, 269 ja 313 astetta), pääosin sataman rakenteiden kohdalla aluksen alla.
- Hyvän virityksen invariantit: varjossa olevia soluja kaiulla 0 ja näkyviä soluja ilman kaikua 0 (kaiun pulssin häntä 15 m viimeisen kaikusolun jälkeen ei ole kaiku). Puolivarjoalue (penumbra) kattaa 13 272 solua, joista 6 291 kaikuu heikosti.
- Huono viritys ilman kohinaa on edelleen pikselilleen vanha: 0 eroavaa pikseliä 563 600:sta kaikissa kolmessa paikassa, ensimmäisen osuman voimakkuus 0,422 / 0,469 / 0,616 sekä vanhalla että uudella. Hyvässä virityksessä vastaava keskiarvo on 0,994 / 0,988 / 1,000.
- Varjotesti metsäsaaren takana: huonossa virityksessä testi toistaa vaiheen 3c luvut (varjossa 0,000, näkyvä 0,814, saari 0,747). Hyvässä virityksessä latvuksen varjo on puolet puun korkeudesta (`latvusKerroin` 0,5), joten saaren takainen metsäranta voi tulla näkyviin latvuksen alta, mikä on tarkoitettu muutos. Kun `latvusKerroin` asetetaan arvoon 1,0, varjossa oleva ranta saa 0,000 ja näkyvä 0,945, eli alkuperäinen varjotesti toistuu. Kaiku lasketaan latvuksen huipusta, mutta varjo vain osittain läpäisevän latvuksen mukaan.
- Suorituskyky (täysi kierros, vaiheen 3e-1 hyvä viritys vertailuna, samassa Chromium-istunnossa, 4 aluetta × 3 paikkaa, 10 kierrosta kutakin, koneen kuorma 5–6): summa vanha 94,95 ms, uusi hyvä 98,65 ms (suhde 1,04) ja uusi huono 93,95 ms (0,99). Yksittäisten yhdistelmien suhde on 0,76–1,23. Aiemmassa mittauksessa summan suhde oli 1,23–1,30. Vaatimus enintään 1,3 täyttyy mutta mittaus on kohinainen. Jos laite on hidas, säteiden määrä alueella 1–3 mpk voidaan laskea 540:een (`M.hyva.sateita3`).
- Kuvat: `shots/3e2_vanha_huono_hyva_<paikka>.png` (vanha, huono ja hyvä rinnakkain, kolme paikkaa), `3e2_<chromium|webkit>_iphone14_<paikka>_<0-5|1-5|3-0>_mpk.png`, `3e2_<selain>_iphone14_viritys_hyva_huono_<paikka>.png` ja `3e2_<selain>_iphone14_elava_*.png`. Kaikki kuvat otetaan vasta kahden täyden kierroksen jälkeen.

## 7. Liittäminen simulaattoriin

Moduuli on kirjoitettu liitettäväksi `sim.js`:ään plotterin rinnalle. Simulaattorin koodiin ei ole koskettu eikä liitosta ole kokeiltu simulaattorissa, joten tämä kohta on ohje eikä testattu tulos. Tarvittavat tilat ovat `Liike.create`-olion kentät (`G.S`):

| Moduulin kenttä | Simulaattorin lähde |
|---|---|
| `e`, `n` | `Paikka.worldToEN(S.x, S.y)`, jolloin `S.x` ja `S.y` ovat ruutukoordinaatit lähtöpisteestä (`G.origin`) |
| `suunta` (tosisuunta) | `Liike.trueHdg(S)` eli `norm360(S.hdg + S.conv)`, sillä `S.hdg` on ruutusuunta ja `S.conv` meridiaanikonvergenssi |
| `nopeusMs` | `S.v` (m/s) |
| `aika` | `S.clockMs` (simulaatioaika ms), jolloin pyyhkäisy pysyy pysäytetyssä simulaatiossa ja nopeutetussa ajossa mukana |

Moduuli laskee itse konvergenssin sijainnistaan (`K.convergenceDeg`), joten ruutusuuntaa ei tarvitse muuntaa erikseen, kun `suunta` annetaan tosisuuntana.

Asettelu `sim.js`:ssä:

- Puhelin (kapea, `!G.layout.wide`): tutka on kolmas vaihtoehto plotterille ja 3D-näkymälle. `G.main` saisi arvon `'tutka'` nykyisten `'plot'` ja `'3d'` lisäksi, ja `swapBtn` kiertäisi kolmen välillä. Plotterin laskentaa ei tarvitse silloin ajaa täydellä taajuudella (`G.lastPlotT`-rajan voi pitää 250 ms:ssa).
- Tabletti ja tietokone (`G.layout.wide`): tutka asetetaan plotterin ja 3D-näkymän rinnalle omaan ruutuunsa (`paneP`:n viereen). Canvas ja `ui: true` riittävät, napit sijoittuvat canvasin päälle.
- Päivitys: `sim.js`:n pääsilmukassa kohdassa, jossa plotteri päivitetään (`G.pl.update(S.x, S.y, S.hdg)`), kutsutaan `G.radar.paivita({...})` noin joka 50. ms. Tutka ei saa kuormittaa 3D-piirtoa: `kuvavali` oletus on 50 ms, ja kun 3D-näkymä on päänäkymä, sen voi nostaa arvoon 100 ms.
- `G.plotterOn` (plotterin sammutus vikatilanteessa): sama vikalogiikka voi sammuttaa tutkan kutsulla `asetaHairio({pois: true})`, ja tutkan oma häiriö (heikko lähetin, suuntavirhe) tulee `asetaHairio`-kutsun kautta vaiheessa 5.
- Jaettu aineistolukija: simulaattorin `Aineisto`-moduuli (`aineisto.js`, jolla on `layers`, `png`, `stats` ja `getBase`) annetaan tutkalle asetuksella `aineisto: root.Aineisto`. Tutka käyttää silloin samaa PMTiles-lukijaa ja välimuistia eikä hae tiedostoja toiseen kertaan. Ilman tätä asetusta annetaan `aineistoUrl`. Moduulia ei ole ajettu simulaattorin sisällä, mutta rajapinnan nimet on tarkistettu `aineisto.js`:stä.
- Muisti: `vapautaRuudut()` kannattaa kutsua, kun tutka piilotetaan pitkäksi aikaa.

Simulaattorin harjoituksen reittipisteet, turvalaitteiden aineisto ja maasto ovat samoja kuin plotterilla, joten tutkakuva ja plotteri näyttävät saman maailman.

## 8. Epävarmat asiat ja tunnetut rajoitukset

- Viritystilojen vakiot (hyvässä pohjataso 0,55, metsä 0,72, rakennus 1,0, rantakaiun alaraja 1,0 ja etäisyysvaimennuksen 14 000 m) on valittu täyttämään vaiheiden 3e ja 3e-2 hyväksymiskriteerit, ei kalibroitu todellista DRS6A-kuvaa vastaan. Maastonmuodon varjo on aito: esimerkiksi Mustalahden eteläpuolella Tampereen harju (noin 17 m järven pinnan yläpuolella 600 m:n päässä) varjostaa sen takana olevan kaupungin, joten vain noin 40 % maamaskin pikseleistä on valaistu. Jos käyttäjä haluaa kuvan täyttyvän enemmän, taipumavyöhykettä (`M.hyva.varjoTol`, `varjoMatkaM`) voi kasvattaa, mutta se heikentää varjotestin tarkkuutta. Hyvässä virityksessä latvusto kaikuu täydestä korkeudestaan ja varjoa heittää 0,5 × latvuston korkeus, joten metsäisen saaren takana oleva metsäranta voi näkyä, vaikka avoin matala ranta ei näkyisi. Asetus `latvusKerroin` = 1,0 palauttaa täyden latvustovarjon (varjotesti, ks. kohta 6).
- Hyvän virityksen säteitä on 600 alueilla 1–3 mpk (720 olisi nostanut pyyhkäisyn laskenta-ajan yli 1,5-kertaiseksi). Suuremmalla tietokoneella luku voi nousta 720:een muuttamalla `M.hyva.sateita3`.
- Kaiun voimakkuuden kertoimet (0,6 rinteen jyrkkyys, 25 m korkeusnormi, pohjatasot 0,14 ja 0,28, vähimmäisrantakaiku 0,3) on valittu niin, että kuva on luettavan näköinen ja heikon rannan ja jyrkän rannan ero näkyy. Niitä ei ole kalibroitu todellisia DRS6A-kuvia vastaan, koska sellaisia ei ollut käytettävissä. Todellisen tutkakuvan kanssa vertailu Repan operaattorin kanssa kannattaa tehdä ennen opetuskäyttöä.
- Vaakakeilan leveys 2,0° ja pulssin pituus 12 m ovat tyypillisiä arvoja noin 4 jalan avoimelle antennille. Verkosta ei löytynyt DRS6A:n tarkkoja keilaleveyksiä (hakusivuilla niitä ei ollut), joten arvot ovat arvioita.
- Puuston läpäisy (kerroin 0,5) ja 30 %:n latvuspeittoraja ovat arvioita, joilla metsäinen ranta antaa luontevan varjon. Talvella lehdettömät puut ja lumi muuttaisivat kuvaa.
- Korkeusmalli ei erota aivan matalimpia rantoja (kivet, ruovikko, penkka), joten maalle on asetettu vähimmäiskorkeus 1,2 m. Arvo on arvio.
- Murolessa kuva on mallin mukaan harva, ja siitä pitää katsoa, onko se oikeasti sama kuin todellinen tutkakuva samassa kohdassa. Tähän ei ole todennettua vertailuaineistoa.
- Vertailu kriteerissä 1 käyttää samaa aineistoa kuin maski. Kartan ja todellisen rannan ero (aineiston oma virhe, järven vedenkorkeus) ei sisälly lukuihin.
- Kriteerin 1 loput 1–4 % säteistä (ohuet maakaistat, rantaviivan suuntaiset säteet) on jätetty selvittämättä.
- Suorituskyky on mitattu simuloidulla Pixel 7:llä (Chromium, ohjelmistopiirto), ei oikealla laitteella. Ruudun rakennus kuormittaa pääsäiettä 3,4 ms ruutua kohden, ja nopealla ajolla uusi ruutu rakennetaan noin kerran minuutissa.
- WebKitillä monisormikosketus on testattu vain synteettisillä pointer-tapahtumilla.
- Korjaus, joka löytyi mittauksissa: ruutujen FIFO-poisto saattoi poistaa ruudun, jota `valmis()` oli juuri odottamassa, jolloin lupaus ei toteutunut. Ruudut siirretään nyt käytön mukaan jonon loppuun, ja `ilmoitaValmis` käynnistää puuttuvien ruutujen latauksen uudelleen.

## 9. Lähteet

Yleistietoa tutkakuvasta haettiin verkosta 25.10.2026.

- Yachting Monthly, "How it works: yacht radar" (julkaistu 24.4.2025), `https://www.yachtingmonthly.com/gear/how-it-works-yacht-radar-101211`. Käytetty: antennin pystykeila tyypillisesti 25–30°, noin 4 m on hyvä antennikorkeus huvialuksella, kantama riippuu enemmän näkölinjasta kuin tehosta, kiinteät merkit ja poijut näkyvät yleensä hyvin, mutta liian pieni vahvistus pudottaa pienet kohteet ja merikohina (sea clutter) voi peittää lähikohteet, saarten ja rannan muoto voi näkyä ruudulla erilaisena kuin kartalla.
- Defender, Furuno DRS6AX X-Class UHD -tuotesivu, `https://defender.com/en_us/furuno-drs6ax-x-class-uhd-radar-base-and-antennas` (sivulla ei päiväystä, haettu 25.10.2026). Käytetty: antennipituudet 3,5, 4 ja 6 jalkaa, kierrosnopeus 24, 36 tai 48 kierr./min tai kiinteä 24, alueet 0,0625–120 mpk ja lähetysteho 6 kW. Vaakakeilan leveyttä sivulla ei ollut.
- Hakutulokset (Marine Insight "5 Effective Radar Techniques for Navigators", Boote-Magazin tutkaopas) käsittelevät varjosektoreita ja pientä kaikua, mutta niiden sisältöä ei ole luettu tarkemmin. Varjomalli perustuu tutkahorisontin standardikaavaan (4/3-maapallon säde) ja geometriaan.

Muut lähteet: simulaattorin koodi `/home/claude/reittikartta-sim/lahdekoodi/simulaattori/js/` (`paikka.js`, `aineisto.js`, `mvt.js`, `maasto.js`, `merkit.js`, `plotteri.js`, `sim.js`) ja paketin kuvaus `/home/claude/opetus/navi/putki/ulos/aineisto.json`.
