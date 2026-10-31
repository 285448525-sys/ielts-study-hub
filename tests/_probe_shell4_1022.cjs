/* 探针：全站换顶栏 · 第 4 批（design/116）= 单词练习 / 口语 / 写作 三张交互最重的页面
   验什么：
     ① 桌面 1440：三页真的渲染顶栏壳、body 无 288px 侧栏留白、内容不被 44px 顶栏压住、无侧栏 DOM 残留、无横向溢出
     ② 单词页全屏沉浸背词（body.word-fullscreen）：进全屏时顶栏壳收掉、body 的 44px 让位撤掉；退出后两样都回来
     ③ 口语页：陪练 tab 的吸顶段（#coachTop）实测停在顶栏下面；模考沉浸（body.mock-immerse）顶栏收掉、
        考场底栏不被挤出视口、退出模考（#mockExitBtn → 清除记录退出）后壳恢复
     ④ 写作页：模板列表表头（#tplList .tl-row.th）吸顶实测；机考全屏（body.exam-fullscreen）顶栏收掉、
        main.container 高度回到一屏、机考底栏（Exit）不被挤出视口、Exit 后壳恢复
     ⑤ 手机 390：三页仍是顶栏壳、胶囊与搜索隐藏（导航走底部 dock）、内容不被压住、沉浸态同样收顶栏
     ⑥ 软导航跨壳：首页 → 单词（顶栏→顶栏，壳不动）· 单词 → 计划 → 模考 bank（顶栏→侧栏，换壳）· bank → 口语（侧栏→顶栏）
   跑法：NODE_PATH=C:\\Users\\Camille\\.workbuddy\\binaries\\node\\workspace\\node_modules node tests/_with_server.cjs tests/_probe_shell4_1022.cjs 8954
   线上：BASE=https://yasihub.com node tests/_probe_shell4_1022.cjs
   ⚠️ 线上跑本支大概率 goto 慢网超时（见 HANDOFF 踩点）—— 是网络不是回归，不是本批引入的。
   ⚠️ 沉浸态一律用**产品自己的入口**驱动，不手改类名：单词 setWordFullscreen(true)（= 页面 ⛶ 按钮点的那一个）、
      口语 window.__mockEnter()（=「模考」tab 点的那一个）、写作点 #scoreTopicSave（= 评分 tab「保存题目，开始练」）。
      模考题库取自 data.js 静态数据（探针只拦 /api，静态题库照常可用）。
   ⚠️ 口语 / 写作两页的原生内容不一定滚得动（滚不动就量不到吸顶）→ 探针临时往 main 末尾塞一个撑高块来造滚动，
      那是探针自用件（id=__probeSpacer），量完立刻删，不进产品。 */
const { chromium } = require('playwright-core');
const ancSeed = require('./_anc_seed.cjs');   // 10-25 W-UI-1：关掉「未读公告」这个变量
const BASE = process.env.BASE || 'http://127.0.0.1:8954';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const TOKEN = 'a'.repeat(32);

/* 三页都会在启动时打接口（账号/角色/同步探活）。全部拦掉：不碰线上 KV，也不让真接口把页面卡住。 */
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
      canScroll: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
      winH: window.innerHeight
    };
  });
}

/* 吸顶只读：看元素是不是 sticky、它自己声明的 top 是多少。 */
async function stickyTop(p, sel) {
  return p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { pos: cs.position, topPx: parseFloat(cs.top), display: cs.display };
  }, sel);
}

/* 造滚动：往 main 末尾塞撑高块（探针自用，量完删）。 */
async function addSpacer(p, px) {
  return p.evaluate(n => {
    const d = document.createElement('div');
    d.id = '__probeSpacer'; d.style.height = n + 'px';
    (document.querySelector('main') || document.body).appendChild(d);
    return Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  }, px);
}
async function delSpacer(p) {
  return p.evaluate(() => { const s = document.getElementById('__probeSpacer'); if (s) s.remove(); });
}

