var curCat = null;
var curId = null;
var curTab = 'tpl';

function switchWriteTab(tab){
  curTab = tab;
  const btn = $('#writeTabs').querySelector('[data-tab="' + tab + '"]');
  $('#writeTabs').querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === btn));
  $('#tplPanel').hidden = tab !== 'tpl';
  $('#bankPanel').hidden = tab !== 'bank';
  $('#scorePanel').hidden = tab !== 'score';
  $('#examPanel').hidden = tab !== 'exam';
  $('#dictationPanel').hidden = tab !== 'dictation';
  if(tab === 'bank') renderBank();
  if(tab === 'score') renderScoreHist();
  if(tab === 'exam') renderExamList();
}

ready(() => {
  // 迁移：清洗写作模板分类名/标题里的括号后缀（如「观点型（第一优先级）」→「观点型」），就地改写并保存
  migrateWritingCategoryNames();

  // Tab 切换
  $('#writeTabs').querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => switchWriteTab(b.dataset.tab));
  });

  // 模板库
  renderCats();
  $('#backBtn').addEventListener('click', () => { $('#detailCard').hidden = true; $('#listCard').hidden = false; document.querySelector('.write-layout')?.classList.remove('detail-open'); });
  $('#addBtn').addEventListener('click', () => { $('#addCard').hidden = false; $('#listCard').hidden = true; $('#detailCard').hidden = true; });
  $('#a_cancel').addEventListener('click', () => { $('#addCard').hidden = true; $('#listCard').hidden = false; });
  $('#a_save').addEventListener('click', addTpl);
  $('#delBtn').addEventListener('click', delTpl);

  // 模板内联默写：把模板骨架当默写源（自包含默写 UI + AI 批改）
  $('#tplDictBtn').addEventListener('click', () => openTplDict(curId));
  $('#wtDictBack').addEventListener('click', () => switchWriteTab('tpl'));
  $('#wtDictSubmit').addEventListener('click', submitWtDict);
  $('#wtDictClear').addEventListener('click', () => { if(wtDictCurrent) $('#wtDictInput').value = ''; toast('已清空，重新默写'); });

  // AI 评分
  $('#scoreBtn').addEventListener('click', scoreEssay);
  $('#tplScoreBtn').addEventListener('click', scoreTemplate);
  $('#tplCopyBtn').addEventListener('click', copyFilled);

  // A4 实时词数
  const wcEl = $('#scoreWordCount');
  const wcInput = $('#scoreEssay');
  if(wcEl && wcInput){
    const updWc = () => {
      const n = (wcInput.value.trim().match(/\S+/g) || []).length;
      wcEl.textContent = n + ' 词';
      wcEl.style.color = n >= 150 ? 'var(--primary)' : 'var(--warn-ink)';
    };
    wcInput.addEventListener('input', updWc);
    updWc();
  }

  // A1 评分记录
  renderScoreHist();
  const histClear = $('#scoreHistClear');
  if(histClear) histClear.addEventListener('click', () => {
    if(!confirm('确定清空全部评分记录？')) return;
    DATA.writingScores = [];
    hubSave();
    renderScoreHist();
    toast('已清空');
  });

  // 语料库
  $('#bankFilter').addEventListener('change', renderBank);
  $('#bankAddBtn').addEventListener('click', () => { $('#bankAddCard').hidden = false; });
  $('#ba_cancel').addEventListener('click', () => { $('#bankAddCard').hidden = true; });
  $('#ba_save').addEventListener('click', addPhrase);

  // 写作真题
  bindExam();
});

/* ===== 模板库 ===== */
// 分类名防御性清洗：去掉「（xxx）」「(xxx)」等括号及括号内后缀（如「观点型（第一优先级）」→「观点型」）
function cleanCatName(c){
  if(!c) return c;
  return c.replace(/[（(][^）)]*[）)]/g, '').trim();
}
// 迁移：把 DATA.writing 里所有模板的 category/title 就地清洗（去掉括号后缀），并持久化，使渲染/过滤全程一致
function migrateWritingCategoryNames(){
  let changed = false;
  (DATA.writing || []).forEach(t => {
    if(!t) return;
    if(typeof t.category === 'string'){
      const c = cleanCatName(t.category);
      if(c !== t.category){ t.category = c; changed = true; }
    }
    if(typeof t.title === 'string'){
      const ti = cleanCatName(t.title);
      if(ti !== t.title){ t.title = ti; changed = true; }
    }
  });
  if(changed) hubSave();
}
function renderCats(){
  const cats = [];
  DATA.writing.forEach(t => { const c = cleanCatName(t.category); if(!cats.includes(c)) cats.push(c); });
  // 大作文在上、小作文在下；组内按雅思出题频率排序（高频靠前）
  const CAT_ORDER = ['观点型','讨论型','Report','动态图','静态图','地图题','流程图'];
  cats.sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const nav = $('#catNav');
  if(cats.length === 0){ nav.innerHTML = '<div class="muted">暂无分类</div>'; $('#tplList').innerHTML=''; return; }
  if(!curCat) curCat = cats[0];
  nav.innerHTML = cats.map(c => '<button class="btn ' + (c===curCat?'active':'') + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + '</button>').join('');
  nav.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { curCat = b.dataset.cat; renderCats(); renderList(); }));
  renderList();
}

function renderList(){
  const list = DATA.writing.filter(t => t.category === curCat);
  $('#tplList').innerHTML = list.map(t => '<div class="card tpl-card" data-id="' + t.id + '"><b>' + escapeHtml(cleanCatName(t.title)) + '</b><div class="muted" style="font-size:13px;margin-top:4px">' + escapeHtml(t.category) + '</div></div>').join('');
  $('#empty').hidden = list.length > 0;
  $('#tplList').querySelectorAll('[data-id]').forEach(c => c.addEventListener('click', () => openTpl(c.dataset.id)));
}

function openTpl(id){
  const t = DATA.writing.find(x => x.id === id);
  if(!t) return;
  curId = id;
  $('#listCard').hidden = true; $('#detailCard').hidden = false;
  document.querySelector('.write-layout')?.classList.add('detail-open');
  $('#dTitle').textContent = cleanCatName(t.title);
  $('#skeleton').innerHTML = highlight(t.skeleton);
  $('#tips').innerHTML = t.tips ? escapeHtml(t.tips).replace(/\n/g,'<br>') : '';
  const sb = $('#tplScoreBox');
  if(sb){ sb.hidden = true; sb.innerHTML = ''; }   // 换模板时清掉上一份评分
  buildPractice(t.skeleton);
}

