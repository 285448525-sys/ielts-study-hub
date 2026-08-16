var pq = null; // {mode, queue, idx, total, correct, revealed, answer, dueList, wrongList}

// 间隔重复（记忆曲线）各阶段间隔，单位：天；数组索引 = 记忆阶段
var SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];

// 墨墨式：单词难度(1易~10难) → 首次「认识」后的复习间隔(天)
// 越简单首间隔越长，越难越短（贴合墨墨：认识简单词≈60天 / 难词≈1天）
var MC_FIRST = {1:60,2:40,3:25,4:16,5:10,6:7,7:5,8:3,9:2,10:1};

// ======= 全局练习配置（爱听写风格：一切可自定义）=======
var PC_DEFAULTS = {
  rate: 0.9,          // 语速
  repeat: 1,          // 朗读次数（选择题默认1）
  dictRepeat: 3,      // 听写模式朗读次数（默认3）
  intervalMs: 1800,   // 朗读间隔
  batchSize: -1,      // 题量: -1=全部, 5, 10, 20
  shuffle: true,      // 乱序
  autoNext: true,     // 答对自动下一题
  autoNextDelay: 1000, // 自动下一题延迟ms
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
  // 练习设置改为右上角齿轮弹窗（参考爱听写）
  $('#cfgGear').addEventListener('click', () => {
    $('#cfgModal').hidden = false;
    renderCfgModal();   // 每次打开时重新渲染当前值
  });
  $('#cfgClose').addEventListener('click', () => { $('#cfgModal').hidden = true; });
  $('#cfgModal').addEventListener('click', e => {
    if(e.target === $('#cfgModal')) $('#cfgModal').hidden = true;  // 点遮罩关闭
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && !$('#cfgModal').hidden) $('#cfgModal').hidden = true;  // ESC 关闭
  });
});

