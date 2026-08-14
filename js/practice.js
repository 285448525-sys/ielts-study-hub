let pq = null; // {mode, queue, idx, total, correct, revealed, answer, dueList, wrongList}

// 间隔重复（记忆曲线）各阶段间隔，单位：天；数组索引 = 记忆阶段
const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];

// ======= 全局练习配置（爱听写风格：一切可自定义）=======
const PC_DEFAULTS = {
  rate: 0.9,          // 语速
  repeat: 1,          // 朗读次数（选择题默认1）
  dictRepeat: 3,      // 听写模式朗读次数（默认3）
  intervalMs: 1800,   // 朗读间隔
  batchSize: -1,      // 题量: -1=全部, 5, 10, 20
  shuffle: true,      // 乱序
  autoNext: true,     // 答对自动下一题
  autoNextDelay: 800, // 自动下一题延迟ms
  autoPlay: true,     // 自动播放下题读音
  caseSensitive: false, // 大小写敏感（听写）
  showCn: false,      // 显示释义提示
  showEn: 0,          // 显示英文原词: 0=不显示, 1=答错时显示, 2=始终显示
  optCount: 4         // 选择题选项数量
};
function pc(){
  if(!DATA.settings.practiceCfg) DATA.settings.practiceCfg = {};
  return Object.assign({}, PC_DEFAULTS, DATA.settings.practiceCfg);
}
function pcSave(obj){
  DATA.settings.practiceCfg = Object.assign(pc(), obj);
  hubSave();
}

ready(() => {
  // 绑定模式按钮
  document.querySelectorAll('button[data-mode]').forEach(b => {
    b.addEventListener('click', () => startPractice(b.dataset.mode));
  });
  $('#exitPractice').addEventListener('click', resetPractice);
  $('#nextBtn').addEventListener('click', onNext);
  // 绑定设置面板
  bindCfgPanel();
});

// ======= 设置面板渲染与绑定 =======
function bindCfgPanel(){
  const c = pc();
  $('#pcRate').value = c.rate;
  $('#pcRateTxt').textContent = c.rate.toFixed(2)+'x';
  $('#pcRepeat').value = c.repeat;
  $('#pcRepeatTxt').textContent = c.repeat+' 次';
  $('#pcInterval').value = String(c.intervalMs);
  $('#pcBatch').value = String(c.batchSize);
  $('#pcOptCount').value = String(c.optCount);
  $('#pcShuffle').value = c.shuffle ? '1' : '0';
  $('#pcAutoNext').value = c.autoNext ? '1' : '0';
  $('#pcAutoDelay').value = String(c.autoNextDelay);
  $('#pcAutoPlay').value = c.autoPlay ? '1' : '0';
  $('#pcCase').value = c.caseSensitive ? '1' : '0';
  $('#pcShowCn').value = c.showCn ? '1' : '0';
  $('#pcShowEn').value = String(c.showEn);
  toggleDelayWrap();

  const saveAll = () => pcSave({
    rate: parseFloat($('#pcRate').value),
    repeat: parseInt($('#pcRepeat').value,10),
    intervalMs: parseInt($('#pcInterval').value,10),
    batchSize: parseInt($('#pcBatch').value,10),
    optCount: parseInt($('#pcOptCount').value,10),
    shuffle: $('#pcShuffle').value === '1',
    autoNext: $('#pcAutoNext').value === '1',
    autoNextDelay: parseInt($('#pcAutoDelay').value,10),
    autoPlay: $('#pcAutoPlay').value === '1',
    caseSensitive: $('#pcCase').value === '1',
    showCn: $('#pcShowCn').value === '1',
    showEn: parseInt($('#pcShowEn').value,10)
  });
  $('#pcRate').addEventListener('input', () => { $('#pcRateTxt').textContent = parseFloat($('#pcRate').value).toFixed(2)+'x'; saveAll(); });
  $('#pcRepeat').addEventListener('input', () => { $('#pcRepeatTxt').textContent = parseInt($('#pcRepeat').value,10)+' 次'; saveAll(); });
  ['pcInterval','pcBatch','pcOptCount','pcShuffle','pcAutoDelay','pcAutoPlay','pcCase','pcShowCn','pcShowEn'].forEach(id => {
    $('#'+id).addEventListener('change', saveAll);
  });
  $('#pcAutoNext').addEventListener('change', () => { saveAll(); toggleDelayWrap(); });

  // 折叠/展开
  $('#cfgToggle').addEventListener('click', () => {
    const body = $('#cfgBody');
    const chev = $('#cfgChev');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : '';
    chev.textContent = open ? '▸' : '▾';
  });
}
function toggleDelayWrap(){
  const on = $('#pcAutoNext').value === '1';
  $('#autoNextDelayWrap').style.display = on ? '' : 'none';
}

