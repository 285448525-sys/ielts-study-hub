let dict = null; // {queue, idx, cfg, wrongList, total, correct, revealed}

ready(() => {
  $('#importCorpus').addEventListener('click', importBulk);
  $('#addCorpus').addEventListener('click', addOne);
  $('#startDict').addEventListener('click', startDict);
  // 设置联动：设置实时保存到 localStorage
  const loadCfg = () => Object.assign({ rate:.9, repeat:3, intervalMs:2200, showCn:false, batchSize:10 }, DATA.settings.corpusCfg || {});
  const saveCfg = () => {
    DATA.settings.corpusCfg = {
      rate: parseFloat($('#sRate').value),
      repeat: parseInt($('#sRepeat').value,10),
      intervalMs: parseInt($('#sInterval').value,10),
      showCn: $('#sShowCn').checked,
      batchSize: parseInt($('#sBatch').value,10)
    };
    hubSave();
  };
  const cfg = loadCfg();
  $('#sRate').value = cfg.rate;  $('#sRateTxt').textContent = cfg.rate.toFixed(2)+'x';
  $('#sRepeat').value = cfg.repeat; $('#sRepeatTxt').textContent = cfg.repeat+' 次';
  $('#sInterval').value = String(cfg.intervalMs);
  $('#sShowCn').checked = !!cfg.showCn;
  $('#sBatch').value = String(cfg.batchSize);
  $('#sRate').addEventListener('input', () => { $('#sRateTxt').textContent = parseFloat($('#sRate').value).toFixed(2)+'x'; saveCfg(); });
  $('#sRepeat').addEventListener('input', () => { $('#sRepeatTxt').textContent = parseInt($('#sRepeat').value,10)+' 次'; saveCfg(); });
  $('#sInterval').addEventListener('change', saveCfg);
  $('#sShowCn').addEventListener('change', saveCfg);
  $('#sBatch').addEventListener('change', saveCfg);
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
  hubSave(); renderList();
}

function renderList(){
  $('#corpusCount').textContent = DATA.corpus.length;
  const box = $('#corpusList');
  if(DATA.corpus.length === 0){ box.innerHTML = renderEmpty('还没有句子，上面导几句吧。'); return; }
  box.innerHTML = DATA.corpus.slice().reverse().map(c => `
    <div class="corpus-item">
      <button class="plan-del" data-play="${escapeHtml(c.en)}" title="播放">🔊</button>
      <div class="corpus-text"><div>${escapeHtml(c.en)}</div>${c.cn ? `<div class="muted" style="font-size:13px">${escapeHtml(c.cn)}</div>` : ''}</div>
      <button class="plan-del" data-del="${c.id}" title="删除">✕</button>
    </div>
  `).join('');
  box.querySelectorAll('button[data-play]').forEach(b =>
    b.addEventListener('click', () => speak(b.dataset.play, 'en-US')));
  box.querySelectorAll('button[data-del]').forEach(b =>
    b.addEventListener('click', () => deleteCorpus(b.dataset.del)));
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
        <button class="btn" id="replayBtn">🔊 播放</button>
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
        <button class="btn" id="skipBtn">🙈 跳过 / 看答案</button>
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
        <button class="btn" id="playAgainBtn">🔊 再听一遍</button>
        <button class="btn btn-primary" id="nextBtn">下一句 →</button>
      </div>
    </div>`;
  $('#playAgainBtn').addEventListener('click', () => playSentence(item.en));
  $('#nextBtn').addEventListener('click', () => { dict.idx++; renderDictItem(); });
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
      ${wrong.length?'<button class="btn btn-med" id="redoWrong">🔁 重练错句</button>':''}
      <button class="btn btn-primary" id="restartBtn">再来一轮</button>
    </div>`;
  if(wrong.length){
    body += `<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">
      <h3 style="margin:0 0 10px;color:var(--danger)">错句清单（${wrong.length} 句）</h3>
      <div>` + wrong.map((w,i) => `
        <div class="corpus-item" style="align-items:flex-start">
          <button class="plan-del" data-replay="${i}" title="播放">🔊</button>
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
