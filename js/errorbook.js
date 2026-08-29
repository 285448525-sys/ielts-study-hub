/* 错题本（极简版）：一个大框粘 AI 讲解 → AI 结构化 → 自动归档 + 错因统计
   数据结构（kind:'ai'）：
   { id, date, kind:'ai', known, source,
     title, subject, qtype, trap, howto:[], wrongPoint, rule:[], words:[], raw }
   兼容老数据 kind:'question' / 'word'（只读渲染，不再提供录入表单）。 */

ready(() => {
  /* 子 tab 切换：长难句拆解 / 错题本（默认长难句在前） */
  const wordTabs = document.querySelectorAll('#wordTabs [data-sub]');
  wordTabs.forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.sub;
    wordTabs.forEach(x => x.classList.toggle('active', x === b));
    $('#lsView').hidden = (s !== 'ls');
    $('#ebView').hidden = (s !== 'eb');
    if(s === 'ls') renderHistory();
  }));

  /* 错题本 */
  $('#ebAnalyze').addEventListener('click', analyzeEntry);
  $('#ebRaw').addEventListener('click', saveRawEntry);
  render();

  /* 长难句拆解 */
  $('#analyzeBtn').addEventListener('click', analyze);
  $('#copyBtn').addEventListener('click', copyResult);
  renderHistory();
  // 全局快捷键：S 收录当前悬停的单词
  document.addEventListener('keydown', e => {
    if((e.key === 's' || e.key === 'S') && _hoveredWord && !e.ctrlKey && !e.altKey && !e.metaKey){
      const tag = e.target && e.target.tagName;
      if(tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      saveWord(_hoveredWord.en, _hoveredWord.cn);
    }
  });
});

/* ---------- 录入 ---------- */
/* 返回值：true = 成功归档（调用方可安全删除旧记录）；false = 未归档，原数据必须保留 */
async function analyzeEntry(){
  const box = $('#ebInput');
  const text = box.value.trim();
  if(text.length < 15){ toast('内容太短，把你的错题笔记整段贴进来'); return false; }
  if(!DATA.settings.relayToken){
    toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下；也可以先点「只存原文」');
    return false;
  }

  const btn = $('#ebAnalyze');
  const btnHtml = btn.innerHTML;
  const load = $('#ebLoading');
  btn.disabled = true; btn.textContent = 'AI 分析中…';
  load.hidden = false;
  load.textContent = '正在把这段讲解拆成「题干拆解 / 翻译 / 生词」，大概十几秒…';

  const messages = [
    { role:'system', content:
`你是雅思错题诊断助手，服务对象是一名冲总分 6.0 的中国考生（弱项：听力、口语；阅读速度慢，且常把 FALSE 误判成 NOT GIVEN）。
用户会粘贴一段关于某道错题的讲解——通常是别的 AI 对答题截图的回复，也可能是她自己的零散笔记，格式混乱、有多余的话都正常。
你的任务：把它整理成结构化内容。全部用简体中文，务实、具体、能照着做，不要空话套话。

字段要求：
- title：一句话说清这是哪道题/什么题，只概括题目内容本身（如「一道阅读判断题，关于布料材质」）。
  ⚠️ 禁止写来源，不许出现「剑18」「剑桥」「来自XX」这类说法——你不知道出处，编出来是错的。
- qtype：题型，如 判断(TFNG)、填空、匹配、选择、Heading、简答、地图题、多选 等；判断不出写「其他」。
- questionText：题干原文。资料里没有题干就填空字符串。
- passageSnippet：相关的原文/材料片段（如果有）。没有就空字符串。
- translation：题干整句的自然中文翻译。
- structureAnalysis：用「同声传译」方式拆解题干，逐词/逐意群对照，对象结构：
  {"wordByWord":[{"en":"英文片段","cn":"中文直译"}],"natural":"自然通顺的整句理解","answerNote":"这题/这个空要你填什么（答案是什么类型）"}
  其中 answerNote 举例：题干「这块布料由什么制成？」→ answerNote 应为「要填的是材料类型（如棉/羊毛），不是布料本身」。
- words：讲解里出现的值得记的生词/短语，每项 {"en":"","cn":""}，没有就空数组。

资料信息不足时，就基于已有信息给最有价值的部分，绝不编造原文内容。
只输出 JSON，不要任何解释文字、不要 markdown 围栏：
{"title":"","qtype":"","questionText":"","passageSnippet":"","translation":"","structureAnalysis":{"wordByWord":[{"en":"","cn":""}],"natural":"","answerNote":""},"words":[{"en":"","cn":""}]}` },
    { role:'user', content: text }
  ];

  try{
    const content = await callRelay('errorbook', messages, 0.3);
    const r = aiJson(content);
    const entry = {
      id: uid(), date: todayKey(), kind:'ai', known:false, source: text
    };
    if(r){
      Object.assign(entry, {
        title: String(r.title || '').trim() || '（未命名错题）',
        qtype: String(r.qtype || '其他').trim(),
        questionText: String(r.questionText || '').trim(),
        passageSnippet: String(r.passageSnippet || '').trim(),
        translation: String(r.translation || '').trim(),
        structureAnalysis: (r.structureAnalysis && typeof r.structureAnalysis === 'object')
          ? { wordByWord: Array.isArray(r.structureAnalysis.wordByWord) ? r.structureAnalysis.wordByWord : [],
              natural: String(r.structureAnalysis.natural || '').trim(),
              answerNote: String(r.structureAnalysis.answerNote || '').trim() }
          : null,
        words: Array.isArray(r.words)
          ? r.words.map(w => ({ en: String(w.en || '').trim(), cn: String(w.cn || '').trim() })).filter(w => w.en)
          : []
      });
    } else {
      // AI 没按 JSON 回 → 原文照存，不丢东西
      Object.assign(entry, {
        title: '（AI 返回非标准格式，已存原文）', qtype:'其他',
        questionText:'', passageSnippet:'', translation:'', structureAnalysis:null,
        words: [], raw: content
      });
    }
    DATA.errorbook.unshift(entry);
    hubSave();
    box.value = '';
    load.hidden = true;
    render();
    toast(r ? '已分析并归档' : 'AI 格式异常，已存原文');
    const first = document.querySelector('#list .eb-card');
    if(first) first.scrollIntoView({ behavior:'smooth', block:'center' });
    return true;
  }catch(e){
    load.textContent = 'AI 调不通：' + e.message + '　（可以先点「只存原文」，等有网/配好 Key 再补分析）';
    return false;
  }finally{
    btn.disabled = false; btn.innerHTML = btnHtml;
  }
}

