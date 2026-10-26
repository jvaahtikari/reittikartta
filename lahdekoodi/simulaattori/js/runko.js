/* js/runko.js: Repan runkomalli. TUOTETTU tiedostosta tyokalut/tee_runko.py (hull3d.js + hull_offsets.json). Älä muokkaa käsin.
 * Käyttö: const r = Runko.build(THREE, Runko.DATA, {interior:true, merge:true}); r.boat on THREE.Group (malli: x keulaan, y SB, z ylös, three.js:ssä (x, z, y)).
 * Alkuperäisestä hull3d.js:stä on poistettu vain renderer, scene, valot ja vesitaso. Ohjaamolle on lisätty sisätilaversio. */
(function (root) {
'use strict';
function build(THREE, HULLDATA, OPTS) {
OPTS = OPTS || {};
/* hull3d.js */
/* Vaiheen 1 runkopiirto (runko_preview.html), kopioitu sellaisenaan. Muutokset: HULL tulee globaalista REPA_OFFSETS, hullShell-viite lisätty, kameraosa siirretty sim3d.js:ään. */


// ---------------------------------------------------------------------------------------------
// Väritys ja yleiset parametrit (muuta tästä)
// ---------------------------------------------------------------------------------------------
const LIVERY = {
  hull:'#f1f1ec',          // rungon kyljet vesirajasta ylös
  stripe:'#d8402a',        // kansiviivan alla kulkeva kapea raita
  stripeHeight:0.187,      // punaisen raidan alareuna kansiviivasta alas m (reunalistan 0,097 + raita 0,09)
  rubber:'#26282b',        // reunalista (D-kumi) ja törmäyskumi
  rubberHeight:0.097,      // reunalistan korkeus m (YJ sivukuvanto, D-kumi 100x100)
  rubberProj:0.04,         // reunalistan ulkonema rungon pinnasta m (YJ:n leveys 4,5 m miinus mitattu 4,42 m)
  stemZ0:0.18, stemZ1:1.94,// törmäyskumin alku- ja loppukorkeus (YJ sivukuvanto, KV 11)
  bottom:'#4a4e53',        // vesirajan alapuolinen pohja
  superstructure:'#d8402a',// ohjaamo ja kajuutan katto
  glass:'#08090b',         // ikkunat
  text:'#ffffff',          // SAR-teksti
  aftDeck:'#c23a25',       // peräkansi, liukuestepinta
  deckEdge:'#8f9397',      // kansi muualla ja peräkannen reunat
  swim:'#45484d',          // uimataso
  rails:'#d9dde0',         // kaiteet, vaalea rosteri
  mast:'#575b60',          // masto
  jets:'#2e3034',          // jetit
  hatch:'#6b6f74',         // luukkujen kannet
  hatchFrame:'#2b2d30',    // luukkujen kehykset
  cabinet:'#ecece8',       // peräkannen laatikot ja kaapit (valkoinen)
  cabinetTop:'#9a9ea3',    // laatikoiden kannet
  glassFrame:'#5b6066',    // ikkunoiden karmit
  lifebuoy:'#e8572f',      // pelastusrengas
  water:'#2c5a77',         // vesi
  background:'#cfd8de',
  waterOpacity:0.55
};
const DRAFT = {Ta:0.942, Tf:0.615, L:11.9};   // syväys perässä ja keulassa, m
const HULL = HULLDATA;   // sama data kuin hull_offsets.json (rakennusskripti liittää sen sivulle)

// ---------------------------------------------------------------------------------------------
// Apufunktiot. Malli: x keulaan, y SB positiivinen, z ylös. Three.js: (x, z, y).
// ---------------------------------------------------------------------------------------------
const V3 = (x,y,z)=>new THREE.Vector3(x,z,y);
const col = c=>new THREE.Color(c);
const ST = HULL.stations;
const NS = ST.length;
function lerpArr(a,b,t){return a+(b-a)*t;}
function stationAt(x){            // interpoloitu poikkileikkaus
  if(x<=ST[0].x) return ST[0].pts;
  if(x>=ST[NS-1].x) return ST[NS-1].pts;
  let i=Math.floor((x-ST[0].x)/0.25); i=Math.max(0,Math.min(NS-2,i));
  const t=(x-ST[i].x)/(ST[i+1].x-ST[i].x);
  return ST[i].pts.map((p,k)=>[lerpArr(p[0],ST[i+1].pts[k][0],t),lerpArr(p[1],ST[i+1].pts[k][1],t)]);
}
const zDeck = x=>{const p=stationAt(x); return p[p.length-1][1];};
const hDeck = x=>{const p=stationAt(x); return p[p.length-1][0];};
const zWL = x=>DRAFT.Ta+(DRAFT.Tf-DRAFT.Ta)*x/DRAFT.L;

class Mesh3{                      // yksinkertainen kolmioiden keräin
  constructor(){this.pos=[];this.nrm=[];this.col=[];this.aWl=[];this.aSh=[];}
  tri(a,b,c,hint,color){          // a,b,c THREE.Vector3, hint = ulospäin osoittava suunta (THREE)
    const n=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
    if(n.lengthSq()<1e-14) return;
    if(hint && n.dot(hint)<0){const t=b;b=c;c=t;n.negate();}
    n.normalize();
    for(const p of [a,b,c]){this.pos.push(p.x,p.y,p.z);this.nrm.push(n.x,n.y,n.z);
      if(color){this.col.push(color.r,color.g,color.b);} }
  }
  quad(a,b,c,d,hint,color){this.tri(a,b,c,hint,color);this.tri(a,c,d,hint,color);}
  quadF(a,b,c,d,hint){          // tasainen normaali koko nelikulmiolle (kierteiset nelikulmiot ilman sahalaitaa)
    const n=new THREE.Vector3().subVectors(c,a).cross(new THREE.Vector3().subVectors(d,b));
    if(n.lengthSq()<1e-14) return; if(hint && n.dot(hint)<0) n.negate(); n.normalize();
    for(const p of [a,b,c,a,c,d]){this.pos.push(p.x,p.y,p.z);this.nrm.push(n.x,n.y,n.z);}
  }
  geom(){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nrm,3));
    if(this.col.length) g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));
    return g;}
}
function centerOf(...vs){const c=new THREE.Vector3();vs.forEach(v=>c.add(v));return c.multiplyScalar(1/vs.length);}
function std(color,opts){return new THREE.MeshStandardMaterial(Object.assign({color:col(color),roughness:0.62,metalness:0.05},opts||{}));}
function addMesh(parent,geom,mat){const m=new THREE.Mesh(geom,mat);parent.add(m);return m;}

// Suljettu prisma monikulmiosta (malli-xy) välillä z0..z1, ylä- ja alapinta kolmioitu
function prism(poly,z0,z1,color,opts){
  opts=opts||{};
  const m=new Mesh3();
  const n=poly.length;
  const cx=poly.reduce((s,p)=>s+p[0],0)/n, cy=poly.reduce((s,p)=>s+p[1],0)/n, cz=(z0+z1)/2;
  const C=V3(cx,cy,cz);
  const contour=poly.map(p=>new THREE.Vector2(p[0],p[1]));
  const tris=THREE.ShapeUtils.triangulateShape(contour,[]);
  const zt=opts.zTop||(()=>z1);
  for(const t of tris){
    const a=poly[t[0]],b=poly[t[1]],c=poly[t[2]];
    m.tri(V3(a[0],a[1],zt(a[0])),V3(b[0],b[1],zt(b[0])),V3(c[0],c[1],zt(c[0])),new THREE.Vector3(0,1,0));
    m.tri(V3(a[0],a[1],z0),V3(b[0],b[1],z0),V3(c[0],c[1],z0),new THREE.Vector3(0,-1,0));
  }
  for(let i=0;i<n;i++){
    const a=poly[i],b=poly[(i+1)%n];
    const A=V3(a[0],a[1],z0),B=V3(b[0],b[1],z0),Cc=V3(b[0],b[1],zt(b[0])),D=V3(a[0],a[1],zt(a[0]));
    const mid=centerOf(A,B,Cc,D);
    m.quad(A,B,Cc,D,new THREE.Vector3(mid.x-C.x,0,mid.z-C.z),null);
  }
  return m.geom();
}
function tube(parent,p0,p1,r,color,seg){      // sylinteri kahden pisteen (malli-koordinaatit) välille
  const a=V3(...p0),b=V3(...p1); const d=new THREE.Vector3().subVectors(b,a); const L=d.length();
  const g=new THREE.CylinderGeometry(r,r,L,seg||10,1,false);
  const m=new THREE.Mesh(g,std(color,{roughness:0.35,metalness:0.4}));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  parent.add(m); return m;
}
function tubeM(parent,p0,p1,r,mat,seg){
  const a=V3(...p0),b=V3(...p1); const d=new THREE.Vector3().subVectors(b,a); const L=d.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,seg||10,1,false),mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  parent.add(m); return m;
}
function taper(parent,p0,p1,r0,r1,color,seg){   // kartiomainen putki, r0 alkupäässä ja r1 loppupäässä
  const a=V3(...p0),b=V3(...p1); const d=new THREE.Vector3().subVectors(b,a); const L=d.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r0,L,seg||14,1,false),std(color,{roughness:0.5}));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  parent.add(m); return m;
}
function beam(parent,p0,p1,w,h,mat){            // suorakaideprofiilinen palkki kahden pisteen välillä
  const a=V3(...p0),b=V3(...p1); const d=new THREE.Vector3().subVectors(b,a); const L=d.length();
  const m=new THREE.Mesh(new THREE.BoxGeometry(L,h,w),mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),d.normalize());
  parent.add(m); return m;
}
function box(parent,x0,x1,y0,y1,z0,z1,color,opts){      // malli-koordinaattien laatikko
  const g=new THREE.BoxGeometry(x1-x0,z1-z0,y1-y0);
  const m=new THREE.Mesh(g,std(color,opts));
  m.position.set((x0+x1)/2,(z0+z1)/2,(y0+y1)/2); parent.add(m); return m;
}

// ---------------------------------------------------------------------------------------------
// Näkymä, valot, vesi
// ---------------------------------------------------------------------------------------------
const boat=new THREE.Group();     // koko vene

// ---------------------------------------------------------------------------------------------
// Runko: loftattu pinta, kolme paneelia per puoli, särmät pallessa ja alapallessa pysyvät terävinä
// ---------------------------------------------------------------------------------------------
const hullMatUniforms={uHull:{value:col(LIVERY.hull)},uStripe:{value:col(LIVERY.stripe)},uBottom:{value:col(LIVERY.bottom)},uStripeH:{value:LIVERY.stripeHeight},uRub:{value:col(LIVERY.rubber)},uRubH:{value:LIVERY.rubberHeight}};
function hullMaterial(){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.55,metalness:0.02});
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,hullMatUniforms);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aWl;\nattribute float aSh;\nvarying float vWl;\nvarying float vSh;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWl=aWl;vSh=aSh;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vWl;\nvarying float vSh;\nuniform vec3 uHull;\nuniform vec3 uStripe;\nuniform vec3 uBottom;\nuniform float uStripeH;\nuniform vec3 uRub;\nuniform float uRubH;')
      .replace('#include <color_fragment>','#include <color_fragment>\n{vec3 c=uHull; if(vSh>-uStripeH) c=uStripe; if(vSh>-uRubH) c=uRub; if(vWl<0.0) c=uBottom; diffuseColor.rgb=c;}');
  };
  return mat;
}
const PANELS=[[0,2],[2,4],[4,7]];      // pisteindeksit: köli-alapalle, alapalle-ylempi särmä, ylempi särmä-kansiviiva
function buildHull(){
  const g=new THREE.Group();
  const mat=hullMaterial();
  for(const side of [1,-1]){
    for(const [j0,j1] of PANELS){
      const pos=[],aw=[],as=[],idx=[];
      const nc=j1-j0+1;
      for(let i=0;i<NS;i++){
        const x=ST[i].x, zs=ST[i].pts[7][1];
        for(let j=j0;j<=j1;j++){
          const p=ST[i].pts[j];
          const v=V3(x,side*p[0],p[1]); pos.push(v.x,v.y,v.z);
          aw.push(p[1]-zWL(x)); as.push(p[1]-zs);
        }
      }
      for(let i=0;i<NS-1;i++)for(let j=0;j<nc-1;j++){
        const a=i*nc+j,b=(i+1)*nc+j,c=(i+1)*nc+j+1,d=i*nc+j+1;
        // ulkopuoli: SB-puolella (three +z) ja pohjalla; valitaan kiertosuunta puolen mukaan
        if(side>0){idx.push(a,c,b, a,d,c);} else {idx.push(a,b,c, a,c,d);}
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      geo.setAttribute('aWl',new THREE.Float32BufferAttribute(aw,1));
      geo.setAttribute('aSh',new THREE.Float32BufferAttribute(as,1));
      geo.setIndex(idx); geo.computeVertexNormals();
      // tarkistus: normaalin pitää osoittaa ulospäin, käännä tarvittaessa
      const nrm=geo.attributes.normal, p=geo.attributes.position;
      const k=Math.floor(NS/2)*nc+Math.floor(nc/2);
      const out=new THREE.Vector3(0,p.getY(k)-1.0,p.getZ(k)); // rungon sisäakselista ulos
      const nn=new THREE.Vector3(nrm.getX(k),nrm.getY(k),nrm.getZ(k));
      if(nn.dot(out)<0){ const ii=geo.index.array; for(let t=0;t<ii.length;t+=3){const s=ii[t+1];ii[t+1]=ii[t+2];ii[t+2]=s;} geo.computeVertexNormals(); }
      g.add(new THREE.Mesh(geo,mat));
    }
  }
  return g;
}
const hullShell=buildHull();   // rungon kuori (osumatesti reiän teolle)
boat.add(hullShell);
// ---- Vaihe 1e: kansiviivan reunalista (D-kumi 100x100 kansiviivan alla) ja keulan törmäyskumi (osa 61, KV 11) ----
(function rubber(){
  const RB=LIVERY.rubber, HR=LIVERY.rubberHeight, PJ=LIVERY.rubberProj, NPH=14;
  const rubMat=std(RB,{roughness:0.9,metalness:0.0,side:THREE.DoubleSide});
  const skinY=(i,z)=>{ const p=ST[i].pts; for(let k=p.length-1;k>0;k--){ if(z<=p[k][1]+1e-9 && z>=p[k-1][1]-1e-9){ const dz=p[k][1]-p[k-1][1]; const t=Math.abs(dz)<1e-9?0:(z-p[k-1][1])/dz; return p[k-1][0]+(p[k][0]-p[k-1][0])*t; } } return p[p.length-1][0]; };
  const zS=i=>ST[i].pts[ST[i].pts.length-1][1];
  const PH=[]; for(let k=0;k<=NPH;k++) PH.push(Math.PI*k/NPH);
  const zOf=(i,ph)=>zS(i)-HR/2*(1-Math.cos(ph));
  const oOf=ph=>PJ*Math.sin(ph);
  const m=new Mesh3();
  for(const sg of [1,-1]){
    // rengas: rows[r][k] = piste, r = asema (siirtymä peräpeilistä, kulma, asemat), k = profiilin kulma
    const base=[]; for(let i=0;i<NS;i++) base.push(PH.map(ph=>[ST[i].x,skinY(i,zOf(i,ph))]));
    const nrm=(i,k)=>{ const a=base[Math.max(0,i-1)][k], b=base[Math.min(NS-1,i+1)][k]; let tx=b[0]-a[0], ty=b[1]-a[1]; const l=Math.hypot(tx,ty)||1; tx/=l; ty/=l; return [-ty,tx]; };
    const rows=[];
    const h0=HULL.well.polygon_sb[0][1];                     // kaukalon aukon reuna peräpeilissä
    const n0=PH.map((ph,k)=>nrm(0,k));
    // peräpeilin osuus y = h0 ... kulma, normaali -x
    rows.push({r:PH.map(ph=>V3(-oOf(ph), sg*h0, zOf(0,ph)))});
    rows.push({r:PH.map((ph,k)=>V3(-oOf(ph), sg*base[0][k][1], zOf(0,ph)))});
    // kulman pyöristys: normaali kääntyy -x:stä sivun normaaliin
    for(let s=1;s<=5;s++){ const t=s/6; rows.push({r:PH.map((ph,k)=>{ const o=oOf(ph); const ang0=Math.PI; let d=Math.atan2(n0[k][1],n0[k][0])-ang0; while(d>Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI; const ang=ang0+d*t; return V3(Math.cos(ang)*o, sg*(base[0][k][1]+Math.sin(ang)*o), zOf(0,ph)); })}); }
    for(let i=0;i<NS;i++){ rows.push({r:PH.map((ph,k)=>{ const o=oOf(ph); const n=nrm(i,k); return V3(base[i][k][0]+n[0]*o, sg*(base[i][k][1]+n[1]*o), zOf(i,ph)); })}); }
    const centre=r=>{ const c=new THREE.Vector3(); for(const v of r) c.add(v); return c.multiplyScalar(1/r.length); };
    for(let a=0;a<rows.length-1;a++){
      const A=rows[a].r, B=rows[a+1].r, cA=centre(A), cB=centre(B);
      for(let k=0;k<PH.length-1;k++){
        const mid=A[k].clone().add(A[k+1]).add(B[k]).add(B[k+1]).multiplyScalar(0.25);
        const c=cA.clone().add(cB).multiplyScalar(0.5);
        m.quad(A[k],B[k],B[k+1],A[k+1],mid.sub(c));
      }
    }
    // päätykuori peräpeilin aukon kohdalla ja keulan kärjessä: suljetaan viuhkalla
    for(const row of [rows[0].r,rows[rows.length-1].r]){
      const c=centre(row); for(let k=0;k<PH.length-1;k++) m.tri(c,row[k],row[k+1],null);
    }
  }
  addMesh(boat,m.geom(),rubMat);
  // punainen raita peräpeilissä reunalistan alla (rungon kyljissä raita tulee varjostimesta)
  (function transomStripe(){
    const mm=new Mesh3(); const zs=zS(0), p=ST[0].pts, h0=HULL.well.polygon_sb[0][1];
    const z0=zs-HR, z1=zs-LIVERY.stripeHeight;
    const yAt=z=>skinY(0,z);
    for(const sg of [1,-1]){ const A=V3(-0.0008,sg*h0,z0),B=V3(-0.0008,sg*yAt(z0),z0),C=V3(-0.0008,sg*yAt(z1),z1),D=V3(-0.0008,sg*h0,z1); mm.quad(A,B,C,D,new THREE.Vector3(-1,0,0)); }
    addMesh(boat,mm.geom(),std(LIVERY.stripe,{roughness:0.55,side:THREE.DoubleSide}));
  })();
  // ---- törmäyskumi (KV 11, osa 61): D-kumi 100x100 keulan kölilinjaa pitkin, tausta alumiinilevy 210 leveä ----
  (function stemBumper(){
    const ZB=LIVERY.stemZ0, ZT=LIVERY.stemZ1, W=0.052, PRJ=0.05;
    const pts=[]; let x=ST[0].x;
    const keel=xx=>stationAt(xx)[0][1];
    // tiheä polku x-akselilla: 0,04 m välein
    for(let xx=9.8; xx<=12.0; xx+=0.04){ const z=keel(xx); if(z>=ZB && z<=ZT) pts.push([xx,z]); }
    pts.push([12.0,Math.min(ZT,keel(12.0))]);
    const mr=new Mesh3(), mp=new Mesh3();
    const nth=10;
    const rows=[], prow=[];
    for(let i=0;i<pts.length;i++){
      const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
      let tx=b[0]-a[0], tz=b[1]-a[1]; const l=Math.hypot(tx,tz); tx/=l; tz/=l; const nx=tz, nz=-tx;   // ulospäin (eteen/alas)
      const r=[]; for(let k=0;k<=nth;k++){ const th=Math.PI*k/nth; r.push(V3(pts[i][0]+nx*PRJ*Math.sin(th), W*Math.cos(th), pts[i][1]+nz*PRJ*Math.sin(th))); }
      rows.push({r,c:V3(pts[i][0],0,pts[i][1])});
      // levy: sivusuunnassa 0,105 m kyljellä, 0,008 ulos
      const st=stationAt(pts[i][0]); const p0=st[0], p1=st[1]; const dl=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]); const f=0.105/dl;
      const q=[p0[0]+(p1[0]-p0[0])*f, p0[1]+(p1[1]-p0[1])*f];
      prow.push({a:V3(pts[i][0]+nx*0.006,0,pts[i][1]+nz*0.006), b:V3(pts[i][0]+nx*0.006,q[0],q[1]+nz*0.006), c:V3(pts[i][0]+nx*0.006,-q[0],q[1]+nz*0.006)});
    }
    for(let i=0;i<rows.length-1;i++){ const A=rows[i].r,B=rows[i+1].r; for(let k=0;k<nth;k++){ const mid=A[k].clone().add(A[k+1]).add(B[k]).add(B[k+1]).multiplyScalar(0.25); mr.quad(A[k],B[k],B[k+1],A[k+1],mid.sub(rows[i].c)); } }
    for(const r of [rows[0],rows[rows.length-1]]){ for(let k=0;k<nth;k++) mr.tri(r.c,r.r[k],r.r[k+1],null); }
    for(let i=0;i<prow.length-1;i++){ const A=prow[i],B=prow[i+1]; for(const s of ['b','c']){ mp.quad(A.a,B.a,B[s],A[s],null); } }
    addMesh(boat,mr.geom(),std(LIVERY.rubber,{roughness:0.9,side:THREE.DoubleSide}));
    addMesh(boat,mp.geom(),std('#9aa0a6',{roughness:0.5,metalness:0.4,side:THREE.DoubleSide}));
  })();
})();