function highlight(s){ return escapeHtml(s).replace(/【(.+?)】/g, '【<span class="ph">$1</span>】'); }

function fitInput(inp){
  const t = (inp.value || inp.dataset.ph || '');
  inp.style.width = (Math.max(t.length, 4) * 12 + 10) + 'px';   // 最小 ~58px，随字数变宽，不截断
}

function buildPractice(skeleton){
  const parts = skeleton.split(/(【[^】]*】)/g);
  let html = '';
  let phIdx = 0;
  parts.forEach(p => {
    const m = p.match(/^【(.+?)】$/);
    if(m){
      const esc = escapeHtml(m[1]);
      html += '<span class="ph-wrap" data-idx="' + phIdx + '">'
            +   '<input class="ph-input" data-ph="' + esc + '" placeholder="' + esc + '">'
            +   '<button class="ph-hint" type="button" data-ph="' + esc + '" title="AI 给这个空的建议"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg></button>'
            +   '<span class="ph-hint-box" data-for="' + esc + '" hidden></span>'
            + '</span>';
      phIdx++;
    } else { html += escapeHtml(p); }
  });
  const box = $('#practice');
  box.innerHTML = html;
  box.querySelectorAll('.ph-input').forEach(inp => { fitInput(inp); inp.addEventListener('input', () => { fitInput(inp); updatePreview(); }); });
  box.querySelectorAll('.ph-hint').forEach(btn => btn.addEventListener('click', () => hintBlank(btn)));
  updatePreview();
}

async function hintBlank(btn){
  const wrap = btn.closest('.ph-wrap');
  if(!wrap) return;
  const inp = wrap.querySelector('.ph-input');
  const box = wrap.querySelector('.ph-hint-box');
  if(!box) return;
  const ph = inp.dataset.ph;   // 占位提示文本仍用于拼 prompt
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }
  const t = DATA.writing.find(x => x.id === curId);
  const others = [];
  document.querySelectorAll('.ph-input').forEach(el => { const v = el.value.trim(); if(v) others.push(el.dataset.ph + ' → ' + v); });
  box.hidden = false;
  box.innerHTML = '<span class="ph-load">AI 想这个空的填法…</span>';
  const messages = [
    { role:'system', content:
`你是雅思写作陪练。考生用"模板骨架 + 现场填空"策略，目标分 5.5-6.0。
现在她卡在一个填空位上，需要你给一个**适合填进这个空**的英文（短语或短句，1-6 词最佳，必须是地道的雅思写作表达）。
只输出 JSON，不要解释、不要 markdown 围栏：
{"fill":"填进空的英文（不要带括号、不要带句号）","why":"一句中文说明为什么合适、贴什么题"}
规则：
1. 必须与模板语境、她已填的其他空的话题一致，不能跑题。
2. 优先给"按话题领域、能填进空里的实质内容词组"（如 improve work efficiency / reduce carbon emissions / a healthier lifestyle / narrow the wealth gap）——也就是模板之外的"内容搭配"，而不是衔接词/过渡句（模板里 already 自带那些，无需再给）。
3. 不要造长难句，填空就是填空，短而准。
4. 若空是"观点/话题"类，给一个可替换的名词短语或 -ing 短语。` },
    { role:'user', content:
`模板分类：${t ? t.category : ''}
模板标题：${t ? t.title : ''}
模板骨架（【】是填空位，不要评价骨架）：
${t ? t.skeleton : ''}

她已填的其他空：
${others.join('\n') || '（还没填其他空）'}

当前这个空的占位提示是：【${ph}】
请给适合填进【${ph}】的英文与一句中文说明。` }
  ];
  try{
    const content = await callRelay('writing_hint', messages, 0.5);   // service 形参未被使用，纯转发 messages，无需后端改动
    const r = aiJson(content);
    if(!r || !r.fill){ box.innerHTML = '<span class="ph-hint-err">AI 没给到建议，换个空或手填吧</span>'; return; }
    box.innerHTML = '<span class="ph-fill">' + escapeHtml(r.fill) + '</span>'
      + (r.why ? '<span class="ph-why">' + escapeHtml(r.why) + '</span>' : '')
      + '<button class="ph-use" type="button">填入</button>';
    const useBtn = box.querySelector('.ph-use');
    if(useBtn) useBtn.addEventListener('click', () => {
      if(inp){ inp.value = r.fill; inp.dispatchEvent(new Event('input')); }
      box.hidden = true; box.innerHTML = '';
    });
  }catch(e){
    box.innerHTML = '<span class="ph-hint-err">AI 调不通：' + escapeHtml(e.message) + '</span>';
  }
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
/* 取「填好的纯文本」（不走 #preview 的 HTML，避免转义污染）
   容错规则：用户整框留空的填空位，从拼接文本里剥离（用 ____ 占位），
   既不让中文占位符【话题】原样进 AI，也不把留空框算作错误。 */
function filledState(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return { text:'', total:0, blank:0, filled:[], skipped:[] };
  let out = t.skeleton;
  let total = 0, blank = 0;
  const filled = [];
  const skipped = [];
  document.querySelectorAll('.ph-input').forEach(inp => {
    total++;
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    if(!val){ blank++; skipped.push(ph); }
    else filled.push(ph + ' → ' + val);
    // 留空的框用 ____ 占位（明显"此处跳过"），已填的框替换成用户填的内容
    out = out.split('【' + ph + '】').join(val || '____');
  });
  return { text: out.trim(), total, blank, filled, skipped, tpl: t };
}

async function scoreTemplate(){
  const s = filledState();
  if(!s.tpl){ toast('先打开一个模板'); return; }
  if(s.total === 0){ toast('这个模板没有填空位'); return; }
  if(s.blank === s.total){ toast('先把空填上再评分'); return; }
  if(s.blank > 0 && !confirm('还有 ' + s.blank + ' 个空没填，仍然要让 AI 评分吗？（留空的框不算错，AI 只评你填了的部分）')) return;
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }

  const isTask1 = /^(动态图|静态图|地图题|流程图)$/.test(s.tpl.category || '');
  const dimName = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';

  const btn = $('#tplScoreBtn');
  const btnHtml = btn.innerHTML;   // B2：缓存原 SVG，评分后恢复
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
7. 完整文本里出现的 ____ 是她**主动整框留空、选择跳过的填空位，不是没写完，更不算错误**。绝对不要因为 ____ 的存在扣分、不要把它当成"遗漏/未完成"来评价、不要在语法问题里列出它。只评她实际填了文字的部分。