// ======= 设置模态弹窗（齿轮触发，分组渲染，参考爱听写）=======
function renderCfgModal(){
  const c = pc();
  const body = $('.cfg-modal-body');
  // 分组（答题 / 声音 / 显示）
  const groups = [
    {
      name:'答题', icon:'☑',
      items:[
        { key:'batchSize',     label:'题量',          type:'select', opts:[{v:'5',t:'5 题'},{v:'10',t:'10 题'},{v:'20',t:'20 题'},{v:'-1',t:'全部'}] },
        { key:'optCount',      label:'选项数量',      type:'select', opts:[{v:'4',t:'4 个'},{v:'6',t:'6 个'}] },
        { key:'shuffle',       label:'随机乱序',      type:'toggle' },
        { key:'autoNext',      label:'自动进入下一题', type:'toggle', desc:'点选后约 1 秒自动跳转' },
        { key:'autoNextDelay', label:'跳转延迟',      type:'select', opts:[{v:'400',t:'0.4s'},{v:'1000',t:'1.0s'},{v:'1500',t:'1.5s'},{v:'2500',t:'2.5s'}], showIf:'autoNext' },
      ]
    },
    {
      name:'声音', icon:'🔊',
      items:[
        { key:'rate',      label:'语速',     type:'range', min:0.5, max:1.3, step:0.05, unit:'x' },
        { key:'repeat',    label:'朗读次数', type:'range', min:1, max:5, step:1, unit:' 次' },
        { key:'intervalMs',label:'朗读间隔', type:'select', opts:[{v:'800',t:'0.8s'},{v:'1200',t:'1.2s'},{v:'1800',t:'1.8s'},{v:'2400',t:'2.4s'},{v:'3200',t:'3.2s'}] },
        { key:'autoPlay',  label:'自动播下题', type:'toggle' },
      ]
    },
    {
      name:'显示', icon:'👁',
      items:[
        { key:'showCn',       label:'显示释义提示',    type:'toggle' },
        { key:'showEn',       label:'显示英文原词',    type:'select', opts:[{v:'0',t:'不显示'},{v:'1',t:'答错时显示'},{v:'2',t:'始终显示'}] },
        { key:'caseSensitive',label:'大小写敏感(听写)', type:'toggle' },
      ]
    }
  ];

  let html = '<div class="cfg-m-cols"><div class="cfg-m-sidebar">';
  for(const g of groups){
    html += '<div class="cfg-m-cat" data-cat="'+g.name+'"><span>'+g.icon+' '+g.name+'</span></div>';
  }
  html += '</div><div class="cfg-m-main">';
  for(const g of groups){
    html += '<div class="cfg-m-group" data-g="'+g.name+'">';
    for(const item of g.items){
      const val = c[item.key];
      const hide = item.showIf && !c[item.showIf];
      html += '<div class="cfg-m-row'+(hide?' cfg-m-hidden':'')+'" data-key="'+item.key+'" data-showif="'+(item.showIf||'')+'">';
      html += '<div class="cfg-m-label">'+item.label;
      if(item.desc) html += '<div class="cfg-m-desc">'+item.desc+'</div>';
      html += '</div>';
      html += '<div class="cfg-m-ctrl">';
      if(item.type === 'toggle'){
        html += '<input type="checkbox" '+(val?'checked':'')+' class="cfg-toggle" data-key="'+item.key+'"><label></label>';
      } else if(item.type === 'select'){
        html += '<select class="cfg-select" data-key="'+item.key+'">';
        for(const o of item.opts) html += '<option value="'+o.v+'"'+(String(val)===o.v?' selected':'')+'>'+o.t+'</option>';
        html += '</select>';
      } else if(item.type === 'range'){
        html += '<input type="range" class="cfg-range" data-key="'+item.key+'" data-unit="'+escapeHtml(item.unit||'')+'" min="'+item.min+'" max="'+item.max+'" step="'+item.step+'" value="'+val+'">';
        html += '<span class="cfg-range-val">'+val+(item.unit||'')+'</span>';
      }
      html += '</div></div>';
    }
    html += '</div>';
  }
  html += '</div></div>';
  body.innerHTML = html;

  // 绑定事件
  body.querySelectorAll('.cfg-toggle').forEach(el => {
    el.addEventListener('change', () => {
      pcSave({ [el.dataset.key]: el.checked });
      toggleCfgShowIf();   // 联动：autoNext 关闭时隐藏「跳转延迟」
    });
  });
  body.querySelectorAll('.cfg-select').forEach(el => {
    el.addEventListener('change', () => pcSave({ [el.dataset.key]: parseInt(el.value,10) }));
  });
  body.querySelectorAll('.cfg-range').forEach(el => {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      pcSave({ [el.dataset.key]: v });
      el.nextElementSibling.textContent = v + (el.dataset.unit || '');
    });
  });
  // 左侧分类键点击切换（默认激活第一个分类「答题」）
  body.querySelectorAll('.cfg-m-cat').forEach(el => {
    el.addEventListener('click', () => switchCfgCat(el.dataset.cat));
  });
  switchCfgCat(groups[0].name);
}

// 点击左侧分类键 → 高亮该分类，仅显示对应模块设置
function switchCfgCat(name){
  document.querySelectorAll('.cfg-m-cat').forEach(el => el.classList.toggle('active', el.dataset.cat === name));
  document.querySelectorAll('.cfg-m-group').forEach(el => el.classList.toggle('active', el.dataset.g === name));
}

// 联动：根据 showIf 依赖显隐（如「自动进入下一题」关闭 → 隐藏「跳转延迟」）
function toggleCfgShowIf(){
  document.querySelectorAll('.cfg-m-row[data-showif]').forEach(row => {
    const depKey = row.dataset.showif;
    if(!depKey) return;
    row.classList.toggle('cfg-m-hidden', !pc()[depKey]);
  });
}

