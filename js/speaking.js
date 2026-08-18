/* === 口语题库（极简版） === */
var curType = 'P1';
var curFreq = 'all';
var curCat = 'all';
var curSearch = '';
var curDetailId = null;
var FREQ_ORDER = { ultra:0, must:1, high:2, medium:3, normal:4 };

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
      if(t === 'MOCK'){
        $('#listView').hidden = true; $('#detailView').hidden = true;
        $('#mockView').hidden = false;
      } else {
        curType = t;
        $('#mockView').hidden = true; $('#detailView').hidden = true;
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

  // 保存
  html += '<div class="sp-detail-actions"><button class="btn btn-primary" id="saveBtn">保存</button><button class="btn btn-danger" id="delSpBtn">删除此题</button></div>';

  $('#detailBody').innerHTML = html;

  // 绑定事件
  $('#saveBtn').addEventListener('click', () => saveDetail(id));
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
  hubSave();
  $('#detailView').hidden = true;
  $('#listView').hidden = false;
  curDetailId = null;
  renderList();
  toast('已删除该口语题（不再被默认题库恢复）');
}

/* === 素材生成器联动：P2 抽题命中个人素材 → AI 自动匹配串题方案 === */
function matLoadStore(){
  try{ const s = JSON.parse(localStorage.getItem('ielts_materials_v1')); if(s && Array.isArray(s.materials)) return s; }catch(_){}
  return null;
}

function matHint(s){
  const el = document.getElementById('spMatHint'); if(!el) return;
  const store = matLoadStore();
  const n = (store && store.materials) ? store.materials.length : 0;
  if(n === 0){
    el.innerHTML = '<span class="muted">还没生成万能素材，先去「万能素材」页填问卷生成。</span>';
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
      '自然覆盖题族：' + (m.coverage || []).join('、') + '\n' +
      '多切面：' + JSON.stringify(m.facets || {}) + '\n' +
      '英文骨架：' + ((m.skeleton && m.skeleton.en) || []).join(' / ') + '\n' +
      '中文对照：' + ((m.skeleton && m.skeleton.zh) || []).join(' / ')
    ).join('\n---\n');

    const sys = '你是雅思口语 P2 串题老师。考生已有一份「万能素材库」，每条素材都来自她的真实经历，包含可覆盖的题族、多切面、英文 keyword 骨架。\n' +
      '你的任务：针对当前 P2 题目，自动判断应该用哪 1-3 条素材来串这道题；如果单条素材不够覆盖题目所有小问，可以把多条素材的片段**拼凑**成一个完整、自然的故事。\n' +
      '输出要求：\n' +
      '1) materials：用了哪几条素材（标题数组，1-3 个）；\n' +
      '2) steps：分 3-5 段（每段给 part/content/source/type），type=fixed 表示可直接复用素材里的固定内容，type=user 表示需要考生自己现场补充；\n' +
      '3) sample：一段 1.5-2 分钟、自然口语化的英文参考范文（简单句型为主，符合口语 5.5 水平）；\n' +
      '4) gaps：需要考生自己补充的细节清单（中文）。\n' +
      '严格只输出如下 JSON：{"materials":["..."],"steps":[{"part":"开头","content":"中文讲述要点","source":"来自素材X","type":"fixed|user"}],"sample":"英文范文","gaps":["..."]}，不要任何解释文字。';

    const user = 'P2 题目：' + (s.promptEn || s.title || '') +
      '\n中文题意：' + (s.promptZh || '') +
      '\nYou should say: ' + ((s.youShouldSay || []).join('; ')) +
      '\n\n考生的万能素材库：\n' + matsText;

    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);

    if(j && (Array.isArray(j.steps) || j.sample)){
      s.answers = s.answers || {};
      s.answers.p2 = s.answers.p2 || {};
      s.answers.p2.aiStoryLink = { ...j, ts: Date.now(), raw: content };
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
  h += '<div class="mat-plan-head">🧩 AI 串题方案</div>';
  if(j.materials && j.materials.length){
    h += '<div class="mat-plan-mats">' + j.materials.map(m => '<span class="mat-plan-mat">' + escapeHtml(m) + '</span>').join('') + '</div>';
  }
  if(Array.isArray(j.steps)){
    j.steps.forEach((st, i) => {
      const isFixed = st.type === 'fixed';
      const tag = isFixed ? '素材固定内容' : '需要你现场补';
      const cls = isFixed ? 'fixed' : 'user';
      h += '<div class="mat-plan-step">'
         + '<div class="mat-plan-step-h"><span>' + escapeHtml(st.part || ('第' + (i + 1) + '段')) + '</span><span class="mat-plan-step-tag ' + cls + '">' + tag + '</span></div>'
         + '<div class="mat-plan-step-p">' + escapeHtml(st.content || '') + '</div>'
         + (st.source ? '<div class="mat-plan-step-src">来源：' + escapeHtml(st.source) + '</div>' : '')
         + '</div>';
    });
  }
  if(j.sample){
    h += '<div class="mat-plan-step"><div class="mat-plan-step-h">参考范文</div><div class="mat-plan-step-key">' + escapeHtml(j.sample) + '</div></div>';
  }
  if(j.gaps && j.gaps.length){
    h += '<div class="mat-plan-gaps"><b>需要你自己补充的细节</b><ul>' + j.gaps.map(g => '<li>' + escapeHtml(g) + '</li>').join('') + '</ul></div>';
  }
  h += '<div class="mat-plan-tips">💡 方案根据你的万能素材库自动匹配；点「🔀 AI 串题思路」可重新生成。</div>';
  h += '</div>';
  el.innerHTML = h;
}

