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

// ======= design/54 趣味性反馈（2026-09-07）=======
// 连击门槛：每连对 STREAK_BOOST 题触发一次 ×2 高光；答错减半不归零。
// streak/xp 只存 pq 内存态（刷新即重置），禁止写 DATA、禁止走 hubSave、禁止参与 mergeData。
const STREAK_BOOST = 10;

// ======= 全局练习配置（与词库无关）=======
var PC_DEFAULTS = {
  rate: 0.9,
  repeat: 1,
  intervalMs: 1800,
  batchSize: 50,          // 每轮固定题量（复习优先，不足时补新词；-1=全部）
  shuffle: true,
  autoNext: true,
  autoNextDelay: 1000,
  autoPlay: true,
  showCn: false,
  showEn: 0,              // 0=不显示 1=答错时显示 2=始终显示
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
  if([20,50,100,200,-1].indexOf(c.batchSize) === -1) c.batchSize = PC_DEFAULTS.batchSize;   // 白名单外(旧预设5/10/自定义残留)回退默认
  c.shuffle = !!c.shuffle;
  c.autoNext = !!c.autoNext;
  c.autoNextDelay = clampNum(c.autoNextDelay, 100, 30000, PC_DEFAULTS.autoNextDelay);
  c.autoPlay = !!c.autoPlay;
  c.showCn = !!c.showCn;
  c.showEn = clampNum(c.showEn, 0, 2, PC_DEFAULTS.showEn);
  c.optCount = clampNum(c.optCount, 2, 10, PC_DEFAULTS.optCount);
  c.wrongHoldMs = clampNum(c.wrongHoldMs, 1000, 5000, PC_DEFAULTS.wrongHoldMs);
  c.fxFeedback = !!c.fxFeedback;
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
    if(w.ipa == null) w.ipa = '';
    if(w.pos == null) w.pos = '';
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

  // 不再按 newPerDay 截断：固定题量由 autoStartSeeWord 的 batchSize 控制，复习词自然排在前面
  return due;
}

// ======= 今日已学词集合（跨轮累计，保证「第二轮不重复第一轮的词」）=======
function getTodaySeen(){
  if(!DATA.wordSeenToday) DATA.wordSeenToday = { date: todayKey(), words: [] };
  if(DATA.wordSeenToday.date !== todayKey()) DATA.wordSeenToday = { date: todayKey(), words: [] };
  return DATA.wordSeenToday;
}
function markSeen(words){
  const s = getTodaySeen();
  const set = new Set(s.words);
  for(const w of (words || [])){ const k = String(w.en || '').trim().toLowerCase(); if(k) set.add(k); }
  s.words = Array.from(set);
  hubSave();
}

