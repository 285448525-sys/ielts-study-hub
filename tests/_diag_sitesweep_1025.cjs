/* 只读体检：全站 20 页 × 桌面/手机 × 明/暗 四态，扫 JS 报错与横向溢出
   跑法：BASE=http://127.0.0.1:9151 NODE_PATH=... node tests/_diag_sitesweep_1025.cjs
   只读，不改任何文件。目的是「停工期间只修 bug」时先知道有没有 bug。
   ⚠️ 不点任何破坏性操作（不交卷、不删除、不写库）。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:9151';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = ['home.html','bank.html','speaking.html','writing.html','practice.html','corpus.html',
  'plans.html','timer.html','review.html','vip.html','settings.html','meds.html','me.html','study.html',
  'plans-hub.html','materials.html','legal.html','beginner.html','teacher.html','admin.html'];

const VIEWS = [
  { name: '桌面亮', w: 1280, h: 900, theme: 'light' },
  { name: '桌面暗', w: 1280, h: 900, theme: 'dark' },
  { name: '手机',  w: 390,  h: 844, theme: 'light' },
];

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const rows = [];

  for (const v of VIEWS) {
    console.log('\n===== ' + v.name + ' =====');
    for (const url of PAGES) {
      const ctx = await b.newContext({ viewport: { width: v.w, height: v.h } });
      const p = await ctx.newPage();
      const errs = [], cerrs = [];
      p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 150)));
      p.on('console', m => { if (m.type() === 'error') cerrs.push(String(m.text()).slice(0, 120)); });
      await p.addInitScript(`(function(){ try{
        var K='ielts_study_hub_v1';
        if(!localStorage.getItem(K)) localStorage.setItem(K, JSON.stringify({
          words:[{en:'abandon',level:1,cleared:false,nextReview:'2020-01-01',cn:'放弃'}],
          sessions:[{date:(function(){var d=new Date();var z=function(n){return String(n).padStart(2,'0')};return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());})(),durationSec:1800,moduleId:'vocab',moduleName:'背单词'}],
          plans:[], meds:[], corpus:[], mockRecords:[], deletedIds:[], settings:{ theme:'${v.theme}' }
        }));
        localStorage.setItem('hub_onboarding_v2', JSON.stringify({finished:true, entered:true, snoozed:true}));
        document.documentElement.setAttribute('data-theme','${v.theme}');
      }catch(e){} })();`);
      let loadErr = null;
      try {
        await p.goto(BASE + '/' + url, { waitUntil: 'load', timeout: 25000 });
        await p.waitForFunction(() => { const l = document.getElementById('bootLoader'); return !l || l.classList.contains('hide') || getComputedStyle(l).display === 'none'; }, null, { timeout: 12000 }).catch(() => {});
        await p.evaluate(() => { const o = document.getElementById('onbOverlay'); if (o) o.remove(); });
        await sleep(1100);
      } catch (e) { loadErr = String(e.message || e).slice(0, 100); }

      const info = loadErr ? { overflow: null } : await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        sw: document.documentElement.scrollWidth, dw: window.innerWidth,
        hasMain: !!document.querySelector('main'),
        bodyText: (document.body.innerText || '').trim().length
      }));

      const bad = [];
      if (loadErr) bad.push('LOAD:' + loadErr);
      if (info.overflow !== null && info.overflow > 1) bad.push('横向溢出+' + info.overflow + 'px');
      if (info.bodyText !== undefined && info.bodyText < 40) bad.push('页面几乎空白(' + info.bodyText + '字)');
      const realErrs = errs.filter(e => !/cloudflareinsights|beacon\.min|CSP|Content Security/i.test(e));
      if (realErrs.length) bad.push('报错:' + realErrs[0]);

      rows.push({ view: v.name, url, bad, errs: realErrs });
      console.log('  ' + (bad.length ? '⚠️ ' : '   ') + url.padEnd(16) + (bad.length ? bad.join(' | ') : 'ok'));
      await ctx.close();
    }
  }

  await b.close();
  const bad = rows.filter(r => r.bad.length);
  console.log('\n===== 汇总：' + rows.length + ' 张检查 · ' + bad.length + ' 张有问题 =====');
  if (bad.length) {
    bad.forEach(r => console.log('  [' + r.view + '] ' + r.url + ' → ' + r.bad.join(' | ')));
  } else {
    console.log('  全部干净。');
  }
})().catch(e => { console.error('FATAL', e); process.exit(2); });
