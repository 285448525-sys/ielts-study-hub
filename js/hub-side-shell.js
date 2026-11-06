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
    chat:'<path d="M4 5h16v11H9l-5 4z"/>'
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
    if($('mockTabs')) return {
      tabSel:'#mockTabs .pill-tab', tabAttr:'data-mtab', tabRoot:'mockTabs',
      rootId:'bankRoot', stateAttr:'data-mock-tab', countSel:'#mockTabs .mt-n',
      subs:[{id:'reading',nm:'阅读',ic:'book'},{id:'listening',nm:'听力',ic:'mic'},
            {id:'writing',nm:'写作',ic:'pen'},{id:'speaking',nm:'口语',ic:'chat'}]
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
      subs:[{id:'today',nm:'今天',ic:'book'},{id:'past',nm:'往日',ic:'chat'}]
    };
    if($('reviewMain')) return {
      review:true, tabSel:null, tabRoot:null,
      subs:[{id:'score',nm:'成绩',ic:'book'},{id:'record',nm:'轨迹',ic:'chat'}]
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
      var on = document.querySelector(CFG.tabSel + '.active');
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
  function taskHtml(it){
    return '<button class="hub-task' + (it.done ? ' done' : '') + '" type="button" data-hub-todo="' + esc(it.id) + '">'
      + '<span class="hub-tick">' + tick() + '</span>'
      + '<span class="hub-tx">' + esc(it.text || '') + '</span>'
      + '</button>';
  }
  function groupHtml(arr, label){
    if(!arr.length) return '';
    return '<div class="hub-td-gh"><i></i>' + label + ' · ' + arr.length + '</div>'
      + arr.map(taskHtml).join('');
  }
  function renderToday(){
    var prog = $('hubTdProg'), pend = $('hubTdPending'), done = $('hubTdDone'), empty = $('hubTdEmpty');
    if(!prog) return;
    var items = todayItems();
    var a = items.filter(function(x){ return x && !x.done; });
    var b = items.filter(function(x){ return x && x.done; });
    var pct = items.length ? Math.round(b.length / items.length * 100) : 0;
    if(items.length){
      prog.hidden = false;
      prog.innerHTML = '<b>' + pct + '% <em>已完成 ' + b.length + ' / 共 ' + items.length + '</em></b>'
        + '<div class="hub-td-bar"><i style="width:' + pct + '%"></i></div>';
      if(empty) empty.hidden = true;
    }else{
      prog.hidden = true;
      if(empty) empty.hidden = false;
    }
    pend.innerHTML = groupHtml(a, '待完成');
    done.innerHTML = groupHtml(b, '已完成');
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

