/* 共享 UI：导航注入、主题、Toast、通用工具 */
/* 10-24 SW-3：ready() 从 common-shell.js 搬迉迉（A3 报的真 bug「ready is not defined」根因三）。
   原来定义在 84KB 的 common-shell.js，而 32 个页面脚本（bank/writing/speaking/plans/scores/vip/timer/index…）都在用它
   → 那一块一挂，全站页面脚本集体罁绊。
   common.js 是每个页面**第一个**加载的共享块（defer 严格按文档顺序，已实测 19/19 页都在 common-shell.js 之前）
   → 搬迉迉 ready 一定先定义，且任何单块故障不再链锁全站。 */
function ready(fn){ if(document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
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
  vip:'<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>',
  /* 10-22 她指出「落地页和首页的图标都不对」：站点唯一品牌标记 = 学士帽
     （favicon.svg / icons/ 全套 PNG / 侧栏品牌位 / 登录页品牌位都是它）。
     顶栏与落地页原先用的是「雅」字方框 → 已统一到本图形。
     ⚠️ 改这里等于改品牌图形：favicon.svg 与 icons/ 下的 PNG 是**另一份副本**，换图形时两边都要动。
     ⚠️ 尺寸不写死：width/height=100% 让三处容器各自决定（侧栏 40px / 顶栏 24px / 落地页 27px），
        与 favicon 里「图形占外框约四成」的比例天然一致。 */
  brand:'<svg viewBox="0 0 512 512" width="100%" height="100%" fill="none" style="display:block" aria-hidden="true" focusable="false"><g fill="#ffffff" stroke="#ffffff" stroke-width="38" stroke-linejoin="round" stroke-linecap="round"><path d="M256 136 L344 194 L256 252 L168 194 Z"/><path d="M160 304 L212 304 L256 362 L300 304 L352 304 L352 354 Q352 394 256 394 Q160 394 160 354 Z"/></g></svg>'
};

/* ⭐ 9/30：学习主页从 index.html 改名为 home.html（根 / 交给落地页 landing）。
   软导航 / 侧栏高亮 / 部署探针 / 兜底跳转全部以这里为准，改文件名必须先改本表。 */
const PAGES = [
  { id:'index',     file:'home.html',       icon:ICON.home,      name:'首页',       desc:'今日概览' },
  /* 🔴 10-23 她拍板「把服药页计时页删掉不用做」→ 入口全摘，但**文件保留**：
     · timer.html 还有进行中计时会话的结算/暂停恢复要跳它（common-shell.js:336 浮条停止）
     · tests/_probe_notimer_1022.cjs [E] 段断言 timer.html 仍返回 200（故意不删）
     · DATA.activeTimer / DATA.meds 的存储、同步字段一律不动（动就是改数据逻辑）
     故这里加 hidden:true —— PAGES 保留（软导航/直达/探针都还能用），
     但所有导航清单（PRIMARY_NAV / MORE_NAV / 更多面板 / 搜索 / 组页 / dock 成员）都不含它。 */
  { id:'timer',     file:'timer.html',     icon:ICON.timer,     name:'计时',   desc:'选模块开计时', hidden:true },
  { id:'plans',     file:'plans.html',     icon:ICON.plans,     name:'计划',   desc:'每日清单 + AI 排周' },
  { id:'practice',  file:'practice.html',  icon:ICON.practice,  name:'单词',       desc:'学习与管理你的单词' },
  // 三合一入口：长难句 + 错题 + 听写（原听力 corpus + 词句 errorbook 合并）
  { id:'corpus',    file:'corpus.html',    icon:ICON.corpus,    name:'句子', desc:'长难句 · 错题 · 听写' },
  { id:'speaking',  file:'speaking.html',  icon:ICON.speaking,  name:'口语', desc:'题库 + AI 串题' },
  /* 10-22 她要求：「句型闯关」老引擎（含 pattern-drill.html 独立页、js/pattern-drill.js、
     data/patterns.json、口语页 #pdView）整体删除 —— 该功能从未与她的句子网站联动。
     口语页「陪练」tab 现由 AI 陪练（coach.js）接管；句型练习（sentence-drill.js）与场景闯关
     （scene-drill.js）都是另外的东西，不受影响。此处原注释（独立直达页保留）随之作废。 */
  { id:'writing',   file:'writing.html',   icon:ICON.writing,   name:'写作',       desc:'模板 + AI 评分' },
  // 10/11：题库 → 「模考」大 tab（她拍板：四科模考统一在这里完成）
  { id:'bank',      file:'bank.html',      icon:ICON.mock,      name:'练习',       desc:'阅读 · 听力 · 写作 · 口语' },
  /* 🔴 10-23 T-015 她拍板「错句本不配单独一个 Tab，整个板块前后端删干净」→
     wrongbook.html 文件已从仓库删除；这里保留条目并标 hidden:true，只为两件事：
     ① 老链接 / 书签直访 wrongbook.html 时软导航白名单仍认得它（真删条目会 404 白屏）；
     ② 数据侧 collectWrongSentences / deleteWrongItem / DATA.deletedWrongKeys 仍在
        （写作页附属模块 + 云同步墓碑要用），一个字段都没动。 */
  { id:'wrongbook', file:'wrongbook.html', icon:ICON.wrongbook, name:'错句本',     desc:'写作/语料默写错句汇总', hidden:true },
  { id:'review',    file:'review.html',    icon:ICON.review,    name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'vip',       file:'vip.html',       icon:ICON.vip,       name:'会员',       desc:'AI 无限用 + 专属权益' },  // 10/1 付费方案：非学习功能，不进 PRIMARY_NAV
  { id:'settings',  file:'settings.html',  icon:ICON.settings,  name:'设置',       desc:'同步 / AI / 数据' },
  /* 同上：10-23 她拍板删掉服药页入口 → hidden:true，文件与 DATA.meds 数据保留 */
  { id:'meds',      file:'meds.html',      icon:ICON.meds,      name:'服药',   desc:'专注达药效窗口', hidden:true },  // ← 移到最后
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
  { id:'teacher',   file:'teacher.html',   icon:ICON.teacher,  name:'学生数据', desc:'绑定学生的学情（只读）' },
  /* W-UI-1（10-25）公告页：软导航按 id 找 js/announce.js + 公告条「去看看」的直达目标。
     ⚠️ 不进 PRIMARY_NAV / MORE_NAV（成熟站都不把公告放一级导航，见下方公告段注释），
        三条入口 = 公告条「去看看」· 消息中心「全部消息」· 设置页「更新日志」一行。 */
  { id:'announce',  file:'announce.html',  icon:ICON.writing,  name:'公告',     desc:'站点更新日志' },
  /* W-UI-1（10-26）帮助页：三组 FAQ（账号与会员 / 学习功能 / 数据与同步）。
     不进一级导航，两条入口 = 设置页「帮助」一行 + 消息中心底部（施工书 §四）。 */
  { id:'help',      file:'help.html',      icon:ICON.writing,  name:'帮助',     desc:'常见问题' }
];

/* 收藏页面（⭐）——侧边栏「常用」与首页「快捷入口」共用同一份，永远同步。
   从未收藏过时给新手默认项，避免入口空着。
   10-21 22:4x：她拍板「直接不要计时了」→ 默认收藏里摘掉 timer（只影响 prefetch 预取，不影响任何可见入口）。 */
const DEFAULT_FAV = ['practice','speaking'];
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
   单词（每日习惯）→ 句子 → 计划/计时（工具归位）→ 回顾。分隔线下方不变。
   🔴 10-21 22:4x 她拍板「直接不要计时了」：站内每个学习模块**打开就自动计时**，
      手动「选模块开表」这个入口没有存在必要 → 从 PRIMARY_NAV 摘掉 'timer'。
      ⚠️ **只摘入口、不删功能**：`timer.html` 文件、`DATA.activeTimer`、侧栏计时徽标、
         浮条「结束并保存」、各模块的自动计时引擎全部保留（撤掉页面会让进行中的会话无法结算）。 */
/* 🔴 10-23 T-014 她拍板：「回顾」从「更多」提为一级入口（跟单词/句子/计划平级），放「计划」后面。 */
const PRIMARY_NAV = ['index','bank','speaking','writing','practice','corpus','plans','review'];
/* ⭐ 10-22 她拍板（design/116 决策②）：组页不在顶栏 8 个胶囊里，直接换过去会「全都不亮」，
   看起来像没有当前位置 → 按归属高亮：学习组→单词、计划组→计划、我的组→设置。
   学生数据页故意不映射（它是独立身份，不属于任何学习模块）。
   ⚠️ 顶栏渲染（topBarHtml）与软导航高亮（updateActiveNav）必须共用这一份映射，
      否则「点进去亮的是 A、后退回来亮的是别的」这类不一致一定复发。 */
const CAP_ACTIVE = { 'plans-hub.html':'plans.html', 'study.html':'practice.html', 'me.html':'settings.html' };
function capActiveFile(file){ return CAP_ACTIVE[file] || file; }
/* 10/1 付费方案：vip 放分隔线下方首位（销售入口显眼但不挤占学习导航；她看过效果可再调位置） */
/* 10-23 她拍板删服药页入口 → MORE_NAV 去掉 'meds'。
   ⚠️ medsModuleOn() 保留（plans.js:545 的 AI prompt 仍读它拼服药上下文）。 */
/* 10-23 T-014：回顾提级后侧栏也不列（一级入口已覆盖）；错句本 T-015 删页先摘。
   ⚠️ MORE_NAV 现在是「顶栏更多面板的数据源」，两边必须一致。 */
const MORE_NAV    = ['vip','settings'];

/* ==================== W-UI-1（10-25）更新公告 ====================
   形态：全站顶部 34px 细条（顶栏 44px 之下），用户侧零学习成本。
   依据：多邻国 / 扇贝 / 爱听写 / 不背单词四家**都没有显眼的「更新公告」一级入口**，
   成熟站的公告形态就是「顶部一条细 banner + 设置里一行」；考研帮那种公告栏是资讯站玩法，工具站不适用。
   数据：data/announce.json（静态）—— 她以后加公告只改这个文件，不动代码。
   已读：localStorage.hub_anc_read（公告条 / 消息中心 / 公告页三处共用同一份）。
   ⚠️ 不进 PRIMARY_NAV / MORE_NAV（成熟站都不把它放一级导航）。 */
/* ⚠️ 用 var 不用 const/let：软导航用 window.eval 逐文件重跑页面脚本，eval 里声明的
   const/let 只活在那一次 eval 的词法作用域 → 隔壁文件看到的是 undefined（10-23 T-009 实证）。
   共享外壳虽在「排除表」里不重跑，统一口径省得以后踩。 */
var ANC_URL = 'data/announce.json';
var ANC_READ_KEY = 'hub_anc_read';
/* 🔴 CLS-1（10-26）：本机再存一份「公告清单」，为的是**首帧之前就能决定要不要挂公告条**。
   为什么必须本机留一份：公告条是 body 直下的 34px 条，网络回来才插 → 把 <main> 推下 34px
   = 一次完全可见的位移（实测桌面 0.023 / 手机 0.040）。本机有清单 → 启动那一刻就能同步决定，
   条的挂/摘落在「main 还不可见」的窗口里（见 common-shell.js 的 _bootMainVisible 与放行闸）。 */
var ANC_STORE_KEY = 'hub_anc_items_v1';
var _ancCache = null;              // 同一次会话只拉一次 json（软导航换页不重复请求）
var _ancFetch = null;              // 本次页面生命周期的网络请求（校正用）
function ancStore(j){
  try{ localStorage.setItem(ANC_STORE_KEY, JSON.stringify(j)); }catch(e){}
}
/* 同步吃本机那份清单（没有就返回 null，走网络） */
function ancHydrate(){
  if(_ancCache) return _ancCache;
  try{
    const raw = localStorage.getItem(ANC_STORE_KEY);
    if(raw){
      const j = JSON.parse(raw);
      if(j && Array.isArray(j.items)) _ancCache = j;
    }
  }catch(e){}
  return _ancCache;
}
function ancReadSet(){
  try{ return new Set(JSON.parse(localStorage.getItem(ANC_READ_KEY) || '[]')); }catch(e){ return new Set(); }
}
function ancMarkRead(ids){
  try{
    const s = ancReadSet();
    (ids || []).forEach(id => s.add(id));
    localStorage.setItem(ANC_READ_KEY, JSON.stringify(Array.from(s)));
  }catch(e){}
  if(typeof ancEnsure === 'function') ancEnsure();
  if(typeof hubRefreshBell === 'function') hubRefreshBell();   // 消息红点与公告已读同源
}
/* 「新」的判定：7 天内发布的算新（列表页 NEW 角标用；已读过的一律不标） */
function ancFresh(a){
  try{
    const d = new Date(String(a && a.date || '') + 'T00:00:00');
    if(isNaN(d.getTime())) return false;
    return (Date.now() - d.getTime()) < 7 * 864e5;
  }catch(e){ return false; }
}
function ancLoad(){
  /* 语义与改前一致：本次页面只发一次网络请求（软导航换页不重复）；差别只有一个 ——
     先同步把本机清单读进来，让**调用方在同一个 tick 里**就能决定挂不挂（不等网络）。 */
  if(_ancFetch) return _ancFetch;
  ancHydrate();
  /* 用**裸路径**不带 ?v=：这条路径已进 sw.js 的 PRECORE（首访第一帧就能从缓存拿到），
     且走 stale-while-revalidate —— 她改了 json 后老用户第二次访问自动拿到新版，
     不必每次改公告都去动 sw.js 的缓存号。带 query 反而会让预缓存永远命中不上。 */
  _ancFetch = fetch(ANC_URL, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(j => { _ancCache = (j && Array.isArray(j.items)) ? j : { items: [] }; ancStore(_ancCache); return _ancCache; })
    .catch(() => { if(!_ancCache) _ancCache = { items: [] }; return _ancCache; });
  return _ancFetch;
}
/* 启动放行闸用：网络那份到位了没有（失败也算到位 —— 绝不许把启动卡在网络上） */
function ancSettled(){
  return _ancFetch || Promise.resolve(_ancCache || { items: [] });
}
/* 公告条只推「最新那一条」，且仅在它未读时显示。
   🔴 为什么不是「最新一条未读」：那样点掉一条会立刻顶上下一条 —— 站上现在躺着 3 条历史公告，
      她第一次进来要连点 3 次 ✕ 才清干净，等于连续打扰。banner 型元素的语义是「通知你一次」，
      点掉 = 这件事我知道了；想逐条看的人去公告列表页（那里保留逐条 NEW 角标）。
      她以后发新公告 → 新的一条成为 items[0] → 条自动再出现一次。
      依据：设计稿「一个用户同时只显示一条」+ 多邻国/扇贝 banner 的一次性关闭语义。 */
function ancPending(){
  const s = ancReadSet();
  const j = _ancCache;
  if(!j || !j.items || !j.items.length) return null;
  const top = j.items[0];
  return (top && !s.has(top.id)) ? top : null;
}
/* ANN-1（10-26）：公告条轻量化 —— 标签胶囊换成 6px 小圆点，颜色/尺寸全部交给 CSS 的 .dot / .anc。
   她 19:4x 看过样子稿（design/_样子稿-公告条轻量化-2026-10-26.html）点头，1:1 还原方案 B：
     · 删掉 <span class="tag">新</span> / 「维护」胶囊（原来那个胶囊比正文还抢眼）
     · 加 <span class="dot" aria-hidden="true">（纯装饰，读屏不读）
     · 底色/字号/高度全在 css/common.css 的 .anc 里，这里不再写任何样式
   ⚠️ 类名从 light 改成 notice：kind !== 'feature' 的都算 notice（维护/通知），
      圆点换琥珀、底色仍是浅灰。旧数据里 kind 缺失也走 notice，行为不比以前更响。 */
function ancBarHtml(a){
  const notice = a.kind !== 'feature';
  return '<div class="anc' + (notice ? ' notice' : '') + '" id="hubAncBar">'
    + '<span class="dot" aria-hidden="true"></span>'
    + '<span class="tx"><b>' + escapeHtml(a.title || '') + '</b> · ' + escapeHtml(a.summary || '') + '</span>'
    + '<a href="announce.html#' + encodeURIComponent(a.id) + '" id="hubAncGo">去看看 ›</a>'
    + '<button class="x" type="button" id="hubAncX" title="关闭" aria-label="不再显示这条公告">✕</button>'
    + '</div>';
}
/* 挂/摘公告条：挂点 = .hub-topbar 之后（body 直下，sticky 贴 44px 之下）。
   🔴 无未读时整条不渲染（不占位）—— 这是设计稿第①条验收点。 */
function ancEnsure(){
  if(typeof ancLoad !== 'function') return;
  const wantsTop = document.body.getAttribute('data-shell') === 'top';
  const host = document.getElementById('ancBarHost');
  const a = ancPending();
  /* CLS-1：有本机清单 → 这一刻的「挂 / 不挂」就是最终决定，启动遮罩不必再等网络；
     没有 → 由 common-shell 的放行闸等 ancSettled（最多 900ms），把插入落进「main 不可见」窗口 */
  try{ window.__hubAncDecided = !!_ancCache; }catch(e){}
  if(!wantsTop || !a){
    if(host) host.innerHTML = '';
    return;
  }
  const bar = document.getElementById('hubAncBar');
  const want = ancBarHtml(a);
  /* 幂等：内容一致就不重画（软导航每页都调 injectNav，重画会让「点 ✕ 后又被画回来」） */
  if(bar && bar.parentNode){
    if(bar.getAttribute('data-anc-id') !== a.id){
      bar.outerHTML = want.replace('id="hubAncBar"', 'id="hubAncBar" data-anc-id="' + escapeHtml(a.id) + '"');
      ancBindBar();
    }
    return;
  }
  let wrap = host;
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'ancBarHost';
    const nav = document.getElementById('mainNav');
    if(nav && nav.parentNode) nav.parentNode.insertBefore(wrap, nav.nextSibling);
    else document.body.insertBefore(wrap, document.body.firstChild);
  }
  wrap.innerHTML = want.replace('id="hubAncBar"', 'id="hubAncBar" data-anc-id="' + escapeHtml(a.id) + '"');
  ancBindBar();
}
function ancBindBar(){
  const bar = document.getElementById('hubAncBar');
  if(!bar || bar.__bound) return;
  bar.__bound = true;
  const id = bar.getAttribute('data-anc-id') || '';
  const x = document.getElementById('hubAncX');
  if(x) x.addEventListener('click', function(){ ancMarkRead([id]); });
  const go = document.getElementById('hubAncGo');
  if(go) go.addEventListener('click', function(ev){
    ev.preventDefault();
    ancMarkRead([id]);
    /* 已在公告页 → 不换页，直接让本页开详情（announce.js 的 ancOpen） */
    if((location.pathname.split('/').pop() || '') === 'announce.html'
       && typeof window.ancOpen === 'function'){
      window.ancOpen(id);
      return;
    }
    /* 🔴 不能直接靠 <a href="announce.html#id"> 走软导航：hubLinkTarget 返回的 url
       会把 #hash 丢掉（common-shell.js:429），落地后 hash 没了 → 只到列表、不开详情
       （第 1 批遗留，本批一起修）。hubMsgGo = 软导航落地后再补 hash。 */
    hubMsgGo('announce.html#' + encodeURIComponent(id));
  });
}

/* 消息/公告的跳转：站内页走软导航（与顶栏其他入口一致），带 #hash 的落地后补 hash。 */
function hubMsgGo(href){
  const hashPart = href.split('#')[1] || '';
  const url = href.split('#')[0];
  const file = url.split('?')[0].split('/').pop();
  const page = (typeof PAGES !== 'undefined') ? PAGES.find(p => p.file === file) : null;
  if(page && typeof softNavigate === 'function'){
    try{
      const r = softNavigate({ id:page.id, file:page.file, href:page.file, url:url }, false);
      Promise.resolve(r).then(function(){
        if(hashPart){ try{ location.hash = hashPart; }catch(e){ location.href = href; } }
      }).catch(function(){ location.href = href; });
      return;
    }catch(e){ /* 落到下面的整页跳 */ }
  }
  location.href = href;
}

/* ==================== W-UI-1（10-26）消息中心（铃铛 + 下拉） ====================
   设计稿 §三。三类消息**全部本地算，零接口**：
     · 公告     → data/announce.json 里未读的（已读键 hub_anc_read 与公告条共用）
     · 会员到期 → 本地会员态剩余 ≤3 天（expire 来自既有会员检查的缓存，见 common-sync.js
                  hubVipExpireCached —— 不发新请求，没缓存就不显示这条，下次检查完自然出现）
     · 学习提醒 → 今日错词 > 0 或今天还没学习
   已读态按类型分键：公告用 hub_anc_read；会员/学习提醒不存已读（每次进页面按当前状态
   重算，过期自然消失 —— 施工书 §3.2 硬口径）。
   挂点 = 顶栏头像左侧（施工书 §3.1），不进任何导航清单。 */
var MSG_VIP_LEFT = 3;          // 会员剩余 ≤3 天才提醒
function hubBellHtml(){
  return '<span class="bell" id="tbBellBtn" title="消息" aria-label="消息" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" aria-controls="tbBellPop">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'
    + '<span class="dot" id="tbBellDot" hidden></span>'
    + '</span>'
    + '<div class="pop" id="tbBellPop" hidden></div>';
}
/* 错词数（本地两处）：① 自定义词库 = DATA.dailyWrong[今天]（DATA 顶层，全站可读）；
   ② 官方词库 = 独立 localStorage ielts_hub_obank_v1（wordbank.js 的纯本地键，直读即可，
   🔴 不能调 wbTodayWrongEns() —— 那是 practice 页专属脚本，顶栏在 19 页都在，调用必 undefined） */
function hubWrongCount(){
  const t = todayKey();
  const ids = new Set();
  try{
    ((DATA.dailyWrong || {})[t] || []).forEach(k => { const s = String(k||'').trim().toLowerCase(); if(s) ids.add(s); });
  }catch(e){}
  try{
    const ob = JSON.parse(localStorage.getItem('ielts_hub_obank_v1') || 'null');
    if(ob && ob.banks){
      Object.keys(ob.banks).forEach(id => {
        const w = (ob.banks[id] && ob.banks[id].wrong && ob.banks[id].wrong[t]) || [];
        w.forEach(k => { const s = String(k||'').trim().toLowerCase(); if(s) ids.add(s); });
      });
    }
  }catch(e){}
  return ids.size;
}
/* ── MSG-DISMISS-1（10-26）：「今天还没学习」误报 ────────────────────────────────
   她截图里「计划 5/5 项」和「今天还没学习」同屏自相矛盾。根因：本函数只认
   DATA.sessions 里今天 durationSec>0 的会话，而**勾计划任务、背单词都不写这种 session**
   （session 靠计时器/交卷写）→ 计划全做完照样判「没学习」。
   修法：扩成三源任一即算学过（成熟站口径：当天有任何学习痕迹就不催）。
   🔴 只放宽**判定**，不动任何写入侧 —— sessions 的写法、计时器、交卷逻辑一律不碰。 */
var HUB_MSG_DISMISS_KEY = 'hub_msg_dismiss';
function hubDismissMap(){
  try{
    var v = JSON.parse(localStorage.getItem(HUB_MSG_DISMISS_KEY) || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  }catch(e){ return {}; }     // 键坏了当空对象 —— 不许抛错把消息中心带崩
}
function hubDismissed(kind){
  var m = hubDismissMap();
  return m[kind] === todayKey();     // 只挡「今天」，明天自动恢复（催学习本来就该按天）
}
function hubMsgDismiss(kinds){
  try{
    var m = hubDismissMap();
    var t = todayKey();
    (kinds || []).forEach(function(k){ m[k] = t; });
    localStorage.setItem(HUB_MSG_DISMISS_KEY, JSON.stringify(m));
  }catch(e){}
  if(typeof hubRefreshBell === 'function') hubRefreshBell();
  if(typeof hubRenderPop === 'function'){
    try{ hubRenderPop(); }catch(e){}
  }
}
/* 今日计划里有没有「已完成」的项（第 2 源）。
   updatedAt 是毫秒时间戳，转日期时按**本地时区**拼（不能用 toISOString，那是 UTC，
   北京时间 0~8 点会差一整天 —— HANDOFF 记过的老坑）。 */
function hubPlanDoneToday(){
  try{
    var t = todayKey();
    var pad = function(n){ return String(n).padStart(2, '0'); };
    var plans = (DATA && DATA.plans) || [];
    for(var i = 0; i < plans.length; i++){
      var p = plans[i];
      if(!p || !Array.isArray(p.items) || !p.items.length) continue;
      var dateStr = p.date || '';
      if(!dateStr && p.updatedAt){
        var d = new Date(p.updatedAt);
        if(!isNaN(d.getTime())) dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }
      if(dateStr !== t) continue;
      if(p.items.some(function(it){ return it && it.done; })) return true;
    }
  }catch(e){}
  return false;
}
/* 今日有没有背过词（第 3 源）：沿用 sessions 里同日 type==='word' 的条目，不新造数据源。 */
function hubWordTouchedToday(){
  try{
    var t = todayKey();
    return (DATA.sessions || []).some(function(x){ return x && x.date === t && x.type === 'word'; });
  }catch(e){ return false; }
}
function hubStudiedToday(){
  const t = todayKey();
  /* 源①：带时长的会话（原判定，一行未改） */
  if((DATA.sessions || []).some(x => x && x.date === t && (x.durationSec || 0) > 0)) return true;
  /* 源②：今日计划有已完成项  ·  源③：今日背过词 */
  if(hubPlanDoneToday()) return true;
  if(hubWordTouchedToday()) return true;
  return false;
}
/* 三类消息（每条 {kind, icon, title, sub, time, href, unread}） */
function hubMsgs(){
  const out = [];
  const read = ancReadSet();
  const j = _ancCache;
  ((j && j.items) || []).forEach(a => {
    if(!a || !a.id || read.has(a.id)) return;
    out.push({ kind:'a', icon:'star', title:a.title || '', sub:a.summary || '',
      time:String(a.date || ''), href:'announce.html#' + encodeURIComponent(a.id), ancId:a.id, unread:true });
  });
  const exp = (typeof hubVipExpireCached === 'function') ? hubVipExpireCached() : null;
  if(exp){
    const PERM = typeof exp === 'number' && exp >= 4102444800000;
    if(!PERM){
      const d = (typeof exp === 'number') ? new Date(exp) : new Date(String(exp) + 'T00:00:00');
      const left = Math.ceil((d.getTime() - Date.now()) / 864e5);
      if(left > 0 && left <= MSG_VIP_LEFT){
        out.push({ kind:'b', icon:'clock', title:'会员还有 ' + left + ' 天到期',
          sub:'续一档接着用，或让它自然过期', time:'', href:'vip.html', unread:true });
      }
    }
  }
  const wn = hubWrongCount();
  if(wn > 0){
    /* MSG-DISMISS-1：错词提醒支持「今天别再提」 */
    if(!hubDismissed('wrong')){
      out.push({ kind:'c', icon:'book', title: wn + ' 个错词该复习了',
        sub:'错词本里攒着，一键重练不占今日配额', time:'', href:'practice.html', unread:true });
    }
  } else if(!hubStudiedToday()){
    if(!hubDismissed('study')){
      out.push({ kind:'c', icon:'book', title:'今天还没学习', sub:'从首页挑一件事开始，学一会儿就算数', time:'', href:'home.html', unread:true });
    }
  }
  return out;
}
function hubMsgIcon(name){
  if(name === 'clock') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  if(name === 'book') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 8l10 5 10-5-10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>';
}
function hubUnreadCount(){
  const read = ancReadSet();
  let n = 0;
  (( _ancCache && _ancCache.items) || []).forEach(a => { if(a && a.id && !read.has(a.id)) n++; });
  return n + hubMsgs().filter(m => m.kind !== 'a').length;
}
/* 红点：未读 > 0 才显示，>99 显示 99+（施工书 §3.1）。
   🔴 公告 json 是异步拉的 → 每次 ancLoad 到位后都要刷一次，否则首屏红点数少算公告。 */
function hubRefreshBell(){
  const dot = document.getElementById('tbBellDot');
  if(!dot) return;
  const n = hubUnreadCount();
  if(n > 0){
    dot.hidden = false;
    dot.textContent = n > 99 ? '99+' : String(n);
  } else {
    dot.hidden = true;
    dot.textContent = '';
  }
}
function hubRenderPop(){
  const pop = document.getElementById('tbBellPop');
  if(!pop) return;
  const msgs = hubMsgs();
  pop.innerHTML =
    '<div class="pop-h"><span class="t">消息</span><button class="all" type="button" id="tbBellAll">全部已读</button></div>'
    + '<div class="pop-b">'
    + (msgs.length ? msgs.map(function(m){
        return '<button class="mi ' + m.kind + '" type="button" data-msg-href="' + escapeHtml(m.href) + '">'
          + '<span class="ic">' + hubMsgIcon(m.icon) + '</span>'
          + '<span class="bd"><span class="t">' + escapeHtml(m.title) + '</span>'
          + '<span class="m">' + escapeHtml(m.sub) + '</span>'
          + (m.time ? '<span class="d">' + escapeHtml(m.time) + '</span>' : '')
          + '</span><span class="nv" aria-hidden="true"></span></button>';
      }).join('') : '<div class="pop-empty">没有新消息。</div>')
    + '</div>'
    + '<div class="pop-f"><span>仅保留最近 30 天 · 已读不留红点</span><a href="announce.html?tab=msg">全部消息 ›</a></div>';
}
function hubBellClose(){
  const pop = document.getElementById('tbBellPop');
  const btn = document.getElementById('tbBellBtn');
  if(pop && !pop.hidden){ pop.hidden = true; }
  if(btn) btn.setAttribute('aria-expanded', 'false');
}
function hubBindBell(){
  const btn = document.getElementById('tbBellBtn');
  const pop = document.getElementById('tbBellPop');
  if(!btn || !pop || btn.__bound) return;      // 幂等标记打元素上（软导航重建后是新节点）
  btn.__bound = true;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    const open = pop.hidden;
    if(open){ hubRenderPop(); }
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  btn.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); btn.click(); }
  });
  /* 点其他地方收起（document 级委托，与头像菜单同款；幂等靠 window 标记） */
  if(!window.__hubBellDocBound){
    window.__hubBellDocBound = true;
    document.addEventListener('click', function(e){
      const pop2 = document.getElementById('tbBellPop');
      if(!pop2 || pop2.hidden) return;
      if(e.target.closest && (e.target.closest('#tbBellPop') || e.target.closest('#tbBellBtn'))) return;
      hubBellClose();
    });
  }
  pop.addEventListener('click', function(e){
    const all = e.target.closest && e.target.closest('#tbBellAll');
    if(all){
      /* 全部已读 = 公告清零 + 学习/错词两类**按今天 snooze**（MSG-DISMISS-1，10-26）。
         为什么改：原来只清公告，而「今天还没学习」「N 个错词该复习了」是按当前状态现算的，
         点完「全部已读」红点立刻原地复活 → 她的感受就是「清也清不掉」（她 18:4x 指截图报的）。
         口径 = 成熟站的提醒 snooze 到明天（Notion/多邻国同款）：今天不再提，明天自动恢复。
         会员到期提醒**不进 snooze** —— 它本身就是按状态算的、不该被「已读」抹掉。 */
      ancMarkRead(((_ancCache && _ancCache.items) || []).map(a => a.id));
      hubMsgDismiss(['study', 'wrong']);
      hubBellClose();
      return;
    }
    const item = e.target.closest && e.target.closest('[data-msg-href]');
    if(item){
      const href = item.getAttribute('data-msg-href') || '';
      const ancId = decodeURIComponent((href.split('#')[1] || ''));
      if(ancId) ancMarkRead([ancId]);
      hubBellClose();
      /* 🔴 用 button + hubMsgGo，不用 <a>：软导航委托会把 #hash 丢掉（见 ancBindBar 注释） */
      if(href) hubMsgGo(href);
    }
  });
  hubRefreshBell();
}


