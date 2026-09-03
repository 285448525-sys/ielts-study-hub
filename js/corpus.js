var dict = null; // {queue, idx, cfg, wrongList, total, correct, revealed}

// ---- 语料库表格默写草稿（瞬态 localStorage，切走/刷新可续；不进云同步）----
var corDraftTimer = null;
function corDraftKey(){ return 'ielts_cor_dict_draft'; }
function loadCorDraft(){
  try{
    const raw = localStorage.getItem(corDraftKey());
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || (!d.checked && !d.inputs && !d.result)) return null;
    return d;
  }catch(e){ return null; }
}
function collectCorDraft(){
  const q = window.__writeQueue;
  if(!q) return null;
  const checked = (window.__writeChecked || []).slice();
  const inputs = {};
  document.querySelectorAll('#dictArea .write-row').forEach(row => {
    const id = row.dataset.id;
    const inp = row.querySelector('.write-en');
    if(inp && inp.value.trim()) inputs[id] = inp.value;
  });
  const resultHtml = $('#writeResult').innerHTML || '';
  if(!checked.length && !Object.keys(inputs).length && !resultHtml) return null;
  return { checked, inputs, result: resultHtml, ts: Date.now() };
}
function saveCorDraft(){
  const d = collectCorDraft();
  if(!d){ try{ localStorage.removeItem(corDraftKey()); }catch(e){} return; }
  try{ localStorage.setItem(corDraftKey(), JSON.stringify(d)); }catch(e){}
}
function scheduleCorDraftSave(){
  if(corDraftTimer) clearTimeout(corDraftTimer);
  corDraftTimer = setTimeout(saveCorDraft, 400);
}
function clearCorDraft(){
  try{ localStorage.removeItem(corDraftKey()); }catch(e){}
  const note = $('#corDraftNote'); if(note) note.hidden = true;
}
function corAgoText(ts){
  const diff = Date.now() - (ts || 0);
  const m = Math.floor(diff / 60000);
  if(m < 1) return '刚刚';
  if(m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if(h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}

let corpusSearch = '';
ready(() => {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); };
  const cs = document.getElementById('corpusSearch');
  if(cs) cs.addEventListener('input', () => { corpusSearch = cs.value.trim().toLowerCase(); renderList(); });
  on('importCorpus', 'click', importBulk);
  on('aiImportBtn', 'click', aiImportCorpus);
  on('addCorpus', 'click', addOne);
  on('startDict', 'click', startDict);   // 听力默写入口：HTML 尚未提供按钮时安全跳过（避免整段脚本崩溃）
  on('startWrite', 'click', startWrite);
  // 设置联动：设置实时保存到 localStorage（对应滑块缺失则跳过，用默认配置，避免整段脚本崩溃）
  const sRate = document.getElementById('sRate');
  if(sRate){
    const loadCfg = () => Object.assign({ rate:.9, repeat:3, intervalMs:2200, showCn:false, batchSize:10 }, DATA.settings.corpusCfg || {});
    const saveCfg = () => {
      DATA.settings.corpusCfg = {
        rate: parseFloat(sRate.value),
        repeat: parseInt(document.getElementById('sRepeat').value,10),
        intervalMs: parseInt(document.getElementById('sInterval').value,10),
        showCn: document.getElementById('sShowCn').checked,
        batchSize: parseInt(document.getElementById('sBatch').value,10)
      };
      hubSave();
    };
    // 滑块拖动时 input 事件高频触发，整份 DATA 序列化写盘会卡；防抖 300ms，停手才落库
    let _saveTimer = null;
    const scheduleSaveCfg = () => { if(_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(saveCfg, 300); };
    const cfg = loadCfg();
    sRate.value = cfg.rate; document.getElementById('sRateTxt').textContent = cfg.rate.toFixed(2)+'x';
    document.getElementById('sRepeat').value = cfg.repeat; document.getElementById('sRepeatTxt').textContent = cfg.repeat+' 次';
    document.getElementById('sInterval').value = String(cfg.intervalMs);
    document.getElementById('sShowCn').checked = !!cfg.showCn;
    document.getElementById('sBatch').value = String(cfg.batchSize);
    sRate.addEventListener('input', () => { document.getElementById('sRateTxt').textContent = parseFloat(sRate.value).toFixed(2)+'x'; scheduleSaveCfg(); });
    document.getElementById('sRepeat').addEventListener('input', () => { document.getElementById('sRepeatTxt').textContent = parseInt(document.getElementById('sRepeat').value,10)+' 次'; scheduleSaveCfg(); });
    document.getElementById('sInterval').addEventListener('change', saveCfg);
    document.getElementById('sShowCn').addEventListener('change', saveCfg);
    document.getElementById('sBatch').addEventListener('change', saveCfg);
  }
  renderList();
});

function addOne(){
  const en = $('#corEn').value.trim(), cn = $('#corCn').value.trim();
  if(!en){ toast('先填英文句子'); return; }
  DATA.corpus.push({ id: uid(), en, cn });
  hubSave();
  $('#corEn').value = ''; $('#corCn').value = '';
  renderList(); toast('已添加');
}

function importBulk(){
  const raw = $('#bulkCorpus').value.trim(); if(!raw){ toast('粘贴内容后再导入'); return; }
  let added = 0, skipped = 0;
  const existing = new Set(DATA.corpus.map(c => c.en.toLowerCase()));
  raw.split(/\n/).forEach(line => {
    line = line.trim(); if(!line) return;
    let en = '', cn = '';
    const cjk = line.search(/[一-鿿]/);
    if(cjk >= 0){
      en = line.slice(0, cjk).replace(/[\s|/：:：\-—()]+$/, '').trim();
      cn = line.slice(cjk).replace(/^[\s|/：:：\-—()]+/, '').trim();
    } else {
      en = line;
    }
    if(!en) return;
    const key = en.toLowerCase();
    if(existing.has(key)){ skipped++; return; }
    existing.add(key);
    DATA.corpus.push({ id: uid(), en, cn });
    added++;
  });
  if(added){ hubSave(); $('#bulkCorpus').value = ''; renderList(); }
  let msg = added ? ('导入 ' + added + ' 句') : '没有识别到有效句子';
  if(skipped) msg += '，跳过重复 ' + skipped + ' 句';
  toast(msg); $('#importHint').textContent = msg;
}

function deleteCorpus(id){
  DATA.corpus = DATA.corpus.filter(c => c.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave(); renderList();
}

// AI 智能导入：粘贴短语/词/句子（可纯英文），AI 自动切分每条并匹配中文释义，批量加入语料表
async function aiImportCorpus(){
  const box = $('#aiImportBox');
  const raw = (box && box.value || '').trim();
  if(!raw){ toast('先粘贴要导入的内容'); return; }
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }
  const btn = $('#aiImportBtn');
  const hint = $('#aiImportHint');
  btn.disabled = true; btn.textContent = 'AI 识别中…';
  if(hint) hint.textContent = '正在切分并匹配中文…';
  try{
    const messages = [
      { role:'system', content:
`你是雅思语料整理助手。用户输入一段要记忆的内容（可能是短语、单词、句子，可纯英文、可夹中文、可多行混合）。
请：1) 按语义切分成独立的「条目」（一个短语/词/句子=一条，不要把整段当一个条目）；2) 为每条给出准确的中文释义。
规则：若原文本已含中文释义，直接采用；若纯英文，根据雅思语境补贴切中文。条目原文保留英文原样（含标点）。
返回严格 JSON：{"items":[{"en":"英文原句/词","cn":"中文释义"}]}，只输出 JSON，无解释无围栏。` },
      { role:'user', content: raw }
    ];
    const content = await callRelay('translate', messages, 0.3);
    const r = aiJson(content);
    const items = (r && Array.isArray(r.items)) ? r.items : [];
    if(!items.length){ toast('AI 没识别出条目，换个格式再试'); if(hint) hint.textContent = '未识别到条目'; return; }
    const existing = new Set(DATA.corpus.map(c => c.en.toLowerCase()));
    let added = 0, skipped = 0;
    items.forEach(it => {
      const en = (it.en || '').trim();
      const cn = (it.cn || '').trim();
      if(!en) return;
      const key = en.toLowerCase();
      if(existing.has(key)){ skipped++; return; }
      existing.add(key);
      DATA.corpus.push({ id: uid(), en, cn });
      added++;
    });
    if(added){ hubSave(); renderList(); }
    let msg = added ? ('AI 导入 ' + added + ' 条') : '没有新增（可能都重复）';
    if(skipped) msg += '，跳过重复 ' + skipped + ' 条';
    toast(msg);
    if(hint) hint.textContent = msg;
    if(box) box.value = '';
  }catch(e){
    toast('AI 导入失败：' + e.message);
    if(hint) hint.textContent = '失败：' + e.message;
  }finally{
    btn.disabled = false; btn.textContent = 'AI 识别并导入';
  }
}

function renderList(){
  let arr = DATA.corpus;
  if(corpusSearch){ arr = arr.filter(c => ((c.en||'')+' '+(c.cn||'')).toLowerCase().indexOf(corpusSearch) !== -1); }
  $('#corpusCount').textContent = arr.length;
  const box = $('#corpusList');
  if(arr.length === 0){ box.innerHTML = renderEmpty(corpusSearch ? '没有匹配“'+escapeHtml(corpusSearch)+'”的句子。' : '还没有句子，上面导几句吧。'); return; }
  const rows = arr.slice().reverse().map((c, i) => `
    <tr>
      <td class="cor-idx">${i + 1}</td>
      <td class="cor-cell cor-cn">${c.cn ? escapeHtml(c.cn) : '<span class="muted">（无中文）</span>'}</td>
      <td class="cor-cell cor-en">${escapeHtml(c.en)}</td>
    </tr>`).join('');
  box.innerHTML = `
    <table class="corpus-table">
      <thead><tr><th class="cor-idx">#</th><th>中文</th><th>英文</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ========== 听写 ==========
function startDict(){
  if(DATA.corpus.length === 0){ toast('语料库是空的，先导入句子'); return; }
  const cfg = Object.assign({ rate:.9, repeat:3, intervalMs:2200, showCn:false, batchSize:10 }, DATA.settings.corpusCfg || {});
  let q = shuffle(DATA.corpus.slice());
  const bs = cfg.batchSize;
  if(bs > 0 && bs < q.length) q = q.slice(0, bs);
  dict = { queue: q, idx: 0, cfg, wrongList: [], total: 0, correct: 0, revealed: false };
  renderDictItem();
}

function renderDictItem(){
  if(!dict) return;
  if(dict.idx >= dict.queue.length){ return finishDict(); }
  const item = dict.queue[dict.idx];
  dict.revealed = false;
  const cfg = dict.cfg;
  $('#dictArea').innerHTML = `
    <div class="dict-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="score-badge">第 ${dict.idx+1} / ${dict.queue.length} 句</div>
        <div style="display:flex;gap:10px;align-items:center">
          <label style="font-size:12px;color:var(--muted)">
            <input type="checkbox" id="hintToggle" ${cfg.showCn?'checked':''}/> 中文提示
          </label>
        </div>
      </div>
      <div class="dict-head" style="margin-top:4px">
        <button class="btn" id="replayBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>播放</button>
        <div class="dict-meta">
          <div class="dict-voice"><label>语速</label>
            <input type="range" id="rRate" min="0.5" max="1.2" step="0.05" value="${cfg.rate}"/>
            <span id="rRateTxt">${cfg.rate.toFixed(2)}x</span></div>
          <div class="dict-voice"><label>次数</label>
            <input type="range" id="rRepeat" min="1" max="5" step="1" value="${cfg.repeat}"/>
            <span id="rRepeatTxt">${cfg.repeat} 次</span></div>
          <div class="dict-voice"><label>间隔</label>
            <select id="rInterval">
              <option value="1600">1.6s</option><option value="2200">2.2s</option>
              <option value="3000">3.0s</option><option value="4200">4.2s</option>
            </select></div>
        </div>
      </div>
      <div id="cnHint" style="text-align:center;color:var(--muted);margin:8px 0 6px;min-height:20px;font-size:14px">${cfg.showCn && item.cn ? '中文：'+escapeHtml(cfg.showCn?item.cn:'') : ''}</div>
      <textarea id="dictInput" class="q-input" style="width:100%;max-width:none;height:86px;font-size:16px;line-height:1.6" placeholder="把听到的整句写下来，写完按 Enter（或 Ctrl+Enter 换行）提交核对…" spellcheck="false"></textarea>
      <div class="dict-actions">
        <button class="btn" id="skipBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>跳过 / 看答案</button>
        <button class="btn btn-primary" id="checkBtn">确认核对</button>
      </div>
      <div id="dictResult" style="margin-top:14px"></div>
    </div>`;
  // 运行时设置
  $('#rInterval').value = String(cfg.intervalMs);
  $('#rRate').addEventListener('input', () => {
    $('#rRateTxt').textContent = parseFloat($('#rRate').value).toFixed(2)+'x';
    dict.cfg.rate = parseFloat($('#rRate').value); DATA.settings.corpusCfg = dict.cfg; hubSave();
  });
  $('#rRepeat').addEventListener('input', () => {
    $('#rRepeatTxt').textContent = parseInt($('#rRepeat').value,10)+' 次';
    dict.cfg.repeat = parseInt($('#rRepeat').value,10); DATA.settings.corpusCfg = dict.cfg; hubSave();
  });
  $('#rInterval').addEventListener('change', () => {
    dict.cfg.intervalMs = parseInt($('#rInterval').value,10); DATA.settings.corpusCfg = dict.cfg; hubSave();
  });
  $('#hintToggle').addEventListener('change', () => {
    const on = $('#hintToggle').checked; dict.cfg.showCn = on; DATA.settings.corpusCfg = dict.cfg; hubSave();
    $('#cnHint').textContent = on && item.cn ? '中文：'+item.cn : '';
  });
  // 交互
  $('#replayBtn').addEventListener('click', () => playSentence(item.en));
  $('#skipBtn').addEventListener('click', () => checkSent(item, '', true));
  $('#checkBtn').addEventListener('click', () => { const v = ($('#dictInput').value||'').trim(); checkSent(item, v, !v); });
  $('#dictInput').addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.ctrlKey && !e.shiftKey){
      e.preventDefault();
      const v = ($('#dictInput').value||'').trim(); checkSent(item, v, !v);
    }
  });
  setTimeout(() => { $('#dictInput').focus(); playSentence(item.en); }, 150);
}

function playSentence(text){
  try{
    const cfg = dict.cfg;
    window.speechSynthesis.cancel();
    let n = 0;
    const run = () => {
      if(n++ >= cfg.repeat) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = cfg.rate;
      window.speechSynthesis.speak(u);
      setTimeout(run, cfg.intervalMs);
    };
    run();
  }catch(e){}
}

function checkSent(item, userVal, skipped){
  if(dict.revealed) return; dict.revealed = true; dict.total++;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const ref = norm(item.en), usr = norm(userVal);
  const usrSet = new Set(usr);
  let matched = 0; const missed = [];
  ref.forEach(w => { if(usrSet.has(w)) matched++; else missed.push(w); });
  const acc = ref.length ? Math.round(matched / ref.length * 100) : 0;
  const ok = acc === 100;
  if(ok) dict.correct++;
  else dict.wrongList.push({ id:item.id, en:item.en, cn:item.cn||'', user:userVal, skipped, matched, missed, acc });

  // 颜色标注用户输入 vs 原句
  const usrHtml = usr.map(w => ref.includes(w.toLowerCase())
    ? `<span class="w correct">${escapeHtml(w)}</span>`
    : `<span class="w wrong">${escapeHtml(w)}</span>`).join(' ');
  const refHtml = ref.map(w => usr.includes(w.toLowerCase())
    ? `<span class="w ref">${escapeHtml(w)}</span>`
    : `<span class="w miss">${escapeHtml(w)}</span>`).join(' ');

  const color = acc >= 80 ? 'var(--med)' : (acc >= 50 ? 'var(--warn)' : 'var(--danger)');
  $('#dictResult').innerHTML = `
    <div class="dict-result-card ${ok?'ok':'bad'}">
      <div class="bar-row"><div class="bar-info"><span>准确率</span><span style="color:${color};font-weight:700">${acc}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${acc}%;background:${color}"></div></div></div>
      <div style="margin-top:12px">
        <div class="muted" style="font-size:12px;margin-bottom:4px">你写的（标绿=写对，标红=写错）：</div>
        <div class="sent-row">${skipped?'<span class="muted">（未作答）</span>':usrHtml}</div>
        <div class="muted" style="font-size:12px;margin:12px 0 4px">原句（标红=你漏掉的词，共漏 ${missed.length} 个）：</div>
        <div class="sent-row">${refHtml}</div>
        ${item.cn ? `<div class="muted" style="margin-top:10px;font-size:13px">中文：${escapeHtml(item.cn)}</div>` : ''}
        ${missed.length ? `<div style="margin-top:10px"><span class="muted" style="font-size:12px">漏掉 / 写错的词：</span> ${missed.map(w=>`<span class="badge down">${escapeHtml(w)}</span>`).join(' ')}</div>` : ''}
      </div>
      <div class="dict-result-actions">
        <button class="btn" id="playAgainBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>再听一遍</button>
        <button class="btn btn-primary" id="nextBtn">下一句 →</button>
      </div>
    </div>`;
  $('#playAgainBtn').addEventListener('click', () => playSentence(item.en));
  $('#nextBtn').addEventListener('click', () => { dict.idx++; renderDictItem(); });
}

/* ========== 表格默写（看中文写英文） ==========
   点「表格默写」后：原语料表进入默写模式——英文列隐藏，改为每行一个输入框（中文列作提示），
   提交后调用 AI 逐行批改，批改结果以颜色标注回写英文列。 */
function startWrite(){
  if(DATA.corpus.length === 0){ toast('语料库是空的，先导入句子'); return; }
  // 草稿恢复：上次没默完，直接进默写视图还原
  const draft = loadCorDraft();
  if(draft && draft.checked && draft.checked.length){
    const q = DATA.corpus.filter(c => draft.checked.indexOf(c.id) >= 0);
    window.__writeQueue = q;
    window.__writeChecked = draft.checked.slice();
    renderWrite(q);
    // 还原输入 + 结果 + 提示条
    if(draft.inputs){
      document.querySelectorAll('#dictArea .write-row').forEach(row => {
        const id = row.dataset.id; const inp = row.querySelector('.write-en');
        if(inp && draft.inputs[id] != null) inp.value = draft.inputs[id];
      });
    }
    if(draft.result){ $('#writeResult').innerHTML = draft.result; }
    const note = $('#corDraftNote');
    if(note){ note.hidden = false; const ago = $('#corDraftNoteAgo'); if(ago) ago.textContent = corAgoText(draft.ts); }
    return;
  }
  renderWritePick();
}

// 选句步骤：列出全部语料，用户勾选要默写的句子，确认后进入表格默写
function renderWritePick(){
  const all = DATA.corpus.slice().reverse();
  const rows = all.map((c, i) => `
    <tr class="pick-row" data-id="${c.id}">
      <td class="cor-idx"><input type="checkbox" class="cor-pick-chk" data-id="${c.id}" checked></td>
      <td class="cor-cell cor-cn">${c.cn ? escapeHtml(c.cn) : '<span class="muted">（无中文）</span>'}</td>
      <td class="cor-cell cor-en">${escapeHtml(c.en)}</td>
    </tr>`).join('');
  $('#dictArea').innerHTML = `
    <div class="write-card">
      <div class="card-head" style="margin-bottom:10px">
        <div class="score-badge">选择要默写的句子（<span id="corPickCount">${all.length}</span> / ${all.length} 句已选）</div>
        <button class="btn" id="writePickCancel" type="button">← 返回</button>
      </div>
      <p class="muted" style="font-size:13px;margin:0 0 10px">勾选你想默写的句子，默认全选。确认后进入「看中文写英文」表格默写（英文列隐藏）。</p>
      <div style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:var(--radius)">
        <table class="corpus-table write-table">
          <thead><tr><th style="width:42px">默</th><th>中文</th><th>英文</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="dict-actions" style="margin-top:12px">
        <button class="btn" id="corPickAll" type="button">全选</button>
        <button class="btn" id="corPickNone" type="button">全不选</button>
        <button class="btn btn-primary" id="corPickConfirm" type="button">确认并开始默写 →</button>
      </div>
    </div>`;
  const updateCount = () => {
    const n = document.querySelectorAll('#dictArea .cor-pick-chk:checked').length;
    const el = $('#corPickCount'); if(el) el.textContent = n;
  };
  document.querySelectorAll('#dictArea .cor-pick-chk').forEach(c => c.addEventListener('change', updateCount));
  $('#corPickAll').addEventListener('click', () => { document.querySelectorAll('#dictArea .cor-pick-chk').forEach(c => c.checked = true); updateCount(); });
  $('#corPickNone').addEventListener('click', () => { document.querySelectorAll('#dictArea .cor-pick-chk').forEach(c => c.checked = false); updateCount(); });
  $('#writePickCancel').addEventListener('click', () => { $('#dictArea').innerHTML = ''; });
  $('#corPickConfirm').addEventListener('click', () => {
    const ids = [];
    document.querySelectorAll('#dictArea .cor-pick-chk').forEach(c => { if(c.checked) ids.push(c.dataset.id); });
    if(!ids.length){ toast('至少勾选一句'); return; }
    const q = DATA.corpus.filter(c => ids.indexOf(c.id) >= 0);
    window.__writeChecked = ids.slice();
    window.__writeQueue = q;
    renderWrite(q);
  });
}

function renderWrite(q, cfg){
  // 复用语料表结构：左中文（提示）+ 右英文（默写输入），紧凑表格
  const rows = q.map((it, i) => `
    <tr class="write-row" data-id="${it.id}">
      <td class="cor-idx">${i + 1}</td>
      <td class="cor-cell cor-cn">${it.cn ? escapeHtml(it.cn) : '<span class="muted">（无中文）</span>'}</td>
      <td class="cor-cell cor-en-write">
        <input class="write-en" data-id="${it.id}" placeholder="写出英文…" spellcheck="false" />
        <button class="write-play" data-play="${escapeHtml(it.en)}" title="听发音" type="button">🔊</button>
        <div class="write-fb" data-id="${it.id}" hidden></div>
      </td>
    </tr>`).join('');
  $('#dictArea').innerHTML = `
    <div class="write-card">
      <div class="card-head" style="margin-bottom:10px">
        <div class="score-badge">表格默写 · 看中文写英文（${q.length} 句）</div>
        <button class="btn" id="writeExit" type="button">← 退出默写</button>
      </div>
      <div id="corDraftNote" class="dict-draft-note" hidden style="margin-bottom:10px;padding:9px 12px;background:var(--primary-soft);border:1px solid var(--primary);border-radius:var(--radius);font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span>📝 已恢复上次没默完的内容（<span id="corDraftNoteAgo">刚刚</span>保存的草稿）</span>
        <button class="btn btn-sm" id="corDiscardDraft" type="button" style="margin-left:auto">放弃草稿</button>
      </div>
      <table class="corpus-table write-table">
        <thead><tr><th class="cor-idx">#</th><th>中文（提示）</th><th>英文（默写）</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="dict-actions" style="margin-top:12px">
        <button class="btn" id="writeReveal" type="button">显示全部答案</button>
        <button class="btn btn-primary" id="writeSubmit" type="button">提交批改（AI）</button>
      </div>
      <div id="writeResult" style="margin-top:14px"></div>
    </div>`;

  document.querySelectorAll('#writeList .write-play, #dictArea .write-play').forEach(b =>
    b.addEventListener('click', () => speak(b.dataset.play, 'en-US')));
  $('#writeExit').addEventListener('click', () => { $('#dictArea').innerHTML = ''; });
  $('#writeReveal').addEventListener('click', () => {
    const q2 = window.__writeQueue;
    document.querySelectorAll('#dictArea .write-row').forEach((row,i) => {
      const inp = row.querySelector('.write-en');
      if(!inp.value.trim()) inp.value = q2[i].en;
    });
  });
  $('#writeSubmit').addEventListener('click', () => gradeWrite(q, cfg));
  // 输入变化 → 防抖存草稿（切走/刷新可续）
  document.querySelectorAll('#dictArea .write-en').forEach(inp => inp.addEventListener('input', scheduleCorDraftSave));
  const dd = $('#corDiscardDraft');
  if(dd) dd.addEventListener('click', () => { clearCorDraft(); document.querySelectorAll('#dictArea .write-en').forEach(inp => inp.value = ''); $('#writeResult').innerHTML = ''; toast('已放弃草稿'); });
}

async function gradeWrite(q, cfg){
  const rows = document.querySelectorAll('#writeList .write-row');
  const items = [];
  rows.forEach((row, i) => {
    const inp = row.querySelector('.write-en');
    items.push({ id: q[i].id, en: q[i].en, cn: q[i].cn || '', user: (inp.value || '').trim() });
  });
  const resBox = $('#writeResult');
  resBox.innerHTML = '<div class="ts-load">AI 正在逐句批改…</div>';

  // 先做可靠的基础词级比对（不依赖网络），作为兜底与 AI 结果合并
  const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  const base = items.map(it => {
    const ref = norm(it.en), usr = norm(it.user);
    const usrSet = new Set(usr);
    let matched = 0; const missed = [];
    ref.forEach(w => { if(usrSet.has(w)) matched++; else missed.push(w); });
    const acc = ref.length ? Math.round(matched/ref.length*100) : 0;
    return { ...it, acc, missed };
  });

  let aiNotes = {};
  if(DATA.settings.relayToken){
    try{
      let lines = '';
      items.forEach((it,i) => { lines += (i+1) + '. 标准：' + it.en + '\n学生：' + (it.user || '（空）') + '\n\n'; });
      const messages = [
        { role:'system', content:
`你是雅思默写批改。给定「标准英文」和「学生默写」，逐句找英文单词层面的差异。
规则：只比对英文单词序列（小写、去标点），标点/空格/符号差异不算错；连字符豁免（short-lived / short lived / shortlived 视为同）。
返回严格 JSON：{"results":[{"loc":"1","wrong":"学生写法(漏写则空)","right":"正确写法","type":"漏写|错词|拼写","note":""}],"overall":""}。
无错则该条 results 不含此项。只输出 JSON，无解释无围栏。` },
        { role:'user', content: lines }
      ];
      const content = await callRelay('dictation_check', messages, 0.3);
      const r = aiJson(content);
      if(r && Array.isArray(r.results)){
        r.results.forEach(x => { if(x && x.loc) aiNotes[String(x.loc)] = x; });
      }
    }catch(e){ /* AI 失败则用基础比对，不影响批改 */ }
  }

  let okCount = 0;
  const html = base.map((it, i) => {
    const ai = aiNotes[String(i+1)];
    const ok = it.acc === 100;
    if(ok) okCount++;
    const missHtml = it.missed.length
      ? `<div class="write-res-line"><span class="muted">漏掉：</span> ${it.missed.map(w=>`<span class="badge down">${escapeHtml(w)}</span>`).join(' ')}</div>` : '';
    const aiLine = ai && ai.note
      ? `<div class="write-res-line muted">AI：${escapeHtml(ai.note)}</div>` : '';
    return `<div class="write-result-row ${ok?'ok':'bad'}">
      <div class="write-res-line"><b>${escapeHtml(it.cn || '（无中文）')}</b> · 准确率 ${it.acc}%${ok?' ✅':''}</div>
      <div class="write-res-line">你的：<span style="color:${ok?'var(--med)':'var(--danger)'}">${escapeHtml(it.user||'（未作答）')}</span></div>
      <div class="write-res-line muted">正确：${escapeHtml(it.en)}</div>
      ${missHtml}${aiLine}
    </div>`;
  }).join('');

  const summary = `<div class="dict-result-actions" style="justify-content:flex-start;margin-bottom:10px">
    <div class="stat-row" style="margin-right:16px">本次 <b>${q.length}</b> 句 · 全对 <b style="color:var(--med)">${okCount}</b></div>
    <button class="btn btn-primary" id="writeRestart">再来一轮</button>
  </div>`;
  resBox.innerHTML = summary + html;
  const rb = document.getElementById('writeRestart');
  if(rb) rb.addEventListener('click', startWrite);
  // 表格内回显：每行英文列下方显示正确英文 + 准确率（保留表格默写形态，不丢上下文）
  base.forEach((it, i) => {
    const row = document.querySelector('#dictArea .write-row[data-id="' + (q[i] && q[i].id) + '"]');
    if(!row) return;
    const fb = row.querySelector('.write-fb');
    if(!fb) return;
    const ok = it.acc === 100;
    const ai = aiNotes[String(i + 1)];
    fb.hidden = false;
    fb.className = 'write-fb ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = '正确：' + escapeHtml(it.en) + ' · ' + it.acc + '%' + (ok ? ' ✅' : '')
      + (it.missed.length ? ' · 漏：' + it.missed.map(w => escapeHtml(w)).join(' ') : '')
      + (ai && ai.note ? ' · <span class="muted">' + escapeHtml(ai.note) + '</span>' : '');
  });
  // 错句本：把本次准确率<100%的句子写入 dictationLogs（sourceId='corpus'），供错句本聚合
  const wrongItems = base.filter(it => it.acc < 100).map(it => ({
    loc: String(q.indexOf(it) + 1),
    wrong: it.user || '',
    right: it.en,
    type: it.missed.length ? '漏写' : '错词',
    note: it.missed.length ? ('漏：' + it.missed.join(' ')) : ''
  }));
  if(wrongItems.length){
    DATA.dictationLogs = DATA.dictationLogs || [];
    DATA.dictationLogs.push({ sourceId: 'corpus', title: '语料库表格默写', date: todayKey(), mistakes: wrongItems });
    hubSave();
  }
  clearCorDraft();   // 批改完成 → 本次默写结束，清草稿
}

function finishDict(){
  const acc = dict.total ? Math.round(dict.correct / dict.total * 100) : 0;
  const wrong = dict.wrongList;
  let body = `
    <div class="dict-summary">
      <div class="dict-score-ring" style="--pct:${acc}%">
        <div class="dict-score-num">${acc}<span>%</span></div>
        <div class="muted" style="font-size:12px">句子正确率</div>
      </div>
      <div class="dict-stats">
        <div class="stat-row"><span>本次句数</span><b>${dict.total}</b></div>
        <div class="stat-row"><span>全对</span><b style="color:var(--med)">${dict.correct}</b></div>
        <div class="stat-row"><span>错 / 跳过</span><b style="color:var(--danger)">${dict.total-dict.correct}</b></div>
        <div class="stat-row"><span>平均词准确率</span><b>${wrong.length?Math.round(wrong.reduce((a,w)=>a+(w.acc||0),0)/wrong.length)+'%':'—'}</b></div>
      </div>
    </div>
    <div class="dict-result-actions" style="justify-content:center;margin:14px 0">
      <button class="btn" id="exitBtn">返回</button>
      ${wrong.length?'<button class="btn btn-med" id="redoWrong"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>重练错句</button>':''}
      <button class="btn btn-primary" id="restartBtn">再来一轮</button>
    </div>`;
  if(wrong.length){
    body += `<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">
      <h3 style="margin:0 0 10px;color:var(--danger)">错句清单（${wrong.length} 句）</h3>
      <div>` + wrong.map((w,i) => `
        <div class="corpus-item" style="align-items:flex-start">
          <button class="plan-del" data-replay="${i}" title="播放"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg></button>
          <div class="corpus-text" style="flex:1;min-width:0">
            <div>${escapeHtml(w.en)}</div>
            <div class="muted" style="font-size:12px;margin-top:4px">
              词准确率 <b>${w.acc}%</b> · 漏词 ${w.missed.length} 个
              ${w.skipped?' <span class="badge down">跳过</span>':''}
              ${w.cn?'<br>中文：'+escapeHtml(w.cn):''}
            </div>
            ${w.missed.length?`<div style="margin-top:6px">${w.missed.map(m=>`<span class="badge down">${escapeHtml(m)}</span>`).join(' ')}</div>`:''}
          </div>
        </div>`).join('') + '</div></div>';
  }
  $('#dictArea').innerHTML = body;
  const eb = document.getElementById('exitBtn');
  if(eb) eb.addEventListener('click', () => { $('#dictArea').innerHTML=''; dict=null; });
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', startDict);
  const rw = document.getElementById('redoWrong');
  if(rw) rw.addEventListener('click', () => {
    const cfg = dict.cfg;
    dict = { queue: wrong.slice(), idx:0, cfg, wrongList:[], total:0, correct:0, revealed:false };
    // redo 用原句对象（要有 en/cn），wrong 元素已带这些字段
    toast('已进入错句重练：'+wrong.length+' 句');
    renderDictItem();
  });
  document.querySelectorAll('[data-replay]').forEach(b => {
    b.addEventListener('click', () => {
      const w = wrong[parseInt(b.dataset.replay,10)];
      playSentence(w.en);
    });
  });
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function speak(text, lang){ try{ const u=new SpeechSynthesisUtterance(text); u.lang=lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(e){} }

/* ===== 语料合并：长难句拆解 + 错题本（原 js/errorbook.js，保留 errorbook.html 独立页） ===== */
/* 错题本（极简版）：一个大框粘 AI 讲解 → AI 结构化 → 自动归档 + 错因统计
   数据结构（kind:'ai'）：
   { id, date, kind:'ai', known, source,
     title, subject, qtype, trap, howto:[], wrongPoint, rule:[], words:[], raw }
   兼容老数据 kind:'question' / 'word'（只读渲染，不再提供录入表单）。 */

ready(() => {
  /* 子 tab 切换：长难句 / 错题本 / 听力默写（默认长难句在前；null 保护兼容独立 errorbook.html 只有前两个 tab） */
  const wordTabs = document.querySelectorAll('#wordTabs [data-sub]');
  wordTabs.forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.sub;
    wordTabs.forEach(x => x.classList.toggle('active', x === b));
    const ls = $('#lsView'), eb = $('#ebView'), dict = $('#dictView');
    if(ls) ls.hidden = (s !== 'ls');
    if(eb) eb.hidden = (s !== 'eb');
    if(dict) dict.hidden = (s !== 'dict');
    if(s === 'ls' && typeof renderHistory === 'function') renderHistory();
    if(s === 'dict' && typeof renderList === 'function') renderList();
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
