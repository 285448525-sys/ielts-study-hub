/* 共享 UI：导航注入、主题、Toast、通用工具 */
/* 统一 teal 线性 SVG 图标（替换原 emoji），stroke=currentColor 跟随侧栏配色 */
const ICON = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  timer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  plans:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
  meds:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 20.5a4.95 4.95 0 11-7-7l7-7a4.95 4.95 0 017 7z"/><path d="M8.5 8.5l7 7"/></svg>',
  practice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-1.5-7 0v12c2-1.5 5-1.5 7 0 2-1.5 5-1.5 7 0V6c-2-1.5-5-1.5-7 0z"/><path d="M12 6v12"/></svg>',
  corpus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="13" width="4" height="7" rx="1.5"/><rect x="17.5" y="13" width="4" height="7" rx="1.5"/></svg>',
  words:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  /* 10/12 22:16 她指出话筒/气泡用反了：话筒天生是口语的，模考换「试卷」文件图标 */
  speaking:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  mock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7V3z"/><path d="M14 3v5h5"/><path d="M10 12h6M10 16h6"/></svg>',
  writing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  review:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4v16h15"/><path d="M9 14v4M13 10v8M17 6v12"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  wrongbook:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M9 7l1.5 3 3 .5-2 2 .5 3-3-1.5-3 1.5.5-3-2-2 3-.5z"/></svg>',
  /* teacher（10-22 三级权限第二批）：人 + 加号 —— 「管理名单里的人」，只对管理员显示 */
  teacher:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-1.6c0-2-1.7-3.6-3.8-3.6H6.8C4.7 14.8 3 16.4 3 18.4V20"/><circle cx="9.5" cy="8" r="3.4"/><path d="M17 11.5h4M19 9.5v4"/></svg>',
  /* vip：钻石图标 stroke 写死金色（转化入口要跟学习模块区分开；不动 CSS 免全站 bump） */
  vip:'<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>'
};

/* ⭐ 9/30：学习主页从 index.html 改名为 home.html（根 / 交给落地页 landing）。
   软导航 / 侧栏高亮 / 部署探针 / 兜底跳转全部以这里为准，改文件名必须先改本表。 */
const PAGES = [
  { id:'index',     file:'home.html',       icon:ICON.home,      name:'首页',       desc:'今日概览' },
  { id:'timer',     file:'timer.html',     icon:ICON.timer,     name:'计时',   desc:'选模块开计时' },
  { id:'plans',     file:'plans.html',     icon:ICON.plans,     name:'计划',   desc:'每日清单 + AI 排周' },
  { id:'practice',  file:'practice.html',  icon:ICON.practice,  name:'单词',       desc:'学习与管理你的单词' },
  // 三合一入口：长难句 + 错题 + 听写（原听力 corpus + 词句 errorbook 合并）
  { id:'corpus',    file:'corpus.html',    icon:ICON.corpus,    name:'句子', desc:'长难句 · 错题 · 听写' },
  { id:'speaking',  file:'speaking.html',  icon:ICON.speaking,  name:'口语', desc:'题库 + AI 串题' },
  // Repair Drill：中文+错句 → 自己 repair 正确版，AI 只当裁判（design/06）
  // ⚠️ id 必须与文件名一致（软导航按 js/{id}.js 找主脚本），不能用缩写 pdrill
  /* 句型闯关已并入口语页「练习」tab（2026-09-09 之之拍板），主导航不再单列入口；
     pattern-drill.html 保留为独立直达页 */
  { id:'writing',   file:'writing.html',   icon:ICON.writing,   name:'写作',       desc:'模板 + AI 评分' },
  // 10/11：题库 → 「模考」大 tab（她拍板：四科模考统一在这里完成）
  { id:'bank',      file:'bank.html',      icon:ICON.mock,      name:'模考',       desc:'阅读 · 听力 · 写作 · 口语' },
  { id:'wrongbook', file:'wrongbook.html', icon:ICON.wrongbook, name:'错句本',     desc:'写作/语料默写错句汇总' },
  { id:'review',    file:'review.html',    icon:ICON.review,    name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'vip',       file:'vip.html',       icon:ICON.vip,       name:'会员',       desc:'AI 无限用 + 专属权益' },  // 10/1 付费方案：非学习功能，不进 PRIMARY_NAV
  { id:'settings',  file:'settings.html',  icon:ICON.settings,  name:'设置',       desc:'同步 / AI / 数据' },
  { id:'meds',      file:'meds.html',      icon:ICON.meds,      name:'服药',   desc:'专注达药效窗口' },  // ← 移到最后
  /* 10/4 18:42 她拍板「我就要一整个界面就行了」：三个组页（真实页面，不是弹出的浮层）。
     id 必须与文件名一致（软导航按 js/{id}.js 找主脚本）→ 组页共用 js/hubgroup.js，
     所以在 PAGES 里显式声明 hubScript:'hubgroup'，由软导航那段特殊处理。 */
  { id:'plans-hub', file:'plans-hub.html', icon:ICON.plans,     name:'计划组', desc:'计划 + 计时' },
  { id:'study',     file:'study.html',     icon:ICON.practice,  name:'学习组', desc:'单词 · 口语 · 写作 · 句子' },
  { id:'me',        file:'me.html',        icon:ICON.settings,  name:'我的组', desc:'回顾 · 会员 · 设置' },
  /* 2026-10-22 三级权限第二批：老师端「学生数据」（只读看绑定学生）。
     ⚠️ 这里登记 = 软导航按 id 找 js/teacher.js + 搜索/组页卡能查到它；
        但它**不在 PRIMARY_NAV / MORE_NAV 里** → 侧栏是否出现由角色决定（见 injectNav 末尾）。
     铁律：不在任何入口文案里承诺「老师能改学生数据」—— 整页只读。 */
  { id:'teacher',   file:'teacher.html',   icon:ICON.teacher,  name:'学生数据', desc:'绑定学生的学情（只读）' }
];

/* 收藏页面（⭐）——侧边栏「常用」与首页「快捷入口」共用同一份，永远同步。
   从未收藏过时给 3 个新手默认项，避免入口空着。 */
const DEFAULT_FAV = ['timer','practice','speaking'];
/* 服药模块开关（9/15 之之：设置页「启用『服药』模块」→ 选是才启用服药模块）。
   默认开启 = 历史用户已有入口，不因新增开关而凭空消失；关闭后入口从侧栏/更多/搜索/收藏全部隐藏，
   已记录的服药数据一律保留，随时可再开启。判定只认显式 false，undefined/true 都算开。 */
/* 服药模块开关：判定只认显式 true，undefined/false 都算关（9/21 翻转：可选模块默认不对新人露出）。
   老用户（已有服药记录）由 data.js migrateMedsDefault 一次性显式开启。已记录数据一律保留，随时可再开启。 */
function medsModuleOn(){ return !!(DATA.settings && DATA.settings.adhd === true); }
function favPageIds(){
  const f = DATA.settings && DATA.settings.fav;
  const list = (f && f.length) ? f : DEFAULT_FAV.slice();
  return medsModuleOn() ? list : list.filter(id => id !== 'meds');
}

/* v5：简化后全部平铺，不再分折叠组（首页→回顾 一级；设置/服药 在分隔线下方）
   10/12 22:16 她拍板「模考优先」重排（原：计时/计划两个工具排在内容模块前面 = 工具压过正餐）：
   模考（站内最大资产 415 篇真题 + 「30 秒练上第一题」落点）→ 口语/写作（AI 核心卖点）→
   单词（每日习惯）→ 句子 → 计划/计时（工具归位）→ 回顾。分隔线下方不变。 */
const PRIMARY_NAV = ['index','bank','speaking','writing','practice','corpus','plans','timer'];
/* 10/1 付费方案：vip 放分隔线下方首位（销售入口显眼但不挤占学习导航；她看过效果可再调位置） */
const MORE_NAV    = ['vip','review','meds','settings'];
const TAB_NAV     = ['index','timer','practice','speaking'];   // 旧 tabbar 主项（组件已删，仅用于计算「更多」弹层要收纳哪些页面）
// 底部 Tab 标签覆盖：practice 在站内含「单词」，但原型/验收确认为「背词」，单独对齐（不改 PAGES 以免影响桌面侧栏）
const TAB_LABEL   = { practice:'背词' };

/* ===== design/113A3a 落地批：home.html 专属顶栏（胶囊导航 + A3b 搜索框）=====
   落地顺序（她 10-21 拍板「先做这个」）：先首页+顶栏胶囊，再分页逐个换壳 →
   本分支只在 current==='home.html' 时走，其他页仍渲染原侧栏（一行未动）。
   软导航跨边界（home↔其他页）由 common-shell.js softNavigate 触发 injectNav 重建换壳。
   顶栏样式只在 css/p/home.css（本批仅 home 用；其他页换壳时再上搬 common.css）。
   搜索框复用侧栏那套 AI 智能搜索（同 id：#sideSearch/#ssPanel/#ssList + bindSideSearch），
   行为零分叉；A3b 的形态差异只在 CSS（186px 紧凑框 + Ctrl K 角标）。 */
