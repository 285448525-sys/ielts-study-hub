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
        renderCTIntro();
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

// === 口语分数解析与展示 ===
function parseScore(score){
  if(!score || score.overall == null) return null;
  const n = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
  return { overall: n(score.overall), fluency: n(score.fluency), pronunciation: n(score.pronunciation), vocabulary: n(score.vocabulary), grammar: n(score.grammar) };
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
    {k:'pronunciation',l:'发音'},
    {k:'vocabulary',l:'词汇'},
    {k:'grammar',l:'语法'}
  ];
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
    html += '<div class="sp-q-list-head">Part 1 小问题（点开可语音/手打回答，再让 AI 诊断）</div>';
    html += '<ol class="sp-q-list">';
    s.questions.forEach((q, i) => { html += questionItemHtml(q, i, s); });
    html += '</ol>';
  }

  // P2 单窗口答题（不分小问题，一次性作答 2 分钟）
  if(s.type === 'P2'){
    if(s.promptEn) html += '<div class="sp-prompt">题目：' + escapeHtml(s.promptEn) + '</div>';
    if(s.promptZh) html += '<div class="sp-detail-zh" style="margin-bottom:12px">' + escapeHtml(s.promptZh) + '</div>';

    html += '<div class="sp-p2-answer">';
    html += '<div class="sp-ans-row">';
    html += '<button class="sp-mic" id="p2Mic" type="button">🎤 开始录音</button>';
    if(s.answers && s.answers.p2 && s.answers.p2.audioId) html += '<button class="sp-play" id="p2Play" type="button">🎧 播放</button>';
    html += '<span id="p2Timer" class="sp-timer" hidden>⏱ 0.0s</span>';
    html += '</div>';
    html += '<textarea class="sp-ans" id="p2Ans" placeholder="在这里说出或写下你的 Part 2 回答（目标说满 2 分钟）…"></textarea>';
    html += '<div class="sp-audio" id="p2Audio"></div>';
    html += '<div class="sp-q-btns">';
    html += '<button class="sp-diag" id="p2Diag" type="button">🤖 AI 评分</button>';
    html += '<button class="sp-ans-clear" id="p2Clear" type="button">清空</button>';
    html += '</div>';
    html += '<div class="sp-q-result" id="p2Result"></div>';
    html += '</div>';
  }

  // AI 辅助按钮
  html += '<button class="btn btn-primary" id="aiAssistBtn" style="margin-bottom:12px">AI 辅助</button>';
  if(s.type === 'P2'){
    html += '<button class="btn btn-primary" id="aiStoryLinkBtn" style="margin-bottom:12px;margin-left:8px">🔀 AI 串题思路</button>';
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
  $('#aiAssistBtn').addEventListener('click', () => aiAssist(id));
  if(s.type === 'P2'){
    const aiStoryLinkBtn = document.getElementById('aiStoryLinkBtn');
    if(aiStoryLinkBtn) aiStoryLinkBtn.addEventListener('click', () => aiStoryLink(id));
  }

  // 逐题展开 + 语音 + AI 诊断 事件绑定（含 localStorage 回填）
  bindQuestionEvents(id);

  // P2 单窗口事件绑定
  if(s.type === 'P2'){
    const p2Mic = document.getElementById('p2Mic');
    if(p2Mic) p2Mic.addEventListener('click', e => { e.stopPropagation(); captureAnswer(null, $('#p2Ans'), p2Mic, true); });
    const p2Play = document.getElementById('p2Play');
    if(p2Play) p2Play.addEventListener('click', e => { e.stopPropagation(); playRecording(s.answers.p2.audioId, $('#p2Audio')); });
    const p2Diag = document.getElementById('p2Diag');
    if(p2Diag) p2Diag.addEventListener('click', e => { e.stopPropagation(); diagnoseP2(id); });
    const p2Clear = document.getElementById('p2Clear');
    if(p2Clear) p2Clear.addEventListener('click', e => {
      e.stopPropagation();
      const ta = $('#p2Ans'); if(ta) ta.value = '';
      const res = $('#p2Result'); if(res){ res.innerHTML = ''; res.style.display = 'none'; }
      stopP2Timer();
      const timerEl = $('#p2Timer'); if(timerEl){ timerEl.hidden = true; timerEl.style.color = ''; }
      // 删录音
      if(s.answers && s.answers.p2 && s.answers.p2.audioId){
        audioStore.del(s.answers.p2.audioId).catch(()=>{});
        delete s.answers.p2.audioId;
      }
      const play = $('#p2Play'); if(play) play.remove();
      const mount = $('#p2Audio'); if(mount) mount.innerHTML = '';
      hubSave();
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
      // 回填录音时长
      if(s.answers.p2.duration){
        const timerEl = $('#p2Timer');
        if(timerEl){ timerEl.hidden = false; timerEl.textContent = '⏱ 上次录音 ' + s.answers.p2.duration; timerEl.style.color = 'var(--muted)'; }
      }
    }
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

/* === AI 辅助 === */
function renderCTIntro(){
  const n = ctBankCount();
  const countEl = $('#ctCount');
  if(countEl) countEl.textContent = String(n);
  const btn = $('#ctAskBtn');
  if(btn) btn.disabled = n === 0;
}

async function aiStoryLink(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
  if(!(DATA.speakingStories || []).length){ toast('还没有串题素材，先去「串题」Tab 生成方案'); return; }

  const resultEl = $('#aiResult');
  resultEl.style.display = 'block';
  resultEl.textContent = '正在生成串题思路…';

  try{
    // 取最近一期串题方案作为素材来源
    const latest = (DATA.speakingStories || []).slice().reverse()[0];
    const storiesText = (latest.stories || []).map(st =>
      '【' + (st.name || '') + '】\n' +
      '复述线：' + (st.keyPoints || '') + '\n' +
      '叙事要点：' + (st.outline || '').slice(0, 500)
    ).join('\n---\n');

    const sys = '你是雅思口语 P2 串题老师。考生已准备以下万能故事素材（来自她的真实经历/回答）。'
      + '请针对当前 P2 题目，给出：1) 推荐用哪个/哪些素材串这道题；2) 具体的串题思路（如何改编细节扣题，中文）；3) 一段 1.5-2 分钟、自然口语化的英文范文（简单句型为主，符合口语 5.5 水平）。'
      + '严格要求只输出如下 JSON：{"link":"串题思路（中文，2-5行）","sample":"英文范文","story":"推荐的故事名"}，不要任何解释文字。';

    const user = 'P2 题目：' + (s.promptEn || s.title || '') +
      '\n中文：' + (s.promptZh || '') +
      '\nYou should say: ' + ((s.youShouldSay || []).join('; ')) +
      '\n\n考生已有的万能故事素材：\n' + storiesText;

    const content = await callRelay('speaking_chuan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.7);
    const j = aiJson(content);
    if(j && (j.link || j.sample)){
      resultEl.innerHTML =
        (j.story ? '<div class="diag-sec"><b>推荐素材</b><div class="diag-rewrite">' + escapeHtml(j.story) + '</div></div>' : '') +
        '<div class="diag-sec"><b>串题思路</b><div class="diag-note">' + escapeHtml(j.link || '') + '</div></div>' +
        '<div class="diag-sec"><b>参考范文</b><div class="diag-rewrite">' + escapeHtml(j.sample || '') + '</div></div>';
    } else {
      resultEl.innerHTML = '<div class="diag-note">AI 返回非标准格式，原文如下：</div><pre>' + escapeHtml(content) + '</pre>';
    }
  }catch(e){
    resultEl.textContent = 'AI 服务暂不可用：' + e.message + '\n\n请检查「设置」中的 AI 接口地址。';
  }
}

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
  + '考生会给出自己对某个口语问题的回答（可能来自语音输入，可能有语法/用词错误）。请完成：\n'
  + '1) 按雅思口语四项评分标准（流利度与连贯性、发音、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），并给出总分 overall。\n'
  + '2) 指出语法/用词错误：逐条给 原句 → 问题(中文简说，不堆术语) → 修改；没有错误就如实说很少。\n'
  + '3) 在【不改动考生原本思路与想说内容】的前提下，给一版更地道、自然、符合其基础（简单句型、常见词汇）的英文重写。\n'
  + '4) 给 1-2 个可积累的地道替换词/句型（同样简单）。\n'
  + '严格要求只输出如下 JSON（不要任何解释文字）：'
  + '{"score":{"overall":5.5,"fluency":6.0,"pronunciation":5.5,"vocabulary":5.0,"grammar":5.0},'
  + '"errors":[{"original":"考生原句中的问题片段","issue":"中文简说问题","fix":"修改后片段"}],'
  + '"rewrite":"按原思路的地道简化英文重写","tips":["可积累替换/句型1","可积累替换/句型2"]}';

var spRec = null; // 当前进行中的语音识别实例（旧 Web Speech 路径已弃用为主路径，仅 legacyTranscribe 兜底用）

/* === 新语音流程：录→存→云转（取代不稳定的 Web Speech 单句识别）===
   根因：原 startVoice 用 webkitSpeechRecognition（continuous=false），一停顿就 onend 关掉，
   且走 Google 服务器，农村网络抖就 onerror。现改为：MediaRecorder 本地连续录 →
   存 IndexedDB → 网络稳时调 /api/asr（腾讯云）转文字。Web Speech 仅作未配 Key 时的降级。 */

var _recActive = false; // captureAnswer 防重入 / 切换标志

function hasWebSpeech(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// 降级：用浏览器原生 Web Speech 实时识别（需网络/浏览器支持），continuous=true 减少自动关
function legacyTranscribe(ta){
  return new Promise(function(resolve, reject){
    if(!hasWebSpeech()){ reject(new Error('no webspeech')); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    let buf = '';
    rec.onresult = function(e){ for(let i=0;i<e.results.length;i++){ buf += e.results[i][0].transcript; } if(ta) ta.value = buf.trim(); };
    rec.onerror = function(){ try{ rec.stop(); }catch(_){} reject(new Error('浏览器语音识别失败')); };
    rec.onend = function(){ try{ rec.stop(); }catch(_){} resolve(buf.trim()); };
    try{ rec.start(); toast('正在用浏览器语音识别（说完会自动停止；也可直接手打/粘贴）'); }
    catch(e){ reject(e); }
  });
}

// 前端 → Worker：POST /api/asr {audio: base64 wav, engine:'16k_en'} → {text}
async function transcribeViaWorker(blob){
  const b64 = await blobToBase64(blob);
  const res = await fetch('/api/asr', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ audio: b64, engine:'16k_en' }) });
  if(!res.ok){ if(res.status === 503) throw new Error('未配置云端识别'); throw new Error('识别失败'); }
  const j = await res.json().catch(()=>({}));
  return (j && j.text) || '';
}

// 主流程：录音 → 存本地 → 转文字（云优先，Web Speech 降级，再不行手打）
async function captureAnswer(qi, ta, btn, isP2){
  const s = DATA.speaking.find(x => x.id === curDetailId);
  if(!s) return;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('当前浏览器不支持录音，请直接手打/粘贴'); return;
  }
  if(_recActive){ // 再点一次 = 停止
    _recActive = false;
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = isP2 ? '🎤 开始录音' : '🎤 语音回答'; }
    if(isP2) stopP2Timer();
    try{
      const r = await stopRecorder();
      if(r) await storeAndTranscribe(s, qi, ta, r.blob, r.duration, isP2);
    }catch(e){ toast('录音结束失败：' + (e && e.message ? e.message : e)); }
    return;
  }
  // 开始
  _recActive = true;
  if(btn){ btn.classList.add('sp-mic-on'); btn.textContent = '⏹ 停止'; }
  if(isP2) startP2Timer($('#p2Timer'));
  try{
    const r = await startRecorder({ autoStopMs: isP2 ? 120000 : 0 });
    _recActive = false;
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = isP2 ? '🎤 开始录音' : '🎤 语音回答'; }
    if(isP2) stopP2Timer();
    if(r) await storeAndTranscribe(s, qi, ta, r.blob, r.duration, isP2);
  }catch(e){
    _recActive = false;
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = isP2 ? '🎤 开始录音' : '🎤 语音回答'; }
    if(isP2) stopP2Timer();
    toast('无法录音：' + (e && e.message ? e.message : '请检查麦克风权限'));
  }
}

