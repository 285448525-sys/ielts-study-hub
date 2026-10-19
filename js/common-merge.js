/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 4 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== 数据合并：词库 / 数组 / 口语答案 / 计划 / 素材 / 计时（改数据结构必读） */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */
function _mergeWords(local, cloud){
  const map = new Map();
  (cloud||[]).forEach(w => { if(w && w.en) map.set(String(w.en).toLowerCase(), Object.assign({}, w)); });
  let changes = 0;
  const localSeen = new Set();
  for(const w of (local||[])){
    if(!w || !w.en) continue;
    const k = String(w.en).toLowerCase();
    localSeen.add(k);
    const ex = map.get(k);
    if(!ex){ map.set(k, Object.assign({}, w)); continue; } // 本机独有：保留（非云端更新）
    let changed = false;
    // id/ts：合并基准是「云端副本」，云端若来自没有 id 的老快照会把本机 id 抹掉
    // （后果：词库页删除/勾选按 data-id 走 → 点了没反应）。缺则补，ts 取较晚。
    if(!ex.id && w.id){ ex.id = w.id; changed = true; }
    if(_num(w.ts) > _num(ex.ts)){ ex.ts = w.ts; changed = true; }
    const _eq = (f) => JSON.stringify(ex[f]) === JSON.stringify(w[f]);
    // ── 重置世代：谁更晚执行了「重置进度/重新导入」，谁的整组进度字段说了算 ──
    const lep = _num(w.resetEpoch), cep = _num(ex.resetEpoch);
    if(lep > cep){
      WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)){ ex[f] = w[f]; changed = true; } });
      if(ex.resetEpoch !== lep){ ex.resetEpoch = lep; changed = true; }
    } else if(cep > lep){
      // 对端重置得更晚：沿用云端这份进度（ex 本就是云端副本），勿用本机旧最大值回填
      WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)) changed = true; });
    } else {
    // ── 同世代（含双方都从未重置）──
    // design/84（9/22）：任一侧带 lastPracticeAt（练习写点戳的「最后练习时间」毫秒）→ 整组进度字段
    // （WORD_PROG_FIELDS 含 level/nextReview/okStreak/dh/dd/hist 等）按「最后练习者胜」，取代逐字段
    // max/later——答错造成的退步（okStreak 归零、nextReview 提前到明天、dh 缩短）才能传到另一端，
    // 复习调度不再偏乐观。双方都没有 lastPracticeAt（两台设备都从未在新版练过该词）→ 回退原口径。
    const _lpa = Number(w.lastPracticeAt) || 0, _epa = Number(ex.lastPracticeAt) || 0;
    if(_lpa || _epa){
      const winIsLocal = _lpa >= _epa;   // 最后练习者胜；相等=同一动作已同步，逐字段判变保幂等
      if(winIsLocal){
        WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)){ ex[f] = w[f]; changed = true; } });
        if(!_eq('lastPracticeAt')){ ex.lastPracticeAt = w.lastPracticeAt; changed = true; }
      }
      // 云端更新：ex 本就是云端副本，勿用本机旧值回填（同 resetEpoch 分支口径）
    } else {
    // ── 原「单向取优」口径（老数据兜底：双方都无 lastPracticeAt）──
    const ns = Math.max(_num(ex.mcStreak), _num(w.mcStreak)); if(ns !== _num(ex.mcStreak)){ ex.mcStreak = ns; changed = true; }
    const ni = Math.max(_num(ex.mcInterval), _num(w.mcInterval)); if(ni !== _num(ex.mcInterval)){ ex.mcInterval = ni; changed = true; }
    const ne = Math.max(_num(ex.mcEase), _num(w.mcEase)); if(ne !== _num(ex.mcEase)){ ex.mcEase = ne; changed = true; }
    const nd = Math.min(_num(ex.mcDiff), _num(w.mcDiff)); if(nd !== _num(ex.mcDiff)){ ex.mcDiff = nd; changed = true; }
    const ndue = _later(ex.mcDue, w.mcDue); if(ndue !== (ex.mcDue||'')){ ex.mcDue = ndue; changed = true; }
    // ── v1.2 字段合并：level 取更高、间隔日期取更晚、计数取更大、布尔取或 ──
    const nl = Math.max(_num(ex.level)||0, _num(w.level)||0); if(nl !== (_num(ex.level)||0)){ ex.level = nl; changed = true; }
    const nrev = _later(ex.nextReview, w.nextReview); if(nrev !== (ex.nextReview||'')){ ex.nextReview = nrev; changed = true; }
    const nlrev = _later(ex.lastReview, w.lastReview); if(nlrev !== (ex.lastReview||'')){ ex.lastReview = nlrev; changed = true; }
    const net = Math.max(_num(ex.errTotal)||0, _num(w.errTotal)||0); if(net !== (_num(ex.errTotal)||0)){ ex.errTotal = net; changed = true; }
    const nest = Math.max(_num(ex.errStreak)||0, _num(w.errStreak)||0); if(nest !== (_num(ex.errStreak)||0)){ ex.errStreak = nest; changed = true; }
    const nfs = Math.max(_num(ex.fuzzyStreak)||0, _num(w.fuzzyStreak)||0); if(nfs !== (_num(ex.fuzzyStreak)||0)){ ex.fuzzyStreak = nfs; changed = true; }
    const nos = Math.max(_num(ex.okStreak)||0, _num(w.okStreak)||0); if(nos !== (_num(ex.okStreak)||0)){ ex.okStreak = nos; changed = true; }
    const ncleared = !!(ex.cleared || w.cleared); if(ncleared !== !!ex.cleared){ ex.cleared = ncleared; changed = true; }
    // 短线分散进度字段：必须随单词同步，否则另一端/云端旧数据会把本机刚积累的 shortCount 清零
    const nsc = Math.max(_num(ex.shortCount)||0, _num(w.shortCount)||0); if(nsc !== (_num(ex.shortCount)||0)){ ex.shortCount = nsc; changed = true; }
    const ncr = Math.max(_num(ex.cleanRounds)||0, _num(w.cleanRounds)||0); if(ncr !== (_num(ex.cleanRounds)||0)){ ex.cleanRounds = ncr; changed = true; }
    const nlst = _later(ex.lastShortTouch, w.lastShortTouch); if(nlst !== (ex.lastShortTouch||'')){ ex.lastShortTouch = nlst; changed = true; }
    // design/77 DHP：(dh,dd) 成对合并，整对取 dh 更大一侧（记忆更强侧）胜出；dh 相等 dd 取大。
    // 判变全走 (_num(x)||0) 口径防 undefined↔0 幻影（9/19 幻影物化教训）。
    const adh = _num(ex.dh)||0, bdh = _num(w.dh)||0;
    if(adh !== bdh){
      const win = (bdh > adh) ? w : ex;
      if((_num(ex.dh)||0) !== (_num(win.dh)||0)){ ex.dh = win.dh; changed = true; }
      if((_num(ex.dd)||0) !== (_num(win.dd)||0)){ ex.dd = win.dd; changed = true; }
    } else if((_num(ex.dd)||0) !== (_num(w.dd)||0)){
      ex.dd = Math.max(_num(ex.dd)||0, _num(w.dd)||0); changed = true;
    }
    // design/59 hist：同世代取「长者胜」，等长不动（幂等）；epoch 差异已由 WORD_PROG_FIELDS 整组覆盖
    const _wh = Array.isArray(w.hist) ? w.hist : null, _eh = Array.isArray(ex.hist) ? ex.hist : null;
    if(_wh && (!_eh || _wh.length > _eh.length)){ ex.hist = _wh.slice(); changed = true; }
    }   // 内层 else（老数据回退口径）闭合
    }
    // 主观标注：与「重置」无关（resetWordProgress 明确保留这两个），永远取「或」
    const nh = !!(ex.hardWord || w.hardWord); if(nh !== !!ex.hardWord){ ex.hardWord = nh; changed = true; }
    const nkey = !!(ex.keyWord || w.keyWord); if(nkey !== !!ex.keyWord){ ex.keyWord = nkey; changed = true; }
    // 内容字段：无论哪侧重置过都按取优规则合并——重置进度不应该连带回退刚补全好的释义/词性/音标
    const cn1 = (ex.cn||'').trim(), cn2 = (w.cn||'').trim();
    const ncn = (cn1 && cn2) ? (cn1.length >= cn2.length ? cn1 : cn2) : (cn1 || cn2);
    if(ncn !== (ex.cn||'').trim()){ ex.cn = ncn; changed = true; }   // 与 trim 后比较，避免首尾空格造成每次误判"更新"
    // pos/ipa 合并：本机刚 AI 补全的字段必须被保留，不能被云端空值覆盖
    const pos1 = (ex.pos||'').trim(), pos2 = (w.pos||'').trim();
    const npos = (pos1 && pos2) ? pos2 : (pos1 || pos2);
    if(npos !== (ex.pos||'').trim()){ ex.pos = npos; changed = true; }
    const ipa1 = (ex.ipa||'').trim(), ipa2 = (w.ipa||'').trim();
    const nipa = (ipa1 && ipa2) ? ipa2 : (ipa1 || ipa2);
    if(nipa !== (ex.ipa||'').trim()){ ex.ipa = nipa; changed = true; }
    if(changed) changes++;
  }
  // 云端独有词 = 真正新增
  for(const w of (cloud||[])){ if(w && w.en && !localSeen.has(String(w.en).toLowerCase())) changes++; }
  // ── 出口统一清洗（2026-09-06 晚）：cn 合并取「较长者」，而云端老脏 cn（混音标/词频/时间戳/例句）
  // 比本机洗净后的短 cn 长 → 每次拉云端合并都会把清洗结果回滚成脏数据（之之「叫你删你删了吗」根因）。
  // 在合并出口对全部词统一过 salvageWordCn（幂等，与 _cnCleanV1/V2 迁移同口径）：
  // 脏的洗净（音标抢救进 ipa、噪声丢弃），已干净的零改动；不碰 pos（词组 phrase. 由补全统一，别打架）。
  // data.js 未加载的页面自动跳过（typeof 守卫）。
  if(typeof window !== 'undefined' && typeof window.salvageWordCn === 'function'){
    for(const mw of map.values()){
      const cn0 = (typeof mw.cn === 'string') ? mw.cn : '';
      if(!cn0) continue;
      try{
        const r = window.salvageWordCn(cn0, mw.ipa, /\s/.test(String(mw.en || '')));
        if(r.cn !== cn0){ mw.cn = r.cn; changes++; }
        if(r.ipa && r.ipa !== String(mw.ipa || '').trim()){ mw.ipa = r.ipa; changes++; }
      }catch(_){}
    }
  }
  return { arr: Array.from(map.values()), changes };
}
/* 其他数组：按 id/ts 去重，冲突取较新；保留本机独有条目（不删）。
   返回 {arr, changes}：changes = 云端新增/更新的条目数 */