// ======= 开始练习 =======
function startPractice(mode){
  if(DATA.words.length === 0){ toast('词库为空，先去「我的词库」添加单词'); return; }
  if(['seeWord','hearMeaning','dictation'].includes(mode) && DATA.words.length < 2){ toast('该模式需要至少 2 个单词'); return; }
  const c = pc();
  pq = { mode, queue: [], idx: 0, total: 0, correct: 0, revealed: false, answer: null, wrongList: [],
         mastery: {}, retrying: false, reviewQueue: [], countedWords: {}, correctWords: {}, missed: {} };
  if(mode === 'flashcard'){ startReview(); return; }
  if(mode === 'mc'){ startMcReview(); return; }
  // 出题：按配置选词
  let pool = DATA.words.slice();
  if(c.shuffle) pool = shuffle(pool);
  if(c.batchSize > 0 && pool.length > c.batchSize) pool = pool.slice(0, c.batchSize);
  pq.queue = pool;
  $('#modeSelect').hidden = true;
  $('#practiceArea').hidden = false;
  $('#progBarWrap').hidden = false;
  nextQuestion();
}

// 复习单词（间隔重复）：先算今日待复习，再闪卡复习
function startReview(){
  const due = dueWords();
  $('#modeSelect').hidden = true;
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

// ======= 墨墨式记忆曲线复习（独立模式 mc）=======
function startMcReview(){
  const due = mcDueWords();
  $('#modeSelect').hidden = true;
  $('#practiceArea').hidden = false;
  $('#nextBtn').hidden = true;
  $('#progBarWrap').hidden = true;
  if(due.length === 0){
    $('#practiceScore').textContent = '';
    $('#practiceBody').innerHTML = '<div class="q-word">🎉 今天没有待复习的词</div>' +
      '<div class="q-cn">按记忆曲线自动排程，去「我的词库」加词或明天再来。</div>';
    return;
  }
  pq.dueList = due;
  pq.queue = shuffle(due.slice());
  showMcDueList();
}
function showMcDueList(){
  const list = pq.dueList;
  const byDiff = {};
  list.forEach(w => { const d = w.mcDiff||5; byDiff[d] = (byDiff[d]||0)+1; });
  const diffInfo = Object.keys(byDiff).sort((a,b)=>a-b).map(d => '难度'+d+' '+byDiff[d]+' 个').join(' · ');
  $('#practiceScore').textContent = '待复习 '+list.length+' 个';
  $('#practiceBody').innerHTML =
    '<div class="q-word">今日待复习 '+list.length+' 个</div>' +
    '<div class="q-cn">难度分布：'+(diffInfo||'新词')+'</div>' +
    '<div style="margin-top:12px;text-align:left;max-height:320px;overflow:auto">' +
      list.map(w => '<div class="list-item"><span><strong>'+escapeHtml(w.en)+'</strong>'+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+'</span><span class="badge">难度'+(w.mcDiff||'新')+'</span></div>').join('') +
    '</div>' +
    '<button class="btn btn-primary" id="startReview" style="margin-top:14px">开始复习</button>';
  $('#startReview').addEventListener('click', () => { $('#practiceBody').innerHTML=''; nextQuestion(); });
}
function mcDueWords(){
  const today = todayKey();
  return DATA.words.filter(w => !w.mcDue || w.mcDue <= today);
}

function resetPractice(){
  cancelSpeak();
  pq = null;
  $('#practiceArea').hidden = true;
  $('#progBarWrap').hidden = true;
  $('#modeSelect').hidden = false;
  $('#nextBtn').hidden = true;
}

// 自动进入下一题（答对时调用）
function autoAdvance(){
  if(!pq || !pq.revealed) return;
  const c = pc();
  if(!c.autoNext) { $('#nextBtn').hidden = false; return; }
  $('#nextBtn').hidden = true;
  const idx = pq.idx;  // Bug9：记录本次题目索引，避免用户手动切题后定时器仍误增 idx 跳过题目
  setTimeout(() => { if(pq && pq.revealed && pq.idx === idx){ pq.idx++; nextQuestion(); } }, c.autoNextDelay);
}

function nextQuestion(){
  if(!pq) return;
  cancelSpeak();
  $('#nextBtn').hidden = true;
  const body = $('#practiceBody');
  const mode = pq.mode;
  updateScore();
  updateProgBar();
  if(mode === 'corpus'){
    body.innerHTML = '<div style="width:100%;max-height:360px;overflow:auto;text-align:left">' + DATA.words.map(w =>
      '<div class="list-item"><span><strong>'+escapeHtml(w.en)+'</strong></span><span>'+escapeHtml(w.cn)+'</span></div>'
    ).join('') + '</div>';
    return;
  }
  if(pq.idx >= pq.queue.length){ finishPractice(); return; }
  pq.revealed = false;
  const cur = pq.queue[pq.idx];
  const c = pc();
  // 爱听写式：每做满 3 道新题，把一个「未掌握」的错词插回队列（做几道新题后错题回来）
  if(['seeWord','hearMeaning'].includes(mode) && !pq.retrying && pq.reviewQueue.length && pq.idx > 0 && pq.idx % 3 === 0){
    const rw = pq.reviewQueue.shift();
    if(rw) pq.queue.splice(pq.idx + 1, 0, rw);
  }

  if(mode === 'mc'){
    body.innerHTML = '<div class="q-word">'+escapeHtml(cur.en)+'</div>' +
      (c.showCn ? '<div class="q-cn">'+escapeHtml(cur.cn||'')+'</div>' : '<button class="btn" id="revealBtn">显示释义</button>') +
      '<div id="flashAns" style="margin-top:10px;color:var(--muted);font-size:18px"></div>' +
      '<div id="judge" style="margin-top:14px;display:'+(c.showCn?'flex':'none')+';gap:10px;justify-content:center">' +
        '<button class="btn btn-med" id="knownBtn">✅ 认识</button>' +
        '<button class="btn btn-warn" id="fuzzyBtn">🤔 模糊</button>' +
        '<button class="btn btn-danger" id="unknownBtn">❌ 不认识</button>' +
      '</div>';
    if(!c.showCn){
      $('#revealBtn').addEventListener('click', () => {
        $('#flashAns').textContent = cur.cn || '';
        $('#judge').style.display = 'flex';
        $('#revealBtn').hidden = true;
      });
    }
    $('#knownBtn').addEventListener('click', () => applyMc(cur, 'known'));
    $('#fuzzyBtn').addEventListener('click', () => applyMc(cur, 'fuzzy'));
    $('#unknownBtn').addEventListener('click', () => applyMc(cur, 'unknown'));
    return;
  }

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
        $('#flashAns').textContent = cur.cn || '';
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
    $('#opts').innerHTML = opts.map((o,i) => '<button class="opt" data-en="'+escapeHtml(o.en)+'"><span class="opt-cn">'+escapeHtml(o.cn)+'</span><span class="opt-key">'+(i+1)+'</span></button>').join('')
      + '<button class="opt opt-unknown" id="unknownBtn" style="grid-column:1/-1;margin-top:6px">🙈 不认识（'+(opts.length+1)+'·不计正确率）</button>';
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
    $('#opts').innerHTML = opts.map((o,i) => '<button class="opt" data-en="'+escapeHtml(o.en)+'"><span class="opt-cn">'+escapeHtml(o.cn)+'</span><span class="opt-key">'+(i+1)+'</span></button>').join('')
      + '<button class="opt opt-unknown" id="unknownBtn" style="grid-column:1/-1;margin-top:6px">🙈 不认识（'+(opts.length+1)+'·听不出词义）</button>';
    $('#playBtn').addEventListener('click', () => speakN(cur.en));
    speakN(cur.en);
    bindOpts(cur);
    $('#unknownBtn').addEventListener('click', () => markUnknown(cur));
  } else if(mode === 'dictation'){
    pq.answer = cur;
    renderDictCard(body, cur);
  }
}

