// 交卷后复盘页（原「成绩卡下一步」P0-3，11-02 EXAM-SCORE-COMPACT-1 后改口径）专项探针
// 11-15 PERM-REG-1：她 11-02 拍板「成绩卡整删，交卷 = 回看同页」——
//   .fx-score / WHAT TO DO NEXT / fx-ncard / fx-chip 四种成绩卡节点已全部退役。
//   本支原来断言的「下一步三卡与三按钮」不再有产品对应物，等价契约改成：
//   ① 交卷后仍是同一篇、题目可回看；② 顶栏对错小字 + 答案/高亮两开关在；
//   ③ 顶栏小字数字和落库逐题明细一致；④ 重开同一篇答案清空、计时重置；
//   ⑤ Exit 能回列表。绝不写「恒真」，也绝不把已退役节点当 bug。
// 用法：node tests/_probe_nextstep_1018.cjs <baseUrl>
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => R.push((ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  ｜ ' + info : ''));

/* 10-31 EXAM-TIMER-CHOICE-1 官方探针旁路 + 11-01 BANK-DONE-ROW-1 清留痕。 */
async function seedExam(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
      localStorage.setItem('hub_exam_guide_v2_reading', '1');
      localStorage.setItem('hub_exam_guide_v2_listening', '1');
      localStorage.setItem('hub_exam_timer_auto', '20');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (/^hub_bank_last_/.test(k || '')) localStorage.removeItem(k);
      }
    } catch (e) { }
  });
}

/* 11-15 PERM-REG-1：进场链路用官方旁路 + 清「做过了」留痕后，还要等卷面真渲染；
   本篇若已有留痕会弹 BANK-DONE-ROW-1 的 #bkDonePick，点「再做一次」。 */
async function enterReading(page) {
  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  const unit = await page.evaluate(() => {
    const el = document.querySelector('#bankList [data-unit]');
    el.click(); return el.getAttribute('data-unit');
  });
  const redo = await page.$('#bkDonePick [data-bdp="redo"]');
  if (redo) await redo.click();
  await page.waitForSelector('#examRoot .ex-q, #examRoot .ex-num', { timeout: 20000 });
  await page.waitForTimeout(1000);
  return unit;
}

