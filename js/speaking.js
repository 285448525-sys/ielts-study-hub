/* === 口语题库（极简版） === */
var curType = 'P1';
var curFreq = 'all';
var curCat = 'all';
var curSearch = '';
var curDetailId = null;
var FREQ_ORDER = { P1:{must:0, high:1, mid:2, low:3}, P2:{high:0, subhigh:1, mid:2, low:3} };
function freqRank(f){ const t = FREQ_ORDER[curType] || FREQ_ORDER.P1; return (t[f] != null) ? t[f] : 9; }

/* 顶部常量用 var（speaking.js 会被软导航 window.eval 重跑，const 会抛「已声明」） */
var SYS_DIAG = `你是一位雅思口语纠错助手。你的唯一任务：找出考生回答里真正的「语法错误」和「用词错误」，并给出正确写法。不要评分、不要输出任何分数。

【只检查这两类错误】
1. 语法错误（grammar）：动词形式/时态、主谓一致、冠词、介词、代词、语序、连写句、片段句等真正影响理解的问题。
2. 用词错误（vocabulary）：词性误用、搭配错误、词义混淆、用了不合适的词导致意思不对或表达别扭。

【100% 不算错误，必须忽略】
- 大小写（句首小写、And/But/So 大写等）
- 标点符号（缺逗号句号、逗号变句号等语音转写瑕疵）
- 口语填充词（well, you know, like, actually）
- 自然口语省略（如 "Think it's good" 在口语中可接受）
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
  ]
}
没有错误时返回 {"errors":[]}。

【示例】
输入: "We are got a big mirror. I leave in my house every day."
输出: {"errors":[{"original":"We are got","corrected":"We have got / We've got","type":"grammar","explanation":"没有 are got 结构，拥有用 have got"},{"original":"leave in my house","corrected":"leave my house","type":"grammar","explanation":"leave 是及物动词，不需要介词 in"}]}`;

/* 录音 / 转写功能已移除：口语只保留「文本框手写 + AI 纠错 + 提交记录」。现已关闭 P1/P2 评分机制，诊断只返回语法/用词错误，不输出任何分数。 */

// P2 专用诊断提示词（语法纠错 + 串题素材连接；复用 SYS_DIAG 通用规则，追加 P2 专属要求）
var SYS_DIAG_P2 = SYS_DIAG
  + `

【Part 2 要求】考生做约 2 分钟连续陈述，允许更多从句和连接词。仍只找语法/用词错误，不评分。

`
  + `【串题素材连接(storyLink)】考生会提供已准备的万能素材（见用户消息末尾）。若本题可套用其中某个素材，请在 JSON 末尾额外返回 "storyLink" 字段（中文，2-4 行，说明可怎么把素材嵌入本题回答）。无合适素材则不返回该字段。

`
  + `【输出格式补充】上述 JSON 的 "errors" 数组外，可额外包含可选字段："storyLink": "可套用的万能素材连接建议（中文；无合适素材则省略）"。`;

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
      $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true; $('#progressView').hidden = true;
      if(t === 'MOCK'){
        $('#mockView').hidden = false;
      } else if(t === 'MAT'){
        $('#matView').hidden = false;
        if(typeof matGen !== 'undefined' && matGen.init) matGen.init();
      } else if(t === 'PROGRESS'){
        $('#progressView').hidden = false;
        if(typeof renderProgress === 'function') renderProgress();
      } else {
        curType = t;
        populateFreqOptions();
        const cs = $('#catSelect'); if(cs) cs.value = 'all';
        curCat = 'all';
        $('#listView').hidden = false;
        renderList();
      }
    });
  });
  const freqSel = $('#freqSelect'), catSel = $('#catSelect');
  if(freqSel) freqSel.addEventListener('change', e => { curFreq = e.target.value; renderList(); });
  if(catSel) catSel.addEventListener('change', e => { curCat = e.target.value; renderList(); });
  populateFreqOptions();
  $('#spSearch').addEventListener('input', () => { curSearch = $('#spSearch').value.trim().toLowerCase(); renderList(); });
  $('#backBtn').addEventListener('click', () => { $('#detailView').hidden = true; $('#listView').hidden = false; curDetailId = null; });
  renderList();
});

// 优先级下拉选项随 Part1/Part2 联动：P1 必考题>高频>中频>低频；P2 高频>次高频>中频>低频
function populateFreqOptions(){
  const sel = $('#freqSelect');
  if(!sel) return;
  const opts = (curType === 'P2')
    ? [['all','全部'],['high','高频'],['subhigh','次高频'],['mid','中频'],['low','低频']]
    : [['all','全部'],['must','必考题'],['high','高频'],['mid','中频'],['low','低频']];
  sel.innerHTML = opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('');
  curFreq = 'all';
}

function getFiltered(){
  let list = DATA.speaking.filter(s => s.type === curType);
  if(curFreq !== 'all') list = list.filter(s => s.frequency === curFreq);
  if(curCat !== 'all') list = list.filter(s => s.category === curCat);
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
  if(s.frequency) html += freqTag(s.frequency);
  if(s.category) html += '<span class="sp-tag">' + escapeHtml(s.category) + '</span>';
  if(s.framework) html += '<span class="sp-tag">' + escapeHtml(s.framework) + '</span>';
  return html;
}