/* 滚到底后，量某个元素的上/下沿与顶栏下沿的关系。 */
async function stickyAtBottom(p, sel) {
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(500);
  return p.evaluate(s => {
    const el = document.querySelector(s);
    const tb = document.querySelector('.hub-topbar');
    const er = el ? el.getBoundingClientRect() : null;
    const tr = tb ? tb.getBoundingClientRect() : null;
    return {
      scrollY: Math.round(window.scrollY),
      elTop: er ? Math.round(er.top) : null,
      elBottom: er ? Math.round(er.bottom) : null,
      elH: er ? Math.round(er.height) : null,
      tbBottom: tr ? Math.round(tr.bottom) : null,
      tbDisplay: tb ? getComputedStyle(tb).display : '(无)',
      winH: window.innerHeight
    };
  }, sel);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--proxy-server=direct://'] });

  console.log('== ① 桌面 1440：第 4 批三页 ==');
  const c = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await c.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  await mockRoutes(c);
  /* 高亮口径（design/116 决策②）：单词 / 口语 / 写作三页在 8 个胶囊里 → 亮胶囊、更多面板不亮 */
  const want = {
    'practice.html': { caps: '单词' },
    'speaking.html': { caps: '口语' },
    'writing.html':  { caps: '写作' }
  };
  for (const f of Object.keys(want)) {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    const m = await shellState(p);
    ok(f + ' · 渲染顶栏壳', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok(f + ' · 侧栏留白已退（padding-left 0）', m.padL === '0px', m.padL);
    ok(f + ' · 内容不被顶栏压住（main.top ≥ 44）', m.mainTop >= 44, { mainTop: m.mainTop, navH: m.navH });
    ok(f + ' · 没有侧栏 DOM 残留', m.sideItem === 0 && m.sideHead === 0, { items: m.sideItem, head: m.sideHead });
    ok(f + ' · 胶囊高亮 = ' + want[f].caps, m.onCaps.join('|') === want[f].caps, m.onCaps);
    ok(f + ' · 更多面板不亮', m.onMore.length === 0, m.onMore);
    ok(f + ' · 桌面无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok(f + ' · 无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ② 单词页：全屏沉浸背词（setWordFullscreen = ⛶ 按钮点的那个函数）==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    const entered = await p.evaluate(() => { try { setWordFullscreen(true); return document.body.classList.contains('word-fullscreen'); } catch (e) { return 'ERR:' + e.message; } });
    await p.waitForTimeout(700);
    let m = await shellState(p);
    ok('进入全屏背词（body.word-fullscreen）', entered === true, entered);
    ok('全屏态：顶栏壳收掉', m.tbDisplay === 'none', m.tbDisplay);
    ok('全屏态：44px 让位撤掉（padding-top 归 0）', m.padT === '0px', m.padT);
    ok('全屏态：内容上沿回到 44 以下（没有空一条）', m.mainTop === null || m.mainTop < 44, m.mainTop);
    ok('全屏态：无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    /* 退出：同一个入口再点一次 */
    await p.evaluate(() => { try { setWordFullscreen(false); } catch (e) {} });
    await p.waitForTimeout(700);
    m = await shellState(p);
    ok('退出全屏：顶栏壳回来', m.tbDisplay !== 'none' && m.tbH >= 44, { disp: m.tbDisplay, h: m.tbH });
    ok('退出全屏：让位跟着回来（padding-top 44px）', m.padT === '44px', m.padT);
    ok('退出全屏：内容重新让过顶栏（main.top ≥ 44）', m.mainTop >= 44, m.mainTop);
    ok('进出全屏无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ③ 口语页 A：陪练 tab 在顶栏壳下的布局 ==');
  {
    /* 10-22 实测更正：陪练 tab 的 #coachTop / #coachBar 是文档流里的静态块（不是吸顶、也不是固定底栏
       —— 10/3 B 版双栏工作台改版后它们跟着 #coachWrap 走，left/right 对静态元素不生效）。
       所以这里不再验「吸顶停没停在顶栏下面」，只验换壳后内容列没被顶栏压住、底栏跟内容列对齐。 */
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    /* 2-1d 批 B：桌面上 #tabs 已 display:none（小 tab 撤了）→ Playwright click 要求可见会超时。
       意图不变：切到陪练分栏。改 JS click（handler 照常触发，分栏切换与可见性无关）。 */
    await p.evaluate(() => { const b = document.querySelector('#tabs button[data-type="PRACTICE"]'); if (b) b.click(); });
    await p.waitForFunction(() => { const w = document.querySelector('#coachWrap'); return w && w.getBoundingClientRect().height > 50; }, null, { timeout: 12000 }).catch(() => {});
    await p.waitForTimeout(400);
    const m0 = await shellState(p);
    const cv = await p.evaluate(() => {
      const wrap = document.querySelector('#coachWrap');
      const bar = document.querySelector('#coachBar');
      const wr = wrap ? wrap.getBoundingClientRect() : null;
      const br = bar ? bar.getBoundingClientRect() : null;
      const bs = bar ? getComputedStyle(bar) : null;
      return {
        wrapTop: wr ? Math.round(wr.top) : null,
        wrapLeft: wr ? Math.round(wr.left) : null, wrapRight: wr ? Math.round(wr.right) : null,
        barPos: bs ? bs.position : '(无)',
        barLeft: br ? Math.round(br.left) : null, barRight: br ? Math.round(br.right) : null,
        barBottom: br ? Math.round(br.bottom) : null, barH: br ? Math.round(br.height) : null,
        winH: window.innerHeight
      };
    });
    ok('陪练内容在顶栏下面（wrap.top ≥ 44）', cv.wrapTop >= 44, cv);
    ok('陪练底栏还在（有高度）', cv.barH > 0, cv);
    ok('陪练底栏左缘与内容列对齐（不再按 288px 侧栏偏）', cv.barLeft !== null && Math.abs(cv.barLeft - cv.wrapLeft) <= 1, cv);
    ok('陪练底栏右缘与内容列对齐', cv.barRight !== null && Math.abs(cv.barRight - cv.wrapRight) <= 1, cv);
    ok('陪练底栏停在视口内（没被挤出屏幕）', cv.barBottom <= cv.winH + 1, cv);
    ok('陪练 tab 无横向溢出', m0.scrollW <= m0.docW + 1, { sw: m0.scrollW, dw: m0.docW });
    ok('陪练 tab 无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ③ 口语页 B：模考沉浸（window.__mockEnter = 「模考」tab 点的那个入口）==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/speaking.html?tab=mock', { waitUntil: 'domcontentloaded' });
    /* 2-1d 复跑补丁：mock.js 是按需串行加载（79KB×3，idle 预取），domcontentloaded+1800ms 等不到
       __mockEnter（实测 ~3s 才就绪）→ 探针在沉浸段全红。改成等它就绪（最多 15s）再调。 */
    await p.waitForFunction(() => typeof window.__mockEnter === 'function', null, { timeout: 15000 }).catch(() => {});
    /* ⚠️ fire-and-forget：绝不能 await（开考要等 AI/题库，await 会把探针整晚挂住 —— 10-22 第一轮就挂在这） */
    await p.evaluate(() => { try { if (typeof window.__mockEnter === 'function') window.__mockEnter(); } catch (e) {} });
    await p.waitForFunction(() => document.body.classList.contains('mock-immerse'), null, { timeout: 12000 }).catch(() => {});
    await p.waitForTimeout(900);
    let m = await shellState(p);
    const stage = await p.evaluate(() => {
      const s = document.querySelector('#mockStage');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { disp: getComputedStyle(s).display, h: Math.round(r.height), bottom: Math.round(r.bottom) };
    });
    const bar = await p.evaluate(() => {
      const e = document.querySelector('body.mock-immerse #mockView .mock-bar');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { disp: getComputedStyle(e).display, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    });
    ok('进入模考沉浸（body.mock-immerse）', m.shell === 'hub-topbar' && (await p.evaluate(() => document.body.classList.contains('mock-immerse'))), m.shell);
    ok('模考沉浸：顶栏壳收掉', m.tbDisplay === 'none', m.tbDisplay);
    ok('模考沉浸：44px 让位撤掉（padding-top 归 0）', m.padT === '0px', m.padT);
    ok('模考沉浸：考场舞台可见且有高度', !!stage && stage.disp !== 'none' && stage.h > 100, stage);
    ok('模考沉浸：考场底栏没被挤出视口', !bar || bar.bottom <= m.winH + 1, { bar, winH: m.winH });
    ok('模考沉浸：无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    /* 退出：右上角「✕ 退出模考」→ 弹框。三种结果都要实测：
       ① 「继续模考」= 关掉弹框、留在沉浸里；
       ② 「不保存，清除记录退出」= 按设计回到「模考」tab 并当场再开一场（不是离开模考）；
       ③ 真正离开沉浸 = 点别的 tab（speaking.js 的 tab 处理器会摘掉 mock-immerse）。 */
    await p.evaluate(() => { const b1 = document.getElementById('mockExitBtn'); if (b1) b1.click(); });
    await p.waitForTimeout(700);
    const modal = await p.evaluate(() => {
      const m2 = document.getElementById('mockExitModal');
      if (!m2) return { open: false };
      const on = s => { const e = document.getElementById(s); return !!e && e.getBoundingClientRect().height > 0; };
      return { open: true, text: (m2.textContent || '').trim().slice(0, 30),
        save: on('mockExitSave'), clear: on('mockExitClear'), cancel: on('mockExitCancel') };
    });
    ok('退出模考：弹框三个选项齐全（保存 / 清除 / 继续）', modal.open && modal.save && modal.clear && modal.cancel, modal);
    await p.evaluate(() => { const b2 = document.getElementById('mockExitCancel'); if (b2) b2.click(); });
    await p.waitForTimeout(700);
    ok('退出模考：点「继续模考」留在沉浸态', await p.evaluate(() => document.body.classList.contains('mock-immerse')), 'left immerse');
    await p.evaluate(() => { const b1 = document.getElementById('mockExitBtn'); if (b1) b1.click(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { const b2 = document.getElementById('mockExitClear'); if (b2) b2.click(); });
    /* 2-1d 复跑补丁：等重开后的考场舞台就位（固定 1800ms 不够 —— 要重拉题库） */
    await p.waitForFunction(() => { const s2 = document.getElementById('mockStage'); return !!s2 && !s2.hidden && s2.getBoundingClientRect().height > 50; }, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    const afterClear = await p.evaluate(() => ({
      imm: document.body.classList.contains('mock-immerse'),
      stage: (() => { const s = document.getElementById('mockStage'); return !!s && !s.hidden; })(),
      exitBtn: !!document.getElementById('mockExitBtn')
    }));
    ok('清除记录并退出：回到「模考」当场再开一场（按设计，不是滞留）', afterClear.stage && afterClear.exitBtn, afterClear);
    /* ③ 真正离开沉浸：切到题库 tab */
    await p.evaluate(() => { const bt = document.querySelector('#tabs [data-type="BANK"]'); if (bt) bt.click(); });
    await p.waitForTimeout(1100);
    m = await shellState(p);
    const stillImm = await p.evaluate(() => document.body.classList.contains('mock-immerse'));
    ok('切到题库 tab：沉浸态解除', stillImm === false, stillImm);
    ok('切到题库 tab：顶栏壳回来', m.tbDisplay !== 'none' && m.tbH >= 44, { disp: m.tbDisplay, h: m.tbH });
    ok('切到题库 tab：让位跟着回来（padding-top 44px）', m.padT === '44px', m.padT);
    ok('模考进出无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ④ 写作页 A：模板列表表头的吸顶 ==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/writing.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    /* 切到列表视图（表头 .tl-row.th 只在列表视图里有意义） */
    await p.evaluate(() => { const b2 = document.querySelector('#tplView button[data-view="list"]'); if (b2) b2.click(); });
    /* 2-1d 复跑补丁：等列表视图 + 表头行真正渲染出来（固定 900ms 在慢机/冷缓存下不够） */
    await p.waitForFunction(() => { const t = document.querySelector('#tplList.tpl-list .tl-row.th'); return !!t && t.getBoundingClientRect().height > 0; }, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(300);
    /* 10-22 实测更正：#tplList.tpl-list 自己有 overflow:hidden → 表头的粘附容器是**列表自己**（不是页面），
       top 值量的是「距列表上沿多远」。写 44px 会把表头压到列表内部 44px 处、盖住第一行数据（实测偏移 45px）。
       表头的正确口径：① 列表整块在顶栏下面（表头就不可能被顶栏压到）② 表头在列表内的偏移仍是 0。 */
    const geo = await p.evaluate(() => {
      const lst = document.querySelector('#tplList.tpl-list');
      const th = lst ? lst.querySelector('.tl-row.th') : null;
      if (!lst || !th) return null;
      const lr = lst.getBoundingClientRect(), tr = th.getBoundingClientRect();
      const first = lst.querySelectorAll('.tl-row')[1];
      const fr = first ? first.getBoundingClientRect() : null;
      return {
        listTop: Math.round(lr.top),
        thPos: getComputedStyle(th).position, thTopCss: getComputedStyle(th).top,
        thOffset: Math.round(tr.top - lr.top), thH: Math.round(tr.height),
        firstOffset: fr ? Math.round(fr.top - lr.top) : null,
        overY: getComputedStyle(lst).overflowY
      };
    });
    ok('模板列表里表头是 sticky（粘附容器是列表自己，不是页面）', !!geo && geo.thPos === 'sticky' && geo.overY === 'hidden', geo);
    ok('列表整块在顶栏下面（表头不可能被顶栏压住）', !!geo && geo.listTop >= 44, geo);
    ok('表头在列表内的偏移仍是 0（没被 top 值压到列表内部）', !!geo && Math.abs(geo.thOffset) <= 2, geo);
    ok('第一行数据没被表头盖住（表头下沿 ≤ 第一行上沿）', !!geo && geo.firstOffset !== null && geo.thOffset + geo.thH <= geo.firstOffset + 1, geo);
    ok('表头吸顶实测无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ④ 写作页 B：机考全屏（评分 tab「保存题目，开始练」→ openExamCustom）==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/writing.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1600);
    /* 2-1d 批 B：#writeTabs 桌面 display:none → Playwright 可见性 click 超时。改 JS click（切分栏逻辑不变）。 */
    await p.evaluate(() => { const b3 = document.querySelector('button[data-tab="score"]'); if (b3) b3.click(); });
    await p.waitForTimeout(700);
    await p.fill('#scoreTopic', 'Probe topic: some people think cities should ban cars in the centre. To what extent do you agree?');
    await p.evaluate(() => document.getElementById('scoreTopicSave').click());
    await p.waitForFunction(() => document.body.classList.contains('exam-fullscreen'), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(900);
    let m = await shellState(p);
    const ex = await p.evaluate(() => {
      const panel = document.getElementById('examPanel');
      const main = document.querySelector('main.container') || document.querySelector('main');
      const exit = document.getElementById('examExit');
      const er = exit ? exit.getBoundingClientRect() : null;
      return {
        panelHidden: panel ? panel.hidden : null,
        mainH: main ? Math.round(main.getBoundingClientRect().height) : null,
        exitVisible: !!exit && er.width > 0 && er.height > 0,
        exitBottom: er ? Math.round(er.bottom) : null,
        bodyH: Math.round(document.body.getBoundingClientRect().height),
        winH: window.innerHeight
      };
    });
    ok('进入机考全屏（body.exam-fullscreen）', await p.evaluate(() => document.body.classList.contains('exam-fullscreen')), 'no class');
    ok('机考全屏：顶栏壳收掉', m.tbDisplay === 'none', m.tbDisplay);
    ok('机考全屏：44px 让位撤掉（padding-top 归 0）', m.padT === '0px', m.padT);
    ok('机考全屏：考试面板打开', ex.panelHidden === false, ex.panelHidden);
    ok('机考全屏：main 高度回到一屏（没被 44px 让位撑出界）', Math.abs(ex.mainH - ex.winH) <= 2, { mainH: ex.mainH, winH: ex.winH });
    ok('机考全屏：底栏 Exit 可见且没被挤出视口', ex.exitVisible && ex.exitBottom <= ex.winH + 1, ex);
    ok('机考全屏：无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    await p.evaluate(() => { const b2 = document.getElementById('examExit'); if (b2) b2.click(); });
    await p.waitForTimeout(1300);
    m = await shellState(p);
    ok('退出机考：全屏类解除', await p.evaluate(() => !document.body.classList.contains('exam-fullscreen')), 'still set');
    ok('退出机考：顶栏壳回来', m.tbDisplay !== 'none' && m.tbH >= 44, { disp: m.tbDisplay, h: m.tbH });
    ok('退出机考：让位跟着回来（padding-top 44px）', m.padT === '44px', m.padT);
    ok('机考进出无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ⑤ 手机 390：第 4 批三页 ==');
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cm.addInitScript(t => { try { localStorage.setItem('hub_auth_token', t); localStorage.setItem('hub_role_v1', 'teacher'); } catch (e) {} }, TOKEN);
  /* 🔴 10-25 W-UI-1：测「顶栏 44px 让位归零」前先把未读公告关掉 —— 公告条是 sticky、
     在文档流里真实占 34px，不关掉这条测到的是「被公告顶了一下」，两件事混着判分不清。
     夹具见 tests/_anc_seed.cjs。 */
  await mockRoutes(cm);
  await ancSeed.seedAncRead(cm, BASE);
  for (const f of Object.keys(want)) {
    const p = await cm.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    await ancSeed.waitAncGone(p);
    const m = await shellState(p);
    /* 🔴 10-23 全站口径改：手机端整条顶栏不渲染（她 08:1x「手机上栏全部摘掉」的**全站**范围，
       原来只在 T-011 的三个组页成立）→ body 那 44px 让位一并归零，所以 main.top 不再是 ≥44。 */
    ok(f + ' · 手机整条顶栏不渲染（10-23 全站口径）', m.shell === 'hub-topbar' && m.tbDisplay === 'none' && m.padT === '0px', m.shell + '/' + m.tbDisplay + '/' + m.padT);
    ok(f + ' · 手机隐藏胶囊与搜索（导航走 dock）', m.capsDisplay === 'none' && m.searchDisplay === 'none', { caps: m.capsDisplay, search: m.searchDisplay });
    ok(f + ' · 手机内容贴顶（44px 让位归零，main.top < 20）', m.mainTop < 20, m.mainTop);
    ok(f + ' · 手机无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    ok(f + ' · 手机无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  console.log('== ⑥ 手机 390：沉浸态同样收顶栏 ==');
  {
    const p = await cm.newPage();
    await p.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { try { setWordFullscreen(true); } catch (e) {} });
    await p.waitForTimeout(700);
    let m = await shellState(p);
    ok('手机 · 全屏背词：顶栏壳收掉', m.tbDisplay === 'none', m.tbDisplay);
    ok('手机 · 全屏背词：44px 让位撤掉', m.padT === '0px', m.padT);
    await p.evaluate(() => { try { setWordFullscreen(false); } catch (e) {} });
    await p.waitForTimeout(600);
    m = await shellState(p);
    ok('手机 · 退出全屏：顶栏仍不渲染、让位仍归零（10-23 全站口径）', m.tbDisplay === 'none' && m.padT === '0px', { disp: m.tbDisplay, padT: m.padT });
    await p.close();
  }
  {
    const p = await cm.newPage();
    await p.goto(BASE + '/speaking.html?tab=mock', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof window.__mockEnter === 'function', null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { try { if (typeof window.__mockEnter === 'function') window.__mockEnter(); } catch (e) {} });
    await p.waitForFunction(() => document.body.classList.contains('mock-immerse'), null, { timeout: 12000 }).catch(() => {});
    await p.waitForTimeout(800);
    const m = await shellState(p);
    ok('手机 · 模考沉浸：顶栏壳收掉', m.tbDisplay === 'none', m.tbDisplay);
    ok('手机 · 模考沉浸：44px 让位撤掉', m.padT === '0px', m.padT);
    ok('手机 · 模考沉浸：无横向溢出', m.scrollW <= m.docW + 1, { sw: m.scrollW, dw: m.docW });
    await p.close();
  }

  console.log('== ⑦ 软导航跨壳：首页 → 单词 → 计划 → bank（换壳）→ 口语 ==');
  {
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
    await p.goto(BASE + '/home.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);

    await p.evaluate(() => softNavigate({ href: 'practice.html', file: 'practice.html', id: 'practice' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1100);
    let m = await shellState(p);
    ok('首页 → 单词：壳仍是顶栏（不重建）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('首页 → 单词：高亮从「首页」移到「单词」', m.onCaps.join('') === '单词', m.onCaps);

    await p.evaluate(() => softNavigate({ href: 'plans.html', file: 'plans.html', id: 'plans' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    m = await shellState(p);
    ok('单词 → 计划：壳仍是顶栏', m.shell === 'hub-topbar' && m.padL === '0px', m.shell + '/' + m.padL);
    ok('单词 → 计划：高亮 = 计划', m.onCaps.join('') === '计划', m.onCaps);

    /* 10-22 第 5 批更新：bank 也换成顶栏壳了 → 这里从「换壳」验收改成「同壳不重建」 */
    await p.evaluate(() => softNavigate({ href: 'bank.html', file: 'bank.html', id: 'bank' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1000);
    m = await shellState(p);
    ok('计划 → bank：壳仍是顶栏（第 5 批起 bank 也换了壳）', m.shell === 'hub-topbar' && m.attr === 'top', m.shell + '/' + m.attr);
    ok('计划 → bank：288px 侧栏留白没回来（仍是 0）', m.padL === '0px', m.padL);
    ok('计划 → bank：高亮 = 机经', m.onCaps.join('') === '机经', m.onCaps);   // 10-28 NAV-RENAME-2：tab 显示名「练习」→「机经」（10-27 曾由「模考」改「练习」）

    await p.evaluate(() => softNavigate({ href: 'speaking.html', file: 'speaking.html', id: 'speaking' }));
    await p.waitForFunction(() => document.getElementById('mainNav').className === 'hub-topbar', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1100);
    m = await shellState(p);
    ok('bank → 口语：壳仍是顶栏', m.shell === 'hub-topbar' && m.padL === '0px', m.shell + '/' + m.padL);
    ok('bank → 口语：高亮 = 口语', m.onCaps.join('') === '口语', m.onCaps);
    ok('同壳来回四次无 JS 报错', errs.length === 0, errs[0]);
    await p.close();
  }

  await b.close();
  console.log('\n===== 第 4 批换顶栏：' + pass + '/' + (pass + fail) + ' =====');
  process.exit(fail ? 1 : 0);
})();