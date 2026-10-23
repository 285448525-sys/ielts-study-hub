/* === 口语题库（极简版） · v20260923g（design/87：P2 串题要点驱动重构） === */
var curType = 'ALL';   // 题库 tab 合并 P1+P2（'ALL'）；P1/P2 仅保留为数据类型
var curFreq = 'all';
var curCat = 'all';
var curPart = 'all';
var curState = 'all';   // design/88：练习状态筛选 all/new/done
var curSearch = '';
var curDetailId = null;

/* P2 倒计时句柄（f 类 · 场景状态隔离）：句柄挂 window 而非 DOM 节点，
   因为 speaking.js 会被软导航 window.eval 重跑、详情页节点也会被整体重建；
   挂在节点上会导致离开口语页/切换话题后心跳仍跑，在别的页面弹「2 分钟到」。
   进入/重建详情页时先 __clearP2Timer()，保证同页与跨页都只可能有一个倒计时。 */
function __clearP2Timer(){
  if(window.__p2TimerId){ clearInterval(window.__p2TimerId); window.__p2TimerId = null; }
}

/* 9/13 修：答案草稿自动保存（P1 小题 + P2 单窗口）。
   原逻辑只有点「AI 诊断」才会把答案写进 s.answers[qi].text，而「保存」按钮对 P1 完全无效——
   她写完 4 小题点「保存」，toast 说「已保存」但实际一个字都没落库，返回列表/刷新/换设备全部丢失。
   现在：输入即防抖落库（700ms），「保存」另外做一次同步兜底。
   ⚠️ 只写 text/ts，绝不整体替换 answers[qi]——否则会冲掉 records（历史提交）与 result（诊断结果）。 */
/* 9/16 修：防抖句柄必须是「每题一个」。
   原来全站共用一个 __SP_DRAFT_T，在 A 小题打完字后 700ms 内又去 B 小题打字，
   clearTimeout 会连带把 A 的待保存任务取消 → A 那一题白写（实测 q0 丢失）。 */
var __SP_DRAFT_T = {};
function spDraftSave(id, qi, text){
  const __dkey = id + '|' + qi;
  clearTimeout(__SP_DRAFT_T[__dkey]);
  __SP_DRAFT_T[__dkey] = setTimeout(function(){
    try{
      var s = (typeof DATA !== 'undefined' && DATA.speaking) ? DATA.speaking.find(function(x){ return x.id === id; }) : null;
      if(!s) return;
      s.answers = s.answers || {};
      if(qi === 'p2'){
        s.answers.p2 = s.answers.p2 || {};
        s.answers.p2.text = text;
        s.answers.p2.ts = Date.now();
      } else {
        s.answers[qi] = Object.assign({}, s.answers[qi] || {}, { text: text, ts: Date.now() });
      }
      s.updatedAt = Date.now();
      if(typeof hubSave === 'function') hubSave();
    }catch(_){}
  }, 700);
}
/* 离开页兜底：软导航只替换 main.innerHTML，挂在 body 上的全屏浮层不会跟着消失
   （句型拼接验证弹窗 z-index 999 / 模考退出确认 z-index 200），切页后会继续盖住整页让所有点击失效。
   借 common.js 已有的「离开旧页」钩子一并清掉，避免为这一行去 bump 全站 common.js 版本号。 */
if(typeof window.hubClearOrphanPageTimers === 'function' && !window.__spHookLeave){
  window.__spHookLeave = true;
  var __origClearOrphan = window.hubClearOrphanPageTimers;
  window.hubClearOrphanPageTimers = function(){
    try{ __origClearOrphan.apply(this, arguments); }catch(_){}
    try{
      var m = document.getElementById('sentReplayMask'); if(m && m.remove) m.remove();
      var e = document.getElementById('mockExitModal'); if(e && e.remove) e.remove();
    }catch(_){}
  };
}
var FREQ_ORDER = { P1:{ultra:0, high:1, medium:2, low:3}, P2:{ultra:0, high:1, medium:2, low:3} };
function freqRank(f){ const t = FREQ_ORDER[curType] || FREQ_ORDER.P1; return (t[f] != null) ? t[f] : 9; }

/* 10-23 T-009 S-3：J 区两个诊断提示词常量 SYS_DIAG / SYS_DIAG_P2 已搬到 js/sp-diag.js
   —— 原样搬家，值一字未改。 */


/* 10-23 T-009 S-3：J 区（AI 诊断 / 纠错 / 评分净化，design/76）整块已搬到 js/sp-diag.js
   —— diagnoseAnswer / diagnoseP2 / renderDiag / renderP2Diag / normalizeErrors / cleanErrors /
   wordDiff / trimCommonAffixes / diffSentenceHtml / adaptDiag / findObviousGrammarIssue /
   hasObviousGrammarIssues / inlineErrorsHtml / diagScoreHtml / highlightRewriteHtml /
   generateAIHelper / buildPersonaContext / renderAIHelper —— 原样搬家，函数体一字未改。 */

/* 录音 / 转写功能已移除：口语只保留「文本框手写 + AI 纠错 + 提交记录」。
   9/20 评分恢复（design/76）：改为按 IELTS 官方 band descriptor 正向锚定，只评「语法 GR&A」「词汇 LR」两项
   （流利度/发音需音频，文本评不了，一律不给分不猜测）。旧的扣分制 + 拍脑袋兜底已删除。 */

/* 9/15 之之要求：回答输入框随内容自动增高（P1 小题/P2 大框/P3 通用），长文本完整展示；
   极端长文封顶视口 50% 后内部滚动，不把页面顶爆。委托绑定一次，软导航重跑安全。 */
function spAutoGrow(ta){
  if(!ta || ta.tagName !== 'TEXTAREA') return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, Math.max(160, Math.round(window.innerHeight * 0.5))) + 'px';
}
function spAutoGrowAll(){
  document.querySelectorAll('.sp-ans, .sp-p3-textarea').forEach(spAutoGrow);
}
if(!window.__spAutoGrowBound){
  window.__spAutoGrowBound = true;
  document.addEventListener('input', e => {
    const t = e.target;
    if(t && t.tagName === 'TEXTAREA' && (t.classList.contains('sp-ans') || t.classList.contains('sp-p3-textarea'))) spAutoGrow(t);
  });
  window.addEventListener('resize', () => spAutoGrowAll());
}


/* T-004（2026-10-22）：原 renderFreqBanner（design/81 的深绿 banner）已由 renderCockpit() 取代 ——
   banner 的 season/region/题数信息搬进了驾驶舱主行（无考试日时）与「题库总量」统计格。
   函数保留为空壳并继续被 ready() 调用（#freqBanner 容器已从 speaking.html 删除，
   getElementById 返回 null 直接 return，零成本；保留调用点是为最小化 diff）。 */
function renderFreqBanner(){
  const el = document.getElementById('freqBanner');
  if(!el) return;   // T-004：容器已删 → 直接返回（什么都不做）
}

/* 10/2（她拍板）：「最近一次模考」卡已删——renderMockRecent 整函数退役；
   模考成绩完整记录仍在「回顾」页。 */

/* 题库「随机来一道」（design/81）：与 renderList 完全相同的过滤口径，随机开一道详情。
   复用 openDetail = 与点卡片完全同路径（回填/TTS/事件绑定同源渲染）。 */
function spRandomPick(){
  const list = getFiltered();
  if(!list.length){ toast('当前筛选下没有题目'); return; }
  const pick = list[Math.floor(Math.random() * list.length)];
  if(pick && pick.id) openDetail(pick.id);
}

/* 10/3 B 版分组面板的分组定义 —— ⚠️ 必须声明在 ready 之前：
   renderList 由 ready 同步调用，而 renderGrouped 读这个常量；
   放在 ready 之后（函数体内）会导致首屏 SP_FREQ_GROUPS === undefined → .filter 抛错、列表空白。 */
var SP_FREQ_GROUPS = [
  { key:'ultra',  label:'必考题', desc:'每场必考，优先背',        icon:'cap',   freqs:['ultra'],  open:true  },
  { key:'high',   label:'高频',   desc:'考场常见题，值得练熟',    icon:'chart', freqs:['high'],   open:true  },
  { key:'medium', label:'中频',   desc:'近期有考，建议过一遍',    icon:'arrow', freqs:['medium'], open:false },
  { key:'low',    label:'低频',   desc:'考场很少遇到',            icon:'arrow', freqs:['low'],    open:false },
];
var SP_ICONS = {
  cap:   '<path d="M12 3 2 8l10 5 10-5-10-5Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20h-20"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
};

/* ===== 10/17 性能批（第二批 · 传输层）：视图脚本按需加载 =====
   背景：materials.js(47KB) + mock-report.js(4KB) + mock-history.js(4KB) + mock.js(23KB)
   合计 78KB（压缩体）过去跟着首屏一起下载，但它们服务的「素材」不是默认 tab（默认 = 题库）、
   「模考」tab 目前还是 hidden（功能未开）。依据 = tests/_probe_ablate_1017.cjs 线上实测：
   单独拦掉它们，首屏照常渲染、零 pageerror。版本串在各自视图容器的 data-late-src 属性上。
   ⚠️ 属性放在 <main> 内、不放 body 末尾 —— 软导航只换 <main>，写在末尾的配置在软导航进来时会丢。
   ⚠️ 顺序契约：data-late-src 里的顺序就是原 <script> 声明顺序（mock-report → mock-history → mock）。 */
var _spkLate = {};
/* 脚本「已在」的判据 = 它暴露的全局产物（不能用 _spkLate 自己，理由见 lateLoad 注释） */
function lateReady(hostId){
  if(hostId === 'matView') return typeof window.matGen !== 'undefined';
  if(hostId === 'mockView') return typeof window.__mockEnter === 'function';
  return false;
}
function lateLoad(hostId){
  /* ⚠️ 10/17 回归修复：软导航会重新 eval 本文件，模块级 _spkLate 归零 —— 若只看它，软导航绕回
     本页后再点一次「素材/模考」会把已加载过的脚本**再 append 一次**，而 materials.js / mock.js
     顶层有 const，重复执行会抛 "Identifier '...' has already been declared"（实测：bank 软导航
     进本页 → 回题库 → 再回头，页面报错 —— 由 _probe_spkmock_1011 的 S6b 抓到）。
     所以：① 先看全局产物在不在；② promise 缓存同时挂 window，跨 eval 复用同一份加载过程。 */
  if(lateReady(hostId)) return Promise.resolve();
  window.__spkLate = window.__spkLate || {};
  if(window.__spkLate[hostId]) return window.__spkLate[hostId];
  var host = document.getElementById(hostId);
  var raw = host && host.getAttribute('data-late-src');
  if(!raw) return Promise.resolve();
  _spkLate[hostId] = raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean).reduce(function(chain, u){
    return chain.then(function(){
      return new Promise(function(res, rej){
        var s = document.createElement('script');
        s.setAttribute('data-late', '1');   /* 标记：运行时按需追加（探针用它区分「首屏声明」与「延后加载」） */
        s.src = u;
        s.onload = res;
        s.onerror = function(){ rej(new Error('load failed ' + u)); };
        document.head.appendChild(s);
      });
    });
  }, Promise.resolve()).catch(function(e){
    delete _spkLate[hostId];                 // 失败不缓存：下次切回来还能重试
    if(window.__spkLate) delete window.__spkLate[hostId];
    if(window.console && console.error) console.error('[speaking] 视图脚本加载失败：', e);
  });
  window.__spkLate[hostId] = _spkLate[hostId];
  return _spkLate[hostId];
}
/* 10/17 修：模考视图的 loading / 错误态占位。
   ⚠️ 只能「插入一张卡」，绝不能像素材那样写 mv.innerHTML —— #mockView 里住着 #mockStage / #mockReport
      两个静态容器，innerHTML 一写就把它们连同 mock.js 绑好的事件一起抹掉（舞台永远起不来）。 */
function spMockTip(html){
  const mv = $('#mockView');
  if(!mv) return null;
  let tip = document.getElementById('mockLoadTip');
  if(!tip){
    tip = document.createElement('div');
    tip.id = 'mockLoadTip';
    tip.className = 'card';
    mv.insertBefore(tip, mv.firstChild);   // 插在最前：舞台/报告一旦显示，它在上面不影响布局
  }
  tip.innerHTML = html;
  return tip;
}
function spMockTipClear(){ const t = document.getElementById('mockLoadTip'); if(t) t.remove(); }

/* 10/20：模考加载态（只有冷路径才出现）。
   为什么不在视图里放「加载中」：她报「点了会跳到加载画面卡住一会再跳」——那是**跳两次**。
   这里改成按钮上转圈、内容不动，下好了一次性切进考场，只跳一次。
   ⚠️ 必须挂在 #spMockJumpBtn 上：模考真正的入口是题库筛选行那个按钮，
      顶部 data-type="MOCK" 的 pill-tab 是 hidden 的承载节点（10/15 把入口移出去了）——
      加在那个隐藏节点上等于没加，用户一个像素都看不到。 */
function spMockTabBusy(on){
  const targets = [document.getElementById('spMockJumpBtn'), document.querySelector('#tabs [data-type="MOCK"]')];
  targets.forEach(function(el){
    if(!el) return;
    el.classList.toggle('is-loading', !!on);
    if(on) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
  });
}

/* load 之后空闲预热：用户真去点「素材」时通常已经就位。
   放在 load 之后（而不是 ready 时）是为了绝不和首屏的 CSS / data.js / common.js / speaking.js 抢带宽。 */
