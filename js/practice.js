// =====================================================================
//  单词 · 学习模块（v2.1）—— 长线 DHP 策略表（design/77，Leitner 梯仅迁移初值）+ 短线分散确认（v4 指令 + v4.1 优化）
//  算法层严格按「背单词模块_任务指令_A窗口_2026-08-28.md」v4 实现。
//  v4.1 优化清单（P0+P1）：
//    P0-1 promoteLongTerm 改为「先按当前 level 算间隔，再升级」→ 启用 LEVEL_INTERVAL[0]=1天
//    P0-2 答错当场重考（9/24 她拍板改为「重考到选对为止」，不再只重考 1 次后隔 1 个插回）
//    P0-3 难词短线间隔加密 GAP_HARD（9/24 起 [0,1,3,6]）
//    P1-1 「完全不认识」惩罚分级（errTotal 额外+1、level 多降 1）
//    P1-2 newPerDay 仅限制新词（cleared!==true）——9/25 已随「每日新词上限」设置项一起下线（她拍板：只按每日学习上限为准）
//    P1-3 难词退出门槛 cleanRounds 2 → 3
//  字段适配：v4 的 word/meaning/wordId → 本库 en/cn/en(id)；
//           errorCount→errTotal、isHard→hardWord、isKey→keyWord；
//           shortCount/lastShortTouch/cleanRounds 为新增持久字段。
// =====================================================================

var pq = null;            // 学习会话状态（仅内存，不落库）
var _speakTimers = [];    // 朗读定时器，必须在 ready() 前初始化

// 熟练度 0-7 级标准间隔（天）：索引 = 等级
// 0→1天 1→2天 2→4天 3→7天 4→15天 5→30天 6→60天 7→90天
// design/77 起 level 仅作显示代理（displayLevelFromH 由 dh 反推），长线间隔改由 DHP+SSP-MMC 策略表决定
var LEVEL_INTERVAL = [1, 2, 4, 7, 15, 30, 60, 90];

// 短线（v4）：分散成功几次才放行；GAP[k] 为答对后插回队列的间隔词数
// 9/24 她拍板改口径（原 SHORT_PASS=3 / GAP [0,2,5]）：「前两次隔短点，第三次隔长点，留出模拟遗忘的时间」→
//   分散答对 4 次才过关，三次插回间隔 = 隔 2 → 隔 4 → 隔 9（她给的数：2 / 3~5 / 8~10，取中值）。
var SHORT_PASS = 4;
var GAP = [0, 2, 4, 9];      // GAP[0] 占位；k=1→隔2个、k=2→隔4个、k=3→隔9个；k=4=过关不再插回
var GAP_HARD = [0, 1, 3, 6]; // P0-3 难词加密（同比收紧）：k=1→隔1个、k=2→隔3个、k=3→隔6个
var CLEAN_TO_EXIT = 3;    // P1-3 难词退出门槛：连续 3 轮短线过关才取消 hardWord
var MAX_ATTEMPT = 15;     // 单个词本轮最多作答次数（防死循环，超出则移出队列留到明天）

// ======= design/77 背词长线调度换装 DHP + SSP-MMC（KDD'22 墨墨开源版，2026-09-21）=======
// 参数与结构逐字对照 maimemo/SSP-MMC（MIT）algo/main.cpp，不许改动数值。
var DHP_BASE = 1.05;                 // 半衰期档底数：h_i = 1.05^(i-30)
var DHP_MIN_INDEX = -30;             // 档位偏移（main.cpp min_index）
var DHP_MAX_INDEX = 122;             // main.cpp max_index（表共 152 列 = 122-(-30)）
var DHP_D_LIMIT = 18;                // 难度上限（main.cpp d_limit）
var DHP_D_OFFSET = 2;                // 答错难度步进（main.cpp d_offset）
var DHP_H_MAX = Math.pow(1.05, 122); // 毕业线 ≈ 414.6 天：达到即长期记忆达成
var DHP_IDX_MAX = 151;               // 表列数-1（共 152 列）
var DHP_IDX_LAST = 149;              // 9/24：最后一个「真实策略」列——150/151 是吸收态占位
                                     // （值塌到 1~3，只有 149 列的 ~1/3：dd2 由 3→1、dd18 由 7→3）。
                                     // 直接按 151 钳制会把「半衰期 348~385 天、再答对一次就毕业」的词
                                     // 又排回明天（死亡谷）。查表一律钳到本列：这类词拿到 149 列的间隔，
                                     // 下次答对即跨过 DHP_H_MAX 毕业，不再被拉回来。
var DAILY_DUE_CAP = 60;              // 每日到期上限（含新词）：buildQueue 排序后截断，截掉的明天队首

// ======= v7.1 三改（她拍板 2026-09-23）：控总量 + 熟词快速通道 + 难度回落 =======
var FAST_FIRST_MS = 3000;            // 熟词快速通道：首次复习（无 lastReview）看词 3 秒内答对 → 初始间隔 +3 天起步
var FAST_FIRST_AUDIO_MS = 5000;      // 听音题要等发音播完才能答，秒答阈值放宽到 5 秒
var DHP_FAST_FIRST_DH = 14;          // 秒答视为「很熟」：dh 抬到该值（首刷间隔直接 +3 天不查表；dh=14 保证下一轮表查得 10 天+，自然衔接）
var DD_RECOVER_AFTER = 3;            // dd 回落：连续 ≥3 次复习全对（hist 尾部 ok 连击，含本次）→ dd 每轮 -1（下限 1），老错词逐步恢复正常间隔

// ======= design/54 趣味性反馈（2026-09-07）=======
// 连击门槛：每连对 STREAK_BOOST 题触发一次 ×2 高光；答错减半不归零。
// streak/xp 只存 pq 内存态（刷新即重置），禁止写 DATA、禁止走 hubSave、禁止参与 mergeData。
const STREAK_BOOST = 10;

// ======= 全局练习配置（与词库无关）=======
var PC_DEFAULTS = {
  rate: 0.9,
  repeat: 1,
  intervalMs: 1800,
  batchSize: 50,          // ⚠️ 9/24 下线（设置项已删、代码不再读）：每轮题量改由「每日学习上限」决定。字段保留只为老配置兼容
  newPerDay: 20,          // ⚠️ 9/25 下线（设置项已删、代码不再读）：总量只按「每日学习上限」dailyCap 为准。字段保留只为老配置兼容
  dailyCap: 0,            // 9/24 每日学习上限（0=不限）：首页「今日待学」按它显示，且背满就停（不再开新一轮）
  shuffle: true,
  autoNext: true,
  autoNextDelay: 1000,
  autoPlay: true,
  showCn: false,
  showEn: 0,              // 0=不显示 1=答错时显示 2=始终显示
  questionMode: 'visual', // 听音选义：visual=看词选义（默认，一切照旧）/ audio=听音选义（题干英文音标隐藏，先听后选）/ mixed=混合（每题约 50% 听音）
  optCount: 4,
  wrongHoldMs: 2500,
  fxFeedback: true        // design/54：连击与反馈层开关（设置弹窗「连击与反馈」）
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
  if(!(c.batchSize === -1 || (c.batchSize >= 1 && c.batchSize <= 500))) c.batchSize = PC_DEFAULTS.batchSize;   // -1=全部；1~500 自由输入，其余回退默认
  // newPerDay 已下线（9/25）：字段只做老配置兼容保留，钳位与读取一并撤销
  c.dailyCap = (typeof c.dailyCap === 'number' && !isNaN(c.dailyCap)) ? c.dailyCap : (typeof c.dailyCap === 'string' ? parseInt(c.dailyCap, 10) : PC_DEFAULTS.dailyCap);
  if(isNaN(c.dailyCap)) c.dailyCap = PC_DEFAULTS.dailyCap;
  if(!(c.dailyCap >= 0 && c.dailyCap <= 999)) c.dailyCap = PC_DEFAULTS.dailyCap;       // 0=不限；0~999 自由输入
  c.shuffle = !!c.shuffle;
  c.autoNext = !!c.autoNext;
  c.autoNextDelay = clampNum(c.autoNextDelay, 100, 30000, PC_DEFAULTS.autoNextDelay);
  c.autoPlay = !!c.autoPlay;
  c.showCn = !!c.showCn;
  c.showEn = clampNum(c.showEn, 0, 2, PC_DEFAULTS.showEn);
  c.questionMode = (['visual','audio','mixed'].indexOf(c.questionMode) !== -1) ? c.questionMode : PC_DEFAULTS.questionMode;   // 白名单外（旧数据/云同步脏值）回退看词
  c.optCount = clampNum(c.optCount, 2, 10, PC_DEFAULTS.optCount);
  c.wrongHoldMs = clampNum(c.wrongHoldMs, 1000, 5000, PC_DEFAULTS.wrongHoldMs);
  c.fxFeedback = !!c.fxFeedback;
  return c;
}
function pcSave(obj){
  if(!DATA.settings || typeof DATA.settings !== 'object') DATA.settings = {};
  const _before = DATA.settings.practiceCfg;
  DATA.settings.practiceCfg = Object.assign(pc(), obj);
  // 9/26：practiceCfg 已纳入跨端同步（SYNC_SETTINGS_FIELDS），合并按 _fieldTs 较新者胜。
  // pcSave 不经过 settings.js 的 _set()，没人替它打戳 → 两端时间戳都是 0 时 mergeData 会
  // 走「时间戳相同取云端」分支，本机刚改的「每日学习上限」会被云端旧值当场盖回去。
  if(JSON.stringify(_before) !== JSON.stringify(DATA.settings.practiceCfg)){
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs.practiceCfg = Date.now();
  }
  hubSave();
  // 9/25：改「每日学习上限」当场生效（目标数、剩余额度、完成卡状态都立刻按新上限重算）
  if(obj && Object.prototype.hasOwnProperty.call(obj, 'dailyCap')){
    try{ onDailyCapChanged(); }catch(e){}
  }
}

/* ======= 今日已练（9/25 修复）：答一个记一个，不再等整轮结束 =======
   旧口径 = wbDayStats().totalWords，只在 finishPractice 回写 → 背了几十个又改设置/刷新时
   「已背」被算成 0、上限白改（她 9/25 实测：400 背了几十个改 300，目标变 300 但已背归零）。
   新口径：内存 Set 实时记（每题作答即加），节流落盘（15 个 或 30s），离开页面前补一次 flush。 */
let _practicedSet = null;          // 今日已作答 unique 词（小写 en）
let _practicedDirty = 0;
let _practicedFlushAt = 0;
let _practicedBank = null;         // 9/26：该缓存属于哪个词库（custom / awl …）——切库必须失效
function practicedSet(){
  // 9/26 修：切换词库后缓存不失效 → 新词库沿用旧库的「今日已背」，
  // 「每日学习上限」按错库的数字算（如 custom 背了 5 个、切 AWL 后只能再背 5 个）。按库隔离缓存。
  const _a = (typeof wbActive === 'function') ? wbActive() : 'custom';
  if(_practicedSet && _practicedBank === _a) return _practicedSet;
  _practicedBank = _a;
  _practicedSet = new Set();
  try{
    const rec = (typeof wbPracticed === 'function') ? wbPracticed() : null;
    (rec && rec.words ? rec.words : []).forEach(k => { if(k) _practicedSet.add(String(k)); });
  }catch(e){}
  return _practicedSet;
}
function practicedCount(){ return practicedSet().size; }
function markPracticed(en){
  const k = String(en == null ? '' : en).trim().toLowerCase();
  if(!k) return;
  const s = practicedSet();
  if(s.has(k)) return;
  s.add(k);
  _practicedDirty++;
  const now = Date.now();
  if(_practicedDirty >= 15 || (now - _practicedFlushAt) > 30000) flushPracticed();
}
function flushPracticed(){
  if(!_practicedSet || _practicedSet.size === 0) return;
  try{
    if(typeof wbMarkPracticed === 'function') wbMarkPracticed(Array.from(_practicedSet));
    _practicedDirty = 0;
    _practicedFlushAt = Date.now();
  }catch(e){}
}
// 9/26：切换词库时调用——先按旧词库落盘（钩子已做，这里是保险），再让缓存失效重读
function resetPracticedCache(){
  try{ if(_practicedSet && _practicedSet.size) flushPracticed(); }catch(e){}
  _practicedSet = null; _practicedDirty = 0; _practicedFlushAt = 0; _practicedBank = null;
}
// 9/26：wordbank.js wbSetActive 在真正切换词库**之前**调用这个钩子（按旧词库路由落盘，避免写错库）
window.__onBeforeWbSwitch = function(){ try{ flushPracticed(); }catch(e){} };

/* 9/24：今日剩余配额 = 每日学习上限 − 今日已背。返回 null = 不限（沿用旧的「一轮 60 个」口径）。
   9/25：已背改读 practiced（实时），改上限后立刻按「已背不动、只看新上限」重算。 */
function dailyQuotaLeft(){
  const cap = Number(pc().dailyCap) || 0;
  if(cap <= 0) return null;
  return Math.max(0, cap - practicedCount());
}

/* 9/25：改完「每日学习上限」立刻生效（不用硬刷新）。
   已背数不动，只按新上限重判：之前停在「今日目标完成」卡而现在又有额度 → 直接重新开始出题；
   正在答题则不动队列，只提示新口径（已背 N / 新上限 M）。 */
