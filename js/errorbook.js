/* 错题本（极简版）：一个大框粘 AI 讲解 → AI 结构化 → 自动归档 + 错因统计
   数据结构（kind:'ai'）：
   { id, date, kind:'ai', known, source,
     title, subject, qtype, trap, howto:[], wrongPoint, rule:[], words:[], raw }
   兼容老数据 kind:'question' / 'word'（只读渲染，不再提供录入表单）。 */

var EB_TRAPS = [
  'FALSE与NOT GIVEN混淆', '定位错段/定位丢失', '同义替换没认出', '原词陷阱(原词重现)',
  '比较级/绝对化词', '目的vs手段', '细节看漏(时态/数字/限定词)', '听力连读没听出',
  '听力答案抢跑/漏听', '拼写', '生词不认识', '时间不够/没做完', '粗心', '其他'
];

/* 截图识别（视觉模型）暂存区：压缩后的 base64 data URL 数组 */
var _captures = [];

var CAPTURE_SYS = `你是雅思错题诊断助手（视觉版），服务对象是一名冲总分 6.0 的中国考生（弱项：听力、口语；阅读速度慢，常把 FALSE 误判成 NOT GIVEN）。
用户会上传 1~N 张截图：可能是题干、原文段落、答案页，分开拍或拼一张都行。请直接从图中识别信息，整理成结构化诊断。全部用简体中文，务实、具体、能照着做，不要空话套话。

字段要求：
- title：一句话说清这是哪道题/什么题（含来源题号如「剑18 T2 P1 Q5 判断题」，图里没有就概括内容）。
- subject：只能是 阅读 / 听力 / 写作 / 口语 / 词汇 / 其他。
- qtype：题型，如 判断(TFNG)、填空、匹配、选择、Heading、简答、地图题、多选 等；判断不出写「其他」。
- questionText：题干原文（从图识别）。
- passageSnippet：对应的原文句子/段落（从图识别截取）。
- userAnswer：用户写错的答案（图可见时）。
- correctAnswer：正确答案。
- errorLocation：错在哪：第几题/哪句话/哪个词。
- wrongPoint：一句话直击错点，具体到「你把 X 当成了 Y」或「错在哪一步」。
- trap：错因，必须从这个列表里挑最贴切的一个（原样照抄）：${EB_TRAPS.join(' / ')}
- testPoint：考点：这道题考什么能力/知识点。
- structureAnalysis：题干与原文结构分析（定位词→原文对应→逻辑对比）。
- translation：原文/题干关键句翻译说明。
- longSentence：图里出现的长难句，每项 { sentence:原文, analysis:主干+修饰拆解 }，没有就空数组。
- howto：正确解法步骤，2-4 步，每步一句话、必须可执行。
- rule：可迁移判断规则 1-2 条，下次遇到同类怎么避免。
- words：图里出现的值得记的生词，每项格式「word 中文释义」，没有就空数组。

特别规则：
- 若涉及判断题，必须在 rule 里写清两步判断：原文有没有提到这个信息（没提 → NOT GIVEN）；提到了是否与题干矛盾（矛盾 → FALSE）。
- 图中信息不足时，就基于已有信息给最有价值的部分，绝不编造图里没有的内容。`;

var CAPTURE_SCHEMA = `{"title":"","subject":"","qtype":"","questionText":"","passageSnippet":"","userAnswer":"","correctAnswer":"","errorLocation":"","wrongPoint":"","trap":"","testPoint":"","structureAnalysis":"","translation":"","longSentence":[{"sentence":"","analysis":""}],"howto":["",""],"rule":["",""],"words":[""]}`;

ready(() => {
  $('#ebAnalyze').addEventListener('click', analyzeEntry);
  $('#ebRaw').addEventListener('click', saveRawEntry);
  $('#fTrap').addEventListener('change', render);
  // 截图识别入口
  $('#ebUpload').addEventListener('click', () => { const f = $('#ebImg'); if(f) f.click(); });
  $('#ebImg').addEventListener('change', onPickImages);
  $('#ebCapture').addEventListener('click', () => analyzeCapture());
  $('#ebCaptureRaw').addEventListener('click', saveCaptureRaw);
  render();
});

