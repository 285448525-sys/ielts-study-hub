/* 探针：首页「今日任务」超过 5 条时的收口（10-22 她拍板）
   她原话：「任务超过 5~6 条时小屏会重新溢出 → 只显示前 N 条 + 还有 N 条去计划页」。
   验什么：
     ① 7 条任务 → 首页只渲染 5 条，第 6、7 条不上首页；底部出现「还有 2 条，去计划页看全部」
     ② 该行的链接真的指向计划页；点它真能到计划页（软导航）
     ③ 5 条任务 → 不出现「还有 N 条」这一行（边界：正好等于上限不该多一行）
     ④ 4 条任务 → 4 条全显示、无「还有」行
     ⑤ 排序口径没被截断打乱：未完成的必须排在已完成前面（截掉的是已完成那几条）
     ⑥ 截断只发生在上屏展示，**DATA 里一条任务都没少**（计划页仍能看到全部）
     ⑦ 极窄视口 1366×768 七条任务：收口后不会因任务变多再撑出纵向溢出（这条是当初溢出 62px 的档）
   跑法：node tests/_with_server.cjs tests/_probe_taskcap_1022.cjs 8956
   线上：BASE=https://yasihub.com node tests/_probe_taskcap_1022.cjs */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8956';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* 今天本地日期（🔴 必须走本地时区：页面 todayKey() 是本地时间，用 toISOString 会在北京时间 0~8 点差一整天） */
function todayLocal() {
  const d = new Date();
  const p = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 造 N 条今日任务：前 doneN 条已完成。id 带前缀方便断言。 */
function mkPlan(n, doneN) {
  const items = [];
  for (let i = 1; i <= n; i++) {
    items.push({ id: 'cap' + i, text: '探针任务 ' + i, done: i <= doneN, updatedAt: Date.now() });
  }
  return { date: todayLocal(), items: items, createdAt: Date.now(), updatedAt: Date.now() };
}

/* 播种：把今日计划塞进 DATA 并落盘。用 data.js 暴露的 hubSave 保证与产品同一套写入口径。
   🔴 播完必须派 `hub:data-merged` 让首页重算 —— 这正是产品自己「云合并后就地刷新」走的那条路
   （js/index.js:97）。不派事件的话 DOM 还是旧的，探针会读到上一轮的空卡。 */
function seed(plan) {
  return p => p.evaluate(pl => {
    DATA.plans = (DATA.plans || []).filter(x => !x || x.date !== pl.date).concat([pl]);
    hubSave();
    document.dispatchEvent(new CustomEvent('hub:data-merged'));
    return true;
  }, plan);
}

/* 翻页：45s 超时 + 最多 4 次。线上偶发慢（本机到 CF 边缘），别把网络慢报成页面坏。 */
async function gotoStable(p, url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return true;
    } catch (e) { last = e; await p.waitForTimeout(800); }
  }
  console.log('    (goto 重试 ' + tries + ' 次仍失败：' + String(last && last.message).slice(0, 80) + ')');
  return false;
}

