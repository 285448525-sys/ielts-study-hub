// =====================================================================
//  单词 · 学习模块（v2.1）—— 长线 Leitner + 短线分散确认（v4 指令 + v4.1 优化）
//  算法层严格按「背单词模块_任务指令_A窗口_2026-08-28.md」v4 实现。
//  v4.1 优化清单（P0+P1）：
//    P0-1 promoteLongTerm 改为「先按当前 level 算间隔，再升级」→ 启用 LEVEL_INTERVAL[0]=1天
//    P0-2 答错当场重考仅 1 次；重考再错 → 额外惩罚 + 隔 1 个词插回，不再当场重考
//    P0-3 难词短线间隔加密 GAP_HARD=[0,1,3]
//    P1-1 「完全不认识」惩罚分级（errTotal 额外+1、level 多降 1）
//    P1-2 newPerDay 仅限制新词（cleared!==true），复习词不占配额
//    P1-3 难词退出门槛 cleanRounds 2 → 3
//  字段适配：v4 的 word/meaning/wordId → 本库 en/cn/en(id)；
//           errorCount→errTotal、isHard→hardWord、isKey→keyWord；
//           shortCount/lastShortTouch/cleanRounds 为新增持久字段。
// =====================================================================

var pq = null;            // 学习会话状态（仅内存，不落库）
var _speakTimers = [];    // 朗读定时器，必须在 ready() 前初始化

// 熟练度 0-7 级标准间隔（天）：索引 = 等级
// 0→1天 1→2天 2→4天 3→7天 4→15天 5→30天 6→60天 7→90天
var LEVEL_INTERVAL = [1, 2, 4, 7, 15, 30, 60, 90];

// 短线（v4）：分散成功几次才放行；GAP[k] 为答对后插回队列的间隔词数
var SHORT_PASS = 3;
var GAP = [0, 2, 5];      // GAP[0] 占位；k=1→隔2个、k=2→隔5个；k=3=过关不再插回
var GAP_HARD = [0, 1, 3]; // P0-3 难词加密：k=1→隔1个、k=2→隔3个
var CLEAN_TO_EXIT = 3;    // P1-3 难词退出门槛：连续 3 轮短线过关才取消 hardWord
var MAX_ATTEMPT = 15;     // 单个词本轮最多作答次数（防死循环，超出则移出队列留到明天）

// ======= 全局练习配置（与词库无关）=======
var PC_DEFAULTS = {
  rate: 0.9,
  repeat: 1,
  intervalMs: 1800,
  batchSize: -1,          // -1=全部
  newPerDay: 20,          // 每日新学上限（P1-2：仅统计新词，-1=不限）
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
    if(!pq || !pq.queue || pq.queue.length === 0 || !$('#practiceBody').innerHTML.trim()){
      autoStartSeeWord();
    }
  }
}

// ======= v4 算法：单词字段迁移 / 弱持久化 / 长线升级降级 / 队列 =======

// 把旧 mc* 字段或裸词迁移为 v1.2 字段（幂等：已迁移则跳过）。新增 shortCount/lastShortTouch/cleanRounds。
function ensureWordV12(w){
  if(!w) return w;
  if(w.level != null && w.nextReview != null){
    if(w.cleared == null) w.cleared = !!w.lastReview;  // 已学过的词默认"已达标"(复习对1次即过)；新词需分散3次
    if(w.shortCount == null) w.shortCount = 0;
    if(w.lastShortTouch == null) w.lastShortTouch = null;
    if(w.cleanRounds == null) w.cleanRounds = 0;
    return w;
  }
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
  w.hardWord   = (w.hardWord   != null) ? !!w.hardWord  : false;
  w.okStreak   = (w.okStreak   != null) ? w.okStreak   : (w.mcStreak || 0);
  w.lastReview = (w.lastReview != null) ? toDateKey(w.lastReview) : toDateKey(w.mcLast || null);
  w.keyWord    = (w.keyWord    != null) ? !!w.keyWord   : false;
  w.cleared       = (w.cleared       != null) ? !!w.cleared       : false;
  w.shortCount    = (w.shortCount    != null) ? w.shortCount    : 0;
  w.lastShortTouch = (w.lastShortTouch != null) ? w.lastShortTouch : null;
  w.cleanRounds   = (w.cleanRounds   != null) ? w.cleanRounds   : 0;
  return w;
}