// ======= 选择题选项绑定（爱听写式错题循环）=======
function bindOpts(correct){
  const c = pc();
  document.querySelectorAll('#opts .opt').forEach(b => {
    if(b.id === 'unknownBtn') return;
    b.addEventListener('click', () => {
      if(pq.revealed) return;
      const key = correct.en;
      const ok = b.dataset.en === key;
      // 视觉反馈：标红错项、高亮正确项、禁用所有选项
      if(ok){ b.classList.add('correct'); } else { b.classList.add('wrong'); }
      document.querySelectorAll('#opts .opt').forEach(x => { if(x.dataset.en === key) x.classList.add('correct'); });
      document.querySelectorAll('#opts .opt').forEach(x => { x.style.pointerEvents = 'none'; });
      const ub = document.getElementById('unknownBtn');
      if(ub) ub.style.pointerEvents = 'none';
      if(!ok && !c.showCn && c.showEn === 1){
        const hint = document.createElement('div');
        hint.className = 'opt-hint';
        hint.innerHTML = '正确答案：<b>'+escapeHtml(correct.en)+'</b>';
        $('#opts').appendChild(hint);
      }
      pq.revealed = true; updateScore();

      // 该词是否已进入错题循环（曾被答错且未达 3 连对）——立即重试 / 间隔复习 都走这里
      if(pq.missed && pq.missed[key] && !((pq.mastery||{})[key] >= 3)){
        cycleAnswer(key, correct, ok);
        return;
      }

      // 首次作答（新词）：只计一次，避免重试虚高正确率
      if(!pq.countedWords) pq.countedWords = {};
      if(!pq.countedWords[key]){ pq.countedWords[key] = true; pq.total++; }
      if(ok){
        if(!pq.correctWords) pq.correctWords = {};
        if(!pq.correctWords[key]){ pq.correctWords[key] = true; pq.correct++; }
        autoAdvance();
      } else {
        // 首次答错 → 进入错题循环（停顿 1.5s 后同题重测、选项换位）
        if(!pq.mastery) pq.mastery = {};
        pq.retrying = true;
        pq.mastery[key] = 0;
        if(!pq.missed) pq.missed = {};
        pq.missed[key] = true;
        if(!pq.wrongList) pq.wrongList = [];
        pq.wrongList.push({ en:key, cn:correct.cn||'', user:(b.querySelector('.opt-cn') ? b.querySelector('.opt-cn').textContent : ''), skipped:false });
        setTimeout(() => retrySameWord(correct), 1500);
      }
    });
  });
}