// Peräpeilin levy (x=0): suljettu monikulmio, jossa syvennyksen aukko perään
(function transomPlate(){
  const w=HULL.well, p=ST[0].pts;
  const poly=[]; for(const q of p) poly.push([q[0],q[1]]);     // SB: köli -> kansiviiva
  const contour=[];
  for(const q of p) contour.push([q[0],q[1]]);
  const ys=p[7][0], zs=p[7][1];
  const h0=w.polygon_sb[0][1];
  contour.push([h0,zs],[h0,w.z],[-h0,w.z],[-h0,zs]);
  for(let k=p.length-1;k>=0;k--) contour.push([-p[k][0],p[k][1]]);
  const c2=contour.map(q=>new THREE.Vector2(q[0],q[1]));
  const tris=THREE.ShapeUtils.triangulateShape(c2,[]);
  const m=new Mesh3();
  for(const t of tris) m.tri(V3(0,contour[t[0]][0],contour[t[0]][1]),V3(0,contour[t[1]][0],contour[t[1]][1]),V3(0,contour[t[2]][0],contour[t[2]][1]),new THREE.Vector3(-1,0,0));
  addMesh(boat,m.geom(),std(LIVERY.hull,{side:THREE.DoubleSide}));
  // raita peräpeilissäkin
})();

// ---------------------------------------------------------------------------------------------
// Kansi, peräkannen syvennys, uimataso
// ---------------------------------------------------------------------------------------------
const deckM=new Mesh3(), padM=new Mesh3();
const WELL=HULL.well;
function deckStrip(x0,x1,ylo,yhi,color,dzUp,target,inset,step){        // kansipalkki x0..x1, y-väli (yhi=null -> reunaan), ylo voi olla funktio x:stä
  const n=Math.max(1,Math.ceil((x1-x0)/(step||0.25)));
  const yl=(typeof ylo==='function')?ylo:(()=>ylo);
  for(let i=0;i<n;i++){
    const xa=x0+(x1-x0)*i/n, xb=x0+(x1-x0)*(i+1)/n;
    for(const side of [1,-1]){
      const ha=hDeck(xa)-(inset||0), hb=hDeck(xb)-(inset||0);
      const ya0=yl(xa), yb0=yl(xb), ya1=(yhi==null?ha:Math.min(yhi,ha)), yb1=(yhi==null?hb:Math.min(yhi,hb));
      const za=zDeck(xa)+dzUp, zb=zDeck(xb)+dzUp;
      const A=V3(xa,side*ya0,za),B=V3(xb,side*yb0,zb),C=V3(xb,side*yb1,zb),D=V3(xa,side*ya1,za);
      target.quad(A,B,C,D,new THREE.Vector3(0,1,0));
    }
  }
}
// ---- Vaihe 1d: apufunktiot ----
const D1=HULL.superstructure.d1d;
const metalMat=std('#d9dde0',{roughness:0.3,metalness:0.55});
const trayMat=std('#9a9ea3',{roughness:0.5,metalness:0.3});
function polyFace(poly,zf,mat,upHint){            // vaakasuora monikulmio, zf([x,y]) -> z
  const m=new Mesh3(); const c2=poly.map(q=>new THREE.Vector2(q[0],q[1]));
  for(const t of THREE.ShapeUtils.triangulateShape(c2.slice(),[])){
    const A=poly[t[0]],B=poly[t[1]],C=poly[t[2]];
    m.tri(V3(A[0],A[1],zf(A)),V3(B[0],B[1],zf(B)),V3(C[0],C[1],zf(C)),new THREE.Vector3(0,upHint===false?-1:1,0));
  }
  return addMesh(boat,m.geom(),mat);
}
function polyFaceHole(outer,hole,z,mat,up){        // vaakasuora monikulmio reiällä
  const m=new Mesh3(); const all=outer.concat(hole);
  const tris=THREE.ShapeUtils.triangulateShape(outer.map(q=>new THREE.Vector2(q[0],q[1])),[hole.map(q=>new THREE.Vector2(q[0],q[1]))]);
  for(const t of tris) m.tri(V3(all[t[0]][0],all[t[0]][1],z),V3(all[t[1]][0],all[t[1]][1],z),V3(all[t[2]][0],all[t[2]][1],z),new THREE.Vector3(0,up===false?-1:1,0));
  return addMesh(boat,m.geom(),mat);
}
function band(pa,za,pb,zb,mat){                    // seinäkaista kahden saman pistemäärän monikulmion välillä
  const m=new Mesh3(), n=pa.length; let cx=0,cy=0; for(const p of pa){cx+=p[0];cy+=p[1];} cx/=n; cy/=n;
  for(let i=0;i<n;i++){ const j=(i+1)%n;
    m.quad(V3(pa[i][0],pa[i][1],za),V3(pa[j][0],pa[j][1],za),V3(pb[j][0],pb[j][1],zb),V3(pb[i][0],pb[i][1],zb),
      new THREE.Vector3((pa[i][0]+pa[j][0])/2-cx,0,(pa[i][1]+pa[j][1])/2-cy)); }
  return addMesh(boat,m.geom(),mat);
}
function outline3(pts,color,closed){                // ohut viiva (saumat)
  const g=new THREE.BufferGeometry().setFromPoints(pts.map(p=>V3(p[0],p[1],p[2])));
  const l=closed?new THREE.LineLoop(g,new THREE.LineBasicMaterial({color:col(color)})):new THREE.Line(g,new THREE.LineBasicMaterial({color:col(color)}));
  boat.add(l); return l;
}
function stadium(hu,hv,r,n){                         // pitkä pyöristetty monikulmio, u = x-suunta (puolileveys hu), v = y-suunta (puolipituus hv), päätyjen pystysuuntainen säde r
  const pts=[]; const c=hv-r;
  for(let i=0;i<=n;i++){const a=Math.PI*i/n; pts.push([hu*Math.cos(a), c+r*Math.sin(a)]);}
  for(let i=0;i<=n;i++){const a=Math.PI+Math.PI*i/n; pts.push([hu*Math.cos(a), -c+r*Math.sin(a)]);}
  return pts;
}
function rrect(x0,x1,y0,y1,r,n){
  const pts=[]; const cs=[[x1-r,y1-r,0],[x0+r,y1-r,Math.PI/2],[x0+r,y0+r,Math.PI],[x1-r,y0+r,1.5*Math.PI]];
  for(const [cx,cy,a0] of cs) for(let i=0;i<=n;i++){const a=a0+Math.PI/2*i/n; pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
  return pts;
}
// ---- peräkannen kaukalo (V-muotoinen), kansi ja uimataso ----
const TR=D1.trough, TRF=TR.floor_z, XD=TR.deck_x_end, XB=TR.box_x_end;
const TCs=TR.contour_sb;
const TCfull=TCs.map(p=>[p[0],p[1]]); for(let i=TCs.length-2;i>=0;i--) TCfull.push([TCs[i][0],-TCs[i][1]]);
const TCd=TCfull.map(p=>[p[0],p[1]]);                  // kannen reunaviiva = kaukalon ääriviiva (laatikon seinän yläosa osuu tähän viivaan kansitasolla)
function deckPoly(inset,dz,target){
  const xs=[0,0.4,0.8,XD], outer=[];
  for(const x of xs) outer.push([x,-(hDeck(x)-inset)]);
  for(let i=xs.length-1;i>=0;i--) outer.push([xs[i],hDeck(xs[i])-inset]);
  for(const p of TCd) outer.push(p);
  const c2=outer.map(q=>new THREE.Vector2(q[0],q[1]));
  for(const t of THREE.ShapeUtils.triangulateShape(c2.slice(),[])){
    const A=outer[t[0]],B=outer[t[1]],C=outer[t[2]];
    target.tri(V3(A[0],A[1],zDeck(A[0])+dz),V3(B[0],B[1],zDeck(B[0])+dz),V3(C[0],C[1],zDeck(C[0])+dz),new THREE.Vector3(0,1,0));
  }
}
deckPoly(0,0,deckM);
deckStrip(XD,HULL.stations[NS-1].x,0,null,null,0,deckM);
deckPoly(0.28,0.004,padM);
deckStrip(XD,HULL.superstructure.wheelhouse.x0-0.05,0,null,null,0.004,padM,0.28);
addMesh(boat,deckM.geom(),std(LIVERY.deckEdge,{roughness:0.8,side:THREE.DoubleSide}));
addMesh(boat,padM.geom(),std(LIVERY.aftDeck,{roughness:0.9,side:THREE.DoubleSide}));
(function trough(){
  const wallMat=std(LIVERY.deckEdge,{roughness:0.8,side:THREE.DoubleSide});
  polyFace(TCfull,()=>TRF,std(LIVERY.aftDeck,{roughness:0.9,side:THREE.DoubleSide}));
  // porras- ja otsaseinät (x > laatikon pää): pysty seinä pohjasta kanteen
  const m=new Mesh3();
  for(const sg of [1,-1]) for(let i=1;i<TCs.length-1;i++){
    const a=TCs[i],b=TCs[i+1];
    m.quad(V3(a[0],sg*a[1],TRF),V3(b[0],sg*b[1],TRF),V3(b[0],sg*b[1],zDeck(b[0])),V3(a[0],sg*a[1],zDeck(a[0])),null);
  }
  addMesh(boat,m.geom(),wallMat);
})();
// uimataso
(function swim(){
  const sp=HULL.superstructure.swim_platform;
  const poly=[[sp.x0,-sp.half_at_x0],[sp.x1,-sp.half_at_x1],[sp.x1,sp.half_at_x1],[sp.x0,sp.half_at_x0]];
  addMesh(boat,prism(poly,sp.z_top-sp.thickness,sp.z_top,0,{}),std(LIVERY.swim,{roughness:0.85,side:THREE.DoubleSide}));
})();

// ---------------------------------------------------------------------------------------------
// Päällysrakenne: ohjaamo (ikkunat erillisinä), kajuutan katto, puomi, masto
// ---------------------------------------------------------------------------------------------
const SUP=HULL.superstructure, WH=SUP.wheelhouse;
const superMat=std(LIVERY.superstructure,{roughness:0.55,side:THREE.DoubleSide});
const glassMat=new THREE.MeshStandardMaterial({color:col(LIVERY.glass),roughness:0.12,metalness:0.6,side:THREE.DoubleSide});
const frameMat=std(LIVERY.glassFrame,{roughness:0.6,side:THREE.DoubleSide});
function mirrorPoly(sb){ // SB-puolikas -> koko monikulmio BB:n kautta
  const bb=sb.map(p=>[p[0],-p[1]]).reverse();
  return sb.concat(bb);
}
const zFloorWH=WH.floor_z;
// ohjaamo: alaosa (kansi -> ikkunalista) pystyseinillä, ikkunavyöhyke loftattuna (seinät kallistuvat ulospäin), katto
function paneAt(corners,m,mats){        // ikkunaruutu: tumma lasi + karmi, corners = 4 pistettä [x,y,z] (malli)
  const c=corners.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4,a[2]+p[2]/4],[0,0,0]);
  const k=0.915;
  const sh=corners.map(p=>[c[0]+(p[0]-c[0])*k,c[1]+(p[1]-c[1])*k,c[2]+(p[2]-c[2])*k]);
  const A=V3(...corners[0]),B=V3(...corners[1]),C=V3(...corners[2]);
  let n=new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).normalize();
  const out=new THREE.Vector3(c[0]-5.6,0,c[1]);            // ulospäin ohjaamon keskipisteestä (three-koordinaatit)
  if(n.dot(out)<0) n.negate();
  const off=(P,d)=>V3(P[0],P[1],P[2]).addScaledVector(n,d);
  m.frame.quad(off(corners[0],0.010),off(corners[1],0.010),off(corners[2],0.010),off(corners[3],0.010),n);
  m.glass.quad(off(sh[0],0.015),off(sh[1],0.015),off(sh[2],0.015),off(sh[3],0.015),n);
}

