/* ===== 10/17 #9 层次 3 · 「按题型看正确率」验证探针 =====
   验的是一条链：做题页交卷 → 逐题明细带题型短代码 → 落盘 mockRecords[].detail[].t
                → 回顾页按题型聚合（正确率 + 最弱题型提示），且老记录/空记录都不出错。
   跑法：node tests/_with_server.cjs tests/_probe_qtype_1017.cjs 8931
   断言要点：
     A 端到端（真做题真交卷）——题型代码必须与题库数据推出的期望集合完全一致（不是「非空就算过」）
     B 回顾页数字必须与落盘记录逐题对数一致（不是「渲染出条就算过」）
     C 老记录（无题型字段 / 无逐题明细）必须被跳过：不报错、不计 0%
     D 空态给指路文案
     E 「近十天」筛选对题型统计生效
     F 手机 390 无横向溢出
   ⚠️ tests/ 在 .gitignore 内，仅本地探针。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const U = require('./_review_util.cjs');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8931';
const ROOT = path.resolve(__dirname, '..');
const UNIT = '2017067274563325954';          /* A Survivor's Story · Part 1 · 13 题（有答案文件） */
const KNOWN = ['fill', 'single', 'multi', 'match', 'head', 'para', 'map', 'other'];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* 独立复算：从题库数据推出这篇应该出现哪些题型代码（与 bank.js 的 qtypeCode 是两份实现 → 互为交叉验证） */
function expectedCodes(unitId) {
  const cand = ['reading', 'listening'].map(d => path.join(ROOT, 'bank', d, unitId + '.json')).filter(fs.existsSync);
  if (!cand.length) return null;
  const u = JSON.parse(fs.readFileSync(cand[0], 'utf8'));
  const ch = /listening/.test(cand[0].replace(/\\/g, '/')) ? 'listening' : 'reading';
  const out = [], seen = new Set();
  (function walk(o) {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (Array.isArray(o.questions) && o.questions.length && o.type) {
      const t = String(o.type);
      let code = 'other';
      if (t === 'fill-in-the-blank') code = 'fill';
      else if (t === 'matching') {
        const opts = (o.options && o.options.length) ? o.options : ((o.questions[0] && o.questions[0].options) || []);
        const head = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
        code = head ? 'head' : 'match';
      }
      else if (t === 'map') code = ch === 'reading' ? 'para' : 'map';
      else if (t === 'multiple-choice') code = 'multi';
      else if (t === 'single-choice') code = 'single';
      o.questions.forEach(() => out.push(code));
    }
    Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
  })(u);
  return out;
}

/* 播种：只种不覆盖（addInitScript 每次导航都重跑，无条件写会冲掉刚交卷落盘的数据 → 假失败） */
const seed = (recs) => (args) => {
  try {
    try { localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) {}
    if (!localStorage.getItem('hub_onboarding_v2')) localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true, setup: { examDate: '2026-12-01' } }));
    if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' }, mockRecords: args && args.recs || [] }));
  } catch (e) {}
};