/* === 逐题展开 + 语音输入 + AI 语法诊断 === */
// 顶部常量用 var（speaking.js 会被软导航 window.eval 重跑，const 会抛「已声明」）
var SYS_DIAG =
  '你是雅思口语老师。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000，'
  + '需要地道但不过难、句型简单的英文（别用生僻词/复杂从句）。\n'
  + '考生会给出自己对某个口语问题的回答（可能来自语音输入，可能有语法/用词错误）。请完成：\n'
  + '1) 按雅思口语三项评分（流利度与连贯性、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），不要评发音（发音由用户在设置里填固定分）。\n'
  + '2) 指出语法/用词错误：逐条给 原句 → 问题(中文简说，不堆术语) → 修改；没有错误就如实说很少。\n'
  + '3) 在【不改动考生原本思路与想说内容】的前提下，给一版更地道、自然、符合其基础（简单句型、常见词汇）的英文重写。\n'
  + '4) 给 1-2 个可积累的地道替换词/句型（同样简单）。\n'
  + '严格要求只输出如下 JSON（不要任何解释文字，不要输出 pronunciation / overall 字段）：'
  + '{"score":{"fluency":6.0,"vocabulary":5.0,"grammar":5.0},'
  + '"errors":[{"original":"考生原句中的问题片段","issue":"中文简说问题","fix":"修改后片段"}],'
  + '"rewrite":"按原思路的地道简化英文重写","tips":["可积累替换/句型1","可积累替换/句型2"]}';

/* 录音 / 转写功能已移除：口语只保留「文本框手写 + AI 评分 + 提交记录」。发音分取自设置里的固定分。 */

// P2 专用诊断提示词（语法纠错 + 串题素材连接）
var SYS_DIAG_P2 =
  '你是雅思口语老师（专精 Part 2）。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000。'
  + '考生会给出对一道 P2 题目的完整 2 分钟回答。请完成以下任务：\n'
  + '1) 【评分】按雅思口语三项评分标准（流利度与连贯性、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），并给出总分 overall（发音分由用户在设置里填固定分，不参与评分）。\n'
  + '2) 【语法纠错】逐条指出语法/用词错误：原句 → 问题(中文简说) → 修改；没有就如实说很少。\n'
  + '3) 【串题素材连接】考生有若干"万能故事"素材（见用户消息末尾），请分析她的回答思路，然后具体建议：\n'
  + '   - 这个回答可以套用哪个/哪些已有万能素材？\n'
  + '   - 怎么调整措辞让素材更自然地嵌入这道题？\n'
  + '   - 如果当前回答没有用到任何素材，指出哪个素材最适合这道题并给一个嵌入示例。\n'
  + '另外给一版更地道的英文重写（简单句型为主），以及 1-2 个可积累替换。\n'
  + '严格要求只输出如下 JSON：'
  + '{"score":{"overall":5.5,"fluency":6.0,"vocabulary":5.0,"grammar":5.0},'
  + '"errors":[{"original":"原句片段","issue":"问题","fix":"修改"}],'
  + '"rewrite":"地道简化英文重写",'
  + '"storyLink":"具体的串题素材连接建议（中文，2-4 行，告诉考生用哪个素材、怎么嵌到这道题里）",'
  + '"tips":["可积累1","可积累2"]}';

