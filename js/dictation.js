// ===== 作文默写功能 =====
// 默写本 CRUD + 常错句热身 + 全文默写提交（DeepSeek 逐句比对）+ 错处记录
// 复用 common.js 全局：ready / $ / DATA / hubSave / uid / toast / escapeHtml / callRelay / aiJson / todayKey

var dictCurrent = null;      // 当前打开的默写本
var dictWeakMap = {};        // 当前源的「loc -> 历史出错次数」（提交前）
var dictWarmSentences = [];  // 热身句索引 -> 原句（避免 HTML 转义污染）
var dictSkipIdx = new Set(); // 本次默写用户勾选「跳过不判」的原文句编号（1-based）

// ---- 默写草稿自动保存（防移动端切走/刷新丢内容）----
// 草稿只存 localStorage（瞬态，不进云同步），按 sourceId 区分；页面被回收后回来仍能续。
var dictDraftTimer = null;
function dictDraftKey(id){ return 'ielts_dict_draft_' + id; }
function loadDictDraft(id){
  try{
    const raw = localStorage.getItem(dictDraftKey(id));
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || (!d.text && (!d.warms || !Object.keys(d.warms).length))) return null;
    return d;
  }catch(e){ return null; }
}
function collectDictDraft(){
  if(!dictCurrent) return null;
  const text = ($('#dictInput').value) || '';
  const warms = {};
  const wrap = $('#dictWarmup');
  if(wrap && !wrap.hidden){
    wrap.querySelectorAll('.dict-warm-input').forEach(ta => { warms[ta.dataset.i] = ta.value || ''; });
  }
  const hasText = text.trim().length > 0;
  const hasWarm = Object.keys(warms).some(k => (warms[k] || '').trim().length > 0);
  if(!hasText && !hasWarm) return null;
  return { text, warms, ts: Date.now() };
}
function saveDictDraft(){
  if(!dictCurrent) return;
  const d = collectDictDraft();
  if(!d){ clearDictDraft(dictCurrent.id); return; }
  try{ localStorage.setItem(dictDraftKey(dictCurrent.id), JSON.stringify(d)); }catch(e){}
}
function scheduleDictDraftSave(){
  if(dictDraftTimer) clearTimeout(dictDraftTimer);
  dictDraftTimer = setTimeout(saveDictDraft, 400);
}
function clearDictDraft(id){
  try{ localStorage.removeItem(dictDraftKey(id)); }catch(e){}
  hideDictDraftRestored();
}
function agoText(ts){
  const diff = Date.now() - (ts || 0);
  const m = Math.floor(diff / 60000);
  if(m < 1) return '刚刚';
  if(m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if(h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}
function showDictDraftRestored(ts){
  const note = $('#dictDraftNote');
  if(!note) return;
  note.hidden = false;
  const ago = $('#dictDraftNoteAgo'); if(ago) ago.textContent = agoText(ts);
}
function hideDictDraftRestored(){
  const note = $('#dictDraftNote'); if(note) note.hidden = true;
}
// 首页横幅：扫描是否有「上次没默完」的草稿，便于页面被回收后一键续
function refreshDictDraftBanner(){
  const banner = $('#dictDraftBanner');
  if(!banner) return;
  const sources = DATA.dictationSources || [];
  let best = null;
  for(const s of sources){
    const d = loadDictDraft(s.id);
    if(!d) continue;
    const hasText = d.text && d.text.trim().length > 0;
    const hasWarm = d.warms && Object.values(d.warms).some(v => v && v.trim().length > 0);
    if(hasText || hasWarm){ if(!best || d.ts > best.ts) best = { s, d }; }
  }
  if(!best){ banner.hidden = true; return; }
  banner.hidden = false;
  const t = $('#dictDraftBannerTitle'); if(t) t.textContent = best.s.title;
  const a = $('#dictDraftBannerAgo'); if(a) a.textContent = agoText(best.d.ts);
  const r = $('#dictDraftResume'); if(r) r.dataset.id = best.s.id;
  const x = $('#dictDraftDiscard'); if(x) x.dataset.id = best.s.id;
}

// ---- 视图切换 ----
function showDictHome(){ $('#dictHomeCard').hidden = false; $('#dictPracticeCard').hidden = true; $('#dictLogCard').hidden = true; }
function showDictPractice(){ $('#dictHomeCard').hidden = true; $('#dictPracticeCard').hidden = false; $('#dictLogCard').hidden = true; }
function showDictLogs(){ $('#dictHomeCard').hidden = true; $('#dictPracticeCard').hidden = true; $('#dictLogCard').hidden = false; }

// ---- 历史 weakMap（聚合所有该源 logs 的 weakThisTime）----
function computeWeak(sourceId){
  const map = {};
  (DATA.dictationLogs || []).forEach(l => {
    if(l.sourceId !== sourceId) return;
    (l.weakThisTime || []).forEach(x => { map[x.loc] = (map[x.loc] || 0) + 1; });
  });
  return map;
}

// ========== 默写本 CRUD ==========
function renderDictationSources(){
  const box = $('#dictSrcList');
  if(!box) return;
  refreshDictDraftBanner();
  const list = DATA.dictationSources || [];
  if(!list.length){
    box.innerHTML = '<div class="muted">还没有默写本。把要背的范文粘进上面的框，起个名，保存就能反复默写。</div>';
    return;
  }
  box.innerHTML = list.map(s => {
    const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === s.id);
    const times = logs.length;
    const mistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
    return '<div class="card" data-id="' + s.id + '">'
      + '<b>' + escapeHtml(s.title) + '</b>'
      + '<div class="muted" style="font-size:12.5px;margin:4px 0">已默 ' + times + ' 次 · 历史错 ' + mistakes + ' 处</div>'
      + '<div class="bank-actions" style="margin-top:6px">'
      +   '<button class="bank-toggle dict-practice" type="button" data-id="' + s.id + '">默写</button>'
      +   '<button class="bank-del dict-del-src" type="button" data-id="' + s.id + '">删除</button>'
      + '</div></div>';
  }).join('');
  box.querySelectorAll('.dict-practice').forEach(b => b.addEventListener('click', () => openDictSource(b.dataset.id)));
  box.querySelectorAll('.dict-del-src').forEach(b => b.addEventListener('click', () => delDictSource(b.dataset.id)));
}

function saveDictSource(){
  const title = $('#dictTitle').value.trim();
  const text = $('#dictSource').value.trim();
  if(!title || !text){ toast('请填标题和范文'); return; }
  DATA.dictationSources.push({ id: uid(), title, text, createdAt: Date.now() });
  hubSave();
  $('#dictTitle').value = '';
  $('#dictSource').value = '';
  renderDictationSources();
  toast('已存入默写本');
}

function delDictSource(id){
  const s = (DATA.dictationSources || []).find(x => x.id === id);
  if(!s) return;
  if(!confirm('删除《' + s.title + '》？相关的错处记录也会一并删除。')) return;
  DATA.dictationSources = DATA.dictationSources.filter(x => x.id !== id);
  DATA.dictationLogs = (DATA.dictationLogs || []).filter(l => l.sourceId !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  clearDictDraft(id);   // 连带清掉未完成的草稿 key
  hubSave();
  renderDictationSources();
  toast('已删除');
}

// ========== 进入默写 ==========
function openDictSource(id){
  const s = (DATA.dictationSources || []).find(x => x.id === id);
  if(!s) return;
  openVirtualSource(s);
}

// 虚拟源入口：接受已构造好的 source 对象（如模板内联默写 tpl_<id>），
// 不要求它在 DATA.dictationSources 里——复用全部练习/提交/记录逻辑，但删除逻辑不会污染真实默写本或模板。
function openVirtualSource(s){
  if(!s) return;
  dictCurrent = s;
  dictWeakMap = computeWeak(s.id);
  dictSkipIdx = new Set();   // 每次打开默写本重置跳过选择
  renderDictSkip(s);
  showDictPractice();
  $('#dictPTitle').textContent = s.title;
  $('#dictResult').hidden = true;
  $('#dictResult').innerHTML = '';
  $('#dictShowSrc').checked = false;
  $('#dictSrcView').hidden = true;
  $('#dictSrcView').textContent = s.text;

  // 开始前提示
  const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === s.id);
  const times = logs.length;
  const totalMistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
  let hint = '已默 ' + times + ' 次 · 历史错 ' + totalMistakes + ' 处';
  const weakArr = Object.entries(dictWeakMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if(weakArr.length){
    hint += ' · 常错：' + weakArr.map(([loc, c]) => '「第' + loc + '句」×' + c).join('、');
  }
  $('#dictPreHint').textContent = hint;

  // 草稿恢复：默到一半切走（移动端回消息/刷新）后回来，从 localStorage 续上
  const draft = loadDictDraft(s.id);
  const hasDraft = draft && ((draft.text && draft.text.trim().length) || (draft.warms && Object.keys(draft.warms).some(k => (draft.warms[k] || '').trim().length)));
  if(hasDraft){
    $('#dictInput').value = draft.text || '';
    const hasWarm = !!(draft.warms && Object.keys(draft.warms).length);
    $('#dictWarmupOn').checked = hasWarm ? true : $('#dictWarmupOn').checked;
    renderDictWarmup(s, dictWeakMap, hasWarm ? true : $('#dictWarmupOn').checked);
    if(hasWarm){
      Object.keys(draft.warms).forEach(i => {
        const ta = $('#dictWarmup').querySelector('.dict-warm-input[data-i="' + i + '"]');
        if(ta) ta.value = draft.warms[i];
      });
    }
    showDictDraftRestored(draft.ts);
  } else {
    $('#dictInput').value = '';
    renderDictWarmup(s, dictWeakMap, $('#dictWarmupOn').checked);
    hideDictDraftRestored();
  }
}

// ========== 常错句热身 ==========
function splitSentences(text){
  if(!text) return [];
  const out = [];
  text.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(p => {
    const segs = p.match(/[^.!?]+[.!?]*|\S+/g);
    if(segs){
      segs.forEach(s => { const t = s.trim(); if(t) out.push(t); });
    } else {
      const t = p.trim(); if(t) out.push(t);
    }
  });
  return out;
}

// 剥离「内联跳过标记」【略】…【/略】：用户在文本框里主动包住想跳过的整段/整句，提交前整体删掉（视作不存在）。
function stripSkipMarkers(text){
  if(!text) return '';
  // 成对移除；若只写了开头没写结尾，则把开头到文末一并删除（避免残留半截标记）
  return text
    .replace(/【略】[\s\S]*?【\/略】/g, '')
    .replace(/【略】[\s\S]*$/, '')
    .replace(/【\/略】/g, '');
}

// ========== 跳过句子勾选（容错核心）==========
function renderDictSkip(s){
  const box = $('#dictSkipBox');
  if(!box) return;
  const sents = splitSentences(s.text);
  if(!sents.length){ box.innerHTML = '<div class="muted">按句拆分失败，无法列出跳过项。</div>'; return; }
  box.innerHTML = sents.map((t, i) => {
    const n = i + 1;
    const preview = t.length > 16 ? t.slice(0, 16) + '…' : t;
    return '<label class="dict-skip-item" style="display:block;font-size:13px;margin:3px 0;cursor:pointer">'
      + '<input type="checkbox" class="dict-skip-chk" data-idx="' + n + '"> 第' + n + '句：' + escapeHtml(preview)
      + '</label>';
  }).join('');
  box.querySelectorAll('.dict-skip-chk').forEach(c => c.addEventListener('change', () => {
    const idx = Number(c.dataset.idx);
    if(c.checked) dictSkipIdx.add(idx); else dictSkipIdx.delete(idx);
  }));
}

function renderDictWarmup(s, weakMap, on){
  const box = $('#dictWarmup');
  if(!box) return;
  if(!on){
    box.hidden = true; box.innerHTML = ''; dictWarmSentences = [];
    return;
  }
  const sentences = splitSentences(s.text);
  dictWarmSentences = sentences;
  const weakArr = Object.entries(weakMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if(!weakArr.length){
    box.hidden = true; box.innerHTML = ''; dictWarmSentences = [];
    return;
  }
  box.hidden = false;
  box.innerHTML = '<h3 style="margin:8px 0 6px;font-size:15px">🔥 常错句热身（凭记忆重打这几句，提交看错在哪）</h3>'
    + weakArr.map(([loc, c], i) => {
        const idx = Number(loc) - 1;
        const sent = sentences[idx] || '';
        return '<div class="dict-warm-item" data-i="' + i + '" style="border:1px solid var(--line);border-radius:var(--radius);padding:10px;margin-bottom:8px">'
          + '<div class="form-row" style="align-items:center;gap:6px">'
          +   '<span class="muted" style="font-size:12.5px">第 ' + loc + ' 句（历史错 ' + c + ' 次）</span>'
          +   '<button class="ph-hint dict-peek" type="button" data-i="' + i + '">👁 看原句</button>'
          + '</div>'
          + '<div class="dict-peek-src muted" data-i="' + i + '" hidden style="font-size:13px;margin:4px 0;white-space:pre-wrap">' + escapeHtml(sent) + '</div>'
          + '<textarea class="dict-warm-input" data-i="' + i + '" placeholder="凭记忆打这句…" style="width:100%;min-height:60px;padding:8px;border:1px solid var(--line);border-radius:var(--radius);font:inherit;background:var(--bg);color:var(--ink);resize:vertical;box-sizing:border-box"></textarea>'
          + '<button class="btn dict-warm-submit" type="button" data-i="' + i + '" data-idx="' + idx + '" style="margin-top:6px">这句提交</button>'
          + '<div class="dict-warm-res" data-i="' + i + '"></div>'
          + '</div>';
      }).join('');
  box.querySelectorAll('.dict-peek').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.i;
    const src = box.querySelector('.dict-peek-src[data-i="' + i + '"]');
    if(src) src.hidden = !src.hidden;
  }));
  box.querySelectorAll('.dict-warm-submit').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.i;
    const ta = box.querySelector('.dict-warm-input[data-i="' + i + '"]');
    const res = box.querySelector('.dict-warm-res[data-i="' + i + '"]');
    if(!ta || !res) return;
    const userText = stripSkipMarkers(ta.value).trim();
    if(!userText){ toast('先打这句（或已标记跳过）'); return; }
    const idx = Number(b.dataset.idx);
    const correct = (idx >= 0 && dictWarmSentences[idx] != null) ? dictWarmSentences[idx] : '';
    if(!correct){ toast('未找到该句原文，请刷新页面重试'); return; }
    warmupCheck(correct, userText, res, b);
  }));
  // 草稿：暖身框内容实时存，切走不丢
  box.querySelectorAll('.dict-warm-input').forEach(ta => ta.addEventListener('input', scheduleDictDraftSave));
}

