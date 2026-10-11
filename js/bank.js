/* ==========================================================================
   题库页（bank.html）· 第 0 期：只读目录
   --------------------------------------------------------------------------
   10/11 新增。她拍板：先搭框架 → 先做阅读 → 再做听力（音频 2.8GB 后放）。
   本文件**只做目录**：读 bank/manifest.json，按「阅读 / 听力」两个 tab 列出篇目
   （英文标题 + 中文标题 + 题数）。**不做题、不判分**（第 1 期再做）。

   数据：bank/manifest.json（415 篇：读 68 + 听 347），运行时 fetch（不进 SW PRECORE）。
   答案：bank/answers/<id>.json 已生成但**本页不使用**（等她抽查通过后再接判分）。

   ⚠️ 软导航契约（10/6 铁律，违反 = 「点了没反应、零报错」）：
     ① 交互逻辑写在本文件（script[src]），**不写内联 <script>** —— 软导航只 eval script[src]；
     ② 功能容器必须在 <main> 之内；
     ③ 事件用**委托**绑在容器上（软导航换 main 后旧监听失效，委托挂在 document/main 上最稳）；
     ④ 本文件会被软导航重复 eval → 渲染入口必须幂等（用 window 标记 + 重复调用直接 return）。
   ========================================================================== */
(function(){
  'use strict';

  var MANIFEST_URL = 'bank/manifest.json';

  /* 中文文案 */
  var CH_LABEL = { reading: '阅读', listening: '听力' };

  /* 未登录/无数据时的空态文案（铁律：空态必须指路，别给空白画布） */
  var EMPTY_HTML = '<div class="bank-empty">'
    + '<p>题库正在准备中，稍后再来看看。</p>'
    + '</div>';

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* ============ 渲染目录 ============ */
  function renderList(root, manifest){
    var curTab = root.getAttribute('data-bank-tab') || 'reading';
    var albums = (manifest && manifest.albums) || [];
    /* 按 channel 收集当前 tab 的篇目（同名专辑合并） */
    var units = [];
    for(var i = 0; i < albums.length; i++){
      if(albums[i].channel === curTab){
        var us = albums[i].units || [];
        for(var j = 0; j < us.length; j++) units.push(us[j]);
      }
    }

    var host = document.getElementById('bankList');
    if(!host) return;

    if(!units.length){ host.innerHTML = EMPTY_HTML; return; }

    var h = '';
    h += '<div class="bank-count">共 ' + units.length + ' 篇</div>';
    h += '<ul class="bank-items">';
    for(var k = 0; k < units.length; k++){
      var u = units[k];
      h += '<li class="bank-item" data-id="' + esc(u.id) + '">'
        +    '<span class="bank-item-main">'
        +      '<b>' + esc(u.title || '未命名') + '</b>'
        +      (u.titleZh ? '<span class="bank-item-zh">' + esc(u.titleZh) + '</span>' : '')
        +    '</span>'
        +    '<span class="bank-item-meta">'
        +      (u.parts > 1 ? '<span class="bank-tag">' + u.parts + ' 个部分</span>' : '')
        +      '<span class="bank-tag">' + (u.qCount || 0) + ' 题</span>'
        +    '</span>'
        +  '</li>';
    }
    h += '</ul>';
    host.innerHTML = h;
  }

  /* ============ tab 切换（事件委托，挂在 #bankTabs 容器上） ============ */
  function renderTabs(root, manifest){
    var tabs = document.querySelectorAll('#bankTabs .bank-tab');
    for(var i = 0; i < tabs.length; i++){
      var btn = tabs[i];
      var key = btn.getAttribute('data-channel');
      var on = (key === (root.getAttribute('data-bank-tab') || 'reading'));
      btn.classList.toggle('active', on);
    }
  }

  function switchTab(root, key){
    if(key !== 'reading' && key !== 'listening') return;
    root.setAttribute('data-bank-tab', key);
    renderTabs(root, _manifest);
    renderList(root, _manifest);
  }

  /* ============ 加载 manifest（带缓存，软导航重入不重复请求） ============ */
  var _manifest = null;
  var _loading = false;

  function boot(){
    var root = document.getElementById('bankRoot');
    if(!root) return;                       // 不是题库页（软导航到别的页）→ 什么都不做

    var host = document.getElementById('bankList');
    if(host && !host.innerHTML) host.innerHTML = '<div class="bank-loading">目录加载中…</div>';

    if(_manifest){ renderTabs(root, _manifest); renderList(root, _manifest); return; }
    if(_loading) return;
    _loading = true;

    fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then(function(r){ if(!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function(m){
        _manifest = m;
        _loading = false;
        var r2 = document.getElementById('bankRoot');
        if(!r2) return;                     // 期间已软导航离开
        renderTabs(r2, m);
        renderList(r2, m);
      })
      .catch(function(err){
        _loading = false;
        if(typeof console !== 'undefined' && console.error) console.error('[bank] manifest 加载失败：', err);
        var h = document.getElementById('bankList');
        if(h) h.innerHTML = '<div class="bank-empty"><p>目录加载失败，请刷新重试。</p></div>';
      });
  }

  /* ============ tab 点击：委托绑在 document（软导航换 main 后依然有效） ============ */
  if(!window.__BANK_DELEGATE){
    window.__BANK_DELEGATE = true;
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('#bankTabs .bank-tab');
      if(!btn) return;
      e.preventDefault();
      var root = document.getElementById('bankRoot');
      if(root) switchTab(root, btn.getAttribute('data-channel'));
    });
  }

  /* ============ 启动：软导航每次 eval 都调，boot 自身幂等 ============ */
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);

  /* 软导航进入本页时（main 被替换后）重新渲染 */
  window.addEventListener('hub:page-shown', function(){ setTimeout(boot, 0); });
})();
