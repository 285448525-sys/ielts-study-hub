/* ===== 10/17 「没有答案的篇目」交卷后到底发生什么 —— 取证探针 =====
   为什么：280 篇阅读里 212 篇没有答案文件（bank/answers/<id>.json），
   现在交卷会每题判 Incorrect、给出 0/13 假成绩，并把这条 0 分写进回顾页记录。
   本探针把这个「现在」拍成证据（截图 + localStorage 记录），改完之后用同一支探针复跑做对照。
   跑法：node tests/_with_server.cjs tests/_probe_noans_1017.cjs 8941
   断言：只陈述事实（不预设结论），把交卷后用户看到的东西逐项打出来。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const U = require('./_review_util.cjs');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8941';
const ROOT = path.resolve(__dirname, '..');
const SHOT = path.join(ROOT, 'design', '_noans1017');
const UNIT = process.env.UNIT || '2017137445827088386';   /* The Blockbuster Phenomenon · 无答案文件 */
const N_ANSWER = 4;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const hasAns = fs.existsSync(path.join(ROOT, 'bank/answers', UNIT + '.json'));
  console.log('篇目 ' + UNIT + ' · 本地有答案文件 = ' + hasAns + '（本探针要的就是「没有」）');

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e && e.message || e)));
  await pg.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) {} });

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
    const verdicts = all('#examRoot .ex-rv-v').map(e => e.textContent.trim());
    const rightCells = all('#examRoot .ex-rv .ex-rv-r b').map(e => e.textContent.trim());
    const sheet = all('#examRoot .ex-num');
    let rec = null;
    try {
      const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
      const rs = (d.mockRecords || []).filter(r => r.src === 'bank');
      if (rs.length) { const r = rs[0]; rec = { correct: r.correct, total: r.total, title: r.title || r.unitId, parts: r.parts ? r.parts.length : 0, hasDetail: Array.isArray(r.detail) }; }
    } catch (e) { rec = { err: String(e && e.message || e) }; }
    return {
      meta, verdicts,
      nIncorrect: verdicts.filter(v => /Incorrect/i.test(v)).length,
      nCorrect: verdicts.filter(v => /Correct/i.test(v) && !/Incorrect/i.test(v)).length,
      rightCellsSample: rightCells.slice(0, 3),
      nBlankRight: rightCells.filter(t => !t || t === '—' || t === '-').length,
      nSheetHit: sheet.filter(e => e.classList.contains('ex-num--hit')).length,
      nSheetMiss: sheet.filter(e => e.classList.contains('ex-num--miss')).length,
      nSheetTotal: sheet.length,
      record: rec
    };
  });
  console.log('\n== 交卷后用户看到的 ==');
  console.log('  成绩卡文字 = ' + JSON.stringify(view.meta));
  console.log('  逐题结论条 = ' + view.nIncorrect + ' 条 Incorrect / ' + view.nCorrect + ' 条 Correct');
  console.log('  「Correct answer」栏 前 3 个 = ' + JSON.stringify(view.rightCellsSample) + '（空白/破折号 ' + view.nBlankRight + ' 个）');
  console.log('  答题卡 = 绿底 ' + view.nSheetHit + ' / 红底 ' + view.nSheetMiss + ' / 共 ' + view.nSheetTotal);
  console.log('  写进回顾页的记录 = ' + JSON.stringify(view.record));

  ok(view.meta !== null, '成绩卡渲染存在');
  await pg.screenshot({ path: path.join(SHOT, 'before_desktop.png'), fullPage: false });
  const card = await pg.$('#examRoot');
  if (card) await card.screenshot({ path: path.join(SHOT, 'before_card.png') });
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(2000);
  ok(true, '手机尺寸页面可打开（截图备用）');
  await mob.screenshot({ path: path.join(SHOT, 'before_mobile_list.png') });

  console.log('\n页面错误 ' + errs.length + ' 条' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('探针崩了: ' + (e && e.stack || e)); process.exit(1); });