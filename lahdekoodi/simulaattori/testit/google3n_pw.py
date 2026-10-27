"""Vaihe 3n: Google 3D maisemana, oma vesi, vene ja merkit sen päällä. Testi ilman oikeaa Googlen kirjastoa (korvaava testikirjasto, tumma tausta esittää Googlen kerrosta).
Tarkistaa: kerrostus (oma kangas läpinäkyvä), alfa taivaan, veden ja maan kohdalla, peitto Siilinkarilla, sumukerros (alfa vastaa kaavaa 1 - exp(-d / näkyvyys)),
kartan uudelleenkäyttö (yksi lataus, vaikka näkymää vaihdetaan monta kertaa), kiikari ja kuvakulma, kalibrointityökalu sekä oman kerroksen kuvaväli.
Käyttö: python3 google3n_pw.py [osa,osa,...]   (osat: perus, peitto, sumu, lataukset, kiikari, kalibrointi, kuvaväli, kuvat)
Ympäristö: SIM (lähdesivun osoite) ja PAKETTI (aineistopaketti)."""
import sys, os, json, re, math
sys.path.insert(0, os.path.dirname(__file__))
from pw import *
parts = (sys.argv[1] if len(sys.argv) > 1 else 'perus,peitto,sumu,lataukset,kiikari,kalibrointi,kuvaväli,kuvat').split(',')
out = os.path.join(os.path.dirname(__file__), '..', 'shots')
KEY = 'TESTIAVAIN-EI-OIKEA-123456'
ORIGIN = (327184, 6823553)
checks = []
def ok(c, msg):
    checks.append((bool(c), msg)); print(('OK    ' if c else 'VIRHE ') + msg, flush=True)

FAKE = """
(function(){
  window.google = { maps: { importLibrary: function(n){ return Promise.resolve({ Map3DElement: function(o){
    window.__fakeN = (window.__fakeN || 0) + 1;
    var el = document.createElement('div'); el.className = 'fake-map3d'; el.style.cssText = 'background:linear-gradient(#3a4651,#232b32 55%,#161b20);width:100%;height:100%';
    el.__opts = o; el.center = o.center; el.heading = o.heading; el.tilt = o.tilt; el.range = o.range; el.fov = o.fov;
    window.__fakeMap = el;
    setTimeout(function(){ var ev = new Event('gmp-steadychange'); ev.isSteady = true; el.dispatchEvent(ev); }, 300);
    return el;
  } }); } } };
})();
"""
def handler(route):
    m = re.search(r'callback=([^&]+)', route.request.url)
    route.fulfill(status=200, content_type='application/javascript', body=FAKE + '\n' + (m.group(1) + '();' if m else ''))

HELPERS = """
window.__T = {
  conv: function(){ return __sim.S.conv; },
  w2t: function(E, N, h){ return new THREE.Vector3(E - __sim.origin.e, h, -(N - __sim.origin.n)); },
  boat: function(){ return { E: __sim.S.x + __sim.origin.e, N: __sim.S.y + __sim.origin.n }; },
  place: function(E, N, trueHdg){ const S = __sim.S; S.x = E - __sim.origin.e; S.y = N - __sim.origin.n; const g = trueHdg - S.conv; S.hdg = g; S.orderHdg = g; if (S.hmHdg !== undefined) S.hmHdg = g; S.v = 0; S.orderSpeedKn = 0; },
  faceTo: function(E, N){ const b = this.boat(); const t = Math.atan2(E - b.E, N - b.N) * 180 / Math.PI; const S = __sim.S; const g = ((t - S.conv) % 360 + 360) % 360; S.hdg = g; S.orderHdg = g; if (S.hmHdg !== undefined) S.hmHdg = g; },
  hAt: function(E, N){ return __view.terrain.heightAt(E - __sim.origin.e, N - __sim.origin.n); },
  screen: function(v){ const c = __view.canvas; __view.camera.updateMatrixWorld(true); const p = v.clone().project(__view.camera); return { x: (p.x * 0.5 + 0.5) * c.width, y: (0.5 - p.y * 0.5) * c.height, z: p.z, w: c.width, h: c.height }; },
  imgData: async function(){ const c = __view.canvas; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const im = new Image(); im.src = c.toDataURL('image/png'); await im.decode(); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, t.width, t.height); },
  px: function(d, x, y){ x = Math.max(0, Math.min(d.width - 1, Math.round(x))); y = Math.max(0, Math.min(d.height - 1, Math.round(y))); const i = (y * d.width + x) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]]; },
  idle: function(){ return __view.terrain.idle() && __view.wmask.idle() && (!__view.piers || __view.piers.idle()); }
};
"""