function _mergeArray(local, cloud){
  local = Array.isArray(local) ? local : [];
  cloud = Array.isArray(cloud) ? cloud : [];
  const keyOf = it => (it && it.id != null) ? ('id:'+it.id) : (it && it.ts != null) ? ('ts:'+it.ts) : (it != null ? 'h:'+JSON.stringify(it) : null);
  const tsOf  = it => _num(it && (it.ts || it.updatedAt));
  const byKey = new Map();
  let changes = 0;
  for(const it of local){ const k = keyOf(it); if(k) byKey.set(k, it); }
  for(const it of cloud){
    if(it == null) continue; // null 元素无同步价值：跳过，避免每次计为新增导致数组无限膨胀
    const k = keyOf(it);
    if(!k){ byKey.set('__nk_'+(byKey.size), it); changes++; continue; } // 无 key：各自保留，计为新增
    const ex = byKey.get(k);
    if(!ex){ byKey.set(k, it); changes++; }                  // 云端新增
    else if(tsOf(it) > tsOf(ex)){ byKey.set(k, it); changes++; } // 云端更新（较新者胜）
    // 否则保留本机（非云端更新），不计 changes
  }
  return { arr: Array.from(byKey.values()), changes };
}
/* 整体合并：以本机为基准，云端增量并入；不覆盖本机设置与任何独有数据。
   返回 {data, changes}：changes = 实际应用的合并处数（新增 + 更新），用于决定是否写盘/提示 */
/* 口语题库跨设备合并：以官方 SPEAKING_BANK 为基准（当前 9-12 月版 79 题），本机答案优先、云端补缺。
   1) 先用 mergeSpeakingKeepAnswers(local) 得到官方基准+本机答案（丢弃非官方题）
   2) 再按 id 把云端 speaking 的 answers 回填（云端有答案且本机无 → 取云端；都有 → 保留本机较新端）
   保证：跨设备恢复串题答案/练习记录，且不复活旧脏题库。 */
/* 口语答案按「小题」粒度合并。
   ⚠️ 9/18 之前这里的写法是「整份单向取本机」：
       if(official.answers) keep.answers = official.answers; else if(cloud.answers) keep.answers = cloud.answers;
     answers 的结构是 { 0:{text,ts,…}, 1:{…}, p2:{text,ts,p3:{…}} }，每个 key 是一条彼此独立的答案。
     于是「本机只要在任何一小题上写过一个字」就把整份 answers 判成「本机较新」，导致：
       ① 另一端在同一话题下的其它小题答案 / P2 答案 / P3 追问全被静默丢弃；
       ② 本机已有的小题永远收不到云端的更新（A 改了 q0 文本，B 永远停在旧值）。
     注意 speaking.js 的 spDraftSave 一直有在写 s.answers[qi].ts，合并函数却从没用过它。
   现在：两端独有的小题各自保留；同 key 比 ts，大者胜（ts 相同且内容不同 → 操作端优先）。 */
