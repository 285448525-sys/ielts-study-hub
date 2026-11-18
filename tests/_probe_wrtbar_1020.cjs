/* 写作机考壳验收（11-18 重写）：单篇「开始写」后的顶栏 / 底栏口径
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_wrtbar_1020.cjs 9923
   🔵 重写原因：10-20 那版等的是「完整写作模考」入口卡 `#writingFullEntry #wrtFullStart`。
   11-16 写作四格改版后，真题模考 pane 换成自己的题库列表 `#wrQList`（.wr-qrow），
   `renderWritingFullEntry()` 只在 boot 阶段跑一次、那时 WRITING_PROMPTS 还没到，所以那张卡在现版页面上不渲染
   （70 篇大作文 / 25 篇小作文的数据是有的）。⇒ 探针改成走真实入口：点题库第一篇 → 进机考壳。
   判据（沿用原 Q1–Q4 意图，取值按 11-18 统一壳）：
        ① 底栏 40±2 高、底色 #f1f2f3、动作按钮 2 枚 28 高（Pause 已撤）
        ② 单篇只挂一个 Task 标签，文字是「Task N」不是「Part N」
        ③ 左栏标题同样写 Task、Finish 文案是 Finish section
        ④ 顶栏全屏按钮在、点一下进全屏、再点还原
        ⑤ 390 宽不溢出 ⑥ 全程零报错、零 /api 调用 */
const { chromium } = require('playwright-core');
const EDGE = process.env.PW_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:9923';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  RED  ' + n + (d ? '  ' + d : '')); } };

