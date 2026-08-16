/* 长难句拆解：粘贴长难句 → GPT 结构化拆解（句子分析 / 考点词 / 同义替换）+ 历史保存 */
var SYS_LONG = `你是一位资深的雅思阅读老师，擅长把长难句讲得清晰易懂。用户会给你一个英文长难句，请做结构化拆解，必须包含以下三个一级标题（用 "## " 开头，文字严格如下）：

## 一、拆解步骤与方法
给出 3–5 步可操作的拆解步骤，像老师辅导一样，告诉读者如何一层层读懂这个长难句（先找什么、再拆什么、最后怎么整合意思）。语言通俗、具体。

## 二、句子主干与语法结构
先明确标出主句的主语、谓语、宾语（即主谓宾）；再说明整体语法结构：主句主干 + 从句（定从/状从/名从等）、分词/介词短语等修饰成分，用缩进或括号标出层级。

## 三、考点词与同义替换拓展
分两部分：
- 重点单词 / 短语 / 固定搭配：列出句中的考点词，每条格式「词条 — 常见含义；雅思/学术阅读中的考点用法（熟词僻义、同根词、搭配）」，至少 4–5 条。
- 同义替换：列出关键表达在雅思阅读与写作里可能的替换说法，每条格式「原表达 → 替换说法1；替换说法2」，至少 4 条，服务于阅读定位与写作迁移。

如果你觉得对读者还有帮助，可以追加更多 "## " 开头的一级标题（如「四、参考翻译」「五、背景知识」），内容同样要具体实用。不要输出多余的前言与结尾客套，直接从第一个 "## " 开始。`;

var _lastSentence = '';
var _lastRaw = '';

ready(() => {
  $('#analyzeBtn').addEventListener('click', analyze);
  $('#copyBtn').addEventListener('click', copyResult);
  renderHistory();
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
    const sections = parseSections(text);
    $('#resultBody').innerHTML = sections.map(s => `<div class="rs-sec"><h3>${escapeHtml(s.title)}</h3>${renderBody(s.body)}</div>`).join('');
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
  const text = '原句：\n' + _lastSentence + '\n\n' + _lastRaw;
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
  $('#resultBody').innerHTML = parseSections(h.result).map(s => `<div class="rs-sec"><h3>${escapeHtml(s.title)}</h3>${renderBody(s.body)}</div>`).join('');
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