function _spAnsTs(a){ return Number(a && (a.ts || a.updatedAt || a.lastTs)) || 0; }
function _mergeSpeakingAnswers(localAns, cloudAns){
  const isObj = v => v && typeof v === 'object';
  if(!isObj(localAns)) return isObj(cloudAns) ? Object.assign({}, cloudAns) : undefined;
  if(!isObj(cloudAns)) return localAns;
  const out = Object.assign({}, cloudAns);        // 起点=云端：保证云端独有的小题不丢
  Object.keys(localAns).forEach(k => {
    const l = localAns[k], c = out[k];
    if(!isObj(l)) return;
    if(!isObj(c)){ out[k] = l; return; }          // 本机独有该小题
    const lt = _spAnsTs(l), ct = _spAnsTs(c);
    if(lt > ct) out[k] = l;                                                     // 本机较新
    else if(lt === ct && JSON.stringify(l) !== JSON.stringify(c)) out[k] = l;   // ts 相同内容不同：操作端优先
    // lt < ct：保留云端的较新版本（原实现这里会永久停在旧值）
  });
  return out;
}
function _mergeSpeaking(localSp, cloudSp){
  if(!Array.isArray(localSp) && !Array.isArray(cloudSp)) return { arr: [], changes: 0 };
  // 基准：官方题 + 本机答案
  let base = (typeof mergeSpeakingKeepAnswers === 'function')
    ? mergeSpeakingKeepAnswers(localSp || [])
    : (localSp || []);
  const cloudById = {};
  (cloudSp || []).forEach(s => { if(s && s.id) cloudById[s.id] = s; });
  let changes = 0;
  base = base.map(official => {
    const cloud = cloudById[official.id];
    if(!cloud) return official;
    const keep = Object.assign({}, official);
    // answers：按小题 key 粒度合并（原来是整份覆盖，会把另一端的答案整片抹掉）
    const beforeAns = JSON.stringify(keep.answers || null);
    const mergedAns = _mergeSpeakingAnswers(keep.answers, cloud.answers);
    if(mergedAns !== undefined) keep.answers = mergedAns;
    if(beforeAns !== JSON.stringify(keep.answers || null)) changes++;
    // 素材：按 id + ts 合并（原来也是「本机有就整份用本机」，另一端新建的素材一样收不到）
    const ls = Array.isArray(official.speakingStories) ? official.speakingStories : [];
    const cs = Array.isArray(cloud.speakingStories) ? cloud.speakingStories : [];
    if(ls.length || cs.length){
      const m = _mergeArray(ls, cs);
      keep.speakingStories = m.arr;
      changes += m.changes;
    }
    return keep;
  });
  return { arr: base, changes };
}

/* 阶段 5（design/11 §2.2）：weakness.daily 按日期 sum 合并（跨设备收敛到各设备当日之和，幂等）。
   键排序输出保证稳定，避免 JSON 比较抖动引发重复同步。 */
function _sdMergeDaily(a, b){
  var out = {};
  var seen = {};
  var keys = Object.keys(a || {}).concat(Object.keys(b || {}));
  keys.sort();
  keys.forEach(function(d){
    if(seen[d]) return; seen[d] = 1;
    out[d] = (Number((a || {})[d]) || 0) + (Number((b || {})[d]) || 0);
  });
  return out;
}

/* 背词「当日 session」合并（10/1 从 mergeData 内联块抽取：DATA.dailySession 与官方词库
   DATA.obank[bid].session 共用一套口径，防两边漂移）。
   返回 { v, changed }：changed = 云端带来变化（本机视角）。
   同 date 时取 passed 并集、queueOrder/planEn 以本机为准、total/stats/lastTouch 取较大者，
   保证在 A 设备背的词在 B 设备合并后仍然保留，而不是被 B 刚打开页面时产生的空 session 冲掉。 */
function _mergeWbSession(_ld, _cd){
  if(_ld && _cd){
    if(_ld.date !== _cd.date){
      const _win = (_ld.date > _cd.date) ? _ld : _cd;
      return { v: _win, changed: _win !== _ld };
    }
    const mergedSession = Object.assign({}, _ld);
    // 只有两端锁定的是同一轮词表（planEn 完全一致）时，才合并 passed 实现续背；
    // planEn 不同意味着不是同一轮，合并 passed 会把本机未背的词标记为已背，导致一打开就是 20/20。
    const _normPlan = arr => (arr || []).map(e => String(e).trim().toLowerCase()).sort().join('\u0001');
    const _samePlan = _normPlan(_ld.planEn) && _normPlan(_ld.planEn) === _normPlan(_cd.planEn);
    const passedSet = _samePlan
      ? new Set([...(_ld.passed || []), ...(_cd.passed || [])])
      : new Set(_ld.passed || []);
    mergedSession.passed = Array.from(passedSet);
    mergedSession.total = Math.max(_ld.total || 0, _cd.total || 0);
    mergedSession.stats = {
      known: Math.max(((_ld.stats && _ld.stats.known) || 0), ((_cd.stats && _cd.stats.known) || 0)),
      unknown: Math.max(((_ld.stats && _ld.stats.unknown) || 0), ((_cd.stats && _cd.stats.unknown) || 0))
    };
    mergedSession.lastTouch = Math.max(_ld.lastTouch || 0, _cd.lastTouch || 0);
    mergedSession.sessionStart = Math.min(_ld.sessionStart || Date.now(), _cd.sessionStart || Date.now());
    // planEn / queueOrder：本机已锁定的轮次计划优先；本机没有才取云端
    mergedSession.planEn = (_ld.planEn && _ld.planEn.length) ? _ld.planEn : (_cd.planEn || []);
    mergedSession.queueOrder = (_ld.queueOrder && _ld.queueOrder.length) ? _ld.queueOrder : (_cd.queueOrder || []);
    // currentEn：取 lastTouch 较新的一侧；都不新则保持本机
    mergedSession.currentEn = (_ld.lastTouch || 0) >= (_cd.lastTouch || 0) ? _ld.currentEn : _cd.currentEn;
    // finished：仅当两端都结束才算结束，避免一端空 session 让本轮提前结束
    mergedSession.finished = !!_ld.finished && !!_cd.finished;
    return { v: mergedSession, changed: JSON.stringify(mergedSession) !== JSON.stringify(_ld) };
  }
  if(_cd && !_ld) return { v: _cd, changed: true };
  return { v: _ld || null, changed: false };
}

