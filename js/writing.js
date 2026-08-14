let curCat = null;
let curId = null;
let curTab = 'tpl';

ready(() => {
  // Tab 切换
  $('#writeTabs').querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      curTab = b.dataset.tab;
      $('#writeTabs').querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      $('#tplPanel').hidden = curTab !== 'tpl';
      $('#scorePanel').hidden = curTab !== 'score';
    });
  });

  // 模板库
  renderCats();
  $('#backBtn').addEventListener('click', () => { $('#detailCard').hidden = true; $('#listCard').hidden = false; });
  $('#addBtn').addEventListener('click', () => { $('#addCard').hidden = false; $('#listCard').hidden = true; $('#detailCard').hidden = true; });
  $('#a_cancel').addEventListener('click', () => { $('#addCard').hidden = true; $('#listCard').hidden = false; });
  $('#a_save').addEventListener('click', addTpl);
  $('#delBtn').addEventListener('click', delTpl);

  // AI 评分
  $('#scoreBtn').addEventListener('click', scoreEssay);
});

/* ===== 模板库 ===== */
function renderCats(){
  const cats = [];
  DATA.writing.forEach(t => { if(!cats.includes(t.category)) cats.push(t.category); });
  const nav = $('#catNav');
  if(cats.length === 0){ nav.innerHTML = '<div class="muted">暂无分类</div>'; $('#tplList').innerHTML=''; return; }
  if(!curCat) curCat = cats[0];
  nav.innerHTML = cats.map(c => '<button class="btn ' + (c===curCat?'active':'') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>').join('');
  nav.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { curCat = b.dataset.cat; renderCats(); renderList(); }));
  renderList();
}

function renderList(){
  const list = DATA.writing.filter(t => t.category === curCat);
  $('#tplList').innerHTML = list.map(t => '<div class="card tpl-card" data-id="' + t.id + '"><b>' + escapeHtml(t.title) + '</b><div class="muted" style="font-size:13px;margin-top:4px">' + escapeHtml(t.category) + '</div></div>').join('');
  $('#empty').hidden = list.length > 0;
  $('#tplList').querySelectorAll('[data-id]').forEach(c => c.addEventListener('click', () => openTpl(c.dataset.id)));
}

function openTpl(id){
  const t = DATA.writing.find(x => x.id === id);
  if(!t) return;
  curId = id;
  $('#listCard').hidden = true; $('#detailCard').hidden = false;
  $('#dTitle').textContent = t.title;
  $('#skeleton').innerHTML = highlight(t.skeleton);
  $('#tips').innerHTML = t.tips ? escapeHtml(t.tips).replace(/\n/g,'<br>') : '';
  buildPractice(t.skeleton);
}

function highlight(s){ return escapeHtml(s).replace(/【(.+?)】/g, '【<span class="ph">$1</span>】'); }

function buildPractice(skeleton){
  const parts = skeleton.split(/(【[^】]*】)/g);
  let html = '';
  parts.forEach(p => {
    const m = p.match(/^【(.+?)】$/);
    if(m){ const w = Math.max(80, m[1].length * 13); html += '<input class="ph-input" data-ph="' + escapeHtml(m[1]) + '" placeholder="' + escapeHtml(m[1]) + '" style="width:' + w + 'px">'; }
    else { html += escapeHtml(p); }
  });
  const box = $('#practice');
  box.innerHTML = html;
  box.querySelectorAll('.ph-input').forEach(inp => inp.addEventListener('input', updatePreview));
  updatePreview();
}

function updatePreview(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return;
  let out = t.skeleton;
  document.querySelectorAll('.ph-input').forEach(inp => {
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    out = out.split('【' + ph + '】').join(val ? escapeHtml(val) : '【' + ph + '】');
  });
  $('#preview').innerHTML = out.replace(/\n/g, '<br>');
}

function addTpl(){
  const cat = $('#a_cat').value;
  const title = $('#a_title').value.trim();
  const skeleton = $('#a_skeleton').value.trim();
  if(!title || !skeleton){ toast('请填标题和骨架'); return; }
  DATA.writing.push({ id: uid(), category: cat, title, skeleton, tips: $('#a_tips').value.trim() });
  hubSave();
  curCat = cat;
  $('#addCard').hidden = true; $('#listCard').hidden = false;
  renderCats(); renderList();
  toast('已添加模板');
}

