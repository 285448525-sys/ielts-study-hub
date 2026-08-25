// =====================================================================
//  单词 · 学习模块（v1.2）—— 与「词库」完全隔离
//  本文件只负责「学习/复习」：当日待复习队列、记忆流程、进度统计。
//  所有单词底层数据来自 DATA.words（与词库共享），但本模块不提供任何
//  增删改查/分组/导入导出等词库管理功能（那些在 words.js / bankView）。
// =====================================================================

var pq = null;            // 学习会话状态（仅内存，不落库）
var _speakTimers = [];    // 朗读定时器，必须在 ready() 前初始化

// 熟练度 0-7 级标准间隔（天）：索引 = 等级
// 0→1天 1→2天 2→4天 3→7天 4→15天 5→30天 6→60天 7→90天
var LEVEL_INTERVAL = [1, 2, 4, 7, 15, 30, 60, 90];

// ======= 全局练习配置（与词库无关）=======
var PC_DEFAULTS = {
  rate: 0.9,
  repeat: 1,
  intervalMs: 1800,
  batchSize: -1,          // -1=全部
  newPerDay: 20,          // 每日新学上限（-1=不限）
  shuffle: true,
  autoNext: true,
  autoNextDelay: 1000,
  autoPlay: true,
  showCn: false,
  showEn: 0,              // 0=不显示 1=答错时显示 2=始终显示
  optCount: 4,
  wrongHoldMs: 2500
};
function pc(){
  if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
  if(!DATA.settings.practiceCfg || typeof DATA.settings.practiceCfg !== 'object') DATA.settings.practiceCfg = {};
  const raw = DATA.settings.practiceCfg;
  const c = Object.assign({}, PC_DEFAULTS, raw);
  const clampNum = (v, min, max, def) => {
    const n = (typeof v === 'number' && !isNaN(v)) ? v : (typeof v === 'string' ? parseFloat(v) : NaN);
    return (isNaN(n) || n < min || (max !== null && n > max)) ? def : n;
  };
  c.rate = clampNum(c.rate, 0.1, 3, PC_DEFAULTS.rate);
  c.repeat = clampNum(c.repeat, 1, 20, PC_DEFAULTS.repeat);
  c.intervalMs = clampNum(c.intervalMs, 100, 60000, PC_DEFAULTS.intervalMs);
  c.batchSize = (typeof c.batchSize === 'number' && !isNaN(c.batchSize)) ? c.batchSize : (typeof c.batchSize === 'string' ? parseInt(c.batchSize, 10) : PC_DEFAULTS.batchSize);
  if(isNaN(c.batchSize)) c.batchSize = PC_DEFAULTS.batchSize;
  c.newPerDay = (typeof c.newPerDay === 'number' && !isNaN(c.newPerDay)) ? c.newPerDay : (typeof c.newPerDay === 'string' ? parseInt(c.newPerDay, 10) : PC_DEFAULTS.newPerDay);
  if(isNaN(c.newPerDay)) c.newPerDay = PC_DEFAULTS.newPerDay;
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

// ======= 单词/词库 标签切换（保留各自独立状态）=======
// 切到「学习」：若会话仍在（pq 有队列且进度未走完）则保留，不强制重开；
// 切到「词库」：仅刷新词库列表，不触碰任何学习状态。
function switchWordTab(tab){
  const study = document.getElementById('studyView');
  const bank  = document.getElementById('bankView');
  if(!study || !bank) return;
  document.querySelectorAll('.wtab').forEach(b => b.classList.toggle('active', b.dataset.wtab === tab));
  if(tab === 'bank'){
    study.hidden = true;  study.style.display = 'none';
    bank.hidden = false;  bank.style.display = '';
    if(window.renderWords) renderWords();   // 词库独立刷新
  } else {
    bank.hidden = true;   bank.style.display = 'none';
    study.hidden = false; study.style.display = '';
    // 学习状态独立保留：仅当会话彻底丢失/空白时才重新进入
    if(!pq || !pq.queue || pq.queue.length === 0 || !$('#practiceBody').innerHTML.trim()){
      autoStartSeeWord();
    }
  }
}

// ======= v1.2 算法：单词字段迁移 / 逾期降级 / 评分 =======

// 把旧 mc* 字段或裸词迁移为 v1.2 字段（幂等：已迁移则跳过）
function ensureWordV12(w){
  if(!w) return w;
  if(w.level != null && w.nextReview != null) return w;
  let level = 0;
  if(w.mcInterval != null){
    let best = 0, bestDiff = 1e9;
    for(let L = 0; L < LEVEL_INTERVAL.length; L++){
      const d = Math.abs(LEVEL_INTERVAL[L] - w.mcInterval);
      if(d < bestDiff){ bestDiff = d; best = L; }
    }
    level = best;
  }
  w.level = (w.level != null) ? w.level : level;
  w.nextReview = (w.nextReview != null) ? toDateKey(w.nextReview) : toDateKey(w.mcDue || todayKey());
  w.errTotal   = (w.errTotal   != null) ? w.errTotal   : (w.mcLapses || 0);
  w.errStreak  = (w.errStreak  != null) ? w.errStreak  : 0;
  w.fuzzyStreak= (w.fuzzyStreak!= null) ? w.fuzzyStreak: 0;
  w.hardWord   = (w.hardWord   != null) ? !!w.hardWord  : false;
  w.okStreak   = (w.okStreak   != null) ? w.okStreak   : (w.mcStreak || 0);
  w.lastReview = (w.lastReview != null) ? toDateKey(w.lastReview) : toDateKey(w.mcLast || null);
  w.keyWord    = (w.keyWord    != null) ? !!w.keyWord   : false;
  return w;
}

// 逾期降级：在「复习前」对该词应用，降级后由 applyGrade 按新等级排程
function applyOverdue(w){
  const today = todayKey();
  if(!w.nextReview || w.nextReview >= today) return;     // 未逾期
  const overdueDays = daysBetween(w.nextReview, today);
  let std = LEVEL_INTERVAL[w.level || 0] || 1;
  if(w.hardWord) std = Math.ceil(std * 0.5);            // 难词×50%
  if(w.keyWord)  std = Math.ceil(std * 0.7);            // 重点×70%（与难词相乘）
  const forget = overdueDays / std;                     // 遗忘系数（分母=当次实际计划间隔）
  let lvl = w.level || 0;
  if(forget < 0.5)        lvl = Math.max(0, lvl - 1);
  else if(forget <= 1)    lvl = Math.max(0, lvl - 2);
  else { // forget >= 1
    if(lvl <= 2) lvl = 0;
    else lvl = Math.max(0, Math.ceil(lvl * 0.4));
  }
  w.level = lvl;
  w.nextReview = today;   // 消费逾期状态：本次复习已计惩罚，避免重复降级；applyGrade 会据此重新排程
  hubSave();
}

// 按档位更新熟练度与排程（grade: 'known' | 'fuzzy' | 'unknown'）
function applyGrade(w, grade){
  const today = todayKey();
  if(grade === 'known'){
    w.level = Math.min(7, (w.level || 0) + 1);
    w.okStreak = (w.okStreak || 0) + 1;
    w.errStreak = 0;
    w.fuzzyStreak = 0;
    if(w.hardWord && w.okStreak >= 3) w.hardWord = false;   // 连续对3次解除难词
    let base = LEVEL_INTERVAL[w.level];
    if(w.hardWord) base = Math.ceil(base * 0.5);            // 难词间隔×50%
    if(w.keyWord)  base = Math.ceil(base * 0.7);            // 重点词间隔×70%
    w.nextReview = addDays(today, Math.max(1, base));
    w.lastReview = today;
  } else if(grade === 'fuzzy'){
    // 等级不变；间隔=当前等级标准×50%向上取整（最短1天）；连续模糊≥3强制-1级并重置计数
    w.fuzzyStreak = (w.fuzzyStreak || 0) + 1;
    w.okStreak = (w.okStreak || 0) + 1;   // 模糊计入答对（难词解除判定用）
    w.errStreak = 0;
    if(w.fuzzyStreak >= 3){ w.level = Math.max(0, (w.level || 0) - 1); w.fuzzyStreak = 0; }
    let base = LEVEL_INTERVAL[w.level || 0];
    let iv = Math.ceil(base * 0.5);
    if(w.hardWord) iv = Math.ceil(iv * 0.5);               // 难词再减半 ×50%
    if(w.keyWord)  iv = Math.ceil(iv * 0.7);               // 重点词再 ×70%（与难词相乘）
    w.nextReview = addDays(today, Math.max(1, iv));
    w.lastReview = today;
  } else { // unknown
    w.level = Math.max(0, (w.level || 0) - 2);
    w.nextReview = addDays(today, 1);
    w.errTotal = (w.errTotal || 0) + 1;
    w.errStreak = (w.errStreak || 0) + 1;
    w.okStreak = 0;
    w.fuzzyStreak = 0;
    if(w.errStreak >= 2 || w.errTotal >= 3) w.hardWord = true;  // 触发高频难词
    w.lastReview = today;
    recordDailyWrong(w.en);
  }
  hubSave();
}

// 记录当日答错词（供次日「前日错当日强制」复习）
function recordDailyWrong(en){
  DATA.dailyWrong = DATA.dailyWrong || {};
  const t = todayKey();
  if(!DATA.dailyWrong[t]) DATA.dailyWrong[t] = [];
  const k = String(en).toLowerCase();
  if(!DATA.dailyWrong[t].includes(k)) DATA.dailyWrong[t].push(k);
}

// ======= 每日队列：按优先级排序 =======
// ①逾期 ②前日错当日强制 ③重点词到期 ④难词到期 ⑤普通到期 ⑥当日新学
function buildQueue(){
  const today = todayKey();
  const c = pc();
  const yest = addDays(today, -1);
  const forced = new Set((DATA.dailyWrong && DATA.dailyWrong[yest]) || []);
  const due = (DATA.words || []).filter(w => {
    if(!w || typeof w.en !== 'string' || w.en.trim() === '') return false;
    ensureWordV12(w);
    return (!w.nextReview || w.nextReview <= today);
  });
  const overdue = [], forcedList = [], keyDue = [], hardDue = [], normal = [], newToday = [];
  due.forEach(w => {
    const k = String(w.en).toLowerCase();
    const isOverdue = w.nextReview && w.nextReview < today;
    if(isOverdue)                       overdue.push(w);
    else if(forced.has(k))              forcedList.push(w);
    else if(w.keyWord)                  keyDue.push(w);
    else if(w.hardWord)                 hardDue.push(w);
    else if(!w.lastReview)              newToday.push(w);   // 未学过
    else                                normal.push(w);
  });
  // 新学：按加入时间顺序（ts 升序），每日上限 newPerDay
  newToday.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if(c.newPerDay && c.newPerDay > 0 && newToday.length > c.newPerDay) newToday = newToday.slice(0, c.newPerDay);
  const sortBucket = arr => arr.sort((a, b) => {
    const oa = a.nextReview ? daysBetween(a.nextReview, today) : 999;
    const ob = b.nextReview ? daysBetween(b.nextReview, today) : 999;
    if(oa !== ob) return ob - oa;                 // 更逾期在前
    return (a.level || 0) - (b.level || 0);      // 同逾期→低等级优先
  });
  [overdue, forcedList, keyDue, hardDue, normal, newToday].forEach(sortBucket);
  return [].concat(overdue, forcedList, keyDue, hardDue, normal, newToday);
}

// ======= 进入学习（打开即按排程出题）=======
function autoStartSeeWord(){
  try{
    cancelSpeak();
    const area = $('#practiceArea'); if(area) area.hidden = false;
    const nextBtn = $('#nextBtn'); if(nextBtn) nextBtn.hidden = true;
    const score = $('#practiceScore'); if(score) score.textContent = '';
    const prog1 = $('#progBarWrap'); if(prog1) prog1.hidden = true;

    if(!Array.isArray(DATA.words) || DATA.words.length === 0){
      $('#practiceBody').innerHTML = '<div class="q-word">词库为空</div><div class="q-cn">切换到「词库」标签添加单词后再来学习。</div>';
      return;
    }
    if(DATA.words.length < 2){
      $('#practiceBody').innerHTML = '<div class="q-word">词库至少需要 2 个单词</div><div class="q-cn">「看词选义」需要选项作干扰项，请先加至少 2 个词。</div>';
      return;
    }
    const c = pc();
    const all = buildQueue();
    pq = { mode:'study', queue:[], idx:0, total:0, correct:0, revealed:false, answer:null, wrongList:[],
           stats:{ known:0, fuzzy:0, unknown:0 }, counted:new Set(), appended:new Set() };
    $('#progBarWrap').hidden = false;
    if(all.length === 0){
      $('#practiceScore').textContent = '';
      $('#practiceBody').innerHTML = '<div class="q-word">🎉 今天没有待复习的词</div>' +
        '<div class="q-cn">去「词库」加词，或明天再来。复习会按记忆曲线自动排程。</div>';
      return;
    }
    let pool = all.slice();
    if(c.shuffle) pool = shuffle(pool);
    if(c.batchSize > 0 && pool.length > c.batchSize) pool = pool.slice(0, c.batchSize);
    pq.queue = pool;
    nextQuestion();
  }catch(err){
    console.error('[practice] autoStartSeeWord 失败', err);
    const nextBtn2 = $('#nextBtn'); if(nextBtn2) nextBtn2.hidden = true;
    const prog1e = $('#progBarWrap'); if(prog1e) prog1e.hidden = true;
    $('#practiceBody').innerHTML = '<div class="q-word">练习加载失败</div>' +
      '<div class="q-cn">' + escapeHtml(String(err && err.message ? err.message : err)) + '</div>' +
      '<div style="margin-top:16px"><button class="btn btn-primary" id="retryStart">重试</button></div>';
    const retry = $('#retryStart');
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

function resetPractice(){
  cancelSpeak();
  pq = null;
  autoStartSeeWord();
}

function nextQuestion(){
  if(!pq) return;
  try{
    cancelSpeak();
    updateScore();
    updateProgBar();
    if(pq.idx >= pq.queue.length){ finishPractice(); return; }
    pq.revealed = false;
    const cur = pq.queue[pq.idx];
    if(!cur || cur.en == null || String(cur.en).trim() === ''){
      pq.idx++;
      if(pq.idx > pq.queue.length + 200){ finishPractice(); return; } // 防脏词死循环
      nextQuestion();
      return;
    }
    renderQuestion(cur);
  }catch(err){
    console.error('[practice] nextQuestion 失败', err);
    $('#practiceBody').innerHTML = '<div class="q-word">题目渲染失败</div>' +
      '<div class="q-cn">' + escapeHtml(String(err && err.message ? err.message : err)) + '</div>' +
      '<div style="margin-top:16px"><button class="btn" id="skipBad">跳过本题</button> <button class="btn btn-primary" id="retryStart2">重新开始</button></div>';
    const skip = $('#skipBad'), retry = $('#retryStart2');
    if(skip) skip.addEventListener('click', () => { if(pq){ pq.idx++; nextQuestion(); } });
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

function renderQuestion(cur){
  if(!pq) return;
  pq.answer = cur;
  ensureWordV12(cur);
  applyOverdue(cur);     // 复习前应用逾期降级
  const c = pc();
  pq.revealed = false;
  const optN = Math.min(c.optCount, DATA.words.length);
  const opts = shuffle([cur, ...pickWrong(cur, optN - 1)]);

  let html = '';
  if(pq.idx > 0){
    const last = pq.queue[pq.idx - 1];
    html += '<div class="last-word">' +
      '<span class="lw-en">' + escapeHtml(last.en) + '</span>' +
      (last.ipa ? '<span class="lw-ipa">' + escapeHtml(last.ipa) + '</span>' : '') +
      (last.cn ? '<span class="lw-cn">' + escapeHtml(last.cn) + '</span>' : '') +
      '</div>';
  }
  html += '<div class="practice-word-head">' +
    '<span class="pw-en">' + escapeHtml(cur.en) + '</span>' +
    (cur.ipa ? '<span class="pw-ipa">' + escapeHtml(cur.ipa) + '</span>' : '') +
    '</div>';
  if(cur.cn) html += '<div class="pw-cn" id="pwCn" hidden>' + escapeHtml(cur.cn) + '</div>';
  if(cur.example) html += '<div class="practice-sentence">' + escapeHtml(cur.example).replace(new RegExp('\\b' + escapeRegExp(cur.en) + '\\b'), '<span class="hi">$&</span>') + '</div>';
  html += '<div class="opts-grid" id="opts"></div>';
  // 双按钮：左=认识/不认识（随选择动态），右=不确定（未选中选项前禁用灰态）
  html += '<div class="answer-btns">' +
    '<button class="abtn abtn-unknown" id="leftBtn">不认识</button>' +
    '<button class="abtn abtn-fuzzy" id="rightBtn" disabled>不确定</button>' +
    '</div>';
  const body = $('#practiceBody');
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map(o =>
    '<button class="opt-big" data-en="' + escapeHtml(o.en) + '">' +
      '<span class="opt-big-tag">' + (o.pos || '') + '</span>' +
      '<span class="opt-big-cn">' + escapeHtml(o.cn) + '</span>' +
    '</button>'
  ).join('');
  pq._picked = false;
  bindOpts(cur);
  // 未选中任何选项前：左按钮即「不认识」直跳（不依赖选项）
  const left0 = document.getElementById('leftBtn');
  if(left0) left0.onclick = () => resolve(cur, 'unknown');
  setTimeout(() => speakN(cur.en), 300);
}

// 选项点击 → 选中（不立即判定），随后双按钮可提交
function bindOpts(cur){
  document.querySelectorAll('#opts .opt-big').forEach(b => {
    b.addEventListener('click', () => {
      if(pq.revealed || pq._picked) return;
      pq._picked = true;
      const ok = b.dataset.en === cur.en;
      speakN(cur.en);
      document.querySelectorAll('#opts .opt-big').forEach(x => {
        if(x.dataset.en === cur.en) x.classList.add('correct');
        x.style.pointerEvents = 'none';
      });
      b.classList.add(ok ? 'correct' : 'wrong');
      const left = document.getElementById('leftBtn');
      const right = document.getElementById('rightBtn');
      // 左按钮随正误动态变「认识/不认识」；右按钮（不确定）此时启用
      if(left){
        if(ok){ left.textContent = '认识'; left.className = 'abtn abtn-known'; }
        else  { left.textContent = '不认识'; left.className = 'abtn abtn-unknown'; }
        left.onclick = () => resolve(cur, ok ? 'known' : 'unknown');
      }
      if(right){ right.disabled = false; right.className = 'abtn abtn-fuzzy'; right.onclick = () => resolve(cur, 'fuzzy'); }
    });
  });
}

// 统一处理一次作答（四选一 或 双按钮）
function resolve(cur, grade){
  if(!pq || pq.revealed) return;
  pq.revealed = true;
  const c = pc();
  // 揭示答案
  document.querySelectorAll('#opts .opt-big').forEach(x => {
    if(x.dataset.en === cur.en) x.classList.add('correct');
    x.style.pointerEvents = 'none';
  });
  const left = document.getElementById('leftBtn');
  const right = document.getElementById('rightBtn');
  if(left){ left.style.pointerEvents = 'none'; left.disabled = true; }
  if(right){ right.style.pointerEvents = 'none'; right.disabled = true; }
  const pwCn = document.getElementById('pwCn'); if(pwCn) pwCn.hidden = false;

  // 每词仅计一次
  const k = String(cur.en).toLowerCase();
  if(!pq.counted) pq.counted = new Set();
  if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }

  // 统计 + 应用算法
  if(grade === 'known'){ pq.correct++; pq.stats.known++; }
  else if(grade === 'fuzzy'){ pq.stats.fuzzy++; }
  else {
    pq.stats.unknown++;
    if(!pq.wrongList) pq.wrongList = [];
    pq.wrongList.push({ en: cur.en, cn: cur.cn || '', user: '(不认识)', grade: 'unknown' });
  }
  applyGrade(cur, grade);

  // 不认识 → 当日队列末尾追加 1 次复习（再错仅更新不重复追加）
  if(grade === 'unknown'){
    if(!pq.appended) pq.appended = new Set();
    if(!pq.appended.has(k)){ pq.appended.add(k); pq.queue.push(cur); }
  }

  updateScore();
  // 反馈
  const msg = grade === 'known'
    ? ('✓ 认识：' + cur.en + (cur.cn ? ' · ' + cur.cn : ''))
    : grade === 'fuzzy'
      ? ('～ 不确定：' + cur.en + '（间隔缩短，下次早点复习）')
      : ('✗ 不认识：' + cur.en + ' · ' + (cur.cn || '') + '（已加入本次复习末尾）');
  toast(msg);

  // 推进
  if(grade === 'known' && !c.autoNext){
    // 复用左按钮为「下一题」（右按钮即「不确定」隐藏）
    if(left){
      left.className = 'abtn abtn-next';
      left.textContent = '下一题';
      left.disabled = false;
      left.style.pointerEvents = 'auto';
      left.onclick = () => { pq.idx++; nextQuestion(); };
    }
    if(right){ right.style.display = 'none'; }
  } else {
    const delay = grade === 'known' ? c.autoNextDelay : (grade === 'fuzzy' ? 1400 : c.wrongHoldMs);
    setTimeout(() => { if(pq && pq.revealed){ pq.idx++; nextQuestion(); } }, delay);
  }
}

function finishPractice(){
  const acc = pq.total ? Math.round(pq.correct / pq.total * 100) : 0;
  const unknown = (pq.total || 0) - (pq.correct || 0);
  const s = pq.stats || { known:0, fuzzy:0, unknown:0 };
  let bodyHtml = '<div class="q-word">练习完成 🎉</div>' +
    '<div class="q-cn">正确率 ' + acc + '%（' + pq.correct + '/' + pq.total + '）' +
    ' · 认识 ' + s.known + ' · 不确定 ' + s.fuzzy + ' · 不认识 ' + s.unknown + '</div>';
  const wrong = pq.wrongList || [];
  if(wrong.length){
    bodyHtml += '<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">' +
      '<h3 style="margin:0 0 10px;color:var(--danger)">不认识的词（' + wrong.length + ' 个）</h3><div>' + wrong.map(w =>
        '<div class="list-item"><span><b style="font-size:15px">' + escapeHtml(w.en) + '</b>' +
        (w.cn ? ' <span class="muted">' + escapeHtml(w.cn) + '</span>' : '') + '</span></div>'
      ).join('') + '</div></div>';
    bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
      '<button class="btn" id="exitBtn">重新开始</button>' +
      '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  } else {
    bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
      '<button class="btn" id="exitBtn">重新开始</button>' +
      '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  }
  $('#practiceBody').innerHTML = bodyHtml;
  $('#practiceScore').textContent = '';
  $('#progBarWrap').hidden = true;
  const eb = document.getElementById('exitBtn');
  if(eb) eb.addEventListener('click', resetPractice);
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', () => { autoStartSeeWord(); });
}

function updateScore(){
  if(!pq || !Array.isArray(pq.queue)) return;
  $('#practiceScore').textContent = '进度 ' + (pq.idx + 1) + '/' + pq.queue.length + ' · 正确 ' + pq.correct;
}
function updateProgBar(){
  if(!pq || !Array.isArray(pq.queue) || !pq.queue.length) return;
  const pct = (pq.idx / pq.queue.length) * 100;
  $('#progBarFill').style.width = pct + '%';
}

// ======= 设置模态弹窗（齿轮触发，仅学习模块使用）=======
function renderCfgModal(){
  const c = pc();
  const body = $('.cfg-modal-body');
  const groups = [
    {
      name:'答题', icon:'☑',
      items:[
        { key:'batchSize',     label:'题量',          type:'batch', presets:[{v:'5',t:'5 题'},{v:'10',t:'10 题'},{v:'20',t:'20 题'},{v:'50',t:'50 题'},{v:'100',t:'100 题'},{v:'-1',t:'全部'}] },
        { key:'optCount',      label:'选项数量',      type:'select', opts:[{v:'4',t:'4 个'},{v:'6',t:'6 个'}] },
        { key:'shuffle',       label:'随机乱序',      type:'toggle' },
        { key:'wrongHoldMs',   label:'答错停留',      type:'range', min:1000, max:5000, step:500, unit:'ms' },
        { key:'autoNext',      label:'答对自动下一题', type:'toggle', showIf:'autoNext' },
        { key:'autoNextDelay', label:'自动间隔',      type:'range', min:300, max:3000, step:100, unit:'ms', showIf:'autoNext' },
      ]
    },
    {
      name:'声音', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>',
      items:[
        { key:'rate',      label:'语速',     type:'range', min:0.5, max:1.3, step:0.05, unit:'x' },
        { key:'repeat',    label:'朗读次数', type:'range', min:1, max:5, step:1, unit:' 次' },
        { key:'intervalMs',label:'朗读间隔', type:'select', opts:[{v:'800',t:'0.8s'},{v:'1200',t:'1.2s'},{v:'1800',t:'1.8s'},{v:'2400',t:'2.4s'},{v:'3200',t:'3.2s'}] },
        { key:'autoPlay',  label:'自动播下题', type:'toggle' },
      ]
    },
    {
      name:'显示', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
      items:[
        { key:'showCn',       label:'显示释义提示',    type:'toggle' },
      ]
    }
  ];
  let html = '<div class="cfg-m-cols"><div class="cfg-m-sidebar">';
  for(const g of groups){
    html += '<div class="cfg-m-cat" data-cat="' + g.name + '"><span>' + g.icon + ' ' + g.name + '</span></div>';
  }
  html += '</div><div class="cfg-m-main">';
  for(const g of groups){
    html += '<div class="cfg-m-group" data-g="' + g.name + '">';
    for(const item of g.items){
      const val = c[item.key];
      const hide = item.showIf && !c[item.showIf];
      html += '<div class="cfg-m-row' + (hide ? ' cfg-m-hidden' : '') + '" data-key="' + item.key + '" data-showif="' + (item.showIf || '') + '">';
      html += '<div class="cfg-m-label">' + item.label;
      if(item.desc) html += '<div class="cfg-m-desc">' + item.desc + '</div>';
      html += '</div>';
      html += '<div class="cfg-m-ctrl">';
      if(item.type === 'toggle'){
        html += '<input type="checkbox" ' + (val ? 'checked' : '') + ' class="cfg-toggle" data-key="' + item.key + '"><label></label>';
      } else if(item.type === 'select'){
        html += '<select class="cfg-select" data-key="' + item.key + '">';
        for(const o of item.opts) html += '<option value="' + o.v + '"' + (String(val) === o.v ? ' selected' : '') + '>' + o.t + '</option>';
        html += '</select>';
      } else if(item.type === 'range'){
        html += '<input type="range" class="cfg-range" data-key="' + item.key + '" data-unit="' + escapeHtml(item.unit || '') + '" min="' + item.min + '" max="' + item.max + '" step="' + item.step + '" value="' + val + '">';
        html += '<span class="cfg-range-val">' + val + (item.unit || '') + '</span>';
      } else if(item.type === 'batch'){
        const presets = item.presets || [];
        const isPreset = presets.some(p => String(p.v) === String(val));
        html += '<select class="cfg-batch-select" data-key="' + item.key + '">';
        for(const p of presets) html += '<option value="' + p.v + '"' + (String(val) === p.v ? ' selected' : '') + '>' + p.t + '</option>';
        html += '<option value="__custom__"' + (isPreset ? '' : ' selected') + '>自定义…</option>';
        html += '</select>';
        html += '<input type="number" min="1" class="cfg-batch-custom" data-key="' + item.key + '" placeholder="自定义题量" value="' + (isPreset ? '' : escapeHtml(String(val))) + '">';
      }
      html += '</div></div>';
    }
    html += '</div>';
  }
  html += '</div></div>';
  body.innerHTML = html;

  body.querySelectorAll('.cfg-toggle').forEach(el => {
    el.addEventListener('change', () => { pcSave({ [el.dataset.key]: el.checked }); toggleCfgShowIf(); });
  });
  body.querySelectorAll('.cfg-select').forEach(el => {
    el.addEventListener('change', () => pcSave({ [el.dataset.key]: parseInt(el.value, 10) }));
  });
  body.querySelectorAll('.cfg-range').forEach(el => {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      pcSave({ [el.dataset.key]: v });
      el.nextElementSibling.textContent = v + (el.dataset.unit || '');
    });
  });
  body.querySelectorAll('.cfg-batch-select').forEach(el => {
    el.addEventListener('change', () => {
      if(el.value === '__custom__'){ const inp = el.parentElement.querySelector('.cfg-batch-custom'); if(inp) inp.focus(); return; }
      pcSave({ [el.dataset.key]: parseInt(el.value, 10) });
      const inp = el.parentElement.querySelector('.cfg-batch-custom'); if(inp) inp.value = '';
    });
  });
  body.querySelectorAll('.cfg-batch-custom').forEach(el => {
    el.addEventListener('input', () => {
      const n = parseInt(el.value, 10);
      if(isNaN(n) || n < 1) return;
      pcSave({ [el.dataset.key]: n });
      const sel = el.parentElement.querySelector('.cfg-batch-select'); if(sel && sel.value !== '__custom__') sel.value = '__custom__';
    });
  });
  body.querySelectorAll('.cfg-m-cat').forEach(el => el.addEventListener('click', () => switchCfgCat(el.dataset.cat)));
  switchCfgCat(groups[0].name);
}
function switchCfgCat(name){
  document.querySelectorAll('.cfg-m-cat').forEach(el => el.classList.toggle('active', el.dataset.cat === name));
  document.querySelectorAll('.cfg-m-group').forEach(el => el.classList.toggle('active', el.dataset.g === name));
}
function toggleCfgShowIf(){
  document.querySelectorAll('.cfg-m-row[data-showif]').forEach(row => {
    const depKey = row.dataset.showif;
    if(!depKey) return;
    row.classList.toggle('cfg-m-hidden', !pc()[depKey]);
  });
}

// ======= 朗读（集中管理，切题取消排队避免串台）=======
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

// ======= 工具函数 =======
// 把任意时间表示（YYYY-MM-DD 字符串 / ms 时间戳 / Date 可解析串）统一转为 YYYY-MM-DD。
// 所有复习时间比较与间隔累加只取日期，时间戳统一存当天 00:00（补丁⑦）。
function dateKeyOf(d){
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function toDateKey(x){
  if(x == null) return null;
  if(typeof x === 'string'){
    if(/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;       // 已是标准日期串
    const d = new Date(x);
    return isNaN(d.getTime()) ? null : dateKeyOf(d);
  }
  if(typeof x === 'number'){
    const d = new Date(x);
    return isNaN(d.getTime()) ? null : dateKeyOf(d);
  }
  return null;
}
function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function daysBetween(a, b){
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
function pickWrong(correct, n){
  const seen = new Set();
  const cEn = (correct.en != null) ? String(correct.en).toLowerCase() : '';
  if(cEn) seen.add(cEn);
  // 过滤掉与本题正确答案完全相同的释义，避免两个选项中文一模一样
  const cCn = (correct.cn != null) ? String(correct.cn) : '';
  const pool = shuffle(DATA.words.filter(w => {
    const e = (w && w.en != null) ? String(w.en).toLowerCase() : '';
    if(e === '' || seen.has(e)) return false;
    if(cCn && w.cn != null && String(w.cn) === cCn) return false;
    return true;
  }));
  const uniq = [];
  for(const w of pool){
    const e = (w && w.en != null) ? String(w.en).toLowerCase() : '';
    if(seen.has(e) || e === '') continue;
    seen.add(e); uniq.push(w);
    if(uniq.length >= n) break;
  }
  return uniq;
}
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function speak(text, lang){ try{ const u = new SpeechSynthesisUtterance(text); u.lang = lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){} }
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

ready(() => {
  document.querySelectorAll('.wtab').forEach(b => {
    b.addEventListener('click', () => switchWordTab(b.dataset.wtab));
  });
  $('#exitPractice').addEventListener('click', autoStartSeeWord);
  $('#cfgGear').addEventListener('click', () => {
    $('#cfgModal').hidden = false;
    renderCfgModal();
  });
  $('#cfgClose').addEventListener('click', () => { $('#cfgModal').hidden = true; });
  $('#cfgModal').addEventListener('click', e => { if(e.target === $('#cfgModal')) $('#cfgModal').hidden = true; });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('#cfgModal').hidden) $('#cfgModal').hidden = true; });
  $('#toolSpeaker').addEventListener('click', () => { if(!pq || !pq.answer) return; speakN(pq.answer.en); });
  autoStartSeeWord();
});