ready(function(){
  var go = function(){
    /* 🔴 10/20 她报「点口语模考会跳到加载画面卡住一会再跳到模考页面」。
       根因链 = 10/17 把 mock.js(62KB)+mock-report(9.5KB)+mock-history(7.5KB) 改成按需加载
       （#mockView 的 data-late-src，三个**串行**）→ 用户点「模考」才开始下 →
       先看到 #mockView 空壳 + 「模考加载中…」→ 下完才进考场 = **视觉上跳了两次**。
       修法两条：
         ① 预取提前 + 一定时限内必触发（原来 idle(fn) 没传 timeout，
            requestIdleCallback 在主线程忙时可能拖好几秒才回调 → 她点的瞬间必然撞上加载中）
         ② 冷路径不切视图（见 spActivateTab 的 MOCK 分支）：脚本没就绪就保持题库列表 + MOCK tab 转圈，
            下好了一次性切进考场，只跳一次。
       注：mock.js 里 ensureMockLib() 自己会注入/等待 mock-report，所以这里不必保证顺序，
       只管在用户动手之前把三个脚本塞进 HTTP 缓存。 */
    var idle = window.requestIdleCallback
      ? function(f){ return window.requestIdleCallback(f, { timeout: 1500 }); }
      : function(f){ return setTimeout(f, 600); };
    idle(function(){
      /* 模考优先（三个串行 79KB，最可能被马上点），素材排它后面 —— 原来两个 lateLoad 同时发会互相抢带宽 */
      lateLoad('mockView').then(function(){ lateLoad('matView'); });
    });
  };
  /* 原来只在 window load 之后才 go()。软导航进本页时 load 早就过了（走 readyState==='complete' 分支没问题），
     但硬刷进入时要等全部图片/字体下完才 load → 预取被推得很晚。改成 DOM ready 后 300ms 就开工：
     requestIdleCallback 本身就会让路给首屏渲染，不需要再用 load 事件当闸。 */
  setTimeout(go, 300);
});

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      spActivateTab(t);
      // 9/13 修：句型拼接验证弹窗挂在 body 上、z-index 999，切 tab 不会跟着消失 → 先关掉（不写 replay 标记，下次练满还会弹）
      if(typeof sentReplayClose === 'function') sentReplayClose();
      // 9/26：切 tab 一律解除模考沉浸（否则侧栏/tab 被藏、页面只剩模考内容）
      try{ document.body.classList.remove('mock-immerse'); }catch(e){}
      /* 10-22 句型闯关老引擎（pattern-drill.js / #pdView）整体下线（她要求）→ 这里的 pdView
         显隐全部去掉：#pdView 已不在页面里，再写 $('#pdView').hidden 会抛错把切换流程打断。 */
      $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true; $('#sentView').hidden = true; $('#coachView').hidden = true;
      if(t === 'PRACTICE'){
        // 10/2：AI 陪练 coach 最优先接管「陪练」tab；其次 design/16 P0 句型页（sentence-drill.js）
        if(window.__COACH_ON){
          $('#sentView').hidden = true;
          $('#coachView').hidden = false;
          try{ window.__coachShow && window.__coachShow(); }catch(_){}
        } else {
          $('#sentView').hidden = false;
        }
      } else if(t === 'BANK'){
        curType = 'ALL';
        populateFreqOptions();
        const cs = $('#catSelect'); if(cs) cs.value = 'all';
        curCat = 'all';
        const ps = $('#partSelect'); if(ps) ps.value = 'all';
        if(window.__spClearPartSeg) window.__spClearPartSeg();
        curPart = 'all';
        // design/88：状态筛选重置（切回题库=回到全量语义）
        curState = 'all'; const stSel = $('#stateSelect'); if(stSel) stSel.value = 'all';
        /* 9/19 修：切回题库时搜索框与 curSearch 一并清空。
           原先只重置三个下拉、搜索词却留着 → 列表仍被旧关键词过滤（如只剩 3 条），
           而下拉显示「全部」，用户会误以为题库只剩这几题。语义统一为「切回题库=回到全量」。 */
        const ss = $('#spSearch'); if(ss) ss.value = '';
        curSearch = '';
        if(window.__spSyncFselLabels) window.__spSyncFselLabels();
        $('#listView').hidden = false;
        renderList();
      } else if(t === 'MOCK'){
        // 10/2（她拍板）：开始卡/最近记录已删——点「模考」直接进全屏考试
        //（window.__mockEnter 由 mock.js ready 暴露：有未完成快照=自动续考，否则全新开考）
        // 10/17 性能批：mock.js / mock-report.js / mock-history.js 改按需加载（模考 tab 目前 hidden、功能未开）。
        // 🔴 10/20 她报：「点了口语模考会跳到这个画面卡住一会再跳到模考页面」。
        //   根因 = 这里**先把 #mockView 显示出来**（露出空壳 + 「模考加载中…」卡片），
        //          然后等 79KB 三个脚本串行下完，才由 __mockEnter 把考场渲染出来 = **跳了两次**。
        //   改：① 脚本已就绪 → 直接进（预取见上面 ready 里那段，正常情况早就下完了）
        //       ② 没就绪 → **不切视图**，保持题库列表原样，只在 MOCK tab 上加转圈；
        //          下好了一次性切进考场 = 只跳一次
        //       ③ 真失败（网络/被拦）才切视图给错误态 + 重试
        //   判据沿用她的「绝不切内容、绝不错位」：加载过程中她眼前的东西一个像素都不变。
        if(typeof window.__mockEnter === 'function'){
          $('#mockView').hidden = false;
          spMockTipClear();
          try{ window.__mockEnter(); }
          catch(err){
            console.error('[speaking] 模考进入失败', err);
            spMockTip('<p class="muted" style="margin:0">模考启动失败，请刷新页面重试。</p>');
          }
          return;
        }
        /* 冷路径：刚进页面就立刻点模考，预取还没完成 */
        $('#listView').hidden = false;        // tab 高亮已经变了，但内容留在题库，不闪空白
        spMockTabBusy(true);
        lateLoad('mockView').then(function(){
          spMockTabBusy(false);
          if(typeof window.__mockEnter === 'function'){
            $('#mockView').hidden = false;
            $('#listView').hidden = true;     // 这时才真正离开题库
            spMockTipClear();
            try{ window.__mockEnter(); }
            catch(err){
              console.error('[speaking] 模考进入失败', err);
              spMockTip('<p class="muted" style="margin:0">模考启动失败，请刷新页面重试。</p>');
            }
            return;
          }
          /* 脚本没到位（网络失败 / 被拦）→ 给可见的错误态 + 重试按钮。
             lateLoad 失败时不缓存 promise（见其 catch），点重试会重新加载；
             重试 = 再点一次隐藏的 MOCK tab，复用本分支的全部逻辑，不另写一份。 */
          console.error('[speaking] 模考脚本未就绪：__mockEnter 不存在');
          $('#listView').hidden = true;
          $('#mockView').hidden = false;
          const tip = spMockTip('<p class="muted" style="margin:0">模考加载失败（网络问题），请重试。</p>'
            + '<button type="button" class="btn" id="mockLoadRetry" style="margin-top:10px">重试</button>');
          const rb = tip && document.getElementById('mockLoadRetry');
          if(rb) rb.addEventListener('click', function(){
            const mb = document.querySelector('#tabs [data-type="MOCK"]');
            if(mb) mb.click();
          });
        });
      } else if(t === 'MAT'){
        /* 10/17 性能批：materials.js(47KB) 改按需加载 —— 先给一个「加载中」占位，
           脚本到位后再由 matGen.init() 接管（与本项目 .bank-loading 同口径：
           加载中就说加载中，绝不拿空态顶替）。 */
        const mv = $('#matView');
        mv.hidden = false;
        if(typeof matGen === 'undefined' || !matGen.init){
          mv.innerHTML = '<div class="card"><p class="muted" style="margin:0">素材加载中…</p></div>';
        }
        lateLoad('matView').then(function(){
          try{ if(typeof matGen !== 'undefined' && matGen.init) matGen.init(); }
          catch(err){ console.error('[speaking] 素材初始化失败', err); }
        });
      } else {
        curType = t;
        populateFreqOptions();
        const cs = $('#catSelect'); if(cs) cs.value = 'all';
        curCat = 'all';
        const ps = $('#partSelect'); if(ps) ps.value = 'all';
        if(window.__spClearPartSeg) window.__spClearPartSeg();
        curPart = 'all';
        // design/88：状态筛选重置
        curState = 'all'; const stSel2 = $('#stateSelect'); if(stSel2) stSel2.value = 'all';
        if(window.__spSyncFselLabels) window.__spSyncFselLabels();
        $('#listView').hidden = false;
        renderList();
      }
    });
  });
  const freqSel = $('#freqSelect'), catSel = $('#catSelect'), partSel = $('#partSelect');
  /* 10/3 B 版：三个筛选的字段名做成浮层小标签，只有选了非「全部」的值才显形（.sp-fsel.has-val）。
     值全在现有逻辑里，只有这个 class 是新增的视觉状态。 */
  const syncFselLabels = () => {
    [['freqSelect', 'freqSel'], ['catSelect', 'catSel'], ['stateSelect', 'stateSel']].forEach(([id, key]) => {
      const sel = document.getElementById(id); if(!sel) return;
      const wrap = sel.closest('.sp-fsel');
      if(wrap) wrap.classList.toggle('has-val', !!sel.value && sel.value !== 'all');
    });
  };
  window.__spSyncFselLabels = syncFselLabels;
  if(freqSel) freqSel.addEventListener('change', e => { curFreq = e.target.value; syncFselLabels(); renderList(); });
  if(catSel) catSel.addEventListener('change', e => { curCat = e.target.value; syncFselLabels(); renderList(); });
  if(partSel) partSel.addEventListener('change', e => { curPart = e.target.value; renderList(); });
  // 10/1 晚（她拍板）：Part 下拉退役 → P1/P2 小切换。点选=只看该 Part；再点已选中的=回到全部。
  const partSeg = document.getElementById('spPartSeg');
  if(partSeg){
    partSeg.querySelectorAll('button[data-part]').forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.part;
        curPart = (curPart === v) ? 'all' : v;
        partSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.part === curPart));
        renderList();
      });
    });
  }
  /* 切 tab 重置时同步清 P1/P2 高亮（curPart='all' 由原重置逻辑负责） */
  window.__spClearPartSeg = () => { if(partSeg) partSeg.querySelectorAll('button').forEach(x => x.classList.remove('active')); };
  // design/88：状态筛选
  const stateSel = $('#stateSelect');
  if(stateSel) stateSel.addEventListener('change', e => { curState = e.target.value; syncFselLabels(); renderList(); });
  populateFreqOptions();
  // 9/15：Part 下拉选项带各 Part 题数（之之要求 P1/P2 分开计数，一眼看清各有多少题）
  (function(){
    const bank = (DATA.speaking || []).filter(s => !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
    const c1 = bank.filter(s => s.type === 'P1').length, c2 = bank.filter(s => s.type === 'P2').length;
    const o1 = partSel && partSel.querySelector('option[value="P1"]'), o2 = partSel && partSel.querySelector('option[value="P2"]');
    if(o1) o1.textContent = 'Part 1（' + c1 + ' 题）';
    if(o2) o2.textContent = 'Part 2（' + c2 + ' 题）';
    const pb1 = document.querySelector('#spPartSeg [data-part="P1"]'), pb2 = document.querySelector('#spPartSeg [data-part="P2"]');
    if(pb1) pb1.textContent = 'P1 · ' + c1;
    if(pb2) pb2.textContent = 'P2 · ' + c2;
  })();
  $('#spSearch').addEventListener('input', () => { curSearch = $('#spSearch').value.trim().toLowerCase(); renderList(); });
  const rndBtn = document.getElementById('spRandomBtn');
  if(rndBtn) rndBtn.addEventListener('click', () => spRandomPick());
  // 10/1 晚（她拍板）：模考不再是 tab——题库筛选行「模考」按钮 = 点隐藏的 MOCK tab（复用全部切换逻辑）
  const mockJump = document.getElementById('spMockJumpBtn');
  if(mockJump) mockJump.addEventListener('click', () => { const mb = document.querySelector('#tabs [data-type="MOCK"]'); if(mb) mb.click(); });
  renderFreqBanner();   // T-004：已空壳（#freqBanner 容器删除）；驾驶舱由 renderList→renderCockpit 渲染
  syncFselLabels();    // 10/3 B 版：初始三个筛选都是「全部」→ 浮层标签不显形
  $('#backBtn').addEventListener('click', () => { $('#detailView').hidden = true; $('#listView').hidden = false; $('#sentView').hidden = true; curDetailId = null; spActivateTab('BANK'); });
  // 默认 tab = 题库（她 10/1 晚拍板：题库放练习前面 + 打开口语优先展示题库）。
  // 程序化点 BANK tab：复用切换分支的全部重置/渲染逻辑，不另写一份。
  $('#listView').hidden = true;
  $('#sentView').hidden = true;
  const bankTabBtn = document.querySelector('#tabs [data-type="BANK"]');
  if(bankTabBtn) bankTabBtn.click();
  /* 🔴 10-23 T-001：顶栏二级菜单「口语」落地分栏（?sub=BANK|PRACTICE|MAT）。
     放在上面「程序化点 BANK」之后 —— 显式带参数来的请求优先于默认 tab。
     只读参数 → 点本页自己的 tab 按钮（复用切换分支的全部重置/渲染，不另写一份）。
     值为空/不识别时什么都不做（保持默认题库 tab）。
     ⚠️ setTimeout(0)：ready 同步体后面还有 open/senttab/drill 等分支也会改 tab，
        就地切会被覆盖（实测 ?sub=MAT 落地仍停在「题库」）。 */
  setTimeout(function(){
    try{
      const _tbSub = (typeof tbSubPending === 'function') ? tbSubPending('speaking') : '';
      if(_tbSub === 'BANK' || _tbSub === 'PRACTICE' || _tbSub === 'MAT'){
        const _sb = document.querySelector('#tabs [data-type="' + _tbSub + '"]');
        if(_sb) _sb.click();
      }
    }catch(e){}
  }, 0);
  // P1：?open=<题id> 直达详情（素材页覆盖矩阵点题跳转用）——跳详情时落到题库 tab
  try{
    const openId = new URLSearchParams(location.search).get('open');
    if(openId && (DATA.speaking || []).some(x => x && x.id === openId)){
      spActivateTab('BANK');
      $('#sentView').hidden = true;
      $('#listView').hidden = true;
      openDetail(openId);
    }
    // 9/24：首页今日任务跳转带 autostart=1 → 落地即开计时（她拍板：跳转过去直接开始计时）。
    // maybeStartSpkTimer 自带引导期护栏 + 已有口语表不重复开，重复调用安全。
    // ⭐ 必须 setTimeout(0)：ready 回调在脚本求值期同步执行，SPK_TIMER_MODULE 等 const
    //   声明在文件后段（~3001 行）尚未初始化，直接调会 TDZ 且被本 try 吞掉（探针 3b 实测）。
    if(new URLSearchParams(location.search).get('autostart')){
      setTimeout(() => { try{ window.__spkTimerByJump = true; maybeStartSpkTimer(); }catch(_){} }, 0);
    }
  }catch(_){}
  // design/17 3.5：回顾页「去练」带 ?senttab=1——确保落练习 tab（默认即练习，兜底防其他参数抢占）
  try{
    // 10/5 路线图②-2a：首页「今天先做这三件事」的「练口语」→ 落地直接抽一道 P1 真题。
    // 暗号走 sessionStorage（软导航时 location.search 还没 pushState，query 读不到）；
    // ?drill=p1 保留作整页直达的兜底。键与值都读 common.js 的唯一定义（QUICK_DRILL_KEY/VAL）。
    let quick = '';
    try{ quick = sessionStorage.getItem(QUICK_DRILL_KEY) || ''; sessionStorage.removeItem(QUICK_DRILL_KEY); }catch(_){}
    if(!quick){ try{ quick = new URLSearchParams(location.search).get('drill') || ''; }catch(_){} }
    if(quick === QUICK_DRILL_VAL && typeof window.__coachQuickP1 === 'function'){
      // setTimeout(0)：本段在 ready 里同步执行，coach.js 的骨架/常量可能尚未就绪
      // ⚠️ catch 里必须留一句 console.error：裸 catch(_){} 会把真实异常吞成「点了没反应」，
      //   排查时完全看不出发生过什么（这正是本次暗号不匹配的同款静默失败形态）。
      setTimeout(function(){
        try{ window.__coachQuickP1(); }
        catch(err){ console.error('[speaking] 落地直接抽题失败', err); }
      }, 0);
    }
    if(new URLSearchParams(location.search).get('senttab')){
      spActivateTab('PRACTICE');
      if(window.__COACH_ON){
        $('#coachView').hidden = false; $('#sentView').hidden = true;
        try{ window.__coachShow && window.__coachShow(); }catch(_){}
      } else { $('#sentView').hidden = false; }
    }
  }catch(_){}
});

/* 10-23 T-009 S-1：C 区（优先级下拉/filter/频次标签/状态下拉）已搬到 js/sp-core.js；
   D 区（分数解析与统计）已搬到 js/sp-stats.js。都是原样搬家，函数体未改。 */

/* 10-23 T-009 S-2：E 区（renderCountdownBar / renderCockpit / renderList / renderGrouped /
   spCardHtml / refreshScoreAfterDiag）已搬到 js/sp-list.js —— 原样搬家，函数体未改。 */

