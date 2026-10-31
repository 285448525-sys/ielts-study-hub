/* R-1 第一批验收：顶栏「回顾」二级菜单四项 → 两项（成绩 / 轨迹）。
   判据全部走真浏览器实测：
   ① 桌面悬停「回顾」只出 2 项，文案是「成绩 / 轨迹」
   ② 点「成绩」→ 落到 #tab-score（内容 = 原模考+实战+口语三块都在里面）
   ③ 点「轨迹」→ 落到 #tab-record
   ④ 三个老深链值（breakdown / overall / speaking）仍落到成绩栏 —— 旧书签不能变空白
   ⑤ 桌面 1280 页内 tab 条仍隐藏（红线第 4 条：不许把桌面 tab 加回来）
   ⑥ 手机 390 页内 tab 是 2 项
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

  /* ② 点「成绩」→ 落 #tab-score */
  const clickSub = async (label) => {
    await p.evaluate((lb) => {
      const el = document.getElementById('tbsub-review');
      const a = [...el.querySelectorAll('.tb-sub-item')].find(x => x.textContent.trim() === lb);
      if (a) a.click();
    }, label);
    await sleep(3200);
    return await p.evaluate(() => {
      const bar = document.querySelector('.review-pill-tabs');
      const activeBtn = bar ? (bar.querySelector('.tab-btn.active') || {}).dataset : null;
      const score = document.getElementById('tab-score');
      const record = document.getElementById('tab-record');
      const isShown = el => el ? getComputedStyle(el).display !== 'none' && el.classList.contains('active') : false;
      return {
        url: location.pathname + location.search,
        activeBtn: activeBtn && activeBtn.tab,
        scoreOn: isShown(score),
        recordOn: isShown(record),
        hasBreakdown: !!document.querySelector('#tab-score #tab-breakdown'),
        hasOverall: !!document.querySelector('#tab-score #tab-overall'),
        hasSpeaking: !!document.querySelector('#tab-score #tab-speaking'),
      };
    });
  };

  const r1 = await clickSub('成绩');
  console.log('  点「成绩」后：' + JSON.stringify(r1));
  ok('②1 落在成绩栏', r1.scoreOn === true && r1.recordOn === false, r1);
  ok('②2 成绩栏里三块原内容都在（分项/整卷/口语）', r1.hasBreakdown && r1.hasOverall && r1.hasSpeaking, r1);
  ok('②3 地址栏带上 sub=score', /sub=score/.test(r1.url || ''), r1.url);

  const r2 = await clickSub('轨迹');
  console.log('  点「轨迹」后：' + JSON.stringify(r2));
  ok('③1 落在轨迹栏', r2.recordOn === true && r2.scoreOn === false, r2);
  ok('③2 地址栏带上 sub=record', /sub=record/.test(r2.url || ''), r2.url);

  /* ④ 三个老深链值仍落到成绩栏（旧书签不能白页） */
  for (const old of ['breakdown', 'overall', 'speaking']) {
    await p.goto(BASE + '/review.html?sub=' + old, { waitUntil: 'load' });
    await sleep(2000);
    const r = await p.evaluate(() => {
      const score = document.getElementById('tab-score');
      const record = document.getElementById('tab-record');
      const on = el => el ? (getComputedStyle(el).display !== 'none' && el.classList.contains('active')) : false;
      return { scoreOn: on(score), recordOn: on(record) };
    });
    ok('④ 老深链 ?sub=' + old + ' 仍落到成绩栏', r.scoreOn === true && r.recordOn === false, r);
  }

  /* 新建值深链 */
  await p.goto(BASE + '/review.html?sub=record', { waitUntil: 'load' });
  await sleep(1800);
  const rr = await p.evaluate(() => {
    const record = document.getElementById('tab-record');
    return { on: record ? (getComputedStyle(record).display !== 'none' && record.classList.contains('active')) : false };
  });
  ok('④2 新深链 ?sub=record 落到轨迹栏', rr.on === true, rr);

  /* ⑤ 桌面页内 tab 条必须仍隐藏（红线） */
  await p.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(1800);
  const deskTab = await p.evaluate(() => {
    const bar = document.querySelector('.review-pill-tabs');
    if (!bar) return { exists: false };
    const cs = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    return { exists: true, display: cs.display, visibility: cs.visibility, w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('  桌面页内 tab：' + JSON.stringify(deskTab));
  ok('⑤1 桌面 1280 页内 tab 条仍隐藏（红线第 4 条）', deskTab.exists && deskTab.display === 'none', deskTab);

  /* ⑥ 手机 390：tab 两项 */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => errs.push('M ' + String(e).slice(0, 140)));
  await p2.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(2200);
  const mob = await p2.evaluate(() => {
    const bar = document.querySelector('.review-pill-tabs');
    if (!bar) return { exists: false };
    const btns = [...bar.querySelectorAll('.tab-btn')];
    return { exists: true, display: getComputedStyle(bar).display, n: btns.length, labels: btns.map(b => b.textContent.trim()) };
  });
  console.log('  手机页内 tab：' + JSON.stringify(mob));
  ok('⑥1 手机 tab 是 2 项', mob.exists && mob.n === 2, mob);
  ok('⑥2 手机 tab 文案是成绩/轨迹', mob.labels && mob.labels.join('/') === '成绩/轨迹', mob.labels);

  ok('⑦ 全程零 pageerror', errs.length === 0, errs.slice(0, 3));

  await b.close();
  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