/* 不走 AI，先把原文存下来，之后可以点卡片上的「补 AI 分析」 */
function saveRawEntry(){
  const box = $('#ebInput');
  const text = box.value.trim();
  if(text.length < 5){ toast('先写点东西'); return; }
  DATA.errorbook.unshift({
    id: uid(), date: todayKey(), kind:'ai', known:false, source: text,
    title:'（未分析）' + text.slice(0, 24).replace(/\s+/g,' '),
    qtype:'其他', questionText:'', passageSnippet:'', translation:'', structureAnalysis:null, words:[]
  });
  hubSave();
  box.value = '';
  render();
  toast('已存原文，之后可点卡片「补 AI 分析」');
}

/* ---------- 已删除截图识别（视觉模型） ----------
   P1-B（2026-08-16）：视觉模型与中转代理一并移除，错题本改为纯文字粘贴。
   老数据 kind:'capture' 仍由 captureCard() 只读渲染，不丢失、不报错。 */

/* 对已存原文的记录补跑一次 AI
   ⚠️ 数据安全铁律：必须「分析成功之后」才删旧记录。
   AI 分析有多条失败路径（原文过短 / 没配 Key / 网络异常），若先删后跑，
   任何一条失败都会让用户手打/粘贴的原始资料永久消失且不可恢复。 */
async function reanalyze(id){
  const e = DATA.errorbook.find(x => x.id === id);
  if(!e || !e.source){ toast('这条没有原始资料，无法分析'); return; }

  const box = $('#ebInput');
  // 输入框里可能还有用户没保存的草稿，别默默冲掉
  const draft = box.value.trim();
  if(draft && draft !== e.source.trim()){
    if(!confirm('上面输入框里还有没归档的内容，继续会被这条记录的原文替换。要继续吗？')) return;
  }

  box.value = e.source;
  window.scrollTo({ top:0, behavior:'smooth' });

  const ok = await analyzeEntry();
  if(ok){
    // 新记录已归档，此时才安全地移除旧的那条
    DATA.errorbook = DATA.errorbook.filter(x => x.id !== id);
    DATA.deletedIds = DATA.deletedIds || [];
    if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);  // 墓碑：防云同步把旧记录拉回
    hubSave();
    render();
  } else {
    // 失败：旧记录原样保留。提示写在 #ebLoading（不用 toast，免得盖掉上面「没填 Key」之类的具体原因）
    const load = $('#ebLoading');
    if(load){
      const prev = load.hidden ? '' : (load.textContent + '　');
      load.hidden = false;
      load.textContent = prev + '⚠️ 没分析成功，这条记录仍在下面列表里、原文没丢。原文已放进上面输入框，可以改完再点「理清错因并归档」（成功后记得删掉旧的那条）。';
    }
  }
}