/* ---------- 录入 ---------- */
/* 返回值：true = 成功归档（调用方可安全删除旧记录）；false = 未归档，原数据必须保留 */
async function analyzeEntry(){
  const box = $('#ebInput');
  const text = box.value.trim();
  if(text.length < 15){ toast('内容太短，把 AI 的讲解整段粘进来'); return false; }
  if(!DATA.settings.relayToken){
    toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下；也可以先点「只存原文」');
    return false;
  }

  const btn = $('#ebAnalyze');
  const load = $('#ebLoading');
  btn.disabled = true; btn.textContent = 'AI 分析中…';
  load.hidden = false;
  load.textContent = '正在把这段讲解拆成「怎么做 / 错点 / 规避规则」，大概十几秒…';

  const messages = [
    { role:'system', content:
`你是雅思错题诊断助手，服务对象是一名冲总分 6.0 的中国考生（弱项：听力、口语；阅读速度慢，且常把 FALSE 误判成 NOT GIVEN）。
用户会粘贴一段关于某道错题的资料——可能是别的 AI 写的讲解，也可能是她自己零散的笔记，格式混乱、有多余的话都正常。
你的任务：把它整理成结构化诊断。全部用简体中文，务实、具体、能照着做，不要空话套话。

字段要求：
- title：一句话说清这是哪道题/什么题（含来源题号，如「剑18 T2 P1 Q5 判断题」，资料没写就概括内容）。
- subject：只能是 阅读 / 听力 / 写作 / 口语 / 词汇 / 其他。
- qtype：题型，如 判断(TFNG)、填空、匹配、选择、Heading、简答、地图题、多选 等；判断不出写「其他」。
- trap：错因，必须从这个列表里挑最贴切的一个（原样照抄）：${EB_TRAPS.join(' / ')}
- howto：正确解法步骤，2-4 步，每步一句话，必须可执行（例如「圈题干定位词 renewable → 回原文扫第3段首句 → 对比原文说的是 A 而题干说 B → 判 FALSE」）。
- wrongPoint：一句话直击错点，具体到「你把 X 当成了 Y」或「错在哪一步」。
- rule：可迁移的判断规则 1-2 条，下次遇到同类怎么避免。
- words：资料里出现的值得记的生词，每项格式「word 中文释义」，没有就空数组。

特别规则：
- 若涉及判断题，必须在 rule 里写清两步判断：原文有没有提到这个信息（没提 → NOT GIVEN）；提到了是否与题干矛盾（矛盾 → FALSE）。
- 资料信息不足时，就基于已有信息给最有价值的部分，绝不编造原文内容。

只输出 JSON，不要任何解释文字、不要 markdown 围栏：
{"title":"","subject":"","qtype":"","trap":"","howto":["",""],"wrongPoint":"","rule":[""],"words":[""]}` },
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
        subject: String(r.subject || '其他').trim(),
        qtype: String(r.qtype || '其他').trim(),
        trap: normTrap(r.trap),
        howto: toArr(r.howto),
        wrongPoint: String(r.wrongPoint || '').trim(),
        rule: toArr(r.rule),
        words: toArr(r.words)
      });
    } else {
      // AI 没按 JSON 回 → 原文照存，不丢东西
      Object.assign(entry, {
        title: '（AI 返回非标准格式，已存原文）', subject:'其他', qtype:'其他', trap:'其他',
        howto: [], wrongPoint: '', rule: [], words: [], raw: content
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
    btn.disabled = false; btn.textContent = '🤖 AI 分析并归档';
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
    subject:'其他', qtype:'其他', trap:'其他', howto:[], wrongPoint:'', rule:[], words:[]
  });
  hubSave();
  box.value = '';
  render();
  toast('已存原文，之后可点卡片「补 AI 分析」');
}

