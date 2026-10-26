/* === 口语题库（极简版） · v20260923g（design/87：P2 串题要点驱动重构） === */

/* T-009 S-7（10-26）：A 区（入口状态 var + __clearP2Timer/spDraftSave/freqRank/spAutoGrow/
   spAutoGrowAll/renderFreqBanner/spRandomPick 七函数 + FREQ_ORDER/SP_FREQ_GROUPS/SP_ICONS）
   已原样并入 js/sp-core.js —— 软导航 defer 顺序 sp-core 在入口之前，全局 var 先立。
   ready() 主编排仍在本文件（方案 §五红线：236 行主编编不许再拆）。 */

/* 10-24 T-009 S-6：B 区（按需加载框架 lateReady/lateLoad + 模考忙碌态 spMockTip / spMockTabBusy）
   已搬到 js/sp-mock.js；L/M 区（口语自动计时 + 回车跳题钩子）已搬到 js/sp-timer.js。
   —— 原样搬家，函数体一字未改。 */


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

/* 10-24 T-009 S-5：F 区（详情页与保存）整块已搬到 js/sp-detail.js
   —— addLogicSteps / updateWordCount / appendStoryTools / tdSpeakRate /
   openDetail（515 行，只换住址、函数体一字未拆未改）/ spGoPracticeCat / gotoNextTopic /
   spBackToListWithFeedback / saveDetail / deleteSpeaking / matLoadStore / matAddDetailBits
   —— 原样搬家。 */












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

/* 10-24 T-009 S-4b：H 区（P3 追问与 AI）整块已搬到 js/sp-p3.js
   —— renderP3Step / toggleTranslateP3Q / renderP3All / p3Tier / p3HelperSys / p3ReviewSys /
   parseP3Helper / generateP3Helper / reviewP3Answer / parseP3Review / renderP3ReviewHtml /
   renderP3Helper —— 原样搬家，函数体一字未改。 */












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


