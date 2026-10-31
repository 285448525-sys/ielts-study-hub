/* 探针：全站换顶栏 · 第 3 批（design/116）= 计划 / 计时 / 句子 / 错句本 / 回顾 五张长列表 / 多滚动页面
   验什么：
     ① 桌面 1440：五页真的渲染顶栏、body 无 288px 侧栏留白、内容不被 44px 顶栏压住、无侧栏 DOM 残留、无横向溢出
     ② 顶栏高亮（design/116 决策②）：计划 → 胶囊「计划」· 句子 → 胶囊「句子」·
        回顾 / 错句本 → 「更多」面板里那两格 · 计时 → 全不亮（手动入口 10-21 已撤，只是会话收尾落点）
     ③ 计划页吸顶实测（全批唯一真吸顶处）：播种 24 条任务把页面撑长 → 滚到底，量「输入区」上沿是否
        仍停在顶栏下面、整块是否被裁。⚠️ 断言用**量到的值**，不写死 72/116 —— 前两批教训是算出来的数会差一截。
     ④ 软导航跨壳：首页 → 计划（顶栏→顶栏，壳不动）· 计划 → bank · bank → 回顾。
       ⚠️ 10-22 更新两轮：第 4 批把「背词页」这个侧栏样本换掉了，第 5 批连 bank 也换成顶栏壳
       → 全站已无「侧栏 vs 顶栏」的跨壳活样本，本节从「换壳」验收改成「同壳不重建」验收
       （跨壳覆盖挪到 tests/_probe_shell5_1022.cjs 的 ⑥）。
     ⑤ 手机 390：五页仍是顶栏壳、胶囊与搜索隐藏（导航走底部 dock）、内容不被压住、无横向溢出
   跑法：node tests/_with_server.cjs tests/_probe_shell3_1022.cjs 8953
   线上：BASE=https://yasihub.com node tests/_probe_shell3_1022.cjs
   ⚠️ 线上跑本支大概率 `goto` 慢网超时（见 HANDOFF 踩点）—— 是网络不是回归，改用真浏览器点查或拆段版。 */
const { chromium } = require('playwright-core');
const ancSeed = require('./_anc_seed.cjs');   // 10-25 W-UI-1：关掉「未读公告」这个变量
const BASE = process.env.BASE || 'http://127.0.0.1:8953';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const TOKEN = 'a'.repeat(32);

/* 五页都会在启动时打接口（账号/角色/同步探活）。全部拦掉：不碰线上 KV，也不让真接口把页面卡住。 */
function mockRoutes(ctx) {
  return ctx.route(/\/api\/(roles|sync|admin|ai|auth|feedback|explain)/, r => {
    const u = new URL(r.request().url());
    if (u.pathname.indexOf('/api/roles') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acct: 't@x.com', role: 'teacher' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
  });
}

async function measure(p) {
  await p.waitForFunction(() => !!document.body && !!document.querySelector('main'), null, { timeout: 60000 }).catch(() => {});
  return p.evaluate(() => {
    if (!document.body) return { shell: '(未就绪)', attr: '?', padL: '?', padT: '?', navH: null, mainTop: null,
      onCaps: [], onMore: [], capsDisplay: '?', searchDisplay: '?', scrollW: 0, docW: 0, sideItem: 0, sideHead: 0 };
    const nav = document.getElementById('mainNav');
    const main = document.querySelector('main');
    const cs = getComputedStyle(document.body);
    const mr = main ? main.getBoundingClientRect() : null;
    const navR = nav ? nav.getBoundingClientRect() : null;
    return {
      shell: nav ? nav.className : '(无 nav)',
      attr: document.body.getAttribute('data-shell'),
      padL: cs.paddingLeft, padT: cs.paddingTop,
      navH: navR ? Math.round(navR.height) : null,
      mainTop: mr ? Math.round(mr.top) : null,
      onCaps: [...document.querySelectorAll('.tb-item.on')].map(a => (a.textContent || '').trim()),
      onMore: [...document.querySelectorAll('.tb-more-item.on')].map(a => (a.textContent || '').trim()),
      capsDisplay: (() => { const c = document.querySelector('.tb-caps'); return c ? getComputedStyle(c).display : '(无)'; })(),
      searchDisplay: (() => { const s = document.querySelector('.tb-search'); return s ? getComputedStyle(s).display : '(无)'; })(),
      scrollW: document.documentElement.scrollWidth, docW: document.documentElement.clientWidth,
      sideItem: document.querySelectorAll('.side-item').length,
      sideHead: document.querySelectorAll('.side-head').length
    };
  });
}

/* 吸顶只读解析值：够不够滚要看页面自己，判定交给调用处。 */
async function stickyCheck(p, sel) {
  return p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = document.documentElement;
    const topPx = parseFloat(getComputedStyle(el).top) || 0;
    return { topPx, pos: getComputedStyle(el).position,
      canScroll: Math.max(0, r.scrollHeight - r.clientHeight) };
  }, sel);
}