/* T-017d：串题逻辑在数据里是一整段文本（j.logicChain / j.mappingZh），不是数组。
   设计稿要求编号步骤块 → 这里按句末标点/换行/分号切成若干行，包成 .td-step，
   外层加 .td-plain 让 CSS 走「逐行编号」那条分支。
   切不出 2 行就原样保留一整块 —— 绝不硬拆，免得把一句话拆断。
   纯展示层：只读 DOM 文本再重建，不动任何数据字段。 */
function addLogicSteps(root){
  if(!root) return;
  root.querySelectorAll('.mat-logic').forEach(box => {
    if(box.dataset.tdSteps === '1') return;
    if(box.querySelector('li, .td-step')) { box.dataset.tdSteps = '1'; return; }
    const raw = (box.textContent || '').trim();
    if(!raw) return;
    let parts = raw.split(/\n+/).map(x => x.trim()).filter(Boolean);
    if(parts.length < 2){
      parts = raw.split(/(?<=[。；;！!？?])\s*/).map(x => x.trim()).filter(Boolean);
    }
    if(parts.length < 2) return;   // 一句话就够，不硬拆
    box.classList.add('td-plain');
    box.innerHTML = parts.map(x => '<div class="td-step">' + escapeHtml(x) + '</div>').join('');
    box.dataset.tdSteps = '1';
  });
}

/* T-017d：作答词数。现算，不引依赖。 */
function updateWordCount(){
  const ta = document.getElementById('p2Ans');
  const out = document.getElementById('p2WordCount');
  if(!out) return;
  const t = ta ? String(ta.value || '').trim() : '';
  const n = t ? t.split(/\s+/).filter(Boolean).length : 0;
  out.innerHTML = '已写 <b>' + n + '</b> 词 · 目标 220';
}

/* T-017d：串题原文底部的四枚工具条（设计稿 ⑤）。
   现有渲染已经给了「复制 / 朗读 / 关键词」，这里**只补缺的两枚**：
     · 调整语速 —— 0.7 → 1.0 三档循环，状态挂 el.dataset.tdRate（只影响朗读，不改数据）
     · 看中文对照 —— 折叠显示 mappingZh（串题思路，本来就是给中文看的）；没有就整枚不渲染
   不动任何已有按钮与 id。 */
function appendStoryTools(root, s, j){
  if(!root) return;
  const story = root.querySelector('.mat-story-en');
  if(!story) return;
  if(root.querySelector('.td-story-tools')) return;   // 已经加过
  const bar = document.createElement('div');
  bar.className = 'td-story-tools';

  /* 设计稿 ⑤ 的四枚：朗读全文 / 复制英文 / 调整语速 / 看中文对照。
     前两枚在现有渲染里已经有了（在卡头的 mp-actions 里，id 是 storySpeakBtn / storyCopyBtn），
     但设计稿要求它们落在**原文下方**那条工具条里 → 这里做两枚**转发按钮**，
     点了去点原按钮，朗读/复制的逻辑一行没改、原 id 一个没动。 */
  const mkForward = (id, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-tbtn';
    b.id = id;
    b.textContent = label;
    b.addEventListener('click', () => {
      const src = document.getElementById(id === 'tdCopyBtn' ? 'storyCopyBtn' : 'storySpeakBtn');
      if (src) src.click();
      else toast('这版稿子没有可朗读/复制的英文');
    });
    return b;
  };
  bar.appendChild(mkForward('tdSpeakBtn', '▶ 朗读全文'));
  bar.appendChild(mkForward('tdCopyBtn', '📋 复制英文'));

  // 语速：三档循环
  const rates = [0.7, 0.85, 1];
  const rateBtn = document.createElement('button');
  rateBtn.type = 'button';
  rateBtn.className = 'td-tbtn ghost';
  rateBtn.id = 'tdRateBtn';
  const paint = () => {
    const r = Number(root.dataset.tdRate || 0.85);
    rateBtn.textContent = '语速 ' + r.toFixed(2) + '×';
  };
  paint();
  rateBtn.addEventListener('click', () => {
    const cur = Number(root.dataset.tdRate || 0.85);
    const i = rates.indexOf(cur);
    const next = rates[(i + 1 + rates.length) % rates.length];
    root.dataset.tdRate = String(next);
    paint();
    toast('朗读语速 ' + next.toFixed(2) + '×');
  });
  bar.appendChild(rateBtn);

  // 中文对照：有 mappingZh 才出现
  const zh = j && (j.mappingZh || (j.logicChain ? j.logicChain : ''));
  if(zh){
    const zhBtn = document.createElement('button');
    zhBtn.type = 'button';
    zhBtn.className = 'td-tbtn ghost';
    zhBtn.id = 'tdZhBtn';
    zhBtn.textContent = '看中文对照';
    const box = document.createElement('div');
    box.className = 'td-zhbox';
    box.hidden = true;
    box.innerHTML = String(zh).split(/\n+/).filter(Boolean).map(x => '<p>' + escapeHtml(x) + '</p>').join('');
    zhBtn.addEventListener('click', () => {
      box.hidden = !box.hidden;
      zhBtn.textContent = box.hidden ? '看中文对照' : '收起中文';
    });
    bar.appendChild(zhBtn);
    story.insertAdjacentElement('afterend', bar);
    bar.insertAdjacentElement('afterend', box);
    return;
  }
  story.insertAdjacentElement('afterend', bar);
}

/* 朗读时把语速传给 TTS（默认 0.95，与全站一致；用户改过才用他的） */
function tdSpeakRate(){
  const root = document.getElementById('aiResult');
  const v = root ? Number(root.dataset.tdRate || 0) : 0;
  return (v >= 0.5 && v <= 1.5) ? v : 0.95;
}

function openDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  __clearP2Timer();   // 修(f)：切话题/重进详情页先停掉上一题残留的 2 分钟倒计时
  curDetailId = id;
  $('#listView').hidden = true;
  $('#detailView').hidden = false;

  const title = s.titleEn || s.title || '';
  /* 10/2（她拍板）：详情头部只留总标题——kicker（SPEAKING·PART x）/ 中文副标 / 标签行 / 平均分行全部删掉
     10-23 T-017d：设计稿把它请回来了一部分 —— 三枚小标签（P2 / 人物 / 高频）+ 23px 标题，
     中文副标留在题头里。标签只渲染**数据里真有的**，没有就不渲染，绝不编。 */
  const __chips = [];
  if(s.type) __chips.push('<span class="td-chip part">' + escapeHtml(s.type) + '</span>');
  if(s.category) __chips.push('<span class="td-chip cat">' + escapeHtml(s.category) + '</span>');
  if(s.frequency) __chips.push('<span class="td-chip freq">' + escapeHtml(s.frequency) + '</span>');
  let html = '<div class="sp-topic-block">'
    + (__chips.length ? '<div class="td-chips">' + __chips.join('') + '</div>' : '')
    + '<div class="sp-detail-title">' + escapeHtml(title) + '</div>'
    + (s.promptZh ? '<div class="sp-detail-zh">' + escapeHtml(s.promptZh) + '</div>' : '')
    + '</div>';

  // P1 问题列表（逐题可点开 + 录 + 诊断）；9/15 之之：删「Part 1 小问题…」说明行
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i, s); });
    html += '</ol>';
  }

  // P2 单窗口答题（不分小问题，一次性作答 2 分钟）
  if(s.type === 'P2'){
    // P2 提示卡：题目 + You should say: 子提示统一合并到同一个 sp-prompt 白底黑字块（与官方题卡一致）
    /* T-017d：题目 + You should say 合并成一张卡；四条子提示改编号圆圈列表。
       中文副标已经提到题头卡里了，这里不再重复一遍。 */
    if(s.promptEn || (s.youShouldSay && s.youShouldSay.length)){
      html += '<div class="sp-prompt">';
      if(s.promptEn) html += '<div class="td-ysay-t">题目</div><div style="margin-bottom:12px">' + escapeHtml(s.promptEn) + '</div>';
      if(s.youShouldSay && s.youShouldSay.length){
        html += '<div class="td-ysay-t">You should say</div>'
          + '<div class="sp-ysay-list">'
          + s.youShouldSay.map(b => '<div>' + escapeHtml(b) + '</div>').join('')
          + '</div>';
      }
      html += '</div>';
    }

    /* T-017d：作答卡视觉抬起来（浅品牌底卡头 + 更重阴影），与上面"参考用的"串题卡一眼分开。
       🔴 卡头是新加的装饰层，不承担任何逻辑；下面所有业务 id 原样保留、顺序不变。 */
    html += '<div class="sp-p2-answer">';
    html += '<div class="td-anshead">'
      +   '<span class="ic">✍️</span>'
      +   '<h2>你的作答</h2>'
      +   '<span class="sub">照着上面串题原文讲一遍，或者用自己的话</span>'
      + '</div>';
    html += '<div class="td-ansbody">';
    // design/17 3.3：一句话备注（存 answers.p2.note，防抖 600ms 云同步）
    html += '<input class="pd-input sp-note-input" id="p2Note" placeholder="一句话备注（提醒自己怎么答、用什么例子）" autocomplete="off">';
    html += '<textarea class="sp-ans" id="p2Ans" placeholder="在这里写下你的 Part 2 回答，目标讲满 2 分钟（约 220–260 词）…"></textarea>';
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 2l2.4 5.1 5.6.8-4 4.1 1 5.6-5-2.7-5 2.7 1-5.6-4-4.1 5.6-.8z"/></svg>AI 纠错</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '<button class="sp-timer-btn" id="p2TimerBtn" type="button" title="开始 2 分钟倒计时，逼自己讲满 2 分钟">⏱ 2分钟</button>';
    html += '<span class="sp-timer-display" id="p2TimerDisplay" hidden>02:00</span>';
    // T-017d：词数（现算，不引新依赖；textarea.value.trim().split(/\s+/).length）
    html += '<span class="td-wordcount" id="p2WordCount">已写 <b>0</b> 词 · 目标 220</span>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '<div class="sp-rec-list" id="p2Records"></div>';
    html += '</div>';
    html += '</div>';
  }

  // P2 串题素材（逻辑 + 原文）：来自 AI 串题方案，自动回填；design/82 起整体收进「更多工具」折叠区
  if(s.type === 'P2'){
    // design/82：折叠分组默认态按数据算（不持久化，每次进详情重算）——
    // 已有串题稿 → 分组 A 默认 open；已有 P3 题 → 分组 B 默认 open；分组 C 永远默认收起
    const __p2a = (s.answers && s.answers.p2) || {};
    const storyHas = !!__p2a.aiStoryLink;
    const p3Has = !!(__p2a.p3 && Array.isArray(__p2a.p3.questions) && __p2a.p3.questions.length);
    const linkLabel = storyHas ? '重新生成串题思路' : 'AI 串题思路';
    /*10/3 B 版（她 21:23 拍板）：「更多工具」灰盒整个拆掉，两个工具做成**并排两张常驻卡**。
       ① 删「句型参考」整组（她说用不上；数据文件 patterns.json 不删，将来想恢复再加回来）
       ② 「AI 串题思路」不再折叠 —— 它是写 P2 时最常用的功能，藏起来最亏
       ③ 「P3 深度追问」不再折叠，提为常驻紫色卡（#p3Area 本来就在详情页容器内，与折叠无关）
       所有业务 id 一律保留：aiStoryLinkBtn / aiResult / p3GenBtn / p3Area / p3List / p3NextWrap / p3NextBtn / p3SaveWrap / p3SaveBtn */
    html += '<div class="sp-tools-wrap" id="p2ToolsWrap">';
    // 卡 A「AI 串题思路」：常驻，不再是 <details>
    html += '<section class="sp-tool-card sp-tool-card-a" id="p2ToolA">';
    html +=   '<div class="sp-tc-head">'
      +     '<span class="sp-tc-ic">🌿</span>'
      +     '<b>AI 串题思路</b>'
      +     '<button class="btn btn-sm" id="aiStoryLinkBtn" type="button">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;margin-right:5px"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>'
      +       escapeHtml(linkLabel)
      +     '</button>'
      +   '</div>';
    html +=   '<div class="sp-tc-hint">把素材卡改写成这道题能用的版本；点一次重新换一个素材角度。</div>';
    html +=   '<div class="sp-story-head"><span class="sp-story-title">串题素材（逻辑 + 原文）</span></div>';
    html +=   '<div class="sp-ai-result" id="aiResult"></div>';
    html += '</section>';
    // 卡 B「P3 深度追问」：常驻，紫色系（与上方绿色卡区分），逐题追问
    html += '<section class="sp-tool-card sp-tool-card-p3" id="p2ToolB"' + (p3Has ? ' data-has-p3="1"' : '') + '>';
    html +=   '<div class="sp-tc-head">'
      +     '<span class="sp-tc-badge">P3 追问</span>'
      +     '<span class="sp-tc-sub" id="p3Hint">AI 读你刚讲的故事，一题一题追问</span>'
      +     '<button class="btn btn-sm btn-p3" id="p3GenBtn" type="button">开始追问</button>'
      +   '</div>';
    html +=   '<div class="sp-p3-area" id="p3Area" data-p3-state="idle" hidden>';
    html +=     '<div class="sp-p3-list" id="p3List"></div>';
    html +=     '<div class="sp-p3-next" id="p3NextWrap" hidden><button class="btn btn-med" id="p3NextBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>再追问一题</button></div>';
    html +=     '<div class="sp-p3-save" id="p3SaveWrap" hidden><button class="btn btn-primary" id="p3SaveBtn" type="button">保存本题</button></div>';
    html +=     '<div class="sp-p3-exit" id="p3ExitWrap" hidden>不想再追问了？<button class="btn btn-sm" id="p3ExitBtn" type="button">练下一大题 →</button></div>';
    html +=   '</div>';
    html += '</section>';
    html += '</div>';

    // 动作行：P3追问已收进折叠分组 B（design/82），此处只留 完成/下一大题（右对齐自然收窄）
    html += '<div class="sp-action-row" id="p2ActionRow">';
    html += '<div class="sp-action-row-right">';
    html += '<button class="btn btn-med" id="p2FinishBtn" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn" type="button">下一大题 →</button>';
    html += '</div>';
    html += '</div>';

    /* T-017d：底部粘条的两个按钮 —— 只转发点击，不复制逻辑（老按钮与其 handler 原样在下面绑） */
    const tdDone = document.getElementById('tdDockDone');
    if(tdDone) tdDone.addEventListener('click', () => { const b = document.getElementById('p2FinishBtn'); if(b) b.click(); });
    const tdNext = document.getElementById('tdDockNext');
    if(tdNext) tdNext.addEventListener('click', () => { const b = document.getElementById('p2NextBtn'); if(b) b.click(); });

    // 底部动作栏：下一大题/完成（P3 展示完后出现在最底）
    html += '<div class="sp-bottom-bar" id="p2BottomBar" hidden>';
    html += '<button class="btn btn-med" id="p2FinishBtn2" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn2" type="button">下一大题 →</button>';
    html += '</div>';

    /* T-017d：底部粘条 —— 滚到哪都够得着「标为已练 / 下一大题」。
       按钮是**新建的兄弟节点**（tdDockDone / tdDockNext），点击时转发给原来的
       p2FinishBtn / p2NextBtn，老按钮与其点击逻辑一行没改。 */
    html += '<div class="td-dock" id="detailDock">'
      +   '<div class="td-dock-in">'
      +     '<span class="hint">这道题还没标熟练度</span>'
      +     '<span class="sp"></span>'
      +     '<button class="btn btn-med" id="tdDockDone" type="button">标为已练</button>'
      +     '<button class="btn btn-primary" id="tdDockNext" type="button">下一大题 →</button>'
      +   '</div>'
      + '</div>';
  }

  // 底部动作区：9/15 之之 — P1 删除「保存/删除此题/下一个话题」三按钮（草稿自动落库，无需保存）；
  // P2 的动作已合并到上方 AI 串题思路同一行，此处仅 P2 占位
  html += '<div class="sp-detail-actions">';
  html += '</div>';

  $('#detailBody').innerHTML = html;
  /* T-017d：设计稿的区块顺序是「题头 → 串题素材（主角）→ 你的作答 → P3 追问」，
     而原代码是「作答 → 串题 → P3」。这里只调 DOM 顺序，不重排任何生成逻辑、不动任何 id：
     把作答卡挪到串题卡后面，再把 P3 条挪到作答卡后面。 */
  if(s.type === 'P2'){
    const __wrap = $('#p2ToolsWrap'), __ans = document.querySelector('#detailBody .sp-p2-answer'), __p3 = $('#p2ToolB');
    if(__wrap && __ans && __p3 && __wrap.parentNode){
      __wrap.insertAdjacentElement('afterend', __ans);
      __ans.insertAdjacentElement('afterend', __p3);
    }
  }
  addLogicSteps($('#aiResult'));   // T-017d：串题逻辑整段 → 编号步骤块（纯展示层）
  appendStoryTools($('#aiResult'), s, null);   // T-017d：工具条补「语速 / 中文对照」
  updateWordCount();               // T-017d：词数初值
  spAutoGrowAll();   // 9/15：已存草稿的输入框初始渲染即按内容增高

  // 绑定事件（9/15 之之：P1 保存/删除/下一话题三按钮已删，草稿输入即自动落库）
  if(s.type === 'P2'){
    // 9/22 之之：完成 = 回题库列表 + 明确反馈（toast/定位/高亮，spBackToListWithFeedback）；
    // 下一大题 = 按当前筛选列表顺序直接进下一题（gotoNextTopic 同 Part 内轮转）
    const fin = $('#p2FinishBtn');
    if(fin) fin.addEventListener('click', () => spBackToListWithFeedback(curDetailId));
    const nx = $('#p2NextBtn');
    if(nx) nx.addEventListener('click', () => gotoNextTopic());
    // 底部动作栏的「完成/下一大题」复用同一逻辑
    const fin2 = $('#p2FinishBtn2');
    if(fin2) fin2.addEventListener('click', () => spBackToListWithFeedback(curDetailId));
    const nx2 = $('#p2NextBtn2');
    if(nx2) nx2.addEventListener('click', () => gotoNextTopic());
  }
  if(s.type === 'P2'){
    /* 10/3 B 版（她 21:23 拍板）：「更多工具」灰盒拆掉，两个工具改成**并排常驻卡**（<section> 不是 <details>），
       「句型参考」整组删除（data/patterns.json 数据文件保留，将来想恢复再加回来）。
       —— 所以下面不再需要 toolA.open / toolB.open 的「展开分组」兜底，只保留「结果自动滚到可见」。 */
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => { aiStoryLink(id); });
    // 串题结果渲染出内容（成稿 / 无 Key 引导 / 无素材引导 / 失败提示）→ 自动滚到可见（卡常驻，不存在"还收着"的情况）
    const aiRes = document.getElementById('aiResult');
    if(aiRes){
      let __lastChildN = 0;
      new MutationObserver(() => {
        if(!aiRes.childNodes.length) return;
        if(aiRes.childNodes.length !== __lastChildN){
          __lastChildN = aiRes.childNodes.length;
          aiRes.scrollIntoView({ behavior:'smooth', block:'nearest' });
        }
      }).observe(aiRes, { childList: true });
    }
    // 新 P3 题 / 引导卡渲染进 #p3List → 自动滚到 P3 区
    const p3AreaEl = document.getElementById('p3Area');
    const p3ListEl = document.getElementById('p3List');
    if(p3AreaEl && p3ListEl){
      new MutationObserver(() => {
        if(!p3ListEl.childNodes.length) return;
        p3AreaEl.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }).observe(p3ListEl, { childList: true });
    }
    /* 10/3 B 版：P3 卡底部「不想再追问了？→ 练下一大题」出口（她 21:26 拍板要的第二个动作） */
    const p3ExitBtn = document.getElementById('p3ExitBtn');
    if(p3ExitBtn) p3ExitBtn.addEventListener('click', () => { gotoNextTopic(); });
    // 备注框防抖保存（600ms → hubSave）
    const note = document.getElementById('p2Note');
    if(note){
      let __nt = null;
      note.addEventListener('input', () => {
        clearTimeout(__nt);
        __nt = setTimeout(() => {
          s.answers = s.answers || {};
          s.answers.p2 = s.answers.p2 || {};
          s.answers.p2.note = note.value.trim();
          s.answers.p2.noteTs = Date.now();
          hubSave();
        }, 600);
      });
    }
  }

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);

  // 26 · P1 问答流：一题一卡 + 进度 + 步进（只影响 P1 详情显示，不动数据）
  if(s.type === 'P1') p1FlowInit(s);

  // P2 单窗口事件绑定（仅手写 + AI 纠错 + 提交记录；无录音）
  if(s.type === 'P2'){
    const p2Diag = document.getElementById('p2Diag');
    if(p2Diag) p2Diag.addEventListener('click', e => { e.stopPropagation(); diagnoseP2(id); });
    // 9/13 修：P2 大答案框同样输入即存草稿（原只能靠点「保存」或 AI 诊断）
    const p2AnsEl = document.getElementById('p2Ans');
    if(p2AnsEl) p2AnsEl.addEventListener('input', () => {
      spDraftSave(id, 'p2', p2AnsEl.value);
      updateWordCount();   // T-017d：词数随输入实时变
    });
    // 9/22 之之：回车即 AI 纠错（Shift+Enter 换行；纠错中按钮 disabled 天然防连击）
    bindEnterSubmit(p2AnsEl, p2Diag);
    const p2Clear = document.getElementById('p2Clear');
    if(p2Clear) p2Clear.addEventListener('click', e => {
      e.stopPropagation();
      const ta = $('#p2Ans');
      if(ta){ ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }   // 9/13：同上，清空即落库
      const res = $('#p2Result'); if(res){ res.innerHTML = ''; res.style.display = 'none'; }
      // 仅清空当前编辑框与诊断结果，不删历史提交记录
    });

    // P2 倒计时按钮：点一下开始 2 分钟倒计时，到 0 停；再点重置重来
    const p2TimerBtn = document.getElementById('p2TimerBtn');
    const p2TimerDisp = document.getElementById('p2TimerDisplay');
    if(p2TimerBtn && p2TimerDisp){
      const TOTAL = 120; // 2 分钟
      const fmt = s => { const m = Math.floor(s / 60), sec = s % 60; return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); };
      p2TimerBtn.addEventListener('click', e => {
        e.stopPropagation();
        // 9/16 修：按钮文案写的是「停止」，原来再点却是从 02:00 重来——文案与行为对不上。
        // 现在：正在跑 → 真的停（收起计时显示、按钮回到「⏱ 2分钟」）；没在跑 → 重新开始。
        if(window.__p2TimerId){
          __clearP2Timer();
          p2TimerDisp.hidden = true;
          p2TimerDisp.classList.remove('sp-timer-end');
          p2TimerBtn.textContent = '⏱ 2分钟';
          p2TimerBtn.classList.remove('sp-timer-running');
          return;
        }
        __clearP2Timer();   // 修(f)：改用可跨页清理的句柄，原 p2TimerBtn._timer 随节点丢弃后无人清理
        let left = TOTAL;
        p2TimerDisp.hidden = false;
        p2TimerDisp.textContent = fmt(left);
        p2TimerDisp.classList.remove('sp-timer-end');
        p2TimerBtn.textContent = '⏱ 停止';
        p2TimerBtn.classList.add('sp-timer-running');
        // 自动聚焦输入框，方便语音输入转文字
        const ta = $('#p2Ans'); if(ta) ta.focus();
        window.__p2TimerId = setInterval(() => {
          // 修(f)：详情页被重建（切话题/完成）或软导航离开口语页后，这两个节点会脱离文档。
          // 检测到脱离就立刻自停，避免心跳在别的页面继续跑、2 分钟后弹出无关的「⏰ 2 分钟到」。
          if(!p2TimerDisp.isConnected){ __clearP2Timer(); return; }
          left--;
          if(left <= 0){
            __clearP2Timer();
            p2TimerDisp.textContent = '00:00';
            p2TimerDisp.classList.add('sp-timer-end');
            p2TimerBtn.textContent = '⏱ 2分钟';
            p2TimerBtn.classList.remove('sp-timer-running');
            toast('⏰ 2 分钟到！讲满啦');
            return;
          }
          p2TimerDisp.textContent = fmt(left);
        }, 1000);
      });
    }

    // P3 逐题追问：先出第 1 题，考生答完后点「下一道追问」基于上一题回答继续出题
    const MAX_P3 = 3;
    function getP2TextForP3(){
      const ta = $('#p2Ans');
      return (ta && ta.value.trim()) || (s.answers && s.answers.p2 && s.answers.p2.text) || '';
    }
    function ensureP3(){
      s.answers = s.answers || {}; s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.p3 = s.answers.p2.p3 || {};
      if(!Array.isArray(s.answers.p2.p3.questions)) s.answers.p2.p3.questions = [];
      if(!Array.isArray(s.answers.p2.p3.answers)) s.answers.p2.p3.answers = [];
      if(!Array.isArray(s.answers.p2.p3.aiHelper)) s.answers.p2.p3.aiHelper = [];
      return s.answers.p2.p3;
    }
    function showP3Area(){
      const area = $('#p3Area'); if(area){ area.hidden = false; area.dataset.p3State = 'generated'; }
      const saveWrap = $('#p3SaveWrap'); if(saveWrap) saveWrap.hidden = false;
      const bottom = $('#p2BottomBar'); if(bottom) bottom.hidden = false;
      /* 10/3 B 版：底部「练下一大题」出口（她 21:26 拍板：「也可以选择直接练下一题」）。
         每出一题都常驻可见 —— 答完当前题后两个出口并排：再追问一题 / 练下一大题。 */
      const exitWrap = $('#p3ExitWrap'); if(exitWrap) exitWrap.hidden = false;
      // 已生成过题：按钮变「重新生成 P3」，提示可重出
      const genBtn = $('#p3GenBtn');
      if(genBtn && area && area.dataset.p3State === 'generated'){
        genBtn.textContent = '重新生成';
      }
      // 顶栏提示更新为「已答 N 题」（她要能知道 AI 准备了几个、还剩几个）
      /* ⚠️ p3.questions / p3.answers 的真实格式是【字符串数组】（见保存处 answers.push(ta.value)），
         这里必须按字符串读；早先误按对象 a.text / q.q 统计，真实数据下恒为 0，提示永远退回默认文案。 */
      const hint = $('#p3Hint');
      if(hint){
        const p3 = ensureP3();
        const txtOf = v => (typeof v === 'string' ? v : (v && (v.text || v.q)) ) || '';
        const answered = p3.answers.filter(a => String(txtOf(a)).trim()).length;
        const total = p3.questions.filter(q => String(txtOf(q)).trim()).length;
        hint.textContent = answered
          ? ('已答 ' + answered + ' 题' + (total > answered ? '，这次共 ' + total + ' 题' : ''))
          : 'AI 读你刚讲的故事，一题一题追问';
      }
    }
    function updateP3NextBtn(){
      const p3 = ensureP3();
      const wrap = $('#p3NextWrap');
      if(wrap) wrap.hidden = (p3.questions.length >= MAX_P3);
    }
    async function genP3Step(step, prevQ, prevA){
      const p2Text = getP2TextForP3();
      const q = await window.MockGenP3.genNext(s, p2Text, step, prevQ, prevA);
      const p3 = ensureP3();
      p3.questions[step] = q;
      renderP3Step(s, $('#p3List'), step);
      updateP3NextBtn();
      showP3Area();
      hubSave();
    }
    async function genP3StepSafe(step, prevQ, prevA, btn, orig){
      if(btn){ btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
      try{
        await genP3Step(step, prevQ, prevA);
      }catch(err){
        toast('P3 生成失败：' + err.message + '（已尝试兜底）');
        try{
          const q = window.MockGenP3.presetNext(step);
          const p3 = ensureP3();
          p3.questions[step] = q;
          renderP3Step(s, $('#p3List'), step);
          updateP3NextBtn();
          showP3Area();
          hubSave();
        }catch(_){}
      }finally{
        if(btn){ btn.disabled = false; if(orig) btn.innerHTML = orig; }
      }
    }

    const p3GenBtn = document.getElementById('p3GenBtn');
    if(p3GenBtn) p3GenBtn.addEventListener('click', e => {
      e.stopPropagation();
      // design/82：点按钮即展开分组 B（首次生成 / 内联二次确认 / 重新生成都适用）
      const toolB2 = document.getElementById('p2ToolB'); if(toolB2) toolB2.open = true;
      const p2Text = getP2TextForP3();
      if(!p2Text){ toast('请先在 P2 答题框写点东西，再生成 P3 追问'); return; }
      const p3 = ensureP3();
      // 已有题：内联两步确认（design/81，替代原生 confirm）——第一次点变「再点一次确认清空」，
      // 3 秒内未再点自动还原；第二次点才真正清空重出。点「取消」或超时零数据变化。
      if(p3.questions.length && !p3GenBtn.dataset.confirming){
        const orig = p3GenBtn.innerHTML;
        clearTimeout(p3GenBtn._confirmT);
        p3GenBtn.dataset.confirming = '1';
        p3GenBtn.classList.add('confirming');
        p3GenBtn.innerHTML = '<span class="sp-confirm-txt">再点一次确认清空</span>';
        const cancel = document.createElement('button');
        cancel.className = 'btn btn-sm sp-confirm-cancel';
        cancel.type = 'button';
        cancel.textContent = '取消';
        cancel.addEventListener('click', ev => {
          ev.stopPropagation();
          clearTimeout(p3GenBtn._confirmT);
          p3GenBtn.innerHTML = orig;
          delete p3GenBtn.dataset.confirming;
          p3GenBtn.classList.remove('confirming');
          if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
        });
        p3GenBtn.parentNode.insertBefore(cancel, p3GenBtn.nextSibling);
        p3GenBtn._confirmT = setTimeout(() => {
          if(cancel.parentNode) cancel.parentNode.removeChild(cancel);
          p3GenBtn.innerHTML = orig;
          delete p3GenBtn.dataset.confirming;
          p3GenBtn.classList.remove('confirming');
        }, 3000);
        return;
      }
      // 第二次点击（确认）或首次无旧题：清理确认态后走原有生成流程
      if(p3GenBtn.dataset.confirming){
        clearTimeout(p3GenBtn._confirmT);
        delete p3GenBtn.dataset.confirming;
        p3GenBtn.classList.remove('confirming');
        const cc = p3GenBtn.parentNode && p3GenBtn.parentNode.querySelector('.sp-confirm-cancel');
        if(cc) cc.parentNode.removeChild(cc);
      }
      if(p3.questions.length){
        // 清空旧数据，从第 0 题重新出
        p3.questions = []; p3.answers = []; p3.aiHelper = [];
        const list = $('#p3List'); if(list) list.innerHTML = '';
        updateP3NextBtn();
      }
      const orig = p3GenBtn.innerHTML;
      genP3StepSafe(0, null, null, p3GenBtn, orig);
    });

    const p3NextBtn = document.getElementById('p3NextBtn');
    if(p3NextBtn) p3NextBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p3 = ensureP3();
      const step = p3.questions.length;
      if(step >= MAX_P3) return;
      const prevQ = p3.questions[step - 1] || null;
      const prevTa = document.querySelector('#p3List .sp-p3-q[data-i="' + (step - 1) + '"] .sp-p3-textarea');
      const prevA = prevTa ? prevTa.value.trim() : '';
      const orig = p3NextBtn.innerHTML;
      genP3StepSafe(step, prevQ, prevA, p3NextBtn, orig);
    });
    const p3SaveBtn = document.getElementById('p3SaveBtn');
    if(p3SaveBtn) p3SaveBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
      if(!p3 || !Array.isArray(p3.questions)){ toast('还没有 P3 题目，先点上面的按钮生成'); return; }
      const answers = [];
      p3.questions.forEach((q, i) => {
        const ta = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"] .sp-p3-textarea');
        answers.push((ta && ta.value) || '');
      });
      p3.answers = answers;
      p3.tsSave = Date.now();
      s.updatedAt = Date.now();
      hubSave();
      toast('已保存 P3 答案');
    });

    // P2 答案回填
    if(s.answers && s.answers.p2){
      const ta = $('#p2Ans');
      if(ta && s.answers.p2.text) ta.value = s.answers.p2.text;
      const noteEl = $('#p2Note');
      if(noteEl && s.answers.p2.note) noteEl.value = s.answers.p2.note;   // design/17：备注回显
      const res = $('#p2Result');
      if(res && s.answers.p2.result){
        try{
          const j = JSON.parse(s.answers.p2.result);
          if(renderP2Diag(res, j, s.answers.p2.text)){ res.style.display = 'block'; }
          else { throw 0; }
        }catch(_){
          res.innerHTML = '<pre>' + escapeHtml(s.answers.p2.result) + '</pre>';
          res.style.display = 'block';
        }
      }
      // 回填 AI 串题方案（design/87：新结构走 V2 渲染，旧结构在 V2 内部兜底走旧渲染原样保留）
      if(s.answers.p2.aiStoryLink){
        renderStoryLinkV2($('#aiResult'), s.answers.p2.aiStoryLink, s);
        addLogicSteps($('#aiResult'));   // T-017d：回填的稿子同样要切编号块
        appendStoryTools($('#aiResult'), s, s.answers.p2.aiStoryLink);
      }
      /* 回填已生成的 P3 追问列表 + 答案。
         10/3 B 版：统一走 showP3Area()（原先这里手抄了一份显示逻辑，漏掉了「已答 N 题」提示
         和「练下一大题」出口 —— 有存量 P3 数据时这两个不显示，是同一根因）。 */
      if(s.answers.p2.p3 && Array.isArray(s.answers.p2.p3.questions) && s.answers.p2.p3.questions.length){
        renderP3All(s, $('#p3List'));
        updateP3NextBtn();
        showP3Area();
      }
    }
    // design/87 草稿恢复：阶段一已跑（补槽中/成稿前）→ 打开详情即恢复草稿态，不重复调 AI。
    // ⚠️ 不做「开题自动跑 AI」：doc 假设的抽题自动联动在历史版本中从未存在（68027df 起就是按钮触发，
    // 原 1156 行注释只是 matLoadStore 段落壳），且自动触发会破坏 design/82 的干净收起态、每次开新题都烧 token。
    if(s.type === 'P2' && $('#aiResult')){
      const p2now = (s.answers && s.answers.p2) || {};
      if(p2now.linkDraft && p2now.linkDraft.plan){
        renderStoryLinkV2($('#aiResult'), p2now.linkDraft.plan, s);
      }
    }
    // 渲染 P2 提交历史记录
    renderSubmitRecords((s.answers.p2 && s.answers.p2.records) || [], $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j = JSON.parse(rec.result); if(renderP2Diag(res, j, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));
  }
}

