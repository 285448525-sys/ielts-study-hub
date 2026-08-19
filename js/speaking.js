/* === 口语题库（极简版） === */
var curType = 'P1';
var curFreq = 'all';
var curCat = 'all';
var curSearch = '';
var curDetailId = null;
var FREQ_ORDER = { ultra:0, must:1, high:2, medium:3, normal:4 };

/* 顶部常量用 var（speaking.js 会被软导航 window.eval 重跑，const 会抛「已声明」） */
var SYS_DIAG =
  '你是雅思口语老师。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000，需要地道但不过难、句型简单的英文（别用生僻词/复杂从句）。\n'
  + '考生会给出自己对某个口语问题的回答（可能来自语音输入，可能有语法/用词错误）。请完成：\n'
  + '1) 按雅思口语三项评分（流利度与连贯性、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），不要评发音。评分只关注内容层面（流利度、词汇、语法结构）；大小写与标点属书写格式，一律不计入扣分，也不指出。\n'
  + '【评分校准——严格对照官方 Band Descriptors，务必遵守，评分要宽容、贴近真实考官】\n'
  + '- 语法：先判断「错误造成理解障碍的程度」，再定分。错误极少造成理解困难 → 5.5-6.0（官方6分：复杂结构出错但极少造成理解困难）；基本句型准确、有些小错（时态/单复数/介词）偶尔造成轻微障碍 → 5.0-5.5（官方5分：基本句型合理准确）；只有错误频繁且明显影响理解 → 4.5 或以下（官方4分：错误频发时常造成理解困难）。零散小错扣到 4.5 是错的——官方 5 分档本就允许不少错误。\n'
  + '- 词汇：用词正确、意思表达清晰（哪怕全是基础词）→ 6.0——官方 6 分不要求高级词（词汇量足以详谈话题，意思表达清晰）；明显用词不当/不地道、或过于简单到影响表达 → 5.5；词汇贫乏、很难谈陌生话题 → 5.0 或以下（官方5分：灵活性有限）。别因为「没用什么高级词」就扣分。\n'
  + '- 流利度：愿意交流、偶尔重复/自我纠正但基本连贯 → 5.5-6.0（官方6分）；靠重复/自我纠正/放慢语速维持语流 → 5.0-5.5（官方5分）。别因为「句子简单」压低分数。\n'
  + '2) 指出真正的语法/用词错误：逐条给「原句片段 → 问题(中文简说，并说清对应的语法规则/为什么错) → 修改」。没有错误就如实说很少。\n'
  + '3) 在不改动考生思路的前提下，给一版更地道自然的英文重写（简单句型、常见词汇）。\n'
  + '4) 给 1-2 个可积累的地道替换词/句型（同样简单）。\n'
  + '\n'
  + '【一致性铁律——必须遵守】\n'
  + '- rewrite 必须落实 errors 里每一条 fix；errors 与 rewrite 绝对不能自相矛盾。\n'
  + '- 若你在 rewrite 中保留了某个短语（例如 a lot of），就绝不能同时把它列为错误。\n'
  + '- 只指出真正错误的点；不要过度纠正、不要凭语感乱判。\n'
  + '\n'
  + '【常见正确用法，不要误判为错误】\n'
  + '- a lot of / lots of 既可接不可数名词（food, water, information, advice, furniture, money），也可接可数复数（books, people, friends），都是正确的，切勿判错。\n'
  + '- 不可数名词（如 food）作主语时，there be 用 is、谓语动词用单数（主谓一致）。\n'
  + '\n'
  + '【示例】\n'
  + '考生回答："There are a lot of delicious food in my hometown."\n'
  + '正确诊断应为：\n'
  + 'errors: [{"original":"There are a lot of delicious food","issue":"food 是不可数名词，there be 句型中 be 动词要用 is（主谓一致），不能用 are","fix":"There is a lot of delicious food"}]\n'
  + 'rewrite: "There is a lot of delicious food in my hometown."（a lot of 接不可数名词完全正确，保留，不判错）\n'
  + '\n'
  + '严格要求只输出如下 JSON（不要任何解释文字，不要输出 pronunciation / overall 字段）：'
  + '{"score":{"fluency":6.0,"vocabulary":5.0,"grammar":5.0},"errors":[{"original":"原句片段","issue":"中文简说问题+对应语法规则","fix":"修改后片段"}],"rewrite":"按原思路的地道简化英文重写","tips":["可积累替换/句型1","可积累替换/句型2"]}';