function topBarHtml(current){
  const pageById = id => PAGES.find(p => p.id === id);
  const _AV_SET = new Set(['user-f1','user-f2','user-f3','user-f4','user-m1','user-m2','user-m3','user-m4']);
  const _avRaw = (typeof DATA !== 'undefined' && DATA.settings) ? DATA.settings.avatar : '';
  const _avMe2 = 'img/avatars/' + (_AV_SET.has(_avRaw) ? _avRaw : 'user-f1') + '.svg';
  const _meEl = authToken()
    ? '<a class="tb-me" href="settings.html" title="换头像" aria-label="换头像"><img src="' + _avMe2 + '" alt=""></a>'
    : '<a class="tb-me tb-me--guest" href="login.html" title="去登录" aria-label="去登录">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg></a>';
  // 胶囊 8 项 = design/113A3 原样：首页/模考/口语/写作/单词/句子/计划/更多（计时进「更多」）
  let caps = '';
  for(const pid of PRIMARY_NAV){
    if(pid === 'timer') continue;
    const p = pageById(pid); if(!p) continue;
    caps += '<a class="tb-item' + (p.file === current ? ' on' : '') + '" href="' + p.file + '" data-id="' + p.id + '">' + escapeHtml(p.name) + '</a>';
  }
  // 「更多」面板 = 侧栏 MORE_NAV + 计时 + 错句本（服药模块未开不出现）
  let moreItems = '';
  for(const pid of ['timer','wrongbook','review','vip','settings','meds']){
    if(pid === 'meds' && !medsModuleOn()) continue;
    const p = pageById(pid); if(!p) continue;
    moreItems += '<a class="tb-more-item' + (p.file === current ? ' on' : '') + '" href="' + p.file + '" data-id="' + p.id + '">'
      + '<span class="tm-ic">' + p.icon + '</span><span>' + escapeHtml(p.name) + '</span></a>';
  }
  /* 三级权限（10-22）：管理员在首页顶栏「更多」里也要能进「学生数据」 */
  if(hubIsAdmin()){
    const tp = pageById('teacher');
    if(tp) moreItems += '<a class="tb-more-item' + (tp.file === current ? ' on' : '') + '" href="' + tp.file + '" data-id="' + tp.id + '">'
      + '<span class="tm-ic">' + tp.icon + '</span><span>' + escapeHtml(tp.name) + '</span></a>';
  }
  return '<a class="tb-logo" href="home.html"><i aria-hidden="true">雅</i><span>IELTS</span></a>'
    + '<nav class="tb-caps" aria-label="主导航">' + caps
    + '<div class="tb-more">'
    + '<button class="tb-item tb-more-btn" id="tbMoreBtn" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="tbMorePanel">更多'
    + '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></button>'
    + '<div class="tb-more-panel" id="tbMorePanel" hidden>' + moreItems + '</div>'
    + '</div></nav>'
    + '<div class="tb-right">'
    + '<div class="tb-search">'
    + '<svg class="ui-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input class="ui-search-input" type="text" id="sideSearch" placeholder="搜索功能、单词、句子" aria-label="搜索" autocomplete="off" title="输入中文搜功能；输入英文单词 AI 查词" />'
    + '<kbd aria-hidden="true">Ctrl K</kbd>'
    + '<div class="ss-panel" id="ssPanel" hidden><div id="ssList"></div></div>'
    + '</div>'
    + '<div class="side-timer-wrap" id="sideTimer"></div>'
    + _meEl
    + '</div>';
}

function bindTopBar(){
  // Ctrl/Cmd+K 聚焦顶栏搜索（A3b）：全文档只绑一次，导航重建不叠监听
  if(!window.__hubCmdKBound){
    window.__hubCmdKBound = true;
    document.addEventListener('keydown', (e) => {
      if((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')){
        const inp = document.getElementById('sideSearch');
        if(inp){ e.preventDefault(); try{ inp.focus(); inp.select(); }catch(_){} }
      }
    });
  }
  const btn = document.getElementById('tbMoreBtn');
  const panel = document.getElementById('tbMorePanel');
  if(btn && panel){
    const setOpen = open => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('on', open);
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(panel.hidden);
    });
    // 点面板外 / Escape 收起；点面板内条目后由软导航换页（导航重建自然收起）
    document.addEventListener('click', (e) => {
      if(panel.hidden) return;
      if(!e.target.closest('.tb-more')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && !panel.hidden){ setOpen(false); btn.focus(); }
    });
  }
}

/* ===== 三级权限（10-22 第二批）：入口显隐 =====
   🔴 角色**绝不进 DATA**（DATA 整份上云、本机可改）；这里缓存的只是**服务端回的结论**，
      用途仅限「要不要显示入口」，**不承担鉴权** —— 真正的门在 functions/api/roles.js（fail closed）。
   缓存键独立（hub_role_v1），服务端回包 no-store；取消管理员后下一次进页面缓存就会被改回 user。
   为什么要有缓存：injectNav() 是同步渲染，而 /api/roles 是异步的 —— 没有同步值就永远画不出入口。 */
const ROLE_CACHE_KEY = 'hub_role_v1';
let _roleFetching = null, _roleFetchedAt = 0;

function hubRoleCached(){
  try{
    if(typeof authToken === 'function' && !authToken()) return '';
    const r = String(localStorage.getItem(ROLE_CACHE_KEY) || '');
    return (r === 'teacher' || r === 'root') ? r : '';
  }catch(e){ return ''; }
}
function hubIsAdmin(){ return !!hubRoleCached(); }

/* 侧栏「学生数据」右上角那枚「只读」小标签的样式：
   只为一条导航项动全站 common.css 不值得（要 20 页一起 bump），
   这里自注入 —— 与 feedback.js 的 #fbStyle 同一套做法。 */
function injectRoleNavStyle(){
  if(document.getElementById('hubRoleNavStyle')) return;
  try{
    const st = document.createElement('style');
    st.id = 'hubRoleNavStyle';
    st.textContent =
      '.side-item .side-ro{margin-left:auto;flex:none;font-size:9.5px;font-weight:800;'
      + 'color:var(--primary-text);background:var(--surface);border:1px solid var(--primary-100);'
      + 'border-radius:20px;padding:0 5px;letter-spacing:.02em;line-height:15px}'
      + '.side-collapsed .side-item .side-ro{display:none}'
      + '@media(max-width:860px){.side-item .side-ro{display:none}}';
    document.head.appendChild(st);
  }catch(e){}
}