const TAB_NAV     = ['index','practice','speaking'];   // 旧 tabbar 主项（组件已删，仅用于计算「更多」弹层要收纳哪些页面）
// 底部 Tab 标签覆盖：practice 在站内含「单词」，但原型/验收确认为「背词」，单独对齐（不改 PAGES 以免影响桌面侧栏）
const TAB_LABEL   = { practice:'背词' };

/* 🔴 10-23「计时页/服药页删掉」的统一闸门：hidden:true 的页不进任何导航清单。
   只过滤渲染层，PAGES 本身保留（软导航跳 hidden 页仍有效 —— 进行中的计时会话要跳 timer.html 结算）。 */
function isNavHidden(p){ return !!(p && p.hidden); }

/* ===== design/113A3a 落地批：home.html 专属顶栏（胶囊导航 + A3b 搜索框）=====
   落地顺序（她 10-21 拍板「先做这个」）：先首页+顶栏胶囊，再分页逐个换壳 →
   本分支只在 current==='home.html' 时走，其他页仍渲染原侧栏（一行未动）。
   软导航跨边界（home↔其他页）由 common-shell.js softNavigate 触发 injectNav 重建换壳。
   顶栏样式只在 css/p/home.css（本批仅 home 用；其他页换壳时再上搬 common.css）。
   搜索框复用侧栏那套 AI 智能搜索（同 id：#sideSearch/#ssPanel/#ssList + bindSideSearch），
   行为零分叉；A3b 的形态差异只在 CSS（186px 紧凑框 + Ctrl K 角标）。 */