只输出 JSON，不要解释、不要 markdown 围栏：
{"overall":5.5,"breakdown":{"TR":5.5,"CC":6.0,"LR":5.5,"GRA":5.0},"reasons":{"TR":"","CC":"","LR":"","GRA":""},"grammar":[{"wrong":"","fix":"","why":""}],"fixes":[""]}
（小作文时 breakdown/reasons 的第一项 key 也用 "TR"，我知道它代表 TA。fixes 是"这段最优先改的 1-2 件事"。）` },
    { role:'user', content:
`模板分类：${s.tpl.category}
模板标题：${s.tpl.title}
模板骨架（不要评价它）：
${s.tpl.skeleton}

我填的内容（空位 → 我填的，只列填了的）：
${s.filled.join('\n') || '（全部留空）'}

我主动整框跳过、没填的空（这些不算错，文本里对应 ____，不要评价）：
${s.skipped.length ? s.skipped.map(p => '【' + p + '】').join('、') : '（无，都填了）'}

拼出来的完整文本（评这个，____ 是跳过的空，不算错）：
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
    writeSyncMock(isTask1 ? '小作文' : '大作文', r);   // 方案 23：模板评分也回流看板
    hubSave();
    toast('评分完成');
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.innerHTML = btnHtml;   // B2：恢复 SVG
    renderScoreHist();
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

/* ===== 评分记录（A1） ===== */
function renderScoreHist(){
  const box = $('#scoreHistList');
  if(!box) return;
  const list = (DATA.writingScores || []).slice().reverse().slice(0, 20);
  if(!list.length){ box.innerHTML = '<div class="hist-empty">还没有评分记录，去上面评一篇吧。</div>'; return; }
  box.innerHTML = list.map((rec, i) => {
    const modeTag = rec.mode === 'template' ? '模板评分' : (rec.mode === 'exam' ? '真题模考' : '整篇评分');
    const title = rec.mode === 'template' ? (rec.tplTitle || '模板')
                : rec.mode === 'exam' ? ((rec.examNo ? '#'+rec.examNo+' ' : '') + (rec.type || '真题'))
                : (rec.type || '整篇');
    const overall = (!rec.parsed || !rec.result || rec.result.overall == null) ? '未解析' : rec.result.overall;
    return '<div class="hist-row" data-idx="' + i + '">'
      + '<div class="hist-h">'
      +   '<span class="hist-date">' + escapeHtml(rec.date || '') + '</span>'
      +   '<span class="hist-tag">' + modeTag + '</span>'
      +   '<span class="hist-title">' + escapeHtml(title) + '</span>'
      +   '<span class="hist-score">' + escapeHtml(String(overall)) + '</span>'
      +   '<span class="hist-caret">▶</span>'
      + '</div>'
      + '<div class="hist-body">' + histDetailHtml(rec) + '</div>'
      + '</div>';
  }).join('');
  box.querySelectorAll('.hist-row').forEach(row => {
    const head = row.querySelector('.hist-h');
    if(head) head.addEventListener('click', () => row.classList.toggle('open'));
  });
}

function histDetailHtml(rec){
  const r = rec.result;
  if(!rec.parsed || !r || typeof r === 'string'){
    const raw = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
    return '<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.7;margin:0">' + escapeHtml(raw) + '</pre>';
  }
  // 模板评分 → 复用 tplScoreHtml
  if(rec.mode === 'template'){
    const isTask1 = /小作文/.test(rec.tplTitle || '');
    return tplScoreHtml(r, isTask1);
  }
  // 整篇评分 → 复用 score-* 结构
  const isTask1 = rec.type === '小作文';
  let h = '';
  h += '<div class="score-overall" style="font-size:20px">预估总分：' + escapeHtml(r.overall != null ? r.overall : 'N/A') + '</div>';
  if(r.breakdown){
    h += '<div class="score-breakdown">';
    ['TR','CC','LR','GRA'].forEach(k => {
      if(r.breakdown[k] != null){
        const label = (k === 'TR' && isTask1) ? 'TA' : k;
        h += '<div class="score-item"><b>' + escapeHtml(r.breakdown[k]) + '</b><span>' + label + '</span></div>';
      }
    });
    h += '</div>';
  }
  if(Array.isArray(r.longSentences) && r.longSentences.length){
    h += '<div class="score-section"><h4>长 / 复杂句分析</h4><ul>';
    r.longSentences.forEach(ls => {
      h += '<li><b>（' + escapeHtml(ls.wordCount != null ? ls.wordCount : '?') + ' 词）</b>' + escapeHtml(ls.sentence || '') + '<br><span class="muted">建议：' + escapeHtml(ls.suggestion || '') + '</span></li>';
    });
    h += '</ul></div>';
  }
  if(Array.isArray(r.suggestions) && r.suggestions.length){
    h += '<div class="score-section"><h4>改进建议</h4><ul>';
    r.suggestions.forEach(s => { h += '<li>' + escapeHtml(s) + '</li>'; });
    h += '</ul></div>';
  }
  return h;
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
  DATA.deletedIds = DATA.deletedIds || [];
  if(curId != null && !DATA.deletedIds.includes(curId)) DATA.deletedIds.push(curId);
  hubSave();
  $('#detailCard').hidden = true; $('#listCard').hidden = false;
  document.querySelector('.write-layout')?.classList.remove('detail-open');
  curId = null;
  renderCats(); renderList();
  toast('已删除');
}

/* ===== 模板内联默写（自包含实现，不依赖 dictation.js） =====
   把模板骨架当默写源，复用 common.js 的 callRelay + aiJson 做 AI 批改。
   骨架里的【xxx】填空位先转成 ____，提交比对时整框留空不算错。 */