// ======= 开始练习 =======
function startPractice(mode){
  if(DATA.words.length === 0){ toast('词库为空，先去「我的词库」添加单词'); return; }
  if(['seeWord','hearMeaning','dictation'].includes(mode) && DATA.words.length < 2){ toast('该模式需要至少 2 个单词'); return; }
  const c = pc();
  pq = { mode, queue: [], idx: 0, total: 0, correct: 0, revealed: false, answer: null, wrongList: [] };
  if(mode === 'flashcard'){ startReview(); return; }
  // 出题：按配置选词
  let pool = DATA.words.slice();
  if(c.shuffle) pool = shuffle(pool);
  if(c.batchSize > 0 && pool.length > c.batchSize) pool = pool.slice(0, c.batchSize);
  pq.queue = pool;
  $('#modeSelect').hidden = true;
  $('#practiceCfg').hidden = true;
  $('#practiceArea').hidden = false;
  $('#progBarWrap').hidden = false;
  nextQuestion();
}

// 复习单词（间隔重复）：先算今日待复习，再闪卡复习
function startReview(){
  const due = dueWords();
  $('#modeSelect').hidden = true;
  $('#practiceCfg').hidden = true;
  $('#practiceArea').hidden = false;
  $('#nextBtn').hidden = true;
  $('#progBarWrap').hidden = true;
  if(due.length === 0){
    $('#practiceScore').textContent = '';
    $('#practiceBody').innerHTML = '<div class="q-word">🎉 今天没有待复习的词</div>' +
      '<div class="q-cn">去「我的词库」加词，或明天再来。复习会按记忆曲线自动排程。</div>';
    return;
  }
  pq.dueList = due;
  pq.queue = shuffle(due.slice());
  showDueList();
}

// 列出当天应复习的词汇（覆盖各阶段记忆周期）
function showDueList(){
  const list = pq.dueList;
  const byStage = {};
  list.forEach(w => { const s = w.srsStage||0; byStage[s] = (byStage[s]||0)+1; });
  const stageInfo = Object.keys(byStage).sort((a,b)=>a-b)
    .map(s => '第'+s+'阶段 '+byStage[s]+' 个').join(' · ');
  $('#practiceScore').textContent = '待复习 '+list.length+' 个';
  $('#practiceBody').innerHTML =
    '<div class="q-word">今日待复习 '+list.length+' 个</div>' +
    '<div class="q-cn">覆盖记忆周期：'+(stageInfo||'新词')+'</div>' +
    '<div style="margin-top:12px;text-align:left;max-height:320px;overflow:auto">' +
      list.map(w => '<div class="list-item"><span><strong>'+escapeHtml(w.en)+'</strong>'+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+'</span><span class="badge">第'+(w.srsStage||0)+'阶段</span></div>').join('') +
    '</div>' +
    '<button class="btn btn-primary" id="startReview" style="margin-top:14px">开始复习</button>';
  $('#startReview').addEventListener('click', () => { $('#practiceBody').innerHTML=''; nextQuestion(); });
}

function resetPractice(){
  pq = null;
  $('#practiceArea').hidden = true;
  $('#progBarWrap').hidden = true;
  $('#modeSelect').hidden = false;
  $('#practiceCfg').hidden = false;
  $('#nextBtn').hidden = true;
}

// 自动进入下一题（答对时调用）
function autoAdvance(){
  if(!pq || !pq.revealed) return;
  const c = pc();
  if(!c.autoNext) { $('#nextBtn').hidden = false; return; }
  $('#nextBtn').hidden = true;
  setTimeout(() => { if(pq && pq.revealed){ pq.idx++; nextQuestion(); } }, c.autoNextDelay);
}

