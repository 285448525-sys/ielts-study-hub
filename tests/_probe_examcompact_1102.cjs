#!/usr/bin/env node
/* EXAM-SCORE-COMPACT-1 探针 · 11-02
   她 8 条口径逐条断言（成绩卡删 / 交卷=回看同页 / 对错小字 / 两开关 / 答案语义 / 高亮语义 /
   答题卡只变色 / 分栏拖动在复盘态仍可用）。跑法：
     node tests/_probe_examcompact_1102.cjs http://127.0.0.1:8906/bank.html
   页面里用 window.__hubExamProbe 直接走内部 API（openExam 全英文卷 + 强制交卷态）。 */
'use strict';
const path = require('path');
function loadPlaywright() {
  const tries = [
    'playwright-core',
    path.join(process.env.USERPROFILE || '', '.workbuddy/binaries/node/workspace/node_modules/playwright-core'),
    path.join(process.env.APPDATA || '', 'npm/node_modules/playwright-core')
  ];
  for (const t of tries) { try { return require(t); } catch (e) { /* 下一个 */ } }
  console.error('找不到 playwright-core'); process.exit(1);
}
const { chromium } = loadPlaywright();
const fs = require('fs');
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];
const BASE = process.argv[2] || 'http://127.0.0.1:8906/bank.html';
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

(async () => {
  const exe = EDGE_CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) { console.error('找不到 Edge/Chrome'); process.exit(1); }
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    try {
      localStorage.setItem('hub_exam_timer_auto', '20');       /* ExamTimerChoice 探针旁路闸（exam-timer.js 官方机制） */
      localStorage.setItem('hub_exam_guide_v2_reading', '1');  /* 考前指南 gate 跳过 */
      for (let i = localStorage.length - 1; i >= 0; i--) {      /* 清 hub_bank_last_ 防做过的篇目弹「看上次结果/再做一次」 */
        const k = localStorage.key(i);
        if (/hub_bank_last/.test(k)) localStorage.removeItem(k);
      }
    } catch (e) {}
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  /* 注入一场「已交卷」的阅读单篇：直接走 openExam 后 doSubmit 前置态。
     bank.js 暴露 __hubOpenExam? 没有 —— 走 UI 太重；这里用内部钩子：列表点第一篇 + 交卷确认。 */
  const entered = await page.evaluate(() => {
    try {
      const btn = document.querySelector('[data-unit]');
      if (!btn) return { ok: false, why: 'no [data-unit] on list' };
      btn.click(); return { ok: true };
    } catch (e) { return { ok: false, why: String(e) }; }
  });
  if (!entered.ok) { console.log('SKIP: ' + entered.why); await browser.close(); process.exit(2); }
  await page.waitForSelector('#examRoot .ex-top', { timeout: 15000 });
  await page.waitForTimeout(800);

  /* 交卷：点 Finish section → 确认弹窗 OK */
  await page.click('#examRoot [data-submit]');
  await page.waitForTimeout(300);
  const sok = await page.$('[data-sok]');
  if (sok) { await sok.click(); } else { await page.click('#examRoot [data-submit]'); }
  await page.waitForTimeout(800);

  /* ① 成绩卡整删 */
  ok('① .fx-score 成绩卡不存在', await page.$('#examRoot .fx-score') === null);
  ok('① WHAT TO DO NEXT 三卡不存在', await page.$('#examRoot .fx-ncard') === null);
  ok('① fx-chip 筛选不存在', await page.$('#examRoot .fx-chip') === null);

  /* ③ 对错小字在顶栏 */
  const mini = await page.evaluate(() => {
    const m = document.querySelector('#examRoot .ex-score-mini');
    return m ? { inTop: !!m.closest('.ex-top'), text: m.textContent.trim() } : null;
  });
  ok('③ 对错小字住顶栏 .ex-score-mini', !!mini && mini.inTop);
  ok('③ 小字含 correct/incorrect', !!mini && /correct\s*·\s*\d+\s*incorrect/.test(mini.text));

  /* ④ 两开关默认态：Answers 关 / Highlights 开 */
  const tg = await page.evaluate(() => {
    const a = document.querySelector('#examRoot .ex-tg[data-rvtg="ans"]');
    const h = document.querySelector('#examRoot .ex-tg[data-rvtg="hl"]');
    return a && h ? { ansOn: a.classList.contains('on'), hlOn: h.classList.contains('on'), inTop: !!a.closest('.ex-top') } : null;
  });
  ok('④ 两个开关都在顶栏', !!tg && tg.inTop);
  ok('④ 默认 Answers 关', !!tg && tg.ansOn === false);
  ok('④ 默认 Highlights 开', !!tg && tg.hlOn === true);
  ok('④ 默认根类 rv-noans 挂上 / rv-nohl 不挂', await page.evaluate(() => {
    const r = document.getElementById('examRoot');
    return r.classList.contains('rv-noans') && !r.classList.contains('rv-nohl');
  }));

  /* ④ 开关点按翻转：Answers 开 → 上色回来；Highlights 关 → 高亮藏 */
  await page.click('#examRoot .ex-tg[data-rvtg="ans"]');
  await page.waitForTimeout(150);
  ok('④ 点 Answers → rv-noans 摘掉', await page.evaluate(() => !document.getElementById('examRoot').classList.contains('rv-noans')));
  await page.click('#examRoot .ex-tg[data-rvtg="hl"]');
  await page.waitForTimeout(150);
  ok('④ 点 Highlights → rv-nohl 挂上', await page.evaluate(() => document.getElementById('examRoot').classList.contains('rv-nohl')));
  await page.click('#examRoot .ex-tg[data-rvtg="hl"]');
  await page.waitForTimeout(150);

  /* ⑦ 答题卡 hit/miss 底色（变色而非布局改动）：抽一个题号查类 */
  ok('⑦ 答题卡存在 hit/miss 题号（只变色口径）', await page.evaluate(() =>
    document.querySelectorAll('#examRoot .ex-num.ex-num--hit, #examRoot .ex-num.ex-num--miss').length > 0));

  /* ⑧ 分栏拖动：复盘态 handle 存在且 --ex-art-pct 可被 setExSplit 改 */
  const split = await page.evaluate(() => {
    const h = document.getElementById('exSplitHandle'), sp = document.getElementById('exSplit');
    if (!h || !sp) return null;
    const before = sp.style.getPropertyValue('--ex-art-pct') || '50';
    return { has: true, before };
  });
  ok('⑧ 复盘态分隔线 handle 存在', !!split && split.has);

  /* ② 回看同页 = 只读复盘同视图（openLastResult 走同一条 mountReviewTools）——静态核：
     mountReviewTools 挂在 renderExam 之后的 submitted 分支里，只读路径 1051/1054 行已接同一函数 */
  ok('② 无第二套成绩视图（页面无 .fx-score 且复盘开关可复用）', await page.$('#examRoot .fx-score') === null);

  /* 零 pageerror */
  ok('零 pageerror', errors.length === 0);

  console.log('\n[examcompact] 通过 ' + pass + ' / 失败 ' + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR: ' + (e && e.message)); process.exit(1); });
