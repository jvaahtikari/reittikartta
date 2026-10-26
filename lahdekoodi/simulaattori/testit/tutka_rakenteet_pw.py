"""Vaihe 3h kohta 2.4: vesirakenteet (laiturit, aallonmurtajat, vesikivet) ja sillat tutkan maskissa.
Tutka luetaan itsenäiselle testisivulle (ei simulaattoria). Mitataan (1) maskin rakennesolut, (2) kuinka suuri osa MVT:n laituriviivan näkyvistä
näytepisteistä piirtyy tutkaan voimakkuudella yli 0,3 (hyvä ja huono viritys), (3) Tammerkosken sillan viiva 0,5 mpk:lla. Kuvat tutka + plotteri vierekkäin.
Käyttö: python3 tutka_rakenteet_pw.py [kuvat]"""
import sys, os, json, math
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
SIVU = SIM + 'simulaattori/testit/tutka_testisivu.html?aineisto=' + PAKETTI
# Naistenlahden laiturikeskittymä (lon, lat) ja Mustalahden edusta (TM35FIN)
NAIS_LL = (23.7700, 61.5100)
MUSTA = (327184, 6823553)      # Harjoitus 1:n lähtöpiste Mustalahdessa, Tammerkosken sillan (taso 1) kohdalta noin 150 m
JS_KUVA = '''async ([E,N,R,hdg,viritys])=>{
  T.asetaSuuntaYlos(false); T.asetaViritys(viritys); T.asetaAlue(R); T.paivita({e:E,n:N,suunta:hdg,nopeus:0,aika:1000}); await T.valmis();
  T.testi.kaikuPuskuri(true); T.taytaKierros(); T.taytaKierros(); T.piirra();
  const K=T.testi.kaikuKuva(), geo=T.testi.geom();
  // maskin rakennesolut ruudukosta (lippu 4...8) ympäri tutkan
  const rangeM=R*1852, cnt={4:0,5:0,6:0,7:0,8:0}; const st=Math.max(1,Math.round(rangeM/160)); let tot=0;
  for(let y=-rangeM;y<=rangeM;y+=st)for(let x=-rangeM;x<=rangeM;x+=st){ if(Math.hypot(x,y)>rangeM)continue; const m=T.testi.maaAt(E+x,N+y); tot++; if(m&&m.f>=4)cnt[m.f]++; }
  return {cnt, tot, nb:T.testi.raaka().nb, geo:{cx:geo.cx,cy:geo.cy,r:geo.r}};
}'''
# riippumaton vertailuaineisto: laituriviivojen ja siltojen näytepisteet MVT:stä (z16), TM35FIN
JS_REF = '''async ([E,N,R,laji])=>{
  const rangeM=R*1852, out=[]; const K=Tutka.K, z=16;
  const ll=K.enToLonLat(E,N), t0=K.lonlatToTile(ll.lon,ll.lat,z), t={x:Math.floor(t0.x),y:Math.floor(t0.y)}, dt=Math.ceil(rangeM/ (40075016/Math.pow(2,z)*Math.cos(ll.lat*Math.PI/180)))+1;
  const rd=T.testi.vakiot; const lukija=window.__lukija||(window.__lukija=Tutka.luoLukija('%s'));
  const names=['vesieste','tie'];
  for(let dx=-dt;dx<=dt;dx++)for(let dy=-dt;dy<=dt;dy++){
    const l=await lukija.vektori(z,t.x+dx,t.y+dy,names); if(!l)continue;
    const feats=(laji==='silta')?(l.tie?l.tie.features.filter(f=>f.props.taso>0):[]):(l.vesieste?l.vesieste.features.filter(f=>/laituri|aallonmurt/.test(f.props.laji)):[]);
    const ext=(laji==='silta'?l.tie:l.vesieste).extent||4096;
    const n=Math.pow(2,z);
    function en(u,v){const lon=(t.x+dx+u/ext)/n*360-180;const m=Math.PI*(1-2*(t.y+dy+v/ext)/n);const lat=Math.atan(Math.sinh(m))*180/Math.PI;const p=K.lonlatToEN(lon,lat);return [p.e,p.n];}
    feats.forEach(f=>{ if(f.type!==2)return; f.parts.forEach(a=>{ for(let i=0;i+3<a.length;i+=2){ const p0=en(a[i],a[i+1]),p1=en(a[i+2],a[i+3]),L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),ns=Math.max(1,Math.ceil(L/1));
      for(let m=0;m<=ns;m++){const e=p0[0]+(p1[0]-p0[0])*m/ns,nn=p0[1]+(p1[1]-p0[1])*m/ns; if(Math.hypot(e-E,nn-N)<rangeM*0.95 && Math.hypot(e-E,nn-N)>15){ const mm=T.testi.maaAt(e,nn); if(mm&&(mm.f===0||mm.f>=4)) out.push([e,nn,f.props.laji||f.props.nimi||'']); }} } }); });
  }
  return out;
}''' % PAKETTI
JS_PIKSELIT = '''([E,N,R,pts,mx])=>{
  // piirretyn kaikuvoimakkuuden maksimi 3 x 3 pikselin ympäristössä jokaiselle näytepisteelle (tutka pohjoinen ylös, kaikukuva K: n x n, säde n/2 = R)
  const K=T.testi.kaikuKuva(), n=K.n, half=n/2, rangeM=R*1852, v=K.v; let yli3=0, yli5=0, kaikki=0, nak=0; const prof={};
  const NR=T.testi.raaka().nr;
  pts.forEach(p=>{ const dx=p[0]-E, dy=p[1]-N, s=Math.hypot(dx,dy); const x=Math.floor(half+dx/rangeM*half), y=Math.floor(half-dy/rangeM*half);
    let m=0; for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const xx=x+i,yy=y+j; if(xx>=0&&yy>=0&&xx<n&&yy<n)m=Math.max(m,v[yy*n+xx]);}
    // näkyvyys: onko säteen profiilissa varjoton (alfa > edellinen suurin)
    let a=Math.atan2(dx,dy)*180/Math.PI; if(a<0)a+=360; const k=Math.round(a/360*NR)%NR; const pf=prof[k]||(prof[k]=T.testi.profiili(k*360/NR));
    const ii=Math.min(pf.s.length-1,Math.max(0,Math.round(s/pf.s[0])-1)); const vis=(pf.alfa[ii]>(ii>0?pf.amax[ii-1]:-1e9)) ;
    kaikki++; if(!vis)return; nak++; if(m>0.3*255)yli3++; if(m>0.5*255)yli5++; });
  return {pisteita:kaikki, nakyvia:nak, yli03:yli3, yli05:yli5, osuus03:nak?+(100*yli3/nak).toFixed(1):null, osuus05:nak?+(100*yli5/nak).toFixed(1):null};
}'''
ORIGIN = (327184, 6823553)
def plotteri(c, E, N, mpk, nimi):
    q = c.new_page(); q.goto(SIM + 'simulaattori/testit/plotteri_testi.html?aineisto=%s&x=%d&y=%d&h=0&mpk=%g&n=1&route=0' % (PAKETTI, E - ORIGIN[0], N - ORIGIN[1], mpk))
    q.wait_for_function('window.__aidsReady===true', timeout=60000); q.wait_for_timeout(5000)
    f = os.path.join(out, nimi); q.screenshot(path=f); q.close(); return f