function nextQuestion(){
  if(!pq) return;
  $('#nextBtn').hidden = true;
  const body = $('#practiceBody');
  const mode = pq.mode;
  updateScore();
  updateProgBar();
  if(mode === 'corpus'){
    body.innerHTML = '<div style="width:100%;max-height:360px;overflow:auto;text-align:left">' + DATA.words.map(w =>
      '<div class="list-item"><span><strong>'+escapeHtml(w.en)+'</strong></span><span>'+escapeHtml(w.cn)+(w.tag?' · '+w.tag:'')+'</span></div>'
    ).join('') + '</div>';
    return;
  }
  if(pq.idx >= pq.queue.length){ finishPractice(); return; }
  pq.revealed = false;
  const cur = pq.queue[pq.idx];
  const c = pc();

  if(mode === 'flashcard'){
    body.innerHTML = '<div class="q-word">'+escapeHtml(cur.en)+'</div>' +
      (c.showCn ? '<div class="q-cn">'+escapeHtml(cur.cn||'')+'</div>' : '<button class="btn" id="revealBtn">显示释义</button>') +
      '<div id="flashAns" style="margin-top:10px;color:var(--muted);font-size:18px"></div>' +
      '<div id="judge" style="margin-top:14px;display:'+(c.showCn?'flex':'none')+';gap:10px;justify-content:center">' +
        '<button class="btn btn-med" id="knownBtn">✅ 认识</button>' +
        '<button class="btn btn-danger" id="unknownBtn">❌ 不认识</button>' +
      '</div>';
    if(!c.showCn){
      $('#revealBtn').addEventListener('click', () => {
        $('#flashAns').textContent = cur.cn + (cur.tag ? ' · '+cur.tag : '');
        $('#judge').style.display = 'flex';
        $('#revealBtn').hidden = true;
      });
    }
    $('#knownBtn').addEventListener('click', () => applySrs(cur, true));
    $('#unknownBtn').addEventListener('click', () => applySrs(cur, false));
  } else if(mode === 'seeWord'){
    pq.answer = cur;
    const optN = Math.min(c.optCount, DATA.words.length);
    const opts = shuffle([cur, ...pickWrong(cur, optN-1)]);
    let html = '<div class="q-word">'+escapeHtml(cur.en)+'</div>';
    if(c.showCn) html += '<div class="q-cn muted" style="font-size:14px">'+escapeHtml(cur.cn||'')+'</div>';
    html += '<div class="options" id="opts" style="margin-top:14px"></div>';
    body.innerHTML = html;
    $('#opts').innerHTML = opts.map(o => '<button class="opt" data-en="'+escapeHtml(o.en)+'">'+escapeHtml(o.cn)+'</button>').join('')
      + '<button class="opt opt-unknown" id="unknownBtn" style="grid-column:1/-1;margin-top:6px">🙈 不认识（不计正确率）</button>';
    bindOpts(cur);
    $('#unknownBtn').addEventListener('click', () => markUnknown(cur));
  } else if(mode === 'hearMeaning'){
    pq.answer = cur;
    const optN = Math.min(c.optCount, DATA.words.length);
    const opts = shuffle([cur, ...pickWrong(cur, optN-1)]);
    let html = '<button class="btn btn-play-large" id="playBtn">🔊 播放读音</button>';
    if(c.showCn) html += '<div class="q-cn muted" style="font-size:14px;margin-top:8px">'+escapeHtml(cur.cn||'')+'</div>';
    html += '<div class="options" id="opts" style="margin-top:14px"></div>';
    body.innerHTML = html;
    $('#opts').innerHTML = opts.map(o => '<button class="opt" data-en="'+escapeHtml(o.en)+'">'+escapeHtml(o.cn)+'</button>').join('')
      + '<button class="opt opt-unknown" id="unknownBtn" style="grid-column:1/-1;margin-top:6px">🙈 不认识（听不出词义）</button>';
    $('#playBtn').addEventListener('click', () => speakN(cur.en));
    speakN(cur.en);
    bindOpts(cur);
    $('#unknownBtn').addEventListener('click', () => markUnknown(cur));
  } else if(mode === 'dictation'){
    pq.answer = cur;
    renderDictCard(body, cur);
  }
}