function spGoPracticeCat(catId){
  // 显隐对齐 PRACTICE tab 逻辑（speaking.js ready 里同款），并展开该类重渲染
  spActivateTab('PRACTICE');
  $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true;
  // 10/2：coach 接管后，题库详情「去练该类」统一进 AI 陪练（catId 是句型类别，coach 用不上忽略）
  if(window.__COACH_ON){
    $('#sentView').hidden = true; $('#coachView').hidden = false;
    try{ window.__coachShow && window.__coachShow(); }catch(_){}
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  $('#sentView').hidden = false;
  window.__SENT_OPEN = window.__SENT_OPEN || {};
  window.__SENT_OPEN[catId] = true;
  window.__SENT_CUR = null;
  if(typeof sentRender === 'function') sentRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* === P1 详情页「下一题」：跳到当前筛选列表里的下一道 P1 话题 ===
   沿用用户刚筛选的条件（curFreq/curCat/curSearch），到末尾循环回第一道，方便连续练。 */
function gotoNextTopic(){
  let list = getFiltered();
  // 9/16 修：「下一题」只在同 Part 内轮（题库 tab 是 P1+P2 合并列表，
  // 原来从 P2 一路点下去迟早会串到 P1 话题上，答 P2 的节奏被打断）
  const cur = DATA.speaking.find(x => x.id === curDetailId);
  if(cur && cur.type){
    const same = list.filter(x => x.type === cur.type);
    if(same.length) list = same;
  }
  if(!list.length) return;
  const idx = list.findIndex(s => s.id === curDetailId);
  if(idx === -1){ openDetail(list[0].id); return; }   // 当前题不在筛选结果里（如刚改了筛选）→ 打开第一条
  const nextIdx = (idx + 1) % list.length;
  openDetail(list[nextIdx].id);
}

/* 「完成」统一出口（9/22 之之：原 P1 流程「完成 ✓」只弹 toast、P2 完成静默切视图，反馈感为零）：
   回题库列表 + 三层反馈——toast 练过题数、列表定位刚练的那张卡、1.5s 高亮闪烁。 */
function spBackToListWithFeedback(id){
  $('#listView').hidden = false;
  $('#detailView').hidden = true;
  renderList();
  try{
    const s = DATA.speaking.find(x => x.id === id);
    let n = 0;
    if(s && s.answers){
      Object.keys(s.answers).forEach(k => {
        const a = s.answers[k];
        if(a && ((a.records && a.records.length) || (a.text && String(a.text).trim()) || a.result)) n++;
      });
    }
    toast(n > 0 ? ('已保存 ✓ 本话题练过 ' + n + ' 题') : '已保存 ✓');
    const card = document.querySelector('.sp-card[data-id="' + id + '"]');
    if(card){
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('sp-card-flash');
      setTimeout(() => card.classList.remove('sp-card-flash'), 1600);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }catch(e){
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function saveDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  // P2 单窗口答案回存（仅写 text，不覆盖已存的诊断结果/时长）
  if(s.type === 'P2'){
    const ans = $('#p2Ans');
    if(ans && ans.value.trim()){
      s.answers = s.answers || {};
      s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.text = ans.value.trim();
      s.answers.p2.ts = Date.now();
    }
  } else {
    // 9/13 修：P1 原来点「保存」什么都没存（只有 AI 诊断会写库），toast 却说「已保存」→ 假反馈丢数据。
    // 现在把当前所有小题输入框的值同步写回；只补 text/ts，保留 records 与 result。
    document.querySelectorAll('.sp-ans[data-qi]').forEach(ta => {
      const qi = ta.getAttribute('data-qi');
      const v = (ta.value || '').trim();
      if(!v) return;
      s.answers = s.answers || {};
      s.answers[qi] = { ...(s.answers[qi] || {}), text: v, ts: Date.now() };
    });
  }
  s.updatedAt = Date.now();
  hubSave();
  toast('已保存');
}

/* === 删除口语题（9/23：不再记黑名单，官方题一律可恢复）===
   旧逻辑把被删 id 写进 DATA.deletedIds「墓碑」，换季升级也不复活——她拍板取消：
   题库里的官方题都是要练的范围，不该被永久隐藏（历史结果就是 100 题只显示 99）。
   现在删除只影响当前会话的数组；升级/换设备同步后官方题全量回来（个人答案仍按 id 保留）。 */
function deleteSpeaking(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  DATA.speaking = DATA.speaking.filter(x => x.id !== id);
  hubSave();
  $('#detailView').hidden = true;
  $('#listView').hidden = false;
  curDetailId = null;
  renderList();
  toast('已隐藏该口语题（下次题库升级会自动回来）');
}

  /* === 素材生成器联动：P2 抽题命中个人素材 → AI 自动匹配串题方案 === */
function matLoadStore(){
  if(DATA.materials && Array.isArray(DATA.materials.materials)) return DATA.materials;
  try{ const s = JSON.parse(localStorage.getItem('ielts_materials_v1')); if(s && Array.isArray(s.materials)) return s; }catch(_){}
  return null;
}

/* v7.2 细节碎片库：串题时考生自己补的细节 / AI 代补的细节，沉淀进素材库（DATA.materials.detailBits）。
   她背过的每个细节都进池子，之后任何题串题时都注入给 AI 当真实事实用——记一次，处处复用，不浪费记忆。
   按 (en|zh) 文本去重防重复入库；成功返回新增条数。 */
function matAddDetailBits(bits){
  if(!Array.isArray(bits) || !bits.length) return 0;
  const store = matLoadStore();
  if(!store) return 0;
  if(!Array.isArray(store.detailBits)) store.detailBits = [];
  const norm = x => String(x || '').trim().toLowerCase();
  let added = 0;
  bits.forEach(b => {
    if(!b) return;
    const en = String(b.en || '').trim(), zh = String(b.zh || '').trim();
    if(!en && !zh) return;
    if(store.detailBits.some(x => norm(x.en) === norm(en) && norm(x.zh) === norm(zh))) return;
    store.detailBits.push({ id: 'db' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), en, zh, from: b.from || '', ts: Date.now() });
    added++;
  });
  if(added) hubSave();
  return added;
}

/* 10-23 T-009 S-4：G 区（P2 串题，design/87）整块已搬到 js/sp-story.js
   —— storyWordBudget / spTargetBand / spDiagTierHead / spPersonaLine / spGuideCardHtml /
   spBindMatGuideBtn / chuanMatsText / chuanUserMsg / chuanSysWithMats / chuanFillPh /
   aiStoryLink / planChuan / finalChuan / setStoryLinkBtn / mdInline / copyTextFallback /
   copyStoryText / renderStoryLink / renderStoryLinkV2 / chuanParas / renderChuanFinal /
   extractStoryKeywords / renderChuanSlotFill / renderChuanUnfit / bindStoryTools /
   watchSpeakEnd / resetSpeakBtn，以及三个串题提示词常量
   SYS_CHUAN_PLAN / SYS_CHUAN_FINAL / CHUAN_AIFILL_SUFFIX 与 window.buildStoryPlainText ——
   原样搬家，函数体一字未改。 */


















/* A. 成稿态（natural 阶段一直出稿 / finalChuan 产物，j.fullEn 存在）。她拍板：单版一段稿，无版本切换 */

/* design/88：旧稿（无 keywords）一次性提取关键词。
   复用 speaking_chuan_final 计量组（会员闸/额度/分钟风控全部与出稿一致）。
   AI 成功 → keywords 补进 j 对象 → hubSave 落库 → 以关键词态重渲；
   AI 失败 → toast 提示 + 旧稿原样（沿用「AI 失败绝不落库」铁律）。 */

/* B. 补槽态（fit=adaptable 且无 fullEn）：漏斗式小问，答案实时写 linkDraft.supplements（关页/切题回来不丢） */

/* C. unfit 态：明说串不动，引导补素材卡；留「硬试」出口（supplements 为空，考官易判背题） */

/* 串题稿工具条：复制英文稿 / 朗读全文（新老结构都挂，文本统一走 buildStoryPlainText） */
/* 轮询朗读状态：speechSynthesis 不再说（播完 / 被 stop 的 cancel）→ 还原按钮。
   首查延迟 ~350ms：speak() 调用后 speaking 标志需一拍才置位，立即查会误判成"没在播"。 */

/* === P3 逐题追问渲染 ===
   行为：把第 i 题（已生成）渲染进 #p3List 末尾；首题无"上一题"标注，续题标注"追问 N"。
   每题：题号 + 朗读 + 题目 + 回答框 + AI辅助按钮 + 结果容器。
   绑定朗读 / AI辅助 / 回填已存辅助结果。保存事件（#p3SaveBtn）由 openDetail 统一绑定。 */
function renderP3Step(s, container, i){
  if(!container) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions) || !p3.questions[i]) return;
  const q = p3.questions[i];
  const qDisp = purifyP3Question(q);
  const savedAns = (Array.isArray(p3.answers) && p3.answers[i]) || '';
  const div = document.createElement('div');
  div.className = 'sp-p3-q';
  div.dataset.i = i;
  div.innerHTML = '<div class="sp-p3-q-head">'
    + '<span class="sp-p3-q-num">Q3-' + (i + 1) + (i === 0 ? '' : ' · 追问') + '</span>'
    + '<span class="sp-p3-q-text">' + escapeHtml(qDisp) + '</span>'
    + ttsBtnHtml()
    + '<button class="sp-p3-trans-btn" data-i="' + i + '" type="button" title="翻译为中文">译</button>'
    + '</div>'
    + '<div class="sp-p3-cn-line" data-i="' + i + '" hidden></div>'
    + '<textarea class="sp-p3-textarea" data-i="' + i + '" placeholder="写下或贴出你的 P3 回答（中英文均可）；没思路点「AI 辅助」，有思路点「老师帮我改」。">' + escapeHtml(savedAns) + '</textarea>'
    + '<div class="sp-p3-helper-row">'
    + '<button class="sp-p3-helper-btn" data-i="' + i + '" type="button" data-mode="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.5l-.9-2.3-2.1-.9 2.1-.9z"/></svg>AI 辅助</button>'
    + '<button class="sp-p3-review-btn" data-i="' + i + '" type="button" data-mode="review"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>老师帮我改</button>'
    + '</div>'
    + '<div class="sp-p3-ai-result" data-i="' + i + '"></div>';
  container.appendChild(div);
  const ttsBtn = div.querySelector('.sp-tts');
  if(ttsBtn) ttsBtn.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(qDisp, ttsBtn); });
  const transBtn = div.querySelector('.sp-p3-trans-btn');
  if(transBtn) transBtn.addEventListener('click', e => { e.stopPropagation(); toggleTranslateP3Q(s.id, i, transBtn); });
  const cnLine = div.querySelector('.sp-p3-cn-line');
  if(cnLine && p3.questionsCN && p3.questionsCN[i]){ cnLine.textContent = p3.questionsCN[i]; cnLine.hidden = false; }
  const aiBtn = div.querySelector('.sp-p3-helper-btn');
  if(aiBtn) aiBtn.addEventListener('click', e => { e.stopPropagation(); generateP3Helper(s.id, i); });
  const reviewBtn = div.querySelector('.sp-p3-review-btn');
  if(reviewBtn) reviewBtn.addEventListener('click', e => { e.stopPropagation(); reviewP3Answer(s.id, i); });
  // 9/22 之之：回车即「老师帮我改」（Shift+Enter 换行）
  bindEnterSubmit(div.querySelector('.sp-p3-textarea[data-i="' + i + '"]'), reviewBtn);
  const savedHelper = (Array.isArray(p3.aiHelper)) ? p3.aiHelper[i] : null;
  if(savedHelper && (savedHelper.main || savedHelper.extend || savedHelper.cn || savedHelper.raw)){
    const rEl = div.querySelector('.sp-p3-ai-result');
    if(rEl){ rEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div>'; renderP3Helper(rEl, savedHelper); }
  }
}

