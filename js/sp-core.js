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
