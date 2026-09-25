/* === 口语题库（极简版） · v20260923g（design/87：P2 串题要点驱动重构） === */
var curType = 'ALL';   // 题库 tab 合并 P1+P2（'ALL'）；P1/P2 仅保留为数据类型
var curFreq = 'all';
var curCat = 'all';
var curPart = 'all';
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

/* 顶部常量用 var（speaking.js 会被软导航 window.eval 重跑，const 会抛「已声明」） */
var SYS_DIAG = `你是一位雅思口语考官助手。你的任务有两件：
1）找出回答里真正的「语法错误」和「用词错误」，并给出正确写法；
2）按 IELTS 官方口语评分标准，给「语法范围与准确性」和「词汇资源」两个维度打分。

【重要：只评这两项】
流利度与连贯、发音 必须听音频才能评。你只看到文本，所以这两项一律不评、不给分、不要猜、不要在 JSON 里输出。

【评分方法：正向匹配，不是扣分制】
雅思官方是"看答案达到哪一档的描述就给哪一档"，不是"数错误往下扣"。这是最容易搞错的地方：
- 有语法错误不等于低分。6 分的官方描述明确允许"复杂结构会出错"，只要整体意思清楚就是 6。
- 只有"错误造成理解困难"才降到 5；"几乎只用简单句且基本用错"才是 4。
- 用简单句把意思说清楚 = 6 分，不是 5 分。不许因为句型简单、表达不够高级、不够地道而扣分。
- 零错误但全篇简单句 = 语法 6（7 分要求"灵活使用多种复杂结构"）。

【Grammatical Range & Accuracy 档位】
7：灵活使用多种复杂结构，多数句子无错，个别错误不影响理解
6：简单句与复杂句混用；复杂句比简单句更容易出错，但整体意思清楚
5：以简单句为主，偶尔尝试复杂句但常出错，错误有时造成理解困难
4：几乎只用简单句，复杂句罕见且基本用错

【Lexical Resource 档位】
7：词汇有范围和多样性，能换词说，偶有搭配不当
6：词汇量够讨论熟悉话题，会尝试换词说但不总成功，错误不影响理解
5：词汇量有限、重复较多，换词尝试常失败，偶尔造成理解困难
4：只会用基本词，话题相关词匮乏，重复严重

【校准锚点 - 你的打分必须对齐这几个例子】
例A "I think it is good because it help me relax. I usually do it on weekend."（2 处小语法错，意思完全清楚）→ grammar 6, vocabulary 6
例B "I very like read books. It make me happy. I read books every day."（词性误用、重复严重，但意思能懂）→ grammar 5, vocabulary 5
例C "Although the internet has brought unprecedented convenience to our daily routines, there is a growing concern that excessive reliance on it may undermine our capacity for deep concentration."（复杂结构准确、词汇多样）→ grammar 7, vocabulary 7
例D "I like reading books. I read books every day. It makes me happy."（全简单句、零错误、意思清楚、用词重复）→ grammar 6, vocabulary 5

【半档判定规则（官方口径，必须遵守）】
雅思半档（x.5）的官方定义：**完全达到 x 档的全部描述，并且部分达到 x+1 档的描述 → 给 x.5**。
- 稳定符合 5 档、且部分表现够到 6 档（如复杂句尝试有一定成功率、错误基本不影响理解）→ 5.5
- 稳定符合 6 档、且部分表现够到 7 档（如频繁出现无错句、能较灵活换词）→ 6.5
- 表现介于两档之间时**必须用半档表达，禁止四舍五入成整数**。

【半档校准锚点 - 与上面锚点同等效力】
例E（5.5）"I very like play badminton because it make me healthy and I can made some friends who also very like sport."（词性/时态错误频繁但意思能懂；有连接尝试；词汇重复但能小幅换述）→ grammar 5.5, vocabulary 5.5
例F（6.5）"Although many people believe that reading is boring, but for me it is a way to reduce stress. When I was young, my father gave me a book which changed my mind, and since then I have read almost every day."（多数句子无错、复杂结构用得起来，偶有 believe...but 连用等小错）→ grammar 6.5, vocabulary 6.5

【100% 不算错误、也不扣分】
- 大小写（句首小写、And/But/So 大写等）
- 标点符号（缺逗号句号、逗号变句号等语音转写瑕疵）
- 口语填充词（well, you know, like, actually）
- 自然口语省略（如 "Think it's good" 在口语中可接受）
- 简单句本身（用简单句不是错）
- 发音/口音相关问题

【输出格式 - 严格 JSON，不要 markdown 代码块，不要任何解释文字】
{
  "errors": [
    {
      "original": "错误原文片段",
      "corrected": "正确写法",
      "type": "grammar 或 vocabulary",
      "explanation": "中文一句话说明为什么错、怎么改"
    }
  ],
  "improved": "整体改写成一个更通顺、更地道的版本",
  "score": {
    "grammar": 6,
    "grammar_basis": "一句话说明为什么是这个档：引用上面某条档位描述 + 具体证据（如「3 处时态错误但整体意思清楚」）",
    "vocabulary": 6,
    "vocabulary_basis": "同上"
  }
}
没有错误时 errors 返回 []。分数必须是 4~8 之间、以 0.5 为最小步长的数字（合法值仅限：4 / 4.5 / 5 / 5.5 / 6 / 6.5 / 7 / 7.5 / 8）；表现介于两档之间时必须给半档，禁止只输出整数。

【错误条目一致性铁律】grammar_basis / 评语里点名的每一处问题（时态、缺 be 动词、搭配、副词顺序等），必须在 errors 数组里有对应条目：只要评语说了存在语法/用词问题，errors 就绝不允许是空数组——宁可多给一条，也严禁「说有问题却不给条目」。original 必须逐字引用考生原文里的出错片段（前端要靠它在原句中定位标出），corrected 给出具体改法。

【improved 要求】把考生回答整体改写成一个更通顺、更地道的版本（保留原意与口语风格，长度与原文相近，只优化表达，不添加新内容；纯符号 "/" 表示对应处直接删除）。
【注意】corrected 里若某处只是删除（无替换词），用 "/" 表示；不要用省略号或其他写法。
【最小片段铁律】original 和 corrected 只写「真正出错的那个词/短语」本身，前后没错的词一律不要带进来（例：错在 is → original 写 "is"，corrected 写 "has been"；绝不要把没错的 "artificial intelligence" 等上下文复述进 corrected）。

【示例】
输入: "We are got a big mirror. I leave in my house every day."
输出: {"errors":[{"original":"We are got","corrected":"We have got / We've got","type":"grammar","explanation":"没有 are got 结构，拥有用 have got"},{"original":"leave in my house","corrected":"leave my house","type":"grammar","explanation":"leave 是及物动词，不需要介词 in"}],"improved":"We've got a big mirror. I leave my house every day.","score":{"grammar":6,"grammar_basis":"简单句与复杂句混用，两处搭配错误但意思清楚，符合 6 分档","vocabulary":6,"vocabulary_basis":"用词够表达熟悉话题，无生造词"}}`;

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

// P2 专用诊断提示词（语法纠错 + 串题素材连接；复用 SYS_DIAG 通用规则，追加 P2 专属要求）
var SYS_DIAG_P2 = SYS_DIAG
  + `

【Part 2 要求】考生做约 2 分钟连续陈述，允许更多从句和连接词。评分仍只给 grammar / vocabulary 两项（流利度/发音需音频，不评）。

`
  + `【串题素材连接(storyLink)】考生会提供已准备的万能素材（见用户消息末尾）。若本题可套用其中某个素材，请在 JSON 末尾额外返回 "storyLink" 字段（中文，2-4 行，说明可怎么把素材嵌入本题回答）。无合适素材则不返回该字段。

`
  + `【输出格式补充】上述 JSON 的 "errors" 数组外，可额外包含可选字段："storyLink": "可套用的万能素材连接建议（中文；无合适素材则省略）"。`;

/* 激活指定 tab（只切高亮，不切视图——视图由调用方控制） */
function spActivateTab(type){
  $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x.dataset.type === type));
}

/* 季度 banner 数据化渲染（design/81）：season/region/updated/note 取自 SPEAKING_BANK_META，
   P1/P2 题数从 DATA.speaking 现算（与列表同口径：剔 framework/旧母本）。
   在 ready() 里调用——此时 hubLoad 的 mergeSpeakingKeepAnswers 已跑完，题数准确。 */
function renderFreqBanner(){
  const el = document.getElementById('freqBanner');
  if(!el) return;
  const M = (typeof SPEAKING_BANK_META !== 'undefined') ? SPEAKING_BANK_META : {};
  const bank = (DATA.speaking || []).filter(s => s && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
  const c1 = bank.filter(s => s.type === 'P1').length;
  const c2 = bank.filter(s => s.type === 'P2').length;
  el.innerHTML = '<b>本季口语题库 ' + escapeHtml(M.season || '') + (M.region ? ' · ' + escapeHtml(M.region) : '') + '版'
    + (M.updated ? ' · ' + escapeHtml(M.updated) + ' 更新</b>' : '</b>')
    + '：<b>' + (c1 + c2) + ' 题：Part 1 共 ' + c1 + ' · Part 2 共 ' + c2 + '</b>' + (M.note ? '。' + escapeHtml(M.note) : '');
}

/* 题库「随机来一道」（design/81）：与 renderList 完全相同的过滤口径，随机开一道详情。
   复用 openDetail = 与点卡片完全同路径（回填/TTS/事件绑定同源渲染）。 */
function spRandomPick(){
  const list = getFiltered();
  if(!list.length){ toast('当前筛选下没有题目'); return; }
  const pick = list[Math.floor(Math.random() * list.length)];
  if(pick && pick.id) openDetail(pick.id);
}

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      spActivateTab(t);
      // 9/13 修：句型拼接验证弹窗挂在 body 上、z-index 999，切 tab 不会跟着消失 → 先关掉（不写 replay 标记，下次练满还会弹）
      if(typeof sentReplayClose === 'function') sentReplayClose();
      // 9/26：切 tab 一律解除模考沉浸（否则侧栏/tab 被藏、页面只剩模考内容）
      try{ document.body.classList.remove('mock-immerse'); }catch(e){}
      $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true; $('#pdView').hidden = true; $('#sentView').hidden = true;
      if(t === 'PRACTICE'){
        // design/16 P0：句型页（sentence-drill.js）接管「练习」tab；场景闯关/pdLegacy 退场（开关可回滚）
        if(window.__SENT_V2_ON){
          $('#pdView').hidden = true;
          $('#sentView').hidden = false;
        } else {
          // 句型闯关引擎（pattern-drill.js）已在 ready 时启动；切回只显隐，不重建队列
          $('#pdView').hidden = false;
        }
      } else if(t === 'BANK'){
        curType = 'ALL';
        populateFreqOptions();
        const cs = $('#catSelect'); if(cs) cs.value = 'all';
        curCat = 'all';
        const ps = $('#partSelect'); if(ps) ps.value = 'all';
        curPart = 'all';
        /* 9/19 修：切回题库时搜索框与 curSearch 一并清空。
           原先只重置三个下拉、搜索词却留着 → 列表仍被旧关键词过滤（如只剩 3 条），
           而下拉显示「全部」，用户会误以为题库只剩这几题。语义统一为「切回题库=回到全量」。 */
        const ss = $('#spSearch'); if(ss) ss.value = '';
        curSearch = '';
        $('#listView').hidden = false;
        renderList();
      } else if(t === 'MOCK'){
        $('#mockView').hidden = false;
      } else if(t === 'MAT'){
        $('#matView').hidden = false;
        if(typeof matGen !== 'undefined' && matGen.init) matGen.init();
      } else {
        curType = t;
        populateFreqOptions();
        const cs = $('#catSelect'); if(cs) cs.value = 'all';
        curCat = 'all';
        const ps = $('#partSelect'); if(ps) ps.value = 'all';
        curPart = 'all';
        $('#listView').hidden = false;
        renderList();
      }
    });
  });
  const freqSel = $('#freqSelect'), catSel = $('#catSelect'), partSel = $('#partSelect');
  if(freqSel) freqSel.addEventListener('change', e => { curFreq = e.target.value; renderList(); });
  if(catSel) catSel.addEventListener('change', e => { curCat = e.target.value; renderList(); });
  if(partSel) partSel.addEventListener('change', e => { curPart = e.target.value; renderList(); });
  populateFreqOptions();
  // 9/15：Part 下拉选项带各 Part 题数（之之要求 P1/P2 分开计数，一眼看清各有多少题）
  (function(){
    const bank = (DATA.speaking || []).filter(s => !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
    const c1 = bank.filter(s => s.type === 'P1').length, c2 = bank.filter(s => s.type === 'P2').length;
    const o1 = partSel && partSel.querySelector('option[value="P1"]'), o2 = partSel && partSel.querySelector('option[value="P2"]');
    if(o1) o1.textContent = 'Part 1（' + c1 + ' 题）';
    if(o2) o2.textContent = 'Part 2（' + c2 + ' 题）';
  })();
  $('#spSearch').addEventListener('input', () => { curSearch = $('#spSearch').value.trim().toLowerCase(); renderList(); });
  const rndBtn = document.getElementById('spRandomBtn');
  if(rndBtn) rndBtn.addEventListener('click', () => spRandomPick());
  renderFreqBanner();   // design/81：季度 banner 数据化（此时题库合并已完成，题数现算）
  $('#backBtn').addEventListener('click', () => { $('#detailView').hidden = true; $('#listView').hidden = false; $('#sentView').hidden = true; $('#pdView').hidden = true; curDetailId = null; spActivateTab('BANK'); });
  // 默认 tab = 练习：__SENT_V2_ON 时为句型页（sentence-drill.js 接管），否则老 pdView
  $('#listView').hidden = true;
  if(window.__SENT_V2_ON){
    $('#pdView').hidden = true;
    $('#sentView').hidden = false;
  } else {
    $('#pdView').hidden = false;
  }
  // P1：?open=<题id> 直达详情（素材页覆盖矩阵点题跳转用）——跳详情时落到题库 tab
  try{
    const openId = new URLSearchParams(location.search).get('open');
    if(openId && (DATA.speaking || []).some(x => x && x.id === openId)){
      spActivateTab('BANK');
      $('#pdView').hidden = true;
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
    if(new URLSearchParams(location.search).get('senttab')){
      spActivateTab('PRACTICE');
      if(window.__SENT_V2_ON){ $('#sentView').hidden = false; $('#pdView').hidden = true; }
    }
  }catch(_){}
});

// 优先级下拉选项（P1/P2 共用）：超高频>高频>中频>低频
function populateFreqOptions(){
  const sel = $('#freqSelect');
  if(!sel) return;
  const opts = [['all','全部'],['ultra','超高频'],['high','高频'],['medium','中频'],['low','低频']];
  sel.innerHTML = opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('');
  curFreq = 'all';
}