const getData = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}'));

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const exp = expectedCodes(UNIT);
  console.log('数据侧期望题型代码（独立复算）：' + (exp ? exp.join(',') : '（读不到 unit 文件）'));

  /* ================= A. 端到端：做题 → 交卷 → 落盘题型 ================= */
  console.log('\n[A] 做题页交卷后，逐题明细是否带上题型？');
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxA.addInitScript(seed([]));
  const aErrs = [];
  const pgA = await ctxA.newPage();
  pgA.on('pageerror', e => aErrs.push(String(e && e.message || e)));
  await pgA.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await pgA.waitForTimeout(1500);
  const opened = await U.openUnit(pgA, UNIT);
  ok(opened, '① 打开测试篇目（' + UNIT + '）');
  const answers = U.answersOf(UNIT);
  ok(!!answers && Object.keys(answers).length > 0, '② 答案文件可读（' + (answers ? Object.keys(answers).length : 0) + ' 题）');
  const qnDom = await pgA.evaluate(() => new Set(Array.from(document.querySelectorAll('#examRoot [data-q]')).map(e => e.getAttribute('data-q'))).size);
  const qn = Object.keys(answers || {}).length;   /* 与答案文件题数比：单选组的题号不是 .ex-qn，数 DOM 会少算（10/17 踩到） */
  ok(qnDom > 0, '③ 卷面题号渲染（卷面 ' + qnDom + ' 个 / 本篇 ' + qn + ' 题）');
  const filled = await U.answerSome(pgA, answers, 9);
  ok(filled.done > 0, '④ 按真实答案作答（填了 ' + filled.done + '/' + filled.tried + ' 题）');
  await pgA.click('#examRoot [data-submit]');
  await pgA.waitForSelector('#exSubmitModal [data-sok]', { timeout: 8000 });
  await pgA.click('#exSubmitModal [data-sok]');
  await pgA.waitForTimeout(1500);

  const rec = (await getData(pgA)).mockRecords?.find(r => r.src === 'bank' && Array.isArray(r.detail));
  ok(!!rec, '⑤ 交卷后落盘一条带逐题明细的记录');
  const det = rec ? rec.detail : [];
  ok(det.length === qn, '⑥ 明细条数与卷面题数一致（' + det.length + ' vs ' + qn + '）');
  const noT = det.filter(d => !d.t);
  ok(noT.length === 0, '⑦ 🔴 每一题都带题型字段（缺 ' + noT.length + ' 条）');
  const badT = det.filter(d => KNOWN.indexOf(String(d.t)) < 0);
  ok(badT.length === 0, '⑧ 题型代码都在已知集合内（越界 ' + badT.length + ' 条：' + badT.slice(0, 3).map(d => d.t).join(',') + '）');
  const got = det.map(d => String(d.t)).sort().join(',');
  const want = exp ? exp.slice().sort().join(',') : got;
  ok(got === want, '⑨ 实得题型集合 == 数据推出的期望集合\n      实得 ' + got + '\n      期望 ' + want);
  ok(det.some(d => d.ok) && det.some(d => !d.ok), '⑩ 明细里既有对也有错（说明按答案作答与判分真跑过）');
  const ansKeys = Object.keys(answers || {});
  const matchRight = ansKeys.slice(0, 5).filter(k => det.some(d => String(d.qn) === String(k) && String(d.right).toLowerCase() === String(answers[k]).toLowerCase()));
  ok(matchRight.length > 0, '⑪ 正确答案字段与答案文件一致（抽查命中 ' + matchRight.length + ' 题）');

  /* ================= B. 回顾页数字必须与记录对数一致 ================= */
  console.log('\n[B] 回顾页「按题型看正确率」的数字与记录对数一致？');
  const bErrs = [];
  pgA.on('pageerror', e => bErrs.push(String(e && e.message || e)));
  await pgA.goto(BASE + '/review.html', { waitUntil: 'load' });
  await pgA.waitForSelector('#mkQtStats', { timeout: 15000 });
  await pgA.waitForTimeout(1200);
  const want2 = {};
  det.forEach(d => { const c = String(d.t); want2[c] = want2[c] || { c: 0, t: 0 }; want2[c].t++; if (d.ok) want2[c].c++; });
  const b = await pgA.evaluate(() => {
    const box = document.getElementById('mkQtStats');
    const rows = Array.from(box.querySelectorAll('.bar-row')).map(r => ({
      label: r.querySelector('.bar-info span')?.textContent || '',
      pct: (r.querySelector('.bar-info span:last-child')?.textContent || '').replace('%', '')
    }));
    return { rows, note: box.querySelector('.mk-qt-note')?.textContent || '', text: box.innerText || '' };
  });
  ok(b.rows.length === Object.keys(want2).length, '⑫ 进度条条数 == 记录里的题型数（' + b.rows.length + ' vs ' + Object.keys(want2).length + '）');
  let allPct = true, detailTxt = [];
  Object.keys(want2).forEach(c => {
    const pct = Math.round(want2[c].c / want2[c].t * 100);
    const row = b.rows.find(r => r.label.indexOf('　' + want2[c].c + '/' + want2[c].t) > -1);
    detailTxt.push(c + '=' + want2[c].c + '/' + want2[c].t);
    if (!row || String(row.pct) !== String(pct)) allPct = false;
  });
  ok(allPct, '⑬ 每条正确率 == 由记录算出的 c/t（' + detailTxt.join(' ') + '）');
  const totalT = det.length;
  ok(b.note.indexOf(String(totalT)) > -1, '⑭ 提示行的题数与记录一致（' + totalT + ' 题）');
  ok(b.note.indexOf('最低') > -1, '⑮ 有「最弱题型」提示（' + b.note.slice(0, 46) + '…）');
  const worstCode = Object.keys(want2).sort((x, y) => (want2[x].c / want2[x].t) - (want2[y].c / want2[y].t))[0];
  const NAMES = { fill: '填空题', single: '单选题', multi: '多选题', match: '匹配题', head: 'Heading 题', para: '段落匹配题', map: '地图题', other: '其他题型' };
  ok(b.note.indexOf(NAMES[worstCode]) > -1, '⑯ 提示点名的题型 == 实际最弱（' + NAMES[worstCode] + '）');
  ok(bErrs.length === 0, '⑰ 回顾页零页面错误' + (bErrs.length ? ' — ' + bErrs.join(' | ') : ''));
  ok(aErrs.length === 0, '⑱ 做题页零页面错误' + (aErrs.length ? ' — ' + aErrs.join(' | ') : ''));
  await ctxA.close();

  /* ================= C/D/E. 老记录容忍 + 空态 + 近十天 ================= */
  const today = new Date();
  const k = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const oldDay = new Date(Date.now() - 40 * 86400000);
  const RECS = [
    { id: 'p1', date: k(today), type: 'reading', granularity: 'part', src: 'bank', parts: [{ label: 'P1', correct: 5, total: 10 }],
      detail: [{ qn: '1', user: 'A', right: 'A', ok: true, t: 'fill' }, { qn: '2', user: 'B', right: 'C', ok: false, t: 'fill' }, { qn: '3', user: 'D', right: 'X', ok: false, t: 'match' }] },
    { id: 'p2', date: k(today), type: 'reading', granularity: 'part', src: 'bank', parts: [{ label: 'P1', correct: 4, total: 10 }],
      detail: [{ qn: '1', user: 'A', right: 'A', ok: true }] },                                   /* 老明细：无题型 → 必须跳过 */
    { id: 'p3', date: k(today), type: 'reading', granularity: 'part', parts: [{ label: 'P1', correct: 4, total: 10 }] },  /* 手填：无明细 */
    { id: 'p4', date: k(oldDay), type: 'reading', granularity: 'part', src: 'bank', parts: [{ label: 'P1', correct: 1, total: 1 }],
      detail: [{ qn: '1', user: 'A', right: 'A', ok: true, t: 'map' }] },                          /* 40 天前：只进「全部」 */
  ];
  console.log('\n[C] 老记录容忍（无题型 / 无明细）');
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxC.addInitScript(seed(RECS), { recs: RECS });
  const cErrs = [];
  const pgC = await ctxC.newPage();
  pgC.on('pageerror', e => cErrs.push(String(e && e.message || e)));
  await pgC.goto(BASE + '/review.html', { waitUntil: 'load' });
  await pgC.waitForSelector('#mkQtStats', { timeout: 15000 });
  await pgC.waitForTimeout(1200);
  const c = await pgC.evaluate(() => {
    const box = document.getElementById('mkQtStats');
    return { rows: Array.from(box.querySelectorAll('.bar-row')).map(r => (r.querySelector('.bar-info span')?.textContent || '')),
             note: box.querySelector('.mk-qt-note')?.textContent || '' };
  });
  ok(cErrs.length === 0, '⑲ 零页面错误（老记录不炸）' + (cErrs.length ? ' — ' + cErrs.join(' | ') : ''));
  ok(c.rows.length === 3, '⑳ 只有带题型的记录进统计 → 3 种题型（实得 ' + c.rows.length + '：' + c.rows.join(' / ') + '）');
  ok(c.note.indexOf('4') > -1, '㉑ 题数只算带题型的 4 题（无题型/无明细的各 1 条未计入）→ ' + c.note.slice(0, 30));
  ok(c.rows.some(t => t.indexOf('匹配题') === 0 && t.indexOf('0/1') > -1), '㉒ 最弱题型（匹配题 0/1）以 0% 出现而不是被跳过');

  console.log('\n[E] 「近十天」筛选对题型统计生效');
  await pgC.selectOption('#mkFilter', 'recent');
  await pgC.waitForTimeout(800);
  const e = await pgC.evaluate(() => {
    const box = document.getElementById('mkQtStats');
    return { rows: Array.from(box.querySelectorAll('.bar-row')).map(r => (r.querySelector('.bar-info span')?.textContent || '')), note: box.querySelector('.mk-qt-note')?.textContent || '' };
  });
  ok(e.rows.length === 2 && !e.rows.some(t => t.indexOf('地图题') === 0), '㉓ 40 天前的地图题被筛掉（剩 ' + e.rows.length + ' 行：' + e.rows.join(' / ') + '）');
  ok(e.note.indexOf('3') > -1, '㉔ 题数随筛选变化（' + e.note.slice(0, 24) + '…）');
  await pgC.close();

  console.log('\n[D] 空态指路');
  const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxD.addInitScript(seed([]));
  const pgD = await ctxD.newPage();
  await pgD.goto(BASE + '/review.html', { waitUntil: 'load' });
  await pgD.waitForSelector('#mkQtStats', { timeout: 15000 });
  await pgD.waitForTimeout(1000);
  const dtxt = await pgD.evaluate(() => (document.getElementById('mkQtStats').innerText || '').replace(/\s+/g, ' '));
  ok(dtxt.indexOf('交卷') > -1, '㉕ 空态指路文案（' + dtxt.slice(0, 52) + '…）');
  await ctxD.close();

  /* ================= F. 手机 390 无横向溢出 ================= */
  console.log('\n[F] 手机 390 布局');
  const ctxF = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctxF.addInitScript(seed(RECS), { recs: RECS });
  const pgF = await ctxF.newPage();
  await pgF.goto(BASE + '/review.html', { waitUntil: 'load' });
  await pgF.waitForSelector('#mkQtStats', { timeout: 15000 });
  await pgF.waitForTimeout(1200);
  const f = await pgF.evaluate(() => ({
    sw: document.documentElement.scrollWidth, rows: document.querySelectorAll('#mkQtStats .bar-row').length,
    noteW: (document.querySelector('#mkQtStats .mk-qt-note') || {}).scrollWidth || 0,
    noteCW: (document.querySelector('#mkQtStats .mk-qt-note') || {}).clientWidth || 0
  }));
  ok(f.sw <= 391, '㉖ 无横向溢出（scrollWidth ' + f.sw + ' ≤ 391）');
  ok(f.rows === 3, '㉗ 手机上统计正常渲染（' + f.rows + ' 行）');
  ok(f.noteW <= f.noteCW + 1, '㉘ 提示行不溢出容器（' + f.noteW + ' ≤ ' + f.noteCW + '）');
  await ctxF.close();

  await browser.close();
  console.log('\n===== qtype: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
})();