// Sisätilaversio (simulaattori): ohjaamon alaseinät ilman umpinaista tasoa, ikkunat auki (vain karmit), lattia ja ohjauspöytä
function INTERIOR_WH(){
  const sill=WH.plan_sill_sb, roof=WH.plan_roof_sb, sillP=mirrorPoly(sill), roofP=mirrorPoly(roof), nb=sillP.length;
  const zA=WH.sill_z, zB=WH.window_top_z, zF=zFloorWH;
  const lw=new Mesh3();
  for(let i=0;i<nb;i++){ const a=sillP[i], b=sillP[(i+1)%nb];
    lw.quad(V3(a[0],a[1],zF),V3(b[0],b[1],zF),V3(b[0],b[1],zA),V3(a[0],a[1],zA),null); }
  const tris=THREE.ShapeUtils.triangulateShape(sillP.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  const fl=new Mesh3();
  for(const t of tris){ const a=sillP[t[0]],b=sillP[t[1]],c=sillP[t[2]]; fl.tri(V3(a[0],a[1],zF+0.01),V3(b[0],b[1],zF+0.01),V3(c[0],c[1],zF+0.01),new THREE.Vector3(0,1,0)); }
  addMesh(boat,lw.geom(),superMat);
  addMesh(boat,fl.geom(),std('#3a3d41',{roughness:0.9,side:THREE.DoubleSide}));
  // ikkunavyöhykkeen seinät vain ikkunoiden välissä (pilarit) ja takaseinä
  const wm=new Mesh3(), fm=new Mesh3();
  const lerpEdge=(P,Q,x)=>{const t=(x-P[0])/(Q[0]-P[0]);return [x,P[1]+(Q[1]-P[1])*t];};
  const sp=(x)=>lerpEdge(sill[0],sill[1],x), rp=(x)=>lerpEdge(roof[0],roof[1],x);
  const nrm=new THREE.Vector3(0,0,1);
  const frameAt=(q)=>{                                   // q = 4 pistettä [x,y,z], vain karmirengas
    const c=q.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4,a[2]+p[2]/4],[0,0,0]), k=0.93;
    const sh=q.map(p=>[c[0]+(p[0]-c[0])*k,c[1]+(p[1]-c[1])*k,c[2]+(p[2]-c[2])*k]);
    for(let i=0;i<4;i++){ const j=(i+1)%4; fm.quad(V3(...q[i]),V3(...q[j]),V3(...sh[j]),V3(...sh[i]),null); }
  };
  const pillar=(s,xb0,xb1,xt0,xt1)=>{ if(xb1-xb0<1e-3&&xt1-xt0<1e-3) return;
    const b0=sp(xb0),b1=sp(xb1),t1=rp(xt1),t0=rp(xt0);
    wm.quad(V3(b0[0],s*b0[1],zA),V3(b1[0],s*b1[1],zA),V3(t1[0],s*t1[1],zB),V3(t0[0],s*t0[1],zB),null); };
  for(const s of [1,-1]){
    const W=WH.side_windows;
    pillar(s,sill[0][0],W[0].bottom_x[0],roof[0][0],W[0].top_x[0]);
    for(let i=0;i<W.length;i++){
      const w=W[i], b0=sp(w.bottom_x[0]),b1=sp(w.bottom_x[1]),t1=rp(w.top_x[1]),t0=rp(w.top_x[0]);
      frameAt([[b0[0],s*b0[1],zA],[b1[0],s*b1[1],zA],[t1[0],s*t1[1],zB],[t0[0],s*t0[1],zB]]);
      if(i<W.length-1) pillar(s,w.bottom_x[1],W[i+1].bottom_x[0],w.top_x[1],W[i+1].top_x[0]);
    }
    const wl=W[W.length-1]; pillar(s,wl.bottom_x[1],sill[1][0],wl.top_x[1],roof[1][0]);
    frameAt([[sill[1][0],s*sill[1][1],zA],[sill[2][0],s*sill[2][1],zA],[roof[2][0],s*roof[2][1],zB],[roof[1][0],s*roof[1][1],zB]]);
  }
  frameAt([[sill[2][0],-sill[2][1],zA],[sill[2][0],sill[2][1],zA],[roof[2][0],roof[2][1],zB],[roof[2][0],-roof[2][1],zB]]);
  // takaseinä
  const ra=sillP[nb-1], rb=sillP[0], qa=roofP[nb-1], qb=roofP[0];
  wm.quad(V3(ra[0],ra[1],zA),V3(rb[0],rb[1],zA),V3(qb[0],qb[1],zB),V3(qa[0],qa[1],zB),null);
  addMesh(boat,wm.geom(),superMat);
  addMesh(boat,fm.geom(),frameMat);
  addMesh(boat,prism(roofP,zB,WH.roof_z,0,{}),superMat);                            // katto
  // ohjauspöytä ikkunalistan alla ja ruorin jalusta
  const dk=std('#2b2d30',{roughness:0.7,side:THREE.DoubleSide});
  box(boat,6.55,7.12,-1.05,1.05,zA-0.55,zA-0.015,'#2b2d30',{roughness:0.7});
  box(boat,6.62,7.05,-0.55,0.55,zA-0.015,zA+0.035,'#1b1d20',{roughness:0.6});
}
(OPTS.interior ? INTERIOR_WH : function wheelhouse(){
  const sill=WH.plan_sill_sb, roof=WH.plan_roof_sb;
  const sillP=mirrorPoly(sill), roofP=mirrorPoly(roof);
  const nb=sillP.length;
  addMesh(boat,prism(sillP,zFloorWH,WH.sill_z,0,{}),superMat);                    // alaseinät
  const m=new Mesh3(); const zA=WH.sill_z, zB=WH.window_top_z;
  const Cc=V3(5.6,0,(zA+zB)/2);
  for(let i=0;i<nb;i++){
    const a=sillP[i],b=sillP[(i+1)%nb],c=roofP[(i+1)%nb],d=roofP[i];
    const A=V3(a[0],a[1],zA),B=V3(b[0],b[1],zA),C=V3(c[0],c[1],zB),D=V3(d[0],d[1],zB);
    const mid=centerOf(A,B,C,D);
    m.quad(A,B,C,D,new THREE.Vector3(mid.x-Cc.x,0,mid.z-Cc.z));
  }
  addMesh(boat,m.geom(),superMat);                                                  // ikkunavyöhykkeen seinät
  addMesh(boat,prism(roofP,zB,WH.roof_z,0,{}),superMat);                            // katto
  // ikkunaruudut: sivuikkunat, kulmaruudut ja kolmiosainen tuulilasi, kukin oma tumma taso ja karmi
  const gm={frame:new Mesh3(),glass:new Mesh3()};
  const lerpEdge=(P,Q,x)=>{const t=(x-P[0])/(Q[0]-P[0]);return [x,P[1]+(Q[1]-P[1])*t];};
  const sp=(x)=>lerpEdge(sill[0],sill[1],x), rp=(x)=>lerpEdge(roof[0],roof[1],x);
  for(const s of [1,-1]){
    const Y=(p)=>[p[0],s*p[1]];
    for(const w of WH.side_windows){
      const b0=sp(w.bottom_x[0]),b1=sp(w.bottom_x[1]),t1=rp(w.top_x[1]),t0=rp(w.top_x[0]);
      const q=[[b0[0],s*b0[1],zA],[b1[0],s*b1[1],zA],[t1[0],s*t1[1],zB],[t0[0],s*t0[1],zB]];
      paneAt(q,gm);
    }
    // kulmaruutu (sivun ja keskiruudun välissä)
    paneAt([[sill[1][0],s*sill[1][1],zA],[sill[2][0],s*sill[2][1],zA],[roof[2][0],s*roof[2][1],zB],[roof[1][0],s*roof[1][1],zB]],gm);
  }
  // keskiruutu
  paneAt([[sill[2][0],-sill[2][1],zA],[sill[2][0],sill[2][1],zA],[roof[2][0],roof[2][1],zB],[roof[2][0],-roof[2][1],zB]],gm);
  addMesh(boat,gm.frame.geom(),frameMat);
  addMesh(boat,gm.glass.geom(),glassMat);
  // ohjaamon ovi takaseinällä keskilinjalla, ikkuna ovessa
  const d=WH.door, dm=new Mesh3();
  const xw=WH.x0-0.012, zd0=d.z0, zd1=d.z0+d.h;
  dm.quad(V3(xw,d.y-d.w/2,zd0),V3(xw,d.y+d.w/2,zd0),V3(xw,d.y+d.w/2,zd1),V3(xw,d.y-d.w/2,zd1),new THREE.Vector3(-1,0,0));
  addMesh(boat,dm.geom(),std('#2b2e33',{roughness:0.5,metalness:0.2,side:THREE.DoubleSide}));
  const wm=new Mesh3(), hw=d.window_half;
  wm.quad(V3(xw-0.004,d.y-hw,d.window_z0),V3(xw-0.004,d.y+hw,d.window_z0),V3(xw-0.004,d.y+hw,d.window_z1),V3(xw-0.004,d.y-hw,d.window_z1),new THREE.Vector3(-1,0,0));
  addMesh(boat,wm.geom(),glassMat);
  for(const [y0,y1,z0,z1] of [[d.y-d.w/2-0.05,d.y-d.w/2,zd0-0.05,zd1+0.05],[d.y+d.w/2,d.y+d.w/2+0.05,zd0-0.05,zd1+0.05],[d.y-d.w/2,d.y+d.w/2,zd1,zd1+0.05],[d.y-d.w/2,d.y+d.w/2,zd0-0.05,zd0]])
    box(boat,xw-0.03,xw,y0,y1,z0,z1,LIVERY.glassFrame);
  box(boat,xw-0.05,xw-0.01,d.y+d.w/2-0.12,d.y+d.w/2-0.06,(zd0+zd1)/2-0.05,(zd0+zd1)/2+0.05,LIVERY.hatchFrame);   // kahva
})();

// SAR-teksti ohjaamon kylkiin (alaseinä)
(function sarText(){
  const S=WH.sar, cw=1280, ch=Math.round(cw*S.h/(S.x1-S.x0));
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
  const g=cv.getContext('2d'); g.clearRect(0,0,cw,ch);
  g.fillStyle=LIVERY.text; g.textAlign='center'; g.textBaseline='middle';
  let fs=ch*1.1; g.font='bold '+fs+'px Arial,Helvetica,sans-serif';
  const tw=g.measureText('SAR').width; if(tw>cw*0.96){fs*=cw*0.96/tw; g.font='bold '+fs+'px Arial,Helvetica,sans-serif';}
  g.fillText('SAR',cw/2,ch*0.54);
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4;
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  const a=WH.plan_sill_sb[0], b=WH.plan_sill_sb[1];
  const xm=(S.x0+S.x1)/2, ym=a[1]+(b[1]-a[1])*((xm-a[0])/(b[0]-a[0]));
  for(const s of [1,-1]){
    const pl=new THREE.Mesh(new THREE.PlaneGeometry(S.x1-S.x0,S.h),mat);
    pl.position.set(xm,S.zc,s*(ym+0.014));
    if(s<0) pl.rotation.y=Math.PI;
    boat.add(pl);
  }
})();

// ---- Vaihe 1d: kajuutan katon kohouma (KV 15 kansikuvanto, YJ sivukuvanto), luukut, käsijohde, täyttölaipat ja askelmat ----
const TK=D1.trunk;
const zrTrunk=x=>TK.roof_z0-TK.roof_slope*(x-TK.roof_x0);
const ybTrunk=x=>{const P=TK.base_sb; for(let i=0;i<P.length-1;i++){ if(x<=P[i+1][0]||i===P.length-2){const t=(x-P[i][0])/(P[i+1][0]-P[i][0]); return P[i][1]+(P[i+1][1]-P[i][1])*t;} } };
const zFrontTrunk=x=>{ const z1=zsTrunk(TK.roof_x_front), z0=zDeck(TK.front_x); return z1+(z0-z1)*Math.min(1,Math.max(0,(x-TK.roof_x_front)/(TK.front_x-TK.roof_x_front))); };
const DZS=0.06;                                           // katon keskikaistan korotus seinän yläreunasta (arvio, YJ sivukuvanto: käsijohde 0,075 yläreunan yläpuolella)
const zsTrunk=x=>zrTrunk(x)+DZS;                          // keskikaistan (|y| < 0,36) yläpinta
const ytTrunk=x=>0.958-0.1856*(x-7.0);                    // seinän yläreunan y (KV 15/YJ kansikuvanto: käsijohdon linja, YJ keulakuvanto y 0,96 perässä ja 0,49 keulassa)
const wallZ=(x,ya)=>{ const yb=ybTrunk(x), yt=ytTrunk(x), zt=zrTrunk(x), zd=zDeck(x);
  if(ya>=yt){ const t=Math.max(0,Math.min(1,(yb-ya)/(yb-yt))); return zd+t*(zt-zd); }
  const t=Math.max(0,Math.min(1,(yt-ya)/(yt-TK.roof_half))); return zt+t*DZS; };
