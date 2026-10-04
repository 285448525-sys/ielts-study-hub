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
        { id:'plans',    name:'计划', desc:'每日清单 + AI 智能排周',   accent:true },
        { id:'timer',    name:'计时', desc:'选模块开计时 · 番茄钟' }
      ]
    },
    study: {
      key:'study', title:'学习', tagline:'背单词、口语、写作、句子——四个都在这儿',
      items:[
        { id:'practice', name:'单词', desc:'学习与管理你的单词' },
        { id:'speaking', name:'口语', desc:'题库 + AI 串题 + 陪练' },
        { id:'writing',  name:'写作', desc:'模板 + AI 评分' },
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
    const byBody = document.body.getAttribute('data-hub-group');
    if(byBody && GROUPS[byBody]) return byBody;
    return fromFile(location.pathname.split('/').pop() || '')
        || fromFile(typeof _hubCurrentFile !== 'undefined' ? _hubCurrentFile : '');
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
    if(G.key === 'me' && medsOn()) items.push({ id:'meds', name:'服药', desc:'专注达药效窗口' });

    let h = '';
    h += '<div class="hubg-head">'
      +   '<h1>' + esc(G.title) + '</h1>'
      +   '<p>' + esc(G.tagline) + '</p>'
      + '</div>';
    h += '<div class="hubg-grid">';
    for(const it of items){
      const p = pageById ? pageById(it.id) : null;
      const file = p ? p.file : (it.id + '.html');
      const icon = p ? p.icon : '';
      const on = (p && p.file === cur) ? ' cur' : '';
      h += '<a class="hubg-card' + on + (it.accent ? ' accent' : '') + '" href="' + file + '" data-id="' + it.id + '">'
        +   '<span class="hubg-ic">' + icon + '</span>'
        +   '<span class="hubg-tx">'
        +     '<b>' + esc(it.name) + '</b>'
        +     '<span>' + esc(it.desc || '') + '</span>'
        +   '</span>'
        +   '<span class="hubg-ar" aria-hidden="true">'
        +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
        +   '</span>'
        + '</a>';
    }
    h += '</div>';
    /* 底部提示条：她 12:10 报过「入口找不到」，这里明确告诉她「从侧栏也能进所有页面」 */
    h += '<p class="hubg-note">桌面端左侧栏仍列出全部页面；这里只是把常用的挑出来放一屏。</p>';
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
      if(g && (g !== lastGroup || g !== shown || !root.querySelector('.hubg-card'))){
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
