/* ===== 10/17 「没有答案的篇目」交卷后到底发生什么 —— 取证探针 =====
   11-15 PERM-REG-1：答案库 10-19 已补齐 280/280，不再有天然的「无答案篇目」；
   本支改由本地 page.route 把 answers/<UNIT>.json 顶成 404，保留「进场时没有答案」
   这一原始场景，验证交卷后不产假成绩、不写 0 分记录。产品路径零改动。
   跑法：node tests/_with_server.cjs tests/_probe_noans_1017.cjs 8941
   断言：只陈述事实（不预设结论），把交卷后用户看到的东西逐项打出来。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const U = require('./_review_util.cjs');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8941';
const ROOT = path.resolve(__dirname, '..');
/* 11-15 PERM-REG-1：截图只留本地 tests/ 诊断目录，绝不写设计稿目录。 */
const SHOT = path.join(ROOT, 'tests', '_diag_perm6_fix_exam', '_noans1017');
/* 11-15 PERM-REG-1：答案库 10-19 已补齐 280/280；「无答案篇目」改由本地路由把
   answers/<UNIT>.json 顶成 404 的同一夹具（noans2 早就是这套做法），产品路径零改动。 */
const UNIT = process.env.UNIT || '2017137445827088386';   /* The Blockbuster Phenomenon · 本地夹具掐掉答案 */
const N_ANSWER = 4;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const hasAns = fs.existsSync(path.join(ROOT, 'bank/answers', UNIT + '.json'));
  console.log('篇目 ' + UNIT + ' · 仓库有答案文件 = ' + hasAns + '（11-15 起由 page.route 掐成 404 模拟「进场时没有」）');

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e && e.message || e)));
  /* 11-15 PERM-REG-1：EXAM-TIMER-CHOICE-1（10-31）后单篇阅读进场会问计时；
     官方探针旁路 = hub_exam_timer_auto（js/exam-timer.js:114），与 guide 已读键同写。
     原来 localStorage.clear() 会把刚写的旁路冲掉，已去掉；U.openUnit() 也会再 seed 一次。 */
  await pg.addInitScript(() => { try {
    localStorage.setItem('hub_exam_guide_v2_reading','1');
    localStorage.setItem('hub_exam_guide_v2_listening','1');
    localStorage.setItem('hub_exam_timer_auto','20');
    localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true }));
  } catch (e) {} });

  /* SW 的 fetch 不走 page.route；掐答案前先抹 serviceWorker（同 noans2 10-20 夹具）。 */
  await pg.addInitScript(() => { try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true }); } catch (e) {} });
  await pg.route('**/bank/answers/' + UNIT + '.json*', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await pg.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2500);
  const opened = await U.openUnit(pg, UNIT);
  ok(opened, '能打开该篇目（列表里点进去）');

  /* 作答 N 道（每题点第一个可点选项 / 填一个词），只看「交卷那一刻系统怎么说」 */
  const answered = await pg.evaluate((n) => {
    let done = 0;
    const boxes = Array.from(document.querySelectorAll('#examRoot .ex-radio-box[data-q]'));
    for (const b of boxes) {
      if (done >= n) break;
      const inp = b.querySelector('input');
      if (inp) { inp.click(); inp.dispatchEvent(new Event('change', { bubbles: true })); done++; }
    }
    if (done < n) {
      const blanks = Array.from(document.querySelectorAll('#examRoot input.ex-blank[data-q]'));
      for (const b of blanks) {
        if (done >= n) break;
        b.value = 'test'; b.dispatchEvent(new Event('input', { bubbles: true })); b.dispatchEvent(new Event('change', { bubbles: true })); done++;
      }
    }
    return done;
  }, N_ANSWER);
  console.log('  作答题数 = ' + answered);

  const sub = await pg.$('#examRoot [data-submit]');
  ok(!!sub, '交卷按钮存在');
  if (sub) {
    await sub.click();
    await pg.waitForTimeout(600);
    /* 交卷是两步：先点按钮弹确认层，再点确认（#exSubmitModal [data-sok]） */
    const sok = await pg.$('#exSubmitModal [data-sok]') || await pg.$('[data-sok]');
    ok(!!sok, '确认弹层出现（这一步以前漏了 → 上一轮读数全是 null）');
    if (sok) { await sok.click(); await pg.waitForTimeout(1800); }
  }

  /* 交卷后用户实际看到的东西 */
  const view = await pg.evaluate(() => {
    const q = s => document.querySelector(s);
    const all = s => Array.from(document.querySelectorAll(s));
    const meta = q('#examRoot .fx-meta') ? q('#examRoot .fx-meta').innerText.replace(/\s+/g, ' ').trim() : null;
    /* 11-02 结论条整块退役：verdicts / rightCells 恒空；这条取证口径保留（打在日志里），
       判据改成「结论条 0 条」。上色改用 .ex-qn.hit/.miss 与答题卡红绿。 */
    const verdicts = all('#examRoot .ex-rv-v').map(e => e.textContent.trim());
    const rvCount = all('#examRoot .ex-rv').length;
    const sheet = all('#examRoot .ex-num');
    let rec = null;
    try {
      const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
      const rs = (d.mockRecords || []).filter(r => r.src === 'bank');
      if (rs.length) { const r = rs[0]; rec = { correct: r.correct, total: r.total, title: r.title || r.unitId, parts: r.parts ? r.parts.length : 0, hasDetail: Array.isArray(r.detail) }; }
    } catch (e) { rec = { err: String(e && e.message || e) }; }
    return {
      meta, verdicts, rvCount,
      /* 11-15 PERM-REG-1：11-02 成绩卡整删后，「无答案不判分」的现版等价物是
         .fx-noscore 横幅 + 顶栏无对错小字；旧 .fx-score 不该被当成产品 bug。 */
      noScoreBanner: !!q('#examRoot .fx-noscore'),
      scoreCardGone: !q('#examRoot .fx-score'),
      mini: q('#examRoot .ex-score-mini') ? q('#examRoot .ex-score-mini').innerText.replace(/\s+/g, ' ').trim() : null,
      nQnHit: all('#examRoot .ex-qn.hit').length,
      nQnMiss: all('#examRoot .ex-qn.miss').length,
      nSheetHit: sheet.filter(e => e.classList.contains('ex-num--hit')).length,
      nSheetMiss: sheet.filter(e => e.classList.contains('ex-num--miss')).length,
      nSheetTotal: sheet.length,
      record: rec
    };
  });
  console.log('\n== 交卷后用户看到的 ==');
  console.log('  成绩卡/横幅文字 = ' + JSON.stringify(view.meta));
  console.log('  未判分横幅 = ' + view.noScoreBanner + ' · 旧成绩卡已撤 = ' + view.scoreCardGone + ' · 顶栏小字 = ' + JSON.stringify(view.mini));
  console.log('  逐题结论条 = ' + view.rvCount + ' 条（11-02 起应为 0）');
  console.log('  题号上色 = hit ' + view.nQnHit + ' / miss ' + view.nQnMiss);
  console.log('  答题卡 = 绿底 ' + view.nSheetHit + ' / 红底 ' + view.nSheetMiss + ' / 共 ' + view.nSheetTotal);
  console.log('  写进回顾页的记录 = ' + JSON.stringify(view.record));

  ok(view.rvCount === 0, '逐题结论条已删干净（' + view.rvCount + ' 条，期望 0）');
  ok(view.noScoreBanner && view.scoreCardGone && view.mini === null,
    '无答案篇目交卷后只给未判分横幅，不产成绩卡或对错小字');
  ok(view.nQnHit === 0 && view.nQnMiss === 0 && view.nSheetHit === 0 && view.nSheetMiss === 0,
    '题号/答题卡都没有假对错底色（' + JSON.stringify({ qnHit: view.nQnHit, qnMiss: view.nQnMiss, sheetHit: view.nSheetHit, sheetMiss: view.nSheetMiss }) + '）');
  ok(view.record === null, '未判分不写回顾页记录（' + JSON.stringify(view.record) + '）');
  await pg.screenshot({ path: path.join(SHOT, 'before_desktop.png'), fullPage: false });
  const card = await pg.$('#examRoot');
  if (card) await card.screenshot({ path: path.join(SHOT, 'before_card.png') });
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(2000);
  /* 11-15 PERM-REG-1：把原来「无条件通过」的截图占位改成真实验收：
     手机列表真渲染、且没有横向溢出（仍保留原「手机能打开」的断言意图）。 */
  const mobState = await mob.evaluate(() => ({
    listItems: document.querySelectorAll('#bankList [data-unit]').length,
    bankVisible: !!document.getElementById('bankRoot') && getComputedStyle(document.getElementById('bankRoot')).display !== 'none',
    scrollWidth: document.documentElement.scrollWidth
  }));
  ok(mobState.bankVisible && mobState.listItems > 0 && mobState.scrollWidth <= 391,
    '手机尺寸列表页可打开且无横向溢出（' + JSON.stringify(mobState) + '）');
  await mob.screenshot({ path: path.join(SHOT, 'before_mobile_list.png') });

  console.log('\n页面错误 ' + errs.length + ' 条' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await browser.close();
  /* 11-15 PERM-REG-1：取证探针也按真实断言给退出码，不再无条件 0。 */
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了: ' + (e && e.stack || e)); process.exit(1); });