/* ===== T-001 顶栏二级菜单（10-23 · 依据 `方案\T-001-顶栏二级菜单-v2`）=====
   只做「下拉」，一级页签视觉本批不动（改下划线式 = 派活清单第二批 2-3）。
   首页 / 单词 / 回顾 三项没有二级（方案 §四：单词页没有现成分栏，第二批再说）。
   sub 值 = 目标页里已有的分栏键，与各页自己的 data-* 一一对应，**不另造新分栏**：
     bank    → #mockTabs 的 data-mtab：reading / listening / writing / speaking
     speaking→ #tabs 的 data-type：BANK / PRACTICE / MAT
     writing → #writeTabs 的 data-tab：tpl / bank / score
     corpus  → #wordTabs 的 data-sub：ls / eb / dict
     plans   → #planTabs 的 data-ptab：today / plan / history
   ⚠️ 方案写「句子只剩长难句/听写（错句本删了）」——实测证据以代码为准：
      corpus.html 的 #wordTabs 仍是三项（长难句 ls / 错题 eb / 听写 dict），
      错句本删的是 writing 页底部那个 wbArea，不是 corpus 这个「错题」tab。故保留三项。 */
const TB_SUB = {
  bank:     [['阅读','reading'], ['听力','listening'], ['写作','writing'], ['口语','speaking']],
  speaking: [['题库','BANK'], ['陪练','PRACTICE'], ['素材','MAT']],
  writing:  [['模板','tpl'], ['语料','bank'], ['评分','score']],
  corpus:   [['长难句','ls'], ['错题','eb'], ['听写','dict']],
  /* P-1（10-24）：页面内已并成「今天 / 往日」（规划并进今天、历史改叫往日），
     顶栏二级必须同步 —— 否则桌面下拉还是三个旧项。老值 plan/history 的落地兼容
     由 js/plans.js:351 的 PLAN_TAB_ALIAS 兜着，这里只管菜单显示。 */
  plans:    [['今天','today'], ['往日','past']],
  /* 10-23 她「所有药丸的 tab 按钮给删掉，还有回顾页面没有弄下拉栏你一会记得补一下」：
     这两个页面原来没有二级（方案 §四 里写的「单词/回顾没有分栏」当时是对的 ——
     它们的分栏控件不叫 pill-tabs 那套 id），但她要的是**所有页面的药丸 tab 都撤**，
     撤了就得有顶栏二级顶上，否则桌面端没有分栏入口。sub 值就是各页自己的切换键。 */
  practice: [['学习','study'], ['词库','bank']],
  /* R-1 第一批（10-24，她 00:3x 点头）：四项 → 两项，与回顾页重设计合流。
     ⚠️ 老值 breakdown / overall / speaking 的落地兼容**归 A2 第二批**（页面内联脚本），
        本批不碰 —— 一条一提交、别抢活，规矩见施工书 §三。
        本批上线后桌面点「成绩」会先落到原「模考」栏（内容还在，只是没并），
        A2 第二批做完才是最终形态。 */
  review:   [['成绩','score'], ['轨迹','record']]
};
/* sub 的跨页交接：软导航时 location.search 要等 pushState 之后才是新值（见 speaking.js 里
   senttab 那段注释），而 pushState 在 runPageScript **之后** → 目标页读不到 query。
   所以点击时先写 sessionStorage，落地页优先读它、读不到再读 URL 参数（整页直达/收藏/刷新走这条）。
   取用即删，避免下次普通进入该页时被上一次的 sub 劫持。 */
