/* 10/17 性能批 · 「完整模考入口卡静态化」验证（CLS 修复）
   背景：#fullEntry / #listenFullEntry 原来是空 div，manifest(114KB) 到了才由 JS
   注入 242px 高的入口卡，把 .partbar / #bankList 顶下去 —— 手机 Slow4G 实测 CLS 0.238，
   单发偏移占 99% 且发生在遮罩收起之后（用户看得见）。
   现在卡片结构静态写在 bank.html，JS 只切 disabled / 数据不足时整块移除。
   探针要证明四件事：
     ① 首帧（manifest 未到时）卡片就有高度（这才是「不再被顶下去」的物理保证）
     ② 首帧按钮 disabled（防止点了 Start 什么都不发生）
     ③ manifest 到货后按钮变可点，且点下去真能进考场（功能没被我改坏）
     ④ 手机慢网下 CLS 接近 0（修好了，而不是换了个地方跳）
   跑法：node tests/_with_server.cjs tests/_probe_fullentry_1017.cjs 8897 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8897';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });

  // ---------- 第一段：桌面，验「首帧即有高度 + disabled → enabled → 能进考场」 ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) {}
      if (!localStorage.getItem('hub_onboarding_v2')) {
        localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      }
      if (!localStorage.getItem('ielts_study_hub_v1')) {
        localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
      }
    });
    const errs = [];
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));

    // 用「节流到 manifest 之后再放行」的办法抓首帧状态：
    // 直接 goto 后立刻读，但网络太快可能已经到位 —— 所以同时做一次路由慢放。
    await p.route('**/bank/manifest.json*', async route => {
      await new Promise(r => setTimeout(r, 2500));
      await route.continue();
    });
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });

    // ① 首帧（manifest 被拖住，此刻 _manifest 必为 null）
    const early = await p.evaluate(() => {
      const fe = document.getElementById('fullEntry');
      const card = fe && fe.querySelector('.full-card');
      const btn = fe && fe.querySelector('[data-fullstart]');
      const lfe = document.getElementById('listenFullEntry');
      const lcard = lfe && lfe.querySelector('.full-card');
      /* ⚠️ 听力 pane 首屏是 hidden 的，hidden 元素任何布局度量都是 0 ——
         要量它的真实高度必须临时显形再量回来（否则会误判成「卡片不存在」）。 */
      const pane = document.getElementById('pane-listening');
      const wasHidden = pane ? pane.hidden : null;
      if (pane) pane.hidden = false;
      const lcardH = lcard ? Math.round(lcard.getBoundingClientRect().height) : 0;
      if (pane) pane.hidden = wasHidden;
      return {
        cardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
        btnExists: !!btn,
        btnDisabled: btn ? btn.disabled : null,
        listTop: Math.round(document.getElementById('bankList').getBoundingClientRect().top),
        lcardH: lcardH,
        lbtnDisabled: (() => { const b = lfe && lfe.querySelector('[data-lfullstart]'); return b ? b.disabled : null; })(),
      };
    });
    ok(early.cardH > 100, '① 首帧入口卡已有高度（' + early.cardH + 'px）—— 不再靠晚注入撑开');
    ok(early.btnExists === true, '② 首帧 Start 按钮存在');
    ok(early.btnDisabled === true, '③ 首帧按钮是 disabled（数据没到点了也没用）');
    ok(early.lcardH > 100, '③b 听力入口卡同样静态（' + early.lcardH + 'px）');
    ok(early.lbtnDisabled === true, '③c 听力按钮首帧也 disabled');
    const listTopEarly = early.listTop;

    // ③ manifest 到货后
    await p.waitForFunction(() => {
      const btn = document.querySelector('#fullEntry [data-fullstart]');
      return btn && btn.disabled === false;
    }, { timeout: 15000 });
    ok(true, '④ manifest 到货后按钮变可点');

    // ④ 卡片高度前后一致（必须在点 Start 之前量：进考场后 #bankRoot 是 display:none，
    //    量到的 rect 高度会是 0 —— 那是隐藏、不是「卡变矮了」）
    const after = await p.evaluate(() => {
      const fe = document.getElementById('fullEntry');
      return { cardH: Math.round(fe.querySelector('.full-card').getBoundingClientRect().height) };
    });
    ok(after.cardH === early.cardH, '⑤ 卡片高度前后一致（' + early.cardH + ' → ' + after.cardH + 'px，没有「从 0 长出来」）');

    // ⑤ 点 Start 真能进考场（功能回归）
    await p.click('#fullEntry [data-fullstart]');
    await p.waitForSelector('#examRoot .ex-top, #examRoot .ex-name', { timeout: 20000 });
    const inExam = await p.evaluate(() => {
      return {
        hasQ: document.querySelectorAll('#examRoot .ex-q, #examRoot .ex-num').length,
        bankHidden: document.getElementById('bankRoot').style.display === 'none',
      };
    });
    ok(inExam.bankHidden === true, '⑥ 点 Start 后题库列表隐藏、进入考场');
    ok(inExam.hasQ > 0, '⑦ 考场内确实渲染了题目（' + inExam.hasQ + ' 个题号元素）');

    ok(errs.length === 0, '⑧ 零页面错误');
    if (errs.length) console.log('     errors: ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------- 第二段：手机慢网，验 CLS 真的降下来了 ----------
  {
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
    });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) {}
      if (!localStorage.getItem('hub_onboarding_v2')) {
        localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
      }
      if (!localStorage.getItem('ielts_study_hub_v1')) {
        localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
      }
      window.__shifts = [];
      try {
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            const top = (e.sources || []).slice().sort((a, z) => z.currentRect.top - a.currentRect.top)[0];
            window.__shifts.push({
              v: e.value, t: Math.round(e.startTime),
              d: top && top.node ? (top.node.nodeName + (top.node.id ? '#' + top.node.id : '')) : '?',
            });
          }
        }).observe({ entryTypes: ['layout-shift'] });
      } catch (err) {}
    });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
    });

    await p.goto(BASE + '/bank.html', { waitUntil: 'load' });
    await p.waitForTimeout(9000);
    const m = await p.evaluate(() => {
      const s = window.__shifts || [];
      const total = s.reduce((a, x) => a + x.v, 0);
      const biggest = s.slice().sort((a, z) => z.v - a.v)[0] || null;
      return { total: +total.toFixed(4), n: s.length, biggest: biggest ? (biggest.v.toFixed(4) + '@' + biggest.t + ' ' + biggest.d) : '-' };
    });
    console.log('  [手机 Slow4G] bank 总 CLS=' + m.total + '  条目=' + m.n + '  最大单发=' + m.biggest);
    ok(m.total < 0.05, '⑨ 手机慢网下 CLS < 0.05（改前 0.238）');
    const bad = m.biggest.includes('bankList');
    ok(!bad, '⑩ 最大偏移不再来自 #bankList（改前正是它被顶下去 258px）');
    await ctx.close();
  }

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