def vierekkain(a, b, ulos, ta, tb):
    A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB'); h = max(A.height, B.height)
    I = Image.new('RGB', (A.width + B.width + 10, h + 28), (10, 20, 30)); I.paste(A, (0, 28)); I.paste(B, (A.width + 10, 28))
    d = ImageDraw.Draw(I); d.text((8, 8), ta, fill=(255, 255, 255)); d.text((A.width + 18, 8), tb, fill=(255, 255, 255)); I.save(ulos)
def lonlat_en(p, lon, lat): return p.evaluate('([a,b])=>{const q=Tutka.K.lonlatToEN(a,b);return [q.e,q.n]}', [lon, lat])

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--disable-gpu'], proxy=proxy_opts())
    c = b.new_context(viewport={'width': 760, 'height': 760}); p = c.new_page(); errs = []; collect(p, errs)
    p.goto(SIVU); p.wait_for_function('window.T', timeout=60000)
    res = {}; kuvat = {}
    E, N = lonlat_en(p, *NAIS_LL)
    res['naistenlahti_E_N'] = [round(E), round(N)]
    for R in (0.125, 0.25):
        for vir in ('hyva', 'huono'):
            r = p.evaluate(JS_KUVA, [E, N, R, 0, vir])
            ref = p.evaluate(JS_REF, [E, N, R, 'laituri'])
            r['ref_pisteita'] = len(ref)
            r['piirto'] = p.evaluate(JS_PIKSELIT, [E, N, R, ref, 0])
            res['nais_%s_%s' % (R, vir)] = r
            if vir == 'hyva':
                p.screenshot(path=os.path.join(out, '_3h_tutka_naistenlahti_%s.png' % R))
                kuvat.setdefault('nais', []).append((R, os.path.join(out, '_3h_tutka_naistenlahti_%s.png' % R), plotteri(c, E, N, 2 * R, '_3h_plotteri_naistenlahti_%s.png' % R)))
    # silta: Mustalahden edusta 0,5 mpk
    E2, N2 = MUSTA
    for vir in ('hyva', 'huono'):
        r = p.evaluate(JS_KUVA, [E2, N2, 0.5, 0, vir])
        ref = p.evaluate(JS_REF, [E2, N2, 0.5, 'silta'])
        r['ref_pisteita'] = len(ref); r['piirto'] = p.evaluate(JS_PIKSELIT, [E2, N2, 0.5, ref, 0])
        res['silta_%s' % vir] = r
        if vir == 'hyva':
            p.screenshot(path=os.path.join(out, '_3h_tutka_silta_mustalahti.png'))
            # diagnostiikka: vertailuaineiston siltapisteet magentana kuvan päälle
            p.evaluate('''([E,N,R,pts])=>{const g=T.testi.geom(),cv=document.getElementById('c'),ctx=cv.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);const k=cv.width/cv.clientWidth;ctx.fillStyle='#ff40ff';
              pts.forEach(q=>{const x=(g.cx+(q[0]-E)/(R*1852)*g.r)*k,y=(g.cy-(q[1]-N)/(R*1852)*g.r)*k;ctx.fillRect(x-1,y-1,2,2);});ctx.restore();}''', [E2, N2, 0.5, ref])
            p.screenshot(path=os.path.join(out, '_3h_tutka_silta_mustalahti_diag.png'))
    # siltakuvat 0,5 ja 0,25 mpk päällekkäin
    rivit = []
    for R in (0.5, 0.25):
        p.evaluate(JS_KUVA, [E2, N2, R, 0, 'hyva']); f1 = os.path.join(out, '_3h_tutka_silta_%s.png' % R); p.screenshot(path=f1)
        f2 = plotteri(c, E2, N2, 2 * R, '_3h_plotteri_silta_%s.png' % R); f3 = os.path.join(out, '_3h_silta_rivi_%s.png' % R)
        vierekkain(f1, f2, f3, 'Tutka %s mpk (hyvä viritys), Tammerkosken silta Mustalahdessa' % R, 'Plotteri, näkymän korkeus %s mpk, pohjoinen ylös' % (2 * R)); rivit.append(f3)
    A, B = [Image.open(f) for f in rivit]
    I = Image.new('RGB', (max(A.width, B.width), A.height + B.height), (10, 20, 30)); I.paste(A, (0, 0)); I.paste(B, (0, A.height)); I.save(os.path.join(out, '3h_tutka_silta_mustalahti.png'))
    for R, a, bb in kuvat['nais']:
        vierekkain(a, bb, os.path.join(out, '_3h_tutka_naistenlahti_laiturit_%s.png' % R), 'Tutka %s mpk (hyvä viritys), Naistenlahden laiturit' % R, 'Plotteri, näkymän korkeus %s mpk, pohjoinen ylös' % (2 * R))
    A, B = [Image.open(os.path.join(out, '_3h_tutka_naistenlahti_laiturit_%s.png' % R)) for R in (0.125, 0.25)]
    I = Image.new('RGB', (max(A.width, B.width), A.height + B.height), (10, 20, 30)); I.paste(A, (0, 0)); I.paste(B, (0, A.height)); I.save(os.path.join(out, '3h_tutka_naistenlahti_laiturit.png'))
    print(json.dumps(res, ensure_ascii=False, indent=1)); print('virheet', errs[:3])
    b.close()
