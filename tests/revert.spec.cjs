'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const ROOT=require('path').resolve(__dirname,'..'),PORT=8356;
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
  await page.setInputFiles('#filePicker','/tmp/test_portrait.png');
  await page.waitForFunction(()=>window.__app.state.sources.length===1,null,{timeout:8000});
  await page.click('#poStrip .po-card'); await page.waitForSelector('#slideActions.show',{timeout:5000});
  // revert hidden for plain slide
  const revHiddenPlain = await page.evaluate(()=>getComputedStyle(document.getElementById('saRevert')).display==='none');
  chk('revert hidden for plain slide', revHiddenPlain);
  // apply carousel
  await page.click('#slideActions .sa-btn[data-act="carousel"]');
  await page.waitForFunction(()=>window.__app.state.mode==='carousel',null,{timeout:5000});
  await page.click('#btnDone'); await page.waitForFunction(()=>window.__app.state.view==='overview',null,{timeout:5000});
  await page.click('#poStrip .po-card'); await page.waitForSelector('#slideActions.show',{timeout:5000});
  await page.waitForTimeout(100);
  const kindAfterCarousel = await page.evaluate(()=>window.__app.state.sources[0].kind);
  const revShown = await page.evaluate(()=>getComputedStyle(document.getElementById('saRevert')).display!=='none');
  chk('slide is carousel after applying', kindAfterCarousel==='carousel', 'kind='+kindAfterCarousel);
  chk('revert button now shown', revShown);
  // click revert
  await page.click('#slideActions .sa-btn[data-act="revert"]');
  await page.waitForTimeout(150);
  const kindAfterRevert = await page.evaluate(()=>window.__app.state.sources[0].kind);
  chk('slide reverted to plain', kindAfterRevert==='plain', 'kind='+kindAfterRevert);
  const revHiddenAgain = await page.evaluate(()=>getComputedStyle(document.getElementById('saRevert')).display==='none');
  chk('revert button hidden again after revert', revHiddenAgain);
  chk('no console errors', errs.length===0, errs.slice(0,2).join('|')||'clean');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); srv.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
