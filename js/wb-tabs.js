/* ==========================================================================
   WORDBOOK-TABS-1（11-07）· 单词页左栏功能 tab + 右侧多视图
   --------------------------------------------------------------------------
   她 11-07「这个单词页不应该是有多个侧栏tab的吗…先做一版设计稿我看看」→ 样子稿
   design/WORDBOOK-TABS-1-单词页侧栏各页UI样子稿-2026-11-07.html 她已点头（「单词功能我看了，
   那你可以开始做起来了」），并要求「拆分成多个任务一个一个做」。
   任务1（v814）：补回左栏 5 个 tab 与视图切换骨架，首页仍是现有书架 #vMall（一行不动）。
   任务2（v815）：错词本接真数据（列表/chips/搜索/重练/发音），其余 3 页仍只读真值+诚实空态。
   任务3~5（统计/词书/设置的完整交互）逐页补。

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
     来源 = 今日错词（与设计稿「错词本」同义、与 hubWrongCount()/todayWrongEns() 同口径）：
       · 自定义词库：DATA.dailyWrong[今天] 的 en 数组
       · 官方词库：localStorage ielts_hub_obank_v1 的 banks[*].wrong[今天] 的 en 数组
     每个 en 用 findWordByEn() 拿真词对象补 cn/ipa/errTotal/hardWord/keyWord（查不到就留空，
     绝不造词）。来源词书名从 window.__WM_BOOKS 取，custom 显示「我的词库」。
     🔴 不做「逐行移除」：common-merge.js:399-411 的 dailyWrong 合并是跨端「并集」且无 en 级
        墓碑，本机删掉的元素会被另一端并回来（v812 同款联动坑）。要做移除得先给合并层加
        墓碑（动 22 页串号的共用文件），留待单独一笔，不在本任务埋隐性 bug。
        // TODO: [待确认] 错词本移除 + 跨端墓碑（涉及 common-merge.js / 22 页串号） */
  function wrongData(){
    var t = '';
    try{ t = (typeof todayKey === 'function') ? todayKey() : ''; }catch(e){}
    var out = [], seen = {};
    function add(en, bankId){
      var k = String(en || '').trim().toLowerCase();
      if(!k || seen[k]) return;
      seen[k] = 1;
      var w = null;
      try{ w = (typeof findWordByEn === 'function') ? findWordByEn(k) : null; }catch(e){}
      var nm = '我的词库';
      if(bankId && bankId !== 'custom'){
        try{ (window.__WM_BOOKS || []).forEach(function(b){ if(b.id === bankId) nm = b.nm; }); }catch(e){}
      }
      out.push({
        en: k, w: w, bank: nm,
        cn:  w ? (w.cn  || '') : '',
        ipa: w ? (w.ipa || '') : '',
        err: w ? num(w.errTotal) : 0,
        hard: !!(w && w.hardWord),
        key:  !!(w && w.keyWord)
      });
    }
    try{ (((typeof DATA !== 'undefined' ? DATA : {}) || {}).dailyWrong || {})[t] &&
         DATA.dailyWrong[t].forEach(function(en){ add(en, 'custom'); }); }catch(e){}
    try{
      var ob = JSON.parse(localStorage.getItem('ielts_hub_obank_v1') || 'null');
      if(ob && ob.banks) Object.keys(ob.banks).forEach(function(id){
        var list = ((ob.banks[id] || {}).wrong || {})[t] || [];
        list.forEach(function(en){ add(en, id); });
      });
    }catch(e){}
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
    if(cnt) cnt.textContent = all.length ? ('共 ' + all.length + ' 个词') : '';
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

  /* ── 各页只读渲染（任务3~5 再补完整交互） ── */
  function statVals(){
    var done = 0, cap = 0, wrong = 0, due = 0;
    try{ if(typeof practicedCount === 'function') done = num(practicedCount()); }catch(e){}
    try{ if(typeof pc === 'function') cap = num(pc().dailyCap); }catch(e){}
    try{ wrong = wrongCount(); }catch(e){}
    try{ if(typeof wbDueCount === 'function') due = num(wbDueCount()); }catch(e){}
    return { done:done, cap:cap, wrong:wrong, due:due };
  }
  function renderStat(){
    var box = $('wbStatCards'); if(!box) return;
    var v = statVals();
    var cards = [
      { l:'今日已背', v:String(v.done), s: v.cap > 0 ? '/ ' + v.cap : '' },
      { l:'今日答错', v:String(v.wrong), s:'个' },
      { l:'待复习',   v:String(v.due),   s:'个' },
      { l:'每日上限', v: v.cap > 0 ? String(v.cap) : '不限', s:'' }
    ];
    box.innerHTML = cards.map(function(c){
      return '<div class="wb-stat"><span class="wb-stat-l">' + esc(c.l) + '</span>'
        + '<b class="wb-stat-v">' + esc(c.v) + (c.s ? '<em>' + esc(c.s) + '</em>' : '') + '</b></div>';
    }).join('');
  }
  function renderBooks(){
    var box = $('wbBookList'); if(!box) return;
    var books = window.__WM_BOOKS || [];
    var pinned = [];
    try{ pinned = (JSON.parse(localStorage.getItem('wm_pinned_books_v1') || 'null')) || []; }catch(e){}
    var cur = 'custom';
    try{ if(typeof wbActive === 'function') cur = wbActive(); }catch(e){}
    box.innerHTML = books.map(function(b){
      var tags = [];
      if(b.id === cur) tags.push('当前');
      if(pinned.indexOf(b.id) >= 0) tags.push('在首页');
      return '<div class="wb-brow" data-wb-book="' + esc(b.id) + '">'
        + '<span class="wb-bnm">' + esc(b.nm) + '</span>'
        + '<span class="wb-bmt">' + esc(b.mt || '') + '</span>'
        + (tags.length ? '<span class="wb-btag">' + esc(tags.join(' · ')) + '</span>' : '')
        + '</div>';
    }).join('');
  }
  function renderSet(){
    var box = $('wbModeCards'); if(!box) return;
    var modes = [
      { id:'visual',    nm:'看词选义', ds:'看英文选中文' },
      { id:'audio',     nm:'听音选义', ds:'听发音选释义' },
      { id:'dictation', nm:'听写模式', ds:'听音打出单词' }
    ];
    var cur = 'visual';
    try{ if(typeof pc === 'function') cur = pc().questionMode || 'visual'; }catch(e){}
    box.innerHTML = modes.map(function(m){
      return '<div class="wb-mode' + (m.id === cur ? ' on' : '') + '" data-wb-mode="' + m.id + '">'
        + '<b>' + esc(m.nm) + '</b><span>' + esc(m.ds) + '</span></div>';
    }).join('');
    var cap = 0, auto = false;
    try{ if(typeof pc === 'function'){ cap = num(pc().dailyCap); auto = !!pc().autoPlay; } }catch(e){}
    var capEl = $('wbCapN'); if(capEl) capEl.textContent = cap > 0 ? String(cap) : '不限';
    var auEl = $('wbAutoN'); if(auEl) auEl.textContent = auto ? '开' : '关';
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
    /* 任务2：错词本 chips / 重练 / 发音 */
    var chip = t.closest('#wbWrongChips [data-wk]');
    if(chip){ e.preventDefault(); _wFilter = chip.getAttribute('data-wk') || 'all'; renderWrong(); return; }
    var rv = t.closest('#wbWrongReview');
    if(rv){ e.preventDefault(); reviewWrong(); return; }
    var say = t.closest('[data-wb-say]');
    if(say){ e.preventDefault(); sayWord(say.getAttribute('data-wb-say')); return; }
    /* 任务1：左栏 / 手机 tab */
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
                      cur: function(){ return window.__wbCur || 'home'; } };
  boot();
})();