/* 拉一次自己的角色；变了才重建外壳（避免无谓的侧栏重绘 + 高亮闪烁） */
function hubRefreshRole(){
  try{
    if(typeof authToken !== 'function' || !authToken()) return Promise.resolve('');
    if(_roleFetching) return _roleFetching;
    if(_roleFetchedAt && Date.now() - _roleFetchedAt < 30000) return Promise.resolve(hubRoleCached());
    const before = hubRoleCached();
    _roleFetching = fetch('/api/roles?action=me', {
      headers: { 'X-Session': authToken() },
      cache: 'no-store'
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const raw = (j && typeof j.role === 'string') ? j.role : '';
        const now = (raw === 'teacher' || raw === 'root') ? raw : '';
        try{ localStorage.setItem(ROLE_CACHE_KEY, raw || 'user'); }catch(e){}
        _roleFetchedAt = Date.now();
        if(now !== before){
          try{ injectNav(); }catch(e){}
          try{ window.dispatchEvent(new CustomEvent('hub:role', { detail: { role: now } })); }catch(e){}
        }
        return now;
      })
      .catch(() => hubRoleCached());
    _roleFetching.then(() => { _roleFetching = null; });
    return _roleFetching;
  }catch(e){ return Promise.resolve(hubRoleCached()); }
}

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed && !document.body.classList.contains('hub-home')) document.body.classList.add('side-collapsed');
  const current = _hubCurrentFile || normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  _hubCurrentFile = current;   // 记住真实当前页，供软导航期间被 injectNav 复用（pathname 此时滞后）
  const pageById = id => PAGES.find(p => p.id === id);

  /* design/113A3a：home 走顶栏分支（body.hub-home 让 common.css 的 288px 左侧留白退掉） */
  if(current === 'home.html'){
    document.body.classList.add('hub-home');
    nav.className = 'hub-topbar';
    nav.setAttribute('aria-label', '顶部导航');
    nav.innerHTML = topBarHtml(current);
    bindTopBar();
    bindSideSearch();     // 顶栏搜索 = 侧栏那套 AI 智能搜索（同 id，逻辑零分叉）
    renderSideTimer();    // 全局计时徽标（顶栏右侧常驻）
    return;
  }
  document.body.classList.remove('hub-home');
  /* ⚠️ 必须显式复位外壳 class：软导航从 home 过来时 nav.className 还是 'hub-topbar'，
     只换 innerHTML 不换 class → 侧栏内容被塞进 44px 固定顶栏（探针 homea3a 首轮实锤）。 */
  nav.className = 'top-nav';
  nav.removeAttribute('aria-label');

  let html = '';
  /* 10/3 头像选择：侧栏品牌位右侧加一枚用户头像（点它跳设置页选头像）。
     ⚠️ 这里**内联解析**而不是依赖 window.avUserSrc —— 因为 common.js 早于 av-picker.js 执行
       （av-picker 只在 settings/speaking 引，侧栏是全站 14 页都要显示的）。
       读 DATA.settings.avatar 存的文件名，非法/未设回退默认；**只存文件名不存图片**。
     10/13 她无痕截图报「左上角那块有 bug」：根因 = 未登录也渲染默认头像（陌生默认女头像
       冒出来，且点了跳设置页=未登录用户没有「选头像」的意义）。改为**登录态才显示头像**；
       未登录 = 同尺寸「登录」入口（人头线条图标，跳 login.html）——侧栏本来没有登录路径，
       未登录用户只能从落地页/settings 找登录，这个位正好补上。 */
  const _AV_SET = new Set(['user-f1','user-f2','user-f3','user-f4','user-m1','user-m2','user-m3','user-m4']);
  const _avRaw = (typeof DATA !== 'undefined' && DATA.settings) ? DATA.settings.avatar : '';
  const _avMe2 = 'img/avatars/' + (_AV_SET.has(_avRaw) ? _avRaw : 'user-f1') + '.svg';
  const _meEl = authToken()
    ? '<a class="side-me" href="settings.html" title="换头像" aria-label="换头像"><img src="' + _avMe2 + '" alt=""></a>'
    : '<a class="side-me side-me--guest" href="login.html" title="去登录" aria-label="去登录">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg></a>';
  html += '<div class="side-head">'
    + '<span class="side-brand-mark" aria-hidden="true"><svg viewBox="0 0 512 512" width="40" height="40" fill="none" style="display:block" aria-hidden="true"><g fill="#ffffff" stroke="#ffffff" stroke-width="38" stroke-linejoin="round" stroke-linecap="round"><path d="M256 136 L344 194 L256 252 L168 194 Z"/><path d="M160 304 L212 304 L256 362 L300 304 L352 304 L352 354 Q352 394 256 394 Q160 394 160 354 Z"/></g></svg></span>'
    + '<div class="side-brand"><span class="bn">IELTS</span><span class="bs">雅思备考站</span></div>'
    + _meEl
    + '<button id="sideCollapseIn" class="side-collapse-in" type="button" aria-label="收起侧边栏" title="收起侧边栏">⟨</button>'
    + '</div>';
  // 方案1：全局计时徽标容器（任何页面常驻；计时进行中显示呼吸徽标 + 一键结束，解决 P1/P3）
  html += '<div class="side-timer-wrap" id="sideTimer"></div>';
  // AI 智能搜索：输入中文搜站内功能跳转；输入英文单词/词组 AI 查词并自动入词库
  html += '<div class="side-search-wrap">'
    + '<div class="ui-search">'
    + '<svg class="ui-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input class="ui-search-input" type="search" id="sideSearch" placeholder="搜功能 / 查单词" aria-label="搜索" autocomplete="off" title="输入中文搜功能；输入英文单词 AI 查词" /></div>'
    + '<div class="ss-panel" id="ssPanel" hidden><div id="ssList"></div></div>'
    + '</div>';

  // v5：全部平铺无折叠 —— 首页→回顾 一级；设置/服药 在分隔线下方
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '<div class="side-sep" role="separator"></div>';
  for(const pid of MORE_NAV){
    if(pid === 'meds' && !medsModuleOn()) continue;    // 服药模块未开启 → 侧栏不出现
    const p = pageById(pid); if(p) html += sideItem(p, current);
  }
  /* 三级权限（10-22）：管理员（机构教师 / 系统管理员）才多一格「学生数据」。
     普通用户 / 未登录 → 一个字都不出现（页面本身另有 fail-closed 门，这里只是别给假入口）。 */
  if(hubIsAdmin()){
    const tp = pageById('teacher');
    if(tp){
      injectRoleNavStyle();
      html += '<div class="side-sep" role="separator"></div>'
        + '<a class="side-item' + (tp.file === current ? ' active' : '') + '" href="' + tp.file + '"'
        + ' data-name="' + escapeHtml(tp.name) + '" data-id="' + tp.id + '">'
        + '<span class="nav-icon">' + tp.icon + '</span><span class="side-label">' + escapeHtml(tp.name) + '</span>'
        + '<span class="side-ro">只读</span></a>';
    }
  }
  /* 10/5 她 14:36 要求：侧栏/抽屉不再单独挂「意见反馈」入口，**收进设置页最后一个分组**。
     理由 = 设置页本来就是「个人配置 + 账号 + 反馈」的地方，侧栏条目越加越长反而不是核心功能。
     ⚠️ 移动端「更多」抽屉（MORE_NAV 那条）**保留** —— 抽屉在窄屏是主导航，
        反馈从抽屉里挪走会让手机用户找不到入口。桌面侧栏（下面这条）删掉。 */
  html += '</div>';
  nav.innerHTML = html;
  bindSidebar();
  bindSideSearch();   // AI 智能搜索（功能跳转 + AI 查词）
  renderSideTimer();   // 方案1：注入/刷新全局计时徽标（有活动会话才显示）
}

/* ===== 侧边栏 AI 智能搜索：中文搜功能跳转 + 英文 AI 查词自动入词库 ===== */
const SIDE_SEARCH_PAGES = [
  { id:'index',     kw:'首页 主页 概览 今日 overview' },
  { id:'timer',     kw:'计时 计时器 番茄钟 专注 时钟 timer' },
  { id:'plans',     kw:'计划 任务 清单 待办 每日 周计划 排程 plan' },
  { id:'practice',  kw:'单词 背单词 背词 词库 词汇 练习 学习 word' },
  { id:'corpus',    kw:'句子 长难句 错题 听写 语料 翻译 解码 sentence' },
  { id:'speaking',  kw:'口语 题库 串题 跟读 影子 part1 part2 part3 speaking' },
  { id:'writing',   kw:'写作 作文 模板 真题 评分 大作文 小作文 task1 task2 writing' },
  { id:'bank',      kw:'模考 题库 机考 刷题 真题 阅读 听力 写作 口语 练习 mock bank' },
  { id:'wrongbook', kw:'错句本 错句 默写 wrong' },
  { id:'review',    kw:'回顾 复习 成绩 模考 记录 轨迹 历史 看板 review' },
  { id:'settings',  kw:'设置 配置 同步 api key 账号 数据 导出 导入 settings' },
  { id:'meds',      kw:'服药 用药 药 专注达 健康 药效 meds' },
  /* 三级权限（10-22）：只对管理员可见，ssMatchPages 里按角色过滤 */
  { id:'teacher',   kw:'学生 数据 学情 老师 教师 机构 管理员 学员 students teacher' }
];
let _ssAiToken = 0;   // 查词请求序号：过期响应直接丢弃
let _ssAiBusy = false;
let _ssAiQuery = '';  // design/83：在飞请求的查询词（归一后），同词再回车防重复、异词顶替