async function enterSingle(p) {
  await p.goto(BASE + '/writing.html#wr=exam', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#wrQList .wr-qrow').length > 0, null, { timeout: 25000 }).catch(() => {});
  await sleep(600);
  await p.evaluate(() => { const rows = [...document.querySelectorAll('#wrQList .wr-qrow')]; if (rows[0]) rows[0].click(); });
  await sleep(2200);
  /* 计时选择弹框（若出现）点默认开始 */
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.etc-start, #etGo, .et-choice button, .timer-choice button, .wrt-timer button')];
    const b = btns.find(x => /开始|确定|默认/.test(x.textContent));
    if (b) b.click();
  });
  await sleep(2500);
  return await p.evaluate(() => {
    const el = document.getElementById('examPractice');
    return !!el && !el.hidden;
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; const apiHits = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('request', r => { if (r.url().includes('/api/')) apiHits.push(r.url().replace(BASE, '')); });
  await p.addInitScript(() => { try {
    localStorage.setItem('hub_exam_timer_auto', '20');
    localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
    localStorage.setItem('hub_exam_guide_once', '1');
    ['reading', 'listening', 'writing', 'speaking'].forEach(c => localStorage.setItem('hub_exam_guide_v2_' + c, '1'));
  } catch (e) {} });

  const entered = await enterSingle(p);
  ok('①0 从真题模考列表点第一篇就进机考壳', entered);
  if (!entered) { await b.close(); console.log('\n===== ' + pass + ' 过 / ' + fail + ' 红 ====='); process.exit(1); }

  /* ===== ① 底栏几何 ===== */
  const g = await p.evaluate(() => {
    const bar = document.querySelector('#examPractice .ex-bar');
    const cs = getComputedStyle(bar);
    const btns = [...bar.querySelectorAll('.ex-actions button')].map(x => ({
      t: x.textContent.trim(), h: Math.round(x.getBoundingClientRect().height) }));
    const pgs = [...bar.querySelectorAll('.ex-pg')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    return { h: Math.round(bar.getBoundingClientRect().height), bg: cs.backgroundColor,
      btns, pgs, barText: bar.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
      pause: /Pause|暂停/.test(bar.textContent) };
  });
  ok('①1 底栏高 40±2（11-18 统一壳）', g.h >= 38 && g.h <= 44, 'h=' + g.h);
  ok('①2 底栏底色 #f1f2f3', /241,\s*242,\s*243/.test(g.bg), g.bg);
  ok('①3 动作按钮 2 枚、各 28 高（Exit + Finish section，Pause 已撤）',
    g.btns.length === 2 && g.btns.every(x => x.h === 28), JSON.stringify(g.btns));
  ok('①4 底栏不再有多余的暂停按钮', g.pause === false, g.barText);

  /* ===== ② Task 标签与文案 ===== */
  ok('②1 单篇只挂一个 Task 标签', g.pgs.length === 1, JSON.stringify(g.pgs));
  ok('②2 标签文字是「Task N」不是「Part N」', g.pgs.length === 1 && /^Task\s*\d/i.test(g.pgs[0]), g.pgs[0] || '');
  ok('②3 底栏文字不含 Part', !/Part/.test(g.barText), g.barText);

  const nav = await p.evaluate(() => ({
    partLabel: (document.getElementById('examPartLabel') || {}).textContent || '',
    finTxt: (document.querySelector('#examPractice .ex-actions button:last-child') || {}).textContent || ''
  }));
  ok('③1 左侧标题写 Task 不是 Part', /^Task\s*\d/i.test(nav.partLabel), nav.partLabel);
  ok('③2 Finish 文案是「Finish section」', /Finish section/i.test(nav.finTxt), nav.finTxt);

  /* ===== ④ 全屏 ===== */
  const fs0 = await p.evaluate(() => {
    const btn = document.getElementById('wrtFsBtn');
    if (!btn) return { hasBtn: false };
    const svg = btn.querySelector('svg');
    const menu = document.querySelector('#examPractice [data-ex-menu], #examPractice .ex-menubtn');
    const bb = btn.getBoundingClientRect(); const mb = menu ? menu.getBoundingClientRect() : null;
    return { hasBtn: true, paths: svg ? svg.querySelectorAll('path').length : 0,
      left: mb ? bb.left < mb.left : null,
      title: btn.getAttribute('title') || '', aria: btn.getAttribute('aria-label') || '' };
  });
  ok('④1 顶栏有全屏按钮', fs0.hasBtn === true);
  ok('④2 全屏按钮在 ☰ 左边', fs0.left === true, 'left=' + fs0.left);
  ok('④3 图标是 SVG（≥4 条路径）', fs0.paths >= 4, 'paths=' + fs0.paths);
  ok('④4 title / aria-label 有值且一致', !!fs0.title && fs0.title === fs0.aria, fs0.title + ' / ' + fs0.aria);

  await p.click('#wrtFsBtn');
  await sleep(900);
  const on = await p.evaluate(() => ({ fs: !!document.fullscreenElement,
    title: (document.getElementById('wrtFsBtn') || {}).getAttribute ? document.getElementById('wrtFsBtn').getAttribute('title') : '' }));
  await p.click('#wrtFsBtn');
  await sleep(900);
  const off = await p.evaluate(() => ({ fs: !!document.fullscreenElement,
    title: (document.getElementById('wrtFsBtn') || {}).getAttribute ? document.getElementById('wrtFsBtn').getAttribute('title') : '' }));
  /* 🔵 这个按钮切的是浏览器真全屏（requestFullscreen），不是 body.exam-fullscreen ——
     body 那个类在进机考壳时就加上了，跟它无关。所以判据看 fullscreenElement + 按钮 title。 */
  ok('④5 点一下进浏览器全屏、文案切成 Exit full screen',
    (on.fs === true || /Exit full screen/i.test(on.title)) && /Exit full screen/i.test(on.title || ''), JSON.stringify(on));
  ok('④6 再点还原、文案回到 Full screen', off.fs === false && /Full screen/i.test(off.title || ''), JSON.stringify(off));

  /* ===== ⑤ 390 宽 ===== */
  {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: 390, height: 844 });
    const e2 = await enterSingle(p2);
    ok('⑤0 390 宽也能进机考壳', e2);
    if (e2) {
      const m = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        pgs: [...document.querySelectorAll('#examPractice .ex-bar .ex-pg')].map(x => Math.round(x.getBoundingClientRect().width)) }));
      ok('⑤1 390 宽底栏不横向溢出', m.sw <= m.cw + 1, 'scroll=' + m.sw + ' client=' + m.cw);
      ok('⑤2 390 宽 Task 标签还在且有宽度', m.pgs.length === 1 && m.pgs[0] > 40, JSON.stringify(m.pgs));
    }
    await p2.close();
  }

  ok('⑥ 全程无 JS 报错', errs.length === 0, errs.join(' | ').slice(0, 200));
  ok('⑦ 零 /api/* 调用（线上跑不烧配额）', apiHits.length === 0, JSON.stringify(apiHits.slice(0, 3)));

  await b.close();
  console.log('\n===== ' + pass + ' 过 / ' + fail + ' 红 =====');
  process.exit(fail ? 1 : 0);
})();