// ======= 选择题选项绑定（答对自动下一题）=======
function bindOpts(correct){
  const c = pc();
  document.querySelectorAll('#opts .opt').forEach(b => {
    if(b.id === 'unknownBtn') return;
    b.addEventListener('click', () => {
      if(pq.revealed) return; pq.revealed = true; pq.total++;
      const ok = b.dataset.en === correct.en;
      if(ok){ b.classList.add('correct'); pq.correct++; } else { b.classList.add('wrong'); }
      // 高亮正确答案
      document.querySelectorAll('#opts .opt').forEach(x => { if(x.dataset.en === correct.en) x.classList.add('correct'); });
      // 禁用所有选项
      document.querySelectorAll('#opts .opt').forEach(x => { x.style.pointerEvents = 'none'; });
      const ub = document.getElementById('unknownBtn');
      if(ub) ub.style.pointerEvents = 'none';
      updateScore();
      if(ok){
        // 答对：自动下一题
        autoAdvance();
      } else {
        // 答错：显示下一题按钮（不自动）
        if(!c.showCn && c.showEn === 1){
          // 答错时显示英文原词
          const hint = document.createElement('div');
          hint.className = 'opt-hint';
          hint.innerHTML = '正确答案：<b>'+escapeHtml(correct.en)+'</b>';
          $('#opts').appendChild(hint);
        }
        $('#nextBtn').hidden = false;
      }
    });
  });
}

// 不认识：标记该词为未掌握——计入作答次数(total)，但绝不计入正确(correct)
function markUnknown(correct){
  if(!pq || pq.revealed) return;
  pq.revealed = true; pq.total++;
  document.querySelectorAll('#opts .opt').forEach(x => { if(x.dataset.en === correct.en) x.classList.add('correct'); x.style.pointerEvents = 'none'; });
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.classList.add('wrong'); ub.disabled = true; }
  if(!pq.wrongList) pq.wrongList = [];
  pq.wrongList.push({ en:correct.en, cn:correct.cn||'', tag:correct.tag||'', user:'（不认识）', skipped:true });
  $('#nextBtn').hidden = false; updateScore();
  toast('已记为不认识：'+correct.en+' · '+correct.cn);
}

// 复习单词：依据记忆曲线更新该词的阶段与下次复习日，并落库
function applySrs(w, known){
  if(pq.revealed) return;
  pq.revealed = true; pq.total++;
  if(known) pq.correct++;
  const today = todayKey();
  if(known){
    const stage = Math.min((w.srsStage||0)+1, SRS_INTERVALS.length-1);
    w.srsStage = stage;
    w.srsDue = addDays(today, SRS_INTERVALS[stage]);
  } else {
    w.srsStage = 0;
    w.srsDue = addDays(today, 1);
    w.srsLapses = (w.srsLapses||0)+1;
  }
  w.srsReps = (w.srsReps||0)+1;
  w.srsLast = today;
  hubSave();
  $('#flashAns').textContent = w.cn + (w.tag ? ' · '+w.tag : '');
  $('#judge').style.display = 'none';
  $('#revealBtn').hidden = true;
  $('#nextBtn').hidden = false; updateScore();
  toast(known ? ('已记为认识，下次复习 '+w.srsDue) : '已记为不认识，明天再练');
}

// ======= 听写（爱听写风格）=======
function dictRepeat(){
  // 听写模式用独立次数配置，如果用户在设置面板调了 repeat 就用那个
  const c = pc();
  return c.dictRepeat || c.repeat || 3;
}

