/* ==========================================================================
   sp-list.js · 口语页「驾驶舱 / 列表渲染 / P1 问答流」域（T-009 S-2 从 js/speaking.js 原样搬出）
   --------------------------------------------------------------------------
   来源区块：方案 §1.2 的 E 区（驾驶舱与列表渲染）+ K 区（P1 问答流）
   内容：renderCountdownBar（T-004 空壳）/ renderCockpit / renderList / renderGrouped /
        spCardHtml / refreshScoreAfterDiag / p1FlowInit

   🔴 只换文件住址，函数体一个字没改（T-009 红线）。
   🔴 所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
      const 只活在那一次 eval 的词法作用域，到了别的文件里就是 undefined。
   依赖（全是运行时调用，文件全部载完才在 ready() 里跑，故本文件可先加载）：
        sp-core.js  → getFiltered / refreshStateOptions / tagsHtml
        sp-stats.js → getAggScore / getPracticeCount / scoreBadgeHtml / scoreLabel / scoreScopeTip
        speaking.js → 全局 var（curType/curFreq/...）、SP_FREQ_GROUPS / SP_ICONS / __clearP2Timer
        sp-detail.js / sp-story.js → openDetail / spBackToListWithFeedback / gotoNextTopic / speakQuestion
   ========================================================================== */

/* ============================================================
   T-004（2026-10-22）：原 renderCountdownBar（10/3 B 版的倒计时提示条）已由 renderCockpit() 取代。
   函数保留为空壳（#spCountdown 容器已从 speaking.html 删除，getElementById 返回 null 直接 return）。
   ⚠️ 若日后要恢复「距考试 N 天」的强提示文案，直接改 renderCockpit() 的主行，不要复活这个函数。
   ============================================================ */
function renderCountdownBar(){
  const el = document.getElementById('spCountdown');
  if(!el) return;   // T-004：容器已删 → 直接返回（什么都不做）
}
/* ============================================================
   T-004（2026-10-22）：驾驶舱 = 原 .sp-banner（题库范围）+ .sp-countdown（考试日倒计时）合并
   —— 上半：考试日倒计时 + 主按钮（随机来一道）；下半：三项统计（题库量 / 已练 / 必考题进度）
   —— 数据源全部沿用：examCountdown()（common.js）/ SPEAKING_BANK_META / DATA.speaking 现算
   —— ⚠️ 没有考试日时不整块隐藏：退化成「题库概览」（label 改成题库范围），驾驶舱始终有内容
   ============================================================ */