// ======= 进入学习（打开即按排程出题）=======
function autoStartSeeWord(){
  try{
    cancelSpeak();
    removeMasteredBtn();   // 离开答题态：移除顶部「已掌握」按钮（空态/开始页不显示）
    updateWordStats();
    const area = $('#practiceArea'); if(area) area.hidden = false;
    const nextBtn = $('#nextBtn'); if(nextBtn) nextBtn.hidden = true;
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
    // 防污染：若本机 session 里 planEn 内已被标记为 passed 的词 >=95%，视为本轮已结束，强制开新轮。
    // 这种情况通常由跨设备 passed 并集污染导致（例如云端把本机未背的词也标记为已背，一打开就显示 20/20）。
    if(session && session.date === today && Array.isArray(session.planEn) && session.planEn.length > 0 && !session.finished){
      const _planSet = new Set(session.planEn.map(e => String(e).trim().toLowerCase()));
      const _passedInPlan = (session.passed || []).filter(e => _planSet.has(String(e).trim().toLowerCase()));
      if(_passedInPlan.length / session.planEn.length >= 0.95){
        session.finished = true;
        hubSave();
      }
    }
    // 上一轮已做完 -> 强制开新一轮（取全新待学习词）；否则续上当天未完成的轮次（不丢进度）
    const fresh = !session || session.date !== today || !Array.isArray(session.planEn) || session.planEn.length === 0 || session.finished === true;
    if(fresh){
      const c = pc();
      const all = buildQueue(today, nowISO());
      // 排除「今天任何一轮已经出过的词」，保证新一轮与上一轮完全不重复
      const seen = getTodaySeen();
      let plan = all.filter(w => !seen.words.includes(String(w.en || '').trim().toLowerCase()));
      if(plan.length === 0 && all.length > 0){
        // 今天到期的词本日各轮已全部出过（完成页点「再来一轮」的常见场景）：复用今日排程重开一轮，不误报空态
        plan = all.slice();
      }
      if(plan.length === 0){
        // 今天确实没有到期词：未掌握的词被记忆曲线排在之后几天，空态要说清数字，避免与首页「待学习」互相矛盾
        const pending = (DATA.words || []).filter(w => w && w.cleared !== true).length;
        $('#practiceBody').innerHTML = '<div class="q-word">今天没有到期要复习的词</div>' +
          '<div class="q-cn">已学过的词都被记忆曲线排到了之后几天，今天不用复习。' +
          (pending ? '还有 ' + pending + ' 个没掌握的词，会在接下来按曲线依次出现。' : '') +
          '想多背可以去「词库」加词。</div>';
        clearDailySession();
        return;
      }
      if(c.shuffle) plan = shuffle(plan);
      // 固定题量：题量设置即每轮总题数；buildQueue 已按复习优先级排序，直接截断即可
      if(c.batchSize > 0 && plan.length > c.batchSize) plan = plan.slice(0, c.batchSize);
      markSeen(plan);   // 记录本轮已学词，下一轮不再重复
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
      DATA.dailySession = session;
      hubSave();
    }

    // —— 题量收归：设置题量小于已锁定轮次词数时，截断到设定题量（保留已过的词，去除未开始的冗余词）——
    //    解决「设置改成 20 但当天已建过 50 词轮次、改设置不生效」的问题（之之 8/31 反馈）
    {
      const _c = pc();
      const _cap = (_c.batchSize > 0) ? _c.batchSize : session.planEn.length;
      if(session.planEn.length > _cap){
        const _passedSet = new Set((session.passed || []).map(e => String(e).trim().toLowerCase()));
        const _capEff = Math.max(_cap, _passedSet.size);   // 绝不丢弃已过的词
        const _order = (session.queueOrder && session.queueOrder.length) ? session.queueOrder : session.planEn;
        const _kept = _order.filter(en => _passedSet.has(en));
        const _rest = _order.filter(en => !_passedSet.has(en));
        const _newPlan = _kept.concat(_rest).slice(0, _capEff);
        session.planEn = _newPlan;
        session.queueOrder = _newPlan;
        DATA.dailySession = session;
        hubSave();
      }
    }

    // —— 重建内存会话：planEn 中未 passed、且仍在词库的，按 queueOrder 顺序 ——
    const s = session;
    // 只把「属于当前 planEn」的 passed 算进本轮进度；避免 mergeData 跨设备/跨轮次并集污染后 counted > initLen
    const sessionPassedInPlan = new Set((s.passed || []).filter(en => (s.planEn || []).includes(en)));
    pq = { mode:'study', queue:[], idx:0, initLen: s.planEn.length, correct: sessionPassedInPlan.size,
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
  if(pq.isWrongReview) return;                   // 重练错词是临时模式，不覆盖正常 dailySession
  const s = DATA.dailySession;
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
  DATA.words = (DATA.words || []).filter(w => !same(w));
  pq.queue = pq.queue.filter(w => !same(w));
  // 墓碑（与 words.js deleteWord 同格式 'en:'+小写）：不记墓碑的话，云同步合并会把已掌握的词复活回来
  DATA.deletedIds = DATA.deletedIds || [];
  const _tomb = 'en:' + String(cur.en || '').toLowerCase();
  if(!DATA.deletedIds.includes(_tomb)) DATA.deletedIds.push(_tomb);
  // 从当日计划移除（分母缩减，不计入已掌握进度）
  if(!pq.isWrongReview && DATA.dailySession && DATA.dailySession.date === todayKey()){
    const s = DATA.dailySession;
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
  maybeStartWordTimer();   // 进练习即自动开启「背单词」计时（若尚未在计）；不重复开手动计时
  try{
    cancelSpeak();
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
      (last.cn ? '<span class="lw-cn">' + escapeHtml(practiceSense(last).cn) + '</span>' : '') +
      '</div>';
  }
  html += '<div class="practice-topzone">' + top + '</div>';

  // ── 主区域（严格还原 v5 原型：单词+音标+中文居中，无例句无词性；中文答后才显示） ──
  // 已掌握按钮已上移至顶部 word-stats 行（见 ensureMasteredBtn），题干区不再放按钮
  html += '<div class="practice-word-area">' +
    '<div class="pw-en">' + escapeHtml(cur.en) + '</div>' +
    '<div class="pw-ipa">' + (cur.ipa ? '/ ' + escapeHtml(cur.ipa) + ' /' : '&nbsp;') + '</div>' +
    '<div class="pw-cn" id="pwCn">&nbsp;</div>' +
  '</div>';

  // ── 选项网格（2×2） ──
  html += '<div class="opts-grid" id="opts"></div>';
  html += '<div class="answer-btns"><button class="abtn abtn-unknown" id="unknownBtn">不知道</button></div>';

  // ── 底部喇叭大圆按钮（严格还原 v5 原型：居中 48px 圆） ──
  html += '<div class="pw-speaker-wrap"><button class="btn tool-btn" id="qSpeaker" title="再读一遍"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/></svg></button></div>';

  const body = $('#practiceBody');
  body.innerHTML = html;
  $('#opts').innerHTML = opts.map((o, i) => {
    const ps = practiceSense(o);
    const tag = singlePos(o.pos) || ps.tag || inferPos(o.en) || '';
    return '<button class="opt-big" data-en="' + escapeHtml(o.en) + '" data-idx="' + i + '">' +
      '<span class="opt-big-tag">' + escapeHtml(tag) + '</span>' +
      '<span class="opt-big-cn">' + escapeHtml(ps.cn) + '</span>' +
      '<span class="opt-big-en"></span>' +
    '</button>';
  }).join('');
  bindOpts(cur);
  const left0 = document.getElementById('unknownBtn');
  if(left0) left0.onclick = () => judge(cur, null, false, true);
  ensureMasteredBtn(cur);
  const qsp = document.getElementById('qSpeaker');
  if(qsp) qsp.onclick = () => speakN(cur.en);
  if(c.autoPlay) setTimeout(() => speakN(cur.en), 300);   // autoPlay=false 时不自动朗读，仅手动点喇叭
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
    x.style.pointerEvents = 'none';
  });
  // 揭示题干中文释义（背词场景只显示最常用的第一义项，词组全显——9/7 之之要求）
  const reveal = document.getElementById('pwCn');
  if(reveal && cur.cn){
    reveal.textContent = practiceSense(cur).cn;
  }
  const ub = document.getElementById('unknownBtn');
  if(ub){ ub.style.pointerEvents = 'none'; ub.disabled = true; }

  const k = String(cur.en).toLowerCase();
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
  const nowStr = nowISO();
  const cnTxt = cur.cn ? ' · ' + cur.cn : '';
  let result;

  if(correct){
    // 从未答错过的词 → 选对直接过（v5 核心变更：一直对的词不重复3次）
    const inShort = pq.shortMode && pq.shortMode.has(k);
    if(!inShort){
      promoteLongTerm(cur, today);
      pq.queue.splice(pq.idx, 1);
      pq.correct++;
      pq.passed.push(String(cur.en).trim().toLowerCase());
      if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }   // 完全过关才计入进度
      if(DATA.dailySession && !pq.isWrongReview) DATA.dailySession.total = pq.total;  // 持久化，刷新续背时不丢
      hubSave();
      result = 'pass';
    } else {
      // 答错/不认识的词 → 短线分散重复：需分散答对 SHORT_PASS(3) 次才过关
      const n = (cur.shortCount || 0) + 1;          // 本轮已分散答对次数
      if(n >= SHORT_PASS){
        promoteLongTerm(cur, today);                // 内部会把 shortCount 归零
        pq.queue.splice(pq.idx, 1);
        pq.correct++;
        pq.passed.push(String(cur.en).trim().toLowerCase());
        pq.shortMode.delete(k);
        if(!pq.counted.has(k)){ pq.counted.add(k); pq.total++; }   // 过完 3 遍全对，此时才算过
        if(DATA.dailySession && !pq.isWrongReview) DATA.dailySession.total = pq.total;
        hubSave();
        result = 'pass';
        // 答题反馈 toast 已删（之之 9/7：黑框压在计时框后面，纯噪音，答题卡已有反馈）
      } else {
        cur.shortCount = n;                          // 记录进度（持久化，续背接得上）
        pq.reholdMap[k] = 0;                         // 已在短线模式，不再当场重考
        pq.queue.splice(pq.idx, 1);
        const gap = gapFor(cur, n);                  // n=1→隔2、n=2→隔5（难词更密）
        const pos = Math.min(pq.queue.length, pq.idx + gap);
        if(pos >= pq.queue.length) pq.queue.push(cur);
        else pq.queue.splice(pos, 0, cur);
        hubSave();
        result = 'requeue';
        // toast 已删
      }
    }
  } else {
    const wasRehold = (pq.reholdMap[k] || 0) >= 1;
    demoteLongTerm(cur, today, !!isUnknownBtn); // P1-1：点「完全不认识」时惩罚加重
    if(!pq.shortMode) pq.shortMode = new Set();
    pq.shortMode.add(k);                          // 标记：该词进入短线重复模式
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
      // toast 已删
    } else {
      // 第一次答错 → 展示答案后当场重考同一词（选项重新打乱）
      pq.reholdMap[k] = 1;
      hubSave();   // 显式落盘：重练错词模式下 saveDailySession 会跳过，不落盘则本次降级/dailyWrong 全丢
      result = 'rehold';
      // toast 已删
    }
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
    hubSave();
    result = 'requeue';
    // toast 已删
  }

  updateProgBar();
  updateWordStats();
  saveDailySession();   // 每次作答后持久化进度（草稿自动存档）

  if(result === 'rehold'){
    setTimeout(() => { if(pq && pq.revealed){ pq.revealed = false; renderQuestion(cur, true); } }, c.wrongHoldMs);
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

  // 今日已练 = 今天真正练过的 unique 词数（不是轮次位累加）
  const seenToday = DATA.wordSeenToday && DATA.wordSeenToday.date === todayKey() ? DATA.wordSeenToday.words || [] : [];
  const todayLearned = seenToday.length;

  // 剩余待学习：未掌握或今天到期的词数
  const due = (DATA.words || []).filter(w => w && (w.cleared !== true || (w.nextReview || '') <= todayKey())).length;

  // 累加今日统计：时长累加，词数用今日 unique 数（覆盖，非累加）
  addTodayStats(todayLearned, wordMs);
  const { st: todaySt } = getTodayStats();

  // design/54 完成页仪式感：勋章（数字=本轮答对数）+ 三宫格（XP/最高连击/待学习，均为内存态或既有统计）
  const medalNum = pq ? (pq.correct || 0) : 0;
  const maxStreak = pq ? (pq.maxStreak || 0) : 0;
  const sessionXp = pq ? (pq.xp || 0) : 0;
  let bodyHtml = '<div class="finish-medal-row">' +
      '<div class="finish-medal"><div class="finish-medal-in">' + medalNum + '</div></div>' +
      '<div><div class="q-word" style="margin:0">完成！这一轮你坚持了 ' + formatMs(wordMs || todaySt.totalMs) + '</div>' +
      '<div style="margin-top:4px;font-size:14px;color:var(--muted)">今日已练 ' + todaySt.totalWords + ' 个 · 耗时 ' + formatMs(todaySt.totalMs) + ' · 剩余待学习 ' + due + ' 个</div></div>' +
    '</div>' +
    '<div class="finish-stats">' +
      '<div class="fs-cell fs-xp"><div class="fs-l">获得 XP</div><div class="fs-v">+' + sessionXp + '</div></div>' +
      '<div class="fs-cell fs-st"><div class="fs-l">本轮最高连击</div><div class="fs-v">' + maxStreak + '</div></div>' +
      '<div class="fs-cell"><div class="fs-l">待学习</div><div class="fs-v">' + due + '</div><div class="fs-l" style="margin:2px 0 0">个</div></div>' +
    '</div>';
  const seen = new Set();
  const wrong = (pq.wrongList || []).filter(w => {
    const k = String(w.en).toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });
  if(wrong.length){
    bodyHtml += '<div class="card" style="margin-top:14px;background:var(--err-bg);border:1px solid var(--err)">' +
      '<h3 style="margin:0 0 10px;color:var(--danger)">想再认一次的词（' + wrong.length + ' 个）</h3><div>' + wrong.map(w =>
        '<div class="list-item"><span><b style="font-size:15px">' + escapeHtml(w.en) + '</b>' +
        (w.cn ? ' <span class="muted">' + escapeHtml(w.cn) + '</span>' : '') + '</span></div>'
      ).join('') + '</div></div>';
    bodyHtml += '<div class="review-hint">' +
      '<div class="rh-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg></div>' +
      '<div><div class="rh-t">本轮有 ' + wrong.length + ' 个词想再认一次</div>' +
      '<div class="rh-s">立刻重练 → 1 周后只需复习 1 次</div></div></div>';
  }
  bodyHtml += '<div class="dict-result-actions" style="justify-content:center;margin:14px 0;gap:12px;flex-wrap:wrap">' +
    (wrong.length ? '<button class="btn" id="reviewWrongBtn">重练错词（' + wrong.length + '）</button>' : '') +
    '<button class="btn btn-primary" id="restartBtn">再来一轮</button></div>';
  $('#practiceBody').innerHTML = bodyHtml;
  $('#progBarWrap').hidden = true;
  removeMasteredBtn();   // 完成页没有当前词：移除「已掌握」按钮，防误点删除
  updateWordStats();
  if(!pq.isWrongReview && DATA.dailySession && DATA.dailySession.date === todayKey()){
    DATA.dailySession.finished = true; DATA.dailySession.currentEn = null; hubSave();
  }
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
function getTodayStats(){
  const key = todayKey();
  if(!DATA.wordDayStats) DATA.wordDayStats = {};
  if(!DATA.wordDayStats[key]) DATA.wordDayStats[key] = { totalWords:0, totalMs:0, sessions:0 };
  return { key, st: DATA.wordDayStats[key] };
}
function addTodayStats(wordsCount, ms){
  const { st } = getTodayStats();
  // 今日已练 = 今天真正练过的 unique 词数，直接覆盖（避免三轮×20被记成60的重复累加）
  st.totalWords = Math.max(0, wordsCount || 0);
  st.totalMs += Math.max(0, ms || 0);
  st.sessions += 1;
  hubSave();
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
    let id = localStorage.getItem('ielts_hub_device');
    if(!id){ id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); localStorage.setItem('ielts_hub_device', id); }
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
function commitWordTimer(endTsOverride){
  if(!window.__wordTimerAuto) return;
  const a = window.active;
  if(!a || a.ended || a.moduleId !== WORD_TIMER_MODULE){ window.__wordTimerAuto = false; return; }
  const timerId = a.timerId;
  // 正常离开：计到当前；处于「轮间宽限」时：只计到上一轮结束点（不把空隙算进学习时长）
  const endTs = (endTsOverride != null) ? endTsOverride
              : (window.__wordTimerStopTimer ? (window.__lastSegTs || Date.now()) : Date.now());
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs)) / 1000));
  DATA.sessions = DATA.sessions || [];
  const already = DATA.sessions.some(s => s.timerId && s.timerId === timerId);
  if(!already && durationSec > 0){
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
  try{
    document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
    document.dispatchEvent(new CustomEvent('hub:timer-state'));
  }catch(e){}
}
// 离页兜底：关标签页 / 切到别的程序时结算本次计时（防悬挂的进行中计时）
if(!window.__wordTimerLeaveHook){
  window.__wordTimerLeaveHook = true;
  const _onLeave = () => { try{ commitWordTimer(); }catch(e){} };
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') _onLeave(); });
  window.addEventListener('beforeunload', _onLeave);
}

