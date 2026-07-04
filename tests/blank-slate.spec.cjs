'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=require('path').resolve(__dirname,'..'),PORT=8353;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
function serve(){return new Promise(r=>{const s=http.createServer((q,res)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});s.listen(PORT,'127.0.0.1',()=>r(s));});}
let pass=0,fail=0;const chk=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x?'  — '+x:''));c?pass++:fail++;};
(async()=>{
  const srv=await serve();
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:412,height:900}});
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__app&&window.__app.state,null,{timeout:10000});
  await page.setInputFiles('#filePicker','/tmp/test_portrait.png'); // 1200x1600 = 3:4 = 0.75
  await page.waitForFunction(()=>window.__app.state.sources.length===1,null,{timeout:8000});

  const r = await page.evaluate(async () => {
    const A=window.__app, src=A.state.sources[0];
    const kind = src.kind;
    const frameEnabled = src.frame.enabled;
    const files = await A.exporter.postFiles();
    const bmp = await createImageBitmap(files[0]);
    // sample edges to confirm NO frame padding (all edges should be image, not white/solid frame)
    const c = new OffscreenCanvas(bmp.width,bmp.height).getContext('2d'); c.drawImage(bmp,0,0);
    const px=(x,y)=>{const d=c.getImageData(x,y,1,1).data;return [d[0],d[1],d[2]];};
    const isWhite=(a)=>a[0]>240&&a[1]>240&&a[2]>240;
    return { kind, frameEnabled, w:bmp.width, h:bmp.height, aspect:+(bmp.width/bmp.height).toFixed(3),
      topW:isWhite(px(bmp.width>>1,2)), botW:isWhite(px(bmp.width>>1,bmp.height-3)),
      leftW:isWhite(px(2,bmp.height>>1)), rightW:isWhite(px(bmp.width-3,bmp.height>>1)) };
  });
  console.log('new import export:', JSON.stringify(r));
  chk('new slide seeded kind:plain', r.kind==='plain', 'kind='+r.kind);
  chk('frame NOT enabled on import', r.frameEnabled===false, 'enabled='+r.frameEnabled);
  chk('export = original 3:4 aspect (0.75)', Math.abs(r.aspect-0.75)<0.01, 'aspect='+r.aspect);
  chk('NO frame padding on any edge', !r.topW&&!r.botW&&!r.leftW&&!r.rightW, `edges T${r.topW} B${r.botW} L${r.leftW} R${r.rightW}`);
  chk('no console errors', errs.length===0, errs.slice(0,2).join('|')||'clean');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