function renderCockpit(){
  const el = document.getElementById('spCockpit');
  if(!el) return;
  const M = (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META : {};
  const bank = (DATA.speaking || []).filter(s => s && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
  const c1 = bank.filter(s => s.type === 'P1').length;
  const c2 = bank.filter(s => s.type === 'P2').length;
  const total = c1 + c2;
  const ultra = bank.filter(s => s.frequency === 'ultra').length;
  const doneN = bank.filter(s => getPracticeCount(s) > 0).length;

  let cd = null;
  try{ cd = (typeof examCountdown === 'function') ? examCountdown() : null; }catch(e){ cd = null; }
  const hasExam = !!(cd && cd.hasExam && cd.daysLeft != null && cd.daysLeft >= 0);

  /* 主行：有考试日 → 「下次考试 · 2026 年 10 月 9 日」+ 距考天数 + 还剩 N 道 P1 没练
     （T-004 口径修正 2026-10-22：原实现显示的是题库总量/已练过/必考题进度，与细则不符）*/
  const done1 = bank.filter(s => s.type === 'P1' && getPracticeCount(s) > 0).length;
  const done2 = bank.filter(s => s.type === 'P2' && getPracticeCount(s) > 0).length;
  const left1 = Math.max(0, c1 - done1);
  const cnDate = raw => {
    const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (+m[1]) + ' 年 ' + (+m[2]) + ' 月 ' + (+m[3]) + ' 日' : '';
  };
  let label, num, unit, sub;
  if(hasExam){
    const ds = cnDate(cd.raw);
    label = '下次考试' + (ds ? ' · ' + ds : '');
    num = String(cd.daysLeft);
    unit = '天';
    sub = left1 > 0 ? ('还剩 ' + left1 + ' 道 P1 没练') : 'P1 已全部练过';
  }else{
    label = '当前题库';
    num = String(total);
    unit = '题';
    sub = (M.season ? escapeHtml(M.season) + (M.region ? ' · ' + escapeHtml(M.region) : '') + ' · ' : '')
        + 'P1 ' + c1 + ' / P2 ' + c2;
  }

  /* 口语平均分：沿用本页现成分数口径（getAggScore = 每题历史最高分，只认 9/20 新口径），
     再对有分的题取平均。一条分都没有时该格隐藏，不显示 0。 */
  let band = null;
  try{
    const vals = bank.map(s => getAggScore(s)).filter(v => v != null);
    if(vals.length) band = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 2) / 2;
  }catch(e){ band = null; }
  const tgtSp = (DATA.settings && DATA.settings.targets && +DATA.settings.targets.speaking) || 0;

  const cell = (k, v, bar, tail) =>
      '<div class="sp-stat-cell">'
    +   '<div class="sp-stat-k">' + k + '</div>'
    +   '<div class="sp-stat-v">' + v + (tail || '') + '</div>'
    +   '<div class="sp-bar"><span style="width:' + bar + '%"></span></div>'
    + '</div>';
  let stats = '';
  stats += cell('P1 题库进度', done1 + '<i>/ ' + c1 + ' 题</i>', c1 ? Math.round(done1 / c1 * 100) : 0);
  stats += cell('P2 题库进度', done2 + '<i>/ ' + c2 + ' 题</i>', c2 ? Math.round(done2 / c2 * 100) : 0);
  if(band != null){
    stats += cell('口语平均分', band.toFixed(1), Math.min(100, Math.round(band / 9 * 100)),
                  tgtSp ? '<i>目标 ' + tgtSp.toFixed(1) + '</i>' : '');
  }

  el.innerHTML =
      '<div class="sp-cockpit-top">'
    +   '<div class="sp-cockpit-left">'
    +     '<div class="sp-cockpit-label">' + label + '</div>'
    +     '<div class="sp-cockpit-main">'
    +       '<span class="sp-cockpit-num">' + num + '</span>'
    +       '<span class="sp-cockpit-unit">' + unit + '</span>'
    +       '<span class="sp-cockpit-sub">' + sub + '</span>'
    +     '</div>'
    +   '</div>'
    +   '<button type="button" class="btn-main" id="spCockpitRandom">'
    +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>'
    +     '开始模考'
    +   '</button>'
    + '</div>'
    + '<div class="sp-cockpit-stats">' + stats + '</div>';
  /* T-004 改动点 1 主按钮口径调整：细则要求驾驶舱主按钮 = 「原来那个模考入口」，
     而模考真正的入口是题库筛选行那个 #spMockJumpBtn（点它 = 点隐藏的 MOCK tab）。
     这里直接转发到 #spMockJumpBtn 的 click，复用它的全部切换/加载逻辑，不另写一份。 */
  const rnd = document.getElementById('spCockpitRandom');
  if(rnd) rnd.addEventListener('click', () => {
    const jump = document.getElementById('spMockJumpBtn');
    if(jump) jump.click();
  });
}
function renderList(){
  renderCockpit();   // T-004：驾驶舱跟着筛选一起刷新（已练/进度会变）
  // design/88：状态下拉选项带题数（跟随其他筛选刷新，题数按当前其他筛选已生效后的剩余池统计）
  refreshStateOptions();
  const list = getFiltered();
  const container = $('#spList');
  if(list.length === 0){
    container.innerHTML = '';
    $('#spEmpty').hidden = false;
    return;
  }
  $('#spEmpty').hidden = true;
  container.innerHTML = renderGrouped(list);
  container.querySelectorAll('[data-id]').forEach(c => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
  });
  /* W-SPCRD-1（10-25）：题卡上的「练这道题」已撤，这段 [data-drill] 绑定随之删除。
     🔴 js/coach.js 的 __coachDrill / drillById 一行未动 —— 陪练页那条链路还在用。 */
  // 10/3 B 版分组面板：折叠头绑一下（面板用 <details>，原生展开收起不需 JS，这里只做「组内全选」入口透传）
  container.querySelectorAll('.sp-panel-head').forEach(h => {
    h.addEventListener('click', ev => {
      // 点组名= 折叠/展开；点「全部开始」= 打开组内第一题（不是真的批量开始，批量学习是另的事）
      if(ev.target.closest('.sp-panel-go')) return;
      const d = h.parentElement;
      const b = d.querySelector('details > summary');
      if(b) b.open = !b.open;
    });
  });
  /* W-SPCRD-1（10-25）：分组标题右侧的「全部开始」已撤，这段 [data-gstart] 绑定随之删除。
     组标题仍可点开/收起（下面那段 .sp-panel-head 的折叠逻辑原样保留）。 */
  /* T-004：单组兜底标题的「全部展开」→ 单组时列表本来就是全展开，按钮只做视觉反馈（刷新） */
  container.querySelectorAll('[data-more]').forEach(b => {
    b.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); renderList(); });
  });
}
/* ============================================================
   10/3 B 版「双栏工作台」下方：按频次分三段折叠面板（她选的合并版= A 工具条 + B 分组）
   —— 频次只有 4 档（ultra/high/medium/low），合并成 3 组展示：
      超高频 = ultra · 高频 = high · 中低频 = medium + low
   —— 组标题带题数 + 说明；超高频组默认展开，其余收起（不强制她要展开）
   —— ⚠️ 不改任何筛选逻辑，只是把 renderList 的输出按频次包一层 <details>
   ============================================================ */