// 单题可点开项 HTML（text=可见文本，qi=题目索引）
function questionItemHtml(text, qi, s){
  const ans = (s && s.answers) ? s.answers[qi] : null;
  return '<li class="sp-q" data-qi="' + qi + '">'
    + '<span class="sp-q-caret">▸</span>'
    + '<span class="sp-q-text">' + escapeHtml(text) + '</span>'
    + '<div class="sp-q-panel" data-qi="' + qi + '" hidden>'
    +   '<div class="sp-mini-tabs">'
    +     '<button class="sp-mini-tab active" data-tab="rec" data-qi="' + qi + '">我的回答</button>'
    +     '<button class="sp-mini-tab" data-tab="custom" data-qi="' + qi + '">定制答案</button>'
    +   '</div>'
    +   '<div class="sp-mini-body" data-body="rec" data-qi="' + qi + '">'
    +     '<textarea class="sp-ans" data-qi="' + qi + '" placeholder="在这里写下你的回答…"></textarea>'
    +     '<div class="sp-rec-list" data-qi="' + qi + '"></div>'
    +     '<div class="sp-q-btns">'
    +       '<button class="sp-diag" data-qi="' + qi + '" type="button">🤖 AI 诊断</button>'
    +       '<button class="sp-ans-clear" data-qi="' + qi + '" type="button">清空</button>'
    +     '</div>'
    +     '<div class="sp-ai-result sp-q-result" data-qi="' + qi + '"></div>'
    +   '</div>'
    +   '<div class="sp-mini-body" data-body="custom" data-qi="' + qi + '" hidden>'
    +     '<div class="sp-custom-target">目标分数 <input type="range" class="sp-custom-score" data-qi="' + qi + '" min="5" max="7" step="0.5" value="6"> <span class="sp-custom-score-val">6.0</span></div>'
    +     '<textarea class="sp-custom-input" data-qi="' + qi + '" placeholder="用中文写下你的思路、关键词或想说的内容…"></textarea>'
    +     '<button class="sp-custom-btn" data-qi="' + qi + '" type="button">生成定制答案</button>'
    +     '<div class="sp-custom-result" data-qi="' + qi + '"></div>'
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
      // 回填定制答案
      const custom = s.answers[qi].custom;
      if(custom){
        const scoreIn = li.querySelector('.sp-custom-score[data-qi="' + qi + '"]');
        const valIn = li.querySelector('.sp-custom-score-val');
        const inputIn = li.querySelector('.sp-custom-input[data-qi="' + qi + '"]');
        const resIn = li.querySelector('.sp-custom-result[data-qi="' + qi + '"]');
        if(scoreIn) scoreIn.value = custom.target || 6;
        if(valIn) valIn.textContent = (custom.target || 6).toFixed(1);
        if(inputIn) inputIn.value = custom.input || '';
        if(resIn && custom.answer) renderCustomResult(resIn, custom);
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

    // 内部 tab 切换
    li.querySelectorAll('.sp-mini-tab[data-qi="' + qi + '"]').forEach(tab => {
      tab.addEventListener('click', e => {
        e.stopPropagation();
        const t = tab.dataset.tab;
        li.querySelectorAll('.sp-mini-tab[data-qi="' + qi + '"]').forEach(x => x.classList.toggle('active', x === tab));
        li.querySelectorAll('.sp-mini-body[data-qi="' + qi + '"]').forEach(b => b.hidden = (b.dataset.body !== t));
      });
    });

    // 目标分数滑块实时显示数值
    const scoreIn = li.querySelector('.sp-custom-score[data-qi="' + qi + '"]');
    if(scoreIn){
      scoreIn.addEventListener('input', () => {
        const v = parseFloat(scoreIn.value).toFixed(1);
        const valEl = li.querySelector('.sp-custom-score-val');
        if(valEl) valEl.textContent = v;
      });
    }

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

    // 定制答案生成
    const customBtn = li.querySelector('.sp-custom-btn[data-qi="' + qi + '"]');
    if(customBtn) customBtn.addEventListener('click', e => {
      e.stopPropagation();
      generateCustomAnswer(id, qi);
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
    const content = await callRelay('speaking_diagnose', messages, 0.6);
    const j = aiJson(content);
    renderDiag(resultEl, j, content);
    s.answers = s.answers || {};
    const oldAns = s.answers[qi] || {};
    const newScore = (j ? parseScore(j.score) : null);
    s.answers[qi] = { ...oldAns, text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: newScore };
    s.answers[qi].records = s.answers[qi].records || [];
    s.answers[qi].records.push({ text: answerText, ts: Date.now(), score: newScore, result: (j ? JSON.stringify(j) : content), raw: content });
    hubSave();
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
    const content = await callRelay('speaking_diagnose', messages, 0.6);
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
    hubSave();
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

// 「定制答案」：输入中文思路 + 目标分数 → AI 生成地道英文回答 + 中文 tips
async function generateCustomAnswer(id, qi){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }

  const li = document.querySelector('.sp-q[data-qi="' + qi + '"]');
  if(!li) return;
  const inputEl = li.querySelector('.sp-custom-input[data-qi="' + qi + '"]');
  const scoreEl = li.querySelector('.sp-custom-score[data-qi="' + qi + '"]');
  const resultEl = li.querySelector('.sp-custom-result[data-qi="' + qi + '"]');
  const btn = li.querySelector('.sp-custom-btn[data-qi="' + qi + '"]');
  const questionText = (s.questions || [])[+qi] || '';
  const input = inputEl ? inputEl.value.trim() : '';
  if(!input){ toast('先写下中文思路'); return; }
  const target = scoreEl ? parseFloat(scoreEl.value) : 6;

  if(btn){ btn.disabled = true; btn.textContent = '生成中…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在生成地道英文表达…</div>'; }

  try{
    const sys = '你是雅思口语老师。考生目标口语分数 ' + target + ' 分。她会先用中文写下自己的思路/关键词，请你据此写一段自然、地道、符合该分数水平的英文回答。不要逐字翻译，要改成英语母语者会说的表达。输出 ONLY JSON：{"answer":"英文回答（口语化、简单句型为主）","tips":"中文说明：做了哪些自然化处理、用了哪些地道表达/句型"}，不要任何解释文字。';
    const content = await callRelay('speaking_custom', [
      { role:'system', content: sys },
      { role:'user', content:'题目：' + questionText + '\n目标分数：' + target + '\n中文思路：' + input }
    ], 0.7);
    const j = aiJson(content);
    if(j && j.answer){
      s.answers = s.answers || {};
      s.answers[qi] = s.answers[qi] || {};
      s.answers[qi].custom = { input, target, answer: j.answer, tips: j.tips || '', ts: Date.now(), result: content };
      hubSave();
      renderCustomResult(resultEl, s.answers[qi].custom);
    } else {
      if(resultEl) resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(content || '') + '</pre>';
    }
  }catch(e){
    if(resultEl) resultEl.innerHTML = '<div class="diag-note">生成失败：' + escapeHtml(e.message) + '</div>';
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '生成定制答案'; }
  }
}

function renderCustomResult(el, custom){
  if(!el || !custom) return;
  el.innerHTML = '<div class="ans">' + escapeHtml(custom.answer) + '</div>'
    + (custom.tips ? '<div class="tips">' + escapeHtml(custom.tips) + '</div>' : '');
}