function renderDictCard(body, cur){
  const c = pc();
  const rep = dictRepeat();
  body.innerHTML = `
    <div class="dict-card">
      <div class="dict-head">
        <button class="btn btn-play-large" id="playBtn" title="播放">🔊 播放</button>
        <div class="dict-meta">
          <div class="dict-voice">
            <label>语速</label>
            <input type="range" id="cfgRate" min="0.5" max="1.3" step="0.05" value="${c.rate}" />
            <span id="rateTxt">${c.rate.toFixed(2)}x</span>
          </div>
          <div class="dict-voice">
            <label>次数</label>
            <input type="range" id="cfgRepeat" min="1" max="5" step="1" value="${rep}" />
            <span id="repeatTxt">${rep} 次</span>
          </div>
          <div class="dict-voice">
            <label>间隔</label>
            <select id="cfgInterval">
              <option value="800">0.8s</option>
              <option value="1200">1.2s</option>
              <option value="1800">1.8s</option>
              <option value="2400">2.4s</option>
              <option value="3200">3.2s</option>
            </select>
          </div>
          <div class="dict-voice">
            <label><input type="checkbox" id="cfgShowCn" ${c.showCn?'checked':''}/> 释义提示</label>
          </div>
        </div>
      </div>
      <div id="cnHint" style="text-align:center;color:var(--muted);margin-top:8px;min-height:20px;font-size:14px">${c.showCn ? '中文释义：'+escapeHtml(cur.cn||'(无)') : ''}</div>
      <input class="q-input dict-input" id="dictInput" placeholder="听到后把英文单词拼写写在这里，Enter 提交" autocomplete="off" spellcheck="false" autocapitalize="off" />
      <div class="dict-actions">
        <button class="btn" id="revealBtn">🙈 没听清 / 跳过</button>
        <button class="btn btn-primary" id="checkBtn">确认提交</button>
      </div>
      <div id="dictResult" style="margin-top:14px"></div>
    </div>`;
  // 设置面板内联绑定（同步到全局配置）
  $('#cfgInterval').value = String(c.intervalMs);
  const syncCfg = () => pcSave({
    rate: parseFloat($('#cfgRate').value),
    dictRepeat: parseInt($('#cfgRepeat').value,10),
    intervalMs: parseInt($('#cfgInterval').value,10),
    showCn: $('#cfgShowCn').checked
  });
  $('#cfgRate').addEventListener('input', () => { $('#rateTxt').textContent = parseFloat($('#cfgRate').value).toFixed(2)+'x'; syncCfg(); });
  $('#cfgRepeat').addEventListener('input', () => { $('#repeatTxt').textContent = parseInt($('#cfgRepeat').value,10)+' 次'; syncCfg(); });
  $('#cfgInterval').addEventListener('change', syncCfg);
  $('#cfgShowCn').addEventListener('change', () => {
    const on = $('#cfgShowCn').checked;
    $('#cnHint').textContent = on ? '中文释义：'+escapeHtml(cur.cn||'(无)') : '';
    syncCfg();
  });
  // 播放 / 提交
  $('#playBtn').addEventListener('click', () => playWord(cur.en));
  $('#checkBtn').addEventListener('click', () => checkDictation(cur));
  $('#revealBtn').addEventListener('click', () => markDictSkip(cur));
  $('#dictInput').addEventListener('keydown', e => { if(e.key === 'Enter') checkDictation(cur); });
  setTimeout(() => { $('#dictInput').focus(); playWord(cur.en); }, 120);
}

// 朗读N次（按全局配置）
function speakN(text){
  const c = pc();
  try{
    window.speechSynthesis.cancel();
    let n = 0;
    const run = () => {
      if(n++ >= c.repeat) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = c.rate;
      window.speechSynthesis.speak(u);
      setTimeout(run, c.intervalMs);
    };
    run();
  }catch(e){}
}

function playWord(text){
  const c = pc();
  const rep = dictRepeat();
  try{
    window.speechSynthesis.cancel();
    let n = 0;
    const run = () => {
      if(n++ >= rep) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = c.rate;
      window.speechSynthesis.speak(u);
      setTimeout(run, c.intervalMs);
    };
    run();
  }catch(e){}
}

function markDictSkip(cur){
  if(pq.revealed) return;
  pq.revealed = true; pq.total++;
  showDictResult(cur, '', false, true);
}

function checkDictation(cur){
  if(pq.revealed) return; pq.revealed = true; pq.total++;
  const c = pc();
  const val = ($('#dictInput').value || '').trim();
  const ok = c.caseSensitive ? val === cur.en : val.toLowerCase() === cur.en.toLowerCase();
  if(ok) pq.correct++;
  showDictResult(cur, val, ok, false);
}

