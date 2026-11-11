/* ==========================================================================
   WORDBOOK-TABS-1（11-07）· 单词页左栏功能 tab + 右侧多视图
   --------------------------------------------------------------------------
   她 11-07「这个单词页不应该是有多个侧栏tab的吗…先做一版设计稿我看看」→ 样子稿
   design/WORDBOOK-TABS-1-单词页侧栏各页UI样子稿-2026-11-07.html 她已点头（「单词功能我看了，
   那你可以开始做起来了」），并要求「拆分成多个任务一个一个做」。
   任务1（v814）：补回左栏 5 个 tab 与视图切换骨架，首页仍是现有书架 #vMall（一行不动）。
   任务2（v815）：错词本接真数据（列表/chips/搜索/重练/发音）。
   任务3（v816）：统计页接真数据（四卡 calcStreak/masteredOf/practicedCount/wrongCount +
                  近 7/30 天背词量 dayWords + 掌握分布 distVals + 词书进度 masteredOf/bookTotal），
                  设计稿的 42/1286/87% 样例数字一律不编，算不出留 0。
   任务4（v817）：词书页接真数据（7 行真词数 + 当前/在首页/已收起 + 打开/编辑书架/导入
                  全复用站内已点头子态 __wb2ShowBook / #wmEditShelf / #wmDealAdd）。
   任务5（v818）：设置页接真配置（三模式/每日上限/自动发音/练习乱序/连击显示/当前词书，
                  全走 pcSave + wbSetActive）；智能模式仅占位禁用（她「先不用做，晚点给逻辑
                  或逆向爱听写」），不写任何配置、不伪造逻辑；「显示例句」站内无此字段、
                  换成真生效的 shuffle / fxFeedback。5 个任务收尾。

   🔴 接线纪律（沿用 v807/v809 已验证的软导航契约）：
     · 左栏 tab DOM 由本脚本渲染进 practice.html 里静态写好的 #wbNav；不动共用
       js/hub-side-shell.js 的 practice 分支（那是 7 页共用，动它要 7 页串号）。
     · 新 tab 复用 .hub-sub 的现成样式，但属性用 data-wb-tab（不是 data-hub-sub），
       这样共用脚本的 syncActive()/onClick() 不会误伤。
     · 视图都在 #bankView 内与 #vMall 并列；切 tab 只切这些子态的 hidden，
       背词态（#studyView）由 switchWordTab 管，从背词态点 tab 时才调它回词库。
     · 软导航每轮 window.eval 本文件 → 监听先 remove 再 add；渲染全部幂等。
     · 手机 ≤860 共用壳把整个 .hub-side 收起 → 在 #bankView 顶部补一条横向 tab 条。
   ========================================================================== */