// 逾期降级：在「复习前」对该词应用，降级后由 promote/demote 按新等级排程
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
  w.nextReview = today;   // 消费逾期状态：本次复习已计惩罚，避免重复降级
  hubSave();
}

// 长线升级（v4 §3.3 promoteLongTerm）：仅短线 3 次全对过关时调用
// P0-1：改为「先按当前 level 算间隔，再升级」，让 level0 新词首次复习=1天（不再跳过 LEVEL_INTERVAL[0]）
function promoteLongTerm(w, today){
  let interval = LEVEL_INTERVAL[w.level || 0];               // ① 先用「当前」等级算间隔
  if(w.hardWord) interval = Math.ceil(interval * 0.5);       // 难词间隔×50%
  if(w.keyWord)  interval = Math.ceil(interval * 0.7);       // 重点词间隔×70%（叠乘）
  w.nextReview = addDays(today, Math.max(1, interval));      // ② 再算出 nextReview
  w.level = Math.min(7, (w.level || 0) + 1);                 // ③ 最后升级
  w.cleared = true;
  // ★ 短线本轮结束，shortCount 归零、时间戳置空，下次经长线复习再入队时从 0 重新累计
  w.shortCount = 0;
  w.lastShortTouch = null;
  if(w.hardWord){                                   // 仅难词累计退出计数
    w.cleanRounds = (w.cleanRounds || 0) + 1;
    if(w.cleanRounds >= CLEAN_TO_EXIT){             // P1-3：连续 3 轮过关才取消难词
      w.hardWord = false;
      w.cleanRounds = 0;
    }
  }
}

// 长线降级（v4 §3.3 demoteLongTerm）：答错/不认识时调用
// P1-1：isCompletelyUnknown=true（点了「完全不认识」）时追加惩罚：errTotal 额外+1、level 多降 1
function demoteLongTerm(w, today, isCompletelyUnknown){
  const drop = (w.level || 0) >= 5 ? 1 : 2;
  w.level = Math.max(0, (w.level || 0) - drop);
  w.nextReview = addDays(today, 1);        // 强制明天，不按 LEVEL_INTERVAL 计算
  w.errTotal = (w.errTotal || 0) + 1;      // 永久累计不重置
  if(isCompletelyUnknown){                 // P1-1：「完全不认识」= 毫无印象，惩罚更重
    w.errTotal = (w.errTotal || 0) + 1;    // 错误数额外 +1
    w.level = Math.max(0, w.level - 1);    // 等级再多降 1（最低 0）
  }
  if(w.errTotal >= 2) w.hardWord = true;   // 自动标难词（无手动标记 UI）
  w.cleanRounds = 0;                       // 答错打断连续 clean（全局一行）
  w.shortCount = 0;
  w.lastShortTouch = null;                 // 清零时间戳置空
  recordDailyWrong(w.en);
}

// P0-3：取该词本轮的短线间隔（难词走加密 GAP_HARD）
function gapFor(w, k){
  const g = (w && w.hardWord) ? GAP_HARD : GAP;
  const v = (k != null && g[k] != null) ? g[k] : 2;
  return Math.max(1, v);                   // 兜底至少隔 1 个，避免原地插回死循环
}

// 短线弱持久化（v4 §3.2 reconcileShortCount）：仅当 shortCount 实际变化才由调用方写库
function reconcileShortCount(w, nowISO){
  if(!w.lastShortTouch || (w.shortCount || 0) === 0) return;
  const elapsed = Date.parse(nowISO) - Date.parse(w.lastShortTouch);
  const hours = elapsed / (1000 * 60 * 60);
  if(hours > 24){
    w.shortCount = 0;
    w.lastShortTouch = null;               // 清零后时间戳置空，避免无效字段残留
  } else if(hours > 4){
    w.shortCount = Math.max(0, (w.shortCount || 0) - 1);
    // 退级但未清零：不刷新 lastShortTouch（保持原始答题基准，幂等）
    if(w.shortCount === 0) w.lastShortTouch = null;
  }
  // ≤4h：完全不动，也不刷新时间戳
}

