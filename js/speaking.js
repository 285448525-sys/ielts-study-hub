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
      if(t === 'CT'){
        $('#listView').hidden = true;
        $('#detailView').hidden = true;
        $('#ctView').hidden = false;
        renderSaved();
      } else {
        curType = t;
        $('#ctView').hidden = true;
        $('#detailView').hidden = true;
        $('#listView').hidden = false;
        renderList();
      }
    });
  });
  $('#ctAskBtn').addEventListener('click', ctAsk);
  $('#ctGenBtn').addEventListener('click', ctGen);
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
    return '<div class="sp-card" data-id="' + s.id + '">'
      + '<div class="sp-card-title">' + escapeHtml(title) + '</div>'
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

  // P1 问题列表（逐题可点开 + 录 + 诊断）
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<div class="sp-q-list-head">Part 1 小问题（点开可语音/手打回答，再让 AI 诊断）</div>';
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i); });
    html += '</ol>';
  }

  // P2 题目描述（prompt 只读上下文；youShouldSay 每个小点逐题可点开）
  if(s.type === 'P2'){
    if(s.promptEn) html += '<div class="sp-prompt">题目：' + escapeHtml(s.promptEn) + '</div>';
    if(s.promptZh) html += '<div class="sp-detail-zh" style="margin-bottom:12px">' + escapeHtml(s.promptZh) + '</div>';
    if(s.youShouldSay && s.youShouldSay.length){
      html += '<div class="sp-q-list-head">You should say（每个小点可点开，录/诊断）</div>';
      html += '<ol class="sp-q-list">';
      s.youShouldSay.forEach((y, i) => { html += questionItemHtml(y, i); });
      html += '</ol>';
    }
  }

  // AI 辅助按钮
  html += '<button class="btn btn-primary" id="aiAssistBtn" style="margin-bottom:12px">AI 辅助</button>';
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
  $('#aiAssistBtn').addEventListener('click', () => aiAssist(id));

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);
}

