/* 10/17 性能批 · 软导航拆解：把 ~330ms 拆成「拿文档 / 换 DOM / 跑脚本」三段
   为什么必须拆：softNavigate 里有 await navGetDoc → innerHTML 替换 → rAF+50ms → runPageScript(并发取码+逐个 eval)。
   只有知道哪段贵，改法才不会瞎猜。
   跑法：BASE=https://yasihub.com NODE_PATH=... node tests/_probe_nav_1017.cjs
*/
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'https://yasihub.com';
const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => {
    try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true })); } catch (e) {}
    try { if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } })); } catch (e) {}
  });
  const p = await c.newPage();
  p.on('pageerror', e => console.log('   [pageerror] ' + e.message));
  await p.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(2500);

  /* 在页面里包一层探针：找到 softNavigate 内部三个 await 分界，用 performance.mark 记录。
     不改产品代码——直接读全局函数体不行（是 async），改为挂 PerformanceObserver 看
     resource timing：软导航期间发起的 js 请求就是「取码」那段。 */
  const targets = [
    ['review.html', '回顾'],
    ['speaking.html', '口语'],
    ['practice.html', '单词'],
    ['writing.html', '写作'],
    ['bank.html', '题库']
  ];

  console.log('起始页: ' + p.url().split('/').pop());
  for (const [file, label] of targets) {
    const r = await p.evaluate(async (f) => {
      const link = Array.from(document.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').split('?')[0] === f);
      if (!link) return { err: 'no link ' + f };
      const out = { t0: performance.now(), res: [] };
      const po = new PerformanceObserver(l => l.getEntries().forEach(e => {
        if (/\/js\//.test(e.name)) out.res.push({ n: e.name.split('/').pop().split('?')[0], d: Math.round(e.duration), ts: Math.round(e.startTime - out.t0) });
      }));
      try { po.observe({ entryTypes: ['resource'] }); } catch (e) {}
      const main = document.querySelector('main');
      let swapAt = 0;
      const mo = new MutationObserver(() => { if (!swapAt) swapAt = Math.round(performance.now() - out.t0); });
      mo.observe(main, { childList: true, subtree: false });
      link.click();
      // 等 _softNavBusy 释放（softNavigate finally 里置 false）
      for (let i = 0; i < 120; i++) {
        await new Promise(r2 => setTimeout(r2, 50));
        if (!window._softNavBusy && swapAt) break;
      }
      await new Promise(r2 => setTimeout(r2, 300));
      po.disconnect(); mo.disconnect();
      out.swapAt = swapAt;
      out.total = Math.round(performance.now() - out.t0);
      out.url = location.pathname.split('/').pop();
      out.mainLen = (document.querySelector('main') || {}).textContent ? document.querySelector('main').textContent.trim().length : 0;
      return out;
    }, file).catch(e => ({ err: String(e && e.message || e) }));
    if (r.err) { console.log('  「' + label + '」' + r.err); continue; }
    console.log('  「' + label + '」→ ' + r.url + '  内容换掉 ' + r.swapAt + 'ms / 全程 ' + r.total + 'ms · main ' + r.mainLen + ' 字');
    if (r.res.length) r.res.forEach(x => console.log('        +' + String(x.ts).padStart(5) + 'ms  ' + String(x.d + 'ms').padStart(6) + '  ' + x.n));
    else console.log('        （本次未发 js 网络请求 → 全命中 navGetCode 内存缓存）');
    await p.waitForTimeout(600);
  }
  await c.close(); await b.close();
})().catch(e => { console.error('NAV ERROR', e); process.exit(1); });