(function(){
  'use strict';

  var TABS = [
    { id:'home',  nm:'首页',   ic:'book' },
    { id:'wrong', nm:'错词本', ic:'wrong' },
    { id:'stat',  nm:'统计',   ic:'stat' },
    { id:'books', nm:'词书',   ic:'books' },
    { id:'set',   nm:'设置',   ic:'set' }
  ];
  var ICON = {
    book:  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M7 9h2M15 9h2"/>',
    wrong: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    stat:  '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    books: '<path d="M4 5h7v15H4zM13 8h7v12h-7zM6 9h3M15 12h3"/>',
    set:   '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'
  };
  var SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '+
              'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
              '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function ic(k){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '+
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.book)+'</svg>';
  }
  function $(id){ return document.getElementById(id); }
  function num(v){ var n = Number(v); return (isNaN(n) || n < 0) ? 0 : n; }

  /* ── 任务2：错词本真数据 ──────────────────────────────────────────────
     WRONGBOOK-HISTORY-1（11-10 她「明明有很多错词但一个都没收录进去」）：
     🔴 病根坐实：原来只读 [今天] 这一天的名单，前几天答错的词隔天就查不到，错词本
        显示「还没有错词」（实测 8 个历史错词、今天没答错 → 显示 0 个）；顶栏红点同病。
     来源 = 全部历史错词。名单本就按日期分桶、跨端并集合并、永不清空，汇总所有日期桶
     即用户的全部历史错词，一个不漏；照爱听写/疯狂背单词/百词斩「错词一直留在本子里、
     不是每天清零」的口径。与 hubWrongCount() 同口径（本笔同步改）。
       · 自定义词库：DATA.dailyWrong 各日期桶的 en 数组
       · 官方词库：localStorage ielts_hub_obank_v1 各库的 wrong 各日期桶的 en 数组
     每个 en 用 findWordByEn()/wordFromBank() 按来源库拿真词对象补 cn/ipa/errTotal/
     hardWord/keyWord（查不到就留空，绝不造词）；词书名从 window.__WM_BOOKS 取。
     按答错次数降序（错得多的排前面），同次数按字母序稳定。
     🔴 不做「逐行移除 / 练会了自动移走」：dailyWrong 合并是跨端「并集」且无 en 级
        墓碑（common-merge.js），本机删掉会被另一端并回来；且「练会」判据要碰判分/SRS。
        这两件事留待单独一笔（待确认），不在本任务埋隐性 bug。 */
  /* WRONGBOOK-BUGFIX-1：按「来源库」只读查词对象。
     错词本汇总了自定义库与各官方库的今日错词，但 findWordByEn 只查当前活动库 ——
     切词书后其它库的错词会查不到，释义/答错次数/标难/重点全丢、chips 全空、重练灰掉。
     这里只补展示用对象，绝不写任何进度、不碰判分/SRS/落盘；词包没加载就留空，绝不造词。 */
  function wordFromBank(en, bankId){
    var k = String(en || '').trim().toLowerCase();
    if(!k) return null;
    function inList(ws){
      for(var i = 0; i < ws.length; i++){
        if(ws[i] && String(ws[i].en || '').trim().toLowerCase() === k) return ws[i];
      }
      return null;
    }
    if(!bankId || bankId === 'custom'){
      try{ return inList((typeof DATA !== 'undefined' && Array.isArray(DATA.words)) ? DATA.words : []); }catch(e){ return null; }
    }
    try{
      var ob = window.__OB;
      var rec = ob && ob.banks && ob.banks[bankId];
      return inList((rec && rec.words) ? rec.words : []);
    }catch(e){ return null; }
  }
  function wrongData(){
    var out = [], seen = {};
    function add(en, bankId){
      var k = String(en || '').trim().toLowerCase();
      if(!k || seen[k]) return;
      seen[k] = 1;
      var w = null;
      try{ w = (typeof findWordByEn === 'function') ? findWordByEn(k) : null; }catch(e){}
      /* 展示字段按「来源库」取词对象（WRONGBOOK-BUGFIX-1）：w 仍保留当前库对象给
         reviewWrong 用，语义不变；只读来源库补展示，绝不写进度、绝不造词。 */
      var d = wordFromBank(k, bankId) || w;
      var nm = '我的词库';
      if(bankId && bankId !== 'custom'){
        try{ (window.__WM_BOOKS || []).forEach(function(b){ if(b.id === bankId) nm = b.nm; }); }catch(e){}
      }
      out.push({
        en: k, w: w, bank: nm,
        cn:  d ? (d.cn  || '') : '',
        ipa: d ? (d.ipa || '') : '',
        err: d ? num(d.errTotal) : 0,
        hard: !!(d && d.hardWord),
        key:  !!(d && d.keyWord)
      });
    }
    // WRONGBOOK-HISTORY-1：汇总所有日期桶（原来只读 [今天] 这一桶，历史错词隔天全漏）。
    // 名单按天分桶、跨端并集合并、永不清空；合并所有桶 = 用户全部历史错词，一个不漏。
    try{
      var dw = ((typeof DATA !== 'undefined' && DATA) ? DATA.dailyWrong : null) || {};
      Object.keys(dw).forEach(function(day){
        (Array.isArray(dw[day]) ? dw[day] : []).forEach(function(en){ add(en, 'custom'); });
      });
    }catch(e){}
    try{
      var ob = JSON.parse(localStorage.getItem('ielts_hub_obank_v1') || 'null');
      if(ob && ob.banks) Object.keys(ob.banks).forEach(function(id){
        var byDay = ((ob.banks[id] || {}).wrong) || {};
        Object.keys(byDay).forEach(function(day){
          (Array.isArray(byDay[day]) ? byDay[day] : []).forEach(function(en){ add(en, id); });
        });
      });
    }catch(e){}
    // 错得多的排前面；同次数按字母序稳定。
    out.sort(function(a,b){ return (b.err - a.err) || (a.en < b.en ? -1 : (a.en > b.en ? 1 : 0)); });
    return out;
  }
  function wrongCount(){ return wrongData().length; }
  function bookCount(){
    try{ return (window.__WM_BOOKS && window.__WM_BOOKS.length) || 0; }catch(e){ return 0; }
  }
  function countOf(id){
    if(id === 'wrong'){ var n = wrongCount(); return n > 0 ? String(n) : ''; }
    if(id === 'books'){ var b = bookCount(); return b > 0 ? String(b) : ''; }
    return '';
  }

  function renderNav(){
    var box = $('wbNav'); if(!box) return;
    var cur = window.__wbCur || 'home';
    box.innerHTML = TABS.map(function(t){
      var n = countOf(t.id);
      return '<button class="hub-sub' + (t.id === cur ? ' on' : '') + '" type="button" data-wb-tab="' + esc(t.id) + '">'
        + '<span class="hub-sub-ic">' + ic(t.ic) + '</span>'
        + '<span class="hub-sub-nm">' + esc(t.nm) + '</span>'
        + (n ? '<span class="hub-sub-n">' + esc(n) + '</span>' : '')
        + '</button>';
    }).join('');
    var mob = $('wbMobileTabs');
    if(mob){
      mob.innerHTML = TABS.map(function(t){
        return '<button type="button" class="' + (t.id === cur ? 'on' : '') + '" data-wb-tab="' + esc(t.id) + '">' + esc(t.nm) + '</button>';
      }).join('');
    }
  }

  function hashId(){
    try{
      var m = /(?:^#|&)wb=([a-z]+)/.exec(location.hash || '');
      if(m && TABS.some(function(t){ return t.id === m[1]; })) return m[1];
    }catch(e){}
    return 'home';
  }

  /* 5 个子态统一收口：#vMall / #vBook / #wmLegacy / 4 个 .wb-pane。
     全用 hidden 属性（css/common.css:317 [hidden]{display:none!important}），
     不写 inline display，避免与 switchWordTab / wmShowMall 的写法打架。 */
  function panes(){
    var out = [];
    ['vMall','vBook','wmLegacy'].forEach(function(id){ var e = $(id); if(e) out.push(e); });
    Array.prototype.forEach.call(document.querySelectorAll('#bankView .wb-pane'), function(e){ out.push(e); });
    return out;
  }

  function show(id, opts){
    opts = opts || {};
    if(!TABS.some(function(t){ return t.id === id; })) id = 'home';
    window.__wbCur = id;

    /* 背词态（#studyView 可见）点左栏 tab → 先回词库态，再切子页 */
    try{
      var st = $('studyView');
      if(st && !st.hidden && typeof switchWordTab === 'function') switchWordTab('bank');
    }catch(e){}

    panes().forEach(function(e){ e.hidden = true; });
    if(id === 'home'){
      var mall = $('vMall'); if(mall) mall.hidden = false;
      try{ if(window.__wmShowMall) window.__wmShowMall(); }catch(e){}
      try{ if(window.__wmRender) window.__wmRender(); }catch(e){}
    }else{
      var p = document.querySelector('#bankView .wb-pane[data-wb-pane="' + id + '"]');
      if(p) p.hidden = false;
      renderPane(id);
    }

    renderNav();

    if(!opts.silent){
      try{ history.replaceState(null, '', location.pathname + location.search + '#wb=' + id); }catch(e){}
    }
    try{ if(typeof hubResetPageScroll === 'function') hubResetPageScroll(); }catch(e){}
    try{ if(typeof hubFitPageScroll === 'function') hubFitPageScroll(); }catch(e){}
    try{ document.dispatchEvent(new CustomEvent('wb:tab', {detail:{id:id}})); }catch(e){}
  }

  /* ── 任务2：错词本渲染 ────────────────────────────────────────────────── */
  var _wFilter = 'all', _wKw = '';
  function wHit(all){
    return all.filter(function(x){
      if(_wFilter === 'wrong' && !(x.err > 0)) return false;
      if(_wFilter === 'hard'  && !x.hard) return false;
      if(_wFilter === 'key'   && !x.key)  return false;
      if(_wKw && x.en.indexOf(_wKw) < 0 && (x.cn || '').indexOf(_wKw) < 0) return false;
      return true;
    });
  }
  function renderWrong(){
    var box = $('wbWrongList'), emp = $('wbWrongEmpty');
    if(!box) return;
    var all = wrongData();
    var hit = wHit(all);
    var cnt = $('wbWrongCount');
    if(cnt) cnt.textContent = '共 ' + all.length + ' 个词';
    document.querySelectorAll('#wbWrongChips [data-wk]').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-wk') === _wFilter);
    });
    var rb = $('wbWrongReview');
    if(rb) rb.disabled = !hit.some(function(x){ return !!x.w; });

    if(!all.length){
      box.hidden = true; box.innerHTML = '';
      if(emp){ emp.hidden = false; emp.textContent = '还没有错词'; }
      return;
    }
    if(!hit.length){
      box.hidden = true; box.innerHTML = '';
      if(emp){ emp.hidden = false; emp.textContent = '没有符合条件的词'; }
      return;
    }
    if(emp) emp.hidden = true;
    box.hidden = false;
    box.innerHTML = hit.map(function(x){
      var tags = [];
      if(x.err > 0) tags.push('答错 ' + x.err + ' 次');
      if(x.hard) tags.push('标难');
      if(x.key)  tags.push('重点');
      var sub = [x.cn, x.bank].filter(Boolean).join(' · ');
      return '<div class="wb-wrow">'
        + '<button type="button" class="wb-icobtn" data-wb-say="' + esc(x.en) + '" title="播放发音">' + SOUND + '</button>'
        + '<div class="grow"><div class="t">' + esc(x.en)
        + (x.ipa ? ' <span class="ipa">' + esc(x.ipa) + '</span>' : '') + '</div>'
        + (sub ? '<div class="d">' + esc(sub) + '</div>' : '') + '</div>'
        + (tags.length ? '<span class="wb-wtag">' + esc(tags.join(' · ')) + '</span>' : '')
        + '</div>';
    }).join('');
  }
  function reviewWrong(){
    var words = wHit(wrongData()).filter(function(x){ return !!x.w; }).map(function(x){ return { en:x.en }; });
    if(!words.length) return;
    try{
      /* 先起错词重练会话（设 pq + 渲染题目到 #studyView 内的 #practiceBody），
         再切到背词态显示它。顺序不能反：先切态会因 pq 为空触发 autoStartSeeWord 覆盖。 */
      if(typeof startWrongReview === 'function') startWrongReview(words);
      else return;
      if(typeof switchWordTab === 'function') switchWordTab('study');
    }catch(e){}
  }
  function sayWord(en){
    if(!en) return;
    try{
      if(typeof speakN === 'function') speakN(en);
      else if(typeof speak === 'function') speak(en, 'en-US');
    }catch(e){}
  }

  /* ── 任务3：统计页（全部真数据，算不出的一律不编） ──────────────────
     设计稿 :409-457 的 42/1286/87% 都是样例数字，站内没有「正确率」这类存储字段，
     按「真实、不造假」口径全改接真字段：四卡 + 近 7/30 天背词量 + 掌握分布 + 词书进度。
     🔴 不编百分比、不编「比昨天高 4%」这类无依据比较；没有数据的日子留 0。 */
  var _statRange = 7;
  function _obProg(bid){
    try{
      var ob = window.__OB;
      if(ob && ob.banks && ob.banks[bid] && ob.banks[bid].prog) return ob.banks[bid].prog;
    }catch(e){}
    try{
      if(typeof DATA !== 'undefined' && DATA && DATA.obank && DATA.obank[bid] && DATA.obank[bid].prog)
        return DATA.obank[bid].prog;
    }catch(e){}
    return null;
  }
  function masteredOf(bid){
    var n = 0, i, w, p;
    if(bid === 'custom'){
      try{
        var ws = (typeof DATA !== 'undefined' && Array.isArray(DATA.words)) ? DATA.words : [];
        for(i = 0; i < ws.length; i++){ w = ws[i]; if(w && w.cleared === true && (Number(w.level) || 0) >= 5) n++; }
      }catch(e){}
      return n;
    }
    var prog = _obProg(bid);
    if(prog) for(var k in prog){
      if(!Object.prototype.hasOwnProperty.call(prog, k)) continue;
      p = prog[k]; if(p && p.cleared === true && (Number(p.level) || 0) >= 5) n++;
    }
    return n;
  }
  function bookTotal(bid){
    try{
      if(typeof window.wmCount === 'function'){
        var b = (window.__WM_BOOKS || []).filter(function(x){ return x.id === bid; })[0];
        if(b) return num(window.wmCount(b));
      }
    }catch(e){}
    try{
      var reg = window.__OB && window.__OB.OB_BANKS;
      if(reg) for(var i = 0; i < reg.length; i++) if(reg[i].id === bid) return num(reg[i].total);
    }catch(e){}
    return 0;
  }
  /* 某天背词量 = custom 的 DATA.wordDayStats[t].totalWords（今日 unique 已练词数，覆盖非累加）
     + 官方各库 localStorage ielts_hub_obank_v1 的 banks[*].dayStats[t].totalWords。
     两处各自独立、按库相加＝当天跨库一共练了多少词，真值，无数据为 0。 */
  function dayWords(dateKey){
    var n = 0;
    try{ var st = (DATA.wordDayStats || {})[dateKey]; if(st) n += num(st.totalWords); }catch(e){}
    try{
      var ob = JSON.parse(localStorage.getItem('ielts_hub_obank_v1') || 'null');
      if(ob && ob.banks) Object.keys(ob.banks).forEach(function(id){
        var d = ((ob.banks[id] || {}).dayStats || {})[dateKey]; if(d) n += num(d.totalWords);
      });
    }catch(e){}
    return n;
  }
  function distVals(){
    var ws = [];
    try{ if(typeof wbWords === 'function') ws = wbWords() || []; }catch(e){}
    var d = { nw:0, fz:0, fx:0, zh:0 };
    ws.forEach(function(w){
      if(!w || typeof w.en !== 'string' || !w.en.trim()) return;
      var lv = Number(w.level) || 0;
      if(w.cleared === true && lv >= 5) d.zh++;
      else if(lv === 0) d.nw++;
      else if(lv <= 2) d.fz++;
      else d.fx++;
    });
    return d;
  }
  function statVals(){
    var done = 0, streak = 0, mastered = 0, wrong = 0;
    try{ if(typeof practicedCount === 'function') done = num(practicedCount()); }catch(e){}
    try{ if(typeof calcStreak === 'function') streak = num(calcStreak()); }catch(e){}
    try{ (window.__WM_BOOKS || []).forEach(function(b){ mastered += masteredOf(b.id); }); }catch(e){}
    try{ wrong = wrongCount(); }catch(e){}
    return { done:done, streak:streak, mastered:mastered, wrong:wrong };
  }
  function renderStatBars(){
    var box = $('wbStatBars'); if(!box) return;
    var today = '', days = [], max = 1, i;
    try{ today = (typeof todayKey === 'function') ? todayKey() : ''; }catch(e){}
    if(!today) return;
    for(i = _statRange - 1; i >= 0; i--){
      var key = '', n = 0;
      try{ key = (typeof addDays === 'function') ? addDays(today, -i) : ''; }catch(e){}
      if(key){ n = dayWords(key); if(n > max) max = n; }
      days.push({ key:key, n:n });
    }
    var WD = ['日','一','二','三','四','五','六'];
    box.innerHTML = days.map(function(d, idx){
      var label = '';
      if(_statRange === 7){
        try{ var dt = new Date(d.key + 'T00:00:00'); label = (idx === days.length - 1) ? '今天' : ('周' + WD[dt.getDay()]); }catch(e){ label = d.key.slice(5); }
      }else{
        label = (idx === days.length - 1) ? '今天' : (idx % 5 === 0 ? d.key.slice(5) : '');
      }
      var h = d.n > 0 ? Math.max(8, Math.round(d.n / max * 100)) : 0;
      return '<div class="wbs-bar' + (idx === days.length - 1 ? ' today' : '') + '">'
        + '<em>' + (d.n > 0 ? d.n : '') + '</em>'
        + '<i style="height:' + h + '%"></i>'
        + '<span>' + esc(label) + '</span></div>';
    }).join('');
  }
  function renderStatDist(){
    var track = $('wbStatDistTrack'), leg = $('wbStatDistLegend'), sub = $('wbStatDistSub');
    var d = distVals(), tot = d.nw + d.fz + d.fx + d.zh;
    var segs = [
      { nm:'新词', c:'#c9d9d6', n:d.nw },
      { nm:'模糊', c:'#9ccfc8', n:d.fz },
      { nm:'熟悉', c:'var(--primary,#5cb3ab)', n:d.fx },
      { nm:'掌握', c:'#3a7d76', n:d.zh }
    ];
    if(track) track.innerHTML = segs.map(function(s){
      return '<i style="width:' + (tot ? (s.n / tot * 100) : 0) + '%;background:' + s.c + '"></i>';
    }).join('');
    if(leg) leg.innerHTML = segs.map(function(s){
      return '<span><b style="background:' + s.c + '"></b>' + s.nm + ' ' + (tot ? Math.round(s.n / tot * 100) : 0) + '%</span>';
    }).join('');
    if(sub) sub.textContent = tot ? ('当前词书共 ' + tot + ' 词') : '当前词书还没有词';
  }
  function renderStatProg(){
    var box = $('wbStatProg'); if(!box) return;
    var books = window.__WM_BOOKS || [];
    box.innerHTML = books.map(function(b){
      var tot = bookTotal(b.id), m = masteredOf(b.id);
      var pct = tot ? Math.min(100, Math.round(m / tot * 100)) : 0;
      return '<div class="wbs-prow"><span class="nm">' + esc(b.nm) + '</span>'
        + '<span class="wbs-ptrack"><i style="width:' + pct + '%"></i></span>'
        + '<span class="pct">' + m + ' / ' + tot + '</span></div>';
    }).join('');
  }
  function renderStat(){
    var box = $('wbStatCards'); if(!box) return;
    var v = statVals();
    var cards = [
      { l:'今日已背', v:String(v.done),   s:'词' },
      { l:'连续学习', v:String(v.streak), s:'天' },
      { l:'累计掌握', v:String(v.mastered), s:'词' },
      { l:'今日答错', v:String(v.wrong),  s:'个' }
    ];
    box.innerHTML = cards.map(function(c){
      return '<div class="wb-stat"><span class="wb-stat-l">' + esc(c.l) + '</span>'
        + '<b class="wb-stat-v">' + esc(c.v) + (c.s ? '<em>' + esc(c.s) + '</em>' : '') + '</b></div>';
    }).join('');
    renderStatBars();
    renderStatDist();
    renderStatProg();
    var rg = $('wbStatRange'); if(rg) rg.textContent = (_statRange === 7 ? '最近 7 天' : '最近 30 天');
  }
  /* ── 任务4：词书页 ─────────────────────────────────────────────────
     设计稿 :459-468 的 7 行列表（当前/在首页/已收起 pill + 打开）+ 编辑书架 + 导入。
     全部真数据：__WM_BOOKS（7 本）/ window.wmCount（词数）/ wbActive（当前）/
     wm_pinned_books_v1（与站内 wmPinned() 同口径）/ b.mt（来源说明）。
     🔴 三个动作都复用站内已点头、已验证的子态，不新建第二套三态状态机：
        · 打开 → show('home') 归位后调 window.__wb2ShowBook(id)（W-WORD-3 词书详情，
          文案她点过头、一字未改）；详情的「返回词库商城」→ wmShowMall() 正好回书架，
          与 tab 系统零串台。show('home') 会先收掉所有 panes/#vBook，再显示 #vMall，
          天然收敛，切其它 tab 也不会残留。
        · 编辑书架 → show('home') 让 #vMall 可见（抽屉 #wmDrawer 在它内部，父隐藏则看不见），
          再触发 #wmEditShelf.click() 走站内 document 委托 → wmDrawerOpen()。
        · 导入 → show('home') 后触发 #wmDealAdd.click() 走站内委托 → wmShowLegacy() 展开导入卡。
     pinned 是 11-06 稿已有的 TODO（是否云同步），本任务不扩大，仍只读写 localStorage。 */
  function pinnedBooks(){
    try{
      var raw = localStorage.getItem('wm_pinned_books_v1');
      if(raw){ var a = JSON.parse(raw); if(Array.isArray(a)) return a; }
    }catch(e){}
    return ['custom','rdtext','qstem','lstext','phr','awl'];   // 与站内 WM_PIN_DEFAULT 同口径
  }
  function openBook(id){
    show('home');
    try{ if(window.__wb2ShowBook) window.__wb2ShowBook(id); }catch(e){}
  }
  function editShelf(){
    show('home');
    var b = $('wmEditShelf'); if(b) b.click();
  }
  function importBook(){
    show('home');
    var b = $('wmDealAdd'); if(b) b.click();
  }
  function renderBooks(){
    var box = $('wbBookList'); if(!box) return;
    var books = window.__WM_BOOKS || [];
    var pinned = pinnedBooks();
    var cur = 'custom';
    try{ if(typeof wbActive === 'function') cur = wbActive(); }catch(e){}
    var cnt = $('wbBooksCount'); if(cnt) cnt.textContent = '全部 ' + books.length + ' 本';
    box.innerHTML = books.map(function(b){
      var pills = [];
      if(b.id === cur) pills.push('<span class="wb-bpill on">当前</span>');
      pills.push(pinned.indexOf(b.id) >= 0
        ? '<span class="wb-bpill">在首页</span>'
        : '<span class="wb-bpill off">已收起</span>');
      var total = 0;
      try{ if(window.wmCount) total = num(window.wmCount(b)); }catch(e){}
      var mt = (total ? (total.toLocaleString('en-US') + ' 词 · ') : '') + (b.mt || '');
      return '<div class="wb-brow" data-wb-book="' + esc(b.id) + '">'
        + '<span class="wb-bnm">' + esc(b.nm) + '</span>'
        + '<span class="wb-bmt">' + esc(mt) + '</span>'
        + '<span class="wb-btags">' + pills.join('') + '</span>'
        + '<button type="button" class="wb-bopen" data-wb-open="' + esc(b.id) + '">打开</button>'
        + '</div>';
    }).join('');
  }
  /* ── 任务5：设置页（全部接真配置，pcSave 落盘 + _fieldTs 跨端同步） ──────
     真字段来自 js/practice.js:67-136 PC_DEFAULTS / pc() / pcSave()：
       questionMode(visual|audio|dictation) / dailyCap(0=不限,0~999) /
       autoPlay / shuffle / fxFeedback，以及当前词书 wbActive()/wbSetActive()。
     🔴 设计稿 :470-509 里两样东西不照抄：
       · 「混合模式」——11-01 她本人下令删，pc() 白名单只剩三模式，旧值/脏值自动回退看词。
         她 11-07 又明确「智能模式就是替换原来的混合模式，先不用做，晚点给你说逻辑，
         或逆向爱听写背词逻辑做一样的」→ 本笔只把第 4 张卡换成「智能模式」并置禁用占位，
         **不写任何配置、不伪造逻辑**，等她给逻辑或逆向结果再单独一笔实现。
         // TODO: [待确认] 智能模式出题逻辑（等她给，或逆向爱听写背词逻辑）——本笔只占位。
       · 「显示例句」——站内没有这个配置字段（真题例句按词库 eg 字段自动显隐、
         听写态强制关，practice.js:1596/1619），摆个开关会是假的 → 换成真字段
         「练习乱序」(shuffle, practice.js:1072) 与「连击显示」(fxFeedback, :1957/:2291)。
     「词库管理与导入」复用任务4 的 importBook()（show home + #wmDealAdd.click 走站内委托）。 */
  function setMode(id){
    if(id === 'smart') return;                 // 智能模式：占位，不写配置
    try{ if(typeof pcSave === 'function') pcSave({ questionMode:id }); }catch(e){}
    /* WORDBOOK-UX-1：头部模式胶囊也跟着更新（设置页与头部是两套独立 DOM，
       syncModeTxt 平时只随 syncToday 跑，而 syncToday 只在离开答题态时触发）。 */
    try{ if(window.__wdSyncMode) window.__wdSyncMode(); }catch(e){}
    renderSet();
    /* WORDBOOK-UX-1：跟头部模式菜单同口径 —— 切完立刻按新模式重出当前题，
       别等下一题才生效（她最烦「像没生效」）。只在有队列且当前没在揭示/判定时重出，
       不打断正在作答的那一题；切模式时通常停在设置页，studyView 隐藏，重渲染不闪屏。 */
    try{
      if(typeof nextQuestion === 'function' && typeof pq !== 'undefined'
         && pq && pq.queue && pq.queue.length && !pq.revealed){
        clearTimeout(pq.undoTimer); pq.undoStack = [];   // 换模式清掉旧撤销槽，避免跨模式退回
        nextQuestion();
      }
    }catch(e){}
  }
  function setCap(delta){
    var cap = 0;
    try{ if(typeof pc === 'function') cap = num(pc().dailyCap); }catch(e){}
    var v = cap + delta;
    if(v < 0) v = 0;
    if(v > 999) v = 999;
    try{ if(typeof pcSave === 'function') pcSave({ dailyCap:v }); }catch(e){}
    renderSet();
  }
  function setToggle(key){
    var c = {};
    try{ c = (typeof pc === 'function') ? pc() : {}; }catch(e){}
    var obj = {}; obj[key] = !c[key];
    try{ if(typeof pcSave === 'function') pcSave(obj); }catch(e){}
    renderSet();
  }
  function setBook(id){
    try{ if(typeof wbSetActive === 'function') wbSetActive(id); }catch(e){}
    renderSet();
  }
  function renderSet(){
    var c = { questionMode:'visual', dailyCap:0, autoPlay:true, shuffle:true, fxFeedback:true };
    try{ if(typeof pc === 'function') c = pc(); }catch(e){}
    var curBook = 'custom';
    try{ if(typeof wbActive === 'function') curBook = wbActive(); }catch(e){}

    var box = $('wbModeCards');
    if(box){
      /* WORDBOOK-POLISH-1：4 张模式卡补图标，跟已点头设计稿 .mode 对齐。
         只多一个 svg，div/class/data-wb-mode/<b>/<span> 结构与文案一字不改。 */
      var MODE_IC = {
        visual: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        audio: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
        dictation: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        self: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        smart: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'
      };
      function modeIc(k){
        return '<svg class="wb-mode-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
             + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (MODE_IC[k] || MODE_IC.smart) + '</svg>';
      }
      var modes = [
        { id:'visual',    nm:'看词选义', ds:'看英文，选中文' },
        { id:'audio',     nm:'听音选义', ds:'听发音，选中文' },
        { id:'dictation', nm:'听写模式', ds:'听发音，拼单词' },
        { id:'self',      nm:'自评三档', ds:'翻卡后自己评级' },
        { id:'smart',     nm:'智能模式', ds:'待开放', off:true }
      ];
      box.innerHTML = modes.map(function(m){
        return m.off
          ? '<div class="wb-mode off" aria-disabled="true">' + modeIc(m.id) + '<b>' + esc(m.nm) + '</b><span>' + esc(m.ds) + '</span></div>'
          : '<div class="wb-mode' + (m.id === c.questionMode ? ' on' : '') + '" data-wb-mode="' + m.id + '">'
            + modeIc(m.id) + '<b>' + esc(m.nm) + '</b><span>' + esc(m.ds) + '</span></div>';
      }).join('');
    }
    var cap = num(c.dailyCap);
    var capN = $('wbCapN'); if(capN) capN.textContent = cap > 0 ? String(cap) : '不限';
    var capMinus = $('wbCapMinus'); if(capMinus) capMinus.disabled = (cap <= 0);
    var capPlus = $('wbCapPlus'); if(capPlus) capPlus.disabled = (cap >= 999);
    function sw(id, on){ var el = $(id); if(el){ el.classList.toggle('on', !!on); el.setAttribute('aria-checked', on ? 'true' : 'false'); } }
    sw('wbSwAuto', c.autoPlay);
    /* 11-11 撤掉「练习乱序」设置开关：主流程 buildQueue 从不读 shuffle，摆着只会让人误会。
       底层 c.shuffle 字段与 practice.js 勾选开轮 / 错词重练的打乱逻辑照旧保留，行为一字未改。 */
    sw('wbSwFx', c.fxFeedback);
    sw('wbSwIpa', c.showIpa);                       // WORDBOOK-UX-1：显示音标
    var rb = $('wbRatio');                         // WORDBOOK-UX-1：新词:复习 三档
    if(rb){ [].forEach.call(rb.children, function(b){ b.classList.toggle('on', b.getAttribute('data-ratio') === (c.newReviewRatio || '5:5')); }); }
    var bcur = $('wbBookCur');                     // 当前词书改只读显示，换书去词书页
    if(bcur){
      var books = window.__WM_BOOKS || [], nm = curBook;
      for(var i = 0; i < books.length; i++){ if(books[i].id === curBook){ nm = books[i].nm; break; } }
      bcur.textContent = nm;
    }
  }
  function renderPane(id){
    if(id === 'wrong') renderWrong();
    else if(id === 'stat') renderStat();
    else if(id === 'books') renderBooks();
    else if(id === 'set') renderSet();
  }

  function onClick(e){
    var t = e.target;
    if(!t || !t.closest) return;
    /* 任务3：统计页 7/30 天切换 */
    var rg = t.closest('#wbStatRange');
    if(rg){ e.preventDefault(); _statRange = (_statRange === 7 ? 30 : 7); renderStat(); return; }
    /* 任务5：设置页 模式 / 每日上限 / 开关 / 词库管理与导入 */
    var mode = t.closest('[data-wb-mode]');
    if(mode){ e.preventDefault(); setMode(mode.getAttribute('data-wb-mode')); return; }
    var cm = t.closest('#wbCapMinus');
    if(cm){ e.preventDefault(); setCap(-5); return; }
    var cp = t.closest('#wbCapPlus');
    if(cp){ e.preventDefault(); setCap(5); return; }
    var swa = t.closest('[data-wb-sw]');
    if(swa){ e.preventDefault(); setToggle(swa.getAttribute('data-wb-sw')); return; }
    var rt = t.closest('#wbRatio [data-ratio]');   // WORDBOOK-UX-1：新词:复习比例
    if(rt){ e.preventDefault(); try{ if(typeof pcSave === 'function') pcSave({ newReviewRatio: rt.getAttribute('data-ratio') }); }catch(e2){} renderSet(); return; }
    var bgo = t.closest('#wbBookGo');              // WORDBOOK-UX-1：换书去词书页（show 与 hash 对齐）
    if(bgo){ e.preventDefault(); var bh = $('wbBookHint'); if(bh) bh.hidden = false; show('books'); return; }
    var mgr = t.closest('#wbSetManage');
    if(mgr){ e.preventDefault(); importBook(); return; }
    /* 任务4：词书页 打开 / 编辑书架 / 导入 */
    var op = t.closest('[data-wb-open]');
    if(op){ e.preventDefault(); openBook(op.getAttribute('data-wb-open')); return; }
    var es = t.closest('#wbBooksEdit');
    if(es){ e.preventDefault(); editShelf(); return; }
    var im = t.closest('#wbBooksImport');
    if(im){ e.preventDefault(); importBook(); return; }
    /* 任务2：错词本 chips / 重练 / 发音 */
    var chip = t.closest('#wbWrongChips [data-wk]');
    if(chip){ e.preventDefault(); _wFilter = chip.getAttribute('data-wk') || 'all'; renderWrong(); return; }
    var rv = t.closest('#wbWrongReview');
    if(rv){ e.preventDefault(); reviewWrong(); return; }
    var say = t.closest('[data-wb-say]');
    if(say){ e.preventDefault(); sayWord(say.getAttribute('data-wb-say')); return; }
    /* 任务1：左栏 / 手机 tab。
       从词书详情（__wb2ShowBook 显示的 #vBook / wmShowLegacy 显示的 #wmLegacy）回来时，
       show() 的 panes() 会先收掉这两个子态再归位到目标视图，天然不串台。 */
    var b = t.closest('[data-wb-tab]');
    if(!b) return;
    e.preventDefault();
    show(b.getAttribute('data-wb-tab'));
  }
  function onInput(e){
    var t = e.target;
    if(t && t.id === 'wbWrongSearch'){
      _wKw = String(t.value || '').trim().toLowerCase();
      renderWrong();
    }
  }
  function onChange(e){
    /* WORDBOOK-UX-1：当前词书改只读，设置页不再有 wbSetBook 下拉；换书走词书页。
       保留 change 入口（bind 已挂），这里留空以兼容其它 change 源。 */
  }
  function onMerged(){
    renderNav();
    if(window.__wbCur && window.__wbCur !== 'home') renderPane(window.__wbCur);
  }

  function bind(){
    if(window.__wbTabsClick){ try{ document.removeEventListener('click', window.__wbTabsClick); }catch(e){} }
    window.__wbTabsClick = onClick;
    document.addEventListener('click', onClick);
    if(window.__wbTabsInput){ try{ document.removeEventListener('input', window.__wbTabsInput); }catch(e){} }
    window.__wbTabsInput = onInput;
    document.addEventListener('input', onInput);
    if(window.__wbTabsChange){ try{ document.removeEventListener('change', window.__wbTabsChange); }catch(e){} }
    window.__wbTabsChange = onChange;
    document.addEventListener('change', onChange);
    if(window.__wbTabsMerge){ try{ document.removeEventListener('hub:data-merged', window.__wbTabsMerge); }catch(e){} }
    window.__wbTabsMerge = onMerged;
    document.addEventListener('hub:data-merged', onMerged);
    if(window.__wbTabsHash){ try{ window.removeEventListener('hashchange', window.__wbTabsHash); }catch(e){} }
    window.__wbTabsHash = function(){ show(hashId(), {silent:true}); };
    window.addEventListener('hashchange', window.__wbTabsHash);
  }

  function boot(){
    renderNav();
    bind();
    show(hashId(), {silent:true});
  }

  window.__wbTabs = { show: show, renderNav: renderNav, renderPane: renderPane,
                      renderWrong: renderWrong, wrongData: wrongData,
                      renderStat: renderStat, statVals: statVals, distVals: distVals,
                      masteredOf: masteredOf, bookTotal: bookTotal, dayWords: dayWords,
                      renderBooks: renderBooks, pinnedBooks: pinnedBooks, openBook: openBook,
                      renderSet: renderSet, setMode: setMode, setCap: setCap, setToggle: setToggle,
                      cur: function(){ return window.__wbCur || 'home'; } };
  boot();
})();
