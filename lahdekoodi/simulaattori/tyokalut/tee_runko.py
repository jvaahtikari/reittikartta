#!/usr/bin/env python3
"""Tuottaa js/runko.js:n Repan runkomallista (/home/claude/opetus/repa/hull3d.js ja hull_offsets.json).

Runkomallia ei mallinneta uudelleen. Skripti ottaa hull3d.js:n sellaisenaan ja tekee siihen vain nämä muutokset:
  1. koodi kääräistään funktioon Runko.build(THREE, HULLDATA, OPTS), joka palauttaa THREE.Group-olion (malli-koordinaatit x keulaan, y SB, z ylös,
     three.js:ssä (x, z, y)),
  2. hull3d.js:n oma renderer, scene, valot ja vesitaso poistetaan,
  3. ohjaamolle lisätään sisätilaversio (OPTS.interior): ikkunat auki ja vain karmit, lattia z 1,55 m, ohjauspöytä, katto säilyy,
  4. rakennuksen jälkeen geometriat yhdistetään materiaaleittain, jotta piirtokutsuja on vähän (OPTS.merge).
Aja uudelleen, jos hull3d.js tai hull_offsets.json muuttuu."""
import json, pathlib, re, sys

SRC = pathlib.Path('/home/claude/opetus/repa/hull3d.js')
OFF = pathlib.Path('/home/claude/opetus/repa/hull_offsets.json')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'js' / 'runko.js'

src = SRC.read_text(encoding='utf-8')
lines = src.split('\n')

def cut(start_marker, end_marker, replacement, text):
    a = text.index(start_marker)
    b = text.index(end_marker, a)
    return text[:a] + replacement + text[b:]

# 1. otsikko pois
src = src.replace('"use strict";', '', 1)
src = src.replace('const HULL = window.REPA_OFFSETS;', 'const HULL = HULLDATA;', 1)

# 2. renderer, scene, valot ja vesi pois, boat-ryhmä jää
src = cut("const canvas=document.getElementById('c');", "// ---------------------------------------------------------------------------------------------\n// Runko: loftattu pinta",
          "const boat=new THREE.Group();     // koko vene\n\n", src)
src = src.replace('  window.__buildOval=build;\n', '', 1)

# 3. sisätilaversio
INTERIOR = r'''
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
'''
a = src.index('(function wheelhouse(){')
src = src[:a] + INTERIOR + '(OPTS.interior ? INTERIOR_WH : function wheelhouse(){' + src[a + len('(function wheelhouse(){'):]

# 4. paluuarvo ja geometrioiden yhdistäminen
MERGE = r'''
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
'''

body = src.rstrip() + '\n' + MERGE
header = '''/* js/runko.js: Repan runkomalli. TUOTETTU tiedostosta tyokalut/tee_runko.py (hull3d.js + hull_offsets.json). Älä muokkaa käsin.
 * Käyttö: const r = Runko.build(THREE, Runko.DATA, {interior:true, merge:true}); r.boat on THREE.Group (malli: x keulaan, y SB, z ylös, three.js:ssä (x, z, y)).
 * Alkuperäisestä hull3d.js:stä on poistettu vain renderer, scene, valot ja vesitaso. Ohjaamolle on lisätty sisätilaversio. */
(function (root) {
'use strict';
function build(THREE, HULLDATA, OPTS) {
OPTS = OPTS || {};
'''
footer = '''
}
var api = { build: build, DATA: %s };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Runko = api;
})(typeof window !== 'undefined' ? window : globalThis);
''' % json.dumps(json.loads(OFF.read_text(encoding='utf-8')), separators=(',', ':'), ensure_ascii=False)
OUT.write_text(header + body + footer, encoding='utf-8')
print(OUT, OUT.stat().st_size, 'tavua')