function saveDetail(id){
  // 详情页已无编辑字段，保存仅作确认提示（数据由每题 AI 诊断结果就地存储）
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

/* === AI 辅助 === */
async function aiAssist(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = $('#aiResult');
  resultEl.style.display = 'block';
  resultEl.textContent = '正在生成…';

  let messages = [];
  if(s.type === 'P1'){
    const q = (s.questions || []).join('\n');
    messages = [
      { role:'system', content:'你是雅思口语老师。针对以下 Part 1 题目，给考生 3 个简短回答方向，每个方向配一句可直接背诵的英文示范（不超过 25 词）。用中文解释方向，英文示范用引号标注。' },
      { role:'user', content:'题目：' + (s.titleEn || s.title) + '\n问题列表：\n' + q + '\n\n请给 3 个方向和示范。' }
    ];
  } else {
    // P2：查找用户的母本素材
    const templates = DATA.speaking.filter(x => x.type === 'P2' && x.framework === 'P2人物母本' && x.content);
    const tplContent = templates.length ? templates.map(t => t.title + '：' + t.content).join('\n\n') : '（暂无母本内容，请先生成通用建议）';
    messages = [
      { role:'system', content:'你是雅思口语老师。考生有一个万能 P2 母本。请根据题目生成：1.母本中哪些素材可以直接套用 2.需要补充或调整哪些细节 3.一段 1.5-2 分钟的口语示范（自然、避免背诵痕迹）。' },
      { role:'user', content:'母本：\n' + tplContent + '\n\n题目：' + (s.promptEn || s.title) + '\n中文：' + (s.promptZh || '') + '\nYou should say: ' + ((s.youShouldSay || []).join('; ')) }
    ];
  }

  try{
    const content = await callRelay('speaking_assist', messages, 0.8);
    resultEl.textContent = content;
  }catch(e){
    resultEl.textContent = 'AI 服务暂不可用：' + e.message + '\n\n请检查「设置」中的 AI 接口地址。';
  }
}

/* === P2 串题（AI 问→写故事→覆盖矩阵） === */
var ctQuestions = [];   // [{q, a}]

/* === 逐题展开 + 语音输入 + AI 语法诊断 === */
// 顶部常量用 var（speaking.js 会被软导航 window.eval 重跑，const 会抛「已声明」）
var SYS_DIAG =
  '你是雅思口语老师。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000，'
  + '需要地道但不过难、句型简单的英文（别用生僻词/复杂从句）。\n'
  + '考生会给出自己对某个口语问题的回答（可能来自语音输入，可能有语法/用词错误）。请：\n'
  + '1) 指出语法/用词错误：逐条给 原句 → 问题(中文简说，不堆术语) → 修改；没有错误就如实说很少。\n'
  + '2) 在【不改动考生原本思路与想说内容】的前提下，给一版更地道、自然、符合其基础（简单句型、常见词汇）的英文重写。\n'
  + '3) 给 1-2 个可积累的地道替换词/句型（同样简单）。\n'
  + '严格要求只输出如下 JSON（不要任何解释文字）：'
  + '{"errors":[{"original":"考生原句中的问题片段","issue":"中文简说问题","fix":"修改后片段"}],'
  + '"rewrite":"按原思路的地道简化英文重写","tips":["可积累替换/句型1","可积累替换/句型2"]}';

var spRec = null; // 当前进行中的语音识别实例

// 单题可点开项 HTML（text=可见文本，qi=题目索引）
function questionItemHtml(text, qi){
  return '<li class="sp-q" data-qi="' + qi + '">'
    + '<span class="sp-q-caret">▸</span>'
    + '<span class="sp-q-text">' + escapeHtml(text) + '</span>'
    + '<div class="sp-q-panel" data-qi="' + qi + '" hidden>'
    + '<div class="sp-ans-row"><button class="sp-mic" data-qi="' + qi + '" type="button">🎤 语音回答</button>'
    + '<span class="sp-mic-hint">说英文；识别不出来就用下方输入框手打/粘贴</span></div>'
    + '<textarea class="sp-ans" data-qi="' + qi + '" placeholder="在这里说出或写下你的回答…"></textarea>'
    + '<div class="sp-q-btns">'
    + '<button class="sp-diag" data-qi="' + qi + '" type="button">🤖 AI 诊断</button>'
    + '<button class="sp-ans-clear" data-qi="' + qi + '" type="button">清空</button>'
    + '</div>'
    + '<div class="sp-ai-result sp-q-result" data-qi="' + qi + '"></div>'
    + '</div></li>';
}

// 绑定每题的展开/收起、语音、诊断、清空；并回填已存答案
function bindQuestionEvents(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  s.answers = s.answers || {};

  // 浏览器不支持语音识别 → 隐藏所有麦克风按钮（手打/粘贴/诊断仍可用）
  if(!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)){
    document.querySelectorAll('.sp-mic').forEach(m => { m.style.display = 'none'; });
  }

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
    }

    // 点开 / 收起（点面板内部不触发）
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

    // 语音
    const mic = li.querySelector('.sp-mic[data-qi="' + qi + '"]');
    if(mic) mic.addEventListener('click', e => { e.stopPropagation(); startVoice(qi); });

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

    // 清空
    const clr = li.querySelector('.sp-ans-clear[data-qi="' + qi + '"]');
    if(clr) clr.addEventListener('click', e => {
      e.stopPropagation();
      if(ta) ta.value = '';
      if(resultEl){ resultEl.innerHTML = ''; resultEl.style.display = 'none'; }
      if(s.answers[qi]){ delete s.answers[qi]; hubSave(); }
    });
  });
}

