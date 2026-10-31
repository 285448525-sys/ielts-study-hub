/* 10/17 性能批 · manifest 加载失败时的入口卡行为
   静态化之后的副作用：卡片不再靠 JS 注入，所以「目录挂了」时它本来会一直挂着
   （按钮 disabled 点不动，但配着「目录加载失败」的提示会让人以为还能用）。
   已在 catch 里补清空，这里验一下。
   跑法：node tests/_with_server.cjs tests/_probe_manifestfail_1017.cjs 8915 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8915';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('hub_onboarding_v2')) {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
    }
    if (!localStorage.getItem('ielts_study_hub_v1')) {
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
    }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  // 让 manifest 必定失败
  await p.route('**/bank/manifest.json*', route => route.abort('failed'));
  await p.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(() => ({
    feEmpty: document.getElementById('fullEntry').innerHTML.trim() === '',
    lfeEmpty: document.getElementById('listenFullEntry').innerHTML.trim() === '',
    /* 10-23（B-1a 目录骨架屏批）：文案改成「目录没加载出来」+ 重试按钮，断言跟着放宽 */
    failMsg: /目录(加载失败|没加载出来)/.test(document.getElementById('bankList').textContent || ''),
    retry: !!document.querySelector('#bankList [data-bk-act="error"]') || /重试/.test(document.getElementById('bankList').textContent || ''),
  }));
  ok(r.feEmpty, '① 目录失败时阅读入口卡被移除（不挂着骗人）');
  ok(r.lfeEmpty, '② 听力入口卡同样被移除');
  ok(r.failMsg && r.retry, '③ 列表给出目录失败文案 + 重试入口');
  ok(errs.length === 0, '④ 零页面未捕获错误');
  if (errs.length) console.log('     ' + errs.slice(0, 2).join(' | '));

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
