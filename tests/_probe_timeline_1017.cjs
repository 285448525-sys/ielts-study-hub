/* 10/17 性能批 · 晚到内容的「什么时候才出现」时间线
   目标：搞清 #threeThings / #fullEntry 到底是「渲染晚」还是「布局晚」，
        以及 ready() 是否被 await obBankReady 挡住（若是，首屏其实一直是空的）。
   跑法：node tests/_with_server.cjs tests/_probe_timeline_1017.cjs 8879
*/
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8879';
const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const SEED = () => {
  try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true })); } catch (e) {}
  try { if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } })); } catch (e) {}
};

async function run(b, page, sel, extraEval) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(SEED);
  const p = await c.newPage();
  await p.addInitScript((sel) => {
    window.__tl = [];
    const T = () => Math.round(performance.now());
    const log = (what, val) => window.__tl.push({ t: T(), what, val });
    // 记录 readyState 各阶段
    document.addEventListener('DOMContentLoaded', () => log('DOMContentLoaded', 0));
    window.addEventListener('load', () => log('load', 0));
    // 长任务（主线程被占用的证据）
    try { new PerformanceObserver(l => l.getEntries().forEach(e => log('longtask', Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    // 监控目标元素：出现 / hidden 变化 / 高度变化
    const watch = (el, tag) => {
      if (!el || el.__tlw) return; el.__tlw = 1;
      const snap = () => log(tag, { h: el.offsetHeight, hidden: el.hidden, display: getComputedStyle(el).display, kids: el.children.length });
      snap();
      new MutationObserver(snap).observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ['hidden', 'class', 'style'] });
    };
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.querySelector(sel);
      watch(el, sel);
    });
    // 若元素在 DCL 前就有，也挂上
    const early = document.querySelector(sel); if (early) watch(early, sel);
    // 记录 first-contentful-paint
    try { new PerformanceObserver(l => l.getEntries().forEach(e => log('paint', e.name + ' @' + Math.round(e.startTime)))).observe({ entryTypes: ['paint'] }); } catch (e) {}
  }, sel);
  const cdp = await c.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
  await p.goto(BASE + '/' + page, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const r = await p.evaluate((extra) => {
    const out = { tl: window.__tl, nav: {}, state: {} };
    const n = performance.getEntriesByType('navigation')[0] || {};
    out.nav = { dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0) };
    try { out.state = eval(extra); } catch (e) { out.state = { err: String(e) }; }
    return out;
  }, extraEval || '({})');
  console.log('\n===== ' + page + '  (watch ' + sel + ') =====');
  console.log('  nav: DCL=' + r.nav.dcl + 'ms  load=' + r.nav.load + 'ms');
  console.log('  state: ' + JSON.stringify(r.state));
  // 打印时间线，合并连续同值
  let prev = null;
  r.tl.forEach(x => {
    const s = typeof x.val === 'object' ? JSON.stringify(x.val) : String(x.val);
    if (x.what === sel && s === prev) return;
    if (x.what === sel) prev = s;
    console.log('   ' + String(x.t).padStart(6) + 'ms  ' + x.what.padEnd(18) + ' ' + s);
  });
  await c.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  await run(b, 'home.html', '#threeThings', '({ wbActive: (typeof wbActive==="function"? wbActive() : "n/a"), wbDue: (typeof wbDueCount==="function"? wbDueCount() : "n/a"), plans: (DATA.plans||[]).length, sessions: (DATA.sessions||[]).length })');
  await run(b, 'bank.html', '#fullEntry', '({ manifest: !!document.querySelector("#bankList .bank-item"), items: document.querySelectorAll("#bankList .bank-item").length })');
  await b.close();
})().catch(e => { console.error('TIMELINE ERROR', e); process.exit(1); });
