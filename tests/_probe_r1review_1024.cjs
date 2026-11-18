/* R-1 第一批验收：顶栏「回顾」二级菜单四项 → 两项（成绩 / 轨迹）。
   2026-11-13 REVIEW-REDESIGN-3（v870）：旧 #tab-score / #tab-record / .review-pill-tabs 全撤，
   改为 js/rv-tabs.js 的 data-rv-pane + #rv2Summary / #recAll；rvx-data.js deepLink() 接老书签。
   判据仍全部走真浏览器实测，旧断言意图逐项映射：
   ① 桌面悬停「回顾」只出 2 项，文案是「成绩 / 轨迹」
   ② 点「成绩」→ 当前总览栏（整卷 + 四科分项 + 口语格都在 #rv2Summary）
   ③ 点「轨迹」→ 当前记录栏（#recAll 可见，记录筛选回到全部）
   ④ 三个老深链值（breakdown / overall / speaking）仍落到成绩对应栏 —— 旧书签不能变空白
   ⑤ 桌面 1280 #rvMobileTabs 隐藏（红线第 4 条：不许把桌面页内 tab 加回来）
   ⑥ 手机 390 顶栏 2 项仍是「成绩 / 轨迹」；当前页内 tab 由 REVIEW-REDESIGN-3 改成 3 项
      「总览 / 趋势 / 记录」，另验不把两套口径混成一个不存在的产品结构。
   用法：BASE 环境变量或第一个参数。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  await p.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(2500);

  /* ① 桌面二级菜单只有两项 */
  const wrap = await p.$('.tb-caps .tb-cap-wrap[data-cap="review"]');
  ok('①0 桌面存在「回顾」胶囊', !!wrap);
  if (wrap) {
    await wrap.hover();
    await sleep(450);
    const sub = await p.evaluate(() => {
      const el = document.getElementById('tbsub-review');
      if (!el) return null;
      return {
        shown: getComputedStyle(el).visibility === 'visible',
        items: [...el.querySelectorAll('.tb-sub-item')].map(a => ({ t: a.textContent.trim(), href: a.getAttribute('href'), sub: a.getAttribute('data-hub-sub') })),
      };
    });
    console.log('  二级面板：' + JSON.stringify(sub));
    ok('①1 悬停后展开', sub && sub.shown === true, sub);
    ok('①2 只有 2 项', sub && sub.items.length === 2, sub && sub.items.length);
    ok('①3 文案是「成绩 / 轨迹」', sub && sub.items.map(i => i.t).join('/') === '成绩/轨迹', sub && sub.items.map(i => i.t));
    ok('①4 sub 值是 score / record', sub && sub.items[0].sub === 'score' && sub.items[1].sub === 'record', sub && sub.items.map(i => i.sub));
  }

  /* 11-13 REVIEW-REDESIGN-3：统一从当前 rv-tabs.js / rvx-data.js 实测状态，
     不再读取已移除的 #tab-score / #tab-record / .review-pill-tabs。 */
  const readRv = async (page) => page.evaluate(() => {
    const q = id => document.getElementById(id);
    const visible = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const sub = q('tbsub-review');
    const m = q('rvMobileTabs');
    const summary = q('rv2Summary');
    const rec = q('recAll');
    return {
      url: location.pathname + location.search,
      cur: window.__rvCur || null,
      scoreOn: visible(summary) && (window.__rvCur || 'home') === 'home',
      recordOn: visible(rec) && window.__rvCur === 'records',
      /* 原分项/整卷/口语三块 → 当前总览卡的整卷分 + 四科格（含口语） */
      hasBreakdown: !!(q('rvxCellL') && q('rvxCellR') && q('rvxCellW') && q('rvxCellS')),
      hasOverall: !!q('rvxNumAll'),
      hasSpeaking: !!q('rvxNumS'),
      recFilter: q('recordFilter') ? q('recordFilter').value : '',
      subItems: sub ? [...sub.querySelectorAll('.tb-sub-item')].map(a => a.textContent.trim()) : [],
      mobile: m ? { display: getComputedStyle(m).display, n: m.querySelectorAll('[data-rv-tab]').length,
                    labels: [...m.querySelectorAll('[data-rv-tab]')].map(x => x.textContent.trim()) } : null,
      legacyPill: !!document.querySelector('.review-pill-tabs')
    };
  });

  /* ② 点「成绩」→ 当前总览成绩栏 */
  const clickSub = async (label) => {
    await p.evaluate((lb) => {
      const el = document.getElementById('tbsub-review');
      const a = [...el.querySelectorAll('.tb-sub-item')].find(x => x.textContent.trim() === lb);
      if (a) a.click();
    }, label);
    await sleep(3200);
    return await readRv(p);
  };

  const r1 = await clickSub('成绩');
  console.log('  点「成绩」后：' + JSON.stringify(r1));
  ok('②1 落在成绩对应总览栏', r1.cur === 'home' && r1.scoreOn === true && r1.recordOn === false, r1);
  ok('②2 成绩栏里三块原内容都有等价落点（分项/整卷/口语）', r1.hasBreakdown && r1.hasOverall && r1.hasSpeaking, r1);
  ok('②3 地址栏带上 sub=score', /sub=score/.test(r1.url || ''), r1.url);

  const r2 = await clickSub('轨迹');
  console.log('  点「轨迹」后：' + JSON.stringify(r2));
  ok('③1 落在轨迹对应记录栏', r2.cur === 'records' && r2.recordOn === true && r2.scoreOn === false && r2.recFilter === 'all', r2);
  ok('③2 地址栏带上 sub=record', /sub=record/.test(r2.url || ''), r2.url);

  /* ④ 三个老深链值仍落到成绩对应栏（旧书签不能白页） */
  for (const old of ['breakdown', 'overall', 'speaking']) {
    await p.goto(BASE + '/review.html?sub=' + old, { waitUntil: 'load' });
    await sleep(2000);
    const r = await readRv(p);
    ok('④ 老深链 ?sub=' + old + ' 仍落到成绩对应栏', r.cur === 'home' && r.scoreOn === true && r.recordOn === false, r);
  }

  /* 新建值深链 */
  await p.goto(BASE + '/review.html?sub=record', { waitUntil: 'load' });
  await sleep(1800);
  const rr = await readRv(p);
  ok('④2 新深链 ?sub=record 落到轨迹对应栏', rr.cur === 'records' && rr.recordOn === true && rr.recFilter === 'all', rr);

  /* ⑤ 桌面 1280 当前 #rvMobileTabs 必须仍隐藏（红线） */
  await p.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(1800);
  const desk = await readRv(p);
  console.log('  桌面页内 tab：' + JSON.stringify(desk.mobile));
  ok('⑤1 桌面 1280 页内 tab 条仍隐藏（红线第 4 条）',
    !!desk.mobile && desk.mobile.display === 'none' && !desk.legacyPill, desk.mobile);

  /* ⑥ 手机 390：顶栏仍只有 2 项「成绩 / 轨迹」；
     当前页内 tab 是 REVIEW-REDESIGN-3 的 3 项总览/趋势/记录，两者分别验，不混口径。 */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => errs.push('M ' + String(e).slice(0, 140)));
  await p2.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(2200);
  const mob = await readRv(p2);
  console.log('  手机页内 tab：' + JSON.stringify(mob.mobile));
  ok('⑥1 手机顶栏仍是 2 项（成绩 / 轨迹）',
    mob.subItems.length === 2 && mob.subItems.join('/') === '成绩/轨迹', mob.subItems);
  ok('⑥2 手机页内 tab 是 REVIEW-REDESIGN-3 的 3 项且可见',
    !!mob.mobile && mob.mobile.display === 'flex' && mob.mobile.n === 3 &&
    mob.mobile.labels.join('/') === '总览/趋势/记录', mob.mobile);

  ok('⑦ 全程零 pageerror', errs.length === 0, errs.slice(0, 3));

  await b.close();
  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
