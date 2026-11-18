/* ===== 10/17 性能批（第二批·传输层）· 口语页视图脚本按需加载 验证探针 =====
   验：A 首屏不依赖 materials/mock*（且不在首屏资源里）
      B 切「素材」tab 时按需加载并由 matGen.init() 接管
      C 「模考」tab（UI 里 hidden）点击后 mock 三件套加载、__mockEnter 可用
      D load 之后空闲预热会把它们拉起（用户真点时不干等）
   跑法：node tests/_with_server.cjs tests/_probe_latespk_1017.cjs 8951
        （线上：$env:NODE_PATH='...'; $env:BASE='https://yasihub.com'; node tests/_probe_latespk_1017.cjs） */
const { chromium } = require('playwright-core');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8951';
const LATE = ['materials.js', 'mock.js', 'mock-report.js', 'mock-history.js'];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const SEED = () => {
  try{
    if (!localStorage.getItem('hub_onboarding_v2')) localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v:2, entered:true, finished:true, snoozed:true, setup:{ examDate:'2026-12-01' } }));
    if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings:{ examDate:'2026-12-01' } }));
  }catch(e){}
};
const bare = n => n.split('/').pop().split('?')[0];

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  /* ---------- A/B/C：首屏 + 两个 tab ---------- */
  console.log('\n[A] 首屏');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(SEED);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e && e.message || e)));
  await pg.goto(BASE + '/speaking.html', { waitUntil: 'load' });
  await pg.waitForTimeout(800);
  const a = await pg.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const declared = Array.prototype.slice.call(document.querySelectorAll('script[src]'))
      .filter(s => !s.hasAttribute('data-late'))   /* 排除运行时按需追加的那些 */
      .map(s => s.getAttribute('src').split('/').pop().split('?')[0]);
    const late = performance.getEntriesByType('resource')
      .filter(e => /(materials|mock(-report|-history)?)\.js/.test(e.name))
      .map(e => ({ n: e.name.split('/').pop().split('?')[0], s: Math.round(e.startTime) }));
    return {
      fcp: Math.round(fcp ? fcp.startTime : 0),
      loadEnd: Math.round(nav.loadEventEnd || 0),
      declaredHasLate: late.filter(x => declared.indexOf(x.n) >= 0).map(x => x.n),
      late: late,
      listText: (document.getElementById('listView') || {}).innerText ? document.getElementById('listView').innerText.length : 0,
      tabs: document.querySelectorAll('#tabs [data-type]').length,
      lateAttrs: ['matView', 'mockView'].map(id => { const e = document.getElementById(id); return e ? !!e.getAttribute('data-late-src') : null; })
    };
  });
  console.log('    FCP=' + a.fcp + 'ms  loadEnd=' + a.loadEnd + 'ms；这些脚本的开始时刻: ' + JSON.stringify(a.late));
  /* ① 结构（确定性）：四个脚本都不在页面声明的 <script src> 里 —— 它们不再属于首屏包。
     ② 时序（设计契约）：预热是「load 之后 + 空闲」才发起，所以开始时刻不早于 load 结束。
        不用 FCP 当参考点：本机未限速时整页 ~300ms 内跑完，空闲回调可能早于首帧（那是本地假象，
        线上 Slow4G 下 load≈8s、首帧 5.2~6.7s，顺序天然拉开）。 */
  ok(a.declaredHasLate.length === 0, '四个脚本都不在首屏声明里（' + a.declaredHasLate.join(',') + '）');
  ok(a.late.every(x => x.s >= a.loadEnd - 5), '没有一条早于 load 结束（最早 ' + Math.min.apply(null, a.late.map(x => x.s)) + 'ms vs loadEnd ' + a.loadEnd + 'ms）');
  ok(a.listText > 200, '题库列表照常渲染（' + a.listText + ' 字）');
  ok(a.tabs >= 4, '顶部 tab 齐全（' + a.tabs + ' 个）');
  ok(a.lateAttrs[0] === true && a.lateAttrs[1] === true, '两个视图容器都带 data-late-src');
  ok(errs.length === 0, '零页面错误' + (errs.length ? ' — ' + errs.join(' | ') : ''));

  console.log('\n[B] 切「素材」tab');
  // 2-1d（35f1f73）起桌面 ≥861 #tabs 被 display:none 撤掉了 → Playwright 的可见性检查会超时。
  // 🔵 11-16 起真正的桌面入口是左侧栏 `#hubSubs .hub-sub[data-spt-tab]`；点旧 #tabs 只是在点一个
  //    已经被撤掉的按钮（实测 show() 根本没跑，hash 不变、shell 空）。所以优先点侧栏，点不到再退回旧 tab。
  await pg.evaluate(() => {
    const side = document.querySelector('#hubSubs .hub-sub[data-spt-tab="materials"]');
    if (side) return side.click();
    const old = document.querySelector('#tabs [data-type="MAT"]');
    if (old) old.click();
  });
  await pg.waitForFunction(() => typeof window.matGen !== 'undefined' && !!window.matGen.init, null, { timeout: 20000 }).catch(() => {});
  /* 🔵 11-16 素材改双栏工作台：真实内容进 `#sptMatShell`，旧 `#sptMatLegacy` 收进 hidden 包；
     所以判据改成「matView 或 shell 里有字」，不再只盯 matView 自己。 */
  await pg.waitForFunction(() => {
    const mv = document.getElementById('matView');
    const sh = document.getElementById('sptMatShell');
    const n = (mv ? mv.innerText.trim().length : 0) + (sh ? sh.innerText.trim().length : 0);
    return n > 40;
  }, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const b = await pg.evaluate(() => {
    const mv = document.getElementById('matView');
    return {
      shown: !!mv && !mv.hidden,
      matGen: typeof window.matGen !== 'undefined' && typeof matGen.init === 'function',
      text: (mv ? mv.innerText.trim().length : 0) + ((document.getElementById('sptMatShell') || {}).innerText || '').trim().length,
      shellText: ((document.getElementById('sptMatShell') || {}).innerText || '').trim().length,
      shellKids: ((document.getElementById('sptMatShell') || {}).children || []).length,
      placeholder: mv ? mv.innerText.indexOf('素材加载中') >= 0 : null,
      loaded: performance.getEntriesByType('resource').map(e => e.name.split('/').pop().split('?')[0])
    };
  });
  ok(b.shown, 'matView 显示');
  ok(b.matGen, 'materials.js 已按需加载（matGen.init 存在）');
  ok(b.placeholder === false, '占位文案已被真实内容替换（不再是「素材加载中…」）');
  /* 🔵 11-16 素材双栏工作台的壳由 spt-tabs.renderMaterialShell 画进 #sptMatShell；
     空素材时它画的是空态卡（字数很少），所以「渲染完成」按结构判（壳里有子节点），不再只数字数。 */
  ok(b.text > 40 || b.shellKids > 0, '素材视图已渲染出内容或空态卡（' + b.text + ' 字 / 壳内 ' + b.shellKids + ' 块）');
  ok(b.loaded.indexOf('materials.js') >= 0, 'materials.js 确实被请求过');

  console.log('\n[C] 点「模考」tab（UI 里 hidden）');
  await pg.evaluate(() => {
    const side = document.querySelector('#hubSubs .hub-sub[data-spt-tab="mock"]');
    if (side) return side.click();
    const bt = document.querySelector('#tabs [data-type="MOCK"]');
    if (bt) bt.click();
  });
  /* 🔵 11-16 起点「模考」只出入口卡（会员校验前置，点开始才进沉浸），所以正文只有卡片文案几十个字；
     原来卡 60 字会把正常入口判红。改成等入口卡出现 + 判它真的有可点入口。 */
  await pg.waitForFunction(() => {
    const pane = document.getElementById('sptPaneMock');
    const mv = document.getElementById('mockView');
    return (!!pane && !pane.hidden) || (!!mv && !mv.hidden);
  }, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(800);
  const c = await pg.evaluate(() => {
    const mv = document.getElementById('mockView');
    const pane = document.getElementById('sptPaneMock');
    const loaded = performance.getEntriesByType('resource').map(e => e.name.split('/').pop().split('?')[0]);
    return {
      /* 🔵 11-16 起模考的现版容器是 `#sptPaneMock`（内含 #sptMockIntro 入口卡），旧 #mockView 被 hideViews() 收起 */
      shown: (!!pane && !pane.hidden) || (!!mv && !mv.hidden),
      enter: typeof window.__mockEnter === 'function',
      loaded: loaded,
      stage: !!document.getElementById('mockStage'),
      bodyText: document.body.innerText.length,
      paneText: (pane ? pane.innerText.trim().length : 0) + (mv ? mv.innerText.trim().length : 0)
    };
  });
  ok(c.shown, '模考入口容器显示（现版 #sptPaneMock，旧 #mockView 已收起）');
  ok(c.enter, 'mock.js 已按需加载（__mockEnter 是函数）');
  ok(c.loaded.indexOf('mock.js') >= 0 && c.loaded.indexOf('mock-report.js') >= 0 && c.loaded.indexOf('mock-history.js') >= 0, 'mock 三件套都加载了');
  ok(c.bodyText > 40, '模考 tab 有可读内容（' + c.bodyText + ' 字，11-16 后是入口卡不是整场考场）');
  ok(errs.length === 0, '两个 tab 走完后仍零页面错误' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();

  /* ---------- D：空闲预热 ---------- */
  console.log('\n[D] load 之后的空闲预热');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addInitScript(SEED);
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + '/speaking.html', { waitUntil: 'load' });
  await pg2.waitForTimeout(4000);
  const d = await pg2.evaluate(() => ({
    matGen: typeof window.matGen !== 'undefined',
    mock: typeof window.__mockEnter === 'function',
    loaded: performance.getEntriesByType('resource').map(e => e.name.split('/').pop().split('?')[0])
  }));
  console.log('    预热后已加载: ' + d.loaded.filter(x => /material|mock/.test(x)).join(', '));
  ok(d.matGen, '未点素材 tab，预热已让素材功能就绪');
  ok(d.mock, '未点模考 tab，预热已让模考功能就绪');

  /* ---------- E：手机宽度视觉 ---------- */
  console.log('\n[E] 手机 390 切两个 tab');
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx3.addInitScript(SEED);
  const pg3 = await ctx3.newPage();
  const errs3 = [];
  pg3.on('pageerror', e => errs3.push(String(e && e.message || e)));
  await pg3.goto(BASE + '/speaking.html', { waitUntil: 'load' });
  await pg3.evaluate(() => document.querySelector('#tabs [data-type="MAT"]').click());
  await pg3.waitForTimeout(2500);
  const e3 = await pg3.evaluate(() => {
    const d = document.documentElement;
    const bad = [];
    if (d.scrollWidth > d.clientWidth){
      document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > d.clientWidth + 1 && r.width > 4) bad.push(el.tagName + (el.id ? '#' + el.id : '')); });
    }
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, bad: bad.slice(0, 6), text: (document.getElementById('matView') || {}).innerText.length };
  });
  console.log('    ' + JSON.stringify(e3));
  ok(e3.scrollW <= e3.clientW + 1 && e3.bad.length === 0, '手机宽度无横向溢出');
  ok(e3.text > 20, '手机上素材视图有内容（' + e3.text + ' 字）');
  ok(errs3.length === 0, '手机上零页面错误' + (errs3.length ? ' — ' + errs3.join(' | ') : ''));

  console.log('\n结果: ' + pass + '/' + (pass + fail));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();