/* 录音 / 转写功能已移除：口语只保留「文本框手写 + AI 评分 + 提交记录」。发音分取自设置里的固定分。 */

// P2 专用诊断提示词（语法纠错 + 串题素材连接）
var SYS_DIAG_P2 =
  '你是雅思口语老师（专精 Part 2）。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000。\n'
  + '考生会给出对一道 P2 题目的完整 2 分钟回答。请完成以下任务：\n'
  + '1) 【评分】按雅思口语三项评分标准（流利度与连贯性、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），并给总分 overall（发音分由用户在设置里填固定分，不参与评分）。评分只关注内容层面；大小写与标点属书写格式，不计入扣分、不指出。\n'
  + '【评分校准——严格对照官方 Band Descriptors，务必遵守，评分要宽容、贴近真实考官】\n'
  + '- 语法：先判断「错误造成理解障碍的程度」，再定分。错误极少造成理解困难 → 5.5-6.0（官方6分：复杂结构出错但极少造成理解困难）；基本句型准确、有些小错（时态/单复数/介词）偶尔造成轻微障碍 → 5.0-5.5（官方5分：基本句型合理准确）；只有错误频繁且明显影响理解 → 4.5 或以下（官方4分：错误频发时常造成理解困难）。零散小错扣到 4.5 是错的——官方 5 分档本就允许不少错误。\n'
  + '- 词汇：用词正确、意思表达清晰（哪怕全是基础词）→ 6.0——官方 6 分不要求高级词（词汇量足以详谈话题，意思表达清晰）；明显用词不当/不地道、或过于简单到影响表达 → 5.5；词汇贫乏、很难谈陌生话题 → 5.0 或以下（官方5分：灵活性有限）。别因为「没用什么高级词」就扣分。\n'
  + '- 流利度：愿意交流、偶尔重复/自我纠正但基本连贯 → 5.5-6.0（官方6分）；靠重复/自我纠正/放慢语速维持语流 → 5.0-5.5（官方5分）。别因为「句子简单」压低分数。\n'
  + '2) 【语法纠错】逐条指出真正的语法/用词错误：原句片段 → 问题(中文简说+对应语法规则) → 修改；没有就如实说很少。不要指出大小写或标点类问题。\n'
  + '3) 【串题素材连接】考生有若干"万能故事"素材（见用户消息末尾），分析其回答思路，具体建议可套用哪个/哪些素材、怎么调整措辞自然嵌入；若没用到任何素材，指出最适合的并给嵌入示例。\n'
  + '4) 给一版更地道的英文重写（简单句型为主），以及 1-2 个可积累替换。\n'
  + '\n'
  + '【一致性铁律——必须遵守】\n'
  + '- rewrite 必须落实 errors 里每一条 fix；errors 与 rewrite 绝对不能自相矛盾。\n'
  + '- 若 rewrite 中保留了某短语（如 a lot of），绝不能同时把它列为错误。\n'
  + '- 只指出真正错误的点；不要过度纠正、不要凭语感乱判。\n'
  + '\n'
  + '【常见正确用法，不要误判为错误】\n'
  + '- a lot of / lots of 既可接不可数名词（food, water, information 等），也可接可数复数（books, people 等），都正确，切勿判错。\n'
  + '- 不可数名词作主语时 there be 用 is、谓语用单数（主谓一致）。\n'
  + '\n'
  + '严格要求只输出如下 JSON：'
  + '{"score":{"overall":5.5,"fluency":6.0,"vocabulary":5.0,"grammar":5.0},"errors":[{"original":"原句片段","issue":"问题+对应语法规则","fix":"修改"}],"rewrite":"地道简化英文重写","storyLink":"具体的串题素材连接建议（中文，2-4 行）","tips":["可积累1","可积累2"]}';

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
      $('#listView').hidden = true; $('#detailView').hidden = true; $('#mockView').hidden = true; $('#matView').hidden = true;
      if(t === 'MOCK'){
        $('#mockView').hidden = false;
      } else if(t === 'MAT'){
        $('#matView').hidden = false;
        if(typeof matGen !== 'undefined' && matGen.init) matGen.init();
      } else {
        curType = t;
        $('#listView').hidden = false;
        renderList();
      }
    });
  });
  document.querySelectorAll('.chip[data-filter]').forEach(c => {
    c.addEventListener('click', () => {
      const f = c.dataset.filter, v = c.dataset.val;
      if(f === 'freq') curFreq = v;
      else curCat = v;
      document.querySelectorAll('.chip[data-filter="' + f + '"]').forEach(x => x.classList.toggle('active', x === c));
      renderList();
    });
  });
  $('#spSearch').addEventListener('input', () => { curSearch = $('#spSearch').value.trim().toLowerCase(); renderList(); });
  $('#backBtn').addEventListener('click', () => { $('#detailView').hidden = true; $('#listView').hidden = false; curDetailId = null; });
  renderList();
});

