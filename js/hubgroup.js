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
    /* 10-23 T-014：「回顾」提为顶栏一级入口（跟单词/句子/计划平级），当时从本组摘掉。
       🔴 10-23 同批修回来：那个“已提一级”的前提在**手机端不成立** ——
       手机端顶栏整条不渲染，而级别胶囊 .tb-caps 本来就是 display:none，
       “更多”面板又在 T-014 里被收到会员/设置 → 手机端「回顾」曾经零入口（实测）。
       现在放回「我的」组页，作为手机端（dock「我的」格）的入口；桌面端顶栏胶囊一级入口照旧不变。
       同一页两处出现的高亮分叉问题：组页高亮走 dockGroupOfPage 的归属映射，不看 items里有没有它。 */
    me: {
      key:'me', title:'我的', tagline:'回顾、会员与设置',
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
/* ===== 10-23 第一批 1-1：手机组页首屏补两处入口（她 17:0x「要我点头的都默认可以」）=====
   背景：手机端 ≤860 整条顶栏不渲染（B-1d），原来顶栏里的搜索框与头像登录入口在手机没有了。
   实测口径（1-1 示意图已给她看过）：手机端从来没搜过（.tb-search 自 T-011 起就 display:none），
   登录改走「我的→设置→引导键」两步。这两处就是补回来的唯一合理位置。 */
.hg-loginbar{
  display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:13px 16px;
  background:var(--primary-50);border:1px solid var(--primary-100);border-radius:14px;
}
.hg-loginbar .lb-tx{min-width:0;flex:1}
.hg-loginbar b{display:block;font-size:13.5px;font-weight:600;color:var(--n-800);line-height:1.35}
.hg-loginbar span{display:block;font-size:12px;color:var(--n-500);margin-top:2px;line-height:1.5}
.hg-loginbar a.lb-a{
  flex:none;display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 14px;
  background:var(--primary-500);color:var(--on-primary);border-radius:999px;
  font-size:13px;font-weight:600;text-decoration:none;transition:background .16s;
}
.hg-loginbar a.lb-a:hover{background:var(--primary-600)}
/* 搜索卡：与 hg-card 同构，只多一个「新」角标与按下去的浮层 */
.hg-search-card{cursor:pointer}
.hg-newbadge{
  flex:none;margin-left:2px;padding:1px 6px;border-radius:6px;background:var(--primary-100);
  /* 🔴 深色主题只重定义 --primary-50/100/500/700 四档 —— --primary-800 不翻，深底上深青字
     （实测 rgba(92,179,171,.22) 底 + #235e5a 字 = 几乎看不见）。改 --primary-700：深色下是亮青。 */
  color:var(--primary-700);font-size:10.5px;font-weight:700;letter-spacing:.02em;line-height:1.5;
}
/* 组页搜索浮层（复用全站 .ss-item/.ss-empty 样式，这里只管外框/位置） */
.hg-search{margin:0 0 14px}
.hg-search .hs-box{
  display:flex;align-items:center;gap:9px;padding:0 14px;height:44px;
  background:var(--n-0);border:1px solid var(--n-300);border-radius:12px;box-shadow:var(--sh-1);
}
.hg-search .hs-box:focus-within{border-color:var(--primary-400);box-shadow:0 0 0 3px rgba(58,154,147,.16)}
.hg-search .hs-box svg{width:17px;height:17px;flex:none;color:var(--n-400)}
.hg-search input{
  flex:1;min-width:0;border:0;background:none;outline:none;font:inherit;font-size:14px;color:var(--ink);
}
.hg-search input::placeholder{color:var(--n-400)}
.hg-search .hs-close{
  flex:none;width:28px;height:28px;border:0;background:none;border-radius:8px;cursor:pointer;
  color:var(--n-500);font-size:17px;line-height:1;
}
.hg-search .hs-close:hover{background:var(--n-100);color:var(--n-800)}
.hg-search .hs-list{margin-top:8px}
.hg-search .hs-list .ss-item{border-radius:10px}
/* 空态：引导文案 + 按钮，不许白板一块 */
.hg-empty{background:var(--n-0);border:1px solid var(--n-300);border-radius:14px;padding:22px 20px;text-align:center}
.hg-empty p{margin:0 0 12px;font-size:13.5px;line-height:1.7;color:var(--n-600)}
.hg-empty .btn{display:inline-flex;align-items:center;gap:6px}
/* 🔴 10-23：这里原本有一段 @media(max-width:860px){ body[data-hub-group] 隐藏顶栏 }，
   现已删 —— “手机端整条顶栏不渲染”已提到全站共享壳 css/common.css 的 ≤860 段
   （她 08:1x 原话「手机上栏全部摘掉」的**全站**范围）。
   三个组页也有 body[data-shell="top"]（实测），所以全站规则已经覆盖它们，留着只会两处 !important 打架；
   而且原来那句 body[data-hub-group] main.container{padding-top:14px !important} 还会把
   「≤560px 时 container padding-top:10px」的全站口径顶掉 → 组页与其他页在手机上反而不一致。 */
@media(max-width:720px){
  .hg-stats{grid-template-columns:1fr;gap:14px;padding:16px}
  .hg-stat-cell + .hg-stat-cell{padding-left:0;padding-top:14px;border-left:0;border-top:1px solid var(--n-300)}
}

/* ===== MOBILE-GROUP-1（11-09）：手机「学习 / 我的」两页各自的样子 =====
   study 用 Today 屏（问候 + 距考试 + 今日目标 + 接着练 + 双列入口），
   me 用个人中心（身份区 + 会员卡 + 单列常用列表）。
   只用本文件已注入的站点变量与字面色，不新增外部依赖。 */
.ln-hero{position:relative;overflow:hidden;border-radius:18px;padding:20px 18px 18px;margin:2px 2px 14px;color:#fff;background:linear-gradient(155deg,#3a8f87 0%,#2f7d76 58%,#256a64 100%);box-shadow:0 12px 26px -14px rgba(47,125,118,.7)}
.ln-hero::after{content:"";position:absolute;right:-50px;top:-60px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.10)}
.ln-date{font-size:11.5px;letter-spacing:.04em;opacity:.85;position:relative}
.ln-hi{font-size:22px;font-weight:750;letter-spacing:-.02em;margin:6px 0 3px;position:relative}
.ln-sub{font-size:12.5px;opacity:.9;position:relative}
.ln-goal{position:relative;margin-top:16px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:11px 13px}
.ln-goal .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:12px;font-weight:600}
.ln-goal .top b{font-size:12px;text-align:right}
.ln-track{height:6px;border-radius:999px;background:rgba(255,255,255,.28);margin-top:10px;overflow:hidden}
.ln-track i{display:block;height:100%;border-radius:999px;background:#fff;transition:width .3s}
.ln-resume{display:flex;align-items:center;gap:13px;background:var(--n-0);border:1px solid var(--n-300);border-radius:16px;padding:15px 16px;margin:0 2px 16px;box-shadow:var(--sh-1)}
.ln-resume .ic{width:44px;height:44px;flex:none;border-radius:14px;background:var(--primary-50);color:var(--primary-700);display:flex;align-items:center;justify-content:center}
.ln-resume .ic svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.ln-resume .tx{flex:1;min-width:0}
.ln-resume .tx small{display:block;font-size:11.5px;color:var(--n-500)}
.ln-resume .tx b{display:block;font-size:14.5px;font-weight:700;color:var(--n-800);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ln-resume .go{flex:none;background:var(--primary-700);color:#fff;border-radius:999px;padding:8px 15px;font-size:12.5px;font-weight:700;text-decoration:none}
.sec-t{display:flex;justify-content:space-between;align-items:baseline;margin:0 2px 10px}
.sec-t b{font-size:14px;font-weight:700;color:var(--n-800)}
.sec-t span{font-size:11.5px;color:var(--n-500)}
.ln-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 2px}
.ln-tile{background:var(--n-0);border:1px solid var(--n-300);border-radius:14px;padding:13px 13px 12px;min-height:92px;box-shadow:var(--sh-1);display:flex;flex-direction:column;gap:5px;text-decoration:none;color:inherit}
.ln-tile .ic{width:30px;height:30px;border-radius:10px;background:var(--primary-50);color:var(--primary-700);display:flex;align-items:center;justify-content:center}
.ln-tile .ic svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.ln-tile b{font-size:13.5px;font-weight:700;color:var(--n-800)}
.ln-tile span{font-size:11px;color:var(--n-500);line-height:1.45}
.ln-tile.soft{background:transparent;border-style:dashed;box-shadow:none}
.ln-login{margin:16px 2px 0}
.me-id{display:flex;align-items:center;gap:13px;background:var(--n-0);border:1px solid var(--n-300);border-radius:16px;padding:16px;margin:2px 2px 12px;box-shadow:var(--sh-1)}
.me-av{width:52px;height:52px;flex:none;border-radius:50%;background:var(--primary-50);border:2px solid #fff;box-shadow:0 0 0 1px var(--n-300);color:var(--primary-700);display:flex;align-items:center;justify-content:center}
.me-av svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.me-id .tx{flex:1;min-width:0}
.me-id .tx b{display:block;font-size:16px;font-weight:700;color:var(--n-800)}
.me-id .tx span{display:block;font-size:11.5px;color:var(--n-500);line-height:1.5;margin-top:2px}
.me-id .go{flex:none;border:1px solid var(--primary-500);color:var(--primary-700);border-radius:999px;padding:7px 13px;font-size:12px;font-weight:700;text-decoration:none}
.me-vip{display:flex;align-items:center;gap:12px;border-radius:16px;padding:15px 16px;margin:0 2px 18px;background:linear-gradient(120deg,var(--primary-50) 0%,#f2f9f7 62%,#fff 100%);border:1px solid #dceeea;box-shadow:var(--sh-1)}
.me-vip .ic{width:40px;height:40px;flex:none;border-radius:12px;background:var(--primary-700);color:#fff;display:flex;align-items:center;justify-content:center}
.me-vip .ic svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.me-vip .tx{flex:1;min-width:0}
.me-vip .tx b{display:block;font-size:14px;font-weight:700;color:var(--n-800)}
.me-vip .tx span{display:block;font-size:11.5px;color:var(--n-600);margin-top:2px}
.me-vip .go{flex:none;color:var(--primary-700);font-size:12px;font-weight:700;text-decoration:none}
.me-list{background:var(--n-0);border:1px solid var(--n-300);border-radius:16px;overflow:hidden;box-shadow:var(--sh-1);margin:0 2px}
.me-row{display:flex;align-items:center;gap:12px;padding:14px 15px;text-decoration:none;color:inherit;border-bottom:1px solid var(--n-300)}
.me-row:last-child{border-bottom:0}
.me-row .ic{width:34px;height:34px;flex:none;border-radius:10px;background:#f1f5f6;color:var(--primary-700);display:flex;align-items:center;justify-content:center}
.me-row .ic svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.me-row .tx{flex:1;min-width:0}
.me-row .tx b{display:block;font-size:14px;font-weight:600;color:var(--n-800)}
.me-row .tx span{display:block;font-size:11.5px;color:var(--n-500);margin-top:1px}
.me-row .ar{color:var(--n-400);font-size:17px;flex:none}
.ln-search{margin:14px 2px 0}
@media(max-width:360px){
  .ln-grid{gap:8px}
  .ln-tile{padding:11px}
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

  /* 登录判定：与 common.js 顶栏头像/状态行同一口径（DATA.settings.syncCode + authToken()）。
     只用在「未登录引导条」这一处；判错的最坏后果是引导条多显示或少显示一次。 */
  function isSignedIn(){
    try{
      var tok = (typeof authToken === 'function') ? authToken() : '';
      var code = (DATA && DATA.settings) ? DATA.settings.syncCode : '';
      return !!(tok && code);
    }catch(e){ return false; }
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
    if(G.key === 'me' && typeof hubIsAdmin === 'function' && hubIsAdmin()){
      items.unshift({ id:'teacher', name:'学生数据', desc:'绑定学生的学情（只读）' });
      /* 第五批 PERM-ENTRY-1（11-14）：站长面板卡 = root 专属（panel_root）；teacher 不出现 */
      if(typeof hubIsRoot === 'function' && hubIsRoot()){
        items.unshift({ id:'admin', name:'站长面板', desc:'权限配置 · 用户 · 留痕' });
      }
    }

    injectHubgCss();
    const link = it => { const p = pageById ? pageById(it.id) : null; return p ? p.file : (it.id + '.html'); };
    const icon = it => { const p = pageById ? pageById(it.id) : null; return p ? p.icon : ''; };
    let settings = {};
    try{ settings = (typeof DATA !== 'undefined' && DATA && DATA.settings) ? DATA.settings : {}; }catch(e){}
    /* 组页 defer 顺序里 hubgroup.js 排在 common-sync.js 之前，isSignedIn() 依赖的 authToken()
       此刻可能尚未定义；直接读同一个 hub_auth_token 键，口径与 common.js 一致且时序无关。 */
    const isLogin = (function(){
      try{ return !!(localStorage.getItem('hub_auth_token') && settings.syncCode); }
      catch(e){ return false; }
    })();
    const nick = (settings.name ? String(settings.name).trim() : '');

    /* 三个布局都保留同一组搜索 id，wireSearchCard() 一行不用改 */
    const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
    const searchBox = '<div class="hg-search ln-search" id="hgSearch" hidden>'
      + '<div class="hs-box">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
      +   '<input type="text" id="hgSearchInput" placeholder="搜功能、查单词、搜句子" aria-label="搜索" autocomplete="off">'
      +   '<button type="button" class="hs-close" id="hgSearchClose" aria-label="收起搜索">&times;</button>'
      + '</div><div class="hs-list" id="hgSearchList"></div></div>';

    let h = '';
    if(G.key === 'study'){
      /* 学习：Today 屏。所有数字只读真实数据，没设目标 / 没练过就不画假进度、不编模块名。 */
      const now = new Date();
      const wk = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()];
      const hr = now.getHours();
      const hi = hr < 11 ? '早上好' : (hr < 14 ? '中午好' : (hr < 18 ? '下午好' : '晚上好'));
      const dateTx = (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + wk;
      let sub = '今天练一项就够';
      try{
        if(typeof examCountdown === 'function'){
          const cd = examCountdown();
          if(cd && cd.hasExam && cd.daysLeft != null && cd.daysLeft >= 0){
            sub = cd.daysLeft === 0 ? '就是今天，稳住' : ('离考试还有 ' + cd.daysLeft + ' 天，今天练一项就够');
          }
        }
      }catch(e){}
      let sec = 0, goal = 0;
      try{
        const t = (typeof todayKey === 'function') ? todayKey() : '';
        (DATA.sessions || []).forEach(s => { if(s && s.date === t) sec += (s.durationSec || 0); });
        goal = (DATA.settings && Number(DATA.settings.dailyGoalHours)) || 0;
      }catch(e){}
      const mins = Math.round(sec / 60);
      const pct = goal > 0 ? Math.min(100, Math.round(sec / (goal * 3600) * 100)) : 0;
      const goalTx = goal > 0
        ? ('今日已学 ' + mins + ' 分钟 / 目标 ' + goal + ' 小时')
        : (mins > 0 ? ('今日已学 ' + mins + ' 分钟 · 今天练过就算数') : '今天练过就算数');
      h += '<div class="ln-hero">'
        +   '<div class="ln-date">' + esc(dateTx) + '</div>'
        +   '<div class="ln-hi">' + esc(hi) + '，同学</div>'
        +   '<div class="ln-sub">' + esc(sub) + '</div>'
        +   '<div class="ln-goal"><div class="top"><span>今天的目标</span><b>' + esc(goalTx) + '</b></div>'
        +     '<div class="ln-track"><i style="width:' + pct + '%"></i></div></div>'
        + '</div>';
      let last = null;
      try{
        const arr = (DATA.sessions || []).filter(s => s && (s.subName || s.moduleName));
        arr.sort((a, b) => (b.startTs || 0) - (a.startTs || 0));
        last = arr[0] || null;
      }catch(e){}
      if(last){
        h += '<div class="ln-resume">'
          +   '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5l11 7-11 7z"/></svg></span>'
          +   '<span class="tx"><small>接着上次练</small><b>' + esc(String(last.subName || last.moduleName).slice(0, 18)) + '</b></span>'
          +   '<a class="go" href="home.html">去练 &rarr;</a></div>';
      }
      h += '<div class="sec-t"><b>全部练习</b><span>' + (items.length + 1) + ' 个入口</span></div>';
      h += '<div class="ln-grid">';
      for(const it of items){
        h += '<a class="ln-tile" href="' + link(it) + '" data-id="' + it.id + '">'
          +   '<span class="ic">' + icon(it) + '</span><b>' + esc(it.name) + '</b>'
          +   '<span>' + esc(it.desc || '') + '</span></a>';
      }
      h += '<a class="ln-tile soft" id="hgSearchCard" href="javascript:void 0" role="button">'
        +   '<span class="ic">' + SEARCH_SVG + '</span><b>搜索</b><span>找功能 · 查单词</span></a>';
      h += '</div>' + searchBox;
      if(!isLogin){
        h += '<div class="hg-loginbar ln-login" id="hgLoginBar">'
          +   '<span class="lb-tx"><b>未登录</b><span>登录后进度、错句、成绩都能跨设备同步</span></span>'
          +   '<a class="lb-a" href="login.html">去登录</a></div>';
      }
    } else if(G.key === 'me'){
      /* 我的：个人中心。会员卡只做权益引导，不编等级 / 到期日等没有的数据。 */
      const who = isLogin ? (nick || settings.syncCode || '同学') : '未登录';
      const desc = isLogin ? '进度、错句、成绩已跨设备同步' : '登录后进度、错句、成绩都能跨设备同步';
      const goTx = isLogin ? '去设置' : '去登录';
      const goHref = isLogin ? 'settings.html' : 'login.html';
      h += '<div class="me-id">'
        +   '<span class="me-av"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg></span>'
        +   '<span class="tx"><b>' + esc(who) + '</b><span>' + esc(desc) + '</span></span>'
        +   '<a class="go" href="' + goHref + '">' + esc(goTx) + '</a></div>';
      h += '<div class="me-vip">'
        +   '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 6-9 12L3 9z"/><path d="M3 9h18"/></svg></span>'
        +   '<span class="tx"><b>会员 · AI 无限用</b><span>专属权益、无限次评分与陪练</span></span>'
        +   '<a class="go" href="vip.html">了解 &rarr;</a></div>';
      h += '<div class="sec-t"><b>常用</b><span>' + (items.length + 1) + ' 个入口</span></div>';
      h += '<div class="me-list">';
      for(const it of items){
        h += '<a class="me-row" href="' + link(it) + '" data-id="' + it.id + '">'
          +   '<span class="ic">' + icon(it) + '</span>'
          +   '<span class="tx"><b>' + esc(it.name) + '</b><span>' + esc(it.desc || '') + '</span></span>'
          +   '<span class="ar">&rsaquo;</span></a>';
      }
      h += '<a class="me-row" id="hgSearchCard" href="javascript:void 0" role="button">'
        +   '<span class="ic">' + SEARCH_SVG + '</span>'
        +   '<span class="tx"><b>搜索</b><span>找功能、查单词、搜句子</span></span>'
        +   '<span class="ar">&rsaquo;</span></a>';
      h += '</div>' + searchBox;
    } else {
      /* plans 组（孤儿页）：保留原来的整页渲染，一行不动 */
      h += '<div class="hg-head"><h1>' + esc(G.title) + '</h1><p>' + esc(G.tagline) + '</p></div>';
      h += renderStats();
      if(!isLogin){
        h += '<div class="hg-loginbar" id="hgLoginBar">'
          +   '<span class="lb-tx"><b>未登录</b><span>登录后进度、错句、成绩都能跨设备同步</span></span>'
          +   '<a class="lb-a" href="login.html">去登录</a></div>';
      }
      h += '<div class="hg-grid">';
      for(const it of items){
        const on = (link(it) === cur) ? ' cur' : '';
        h += '<a class="hg-card' + on + (it.accent ? ' accent' : '') + '" href="' + link(it) + '" data-id="' + it.id + '">'
          +   '<span class="hg-ic">' + icon(it) + '</span>'
          +   '<span class="hg-tx"><b>' + esc(it.name) + '</b><span>' + esc(it.desc || '') + '</span></span>'
          +   '<span class="hg-ar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></a>';
      }
      h += '<div class="hg-search" id="hgSearch" hidden>'
        +   '<div class="hs-box">'
        +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
        +     '<input type="text" id="hgSearchInput" placeholder="搜功能、查单词、搜句子" aria-label="搜索" autocomplete="off">'
        +     '<button type="button" class="hs-close" id="hgSearchClose" aria-label="收起搜索">&times;</button>'
        +   '</div><div class="hs-list" id="hgSearchList"></div></div>'
        +   '<a class="hg-card hg-search-card" id="hgSearchCard" href="javascript:void 0" role="button">'
        +     '<span class="hg-ic">' + SEARCH_SVG + '</span>'
        +     '<span class="hg-tx"><b>搜索</b><span>找功能、查单词、搜句子</span></span>'
        +     '<span class="hg-newbadge">新</span>'
        +     '<span class="hg-ar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></a>';
      h += '</div>';
      if(!items.length){
        h += '<div class="hg-empty"><p>这一组暂时没有可进的页面。</p><a class="btn btn-primary" href="home.html">回首页</a></div>';
      }
      h += '<p class="hg-note">导航里都能进这些页面；这里只是把常用的挑出来放一屏。</p>';
    }
    root.innerHTML = h;
    root.setAttribute('data-shown-group', G.key);
    wireSearchCard();
  }

  /* 10-23 1-1：组页搜索卡 —— 点开就地展开，不跳页、不新建页。
     输入走 common.js 已有的 ssMatchPages（中文匹配功能页），英文词靠 ssNewWord + AI 查词
     太重，这里只做「跳功能页」这一件——点结果软导航过去。 */
  function wireSearchCard(){
    const card = document.getElementById('hgSearchCard');
    const box = document.getElementById('hgSearch');
    const input = document.getElementById('hgSearchInput');
    const list = document.getElementById('hgSearchList');
    const closeBtn = document.getElementById('hgSearchClose');
    if(!card || !box || !input || !list) return;
    if(card.__wired) return;
    card.__wired = true;

    const open = () => {
      box.hidden = false;
      card.hidden = true;
      try{ input.focus(); }catch(e){}
    };
    const close = () => {
      box.hidden = true;
      card.hidden = false;
      input.value = '';
      list.innerHTML = '';
    };
    card.addEventListener('click', e => { e.preventDefault(); open(); });
    if(closeBtn) closeBtn.addEventListener('click', close);

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = (typeof ssNormQuery === 'function') ? ssNormQuery(input.value) : String(input.value || '').trim().toLowerCase();
        if(!q){ list.innerHTML = ''; return; }
        let hits = [];
        try{ hits = (typeof ssMatchPages === 'function') ? ssMatchPages(q) : []; }catch(e){ hits = []; }
        if(!hits.length){
          list.innerHTML = '<div class="ss-empty">没有匹配的功能</div>';
          return;
        }
        let html = '';
        for(const p of hits){
          html += '<button class="ss-item" type="button" data-file="' + p.file + '">'
            +   '<span class="ss-ico">' + p.icon + '</span>'
            +   '<span class="ss-name">' + escapeHtml(p.name) + '</span>'
            +   '<span class="ss-desc">' + escapeHtml(p.desc || '') + '</span>'
            + '</button>';
        }
        list.innerHTML = html;
        list.querySelectorAll('.ss-item[data-file]').forEach(btn => {
          btn.addEventListener('click', () => {
            const f = btn.getAttribute('data-file');
            if(!f) return;
            try{ if(typeof softNavigate === 'function'){ softNavigate({ href: f, file: f, id: f.replace(/\.html$/, '') }); return; } }catch(e){}
            location.href = f;
          });
        });
      }, 120);
    });
    input.addEventListener('keydown', e => {
      if(e.key === 'Escape') close();
      if(e.key === 'Enter'){
        const first = list.querySelector('.ss-item[data-file]');
        if(first) first.click();
      }
    });
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
      if(g && (g !== lastGroup || g !== shown || !root.querySelector('.hg-card, .ln-hero, .me-id'))){
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