/* ---------- 截图识别（视觉模型） ---------- */
function onPickImages(e){
  const files = Array.from((e.target.files) || []);
  if(!files.length) return;
  (async () => {
    for(const f of files){
      try{ _captures.push(await compressImage(f)); }
      catch(err){ toast('有张图处理失败：' + err.message); }
    }
    e.target.value = '';   // 允许重复选同一张
    renderThumbs();
  })();
}

/* 用 canvas 把图压到 ≤1280px 宽、JPEG q0.8，控 token / localStorage 体积 */
function compressImage(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const MAXW = 1280;
        if(w > MAXW){ h = Math.round(h * MAXW / w); w = MAXW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function renderThumbs(){
  const box = $('#ebThumbs');
  if(!box) return;
  box.innerHTML = _captures.map((u, i) =>
    '<div class="eb-thumb"><img src="' + u + '" alt="截图' + (i+1) + '"/>' +
    '<button class="eb-thumb-x" data-thumb="' + i + '" title="删除">×</button></div>'
  ).join('');
  box.querySelectorAll('[data-thumb]').forEach(b => b.addEventListener('click', () => {
    _captures.splice(Number(b.dataset.thumb), 1);
    renderThumbs();
  }));
}

/* opts.images 可覆盖 _captures（用于「补视觉分析」重跑已存图片）；opts.id 指定替换的旧记录 */
async function analyzeCapture(opts){
  opts = opts || {};
  const imgs = opts.images || _captures;
  const replaceId = opts.id || null;
  const btn = opts.btn || $('#ebCapture');
  const load = $('#ebLoading');
  if(!imgs.length){ toast('先上传至少一张截图'); return; }
  if(!DATA.settings.visionToken){
    toast('还没填视觉模型 Key，去「设置 / AI 接口」填一下'); return;
  }
  if(btn) btn.disabled = true;
  if(load){ load.hidden = false; load.textContent = '视觉模型识别中（十几秒）…'; }
  try{
    const content = [
      ...imgs.map(u => ({ type:'image_url', image_url:{ url:u } })),
      { type:'text', text: CAPTURE_SYS + '\n\n只输出 JSON，不要任何解释文字、不要 markdown 围栏：\n' + CAPTURE_SCHEMA }
    ];
    const text = await callVisionRelay('errorbook_capture', [{ role:'user', content }], 0.3);
    const r = aiJson(text);
    const entry = {
      id: uid(), date: todayKey(), kind:'capture', known:false,
      images: imgs.slice(), source: (r && r.questionText) || ''
    };
    if(r){
      Object.assign(entry, {
        title: String(r.title || '').trim() || '（未命名错题）',
        subject: String(r.subject || '其他').trim(),
        qtype: String(r.qtype || '其他').trim(),
        trap: normTrap(r.trap),
        questionText: r.questionText || '',
        passageSnippet: r.passageSnippet || '',
        userAnswer: r.userAnswer || '',
        correctAnswer: r.correctAnswer || '',
        errorLocation: r.errorLocation || '',
        wrongPoint: String(r.wrongPoint || '').trim(),
        testPoint: r.testPoint || '',
        structureAnalysis: r.structureAnalysis || '',
        translation: r.translation || '',
        longSentence: toArrObj(r.longSentence),
        howto: toArr(r.howto),
        rule: toArr(r.rule),
        words: toArr(r.words),
        raw: null
      });
    } else {
      // AI 没按 JSON 回 → 原文照存，不丢东西
      Object.assign(entry, {
        title: '（AI 返回非标准格式，已存原文）', subject:'其他', qtype:'其他', trap:'其他',
        howto: [], wrongPoint: '', rule: [], words: [], raw: text
      });
    }
    if(replaceId){
      const i = DATA.errorbook.findIndex(x => x.id === replaceId);
      if(i >= 0) DATA.errorbook[i] = entry; else DATA.errorbook.unshift(entry);
    } else {
      DATA.errorbook.unshift(entry);
    }
    _captures = []; renderThumbs();
    hubSave(); if(load) load.hidden = true; render();
    toast(r ? '已识别并归档' : 'AI 格式异常，已存原文');
    const first = document.querySelector('#list .eb-card');
    if(first) first.scrollIntoView({ behavior:'smooth', block:'center' });
  }catch(e){
    if(load) load.textContent = '视觉识别失败：' + e.message + '（缩略图还在，可重试）';
  }finally{
    if(btn) btn.disabled = false;
  }
}

/* 不走 AI，先把截图存下来（之后可点「补视觉分析」重跑） */
function saveCaptureRaw(){
  if(!_captures.length){ toast('先上传至少一张截图'); return; }
  DATA.errorbook.unshift({
    id: uid(), date: todayKey(), kind:'capture', known:false,
    images: _captures.slice(), source: '',
    title: '（仅存截图，未分析）', subject:'其他', qtype:'其他', trap:'其他',
    howto: [], wrongPoint: '', rule: [], words: [], raw: null
  });
  _captures = []; renderThumbs();
  hubSave(); render();
  toast('已存截图（未分析），可点卡片「补视觉分析」');
}

function toArrObj(v){
  if(Array.isArray(v)) return v.map(o => ({
    sentence: String((o && o.sentence) || '').trim(),
    analysis: String((o && o.analysis) || '').trim()
  })).filter(x => x.sentence);
  return [];
}

/* 对已存截图记录重跑视觉分析（复用已存图片，成功后原地替换旧记录） */
function redoCapture(id, btn){
  const e = DATA.errorbook.find(x => x.id === id);
  if(!e || !e.images || !e.images.length){ toast('这条没有截图，无法分析'); return; }
  analyzeCapture({ images: e.images.slice(), id: e.id, btn: btn });
}

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
    hubSave();
    render();
  } else {
    // 失败：旧记录原样保留。提示写在 #ebLoading（不用 toast，免得盖掉上面「没填 Key」之类的具体原因）
    const load = $('#ebLoading');
    if(load){
      const prev = load.hidden ? '' : (load.textContent + '　');
      load.hidden = false;
      load.textContent = prev + '⚠️ 没分析成功，这条记录仍在下面列表里、原文没丢。原文已放进上面输入框，可以改完再点「AI 分析并归档」（成功后记得删掉旧的那条）。';
    }
  }
}