// 语音输入（原生 Web Speech API，零成本；国内无 VPN 多数浏览器不可用，已兜底）
function startVoice(qi){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ta = document.querySelector('.sp-ans[data-qi="' + qi + '"]');
  const btn = document.querySelector('.sp-mic[data-qi="' + qi + '"]');
  if(!SR){ toast('当前浏览器不支持语音识别，请直接输入'); return; }
  // 已在录音（点同一题）→ 停止
  if(spRec && spRec._qi === qi){
    try{ spRec.stop(); }catch(_){}
    return;
  }
  // 停掉其它进行中的实例
  if(spRec){ try{ spRec.stop(); }catch(_){} }
  const rec = new SR();
  rec._qi = qi;
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = e => {
    let t = '';
    for(let i = 0; i < e.results.length; i++){ t += e.results[i][0].transcript; }
    if(ta) ta.value = t.trim();
  };
  rec.onerror = () => {
    toast('语音识别不可用（可能需联网/浏览器支持），请直接输入');
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = '🎤 语音回答'; }
    spRec = null;
  };
  rec.onend = () => {
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = '🎤 语音回答'; }
    if(spRec && spRec._qi === qi) spRec = null;
  };
  try{
    rec.start();
    spRec = rec;
    if(btn){ btn.classList.add('sp-mic-on'); btn.textContent = '⏹ 停止'; }
  }catch(_){
    toast('语音识别启动失败，请直接输入');
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
    s.answers[qi] = { text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now() };
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

// 渲染诊断结构化卡片
function renderDiag(el, j, raw){
  if(j && Array.isArray(j.errors) && j.rewrite){
    let h = '<div class="diag-sec"><b>① 语法/用词诊断</b>';
    h += j.errors.length
      ? j.errors.map(e => '<div class="diag-err"><span class="diag-orig">' + escapeHtml(e.original || '') + '</span> → <span class="diag-fix">' + escapeHtml(e.fix || '') + '</span><div class="diag-issue">' + escapeHtml(e.issue || '') + '</div></div>').join('')
      : '<div class="diag-ok">没发现明显错误，继续保持～</div>';
    h += '</div>';
    h += '<div class="diag-sec"><b>② 按你思路的地道重写</b><div class="diag-rewrite">' + escapeHtml(j.rewrite) + '</div></div>';
    if(Array.isArray(j.tips) && j.tips.length) h += '<div class="diag-sec"><b>③ 可积累</b><ul>' + j.tips.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul></div>';
    el.innerHTML = h;
  } else {
    el.innerHTML = '<div class="diag-note">（AI 返回非标准格式，已贴原文）</div><pre>' + escapeHtml(raw || '') + '</pre>';
  }
  el.style.display = 'block';
}

function ctTemplates(){
  // 用户已有 P2 母本素材（真实经历），作为写故事的基础
  const t = DATA.speaking.filter(x => x.type === 'P2' && x.framework === 'P2人物母本');
  const text = t.map(x => x.title + '：' + (x.content || x.cue || x.keywords || '')).join('\n');
  return text.trim() ? text : '（暂无母本正文，请仅靠题库生成）';
}

function ctShowLoading(msg){ const el = $('#ctLoading'); el.textContent = msg; el.hidden = false; }
function ctHideLoading(){ $('#ctLoading').hidden = true; }

async function ctAsk(){
  const bank = $('#ctBank').value.trim();
  if(bank.length < 10){ toast('请先粘贴当季 P2 题库（至少几道题）'); return; }
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
  ctShowLoading('正在生成提问…');
  try{
    const sys = '你是雅思口语 P2 串题规划师。考生要背尽量少的万能故事来覆盖当季题库。'
      + '请基于【当季题库】和【考生已有母本素材】，提出 3-5 个最关键的问题，帮考生确认/补充个人真实经历，'
      + '以便写出能串多题的故事。问题要口语化、像老师在聊天，聚焦可用于多个话题的素材（人物关系、难忘经历、擅长的事、去过的地方等）。'
      + '只输出 JSON：{"questions":["问题1","问题2",...]}，不要任何解释文字。';
    const user = '当季 P2 题库：\n' + bank + '\n\n考生已有母本素材：\n' + ctTemplates()
      + '\n\n请提出 3-5 个最有助于串题的挖掘问题（中文）。';
    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);
    if(j && Array.isArray(j.questions) && j.questions.length){
      ctQuestions = j.questions.map(q => ({ q: String(q), a: '' }));
    } else {
      ctQuestions = ctPlainQuestions(content);
    }
    renderCTQuestions();
  }catch(e){
    $('#ctResult').innerHTML = '<div class="ct-loading">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
  }finally{
    ctHideLoading();
  }
}