function getFiltered(){
  let list = DATA.speaking.filter(s => s.type === curType);
  if(curFreq !== 'all'){
    if(curFreq === 'new') list = list.filter(s => s.isNew);
    else list = list.filter(s => s.frequency === curFreq);
  }
  if(curCat !== 'all') list = list.filter(s => s.category === curCat);
  if(curSearch){
    list = list.filter(s => {
      const t = ((s.titleEn || '') + ' ' + (s.titleZh || '') + ' ' + (s.title || '') + ' ' + (s.promptEn || '') + ' ' + (s.promptZh || '') + ' ' + (s.questions || []).join(' ')).toLowerCase();
      return t.includes(curSearch);
    });
  }
  // 按频率排序
  list.sort((a, b) => (FREQ_ORDER[a.frequency] || 9) - (FREQ_ORDER[b.frequency] || 9));
  return list;
}

function freqTag(freq){
  const label = (typeof FREQ_LABEL !== 'undefined' && FREQ_LABEL[freq]) || freq;
  return '<span class="sp-tag freq-' + freq + '">' + label + '</span>';
}

function tagsHtml(s){
  let html = '';
  if(s.frequency) html += freqTag(s.frequency);
  if(s.isNew) html += '<span class="sp-tag new">新题</span>';
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
function getBestScore(s){
  if(!s || !s.answers) return null;
  let best = null;
  Object.values(s.answers).forEach(a => {
    if(a && a.score && a.score.overall != null){
      const v = parseFloat(a.score.overall);
      if(!isNaN(v) && (best === null || v > best)) best = v;
    }
  });
  return best;
}
function getScoreCount(s){
  if(!s || !s.answers) return 0;
  return Object.values(s.answers).filter(a => a && a.score && a.score.overall != null).length;
}

/* === P1 计分聚合（修复3）===
   P1 的 4 小题算「1 次练习」，外面显示「4 题平均分」（非最高分）。
   P2 维持原「最高分 / 练过N次」逻辑。 */
function getP1Done(s){
  if(!s || !s.answers) return 0;
  return Object.keys(s.answers).filter(k => k !== 'p2' && s.answers[k] && s.answers[k].score).length;
}
function getAggScore(s){
  if(!s || !s.answers) return null;
  if(s.type === 'P1'){
    const vals = Object.keys(s.answers)
      .filter(k => k !== 'p2' && s.answers[k] && s.answers[k].score && s.answers[k].score.overall != null)
      .map(k => parseFloat(s.answers[k].score.overall))
      .filter(v => !isNaN(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return getBestScore(s);
}
function getPracticeCount(s){
  if(!s || !s.answers) return 0;
  if(s.type === 'P1') return getP1Done(s) > 0 ? 1 : 0;
  return getScoreCount(s);
}
function scoreLabel(v){ return v == null ? '-' : (Math.round(v * 10) / 10).toFixed(v % 1 === 0 ? 0 : 1); }
function scoreBadgeHtml(score, count, s){
  if(score == null) return '';
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
    html += '<div class="sp-q-list-head">Part 1 小问题（点开可手写回答，再让 AI 诊断）</div>';
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
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button">🤖 AI 评分</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '<div class="sp-rec-list" id="p2Records"></div>';
    html += '</div>';
  }

  // P2 串题思路（保留；AI 辅助按钮已移除）
  if(s.type === 'P2'){
    html += '<button class="btn btn-primary" id="aiStoryLinkBtn" style="margin-bottom:12px">🔀 AI 串题思路</button>';
  }
  html += '<div class="sp-ai-result" id="aiResult"></div>';

  // 保存 + 删除 +（P1）下一题
  html += '<div class="sp-detail-actions"><button class="btn btn-primary" id="saveBtn">保存</button><button class="btn btn-danger" id="delSpBtn">删除此题</button>';
  if(s.type === 'P1'){
    html += '<button class="btn btn-med" id="nextTopicBtn" style="margin-left:auto">下一题 →</button>';
  }
  html += '</div>';

  $('#detailBody').innerHTML = html;

  // 绑定事件
  $('#saveBtn').addEventListener('click', () => saveDetail(id));
  if(s.type === 'P1'){
    const nextTopicBtn = document.getElementById('nextTopicBtn');
    if(nextTopicBtn) nextTopicBtn.addEventListener('click', () => gotoNextTopic());
  }
  const delSpBtn = document.getElementById('delSpBtn');
  if(delSpBtn) delSpBtn.addEventListener('click', () => {
    if(confirm('确定删除这个口语题？删除后默认题库升级也不会再恢复它。')) deleteSpeaking(id);
  });
  if(s.type === 'P2'){
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => aiStoryLink(id));
    matHint(s);
  }

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);

  // P2 单窗口事件绑定（仅手写 + AI 评分 + 提交记录；无录音）
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
          if(renderP2Diag(res, j)){ res.style.display = 'block'; }
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
    renderSubmitRecords(s.answers.p2.records, $('#p2Records'), (rec) => {
      const ta = $('#p2Ans'); if(ta && rec.text != null) ta.value = rec.text;
      const res = $('#p2Result');
      if(res && rec.result){
        try{ const j = JSON.parse(rec.result); if(renderP2Diag(res, j)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    });
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
  DATA.settings.deletedSpeakingIds = DATA.settings.deletedSpeakingIds || [];
  if(!DATA.settings.deletedSpeakingIds.includes(id)) DATA.settings.deletedSpeakingIds.push(id);
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
      '2. 把这些细节**拼成一篇英文参考回答**（简单句为主，契合口语 5.5，长度适配该题、不要过长）。注意：这不是让考生照抄——大部分内容考生会用自己的话说，只有少量句子（尤其固定开头/结尾）才直接借用。\n' +
      '3. 给一段中文「思路」：说明用了哪几条故事的哪些细节、怎么组合、怎么贴着题目讲。\n' +
      '4. 给这道 P2 题专属的「逻辑链」：用若干中文关键词以 "—"（中文横杠/破折号）串接，把本题要讲的步骤、细节、感受都铺开——越长越细越好、数量不固定，严禁输出 "[横杠]" 这几个字。\n' +
      '5. 给一个**通用开头句**和一个**通用结尾句**（尽量万能：开头用 "I\'d like to talk about..." 什么题都能接；结尾一句收束）。\n' +
      '输出严格 JSON：{"approach":"中文思路","article":"拼接的英文参考回答","logicChain":"关键词—关键词（用中文横杠隔开，越长越细越好）","opener":"通用开头句","closer":"通用结尾句"}，不要任何解释文字。';

    const user = 'P2 题目：' + (s.promptEn || s.title || '') +
      '\n中文题意：' + (s.promptZh || '') +
      '\nYou should say: ' + ((s.youShouldSay || []).join('; ')) +
      '\n\n考生的万能素材库：\n' + matsText;

    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);

    if(j && (j.article || j.approach)){
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
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 AI 串题方案（跨故事拼细节）</div>';
  if(j.approach) h += '<div class="mat-plan-sec"><b>① 思路</b><div class="mat-plan-note">' + escapeHtml(j.approach) + '</div></div>';
  if(j.article) h += '<div class="mat-plan-sec"><b>② 参考英文（自己话讲，少量句子可借模板）</b><div class="mat-story-en">' + escapeHtml(j.article) + '</div></div>';
  if(j.logicChain) h += '<div class="mat-plan-sec"><b>③ 本题逻辑链</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
  if(j.opener || j.closer){
    h += '<div class="mat-plan-sec"><b>④ 固定句式</b><div class="mat-plan-frames">';
    if(j.opener) h += '<div>开头：<code>' + escapeHtml(j.opener) + '</code></div>';
    if(j.closer) h += '<div>结尾：<code>' + escapeHtml(j.closer) + '</code></div>';
    h += '</div></div>';
  }
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
    + '<div class="sp-q-panel" data-qi="' + qi + '" hidden>'
    +   '<div class="sp-mini-body" data-body="rec" data-qi="' + qi + '">'
    +     '<textarea class="sp-ans" data-qi="' + qi + '" placeholder="在这里写下你的回答…"></textarea>'
    +     '<div class="sp-rec-list" data-qi="' + qi + '"></div>'
    +     '<div class="sp-q-btns">'
    +       '<button class="sp-ai-helper" data-qi="' + qi + '" type="button">✨ AI 辅助</button>'
    +       '<button class="sp-diag" data-qi="' + qi + '" type="button">🤖 AI 诊断</button>'
    +       '<button class="sp-ans-clear" data-qi="' + qi + '" type="button">清空</button>'
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
          renderDiag(resultEl, j, s.answers[qi].result);
        }catch(_){
          resultEl.innerHTML = '<div class="diag-note">（上次结果非标准格式，已贴原文）</div><pre>' + escapeHtml(s.answers[qi].result || '') + '</pre>';
          resultEl.style.display = 'block';
        }
      }
      // 回填 AI 辅助结果（上次生成过则填回作答框 + 显示提示）
      const aiHelper = s.answers[qi].aiHelper;
      if(aiHelper && aiHelper.answer){
        if(ta && !ta.value) ta.value = aiHelper.answer;
        const aiRes = li.querySelector('.sp-q-result[data-qi="' + qi + '"]');
        if(aiRes) renderAIHelper(aiRes, aiHelper);
      }
      // 渲染提交历史记录（每次手写提交都会记录，点击可回填）
      renderSubmitRecords(s.answers[qi].records, li.querySelector('.sp-rec-list[data-qi="' + qi + '"]'), (rec) => {
        if(ta && rec.text != null) ta.value = rec.text;
        if(resultEl && rec.result){
          try{ const j = JSON.parse(rec.result); renderDiag(resultEl, j, rec.result); resultEl.style.display = 'block'; }
          catch(_){ resultEl.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; resultEl.style.display = 'block'; }
        }
      });
    }

    // 点开 / 收起
    li.addEventListener('click', e => {
      if(e.target.closest('.sp-q-panel')) return;
      const panel = li.querySelector('.sp-q-panel[data-qi="' + qi + '"]');
      if(!panel) return;
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      li.classList.toggle('open', willOpen);
      const caret = li.querySelector('.sp-q-caret');
      if(caret) caret.classList.toggle('open', willOpen);
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

// 提交历史渲染（每次手写提交都会记录，点击可回填到输入框 / 诊断结果）
function renderSubmitRecords(records, container, onPick){
  if(!container) return;
  const list = records || [];
  const html = [];
  for(let i = 0; i < list.length; i++){
    const r = list[i];
    if(!r || !r.text) continue; // 旧录音记录（无 text）过滤掉
    const dt = new Date(r.ts).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
    const sc = (r.score && r.score.overall != null) ? ' · ' + scoreLabel(r.score.overall) + '分' : '';
    const preview = (r.text || '').slice(0, 28).replace(/\n/g, ' ');
    html.push('<div class="sp-rec-item" data-idx="' + i + '"><span class="sp-rec-text">' + escapeHtml(preview) + '</span><span class="sp-rec-time">' + dt + '</span><span class="sp-rec-score">' + sc + '</span></div>');
  }
  if(!html.length){ container.innerHTML = ''; return; }
  container.innerHTML = html.reverse().join('');
  if(onPick){
    container.querySelectorAll('.sp-rec-item').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.sp-rec-item').forEach(x => x.classList.toggle('active', x === item));
        const rec = (records || [])[+item.dataset.idx];
        if(rec) onPick(rec);
      });
    });
  }
}

