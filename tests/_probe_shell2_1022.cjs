/* 探针：全站换顶栏 · 第 2 批（design/116）= 设置 / 会员 / 服药 / 新手 / 素材 五张表单类页面
   验什么：
     ① 桌面 1440：五页真的渲染顶栏、body 无 288px 侧栏留白、内容不被 44px 顶栏压住、无侧栏 DOM 残留、无横向溢出
     ② 顶栏高亮：设置 → 胶囊「更多」里那格；其余四页不在 8 个胶囊/更多清单里 → 全不亮（按 design/116 决策②「只有组页按归属高亮」）
     ③ 吸顶让位：设置页左侧分区导航（桌面 sticky top）必须 ≥ 44px 起跳，不能被顶栏压住；手机横向标签同理
     ④ 软导航跨壳：首页 → 设置（顶栏→顶栏，壳不动）· 设置 → 计划（顶栏→侧栏，换壳）· 计划 → 会员（侧栏→顶栏，换回来）
     ⑤ 手机 390：五页仍是顶栏壳、胶囊与搜索隐藏（导航走底部 dock）、内容不被压住、无横向溢出
   跑法：node tests/_with_server.cjs tests/_probe_shell2_1022.cjs 8952
   线上：BASE=https://yasihub.com node tests/_probe_shell2_1022.cjs */
const { chromium } = require('playwright-core');
const ancSeed = require('./_anc_seed.cjs');   // 10-25 W-UI-1：关掉「未读公告」这个变量
const BASE = process.env.BASE || 'http://127.0.0.1:8952';
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
      onCaps: [], onMore: [], capsDisplay: '?', searchDisplay: '?', scrollW: 0, docW: 0, sideItem: 0, sideHead: 0,
      setNavTop: null, setNavPos: null };
    const nav = document.getElementById('mainNav');
    const main = document.querySelector('main');
    const cs = getComputedStyle(document.body);
    const mr = main ? main.getBoundingClientRect() : null;
    const navR = nav ? nav.getBoundingClientRect() : null;
    const sn = document.querySelector('.set-nav');
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
      sideHead: document.querySelectorAll('.side-head').length,
      setNavTop: sn ? Math.round(sn.getBoundingClientRect().top) : null,
      setNavPos: sn ? getComputedStyle(sn).position : null
    };
  });
}

/* 滚到页面中段再量吸顶条：sticky 只有「滚过它原始位置」后才真的贴顶，
   不滚就量到的是原始位置，那不算验过让位。
   🔴 但设置页在 1440×950 / 390×844 下**整页根本不需要滚动**（内容比视口矮），
   所以这里分两条路：能滚够 → 量真实贴顶位置；滚不够 → 直接读解析后的 top 值。
   只断言 < 120px 那种「必须贴上去」的写法是错的，量到的是还没贴顶的原始位置。 */