function ctPlainQuestions(text){
  // 退化解析：按行拆分带序号/项目符号的列表
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const qs = lines
    .map(s => s.replace(/^[\d]+[.、)]\s*/, '').replace(/^[-•·]\s*/, '').trim())
    .filter(s => s.length >= 4 && s.length <= 80);
  return qs.slice(0, 6).map(q => ({ q, a: '' }));
}

function renderCTQuestions(){
  const box = $('#ctQuestions');
  if(!ctQuestions.length){ $('#ctAskBox').hidden = true; return; }
  box.innerHTML = ctQuestions.map((item, i) =>
    '<div class="ct-question"><label>Q' + (i + 1) + '：' + escapeHtml(item.q) + '</label>'
    + '<textarea data-qa="' + i + '" placeholder="你的回答（随便说，细节越多故事越好串）"></textarea></div>'
  ).join('');
  $('#ctAskBox').hidden = false;
}

async function ctGen(){
  const bank = $('#ctBank').value.trim();
  if(bank.length < 10){ toast('请先粘贴当季 P2 题库'); return; }
  // 收集答案
  document.querySelectorAll('#ctQuestions textarea[data-qa]').forEach(t => {
    const i = +t.dataset.qa;
    if(ctQuestions[i]) ctQuestions[i].a = t.value.trim();
  });
  const answered = ctQuestions.filter(q => q.a).map(q => 'Q：' + q.q + '\nA：' + q.a).join('\n\n');
  if(!answered){ toast('先回答几个问题，AI 才能写出属于你的故事'); return; }
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }

  ctShowLoading('正在生成串题故事…');
  try{
    const sys = '你是雅思口语 P2 串题规划师。基于【当季题库】+【考生回答】+【已有母本】，'
      + '设计 2-3 个万能故事（必须来自考生的真实经历/回答，口语化、自然、可讲满 2 分钟），'
      + '让考生背完能覆盖题库大部分题。'
      + '严格要求只输出如下 JSON（不要任何解释文字）：'
      + '{"stories":[{"name":"故事名","keyPoints":"复述线/关键词（中文，1-2 行）",'
      + '"outline":"英文叙事要点，可分点，可夹中文注释","covers":["题库里的原题表述1","原题表述2"...]}],'
      + '"coverage":[{"topic":"题库里的原题表述","story":"对应的故事名 或 null（无覆盖）"}]}。'
      + '规则：① stories 数量为 2 或 3；② coverage 必须逐题覆盖题库里每一道题（topic 用题库里的原表述），'
      + '能串上的写故事名、串不上的写 null；③ 朝最大化覆盖率设计故事；④ 全部用简体中文（outline 英文部分除外）。';
    const user = '当季 P2 题库：\n' + bank + '\n\n考生回答：\n' + answered
      + '\n\n已有母本素材：\n' + ctTemplates() + '\n\n请生成串题方案（严格 JSON）。';
    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);
    if(!j || !Array.isArray(j.stories) || !j.stories.length){
      $('#ctResult').innerHTML = '<div class="ct-scheme"><div class="ct-story-out">AI 返回的不是标准格式，原文如下：\n\n'
        + escapeHtml(content) + '</div></div>';
      return;
    }
    saveScheme({ bank, stories: j.stories, coverage: j.coverage || [] });
    renderSaved();
    $('#ctResult').innerHTML = '';
    $('#ctAskBox').hidden = true;
    ctQuestions = [];
    toast('已生成并保存串题方案');
  }catch(e){
    $('#ctResult').innerHTML = '<div class="ct-loading">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
  }finally{
    ctHideLoading();
  }
}

