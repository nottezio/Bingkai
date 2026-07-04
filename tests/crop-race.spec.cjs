'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=require('path').resolve(__dirname,'..'),PORT=8352;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
function serve(){return new Promise(r=>{const s=http.createServer((q,res)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});s.listen(PORT,'127.0.0.1',()=>r(s));});}
const band=(a)=>a[0]>150&&a[1]<110?'RED':a[1]>140&&a[0]<110?'GREEN':a[2]>150&&a[0]<110?'BLUE':`(${a})`;
let pass=0,fail=0;const chk=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x?'  — '+x:''));c?pass++:fail++;};
(async()=>{
  const srv=await serve();
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:412,height:900}});
  await page.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__app&&window.__app.state,null,{timeout:10000});
  await page.setInputFiles('#filePicker','/tmp/test_portrait.png');
  await page.waitForFunction(()=>window.__app.state.sources.length===1,null,{timeout:8000});

  // Force the race deterministically: monkeypatch createImageBitmap so the FIRST
  // call (old crop, RED) resolves AFTER the second (new crop, BLUE). This is the
  // exact adversarial interleaving that the generation-guard must survive.
  const res = await page.evaluate(async () => {
    const A=window.__app, src=A.state.sources[0];
    const orig = window.createImageBitmap;
    let callNo = 0;
    window.createImageBitmap = async (...args) => {
      const my = ++callNo;
      const bmp = await orig(...args);
      // delay the FIRST call so it commits LAST (adversarial)
      if (my === 1) await new Promise(r=>setTimeout(r,120));
      return bmp;
    };
    src.crop={ratio:'3:2',zoom:1,cx:0.5,cy:0.12,flip:false,rotate:0}; const p1=A.renderer.bakeCrop(src); // RED, delayed
    src.crop={ratio:'3:2',zoom:1,cx:0.5,cy:0.88,flip:false,rotate:0}; const p2=A.renderer.bakeCrop(src); // BLUE, fast
    await Promise.all([p1,p2]);
    window.createImageBitmap = orig;
    const eff=A.renderer.effective(src); const c=new OffscreenCanvas(2,2).getContext('2d'); c.drawImage(eff.bitmap,0,0,2,2);
    return { finalBand: Array.from(c.getImageData(1,1,1,1).data).slice(0,3), sig: src._cropSig };
  });
  console.log('ADVERSARIAL interleave (old RED bake forced to resolve last):');
  chk('newest crop (BLUE) wins despite old bake resolving last', band(res.finalBand)==='BLUE', 'got '+band(res.finalBand)+' sig='+res.sig);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