function mergeData(local, cloud){
  cloud = cloud || {};
  // 写作模板(writing)是官方共享题集，不进同步，合并时强制忽略云端版本，永远以本机默认模板为准。
  // 口语题库(speaking)【已纳入同步】：不在此删除，函数末尾按 id 双向合并 answers（见下方 _mergeSpeaking）。
  cloud = Object.assign({}, cloud);
  delete cloud.writing;
  const out = Object.assign({}, local);
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  // 单词「加回来」的反向墓碑：deleted \ revived（见 clearWordTombstone 说明）
  const revivedWords = new Set([...(local.revivedIds||[]), ...(cloud.revivedIds||[])]);
  revivedWords.forEach(k => deleted.delete(k));
  const deletedWrong = new Set([...(local.deletedWrongKeys||[]), ...(cloud.deletedWrongKeys||[])]);  // 错句级墓碑（合并传播）
  const delKey = it => (it && it.id != null) ? it.id : (it && it.ts != null) ? it.ts : null;
  let changes = 0;
  const w = _mergeWords(local.words, cloud.words);
  out.words = w.arr.filter(x => !deleted.has('en:'+(String(x.en||'').toLowerCase()))); // 单词按 en 过滤
  changes += w.changes;
  // plans：嵌套结构按 date 合并（同一天 items 按 id 并集、done 取或），合并后按墓碑过滤被删 item
  const pl = _mergePlans(local.plans, cloud.plans, deleted); out.plans = pl.arr; changes += pl.changes;
  // checkins：日期字符串数组，Set 去重并集
  const ci = Array.from(new Set([...(local.checkins||[]), ...(cloud.checkins||[])]));
  if(ci.length !== (local.checkins||[]).length){ changes += ci.length - (local.checkins||[]).length; }
  out.checkins = ci;
  // 其余对象数组按原逻辑，合并后按墓碑过滤
  for(const f of SYNC_ARRAY_FIELDS){
    /* 2026-10-17：出厂内容未就绪（如本机起步语料还没加载）时跳过该字段的合并，
       避免把「本机空数组」当成用户真实状态参与合并；下次就绪后的合并会自然补齐。 */
    if(typeof HUB_FACTORY !== 'undefined' && !HUB_FACTORY.fieldReady(f)) continue;
    if(Array.isArray(cloud[f])){ const r = _mergeArray(local[f], cloud[f]); out[f] = r.arr.filter(x => !deleted.has(delKey(x))); changes += r.changes; }
  }
  // 错句级墓碑落地：合并 dictationLogs 后，真正移除属于墓碑的 mistake 子项（含云端带回的旧 mistake），并丢弃变空的 log，使数据自洽
  if(out.dictationLogs && deletedWrong.size){
    out.dictationLogs = out.dictationLogs.map(log => {
      if(!Array.isArray(log.mistakes)) return log;
      log.mistakes = log.mistakes.filter(mm =>
        !deletedWrong.has((log.sourceId||'') + '|' + (mm.right||'').trim().toLowerCase() + '|' + (mm.wrong||'').trim().toLowerCase()));
      return log;
    }).filter(log => (log.mistakes||[]).length > 0);
  }
  // 万能素材：素材卡按 id 并集；persona/gaps/answers 云端非空取云端（素材自有 deletedIds 墓碑，不叠加全局过滤）
  const mt = _mergeMaterials(local.materials, cloud.materials); out.materials = mt.data; changes += mt.changes;
  // 进行中计时（单一可信源合并）：以 timerId 为生命周期锚点
  //   规则：ended 优先（任一侧 ended → 结果 ended，防双端各自结束叠加）；
  //        同 timerId 进行中 → 心跳 lastBeat 较新者胜（owner 在线续租，另一端看到最新）；
  //        不同 timerId（一端开新计时、另一端旧计时）→ 进行中且未 ended 者优先，都进行中则 lastBeat 新者胜。
  const at = _mergeActiveTimer(local.activeTimer, cloud.activeTimer);
  if(JSON.stringify(at) !== JSON.stringify(local.activeTimer || null)){ out.activeTimer = at; changes++; }
  // 设置白名单：字段级「较新者胜」——对比本机与云端各自的 _fieldTs 时间戳，取更晚保存的一侧。
  // 根治经典 bug：本机刚填的发音分等同步字段，被 10 秒轮询拉到的云端旧值覆盖（"去别的模块回来设置又没了"）。
  // 注：relayToken（AI Key）自 design/62 起已彻底不进同步（上传剥离 + 服务端剥离 + 不在下方白名单），
  //     它只存本机并由 CREDS_KEY 凭证镜像兜底恢复，这里的字段级合并与它无关。
  // 时间戳缺失时回退旧逻辑：云端非空且不同→取云端（兼容早期无 _fieldTs 的云端数据）。
  const ls = local.settings || {}; const cs = cloud.settings || {};
  out.settings = Object.assign({}, ls);
  const lTs = ls._fieldTs || {}; const cTs = cs._fieldTs || {};
  out.settings._fieldTs = Object.assign({}, lTs);
  // 空值判定：null/undefined/空串/空数组/空对象 视为「未填」；未填值绝不覆盖另一侧已填值。
  // 这是「几分钟就清空 Key」死亡循环的关键防御：云端哪怕带更新的时间戳，只要是空值就永不冲掉本机已填的 Key/分数。
  const _isEmpty = v => v == null || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  // targets 全 0 = 语义上的「未设置」（默认值就是全 0，表单留空保存出来就是全 0）：
  // 绝不能凭「本机时间戳较新」压过云端真值，否则换设备登录目标分必丢（之之 9/6 反馈，S2 复现）。
  const _fieldEmpty = (f, v) => {
    if(_isEmpty(v)) return true;
    if(f === 'targets' && v && typeof v === 'object' && !Array.isArray(v)){
      const ks = Object.keys(v);
      return ks.length === 0 || ks.every(k => !_num(v[k]));   // 全 0 / 全空
    }
    return false;
  };
  for(const f of SYNC_SETTINGS_FIELDS){
    const lEmpty = _fieldEmpty(f, ls[f]);
    const cEmpty = _fieldEmpty(f, cs[f]);
    const cl = (lTs[f] != null) ? lTs[f] : 0;
    const cc = (cTs[f] != null) ? cTs[f] : 0;
    if(cEmpty) continue;                       // 云端未填：永不覆盖本机（无论本机是否填写）
    if(lEmpty){                                 // 本机未填、云端有值 → 取云端（含云端时间戳）
      out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; continue;
    }
    // 两端都已填：较新者胜；时间戳相同则取云端（保留恢复能力），仅值不同才计为合并应用
    if(cc > cl){ out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; }
    else if(cl > cc){ /* 本机较新：保持本机，无需操作 */ }
    else if(JSON.stringify(cs[f]) !== JSON.stringify(ls[f])){ out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; }
  }
  // 口语题库(speaking)按 id 双向合并：以官方 SPEAKING_BANK 为基准建库（题数以数组实际为准），
  // 本机与云端同 id 题的 answers/练习记录取「较新一侧」（按 _lastSaved 时间戳或内容非空判断），题干永远用官方。
  // 这样既跨设备恢复串题答案，又不会因早期脏题库复活成 100+ 题（mergeSpeakingKeepAnswers 已保证非官方题丢弃）。
  if(Array.isArray(cloud.speaking) || Array.isArray(local.speaking)){
    const ms = _mergeSpeaking(local.speaking, cloud.speaking);
    out.speaking = ms.arr;
    changes += ms.changes;
  }
  out.deletedIds = Array.from(deleted);
  out.revivedIds = Array.from(revivedWords);   // 反向墓碑随合并传播（与 deletedIds 同口径 union）
  out.deletedWrongKeys = Array.from(deletedWrong);   // 错句级墓碑随合并传播
  // 10/3 AI 陪练长期记忆 coachMem：跨设备按 text 并集（同文本保留较新 t），按时间升序、上限 40。
  // 不用 settings 字段级「较新整份胜」——两端各自追加事实时并集才不丢（e02adc05 铁律：新字段必须在此登记，否则云端那份被整份丢弃）。
  if(Array.isArray(cloud.coachMem)){
    const _normMem = x => (x && typeof x.text === 'string' && x.text.trim())
      ? { t: Number(x.t) || 0, text: String(x.text).trim().slice(0, 80) } : null;
    const _lm = (local.coachMem || []).map(_normMem).filter(Boolean);
    const _cm = (cloud.coachMem || []).map(_normMem).filter(Boolean);
    const _by = new Map();
    _lm.concat(_cm).forEach(x => { const ex = _by.get(x.text); if(!ex || x.t > ex.t) _by.set(x.text, x); });
    const _merged = Array.from(_by.values()).sort((a, b) => a.t - b.t).slice(-40);
    if(JSON.stringify(_merged) !== JSON.stringify(_lm)){ out.coachMem = _merged; changes++; }
  }
  // 当日背词会话（dailySession）：跨设备合并，杜绝云端旧/空会话覆盖本地新进度。
  // 10/1：逻辑抽到 _mergeWbSession（官方词库 obank session 共用同一套），行为逐字保留。
  const _msess = _mergeWbSession(local.dailySession, cloud.dailySession);
  if(_msess.changed && JSON.stringify(_msess.v) !== JSON.stringify(local.dailySession || null)){
    out.dailySession = _msess.v; changes++;
  }
  // 今日背词进度跨设备合并（修复：网页端练了 50 个，手机端「今日已练」仍显示 0）
  // wordSeenToday / wordPracticedToday：同日取 unique 词集合并集（该集合长度即展示值）；wordDayStats：按天取 max
  {
    const _tk = todayKey();
    // ⭐ 9/26 修：wordPracticedToday（9/25 新增的「答一个记一个」，就是首页/背词页的「今日已背」）
    // 此前根本没进合并分支，而 mergeData 的语义是「未显式处理的字段一律以本机为准」→ 云端那份
    // 被整份丢弃、本机永远赢 → 两端各自守着自己的数字互不收敛（实测同时刻 26 vs 200，差的就是它）。
    // 抽成闭包两处共用，避免以后再加「当日 xxx 词集合」时又漏一次。
    const _mergeTodayWordSet = (key) => {
      const lt = local[key], ct = cloud[key];
      let merged = null;
      if(lt && ct){
        if(lt.date === _tk && ct.date === _tk){
          merged = { date: _tk, words: Array.from(new Set([...(lt.words || []), ...(ct.words || [])])) };
        } else if(lt.date === _tk){ merged = lt; }
        else if(ct.date === _tk){ merged = ct; }
      } else if(lt || ct){
        const _only = lt || ct;
        merged = (_only.date === _tk) ? _only : null;   // 非今日的旧记录不回填（本机下次 getTodaySeen 会重置）
      }
      if(merged && JSON.stringify(merged) !== JSON.stringify(local[key] || null)){
        out[key] = merged; changes++;
      }
    };
    _mergeTodayWordSet('wordSeenToday');
    _mergeTodayWordSet('wordPracticedToday');
    /* 当日错词 dailyWrong = { [dateKey]: [en] }：同上也从未进过合并分支
       （9/26 补）——另一端今天答错的词在「今日错词/重练」里永远不出现。
       按天逐 key 取 unique 并集；空的日期不写，避免往云端塞空对象。 */
    {
      const lw = (local.dailyWrong && typeof local.dailyWrong === 'object') ? local.dailyWrong : {};
      const cw = (cloud.dailyWrong && typeof cloud.dailyWrong === 'object') ? cloud.dailyWrong : {};
      const _mergedWrong = {};
      for(const k of new Set([...Object.keys(lw), ...Object.keys(cw)])){
        const u = Array.from(new Set([...(lw[k] || []), ...(cw[k] || [])]));
        if(u.length) _mergedWrong[k] = u;
      }
      if(JSON.stringify(_mergedWrong) !== JSON.stringify(lw)){ out.dailyWrong = _mergedWrong; changes++; }
    }
    const lds = local.wordDayStats || {}, cds = cloud.wordDayStats || {};
    const _allKeys = new Set([...Object.keys(lds), ...Object.keys(cds)]);
    const _mergedStats = {};
    for(const _k of _allKeys){
      const _a = lds[_k] || { totalWords:0, totalMs:0, sessions:0 };
      const _b = cds[_k] || { totalWords:0, totalMs:0, sessions:0 };
      // 关键：用 max 而非 sum —— 云端已含本机上次上传的贡献，重复同步若求和会把本机部分再加一遍导致虚高；
      // max 幂等（max(max(a,b),a)=max(a,b)），永不重复累加，跨设备收敛到「单设备当日最大值」。
      // 「今日已练」主数字走 wordSeenToday 并集（已正确），此处 dayStats 为次级明细，取 max 最稳妥。
      _mergedStats[_k] = {
        totalWords: Math.max(_a.totalWords || 0, _b.totalWords || 0),
        totalMs: Math.max(_a.totalMs || 0, _b.totalMs || 0),
        sessions: Math.max(_a.sessions || 0, _b.sessions || 0)
      };
    }
    if(JSON.stringify(_mergedStats) !== JSON.stringify(local.wordDayStats || {})){
      out.wordDayStats = _mergedStats; changes++;
    }
  }
  /* ── 官方词库进度云同步（10/1 她拍板「背词进度纳入云同步」，Task #25）──
     DATA.obank = { [bankId]: { prog, session, seen, practiced } }，镜像自 wordbank.js 的独立
     localStorage（ielts_hub_obank_v1）。只同步进度四件套；词库本体（静态 json / wrong / dayStats）
     永不上云。合并口径：
     - prog：逐词取 (lastPracticeAt || ts) 更晚一侧（与 _mergeWords design/84「最后练习者胜」同源；
       词库页重置进度会给每个词打新 ts 基准 → 重置结果不会被另一端旧进度复活）；
       同刻视为同一动作已同步，内容相同不计变化（幂等）。
     - seen / practiced：{date,words} 同日 unique 并集、异日取晚（与 wordSeenToday 同思路）。
     - session：_mergeWbSession（与 dailySession 同一套口径）。 */
  {
    const lob = (local.obank && typeof local.obank === 'object') ? local.obank : {};
    const cob = (cloud.obank && typeof cloud.obank === 'object') ? cloud.obank : {};
    if(Object.keys(lob).length || Object.keys(cob).length){
      const _pk = p => (Number(p && (p.lastPracticeAt || p.ts)) || 0);
      const _daySet = (l, c) => {
        if(l && c) return (l.date === c.date)
          ? { date: l.date, words: Array.from(new Set([...(l.words || []), ...(c.words || [])])) }
          : ((String(l.date || '') >= String(c.date || '')) ? l : c);
        return l || c || { date: '', words: [] };
      };
      const _obOut = {};
      let _obCh = 0;
      const _bankIds = Array.from(new Set([...Object.keys(lob), ...Object.keys(cob)]));
      for(const bid of _bankIds){
        const lb = (lob[bid] && typeof lob[bid] === 'object') ? lob[bid] : {};
        const cb = (cob[bid] && typeof cob[bid] === 'object') ? cob[bid] : {};
        const lp = (lb.prog && typeof lb.prog === 'object') ? lb.prog : {};
        const cp = (cb.prog && typeof cb.prog === 'object') ? cb.prog : {};
        const mp = Object.assign({}, cp);   // 起点云端副本：云端独有词天然保留
        for(const k in lp){
          if(!Object.prototype.hasOwnProperty.call(lp, k)) continue;
          const a = lp[k], b = mp[k];
          if(!b || typeof b !== 'object'){ mp[k] = a; _obCh++; continue; }   // 本机独有词条
          const ka = _pk(a), kb = _pk(b);
          if(ka > kb){ mp[k] = a; _obCh++; }   // 本机练习得更晚：本机胜（含答错造成的退步）
        }
        const _s = _daySet(lb.seen, cb.seen);
        const _pr = _daySet(lb.practiced, cb.practiced);
        const _sess = _mergeWbSession(lb.session || null, cb.session || null);
        const mb = { prog: mp, seen: _s, practiced: _pr, session: _sess.v };
        if(JSON.stringify(_s) !== JSON.stringify(lb.seen || null)) _obCh++;
        if(JSON.stringify(_pr) !== JSON.stringify(lb.practiced || null)) _obCh++;
        if(_sess.changed) _obCh++;
        _obOut[bid] = mb;
      }
      // 终闸：合并结果与本机完全一致就不写（防自回声噪音与无谓 PUT）
      if(JSON.stringify(_obOut) !== JSON.stringify(lob)){ out.obank = _obOut; changes += _obCh; }
    }
  }
  /* 句型闯关（patternDrill）跨设备合并（2026-09-09 修复：云端拉取时整份丢弃 +
     手机端任意操作全量上传会把云端进度/我的句型库冲掉——移动端「练习页进度没了」根因）。
     规则：items 按条目 id 取「更进步」一侧（mastered > 未掌握；level 大者胜；同级 updated 新者胜；
     pending 标记做 OR 保留，下次判对自动清除）；custom[] 按 id 并集（同 id 留本机）；
     mockSynced[] 签名并集（同步去重，永不重复导入）；weakness 按 focus 合并
     （wrongCount 取 max 幂等防重复同步累加、lastWrongAt 取较新，design/07 §5.4）。 */
  if(cloud.patternDrill && typeof cloud.patternDrill === 'object'){
    const _pdRank = s => (s && s.status === 'mastered') ? 1 : 0;
    const _pdItems = Object.assign({}, (local.patternDrill && local.patternDrill.items) || {});
    let _pdCh = 0;
    const _cItems = cloud.patternDrill.items || {};
    for(const id in _cItems){
      const a = _pdItems[id], b = _cItems[id];
      if(!b || typeof b !== 'object') continue;
      if(!a){ _pdItems[id] = b; _pdCh++; continue; }
      let win;
      const ra = _pdRank(a), rb = _pdRank(b);
      if(ra !== rb) win = (ra > rb) ? a : b;
      else {
        const la = a.level || 0, lb = b.level || 0;
        if(la !== lb) win = (la > lb) ? a : b;
        else win = (String(a.updated || '') >= String(b.updated || '')) ? a : b;
      }
      if(win !== a){
        _pdItems[id] = win; _pdCh++;
      }
      if((a.pending || b.pending) && !_pdItems[id].pending){ _pdItems[id] = Object.assign({}, _pdItems[id], { pending: true }); _pdCh++; }
    }
    const _pdOut = Object.assign({}, local.patternDrill || {}, { items: _pdItems });
    // custom：按 id 并集（同 id 留本机）；mockSynced：签名并集
    const _lc = Array.isArray(local.patternDrill && local.patternDrill.custom) ? local.patternDrill.custom.slice() : [];
    const _cc = Array.isArray(cloud.patternDrill.custom) ? cloud.patternDrill.custom : [];
    const _ids = new Set(_lc.map(x => x && x.id));
    _cc.forEach(x => { if(x && x.id != null && !_ids.has(x.id)){ _lc.push(x); _pdCh++; } });
    _pdOut.custom = _lc;
    const _ms = Array.from(new Set([
      ...((Array.isArray(local.patternDrill && local.patternDrill.mockSynced)) ? local.patternDrill.mockSynced : []),
      ...((Array.isArray(cloud.patternDrill.mockSynced)) ? cloud.patternDrill.mockSynced : [])
    ]));
    if(_ms.length !== ((local.patternDrill && local.patternDrill.mockSynced) || []).length) _pdCh++;
    _pdOut.mockSynced = _ms;
    // weakness（design/07 §5.4）：按 focus 合并；wrongCount 取 max 不取 sum（幂等——云端已含本机
    // 上次上传的贡献，sum 在重复同步时反复累加虚高），lastWrongAt 取较新。
    // 不显式处理会被上方 Object.assign({}, local.patternDrill) 起步的 _pdOut 整份丢弃云端那份。
    const _lw = (local.patternDrill && local.patternDrill.weakness) || {};
    const _cw = (cloud.patternDrill && cloud.patternDrill.weakness) || {};
    const _mw = {};
    let _wCh = 0;
    Array.from(new Set([...Object.keys(_lw), ...Object.keys(_cw)])).forEach(k => {
      const a = _lw[k] || {}, b = _cw[k] || {};
      const wc = Math.max(Number(a.wrongCount) || 0, Number(b.wrongCount) || 0);
      const lwa = String(a.lastWrongAt || '') >= String(b.lastWrongAt || '') ? (a.lastWrongAt || '') : (b.lastWrongAt || '');
      const md = _sdMergeDaily(a.daily, b.daily);
      _mw[k] = { wrongCount: wc, lastWrongAt: lwa, daily: md };
      if((Number(a.wrongCount) || 0) !== wc || String(a.lastWrongAt || '') !== lwa) _wCh++;
      // daily 跨设备收敛：合并结果任一侧不等 → 计变化并上传，否则下次同步仍不一致
      if(JSON.stringify(md) !== JSON.stringify(a.daily || {}) || JSON.stringify(md) !== JSON.stringify(b.daily || {})) _wCh++;
    });
    if(Object.keys(_lw).length !== Object.keys(_mw).length) _wCh++;
    _pdOut.weakness = _mw;
    _pdCh += _wCh;
    // design/16：句型页进度 patternDrill.sentences = { status: { [句型id]: {st, ts} } }——
    // 按 ts 新者胜（两端同 id 各有状态时取 ts 大的一侧；单侧有则取有的一侧），幂等不累加。
    // design/17：sentences.replay = { [catId]: ts }（拼接验证已做标记）同款按 ts 新者胜。
    const _lss = (local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.status) || {};
    const _css = (cloud.patternDrill && cloud.patternDrill.sentences && cloud.patternDrill.sentences.status) || {};
    const _mss = {};
    Array.from(new Set([...Object.keys(_lss), ...Object.keys(_css)])).forEach(id => {
      const a = _lss[id], b = _css[id];
      if(a && b) _mss[id] = ((Number(b.ts) || 0) > (Number(a.ts) || 0)) ? b : a;
      else _mss[id] = a || b;
    });
    const _lsr = (local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.replay) || {};
    const _csr = (cloud.patternDrill && cloud.patternDrill.sentences && cloud.patternDrill.sentences.replay) || {};
    const _msr = {};
    Array.from(new Set([...Object.keys(_lsr), ...Object.keys(_csr)])).forEach(id => {
      const a = _lsr[id], b = _csr[id];
      _msr[id] = (a && b) ? Math.max(Number(a) || 0, Number(b) || 0) : (a || b);
    });
    /* 10/1 她拍板：「我的语法错题」整模块下线（诊断收录按钮 + 练习分组 + 数据读写全删）。
       sentences.custom 不再参与合并，且合并时强制清空——本地与云端的存量错题随下一次同步整体洗掉。
       （原 design/77 的按 id 并集 + 墓碑 + key 去重逻辑随之退役。） */
    const _hadCustom = ((local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.custom) || []).length;
    if(JSON.stringify(_mss) !== JSON.stringify(_lss) || JSON.stringify(_msr) !== JSON.stringify(_lsr)
       || _hadCustom){
      _pdOut.sentences = Object.assign({}, (local.patternDrill && local.patternDrill.sentences) || {},
        { status: _mss, replay: _msr, custom: [] });
      _pdCh++;
    }
    if(_pdCh){ out.patternDrill = _pdOut; changes += _pdCh; }
  }
  /* design/19：素材集配置 materialSets = { active, topic, enabled, sets:{ [setId]:{topics:[...]} }, updatedAt }
     规则（与 patternDrill.sentences 同款思路，幂等不累加）：
     ① 整体按 updatedAt 新者胜；② sets 逐 id 合并（同 id 时集内 topics 再逐 id 合并：
        lastPracticedAt 取较大、slots 取并集「后者补缺」）；③ 内置集(builtin)永远由本地 JSON 播种，
        合并只是补 lastPracticedAt，不让云端旧快照把本机内置集改回旧版。 */
  if(cloud.materialSets && typeof cloud.materialSets === 'object'){
    const _lm = (local.materialSets && typeof local.materialSets === 'object') ? local.materialSets : {};
    const _cm = cloud.materialSets;
    const _lTs = Number(_lm.updatedAt) || 0, _cTs = Number(_cm.updatedAt) || 0;
    const _win = (_cTs > _lTs) ? _cm : _lm, _lose = (_cTs > _lTs) ? _lm : _cm;
    const _sets = Object.assign({}, (_win.sets || {}));
    Object.keys(_lose.sets || {}).forEach(k => {
      const a = _sets[k], b = _lose.sets[k];
      if(!b || typeof b !== 'object') return;
      if(!a){ _sets[k] = b; return; }
      const map = new Map();
      [...(a.topics || []), ...(b.topics || [])].forEach(t => {
        if(!t || t.id == null) return;
        const ex = map.get(t.id);
        if(!ex){ map.set(t.id, t); return; }
        map.set(t.id, Object.assign({}, ex, t, {
          slots: Object.assign({}, (ex.slots || {}), (t.slots || {})),
          lastPracticedAt: Math.max(Number(ex.lastPracticedAt) || 0, Number(t.lastPracticedAt) || 0)
        }));
      });
      _sets[k] = Object.assign({}, a, b, { topics: Array.from(map.values()),
        updatedAt: Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0) });
    });
    const _act = [(_win.active), (_lose.active)].find(x => x && _sets[x]) || Object.keys(_sets)[0] || 'builtin_demo';
    const _outMs = {
      active: _act,
      topic: _win.topic || _lose.topic || '',
      enabled: (typeof _win.enabled === 'boolean') ? _win.enabled : true,
      sets: _sets,
      updatedAt: Math.max(_lTs, _cTs)
    };
    if(JSON.stringify(_outMs) !== JSON.stringify(_lm)){ out.materialSets = _outMs; changes++; }
  }
  // 合并后同步镜像账号凭证到隔离键（云端可能带来/更新 Key/手机号/发音分，务必落盘镜像）
  if(typeof saveCredsMirror === 'function') saveCredsMirror();
  return { data: out, changes };
}

