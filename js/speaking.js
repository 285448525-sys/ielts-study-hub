/* === 口语题库（极简版） === */
let curType = 'P1';
let curFreq = 'all';
let curCat = 'all';
let curSearch = '';
let curDetailId = null;
const PF_LABEL = { '没练':0, '练过':1, '脱口而出':2 };
const FREQ_ORDER = { ultra:0, must:1, high:2, medium:3, normal:4 };

ready(() => {
  $('#tabs').querySelectorAll('[data-type]').forEach(b => {
    b.addEventListener('click', () => {
      curType = b.dataset.type;
      $('#tabs').querySelectorAll('[data-type]').forEach(x => x.classList.toggle('active', x === b));
      renderList();
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

  // P1 问题列表
  if(s.type === 'P1' && s.questions && s.questions.length){
    html += '<ol class="sp-questions">';
    s.questions.forEach(q => { html += '<li>' + escapeHtml(q) + '</li>'; });
    html += '</ol>';
  }

  // P2 题目描述
  if(s.type === 'P2'){
    if(s.promptEn) html += '<div class="sp-prompt">' + escapeHtml(s.promptEn) + '</div>';
    if(s.promptZh) html += '<div class="sp-detail-zh" style="margin-bottom:12px">' + escapeHtml(s.promptZh) + '</div>';
    if(s.youShouldSay && s.youShouldSay.length){
      html += '<div style="font-size:13px;color:var(--muted);margin-bottom:4px;font-weight:600">You should say:</div>';
      html += '<ul class="sp-ysay">';
      s.youShouldSay.forEach(y => { html += '<li>' + escapeHtml(y) + '</li>'; });
      html += '</ul>';
    }
  }

  // AI 辅助按钮
  html += '<button class="btn btn-primary" id="aiAssistBtn" style="margin-bottom:12px">AI 辅助</button>';
  html += '<div class="sp-ai-result" id="aiResult"></div>';

  // 编辑区
  html += '<div class="sp-field"><label>Cue / 复述线</label><textarea id="d_cue">' + escapeHtml(s.cue || '') + '</textarea></div>';
  html += '<div class="sp-field"><label>完整素材</label><textarea id="d_content" style="min-height:100px">' + escapeHtml(s.content || '') + '</textarea></div>';
  html += '<div class="sp-field"><label>关键词</label><input id="d_keywords" value="' + escapeHtml(s.keywords || '') + '" /></div>';
  html += '<div class="sp-field"><label>串题关系</label><input id="d_linked" value="' + escapeHtml(s.linkedTo || '') + '" /></div>';

  // 熟练度
  html += '<div class="pf-btns">';
  ['没练','练过','脱口而出'].forEach(p => {
    const active = (s.proficiency || '没练') === p ? ' active' : '';
    html += '<button class="' + active + '" data-pf="' + p + '">' + p + '</button>';
  });
  html += '</div>';

  // 保存
  html += '<div class="sp-detail-actions"><button class="btn btn-primary" id="saveBtn">保存</button></div>';

  $('#detailBody').innerHTML = html;

  // 绑定事件
  $('#saveBtn').addEventListener('click', () => saveDetail(id));
  $('#aiAssistBtn').addEventListener('click', () => aiAssist(id));
  document.querySelectorAll('.pf-btns button[data-pf]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.pf-btns button[data-pf]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
}

function saveDetail(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  s.cue = $('#d_cue').value;
  s.content = $('#d_content').value;
  s.keywords = $('#d_keywords').value;
  s.linkedTo = $('#d_linked').value;
  const pfBtn = document.querySelector('.pf-btns button.active');
  if(pfBtn) s.proficiency = pfBtn.dataset.pf;
  hubSave();
  toast('已保存');
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
