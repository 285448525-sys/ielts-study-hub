/* ==========================================================================
   HUB-SIDE-SHELL-1（11-06 她点头的单侧栏壳）
   --------------------------------------------------------------------------
   给「大 tab 里有多个小 tab」的页加一个左栏：小 tab 竖排自由切换 + 今天的待办。
   只加壳，不改原页面任何功能块：
     · 壳的 DOM 与 CSS 都在页面 HTML 里（软导航 swapPageStyles 会随页换入/换出，
       不往 document.head 注入样式 —— 那样会残留到别的页）。本文件只填内容、绑事件。
     · 小 tab 点击转发给页面原有的分栏按钮（#mockTabs .pill-tab），
       因此切科 / 按需加载脚本 / 计数刷新 / 做题 / 判分全部走原逻辑，一行没动。
     · 今日待办读 DATA.plans 当天那条 items，勾选改 done + 戳 updatedAt + hubSave，
       与计划页 toggleItem 同口径（合并按新者整项胜）。

   ⚠️ 软导航每次进页都会 window.eval 本文件（common-shell.js 的 runPageScript），
      所以监听必须每轮「先摘旧的、再绑新的」——有守卫不重绑会被账本摘掉（见
      common-shell.js:165-168 的坑）。渲染全部幂等。
   ⚠️ 没有可接分栏的页不会加载本文件 → 自动不套壳（首页等）。
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

  /* 只接有机经页四科分栏的页；后续页在这里加分支即可（共用同一份壳）。 */
  function getConfig(){
    if($('mockTabs')) return {
      tabSel:'#mockTabs .pill-tab',
      tabAttr:'data-mtab',
      rootId:'bankRoot',
      subs:[{id:'reading',nm:'阅读',ic:'book'},
            {id:'listening',nm:'听力',ic:'mic'},
            {id:'writing',nm:'写作',ic:'pen'},
            {id:'speaking',nm:'口语',ic:'chat'}]
    };
    return null;
  }
  var CFG = null;

  function countOf(id){
    try{
      var el = document.querySelector('#mockTabs .mt-n[data-mtn="' + id + '"]');
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
      var r = CFG && $(CFG.rootId);
      var t = r ? (r.getAttribute('data-mock-tab') || '') : '';
      if(t) return t;
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

  function onClick(e){
    var t = e.target;
    if(!t || !t.closest) return;
    var sub = t.closest('.hub-sub[data-hub-sub]');
    if(sub && CFG){
      e.preventDefault();
      var id = sub.getAttribute('data-hub-sub');
      var btn = document.querySelector(CFG.tabSel + '[' + CFG.tabAttr + '="' + id + '"]');
      /* 转发给原分栏按钮：切科、写作脚本按需加载、篇数刷新全走原逻辑。 */
      if(btn) btn.click();
      syncActive();
      return;
    }
    var todo = t.closest('.hub-task[data-hub-todo]');
    if(todo){ e.preventDefault(); toggleTodo(todo.getAttribute('data-hub-todo')); }
  }

  /* 每轮 eval 都重绑：common-shell 的监听账本会在下一轮 eval 前摘掉上一轮的，
     这里先 remove 再 add，保证任何时刻恰好有一组活的监听。 */
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
    var root = CFG && $(CFG.rootId);
    var tabs = $('mockTabs');
    if(root) targets.push([root, {attributes:true, attributeFilter:['data-mock-tab']}]);
    if(tabs) targets.push([tabs, {childList:true, subtree:true, characterData:true}]);
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