// === 口语分数解析与展示 ===
function parseScore(score){
  if(!score) return null;
  const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  const fluency = n(score.fluency);
  const vocabulary = n(score.vocabulary);
  const grammar = n(score.grammar);
  // 发音：只取设置里的固定分（发音评测已移除，不再用 AI / 讯飞测）；未设则不计发音
  const pronunciation = (DATA.settings.pronunciationScore != null) ? Number(DATA.settings.pronunciationScore) : null;
  // 总分：雅思四维度（流利度与连贯、词汇、语法、发音）平均；发音缺失则用前三维度平均
  const dims = [fluency, vocabulary, grammar].filter(v => v != null);
  if(pronunciation != null) dims.push(pronunciation);
  const overall = dims.length ? Math.round(dims.reduce((a, b) => a + b, 0) / dims.length * 2) / 2 : null;
  return { overall, fluency, pronunciation, vocabulary, grammar };
}
// 某小题的历史最高分：遍历每次诊断/提交记录取最高（用户规则：同一题反复刷分取最高值）；
// 老数据没有 records 时回退到当前 score 字段
function bestOfQuestion(a){
  if(!a) return null;
  let best = null;
  (a.records || []).forEach(r => {
    if(r && r.score && r.score.overall != null){
      const v = parseFloat(r.score.overall);
      if(!isNaN(v) && (best === null || v > best)) best = v;
    }
  });
  if(best === null && a.score && a.score.overall != null){
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
/* === 练习次数统计（评分机制关闭后专用）===
   评分机制已关闭，不再有历史最高分/平均分。外面列表改为显示「练过几次」。
   P1 的 4 小题只要有任一题有 records，就算「练过 1 次」，并显示已完成小题数。
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
function getAggScore(s){
  if(!s || !s.answers) return null;
  // 评分机制已关闭：不再聚合平均分/最高分，列表处统一返回 null，让 badge 只显示练过次数
  return null;
}
function scoreLabel(v){ return v == null ? '-' : (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1); }
function scoreBadgeHtml(score, count, s){
  // 评分关闭后：只显示练过次数；若分数仍存在（老数据/评分恢复）则保留原逻辑
  if(score == null){
    if(!count) return '';
    if(s && s.type === 'P1'){
      const done = getP1Done(s);
      const label = done === 4 ? '练过1次' : '练过1次（' + done + '/4 小题）';
      return '<span class="sp-score-badge practice">' + label + '</span>';
    }
    const label = count > 1 ? '练过' + count + '次' : '练过1次';
    return '<span class="sp-score-badge practice">' + label + '</span>';
  }
  const cls = score >= 5.5 ? 'sp-score-badge good' : (score >= 5 ? 'sp-score-badge ok' : 'sp-score-badge low');
  let label;
  if(s && s.type === 'P1'){
    const done = getP1Done(s);
    label = '平均 ' + scoreLabel(score) + '分 · 练过1次' + (done < 4 ? '（' + done + '/4 小题）' : '');
  } else {
    const times = count > 1 ? ' · 练过' + count + '次' : '';
    label = (score >= 5.5 ? '✅ ' : '') + '最高 ' + scoreLabel(score) + '分' + times;
  }
  return '<span class="' + cls + '">' + label + '</span>';
}
function scoreHeaderHtml(score, title){
  if(!score || score.overall == null) return '';
  const dims = [
    {k:'fluency',l:'流利度'},
    {k:'vocabulary',l:'词汇'},
    {k:'grammar',l:'语法'}
  ];
  if(score.pronunciation != null) dims.push({k:'pronunciation',l:'发音(固定)'});
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

// 诊断/评分保存后，同步更新列表 badge 与详情页头部分数
function refreshScoreAfterDiag(s){
  if(!s) return;
  renderList();
  const bestEl = document.querySelector('.sp-detail-best');
  if(bestEl){
    const bestScore = getAggScore(s);
    if(bestScore != null){
      bestEl.textContent = (s.type === 'P1' ? 'P1 平均分' : '历史最高') + '：' + scoreLabel(bestScore) + '分';
    }
  }
}

function openDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  curDetailId = id;
  $('#listView').hidden = true;
  $('#detailView').hidden = false;

  const title = s.titleEn || s.title || '';
  const zh = s.titleZh || '';
  let html = '<div class="sp-detail-title">' + escapeHtml(title) + '</div>';
  if(zh) html += '<div class="sp-detail-zh">' + escapeHtml(zh) + '</div>';
  html += '<div class="sp-detail-tags">' + tagsHtml(s) + '</div>';
  const bestScore = getAggScore(s);
  if(bestScore != null) html += '<div class="sp-detail-best">' + (s.type === 'P1' ? 'P1 平均分' : '历史最高') + '：' + scoreLabel(bestScore) + '分</div>';

  // P1 问题列表（逐题可点开 + 录 + 诊断）
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<div class="sp-q-list-head">Part 1 小问题（一题一卡，答完点「下一题」）</div>';
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i, s); });
    html += '</ol>';
  }

  // P2 单窗口答题（不分小问题，一次性作答 2 分钟）
  if(s.type === 'P2'){
    if(s.promptEn) html += '<div class="sp-prompt">题目：' + escapeHtml(s.promptEn) + '</div>';
    if(s.promptZh) html += '<div class="sp-detail-zh" style="margin-bottom:12px">' + escapeHtml(s.promptZh) + '</div>';
    html += '<div class="sp-mat-hint" id="spMatHint"></div>';

    html += '<div class="sp-p2-answer">';
    html += '<textarea class="sp-ans" id="p2Ans" placeholder="在这里写下你的 Part 2 回答（目标写满 2 分钟的内容）…"></textarea>';
    html += '<div class="sp-logic" id="p2LogicBar" hidden><b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg>本题逻辑链</b><span class="sp-logic-text"></span></div>';
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 2l2.4 5.1 5.6.8-4 4.1 1 5.6-5-2.7-5 2.7 1-5.6-4-4.1 5.6-.8z"/></svg>AI 纠错</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '<div class="sp-rec-list" id="p2Records"></div>';
    html += '</div>';
  }

  // P2 串题思路 + 完成/下一题：并排同一行（左侧 = AI 串题思路，右侧 = 完成 + 下一题）
  if(s.type === 'P2'){
    html += '<div class="sp-detail-actions" style="margin-top:8px">';
    html += '<button class="btn btn-primary" id="aiStoryLinkBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>AI 串题思路</button>';
    html += '<button class="btn btn-med" id="p2FinishBtn" style="margin-left:auto">完成</button>';
    html += '<button class="btn btn-primary" id="p2NextBtn" style="margin-left:8px">下一题 →</button>';
    html += '</div>';
  }
  html += '<div class="sp-ai-result" id="aiResult"></div>';

  // 底部动作区：P1 = 保存/删除/下一话题（P2 的动作已合并到上方 AI 串题思路同一行）
  html += '<div class="sp-detail-actions">';
  if(s.type === 'P1'){
    html += '<button class="btn btn-primary" id="saveBtn">保存</button>';
    html += '<button class="btn btn-danger" id="delSpBtn">删除此题</button>';
    html += '<button class="btn btn-med" id="nextTopicBtn" style="margin-left:auto">下一个话题 →</button>';
  }
  html += '</div>';

  $('#detailBody').innerHTML = html;

  // 绑定事件
  const saveBtn = $('#saveBtn');
  if(saveBtn) saveBtn.addEventListener('click', () => saveDetail(id));
  if(s.type === 'P1'){
    const nextTopicBtn = document.getElementById('nextTopicBtn');
    if(nextTopicBtn) nextTopicBtn.addEventListener('click', () => gotoNextTopic());
  }
  const delSpBtn = document.getElementById('delSpBtn');
  if(delSpBtn) delSpBtn.addEventListener('click', () => {
    if(confirm('确定删除这个口语题？删除后默认题库升级也不会再恢复它。')) deleteSpeaking(id);
  });
  if(s.type === 'P1'){
    const nextTopicBtn = document.getElementById('nextTopicBtn');
    if(nextTopicBtn) nextTopicBtn.addEventListener('click', () => gotoNextTopic());
  } else if(s.type === 'P2'){
    // P2：完成 = 返回列表；下一题 = 跳到筛选列表的下一道（沿用现有 gotoNextTopic）
    const fin = $('#p2FinishBtn');
    if(fin) fin.addEventListener('click', () => {
      $('#listView').hidden = false;
      $('#detailView').hidden = true;
      renderList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    const nx = $('#p2NextBtn');
    if(nx) nx.addEventListener('click', () => gotoNextTopic());
    // 回填上次保存的「AI 串题方案」（参考英文 + 本题逻辑链），无需用户再点一次生成按钮
    if(s.answers && s.answers.p2 && s.answers.p2.aiStoryLink){
      try{
        const saved = s.answers.p2.aiStoryLink;
        const resultEl = $('#aiResult');
        if(resultEl && (saved.article || saved.logicChain)){
          renderStoryLink(resultEl, { article: saved.article || '', logicChain: saved.logicChain || '' });
        }
      }catch(_){}
    }
  }
  if(s.type === 'P2'){
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => aiStoryLink(id));
    matHint(s);
  }

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);

  // 26 · P1 问答流：一题一卡 + 进度 + 步进（只影响 P1 详情显示，不动数据）
  if(s.type === 'P1') p1FlowInit(s);

  // P2 单窗口事件绑定（仅手写 + AI 纠错 + 提交记录；无录音）
  if(s.type === 'P2'){
    const p2Diag = document.getElementById('p2Diag');
    if(p2Diag) p2Diag.addEventListener('click', e => { e.stopPropagation(); diagnoseP2(id); });
    const p2Clear = document.getElementById('p2Clear');
    if(p2Clear) p2Clear.addEventListener('click', e => {
      e.stopPropagation();
      const ta = $('#p2Ans'); if(ta) ta.value = '';
      const res = $('#p2Result'); if(res){ res.innerHTML = ''; res.style.display = 'none'; }
      // 仅清空当前编辑框与诊断结果，不删历史提交记录
    });


    // P2 答案回填
    if(s.answers && s.answers.p2){
      const ta = $('#p2Ans');
      if(ta && s.answers.p2.text) ta.value = s.answers.p2.text;
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
      // 回填 AI 串题方案
      if(s.answers.p2.aiStoryLink){
        renderStoryLink($('#aiResult'), s.answers.p2.aiStoryLink);
      }
    }
    // 渲染 P2 提交历史记录
    renderSubmitRecords((s.answers.p2 && s.answers.p2.records) || [], $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null) ta.value = rec.text;
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j = JSON.parse(rec.result); if(renderP2Diag(res, j, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));
  }
}

/* === P1 详情页「下一题」：跳到当前筛选列表里的下一道 P1 话题 ===
   沿用用户刚筛选的条件（curFreq/curCat/curSearch），到末尾循环回第一道，方便连续练。 */
function gotoNextTopic(){
  const list = getFiltered();
  if(!list.length) return;
  const idx = list.findIndex(s => s.id === curDetailId);
  if(idx === -1){ openDetail(list[0].id); return; }   // 当前题不在筛选结果里（如刚改了筛选）→ 打开第一条
  const nextIdx = (idx + 1) % list.length;
  openDetail(list[nextIdx].id);
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
  }
  s.updatedAt = Date.now();
  hubSave();
  toast('已保存');
}

/* === 删除口语题（记录到黑名单，题库升级不再恢复）=== */
function deleteSpeaking(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  DATA.speaking = DATA.speaking.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  s.updatedAt = Date.now();
  hubSave();
  $('#detailView').hidden = true;
  $('#listView').hidden = false;
  curDetailId = null;
  renderList();
  toast('已删除该口语题（不再被默认题库恢复）');
}

/* === 素材生成器联动：P2 抽题命中个人素材 → AI 自动匹配串题方案 === */
function matLoadStore(){
  if(DATA.materials && Array.isArray(DATA.materials.materials)) return DATA.materials;
  try{ const s = JSON.parse(localStorage.getItem('ielts_materials_v1')); if(s && Array.isArray(s.materials)) return s; }catch(_){}
  return null;
}

function matHint(s){
  const el = document.getElementById('spMatHint'); if(!el) return;
  const store = matLoadStore();
  const n = (store && store.materials) ? store.materials.length : 0;
  if(n === 0){
    el.innerHTML = '<span class="muted">还没生成万能素材，先在上方「万能素材」tab 填问卷生成。</span>';
  } else {
    el.innerHTML = '<span class="muted">已加载 ' + n + ' 个万能素材，点击下方「🔀 AI 串题思路」自动匹配这道题。</span>';
  }
}

async function aiStoryLink(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }

  const store = matLoadStore();
  if(!store || !store.materials || !store.materials.length){
    toast('还没有万能素材，先去「万能素材」页生成');
    return;
  }

  const resultEl = $('#aiResult');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div class="diag-note">正在根据你的万能素材库自动匹配串题方案…</div>';

  try{
    const matsText = store.materials.map((m, i) =>
      '【素材 ' + (i + 1) + '：' + (m.title || '未命名') + '】\n' +
      '英文可背故事：' + (m.storyEn || '') + '\n' +
      '中文逻辑链：' + (m.logicZh || '') + '\n' +
      '可套题族（搭边也行）：' + (m.coverage || []).map(c => c.topic + (c.fit === 'loose' ? '(搭边:' + c.note + ')' : '')).join('、')
    ).join('\n---\n');

    const sys = '你是雅思口语 P2 串题助手。考生有一份"万能故事库"（多条来自真实经历的小故事，每条含：英文可背故事、中文逻辑链、可套题族）。\n' +
      '当前是一道具体的 P2 题。请：\n' +
      '1. 扫描全部故事，找出**能用来答这题的细节**（可跨多条故事组合，不限单条；只要能用的细节都拼进来）。\n' +
      '2. 把这些细节**拼成一篇英文参考回答**（简单句为主，契合口语 5.5，长度适配该题、不要过长）。开头用一句通用开头（如 "I\'d like to talk about..." 什么题都能接），结尾用一句收束，**开头句和结尾句都直接写进参考英文里**，让它读起来是一篇完整的回答。注意：这不是让考生照抄——大部分内容考生会用自己的话说，只有少量句子（尤其开头/结尾）才直接借用。\n' +
      '3. 给这道 P2 题专属的「逻辑链」：用若干中文关键词以 "—"（中文横杠/破折号）串接，把本题要讲的步骤、细节、感受都铺开——越长越细越好、数量不固定，严禁输出 "[横杠]" 这几个字。\n' +
      '输出严格 JSON：{"article":"拼接的英文参考回答（含开头和结尾句）","logicChain":"关键词—关键词（用中文横杠隔开，越长越细越好）"}，不要任何解释文字。';

    const user = 'P2 题目：' + (s.promptEn || s.title || '') +
      '\n中文题意：' + (s.promptZh || '') +
      '\nYou should say: ' + ((s.youShouldSay || []).join('; ')) +
      '\n\n考生的万能素材库：\n' + matsText;

    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);

    if(j && (j.article || j.logicChain)){
      s.answers = s.answers || {};
      s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.aiStoryLink = { ...j, ts: Date.now(), raw: content };
      s.updatedAt = Date.now();
      hubSave();
      renderStoryLink(resultEl, j);
    } else {
      resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
  }catch(e){
    resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
  }
}

