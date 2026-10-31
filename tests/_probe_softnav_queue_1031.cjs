/* NAV-SOFTNAV-HANG-1：手机真实底栏连点，最后目标必须到达且页面状态一致。
   旧版 busy 直接 return：本探针应在 6 轮内失败；修复后 6 轮全过。
   跑法：node tests/_probe_softnav_queue_1031.cjs [PORT|http://127.0.0.1:PORT] */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ARG = process.argv[2] || '';
const EXT_BASE = /^https?:\/\//.test(ARG) ? ARG : (process.env.BASE || '');
const PORT = EXT_BASE ? 0 : (Number(ARG) || 9440);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if(cond){ pass++; console.log('  ok  '+name); if(name.indexOf('6 轮')===0)console.log(JSON.stringify(detail&&detail.rows,null,2)); } else { fail++; console.log('  RED '+name+(detail?'  '+JSON.stringify(detail):'')); if(name.indexOf('6 轮')===0)console.log(JSON.stringify(detail,null,2)); } };
(async()=>{
 let srv = null, BASE = EXT_BASE;
 if(!BASE){
  srv = http.createServer((req,res)=>{ let u=decodeURIComponent(req.url.split('?')[0]); if(u==='/')u='/home.html'; const f=path.resolve(ROOT,'.'+u); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('nf');} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res); }).listen(PORT);
  BASE='http://127.0.0.1:'+PORT;
 }
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--proxy-server=direct://']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await p.route('**/plans.html',async r=>{await new Promise(x=>setTimeout(x,2500));await r.continue();});
 await p.addInitScript(()=>{localStorage.setItem('hub_onboarding_v2',JSON.stringify({v:2,entered:true,finished:true,snoozed:true,setup:{exam:true,effort:true,words:true},ts:Date.now()}));window.__softCalls=[];window.__wrapSoft=()=>{if(window.__softWrapped||typeof window.softNavigate!=='function')return;window.__softWrapped=true;const orig=window.softNavigate;window.softNavigate=function(t,p){const wasBusy=window._softNavBusy;window.__softCalls.push({file:t.file,at:performance.now(),busy:wasBusy});return orig(t,p)}};window.__wrapSoft();});
 let settled=0, correct=0; const rows=[];
 for(let i=0;i<6;i++){
  await p.goto(BASE+'/home.html',{waitUntil:'load'});
  await p.waitForFunction(()=>document.querySelectorAll('#hubDock a').length===4 && typeof softNavigate==='function');await p.evaluate(()=>window.__wrapSoft());
  await p.locator('#hubDock a').nth(1).click({noWaitAfter:true});
  await p.waitForTimeout(120);
  await p.locator('#hubDock a').first().dispatchEvent('click');
  const afterClicks=await p.evaluate(()=>({busy:_softNavBusy,current:_hubCurrentFile}));
  try{
   await p.waitForFunction(()=>location.pathname.endsWith('/home.html') && typeof _softNavBusy!=='undefined' && !_softNavBusy,{timeout:9000}); settled++;
  }catch(e){}
  const s=await p.evaluate(()=>({url:location.pathname,title:document.title,current:_hubCurrentFile,home:document.body.classList.contains('hub-home'),pending:typeof _softNavPending!=='undefined'?_softNavPending:null}));
  const good=s.url.endsWith('/home.html')&&s.current==='home.html'&&s.home&&!s.pending&&afterClicks.current==='home.html'; if(good)correct++;
  rows.push({round:i+1,afterClicks,calls:await p.evaluate(()=>window.__softCalls),...s});
 }
 ok('6 轮真实连点均完成最后一次首页跳转',correct===6,{settled,correct,rows});
 ok('全程零 pageerror',errors.length===0,errors);
 await b.close(); if(srv)srv.close();
 console.log('\n===== 软导航最后目标 '+pass+' 过 / '+fail+' 红 ====='); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