// 爱听写式：错题循环中的一次作答（立即重试 / 间隔复习 共用）
// 连续正确计数 mastery[key]，满 3 即过关；任何一次答错清零并立即重试
function cycleAnswer(key, correct, ok){
  if(ok){
    pq.mastery[key] = (pq.mastery[key]||0) + 1;
    if(pq.mastery[key] >= 3){
      pq.retrying = false;
      toast('✓ 已掌握：'+key);
      autoAdvance();
    } else {
      pq.retrying = false;
      if(!pq.reviewQueue) pq.reviewQueue = [];
      // 推入复习队列：做几道新题后由 nextQuestion 间隔插回（去重，避免堆积）
      if(!pq.reviewQueue.some(w => w.en === key)) pq.reviewQueue.push(correct);
      autoAdvance();
    }
  } else {
    pq.mastery[key] = 0;
    pq.retrying = true;
    setTimeout(() => retrySameWord(correct), 1500);
  }
}

// 不认识：等同答错 —— 进入错题循环（停顿 1.5s 后同题重测）
function markUnknown(correct){
  if(!pq || pq.revealed) return;
  const key = correct.en;
  document.querySelectorAll('#opts .opt').forEach(x => { if(x.dataset.en === key) x.classList.add('correct'); x.style.pointerEvents = 'none'; });
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.classList.add('wrong'); ub.disabled = true; }
  pq.revealed = true;
  // 首次作答只计一次 total（重试不重复计）
  if(!pq.countedWords) pq.countedWords = {};
  if(!pq.countedWords[key]){ pq.countedWords[key] = true; pq.total++; }
  // 进入错题循环
  pq.retrying = true;
  pq.mastery[key] = 0;
  if(!pq.missed) pq.missed = {};
  if(!pq.missed[key]){
    pq.missed[key] = true;
    if(!pq.wrongList) pq.wrongList = [];
    pq.wrongList.push({ en:key, cn:correct.cn||'', user:'（不认识）', skipped:true });
  }
  updateScore();
  toast('已记为不认识：'+correct.en+' · '+correct.cn);
  setTimeout(() => retrySameWord(correct), 1500);
}