function renderStoryLink(el, j){
  if(!el) return;
  // 同步逻辑链到 P2 作答框正下方（照着讲）
  const lb = document.getElementById('p2LogicBar');
  if(lb){
    const txt = lb.querySelector('.sp-logic-text');
    if(j.logicChain && txt){
      txt.textContent = j.logicChain;
      lb.hidden = false;
    } else {
      lb.hidden = true;
    }
  }
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 AI 串题方案（跨故事拼细节）</div>';
  if(j.article) h += '<div class="mat-plan-sec"><b>① 参考英文（自己话讲，开头结尾已包含）</b><div class="mat-story-en">' + escapeHtml(j.article) + '</div></div>';
  if(j.logicChain) h += '<div class="mat-plan-sec"><b>② 本题逻辑链</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
  h += '<div class="mat-plan-tips">💡 方案根据你的万能故事库跨故事拼细节生成；点「🔀 AI 串题思路」可重新生成。</div>';
  h += '</div>';
  el.innerHTML = h;
}

/* === 逐题展开 + 语音输入 + AI 语法诊断 === */

// 单题可点开项 HTML（text=可见文本，qi=题目索引）
function questionItemHtml(text, qi, s){
  const ans = (s && s.answers) ? s.answers[qi] : null;
  return '<li class="sp-q" data-qi="' + qi + '">'
    + '<span class="sp-q-caret">▸</span>'
    + '<span class="sp-q-text">' + escapeHtml(text) + '</span>'
    + ttsBtnHtml()
    + '<div class="sp-q-panel" data-qi="' + qi + '" hidden>'
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
        if(ta && rec.text != null) ta.value = rec.text;
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

    // 点开 / 收起
    li.addEventListener('click', e => {
      if(e.target.closest('.sp-q-panel')) return;
      if(e.target.closest('.sp-tts')) return;
      const panel = li.querySelector('.sp-q-panel[data-qi="' + qi + '"]');
      if(!panel) return;
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      li.classList.toggle('open', willOpen);
      const caret = li.querySelector('.sp-q-caret');
      if(caret) caret.classList.toggle('open', willOpen);
      // 进入（展开）一道小问题时自动朗读一次
      if(willOpen){
        const txt = li.querySelector('.sp-q-text');
        if(txt && txt.textContent.trim()) speakQuestion.speak(txt.textContent.trim(), tts);
      }
    });

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
      if(ta) ta.value = '';
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
      const ta = $('#p2Ans'); if(ta && rec.text != null) ta.value = rec.text;
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
      if(ta && rec.text != null) ta.value = rec.text;
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
    const newScore = null;
    s.answers[qi] = { ...oldAns, text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers[qi].records = s.answers[qi].records || [];
    s.answers[qi].records.push({ text: answerText, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
  }catch(e){
    if(resultEl){
      resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '\n\n请检查「设置」中的 AI 接口地址。</div>';
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
  let h = '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';   // 评分机制已关闭（P2 仅展示语法/用词错误 + 串题建议，不再显示分数）
  if(j.rewrite) h += '<div class="diag-sec"><b>改进建议</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
  if(j.storyLink) h += '<div class="diag-sec"><b>📌 串题素材连接</b><div class="diag-note">可以用你已准备的这些万能素材来回答这道题：</div>' + escapeHtml(j.storyLink) + '</div>';
  el.innerHTML = h;
  return true;
}

// P2 AI 纠错：语法纠错 + 串题素材连接建议
async function diagnoseP2(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const answer = ($('#p2Ans') || {}).value.trim();
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
    const newScore = null;
    s.answers.p2 = { text: answer, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers.p2.records = s.answers.p2.records || [];
    s.answers.p2.records.push({ text: answer, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    s.updatedAt = Date.now();
    hubSave();
    refreshScoreAfterDiag(s);
    // 刷新 P2 提交历史列表
    renderSubmitRecords(s.answers.p2.records, $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null) ta.value = rec.text;
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j2 = JSON.parse(rec.result); if(renderP2Diag(res, j2, rec.text)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    }, (i) => removeSubmitRecord(s, 'p2', i));

  }catch(e){
    resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
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
    } else if(j < wb.length && (i === wa.length || dp[i][j+1] >= dp[i+1][j])){
      out.push({type:'ins', text: wb[j]}); j++;
    } else if(i < wa.length){
      out.push({type:'del', text: wa[i]}); i++;
    }
  }
  return out;
}

// 在原句中 inline 标出修改：完整原句放中间，只划掉错误词，箭头+正确词写旁边，不加说明
function diffSentenceHtml(answer, errs){
  const ans = String(answer || '').trim();
  const clean = cleanErrors(errs);
  const broken = hasObviousGrammarIssues(answer);
  if(!clean.length && !broken) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  if(!clean.length && broken) return '<div class="diag-warn">句子有明显语法问题（如缺 be 动词/时态/成分残缺），但 AI 未具体指出。建议重读原句或手动检查。</div>';
  if(!ans) return inlineErrorsHtml(clean);

  // 按 original 在原句中出现位置排序，从后往前替换，避免偏移
  const reps = [];
  clean.forEach(e => {
    const orig = String(e.original || '');
    const fix = String(e.fix || '');
    if(!orig || !fix) return;
    const idx = ans.toLowerCase().indexOf(orig.toLowerCase());
    if(idx === -1) return;
    const parts = wordDiff(orig, fix);
    let html = '';
    let prevType = null;
    parts.forEach(p => {
      if(prevType && prevType !== 'same' && p.type !== 'same') html += ' ';
      if(p.type === 'same') html += (html ? ' ' : '') + escapeHtml(p.text);
      if(p.type === 'del') html += (html ? ' ' : '') + '<s class="diag-wrong">' + escapeHtml(p.text) + '</s>';
      if(p.type === 'ins') html += (html ? ' ' : '') + '<span class="diag-arrow">→</span><span class="diag-right">' + escapeHtml(p.text) + '</span>';
      prevType = p.type;
    });
    reps.push({idx, len: orig.length, html});
  });

  if(!reps.length) return inlineErrorsHtml(clean);
  reps.sort((a, b) => b.idx - a.idx);
  let html = ans;
  reps.forEach(r => {
    html = html.slice(0, r.idx) + r.html + html.slice(r.idx + r.len);
  });
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

// AI 没报 errors 但 rewrite 大变 → 说明它在隐瞒错误
function rewriteLooksSuspicious(answerText, rewriteText){
  const a = String(answerText || '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const r = String(rewriteText || '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if(!a.length || !r.length) return false;
  // 计算 rewrite 中有多少 token 出现在原句中
  const aSet = new Set(a);
  const common = r.filter(tok => aSet.has(tok)).length;
  const ratio = common / r.length;
  // 如果 rewrite 超过 40% 的词是原句没有的，且 rewrite 不短，认为可疑
  return r.length >= 5 && ratio < 0.6;
}

// 强制评分兜底（用户规则）：无真错误 → 语法/词汇 ≥6.0；有错但 AI 能听懂（能列出错误=已读懂） → ≥5.5
function normalizeScore(j, answerText, rewriteText){
  if(!j || !j.score) return j;
  const errs = cleanErrors(j.errors);
  let broken = hasObviousGrammarIssues(answerText);
  // 没报错但 rewrite 大变 = 偷偷改了没说
  if(!broken && errs.length === 0 && rewriteLooksSuspicious(answerText, rewriteText || j.rewrite)) broken = true;

  // 能给出评分 = AI 听懂了 → 流利度不低于 5.5（用户说"能明白意思就有5.5"）
  if(j.score.fluency != null && Number(j.score.fluency) < 5.5) j.score.fluency = 5.5;

  // 真无错且文本没有明显破洞、rewrite 也没偷偷大改 → 语法/词汇至少 6
  // 否则 → 至少 5.5；如果 AI 漏报/隐瞒，封顶 5.5 防止它装瞎给 6
  if(errs.length === 0 && !broken){
    if(j.score.grammar != null && Number(j.score.grammar) < 6) j.score.grammar = 6;
    if(j.score.vocabulary != null && Number(j.score.vocabulary) < 6) j.score.vocabulary = 6;
  } else {
    if(j.score.grammar != null){
      const g = Number(j.score.grammar);
      j.score.grammar = g < 5.5 ? 5.5 : (broken && g > 5.5 ? 5.5 : g);
    }
    if(j.score.vocabulary != null){
      const v = Number(j.score.vocabulary);
      j.score.vocabulary = v < 5.5 ? 5.5 : (broken && v > 5.5 ? 5.5 : v);
    }
  }
  return j;
}

// 渲染 inline 笔记式纠错（fallback：无法定位原句时使用）
function inlineErrorsHtml(errs){
  if(!errs.length) return '<div class="diag-ok">没发现明显错误，继续保持～</div>';
  return '<div class="diag-inline-list">' + errs.map((e, i) => {
    const issue = String(e.issue || '').trim();
    return (i > 0 ? '<span class="diag-sep">·</span>' : '')
      + '<span class="diag-inline-item">'
      + '<s class="diag-wrong">' + escapeHtml(e.original || '') + '</s>'
      + '<span class="diag-arrow">→</span>'
      + '<span class="diag-right">' + escapeHtml(e.fix || '') + '</span>'
      + (issue ? '<span class="diag-inline-note">' + escapeHtml(issue) + '</span>' : '')
      + '</span>';
  }).join('') + '</div>';
}

// 渲染诊断结构化卡片（P1：语法/用词错误合并为一个模块展示，不显示分数）
function renderDiag(el, j, raw, answer){
  normalizeScore(j, answer);
  const scoreHtml = '';   // 评分机制已关闭（P1/P2 仅展示语法/用词错误，不再显示分数）
  if(j && Array.isArray(j.errors)){
    const errs = cleanErrors(j.errors);
    let h = '<div class="diag-sec"><b>语法/用词纠错</b>' + diffSentenceHtml(answer, errs) + '</div>';
    if(j.rewrite) h += '<div class="diag-sec"><b>改进建议</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
    el.innerHTML = scoreHtml + h;
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

  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按你的人设生成思路和参考回答…</div>'; resultEl.style.display = 'block'; }

  try{
    const sys = '你是雅思口语陪练。考生目标口语 5.5-6 分：句子以简单句为主，但允许混入 1-2 个稍高级的词汇和句型，像真人聊天，不要太难。\n'
      + '考生会给你一个 Part 1 问题和她的个人素材（人设/经历）。\n'
      + '请完成两件事：\n'
      + '1. 给一条中文「逻辑链」：只给 4-6 个简短的中文关键词组/短语，用中文横杠"—"串连。每个关键词组最多 6 个汉字，严禁写成完整句子，严禁加"表态：""原因1：""原因2：""细节：""感受："等任何前缀标签，严禁输出"[横杠]"这几个字。\n'
      + '正确示例（题目：Is this city your permanent residence?）：杭州人—出生成长—家人朋友都在—杭州读大学—生活方便—熟悉每条街—归属感\n'
      + '错误示例（必须避免）：表态：是的，这里是…—原因1：我在这里出生…—原因2：我在杭州读大学…—细节：我熟悉…—感受：虽然…\n'
      + '逻辑链是给你自己提示思路的，不是写出来念给考官的，越短越好。\n'
      + '2. 按题目类型生成英文参考回答，一共 2-3 句，不要多：\n'
      + '   - 如果题目是一般疑问句（以 Do / Does / Are / Can / Have / Did / Would 等开头），第 1 句才用 Yes, I do. / No, not really. / Definitely. / To be honest, ... 这类表态开头。\n'
      + '   - 如果题目是特殊疑问句（以 What / Where / When / Why / Who / How long / How often / How many 等开头），**不要回答 Yes/No**，第 1 句直接给出事实答案（如 "I\'ve lived here for about 18 years." / "It\'s usually in the evening."），不要绕弯子。\n'
      + '   - 剩下的 1-2 句给原因或自然展开，把考生人设细节（身份/城市/爱好等）自然揉进回答，像真人聊天。\n'
      + '「稍高级」示例（整段只混入 1-2 个稍高级结构，别句句都用）：like → be really into；good → enjoyable；可加一个 because/when 从句或 who/which 定语从句（如 the doctor who gave me medicine / a book which helps me relax）；可用 to be honest / actually / I\'d say 过渡。\n'
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
    if(btn){ btn.disabled = false; btn.textContent = '✨ AI 辅助'; }
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
  const st = (m.materials || []).slice(0, 3)
    .map(x => (x.storyEn || '').slice(0, 200))
    .filter(Boolean);
  if(st.length) parts.push('可参考的小故事（简单句英文）：\n' + st.join('\n---\n'));
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

/* === 万能素材生成器（已并入口语页 MAT tab，原 materials.js 逻辑） ===
   数据仍存 localStorage 'ielts_materials_v1'（与 P2 串题 / aiStoryLink 共享）。
   渲染目标从 #matRoot 改为 #matView；挂 window.matGen，软导航重 eval 时由 MAT tab 点击重新 init（每次从 localStorage 重载，不丢数据）。 */
var matGen = (function(){
  const STORE_KEY = 'ielts_materials_v1';
  const CANON = ['喜欢的城市','水边的地方','难忘的旅行','常在一起的人','户外活动','你拍的照片','让你放松的事','家人','朋友','敬佩的人','帮助者','让我骄傲的人','学会的技能','克服的困难','目标','压力','习惯改变','搬家','电子设备','工具','礼物','离不开的东西','爱好','视频','网上学的','改观的事','喜欢的节目','书','电影','歌','诗','故事','网站','衣服','贵的东西','珍藏','法律','规则','传统','习俗','改变','分歧','犯错','投诉','道歉','尴尬','挑战'];
  const QUESTIONS = [
    { id:'A',  group:'persona', required:true,  title:'一句话介绍你自己', hint:'城市、身份（学生/专业或工作）、性格、一个爱好。例：杭州，大三计算机，理性但开口说英语会紧张，喜欢无纸化学习。' },
    { id:'B1', group:'core', required:true,  title:'一次你和某个重要的人一起做的事 / 外出', hint:'和谁、去哪、做了什么、印象最深的瞬间（看到什么/当时心情）。尽量把"人+事+地+旅行"一次讲全，能少背一条素材。' },
    { id:'B2', group:'core', required:true,  title:'一件你学会 / 克服 / 坚持的事', hint:'一项技能，或一段咬牙坚持/克服困难的经历。最难的是什么？后来怎么变好？' },
    { id:'B3', group:'core', required:true,  title:'一个每天用或离不开的东西 / 日常爱好', hint:'物件（手机/电脑/乐器…）或爱好。它怎么融入生活？为什么离不开？' },
    { id:'B4', group:'core', required:true,  title:'一个在网上看到、让你改观或感兴趣的内容', hint:'B站/短视频/文章都行。讲了什么？为什么让你改观或感兴趣？' },
    { id:'B5', group:'core', required:true,  title:'一个对你重要的地方 / 一次印象深的经历', hint:'一个地方（家/学校/旅行地）或一次经历。它为什么重要？发生了什么让你记住？' },
    { id:'C1', group:'extra', required:false, title:'一本喜欢的书 / 一部电影 / 一首歌', hint:'采文化消费，覆盖 book/film/song（选填，能讲几个讲几个）。' },
    { id:'C2', group:'extra', required:false, title:'一件常穿或珍藏的衣服 / 珍贵礼物 / 贵的东西', hint:'采物件，覆盖 clothing/gift/expensive（选填）。' },
    { id:'C3', group:'extra', required:false, title:'一条影响过你的规则 / 法律 / 传统习俗', hint:'采规则维度，覆盖 law/rules/tradition/custom（选填）。' },
    { id:'C4', group:'extra', required:false, title:'一次冲突 / 犯错 / 投诉 / 道歉', hint:'采负面经历，覆盖 disagreement/mistake/complaint/apology（选填）。' }
  ];
  const SYS_MAT = '你是雅思口语串题素材教练。考生会给你一份人设 + 若干段真实生活经历（含可能来自你上一轮追问的补充回答）。\n'
  + '你的任务：把全部经历整合成**几个完整核心小故事**（数量灵活：看内容 + 对照下方 P2 全题型来定，通常 3~5 个，但不要凑数）。**必须把考生填入的每一段经历、每一个细节都完整纳入最终故事，不得遗漏、不得为了精简而丢弃任何一段内容。** 每个故事都能让考生直接背出来。\n'
  + '规则：\n'
  + '1. 故事必须基于考生原话，真实不编造。**完整性优先于精简**：若把相关经历合并成一个故事，必须把两段经历的所有人物、地点、事件、感受等关键信息和细节都完整写进去，不得省略任何一段你提供的经历内容；宁可多生成一个小故事，也绝不丢弃考生填的任何内容。\n'
  + '2. 每个故事含：title(标题) / storyEn(一段英文小故事，用**基础词汇**、短到中等长度的句子，靠 and / so / because / but / actually 等连接词串成有「起因→经过→感受→结尾」的**连贯叙事**，读起来像在讲一件事而不是清单；严禁连续堆砌孤立短句、严禁连续同一主语/同一动词；契合口语 5.5 水平，长度适中可直接背；storyEn 必须把该故事涵盖的考生经历细节全部写进去，不得遗漏) / logicZh(中文**逻辑链**：用若干中文短语以 "—"（中文横杠/破折号）串接，把故事的关键步骤、转折、感受、细节都铺开——越长越细越好、数量不固定，例如"朋友送手机壳—觉得很有心—每天用手机—看到就想起朋友—珍藏") / coverage(能套的 P2 题族数组)。\n'
  + '3. coverage 每个元素：{"topic":"题族名","fit":"natural|loose","note":"串题连接说明(给一句怎么把本故事套到该题，如\'旅行中意识到环保法重要→套法律法规\';natural可简写)"}。\n'
  + '4. 串题很抽象，**搭边就行**：coverage 不限于自然贴合的题，偏题（法律/规则/传统/人物/挑战…）只要能扯上关系就列，并给自然的连接说明。目标是背完这几个故事，大部分 P2 题都能套。\n'
  + '5. 不要产出 keyword 骨架 / 不要拆分多切面列表——考生基础弱，给词也不会说句型，必须给**成段的、能直接背的英文小故事**（句子可简单但必须连贯，靠连接词串成一件事）。\n'
  + '6. 判断素材是否够覆盖：对照 P2 全题型，如果现有经历明显缺某大类（如完全没提人或完全没提地点），且补 1-3 个问题就能补上，则在 followups 返回这些问题；如果已经够广，followups 返回空数组。\n'
  + 'P2 全题型参考：' + CANON.join('、') + '\n'
  + '输出严格 JSON：{"stories":[{"title":"","storyEn":"","logicZh":"","coverage":[{"topic":"","fit":"","note":""}]}],"followups":["还想了解的问题1","问题2"]}';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';
  const SYS_GAP = '你是雅思 P2 覆盖分析师。给定已被素材（含搭边串题）覆盖的 P2 题族，以及常见 IELTS P2 题族清单，请列出**连搭边都难覆盖**、且该用户大概率会考到的题族（最多 6 条），每条给一个**澄清性问题**——用第二人称直接问考生真实经历，问题要具体、好回答，比如"你最近半年有没有搬过家？搬去哪了？"、"你有没有哪款小工具是每天都用的？说说怎么用的？"。只列真正缺口，不要编造已覆盖的。输出严格 JSON 数组：[{"topic":"题族","question":"澄清性问题"}]';

  let store = null;
  let mode = 'q';
  let editing = -1;   // 当前正在「更改」编辑的素材卡下标；-1 表示无

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.deletedIds = s.deletedIds || []; return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){ s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.answers.gaps = s.answers.gaps || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; s.deletedIds = s.deletedIds || []; DATA.materials = s; return s; }
    }catch(_){}
    return { persona:null, materials:[], gaps:[], followups:[], answers:{ extraMore:[], followups:[], gaps:[] } };
  }
  function saveStore(){ DATA.materials = store; hubSave(); }
  function ans(id){ return (store.answers[id] || '').trim(); }

  function init(){ store = loadStore(); mode = store.materials.length ? 'result' : 'q'; render(); }

  function render(){
    const root = $('#matView'); if(!root) return;
    if(mode === 'result' && store.materials.length){ renderResults(root); }
    else { renderQuestionnaire(root); }
  }

  function renderQuestionnaire(root){
    let h = '<div class="mat-intro">填 <b>6 题（人设 + 5 个核心经历）</b> 就能生成你的专属万能素材；想覆盖更多偏题，把下面 4 个<b>选填</b>也补上（共 10 题）。填一半关页不丢，下次自动接着填。</div>';
    h += '<div class="mat-sec-title">人设卡 <span class="tag">1 题</span></div>';
    h += qCard('A');
    h += '<div class="mat-sec-title">核心经历卡 <span class="tag">5 题 · 必填</span></div>';
    QUESTIONS.filter(q => q.group === 'core').forEach(q => { h += qCard(q.id); });
    h += '<div class="mat-sec-title">扩展补缺卡 <span class="tag">4 题 · 选填（想覆盖偏题就填）</span></div>';
    QUESTIONS.filter(q => q.group === 'extra').forEach(q => { h += qCard(q.id); });
    (store.answers.extraMore || []).forEach(x => { h += qCard(x.id, true); });
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2 0-2.8s-2-.8-3 0z"/><path d="M9 11l4 4"/><path d="M13 7l4 4 3-3a2 2 0 0 0-3-3l-4 2z"/><path d="M14 4l6 6"/></svg>生成我的专属素材</button><button class="mat-add" id="matAdd">＋ 添加一段经历</button></div>';
    root.innerHTML = h;
    root.querySelectorAll('textarea[data-q]').forEach(ta => {
      ta.addEventListener('input', () => {
        const id = ta.dataset.q;
        if(id && id[0] === 'X'){ const ex = (store.answers.extraMore || []).find(e => e.id === id); if(ex) ex.text = ta.value; }
        else store.answers[id] = ta.value;
        saveStore();
        updateChar(ta);
      });
      updateChar(ta);
    });
    $('#matGen').onclick = generate;
    $('#matAdd').onclick = () => { (store.answers.extraMore = store.answers.extraMore || []).push({ id:'X' + Date.now(), text:'' }); saveStore(); renderQuestionnaire(root); };
  }

  function qCard(id, isExtraMore){
    const q = QUESTIONS.find(x => x.id === id);
    const title = q ? q.title : '补充经历';
    const hint = q ? q.hint : '补一段真实经历，兜底极端偏题（如交通工具/科学成就）。';
    const val = isExtraMore ? ((store.answers.extraMore || []).find(e => e.id === id) || {}).text || '' : store.answers[id] || '';
    const optCls = (q && q.group === 'extra') || isExtraMore ? ' optional' : '';
    const reqBadge = (q && q.required) ? '<span class="req">必填</span>' : (isExtraMore ? '' : '<span class="opt">选填</span>');
    return '<div class="mat-q' + optCls + '">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(title) + reqBadge + '</span></div>'
      + '<div class="mat-q-hint">' + escapeHtml(hint) + '</div>'
      + '<textarea data-q="' + id + '" placeholder="' + (q ? escapeHtml(q.title) : '真实经历…') + '">' + escapeHtml(val) + '</textarea>'
      + '<div class="mat-char" data-char="' + id + '"></div>'
      + '</div>';
  }
  function updateChar(ta){
    const id = ta.dataset.q;
    const el = document.querySelector('[data-char="' + id + '"]'); if(!el) return;
    const n = ta.value.trim().length;
    el.textContent = '已写 ' + n + ' 字';
    el.classList.toggle('warn', n > 0 && n < 20);
  }

  async function generate(extra){
    const experiences = [];
    QUESTIONS.forEach(q => { const v = ans(q.id); if(v) experiences.push({ id:q.id, title:q.title, raw:v }); });
    (store.answers.extraMore || []).forEach(x => { if((x.text || '').trim()) experiences.push({ id:x.id, title:'补充经历', raw:x.text.trim() }); });
    (store.answers.followups || []).forEach(f => { if((f.a || '').trim()) experiences.push({ id:'F' + experiences.length, title:f.q || '补充', raw:f.a.trim() }); });
    (store.answers.gaps || []).forEach(g => { if((g.a || '').trim()) experiences.push({ id:'G' + experiences.length, title:g.topic + '（追问补充）', raw:g.a.trim() }); });
    const missing = [];
    if(!ans('A')) missing.push('A（自我介绍）');
    QUESTIONS.filter(q => q.group === 'core').forEach(q => { if(!ans(q.id)) missing.push(q.id); });
    if(missing.length){ toast('请先填完必填项：' + missing.join('、')); return; }

    const hasKey = !!(DATA.settings && DATA.settings.relayToken);
    if(!hasKey) toast('未配置 AI Key（设置里填 DeepSeek Key），将用模板兜底生成（质量降级但可用）');

    setLoading('正在把你的故事整合成万能素材…');
    try{
      let persona = null;
      try{ persona = await genPersona(ans('A')); }catch(e){ persona = fallbackPersona(ans('A')); }
      let result = { stories:[], followups:[] };
      try{ result = await genMaterialsBatch(experiences, ans('A')); }
      catch(e){ result = { stories: fallbackMaterialsBatch(experiences), followups:[] }; }
      if(!result.stories || !result.stories.length) result = { stories: fallbackMaterialsBatch(experiences), followups:[] };
      const covered = unique((result.stories || []).flatMap(m => (m.coverage || []).map(c => c.topic)));
      let gaps = [];
      try{ gaps = await genGaps(covered); }catch(e){ gaps = fallbackGaps(covered); }

      store.persona = persona; store.materials = result.stories; store.followups = result.followups || []; store.gaps = gaps;
      // 给每张素材卡补稳定 id（AI 未必返回），供删除墓碑与跨设备去重使用
      store.materials.forEach(m => { if(m && m.id == null) m.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); });
      store.materialsEpoch = Date.now();   // 生成批次戳：云端合并时凭此整体替换旧素材，避免旧卡片被并集回残留
      saveStore();
      mode = 'result';
      render();
    }catch(e){
      toast('生成中断：' + e.message);
      render();
    }
  }

  function setLoading(msg){
    const root = $('#matView'); if(!root) return;
    root.innerHTML = '<div class="mat-loading"><div class="mat-spinner"></div>' + escapeHtml(msg) + '</div>';
  }

  async function genMaterialsBatch(exps, personaText){
    const expText = exps.map(e => '【' + e.title + '】\n' + e.raw).join('\n\n');
    const user = '人设：' + (personaText || '（未提供）') + '\n\n全部经历（含追问补充）：\n' + expText + '\n\n请按规则整合为几个完整核心小故事，并判断是否需要追问补充，输出 stories + followups JSON。';
    const content = await callRelay('material', [ { role:'system', content:SYS_MAT }, { role:'user', content:user } ], 0.7);
    const j = aiJson(content);
    if(!j || !Array.isArray(j.stories)) throw new Error('素材 JSON 解析失败');
    return { stories: j.stories.map((s, i) => normalizeMaterial(s, i)), followups: Array.isArray(j.followups) ? j.followups.map(String) : [] };
  }
  async function genPersona(text){
    const content = await callRelay('material_persona', [ { role:'system', content:SYS_PERSONA }, { role:'user', content:'自我介绍：' + text } ], 0.4);
    const j = aiJson(content);
    if(!j || !j.persona) throw new Error('人设 JSON 解析失败');
    return j.persona;
  }
  async function genGaps(covered){
    const coveredStr = covered.length ? covered.join('、') : '（无）';
    const user = '已被素材自然覆盖的 P2 题族：' + coveredStr + '。\n常见 IELTS P2 题族清单：' + CANON.join('、') + '。\n请列出未被覆盖、且该用户大概率会考到的题族。';
    const content = await callRelay('material_gap', [ { role:'system', content:SYS_GAP }, { role:'user', content:user } ], 0.5);
    const j = aiJson(content);
    let arr = Array.isArray(j) ? j : (j && Array.isArray(j.gaps) ? j.gaps : null);
    if(!arr) throw new Error('缺口 JSON 解析失败');
    return arr.filter(g => g && g.topic).map(g => ({ topic:String(g.topic), question:String(g.question || g.advice || '你有没有和"' + g.topic + '"相关的真实经历？简单说几句。') }));
  }

  function normalizeMaterial(s, i){
    const cov = Array.isArray(s.coverage) ? s.coverage : [];
    return {
      id: s.id || ('m' + Date.now() + '_' + i),
      title: s.title || ('故事' + (i + 1)),
      storyEn: s.storyEn || '',
      logicZh: s.logicZh || '',
      coverage: cov.map(c => ({ topic:String(c.topic || ''), fit:String(c.fit || 'natural'), note:String(c.note || '') })).filter(c => c.topic),
      confidence: s.confidence || 'high'
    };
  }
  function fallbackMaterialsBatch(exps){
    return exps.map((e, i) => ({
      id:'m' + Date.now() + '_' + i, title:e.title || ('故事' + (i + 1)),
      storyEn:'', logicZh:e.raw || '（未填写）',
      coverage:[], confidence:'low', _fallback:true
    }));
  }
  function fallbackPersona(text){
    return { city:'', identity:text || '', values:[], traits:[], _fallback:true };
  }
  function fallbackGaps(covered){
    return CANON.filter(t => !covered.includes(t)).slice(0, 6).map(t => ({ topic:t, question:'你有没有和"' + t + '"相关的真实经历？简单说几句。' }));
  }
  function unique(a){ return Array.from(new Set(a)); }

  function renderResults(root){
    let h = '';
    // 人设卡
    if(store.persona){
      const p = store.persona;
      const tags = [].concat((p.values || []).map(v => '<span class="pp-tag">' + escapeHtml(v) + '</span>'), (p.traits || []).map(t => '<span class="pp-tag">' + escapeHtml(t) + '</span>'));
      h += '<div class="mat-persona"><h3>人设锚点</h3>'
        + '<div class="pp-line">' + (p.city ? escapeHtml(p.city) + ' · ' : '') + escapeHtml(p.identity || '（未提取）') + '</div>'
        + (tags.length ? '<div class="pp-tags">' + tags.join('') + '</div>' : '')
        + '</div>';
    }
    // 故事卡
    store.materials.forEach((m, i) => {
      const isEditing = (editing === i);
      h += '<div class="mat-mat' + (isEditing ? ' open' : '') + '" data-i="' + i + '">'
        + '<div class="mat-mat-head" data-toggle="' + i + '"><span class="mat-mat-title">' + escapeHtml(m.title || '未命名') + '</span>'
        + '<span class="mat-caret">▶</span></div>'
        + '<div class="mat-body">';
      if(isEditing){
        h += '<div class="mat-sub">标题</div><input class="mat-edit-input" data-edit-title="' + i + '" value="' + escapeHtml(m.title || '') + '">'
          + (m.storyEn != null ? '<div class="mat-sub">英文可背（连贯小故事）</div><textarea class="mat-edit-input mat-edit-area" data-edit-story="' + i + '" placeholder="英文小故事…">' + escapeHtml(m.storyEn) + '</textarea>' : '')
          + (m.logicZh != null ? '<div class="mat-sub">中文逻辑链</div><textarea class="mat-edit-input mat-edit-area" data-edit-logic="' + i + '" placeholder="中文逻辑…">' + escapeHtml(m.logicZh) + '</textarea>' : '')
          + '<div class="mat-edit-hint">保存后会<b>直接覆盖</b>这张素材，旧内容不再保留。</div>'
          + '<div class="mat-mat-actions"><button class="mat-mini btn-save" data-save="' + i + '">保存</button><button class="mat-mini" data-cancel="' + i + '">取消</button></div>';
      } else {
        h += (m.storyEn ? '<div class="mat-sub">英文可背（连贯小故事）</div><div class="mat-story-en">' + escapeHtml(m.storyEn) + '</div>' : '')
          + (m.logicZh ? '<div class="mat-sub">中文逻辑链</div><div class="mat-logic">' + escapeHtml(m.logicZh) + '</div>' : '')
          + '<div class="mat-mat-actions"><button class="mat-mini" data-regen-all="1">重新生成全部</button><button class="mat-mini danger" data-del="' + i + '">删除</button><button class="mat-mini" data-edit="' + i + '">更改</button></div>';
      }
      h += '</div></div>';
    });
    // AI 追问区（followups + gaps 合并：每个问题带输入框，回答后一起喂给重新生成）
    const hasFups = store.followups && store.followups.length;
    const hasGaps = store.gaps && store.gaps.length;
    if(hasFups || hasGaps){
      h += '<div class="mat-followup"><h3>🤖 AI 追问区</h3><div class="mat-followup-tip">回答下面的问题（能答几个答几个），点「继续生成」后 AI 会基于新回答重新整合素材、补全覆盖。</div>';
      if(hasFups){
        store.followups.forEach((q, i) => {
          h += '<div class="mat-q"><div class="mat-q-head">' + escapeHtml(q) + '</div><textarea data-followup="' + i + '" placeholder="你的回答…">' + escapeHtml((store.answers.followups && store.answers.followups[i] ? store.answers.followups[i].a : '') || '') + '</textarea></div>';
        });
      }
      if(hasGaps){
        store.gaps.forEach((g, i) => {
          const qtext = g.question || '你有没有和"' + g.topic + '"相关的真实经历？';
          h += '<div class="mat-q mat-gap-q"><div class="mat-q-head"><span class="mat-gap-topic">【' + escapeHtml(g.topic) + '】</span>' + escapeHtml(qtext) + '</div><textarea data-gap="' + i + '" placeholder="你的回答…（没有相关经历可留空）">' + escapeHtml((store.answers.gaps && store.answers.gaps[i] ? store.answers.gaps[i].a : '') || '') + '</textarea></div>';
        });
      }
      h += '<button class="btn btn-primary" id="matContinue">继续生成（含补充回答）</button></div>';
    }
    // 行动
    h += '<div class="mat-actions"><button class="btn btn-primary" id="matGoPractice">去练口语 →</button><button class="mat-add" id="matRegen">↻ 重新填写 / 生成</button></div>';
    root.innerHTML = h;

    root.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = () => { const card = el.closest('.mat-mat'); card.classList.toggle('open'); };
    });
    root.querySelectorAll('[data-regen-all]').forEach(b => {
      b.onclick = () => { generate(); };
    });
    root.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if(!confirm('删除这张素材卡？')) return;
        const i = +b.dataset.del;
        const m = store.materials[i];
        // 记录删除墓碑：即使云端/另一份仍残留该卡，合并时也会按 id 过滤掉，避免"删了又回来"
        if(m && m.id != null){ store.deletedIds = store.deletedIds || []; if(!store.deletedIds.includes(m.id)) store.deletedIds.push(m.id); }
        store.materials.splice(i, 1);
        saveStore();
        // 删除后立即上传云端，让墓碑随同步传播，避免旧卡从云端合并回来
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
      };
    });
    // 「更改」：进入编辑态
    root.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => { editing = +b.dataset.edit; render(); };
    });
    // 「取消」：丢弃改动，退出编辑态
    root.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => { editing = -1; render(); };
    });
    // 「保存」：把改后的内容直接覆盖原素材（不新增、不保留旧内容）
    root.querySelectorAll('[data-save]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.save;
        const m = store.materials[i];
        if(!m) return;
        const card = b.closest('.mat-mat');
        const titleEl = card.querySelector('[data-edit-title]');
        const storyEl = card.querySelector('[data-edit-story]');
        const logicEl = card.querySelector('[data-edit-logic]');
        // 直接原地覆盖原素材：id 不变，只更新内容；旧内容不再保留
        m.title = (titleEl ? titleEl.value.trim() : '') || m.title || '未命名';
        m.storyEn = storyEl ? storyEl.value : (m.storyEn || '');
        m.logicZh = logicEl ? logicEl.value : (m.logicZh || '');
        m.updatedAt = Date.now();
        editing = -1;
        saveStore();
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
        toast('已保存（覆盖原素材）');
      };
    });
    const mc = $('#matContinue');
    if(mc) mc.onclick = () => {
      const list = [];
      root.querySelectorAll('[data-followup]').forEach(ta => {
        const i = +ta.dataset.followup;
        const q = (store.followups && store.followups[i]) || '';
        list.push({ q: q, a: ta.value.trim() });
      });
      store.answers.followups = list;
      const gapList = [];
      root.querySelectorAll('[data-gap]').forEach(ta => {
        const i = +ta.dataset.gap;
        const g = (store.gaps && store.gaps[i]) || {};
        gapList.push({ topic: g.topic || '', question: g.question || '', a: ta.value.trim() });
      });
      store.answers.gaps = gapList;
      saveStore();
      generate();
    };
    $('#matRegen').onclick = () => { mode = 'q'; render(); };
    const gp = $('#matGoPractice'); if(gp) gp.onclick = () => { const p1 = document.querySelector('#tabs [data-type="P1"]'); if(p1) p1.click(); };
  }

  return { init, render };
})();