function toArr(v){
  if(Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if(v == null || v === '') return [];
  return [String(v).trim()];
}

/* ---------- 渲染 ---------- */
function render(){
  const list = DATA.errorbook
    .slice()
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  $('#count').textContent = list.length;
  const box = $('#list');
  $('#empty').hidden = DATA.errorbook.length > 0;
  box.innerHTML = list.map(cardHtml).join('');
  bindWordHover(box);

  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if(confirm('确定删除这条记录？')){
      const id = b.dataset.del;
      DATA.errorbook = DATA.errorbook.filter(x => x.id !== id);
      DATA.deletedIds = DATA.deletedIds || [];
      if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
      hubSave(); render();
    }
  }));
  box.querySelectorAll('[data-known]').forEach(b => b.addEventListener('click', () => {
    const e = DATA.errorbook.find(x => x.id === b.dataset.known);
    if(e){ e.known = !e.known; hubSave(); render(); }
  }));
  box.querySelectorAll('[data-redo]').forEach(b => b.addEventListener('click', () => reanalyze(b.dataset.redo)));
}

function cardHtml(e){
  if(e.kind === 'word')     return oldWordCard(e);
  if(e.kind === 'question') return oldQuestionCard(e);
  if(e.kind === 'capture')  return captureCard(e);

  const badges = [
    e.qtype  && e.qtype  !== '其他' ? `<span class="badge">${escapeHtml(e.qtype)}</span>` : '',
    e.known ? '<span class="badge badge-ok">已掌握</span>' : ''
  ].join('');

  const questionText = e.questionText
    ? `<div class="eb-block"><h4>题干原文</h4><p style="white-space:pre-wrap">${escapeHtml(e.questionText)}</p></div>` : '';
  const passageSnippet = e.passageSnippet
    ? `<div class="eb-block"><h4>对应原文</h4><p style="white-space:pre-wrap">${escapeHtml(e.passageSnippet)}</p></div>` : '';
  const translation = e.translation
    ? `<div class="eb-block"><h4>整句翻译</h4><p>${escapeHtml(e.translation)}</p></div>` : '';
  const sa = e.structureAnalysis;
  const splitHtml = (sa && sa.wordByWord && sa.wordByWord.length)
    ? `<div class="eb-block"><h4>题干拆解 · 同声传译</h4>
        <div class="ls-wbw-grid">${sa.wordByWord.map(w => {
          const en = escapeHtml((w.en||'').trim()), cn = escapeHtml((w.cn||'').trim());
          return en ? `<div class="ls-wbw-item" tabindex="0" data-en="${en}" data-cn="${cn}" title="点击收录 · 悬停按 S 一键收录"><span class="ls-wbw-en">${en}</span><span class="ls-wbw-cn">${cn}</span></div>` : '';
        }).join('')}</div>
        ${sa.natural ? `<div class="ls-natural" style="margin-top:8px">自然理解：${escapeHtml(sa.natural)}</div>` : ''}
        ${sa.answerNote ? `<div class="eb-rule" style="margin-top:8px">这题要你填：${escapeHtml(sa.answerNote)}</div>` : ''}
      </div>` : '';
  const words = (e.words && e.words.length)
    ? `<div class="eb-block"><h4>生词 · 点击收录</h4><div class="ls-kw-list">${e.words.map(w => {
        const en = escapeHtml(w.en||''), cn = escapeHtml(w.cn||'');
        return `<div class="ls-kw-row" tabindex="0" data-en="${en}" data-cn="${cn}" title="点击收录 · 悬停按 S 一键收录"><div class="ls-kw-main"><span class="ls-kw-en">${en}</span><span class="ls-kw-cn">${cn}</span></div><button class="ls-kw-save" data-en="${en}" data-cn="${cn}">收录</button></div>`;
      }).join('')}</div></div>` : '';
  const raw = e.raw
    ? `<div class="eb-block"><h4>AI 原始回复</h4><p style="white-space:pre-wrap">${escapeHtml(e.raw)}</p></div>` : '';
  const src = e.source
    ? `<details class="eb-src"><summary>看我粘进来的原始资料</summary><pre>${escapeHtml(e.source)}</pre></details>` : '';
  const needRedo = !e.structureAnalysis || !e.structureAnalysis.wordByWord || !e.structureAnalysis.wordByWord.length;

  return `<div class="eb-card">
    <div class="eb-head">${badges}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.title || '（未命名错题）')}</div>
    ${questionText}${passageSnippet}${translation}${splitHtml}${words}${raw}${src}
    <div class="eb-actions">
      ${needRedo ? `<button class="btn btn-sm btn-primary" data-redo="${e.id}">🤖 补 AI 分析</button>` : ''}
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}

/* 截图识别条目渲染（视觉模型产出，含缩略图与新扩展字段） */
function captureCard(e){
  const imgs = (e.images || []).map((u, i) =>
    '<div class="eb-thumb"><img src="' + u + '" alt="截图' + (i+1) + '"/></div>'
  ).join('');
  const badges = [
    e.subject && e.subject !== '其他' ? '<span class="badge">' + escapeHtml(e.subject) + '</span>' : '',
    e.qtype  && e.qtype  !== '其他' ? '<span class="badge">' + escapeHtml(e.qtype) + '</span>' : '',
    e.trap   && e.trap   !== '其他' ? '<span class="badge badge-trap">' + escapeHtml(e.trap) + '</span>' : '',
    e.known ? '<span class="badge badge-ok">已掌握</span>' : ''
  ].join('');

  const fields = [];
  if(e.questionText)   fields.push(block('题干原文', '<p>' + escapeHtml(e.questionText) + '</p>'));
  if(e.passageSnippet) fields.push(block('对应原文', '<p>' + escapeHtml(e.passageSnippet) + '</p>'));
  if(e.userAnswer || e.correctAnswer)
    fields.push(block('你的答案 vs 正确答案', '<p>' + escapeHtml(e.userAnswer || '—') + ' → ' + escapeHtml(e.correctAnswer || '—') + '</p>'));
  if(e.errorLocation)  fields.push(block('错在哪', '<div class="eb-wrong">' + escapeHtml(e.errorLocation) + '</div>'));
  if(e.wrongPoint)     fields.push(block('错点', '<div class="eb-wrong">' + escapeHtml(e.wrongPoint) + '</div>'));
  if(e.testPoint)      fields.push(block('考点', '<p>' + escapeHtml(e.testPoint) + '</p>'));
  if(e.structureAnalysis) fields.push(block('题干与原文结构分析', '<p>' + escapeHtml(e.structureAnalysis) + '</p>'));
  if(e.translation)    fields.push(block('翻译说明', '<p>' + escapeHtml(e.translation) + '</p>'));
  const longS = (e.longSentence || []).filter(x => x.sentence).map(x =>
    '<div class="eb-long"><div class="eb-long-s">' + escapeHtml(x.sentence) + '</div>' +
    '<div class="eb-long-a">' + escapeHtml(x.analysis) + '</div></div>'
  ).join('');
  if(longS) fields.push(block('长难句分析', longS));

  const howto = (e.howto && e.howto.length)
    ? block('这道题怎么做', '<ol>' + e.howto.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ol>') : '';
  const rule = (e.rule && e.rule.length)
    ? block('下次怎么避免', '<div class="eb-rule">' + e.rule.map(escapeHtml).join('<br>') + '</div>') : '';
  const words = (e.words && e.words.length)
    ? block('顺手记的词', '<div class="eb-words">' + e.words.map(w => '<span class="eb-chip">' + escapeHtml(w) + '</span>').join('') + '</div>') : '';
  const raw = e.raw
    ? block('AI 原始回复', '<p style="white-space:pre-wrap">' + escapeHtml(e.raw) + '</p>') : '';

  return '<div class="eb-card">' +
    '<div class="eb-head">' + badges + '<span class="muted" style="margin-left:auto;font-size:12.5px">' + escapeHtml(e.date || '') + '</span></div>' +
    (imgs ? '<div class="eb-thumbs">' + imgs + '</div>' : '') +
    '<div class="eb-title">' + escapeHtml(e.title || '（未命名错题）') + '</div>' +
    howto + fields.join('') + rule + words + raw +
    '<div class="eb-actions">' +
      '<button class="btn btn-sm" data-known="' + e.id + '">' + (e.known ? '标为未掌握' : '标为已掌握') + '</button>' +
      '<button class="btn btn-sm btn-danger" data-del="' + e.id + '">删除</button>' +
    '</div>' +
  '</div>';
}

function block(h, inner){
  return '<div class="eb-block"><h4>' + escapeHtml(h) + '</h4>' + inner + '</div>';
}

/* 老数据只读渲染（以前那套多字段表单存的） */
function oldQuestionCard(e){
  return `<div class="eb-card">
    <div class="eb-head"><span class="badge">${e.subject==='reading'?'阅读':'听力'}</span><span class="badge">${escapeHtml(e.qtype||'')}</span><span class="badge badge-trap">${escapeHtml(e.trap||'')}</span>${e.known?'<span class="badge badge-ok">已掌握</span>':''}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.stem||'')}</div>
    <div class="eb-block"><p class="muted">定位：${escapeHtml(e.locate||'—')}　|　原文：${escapeHtml(e.original||'—')}</p></div>
    <div class="eb-block"><div class="eb-wrong">错：${escapeHtml(e.wrong||'—')} → 正：${escapeHtml(e.right||'—')}</div></div>
    ${e.note ? `<div class="eb-block"><div class="eb-rule">${escapeHtml(e.note)}</div></div>` : ''}
    <div class="eb-actions">
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}
function oldWordCard(e){
  return `<div class="eb-card">
    <div class="eb-head"><span class="badge">单词</span>${e.known?'<span class="badge badge-ok">已掌握</span>':''}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.en||'')} <span class="muted" style="font-weight:400">${escapeHtml(e.cn||'')}</span></div>
    <div class="eb-actions">
      <button class="btn btn-sm" data-known="${e.id}">${e.known ? '标为未掌握' : '标为已掌握'}</button>
      <button class="btn btn-sm btn-danger" data-del="${e.id}">删除</button>
    </div>
  </div>`;
}

