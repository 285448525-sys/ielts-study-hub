/* ==========================================================================
   组页模板（三页共用一个脚本）— plans-hub.html / study.html / me.html

   背景（她 18:41 原话）：
     「我要的不是点了下面那个键然后弹出来两个…我就要一整个界面就行了」
   上一版（GROUPED_DOCK + 组面板浮层）她不满意：弹层不是页面，要的是**完整界面**。
   改法：底部 4 格不变（首页直达 + 计划/学习/我的 三个新页面），点后三格**跳整页**，
        页内每个模块是一张卡，点进原来的 plans.html / timer.html / …（原页面零改动）。

   三页的唯一差异 = body 上的 data-hub-group，以及「今天建议」那一句文案。
   逻辑全在这个脚本里 —— 加第四个组页只需再加一个 HTML + 在 GROUPS 里加一条。
   ========================================================================== */
(function(){
  'use strict';

  /* ============ 组定义（唯一数据源）============ */
  const GROUPS = {
    plans: {
      key:'plans', title:'计划', tagline:'今天要做什么、这周怎么排，都在计划里',
      items:[
        /* 10-21 22:4x：她拍板「直接不要计时了」→ 计时卡撤掉。
           组里只剩「计划」一项，等于没有「组」的意义 → 手机底栏「计划」格已改成直达 plans.html。 */
        { id:'plans',    name:'计划', desc:'每日清单 + AI 智能排周',   accent:true }
      ]
    },
    study: {
      key:'study', title:'学习', tagline:'模考、口语、写作、单词、句子——都在这儿',
      items:[
        /* 10/12 22:16 她拍板「模考优先」：与侧栏 PRIMARY_NAV 同口径重排 */
        { id:'bank',     name:'模考', desc:'阅读 · 听力 · 写作 · 口语' },
        { id:'speaking', name:'口语', desc:'题库 + AI 串题 + 陪练' },
        { id:'writing',  name:'写作', desc:'模板 + AI 评分' },
        { id:'practice', name:'单词', desc:'学习与管理你的单词' },
        { id:'corpus',   name:'句子', desc:'长难句 · 错题 · 听写' }
      ]
    },
    me: {
      key:'me', title:'我的', tagline:'成绩轨迹、会员权益、设置与数据',
      items:[
        { id:'review',   name:'回顾', desc:'模考成绩 + 学习轨迹' },
        { id:'vip',      name:'会员', desc:'AI 无限用 + 专属权益' },
        { id:'settings', name:'设置', desc:'同步 / AI / 数据 / 账号' }
      ]
    }
  };


/* ==========================================================================
   T-011 · 三个组页版式统一（2026-10-23）—— 样式由 hubgroup.js 注入
   为什么放这里而不是 css/p/*.css：三页（me/study/plans-hub）**都没引** css/p/*.css，
   加一个文件要改三个 HTML 的 <head> + 进 SW 的 PRECORE；而 hubgroup.js 本来就是
   三页共用 + 已在 PRECORE 里，注入零新增请求。
   视觉基准 = 口语页 T-004：驾驶舱统计格（.hg-stats）+ 通栏行卡片（.hg-card）。
   ⚠️ 只改渲染层：GROUPS 数据、链接逻辑、重定向全部不动。
   ========================================================================== */
const HUBG_CSS = `
#hubGroupRoot{max-width:1040px;margin:0 auto}
.hg-head{padding:4px 2px 16px;border-bottom:1px solid var(--n-300);margin-bottom:18px}
.hg-head h1{margin:0 0 6px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-.02em;color:var(--n-900)}
.hg-head p{margin:0;font-size:13.5px;line-height:1.7;color:var(--n-500)}
/* 状态摘要条（驾驶舱式三格；数据源必须真实存在，没有就整条不渲染 —— 见 renderStats） */
.hg-stats{display:grid;grid-template-columns:repeat(3,1fr);margin:0 0 18px;
  background:var(--n-0);border:1px solid var(--n-300);border-radius:16px;box-shadow:var(--sh-2);padding:18px 22px}
.hg-stat-cell{padding-right:18px;min-width:0}
.hg-stat-cell + .hg-stat-cell{padding-left:20px;border-left:1px solid var(--n-300)}
.hg-stat-k{font-size:12px;color:var(--n-500)}
.hg-stat-v{display:flex;align-items:baseline;gap:5px;margin-top:3px;font-size:20px;font-weight:700;
  color:var(--primary-700);font-variant-numeric:tabular-nums;line-height:1.1}
.hg-stat-v i{font-style:normal;font-size:12.5px;font-weight:500;color:var(--n-500)}
/* 入口卡：宽屏 2-3 列、窄屏单列 */
.hg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:860px){.hg-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.hg-grid{grid-template-columns:1fr}}
.hg-card{
  display:flex;align-items:center;gap:13px;min-height:78px;padding:15px 16px;
  background:var(--n-0);border:1px solid var(--n-300);border-radius:14px;
  text-decoration:none;color:inherit;box-shadow:var(--sh-1);
  transition:border-color .16s,box-shadow .16s,background .16s;
}
.hg-card:active{transform:scale(.985)}
.hg-card:hover{border-color:var(--primary-200);background:var(--primary-50);box-shadow:var(--sh-2)}
.hg-card:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(58,154,147,.25)}
.hg-card.cur{background:var(--primary-50);border-color:var(--primary-200)}
.hg-card.cur .hg-ic{background:var(--primary-200);color:var(--primary-800)}
.hg-card.accent{border-color:var(--primary-200)}
.hg-card.accent .hg-ic{background:var(--primary-200);color:var(--primary-800)}
.hg-ic{width:44px;height:44px;flex:none;border-radius:13px;background:var(--n-100);color:var(--n-500);
  display:flex;align-items:center;justify-content:center;transition:background .16s,color .16s}
.hg-ic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hg-tx{min-width:0;flex:1}
.hg-tx b{display:block;font-size:15.5px;font-weight:600;color:var(--n-800);line-height:1.3;letter-spacing:-.01em}
.hg-tx span{display:block;font-size:12.5px;color:var(--n-500);margin-top:3px;line-height:1.5}
.hg-ar{color:var(--n-400);flex:none}
.hg-ar svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.hg-card:hover .hg-ar{color:var(--primary-600)}
.hg-note{margin:18px 2px 0;font-size:12.5px;line-height:1.75;color:var(--n-500)}
/* 空态：引导文案 + 按钮，不许白板一块 */
.hg-empty{background:var(--n-0);border:1px solid var(--n-300);border-radius:14px;padding:22px 20px;text-align:center}
.hg-empty p{margin:0 0 12px;font-size:13.5px;line-height:1.7;color:var(--n-600)}
.hg-empty .btn{display:inline-flex;align-items:center;gap:6px}
/* T-011 追加（她 10-23「把手机端的上栏全部摘掉」）：手机窄屏（≤860，与底栏/桌面重定向同口径）
   组页**隐藏全站顶栏**（44px 那条），只留底部 dock 4 格导航 —— 组页本身就是入口聚合页，
   顶栏里的导航跟卡片是重复信息，留着只是白占一屏高度。
   ⚠️ 只对组页生效（body[data-hub-group]），别的页面顶栏照旧；桌面 >860 不隐藏。 */
@media(max-width:860px){
  /* 🔴 真实类名是 .hub-topbar（不是 .top-nav）：common.js:276 injectNav 会**覆盖** nav.className，
     把 HTML 里的 .top-nav 换成 .hub-topbar —— 只写 .top-nav 等于打空气（我第一次就打偏了）。
     两个都写：class 换之前/之后都能命中。 */
  body[data-hub-group] .top-nav,
  body[data-hub-group] .hub-topbar{display:none !important}
  /* 🔴 第二个坑：body 上还有 padding-top:44px（顶栏占位，common.css 的 .hub-topbar 规则）
     —— 顶栏 display:none 之后这 44px 依然占着，页面顶部会空一条。
     实测：只隐藏顶栏后 main 的 top 仍是 44px（= 一条空白），body padding 归零才回到 14px。 */
  body[data-hub-group]{padding-top:0 !important}
  body[data-hub-group] main.container{padding-top:14px !important}
}
@media(max-width:720px){
  .hg-stats{grid-template-columns:1fr;gap:14px;padding:16px}
  .hg-stat-cell + .hg-stat-cell{padding-left:0;padding-top:14px;border-left:0;border-top:1px solid var(--n-300)}
}
`;
function injectHubgCss(){
  if(document.getElementById('hubgT011Css')) return;
  const st = document.createElement('style');
  st.id = 'hubgT011Css';
  st.textContent = HUBG_CSS;
  document.head.appendChild(st);
}

/* 状态摘要条 —— 只读真实数据，拿不到就整条不渲染（禁忌 3：不许假数据）。
   数据源全部已存在：
     · calcStreak()（common.js:1260，连续学习天数；首页/计时页同款口径）
     · examCountdown()（common.js:1235，距考试天数）
     · DATA.mockRecords / DATA.scores 的条数
   ⚠️ 三页共用同一份摘要（她看的是「我学了多少」这件事，不分哪个组）；
      任一项拿不到就只显示拿得到的，全拿不到 → 整条不渲染。 */
function renderStats(){
  try{
    const cells = [];
    if(typeof calcStreak === 'function'){
      const n = calcStreak();
      cells.push({ k:'连续学习', v:String(n), u:'天' });
    }
    if(typeof examCountdown === 'function'){
      const cd = examCountdown();
      if(cd && cd.hasExam && cd.daysLeft != null && cd.daysLeft >= 0){
        cells.push({ k:'距考试', v:String(cd.daysLeft), u:'天' });
      }
    }
    let recN = 0;
    if(typeof DATA !== 'undefined'){
      recN = (DATA.mockRecords ? DATA.mockRecords.length : 0) + (DATA.scores ? DATA.scores.length : 0);
    }
    if(recN > 0) cells.push({ k:'已记录模考', v:String(recN), u:'次' });
    if(!cells.length) return '';
    return '<div class="hg-stats">' + cells.map(c =>
      '<div class="hg-stat-cell"><div class="hg-stat-k">' + esc(c.k) + '</div>'
      + '<div class="hg-stat-v">' + esc(c.v) + '<i>' + esc(c.u) + '</i></div></div>'
    ).join('') + '</div>';
  }catch(e){ return ''; }   // 任何一项取不到 → 整条不渲染，绝不留半截
}

  /* ============ 药丸模块「服药」：仅在开启时出现（她 10/2 拍板的原则）============
     复用 common.js 的 medsModuleOn()；这里再兜一层 —— 拿不到函数时**默认不显示**
     （宁缺勿滥：她 17:54 说「服药平常不开着」，不该看到一个点不动的入口）。 */
  function medsOn(){
    try{ return (typeof medsModuleOn === 'function') ? !!medsModuleOn() : false; }
    catch(e){ return false; }
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }

  /* 🔴 10/4 18:45 组是**从 URL 认**的，不是读 body 属性。
     坑：软导航（softNavigate）**只换 <main> 内容，不动 <body> 的属性** ——
     探针实锤「从底部『计划』格进组页 → 卡片 0 张、显示『页面配置有误』」，
     因为 body 上的 data-hub-group 停留在 home.html 的（= null）。
     两条来源都要认：① URL 里的文件名（软导航会 pushState 改 pathname，最可靠）
                    ② body 属性（首屏直接打开时 pathname 也是对的，双保险）。 */
  function fromFile(f){
    f = String(f || '');
    if(f.indexOf('plans-hub') === 0) return 'plans';
    if(f.indexOf('study') === 0) return 'study';
    if(/^me(\.html)?$/.test(f)) return 'me';      // 用正则而不是前缀，避开 meds/member 之类
    return null;
  }
  function hostGroup(){
    /* 🔴 10/6 01:12 **优先级反转**（这就是「点计划/我的，渲染出来全是学习页」的正病根）。
       旧写法把 `body[data-hub-group]` 排第一 —— 可软导航只换 <main> 不动 <body>，
       那个属性永远停在**第一次硬加载的那张组页**上，于是之后进哪个组都渲染成同一个。
       现在：① 当前文件（_hubCurrentFile，导航层在换 main 时统一写入，最可靠）
            ② URL pathname（直接打开 / 浏览器后退时它先变）
            ③ body 属性（最后兜底；软导航层现已同步它，见 common.js syncBodyPageAttrs） */
    const byFile = fromFile(typeof _hubCurrentFile !== 'undefined' ? _hubCurrentFile : '')
                || fromFile(location.pathname.split('/').pop() || '');
    if(byFile && GROUPS[byFile]) return byFile;
    const byBody = document.body.getAttribute('data-hub-group');
    if(byBody && GROUPS[byBody]) return byBody;
    return byFile || byBody;
  }

  function render(){
    const root = document.getElementById('hubGroupRoot');
    const G = GROUPS[hostGroup()];
    if(!root || !G){ if(root) root.innerHTML = '<div class="empty">页面配置有误</div>'; return; }

    const pageById = (typeof PAGES !== 'undefined')
      ? id => PAGES.find(x => x.id === id) : null;
    const cur = (typeof _hubCurrentFile !== 'undefined' && _hubCurrentFile)
      || (typeof normalizePageFile === 'function' ? normalizePageFile(location.pathname.split('/').pop() || '') : '');

    const items = G.items.slice();
    /* 🔴 10-23 她拍板「把服药页计时页删掉不用做」→ 服药入口从「我的」组撤掉。
       medsOn()/medsModuleOn() 保留（plans.js 的 AI prompt 仍读它拼服药上下文，别动）。 */
    // if(G.key === 'me' && medsOn()) items.push({ id:'meds', name:'服药', desc:'专注达药效窗口' });
    /* 三级权限（10-22 第二批）：管理员在「我的」组里也能进「学生数据」。
       手机端底部 dock 只有四个组、侧栏是抽屉 —— 这里是最容易被找到的位置。
       角色读本地缓存（普通用户 / 未登录 → 看不到）；真正的门在 /api/roles。 */
    if(G.key === 'me' && typeof hubIsAdmin === 'function' && hubIsAdmin()){
      items.unshift({ id:'teacher', name:'学生数据', desc:'绑定学生的学情（只读）' });
    }

    injectHubgCss();
    let h = '';
    h += '<div class="hg-head">'
      +   '<h1>' + esc(G.title) + '</h1>'
      +   '<p>' + esc(G.tagline) + '</p>'
      + '</div>';
    /* T-011：状态摘要条（驾驶舱式三格）。数据拿不到就不渲染（禁忌：不许假数据）。 */
    h += renderStats();
    h += '<div class="hg-grid">';
    for(const it of items){
      const p = pageById ? pageById(it.id) : null;
      const file = p ? p.file : (it.id + '.html');
      const icon = p ? p.icon : '';
      const on = (p && p.file === cur) ? ' cur' : '';
      h += '<a class="hg-card' + on + (it.accent ? ' accent' : '') + '" href="' + file + '" data-id="' + it.id + '">'
        +   '<span class="hg-ic">' + icon + '</span>'
        +   '<span class="hg-tx">'
        +     '<b>' + esc(it.name) + '</b>'
        +     '<span>' + esc(it.desc || '') + '</span>'
        +   '</span>'
        +   '<span class="hg-ar" aria-hidden="true">'
        +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
        +   '</span>'
        + '</a>';
    }
    h += '</div>';
    /* T-011：没有可展示的入口时给引导（不许白板一块）。plans 组现在只剩「计划」一项，
       真变空时这里就是唯一出口 —— 文案指向顶栏导航，不编造不存在的功能。 */
    if(!items.length){
      h += '<div class="hg-empty"><p>这一组暂时没有可进的页面。</p>'
        +  '<a class="btn btn-primary" href="home.html">回首页</a></div>';
    }
    /* 底部提示条：她 12:10 报过「入口找不到」，这里明确告诉她「导航里也能进所有页面」
       10-22 换顶栏后原话「桌面端左侧栏仍列出全部页面」已不成立（这三个页面没有侧栏了）→ 改成导航口径。 */
    h += '<p class="hg-note">导航里都能进这些页面；这里只是把常用的挑出来放一屏。</p>';
    root.innerHTML = h;
    root.setAttribute('data-shown-group', G.key);   // 供跨组软导航的 repaint 比对
  }

  /* ⚠️ 门控：等 **两个** 条件都满足才渲染（10/4 18:45 软导航实测踩出来的）。
     条件 A：common.js 已就绪（PAGES 可用）
     条件 B：**hostGroup() 认得出组** —— 软导航时脚本由 eval 跑，**此刻 pushState 可能还没发生**，
              location.pathname 还是上一个页面（探针实锤：pathname 已是 /plans-hub.html 但
              脚本执行时读到的是 home.html 的路径 -> 认不出组 -> 显示「页面配置有误」）。
     所以 B 不满足时**继续等**（最多 40 次 × 100ms = 4s），而不是直接报错。 */
  function boot(){
    let tries = 0;
    const tryRender = function(){
      const havePages = (typeof PAGES !== 'undefined');
      const haveGroup = !!hostGroup();
      if(havePages && haveGroup){ render(); return true; }
      if(havePages && !haveGroup && typeof _hubCurrentFile !== 'undefined' && _hubCurrentFile){
        // 软导航里：_hubCurrentFile 由 updateActiveNav 提前写好，比 pathname 可靠
        const f = String(_hubCurrentFile);
        if(f.indexOf('plans-hub') === 0) return render(), true;
        if(f.indexOf('study') === 0) return render(), true;
        if(f.indexOf('me') === 0) return render(), true;
      }
      return false;
    };
    if(tryRender()) return;
    const iv = setInterval(function(){
      tries++;
      if(tryRender()){ clearInterval(iv); return; }
      if(tries > 40){ clearInterval(iv); render(); }   // 兜底：宁可显示「配置有误」也别空白
    }, 100);
  }
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  /* ---- 🔴 10/4 18:50 跨组软导航的必答题（探针实锤）----
     上一版只在 boot() 里渲染 + 绑几个事件，于是：
       study.html -> 点底部「计划」-> plans-hub.html
       **落地显示的还是「学习」的内容**（h1=学习、4 张卡）——因为
       ① 软导航只换 <main>，旧组的 hubGroupRoot 里那张卡列表还在；
       ② hubgroup.js 是 IIFE，软导航时虽然会再 eval 一次，但 boot() 的
          「hostGroup 认得出组」在那一刻还没成立（pushState 未完成）-> 走到兜底分支。
     正解：用一个**全局单例**把「组变了就重渲染」注册一次（window.__HUBG_WATCH 标记防重复），
     监听 <main> 的子树变化 —— 组页之间互跳时 root 会被替换/复用，这里都能兜住并重画。 */
  if(!window.__HUBG_WATCH){
    window.__HUBG_WATCH = true;
    let lastGroup = null;
    const repaint = function(){
      const root = document.getElementById('hubGroupRoot');
      if(!root) return;                 // 不是组页 -> 不管
      const g = hostGroup();
      const shown = root.getAttribute('data-shown-group') || null;
      // 条件：组认出来了 且（组变了 或 还没画过卡）
      if(g && (g !== lastGroup || g !== shown || !root.querySelector('.hg-card'))){
        lastGroup = g;
        render();
      }
    };
    window.addEventListener('popstate', function(){ setTimeout(repaint, 0); });
    window.addEventListener('hub:page-shown', function(){ setTimeout(repaint, 0); });
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) repaint(); });
    try{
      const main = document.querySelector('main');
      if(main && window.MutationObserver){
        new MutationObserver(function(){ setTimeout(repaint, 0); })
          .observe(main, { childList:true, subtree:true });
      }
    }catch(e){}
    // 首屏也走一次
    setTimeout(repaint, 0);
  }
})();
