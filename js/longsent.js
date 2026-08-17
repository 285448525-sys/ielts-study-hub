/* 长难句拆解：粘贴长难句 → GPT 输出同声传译式 JSON（按语序逐词对照 + 自然译文 + 重点词一键收录） */
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

ready(() => {
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
  hubSave(); renderHistory();
  toast('已删除该拆解');
}
