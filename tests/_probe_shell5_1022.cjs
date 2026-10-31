/* 探针：全站换顶栏 · 第 5 批（design/116）= 模考 bank.html（全站最后一批）
   验什么：
     ① 桌面 1440：bank 页真的渲染顶栏壳、body 无 288px 侧栏留白、内容不被 44px 顶栏压住、
        无侧栏 DOM 残留、无横向溢出、无 JS 报错、胶囊高亮 = 模考（bank 在 PRIMARY_NAV 里）
     ② 阅读沉浸态：#examRoot（position:fixed;inset:0;z-index:900）铺满视口 → 天然盖住顶栏（z-index 50）；
        量顶栏下沿 < 沉浸层上沿（= 沉浸层在上面）+ 沉浸层自身矩形等于视口
     ③ 听力沉浸态：同一套 #examRoot，只换数据源；同 ② 口径
     ④ 写作机考全屏：body.exam-fullscreen + #examPanel 变固定覆盖层 → 同样盖住顶栏、铺满视口
     ⑤ 手机 390：仍是顶栏壳、胶囊与搜索隐藏（导航走底部 dock）、内容不被压住
     ⑥ 软导航跨壳：口语（顶栏）→ bank（换壳后仍是顶栏，壳不重建）· bank → 学习组（顶栏→顶栏）
   跑法：NODE_PATH=C:\Users\Camille\.workbuddy\binaries\node\workspace\node_modules node tests/_with_server.cjs tests/_probe_shell5_1022.cjs 8961
   线上：BASE=https://yasihub.com node tests/_probe_shell5_1022.cjs
   ⚠️ 沉浸态一律用**产品自己的入口**驱动，不手改类名：阅读点 #fullEntry [data-fullstart]（=「Start Test」按钮）、
      听力点 #listenFullEntry [data-lfullstart]；写作机考点 #writingFullEntry 里 writing.js 渲染的入口卡
      （bank 页 #examPanel 与 writing.html 共用同一份 ensureExamShell 源码）。
   ⚠️ 无障碍 guide 浮层：首次进考场会弹 showExamGuide（localStorage GUIDE_KEY 未标记）→ 探针预先写标记，
      免得浮层挡住按钮（走的是产品自己的 gate 存储，不算手改状态）。
   ⚠️ bank 题库取自本地静态数据（bank/manifest.json + bank/<channel>/<id>.json + bank/answers/<id>.json），
      探针只拦 /api，题库 fetch 照常放行。 */
const { chromium } = require('playwright-core');
const ancSeed = require('./_anc_seed.cjs');   // 10-25 W-UI-1：关掉「未读公告」这个变量
const BASE = process.env.BASE || 'http://127.0.0.1:8961';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const TOKEN = 'a'.repeat(32);