/* P3 单题翻译：点「译」把当前（已净化的）问题译为中文，内联显示在问题下方，不离开页面。
   结果缓存进 p3.questionsCN[i]，刷新或重开详情仍可见；再次点击切换显隐。 */
async function toggleTranslateP3Q(id, i, btn){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions) || !p3.questions[i]) return;
  const qDisp = purifyP3Question(p3.questions[i]);
  const cnLine = document.querySelector('#p3List .sp-p3-q[data-i="' + i + '"] .sp-p3-cn-line');
  if(!cnLine) return;
  // 已译过：切换显隐，不重复调接口
  if(p3.questionsCN && p3.questionsCN[i]){
    cnLine.hidden = !cnLine.hidden;
    return;
  }
  btn.disabled = true; const old = btn.textContent; btn.textContent = '…';
  try{
    const out = await callRelay('trans', [
      { role:'user', content:'把下面这道雅思口语 Part 3 问题翻译成自然、简单、易懂的中文。只输出中文译文本身，不要解释、不要英文、不要多余文字：\n\n' + qDisp }
    ], 0.3);
    const cn = String(out || '').trim();
    if(!cn) throw new Error('翻译结果为空');
    p3.questionsCN = p3.questionsCN || [];
    p3.questionsCN[i] = cn;
    hubSave();
    cnLine.textContent = cn;
    cnLine.hidden = false;
  }catch(e){
    toast('翻译失败：' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = old;
  }
}

/* 重新渲染整段（用于回填已有 P3 数据：已有几题就渲染几题，并显示"下一道追问"到当前步） */
function renderP3All(s, container){
  if(!container) return;
  container.innerHTML = '';
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  const n = (p3 && Array.isArray(p3.questions)) ? p3.questions.length : 0;
  for(let i = 0; i < n; i++) renderP3Step(s, container, i);
}

/* P3 四档映射：L1≤5.0 / L2 5.5 / L3 6.0 / L4≥6.5（2026-10-12 取代 10/2 的 <6/≥6 二档；
   分档设计与档位文案经 Camille 批准，见 design/口语AI目标分分档_实施方案_2026-10-12.md。
   动机：原 prompt 按她个人 5.5 基础定制，宣发后涌入不同基础用户 → 按口语目标分分档。 */
function p3Tier(){
  const t = spTargetBand();
  return t <= 5 ? 'L1' : (t < 6 ? 'L2' : (t < 6.5 ? 'L3' : 'L4'));
}

// P3 单题 AI 辅助的 system prompt（四档化；结构仍是「锚句 + because 尾巴」，锚句库 8→12 条）
function p3HelperSys(){
  const t = spTargetBand(), tier = p3Tier();
  const head = `身份：雅思口语 Part 3 答题辅助工具，考生目标口语 ${t} 分（${tier} 档）。直接产出考场可说的完整英文回答——观点明确、带一个 because 拓展，词汇与句式严格匹配目标分，仍须口语化。`;
  /* 规则1 词汇四档：L1 保留 24 词池硬锁（低分用户举例子易跑偏）；L2 池优先+少量高中词；L3/L4 按分匹配 */
  const p3Rule1 = {
    L1: '1. 词汇：只用初中-高中最基础词。because 后面的理由（即「尾巴」）只能用以下「词汇池」里的词或其最简单变形：happy, tired, relax, relaxed, bored, boring, easy, hard, same, different, need, want, like, feel, study, work, family, friends, food, money, time, life, people, day。严禁使用 pool 以外的任何抽象词、学术词、生僻形容词/副词（如 cognitive, flexible, enhance, identity, landmark, concrete, construct, symbolize 等）。',
    L2: '1. 词汇：优先用「词汇池」里的最简单词（happy, tired, relax, easy, hard, same, different, study, work, family, friends, time, life, people, day 等），允许少量高中常见词（如 popular, convenient, healthy, important, improve）；严禁学术词与生僻词（如 cognitive, enhance, identity, landmark, concrete）。',
    L3: `1. 词汇与句式：与目标口语 ${t} 分匹配——可使用该分数段地道、自然的词汇与搭配（如 essential, efficient, responsibility, technology, environment 这一档），允许 1 个从句展开；必须像真人聊天一样口语化，不许堆砌书面大词。锚句可按题目用同档词汇自然改写，但结构仍是「锚句 + because 尾巴」。`,
    L4: `1. 词汇与句式：与目标口语 ${t} 分匹配——地道习语与自然搭配，允许从句展开与较高级表达；但必须像真人聊天一样口语化，不许背书面语、不许堆砌大词。锚句仅作结构参考，可按题目用同档词汇自然改写。`
  }[tier];
  /* 规则2 长度四档（10-15s → 20-30s 梯度） */
  const p3Rule2 = {
    L1: '2. 输出只给「一句话英文」：结构 = 锚句 + 尾巴（尾巴里已含 because，直接拼接，绝对不要再额外写 because）。总长度 2 句以内、10-15 秒说完。',
    L2: '2. 输出只给「一句话英文」：结构 = 锚句 + 尾巴（尾巴里已含 because，直接拼接，绝对不要再额外写 because）。总长度 2 句、10-20 秒说完。',
    L3: '2. 输出给「一小段话英文」：结构 = 锚句 + because 尾巴（直接拼接，不要再额外写 because），再接一个泛化例子句。总长度 2-3 句、15-25 秒说完。',
    L4: '2. 输出给「一小段话英文」：结构 = 锚句 + because 尾巴（直接拼接，不要再额外写 because），再接一个例子或补充句。总长度 3 句左右、20-30 秒说完。'
  }[tier];
  /* 规则3 例子环分档（原「全档禁 for example」是按 5.5 定制的短板：6 分最缺的正是展开一层） */
  const p3Rule3 = {
    L1: '3. 绝对禁止：for example / for instance / such as（一个都不许出现）；禁止中文、禁止解释「为什么这样答」、禁止三段式拆解；禁止出现两个 because。',
    L2: '3. 绝对禁止：for example / for instance / such as（一个都不许出现）；禁止中文、禁止解释「为什么这样答」、禁止三段式拆解；禁止出现两个 because。',
    L3: '3. 允许且仅允许一个泛化例子环：可用 "for example, ..." 引出概念性例子（如 for example, young people often...），禁止个人具体故事（不出现 I once / my family / last year 这类）；禁止中文与解释；禁止出现两个 because。',
    L4: '3. 允许泛化例子环：可用 "for example, ..." 或 "such as" 引出概念性例子；仍禁止长篇个人故事；禁止中文与解释；禁止出现两个 because。'
  }[tier];
  const p3Rule4 = '4. 重复问题：若考生连续追问，可用 "Well, like I said..." / "Well, what I mean is..." 换词重复，但不超过两次，第三次直接简化。';
  /* 答题逻辑的微调口径四档 */
  const p3PoolLogic = {
    L1: '- 如需结合当前题目微调，只能把尾巴里的词换成「词汇池」内的其他简单词（例如题目谈学习，就把 tired 换成 study is hard），不可引入 pool 外词汇；',
    L2: '- 如需结合当前题目微调，优先把尾巴里的词换成池内简单词，允许用少量高中常见词改写（如 convenient, popular），不可引入学术词；',
    L3: '- 如需结合当前题目微调，可在保持「锚句 + because 尾巴」结构的前提下，用与目标分匹配的地道词汇改写尾巴；例子句须泛化、贴合题目主题；',
    L4: '- 如需结合当前题目微调，可在保持「锚句 + because 尾巴」结构的前提下，用地道搭配改写尾巴；例子句须泛化、贴合题目主题；'
  }[tier];
  /* 输出格式示例随档位变（L3/L4 含例子环） */
  const tierOutEx = {
    L1: "锚句 + 尾巴，例如：Actually, I don't think there is much difference, because the feeling is the same.",
    L2: "锚句 + 尾巴，例如：Actually, I don't think there is much difference, because the feeling is the same.",
    L3: "锚句 + 尾巴 + 泛化例子，例如：It has both good and bad sides, because it is convenient but sometimes boring. For example, it saves time but costs more.",
    L4: "锚句 + 尾巴 + 例子或补充句，例如：It has both good and bad sides, because it is convenient but sometimes boring. For example, it saves time but costs more."
  }[tier];
  return `${head}

考生特点：P3 通常只能说 2-3 句话、说话会磨叽带停顿；听不懂题目时靠判断「题型」来兜底。你的任务：根据「当前 P3 题目 + 考生 P2 素材」，直接产出考场可说的完整英文回答——锚句（观点）紧跟 because 拓展，说完即止，不解释、不乱加。

【绝对强制硬规则】
${p3Rule1}
${p3Rule2}
${p3Rule3}
${p3Rule4}

【题型 → 锚句库（按题型命中，不得自创；锚句不含 because，尾巴已含 because，直接拼接）】
- 区别/变化类（听到 different / change / same）：Actually, I don't think there is much difference.
  尾巴：because the feeling is the same.
- 原因类（听到 why / reason）：I think it's because people want to relax.
  尾巴：because they are tired and need a break.
- 好坏类（听到 good / bad / advantage）：It has both good and bad sides.
  尾巴：because it is convenient but sometimes boring.
- 应不应该类（听到 should / necessary）：It depends on the person.
  尾巴：because some people need it, some don't.
- 未来类（听到 future / will）：I think it will be the same as now.
  尾巴：because people still want the same things in daily life.
- 同意与否类（听到 agree / opinion）：I partly agree.
  尾巴：because it is true for some, not for all.
- 重要性类（听到 important）：Yes, I think it is important.
  尾巴：because it makes life happier.
- 过去与变化类（听到 did you ... when you were a child / used to）：Yes, I did when I was younger.
  尾巴：because it was a big part of my life back then.
- 喜好偏向类（听到 prefer / which do you like better）：I prefer the former, to be honest.
  尾巴：because it fits my daily life better.
- 频率习惯类（听到 how often / do you usually）：Not that often, maybe once or twice a week.
  尾巴：because I am usually busy with study.
- 感受描述类（听到 how do you feel about / what is it like）：It makes me feel relaxed.
  尾巴：because it helps me slow down a little.
- 没听懂/空白（听不清题）：That's a hard one.
  尾巴：because I just want to be happy and relaxed.

【答题逻辑】
- 先判断题型（看题目里的信号词），命中上面对应锚句；
- 输出 = 该行「锚句」+「尾巴」，直接拼接（锚句结尾无句号，尾巴以 ", because" 开头）；绝对不要再单独写 because；
${p3PoolLogic}
- 如果考生提供了 P2 素材且贴合，可在尾巴后用 and 接一个贴合素材的简单短语（不举具体人名/地名故事）。

【输出格式：严格按下面示例的结构输出，不要任何前缀 / 解释 / 换行分段】
<${tierOutEx}>`;
}

// P3「老师帮我改」：2026-10-12 四档化（取代 10/2 的 <6/≥6 二档，设计见 design/口语AI目标分分档_实施方案_2026-10-12.md）。
// 🔴 输出格式两行也要按档参数化——原「（2句以内，无例子）」写死，L3/L4 放开例子环后会与规则互斥（10/2 互斥病同款）。
function p3ReviewSys(){
  const t = spTargetBand(), tier = p3Tier();
  const head = `你是雅思口语Part3答题老师，考生目标口语 ${t} 分（${tier} 档）。直接给一版与目标分匹配的改动后回答（英文），表达自然、准确即可，词汇句式严格匹配目标分。`;
  const rvIntro = `直接给一版与目标口语 ${t} 分匹配的改动后回答（英文）：词汇句式自然达到该分数段，但口语化、不堆砌书面大词。`;
  const rvRule1 = {
    L1: '1. 词汇：只能用初中-高中最基础词汇，禁止identity, landmark, concrete, shape, construct, symbolize等；统一用look, famous, tall building等简单词。',
    L2: '1. 词汇：优先初高中最基础词，允许少量高中常见词（如 popular, convenient, healthy, important）；禁止学术词与生僻词（identity, landmark, concrete, construct, symbolize等）。',
    L3: `1. 词汇：与目标口语 ${t} 分匹配，可使用该分数段地道的口语词汇与搭配，允许 1 个从句展开；表达必须准确、自然、口语化，不生硬堆大词。`,
    L4: `1. 词汇：与目标口语 ${t} 分匹配，地道习语与自然搭配，允许从句展开与较高级表达；表达必须准确、自然、口语化，不背书面语。`
  }[tier];
  const rvRule2 = {
    L1: '2. 主回答铁则：2句以内、10-15秒；只含观点+1个最简单原因；绝对禁止for example/for instance/such as；最多1个简单复合结构。',
    L2: '2. 主回答铁则：2句、10-20秒；观点明确并带原因展开；绝对禁止for example/for instance/such as；最多1个简单复合结构。',
    L3: '2. 主回答铁则：2-3句、15-25秒；观点明确并带原因展开，可再接1个泛化例子句（for example + 概念性例子，禁止个人具体故事）；允许与目标分匹配的复合结构。',
    L4: '2. 主回答铁则：3句左右、20-30秒；观点+原因展开+例子或补充；可用for example/such as引出概念性例子；允许自然长句。'
  }[tier];
  /* 输出格式行四档（防互斥指令） */
  const rvFmt = {
    L1: '主回答：xxx（2句以内，无例子）',
    L2: '主回答：xxx（2句，无例子）',
    L3: '主回答：xxx（2-3句，可含1个泛化例子）',
    L4: '主回答：xxx（3句左右，可含例子）'
  }[tier];
  return `${head}
考生会贴出自己针对某道P3题目的回答（可能是中文，也可能是英文）。请你只做一件事：${rvIntro}不要挑问题、不要写中文说明、不要寒暄。

【绝对强制硬规则】
${rvRule1}
${rvRule2}
3. 追问拓展铁则：3句以内，必须含1个because从句；最多额外1个固定结构（especially for / which means二选一）；用抽象化P2素材举例，禁止具体个人故事。
4. 若考生贴的是中文：按合规的英文主回答直接翻译，不解释。

【输出格式：严格只输出下面两段，不要任何前缀/解释/寒暄】
${rvFmt}
追问拓展：xxx（3句以内，含because，可选）`;
}

// 把 AI 返回的 🔹 三段式文本拆成 {main, extend, cn}
function parseP3Helper(content){
  const r = { main:'', extend:'', cn:'', raw: content || '' };
  if(!content) return r;
  const parts = String(content).split('🔹');
  const take = (txt) => {
    txt = (txt || '').trim();
    const nl = txt.indexOf('\n');
    return nl >= 0 ? txt.slice(nl + 1).trim() : txt;
  };
  if(parts[1] != null) r.main = take(parts[1]);
  if(parts[2] != null) r.extend = take(parts[2]);
  if(parts[3] != null) r.cn = take(parts[3]);
  if(!r.main && !r.extend && !r.cn) r.main = String(content).trim();
  return r;
}

