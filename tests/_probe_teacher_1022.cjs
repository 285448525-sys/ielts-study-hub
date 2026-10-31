/* 10-22 三级权限第二批：老师端「学生数据」页验收
   用法：node tests/_with_server.cjs tests/_probe_teacher_1022.cjs 8897
   ⚠️ 只打本地静态站 + 拦截 /api/roles 造假数据，**不碰生产 KV**（零写入）。

   覆盖（对着 design/115 的「四个必做状态」+ 只读铁律）：
     ① 未登录 → 先登录态（不白屏）          ② 普通用户 → 无权限态，且**连名单都不请求**
     ③ 管理员 → 名单/详情/图表/四卡/时长/提交 ④ 侧栏入口只对管理员出现
     ⑤ 换人 → 详情整块换、URL 带 email        ⑥ 提交原文就地展开且**转义**（<script> 当文本）
     ⑦ 筛选口语/写作 ⑧ 名单只请求 1 次（不按人读 blob）
     ⑨ 手机 390 不横向溢出 + 切换弹层          ⑩ 全程零 JS 报错 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8897';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

const TOKEN = 'a'.repeat(32);
const TODAY = (() => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
})();
const dayAgo = n => {
  const d = new Date(Date.now() - n * 86400000), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

const S = {
  acct: 'teacher@x.com', role: 'teacher',
  students: [
    { email: 'wangsiyuan_97@163.com', nickname: '', lastActive: Date.now() - 3600000 },
    { email: 'liyang0221@qq.com', nickname: '', lastActive: Date.now() - 2 * 86400000 },
    { email: 'sunke@outlook.com', nickname: '', lastActive: 0 }
  ]
};
const MOCKS = [
  { date: dayAgo(18), type: 'reading', overall: 5.0, parts: [], usedSec: 3600 },
  { date: dayAgo(12), type: 'listening', overall: 5.5, parts: [], usedSec: 1800 },
  { date: dayAgo(8), type: 'reading', overall: 5.0, parts: [], usedSec: 3600 },
  { date: dayAgo(5), type: 'reading', overall: 6.0, parts: [], usedSec: 3500 },
  { date: dayAgo(2), type: 'listening', overall: 6.5, parts: [], usedSec: 1800 },
  { date: TODAY, type: 'reading', overall: 6.0, parts: [], usedSec: 3600 }
];
const VIEW = {
  ok: true,
  student: { email: 'wangsiyuan_97@163.com', nickname: '王思远' },
  scores: { mock: MOCKS, manual: [], writing: [{ date: TODAY, title: '科技让人更孤独', overall: 6.0, hasEssay: true }] },
  time: {
    totalMinutes: 2140, weekMinutes: 320,
    byModule: [{ module: '单词', minutes: 108 }, { module: '模考', minutes: 81 }, { module: '口语', minutes: 54 }]
  },
  vocab: {
    total: 1860, cleared: 640, dueToday: 37,
    levels: [{ level: 0, name: '0 新词', count: 420 }, { level: 1, name: '1', count: 300 }, { level: 2, name: '2', count: 260 },
    { level: 3, name: '3', count: 210 }, { level: 4, name: '4', count: 190 }, { level: 5, name: '5', count: 200 },
    { level: 6, name: '6', count: 160 }, { level: 7, name: '7 长期', count: 120 }]
  },
  submissions: [
    { kind: 'speaking', part: 'P2', title: 'Describe a place you like to visit', ts: Date.now() - 3600000, text: 'Well, the place I want to talk about is a small library. <script>window.__xss=1</script> It is quiet.' },
    { kind: 'writing', part: 'Task 2', title: '科技让人更孤独还是更亲近', ts: Date.now() - 86400000, text: 'Nowadays technology plays a vital role in our daily life.' },
    { kind: 'speaking', part: 'P1', title: 'Hometown · 第 3 题', ts: Date.now() - 3 * 86400000, text: 'My hometown is a small city in Zhejiang.' }
  ],
  generatedAt: Date.now()
};

const json = o => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const errs = [];

  /* ---------- ① 未登录 ---------- */
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push('guest:' + String(e).slice(0, 160)));
    await p.route(/\/api\/roles/, r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'unauthorized' }) }));
    await p.goto(BASE + '/teacher.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tch-state', { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => ({
      txt: (document.querySelector('.tch-state') || {}).textContent || '',
      login: !!document.querySelector('.tch-state a[href="login.html"]'),
      roster: !!document.querySelector('.tch-ritem')
    }));
    ok('①1 未登录 → 「先登录」态（不是空白、不是转圈）', /先登录/.test(r.txt), r.txt.slice(0, 30));
    ok('①2 给了去登录的按钮', r.login);
    ok('①3 未登录不泄露名单', !r.roster);
    await c.close();
  }

  /* ---------- ② 普通用户 ---------- */
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await c.newPage();
    let nStudents = 0;
    p.on('pageerror', e => errs.push('user:' + String(e).slice(0, 160)));
    await p.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.removeItem('hub_role_v1'); } catch (e) {} }, TOKEN);
    await p.route(/\/api\/roles/, r => {
      const u = new URL(r.request().url());
      if (u.searchParams.get('action') === 'students') nStudents++;
      return r.fulfill(json({ ok: true, acct: 'stu@x.com', role: 'user' }));
    });
    await p.goto(BASE + '/teacher.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tch-state', { timeout: 8000 }).catch(() => {});
    await sleep(600);
    const r = await p.evaluate(() => ({
      txt: (document.querySelector('.tch-state') || {}).textContent || '',
      roster: !!document.querySelector('.tch-ritem'),
      navEntry: !!document.querySelector('#mainNav [data-id="teacher"]')
    }));
    ok('②1 普通用户 → 「需要管理员权限」', /需要管理员权限/.test(r.txt), r.txt.slice(0, 30));
    ok('②2 普通用户根本拿不到名单', !r.roster);
    ok('②3 普通用户**一次** action=students 都没发', nStudents === 0, 'n=' + nStudents);
    ok('②4 普通用户侧栏没有「学生数据」入口', !r.navEntry);

    /* 同一个浏览器上下文顺带验：别的页面（review）也没有这个入口 */
    await p.goto(BASE + '/review.html', { waitUntil: 'domcontentloaded' });
    await sleep(900);
    const nav2 = await p.evaluate(() => !!document.querySelector('#mainNav [data-id="teacher"]'));
    ok('②5 普通用户在别的页面也没有入口', !nav2);
    await c.close();
  }

  /* ---------- ③④⑤⑥⑦⑧ 管理员 ---------- */
  const c3 = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p3 = await c3.newPage();
  let nStudentsReq = 0, nViewReq = 0;
  p3.on('pageerror', e => errs.push('admin:' + String(e).slice(0, 160)));
  await p3.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.removeItem('hub_role_v1'); } catch (e) {} }, TOKEN);
  await p3.route(/\/api\/roles/, r => {
    const u = new URL(r.request().url());
    const act = u.searchParams.get('action');
    const view = u.searchParams.get('view');
    if (act === 'me') return r.fulfill(json({ ok: true, acct: S.acct, role: 'teacher' }));
    if (act === 'students') { nStudentsReq++; return r.fulfill(json({ ok: true, acct: S.acct, role: 'teacher', students: S.students })); }
    if (view) {
      nViewReq++;
      const st = S.students.find(x => x.email === view) || S.students[0];
      const nick = view === 'liyang0221@qq.com' ? '李洋' : '王思远';
      return r.fulfill(json(Object.assign({}, VIEW, {
        student: { email: st.email, nickname: nick },
        scores: Object.assign({}, VIEW.scores, { mock: view === 'liyang0221@qq.com' ? MOCKS.slice(0, 3) : MOCKS })
      })));
    }
    return r.fulfill(json({ ok: false, error: 'bad_action' }));
  });

  await p3.goto(BASE + '/teacher.html', { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('.tch-idband', { timeout: 10000 }).catch(() => {});
  await sleep(500);

  const r3 = await p3.evaluate(() => {
    const stat = [...document.querySelectorAll('.tch-stat')];
    return {
      roster: document.querySelectorAll('.tch-ritem').length,
      on: (document.querySelector('.tch-ritem.on') || { getAttribute: () => '' }).getAttribute('data-email'),
      who: (document.querySelector('.tch-idband .who b') || {}).textContent || '',
      stats: stat.map(e => (e.querySelector('.lb').textContent + '=' + e.querySelector('.vl').textContent)),
      chart: !!document.querySelector('.tch-chart svg'),
      bars: document.querySelectorAll('.tch-brow').length,
      vbar: document.querySelectorAll('.tch-vbar i').length,
      due: (document.querySelector('.tch-vdue') || {}).textContent || '',
      subs: document.querySelectorAll('.tch-srow').length,
      editable: document.querySelectorAll('#tchRoot input:not([type=search]),#tchRoot textarea,#tchRoot [contenteditable]').length,
      navEntry: !!document.querySelector('#mainNav [data-id="teacher"]'),
      navActive: !!document.querySelector('#mainNav [data-id="teacher"].active, #mainNav [data-id="teacher"].on'),
      pill: (document.querySelector('.tch-pill') || {}).textContent || ''
    };
  });
  ok('③1 名单 3 人 + 默认选中第一个人', r3.roster === 3 && r3.on === S.students[0].email, r3.roster + ' / ' + r3.on);
  ok('③2 详情用**昵称**（进详情才拿到，列表是邮箱前缀）', r3.who === '王思远', r3.who);
  ok('③3 四个数字卡都有值', r3.stats.length === 4 && r3.stats.every(s => !/=$/.test(s)), r3.stats.join(' | '));
  ok('③4 本周学习按小时分显示（320 分 → 5 小时 20 分）', /5\s*小时\s*20\s*分/.test(r3.stats[0] || ''), r3.stats[0]);
  ok('③5 最近模考总分 6.0', /6\.0$/.test((r3.stats[2] || '').replace(/\s/g, '')), r3.stats[2]);
  ok('③6 待复习 37 个', /37/.test(r3.stats[3] || ''), r3.stats[3]);
  ok('③7 成绩趋势画出了折线', r3.chart);
  ok('③8 学习时长按模块出条（3 个模块）', r3.bars === 3, 'n=' + r3.bars);
  ok('③9 词汇掌握度色条有分段（8 档全非零）', r3.vbar === 8, 'n=' + r3.vbar);
  ok('③10 今天到期提示带「37 个」', /37/.test(r3.due), r3.due.slice(0, 24));
  ok('③11 提交列表 3 条', r3.subs === 3, 'n=' + r3.subs);
  ok('③12 整页零可编辑控件（只读铁律）', r3.editable === 0, 'n=' + r3.editable);
  ok('③13 标题栏常驻「管理员视图 · 只读」', /只读/.test(r3.pill), r3.pill);
  ok('④1 管理员导航出现「学生数据」', r3.navEntry);
  ok('④2 且当前页高亮', r3.navActive);
  ok('⑧1 名单只请求 1 次（不按人读 blob）', nStudentsReq === 1, 'n=' + nStudentsReq);
  ok('⑧2 首屏只读 1 个学生的详情', nViewReq === 1, 'n=' + nViewReq);

  /* ⑥ 提交原文：点开就地展开 + 转义 */
  await p3.evaluate(() => { const b = document.querySelector('.tch-sbtn'); if (b) b.click(); });
  await sleep(350);
  const es = await p3.evaluate(() => {
    const e = document.querySelector('.tch-essay');
    return {
      has: !!e,
      txt: e ? e.textContent : '',
      scripts: e ? e.querySelectorAll('script').length : -1,
      xss: typeof window.__xss,
      expanded: (document.querySelector('.tch-sbtn') || { getAttribute: () => '' }).getAttribute('aria-expanded')
    };
  });
  ok('⑥1 点一条就就地展开原文', es.has);
  ok('⑥2 原文里的 <script> 当**文本**显示，没被执行', es.txt.indexOf('<script>') > -1 && es.xss === 'undefined' && es.scripts === 0,
    'xss=' + es.xss + ' scripts=' + es.scripts);
  ok('⑥3 展开态 aria-expanded=true', es.expanded === 'true');
  /* 展开只保留一条 */
  await p3.evaluate(() => { const bs = document.querySelectorAll('.tch-sbtn'); if (bs[1]) bs[1].click(); });
  await sleep(300);
  const one = await p3.evaluate(() => document.querySelectorAll('.tch-essay').length);
  ok('⑥4 同时只展开一条（避免整页跳动）', one === 1, 'n=' + one);

  /* ⑦ 筛选 */
  await p3.evaluate(() => { const b = document.querySelector('[data-filter="speaking"]'); if (b) b.click(); });
  await sleep(300);
  const spN = await p3.evaluate(() => document.querySelectorAll('.tch-srow').length);
  ok('⑦1 筛「口语」只剩 2 条', spN === 2, 'n=' + spN);
  await p3.evaluate(() => { const b = document.querySelector('[data-filter="writing"]'); if (b) b.click(); });
  await sleep(300);
  const wrN = await p3.evaluate(() => document.querySelectorAll('.tch-srow').length);
  ok('⑦2 筛「写作」只剩 1 条', wrN === 1, 'n=' + wrN);

  /* ⑤ 换人 */
  await p3.evaluate(() => { const b = document.querySelectorAll('.tch-ritem')[1]; if (b) b.click(); });
  await p3.waitForFunction(() => {
    const b = document.querySelector('.tch-idband .who b');
    return b && b.textContent.indexOf('李洋') >= 0;
  }, { timeout: 6000 }).catch(() => {});
  const ch = await p3.evaluate(() => ({
    who: (document.querySelector('.tch-idband .who b') || {}).textContent || '',
    on: (document.querySelector('.tch-ritem.on') || { getAttribute: () => '' }).getAttribute('data-email'),
    url: location.search,
    subs: document.querySelectorAll('.tch-srow').length
  }));
  ok('⑤1 点名单第二个人 → 详情整块换', ch.who === '李洋', ch.who);
  ok('⑤2 选中态跟着走', ch.on === 'liyang0221@qq.com', ch.on);
  ok('⑤3 URL 带上 email（刷新/回退不丢人）', /email=liyang0221%40qq\.com/.test(ch.url), ch.url);
  ok('⑤4 换人后提交列表按新人重算', ch.subs === 3, 'n=' + ch.subs);

  const ovf = await p3.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
  ok('⑨1 桌面 1360 无横向溢出', ovf <= 0, 'overflow=' + ovf);
  await c3.close();

  /* ---------- ⑨ 手机 390 ---------- */
  {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push('phone:' + String(e).slice(0, 160)));
    await p.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.removeItem('hub_role_v1'); } catch (e) {} }, TOKEN);
    await p.route(/\/api\/roles/, r => {
      const u = new URL(r.request().url());
      const act = u.searchParams.get('action');
      if (act === 'me') return r.fulfill(json({ ok: true, acct: S.acct, role: 'teacher' }));
      if (act === 'students') return r.fulfill(json({ ok: true, acct: S.acct, role: 'teacher', students: S.students }));
      if (u.searchParams.get('view')) {
        const v = u.searchParams.get('view');
        const nick = v.indexOf('sunke') === 0 ? '孙可' : '王思远';
        return r.fulfill(json(Object.assign({}, VIEW, { student: { email: v, nickname: nick } })));
      }
      return r.fulfill(json({ ok: false }));
    });
    await p.goto(BASE + '/teacher.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tch-idband', { timeout: 10000 }).catch(() => {});
    await sleep(400);
    const m1 = await p.evaluate(() => ({
      ovf: document.body.scrollWidth - document.documentElement.clientWidth,
      rosterShown: getComputedStyle(document.querySelector('.tch-roster')).display !== 'none',
      pickShown: getComputedStyle(document.querySelector('.tch-pick')).display !== 'none',
      statCols: getComputedStyle(document.querySelector('.tch-stats')).gridTemplateColumns.split(' ').length
    }));
    ok('⑨2 手机 390 无横向溢出', m1.ovf <= 0, 'overflow=' + m1.ovf);
    ok('⑨3 手机名单收起、当前学生卡顶上', !m1.rosterShown && m1.pickShown);
    ok('⑨4 手机四个数字卡 2 列', m1.statCols === 2, m1.statCols);

    await p.evaluate(() => { const b = document.querySelector('[data-act="sheet"]'); if (b) b.click(); });
    await sleep(350);
    const sheet = await p.evaluate(() => ({
      ov: !!document.querySelector('.tch-sheet-ov'),
      items: document.querySelectorAll('.tch-sheet-ov .tch-ritem').length
    }));
    ok('⑨5 点「切换」开弹层，里面是同一份名单', sheet.ov && sheet.items === 3, 'n=' + sheet.items);
    await p.evaluate(() => { const b = document.querySelectorAll('.tch-sheet-ov .tch-ritem')[2]; if (b) b.click(); });
    await sleep(500);
    const closed = await p.evaluate(() => ({
      ov: !!document.querySelector('.tch-sheet-ov'),
      pick: (document.querySelector('.tch-pick .m b') || {}).textContent || ''
    }));
    ok('⑨6 选完自动关弹层 + 顶部卡换成了那个人', !closed.ov && closed.pick.indexOf('孙可') >= 0, closed.pick);
    await c.close();
  }

  ok('⑩ 全程零 JS 报错', errs.length === 0, errs.join(' | '));

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