/* === 26 · P1 问答流：一题一卡 + 进度 + 步进（在 openDetail 的 P1 分支调用） === */
function p1FlowInit(s){
  var list = document.querySelector('.sp-q-list');
  if(!list || !s.questions || !s.questions.length) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('.sp-q'));
  if(!items.length) return;
  var n = items.length;
  s.answers = s.answers || {};

  // 默认聚焦第一道未做的题（全做完则回到第 1 题）
  var cur = 0;
  for(var i = 0; i < n; i++){ if(bestOfQuestion(s.answers[i]) == null){ cur = i; break; } }

  // ① 进度头（插到题卡列表前）
  var head = document.createElement('div');
  head.className = 'sp-flow-head';
  head.innerHTML = '<div class="sp-flow-dots"></div><div class="sp-flow-count"></div>';
  list.parentNode.insertBefore(head, list);

  // ② 步进导航（插到底部操作区之前）
  var nav = document.createElement('div');
  nav.className = 'sp-flow-nav';
  nav.innerHTML = '<button class="sp-flow-prev" type="button">← 上一题</button>'
    + '<button class="sp-flow-next" type="button">下一题 →</button>';
  var acts = document.querySelector('.sp-detail-actions');
  if(acts) acts.parentNode.insertBefore(nav, acts);

  // ③ 已完成小结（插到题卡列表后）
  var done = document.createElement('div');
  done.className = 'sp-flow-done';
  done.hidden = true;
  list.insertAdjacentElement('afterend', done);

  function render(){
    items.forEach(function(li, idx){ li.classList.toggle('active', idx === cur); });

    // 切到一道小题时自动朗读一次（点“下一题/上一题”或在列表点题都会触发）
    var activeLi = items[cur];
    if(activeLi){
      var qText = activeLi.querySelector('.sp-q-text');
      var btn = activeLi.querySelector('.sp-tts');
      if(qText && qText.textContent.trim()) speakQuestion.speak(qText.textContent.trim(), btn);
    }

    // 进度点
    var dotsHtml = '';
    for(var i = 0; i < n; i++){
      var cls = (i === cur) ? 'cur' : (i < cur ? 'past' : '');
      dotsHtml += '<span class="sp-flow-dot ' + cls + '">' + (i < cur ? '✓' : '') + '</span>';
    }
    head.querySelector('.sp-flow-dots').innerHTML = dotsHtml;
    head.querySelector('.sp-flow-count').textContent = (cur + 1) + ' / ' + n;

    // 步进按钮状态
    var prev = nav.querySelector('.sp-flow-prev');
    var next = nav.querySelector('.sp-flow-next');
    prev.disabled = (cur === 0);
    next.textContent = (cur === n - 1) ? '完成 ✓' : '下一题 →';

    // 已完成小结（沿用 bestOfQuestion，与列表 badge 分数一致）
    var rows = '';
    for(var j = 0; j < n; j++){
      var best = bestOfQuestion(s.answers[j]);
      if(best == null) continue;
      rows += '<div class="sp-flow-drow" data-i="' + j + '">'
        + '<span class="sp-flow-dnum">' + (j + 1) + '</span>'
        + '<span class="sp-flow-dtext">' + escapeHtml((s.questions[j] || '').slice(0, 30)) + '</span>'
        + '<span class="sp-flow-dscore">' + scoreLabel(best) + '分</span>'
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
  nav.querySelector('.sp-flow-next').addEventListener('click', function(){
    if(cur < n - 1){ cur++; render(); }
    else { toast('本话题 ' + n + ' 题完成 ✓'); }
  });

  render();
}