function updateWordStats(){
  // 进度条显示「本轮读到第几个 / 本轮总数」，例如 3/50
  // 数字 = 已作答唯一词数 + 当前正在看的这一题；完成时 queue 为空，直接显示 total/total
  let progress = '0/0';
  if(pq){
    const total = pq.initLen || pq.queue.length || 0;
    // 9/7 口径：只数「完全过关」的词（答错进短线的词过完 3 遍全对才计入），不含正在看的题
    const current = Math.min(pq.counted ? pq.counted.size : 0, total);
    progress = current + ' / ' + total;   // 14:22 对齐 design/54 原型数字格式「7 / 20」
  } else if(DATA.dailySession && DATA.dailySession.date === todayKey() && !DATA.dailySession.finished){
    // 仅「进行中」的当日 session 才用其进度；已完成/过期的 session 不再当作当前进度（避免重开即显 20/20）
    const s = DATA.dailySession;
    const total = (s.planEn || []).length;
    const inPlanPassed = (s.passed || []).filter(en => (s.planEn || []).includes(en)).length;
    const answered = Math.min(total, inPlanPassed);
    progress = answered + ' / ' + total;
  }
  const el = $('#statProgress'); if(el) el.textContent = progress;
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
        { key:'batchSize',     label:'题量',          type:'batch', presets:[{v:'20',t:'20 题'},{v:'50',t:'50 题'},{v:'100',t:'100 题'},{v:'200',t:'200 题'},{v:'-1',t:'全部'}] },
        { key:'shuffle',       label:'随机乱序',      type:'toggle' },
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
        { key:'fxFeedback', label:'连击显示', type:'toggle', desc:'顶部连击计数与答错「再认一次」提示 chip；关闭后仅保留勾叉高亮与自动流转' },
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
    el.addEventListener('change', () => pcSave({ [el.dataset.key]: parseInt(el.value, 10) }));
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
  // 云端合并后刷新当前统计：避免另一端/旧 session 合并进来后，顶部「待学习/本轮剩余/已复习」仍显示旧数
  document.addEventListener('hub:data-merged', () => {
    updateWordStats();
    updateProgBar();
    // 合并后当前题目闭包还挂着旧 DATA.words 对象：未作答时用合并后的活对象重渲染当前题
    if(pq && pq.answer && !pq.revealed && pq.queue.length > 0){
      const live = findWordByEn(pq.answer.en);
      if(live && live !== pq.answer) renderQuestion(live);
    }
  });
  autoStartSeeWord();
});
