/* 探针：全站换顶栏 · 第 0+1 批（design/116）
   验什么：
     ① 五个「已换壳」页面（home / me / study / plans-hub / teacher）真的渲染顶栏、body 不再有 288px 侧栏留白、
        内容不被 44px 顶栏压住、顶栏高亮按归属正确
     ② 手机 390：胶囊与搜索框隐藏（导航走底部 dock）、body 顶部留白 44、无横向溢出
     ③ 软导航跨壳：顶栏→顶栏（壳不动、高亮跟着走）· 顶栏→侧栏（同一张页面换成侧栏壳）· 侧栏→顶栏（换回来）
     ④ 浮层让位：离线条 / 新版本条在顶栏壳下不再贴顶 10px（会被顶栏压住）
   跑法：node tests/_with_server.cjs tests/_probe_shell_1022.cjs 8950
   线上：BASE=https://yasihub.com node tests/_probe_shell_1022.cjs */
const { chromium } = require('playwright-core');
const ancSeed = require('./_anc_seed.cjs');   // 10-25 W-UI-1：关掉「未读公告」这个变量
const BASE = process.env.BASE || 'http://127.0.0.1:8950';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const TOKEN = 'a'.repeat(32);

function mockRoutes(ctx) {
  return ctx.route(/\/api\/(roles|sync|admin|ai|auth)/, r => {
    const u = new URL(r.request().url());
    if (u.pathname.indexOf('/api/roles') >= 0) {
      const a = u.searchParams.get('action'), v = u.searchParams.get('view');
      if (a === 'me') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acct: 't@x.com', role: 'teacher' }) });
      if (a === 'students') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, students: [{ email: 'a@b.com', lastActive: Date.now() }] }) });
      if (v) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, student: { email: v, nickname: '甲' }, scores: { mock: [], manual: [], writing: [] }, time: { totalMinutes: 0, weekMinutes: 0, byModule: [] }, vocab: { total: 0, cleared: 0, dueToday: 0, levels: [] }, submissions: [] }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
  });
}

