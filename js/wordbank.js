// =====================================================================
//  design/78 官方词库适配层——「我的 / 官方」双词库架构（2026-09-21）
//  职责：数据源路由。自定义词库（custom）逐字节代理现有 DATA.* + hubSave() 行为；
//        官方词库（awl 等）静态 json 只读，进度存独立 localStorage（纯本地、不上云）。
//  约束（design/78 硬约束）：
//    - 不新增 DATA 字段、不碰 mergeData/云同步协议；
//    - 静态 json 运行时只读，进度永远不写回 json；
//    - 状态全挂 window.__OB，脚本软导航重复加载幂等；
//    - localStorage 读写全 try/catch（隐私模式/配额降级内存态并 toast 一次）。
// =====================================================================
(function(){
  if(window.__OB) return;   // 幂等守卫：重复引入不重建状态、不重复声明

  // 官方词包注册表：以后加第二个官方包在这里追加一行即可（本任务只做 awl）。
  // v = 词包版本（与 json 内 meta.version 保持一致），进 fetch URL 做缓存击穿。
  var OB_BANKS = [
    { id: 'awl', file: 'data/official-banks/awl.json', v: '20260921a', tag: 'AWL', total: 570 },
    /* 10-24：题干高频词（她 18:0x 提供 outputs/雅思题干高频词_按频次分档.xlsx，2779 词）。
       数据来源 = 本站 627 篇真题（听力 347 + 阅读 280 / 7202 题）的**题目文字**统计，
       不是原文词表 —— 衡量「读懂题目要认得哪些词」。按出现次数从高到低切 50 章（每章 56 词）。 */
    { id: 'qstem', file: 'data/official-banks/qstem.json', v: '20261124b', tag: '题干高频', total: 2779 },
    /* 10-24：另外四本（她 18:2x「把剩余几个表格全放到我的词书里面去，记住是自动自带我官方的词书」）。
       全部来自 outputs/雅思词表汇总_五合一.xlsx 的 4 个页签，同一套「每章约 56 词、按出现次数从高到低」的切法。 */
    { id: 'rdtext', file: 'data/official-banks/rdtext.json', v: '20261124b', tag: '阅读原文', total: 2651 },
    { id: 'lstext', file: 'data/official-banks/lstext.json', v: '20261124b', tag: '听力原文', total: 1738 },
    { id: 'lstans', file: 'data/official-banks/lstans.json', v: '20261124b', tag: '听力答案', total: 452 },
    { id: 'phr',    file: 'data/official-banks/phr.json',    v: '20261124b', tag: '高频词组', total: 1929 },
    /* 11-20 智能模式：虚拟词库，不 fetch json。合并 rdtext/lstext/lstans 三本，
       按词的最高身份（答案词 > 听力词 > 阅读词）自动标注练法：
         答案词 → dictation（听音写词）/ 听力词 → audio（听音选义）/ 阅读词 → visual（看词选义）。
       每词进度写到它最高身份那本的 localStorage（不存虚拟库自身）；当日 session/seen/错词/统计存虚拟库。 */
    { id: 'smart', file: null, v: '', tag: '智能模式', total: 0, virtual: true }
  ];

  var OB_KEY = 'ielts_hub_obank_v1';
  // prog 只存进度字段（与 resetWordProgress/ensureWordV12 同口径）；
  // 内容字段 en/cn/pos/ipa/sl 永远从 json 来，绝不复制进 localStorage。
  // 9/26：补 lastPracticeAt —— design/84「最后练习者胜」的决胜字段，官方词库漏了它，
  // 跨设备合并时就无法判断谁练得更晚（进度可能被另一端的旧状态反压）。
  var PROG_FIELDS = ['level','nextReview','errTotal','errStreak','okStreak','lastReview','cleared',
                     'shortCount','lastShortTouch','cleanRounds','hist','resetEpoch','dd','dh',
                     'mcDue','hardWord','keyWord','ts','lastPracticeAt'];

  var state = {
    active: 'custom',     // 当前活动词库 id（'custom' 或注册表内的 bankId）
    banks: {},            // { id: { words, meta, prog, session, seen, wrong, dayStats } }
    loaded: {},           // { id: Promise } 词包加载缓存（模式同 pattern-drill.js 的 __pdPatternsCache）
    memOnly: false        // localStorage 不可用 → 降级内存态
  };
  window.__OB = { banks: state.banks, OB_BANKS: OB_BANKS };

  var _toasted = false;
  function _toastOnce(msg){
    if(_toasted) return;
    _toasted = true;
    try{ if(typeof toast === 'function') toast(msg); }catch(e){}
  }

  // ---------- 独立 localStorage 读写 ----------
  function _readStore(){
    try{
      var raw = localStorage.getItem(OB_KEY);
      if(!raw) return null;
      var v = JSON.parse(raw);
      return (v && typeof v === 'object' && v.banks) ? v : null;
    }catch(e){ return null; }
  }
  // 11-01 WD-PERF-HANG-1：_persist 原来把全部官方词库整包 JSON.stringify 同步写盘，
  // 六库叠加 4-8 MB，换词本一次就两轮整包序列化+镜像 diff，主线程秒级阻塞 → 页面无响应。
  // 改法：只写 state.active 那一个库；非活跃库只标 _dirty[id]，hub:data-merged / beforeunload /
  // 下次 _persist 顺路时再合并补写。对读写方完全透明（内存 rec 仍是全量）。
  var _dirty = {};   // { bankId: true } 非活跃库有未落盘的四件套变更
  function _serializeBank(b, bankId){
    var wrong = {};
    Object.keys(b.wrong || {}).forEach(function(day){
      var kept = (b.wrong[day] || []).filter(function(en){
        return !(DATA.wrongRemoved && DATA.wrongRemoved[bankId + '|' + String(en).trim().toLowerCase()]);
      });
      if(kept.length) wrong[day] = kept;
    });
    return { prog: b.prog, session: b.session, seen: b.seen, wrong: wrong, dayStats: b.dayStats,
             practiced: b.practiced || { date: '', words: [] } };
  }
  function _persist(skipMirror){
    if(state.memOnly) return;
    try{
      var out = { active: state.active, banks: {} };
      /* 11-02 WD-OPEN-LAG-1：盘上副本**整轮只读一次**。
         原来这行 var raw = _readStore() 写在 for 循环里 —— 每遇到一个「未标脏的非活跃库」
         就把整个 obank（六库叠加实测 1.0~3.7 MB）重新 JSON.parse 一遍，六库就是 5 次重复解析。
         实测（390 档、1.4 MB 库）单次 _persist 里 _readStore 自耗 50.9 ms、JSON.parse 6 次共 54.7 ms，
         占整次换书 85 ms 的大头。盘上内容在一轮里不会变，读一次就够。 */
      var raw = null, rawRead = false;
      for(var id in state.banks){
        if(!Object.prototype.hasOwnProperty.call(state.banks, id)) continue;
        if(id === state.active){ out.banks[id] = _serializeBank(state.banks[id], id); }
        else if(!_dirty[id]){ // 未标脏的非活跃库，盘上就是最新的，原样带上（体积不变、只省序列化后的写入波动）
          if(!rawRead){ raw = _readStore(); rawRead = true; }
          if(raw && raw.banks && raw.banks[id]) out.banks[id] = raw.banks[id];
        }
        // 标脏的非活跃库：跳过，等 _flushDirty 补写
      }
      localStorage.setItem(OB_KEY, JSON.stringify(out));
      delete _dirty[state.active];
    }catch(e){
      state.memOnly = true;
      _toastOnce('官方词库进度暂时无法保存（浏览器存储不可用），本次进度只保留在内存');
    }
    // 10/1 背词进度云同步（她拍板）：把 prog/session/seen/practiced 镜像进 DATA.obank，
    // 由 hubSave 走既有云同步链路（词库本体永不上云）。skipMirror=true = 云端合并回灌路径，
    // 此时 DATA.obank 已是合并结果，只写本地独立存储、不再反向触发上传（防自回声循环）。
    if(!skipMirror){
      try{
        if(_mirrorToData() && typeof hubSave === 'function') hubSave();
      }catch(e1){}
    }
  }
  // 补写标脏的非活跃库：hub:data-merged / beforeunload / 页面空闲时调用。
  // 只做「读盘 → 改脏库字段 → 写回」，活跃库与未脏库字段不动。
  function _flushDirty(){
    if(state.memOnly) return;
    var dirtyIds = [];
    for(var id in _dirty){ if(_dirty[id] && state.banks[id]) dirtyIds.push(id); }
    if(!dirtyIds.length) return;
    try{
      var raw = _readStore() || { active: wbActive(), banks: {} };
      if(!raw.banks) raw.banks = {};
      for(var i = 0; i < dirtyIds.length; i++){
        raw.banks[dirtyIds[i]] = _serializeBank(state.banks[dirtyIds[i]], dirtyIds[i]);
        delete _dirty[dirtyIds[i]];
      }
      raw.active = wbActive();
      localStorage.setItem(OB_KEY, JSON.stringify(raw));
    }catch(e){}
  }
  // 空闲时顺手补写（不抢主线程：idle 不支持就退 2s 定时，均为一次性）
  function _scheduleFlush(){
    try{
      if(window.requestIdleCallback) requestIdleCallback(_flushDirty, { timeout: 4000 });
      else setTimeout(_flushDirty, 2000);
    }catch(e){ try{ setTimeout(_flushDirty, 2000); }catch(e2){} }
  }
  // 镜像写入 DATA.obank；返回是否发生变化（无变化不触发 hubSave，防无谓整库序列化）。
  // 11-01 卡死修复：原来对全部库各跑两轮 JSON.stringify 做 diff（六库 4-8 MB ×2）。
  // 改为只对活跃库做完整 diff；非活跃库只比对 prog 词数 + session/seen/practiced 的 date 做轻量探测，
  // 探测到差异才标脏并整库替换镜像（正常情况零差异零开销）。
  function _mirrorToData(){
    if(state.memOnly) return false;
    try{
      if(typeof DATA === 'undefined' || !DATA || typeof hubSave !== 'function') return false;
      if(!DATA.obank || typeof DATA.obank !== 'object') DATA.obank = {};
      var changed = false;
      for(var id in state.banks){
        if(!Object.prototype.hasOwnProperty.call(state.banks, id)) continue;
        var b = state.banks[id];
        var next = { prog: b.prog || {}, session: b.session || null,
                     seen: b.seen || { date: '', words: [] },
                     practiced: b.practiced || { date: '', words: [] } };
        if(id === state.active){
          if(JSON.stringify(DATA.obank[id]) !== JSON.stringify(next)){ DATA.obank[id] = next; changed = true; }
        } else {
          // 轻量探测：活跃库才会高频变化；非活跃库只在会话/当日seen/练习日期变动时才可能不同
          var cur = DATA.obank[id];
          var probeSame = cur && cur.session === next.session
            && (!cur.seen || cur.seen.date === next.seen.date)
            && (!cur.practiced || cur.practiced.date === next.practiced.date)
            && (!cur.prog || Object.keys(cur.prog).length === Object.keys(next.prog).length);
          if(!probeSame){
            if(JSON.stringify(cur) !== JSON.stringify(next)){ DATA.obank[id] = next; changed = true; }
          }
        }
      }
      return changed;
    }catch(e){ return false; }
  }
  function _rec(id){
    if(!state.banks[id]){
      state.banks[id] = { words: null, meta: null, prog: {}, session: null,
                          seen: { date: '', words: [] }, wrong: {}, dayStats: {},
                          practiced: { date: '', words: [] } };
    }
    return state.banks[id];
  }
  (function init(){
    var saved = _readStore();
    if(!saved) return;
    state.active = saved.active || 'custom';
    for(var id in saved.banks){
      if(!Object.prototype.hasOwnProperty.call(saved.banks, id)) continue;
      var b = saved.banks[id];
      var rec = _rec(id);
      rec.prog = (b.prog && typeof b.prog === 'object') ? b.prog : {};
      rec.session = b.session || null;
      rec.seen = (b.seen && typeof b.seen === 'object') ? b.seen : { date: '', words: [] };
      rec.wrong = (b.wrong && typeof b.wrong === 'object') ? b.wrong : {};
      rec.dayStats = (b.dayStats && typeof b.dayStats === 'object') ? b.dayStats : {};
      // 10/1：practiced 之前漏存漏恢复（刷新即丢，与 9/25 自定义库同款 bug），补上
      rec.practiced = (b.practiced && typeof b.practiced === 'object') ? b.practiced : { date: '', words: [] };
    }
    // 10/1 背词进度云同步：从 DATA.obank 镜像补缺（新设备 / 清过浏览器存储，但本地 DATA blob
    // 或云端合并带回了官方词库进度）。只补空缺不回退：本地独立存储里已有的词条/更新日期一律保留。
    try{
      if(typeof DATA !== 'undefined' && DATA && DATA.obank && typeof DATA.obank === 'object'){
        for(var bid in DATA.obank){
          var db = DATA.obank[bid];
          if(!db || typeof db !== 'object' || !_findEnt(bid)) continue;
          var r2 = _rec(bid);
          var dp = (db.prog && typeof db.prog === 'object') ? db.prog : {};
          for(var wk in dp){ if(!r2.prog[wk]) r2.prog[wk] = dp[wk]; }
          var ds = (db.seen && typeof db.seen === 'object') ? db.seen : null;
          if(ds && ds.date && (!r2.seen.date || String(r2.seen.date) < String(ds.date))) r2.seen = ds;
          var dpr = (db.practiced && typeof db.practiced === 'object') ? db.practiced : null;
          if(dpr && dpr.date && (!r2.practiced.date || String(r2.practiced.date) < String(dpr.date))) r2.practiced = dpr;
          if(!r2.session && db.session) r2.session = db.session;
        }
      }
    }catch(e){}
  })();

  function _findEnt(id){
    for(var i = 0; i < OB_BANKS.length; i++){ if(OB_BANKS[i].id === id) return OB_BANKS[i]; }
    return null;
  }

  // ---------- 词包加载（fetch + 内存缓存 Promise，静态只读） ----------
  function _applyProg(obj, id){
    var p = _rec(id).prog[String(obj.en).trim().toLowerCase()];
    if(!p) {          // 进度缺失 = 新词：内存初始化（不预写 localStorage）
      obj.level = 0;
      obj.nextReview = todayKey();
      return;
    }
    for(var i = 0; i < PROG_FIELDS.length; i++){
      var f = PROG_FIELDS[i];
      if(p[f] !== undefined) obj[f] = p[f];
    }
  }
  /* 11-20 智能模式：虚拟词库构建。
     合并 rdtext/lstext/lstans 三本，按 en 去重，每词取「最高身份」那本的词对象并标注练法：
       答案词（lstans）→ _smartMode='dictation'，_smartHome='lstans'
       听力词（lstext）→ _smartMode='audio'，_smartHome='lstext'
       阅读词（rdtext）→ _smartMode='visual'，_smartHome='rdtext'
     词对象直接引用 home 库的词对象（同一引用），SRS 字段更新天然同步到 home 库内存态。
     进度落盘由 _wbSaveSmart 按 _smartHome 路由到各 home 库的 prog，不存虚拟库自身。 */
  function _smartReady(){
    if(state.loaded.smart) return state.loaded.smart;
    state.loaded.smart = Promise.all([
      obBankReady('rdtext'), obBankReady('lstext'), obBankReady('lstans')
    ]).then(function(arr){
      var rd = arr[0] || [], ls = arr[1] || [], an = arr[2] || [];
      var map = {};   // en_lower -> { word, mode, home }
      // 阅读词：最低身份，只占位
      rd.forEach(function(w){
        if(!w || !w.en) return;
        var k = String(w.en).trim().toLowerCase();
        if(!map[k]) map[k] = { word: w, mode: 'visual', home: 'rdtext' };
      });
      // 听力词：覆盖阅读词
      ls.forEach(function(w){
        if(!w || !w.en) return;
        var k = String(w.en).trim().toLowerCase();
        map[k] = { word: w, mode: 'audio', home: 'lstext' };
      });
      // 答案词：最高身份，覆盖一切
      an.forEach(function(w){
        if(!w || !w.en) return;
        var k = String(w.en).trim().toLowerCase();
        map[k] = { word: w, mode: 'dictation', home: 'lstans' };
      });
      var words = [];
      for(var k in map){
        if(!Object.prototype.hasOwnProperty.call(map, k)) continue;
        var e = map[k];
        e.word._smartMode = e.mode;
        e.word._smartHome = e.home;
        words.push(e.word);
      }
      var rec = _rec('smart');
      rec.words = words;
      rec.meta = { id:'smart', name:'智能模式', desc:'按词的最高身份自动调配练法', source:'合并阅读/听力/答案三本', total: words.length };
      return words;
    });
    return state.loaded.smart;
  }
  function obBankReady(bankId){
    var id = bankId || 'awl';
    if(id === 'custom') return Promise.resolve();   // custom 无需加载
    if(id === 'smart') return _smartReady();         // 智能模式：合并三本，不 fetch json
    if(state.loaded[id]) return state.loaded[id];
    var ent = _findEnt(id);
    if(!ent) return Promise.reject(new Error('未知官方词库：' + id));
    state.loaded[id] = new Promise(function(resolve, reject){
      fetch(ent.file + '?v=' + (ent.v || '1'))
        .then(function(r){ if(!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '无响应')); return r.json(); })
        .then(function(json){
          var meta = json && json.meta ? json.meta : {};
          var list = (json && Array.isArray(json.words)) ? json.words : [];
          var rec = _rec(id);
          rec.words = list.map(function(w){
            var obj = {
              id: 'ob:' + id + ':' + String(w.en || '').trim().toLowerCase(),
              en: String(w.en || '').trim(),
              cn: String(w.cn || ''),
              pos: String(w.pos || ''),
              ipa: String(w.ipa || ''),
              eg: String(w.eg || ''),
              /* 🔴 10-24 修：原来是 Math.min(10, ...) —— 把 sl 硬夹在 1~10。
                 那是为 AWL 的 10 个 sublist 写死的；题干高频词有 50 章 →
                 第 11 章之后的词全被折进第 10 组，50 章只剩 10 组。
                 改成从 meta.chapters 取上限（没有 chapters 的词包仍按 10 兜底）。 */
              sl: (function(){
                var n = Number(w.sl) || 1;
                var max = (meta && Array.isArray(meta.chapters) && meta.chapters.length) ? meta.chapters.length : 10;
                return Math.min(max, Math.max(1, n));
              })()
            };
            _applyProg(obj, id);
            return obj;
          });
          rec.meta = meta;
          resolve(rec.words);
        })
        .catch(function(err){ delete state.loaded[id]; reject(err); });
    });
    return state.loaded[id];
  }
  // 词包是否已在内存（供页面判断「加载中」占位）
  function wbLoaded(bankId){
    var rec = state.banks[bankId || 'awl'];
    return !!(rec && rec.words);
  }

  // ---------- 活动词库 ----------
  function wbActive(){
    if(state.active === 'custom') return 'custom';
    return _findEnt(state.active) ? state.active : 'custom';   // 脏值兜底回 custom
  }
  function wbSetActive(id){
    var next = (id === 'custom' || !_findEnt(id)) ? 'custom' : id;
    if(next !== state.active){
      // 9/26：切换前钩子—— practice.js 用它把「今日已练」记数先按**旧词库**落盘。
      // 必须在改 state.active 之前调用：wbMarkPracticed 按 wbActive() 路由，切完再写就写错库了。
      try{ if(typeof window.__onBeforeWbSwitch === 'function') window.__onBeforeWbSwitch(state.active, next); }catch(e0){}
      // 11-01 卡死修复：旧活跃库若有变更，先标脏（延后 idle 补写），不再现场整包序列化
      if(state.active !== 'custom' && state.banks[state.active]){
        var _oldRec = state.banks[state.active];
        var _rawNow = null;
        try{ _rawNow = _readStore(); }catch(eQ){ _rawNow = null; }
        var _onDisk = (_rawNow && _rawNow.banks && _rawNow.banks[state.active]) || null;
        if(!_onDisk || JSON.stringify(_onDisk) !== JSON.stringify(_serializeBank(_oldRec, state.active))){
          _dirty[state.active] = true;
        }
      }
      state.active = next;
    }
    _persist();
    // 11-01：切库后顺手安排脏库补写（idle/2s 后），不等 beforeunload 兜底
    if(Object.keys(_dirty).length) _scheduleFlush();
    // design/78：直接调用（非点击委托路径）也要刷新 #wbStudyTag/#wbSwitcher 高亮，
    // 否则 #emptyGoOfficial / onbGoOfficial / officialStartBtn 切库后标签停留旧态
    if(typeof wbRenderSwitchers === 'function') wbRenderSwitchers();
  }

  // ---------- 数据源 ----------
  function wbWords(){
    var a = wbActive();
    if(a === 'custom') return DATA.words || [];
    var rec = state.banks[a];
    return (rec && rec.words) ? rec.words : [];   // 未 ready 返回空数组
  }
  function wbFind(en){
    var k = String(en || '').trim().toLowerCase();
    if(!k) return null;
    // 11-20 智能模式：直接查合并词表（词对象已带 _smartMode/_smartHome）
    if(wbActive() === 'smart'){
      var rec = state.banks.smart;
      var ws = (rec && rec.words) ? rec.words : [];
      for(var i = 0; i < ws.length; i++){
        if(String(ws[i].en || '').trim().toLowerCase() === k) return ws[i];
      }
      return null;
    }
    var ws = wbWords();
    for(var i = 0; i < ws.length; i++){
      if(String(ws[i].en || '').trim().toLowerCase() === k) return ws[i];
    }
    return null;
  }

  // ---------- 落盘 ----------
  function wbSave(){
    var a = wbActive();
    if(a === 'custom'){ hubSave(); return; }
    // 11-20 智能模式：进度按每词的 _smartHome 路由到各 home 库，不落虚拟库自身
    if(a === 'smart'){ _wbSaveSmart(); return; }
    // 官方词库：把内存词数组的进度字段 pick 回 prog，再整体写独立 localStorage
    var rec = _rec(a);
    var ws = rec.words || [];
    var prog = {};
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(!w || !w.en) continue;
      var p = null;
      for(var j = 0; j < PROG_FIELDS.length; j++){
        var f = PROG_FIELDS[j];
        if(w[f] !== undefined){ if(!p) p = {}; p[f] = w[f]; }
      }
      if(p) prog[String(w.en).trim().toLowerCase()] = p;
    }
    rec.prog = prog;
    _persist();
    // 11-01：非活跃库在此路径不会进来（wbSave 只处理活跃库），无需标脏；补写兜底交给 _scheduleFlush
  }
  /* 11-20 智能模式：把每词进度写到它最高身份那本的 prog，再标脏那几本。
     虚拟库自身的 session/seen/seen/wrong/dayStats 由 _persist 正常落盘（active='smart' 时）。 */
  function _wbSaveSmart(){
    var rec = _rec('smart');
    var ws = rec.words || [];
    var byHome = {};   // homeId -> { en: progFields }
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(!w || !w.en || !w._smartHome) continue;
      var p = null;
      for(var j = 0; j < PROG_FIELDS.length; j++){
        var f = PROG_FIELDS[j];
        if(w[f] !== undefined){ if(!p) p = {}; p[f] = w[f]; }
      }
      if(p){
        if(!byHome[w._smartHome]) byHome[w._smartHome] = {};
        byHome[w._smartHome][String(w.en).trim().toLowerCase()] = p;
      }
    }
    for(var home in byHome){
      if(!Object.prototype.hasOwnProperty.call(byHome, home)) continue;
      var hrec = _rec(home);
      if(!hrec.prog || typeof hrec.prog !== 'object') hrec.prog = {};
      /* 合并而非整包替换：home 库里还存着「身份被更高那本覆盖」的词的旧进度
         （比如既是阅读词又是答案词的词，其阅读库副本的进度仍在），整包替换会把它们清掉。 */
      for(var en in byHome[home]){
        if(Object.prototype.hasOwnProperty.call(byHome[home], en)) hrec.prog[en] = byHome[home][en];
      }
      _dirty[home] = true;   // 非活跃 home 库标脏，_persist 会跳过、_flushDirty 补写
    }
    _persist();
    if(Object.keys(_dirty).length) _scheduleFlush();
  }

  // ---------- 当日 session ----------
  function wbSession(){
    var a = wbActive();
    if(a === 'custom') return DATA.dailySession || null;
    return _rec(a).session || null;
  }
  function wbSetSession(s){
    var a = wbActive();
    if(a === 'custom'){ DATA.dailySession = s; return; }
    _rec(a).session = s || null;
  }

  // ---------- 今日已练 seen（对照 getTodaySeen/markSeen，含跨日重置） ----------
  function wbSeen(){
    var t = todayKey();
    var a = wbActive();
    if(a === 'custom'){
      if(!DATA.wordSeenToday) DATA.wordSeenToday = { date: t, words: [] };
      if(DATA.wordSeenToday.date !== t) DATA.wordSeenToday = { date: t, words: [] };
      return DATA.wordSeenToday;
    }
    var rec = _rec(a);
    if(!rec.seen || rec.seen.date !== t) rec.seen = { date: t, words: [] };
    return rec.seen;
  }
  function wbMarkSeen(words){
    var s = wbSeen();
    var set = new Set(s.words);
    // 兼容两种入参：词对象（{en}）与纯字符串
    for(var i = 0; i < (words || []).length; i++){
      var w = words[i];
      var k = String((w && w.en) || (typeof w === 'string' ? w : '')).trim().toLowerCase();
      if(k) set.add(k);
    }
    s.words = Array.from(set);
    wbSave();
  }

  /* ---------- 今日已练（9/25 新增）：当天「作答过」的 unique 词，答完一个记一个 ----------
     与 seen 严格分开：seen = 整轮完成后才写、用于「新一轮排除已出过的词」；
     practiced = 每题作答即记（内存节流落盘），用于「每日学习上限」的已背计数。
     分流原因：把 seen 提前到每题会影响下一轮出题与短线巩固，那是另一套语义，不动。 */
  function wbPracticed(){
    var t = todayKey();
    var a = wbActive();
    if(a === 'custom'){
      if(!DATA.wordPracticedToday) DATA.wordPracticedToday = { date: t, words: [] };
      if(DATA.wordPracticedToday.date !== t) DATA.wordPracticedToday = { date: t, words: [] };
      return DATA.wordPracticedToday;
    }
    var rec = _rec(a);
    if(!rec.practiced || rec.practiced.date !== t) rec.practiced = { date: t, words: [] };
    return rec.practiced;
  }
  function wbMarkPracticed(words){
    var s = wbPracticed();
    var set = new Set(s.words);
    for(var i = 0; i < (words || []).length; i++){
      var w = words[i];
      var k = String((w && w.en) || (typeof w === 'string' ? w : '')).trim().toLowerCase();
      if(k) set.add(k);
    }
    s.words = Array.from(set);
    wbSave();
  }

  /* 错词墓碑：wrongRemoved = 手工移出，wrongRestored = 重新答错/手工恢复。
     两端用时间戳比较，避免「一端移出、另一端重新答错」时墓碑永久压住恢复。 */
  function _wrongKey(bankId, en){
    return String(bankId || '') + '|' + String(en || '').trim().toLowerCase();
  }
  function _markWrongRestored(key){
    if(!key || typeof DATA === 'undefined') return;
    // 没有本机墓碑可清时不记恢复戳：避免每个答错词都往同步包塞一条记录。
    if(!DATA.wrongRemoved || !Object.prototype.hasOwnProperty.call(DATA.wrongRemoved, key)) return;
    DATA.wrongRestored = DATA.wrongRestored || {};
    DATA.wrongRestored[key] = Date.now();
    delete DATA.wrongRemoved[key];
  }
  function _markWrongRemoved(key){
    if(!key || typeof DATA === 'undefined') return;
    DATA.wrongRemoved = DATA.wrongRemoved || {};
    DATA.wrongRemoved[key] = Date.now();
    if(DATA.wrongRestored) delete DATA.wrongRestored[key];
  }

  // ---------- 今日错词（对照 recordDailyWrong/todayWrongEns：去重、只写不清、按日期切换） ----------
  function wbRecordWrong(en){
    var t = todayKey();
    var k = String(en).toLowerCase();
    var a = wbActive();
    _markWrongRestored(_wrongKey(a, k));
    /* 11-26：错词记录带词条快照——词条以后被删/换库也能显示释义、词性、音标。
       只存轻量字段，重复记同一词不覆盖已有快照。 */
    var snap = _wrongSnap(a, k);
    if(a === 'custom'){
      DATA.dailyWrong = DATA.dailyWrong || {};
      if(!DATA.dailyWrong[t]) DATA.dailyWrong[t] = [];
      if(!DATA.dailyWrong[t].includes(k)) DATA.dailyWrong[t].push(k);
      if(snap) _saveWrongSnap(a, k, snap);
      return;
    }
    var rec = _rec(a);
    if(!rec.wrong[t]) rec.wrong[t] = [];
    if(!rec.wrong[t].includes(k)) rec.wrong[t].push(k);
    if(snap) _saveWrongSnap(a, k, snap);
  }
  function _wrongSnap(bankId, key){
    var w = null;
    try{
      if(bankId === 'custom') w = (DATA.words || []).filter(function(x){ return x && String(x.en || '').trim().toLowerCase() === key; })[0];
      else w = ((window.__OB && window.__OB.banks && window.__OB.banks[bankId] && window.__OB.banks[bankId].words) || []).filter(function(x){ return x && String(x.en || '').trim().toLowerCase() === key; })[0];
    }catch(e){}
    if(!w) return null;
    var o = {};
    if(w.cn) o.cn = w.cn;
    if(w.pos) o.pos = w.pos;
    if(w.ipa) o.ipa = w.ipa;
    if(w.eg) o.eg = w.eg;
    return Object.keys(o).length ? o : null;
  }
  function _saveWrongSnap(bankId, key, snap){
    try{
      var all = (typeof DATA !== 'undefined' && DATA.wrongSnaps) || (DATA.wrongSnaps = {});
      var k = bankId + '|' + key;
      if(!all[k]) all[k] = snap;
    }catch(e){}
  }
  function wbTodayWrongEns(){
    var t = todayKey();
    var a = wbActive();
    var list = (a === 'custom') ? ((DATA.dailyWrong && DATA.dailyWrong[t]) || []) : (_rec(a).wrong[t] || []);
    return Array.from(new Set(list.map(function(e){ return String(e || '').trim().toLowerCase(); }).filter(Boolean)));
  }

  // ---------- 每日统计（对照 getTodayStats/addTodayStats 逐行镜像） ----------
  function wbDayStats(){
    var t = todayKey();
    var a = wbActive();
    if(a === 'custom'){
      if(!DATA.wordDayStats) DATA.wordDayStats = {};
      if(!DATA.wordDayStats[t]) DATA.wordDayStats[t] = { totalWords: 0, totalMs: 0, sessions: 0 };
      return DATA.wordDayStats[t];
    }
    var rec = _rec(a);
    if(!rec.dayStats[t]) rec.dayStats[t] = { totalWords: 0, totalMs: 0, sessions: 0 };
    return rec.dayStats[t];
  }
  function wbAddDayStats(wordsCount, ms){
    var st = wbDayStats();
    st.totalWords = Math.max(0, wordsCount || 0);
    st.totalMs += Math.max(0, ms || 0);
    st.sessions += 1;
    wbSave();
  }

  // ---------- 首页计数（buildQueue 同口径纯计数：en 非空且无排程或已到期；不写库不 reconcile） ----------
  function wbDueCount(today){
    var t = today || todayKey();
    var ws = wbWords();
    var n = 0;
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(w && typeof w.en === 'string' && w.en.trim() !== '' && (!w.nextReview || w.nextReview <= t)) n++;
    }
    return n;
  }

  /* ===== 10-23 P-2：到期词拆「新词 / 复习」两段（她 15:2x 拍板选 A）=====
     旧 wbDueCount 把「从没背过的生词」（无 nextReview）也算进「到期复习」——
     她真实词库 1587 个「到期」里 636 个是 level 0 的生词，「复习」名不副实。
     本函数只拆口径、不动任何词数据；wbDueCount 保持原样（别处还在用）。
     不变式：newCount + reviewCount === wbDueCount(today)（同一条 en 非空过滤）。 */
  function wbDueSplit(today){
    var t = today || todayKey();
    var ws = wbWords();
    var nNew = 0, nRev = 0;
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(!(w && typeof w.en === 'string' && w.en.trim() !== '')) continue;
      /* 「新词」= 从没真正进过复习队列的：
         ① 无 nextReview（方案口径原文）；
         ② 有 nextReview 但毫无复习证据（无 hist、无 lastReview、level 0）——
            practice 的 ensureWordV12 会给老结构词就地补 nextReview=今天，只认①会把这批误判成复习。 */
      var _noHist = !Array.isArray(w.hist) || w.hist.length === 0;
      if(!w.nextReview || (_noHist && !w.lastReview && (Number(w.level) || 0) === 0 && w.nextReview <= t)){ nNew++; }
      else if(w.nextReview <= t && (Number(w.level) || 0) >= 1){ nRev++; }
      else if(w.nextReview <= t && _noHist && !w.lastReview){ nNew++; }   // level 缺失但同样从没背过
    }
    return { newCount: nNew, reviewCount: nRev, total: nNew + nRev };
  }

  // ---------- 元信息 / 掌握数 ----------
  function wbBankMeta(bankId){
    var id = bankId || wbActive();
    if(id === 'custom') return null;
    if(id === 'smart') return { id:'smart', name:'智能模式', desc:'按词的最高身份自动调配练法', source:'合并阅读/听力/答案三本', total: (state.banks.smart && state.banks.smart.words ? state.banks.smart.words.length : 0) };
    var rec = state.banks[id];
    if(rec && rec.meta) return rec.meta;
    var ent = _findEnt(id);
    return ent ? { id: id, name: ent.tag || id, desc: '', source: '' } : null;   // 未加载时的兜底
  }
  function wbMasteredCount(bankId){
    var id = bankId || wbActive();
    var ws;
    // 11-20 智能模式：三本已掌握数合计，口径与 wbSmartStats 同源
    if(id === 'smart') return wbSmartStats().mastered;
    if(id === 'custom') ws = DATA.words || [];
    else { var rec = state.banks[id]; ws = (rec && rec.words) ? rec.words : []; }
    var n = 0;
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(w && w.cleared === true && (Number(w.level) || 0) >= 5) n++;   // 与 renderBankStats 口径一致
    }
    return n;
  }
    /* 11-20 智能模式：三本合计统计（词书卡 / 词书详情 / 已掌握数共用，避免各算一套对不上）。
       total = 合并去重后的词数：优先用已加载的虚拟库词表长度，否则按三本已加载词表的 en 去重；
       三本都没加载时退回注册表合计（含重复，仅占位，加载后重算）。
       11-20 修：mastered / learning / notDue **不能**简单三本相加 —— 同一词在多本 prog 都可能有
       旧进度（智能库上线前在各本单练过，_wbSaveSmart 刻意保留旧副本不清），相加会把一个词数成 2~3 个。
       改成按「每词只归属它最高身份那本」计一次：优先读智能库词表的 _smartHome；
       未加载时按三本已加载词表重建 home 映射（与 _smartReady 的覆盖顺序一致）。 */
  function wbSmartStats(){
    var homes = ['rdtext','lstext','lstans'];
    var total = 0, mastered = 0, learning = 0, notDue = 0;
    var uniq = {};
    var srec = state.banks.smart;
    if(srec && srec.words && srec.words.length){
      total = srec.words.length;
    } else {
      homes.forEach(function(home){
        var ws = state.banks[home] && state.banks[home].words;
        (ws || []).forEach(function(w){ if(w && w.en) uniq[String(w.en).trim().toLowerCase()] = 1; });
      });
      total = Object.keys(uniq).length;
      if(!total){
        homes.forEach(function(home){ var ent = _findEnt(home); total += (ent && ent.total) || 0; });
      }
    }
    var today = todayKey();
    // en → 最高身份 home（答案词 > 听力词 > 阅读词），与 _smartReady 的覆盖顺序同源
    var homeOf = {};
    if(srec && srec.words && srec.words.length){
      srec.words.forEach(function(w){
        if(w && w.en && w._smartHome) homeOf[String(w.en).trim().toLowerCase()] = w._smartHome;
      });
    } else {
      ['rdtext','lstext','lstans'].forEach(function(home){
        var ws = state.banks[home] && state.banks[home].words;
        (ws || []).forEach(function(w){ if(w && w.en) homeOf[String(w.en).trim().toLowerCase()] = home; });
      });
    }
    for(var en in homeOf){
      if(!Object.prototype.hasOwnProperty.call(homeOf, en)) continue;
      var hrec = state.banks[homeOf[en]];
      var p = (hrec && hrec.prog && hrec.prog[en]) || {};
      if(p.cleared === true && (Number(p.level) || 0) >= 5) mastered++;
      else if((Number(p.level) || 0) > 0 || p.lastReview) learning++;
      if(p.nextReview && p.nextReview > today) notDue++;
    }
    return { total: total, mastered: mastered, learning: learning, notDue: notDue };
  }

  // ---------- 重置官方词库进度（两步内联确认由调用方 UI 负责） ----------
  function wbResetBank(bankId){
    var id = bankId;
    if(!id || id === 'custom' || !_findEnt(id)) return;
    // 11-20 智能模式：重置 = 重置三本 home 库的进度 + 清虚拟库自身 session/seen/错词/统计
    if(id === 'smart'){
      ['rdtext','lstext','lstans'].forEach(function(home){ wbResetBank(home); });
      var srec = _rec('smart');
      srec.prog = {}; srec.session = null;
      srec.seen = { date: '', words: [] }; srec.wrong = {}; srec.dayStats = {};
      // 智能库 words 是 home 库词对象的引用，重置后需重建内存词数组（重新拉 home 库）
      delete state.loaded.smart;
      srec.words = null;
      _persist();
      if(Object.keys(_dirty).length) _scheduleFlush();
      return;
    }
    var rec = _rec(id);
    rec.prog = {};
    rec.session = null;
    rec.seen = { date: '', words: [] };
    rec.wrong = {};
    rec.dayStats = {};
    // 重建内存词数组：只留内容字段 + 新词初值，进度字段全部清掉。
    // ts=now：云合并逐词按 (lastPracticeAt||ts) 新者胜——重置后每个词的 ts 基准晚于云端旧
    // lastPracticeAt，重置结果不会被另一端的旧进度复活（与 words.js resetWordProgress 同思路）。
    if(rec.words){
      var _now = Date.now();
      var fresh = [];
      for(var i = 0; i < rec.words.length; i++){
        var w = rec.words[i];
        // 保留全部内容字段（含例句 eg），只把进度字段重置为初值。
        // 修：此前漏掉 eg，重置后例句从内存消失，要等软导航重载才回来。
        fresh.push({ id: w.id, en: w.en, cn: w.cn, pos: w.pos, ipa: w.ipa, eg: w.eg, sl: w.sl,
                     ts: _now, level: 0, nextReview: todayKey() });
      }
      rec.words = fresh;
      /* 11-20 修：重建了 rec.words，但 state.loaded[id] 这个 Promise 仍解析到**旧**数组。
         智能模式重新合并时走 obBankReady(home)，拿到的就是旧词对象（还带着重置前的
         level/cleared），表现为「重置完还有十几个词残留进度」。这里一并让缓存失效，
         下次 ready 重新拉 json（静态词包，代价一次请求）。 */
      delete state.loaded[id];
    }
    /* 非活跃库重置后内存已改，但 _persist 只写活跃库、未标脏的非活跃库会原样带上盘上旧值
       —— 不标脏等于重置没落盘。标脏后由 _flushDirty 补写。 */
    if(id !== state.active) _dirty[id] = true;
    _persist();
    if(Object.keys(_dirty).length) _scheduleFlush();
  }

  // ---------- 词库切换控件（只渲染词库页 #wbSwitcher；9/26 她拍板：学习页不再显示词库切换器，
  //            原 #wbStudyTag 紧凑段控件已删，要换词库去「词库」页切） ----------
  function _switcherHtml(active, compact){
    var html = '';
    if(compact) html += '<span class="wb-tag-label">词库</span>';
    html += '<span class="wb-seg' + (compact ? '' : ' wb-seg-bank') + '">';
    // 我的词库
    html += '<button type="button" class="wb-seg-btn' + (active === 'custom' ? ' active' : '') + '" data-wb="custom">' +
            (compact ? '我的' : ('我的词库（' + ((DATA.words || []).length) + '）')) + '</button>';
    // 官方词库（注册表逐个出按钮）
    for(var i = 0; i < OB_BANKS.length; i++){
      var ent = OB_BANKS[i];
      var rec = state.banks[ent.id];
      var total = (rec && rec.words) ? rec.words.length : (ent.total || 0);
      var mastered = wbMasteredCount(ent.id);
      html += '<button type="button" class="wb-seg-btn' + (active === ent.id ? ' active' : '') + '" data-wb="' + ent.id + '">' +
              (compact ? ent.tag : (ent.tag + '（' + mastered + '/' + total + '）')) + '</button>';
    }
    html += '</span>';
    return html;
  }
  function wbRenderSwitchers(){
    var a = wbActive();
    var sw = document.getElementById('wbSwitcher');
    if(sw) sw.innerHTML = _switcherHtml(a, false);
  }
  // 切换点击：容器级事件委托（document 一次绑定 + 一次性守卫，软导航不重复）
  if(!window.__wbSegBound){
    window.__wbSegBound = true;
    document.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('.wb-seg-btn') : null;
      if(!btn || !btn.dataset.wb) return;
      var id = btn.dataset.wb;
      if(id === wbActive()) return;
      wbSetActive(id);
      var m = wbBankMeta(id);
      var name = (id === 'custom') ? '我的词库' : ((m && m.name) ? m.name : id);
      try{ toast('已切换到「' + name + '」词库'); }catch(e2){}
      wbRenderSwitchers();
      try{ document.dispatchEvent(new CustomEvent('wb:switched', { detail: { id: id } })); }catch(e3){}
    });
  }

  // ---------- 云端合并回灌（10/1 背词进度云同步）----------
  // mergeData 把 DATA.obank（本机镜像 + 云端）合并好后广播 hub:data-merged；
  // 这里把合并结果写回 rec（含已加载的内存词数组），再只写本地独立存储（skipMirror 防上传回环）。
  function _applyMergedBank(id){
    var d = DATA.obank[id];
    if(!d || typeof d !== 'object') return false;
    var rec = _rec(id);
    var np = (d.prog && typeof d.prog === 'object') ? d.prog : {};
    var ns = d.session || null;
    var nsn = (d.seen && typeof d.seen === 'object') ? d.seen : { date: '', words: [] };
    var npr = (d.practiced && typeof d.practiced === 'object') ? d.practiced : { date: '', words: [] };
    // 12s 轮询每次合并都会走到这里：四件套完全一致就不动（防无谓写盘）
    if(JSON.stringify(rec.prog) === JSON.stringify(np) && JSON.stringify(rec.session || null) === JSON.stringify(ns)
       && JSON.stringify(rec.seen || null) === JSON.stringify(nsn) && JSON.stringify(rec.practiced || null) === JSON.stringify(npr)){
      return false;
    }
    rec.prog = np;
    rec.session = ns;
    rec.seen = nsn;
    rec.practiced = npr;
    // 已加载的词数组：另一端更晚练习的词把进度刷回来（比词对象当前 (lastPracticeAt||ts) 新才刷）
    if(rec.words){
      for(var i = 0; i < rec.words.length; i++){
        var w = rec.words[i]; if(!w || !w.en) continue;
        var p = rec.prog[String(w.en).trim().toLowerCase()];
        if(!p) continue;
        var pk = Number(p.lastPracticeAt || p.ts) || 0;
        var wk = Number(w.lastPracticeAt || w.ts) || 0;
        if(pk > wk){
          for(var j = 0; j < PROG_FIELDS.length; j++){
            var f = PROG_FIELDS[j];
            if(p[f] !== undefined) w[f] = p[f];
          }
        }
      }
    }
    return true;
  }
  document.addEventListener('hub:data-merged', function(){
    try{
      if(typeof DATA === 'undefined' || !DATA || !DATA.obank || typeof DATA.obank !== 'object') return;
      var touched = false;
      for(var id in DATA.obank){
        if(!Object.prototype.hasOwnProperty.call(DATA.obank, id)) continue;
        if(!_findEnt(id)) continue;   // 只认注册表内的官方词库
        if(_applyMergedBank(id)){
          touched = true;
          if(id !== state.active) _dirty[id] = true;   // 非活跃库被回灌改了内存 rec，标脏等补写
        }
      }
      if(touched) _persist(true);
      if(Object.keys(_dirty).length) _scheduleFlush();
    }catch(e){}
  });
  // 11-01 卡死修复：脏库兜底补写——页面要关了、或云端合并回来时，把标脏的库写盘，不丢进度
  window.addEventListener('beforeunload', function(){ try{ _flushDirty(); }catch(e){} });
  document.addEventListener('visibilitychange', function(){
    try{ if(document.visibilityState === 'hidden') _flushDirty(); }catch(e){}
  });

  // ---------- 对外暴露 ----------
  window.OB_BANKS = OB_BANKS;
  window.obBankReady = obBankReady;
  window.wbLoaded = wbLoaded;
  window.wbActive = wbActive;
  window.wbSetActive = wbSetActive;
  window.wbWords = wbWords;
  window.wbFind = wbFind;
  window.wbSave = wbSave;
  window.wbSession = wbSession;
  window.wbSetSession = wbSetSession;
  window.wbSeen = wbSeen;
  window.wbMarkSeen = wbMarkSeen;
  window.wbPracticed = wbPracticed;
  window.wbMarkPracticed = wbMarkPracticed;
  window.wbRecordWrong = wbRecordWrong;
  window.wbTodayWrongEns = wbTodayWrongEns;
  window.wbDayStats = wbDayStats;
  window.wbAddDayStats = wbAddDayStats;
  window.wbDueCount = wbDueCount;
  window.wbDueSplit = wbDueSplit;
  window.wbBankMeta = wbBankMeta;
  window.wbMasteredCount = wbMasteredCount;
  window.wbSmartStats = wbSmartStats;
  window.wbResetBank = wbResetBank;
  window.wbForgetWrong = function(en){
    var key = _wrongKey(wbActive(), en);
    if(typeof DATA === 'undefined' || !key.split('|')[1]) return;
    _markWrongRemoved(key);
    if(typeof hubSave === 'function') hubSave();
    _persist();
  };
  window.wbForgetWrongIn = function(bankId, en){
    var id = bankId || wbActive();
    var word = String(en || '').trim().toLowerCase();
    if(typeof DATA === 'undefined' || !word) return;
    _markWrongRemoved(_wrongKey(id, word));
    if(id === 'custom'){
      Object.keys(DATA.dailyWrong || {}).forEach(function(day){
        DATA.dailyWrong[day] = (DATA.dailyWrong[day] || []).filter(function(x){ return String(x).toLowerCase() !== word; });
      });
    }else{
      try{
        var raw = _readStore();
        if(raw && raw.banks && raw.banks[id] && raw.banks[id].wrong){
          Object.keys(raw.banks[id].wrong).forEach(function(day){
            raw.banks[id].wrong[day] = (raw.banks[id].wrong[day] || []).filter(function(x){ return String(x).toLowerCase() !== word; });
          });
          localStorage.setItem(OB_KEY, JSON.stringify(raw));
        }
      }catch(e){}
    }
    if(typeof hubSave === 'function') hubSave();
  };
  window.wbRestoreWrong = function(en){
    if(typeof DATA === 'undefined') return;
    _markWrongRestored(_wrongKey(wbActive(), en));
    if(typeof hubSave === 'function') hubSave();
    _persist();
  };
  window.wbRenderSwitchers = wbRenderSwitchers;
})();