async function stickyCheck(p, sel) {
  return p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = document.documentElement;
    const topPx = parseFloat(getComputedStyle(el).top) || 0;
    const startTop = Math.round(el.getBoundingClientRect().top);
    const need = Math.max(0, startTop - topPx);      // 还差多少滚动才会贴顶
    const canScroll = Math.max(0, r.scrollHeight - r.clientHeight);
    return { topPx, startTop, need, canScroll, pos: getComputedStyle(el).position };
  }, sel);
}
async function stickyStuckTop(p, sel, target) {
  await p.evaluate(y => window.scrollTo(0, y), target);
  await p.waitForTimeout(400);
  const v = await p.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().top), sel);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  return v;
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });

  console.log('== ① 桌面 1440：第 2 批五页 ==');
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  await mockRoutes(c);
  /* 高亮口径（design/116 决策②）：只有「组页」按归属高亮；这五张是普通页 → 落到「更多」面板。
     更多清单 = 错句本 / 回顾 / 会员 / 设置 / 服药（服药模块未开不出现）→
     设置页亮「设置」、会员页亮「会员」；服药 / 新手 / 素材三张不在任何清单里 → 全不亮。 */
  const want = {
    'settings.html': { caps: '', more: '设置' },
    'vip.html':      { caps: '', more: '会员' },
    'meds.html':     { caps: '', more: '' },
    'beginner.html': { caps: '', more: '' },
    'materials.html':{ caps: '', more: '' }
  };
  for (const f of Object.keys(want)) {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);
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

  console.log('== ② 设置页分区导航吸顶让位（桌面 1440）==');
  {
    const p = await c.newPage();
    await p.goto(BASE + '/settings.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const s = await stickyCheck(p, '.set-nav');
    ok('设置页分区导航仍是 sticky', s && s.pos === 'sticky', s && s.pos);
    /* 核心判据：吸顶起点必须已经让过 44px 顶栏（安全区另算）→ top ≥ 44 */
    ok('分区导航的吸顶起点让过顶栏（top ≥ 44）', s && s.topPx >= 44, s && s.topPx);
    ok('分区导航的吸顶起点没让太多（top < 100）', s && s.topPx < 100, s && s.topPx);
    if (s && s.canScroll >= s.need + 20) {
      const top = await stickyStuckTop(p, '.set-nav', s.need + 20);
      ok('真滚到底后分区导航贴在自己让位后的位置', top >= 44 && top <= s.topPx + 2, { top, want: s.topPx });
    } else {
      ok('（1440 高下整页不足一屏，按解析值判定即可）滚不够 = 未触发贴顶是正常的', true);
    }
    await p.close();
  }

  console.log('== ③ 软导航跨壳：首页 → 设置 → 计划 → 会员 ==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);

    // 顶栏 → 顶栏（首页 → 设置）
    await p.evaluate(() => softNavigate({ href: 'settings.html', file: 'settings.html', id: 'settings' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(900);
    let m = await measure(p);
    ok('首页 → 设置：壳仍是顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('首页 → 设置：侧栏留白清掉', m.padL === '0px', m.padL);
    ok('首页 → 设置：body 不再带首页驾驶舱类', await p.evaluate(() => !document.body.classList.contains('hub-home')));
    ok('首页 → 设置：高亮移到「设置」', m.onCaps.length === 0 && m.onMore.join('') === '设置', { caps: m.onCaps, more: m.onMore });
    ok('首页 → 设置：分区导航已渲染（内容真到位）', m.setNavPos === 'sticky', m.setNavPos);

    /* 🔴 10-22 全站换顶栏五批全部落地：计划（第 3 批）、背词（第 4 批）、bank（第 5 批）
       都已换成顶栏壳 → 全站再无「侧栏 vs 顶栏」的跨壳活样本。本节从「换壳」验收改成
       「同壳不重建」验收（壳不动、留白不回来、高亮跟着走），跨壳链路由
       _probe_shell3/shell4/shell5 的同壳断言共同覆盖。 */
    // 顶栏 → 顶栏（设置 → 背词页）
    await p.evaluate(() => softNavigate({ href: 'practice.html', file: 'practice.html', id: 'practice' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(700);
    m = await measure(p);
    ok('设置 → 背词页：壳仍是顶栏（第 4 批起背词页也换了壳）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('设置 → 背词页：288px 侧栏留白没回来（仍是 0）', m.padL === '0px', m.padL);
    ok('设置 → 背词页：没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok('设置 → 背词页：高亮 = 单词', m.onCaps.join('') === '单词', m.onCaps);

    // 顶栏 → 顶栏（背词页 → 会员）
    await p.evaluate(() => softNavigate({ href: 'vip.html', file: 'vip.html', id: 'vip' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(900);
    m = await measure(p);
    ok('背词页 → 会员：壳仍是顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('背词页 → 会员：侧栏留白没回来', m.padL === '0px', m.padL);
    ok('背词页 → 会员：内容不被压住', m.mainTop >= 44, m.mainTop);
    ok('同壳来回三次无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ④ 手机 390：第 2 批五页 ==');
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cm.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  /* 🔴 10-25 W-UI-1：测「顶栏 44px 让位归零」前先把未读公告关掉 —— 公告条是 sticky、
     在文档流里真实占 34px，不关掉这条测到的是「被公告顶了一下」，两件事混着判分不清。
     夹具见 tests/_anc_seed.cjs。 */
  await mockRoutes(cm);
  await ancSeed.seedAncRead(cm, BASE);
  for (const f of Object.keys(want)) {
    const p = await cm.newPage();
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    await ancSeed.waitAncGone(p);
    const m = await measure(p);
    /* measure().shell 是 nav.className（不是 computed display）→ 这里查「壳还在、但让位归零」
       （顶栏本体由 css/common.css 的 ≤860 规则隐藏，shell_1022 另有 navH 佐证） */
    ok(f + ' · 手机端顶栏让位归零（10-23 全站口径）', m.shell === 'hub-topbar' && m.padT === '0px', m.shell + '/' + m.padT);
    ok(f + ' · 手机隐藏胶囊与搜索（导航走 dock）', m.capsDisplay === 'none' && m.searchDisplay === 'none', { caps: m.capsDisplay, search: m.searchDisplay });
    ok(f + ' · 手机内容贴顶（44px 让位归零）', m.mainTop < 20, m.mainTop);
    ok(f + ' · 手机无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    await p.close();
  }

  console.log('== ⑤ 手机 390：设置页横向标签让位 ==');
  {
    const p = await cm.newPage();
    await p.goto(BASE + '/settings.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const s = await stickyCheck(p, '.set-nav');
    ok('手机分区标签仍是 sticky', s && s.pos === 'sticky', s && s.pos);
    ok('手机分区标签的吸顶起点让过顶栏（top ≥ 44）', s && s.topPx >= 44, s && s.topPx);
    if (s && s.canScroll >= s.need + 20) {
      const top = await stickyStuckTop(p, '.set-nav', s.need + 20);
      ok('手机真滚到底后标签贴在自己让位后的位置', top >= 44 && top <= s.topPx + 2, { top, want: s.topPx });
    } else {
      ok('（390×844 下整页不足一屏，按解析值判定即可）滚不够 = 未触发贴顶是正常的', true);
    }
    await p.close();
  }

  await b.close();
  console.log('\n===== 第 2 批换顶栏：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})();