async function storeAndTranscribe(s, qi, ta, blob, duration, isP2){
  const key = isP2 ? 'p2' : String(qi);
  s.answers = s.answers || {};
  s.answers[key] = s.answers[key] || {};
  // 存录音到 IndexedDB（不进 DATA / 云端）
  let audioId = null;
  try{ audioId = await audioStore.put(blob, { qi: String(qi), isP2: !!isP2, ts: Date.now() }); }
  catch(e){ toast('本地录音存储不可用（可能是隐私模式），将无法回放'); }
  s.answers[key].audioId = audioId;
  s.answers[key].duration = duration;
  s.answers[key].ts = Date.now();
  // 转写
  let text = '';
  if(DATA.settings.asrOn !== false){
    try{ text = await transcribeViaWorker(blob); }catch(e){ /* 降级 */ }
  }
  if(!text && hasWebSpeech()){
    try{ text = await legacyTranscribe(ta); }catch(_){}
  }
  if(text && ta){ ta.value = text; }
  else if(!text){ toast('云端识别不可用，可直接手打/粘贴'); }
  hubSave();
  refreshPlayButton(s, qi, isP2);
}

// 录音存好后，若面板还没播放按钮则补一个
function refreshPlayButton(s, qi, isP2){
  const key = isP2 ? 'p2' : String(qi);
  const ans = s.answers && s.answers[key];
  if(!ans || !ans.audioId) return;
  if(isP2){
    const mic = $('#p2Mic');
    const row = mic ? mic.parentElement : null;
    if(row && !$('#p2Play')){
      const b = document.createElement('button');
      b.id = 'p2Play'; b.className = 'sp-play'; b.type = 'button'; b.textContent = '🎧 播放';
      b.addEventListener('click', e => { e.stopPropagation(); playRecording(ans.audioId, $('#p2Audio')); });
      row.appendChild(b);
    }
  } else {
    const li = document.querySelector('.sp-q[data-qi="' + qi + '"]');
    if(!li) return;
    const row = li.querySelector('.sp-ans-row');
    if(row && !li.querySelector('.sp-play[data-qi="' + qi + '"]')){
      const b = document.createElement('button');
      b.className = 'sp-play'; b.type = 'button'; b.setAttribute('data-qi', qi); b.textContent = '🎧 播放';
      b.addEventListener('click', e => { e.stopPropagation(); playRecording(ans.audioId, li.querySelector('.sp-audio[data-qi="' + qi + '"]')); });
      row.appendChild(b);
    }
  }
}