function onDailyCapChanged(){
  try{ flushPracticed(); }catch(e){}
  const cap = Number(pc().dailyCap) || 0;
  const done = practicedCount();
  const onDoneCard = !!window.__quotaDoneShown;
  if(onDoneCard && (cap <= 0 || done < cap)){
    window.__quotaDoneShown = false;
    try{ pq = null; autoStartSeeWord(); }catch(e){}
    toast('上限已调整为 ' + (cap <= 0 ? '不限' : cap) + '，今天已背 ' + done + ' 个，继续背');
    return;
  }
  if(onDoneCard){ toast('今天已背 ' + done + ' 个，新上限 ' + cap + ' 仍是背满状态'); return; }
  toast('今日已背 ' + done + ' 个 · 每日上限 ' + (cap <= 0 ? '不限' : cap));
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
  // id 缺失的老词（早期版本 / 云合并拿到的旧快照）必须就地补 id：
  // 词库页的删除按钮 data-del 与勾选 data-check 都按 id 走 → 没 id 时所有老词共用一个
  // "undefined" 键，表现为「勾一个全勾上 / 点了删除毫无反应」。幂等：已有 id 不动。
  if(w.id == null || w.id === '') w.id = (typeof uid === 'function') ? uid() : ('w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  // design/77 DHP 迁移：只补 dh/dd 字段，不重算 nextReview、不改 level 现值——切换当天体验零突变。
  // 有复习史的词 dh0 = LEVEL_INTERVAL[level]（现体系认为该词撑得起这个间隔）；无史新词用初始公式。
  // 放在两条 return 路径之前 → 两条路径都覆盖；幂等（已有 dh 跳过）。
  if(w.dh == null){
    const d0 = Math.min(12, Math.max(1, 2 + (w.errTotal || 0) + (w.hardWord ? 3 : 0) + (w.keyWord ? 1 : 0)));
    w.dd = (w.dd != null) ? w.dd : d0;
    w.dh = (w.dh != null) ? w.dh : (w.level != null ? LEVEL_INTERVAL[Math.min(7, w.level || 0)] : dhpStartH(w.dd));
  }
  // 9/24：lastReview 是 design/77（9/21）才新增的写点——9/21 之前 promote 过的老词全都没有这个字段。
  // 缺它 → dhpRecallP 恒返回 null → 每次答对都走「首次复习」分支（p==null），dh 被重置回 dhpStartH(dd)
  // （1~3.6 天），把迁移来的 dh（最高 90）全抹掉；策略表在 dh<4 区间对任何 dd 都只给 1 天 → 答对了也白答、
  // 第二天全回来。她 9/24 实测：617 词里 615 个答对，295 个仍被排到明天。
  // 给「已练过的老词」补基准：优先 hist 末条日期，否则 nextReview 前推 round(dh) 天。
  // ⚠️ cleared!==true（从没练过）的真新词不补——它们走首次分支是设计（第二天巩固一次，答对后跳 5 天）。
  if(w.lastReview == null && w.cleared === true){
    const _lr = (Array.isArray(w.hist) && w.hist.length) ? (w.hist[w.hist.length - 1].d || null) : null;
    w.lastReview = _lr || (w.nextReview ? addDays(w.nextReview, -Math.max(1, Math.round(w.dh))) : null);
  }
  if(w.level != null && w.nextReview != null){
    if(w.cleared == null) w.cleared = !!w.lastReview;  // 已学过的词默认"已达标"(复习对1次即过)；新词需分散3次
    if(w.shortCount == null) w.shortCount = 0;
    if(w.lastShortTouch == null) w.lastShortTouch = null;
    if(w.cleanRounds == null) w.cleanRounds = 0;
    if(w.ipa == null) w.ipa = '';
    if(w.pos == null) w.pos = '';
    if(w.hist == null) w.hist = [];   // design/59：作答历史（调度事件史）
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
  w.hist = (w.hist != null && Array.isArray(w.hist)) ? w.hist : [];   // design/59
  return w;
}

// ── design/77 DHP 函数组（applyOverdue 逾期降级退役：逾期由 p 衰减自然表达，无单独惩罚）──
// p 一律先钳到 [0.01,0.99] 再进公式：防 (1-p)→0 导致答对不再涨、答错 ^-0.227 爆炸（方案 §2/§8）
function clampP(p){
  if(typeof p !== 'number' || isNaN(p)) return 0.01;
  return Math.min(0.99, Math.max(0.01, p));
}
// 新词初始半衰期（main.cpp cal_start_halflife 原样）
function dhpStartH(d){
  return -1 / Math.log2(Math.max(0.925 - 0.05 * d, 0.025));
}
// 当前回忆概率 p = 2^(−Δt/dh)：无 dh 或无 lastReview（从没复习过）→ null（出题排序垫底）
function dhpRecallP(w, today){
  if(w.dh == null || !w.lastReview) return null;
  return clampP(Math.pow(2, -daysBetween(w.lastReview, today) / w.dh));
}
// 答对后半衰期（=「认识」；main.cpp recall=1 分支原样，dd 不变）
function dhpAfterRecall(h, d, p){
  return h * (1 + Math.exp(3.81) * Math.pow(d, -0.534) * Math.pow(h, -0.127) * Math.pow(1 - p, 0.97));
}
// 答错后半衰期（=「模糊/不认识」，用旧 dd 算；main.cpp recall=0 分支原样）
function dhpAfterForget(h, d, p){
  return Math.exp(-0.041) * Math.pow(d, -0.041) * Math.pow(h, 0.377) * Math.pow(1 - p, -0.227);
}
// 半衰期 → 档位下标（main.cpp cal_halflife_index 原样；上钳制在查表处做）
function dhpHIndex(h){
  if(!(h > 0)) return 0;
  return Math.max(Math.round(Math.log(h) / Math.log(DHP_BASE)) - DHP_MIN_INDEX, 0);
}
// 策略表查间隔：表未加载回退旧 LEVEL_INTERVAL 口径 + warn，绝不允许白屏（方案 §6）
function dhpPolicyInterval(d, h){
  if(typeof DHP_POLICY === 'undefined' || !DHP_POLICY){
    console.warn('[dhp] 策略表未加载，回退 LEVEL_INTERVAL 口径');
    return LEVEL_INTERVAL[Math.min(7, displayLevelFromH(h))] || 1;
  }
  const row = DHP_POLICY[String(Math.min(DHP_D_LIMIT, Math.max(1, Math.round(Number(d) || 1))))] || DHP_POLICY['1'];
  const v = row ? row[Math.min(DHP_IDX_LAST, Math.max(0, dhpHIndex(h)))] : null;
  return (v >= 1) ? v : (LEVEL_INTERVAL[Math.min(7, displayLevelFromH(h))] || 1);
}
// level 保留为显示代理：满足 LEVEL_INTERVAL[L] ≤ dh 的最大 L（词库页 Lv 徽标/筛选/统计条零改动）
function displayLevelFromH(h){
  let L = 0;
  for(let i = 0; i < LEVEL_INTERVAL.length; i++){ if(h >= LEVEL_INTERVAL[i]) L = i; }
  return L;
}

// 长线升级（v4 §3.3 promoteLongTerm）：仅短线 3 次全对过关时调用
// P0-1：改为「先按当前 level 算间隔，再升级」，让 level0 新词首次复习=1天（不再跳过 LEVEL_INTERVAL[0]）
function promoteLongTerm(w, today, opts){
  w.lastPracticeAt = Date.now();   // design/84：最后练习时间——云合并同世代「最后练习者胜」的决胜字段
  w.hist = (Array.isArray(w.hist) ? w.hist : []); w.hist.push({ d: today, r: 'ok' });
  if(w.hist.length > 20) w.hist = w.hist.slice(-20);   // design/59：截断保留最近 20 条（judge 分支已显式落盘，此处禁加 hubSave）
  // design/77：选对=「认识」→ DHP 记忆增强（dd 不变）；间隔查 KDD'22 策略表；level=显示代理
  const p = dhpRecallP(w, today);                            // 用旧 dh/lastReview 算 p，须在覆写前取
  w.dd = (w.dd != null) ? w.dd : 3;
  // v7.1 熟词快速通道：首次复习（p==null ⇒ 从没练过）且秒答 → dh 抬到「很熟」档，表查得初始 +3 天起步（她拍板 9/23）
  const _fastFirst = (p == null) && !!(opts && opts.fast);
  w.dh = (p == null)
    ? (_fastFirst ? Math.max(dhpStartH(w.dd), DHP_FAST_FIRST_DH) : dhpStartH(w.dd))
    : dhpAfterRecall(w.dh, w.dd, p);
  // v7.1 dd 回落：连续 ≥DD_RECOVER_AFTER 次复习全对（hist 已含本次 ok，取尾部连击数）→ dd 每轮 -1（下限 1）。
  // dd 转移顺序：dh 增强按旧 dd 算（main.cpp 语义），dd 回落发生在 dh 之后、间隔查表之前 → 本次间隔即刻享受新 dd
  if(p != null && w.dd > 1){
    let _oks = 0;
    for(let i = w.hist.length - 1; i >= 0; i--){ if(w.hist[i] && w.hist[i].r === 'ok') _oks++; else break; }
    if(_oks >= DD_RECOVER_AFTER) w.dd = w.dd - 1;
  }
  w.lastReview = today;                                      // 新增写点：下次 p 的基准
  if(w.dh >= DHP_H_MAX){                                     // 毕业线：长期记忆达成，退出长线队列
    w.cleared = true;
    w.level = 7;
    w.nextReview = addDays(today, 180);
  } else {
    // v7.1 熟词快速通道：首刷秒答不查表（策略表对常见 dd 无「+3 天」稳定档：dd=3 行有非单调凹陷、dd=2 行 2 直接跳 4），
    // 直接排 +3 天起步；dh=DHP_FAST_FIRST_DH 已保证下一轮 p 衰减后经表查得更大间隔、自然衔接
    w.nextReview = _fastFirst ? addDays(today, 3) : addDays(today, Math.max(1, dhpPolicyInterval(w.dd, w.dh)));
    w.level = displayLevelFromH(w.dh);
    w.cleared = true;
  }
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
  w.lastPracticeAt = Date.now();   // design/84：答错/不认识也是一次练习——退步（okStreak 归零/nextReview 提前）要靠它传到另一端
  w.hist = (Array.isArray(w.hist) ? w.hist : []); w.hist.push({ d: today, r: isCompletelyUnknown ? 'unknown' : 'wrong' });
  if(w.hist.length > 20) w.hist = w.hist.slice(-20);   // design/59：截断保留最近 20 条（judge 分支已显式落盘，此处禁加 hubSave）
  // design/77：选错=「模糊」、点「不认识」=「不认识」——墨墨模型 responses_dict {'1':1,'2':0,'3':0}，
  // 两者都走遗忘转移（用旧 dd 算 h'，随后 dd+2，同 main.cpp 转移序）；语义差异保留在 errTotal/hist。
  const p = dhpRecallP(w, today);          // 用旧 dh/lastReview 算 p，须在覆写前取
  const dOld = (w.dd != null) ? w.dd : 3;
  w.dh = (p == null) ? dhpStartH(dOld) : dhpAfterForget(w.dh || dhpStartH(dOld), dOld, p);
  w.dd = Math.min(DHP_D_LIMIT, dOld + DHP_D_OFFSET);   // 先用旧 dd 算 h'，再抬难度
  w.lastReview = today;
  w.nextReview = addDays(today, 1);        // 强制明天，不按策略表计算（原样保留）
  w.errTotal = (w.errTotal || 0) + 1;      // 永久累计不重置
  if(isCompletelyUnknown){                 // P1-1：「完全不认识」= 毫无印象，惩罚更重
    w.errTotal = (w.errTotal || 0) + 1;    // 错误数额外 +1（level 额外降级已随 DHP 退役：难度由 dd 表达）
  }
  if(w.errTotal >= 2) w.hardWord = true;   // 自动标难词（无手动标记 UI）
  w.cleanRounds = 0;                       // 答错打断连续 clean（全局一行）
  w.shortCount = 0;
  w.lastShortTouch = null;                 // 清零时间戳置空
  recordDailyWrong(w.en);
}

// 9/24 一次性修复（她拍板）：今天答对、却因 lastReview 缺失被「首次复习」分支重置 dh、间隔塌成 1 天的词，
// 用 hist 里「早于今天」的最后一条作为复习基准，按正常的答对公式重算 dh 与 nextReview。
// 命中条件（避免误伤正常排程）：上次答对那天之后只排了 1 天 + dh 停在重置区间(<10) + 有更早的复习记录。
// 重算后仍是 1 天的词不动；真新词（今天才第一次见，hist<2 条）不动。
// 幂等：DATA._repairResetDhV 标记，只跑一次。真数据回放：命中 289、重排 285，明天到期 1109→824。
function repairResetDh(){
  try{
    if(DATA && DATA._repairResetDhV) return 0;
    if(DATA) DATA._repairResetDhV = true;
    const list = (typeof wbWords === 'function') ? (wbWords() || []) : [];
    if(!list.length) return 0;
    const today = todayKey();
    let n = 0;
    for(const w of list){
      if(!w || typeof w.en !== 'string' || !w.en.trim()) continue;
      if(!(w.dh != null && w.dh < 10)) continue;                    // dh 处于「被重置」区间
      if(!Array.isArray(w.hist) || w.hist.length < 2) continue;      // 今天才第一次见（真新词）不处理
      const last = w.hist[w.hist.length - 1];
      if(!last || last.r !== 'ok' || !last.d) continue;              // 只处理上次答对的
      if(w.nextReview !== addDays(last.d, 1)) continue;              // 只处理「答对后只排了 1 天」的
      let base = null;
      for(let i = w.hist.length - 1; i >= 0; i--){
        if(w.hist[i] && w.hist[i].d && w.hist[i].d !== today){ base = w.hist[i].d; break; }
      }
      if(!base) continue;                                            // 拿不到更早基准（纯粹今天才练）→ 不动
      const dd = (w.dd != null) ? w.dd : 2;
      const dt = Math.max(0, daysBetween(base, today));
      const dh = dhpAfterRecall(w.dh, dd, clampP(Math.pow(2, -dt / w.dh)));
      const interval = (dh >= DHP_H_MAX) ? 180 : Math.max(1, dhpPolicyInterval(dd, dh));
      if(interval <= 1) continue;                                    // 重算仍是 1 天就别动
      w.dh = dh;
      w.level = displayLevelFromH(dh);
      w.nextReview = addDays(today, interval);
      if(dh >= DHP_H_MAX){ w.cleared = true; w.level = 7; }
      // ⚠️ lastReview 不动：今天确实复习过，下次 p 的 Δt 要从今天起算（base 只用来算本次的遗忘程度）
      n++;
    }
    if(n && typeof wbSave === 'function') wbSave();
    return n;
  }catch(e){ console.warn('[repairResetDh]', e); return 0; }
}

// 9/24 一次性「旧账补偿」（她要求把 9/21–9/24 被 bug 反复拉回的重复劳动折成半衰期）：
// 按 hist 全链重放——从首次复习的初始 dh 出发，逐条按真实日期间隔套用答对/答错公式，
// 得到「这本该达到的 dh」。只补信用、绝不倒退：重放值 <= 当前 dh 的词不动。
// 幂等：DATA._repairDhReplayV 标记，只跑一次。真数据回放：379 个词补回信用（dh 27→78），明天到期再少 69。
function repairDhReplay(){
  try{
    if(DATA && DATA._repairDhReplayV) return 0;
    if(DATA) DATA._repairDhReplayV = true;
    const list = (typeof wbWords === 'function') ? (wbWords() || []) : [];
    if(!list.length) return 0;
    const today = todayKey();
    let n = 0;
    for(const w of list){
      if(!w || typeof w.en !== 'string' || !w.en.trim()) continue;
      if(!Array.isArray(w.hist) || w.hist.length < 2) continue;   // 没有可重放的链
      const dd = (w.dd != null) ? w.dd : 2;
      let dh = dhpStartH(dd), prev = null;
      for(const e of w.hist){
        if(!e || !e.d) continue;
        if(prev){
          const p = clampP(Math.pow(2, -Math.max(0, daysBetween(prev, e.d)) / dh));
          dh = (e.r === 'ok') ? dhpAfterRecall(dh, dd, p) : dhpAfterForget(dh, dd, p);
        }
        prev = e.d;
      }
      if(!(dh > 0) || !isFinite(dh)) continue;
      if(dh <= ((w.dh != null) ? w.dh : 0)) continue;             // 只补信用，不倒退
      const interval = (dh >= DHP_H_MAX) ? 180 : Math.max(1, dhpPolicyInterval(dd, dh));
      w.dh = dh;
      w.level = displayLevelFromH(dh);
      w.nextReview = addDays(today, interval);
      if(dh >= DHP_H_MAX){ w.cleared = true; w.level = 7; }
      n++;
    }
    if(n && typeof wbSave === 'function') wbSave();
    return n;
  }catch(e){ console.warn('[repairDhReplay]', e); return 0; }
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
// design/78：内部按 wbActive() 路由存储位置（custom=DATA.dailyWrong / official=banks[x].wrong），签名不变
function recordDailyWrong(en){
  wbRecordWrong(en);
}

// 今日错词去重集合（en 小写）：供空态/词库页「今日错词」入口计数与重练（只读，不清空——当日入口持续在，次日按日期自然切换）
function todayWrongEns(){
  return wbTodayWrongEns();
}

// 轻量词性推断（从英文后缀推断，纯 UI 显示用；数据有 pos 字段时优先使用）
function inferPos(en){
  var w = (en || '').toLowerCase();
  if(/tion$|sion$|ment$|ness$|ity$|ance$|ence$|ist$|er$|or$|dom$|ship$|th$/.test(w)) return 'n.';
  if(/ly$/.test(w)) return 'adv.';
  if(/able$|ible$|al$|ive$|ous$|ful$|less$|ic$|ent$|ant$|y$|ive$/.test(w)) return 'adj.';
  if(/ize$|ise$|ate$|ify$|en$/.test(w)) return 'v.';
  return '';
}

// 只取第一个词性，避免选项标签里塞多个词性（adj.;v.）
function singlePos(pos){ return String(pos || '').split(';')[0].trim(); }

// 编辑距离（Levenshtein，小写），拼写相似度的泛化度量——不针对个别词硬编码
function _lev(a, b){
  if(a === b) return 0;
  const m = a.length, n = b.length;
  if(!m) return n;
  if(!n) return m;
  let prev = [];
  for(let j = 0; j <= n; j++) prev.push(j);
  for(let i = 1; i <= m; i++){
    const cur = [i];
    for(let j = 1; j <= n; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
/* 易混淆度 0~1：编辑距离占比为基，同首字母/等长微加成（模拟读音相近的视觉混淆）。
   adapt vs adopt = 0.9，adapt vs adept = 0.9；不相干词对普遍 <0.5。≥0.55 视为易混淆。 */
function confusableScore(a, b){
  a = String(a || '').toLowerCase().replace(/[^a-z]/g, '');
  b = String(b || '').toLowerCase().replace(/[^a-z]/g, '');
  if(!a || !b || a === b) return 0;
  const d = _lev(a, b);
  let s = 1 - d / Math.max(a.length, b.length);
  if(a[0] === b[0]) s += 0.05;
  if(Math.abs(a.length - b.length) <= 1) s += 0.05;
  return Math.min(1, s);
}

/* 中文释义「撞意思」判据（之之 9/7：题干 expeditions 正确项「远征；探险；航行」与干扰项
   「探险；远征」意思雷同无法作答）。拆义项后存在完全相同、或互含（较短项 ≥2 字）的术语
   → 视为雷同，不能与正确答案/已选干扰项同题出现。
   ③ 实义字相撞（之之 9/7 10:51：specialised「专门的；特别的」vs 形近词 specific
   「明确的；特定的；细节」——无相同/互含义项但「特」字相撞，肉眼分不开）：
   去虚词（的/了/着…）后实义汉字交集 ≥1 且双方实义字数均 ≥2 → 判雷同。
   loose=true 跳过判据③（genDistractors 凑不满 4 选项时的兜底，出题优先）。 */
const _CN_STOP_CHARS = new Set([
  '\u7684', '\u4e86', '\u7740', '\u5f97', '\u5730', '\u4e4b',   // 的了着得地之
  '\u548c', '\u4e0e', '\u6216', '\u7b49', '\u4e5f', '\u90fd',   // 和与或等也都
  '\u5f88', '\u66f4', '\u5728', '\u4e0a', '\u4e0b', '\u4e2d', '\u4eec'  // 很更在上下中们
]);
function cnConflict(a, b, loose){
  a = String(a || ''); b = String(b || '');
  if(!a || !b) return false;
  if(a === b) return true;
  const terms = s => String(s).split(/[；;;﹔，,、\s]+/)
    .map(t => t.replace(/^[A-Za-z.\s]+/, '').trim())
    .filter(t => /[一-鿿]/.test(t));
  const ta = terms(a), tb = terms(b);
  for(const x of ta){
    for(const y of tb){
      if(!x || !y) continue;
      if(x === y) return true;
      if(Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x))) return true;
    }
  }
  if(loose) return false;
  // ③ 实义字相撞：只数汉字、去虚词；交集 ≥1 且双方实义字数均 ≥2（单字/短释义豁免，防「网」vs「网络」误伤）
  const coreSet = s => {
    const r = new Set();
    for(const ch of s){
      if(ch >= '\u4e00' && ch <= '\u9fff' && !_CN_STOP_CHARS.has(ch)) r.add(ch);
    }
    return r;
  };
  const sa = coreSet(a), sb = coreSet(b);
  if(sa.size >= 2 && sb.size >= 2){
    for(const ch of sa){ if(sb.has(ch)) return true; }
  }
  return false;
}

// 动态干扰项（v4 §3.7 genDistractors，适配 en/cn）：易混淆词优先（拼写相近泛化匹配，之之 9/7 要求），
// 其次同/相邻 level，最后随机补位。不写回 distractors，shuffle 不修改入参原数组。
// 选项类型严格一致：题干=单词→选项全是单词；题干=词组→选项全是词组。
// 类型按「英文含空格」判定（与 words.js isPhrase 一致）；不用 pos 判断——部分单词缺词性标注，无词性≠词组。
// 释义与正确答案「撞意思」（cnConflict）的词不进候选，防止两个选项意思雷同无法作答。
function genDistractors(correct, allWords){
  const cEn = String(correct.en || '').toLowerCase();
  const cCn = String(correct.cn || '');
  const cPhrase = /\s/.test(String(correct.en || '').trim());   // 词组=英文含空格
  const pool = shuffle(allWords.filter(w => {
    const e = String(w.en || '').toLowerCase();
    if(e === '' || e === cEn) return false;
    if(cCn && String(w.cn || '') === cCn) return false;   // 释义完全相同
    // 注：撞意思拦截统一放 pushIfNew（strict→loose 两轮），pool 阶段不踢——
    // 否则实义字判据拦掉的候选在兜底轮就找不回来了（9/7 10:51 之之要求选项不太像，但出题优先）
    if((/\s/.test(String(w.en || '').trim())) !== cPhrase) return false;   // 类型严格一致：单词题只配单词、词组题只配词组
    return true;
  }));
  // 易混淆排序：相似度降序；随机打底保证同分词对之间有变化
  const confusable = pool
    .map(w => ({ w, s: confusableScore(correct.en, w.en) }))
    .filter(x => x.s >= 0.55)
    .sort((x, y) => y.s - x.s)
    .map(x => x.w);
  const sameLevel = pool.filter(w => Math.abs((w.level || 0) - (correct.level || 0)) <= 1);
  const ordered = confusable.concat(sameLevel, pool);
  const uniq = [];
  const seenCn = new Set();
  const pushIfNew = (x, loose) => {
    const cn = String(x.cn || '');
    if(cn && !seenCn.has(cn) && !uniq.some(u => cnConflict(u.cn, cn, loose)) && !cnConflict(cCn, cn, loose)){
      seenCn.add(cn); uniq.push(x);
    }
  };
  for(const w of ordered){ if(uniq.length >= 3) break; pushIfNew(w); }
  // 兜底：实义字判据拦太狠凑不满 4 选项时，放宽判据③（保留完全相同/互含拦截）补位——出题优先
  if(uniq.length < 3){
    for(const w of pool){ if(uniq.length >= 3) break; pushIfNew(w, true); }
  }
  return shuffle([correct, ...uniq.slice(0, 3)]);
}

// 队列优先级排序（design/77 DHP 口径，p 由 buildQueue 经 pMap 注入，禁落盘）
// ① p 升序（快忘优先）：p 无法计算（从没复习过）垫底 = 先还旧账再学新词（之之 9/18 口径延续）
// ② nextReview 升序（逾期久=日期小=靠前；无排程垫底）③ errTotal 降序 ④ hardWord ⑤ keyWord ⑥ dh 升序
function dueCmp(a, b, pMap){
  const pa = (pMap && pMap.get(a) != null) ? pMap.get(a) : null;
  const pb = (pMap && pMap.get(b) != null) ? pMap.get(b) : null;
  const pad = (pa == null) ? 1 : 0;
  const pbd = (pb == null) ? 1 : 0;
  return (pad - pbd) ||
         ((pa != null && pb != null) ? (pa - pb) : 0) ||
         (a.nextReview || '9999-12-31').localeCompare(b.nextReview || '9999-12-31') ||
         (b.errTotal || 0) - (a.errTotal || 0) ||
         ((a.hardWord === b.hardWord) ? 0 : (a.hardWord ? -1 : 1)) ||
         ((a.keyWord === b.keyWord) ? 0 : (a.keyWord ? -1 : 1)) ||
         ((a.dh || 0) - (b.dh || 0));
}

// 队列构建（v4 §3.9 buildQueue）：筛 nextReview<=today + reconcile + 排序 + P1-2 新词配额
// _sliceCap：本轮最多出多少词。null/不传 = 旧的 DAILY_DUE_CAP(60)；9/24 起由「每日学习上限」的剩余配额传入，
// 这样设了上限 400 就是一轮 400，不必靠点 7 次「再来一轮」凑够。
function buildQueue(today, nowISO, _sliceCap){
  const c = pc();
  // design/78：数据源改走 wbWords()（custom = DATA.words 原样；官方 = 内存词数组）；过滤/排序/截断口径一字不动
  const due = (wbWords() || []).filter(w => {
    if(!w || typeof w.en !== 'string' || w.en.trim() === '') return false;
    ensureWordV12(w);
    return (!w.nextReview || w.nextReview <= today);
  });
  for(const w of due) reconcileShortCount(w, nowISO);   // 入队前恢复短线进度（仅变化时写库）
  // design/77：p 只进内存 Map 传给排序闭包，不写词对象 → hubSave 序列化永不带上临时字段
  const pMap = new Map();
  for(const w of due) pMap.set(w, dhpRecallP(w, today));
  due.sort((a, b) => dueCmp(a, b, pMap));

  // design/77：每日到期上限（含新词）。被截掉的词不动 nextReview，明天自然排在最前；
  // 9/24：原来「每轮题量」在这里之后再截一次，现已下线——一轮背多少由 autoStartSeeWord 按每日配额截断
  // 9/25：「每日新词上限」（newPerDay）也下线（她拍板：总量只按每日学习上限为准）——复习词与新词都不再单独立限
  const _reviews = due.filter(w => w.cleared === true);
  const _news = due.filter(w => w.cleared !== true);
  return _reviews.concat(_news).slice(0, (_sliceCap != null && _sliceCap > 0) ? _sliceCap : DAILY_DUE_CAP);
}

// ======= 今日已学词集合（跨轮累计，保证「第二轮不重复第一轮的词」）=======
// design/78：内部按 wbActive() 路由（custom=DATA.wordSeenToday / official=banks[x].seen），对外签名不变
function getTodaySeen(){
  return wbSeen();
}
function markSeen(words){
  wbMarkSeen(words);
}

/* 9/24：今日配额用尽的完成态（她拍板「背满上限才算停止」）。
   与「今天没有到期词」的空态严格区分：这里是有词可背，只是她自己设的上限背完了。
   出口只给「重练今天错词」（不占用配额），不放「再来一轮」——放就等于上限没生效。 */
function renderQuotaDone(){
  window.__quotaDoneShown = true;   // 9/25：改上限时据此判断是否要重新出题
  const cap = Number(pc().dailyCap) || 0;
  const done = practicedCount();
  const left = (wbWords() || []).filter(w => w && (w.cleared !== true || (w.nextReview || '') <= todayKey())).length;
  const wrongEns = (typeof todayWrongEns === 'function') ? todayWrongEns() : [];
  const wrongBtnHtml = (wrongEns.length && typeof startWrongReview === 'function')
    ? '<div style="margin-top:14px"><button class="btn btn-primary" id="quotaWrongBtn" title="重练今天答错/不认识的词">重练今天错词（' + wrongEns.length + '）</button></div>'
    : '';
  const area = $('#practiceArea'); if(area) area.hidden = false;
  const prog = $('#progBarWrap'); if(prog) prog.hidden = true;
  const nb = $('#nextBtn'); if(nb) nb.hidden = true;
  // 9/26：已背数 > 当前上限（先不限背了很多、之后把上限调小）→ 别显示「60 / 20」这种荒谬数字
  $('#practiceBody').innerHTML =
    '<div class="q-word">今日目标完成</div>' +
    '<div class="q-cn">' + (done > cap
      ? ('今天已经背完 ' + done + ' 个，超出当前上限 ' + cap + ' 个。')
      : ('今天已经背完 ' + done + ' / ' + cap + ' 个')) +
    (left ? ('，还有 ' + left + ' 个待学习的词明天再来。') : '。') +
    '<br>想多背就去「设置 → 每日学习上限」把它调大。</div>' + wrongBtnHtml;
  if(wrongEns.length && typeof startWrongReview === 'function'){
    const qb = document.getElementById('quotaWrongBtn');
    if(qb) qb.addEventListener('click', () => {
      const words = wrongEns.map(en => findWordByEn(en)).filter(Boolean);
      if(words.length) startWrongReview(words);
    });
  }
  if(typeof removeMasteredBtn === 'function') removeMasteredBtn();
  updateWordStats();
}

// ======= 进入学习（打开即按排程出题）=======
// design/78：改为 async——官方词库先 await 词包加载（custom 立即过）；出题/排程逻辑一字不动
async function autoStartSeeWord(){
  try{
    window.__quotaDoneShown = false;   // 9/25：开新一轮 → 完成卡标记复位（改上限时据此重判）
    cancelSpeak();
    removeMasteredBtn();   // 离开答题态：移除顶部「已掌握」按钮（空态/开始页不显示）
    updateWordStats();
    const area = $('#practiceArea'); if(area) area.hidden = false;
    const nextBtn = $('#nextBtn'); if(nextBtn) nextBtn.hidden = true;
    const prog1 = $('#progBarWrap'); if(prog1) prog1.hidden = true;

    // design/78：官方词库异步拉取词包；加载期间给占位，失败走底部统一重试 UI
    if(wbActive() !== 'custom' && !(typeof wbLoaded === 'function' && wbLoaded(wbActive()))){
      $('#practiceBody').innerHTML = '<div class="q-word">词库加载中…</div>';
    }
    await obBankReady(wbActive());

    const _wbAll = wbWords();
    if(wbActive() === 'custom'){
      if(!Array.isArray(_wbAll) || _wbAll.length === 0){
        // design/78：空态仅 custom 显示，文案下并列「去导入我的词库 / 先背官方 AWL」两个出口
        $('#practiceBody').innerHTML = '<div class="q-word">词库为空</div><div class="q-cn">切换到「词库」标签添加单词后再来学习。</div>' +
          '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn" id="emptyGoBank">去导入我的词库</button>' +
          '<button class="btn btn-primary" id="emptyGoOfficial">先背官方・AWL 570 学术词</button></div>';
        const _egb = document.getElementById('emptyGoBank');
        if(_egb) _egb.addEventListener('click', () => switchWordTab('bank'));
        const _ego = document.getElementById('emptyGoOfficial');
        if(_ego) _ego.addEventListener('click', () => { wbSetActive('awl'); pq = null; autoStartSeeWord(); });
        return;
      }
      if(_wbAll.length < 2){
        $('#practiceBody').innerHTML = '<div class="q-word">词库至少需要 2 个单词</div><div class="q-cn">「看词选义」需要选项作干扰项，请先加至少 2 个词。</div>';
        return;
      }
    } else if(!Array.isArray(_wbAll) || _wbAll.length === 0){
      throw new Error('官方词库加载为空');   // 词包固定 570 词不应出现空态；ready 后异常为空按失败处理
    }
    const today = todayKey();
    // —— 恢复或首次锁定当日词表 ——
    let session = wbSession();
    // 防污染：若本机 session 里 planEn 内已被标记为 passed 的词 >=95%，视为本轮已结束，强制开新轮。
    // 这种情况通常由跨设备 passed 并集污染导致（例如云端把本机未背的词也标记为已背，一打开就显示 20/20）。
    if(session && session.date === today && Array.isArray(session.planEn) && session.planEn.length > 0 && !session.finished){
      const _planSet = new Set(session.planEn.map(e => String(e).trim().toLowerCase()));
      const _passedInPlan = (session.passed || []).filter(e => _planSet.has(String(e).trim().toLowerCase()));
      if(_passedInPlan.length / session.planEn.length >= 0.95){
        session.finished = true;
        wbSave();
      }
    }
    // 上一轮已做完 -> 强制开新一轮（取全新待学习词）；否则续上当天未完成的轮次（不丢进度）
    const fresh = !session || session.date !== today || !Array.isArray(session.planEn) || session.planEn.length === 0 || session.finished === true;
    if(fresh){
      const c = pc();
      // 9/24：今日配额已用完 → 不再开新一轮（她拍板「背满每日上限才算停止」）
      const _q = dailyQuotaLeft();
      if(_q === 0){ renderQuotaDone(); return; }
      const all = buildQueue(today, nowISO(), _q);   // _q=null（不限）时沿用旧的 60 个/轮
      // 排除「今天任何一轮已经出过的词」，保证新一轮与上一轮完全不重复
      const seen = getTodaySeen();
      let plan = all.filter(w => !seen.words.includes(String(w.en || '').trim().toLowerCase()));
      if(plan.length === 0 && all.length > 0){
        // 今天到期的词本日各轮已全部出过（完成页点「再来一轮」的常见场景）：复用今日排程重开一轮，不误报空态
        plan = all.slice();
      }
      if(plan.length === 0){
        // 今天确实没有到期词：未掌握的词被记忆曲线排在之后几天，空态要说清数字，避免与首页「待学习」互相矛盾
        const pending = _wbAll.filter(w => w && w.cleared !== true).length;
        // 今日错词入口（9/21）：当天答错/不认识过的词随时可重练，不受到期排程限制；N=0 不显示
        const wrongEns = todayWrongEns();
        const wrongBtnHtml = (wrongEns.length && typeof startWrongReview === 'function')
          ? '<div style="margin-top:14px"><button class="btn btn-primary" id="dailyWrongBtn" title="重练今天答错/不认识的词">重练今天错词（' + wrongEns.length + '）</button></div>'
          : '';
        $('#practiceBody').innerHTML = '<div class="q-word">今天没有到期要复习的词</div>' +
          '<div class="q-cn">已学过的词都被记忆曲线排到了之后几天，今天不用复习。' +
          (pending ? '还有 ' + pending + ' 个没掌握的词，会在接下来按曲线依次出现。' : '') +
          '想多背可以去「词库」加词。</div>' + wrongBtnHtml;
        if(wrongEns.length && typeof startWrongReview === 'function'){
          const dwb = document.getElementById('dailyWrongBtn');
          if(dwb) dwb.addEventListener('click', () => {
            // 按 en 取活词对象（已不在词库的自动过滤），走通用重练通道
            const words = wrongEns.map(en => findWordByEn(en)).filter(Boolean);
            if(words.length) startWrongReview(words);
          });
        }
        clearDailySession();
        return;
      }
      // 之之 9/18：题序不再随机打乱——buildQueue 已按「逾期越久越先背」排序，shuffle 会把该顺序毁掉
      //（旧默认 shuffle:true 是「逾期词不先出」的真凶）。选项顺序仍由 makeOptions 独立乱序，不受影响。
      // 9/24：「每轮题量」设置已下线 —— 一轮的词数改由「每日学习上限」的剩余配额决定
      //（上限 0=不限时沿用旧口径：buildQueue 自己按 DAILY_DUE_CAP=60 截断）。buildQueue 已按复习优先级排序，直接截断即可。
      if(_q != null && plan.length > _q) plan = plan.slice(0, _q);
      // 之之 9/9 修正：开轮不再 markSeen（旧逻辑把整轮计划词在没背时就算「今日已练」→ 数字虚高、复用轮永远不动），
      // 改为 finishPractice 答完才计入；跨轮防重复出题改用「今日真实背完的词」过滤，中途放弃的词下一轮会重新出现（更合理）。
      session = {
        date: today,
        planEn: plan.map(w => String(w.en).trim().toLowerCase()),
        passed: [],
        queueOrder: plan.map(w => String(w.en).trim().toLowerCase()),
        currentEn: null,
        stats: { known:0, unknown:0 },
        total: 0,
        finished: false,
        lastTouch: Date.now(),
        sessionStart: Date.now()
      };
      wbSetSession(session);
      wbSave();
    }

    // —— 题量收归：今日剩余配额小于已锁定轮次词数时，截断到配额（保留已过的词，去除未开始的冗余词）——
    //    解决「设置改成 20 但当天已建过 50 词轮次、改设置不生效」的问题（之之 8/31 反馈；9/24 配额口径沿用）
    //    勾选练习轮（poolMode）不收归：她勾多少词就练多少，不受配额影响（9/17）
    {
      const _q = dailyQuotaLeft();
      const _cap = (_q != null) ? _q : session.planEn.length;
      if(!session.poolMode && session.planEn.length > _cap){
        const _passedSet = new Set((session.passed || []).map(e => String(e).trim().toLowerCase()));
        const _capEff = Math.max(_cap, _passedSet.size);   // 绝不丢弃已过的词
        const _order = (session.queueOrder && session.queueOrder.length) ? session.queueOrder : session.planEn;
        const _kept = _order.filter(en => _passedSet.has(en));
        const _rest = _order.filter(en => !_passedSet.has(en));
        const _newPlan = _kept.concat(_rest).slice(0, _capEff);
        session.planEn = _newPlan;
        session.queueOrder = _newPlan;
        wbSetSession(session);
        wbSave();
      }
    }

    // —— 重建内存会话：planEn 中未 passed、且仍在词库的，按 queueOrder 顺序 ——
    const s = session;
    // 只把「属于当前 planEn」的 passed 算进本轮进度；避免 mergeData 跨设备/跨轮次并集污染后 counted > initLen
    const sessionPassedInPlan = new Set((s.passed || []).filter(en => (s.planEn || []).includes(en)));
    pq = { mode:'study', queue:[], idx:0, initLen: s.planEn.length, correct: sessionPassedInPlan.size,
           lastEn: null,          // 9/26：上一题 en（小写，供顶部「← 上一词」回顾；pq.idx 恒 0 不可用）
           revealed:false, answer:null, wrongList:[],
           stats: s.stats || { known:0, unknown:0 },
           counted: new Set(sessionPassedInPlan), // 已过的词不重复计数（仅限本轮 planEn 内）
           passed: Array.from(sessionPassedInPlan),
           total: sessionPassedInPlan.size,       // 本轮已作答过的唯一词数
           reholdMap:{},   // P0-2：本词当场重考次数（仅内存，不持久化，key=小写单词）
           shortMode: new Set(),  // 本轮"答错/不认识过"的词集合 → 需短线分散重复3次才过
           attempts:{},    // 本词本轮作答次数（防死循环）
           sessionStart: s.sessionStart || Date.now() };
    const order = (s.queueOrder && s.queueOrder.length) ? s.queueOrder : s.planEn;
    pq.queue = order
      .map(en => findWordByEn(en))
      .filter(w => w && !(s.passed || []).includes(String(w.en).trim().toLowerCase()));
    // 续背恢复：把上次没重复满3次的词重新标记为 shortMode，继续分散重复
    for(const w of pq.queue){ if((w.shortCount || 0) > 0) pq.shortMode.add(String(w.en).trim().toLowerCase()); }
    $('#progBarWrap').hidden = false;
    updateWordStats();

    if(pq.queue.length === 0){
      s.finished = true; s.currentEn = null; wbSave();
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

// ======= 勾选练习：用词库勾选的词池强制开新轮（9/17 词库四件套）=======
// 无视当天已锁定的轮次与 batchSize 截断；session 带 poolMode 标记，题量收归段跳过。
function startSessionFromPool(poolEn){
  const ens = (poolEn || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
  const uniq = Array.from(new Set(ens));
  if(uniq.length < 2) return false;
  const words = uniq.map(en => findWordByEn(en)).filter(Boolean);
  if(words.length < 2) return false;
  try{
    cancelSpeak();
    removeMasteredBtn();
    const c = pc();
    let plan = words.slice();
    if(c.shuffle) plan = shuffle(plan);
    const session = {
      date: todayKey(),
      planEn: plan.map(w => String(w.en).trim().toLowerCase()),
      passed: [],
      queueOrder: plan.map(w => String(w.en).trim().toLowerCase()),
      currentEn: null,
      stats: { known:0, unknown:0 },
      total: 0,
      finished: false,
      lastTouch: Date.now(),
      sessionStart: Date.now(),
      poolMode: true        // 勾选练习轮标记：不参与题量收归
    };
    wbSetSession(session);
    wbSave();
    pq = null;
    switchWordTab('study');  // pq 为空 → autoStartSeeWord() 走「续上当天轮次」分支出题
    return true;
  }catch(err){
    console.error('[practice] startSessionFromPool 失败', err);
    return false;
  }
}

// ======= 当日词表锁定 + 进度持久化（草稿自动存档）=======
// 按 en（小写）在词库里取活词对象，用作当日 session 的稳定键。
// design/78：保留为 wbFind 的别名（数据源路由在 wordbank.js——custom 走 DATA.words、官方走内存词数组）
function findWordByEn(en){
  if(typeof wbFind === 'function') return wbFind(en);
  const k = String(en || '').trim().toLowerCase();
  if(!k) return null;
  return (DATA.words || []).find(w => String(w.en || '').trim().toLowerCase() === k) || null;
}
function clearDailySession(){
  if(wbSession()){ wbSetSession(null); wbSave(); }
}
// 把当前内存会话快照写入当日 session（仅当天有效），供刷新/跳转后恢复
// design/78：session 读写经 wbSession/wbSetSession 路由（custom=DATA.dailySession / official=banks[x].session）
function saveDailySession(){
  if(!pq) return;
  const s = wbSession();
  if(!s) return;
  if(pq.isWrongReview) return;                   // 重练错词是临时模式，不覆盖正常 dailySession
  if(s.date !== todayKey()) return;              // 只保存当天，跨天不污染
  s.passed = (pq.passed || []).slice();
  s.queueOrder = pq.queue.map(w => String(w.en || '').trim().toLowerCase());
  s.stats = { known: (pq.stats && pq.stats.known) || 0, unknown: (pq.stats && pq.stats.unknown) || 0 };
  s.total = pq.total || 0;
  s.initLen = pq.initLen || 0;
  s.sessionStart = pq.sessionStart || s.sessionStart || Date.now();
  const cur = pq.queue[pq.idx];
  s.currentEn = cur ? String(cur.en || '').trim().toLowerCase() : null;
  s.lastTouch = Date.now();
  wbSave();
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
  fitWordOneLine();   // 9/9：全屏字号基准不同（clamp 最大 52px），切换后要按新基准重算单行字号
  const btn = $('#fullscreenBtn');
  if(!btn) return;
  if(on){
    btn.title = '退出全屏';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M4 8V5a2 2 0 0 1 2-2h3m0 18H6a2 2 0 0 1-2-2v-3m18-3v3a2 2 0 0 1-2 2h-3m0-18h3a2 2 0 0 1 2 2v3"/></svg>';
  } else {
    btn.title = '全屏沉浸式背单词';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
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
  // design/78：官方词库静态只读——「已掌握」= 写入 prog 的毕业态（退出学习队列），不从词包删词
  if(wbActive() !== 'custom'){
    cur.cleared = true;
    cur.level = 7;
    cur.lastReview = todayKey();
    cur.nextReview = addDays(todayKey(), 180);
    pq.queue = pq.queue.filter(w => !same(w));
    if(!pq.isWrongReview){
      const s = wbSession();
      if(s && s.date === todayKey()){
        s.planEn = (s.planEn || []).filter(e => e !== k);
        s.queueOrder = (s.queueOrder || []).filter(e => e !== k);
        s.passed = (s.passed || []).filter(e => e !== k);
        pq.initLen = s.planEn.length;
      }
    }
    wbSave();
    if(!pq.isWrongReview) saveDailySession();
    toast('已掌握，该词不再出现在学习中');
    nextQuestion();
    return;
  }
  DATA.words = (DATA.words || []).filter(w => !same(w));
  pq.queue = pq.queue.filter(w => !same(w));
  // 墓碑（与 words.js deleteWord 同格式 'en:'+小写）：不记墓碑的话，云同步合并会把已掌握的词复活回来
  if(typeof addWordTombstone === 'function') addWordTombstone(cur.en);   // 内部已处理 deletedIds + 反向墓碑撤销
  else {
    DATA.deletedIds = DATA.deletedIds || [];
    const _tomb = 'en:' + String(cur.en || '').toLowerCase();
    if(!DATA.deletedIds.includes(_tomb)) DATA.deletedIds.push(_tomb);
  }
  // 从当日计划移除（分母缩减，不计入已掌握进度）
  if(!pq.isWrongReview && wbSession() && wbSession().date === todayKey()){
    const s = wbSession();
    s.planEn = (s.planEn || []).filter(e => e !== k);
    s.queueOrder = (s.queueOrder || []).filter(e => e !== k);
    s.passed = (s.passed || []).filter(e => e !== k);
    pq.initLen = s.planEn.length;
  }
  hubSave();
  if(!pq.isWrongReview) saveDailySession();
  toast('已掌握，已从词库删除');
  nextQuestion();
}

// 已掌握按钮：固定在进度条下方工具行（设置按钮左侧）——14:22 头部行只留 chip+数字（照 design/54 原型），
// 功能按钮整体下移。按钮随每题重绑当前词；非答题态（完成页/空态/错误态）由 removeMasteredBtn 移除。
function ensureMasteredBtn(cur){
  const ha = document.getElementById('wordToolsRow');
  if(!ha) return;
  let mb = document.getElementById('masteredBtn');
  if(!mb){
    mb = document.createElement('button');
    mb.id = 'masteredBtn';
    mb.type = 'button';
    mb.className = 'mastered-btn';
    mb.title = '已掌握：从词库删除该词（任何学习阶段都直接删除）';
    mb.textContent = '已掌握';
    ha.insertBefore(mb, ha.firstChild);
  }
  mb.onclick = () => masterWord(cur);
}
function removeMasteredBtn(){
  const mb = document.getElementById('masteredBtn');
  if(mb && mb.parentNode) mb.parentNode.removeChild(mb);
}

function nextQuestion(){
  if(!pq) return;
  // 9/23 她改口径：进练习/出题不再自动开「背单词」计时——要等她答了第一题（judge 入口）才开表，
  // 否则「只是打开页面看一眼」的时间也被算成背词时长。
  try{
    cancelSpeak();
    updateProgBar();
    if(pq.idx >= pq.queue.length){ finishPractice(); return; }
    // 9/25：上限中途被调低到「已背」以下 → 当场停（她拍板「背满就停」，不能靠剩下一轮慢慢扣）。
    // 只在本轮还没背完时触发；正常背满时是上面那行 finishPractice 先跑，不重复。
    if(!pq.isWrongReview && typeof dailyQuotaLeft === 'function' && dailyQuotaLeft() === 0){
      try{ flushPracticed(); const s0 = wbSession(); if(s0 && s0.date === todayKey()){ s0.finished = true; saveDailySession(); } }catch(e){}
      renderQuotaDone(); return;
    }
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
    removeMasteredBtn();   // 错误态没有可作答的当前词：移除「已掌握」按钮
    $('#practiceBody').innerHTML = '<div class="q-word">题目渲染失败</div>' +
      '<div class="q-cn">' + escapeHtml(String(err && err.message ? err.message : err)) + '</div>' +
      '<div style="margin-top:16px"><button class="btn" id="skipBad">跳过本题</button> <button class="btn btn-primary" id="retryStart2">重新开始</button></div>';
    const skip = $('#skipBad'), retry = $('#retryStart2');
    if(skip) skip.addEventListener('click', () => { if(pq){ pq.queue.splice(pq.idx, 1); nextQuestion(); } });
    if(retry) retry.addEventListener('click', () => { pq = null; autoStartSeeWord(); });
  }
}

/* 背词场景释义裁剪（9/7 之之要求两轮澄清后定版）：单词只展示**最常用的一个词性**（首个词性组）
   及**该词性下的全部中文释义**，后续词性组（"v. xxx"段起）整组不显示；词组全显。
   词库浏览页仍展示全部词性+释义（words.js formatMean），两场景互不影响。
   段首内联词性（"n. 理由；根据"）提进标签位返回，避免标签+释义重复显示词性。
   词性缩写白名单匹配（n/v/vt/vi/adj/adv/prep/…），防「U.S. 价格」式段首被误判为新词性组截断。 */
var _RE_POS_SEG = /^(n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|phrase|phr)\s*\.\s*(.*)$/i;
function practiceSense(w){
  const cn = String(w.cn || '').trim();
  if(/\s/.test(String(w.en || '')) || !cn) return { tag: '', cn };   // 词组/空释义：全显
  const segs = cn.split(/[；;;﹔]/).map(s => s.trim()).filter(Boolean);
  if(!segs.length) return { tag: '', cn };
  const pm = segs[0].match(_RE_POS_SEG);
  const tag = pm ? pm[1].toLowerCase() + '.' : '';
  const parts = [pm ? pm[2] : segs[0]];
  for(let i = 1; i < segs.length; i++){
    if(_RE_POS_SEG.test(segs[i])) break;      // 撞到下一个词性组即停：只留最常用词性
    parts.push(segs[i]);
  }
  return { tag, cn: parts.filter(Boolean).join('；') };
}

function renderQuestion(cur, isRehold){
  if(!pq) return;
  pq.answer = cur;
  ensureWordV12(cur);    // design/77：applyOverdue 已退役——逾期由 p 衰减自然表达（出题排序 p 升序先考快忘的）
  const c = pc();
  pq.revealed = false;
  pq._picked = false;
  pq._qStartAt = Date.now();   // ETA：本题作答起点（重考/requeue 重置，重复作答时间自然累计；纯内存不落库）
  // 听音选义：决定本题呈现模式。当场重考（isRehold）沿用原模式（不让用户换题后从听切看）；
  // 混合模式每题独立掷币约 50% 听音；visual/audio 模式其余一切行为与旧版逐字节相同。
  if(!isRehold || !pq._curQMode){
    pq._curQMode = (c.questionMode === 'audio') ? 'audio'
      : (c.questionMode === 'mixed' ? (Math.random() < 0.5 ? 'audio' : 'visual')
      : 'visual');
  }
  const audioMode = (pq._curQMode === 'audio');

  const opts = genDistractors(cur, wbWords());

  let html = '';
  // ── 顶部区：上一词回顾 ──
  let top = '';
  // 9/26 修：「上一词回顾」原判据 `pq.idx > 0` 恒不成立 —— pq.idx 全程为 0（过词一律
  // splice(idx,1) 后队首滑到 idx，从不递增）→ 回顾区从未渲染过。改按 pq.lastEn 记录上一题。
  // （isRehold=当场重考同一词，回顾保持不变）
  const _lastEn = (!isRehold && pq.lastEn) ? pq.lastEn : '';
  if(_lastEn){
    const last = (typeof findWordByEn === 'function') ? findWordByEn(_lastEn) : null;
    if(last) top += '<div class="last-word">' +
      '<span class="lw-en">← ' + escapeHtml(last.en) + '</span>' +
      (last.ipa ? '<span class="lw-ipa">' + escapeHtml(last.ipa) + '</span>' : '') +
      (last.cn ? '<span class="lw-cn">' + escapeHtml(practiceSense(last).cn) + '</span>' : '') +
      '</div>';
  }
  html += '<div class="practice-topzone">' + top + '</div>';

  // ── 主区域（严格还原 v5 原型：单词+音标+中文居中，无例句无词性；中文答后才显示） ──
  // 已掌握按钮已上移至顶部 word-stats 行（见 ensureMasteredBtn），题干区不再放按钮
  // 听音选义：DOM 原样保留（pw-en/pw-ipa 内容照旧渲染），由 .pw-audio class + CSS 控制隐藏；
  // 提示文案原位插入；judge() 揭示时加 .pw-reveal 恢复显示。
  html += '<div class="practice-word-area' + (audioMode ? ' pw-audio' : '') + '">' +
    '<div class="pw-en">' + escapeHtml(cur.en) + '</div>' +
    '<div class="pw-ipa">' + (cur.ipa ? '/ ' + escapeHtml(cur.ipa) + ' /' : '&nbsp;') + '</div>' +
    (audioMode ? '<div class="pw-audio-hint">听发音，选释义 · 点喇叭重播</div>' : '') +
    '<div class="pw-cn" id="pwCn"></div>' +   /* 9/17：不再放 &nbsp;——全屏 evenly 态 pw-cn min-height:0 需要真空才生效；普通态题干区 min-height:120px 兜底，视觉无变化 */
  '</div>';

  // ── 选项网格（2×2） ──
  html += '<div class="opts-grid" id="opts"></div>';
  html += '<div class="answer-btns"><button class="abtn abtn-unknown" id="unknownBtn" title="不知道（按空格）">不知道</button></div>';

  // ── 底部喇叭大圆按钮（严格还原 v5 原型：居中 48px 圆） ──
  html += '<div class="pw-speaker-wrap"><button class="btn tool-btn" id="qSpeaker" title="再读一遍"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg></button></div>';

  const body = $('#practiceBody');
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map((o, i) => {
    const ps = practiceSense(o);
    const tag = singlePos(o.pos) || ps.tag || inferPos(o.en) || '';
    return '<button class="opt-big" data-en="' + escapeHtml(o.en) + '" data-idx="' + i + '" title="选项 ' + (i + 1) + '（按 ' + (i + 1) + '）">' +
      '<span class="opt-big-tag">' + escapeHtml(tag) + '</span>' +
      '<span class="opt-big-cn">' + escapeHtml(ps.cn) + '</span>' +
      '<span class="opt-big-en"></span>' +
    '</button>';
  }).join('');
  bindOpts(cur);
  // 9/26：记录「上一题」（不看 pq.idx —— 那个值恒为 0），下一题渲染时用它出回顾条；重考不覆盖
  if(!isRehold) pq.lastEn = String(cur.en).trim().toLowerCase();
  const left0 = document.getElementById('unknownBtn');
  if(left0) left0.onclick = () => judge(cur, null, false, true);
  ensureMasteredBtn(cur);
  const qsp = document.getElementById('qSpeaker');
  if(qsp) qsp.onclick = () => speakN(cur.en);
  if(c.autoPlay) setTimeout(() => speakN(cur.en), 300);   // autoPlay=false 时不自动朗读，仅手动点喇叭
  if(audioMode && !c.autoPlay) setTimeout(() => speakN(cur.en), 300);   // 听音题必须先发音：即便关了自动播报，本题也强制读一次（喇叭可手动重播）
  if(!audioMode) fitWordOneLine();   // 9/9：渲染完立即按单词长度自适应字号（听音题题干隐藏，揭示后再补算）
}

// 9/9 之之需求：题干单词固定一行显示，字号按长度自动收缩（长词变小、短词不变）。
// 做法：先清空 inline font-size 拿到 CSS 基准字号（9/13 起全屏/非全屏统一为 38px，矮屏 32px），
// 再逐 1px 下调直到 scrollWidth 不超出容器宽度；下限 15px（≈36 字符仍可单行）。
function fitWordOneLine(){
  const el = document.querySelector('#practiceBody .pw-en');
  if(!el) return;
  el.style.fontSize = '';                    // 还原基准值 → 切换全屏/改窗口后能重新取到正确起点
  const max = el.clientWidth;
  if(!max) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  if(!size) return;
  let guard = 40;
  while(el.scrollWidth > max + 1 && size > 15 && guard--){
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}
window.addEventListener('resize', () => {
  clearTimeout(window._fitWordT);
  window._fitWordT = setTimeout(fitWordOneLine, 160);
});

// 选项点击 → 立即判定对错（对=认识，错=不认识）；不另设「认识」按钮
function bindOpts(cur){
  document.querySelectorAll('#opts .opt-big').forEach(b => {
    b.addEventListener('click', () => {
      // 9/24 她需求：答错的强制停顿期内，主动点中正确答案 → 立刻按「重考答对」结算并跳转下一题，
      // 不用干等 wrongHoldMs；没点、或点的是错误选项 → 照旧等满停顿再重考（judge 的 rehold 分支）。
      if(pq.revealed && pq._holdTimer){
        if(b.dataset.en !== cur.en) return;            // 点错的不作数
        const c2 = pq._holdCur || cur;
        clearTimeout(pq._holdTimer); pq._holdTimer = null; pq._holdCur = null;
        pq.revealed = false;
        shortLineCorrect(c2, todayKey(), String(c2.en).trim().toLowerCase());
        saveDailySession();
        updateProgBar();
        updateWordStats();
        nextQuestion();
        return;
      }
      if(pq.revealed || pq._picked) return;
      pq._picked = true;
      judge(cur, b.dataset.en, b.dataset.en === cur.en, false);
    });
  });
}

/* 短线答对的统一出口（9/24）：judge() 的正常作答 与「答错停顿期内点中正确答案」走完全同一条口径，
   避免两条线各写一份导致计数不一致。n = 已分散答对次数（含本次）；够 SHORT_PASS 才 promote 过关，
   否则按 gapFor(n) 隔 N 个词插回。返回 'pass' / 'requeue'。 */
function shortLineCorrect(cur, today, k){
  const n = (cur.shortCount || 0) + 1;
  pq.reholdMap[k] = 0;                           // 已答对，重考链清零
  if(n >= SHORT_PASS){
    promoteLongTerm(cur, today);
    pq.queue.splice(pq.idx, 1);
    pq.correct++;
    pq.passed.push(k);
    pq.shortMode.delete(k);
    if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }   // 分散答对满 4 次，此时才算过
    if(!pq.isWrongReview){ const _ws = wbSession(); if(_ws) _ws.total = pq.total; }
    wbSave();
    return 'pass';
  }
  cur.shortCount = n;                            // 记录进度（持久化，续背接得上）
  cur.lastPracticeAt = Date.now();               // design/84：短线中途答对也是练习，进度要随最后练习者胜传出去
  pq.queue.splice(pq.idx, 1);
  const gap = gapFor(cur, n);                    // n=1→隔2、n=2→隔4、n=3→隔9（难词更密）
  const pos = Math.min(pq.queue.length, pq.idx + gap);
  if(pos >= pq.queue.length) pq.queue.push(cur);
  else pq.queue.splice(pos, 0, cur);
  wbSave();
  return 'requeue';
}

// 统一处理一次作答（4 选 1 直接判 / 点「完全不认识」）。
// 长线由 promote/demote 排程（design/77 DHP 策略表）；短线由 shortCount + gapFor 间隔插回队列实现「分散 4 次成功才放行」。
// P0-2（9/24 她拍板改）：答错 → 当场重考，一直重考到选对为止（不再「只重考 1 次」）。
function judge(cur, pickedEn, correct, isUnknownBtn){
  if(!pq || pq.revealed) return;
  // 9/23 她改口径：第一次作答才自动开「背单词」计时（原为进练习/出题即开——打开页面不动也算时长）
  // 9/26：真作答开的表不算「跳转误开」，撤销 30s 门槛标记（门槛只拦「点了任务但没学就走」的碎片）
  try{ window.__wordTimerByJump = false; maybeStartWordTimer(); }catch(e){}
  pq.revealed = true;
  // 云同步合并后页面闭包里的 cur 可能还是旧 DATA.words 的孤儿对象（common.js 只重映射 pq.queue）：
  // 作答前按 en 换成合并后的活对象，避免 promote/demote 写到旧对象上、hubSave 落盘时丢失。
  cur = findWordByEn(cur && cur.en) || cur;
  // 揭示反馈（照抄爱听写：词性标签变 "n. english" 格式，对=绿框，错=红框+正确也绿框）
  document.querySelectorAll('#opts .opt-big').forEach(x => {
    const isCorrect = (x.dataset.en === cur.en);
    const isWrong = (!correct && pickedEn != null && x.dataset.en === pickedEn);
    if(isCorrect || isWrong){
      // 在词性标签旁显示英文： "n." → "n. tone" / "n. loan"；空标签 → 直接显示英文
      const tagEl = x.querySelector('.opt-big-tag');
      if(tagEl){
        var pos = tagEl.textContent.trim();
        tagEl.textContent = pos ? (pos + ' ' + x.dataset.en) : x.dataset.en;
      }
    }
    if(isCorrect) x.classList.add('correct');
    if(isWrong) x.classList.add('wrong');
    // 9/24：正确答案保持可点——答错停顿期内点中它即立刻跳转（见 bindOpts）；其余选项一律锁死。
    // 答对场景点它无副作用（bindOpts 只在 pq._holdTimer 存在时才认，那是答错停顿期的凭证）。
    if(!isCorrect) x.style.pointerEvents = 'none';
  });
  // 揭示题干中文释义（背词场景只显示最常用的第一义项，词组全显——9/7 之之要求）
  const reveal = document.getElementById('pwCn');
  if(reveal && cur.cn){
    reveal.textContent = practiceSense(cur).cn;
  }
  // 听音题揭示：.pw-reveal 让 CSS 恢复题干英文/音标显示（提示文案随之隐藏），再按词长补一次自适应字号
  const warea = document.querySelector('#practiceBody .practice-word-area');
  if(warea && warea.classList.contains('pw-audio')){
    warea.classList.add('pw-reveal');
    fitWordOneLine();
  }
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.style.pointerEvents = 'none'; ub.disabled = true; }

  const k = String(cur.en).toLowerCase();
  // 9/25：答一个记一个（今日已练 → 每日上限的已背数），与 counted（过关进度）是两套计数
  try{ markPracticed(cur.en); }catch(e){}
  if(!pq.counted) pq.counted = new Set();
  // 进度计数口径（9/7 之之要求）：一个词「完全过去」才计数——答错进短线重复的词，要分散过完 3 遍全对才 +1。
  // counted/total 的自增移到下方两个 pass 分支；judge 入口只记对错 stats。
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
  // v7.1 秒答判定：本题展示到作答的耗时（pq._qStartAt 在 renderQuestion 重置）；听音题放宽阈值
  const _fastMs = (pq && pq._qStartAt) ? (Date.now() - pq._qStartAt) : Infinity;
  const _fastThresh = document.querySelector('#practiceBody .practice-word-area.pw-audio') ? FAST_FIRST_AUDIO_MS : FAST_FIRST_MS;
  const _fast = _fastMs < _fastThresh;
  const nowStr = nowISO();
  const cnTxt = cur.cn ? ' · ' + cur.cn : '';
  let result;

  if(correct){
    // 从未答错过的词 → 选对直接过（v5 核心变更：一直对的词不重复3次）
    const inShort = pq.shortMode && pq.shortMode.has(k);
    if(!inShort){
      promoteLongTerm(cur, today, { fast: _fast });   // v7.1：秒答信息只对「首次复习」生效（p==null 分支内部判断）
      pq.queue.splice(pq.idx, 1);
      pq.correct++;
      pq.passed.push(String(cur.en).trim().toLowerCase());
      if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }   // 完全过关才计入进度
      if(!pq.isWrongReview){ const _ws = wbSession(); if(_ws) _ws.total = pq.total; }  // 持久化，刷新续背时不丢（design/78 路由）
      wbSave();
      result = 'pass';
    } else {
      // 答错/不认识的词 → 短线分散重复：需分散答对 SHORT_PASS(4) 次才过关（9/24 她拍板，原 3 次）
      result = shortLineCorrect(cur, today, k);
    }
  } else {
    demoteLongTerm(cur, today, !!isUnknownBtn); // P1-1：点「完全不认识」时惩罚加重
    if(!pq.shortMode) pq.shortMode = new Set();
    pq.shortMode.add(k);                          // 标记：该词进入短线重复模式
    // 9/24 她拍板：答错就当场重考，一直重考到选对为止（原「只重考 1 次，再错就隔 1 个插回」）
    // 兜底仍在：MAX_ATTEMPT(15) 次还没答对 → 移出本轮队列，留到明天（下方死循环防护）
    // （errTotal 由 demoteLongTerm 每次 +1，此处不额外加，避免重考链把错误数刷爆）
    pq.reholdMap[k] = (pq.reholdMap[k] || 0) + 1;
    wbSave();   // 显式落盘：重练错词模式下 saveDailySession 会跳过，不落盘则本次降级/dailyWrong 全丢（design/78 路由）
    result = 'rehold';
  }

  // 死循环防护：同一词本轮作答次数过多 → 强制移出队列（保持降级状态，明天再来）
  if(result !== 'pass' && (pq.attempts[k] || 0) >= MAX_ATTEMPT){
    const at = pq.queue.indexOf(cur);
    if(at >= 0) pq.queue.splice(at, 1);
    pq.reholdMap[k] = 0;
    if(pq.shortMode) pq.shortMode.delete(k);
    cur.shortCount = 0;
    if(!pq.wrongList) pq.wrongList = [];
    if(!pq.wrongList.some(x => String(x.en).toLowerCase() === k)){
      pq.wrongList.push({ en: cur.en, cn: cur.cn || '', user: '(本轮放弃)', grade: 'unknown' });
    }
    wbSave();
    result = 'requeue';
    // toast 已删
  }

  // ETA 剩余时间预估（纯内存 pq，禁止落库/进云同步）：每次判定结算本段作答耗时；
  // 完全过关（result='pass'）才计完成题数——重考/requeue 的重复作答时间都算进总耗时，滚动平均自然反映真实节奏
  if(pq._qStartAt){
    pq._etaMs = (pq._etaMs || 0) + Math.max(0, Date.now() - pq._qStartAt);
    pq._qStartAt = null;
  }
  if(result === 'pass') pq._etaDone = (pq._etaDone || 0) + 1;

  updateProgBar();
  updateWordStats();
  saveDailySession();   // 每次作答后持久化进度（草稿自动存档）

  if(result === 'rehold'){
    // 9/24 她需求：答错后的强制停顿期内，若她主动点中了正确答案 → 立刻算「重考答对」并跳转，
    // 不用干等到 wrongHoldMs 结束（没点或点错了就照旧等满）。pq._holdTimer 是「停顿期」的凭证，
    // 到期/被点掉都要清空，否则后续点击会误触发。
    clearTimeout(pq._holdTimer);
    pq._holdCur = cur;
    pq._holdTimer = setTimeout(() => {
      pq._holdTimer = null; pq._holdCur = null;
      if(pq && pq.revealed){ pq.revealed = false; renderQuestion(cur, true); }
    }, c.wrongHoldMs);
  } else {
    // 注意：cur 已从队列移除并被重新插到 idx 之后，队首已「滑」到 pq.idx，故不递增 idx
    const delay = correct ? c.autoNextDelay : 1400;
    setTimeout(() => { if(pq && pq.revealed){ nextQuestion(); } }, delay);
  }

  // ── design/54 趣味性反馈（只追加，不动上方任何过词逻辑/跳转时机）──
  // streak/xp 只存 pq 内存态，禁止写 DATA、禁止 hubSave、禁止参与 mergeData。
  if(!pq.streak) pq.streak = 0;
  if(!pq.maxStreak) pq.maxStreak = 0;
  if(!pq.xp) pq.xp = 0;
  if(correct){
    pq.streak++;
    if(pq.streak > pq.maxStreak) pq.maxStreak = pq.streak;
    pq.xp += 10;
  }else{
    pq.streak = Math.floor(pq.streak / 2);   // 减半不归零（10→5），全程无惩罚文案
  }
  updateWordStats();
  // 之之 9/7 11:03：答对/答错气泡与流转条模块整体撤掉（实测=纯噪音）；其余照 design/54 原型。
  // 答错时顶部 chip 切红心「再认一次就记住」（原型状态3），下一题 renderQuestion→updateWordStats 自动恢复连击文案。
  if(!correct && c.fxFeedback){
    const chip = document.getElementById('streakChip');
    if(chip){
      chip.hidden = false;
      chip.classList.remove('boost');
      chip.classList.add('heart');
      const num = document.getElementById('streakNum');
      if(num) num.textContent = '再认一次就记住';
      const x2 = document.getElementById('x2Badge');
      if(x2) x2.hidden = true;
    }
  }
}

function finishPractice(){
  // 本轮「背单词」实际学习时长 = 距上一停留点（上一轮结束 / 计时开始）的增量，只计真实学习、不计轮间空隙
  let wordMs = 0;
  if(window.__wordTimerAuto && window.active && !window.active.ended && window.active.moduleId === WORD_TIMER_MODULE){
    const segStart = window.__lastSegTs || window.active.startTs || Date.now();
    wordMs = Math.max(0, Date.now() - segStart);
    window.__lastSegTs = Date.now();   // 标记本轮结束点，下一轮增量从此算起
  }
  // 完成一轮不立刻停止计时：进入 2 分钟宽限，期间若又开始背单词则保持连续（背单词合并成一段）
  scheduleWordTimerStop();

  // 之之 9/9 口径修正：只把「本轮实际作答完成」的词计入今日已练（答完才记，不再开轮即记）
  if(pq) markSeen([].concat(pq.passed || [], pq.wrongList || []));

  // 今日已练 = 今天真正作答过的 unique 词数（9/25：与每日上限的已背口径统一，答一个记一个）
  flushPracticed();
  const todayLearned = practicedCount();

  // 剩余待学习：未掌握或今天到期的词数
  const due = (wbWords() || []).filter(w => w && (w.cleared !== true || (w.nextReview || '') <= todayKey())).length;

  // 累加今日统计：时长累加，词数用今日 unique 数（覆盖，非累加）
  addTodayStats(todayLearned, wordMs);
  const { st: todaySt } = getTodayStats();

  // 之之 9/9 完成页改版：删三宫格（XP/最高连击按反馈去掉，待学习保留在统计行），勋章+标题+统计行保留
  const medalNum = pq ? (pq.correct || 0) : 0;
  // 今日清零终结态（9/21）：严格按 buildQueue 同口径（en 非空且无排程或已到期）计数今日到期词——
  // 不复用上方 due（那个口径含未掌握的未来词，会把「明天才再见」的词算成未清零）；isWrongReview 结束同样按此判定
  const todayDue = (wbWords() || []).filter(w => w && typeof w.en === 'string' && w.en.trim() !== '' && (!w.nextReview || w.nextReview <= todayKey())).length;
  const zeroCard = (todayDue === 0)
    ? '<div class="finish-zero-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>今天到期的词全部背完了</div>'
    : '';
  let bodyHtml = zeroCard +
      '<div class="finish-medal-row">' +
      '<div class="finish-medal"><div class="finish-medal-in">' + medalNum + '</div></div>' +
      '<div><div class="q-word" style="margin:0">完成！这一轮你坚持了 ' + formatMs(wordMs || todaySt.totalMs) + '</div>' +
      '<div style="margin-top:4px;font-size:14px;color:var(--muted)">今日已练 ' + todaySt.totalWords + ' 个 · 耗时 ' + formatMs(todaySt.totalMs) + ' · 剩余待学习 ' + due + ' 个</div></div>' +
    '</div>';
  const seen = new Set();
  const wrong = (pq.wrongList || []).filter(w => {
    const k = String(w.en).toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });
  if(wrong.length){
    // 之之 9/9 紧凑重设计：粉卡+提示条合并为一张卡，词条单行流式（词加粗+释义同行省略），去掉重复的说明条
    bodyHtml += '<div class="rw-card">' +
      '<div class="rw-head"><span class="rw-t">想再认一次的词</span><span class="rw-n">' + wrong.length + ' 个</span>' +
      '<span class="rw-s">立刻重练 · 1 周后只需复习 1 次</span></div>' +
      '<div class="rw-list">' + wrong.map(w =>
        '<div class="rw-row"><b>' + escapeHtml(w.en) + '</b>' +
        (w.cn ? '<span class="rw-cn">' + escapeHtml(w.cn) + '</span>' : '') + '</div>'
      ).join('') + '</div></div>';
  }
  bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0;gap:12px;flex-wrap:wrap">' +
    (wrong.length ? '<button class="btn" id="reviewWrongBtn">重练错词（' + wrong.length + '）</button>' : '') +
    '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  $('#practiceBody').innerHTML = bodyHtml;
  $('#progBarWrap').hidden = true;
  removeMasteredBtn();   // 完成页没有当前词：移除「已掌握」按钮，防误点删除
  updateWordStats();
  if(!pq.isWrongReview){
    const _fs = wbSession();   // design/78 路由
    if(_fs && _fs.date === todayKey()){ _fs.finished = true; _fs.currentEn = null; wbSave(); }
  }
  // ⭐ 9/19 修「换设备背词丢一截」（她实测：电脑背 200 剩 900，手机打开显示还剩 950）：
  // 旧上传链路有两个断点——① 正常通道 60s debounce，背完立刻关页/合盖就来不及传；
  // ② 关页兜底 sendBeacon 超过 60KB 直接放弃，而整库词远超 60KB → 兜底对大词库永不生效。
  // 结果=背词过程中每 3 分钟强制上传的批次都上云了，最后一批永远留在本机，
  // 另一台设备拉到的就是「同步了一部分」。一轮结束是她必经的停顿点，在此立即静默上传；
  // cloudUpload 内部有 hash 去重（数据没变化不 PUT），不浪费 KV 写入配额。
  if(typeof cloudUpload === 'function'){ try{ cloudUpload(false); }catch(e){} }
  const rwb = document.getElementById('reviewWrongBtn');
  if(rwb) rwb.addEventListener('click', () => startWrongReview(wrong));
  const rb = document.getElementById('restartBtn');
  if(rb) rb.addEventListener('click', restartToday);
}

// 完成页「重练错词」：用本轮答错的词生成临时队列，不影响正常 dailySession
function startWrongReview(wrongItems){
  if(!wrongItems || wrongItems.length === 0) return;
  cancelSpeak();
  const seen = new Set();
  const words = [];
  wrongItems.forEach(w => {
    const k = String(w.en).trim().toLowerCase();
    if(seen.has(k)) return;
    seen.add(k);
    const live = findWordByEn(w.en);
    if(live) words.push(live);
  });
  if(words.length === 0){ toast('未找到可重练的单词'); return; }
  pq = {
    mode:'study',
    queue: shuffle(words.slice()),
    idx: 0,
    lastEn: null,          // 9/26：重练模式下同样用 lastEn 记录上一题
    initLen: words.length,
    correct: 0,
    revealed: false,
    answer: null,
    wrongList: [],
    stats: { known:0, unknown:0 },
    counted: new Set(),
    total: 0,
    passed: [],
    reholdMap: {},
    attempts: {},
    sessionStart: Date.now(),
    isWrongReview: true
  };
  $('#progBarWrap').hidden = false;
  updateWordStats();
  updateProgBar();
  nextQuestion();
}

// ======= 每日单词学习统计（跨轮累计：再来一轮不清零）=======
// design/78：存储位置按 wbActive() 路由（custom=DATA.wordDayStats / official=banks[x].dayStats），签名不变
function getTodayStats(){
  return { key: todayKey(), st: wbDayStats() };
}
function addTodayStats(wordsCount, ms){
  wbAddDayStats(wordsCount, ms);
}
function formatMs(millis){
  const m = Math.floor(millis / 60000);
  const s = Math.floor((millis % 60000) / 1000);
  if(m < 1) return s + '秒';
  if(s === 0) return m + '分钟';
  return m + '分' + s + '秒';
}

/* ======= 背单词自动计时接入「计时」模块 =======
   用户常忘记开计时：进练习即自动开一个「背单词」计时（模块 id 与 data.js MODULES 的 vocab 一致），
   完成一轮/离开页面时结算进 DATA.sessions（首页「今日学习时长」与计时页「今日学习记录」都读它）。
   若本机已在跑「背单词」计时（手动在计时页开的，或上轮未结束的），绝不重复开，避免双份时长。 */
const WORD_TIMER_MODULE = 'vocab';
const WORD_TIMER_NAME = '背单词';
function wordTimerDeviceId(){
  try{
    let id = localStorage.getItem('hub_device_id');
    if(!id){ id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); localStorage.setItem('hub_device_id', id); }
    return id;
  }catch(e){ return 'd' + Date.now().toString(36); }
}
function isWordTimerActive(){
  const a = window.active;
  if(a && !a.ended && a.moduleId === WORD_TIMER_MODULE) return true;
  const m = DATA.activeTimer;
  if(m && !m.ended && m.timerId && m.moduleId === WORD_TIMER_MODULE) return true;
  return false;
}
/* ⭐ 正规结算「其他模块」的进行中计时（听力/口语/手动）：时长记到当前时刻（暂停折算），绝不丢表。
   （9/16 之之定版：背词打断其他计时=结束前一个再开新表；此前是无条件硬覆盖致听力计时丢失） */
function settleForeignTimerForWord(){
  const a = (window.active && !window.active.ended) ? window.active
          : ((DATA.activeTimer && !DATA.activeTimer.ended && DATA.activeTimer.timerId) ? DATA.activeTimer : null);
  if(!a || a.moduleId === WORD_TIMER_MODULE) return;   // 无表 / 本来就是背词表 → 交给既有逻辑
  const timerId = a.timerId;
  const endTs = Date.now();
  let pause = Number(a.pauseAccum) || 0;
  if(a.paused && a.pauseStart) pause += (endTs - a.pauseStart);
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs) - pause) / 1000));
  if(durationSec > 0 && !(DATA.sessions || []).some(s => s.timerId && s.timerId === timerId)){
    DATA.sessions = DATA.sessions || [];
    const names = (typeof resolveTimerNames === 'function')
      ? resolveTimerNames(a)
      : { moduleName: a.moduleName || '学习', subName: a.subName || '' };
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(a.startTs),
      moduleId: a.moduleId, subId: a.subId || a.moduleId,
      moduleName: names.moduleName, subName: names.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
  try{
    document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
    document.dispatchEvent(new CustomEvent('hub:timer-state'));
  }catch(e){}
}
function maybeStartWordTimer(){
  // 一轮结束后处于「2 分钟宽限」中又开始学习 → 取消停止计时，保持连续（背单词合并成一段）
  if(window.__wordTimerStopTimer){
    clearTimeout(window.__wordTimerStopTimer);
    window.__wordTimerStopTimer = null;
    window.__lastSegTs = Date.now();
  }
  // 本页之前已自动开、且仍活跃 → 保持，不重复开
  if(window.__wordTimerAuto && window.active && !window.active.ended && window.active.moduleId === WORD_TIMER_MODULE) return;
  // 已有任意进行中的「背单词」计时（手动开的或其他入口）→ 不重复开、也不接管提交
  if(isWordTimerActive()) return;
  // ⭐ 其他模块的进行中计时（听力/口语/手动）→ 先正规结算（时长记到打断时刻，不丢），再往下开背词新表
  //（9/16 之之定版：被打断=结束前一个再重新计；第一版「静默不开表」不合她的用法，已废弃）
  settleForeignTimerForWord();
  const now = Date.now();
  const id = uid();
  const dev = wordTimerDeviceId();
  window.active = {
    timerId: id, ownerDevice: dev, moduleId: WORD_TIMER_MODULE, moduleName: WORD_TIMER_NAME,
    subId: WORD_TIMER_MODULE, subName: WORD_TIMER_NAME,
    startTs: now, startMonoNs: null, paused: false, pauseStart: null, pauseAccum: 0,
    pauseStartMonoNs: null, pauseAccumMonoNs: 0, targetSec: null, mode: 'up',
    updatedAt: now, lastBeat: now
  };
  DATA.activeTimer = {
    timerId: id, ownerDevice: dev, moduleId: WORD_TIMER_MODULE, moduleName: WORD_TIMER_NAME,
    subId: WORD_TIMER_MODULE, subName: WORD_TIMER_NAME,
    startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
    targetSec: null, mode: 'up', updatedAt: now, lastBeat: now, ended: false
  };
  window.__wordTimerAuto = true;
  window.__lastSegTs = window.active.startTs || Date.now();
  hubSave();
}
// 一轮结束后的「2 分钟宽限」：到时仍未继续背单词才结算本轮「背单词」时长；期间开始新的一轮则取消（保持连续）
function scheduleWordTimerStop(){
  if(!window.__wordTimerAuto) return;          // 手动计时等不由本模块接管，跳过
  if(window.__wordTimerStopTimer) clearTimeout(window.__wordTimerStopTimer);
  window.__wordTimerStopTimer = setTimeout(() => {
    window.__wordTimerStopTimer = null;
    // 宽限结束：只计到上一轮结束点（window.__lastSegTs），不把轮间空隙算进学习时长
    commitWordTimer(window.__lastSegTs || Date.now());
  }, 120000);
}
// 9/26（她拍板 30s）：autostart 跳转自动开的计时，若 <30s 就结束 → 视为误点，不落 session。
// ⚠️ 顶层 var 且必须在 commitWordTimer 之前（defer 脚本同步执行期就赋值，避免 TDZ）。
var WORD_AUTO_MIN_SEC = 30;
function commitWordTimer(endTsOverride){
  if(!window.__wordTimerAuto) return;
  const a = window.active;
  if(!a || a.ended || a.moduleId !== WORD_TIMER_MODULE){ window.__wordTimerAuto = false; window.__wordTimerByJump = false; return; }
  const timerId = a.timerId;
  // 正常离开：计到当前；处于「轮间宽限」时：只计到上一轮结束点（不把空隙算进学习时长）
  const endTs = (endTsOverride != null) ? endTsOverride
              : (window.__wordTimerStopTimer ? (window.__lastSegTs || Date.now()) : Date.now());
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs)) / 1000));
  DATA.sessions = DATA.sessions || [];
  const already = DATA.sessions.some(s => s.timerId && s.timerId === timerId);
  // 9/26（她拍板 30s）：autostart 跳转开的表，若人没真学就走了（<30s）→ 不落库，避免几秒的碎片记录。
  // 真答过题开的表（judge 里清标记）不受此限，短学也记。
  const _minSec = window.__wordTimerByJump ? WORD_AUTO_MIN_SEC : 1;
  if(!already && durationSec >= _minSec){
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(), moduleId: a.moduleId, subId: a.subId,
      moduleName: a.moduleName, subName: a.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: 0
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
  window.__wordTimerAuto = false;
  window.__wordTimerByJump = false;
  try{
    document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
    document.dispatchEvent(new CustomEvent('hub:timer-state'));
  }catch(e){}
}
// 离页兜底：关标签页 / 切到别的程序时结算本次计时（防悬挂的进行中计时）
// 9/25：顺手把「今日已练」未落盘的部分补写，避免背了几十个就切走时上限计数丢掉
if(!window.__wordTimerLeaveHook){
  window.__wordTimerLeaveHook = true;
  const _onLeave = () => { try{ commitWordTimer(); }catch(e){} try{ flushPracticed(); }catch(e){} };
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') _onLeave(); });
  window.addEventListener('beforeunload', _onLeave);
}