function ssNormQuery(q){ return String(q || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function ssHasCn(q){ return /[\u4e00-\u9fff]/.test(q); }

function ssMatchPages(q){
  if(!q) return [];
  const hits = [];
  for(const p of SIDE_SEARCH_PAGES){
    if(p.id === 'meds' && !medsModuleOn()) continue;    // 服药模块未开启 → 搜索不命中
    if(p.id === 'teacher' && !hubIsAdmin()) continue;   // 老师端只对管理员可搜（10-22）
    const page = PAGES.find(x => x.id === p.id);
    if(!page) continue;
    const hay = (page.name + ' ' + p.kw + ' ' + (page.desc || '')).toLowerCase();
    if(hay.indexOf(q) !== -1) hits.push(page);
    if(hits.length >= 6) break;
  }
  return hits;
}

/* 词性归一化（words.js normPos 的内置精简版，全站可用） */
function ssNormPos(s){
  s = String(s || '').trim().toLowerCase();
  if(!s) return '';
  const dict = { n:'n.', noun:'n.', 名词:'n.', v:'v.', verb:'v.', 动词:'v.', adj:'adj.', adjective:'adj.', 形容词:'adj.',
    adv:'adv.', adverb:'adv.', 副词:'adv.', prep:'prep.', 介词:'prep.', conj:'conj.', 连词:'conj.',
    pron:'pron.', 代词:'pron.', num:'num.', 数词:'num.', int:'int.', 感叹词:'int.', art:'art.', 冠词:'art.' };
  const parts = s.split(/[;/,、\s]+/).map(x => x.trim()).filter(Boolean);
  const out = parts.map(x => dict[x.replace(/\.$/, '')] || dict[x] || (/^(n|v|adj|adv|prep|conj|pron|num|int|art)\.$/.test(x) ? x : '')).filter(Boolean);
  return Array.from(new Set(out)).join(';');
}

/* ===== 单词墓碑（9/17）=====
   背景：practice.js 的「已掌握」与 words.js 的 deleteWord 会往 DATA.deletedIds 写 'en:'+小写
   作为墓碑，mergeData 的 out.words 每轮合并都按墓碑过滤 → 已掌握/已删的词不会从云端复活。
   此前只有 words.js 的三条导入路径查墓碑，另外四条「显式加词」入口（corpus/errorbook 的
   「加入词库」、侧边搜索 AI 查词、通用 ssNewWord 调用方）完全没查 → 后果是「加进去了、
   toast 也说了成功，下次合并（最长 30s）就被墓碑静默抹掉」，看起来就是同步丢了词。
   口径（两条并行、不得混用）：
   - 批量导入（AI 导入 / Excel / 粘贴）→ 命中墓碑就跳过，计数进「跳过已掌握 N 个」；
   - 显式单个加词（点按钮收这一个词）→ 视为明确的「我要把它加回来」，撤销墓碑再加。 */
function wordTombKey(en){ return 'en:' + String(en || '').trim().toLowerCase(); }
function isWordTombstoned(en){
  return (DATA.deletedIds || []).indexOf(wordTombKey(en)) >= 0;
}
function addWordTombstone(en){
  const k = wordTombKey(en);
  DATA.deletedIds = Array.isArray(DATA.deletedIds) ? DATA.deletedIds : [];
  if(!DATA.deletedIds.includes(k)) DATA.deletedIds.push(k);
  // 反向墓碑必须一并撤销：否则这个词一旦「加回来」过，就再也删不掉了
  if(Array.isArray(DATA.revivedIds)){
    const i = DATA.revivedIds.indexOf(k);
    if(i >= 0) DATA.revivedIds.splice(i, 1);
  }
}
function clearWordTombstone(en){
  const k = wordTombKey(en);
  let hit = false;
  if(Array.isArray(DATA.deletedIds)){
    const i = DATA.deletedIds.indexOf(k);
    if(i >= 0){ DATA.deletedIds.splice(i, 1); hit = true; }
  }
  // 光删本机 deletedIds 不够：另一端那份会在下一次合并里被 union 回来、把词再次抹掉
  // （探针 ⑨b 复现：A 撤了墓碑，B 一推又回来了）。
  // revivedIds 与 deletedIds 同口径随同步 union 传播，合并时按 deleted \ revived 生效。
  DATA.revivedIds = Array.isArray(DATA.revivedIds) ? DATA.revivedIds : [];
  if(!DATA.revivedIds.includes(k)) DATA.revivedIds.push(k);
  return hit;
}

/* 新建词条（newWordV12 的内置版，结构与词库 v1.2 完全一致；练习页在线时优先复用） */
function ssNewWord(en, cn){
  if(typeof newWordV12 === 'function'){
    try{ const w = newWordV12(en, cn); if(w) return w; }catch(_){}
  }
  return { id: uid(), en: en, cn: cn || '', ts: Date.now(), level: 0, nextReview: todayKey(),
    errTotal: 0, errStreak: 0, hardWord: false, okStreak: 0, lastReview: null, keyWord: false,
    cleared: false, shortCount: 0, lastShortTouch: null, cleanRounds: 0, pos: '', ipa: '' };
}

function bindSideSearch(){
  const input = document.getElementById('sideSearch');
  const panel = document.getElementById('ssPanel');
  const list = document.getElementById('ssList');
  if(!input || !panel || !list) return;

  function show(){ panel.hidden = false; }
  function hide(){ panel.hidden = true; }

  function renderMatch(){
    const q = ssNormQuery(input.value);
    /* 10/1 晚（她拍板）：空输入（刚点搜索框还没打字）不弹白色提示框——面板只在有实际内容时出现 */
    if(!q){ list.innerHTML = ''; hide(); return; }
    const hits = ssMatchPages(q);
    const isEn = q && !ssHasCn(q);
    let html = '';
    if(isEn){
      html += '<button class="ss-item ss-ai" type="button" data-ai="1" title="AI 查询释义并加入词库">'
        + '<span class="ss-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>'
        + '<span>AI 查词「' + escapeHtml(q) + '」</span><span class="ss-hint">回车</span></button>';
    }
    for(const p of hits){
      html += '<button class="ss-item" type="button" data-file="' + p.file + '">'
        + '<span class="ss-ico">' + p.icon + '</span><span class="ss-name">' + escapeHtml(p.name) + '</span>'
        + '<span class="ss-desc">' + escapeHtml(p.desc || '') + '</span></button>';
    }
    if(!html && !q) html = '<div class="ss-empty">输入中文搜功能跳转；输入英文单词 AI 查词（自动加入词库）</div>';
    else if(!html) html = '<div class="ss-empty">没有匹配的功能' + (isEn ? '，可回车用 AI 查这个词' : '') + '</div>';
    // design/83：结果卡归属词——输入新词（未回车）时旧词的结果卡丢弃；空 query 不保留任何卡
    const card = list.querySelector('.ss-card');
    const keep = (card && q && card.dataset.word === q) ? card.outerHTML : '';
    list.innerHTML = html + keep;
    show();
  }

  function ssCardHtml(inner, word){
    return '<div class="ss-card"' + (word ? ' data-word="' + escapeHtml(word) + '"' : '') + '>' + inner + '</div>';
  }

  async function aiLookup(word){
    const wq = ssNormQuery(word);
    // design/83：查词进行中再回车——同词忽略防重复；异词不拦截，新请求顶替旧请求
    // （旧响应返回时 `token !== _ssAiToken` 判定已会丢弃，finally 也按 token 复位 _ssAiBusy）
    if(_ssAiBusy && wq === _ssAiQuery){ return; }
    _ssAiQuery = wq;
    _ssAiBusy = true;
    const token = ++_ssAiToken;
    let card = list.querySelector('.ss-card');
    const loading = ssCardHtml('<div class="sc-cn muted">AI 正在查询「' + escapeHtml(word) + '」…</div>', wq);
    if(card) card.outerHTML = loading; else list.insertAdjacentHTML('beforeend', loading);
    show();
    try{
      const messages = [
        { role:'system', content:
'你是雅思词库助手。查询用户给的英文单词或词组，只输出严格 JSON（不要 markdown 围栏、不要解释）：\n'
+ '{"en":"原词小写","ipa":"英式音标，如 /ɡɪv ʌp/，查不到留空字符串","pos":"词性缩写，多个用;分隔（如 n. 或 n.;v.），词组留空字符串","cn":"简明中文释义；多词性时按词性顺序用；分隔对应"}' },
        { role:'user', content: word }
      ];
      const content = await callRelay('words', messages, 0.3);
      if(token !== _ssAiToken) return;
      const r = aiJson(content);
      if(!r || !r.en || !r.cn) throw new Error('AI 返回格式异常，请稍后重试');
      const en = String(r.en).trim().toLowerCase();
      const cn = String(r.cn).trim();
      const pos = ssNormPos(r.pos);
      const ipa = String(r.ipa || '').trim();
      if(!en) throw new Error('AI 返回的单词为空');
      let existed = false;
      let dup = null;
      let addedId = null;   // design/83：本次新加入词的 id（撤销按钮用；复活词同样走新增分支）
      (DATA.words || []).forEach(w => { if(String(w.en || '').trim().toLowerCase() === en) dup = w; });
      // 已掌握/已删除（墓碑）：显式对它 AI 查词 = 明确的「加回来」→ 撤销墓碑，不再被下次合并抹掉
      const _revived = !dup && isWordTombstoned(en) && clearWordTombstone(en);
      if(dup){
        existed = true;
        if(!dup.pos && pos) dup.pos = pos;
        if(!dup.ipa && ipa) dup.ipa = ipa;
        if(!dup.cn && cn) dup.cn = cn;
      } else {
        const w = ssNewWord(en, cn);
        w.pos = pos; w.ipa = ipa;
        DATA.words.push(w);
        addedId = w.id;
      }
      hubSave();
      const tag = existed ? '✓ 已在词库（释义已补全）'
        : (_revived ? '✓ 已重新加入词库（已从「已掌握」移回）' : '✓ 已自动加入词库（去「单词」页可背诵）');
      // design/83：喇叭朗读（复用全站 speakQuestion，en-GB）+ 操作行（去背词 / 撤销加入）
      const speakBtn = '<button class="sc-speak" type="button" data-speak="' + escapeHtml(en) + '" aria-label="朗读">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg></button>';
      const inner = '<div class="sc-head"><span class="sc-en">' + escapeHtml(en) + '</span>' + speakBtn
        + (ipa ? '<span class="sc-ipa">' + escapeHtml(ipa) + '</span>' : '') + '</div>'
        + '<div class="sc-cn">' + (pos ? '<b>' + escapeHtml(pos) + '</b> ' : '') + escapeHtml(cn) + '</div>'
        + '<div class="sc-tag">' + tag + '</div>'
        + '<div class="sc-actions">'
        + '<button class="ss-item sc-link" type="button" data-file="practice.html">去背词页背诵 →</button>'
        + (!existed ? '<button class="ss-item sc-link" type="button" data-undo-en="' + escapeHtml(en) + '" data-undo-id="' + escapeHtml(String(addedId || '')) + '">撤销（不加入词库）</button>' : '')
        + '</div>';
      card = list.querySelector('.ss-card');
      if(card) card.outerHTML = ssCardHtml(inner, wq);
      toast(existed ? '「' + en + '」已在词库' : (_revived ? '「' + en + '」已重新加入词库' : '「' + en + '」已加入词库'));
    }catch(e){
      if(token !== _ssAiToken) return;
      const msg = (e && e.message) ? e.message : '查询失败';
      let inner = '<div class="sc-err">「' + escapeHtml(word) + '」查询失败：' + escapeHtml(msg) + '</div>';
      card = list.querySelector('.ss-card');
      if(card) card.outerHTML = ssCardHtml(inner, wq);
    }finally{
      if(token === _ssAiToken) _ssAiBusy = false;
    }
  }

  input.addEventListener('focus', renderMatch);
  input.addEventListener('input', renderMatch);
  /* design/83：type=search 原生 × 只触发 search 不触发 input，结果清空后面板要跟着回空态。
     注意 Chrome 里 Escape 也会清值并触发 search——Escape 分支刚把面板关掉 + blur，
     此刻 input 已失焦，必须跳过重渲染，否则面板被 search 事件重新弹开。 */
  input.addEventListener('search', () => {
    if(document.activeElement !== input) return;
    renderMatch();
  });
  // design/83：面板内可键盘选择的项（排除结果卡里的动作按钮，只含 ss-ai 查词条 + 功能跳转项）
  function ssNavItems(){
    return Array.prototype.filter.call(list.querySelectorAll('.ss-item'), el => !el.closest('.ss-card'));
  }
  function ssClearActive(){
    list.querySelectorAll('.ss-active').forEach(el => el.classList.remove('ss-active'));
  }
  function gotoFile(f){ hide(); input.value = ''; location.href = f; }

  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;   // design/83：中文输入法组词中不拦截方向键/回车
    const nav = ssNavItems();
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if(!nav.length) return;
      e.preventDefault();
      let idx = nav.findIndex(el => el.classList.contains('ss-active'));
      if(e.key === 'ArrowDown') idx = (idx + 1) % nav.length;                       // 循环下移，不越界
      else idx = (idx <= 0 ? nav.length - 1 : idx - 1);                             // 循环上移
      ssClearActive();
      nav[idx].classList.add('ss-active');
      nav[idx].scrollIntoView({ block:'nearest' });
      return;
    }
    if(e.key === 'Enter'){
      const q = ssNormQuery(input.value);
      if(!q) return;
      const active = list.querySelector('.ss-item.ss-active');
      if(active){
        if(active.dataset.file){ gotoFile(active.dataset.file); return; }
        if(active.dataset.ai){ if(!ssHasCn(q)) aiLookup(q); return; }
      }
      if(ssHasCn(q)){
        const hits = ssMatchPages(q);
        if(hits[0]){ gotoFile(hits[0].file); }
        return;
      }
      aiLookup(q);   // 英文：AI 查词
    } else if(e.key === 'Escape'){
      ssClearActive();
      hide(); input.blur();
    }
  });
  panel.addEventListener('mousedown', (e) => {
    const fileBtn = e.target.closest('[data-file]');
    if(fileBtn){
      e.preventDefault();
      gotoFile(fileBtn.dataset.file);
      return;
    }
    const aiBtn = e.target.closest('[data-ai]');
    if(aiBtn){
      e.preventDefault();
      const q = ssNormQuery(input.value);
      if(q && !ssHasCn(q)) aiLookup(q);
    }
  });
  /* design/83：结果卡动作（喇叭朗读 / 撤销加入）——click 委托 + stopPropagation */
  panel.addEventListener('click', (e) => {
    const sp = e.target.closest('.sc-speak');
    if(sp){
      e.stopPropagation();
      speakQuestion.speak(sp.dataset.speak || '', sp);
      return;
    }
    const undoBtn = e.target.closest('[data-undo-en]');
    if(undoBtn){
      e.stopPropagation();
      const en = undoBtn.dataset.undoEn || '';
      const wid = undoBtn.dataset.undoId || '';
      if(wid){
        const idx = (DATA.words || []).findIndex(w => w.id === wid);
        if(idx >= 0) DATA.words.splice(idx, 1);   // 移除本次新增的词条（按 push 时记录的 id）
      }
      addWordTombstone(en);   // 打墓碑（内部同步清 revivedIds），云同步不会把词 union 回来
      hubSave();
      const c = undoBtn.closest('.ss-card');
      if(c) c.outerHTML = '<div class="ss-card"><div class="sc-cn">已撤销，「' + escapeHtml(en) + '」不会进入背词列表</div></div>';
      toast('已撤销，「' + en + '」不会进入背词列表');
    }
  });
  document.addEventListener('click', (e) => {
    if(!panel.hidden && !e.target.closest('.side-search-wrap')) hide();
  });
}

