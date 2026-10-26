/* ==========================================================================
   sp-core.js · 口语页「筛选与频次」工具域（T-009 S-1 从 js/speaking.js 原样搬出）
   --------------------------------------------------------------------------
   来源区块：方案 §1.2 的 C 区（原 552-613 行，现 572-633）
   函数：populateFreqOptions / getFiltered / freqTag / refreshStateOptions

   🔴 只换文件住址，函数体一个字没改（T-009 红线）。
   🔴 文件里所有顶层声明一律用 var / function 声明 —— 软导航用 window.eval 逐文件重跑，
      const 只活在那一次 eval 的词法作用域，到了别的文件里就是 undefined（见 js/speaking.js 顶部注释）。
   依赖：curType/curFreq/curCat/curPart/curState/curSearch（全局 var，见 speaking.js 顶部）、
        freqRank（A 区，仍在 speaking.js）、getPracticeCount（sp-stats.js）
   ========================================================================== */



/* ==========================================================================
   T-009 S-7（10-26）：A 区（入口状态与工具函数）从 js/speaking.js 原样并入本文件。
   含：8 个状态 var（curType/curFreq/curCat/curPart/curState/curSearch/curDetailId/__SP_DRAFT_T）
      + FREQ_ORDER / SP_FREQ_GROUPS / SP_ICONS 三个常量
      + __clearP2Timer / spDraftSave / freqRank / spAutoGrow / spAutoGrowAll
      / renderFreqBanner / spRandomPick 七个函数。
   依赖收口：sp-core 自己的 getFiltered 此前依赖「隔壁文件」的 freqRank（eval 作用域其实看不见），
   本批并入后同文件可见，依赖链归零。ready() 主编排仍留在入口（方案 §五红线）。
   ========================================================================== */
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

// 优先级下拉选项（P1/P2 共用）：超高频>高频>中频>低频
function populateFreqOptions(){
  const sel = $('#freqSelect');
  if(!sel) return;
  const opts = [['all','全部'],['ultra','必考题'],['high','高频'],['medium','中频'],['low','低频']];
  sel.innerHTML = opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('');
  curFreq = 'all';
}

function getFiltered(){
  // 仅展示纯题目：剔除框架母本（带 framework 字段 / id 形如 sp_p[12]_*）；curType='ALL' 为题库 tab（P1+P2 合并）
  let list = DATA.speaking.filter(s => (curType === 'ALL' || s.type === curType) && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
  if(curFreq !== 'all') list = list.filter(s => s.frequency === curFreq);
  if(curCat !== 'all') list = list.filter(s => s.category === curCat);
  if(curPart !== 'all') list = list.filter(s => s.type === curPart);
  // design/88：练习状态筛选（getPracticeCount 是函数声明有提升）
  if(curState !== 'all') list = list.filter(s => (getPracticeCount(s) > 0) === (curState === 'done'));
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

/* design/88：状态下拉选项带题数。
   题数口径：按「当前其他筛选（类型/优先级/分类/Part）已生效后」的剩余池统计，
   不含 curState 自身（否则选了「未练过」后列表只剩 new，done 永远显示 0 就没意义了）。
   跟随 renderList 调用，Part/优先级/分类切换时自动刷新。 */
function refreshStateOptions(){
  const sel = $('#stateSelect');
  if(!sel) return;
  // 复刻 getFiltered 但跳过 curState 过滤
  let pool = DATA.speaking.filter(s => (curType === 'ALL' || s.type === curType) && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''));
  if(curFreq !== 'all') pool = pool.filter(s => s.frequency === curFreq);
  if(curCat !== 'all') pool = pool.filter(s => s.category === curCat);
  if(curPart !== 'all') pool = pool.filter(s => s.type === curPart);
  let nDone = 0, nNew = 0;
  pool.forEach(s => { if(getPracticeCount(s) > 0) nDone++; else nNew++; });
  const oNew = sel.querySelector('option[value="new"]'), oDone = sel.querySelector('option[value="done"]');
  if(oNew) oNew.textContent = '未练过（' + nNew + ' 题）';
  if(oDone) oDone.textContent = '已练过（' + nDone + ' 题）';
}

function tagsHtml(s){
  let html = '';
  if(curType === 'ALL' && s.type) html += '<span class="sp-tag sp-tag-p">' + (s.type === 'P1' ? 'P1' : 'P2') + '</span>';
  /* 10/3 B 版：超高频/high 标签不再逐行显示 —— 分组面板的组标题已经说了「超高频 / 高频」，
     行内重复是视觉噪音。频次改由左侧色条 + 分组归属表达。medium/low 组内仍标（区分中频/低频）。 */
  if(s.frequency && s.frequency !== 'ultra' && s.frequency !== 'high') html += freqTag(s.frequency);
  if(s.category) html += '<span class="sp-tag">' + escapeHtml(s.category) + '</span>';
  if(s.framework) html += '<span class="sp-tag">' + escapeHtml(s.framework) + '</span>';
  return html;
}