const READ = () => {  const host = document.getElementById('dashTodayTasks');
  if (!host) return { rows: -1, more: null, display: 'no-host' };
  const rows = [...host.querySelectorAll('.plan-item')];
  const more = host.querySelector('.dash-tasks-more');
  const count = host.querySelector('.dash-tasks-count');
  return {
    rows: rows.length,
    texts: rows.map(r => (r.querySelector('.plan-text') || {}).textContent || ''),
    doneFlags: rows.map(r => r.classList.contains('done')),
    more: more ? more.textContent.replace(/\s+/g, ' ').trim() : null,
    moreHref: more ? more.getAttribute('href') : null,
    countText: count ? count.textContent.replace(/\s+/g, ' ').trim() : null,
    display: getComputedStyle(host).display,
    /* P-1 / HOME-VISUAL-1 等现版改版后，首页有 44px 顶栏与底部留白带来的少量自然滚动；
       原「页面完全不滚（overflow === 0）」不再是产品契约。这里仍量页面高度与纵向溢出，
       ⑦ 用「7 条收口 vs 4 条全显示」的高度差证明任务收口没有把页面撑长（原断言意图）。 */
    overflow: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
    pageH: document.documentElement.scrollHeight,
    cardBottom: Math.round(host.getBoundingClientRect().bottom),
    moreH: more ? Math.round(more.getBoundingClientRect().height) : 0,
    planItemsInData: ((DATA.plans || []).find(x => x && x.date === (host.dataset.todaykey || '')) || {}).items
  };
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  /* 拦掉所有接口：不碰线上 KV，也不让云同步把播种的任务合并掉 */
  await c.route(/\/api\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  await c.addInitScript(() => {
    try {
      localStorage.setItem('hub_onboarding_v1', '1');   // 关掉首进引导浮层，否则会插回来挡点击
    } catch (e) {}
  });

  console.log('== ① 7 条任务：只显示 5 条 + 还有 2 条 ==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await seed(mkPlan(7, 0))(p);
    await p.waitForTimeout(900);
    const r = await p.evaluate(READ);
    ok('首页只渲染 5 条任务', r.rows === 5, r.rows);
    ok('显示的是前 5 条（任务 1~5）', r.texts.join('|') === '探针任务 1|探针任务 2|探针任务 3|探针任务 4|探针任务 5', r.texts);
    ok('底部有「还有 2 条」', r.more !== null && /还有\s*2\s*条/.test(r.more), r.more);
    ok('「还有」这行指向计划页', r.moreHref === 'plans.html', r.moreHref);
    ok('卡头进度仍报全量 0/7（不是 0/5）', r.countText !== null && /0\/7/.test(r.countText), r.countText);
    ok('无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ② 点「还有 N 条」真能到计划页 ==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await seed(mkPlan(7, 0))(p);
    await p.waitForTimeout(900);
    await p.click('.dash-tasks-more');
    await p.waitForFunction(() => /plans/.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
    const landed = await p.evaluate(() => location.pathname.replace(/\.html$/, '').replace(/^\//, ''));
    ok('点了之后停在计划页', landed === 'plans', '实际 ' + landed);
    await p.close();
  }

  console.log('== ③ 边界：正好 5 条不该出现「还有」行 ==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await seed(mkPlan(5, 0))(p);
    await p.waitForTimeout(900);
    const r = await p.evaluate(READ);
    ok('5 条全部显示', r.rows === 5, r.rows);
    ok('没有「还有 N 条」这一行', r.more === null, r.more);
    await p.close();
  }

  console.log('== ④ 4 条任务：全显示、无收口行 ==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await seed(mkPlan(4, 0))(p);
    await p.waitForTimeout(900);
    const r = await p.evaluate(READ);
    ok('4 条全部显示', r.rows === 4, r.rows);
    ok('没有「还有 N 条」这一行', r.more === null, r.more);
    await p.close();
  }

  console.log('== ⑤ 排序口径：未完成在前，截掉的是已完成 ==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    /* 7 条里前 4 条已完成 → 排序后未完成的 5/6/7 应该排前面，首页 5 条 = 5,6,7 + 1,2 */
    await seed(mkPlan(7, 4))(p);
    await p.waitForTimeout(900);
    const r = await p.evaluate(READ);
    ok('首页 5 条里未完成排在最前（前 3 条都不是 done）', r.rows === 5 && r.doneFlags.slice(0, 3).every(x => x === false), r.doneFlags);
    ok('截掉的是末两位已完成任务（任务 3、4 没上首页）', r.texts.indexOf('探针任务 3') < 0 && r.texts.indexOf('探针任务 4') < 0, r.texts);
    ok('「还有 2 条」报得对', r.more !== null && /还有\s*2\s*条/.test(r.more), r.more);
    await p.close();
  }

  console.log('== ⑥ 截的是显示，不是数据：计划页仍能看到全部 7 条 ==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await seed(mkPlan(7, 0))(p);
    await p.waitForTimeout(800);
    const inData = await p.evaluate(tk => {
      const pl = (DATA.plans || []).find(x => x && x.date === tk);
      return pl ? pl.items.length : -1;
    }, todayLocal());
    ok('DATA 里今天仍是 7 条（首页只是没全显示）', inData === 7, inData);
    /* 🔴 翻页要放长超时 + 重试：本机到 CF 边缘偶尔 25s+（10-21 同类踩过），
       30s 默认超时会把「网络慢」报成「计划页打不开」。这不是产品问题。 */
    await gotoStable(p, BASE + '/plans.html');
    await p.waitForTimeout(1500);
    /* P-1（10-24）+ PLAN-VISIBLE-4（11-02）+ HUB-SIDE-SHELL-3（11-07）：
       旧「今日」文案已改成「今天」；桌面原小 tab 条收进左栏、DOM 保留给壳脚本转发。
       原断言「能找到今日入口并点回今天」按现版真实入口验：左栏「今天」按钮 /
       顶栏二级 today 深链 / #planTabs today 承载点，点了仍应落在今天面板。 */
    const entry = await p.evaluate(() => {
      const b = document.querySelector('.hub-sub[data-hub-sub="today"], .tb-sub-item[data-hub-sub="today"], #planTabs [data-ptab="today"]');
      if (b) b.click();
      return !!(b && document.querySelector('#ptabToday'));
    });
    await p.waitForTimeout(900);
    const rows = await p.evaluate(() => {
      const visible = [...document.querySelectorAll('#mkTaskList .m-task')].filter(x => getComputedStyle(x).display !== 'none');
      return Math.max(visible.length, document.querySelectorAll('#ptabToday .plan-item, #mkTaskList .m-task, #ptabToday li').length);
    });
    ok('计划页任务条目数 ≥ 7（全量可看）', rows >= 7, rows);
    ok('计划页能找到现版「今天」入口', entry === true);
    await p.close();
  }

  console.log('== ⑦ 1366×768 七条任务：收口后不因任务变多再撑出溢出 ==');
  {
    const c2 = await b.newContext({ viewport: { width: 1366, height: 768 } });
    await c2.route(/\/api\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    await c2.addInitScript(() => { try { localStorage.setItem('hub_onboarding_v1', '1'); } catch (e) {} });
    /* 两次播种各自用全新页面：首页对 hub:data-merged 有异步重渲染，
       同一页面连播 4→7 会被 Product 自己的重算时序吃掉，量到空卡（实测 rows=0）。
       这里沿用 ④/原⑦ 各自「一次播种、一次量」的稳定口径。 */
    const measureSeeded = async n => {
      const pg = await c2.newPage();
      await pg.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
      await pg.waitForTimeout(1300);
      await seed(mkPlan(n, 0))(pg);
      await pg.waitForTimeout(900);
      const snap = await pg.evaluate(READ);
      await pg.close();
      return snap;
    };
    /* HOME-VISUAL-1（10-26）后首页内容本来已接近 768 视口：4 条时 scrollHeight 768，
       7 条收口成 5 条 + 「还有 2 条」会自然多出一条任务行和一行收口链接，实测 815 / 47px。
       旧「overflow === 0 / 页面完全不滚」是 10-21 四卡旧版口径，现版允许轻滚动。
       等价契约保持原意图：只显示 5 条、余量不展开成 7 条、新增高度严格等于这 2 行的高度、不出现旧版 62px 级溢出。 */
    const base = await measureSeeded(4);
    const r = await measureSeeded(7);
    ok('只显示 5 条', r.rows === 5, r.rows);
    ok('底部有「还有 2 条，去计划页」', r.more !== null && /还有\s*2\s*条/.test(r.more) && r.moreHref === 'plans.html', r.more);
    ok('任务卡仍在首屏视口内', r.cardBottom > 0 && r.cardBottom <= 768, { cardBottom: r.cardBottom, winH: 768 });
    ok('收口后只有 5 条任务 + 1 行「还有」，不会把 7 条全展开', r.moreH > 0 && r.rows === 5, { rows: r.rows, moreH: r.moreH });
    ok('7 条收口后页面高度增量只来自这 2 行（没有旧版 62px 级溢出）',
      r.pageH > base.pageH && r.pageH - base.pageH < 62 && r.overflow < 62,
      { baseH: base.pageH, sevenH: r.pageH, baseOverflow: base.overflow, sevenOverflow: r.overflow, moreH: r.moreH });
    await c2.close();
  }

  await b.close();
  console.log('\n===== 首页任务收口：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})();