async function warmupCheck(correctText, userText, resEl, btn){
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }
  btn.disabled = true; btn.textContent = '核对中…';
  resEl.innerHTML = '<div class="ts-load">AI 核对这句…</div>';
  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原句」和「学生默写」，逐字比对，标出差异。
铁律：
1. 学生默写里的占位符 -- — ___ 【】 () 视为跳过未默，不判错。
2. 只标实质差异：漏写 / 错词 / 拼写 / 语法 / 语序。
3. 拼写错误 type 标"拼写"，在清单轻量附带，不要重点标红。
4. 连字符豁免：标准原句里带连字符的词（如 short-lived），学生默写若只是少了横杠写成 short lived、或连写成 shortlived、或换成空格，这属于语音输入常见现象，【不算错】（不判拼写、不判漏写、不判错词）。词义与单词组成一致即可视为正确；只有换成完全不同的词才判错。
4. 返回严格 JSON：{"mistakes":[{"loc":"1","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":""}]}，无错则 mistakes:[]。
只输出 JSON，无解释无围栏。` },
    { role:'user', content:
`标准原句：
${correctText}

学生默写：
${userText}` }
  ];
  try{
    const content = await callRelay('dictation_check', messages, 0.4);
    const r = aiJson(content);
    if(!r){
      resEl.innerHTML = '<div class="ts-load">AI 返回异常：' + escapeHtml(content.slice(0, 120)) + '</div>';
      return;
    }
    const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
    if(!ms.length){
      resEl.innerHTML = '<div class="ts-fix">✅ 这句没错，棒。</div>';
      return;
    }
    resEl.innerHTML = ms.map(m =>
      '<div class="ts-gram"><s>' + escapeHtml(m.wrong || '（漏写）') + '</s> → <b>' + escapeHtml(m.right || '') + '</b>'
      + '<br><span class="muted">[' + escapeHtml(m.type || '') + '] ' + (m.note ? escapeHtml(m.note) : '') + '</span></div>'
    ).join('');
  }catch(e){
    resEl.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '这句提交';
  }
}

// ========== 正式默写提交 ==========
async function submitDictation(){
  if(!dictCurrent) return;
  let userText = $('#dictInput').value.trim();
  if(!userText){ toast('先把整段默出来再提交'); return; }
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }

  // 容错：剥离用户用【略】…【/略】主动标记的跳过块（视作不存在，不判错）
  userText = stripSkipMarkers(userText).trim();

  const btn = $('#dictSubmit');
  btn.disabled = true; btn.textContent = '核对中…';
  const box = $('#dictResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在逐句比对你的默写，十几秒…</div>';

  // 提交前的历史 weakMap（用于标注"本次又错在历史常错点"）
  const weakBefore = computeWeak(dictCurrent.id);

  // 把原文按句编号（与跳过勾选/错处记录 loc 一致），并列出本次跳过的句编号
  const srcSentences = splitSentences(dictCurrent.text);
  const srcNumbered = srcSentences.map((t, i) => (i + 1) + '. ' + t).join('\n');
  const skippedArr = [...dictSkipIdx].sort((a, b) => a - b);
  const skippedText = skippedArr.length ? skippedArr.join('、') : '无';

  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原文（已按句编号）」和「学生默写」，逐句比对，识别差异。
铁律：
1. 学生默写里出现的占位符 -- — ___ 【】 () 等，视为"此处跳过未默"，绝不判为错误；只比对实际写出的文字与原文对应部分是否一致。
2. 学生默写中若某整句被【略】…【/略】包裹，表示该句用户主动跳过，已在上游删除，无需再判。
3. 严格沿用下方「标准原文」给出的句编号（如 "3"）作为 loc；无法归到某句用 "0"。
4. 用户本次选择跳过的原句编号（见下方「跳过清单」）：这些句子用户主动不练，无论学生是否写出、写出对错，都【绝不判为错误】，也不要因它们的存在/缺失而标红其它句子。请只比对未被跳过的句子。
5. 未被跳过的句子逐句定位差异，type 分：漏写 / 错词 / 拼写 / 语法 / 语序。
6. 拼写错误在 type 标"拼写"，在清单里附带即可，不要像语法错那样在正文重点标红。
7. 原文（标准原文）里出现的连续下划线 ____ 是模板骨架的"填空位"——用户选择整框留空不填，这【不算错误】，请勿因此判错或标红；只比对用户实际写出的文字与其它非填空部分的原文是否一致。
8. 连字符豁免：标准原文里带连字符的词（如 short-lived），学生默写若只是少了横杠写成 short lived、或连写成 shortlived、或换成空格，这属于语音输入常见现象，【不算错】（不判拼写、不判漏写、不判错词）。词义与单词组成一致即可视为正确；只有换成完全不同的词才判错。
9. 返回严格 JSON：
{"overall":"一句话总体反馈","mistakes":[{"loc":"3","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":"一句说明"}],"weakHistory":[{"loc":"3","times":历史出错次数}]}
weakHistory 里填你根据「历史常错统计」判断本次又错在历史常错点的（loc + 历史次数）；没有就为空数组。
only JSON，无解释无围栏。` },
    { role:'user', content:
`标准原文（句编号请沿用）：
${srcNumbered}

学生默写：
${userText}

跳过清单（这些原句编号用户主动跳过，不计分、不判错）：
${skippedText}

历史常错统计（loc -> 历史出错次数）：
${JSON.stringify(weakBefore)}` }
  ];

  try{
    const content = await callRelay('dictation_check', messages, 0.4);
    const r = aiJson(content);
    if(!r){
      box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      pushDictLog(dictCurrent, userText, dictCurrent.text, [], weakBefore, false, '');
      return;
    }
    const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
    // 双保险：即使 AI 仍把跳过句报了错，也在此过滤掉
    const filtered = ms.filter(m => !skippedArr.includes(Number(m.loc)));
    renderDictResult(r, userText, weakBefore, filtered);
    pushDictLog(dictCurrent, userText, dictCurrent.text, filtered, weakBefore, true, r.overall || '');
    clearDictDraft(dictCurrent.id);   // 提交成功即视为本次默写完成，清草稿
    toast('核对完成');
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '提交核对';
  }
}