const TB_SUB_KEY = 'hub_sub_';
function tbSubHandoff(pageId, sub){
  try{ sessionStorage.setItem(TB_SUB_KEY + pageId, sub); }catch(e){}
}
function tbSubPending(pageId){
  try{
    const v = sessionStorage.getItem(TB_SUB_KEY + pageId);
    if(v){ sessionStorage.removeItem(TB_SUB_KEY + pageId); return v; }
  }catch(e){}
  try{ return new URLSearchParams(location.search).get('sub') || ''; }catch(e){ return ''; }
}

function topBarHtml(current){
  const pageById = id => PAGES.find(p => p.id === id);
  const activeFile = capActiveFile(current);
  const _AV_SET = new Set(['user-f1','user-f2','user-f3','user-f4','user-m1','user-m2','user-m3','user-m4']);
  const _avRaw = (typeof DATA !== 'undefined' && DATA.settings) ? DATA.settings.avatar : '';
  const _avMe2 = 'img/avatars/' + (_AV_SET.has(_avRaw) ? _avRaw : 'user-f1') + '.svg';
  /* ===== T-003 头像菜单（10-23）=====
     结构：头像 + 兄弟面板（与 T-001 二级面板同一套 fixed 定位 / 同一套时序常量）。
     ⚠️ 头像本身**仍是真链接**（点击照常进设置页，任务书硬要求），面板只是悬停附加物。
     状态行数据源复用现有那套，不另造：登录判定 = DATA.settings.syncCode + authToken()（与
     js/settings.js:170 renderAuthUI 同口径），昵称 = DATA.settings.name（settings.js:178 的取法）。 */
  const _meLogged = !!(DATA.settings && DATA.settings.syncCode && typeof authToken === 'function' && authToken());
  const _meName = ((DATA.settings && DATA.settings.name) || '').trim()
    || (DATA.settings && DATA.settings.syncCode) || '';
  let _meMenu;
  if(_meLogged){
    const _auto = (DATA.settings && DATA.settings.autoSync) ? '' : ' · 自动同步已关闭';
    _meMenu = '<div class="tb-me-menu" id="tbMeMenu">'
      + '<div class="tb-me-head"><b>' + escapeHtml(_meName || '已登录') + '</b>'
      + '<span>已登录' + _auto + '</span></div>'
      + '<a class="tb-me-item" href="settings.html?pane=profile" data-hub-pane="profile">个人设置</a>'
      + '<a class="tb-me-item" href="settings.html?pane=targets" data-hub-pane="targets">分数自评</a>'
      + '<div class="tb-me-sep"></div>'
      + '<button class="tb-me-item tb-me-item--danger" type="button" id="tbMeLogout">退出登录</button>'
      + '</div>';
  }else{
    /* 未登录：状态行就是去登录的入口；三个菜单项保留（进去自然看到登录引导）；不出现「退出登录」。 */
    _meMenu = '<div class="tb-me-menu" id="tbMeMenu">'
      + '<a class="tb-me-head tb-me-head--guest" href="login.html"><b>未登录</b><span>去登录 ›</span></a>'
      + '<a class="tb-me-item" href="settings.html?pane=profile" data-hub-pane="profile">个人设置</a>'
      + '<a class="tb-me-item" href="settings.html?pane=targets" data-hub-pane="targets">分数自评</a>'
      + '</div>';
  }
  const _meEl = '<span class="tb-me-wrap" id="tbMeWrap">'
    + (authToken()
      ? '<a class="tb-me" href="settings.html" id="tbMeBtn" title="账号" aria-label="账号菜单" aria-haspopup="true" aria-expanded="false" aria-controls="tbMeMenu"><img src="' + _avMe2 + '" alt=""></a>'
      : '<a class="tb-me tb-me--guest" href="login.html" id="tbMeBtn" title="去登录" aria-label="账号菜单" aria-haspopup="true" aria-expanded="false" aria-controls="tbMeMenu">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg></a>')
    + _meMenu
    + '</span>';
  // 胶囊 = design/113A3 原样：首页/模考/口语/写作/单词/句子/计划 + 「更多」
  // 10-21 22:4x：PRIMARY_NAV 已摘掉 'timer'，原来那句 `if(pid==='timer') continue;` 随之失效删除。
  let caps = '';
  for(const pid of PRIMARY_NAV){
    const p = pageById(pid); if(!p || isNavHidden(p)) continue;
    const on = (p.file === activeFile) ? ' on' : '';
    const sub = TB_SUB[p.id];
    if(!sub || !sub.length){
      caps += '<a class="tb-item' + on + '" href="' + p.file + '" data-id="' + p.id + '">' + escapeHtml(p.name) + '</a>';
      continue;
    }
    /* 大 tab 本身**仍是真链接**（方案硬要求：加了面板不许让点击失效/变成只展开），
       面板是它的兄弟节点，用 aria-controls 关联；二级项直接写 HTML，不进 JS 注入。 */
    const pid2 = 'tbsub-' + p.id;
    let items = '';
    for(const kv of sub){
      /* atSub=1 只做「让落地页知道该切到哪个分栏」，不参与高亮 ——
         分栏高亮由各页自己的切换函数负责（方案：不许重写各页切换逻辑）。 */
      items += '<a class="tb-sub-item" href="' + p.file + '?sub=' + encodeURIComponent(kv[1])
        + '" data-hub-sub="' + escapeHtml(kv[1]) + '" data-sub-page="' + p.file + '">' + escapeHtml(kv[0]) + '</a>';
    }
    caps += '<span class="tb-cap-wrap" data-cap="' + p.id + '">'
      + '<a class="tb-item' + on + '" href="' + p.file + '" data-id="' + p.id
      + '" data-sub-for="' + p.id + '" aria-haspopup="true" aria-expanded="false" aria-controls="' + pid2 + '">'
      + escapeHtml(p.name) + '</a>'
      + '<div class="tb-sub" id="' + pid2 + '" data-sub-owner="' + p.id + '">' + items + '</div>'
      + '</span>';
  }
  /* 「更多」面板（10-23 T-014 她拍板瘦身）：回顾已提一级 → 这里只剩 会员/设置；
     错句本 T-015 整页删，先从这里摘掉；学生数据由下方权限块追加。 */
  let moreItems = '';
  for(const pid of ['vip','settings']){
    const p = pageById(pid); if(!p || isNavHidden(p)) continue;
    moreItems += '<a class="tb-more-item' + (p.file === activeFile ? ' on' : '') + '" href="' + p.file + '" data-id="' + p.id + '">'
      + '<span class="tm-ic">' + p.icon + '</span><span>' + escapeHtml(p.name) + '</span></a>';
  }
  /* 三级权限（10-22）：管理员在首页顶栏「更多」里也要能进「学生数据」 */
  if(hubIsAdmin()){
    const tp = pageById('teacher');
    if(tp) moreItems += '<a class="tb-more-item' + (tp.file === current ? ' on' : '') + '" href="' + tp.file + '" data-id="' + tp.id + '">'
      + '<span class="tm-ic">' + tp.icon + '</span><span>' + escapeHtml(tp.name) + '</span></a>';
  }
  return '<a class="tb-logo" href="home.html"><i aria-hidden="true">' + ICON.brand + '</i><span>IELTS</span></a>'
    + '<nav class="tb-caps" aria-label="主导航">' + caps
    + '<div class="tb-more">'
    + '<button class="tb-item tb-more-btn" id="tbMoreBtn" type="button" aria-expanded="false" aria-haspopup="true" aria-controls="tbMorePanel">更多'
    + '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></button>'
    + '<div class="tb-more-panel" id="tbMorePanel" hidden>' + moreItems + '</div>'
    + '</div></nav>'
    + '<div class="tb-right">'
    + '<div class="tb-search">'
    /* SRCH-UNIFY-1 笔 2（10-28）：顶栏这枚改用统一类 `.ui-field-search` + 导航变体 `--nav`，
       替换旧的 `.ui-search` / `.ui-search-icon` / `.ui-search-input` 三件套。
       🔴 `id="sideSearch"` 必须保留：Ctrl K（724 行）与 bindSideSearch（1364 行）都靠它取元素，
          换 id 会把搜索功能整个打断。同理 `ssPanel` / `ssList` 也原样不动。
       外观由 `--nav` 变体承载（28px 胶囊 / 12.5 字号 / 右 46px 让位 Ctrl K），与旧值逐项对齐。 */
    + '<label class="ui-field-search ui-field-search--nav" for="sideSearch">'
    + '<svg class="ui-field-search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input class="ui-field-search-in" type="text" id="sideSearch" placeholder="搜索功能、单词、句子" aria-label="搜索" autocomplete="off" title="输入中文搜功能；输入英文单词 AI 查词" />'
    + '<kbd aria-hidden="true">Ctrl K</kbd>'
    + '<div class="ss-panel" id="ssPanel" hidden><div id="ssList"></div></div>'
    + '</label>'
    /* 🔴 10-23 她「把所有页面计时条去掉」→ 顶栏里的计时徽标容器已撤（原来这里是
       + '<div class="side-timer-wrap" id="sideTimer"></div>'）。renderSideTimer/updateSideTimerBadge 保留
       （timer.html 的结算走同一份 DATA.activeTimer），但没有容器时两者都是空转。 */
    + hubBellHtml()
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
  /* T-003：Ctrl + , 打开设置页（照 __hubCmdKBound 同款幂等标记，各起各的名字，互不影响）。
     ⚠️ 要拦一下「焦点在输入框里」：Ctrl+, 不是输入冲突键，任务书说保持全局生效 —— 但浏览器
        在部分键盘布局下会把它当系统快捷键（打开偏好设置），e.preventDefault() 必须调。 */
  if(!window.__hubCmdCommaBound){
    window.__hubCmdCommaBound = true;
    document.addEventListener('keydown', (e) => {
      if((e.ctrlKey || e.metaKey) && e.key === ','){
        e.preventDefault();
        hubSoftGoToSettings();
      }
    });
  }
  bindTopBarSub();
  bindTopBarMe();
  const btn = document.getElementById('tbMoreBtn');
  const panel = document.getElementById('tbMorePanel');
  if(btn && panel){
    /* 10-23 T-001c：display:none ↔ block 无法过渡。改成「hidden 只控制是否存在，
       动效全交给 .show 类（opacity + translateY）」—— 与二级面板同一套。 */
    const setOpen = open => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('on', open);
      if(open){
        tbPlacePanel(panel, btn, 'right');
        /* 先让浏览器拿到一帧「未 show」的状态，再加 show，否则 transition 不跑 */
        requestAnimationFrame(() => panel.classList.add('show'));
      }else{
        panel.classList.remove('show');
      }
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if(panel.hidden){
        tbCloseSub();                    // 开「更多」= 关掉任何二级面板（同时只开一个）
        try{ if(typeof tbCloseMe === 'function') tbCloseMe(); }catch(_){}
      }
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
    // 视口变化：fixed 定位的面板必须重算，否则窗口缩放后面板会飘在错位处
    if(!window.__tbPlaceBound){
      window.__tbPlaceBound = true;
      window.addEventListener('resize', () => {
        tbCloseSub();
        const p2 = document.getElementById('tbMorePanel'), b2 = document.getElementById('tbMoreBtn');
        if(p2 && b2 && !p2.hidden) tbPlacePanel(p2, b2, 'right');
      });
      window.addEventListener('scroll', () => { tbCloseSub(); }, true);
    }
  }
}