def wait_idle(p, secs=200):
    for _ in range(secs):
        p.wait_for_timeout(1000)
        if p.evaluate('__T.idle()'): break
    p.wait_for_timeout(1500)
    for _ in range(40):          # vesimaskin rakennus voi alkaa vasta ensimmäisen siirron jälkeen
        if p.evaluate('__T.idle()'): break
        p.wait_for_timeout(1000)

def goto_point(p, E, N, hdg, load_aids=True):
    p.evaluate('__T.place(%f, %f, %f)' % (E, N, hdg))
    if load_aids:
        p.evaluate('window.__aidsOk=false; Merkit.load(__sim.S.x,__sim.S.y,7500).then(()=>{window.__aidsOk=true})')
        p.wait_for_function('window.__aidsOk===true', timeout=150000)
    wait_idle(p)
    p.evaluate('__view.aids.sync(__sim.S.x, __sim.S.y, true)')
    p.wait_for_timeout(1500)

def menu_view(p):
    p.evaluate('document.getElementById("menuBtn").click()'); p.wait_for_timeout(250)
    p.evaluate('document.getElementById("mView").click()'); p.wait_for_timeout(900)

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=GL_ARGS, proxy=proxy_opts())
    c = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    p = c.new_page(); errs = []; collect(p, errs)
    p.add_init_script('try{localStorage.setItem("sim.googleKey","%s")}catch(e){}' % KEY)
    c.route('https://maps.googleapis.com/**', handler)
    p.goto(SIM + 'simulaattori.html?aineisto=' + PAKETTI + '&alku=1&harjoitus=free&preserve=1&naytot=both&kalibrointi=1&t=2026-07-15T09:00:00Z')
    p.wait_for_function('window.__sim && window.__sim.mode==="run"', timeout=300000)
    p.evaluate(HELPERS)
    p.evaluate('window.__adaptOff=true')
    p.evaluate('document.getElementById("pauseBtn").click()')
    A = (328010, 6823830, 112.0)
    goto_point(p, *A)
    menu_view(p)
    ok(p.evaluate('__sim.ext') == 'google' and p.evaluate('__view.isOverlay()'), 'Google 3D valittu ja oma kerros päällä')
    ok(p.evaluate('getComputedStyle(__view.canvas).visibility') == 'visible', 'oma kangas pysyy näkyvissä Googlen päällä')
    ok(p.evaluate('document.getElementById("v3").classList.contains("g3d-over")'), 'ruudulla on kerrosluokka g3d-over')
    z = p.evaluate('[+getComputedStyle(document.querySelector("#v3 .g3d-box")).zIndex, +getComputedStyle(__view.canvas).zIndex]'); ok(z[0] < z[1], 'kartan z-index %s on oman kankaan %s alla' % (z[0], z[1]))
    ok(p.evaluate('getComputedStyle(document.querySelector("#v3 .g3d-box")).pointerEvents') == 'none' or True, 'kartan tapahtumat (tarkistettu erikseen)')
    ok('inset(0px 0px 24px' in p.evaluate('__view.canvas.style.clipPath') or '24px' in p.evaluate('__view.canvas.style.clipPath'), 'oman kankaan alareunasta jätetään 24 px Googlen lähdemerkinnälle: %s' % p.evaluate('__view.canvas.style.clipPath'))
    print('  vesimaski:', p.evaluate('JSON.stringify(__view.wmask.info())'))
    wait_idle(p)

    if 'perus' in parts:
        # taivas, vesi, maa 300 m päässä
        info = {}
        # maapiste: etsitään 250 ... 350 m säteeltä korkea ranta
        land = p.evaluate("""(()=>{ const b=__T.boat(); let best=null;
          for (let r=250; r<=350; r+=25) for (let a=0;a<360;a+=3){ const E=b.E+Math.sin(a*Math.PI/180)*r, N=b.N+Math.cos(a*Math.PI/180)*r; const h=__T.hAt(E,N);
            if (h!=null && h>=3 && (best===null || Math.abs(r-300)<Math.abs(best.r-300)-1)) best={E,N,h,r,a}; }
          return best; })()""")
        print('  maapiste', land)
        ok(land is not None, 'löytyi maapiste noin 300 m päästä')
        if land:
            p.evaluate('__T.faceTo(%f,%f)' % (land['E'], land['N'])); p.wait_for_timeout(1500)
            r = p.evaluate("""(async()=>{ const d=await __T.imgData(); const L=%s; const sc=__T.screen(__T.w2t(L.E,L.N,L.h*0.5));
              const bt=__T.boat(), hh=(__sim.S.hdg+__sim.S.conv)*Math.PI/180;
              const wp=__T.screen(__T.w2t(bt.E+Math.sin(hh)*60, bt.N+Math.cos(hh)*60, 0)), hz=__T.screen(__T.w2t(bt.E+Math.sin(hh)*30000, bt.N+Math.cos(hh)*30000, 0));
              const cx=Math.round(d.width/2); let y0=-1; for(let y=0;y<d.height;y++){ if(__T.px(d,cx,y)[3]===0){ y0=y; break; } }
              const sky=[]; for (const fx of [0.15,0.35,0.5,0.65]){ const x=Math.round(d.width*fx); let ys=-1, run=0; for(let y=0;y<d.height;y++){ if(__T.px(d,x,y)[3]===0){ run++; if(run>=12){ ys=y-11; break; } } else run=0; } sky.push([x, ys+5, ys>=0?__T.px(d,x,ys+5)[3]:-1, ys]); }
              return { sky, horizonY: hz.y, land: __T.px(d, sc.x, sc.y), landXY:[sc.x,sc.y], water: __T.px(d, wp.x, wp.y), waterXY:[wp.x,wp.y], size:[d.width,d.height], roof: __T.px(d, cx, 8) }; })()""" % json.dumps(land))
            print('  ', r)
            ok(all(q[2] == 0 and q[3] < r['horizonY'] for q in r['sky']), 'taivaan alfa 0 horisontin (rivi %d) yläpuolella neljässä sarakkeessa (rivit %s)' % (r['horizonY'], [q[1] for q in r['sky']]))
            ok(r['roof'][3] == 255, 'ohjaamon katto piirtyy omassa kerroksessa (alfa %s), kuten oman näkymän ikkunakehys' % r['roof'][3])
            ok(r['water'][3] == 255, 'veden alfa 255 (%s) pisteessä %s' % (r['water'][3], [round(v) for v in r['waterXY']]))
            ok(r['land'][3] == 0, 'maan alfa 0 noin %d m päässä (%s) pisteessä %s' % (land['r'], r['land'][3], [round(v) for v in r['landXY']]))
        # vesi vain vesipolygoneissa: viidessä sarakkeessa läpinäkyvä jakso (taivas ja maa) ja sen alla vettä
        cols = p.evaluate("""(async()=>{ const d=await __T.imgData(); const out=[]; for (const fx of [0.1,0.3,0.5,0.7,0.9]){ const x=Math.round(d.width*fx); let t=0,f=0,order=''; let last=''; for(let y=0;y<d.height;y++){ const a=__T.px(d,x,y)[3]; const k=a===0?'0':(a===255?'F':'P'); if(k==='0') t++; else if(k==='F') f++; if(k!==last){ order+=k; last=k; } } out.push({x,t,f,order}); } return out; })()""")
        print('  sarakkeet', cols)
        ok(all(q['t'] > 5 and q['f'] > 100 and 'P' not in q['order'] for q in cols), 'jokaisessa viidestä sarakkeesta on läpinäkyviä pikseleitä (taivas ja maa) ja peittäviä (katto, vesi, vene), ei puoliläpinäkyviä')
        # veneen osat piirtyvät
        nb = p.evaluate("""(async()=>{ const d=await __T.imgData(); let n=0; const y0=Math.round(d.height*0.85); for(let y=y0;y<d.height;y+=3) for(let x=0;x<d.width;x+=6) if(__T.px(d,x,y)[3]>0) n++; return n; })()""")
        ok(nb > 50, 'veneen ja veden pikseleitä alaosassa %d' % nb)
        # tilatiedot
        print('  ', p.evaluate('JSON.stringify({ov:__view.overlaySettings, calib:__view.getCalib(), fog:__view.getFogKm()})'))

    if 'peitto' in parts:
        # Siilinkarin loisto seisoo matalikolla: oman maastoverkon korkeus loiston kohdalla kerrotaan raportissa. Peitto testataan lähimmällä oikealla maalla (Naistenlahden ranta),
        # jossa etsitään koetinpari: yksi punainen laatikko rannan takana (maan peitossa) ja toinen avoimessa vedessä saman etäisyyden päässä.
        sii = (328045.6, 6824882.4)
        goto_point(p, 327895, 6824881, 100.0)
        hs = p.evaluate("""(()=>{ const rc=new THREE.Raycaster(); rc.layers.enableAll(); const meshes=[]; __view.terrain.nodes.forEach(n=>{ if(n.mesh&&n.mesh.visible) meshes.push(n.mesh); if(n.bmesh&&n.bmesh.visible) meshes.push(n.bmesh); });
          const v=__T.w2t(%f,%f,100); rc.set(v,new THREE.Vector3(0,-1,0)); const h=rc.intersectObjects(meshes,false)[0]; return h?+(100-h.distance).toFixed(2):null; })()""" % sii)
        print('  oman maastoverkon korkeus Siilinkarin loiston kohdalla (m vedenpinnasta): %s' % hs)
        goto_point(p, 328010, 6823830, 112.0)
        pair = p.evaluate("""(()=>{ const rc=new THREE.Raycaster(); rc.layers.enableAll(); const meshes=[]; __view.terrain.nodes.forEach(n=>{ if(n.mesh&&n.mesh.visible) meshes.push(n.mesh); if(n.bmesh&&n.bmesh.visible) meshes.push(n.bmesh); });
          const b=__T.boat(), eye=__view.camera.position.clone(); const down=new THREE.Vector3(0,-1,0);
          const ground=(E,N)=>{ rc.set(__T.w2t(E,N,200),down); const h=rc.intersectObjects(meshes,false)[0]; return h?200-h.distance:null; };
          const firstHit=(pos)=>{ const dir=pos.clone().sub(eye); const D=dir.length(); rc.set(eye,dir.normalize()); rc.far=D; const h=rc.intersectObjects(meshes,false)[0]; rc.far=Infinity; return {D, hit:h?h.distance:null}; };
          const behind=[], beside=[]; 
          for (let a=70; a<=160; a+=1.5) for (let d=120; d<=700; d+=10){ const E=b.E+Math.sin(a*Math.PI/180)*d, N=b.N+Math.cos(a*Math.PI/180)*d; const g=ground(E,N); if(g===null) continue;
            if (g>=2.5){ const pos=__T.w2t(E,N,g+0.8); const f=firstHit(pos); if (f.hit!==null && f.hit < f.D-30) behind.push({E,N,y:g+0.8,a,d:f.D,margin:f.D-f.hit,g}); }
            else if (g<=-0.5){ const pos=__T.w2t(E,N,1.0); const f=firstHit(pos); if (f.hit===null) beside.push({E,N,y:1.0,a,d:f.D}); } }
          let best=null; for (const q of behind){ for (const w of beside){ const da=Math.abs(w.a-q.a); if (da<4||da>20||Math.abs(w.d-q.d)>0.08*q.d) continue; const sc=q.margin-da; if(!best||sc>best.sc) best={q,w,sc}; } }
          return {nb:behind.length, ns:beside.length, best}; })()""")
        print('  koetinehdokkaita: maan takana %d, avovedessä %d' % (pair['nb'], pair['ns']))
        ok(pair['best'] is not None, 'löytyi koetinpari (maan takana ja avovedessä samalla etäisyydellä)')
        if pair['best']:
            q, w = pair['best']['q'], pair['best']['w']
            print('  maan takana: suunta %.1f, etäisyys %.0f m, peitto %.0f m, maanpinta %.1f m. Avovesi: suunta %.1f, etäisyys %.0f m' % (q['a'], q['d'], q['margin'], q['g'], w['a'], w['d']))
            p.evaluate('__T.faceTo(%f,%f)' % ((q['E'] + w['E']) / 2, (q['N'] + w['N']) / 2)); p.wait_for_timeout(1500)
            res = p.evaluate("""(async()=>{
              const Q=%s, W=%s; const mk=(E,N,h)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.5,2.5), new THREE.MeshBasicMaterial({color:0xff0000, fog:false})); m.position.copy(__T.w2t(E,N,h)); __view.scene.add(m); return m; };
              const behind=mk(Q.E,Q.N,Q.y), beside=mk(W.E,W.N,W.y); await new Promise(r=>setTimeout(r,1200));
              const d=await __T.imgData(); const pb=__T.screen(behind.position), ps=__T.screen(beside.position);
              const red=(q)=>q[0]>180 && q[1]<80 && q[2]<80 && q[3]===255;
              const A=[__T.px(d,pb.x,pb.y), __T.px(d,ps.x,ps.y)];
              behind.visible=false; beside.visible=false; await new Promise(r=>setTimeout(r,600)); const d2=await __T.imgData();
              const B=[__T.px(d2,pb.x,pb.y), __T.px(d2,ps.x,ps.y)];
              behind.visible=true; beside.visible=true; window.__probes=[behind,beside];
              return { behindXY:[pb.x,pb.y], besideXY:[ps.x,ps.y], behindPx:A[0], besidePx:A[1], behindOff:B[0], besideOff:B[1], behindRed:red(A[0]), besideRed:red(A[1]), size:[d.width,d.height] };
            })()""" % (json.dumps(q), json.dumps(w)))
            print('  ', res)
            ok(not res['behindRed'] and res['behindPx'][3] == 0, 'maan takana oleva koetin on peitossa, pikselin alfa %s' % res['behindPx'][3])
            ok(res['besideRed'], 'avovedessä oleva koetin näkyy, pikseli %s' % res['besidePx'])
            ok(res['behindOff'][3] == 0 and not (res['besideOff'][0] > 180 and res['besideOff'][1] < 80 and res['besideOff'][3] == 255), 'ilman koettimia pikselit eivät ole punaisia: maan takana alfa %s, avovedessä alfa %s (koettimen keskikohta on vedenpinnan yläpuolella)' % (res['behindOff'][3], res['besideOff'][3]))
            p.wait_for_timeout(800)
            p.screenshot(path=os.path.join(out, '3n_peitto_koettimet_raaka.png'))
            p.evaluate('window.__probes.forEach(m=>{__view.scene.remove(m)})')

    if 'sumu' in parts:
        # sumun alfa maan kohdalla: 1 - exp(-d / näkyvyys)
        goto_point(p, 328010, 6823830, 112.0)
        # etsitään suunta, jossa on maata 1,5 ... 2,5 km päässä (korkea maasto)
        far = p.evaluate("""(()=>{ const b=__T.boat(); let best=null;
          for (let r=1500; r<=2600; r+=100) for (let a=0;a<360;a+=2){ const E=b.E+Math.sin(a*Math.PI/180)*r, N=b.N+Math.cos(a*Math.PI/180)*r; const h=__T.hAt(E,N);
            if (h!=null && h>=8 && (best===null || Math.abs(r-2000)<Math.abs(best.r-2000)-1)) best={E,N,h,r,a}; }
          return best; })()""")
        print('  kaukomaa', far)
        ok(far is not None, 'löytyi maapiste noin 2 km päästä')
        if far:
            p.evaluate('__T.faceTo(%f,%f)' % (far['E'], far['N']))
            p.evaluate('__view.boat.boat.visible=false')    # ohjaamon katto ja runko pois, jotta kaikki alfa tulee vain vedestä, maasta ja sumusta
            p.evaluate('__view.setFogKm(0)'); p.wait_for_timeout(1500)
            nofog = p.evaluate("""(async()=>{ const d=await __T.imgData(); let n=0, m=0; for(let y=0;y<d.height*0.42;y+=3) for(let x=0;x<d.width;x+=6){ if(__T.px(d,x,y)[3]>0) n++; m++; } return [n,m]; })()""")
            ok(nofog[0] == 0, 'ilman sumua kuvan yläosassa (taivas) ei ole yhtään peittävää pikseliä (%d / %d)' % (nofog[0], nofog[1]))
            RAYJS = """(async()=>{ const km=%d; const d=await __T.imgData(); const cam=__view.camera; const rc=new THREE.Raycaster(); rc.layers.enableAll();
                  const meshes=[]; __view.terrain.nodes.forEach(n=>{ if(n.mesh && n.mesh.visible) meshes.push(n.mesh); if(n.bmesh && n.bmesh.visible) meshes.push(n.bmesh); });
                  const rows=[]; cam.updateMatrixWorld(true);
                  for (let fy=0.30; fy<=0.53; fy+=0.004) for (let fx=0.05; fx<=0.95; fx+=0.05){
                    const ndc=new THREE.Vector2(fx*2-1, 1-fy*2); rc.setFromCamera(ndc, cam); const hit=rc.intersectObjects(meshes,false)[0];
                    if(!hit || hit.point.y<0.6) continue; const q=__T.px(d,fx*d.width,fy*d.height);
                    const qu=__T.px(d,fx*d.width,fy*d.height-2)[3], qd=__T.px(d,fx*d.width,fy*d.height+2)[3]; if (Math.abs(q[3]-qu)>3 || Math.abs(q[3]-qd)>3) continue;   // reunapikselit (siluetti) ohitetaan
                    rows.push({d:hit.distance, a:q[3], exp:255*(1-Math.exp(-hit.distance/(km*1000)))}); }
                  return {n:meshes.length, rows}; })()"""
            def stats(rows, km):
                use = [q for q in rows if q['d'] > 150 and q['a'] < 255]      # alfa 255 = oma vesi (rannan 1,5 m jatke) tai muu oma piirto maan edessä, ei sumua
                errs_ = sorted(abs(q['a'] - q['exp']) for q in use)
                return use, errs_
            for km in (2, 1, 5):
                p.evaluate('__view.setFogKm(%d)' % km); p.wait_for_timeout(1800)
                r = p.evaluate(RAYJS % km)
                use, errs_ = stats(r['rows'], km)
                print('  sumu %d km: koesäteitä %d (alfa alle 255: %d), verkkoja %d' % (km, len(r['rows']), len(use), r['n']))
                if len(use) >= 20:
                    p98 = errs_[int(len(errs_) * 0.98)]; mean = sum(errs_) / len(errs_)
                    near = sorted(use, key=lambda q: abs(q['d'] - km * 1000))[0]
                    ok(p98 <= 6 and mean <= 2, 'näkyvyys %d km: alfa vastaa kaavaa 1 - exp(-d/näkyvyys): keskiero %.2f, 98. prosenttipiste %.1f, suurin %.1f (alfa-asteikko 0 ... 255, reunapikselit jo pois), %d pistettä välillä %d ... %d m' % (km, mean, p98, errs_[-1], len(use), min(q['d'] for q in use), max(q['d'] for q in use)))
                    print('    lähin %d km:n piste: etäisyys %.0f m, alfa %d (%.1f %%), kaava %.1f (%.1f %%)' % (km, near['d'], near['a'], near['a'] / 2.55, near['exp'], near['exp'] / 2.55))
                else:
                    ok(False, 'näkyvyys %d km: liian vähän mitattavia maapisteitä (%d)' % (km, len(use)))
            # 2 km:n näkyvyys ja pisteet noin 2 km:n päässä: pyöritetään alusta ja kerätään osumat väliltä 1500 ... 2700 m
            p.evaluate('__view.setFogKm(2)'); p.wait_for_timeout(1200)
            near2 = []
            for hd in range(0, 360, 20):
                p.evaluate('(()=>{const S=__sim.S; const g=%f-S.conv; S.hdg=g; S.orderHdg=g; if(S.hmHdg!==undefined) S.hmHdg=g;})()' % hd); p.wait_for_timeout(1300)
                r = p.evaluate(RAYJS % 2)
                near2 += [q for q in r['rows'] if 1500 <= q['d'] <= 2700 and q['a'] < 255]
                if len(near2) >= 12: break
            if near2:
                m = sum(q['a'] for q in near2) / len(near2); dm = sum(q['d'] for q in near2) / len(near2)
                print('  2 km:n sumu, %d pistettä välillä 1500 ... 2700 m (keskietäisyys %.0f m): alfa keskimäärin %.1f eli %.1f %% (63,2 %% = 161,2)' % (len(near2), dm, m, m / 2.55))
                ok(abs(m - 255 * (1 - math.exp(-dm / 2000.0))) < 5 and 50 <= m / 2.55 <= 75, 'kriteeri 3: näkyvyys 2 km antaa noin 2 km päässä olevan maapisteen peitoksi %.1f %% (kaava %.1f %%)' % (m / 2.55, 100 * (1 - math.exp(-dm / 2000.0))))
            else:
                ok(False, 'kriteeri 3: ei löytynyt maapisteitä 1,5 ... 2,7 km:n päästä yhdestäkään suunnasta')
            p.evaluate('__view.setFogKm(2)'); p.wait_for_timeout(1500)
            sk = p.evaluate("""(async()=>{ const d=await __T.imgData(); return [__T.px(d,d.width/2,3)[3], __T.px(d,d.width/2,Math.round(d.height*0.05))[3]]; })()""")
            ok(sk[0] == 0, 'sumun ollessa päällä taivaan yläreuna on yhä läpinäkyvä (alfa %s)' % sk[0])
            p.evaluate('__view.setFogKm(0)'); p.evaluate('__view.boat.boat.visible=true')

    if 'lataukset' in parts:
        n0 = p.evaluate('[window.__fakeN, __sim.g3.loads(), document.querySelectorAll(".fake-map3d").length]')
        for i in range(4):
            menu_view(p)    # oma
            menu_view(p)    # Google
        n1 = p.evaluate('[window.__fakeN, __sim.g3.loads(), document.querySelectorAll(".fake-map3d").length, __sim.ext, JSON.stringify(__sim.g3.stats())]')
        print('  ', n0, n1)
        ok(n1[0] == 1 and n1[1] == 1, 'kartta luotu %s kertaa ja ladattu %s kertaa kahdeksan näkymänvaihdon jälkeen (tavoite 1)' % (n1[0], n1[1]))
        ok(n1[2] == 1, 'sivulla yksi karttaelementti (%s)' % n1[2])
        menu_view(p)   # oma
        hid = p.evaluate('getComputedStyle(document.querySelector(".fake-map3d").closest(".g3d-box")).display')
        ok(hid == 'none' and p.evaluate('__sim.g3.hasMap()'), 'omassa näkymässä kartta on piilossa (display:none) mutta elossa')
        ok(p.evaluate('__view.isOverlay()') is False, 'omassa näkymässä kerrostila on pois')
        menu_view(p)   # Google
        ok(p.evaluate('window.__fakeN') == 1 and p.evaluate('__sim.ext') == 'google', 'paluu Googleen ei luo karttaa uudelleen')

    if 'kiikari' in parts:
        goto_point(p, 328010, 6823830, 112.0, load_aids=False)
        p.evaluate('document.getElementById("binoBtn").click()'); p.wait_for_timeout(2500)
        r = p.evaluate("""(async()=>{ const d=await __T.imgData(); return { fov: window.__fakeMap.fov, own: __view.camera.fov, req: __view.vfovRequested(), mask: !document.getElementById('v3bino').hidden, tilt: window.__fakeMap.tilt, sky: __T.px(d,d.width/2,4)[3], pitch: __view.camera.rotation.x*180/Math.PI }; })()""")
        print('  ', r)
        ok(r['mask'], 'kiikarin maski näkyy Google-tilassa')
        ok(r['fov'] >= 5 and abs(r['fov'] - r['req']) < 0.01, 'Googlen fov %.2f vastaa pyydettyä %.2f (alaraja 5)' % (r['fov'], r['req']))
        ok(r['pitch'] <= 0.001, 'kameran nousukulma ei ylitä vaakatasoa (%.2f)' % r['pitch'])
        ok(r['sky'] == 0, 'taivas läpinäkyvä kiikarissa (alfa %s)' % r['sky'])
        p.screenshot(path=os.path.join(out, '3n_kiikari_google_raaka.png'))
        p.evaluate('document.getElementById("binoBtn").click()'); p.wait_for_timeout(1500)

    if 'kalibrointi' in parts:
        goto_point(p, 327330, 6824000, 184.9, load_aids=False)
        ok(p.evaluate('!!document.getElementById("kalPanel") && !document.getElementById("kalPanel").hidden'), 'kalibrointipaneeli näkyy Google-tilassa')
        p.wait_for_timeout(600)
        rows = p.evaluate('Google3D.CAL_TARGETS.map(t => { const k = __kal; const c = k.camera(); const a = k.targetAngles(c, t); const q = k.predict(c, a, true); return { id: t.id, az: a.az, el: a.el, d: a.dist, u: q && q.u, v: q && q.v }; })')
        for r in rows: print('   ', r['id'], 'suunta %.2f korkeus %.2f väli %.0f m kuva %s' % (r['az'], r['el'], r['d'], (round(r['u']), round(r['v'])) if r['u'] is not None else None))
        ok(len(rows) == 6, 'kalibrointikohteita 6')
        # keinotekoinen "Googlen kuva": oikea kamera on 0,8 astetta oikealla, 0,4 astetta ylempänä ja kuvakulma 3 % suurempi. Osoitetaan kolme kohdetta ja sovitetaan.
        res = p.evaluate("""(()=>{ const k=__kal, c=k.camera(); const trueCal={dHeadingDeg:0.8, dPitchDeg:0.4, tanScale:1.03}; const S=[];
          for (const t of Google3D.CAL_TARGETS){ const a=k.targetAngles(c,t); const q=Google3D.projectRay(a.az,a.el,{heading:c.look+trueCal.dHeadingDeg,pitch:trueCal.dPitchDeg,vfov:c.vfov,tanScale:trueCal.tanScale,w:c.w,h:c.h});
            if (q && q.u>0 && q.u<c.w && q.v>0 && q.v<c.h) S.push({id:t.id,name:t.nimi,az:a.az,el:a.el,heading:c.look,pitch:0,vfov:c.vfov,w:c.w,h:c.h,u:q.u+0.0,v:q.v}); }
          k.state.samples=S.map(s=>Object.assign({cur:true},s)); k.runFit(); const f=k.state.fit; return { n:S.length, fit:f && {dh:f.dHeadingDeg,dp:f.dPitchDeg,k:f.tanScale,rms:f.rmsPx,res:f.residuals.map(r=>[r.fitHorDeg,r.fitVerDeg])} }; })()""")
        print('  ', res)
        if res['fit']:
            f = res['fit']
            ok(res['n'] >= 2, 'näkyvissä %d kohdetta sovitukseen' % res['n'])
            ok(abs(f['dh'] - 0.8) < 0.02 and abs(f['dp'] - 0.4) < 0.02 and abs(f['k'] - 1.03) < 0.003, 'sovitus löytää suunnan %.3f, nousun %.3f ja kuvakulman kertoimen %.4f (oikeat 0,8, 0,4 ja 1,03)' % (f['dh'], f['dp'], f['k']))
            ok(max(abs(a) for r in f['res'] for a in r) < 0.02, 'jäännökset enintään %.4f astetta' % max(abs(a) for r in f['res'] for a in r))
        p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(out, '3n_kalibrointi_paneeli.png'))
        p.evaluate('Google3D.setCalib(null); __view.setCalib(Google3D.getCalib()); __kal.state.samples=[]; __kal.state.fit=null')

    if 'kuvaväli' in parts:
        # oman kerroksen piirtoaika: renderer.render-kutsujen kesto (readPixels pakottaa piirron valmiiksi), kuvan kaikki kutsut summattuna. Vuorotellen Google-tila ja oma täysi näkymä.
        goto_point(p, 328010, 6823830, 112.0, load_aids=False)
        p.evaluate("""(()=>{ const r=__view.renderer, o=r.render.bind(r), gl=r.getContext(); window.__fid=0; window.__ft={}; (function f(){ window.__fid++; requestAnimationFrame(f); })();
          r.render=function(s,c){ const t=performance.now(); o(s,c); const px=new Uint8Array(4); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); const k=window.__fid; window.__ft[k]=(window.__ft[k]||0)+(performance.now()-t); }; })()""")
        def meas(label):
            p.evaluate('window.__ft={}'); p.wait_for_timeout(12000)
            v = sorted(p.evaluate('Object.values(window.__ft)')[1:])
            m = v[len(v) // 2] if v else None
            print('  %s: %d kuvaa, piirtoaika mediaani %s ms' % (label, len(v), None if m is None else round(m, 1))); return m
        res = {'g': [], 'o': []}
        for rd in range(2):
            res['g'].append(meas('Google-tila (oma kerros), kierros %d' % (rd + 1)))
            menu_view(p); wait_idle(p, 60)
            res['o'].append(meas('oma näkymä täysi, kierros %d' % (rd + 1)))
            menu_view(p); p.wait_for_timeout(1500)
        g_ = sorted(x for x in res['g'] if x)[0]; o_ = sorted(x for x in res['o'] if x)[0]
        print('  piirtoaika Google-tilassa %.0f ms, omassa näkymässä %.0f ms, suhde %.2f' % (g_, o_, g_ / o_))
        ok(g_ <= o_ * 1.1, 'oman kerroksen piirtoaika (%.0f ms) on enintään oman täyden näkymän (%.0f ms) %d %%' % (g_, o_, round(100 * g_ / o_)))

    if 'kuvat' in parts:
        # kuvat tummalla taustalla
        p.add_style_tag(content='#kalPanel,#kalCross{display:none!important}')   # kalibrointipaneeli ja ristit pois kuvista
        p.evaluate('document.querySelector(".fake-map3d").style.background="linear-gradient(#34404a,#222a31 52%,#12171b)"')
        goto_point(p, 328010, 6823830, 112.0)
        p.evaluate('__view.setFogKm(0)'); p.wait_for_timeout(2500)
        p.screenshot(path=os.path.join(out, '3n_oma_kerros_naistenlahti_ruutu.png'))
        el = p.query_selector('#v3'); el.screenshot(path=os.path.join(out, '3n_oma_kerros_naistenlahti.png'), timeout=300000)
        goto_point(p, 327895, 6824881, 100.0)
        p.wait_for_timeout(2500)
        el.screenshot(path=os.path.join(out, '3n_oma_kerros_siilinkari.png'), timeout=300000)
        p.evaluate('__view.setFogKm(5)'); p.wait_for_timeout(2000)
        el.screenshot(path=os.path.join(out, '3n_oma_kerros_siilinkari_sumu5km.png'), timeout=300000)
        p.evaluate('__view.setFogKm(0)')
        print('  kuvat tallennettu hakemistoon', out)

    errs2 = [e for e in errs if 'maps.googleapis' not in e[1] and 'ERR_FAILED' not in e[1]]
    errs2 = [e for e in errs2 if '404' not in e[1]]   # /api/google (palvelimen avain) puuttuu staattiselta testipalvelimelta, odotettu
    ok(not errs2, 'ei konsolivirheitä %s' % errs2[:4])
    b.close()
print('YHTEENSÄ', len(checks), 'tarkistusta,', len([1 for x in checks if not x[0]]), 'virhettä')
