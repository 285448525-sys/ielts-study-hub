/* 10-20 深夜 站长面板 UI 改版验收（方案 111：三段式 + 6 主指标 + 一条提示条 + teal 只作强调色）
   用法：node tests/_with_server.cjs tests/_probe_adminui_1020.cjs 8891
   线上：BASE=https://yasihub.com node tests/_probe_adminui_1020.cjs（会打真实 /api/admin，别跑） */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8891';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

const now = Date.now(), D = 86400000;
const PAYLOAD = {
  ok: true, day: '2026-10-20', week: '2026-W43', month: '2026-10', tookMs: 2100, kvReads: 486,
  sessCount: 12, aiToday: 38, aiWeek: 260, aiMonth: 1214, nReal: 3, nProbe: 21, nIdle: 5,
  priceOk: true, costMonth: 4.32, costMonthReal: 1.1, aiMonthReal: 42, aiTodayReal: 6, fbUnread: 2,
  trend: Array.from({ length: 14 }, (_, i) => ({ day: '10-' + (7 + i), calls: [12, 8, 21, 5, 30, 44, 18, 9, 26, 33, 14, 7, 19, 38][i], tok: 1200 + i * 640, cost: 0.02 + i * 0.011 })),
  users: [
    { acct: 'g285448525@163.com', ts: now - D * 2, lastSeen: now - 600000, isVip: true, daysLeft: 26, judge: 'real' },
    { acct: 'camille.test1@gmail.com', ts: now - D * 5, lastSeen: now - D, isVip: false, judge: 'real' },
    { acct: 'probe_0914_3@test.com', ts: now - D * 9, lastSeen: now - D * 9, judge: 'probe' }
  ],
  invites: [{ code: 'HUB-8K2M-QX', max: 10, used: 9, vipDays: 30, ts: now - D * 20 }],
  vips: [{ acct: 'g285448525@163.com', daysLeft: 26 }, { acct: 'camille.test1@gmail.com', daysLeft: 4 }],
  audits: [{ ts: now - 3600000, act: 'gen_invite', detail: { code: 'HUB-3P7D-LZ ×5' } }],
  feedbacks: [
    { ts: now - 5400000, acct: 'camille.test1@gmail.com', kind: '建议', text: '能不能加导出', read: false },
    { ts: now - 86400000, acct: 'g285448525@163.com', kind: 'bug', text: '跳两次', read: false }
  ]
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.route('**/api/admin', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ action: 'overview' }, PAYLOAD)) }));
  await p.addInitScript(() => { try { sessionStorage.setItem('hub_admin_key', 'TEST'); } catch (e) {} });
  await p.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  try { await p.fill('#keyInput', 'TEST'); await p.click('#gateBtn'); } catch (e) {}
  await sleep(2200);

  /* ① id 唯一 + 关键 id 都在 */
  const ids = await p.evaluate(() => {
    const all = [...document.querySelectorAll('[id]')].map(e => e.id);
    const dup = all.filter((v, i) => all.indexOf(v) !== i);
    const need = ['stUsers', 'stSess', 'stAiWeek', 'stAiMonth', 'stReal', 'stRealSub', 'stCostMonth', 'stCostSub',
      'stAiReal', 'stAiRealSub', 'stAi', 'stAiSub', 'stVip', 'stVipSub', 'stInv', 'stInvSub', 'stProbe',
      'probeCleanBtn', 'stFlags', 'todoList', 'trendChart', 'trendEmpty', 'trendSum', 'priceBar', 'priceSetBtn',
      'usageBtn', 'csvBtn', 'csvTrendBtn', 'csvSvcBtn', 'invBody', 'invMax', 'invVipDays', 'invCode', 'mintBtn',
      'refreshBtn', 'lockBtn', 'dayTag', 'judgeSummary', 'userBody', 'vipBody', 'auditBody', 'fbList', 'fbDot'];
    const missing = need.filter(id => !document.getElementById(id));
    return { dup, missing, panelVisible: !document.getElementById('panel').classList.contains('hidden') };
  });
  ok('①1 面板进来了', ids.panelVisible);
  ok('①2 没有重复 id', ids.dup.length === 0, ids.dup.join(','));
  ok('①3 老 id 一个没少（19 个新增 id + 原功能全部保留）', ids.missing.length === 0, ids.missing.join(','));

  /* ② 六个主指标有值 */
  const kpis = await p.evaluate(() => ({
    real: document.getElementById('stReal').textContent,
    realSub: document.getElementById('stRealSub').textContent,
    cost: document.getElementById('stCostMonth').textContent,
    costSub: document.getElementById('stCostSub').textContent,
    aiReal: document.getElementById('stAiReal').textContent,
    ai: document.getElementById('stAi').textContent,
    vip: document.getElementById('stVip').textContent,
    vipSub: document.getElementById('stVipSub').textContent,
    inv: document.getElementById('stInv').textContent,
    invSub: document.getElementById('stInvSub').textContent
  }));
  ok('②1 真人 = 3', kpis.real === '3', kpis.real);
  ok('②2 成本带单价（¥4.32）+ 副标题有单人价', kpis.cost.indexOf('¥4.32') === 0 && /单人|真人/.test(kpis.costSub), kpis.cost + ' / ' + kpis.costSub);
  ok('②3 真人本月调用 = 42', kpis.aiReal === '42', kpis.aiReal);
  ok('②4 会员 2 + 副标题说清到期', kpis.vip === '2' && /到期/.test(kpis.vipSub), kpis.vip + ' / ' + kpis.vipSub);
  ok('②5 邀请码 1 + 副标题说剩余码数', kpis.inv === '1' && /码/.test(kpis.invSub), kpis.inv + ' / ' + kpis.invSub);

  /* ③ 降级指标一行小字（4 项都在） */
  const more = await p.evaluate(() => {
    const bar = document.querySelector('.morebar');
    const txt = bar.textContent || '';
    return { n: bar.querySelectorAll('.it').length, has: ['stUsers', 'stSess', 'stAiWeek', 'stAiMonth'].every(id => document.getElementById(id)) };
  });
  ok('③ 降级指标 4 项都在（一个数不删）', more.n === 4 && more.has, 'n=' + more.n);

  /* ④ 一条提示条 + 待办列表 */
  const flags = await p.evaluate(() => {
    const strip = document.getElementById('stFlags');
    const list = document.getElementById('todoList');
    return {
      flagCount: strip.querySelectorAll('.flag').length,
      isOneLine: strip.textContent.indexOf('有') > -1 && strip.querySelector('.dot') !== null,
      todoItems: list.querySelectorAll('li').length,
      hasFbLink: !!document.getElementById('flagGoFb'),
      probeBtn: !!document.getElementById('probeCleanBtn')
    };
  });
  ok('④1 提示条只有一条（旧版是 3 条竖叠）', flags.flagCount === 0 && flags.isOneLine);
  ok('④2 待办列表有内容', flags.todoItems >= 3, 'n=' + flags.todoItems);
  ok('④3 反馈跳转 + 探针清理按钮都还在', flags.hasFbLink && flags.probeBtn);

  /* ⑤ 趋势图渲染出 svg */
  const trend = await p.evaluate(() => ({
    svg: !!document.querySelector('#trendChart svg'),
    sum: (document.getElementById('trendSum').textContent || '').slice(0, 20),
    dayTag: (document.getElementById('dayTag').textContent || '').indexOf('今日') > -1
  }));
  ok('⑤1 趋势图渲染出 svg', trend.svg);
  ok('⑤2 顶部元信息含「今日」（从标题旁挪到下方）', trend.dayTag);

  /* ⑥ 两个页签照旧能用 */
  await p.evaluate(() => { document.querySelector('.tab[data-tab="audit"]').click(); });
  await sleep(500);
  const audit = await p.evaluate(() => !document.getElementById('pgAudit').classList.contains('hidden'));
  await p.evaluate(() => { document.querySelector('.tab[data-tab="fb"]').click(); });
  await sleep(500);
  const fb = await p.evaluate(() => !document.getElementById('pgFb').classList.contains('hidden') && document.querySelectorAll('#fbList .fb-row').length >= 1);
  ok('⑥1 操作审计页签能开', audit);
  ok('⑥2 反馈页签能开且有内容', fb);

  /* ⑦ 手机 390 不横向溢出 */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => errs.push('phone:' + String(e).slice(0, 120)));
  await p2.route('**/api/admin', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ action: 'overview' }, PAYLOAD)) }));
  await p2.addInitScript(() => { try { sessionStorage.setItem('hub_admin_key', 'TEST'); } catch (e) {} });
  await p2.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  try { await p2.fill('#keyInput', 'TEST'); await p2.click('#gateBtn'); } catch (e) {}
  await sleep(2000);
  const mob = await p2.evaluate(() => ({
    overflow: document.body.scrollWidth - document.documentElement.clientWidth,
    kpiCols: getComputedStyle(document.querySelector('.kpis')).gridTemplateColumns.split(' ').length,
    ovCols: getComputedStyle(document.querySelector('.ovgrid')).gridTemplateColumns.split(' ').length
  }));
  ok('⑦1 手机 390 无横向溢出', mob.overflow <= 0, 'overflow=' + mob.overflow);
  ok('⑦2 手机 KPI 2 列（重排不是缩小）', mob.kpiCols === 2, mob.kpiCols);
  ok('⑦3 手机趋势/待办单列', mob.ovCols === 1, mob.ovCols);

  ok('⑧ 全程零 JS 报错', errs.length === 0, errs.join(' | '));

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
