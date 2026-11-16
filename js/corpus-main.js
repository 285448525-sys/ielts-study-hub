/* CORPUS-MAIN-1（11-16）：句子页三格导航。
   拆解 / 错题 / 练习 → 转发既有 #wordTabs [data-sub=ls|eb|dict]，
   让 js/corpus.js 原本的 switchCorpusSub 整段副作用照常跑；本文件只负责
   侧栏与手机顶部三格的高亮、深链和滚动复位，不重写任何业务逻辑。 */
(function(){
  'use strict';

  var SUB_OF = {parse:'ls', errors:'eb', drill:'dict'};
  var current = 'parse';

  function $(id){ return document.getElementById(id); }
  function navButtons(){
    return Array.prototype.slice.call(document.querySelectorAll('[data-cp-tab]'));
  }
  function setActive(id){
    if(!SUB_OF[id]) id = 'parse';
    current = id;
    navButtons().forEach(function(b){
      var on = b.getAttribute('data-cp-tab') === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function visibleTab(){
    var eb = $('ebView'), dict = $('dictView'), ls = $('lsView');
    if(eb && !eb.hidden) return 'errors';
    if(dict && !dict.hidden) return 'drill';
    if(ls && !ls.hidden) return 'parse';
    return '';
  }
  function sync(){ var id = visibleTab(); if(id) setActive(id); }

  function show(id, opts){
    if(!SUB_OF[id]) id = 'parse';
    var btn = document.querySelector('#wordTabs [data-sub="' + SUB_OF[id] + '"]');
    if(btn){
      try{ btn.click(); }catch(e){}
    }
    setActive(id);
    try{
      var main = document.querySelector('.hub-main');
      if(main) main.scrollTop = 0;
      var shell = document.querySelector('main.container');
      if(shell) shell.scrollTop = 0;
      if(typeof window.hubResetPageScroll === 'function') window.hubResetPageScroll();
    }catch(e){}
    if(!(opts && opts.silent)){
      try{ history.replaceState(null, '', '#cp=' + id); }catch(e){}
    }
  }

  function wantFromLocation(){
    var hash = (location.hash || '').replace('#', '');
    if(hash === 'eb') return 'errors';
    if(hash.indexOf('cp=') === 0){
      var id = hash.slice(3);
      if(SUB_OF[id]) return id;
    }
    try{
      var sub = new URLSearchParams(location.search).get('sub');
      if(sub === 'eb') return 'errors';
      if(sub === 'dict') return 'drill';
      if(sub === 'ls') return 'parse';
    }catch(e){}
    return '';
  }

  function bind(){
    if(window.__cpMainClick){
      try{ document.removeEventListener('click', window.__cpMainClick); }catch(e){}
    }
    window.__cpMainClick = function(e){
      var b = e.target && e.target.closest ? e.target.closest('[data-cp-tab]') : null;
      if(!b) return;
      e.preventDefault();
      show(b.getAttribute('data-cp-tab'));
    };
    document.addEventListener('click', window.__cpMainClick);

    if(window.__cpMainObs){
      try{ window.__cpMainObs.disconnect(); }catch(e){}
    }
    window.__cpMainObs = new MutationObserver(sync);
    ['lsView', 'ebView', 'dictView'].forEach(function(id){
      var el = $(id);
      if(el) window.__cpMainObs.observe(el, {attributes:true, attributeFilter:['hidden']});
    });
  }

  function boot(){
    bind();
    var want = wantFromLocation();
    if(want) show(want, {silent:true});
    else sync();
    /* corpus.js 的 ?sub= 深链在 setTimeout(0) 里切，晚一步再对一次高亮。 */
    setTimeout(sync, 30);
    window.__cpMain = {show:show, sync:sync, cur:function(){ return current; }};
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