/* bank 页启动时打接口（账号/角色/同步探活）。拦掉：不碰线上 KV，也不让真接口把页面卡住。 */
function mockRoutes(ctx) {
  return ctx.route(/\/api\/(roles|sync|admin|ai|auth|feedback|explain)/, r => {
    const u = new URL(r.request().url());
    if (u.pathname.indexOf('/api/roles') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acct: 't@x.com', role: 'teacher' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
  });
}

/* 壳 + 顶栏 + 留白 + 高亮，一次量全。 */
async function shellState(p) {
  return p.evaluate(() => {
    const nav = document.getElementById('mainNav');
    const tb = document.querySelector('.hub-topbar');
    const main = document.querySelector('main');
    const cs = getComputedStyle(document.body);
    const mr = main ? main.getBoundingClientRect() : null;
    const nr = nav ? nav.getBoundingClientRect() : null;
    const tr = tb ? tb.getBoundingClientRect() : null;
    return {
      shell: nav ? nav.className : '(无 nav)',
      attr: document.body.getAttribute('data-shell'),
      padL: cs.paddingLeft, padT: cs.paddingTop,
      navH: nr ? Math.round(nr.height) : null,
      mainTop: mr ? Math.round(mr.top) : null,
      tbDisplay: tb ? getComputedStyle(tb).display : '(无)',
      tbBottom: tr ? Math.round(tr.bottom) : null,
      tbH: tr ? Math.round(tr.height) : null,
      onCaps: [...document.querySelectorAll('.tb-item.on')].map(a => (a.textContent || '').trim()),
      onMore: [...document.querySelectorAll('.tb-more-item.on')].map(a => (a.textContent || '').trim()),
      capsDisplay: (() => { const c = document.querySelector('.tb-caps'); return c ? getComputedStyle(c).display : '(无)'; })(),
      searchDisplay: (() => { const s = document.querySelector('.tb-search'); return s ? getComputedStyle(s).display : '(无)'; })(),
      scrollW: document.documentElement.scrollWidth,
      docW: document.documentElement.clientWidth,
      sideItem: document.querySelectorAll('.side-item').length,
      sideHead: document.querySelectorAll('.side-head').length,
      winH: window.innerHeight
    };
  });
}

/* 沉浸层 vs 顶栏的层叠关系：沉浸层上沿/下沿、自身矩形、计算 z-index。 */
async function overlayVsBar(p, sel) {
  return p.evaluate(s => {
    const el = document.querySelector(s);
    const tb = document.querySelector('.hub-topbar');
    if (!el) return null;
    const er = el.getBoundingClientRect();
    const tr = tb ? tb.getBoundingClientRect() : null;
    const cs = getComputedStyle(el);
    return {
      pos: cs.position, z: cs.zIndex,
      hidden: el.hasAttribute('hidden'),
      elTop: Math.round(er.top), elBottom: Math.round(er.bottom),
      elW: Math.round(er.width), elH: Math.round(er.height),
      tbBottom: tr ? Math.round(tr.bottom) : null,
      tbDisplay: tb ? getComputedStyle(tb).display : '(无)',
      winH: window.innerHeight, winW: window.innerWidth,
      scrollW: document.documentElement.scrollWidth,
      docW: document.documentElement.clientWidth
    };
  }, sel);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });

  console.log('== ① 桌面 1440：bank 页 ==');
  {
    const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
    await mockRoutes(c);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    const m = await shellState(p);
    ok('bank · 渲染顶栏壳', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('bank · 侧栏留白已退（padding-left 0）', m.padL === '0px', m.padL);
    ok('bank · 内容不被顶栏压住（main.top ≥ 44）', m.mainTop >= 44, { mainTop: m.mainTop, navH: m.navH });
    ok('bank · 没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok('bank · 胶囊高亮 = 机经', m.onCaps.join('|') === '机经', m.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）
    ok('bank · 更多面板不亮', m.onMore.length === 0, m.onMore);
    ok('bank · 桌面无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok('bank · 无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  console.log('== ② 阅读沉浸态：点「Start Test」→ #examRoot 盖住顶栏 ==');
  {
    const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); localStorage.setItem('hub_exam_guide_v2_reading', '1'); } catch (e) {} }, TOKEN);
    await mockRoutes(c);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    /* 等 manifest 到位、按钮解 disabled，再点（超时就如实记失败，不静默跳过） */
    const btn = p.locator('#fullEntry [data-fullstart]');
    let clicked = false;
    try {
      await btn.waitFor({ state: 'visible', timeout: 12000 });
      await p.waitForFunction(() => { const b = document.querySelector('#fullEntry [data-fullstart]'); return b && !b.disabled; }, null, { timeout: 12000 });
      await btn.click({ timeout: 8000 });
      clicked = true;
    } catch (e) { clicked = 'ERR:' + String(e).slice(0, 120); }
    await p.waitForTimeout(2500);
    ok('阅读 · Start Test 点中了（manifest 已就绪）', clicked === true, clicked);
    const o = await overlayVsBar(p, '#examRoot');
    ok('阅读 · #examRoot 存在且未 hidden', !!o && !o.hidden, o && { hidden: o.hidden, pos: o.pos });
    if (o) {
      ok('阅读 · 沉浸层铺满视口（fixed + inset:0）', o.pos === 'fixed' && o.elTop <= 1 && o.elH >= o.winH - 1, { pos: o.pos, top: o.elTop, h: o.elH, winH: o.winH });
      ok('阅读 · 沉浸层在顶栏上面（z ≥ 900 > 50）', Number(o.z) >= 900, o.z);
      ok('阅读 · 沉浸层上沿不高于顶栏下沿（盖住顶栏）', o.tbBottom === null || o.elTop <= o.tbBottom, { elTop: o.elTop, tbBottom: o.tbBottom });
      ok('阅读 · 沉浸态无横向溢出', o.scrollW <= o.docW + 1, { sw: o.scrollW, dw: o.docW });
    }
    ok('阅读 · 进出沉浸无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  console.log('== ③ 听力沉浸态：切到听力 tab 点「Start Test」→ #examRoot 盖住顶栏 ==');
  {
    const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); localStorage.setItem('hub_exam_guide_v2_listening', '1'); } catch (e) {} }, TOKEN);
    await mockRoutes(c);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    /* 产品入口：四小 tab 里的「听力」（bank.html:1469 data-mtab="listening"） */
    await p.evaluate(() => {
      const t = document.querySelector('#mockTabs [data-mtab="listening"]');
      if (t) t.click();
    });
    await p.waitForTimeout(1200);
    const btn = p.locator('#listenFullEntry [data-lfullstart]');
    let clicked = false;
    try {
      await btn.waitFor({ state: 'visible', timeout: 12000 });
      await p.waitForFunction(() => { const b = document.querySelector('#listenFullEntry [data-lfullstart]'); return b && !b.disabled; }, null, { timeout: 12000 });
      await btn.click({ timeout: 8000 });
      clicked = true;
    } catch (e) { clicked = 'ERR:' + String(e).slice(0, 120); }
    await p.waitForTimeout(2500);
    ok('听力 · Start Test 点中了', clicked === true, clicked);
    const o = await overlayVsBar(p, '#examRoot');
    ok('听力 · #examRoot 存在且未 hidden', !!o && !o.hidden, o && { hidden: o.hidden, pos: o.pos });
    if (o) {
      ok('听力 · 沉浸层铺满视口（fixed + inset:0）', o.pos === 'fixed' && o.elTop <= 1 && o.elH >= o.winH - 1, { pos: o.pos, top: o.elTop, h: o.elH, winH: o.winH });
      ok('听力 · 沉浸层在顶栏上面（z ≥ 900）', Number(o.z) >= 900, o.z);
      ok('听力 · 沉浸层盖住顶栏', o.tbBottom === null || o.elTop <= o.tbBottom, { elTop: o.elTop, tbBottom: o.tbBottom });
      ok('听力 · 沉浸态无横向溢出', o.scrollW <= o.docW + 1, { sw: o.scrollW, dw: o.docW });
    }
    ok('听力 · 进出沉浸无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  console.log('== ④ 写作机考全屏：body.exam-fullscreen + #examPanel 盖住顶栏 ==');
  {
    const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
    await mockRoutes(c);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    /* 切到写作 tab（bank.html:1471 data-mtab="writing"），等 writing.js 把入口卡渲染进
       #writingFullEntry（writing.js / writing_prompts.js 走 data-late-src 懒加载 → 多等一会） */
    await p.evaluate(() => {
      const t = document.querySelector('#mockTabs [data-mtab="writing"]');
      if (t) t.click();
    });
    await p.waitForTimeout(2600);
    const entryBtn = p.locator('#wrtFullStart');
    let clicked = false;
    try {
      await entryBtn.waitFor({ state: 'visible', timeout: 12000 });
      await entryBtn.click({ timeout: 8000 });
      clicked = true;
    } catch (e) { clicked = 'ERR:' + String(e).slice(0, 120); }
    await p.waitForTimeout(2200);
    const fs = await p.evaluate(() => ({
      cls: document.body.className,
      on: document.body.classList.contains('exam-fullscreen')
    }));
    ok('写作 · 入口卡点中了', clicked === true, clicked);
    ok('写作 · body 加上 exam-fullscreen', fs.on === true, fs.cls);
    const o = await overlayVsBar(p, '#examPanel');
    if (o) {
      ok('写作 · #examPanel 变固定覆盖层（fixed + inset:0）', o.pos === 'fixed' && !o.hidden && o.elTop <= 1 && o.elH >= o.winH - 1, { pos: o.pos, hidden: o.hidden, top: o.elTop, h: o.elH, winH: o.winH });
      ok('写作 · 覆盖层在顶栏上面（z ≥ 900）', Number(o.z) >= 900, o.z);
      ok('写作 · 覆盖层盖住顶栏', o.tbBottom === null || o.elTop <= o.tbBottom, { elTop: o.elTop, tbBottom: o.tbBottom });
      ok('写作 · 四小 tab 被收起（#mockTabs display:none）', await p.evaluate(() => { const t = document.getElementById('mockTabs'); return t ? getComputedStyle(t).display : '(无)'; }) === 'none', await p.evaluate(() => { const t = document.getElementById('mockTabs'); return t ? getComputedStyle(t).display : '(无)'; }));
      ok('写作 · 全屏态无横向溢出', o.scrollW <= o.docW + 1, { sw: o.scrollW, dw: o.docW });
    } else {
      ok('写作 · #examPanel 存在', false, null);
    }
    /* 退出：产品自己的 Exit（writing.js exitExam，会摘 class + 解锁） */
    const exitBtn = p.locator('#examExit, #examPanel .ex-exit, #examPanel button').filter({ hasText: /Exit/i }).first();
    try { await exitBtn.click({ timeout: 6000 }); } catch (e) {}
    await p.waitForTimeout(1200);
    const after = await p.evaluate(() => ({
      on: document.body.classList.contains('exam-fullscreen'),
      tb: (() => { const t = document.querySelector('.hub-topbar'); return t ? getComputedStyle(t).display : '(无)'; })()
    }));
    ok('写作 · 退出机考：exam-fullscreen 摘掉', after.on === false, after.on);
    ok('写作 · 退出机考：顶栏壳回来', after.tb !== 'none', after.tb);
    ok('写作 · 进出全屏无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  console.log('== ⑤ 手机 390：bank 页 ==');
  {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
    /* 🔴 10-25 W-UI-1：测「顶栏 44px 让位归零」前先把未读公告关掉 —— 公告条是 sticky、
       在文档流里真实占 34px，不关掉这条测到的是「被公告顶了一下」，两件事混着判分不清。
       夹具见 tests/_anc_seed.cjs。 */
    await mockRoutes(c);
    await ancSeed.seedAncRead(c, BASE);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/bank.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    await ancSeed.waitAncGone(p);
    const m = await shellState(p);
    ok('手机 · 渲染顶栏壳', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('手机 · 侧栏留白已退（padding-left 0）', m.padL === '0px', m.padL);
    /* 10-23 全站口径：手机端整条顶栏不渲染 → 44px 让位归零，main.top 应贴顶 */
    ok('手机 · 内容贴顶（顶栏不渲染，main.top < 20）', m.mainTop < 20, { mainTop: m.mainTop });
    ok('手机 · 胶囊隐藏（导航走底部 dock）', m.capsDisplay === 'none', m.capsDisplay);
    ok('手机 · 搜索隐藏', m.searchDisplay === 'none', m.searchDisplay);
    ok('手机 · 无侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok('手机 · 无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok('手机 · 无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  console.log('== ⑥ 软导航跨壳：口语（顶栏）→ bank（换壳后仍是顶栏）→ 学习组 ==');
  {
    const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
    await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
    await mockRoutes(c);
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    let m = await shellState(p);
    ok('起点口语：壳 = 顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);

    await p.evaluate(() => softNavigate({ href: 'bank.html', file: 'bank.html', id: 'bank' }));
    await p.waitForTimeout(1500);
    m = await shellState(p);
    ok('口语 → bank：壳仍是顶栏（不重建）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('口语 → bank：侧栏留白没回来（padding-left 0）', m.padL === '0px', m.padL);
    ok('口语 → bank：高亮 = 机经', m.onCaps.join('|') === '机经', m.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）

    await p.evaluate(() => softNavigate({ href: 'study.html', file: 'study.html', id: 'study' }));
    await p.waitForTimeout(1500);
    m = await shellState(p);
    ok('bank → 学习组：壳仍是顶栏', m.shell === 'hub-topbar' && m.padL === '0px', m.shell + '/' + m.padL);
    ok('跨壳三次无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
    await c.close();
  }

  await b.close();
  console.log('\n===== 第 5 批换顶栏：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩了：', e); process.exit(2); });