// ========== 结果渲染 ==========
function renderDictResult(r, userText, weakBefore, ms){
  const box = $('#dictResult');
  ms = Array.isArray(ms) ? ms : [];
  let html = '';

  // 总体反馈
  html += '<div class="ts-fix" style="margin-bottom:10px">' + escapeHtml(r.overall || '') + '</div>';

  // 上半：用户默写 + 错处按句标红
  html += '<div class="ts-sec"><h4>你的默写（标红=有差异）</h4><div class="skeleton-box">';
  const userSentences = splitSentences(userText);
  if(ms.length){
    const byLoc = {};
    ms.forEach(m => { const k = String(m.loc); (byLoc[k] = byLoc[k] || []).push(m); });
    html += userSentences.map((sent, idx) => {
      const arr = byLoc[String(idx + 1)];
      if(arr && arr.length){
        return '<div style="margin-bottom:6px">' + escapeHtml(sent)
          + arr.map(m => '<div class="ts-gram"><s>' + escapeHtml(m.wrong || '（漏写）') + '</s> → <b>' + escapeHtml(m.right || '') + '</b> <span class="muted">[' + escapeHtml(m.type || '') + ']</span></div>').join('')
          + '</div>';
      }
      return '<div style="margin-bottom:6px">' + escapeHtml(sent) + '</div>';
    }).join('');
  } else {
    html += escapeHtml(userText);
  }
  html += '</div></div>';

  // 下半：错处清单
  html += '<div class="ts-sec"><h4>错处清单</h4>';
  if(ms.length){
    html += '<table style="width:100%;border-collapse:collapse;font-size:13.5px">'
      + '<thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px">句</th><th>你的写法</th><th>正确</th><th>类型</th><th>说明</th></tr></thead><tbody>';
    ms.forEach(m => {
      html += '<tr style="border-top:1px solid var(--line)">'
        + '<td style="padding:4px">' + escapeHtml(m.loc || '') + '</td>'
        + '<td><s style="color:var(--muted)">' + escapeHtml(m.wrong || '（漏写）') + '</s></td>'
        + '<td><b style="color:var(--primary-d)">' + escapeHtml(m.right || '') + '</b></td>'
        + '<td>' + escapeHtml(m.type || '') + '</td>'
        + '<td class="muted">' + escapeHtml(m.note || '') + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="muted">🎉 这次默写没有挑出实质差异，太强了。</div>';
  }
  html += '</div>';

  // 历史常错点
  const weakArr = Object.entries(weakBefore).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  const hitWeak = ms.filter(m => weakBefore[String(m.loc)]);
  if(weakArr.length || hitWeak.length){
    html += '<div class="ts-sec"><h4>⚠️ 历史常错点</h4>';
    if(hitWeak.length){
      html += '<div class="ts-gram">本次又错在历史常错点：' + hitWeak.map(m => '第' + escapeHtml(m.loc) + '句').join('、') + '，注意！</div>';
    }
    if(weakArr.length){
      html += weakArr.map(([loc, c]) => '<div class="ts-fix">第 ' + escapeHtml(loc) + ' 句：你累计错 ' + c + ' 次，是反复出错点。</div>').join('');
    }
    html += '</div>';
  }

  // 底部按钮
  html += '<div class="form-row" style="margin-top:10px;flex-wrap:wrap;gap:8px">'
    + '<button class="btn btn-primary" id="dictAgain">再默一次</button>'
    + '<button class="btn" id="dictBackToList2">返回列表</button>'
    + '<button class="btn" id="dictGotoLogs2">查看我的错处记录</button>'
    + '</div>';

  box.innerHTML = html;
  const again = box.querySelector('#dictAgain');
  if(again) again.addEventListener('click', () => openDictSource(dictCurrent.id));
  const back = box.querySelector('#dictBackToList2');
  if(back) back.addEventListener('click', () => { showDictHome(); renderDictationSources(); });
  const logs = box.querySelector('#dictGotoLogs2');
  if(logs) logs.addEventListener('click', () => { showDictLogs(); renderDictLogs(); });
}

// ========== 错处记录 ==========
function pushDictLog(s, userText, correctText, mistakes, weakBefore, parsed, overall){
  const weakThisTime = mistakes.map(m => ({ loc: String(m.loc || '0'), times: 1 }));
  DATA.dictationLogs.push({
    id: uid(),
    sourceId: s.id,
    sourceTitle: s.title,
    date: todayKey(),
    userText,
    correctText,
    mistakes,
    weakThisTime,
    parsed,
    overall: overall || ''
  });
  hubSave();
}

function renderDictLogs(){
  const box = $('#dictLogList');
  const detail = $('#dictLogDetail');
  if(!box) return;
  if(detail) detail.hidden = true;
  box.hidden = false;
  const logs = DATA.dictationLogs || [];
  if(!logs.length){
    box.innerHTML = '<div class="muted">还没有错处记录。去默写本默一次，错的地方会自动记下来。</div>';
    return;
  }
  const groups = {};
  logs.forEach(l => { (groups[l.sourceTitle] = groups[l.sourceTitle] || []).push(l); });
  let html = '';
  Object.keys(groups).forEach(title => {
    const items = groups[title].slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += '<div style="margin-bottom:16px"><h3 style="font-size:15px;margin:6px 0">' + escapeHtml(title) + '</h3>';
    html += items.map(l => {
      const n = Array.isArray(l.mistakes) ? l.mistakes.length : 0;
      return '<div class="card" data-id="' + l.id + '" style="margin-bottom:8px;padding:10px">'
        + '<div class="dict-log-row" data-id="' + l.id + '" style="display:flex;align-items:center;gap:10px;cursor:pointer">'
        +   '<div style="flex:1"><span class="muted" style="font-size:13px">' + escapeHtml(l.date || '') + '</span> · 错 <b>' + n + '</b> 处'
        +   (n ? ' <span class="muted" style="font-size:12px">（点击查看详情）</span>' : ' <span class="muted" style="font-size:12px">（点击查看）</span>') + '</div>'
        +   '<button class="bank-del dict-log-del" type="button" data-id="' + l.id + '">删除</button>'
        + '</div></div>';
    }).join('');
    html += '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.dict-log-row').forEach(r => r.addEventListener('click', () => openDictLogDetail(r.dataset.id)));
  box.querySelectorAll('.dict-log-del').forEach(b => b.addEventListener('click', () => delDictLog(b.dataset.id)));
}

// 点击某条记录 → 展开该篇每处错的「位置 + 写法 + 正确 + 类型 + 说明 + 原句/你的句上下文」
function openDictLogDetail(id){
  const l = (DATA.dictationLogs || []).find(x => x.id === id);
  const box = $('#dictLogDetail');
  const list = $('#dictLogList');
  if(!l || !box || !list) return;
  list.hidden = true; box.hidden = false;
  const ms = Array.isArray(l.mistakes) ? l.mistakes : [];
  const srcSents = splitSentences(l.correctText || '');
  const usrSents = splitSentences(l.userText || '');
  let html = '<div class="form-row" style="align-items:center;margin-bottom:6px">'
    + '<h3 style="margin:0;font-size:15px">' + escapeHtml(l.sourceTitle || '') + ' · ' + escapeHtml(l.date || '') + '</h3>'
    + '<button class="btn" id="dictLogDetailBack" style="margin-left:auto">返回列表</button></div>';
  if(l.overall){ html += '<div class="ts-fix" style="margin-bottom:8px">' + escapeHtml(l.overall) + '</div>'; }
  html += '<div class="muted" style="font-size:13px;margin:4px 0 10px">本篇共 <b>' + ms.length + '</b> 处差异</div>';
  if(ms.length){
    html += ms.map(m => {
      const loc = String(m.loc || '0');
      const si = Number(loc) - 1;
      const srcSent = si >= 0 && srcSents[si] != null ? srcSents[si] : '（无法定位原句）';
      // 上下文里「你写的句子」优先用 loc 索引取；若对不上（语音输入缺标点/缺句导致编号错位），
      // 就在用户全文中搜包含 m.wrong 的那一句；还找不到再用 m.wrong 或漏写提示兜底。
      let usrSent = '';
      if(si >= 0 && usrSents[si] != null){
        usrSent = usrSents[si];
      } else if(m.wrong){
        const wrong = String(m.wrong);
        const found = usrSents.find(s => s.toLowerCase().includes(wrong.toLowerCase()));
        if(found) usrSent = found;
        else usrSent = wrong;
      } else {
        usrSent = '（你这部位没写）';
      }
      return '<div class="card" style="margin-bottom:10px;padding:10px">'
        + '<div style="font-size:13.5px;margin-bottom:4px"><b>第 ' + escapeHtml(loc) + ' 句</b> · <span class="muted">' + escapeHtml(m.type || '') + '</span></div>'
        + '<div style="font-size:13.5px;margin:4px 0"><span class="muted">你的写法：</span><s>' + escapeHtml(m.wrong || '（漏写）') + '</s></div>'
        + '<div style="font-size:13.5px;margin:4px 0"><span style="color:var(--primary-d)">正确写法：</span><b>' + escapeHtml(m.right || '') + '</b></div>'
        + (m.note ? '<div class="muted" style="font-size:12.5px;margin:2px 0">' + escapeHtml(m.note) + '</div>' : '')
        + '<details style="margin-top:6px"><summary class="muted" style="font-size:12.5px;cursor:pointer">看这句上下文</summary>'
        + '<div class="muted" style="font-size:12.5px;white-space:pre-wrap;margin-top:4px;line-height:1.7">原文：' + escapeHtml(srcSent) + '\n你写：' + escapeHtml(usrSent) + '</div></details>'
        + '</div>';
    }).join('');
  } else {
    html += '<div class="muted">🎉 这篇没有记录到差异。</div>';
  }
  box.innerHTML = html;
  const back = box.querySelector('#dictLogDetailBack');
  if(back) back.addEventListener('click', () => { box.hidden = true; list.hidden = false; });
}

function delDictLog(id){
  if(!confirm('删除这条记录？')) return;
  DATA.dictationLogs = (DATA.dictationLogs || []).filter(l => l.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave();
  renderDictLogs();
}

function clearAllLogs(){
  if(!confirm('清空全部错处记录？此操作不可撤销。')) return;
  DATA.dictationLogs = [];
  hubSave();
  renderDictLogs();
  toast('已清空');
}

// ========== 事件绑定 ==========
ready(() => {
  const bind = (id, fn) => { const el = $('#' + id); if(el) el.addEventListener('click', fn); };
  bind('dictSaveSrc', saveDictSource);
  bind('dictViewLogs', () => { showDictLogs(); renderDictLogs(); });
  bind('dictLogBack', () => { showDictHome(); renderDictationSources(); });
  bind('dictBack', () => { showDictHome(); renderDictationSources(); });
  bind('dictSubmit', submitDictation);
  bind('dictClearAll', clearAllLogs);

  // 草稿：主默写框实时存，切走/刷新不丢
  const di = $('#dictInput');
  if(di) di.addEventListener('input', scheduleDictDraftSave);

  // 首页草稿横幅：继续 / 放弃
  bind('dictDraftResume', () => {
    const id = $('#dictDraftResume').dataset.id;
    if(id) openDictSource(id);
  });
  bind('dictDraftDiscard', () => {
    const id = $('#dictDraftDiscard').dataset.id;
    if(id){ clearDictDraft(id); refreshDictDraftBanner(); }
  });
  // 练习视图内「放弃重默」：清空当前草稿与输入框
  bind('dictDraftReload', () => {
    if(!dictCurrent) return;
    clearDictDraft(dictCurrent.id);
    $('#dictInput').value = '';
    const wrap = $('#dictWarmup');
    if(wrap) wrap.querySelectorAll('.dict-warm-input').forEach(ta => ta.value = '');
    toast('已清空，重新开始默写');
  });

  const showSrc = $('#dictShowSrc');
  if(showSrc) showSrc.addEventListener('change', e => { $('#dictSrcView').hidden = !e.target.checked; });

  const warmOn = $('#dictWarmupOn');
  if(warmOn) warmOn.addEventListener('change', () => {
    if(dictCurrent) renderDictWarmup(dictCurrent, dictWeakMap, warmOn.checked);
  });
});