const wallK=(x,ya)=>{ const yb=ybTrunk(x), yt=ytTrunk(x); return ya>=yt?(zrTrunk(x)-zDeck(x))/(yb-yt):DZS/(yt-TK.roof_half); };
var CABIN_TOP=zrTrunk;
(function trunk(){
  // Käyttäjän palaute 26.10.2026: kajuutan seinät ovat valkoiset, katto mattamusta. Seinät ja kattopinnat eri verkkoihin.
  const m=new Mesh3(), mk=new Mesh3(), P=TK.base_sb, h=TK.roof_half, x0=P[0][0], xt=9.50, xf=TK.roof_x_front;
  // Vaihe 1e: kohouma kolmiosaisena: kalteva sivuseinä (alareuna kansi, yläreuna käsijohdon linjalla), loiva kattotaso (seinän yläreunasta keskikaistaan) ja keskikaista
  const Tz=x=>zrTrunk(x), Sz=x=>zsTrunk(x);
  for(const s of [1,-1]){
    const B0=V3(x0,s*P[0][1],zDeck(x0)), B1=V3(P[1][0],s*P[1][1],zDeck(P[1][0])), B2=V3(P[2][0],s*P[2][1],zDeck(P[2][0]));
    const T0=V3(x0,s*ytTrunk(x0),Tz(x0)), T1=V3(xt,s*ytTrunk(xt),Tz(xt));
    const S0=V3(x0,s*h,Sz(x0)), S1=V3(xf,s*h,Sz(xf));
    const out=new THREE.Vector3(0,0.4,s);
    const NX=14;
    for(let i=0;i<NX;i++){ const xa=x0+(xt-x0)*i/NX, xb=x0+(xt-x0)*(i+1)/NX;
      const Ba=V3(xa,s*ybTrunk(xa),zDeck(xa)),Bb=V3(xb,s*ybTrunk(xb),zDeck(xb)),Ta=V3(xa,s*ytTrunk(xa),Tz(xa)),Tb=V3(xb,s*ytTrunk(xb),Tz(xb)),Sa=V3(xa,s*h,Sz(xa)),Sb=V3(xb,s*h,Sz(xb));
      m.quadF(Ba,Bb,Tb,Ta,out);                      // sivuseinä (valkoinen)
      mk.quadF(Ta,Tb,Sb,Sa,new THREE.Vector3(0,1,0)); }  // loiva kattotaso (mattamusta)
    m.quad(B1,B2,S1,T1,new THREE.Vector3(0.5,0.4,s)); // etusivun viisto seinä (valkoinen)
    { const Sx=V3(xt,s*h,Sz(xt)); mk.quad(T1,Sx,S1,V3(xf,s*ytTrunk(xf),Tz(xf)),new THREE.Vector3(0,1,0)); mk.tri(Sx,S1,V3(xf,s*h,Sz(xf)),new THREE.Vector3(0,1,0)); }
  }
  const a0=V3(x0,h,Sz(x0)), b0=V3(x0,-h,Sz(x0)), a1=V3(xf,h,Sz(xf)), b1=V3(xf,-h,Sz(xf));
  mk.quad(a0,a1,b1,b0,new THREE.Vector3(0,1,0));         // keskikaista (mattamusta)
  const f1=V3(TK.front_x,P[2][1],zDeck(TK.front_x)), f2=V3(TK.front_x,-P[2][1],zDeck(TK.front_x));
  m.quad(a1,f1,f2,b1,new THREE.Vector3(1,0.5,0));        // keulan 45 asteen viisto (valkoinen etuseinä)
  addMesh(boat,m.geom(),std(LIVERY.cabinet,{roughness:0.55,side:THREE.DoubleSide}));
  addMesh(boat,mk.geom(),std('#141516',{roughness:0.95,metalness:0,side:THREE.DoubleSide}));
  // sivuseinän ikkuna molemmin puolin: pyöristetty suorakulmio 0,353 x 0,168 m, keskipiste x 7,44 z 2,306 (YJ sivukuvanto)
  const wy=(x,z,s)=>{ const yb=ybTrunk(x), yt=ytTrunk(x), zt=Tz(x), zd=zDeck(x); const t=(z-zd)/(zt-zd); return s*(yb-t*(yb-yt)); };
  const fmat=std('#2b2d30',{roughness:0.6,side:THREE.DoubleSide}), gmat=std('#08090b',{roughness:0.15,side:THREE.DoubleSide});
  for(const s of [1,-1]){
    for(const [hw,hh,r,col,lift] of [[0.1765,0.084,0.05,fmat,0.004],[0.15,0.062,0.035,gmat,0.006]]){
      const poly=rrect(7.44-hw,7.44+hw,2.306-hh,2.306+hh,r,5);
      const q=poly.map(p=>{ const y=wy(p[0],p[1],s); return V3(p[0],y+s*lift,p[1]); });
      const c=q.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/q.length), mm=new Mesh3();
      for(let i=0;i<q.length;i++) mm.tri(c,q[i],q[(i+1)%q.length],null);
      addMesh(boat,mm.geom(),col);
    }
  }
})();
(function trunkFittings(){
  const dark=std('#2b2d30',{roughness:0.7,side:THREE.DoubleSide}), met=metalMat, frame=std(LIVERY.hatchFrame,{roughness:0.5,side:THREE.DoubleSide});
  const slope=Math.atan(TK.roof_slope);
  // pyöreä luukku: kehys kattopinnan mukaan kallistettuna
  const H=TK.round_hatch, g=new THREE.Group(); g.position.set(H.x,zsTrunk(H.x),0); g.rotation.z=-slope; boat.add(g);
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); g.add(m); return m;};
  const flat=(r0,r1,y,mat)=>{const m=new THREE.Mesh(new THREE.RingGeometry(r0,r1,56),mat); m.rotation.x=-Math.PI/2; m.position.y=y; g.add(m); return m;};
  // pelastusrengas telineessään kajuutan katolla (YJ: halkaisija 0,75, putki noin 0,1), kaksi kapeaa pidikehihnaa
  const RR=0.325, RT=0.05, ringZ=0.03+RT;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(RR,RT,14,48),std('#f1f1ec',{roughness:0.6})); ring.rotation.x=Math.PI/2; ring.position.set(0,ringZ,0); g.add(ring);
  const strapM=std('#2b2d30',{roughness:0.8,side:THREE.DoubleSide}), blk=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),strapM); m.position.set(x,y,z); g.add(m);};
  for(const sz of [1,-1]){
    blk(0.04,0.012,0.17,0,ringZ+RT+0.006,sz*RR);                       // hihna renkaan putken yli
    for(const e of [-1,1]) blk(0.04,ringZ+RT,0.012,0,(ringZ+RT)/2,sz*(RR+e*0.085));   // hihnan jalat kattoon
  }
  // suorakulmainen luukku: matala mattamusta kansi kajuutan katolla, ei vaaleaa kehystä (käyttäjän palaute 26.10.2026)
  const R=TK.rect_block, HL=Math.min(R.h,0.06), poly=rrect(R.x0,R.x1,-R.half,R.half,R.r,6);
  addMesh(boat,prism(poly,zsTrunk(R.x1)-0.03,zsTrunk(R.x0)+HL,0,{zTop:x=>zsTrunk(x)+HL}),std('#141516',{roughness:0.95,metalness:0,side:THREE.DoubleSide}));   // matala musta luukku
  const pl=rrect(R.x0+0.012,R.x1-0.012,-R.half+0.012,R.half-0.012,R.r-0.012,6);
  
  const lx0=R.latch[0], lx1=R.latch[1], lw=R.latch[2], zl=zFrontTrunk((lx0+lx1)/2);
  box(boat,lx0,lx1,-lw,lw,zl,zl+0.03,LIVERY.hatchFrame);
  // käsijohde kaltevalla seinällä (molemmat laidat): putki seinän pinnan suuntaisesti, pystytuet ja päiden alaspäin taivutukset
  const HR=TK.handrail, off=0.05;
  for(const s of [1,-1]){
    const pa=[HR.a[0],s*HR.a[1],wallZ(HR.a[0],HR.a[1])+off], pb=[HR.b[0],s*HR.b[1],wallZ(HR.b[0],HR.b[1])+off];
    tubeM(boat,pa,pb,HR.r,met,8);
    for(const k of [0,0.25,0.5,0.75,1]){
      const x=pa[0]+(pb[0]-pa[0])*k, y=pa[1]+(pb[1]-pa[1])*k, z=pa[2]+(pb[2]-pa[2])*k;
      tubeM(boat,[x,y,z],[x,y,z-off],HR.r*0.7,met,6);
    }
  }
  // täyttölaipat (KV 15: ympyrälaippa 10 reiällä, kaltevan seinän pinnassa)
  for(const [x,y] of TK.fill_plates){
    const ya=Math.abs(y), sg=y<0?-1:1, z=wallZ(x,ya), k=wallK(x,ya);
    const n=new THREE.Vector3(0,1,sg*k).normalize();
    const d=new THREE.Mesh(new THREE.CylinderGeometry(TK.fill_r,TK.fill_r,0.014,28),frame);
    d.position.set(x,z,y); d.position.addScaledVector(n,0.007); d.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n); boat.add(d);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(TK.fill_r*0.55,TK.fill_r*0.55,0.02,20),met); cap.position.copy(d.position).addScaledVector(n,0.012); cap.quaternion.copy(d.quaternion); boat.add(cap);
    for(let i=0;i<10;i++){ const a=i/10*Math.PI*2, bb=new THREE.Mesh(new THREE.CylinderGeometry(0.0095,0.0095,0.01,8),met);
      const u=new THREE.Vector3(1,0,0), v=new THREE.Vector3().crossVectors(n,u).normalize();
      bb.position.copy(d.position).addScaledVector(n,0.009).addScaledVector(u,Math.cos(a)*TK.fill_r*0.82).addScaledVector(v,Math.sin(a)*TK.fill_r*0.82); bb.quaternion.copy(d.quaternion); boat.add(bb); }
  }
  // askelmalistat kohouman vierellä (KV 15: litteä pyöristetty tanko)
  const SB=TK.step_bars;
  for(const s of [1,-1]){
    const bb=new THREE.Mesh(new THREE.BoxGeometry(SB.len,SB.h,SB.w),std('#9a9ea3',{roughness:0.5,metalness:0.3}));
    bb.position.set(SB.x,zDeck(SB.x)+SB.h/2,s*SB.y); bb.rotation.y=s*SB.ang*Math.PI/180; boat.add(bb);
  }
})();



// ---- Vaihe 1d: masto piirustuksen mukaan (YJ sivu-, keula- ja peräkuvanto 600 dpi) ----
(function mast(){
  const mm=std(LIVERY.mast,{roughness:0.4,metalness:0.05,side:THREE.DoubleSide}), lt=std('#8f9397',{roughness:0.4,metalness:0.5}), dk=std('#1b1d20',{roughness:0.6});
  const lerp=(a,b,t)=>a+(b-a)*t;
  const pl=(pts,z)=>{ for(let i=0;i<pts.length-1;i++) if(z<=pts[i+1][0]||i===pts.length-2){const t=(z-pts[i][0])/(pts[i+1][0]-pts[i][0]); return lerp(pts[i][1],pts[i+1][1],t);} };
  const FR=[[3.72,4.335],[3.82,4.33],[4.23,4.28],[4.51,4.15],[5.12,3.853],[5.42,3.707]];          // tornin etureuna x(z)
  const RE=[[3.72,3.88],[3.86,3.83],[4.725,3.50],[4.876,3.491],[5.313,3.283],[5.42,3.23]];        // takareuna x(z)
  const hw=z=>z>=4.70?0.16:lerp(0.245,0.16,(z-3.80)/0.90)>0.245?0.245:lerp(0.245,0.16,(z-3.80)/0.90);
  const zs=[3.72,3.82,4.23,4.51,4.725,4.876,5.12,5.313,5.42];
  const m=new Mesh3();
  const ring=z=>{const xf=pl(FR,z), xr=pl(RE,z), h=hw(z); return [V3(xf,h,z),V3(xf,-h,z),V3(xr,-h,z),V3(xr,h,z)];};
  for(let i=0;i<zs.length-1;i++){
    const A=ring(zs[i]), B=ring(zs[i+1]);
    for(let k=0;k<4;k++){ const k2=(k+1)%4; m.quad(A[k],A[k2],B[k2],B[k],null); }
  }
  const top=ring(zs[zs.length-1]); m.quad(top[0],top[1],top[2],top[3],new THREE.Vector3(0,1,0));
  addMesh(boat,m.geom(),mm);
  // yläalusta (KV: x 3,18 ... 4,08, y +-0,16, yläpinta z 5,42)
  box(boat,3.18,4.08,-0.16,0.16,5.395,5.425,LIVERY.mast);
  // tutkakupu: litistetty soikio x 3,62 ... 4,29, y +-0,145, z 5,50 ... 5,60, jalusta
  box(boat,3.77,3.93,-0.10,0.10,5.425,5.50,LIVERY.mast);
  const rd=new THREE.Mesh(new THREE.SphereGeometry(1,28,14),std('#2a2d31',{roughness:0.35,metalness:0.25})); rd.scale.set(0.335,0.05,0.145); rd.position.set(3.955,5.55,0); boat.add(rd);
  // GPS-kupu platformin BB-reunalla
  tubeM(boat,[3.17,-0.29,5.425],[3.17,-0.29,5.50],0.012,lt,8);
  const gps=new THREE.Mesh(new THREE.SphereGeometry(0.045,14,10),dk); gps.scale.set(1,0.6,1); gps.position.set(3.17,5.515,-0.29); boat.add(gps);
  // valo- ja antennipylväs (x 3,51): putki, valolaatikko, kaksi antennitankoa ja tuulimittari
  tubeM(boat,[3.51,0,5.425],[3.51,0,5.73],0.03,lt,10);
  box(boat,3.46,3.56,-0.05,0.05,5.73,5.83,'#d9dde0',{roughness:0.5});
  tubeM(boat,[3.39,0,5.69],[3.39,0,6.02],0.008,lt,6); tubeM(boat,[3.43,0,5.69],[3.43,0,6.02],0.008,lt,6);
  box(boat,3.38,3.56,-0.03,0.03,5.685,5.695,LIVERY.mast);
  tubeM(boat,[3.41,-0.075,6.0],[3.41,0.075,6.0],0.006,lt,6);
  for(const s of [-1,1]){ const t=new THREE.Mesh(new THREE.TorusGeometry(0.02,0.006,6,14),lt); t.position.set(3.41,6.0,s*0.075); t.rotation.y=Math.PI/2; boat.add(t); }
  // siipitaso: z 4,78 ... 4,85, kärjet (3,50 ; +-1,00), pyyhkäisyvarsi leveys 0,12
  for(const s of [1,-1]){
    beam(boat,[3.93,s*0.16,4.815],[3.50,s*1.00,4.815],0.12,0.07,mm);
    tubeM(boat,[3.5,s*1.0,4.88],[3.50,s*0.98,5.32],0.010,lt,6);            // antennitanko kärjessä (YJ peräkuvanto z 4,88 ... 5,32)
    tubeM(boat,[3.5,s*1.0,4.88],[3.75,s*0.10,5.38],0.010,lt,6);            // ylävaijeri/tuki tornin ylälaitaan
    tubeM(boat,[3.5,s*1.0,4.75],[4.30,s*0.30,3.82],0.010,lt,6);            // alatuki kattoon
    // valonheitinrumpu: r 0,135, pituus 0,30, akseli x, keskipiste (3,90 ; +-0,69 ; 4,23)
    const dr=new THREE.Mesh(new THREE.CylinderGeometry(0.135,0.135,0.30,26),std('#9a9ea3',{roughness:0.4,metalness:0.5})); dr.rotation.z=Math.PI/2; dr.position.set(3.90,4.23,s*0.69); boat.add(dr);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(0.115,22),std('#e8eef2',{roughness:0.2,metalness:0.2,emissive:'#3a3a30'})); lens.rotation.y=Math.PI/2; lens.position.set(4.052,4.23,s*0.69); boat.add(lens);
    tubeM(boat,[3.90,s*0.69,3.80],[3.90,s*0.69,4.10],0.05,mm,10);          // jalusta
    // kattokupu (pohjalamppu) x 4,41, y +-0,37
    const bw=new THREE.Mesh(new THREE.SphereGeometry(0.065,14,8,0,Math.PI*2,0,Math.PI/2),std('#9a9ea3',{roughness:0.4,metalness:0.5,side:THREE.DoubleSide})); bw.position.set(4.41,3.78,s*0.37); boat.add(bw);
  }
  box(boat,3.82,3.98,-0.635,0.635,4.33,4.435,LIVERY.mast);                  // poikipalkki valonheittimien takana
})();


// roolilaatikoiden ja kaappien rakentaminen peräkannelle ja ohjaamon takakulmiin
(function aftDeckItems(){
  const A=SUP.aft_deck, cab=std(LIVERY.cabinet,{roughness:0.55}), lid=std(LIVERY.cabinetTop,{roughness:0.7});
  const zD=x=>zDeck(x);
  // laitapaneelit (MERIPELASTUS-kaapit)
  for(const s of [1,-1]) for(const [xa,xb] of A.side_panels.x_ranges){
    const yi=A.side_panels.y_in, yo=Math.min(hDeck((xa+xb)/2)-0.02,A.side_panels.y_out);
    const zb=zD(xa)-0.03, zt=A.side_panels.top_z;
    box(boat,xa,xb,s>0?yi:-yo,s>0?yo:-yi,zb,zt,LIVERY.cabinet,{roughness:0.55});
    box(boat,xa+0.01,xb-0.01,s>0?yi:-yo,s>0?yo:-yi,zt,zt+0.015,LIVERY.cabinetTop);
  }
  // pelastuslautta (SB, peräpeilin ulkopuolella)
  const L=A.liferaft; box(boat,L.x0,L.x1,L.y0,L.y1,L.z0,L.z1,LIVERY.cabinet,{roughness:0.5}); box(boat,L.x0,L.x1,L.y0,L.y1,L.z1,L.z1+0.02,LIVERY.cabinetTop);
  // konetilan laatikot ohjaamon takakulmissa (KV 6: 758 x 831 x 781 mm). SB: ilmanottosäleikkö alaosassa. BB: kaksi pyöreää aukkoa ja miesluukku kannessa
  const V=A.vent_box, zv=zD((V.x0+V.x1)/2), zt=zv+V.h;
  for(const s of [1,-1]){
    const ya=s>0?V.y0:-V.y1, yb=s>0?V.y1:-V.y0, yc=(ya+yb)/2;
    box(boat,V.x0,V.x1,ya,yb,zv,zt,LIVERY.cabinet,{roughness:0.55});
    box(boat,V.x0-0.02,V.x1+0.02,ya-0.02,yb+0.02,zt,zt+0.03,LIVERY.cabinetTop);
    const dark=std('#4a4e53',{roughness:0.8,side:THREE.DoubleSide});
    if(s>0){   // säleikkö: 4 riviä x 7 rakoa peräseinässä
      const m=new Mesh3(), x=V.x0-0.004;
      for(let r=0;r<4;r++) for(let c=0;c<7;c++){
        const z0=zv+0.07+r*0.075, z1=z0+0.03, y0=ya+0.10+c*0.088, y1=y0+0.065;
        m.quad(V3(x,y0,z0),V3(x,y1,z0),V3(x,y1,z1),V3(x,y0,z1),new THREE.Vector3(-1,0,0));
      }
      addMesh(boat,m.geom(),dark);
    } else {   // BB: kaksi pyöreää aukkoa
      for(const dy of [-0.2,0.2]){
        const cm=new THREE.Mesh(new THREE.CircleGeometry(0.135,28),dark);
        cm.rotation.y=-Math.PI/2; cm.position.set(V.x0-0.004,zv+0.42,yc+dy); boat.add(cm);
      }
    }
  }
})();

