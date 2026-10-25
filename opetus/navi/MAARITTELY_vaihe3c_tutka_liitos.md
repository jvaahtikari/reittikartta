# Määrittely, vaihe 3c: tutkan liittäminen simulaattoriin

Päiväys 25.10.2026. Tekijä: Sonnet-agentti. Tilaaja: Fable. Työ tehdään hakemistossa `/home/claude/reittikartta-sim/`. Tutkamoduuli on valmiina hakemistossa `/home/claude/tutka/` (`tutka.js`, kuvaus `TUTKA.md`, erityisesti kohta 7 liittämisestä).

## 1. Tehtävä

1. Kopioi `tutka.js` simulaattorin `js/`-hakemistoon ja liitä se `sim.js`-tilaan `TUTKA.md`-ohjeen mukaan: tutka saa oman sijainnin, tosisuunnan, nopeuden ja ajan samasta tilasta kuin plotteri, ja käyttää jaettua PMTiles-lukijaa (`aineisto`), ei omaa.
2. Näkymät navigoijan roolissa: puhelimessa pystyasennossa päänäkymässä on nappi, jolla plotterin tilalle vaihtuu tutka (ja takaisin), ja pieni 3D-ikkuna pysyy kulmassa. Tabletilla ja tietokoneella (leveys vähintään 1024 px) 3D-näkymä ja plotteri ovat rinnakkain, ja tutkan voi valita plotterin tilalle tai, jos leveys on vähintään 1440 px, kolmanneksi ruuduksi. Tutkan napit (alue, suunta ylös, EBL, VRM) ovat moduulin omia, ja ne sijoitetaan tutkaruudun reunaan vähintään 44 px kokoisina.
3. Tutkan sammutus kirjataan komentolokiin kuten plotterin sammutus, ja harjoituksen purkuun lisätään tieto, kuinka suuren osan ajasta tutka oli näkyvissä.
4. Harjoituksen aloitusnäyttöön valinta "Näytöt: plotteri, tutka, molemmat" (oletus plotteri).

## 2. Hyväksymiskriteerit

1. Tutka toimii simulaattorissa ajon aikana: Siilinkarin kohdalla 1,5 mpk alueella tutkakuva vastaa esikatselun kuvaa (silmämääräinen vertailu kuvakaappauksista, ja sädekohtainen ensimmäinen osuma täsmää esikatselun testin arvoihin kolmessa säteessä).
2. Kuvaväli 30 solmun ajossa tutka päällä: mediaani alle 70 ms SwiftShaderilla Pixel 7 -profiililla (tutka lisää kuormaa, joten raja on hieman korkeampi kuin vaiheessa 3), ja ilman tutkaa edelleen alle 60 ms.
3. Mobiilitestit WebKit iPhone 14 ja Chromium Pixel 7: näkymän vaihto plotteri–tutka, EBL ja VRM kosketuksella, aluenapit, ei konsolivirheitä, kosketuskohteet vähintään 44 px.
4. Kuvakaappaukset: puhelin tutkanäkymässä ajon aikana, tabletti rinnakkain (3D ja tutka), tietokone kolmella ruudulla, ja purku tutkatiedolla, hakemistoon `lahdekoodi/simulaattori/shots/` etuliitteellä `3c_`.
5. `build.py` tuottaa `simulaattori.html`-tiedoston, `index.html` pysyy muuttumattomana.

## 3. Työtapa

Kuten aiemmin: paketti paikallisesti (`python3 /home/claude/opetus/navi/putki/palvele.py 8140`), Playwright asennettu (älä aja `playwright install`), lyhyet ajot timeoutilla, työloki `TYOLOKI.md`, ei kysymyksiä tilaajalle, suomeksi ilman puolipisteitä. Älä muuta liikemallia, harjoituksen laskentaa, merkkejä tai maastoa. Raportti `lahdekoodi/simulaattori/RAPORTTI_vaihe3c.md`, lyhyt ja numeroitu.

Palauta lopuksi lyhyt yhteenveto: muuttuneet tiedostot, kriteerien 1–5 tulokset lukuina ja kuvien polut. Älä liitä koodia vastaukseen.
