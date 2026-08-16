var curCat = null;
var curId = null;
var curTab = 'tpl';

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
  $('#tplScoreBtn').addEventListener('click', scoreTemplate);
  $('#tplCopyBtn').addEventListener('click', copyFilled);
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
  const sb = $('#tplScoreBox');
  if(sb){ sb.hidden = true; sb.innerHTML = ''; }   // 换模板时清掉上一份评分
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
  const hint = $('#tplFillHint');
  if(hint){
    const s = filledState();
    hint.textContent = s.blank > 0 ? ('还有 ' + s.blank + ' 个空没填') : (s.total ? '空都填好了，可以评分' : '');
  }
}

/* ===== 模板填空 → AI 按官方 4 维度评分 ===== */
/* 取「填好的纯文本」（不走 #preview 的 HTML，避免转义污染） */
function filledState(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return { text:'', total:0, blank:0, filled:[] };
  let out = t.skeleton;
  let total = 0, blank = 0;
  const filled = [];
  document.querySelectorAll('.ph-input').forEach(inp => {
    total++;
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    if(!val) blank++;
    else filled.push(ph + ' → ' + val);
    out = out.split('【' + ph + '】').join(val || ('【' + ph + '】'));
  });
  return { text: out.trim(), total, blank, filled, tpl: t };
}

async function scoreTemplate(){
  const s = filledState();
  if(!s.tpl){ toast('先打开一个模板'); return; }
  if(s.total === 0){ toast('这个模板没有填空位'); return; }
  if(s.blank === s.total){ toast('先把空填上再评分'); return; }
  if(s.blank > 0 && !confirm('还有 ' + s.blank + ' 个空没填，仍然要让 AI 评分吗？（没填的空会按原样交给 AI）')) return;
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }

  const isTask1 = /小作文/.test(s.tpl.category || '');
  const dimName = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';

  const btn = $('#tplScoreBtn');
  const box = $('#tplScoreBox');
  btn.disabled = true; btn.textContent = '评分中…';
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在按官方 4 维度看你填的内容，十几秒…</div>';

  const messages = [
    { role:'system', content:
`你是雅思写作考官，按官方四项评分标准给分：${dimName}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。
考生目标分 5.5-6.0，策略是"背模板 + 现场填空"，这是既定策略。

⚠️ 铁律（违反就算答错）：
1. 这是"模板骨架 + 她填的内容"的产物，可能只有一句或一小段。不许因为篇幅短、字数不足、不是完整作文而扣分或提这件事。
2. 只评价她填进去的内容（是否贴题、搭配是否地道、语法是否接得上、逻辑有没有断层），模板框架本身一个字都不许评价，更不许建议她换模板/换句式。
3. 分数按"如果整篇都是这个水平，大概是几分"来给，0-9，可用 0.5。
4. 理由必须短、具体、能改：每维度一句话（不超过 40 字），直接说问题在哪或哪里做得对，不要"建议丰富词汇"这种空话。
5. 语法错误逐条列，含原错处、改法、一句话错因；同类错误合并成一条。没有明显错误就给空数组。
6. 全部用简体中文（错句和改法里的英文原文保留英文）。

只输出 JSON，不要解释、不要 markdown 围栏：
{"overall":5.5,"breakdown":{"TR":5.5,"CC":6.0,"LR":5.5,"GRA":5.0},"reasons":{"TR":"","CC":"","LR":"","GRA":""},"grammar":[{"wrong":"","fix":"","why":""}],"fixes":[""]}
（小作文时 breakdown/reasons 的第一项 key 也用 "TR"，我知道它代表 TA。fixes 是"这段最优先改的 1-2 件事"。）` },
    { role:'user', content:
`模板分类：${s.tpl.category}
模板标题：${s.tpl.title}
模板骨架（不要评价它）：
${s.tpl.skeleton}

我填的内容（空位 → 我填的）：
${s.filled.join('\n') || '（无）'}

拼出来的完整文本（评这个）：
${s.text}` }
  ];

  try{
    const content = await callRelay('writing_score', messages, 0.35);
    const r = aiJson(content);
    if(!r){
      box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      DATA.writingScores.push({ id: uid(), date: todayKey(), mode:'template', tplId: s.tpl.id, tplTitle: s.tpl.title, essay: s.text, result: content, parsed:false });
      hubSave();
      return;
    }
    box.innerHTML = tplScoreHtml(r, isTask1);
    DATA.writingScores.push({ id: uid(), date: todayKey(), mode:'template', tplId: s.tpl.id, tplTitle: s.tpl.title, essay: s.text, result: r, parsed:true });
    hubSave();
    toast('评分完成');
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '🤖 AI 按官方 4 维度评分';
  }
}

function tplScoreHtml(r, isTask1){
  const labels = {
    TR:  isTask1 ? 'TA 任务完成' : 'TR 任务回应',
    CC:  'CC 连贯衔接',
    LR:  'LR 词汇',
    GRA: 'GRA 语法'
  };
  const bd = r.breakdown || {};
  const rs = r.reasons || {};
  let html = '';
  html += '<div class="ts-top"><span class="ts-overall">' + escapeHtml(r.overall != null ? r.overall : '—') + '</span>' +
          '<span class="muted" style="font-size:13px">这段的水平折算总分（0-9）</span></div>';
  html += '<div class="ts-dims">';
  ['TR','CC','LR','GRA'].forEach(k => {
    html += '<div class="ts-dim"><div class="ts-dim-h"><b>' + escapeHtml(bd[k] != null ? bd[k] : '—') + '</b>' + labels[k] + '</div>' +
            (rs[k] ? '<div class="ts-dim-r">' + escapeHtml(rs[k]) + '</div>' : '') + '</div>';
  });
  html += '</div>';
  const gram = Array.isArray(r.grammar) ? r.grammar : [];
  if(gram.length){
    html += '<div class="ts-sec"><h4>语法 / 表达问题</h4>';
    gram.forEach(g => {
      html += '<div class="ts-gram"><s>' + escapeHtml(g.wrong || '') + '</s> → <b>' + escapeHtml(g.fix || '') + '</b>' +
              (g.why ? '<br><span class="muted">' + escapeHtml(g.why) + '</span>' : '') + '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="ts-sec"><h4>语法 / 表达问题</h4><div class="muted" style="font-size:13.5px">这段没挑出明显语法错误。</div></div>';
  }
  const fixes = Array.isArray(r.fixes) ? r.fixes.filter(Boolean) : [];
  if(fixes.length){
    html += '<div class="ts-sec"><h4>最优先改这个</h4><div class="ts-fix">' + fixes.map(escapeHtml).join('<br>') + '</div></div>';
  }
  return html;
}

function copyFilled(){
  const s = filledState();
  if(!s.text){ toast('还没内容'); return; }
  const done = () => toast('已复制填好的内容');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s.text).then(done).catch(() => fallbackCopy(s.text, done));
  } else fallbackCopy(s.text, done);
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); cb(); }catch(e){ toast('复制失败，手动选中吧'); }
  document.body.removeChild(ta);
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
    // Bug18：复用 aiJson 解析（已处理 ```json 围栏与前后废话），避免重复解析逻辑
    const result = aiJson(content);
    if(!result){
      // JSON 解析失败，降级显示原始文本
      bodyEl.innerHTML = '<div class="score-section"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
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