// ---- Vaihe 1d: peräkannen laatikot, kaukalon luukku, veto-pollari ja kaksoispollarit piirustusten mukaan ----
function bitt(cx,cy,z0,angDeg){      // kaksoispollari tarjottimella; kulma = tarjottimen pitkä akseli kansikuvannossa
  const C=D1.cleat, g=new THREE.Group(); g.position.set(cx,z0,cy); g.rotation.y=-angDeg*Math.PI/180; boat.add(g);
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); g.add(m); return m;};
  add(new THREE.BoxGeometry(C.tray_len,C.tray_h,C.tray_w),trayMat,0,C.tray_h/2,0);
  add(new THREE.BoxGeometry(C.tray_len-0.05,0.004,C.tray_w-0.05),std('#55595e',{roughness:0.7}),0,C.tray_h+0.001,0);
  const yb=C.tray_h;
  for(const sx of [-1,1]){
    const px=sx*C.post_dx;
    add(new THREE.CylinderGeometry(C.post_r,C.post_r,C.post_h,14),metalMat,px,yb+C.post_h/2,0);
    const cap=add(new THREE.CylinderGeometry(C.cap_r,C.cap_r,C.cap_t,18),metalMat,px,yb+C.post_h,0); cap.scale.set(1.18,1,0.92);
    add(new THREE.CylinderGeometry(C.post_r*1.15,C.post_r*1.15,0.035,14),metalMat,px,yb+C.bar_h,0);
  }
  const bar=add(new THREE.CylinderGeometry(C.bar_r,C.bar_r,C.bar_len,10),metalMat,0,yb+C.bar_h,0); bar.rotation.z=Math.PI/2;
  return g;
}
(function aftBoxes(){
  const B=D1.box, ZT=B.top_z, cab=std(LIVERY.cabinet,{roughness:0.55,side:THREE.DoubleSide}), cap=std(LIVERY.cabinetTop,{roughness:0.7,side:THREE.DoubleSide});
  const mirror=p=>p.map(q=>[q[0],-q[1]]);
  for(const sg of [-1,1]){            // BB = -1 (moottoriruiskulaatikko), SB = +1 (hinausköysilaatikko)
    const top=sg<0?B.top_bb:mirror(B.top_bb), base=sg<0?B.base_bb:mirror(B.base_bb);
    band(base,TRF,top,ZT,cab);
    polyFace(top,()=>ZT+B.cap_t,cap);
    band(top,ZT,top,ZT+B.cap_t,cap);
  }
  // BB: saranoitu kansi laatikon päällä, ovi vinossa seinässä, kuulapääsauva
  const lid=B.lid_bb; polyFace(lid,()=>ZT+B.cap_t+0.012,std('#b4b8bd',{roughness:0.6,side:THREE.DoubleSide}));
  band(lid,ZT+B.cap_t,lid,ZT+B.cap_t+0.012,std('#8a8e93',{roughness:0.6,side:THREE.DoubleSide}));
  outline3(lid.map(p=>[p[0],p[1],ZT+B.cap_t+0.0125]),'#3b3e42',true);
  for(const h of B.lid_hinges_bb) box(boat,h[0]-0.025,h[0]+0.025,h[1]-0.015,h[1]+0.015,ZT+B.cap_t,ZT+B.cap_t+0.03,'#6b6f74');
  const bp=B.ball_pole_bb; tubeM(boat,[bp.x,bp.y,ZT+B.cap_t],[bp.x,bp.y,bp.z1],0.008,metalMat,8);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(bp.ball_r,14,10),metalMat); ball.position.set(bp.x,bp.z1,bp.y); boat.add(ball);
  // ovi (KV 19 peräkuvanto): kaareva suorakaide vinon seinän pinnassa
  const T0=B.top_bb[1], T1=B.top_bb[2], B0=B.base_bb[1], B1=B.base_bb[2];
  const L=Math.hypot(T1[0]-T0[0],T1[1]-T0[1]);
  const nrm=[-(T1[1]-T0[1])/L, (T1[0]-T0[0])/L];            // horisontaalinen normaali (kohti kaukaloa)
  const wallPt=(w,z,off)=>{ const s=w/L, t=(z-TRF)/(ZT-TRF);
    const bx=B0[0]+(B1[0]-B0[0])*s, by=B0[1]+(B1[1]-B0[1])*s, tx=T0[0]+(T1[0]-T0[0])*s, ty=T0[1]+(T1[1]-T0[1])*s;
    return [bx+(tx-bx)*t+nrm[0]*off, by+(ty-by)*t+nrm[1]*off, z]; };
  const D=B.door_bb, rr=D.r, doorPoly=[]; const cs=[[D.w1-rr,D.z1-rr,0],[D.w0+rr,D.z1-rr,Math.PI/2],[D.w0+rr,D.z0+rr,Math.PI],[D.w1-rr,D.z0+rr,1.5*Math.PI]];
  for(const [cx,cz,a0] of cs) for(let i=0;i<=5;i++){const a=a0+Math.PI/2*i/5; doorPoly.push([cx+rr*Math.cos(a),cz+rr*Math.sin(a)]);}
  const dm=new Mesh3(); const tr=THREE.ShapeUtils.triangulateShape(doorPoly.map(q=>new THREE.Vector2(q[0],q[1])),[]);
  const P3=q=>{const p=wallPt(q[0],q[1],0.008); return V3(p[0],p[1],p[2]);};
  for(const t of tr) dm.tri(P3(doorPoly[t[0]]),P3(doorPoly[t[1]]),P3(doorPoly[t[2]]),new THREE.Vector3(nrm[0],0,nrm[1]));
  addMesh(boat,dm.geom(),std('#cfd2d5',{roughness:0.6,side:THREE.DoubleSide}));
  outline3(doorPoly.map(q=>wallPt(q[0],q[1],0.0085)),'#3b3e42',true);
  for(const hz of D.hinge_z){ const p=wallPt(D.w0,hz,0.012); box(boat,p[0]-0.012,p[0]+0.012,p[1]-0.012,p[1]+0.012,hz-0.035,hz+0.035,'#6b6f74'); }
})();
(function ovalHatchRing(){
  const O=D1.oval_hatch, o=O.outer;
  function build(cx,zf,ringH,gripSide,ringCol,lidCol){
    // ulkoreuna (päärynämäinen): SB-puoli oikealta otsapinnalta viisteen ja oikean ellipsin kautta apexiin ja vasemman ellipsin kautta vasemmalle reunalle, BB-puoli peilikuvana
    const S=[[o.face_u,o.cv],[o.cham_u,o.cham_v]];
    for(let k=0;k<=8;k++){const t=Math.PI/4+Math.PI/4*(k/8); S.push([o.cu+o.a_r*Math.cos(t), o.cv+o.b*Math.sin(t)]);}
    for(let k=1;k<=12;k++){const t=Math.PI/2+Math.PI/2*(k/12); S.push([o.cu+o.a_l*Math.cos(t), o.cv+o.b*Math.sin(t)]);}
    const outer=S.concat(S.slice().reverse().map(p=>[p[0],-p[1]]));
    const op=outer.map(p=>[cx+p[0],p[1]]);
    const openPoly=stadium(O.open_half_u,O.open_half_v,O.open_half_u,14).map(p=>[cx+p[0],p[1]]);
    const lidPoly=stadium(O.open_half_u*O.lid_scale,O.open_half_v*O.lid_scale,O.open_half_u*O.lid_scale,14).map(p=>[cx+p[0],p[1]]);
    const ringMat=std(ringCol,{roughness:0.5,metalness:0.35,side:THREE.DoubleSide}), lidMat=std(lidCol,{roughness:0.55,metalness:0.3,side:THREE.DoubleSide});
    polyFaceHole(op,openPoly,zf+ringH,ringMat);                                                          // kehyksen yläpinta
    band(op,zf,op,zf+ringH,ringMat);                                                                     // ulkoreunan pysty seinä
    band(openPoly,zf+ringH,lidPoly,zf+ringH*0.55,ringMat);                                              // sisäreunan viiste kanteen
    polyFace(lidPoly,()=>zf+ringH*0.55,lidMat);                                                          // kansi
    // kahvakolo: pyöristetty suorakaide kannen sillä reunalla, jossa kahva on (KV 19 / KV 15 kansikuvanto)
    const gu0=O.open_half_u*O.lid_scale-O.grip.w, gu1=O.open_half_u*O.lid_scale;
    let gp=rrect(gu0,gu1,-O.grip.half,O.grip.half,0.04,4);
    if(gripSide<0) gp=gp.map(p=>[-p[0],p[1]]);
    polyFace(gp.map(p=>[cx+p[0],p[1]]),()=>zf+ringH*0.55+0.002,std('#2b2d30',{roughness:0.8,side:THREE.DoubleSide}));
    outline3(lidPoly.map(p=>[p[0],p[1],zf+ringH*0.55+0.002]),'#2b2d30',true);
  }
  build(O.aft.cx,O.aft.floor_z,O.aft.ring_h,O.aft.grip_side,'#4a4e53','#7a7e83');
  build(O.bow.cx,zDeck(O.bow.cx),O.bow.ring_h,O.bow.grip_side,'#4a4e53','#7a7e83');
})();
(function bollardAndCleats(){
  const Bo=D1.bollard, z0=zDeck(Bo.x);
  const mat=std('#3b3e42',{roughness:0.4,metalness:0.4});
  tubeM(boat,[Bo.x,0,z0],[Bo.x,0,Bo.top_z-0.013],Bo.post_r,mat,24);
  tubeM(boat,[Bo.x,0,Bo.top_z-0.013],[Bo.x,0,Bo.top_z],Bo.head_r,mat,24);
  tubeM(boat,[Bo.x,-Bo.bar_half,Bo.bar_z],[Bo.x,Bo.bar_half,Bo.bar_z],Bo.bar_r,mat,10);
  const C=D1.cleat;
  for(const [x,y] of C.aft_box) bitt(x,y,D1.box.top_z+D1.box.cap_t,0);
  for(const [x,y] of C.mid) bitt(x,y,zDeck(x),0);
  for(const [x,y,a] of C.swim) bitt(x,y,SUP.swim_platform.z_top,a);
  for(const [x,y,a] of C.bow) bitt(x,y,zDeck(x),a);
})();


// sienituuletin (konetila BB): halkaisija 195 mm, korkeus 0,33 m, kahdeksankulmainen jalusta
(function vents(){
  const m=SUP.mushroom_vent_bb, z0=zDeck(m.x), mat=std('#b9bdc2',{roughness:0.5,metalness:0.3});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(m.base_r,m.base_r,0.025,8),mat); base.position.set(m.x,z0+0.0125,m.y); boat.add(base);
  const stemH=m.h-0.07;
  tubeM(boat,[m.x,m.y,z0],[m.x,m.y,z0+stemH],m.r,mat,16);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(m.cap_r,m.r*1.1,0.07,20),mat); cap.position.set(m.x,z0+stemH+0.035,m.y); boat.add(cap);
})();

// ---------------------------------------------------------------------------------------------
// Luukut kehyksinä
// ---------------------------------------------------------------------------------------------
(function hatches(){
  const fm=LIVERY.hatchFrame;
  for(const o of HULL.openings){
    if(o.type!=='hatch') continue;
    if(o.name.indexOf('Jettitilan')===0||o.name.indexOf('Kajuutan')===0||o.name.indexOf('Keulapiikin')===0) continue;   // vaihe 1d: rakennettu piirustusten mukaan erikseen
    let zt=o.z;
    if(o.name.indexOf('Kajuutan')===0) zt=CABIN_TOP(o.x);
    else if(o.name.indexOf('Keulapiikin')===0) zt=zDeck(o.x);
    else if(o.name.indexOf('Jettitilan')===0) zt=HULL.well.z;
    else if(o.name.indexOf('Jetin tarkastus')===0) zt=SUP.swim_platform.z_top;
    else if(o.name.indexOf('Ohjaamon kattoluukku')===0) zt=WH.roof_z;
    else zt=zDeck(o.x);
    if(o.zTop!==undefined) zt=o.zTop;
    const x0=o.x-o.l/2,x1=o.x+o.l/2,y0=o.y-o.w/2,y1=o.y+o.w/2,t=0.045,hgt=0.035;
    const round=o.name.indexOf('pyöreä')>=0, oval=o.name.indexOf('soikea')>=0;
    if(round){   // kajuutan pyöreä luukku: kaksoisrengas (r 0,377 ja 0,30), kansi ja ristikahva
      const R=o.w/2;
      const ring=new THREE.Mesh(new THREE.TorusGeometry(R-0.02,0.02,8,40),std(fm));
      ring.rotation.x=Math.PI/2; ring.position.set(o.x,zt+0.03,o.y); boat.add(ring);
      const ring2=new THREE.Mesh(new THREE.TorusGeometry(0.30,0.015,8,40),std(fm));
      ring2.rotation.x=Math.PI/2; ring2.position.set(o.x,zt+0.025,o.y); boat.add(ring2);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.29,0.29,0.03,40),std(LIVERY.hatch));
      cap.position.set(o.x,zt+0.015,o.y); boat.add(cap);
      tubeM(boat,[o.x-0.29,o.y,zt+0.04],[o.x+0.29,o.y,zt+0.04],0.012,std(fm),6);
      tubeM(boat,[o.x,o.y-0.29,zt+0.04],[o.x,o.y+0.29,zt+0.04],0.012,std(fm),6);
      continue;
    }
    if(oval){   // soikea luukku: matala kehys (reunus + rengas), kansi
      const wall=new THREE.Mesh(new THREE.CylinderGeometry(1,1,0.04,48,1,true),std(fm,{side:THREE.DoubleSide}));
      wall.scale.set(o.l/2,1,o.w/2); wall.position.set(o.x,zt+0.02,o.y); boat.add(wall);
      const top=new THREE.Mesh(new THREE.RingGeometry(0.90,1,48),std(fm,{side:THREE.DoubleSide}));
      top.rotation.x=-Math.PI/2; top.scale.set(o.l/2,o.w/2,1); top.position.set(o.x,zt+0.04,o.y); boat.add(top);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(1,1,0.03,48),std(LIVERY.hatch));
      cap.scale.set(o.l/2*0.92,1,o.w/2*0.92); cap.position.set(o.x,zt+0.025,o.y); boat.add(cap);
      continue;
    }
    box(boat,x0,x1,y0,y0+t,zt,zt+hgt,fm); box(boat,x0,x1,y1-t,y1,zt,zt+hgt,fm);
    box(boat,x0,x0+t,y0,y1,zt,zt+hgt,fm); box(boat,x1-t,x1,y0,y1,zt,zt+hgt,fm);
    box(boat,x0+t,x1-t,y0+t,y1-t,zt,zt+0.02,LIVERY.hatch);
    if(o.bolts){   // 10 pulttia: kolme ylä- ja alareunassa, kaksi kummallakin sivulla (kansikuvannon mukaan, suhteelliset paikat)
      const mir=o.y>0;
      const pos=[[0.163,0.083],[0.50,0.083],[0.83,0.083],[0.163,0.93],[0.50,0.93],[0.83,0.93],[0.046,0.265],[0.046,0.74],[0.944,0.265],[0.944,0.74]];
      for(const [fx,fy] of pos){
        const yy=y0+o.w*(mir?(1-fy):fy);
        const b=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.025,10),std(fm)); b.position.set(x0+o.l*fx,zt+0.03,yy); boat.add(b);
        const c=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.03,8),std(LIVERY.hatch)); c.position.set(x0+o.l*fx,zt+0.04,yy); boat.add(c);
      }
    }
    if(o.name.indexOf('saranoitu')>=0){   // saranat ohjaamon puolella (x1), kahva peräreunassa
      for(const fy of [0.2,0.8]) tubeM(boat,[x1-0.02,y0+o.w*fy-0.04,zt+0.04],[x1-0.02,y0+o.w*fy+0.04,zt+0.04],0.016,std(fm),8);
      tubeM(boat,[x0+0.06,y0+o.w*0.3,zt+0.06],[x0+0.06,y0+o.w*0.7,zt+0.06],0.014,std(fm),8);
      tubeM(boat,[x0+0.06,y0+o.w*0.3,zt+0.02],[x0+0.06,y0+o.w*0.3,zt+0.06],0.012,std(fm),6);
      tubeM(boat,[x0+0.06,y0+o.w*0.7,zt+0.02],[x0+0.06,y0+o.w*0.7,zt+0.06],0.012,std(fm),6);
    }
  }
})();

