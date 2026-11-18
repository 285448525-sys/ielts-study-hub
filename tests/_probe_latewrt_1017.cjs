/* ===== 10/17 性能批 · 写作脚本按页隔离 验证探针 =====
   11-15 PERM-REG-1 / MODULE-MOVE-1（11-08）：写作从 bank.html 的 #mockTabs 搬到 writing.html
   独立页面。bank 首屏不再有 #pane-writing / 写作 tab / data-late 注入；写作脚本改由
   writing.html 自己 defer 声明，真题模考入口在 #wr=exam 新 pane，由 js/wr-tabs.js 的
   renderPane('exam') 调 window.renderExamList() / window.renderWritingFullEntry() 渲染。
   原「bank 切写作 tab 才按需加载」「bank 空闲预热让 renderExamList 可用」已无对应物；
   等价契约改成：A bank 首屏拦掉写作脚本后阅读列表/整卷入口照常完整、零页面异常；
   B writing.html 首屏按页加载两个脚本、#wr=exam 渲染真题列表与入口卡、不依赖 bank；
   C 重复进出写作用户入口不重复插 <script>、列表不丢；
   E 手机 Slow4G 下 bank 首屏关键期（FCP+60ms）没有写作脚本，writing.html 能自行加载。
   跑法：node tests/_with_server.cjs tests/_probe_latewrt_1017.cjs 8921 */
const { chromium } = require('playwright-core');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8921';
const IS_WRITING_SCRIPT = /(?:^|\/)writing(?:_prompts)?\.js(?:\?|$)/;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = () => {
  try {
    localStorage.setItem('hub_exam_timer_auto', '20');
    localStorage.setItem('hub_exam_guide_v2_reading', '1');
    localStorage.setItem('hub_exam_guide_v2_listening', '1');
    if (!localStorage.getItem('hub_onboarding_v2')) localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true, setup: { examDate: '2026-12-01' } }));
    if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
  } catch (e) {}
};