/* ===================== 长难句拆解（从 longsent.js 合并，保留 DATA.longSent） ===================== */
var SYS_LONG = `你是一位资深的雅思阅读老师。用户会给你一个英文长难句，请按"同声传译"方式输出以下 JSON（不要前言、不要解释、不要背景知识，不要输出 markdown 代码块围栏）：

{"wordByWord":[{"en":"英文片段","cn":"中文直译"}],"natural":"自然流畅的中文译文","keyWords":[{"en":"考点词","cn":"中文释义","note":"考点提示：同义替换/熟词僻义/学术用法等"}]}

要求：
1. wordByWord 必须按原句语序逐词或逐意群给出中文直译，方便用户对照自己的翻译。常见意群可合并为一个条目（如 "in the perceiver" 可作为一个条目）。
2. natural 给出自然通顺的中文译文，仅供用户参考最终意思。
3. keyWords 提取 3–6 个句中真正影响理解的考点词或学术词，每条含：en（原词/短语）、cn（中文释义）、note（一句考点提示，如同义替换、熟词僻义、常见误判等）。
4. 不要输出 "一、拆解步骤"、"二、语法结构"、"三、背景知识" 等大段说明。只输出上述 JSON。`;

var _lastSentence = '';
var _lastRaw = '';
var _hoveredWord = null;