// ---------------------------------------------------------------------------------------------
// Kaiteet ja jetit
// ---------------------------------------------------------------------------------------------
(function rails(){
  const R=SUP.rails, rm=std(LIVERY.rails,{roughness:0.3,metalness:0.55}), tr=R.tube_r, pr=R.post_r*0.6;
  const zSwim=SUP.swim_platform.z_top;
  const baseZ=(x)=>x<0?zSwim:zDeck(x);
  // uimatason ja peräkannen kaidesilmukat (molemmat puolet): yläputki, keskiputki ja pylväät mutkissa
  for(const s of [1,-1]){
    const P=R.swim_loop_sb.map(p=>[p[0],s*p[1]]);
    for(let i=0;i<P.length-1;i++){
      tubeM(boat,[P[i][0],P[i][1],R.top_z],[P[i+1][0],P[i+1][1],R.top_z],tr,rm,8);
      tubeM(boat,[P[i][0],P[i][1],R.mid_z],[P[i+1][0],P[i+1][1],R.mid_z],tr*0.85,rm,8);
    }
    for(let i=0;i<P.length;i++) tubeM(boat,[P[i][0],P[i][1],baseZ(P[i][0])],[P[i][0],P[i][1],R.top_z],pr,rm,8);
    // yhteys laitakaiteeseen peräpeilin reunalla
    tubeM(boat,[0,s*R.side_rail_y,R.top_z],[0,P[0][1],R.top_z],tr,rm,8);
    // laitakaide paneelien päällä
    const xa=R.side_rail_x[0], xb=R.side_rail_x[1], y=s*R.side_rail_y;
    tubeM(boat,[xa,y,R.top_z],[xb,y,R.top_z],tr,rm,8);
    tubeM(boat,[xa,y,SUP.aft_deck.side_panels.top_z],[xa,y,R.top_z],pr,rm,8);
    tubeM(boat,[1.20,y,SUP.aft_deck.side_panels.top_z],[1.20,y,R.top_z],pr,rm,8);
    // vaihe 1d: laitapaneeli 2 on kaidekehys (KV 19 sivukuvanto): pyöristetty suorakaide x 1,245 ... 2,55, z 1,75 ... 2,577, kaksi välitankoa
    const FX0=1.245, FX1=xb, FZ0=1.75, FR=0.10, Nn=6;
    const seg=(p,q)=>tubeM(boat,[p[0],y,p[1]],[q[0],y,q[1]],tr,rm,8);
    seg([FX0+FR,R.top_z],[FX1-FR,R.top_z]); seg([FX0+FR,FZ0],[FX1-FR,FZ0]); seg([FX0,FZ0+FR],[FX0,R.top_z-FR]); seg([FX1,FZ0+FR],[FX1,R.top_z-FR]);
    for(const [cx,cz,a0] of [[FX1-FR,R.top_z-FR,0],[FX0+FR,R.top_z-FR,Math.PI/2],[FX0+FR,FZ0+FR,Math.PI],[FX1-FR,FZ0+FR,1.5*Math.PI]]){
      let prev=[cx+FR*Math.cos(a0),cz+FR*Math.sin(a0)];
      for(let k=1;k<=Nn;k++){const a=a0+Math.PI/2*k/Nn, p=[cx+FR*Math.cos(a),cz+FR*Math.sin(a)]; seg(prev,p); prev=p;}
    }
    for(const x of [1.575,2.21]) seg([x,FZ0],[x,R.top_z]);
  }
  // keulakaide (vaihe 1c): kaksi pystysuoraa kehystä keulakannella, y +-0,517, pylväät x 10,30 ja 11,43, yläputki z 3,054, pyöristetyt yläkulmat
  const B=R.bow_rail, rr=B.tube_r, rc=B.r_corner;
  for(const s of [1,-1]){
    const y=s*B.y;
    tubeM(boat,[B.x0,y,B.z_deck],[B.x0,y,B.z_top-rc],rr,rm,8);
    tubeM(boat,[B.x1,y,B.z_deck],[B.x1,y,B.z_top-rc],rr,rm,8);
    tubeM(boat,[B.x0+rc,y,B.z_top],[B.x1-rc,y,B.z_top],rr,rm,8);
    const N=5;
    for(const [cx,sg] of [[B.x0+rc,-1],[B.x1-rc,1]]){
      let prev=[cx+sg*rc,y,B.z_top-rc];
      for(let k=1;k<=N;k++){const a=k/N*Math.PI/2; const p=[cx+sg*rc*Math.cos(a),y,B.z_top-rc+rc*Math.sin(a)]; tubeM(boat,prev,p,rr,rm,8); prev=p;}
    }
    // jalkalevyt
    box(boat,B.x0-0.09,B.x0+0.09,y-0.04,y+0.04,B.z_deck,B.z_deck+0.012,LIVERY.hatchFrame);
    box(boat,B.x1-0.09,B.x1+0.09,y-0.04,y+0.04,B.z_deck,B.z_deck+0.012,LIVERY.hatchFrame);
  }
})();
(function jets(){
  for(const j of SUP.jets){
    const L=j.x1-j.x0;
    const g=new THREE.CylinderGeometry(j.r,j.r*0.8,L,18); const m=new THREE.Mesh(g,std(LIVERY.jets,{roughness:0.4,metalness:0.5}));
    m.rotation.z=Math.PI/2; m.position.set((j.x0+j.x1)/2,j.z,j.y); boat.add(m);
    // vastavesiluukku, puolisylinteri suuttimen takana
    const bk=new THREE.Mesh(new THREE.CylinderGeometry(j.r*1.6,j.r*1.6,0.42,18,1,true,0,Math.PI),std(LIVERY.jets,{roughness:0.45,metalness:0.5,side:THREE.DoubleSide}));
    bk.rotation.z=Math.PI/2; bk.rotation.y=Math.PI; bk.position.set(j.x0+0.12,j.z-0.05,j.y); boat.add(bk);
  }
})();