// AI 语法诊断（复用纯文本 callRelay，service=speaking_diagnose）
async function diagnoseAnswer(id, qi, questionText, answerText){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = document.querySelector('.sp-q-result[data-qi="' + qi + '"]');
  const btn = document.querySelector('.sp-diag[data-qi="' + qi + '"]');
  if(btn){ btn.disabled = true; btn.textContent = '诊断中…'; }
  try{
    const messages = [
      { role:'system', content: SYS_DIAG },
      { role:'user', content: '题目：' + questionText + '\n\n我的回答：\n' + answerText }
    ];
    const content = await callRelay('speaking_diagnose', messages, 0.3);
    const j = aiJson(content);
    renderDiag(resultEl, j, content);
    s.answers = s.answers || {};
    const oldAns = s.answers[qi] || {};
    const newScore = (j ? parseScore(j.score) : null);
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
    if(btn){ btn.disabled = false; btn.textContent = '🤖 AI 诊断'; }
  }
}

// P2 诊断结构化渲染（语法纠错 + 地道优化 + 串题素材连接 + 可积累）
function renderP2Diag(el, j){
  if(!j || !Array.isArray(j.errors)){ el.innerHTML = ''; return false; }
  let h = (j.score ? scoreHeaderHtml(parseScore(j.score), '本次得分') : '');
  h += '<div class="diag-sec"><b>① 语法/用词纠错</b>';
  h += j.errors.length
    ? j.errors.map(e => '<div class="diag-err"><span class="diag-orig">' + escapeHtml(e.original || '') + '</span> → <span class="diag-fix">' + escapeHtml(e.fix || '') + '</span><div class="diag-issue">' + escapeHtml(e.issue || '') + '</div></div>').join('')
    : '<div class="diag-ok">没发现明显语法错误～</div>';
  h += '</div>';
  if(j.rewrite) h += '<div class="diag-sec"><b>② 地道优化版</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
  if(j.storyLink) h += '<div class="diag-sec"><b>③ 📌 串题素材连接</b><div class="diag-note">可以用你已准备的这些万能素材来回答这道题：</div>' + escapeHtml(j.storyLink) + '</div>';
  if(Array.isArray(j.tips) && j.tips.length) h += '<div class="diag-sec"><b>④ 可积累</b><ul>' + j.tips.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul></div>';
  el.innerHTML = h;
  return true;
}