/* ===== 考试页 Option 面板（☰ 菜单：Colour / Size）=====
   10/12 样子稿 104 v4 统一落地：bank.html 做题页与 writing.html 写作页共用同一份壳
   （shellHtml/examShellHtml 注入 .ex-menubtn / .ex-option），但 writing.html 不加载 bank.js
   → 交互必须放 common.js（全站都加载），否则写作页 ☰ 点不动。
   Colour = name=exCt（整屏反色，类挂 #examRoot）/ Size = name=exTs（三档字号，挂 .ex-split）。*/
window.showOptSub = function(which){
  var main = document.getElementById('exOptMain');
  var subC = document.getElementById('exOptColour');
  var subS = document.getElementById('exOptSize');
  var back = document.querySelector('.ex-opback');
  if(main) main.style.display = which ? 'none' : '';
  if(subC) subC.style.display = which === 'colour' ? 'block' : 'none';
  if(subS) subS.style.display = which === 'size' ? 'block' : 'none';
  if(back) back.style.display = which ? '' : 'none';
  var h3 = document.querySelector('#exOptionPanel h3');
  if(h3) h3.textContent = which === 'colour' ? 'Colour' : which === 'size' ? 'Size' : 'Option';
};
document.addEventListener('click', (e) => {
  var t = e.target, el;
  if((el = t.closest && t.closest('.ex-menubtn'))){
    var op = document.getElementById('exOptionPanel');
    if(op){ op.classList.toggle('on'); window.showOptSub(null); }
    return;
  }
  if(t.closest && t.closest('[data-opclose]')){
    var op2 = document.getElementById('exOptionPanel');
    if(op2) op2.classList.remove('on');
    return;
  }
  if(t.closest && t.closest('[data-opback]')){ window.showOptSub(null); return; }
  if((el = t.closest && t.closest('.ex-oprow[data-sub]'))){ window.showOptSub(el.getAttribute('data-sub')); return; }
  /* 点面板空白处（target 是面板本身，而非列表/按钮）→ 关闭 */
  if(t.classList && t.classList.contains('ex-option')){
    t.classList.remove('on');
    return;
  }
});
document.addEventListener('change', (e) => {
  var t = e.target;
  if(t.matches && t.matches('#examRoot [name="exTs"]')){
    var sp = document.getElementById('exSplit'); if(!sp) return;
    sp.classList.toggle('ts-large', t.value === 'large');
    sp.classList.toggle('ts-xl', t.value === 'xl');
    sp.style.setProperty('--exfs', t.value === 'large' ? '23px' : t.value === 'xl' ? '27px' : '');
    var p1 = document.getElementById('exOptionPanel');
    if(p1) p1.classList.remove('on');   /* 选完字号立即关面板 —— 面板是 inset:0 全屏覆盖层，不关会挡住后面所有点击（v4 实测踩坑） */
    return;
  }
  if(t.matches && t.matches('#examRoot [name="exCt"]')){
    var root = document.getElementById('examRoot'); if(!root) return;
    root.classList.toggle('ct-dark', t.value === 'dark');
    root.classList.toggle('ct-yellow', t.value === 'yellow');
    var p2 = document.getElementById('exOptionPanel');
    if(p2) p2.classList.remove('on');
    return;
  }
});

/* ===== 全站玻璃底栏 dock（移动端 ≤860px 显示，作为移动端主底部导航；桌面用侧栏，不显示）===== */
/* ==========================================================================
   10/4 17:55 移动端底部 dock 分组重构（她 17:12 提 + 17:54 拍板「甲版」）

   她的原话（17:12）：
     「5 个栏…第一个是首页是确定的，然后把剩下的这些栏就是几个归到一个，然后放在一个页面，
       几个归到一个放一个页面…第二个也可以是计划页，然后第三个页面可以是学习页，
       学习页面点下去之后可以选择背单词、背口语、写作、句子等等，
       哦对，然后计划和计时也可以放在一个板块，就是以此类推」
   拍板（17:54）：**甲版 4 格**；「我的」组**没有错句本**（她不常用），
     服药**平常不开着**所以默认不显示 → 我的组只有 **回顾 / 会员 / 设置** 3 项。

   ── 为什么改（现状的病）──────────────────────────────────────────────
   旧 dock = 4 格 +「更多」，13 个页面里 **8 个全藏在「更多」弹层**（vip/review/corpus/
   writing/timer/settings/meds/wrongbook）—— 句子、写作、计时这些**每天都要用**的页面被埋到
   第二层，找东西要「点更多 → 再找」。她 12:10 报过一次「入口找不到」，这次是彻底重做。

   ── 新的结构（GROUPED_DOCK，单一数据源）──────────────────────────────
     首页   → 直达 home.html（她 17:12 明确「第一个是首页是确定的」）
     计划   → 组：plans / timer（她原话「计划和计时也可以放在一个板块」）
     学习   → 组：practice / speaking / writing / corpus（17:54 拍板：不含计时）
     我的   → 组：review / vip / settings + meds（仅开了服药才出现）

   ── 为什么不进组、当场跳页 ───────────────────────────────────────────
   首页组只有 1 项 → 弹列表是多余的一次点击，直接跳。她 17:54 问「计划要不要也弹列表」，
   选了「弹」→ 计划组虽然只有 2 项也照样弹，保持 4 格交互一致（点哪格都是同一种行为）。

   ── 错句本（wrongbook）去哪了 ───────────────────────────────────────
   她 17:54 明说「我记得我的里面没有这个错句本」—— 但文件真实存在（writing.html 有入口、
   sidebar 也有）。**本轮按她说的从「我的」组移除**，但**不删页面、不删侧栏入口**
   （她自己以后想用还能从侧栏/写作页进）。⚠️ 若她之后发现还需要，加回「我的」组即可。
   ========================================================================== */

/* 分组定义：唯一的结构来源。g.page 存在 = 直达；无 page = 弹组面板。 */
const GROUPED_DOCK = [
  { id:'index',  label:'首页', icon:'<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', page:'index' },
  { id:'plans',  label:'计划', icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/>',
    page:'plans-hub', members:['plans','timer'] },
  { id:'study',  label:'学习', icon:'<path d="M4 19.5V6a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-1.5z"/><path d="M4 19.5A2 2 0 0 1 6 18h13"/>',
    page:'study',     members:['practice','speaking','writing','bank','corpus'] },
  { id:'me',     label:'我的', icon:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    page:'me',        members:['review','vip','settings','meds'] }
];