async function analyze(){
  const sent = $('#sentInput').value.trim();
  if(!sent){ toast('先粘贴一个长难句'); return; }
  if(!DATA.settings.relayToken){ toast('还没配置 API Key：去「设置 / AI 接口」填一下 DeepSeek Key 就能拆解'); return; }
  const status = $('#sentStatus');
  status.textContent = '拆解中…（长句可能要 10–20 秒）'; status.className = 'word-status loading';
  $('#analyzeBtn').disabled = true;
  try{
    const text = await callLongsent([{ role:'system', content: SYS_LONG }, { role:'user', content: sent }]);
    _lastSentence = sent; _lastRaw = text;
    const body = $('#resultBody');
    body.innerHTML = renderResult(sent, text);
    bindWordHover(body);
    $('#origSent').textContent = sent;
    $('#resultCard').style.display = '';
    status.textContent = '拆解完成 ✓'; status.className = 'word-status ok';
    saveHist(sent, text);
    renderHistory();
  }catch(e){
    status.textContent = '拆解失败：' + e.message; status.className = 'word-status err';
    toast('拆解失败：' + e.message);
  }finally{
    $('#analyzeBtn').disabled = false;
  }
}

/* 新格式：优先尝试解析 JSON；失败则回退到旧版 markdown 分段渲染（兼容历史记录） */
function renderResult(sent, raw){
  const json = aiJson(raw);
  if(json && Array.isArray(json.wordByWord) && typeof json.natural === 'string'){
    return renderNewResult(json);
  }
  return parseSections(raw).map(s => `<div class="rs-sec"><h3>${escapeHtml(s.title)}</h3>${renderBody(s.body)}</div>`).join('');
}