// 爱听写式：用同一道题重新渲染（选项 shuffle 换位），供选错 / 不认识后调用
function retrySameWord(cur){
  if(!pq) return;
  const mode = pq.mode;
  const key = cur.en;
  if(!['seeWord','hearMeaning'].includes(mode)){
    pq.revealed = false; pq.retrying = false; nextQuestion(); return;
  }
  cancelSpeak();
  $('#nextBtn').hidden = true;
  const body = $('#practiceBody');
  const c = pc();
  pq.revealed = false;
  pq.answer = cur;
  const optN = Math.min(c.optCount, DATA.words.length);
  const opts = shuffle([cur, ...pickWrong(cur, optN-1)]);
  const m = (pq.mastery && pq.mastery[key]) || 0;
  let html;
  if(mode === 'seeWord'){
    html = '<div class="q-word">'+escapeHtml(cur.en)+'</div>';
    if(c.showCn) html += '<div class="q-cn muted" style="font-size:14px">'+escapeHtml(cur.cn||'')+'</div>';
  } else {
    html = '<button class="btn btn-play-large" id="playBtn">🔊 播放读音</button>';
    if(c.showCn) html += '<div class="q-cn muted" style="font-size:14px;margin-top:8px">'+escapeHtml(cur.cn||'')+'</div>';
  }
  html += '<div style="text-align:center;font-size:12px;margin-top:8px;color:var(--warn)">⚠️ 再试一次（已连对 '+m+'/3 次）</div>';
  html += '<div class="options" id="opts" style="margin-top:14px"></div>';
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map((o,i) =>
    '<button class="opt" data-en="'+escapeHtml(o.en)+'"><span class="opt-cn">'+escapeHtml(o.cn)+'</span><span class="opt-key">'+(i+1)+'</span></button>'
  ).join('') + '<button class="opt opt-unknown" id="unknownBtn" style="grid-column:1/-1;margin-top:6px">🙈 不认识</button>';
  if(mode === 'hearMeaning'){
    $('#playBtn').addEventListener('click', () => speakN(cur.en));
    speakN(cur.en);
  }
  bindOpts(cur);
  $('#unknownBtn').addEventListener('click', () => markUnknown(cur));
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
  $('#flashAns').textContent = w.cn || '';
  $('#judge').style.display = 'none';
  $('#revealBtn').hidden = true;
  $('#nextBtn').hidden = false; updateScore();
  toast(known ? ('已记为认识，下次复习 '+w.srsDue) : '已记为不认识，明天再练');
}

