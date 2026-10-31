// 交卷确认弹窗升级（P1-4 未答可点跳转 / P2-2 标记题号清单）专项探针
// 用法：node tests/_probe_submitjump_1018.cjs <baseUrl>
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => R.push((ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  ｜ ' + info : ''));

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true })); localStorage.getItem('hub_exam_guide_v2_reading') || localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.getItem('hub_exam_guide_v2_listening') || localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) { } });

  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(1800);

  console.log('=== A. 先标记两题 ===');
  const marked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#examRoot .ex-flagq'));
    if (btns.length < 3) return { n: btns.length };
    btns[1].click(); btns[4].click();
    return { n: btns.length, qns: [btns[1].getAttribute('data-qn'), btns[4].getAttribute('data-qn')] };
  });
  console.log('  ' + JSON.stringify(marked));
  ck('A1 题面有 Mark 按钮', marked.n > 2, 'n=' + marked.n);

  console.log('=== B. 打开交卷确认：未答跳转 + 标记清单 ===');
  await page.click('[data-submit]');
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const box = document.getElementById('exSubmitModal');
    const jump = box ? box.querySelector('[data-sjump="first"]') : null;
    const chips = box ? Array.from(box.querySelectorAll('[data-sjumpmark]')) : [];
    const r = jump ? jump.getBoundingClientRect() : null;
    return {
      open: !!box,
      hasJump: !!jump,
      jumpText: jump ? String(jump.textContent || '').trim() : '',
      jumpVisible: r ? r.width > 0 && r.height > 0 : false,
      chips: chips.map(c => String(c.textContent || '').trim()),
      markHeader: box && box.querySelector('.ex-modal-mk-h') ? String(box.querySelector('.ex-modal-mk-h').textContent).trim() : '',
      unansweredTxt: box && box.querySelector('p') ? String(box.querySelector('p').textContent).replace(/\s+/g, ' ').trim() : '',
      cjk: box ? /[\u4e00-\u9fa5]/.test(String(box.textContent || '')) : null,
      finishStill: !!box.querySelector('[data-sok]'),
      cancelStill: !!box.querySelector('[data-scancel]')
    };
  });
  console.log('  ' + JSON.stringify(m));
  ck('B1 弹窗正常打开', m.open);
  ck('B2 未答数仍在文案里', /unanswered question/.test(m.unansweredTxt), m.unansweredTxt.slice(0, 70));
  ck('B3 多了「Go to the first unanswered」按钮且可见', m.hasJump && m.jumpVisible && /first unanswered/i.test(m.jumpText), m.jumpText);
  ck('B4 标记清单只列我标的题号', m.chips.length === 2 && m.chips.join(',') === [marked.qns[0], marked.qns[1]].sort((a, b) => a - b).join(','), JSON.stringify(m.chips));
  ck('B5 清单有小标题 Marked for review', /Marked for review/.test(m.markHeader), m.markHeader);
  ck('B6 弹窗仍全英文', m.cjk === false);
  ck('B7 Finish / Keep working 两个原按钮都还在', m.finishStill && m.cancelStill);

  console.log('=== C. 点标记题号 → 关弹窗并跳到那道题 ===');
  const target = Math.max(Number(marked.qns[0]), Number(marked.qns[1]));
  await page.click('[data-sjumpmark="' + target + '"]');
  await page.waitForTimeout(1200);
  const c = await page.evaluate((tn) => {
    const open = !!document.getElementById('exSubmitModal');
    const el = document.querySelector('#examRoot [data-qn="' + tn + '"]');
    const rr = el ? el.getBoundingClientRect() : null;
    return {
      modalClosed: !open,
      found: !!el,
      inView: rr ? (rr.top < window.innerHeight && rr.bottom > 0) : false,
      top: rr ? Math.round(rr.top) : null
    };
  }, target);
  console.log('  ' + JSON.stringify(c) + ' target=' + target);
  ck('C1 弹窗已关闭', c.modalClosed);
  ck('C2 目标题存在', c.found);
  ck('C3 目标题滚进了视口（真跳过去了）', c.inView, 'top=' + c.top);

  console.log('=== D. 点「去看第一道未答」→ 跳到第一题 ===');
  await page.click('[data-submit]');
  await page.waitForTimeout(500);
  await page.click('[data-sjump="first"]');
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => {
    const open = !!document.getElementById('exSubmitModal');
    // 第一道未答应是最小题号（本场一题都没答）
    const all = Array.from(document.querySelectorAll('#examRoot [data-qn]')).map(e => Number(e.getAttribute('data-qn'))).filter(n => !isNaN(n));
    const min = Math.min.apply(null, all);
    const el = document.querySelector('#examRoot [data-qn="' + min + '"]');
    const rr = el ? el.getBoundingClientRect() : null;
    return { modalClosed: !open, min: min, inView: rr ? (rr.top < window.innerHeight && rr.bottom > 0) : false };
  });
  console.log('  ' + JSON.stringify(d));
  ck('D1 弹窗已关闭', d.modalClosed);
  ck('D2 已跳到第一道未答（最小题号可见）', d.inView);

  console.log('=== E. 没标记时不出现空清单 ===');
  await page.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(1800);
  await page.click('[data-submit]');
  await page.waitForTimeout(500);
  const e2 = await page.evaluate(() => {
    const box = document.getElementById('exSubmitModal');
    return {
      open: !!box,
      hasMarks: !!(box && box.querySelector('.ex-modal-marks')),
      hasJump: !!(box && box.querySelector('[data-sjump="first"]'))
    };
  });
  ck('E1 未标记 → 不渲染空清单', e2.open && e2.hasMarks === false);
  ck('E2 未答跳转按钮照常存在', e2.hasJump === true);
  await page.evaluate(() => { const b = document.querySelector('[data-scancel]'); if (b) b.click(); });

  console.log('=== G. 题号行点任意题型都能跳（修既有 bug：原来只有合并组/填空会滚）===');
  await page.goto(BASE + '/bank.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(1800);
  const nums = await page.evaluate(() => Array.from(document.querySelectorAll('#examRoot .ex-num[data-jump]')).map(e => e.getAttribute('data-jump')));
  const probeJump = async (n) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#examRoot .ex-num[data-jump="' + n + '"]');
    await page.waitForTimeout(900);
    return await page.evaluate((qn) => {
      const el = document.querySelector('#examRoot .ex-flagq[data-qn="' + qn + '"]')
        || document.querySelector('#examRoot .ex-qn[data-qns~="' + qn + '"]')
        || document.querySelector('#examRoot .ex-blankw[data-q="' + qn + '"]');
      if (!el) return { found: false };
      const row = (el.closest && el.closest('.ex-q')) || el;
      const r = row.getBoundingClientRect();
      return { found: true, inView: r.top < window.innerHeight && r.bottom > 0, top: Math.round(r.top) };
    }, n);
  };
  // 头一个、中间一个、最后一个（覆盖单选 / 填空 / 多选合并组等不同行形态）
  const picks = [nums[0], nums[Math.floor(nums.length / 2)], nums[nums.length - 1]];
  for (const p of picks) {
    const r = await probeJump(p);
    ck('G·Q' + p + ' 题号行跳转生效', r.found && r.inView, JSON.stringify(r));
  }

  console.log('=== F. 控制台错误 ===');
  const real = errs.filter(x => !/Failed to load resource: the server responded with a status of 404/.test(x));
  ck('F1 无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