// 播放：从 IndexedDB 取 blob → <audio controls> 播放
async function playRecording(audioId, mountEl){
  if(!audioId) return;
  const blob = await audioStore.get(audioId);
  if(!blob){ toast('录音本地已丢失'); return; }
  const url = URL.createObjectURL(blob);
  if(mountEl){
    mountEl.innerHTML = '';
    const a = document.createElement('audio');
    a.src = url; a.controls = true; a.className = 'sp-audio-el';
    mountEl.appendChild(a);
    if(a.play) a.play().catch(()=>{});
  }
}

// P2 专用诊断提示词（语法纠错 + 串题素材连接）
var SYS_DIAG_P2 =
  '你是雅思口语老师（专精 Part 2）。考生：女生，大三CS在读，目标总分6.0、口语5.5；词汇量约4000。'
  + '考生会给出对一道 P2 题目的完整 2 分钟回答。请完成以下任务：\n'
  + '1) 【评分】按雅思口语四项评分标准（流利度与连贯性、发音、词汇资源、语法多样性及准确性）逐项打分（0-9，可含0.5），并给出总分 overall。\n'
  + '2) 【语法纠错】逐条指出语法/用词错误：原句 → 问题(中文简说) → 修改；没有就如实说很少。\n'
  + '3) 【串题素材连接】考生有若干"万能故事"素材（见用户消息末尾），请分析她的回答思路，然后具体建议：\n'
  + '   - 这个回答可以套用哪个/哪些已有万能素材？\n'
  + '   - 怎么调整措辞让素材更自然地嵌入这道题？\n'
  + '   - 如果当前回答没有用到任何素材，指出哪个素材最适合这道题并给一个嵌入示例。\n'
  + '另外给一版更地道的英文重写（简单句型为主），以及 1-2 个可积累替换。\n'
  + '严格要求只输出如下 JSON：'
  + '{"score":{"overall":5.5,"fluency":6.0,"pronunciation":5.5,"vocabulary":5.0,"grammar":5.0},'
  + '"errors":[{"original":"原句片段","issue":"问题","fix":"修改"}],'
  + '"rewrite":"地道简化英文重写",'
  + '"storyLink":"具体的串题素材连接建议（中文，2-4 行，告诉考生用哪个素材、怎么嵌到这道题里）",'
  + '"tips":["可积累1","可积累2"]}';