async function measure(p) {
  await p.waitForFunction(() => !!document.body && !!document.querySelector('main'), null, { timeout: 60000 }).catch(() => {});
  return p.evaluate(() => {
    /* 线上慢网时软导航可能回退成整页跳转 → body 会短暂为 null，这里给一份「未就绪」安全值，
       别让量测函数自己把探针打死（判定交给具体断言）。 */
    if(!document.body) return { shell:'(未就绪)', attr:null, padL:'?', padT:'?', navH:null, mainTop:null,
      onCaps:[], onMore:[], capsDisplay:'?', searchDisplay:'?', scrollW:0, docW:0, sideItem:0, sideHead:0 };
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

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });

  console.log('== ① 桌面 1440：已换壳页面 ==');
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  await mockRoutes(c);
  /* 🔴 10-22 第 1 小步起：me / study / plans-hub 三张是**只服务手机的中间层目录页**，
     桌面宽度会被送到真实页面（各自 body 里的首屏跳转脚本），所以不再进这个列表；
     它们的行为由 tests/_probe_deskredir_1022.cjs 与下面 ①b 专门盯。 */
  const want = {
    'home.html': { caps: '首页', more: '' },
    'teacher.html': { caps: '', more: '学生数据' }
  };
  for (const f of Object.keys(want)) {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
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

  console.log('== ①b 桌面 1440：手机目录页必须被送走 ==');
  const REDIR = [['study.html', 'practice'], ['plans-hub.html', 'plans'], ['me.html', 'settings']];
  for (const [from, to] of REDIR) {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(BASE + '/' + from, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(t => location.pathname.replace(/\.html$/, '').replace(/^\//, '') === t, to, { timeout: 12000 }).catch(() => {});
    const landed = await p.evaluate(() => location.pathname.replace(/\.html$/, '').replace(/^\//, ''));
    ok(from + ' · 桌面被送到 ' + to, landed === to, '实际停在 ' + landed);
    ok(from + ' · 跳转过程无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ② 手机 390 ==');
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cm.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  /* 🔴 10-25 W-UI-1：测「顶栏让位归零」前先把未读公告关掉 —— 公告条是 sticky、在文档流里
     真实占 34px，不关掉这条测到的是「被公告顶了一下」，两件事混着判永远分不清。
     公告条自己的手机判据放在 ②b（它是通知不是导航，读完即消失，不该计入顶栏让位）。
     夹具见 tests/_anc_seed.cjs。 */
  await mockRoutes(cm);
  await ancSeed.seedAncRead(cm, BASE);
  for (const f of ['home.html', 'me.html', 'study.html', 'teacher.html']) {
    const p = await cm.newPage();
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    /* 公告条是异步挂的（先按缓存同步一次，再拉 json）—— 断言前必须确认它已收干净，
       否则刚清掉的未读被 ancEnsure 又画回来，测到的仍是「被顶 34px」的旧形态。 */
    await ancSeed.waitAncGone(p);
    const m = await measure(p);
    /* measure().shell 是 nav.className（不是 computed display）→ 这里查「壳还在、但让位归零」
       （顶栏本体由 css/common.css 的 ≤860 规则隐藏，shell_1022 另有 navH 佐证） */
    ok(f + ' · 手机端顶栏让位归零（10-23 全站口径）', m.shell === 'hub-topbar' && m.padT === '0px', m.shell + '/' + m.padT);
    ok(f + ' · 手机隐藏胶囊与搜索（导航走 dock）', m.capsDisplay === 'none' && m.searchDisplay === 'none', { caps: m.capsDisplay, search: m.searchDisplay });
    ok(f + ' · 手机内容贴顶（44px 让位归零 · 无公告态）', m.mainTop < 20, m.mainTop);
    ok(f + ' · 手机无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    await p.close();
  }

  console.log('== ②b 手机 390 · 有未读公告时（W-UI-1 10-25）==');
  /* 手机端顶栏整条不渲染（10-23 她的口径），公告条因此**贴最顶**（top≈0）而不是顶栏之下；
     它把内容推下 34px 是 banner 的正常行为（iOS/Android 通知条同款），不是顶栏占位回归。
     ⚠️ 判据要点：条自己必须在 0 位、内容让位**恰好 34px**（多一分说明顶栏的 44px 又回来了）。 */
  {
    /* ⚠️ 必须**另起一个干净的 context**：上面 cm 的 addInitScript 每次导航都会重跑
       （Playwright 就是这个行为，HANDOFF 有记录），在里面 removeItem + reload 等于
       刚清掉又被播种写回去 → 条永远测不到。这里不要播种，直接首访即未读。 */
    const cu = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mockRoutes(cu);
    const p = await cu.newPage();
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#hubAncBar', { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => {
      const bar = document.getElementById('hubAncBar');
      const main = document.querySelector('main.container');
      return {
        hasBar: !!bar,
        barTop: bar ? Math.round(bar.getBoundingClientRect().top) : -99,
        barH: bar ? Math.round(bar.getBoundingClientRect().height) : -99,
        mainTop: main ? Math.round(main.getBoundingClientRect().top) : -99,
        navDisplay: getComputedStyle(document.querySelector('.hub-topbar')).display
      };
    });
    ok('手机有未读时公告条出现', r.hasBar, r);
    ok('手机顶栏仍是隐藏（10-23 口径没被破坏）', r.navDisplay === 'none', r.navDisplay);
    ok('公告条贴最顶（top≈0）', Math.abs(r.barTop) < 3, r.barTop);
    ok('条高 34px', Math.abs(r.barH - 34) < 2, r.barH);
    ok('内容让位恰好 34px（不是 44+34，顶栏没占回来）', Math.abs(r.mainTop - r.barH) < 12, { mainTop: r.mainTop, barH: r.barH });
    await p.close();
    await cu.close();
  }

  console.log('== ③ 软导航跨壳 ==');
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1300);

  /* 🔴 10-22 第 1 小步：原来这一腿点的是 me.html（手机目录页）。桌面已无任何入口链到它，
     软导航过去等于测死代码；换成 teacher.html —— 这是桌面上真实存在的「顶栏 → 顶栏」一跳。 */
  // 顶栏 → 顶栏（首页 → 学生数据）：壳不动，高亮跟着走
  await p.evaluate(() => softNavigate({ href: 'teacher.html', file: 'teacher.html', id: 'teacher' }));
  await p.waitForFunction(() => !document.body.classList.contains('hub-home'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(700);
  let m = await measure(p);
  ok('首页 → 学生数据：壳仍是顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell);
  ok('首页 → 学生数据：高亮从「首页」移到「学生数据」', m.onCaps.length === 0 && m.onMore.join('') === '学生数据', { caps: m.onCaps, more: m.onMore });
  ok('首页 → 学生数据：body 不再带首页驾驶舱类', await p.evaluate(() => !document.body.classList.contains('hub-home')));

  // 顶栏 → 顶栏（学生数据 → 模考）。10-22 第 5 批更新：模考 bank 也换成顶栏壳了
  // → 全站再无「侧栏 vs 顶栏」活样本，本节从「换壳」改成「同壳不重建」。
  await p.evaluate(() => softNavigate({ href: 'bank.html', file: 'bank.html', id: 'bank' }));
  await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
  m = await measure(p);
  ok('学生数据 → 模考：壳仍是顶栏（第 5 批起 bank 也换了壳）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
  ok('学生数据 → 模考：288px 侧栏留白没回来（仍是 0）', m.padL === '0px', m.padL);
  ok('学生数据 → 模考：没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
  ok('学生数据 → 练习：高亮 = 机经', m.onCaps.join('') === '机经', m.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）

  // 侧栏 → 顶栏（模考 → 首页）
  await p.evaluate(() => softNavigate({ href: 'home.html', file: 'home.html', id: 'index' }));
  await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(700);
  m = await measure(p);
  ok('模考 → 首页：壳切回顶栏', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
  ok('模考 → 首页：侧栏留白清掉', m.padL === '0px', m.padL);
  ok('模考 → 首页：高亮回到「首页」', m.onCaps.join('') === '首页', m.onCaps);
  ok('跨壳来回四次无 JS 报错', errs.length === 0, errs[0]);

  console.log('== ④ 浮层让位 ==');
  const off = await p.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'offline-bar'; d.style.display = 'block';
    document.body.appendChild(d);
    const top = getComputedStyle(d).top;
    document.body.removeChild(d);
    return top;
  });
  ok('离线条在顶栏下让出 44px', off !== '10px' && /^(54|calc)/.test(String(off)), off);

  console.log('== ⑤ 组页提示文案不再提侧栏 ==');
  /* 🔴 10-22：组页在桌面会被送走，这一腿必须在**手机上下文**里跑，否则拿到的是 practice.html。 */
  const p5 = await cm.newPage();
  await p5.goto(BASE + '/study.html', { waitUntil: 'domcontentloaded' });
  await p5.waitForSelector('.hubg-note', { timeout: 12000 }).catch(() => {});
  const note = await p5.evaluate(() => {
    const el = document.querySelector('.hubg-note');
    return el ? el.textContent.trim() : '(没有提示条)';
  });
  /* 10-23：T-011（098fd1d）做组页版式统一时把这句提示条整块摘掉了（CSS 规则留在 common.css 当死代码）
     → 断言改成「提示条已下线」，不再要求出现导航口径文案。 */
  ok('组页底部那句提示条已下线（T-011 版式统一时摘掉）', note === '(没有提示条)' || note.indexOf('左侧栏') < 0, note);
  await p5.close();

  await b.close();
  console.log('\n结果：' + pass + '/' + (pass + fail) + ' 通过' + (fail ? '，' + fail + ' 失败' : ''));
  process.exit(fail ? 1 : 0);
})();
