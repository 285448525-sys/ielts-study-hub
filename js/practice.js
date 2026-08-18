var pq = null; // {mode, queue, idx, total, correct, revealed, answer, wrongList}
var _speakTimers = []; // 朗读定时器，必须在 ready() 前初始化；ready() 在 defer 阶段会同步执行 autoStartSeeWord

// 间隔重复（记忆曲线）各阶段间隔，单位：天；数组索引 = 记忆阶段
var SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];

// 墨墨式：单词难度(1易~10难) → 首次「认识」后的复习间隔(天)
// 越简单首间隔越长，越难越短（贴合墨墨：认识简单词≈60天 / 难词≈1天）
var MC_FIRST = {1:60,2:40,3:25,4:16,5:10,6:7,7:5,8:3,9:2,10:1};

// ======= 全局练习配置（爱听写风格：一切可自定义）=======
var PC_DEFAULTS = {
  rate: 0.9,          // 语速
  repeat: 1,          // 朗读次数（选择题默认1）
  intervalMs: 1800,   // 朗读间隔
  batchSize: -1,      // 题量: -1=全部, 5, 10, 20
  shuffle: true,      // 乱序
  autoNext: true,     // 答对自动下一题
  autoNextDelay: 1000, // 自动下一题延迟ms
  autoPlay: true,     // 自动播放下题读音
  showCn: false,      // 显示释义提示
  showEn: 0,          // 显示英文原词: 0=不显示, 1=答错时显示, 2=始终显示
  optCount: 4,        // 选择题选项数量
  wrongHoldMs: 2500   // 答错/不认识后停留毫秒（给记忆时间），范围 1000~5000
};
function pc(){
  if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
  if(!DATA.settings.practiceCfg || typeof DATA.settings.practiceCfg !== 'object') DATA.settings.practiceCfg = {};
  const raw = DATA.settings.practiceCfg;
  const c = Object.assign({}, PC_DEFAULTS, raw);
  // 清洗损坏配置（localStorage 异常写入/旧版残留可能把数字存成字符串或 NaN）
  const clampNum = (v, min, max, def) => {
    const n = (typeof v === 'number' && !isNaN(v)) ? v : (typeof v === 'string' ? parseFloat(v) : NaN);
    return (isNaN(n) || n < min || (max !== null && n > max)) ? def : n;
  };
  c.rate = clampNum(c.rate, 0.1, 3, PC_DEFAULTS.rate);
  c.repeat = clampNum(c.repeat, 1, 20, PC_DEFAULTS.repeat);
  c.intervalMs = clampNum(c.intervalMs, 100, 60000, PC_DEFAULTS.intervalMs);
  c.batchSize = (typeof c.batchSize === 'number' && !isNaN(c.batchSize)) ? c.batchSize : (typeof c.batchSize === 'string' ? parseInt(c.batchSize, 10) : PC_DEFAULTS.batchSize);
  if(isNaN(c.batchSize)) c.batchSize = PC_DEFAULTS.batchSize;
  c.shuffle = !!c.shuffle;
  c.autoNext = !!c.autoNext;
  c.autoNextDelay = clampNum(c.autoNextDelay, 100, 30000, PC_DEFAULTS.autoNextDelay);
  c.autoPlay = !!c.autoPlay;
  c.showCn = !!c.showCn;
  c.showEn = clampNum(c.showEn, 0, 2, PC_DEFAULTS.showEn);
  c.optCount = clampNum(c.optCount, 2, 10, PC_DEFAULTS.optCount);
  c.wrongHoldMs = clampNum(c.wrongHoldMs, 1000, 5000, PC_DEFAULTS.wrongHoldMs);
  return c;
}
function pcSave(obj){
  if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
  DATA.settings.practiceCfg = Object.assign(pc(), obj);
  hubSave();
}