/* 当前页属于哪个 dock 组 —— injectGlobalDock（首屏高亮）与 updateActiveNav（软导航高亮）
   共同用这一个判定，避免两处口径漂移（漂移过一次：探针从学习组点进 writing.html 后 dock 全灰）。 */
function dockGroupOfPage(file){
  if(!file) return null;
  const byId = id => PAGES.find(x => x.id === id);
  for(const g of GROUPED_DOCK){
    if(g.page && (byId(g.page) || {}).file === file) return g.id;
    if(g.members && g.members.some(m => (byId(m) || {}).file === file)) return g.id;
  }
  return null;
}

function injectGlobalDock(){
  if(document.getElementById('hubDock')) return;
  const current = _hubCurrentFile || normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  const pageById = id => PAGES.find(x => x.id === id);
  const curGroup = dockGroupOfPage(current);

  const svgOf = raw => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + raw + '</svg>';
  let inner = '';
  for(const g of GROUPED_DOCK){
    const on = (g.id === curGroup) ? ' active' : '';
    /* 10/4 18:42 她拍板「我要一整个界面就行了」-> 四格**全部是 <a> 直达整页**：
       首页 -> home.html；计划/学习/我的 -> 各自的组页（plans-hub / study / me）。
       组内模块再由组页里的卡片跳原页面（plans.html / timer.html / …），原页面零改动。 */
    const file = (pageById(g.page) || {}).file || (g.page + '.html');
    inner += '<a class="ui-menu-item dock-group-item' + on + '" href="' + file + '"'
      + ' data-dock-group="' + g.id + '" data-id="' + g.page + '"'
      + ' title="' + g.label + '">'
      + svgOf(g.icon) + '<span>' + g.label + '</span></a>';
  }
  const dock = document.createElement('nav');
  dock.id = 'hubDock';
  dock.className = 'ui-menu ui-menu-grouped';
  dock.setAttribute('aria-label', '快捷导航');
  dock.innerHTML = inner;
  /* 10/8 晚：仅在「真触屏 + 窄屏」设备注入底栏（与 common.css 的媒体条件同口径）。
     电脑端放大到 150% 时宽度虽 <860px，但指针是鼠标 → 不注入、不加 has-dock（连净空都不占）。 */
  const isTouchPhone = (() => { try { return window.matchMedia('(max-width:860px) and (hover:none) and (pointer:coarse)').matches; } catch (e) { return false; } })();
  if (!isTouchPhone) return;
  document.body.appendChild(dock);
  document.body.classList.add('has-dock');

  /* 10/2 dock 重设计（她拍板）：实测 dock 真实高度写进 :root 的 --dock-h。
     全站「内容区净空 / 浮钮锚点 / toast / 额度轻条」一律读这个变量，不写死 88px。
     为什么必须实测：safe-area（iPhone 34 / iPad 20）+ 系统字号放大都会让高度浮动，
     写死数字在真机上必然对不上——本批要消灭的正是「dock 上方 20px 幽灵白带」。
     h > 0 守卫是必须的：沉浸态（模考 / 背词全屏）dock 是 display:none，rect 高 0，
     照写会把 --dock-h 打成 0px 导致净空塌掉。 */
  const syncDockH = () => {
    const h = Math.round(dock.getBoundingClientRect().height);
    if(h > 0) document.documentElement.style.setProperty('--dock-h', h + 'px');
  };
  syncDockH();
  if(window.ResizeObserver) new ResizeObserver(syncDockH).observe(dock);
  window.addEventListener('resize', syncDockH);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(syncDockH, () => {});
}


/* ===== 全站 + 浮动按钮（已砍，9/16 之之反馈不知道它是干嘛的：全站仅计划页有 data-fab-add 接杆，
   且 fab 挂 body 上软导航残留，其他页面点了静默无效 = 死按钮。原 injectFab() 已删。）===== */

/* ===== 列表页即时搜索（.ui-search 组件配套） =====
   用法：<input class="ui-search-input" data-search-input data-search-target="#planList" />
   过滤目标容器内「直接子元素」的文本；空查询恢复全部显示。无匹配选择器时安全跳过。 */
function initListSearch(){
  document.querySelectorAll('[data-search-input]').forEach(inp => {
    const sel = inp.getAttribute('data-search-target');
    if(!sel) return;
    const box = document.querySelector(sel);
    if(!box) return;
    inp.addEventListener('input', () => {
      const q = (inp.value || '').trim().toLowerCase();
      const items = Array.prototype.slice.call(box.children);
      if(!items.length) return;
      items.forEach(it => {
        const hit = !q || (it.textContent || '').toLowerCase().indexOf(q) !== -1;
        it.style.display = hit ? '' : 'none';
      });
    });
  });
}

/* ===== 方案1 · 全局计时徽标（侧边栏常驻，解决 P1 不可见 + P3 跨页结束） =====
   设计红线：徽标只读活动会话状态、不新增任何计时实例；计时/恢复逻辑仍在 timer.js，
   本模块只做"呈现"与"结束"。活动会话来源：优先 window.active（计时页实时对象），
   否则回退 localStorage（loadActive）以覆盖"从未访问计时页、但会话已持久化"的场景。 */
function getActiveSession(){
  if(window.active) return window.active;
  try { return loadActive(); } catch(e){ return null; }
}
/* 轻量刷新：只更新时长数字 + 暂停态，绝不重建 DOM（避免打断停止按钮点击） */
function updateSideTimerBadge(){
  const box = document.getElementById('sideTimer');
  if(!box) return;
  const a = getActiveSession();
  if(!a){
    if(box.childElementCount) box.innerHTML = '';
    if(window.__sideTimerTick){ clearInterval(window.__sideTimerTick); window.__sideTimerTick = null; }
    return;
  }
  /* 显示口径与悬浮条一致：倒计时模式显示剩余时间（floatDisplaySec），否则正计时 */
  const dispSec = floatDisplaySec(a);
  const live = document.getElementById('sideTimerLive');
  if(live) live.textContent = fmtHMS(dispSec);
  const badge = document.getElementById('sideTimerBadge');
  if(badge) badge.classList.toggle('paused', !!a.paused);
}
function ensureSideTimerTick(){
  if(window.__sideTimerTick) return;
  window.__sideTimerTick = setInterval(updateSideTimerBadge, 1000);
}
/* 构建/隐藏徽标；仅在"无→有"过渡时重建 DOM 并绑定事件，避免每秒重建丢事件 */
function renderSideTimer(){
  const box = document.getElementById('sideTimer');
  if(!box) return;
  const a = getActiveSession();
  if(!a){
    if(box.childElementCount) box.innerHTML = '';
    if(window.__sideTimerTick){ clearInterval(window.__sideTimerTick); window.__sideTimerTick = null; }
    return;
  }
  if(!box.querySelector('#sideTimerBadge')){
    box.innerHTML =
      '<div class="side-timer running-badge" id="sideTimerBadge" role="button" tabindex="0" title="点击回到计时页">'
      + '<span class="st-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg></span>'
      + '<span class="st-name">' + escapeHtml(a.subName || a.moduleName || '学习') + '</span>'   /* 9/17 任务名优先 */
      + '<span class="st-live" id="sideTimerLive">00:00:00</span>'
      + '<button class="st-stop" id="sideTimerStop" type="button" title="结束本次计时">结束</button>'
      + '</div>';
    const badge = document.getElementById('sideTimerBadge');
    const goTimer = () => { try{ softNavigate({ id:'timer', file:'timer.html', href:'timer.html' }, false); }catch(e){ location.href = 'timer.html'; } };
    badge.addEventListener('click', goTimer);
    badge.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goTimer(); } });
    document.getElementById('sideTimerStop').addEventListener('click', e => { e.stopPropagation(); sideStopClick(); });
  }
  updateSideTimerBadge();
  ensureSideTimerTick();
}
/* 结束按钮：在计时页走 timer.js 原生的 stopSession（保证计时页 UI 一致、零逻辑重复）；
   其它页用 common.js 的 DOM 安全版 stopActiveSession（数据落库 + 同步计时页 DOM 若存在）。 */
function sideStopClick(){
  if(document.getElementById('liveTimer') && typeof stopSession === 'function'){ stopSession(); }
  else if(typeof window.stopActiveSession === 'function'){ window.stopActiveSession(); }
}
/* 根据 moduleId/subId 补全 moduleName/subName；本地锚点只存 id 没存名字，
   跨页结束时若直接从 loadActive() 取，会缺名字导致记录显示成「学习」。
   以后 persistLocalActive 会同时写名字，但旧锚点和异常数据仍靠这里兜底。 */
function resolveTimerNames(a){
  if(!a) return { moduleName:'学习', subName:'学习' };
  let moduleName = a.moduleName || '';
  let subName = a.subName || '';
  const mod = (typeof MODULES !== 'undefined') ? MODULES.find(x => x.id === a.moduleId) : null;
  const child = mod && mod.children ? mod.children.find(c => c.id === a.subId) : null;
  if(!moduleName && mod) moduleName = mod.name || '';
  if(!subName){
    if(child) subName = child.name || '';
    else if(moduleName) subName = moduleName;
  }
  return { moduleName: moduleName || '学习', subName: subName || moduleName || '学习' };
}
/* 生僻词黑名单（系统规则，全站唯一数据源）：素材生成(materials.js)与串题(speaking.js)两端共用同一份。
   只用于拼装给 AI 的提示词文本，**禁止对 AI 输出做正则过滤**（删词会把句子删残）。 */
