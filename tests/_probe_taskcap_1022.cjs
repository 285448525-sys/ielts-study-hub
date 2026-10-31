/* 探针：首页「今日任务」超过 5 条时的收口（10-22 她拍板）
   她原话：「任务超过 5~6 条时小屏会重新溢出 → 只显示前 N 条 + 还有 N 条去计划页」。
   验什么：
     ① 7 条任务 → 首页只渲染 5 条，第 6、7 条不上首页；底部出现「还有 2 条，去计划页看全部」
     ② 该行的链接真的指向计划页；点它真能到计划页（软导航）
     ③ 5 条任务 → 不出现「还有 N 条」这一行（边界：正好等于上限不该多一行）
     ④ 4 条任务 → 4 条全显示、无「还有」行
     ⑤ 排序口径没被截断打乱：未完成的必须排在已完成前面（截掉的是已完成那几条）
     ⑥ 截断只发生在上屏展示，**DATA 里一条任务都没少**（计划页仍能看到全部）
     ⑦ 极窄视口 1366×768 七条任务：首页不出现纵向溢出（这条是当初溢出 62px 的档）
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
    /* 首页是否纵向溢出（一屏不滚是 10-21 定的口径） */
    overflow: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
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
    const btn = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button,a')].find(x => /今日/.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    await p.waitForTimeout(900);
    const rows = await p.evaluate(() => document.querySelectorAll('.plan-item, .pt-item, li').length);
    ok('计划页任务条目数 ≥ 7（全量可看）', rows >= 7, rows);
    ok('（计划页能找到「今日」入口）', btn === true);
    await p.close();
  }

  console.log('== ⑦ 1366×768 七条任务：首页不纵向溢出 ==');
  {
    const c2 = await b.newContext({ viewport: { width: 1366, height: 768 } });
    await c2.route(/\/api\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    await c2.addInitScript(() => { try { localStorage.setItem('hub_onboarding_v1', '1'); } catch (e) {} });
    const p = await c2.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);
    await seed(mkPlan(7, 0))(p);
    await p.waitForTimeout(900);
    const r = await p.evaluate(READ);
    ok('只显示 5 条', r.rows === 5, r.rows);
    ok('1366×768 下纵向溢出为 0（原来 7 条会溢出）', r.overflow === 0, r.overflow);
    await p.close();
    await c2.close();
  }

  await b.close();
  console.log('\n===== 首页任务收口：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})();