function updateWordStats(){
  // 9/26（她拍板）：设了「每日学习上限」（>0）→ 进度条显示「今日累计已背 / 上限」，
  // 背了 100 再进来是「100 / 300」，不再是「0 / 200」（旧口径只数本轮、每轮重置，看着像从头开始）。
  // 上限 = 0（不限）时维持原口径「本轮第几个 / 本轮总数」。
  let progress = '0/0';
  const _progCap = Number(pc().dailyCap) || 0;
  if(_progCap > 0){
    progress = Math.min(practicedCount(), _progCap) + ' / ' + _progCap;
  } else if(pq){
    // 进度条显示「本轮读到第几个 / 本轮总数」，例如 3/50
    const total = pq.initLen || pq.queue.length || 0;
    // 9/7 口径：只数「完全过关」的词（答错进短线的词过完 3 遍全对才计入），不含正在看的题
    const current = Math.min(pq.counted ? pq.counted.size : 0, total);
    progress = current + ' / ' + total;   // 14:22 对齐 design/54 原型数字格式「7 / 20」
  } else if(wbSession() && wbSession().date === todayKey() && !wbSession().finished){
    // 仅「进行中」的当日 session 才用其进度；已完成/过期的 session 不再当作当前进度（避免重开即显 20/20）
    const s = wbSession();
    const total = (s.planEn || []).length;
    const inPlanPassed = (s.passed || []).filter(en => (s.planEn || []).includes(en)).length;
    const answered = Math.min(total, inPlanPassed);
    progress = answered + ' / ' + total;
  }
  const el = $('#statProgress'); if(el) el.textContent = progress;

  // ETA 剩余时间预估（9/21，纯内存）：完全过关 ≥3 题且队列仍有未过词时，按滚动平均每题耗时 × 剩余词数估算。
  // 样本不足/无剩余/完成页/空态一律隐藏；续背刷新后随答题自然收敛，不要求跨刷新精确。
  const etaEl = document.getElementById('statEta');
  if(etaEl){
    let etaShow = false, etaTxt = '';
    if(pq && (pq._etaDone || 0) >= 3 && pq.queue && pq.queue.length > 0 && pq._etaMs > 0){
      const remainMs = (pq._etaMs / pq._etaDone) * pq.queue.length;
      etaTxt = (remainMs < 60000) ? '<1 分' : ('约剩 ' + Math.min(999, Math.round(remainMs / 60000)) + ' 分');
      etaShow = true;
    }
    etaEl.hidden = !etaShow;
    etaEl.textContent = etaTxt;
  }

  const bar = $('#wordStats'); if(bar) bar.hidden = false;
  const tools = document.getElementById('wordToolsRow'); if(tools) tools.hidden = false;   // 进度条下按钮行随练习态显示

  // design/54：连击 chip（streak ≥1 才显示；满 STREAK_BOOST 的整数倍触发 ×2 高光；开关关闭则永不显示）
  const chip = document.getElementById('streakChip');
  if(chip){
    const s = (pq && pq.streak) || 0;
    const boost = s > 0 && s % STREAK_BOOST === 0;
    chip.hidden = s < 1 || pc().fxFeedback === false;
    chip.classList.remove('heart');
    chip.classList.toggle('boost', boost);
    const num = document.getElementById('streakNum');
    if(num) num.textContent = '连击 ' + s;
    const x2 = document.getElementById('x2Badge');
    if(x2) x2.hidden = !boost;
  }
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
        // 9/24：batchSize（每轮题量）已下线——一轮背多少改由「每日学习上限」的剩余配额决定
        // 9/25：newPerDay（每日新词上限）已下线——总量只按「每日学习上限」为准
        { key:'dailyCap',      label:'每日学习上限',  type:'num', min:0, max:999, unit:' 个', desc:'0 = 不限；背满就停，首页「今日待学」按它显示' },
        { key:'questionMode',  label:'题型',          type:'select', opts:[{v:'visual',t:'看词选义'},{v:'audio',t:'听音选义'},{v:'mixed',t:'混合'}] },
        { key:'shuffle',       label:'勾选练习乱序',  type:'toggle' },
        { key:'wrongHoldMs',   label:'答错停留',      type:'range', min:1000, max:5000, step:500, unit:'ms' },
        { key:'autoNextDelay', label:'自动间隔',      type:'range', min:300, max:3000, step:100, unit:'ms' },
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
      name:'连击显示', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-2px" aria-hidden="true"><path d="M13 2L4.5 12.5H11L9.5 22 19 10h-6.5L13 2z"/></svg>',
      items:[
        { key:'fxFeedback', label:'连击显示', type:'toggle' },
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
        html += '<select class="cfg-batch-select" data-key="' + item.key + '">';
        for(const p of presets) html += '<option value="' + p.v + '"' + (String(val) === p.v ? ' selected' : '') + '>' + p.t + '</option>';
        html += '</select>';
      } else if(item.type === 'num'){
        // v7.2 自由数字输入（她拍板：参数不许只给档位）
        html += '<input type="number" class="cfg-num" data-key="' + item.key + '" min="' + item.min + '" max="' + item.max + '" step="' + (item.step || 1) + '" value="' + Number(val) + '" style="width:76px;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:6px;background:var(--card,#fff);color:var(--text,#222)">';
        if(item.unit) html += '<span class="cfg-range-val">' + escapeHtml(item.unit) + '</span>';
      } else if(item.type === 'numall'){
        // v7.2 每轮题量：自由数字 + 「全部」勾选（勾上= batchSize -1，输入框禁用）
        const isAll = Number(val) === -1;
        html += '<input type="number" class="cfg-num" data-key="' + item.key + '" min="1" max="500" step="1" value="' + (isAll ? PC_DEFAULTS.batchSize : Number(val)) + '"' + (isAll ? ' disabled' : '') + ' style="width:76px;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:6px;background:var(--card,#fff);color:var(--text,#222)">';
        html += '<label style="display:inline-flex;align-items:center;gap:5px;margin-left:10px;font-size:12px;cursor:pointer"><input type="checkbox" class="cfg-num-all" data-key="' + item.key + '"' + (isAll ? ' checked' : '') + '>全部</label>';
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
    el.addEventListener('change', () => {
      // questionMode 是字符串枚举（visual/audio/mixed），parseInt 会变 NaN——只有数值型 select 才转数字
      const v = (el.dataset.key === 'questionMode') ? el.value : parseInt(el.value, 10);
      pcSave({ [el.dataset.key]: v });
    });
  });
  body.querySelectorAll('.cfg-range').forEach(el => {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      pcSave({ [el.dataset.key]: v });
      el.nextElementSibling.textContent = v + (el.dataset.unit || '');
    });
  });
  body.querySelectorAll('.cfg-batch-select').forEach(el => {
    el.addEventListener('change', () => pcSave({ [el.dataset.key]: parseInt(el.value, 10) }));
  });
  // v7.2 自由数字输入：失焦/回车生效，钳位到 min~max，非法回退当前值
  body.querySelectorAll('.cfg-num').forEach(el => {
    el.addEventListener('change', () => {
      let v = parseInt(el.value, 10);
      if(isNaN(v)) v = pc()[el.dataset.key];
      v = Math.max(Number(el.min), Math.min(Number(el.max), v));
      el.value = v;
      pcSave({ [el.dataset.key]: v });
    });
  });
  body.querySelectorAll('.cfg-num-all').forEach(el => {
    el.addEventListener('change', () => {
      const numInput = body.querySelector('.cfg-num[data-key="' + el.dataset.key + '"]');
      if(el.checked){
        pcSave({ [el.dataset.key]: -1 });
        if(numInput) numInput.disabled = true;
      } else {
        let v = numInput ? parseInt(numInput.value, 10) : NaN;
        if(isNaN(v) || v < 1) v = PC_DEFAULTS.batchSize;
        pcSave({ [el.dataset.key]: v });
        if(numInput){ numInput.disabled = false; numInput.value = v; }
      }
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

/* ======= design/58 间隔重复算法可视化（纯只读展示层，零算法改动）=======
   只读 level / nextReview / hardWord / keyWord / cleared，不改任何字段。
   ⚠️ 展示的是真实算法结果：promoteLongTerm 是「先按当前 level 算间隔、再升级」，
   因此答对当场看不到跳格，下次再遇到该词才显示新等级 —— 这是算法真实行为，不许造假。 */

// 把单个词的排程状态翻译成人话：等级 + 下次复习时间描述（含逾期态）
// design/77：展示真实 DHP 口径——半衰期来自 dh，「N 天后」= nextReview 距今天数（策略表排程结果）
function wordIntervalDesc(w){
  const lv = Number(w.level) || 0;
  const dhTxt = (w.dh != null) ? ' · 半衰期 ' + (Math.round(Number(w.dh) * 10) / 10) + ' 天' : '';
  const nr = toDateKey(w.nextReview);
  if(!nr) return { level: lv, next: (w.dh != null ? ('半衰期 ' + (Math.round(Number(w.dh) * 10) / 10) + ' 天') : ''), overdue: false };
  const d = daysBetween(todayKey(), nr);
  let next, overdue = false;
  if(d < 0){ next = '已逾期 ' + Math.abs(d) + ' 天'; overdue = true; }   // 逾期态文案原样（warn 色判定不受影响）
  else if(d === 0) next = '今天' + dhTxt;
  else if(d === 1) next = '明天' + dhTxt;
  else next = d + ' 天后' + dhTxt;   // 原 ≥7 天显示日期 → 统一「N 天后」= 下次隔 N 天（策略表口径）
  return { level: lv, next: next, overdue: overdue };
}

// 块 2 · 排程统计：未来 7 天复习量分桶（已逾期全部归「今天」）。
// design/77 清理（她 9/21 拍板）：Leitner 盒子分布整块删除——design/77 后 Lv 只是 dh 反推的显示代理，
// 旧「1/2/4/7…90 天」档位文案会误导为仍在走固定梯子；真实节奏看词条行「· 半衰期 N 天」。
function buildPlanStats(){
  const words = (wbWords() || []).filter(w => w && typeof w.en === 'string' && w.en.trim());
  const today = todayKey();
  const days = [];
  for(let i = 0; i < 7; i++) days.push({ key: addDays(today, i), label: '', count: 0 });
  days[0].label = '今天';
  days[1].label = '明天';
  days[2].label = '后天';
  for(let i = 3; i < 7; i++){
    const k = days[i].key;
    days[i].label = Number(k.slice(5,7)) + '/' + Number(k.slice(8,10));
  }
  let mastered = 0;
  for(const w of words){
    const nr = toDateKey(w.nextReview);
    if(!nr || nr <= today){
      days[0].count++;
    } else {
      const d = daysBetween(today, nr);
      if(d >= 0 && d < 7) days[d].count++;
    }
    if(w.cleared === true) mastered++;
  }
  return { days, total: words.length, mastered, pending: words.length - mastered };
}

// 块 2 · 面板渲染：条形宽度按当日最大值等比缩放（不是绝对词数，防「今天」巨量把后面几天压成线）
function renderPlanPanel(){
  const box = document.getElementById('planPanel');
  if(!box) return;
  const s = buildPlanStats();
  if(!s.total){
    box.innerHTML = '<div class="plan-empty">词库为空，先去「词库」标签导入单词。</div>';
    return;
  }
  const dayMax = Math.max(1, ...s.days.map(d => d.count));
  let html = '<div class="plan-head"><span class="plan-title">记忆曲线排程</span></div>';
  html += '<div class="plan-sec">未来 7 天复习量</div>';
  html += s.days.map((d, i) => {
    const pct = Math.round(d.count / dayMax * 100);
    return '<div class="plan-row"><span class="plan-lbl">' + escapeHtml(d.label) + '</span>' +
      '<span class="plan-track"><i class="plan-bar' + (i === 0 ? ' today' : '') + '" style="width:' + pct + '%"></i></span>' +
      '<span class="plan-num">' + d.count + ' 词</span></div>';
  }).join('');
  html += '<div class="plan-foot">未掌握 ' + s.pending + ' / ' + s.total + ' · 已掌握 ' + s.mastered + '</div>';
  box.innerHTML = html;
}

ready(() => {
  document.querySelectorAll('.wtab').forEach(b => {
    b.addEventListener('click', () => switchWordTab(b.dataset.wtab));
  });
  const fsBtn = $('#fullscreenBtn');
  if(fsBtn) fsBtn.addEventListener('click', () => toggleWordFullscreen());
  // design/58 块2：复习计划按钮（词库卡内）→ 记忆曲线排程面板（默认收起，点开即渲染最新数据，只读展示层）
  const bankPlanBtn = document.getElementById('bankPlanBtn');
  if(bankPlanBtn) bankPlanBtn.addEventListener('click', () => {
    const p = document.getElementById('planPanel');
    if(!p) return;
    if(p.hidden){ renderPlanPanel(); p.hidden = false; }
    else p.hidden = true;
  });
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
  // ======= 电脑端键盘快捷键（9/21）：数字 1-4=选项 / 空格或 0=不知道 / R=重播；仅答题态生效 =======
  // 软导航会重跑 ready 块 → window 一次性守卫防重复绑定（重复绑定=一次按键触发多次判定）
  if(!window.__wordKbdBound){
    window.__wordKbdBound = true;
    document.addEventListener('keydown', function(e){
      if(e.ctrlKey || e.metaKey || e.altKey) return;   // 不劫持浏览器/系统组合键（Cmd+R 刷新等）
      if(!pq || pq.revealed || pq._picked) return;     // 已判定/已选择后按键一律忽略；完成页/空态 pq 无 opts 也不生效
      const optsBox = document.getElementById('opts');
      if(!optsBox) return;                             // 无选项区（完成页/空态/错误态）不绑键
      const cfgM = document.getElementById('cfgModal');
      if(cfgM && !cfgM.hidden) return;                 // 设置弹窗打开时不响应
      const studyV = document.getElementById('studyView');
      const bankV = document.getElementById('bankView');
      if(!studyV || studyV.hidden || (bankV && !bankV.hidden)) return;   // 仅学习 tab 生效，词库 tab 不响应
      const ae = document.activeElement;
      if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;     // 焦点在输入控件时不劫持数字/空格
      if(e.key >= '1' && e.key <= '4'){
        const btns = optsBox.querySelectorAll('.opt-big');
        const n = parseInt(e.key, 10) - 1;
        if(n < btns.length) btns[n].click();           // 按实际存在的选项数量兜底（不足 4 个不误触）
      } else if(e.key === ' ' || e.key === 'Spacebar' || e.key === '0'){
        e.preventDefault();                            // 防空格滚动页面
        const ub = document.getElementById('unknownBtn');
        if(ub && !ub.disabled) ub.click();
      } else if(e.key === 'r' || e.key === 'R'){
        const qsp = document.getElementById('qSpeaker');
        if(qsp) qsp.click();                           // 重播当前词发音
      }
    });
  }
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
  // 云端合并后刷新当前统计：避免另一端/旧 session 合并进来后，顶部「待学习/本轮剩余/已复习」仍显示旧数
  document.addEventListener('hub:data-merged', () => {
    // 9/26：合并后必须先让「今日已背」缓存失效——内存里的 _practicedSet 还是合并前的本机集合，
    // 不重置就永远显示旧数字（云端并进来的那部分一个都看不到）。
    // resetPracticedCache 内部会先把本机待落盘的部分 flush 掉，不会丢进度。
    try{ resetPracticedCache(); }catch(e){}
    updateWordStats();
    updateProgBar();
    // 合并后当前题目/队列里可能还挂着旧 DATA.words 的孤儿对象 → 统一换成合并后的活对象引用，
    // 保证 promote/demote 写回落盘不丢（judge() 里也有同口径兜底，这里是提前对齐）。
    // ⚠️ 严禁在这里重渲染当前题：renderQuestion() 会重新抽干扰项并重排 4 个选项，
    // 用户手指正点下去的瞬间选项瞬变 = 误点错误答案（她 9/22 实测反馈）。只换引用，界面零变化。
    if(pq){
      if(pq.answer && pq.answer.en){
        const live = findWordByEn(pq.answer.en);
        if(live && live !== pq.answer) pq.answer = live;
      }
      if(Array.isArray(pq.queue) && pq.queue.length){
        pq.queue = pq.queue.map(w => {
          if(!w || !w.en) return w;
          const l = findWordByEn(w.en);
          return (l && l !== w) ? l : w;
        });
      }
    }
  });
  // design/78：切换词库 → 清空会话重新出题（词库页刷新/筛选重置由 words.js 自己监听同一事件）
  document.addEventListener('wb:switched', () => {
    cancelSpeak();
    try{ resetPracticedCache(); }catch(e){}   // 9/26：新词库的「今日已背」要按新库读，不能沿用旧库
    pq = null;
    autoStartSeeWord();
  });
  // design/78 §四.10：跨页暗号——首页/引导页跳转带 sessionStorage hub_wb_goto，
  // 落地后先切到目标词库再渲染/出题（处理完即删，只生效一次）
  try{
    const _goto = sessionStorage.getItem('hub_wb_goto');
    if(_goto){
      sessionStorage.removeItem('hub_wb_goto');
      if(typeof wbSetActive === 'function' && _goto !== wbActive()) wbSetActive(_goto);
    }
  }catch(e){}
  if(typeof wbRenderSwitchers === 'function') wbRenderSwitchers();
  repairResetDh();      // 9/24 一次性：重排「答对却被塌成 1 天」的词（幂等，跑完置 _repairResetDhV）
  repairDhReplay();     // 9/24 一次性：按 hist 全链重放，补回被 bug 吞掉的半衰期（幂等，_repairDhReplayV）
  // 9/24：首页今日任务跳转带 autostart=1 → 落地即开「背单词」计时（她拍板：跳转过去直接开始计时）。
  // maybeStartWordTimer 自带「已有背词表不重复开 + 他模块先正规结算」，重复调用安全。
  try{ if(new URLSearchParams(location.search).get('autostart')){ window.__wordTimerByJump = true; maybeStartWordTimer(); } }catch(e){}
  autoStartSeeWord();
});