window.FORBIDDEN_WORDS = ['landmark','construct','symbolize','architecture','breathtaking',
  'incredible','entrepreneurship','cognitive','authentic'];
/* 跨页安全结束：复用 timer.js stopSession 的数据语义，但不依赖计时页 DOM（data.js 全局函数即可完成）。 */
window.stopActiveSession = function(){
  const a = window.active || (function(){ try{ return loadActive(); }catch(e){ return null; } })();
  if(!a) return;
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
  let totalPauseMs = a.pauseAccum || 0;
  if(a.paused && a.pauseStart) totalPauseMs += (Date.now() - a.pauseStart);
  const endTs = Date.now();
  const totalSec = Math.round((endTs - a.startTs)/1000);
  const pauseSec = Math.round(totalPauseMs/1000);
  const durationSec = Math.max(0, totalSec - pauseSec);
  // 入库去重：同一 timerId 只结算一次（防双端各自结束 → 两段计时叠加进当日统计）
  const already = DATA.sessions.some(s => s.timerId && s.timerId === a.timerId);
  if(!already && durationSec > 0 && typeof playChime === 'function') playChime();
  if(!already && durationSec > 0){
    const names0 = resolveTimerNames(a);
    DATA.sessions.push({
      id: uid(), timerId: a.timerId, date: todayKey(), moduleId: a.moduleId, subId: a.subId,
      moduleName: names0.moduleName, subName: names0.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec
    });
  }
  // toast 文案需要名字：无条件计算（names 只在上方 if 块内声明的话，出了块就访问不到 → ReferenceError）
  const names = resolveTimerNames(a);
  clearActive();                                   // 清本地恢复锚 点
  // 云镜像同步结束（对齐 timer.js stopSession 的口径）：不标记的话浮窗按 DATA.activeTimer
  // 继续显示幽灵计时，且另一端 30s 轮询合并 _mergeActiveTimer 时拿不到 ended → 不清态、可二次入库
  if(DATA.activeTimer && !DATA.activeTimer.ended && (!DATA.activeTimer.timerId || DATA.activeTimer.timerId === a.timerId)){
    DATA.activeTimer = { timerId: a.timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  }
  // 广播 ended：计时页恢复逻辑见此即清态、不二次入库。
  // broadcastEnded 定义在 timer.js（仅计时页加载）；其他页跨页结束时不存在，必须守卫，
  // 否则此处 ReferenceError 会中断后续 window.active 清理 + hubSave 落盘 + toast（实测崩溃路径）。
  if(typeof broadcastEnded === 'function') broadcastEnded(a.timerId);
  window.active = null;
  hubSave();
  // 同步计时页 DOM（仅在计时页有效，避免回看时还显示旧的"进行中"）
  const liveTimer = document.getElementById('liveTimer');
  if(liveTimer){ liveTimer.textContent = '00:00:00'; liveTimer.style.color = ''; }
  const stopBtn = document.getElementById('stopBtn'); if(stopBtn) stopBtn.disabled = true;
  const pauseBtn = document.getElementById('pauseBtn'); if(pauseBtn){ pauseBtn.disabled = true; pauseBtn.textContent = '暂停'; pauseBtn.className = 'btn'; }
  const activeInfo = document.getElementById('activeInfo'); if(activeInfo) activeInfo.textContent = '当前没有进行中的学习';
  const focusInfo = document.getElementById('focusInfo'); if(focusInfo) focusInfo.textContent = '';
  if(typeof renderTimer === 'function' && document.getElementById('timerMods')) renderTimer();
  document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
  document.dispatchEvent(new CustomEvent('hub:timer-state'));
  toast('已保存 ' + names.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) : ''));
};

function sideItem(p, current){
  const active = (p.file === current) ? 'active' : '';
  return `<a class="side-item ${active}" href="${p.file}" data-name="${p.name}" data-id="${p.id}">
    <span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span>
  </a>`;
}
function bindSidebar(){
  const nav = document.getElementById('mainNav');
  // 移动端抽屉：点击任一导航项后自动收起
  nav.querySelectorAll('.side-item').forEach(a => {
    a.addEventListener('click', () => {
      if(window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
    });
  });
  // 桌面展开态常驻「收起」按钮
  const cin = document.getElementById('sideCollapseIn');
  if(cin){ cin.addEventListener('click', toggleSidebar); }
  ensureMobileChrome();
}

function syncNavToggle(){
  const b = document.getElementById('sideToggle');
  if(!b) return;
  const open = document.body.classList.contains('nav-open');
  b.textContent = open ? '✕' : '☰';
  b.setAttribute('aria-label', open ? '关闭功能菜单' : '功能菜单');
  b.setAttribute('aria-expanded', String(open));
}

function ensureMobileChrome(){
  // 移动端：「更多」弹层（底部导航已由全站 dock 接管，旧 tabbar 组件 2026-09-08 删除）
  if(!document.getElementById('moreSheet')){
    const pageById = id => PAGES.find(p => p.id === id);
    const cur = _hubCurrentFile;

    /* 🔴 10/4 17:55 dock 分组重构：底部 dock 已经是 GROUPED_DOCK（首页/计划/学习/我的），
       **每个页面都有组可归**，所以「更多」弹层**不再需要收纳入口**。
       改法：moreIds 直接算空 → 弹层只剩「意见反馈」一个按钮（她 10/2 拍板要有）。
       ⚠️ 为什么不是删掉整个弹层：openMoreSheet() 还被别处引用（侧栏 / 反馈入口），
         删函数会连带炸 3 处调用点。这里让它退化成「只放反馈」，风险最小。
       ⚠️ 错句本 wrongbook 按她 17:54 的话从「我的」组移除，但**侧栏仍是 13 项全列**
         （desktopSidebarIds 没动）—— 她自己以后想用还能从侧栏进。 */
    const moreIds = [];   // 分组 dock 后不再需要收纳任何页面
    let sh = '<div class="sheet-head"><span>更多功能</span>'
      + '<button class="sheet-close" type="button" aria-label="关闭">✕</button></div>'
      + '<div class="sheet-list">';
    for(const pid of moreIds){
      const p = pageById(pid); if(!p) continue;
      const active = (p.file === cur) ? 'active' : '';
      sh += `<a class="sheet-item ${active}" href="${p.file}" data-id="${p.id}">`
        + `<span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span></a>`;
    }
    /* 10/2 意见反馈入口（她拍板「更多抽屉 + 设置页各一个」）：非跳转项，所以是 button 不是 a。
       点击由 js/feedback.js 的 [data-fb-open] 委托接管（打开全站共用弹层）。 */
    sh += '<button class="sheet-item" data-fb-open type="button">'
      + '<span class="nav-icon">💬</span><span class="side-label">意见反馈</span></button>';
    sh += '</div>';
    const bd = document.createElement('div'); bd.id = 'sheetBackdrop'; bd.className = 'sheet-backdrop';
    const sheet = document.createElement('div'); sheet.id = 'moreSheet'; sheet.className = 'sheet'; sheet.innerHTML = sh;
    document.body.appendChild(bd); document.body.appendChild(sheet);

    bd.addEventListener('click', closeMoreSheet);
    sheet.querySelector('.sheet-close').addEventListener('click', closeMoreSheet);
    sheet.querySelectorAll('.sheet-item').forEach(a => a.addEventListener('click', closeMoreSheet));
  }

  // 收起后左上角的展开按钮（桌面浮出）—— 保持不动
  if(!document.getElementById('sideCollapse')){
    const col = document.createElement('button');
    col.id = 'sideCollapse'; col.className = 'side-collapse';
    document.body.appendChild(col);
    col.addEventListener('click', toggleSidebar);
    syncCollapseIcon();
  }
}
function openMoreSheet(){ document.body.classList.add('sheet-open'); }
function closeMoreSheet(){ document.body.classList.remove('sheet-open'); }

function toggleSidebar(){
  const now = document.body.classList.toggle('side-collapsed');
  DATA.settings.collapsed = now;
  hubSave();
  syncCollapseIcon();
}

function syncCollapseIcon(){
  const collapsed = document.body.classList.contains('side-collapsed');
  // 收起后浮出的「展开」按钮
  const col = document.getElementById('sideCollapse');
  if(col){
    col.textContent = collapsed ? '☰' : '⟨';
    col.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
  }
  // 展开态常驻在侧栏头部的「收起」按钮
  const cin = document.getElementById('sideCollapseIn');
  if(cin){
    cin.textContent = collapsed ? '☰' : '⟨';
    cin.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
  }
}

/* 侧栏滚动位置记忆：跳转子页面后导航栏保持原位、不跳回顶部
   pagehide 在导航离开当前页前触发（含 bfcache 场景），写入 sessionStorage；
   新页面加载后（injectNav 注入完条目、有真实高度时）再恢复 scrollTop。 */
const SIDE_SCROLL_KEY = 'hub_side_scroll';
function saveSideScroll(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  try{ sessionStorage.setItem(SIDE_SCROLL_KEY, String(nav.scrollTop)); }catch(e){}
}
function restoreSideScroll(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  try{
    const v = sessionStorage.getItem(SIDE_SCROLL_KEY);
    if(v != null) nav.scrollTop = Number(v) || 0;
  }catch(e){}
}
window.addEventListener('pagehide', saveSideScroll);

function applyTheme(theme){
  theme = theme || DATA.settings.theme || 'light';
  if(theme === 'auto') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  // 状态栏配色随主题联动（iOS/Android 浏览器顶栏）
  var tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', theme === 'dark' ? '#0e1c1b' : '#3a9a93');
}

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2400);
}

