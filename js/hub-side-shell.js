/* ==========================================================================
   HUB-SIDE-SHELL-1 / 3（11-06 定版 · 11-07 推广到上栏除首页外全部页）
   --------------------------------------------------------------------------
   左栏 = 小 tab 竖排自由切换 + 今天的待办。只加壳，不改原页面任何功能块：
     · 壳 DOM/CSS 都在页面 HTML 里（软导航 swapPageStyles 随页换入换出，不注入 head）。
     · 小 tab 点击转发给页面原有的分栏按钮 .click() → 切科/按需加载/计数/做题全走原逻辑。
     · 今日待办读 DATA.plans 当天 items，勾选改 done + updatedAt + hubSave，与计划页同口径。
     · review 无分栏条 → 两颗落到原 deepLink 的两个滚动目标；practice 无分栏 → 只留今日待办。
   ⚠️ 软导航每轮 window.eval 本文件 → 监听必须先 remove 再 add；渲染全部幂等。
   ⚠️ 没有可接分栏的页不加载本文件 → 自动不套壳（首页等）。
   ========================================================================== */
(function(){
  'use strict';

  var ICON = {
    book:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M7 9h2M15 9h2"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    pen:'<path d="M4 20l4-1 10-10-3-3L5 16z"/><path d="M14 6l3 3"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'
  };
  var CHECK = '<path d="M4 10l4 4 8-9"/>';

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function ic(k){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '+
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||ICON.book)+'</svg>';
  }
  function tick(){
    return '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" '+
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+CHECK+'</svg>';
  }
  function $(id){ return document.getElementById(id); }

  /* 按当前页 DOM 认身份（共用一份脚本，每次 eval 只在当前页跑）。
     tabSel/tabAttr = 原分栏按钮选择器与取值属性；tabRoot = 观察用的容器 id；
     stateAttr = 有些页把当前态写在根元素属性上（bank）；countSel = 篇数徽标；
     review = 无分栏条走滚动；subs = 左栏小 tab 列表。 */
  function getConfig(){
    /* 11-16：一页只留一条导航 —— 原先板头/上栏那排 tab 收进左栏，左栏点击再转发给原按钮。
       顺序有讲究：口语、机经都有 #tabs/#listView，必须排在通用判据前面。 */
    if($('sptMobileTabs')) return {
      tabSel:'#sptMobileTabs [data-spt-tab]', tabAttr:'data-spt-tab', tabRoot:'sptMobileTabs',
      activeCls:'on',
      subs:[{id:'home',nm:'今天',ic:'cal'},{id:'bank',nm:'题库',ic:'book'},
            {id:'practice',nm:'练习',ic:'mic'},{id:'records',nm:'记录',ic:'list'},
            {id:'weak',nm:'弱项',ic:'target'}]
    };
    if($('mockTabs')) return {
      tabSel:'#brTabs .br-tab', tabAttr:'data-brtab', tabRoot:'brTabs',
      countSel:'#mockTabs .mt-n',
      subs:[{id:'reading',nm:'阅读题库',ic:'book'},{id:'listening',nm:'听力题库',ic:'mic'},
            {id:'records',nm:'题目记录',ic:'list'},{id:'wrong',nm:'错题集',ic:'ban'},
            {id:'stats',nm:'正确率统计',ic:'chart'}]
    };
    if($('tabs') && $('listView')) return {
      tabSel:'#tabs .pill-tab[data-type]', tabAttr:'data-type', tabRoot:'tabs',
      subs:[{id:'BANK',nm:'题库',ic:'book'},{id:'PRACTICE',nm:'陪练',ic:'chat'},
            {id:'MAT',nm:'素材',ic:'pen'}]
    };
    if($('writeTabs')) return {
      tabSel:'#writeTabs .pill-tab[data-tab]', tabAttr:'data-tab', tabRoot:'writeTabs',
      subs:[{id:'tpl',nm:'模板',ic:'book'},{id:'bank',nm:'语料',ic:'pen'},
            {id:'score',nm:'评分',ic:'chat'}]
    };
    if($('wordTabs')) return {
      tabSel:'#wordTabs [data-sub]', tabAttr:'data-sub', tabRoot:'wordTabs',
      subs:[{id:'ls',nm:'长难句',ic:'book'},{id:'eb',nm:'错题',ic:'pen'},
            {id:'dict',nm:'听写',ic:'mic'}]
    };
    if($('planTabs')) return {
      tabSel:'#planTabs .pill-tab[data-ptab]', tabAttr:'data-ptab', tabRoot:'planTabs',
      subs:[{id:'today',nm:'今天',ic:'book'},{id:'week',nm:'本周',ic:'cal'},{id:'past',nm:'往日',ic:'chat'}]
    };
    if($('reviewMain')) return {
      /* 回顾页左栏由 rv-tabs.js 的 #rvNav 负责（总览/趋势/记录），这里不再重复渲染一份。 */
      review:true, tabSel:null, tabRoot:null, subs:[]
    };
    if($('vMall')) return { tabSel:null, tabRoot:null, subs:[] };
    return null;
  }
  var CFG = null;

  function countOf(id){
    if(!CFG || !CFG.countSel) return '';
    try{
      var el = document.querySelector(CFG.countSel + '[data-mtn="' + id + '"]');
      return el ? (el.textContent || '').trim() : '';
    }catch(e){ return ''; }
  }
  function renderSubs(){
    var box = $('hubSubs'); if(!box || !CFG) return;
    box.innerHTML = CFG.subs.map(function(s){
      var n = countOf(s.id);
      return '<button class="hub-sub" type="button" data-hub-sub="' + esc(s.id) + '">'
        + '<span class="hub-sub-ic">' + ic(s.ic) + '</span>'
        + '<span class="hub-sub-nm">' + esc(s.nm) + '</span>'
        + (n ? '<span class="hub-sub-n">' + esc(n) + '</span>' : '')
        + '</button>';
    }).join('');
  }
  function syncCounts(){
    if(!CFG) return;
    CFG.subs.forEach(function(s){
      var b = document.querySelector('.hub-sub[data-hub-sub="' + s.id + '"]');
      if(!b) return;
      var n = countOf(s.id);
      var old = b.querySelector('.hub-sub-n');
      if(n){
        if(old) old.textContent = n;
        else b.insertAdjacentHTML('beforeend', '<span class="hub-sub-n">' + esc(n) + '</span>');
      }else if(old) old.remove();
    });
  }
  function currentTab(){
    try{
      if(!CFG) return '';
      if(CFG.review){
        var q = new URLSearchParams(location.search).get('sub') || '';
        return (q === 'record' || q === 'trajectory' || q === 'history') ? 'record' : 'score';
      }
      if(!CFG.tabSel) return '';
      if(CFG.stateAttr){
        var r = CFG.rootId && $(CFG.rootId);
        var t = r ? (r.getAttribute(CFG.stateAttr) || '') : '';
        if(t) return t;
      }
      var on = document.querySelector(CFG.tabSel + '.' + (CFG.activeCls || 'active'));
      return on ? (on.getAttribute(CFG.tabAttr) || '') : '';
    }catch(e){ return ''; }
  }
  function syncActive(){
    var cur = currentTab();
    document.querySelectorAll('.hub-sub[data-hub-sub]').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-hub-sub') === cur);
    });
  }

  function todayItems(){
    try{
      if(typeof DATA === 'undefined' || !DATA || !Array.isArray(DATA.plans)) return [];
      var k = (typeof todayKey === 'function') ? todayKey() : '';
      var p = null;
      for(var i = 0; i < DATA.plans.length; i++){
        if(DATA.plans[i] && DATA.plans[i].date === k){ p = DATA.plans[i]; break; }
      }
      return (p && Array.isArray(p.items)) ? p.items : [];
    }catch(e){ return []; }
  }
  /* 任务副行：分钟数（item.min 优先，其次从文字里抠「N 分钟」）+ 科目。
     左栏只在当前页跑，拿不到计划页的 planMinOf / moduleLabelOf，所以口径在这里自备一份。 */
  var MOD_LABEL = {listening:'听力', reading:'阅读', writing:'写作', speaking:'口语', mix:'综合'};
  function minOf(it){
    if(it && typeof it.min === 'number' && it.min) return Math.round(it.min);
    var m = String((it && it.text) || '').match(/(\d+(?:\.\d+)?)\s*分钟/);
    return m ? Math.round(parseFloat(m[1])) : 0;
  }
  function metaOf(it){
    var out = [];
    var min = minOf(it);
    if(min) out.push(min + ' 分钟');
    var lab = it && it.module ? MOD_LABEL[it.module] : '';
    if(lab) out.push(lab);
    return out.join(' · ');
  }
  function taskHtml(it){
    var meta = metaOf(it);
    return '<button class="hub-task' + (it.done ? ' done' : '') + '" type="button"'
      + ' data-hub-todo="' + esc(it.id) + '" aria-pressed="' + (it.done ? 'true' : 'false') + '">'
      + '<span class="hub-tick" aria-hidden="true">' + tick() + '</span>'
      + '<span class="hub-tx"><b>' + esc(it.text || '') + '</b>'
      + (meta ? '<small>' + esc(meta) + '</small>' : '')
      + '</span></button>';
  }
  function renderToday(){
    var box = $('hubTdList');
    if(!box) return;
    var items = todayItems().filter(function(x){ return !!x; });
    var a = items.filter(function(x){ return !x.done; });
    var b = items.filter(function(x){ return x.done; });
    box.innerHTML = a.concat(b).map(taskHtml).join('');
    var cnt = $('hubTdCount');
    if(cnt){
      cnt.textContent = b.length + '/' + items.length;
      cnt.hidden = !items.length;
    }
    var empty = $('hubTdEmpty');
    if(empty) empty.hidden = items.length > 0;
  }
  function toggleTodo(id){
    var arr = todayItems(), it = null;
    for(var i = 0; i < arr.length; i++){ if(arr[i] && arr[i].id === id){ it = arr[i]; break; } }
    if(!it) return;
    it.done = !it.done;
    it.updatedAt = Date.now();
    try{ if(typeof hubSave === 'function') hubSave(); }catch(e){}
    renderToday();
    try{ document.dispatchEvent(new CustomEvent('hub:plan-toggled', {detail:{id:id}})); }catch(e){}
  }

  function reviewGo(id){
    /* 回顾页没有分栏按钮：落到 js/rvx-data.js deepLink 的两个目标，走原筛选控件的 change 事件。 */
    if(id === 'record'){
      var f = $('recordFilter');
      if(f){ f.value = 'all'; try{ f.dispatchEvent(new Event('change', {bubbles:true})); }catch(e){} }
    }
    var t = $(id === 'record' ? 'recAll' : 'rv2Summary');
    if(t && t.scrollIntoView) t.scrollIntoView({behavior:'smooth', block:'start'});
  }
  function onClick(e){
    var t = e.target;
    if(!t || !t.closest) return;
    var sub = t.closest('.hub-sub[data-hub-sub]');
    if(sub && CFG){
      e.preventDefault();
      var id = sub.getAttribute('data-hub-sub');
      if(CFG.review) reviewGo(id);
      else if(CFG.tabSel){
        var btn = document.querySelector(CFG.tabSel + '[' + CFG.tabAttr + '="' + id + '"]');
        if(btn) btn.click();          // 转发原分栏按钮：切 tab/按需加载/计数全走原逻辑
      }
      syncActive();
      return;
    }
    var todo = t.closest('.hub-task[data-hub-todo]');
    if(todo){ e.preventDefault(); toggleTodo(todo.getAttribute('data-hub-todo')); }
  }

  function bind(){
    if(window.__hubSideClick){ try{ document.removeEventListener('click', window.__hubSideClick); }catch(e){} }
    window.__hubSideClick = onClick;
    document.addEventListener('click', onClick);
    if(window.__hubSideMerge){ try{ document.removeEventListener('hub:data-merged', window.__hubSideMerge); }catch(e){} }
    window.__hubSideMerge = renderToday;
    document.addEventListener('hub:data-merged', renderToday);
  }
  function observe(){
    if(window.__hubSideObs){ try{ window.__hubSideObs.disconnect(); }catch(e){} }
    var targets = [];
    var root = CFG && CFG.rootId && $(CFG.rootId);
    var tabs = CFG && CFG.tabRoot && $(CFG.tabRoot);
    if(root && CFG.stateAttr) targets.push([root, {attributes:true, attributeFilter:[CFG.stateAttr]}]);
    if(tabs) targets.push([tabs, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','hidden']}]);
    if(!targets.length) return;
    window.__hubSideObs = new MutationObserver(function(){ syncActive(); syncCounts(); });
    targets.forEach(function(pair){
      try{ window.__hubSideObs.observe(pair[0], pair[1]); }catch(e){}
    });
  }

  function boot(){
    CFG = getConfig();
    if(!CFG) return;                       // 没有可接的分栏 → 不套壳
    renderSubs();
    renderToday();
    syncActive();
    bind();
    observe();
  }
  boot();
})();