// 单题可点开项 HTML（text=可见文本，qi=题目索引）
function questionItemHtml(text, qi, s){
  const ans = (s && s.answers) ? s.answers[qi] : null;
  const hasAudio = ans && ans.audioId;
  return '<li class="sp-q" data-qi="' + qi + '">'
    + '<span class="sp-q-caret">▸</span>'
    + '<span class="sp-q-text">' + escapeHtml(text) + '</span>'
    + '<div class="sp-q-panel" data-qi="' + qi + '" hidden>'
    + '<div class="sp-ans-row"><button class="sp-mic" data-qi="' + qi + '" type="button">🎤 语音回答</button>'
    + (hasAudio ? '<button class="sp-play" data-qi="' + qi + '" type="button">🎧 播放</button>' : '')
    + '<span class="sp-mic-hint">说英文；识别不出来就用下方输入框手打/粘贴</span></div>'
    + '<textarea class="sp-ans" data-qi="' + qi + '" placeholder="在这里说出或写下你的回答…"></textarea>'
    + '<div class="sp-audio" data-qi="' + qi + '"></div>'
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

  // 浏览器不支持录音（getUserMedia）→ 隐藏所有麦克风按钮（手打/粘贴/诊断仍可用）
  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
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

    // 语音（录→存→云转）
    const mic = li.querySelector('.sp-mic[data-qi="' + qi + '"]');
    if(mic) mic.addEventListener('click', e => { e.stopPropagation(); captureAnswer(qi, ta, mic, false); });

    // 播放录音
    const play = li.querySelector('.sp-play[data-qi="' + qi + '"]');
    if(play) play.addEventListener('click', e => { e.stopPropagation(); playRecording(s.answers[qi].audioId, li.querySelector('.sp-audio[data-qi="' + qi + '"]')); });

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
      const ans = s.answers[qi];
      if(ans && ans.audioId){ audioStore.del(ans.audioId).catch(()=>{}); }
      const playBtn = li.querySelector('.sp-play[data-qi="' + qi + '"]');
      if(playBtn) playBtn.remove();
      const mount = li.querySelector('.sp-audio[data-qi="' + qi + '"]');
      if(mount) mount.innerHTML = '';
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

// ====== P2 专用：录音计时 ======
var p2TimerStart = null;   // Date.now()
var p2TimerInterval = null; // setInterval ID
var p2LastDuration = '';    // 停止时冻结的最终时长

function startP2Voice(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ta = $('#p2Ans');
  const btn = $('#p2Mic');
  const timerEl = $('#p2Timer');
  if(!SR){ toast('当前浏览器不支持语音识别，请直接输入'); return; }

  // 已在录音 → 停止
  if(spRec && spRec._qi === '__p2__'){
    try{ spRec.stop(); }catch(_){}
    return;
  }
  if(spRec){ try{ spRec.stop(); }catch(_){} }

  const rec = new SR();
  rec._qi = '__p2__';
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = true;   // P2 连续录音（不像 P1 单句）
  rec.onresult = e => {
    let t = '';
    for(let i = 0; i < e.results.length; i++){ t += e.results[i][0].transcript; }
    if(ta) ta.value = t.trim();
  };
  rec.onerror = () => {
    stopP2Timer();
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = '🎤 开始录音'; }
    spRec = null;
    toast('语音识别不可用，请直接输入');
  };
  rec.onend = () => {
    stopP2Timer();
    if(btn){ btn.classList.remove('sp-mic-on'); btn.textContent = '🎤 开始录音'; }
    if(spRec && spRec._qi === '__p2__') spRec = null;
  };

  try{
    rec.start();
    spRec = rec;
    if(btn){ btn.classList.add('sp-mic-on'); btn.textContent = '⏹ 停止录音'; }
    startP2Timer(timerEl);
  }catch(_){
    toast('语音启动失败');
  }
}