/* 10/1 免费额度/会员专属轻条（她拍板口径：不打扰——不用大弹窗不自动跳页，
   就一条底部小提示条带「开会员」小按钮，8 秒自动消失，可手动关）。
   msg 用服务端返回的文案（单点维护在 ai.js）；同一时刻只保留一条。 */
function limitStrip(msg){
  try{
    /* 🔴 10/20 模考锁：模考中不弹额度条。
       它是 fixed 底栏（bottom:26px），会盖住模考底部的题号行/操作条，
       8 秒后自己消失 → 她感知到的「页面乱动 + 莫名弹出一条」。
       额度用完在模考里由 AI 失败提示承接，不该在这里打断。 */
    if(typeof hubExamLocked === 'function' && hubExamLocked()) return;
    if(document.body && document.body.classList.contains('hub-exam-locked')) return;
    const old = document.getElementById('hubLimitStrip');
    if(old) old.remove();
    const strip = document.createElement('div');
    strip.id = 'hubLimitStrip';
    const txt = document.createElement('span');
    txt.className = 'ls-txt'; txt.textContent = msg || '免费额度已用完';
    const btn = document.createElement('a');
    btn.className = 'ls-btn'; btn.href = 'vip.html'; btn.textContent = '开会员';
    const x = document.createElement('button');
    x.className = 'ls-x'; x.type = 'button'; x.setAttribute('aria-label', '关闭'); x.textContent = '✕';
    x.addEventListener('click', () => strip.remove());
    strip.appendChild(txt); strip.appendChild(btn); strip.appendChild(x);
    document.body.appendChild(strip);
    setTimeout(() => { try{ strip.remove(); }catch(e){} }, 8000);
  }catch(e){}
}

/* === 全站统一「回车即提交」（9/22 之之）===
   Enter（无 Shift、非输入法组词态）→ 触发该输入框对应提交按钮的 click；
   Shift+Enter = 换行；按钮 disabled（AI 忙碌/已判定）时 click 天然无效，防连击。
   submitBtn 传当前状态下的主行动按钮——按钮 onclick 被状态改写的模块（pd/sd/sent）
   传按钮元素本身即可，Enter 永远跟按钮当前行为一致，不会绕过状态机。 */
function bindEnterSubmit(input, submitBtn){
  if(!input || !submitBtn || typeof input.addEventListener !== 'function') return;
  if(input.__enterSubmitBound) return;          // 防重复绑定（软导航重建后是新节点，不受影响）
  input.__enterSubmitBound = true;
  input.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    try{ submitBtn.click(); }catch(_){}
  });
}

/* === 题目语音播放（Web Speech API，浏览器内置、离线可用，无需 API key）===
   雅思口语题目为英文，默认 en-GB 英音，贴合雅思考试。
   speakQuestion.speak(text, btn)：朗读文本并切换按钮 playing 态；btn 可选。
   说明：speechSynthesis 在用户已与页面交互后即可自动播放（不强制每次点击），满足“进入题目自动播一次 + 点按钮重播”。 */
var speakQuestion = (function(){
  function pickVoice(){
    try{
      if(typeof speechSynthesis === 'undefined') return null;
      const vs = speechSynthesis.getVoices() || [];
      if(!vs.length) return null;
      return vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
    }catch(_){ return null; }
  }
  function stop(){ if(typeof speechSynthesis !== 'undefined'){ try{ speechSynthesis.cancel(); }catch(_){} } }
  function speak(text, btn){
    if(typeof speechSynthesis === 'undefined'){ if(typeof toast === 'function') toast('当前浏览器不支持语音播放'); return; }
    text = (text || '').trim();
    if(!text) return;
    try{ speechSynthesis.cancel(); }catch(_){}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    const v = pickVoice(); if(v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1;
    if(btn) btn.classList.add('playing');
    u.onstart = () => { if(btn) btn.classList.add('playing'); };
    u.onend = () => { if(btn) btn.classList.remove('playing'); };
    u.onerror = () => { if(btn) btn.classList.remove('playing'); };
    try{ speechSynthesis.speak(u); }
    catch(_){ if(btn) btn.classList.remove('playing'); }
  }
  return { speak, stop };
})();

/* 题目播放按钮 HTML（单色线性 SVG，stroke=currentColor 继承全站 teal 调性，不用 emoji） */
function ttsBtnHtml(extraClass){
  return '<button class="sp-tts' + (extraClass ? ' ' + extraClass : '') + '" type="button" aria-label="播放题目语音">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tts-icon">'
    + '<path d="M11 5L6 9H3v6h3l5 4V5z"/>'
    + '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
    + '<path d="M18.5 6a9 9 0 0 1 0 12"/>'
    + '</svg></button>';
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return null;                 // 非法/非 ISO 格式（如 2026/8/25）直接判空，避免渲染 NaN
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
}

/* 取"下一次考试"：优先用户显式设置的单个 examDate，再回退 examDates 数组（多场日程）。
   选今天及之后最早的一场；若全部已过，返回最近一场（供"已结束"提示）。 */
function nextExamDate(){
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const push = v => { if(!v) return null; const d = new Date(v + 'T00:00:00'); if(isNaN(d)) return null; return { raw:v, d }; };

  // 用户通过「设置/回顾」显式设置的"下次考试日期"优先级最高
  const single = push(DATA.settings.examDate);
  if(single){
    if(single.d >= today0) return { raw:single.raw, passed:false };
    return { raw:single.raw, passed:true };
  }

  // 回退到历史多场日程
  const arr = (DATA.settings.examDates || []).map(push).filter(Boolean);
  if(arr.length === 0) return null;
  const upcoming = arr.filter(x => x.d >= today0).sort((a,b) => a.d - b.d);
  if(upcoming.length) return { raw: upcoming[0].raw, passed:false };
  const past = arr.slice().sort((a,b) => b.d - a.d);
  return { raw: past[0].raw, passed:true };
}

/* 倒计时文案：修复原"已过 天"格式 bug（负数时不应再拼" 天"）。
   返回 { raw, md(MM-DD), daysLeft, label, hasExam }，label 为"还有"之后的部分。 */
function examCountdown(){
  const ne = nextExamDate();
  if(!ne) return { raw:'', md:'', daysLeft:null, label:'--', hasExam:false };
  const daysLeft = daysUntil(ne.raw);
  let label;
  if(daysLeft === null) label = '--';
  else if(daysLeft < 0) label = '已结束（' + Math.abs(daysLeft) + ' 天前）';
  else if(daysLeft === 0) label = '就是今天';
  else label = daysLeft + ' 天';
  return { raw: ne.raw, md: ne.raw.slice(5), daysLeft, label, hasExam:true };
}

function expireStr(ts){ const d=new Date(ts+MED_DURATION_MS); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function pad2(n){ return String(n).padStart(2,'0'); }

/* 日期偏移：输入 'YYYY-MM-DD'，返回 +/- n 天后的 'YYYY-MM-DD'。
   原在 practice.js，plans.js 软导航时因 practice.js 未加载而崩溃，故上提到 common.js。 */
function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

/* 连续学习天数（今天往前数连续有 session 的天数）。首页与计时页共用一份实现。
   - 用 addDays 做纯字符串日期算术：new Date('YYYY-MM-DD') 按 UTC 解析，非东八区会错位断档；
   - filter(Boolean) 丢弃缺 date 的脏记录：undefined 经 sort+reverse 排首位会把整条 streak 误判 0。 */
function calcStreak(){
  const sessions = DATA.sessions || [];
  if(sessions.length === 0) return 0;
  const dates = [...new Set(sessions.map(s => s.date).filter(Boolean))].sort().reverse();
  if(dates[0] !== todayKey()) return 0;
  let count = 1;
  for(let i = 1; i < dates.length; i++){
    if(dates[i] === addDays(dates[i-1], -1)) count++; else break;
  }
  return count;
}

/* Cloudflare Pages 会开启 Pretty URLs，把 /plans.html 改写成 /plans。
   软导航与直接访问的 pathname 可能不带 .html，但 PAGES 中统一存 .html。
   用此函数把文件名标准化，保证高亮匹配不出错。 */
function normalizePageFile(file){
  if(!file || file === '/' || file === '') return 'home.html';   // 9/30：/ 现在是落地页，学习主页是 home.html
  if(!/\.html$/i.test(file)) return file + '.html';
  return file;
}

function statCard(label, value, color){
  return `<div class="stat-card" style="--accent:${color||'var(--primary)'};">
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

function progressBar(label, percent, color){
  return `<div class="bar-row">
    <div class="bar-info"><span>${label}</span><span>${Math.round(percent)}%</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,percent)}%;background:${color||'var(--primary)'};"></div></div>
  </div>`;
}

function renderEmpty(msg){ return `<div class="empty">${msg}</div>`; }

/* ===== AI 不可用提示（10/1 商业化改造）=====
   站内通道（/api/ai，Key 只在站长服务端）成为默认路径，「用户自备 Key」概念随设置页 AI 模块
   一起下线，design/81 的「去设置填 Key」引导卡整套退役。AI 不可用时只提示稍后再试。 */
function notifyNoKey(){ toast('AI 服务暂时不可用，请稍后再试'); }