/* 🔴 10-23 T-001：`.tb-caps` 有 overflow-x:auto（T-014 为 9 项窄屏横滚加的），
   它会把**绝对定位的子面板整块裁掉**（实测「更多」里的会员/设置 elementFromPoint 命不中）。
   顶栏本身是 position:fixed → 面板改 fixed + 由这里按触发器矩形算位置，绕开祖先裁剪。 */
function tbPlacePanel(panel, trigger, align){
  if(!panel || !trigger) return;
  const r = trigger.getBoundingClientRect();
  /* 🔴 10-23 T-001c：原来按**触发器矩形**的 bottom + 6 定位。但胶囊 tab 只有 27.5px 高、
     在 44px 顶栏里垂直居中 → bottom = 35.25，加 6 得 41.25 → 面板**插进顶栏里面 3px**
     （探针实测 inlineTop 41 vs 顶栏底边 44）。她要的是「贴着顶栏底边往下长」，
     所以改成按**顶栏底边**算：顶栏 bottom + 6px。 */
  const bar = document.querySelector('.hub-topbar');
  const base = bar ? bar.getBoundingClientRect().bottom : r.bottom;
  panel.style.top = Math.round(base + 6) + 'px';
  // 先放到目标行，量宽度，再做右对齐 / 视口内收（第一次调用时宽度才有值）
  panel.style.left = Math.round(r.left) + 'px';
  const w = panel.offsetWidth || 0;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  let left = (align === 'right') ? (r.right - w) : r.left;
  if(left + w > vw - 8) left = vw - 8 - w;
  if(left < 8) left = 8;
  panel.style.left = Math.round(left) + 'px';
}

/* ===== T-003 头像菜单的开合逻辑 =====
   与 T-001 二级面板同一套时序（150ms 出 / 250ms 收）——任务书写 200ms，但方案 §三 定的
   统一口径是 250ms，且「更多」/头部两个面板行为不一致她一定看得出来，故取 250。
   移动端不启用（顶栏在 ≤860 本来就不渲染，这里是双保险）；点「更多」必须关掉本面板，反之亦然。 */
let _tbMeTimer = null;
let _tbMeOpen = false;
function tbMeEl(){ return document.getElementById('tbMeMenu'); }
function tbCloseMe(){
  if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
  if(!_tbMeOpen) return;
  const p = tbMeEl(), b = document.getElementById('tbMeBtn');
  if(p) p.classList.remove('show');
  if(b){ b.classList.remove('tb-open'); b.setAttribute('aria-expanded', 'false'); }
  _tbMeOpen = false;
}
function tbOpenMe(){
  if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
  if(_tbMeOpen) return;
  tbCloseSub();                       // 与二级面板互斥
  const mp = document.getElementById('tbMorePanel'), mb = document.getElementById('tbMoreBtn');
  if(mp && !mp.hidden){              // 与「更多」互斥
    mp.hidden = true;
    if(mb){ mb.setAttribute('aria-expanded', 'false'); mb.classList.remove('on'); }
  }
  const p = tbMeEl(), b = document.getElementById('tbMeBtn');
  if(!p || !b) return;
  p.classList.add('show');
  b.classList.add('tb-open');
  b.setAttribute('aria-expanded', 'true');
  _tbMeOpen = true;
  tbPlacePanel(p, b, 'right');
}
/* 退出登录：**只调用设置页那套现成逻辑**（authLogout 是 js/settings.js #syncLogoutBtn 背后同一个函数），
   不新写清 token 的代码 —— 任务书硬要求，否则两处行为会分叉。
   二次确认文案照抄设置页（'退出登录后停止云同步（本机数据保留）。确定退出？'）。 */
