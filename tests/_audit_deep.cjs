/* 登录态【深度渲染】体检（2026-10-18 新增 · 第⑤套 · 探针不进 git）
   ── 为什么要有它（她 10/18 的原话）──
   「每次查都没问题，但我上网站看前端都有非常明显的 bug…… 要用我浏览器的登录状态查，
     不然根本就查不出问题。」
   摆到代码上是三个缺口：
     ① 前三套跑**本地**、空数据、未登录 → 页面里那些"有数据才长得出来"的部件根本没渲染，
        她看到的是**她 1.8MB 数据 + 登录态**下的页面；
     ② 第四套（_audit_loggedin）虽然走线上 + 登录态，但只查「溢出 / 小按钮 / 主区空」三条，
        **不进深态、不截图、不查按页样式**——她的两个 bug 恰好都在按页样式里：
        设置页主题开关（css/p/settings.css + #sThemeToggle）塌成灰点、口语模考计时条（css/p/speaking.css + #mockTimerWrap）变成巨型圆弧；
     ③ 没有任何一层**看截图**。结构判据查不出"长得不对"。
   本探针补这三块：真截图（51 张）+ 深态交互（9 项）+ 按页样式是否真的生效。
   仍走 ielts-hub-audit 铁律：判据机械、分母自检、"控件没找到 / 没进到深态"一律计入问题（绝不静默跳过）。

   两档环境：
     · 桌面 1280：用她 Edge 配置的**可写副本** launchPersistentContext（登录态 + 她的数据），21 页
     · 手机 390（hasTouch+isMobile）：把她的数据与 token 注入一个干净上下文（上一版手机档缺的正是"她的数据"），21 页
       —— 手机底栏 #hubDock 只在 hasTouch 下注入，所以这一档顺带验证底栏存在（铁律 2）
   写操作：默认 getonly（放行 GET、拦掉 PUT/POST）——她的数据 1.8MB、只读，绝不写云端。

   用法：node outputs/design/_audit_deep.cjs [getonly|block]
   环境：IELTS_LIVE（默认 https://yasihub.com）· IELTS_ONLY=a,b（只跑指定页，冒烟用）· IELTS_SKIP_DEEP=1
         IELTS_DELAY（默认 3000，防 CF 节流）· IELTS_NAV_TIMEOUT（默认 60000）
   退出码：0 全绿 / 1 有问题或探针故障 / 2 站点不可达 / 3 没拿到登录态（2、3 都是「没测成」）
*/
'use strict';
const PC = (() => {
  const cands = [
    'C:/Users/Camille/.dsh/profiles/desktop/node_modules/playwright-core',
    'C:/Users/Camille/.workbuddy/binaries/node/workspace/node_modules/playwright-core',
    'playwright-core',
  ];
  const errs = [];
  for (const m of cands) { try { return require(m); } catch (e) { errs.push(m + ' → ' + e.code); } }
  throw new Error('找不到 playwright-core:\n  ' + errs.join('\n  '));
})();
const { chromium } = PC;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = process.env.IELTS_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EDGE_SRC = (process.env.LOCALAPPDATA || '') + '/Microsoft/Edge/User Data/Default';
const PROF = (process.env.IELTS_PROF || ((process.env.TEMP || '/tmp') + '/ielts-edge-profile')).replace(/\\/g, '/');
const LIVE = (process.env.IELTS_LIVE || 'https://yasihub.com').replace(/\/+$/, '');
const MODE = process.argv[2] || 'getonly';
const SHOTS = path.join(ROOT, 'design', '深度体检截图');
const MANIFEST = path.join(__dirname, '_deep_audit.json');
const STEP = Number(process.env.IELTS_DELAY || 3000);
const NAV_TIMEOUT = Number(process.env.IELTS_NAV_TIMEOUT || 60000);
const ONLY = (process.env.IELTS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
/* 线上页面走无扩展名规范 URL（避开 308 与 SW 抢导航）；本地冒烟时 python 静态服务不认无扩展名
   → 用 IELTS_URL_EXT=.html 临时补扩展名。正式跑不许设它。 */
const URL_EXT = process.env.IELTS_URL_EXT || '';
const SKIP_DEEP = process.env.IELTS_SKIP_DEEP === '1';
/* 只跑名字里含这个子串的深态项（调试用；不设 = 全跑）。设了它分母就不是 51，别拿给每日体检用。 */
const DEEP_ONLY = process.env.IELTS_DEEP_ONLY || '';

/* 21 个正式页（规范 URL，无扩展名——避开 308 跳转与 SW 抢导航，见 _audit_loggedin 的坑②） */
const ALL_PAGES = ['bank', 'beginner', 'corpus', 'errorbook', 'home', '',
  'materials', 'me', 'meds', 'pattern-drill', 'plans-hub', 'plans',
  'practice', 'review', 'settings', 'speaking', 'study', 'timer',
  'vip', 'writing', 'wrongbook'];
const PAGES = ONLY.length ? ALL_PAGES.filter(f => ONLY.includes(f || 'root')) : ALL_PAGES;

/* 有自己专属样式表的页（css/p/<name>.css）；其余页只吃 common.css。
   依据：grep 'css/p/' *.html → 恰好这 12 页有这个 link 标签 */
const PAGE_CSS = {
  bank: 1, corpus: 1, home: 1, meds: 1, plans: 1, review: 1, settings: 1,
  practice: 1, speaking: 1, timer: 1, vip: 1, writing: 1,
};
const CSS_KEY = f => (f === '' ? 'index' : f);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const label = f => (f === '' ? '(根)' : f);

/* ---------- 她的 Edge 配置副本（与 _audit_loggedin 同源逻辑：只认 token，不认 CURRENT） ---------- */
function ensureProfileCopy() {
  const dstLdb = path.join(PROF.replace(/\//g, path.sep), 'Default', 'Local Storage', 'leveldb');
  const srcLdb = path.join(EDGE_SRC.replace(/\//g, path.sep), 'Local Storage', 'leveldb');
  if (!fs.existsSync(srcLdb)) throw new Error('找不到 Edge Local Storage：' + srcLdb);
  const hasToken = dir => {
    if (!fs.existsSync(dir)) return false;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(ldb|log)$/i.test(f)) continue;
      try { if (fs.readFileSync(path.join(dir, f), 'utf8').includes('hub_auth_token')) return true; } catch (e) {}
    }
    return false;
  };
  if (hasToken(dstLdb)) return dstLdb;
  if (fs.existsSync(dstLdb)) { try { fs.rmSync(dstLdb, { recursive: true, force: true }); } catch (e) {} }
  fs.mkdirSync(dstLdb, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(srcLdb)) { try { fs.copyFileSync(path.join(srcLdb, f), path.join(dstLdb, f)); n++; } catch (e) {} }
  console.log('  【准备】' + (hasToken(dstLdb) ? '已重建' : '⚠️ 重建后仍未找到 token，') + '登录态副本：' + n + ' 个文件');
  return dstLdb;
}

async function gotoWithRetry(page, url, tries = 2) {
  /* 冒烟支持：只有本地补扩展名的场景才改 URL（线上 URL_EXT 为空，等于不改） */
  if (URL_EXT && url.indexOf(LIVE) === 0 && !/\.[a-z0-9]+$/i.test(url)) url = url + URL_EXT;
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }); }
    catch (e) { last = e; if (i < tries) await sleep(1500); }
  }
  throw last;
}
const stripOverlay = page => page.evaluate(() => document.querySelectorAll('.onb-overlay,[class*="onb-"]').forEach(e => e.remove())).catch(() => {});

/* ---------- 页面度量（沿用 10/18 _audit_shots_1018 里已被验证的那份，勿改口径） ---------- */
const pageMetrics = () => {
  const effBg = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m && (m[4] === undefined || Number(m[4]) > 0.85)) return [Number(m[1]), Number(m[2]), Number(m[3])];
      n = n.parentElement;
    }
    return [255, 255, 255];
  };
  const invisible = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (t.length < 2) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) return;
    const fg = (cs.color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const bg = effBg(el);
    if (fg.length === 3 && fg.every((v, i) => Math.abs(v - bg[i]) < 8)) {
      invisible.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0].slice(0, 24) + ' 「' + t.slice(0, 14) + '」');
    }
  });
  const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
  const smallFonts = [...document.querySelectorAll('body *')].filter(el => {
    if (el.children.length) return false;
    const t = (el.textContent || '').trim();
    if (t.length < 4) return false;
    return parseFloat(getComputedStyle(el).fontSize) < 10;
  }).length;
  /* 按页样式是否真的生效：<link> 在 styleSheets 里 + cssRules 可读且非空 */
  const sheetInfo = want => {
    const ss = [...document.styleSheets].find(s => s.href && s.href.indexOf(want) >= 0);
    if (!ss) return { found: false, rules: 0 };
    let n = 0;
    try { n = (ss.cssRules || []).length; } catch (e) { n = -1; }
    return { found: true, rules: n };
  };
  const main = document.querySelector('#main') || document.querySelector('main') || document.body;
  return {
    sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    small: btns.filter(b => { const r = b.getBoundingClientRect(); return r.width < 8 || r.height < 8; }).length,
    bodyLen: (document.body.innerText || '').length,
    mainH: Math.round(main.getBoundingClientRect().height),
    mainLen: (main.innerHTML || '').length,
    smallFonts,
    dock: !!document.querySelector('#hubDock'),
    file: window._hubCurrentFile || location.pathname,
    common: sheetInfo('css/common.css'),
    invisible: invisible.slice(0, 6),
  };
};

/* ---------- 视觉判据（10/19 新增 · 抓「她肉眼可见」的三类：遮挡 / 主区空白 / 骨架屏卡住） ----------
   为什么原来的判据抓不到：它只查「样式表在不在、有没有横向溢出、有没有报错」。
   而她那 9 张截图里最刺眼的两类是：
     · 遮挡 —— 底部绿色计时胶囊（.float-timer，position:fixed）压在正文按钮/输入框上、
       会员页价格卡的「立即开通」被压住。这类页面**不溢出、不报错、样式也全在**，老判据一律放行。
     · 空白 —— pattern-drill 桌面宽度主区没有内容；登录态页面没渲染出她的真实数据（空列表/骨架屏）。
   所以这里改用「几何 + 命中测试」：拿浮层包围盒，对正文里每个可交互/有文字的元素的**中心点**
   做 document.elementFromPoint，谁被浮层吃掉就是谁被遮 —— 不靠肉眼、不靠猜类名。
   三条铁律：① 只报「中心点真的被浮层命中」的，减少误报；② 浮层必须真在视口内；
             ③ 判定分「顶部」和「滚到底」两次（底部悬浮物只有滚到底才可能压住正文）。 */