// ---------------------------------------------------------------------------------------------
// Simulaattori: geometrioiden yhdistäminen materiaaleittain (piirtokutsujen vähentämiseksi)
// ---------------------------------------------------------------------------------------------
function mergeByMaterial(root){
  root.updateMatrixWorld(true);
  const groups=new Map(), keep=[];
  root.traverse(o=>{
    if(!o.isMesh) return;
    const m=o.material;
    if(Array.isArray(m)||m.map||m.isShaderMaterial||o.userData.noMerge||!o.geometry.attributes.position){ keep.push(o); return; }
    const key=[m.type,m.color&&m.color.getHexString(),m.roughness,m.metalness,m.side,m.emissive&&m.emissive.getHexString(),m.transparent,m.opacity,m.polygonOffset,m.vertexColors,o.geometry.attributes.color?'c':'n'].join('|');
    if(!groups.has(key)) groups.set(key,{mat:m,meshes:[],color:!!o.geometry.attributes.color});
    groups.get(key).meshes.push(o);
  });
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out=new THREE.Group();
  for(const o of keep){ o.updateMatrixWorld(true); const g=o.geometry; const mm=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld);
    o.matrix.copy(mm); o.matrix.decompose(o.position,o.quaternion,o.scale); out.add(o.parent?o:o); }
  for(const gr of groups.values()){
    let n=0; const geoms=gr.meshes.map(o=>{ let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      const mm=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld); g.applyMatrix4(mm); n+=g.attributes.position.count; return g; });
    const pos=new Float32Array(n*3), nor=new Float32Array(n*3), col=gr.color?new Float32Array(n*3):null; let k=0;
    for(const g of geoms){ const c=g.attributes.position.count; pos.set(g.attributes.position.array,k*3);
      if(g.attributes.normal) nor.set(g.attributes.normal.array,k*3);
      if(col){ if(g.attributes.color) col.set(g.attributes.color.array,k*3); else col.fill(1,k*3,(k+c)*3); }
      k+=c; g.dispose(); }
    const G=new THREE.BufferGeometry(); G.setAttribute('position',new THREE.BufferAttribute(pos,3)); G.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    if(col) G.setAttribute('color',new THREE.BufferAttribute(col,3));
    out.add(new THREE.Mesh(G,gr.mat));
  }
  return out;
}
let result=boat;
if(OPTS.merge){ result=mergeByMaterial(boat); }
let tris=0, meshes=0; result.traverse(o=>{ if(o.isMesh){ meshes++; const g=o.geometry; tris+=(g.index?g.index.count:g.attributes.position.count)/3; } });
return {boat:result, hullShell, zDeck, zWL, stationAt, DRAFT, HULL, LIVERY, WH, stats:{triangles:Math.round(tris), meshes}};

}
var api = { build: build, DATA: {"LOA_hull":11.9,"LOA_incl_bow_overhang":12.257,"beam":4.5,"beam_measured_outer":4.42,"frame":"x peräpeilistä keulaan, y SB positiivinen (vain SB annettu), z köliviivasta ylös. Pisteet köli -> V-pohja -> alapalle -> ylempi särmä -> kylkikaari -> kansiviiva.","point_names":["keel","bottom_mid","chine_lower","side_mid","chine_upper","flare_1","flare_2","sheer"],"stations":[{"x":0.0,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.871,0.8433],[1.9296,1.0194],[2.0638,1.204],[2.1557,1.4077],[2.2053,1.6305]]},{"x":0.25,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8698,0.8424],[1.9271,1.0177],[2.0623,1.2027],[2.155,1.4069],[2.2053,1.6305]]},{"x":0.5,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8687,0.8414],[1.925,1.0158],[2.0611,1.2012],[2.1545,1.4062],[2.2053,1.6305]]},{"x":0.75,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8687,0.8406],[1.925,1.014],[2.0612,1.2001],[2.1546,1.4056],[2.2053,1.6305]]},{"x":1.0,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8687,0.8404],[1.925,1.0137],[2.0612,1.1999],[2.1546,1.4055],[2.2053,1.6305]]},{"x":1.25,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8687,0.8409],[1.925,1.0146],[2.0611,1.2006],[2.1546,1.4059],[2.2053,1.6307]]},{"x":1.5,"pts":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.8687,0.8415],[1.925,1.016],[2.0613,1.2023],[2.1549,1.408],[2.2057,1.6332]]},{"x":1.75,"pts":[[0.0,0.0],[0.9062,0.3336],[1.8124,0.6671],[1.8708,0.8432],[1.9293,1.0192],[2.0643,1.2056],[2.1565,1.4112],[2.2061,1.636]]},{"x":2.0,"pts":[[0.0,0.0],[0.9062,0.3336],[1.8124,0.6671],[1.8754,0.8463],[1.9383,1.0256],[2.0703,1.2119],[2.1597,1.4167],[2.2065,1.6402]]},{"x":2.25,"pts":[[0.0,0.0],[0.9054,0.3341],[1.8108,0.6683],[1.8811,0.8515],[1.9513,1.0347],[2.0788,1.2206],[2.164,1.4241],[2.2069,1.6454]]},{"x":2.5,"pts":[[0.0,0.0],[0.9043,0.335],[1.8086,0.6699],[1.883,0.8578],[1.9575,1.0458],[2.0827,1.2303],[2.166,1.4322],[2.2073,1.6514]]},{"x":2.75,"pts":[[0.0,0.0],[0.9032,0.3358],[1.8063,0.6715],[1.8824,0.8657],[1.9585,1.0599],[2.0832,1.2429],[2.1663,1.4431],[2.2077,1.6606]]},{"x":3.0,"pts":[[0.0,0.0],[0.9021,0.3366],[1.8041,0.6732],[1.8814,0.875],[1.9586,1.0769],[2.0829,1.2573],[2.1661,1.4551],[2.2082,1.6701]]},{"x":3.25,"pts":[[0.0,0.0],[0.9003,0.3379],[1.8006,0.6757],[1.8796,0.8873],[1.9586,1.0988],[2.0822,1.2753],[2.1655,1.469],[2.2086,1.6801]]},{"x":3.5,"pts":[[0.0,0.0],[0.8981,0.3395],[1.7961,0.679],[1.8776,0.9018],[1.9592,1.1246],[2.0817,1.2968],[2.1649,1.4862],[2.2087,1.6929]]},{"x":3.75,"pts":[[0.0,0.0],[0.8954,0.3414],[1.7907,0.6829],[1.8762,0.9191],[1.9617,1.1554],[2.0824,1.3229],[2.1647,1.5076],[2.2087,1.7094]]},{"x":4.0,"pts":[[0.0,0.0],[0.892,0.3439],[1.784,0.6878],[1.8744,0.9388],[1.9648,1.1899],[2.0834,1.3526],[2.1647,1.5322],[2.2087,1.7286]]},{"x":4.25,"pts":[[0.0,0.0],[0.8881,0.3467],[1.7762,0.6934],[1.8707,0.9606],[1.9653,1.2279],[2.0826,1.385],[2.1637,1.5589],[2.2086,1.7497]]},{"x":4.5,"pts":[[0.0,0.0],[0.8835,0.3499],[1.767,0.6999],[1.8658,0.9851],[1.9646,1.2703],[2.0803,1.4215],[2.1612,1.5895],[2.2071,1.7743]]},{"x":4.75,"pts":[[0.0,0.0],[0.878,0.3538],[1.7561,0.7076],[1.8596,1.0117],[1.9632,1.3157],[2.0774,1.461],[2.1578,1.6229],[2.2046,1.8016]]},{"x":5.0,"pts":[[0.0,0.0],[0.8713,0.3587],[1.7426,0.7174],[1.8519,1.0406],[1.9612,1.3638],[2.0737,1.5027],[2.1539,1.6582],[2.2017,1.8304]]},{"x":5.25,"pts":[[0.0,0.0],[0.864,0.3641],[1.728,0.7281],[1.8424,1.0714],[1.9568,1.4146],[2.0678,1.5476],[2.1477,1.6971],[2.1965,1.8633]]},{"x":5.5,"pts":[[0.0,0.0],[0.8544,0.3706],[1.7089,0.7412],[1.8305,1.1034],[1.9521,1.4656],[2.061,1.5928],[2.14,1.7364],[2.1892,1.8964]]},{"x":5.75,"pts":[[0.0,0.0],[0.8441,0.3773],[1.6882,0.7546],[1.8157,1.1358],[1.9432,1.517],[2.0503,1.6382],[2.1288,1.7757],[2.1787,1.9295]]},{"x":6.0,"pts":[[0.0,0.0],[0.834,0.3846],[1.668,0.7693],[1.8003,1.1683],[1.9326,1.5673],[2.0376,1.683],[2.1153,1.8147],[2.1655,1.9626]]},{"x":6.25,"pts":[[0.0,0.0007],[0.8238,0.3925],[1.6475,0.7842],[1.7827,1.1983],[1.9179,1.6124],[2.0219,1.7239],[2.0995,1.8515],[2.1505,1.9952]]},{"x":6.5,"pts":[[0.0,0.0016],[0.8103,0.4026],[1.6207,0.8035],[1.7597,1.2291],[1.8988,1.6547],[2.0024,1.7622],[2.0803,1.8858],[2.1326,2.0256]]},{"x":6.75,"pts":[[0.0,0.0027],[0.7965,0.4131],[1.5929,0.8236],[1.735,1.2583],[1.877,1.6931],[1.9797,1.7968],[2.0575,1.9167],[2.1104,2.0527]]},{"x":7.0,"pts":[[0.0,0.0045],[0.7807,0.4253],[1.5613,0.8462],[1.7059,1.2875],[1.8504,1.7288],[1.9523,1.8289],[2.0299,1.9452],[2.0834,2.0775]]},{"x":7.25,"pts":[[0.0,0.0062],[0.7628,0.4377],[1.5255,0.8692],[1.6746,1.3133],[1.8237,1.7574],[1.9242,1.855],[2.001,1.9686],[2.0543,2.0981]]},{"x":7.5,"pts":[[0.0,0.008],[0.7452,0.4508],[1.4904,0.8935],[1.64,1.3387],[1.7897,1.7839],[1.8901,1.878],[1.9676,1.9882],[2.0222,2.1144]]},{"x":7.75,"pts":[[0.0,0.0115],[0.7256,0.465],[1.4513,0.9185],[1.6003,1.3628],[1.7493,1.8071],[1.8498,1.8986],[1.9278,2.0063],[1.9835,2.1302]]},{"x":8.0,"pts":[[0.0,0.0176],[0.7025,0.4831],[1.405,0.9487],[1.5547,1.3876],[1.7045,1.8265],[1.8047,1.9152],[1.8831,2.0201],[1.9397,2.1413]]},{"x":8.25,"pts":[[0.0,0.0261],[0.6714,0.5031],[1.3428,0.9801],[1.5005,1.4112],[1.6583,1.8422],[1.7583,1.9282],[1.837,2.0305],[1.8945,2.1492]]},{"x":8.5,"pts":[[0.0,0.0397],[0.6575,0.5263],[1.3151,1.0129],[1.4612,1.4343],[1.6072,1.8556],[1.7075,1.9393],[1.787,2.0394],[1.8456,2.156]]},{"x":8.75,"pts":[[0.0,0.0503],[0.6288,0.5492],[1.2575,1.0481],[1.4099,1.4574],[1.5623,1.8668],[1.6589,1.9495],[1.735,2.0481],[1.7907,2.1624]]},{"x":9.0,"pts":[[0.0,0.0754],[0.5979,0.5823],[1.1958,1.0892],[1.345,1.4828],[1.4943,1.8764],[1.5939,1.957],[1.6734,2.0541],[1.7327,2.1677]]},{"x":9.25,"pts":[[0.0,0.1113],[0.5644,0.621],[1.1287,1.1307],[1.2832,1.5075],[1.4377,1.8843],[1.5357,1.9644],[1.6136,2.0606],[1.6716,2.173]]},{"x":9.5,"pts":[[0.0,0.1331],[0.5267,0.6556],[1.0533,1.1782],[1.2097,1.5352],[1.3661,1.8923],[1.4653,1.9701],[1.5448,2.0645],[1.6047,2.1753]]},{"x":9.75,"pts":[[0.0,0.1547],[0.49,0.6906],[0.9801,1.2265],[1.1309,1.563],[1.2817,1.8996],[1.3859,1.9743],[1.4708,2.0667],[1.5365,2.1767]]},{"x":10.0,"pts":[[0.0,0.186],[0.4466,0.7312],[0.8931,1.2764],[1.0496,1.5913],[1.206,1.9061],[1.3105,1.9789],[1.3962,2.0696],[1.463,2.178]]},{"x":10.25,"pts":[[0.0,0.2855],[0.3941,0.8107],[0.7881,1.3358],[0.9539,1.6244],[1.1197,1.9129],[1.2266,1.9834],[1.3149,2.0723],[1.3848,2.1795]]},{"x":10.5,"pts":[[0.0,0.4217],[0.3388,0.9095],[0.6777,1.3972],[0.8386,1.6588],[0.9995,1.9204],[1.1187,1.9863],[1.2198,2.0731],[1.3028,2.181]]},{"x":10.75,"pts":[[0.0,0.6264],[0.2757,1.0433],[0.5514,1.4603],[0.7115,1.6943],[0.8716,1.9284],[1.0024,1.9895],[1.1155,2.0742],[1.211,2.1824]]},{"x":11.0,"pts":[[0.0,0.887],[0.199,1.2096],[0.398,1.5322],[0.5693,1.7343],[0.7405,1.9363],[0.8816,1.9931],[1.0055,2.0756],[1.1123,2.1839]]},{"x":11.25,"pts":[[0.0,1.1454],[0.1207,1.3741],[0.2414,1.6028],[0.4221,1.7735],[0.6028,1.9443],[0.7533,1.9961],[0.8872,2.0758],[1.0046,2.1833]]},{"x":11.5,"pts":[[0.0,1.411],[0.0581,1.4787],[0.1163,1.5463],[0.2907,1.7493],[0.4651,1.9522],[0.6202,1.9998],[0.7595,2.0763],[0.8828,2.1818]]},{"x":11.75,"pts":[[0.0,1.6841],[0.0356,1.7223],[0.0712,1.7606],[0.1779,1.8755],[0.2847,1.9903],[0.4488,2.0229],[0.5996,2.0869],[0.7372,2.1822]]},{"x":12.0,"pts":[[0.0,2.0186],[0.0045,2.0244],[0.0089,2.0303],[0.0223,2.0478],[0.0357,2.0653],[0.2118,2.0705],[0.3795,2.1106],[0.5389,2.1855]]},{"x":12.25,"pts":[[0.0,2.1785],[0.0,2.1785],[0.0,2.1785],[0.0,2.1785],[0.0,2.1785],[0.0102,2.1785],[0.0168,2.1785],[0.02,2.1909]]}],"deck_edge":[[0.0,2.2053,1.6305],[0.25,2.2053,1.6305],[0.5,2.2053,1.6305],[0.75,2.2053,1.6305],[1.0,2.2053,1.6305],[1.25,2.2053,1.6307],[1.5,2.2057,1.6332],[1.75,2.2061,1.636],[2.0,2.2065,1.6402],[2.25,2.2069,1.6454],[2.5,2.2073,1.6514],[2.75,2.2077,1.6606],[3.0,2.2082,1.6701],[3.25,2.2086,1.6801],[3.5,2.2087,1.6929],[3.75,2.2087,1.7094],[4.0,2.2087,1.7286],[4.25,2.2086,1.7497],[4.5,2.2071,1.7743],[4.75,2.2046,1.8016],[5.0,2.2017,1.8304],[5.25,2.1965,1.8633],[5.5,2.1892,1.8964],[5.75,2.1787,1.9295],[6.0,2.1655,1.9626],[6.25,2.1505,1.9952],[6.5,2.1326,2.0256],[6.75,2.1104,2.0527],[7.0,2.0834,2.0775],[7.25,2.0543,2.0981],[7.5,2.0222,2.1144],[7.75,1.9835,2.1302],[8.0,1.9397,2.1413],[8.25,1.8945,2.1492],[8.5,1.8456,2.156],[8.75,1.7907,2.1624],[9.0,1.7327,2.1677],[9.25,1.6716,2.173],[9.5,1.6047,2.1753],[9.75,1.5365,2.1767],[10.0,1.463,2.178],[10.25,1.3848,2.1795],[10.5,1.3028,2.181],[10.75,1.211,2.1824],[11.0,1.1123,2.1839],[11.25,1.0046,2.1833],[11.5,0.8828,2.1818],[11.75,0.7372,2.1822],[12.0,0.5389,2.1855],[12.25,0.02,2.1909]],"deck_camber":0.0,"deck_z_main_aft_KV":1.65,"transom":[[0.0,0.019],[0.9062,0.3431],[1.8124,0.6671],[1.871,0.8433],[1.9296,1.0194],[2.0638,1.204],[2.1557,1.4077],[2.2053,1.6305]],"stem":[[0.05,0.019],[0.302,0.019],[0.554,0.019],[0.806,0.019],[1.057,0.019],[1.309,0.019],[1.561,0.019],[1.813,0.0],[2.064,0.0],[2.316,0.0],[2.568,0.0],[2.82,0.0],[3.071,0.0],[3.323,0.0],[3.575,0.0],[3.827,0.0],[4.078,0.0],[4.33,0.0],[4.582,0.0],[4.834,0.0],[5.085,0.0],[5.337,0.0],[5.589,0.0],[5.841,0.0],[6.092,0.0],[6.344,0.001],[6.596,0.002],[6.848,0.003],[7.099,0.005],[7.351,0.007],[7.603,0.009],[7.855,0.014],[8.106,0.021],[8.358,0.032],[8.61,0.047],[8.862,0.06],[9.113,0.09],[9.365,0.123],[9.617,0.143],[9.869,0.165],[10.12,0.227],[10.372,0.348],[10.624,0.509],[10.792,0.669],[10.959,0.845],[11.127,1.017],[11.295,1.19],[11.463,1.371],[11.631,1.552],[11.799,1.741],[11.877,1.94],[12.257,2.183]],"chine":[[0.0,1.812,0.667],[0.25,1.812,0.667],[0.5,1.812,0.667],[0.75,1.812,0.667],[1.0,1.812,0.667],[1.25,1.812,0.667],[1.5,1.812,0.667],[1.75,1.812,0.667],[2.0,1.812,0.667],[2.25,1.811,0.668],[2.5,1.809,0.67],[2.75,1.806,0.671],[3.0,1.804,0.673],[3.25,1.801,0.676],[3.5,1.796,0.679],[3.75,1.791,0.683],[4.0,1.784,0.688],[4.25,1.776,0.693],[4.5,1.767,0.7],[4.75,1.756,0.708],[5.0,1.743,0.717],[5.25,1.728,0.728],[5.5,1.709,0.741],[5.75,1.688,0.755],[6.0,1.668,0.769],[6.25,1.647,0.784],[6.5,1.621,0.803],[6.75,1.593,0.824],[7.0,1.561,0.846],[7.25,1.526,0.869],[7.5,1.49,0.893],[7.75,1.451,0.918],[8.0,1.405,0.949],[8.25,1.343,0.98],[8.5,1.315,1.013],[8.75,1.258,1.048],[9.0,1.196,1.089],[9.25,1.129,1.131],[9.5,1.053,1.178],[9.75,0.98,1.226],[10.0,0.893,1.276],[10.25,0.788,1.336],[10.5,0.678,1.397],[10.75,0.551,1.46],[11.0,0.398,1.532],[11.25,0.241,1.603]],"chine_upper":[[0.0,1.93,1.019],[0.25,1.927,1.018],[0.5,1.925,1.016],[0.75,1.925,1.014],[1.0,1.925,1.014],[1.25,1.925,1.015],[1.5,1.925,1.016],[1.75,1.929,1.019],[2.0,1.938,1.026],[2.25,1.951,1.035],[2.5,1.958,1.046],[2.75,1.958,1.06],[3.0,1.959,1.077],[3.25,1.959,1.099],[3.5,1.959,1.125],[3.75,1.962,1.155],[4.0,1.965,1.19],[4.25,1.965,1.228],[4.5,1.965,1.27],[4.75,1.963,1.316],[5.0,1.961,1.364],[5.25,1.957,1.415],[5.5,1.952,1.466],[5.75,1.943,1.517],[6.0,1.933,1.567],[6.25,1.918,1.612],[6.5,1.899,1.655],[6.75,1.877,1.693],[7.0,1.85,1.729],[7.25,1.824,1.757],[7.5,1.79,1.784],[7.75,1.749,1.807],[8.0,1.704,1.827],[8.25,1.658,1.842],[8.5,1.607,1.856],[8.75,1.562,1.867],[9.0,1.494,1.876],[9.25,1.438,1.884],[9.5,1.366,1.892],[9.75,1.282,1.9],[10.0,1.206,1.906],[10.25,1.12,1.913],[10.5,1.0,1.92],[10.75,0.872,1.928],[11.0,0.741,1.936],[11.25,0.603,1.944],[11.5,0.465,1.952]],"spray_rails":[[[0.0,1.93,1.019],[0.25,1.927,1.018],[0.5,1.925,1.016],[0.75,1.925,1.014],[1.0,1.925,1.014],[1.25,1.925,1.015],[1.5,1.925,1.016],[1.75,1.929,1.019],[2.0,1.938,1.026],[2.25,1.951,1.035],[2.5,1.958,1.046],[2.75,1.958,1.06],[3.0,1.959,1.077],[3.25,1.959,1.099],[3.5,1.959,1.125],[3.75,1.962,1.155],[4.0,1.965,1.19],[4.25,1.965,1.228],[4.5,1.965,1.27],[4.75,1.963,1.316],[5.0,1.961,1.364],[5.25,1.957,1.415],[5.5,1.952,1.466],[5.75,1.943,1.517],[6.0,1.933,1.567],[6.25,1.918,1.612],[6.5,1.899,1.655],[6.75,1.877,1.693],[7.0,1.85,1.729],[7.25,1.824,1.757],[7.5,1.79,1.784],[7.75,1.749,1.807],[8.0,1.704,1.827],[8.25,1.658,1.842],[8.5,1.607,1.856],[8.75,1.562,1.867],[9.0,1.494,1.876],[9.25,1.438,1.884],[9.5,1.366,1.892],[9.75,1.282,1.9],[10.0,1.206,1.906],[10.25,1.12,1.913],[10.5,1.0,1.92],[10.75,0.872,1.928],[11.0,0.741,1.936],[11.25,0.603,1.944],[11.5,0.465,1.952]],[[6.0,0.399,0.184],[6.25,0.384,0.184],[6.5,0.38,0.19],[6.75,0.381,0.199],[7.0,0.382,0.21],[7.25,0.388,0.226],[7.5,0.397,0.244],[7.75,0.41,0.268],[8.0,0.422,0.297],[8.25,0.433,0.334],[8.5,0.456,0.377],[8.75,0.477,0.429],[9.0,0.491,0.491],[9.25,0.504,0.567],[9.5,0.527,0.656],[9.75,0.587,0.797]]],"spray_rails_note":"spray_rails[0] = ylempi särmä (kylkilista), spray_rails[1] = keulan pohjan lyhyt sumuvaluri","well":{"x0":0.0,"x1":1.02,"half_beam":0.97,"z":1.468,"polygon_sb":[[0.0,0.97],[0.525,0.6],[0.848,0.358],[0.863,0.288],[0.946,0.232],[1.0,0.205],[1.02,0.185],[1.005,0.13],[0.994,0.09],[0.994,0.0]],"note":"Vaihe 1d: V-muotoinen kaukalo (ei suorakaide). Peräpeilissä leveys y +-0,97 (KV 19 peräkuvanto), kapenee seinäviivaa y = 0,97 - 0,705 x pitkin ja päättyy pollarin kohdalla aaltoilevaan otsareunaan x 0,85 … 1,02 (KV 19 kansikuvanto). Pohja z 1,468 (KV 19 peräkuvanto ja KV 1 CL-leikkaus 1,46 … 1,49), pääkansi 1,63 … 1,69, syvyys 0,16 … 0,22 m. Seinät: laatikkojen vinot seinät (kaltevuus noin 5 astetta ulospäin ylöspäin), otsaseinä pysty"},"superstructure":{"deck_note":"Pääkansi mallinnetaan kansiviivan (sheer) korkeudelle z_sheer(x), poikkisuunnassa vaakasuora (deck_camber 0). Kansi 1,63 perässä ja 2,19 keulassa.","wheelhouse":{"x0":3.8,"x1":7.68,"roof_z":3.72,"roof_thickness":0.1,"window_top_z":3.62,"sill_z":3.0,"floor_z":1.55,"plan_roof_sb":[[3.8,1.45],[7.22,1.4],[7.66,0.5]],"plan_sill_sb":[[3.8,1.28],[6.9,1.243],[7.302,0.417]],"side_windows":[{"bottom_x":[4.15,5.45],"top_x":[4.8,5.45]},{"bottom_x":[5.55,6.9],"top_x":[5.55,7.22]}],"windshield":"3 tasoruutua. Yläreunat kansikuvannon katon etureunan kolmesta janasta: keskiruutu poikittain x 7,66 y +-0,50, reunaruudut (7,66 / +-0,50) -> (7,22 / +-1,40) viistossa taakse sivuille. Kaikki kallistuvat eteenpäin samassa kulmassa 30 astetta pystysuorasta (sivukuvanto: pohja x 7,25 ja yläreuna x 7,60 korkeudella 2,98 … 3,58), pohjareunat yläreunojen siirto taaksepäin 0,358 m, z 3,00 … 3,62","door":{"x":3.8,"y":0.0,"z0":2.0,"w":0.76,"h":1.6,"window_z0":3.07,"window_z1":3.55,"window_half":0.15,"side":"aft","note":"Ovi ohjaamon takaseinässä keskilinjalla peräkannelle. Kynnys 0,31 m kannen yläpuolella (kansi 1,69 kohdassa x 3,8), leveys 0,76 m (YJ peräkuvanto: karmi y -0,38 … +0,38), korkeus 1,60 m (karmin yläreuna z 3,60)"},"sar":{"x0":4.1,"x1":6.4,"zc":2.4,"h":0.75},"source":"YJ sivuprofiili, keulakuvanto ja kansikuvanto (katon ja ikkunavyöhykkeen ääriviivat, ikkunaruudut), peräkuvanto (ovi keskellä), perehdytysmateriaali s. 5 (ovi ohjaamoon takaseinässä keskilinjalla)"},"cabin_roof":{"x0":6.75,"x1":9.92,"plan_sb":[[6.75,0.45],[7.6,0.88],[9.92,0.4]],"z_aft":2.68,"z_fwd":2.46,"front_wall_to_deck":true,"source":"YJ sivuprofiili (vihreä katon viiva) ja kansikuvanto"},"mast":{"legs":[{"base":[4.5,0.27,3.72],"top":[3.8,0.12,5.38],"r":0.04},{"base":[3.93,0.0,3.72],"top":[3.32,0.0,5.38],"r":0.032}],"legs_mirrored_first_only":true,"platform_top":{"x0":3.28,"x1":4.08,"half":0.17,"z":5.38,"t":0.05},"radar":{"x0":3.62,"x1":4.3,"half":0.14,"z0":5.45,"z1":5.55,"pedestal_r":0.05},"rods":[{"x":3.45,"y":0.15,"z0":5.43,"z1":6.02,"r":0.012},{"x":3.45,"y":-0.15,"z0":5.43,"z1":5.8,"r":0.01}],"note":"Vaihe 1c: yksinkertaistettu piirustuksen mukaan. Taaksepäin kallistuva kolmijalka (kaksi etujalkaa y +-0,27 -> +-0,12 ja yksi takajalka keskilinjalla), pieni vaakataso, yksi tutka-antenni ja kaksi antennitankoa. Muut tikut, levyt, valonheittimet, haarukat poistettu","source":"YJ sivuprofiili (etujalan viiva x 4,5 -> 3,78 korkeudella 3,72 -> 5,30, takajalan viiva x 3,93 -> 3,28, taso z 5,38, tutka x 3,61 … 4,31 z 5,55 … 5,60, antennitanko x 3,45 z 6,02) ja peräkuvanto (jalkojen kapeneminen y 0,27 -> 0,12, tason leveys y +-0,15). Antennitankojen y-sijainti arvio"},"swim_platform":{"x0":-1.26,"x1":0.0,"half_at_x1":1.87,"half_at_x0":1.36,"z_top":1.24,"thickness":0.1,"jet_hatches":[{"x":-0.32,"y":0.84,"w":0.4,"l":0.48},{"x":-0.32,"y":-0.84,"w":0.4,"l":0.48}],"source":"KV lehti 19 (kansikuvanto, mittakaava 106,67 pt/m: pituus 1,25 m, leveys 3,74 m perapeilissa ja 2,72 m perareunassa), KV lehti 1 (z=1,243), YJ sivu- ja peräkuvanto. Jettien tarkastusluukut YJ ja KV 19 kansikuvannosta, perehdytysmateriaali s. 5"},"aft_deck":{"side_panels":{"x_ranges":[[0.0,1.2]],"y_in":1.84,"y_out":2.1,"top_z":2.47,"note":"Palokalustokaapit (vasen BB ja oikea SB, perehdytysmateriaali s. 5) laidan sisäpuolella, MERIPELASTUS-paneelit. Paikka ja pituus YJ ja KV 19 kansikuvanto (y 1,84 … 1,97 piirustuksen ääriviiva, mallissa 2,10 asti kaiteen alle), korkeus (z 2,47, kaiteen yläputken 2,577 alle) YJ ja KV 19 sivukuvanto"},"liferaft":{"x0":-0.22,"x1":0.15,"y0":1.3,"y1":1.84,"z0":1.69,"z1":2.49,"source":"KV 19 sivu-, kansi- ja peräkuvanto, perehdytysmateriaali s. 5 (pelastuslautta SB)"},"tow_box":{"poly":[[0.56,1.44],[1.09,1.17],[0.62,0.68],[0.3,1.02]],"h":0.45,"source":"YJ ja KV 19 kansikuvanto (vino laatikko SB, peilikuva moottoriruiskulaatikolle), perehdytysmateriaali s. 5 (hinausköysilaatikko SB). Korkeus arvio. Laatikossa piirustuksessa näkyvät kartiot (lähimmäs ankkurit tai fenderit) on jätetty pois"},"pump_box":{"poly":[[0.56,-1.44],[1.09,-1.17],[0.62,-0.68],[0.3,-1.02]],"h":0.45,"source":"YJ ja KV 19 kansikuvanto (vino laatikko BB), perehdytysmateriaali s. 5 (moottoriruiskulaatikko BB). Korkeus arvio"},"bollard":{"x":1.07,"y":0.0,"r":0.13,"h":0.42,"source":"YJ ja KV 19 kansikuvanto (pyöreä pollari syvennyksen päässä x=1,07), perehdytysmateriaali s. 5"},"vent_box":{"x0":3.06,"x1":3.818,"y0":0.55,"y1":1.381,"h":0.781,"source":"KV lehti 6 (tuuletuslaatikko 758 x 831 x 781 mm, säleikkö alaosassa, kaksi pyöreää aukkoa toisella sivulla, luukku kannessa), sijainti YJ ja KV 19 kansikuvanto (x 3,05 … 3,71, |y| 0,42 … 1,46) ja YJ sivukuvanto"},"bb_hatch":{"x0":3.17,"x1":3.71,"y0":-1.22,"y1":-0.72,"note":"Luukku konetilaan BB, saranoitu kansiluukku laatikon kannessa, saranat ohjaamon puolella"}},"jets":[{"y":-0.79,"z":0.62,"x0":-0.9,"x1":0.1,"r":0.22},{"y":0.79,"z":0.62,"x0":-0.9,"x1":0.1,"r":0.22}],"rails":{"top_z":2.577,"mid_z":1.95,"tube_r":0.02,"post_r":0.03,"swim_loop_sb":[[0.0,1.88],[-0.63,1.62],[-0.63,1.07],[0.73,0.54]],"side_rail_x":[0.0,2.55],"side_rail_y":2.07,"bow_rail":{"x0":10.3,"x1":11.433,"y":0.517,"z_top":3.054,"z_deck":2.278,"r_corner":0.12,"tube_r":0.021,"note":"Kaksi pystysuoraa kaidekehystä keulakannella laitojen sisäpuolella (YJ kansikuvanto: yläputket y +-0,517, x 10,30 … 11,43, YJ sivukuvanto: pylväät x 10,30 ja 11,43, yläputki z 3,054, pyöristetyt yläkulmat r 0,12)"},"note":"Ylä- ja keskiputki. Kaiteen yläpinta z=2,577 (KV 19: 1334,2 mm uimatason yläpinnasta 1,243). Uimatason kaidepylväät y=+-1,08 (KV 19 mitta 2160). Reitit YJ ja KV 19 kansikuvannosta, keulakehys sivukuvasta"},"bollard":{"x":1.07,"y":0.0,"note":"siirretty piirustuksen mukaan x=1,07 (aiemmin arvio x=1,9)"},"mushroom_vent_bb":{"x":1.54,"y":-1.51,"r":0.0975,"h":0.33,"base_r":0.2,"cap_r":0.15,"source":"YJ ja KV 19 kansikuvanto (kahdeksankulmainen jalusta x 1,54, y -1,51), halkaisija 195 mm ja korkeus 0,33 m käyttäjän tiedosta"},"side_panel_note_1d":"Vaihe 1d: laitapaneeli 2 (x 1,25 ... 2,45) ei ole laatikko vaan kaidekehys. Paneeli 1 (x 0 ... 1,20) pysyy laatikkona","d1d":{"trough":{"floor_z":1.468,"deck_x_end":1.2,"box_x_end":0.525,"contour_sb":[[0.0,0.97],[0.525,0.6],[0.848,0.358],[0.863,0.288],[0.946,0.232],[1.0,0.205],[1.02,0.185],[1.005,0.13],[0.994,0.09],[0.994,0.0]],"source":"KV 19 kansikuvanto (V-muotoinen kaukalo, seinäviivat y = -0,97 + 0,705 x; otsareunan aaltoileva ääriviiva x 0,85 … 1,02), KV 19 peräkuvanto (kolon leveys y +-0,97, pohja z 1,468, kansi 1,69), KV 1 CL-leikkaus (pohja z 1,46 … 1,49)"},"box":{"top_z":2.46,"cap_t":0.015,"x0":0.004,"top_bb":[[0.004,-1.84],[0.004,-1.049],[0.562,-0.653],[1.096,-1.404],[1.096,-1.84]],"base_bb":[[0.004,-1.84],[0.004,-0.956],[0.518,-0.591],[1.096,-1.404],[1.096,-1.84]],"lid_bb":[[0.316,-0.9],[0.332,-1.06],[0.552,-1.372],[0.698,-1.439],[1.011,-1.215],[0.631,-0.679]],"lid_hinges_bb":[[0.53,-1.4],[0.35,-0.85]],"door_bb":{"w0":0.105,"w1":0.56,"z0":1.8,"z1":2.42,"r":0.05,"hinge_z":[1.93,2.31]},"ball_pole_bb":{"x":0.2,"y":-1.207,"z1":2.85,"ball_r":0.028},"source":"KV 19 kansikuvanto (laatikon ääriviiva), peräkuvanto (korkeus z 2,46 = sivupaneelin yläpinta, vino seinä ja saranoitu ovi y -1,05 … -0,6, z 1,80 … 2,42, kuulapääsauva y -1,21 z 2,85), sivukuvanto (laatikon yläreuna z 2,46)"},"cleat":{"post_r":0.03,"post_h":0.19,"cap_r":0.05,"cap_t":0.012,"bar_r":0.02,"bar_h":0.12,"bar_len":0.32,"post_dx":0.0735,"tray_h":0.05,"tray_len":0.37,"tray_w":0.185,"aft_box":[[0.9025,-1.754,0.0],[0.9025,1.745,0.0]],"mid":[[3.5,-1.865,0.0],[3.5,1.865,0.0],[6.8,-1.865,0.0],[6.8,1.865,0.0]],"swim":[[-0.376,-1.64,-26.6],[-0.376,1.64,26.6]],"bow":[[10.824,-0.743,23.2],[10.79,0.733,-23.6]],"source":"KV 19 kansi- ja sivukuvanto (kaksoispollari: kaksi pystytappia, kansilevyt ja poikitanko, 0,19 m tarjottimen yläpuolella), KV 15 kansikuvanto (paikat 5 kpl per laita)"},"bollard":{"x":1.104,"head_r":0.106,"post_r":0.09,"top_z":1.887,"bar_z":1.833,"bar_half":0.2,"bar_r":0.021,"source":"KV 19 kansikuvanto (kansi r 0,106, tappi y +-0,20) ja peräkuvanto (kansi z 1,887, tappi z 1,833, varsi halkaisija 0,18)"},"oval_hatch":{"aft":{"cx":0.306,"floor_z":1.468,"ring_h":0.02,"grip_side":-1},"bow":{"cx":10.752,"ring_h":0.04,"grip_side":1},"open_half_u":0.2235,"open_half_v":0.334,"lid_scale":0.955,"outer":{"a_l":0.192,"a_r":0.435,"b":0.261,"cu":-0.082,"cv":0.11,"face_u":0.319,"cham_u":0.305,"cham_v":0.152},"grip":{"w":0.09,"half":0.21},"source":"KV 19 kansikuvanto 600 dpi (aluskehys x 0,03 … 0,63, y +-0,39, aukko 0,447 x 0,667, kahvakolo), KV 15 kansikuvanto (sama osa keulapiikissä, nimike 45)"},"trunk":{"roof_x0":7.002,"roof_z0":2.681,"roof_slope":0.078,"roof_half":0.36,"roof_x_front":9.64,"front_x":9.9,"base_sb":[[6.97,1.1],[9.5,0.665],[9.9,0.37]],"round_hatch":{"x":8.13,"r_out":0.375,"r_ring":0.3,"r_in":0.265,"r_open":0.24,"cowl_h":0.06},"rect_block":{"x0":8.587,"x1":9.656,"half":0.33,"h":0.17,"r":0.08,"latch":[9.66,9.72,0.04]},"handrail":{"a":[7.05,0.87],"b":[9.48,0.49],"r":0.015},"fill_plates":[[7.43,-0.76],[8.95,0.47]],"fill_r":0.11,"step_bars":{"x":7.42,"y":1.0,"len":0.36,"w":0.085,"h":0.03,"ang":11.6},"source":"KV 15 kansikuvanto (kohouman pohjaviiva, kattokaista y +-0,36, pyöreä luukku, suorakulmainen luukku, käsijohde, täyttölaipat, askelmat), YJ sivukuvanto (katon z 2,681 - 0,078 (x - 7,002)), YJ kansikuvanto"},"mast":{"source":"YJ sivukuvanto, keulakuvanto ja peräkuvanto 600 dpi"}}},"openings":[{"name":"Jetin tarkastusluukku BB","x":-0.32,"y":-0.84,"z":1.243,"w":0.4,"l":0.48,"type":"hatch","note":"uimatasossa"},{"name":"Jetin tarkastusluukku SB","x":-0.32,"y":0.84,"z":1.243,"w":0.4,"l":0.48,"type":"hatch","note":"uimatasossa"},{"name":"Konetilan huoltoluukku BB (pultattu)","x":2.108,"y":-0.803,"z":1.68,"w":1.096,"l":1.804,"type":"hatch","bolts":10,"note":"iso pultattu huoltoluukku, 10 pulttia (3+3+2+2), koko ja paikka mitattu kansikuvannosta (x 1,206 … 3,010, |y| 0,255 … 1,351)"},{"name":"Konetilan huoltoluukku SB (pultattu)","x":2.108,"y":0.803,"z":1.68,"w":1.096,"l":1.804,"type":"hatch","bolts":10,"note":"kuten BB"},{"name":"Luukku konetilaan BB (saranoitu)","x":3.44,"y":-0.97,"z":2.48,"zTop":2.48,"w":0.5,"l":0.54,"type":"hatch","note":"miesluukku, saranoitu kansiluukku tuuletuslaatikon tyyppisen laatikon kannessa ohjaamon takaseinän vieressä BB:llä. Käyttäjän arvio x 3,5 y -1,3, kansikuvannosta laatikon keskipiste y -1,0"},{"name":"Konetilan tuuletussieni BB","x":1.54,"y":-1.51,"z":1.72,"w":0.195,"l":0.195,"type":"vent","note":"sienituuletin halkaisija 195 mm, korkeus 0,33 m, 8-kulmainen jalusta"},{"name":"Konetilan tuuletuslaatikko BB","x":3.44,"y":-0.97,"z":2.48,"w":0.831,"l":0.758,"type":"vent","note":"korkeus 781 mm, kaksi pyöreää aukkoa perässä (KV 6), kannessa miesluukku"},{"name":"Konetilan tuuletuslaatikko SB","x":3.44,"y":0.97,"z":2.48,"w":0.831,"l":0.758,"type":"vent","note":"korkeus 781 mm, ilmanottosäleikkö alaosassa (KV 6)"},{"name":"Tankkitilan kulku","x":3.87,"y":null,"z":null,"type":"access","via":"konetila","visible_on_deck":false,"note":"tankkitilaan (x 3,87 … 6,63) kuljetaan konetilan kautta. Ei näy kannella eikä sitä ole mallinnettu geometriaan. Tarkka paikka laipiossa x 3,87 ei selviä piirustuksista"},{"name":"Ohjaamon kattoluukku BB","x":5.9,"y":-0.9,"z":3.72,"w":0.4,"l":0.45,"type":"hatch","note":"hätäpoistumistie"},{"name":"Ohjaamon kattoluukku SB","x":5.9,"y":0.9,"z":3.72,"w":0.4,"l":0.45,"type":"hatch","note":"hätäpoistumistie"},{"name":"Ohjaamon ovi","x":3.8,"y":0.0,"z":1.95,"w":0.76,"l":0.05,"type":"door","note":"takaseinässä keskellä"},{"name":"Kajuutan luukku (pyöreä)","x":8.15,"y":0.0,"z":2.52,"w":0.754,"l":0.754,"type":"hatch","note":"YJ kansikuvanto: kaksoisrengas, ulkoläpimitta 0,754 m, sisärengas 0,60 m, ristikahva. Kajuutan katolla"},{"name":"Kajuutan luukku (suorakaide)","x":9.13,"y":0.0,"z":2.48,"w":0.65,"l":1.04,"type":"hatch","note":"YJ kansikuvanto: x 8,61 … 9,65, y +-0,325, pyöristetyt kulmat. Kajuutan katolla"},{"name":"Keulapiikin luukku (soikea)","x":10.755,"y":0.0,"z":2.278,"w":0.77,"l":0.51,"zTop":2.278,"type":"hatch","note":"YJ kansikuvanto: soikea kehys x 10,50 … 11,01, y +-0,385. Kehyksen korkeus noin 0,04 m"},{"name":"Moottoriruiskulaatikko BB","x":0.7,"y":-1.08,"z":1.65,"w":0.5,"l":0.6,"type":"cabinet"},{"name":"Hinausköysilaatikko SB","x":0.62,"y":1.07,"z":1.65,"w":0.8,"l":0.8,"type":"cabinet"},{"name":"Vasen palokalustokaappi (BB)","x":1.22,"y":-1.97,"z":1.65,"w":0.26,"l":2.45,"type":"cabinet"},{"name":"Oikea palokalustokaappi (SB)","x":1.22,"y":1.97,"z":1.65,"w":0.26,"l":2.45,"type":"cabinet"},{"name":"Pelastuslautta SB","x":-0.04,"y":1.57,"z":1.69,"w":0.54,"l":0.37,"type":"cabinet"},{"name":"Jettitilan luukku (soikea, kaukalon pohjalla)","x":0.306,"y":0.0,"z":1.468,"w":0.774,"l":0.597,"type":"hatch_ring","note":"SOIKEA-LUUKKU-HAHMO (KV 15 nimike 45, 2 kpl, Luukku 2473-0002). Kehys 0,60 x 0,78 m, korkeus noin 0,02 m kaukalon pohjan yläpuolella (KV 19 peräkuvanto 600 dpi)"},{"name":"Hinauspollari (VETO-POLLARI)","x":1.104,"y":0.0,"z":1.69,"w":0.212,"l":0.212,"type":"fitting","note":"KV 19 kansikuvanto: kansi r 0,106, poikkitappi y +-0,20; peräkuvanto: kansilevyn yläpinta z 1,887, tappi z 1,833"}],"bulkheads":[1.13,3.87,6.63,9.94],"bulkheads_check":"KV lehti 1 keskilinjan leikkaus: laipiot x=1,13 / 3,857 / 6,612 / 9,92 (+-0,02)","waterline":{"Ta":0.942,"Tf":0.615,"L":11.9},"displacement_check":{"V_m3":14.135,"LCB_x":3.793,"target_m3":15.2,"diff_pct":-7.01},"source":"Yleisjärjestely 1354-2-1124-12209 (vektoripoiminta, mittakaava kalibroitu) ja Kuumavarustelu 1354-2-330-11986 lehdet 1, 4, 19 (tarkistus)"} };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Runko = api;
})(typeof window !== 'undefined' ? window : globalThis);