function startP2Timer(el){
  if(!el) el = $('#p2Timer');
  stopP2Timer();          // 防重复
  el.hidden = false;
  p2TimerStart = Date.now();
  p2TimerInterval = setInterval(() => {
    const sec = ((Date.now() - p2TimerStart) / 1000).toFixed(1);
    el.textContent = '⏱ ' + sec + 's';
    // 超过 120 秒标红提醒
    el.style.color = parseFloat(sec) >= 120 ? 'var(--danger)' : 'var(--ink)';
  }, 100);
}

function stopP2Timer(){
  if(p2TimerInterval){
    clearInterval(p2TimerInterval);
    p2TimerInterval = null;
    if(p2TimerStart) p2LastDuration = ((Date.now() - p2TimerStart) / 1000).toFixed(1) + 's';
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
    s.answers[qi] = { text: answerText, result: (j ? JSON.stringify(j) : content), ts: Date.now(), score: (j ? parseScore(j.score) : null) };
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

    // 存结果
    s.answers = s.answers || {};
    s.answers.p2 = { text: answer, result: (j ? JSON.stringify(j) : content), ts: Date.now(), duration: p2TimerInterval ? ((Date.now() - p2TimerStart)/1000).toFixed(1) + 's' : p2LastDuration, score: (j ? parseScore(j.score) : null) };
    hubSave();

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

function ctBankText(){
  // 自动从口语题库读取所有 Part 2 题目，一行一题，作为串题目标
  const list = (DATA.speaking || []).filter(s => s.type === 'P2');
  return list.map(s => {
    let t = s.promptEn || s.titleEn || s.title || '';
    if(s.promptZh || s.titleZh) t += ' | ' + (s.promptZh || s.titleZh);
    if(s.youShouldSay && s.youShouldSay.length) t += ' | You should say: ' + s.youShouldSay.join('; ');
    return t;
  }).join('\n');
}
function ctBankCount(){ return (DATA.speaking || []).filter(s => s.type === 'P2').length; }
function ctP2List(){ return (DATA.speaking || []).filter(s => s.type === 'P2'); }
function ctBankNumbered(){
  // 带编号的题库，编号与 ctP2List() 顺序一致（1-based），供 AI 在 coverage 中按 idx 回填
  return ctP2List().map((s, i) => (i + 1) + '. ' + ((s.promptZh || s.titleZh || s.promptEn || s.title || '').trim() || ('第 ' + (i + 1) + ' 题')));
}
function ctTopicText(s){
  return ((s.promptZh || s.titleZh || s.promptEn || s.title || '').trim()) || ('第 ' + (ctP2List().indexOf(s) + 1) + ' 题');
}
function ctFreqGroup(f){ return (f === 'ultra' || f === 'high' || f === 'must') ? 'high' : 'rest'; }
function ctResolveIdx(topic){
  // 兼容旧方案（coverage 只有自由文本 topic 无 idx）：用文本子串回推题库行号
  if(topic == null) return null;
  const list = ctP2List();
  const t = String(topic).trim();
  if(!t) return null;
  for(let i = 0; i < list.length; i++){
    const tt = ctTopicText(list[i]);
    if(tt === t || tt.indexOf(t) >= 0 || t.indexOf(tt) >= 0) return i + 1;
  }
  return null;
}
function ctUncoveredHighTopics(){
  // 当前所有方案并集仍未覆盖且频率为高优(超高频/高频/必考)的题，用于多轮补洞提问
  const list = ctP2List();
  const covered = {};
  (DATA.speakingStories || []).forEach(scheme => (scheme.coverage || []).forEach(c => {
    let idx = c.idx != null ? c.idx : ctResolveIdx(c.topic);
    if(idx != null && idx >= 1 && idx <= list.length && c.story) covered[idx] = true;
  }));
  return list.map((s, i) => ({ idx: i + 1, s }))
    .filter(o => !covered[o.idx] && ctFreqGroup(o.s.frequency) === 'high')
    .map(o => o.idx + '. ' + ctTopicText(o.s));
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
  const bank = ctBankText();
  const n = ctBankCount();
  if(n === 0){ toast('题库中还没有 Part 2 题目，请先去「Part 2」列表导入'); return; }
  if(bank.length < 10){ toast('题库中 Part 2 题目不足'); return; }
  if(!DATA.settings.relayToken){ toast('请先在「设置 / AI 接口」配置 API Key'); return; }
  ctShowLoading('正在生成提问…');
  try{
    const sys = '你是雅思口语 P2 串题规划师。考生要背尽量少的万能故事来覆盖当季题库，'
      + '且必须保证【超高频/高频/必考题】100% 被覆盖。请基于【当季题库】和【考生已有母本素材】，'
      + '提出 3-5 个最关键的问题，帮考生确认/补充个人真实经历，以便写出能串多题（尤其高频题）的故事。'
      + '问题要口语化、像老师在聊天，聚焦可用于多个话题的素材（人物关系、难忘经历、擅长的事、去过的地方、常用物品等）。'
      + '如果提供了「仍未覆盖的高频题」，请优先问能补这些题的素材。'
      + '只输出 JSON：{"questions":["问题1","问题2",...]}，不要任何解释文字。';
    const miss = ctUncoveredHighTopics();
    const missCtx = miss.length
      ? ('\n\n⚠️ 当前已生成方案中，以下【超高频/高频/必考】题仍未覆盖，请重点问能补这些题的个人素材：\n' + miss.join('\n'))
      : '';
    const user = '当季 P2 题库：\n' + bank + '\n\n考生已有母本素材：\n' + ctTemplates() + missCtx
      + '\n\n请提出 3-5 个最有助于串题（尤其补足高频缺口）的挖掘问题（中文）。';
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
  const bank = ctBankText();
  const n = ctBankCount();
  if(n === 0){ toast('题库中还没有 Part 2 题目'); return; }
  if(bank.length < 10){ toast('题库中 Part 2 题目不足'); return; }
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
    const sys = '你是雅思口语 P2 串题规划师。基于【当季题库(带编号)】+【考生回答】+【已有母本】，'
      + '设计"尽可能少"的万能故事（数量由你决定，通常 3-5 个，但不得多于必要；目标：用最少故事覆盖最多题），'
      + '让考生背完能覆盖题库尽量多的题，并优先保证频率标记为 超高频/高频/必考题(ultra/high/must) 的题目 100% 被覆盖'
      + '（这些题 story 绝不能为 null，除非确实完全无法串）。故事必须来自考生的真实经历/回答，口语化、自然、可讲满 2 分钟。'
      + '严格要求只输出如下 JSON（不要任何解释文字）：'
      + '{"stories":[{"name":"故事名","keyPoints":"复述线/关键词(中文1-2行)",'
      + '"outline":"英文叙事要点，可分点，可夹中文注释","covers":["原题表述或编号"]}],'
      + '"coverage":[{"idx":题号(整数,从1开始对应下方带编号题库顺序),"story":"覆盖该题的故事名 或 null(确实串不上)"}]}。'
      + '规则：① stories 数量不加 2或3 限制，以"最少故事+最高覆盖"为准；② coverage 必须逐题覆盖全部题库(每题一个 idx,从1到N)，'
      + '能串上的写故事名、串不上的写 null，但 ultra/high/must 题尽量都有故事名；③ 全部用简体中文（outline 英文部分除外）。';
    const listForFreq = ctP2List();
    const highBank = listForFreq.map((s, i) => ({ idx: i + 1, s }))
      .filter(o => ctFreqGroup(o.s.frequency) === 'high').map(o => o.idx + '. ' + ctTopicText(o.s)).join('\n');
    const restBank = listForFreq.map((s, i) => ({ idx: i + 1, s }))
      .filter(o => ctFreqGroup(o.s.frequency) === 'rest').map(o => o.idx + '. ' + ctTopicText(o.s)).join('\n');
    const user = '当季 P2 题库(带编号，逐题对应 coverage 的 idx)：\n' + ctBankNumbered().join('\n')
      + '\n\n【必须100%覆盖的题(超高频/高频/必考)】：\n' + (highBank || '（无）')
      + '\n\n【其余尽量覆盖的题】：\n' + (restBank || '（无）')
      + '\n\n考生回答：\n' + answered
      + '\n\n已有母本素材：\n' + ctTemplates() + '\n\n请生成串题方案（严格 JSON，coverage 用 idx 对应上方编号）。';
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
    // 构造精确覆盖：idx 优先，回退 topic 文本匹配；带 frequency 字段
    const list4cov = ctP2List();
    const coverage = (j.coverage || []).map(c => {
      let idx = (c.idx != null && !isNaN(+c.idx)) ? +c.idx : ctResolveIdx(c.topic);
      const q = (idx >= 1 && idx <= list4cov.length) ? list4cov[idx - 1] : null;
      return {
        idx: q ? idx : null,
        topic: q ? ctTopicText(q) : (ctToStr(c.topic) || ''),
        frequency: q ? (q.frequency || '') : '',
        story: c.story ? String(c.story) : null
      };
    }).filter(c => c.topic);
    saveScheme({ bank, stories: j.stories, coverage });
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
  const list4cov = ctP2List();
  // coverage：优先用传入的精确行（含 idx/topic/frequency/story）；旧数据无 idx 则回退 topic 匹配补 idx
  let coverage = (obj.coverage || []).map(c => {
    let idx = (c.idx != null && !isNaN(+c.idx)) ? +c.idx : ctResolveIdx(c.topic);
    const q = (idx >= 1 && idx <= list4cov.length) ? list4cov[idx - 1] : null;
    return {
      idx: q ? idx : null,
      topic: q ? ctTopicText(q) : (ctToStr(c.topic) || ''),
      frequency: q ? (q.frequency || '') : (c.frequency || ''),
      story: c.story ? String(c.story) : null
    };
  });
  if(!coverage.length){
    coverage = ctExtractTopics(obj.bank).map(t => {
      const idx = ctResolveIdx(t);
      const q = (idx != null && idx >= 1 && idx <= list4cov.length) ? list4cov[idx - 1] : null;
      return { idx: q ? idx : null, topic: t, frequency: q ? (q.frequency || '') : '', story: null };
    });
  }
  const total = list4cov.length;
  const covered = coverage.filter(c => c.story && c.idx != null).length;
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
    wrap.innerHTML = '<div class="ct-empty">还没有串题方案。点击上方「AI 先问几个关键问题」，让 AI 帮你用尽可能少的故事覆盖最多题吧。</div>';
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
  renderGlobalCoverage();
}

/* === 全局覆盖率看板：所有方案的并集覆盖 + 频率分级 + 贪心最优组合 === */
function renderGlobalCoverage(){
  const el = $('#ctGlobal');
  if(!el) return;
  const list = ctP2List();
  const total = list.length;
  if(total === 0){ el.hidden = true; return; }
  // 聚合全局覆盖：idx -> { covered, stories[] }
  const cov = {};
  (DATA.speakingStories || []).forEach(scheme => (scheme.coverage || []).forEach(c => {
    let idx = c.idx != null ? c.idx : ctResolveIdx(c.topic);
    if(idx == null || idx < 1 || idx > total) return;
    if(!cov[idx]) cov[idx] = { covered:false, stories:[] };
    if(c.story){ cov[idx].covered = true; if(cov[idx].stories.indexOf(c.story) < 0) cov[idx].stories.push(c.story); }
  }));
  let highTotal = 0, highCov = 0, restTotal = 0, restCov = 0, allCov = 0;
  list.forEach((s, i) => {
    const idx = i + 1, covered = !!(cov[idx] && cov[idx].covered);
    if(covered) allCov++;
    if(ctFreqGroup(s.frequency) === 'high'){ highTotal++; if(covered) highCov++; }
    else { restTotal++; if(covered) restCov++; }
  });
  const rate = Math.round(allCov / total * 100);
  const highOk = highTotal > 0 && highCov === highTotal;
  const ok90 = rate >= 90;
  const missHigh = list.map((s, i) => ({ idx: i + 1, s }))
    .filter(o => ctFreqGroup(o.s.frequency) === 'high' && !(cov[o.idx] && cov[o.idx].covered))
    .map(o => o.idx + '. ' + ctTopicText(o.s));
  const combo = ctGreedyCombo(list, cov);
  const fmt = n => (n ? Math.round(n / total * 100) : 0);
  const grp = (label, a, b, ok) =>
    '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:3px 0">'
    + '<span>' + label + ' <b>' + a + '/' + b + '</b></span>'
    + '<span style="font-weight:700;color:' + (ok ? 'var(--med)' : 'var(--danger)') + '">'
    + (b ? fmt(a) + '%' + (ok ? ' ✅' : ' ⚠️') : '—') + '</span></div>';
  let html = '<div style="background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:10px 0 4px">';
  html += '<div style="font-weight:700;font-size:15px;margin-bottom:6px">📊 全局覆盖率看板（所有方案并集）</div>';
  html += grp('总覆盖率', allCov, total, ok90);
  html += grp('超高/高频/必考（必须100%）', highCov, highTotal, highOk);
  html += grp('其余题目', restCov, restTotal, true);
  const reach = (ok90 && highOk) ? '🎯 已达标（总≥90% 且高频100%）' : '🚧 未达标：' + (!highOk ? '高频缺口 ' + (highTotal - highCov) + ' 题；' : '') + (!ok90 ? '总覆盖还差 ' + (90 - rate) + '%' : '');
  html += '<div style="margin-top:8px;padding:8px 10px;border-radius:10px;font-size:13px;font-weight:700;background:var(--primary-soft);color:var(--ink)">' + reach + '</div>';
  if(missHigh.length){
    html += '<div style="margin-top:10px;font-size:12.5px;color:var(--danger)"><b>❗ 未覆盖的高频题（需补素材）：</b><br>' + missHigh.join('<br>') + '</div>';
  }
  if(combo.length){
    html += '<div style="margin-top:10px;font-size:13px;color:var(--ink)"><b>✅ 推荐最少背诵组合（' + combo.length + ' 个故事）：</b><br>'
      + combo.map(n => '<span style="display:inline-block;margin:3px 6px 3px 0;padding:4px 10px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-weight:700;font-size:12.5px">' + escapeHtml(n) + '</span>').join('') + '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  el.hidden = false;
}

/* 贪心：从所有方案的所有故事里选最小子集，满足 高频100% + 总≥90% */
function ctGreedyCombo(list, cov){
  const total = list.length;
  // 构建故事池：scheme.id::name -> 覆盖的 idx 集合
  const pool = {};
  (DATA.speakingStories || []).forEach(scheme => {
    const byStory = {};
    (scheme.coverage || []).forEach(c => {
      if(!c.story) return;
      let idx = c.idx != null ? c.idx : ctResolveIdx(c.topic);
      if(idx == null || idx < 1 || idx > total) return;
      if(!byStory[c.story]) byStory[c.story] = new Set();
      byStory[c.story].add(idx);
    });
    Object.keys(byStory).forEach(name => { pool[scheme.id + '::' + name] = { name, idxSet: byStory[name] }; });
  });
  const highIdx = list.map((s, i) => ({ idx: i + 1, s })).filter(o => ctFreqGroup(o.s.frequency) === 'high').map(o => o.idx);
  const coveredSet = new Set();
  const sel = new Set();
  // 阶段1：覆盖高频
  let pending = highIdx.slice();
  while(pending.length){
    let best = null, bestN = 0;
    for(const k in pool){ if(sel.has(k)) continue; let n = 0; pool[k].idxSet.forEach(x => { if(pending.indexOf(x) >= 0) n++; }); if(n > bestN){ bestN = n; best = k; } }
    if(!best || bestN === 0) break;
    sel.add(best); pool[best].idxSet.forEach(x => { coveredSet.add(x); });
    pending = pending.filter(p => !coveredSet.has(p));
  }
  // 阶段2：扩展到总覆盖≥90%
  while(Math.round(coveredSet.size / total * 100) < 90){
    let best = null, bestN = 0;
    for(const k in pool){ if(sel.has(k)) continue; let n = 0; pool[k].idxSet.forEach(x => { if(!coveredSet.has(x)) n++; }); if(n > bestN){ bestN = n; best = k; } }
    if(!best || bestN === 0) break;
    sel.add(best); pool[best].idxSet.forEach(x => coveredSet.add(x));
  }
  const names = [];
  sel.forEach(k => { const n = pool[k].name; if(names.indexOf(n) < 0) names.push(n); });
  return names;
}