const visualChecks = async () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const main = document.querySelector('#main') || document.querySelector('main') || document.body;
  const res = { occluded: [], overlays: [], main: null, scroller: null };
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  /* ⚠️ 10/19 第七修（errorbook@手机390「底部死区 107px」误报根因）：
     **收起的 `<details>` 正文在 Chrome 里是「有盒子但不渲染」** —— 实测卡片里默认收起的
     「展开看：题干/翻译/逐词对照/原文」里的那条 `<p>`：
       · getComputedStyle().display === 'block'（不是 none）
       · offsetParent !== null、getClientRects().length === 1（照样有盒子）
       · innerText === ''（这才是它没渲染的痕迹）
       · **el.checkVisibility() === false**（唯一如实反映「不可见」的判据）
     旧筛选只查 display/visibility/opacity → 放行它 → 它的 bottom(893) 比真正可见的
     卡片(762) 低 131px，被当成「正文末端压在底栏下 107px」。
     实证：把这两处 details 展开后死区立刻归零（-24px），截图也确认卡片与按钮全在底栏之上。
     → 候选一律先过 checkVisibility；老引擎没有该 API 时退化成「收起 details 的正文不算」。 */
  const rendered = el => {
    if (typeof el.checkVisibility === 'function') {
      try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch (e) {}
    }
    const cd = el.closest('details:not([open])');
    if (cd && !el.closest('summary')) return false;   /* summary 本身仍然可见 */
    return true;
  };

  /* ⚠️ 10/19 关键修正（第一版误报）：底部固定条**永远**会和某个元素在某个滚动位置重叠 ——
     那就不是 bug，用户滚一下就能点到。真 bug 的定义是「**滚到位了还点不到**」。
     所以判据改成：先 scrollIntoView 把元素滚到视口中央，再命中测试；
     只有「居中之后仍然被浮层吃掉」才算遮挡（页面底部滚不动时最典型 = 她说的「pill 遮页面底部」）。
     第一版在 review 页把 #mkDate 判成被 #hubDock 遮 —— 实测滚动后完全可点，属误报。 */

  /* ① 浮层（fixed / sticky、在视口内、非整屏遮罩） */
  const overlays = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!(el instanceof Element)) return;
    let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    if (r.bottom <= 0 || r.top >= vh) return;
    if (r.width * r.height > vw * vh * 0.85) return;
    overlays.push({ el, rect: r, tag: el.id || String(el.className || '').split(' ')[0] || el.tagName.toLowerCase() });
  });
  res.overlays = overlays.map(o => ({ what: o.tag, rect: [Math.round(o.rect.left), Math.round(o.rect.top), Math.round(o.rect.right), Math.round(o.rect.bottom)] }));

  /* ② 收集候选（**不按视口过滤**：手机端滚动容器是 main.container 而不是 window，
     很多元素当前在视口外，但 scrollIntoView 后就能进来 —— 第一版按视口过滤导致候选恒为 0，
     注入 260px 遮挡都能"全绿"，是典型的假绿。这里只筛「可显示 + 有尺寸」，位置交给 ③ 逐个滚动判定） */
  const sel = 'a[href], button, input, select, textarea, summary, [role="button"], [data-submit], .btn';
  const cands = [...main.querySelectorAll(sel)].filter(el => {
    let cs; try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    if (!rendered(el)) return false;          /* 收起 details 里的控件不算候选（10/19 第七修） */
    const r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8;
  });

  /* ③ 判定「真遮挡」的正确姿势（10/19 第三版；前两版都是错的，记下来免得再走回头路）
     错误1：按视口过滤候选 → 手机滚动容器是 main.container 而非 window，视口外元素被判掉 → 候选恒 0（假绿）。
     错误2：把元素 scrollIntoView 到中央 → 恰好把它挪离底部浮层，注入 260px 遮挡也测不出来。
     错误3：要求「滚到顶部和底部都被遮」才算 → 逻辑上不可能成立（滚到顶部就离开底栏了），永远恒 0。
     ✅ 正解 = **底部死区检测**：真实 bug 只有一种形态 ——
        页面已经滚到最底（再滚不动了），仍有一块内容压在固定底栏下面，用户永远点不到它。
        站点正常时会用 `body.has-dock main.container{padding-bottom:118px}` 之类给底栏留净空，
        所以「滚到底 + 仍与底栏重叠」就是净空没留够的铁证。
     实现：① 把页面滚到最大；② 只看**底部贴合**的浮层（top 落在视口下半部）；
         ③ 元素盒子与浮层相交、且命中测试确认浮层在最上层 → 记一条。
     顶部吸顶栏同理做「滚到最小」的那一轮。 */
  /* ⚠️ 站点有 `html{scroll-behavior:smooth}` → 直接设 scrollTop 是**动画**，
     立刻读会读到中途值（实测：设到底后 scrollTop 只有 2795，真正最大 2997）。
     所以先临时改成 auto，再轮询到滚动位置稳定为止。 */
  const scrollToMax = async () => {
    const de = document.scrollingElement || document.documentElement;
    const prev = de.style.scrollBehavior;
    try { de.style.scrollBehavior = 'auto'; } catch (e) {}
    const sc = document.querySelector('main.container') || de;
    const setMax = () => {
      try { sc.scrollTop = sc.scrollHeight; } catch (e) {}
      try { window.scrollTo(0, de.scrollHeight); } catch (e) {}
    };
    setMax();
    await raf();
    /* 10/19：等 scrollHeight 稳定再滚 —— 动态内容（details 展开、懒渲染）会让高度继续变，
       早滚会停在旧的底部，之后读到的是滚动中途的坐标（writing 页误报根因）。 */
    let lastH = -1, stable = 0;
    for (let i = 0; i < 20; i++) {
      const h = sc.scrollHeight;
      if (h === lastH) { stable++; if (stable >= 3) break; } else { stable = 0; }
      lastH = h;
      setMax();
      await raf();
    }
    /* 再补几轮，确保真的贴底 */
    for (let i = 0; i < 6; i++) { setMax(); await raf(); }
    try { de.style.scrollBehavior = prev; } catch (e) {}
    const atMax = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
    return atMax;
  };
  const seen = new Set();
  const MAXCHK = Number(window.__VC_MAX || 60);
  const inter = (r, o) => !(r.right <= o.left || r.left >= o.right || r.bottom <= o.top || r.top >= o.bottom);
  let checked = 0;
  const hitAt = (el, ov) => {
    /* 10/19：排除「浮层自己的子元素」—— dock 里的「首页/计划/学习/我的」按钮
       本来就该在 dock 上面，把它算成"被遮"是误报（errorbook 页实测）。 */
    if (ov.el.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (!inter(r, ov.rect)) return false;
    /* 10/19：排除「已经滚过视口」的元素 —— 它的中心点在视口上方，
       说明用户早已滑过去，不是「停在底部被压住」（writing 页 wbSourceFilter 实测误报）。 */
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    if (cy < 0) return false;
    if (!(cx >= 0 && cx < vw && cy < vh)) return false;
    /* 10/19：排除「只压到边框」的元素 —— 元素底边和浮层顶边重叠 <8px
       是视觉上的正常贴合（浮层描边/圆角），不是「压住内容」（speaking 页 2px 误报）。 */
    if (r.bottom - ov.rect.top < 8) return false;
    let top = null;
    try { top = document.elementFromPoint(cx, cy); } catch (e) { return false; }
    if (!top || top === el || el.contains(top)) return false;
    return (top === ov.el || ov.el.contains(top));
  };
  const record = (el, ov, note) => {
    const label = String(el.innerText || el.value || el.getAttribute('aria-label') || el.tagName)
      .replace(/\s+/g, ' ').trim().slice(0, 26);
    const k = ov.tag + '|' + el.tagName + (el.id ? '#' + el.id : '') + '|' + label;
    if (seen.has(k)) return;
    seen.add(k);
    checked++;
    res.occluded.push({
      by: ov.tag,
      what: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '「' + label + '」',
      note: note,
      overlay: [Math.round(ov.rect.left), Math.round(ov.rect.top), Math.round(ov.rect.right), Math.round(ov.rect.bottom)],
    });
  };

  /* ③ 判定「真遮挡」（10/19 第四版，最终版）
     ── 前三版为什么都不行（记下来，别再走回头路）──
     错误1：按视口过滤候选 → 手机滚动容器是 main.container 而非 window，视口外元素被判掉 → 候选恒 0。
     错误2：把元素 scrollIntoView 到中央 → 恰好挪离底部浮层，注入 260px 遮挡也测不出来。
     错误3：要求「滚到顶和滚到底都被遮」→ 逻辑上不可能成立，恒 0。
     ✅ 本版判据 = **「滚到底后，正文最后一块内容是否被底部浮层吃掉」**。
        这正是她说的「pill 遮页面底部」：站点正常会给固定底栏留净空
        （`body.has-dock main.container{padding-bottom:118px}` 之类），
        一旦净空不够/失效，滚到底时正文最后 100~200px 就永远压在胶囊下面，点不到。
     做法：滚到真正的最底（避 smooth 滚动，见 scrollToMax）→ 取 main 里最后一个可见块元素的 bottom，
          与底部浮层的 top 比；bottom 超过浮层 top 即「被吃掉的深度」。
        另外仍逐元素做一次命中测试，把「具体哪个控件」名字报出来，方便她定位。 */
  /* ③ 判定「真遮挡」（10/19 第五版；前四版的踩坑记录见 archive/分片34）
     ── 四版修不好的共同教训：**每次都只改一半**。真正的原因是「滚动到底」这一步本身不可靠：
        站点 body{overflow-y:hidden}、只有 main.container 会滚，且 html{scroll-behavior:smooth}
        让 scrollTop 是动画值；更坑的是「顶部吸顶检测」会把页面再滚回顶部，
        之后再读 lastBottom 就是负数（-357）—— 我一直在读滚动后的位置，而不是滚到底的位置。
     ✅ 本版：一次到底、读完所有值、绝不中途改滚动状态。
        判据（只一条，最硬）：滚到最底后，**滚动容器内**视觉最靠下的可见块的 bottom
        是否越过底部浮层的 top（超过 40px 才算，避免浮层描边/圆角的正常重叠）。 */
  const atBottomNow = await scrollToMax();
  res.atBottom = atBottomNow;
  /* ⚠️ 10/19 第六修（误报根因）：overlays 的 rect 是在函数开头（页面顶部状态）捕获的，
     但检测结果是在 scrollToMax 之后（底部状态）读的。fixed 元素的位置虽然不随滚动变，
     但**候选元素的 rect 会变**——一个元素在顶部时和 dock 重叠，滚到底后可能完全分离。
     修法：在底部状态重新读一遍浮层 rect（虽然 fixed 不变，但保持一致性更安全），
     更关键的是：hitAt 里的 el.getBoundingClientRect() **已经在底部状态**（因为代码在
     scrollToMax 之后执行），所以 hitAt 本身没问题；真正的误报来源是 errorbook 页的
     「deadDepth > 40」判断——lastBottom 是底部状态读的，但 ov.rect.top 是顶部状态
     读的。fixed 元素 rect 不随滚动变，所以这不是问题…… 那误报到底哪来的？
     → 答案：hitAt 里的 cands 是在函数开头收集的，但 elementFromPoint 在底部执行。
     对于「不在视口内」的元素（滚到顶时在视口外、滚到底后在视口内），
     cx/cy 检查会在底部正确判定。但 errorbook 的误报是：dock 自己的 a 标签
     （首页/计划/学习/我的）在 cands 里，它们**始终在视口内**且**始终被 dock 覆盖**
     —— 这不是滚动问题，是「浮层自身子元素」问题，已通过 ov.el.contains(el) 修掉。
     speaking 的误报：button 在 [29,784]，dock 顶部 786 → 只压 2px，在 >40px 阈值
     以下，但 hitAt 里没有 >40px 的阈值（那个只在 deadDepth 有）→ 加上。
     writing 的误报：select#wbSourceFilter 滚到底后在 [14,-38]（负坐标）→
     hitAt 里已有 cy<0 排除。所以剩下的误报只有 speaking 的 2px —— 把 hitAt 也加上
     阈值即可。 */
  const bottomOv = overlays.filter(o => o.rect.top > vh * 0.5);
  let deadDepth = 0, deadBy = '';
  if (bottomOv.length) {
    const ov = bottomOv.reduce((a, b) => (a.rect.height > b.rect.height ? a : b));
    deadBy = ov.tag;
    const box = document.querySelector('main.container') || document.scrollingElement || document.body;
    let lastBottom = -Infinity, lastEl = null;
    box.querySelectorAll('section, article, form, table, ul, ol, .card, .hubg-grid, #mkList, p, .hubg-note, .note, .muted').forEach(el => {
      let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
      /* 10/19 第七修：只认「真的渲染出来」的块 —— 收起 details 的正文有盒子但不可见，
         bottom 会远超真正可见的末端（errorbook 107px 误报就出在这）。 */
      if (!rendered(el)) return;
      const r = el.getBoundingClientRect();
      if (r.height < 4 || r.width < 8) return;
      /* 只认「此刻真的在视口里」的块 —— 滚到底后，内容末端一定贴视口底部；
         高于视口顶部的都是被滚过去的历史内容，不该参与判定 */
      if (r.bottom < 0 || r.top > vh) return;
      if (r.bottom > lastBottom) { lastBottom = r.bottom; lastEl = el; }
    });
    if (lastEl) {
      deadDepth = Math.round(lastBottom - ov.rect.top);
      res.deadEl = (lastEl.id ? '#' + lastEl.id : lastEl.tagName.toLowerCase() + '.' + String(lastEl.className || '').split(' ')[0]);
      res.lastBottom = Math.round(lastBottom);
      res.overlayTop = Math.round(ov.rect.top);
    }
    for (const el of cands) {
      if (checked >= MAXCHK) break;
      if (hitAt(el, ov)) record(el, ov, '滚到最底仍被底部浮层压住');
    }
  }
  res.deadDepth = deadDepth;
  res.deadBy = deadBy;
  if (bottomOv.length && deadDepth > 40) {
    res.occluded.unshift({
      by: deadBy,
      what: '正文底部（内容末端被压进浮层 ' + deadDepth + 'px）',
      note: '滚到最底后正文最后 ' + deadDepth + 'px 被「' + deadBy + '」挡住 → 底部内容点不到',
      overlay: null,
    });
  }

  /* ④ 顶部吸顶：**先读完底部数据**，再滚回顶部测（顺序反了会读到滚动中途的负坐标） */
  const scM = document.querySelector('main.container') || document.scrollingElement;
  if (scM) { try { scM.scrollTop = 0; } catch (e) {} }
  try { window.scrollTo(0, 0); } catch (e) {}
  await raf();
  const topOv = overlays.filter(o => o.rect.bottom < vh * 0.5 && o.rect.height <= vh * 0.4);
  if (topOv.length) {
    for (const el of cands) {
      if (checked >= MAXCHK) break;
      for (const ov of topOv) {
        if (hitAt(el, ov)) { record(el, ov, '页面在顶部，此元素被吸顶栏遮住'); break; }
      }
    }
  }

  /* ④ 主区是否非空 / 骨架屏卡住 */
  const isVis = el => {
    let cs; try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const visKids = [...main.children].filter(isVis).length;
  const text = String(main.innerText || '').replace(/\s+/g, ' ').trim();
  const hasSkeleton = !!main.querySelector('.skeleton, [class*="skeleton"], [class*="loading"], #hubLoader:not([hidden])');
  const loadingWord = /加载中|正在加载|请稍候|Loading/i.test(text);
  const sc = document.querySelector('main.container') || document.scrollingElement;
  res.scroller = { tag: sc ? (sc.className || sc.tagName) : null, top: sc ? Math.round(sc.scrollTop) : null, h: sc ? sc.scrollHeight : null, client: sc ? sc.clientHeight : null };
  res.main = {
    visibleKids: visKids,
    textLen: text.length,
    head: text.slice(0, 50),
    skeleton: hasSkeleton,
    loadingStuck: hasSkeleton || (loadingWord && text.length < 120),
  };
  return res;
};

const NOISE = /cloudflareinsights|ERR_FAILED|ERR_ABORTED|Failed to load resource|\/api\//i;

(async () => {
  fs.rmSync(SHOTS, { recursive: true, force: true });   /* 每次只留本次的截图，计数才不会把历史算进来 */
  fs.mkdirSync(SHOTS, { recursive: true });
  const report = { 时间: new Date().toISOString(), live: LIVE, 环境: MODE, 页面: {}, 深态: {}, 问题: [], 提示: [] };
  const problems = [];
  const hints = [];
  const addProblem = m => { problems.push(m); };
  const addHint = m => { hints.push(m); };

  ensureProfileCopy();
  /* ============ A. 桌面档：她 Edge 登录态 + 她的数据 ============ */
  let ctxD = await chromium.launchPersistentContext(PROF, {
    executablePath: EDGE, headless: true, viewport: { width: 1280, height: 800 },
    acceptDownloads: false, serviceWorkers: 'block',
  });
  let pD = ctxD.pages()[0] || await ctxD.newPage();
  let pDRef = pD;
  const route = pg => MODE === 'block'
    ? pg.route('**/api/**', r => r.abort())
    : MODE === 'getonly'
      ? pg.route('**/api/**', r => (r.request().method() === 'GET' ? r.continue() : r.abort()))
      : Promise.resolve();
  await route(pD);

  /* 前置：登录态 + 她的数据（没登上就必须停，否则后面全是假绿） */
  try { await gotoWithRetry(pD, LIVE + '/home'); }
  catch (e) {
    console.log('  ❌ 前置自检失败：连不上 ' + LIVE + '/home\n     ' + String(e.message).split('\n')[0].slice(0, 110));
    console.log('  【结论】站点不可达 = 探针无法给出站点质量结论（不是「网站没问题」）。');
    await ctxD.close().catch(() => {});
    process.exit(2);
  }
  await sleep(4000);
  await stripOverlay(pD);
  const auth = await pD.evaluate(() => {
    const raw = localStorage.getItem('ielts_study_hub_v1') || '';
    let d = {};
    try { d = JSON.parse(raw || '{}'); } catch (e) {}
    return {
      token: localStorage.getItem('hub_auth_token') || '',
      dataKB: Math.round(raw.length / 1024),
      ws: (d.writingScores || []).length, words: (d.words || []).length,
    };
  });
  console.log('  【她的登录态】token=' + !!auth.token + ' 数据=' + auth.dataKB + 'KB 评分=' + auth.ws + '条 单词=' + auth.words);
  /* 冒烟用：本地服务下 localStorage 是另一个 origin，本来就没有她的 token/数据。
     IELTS_SKIP_GATE=1 只在本地冒烟时用，正式跑（线上）绝不许加。 */
  if (process.env.IELTS_SKIP_GATE === '1') {
    console.log('  【冒烟】IELTS_SKIP_GATE=1 → 跳过登录态/数据闸门（仅限本地自测，结论不作数）');
  } else if (!auth.token) {
    console.log('  【结论】没拿到登录态 → 本次不能作为「登录态体检」结论。');
    console.log('     排查：Edge 里 yasihub.com 是否登录过；副本 ' + PROF + ' 是否被清空。');
    await ctxD.close().catch(() => {});
    process.exit(3);
  }
  if (!(auth.dataKB > 50) && process.env.IELTS_SKIP_GATE !== '1') {
    console.log('  【结论】她的数据只有 ' + auth.dataKB + 'KB（≈空号）→ 页面里"有数据才长得出来"的部件测不到，本次不能算深度体检。');
    await ctxD.close().catch(() => {});
    process.exit(3);
  }
  /* 把她的数据与 token 原样带一份给手机档（手机档只有注入才拿得到她的数据） */
  const seed = await pD.evaluate(() => ({
    d: localStorage.getItem('ielts_study_hub_v1') || '',
    t: localStorage.getItem('hub_auth_token') || '',
  }));

  /* ---------- A1. 桌面 21 页 ---------- */
  /* 10/18 现场修：`launchPersistentContext` 期间宿主机网络抖一下（WiFi 重连 / DNS 换网），
     Edge 就会直接把整个 persistent context 收掉，后半程每页都报
     「Target page, context or browser has been closed」—— 那是**环境断了**，不是网站坏了。
     修法：桌面 context 允许在它真死掉时重建一次，已跑过的页不重跑。 */
  let ctxDDead = false;
  const ensureCtxD = async () => {
    if (!ctxDDead) return pDRef;
    ctxDDead = false;
    try { await ctxD.close().catch(() => {}); } catch (e) {}
    const ctx2 = await chromium.launchPersistentContext(PROF, {
      executablePath: EDGE, headless: true, viewport: { width: 1280, height: 800 },
      acceptDownloads: false, serviceWorkers: 'block',
    });
    ctxD = ctx2;
    const p2 = ctx2.pages()[0] || await ctx2.newPage();
    await route(p2);
    attachListeners(p2);
    pDRef = p2;
    console.log('  【环境】桌面浏览器 context 曾断过一次，已重建（已跑过的页不重跑）');
    return p2;
  };
  const measured = async (page, file, vpLabel) => {
    const key = label(file) + '@' + vpLabel;
    const rec = { 溢出: null, 问题: [], 提示: [], 截图: '' };
    const tPage = Date.now();
    let loadFail = null;
    let pageNow = page;
    try { await gotoWithRetry(pageNow, LIVE + '/' + file); }
    catch (e) { loadFail = String(e.message).split('\n')[0].slice(0, 90); }
    /* 环境断了的两种形态：goto 报 closed，或 context/page 已经被判定死亡 */
    if (loadFail && /has been closed/i.test(loadFail)) {
      ctxDDead = true;
      const p2 = await ensureCtxD();
      if (p2) { pageNow = p2; loadFail = null; }
      if (pageNow) { try { await gotoWithRetry(pageNow, LIVE + '/' + file); } catch (e2) { loadFail = String(e2.message).split('\n')[0].slice(0, 90); } }
    }
    if (loadFail || !pageNow) {
      rec.问题.push('打不开：' + (loadFail || '浏览器 context 已断'));
      addProblem(key + ' 打不开：' + (loadFail || '浏览器 context 已断'));
      try { await pageNow.screenshot({ path: path.join(SHOTS, CSS_KEY(file) + '__' + vpLabel + '__FAIL.png'), fullPage: true }); } catch (e) {}
      report.页面[key] = rec;
      return rec;
    }
    await sleep(STEP);
    await stripOverlay(pageNow);
    /* 滚到底：长列表/懒渲染要滚过才算测过 */
    await pageNow.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await sleep(900);
    const m = await pageNow.evaluate(pageMetrics);
    /* ★ 视觉判据：滚到底检查一次（底部悬浮胶囊只有滚到底才可能压住正文） */
    const visBottom = await pageNow.evaluate(visualChecks).catch(() => null);
    await pageNow.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await sleep(200);
    /* ★ 视觉判据：回到顶部再检查一次（吸顶栏 / 顶部浮层） */
    const visTop = await pageNow.evaluate(visualChecks).catch(() => null);
    rec.主区高 = m.mainH;
    if (m.sw > m.iw + 1) { rec.溢出 = m.sw + '>' + m.iw; rec.问题.push('横向溢出 ' + rec.溢出); addProblem(key + ' 横向溢出 ' + rec.溢出); }
    if (m.bodyLen < 30 || m.mainLen < 200) { rec.问题.push('白屏（正文 ' + m.bodyLen + ' / 主区 ' + m.mainLen + '）'); addProblem(key + ' 白屏'); }
    if (m.mainH < 80) { rec.问题.push('主区塌陷 ' + m.mainH + 'px'); addProblem(key + ' 主区塌陷 ' + m.mainH + 'px'); }
    if (m.invisible.length) { rec.问题.push('隐形文字×' + m.invisible.length + ' ' + m.invisible.join(' / ')); addProblem(key + ' 隐形文字 ' + m.invisible.join(' / ')); }

    /* ===== 新判据 a：遮挡（浮层压住正文可点/可输入元素）===== */
    const occl = [];
    for (const [where, v] of [['顶部', visTop], ['滚到底', visBottom]]) {
      if (!v || !v.occluded) continue;
      for (const o of v.occluded) {
        const line = (where === '顶部' ? '' : '[滚到底] ') + o.what + ' 被「' + o.by + '」遮住';
        if (occl.indexOf(line) < 0) occl.push(line);
      }
    }
    rec.浮层 = (visBottom && visBottom.overlays) ? visBottom.overlays.map(o => o.what) : [];
    if (occl.length) {
      rec.遮挡 = occl;
      occl.forEach(line => addProblem(key + ' 遮挡：' + line));
      rec.问题.push('遮挡×' + occl.length);
    }

    /* ===== 新判据 b：主区非空 / 登录态必须有她的真实数据 ===== */
    const vm = (visBottom && visBottom.main) || (visTop && visTop.main);
    if (vm) {
      rec.主区 = { 可见子元素: vm.visibleKids, 文本长度: vm.textLen };
      /* 空白阈值：可见子元素 < 2 且 文本<40 字 → 主区空白。
         （实测正常页最少也有几十字；空态页有引导文案，不算空。） */
      const blank = vm.visibleKids < 2 && vm.textLen < 40;
      const stuck = vm.loadingStuck && vm.textLen < 120;
      if (blank) {
        rec.问题.push('主区空白（可见子元素 ' + vm.visibleKids + ' / 文本 ' + vm.textLen + ' 字）');
        addProblem(key + ' 主区空白（可见子元素 ' + vm.visibleKids + ' / 文本 ' + vm.textLen + ' 字）');
      }
      if (stuck) {
        rec.问题.push('疑似骨架屏/加载卡住（文本 ' + vm.textLen + ' 字：' + vm.head.slice(0, 24) + '）');
        addProblem(key + ' 疑似骨架屏/加载卡住（' + vm.head.slice(0, 24) + '）');
      }
    }

    /* ===== 新判据 c：慢页（单页渲染 > 10s）===== */
    const pageMs = Date.now() - tPage;
    rec.耗时 = pageMs;
    if (pageMs > 10000) {
      rec.问题.push('慢页 ' + (pageMs / 1000).toFixed(1) + 's');
      addProblem(key + ' 慢页 ' + (pageMs / 1000).toFixed(1) + 's（>10s）');
    } else if (vpLabel === '手机390' && pageMs > 6000) {
      addHint(key + ' 手机档偏慢 ' + (pageMs / 1000).toFixed(1) + 's');
    }

    /* ★★★ 10/19 她要求：每页存原始测量值，不许只存一个「✅」。
       「0 问题」时她得能翻出数字来核。所以无论有没有问题，把这页量到的
       原始数据全部落到 rec.测量 里：浮层是谁/在哪、主区多少字、单页多少秒、
       滚到顶和滚到底各测到什么、底部死区深度、页面结构信息。 */
    rec.测量 = {
      单页耗时ms: pageMs,
      视口: vpLabel,
      浮层: visBottom ? visBottom.overlays : (visTop ? visTop.overlays : []),
      底部浮层: (visBottom && visBottom.overlays) ? visBottom.overlays.filter(o => o.rect && o.rect[1] > (visBottom.vh || 0) * 0.5) : [],
      底部死区px: visBottom ? (visBottom.deadDepth || 0) : null,
      底部死区元素: visBottom ? (visBottom.deadEl || null) : null,
      滚到底: visBottom ? {
        内容末端bottom: visBottom.lastBottom != null ? visBottom.lastBottom : null,
        底部浮层top: visBottom.overlayTop != null ? visBottom.overlayTop : null,
        已到最底: visBottom.atBottom != null ? visBottom.atBottom : null,
        滚动状态: visBottom.scrollerInfo || null,
      } : null,
      滚到顶: visTop ? {
        遮挡数: (visTop.occluded || []).length,
        被遮: (visTop.occluded || []).map(o => o.by + ':' + o.what).slice(0, 6),
      } : null,
      主区: visBottom ? visBottom.main : (visTop ? visTop.main : null),
      主区高px: m.mainH,
      正文总字数: m.bodyLen,
      主区HTML长度: m.mainLen,
      页面宽度sw: m.sw,
      视口宽iw: m.iw,
      横向溢出px: m.sw - m.iw,
      公共样式规则数: m.common ? m.common.rules : null,
      专属样式规则数: rec.专属样式 != null ? rec.专属样式 : null,
      小按钮数: m.small,
      小字号元素数: m.smallFonts,
      隐形文字数: (m.invisible || []).length,
      手机底栏在: m.dock,
      判定: rec.问题.length ? '有问题' : '通过',
    };

    /* 按页样式：common.css 必须在且能读到规则；该页专属 css 也必须在 */
    if (!m.common.found || m.common.rules <= 0) { rec.问题.push('公共样式没生效（found=' + m.common.found + ' rules=' + m.common.rules + '）'); addProblem(key + ' 公共样式没生效'); }
    const ck = CSS_KEY(file);
    if (PAGE_CSS[ck]) {
      const own = await pageNow.evaluate(w => {
        const ss = [...document.styleSheets].find(s => s.href && s.href.indexOf(w) >= 0);
        if (!ss) return { found: false, rules: 0 };
        let n = 0; try { n = (ss.cssRules || []).length; } catch (e) { n = -1; }
        return { found: true, rules: n };
      }, 'css/p/' + ck + '.css');
      if (!own.found || own.rules <= 0) {
        rec.问题.push('本页专属样式没生效（css/p/' + ck + '.css found=' + own.found + ' rules=' + own.rules + '）');
        addProblem(key + ' 本页专属样式没生效（css/p/' + ck + '.css）');
      }
      rec.专属样式 = own.rules;
    }
    if (vpLabel === '手机390' && !m.dock) { rec.提示.push('没看到手机底栏 #hubDock'); addHint(key + ' 没看到手机底栏'); }
    if (m.smallFonts > 0) { rec.提示.push('字号<10px×' + m.smallFonts); addHint(key + ' 字号<10px×' + m.smallFonts); }
    if (m.small > 0) { rec.提示.push('异常小按钮×' + m.small); addHint(key + ' 异常小按钮×' + m.small); }
    if (m.mainH > 0) rec.主区高 = m.mainH;
    try {
      const shot = path.join(SHOTS, CSS_KEY(file) + '__' + vpLabel + '.png');
      await pageNow.screenshot({ path: shot, fullPage: true });
      rec.截图 = path.basename(shot);
    } catch (e) { addProblem(key + ' 截图失败：' + String(e.message).slice(0, 60)); }
    /* 10/19：每页都存完整记录（含原始测量值），不再用 '✅' 字符串占位。
       她要的是「报 0 问题时我也能翻出数字来核」。 */
    report.页面[key] = rec;
    return rec;
  };

  /* ===== 10/19 健壮性（今晚两个实录坑）=====
     坑A（20:01）：整套 19 分钟零输出 → 出问题时完全看不出卡在哪一页。
     坑B（22:05）：第 12 页起浏览器崩了，后面 10 页全没测，而报告里看不出「这些页根本没跑」。
     对策：① 每页开始/结束都打进度（序号/页名/耗时）；② 单页硬超时 90s，超时只把这页标
           「没测成」继续跑后面的；③ 记录「崩溃/超时导致没测成」的页，并在结论里单列，
           绝不允许把它们算成「测过了没问题」。 */
  const PAGE_TIMEOUT_MS = Number(process.env.IELTS_PAGE_TIMEOUT || 90000);
  const NOT_TESTED = [];          // 没测成的页（崩溃 / 超时），必须在结论里单列
  const withPageTimeout = async (fn, key) => {
    let timer = null;
    const t0 = Date.now();
    const guard = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error('PAGE_TIMEOUT_AFTER_' + PAGE_TIMEOUT_MS)), PAGE_TIMEOUT_MS);
    });
    /* 60s 时打一条「卡在哪」的告警（页面级超时是 90s，留 30s 缓冲） */
    const warn = setTimeout(() => {
      console.log('  ⏳ ' + key + ' 已跑 ' + Math.round((Date.now() - t0) / 1000) + 's 仍未完成（>60s，可能卡住）');
    }, 60000);
    try {
      return await Promise.race([fn(), guard]);
    } finally {
      clearTimeout(timer); clearTimeout(warn);
    }
  };

  /* 每页独立的 JS 报错/资源失败收集（按页清零，才分得清是哪页坏的） */
  let curKey = '';
  const perPage = { errs: [], fails: [] };
  /* 10/18：context 重建后监听器要重新挂（旧 page 死了），所以抽成函数 */
  const attachListeners = pg => {
    pg.on('pageerror', e => { if (curKey) perPage.errs.push(curKey + ' pageerror: ' + String(e.message).slice(0, 110)); });
    pg.on('console', m => { if (m.type() === 'error' && curKey) { const t = m.text().slice(0, 130); if (!NOISE.test(t)) perPage.errs.push(curKey + ' console: ' + t); } });
    pg.on('requestfailed', r => {
      if (!curKey) return;
      const u = r.url();
      if (u.indexOf(LIVE) !== 0) return;
      if (/\/api\//.test(u)) return;
      /* 10/18：ERR_ABORTED 绝大多数是探针自己的竞态（软导航换页瞬间上一页的脚本请求被打断 /
         prefetch 被后来的导航抢掉），不是站点问题 —— 一律降级为「提示」，不许当问题计。
         真问题只有：net::ERR_CONNECTION_* / ERR_NAME_NOT_RESOLVED / ERR_TIMED_OUT / ERR_HTTP2_* 等。 */
      const err = ((r.failure() || {}).errorText || '');
      if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(err)) { perPage.fails.push('提示·' + curKey + ' 请求被自己打断: ' + u.split('/').pop() + ' (' + err + '，不算站点问题)'); return; }
      perPage.fails.push(curKey + ' 资源失败: ' + u.split('/').pop() + ' (' + err + ')');
    });
  };
  attachListeners(pD);

  let desktop = 0, desktopExpect = PAGES.length;
  for (let pi = 0; pi < PAGES.length; pi++) {
    const file = PAGES[pi];
    const key = label(file) + '@桌面1280';
    curKey = key;
    perPage.errs = []; perPage.fails = [];
    await sleep(STEP);
    const t0 = Date.now();
    console.log('  · 桌面 ' + (pi + 1) + '/' + desktopExpect + ' ' + label(file) + ' …');
    try {
      if (pDRef.isClosed && pDRef.isClosed()) { pDRef = await ensureCtxD(); }
      await withPageTimeout(() => measured(pDRef, file, '桌面1280'), key);
      desktop++;
      console.log('    ✓ ' + label(file) + ' ' + (Date.now() - t0) + 'ms');
    } catch (e) {
      const msg = String(e && e.message || e);
      const isTimeout = /PAGE_TIMEOUT/.test(msg);
      const isClosed = /has been closed|Target closed|browser has been closed/i.test(msg);
      /* 没测成的页：明确记账，绝不算「测过且没问题」 */
      NOT_TESTED.push({ viewport: '桌面1280', file: label(file), reason: isTimeout ? ('单页超 ' + Math.round(PAGE_TIMEOUT_MS / 1000) + 's') : (isClosed ? '浏览器/页面崩溃' : msg.slice(0, 80)) });
      addProblem(key + ' 没测成：' + (isTimeout ? ('单页超 ' + Math.round(PAGE_TIMEOUT_MS / 1000) + 's') : (isClosed ? '浏览器崩溃' : msg.slice(0, 60))));
      console.log('    ✗ ' + label(file) + ' 没测成：' + (isTimeout ? '超时' : isClosed ? '浏览器崩溃' : msg.slice(0, 60)));
      if (isClosed) { ctxDDead = true; try { pDRef = await ensureCtxD(); } catch (e2) {} }
    }
    curKey = '';
    for (const e of [...new Set(perPage.errs)]) addProblem(e);
    /* 资源失败里带「提示·」前缀的是探针自己打断的，只进提示不进问题 */
    for (const e of [...new Set(perPage.fails)]) (e.indexOf('提示·') === 0 ? addHint : addProblem)(e);
  }
  console.log('  【桌面档】' + desktop + ' 页（预期 ' + desktopExpect + '）' + (desktop !== desktopExpect ? ' ⚠️ 有 ' + (desktopExpect - desktop) + ' 页没测成' : ''));

  /* 深态阶段用的桌面页统一从 pDRef 取（它可能在桌面档期间被重建过） */
  pD = pDRef;

  /* 10/18 22:4x 修：软导航必须点侧栏里「可见的真实条目」。
     坑①：#mainNav 第一个 a 是侧栏头部她的头像链接 .side-me（仅登录态渲染），
        侧栏收起态下它不可见 → click 超时被 catch 吞掉 → 页面原地不动，
        探针就把「根本没软导航」当成「软导航后样式坏了」（假失败）。
     坑②：侧栏条目在 .top-nav-inner 里，#mainNav 是外层 nav；用 a.side-item 直取。
     坑③：home.html 在侧栏 PAGES 里不存在（见 navLinks 实测）→ 中转页用 timer。 */
  /* 10/19 00:2x 修：落地判定改为**轮询等目标页就位**（最多 20s），不再固定 sleep 2.8s。
     坑④（本轮实锤）：固定 sleep 在慢网/重脚本（settings.js 2140 行 eval）下不够，
     `去timer` 时 `window._hubCurrentFile` 还停在上一页 /settings、`回settings` 时又停在 /timer.html
     → 后面所有「软导航后找控件」全部扑空（设置页三项因此假失败）。
     现在按「目标 file 真的成为当前页」才算落地，并记录等了多少 ms。 */
  const navGo = async (pg, file) => {
    const sel = '#mainNav a.side-item[href="' + file + '"]';
    const clicked = await pg.click(sel, { timeout: 8000 }).then(() => true).catch(() => false);
    const want = (file || '').replace(/\.html$/, '').replace(/^\//, '').replace(/\.html$/, '');
    const t0 = Date.now();
    let now = '?';
    for (let i = 0; i < 40; i++) {
      now = String(await pg.evaluate(() => window._hubCurrentFile || location.pathname).catch(() => '?'));
      const cur = String(now).replace(/\.html$/, '').replace(/^\//, '').replace(/\.html$/, '');
      if (cur === want || String(now).indexOf(want) >= 0) break;
      await sleep(500);
    }
    await sleep(800);   // 落后再留一拍让页面脚本把控件渲染出来
    return { clicked, now: String(now), waitMs: Date.now() - t0 };
  };

  /* 手机档：干净上下文 + 注入她的数据与 token（底栏要 hasTouch 才注入，铁律 2） */
  const br = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctxM = await br.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
  });
  await ctxM.addInitScript(s => {
    try { if (s.d) localStorage.setItem('ielts_study_hub_v1', s.d); if (s.t) localStorage.setItem('hub_auth_token', s.t); } catch (e) {}
  }, seed);
  const pM = await ctxM.newPage();
  await route(pM);
  let mobile = 0, mobileExpect = PAGES.length;
  for (let pi = 0; pi < PAGES.length; pi++) {
    const file = PAGES[pi];
    const key = label(file) + '@手机390';
    curKey = key;
    perPage.errs = []; perPage.fails = [];
    await sleep(STEP);
    const t0 = Date.now();
    console.log('  · 手机 ' + (pi + 1) + '/' + mobileExpect + ' ' + label(file) + ' …');
    try {
      await withPageTimeout(() => measured(pM, file, '手机390'), key);
      mobile++;
      console.log('    ✓ ' + label(file) + ' ' + (Date.now() - t0) + 'ms');
    } catch (e) {
      const msg = String(e && e.message || e);
      const isTimeout = /PAGE_TIMEOUT/.test(msg);
      const isClosed = /has been closed|Target closed|browser has been closed/i.test(msg);
      NOT_TESTED.push({ viewport: '手机390', file: label(file), reason: isTimeout ? ('单页超 ' + Math.round(PAGE_TIMEOUT_MS / 1000) + 's') : (isClosed ? '浏览器/页面崩溃' : msg.slice(0, 80)) });
      addProblem(key + ' 没测成：' + (isTimeout ? ('单页超 ' + Math.round(PAGE_TIMEOUT_MS / 1000) + 's') : (isClosed ? '浏览器崩溃' : msg.slice(0, 60))));
      console.log('    ✗ ' + label(file) + ' 没测成：' + (isTimeout ? '超时' : isClosed ? '浏览器崩溃' : msg.slice(0, 60)));
    }
    curKey = '';
    for (const e of [...new Set(perPage.errs)]) addProblem(e);
    /* 资源失败里带「提示·」前缀的是探针自己打断的，只进提示不进问题 */
    for (const e of [...new Set(perPage.fails)]) (e.indexOf('提示·') === 0 ? addHint : addProblem)(e);
  }
  console.log('  【手机档】' + mobile + ' 页（预期 ' + mobileExpect + '，含她的数据与登录态）' + (mobile !== mobileExpect ? ' ⚠️ 有 ' + (mobileExpect - mobile) + ' 页没测成' : ''));

  /* ---------- B. 深态交互专项（每项都要有可观测证据；控件没找到 = 计问题） ---------- */
  let deep = 0, deepExpected = 0;
  const deepTask = async (name, fn) => {
    /* 10/18 22:5x 修：IELTS_DEEP_ONLY 是逗号分隔的多项子串（调试「只跑某几项」），
       之前只按单个子串 indexOf 匹配，传三项就全被跳过 → 分母显示 0/0、报告看不出跑没跑。 */
    const only = DEEP_ONLY.split(',').map(s => s.trim()).filter(Boolean);
    if (only.length && !only.some(s => name.indexOf(s) >= 0)) { report.深态[name] = { 结果: '按 IELTS_DEEP_ONLY 跳过' }; return; }
    deepExpected++;
    report.深态[name] = { 结果: '未执行' };
    try {
      const r = await fn();
      report.深态[name] = r;
      if (r && r.ok) { deep++; console.log('  OK   ' + name + (r.evidence ? '  <<< ' + r.evidence : '')); }
      else {
        const why = (r && r.why) || '没通过';
        addProblem('深态·' + name + '：' + why);
        console.log('  FAIL ' + name + '  <<< ' + why);
      }
    } catch (e) {
      const why = String(e.message).split('\n')[0].slice(0, 110);
      addProblem('深态·' + name + '：探针崩了 ' + why);
      console.log('  FAIL ' + name + '  <<< 探针崩了 ' + why);
    }
  };
  const shot = async (pg, n) => { const f = path.join(SHOTS, '深态__' + n + '.png'); await pg.screenshot({ path: f, fullPage: true }).catch(() => {}); return path.basename(f); };

  if (!SKIP_DEEP) {
    /* 1+2+3 设置页：主题开关形态 / 切换外观 / 两个勾选行 */
    await deepTask('设置页·主题开关形态', async () => {
      await gotoWithRetry(pD, LIVE + '/settings'); await sleep(STEP); await stripOverlay(pD);
      const measure = async () => pD.evaluate(() => {
        const inp = document.querySelector('#sThemeToggle');
        const box = document.querySelector('.theme-switch .theme-switch__container') || document.querySelector('.theme-switch__container');
        if (!inp) return { found: false, why: '找不到 #sThemeToggle' };
        if (!box) return { found: false, why: '找不到开关的可见轨道 .theme-switch__container' };
        const r = box.getBoundingClientRect(), ir = inp.getBoundingClientRect(), cs = getComputedStyle(inp);
        return {
          found: true, w: Math.round(r.width), h: Math.round(r.height),
          inpW: Math.round(ir.width), inpH: Math.round(ir.height), appearance: cs.appearance,
          nativeVisible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 && ir.width > 8 && ir.height > 8,
          hasCss: [...document.querySelectorAll('link[rel="stylesheet"]')].some(l => (l.getAttribute('href') || '').indexOf('css/p/settings.css') >= 0),
        };
      });
      const hard = await measure();
      /* 从别的页软导航回来（她的真实路径），再量一次。
         10/18 22:4x：改为点侧栏真实条目 a.side-item（头像链接不可见会假失败），
         并把「到底软导航成功没有」记进结果，避免再出现「探针路径点错」的假绿/假红。 */
      const go1 = await navGo(pD, 'timer.html');
      const go2 = await navGo(pD, 'settings.html');
      const soft = await measure();
      if (!soft.found) {
        /* 说不清是「软导航坏了」还是「探针点的路径不对」→ 先把现场证据抓全，别直接判网站有问题 */
        const dbg = await pD.evaluate(() => ({
          file: window._hubCurrentFile || location.pathname,
          mainLen: (document.querySelector('main') && document.querySelector('main').innerHTML || '').length,
          bodyLen: (document.body.innerText || '').length,
          navLinks: [...document.querySelectorAll('#mainNav a.side-item')].map(a => a.getAttribute('href')),
          css: [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href')),
          styles: [...document.querySelectorAll('style[data-hub-style]')].map(s => s.getAttribute('data-hub-style')),
        })).catch(e => ({ err: String(e.message).slice(0, 80) }));
        return { ok: false, 硬导航: hard, 软导航: soft, 软导航过程: { 去timer: go1, 回settings: go2 }, 现场: dbg,
          why: '软导航后找不到 #sThemeToggle 或其轨道（现场已记入明细，别急着判网站有问题）' };
      }
      const sized = soft.w >= 24 && soft.w <= 110 && soft.h >= 14 && soft.h <= 56;
      const nativeHidden = !soft.nativeVisible;
      return {
        ok: sized && nativeHidden && soft.hasCss, 硬导航: hard, 软导航: soft,
        evidence: '轨道 ' + soft.w + '×' + soft.h + 'px，原生勾选框' + (nativeHidden ? '已隐藏' : '还在（灰点）') + '，专属样式表' + (soft.hasCss ? '在' : '丢'),
        why: !soft.hasCss ? '软导航后本页专属样式表没跟着来（这正是她截图里「控件炸成灰点」的病根）'
          : !sized ? ('开关轨道尺寸不对 ' + soft.w + '×' + soft.h + 'px（应为 24~110 × 14~56）')
          : '原生勾选框直接露出来了（' + soft.inpW + '×' + soft.inpH + '，appearance=' + soft.appearance + '）',
      };
    });
    await deepTask('设置页·主题切换', async () => {
      const before = await pD.evaluate(() => getComputedStyle(document.body).backgroundColor + '|' + document.documentElement.getAttribute('data-theme'));
      await pD.click('.theme-switch__container', { timeout: 6000 }).catch(() => {});
      await sleep(700);
      const after = await pD.evaluate(() => getComputedStyle(document.body).backgroundColor + '|' + document.documentElement.getAttribute('data-theme'));
      const file1 = await shot(pD, '设置页_切换主题后');
      await pD.click('.theme-switch__container', { timeout: 6000 }).catch(() => {});  /* 还原 */
      await sleep(500);
      return { ok: before !== after, before, after, 截图: file1,
        why: '点了开关但页面外观完全没变（背景色与主题标记都没动）' };
    });
    await deepTask('设置页·勾选行', async () => {
      const res = await pD.evaluate(() => {
        const out = [];
        for (const id of ['sChime', 'sAdhd']) {
          const el = document.getElementById(id);
          if (!el) { out.push(id + ':缺'); continue; }
          const b = el.checked; el.click();
          out.push(id + ':' + b + '→' + el.checked);
          el.click();   /* 还原 */
        }
        return out;
      });
      const okAll = res.every(s => /→/.test(s) && !/缺/.test(s) && s.split('→')[0] !== s.split('→')[1]);
      return { ok: okAll, 详情: res, 截图: await shot(pD, '设置页_开关行'), why: '勾选行点了状态不变或控件缺失：' + res.join(' ') };
    });
    /* 4 口语模考：计时条形态（她看到的"巨型圆弧"） */
    await deepTask('口语模考', async () => {
      /* 10/18 二测：硬导航进口语页 → 点侧栏去 timer → 再点回 speaking（全走真实软导航） */
      await gotoWithRetry(pD, LIVE + '/speaking'); await sleep(STEP); await stripOverlay(pD);
      const spGo1 = await navGo(pD, 'timer.html');
      const spGo2 = await navGo(pD, 'speaking.html');
      const css = await pD.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => (l.getAttribute('href') || '')).filter(h => h.indexOf('css/p/') >= 0));
      /* 10/19 00:0x 三修（关键）：上一轮翻转载为空 + viewHidden=true → **MOCK 分支压根没被触发**，
         即 pD.click('#spMockJumpBtn') 被自己的 .catch(()=>{}) 吞掉（按钮不可见/被遮 → playwright 等 8s 超时）。
         而「截图里看得到模考内容」是伪证：那张图是在探针强制 removeAttribute('hidden') **之后**拍的，
         考官/Part1/15:00 都是 speaking.html 的静态标记，天然就在 —— 不能拿来证明考试起来了。
         现在：① 记录点击的真实报错；② 点不动就回退点 #tabs 里那个隐藏的 MOCK tab（产品自己的入口）；
         ③ 两招都不行才判失败，并把报错写进结论。 */
      let clickErr = '';
      await pD.click('#spMockJumpBtn', { timeout: 8000 }).catch(e => { clickErr = String(e && e.message).split('\n')[0].slice(0, 120); });
      await sleep(1500);
      if (clickErr) {
        const tabOk = await pD.evaluate(() => { const b = document.querySelector('#tabs [data-type="MOCK"]'); if (!b) return false; b.click(); return true; });
        clickErr += ' | 回退点 MOCK tab: ' + (tabOk ? '已点' : 'tab 不存在');
        await sleep(1500);
      }
      await sleep(2000);
      /* 10/18 23:5x 取证：谁在模考开始后把 main 换掉了？——上一轮截图证据：
         舞台明明渲染过（考官/Part1/整场剩余 15:00 都在画面里），但轮询时 #mockStage 又是 hidden、
         题库列表同时可见 → 怀疑 speaking.js ready 末尾的程序化 BANK tab 点击 / 云同步重渲染
         在 __mockEnter 之后又跑了一遍。装 MutationObserver 记录 #mockStage 显隐翻转
         与 main 被替换的时刻线。 */
      const mutLog = await pD.evaluate(() => {
        window.__deepMut = [];
        const obs = new MutationObserver(muts => {
          for (const m of muts) {
            if (m.type === 'attributes' && (m.target.id === 'mockStage' || m.target.id === 'mockView')) {
              window.__deepMut.push({ t: Date.now(), ev: 'attr:' + m.target.id, hidden: m.target.hasAttribute('hidden') });
            }
            if (m.type === 'childList' && m.removedNodes.length) {
              for (const n of m.removedNodes) {
                if (n.nodeType === 1 && (n.id === 'mockView' || n.id === 'mockStage')) window.__deepMut.push({ t: Date.now(), ev: 'removed:' + n.id });
              }
            }
          }
        });
        obs.observe(document.getElementById('main') || document.body, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
        return 'armed';
      });
      /* 10/18 23:0x 修：mock.js / mock-report.js / mock-history.js 是 10/17 性能批改的**按需加载**
         （speaking.html:1948 data-late-src）。探针 2.5s 后就量 DOM，脚本往往还没到位
         → #mockView 虽被显示但 #mockStage 还是 hidden，#mockTimerWrap 不存在于文档里
         → 报「找不到计时条」。这不是产品问题，是探针没等按需脚本。
         10/18 23:4x 二修：25s 轮询仍不够——线上实测渲染完成点落在 25s 窗口之后（截图里舞台明明在）。
         放宽到 60s、每秒一查，并记录「等了多少秒」+ mock.js 是否已暴露 __mockEnter，
         供「脚本没加载」与「真没渲染」区分。 */
      const t0 = Date.now();
      let stageReady = false, mockScriptReady = false;
      for (let i = 0; i < 60; i++) {
        const st = await pD.evaluate(() => ({
          stage: (() => { const s = document.getElementById('mockStage'); return !!s && !s.hasAttribute('hidden'); })(),
          script: typeof window.__mockEnter === 'function'
        })).catch(() => ({ stage: false, script: false }));
        stageReady = st.stage; mockScriptReady = st.script;
        if (stageReady) break;
        await sleep(1000);
      }
      const stageWaitMs = Date.now() - t0;
      const flips = await pD.evaluate(() => (window.__deepMut || []).slice(-30)).catch(() => []);
      const mockStateNow = await pD.evaluate(() => ({
        mockState: !!(window.__mockTick || document.getElementById('mockStage')),
        viewHidden: (document.getElementById('mockView') || {}).hasAttribute ? document.getElementById('mockView').hasAttribute('hidden') : null,
        stageHidden: (document.getElementById('mockStage') || {}).hasAttribute ? document.getElementById('mockStage').hasAttribute('hidden') : null,
        totalTimerText: (document.getElementById('mockTotalTimer') || {}).textContent || '',
      })).catch(() => ({}));
      const entered = await pD.evaluate(() => {
        const v = document.getElementById('mockView');
        return !!v && !v.hasAttribute('hidden');
      });
      /* 只在「mockStage 真的没渲染」时才强制显示（脚本没到位 → 舞台 hidden）；
         一旦 stageReady 就不动 DOM，保证量到的是产品真实状态。 */
      const forcedOn = !stageReady;
      if (forcedOn) await pD.evaluate(() => ['mockView', 'mockStage'].forEach(id => { const e = document.getElementById(id); if (e) e.removeAttribute('hidden'); }));
      /* 两个计时部件在真实流程里要等「有计时的题」才出现 → 这里强制显示后再量尺寸，只为测它们的样式
         （红线：强制显示必须在报告里标明，不许当成交互通过）。 */
      const forced = await pD.evaluate(async () => {
        let n = 0;
        ['mockTotalTimerWrap', 'mockTimerWrap'].forEach(id => {
          const e = document.getElementById(id);
          if (e && (e.hasAttribute('hidden') || e.classList.contains('hidden'))) { e.removeAttribute('hidden'); e.classList.remove('hidden'); n++; }
        });
        await new Promise(r => setTimeout(r, 500));
        return n;
      });
      const m = await pD.evaluate(() => {
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const one = document.getElementById('mockTimerWrap');
        const tot = document.getElementById('mockTotalTimerWrap');
        return {
          hasWrap: !!one, hasSvg: !!(one && one.querySelector('svg')), hasTotal: !!tot,
          oneSvg: box(one && one.querySelector('svg')), oneBar: box(one),
          totSvg: box(tot && tot.querySelector('svg')), totBar: box(tot),
          totText: tot ? (tot.innerText || '').replace(/\s+/g, ' ').slice(0, 40) : '',
          iw: window.innerWidth, sw: document.documentElement.scrollWidth,
        };
      });
      const file1 = await shot(pD, '口语模考_计时部件');
      if (!stageReady) return { ok: false, 强制显示: forced, 舞台渲染: false, 等舞台: stageWaitMs + 'ms', mock脚本就绪: mockScriptReady, 舞台翻转载: flips, 当前态: mockStateNow, 截图: file1,
        why: '点了「模考」60 秒后 #mockStage 仍未渲染（mock 脚本就绪=' + mockScriptReady + '，点击报错=' + (clickErr || '无') + '）—— 脚本没加载或有点击报错 = 探针问题；脚本就绪且点到了却没渲染 = 产品问题' };
      if (!m.hasWrap || !m.hasSvg) return { ok: false, 强制显示: forced, 舞台渲染: true, 截图: file1, why: '模考视图里找不到单题计时条或其图形（#mockTimerWrap）' };
      if (!m.hasTotal || !m.totSvg) return { ok: false, 强制显示: forced, 舞台渲染: true, 截图: file1, why: '找不到整场计时条或其时钟图形（#mockTotalTimerWrap）' };
      const oneOk = m.oneSvg.w > 0 && m.oneSvg.h > 0 && m.oneSvg.w <= 48 && m.oneSvg.h <= 48;
      const totSvgOk = m.totSvg.w > 0 && m.totSvg.h > 0 && m.totSvg.w <= 48 && m.totSvg.h <= 48;
      const totBarOk = m.totBar.w <= m.iw + 1 && m.totBar.h <= 120;
      const ovf = m.sw > m.iw + 1;
      const cssOk = css.some(h => h.indexOf('speaking.css') >= 0);
      const why = !cssOk ? ('软导航后本页专属样式表没跟着来（当前只有 ' + JSON.stringify(css) + '）—— 这正是她截图里「计时圆弧占半屏」的病根')
        : !oneOk ? ('单题计时条的时钟图形 ' + m.oneSvg.w + '×' + m.oneSvg.h + 'px（应 ≤48px；被撑大就是样式没约束住）')
          : (!totSvgOk ? ('整场计时条的时钟图标 ' + m.totSvg.w + '×' + m.totSvg.h + 'px（本该 15×15 上下；手机上看到的「巨型圆弧」就是这里，尺寸由 css/p/speaking.css 的 .mock-total-timer svg 决定）')
            : (!totBarOk ? ('整场计时条 ' + m.totBar.w + '×' + m.totBar.h + 'px 超出可用范围') : (ovf ? '模考页出现横向溢出' : '')));
      return {
        ok: !why, 强制显示: forced, 舞台渲染: stageReady, 等舞台: stageWaitMs + 'ms', 强制显示过视图: forcedOn, 软导航过程: { 去timer: spGo1, 回speaking: spGo2 }, 软导航后样式表: css,
        单题计时: m.oneSvg.w + '×' + m.oneSvg.h, 整场计时图标: m.totSvg.w + '×' + m.totSvg.h,
        整场计时条: m.totBar.w + '×' + m.totBar.h, 计时文案: m.totText, 截图: file1, why: why || '两处计时部件尺寸正常',
      };
    });
    /* 5 bank 考场：进一套题 → 打开设置面板 */
    await deepTask('考场页', async () => {
      await gotoWithRetry(pD, LIVE + '/bank'); await sleep(STEP); await stripOverlay(pD);
      await pD.click('#partTabs .pill-tab[data-part="Part 1"]', { timeout: 8000 }).catch(() => {});
      await sleep(900);
      await pD.locator('.bank-item').first().click({ timeout: 8000 }).catch(() => {});
      /* 第一次进考场会先弹一张「考前操作指南」卡（#exGuide 挂在 body 上，题库条目那一下已经触发过闸门）：
         不点掉它考场不会渲染 —— 这一步是新机器/新账号的必经路径。 */
      let okExam = false, guide = false;
      for (let i = 0; i < 20; i++) {
        const st = await pD.evaluate(() => ({ exam: !!document.querySelector('#examRoot .ex-group'), guide: !!document.getElementById('exGuide') }));
        if (st.exam) { okExam = true; break; }
        if (st.guide) { guide = true; await pD.click('#exGuide [data-exgclose]', { timeout: 4000 }).catch(() => {}); }
        await sleep(400);
      }
      await sleep(700);
      const file1 = await shot(pD, '考场页_做题界面');
      if (!okExam) return { ok: false, 指南卡: guide, 截图: file1, why: '点了题库第一项但考场没起来（#examRoot .ex-group 没出现）' };
      const m = await pD.evaluate(async () => {
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const mb = document.querySelector('#examRoot .ex-menubtn');
        const mbBox = box(mb);
        if (mb) mb.click();
        await new Promise(r => setTimeout(r, 500));
        const op = document.getElementById('exOptionPanel');
        return {
          groups: document.querySelectorAll('#examRoot .ex-group').length,
          fsSvg: box(document.querySelector('#exFsBtn svg')), hideSvg: box(document.querySelector('#exHideBtn svg')),
          mbBox, opOn: !!(op && (op.classList.contains('on') || op.offsetParent !== null)), opBox: box(op),
          opRows: document.querySelectorAll('#exOptionPanel .ex-oprow').length, iw: window.innerWidth,
        };
      });
      const f2 = await shot(pD, '考场页_Option面板');
      await pD.click('#exOptionPanel [data-opclose]', { timeout: 4000 }).catch(() => {});
      const probs = [];
      if (!m.mbBox || m.mbBox.w === 0) probs.push('顶栏找不到 ☰ Option 按钮（全屏 / 隐藏计时 / Option 三个工具住同一行）');
      if (m.fsSvg && (m.fsSvg.w > 48 || m.fsSvg.h > 48)) probs.push('全屏或隐藏计时的图标 ' + m.fsSvg.w + '×' + m.fsSvg.h + 'px 尺寸异常');
      if (!m.opOn) probs.push('点了 ☰ Option 面板没打开');
      else if (!m.opBox || m.opBox.w <= 0 || m.opBox.w > m.iw + 1) probs.push('Option 面板尺寸异常（' + (m.opBox ? m.opBox.w + '×' + m.opBox.h : '量不到') + '）');
      else if (m.opRows < 2) probs.push('Option 面板里选项行只有 ' + m.opRows + ' 个（Colour / Size 两行应该都在）');
      return {
        ok: probs.length === 0, 题组: m.groups, 指南卡: guide,
        工具图标: (m.fsSvg ? m.fsSvg.w + '×' + m.fsSvg.h : '缺'), 面板: m.opOn ? '已打开' : '没打开',
        面板尺寸: m.opBox ? m.opBox.w + '×' + m.opBox.h : '—', 选项行: m.opRows,
        截图: f2, why: probs.join('；') || '考场与 Option 面板正常',
      };
    });
    /* 6~8 三个组页（手机档）：进组页 → 点第一张「真卡片」（a.hubg-card）→ 落地必须真的换了页
       10/18 现场修：原先取「main 里第一个 a[href]」，线上点到过当前页自己的卡/别的链接 →
       不动也算失败。改成只认真卡片、并优先挑「不是当前页」的那张；落地用轮询等，最多 20 秒。 */
    for (const g of ['plans-hub', 'study', 'me']) {
      await deepTask('组页·' + g, async () => {
        await gotoWithRetry(pM, LIVE + '/' + g); await sleep(STEP); await stripOverlay(pM);
        const before = await pM.evaluate(() => {
          const main = document.querySelector('#main') || document.querySelector('main');
          const cur = String(window._hubCurrentFile || location.pathname).replace(/^.*\//, '').replace(/\.html$/, '');
          const cards = main ? [...main.querySelectorAll('a.hubg-card[href]')].filter(c => c.offsetParent !== null) : [];
          return {
            file: window._hubCurrentFile || location.pathname,
            主区存在: !!main,
            正文: main ? (main.innerText || '').replace(/\s+/g, ' ').trim().length : -1,
            n: cards.length,
            卡: cards.slice(0, 4).map(c => ({
              href: c.getAttribute('href'),
              txt: (c.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20),
              self: String(c.getAttribute('href')).replace(/\.html$/, '') === cur,
            })),
          };
        });
        const file1 = await shot(pM, '组页_' + g);
        const target = before.卡.filter(c => c.href && !c.self)[0] || before.卡[0] || null;
        if (!target) return { ok: false, 卡片数: before.n, 主区存在: before.主区存在, 正文: before.正文, 截图: file1,
          why: '组页里找不到真卡片（a.hubg-card），卡片数 ' + before.n + '（主区 ' + before.正文 + ' 字）' };
        const clicked = await pM.evaluate((href) => {
          const list = [...document.querySelectorAll('a.hubg-card[href]')].filter(c => c.getAttribute('href') === href && c.offsetParent !== null);
          if (!list.length) return false;
          list[0].click(); return true;
        }, target.href);
        if (!clicked) return { ok: false, 卡片数: before.n, 卡片: target.href, 截图: file1, why: '找到了卡片但点不动（href=' + target.href + '）' };
        /* 线上软导航要真的落定：轮询 20 秒，不依赖 _softNavBusy（它不一定被置位） */
        await pM.waitForFunction((f) => {
          const now = window._hubCurrentFile || location.pathname;
          return now !== f;
        }, before.file, { timeout: 20000 }).catch(() => {});
        await sleep(1200);
        const after = await pM.evaluate(() => ({ file: window._hubCurrentFile || location.pathname, len: (document.querySelector('main') && document.querySelector('main').innerText || '').length }));
        const changed = after.file !== before.file;
        return { ok: changed && after.len > 60, 卡片数: before.n, 点的是: target.href, 从: before.file, 到: after.file, 落地正文: after.len, 截图: await shot(pM, '组页_' + g + '_落地'),
          why: '点了卡片 ' + target.href + '（' + target.txt + '）但页面没真的换（还在 ' + before.file + '，正文 ' + after.len + ' 字）' };
      });
    }
    /* 9 学习页（study 组页 + 学习页正文）：组页点击进去的落地页要正常，且专属样式表跟着走 */
    await deepTask('学习页', async () => {
      await gotoWithRetry(pM, LIVE + '/study'); await sleep(STEP); await stripOverlay(pM);
      const css0 = await pM.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => (l.getAttribute('href') || '')).filter(h => h.indexOf('css/p/') >= 0));
      /* 组页点第一张卡落地（她的真实路径） */
      const target = await pM.evaluate(() => {
        const a = [...document.querySelectorAll('a.hubg-card[href]')].filter(x => x.offsetParent !== null)[0];
        if (!a) return null;
        const href = a.getAttribute('href');
        a.click();
        return href;
      });
      await pM.waitForFunction(() => {
        const now = window._hubCurrentFile || location.pathname;
        return now.indexOf('study') < 0;
      }, null, { timeout: 20000 }).catch(() => {});
      await sleep(2200);
      const css1 = await pM.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => (l.getAttribute('href') || '')).filter(h => h.indexOf('css/p/') >= 0));
      const m = await pM.evaluate(() => {
        const main = document.querySelector('#main') || document.querySelector('main') || document.body;
        const items = [...main.querySelectorAll('li, .card, tr, .wrong-item')].filter(e => (e.innerText || '').trim().length > 4 && e.offsetParent !== null);
        const bad = items.filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 12; }).length;
        return { n: items.length, bad, len: (main.innerText || '').length };
      });
      const file1 = await shot(pM, '学习页_组页落地');
      const cssOk = css1.length > 0 && JSON.stringify(css1) !== JSON.stringify(css0);
      return { ok: cssOk && (m.n > 0 || m.len > 60) && m.bad === 0, 组页样式: css0, 落地样式: css1, 条目: m.n, 正文: m.len, 截图: file1,
        why: !cssOk ? ('落地后专属样式表没换（还是 ' + JSON.stringify(css1) + '）—— 她截图里「学习页字都糊成一团」的病根')
          : m.bad ? ('有 ' + m.bad + ' 个条目高度 <12px（塌成一条线）')
          : (m.len <= 60 ? '落地页正文太少（' + m.len + ' 字）' : '') || '正常' };
    });
    /* 10 错题本（手机）：要么列表项尺寸正常，要么空态文案可见 */
    await deepTask('错题本', async () => {
      await gotoWithRetry(pM, LIVE + '/wrongbook'); await sleep(STEP); await stripOverlay(pM);
      const m = await pM.evaluate(() => {
        const main = document.querySelector('#main') || document.querySelector('main') || document.body;
        const items = [...main.querySelectorAll('li, .card, tr, .wrong-item')].filter(e => (e.innerText || '').trim().length > 4 && e.offsetParent !== null);
        const empty = /还没有|暂无|空空|去练习|没有错题/.test(main.innerText || '');
        const bad = items.filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 12; }).length;
        return { n: items.length, empty, bad, len: (main.innerText || '').length };
      });
      const file1 = await shot(pM, '错题本');
      return { ok: (m.n > 0 || m.empty) && m.bad === 0 && m.len > 40, 条目: m.n, 空态: m.empty, 截图: file1,
        why: m.bad ? ('有 ' + m.bad + ' 个条目高度 <12px（塌成一条线）') : '错题本既没条目也没空态文案（主区 ' + m.len + ' 字）' };
    });
  }

  /* ---------- C. 结论 ---------- */
  const pageDenom = desktop + mobile;
  const denom = pageDenom + (SKIP_DEEP ? 0 : deepExpected);
  /* 10/18 深态从 9 项改 10 项（新增「学习页（组页落地）专属样式表跟着走」）→ 完整口径 21×2+10 = 52 */
  const OK_DENOM = ALL_PAGES.length * 2 + 10;
  console.log('  【分母自检】桌面 ' + desktop + '（预期 ' + PAGES.length + '）；手机 ' + mobile + '（预期 ' + PAGES.length + '）；深态 ' + deep + '/' + deepExpected + '（预期 10）');

  /* ★ 10/19：没测成的页必须单列，且结论里明确「这些页没有结论」——
     不许像 22:05 那次那样，浏览器崩了后剩下 10 页静默消失、报告看起来还是「全绿」。 */
  if (NOT_TESTED.length) {
    console.log('  ⚠️【没测成】' + NOT_TESTED.length + ' 项（这些**没有结论**，既不算通过也不算失败）：');
    NOT_TESTED.forEach(n => console.log('      · ' + n.viewport + ' ' + n.file + ' —— ' + n.reason));
  } else {
    console.log('  【没测成】0 项');
  }

  console.log('  【结果】问题 ' + problems.length + ' / ' + denom + (denom === OK_DENOM ? '' : '（⚠️ 完整口径应为 ' + OK_DENOM + '，本次是限定范围跑）'));
  /* ★ 视觉判据独立成段（她要的报告口径）：遮挡 / 主区空白 / 慢页 / 资源失败 / 交互没反应 */
  const vis = { 遮挡: [], 主区空白: [], 慢页: [], 资源失败: [], 交互没反应: [] };
  problems.forEach(p => {
    if (/遮挡/.test(p)) vis.遮挡.push(p);
    else if (/主区空白|骨架屏\/加载卡住/.test(p)) vis.主区空白.push(p);
    else if (/慢页/.test(p)) vis.慢页.push(p);
    else if (/资源失败/.test(p)) vis.资源失败.push(p);
    else if (/^深态·/.test(p)) vis.交互没反应.push(p);
  });
  const visTotal = Object.keys(vis).reduce((n, k) => n + vis[k].length, 0);
  console.log('  【视觉判据】共 ' + visTotal + ' 条（分母：' + denom + '）');
  for (const k of Object.keys(vis)) {
    const arr = vis[k];
    console.log('    · ' + k + '：' + arr.length + ' 条');
    arr.slice(0, 12).forEach(p => console.log('        ⚠️ ' + p));
    if (arr.length > 12) console.log('        …另有 ' + (arr.length - 12) + ' 条，见明细 JSON');
  }
  for (const p of problems.slice(0, 40)) console.log('  ⚠️ ' + p);
  console.log('  【提示】（不算问题，但值得看）' + (hints.length ? '\n' + hints.slice(0, 25).map(h => '    · ' + h).join('\n') : ' 无'));

  /* ★ 10/19 她要求：打印「每页原始测量值」摘要 —— 报 0 问题时也能核对。
     每页一行：页@档 | 单页秒 | 浮层 | 底部死区 | 主区字数 | 溢出 | 判定 */
  console.log('  【每页测量值】共 ' + Object.keys(report.页面).length + ' 页（含通过页，便于核对）：');
  Object.keys(report.页面).sort().forEach(k => {
    const r = report.页面[k];
    if (!r || !r.测量) { console.log('    ' + k + ' | 无测量值' + (r && r.问题 && r.问题.length ? ' | ' + r.问题[0] : '')); return; }
    const m = r.测量;
    const fl = (m.浮层 || []).map(o => o.what).join('+') || '无';
    console.log('    ' + k + ' | ' + (m.单页耗时ms / 1000).toFixed(1) + 's | 浮层:' + fl +
      ' | 死区:' + (m.底部死区px != null ? m.底部死区px + 'px' : '?') +
      ' | 主区:' + (m.主区 ? m.主区.textLen + '字' : '?') +
      ' | 溢出:' + (m.横向溢出px > 0 ? m.横向溢出px + 'px' : '0') +
      ' | ' + m.判定);
  });

  let shotN = 0; try { shotN = fs.readdirSync(SHOTS).filter(f => /\.(png|jpe?g)$/i.test(f)).length; } catch (e) {}
  console.log('  【截图】' + shotN + ' 张 → design/深度体检截图/');
  report.结论 = { 问题: problems.length, 分母: denom, 完整口径: OK_DENOM, 深态通过: deep, 深态预期: deepExpected,
    没测成: NOT_TESTED, 视觉判据: Object.keys(vis).reduce((o, k) => (o[k] = vis[k].length, o), {}),
    每页测量值: Object.keys(report.页面).reduce((o, k) => { const r = report.页面[k]; o[k] = r && r.测量 ? r.测量 : null; return o; }, {}) };
  /* 10/19 补：problems / hints 一直被收集、也被用来算退出码，却**从不落盘** ——
     于是 _deep_audit.json 只有「问题：20」这个数字，没有那 20 条是什么。
     （逐页原因在 报告.页面[<key>].问题 里有，但键没带上页面名的条目——如页面报错、
       深态项——只在这个总表里。）读明细定位问题时会因此白找一圈。 */
  report.问题 = problems;
  report.提示 = hints;
  fs.writeFileSync(MANIFEST, JSON.stringify(report, null, 1), 'utf8');
  console.log('  【明细】' + path.relative(ROOT, MANIFEST).replace(/\\/g, '/'));

  await ctxD.close().catch(() => {});
  await br.close().catch(() => {});
  /* 没测成 = 没跑全，也算「不通过」（退出码 1），绝不放行成 0 */
  const bad = problems.length > 0 || denom !== OK_DENOM || deep !== deepExpected || NOT_TESTED.length > 0;
  process.exit(bad ? 1 : 0);
})().catch(e => {
  console.log('  🔴 探针自己崩了：' + String(e && e.message).split('\n')[0].slice(0, 160));
  process.exit(4);
});