async function waitWritingPane(pg, timeout) {
  await pg.waitForFunction(() => {
    const pane = document.querySelector('[data-wr-pane="exam"]');
    return !!pane && !pane.hidden
      && typeof window.renderExamList === 'function'
      && !!document.querySelector('#writingFullEntry #wrtFullStart')
      && document.querySelectorAll('#examList .exam-item, #examList > *').length > 0;
  }, null, { timeout: timeout || 30000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  /* ---------- A. bank 首屏：拦掉写作脚本仍完整 ---------- */
  console.log('\n[A] bank 首屏拦掉 writing_prompts.js / writing.js 后仍完整？');
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctxA.addInitScript(SEED);
  const aErrs = [];
  await ctxA.route('**/js/writing_prompts.js*', r => r.abort());
  await ctxA.route('**/js/writing.js*', r => r.abort());
  const pgA = await ctxA.newPage();
  pgA.on('pageerror', e => aErrs.push(String(e && e.message || e)));
  await pgA.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pgA.waitForTimeout(1200);
  const a = await pgA.evaluate(() => {
    const n = document.querySelectorAll('#bankList .bank-item, #bankList .bank-items > *').length;
    return {
      listKids: n,
      listText: (document.getElementById('bankList') || {}).innerText ? document.getElementById('bankList').innerText.length : 0,
      hasFullCard: !!document.querySelector('#fullEntry .full-card'),
      hasStartBtn: !!document.querySelector('#fullEntry [data-fullstart]'),
      partMeta: (document.getElementById('partMeta') || {}).textContent || '',
      writingPaneGone: !document.getElementById('pane-writing') && !document.querySelector('#mockTabs [data-mtab="writing"]')
    };
  });
  ok(a.listKids > 0 || a.listText > 60, '阅读列表照常渲染（条目 ' + a.listKids + ' / 文本 ' + a.listText + ' 字）');
  ok(a.hasFullCard, '整卷入口卡照常渲染');
  ok(a.hasStartBtn, 'Start Test 按钮存在');
  ok(a.partMeta.indexOf('篇') >= 0, 'Part 元数据正常（' + a.partMeta + '）');
  ok(a.writingPaneGone, 'MODULE-MOVE-1 后 bank 不再内置写作 pane / 写作 tab');
  ok(aErrs.length === 0, '拦掉写作脚本后零页面异常' + (aErrs.length ? ' — ' + aErrs.join(' | ') : ''));
  await ctxA.close();

  /* ---------- B. writing.html 首屏：两个脚本按页声明，#wr=exam 真渲染 ---------- */
  console.log('\n[B] writing.html 首屏加载时机 + #wr=exam 真题模考');
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctxB.addInitScript(SEED);
  const reqs = [];
  const pgB = await ctxB.newPage();
  const bErrs = [];
  pgB.on('pageerror', e => bErrs.push(String(e && e.message || e)));
  pgB.on('request', r => reqs.push(r.url()));
  await pgB.goto(BASE + '/writing.html#wr=exam', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitWritingPane(pgB, 30000);
  await pgB.waitForTimeout(800);
  const timing = await pgB.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const rs = performance.getEntriesByType('resource').filter(e => /(?:^|\/)writing(?:_prompts)?\.js(?:\?|$)/.test(e.name))
      .map(e => ({ n: e.name.split('/').pop().split('?')[0], s: Math.round(e.startTime) }));
    const pane = document.querySelector('[data-wr-pane="exam"]');
    const list = document.getElementById('examList');
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null, rs,
      paneShown: !!pane && !pane.hidden,
      cur: window.__wrTabs && typeof window.__wrTabs.cur === 'function' ? window.__wrTabs.cur() : null,
      fnReady: typeof window.renderExamList === 'function',
      promptsReady: !!(window.WRITING_PROMPTS && Array.isArray(window.WRITING_PROMPTS.big) && window.WRITING_PROMPTS.big.length),
      listText: list ? String(list.textContent || '').replace(/\s+/g, ' ').trim().length : 0,
      listKids: list ? list.children.length : 0,
      hasFullCard: !!document.querySelector('#writingFullEntry .full-card'),
      hasStartBtn: !!document.querySelector('#writingFullEntry #wrtFullStart'),
      scriptTags: document.querySelectorAll('script[src*="js/writing.js"], script[src*="js/writing_prompts.js"]').length,
      lateInjected: document.querySelectorAll('script[data-late="1"]').length,
      bankTabsGone: !document.getElementById('mockTabs'),
      loaded: rs.map(x => x.n)
    };
  });
  console.log('    FCP = ' + timing.fcp + 'ms；写作页脚本 = ' + JSON.stringify(timing.rs));
  ok(timing.paneShown && timing.cur === 'exam', '#wr=exam 深链落到真题模考 pane（' + timing.cur + '）');
  ok(timing.fnReady && timing.promptsReady, 'writing.js / writing_prompts.js 都由写作页自己声明并就绪');
  ok(timing.loaded.indexOf('writing_prompts.js') >= 0 && timing.loaded.indexOf('writing.js') >= 0,
    '两个写作脚本确实被请求过（' + timing.loaded.join(', ') + '）');
  ok(timing.listKids > 0 || timing.listText > 40, '真题列表已渲染（子节点 ' + timing.listKids + ' / 文本 ' + timing.listText + ' 字）');
  ok(timing.hasFullCard && timing.hasStartBtn, '完整写作模考入口卡与 Start Test 已渲染');
  ok(timing.scriptTags === 2 && timing.lateInjected === 0 && timing.bankTabsGone,
    '写作脚本只声明一次、没有 bank 时代的 data-late 注入或隐藏 tab（' + JSON.stringify({ tags: timing.scriptTags, late: timing.lateInjected, bankTabs: !timing.bankTabsGone }) + '）');
  ok(bErrs.length === 0, '写作页零页面异常' + (bErrs.length ? ' — ' + bErrs.join(' | ') : ''));

  /* C. 重复进出用户入口：不重复插脚本、列表不丢 */
  console.log('\n[C] 重复进出真题模考入口的幂等性');
  await pgB.evaluate(() => {
    if (window.__wrTabs && typeof window.__wrTabs.show === 'function') window.__wrTabs.show('home');
  });
  await pgB.waitForTimeout(250);
  await pgB.evaluate(() => {
    if (window.__wrTabs && typeof window.__wrTabs.show === 'function') window.__wrTabs.show('exam');
  });
  await waitWritingPane(pgB, 15000);
  await pgB.evaluate(() => {
    if (window.__wrTabs && typeof window.__wrTabs.show === 'function') window.__wrTabs.show('home');
    if (window.__wrTabs && typeof window.__wrTabs.show === 'function') window.__wrTabs.show('exam');
  });
  await waitWritingPane(pgB, 15000);
  const c = await pgB.evaluate(() => {
    const list = document.getElementById('examList');
    return {
      scripts: document.querySelectorAll('script[src*="js/writing.js"], script[src*="js/writing_prompts.js"]').length,
      lateInjected: document.querySelectorAll('script[data-late="1"]').length,
      kids: list ? list.children.length : 0,
      hasStart: !!document.querySelector('#writingFullEntry #wrtFullStart')
    };
  });
  ok(c.scripts === timing.scriptTags && c.lateInjected === 0,
    '重复切 pane 不会重复插脚本（首次 ' + timing.scriptTags + ' → 切回 ' + c.scripts + '）');
  ok(c.kids > 0 && c.hasStart, '切回后真题列表与入口卡仍在（' + c.kids + ' 项）');
  const lateReqs = reqs.filter(u => IS_WRITING_SCRIPT.test(u)).length;
  ok(lateReqs >= 2, '两个写作脚本确实被请求过（' + lateReqs + ' 次）');
  await ctxB.close();

  /* ---------- E. 手机 Slow4G：bank 首屏关键期无写作脚本，writing 页自加载 ---------- */
  console.log('\n[E] 手机 Slow4G 首屏关键期与写作页自加载');
  const ctxE = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
    serviceWorkers: 'block'
  });
  await ctxE.addInitScript(SEED);
  const pgE = await ctxE.newPage();
  const eErrs = [];
  pgE.on('pageerror', e => eErrs.push(String(e && e.message || e)));
  const cdp = await ctxE.newCDPSession(pgE);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
  const t0 = Date.now();
  await pgE.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pgE.waitForTimeout(5000);
  const e = await pgE.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const rs = performance.getEntriesByType('resource');
    const f = fcp ? fcp.startTime : 0;
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      reqs: rs.length,
      lateEarly: rs.filter(x => /(?:^|\/)writing(?:_prompts)?\.js(?:\?|$)/.test(x.name) && x.startTime <= f + 60)
        .map(x => x.name.split('/').pop().split('?')[0])
    };
  });
  console.log('    bank FCP=' + e.fcp + 'ms  domcontentloaded=' + (Date.now() - t0) + 'ms  首屏请求 ' + e.reqs + ' 条');
  ok(e.fcp != null && e.fcp > 0, 'bank FCP 有值（' + e.fcp + 'ms）');
  ok(e.lateEarly.length === 0,
    '写作脚本不在 bank 首屏关键期（FCP+60ms 内开始加载的：' + (e.lateEarly.join(', ') || '无') + '）');
  ok(e.reqs <= 80, 'bank 首屏请求数未失控（' + e.reqs + ' 条）');

  await pgE.goto(BASE + '/writing.html#wr=exam', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitWritingPane(pgE, 60000);
  const w = await pgE.evaluate(() => ({
    fnReady: typeof window.renderExamList === 'function',
    loaded: performance.getEntriesByType('resource')
      .filter(x => /(?:^|\/)writing(?:_prompts)?\.js(?:\?|$)/.test(x.name))
      .map(x => x.name.split('/').pop().split('?')[0]),
    kids: document.querySelectorAll('#examList .exam-item, #examList > *').length,
    hasStart: !!document.querySelector('#writingFullEntry #wrtFullStart')
  }));
  ok(w.fnReady && w.loaded.indexOf('writing_prompts.js') >= 0 && w.loaded.indexOf('writing.js') >= 0,
    '慢网下 writing.html 自己把两个写作脚本拉起（' + w.loaded.join(', ') + '）');
  ok(w.kids > 0 && w.hasStart, '慢网下写作真题列表与入口卡仍渲染（' + w.kids + ' 项）');
  ok(eErrs.length === 0, '慢网两段零页面异常' + (eErrs.length ? ' — ' + eErrs.join(' | ') : ''));
  await ctxE.close();

  await browser.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩溃：', e); process.exit(2); });
