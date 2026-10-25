/* ════════════════════════════════════════════════════════════════════
   W-UI-1（10-25）公告页逻辑（announce.html 专属，页面主脚本）
   数据 = data/announce.json（她以后只改 json）；已读键 hub_anc_read 由
   js/common.js 统一管（公告条 / 消息中心 / 本页三处共用同一份）。
   两个视图：列表（默认）与 #<id> 详情（进详情即标已读）。
   幂等：document 级监听只挂一次（软导航重跑本脚本不叠加）。 */
ready(function(){
  /* 已读态一律走 common.js 的 ancReadSet（单一口径），本文件不自己读 localStorage ——
     公告条 / 消息中心 / 本页三处必须永远同一份，各读各的迟早不一致。 */
  var readSet = function(){ return (typeof ancReadSet === 'function') ? ancReadSet() : new Set(); };
  var kindLabel = function(k){ return k === 'notice' ? '维护' : '新功能'; };

  function itemHtml(a, isUnread){
    var d = String(a.date || '');
    var dd = d.slice(8, 10) || '';
    var mm = d.slice(5, 7) || '';
    var tags = (a.tags || []).map(function(t){
      return '<span>' + escapeHtml(String(t)) + '</span>';
    }).join('');
    return '<button class="al" type="button" data-anc="' + encodeURIComponent(a.id) + '">'
      + '<span class="dt"><span class="d">' + escapeHtml(dd) + '</span><span class="m">' + escapeHtml(mm) + '月</span></span>'
      + '<span class="bd">'
      + '<span class="t">' + escapeHtml(a.title || '') + (isUnread ? '<span class="nb">NEW</span>' : '') + '</span>'
      + '<span class="m">' + escapeHtml(a.summary || '') + '</span>'
      + (tags ? '<span class="tags">' + tags + '</span>' : '')
      + '</span></button>';
  }

  function renderDetail(a){
    var list = document.getElementById('ancList');
    var det = document.getElementById('ancDetail');
    if(!list || !det) return;
    var tags = (a.tags || []).map(function(t){ return escapeHtml(String(t)); }).join(' · ');
    det.innerHTML = '<button class="back" type="button" id="ancBack">‹ 返回公告列表</button>'
      + '<h2>' + escapeHtml(a.title || '') + '</h2>'
      + '<div class="meta">' + escapeHtml(a.date || '') + ' · ' + kindLabel(a.kind) + (tags ? ' · ' + tags : '') + '</div>'
      + '<div class="body">' + (a.body || '') + '</div>';
    list.hidden = true;
    det.hidden = false;
    var back = document.getElementById('ancBack');
    if(back) back.addEventListener('click', function(){
      try{ history.replaceState(null, '', location.pathname); }catch(e){}
      render();
    });
    /* 进详情 = 已读（与公告条「去看看」同一把键，读完两处同步消红） */
    if(typeof ancMarkRead === 'function') ancMarkRead([a.id]);
    if(typeof ancEnsure === 'function') ancEnsure();
  }

  function renderList(items){
    var list = document.getElementById('ancList');
    var det = document.getElementById('ancDetail');
    if(!list || !det) return;
    det.hidden = true;
    list.hidden = false;
    var read = readSet();
    if(!items.length){
      list.innerHTML = '<div class="anc-empty">还没有公告。</div>';
      return;
    }
    list.innerHTML = items.map(function(a){
      var isUnread = !read.has(a.id) && (typeof ancFresh === 'function' ? ancFresh(a) : true);
      return itemHtml(a, isUnread);
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.al'), function(btn){
      btn.addEventListener('click', function(){
        var id = decodeURIComponent(btn.getAttribute('data-anc') || '');
        var hit = items.filter(function(a){ return a.id === id; })[0];
        if(hit) renderDetail(hit);
      });
    });
  }

  function render(){
    var list = document.getElementById('ancList');
    if(!list) return;   // 软导航已换走本页 DOM（防过期闭包误写新页面）
    ancLoad().then(function(j){
      var items = (j && j.items) || [];
      var hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      var cur = hash ? items.filter(function(a){ return a.id === hash; })[0] : null;
      if(cur) renderDetail(cur);
      else renderList(items);
    }).catch(function(){ renderList([]); });
  }

  /* 供公告条「去看看」在本页内直达详情用（common.js ancEnsure 检测到当前
     已在 announce.html 时 preventDefault 并调这里，免去一次换页） */
  window.ancOpen = function(id){
    try{ history.replaceState(null, '', '#'); }catch(e){}
    render();
    ancLoad().then(function(j){
      var items = (j && j.items) || [];
      var hit = items.filter(function(a){ return a.id === id; })[0];
      if(hit) renderDetail(hit);
    });
  };

  if(!window.__ancPageBound){
    window.__ancPageBound = true;
    window.addEventListener('hashchange', render);
  }
  render();

  /* 公告 json 404 / 结构不对时给一句人话，不留空白页 —— CF Pages 对找不到文件会
     回一张 200 的落地页（10-20 深夜 img/avatars 那次的同款坑）：那种响应 r.ok 为真、
     .json() 直接抛，落进下面的兜底。 */
  ancLoad().then(function(j){
    if(j && Array.isArray(j.items) && j.items.length) return;
    var list = document.getElementById('ancList');
    if(list && !list.querySelector('.al')){
      list.innerHTML = '<div class="anc-empty">公告暂时读不出来，稍后再来看看。</div>';
    }
  });
});