function showDictResult(cur, userVal, ok, skipped){
  const c = pc();
  const box = $('#dictResult');
  if(!pq.wrongList) pq.wrongList = [];
  if(!ok) pq.wrongList.push({ en:cur.en, cn:cur.cn||'', tag:cur.tag||'', user: userVal, skipped });

  // 逐字母比对
  let charHtml;
  if(skipped){
    charHtml = '';
  } else if(ok){
    charHtml = '<div class="spell-row">' +
      cur.en.split('').map(ch => '<span class="ch correct">'+escapeHtml(ch)+'</span>').join('') +
      '</div>';
  } else {
    const ref = cur.en.split(''), usr = userVal.split('');
    const out = [];
    let i=0, j=0;
    while(i<ref.length && j<usr.length){
      if(ref[i].toLowerCase() === usr[j].toLowerCase()){
        out.push({ch:usr[j], ok:true}); i++; j++;
      } else {
        out.push({ch:usr[j], ok:false, extra:false});
        j++;
      }
    }
    while(j<usr.length){ out.push({ch:usr[j], ok:false}); j++; }
    const missing = ref.slice(i);
    charHtml = '<div class="spell-row">' +
      out.map(x => '<span class="ch '+(x.ok?'correct':'wrong')+'">'+escapeHtml(x.ch)+'</span>').join('') +
      (missing.length ? missing.map(m => '<span class="ch miss">'+escapeHtml(m)+'</span>').join('') : '') +
      '</div>';
    charHtml += '<div class="muted" style="font-size:12px;margin-top:6px">参考拼写：' +
      ref.map(ch => '<span class="ch ref">'+escapeHtml(ch)+'</span>').join('') + '</div>';
  }

  // 答对自动下一题；答错/跳过显示按钮
  const showNext = !ok || skipped || !c.autoNext;
  box.innerHTML = `
    <div class="dict-result-card ${ok?'ok':'bad'}">
      <div class="dict-verdict">${skipped?'😵 跳过':(ok?'✅ 完全正确':'❌ 拼写有误')}</div>
      ${!skipped && !ok ? '<div class="muted" style="font-size:12px;margin-top:2px">你写的：</div>'+charHtml : charHtml}
      <div class="dict-answer">
        <div class="dict-ans-en">${escapeHtml(cur.en)}</div>
        <div class="dict-ans-cn">${escapeHtml(cur.cn||'')}${cur.tag?'<span class="badge" style="margin-left:8px">'+escapeHtml(cur.tag)+'</span>':''}</div>
      </div>
      <div class="dict-result-actions">
        <button class="btn" id="playAgainBtn">🔊 再听一遍</button>
        ${showNext ? '<button class="btn btn-primary" id="dictNextBtn">下一题 →</button>' : ''}
      </div>
    </div>`;
  $('#playAgainBtn').addEventListener('click', () => playWord(cur.en));
  if(showNext){
    $('#dictNextBtn').addEventListener('click', () => { pq.idx++; nextQuestion(); });
  }
  updateScore();
  // 答对且开启自动下一题：延迟后自动进入
  if(ok && !skipped && c.autoNext){
    setTimeout(() => { if(pq && pq.revealed){ pq.idx++; nextQuestion(); } }, c.autoNextDelay);
  }
  // 自动播放下一题读音（在 nextQuestion 里会自动播放）
}