/* 从列表重新点开同一篇，保留「再做一次」与卷面等待，供重开 / 回列表两段复用。 */
async function reopenReading(page, unitId) {
  await page.evaluate((id) => {
    const item = document.querySelector('#bankList [data-unit="' + id + '"]') || document.querySelector('#bankList [data-unit]');
    if (!item) throw new Error('reopenReading: list item missing');
    item.click();
  }, unitId);
  const redo = await page.$('#bkDonePick [data-bdp="redo"]');
  if (redo) await redo.click();
  await page.waitForSelector('#examRoot .ex-q, #examRoot .ex-num', { timeout: 20000 });
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await seedExam(page);

  const unitId = await enterReading(page);

  console.log('=== A. 交卷后落在同页复盘，顶栏给对错与两开关 ===');
  /* 开机遮罩 #bootLoader 收起前会吃掉点击（11-18 复跑踩：56 次 retry 全被它挡住），
     点之前先等它不再 show，别把「遮罩没走完」误判成交卷按钮坏了。 */
  await page.waitForFunction(() => {
    const l = document.getElementById('bootLoader');
    return !l || !l.classList.contains('show');
  }, null, { timeout: 20000 }).catch(() => {});
  await page.click('#examRoot [data-submit]');
  await page.waitForSelector('#exSubmitModal [data-sok]', { timeout: 8000 });
  await page.click('#exSubmitModal [data-sok]');
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => {
    const root = document.getElementById('examRoot');
    const mini = root && root.querySelector('.ex-score-mini');
    const tgs = root ? Array.from(root.querySelectorAll('.ex-tg[data-rvtg]')).map(e => e.getAttribute('data-rvtg')) : [];
    const btn = document.getElementById('exExitBtn') || document.querySelector('#examRoot [data-exit], #examRoot .ex-ft [data-exit]');
    return {
      examVisible: !!(root && !root.hidden),
      sameTitle: !!(root && root.querySelector('.ex-name')),
      qCount: root ? root.querySelectorAll('.ex-q, .ex-num').length : 0,
      mini: mini ? mini.innerText.replace(/\s+/g, ' ').trim() : '',
      tgs,
      scoreCardGone: !(root && root.querySelector('.fx-score, .fx-next, .fx-ncard, .fx-chip')),
      hasExit: !!btn,
      submitted: !!(root && Array.from(root.querySelectorAll('button')).some(b => /submitted/i.test(b.textContent || '')))
    };
  });
  console.log('  ' + JSON.stringify(st));
  ck('A1 交卷后仍在同篇题目页（成绩卡整删后的现版口径）', st.examVisible && st.qCount > 0, 'q=' + st.qCount);
  /* 🔵 11-17 交卷与复盘全中文后，顶栏小字改成「X 分 · Y 对 · Z 错」；
     判据同时容英文旧式，避免回退时误报。 */
  ck('A2 顶栏对错小字显示 X 分 · Y 对 · Z 错',
    /(\d+)\s*分\s*·\s*(\d+)\s*对\s*·\s*(\d+)\s*错/.test(st.mini) || /\d+\s*correct\s*·\s*\d+\s*incorrect/i.test(st.mini), st.mini);
  ck('A3 Answers / Highlights 两开关都在', st.tgs.includes('ans') && st.tgs.includes('hl'), JSON.stringify(st.tgs));
  ck('A4 旧成绩卡 / WHAT TO DO NEXT / 三卡整块不渲染', st.scoreCardGone);
  ck('A5 交卷态有 Exit 出口', st.hasExit);
  ck('A6 底栏按钮落到 Submitted 态', st.submitted);

  console.log('=== B. 顶栏小字与逐题明细一致、复盘开关真的生效 ===');
  const rec = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
    const r = (d.mockRecords || []).find(x => x.src === 'bank' && Array.isArray(x.detail));
    if (!r) return null;
    return { right: r.detail.filter(q => q.ok).length, wrong: r.detail.filter(q => !q.ok).length, total: r.detail.length };
  });
  const nums = ((st.mini.match(/(\d+)\s*分\s*·\s*(\d+)\s*对\s*·\s*(\d+)\s*错/) || []).slice(2).map(Number).length === 2
    ? (st.mini.match(/(\d+)\s*分\s*·\s*(\d+)\s*对\s*·\s*(\d+)\s*错/) || []).slice(2).map(Number)
    : (st.mini.match(/(\d+)\s*correct\s*·\s*(\d+)\s*incorrect/i) || []).slice(1).map(Number));
  ck('B1 落库记录带逐题明细', !!rec && rec.total > 0, JSON.stringify(rec));
  ck('B2 顶栏数字 == 落库逐题对错', !!rec && nums.length === 2 && nums[0] === rec.right && nums[1] === rec.wrong, nums.join('/') + ' vs ' + JSON.stringify(rec));
  /* 11-15 PERM-REG-1：EXAM-SCORE-COMPACT-1 / RV-FIX5-* 后，「显示正确答案」不再用
     .ex-qn.right / input.ex-blank.right 表达：现版是 .ex-ca-in 绿字（填空）或
     .ex-opt.right / .ex-pill.right 绿底（选择）。关闭态由 .rv-noans 把未勾正答标压成透明。
     这里仍只认「真正可见、有绿底/绿字」的正答标，不把根类 on 当恒真通过。 */
  const visibleAnswers = () => page.evaluate(() => {
    const root = document.getElementById('examRoot');
    if (!root) return { count: 0, sample: [] };
    const nodes = Array.from(root.querySelectorAll('.ex-ca-in, .ex-opt.right, .ex-pill.right'));
    const sample = [];
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const bg = cs.backgroundColor || '';
      const plain = /transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg);
      const text = String(el.textContent || '').trim();
      /* .ex-ca-in 本身就是绿字正答；其余两种要有非透明绿底才算「真出现」。 */
      if (el.classList.contains('ex-ca-in') ? text.length > 0 : !plain) {
        sample.push((el.className || el.tagName) + ':' + text.slice(0, 24));
      }
    }
    return { count: sample.length, sample: sample.slice(0, 4) };
  });
  const ansBefore = await visibleAnswers();
  await page.click('#examRoot .ex-tg[data-rvtg="ans"]');
  await page.waitForTimeout(500);
  const ansAfter = await page.evaluate(() => ({
    on: !!document.querySelector('#examRoot .ex-tg[data-rvtg="ans"].on'),
    rootOn: !!document.querySelector('#examRoot.rv-ans-on'),
    rootNoAns: !!document.querySelector('#examRoot.rv-noans')
  }));
  const shownAfter = await visibleAnswers();
  console.log('  ' + JSON.stringify({ ansBefore, ansAfter, shownAfter }));
  ck('B3 默认不显示正确答案', ansBefore.count === 0, 'visible=' + ansBefore.count);
  ck('B4 点 Answers 后开关点亮且正确答案真出现',
    ansAfter.on && ansAfter.rootOn && !ansAfter.rootNoAns && shownAfter.count > 0,
    'visible=' + shownAfter.count + ' ' + shownAfter.sample.join(' | '));

  console.log('=== C. 重开同一篇：答案清空、计时重置 ===');
  /* 顶栏 Exit 是她 11-02 替换掉「成绩卡三按钮」后的统一出口；点它回列表再点原篇目。 */
  const exited = await page.evaluate(() => {
    const b = document.getElementById('exExitBtn') || document.querySelector('#examRoot [data-exit], #examRoot .ex-ft [data-exit]');
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(900);
  if (exited) {
    const redo = await page.$('#exExitConfirm [data-exok], #exExitModal [data-exok]');
    if (redo) await redo.click();
    await page.waitForTimeout(800);
  }
  const backToList = await page.evaluate(() => {
    const er = document.getElementById('examRoot'), br = document.getElementById('bankRoot');
    return !!(er && er.hidden && br && getComputedStyle(br).display !== 'none');
  });
  if (!backToList) {
    await page.goto(BASE + '/bank.html', { waitUntil: 'load' });
    await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  }
  await reopenReading(page, unitId);
  const c = await page.evaluate(() => {
    const tm = document.getElementById('exTimer');
    const blanks = Array.from(document.querySelectorAll('#examRoot input.ex-blank'));
    const radios = Array.from(document.querySelectorAll('#examRoot input.ex-radio, #examRoot input.ex-check'));
    const sub = document.querySelector('#examRoot [data-submit]');
    return {
      timer: tm ? String(tm.textContent).trim() : 'NO',
      filled: blanks.filter(i => String(i.value || '').trim()).length + radios.filter(i => i.checked).length,
      submitLabel: sub ? String(sub.textContent).trim() : 'NO',
      submitDisabled: sub ? !!sub.disabled : null
    };
  });
  console.log('  ' + JSON.stringify(c));
  /* 11-15 PERM-REG-1：现版 examTimerLabel() 只显示整分钟（js/bank.js:1679），
     hub_exam_timer_auto='20' 对应满格 20 min；刚进来跌一秒也是 19 min 属正常，
     保留「计时重置到满格附近」的意图，不再认旧版 minutes remaining / 00:20:00 文案。 */
  ck('C1 重新进入答题页（计时重置到 19~20 min）', /^(19|20)\s*min$/.test(c.timer), c.timer);
  ck('C2 作答已清空（填空/选项均无残留）', c.filled === 0, 'filled=' + c.filled);
  ck('C3 Finish 按钮恢复可点、文案回到 Finish section',
    c.submitDisabled === false && /Finish section/.test(c.submitLabel), c.submitLabel + ' disabled=' + c.submitDisabled);

  console.log('=== D. 交卷后回列表（旧「回列表」卡的现版等价路径）===');
  await page.click('#examRoot [data-submit]');
  await page.waitForSelector('#exSubmitModal [data-sok]', { timeout: 8000 });
  await page.click('#exSubmitModal [data-sok]');
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const b = document.getElementById('exExitBtn') || document.querySelector('#examRoot [data-exit], #examRoot .ex-ft [data-exit]');
    if (b) b.click();
  });
  const confirm = await page.$('#exExitConfirm [data-exok], #exExitModal [data-exok]');
  if (confirm) await confirm.click();
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => {
    const er = document.getElementById('examRoot'), br = document.getElementById('bankRoot');
    return {
      examHidden: er ? er.hidden : null,
      bankVisible: br ? getComputedStyle(br).display !== 'none' : null,
      listCount: document.querySelectorAll('#bankList [data-unit]').length
    };
  });
  console.log('  ' + JSON.stringify(d));
  ck('D1 回到列表（考场收起）', d.examHidden === true && d.bankVisible === true);
  ck('D2 列表正常渲染', d.listCount > 0, 'n=' + d.listCount);

  console.log('=== E. 控制台错误 ===');
  const real = errs.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e)
    && !/ERR_CERT_AUTHORITY_INVALID/.test(e)
    && !/\[hub-error\] resource.*part-exam-audio/.test(e));
  ck('E1 无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad + '   (unit=' + unitId + ')');
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