/* plans 嵌套合并：外层按 date，内层 items 按 id 并集、done 冲突取 true */
/* design/84 任务同步修正（9/22）：
   ① 同 id item：双方都有 updatedAt（毫秒，勾选/取消/改名/新增时由 plans.js 写点统一戳）→ 新者整项胜，
      修复「勾选只能 true 永远回不去 false」「编辑任务名不同步」两个单向合并硬伤；
      任一侧缺 updatedAt（老数据）→ 回退旧口径（done 单向或、text 不动），保证旧快照平滑过渡。
   ② 同 date 内 text 归一去重 + fromId 归并：两台设备同一天各自「自动延续」（各发新 uid）/各自 fillDay
      /各自 AI 安排产生的重复条目，合并时按 fromId（延续来源 id）或归一 text 去重，保留 updatedAt 新者。 */
function _mergePlans(local, cloud, deleted){
  local = Array.isArray(local) ? local : []; cloud = Array.isArray(cloud) ? cloud : [];
  const byDate = new Map(); let changes = 0;
  // 9/25 修：本机同日双对象不再「后者整吞前者」——原 byDate.set 后写覆盖前写，
  // 会把先到对象（可能含用户刚勾的条目）连壳丢掉。现条目并入先到对象（按 id 去重）。
  local.forEach(p => {
    if(!p || !p.date) return;
    const ex = byDate.get(p.date);
    if(!ex){ byDate.set(p.date, p); return; }
    const seenIds = new Set((ex.items || []).map(i => i && i.id));
    (p.items || []).forEach(it => {
      if(!it || it.id == null || seenIds.has(it.id)) return;
      ex.items.push(it); seenIds.add(it.id); changes++;
    });
  });
  cloud.forEach(p => {
    const ex = byDate.get(p.date);
    if(!ex){ byDate.set(p.date, p); changes++; return; }
    const seen = new Set(ex.items.map(i => i.id));
    (p.items||[]).forEach(it => {
      if(!it || it.id == null) return;
      if(!seen.has(it.id)){ ex.items.push(it); seen.add(it.id); changes++; return; }
      const mine = ex.items.find(i => i.id === it.id);
      const mt = Number(mine.updatedAt) || 0, ct = Number(it.updatedAt) || 0;
      if(mt && ct){
        // 双方都有时间戳：新者整项胜（含 done/text/updatedAt 全字段）；相等 = 同一动作已同步，不动（幂等）
        if(ct > mt){ ex.items[ex.items.indexOf(mine)] = it; changes++; }
      } else if(!mt && ct){
        // 9/25 修：本机已勾选但条目无时间戳（老数据/旧版首页勾选）时，绝不被云端「未勾版」冲掉——
        // 勾选是用户动作，进度不因合并倒退；其余字段仍以云端（另一端更新过）为准。
        if(!(mine.done && !it.done)){
          ex.items[ex.items.indexOf(mine)] = it;       // 仅云端有：云端是更新过的客户端，胜
          changes++;
        }
      } else if(!mt && !ct){
        // 双方都是老数据（从未被新写点动过）：回退旧口径（done 单向或、text 不动）
        if(it.done && !mine.done){ mine.done = true; changes++; }
      }
      // mt && !ct：仅本机有 → 本机胜，不动
    });
  });
  for(const p of byDate.values()){
    if(p.items && deleted){ p.items = p.items.filter(it => !deleted.has(it.id)); }
    if(Array.isArray(p.items) && p.items.length > 1){
      const seen = new Map(); const kept = []; let deduped = false;
      p.items.forEach(it => {
        if(!it) return;
        // 9/23 她拍板：同名任务她就是要重复做（同一天排两条「听力 第2篇」），text 去重会把
        // 手动/AI 加的重复条目在跨端同步时吞掉 → 去掉 text 去重，只保留 fromId 去重——
        // 9/25 修：fromId 去重键不再含 done 态。原「f:id+d/o 分键」会让同一来源的两个副本
        // 在勾选态分歧后永久共存（两端各留一条，越合越多）；现统一收敛为 1 条，
        // updatedAt 新者胜；等值时勾选态优先（进度不倒退）。
        const k1 = (it.fromId != null) ? 'f:' + it.fromId : null;
        const hit = (k1 && seen.has(k1)) ? seen.get(k1) : null;
        if(hit){
          deduped = true;
          const ht = Number(hit.updatedAt) || 0, nt = Number(it.updatedAt) || 0;
          if(nt > ht || (nt === ht && it.done && !hit.done)){ kept[kept.indexOf(hit)] = it; seen.set(k1, it); }
          return;
        }
        kept.push(it);
        if(k1) seen.set(k1, it);
      });
      if(deduped){ p.items = kept; changes++; }
    }
  }
  return { arr: Array.from(byDate.values()), changes };
}