async function tbMeLogout(){
  if(!confirm('退出登录后停止云同步（本机数据保留）。确定退出？')) return;
  try{
    await authLogout();               // ← 与 #syncLogoutBtn 同一个函数（js/common-cloud.js:246）
  }catch(e){ console.warn('[tb-me] 退出失败', e); }
  tbCloseMe();
  if(typeof authToken === 'function' && !authToken() && typeof injectNav === 'function') injectNav();
}
/* Ctrl+, / 菜单项 → 设置页对应分组。
   settings.html 的四个分组由页内内联脚本的 go(name) 管（data-goto），没有 URL 入口 →
   这里用和 T-001 同款跨页交接：sessionStorage 放一份，落地页读出来调 go()。
   ⚠️ 任务书说「?pane= 由 T-002 提供」，但 T-002 还没做；所以参数照写（URL 可读可分享），
      同时补 sessionStorage —— 软导航时 query 读不到（见 tbSubPending 的注释）。 */
const TB_PANE_KEY = 'hub_set_pane';
function tbPaneHandoff(pane){
  try{ sessionStorage.setItem(TB_PANE_KEY, pane); }catch(e){}
}
function tbPanePending(){
  try{
    const v = sessionStorage.getItem(TB_PANE_KEY);
    if(v){ sessionStorage.removeItem(TB_PANE_KEY); return v; }
  }catch(e){}
  try{ return new URLSearchParams(location.search).get('pane') || ''; }catch(e){ return ''; }
}
function hubSoftGoToSettings(pane){
  const href = 'settings.html' + (pane ? ('?pane=' + encodeURIComponent(pane)) : '');
  const a = document.createElement('a');
  a.href = href;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();                        // 交给全局 onHubLinkClick → softNavigate（模考锁/自愈都在这条路上）
  setTimeout(() => a.remove(), 0);
}
function bindTopBarMe(){
  const wrap = document.getElementById('tbMeWrap');
  if(!wrap) return;
  const btn = document.getElementById('tbMeBtn');
  const panel = tbMeEl();
  if(!btn || !panel) return;
  /* ⚠️ 逐元素标记而不是「窗口级只绑一次」：软导航会重渲染 nav.innerHTML，
     wrap/面板都是新节点、但 window 标记还在 → 新节点永远绑不上（T-001 踩过的坑）。 */
  if(wrap.getAttribute('data-me-bound') === '1') return;
  wrap.setAttribute('data-me-bound', '1');

  wrap.addEventListener('mouseenter', () => {
    if(!tbCanHover()) return;
    if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
    _tbMeTimer = setTimeout(() => { _tbMeTimer = null; tbOpenMe(); }, 150);
  });
  wrap.addEventListener('mouseleave', () => {
    if(!tbCanHover()) return;
    if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
    if(!_tbMeOpen) return;
    _tbMeTimer = setTimeout(() => { _tbMeTimer = null; tbCloseMe(); }, 250);
  });
  panel.addEventListener('mouseenter', () => {
    if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
  });
  panel.addEventListener('mouseleave', () => {
    if(!tbCanHover()) return;
    if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
    _tbMeTimer = setTimeout(() => { _tbMeTimer = null; tbCloseMe(); }, 250);
  });
  btn.addEventListener('focus', () => {
    if(!tbCanHover()) return;
    if(_tbMeTimer){ clearTimeout(_tbMeTimer); _tbMeTimer = null; }
    _tbMeTimer = setTimeout(() => { _tbMeTimer = null; tbOpenMe(); }, 150);
  });
  btn.addEventListener('keydown', (e) => {
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      tbOpenMe();
      const first = panel.querySelector('.tb-me-item');
      if(first) first.focus();
    }
  });
  /* 三个分组项：写跨页暗号 + 收起（不 preventDefault，走站内软导航那条路） */
  panel.querySelectorAll('[data-hub-pane]').forEach(item => {
    item.addEventListener('click', () => {
      tbPaneHandoff(item.getAttribute('data-hub-pane'));
      tbCloseMe();
    });
  });
  const lo = document.getElementById('tbMeLogout');
  if(lo) lo.addEventListener('click', (e) => { e.preventDefault(); tbMeLogout(); });

  if(!window.__tbMeEscBound){
    window.__tbMeEscBound = true;
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && _tbMeOpen){
        const b = document.getElementById('tbMeBtn');
        tbCloseMe();
        if(b) b.focus();
      }
    });
  }
}

/* ===== T-001 二级面板的悬停逻辑 =====
   时序照方案 §三（数值是成熟站点实测区间，别自己改）：
     进入大 tab 150ms 后才展开（防误触）· 离开「tab + 面板」整体 250ms 后收起 ·
     同一时刻只有一个面板 · Esc 关 · 面板内点击立刻收起再导航 ·
     移动端/无悬停设备完全不启用（顶栏在 ≤860 本来就不渲染，这里是双保险）·
     「更多」的点击展开行为一个字不改（切到大 tab 时才关它）。 */