function normTrap(t){
  const s = String(t || '').trim();
  if(EB_TRAPS.includes(s)) return s;
  const hit = EB_TRAPS.find(x => s && (x.includes(s) || s.includes(x.slice(0,4))));
  return hit || '其他';
}
function toArr(v){
  if(Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if(v == null || v === '') return [];
  return [String(v).trim()];
}

/* ---------- 渲染 ---------- */
function render(){
  const traps = [...new Set(DATA.errorbook.map(e => e.trap).filter(Boolean))];
  const sel = $('#fTrap');
  const keep = sel.value;
  sel.innerHTML = '<option value="">全部错因</option>' +
    traps.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  sel.value = traps.includes(keep) ? keep : '';

  const ft = sel.value;
  const list = DATA.errorbook
    .filter(e => !ft || e.trap === ft)
    .slice()
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  $('#count').textContent = list.length;
  const box = $('#list');
  $('#empty').hidden = DATA.errorbook.length > 0;
  box.innerHTML = list.map(cardHtml).join('');

  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if(confirm('确定删除这条记录？')){
      DATA.errorbook = DATA.errorbook.filter(x => x.id !== b.dataset.del);
      hubSave(); render();
    }
  }));
  box.querySelectorAll('[data-known]').forEach(b => b.addEventListener('click', () => {
    const e = DATA.errorbook.find(x => x.id === b.dataset.known);
    if(e){ e.known = !e.known; hubSave(); render(); }
  }));
  box.querySelectorAll('[data-redo]').forEach(b => b.addEventListener('click', () => reanalyze(b.dataset.redo)));
  box.querySelectorAll('[data-redocap]').forEach(b => b.addEventListener('click', () => redoCapture(b.dataset.redocap, b)));

  renderStats();
}

