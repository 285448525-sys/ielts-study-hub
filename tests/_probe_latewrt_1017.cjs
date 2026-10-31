/* ===== 10/17 性能批（第二批·传输层）· 写作脚本按需加载 验证探针 =====
   验的是三件事：
     A. 首屏不依赖它们（拦掉后首屏照常完整）且它们的加载不在首屏关键期（startTime > FCP）
     B. 切到写作 tab 时按需加载、列表与整卷入口卡都渲染出来
     C. load 之后的空闲预热确实会把它们拉起来（用户真去点写作时通常已就位）
   跑法：node tests/_with_server.cjs tests/_probe_latewrt_1017.cjs 8921
        （线上：$env:NODE_PATH='C:/Users/Camille/.workbuddy/binaries/node/workspace/node_modules'
               $env:BASE='https://yasihub.com'; node tests/_probe_latewrt_1017.cjs） */
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8921';
const LATE = ['writing_prompts.js', 'writing.js'];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = () => {
  try{
    try { localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) {}
    if (!localStorage.getItem('hub_onboarding_v2')) localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v:2, entered:true, finished:true, snoozed:true, setup:{ examDate:'2026-12-01' } }));
    if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings:{ examDate:'2026-12-01' } }));
  }catch(e){}
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  /* ---------- A. 首屏：拦掉两个写作脚本，首屏必须照常完整 ---------- */
  console.log('\n[A] 首屏拦掉 writing_prompts.js / writing.js 后仍完整？');
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxA.addInitScript(SEED);
  let aErrs = [];
  await ctxA.route('**/writing_prompts.js*', r => r.abort());
  await ctxA.route('**/writing.js*', r => r.abort());
  const pgA = await ctxA.newPage();
  pgA.on('pageerror', e => aErrs.push(String(e && e.message || e)));
  await pgA.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await pgA.waitForTimeout(1200);
  const a = await pgA.evaluate(() => {
    const n = document.querySelectorAll('#bankList .bank-item, #bankList .bank-items > *').length;
    return {
      listKids: n,
      listText: (document.getElementById('bankList') || {}).innerText ? document.getElementById('bankList').innerText.length : 0,
      hasFullCard: !!(document.querySelector('#fullEntry .full-card')),
      hasStartBtn: !!(document.querySelector('#fullEntry [data-fullstart]')),
      partMeta: (document.getElementById('partMeta') || {}).textContent || ''
    };
  });
  ok(a.listKids > 0 || a.listText > 60, '阅读列表照常渲染（条目 ' + a.listKids + ' / 文本 ' + a.listText + ' 字）');
  ok(a.hasFullCard, '整卷入口卡照常渲染');
  ok(a.hasStartBtn, 'Start Test 按钮存在');
  ok(a.partMeta.indexOf('篇') >= 0, 'Part 元数据正常（' + a.partMeta + '）');
  ok(aErrs.length === 0, '零页面错误（拦掉后无 ReferenceError）' + (aErrs.length ? ' — ' + aErrs.join(' | ') : ''));
  await ctxA.close();

  /* ---------- B. 正常首屏：加载时机 + 切 tab 按需加载 ---------- */
  console.log('\n[B] 正常首屏的加载时机 + 切到写作 tab');
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxB.addInitScript(SEED);
  const reqs = [];
  const pgB = await ctxB.newPage();
  let bErrs = [];
  pgB.on('pageerror', e => bErrs.push(String(e && e.message || e)));
  pgB.on('request', r => reqs.push(r.url()));
  await pgB.goto(BASE + '/bank.html', { waitUntil: 'load' });
  const timing = await pgB.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const rs = performance.getEntriesByType('resource').filter(e => /writing(_prompts)?\.js/.test(e.name))
      .map(e => ({ n: e.name.split('/').pop().split('?')[0], s: Math.round(e.startTime), tr: e.transferSize }));
    return { fcp: fcp ? Math.round(fcp.startTime) : null, rs: rs };
  });
  console.log('    FCP = ' + timing.fcp + 'ms；此时已开始的写作脚本 = ' + JSON.stringify(timing.rs));
  const fcp0 = timing.fcp == null ? 0 : timing.fcp;
  const early = timing.rs.filter(r => r.s <= fcp0 + 60);
  ok(early.length === 0, '两个写作脚本都不在首屏关键期（无一条 startTime ≤ FCP+' + '60ms）');

  // 切到写作 tab
  await pgB.click('#mockTabs [data-mtab="writing"]');
  await pgB.waitForFunction(() => typeof window.renderExamList === 'function', null, { timeout: 15000 }).catch(() => {});
  await pgB.waitForTimeout(1500);
  const b = await pgB.evaluate(() => {
    const pane = document.getElementById('pane-writing');
    const list = document.getElementById('examList');
    return {
      paneShown: !!pane && !pane.hidden,
      fnReady: typeof window.renderExamList === 'function',
      listText: list ? list.innerText.length : 0,
      listKids: list ? list.children.length : 0,
      hasFullCard: !!document.querySelector('#writingFullEntry .full-card'),
      loaded: performance.getEntriesByType('resource').filter(e => /writing(_prompts)?\.js/.test(e.name)).map(e => e.name.split('/').pop().split('?')[0])
    };
  });
  ok(b.paneShown, '点写作 tab 后 pane 显示');
  ok(b.fnReady, 'writing.js 已按需加载（window.renderExamList 是函数）');
  ok(b.loaded.indexOf('writing_prompts.js') >= 0, 'writing_prompts.js 已加载（题库数据）');
  ok(b.listKids > 0 || b.listText > 40, '写作真题列表已渲染（子节点 ' + b.listKids + ' / 文本 ' + b.listText + ' 字）');
  ok(b.hasFullCard, '写作「完整模考」入口卡已渲染（writing.js 自身 init 填的）');
  ok(bErrs.length === 0, '零页面错误' + (bErrs.length ? ' — ' + bErrs.join(' | ') : ''));

  // 切回阅读再切回来：不应重复插入脚本、不应报错
  await pgB.click('#mockTabs [data-mtab="reading"]');
  await pgB.waitForTimeout(200);
  await pgB.click('#mockTabs [data-mtab="writing"]');
  await pgB.waitForTimeout(600);
  const c = await pgB.evaluate(() => ({
    /* 10/17：selector 由 script[src*="writing"] 收窄为 data-late —— 第二步新增的
         js/factory-writing.js 名字里也含 writing，旧写法会把它一起数进来（探针假失败）。 */
      scripts: document.querySelectorAll('script[data-late="1"]').length,
      facScripts: document.querySelectorAll('#hubFactoryWriting').length,
    kids: (document.getElementById('examList') || { children: [] }).children.length,
    errs: 0
  }));
  ok(c.scripts === 2, '重复切 tab 不会重复插入脚本（script 标签数 = ' + c.scripts + '）');
  ok(c.facScripts === 1, '出厂内容脚本只插一次（幂等，count=' + c.facScripts + '）');
  ok(c.kids > 0, '切回后列表仍在（' + c.kids + ' 项）');
  /* ⚠️ 不能断言「网络请求恰好 2 次」：软导航的 prefetchAll 会为 writing.html 预热
     js/writing.js（writing.html 自己声明了它），所以同一 URL 会出现第 3、4 次请求 ——
     那是预热机制不是重复插入。这里只断言「没有重复插 <script> 标签」（上面那条）。 */
  const lateReqs = reqs.filter(u => /writing(_prompts)?\.js/.test(u)).length;
  ok(lateReqs >= 2, '两个写作脚本确实被请求过（' + lateReqs + ' 次，含 prefetchAll 为写作页预热）');

  /* ---------- C. 空闲预热：不点写作也会自己加载 ---------- */
  console.log('\n[C] load 后的空闲预热');
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxC.addInitScript(SEED);
  const cReqs = [];
  const pgC = await ctxC.newPage();
  pgC.on('request', r => cReqs.push(r.url()));
  await pgC.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await pgC.waitForTimeout(3500);
  const pw = await pgC.evaluate(() => ({
    fnReady: typeof window.renderExamList === 'function',
    loaded: performance.getEntriesByType('resource').filter(e => /writing(_prompts)?\.js/.test(e.name)).map(e => e.name.split('/').pop().split('?')[0])
  }));
  /* 语义断言：没点过写作 tab，但预热已经让写作脚本可用（用户真去点时不用等）。
     不数网络请求次数 —— prefetchAll 也会为 writing.html 拉 js/writing.js。 */
  ok(pw.fnReady, '未点写作 tab，预热已让写作功能就绪（renderExamList 是函数）');
  ok(pw.loaded.indexOf('writing_prompts.js') >= 0, '预热也拉起了 writing_prompts.js（题库数据）');

  /* ---------- E. 慢网首屏字节（手机画像） ---------- */
  console.log('\n[E] 手机 Slow4G 首屏传输字节');
  const ctxE = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
  });
  await ctxE.addInitScript(SEED);
  const pgE = await ctxE.newPage();
  const cdp = await ctxE.newCDPSession(pgE);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
  const t0 = Date.now();
  await pgE.goto(BASE + '/bank.html', { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  const e = await pgE.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const rs = performance.getEntriesByType('resource');
    const sum = rs.reduce((n, x) => n + (x.transferSize || 0), 0);
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null, tr: Math.round(sum / 1024), reqs: rs.length,
      names: rs.map(x => x.name.split('/').pop().split('?')[0])
    };
  });
  console.log('    FCP=' + e.fcp + 'ms  load=' + loadMs + 'ms  首屏传输 ' + e.tr + 'KB / ' + e.reqs + ' 请求');
  console.log('    首屏资源: ' + e.names.join(', '));
  ok(e.fcp != null && e.fcp > 0, 'FCP 有值（' + e.fcp + 'ms）');
  /* 本质断言：首屏资源里没有写作脚本（不比字节 —— 本地 python http.server 不压缩，
     和线上压缩后的数字不同口径；线上对比在部署后用同一探针再跑一次）。 */
  /* 🔴 10/20 改判据：原来是「首屏资源名单里不含 writing*.js」，但软导航的 prefetchAll 会在
     load 后空闲期把全站页面+脚本全预热一遍（10/8 起的全量预热），名单里必然出现 writing.js ——
     那是**有意为之的预热**，不是「懒加载失效」。真正的验收点是「首屏关键期（≤ FCP+60ms）
     内没有开始加载」，用 startTime 判定，与 B 段的判据保持一致。 */
  const lateEarly = await pgE.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const f = fcp ? fcp.startTime : 0;
    return performance.getEntriesByType('resource')
      .filter(x => /writing(_prompts)?\.js/.test(x.name) && x.startTime <= f + 60)
      .map(x => x.name.split('/').pop().split('?')[0]);
  });
  ok(lateEarly.length === 0,
     '写作脚本不在首屏关键期（FCP+60ms 内开始加载的：' + (lateEarly.join(', ') || '无') +
     '；名单里出现是 prefetchAll 空闲预热，属预期）');
  ok(e.reqs <= 80, '首屏请求数未失控（' + e.reqs + ' 条；含 prefetchAll 全站预热，不是首屏关键路径）');

  console.log('\n结果: ' + pass + '/' + (pass + fail));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();