/* 播种：把今日计划塞进 DATA 并落盘。用 data.js 暴露的 hubSave 保证与产品同一套写入口径。
   🔴 播完必须派 `hub:data-merged` —— 这正是产品自己「云合并后就地刷新」走的那条路；
   然后**整页 reload** 让计划页从落盘数据重建 DOM（任务列表是本页自己渲染的，不靠那个事件）。 */
const SEED_N = 24;
async function seedPlans(p) {
  return p.evaluate(n => {
    const d = new Date();
    const tk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const items = [];
    for (let i = 1; i <= n; i++) items.push({ id: 'sh3_' + i, text: '探针任务 ' + i + ' —— 用来把页面撑长以测吸顶', done: i <= 3, updatedAt: Date.now() });
    DATA.plans = (DATA.plans || []).filter(x => !x || x.date !== tk).concat([{ date: tk, items: items, createdAt: Date.now(), updatedAt: Date.now() }]);
    hubSave();
    document.dispatchEvent(new CustomEvent('hub:data-merged'));
    return { tk, n: items.length };
  }, SEED_N);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });

  console.log('== ① 桌面 1440：第 3 批五页 ==');
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  await mockRoutes(c);
  /* 高亮口径（design/116 决策②）：计划 / 句子在 8 个胶囊里 → 亮胶囊；回顾 / 错句本属「更多」→ 亮面板那格；
     计时手动入口已撤 → 全不亮（不是坏了，同上一批的服药 / 新手 / 素材）。 */
  /* 10-23 口径更新：T-014 把「回顾」提为一级胶囊 → 亮胶囊不再亮「更多」；
     T-015 删了 wrongbook.html（现 302 到 writing.html）→ 从本表移除；
     T-012 撤了计时页入口但 timer.html 仍可达 → 保留「全不亮」那条。 */
  const want = {
    'plans.html':    { caps: '计划', more: '' },
    'corpus.html':   { caps: '句子', more: '' },
    'review.html':   { caps: '回顾', more: '' },
    'timer.html':    { caps: '',     more: '' }
  };
  for (const f of Object.keys(want)) {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const m = await measure(p);
    ok(f + ' · 渲染顶栏壳', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok(f + ' · 侧栏留白已退（padding-left 0）', m.padL === '0px', m.padL);
    ok(f + ' · 内容不被顶栏压住（main.top ≥ 44）', m.mainTop >= 44, { mainTop: m.mainTop, navH: m.navH });
    ok(f + ' · 没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok(f + ' · 胶囊高亮 = ' + (want[f].caps || '（无）'), m.onCaps.join('|') === want[f].caps, m.onCaps);
    ok(f + ' · 更多面板高亮 = ' + (want[f].more || '（无）'), m.onMore.join('|') === want[f].more, m.onMore);
    ok(f + ' · 桌面无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok(f + ' · 无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ② 计划页吸顶实测（桌面 1440，播种 ' + SEED_N + ' 条任务）==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/plans.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const seeded = await seedPlans(p);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    const rows = await p.evaluate(() => document.querySelectorAll('#ptabToday .plan-item').length);
    ok('播种的 ' + SEED_N + ' 条任务已渲染', rows >= SEED_N, rows + ' 行（' + seeded.tk + '）');
    const s = await stickyCheck(p, '#ptabToday .pt-add');
    ok('输入区仍是 sticky（桌面专属）', s && s.pos === 'sticky', s && s.pos);
    ok('页面真的能滚（滚不动就测不到吸顶）', s && s.canScroll > 100, s && s.canScroll);
    /* 核心：滚到底，量出来的位置必须让过顶栏 —— 不写死数值，只要求「上沿在顶栏下面、整块没被裁」 */
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(700);
    const m = await p.evaluate(() => {
      const bar = document.querySelector('.hub-topbar');
      const add = document.querySelector('#ptabToday .pt-add');
      const br = bar ? bar.getBoundingClientRect() : null;
      const ar = add ? add.getBoundingClientRect() : null;
      const on = [...document.querySelectorAll('.tb-item.on')].map(a => (a.textContent || '').trim());
      return { scrollY: Math.round(window.scrollY), barBottom: br ? Math.round(br.bottom) : null,
        addTop: ar ? Math.round(ar.top) : null, addBottom: ar ? Math.round(ar.bottom) : null,
        addH: ar ? Math.round(ar.height) : null, winH: window.innerHeight, on };
    });
    ok('滚到底：输入区上沿停在顶栏下面（没被压住）', m.addTop >= m.barBottom, m);
    ok('滚到底：输入区整块可见（下沿没被屏幕裁掉）', m.addBottom <= m.winH + 1, m);
    ok('滚到底：整块高度没变（没被压扁）', Math.abs(m.addH - Math.round(m.addH)) <= 1 && m.addH > 120, m.addH);
    ok('滚到底：顶栏高亮仍是「计划」', m.on.join('') === '计划', m.on);
    ok('吸顶实测无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ③ 软导航跨壳：首页 → 计划（顶栏→顶栏）→ bank（→侧栏）→ 回顾（→顶栏）==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);

    await p.evaluate(() => softNavigate({ href: 'plans.html', file: 'plans.html', id: 'plans' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    let m = await measure(p);
    ok('首页 → 计划：壳仍是顶栏（不重建）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('首页 → 计划：侧栏留白清掉', m.padL === '0px', m.padL);
    ok('首页 → 计划：高亮从「首页」移到「计划」', m.onCaps.join('') === '计划', m.onCaps);

    // 顶栏 → 顶栏（计划 → bank；10-22 第 5 批 bank 也换成顶栏壳了 → 跨壳样本没了，
    // 这里改成「同壳不重建」的口径：壳不动、留白不回来、高亮移到「模考」）
    await p.evaluate(() => softNavigate({ href: 'bank.html', file: 'bank.html', id: 'bank' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    m = await measure(p);
    ok('计划 → bank：壳仍是顶栏（第 5 批起 bank 也换了壳）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('计划 → bank：288px 侧栏留白没回来（仍是 0）', m.padL === '0px', m.padL);
    ok('计划 → bank：没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok('计划 → bank：高亮 = 机经', m.onCaps.join('') === '机经', m.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）

    // 顶栏 → 顶栏（bank → 回顾）
    await p.evaluate(() => softNavigate({ href: 'review.html', file: 'review.html', id: 'review' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    m = await measure(p);
    ok('bank → 回顾：壳切回顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('bank → 回顾：侧栏留白清掉', m.padL === '0px', m.padL);
    ok('bank → 回顾：高亮落到一级胶囊「回顾」（T-014 提级）', m.onCaps.join('') === '回顾' && m.onMore.length === 0, { caps: m.onCaps, more: m.onMore });
    ok('跨壳来回三次无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ④ 手机 390：第 3 批五页 ==');
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cm.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  /* 🔴 10-25 W-UI-1：测「顶栏 44px 让位归零」前先把未读公告关掉 —— 公告条是 sticky、
     在文档流里真实占 34px，不关掉这条测到的是「被公告顶了一下」，两件事混着判分不清。
     夹具见 tests/_anc_seed.cjs（里面写了两个必须踩过的坑）。 */
  await mockRoutes(cm);
  await ancSeed.seedAncRead(cm, BASE);
  for (const f of Object.keys(want)) {
    const p = await cm.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);
    await ancSeed.waitAncGone(p);
    const m = await measure(p);
    ok(f + ' · 手机端顶栏让位归零（10-23 全站口径）', m.shell === 'hub-topbar' && m.padT === '0px', m.shell + '/' + m.padT);
    ok(f + ' · 手机隐藏胶囊与搜索（导航走 dock）', m.capsDisplay === 'none' && m.searchDisplay === 'none', { caps: m.capsDisplay, search: m.searchDisplay });
    ok(f + ' · 手机内容贴顶（44px 让位归零）', m.mainTop < 20, m.mainTop);
    ok(f + ' · 手机无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok(f + ' · 手机无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ⑤ 手机 390：计划页输入区不再吸顶（手机上本就 display:contents）==');
  {
    const p = await cm.newPage();
    await p.goto(BASE + '/plans.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const st = await p.evaluate(() => {
      const add = document.querySelector('#ptabToday .pt-add');
      return { disp: add ? getComputedStyle(add).display : '(无)', pos: add ? getComputedStyle(add).position : '(无)' };
    });
    ok('手机端输入区是 display:contents（不参与布局、无吸顶）', st.disp === 'contents', st);
    ok('手机端输入区不是 sticky', st.pos !== 'sticky', st.pos);
    await p.close();
  }

  await b.close();
  console.log('\n===== 第 3 批换顶栏：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})();