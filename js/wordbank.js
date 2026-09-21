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
    { id: 'awl', file: 'data/official-banks/awl.json', v: '20260921a', tag: 'AWL', total: 570 }
  ];

  var OB_KEY = 'ielts_hub_obank_v1';
  // prog 只存进度字段（与 resetWordProgress/ensureWordV12 同口径）；
  // 内容字段 en/cn/pos/ipa/sl 永远从 json 来，绝不复制进 localStorage。
  var PROG_FIELDS = ['level','nextReview','errTotal','errStreak','okStreak','lastReview','cleared',
                     'shortCount','lastShortTouch','cleanRounds','hist','resetEpoch','dd','dh',
                     'mcDue','hardWord','keyWord','ts'];

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
  function _persist(){
    if(state.memOnly) return;
    try{
      var out = { active: state.active, banks: {} };
      for(var id in state.banks){
        if(!Object.prototype.hasOwnProperty.call(state.banks, id)) continue;
        var b = state.banks[id];
        out.banks[id] = { prog: b.prog, session: b.session, seen: b.seen, wrong: b.wrong, dayStats: b.dayStats };
      }
      localStorage.setItem(OB_KEY, JSON.stringify(out));
    }catch(e){
      state.memOnly = true;
      _toastOnce('官方词库进度暂时无法保存（浏览器存储不可用），本次进度只保留在内存');
    }
  }
  function _rec(id){
    if(!state.banks[id]){
      state.banks[id] = { words: null, meta: null, prog: {}, session: null,
                          seen: { date: '', words: [] }, wrong: {}, dayStats: {} };
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
    }
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
  function obBankReady(bankId){
    var id = bankId || 'awl';
    if(id === 'custom') return Promise.resolve();   // custom 无需加载
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
              sl: Math.min(10, Math.max(1, Number(w.sl) || 10))
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
    state.active = (id === 'custom' || !_findEnt(id)) ? 'custom' : id;
    _persist();
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

  // ---------- 今日错词（对照 recordDailyWrong/todayWrongEns：去重、只写不清、按日期切换） ----------
  function wbRecordWrong(en){
    var t = todayKey();
    var k = String(en).toLowerCase();
    var a = wbActive();
    if(a === 'custom'){
      DATA.dailyWrong = DATA.dailyWrong || {};
      if(!DATA.dailyWrong[t]) DATA.dailyWrong[t] = [];
      if(!DATA.dailyWrong[t].includes(k)) DATA.dailyWrong[t].push(k);
      return;
    }
    var rec = _rec(a);
    if(!rec.wrong[t]) rec.wrong[t] = [];
    if(!rec.wrong[t].includes(k)) rec.wrong[t].push(k);
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

  // ---------- 元信息 / 掌握数 ----------
  function wbBankMeta(bankId){
    var id = bankId || wbActive();
    if(id === 'custom') return null;
    var rec = state.banks[id];
    if(rec && rec.meta) return rec.meta;
    var ent = _findEnt(id);
    return ent ? { id: id, name: ent.tag || id, desc: '', source: '' } : null;   // 未加载时的兜底
  }
  function wbMasteredCount(bankId){
    var id = bankId || wbActive();
    var ws;
    if(id === 'custom') ws = DATA.words || [];
    else { var rec = state.banks[id]; ws = (rec && rec.words) ? rec.words : []; }
    var n = 0;
    for(var i = 0; i < ws.length; i++){
      var w = ws[i];
      if(w && w.cleared === true && (Number(w.level) || 0) >= 5) n++;   // 与 renderBankStats 口径一致
    }
    return n;
  }

  // ---------- 重置官方词库进度（两步内联确认由调用方 UI 负责） ----------
  function wbResetBank(bankId){
    var id = bankId;
    if(!id || id === 'custom' || !_findEnt(id)) return;
    var rec = _rec(id);
    rec.prog = {};
    rec.session = null;
    rec.seen = { date: '', words: [] };
    rec.wrong = {};
    rec.dayStats = {};
    // 重建内存词数组：只留内容字段 + 新词初值，进度字段全部清掉
    if(rec.words){
      var fresh = [];
      for(var i = 0; i < rec.words.length; i++){
        var w = rec.words[i];
        fresh.push({ id: w.id, en: w.en, cn: w.cn, pos: w.pos, ipa: w.ipa, sl: w.sl,
                     level: 0, nextReview: todayKey() });
      }
      rec.words = fresh;
    }
    _persist();
  }

  // ---------- 词库切换控件（学习页 #wbStudyTag / 词库页 #wbSwitcher 共用渲染） ----------
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
    var tag = document.getElementById('wbStudyTag');
    if(tag) tag.innerHTML = _switcherHtml(a, true);
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
  window.wbRecordWrong = wbRecordWrong;
  window.wbTodayWrongEns = wbTodayWrongEns;
  window.wbDayStats = wbDayStats;
  window.wbAddDayStats = wbAddDayStats;
  window.wbDueCount = wbDueCount;
  window.wbBankMeta = wbBankMeta;
  window.wbMasteredCount = wbMasteredCount;
  window.wbResetBank = wbResetBank;
  window.wbRenderSwitchers = wbRenderSwitchers;
})();