// ======= 单词/词库 标签切换 =======
function switchWordTab(tab){
  const study = document.getElementById('studyView');
  const bank  = document.getElementById('bankView');
  if(!study || !bank) return;
  document.querySelectorAll('.wtab').forEach(b => b.classList.toggle('active', b.dataset.wtab === tab));
  if(tab === 'bank'){
    study.hidden = true; bank.hidden = false;
    renderWords();   // 切到词库时刷新（可能在别处新增/删除了单词）
  } else {
    bank.hidden = true; study.hidden = false;
    // 切回学习 tab 时若练习状态丢失/空白，自动重新进入练习
    if(!pq || !pq.queue || pq.queue.length === 0 || !$('#practiceBody').innerHTML.trim()){
      autoStartSeeWord();
    }
  }
}

ready(() => {
  // 标签切换
  document.querySelectorAll('.wtab').forEach(b => {
    b.addEventListener('click', () => switchWordTab(b.dataset.wtab));
  });
  $('#exitPractice').addEventListener('click', autoStartSeeWord);
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
  // 底部工具栏：🔊 再读
  $('#toolSpeaker').addEventListener('click', () => {
    if(!pq || !pq.answer) return;
    speakN(pq.answer.en);
  });
  // 打开即进入看词选义
  autoStartSeeWord();
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
        { key:'batchSize',     label:'题量',          type:'batch', presets:[{v:'5',t:'5 题'},{v:'10',t:'10 题'},{v:'20',t:'20 题'},{v:'50',t:'50 题'},{v:'100',t:'100 题'},{v:'-1',t:'全部'}] },
        { key:'optCount',      label:'选项数量',      type:'select', opts:[{v:'4',t:'4 个'},{v:'6',t:'6 个'}] },
        { key:'shuffle',       label:'随机乱序',      type:'toggle' },
        { key:'wrongHoldMs',   label:'答错停留',      type:'range', min:1000, max:5000, step:500, unit:'ms' },
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
      } else if(item.type === 'batch'){
        // 题量：预设下拉（含「全部」） + 自定义数字输入
        const presets = item.presets || [];
        const isPreset = presets.some(p => String(p.v) === String(val));
        html += '<select class="cfg-batch-select" data-key="'+item.key+'">';
        for(const p of presets) html += '<option value="'+p.v+'"'+(String(val)===p.v?' selected':'')+'>'+p.t+'</option>';
        html += '<option value="__custom__"'+(isPreset?'':' selected')+'>自定义…</option>';
        html += '</select>';
        html += '<input type="number" min="1" class="cfg-batch-custom" data-key="'+item.key+'" placeholder="自定义题量" value="'+(isPreset?'':escapeHtml(String(val)))+'">';
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
  // 题量：预设下拉 + 自定义数字输入
  body.querySelectorAll('.cfg-batch-select').forEach(el => {
    el.addEventListener('change', () => {
      if(el.value === '__custom__'){
        const inp = el.parentElement.querySelector('.cfg-batch-custom');
        if(inp) inp.focus();
        return; // 自定义项不立即保存，等用户在数字框输入
      }
      pcSave({ [el.dataset.key]: parseInt(el.value,10) });
      const inp = el.parentElement.querySelector('.cfg-batch-custom');
      if(inp) inp.value = '';   // 选了预设就清空自定义框
    });
  });
  body.querySelectorAll('.cfg-batch-custom').forEach(el => {
    el.addEventListener('input', () => {
      const n = parseInt(el.value,10);
      if(isNaN(n) || n < 1) return;   // 无效（空/负数）不保存
      pcSave({ [el.dataset.key]: n });
      const sel = el.parentElement.querySelector('.cfg-batch-select');
      if(sel && sel.value !== '__custom__') sel.value = '__custom__';  // 数字框有值 → 下拉切到「自定义」
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

// ======= 打开即进入「看词选义」：按记忆曲线到期词出题 =======
function autoStartSeeWord(){
  try{
    cancelSpeak();
    // 强制重置 UI 状态，避免异常状态残留（如空白页+下一题按钮可见）
    const area = $('#practiceArea'); if(area) area.hidden = false;
    const nextBtn = $('#nextBtn'); if(nextBtn) nextBtn.hidden = true;
    const score = $('#practiceScore'); if(score) score.textContent = '';
    const prog1 = $('#progBarWrap'); if(prog1) prog1.hidden = true;
    const prog2 = $('#progBarWrapBottom'); if(prog2) prog2.hidden = true;

    if(!Array.isArray(DATA.words) || DATA.words.length === 0){
      $('#dueBanner').hidden = true;
      $('#practiceBody').innerHTML = '<div class="q-word">词库为空</div><div class="q-cn">点上方「词库」标签加词后再来练习。</div>';
      return;
    }
    if(DATA.words.length < 2){
      $('#dueBanner').hidden = true;
      $('#practiceBody').innerHTML = '<div class="q-word">词库至少需要 2 个单词</div><div class="q-cn">「看词选义」需要选项干扰项，请先加至少 2 个词。</div>';
      return;
    }
    const c = pc();
    const due = mcDueWords();
    pq = { mode:'seeWord', queue:[], idx:0, total:0, correct:0, revealed:false, answer:null, wrongList:[],
           mastery:{}, retrying:false, reviewQueue:[], countedWords:{}, correctWords:{}, missed:{} };
    $('#dueBanner').hidden = false;
    $('#dueBanner').textContent = '📚 今日待复习 '+due.length+' 个（按记忆曲线自动排程）';
    $('#progBarWrap').hidden = false;
    $('#progBarWrapBottom').hidden = false;
    if(due.length === 0){
      $('#practiceScore').textContent = '';
      $('#practiceBody').innerHTML = '<div class="q-word">🎉 今天没有待复习的词</div>' +
        '<div class="q-cn">点上方「词库」标签加词，或明天再来。复习会按记忆曲线自动排程。</div>';
      return;
    }
    let pool = shuffle(due.slice());
    if(c.batchSize > 0 && pool.length > c.batchSize) pool = pool.slice(0, c.batchSize);
    pq.queue = pool;
    nextQuestion();
  }catch(err){
    console.error('[practice] autoStartSeeWord 失败', err);
    const nextBtn2 = $('#nextBtn'); if(nextBtn2) nextBtn2.hidden = true;
    const prog1e = $('#progBarWrap'); if(prog1e) prog1e.hidden = true;
    const prog2e = $('#progBarWrapBottom'); if(prog2e) prog2e.hidden = true;
    $('#practiceBody').innerHTML = '<div class="q-word">练习加载失败</div>' +
      '<div class="q-cn">'+escapeHtml(String(err && err.message ? err.message : err))+'</div>' +
      '<div style="margin-top:16px"><button class="btn btn-primary" id="retryStart">重试</button></div>';
    const retry = $('#retryStart');
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

function mcDueWords(){
  const today = todayKey();
  return DATA.words.filter(w => w && typeof w.en === 'string' && w.en.trim() !== '' && (!w.mcDue || w.mcDue <= today));
}

function resetPractice(){
  cancelSpeak();
  pq = null;
  autoStartSeeWord();
}

// 自动进入下一题（答对时调用）
// 注意：单词页已移除「下一题」按钮（design/11）。autoNext 时延迟自动跳；
// 若用户旧配置关了 autoNext，则把「不知道」按钮临时变「下一题」兜底，避免无按钮可点。
function autoAdvance(){
  if(!pq || !pq.revealed) return;
  const c = pc();
  const idx = pq.idx;  // 记录本次题目索引，避免用户手动切题后定时器仍误增 idx 跳过题目
  if(c.autoNext){
    setTimeout(() => { if(pq && pq.revealed && pq.idx === idx){ pq.idx++; nextQuestion(); } }, c.autoNextDelay);
  } else {
    const ub = document.getElementById('unknownBtn');
    if(ub){
      ub.className = 'opt-big opt-big-unknown next-mode';
      ub.innerHTML = '下一题 <span class="opt-big-key">快捷键：5</span>';
      ub.disabled = false;
      ub.style.pointerEvents = 'auto';
      const old = ub.onclick;
      ub.onclick = () => { ub.onclick = old; pq.idx++; nextQuestion(); };
    }
  }
}

function nextQuestion(){
  if(!pq) return;
  try{
    cancelSpeak();
    const body = $('#practiceBody');
    updateScore();
    updateProgBar();
    if(pq.idx >= pq.queue.length){ finishPractice(); return; }
    pq.revealed = false;
    const cur = pq.queue[pq.idx];
    if(!cur || cur.en == null || String(cur.en).trim() === ''){
      pq.idx++;
      // 防止整队列都是脏词时无限递归
      if(pq.idx > pq.queue.length || pq.idx > 10000){ finishPractice(); return; }
      nextQuestion();
      return;
    }
    // 错词按各自 gap 插回：gap>0 每过一道新题减1，到0插回当前题之后（一次插一个）
    if(!pq.retrying && pq.reviewQueue.length){
      for(let i = pq.reviewQueue.length - 1; i >= 0; i--){
        const rw = pq.reviewQueue[i];
        if(rw._gap > 0){ rw._gap--; continue; }
        pq.reviewQueue.splice(i, 1);
        pq.queue.splice(pq.idx + 1, 0, rw.word);   // 插回真实词引用（保留对象引用，记忆曲线才写得进真实词）
        break;
      }
    }
    renderQuestion(cur);
  }catch(err){
    console.error('[practice] nextQuestion 失败', err);
    $('#practiceBody').innerHTML = '<div class="q-word">题目渲染失败</div>' +
      '<div class="q-cn">'+escapeHtml(String(err && err.message ? err.message : err))+'</div>' +
      '<div style="margin-top:16px"><button class="btn" id="skipBad">跳过本题</button> <button class="btn btn-primary" id="retryStart2">重新开始</button></div>';
    const skip = $('#skipBad'), retry = $('#retryStart2');
    if(skip) skip.addEventListener('click', () => { if(pq){ pq.idx++; nextQuestion(); } });
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

// 渲染单题（被 nextQuestion 与 replaySameQuestion 复用，便于错词原地重做时复用同一套渲染）
function renderQuestion(cur){
  if(!pq) return;
  const c = pc();
  pq.answer = cur;
  const optN = Math.min(c.optCount, DATA.words.length);
  const opts = shuffle([cur, ...pickWrong(cur, optN-1)]);
  let html = '<div class="practice-word-head">'+
    '<span class="pw-en">'+escapeHtml(cur.en)+'</span>'+
    (cur.ipa ? '<span class="pw-ipa">'+escapeHtml(cur.ipa)+'</span>' : '')+
    '</div>';
  if(cur.cn) html += '<div class="pw-cn" id="pwCn" hidden>'+escapeHtml(cur.cn)+'</div>';
  if(cur.example) html += '<div class="practice-sentence">'+escapeHtml(cur.example).replace(new RegExp('\\b'+escapeRegExp(cur.en)+'\\b'),'<span class="hi">$&</span>')+'</div>';
  html += '<div class="opts-grid" id="opts"></div>';
  const body = $('#practiceBody');
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map((o,i) =>
    '<button class="opt-big" data-en="'+escapeHtml(o.en)+'">'+
      '<span class="opt-big-tag">'+(o.pos||'')+'</span>'+
      '<span class="opt-big-cn">'+escapeHtml(o.cn)+'</span>'+
      '<span class="opt-big-key">快捷键：'+(i+1)+'</span>'+
    '</button>'
  ).join('') +
  '<button class="opt-big opt-big-unknown" id="unknownBtn">不知道 <span class="opt-big-key">快捷键：'+(opts.length+1)+'</span></button>';
  bindOpts(cur);
  $('#unknownBtn').addEventListener('click', () => markUnknown(cur));
  setTimeout(() => speakN(cur.en), 300);  // 新词自动读
}

// 答错/不认识后：停留 wrongHoldMs，然后重渲染同一题（pq.idx 不变，进度/计数不动）
function replaySameQuestion(){
  if(!pq || !pq.answer) return;
  const cur = pq.answer;
  pq.revealed = false;
  renderQuestion(cur);          // 重新渲染同一词，重置选项可点
  setTimeout(() => speakN(cur.en), 300);  // 重做时再读一遍强化
}

// ======= 选择题选项绑定（爱听写式错题循环）=======
function bindOpts(correct){
  const c = pc();
  document.querySelectorAll('#opts .opt-big').forEach(b => {
    if(b.id === 'unknownBtn') return;
    b.addEventListener('click', () => {
      if(pq.revealed) return;
      const key = correct.en;
      const ok = b.dataset.en === key;
      speakN(correct.en);  // 点选项时再读一遍读音（强化听觉记忆）
      // 视觉反馈：标红错项、高亮正确项、禁用所有选项
      if(ok){ b.classList.add('correct'); } else { b.classList.add('wrong'); }
      document.querySelectorAll('#opts .opt-big').forEach(x => { if(x.dataset.en === key) x.classList.add('correct'); });
      document.querySelectorAll('#opts .opt-big').forEach(x => { x.style.pointerEvents = 'none'; });
      const ub = document.getElementById('unknownBtn');
      if(ub) ub.style.pointerEvents = 'none';
      if(!ok && !c.showCn && c.showEn === 1){
        const hint = document.createElement('div');
        hint.className = 'opt-hint';
        hint.innerHTML = '正确答案：<b>'+escapeHtml(correct.en)+'</b>';
        $('#opts').appendChild(hint);
      }
      pq.revealed = true; updateScore();
      const pwCn = document.getElementById('pwCn'); if(pwCn) pwCn.hidden = false;

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
        updateMcCurve(correct, 'known');   // 爱听写「认识」→ 推进共享长线曲线
        toast('已掌握：'+key+'，下次复习 '+correct.mcDue);
        autoAdvance();
      } else {
        // 首次答错 → 标记为错词，mastery 归零，原地重做同题（不推队列、不跳下一题）
        updateMcCurve(correct, 'unknown');
        if(!pq.mastery) pq.mastery = {};
        pq.mastery[key] = 0;              // 连对计数归零
        if(!pq.missed) pq.missed = {};
        pq.missed[key] = true;
        if(!pq.countedWords) pq.countedWords = {};
        if(!pq.countedWords[key]){ pq.countedWords[key] = true; pq.total++; }
        if(!pq.wrongList) pq.wrongList = [];
        // 记录用户答错的选项内容：新选项卡文字在 .opt-big-cn（旧 .opt-cn 兜底）
        const userAns = b.querySelector('.opt-big-cn') || b.querySelector('.opt-cn');
        pq.wrongList.push({ en:key, cn:correct.cn||'', user:userAns ? userAns.textContent : '', skipped:false });
        pq.revealed = true; updateScore();
        const c = pc();
        toast('答错了：'+correct.en+' · '+correct.cn+'，再记一次');
        setTimeout(replaySameQuestion, c.wrongHoldMs);   // ← 停留后原地重做同题（不再跳下一题）
      }
    });
  });
}

// 爱听写式：错题循环中的一次作答（立即重试 / 间隔复习 共用）
// 连续正确计数 mastery[key]，满 3 即过关；任何一次答错清零并立即重试
function cycleAnswer(key, correct, ok){
  // 这是错词循环中的一次作答（首次答错后原地重做 / 间隔复习插回 共用）
  if(ok){
    pq.mastery[key] = (pq.mastery[key]||0) + 1;
    if(pq.mastery[key] >= 3){
      // 连对 3 次 → 本组毕业，不再回来（同时清掉队列里该词的待插回项，避免旧 gap 又插回）
      delete pq.missed[key];
      if(pq.reviewQueue && pq.reviewQueue.length){
        pq.reviewQueue = pq.reviewQueue.filter(w => w.word && w.word.en !== key);
      }
      toast('✓ 该词已练会，不再重复');
    } else {
      // 还没到 3 次：按已对次数设下次间隔（爱听写：第1次对隔3~4题，第2次对隔5~6题）
      const gap = pq.mastery[key] === 1
        ? (3 + Math.floor(Math.random()*2))   // 3~4
        : (5 + Math.floor(Math.random()*2));  // 5~6
      if(!pq.reviewQueue) pq.reviewQueue = [];
      // 包装成 {word,_gap}，保留真实词引用，否则 updateMcCurve 写不进 DATA.words 真实词
      const item = { word: correct, _gap: gap };
      if(!pq.reviewQueue.some(w => w.word && w.word.en === key)) pq.reviewQueue.push(item);
    }
    autoAdvance();   // 答对→正常跳下一题，错词稍后按 gap 回来
  } else {
    // 又答错 → 连对清零 + 立即原地重做同题（不跳题）
    pq.mastery[key] = 0;
    updateMcCurve(correct, 'unknown');   // 重做又错也强化曲线（错词更频繁）
    const c = pc();
    toast('又错了：'+correct.en+'，再记一次');
    setTimeout(replaySameQuestion, c.wrongHoldMs);
  }
}

// 不认识：等同答错 —— 原地重做同题（"下一题还是这题"），答对后按 gap 间隔回来
function markUnknown(correct){
  if(!pq || pq.revealed) return;
  const key = correct.en;
  document.querySelectorAll('#opts .opt-big').forEach(x => { if(x.dataset.en === key) x.classList.add('correct'); x.style.pointerEvents = 'none'; });
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.classList.add('wrong'); ub.disabled = true; }
  pq.revealed = true;
  const pwCn2 = document.getElementById('pwCn'); if(pwCn2) pwCn2.hidden = false;
  // 首次作答只计一次 total（重试不重复计）
  if(!pq.countedWords) pq.countedWords = {};
  if(!pq.countedWords[key]){ pq.countedWords[key] = true; pq.total++; }
  updateMcCurve(correct, 'unknown');   // 爱听写「不认识」→ 重置共享长线曲线
  // 进入错题循环：标记为错词、连对清零，原地重做同题（不再推队列、不跳下一题）
  if(!pq.mastery) pq.mastery = {};
  pq.mastery[key] = 0;
  if(!pq.missed) pq.missed = {};
  if(!pq.missed[key]){
    pq.missed[key] = true;
    if(!pq.wrongList) pq.wrongList = [];
    pq.wrongList.push({ en:key, cn:correct.cn||'', user:'（不认识）', skipped:true });
  }
  updateScore();
  toast('已记为不认识：'+correct.en+' · '+correct.cn+'，再记一次');
  const c = pc();
  setTimeout(replaySameQuestion, c.wrongHoldMs);   // ← "下一题还是这题"
}

// ======= 共享记忆曲线（远线）：默墨(3档) 与 爱听写(2档) 共用同一套 mc* 字段 =======
// grade: 'known' | 'fuzzy' | 'unknown'
// 只算曲线与落库，不含任何模式专属 UI/重测逻辑；两种模式都调用它，记忆曲线因此共通
function updateMcCurve(w, grade){
  const today = todayKey();
  if(!w.mcDiff) w.mcDiff = 5;          // 默认中等难度
  if(!w.mcEase) w.mcEase = 2.5;
  if(grade === 'known'){
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
  return grade==='known' ? '已掌握' : grade==='fuzzy' ? '有点模糊' : '未掌握';
}

// 朗读N次（按全局配置）
/* 集中管理朗读定时器与语音，切题时 cancelSpeak 取消未播放的排队朗读，
   避免上一题的循环朗读跟下一题串台 */
function cancelSpeak(){
  (_speakTimers || []).forEach(t => clearTimeout(t));
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

function finishPractice(){
  const acc = pq.total ? Math.round(pq.correct / pq.total * 100) : 0;
  const unknown = (pq.total||0) - (pq.correct||0);
  const wrong = pq.wrongList || [];
  let bodyHtml = '';
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
      '<button class="btn" id="exitBtn">重新开始</button>' +
      '<button class="btn btn-med" id="redoWrong">🔁 只重练错词</button>' +
      '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  } else {
    bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
      '<button class="btn" id="exitBtn">重新开始</button>' +
      '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  }
  $('#practiceBody').innerHTML = bodyHtml;
  $('#practiceScore').textContent = '';
  $('#progBarWrap').hidden = true;
  // 绑定按钮
  const eb = document.getElementById('exitBtn');
  if(eb) eb.addEventListener('click', resetPractice);
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', () => { autoStartSeeWord(); });
  const rw = document.getElementById('redoWrong');
  if(rw) rw.addEventListener('click', () => {
    const mode = 'seeWord';
    pq = { mode, queue: shuffle(wrong.slice()), idx: 0, total: 0, correct: 0, revealed: false, answer: null, wrongList: [],
           mastery: {}, retrying: false, reviewQueue: [], countedWords: {}, correctWords: {}, missed: {} };
    $('#progBarWrap').hidden = false;
    nextQuestion();
    toast('已进入错词重练：'+wrong.length+' 个词');
  });
  document.querySelectorAll('[data-replay]').forEach(b => {
    b.addEventListener('click', () => {
      const w = wrong[parseInt(b.dataset.replay,10)];
      speakN(w.en);
    });
  });
}

function updateScore(){
  if(!pq || !Array.isArray(pq.queue)) return;
  $('#practiceScore').textContent = '进度 '+(pq.idx+1)+'/'+pq.queue.length+' · 正确 '+pq.correct;
}
function updateProgBar(){
  if(!pq || !Array.isArray(pq.queue) || !pq.queue.length) return;
  const pct = ((pq.idx) / pq.queue.length) * 100;
  $('#progBarFill').style.width = pct + '%';
  const pb2 = $('#progBarFillBottom');
  const pt = $('#progText');
  if(pb2) pb2.style.width = pct + '%';
  if(pt) pt.textContent = (pq.idx+1) + '/' + pq.queue.length;
}

// 记忆曲线工具：addDays / pickWrong / shuffle 等（待复习判定已统一走 mcDueWords → w.mcDue）
function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
function pickWrong(correct, n){
  // 从词库中随机挑选 n 个与正确答案不同的干扰项（容错：跳过 en 缺失/非字符串的脏词）
  const seen = new Set();
  const cEn = (correct.en != null) ? String(correct.en).toLowerCase() : '';
  if(cEn) seen.add(cEn);
  const pool = shuffle(DATA.words.filter(w => {
    const e = (w && w.en != null) ? String(w.en).toLowerCase() : '';
    return e !== '' && !seen.has(e);
  }));
  const uniq = [];
  for(const w of pool){
    const e = (w && w.en != null) ? String(w.en).toLowerCase() : '';
    if(seen.has(e) || e === '') continue;
    seen.add(e);
    uniq.push(w);
    if(uniq.length >= n) break;
  }
  return uniq;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function speak(text, lang){ try{ const u=new SpeechSynthesisUtterance(text); u.lang=lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(e){} }

// 正则转义（例句高亮用：把单词安全地放进 RegExp 里）
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