function cardHtml(e){
  if(e.kind === 'word')     return oldWordCard(e);
  if(e.kind === 'question') return oldQuestionCard(e);
  if(e.kind === 'capture')  return captureCard(e);

  const badges = [
    e.subject && e.subject !== '其他' ? `<span class="badge">${escapeHtml(e.subject)}</span>` : '',
    e.qtype  && e.qtype  !== '其他' ? `<span class="badge">${escapeHtml(e.qtype)}</span>` : '',
    e.trap   && e.trap   !== '其他' ? `<span class="badge badge-trap">${escapeHtml(e.trap)}</span>` : '',
    e.known ? '<span class="badge badge-ok">已掌握</span>' : ''
  ].join('');

  const howto = (e.howto && e.howto.length)
    ? `<div class="eb-block"><h4>这道题怎么做</h4><ol>${e.howto.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol></div>` : '';
  const wrong = e.wrongPoint
    ? `<div class="eb-block"><h4>错点在哪</h4><div class="eb-wrong">${escapeHtml(e.wrongPoint)}</div></div>` : '';
  const rule = (e.rule && e.rule.length)
    ? `<div class="eb-block"><h4>下次怎么避免</h4><div class="eb-rule">${e.rule.map(escapeHtml).join('<br>')}</div></div>` : '';
  const words = (e.words && e.words.length)
    ? `<div class="eb-block"><h4>顺手记的词</h4><div class="eb-words">${e.words.map(w => `<span class="eb-chip">${escapeHtml(w)}</span>`).join('')}</div></div>` : '';
  const raw = e.raw
    ? `<div class="eb-block"><h4>AI 原始回复</h4><p style="white-space:pre-wrap">${escapeHtml(e.raw)}</p></div>` : '';
  const src = e.source
    ? `<details class="eb-src"><summary>看我粘进来的原始资料</summary><pre>${escapeHtml(e.source)}</pre></details>` : '';
  const needRedo = !e.howto || !e.howto.length;

  return `<div class="eb-card">
    <div class="eb-head">${badges}<span class="muted" style="margin-left:auto;font-size:12.5px">${escapeHtml(e.date||'')}</span></div>
    <div class="eb-title">${escapeHtml(e.title || '（未命名错题）')}</div>
    ${howto}${wrong}${rule}${words}${raw}${src}
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
  const needRedo = !e.howto || !e.howto.length;

  return '<div class="eb-card">' +
    '<div class="eb-head">' + badges + '<span class="muted" style="margin-left:auto;font-size:12.5px">' + escapeHtml(e.date || '') + '</span></div>' +
    (imgs ? '<div class="eb-thumbs">' + imgs + '</div>' : '') +
    '<div class="eb-title">' + escapeHtml(e.title || '（未命名错题）') + '</div>' +
    howto + fields.join('') + rule + words + raw +
    '<div class="eb-actions">' +
      (needRedo ? '<button class="btn btn-sm btn-primary" data-redocap="' + e.id + '">🤖 补视觉分析</button>' : '') +
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

function renderStats(){
  const withTrap = DATA.errorbook.filter(e => e.trap && e.trap !== '其他');
  const card = $('#statsCard');
  if(withTrap.length < 2){ card.hidden = true; return; }
  card.hidden = false;
  const byTrap = {};
  withTrap.forEach(e => { byTrap[e.trap] = (byTrap[e.trap]||0) + 1; });
  const max = Math.max.apply(null, Object.values(byTrap));
  const rows = Object.entries(byTrap).sort((a,b) => b[1]-a[1]).map(([t,n]) => {
    const pct = Math.round(n / max * 100);
    return `<div class="stat-row"><span class="stat-label">${escapeHtml(t)}</span><div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div><span class="stat-num">${n}</span></div>`;
  }).join('');
  $('#statsBox').innerHTML = rows;
}