async function generateP3Helper(id, i){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions)){ toast('还没有 P3 题目，先点「P3追问」生成'); return; }
  const q = p3.questions[i];
  if(!q){ toast('题目为空'); return; }
  // 考生 P2 回答文本：优先实时框内，否则已存
  const ta = document.getElementById('p2Ans');
  const p2Text = (ta && ta.value && ta.value.trim()) || (s.answers.p2 && s.answers.p2.text) || '';

  const qDiv = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"]');
  const btn = qDiv ? qDiv.querySelector('.sp-p3-helper-btn') : null;
  const resultEl = qDiv ? qDiv.querySelector('.sp-p3-ai-result') : null;

  if(btn){ btn.disabled = true; btn.innerHTML = 'AI 在生成…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按 ' + spTargetBand() + ' 分策略生成 P3 参考答案…</div>'; resultEl.style.display = 'block'; }

  try{
    const content = await callRelay('p3_aihelper', [
      { role:'system', content: p3HelperSys() },
      { role:'user', content:'当前P3题目：' + q + '\n\n用户的P2回答内容：\n' + (p2Text || '（考生暂未填写 P2 回答，请用通用素材作答）') }
    ], 0.7);
    const parsed = parseP3Helper(content);
    p3.aiHelper = p3.aiHelper || [];
    p3.aiHelper[i] = { main: parsed.main, extend: parsed.extend, cn: parsed.cn, raw: content, ts: Date.now() };
    s.updatedAt = Date.now();
    hubSave();
    if(resultEl){ resultEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div>'; renderP3Helper(resultEl, p3.aiHelper[i]); }
  }catch(e){
    if(resultEl) resultEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div><div class="diag-note">生成失败：' + escapeHtml(e.message) + '</div>';
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.5l-.9-2.3-2.1-.9 2.1-.9z"/></svg>AI 辅助'; }
  }
}

// 考生用同一个回答框里的内容，老师按 5.5 规则挑问题 + 给改后合规版本
async function reviewP3Answer(id, i){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const qDiv = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"]');
  const ta = qDiv ? qDiv.querySelector('.sp-p3-textarea') : null;
  const btn = qDiv ? qDiv.querySelector('.sp-p3-review-btn') : null;
  const resultEl = qDiv ? qDiv.querySelector('.sp-p3-ai-result') : null;
  if(!ta || !btn || !resultEl) return;
  const userText = (ta.value || '').trim();
  if(!userText){ toast('先在上面写或贴一下你的 P3 回答'); ta.focus(); return; }
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  const q = (p3 && Array.isArray(p3.questions) && p3.questions[i]) || '';
  const p2TextEl = document.getElementById('p2Ans');
  const p2Text = (p2TextEl && p2TextEl.value && p2TextEl.value.trim()) || (s.answers.p2 && s.answers.p2.text) || '';

  btn.disabled = true; btn.innerHTML = '老师在看…';
  resultEl.innerHTML = '<div class="diag-note">老师正在按 ' + spTargetBand() + ' 分规则看你刚写的回答…</div>';
  resultEl.style.display = 'block';
  try{
    const content = await callRelay('p3_review', [
      { role:'system', content: p3ReviewSys() },
      { role:'user', content:'当前P3题目：' + q + '\n\n用户的P2回答内容：\n' + (p2Text || '（考生暂未填写 P2 回答）') + '\n\n考生自己的P3回答（待修改）：\n' + userText }
    ], 0.6);
    const parsed = parseP3Review(content);
    resultEl.innerHTML = '<div class="sp-p3-result-tag">老师改动</div>' + renderP3ReviewHtml(parsed);
    resultEl.style.display = 'block';
    // 绑定朗读
    resultEl.querySelectorAll('.sp-p3-tts').forEach(b => {
      const body = b.closest('.sp-p3-block').querySelector('.sp-p3-block-body');
      const txt = body ? body.textContent.trim() : '';
      if(txt) b.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(txt, b); });
    });
  }catch(e){
    resultEl.innerHTML = '<div class="sp-p3-result-tag">老师改动</div><div class="diag-note">老师暂时改不了：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>老师帮我改';
  }
}

// 把 AI 返回的「主回答：x / 追问拓展：y」拆成 {main, extend}
function parseP3Review(content){
  const r = { main:'', extend:'', raw: content || '' };
  if(!content) return r;
  const txt = String(content);
  // 抽「主回答：」段到「追问拓展：」或末尾之间
  const mMain = txt.match(/主回答[：:]\s*([\s\S]*?)(?=(?:\n\s*追问拓展[：:])|$)/);
  if(mMain) r.main = mMain[1].trim();
  // 抽「追问拓展：」段到末尾
  const mExtend = txt.match(/追问拓展[：:]\s*([\s\S]*?)$/);
  if(mExtend) r.extend = mExtend[1].trim();
  // 兜底：若 AI 没按格式输出，整段当主回答
  if(!r.main && !r.extend) r.main = txt.trim();
  return r;
}

// 渲染「老师帮我改」结果：只一个块，里面包含主回答 + 追问拓展，整块可朗读
function renderP3ReviewHtml(r){
  if(!r) return '';
  const all = [];
  if(r.main) all.push('主回答：' + r.main);
  if(r.extend) all.push('追问拓展：' + r.extend);
  if(!all.length) return '<div class="diag-note">（返回格式异常，已保留原文）</div><pre>' + escapeHtml(r.raw || '') + '</pre>';
  let body = all.join('\n\n');
  let h = '';
  h += '<div class="sp-p3-block">';
  h += '<div class="sp-p3-block-title">改后回答<span class="sp-p3-sub">可直接照着说</span></div>';
  h += '<div class="sp-p3-block-body">' + escapeHtml(body) + '</div>';
  h += '<div class="sp-p3-block-tools">' + ttsBtnHtml('sp-p3-tts') + '</div>';
  h += '</div>';
  return h;
}

// 渲染 P3 单题 AI 辅助结果（极简：仅显示一句英文，不附加说明）
function renderP3Helper(el, r){
  if(!el || !r) return;
  let h = '';
  // 仅渲染主回答（英文，可朗读）；新 prompt 只返回一句英文，落在 main 上
  if(r.main){
    h += '<div class="sp-p3-block">';
    h += '<div class="sp-p3-block-title">AI 辅助 · 参考答案<span class="sp-p3-sub">考场直接说 · 一句即可</span></div>';
    h += '<div class="sp-p3-block-body">' + escapeHtml(r.main) + '</div>';
    h += '<div class="sp-p3-block-tools">' + ttsBtnHtml('sp-p3-tts') + '</div>';
    h += '</div>';
  }
  if(!h){
    h = '<div class="diag-note">（生成结果格式异常，已保留原文）</div><pre>' + escapeHtml(r.raw || '') + '</pre>';
  }
  el.innerHTML = h;
  el.style.display = 'block';
  // 绑定朗读（每个英文块右上角的 TTS 朗读该块正文）
  el.querySelectorAll('.sp-p3-tts').forEach(b => {
    const body = b.closest('.sp-p3-block').querySelector('.sp-p3-block-body');
    const txt = body ? body.textContent.trim() : '';
    if(txt) b.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(txt, b); });
  });
}

// 单题可点开项 HTML（text=可见文本，qi=题目索引）
function questionItemHtml(text, qi, s){
  const ans = (s && s.answers) ? s.answers[qi] : null;
  // 9/15 之之：回答面板默认展开、取消折叠（去 caret 箭头与 hidden）
  return '<li class="sp-q open" data-qi="' + qi + '">'
    + '<span class="sp-q-text">' + escapeHtml(text) + '</span>'
    + ttsBtnHtml()
    + '<div class="sp-q-panel" data-qi="' + qi + '">'
    +   '<div class="sp-mini-body" data-body="rec" data-qi="' + qi + '">'
    +     '<textarea class="sp-ans" data-qi="' + qi + '" placeholder="在这里写下你的回答…"></textarea>'
    +     '<div class="sp-rec-list" data-qi="' + qi + '"></div>'
    +     '<div class="sp-q-btns">'
    +       '<button class="sp-ai-helper" data-qi="' + qi + '" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.5l-.9-2.3-2.1-.9 2.1-.9z"/></svg>AI 辅助</button>'
    +       '<button class="sp-diag" data-qi="' + qi + '" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 2l2.4 5.1 5.6.8-4 4.1 1 5.6-5-2.7-5 2.7 1-5.6-4-4.1 5.6-.8z"/></svg>AI 诊断</button>'
    +       '<button class="sp-ans-clear" data-qi="' + qi + '" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>清空</button>'
    +     '</div>'
    /* 10/2 她拍板：选填「想法」框——空着点 AI 辅助=AI 自己全想（与原先一致）；
      填一句中文/碎片英文再点=AI 严格按她的思路组织，只帮她变成地道英文。
      不填就完全不显影（placeholder 提示），不新增按钮、不加模式切换。
      id="spIdea" 单题复用于每题（HTML id 不要求唯一，这里靠 data-qi 区分），目的是用 id 级
      特异性压过 common.css:438 的全站表单重置 input:not():not() (0,2,1)——否则虚线边框会被吃成实线。 */
    +     '<input class="sp-idea" id="spIdea" data-qi="' + qi + '" type="text" maxlength="200" placeholder="想法（选填，中英文都行）" />'
    +     '<div class="sp-ai-result sp-q-result" data-qi="' + qi + '"></div>'
    +   '</div>'
    + '</div></li>';
}

// 绑定每题的展开/收起、语音、诊断、清空；并回填已存答案
function bindQuestionEvents(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  s.answers = s.answers || {};

  document.querySelectorAll('.sp-q').forEach(li => {
    const qi = li.dataset.qi;
    const ta = li.querySelector('.sp-ans[data-qi="' + qi + '"]');
    const resultEl = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');

    // 9/13 修：输入即存草稿（原只有点 AI 诊断才落库，写完直接返回=白写）
    if(ta) ta.addEventListener('input', () => spDraftSave(id, qi, ta.value));

    // 回填上次答案 + 诊断结果
    if(s.answers[qi]){
      if(ta && s.answers[qi].text) ta.value = s.answers[qi].text;
      if(resultEl && s.answers[qi].result){
        try{
          const j = JSON.parse(s.answers[qi].result);
          renderDiag(resultEl, j, s.answers[qi].result, s.answers[qi].text);
        }catch(_){
          resultEl.innerHTML = '<div class="diag-note">（上次 AI 没按格式回，已贴原文）</div><pre>' + escapeHtml(s.answers[qi].result || '') + '</pre>';
          resultEl.style.display = 'block';
        }
      }
      // 回填 AI 辅助结果（逻辑链 + 折叠参考英文，不自动填框）
      const aiHelper = s.answers[qi].aiHelper;
      if(aiHelper && (aiHelper.logicChain || aiHelper.answer)){
        const aiRes = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');
        if(aiRes) renderAIHelper(aiRes, aiHelper);
        /* 10/2：把上次填过的「想法」回填进输入框——否则退出再进来她白填了一遍。 */
        if(aiHelper.idea){
          const ideaEl = li.querySelector('.sp-idea[data-qi="' + qi + '"]');
          if(ideaEl && !ideaEl.value) ideaEl.value = aiHelper.idea;
        }
      }
      // 渲染提交历史记录（每次手写提交都会记录，点击可回填，✕ 可删除）
      renderSubmitRecords(s.answers[qi].records, li.querySelector('.sp-rec-list[data-qi="' + qi + '"]'), (rec) => {
        if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
        if(resultEl && rec.result){
          try{ const j = JSON.parse(rec.result); renderDiag(resultEl, j, rec.result, rec.text); resultEl.style.display = 'block'; }
          catch(_){ resultEl.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; resultEl.style.display = 'block'; }
        }
      }, (i) => removeSubmitRecord(s, qi, i));
    }

    // 题目语音播放（点按钮朗读当前小问题，不触发展开）
    const tts = li.querySelector('.sp-tts');
    if(tts) tts.addEventListener('click', e => {
      e.stopPropagation();
      const txt = li.querySelector('.sp-q-text');
      if(txt && txt.textContent.trim()) speakQuestion.speak(txt.textContent.trim(), tts);
    });

    // 9/15 之之：回答面板默认展开、取消折叠——原「点题干展开/收起」交互删除，
    // 朗读只由 p1FlowInit 切题时和喇叭按钮触发

    // AI 诊断
    const diag = li.querySelector('.sp-diag[data-qi="' + qi + '"]');
    if(diag) diag.addEventListener('click', e => {
      e.stopPropagation();
      const answer = ta ? ta.value.trim() : '';
      if(!answer){ toast('先说出或写下你的回答'); return; }
      let questionText;
      if(s.type === 'P1'){
        questionText = (s.questions || [])[+qi] || '';
      } else {
        questionText = '题目：' + (s.promptEn || s.title || '') + '\n本题要点：' + ((s.youShouldSay || [])[+qi] || '');
      }
      diagnoseAnswer(id, qi, questionText, answer);
    });
    // 9/22 之之：回车即 AI 诊断（Shift+Enter 换行；诊断中按钮 disabled 天然防连击）
    bindEnterSubmit(ta, diag);

    // AI 辅助：按人设一键生成
    const aiBtn = li.querySelector('.sp-ai-helper[data-qi="' + qi + '"]');
    if(aiBtn) aiBtn.addEventListener('click', e => {
      e.stopPropagation();
      generateAIHelper(id, qi);
    });

    // 清空（仅清空当前编辑框与诊断结果，不删历史提交记录）
    const clr = li.querySelector('.sp-ans-clear[data-qi="' + qi + '"]');
    if(clr) clr.addEventListener('click', e => {
      e.stopPropagation();
      if(ta){ ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }   // 9/13：派发 input 让草稿保存同步清空，否则清空后点保存旧答案又回来
      if(resultEl){ resultEl.innerHTML = ''; resultEl.style.display = 'none'; }
    });
  });
}

// 提交历史渲染（每次手写提交都会记录，点击可回填到输入框 / 诊断结果；onDelete 提供则每条带删除按钮）
function renderSubmitRecords(records, container, onPick, onDelete){
  if(!container) return;
  const list = records || [];
  const html = [];
  for(let i = 0; i < list.length; i++){
    const r = list[i];
    if(!r || !r.text) continue; // 旧录音记录（无 text）过滤掉
    const dt = new Date(r.ts).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
    const sc = (r.score && r.score.overall != null) ? ' · ' + scoreLabel(r.score.overall) + '分' : '';
    const preview = (r.text || '').slice(0, 28).replace(/\n/g, ' ');
    const del = onDelete ? '<span class="sp-rec-del" data-idx="' + i + '" title="删除这条历史">✕</span>' : '';
    html.push('<div class="sp-rec-item" data-idx="' + i + '"><span class="sp-rec-text">' + escapeHtml(preview) + '</span><span class="sp-rec-time">' + dt + '</span><span class="sp-rec-score">' + sc + '</span>' + del + '</div>');
  }
  if(!html.length){ container.innerHTML = ''; return; }
  container.innerHTML = html.reverse().join('');
  if(onPick){
    container.querySelectorAll('.sp-rec-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if(e.target.closest('.sp-rec-del')) return; // 点删除按钮不触发回填
        container.querySelectorAll('.sp-rec-item').forEach(x => x.classList.toggle('active', x === item));
        const rec = (records || [])[+item.dataset.idx];
        if(rec) onPick(rec);
      });
    });
  }
  if(onDelete){
    container.querySelectorAll('.sp-rec-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(confirm('删除这条历史记录？删除后无法恢复。')) onDelete(+btn.dataset.idx);
      });
    });
  }
}