// 记录当日答错词（供次日「前日错当日强制」复习，demote 已将 nextReview 设为明天，自然覆盖）
function recordDailyWrong(en){
  DATA.dailyWrong = DATA.dailyWrong || {};
  const t = todayKey();
  if(!DATA.dailyWrong[t]) DATA.dailyWrong[t] = [];
  const k = String(en).toLowerCase();
  if(!DATA.dailyWrong[t].includes(k)) DATA.dailyWrong[t].push(k);
}

// 动态干扰项（v4 §3.7 genDistractors，适配 en/cn）：同/相邻 level 优先，不写回 distractors，shuffle 不修改入参原数组
function genDistractors(correct, allWords){
  const cEn = String(correct.en || '').toLowerCase();
  const cCn = String(correct.cn || '');
  const pool = shuffle(allWords.filter(w => {
    const e = String(w.en || '').toLowerCase();
    if(e === '' || e === cEn) return false;
    if(cCn && String(w.cn || '') === cCn) return false;   // 去掉与正确答案中文完全相同的释义
    return true;
  }));
  const similar = pool.filter(w => Math.abs((w.level || 0) - (correct.level || 0)) <= 1);  // 同/相邻 level
  const uniq = [];
  const seenCn = new Set();
  const pushIfNew = x => { const cn = String(x.cn || ''); if(cn && !seenCn.has(cn)){ seenCn.add(cn); uniq.push(x); } };
  for(const w of similar){ if(uniq.length >= 2) break; pushIfNew(w); }
  for(const w of pool){ if(uniq.length >= 2) break; pushIfNew(w); }
  let i = 0;
  while(uniq.length < 3 && i < pool.length){ pushIfNew(pool[i]); i++; }
  return shuffle([correct, ...uniq.slice(0, 3)]);
}

// 队列优先级排序（五关键字）
function dueCmp(a, b){
  return (a.nextReview || '').localeCompare(b.nextReview || '') ||   // ① nextReview 升序
         (b.errTotal || 0) - (a.errTotal || 0) ||                    // ② errorCount 降序
         ((a.hardWord === b.hardWord) ? 0 : (a.hardWord ? -1 : 1)) || // ③ isHard(=hardWord) 降序
         ((a.keyWord === b.keyWord) ? 0 : (a.keyWord ? -1 : 1)) ||    // ④ isKey(=keyWord) 降序
         (a.level || 0) - (b.level || 0);                            // ⑤ level 升序
}