function renderGrouped(list){
  const used = SP_FREQ_GROUPS.filter(g => list.some(s => g.freqs.indexOf(s.frequency) >= 0));
  if(used.length <= 1){
    // 只有一组（或零组）时不做分组壳，省一层无意义的折叠
    /* T-004：单组时也要有分组标题（block-h），否则题卡直接裸在页面上缺上下文。
       标题 = 该组的 label + desc；「更多」= 展开该组全部（单组时本来就是全展开，按钮退化为刷新列表）。 */
    if(used.length === 1){
      const g = used[0];
      return '<div class="sp-block-h">'
        + '<span class="sp-panel-caret" aria-hidden="true" style="visibility:hidden">▶</span>'
        + '<svg class="sp-panel-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SP_ICONS[g.icon] + '</svg>'
        + '<h3>' + g.label + '</h3>'
        + '<span class="desc">' + list.length + ' 题 · ' + g.desc + '</span>'
        + '<span class="spacer"></span>'
        + '<button type="button" class="more" data-more="' + escapeHtml(g.key) + '">全部展开<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>'
        + '</div>'
        + list.map(s => spCardHtml(s)).join('');
    }
    return list.map(s => spCardHtml(s)).join('');
  }
  return used.map(g => {
    const items = list.filter(s => g.freqs.indexOf(s.frequency) >= 0);
    if(!items.length) return '';
    /* T-004：面板头改成 block-h 口径（h3 标题 + desc 说明 + 右侧动作；W-SPCRD-1 起那颗已删）。
       ⚠️ <summary> 仍是折叠触发器（原生展开收起），caret 放最左。 */
    return '<details class="sp-panel" data-gkey="' + g.key + '"' + (g.open ? ' open' : '') + '>'
      + '<summary class="sp-panel-head">'
        + '<span class="sp-panel-caret" aria-hidden="true">▶</span>'
        + '<svg class="sp-panel-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SP_ICONS[g.icon] + '</svg>'
        + '<h3>' + g.label + '</h3>'
        + '<span class="sp-panel-n">' + items.length + ' 题 · ' + g.desc + '</span>'
        + '<span class="spacer"></span>'
      + '</summary>'
      + '<div class="sp-panel-body">' + items.map(s => spCardHtml(s)).join('') + '</div>'
      + '</details>';
  }).join('');
}
function spCardHtml(s){
  const title = s.titleEn || s.title || '';
  const zh = s.titleZh || '';
  const best = getAggScore(s);
  const count = getPracticeCount(s);
  /* B 版：题卡改横向布局 —— 左频次色条 + 中间英文/中文（占满剩余）+ 右标签组 + 右箭头。
     freq-* 类同时给左侧色条上色（CSS 用 [data-freq] 属性选择器）。 */
  /* 🔴 10/4 19:20 她 19:10 报「住所 / 对结果开心的重要决定显示不全、被截掉一截」，说了好几遍。
     探针实锤（tests/_verify_bankcards.cjs）：旧结构是**四块横排** rail|main|tags|go，
     而 .sp-card-main 只有 min-width:0（可无限压缩）→ 英文标题一长（如
     "An important decision you were happy with"），flex 空间不足时
       · 标题被压成 nowrap+ellipsis 的一行（真正被「截掉」）
       · 圆箭头 sp-card-go 被挤到**下一行再绕回最左**（实测 right=38，而卡右缘=377）
       · .sp-card-tags 的 max-width:46% + overflow:hidden 在硬切标签
     修：**改成两栏** —— 左栏（rail + 标题/中文/标签**竖排**）+ 右栏（箭头）。
        标题改为**允许换行**（不再 nowrap+ellipsis），标签移到左栏底部跟着标题走。
        这样无论标题多长，卡片只会变高，不会切内容、不会错位。
     T-004（2026-10-22）结构契约不变（仍是 rail | main | go 两栏），
     只把「练这道题」按钮改成**文字链**样式（CSS .sp-card-drill 已去底去边框），
     DOM 里 class/data-drill 全保留 → 事件绑定与 10/4 的防截断修法都不受影响。 */
  return '<div class="sp-card sp-card-row" data-id="' + s.id + '" data-freq="' + escapeHtml(s.frequency || '') + '">'
    + '<span class="sp-card-rail" aria-hidden="true"></span>'
    + '<div class="sp-card-main">'
      + '<div class="sp-card-title">' + escapeHtml(title) + scoreBadgeHtml(best, count, s) + '</div>'
      + (zh ? '<div class="sp-card-zh">' + escapeHtml(zh) + '</div>' : '')
      + '<div class="sp-card-tags">' + tagsHtml(s) + '</div>'
    + '</div>'
    /* W-SPCRD-1（10-25）：她 03:0x 原话「全部开始和练这道题删掉」→ 右栏那颗已删。
       右栏空出来后 .sp-card-main 独占整行宽度（标题照样换行不截断，见 css 里 .sp-card-row 的改制）。 */
    + '</div>';
}