function wtSplitSentences(text){
  return (text || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}
function wtComputeWeak(sourceId){
  const map = {};
  (DATA.dictationLogs || []).forEach(l => {
    if(l.sourceId !== sourceId || !Array.isArray(l.mistakes)) return;
    l.mistakes.forEach(m => { const k = String(m.loc); if(k && k !== '0') map[k] = (map[k] || 0) + 1; });
  });
  return map;
}

let wtDictCurrent = null;   // 当前默写源 {id,title,text}
let wtDictSentences = [];   // 当前源按句拆分后的句子数组（1-based 与勾选区序号一致）
let wtDictWeak = {};        // 当前源 loc -> 历史出错次数

function openTplDict(tplId){
  const t = DATA.writing.find(x => x.id === tplId);
  if(!t) return;
  // 骨架 → 纯默写文本：把【占位符】替换成 ____，让用户整框留空时不算错
  const plain = (t.skeleton || '').replace(/【[^】]*】/g, '____');
  wtDictCurrent = { id: 'tpl_' + t.id, title: cleanCatName(t.title) + '（模板默写）', text: plain };
  wtDictSentences = wtSplitSentences(plain);   // 按句拆分，供勾选区与提交过滤使用

  switchWriteTab('dictation');   // 切到默写面板

  $('#wtDictTitle').textContent = wtDictCurrent.title;
  $('#wtDictSrc').textContent = plain;          // 原文存着，默认隐藏（点「偷看原文」展开）
  $('#wtDictSrc').hidden = true;
  $('#wtDictPeek').setAttribute('aria-expanded', 'false');
  $('#wtDictInput').value = '';
  $('#wtDictResult').hidden = true;
  $('#wtDictResult').innerHTML = '';

  // 历史常错（loc -> 次数），用于勾选区标记"常错句" + 「重默错句」开关自动优先
  const weak = wtComputeWeak(wtDictCurrent.id);
  wtDictWeak = weak;

  // 句子勾选区：默认全勾（=本次全默），常错句标注 ★
  const pick = $('#wtDictSentPick');
  if(pick){
    if(!wtDictSentences.length){
      pick.innerHTML = '<span class="muted">本模板无法按句拆分，将整篇默写。</span>';
    } else {
      pick.innerHTML = '<div style="margin-bottom:6px;font-weight:600">选择本次要默写的句子（默认全选）：</div>'
        + wtDictSentences.map((s, i) => {
            const n = i + 1;
            const w = weak[n] || 0;
            const tag = w > 0 ? ' <span class="dict-weak-tag" title="历史错 ' + w + ' 次">★常错×' + w + '</span>' : '';
            const prev = s.length > 22 ? s.slice(0, 22) + '…' : s;
            return '<label class="dict-sent-item" style="display:block;margin:3px 0;cursor:pointer">'
              + '<input type="checkbox" class="wt-dict-sent-chk" data-idx="' + n + '" checked> 第' + n + '句：' + escapeHtml(prev) + tag
              + '</label>';
          }).join('');
    }
  }

  // 「重默错句」开关：开启时自动只勾选常错句（其余取消勾选），实现"每次做前重默错过的句子"
  const redo = $('#wtDictRedoWrong');
  if(redo){
    redo.onchange = () => {
      const only = redo.checked;
      pick.querySelectorAll('.wt-dict-sent-chk').forEach(c => {
        const n = Number(c.dataset.idx);
        const isWeak = (wtDictWeak[n] || 0) > 0;
        c.checked = only ? isWeak : true;   // 开=只勾常错句；关=恢复全勾
      });
      toast(only ? '已自动勾选常错句，本次只重默错过的句子' : '已恢复全选');
    };
  }
  // 偷看原文：展开/收起（折叠）
  const peek = $('#wtDictPeek');
  if(peek){
    peek.onclick = () => {
      const hidden = $('#wtDictSrc').hidden;
      $('#wtDictSrc').hidden = !hidden;
      peek.setAttribute('aria-expanded', String(hidden));
      peek.textContent = hidden ? '🙈 收起原文' : '👁 偷看原文';
    };
  }

  // 历史提示
  const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === wtDictCurrent.id);
  const times = logs.length;
  const totalMistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
  $('#wtDictHint').textContent = '已默 ' + times + ' 次 · 历史错 ' + totalMistakes + ' 处';

  toast('已进入模板默写：' + cleanCatName(t.title) + '。骨架里的填空位整框留空不算错。');
}