/* 万能素材合并：素材卡按 id 去重并集（同 id 留本机），已删除 id（deletedIds 墓碑）过滤，使删除能跨同步传播；
   persona/gaps/answers 云端非空取云端。无 id 的旧卡就地补稳定 hash id，保证墓碑与去重可用。
   若任一侧重新生成过（materialsEpoch 更新），则以较新一侧的素材整体替换另一侧，避免旧卡片被并集回残留成重复 */
function _mergeMaterials(local, cloud){
  local = local || {}; cloud = cloud || {};
  const le = _num(local.materialsEpoch), ce = _num(cloud.materialsEpoch);
  if(le || ce){
    // 重新生成优先：以较新批次整体替换，旧素材不再并集进来
    const winner = (le >= ce) ? local : cloud;
    const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
    const data = (winner.materials||[]).filter(m => m && m.id != null && !deleted.has(m.id));
    const out = Object.assign({}, winner);
    out.materials = data;
    out.deletedIds = Array.from(deleted);
    if(cloud.persona && JSON.stringify(cloud.persona) !== JSON.stringify(local.persona)) out.persona = cloud.persona;
    if(Array.isArray(cloud.gaps) && cloud.gaps.length && JSON.stringify(cloud.gaps) !== JSON.stringify(local.gaps)) out.gaps = cloud.gaps;
    out.answers = Object.assign({}, cloud.answers||{}, local.answers||{});   // 答案本机优先，避免云端旧快照覆盖用户刚改的内容
    _mergeDetailBitsInto(local, cloud, out);   // v7.2：细节碎片库跨设备并集（epoch 重生成也不丢碎片）
    const changes = Math.max(0, data.length - (local.materials||[]).length);
    return { data: out, changes };
  }
  // 旧数据（无 epoch）：维持原按 id 并集去重逻辑
  const out = Object.assign({}, local);
  const ensureId = m => { if(m && m.id == null){ try{ m.id = 'h' + hashStr(JSON.stringify(m)); }catch(_){ m.id = 'h' + Math.random().toString(36).slice(2,9); } } };
  (local.materials||[]).forEach(ensureId);
  (cloud.materials||[]).forEach(ensureId);
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  const map = new Map();
  const add = m => { if(!m || m.id == null) return; if(deleted.has(m.id)) return; if(!map.has(m.id)) map.set(m.id, m); };
  (local.materials||[]).forEach(add);
  (cloud.materials||[]).forEach(add);
  out.materials = Array.from(map.values());
  out.deletedIds = Array.from(deleted);
  if(cloud.persona && JSON.stringify(cloud.persona) !== JSON.stringify(local.persona)){ out.persona = cloud.persona; }
  if(Array.isArray(cloud.gaps) && cloud.gaps.length && JSON.stringify(cloud.gaps) !== JSON.stringify(local.gaps)){ out.gaps = cloud.gaps; }
  // 答案本机优先（与上方 epoch 分支对齐）：云端旧快照不应覆盖用户刚在本机改的内容
  out.answers = Object.assign({}, cloud.answers||{}, local.answers||{});
  _mergeDetailBitsInto(local, cloud, out);   // v7.2：细节碎片库跨设备并集
  const changes = Math.max(0, out.materials.length - (local.materials||[]).length);
  return { data: out, changes };
}
/* v7.2 细节碎片库（DATA.materials.detailBits）跨设备合并：按 id 并集（无 id 用内容哈希），
   同 id 取 ts 较新者；单侧缺失照常并另一侧——她补的/AI 代补的细节不因重生成或换设备丢失 */
