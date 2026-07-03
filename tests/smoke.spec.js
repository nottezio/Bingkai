/* Bingkai — minimal smoke suite (self-contained: starts its own static server).
 * The ONLY real regression coverage for the project (see MODULE_SPLIT_SPEC §4a).
 * Run:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/smoke.spec.js
 * Serves repo root in-process (.js MUST be text/javascript or ES modules fail),
 * runs Playwright, exits clean. Implemented: [1] import->overview. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), PORT = 8199;
const IMG_LANDSCAPE = process.env.IMG_LANDSCAPE || '/tmp/test_landscape.png';
const IMG_PORTRAIT = process.env.IMG_PORTRAIT || '/tmp/test_portrait.png';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
function startServer(){ return new Promise((resolve)=>{ const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
  fs.createReadStream(fp).pipe(res); }); srv.listen(PORT,'127.0.0.1',()=>resolve(srv)); }); }
const results=[]; const rec=(name,ok,detail)=>{results.push({name,ok});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`);};
(async()=>{
  const srv=await startServer();
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(); const errs=[];
  page.on('console',(m)=>{if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',(e)=>errs.push('pageerror: '+e.message));
  page.on('requestfailed',(r)=>errs.push('requestfailed: '+r.url()+' '+(r.failure()&&r.failure().errorText)));
  try{
    await page.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__app&&window.__app.state,null,{timeout:10000});
    rec('module graph resolved (window.__app present)',true);
    await page.setInputFiles('#filePicker',IMG_LANDSCAPE);
    await page.waitForSelector('#poStrip .po-card',{timeout:10000});
    const s=await page.evaluate(()=>({cards:document.querySelectorAll('#poStrip .po-card').length,
      overviewShown:document.getElementById('postOverview').classList.contains('show'),
      dockHidden:document.getElementById('dock').classList.contains('hidden'),
      toolbarHidden:document.getElementById('toolbar').classList.contains('hidden'),
      sources:window.__app.state.sources?window.__app.state.sources.length:null}));
    rec('import->overview: card rendered',s.cards>=1,`cards=${s.cards}`);
    rec('import->overview: overview visible',s.overviewShown===true);
    rec('import->overview: dock hidden',s.dockHidden===true);
    rec('import->overview: toolbar hidden',s.toolbarHidden===true);
    rec('import->overview: source in state',s.sources>=1,`sources=${s.sources}`);

    // ---- [2] select -> contextual actions ----
    await page.click('#poStrip .po-card');
    await page.waitForSelector('#slideActions.show',{timeout:5000});
    const sel=await page.evaluate(()=>({shown:document.getElementById('slideActions').classList.contains('show'),
      acts:[...document.querySelectorAll('#slideActions .sa-btn')].map(b=>b.dataset.act),
      activeId:window.__app.state.activeId||null}));
    rec('select->actions: slideActions shown',sel.shown===true);
    rec('select->actions: crop/frame/collage/carousel present',['crop','frame','collage','carousel'].every(a=>sel.acts.includes(a)),sel.acts.join(','));
    rec('select->actions: state.activeId set',!!sel.activeId,`activeId=${sel.activeId}`);

    // ---- [3] enter edit -> Done ----
    await page.click('#slideActions .sa-btn[data-act="frame"]');
    await page.waitForFunction(()=>window.__app.state.view==='edit',null,{timeout:5000});
    const ed=await page.evaluate(()=>({view:window.__app.state.view,
      dockHidden:document.getElementById('dock').classList.contains('hidden'),
      toolbarHidden:document.getElementById('toolbar').classList.contains('hidden')}));
    rec('edit: state.view=edit',ed.view==='edit');
    rec('edit: dock shown',ed.dockHidden===false);
    rec('edit: toolbar shown',ed.toolbarHidden===false);
    await page.click('#btnDone');
    await page.waitForFunction(()=>window.__app.state.view==='overview',null,{timeout:5000});
    const dn=await page.evaluate(()=>({view:window.__app.state.view,
      overviewShown:document.getElementById('postOverview').classList.contains('show'),
      dockHidden:document.getElementById('dock').classList.contains('hidden')}));
    rec('Done: returns to overview',dn.view==='overview'&&dn.overviewShown===true);
    rec('Done: dock hidden again',dn.dockHidden===true);

    // ---- [7] export dialog routing (spy on exporter; no real export triggered) ----
    await page.evaluate(()=>{ window.__spy={save:0,run:0};
      window.__app.exporter.savePost=async()=>{window.__spy.save++;};
      window.__app.exporter.runPost =async()=>{window.__spy.run++;}; });
    await page.click('#btnExportPost');
    await page.waitForSelector('#exportModal.show',{timeout:5000});
    await page.click('#expDest .exp-opt[data-dest="device"]');
    await page.click('#expQual .exp-opt[data-q="max"]');
    await page.click('#exportGo');
    await page.waitForFunction(()=>!document.getElementById('exportModal').classList.contains('show'),null,{timeout:5000});
    const ex=await page.evaluate(()=>({opt:{...window.__app.state.exportOpt},spy:{...window.__spy}}));
    rec('export routing: max quality -> ig=false, quality=1.0',ex.opt.ig===false&&ex.opt.quality===1.0,`ig=${ex.opt.ig} q=${ex.opt.quality}`);
    rec('export routing: format jpeg',ex.opt.format==='jpeg');
    rec('export routing: device dest -> savePost (not runPost)',ex.spy.save===1&&ex.spy.run===0,`save=${ex.spy.save} run=${ex.spy.run}`);

    // ---- [6] slider ball-only (overlay gesture in hardenRanges) ----
    await page.click('#poStrip .po-card');                       // re-select
    await page.waitForSelector('#slideActions.show',{timeout:5000});
    await page.click('#slideActions .sa-btn[data-act="frame"]');  // enter frame edit -> marginRange laid out
    await page.waitForFunction(()=>window.__app.state.view==='edit',null,{timeout:5000});
    await page.evaluate(()=>{const b=document.getElementById('frameEnableOn');if(b)b.click();}); // framing is opt-in; enable to reveal margin/bg rows
    await page.waitForFunction(()=>{const r=document.getElementById('marginRange');return r&&r.getBoundingClientRect().width>10;},null,{timeout:5000});
    const sl=await page.evaluate(()=>{
      const r=document.getElementById('marginRange');
      const ov=r.nextElementSibling;                              // transparent overlay in the wrap
      const HIT=28, rect=r.getBoundingClientRect();
      const min=+r.min,max=+r.max;
      const thumbX=()=>rect.left+HIT/2+((+r.value-min)/(max-min))*(rect.width-HIT);
      const cy=rect.top+rect.height/2;
      const fire=(t,cx)=>ov.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:cx,clientY:cy,pointerId:1}));
      const before=r.value;
      // A: drag on TRACK far from thumb -> no change
      const tx=thumbX();
      const trackX=(tx>rect.left+rect.width/2)?rect.left+5:rect.right-5;
      fire('pointerdown',trackX);fire('pointermove',trackX+ (trackX<tx?30:-30));fire('pointerup',trackX);
      const afterTrack=r.value;
      // B: drag on THUMB -> change
      const tx2=thumbX();
      fire('pointerdown',tx2);
      const moveTo=Math.min(rect.right-5,tx2+rect.width*0.35);
      fire('pointermove',moveTo);fire('pointerup',moveTo);
      const afterThumb=r.value;
      return {before,afterTrack,afterThumb};
    });
    rec('slider ball-only: track drag does NOT change value',sl.afterTrack===sl.before,`before=${sl.before} track=${sl.afterTrack}`);
    rec('slider ball-only: thumb drag DOES change value',sl.afterThumb!==sl.before,`before=${sl.before} thumb=${sl.afterThumb}`);
    await page.click('#btnDone');
    await page.waitForFunction(()=>window.__app.state.view==='overview',null,{timeout:5000});

    // ---- [4] crop-ratio-follows-crop ----
    await page.click('#poStrip .po-card');
    await page.waitForSelector('#slideActions.show',{timeout:5000});
    await page.click('#slideActions .sa-btn[data-act="crop"]');
    await page.waitForFunction(()=>window.__app.state.view==='edit',null,{timeout:5000});
    await page.waitForSelector('#cropRatioChips .chip[data-ratio="1:1"]',{timeout:5000});
    await page.click('#cropRatioChips .chip[data-ratio="1:1"]');
    await page.click('#btnDone');
    await page.waitForFunction(()=>window.__app.state.view==='overview',null,{timeout:5000});
    await page.waitForSelector('#poStrip .po-card canvas',{timeout:5000});
    const cr=await page.evaluate(()=>{const cv=document.querySelector('#poStrip .po-card canvas');return {aspect:cv.width/cv.height};});
    rec('crop-ratio: 1:1 crop -> square overview card',Math.abs(cr.aspect-1)<0.05,`aspect=${cr.aspect.toFixed(3)} (4:5 default=0.80)`);

    // ---- [5] collage cell-add (empty-cell tap -> consumed cell, not a new slide) ----
    await page.click('#poStrip .po-card');
    await page.waitForSelector('#slideActions.show',{timeout:5000});
    await page.click('#slideActions .sa-btn[data-act="collage"]');
    await page.waitForFunction(()=>window.__app.state.view==='edit'&&window.__app.state.mode==='collage',null,{timeout:5000});
    await page.evaluate(()=>{ window.__app.collageMode.setLayout({template:'wide-narrow'});
      window.__cellTap=false; document.getElementById('filePicker').addEventListener('click',()=>{window.__cellTap=true;}); });
    await page.waitForTimeout(150);
    const cb=await page.evaluate(()=>({sources:window.__app.state.sources.length,
      slides:window.__app.postModel.deriveFrameSlides(window.__app.state.sources).length}));
    // Compute cell-1 center exactly as onDown does: letterboxed viewport (app geometry),
    // hit-tested against clientX-stage.left. wide-narrow cell 1 center = normalized (0.82,0.5).
    const precise=await page.evaluate(()=>{
      const g=window.__app.geometryCore, ws=document.getElementById('workspace'), stage=document.getElementById('stage');
      const wsW=ws.clientWidth, wsH=ws.clientHeight, r=window.__app.collageMode.ratioNums(), pad=10;
      const shape=g.canvasDimsForRatio(r.w,r.h,1000);
      const fit=g.computeContainRect(shape.Cw,shape.Ch,wsW-2*pad,wsH-2*pad);
      const vp={x:pad+fit.x,y:pad+fit.y,w:fit.w,h:fit.h};
      const sr=stage.getBoundingClientRect();
      return { clientX: sr.left+vp.x+0.82*vp.w, clientY: sr.top+vp.y+0.5*vp.h };
    });
    const box=await page.locator('#stage').boundingBox();
    // Try the computed point first, then a coarse grid as fallback.
    const pts=[[precise.clientX,precise.clientY,true],
      ...[[0.82,0.5],[0.5,0.5],[0.85,0.25],[0.85,0.75],[0.3,0.5]].map(([fx,fy])=>[box.x+box.width*fx,box.y+box.height*fy,false])];
    let tapFired=false;
    for(const [cx,cy] of pts){
      await page.evaluate(()=>{window.__cellTap=false;});
      await page.mouse.move(cx,cy); await page.mouse.down(); await page.mouse.up();
      tapFired=await page.evaluate(()=>window.__cellTap);
      if(tapFired) break;
    }
    rec('collage cell-add: empty-cell tap triggered import (picker.click)',tapFired===true,tapFired?'fired':'no empty cell hit');
    await page.setInputFiles('#filePicker', IMG_PORTRAIT);
    await page.waitForFunction((n)=>window.__app.state.sources.length>n, cb.sources, {timeout:8000});
    const ca=await page.evaluate(()=>({sources:window.__app.state.sources.length,
      slides:window.__app.postModel.deriveFrameSlides(window.__app.state.sources).length,
      filled:(()=>{const co=window.__app.state.sources.find(s=>s.kind==='collage');return co&&co.collage?co.collage.cells.filter(c=>c&&c.srcId).length:0;})()}));
    rec('collage cell-add: image imported (sources +1)',ca.sources===cb.sources+1,`${cb.sources}->${ca.sources}`);
    rec('collage cell-add: consumed as cell, NOT a new overview slide',ca.slides===cb.slides,`slides ${cb.slides}->${ca.slides}`);
    rec('collage cell-add: a cell now holds the imported srcId',ca.filled>=1,`filledCells=${ca.filled}`);
    await page.click('#btnDone').catch(()=>{});
    await page.waitForFunction(()=>window.__app.state.view==='overview',null,{timeout:5000}).catch(()=>{});

    rec('no console/network errors',errs.length===0,errs.slice(0,4).join(' | ')||'clean');
  }catch(err){rec('smoke run',false,err.message); if(errs.length)console.log('  errors:',errs.slice(0,6).join(' | '));}
  finally{await browser.close(); srv.close();}
  const failed=results.filter((r)=>!r.ok).length;
  console.log(`\n${results.length-failed}/${results.length} assertions passed`);
  process.exit(failed?1:0);
})();