let _tbSubTimer = null;
let _tbSubOpenId = null;
function tbCanHover(){
  try{ return !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches); }catch(e){ return false; }
}
function tbSubEl(id){ return document.getElementById('tbsub-' + id); }
function tbCloseSub(){
  if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
  if(_tbSubOpenId){
    const el = tbSubEl(_tbSubOpenId);
    const a = document.querySelector('.tb-caps .tb-item[data-sub-for="' + _tbSubOpenId + '"]');
    if(el) el.classList.remove('show');
    if(a){ a.classList.remove('tb-open'); a.setAttribute('aria-expanded', 'false'); }
    _tbSubOpenId = null;
  }
  /* 🔴 10-23 HOTFIX-2（她报「点模考出现的是计划的页面」的根因）：
     原实现只关 _tbSubOpenId 记着的**那一个**面板。但状态变量与 DOM 会脱钩：
       · 悬停某个胶囊 150ms 后 tbOpenSub 把它标 .show
       · 紧接着点链接走软导航 —— 同壳换页**不重建导航**（common-shell.js 的跨壳判断只在
         home↔其他页时才 injectNav），于是面板 DOM 原封不动留在屏幕上
       · 面板是 position:fixed 的浮层（top≈50、约 96×144），正好压在内容区顶部：
         她往下一划要点的第一个东西，其实就是上一页菜单里的某个子项
         → 实测 elementFromPoint 命中 bank.html?sub=writing / plans.html?sub=today
         → 表现就是「点 A 出现 B 的页面」，且完全无声
     修法：这里改成**清掉全部 .tb-sub 的 .show**（不信状态变量，直接对 DOM 收口），
     并在换页的两处显式调用（onHubLinkClick 导航前 + softNavigate 换完 main 后）。 */
  try{
    document.querySelectorAll('.tb-sub.show').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.tb-caps .tb-item.tb-open').forEach(a => {
      a.classList.remove('tb-open');
      a.setAttribute('aria-expanded', 'false');
    });
    _tbSubOpenId = null;
  }catch(e){}
}
function tbOpenSub(id){
  if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
  if(_tbSubOpenId === id) return;
  tbCloseSub();
  const el = tbSubEl(id);
  const a = document.querySelector('.tb-caps .tb-item[data-sub-for="' + id + '"]');
  if(!el || !a) return;
  // 同时只开一个：开二级就把「更多」面板和头像菜单都关掉
  const mp = document.getElementById('tbMorePanel'), mb = document.getElementById('tbMoreBtn');
  if(mp && !mp.hidden){
    mp.hidden = true;
    if(mb){ mb.setAttribute('aria-expanded', 'false'); mb.classList.remove('on'); }
  }
  try{ if(typeof tbCloseMe === 'function') tbCloseMe(); }catch(e){}
  el.classList.add('show');
  a.classList.add('tb-open');
  a.setAttribute('aria-expanded', 'true');
  _tbSubOpenId = id;
  tbPlacePanel(el, a, 'left');
}
function bindTopBarSub(){
  const caps = document.querySelector('.tb-caps');
  if(!caps) return;
  /* ⚠️ 不能拿 .tb-caps 上的标记做「只绑一次」闸门：软导航会重渲染 nav.innerHTML
     （wrap / 面板全是新节点），但 .tb-caps 这个元素本身是同一个 → 标记还在，
     新节点就永远绑不上（实测：从首页点进 bank 后二级项点了没反应、也没报错）。
     所以改成**逐 wrap 标记**：静态属性不会随 innerHTML 重建而残留。 */
  const wraps = caps.querySelectorAll('.tb-cap-wrap');
  if(!wraps.length) return;
  wraps.forEach(wrap => {
    const id = wrap.getAttribute('data-cap');
    const a = wrap.querySelector('.tb-item[data-sub-for]');
    const panel = wrap.querySelector('.tb-sub');
    if(!id || !a || !panel) return;
    wrap.addEventListener('mouseenter', () => {
      if(!tbCanHover()) return;
      if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
      _tbSubTimer = setTimeout(() => { _tbSubTimer = null; tbOpenSub(id); }, 150);
    });
    wrap.addEventListener('mouseleave', () => {
      if(!tbCanHover()) return;
      if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
      const p = tbSubEl(id);
      // 面板是 fixed 的，鼠标从 tab 移到面板会先触发 wrap 的 leave 再触发面板 enter，
      // 这段窗口就是给「跨到面板上」的时间（方案 §三：给她移动鼠标的时间）。
      // 🔴 10-23 23:1x：250 → 500ms。她报「回顾的实战/口语/轨迹点不进去」，实测点不进去不是
      //    切换逻辑坏，是这段窗口太短：胶囊 tab 底边 35.25、面板顶 50（顶栏 44 + 6），中间 15px
      //    空隙里鼠标一离开 tab 就开始倒计时，手一慢面板先收，点下去落在后面的卡片上 = 毫无反应。
      //    只动这个数字，面板位置/大小/外观/150ms 展开时长一个都没变。
      const openNow = (p && p.classList.contains('show'));
      if(!openNow) return;
      _tbSubTimer = setTimeout(() => { _tbSubTimer = null; tbCloseSub(); }, 500);
    });
    /* 面板自己的 hover 也要能取消「离开」计时（fixed 面板在 DOM 上还是 wrap 的后代，
       但几何上已经和 wrap 不相交，mouseleave 一定会先发生 → 这里的 enter 必须把计时清掉）。 */
    panel.addEventListener('mouseenter', () => {
      if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
    });
    panel.addEventListener('mouseleave', () => {
      if(!tbCanHover()) return;
      if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
      _tbSubTimer = setTimeout(() => { _tbSubTimer = null; tbCloseSub(); }, 500);
    });
    /* 键盘：焦点进入大 tab 后按 ↓ 也能展开（不展开就没法 Tab 进二级）。
       Esc 在 document 层统一关（见下）。 */
    /* 键盘：焦点进入大 tab 后按 ↓ 也能展开（不展开就没法 Tab 进二级）。
       Esc 在 document 层统一关（见下）。
       🔴 10-23 T-001c：Esc 处理里有一句 `if(a) a.focus()`（关掉后把焦点还给 tab）。
       那个 focus 会再触发本监听 → 150ms 后面板又打开了（探针实测 Esc 后 60ms 关、
       400ms 又开）。加 `__tbEscJustClosed` 闸：Esc 关掉后 300ms 内忽略 focus 展开。 */
    a.addEventListener('focus', () => {
      if(!tbCanHover()) return;
      if(a.__tbEscJustClosed && Date.now() - a.__tbEscJustClosed < 300) return;
      if(_tbSubTimer){ clearTimeout(_tbSubTimer); _tbSubTimer = null; }
      _tbSubTimer = setTimeout(() => { _tbSubTimer = null; tbOpenSub(id); }, 150);
    });
    a.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown'){
        e.preventDefault();
        tbOpenSub(id);
        const first = panel.querySelector('.tb-sub-item');
        if(first) first.focus();
      }
    });
    /* 二级项点击 → 立刻收起 + 写跨页交接暗号（软导航时 query 读不到，见 tbSubPending 注释）。
       不 preventDefault：让它走站内软导航那条路（模考锁/自愈刷新都在那套里）。 */
    panel.querySelectorAll('.tb-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.getAttribute('data-sub-page') || '';
        const sub = item.getAttribute('data-hub-sub') || '';
        const pageId = (PAGES.find(p => p.file === page) || {}).id;
        if(pageId && sub) tbSubHandoff(pageId, sub);
        tbCloseSub();
      });
    });
  });
  if(!window.__tbSubEscBound){
    window.__tbSubEscBound = true;
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && _tbSubOpenId){
        const a = document.querySelector('.tb-caps .tb-item[data-sub-for="' + _tbSubOpenId + '"]');
        tbCloseSub();
        /* 🔴 10-23 T-001c：打「刚被 Esc 关掉」的标，让上面的 focus 监听别又把面板展开
           （ Esc → focus 回 tab → 150ms 后又开 = Esc 按了没关，实测复现过）。 */
        if(a){ a.__tbEscJustClosed = Date.now(); a.focus(); }
      }
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
  const current = _hubCurrentFile || normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  _hubCurrentFile = current;   // 记住真实当前页，供软导航期间被 injectNav 复用（pathname 此时滞后）
  const pageById = id => PAGES.find(p => p.id === id);

  /* ⭐ 10-22 全站换顶栏（design/116 第 0 批）：壳改成**页面自己声明** ——
     `<body data-shell="top">` 就是顶栏，没有这个属性就是原 288px 侧栏。
     旧写法是写死 `current === 'home.html'`，导致每换一页都要改本文件（等于每批都得全站 bump）；
     现在以后每换一页只改那一页 HTML，本文件不再动。
     两个概念分开：data-shell = 「用哪种壳」；body.hub-home = 「这是首页驾驶舱」（home.css 的布局靠它）。 */
  const wantsTop = document.body.getAttribute('data-shell') === 'top';
  if(DATA.settings && DATA.settings.collapsed && !wantsTop) document.body.classList.add('side-collapsed');

  if(wantsTop){
    document.body.classList.toggle('hub-home', current === 'home.html');
    nav.className = 'hub-topbar';
    nav.setAttribute('aria-label', '顶部导航');
    nav.innerHTML = topBarHtml(current);
    bindTopBar();
    bindSideSearch();     // 顶栏搜索 = 侧栏那套 AI 智能搜索（同 id，逻辑零分叉）
    renderSideTimer();    // 全局计时徽标（顶栏右侧常驻）
    /* W-UI-1 公告条：先按已有缓存同步挂一次（软导航换页立刻就在位，不等网络），
       再拉 json 决定「挂 / 摘」。json 只有 2KB，且同会话只拉一次。 */
    ancEnsure();
    ancLoad().then(function(){ ancEnsure(); hubRefreshBell(); }).catch(function(){});
    /* W-UI-1 消息中心：铃铛绑定 + 红点首刷（json 到位后 ancEnsure 的 then 里还会再刷） */
    hubBindBell();
    return;
  }
  document.body.classList.remove('hub-home');
  /* W-UI-1：换回侧栏壳的页面没有顶栏，公告条若从上一页残留要清掉（ancEnsure 内部按
     data-shell 判定 → 非 top 壳一律摘条）。软导航跨壳时 injectNav 会走到这里。 */
  if(typeof ancEnsure === 'function') ancEnsure();
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
    + '<span class="side-brand-mark" aria-hidden="true">' + ICON.brand + '</span>'
    + '<div class="side-brand"><span class="bn">IELTS</span><span class="bs">雅思备考站</span></div>'
    + _meEl
    + '<button id="sideCollapseIn" class="side-collapse-in" type="button" aria-label="收起侧边栏" title="收起侧边栏">⟨</button>'
    + '</div>';
  /* 🔴 10-23 她「把所有页面计时条去掉」：侧边栏那份计时徽标容器也撤（顶栏那份同批撤）。
     两个容器都没了 → renderSideTimer()/updateSideTimerBadge() 拿不到 #sideTimer 直接返回，
     全站不再出现任何计时条/徽标。函数本体保留。 */
  // AI 智能搜索：输入中文搜站内功能跳转；输入英文单词/词组 AI 查词并自动入词库
  /* SRCH-UNIFY-1 笔 2（10-28）：侧栏这枚改用统一类 + 侧栏变体 `--side`（45px / 10px 圆角 / 字号 14），
     替换旧的 `.ui-search` / `.ui-search-icon` / `.ui-search-input`。
     🔴 `id="sideSearch"` / `ssPanel` / `ssList` 原样保留（bindSideSearch 靠它们取元素）。 */
  html += '<div class="side-search-wrap">'
    + '<label class="ui-field-search ui-field-search--side" for="sideSearch">'
    + '<svg class="ui-field-search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input class="ui-field-search-in" type="search" id="sideSearch" placeholder="搜功能 / 查单词" aria-label="搜索" autocomplete="off" title="输入中文搜功能；输入英文单词 AI 查词" />'
    + '</label>'
    + '<div class="ss-panel" id="ssPanel" hidden><div id="ssList"></div></div>'
    + '</div>';

  // v5：全部平铺无折叠 —— 首页→回顾 一级；设置/服药 在分隔线下方
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '<div class="side-sep" role="separator"></div>';
  for(const pid of MORE_NAV){
    const p = pageById(pid); if(!p || isNavHidden(p)) continue;   // 10-23 hidden 页（计时/服药）不进侧栏
    html += sideItem(p, current);
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
  /* 10-21 22:4x：'timer' 搜索条目已随入口一起撤掉（搜「计时」不再给出「去计时」结果）。 */
  { id:'plans',     kw:'计划 任务 清单 待办 每日 周计划 排程 plan' },
  { id:'practice',  kw:'单词 背单词 背词 词库 词汇 练习 学习 word' },
  { id:'corpus',    kw:'句子 长难句 错题 听写 语料 翻译 解码 sentence' },
  { id:'speaking',  kw:'口语 题库 串题 跟读 影子 part1 part2 part3 speaking' },
  { id:'writing',   kw:'写作 作文 模板 真题 评分 大作文 小作文 task1 task2 writing' },
  { id:'bank',      kw:'模考 题库 机考 刷题 真题 阅读 听力 写作 口语 练习 mock bank' },
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
    if(!page || isNavHidden(page)) continue;            // 10-23 hidden 页（计时/服药）搜不到
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

/* 🔴 10-23 T-015 后记：错句本独立页按她拍板删除（她原话「错句本它只是附属在作文模板界面的
   一个小模块，它没必要单独做一个 Tab」）。写作页底部折叠区「我的错句」（#wbArea）**保留** ——
   那是她明说保留的附属模块。PAGES 里 wrongbook 条目标 hidden 只为兼容老链接，不进任何清单。 */

/* 分组定义：唯一的结构来源。g.page 存在 = 直达；无 page = 弹组面板。 */
const GROUPED_DOCK = [
  { id:'index',  label:'首页', icon:'<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', page:'index' },
  /* 🔴 10-21 22:4x 计时撤掉后，计划组只剩「计划」一项 → 中间层 plans-hub 失去意义（她 22:1x 原话
     「计划这个模块点进去不应该就是纯是计划吗」）。这里改成**直达 plans.html**，
     少一次点击；plans-hub.html 变成孤儿页（文件先留着，随时可回滚）。 */
  { id:'plans',  label:'计划', icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/>',
    page:'plans', members:['plans'] },
  { id:'study',  label:'学习', icon:'<path d="M4 19.5V6a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-1.5z"/><path d="M4 19.5A2 2 0 0 1 6 18h13"/>',
    page:'study',     members:['practice','speaking','writing','bank','corpus'] },
  /* 10-23 她拍板删服药页入口 → members 去掉 'meds'（文件与 DATA.meds 保留）。
     timer 早在 10-21 就已从 members 撤掉（commit 47d39f9），这里不动。 */
  { id:'me',     label:'我的', icon:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    page:'me',        members:['review','vip','settings'] }
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

/* ===== S-1（10-24）统一搜索框清空按钮 =====
   一处绑定、全站生效：监听 `.ui-field-search-in` 的 input → 有值显示 ✕、无值隐藏；
   点 ✕ → 清空 + **派发 input 事件**（必须派发，否则页面自己的过滤逻辑不知道值已经清了，
   这是最容易漏的一步）+ 焦点回输入框。
   ⚠️ 只服务新类 `.ui-field-search`，不碰 `.ui-search-input` 的任何行为（红线）。 */
function initSearchClear(){
  const bindOne = inp => {
    if(inp.__fsBound) return;
    inp.__fsBound = true;
    const wrap = inp.closest('.ui-field-search');
    if(!wrap) return;
    const btn = wrap.querySelector('.ui-field-clear');
    if(!btn) return;
    const sync = () => { btn.hidden = !(inp.value || '').length; };
    inp.addEventListener('input', sync);
    btn.addEventListener('click', () => {
      inp.value = '';
      sync();
      inp.focus();
      /* 派发 input 让页面过滤逻辑收到「值已清」—— 不派发的话列表会停在筛选后的样子 */
      try{ inp.dispatchEvent(new Event('input', { bubbles: true })); }catch(e){}
    });
    sync();
  };
  document.querySelectorAll('.ui-field-search-in').forEach(bindOne);
  /* 幂等：软导航换 main 会插入新节点，用 MutationObserver 兜住后插入的输入框 */
  if(!window.__fsObserver && window.MutationObserver){
    window.__fsObserver = new MutationObserver(muts => {
      for(const m of muts){
        (m.addedNodes || []).forEach(n => {
          if(n.nodeType !== 1) return;
          if(n.matches && n.matches('.ui-field-search-in')) bindOne(n);
          if(n.querySelectorAll) n.querySelectorAll('.ui-field-search-in').forEach(bindOne);
        });
      }
    });
    try{
      window.__fsObserver.observe(document.body, { childList: true, subtree: true });
    }catch(e){}
  }
}

/* ===== 列表页即时搜索（配合统一搜索框 .ui-field-search 使用） =====
   用法：<input class="ui-field-search-in" data-search-input data-search-target="#planList" />
   过滤目标容器内「直接子元素」的文本；空查询恢复全部显示。无匹配选择器时安全跳过。
   ⚠️ SRCH-UNIFY-1 笔 2（10-28）：本函数按 `[data-search-input]` 属性取元素，与类名无关，
      所以旧类 `.ui-search-input` 下线不影响它；示例里只把类名换成新的，避免后人照着抄旧类。 */
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

/* 图表/状态栏配色：深浅第一位、三套外观第二位（THEME-2，10-26）。
   ink 就是品牌青墨（与 manifest.json 的 theme_color 一致，缺省态靠它兜底）。 */
var SCHEME_TC = { ink: '#3a9a93', cool: '#54748d', warm: '#78836c' };
function schemeNow(){
  try{ return document.documentElement.getAttribute('data-scheme') || 'ink'; }catch(e){ return 'ink'; }
}
function applyTheme(theme){
  theme = theme || DATA.settings.theme || 'light';
  if(theme === 'auto') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  /* 状态栏/安装窗口标题栏配色随主题联动。
     🔴 THEME-2（10-26）：浅色下**不再写死青墨** —— 读当前外观（data-scheme）。
        她原话：「要么白色要么主题色，我现在改了主题它还是这个颜色」。
        深色仍压倒外观（#0e1c1b 优先）：深浅是第一位，外观是第二位。 */
  var tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', theme === 'dark' ? '#0e1c1b' : (SCHEME_TC[schemeNow()] || SCHEME_TC.ink));
}

/* ═══ KIMI-THEME-1（10-26）· 三套「外观主题」跨页生效 ═══
   三套外观 = 青墨学术 ink（默认，= :root 原值）/ 学术冷色 cool / 纸感暖灰 warm，
   CSS 变量组在 css/common.css 开头那两块 [data-scheme="cool"] / [data-scheme="warm"]。

   🔴 为什么必须挂在这里：勾选控件住在 settings.html 的 js/settings.js，而那个文件**只有设置页引用**
      → 只在设置页写 data-scheme，软导航（同一个 document）看着正常，硬刷或从别页进站就丢。
      同款先例：上面 initThemeAutoWatch（TH-SYS）与 applyFontScale 的注释都写了「跨页生效必须挂公共链」。

   口径：
     · cool / warm → 写 data-scheme
     · ink / 没存过 / 非法值 → **删掉属性**（回到 :root 青墨，老用户零感知）
     · 🔴 bank.html 一律删属性、不写（她 10-25 定：考场不许跟外观主题联动）
     · 整块 try/catch：localStorage 被禁用也不许把 boot 链打断

   参数 file：软导航里 location 还没换（runPageScript 先于 pushState），
   必须由调用方把目标文件名传进来；不传才回落到 location。 */
function applyScheme(file){
  try{
    var v = null;
    try{ v = localStorage.getItem('hub_theme_scheme'); }catch(e){ v = null; }
    if(v === 'cool' || v === 'warm') document.documentElement.setAttribute('data-scheme', v);
    else document.documentElement.removeAttribute('data-scheme');
    /* THEME-3（10-26）：原来这里对 bank.html **整页摘属性**（KIMI-THEME-1 那批的红线），
       她今天报「模考页没有跟主题色适配」→ 那条边界收窄为「**列表态跟主题、考场态不跟**」：
       整页摘除这一支删掉了。考场隔离不再靠属性、靠**元素层**保证 ——
       考场（#examRoot / body.exam-fullscreen）里的颜色是 10-22 官方复刻批写死的 hex，
       一个 var(--primary-*) 都没用（_probe_examroot_1026 实测逐值比对为证）。
       ⚠️ 以后谁在考场里加 var(--primary-*) 都会被三套外观带偏 —— 那里请继续写死官方色。
       参数 file 保留（调用方仍在传），暂时不参与判定。 */
    void file;
    /* THEME-2（10-26）：切外观时同步状态栏/安装窗口标题栏色。
       深浅仍压倒外观 —— 深色下保持 applyTheme 写好的 #0e1c1b。 */
    syncSchemeThemeColor();
  }catch(e){}
}
/* 按「当前外观 + 当前深浅」写 meta theme-color。
   调用点：applyScheme（切外观 / 每次进页面）与 applyTheme（深浅变了）。
   依赖顺序：boot 链是 applyTheme() → applyScheme()，所以两者都写一遍，谁后跑都对。 */
function syncSchemeThemeColor(){
  try{
    var tc = document.querySelector('meta[name="theme-color"]');
    if(!tc) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    tc.setAttribute('content', dark ? '#0e1c1b' : (SCHEME_TC[schemeNow()] || SCHEME_TC.ink));
  }catch(e){}
}
/* 设置页点三选一时，data-scheme 是 js/settings.js（页面层）**直接写**的，不走 applyScheme →
   状态栏色不会跟着变（她报的就是这个现场）。这里挂一个属性观察者兜住所有写入方，
   共用层不用去改页面层文件。幂等：window 标记挡重复绑。 */
(function initSchemeColorWatch(){
  try{
    if(window.__schemeColorWatchBound) return;
    if(typeof MutationObserver !== 'function') return;
    var el = document.documentElement;
    if(!el) return;
    window.__schemeColorWatchBound = true;
    new MutationObserver(function(muts){
      for(var i = 0; i < muts.length; i++){
        if(muts[i].attributeName === 'data-scheme'){ syncSchemeThemeColor(); return; }
      }
    }).observe(el, { attributes: true, attributeFilter: ['data-scheme'] });
  }catch(e){}
})();

/* ═══ TH-SYS（10-25）：主题「跟随系统」—— 监听系统偏好变化 ═══
   背景：applyTheme 里 'auto' 这一档**早就支持**（上面 :1621-1622），但只在调用那一刻读一
   次系统偏好。用户中途把系统切深色，页面纹丝不动，要刷新才生效 —— 她 01:4x 要的就是这个。

   🔴 放这里（common.js，20 页共用）而不是 settings.js：跨页生效必须挂公共链。
   🔴 只加监听，不动 applyTheme 原有分支（施工书 §四 边界）。
   ⚠️ 只有 DATA.settings.theme === 'auto' 时才跟；手动 light/dark 时系统怎么切都不动。
   ⚠️ 幂等：软导航只换 <main> 不重跑本文件，但万一重跑，用 window 标记挡住重复绑。 */
(function initThemeAutoWatch(){
  try{
    if(window.__themeAutoWatchBound) return;
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if(!mq) return;
    window.__themeAutoWatchBound = true;
    var onChange = function(){
      try{
        if(!DATA || !DATA.settings || DATA.settings.theme !== 'auto') return;   // 只有 auto 档才跟
        var t = mq.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t);
        var tc2 = document.querySelector('meta[name="theme-color"]');
        if(tc2) tc2.setAttribute('content', t === 'dark' ? '#0e1c1b' : '#3a9a93');
      }catch(e){}
    };
    if(mq.addEventListener) mq.addEventListener('change', onChange);
    else if(mq.addListener) mq.addListener(onChange);   // 老 Safari
  }catch(e){}
})();

/* ===== 10-23 T-002 步5：正文字号三档 + 减少动效（全站级，每页生效）=====
   之所以放 common.js 而不是 settings.js：settings.js 只有设置页引用，
   「跨页生效」必须挂在每页都加载的公共链上（与 applyTheme 同一个道理、同一个入口）。
   启动时由 common-pwa.js 的 boot 链调用（applyTheme() 旁边）；
   设置页切换时由 js/settings.js 调用并落库。 */
function applyFontScale(mode){
  try{
    if(mode === 'sm' || mode === 'lg'){ document.documentElement.setAttribute('data-font', mode); }
    else { document.documentElement.removeAttribute('data-font'); }   // md = 标准 = 无属性
  }catch(e){}
}
function applyReduceMotion(on){
  try{
    if(on === true){ document.documentElement.setAttribute('data-reduce-motion', '1'); }
    else { document.documentElement.removeAttribute('data-reduce-motion'); }
  }catch(e){}
}
function applyStep5Prefs(){
  const s = (typeof DATA !== 'undefined' && DATA.settings) || {};
  const f = s.fontScale;
  applyFontScale((f === 'sm' || f === 'lg') ? f : 'md');
  applyReduceMotion(s.reduceMotion === true);
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
  function speak(text, btn, rate){
    if(typeof speechSynthesis === 'undefined'){ if(typeof toast === 'function') toast('当前浏览器不支持语音播放'); return; }
    text = (text || '').trim();
    if(!text) return;
    try{ speechSynthesis.cancel(); }catch(_){}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    const v = pickVoice(); if(v) u.voice = v;
    u.rate = (typeof rate === 'number' && rate > 0.3 && rate < 2) ? rate : 0.95;
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