// 删除一条提交历史（key 为 P1 小题序号或 'p2'），删除后重渲染列表并重算分数
function removeSubmitRecord(s, key, idx){
  if(!s || !s.answers || !s.answers[key] || !s.answers[key].records) return;
  const recs = s.answers[key].records;
  if(idx < 0 || idx >= recs.length) return;
  recs.splice(idx, 1);
  s.updatedAt = Date.now();
  hubSave();
  if(key === 'p2'){
    renderSubmitRecords(s.answers.p2.records, $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j = JSON.parse(rec.result); if(renderP2Diag(res, j, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));
  } else {
    const li = document.querySelector('.sp-q[data-qi="' + key + '"]');
    const container = li ? li.querySelector('.sp-rec-list[data-qi="' + key + '"]') : null;
    if(!container) return;
    renderSubmitRecords(s.answers[key].records, container, (rec) => {
      const ta = li ? li.querySelector('.sp-ans[data-qi="' + key + '"]') : null;
      const resultEl = li ? li.querySelector('.sp-q-result[data-qi="' + key + '"]') : null;
      if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      if(resultEl && rec.result){
        try{ const j = JSON.parse(rec.result); renderDiag(resultEl, j, rec.result, rec.text); resultEl.style.display = 'block'; }
        catch(_){ resultEl.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; resultEl.style.display = 'block'; }
      }
    }, (i) => removeSubmitRecord(s, key, i));
  }
  refreshScoreAfterDiag(s);
}

// AI 语法诊断（复用纯文本 callRelay，service=speaking_diagnose）

// P2 诊断结构化渲染（语法/用词错误合并为一个模块展示 + 改进建议 + 串题素材连接；不显示分数）

// P2 AI 纠错：语法纠错 + 串题素材连接建议

// 把 AI 偶尔返回的非标准 errors（字符串数组或中文说明）尽量归一化为对象数组

// 过滤 AI 输出的「自相矛盾」或「无错误硬凑」条目（兜底）

// 对两个短语做 token 级 diff，返回 [{type:'same'|'del'|'ins', text}]（按空格分词，忽略大小写匹配）

// 9/15 之之二反馈：AI 常把没错的上下文也塞进 original/fix（如 original="artificial intelligence is"
// fix="artificial intelligence has been"）→ 对错的词整段复述一遍绿色。先裁掉公共前后缀 token，
// 只留真正不同的核心再 diff，保证「没错的词绝不重复出现」。

// 在原句中 inline 标出修改（9/15 之之定版）：错误原文划删除线，绿色替换文本直接并排显示；
// 纯符号替换（AI 用 "/" 表示删除该词）不显示替换块，只留删除线；不再使用箭头对比形式

// 把新版 AI 输出（评分维度在顶层 + grammar_errors / corrected / lexical / suggestions）适配成旧后端字段
// （j.score.* / errors / fix / vocabulary / rewrite），让纠错渲染、评分兜底、发音接管逻辑都不用改
/* 10/3 修「词汇分显示 —」（她 21:04 报「有的时候让它评分，它词汇的分评不出来」）
   实测根因（探针 outputs/design/_diag_vocab.cjs，8 种 AI 返回逐一验证）：
     ① 维度映射漏了顶层 `vocabulary`（只映射了 `lexical`）→ AI 用新格式返 {vocabulary:5.5} 时
        **整个评分块都不渲染**（diagScoreHtml 开头要求至少有一个 basis）。
     ② AI 偶尔只返 `score.grammar` + `grammar_basis`、`vocabulary` 整个缺失 → parseScore 得null
        → 渲染成「词汇 —」而 grammar 有分，出现「有语法分、词汇空」的割裂。
        **不能靠猜**：但可以（a）多认几种字段名（b）分数缺失时**明确告诉用户「这次 AI 没给词汇分」而不是打「—」**。
     ③ 越界分（如 12）被直接显示 —— IELTS 只有 4~8，必须钳制，否则会出现「12 分」这种脏数据。 */

// 文本粗检：句子有明显破洞但 AI 漏报时，不让他享受"无错6分"兜底
// 9/26（她报 bug）：AI 识别到有错却不说具体位置时，兜底文案笼统到没法用。
// 升级：本地规则检测升级为「能给出命中的具体片段 + 问题类型说明」，兜底时直接指出来（标注为站内规则，不冒充 AI）。

/* === 评分净化（9/20 design/76 重写） ===
   旧版有一套「无错给 6 / 有错封顶 5.5 / 流利度硬拉 5.5」的兜底，那不是雅思标准而是拍脑袋，
   正是评分偏低的根源 —— 已整体删除。现在只做安全钳制：
   · 分数必须是 1~9 之间、0.5 步长的数字；非数字或越界一律丢弃（不猜、不兜底、不擅自拉高）
   · 流利度与发音需要音频才能评，文本评不了 —— 一律置空，绝不让 AI 偷跑一个出来
   · overall 由 parseScore 统一算，AI 给的一律删掉，避免口径不一致 */
/* 10-23 T-009 S-1：clampBand / normalizeScore 已搬到 js/sp-stats.js（方案 §三 语义归 D 区） */

// 渲染 inline 笔记式纠错（fallback：无法定位原句时使用；9/15 去箭头，划线+绿色替换并排）

// 渲染诊断结构化卡片（P1：语法/用词错误合并为一个模块展示，不显示分数）
/* === 诊断结果里的评分块（9/20 design/76）===
   只显示官方 band descriptor 下真实评出的「语法」「词汇」两项 + 各自依据；
   流利度与发音明确标为「待录音」，绝不留给空白让人以为评过。
   旧口径数据没有 basis（评分依据），这里直接不显示分数块 —— 分数必须能自证。 */

/* 10/1 她拍板：「我的语法错题」整模块下线——诊断结果不再提供「收进句型练习」按钮，
   diagCollectBar/bindDiagCollect 已删；诊断本身的纠错展示保留。 */

/* 9/22：「改进版表达」里把真正改过的片段标出来（她反馈「看不出到底哪个词搭配不当」）。
   拿清洗后 fix 的候选（"A / B" 多候选逐个试）在 rewrite 里做词边界匹配，命中就包 .diag-hl。
   重叠区间只留先命中的（长片段优先），其余原样转义输出，绝不改动文案本身。 */


// 「✨ AI 辅助」：按万能素材人设，一键生成 3-4 句英文回答（第1句表态 + 2-3句原因），填入作答框



/* === 万能素材生成器：已统一到 js/materials.js（口语页 MAT tab 与 materials.html 共用一份代码） ===
   置顶最熟 / 当季题库注入 / 覆盖矩阵 / 换季重映射 / 质检软门槛 全部在那份实现里。
   根治双副本漂移事故：此前本文件的独立副本吃不到 materials.js 的持续优化，用户在
   口语页「素材」tab 看到的仍是旧版（无换季横幅/置顶/矩阵）。materials.js 会自行把
   window.matGen.init 注册进 window.__hubRenderers（云同步合并后无缝重渲染）。 === */

/* 10-23 T-009 S-2：K 区（P1 问答流 p1FlowInit）已搬到 js/sp-list.js —— 原样搬家，函数体未改。 */
/* ======= 口语自动计时接入「计时」模块（9/22，照搬 practice.js 背词自动计时同款）=======
   用户常忘记开计时：开口语页即自动开一个「口语」计时（moduleId 与 data.js MODULES 的 speaking 一致），
   离页/切后台/关标签时结算进 DATA.sessions（首页「今日学习时长」与计时页都读它）。
   规则与 9/16 之之定版一致：已有别的模块在计 → 先正规结算前一个再开新表，绝不丢表、绝不双开。 */
var SPK_TIMER_MODULE = 'speaking';
var SPK_TIMER_NAME = '口语';
function spkTimerDeviceId(){
  try{
    let id = localStorage.getItem('hub_device_id');
    if(!id){ id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); localStorage.setItem('hub_device_id', id); }
    return id;
  }catch(e){ return 'd' + Date.now().toString(36); }
}
function isSpkTimerActive(){
  const a = window.active;
  if(a && !a.ended && a.moduleId === SPK_TIMER_MODULE) return true;
  const m = DATA.activeTimer;
  if(m && !m.ended && m.timerId && m.moduleId === SPK_TIMER_MODULE) return true;
  return false;
}
/* 正规结算「其他模块」的进行中计时（背词/听力/手动）：时长记到当前时刻，绝不丢表 */
function spkSettleForeignTimer(){
  const a = (window.active && !window.active.ended) ? window.active
          : ((DATA.activeTimer && !DATA.activeTimer.ended && DATA.activeTimer.timerId) ? DATA.activeTimer : null);
  if(!a || a.moduleId === SPK_TIMER_MODULE) return;
  const timerId = a.timerId;
  const endTs = Date.now();
  let pause = Number(a.pauseAccum) || 0;
  if(a.paused && a.pauseStart) pause += (endTs - a.pauseStart);
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs) - pause) / 1000));
  if(durationSec > 0 && !(DATA.sessions || []).some(s => s.timerId && s.timerId === timerId)){
    DATA.sessions = DATA.sessions || [];
    const names = (typeof resolveTimerNames === 'function')
      ? resolveTimerNames(a)
      : { moduleName: a.moduleName || '学习', subName: a.subName || '' };
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(a.startTs),
      moduleId: a.moduleId, subId: a.subId || a.moduleId,
      moduleName: names.moduleName, subName: names.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
}
function maybeStartSpkTimer(){
  // 首次引导没走完（全新用户，账号遮罩还挂着）时不自动开表：
  // 否则引导耗时会被记成口语练习时长；引导完成后再进页面即恢复正常自动计时。
  if(typeof getOnboarding === 'function'){
    // 9/30：新版引导（hub_onboarding_v2）用 finished 标记，不再有 account 字段 —— 继续读 account
    // 会让它恒为 undefined !== 'done' → 母语计时永远不自动开（静默故障）。
    const o = getOnboarding();
    const guided = o ? (o.finished !== true)
      : (typeof onbHasExistingData === 'function' ? !onbHasExistingData() : false);
    if(guided) return;
  }
  if(window.__spkTimerAuto && window.active && !window.active.ended && window.active.moduleId === SPK_TIMER_MODULE) return;
  if(isSpkTimerActive()) return;               // 本机已有口语表（手动开的）→ 不重复开
  spkSettleForeignTimer();                     // 别的模块在计 → 结算后再开新表
  const now = Date.now();
  const id = uid();
  const dev = spkTimerDeviceId();
  window.active = {
    timerId: id, ownerDevice: dev, moduleId: SPK_TIMER_MODULE, moduleName: SPK_TIMER_NAME,
    subId: SPK_TIMER_MODULE, subName: SPK_TIMER_NAME,
    startTs: now, startMonoNs: null, paused: false, pauseStart: null, pauseAccum: 0,
    pauseStartMonoNs: null, pauseAccumMonoNs: 0, targetSec: null, mode: 'up',
    updatedAt: now, lastBeat: now
  };
  DATA.activeTimer = {
    timerId: id, ownerDevice: dev, moduleId: SPK_TIMER_MODULE, moduleName: SPK_TIMER_NAME,
    subId: SPK_TIMER_MODULE, subName: SPK_TIMER_NAME,
    startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
    targetSec: null, mode: 'up', updatedAt: now, lastBeat: now, ended: false
  };
  window.__spkTimerAuto = true;
  hubSave();
}
// 9/26（她拍板 30s）：autostart 跳转自动开的口语计时，<30s 结束 = 误点，不落 session。
// ⚠️ 顶层 var、必须在 commitSpkTimer 之前（defer 同步执行期即赋值，避免 TDZ）。
var SPK_AUTO_MIN_SEC = 30;
function commitSpkTimer(){
  if(!window.__spkTimerAuto) return;
  const a = window.active;
  if(!a || a.ended || a.moduleId !== SPK_TIMER_MODULE){ window.__spkTimerAuto = false; window.__spkTimerByJump = false; return; }
  const timerId = a.timerId;
  const endTs = Date.now();
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs)) / 1000));
  DATA.sessions = DATA.sessions || [];
  const already = DATA.sessions.some(s => s.timerId && s.timerId === timerId);
  const _minSec = window.__spkTimerByJump ? SPK_AUTO_MIN_SEC : 1;
  if(!already && durationSec >= _minSec){
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(), moduleId: a.moduleId, subId: a.subId,
      moduleName: a.moduleName, subName: a.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: 0
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
  window.__spkTimerAuto = false;
  window.__spkTimerByJump = false;
  try{
    document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
    document.dispatchEvent(new CustomEvent('hub:timer-state'));
  }catch(e){}
}
/* 心跳 30s 节流：只刷内存镜像 + lastBeat，同步交给 hubSave 自带 debounce */
if(!window.__spkTimerBeat){
  window.__spkTimerBeat = setInterval(() => {
    if(!window.__spkTimerAuto) return;
    const a = window.active;
    if(!a || a.ended){ return; }
    const now = Date.now();
    a.lastBeat = now; a.updatedAt = now;
    if(DATA.activeTimer && DATA.activeTimer.timerId === a.timerId){ DATA.activeTimer.lastBeat = now; DATA.activeTimer.updatedAt = now; }
    hubSave();
  }, 30000);
}
/* 离页兜底：切后台/关标签即结算本次计时（与背词页互抢时互相正规结算，不丢表）。
   9/23 她改口径：不再「进页自动开表 / 回前台自动续表」——计时只由她点到回答框触发
   （下方 focusin/click 委托），打开页面浏览不动笔的时间不算口语时长。 */
if(!window.__spkTimerLeaveHook){
  window.__spkTimerLeaveHook = true;
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){ try{ commitSpkTimer(); }catch(e){} }
  });
  window.addEventListener('beforeunload', () => { try{ commitSpkTimer(); }catch(e){} });
}
/* 计时触发点：点到回答框（P1/P2 的 .sp-ans、P3 的 .sp-p3-textarea）才开「口语」计时。
   事件委托挂在 document 上：详情页是动态渲染的，focusin 冒泡覆盖所有现役/未来的作答框；
   click 兜底（个别场景点输入框不一定触发 focus）。 */
if(!window.__spkTimerFocusHook){
  window.__spkTimerFocusHook = true;
  const spkTimerTrigger = (e) => {
    const t = e.target;
    if(!t || !t.classList) return;
    if(!(t.classList.contains('sp-ans') || t.classList.contains('sp-p3-textarea'))) return;
    try{ window.__spkTimerByJump = false; maybeStartSpkTimer(); }catch(err){}
  };
  document.addEventListener('focusin', spkTimerTrigger);
  document.addEventListener('click', spkTimerTrigger);
}

/* 回车跳题（9/26 她拍板）：评分结果出来后按回车 = 下一题；最后一小题按回车 = 下一大题。
   焦点在输入框/文本域时不抢（回车要换行）；按钮不可见不触发。
   覆盖 P1 步进行（下一题 / 下一大题 / 完成）与 P2 详情页底部「下一大题」。 */
if(!window.__spEnterHook){
  window.__spEnterHook = true;
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || e.shiftKey) return;
    var t = e.target;
    if(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    var btn = null;
    var nav = document.querySelector('.sp-flow-nav');
    if(nav){
      var cands = ['.sp-flow-next', '#p1NextTopicBtn', '#p1FinishBtn'];
      for(var i = 0; i < cands.length; i++){
        var b = nav.querySelector(cands[i]);
        if(b && !b.hidden && b.offsetParent !== null){ btn = b; break; }
      }
    }
    if(!btn){
      var p2 = document.getElementById('p2NextBtn') || document.getElementById('p2NextBtn2');
      if(p2 && !p2.hidden && p2.offsetParent !== null) btn = p2;
    }
    if(btn){ e.preventDefault(); try{ btn.click(); }catch(err){} }
  });
}