function renderNewResult(json){
  const wbw = (json.wordByWord || []).map(w => {
    const en = escapeHtml((w.en || '').trim());
    const cn = escapeHtml((w.cn || '').trim());
    if(!en) return '';
    return `<div class="ls-wbw-item" tabindex="0" data-en="${en}" data-cn="${cn}" title="点击收录 · 悬停按 S 一键收录">
      <span class="ls-wbw-en">${en}</span>
      <span class="ls-wbw-cn">${cn}</span>
    </div>`;
  }).join('');

  const kws = (json.keyWords || []).map(w => {
    const en = escapeHtml((w.en || '').trim());
    const cn = escapeHtml((w.cn || '').trim());
    const note = escapeHtml((w.note || '').trim());
    if(!en) return '';
    return `<div class="ls-kw-row" tabindex="0" data-en="${en}" data-cn="${cn}" title="点击收录 · 悬停按 S 一键收录">
      <div class="ls-kw-main">
        <span class="ls-kw-en">${en}</span>
        <span class="ls-kw-cn">${cn}</span>
        ${note ? `<span class="ls-kw-note">${note}</span>` : ''}
      </div>
      <button class="ls-kw-save" data-en="${en}" data-cn="${cn}" title="按 S 一键收录">收录</button>
    </div>`;
  }).join('');

  return `
    <div class="ls-sec">
      <div class="ls-sec-title">同声传译 · 按语序逐字对照</div>
      <div class="ls-wbw-grid">${wbw || renderEmpty('无逐词对照')}</div>
      <div class="ls-save-hint">💡 悬停单词或重点词，按 <kbd>S</kbd> 一键收录到「我的词库」</div>
    </div>
    <div class="ls-sec">
      <div class="ls-sec-title">自然译文 · 参考</div>
      <div class="ls-natural">${escapeHtml(json.natural || '')}</div>
    </div>
    <div class="ls-sec">
      <div class="ls-sec-title">重点词汇 · 点击/按 S 收录</div>
      <div class="ls-kw-list">${kws || renderEmpty('无重点词汇')}</div>
    </div>
  `;
}

/* 事件委托：悬停追踪 + 点击收录 */
function bindWordHover(container){
  if(!container) return;
  container.addEventListener('mouseenter', e => {
    const item = e.target.closest('[data-en]');
    if(item) _hoveredWord = { en: item.dataset.en, cn: item.dataset.cn || '' };
  }, true);
  container.addEventListener('mouseleave', e => {
    const item = e.target.closest('[data-en]');
    if(item) _hoveredWord = null;
  }, true);
  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-en]');
    if(btn && btn.dataset.en){
      e.stopPropagation();
      saveWord(btn.dataset.en, btn.dataset.cn || '');
    }
  });
}

function saveWord(en, cn){
  if(!en) return;
  const key = en.toLowerCase().trim();
  DATA.words = DATA.words || [];
  const exists = DATA.words.some(w => w.en.toLowerCase() === key);
  if(exists){ toast(`「${en}」已在词库中`); return; }
  DATA.words.push({ id: uid(), en: en.trim(), cn: (cn || '').trim(), ts: Date.now() });
  hubSave();
  toast(`已收录「${en}」到词库`);
}