function ctToStr(v){ return Array.isArray(v) ? v.join(' / ') : (v == null ? '' : String(v)); }

function saveScheme(obj){
  const stories = (obj.stories || []).map(s => ({
    name: ctToStr(s.name) || '故事',
    keyPoints: ctToStr(s.keyPoints),
    outline: ctToStr(s.outline),
    covers: Array.isArray(s.covers) ? s.covers.map(String) : []
  }));
  // 覆盖率：优先用 AI 返回的 coverage，否则按题库行推断
  let coverage = (obj.coverage || []).map(c => ({ topic: ctToStr(c.topic), story: c.story ? String(c.story) : null }));
  if(!coverage.length){
    coverage = ctExtractTopics(obj.bank).map(t => ({ topic: t, story: null }));
  }
  const total = coverage.length;
  const covered = coverage.filter(c => c.story).length;
  DATA.speakingStories.push({
    id: 'ct_' + Date.now(),
    date: ctToday(),
    bank: obj.bank,
    stories,
    coverage,
    total,
    covered
  });
  hubSave();
}

function ctExtractTopics(bank){
  const seen = new Set();
  return String(bank).split('\n').map(s => s.trim()).filter(s => {
    if(s.length < 4 || s.length > 80) return false;
    if(seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

function ctToday(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function renderSaved(){
  const wrap = $('#ctSaved');
  if(!wrap) return;
  const list = DATA.speakingStories || [];
  if(!list.length){
    wrap.innerHTML = '<div class="ct-empty">还没有串题方案。粘贴当季题库，让 AI 帮你编 2-3 个万能故事吧。</div>';
    return;
  }
  wrap.innerHTML = list.slice().reverse().map(scheme => {
    const rate = scheme.total ? Math.round(scheme.covered / scheme.total * 100) : 0;
    const storiesHtml = (scheme.stories || []).map(st => {
      const covers = (st.covers || []).map(c => '<span class="ct-cover-tag">' + escapeHtml(c) + '</span>').join('');
      return '<div class="ct-story">'
        + '<div class="ct-story-name">' + escapeHtml(st.name) + '</div>'
        + (st.keyPoints ? '<div class="ct-story-kp">复述线：' + escapeHtml(st.keyPoints) + '</div>' : '')
        + (st.outline ? '<div class="ct-story-out">' + escapeHtml(st.outline) + '</div>' : '')
        + (covers ? '<div class="ct-covers">' + covers + '</div>' : '')
        + '</div>';
    }).join('');
    const matrixHtml = (scheme.coverage || []).map(c => {
      const sCls = c.story ? 's' : 'none';
      const sTxt = c.story ? escapeHtml(c.story) : '未覆盖';
      return '<div class="ct-matrix-row"><span class="t">' + escapeHtml(c.topic) + '</span>'
        + '<span class="' + sCls + '">' + sTxt + '</span></div>';
    }).join('');
    return '<div class="ct-scheme">'
      + '<div class="ct-scheme-head"><span class="ct-scheme-date">' + escapeHtml(scheme.date || '') + '</span>'
      + '<span class="ct-rate">覆盖率 ' + scheme.covered + '/' + scheme.total + '（' + rate + '%）</span></div>'
      + storiesHtml
      + '<div class="ct-matrix">' + matrixHtml + '</div>'
      + '<button class="ct-del" data-del="' + scheme.id + '">删除此方案</button>'
      + '</div>';
  }).join('');
  wrap.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.del;
      DATA.speakingStories = DATA.speakingStories.filter(x => x.id !== id);
      hubSave();
      renderSaved();
      toast('已删除');
    });
  });
}