/* design/12 一期骨架卡已于 design/16 P0 退场（按钮/面板/链常量删除）；
   s.answers.p2.skeleton 数据字段与云同步保留不删，已填数据他机仍可见。 */
// 诊断/评分保存后，同步更新列表 badge 与详情页头部分数
function refreshScoreAfterDiag(s){
  if(!s) return;
  renderList();
  const bestEl = document.querySelector('.sp-detail-best');
  if(bestEl){
    const bestScore = getAggScore(s);
    if(bestScore != null){
      // 标注口径：只含语法+词汇，避免被当成雅思总分
      bestEl.textContent = (s.type === 'P1' ? 'P1 平均分' : '历史最高') + '：' + scoreLabel(bestScore) + '分（语法+词汇）';
      bestEl.title = scoreScopeTip();
    }
  }
}
/* === 26 · P1 问答流：一题一卡 + 进度 + 步进（在 openDetail 的 P1 分支调用） === */
function p1FlowInit(s){
  var list = document.querySelector('.sp-q-list');
  if(!list || !s.questions || !s.questions.length) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('.sp-q'));
  if(!items.length) return;
  var n = items.length;
  s.answers = s.answers || {};

  // 默认定位：9/15 之之草稿续练——第一个「无草稿且无成绩」的小题（练到第 3 题退出，重进直达第 3 题
  // 且草稿还在）；全都有草稿/成绩时，回落到第一个没成绩的题；再回落第 1 题
  var cur = 0;
  var positioned = false;
  for(var i = 0; i < n; i++){
    var __a = s.answers[i];
    var __hasText = __a && __a.text && String(__a.text).trim();
    if(!__hasText && bestOfQuestion(__a) == null){ cur = i; positioned = true; break; }
  }
  if(!positioned){
    for(var k = 0; k < n; k++){ if(bestOfQuestion(s.answers[k]) == null){ cur = k; break; } }
  }

  // ① 进度头（圆点 + n/n 徽章）：9/15 之之要求删除，不再渲染

  // ② 步进导航（9/15：底部「保存/删除/下一话题」已删，插到题卡列表之后）
  // 9/24 她拍板：完成 / 下一大题 收进这一行，只在**最后一个小题**出现，顶掉「下一题」的位置 →
  //   最后一小题 = 上一题 · 完成 · 下一大题（一行）；其余小题 = 上一题 · 下一题（这两个按钮根本不出现）。
  //   原来 完成/下一大题 单独挂在页面最底另一行（sp-action-row），与计时条挤在一起还占两行，已删。
  var nav = document.createElement('div');
  nav.className = 'sp-flow-nav';
  // design/57：计数居左（纯文本），上一题 ghost 胶囊、下一题 ink 胶囊（原 class 保留，事件绑定不变）
  nav.innerHTML = '<span class="sp-flow-count"></span>'
    + '<button class="sp-flow-prev btn-ghost" type="button">← 上一题</button>'
    + '<button class="sp-flow-next btn-ink" type="button">下一题 →</button>'
    + '<button class="btn btn-med sp-flow-finish" id="p1FinishBtn" type="button" hidden>完成</button>'
    + '<button class="btn btn-primary sp-flow-topic" id="p1NextTopicBtn" type="button" hidden>下一大题 →</button>';
  list.insertAdjacentElement('afterend', nav);

  // ③ 已完成小结（9/16 修：插到 nav 之后而不是 list 之后——
  //    原来两次 insertAdjacentElement('afterend', list) 导致小结反排在步进按钮前面）
  var done = document.createElement('div');
  done.className = 'sp-flow-done';
  done.hidden = true;
  nav.insertAdjacentElement('afterend', done);

  // 9/22 之之：话题级出口——完成=回题库列表带反馈；下一大题=按列表顺序继续刷
  // 9/24：两个按钮已挪进步进导航行（见上），此处不再单独成行
  nav.querySelector('#p1FinishBtn').addEventListener('click', function(){ spBackToListWithFeedback(s.id); });
  nav.querySelector('#p1NextTopicBtn').addEventListener('click', function(){ gotoNextTopic(); });

  function render(){
    items.forEach(function(li, idx){ li.classList.toggle('active', idx === cur); });

    // 切到一道小题时自动朗读一次（点“下一题/上一题”或在列表点题都会触发）
    var activeLi = items[cur];
    if(activeLi){
      var qText = activeLi.querySelector('.sp-q-text');
      var btn = activeLi.querySelector('.sp-tts');
      if(qText && qText.textContent.trim()) speakQuestion.speak(qText.textContent.trim(), btn);
    }

    // 进度点：9/15 之之要求删除（圆点 + n/n 徽章不再渲染）

    // 步进按钮状态（9/24：最后一小题把「下一题」换成 完成 / 下一大题，其余小题不出现这两个按钮）
    var prev = nav.querySelector('.sp-flow-prev');
    var next = nav.querySelector('.sp-flow-next');
    var cnt = nav.querySelector('.sp-flow-count');
    var finBtn = nav.querySelector('#p1FinishBtn');
    var topicBtn = nav.querySelector('#p1NextTopicBtn');
    var isLast = (cur === n - 1);
    if(cnt) cnt.textContent = '第 ' + (cur + 1) + ' / ' + n + ' 题';
    prev.disabled = (cur === 0);
    next.hidden = isLast;
    if(finBtn) finBtn.hidden = !isLast;
    if(topicBtn) topicBtn.hidden = !isLast;

    // 已完成小结：10/2（她拍板）整块永久下线——「从来没点开看过」
    done.hidden = true;

    // 切题后滚回题卡顶部
    var top = list.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  nav.querySelector('.sp-flow-prev').addEventListener('click', function(){ if(cur > 0){ cur--; render(); } });
  // 9/24：最后一小题时「下一题」已隐藏（让位给 完成/下一大题），这里只负责前进
  nav.querySelector('.sp-flow-next').addEventListener('click', function(){
    if(cur < n - 1){ cur++; render(); }
  });

  render();
}