function _mergeDetailBitsInto(local, cloud, out){
  const dbL = Array.isArray(local.detailBits) ? local.detailBits : [];
  const dbC = Array.isArray(cloud.detailBits) ? cloud.detailBits : [];
  if(!dbL.length && !dbC.length) return;
  const map = new Map();
  const put = b => {
    if(!b || (!String(b.en||'').trim() && !String(b.zh||'').trim())) return;
    const k = b.id || ('t' + hashStr(String(b.en||'').trim() + '|' + String(b.zh||'').trim()));
    const prev = map.get(k);
    if(!prev || _num(b.ts) >= _num(prev.ts)) map.set(k, b);
  };
  dbL.forEach(put); dbC.forEach(put);
  out.detailBits = Array.from(map.values());
}
/* 分类名防御性清洗：去掉「（xxx）」「(xxx)」等括号及括号内后缀（如「观点型（第一优先级）」→「观点型」）。
   上移到 common.js：错句本等不引入 writing.js 的页面也需要用到，避免 ReferenceError 导致整页渲染中断。 */
function cleanCatName(c){
  if(!c) return c;
  return c.replace(/[（(][^）)]*[）)]/g, '').trim();
}
/* 稳定短哈希（用于给无 id 的旧素材卡补 id，内容相同→同 id 自动去重） */
function hashStr(s){ let h = 0; s = String(s||''); for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
/* 进行中计时的单一可信源合并：以 timerId 为生命周期锚点，杜绝「双端同时计时 + 结束累加」。
   入参 a/b 为 {timerId, ownerDevice, startTs, ..., lastBeat, ended} 或 null。
   规则：
     1) 任一侧 ended 且带 timerId → 结果标记 ended（同 timerId 优先；无 timerId 的 ended 仅当另一侧也空/ended 时采用），
        确保「一端结束」后另一端合并得到 ended、清除本地活跃态，不再续租/恢复/二次入库。
     2) 两侧同 timerId 进行中（都未 ended）→ lastBeat 较新者胜（owner 续租始终是更新鲜的真相）。
     3) 两侧不同 timerId（一侧开新、另一侧旧计时）→ 都进行中取 lastBeat 新者；一侧 ended 则取未 ended 侧。
     4) 仅一侧有时直接取该侧；都为空返回 null。 */
function _mergeActiveTimer(a, b){
  const na = a || null, nb = b || null;
  const aEnded = !!(na && na.ended), bEnded = !!(nb && nb.ended);
  const aId = na && na.timerId, bId = nb && nb.timerId;
  // 规则1：ended 优先
  if(aEnded && bEnded) return { timerId: (aId||bId||null), ended: true, updatedAt: Math.max(_num(na.updatedAt), _num(nb.updatedAt)) };
  if(aEnded){ // a 已结束；若 b 是同 timerId 进行中，仍判 ended（该次计时已收尾）
    return { timerId: (aId || bId || null), ended: true, updatedAt: _num(na.updatedAt) || _num(nb.updatedAt) };
  }
  if(bEnded){
    return { timerId: (bId || aId || null), ended: true, updatedAt: _num(nb.updatedAt) || _num(na.updatedAt) };
  }
  // 两侧都未 ended
  if(na && nb){
    if(aId && bId && aId === bId) return (_num(nb.lastBeat) >= _num(na.lastBeat)) ? nb : na;  // 规则2
    return (_num(nb.lastBeat) >= _num(na.lastBeat)) ? nb : na;                                  // 规则3（lastBeat 新者胜）
  }
  return na || nb;   // 规则4
}