/* LANDING-D-1119：新版首页结构、去重、真实资产、免费边界、三档视口与老用户不自动跳走。 */
const {chromium}=require('playwright-core');
const EXE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE=process.env.BASE||process.argv[2]||'http://127.0.0.1:8778';
const OUT='C:/Users/Camille/Desktop/雅思/ielts-study-hub/design/LANDING-D-1119/';
(async()=>{
 const b=await chromium.launch({executablePath:EXE,args:['--proxy-server=direct://','--proxy-bypass-list=*','--mute-audio']});
 let bad=0,total=0;const ok=(n,v)=>{total++;console.log((v?'PASS ':'FAIL ')+n);if(!v)bad++};
 try{
  for(const [w,h,name] of [[1440,1000,'desktop'],[390,844,'mobile'],[360,800,'mobile360']]){
   const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
   await p.goto(BASE+'/',{waitUntil:'load',timeout:120000});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
   if(name==='desktop'){
    ok('title',/雅思备考 Hub/.test(await p.title()));
    const h1=(await p.locator('h1').innerText()).replace(/\s+/g,'');ok('hero 主张',h1.includes('雅思机考，今天该练什么，打开就知道。'));
    ok('六段主结构 + 独立数字带',await p.locator('main > section').count()===6&&await p.locator('.numbers').count()===1);
    const text=await p.locator('body').innerText();
    for(const n of ['627','89','42'])ok('硬数字 '+n+' 只出现一次',(text.match(new RegExp(n,'g'))||[]).length===1);
    ok('作者说明只出现一次',(text.match(/作者本人每天在用/g)||[]).length===1);
    ok('结尾是具体行动',/进去以后，\s*先做最上面那一项。/.test(text)&&!/别再想今天练什么/.test(text));
    ok('旧 more 四格已合并',await p.locator('.more').count()===0&&await p.locator('.utilities').count()===1);
    ok('词库真实数字与词条',/2651/.test(text)&&/1738/.test(text)&&/species/.test(text)&&/Most species use camouflage/.test(text));
    ok('真实 CTA',await p.locator('a[href="/home"]').count()>=2&&await p.locator('a[href="/login"]').count()===1&&await p.locator('a[href="/practice.html"]').count()===1);
    for(const t of ['每月 3 篇','永久免费','会员专属','按额度开放','每周共享 5 次'])ok('免费边界 '+t,text.includes(t));
    ok('无提分承诺',!/保证提分|100% 覆盖|背完就能 6 分/.test(text));
    ok('无旧 try/quiz',await p.locator('#try,.quiz').count()===0);
    ok('四张产品截图已更新到 v931',(await p.locator('img[alt*="今日计划真实界面"]').getAttribute('src')).includes('plans-demo.png?v=931'));
    ok('无入场隐藏内容',await p.locator('.reveal').evaluateAll(els=>els.every(e=>getComputedStyle(e).opacity==='1')));
   }
   const imgs=await p.locator('main img').evaluateAll(els=>els.map(x=>({src:x.getAttribute('src'),nw:x.naturalWidth,nh:x.naturalHeight,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height,fit:getComputedStyle(x).objectFit})));
   ok(name+' 四张真实产品图',imgs.length===4&&imgs.every(x=>x.nw>0));
   ok(name+' 图片按原比例且不 cover',imgs.every(x=>Math.abs(x.w/x.h-x.nw/x.nh)<.02&&x.fit!=='cover'));
   ok(name+' 无横向溢出',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   ok(name+' 零 pageerror',errs.length===0);
   await p.screenshot({path:OUT+'live-local-'+name+'-hero.png'});await p.screenshot({path:OUT+'live-local-'+name+'-full.png',fullPage:true});
   await c.close();
  }
  const c=await b.newContext({viewport:{width:1440,height:1000}});const p=await c.newPage();
  await p.addInitScript(()=>{try{localStorage.setItem('ielts_study_hub_v1',JSON.stringify({settings:{name:'之之'}}))}catch(e){}});
  await p.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:120000});await p.waitForTimeout(600);
  ok('老用户停留落地页，不自动跳走',new URL(p.url()).pathname==='/');await c.close();
 }catch(e){console.log('FATAL',e.stack||e);bad++}
 console.log('TOTAL '+total+' FAIL '+bad);await b.close();process.exit(bad?1:0);
})();