function getFiltered(){
  // 仅展示纯题目：剔除框架母本（带 framework 字段 / id 形如 sp_p[12]_*）；curType='ALL' 为题库 tab（P1+P2 合并）
  let list = DATA.speaking.filter(s => (curType === 'ALL' || s.type === curType) && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
  if(curFreq !== 'all') list = list.filter(s => s.frequency === curFreq);
  if(curCat !== 'all') list = list.filter(s => s.category === curCat);
  if(curPart !== 'all') list = list.filter(s => s.type === curPart);
  if(curSearch){
    list = list.filter(s => {
      const t = ((s.titleEn || '') + ' ' + (s.titleZh || '') + ' ' + (s.title || '') + ' ' + (s.promptEn || '') + ' ' + (s.promptZh || '') + ' ' + (s.questions || []).join(' ')).toLowerCase();
      return t.includes(curSearch);
    });
  }
  // 按档位排序（P1/P2 档位顺序不同）
  list.sort((a, b) => freqRank(a.frequency) - freqRank(b.frequency));
  return list;
}

function freqTag(freq){
  const label = (typeof FREQ_LABEL !== 'undefined' && FREQ_LABEL[freq]) || freq;
  return '<span class="sp-tag freq-' + freq + '">' + label + '</span>';
}

function tagsHtml(s){
  let html = '';
  if(curType === 'ALL' && s.type) html += '<span class="sp-tag">' + (s.type === 'P1' ? 'Part 1' : 'Part 2') + '</span>';
  if(s.frequency) html += freqTag(s.frequency);
  if(s.category) html += '<span class="sp-tag">' + escapeHtml(s.category) + '</span>';
  if(s.framework) html += '<span class="sp-tag">' + escapeHtml(s.framework) + '</span>';
  return html;
}

// === 口语分数解析与展示 ===
/* 分数解析（9/20 design/76 重写 + 之之 9/20 拍板恢复发音/流利度自填固定分）：
   · grammar / vocabulary 由 AI 按 IELTS 官方 band descriptor 正向锚定评出（文本唯一能评准的两维）
   · 流利度、发音需音频，AI 一律不评不猜；取设置里用户自填的固定分（0–9），没填/非法值 → null（不计入）
   · overall = 已评维度的均分，四舍五入到 0.5；四项全填时最接近雅思四项口径 */
function parseScore(score){
  if(!score) return null;
  const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  const grammar = n(score.grammar);
  const vocabulary = n(score.vocabulary);
  // 自填固定分：用户在「设置 / 口语模考」里填；没填就不参与，绝不猜（0 是合法值，禁用 ||null 吞 0）
  const sset = DATA.settings || {};
  const pronunciation = (sset.pronunciationScore != null) ? n(sset.pronunciationScore) : null;
  const fluency = (sset.fluencyScore != null) ? n(sset.fluencyScore) : null;
  const dims = [grammar, vocabulary].filter(v => v != null);
  if(fluency != null) dims.push(fluency);
  if(pronunciation != null) dims.push(pronunciation);
  // 9/20 拍板：至少两个维度才有 overall（单维度均分没有意义，不给总分）
  const overall = (dims.length >= 2) ? Math.round(dims.reduce((a, b) => a + b, 0) / dims.length * 2) / 2 : null;
  // 评分依据随分数一起落库：分数必须能自证，否则又变成"莫名其妙的低分"
  const basis = {
    grammar: (score.grammar_basis != null) ? String(score.grammar_basis) : '',
    vocabulary: (score.vocabulary_basis != null) ? String(score.vocabulary_basis) : ''
  };
  return { overall, fluency, pronunciation, vocabulary, grammar, basis };
}
/* 总分口径文案（UI 必须显示，绝不能被当成雅思总分）：按实际参与计算的维度动态生成 */
function scoreScopeTip(){
  const sset = (DATA && DATA.settings) || {};
  const parts = ['语法', '词汇'];
  if(sset.fluencyScore != null) parts.push('流利度(自填)');
  if(sset.pronunciationScore != null) parts.push('发音(自填)');
  return parts.join(' + ') + ' 的均分；未填的自填项不计入（可在设置里补）';
}
// 某小题的历史最高分：遍历每次诊断/提交记录取最高（用户规则：同一题反复刷分取最高值）；
// 老数据没有 records 时回退到当前 score 字段
/* 只认 9/20 新口径的分数：新分数一定带 basis（评分依据）。
   旧口径分数是「扣分制 + 拍脑袋兜底」打出来的，偏低且口径不同，一律不参与聚合，
   避免历史低分重新冒出来打击信心。 */
function isNewScore(sc){
  return !!(sc && sc.overall != null && sc.basis);
}
function bestOfQuestion(a){
  if(!a) return null;
  let best = null;
  (a.records || []).forEach(r => {
    if(r && isNewScore(r.score)){
      const v = parseFloat(r.score.overall);
      if(!isNaN(v) && (best === null || v > best)) best = v;
    }
  });
  if(best === null && isNewScore(a.score)){
    const v = parseFloat(a.score.overall);
    if(!isNaN(v)) best = v;
  }
  return best;
}
function getBestScore(s){
  if(!s || !s.answers) return null;
  let best = null;
  Object.values(s.answers).forEach(a => {
    const v = bestOfQuestion(a);
    if(v != null && (best === null || v > best)) best = v;
  });
  return best;
}
/* === 练习次数统计 ===
   没有新口径分数时（旧数据 / 从未评分），列表显示「练过几次」而不是空白。
   P1 的各小题只要有任一题有 records，就算「练过 1 次」，并显示已完成小题数。
   P2 直接按该题的 records 数量显示练过次数。 */
function countOfQuestion(a){
  if(!a) return 0;
  if(Array.isArray(a.records) && a.records.length) return a.records.length;
  // 老数据：有 score 没 records 的，算练过 1 次
  if(a.score && a.score.overall != null) return 1;
  return 0;
}
function getP1Done(s){
  if(!s || !s.answers) return 0;
  return Object.keys(s.answers).filter(k => k !== 'p2' && countOfQuestion(s.answers[k]) > 0).length;
}
function getScoreCount(s){
  if(!s || !s.answers) return 0;
  return Object.values(s.answers).filter(a => countOfQuestion(a) > 0).length;
}
function getPracticeCount(s){
  if(!s || !s.answers) return 0;
  if(s.type === 'P1') return getP1Done(s) > 0 ? 1 : 0;
  return countOfQuestion(s.answers.p2);
}
/* 聚合分（9/20 评分恢复）：
   P1 = 各已练小题「历史最高分」的平均；P2 = 该题历史最高分。
   只统计新口径分数（isNewScore），旧口径一律不计 —— 无新分数时返回 null，
   列表继续显示「练过N次」。 */
function getAggScore(s){
  if(!s || !s.answers) return null;
  if(s.type === 'P1'){
    const vals = Object.keys(s.answers)
      .filter(k => k !== 'p2')
      .map(k => bestOfQuestion(s.answers[k]))
      .filter(v => v != null);
    if(!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 2) / 2;
  }
  return bestOfQuestion(s.answers.p2);
}
function scoreLabel(v){ return v == null ? '-' : (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1); }
function scoreBadgeHtml(score, count, s){
  // 没有新口径分数（旧数据 / 从未评分 / AI 未返回分数）→ 显示练过次数，不显示分数
  if(score == null){
    if(!count) return '';
    if(s && s.type === 'P1'){
      // 9/16：小题总数按该题 questions 实际长度算（题库里 P1 小问 4~10 个不等，
      // 原来硬写 4，work/hometown/area 这类 10 小题的话题会显示成「7/4 小题」）
      const total = (s.questions || []).length || 4;
      const done = getP1Done(s);
      const label = done >= total ? '练过1次' : '练过1次（' + done + '/' + total + ' 小题）';
      return '<span class="sp-score-badge practice">' + label + '</span>';
    }
    const label = count > 1 ? '练过' + count + '次' : '练过1次';
    return '<span class="sp-score-badge practice">' + label + '</span>';
  }
  const cls = score >= 5.5 ? 'sp-score-badge good' : (score >= 5 ? 'sp-score-badge ok' : 'sp-score-badge low');
  // 分数不是雅思总分（流利度始终需录音）—— tooltip 里说清当前口径，避免误读
  const tip = scoreScopeTip();
  let label;
  if(s && s.type === 'P1'){
    const done = getP1Done(s);
    // 9/18：小题总数按 questions 实际长度算（硬写 4 会让 10 小题的 work/hometown 显示成「7/4 小题」）
    const total = (s.questions || []).length || 4;
    label = '平均 ' + scoreLabel(score) + '分 · 练过1次' + (done < total ? '（' + done + '/' + total + ' 小题）' : '');
  } else {
    const times = count > 1 ? ' · 练过' + count + '次' : '';
    label = '最高 ' + scoreLabel(score) + '分' + times;
  }
  return '<span class="' + cls + '" title="' + tip + '">' + label + '</span>';
}
function scoreHeaderHtml(score, title){
  if(!score || score.overall == null) return '';
  // 维度按雅思官方顺序：流利度与连贯 → 词汇 → 语法 → 发音；自填项没填就不显示（不再摆一个「-」）
  const dims = [
    {k:'vocabulary',l:'词汇'},
    {k:'grammar',l:'语法'}
  ];
  if(score.fluency != null) dims.unshift({k:'fluency',l:'流利度(自填)'});
  if(score.pronunciation != null) dims.push({k:'pronunciation',l:'发音(自填)'});
  let h = '<div class="sp-score-header">';
  h += '<div class="sp-score-total"><span class="sp-score-num">' + scoreLabel(score.overall) + '</span><span class="sp-score-label">' + (title || '总分') + '</span></div>';
  h += '<div class="sp-score-dims">';
  dims.forEach(d => {
    const v = score[d.k];
    h += '<div class="sp-score-dim"><span class="sp-score-dim-val">' + scoreLabel(v) + '</span><span class="sp-score-dim-lab">' + d.l + '</span></div>';
  });
  h += '</div></div>';
  return h;
}

function renderList(){
  const list = getFiltered();
  const container = $('#spList');
  if(list.length === 0){
    container.innerHTML = '';
    $('#spEmpty').hidden = false;
    return;
  }
  $('#spEmpty').hidden = true;
  container.innerHTML = list.map(s => {
    const title = s.titleEn || s.title || '';
    const zh = s.titleZh || '';
    const best = getAggScore(s);
    const count = getPracticeCount(s);
    return '<div class="sp-card" data-id="' + s.id + '">'
      + '<div class="sp-card-title">' + escapeHtml(title) + scoreBadgeHtml(best, count, s) + '</div>'
      + (zh ? '<div class="sp-card-zh">' + escapeHtml(zh) + '</div>' : '')
      + '<div class="sp-card-tags">' + tagsHtml(s) + '</div>'
      + '</div>';
  }).join('');
  container.querySelectorAll('[data-id]').forEach(c => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
  });
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

function openDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  __clearP2Timer();   // 修(f)：切话题/重进详情页先停掉上一题残留的 2 分钟倒计时
  curDetailId = id;
  $('#listView').hidden = true;
  $('#detailView').hidden = false;

  const title = s.titleEn || s.title || '';
  const zh = s.titleZh || '';
  // design/57 话题块：kicker + 标题/中文居左，标签同行右端（≤600px 折行）；best 降为 muted 小字置块底
  let html = '<div class="sp-topic-block">'
    + '<div class="sp-topic-row">'
    + '<div class="sp-topic-main">'
    + '<div class="sp-topic-kicker">SPEAKING · ' + (s.type === 'P1' ? 'PART 1' : 'PART 2') + '</div>'
    + '<div class="sp-detail-title">' + escapeHtml(title) + '</div>'
    + (zh ? '<div class="sp-detail-zh">' + escapeHtml(zh) + '</div>' : '')
    + '</div>'
    + '<div class="sp-detail-tags">' + tagsHtml(s) + '</div>'
    + '</div>';
  const bestScore = getAggScore(s);
  // 标注口径：按实际参与的维度动态生成 —— 避免被当成雅思总分
  if(bestScore != null){
    const sset = DATA.settings || {};
    const labs = ['语法+词汇'];
    if(sset.fluencyScore != null) labs.push('流利度');
    if(sset.pronunciationScore != null) labs.push('发音');
    html += '<div class="sp-detail-best" title="' + escapeHtml(scoreScopeTip()) + '">' + (s.type === 'P1' ? 'P1 平均分' : '历史最高') + '：' + scoreLabel(bestScore) + '分（' + labs.join('+') + '）</div>';
  }
  html += '</div>';

  // P1 问题列表（逐题可点开 + 录 + 诊断）；9/15 之之：删「Part 1 小问题…」说明行
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i, s); });
    html += '</ol>';
  }

  // P2 单窗口答题（不分小问题，一次性作答 2 分钟）
  if(s.type === 'P2'){
    // P2 提示卡：题目 + You should say: 子提示统一合并到同一个 sp-prompt 白底黑字块（与官方题卡一致）
    if(s.promptEn) html += '<div class="sp-prompt">题目：' + escapeHtml(s.promptEn);
    if(s.youShouldSay && s.youShouldSay.length){
      html += '<div class="sp-ysay-list"><b>You should say:</b>'
        + s.youShouldSay.map(b => '<div>· ' + escapeHtml(b) + '</div>').join('')
        + '</div>';
    }
    if(s.promptEn) html += '</div>';
    if(s.promptZh) html += '<div class="sp-detail-zh" style="margin-bottom:12px">' + escapeHtml(s.promptZh) + '</div>';

    html += '<div class="sp-p2-answer">';
    // design/17 3.3：一句话备注（存 answers.p2.note，防抖 600ms 云同步）
    html += '<input class="pd-input sp-note-input" id="p2Note" placeholder="一句话备注（提醒自己怎么答）" autocomplete="off">';
    html += '<textarea class="sp-ans" id="p2Ans" placeholder="在这里写下你的 Part 2 回答（目标写满 2 分钟的内容）…"></textarea>';
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 2l2.4 5.1 5.6.8-4 4.1 1 5.6-5-2.7-5 2.7 1-5.6-4-4.1 5.6-.8z"/></svg>AI 纠错</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '<button class="sp-timer-btn" id="p2TimerBtn" type="button" title="开始 2 分钟倒计时，逼自己讲满 2 分钟">⏱ 2分钟</button>';
    html += '<span class="sp-timer-display" id="p2TimerDisplay" hidden>02:00</span>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '<div class="sp-rec-list" id="p2Records"></div>';
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
    html += '<div class="sp-tools-wrap" id="p2ToolsWrap">';
    html += '<div class="sp-tools-title">🧰 更多工具（串题思路 · P3 追问 · 句型参考）</div>';
    // 分组 A「AI 串题思路」：按钮留在 summary 上，收起时也能直接点；id 一律不变只挪位置
    html += '<details class="sp-tool-group" id="p2ToolA"' + (storyHas ? ' open' : '') + '>';
    html += '<summary class="sp-tool-summary"><span class="sp-tool-caret">▶</span><span class="sp-tool-name">AI 串题思路</span><span class="sp-tool-act"><button class="btn btn-med" id="aiStoryLinkBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>' + linkLabel + '</button></span></summary>';
    html += '<div class="sp-tool-body">';
    html += '<div class="sp-story-head"><span class="sp-story-title">串题素材（逻辑 + 原文）</span></div>';
    html += '<div class="sp-ai-result" id="aiResult"></div>';
    html += '</div>';
    html += '</details>';
    // 分组 B「P3 深度追问」：生成按钮在 summary，#p3Area 在折叠体内
    html += '<details class="sp-tool-group" id="p2ToolB"' + (p3Has ? ' open' : '') + '>';
    html += '<summary class="sp-tool-summary"><span class="sp-tool-caret">▶</span><span class="sp-tool-name">P3 深度追问</span><span class="sp-tool-act"><button class="btn btn-med" id="p3GenBtn" type="button">P3追问</button></span></summary>';
    html += '<div class="sp-tool-body">';
    html += '<div class="sp-p3-area" id="p3Area" data-p3-state="idle" hidden>';
    html += '<div class="sp-p3-head">P3 提问</div>';
    html += '<div class="sp-p3-list" id="p3List"></div>';
    html += '<div class="sp-p3-next" id="p3NextWrap" hidden><button class="btn btn-med" id="p3NextBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>下一道追问</button></div>';
    html += '<div class="sp-p3-save" id="p3SaveWrap" hidden><button class="btn btn-primary" id="p3SaveBtn" type="button">保存 P3 答案</button></div>';
    html += '</div>';
    html += '</div>';
    html += '</details>';
    // 分组 C「句型参考」：design/17 3.3 只读面板整体挪入，永远默认收起
    html += '<details class="sp-tool-group" id="p2ToolC">';
    html += '<summary class="sp-tool-summary"><span class="sp-tool-caret">▶</span><span class="sp-tool-name">句型参考</span><span class="sp-tool-act"><button class="sp-diag" id="p2SentRefBtn" type="button">查句型</button></span></summary>';
    html += '<div class="sp-tool-body"><div class="sp-sentref" id="spSentRef" hidden></div></div>';
    html += '</details>';
    html += '</div>';

    // 动作行：P3追问已收进折叠分组 B（design/82），此处只留 完成/下一大题（右对齐自然收窄）
    html += '<div class="sp-action-row" id="p2ActionRow">';
    html += '<div class="sp-action-row-right">';
    html += '<button class="btn btn-med" id="p2FinishBtn" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn" type="button">下一大题 →</button>';
    html += '</div>';
    html += '</div>';

    // 底部动作栏：下一大题/完成（P3 展示完后出现在最底）
    html += '<div class="sp-bottom-bar" id="p2BottomBar" hidden>';
    html += '<button class="btn btn-med" id="p2FinishBtn2" type="button">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn2" type="button">下一大题 →</button>';
    html += '</div>';
  }

  // 底部动作区：9/15 之之 — P1 删除「保存/删除此题/下一个话题」三按钮（草稿自动落库，无需保存）；
  // P2 的动作已合并到上方 AI 串题思路同一行，此处仅 P2 占位
  html += '<div class="sp-detail-actions">';
  html += '</div>';

  $('#detailBody').innerHTML = html;
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
    // design/82：折叠区交互控制（只管展开/收起，不碰业务逻辑函数体）
    const toolA = document.getElementById('p2ToolA');
    const toolB = document.getElementById('p2ToolB');
    const toolC = document.getElementById('p2ToolC');
    // summary/分组内的按钮点击不得触发 details 折叠（preventDefault 取消 summary 默认 toggle；
    // 委托到分组容器上，动态插入的「取消」按钮同样覆盖）
    [toolA, toolB, toolC].forEach(g => {
      if(g) g.addEventListener('click', e => {
        if(e.target && e.target.closest && e.target.closest('button')) e.preventDefault();
      });
    });
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => {
      if(toolA) toolA.open = true;   // design/82：发起前先展开分组 A
      aiStoryLink(id);
    });
    // 结果区渲染出内容（成功稿 / 无 Key 引导 / 无素材引导 / 失败提示）且分组还收着 → 自动展开并滚到可见
    const aiRes = document.getElementById('aiResult');
    if(toolA && aiRes){
      new MutationObserver(() => {
        if(!aiRes.childNodes.length) return;
        if(!toolA.open){ toolA.open = true; aiRes.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
      }).observe(aiRes, { childList: true });
    }
    // 新 P3 题 / P3 引导卡渲染进 #p3List 且分组还收着 → 自动展开分组 B 并滚到 P3 区
    const p3AreaEl = document.getElementById('p3Area');
    const p3ListEl = document.getElementById('p3List');
    if(toolB && p3AreaEl && p3ListEl){
      new MutationObserver(() => {
        if(!p3ListEl.childNodes.length) return;
        if(!toolB.open){ toolB.open = true; p3AreaEl.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
      }).observe(p3ListEl, { childList: true });
    }
    // design/17 3.3：备注框防抖保存（600ms → hubSave）+ 查句型面板开关
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
    const srb = document.getElementById('p2SentRefBtn');
    if(srb) srb.addEventListener('click', e => {
      e.stopPropagation();
      if(toolC) toolC.open = true;   // design/82：点查句型先展开分组 C，面板显示逻辑不变
      spSentRefToggle();
    });
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
    if(p2AnsEl) p2AnsEl.addEventListener('input', () => spDraftSave(id, 'p2', p2AnsEl.value));
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
      // 已生成过题：「P3追问」按钮变为「重新生成 P3」，提示可重出
      const genBtn = $('#p3GenBtn');
      if(genBtn && area && area.dataset.p3State === 'generated'){
        genBtn.textContent = '重新生成 P3';
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
      if(!DATA.settings.relayToken){
        // design/81：无 Key 给引导卡（替代纯 toast）
        const area0 = $('#p3Area'); if(area0) area0.hidden = false;
        const list0 = $('#p3List');
        if(list0){
          list0.innerHTML = spGuideCardHtml('AI 追问需要 DeepSeek Key',
            'P3 追问题由 AI 根据你的 P2 回答生成，只需在设置里填你自己的 DeepSeek Key。',
            spKeyGuideBtn());
        }
        toast('请先在「设置」配置 DeepSeek Key');
        return;
      }
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
      }
      // 回填已生成的 P3 追问列表 + 答案
      if(s.answers.p2.p3 && Array.isArray(s.answers.p2.p3.questions) && s.answers.p2.p3.questions.length){
        renderP3All(s, $('#p3List'));
        updateP3NextBtn();
        const saveWrap = $('#p3SaveWrap');
        if(saveWrap) saveWrap.hidden = false;
        const area = $('#p3Area');
        if(area){ area.hidden = false; area.dataset.p3State = 'generated'; }
        const genBtn = $('#p3GenBtn');
        if(genBtn) genBtn.textContent = '重新生成 P3';
        const bottom = $('#p2BottomBar');
        if(bottom) bottom.hidden = false;
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

/* === design/17 3.3：P2 卡「查句型」只读面板 + 「去练该类」跳转 ===
   数据优先取 window.__sentBankCache（sentence-drill.js 排在 speaking.js 之前已缓存）；
   为空则自行 fetch（try/catch 失败 toast 不崩）。面板只读：7 类名 + cn→right 清单 + 去练入口。 */
async function spSentRefToggle(){
  const panel = document.getElementById('spSentRef');
  if(!panel) return;
  if(!panel.hidden){ panel.hidden = true; return; }
  panel.hidden = false;
  if(panel.dataset.loaded === '1') return;
  panel.innerHTML = '<div class="sp-sentref-loading">句型库加载中…</div>';
  let bank = window.__sentBankCache;
  if(!bank || !bank.cats || !bank.cats.length){
    try{
      const r = await fetch('data/sentences.json?v=20260912b');
      bank = await r.json();
      if(bank && bank.cats) window.__sentBankCache = bank;    // 回填全局缓存
    }catch(e){
      panel.innerHTML = '<div class="sp-sentref-loading">句型库加载失败，稍后再试</div>';
      toast('句型库加载失败');
      return;
    }
  }
  if(!bank || !bank.cats || !bank.cats.length){
    panel.innerHTML = '<div class="sp-sentref-loading">句型库为空</div>';
    return;
  }
  let h = '';
  bank.cats.forEach(cat => {
    h += '<div class="sp-sentref-cat"><div class="sp-sentref-catname">' + escapeHtml(cat.name) + '</div>';
    cat.sentences.forEach(s => {
      h += '<div class="sp-sentref-row"><div class="sp-sentref-cn">' + escapeHtml(s.cn) + '</div>'
        + '<div class="sp-sentref-en">' + escapeHtml(s.right) + '</div></div>';
    });
    h += '<div class="sp-sentref-go" data-sentref-go="' + escapeHtml(cat.id) + '">去练该类 →</div></div>';
  });
  panel.innerHTML = h;
  panel.dataset.loaded = '1';
  panel.querySelectorAll('[data-sentref-go]').forEach(el => {
    el.addEventListener('click', () => spGoPracticeCat(el.getAttribute('data-sentref-go')));
  });
}
function spGoPracticeCat(catId){
  // 显隐对齐 PRACTICE tab 逻辑（speaking.js ready 里同款），并展开该类重渲染
  spActivateTab('PRACTICE');
  $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true; $('#pdView').hidden = true;
  if(!window.__SENT_V2_ON){ $('#pdView').hidden = false; return; }   // 开关回滚时落老 pdView
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

/* === 口语目标分 → 串题稿词数预算（P1：按考生目标语速校准，目标越低语速越慢/卡顿越多，稿子越短）=== */
function storyWordBudget(){
  const t = parseFloat(DATA.settings && DATA.settings.targets && DATA.settings.targets.speaking) || 5.5;
  // 口径（9/21 修订）：考生慢语速约 100wpm、卡顿较多；正文(open+bridge+body+feel)目标念 70–85 秒，
  // 其余时间靠 paddingEn 加时句补足 2 分钟。padding 是必背项不是可选项。
  if(t >= 6.5) return { target: t, min: 140, max: 160 };
  if(t >= 6.0) return { target: t, min: 130, max: 150 };
  return { target: t, min: 120, max: 140 };
}

/* 空依赖引导卡（design/81）：AI 功能撞到「没配 Key / 没素材」时给一张可点的下一步卡片，
   替代一闪而过的 toast。btnHtml 由调用方传入（内部已 escape / 固定文案，不再二次处理）。 */
function spGuideCardHtml(title, desc, btnHtml){
  return '<div class="sp-guide"><div class="sp-guide-title">' + escapeHtml(title) + '</div>'
    + '<div class="sp-guide-desc">' + desc + '</div>'
    + (btnHtml ? '<div class="sp-guide-actions">' + btnHtml + '</div>' : '')
    + '</div>';
}
function spKeyGuideBtn(){ return '<a class="btn btn-primary sp-guide-btn" href="settings.html">去设置填写</a>'; }
/* 无素材引导卡的「去素材生成」：复用顶部 pill-tabs 的 MAT 按钮（点它 = 走现有切换入口，不另写切换） */
function spBindMatGuideBtn(el){
  const b = el && el.querySelector('#spGoMatBtn');
  if(!b) return;
  b.addEventListener('click', () => {
    const tab = document.querySelector('#tabs [data-type="MAT"]');
    if(tab) tab.click();
  });
}

/* === design/87：P2 串题要点驱动（bullet-driven）=== */
/* 阶段一规划 prompt：{FORBIDDEN} 为禁词表占位，调用时替换，严禁硬编码。
   她拍板（9/23）：只出一段整段稿、字数够用——不出「标准版/加时版」两版，词数固定 180~200（约 100wpm 念满 2 分钟）。 */
const SYS_CHUAN_PLAN = `你是雅思口语 P2 串题规划师。考生基础弱、目标口语 5.5、语速慢。你拿到一道 P2 真题（含 You should say 四个 bullet）和考生的真实素材库。你的核心原则是【题目要点驱动】：不是把素材故事包装成这道题，而是先看题目要考生讲哪几件事，再去素材里找能回应这些要点的事实；严禁头尾点题、中间跑题的硬串。

工作步骤：
1. 建 slotCheck：把每个 bullet 作为一个槽位，逐个核对素材：
   · covered：素材里有明确、直接的事实能回应（给 evidence，中文引素材原事实）；
   · weak：沾边但不直接，需要换角度叙述（给 evidence 与换角度说明）；
   · missing：素材里完全没有对应事实。
2. 定 fit：
   · natural：所有槽位 covered 或 weak，且素材故事的主体内容与题目同向（把故事原样讲、自然过渡即可）；
   · adaptable：有 missing 槽，但题目主干可由素材承担，补几条真实细节就能完整回应；
   · unfit：题目主干槽（题目核心动作/对象）missing，且素材主题与题目不相关——补一两句过渡也圆不上。
3. adaptable 时给 missingQuestions：为每个 missing/weak 槽出一个补槽小问，2~5 个，严格遵守：
   · 漏斗式：yesno 或 choice 为主（2~5 个具体口语化选项 + 固定末项「其他」自填），必要时才用 text；
   · 带时间锚点（那次旅行 / 当时 / 出发前）；一次只问一件事；严禁「说说/讲讲/谈谈/你觉得」；
   · k 为槽位短英文键；label 为中文问题；type 为 yesno|choice|text；options 为选项数组。
4. natural 时直接给 fullEn（写作铁律见下）。
5. unfit 时给 unfitReason（一句中文说明为什么串不动）和 suggestCard（建议补什么主题的素材，一句中文）。

【讲稿写作铁律】
A. 事实分层（核心）：故事骨架——核心事件、时间、地点、人物、结果——必须来自素材库或考生补充答案，严禁改动或虚构；血肉细节——天气、颜色、气味、声音、一句简短对话、内心独白、身体反应（心跳加速/手心出汗/笑出声）——鼓励适度虚构，让画面真实可信。细节不得与骨架矛盾、不得新增核心事件、不得离谱（不出现名人露面/夸张巧合/奇观堆叠）。
B. 讲故事，不念清单（核心）：第一人称，像当面跟朋友聊一段亲身经历；全篇至少体现一种真实情绪（期待/紧张/惊喜/遗憾/温暖/自豪）；句与句之间必须用自然的口语过渡与连接（You know, / To be honest, / At first, / and then, / What made it special was / The funny thing is / Looking back, / That's why...），严禁一句一个事实的平铺罗列；可适度自嘲或感叹，增加活人感。
C. 素材句处理：保留素材句的信息要点与关键实词，允许为流畅而重组语序、增删修饰成分；新写的句子用简单句 + 初高中常见词；严禁 {FORBIDDEN}。
D. fullEn 为整段讲稿（只出一段，不出两版），词数 130~180；按说话顺序：开头 1 句自然点题（I'd like to talk about... 或等价自然说法，融入正文，不要单列）→ 主体按 bullet 顺序逐点回应 → 结尾 1 句收束在普适感受上（如 it's still one of my favorite memories / it taught me that...），方便同一素材串其他题。
E. 扣题比例（硬约束）：fullEn 中直接回应 bullet 的句子 ≥60%；跑题的背景/氛围描述只能作细节点缀。生成后逐句自检，不达标就重写。
F. fullEn 为纯英文、可直接朗读；不要任何 STEP 编号、不要中文。
G. logicChain：中文短语用横杠「-」串接的完整逻辑链（事件内核-情感内核-可迁移点）；mappingZh：固定四段——用哪张卡 → 走哪个角度 → 各 bullet 用素材什么事实填 → 点题怎么转。

输出严格 JSON，不要解释文字：
{"fit":"natural|adaptable|unfit",
 "slotCheck":[{"bullet":"","status":"covered|weak|missing","evidence":""}],
 "missingQuestions":[{"k":"","type":"yesno|choice|text","label":"","options":[]}],
 "fullEn":"",
 "logicChain":"","mappingZh":"",
 "unfitReason":"","suggestCard":""}`;

/* 阶段二成稿 prompt：素材事实 + 考生补槽答案 → 一段完整独白 */
const SYS_CHUAN_FINAL = `你是雅思口语 P2 串题成稿助手。考生对一道 P2 题已完成素材核对，并通过几个小问题补充了真实细节（见下）。请把【素材事实 + 考生补充答案】按题目 bullet 的顺序写成一段可直接朗读的完整独白。

铁律：
1. 考生补充的每条答案都是真实事实，必须自然写进对应 bullet 的段落，不得遗漏；补充答案与素材事实冲突时以补充答案为准。
2. 若考生选择「不补直接出稿」（补充答案为空或部分为空）：没有事实的 bullet 严禁编造具体新事件，用素材已有事实 + 通用感受句自然带过（可以写情绪反应，不写具体新事实）；并在 weakBullets 中列出仍偏弱的 bullet 下标（从 0 开始）。
3. 写作铁律沿用阶段一 A~G：骨架事实不编造、血肉细节（感官/情绪/过渡）鼓励适度虚构、讲故事不念清单、fullEn 130~180 词、扣题句 ≥60%、词汇分级与禁词（{FORBIDDEN}）、纯英文无 STEP。
4. 开头点题与结尾收束自然成段，不要单列模块。

输出严格 JSON：
{"fit":"adaptable|natural","fullEn":"","logicChain":"","mappingZh":"","weakBullets":[]}`;

/* 素材分级注入（沿用旧口径）：pinned 优先；第 1 张发全文，其余只发摘要（storyEn 是最长字段，多卡时 90% 输入 token 烧在它身上） */
function chuanMatsText(){
  const store = matLoadStore();
  const mats = ((store && store.materials) || []).filter(Boolean).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  let t = mats.map((m, i) => {
    const head = '【素材 ' + (i + 1) + '：' + (m.title || '未命名') + '】';
    const golden = '万能句（任何题都能套，优先整句使用）：' + ((m.goldenEn || []).join(' | '));
    const cov = '可套题族（搭边也行）：' + (m.coverage || []).map(c => c.topic + (c.fit === 'loose' ? '(搭边:' + c.note + ')' : '')).join('、');
    const logic = '中文逻辑链：' + (m.logicZh || '');
    if(i === 0) return head + '\n英文可背故事：' + (m.storyEn || '') + '\n' + logic + '\n' + golden + '\n' + cov;
    return head + '（仅摘要·无英文正文）\n' + logic + '\n' + golden + '\n' + cov;
  }).join('\n---\n');
  // v7.2 细节碎片库：她记住的细节（自己补的 + AI 代补的）随素材一起注入，任何题的槽位都能用
  const bits = ((store && store.detailBits) || []).filter(b => b && (b.en || b.zh)).slice(-12);
  if(bits.length){
    t += (t ? '\n\n' : '') + '【考生已记住的细节碎片（真实事实，可直接用于填充任何题的槽位，优先使用）】';
    t += bits.map((b, i) => '\n' + (i + 1) + '. ' + (b.en ? b.en + (b.zh ? '（' + b.zh + '）' : '') : b.zh)).join('');
  }
  return t;
}
function chuanUserMsg(s){
  return 'P2 题目：' + (s.promptEn || s.title || '') +
    '\n中文题意：' + (s.promptZh || '') +
    '\nYou should say: ' + ((s.youShouldSay || []).join('; '));
}
function chuanSysWithMats(base){
  // 把语料库写进 system（而非仅 user），弱模型读漏就会编，写死为唯一积木更稳
  return base + '\n\n【考生真实素材库】（唯一事实来源，严禁编造；已按考生标记的熟悉度排序，排在最前的最熟）：\n' + chuanMatsText();
}
function chuanFillPh(base){
  return String(base).replace(/\{FORBIDDEN\}/g, window.FORBIDDEN_WORDS.join(' / '));
}

async function aiStoryLink(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = $('#aiResult');

  // 无 Key / 无素材：不再 toast 一闪而过，直接在结果区给可点引导卡（design/81）
  if(!DATA.settings.relayToken){
    if(resultEl){
      resultEl.innerHTML = spGuideCardHtml('AI 串题需要 DeepSeek Key',
        '串题思路由 AI 根据你的万能素材生成，本站不内置 Key：只需在设置里填你自己的 DeepSeek Key，Key 只存在这台设备的浏览器里。',
        spKeyGuideBtn());
      resultEl.style.display = 'block';
    }
    toast('请先在「设置 / AI 接口」配置 API Key');
    return;
  }
  const store = matLoadStore();
  if(!store || !store.materials || !store.materials.length){
    if(resultEl){
      resultEl.innerHTML = spGuideCardHtml('还没有万能素材',
        '先去素材 tab 用几段真实经历生成你的故事卡，之后每道 P2 都能自动串题。',
        '<button class="btn btn-primary sp-guide-btn" id="spGoMatBtn" type="button">去素材生成</button>');
      resultEl.style.display = 'block';
      spBindMatGuideBtn(resultEl);
    }
    toast('还没有万能素材，先去「素材」页生成');
    return;
  }
  await planChuan(s);
}

/* design/87 阶段一：逐 bullet 核对素材。natural → 整段稿；adaptable → 补槽卡；unfit → 拒绝硬串卡 */
async function planChuan(s){
  const resultEl = $('#aiResult');
  const linkBtn = document.getElementById('aiStoryLinkBtn');
  setStoryLinkBtn(linkBtn, '⏳ 核对素材中…', true);
  if(resultEl){ resultEl.style.display = 'block'; resultEl.innerHTML = '<div class="diag-note">正在逐条核对题目要点与你的素材库…</div>'; }
  try{
    const sys = chuanSysWithMats(chuanFillPh(SYS_CHUAN_PLAN));
    const user = chuanUserMsg(s);
    const content = await callRelay('speaking_chuan_plan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);   // 结构化 JSON 输出：降温度减少同题重开的波动
    const j = aiJson(content);
    if(!(j && (j.fit === 'natural' || j.fit === 'adaptable' || j.fit === 'unfit') && Array.isArray(j.slotCheck) && j.slotCheck.length)){
      throw new Error('__RAW__' + (content || ''));
    }
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    // 草稿（阶段一结果 + 已补答案）实时落库：关页/切题再回来可恢复；成稿后清掉
    s.answers.p2.linkDraft = { plan: j, supplements: {}, ts: Date.now() };
    s.updatedAt = Date.now();
    hubSave();
    renderStoryLinkV2(resultEl, j, s);
  }catch(e){
    if(resultEl){
      if(String(e && e.message || '').indexOf('__RAW__') === 0){
        resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(String(e.message).slice(7)) + '</pre>';
      } else {
        resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
      }
    }
  }finally{
    setStoryLinkBtn(linkBtn, '重新生成串题思路', false);
  }
}

/* v7.2 AI 代补模式附加指令：她不想自己补 → AI 按铁律 A 亲自为 missing/weak 槽位设计可信细节，
   织进讲稿并逐条输出 inventedDetails（en=织进稿子的英文句，zh=中文对照），供存入细节碎片库 */
const CHUAN_AIFILL_SUFFIX = `\n\n【AI 代补模式】考生明确不想自己补充细节。请你按写作铁律 A 的血肉细节规则，亲自为上面 slotCheck 中 missing/weak 的槽位设计可信细节（与故事骨架一致、不离谱、只用初高中常见词），把它们自然织进 fullEn；并额外输出 "inventedDetails" 数组：每项 {"slot":"槽位短句","en":"织进讲稿的英文细节句","zh":"中文对照"}。inventedDetails 里的英文句必须原样出现在 fullEn 中。`;

/* design/87 阶段二：补槽答案 + 素材 → 一段完整讲稿。失败不落库、不盖旧结果（AI 红线）
   v7.2 aiFill=true = AI 代补模式（她不想自己补细节，让 AI 编可信细节并沉淀进碎片库） */
async function finalChuan(s, aiFill){
  const resultEl = $('#aiResult');
  const linkBtn = document.getElementById('aiStoryLinkBtn');
  setStoryLinkBtn(linkBtn, '⏳ 出稿中…', true);
  if(resultEl){ resultEl.style.display = 'block'; resultEl.innerHTML = '<div class="diag-note">' + (aiFill ? '正在让 AI 替你补细节、整合成整段讲稿…' : '正在把素材与你的补充细节整合成整段讲稿…') + '</div>'; }
  try{
    const p2 = (s.answers && s.answers.p2) || {};
    const draft = p2.linkDraft || {};
    const plan = draft.plan || {};
    const sup = draft.supplements || {};
    const sys = chuanSysWithMats(chuanFillPh(SYS_CHUAN_FINAL)) + (aiFill ? chuanFillPh(CHUAN_AIFILL_SUFFIX) : '');
    const user = chuanUserMsg(s)
      + '\n\n【阶段一素材核对结果】' + JSON.stringify(plan.slotCheck || [])
      + (Array.isArray(plan.missingQuestions) && plan.missingQuestions.length ? '\n【补槽问题】' + JSON.stringify(plan.missingQuestions) : '')
      + '\n【考生补充的真实细节】（空对象=不补直接出稿' + (aiFill ? '，请按 AI 代补模式自行设计细节' : '') + '）' + JSON.stringify(sup);
    const content = await callRelay('speaking_chuan_final', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);
    const j = aiJson(content);
    if(!(j && typeof j.fullEn === 'string' && j.fullEn.trim())){
      throw new Error('__RAW__' + (content || ''));
    }
    const out = { ...j, fit: (j.fit === 'natural' ? 'natural' : 'adaptable'), v: 2, ts: Date.now(), raw: content };
    if(aiFill && Array.isArray(j.inventedDetails)){
      out.aiInvented = j.inventedDetails.filter(d => d && (d.en || d.zh));
    }
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    s.answers.p2.aiStoryLink = out;
    delete s.answers.p2.linkDraft;
    s.updatedAt = Date.now();
    // v7.2 沉淀进素材碎片库：①考生自己补的细节 ②AI 代补的细节——她记过的每一句都复用到别的题
    const missQ = Array.isArray(plan.missingQuestions) ? plan.missingQuestions : [];
    const supBits = Object.keys(sup || {}).map(k => {
      const v = sup[k];
      const zh = Array.isArray(v) ? v.join('、') : (typeof v === 'string' ? v.trim() : '');
      return (zh && zh !== '有' && zh !== '没有') ? { zh, en: '', from: (s && s.id) || '' } : null;
    }).filter(Boolean);
    const invBits = (out.aiInvented || []).map(d => ({ en: String(d.en || '').trim(), zh: String(d.zh || '').trim(), from: (s && s.id) || '' }));
    const addedBits = matAddDetailBits(supBits.concat(invBits));
    hubSave();
    renderStoryLinkV2(resultEl, out, s);
    toast('讲稿已生成' + (addedBits ? '，' + addedBits + ' 条细节已存入素材库' : ''));
  }catch(e){
    // 失败不落库：数据里旧稿原样保留；界面回到草稿态（补槽/判定卡）让她能直接重试
    if(resultEl){
      if(String(e && e.message || '').indexOf('__RAW__') === 0){
        resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(String(e.message).slice(7)) + '</pre>';
      } else {
        resultEl.innerHTML = '<div class="diag-note">讲稿生成失败：' + escapeHtml(e.message) + '（旧稿保留未动，可直接重试）</div>';
      }
    }
    toast('讲稿生成失败：' + (e.message || ''));
    const p2b = (s.answers && s.answers.p2) || {};
    if(p2b.linkDraft && p2b.linkDraft.plan) renderStoryLinkV2(resultEl, p2b.linkDraft.plan, s);
  }finally{
    setStoryLinkBtn(linkBtn, '重新生成串题思路', false);
  }
}

/* 串题按钮换文案：只替换文字部分，保留 SVG 图标 */
function setStoryLinkBtn(btn, text, disabled){
  if(!btn) return;
  const svg = btn.querySelector('svg');
  btn.disabled = !!disabled;
  btn.innerHTML = (svg ? svg.outerHTML : '') + text;
}

// 把 AI 输出的 **文字** 转成 <b>文字</b>（串题稿里改动句用 ** 标注）
function mdInline(t){
  if(!t) return '';
  return escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/* 串题稿 → 可复制/可朗读的纯英文全文（design/81）。
   只取英文字段，中文的逻辑链 / 映射讲解一律不带（复制到备忘录里背时不需要，也避免中英混排）。
   挂 window 便于探针单测。 */
window.buildStoryPlainText = function(j, version){
  if(!j || typeof j !== 'object') return '';
  // design/87 新结构（v2）：单版整段稿，version 参数仅为兼容旧调用签名（copy/朗读统一取 fullEn）
  if(j.v === 2 || (typeof j.fullEn === 'string' && j.fullEn)){
    return String(j.fullEn || '').trim();
  }
  const parts = [];
  const push = v => { const t = String(v == null ? '' : v).trim(); if(t) parts.push(t); };
  const pushArr = a => { if(Array.isArray(a)) a.forEach(x => push(x)); };
  if(j.article){
    // 老结构：整段 article 即为正文
    push(j.article);
  } else {
    push(j.openEn);
    push(j.bridgeEn);
    pushArr(j.bodyEn);
    pushArr(j.feelEn);
  }
  let out = parts.join('\n');
  if(Array.isArray(j.paddingEn) && j.paddingEn.length){
    const pad = j.paddingEn.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
    if(pad.length) out += (out ? '\n\n' : '') + '【加时必背句】\n' + pad.join('\n');
  }
  return out.trim();
};

/* 复制：优先 navigator.clipboard，不可用时退回 textarea + execCommand（http/旧浏览器兜底） */
function copyTextFallback(text){
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const okd = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!okd;
  }catch(e){ return false; }
}
function copyStoryText(text){
  const done = () => toast('已复制英文稿，可粘贴去背');
  const fail = () => toast('复制失败，可长按选中文本手动复制');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, () => { copyTextFallback(text) ? done() : fail(); });
      return;
    }
  }catch(e){}
  copyTextFallback(text) ? done() : fail();
}

function renderStoryLink(el, j, s){
  if(!el) return;
  const CHAIN = { '人物':'人物链：是谁→如何得知→做了什么→为什么→感受', '事件':'事件链：时间→地点→人物→经过→感受', '事物':'事物链：是什么→如何得到→感受', '地点':'地点链：位置→如何得知→做了什么→为什么→感受' };
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 串题素材（AI 根据万能故事库匹配）'
    + '<span class="mp-actions">'
    + '<button class="btn btn-sm mp-btn" id="storyCopyBtn" type="button">📋 复制英文稿</button>'
    + '<button class="btn btn-sm mp-btn" id="storySpeakBtn" type="button">▶ 朗读全文</button>'
    + '</span></div>';
  if(j.article){
    // 老结构（本期改版前已生成的数据）：维持原三块渲染，不得让历史串题变空白
    if(j.logicChain) h += '<div class="mat-plan-sec"><b>串题逻辑</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
    h += '<div class="mat-plan-sec"><b>串题原文</b><div class="mat-story-en">' + mdInline(j.article) + '</div></div>';
    if(Array.isArray(j.paddingEn) && j.paddingEn.length){
      h += '<div class="mat-plan-sec"><b>加时必背句（正文约 1 分多钟；说得快或考官没打断时，按顺序补念，凑满 2 分钟）</b><ul class="sp-padding">'
        + j.paddingEn.map(x => '<li>' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
  } else {
    if(j.logicChain) h += '<div class="mat-plan-sec"><b>串题逻辑</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
    if(j.openEn) h += '<div class="mat-plan-sec"><b>STEP1 直答（≤3 词）</b><div class="mat-story-en">' + mdInline(String(j.openEn)) + '</div></div>';
    if(j.bridgeEn) h += '<div class="mat-plan-sec"><b>STEP2 点题句</b><div class="mat-story-en">' + mdInline(String(j.bridgeEn)) + '</div></div>';
    if(Array.isArray(j.bodyEn) && j.bodyEn.length){
      const ct = CHAIN[j.chainType] ? j.chainType : '';
      h += '<div class="mat-plan-sec"><b>主体' + (ct ? ' · ' + escapeHtml(ct) + '链' : '') + '</b>'
        + (CHAIN[j.chainType] ? '<div class="mat-logic">' + escapeHtml(CHAIN[j.chainType]) + '</div>' : '')
        + '<div class="mat-story-en">' + j.bodyEn.map(x => mdInline(String(x))).join('<br>') + '</div></div>';
    }
    if(Array.isArray(j.feelEn) && j.feelEn.length){
      const FEEL = ['以前', '变化', '现在', '希望'];
      h += '<div class="mat-plan-sec"><b>STEP3 感受链</b><ul class="sp-padding">'
        + j.feelEn.map((x, i) => '<li><b>' + (FEEL[i] || ('第' + (i + 1) + '句')) + '</b> · ' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
    if(Array.isArray(j.paddingEn) && j.paddingEn.length){
      h += '<div class="mat-plan-sec"><b>加时必背句（正文约 1 分多钟；说得快或考官没打断时，按顺序补念，凑满 2 分钟）</b><ul class="sp-padding">'
        + j.paddingEn.map(x => '<li>' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
    if(j.mappingZh) h += '<div class="mat-plan-sec"><b>怎么串过来的（照这个逻辑自己也能串）</b><div class="mat-logic">' + escapeHtml(j.mappingZh) + '</div></div>';
  }
  h += '<div class="mat-plan-tips">💡 方案根据你的万能故事库跨故事拼细节生成；点「AI 串题思路」可重新生成。</div>';
  // design/87：旧稿只读保留，但给一个手动入口走新逻辑（她拍板：不主动点旧稿永远原样）
  if(s && s.id){
    h += '<div class="sp-chuan-actions"><button class="mat-mini" id="spReplanV2" type="button">按新逻辑重新生成</button><span class="sp-slot-evidence">按题目要点逐条核对素材，出一段整段讲稿；会替换这份旧稿</span></div>';
  }
  h += '</div>';
  el.innerHTML = h;
  el.style.display = 'block';
  if(s && s.id){
    const rv = el.querySelector('#spReplanV2');
    if(rv) rv.addEventListener('click', () => aiStoryLink(s.id));
  }
  bindStoryTools(el, j);
}

/* === design/87 新结构渲染分发：final 成稿态 / adaptable 补槽态 / unfit 拒绝卡；其余兜底旧渲染（旧稿只读保留，用户已拍板） === */
function renderStoryLinkV2(el, j, s){
  if(!el || !j || typeof j !== 'object'){ return; }
  if(typeof j.fullEn === 'string' && j.fullEn){ renderChuanFinal(el, j, s); return; }
  if(j.fit === 'adaptable' && Array.isArray(j.slotCheck) && j.slotCheck.length){ renderChuanSlotFill(el, j, s); return; }
  if(j.fit === 'unfit' && Array.isArray(j.slotCheck) && j.slotCheck.length){ renderChuanUnfit(el, j, s); return; }
  renderStoryLink(el, j, s);
}

/* 整段稿按语义粗分 2~3 自然段（句子计数均分），段间留白，无任何拼装痕迹 */
function chuanParas(t){
  const s0 = String(t || '').trim();
  const sents = s0.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || (s0 ? [s0] : []);
  const per = Math.max(1, Math.ceil(sents.length / 3));
  const paras = [];
  for(let i = 0; i < sents.length; i += per) paras.push(sents.slice(i, i + per).join('').trim());
  return paras.filter(Boolean);
}

/* A. 成稿态（natural 阶段一直出稿 / finalChuan 产物，j.fullEn 存在）。她拍板：单版一段稿，无版本切换 */
function renderChuanFinal(el, j, s){
  const fitBadge = j.fit === 'natural'
    ? '<span class="sp-fit-badge nat">自然贴合</span>'
    : '<span class="sp-fit-badge adp">改编串题</span>';
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 串题讲稿 ' + fitBadge
    + '<span class="mp-actions">'
    + '<button class="btn btn-sm mp-btn" id="storyCopyBtn" type="button">📋 复制</button>'
    + '<button class="btn btn-sm mp-btn" id="storySpeakBtn" type="button">▶ 朗读</button>'
    + '</span></div>';
  h += '<div class="mat-story-en sp-fulldraft">' + chuanParas(j.fullEn).map(p => '<p>' + escapeHtml(p) + '</p>').join('') + '</div>';
  if(Array.isArray(j.weakBullets) && j.weakBullets.length){
    h += '<div class="sp-weak-note">第 ' + j.weakBullets.map(n => Number(n) + 1).join('、') + ' 个要点素材偏弱，考官 P3 可能追问，建议补细节'
      + (s && s.id ? ' · <a href="javascript:void(0)" id="spWeakFix">去补细节</a>' : '') + '</div>';
  }
  if(Array.isArray(j.aiInvented) && j.aiInvented.length){
    h += '<div class="sp-weak-note">🧩 AI 补的 ' + j.aiInvented.length + ' 条细节已存入素材库，其他题自动复用</div>';
  }
  if(j.mappingZh || j.logicChain){
    h += '<details class="sp-chuan-why"><summary>串题原理（想学怎么串再展开 ▸）</summary>';
    if(j.mappingZh) h += '<div class="mat-logic">' + escapeHtml(j.mappingZh) + '</div>';
    if(j.logicChain) h += '<div class="mat-logic">' + escapeHtml(j.logicChain) + '</div>';
    h += '</details>';
  }
  if(s && s.id) h += '<div class="sp-chuan-actions"><button class="mat-mini" id="spRegenChuan" type="button">↻ 重新生成</button></div>';
  h += '</div>';
  el.innerHTML = h;
  el.style.display = 'block';
  const fix = el.querySelector('#spWeakFix');
  if(fix) fix.addEventListener('click', () => aiStoryLink(s.id));
  const regen = el.querySelector('#spRegenChuan');
  if(regen) regen.addEventListener('click', () => aiStoryLink(s.id));
  bindStoryTools(el, j);
}

/* B. 补槽态（fit=adaptable 且无 fullEn）：漏斗式小问，答案实时写 linkDraft.supplements（关页/切题回来不丢） */
function renderChuanSlotFill(el, j, s){
  const p2 = (s.answers && s.answers.p2) || {};
  const draft = p2.linkDraft || { plan: j, supplements: {} };
  draft.supplements = draft.supplements || {};
  const sup = draft.supplements;
  const miss = (Array.isArray(j.missingQuestions) ? j.missingQuestions : []).filter(q => q && q.k && q.label);
  const MARK = { covered:'<span class="sp-slot-mark ok">✓ 有事实</span>', weak:'<span class="sp-slot-mark mid">△ 沾边</span>', missing:'<span class="sp-slot-mark bad">✗ 缺</span>' };
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 补 ' + miss.length + ' 个小细节，这题就能串自然</div>';
  h += '<div class="sp-slot-list">';
  (j.slotCheck || []).forEach(sc => {
    h += '<div class="sp-slot-row">' + (MARK[sc.status] || '<span class="sp-slot-mark mid">△</span>')
      + '<span class="sp-slot-bullet">' + escapeHtml(sc.bullet || '') + '</span>'
      + (sc.evidence ? '<div class="sp-slot-evidence">' + escapeHtml(sc.evidence) + '</div>' : '')
      + '</div>';
  });
  h += '</div>';
  miss.forEach(q => {
    const val = sup[q.k];
    h += '<div class="mat-step"><div class="mat-step-label">' + escapeHtml(q.label || '') + '</div>';
    if(q.type === 'yesno'){
      h += '<div class="mat-yn">'
        + '<button type="button" class="' + (val === '有' ? 'on' : '') + '" data-slot-yn="' + escapeHtml(q.k) + '" data-slot-val="有">有</button>'
        + '<button type="button" class="' + (val === '没有' ? 'on' : '') + '" data-slot-yn="' + escapeHtml(q.k) + '" data-slot-val="没有">没有</button>'
        + '</div>';
    } else if(q.type === 'choice' && Array.isArray(q.options) && q.options.length){
      const arr = Array.isArray(val) ? val : [];
      h += '<div class="mat-chips">' + q.options.map(o =>
        '<button type="button" class="mat-chip pick' + ((arr.indexOf(o) >= 0 || val === o) ? ' on' : '') + '"'
        + ' data-slot-pick="' + escapeHtml(q.k) + '" data-slot-opt="' + escapeHtml(o) + '"' + (q.multi ? ' data-multi="1"' : '') + '>'
        + escapeHtml(o) + '</button>').join('') + '</div>';
      const otherPicked = arr.indexOf('其他') >= 0 || val === '其他';
      const otherText = (typeof val === 'string' && val && q.options.indexOf(val) < 0) ? val : (arr.filter(x => q.options.indexOf(x) < 0)[0] || '');
      if(otherPicked || otherText){
        h += '<input type="text" data-slot-text="' + escapeHtml(q.k) + '" value="' + escapeHtml(otherText || '') + '" placeholder="具体说说（其他）…">';
      }
    } else {
      h += '<input type="text" data-slot-text="' + escapeHtml(q.k) + '" value="' + escapeHtml(val || '') + '" placeholder="用一句话回答…">';
    }
    h += '</div>';
  });
  h += '<div class="sp-chuan-actions">'
    + '<button class="btn btn-primary" id="spFinalBtn" type="button">生成我的讲稿</button>'
    + '<button class="btn" id="spAiFillBtn" type="button">AI 帮我补细节出稿</button>'
    + '<button class="sp-linklike" id="spSkipSupBtn" type="button">不补，直接出稿</button>'
    + '<button class="sp-linklike" id="spGoMatBtn" type="button">这题放弃，去素材库补专属素材 →</button>'
    + '</div></div>';
  el.innerHTML = h;
  el.style.display = 'block';
  const saveSup = () => {
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    s.answers.p2.linkDraft = draft;
    s.updatedAt = Date.now();
    hubSave();
  };
  el.querySelectorAll('[data-slot-yn]').forEach(b => b.addEventListener('click', () => {
    sup[b.dataset.slotYn] = b.dataset.slotVal;
    saveSup();
    renderChuanSlotFill(el, j, s);
  }));
  el.querySelectorAll('[data-slot-pick]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.slotPick, o = b.dataset.slotOpt;
    const q = miss.find(x => x.k === k) || {};
    if(q.multi){
      const arr = Array.isArray(sup[k]) ? sup[k].slice() : [];
      const at = arr.indexOf(o);
      if(at >= 0) arr.splice(at, 1); else arr.push(o);
      sup[k] = arr;
    } else {
      sup[k] = (sup[k] === o) ? '' : o;   // 单选再点同项=取消
    }
    saveSup();
    renderChuanSlotFill(el, j, s);
  }));
  el.querySelectorAll('[data-slot-text]').forEach(ta => ta.addEventListener('input', () => {
    sup[ta.dataset.slotText] = ta.value;   // 文本输入静默保存不重渲（保光标）
    saveSup();
  }));
  const fin = el.querySelector('#spFinalBtn');
  if(fin) fin.addEventListener('click', () => finalChuan(s));
  const aif = el.querySelector('#spAiFillBtn');
  if(aif) aif.addEventListener('click', () => finalChuan(s, true));   // v7.2：AI 代补模式，细节自动沉淀进素材库
  const skip = el.querySelector('#spSkipSupBtn');
  if(skip) skip.addEventListener('click', () => finalChuan(s));   // supplements 原样传（可能为空），SYS_CHUAN_FINAL 第 2 条处理
  spBindMatGuideBtn(el);
}

/* C. unfit 态：明说串不动，引导补素材卡；留「硬试」出口（supplements 为空，考官易判背题） */
function renderChuanUnfit(el, j, s){
  const desc = escapeHtml(j.unfitReason || '素材主题与这道题的核心要点对不上，硬串会像背范文。')
    + (j.suggestCard ? '<br>建议补的素材卡：<b>' + escapeHtml(j.suggestCard) + '</b>' : '');
  el.innerHTML = spGuideCardHtml('这道题和你的素材串不动', desc,
    '<button class="btn btn-primary sp-guide-btn" id="spGoMatBtn" type="button">去素材库补：' + escapeHtml(j.suggestCard || '专属素材') + '</button>'
    + '<button class="sp-linklike" id="spForceChuan" type="button">仍要硬试（不推荐，考官易判背题）</button>');
  el.style.display = 'block';
  spBindMatGuideBtn(el);
  const force = el.querySelector('#spForceChuan');
  if(force) force.addEventListener('click', () => { if(s) finalChuan(s); });
}

/* 串题稿工具条：复制英文稿 / 朗读全文（新老结构都挂，文本统一走 buildStoryPlainText） */
function bindStoryTools(el, j){
  if(!el) return;
  const copyBtn = el.querySelector('#storyCopyBtn');
  const speakBtn = el.querySelector('#storySpeakBtn');
  const getText = () => (typeof window.buildStoryPlainText === 'function') ? window.buildStoryPlainText(j, 'long') : '';
  if(copyBtn) copyBtn.addEventListener('click', () => {
    const t = getText();
    if(!t){ toast('这份串题稿没有可复制的英文'); return; }
    copyStoryText(t);
  });
  if(speakBtn) speakBtn.addEventListener('click', () => {
    const t = getText();
    if(!t){ toast('这份串题稿没有可朗读的英文'); return; }
    if(speakBtn.classList.contains('playing')){ speakQuestion.stop(); resetSpeakBtn(speakBtn); return; }
    speakBtn.classList.add('playing');
    speakBtn.textContent = '■ 停止';
    try{
      // speakQuestion.speak 内部先 cancel，重复点击不会叠加朗读；但它不返回 utterance，
      // 用「轮询 speechSynthesis 状态」感知结束（含点停止的 cancel），结束后还原文案。
      speakQuestion.speak(t, speakBtn);
      watchSpeakEnd(speakBtn);
    }catch(e){ resetSpeakBtn(speakBtn); toast('朗读失败：' + e.message); }
  });
}
/* 轮询朗读状态：speechSynthesis 不再说（播完 / 被 stop 的 cancel）→ 还原按钮。
   首查延迟 ~350ms：speak() 调用后 speaking 标志需一拍才置位，立即查会误判成"没在播"。 */
function watchSpeakEnd(btn){
  if(!btn || !btn.isConnected) return;
  setTimeout(() => {
    if(!btn.isConnected) return;
    let speaking = false;
    try{ speaking = typeof speechSynthesis !== 'undefined' && !!(speechSynthesis.speaking || speechSynthesis.pending); }catch(e){}
    if(!speaking){ resetSpeakBtn(btn); return; }
    watchSpeakEnd(btn);
  }, 350);
}
function resetSpeakBtn(btn){
  if(!btn) return;
  btn.classList.remove('playing');
  btn.textContent = '▶ 朗读全文';
}

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
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
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

// P3 单题 AI 辅助的 system prompt（用户给定：基础极差 / 严格锁 5.5 分，绝不输出 6+ 水平 / 极简「废话框架」）
const P3_HELPER_SYS = `身份：雅思口语 Part 3 答题辅助工具，面向英语基础很差、听力常听不懂题干的考生，目标分数严格锁定 5.5 分，绝不能输出 6 分以上水平。

考生特点：P3 通常只能说 2-3 句话、说话会磨叽带停顿；听不懂题目时靠判断「题型」来兜底。你的任务：根据「当前 P3 题目 + 考生 P2 素材」，直接产出一句考场可说的完整英文回答——一句锚句（观点）紧跟一个 because 拓展，说完即止，不解释、不乱加。

【绝对强制硬规则】
1. 词汇：只用初中-高中最基础词。because 后面的理由（即「尾巴」）只能用以下「词汇池」里的词或其最简单变形：happy, tired, relax, relaxed, bored, boring, easy, hard, same, different, need, want, like, feel, study, work, family, friends, food, money, time, life, people, day。严禁使用 pool 以外的任何抽象词、学术词、生僻形容词/副词（如 cognitive, flexible, enhance, identity, landmark, concrete, construct, symbolize 等）。
2. 输出只给「一句话英文」：结构 = 锚句 + 尾巴（尾巴里已含 because，直接拼接，绝对不要再额外写 because）。总长度 2-3 句、10-20 秒说完。
3. 绝对禁止：for example / for instance / such as 举具体个人故事；禁止中文、禁止解释「为什么这样答」、禁止三段式拆解；禁止出现两个 because。
4. 重复问题：若考生连续追问，可用 "Well, like I said..." / "Well, what I mean is..." 换词重复，但不超过两次，第三次直接简化。

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
- 没听懂/空白（听不清题）：That's a hard one.
  尾巴：because I just want to be happy and relaxed.

【答题逻辑】
- 先判断题型（看题目里的信号词），命中上面对应锚句；
- 输出 = 该行「锚句」+「尾巴」，直接拼接（锚句结尾无句号，尾巴以 ", because" 开头）；绝对不要再单独写 because；
- 如需结合当前题目微调，只能把尾巴里的词换成「词汇池」内的其他简单词（例如题目谈学习，就把 tired 换成 study is hard），不可引入 pool 外词汇；
- 如果考生提供了 P2 素材且贴合，可在尾巴后用 and 接一个 pool 内简单词短语（不举具体人名/地名故事）。

【输出格式：严格只输出下面这一句英文，不要任何前缀 / 解释 / 换行分段】
<锚句 + 尾巴，例如：Actually, I don't think there is much difference, because the feeling is the same.>

输入参数：当前 P3 题目 + 用户的 P2 回答内容，请严格按照以上规则输出。`;

// P3「老师帮我改」：考生贴自己的回答（中/英），按同一套 5.5 硬规则挑问题 + 给改后合规版本
const P3_REVIEW_SYS = `你是雅思口语Part3答题老师，面向英语基础极差的考生，目标分数严格锁定5.5分，绝对不可以输出6分以上水平的内容。
考生会贴出自己针对某道P3题目的回答（可能是中文，也可能是英文）。请你只做一件事：直接给一版符合5.5分规则的改动后回答（英文）。不要挑问题、不要写中文说明、不要寒暄。

【绝对强制硬规则】
1. 词汇：只能用初中-高中最基础词汇，禁止identity, landmark, concrete, shape, construct, symbolize等；统一用look, famous, tall building等简单词。
2. 主回答铁则：2句以内、10-15秒；只含观点+1个最简单原因；绝对禁止for example/for instance/such as；最多1个简单复合结构。
3. 追问拓展铁则：3句以内，必须含1个because从句；最多额外1个固定结构（especially for / which means二选一）；用抽象化P2素材举例，禁止具体个人故事。
4. 若考生贴的是中文：按合规的2句英文主回答直接翻译，不解释。

【输出格式：严格只输出下面两段，不要任何前缀/解释/寒暄】
主回答：xxx（2句以内，无例子）
追问拓展：xxx（3句以内，含because，可选）`;

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
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
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
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按 5.5 分策略生成 P3 参考答案…</div>'; resultEl.style.display = 'block'; }

  try{
    const content = await callRelay('p3_aihelper', [
      { role:'system', content: P3_HELPER_SYS },
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
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  const q = (p3 && Array.isArray(p3.questions) && p3.questions[i]) || '';
  const p2TextEl = document.getElementById('p2Ans');
  const p2Text = (p2TextEl && p2TextEl.value && p2TextEl.value.trim()) || (s.answers.p2 && s.answers.p2.text) || '';

  btn.disabled = true; btn.innerHTML = '老师在看…';
  resultEl.innerHTML = '<div class="diag-note">老师正在按 5.5 分规则看你刚写的回答…</div>';
  resultEl.style.display = 'block';
  try{
    const content = await callRelay('p3_review', [
      { role:'system', content: P3_REVIEW_SYS },
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
          resultEl.innerHTML = '<div class="diag-note">（上次结果非标准格式，已贴原文）</div><pre>' + escapeHtml(s.answers[qi].result || '') + '</pre>';
          resultEl.style.display = 'block';
        }
      }
      // 回填 AI 辅助结果（逻辑链 + 折叠参考英文，不自动填框）
      const aiHelper = s.answers[qi].aiHelper;
      if(aiHelper && (aiHelper.logicChain || aiHelper.answer)){
        const aiRes = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');
        if(aiRes) renderAIHelper(aiRes, aiHelper);
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
async function diagnoseAnswer(id, qi, questionText, answerText){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = document.querySelector('.sp-q-result[data-qi="' + qi + '"]');
  const btn = document.querySelector('.sp-diag[data-qi="' + qi + '"]');
  const btnHtml = btn ? btn.innerHTML : '';   // B2：缓存原 SVG
  if(btn){ btn.disabled = true; btn.textContent = '诊断中…'; }
  try{
    const messages = [
      { role:'system', content: SYS_DIAG },
      { role:'user', content: '题目：' + questionText + '\n\n我的回答：\n' + answerText }
    ];
    const content = await callRelay('speaking_diagnose', messages, 0.3);
    const j = aiJson(content);
    adaptDiag(j);
    normalizeScore(j, answerText);
    renderDiag(resultEl, j, content, answerText);
    s.answers = s.answers || {};
    const oldAns = s.answers[qi] || {};
    // 9/20 评分恢复：把真实分数落库（AI 失败会走 catch 不落库；非 JSON 时 j 为 null → newScore 为 null，
    // 列表继续显示「练过N次」，绝不编造分数）
    const newScore = j ? parseScore(j.score) : null;
    s.answers[qi] = { ...oldAns, text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers[qi].records = s.answers[qi].records || [];
    s.answers[qi].records.push({ text: answerText, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
  }catch(e){
    // design/81：缺 Key 撞墙给引导卡（可点去设置），其他错误维持原文案
    if(resultEl){
      if(String(e.message || '').indexOf('未配置 API Key') !== -1){
        resultEl.innerHTML = spGuideCardHtml('AI 纠错需要 DeepSeek Key',
          '诊断打分由 AI 完成，本站不内置 Key：在设置里填你自己的 DeepSeek Key 即可，Key 只存在这台设备。',
          spKeyGuideBtn());
      } else {
        resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '\n\n请检查「设置」中的 AI 接口地址。</div>';
      }
      resultEl.style.display = 'block';
    }
    toast('AI 诊断失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }   // B2：恢复 SVG
  }
}

// P2 诊断结构化渲染（语法/用词错误合并为一个模块展示 + 改进建议 + 串题素材连接；不显示分数）
function renderP2Diag(el, j, answer){
  normalizeScore(j, answer);
  if(!j || !Array.isArray(j.errors)){ el.innerHTML = ''; return false; }
  const errs = cleanErrors(j.errors);
  let h = diagScoreHtml(j)
    + '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';
  if(j.rewrite) h += '<div class="diag-sec"><b>改进版表达</b><div class="diag-rewrite">' + highlightRewriteHtml(j.rewrite, errs) + '</div></div>';
  if(j.storyLink) h += '<div class="diag-sec"><b>📌 串题素材连接</b><div class="diag-note">可以用你已准备的这些万能素材来回答这道题：</div>' + escapeHtml(j.storyLink) + '</div>';
  h += diagCollectBar(errs, answer);              // design/77：一键收进句型练习
  el.innerHTML = h;
  bindDiagCollect(el);
  return true;
}

// P2 AI 纠错：语法纠错 + 串题素材连接建议
async function diagnoseP2(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  // 修(h 空数据降级)：原 ($('#p2Ans') || {}).value.trim() 只兜住了元素本身，
  // 元素缺失时 {}.value 是 undefined，再 .trim() 直接 TypeError —— 应当走下面的空值提示而非崩溃。
  const __p2ta = $('#p2Ans');
  const answer = __p2ta ? __p2ta.value.trim() : '';
  if(!answer){ toast('先说出或写下你的回答'); return; }

  const btn = $('#p2Diag');
  const btnHtml = btn ? btn.innerHTML : '';   // B2：缓存原 SVG
  const resultEl = $('#p2Result');
  if(btn){ btn.disabled = true; btn.textContent = '纠错中…'; }

  try{
    // 读已有串题故事作为素材参考（speakingStories 每条含 stories[]，每条有 name/keyPoints/outline）
    const stories = (DATA.speakingStories || []).map(scheme =>
      (scheme.stories || []).map(st =>
        '【' + (st.name || '') + '】' + (st.keyPoints || '') + '\n' + (st.outline || '').slice(0, 300)
      ).join('\n---\n')
    ).join('\n===\n');

    const messages = [
      { role:'system', content: SYS_DIAG_P2 },
      { role:'user', content:
        'P2 题目：' + (s.promptEn || s.title || '') +
        '\n中文描述：' + (s.promptZh || '') +
        '\n\n考生的完整回答：\n' + answer +
        '\n\n考生已有的串题万能素材（用于给出串题建议）：\n' +
        (stories || '（暂无串题素材）')
      }
    ];
    const content = await callRelay('speaking_diagnose', messages, 0.3);
    const j = aiJson(content);
    adaptDiag(j);
    normalizeScore(j, answer);

    // 渲染结果
    if(!renderP2Diag(resultEl, j, answer)){
      resultEl.innerHTML = '<div class="diag-note">（AI 返回非标准格式，已贴原文）</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
    resultEl.style.display = 'block';

    // 存结果 + 追加一条提交历史记录
    s.answers = s.answers || {};
    // 9/20 评分恢复：真实分数落库（同上，AI 失败不落库；非 JSON 时保持 null 不编造）
    const newScore = j ? parseScore(j.score) : null;
    // 修(b/g)：原写法整体替换 answers.p2，会把 p3（P3 追问题目/答案/AI辅助）、
    // aiStoryLink（串题素材）和已有 records 全部抹掉，导致每次「AI 纠错」后 P3 与串题消失、
    // 历史只剩 1 条。改为展开合并保留旧字段，与 diagnoseAnswer 的 { ...oldAns } 口径一致。
    s.answers.p2 = { ...(s.answers.p2 || {}), text: answer, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers.p2.records = s.answers.p2.records || [];
    s.answers.p2.records.push({ text: answer, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
    // 刷新 P2 提交历史列表
    renderSubmitRecords(s.answers.p2.records, $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null){ ta.value = rec.text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j2 = JSON.parse(rec.result); if(renderP2Diag(res, j2, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));

  }catch(e){
    // design/81：缺 Key 撞墙给引导卡，其他错误维持原文案
    if(String(e.message || '').indexOf('未配置 API Key') !== -1){
      resultEl.innerHTML = spGuideCardHtml('AI 纠错需要 DeepSeek Key',
        '诊断打分由 AI 完成，本站不内置 Key：在设置里填你自己的 DeepSeek Key 即可，Key 只存在这台设备。',
        spKeyGuideBtn());
    } else {
      resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
    }
    resultEl.style.display = 'block';
    toast('AI 纠错失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }   // B2：恢复 SVG
  }
}

// 把 AI 偶尔返回的非标准 errors（字符串数组或中文说明）尽量归一化为对象数组
function normalizeErrors(errors){
  if(!Array.isArray(errors)) return [];
  return errors.map(e => {
    if(e && typeof e === 'object') return e;
    if(typeof e !== 'string') return null;
    const s = e.trim();
    if(!s) return null;
    // 常见模式："xxx" 中 "yyy" 多余，应为 "zzz" / "xxx" 应为 "yyy"
    let m = s.match(/^[""]([^""]+)[""]\s*中\s*[""]([^""]+)[""]\s*(?:多余|错误|不对|有误)[，,;；]?\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '「' + m[2].trim() + '」' + (m[0].includes('多余') ? '多余' : '错误'), fix: m[3].trim() };
    m = s.match(/^[""]([^""]+)[""]\s*(?:中\s*)?[""]([^""]+)[""]\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '「' + m[2].trim() + '」错误', fix: m[3].trim() };
    m = s.match(/^[""]([^""]+)[""]\s*应为\s*[""]([^""]+)[""](.*)$/);
    if(m) return { original: m[1].trim(), issue: '应为「' + m[2].trim() + '」', fix: m[2].trim() };
    m = s.match(/^([^应为改为→\n]{2,60})\s*(?:应为|应改为|改成|→|->)\s*(.+)$/);
    if(m) return { original: m[1].trim(), issue: '语法/用词问题', fix: m[2].trim() };
    // 兜底：把整个字符串当 issue
    return { original: s, issue: s, fix: '' };
  }).filter(Boolean);
}

// 过滤 AI 输出的「自相矛盾」或「无错误硬凑」条目（兜底）
function cleanErrors(errors){
  if(!Array.isArray(errors)) return [];
  errors = normalizeErrors(errors);
  if(!Array.isArray(errors)) return [];
  // 自我否定/自相矛盾的话
  const BAD = /原句没错|原句正确|不应列为|不是错误|不算错误|也正确|可接受|没问题|不存在|没有错误|并不错|其实没错|实际上没错|可保留|不必修改|无需修改|无需改动|没有语法错误|没有明显|不过.*也可以|虽然.*但.*正确|此条不列为|不列为错误/i;
  // 口语中永远不算错误的点：标点、大小写、空格、断句
  const PUNCT_CAP = /大小写|首字母|大写|小写|标点|逗号|句号|问号|感叹号|引号|空格|断句|缺少.*标点|应加标点|加标点/i;
  // 风格/同义替换/改写建议类：不是真错误
  const STYLE = /更地道|更自然|更常见|更口语|更正式|更好|建议|可替换|可改为|可改成|可换成|用.*更好|显得|不够地道|不够自然|不够正式|不够口语|同义词|同义|替换|替换成|换成|改写成|改写为|重写为|换一种|更.*表达|表达.*更好|意思.*一样|意思.*相同|更简洁|更清楚|更流畅/i;
  return errors.filter(e => {
    if(!e || typeof e !== 'object') return false;
    const orig = String(e.original || '').trim();
    const fix = String(e.fix || '').trim();
    if(!orig || !fix) return false;
    if(orig.toLowerCase() === fix.toLowerCase()) return false;
    if(BAD.test(String(e.issue || ''))) return false;
    if(PUNCT_CAP.test(String(e.issue || ''))) return false;
    if(STYLE.test(String(e.issue || ''))) return false;
    // 常见意义改变/同义替换硬过滤（original/fix 同时命中）
    const origLower = orig.toLowerCase();
    const fixLower = fix.toLowerCase();
    if((origLower.includes("don't know") && fixLower.includes("don't think so")) ||
       (origLower.includes("don't think so") && fixLower.includes("don't know"))) return false;
    if((origLower.includes('unwind') && fixLower.includes('relaxed')) ||
       (origLower.includes('relaxed') && fixLower.includes('unwind'))) return false;
    if((origLower.includes('adhder') || origLower.includes('adhd')) &&
       (fixLower.includes('bad driver') || fixLower.includes('driver'))) return false;
    return true;
  });
}

// 对两个短语做 token 级 diff，返回 [{type:'same'|'del'|'ins', text}]（按空格分词，忽略大小写匹配）
function wordDiff(a, b){
  const wa = String(a || '').trim().split(/\s+/).filter(Boolean);
  const wb = String(b || '').trim().split(/\s+/).filter(Boolean);
  const dp = Array(wa.length + 1).fill(null).map(() => Array(wb.length + 1).fill(0));
  for(let i = wa.length - 1; i >= 0; i--){
    for(let j = wb.length - 1; j >= 0; j--){
      if(wa[i].toLowerCase() === wb[j].toLowerCase()) dp[i][j] = dp[i+1][j+1] + 1;
      else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while(i < wa.length || j < wb.length){
    if(i < wa.length && j < wb.length && wa[i].toLowerCase() === wb[j].toLowerCase()){
      out.push({type:'same', text: wa[i]}); i++; j++;
    } else if(j < wb.length && (i === wa.length || dp[i][j+1] > dp[i+1][j])){   // 9/15：相等时优先 del——「先划原文、后见替换」之之定版语序
      out.push({type:'ins', text: wb[j]}); j++;
    } else if(i < wa.length){
      out.push({type:'del', text: wa[i]}); i++;
    }
  }
  return out;
}

// 9/15 之之二反馈：AI 常把没错的上下文也塞进 original/fix（如 original="artificial intelligence is"
// fix="artificial intelligence has been"）→ 对错的词整段复述一遍绿色。先裁掉公共前后缀 token，
// 只留真正不同的核心再 diff，保证「没错的词绝不重复出现」。
function trimCommonAffixes(orig, fix){
  const norm = t => String(t).toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  const wa = String(orig || '').trim().split(/\s+/).filter(Boolean);
  const wb = String(fix || '').trim().split(/\s+/).filter(Boolean);
  const pre = [], post = [];
  while(wa.length && wb.length && norm(wa[0]) === norm(wb[0]) && norm(wa[0]) !== ''){ pre.push(wa.shift()); wb.shift(); }
  while(wa.length && wb.length && norm(wa[wa.length-1]) === norm(wb[wb.length-1]) && norm(wa[wa.length-1]) !== ''){ post.unshift(wa.pop()); wb.pop(); }
  return { pre: pre.join(' '), a: wa.join(' '), b: wb.join(' '), post: post.join(' ') };
}

// 在原句中 inline 标出修改（9/15 之之定版）：错误原文划删除线，绿色替换文本直接并排显示；
// 纯符号替换（AI 用 "/" 表示删除该词）不显示替换块，只留删除线；不再使用箭头对比形式
function diffSentenceHtml(answer, errs){
  const ans = String(answer || '').trim();
  const clean = cleanErrors(errs);
  const broken = hasObviousGrammarIssues(answer);
  if(!clean.length && !broken) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  if(!clean.length && broken) return '<div class="diag-warn">句子有明显语法问题（如缺 be 动词/时态/成分残缺），但 AI 未具体指出。建议重读原句或手动检查。</div>';
  if(!ans) return inlineErrorsHtml(clean);
  const isPlaceholderFix = t => /^[\s\/\-–—|,.;!?、；。]*$/.test(String(t || ''));

  // 按 original 在原句中出现位置排序，从后往前替换，避免偏移
  const reps = [];
  clean.forEach(e => {
    const orig = String(e.original || '');
    const fix = String(e.fix || '');
    if(!orig || !fix) return;
    // 9/15：词边界匹配（"is" 不得命中 "this" 内部），失败再退回普通 indexOf
    let idx = -1, len = orig.length;
    try {
      const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = ans.match(new RegExp('(?<![A-Za-z])' + esc + '(?![A-Za-z])', 'i'));
      if(m){ idx = m.index; len = m[0].length; }
    } catch(_) {}
    if(idx === -1){
      idx = ans.toLowerCase().indexOf(orig.toLowerCase());
      if(idx === -1) return;
    }
    const t = trimCommonAffixes(orig, fix);
    if(!t.a && !t.b) return;
    const parts = wordDiff(t.a, t.b);
    // 连续同类型 token 合并成一个标记（ins "has"+"been" → 一个绿块），词间就是一个普通空格
    const seg = [];
    parts.forEach(p => {
      const lastSeg = seg[seg.length - 1];
      if(lastSeg && lastSeg.type === p.type) lastSeg.text += ' ' + p.text;
      else seg.push({ type: p.type, text: p.text });
    });
    let html = t.pre ? escapeHtml(t.pre) + ' ' : '';   // 裁掉的前缀原样补回（本来就是对的）
    seg.forEach(s => {
      if(s.type === 'same') html += (html ? ' ' : '') + escapeHtml(s.text);
      if(s.type === 'del') html += (html ? ' ' : '') + '<s class="diag-wrong">' + escapeHtml(s.text) + '</s>';
      if(s.type === 'ins' && !isPlaceholderFix(s.text)) html += (html ? ' ' : '') + '<span class="diag-right">' + escapeHtml(s.text) + '</span>';
    });
    if(t.post) html += ' ' + escapeHtml(t.post);   // 裁掉的后缀原样补回
    reps.push({idx, len, html});
  });

  if(!reps.length) return inlineErrorsHtml(clean);
  // 修(e 转义纪律)：原写法把未转义的用户原文 ans 直接拼进 innerHTML，只有命中的错误片段过了
  // escapeHtml —— 回答里出现 < > & 会破坏结构甚至注入标签。改为升序遍历，未命中的段落逐段转义。
  reps.sort((a, b) => a.idx - b.idx);
  let html = '';
  let last = 0;
  reps.forEach(r => {
    if(r.idx < last) return;   // 9/15：重叠的纠错只渲染第一条，防同段文本重复出现
    html += escapeHtml(ans.slice(last, r.idx)) + r.html;   // r.html 内部已各自 escapeHtml
    last = r.idx + r.len;
  });
  html += escapeHtml(ans.slice(last));
  return '<div class="diag-sentence-diff">' + html + '</div>';
}

// 把新版 AI 输出（评分维度在顶层 + grammar_errors / corrected / lexical / suggestions）适配成旧后端字段
// （j.score.* / errors / fix / vocabulary / rewrite），让纠错渲染、评分兜底、发音接管逻辑都不用改
function adaptDiag(j){
  if(!j || typeof j !== 'object') return j;
  // 新格式评分维度在顶层（overall/fluency/lexical/grammar/pronunciation），旧后端统一读 j.score.*
  if(j.score == null) j.score = {};
  ['fluency','grammar','overall','pronunciation'].forEach(k => {
    if(j[k] != null && j.score[k] == null) j.score[k] = j[k];
  });
  // 词汇维度：lexical → vocabulary（score 内）
  if(j.lexical != null && j.score.vocabulary == null) j.score.vocabulary = j.lexical;
  // 错误数组：grammar_errors → errors；字段 corrected→fix、explanation→issue
  if(Array.isArray(j.grammar_errors) && j.errors == null) j.errors = j.grammar_errors;
  if(Array.isArray(j.errors)){
    j.errors = j.errors.map(e => {
      if(e && typeof e === 'object'){
        return {
          original: e.original != null ? String(e.original) : '',
          fix: e.corrected != null ? String(e.corrected) : (e.fix != null ? String(e.fix) : ''),
          issue: e.explanation != null ? String(e.explanation) : (e.issue != null ? String(e.issue) : ''),
          type: e.type != null ? String(e.type) : ''
        };
      }
      return e; // 字符串型交给 normalizeErrors 处理
    });
  }
  // 建议：suggestions → rewrite（渲染层作为"改进建议"显示）
  if(j.suggestions != null && j.rewrite == null) j.rewrite = j.suggestions;
  // 9/15：improved（更通顺地道的改进版）→ rewrite，与旧字段共用渲染；improved 优先
  if(j.improved != null && String(j.improved).trim()) j.rewrite = String(j.improved).trim();
  // 发音由前端用设置值接管：删掉 pronunciation（顶层或 score 内），避免与设置值混淆
  if(j.score && j.score.pronunciation != null) delete j.score.pronunciation;
  if(j.pronunciation != null) delete j.pronunciation;
  return j;
}

// 文本粗检：句子有明显破洞但 AI 漏报时，不让他享受"无错6分"兜底
function hasObviousGrammarIssues(text){
  const raw = String(text || '').trim();
  const t = ' ' + raw.toLowerCase().replace(/[.,!?;:'"]/g, ' ') + ' ';
  // I never creating / I just watching / I always thinking（进行时缺 be）
  if(/\bi\s+(never|always|often|sometimes|usually|just|already|also|still)\s+[a-z]+ing\b/.test(t)) return true;
  // I just it's / I also it's / I never it's（缺谓语，后接 it's）
  if(/\bi\s+(just|also|always|never|still)\s+it\s*is\b/.test(t)) return true;
  // I it's / we it's / they it's（主语后直接跟 it's）
  if(/\b(i|we|they|he|she)\s+it'?s\b/.test(t)) return true;
  // I would say 后面啥也没有，话没说完
  if(/\bi\s+would\s+say\s*$/.test(raw.toLowerCase())) return true;
  // 过去时间状语 + 现在时动词：in the past I prefer / last year I like
  if(/\b(in the past|last year|last month|last week|yesterday|when i was young)\b.*\b(i|you|we|they|he|she)\s+(prefer|like|love|hate|want|need|go|do|have|watch|listen|play|eat|read)\b/.test(t)) return true;
  // about + 大写形容词/副词：about Popular / about Beautiful（词性误用）
  if(/\babout\s+[A-Z][a-z]+\b/.test(raw)) return true;
  // feel / make me feel ... and + 动词原形，但前面是形容词/名词：feel all right and slow down
  if(/\bfeel\s+\w+(\s+\w+)?\s+and\s+\w+\s+down\b/.test(t)) return true;
  // 主谓之间插 is：I use social media is frequent / She likes music is good
  if(/\b(i|you|we|they|he|she)\s+\w+(\s+\w+){1,5}\s+is\s+\w+\b/.test(t)) return true;
  return false;
}

/* === 评分净化（9/20 design/76 重写） ===
   旧版有一套「无错给 6 / 有错封顶 5.5 / 流利度硬拉 5.5」的兜底，那不是雅思标准而是拍脑袋，
   正是评分偏低的根源 —— 已整体删除。现在只做安全钳制：
   · 分数必须是 1~9 之间、0.5 步长的数字；非数字或越界一律丢弃（不猜、不兜底、不擅自拉高）
   · 流利度与发音需要音频才能评，文本评不了 —— 一律置空，绝不让 AI 偷跑一个出来
   · overall 由 parseScore 统一算，AI 给的一律删掉，避免口径不一致 */
function clampBand(v){
  if(v == null || v === '') return null;
  const n = parseFloat(v);
  if(!isFinite(n) || n < 1 || n > 9) return null;
  return Math.round(n * 2) / 2;
}
function normalizeScore(j){
  if(!j || typeof j !== 'object') return j;
  if(!j.score || typeof j.score !== 'object') j.score = {};
  j.score.grammar = clampBand(j.score.grammar);
  j.score.vocabulary = clampBand(j.score.vocabulary);
  j.score.fluency = null;         // 需音频，文本不评
  j.score.pronunciation = null;   // 需音频，文本不评
  delete j.score.overall;
  return j;
}

// 渲染 inline 笔记式纠错（fallback：无法定位原句时使用；9/15 去箭头，划线+绿色替换并排）
function inlineErrorsHtml(errs){
  if(!errs.length) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  const isPlaceholderFix = t => /^[\s\/\-–—|,.;!?、；。]*$/.test(String(t || ''));
  return '<div class="diag-inline-list">' + errs.map((e, i) => {
    const issue = String(e.issue || '').trim();
    return (i > 0 ? '<span class="diag-sep">·</span>' : '')
      + '<span class="diag-inline-item">'
      + '<s class="diag-wrong">' + escapeHtml(e.original || '') + '</s>'
      + (isPlaceholderFix(e.fix) ? '' : '<span class="diag-right">' + escapeHtml(e.fix || '') + '</span>')
      + (issue ? '<span class="diag-inline-note">' + escapeHtml(issue) + '</span>' : '')
      + '</span>';
  }).join('') + '</div>';
}

// 渲染诊断结构化卡片（P1：语法/用词错误合并为一个模块展示，不显示分数）
/* === 诊断结果里的评分块（9/20 design/76）===
   只显示官方 band descriptor 下真实评出的「语法」「词汇」两项 + 各自依据；
   流利度与发音明确标为「待录音」，绝不留给空白让人以为评过。
   旧口径数据没有 basis（评分依据），这里直接不显示分数块 —— 分数必须能自证。 */
function diagScoreHtml(j){
  if(!j || !j.score) return '';
  if(!j.score.grammar_basis && !j.score.vocabulary_basis) return '';
  const sc = parseScore(j.score);
  if(!sc || (sc.grammar == null && sc.vocabulary == null)) return '';
  const item = (v, lab, tail) =>
    '<div class="diag-score-item' + (tail === '（待录音）' ? ' pending' : '') + '">'
    + '<span class="diag-score-num">' + (v == null ? '—' : scoreLabel(v)) + '</span>'
    + '<span class="diag-score-lab">' + lab + (tail || '') + '</span></div>';
  // 9/22：流利度/发音取设置里她自填的固定分——填了就显示数字并标「自填」，没填才「待录音」
  const fSelf = (sc.fluency != null), pSelf = (sc.pronunciation != null);
  let h = '<div class="diag-sec"><b>官方标准评分</b><div class="diag-score">';
  h += item(sc.grammar, '语法');
  h += item(sc.vocabulary, '词汇');
  h += item(fSelf ? sc.fluency : null, '流利度', fSelf ? '（自填）' : '（待录音）');
  h += item(pSelf ? sc.pronunciation : null, '发音', pSelf ? '（自填）' : '（待录音）');
  h += '</div>';
  const b = sc.basis || {};
  if(b.grammar || b.vocabulary){
    h += '<div class="diag-score-basis">';
    if(b.grammar) h += '<div><b>语法</b>：' + escapeHtml(b.grammar) + '</div>';
    if(b.vocabulary) h += '<div><b>词汇</b>：' + escapeHtml(b.vocabulary) + '</div>';
    h += '</div>';
  }
  h += '<div class="diag-note">分数按 IELTS 官方 band 描述正向匹配给出（有错不等于低分，意思清楚就是 6 分档）。流利度与发音要听录音才评得准，纯文本评不了，所以这两项不给分。</div>';
  h += '</div>';
  return h;
}

/* === design/77「收进句型练习」（9/20）===
   诊断指出的语法/用词错误 → 一键收进句型页「我的语法错题」，之后在那里把它们改对。
   ⚠️ 手动收、不自动：AI 误判的错误一旦自动进练习库就是永久污染（她得逐条删）。
   落库位置 DATA.patternDrill.sentences.custom（随云同步），绝不写静态 data/sentences.json。 */
function diagCollectBar(errs, answer){
  if(!errs || !errs.length) return '';
  window.__DIAG_SEQ = (window.__DIAG_SEQ || 0) + 1;
  var seq = 'dg' + window.__DIAG_SEQ;
  window.__DIAG_ERRS = window.__DIAG_ERRS || {};
  window.__DIAG_ANS = window.__DIAG_ANS || {};
  window.__DIAG_ERRS[seq] = errs;
  window.__DIAG_ANS[seq] = answer || '';
  /* 按钮文案按「这次有几条是新的」实时算：都收过了就置灰，别让她重复点 */
  var fresh = (typeof sentCollectFresh === 'function') ? sentCollectFresh(errs, answer) : errs.length;
  var btn = '<button class="btn" type="button" data-diag-collect="' + seq + '"' + (fresh ? '' : ' disabled') + '>'
    + (fresh ? '＋ 收进句型练习（' + fresh + ' 处）' : '已在练习库里 ✓') + '</button>';
  return '<div class="diag-collect">' + btn
    + '<span class="diag-collect-tip">收进去之后，到「练习」tab 的「我的语法错题」里把它们改对</span></div>';
}
function bindDiagCollect(el){
  if(!el) return;
  var btn = el.querySelector('[data-diag-collect]');
  if(!btn) return;
  btn.onclick = function(){                      // onclick 单通道（照抄 pattern-drill 9/9 教训）
    var seq = btn.getAttribute('data-diag-collect');
    var errs = (window.__DIAG_ERRS || {})[seq] || [];
    var ans = (window.__DIAG_ANS || {})[seq] || '';
    if(typeof sentCollectErrors !== 'function'){ toast('句型练习模块还没加载，刷新一下'); return; }
    var r = sentCollectErrors(errs, ans, '口语诊断');
    if(!r.added){ toast('这 ' + r.total + ' 处已经收过啦'); return; }
    toast('已收进 ' + r.added + ' 条 →「练习」tab 的「我的语法错题」');
    btn.disabled = true;
    btn.textContent = '已收进 ' + r.added + ' 条 ✓';
  };
}

/* 9/22：「改进版表达」里把真正改过的片段标出来（她反馈「看不出到底哪个词搭配不当」）。
   拿清洗后 fix 的候选（"A / B" 多候选逐个试）在 rewrite 里做词边界匹配，命中就包 .diag-hl。
   重叠区间只留先命中的（长片段优先），其余原样转义输出，绝不改动文案本身。 */
function highlightRewriteHtml(rewrite, errs){
  const text = String(rewrite || '');
  if(!text) return '';
  const cands = [];
  (cleanErrors(errs) || []).forEach(e => {
    String(e.fix || '').split('/').forEach(part => {
      const t = String(part || '').trim();
      if(t && !/^[\s\-–—|,.;!?、；。]*$/.test(t)) cands.push(t);
    });
  });
  if(!cands.length) return escapeHtml(text);
  const low = text.toLowerCase();
  cands.sort((a, b) => b.length - a.length);
  const ranges = [];
  cands.forEach(c => {
    const cl = c.toLowerCase();
    let from = 0, idx;
    while((idx = low.indexOf(cl, from)) !== -1){
      const before = idx > 0 ? text[idx - 1] : ' ';
      const end = idx + c.length;
      const after = end < text.length ? text[end] : ' ';
      const okEdge = !/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after);
      const overlap = ranges.some(r => idx < r[1] && end > r[0]);
      if(okEdge && !overlap) ranges.push([idx, end]);
      from = idx + Math.max(1, c.length);
    }
  });
  if(!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  ranges.forEach(r => {
    out += escapeHtml(text.slice(pos, r[0]));
    out += '<span class="diag-hl">' + escapeHtml(text.slice(r[0], r[1])) + '</span>';
    pos = r[1];
  });
  return out + escapeHtml(text.slice(pos));
}

function renderDiag(el, j, raw, answer){
  normalizeScore(j, answer);
  const scoreHtml = diagScoreHtml(j);
  if(j && Array.isArray(j.errors)){
    const errs = cleanErrors(j.errors);
    let h = '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';
    if(j.rewrite) h += '<div class="diag-sec"><b>改进版表达</b><div class="diag-rewrite">' + highlightRewriteHtml(j.rewrite, errs) + '</div></div>';
    h += diagCollectBar(errs, answer);            // design/77：一键收进句型练习
    el.innerHTML = scoreHtml + h;
    bindDiagCollect(el);
  } else {
    el.innerHTML = scoreHtml + '<div class="diag-note">（AI 返回非标准格式，已贴原文）</div><pre>' + escapeHtml(raw || '') + '</pre>';
  }
  el.style.display = 'block';
}

// 「✨ AI 辅助」：按万能素材人设，一键生成 3-4 句英文回答（第1句表态 + 2-3句原因），填入作答框
async function generateAIHelper(id, qi){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }

  const li = document.querySelector('.sp-q[data-qi="' + qi + '"]');
  if(!li) return;
  const ta = li.querySelector('.sp-ans[data-qi="' + qi + '"]');
  const resultEl = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');
  const btn = li.querySelector('.sp-ai-helper[data-qi="' + qi + '"]');
  const questionText = (s.questions || [])[+qi] || '';
  if(!questionText){ toast('题目为空'); return; }
  const persona = buildPersonaContext();
  const btnHtml = btn ? btn.innerHTML : '';   // 修：缓存原 SVG 图标，finally 还原（与 diagnoseAnswer 同口径）

  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按你的人设生成思路和参考回答…</div>'; resultEl.style.display = 'block'; }

  try{
    const sys = '你是雅思口语陪练。考生目标口语 5.5 分：句子以简单句为主，词汇难度上限=高中词汇水平（如 important, enjoy, convenient, improve 这类常见词），严禁使用生僻词、学术词、GRE/雅思高级词汇（如 detrimental, paramount, facilitate 一律不行）；拿不准的词一律换成最简单的说法。\n'
      + '考生会给你一个 Part 1 问题和她的个人素材（人设/经历）。\n'
      + '【铁律：紧扣题目】先判断题目问的核心是什么（What kind of clothes=穿的衣服种类/风格/材质；How often=频率；Where=地点；Why=原因；Do you like=喜欢与否…）。逻辑链第一环、英文第 1 句都必须直接回答这个核心；后面的展开只能围绕这个核心补原因/细节。考生素材只是给理由加细节用的，绝不能把素材里的其他话题（如购物习惯、刷视频、打游戏）变成回答主体，更不能拿它们开头，否则就是答非所问。\n'
      + '请完成两件事：\n'
      + '1. 给一条中文「逻辑链」：只给 4-6 个简短的中文关键词组/短语，用中文横杠"—"串连。每个关键词组最多 6 个汉字，严禁写成完整句子，严禁加"表态：""原因1：""原因2：""细节：""感受："等任何前缀标签，严禁输出"[横杠]"这几个字。逻辑链第一环必须是题目所问的直接答案（如问穿什么衣服，第一环就写衣服类型，如「简单舒服—T恤牛仔裤—…」），严禁用别的行为（如「喜欢买衣服」）开头。\n'
      + '正确示例（题目：Is this city your permanent residence?）：杭州人—出生成长—家人朋友都在—杭州读大学—生活方便—熟悉每条街—归属感\n'
      + '错误示例（必须避免）：表态：是的，这里是…—原因1：我在这里出生…—原因2：我在杭州读大学…—细节：我熟悉…—感受：虽然…\n'
      + '逻辑链是给你自己提示思路的，不是写出来念给考官的，越短越好。\n'
      + '2. 按题目类型生成英文参考回答，一共 2-3 句，不要多：\n'
      + '   - 如果题目是一般疑问句（以 Do / Does / Are / Can / Have / Did / Would 等开头），第 1 句才用 Yes, I do. / No, not really. / Definitely. / To be honest, ... 这类表态开头。\n'
      + '   - 如果题目是特殊疑问句（以 What / Where / When / Why / Who / How long / How often / How many 等开头），**不要回答 Yes/No**，第 1 句直接给出事实答案（如 "I\'ve lived here for about 18 years." / "It\'s usually in the evening."），不要绕弯子。\n'
      + '   - 剩下的 1-2 句给原因或自然展开，把考生人设细节（身份/城市/爱好等）自然揉进回答，像真人聊天；但展开必须扣回题目核心，不能讲成另一个话题。\n'
      + '   - 答非所问反例（题目：What kind of clothes do you like to wear?）：把回答写成 "I\'m really into shopping, so I often buy new clothes when I watch short videos."——这是购物习惯，不是穿衣偏好，严禁这样写。正例："I usually wear simple and comfortable clothes, like T-shirts and jeans. I\'m a computer science student, so I sit in front of the computer a lot, and soft clothes help me relax."\n'
      + '「稍高级」示例（整段最多 1-2 处，仍须是高中常见词/句型）：like → be really into；good → enjoyable；可加一个 because/when 从句或 who/which 定语从句（如 the doctor who gave me medicine / a book which helps me relax）；可用 to be honest / actually / I\'d say 过渡。\n'
      + '【词汇难度红线】整段回答里每个词都必须是高中（含初中）学过的常见词；拿不准算不算超纲，就换成更简单的词。宁可朴素，绝不炫技。\n'
      + '要求：不要写复杂长句；参考回答不要超过 3 句；只使用素材里有的信息，不编造；输出严格 JSON：{"logicChain":"中文逻辑链","answer":"英文参考回答"}，不要任何解释文字。';
    const content = await callRelay('speaking_aihelper', [
      { role:'system', content: sys },
      { role:'user', content:'P1 题目：' + questionText + '\n\n考生个人素材：\n' + (persona || '（暂无素材，请用通用回答）') }
    ], 0.7);
    const j = aiJson(content);
    if(j && (j.answer || j.logicChain)){
      s.answers = s.answers || {};
      s.answers[qi] = s.answers[qi] || {};
      s.answers[qi].aiHelper = { answer: j.answer || '', logicChain: j.logicChain || '', ts: Date.now(), result: content };
      s.updatedAt = Date.now();
      hubSave();
      if(resultEl) renderAIHelper(resultEl, s.answers[qi].aiHelper);
    } else {
      if(resultEl) resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
  }catch(e){
    if(resultEl) resultEl.innerHTML = '<div class="diag-note">生成失败：' + escapeHtml(e.message) + '</div>';
  }finally{
    // 修：原用 textContent 写回 '✨ AI 辅助'，把按钮原有的 SVG 图标永久抹成表情文本；
    // 改为还原缓存的 innerHTML，与 diagnoseAnswer / reviewP3Answer 保持一致。
    if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }
  }
}

// 组装万能素材人设上下文（读 DATA.materials）
function buildPersonaContext(){
  const m = DATA.materials;
  if(!m) return '';
  const parts = [];
  const ansA = (m.answers && m.answers.A) ? String(m.answers.A).trim() : '';
  if(ansA) parts.push('人设（一句话介绍）：' + ansA);
  const p = m.persona;
  if(p){
    if(p.city) parts.push('城市：' + p.city);
    if(p.identity) parts.push('身份：' + p.identity);
    if(Array.isArray(p.values) && p.values.length) parts.push('价值观：' + p.values.join('、'));
    if(Array.isArray(p.traits) && p.traits.length) parts.push('性格：' + p.traits.join('、'));
  }
  const st = (m.materials || [])
    .map(x => (x.storyEn || '').slice(0, 500))
    .filter(Boolean);
  if(st.length) parts.push('可参考的小故事（素材英文，含从句，可直接引用）：\n' + st.join('\n---\n'));
  return parts.join('\n');
}

function renderAIHelper(el, ai){
  if(!el || !ai) return;
  let h = '';
  // 逻辑链：显示在作答框下方，照着讲
  if(ai.logicChain){
    h += '<div class="sp-logic"><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg>逻辑链</b><span class="sp-logic-text">' + escapeHtml(ai.logicChain) + '</span></div>';
  }
  // 英文参考回答：默认折叠，不自动填入作答框
  if(ai.answer){
    h += '<button class="sp-ref-toggle" type="button" data-ref>📄 查看参考英文（可展开）</button>'
      + '<div class="sp-ref-answer" data-ref-body>' + escapeHtml(ai.answer) + '</div>';
  }
  if(!h) h = '<div class="diag-note">（该题暂无 AI 辅助结果）</div>';
  el.innerHTML = h;
  el.style.display = 'block';
  // 展开 / 收起参考英文
  const t = el.querySelector('[data-ref]');
  const b = el.querySelector('[data-ref-body]');
  if(t && b) t.addEventListener('click', () => {
    const open = b.classList.toggle('open');
    t.textContent = open ? '🙈 收起参考英文' : '📄 查看参考英文（可展开）';
  });
}

/* === 万能素材生成器：已统一到 js/materials.js（口语页 MAT tab 与 materials.html 共用一份代码） ===
   置顶最熟 / 当季题库注入 / 覆盖矩阵 / 换季重映射 / 质检软门槛 全部在那份实现里。
   根治双副本漂移事故：此前本文件的独立副本吃不到 materials.js 的持续优化，用户在
   口语页「素材」tab 看到的仍是旧版（无换季横幅/置顶/矩阵）。materials.js 会自行把
   window.matGen.init 注册进 window.__hubRenderers（云同步合并后无缝重渲染）。 === */

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

    // 已完成小结（9/16 修：评分机制关闭后 bestOfQuestion 恒为 null，这块永远不显示——
    // 改用 countOfQuestion（历史提交条数）判定「练过」，与列表 badge 同一口径）
    var rows = '';
    for(var j = 0; j < n; j++){
      var best = bestOfQuestion(s.answers[j]);
      var cnt = countOfQuestion(s.answers[j]);
      if(best == null && !cnt) continue;
      rows += '<div class="sp-flow-drow" data-i="' + j + '">'
        + '<span class="sp-flow-dnum">' + (j + 1) + '</span>'
        + '<span class="sp-flow-dtext">' + escapeHtml((s.questions[j] || '').slice(0, 30)) + '</span>'
        + '<span class="sp-flow-dscore">' + (best != null ? scoreLabel(best) + '分' : '练过' + cnt + '次') + '</span>'
        + '</div>';
    }
    if(rows){
      done.hidden = false;
      done.innerHTML = '<div class="sp-flow-dhead"><span>已完成</span><button class="sp-flow-dtoggle" type="button">展开 / 收起</button></div>'
        + '<div class="sp-flow-dbody">' + rows + '</div>';
      done.querySelectorAll('.sp-flow-drow').forEach(function(row){
        row.addEventListener('click', function(){ cur = +row.dataset.i; render(); });
      });
      var t = done.querySelector('.sp-flow-dtoggle');
      var b = done.querySelector('.sp-flow-dbody');
      t.addEventListener('click', function(e){ e.stopPropagation(); b.classList.toggle('open'); });
    } else {
      done.hidden = true;
    }

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

/* ======= 口语自动计时接入「计时」模块（9/22，照搬 practice.js 背词自动计时同款）=======
   用户常忘记开计时：开口语页即自动开一个「口语」计时（moduleId 与 data.js MODULES 的 speaking 一致），
   离页/切后台/关标签时结算进 DATA.sessions（首页「今日学习时长」与计时页都读它）。
   规则与 9/16 之之定版一致：已有别的模块在计 → 先正规结算前一个再开新表，绝不丢表、绝不双开。 */
const SPK_TIMER_MODULE = 'speaking';
const SPK_TIMER_NAME = '口语';
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
    const o = getOnboarding();
    const guided = o ? (o.account !== 'done')
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