function delTpl(){
  if(!curId) return;
  if(!confirm('确定删除这个模板？')) return;
  DATA.writing = DATA.writing.filter(x => x.id !== curId);
  hubSave();
  $('#detailCard').hidden = true; $('#listCard').hidden = false;
  curId = null;
  renderCats(); renderList();
  toast('已删除');
}

/* ===== AI 作文评分 ===== */
async function scoreEssay(){
  const essay = $('#scoreEssay').value.trim();
  const type = $('#scoreType').value;
  if(essay.length < 150){ toast('作文太短，至少需要 150 词'); return; }

  const btn = $('#scoreBtn');
  btn.disabled = true; btn.textContent = '评分中…';
  const resultEl = $('#scoreResult');
  const bodyEl = $('#scoreResultBody');
  resultEl.style.display = 'block';
  bodyEl.innerHTML = '<p class="muted">正在分析你的作文，请稍候…</p>';

  const messages = [
    { role:'system', content:'你是一名雅思写作 Task 2 评分考官。请对以下作文按 IELTS 四项标准给出预估分数（0-9，0.5 一档），并指出文中超过 35 词或含多层从句的复杂句，给出简化建议。输出严格 JSON 格式：\n{"overall":6.0,"breakdown":{"TR":6.0,"CC":6.0,"LR":6.0,"GRA":5.5},"longSentences":[{"sentence":"原文句子","wordCount":42,"suggestion":"拆分建议"}],"suggestions":["建议1","建议2","建议3"]}\n只输出 JSON，不要其他文字。' },
    { role:'user', content:'题型：' + type + '\n\n作文：\n' + essay }
  ];

  try{
    const content = await callRelay('writing_score', messages, 0.4);
    let result;
    try{
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    }catch(e){
      // JSON 解析失败，降级显示原始文本
      bodyEl.innerHTML = '<div class="score-section"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      // 保存记录
      DATA.writingScores.push({ id: uid(), date: todayKey(), type, essay, result: content, parsed: false });
      hubSave();
      btn.disabled = false; btn.textContent = '开始评分';
      return;
    }

    // 渲染结果
    let html = '';
    html += '<div class="score-overall">预估总分：' + (result.overall || 'N/A') + '</div>';
    if(result.breakdown){
      html += '<div class="score-breakdown">';
      ['TR','CC','LR','GRA'].forEach(k => {
        if(result.breakdown[k] != null){
          html += '<div class="score-item"><b>' + result.breakdown[k] + '</b><span>' + k + '</span></div>';
        }
      });
      html += '</div>';
    }
    if(result.longSentences && result.longSentences.length){
      html += '<div class="score-section"><h4>长 / 复杂句分析</h4><ul>';
      result.longSentences.forEach(ls => {
        html += '<li><b>第 ' + (result.longSentences.indexOf(ls)+1) + ' 句（' + (ls.wordCount||'?') + ' 词）：</b>' + escapeHtml(ls.sentence || '') + '<br><span class="muted">建议：' + escapeHtml(ls.suggestion || '') + '</span></li>';
      });
      html += '</ul></div>';
    }
    if(result.suggestions && result.suggestions.length){
      html += '<div class="score-section"><h4>改进建议</h4><ul>';
      result.suggestions.forEach(s => { html += '<li>' + escapeHtml(s) + '</li>'; });
      html += '</ul></div>';
    }
    bodyEl.innerHTML = html;

    // 保存记录
    DATA.writingScores.push({ id: uid(), date: todayKey(), type, essay, result, parsed: true });
    hubSave();
    toast('评分完成');
  }catch(e){
    bodyEl.innerHTML = '<p class="muted">AI 服务暂不可用：' + escapeHtml(e.message) + '</p><p class="muted" style="font-size:13px">请检查「设置」中的 AI 接口地址。</p>';
  }finally{
    btn.disabled = false; btn.textContent = '开始评分';
  }
}