function onNext(){ pq.idx++; nextQuestion(); }
function finishPractice(){
  const acc = pq.total ? Math.round(pq.correct / pq.total * 100) : 0;
  const unknown = (pq.total||0) - (pq.correct||0);
  const wrong = pq.wrongList || [];
  let bodyHtml = '';
  if(pq.mode === 'dictation'){
    bodyHtml = `
      <div class="dict-summary">
        <div class="dict-score-ring" style="--pct:${acc}%">
          <div class="dict-score-num">${acc}<span>%</span></div>
          <div class="muted" style="font-size:12px">正确率</div>
        </div>
        <div class="dict-stats">
          <div class="stat-row"><span>本次题量</span><b>${pq.total}</b></div>
          <div class="stat-row"><span>写对</span><b style="color:var(--med)">${pq.correct}</b></div>
          <div class="stat-row"><span>错 / 跳过</span><b style="color:var(--danger)">${unknown}</b></div>
          <div class="stat-row"><span>复习错词</span><b>${wrong.length} 个</b></div>
        </div>
      </div>
      <div class="dict-result-actions" style="justify-content:center;margin:14px 0">
        <button class="btn" id="exitBtn">返回模式选择</button>
        ${wrong.length ? '<button class="btn btn-med" id="redoWrong">🔁 只重练错词</button>' : ''}
        <button class="btn btn-primary" id="restartBtn">再来一轮</button>
      </div>`;
    if(wrong.length){
      bodyHtml += '<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">' +
        '<h3 style="margin:0 0 10px;color:var(--danger)">错词列表（'+wrong.length+' 个）</h3><div>' + wrong.map((w,i) =>
          '<div class="list-item">' +
            '<span><b style="font-size:15px">'+escapeHtml(w.en)+'</b>'+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+(w.tag?' <span class="badge">'+escapeHtml(w.tag)+'</span>':'')+'</span>' +
            '<span style="text-align:right">'+(w.skipped?'<span class="badge down">跳过</span>':('<span class="muted" style="font-size:12px">你写：'+escapeHtml(w.user||'(空)')+'</span>'))+'</span>' +
            '<span class="list-actions"><button class="btn btn-sm" data-replay="'+i+'">🔊</button></span>' +
          '</div>').join('') + '</div></div>';
    }
  } else {
    bodyHtml = '<div class="q-word">练习完成 🎉</div>' +
      '<div class="q-cn">正确率 '+acc+'%（'+pq.correct+'/'+pq.total+'）· 待加强 '+unknown+'</div>';
    if(wrong.length){
      bodyHtml += '<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">' +
        '<h3 style="margin:0 0 10px;color:var(--danger)">错词列表（'+wrong.length+' 个）</h3><div>' + wrong.map((w,i) =>
          '<div class="list-item">' +
            '<span><b style="font-size:15px">'+escapeHtml(w.en)+'</b>'+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+'</span>' +
            '<span style="text-align:right"><span class="muted" style="font-size:12px">'+escapeHtml(w.user||'')+'</span></span>' +
            '<span class="list-actions"><button class="btn btn-sm" data-replay="'+i+'">🔊</button></span>' +
          '</div>').join('') + '</div></div>';
      bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
        '<button class="btn" id="exitBtn">返回模式选择</button>' +
        '<button class="btn btn-med" id="redoWrong">🔁 只重练错词</button>' +
        '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
    } else {
      bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
        '<button class="btn" id="exitBtn">返回模式选择</button>' +
        '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
    }
  }
  $('#practiceBody').innerHTML = bodyHtml;
  $('#nextBtn').hidden = true; $('#practiceScore').textContent = '';
  $('#progBarWrap').hidden = true;
  // 绑定按钮
  const eb = document.getElementById('exitBtn');
  if(eb) eb.addEventListener('click', resetPractice);
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', () => { startPractice(pq.mode); });
  const rw = document.getElementById('redoWrong');
  if(rw) rw.addEventListener('click', () => {
    const mode = pq.mode;
    pq = { mode, queue: shuffle(wrong.slice()), idx: 0, total: 0, correct: 0, revealed: false, answer: null, wrongList: [] };
    $('#nextBtn').hidden = true;
    $('#progBarWrap').hidden = false;
    nextQuestion();
    toast('已进入错词重练：'+wrong.length+' 个词');
  });
  document.querySelectorAll('[data-replay]').forEach(b => {
    b.addEventListener('click', () => {
      const w = wrong[parseInt(b.dataset.replay,10)];
      playWord(w.en);
    });
  });
}

function updateScore(){ if(pq) $('#practiceScore').textContent = '进度 '+(pq.idx+1)+'/'+pq.queue.length+' · 正确 '+pq.correct; }
function updateProgBar(){
  if(!pq || !pq.queue.length) return;
  const pct = ((pq.idx) / pq.queue.length) * 100;
  $('#progBarFill').style.width = pct + '%';
}

// 今日待复习：新词(无 srsDue) + 到期/逾期(srsDue <= 今天) 的单词
function dueWords(){
  const today = todayKey();
  return DATA.words.filter(w => !w.srsDue || w.srsDue <= today);
}
function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
function pickWrong(correct, n){
  const pool = DATA.words.filter(w => w.en !== correct.en);
  const sameTag = shuffle(pool.filter(w => w.tag && w.tag === correct.tag));
  const rest = shuffle(pool.filter(w => !(w.tag && w.tag === correct.tag)));
  return sameTag.concat(rest).slice(0, n);
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function speak(text, lang){ try{ const u=new SpeechSynthesisUtterance(text); u.lang=lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(e){} }