// 队列构建（v4 §3.9 buildQueue）：筛 nextReview<=today + reconcile + 排序 + P1-2 新词配额
function buildQueue(today, nowISO){
  const c = pc();
  const due = (DATA.words || []).filter(w => {
    if(!w || typeof w.en !== 'string' || w.en.trim() === '') return false;
    ensureWordV12(w);
    return (!w.nextReview || w.nextReview <= today);
  });
  for(const w of due) reconcileShortCount(w, nowISO);   // 入队前恢复短线进度（仅变化时写库）
  due.sort(dueCmp);

  // P1-2：newPerDay 仅为「每日新学新词上限」，复习词（cleared===true）不占配额、全部保留
  if(c.newPerDay && c.newPerDay > 0){
    const review = due.filter(w => w.cleared === true);
    const fresh  = due.filter(w => w.cleared !== true);
    if(fresh.length > c.newPerDay) fresh.length = c.newPerDay;
    return review.concat(fresh).sort(dueCmp);
  }
  return due;
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
    const today = todayKey();
    // —— 恢复或首次锁定当日词表 ——
    let session = DATA.dailySession;
    const fresh = !session || session.date !== today || !Array.isArray(session.planEn) || session.planEn.length === 0;
    if(fresh){
      const c = pc();
      const all = buildQueue(today, nowISO());
      if(all.length === 0){
        $('#practiceScore').textContent = '';
        $('#practiceBody').innerHTML = '<div class="q-word">今天没有待复习的词</div>' +
          '<div class="q-cn">去「词库」加词，或明天再来。复习会按记忆曲线自动排程。</div>';
        clearDailySession();
        return;
      }
      let plan = all.slice();
      if(c.shuffle) plan = shuffle(plan);
      // 锁定当日词量：总词表上限 = 每日学习量（newPerDay），不足则取实际待复习数
      if(c.newPerDay && c.newPerDay > 0 && plan.length > c.newPerDay) plan = plan.slice(0, c.newPerDay);
      if(c.batchSize > 0 && plan.length > c.batchSize) plan = plan.slice(0, c.batchSize);
      session = {
        date: today,
        planEn: plan.map(w => String(w.en).trim().toLowerCase()),
        passed: [],
        queueOrder: plan.map(w => String(w.en).trim().toLowerCase()),
        currentEn: null,
        stats: { known:0, unknown:0 },
        total: 0,
        finished: false,
        lastTouch: Date.now()
      };
      DATA.dailySession = session;
      hubSave();
    }

    // —— 重建内存会话：planEn 中未 passed、且仍在词库的，按 queueOrder 顺序 ——
    const s = session;
    pq = { mode:'study', queue:[], idx:0, initLen: s.planEn.length, correct: (s.passed || []).length,
           revealed:false, answer:null, wrongList:[],
           stats: s.stats || { known:0, unknown:0 },
           counted: new Set(s.passed || []),     // 已过的词不重复计数
           passed: (s.passed || []).slice(),
           reholdMap:{},   // P0-2：本词当场重考次数（仅内存，不持久化，key=小写单词）
           attempts:{} };  // 本词本轮作答次数（防死循环）
    const order = (s.queueOrder && s.queueOrder.length) ? s.queueOrder : s.planEn;
    pq.queue = order
      .map(en => findWordByEn(en))
      .filter(w => w && !(s.passed || []).includes(String(w.en).trim().toLowerCase()));
    $('#progBarWrap').hidden = false;

    if(pq.queue.length === 0){
      s.finished = true; s.currentEn = null; hubSave();
      finishPractice();
      return;
    }
    // 刷新恢复：若停留在某个词，则直接渲染该题
    if(s.currentEn){
      const cur = findWordByEn(s.currentEn);
      if(cur && pq.queue.some(w => String(w.en).trim().toLowerCase() === String(cur.en).trim().toLowerCase())){
        renderQuestion(cur);
        return;
      }
    }
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

// ======= 当日词表锁定 + 进度持久化（草稿自动存档）=======
// 按 en（小写）在词库里取活词对象，用作当日 session 的稳定键
function findWordByEn(en){
  const k = String(en || '').trim().toLowerCase();
  if(!k) return null;
  return (DATA.words || []).find(w => String(w.en || '').trim().toLowerCase() === k) || null;
}
function clearDailySession(){
  if(DATA && DATA.dailySession){ DATA.dailySession = null; hubSave(); }
}
// 把当前内存会话快照写入当日 session（仅当天有效），供刷新/跳转后恢复
function saveDailySession(){
  if(!pq || !DATA || !DATA.dailySession) return;
  const s = DATA.dailySession;
  if(s.date !== todayKey()) return;            // 只保存当天，跨天不污染
  s.passed = (pq.passed || []).slice();
  s.queueOrder = pq.queue.map(w => String(w.en || '').trim().toLowerCase());
  s.stats = { known: (pq.stats && pq.stats.known) || 0, unknown: (pq.stats && pq.stats.unknown) || 0 };
  s.total = pq.total || 0;
  s.initLen = pq.initLen || 0;
  const cur = pq.queue[pq.idx];
  s.currentEn = cur ? String(cur.en || '').trim().toLowerCase() : null;
  s.lastTouch = Date.now();
  hubSave();
}
// 清空当日 session 并重建（"再来一轮"用：当天内重新锁定一份词表）
function restartToday(){
  cancelSpeak();
  clearDailySession();
  pq = null;
  autoStartSeeWord();
}

function setWordFullscreen(on){
  if(on){
    document.body.classList.add('word-fullscreen');
  } else {
    document.body.classList.remove('word-fullscreen');
  }
  const btn = $('#fullscreenBtn');
  if(!btn) return;
  if(on){
    btn.title = '退出全屏';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M4 8V5a2 2 0 0 1 2-2h3m0 18H6a2 2 0 0 1-2-2v-3m18-3v3a2 2 0 0 1-2 2h-3m0-18h3a2 2 0 0 1 2 2v3"/></svg>退出';
  } else {
    btn.title = '全屏沉浸式背单词';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>全屏';
  }
}
function toggleWordFullscreen(){
  setWordFullscreen(!document.body.classList.contains('word-fullscreen'));
}

function masterWord(cur){
  if(!pq || !cur) return;
  const k = String(cur.en || '').trim().toLowerCase();
  const same = w => {
    if(cur.id && w.id) return w.id === cur.id;
    return String(w.en || '').trim().toLowerCase() === k;
  };
  DATA.words = (DATA.words || []).filter(w => !same(w));
  pq.queue = pq.queue.filter(w => !same(w));
  // 从当日计划移除（分母缩减，不计入已掌握进度）
  if(DATA.dailySession && DATA.dailySession.date === todayKey()){
    const s = DATA.dailySession;
    s.planEn = (s.planEn || []).filter(e => e !== k);
    s.queueOrder = (s.queueOrder || []).filter(e => e !== k);
    s.passed = (s.passed || []).filter(e => e !== k);
    pq.initLen = s.planEn.length;
  }
  hubSave();
  saveDailySession();
  toast('已掌握，已从词库删除');
  nextQuestion();
}

function nextQuestion(){
  if(!pq) return;
  try{
    cancelSpeak();
    updateScore();
    updateProgBar();
    if(pq.idx >= pq.queue.length){ finishPractice(); return; }
    const cur = pq.queue[pq.idx];
    if(!cur || cur.en == null || String(cur.en).trim() === ''){
      pq.queue.splice(pq.idx, 1);          // 脏词直接剔除，避免死循环
      saveDailySession();
      nextQuestion();
      return;
    }
    saveDailySession();   // 记录当前词，刷新可恢复
    renderQuestion(cur);
  }catch(err){
    console.error('[practice] nextQuestion 失败', err);
    $('#practiceBody').innerHTML = '<div class="q-word">题目渲染失败</div>' +
      '<div class="q-cn">' + escapeHtml(String(err && err.message ? err.message : err)) + '</div>' +
      '<div style="margin-top:16px"><button class="btn" id="skipBad">跳过本题</button> <button class="btn btn-primary" id="retryStart2">重新开始</button></div>';
    const skip = $('#skipBad'), retry = $('#retryStart2');
    if(skip) skip.addEventListener('click', () => { if(pq){ pq.queue.splice(pq.idx, 1); nextQuestion(); } });
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

function renderQuestion(cur, isRehold){
  if(!pq) return;
  pq.answer = cur;
  ensureWordV12(cur);
  applyOverdue(cur);     // 复习前应用逾期降级
  const c = pc();
  pq.revealed = false;
  pq._picked = false;

  const opts = genDistractors(cur, DATA.words);

  let html = '';
  // ── 顶部区：上一词回顾 ──
  let top = '';
  if(pq.idx > 0 && !isRehold){
    const last = pq.queue[pq.idx - 1];
    if(last) top += '<div class="last-word">' +
      '<span class="lw-en">← ' + escapeHtml(last.en) + '</span>' +
      (last.ipa ? '<span class="lw-ipa">' + escapeHtml(last.ipa) + '</span>' : '') +
      (last.cn ? '<span class="lw-cn">' + escapeHtml(last.cn) + '</span>' : '') +
      '</div>';
  }
  if(top) html += '<div class="practice-topzone">' + top + '</div>';

  // ── 主区域（照抄爱听写 v5：单词+音标+中文 居中；无例句、题干无词性；中文答后才显示） ──
  html += '<div class="practice-word-area">' +
    '<button class="mastered-btn" id="masteredBtn" title="已掌握：从词库删除该词">已掌握</button>' +
    '<div class="pw-en">' + escapeHtml(cur.en) + '</div>' +
    (cur.ipa ? '<div class="pw-ipa">/ ' + escapeHtml(cur.ipa) + ' /</div>' : '') +
    '<div class="pw-cn" id="pwCn"></div>' +
  '</div>';

  // ── 选项网格（2×2 + 不知道，照抄爱听写） ──
  html += '<div class="opts-grid" id="opts"></div>';
  html += '<div class="answer-btns"><button class="abtn abtn-unknown" id="unknownBtn">不知道</button></div>';

  const body = $('#practiceBody');
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map((o, i) =>
    '<button class="opt-big" data-en="' + escapeHtml(o.en) + '" data-idx="' + i + '">' +
      '<span class="opt-big-tag">' + (o.pos || '') + '</span>' +
      '<span class="opt-big-cn">' + escapeHtml(o.cn) + '</span>' +
      '<span class="opt-big-en"></span>' +
    '</button>'
  ).join('');
  bindOpts(cur);
  const left0 = document.getElementById('unknownBtn');
  if(left0) left0.onclick = () => judge(cur, null, false, true);
  const mb = document.getElementById('masteredBtn');
  if(mb) mb.onclick = () => masterWord(cur);
  setTimeout(() => speakN(cur.en), 300);
}

// 选项点击 → 立即判定对错（对=认识，错=不认识）；不另设「认识」按钮
function bindOpts(cur){
  document.querySelectorAll('#opts .opt-big').forEach(b => {
    b.addEventListener('click', () => {
      if(pq.revealed || pq._picked) return;
      pq._picked = true;
      judge(cur, b.dataset.en, b.dataset.en === cur.en, false);
    });
  });
}

// 统一处理一次作答（4 选 1 直接判 / 点「完全不认识」）。
// 长线由 promote/demote 排程（Leitner）；短线由 shortCount + gapFor 间隔插回队列实现「分散 3 次成功才放行」。
// P0-2：答错 → 当场重考最多 1 次；重考答对 → shortCount=1 走正常 GAP；重考仍错 → 额外惩罚 + 隔 1 个词插回。
function judge(cur, pickedEn, correct, isUnknownBtn){
  if(!pq || pq.revealed) return;
  pq.revealed = true;
  // 揭示反馈（照抄爱听写：词性标签变 "n. english" 格式，对=绿框，错=红框+正确也绿框）
  document.querySelectorAll('#opts .opt-big').forEach(x => {
    const isCorrect = (x.dataset.en === cur.en);
    const isWrong = (!correct && pickedEn != null && x.dataset.en === pickedEn);
    if(isCorrect || isWrong){
      // 在词性标签旁显示英文： "n." → "n. tone" / "n. loan"
      const tagEl = x.querySelector('.opt-big-tag');
      if(tagEl){
        const pos = tagEl.textContent.trim();
        tagEl.textContent = pos ? (pos + ' ' + x.dataset.en) : x.dataset.en;
      }
    }
    if(isCorrect) x.classList.add('correct');
    if(isWrong) x.classList.add('wrong');
    x.style.pointerEvents = 'none';
  });
  // 揭示题干中文释义（照抄爱听写 v5：答后才显示，题干不含词性）
  const reveal = document.getElementById('pwCn');
  if(reveal && cur.cn){
    reveal.textContent = cur.cn;
  }
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.style.pointerEvents = 'none'; ub.disabled = true; }

  const k = String(cur.en).toLowerCase();
  if(!pq.counted) pq.counted = new Set();
  if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }   // 每词仅计一次
  if(correct) pq.stats.known++; else pq.stats.unknown++;
  if(!pq.attempts) pq.attempts = {};
  if(!pq.reholdMap) pq.reholdMap = {};
  pq.attempts[k] = (pq.attempts[k] || 0) + 1;

  if(!correct){
    if(!pq.wrongList) pq.wrongList = [];
    pq.wrongList.push({ en: cur.en, cn: cur.cn || '', user: isUnknownBtn ? '(完全不认识)' : '(选错)', grade: 'unknown' });
  }

  const c = pc();
  const today = todayKey();
  const nowStr = nowISO();
  const cnTxt = cur.cn ? ' · ' + cur.cn : '';
  let result;

  if(correct){
    // 选对直接过（不再需要3次；SHORT_PASS 只给错词回考用）
    promoteLongTerm(cur, today);
    pq.queue.splice(pq.idx, 1);
    pq.correct++;
    pq.passed.push(String(cur.en).trim().toLowerCase());
    hubSave();
    result = 'pass';
    toast('✓ 过关：' + cur.en + cnTxt);
  } else {
    const wasRehold = (pq.reholdMap[k] || 0) >= 1;
    demoteLongTerm(cur, today, !!isUnknownBtn); // P1-1：点「完全不认识」时惩罚加重
    if(wasRehold){
      // P0-2 边界：重考仍错 → 额外记一次错误，插回到「隔 1 个词」的位置，不再当场重考
      cur.errTotal = (cur.errTotal || 0) + 1;
      pq.reholdMap[k] = 0;
      pq.queue.splice(pq.idx, 1);
      const pos = Math.min(pq.queue.length, pq.idx + 1);
      if(pos >= pq.queue.length) pq.queue.push(cur);
      else pq.queue.splice(pos, 0, cur);
      hubSave();
      result = 'requeue';
      toast('✗ 还是没记住：' + cur.en + cnTxt + '（明天 + 隔 1 个词再来）');
    } else {
      // 第一次答错 → 展示答案后当场重考同一词（选项重新打乱）
      pq.reholdMap[k] = 1;
      result = 'rehold';
      toast('✗ 答错：' + cur.en + cnTxt + '（看完答案，马上再考你一次）');
    }
  }

  // 死循环防护：同一词本轮作答次数过多 → 强制移出队列（保持降级状态，明天再来）
  if(result !== 'pass' && (pq.attempts[k] || 0) >= MAX_ATTEMPT){
    const at = pq.queue.indexOf(cur);
    if(at >= 0) pq.queue.splice(at, 1);
    pq.reholdMap[k] = 0;
    if(!pq.wrongList) pq.wrongList = [];
    if(!pq.wrongList.some(x => String(x.en).toLowerCase() === k)){
      pq.wrongList.push({ en: cur.en, cn: cur.cn || '', user: '(本轮放弃)', grade: 'unknown' });
    }
    hubSave();
    result = 'requeue';
    toast('⏸ ' + cur.en + ' 本轮先放着，明天再来');
  }

  updateScore();
  updateProgBar();
  saveDailySession();   // 每次作答后持久化进度（草稿自动存档）

  if(result === 'rehold'){
    setTimeout(() => { if(pq && pq.revealed){ pq.revealed = false; renderQuestion(cur, true); } }, c.wrongHoldMs);
  } else {
    // 注意：cur 已从队列移除并被重新插到 idx 之后，队首已「滑」到 pq.idx，故不递增 idx
    const delay = correct ? c.autoNextDelay : 1400;
    setTimeout(() => { if(pq && pq.revealed){ nextQuestion(); } }, delay);
  }
}

function finishPractice(){
  const total = pq.total || 0;
  const passed = pq.correct || 0;
  const acc = total ? Math.round(passed / total * 100) : 0;
  const s = pq.stats || { known:0, unknown:0 };
  let bodyHtml = '<div class="q-word">练习完成 🎉</div>' +
    '<div class="q-cn">本轮过关 ' + passed + '/' + total + '（' + acc + '%）' +
    ' · 答对 ' + s.known + ' 次 · 答错 ' + s.unknown + ' 次</div>';
  const seen = new Set();
  const wrong = (pq.wrongList || []).filter(w => {
    const k = String(w.en).toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });
  if(wrong.length){
    bodyHtml += '<div class="card" style="margin-top:14px;background:rgba(248,113,113,.04);border:1px solid rgba(248,113,113,.2)">' +
      '<h3 style="margin:0 0 10px;color:var(--danger)">没记住的词（' + wrong.length + ' 个，明天优先复习）</h3><div>' + wrong.map(w =>
        '<div class="list-item"><span><b style="font-size:15px">' + escapeHtml(w.en) + '</b>' +
        (w.cn ? ' <span class="muted">' + escapeHtml(w.cn) + '</span>' : '') + '</span></div>'
      ).join('') + '</div></div>';
  }
  bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0">' +
    '<button class="btn" id="exitBtn">重新开始</button>' +
    '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  $('#practiceBody').innerHTML = bodyHtml;
  $('#practiceScore').textContent = '';
  $('#progBarWrap').hidden = true;
  if(DATA.dailySession && DATA.dailySession.date === todayKey()){
    DATA.dailySession.finished = true; DATA.dailySession.currentEn = null; hubSave();
  }
  const eb = document.getElementById('exitBtn');
  if(eb) eb.addEventListener('click', restartToday);
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', restartToday);
}

function updateScore(){
  if(!pq) return;
  const s = pq.stats || { known:0, unknown:0 };
  $('#practiceScore').textContent = '过关 ' + (pq.correct || 0) + '/' + (pq.initLen || 0) +
    ' · 答对 ' + s.known + ' · 答错 ' + s.unknown;
}
function updateProgBar(){
  if(!pq || !pq.initLen) return;
  const pct = Math.min(100, ((pq.correct || 0) / pq.initLen) * 100);
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
        { key:'newPerDay',     label:'每日新学上限',   type:'batch', desc:'仅限制新词，复习词不占配额', presets:[{v:'10',t:'10 个'},{v:'20',t:'20 个'},{v:'30',t:'30 个'},{v:'50',t:'50 个'},{v:'-1',t:'不限'}] },
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
        html += '<input type="number" min="1" class="cfg-batch-custom" data-key="' + item.key + '" placeholder="自定义数量" value="' + (isPreset ? '' : escapeHtml(String(val))) + '">';
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
  if(!text || !('speechSynthesis' in window)) return;
  const c = pc();
  cancelSpeak();
  try{ window.speechSynthesis.resume(); }catch(e){}   // 唤醒被自动播放策略卡在 paused 的引擎
  const doSpeak = () => {
    let n = 0;
    const run = () => {
      if(n++ >= c.repeat) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = c.rate;
      try{ window.speechSynthesis.speak(u); }catch(e){}
      const t = setTimeout(run, c.intervalMs);
      _speakTimers.push(t);
    };
    run();
  };
  // 语音包可能首屏尚未加载（getVoices 为空则 speak 静默失败），等 voiceschanged 再读，兜底 1.2s
  try{
    const vs = window.speechSynthesis.getVoices();
    if(vs && vs.length) doSpeak();
    else {
      let done = false;
      const onV = () => { if(done) return; done = true; try{ window.speechSynthesis.removeEventListener('voiceschanged', onV); }catch(e){} doSpeak(); };
      window.speechSynthesis.addEventListener('voiceschanged', onV);
      setTimeout(() => { if(!done && !_speakTimers.length){ done = true; doSpeak(); } }, 1200);
    }
  }catch(e){ doSpeak(); }
}

// ======= 工具函数 =======
// 当前 ISO 8601 时间戳（UI 层注入算法函数，算法函数内部不自行取时）
function nowISO(){ return new Date().toISOString(); }
// 把任意时间表示（YYYY-MM-DD 字符串 / ms 时间戳 / Date 可解析串）统一转为 YYYY-MM-DD。
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
function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function speak(text, lang){ try{ const u = new SpeechSynthesisUtterance(text); u.lang = lang; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){} }
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

ready(() => {
  document.querySelectorAll('.wtab').forEach(b => {
    b.addEventListener('click', () => switchWordTab(b.dataset.wtab));
  });
  const fsBtn = $('#fullscreenBtn');
  if(fsBtn) fsBtn.addEventListener('click', () => toggleWordFullscreen());
  // ESC / F11 退出全屏
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.body.classList.contains('word-fullscreen')){
      setWordFullscreen(false);
    }
  });
  $('#cfgGear').addEventListener('click', () => {
    $('#cfgModal').hidden = false;
    renderCfgModal();
  });
  $('#cfgClose').addEventListener('click', () => { $('#cfgModal').hidden = true; });
  $('#cfgModal').addEventListener('click', e => { if(e.target === $('#cfgModal')) $('#cfgModal').hidden = true; });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('#cfgModal').hidden) $('#cfgModal').hidden = true; });
  $('#toolSpeaker').addEventListener('click', () => { if(!pq || !pq.answer) return; speakN(pq.answer.en); });
  // 解锁浏览器语音合成：自动播放策略要求首次朗读须在用户手势内/后触发，否则 Chrome/Edge 会把引擎
  // 卡在 paused，导致整轮静音。页面首次任意交互即唤醒引擎；同时预加载语音包。
  try{ window.speechSynthesis.getVoices(); }catch(e){}
  const _unlockSpeech = () => {
    try{ window.speechSynthesis.resume(); }catch(e){}
    document.removeEventListener('click', _unlockSpeech);
    document.removeEventListener('keydown', _unlockSpeech);
    document.removeEventListener('touchstart', _unlockSpeech);
  };
  document.addEventListener('click', _unlockSpeech);
  document.addEventListener('keydown', _unlockSpeech);
  document.addEventListener('touchstart', _unlockSpeech);
  autoStartSeeWord();
});