// P2 AI 评分：语法纠错 + 串题素材连接建议
async function diagnoseP2(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const answer = ($('#p2Ans') || {}).value.trim();
  if(!answer){ toast('先说出或写下你的回答'); return; }

  const btn = $('#p2Diag');
  const resultEl = $('#p2Result');
  if(btn){ btn.disabled = true; btn.textContent = '评分中…'; }

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

    // 渲染结果
    if(!renderP2Diag(resultEl, j)){
      resultEl.innerHTML = '<div class="diag-note">（AI 返回非标准格式，已贴原文）</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
    resultEl.style.display = 'block';

    // 存结果 + 追加一条提交历史记录
    s.answers = s.answers || {};
    const newScore = (j ? parseScore(j.score) : null);
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
        try{ const j2 = JSON.parse(rec.result); if(renderP2Diag(res, j2)){ res.style.display = 'block'; return; } }catch(_){}
        res.innerHTML = '<pre>' + escapeHtml(rec.result) + '</pre>'; res.style.display = 'block';
      }
    });

  }catch(e){
    resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
    resultEl.style.display = 'block';
    toast('AI 评分失败：' + e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '🤖 AI 评分'; }
  }
}

// 渲染诊断结构化卡片
function renderDiag(el, j, raw){
  const scoreHtml = (j && j.score) ? scoreHeaderHtml(parseScore(j.score), '本题得分') : '';
  if(j && Array.isArray(j.errors) && j.rewrite){
    let h = '<div class="diag-sec"><b>① 语法/用词诊断</b>';
    h += j.errors.length
      ? j.errors.map(e => '<div class="diag-err"><span class="diag-orig">' + escapeHtml(e.original || '') + '</span> → <span class="diag-fix">' + escapeHtml(e.fix || '') + '</span><div class="diag-issue">' + escapeHtml(e.issue || '') + '</div></div>').join('')
      : '<div class="diag-ok">没发现明显错误，继续保持～</div>';
    h += '</div>';
    h += '<div class="diag-sec"><b>② 按你思路的地道重写</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
    if(Array.isArray(j.tips) && j.tips.length) h += '<div class="diag-sec"><b>③ 可积累</b><ul>' + j.tips.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul></div>';
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
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按你的人设生成回答…</div>'; resultEl.style.display = 'block'; }

  try{
    const sys = '你是雅思口语陪练。考生目标口语 5.5-6 分：句子以简单句为主，但允许混入 1-2 个稍高级的词汇和句型，像真人聊天，不要太难。\n'
      + '考生会给你一个 Part 1 问题和她的个人素材（人设/经历）。\n'
      + '请按固定框架生成英文回答，一共 3-4 句：\n'
      + '第 1 句：直接表态，口语化开头（Yes, I do. / No, not really. / Definitely. / To be honest, ... 等），不绕弯子。\n'
      + '第 2-4 句：给原因并自然展开，把考生人设细节（身份/城市/爱好等）自然揉进回答，像真人聊天。\n'
      + '「稍高级」示例（整段只混入 1-2 个稍高级结构，别句句都用）：like → be really into；good → enjoyable；可加一个 because/when 从句或 who/which 定语从句（如 the doctor who gave me medicine / a book which helps me relax）；可用 to be honest / actually / I\'d say 过渡。\n'
      + '要求：不要写复杂长句；不要超过 4 句；只使用素材里有的信息，不编造；输出严格 JSON：{"answer":"英文回答"}，不要任何解释文字。';
    const content = await callRelay('speaking_aihelper', [
      { role:'system', content: sys },
      { role:'user', content:'P1 题目：' + questionText + '\n\n考生个人素材：\n' + (persona || '（暂无素材，请用通用回答）') }
    ], 0.7);
    const j = aiJson(content);
    if(j && j.answer){
      s.answers = s.answers || {};
      s.answers[qi] = s.answers[qi] || {};
      s.answers[qi].aiHelper = { answer: j.answer, ts: Date.now(), result: content };
      s.updatedAt = Date.now();
      hubSave();
      if(ta) ta.value = j.answer;
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
  el.innerHTML = '<div class="diag-sec"><b>✨ 已按你的人设生成（已填入作答框，可改）</b><div class="diag-rewrite">' + escapeHtml(ai.answer) + '</div></div>'
    + '<div class="diag-note">💡 直接照着说，或改成自己的话；说/写好后点「🤖 AI 诊断」看点评。</div>';
  el.style.display = 'block';
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
  + '你的任务：把全部经历整合成**几个完整核心小故事**（数量灵活：看内容 + 对照下方 P2 全题型来定，目标是以最少的Story覆盖最多的题，通常 3~5 个，但不要凑数）。每个故事都能让考生直接背、用简单句讲出来。\n'
  + '规则：\n'
  + '1. 故事必须基于考生原话，真实不编造；可合并相关经历，不虚构细节。\n'
  + '2. 每个故事含：title(标题) / storyEn(一段英文小故事，全部**简单句**、基础词汇，契合口语 5.5 水平，长度适中不要太长，可直接背；要像**连贯的小故事**而不是清单，避免连续用同一主语/同一动词/同一连接词堆砌，适当用 and, so, because, actually 等过渡让叙事流畅) / logicZh(中文**逻辑链**：用若干中文短语以 "—"（中文横杠/破折号）串接，把故事的关键步骤、转折、感受、细节都铺开——越长越细越好、数量不固定，例如"朋友送手机壳—觉得很有心—每天用手机—看到就想起朋友—珍藏") / coverage(能套的 P2 题族数组)。\n'
  + '3. coverage 每个元素：{"topic":"题族名","fit":"natural|loose","note":"串题连接说明(给一句怎么把本故事套到该题，如\'旅行中意识到环保法重要→套法律法规\';natural可简写)"}。\n'
  + '4. 串题很抽象，**搭边就行**：coverage 不限于自然贴合的题，偏题（法律/规则/传统/人物/挑战…）只要能扯上关系就列，并给自然的连接说明。目标是背完这几个故事，大部分 P2 题都能套。\n'
  + '5. 不要产出 keyword 骨架 / 不要拆分多切面列表——考生基础弱，给词也不会说句型，必须给**成段的简单句英文**让她背。\n'
  + '6. 判断素材是否够覆盖：对照 P2 全题型，如果现有经历明显缺某大类（如完全没提人或完全没提地点），且补 1-3 个问题就能补上，则在 followups 返回这些问题；如果已经够广，followups 返回空数组。\n'
  + 'P2 全题型参考：' + CANON.join('、') + '\n'
  + '输出严格 JSON：{"stories":[{"title":"","storyEn":"","logicZh":"","coverage":[{"topic":"","fit":"","note":""}]}],"followups":["还想了解的问题1","问题2"]}';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';
  const SYS_GAP = '你是雅思 P2 覆盖分析师。给定已被素材（含搭边串题）覆盖的 P2 题族，以及常见 IELTS P2 题族清单，请列出**连搭边都难覆盖**、且该用户大概率会考到的题族（最多 6 条），每条给一句补救建议（补真实小记忆 或 用 P2 公式现场编）。只列真正缺口，不要编造已覆盖的。输出严格 JSON 数组：[{"topic":"题族","advice":"建议"}]';

  let store = null;
  let mode = 'q';

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){ s.answers = s.answers || {}; s.answers.extraMore = s.answers.extraMore || []; s.answers.followups = s.answers.followups || []; s.materials = s.materials || []; s.gaps = s.gaps || []; s.followups = s.followups || []; DATA.materials = s; return s; }
    }catch(_){}
    return { persona:null, materials:[], gaps:[], followups:[], answers:{ extraMore:[], followups:[] } };
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
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen">🚀 生成我的专属素材</button><button class="mat-add" id="matAdd">＋ 添加一段经历</button></div>';
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
    const content = await callRelay('material', [ { role:'system', content:SYS_MAT }, { role:'user', content:user } ], 0.8);
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
    return arr.filter(g => g && g.topic).map(g => ({ topic:String(g.topic), advice:String(g.advice || '补一个真实相关的小记忆，或用 P2 公式现场编。') }));
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
    return CANON.filter(t => !covered.includes(t)).slice(0, 6).map(t => ({ topic:t, advice:'补一个真实相关的小记忆（3 句话骨架），或用 P2 公式现场编。' }));
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
      const covHtml = (m.coverage || []).map(c => {
        const badge = c.fit === 'loose' ? '<span class="mat-cov-badge loose">搭边</span>' : '<span class="mat-cov-badge nat">自然</span>';
        const note = c.note ? '<span class="mat-cov-note">串：' + escapeHtml(c.note) + '</span>' : '';
        return '<span class="mat-cov-item">' + badge + escapeHtml(c.topic) + note + '</span>';
      }).join('');
      h += '<div class="mat-mat" data-i="' + i + '">'
        + '<div class="mat-mat-head" data-toggle="' + i + '"><span class="mat-mat-title">' + escapeHtml(m.title || '未命名') + '</span>'
        + '<span class="mat-mat-cov">覆盖 ' + (m.coverage ? m.coverage.length : 0) + ' 题</span><span class="mat-caret">▶</span></div>'
        + '<div class="mat-body">'
        + (m.storyEn ? '<div class="mat-sub">英文可背（简单句）</div><div class="mat-story-en">' + escapeHtml(m.storyEn) + '</div>' : '')
        + (m.logicZh ? '<div class="mat-sub">中文逻辑链</div><div class="mat-logic">' + escapeHtml(m.logicZh) + '</div>' : '')
        + '<div class="mat-sub">可套的 P2 题（搭边也行）</div><div class="mat-cov-list">' + (covHtml || '<span class="mat-cov-item">（无）</span>') + '</div>'
        + '<div class="mat-mat-actions"><button class="mat-mini" data-regen-all="1">重新生成全部</button><button class="mat-mini danger" data-del="' + i + '">删除</button></div>'
        + '</div></div>';
    });
    // 追问区（AI 觉得素材还不够广，继续追问）
    if(store.followups && store.followups.length){
      h += '<div class="mat-followup"><h3>🤖 AI 想再问几个问题来补全覆盖</h3>';
      store.followups.forEach((q, i) => {
        h += '<div class="mat-q"><div class="mat-q-head">' + escapeHtml(q) + '</div><textarea data-followup="' + i + '" placeholder="你的回答…">' + escapeHtml((store.answers.followups && store.answers.followups[i] ? store.answers.followups[i].a : '') || '') + '</textarea></div>';
      });
      h += '<button class="btn btn-primary" id="matContinue">继续生成（含补充回答）</button></div>';
    }
    // 缺口
    if(store.gaps && store.gaps.length){
      h += '<div class="mat-gaps"><h3>⚠️ 连搭边都难覆盖的题（诚实兜底，不硬套）</h3>';
      store.gaps.forEach(g => { h += '<div class="mat-gap"><span class="gt">' + escapeHtml(g.topic) + '</span><span class="ga">' + escapeHtml(g.advice) + '</span></div>'; });
      h += '</div>';
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
        store.materials.splice(i, 1);
        saveStore();
        // 删除后立即上传云端，避免 1.5s 防抖窗口内刷新/切设备导致旧卡从云端合并回来
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
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
      saveStore();
      generate();
    };
    $('#matRegen').onclick = () => { mode = 'q'; render(); };
    const gp = $('#matGoPractice'); if(gp) gp.onclick = () => { const p1 = document.querySelector('#tabs [data-type="P1"]'); if(p1) p1.click(); };
  }

  return { init, render };
})();