// ======= 墨墨式：三档自测反馈（认识 / 模糊 / 不认识）=======
function applyMc(w, grade){            // grade: 'known' | 'fuzzy' | 'unknown'
  if(pq.revealed) return;
  pq.revealed = true; pq.total++;
  const today = todayKey();
  if(!w.mcDiff) w.mcDiff = 5;          // 默认中等难度
  if(!w.mcEase) w.mcEase = 2.5;
  if(grade === 'known'){
    pq.correct++;
    w.mcStreak = (w.mcStreak||0) + 1;
    w.mcInterval = w.mcInterval
      ? Math.round(w.mcInterval * w.mcEase)          // 非首次：按倍数拉长
      : MC_FIRST[w.mcDiff];                           // 首次：按难度给首间隔
    w.mcEase = Math.min(3.0, w.mcEase + 0.1);        // 越记越牢，增长越快
    if(w.mcStreak % 3 === 0) w.mcDiff = Math.max(1, w.mcDiff - 1); // 连对→降难度
  } else if(grade === 'fuzzy'){
    w.mcStreak = 0;
    w.mcDiff  = Math.min(10, w.mcDiff + 1);
    w.mcEase  = 2.0;
    w.mcInterval = Math.min(w.mcInterval || 3, 3);    // 模糊→收敛约3天，不膨胀
  } else { // unknown
    w.mcStreak = 0;
    w.mcDiff  = Math.min(10, w.mcDiff + 2);           // 比想象中难→升难度
    w.mcEase  = 2.5;
    w.mcInterval = 1;                                 // 不认识→明天再来
    w.mcLapses = (w.mcLapses||0) + 1;
  }
  w.mcDue  = addDays(today, w.mcInterval);
  w.mcReps = (w.mcReps||0) + 1;
  w.mcLast = today;
  hubSave();
  $('#flashAns').textContent = w.cn || '';
  $('#judge').style.display = 'none';
  $('#revealBtn').hidden = true;
  $('#nextBtn').hidden = false; updateScore();
  const label = grade==='known' ? '已掌握' : grade==='fuzzy' ? '有点模糊' : '未掌握';
  toast(label + '，下次复习 ' + w.mcDue);
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
var _speakTimers = [];
/* Bug10：集中管理朗读定时器与语音，切题时 cancelSpeak 取消未播放的排队朗读，
   避免上一题的循环朗读跟下一题串台 */
function cancelSpeak(){
  _speakTimers.forEach(t => clearTimeout(t));
  _speakTimers = [];
  try{ window.speechSynthesis.cancel(); }catch(e){}
}
function speakN(text){
  const c = pc();
  cancelSpeak();
  try{
    let n = 0;
    const run = () => {
      if(n++ >= c.repeat) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = c.rate;
      window.speechSynthesis.speak(u);
      const t = setTimeout(run, c.intervalMs);
      _speakTimers.push(t);
    };
    run();
  }catch(e){}
}

function playWord(text){
  const c = pc();
  const rep = dictRepeat();
  cancelSpeak();
  try{
    let n = 0;
    const run = () => {
      if(n++ >= rep) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = c.rate;
      window.speechSynthesis.speak(u);
      const t = setTimeout(run, c.intervalMs);
      _speakTimers.push(t);
    };
    run();
  }catch(e){}
}

function markDictSkip(cur){
  if(pq.revealed) return;
  pq.revealed = true; pq.total++;
  cancelSpeak();
  showDictResult(cur, '', false, true);
}

function checkDictation(cur){
  if(pq.revealed) return; pq.revealed = true; pq.total++;
  cancelSpeak();
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
  if(!ok) pq.wrongList.push({ en:cur.en, cn:cur.cn||'', user: userVal, skipped });

  // 逐字母比对
  let charHtml;
  if(skipped){
    charHtml = '';
  } else if(ok){
    charHtml = '<div class="spell-row">' +
      cur.en.split('').map(ch => '<span class="ch correct">'+escapeHtml(ch)+'</span>').join('') +
      '</div>';
  } else {
    // Bug19：用 LCS 对齐参考词与用户拼写，准确标出 匹配 / 多写 / 漏写 的字母
    const ref = cur.en.split(''), usr = userVal.split('');
    const aligned = lcsSpell(ref, usr);
    charHtml = '<div class="spell-row">' + aligned.map(x => {
      if(x.ok) return '<span class="ch correct">'+escapeHtml(x.usr)+'</span>';
      if(x.missing) return '<span class="ch miss">'+escapeHtml(x.ref)+'</span>';
      return '<span class="ch wrong">'+escapeHtml(x.usr)+'</span>';
    }).join('') + '</div>';
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
        <div class="dict-ans-cn">${escapeHtml(cur.cn||'')}</div>
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

/* 听写拼写比对：基于最长公共子序列（LCS）对齐参考词与用户拼写，
   逐字母标出 匹配 / 多写(extra) / 漏写(missing)，比逐位贪心比对更准确（Bug19） */
function lcsSpell(refArr, usrArr){
  const a = refArr.map(c => c.toLowerCase());
  const b = usrArr.map(c => c.toLowerCase());
  const n = a.length, m = b.length;
  const dp = Array.from({length: n+1}, () => new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
    dp[i][j] = (a[i]===b[j]) ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const res = [];
  let i=0, j=0;
  while(i<n && j<m){
    if(a[i]===b[j]){ res.push({ ok:true, usr: usrArr[j], ref: refArr[i] }); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ res.push({ ok:false, missing:true, ref: refArr[i] }); i++; }
    else { res.push({ ok:false, extra:true, usr: usrArr[j] }); j++; }
  }
  while(i<n){ res.push({ ok:false, missing:true, ref: refArr[i] }); i++; }
  while(j<m){ res.push({ ok:false, extra:true, usr: usrArr[j] }); j++; }
  return res;
}
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
            '<span><b style="font-size:15px">'+escapeHtml(w.en)+'</b>'+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+'</span>' +
            '<span style="text-align:right">'+(w.skipped?'<span class="badge down">跳过</span>':('<span class="muted" style="font-size:12px">你写：'+escapeHtml(w.user||'(空)')+'</span>'))+'</span>' +
            '<span class="list-actions"><button class="btn btn-sm" data-replay="'+i+'">🔊</button></span>' +
          '</div>').join('') + '</div></div>';
    }
  } else {
    bodyHtml = '<div class="q-word">练习完成 🎉</div>' +
      '<div class="q-cn">正确率 '+acc+'%（'+pq.correct+'/'+pq.total+'）· 待加强 '+unknown+'</div>';
    if(wrong.length){
      bodyHtml += '<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">' +
        '<h3 style="margin:0 0 10px;color:var(--danger)">错词列表（'+wrong.length+' 个）</h3><div>' + wrong.map((w,i) => {
          const mast = (pq.mastery && pq.mastery[w.en]) || 0;
          const mastTag = mast >= 3
            ? '<span class="badge" style="background:var(--primary-soft);color:var(--med)">✓ 已掌握</span>'
            : '<span class="badge" style="background:rgba(245,158,11,.16);color:var(--warn)">连对 '+mast+'/3</span>';
          return '<div class="list-item">' +
            '<span><b style="font-size:15px">'+escapeHtml(w.en)+'</b> '+mastTag+(w.cn?' <span class="muted">'+escapeHtml(w.cn)+'</span>':'')+'</span>' +
            '<span style="text-align:right"><span class="muted" style="font-size:12px">'+escapeHtml(w.user||'')+'</span></span>' +
            '<span class="list-actions"><button class="btn btn-sm" data-replay="'+i+'">🔊</button></span>' +
          '</div>';
        }).join('') + '</div></div>';
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
    pq = { mode, queue: shuffle(wrong.slice()), idx: 0, total: 0, correct: 0, revealed: false, answer: null, wrongList: [],
           mastery: {}, retrying: false, reviewQueue: [], countedWords: {}, correctWords: {}, missed: {} };
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
  // 从词库中随机挑选 n 个与正确答案不同的干扰项
  const seen = new Set([correct.en.toLowerCase()]);
  const pool = shuffle(DATA.words.filter(w => !seen.has(w.en.toLowerCase())));
  const uniq = [];
  for(const w of pool){
    if(seen.has(w.en.toLowerCase())) continue;
    seen.add(w.en.toLowerCase());
    uniq.push(w);
    if(uniq.length >= n) break;
  }
  return uniq;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function speak(text, lang){ try{ const u=new SpeechSynthesisUtterance(text); u.lang=lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(e){} }