/* 旧版 markdown 分段解析（兼容历史记录） */
function parseSections(text){
  const lines = text.split('\n');
  const out = []; let cur = null;
  for(const raw of lines){
    const m = raw.match(/^##\s+(.*)$/);
    if(m){ if(cur) out.push(cur); cur = { title: m[1].trim(), body: '' }; }
    else if(cur){ cur.body += (cur.body ? '\n' : '') + raw; }
  }
  if(cur) out.push(cur);
  return out;
}

function renderBody(body){
  const lines = body.split('\n');
  let html = '', mode = 'none', buf = '';
  const flushP = () => { if(mode === 'p'){ html += '<p>' + buf + '</p>'; buf = ''; } };
  const closeList = () => { if(mode === 'list'){ html += '</ul>'; } };
  for(const raw of lines){
    const line = raw.replace(/\s+$/, '');
    if(!line.trim()){ flushP(); closeList(); mode = 'none'; continue; }
    const bm = line.match(/^\s*[-*]\s+(.*)$/);
    if(bm){
      flushP();
      if(mode !== 'list'){ html += '<ul class="rs-list">'; mode = 'list'; }
      html += '<li>' + fmtBullet(bm[1].trim()) + '</li>';
    }else{
      closeList();
      const esc = escapeHtml(line.trim());
      if(mode === 'p'){ buf += '<br>' + esc; }
      else { buf = esc; mode = 'p'; }
    }
  }
  flushP(); closeList();
  return html;
}

function fmtBullet(t){
  const i = t.search(/[—→]/);
  if(i > 0) return '<b>' + escapeHtml(t.slice(0, i).trim()) + '</b>' + escapeHtml(t.slice(i));
  return escapeHtml(t);
}

async function copyResult(){
  if(!_lastRaw) return;
  const json = aiJson(_lastRaw);
  let text = '原句：\n' + _lastSentence + '\n\n';
  if(json && typeof json.natural === 'string'){
    text += '自然译文：\n' + json.natural + '\n\n';
    text += '重点词汇：\n' + (json.keyWords || []).map(w => {
      const note = w.note ? '（' + w.note + '）' : '';
      return (w.en || '') + ' — ' + (w.cn || '') + note;
    }).join('\n');
  }else{
    text += _lastRaw;
  }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); }
    else{
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast('已复制全文');
  }catch(e){ toast('复制失败，可手动选择文本'); }
}

function saveHist(sent, text){
  DATA.longSent = DATA.longSent || [];
  DATA.longSent.push({ id: uid(), sentence: sent, result: text, ts: Date.now() });
  hubSave();
}

function renderHistory(){
  DATA.longSent = DATA.longSent || [];
  const list = DATA.longSent.slice().reverse();
  $('#histCount').textContent = DATA.longSent.length;
  $('#histCard').style.display = DATA.longSent.length ? '' : 'none';
  const box = $('#histList');
  if(!list.length){ box.innerHTML = ''; return; }
  box.innerHTML = list.map(h => {
    const snip = h.sentence.length > 70 ? h.sentence.slice(0, 70) + '…' : h.sentence;
    const preview = firstSectionPreview(h.result);
    return `<div class="mod-card" style="padding:12px" data-id="${h.id}">
      <div style="font-weight:700;font-size:13px;line-height:1.4">${escapeHtml(snip)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">${escapeHtml(preview)}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm btn-ghost" data-restore="${h.id}" style="flex:1">查看</button>
        <button class="btn btn-sm btn-ghost" data-del="${h.id}" style="flex:none">删除</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); restoreHist(b.dataset.restore); }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteHist(b.dataset.del); }));
}

function firstSectionPreview(result){
  const json = aiJson(result);
  if(json && json.natural) return '同声传译：' + json.natural.slice(0, 60) + (json.natural.length > 60 ? '…' : '');
  const secs = parseSections(result);
  if(!secs.length) return '';
  const lines = secs[0].body.split('\n').filter(l => l.trim());
  const t = lines.slice(0, 2).join(' ').trim();
  return secs[0].title + '：' + (t.length > 60 ? t.slice(0, 60) + '…' : t);
}

function restoreHist(id){
  const h = (DATA.longSent || []).find(x => x.id === id); if(!h) return;
  _lastSentence = h.sentence; _lastRaw = h.result;
  $('#sentInput').value = h.sentence;
  const body = $('#resultBody');
  body.innerHTML = renderResult(h.sentence, h.result);
  bindWordHover(body);
  $('#origSent').textContent = h.sentence;
  $('#resultCard').style.display = '';
  $('#sentStatus').textContent = '已从记录恢复'; $('#sentStatus').className = 'word-status ok';
  $('#resultCard').scrollIntoView({ behavior:'smooth', block:'start' });
}

function deleteHist(id){
  DATA.longSent = (DATA.longSent || []).filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave(); renderHistory();
  toast('已删除该拆解');
}
