// 成绩卡「下一步」三卡（P0-3）专项探针
// 用法：node tests/_probe_nextstep_1018.cjs <baseUrl>
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => R.push((ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  ｜ ' + info : ''));

async function enterReading(page) {
  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  return await page.evaluate(() => {
    const el = document.querySelector('#bankList [data-unit]');
    el.click(); return el.getAttribute('data-unit');
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true })); localStorage.getItem('hub_exam_guide_v2_reading') || localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.getItem('hub_exam_guide_v2_listening') || localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) { } });

  const unitId = await enterReading(page);
  await page.waitForTimeout(1600);

  console.log('=== A. 交卷后出现「下一步」区块 ===');
  await page.click('[data-submit]');
  await page.waitForTimeout(500);
  await page.click('[data-sok]');
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => {
    const box = document.querySelector('.fx-score .fx-next');
    const cards = Array.from(document.querySelectorAll('.fx-score .fx-ncard'));
    const score = document.querySelector('.fx-score .fx-top b');
    return {
      has: !!box,
      header: box ? String(box.querySelector('.fx-next-h').textContent || '').trim() : '',
      n: cards.length,
      labels: cards.map(c => String(c.querySelector('b').textContent || '').trim()),
      subs: cards.map(c => String(c.querySelector('span').textContent || '').trim()),
      acts: cards.map(c => c.getAttribute('data-fxnext') || 'done'),
      cjk: box ? /[\u4e00-\u9fa5]/.test(String(box.textContent || '')) : null,
      score: score ? String(score.textContent).trim() : '',
      visible: box ? box.getBoundingClientRect().height > 0 : false
    };
  });
  console.log('  ' + JSON.stringify(st));
  ck('A1 成绩卡里出现 WHAT TO DO NEXT', st.has && /WHAT TO DO NEXT/.test(st.header), st.header);
  ck('A2 三张卡（或全对时的替代卡）都在', st.n === 3, 'n=' + st.n);
  ck('A3 卡面全英文（考试页零中文铁律）', st.cjk === false);
  ck('A4 三卡文案分别是 看错题 / 再做一次 / 回列表',
    /Review the \d+ incorrect/.test(st.labels[0] || '') && /Retake this passage/.test(st.labels[1] || '') && /Back to the test list/.test(st.labels[2] || ''),
    JSON.stringify(st.labels));
  ck('A5 区块真实可见（有高度）', st.visible);
  ck('A6 成绩数字仍在（没被新块挤掉）', /\d+\s*\/\s*\d+/.test(st.score), st.score);

  console.log('=== B. 卡1「看错题」→ 答题卡切到只看错题 + 跳到第一道错题 ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-fxnext="wrong"]');
  await page.waitForTimeout(900);
  const b = await page.evaluate(() => {
    const w = document.querySelector('.fx-chip[data-fxfilter="wrong"]');
    const a = document.querySelector('.fx-chip[data-fxfilter="all"]');
    const nums = Array.from(document.querySelectorAll('#examRoot .ex-num'));
    return {
      wrongOn: w ? w.classList.contains('on') : null,
      allOn: a ? a.classList.contains('on') : null,
      numCount: nums.length,
      miss: nums.filter(n => /miss|wrong/.test(n.className)).length,
      scrollY: Math.round(window.scrollY)
    };
  });
  console.log('  ' + JSON.stringify(b));
  ck('B1 Incorrect only 被点亮', b.wrongOn === true);
  ck('B2 All 已取消', b.allOn === false);
  ck('B3 答题卡仍有题号（只是过滤，不是清空）', b.numCount > 0, 'n=' + b.numCount);

  console.log('=== C. 卡2「再做一次」→ 重新进同一篇、答案清空、计时重置 ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-fxnext="retake"]');
  await page.waitForTimeout(3000);
  const c = await page.evaluate(() => {
    const tm = document.getElementById('exTimer');
    const sc = document.querySelector('.fx-score');
    const blanks = Array.from(document.querySelectorAll('#examRoot .ex-blank'));
    const filled = blanks.filter(i => String(i.value || '').trim()).length;
    const sub = document.querySelector('#examRoot [data-submit]');
    return {
      timer: tm ? String(tm.textContent).trim() : 'NO',
      scoreCardGone: !sc,
      blanks: blanks.length, filled,
      submitLabel: sub ? String(sub.textContent).trim() : 'NO',
      submitDisabled: sub ? !!sub.disabled : null
    };
  });
  console.log('  ' + JSON.stringify(c));
  /* 🔵 10-26：计时文案在 W-EXTOP-1（66c82d5b）改成「N minutes remaining」分钟制（删了秒），
     这里仍在按老的 HH:MM:SS 判 → 恒红。判据改成「分钟制里 59 或 60 都算刚重置」。 */
  ck('C1 重新进入答题页（计时回到 59~60 分钟）',
    /^(59|60) minutes remaining$/.test(c.timer) || /^00:59:5\d$|^01:00:00$/.test(c.timer), c.timer);
  ck('C2 旧成绩卡已移除', c.scoreCardGone);
  ck('C3 作答已清空（填空框无残留）', c.filled === 0, 'filled=' + c.filled + '/' + c.blanks);
  ck('C4 Finish 按钮恢复可点、文案回到 Finish section',
    c.submitDisabled === false && /Finish section/.test(c.submitLabel), c.submitLabel + ' disabled=' + c.submitDisabled);

  console.log('=== D. 卡3「回列表」→ 退出考场 ===');
  await page.click('[data-submit]');
  await page.waitForTimeout(400);
  await page.click('[data-sok]');
  await page.waitForTimeout(1500);
  await page.click('[data-fxnext="exit"]');
  await page.waitForTimeout(2000);
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
  const real = errs.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e));
  ck('E1 无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad + '   (unit=' + unitId + ')');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