async function submitWtDict(){
  if(!wtDictCurrent) return;
  const userText = $('#wtDictInput').value.trim();
  if(!userText){ toast('先把整段默出来再提交'); return; }
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }

  const btn = $('#wtDictSubmit');
  btn.disabled = true; btn.textContent = '核对中…';
  const box = $('#wtDictResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在逐句比对你的默写，十几秒…</div>';

  // 仅取用户勾选要默的句子（正向勾选：勾了=本次默写包含该句）；编号沿用原句编号，AI 反馈 loc 对应原模板句
  const checked = new Set();
  document.querySelectorAll('.wt-dict-sent-chk').forEach(c => { if(c.checked) checked.add(Number(c.dataset.idx)); });
  if(!checked.size && wtDictSentences.length){
    toast('请至少勾选一句要默写的句子');
    btn.disabled = false; btn.textContent = '提交核对';
    return;
  }
  // 用原句编号拼标准原文（未勾选句不纳入比对，自然不算错）
  const srcNumbered = wtDictSentences
    .map((t, i) => ({ n: i + 1, t }))
    .filter(o => checked.has(o.n))
    .map(o => o.n + '. ' + o.t)
    .join('\n');
  const weakBefore = wtComputeWeak(wtDictCurrent.id);

  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原文（已按句编号）」和「学生默写」，找出英文单词层面的差异。
【预处理规则】比对前，请在心里对「标准原文」和「学生默写」统一做如下标准化：
1. 只保留英文字母和空格；删除所有标点、下划线、横线、连字符、数字、中文、括号、【】、() 等符号。
2. 全部转小写。
3. 连续空格合并为单空格；首尾空格去掉。
4. 原文中的 ____（连续下划线）是模板骨架的「填空位」，不是需要默写的英文单词，标准化时直接删除。学生没写这个填空位不算错。
5. 学生输入里的占位符 -- — ___ 【】 () 等也直接删除。

比对只基于标准化后的纯英文单词序列：单词顺序一致、拼写一致即为正确。标点和各种符号差异一律不算错。学生漏写句号导致两句合并时，不要因此造成大规模错位；请基于全局英文单词序列对齐，再回查原句编号作为 loc。
铁律：
1. 严格沿用下方「标准原文」给出的句编号（如 "3"）作为 loc；无法归到某句用 "0"。
2. 未被跳过的句子定位差异，type 分：漏写 / 错词 / 拼写 / 语法 / 语序。
3. 拼写错误在 type 标"拼写"，在清单里附带即可，不要像语法错那样在正文重点标红。
4. 连字符豁免：标准原文里带连字符的词（如 short-lived），学生默写若只是少了横杠写成 short lived、或连写成 shortlived、或换成空格，这属于语音输入常见现象，【不算错】。词义与单词组成一致即可视为正确；只有换成完全不同的词才判错。
5. wrong 字段必须是学生原始输入里真实存在的连续英文片段，漏写则空字符串。严禁返回 AI 自己生成的带横线、箭头或合并符号的 diff。
6. 返回严格 JSON：
{"overall":"一句话总体反馈","mistakes":[{"loc":"3","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":"一句说明"}],"weakHistory":[{"loc":"3","times":历史出错次数}]}
only JSON，无解释无围栏。` },
    { role:'user', content:
`标准原文（句编号请沿用）：
${srcNumbered}

学生默写：
${userText}

历史常错统计（loc -> 历史出错次数）：
${JSON.stringify(weakBefore)}` }
  ];

  try{
    const content = await callRelay('dictation_check', messages, 0.4);
    const r = aiJson(content);
    if(!r){
      box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      return;
    }
    const mistakes = Array.isArray(r.mistakes) ? r.mistakes : [];
    const overall = r.overall || '核对完成。';
    let html = '<div class="ts-sec"><h4>总体反馈</h4><div style="line-height:1.8">' + escapeHtml(overall) + '</div></div>';
    if(mistakes.length){
      html += '<div class="ts-sec"><h4>差异明细（' + mistakes.length + ' 处）</h4><div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">';
      mistakes.forEach(m => {
        const loc = m.loc || '0';
        const wrong = m.wrong ? escapeHtml(m.wrong) : '<span class="muted">（漏写）</span>';
        const right = m.right ? escapeHtml(m.right) : '';
        html += '<div class="ts-fix" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px">'
          + '<b>第' + loc + '句</b> · ' + escapeHtml(m.type || '差异') + '：你写 <code>' + wrong + '</code> → 应为 <code>' + right + '</code>'
          + (m.note ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + escapeHtml(m.note) + '</div>' : '')
          + '</div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="ts-fix">✅ 没有实质差异，默写得很准。</div>';
    }
    box.innerHTML = html;

    // 记录到 dictationLogs（与语料库默写同源统计）
    DATA.dictationLogs = DATA.dictationLogs || [];
    DATA.dictationLogs.push({ sourceId: wtDictCurrent.id, title: wtDictCurrent.title, date: todayKey(), mistakes: mistakes });
    hubSave();
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '提交核对';
  }
}

/* ===== 万能语料库 ===== */
function renderBank(){
  const filter = $('#bankFilter').value;
  const list = DATA.writingPhrases.filter(p => filter === 'all' || p.type === filter);
  const box = $('#bankList');
  if(!list.length){ box.innerHTML = '<div class="muted">还没有语料。点「+ 新增语料」添加，或先用默认起步语料。</div>'; return; }
  box.innerHTML = list.map(p => {
    const ex = p.example ? '<div class="bank-ex">例：' + escapeHtml(p.example) + '</div>' : '';
    const cn = p.cn ? '<div class="bank-detail">' + escapeHtml(p.cn) + '</div>' : '';
    const tag = p.tag ? '<span class="bank-tag">' + escapeHtml(p.tag) + '</span>' : '';
    return '<div class="card bank-card" data-id="' + p.id + '">'
      + '<div class="bank-en">' + escapeHtml(p.en) + ' ' + tag + '</div>'
      + '<div class="bank-detail-holder" hidden>' + cn + ex + '</div>'
      + '<div class="bank-actions">'
      +   '<button class="bank-toggle" type="button">看释义</button>'
      +   '<button class="bank-del" type="button">删除</button>'
      + '</div></div>';
  }).join('');
  box.querySelectorAll('.bank-card').forEach(card => {
    const id = card.dataset.id;
    const holder = card.querySelector('.bank-detail-holder');
    card.querySelector('.bank-toggle').addEventListener('click', e => {
      holder.hidden = !holder.hidden;
      e.target.textContent = holder.hidden ? '看释义' : '隐藏';
    });
    card.querySelector('.bank-del').addEventListener('click', () => delPhrase(id));
  });
}
function addPhrase(){
  const type = $('#ba_type').value;
  const en = $('#ba_en').value.trim();
  if(!en){ toast('请填英文'); return; }
  DATA.writingPhrases.push({ id: uid(), type, en, cn: $('#ba_cn').value.trim(), tag: $('#ba_tag').value.trim(), example: $('#ba_ex').value.trim() });
  hubSave();
  $('#ba_en').value = $('#ba_cn').value = $('#ba_tag').value = $('#ba_ex').value = '';
  $('#bankAddCard').hidden = true;
  renderBank();
  toast('已添加');
}
function delPhrase(id){
  if(!confirm('删除这条语料？')) return;
  DATA.writingPhrases = DATA.writingPhrases.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave();
  renderBank();
}

/* ===== AI 作文评分 ===== */
/* 雅思官方评分细则（压缩版，LR/GRA 两卷共用；对照逐档给分） */
const RULES_LR = [
'【LR 词汇】',
'9 词汇丰富，能自然使用并掌握复杂的词汇特征；极少轻微错误，仅属笔误。',
'8 流畅灵活地使用丰富词汇，达意准确；熟练使用不常用词汇，但词语选择/搭配偶有错误；拼写/构词错误极少。',
'7 词汇足够，体现一定灵活性与准确性；使用不常见词汇，对语体与搭配有一定认识；选词、拼写/构词可能偶尔出错。',
'6 词汇足够开展写作任务；试图使用不常用词汇但有时不准确；拼写/构词有错误但不影响交流。',
'5 词汇范围有限，但能达到写作任务的最低限度；拼写/构词可能有明显错误，给读者造成一定阅读困难。',
'4 只使用基本词汇，有时重复或用词不当；构词/拼写掌握有限；错误可能造成阅读困难。',
'3 词汇及表达方式非常有限，构词/拼写掌握非常有限；错误可能严重影响信息传达。',
'2 词汇使用极其有限，基本未能掌握构词/拼写。',
'1 仅能孤立地使用少数单词。'
].join('\n');

const RULES_GRA = [
'【GRA 语法】',
'9 完全灵活准确地运用丰富多样的语法结构；极少轻微错误，仅属笔误。',
'8 运用丰富多样的语法结构；大多数句子准确；极偶然出现错误或不当。',
'7 运用各种复杂语法结构；多数句子准确；语法标点掌握较好，但有时有少许错误。',
'6 综合使用简单与复杂句式；语法标点有些错误，但很少影响交流。',
'5 仅能使用有限语法结构；复杂句准确性常不及简单句；可能经常出现语法标点错误，造成一定阅读困难。',
'4 语法结构非常有限，只能偶尔使用从句；一些结构正确但错误占多数，标点经常出错。',
'3 尝试造句，但语法标点错误占多数，意思被扭曲。',
'2 除预先背诵的短语外，无法造句。',
'1 完全无法造句。'
].join('\n');

const RULES_TASK1 = [
'【TA 任务完成】',
'9 完全满足所有写作任务要求；清晰呈现充分展开的内容。',
'8 充分涵盖所有任务要求；就主要内容/要点进行清晰恰当的呈现、强调与阐述。',
'7 涵盖任务要求；清晰地呈现主要趋势、区别或不同阶段的概述；清晰呈现与强调主要内容/要点，但未能更充分展开。',
'6 根据任务要求作文；选择恰当的信息概述；呈现并充分强调主要内容/要点，但有时含不相关、不恰当或不准确的细节。',
'5 基本能就任务作文，但格式有时不当；机械地描述细节，缺乏清晰概述；有时未能用数据支持所描述的内容。',
'4 试图行文但未包含所有主要信息/要点；格式有时不恰当；有时混淆主要信息与细节。',
'3 可能因完全曲解任务而未能行文；观点有限，大部分不相关或重复。',
'2 写作内容与任务几乎无关。',
'1 写作内容与任务几乎无关。',
'【CC 连贯与衔接】',
'9 衔接手段运用自如，行文连贯；熟练地运用分段。',
'8 信息与观点有逻辑排序；各种衔接手段运用得当；充分且合理地使用分段。',
'7 有逻辑地组织信息与观点；清晰的行文推进贯穿全文；恰当地使用一系列衔接手段，尽管有时不足或过多。',
'6 连贯组织信息与观点，总体能清晰推进行文；有效使用衔接手段，但句内句间有时有误或过于机械；有时无法保持一贯清晰的指代。',
'5 有一定组织性，但总体有时缺乏清晰的行文推进；衔接手段不足、不准确或过度；指代与替换不足致行文重复。',
'4 呈现了信息与观点，但未能连贯组织、未能清晰推进行文；使用一些基本衔接，但有时不准确或重复。',
'3 不能有逻辑地组织观点；衔接手段非常有限，有时未能体现观点间的逻辑。',
'2 在内容组织方面能力非常有限。',
'1 未能传达任何信息。'
].join('\n') + '\n' + RULES_LR + '\n' + RULES_GRA;

const RULES_TASK2 = [
'【TR 任务回应】',
'9 全面地回应各部分写作任务；提出充分展开的观点，以及相关、充分延伸、论据充分的论点。',
'8 充分地回应各部分写作任务；进行较充分展开的回应，提出相关、延伸且含有论据的论点。',
'7 回应各部分写作任务；回应过程中始终呈现清晰观点；呈现、发展主要论点并论证，但有时过于一概而论/论点缺乏重点；每个段落有清晰的中心主题。',
'6 回应了各部分写作任务，但某些部分论证可能更充分；提出切题观点，尽管结论有时不甚清晰或重复；提出多个相关主要论点，但某些未充分展开或不甚清晰。',
'5 仅回应了部分写作任务；格式有时不当；表述观点但展开论证未能保持一贯清晰，可能缺乏结论；主要论点十分有限且未充分展开；有时出现无关细节。',
'4 仅最低限度地回应写作任务或所答相关性不大；观点不清晰；主要论点难以确认，可能重复、不相关或缺乏论据支持。',
'3 未能足以回应任一部分写作任务；未能表达清晰论点；论点甚少且基本未展开或观点不切题。',
'2 几乎未回应写作任务；未能表达观点；可能试图提出一两个论点但未展开论证。',
'1 写作内容与写作任务几乎无关。',
'【CC 连贯与衔接】',
'9 衔接手段运用自如，行文连贯；熟练地运用分段。',
'8 信息与观点有逻辑排序；各种衔接手段运用得当；充分且合理地使用分段。',
'7 有逻辑地组织信息与观点；清晰的行文推进贯穿全文；恰当地使用一系列衔接手段，尽管有时不足或过多。',
'6 连贯组织信息与观点，总体能清晰推进行文；有效使用衔接手段，但句内句间有时有误或过于机械；有时无法保持一贯清晰的指代；使用段落写作，但未能保持段落间逻辑。',
'5 有一定组织性，但总体有时缺乏清晰的行文推进；衔接手段不足、不准确或过度；指代与替换不足致行文重复；没有使用段落写作或分段不足。',
'4 呈现了信息与观点，但未能连贯组织、未能清晰推进行文；使用一些基本衔接，但有时不准确或重复；没有使用段落写作或分段造成疑惑。',
'3 不能有逻辑地组织观点；衔接手段非常有限，有时未能体现观点间的逻辑。',
'2 在内容组织方面能力非常有限。',
'1 未能传达任何信息。'
].join('\n') + '\n' + RULES_LR + '\n' + RULES_GRA;

async function scoreEssay(){
  const essay = $('#scoreEssay').value.trim();
  const type = $('#scoreType').value;
  if(essay.length < 150){ toast('作文太短，至少需要 150 词'); return; }

  const isTask1 = type === '小作文';
  const dim = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';

  const btn = $('#scoreBtn');
  const btnHtml = btn.innerHTML;   // 缓存原文，评分后恢复
  btn.disabled = true; btn.textContent = '评分中…';
  const resultEl = $('#scoreResult');
  const bodyEl = $('#scoreResultBody');
  resultEl.style.display = 'block';
  bodyEl.innerHTML = '<p class="muted">正在分析你的作文，请稍候…</p>';

  const messages = [
    { role:'system', content:
`你是雅思写作${isTask1 ? ' Task 1 小作文（学术类图表/数据题）' : ' Task 2 大作文（议论文）'}考官，严格按官方评分细则给分。
评分标准：${dim}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。

【${isTask1 ? 'Task 1 小作文' : 'Task 2 大作文'}官方评分细则（逐档对照评分）】
${isTask1 ? RULES_TASK1 : RULES_TASK2}

输出要求：
1. 对照细则逐档比对，给出 0-9 的预估分（可用 0.5）。
2. breakdown 第一项 key 统一用 "TR" 输出（${isTask1 ? '小作文时我知道它代表 TA' : '即 TR'}）。
3. 指出文中超过 35 词或含多层从句的复杂句，给出简化建议。
4. 全部用简体中文。

只输出严格 JSON，不要其他文字：
{"overall":6.0,"breakdown":{"TR":6.0,"CC":6.0,"LR":6.0,"GRA":5.5},"longSentences":[{"sentence":"原文句子","wordCount":42,"suggestion":"拆分建议"}],"suggestions":["建议1","建议2","建议3"]}` },
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
      return;
    }

    // 渲染结果
    let html = '';
    html += '<div class="score-overall">预估总分：' + (result.overall || 'N/A') + '</div>';
    if(result.breakdown){
      html += '<div class="score-breakdown">';
      ['TR','CC','LR','GRA'].forEach(k => {
        if(result.breakdown[k] != null){
          const label = (k === 'TR' && isTask1) ? 'TA' : k;
          html += '<div class="score-item"><b>' + escapeHtml(result.breakdown[k]) + '</b><span>' + label + '</span></div>';
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
    writeSyncMock(type, result);   // 方案 23：回流到分项模考看板
    hubSave();
    toast('评分完成');
  }catch(e){
    bodyEl.innerHTML = '<p class="muted">AI 服务暂不可用：' + escapeHtml(e.message) + '</p><p class="muted" style="font-size:13px">请检查「设置」中的 AI 接口地址。</p>';
  }finally{
    btn.disabled = false; btn.innerHTML = btnHtml;
    renderScoreHist();
  }
}

/* 方案 23：写作 AI 评分结果回流到回顾页「分项模考」看板（DATA.mockRecords, type:'writing'）。
   加权：Task 1 ×1，Task 2 ×2（与 MOCK_TYPES.writing 一致）。同日期同题型不重复叠加——覆盖式更新。 */
function writeSyncMock(type, result){
  if(!result || typeof result.overall === 'undefined') return;
  const isTask1 = type === '小作文';
  const t1 = isTask1 ? Number(result.overall) : (result.breakdown && result.breakdown.TA != null ? Number(result.breakdown.TA) : null);
  const t2 = !isTask1 ? Number(result.overall) : (result.breakdown && result.breakdown.TR != null ? Number(result.breakdown.TR) : null);
  // 用 breakdown 四维均值作为缺失项的兜底
  const dims = result.breakdown ? ['TR','CC','LR','GRA'].map(k => result.breakdown[k]).filter(v => v != null).map(Number) : [];
  const fallback = dims.length ? Math.round(dims.reduce((a,b)=>a+b,0)/dims.length*2)/2 : Number(result.overall);
  const parts = [];
  if(isTask1){
    if(t1 != null) parts.push({ label:'Task 1', score:t1, weight:1 });
    parts.push({ label:'Task 2', score:fallback, weight:2 });
  } else {
    parts.push({ label:'Task 1', score:fallback, weight:1 });
    if(t2 != null) parts.push({ label:'Task 2', score:t2, weight:2 });
  }
  const wsum = parts.reduce((s,x)=>s+x.weight,0);
  const overall = Math.round(parts.reduce((s,x)=>s+x.score*x.weight,0)/wsum*2)/2;
  // 覆盖式：同日期同题型只留一条
  const date = todayKey();
  const existing = DATA.mockRecords.find(r => r.type === 'writing' && r.date === date && r.ai === true);
  if(existing){ existing.parts = parts; existing.overall = overall; existing.note = 'AI 评分自动同步'; }
  else { DATA.mockRecords.unshift({ id:uid(), date, granularity:'whole', type:'writing',  parts, overall, note:'AI 评分自动同步', ai:true }); }
}

/* ===================== 写作真题模块 ===================== */
var examTimer = { start: 0, elapsed: 0, running: false, tick: null, cur: null };

function fmtExamTime(ms){
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  const p = n => String(n).padStart(2,'0');
  return p(h)+':'+p(m)+':'+p(sec);
}
function examTick(){
  const ms = examTimer.elapsed + (examTimer.running ? Date.now()-examTimer.start : 0);
  $('#examTimerText').textContent = fmtExamTime(ms);
}
function examStartTimer(){
  examTimer.start = Date.now(); examTimer.elapsed = 0; examTimer.running = true;
  if(examTimer.tick) clearInterval(examTimer.tick);
  examTimer.tick = setInterval(examTick, 1000); examTick();
}
function examPauseTimer(){
  if(!examTimer.running) return;
  examTimer.elapsed += Date.now()-examTimer.start; examTimer.running = false; examTick();
}
function examResumeTimer(){
  if(examTimer.running) return;
  examTimer.start = Date.now(); examTimer.running = true; examTick();
}
function examStopTimer(){
  examPauseTimer();
  if(examTimer.tick){ clearInterval(examTimer.tick); examTimer.tick = null; }
}

function renderExamList(){
  const data = window.WRITING_PROMPTS || { big:[], small:[] };
  const filter = $('#examFilter').value || 'all';
  const box = $('#examList');
  if(!box) return;
  let html = '';
  const makeItem = (it, kind) => {
    const typeLabel = kind === 'big' ? '大作文' : '小作文';
    const meta = kind === 'big' ? it.meta : ('雅思预测 · ' + typeLabel);
    const zh = kind === 'big' ? it.zh : (it.title || '');
    const zhText = zh.length > 80 ? zh.slice(0,80)+'…' : zh;
    const en = kind === 'big' ? it.en : (it.title || '');
    return '<div class="exam-item" data-kind="'+kind+'" data-no="'+it.no+'">'
      + '<div class="ei-top"><span class="ei-no">#'+(kind==='big'?it.no:'T'+it.no)+'</span>'
      + '<span class="ei-type">'+typeLabel+'</span>'
      + '<span class="ei-meta">'+escapeHtml(meta)+'</span></div>'
      + (zhText ? '<div class="ei-zh">'+escapeHtml(zhText)+'</div>' : '')
      + (en ? '<div class="ei-en">'+escapeHtml(en)+'</div>' : '')
      + '</div>';
  };
  if(filter === 'big' || filter === 'all'){
    html += '<div class="exam-group-title">大作文 · Task 2（'+data.big.length+' 题）</div>';
    html += data.big.map(it => makeItem(it,'big')).join('');
  }
  if(filter === 'small' || filter === 'all'){
    html += '<div class="exam-group-title">小作文 · Task 1（'+data.small.length+' 题）</div>';
    html += data.small.map(it => makeItem(it,'small')).join('');
  }
  box.innerHTML = html;
  box.querySelectorAll('.exam-item').forEach(el => {
    el.addEventListener('click', () => {
      const kind = el.dataset.kind, no = Number(el.dataset.no);
      const item = (kind==='big'?data.big:data.small).find(x => x.no === no);
      openExam(item, kind);
    });
  });
}

function openExam(item, kind){
  examTimer.cur = { kind, no: item.no };
  $('#examHome').hidden = true;
  $('#examPractice').hidden = false;
  document.body.classList.add('exam-fullscreen');   // 进入全屏沉浸式
  const isBig = kind === 'big';
  const partNo = isBig ? 2 : 1;
  const typeLabel = isBig ? '大作文 Task 2' : '小作文 Task 1';
  $('#examPartLabel').textContent = 'Part ' + partNo;
  $('#examStepBadge').textContent = String(partNo);
  $('#examStepLabel').textContent = 'Part ' + partNo;
  $('#examInstr').textContent = isBig
    ? 'You should spend about 40 minutes on this task. Write at least 250 words.'
    : 'You should spend about 20 minutes on this task. Write at least 150 words.';
  if(isBig){
    $('#examQuestion').innerHTML =
      '<div class="ei-zh">' + escapeHtml(item.zh) + '</div>' +
      '<div class="ei-en">' + escapeHtml(item.en) + '</div>';
    $('#examQNote').textContent = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
  } else {
    $('#examQuestion').innerHTML = '<div class="ei-en">' + escapeHtml(item.title) + '</div>';
    $('#examQNote').textContent = 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.';
  }
  $('#examEssay').value = '';
  $('#examWordCount').textContent = 'Word count: 0';
  $('#examResult').hidden = true;
  examStartTimer();   // 点进去自动开始计时（不强制限时）
}

function examStopAndScore(){
  // 自动评分（复用官方 4 维度 prompt）。此处独立实现，避免依赖 scoreEssay 的 DOM。
  const essay = $('#examEssay').value.trim();
  const type = examTimer.cur && examTimer.cur.kind === 'big' ? '大作文' : '小作文';
  if(essay.length < 150){ toast('作文太短，至少需要 150 词'); return; }
  const isTask1 = type === '小作文';
  const dim = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';
  const btn = $('#examScoreBtn');
  const btnHtml = btn.innerHTML;
  btn.disabled = true; btn.textContent = '评分中…';
  const box = $('#examResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在按官方 4 维度评分，请稍候…</div>';
  const messages = [
    { role:'system', content:
`你是雅思写作${isTask1 ? ' Task 1 小作文（学术类图表/数据题）' : ' Task 2 大作文（议论文）'}考官，严格按官方评分细则给分。
评分标准：${dim}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。
${isTask1 ? RULES_TASK1 : RULES_TASK2}
输出要求：
1. 对照细则逐档比对，给出 0-9 的预估分（可用 0.5）。
2. breakdown 第一项 key 统一用 "TR" 输出（${isTask1 ? '小作文时我知道它代表 TA' : '即 TR'}）。
3. 指出文中超过 35 词或含多层从句的复杂句，给出简化建议。
4. 全部用简体中文。
只输出严格 JSON，不要其他文字：
{"overall":6.0,"breakdown":{"TR":6.0,"CC":6.0,"LR":6.0,"GRA":5.5},"longSentences":[{"sentence":"原文句子","wordCount":42,"suggestion":"拆分建议"}],"suggestions":["建议1","建议2","建议3"]}` },
    { role:'user', content:'题型：' + type + '\n\n作文：\n' + essay }
  ];
  (async () => {
    try{
      const content = await callRelay('writing_score', messages, 0.4);
      const result = aiJson(content);
      if(!result){
        box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">'+escapeHtml(content)+'</div></div>';
        toast('AI 返回格式异常，已显示原文');
        return;
      }
      let html = '<div class="ts-top"><span class="ts-overall">'+escapeHtml(result.overall || 'N/A')+'</span><span class="muted">预估总分</span></div>';
      if(result.breakdown){
        html += '<div class="ts-dims">';
        ['TR','CC','LR','GRA'].forEach(k => {
          if(result.breakdown[k] != null){
            const label = (k==='TR'&&isTask1) ? 'TA' : k;
            html += '<div class="ts-dim"><div class="ts-dim-h">'+label+' <b>'+escapeHtml(result.breakdown[k])+'</b></div></div>';
          }
        });
        html += '</div>';
      }
      if(result.longSentences && result.longSentences.length){
        html += '<div class="ts-sec"><h4>长 / 复杂句分析</h4>';
        result.longSentences.forEach((ls,i) => {
          html += '<div class="ts-gram"><b>第 '+(i+1)+' 句（'+(ls.wordCount||'?')+' 词）：</b>'+escapeHtml(ls.sentence||'')+'<br><span class="ts-fix">建议：'+escapeHtml(ls.suggestion||'')+'</span></div>';
        });
        html += '</div>';
      }
      if(result.suggestions && result.suggestions.length){
        html += '<div class="ts-sec"><h4>改进建议</h4><ul>';
        result.suggestions.forEach(s => { html += '<li>'+escapeHtml(s)+'</li>'; });
        html += '</ul></div>';
      }
      box.innerHTML = html;
      // 存盘：真题模考评分记录持久化（刷新不丢），并回流到回顾页「分项模考」看板
      try{
        const cur = examTimer.cur || {};
        const examType = type; // '大作文' / '小作文'
        DATA.writingScores = DATA.writingScores || [];
        DATA.writingScores.push({
          id: uid(), date: todayKey(), mode:'exam',
          examNo: cur.no != null ? (cur.kind==='big' ? cur.no : 'T'+cur.no) : '',
          type: examType, essay: essay, result: result, parsed: true
        });
        hubSave();
        writeSyncMock(examType, result); // 与整篇评分一致，回流分项模考看板
        renderScoreHist(); // 同步刷新「AI 评分」tab 的记录列表
      }catch(e){ console.warn('exam score save failed', e); }
      toast('评分完成');
    }catch(e){
      box.innerHTML = '<p class="muted">AI 服务暂不可用：'+escapeHtml(e.message)+'</p><p class="muted" style="font-size:13px">请检查「设置」中的 AI 接口地址。</p>';
    }finally{
      btn.disabled = false; btn.innerHTML = btnHtml;
    }
  })();
}

function bindExam(){
  const f = $('#examFilter');
  if(f) f.addEventListener('change', renderExamList);

  const exitExam = () => {
    examStopTimer();
    document.body.classList.remove('exam-fullscreen');
    $('#examPractice').hidden = true;
    $('#examHome').hidden = false;
  };
  const back = $('#examBack');
  if(back) back.addEventListener('click', exitExam);
  const exitBtn = $('#examExit');
  if(exitBtn) exitBtn.addEventListener('click', exitExam);
  const exitFull = $('#examExitFull');
  if(exitFull) exitFull.addEventListener('click', exitExam);

  const finish = $('#examFinish');
  if(finish) finish.addEventListener('click', () => { examStopAndScore(); });

  const tb = $('#examTimerBtn');
  if(tb) tb.addEventListener('click', () => {
    if(examTimer.running){ examPauseTimer(); tb.textContent = '▶'; }
    else { examResumeTimer(); tb.textContent = '⏸'; }
  });
  const essay = $('#examEssay');
  if(essay) essay.addEventListener('input', () => {
    const n = (essay.value.trim().match(/\b[\w'-]+\b/g) || []).length;
    $('#examWordCount').textContent = 'Word count: ' + n;
  });
  const sb = $('#examScoreBtn');
  if(sb) sb.addEventListener('click', examStopAndScore);
}

