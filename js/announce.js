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
    /* BACK-BTN-PAGES-1（10-31）：接线统一基类 .site-back。
       🔴 只换外观：id="ancBack" 保留、click 监听照旧（下面那个 addEventListener 一个字没改）、
          文案仍写全去向「返回公告列表」。箭头 ‹（字符）→ 16px svg。
       ⚠️ 为什么用 .site-back--icon 的写法却不加 --icon：这里是详情页正文区左上的主返回，
          宽度充足，去向必须写全（规范稿「不能只写笼统的返回」）。 */
    det.innerHTML = '<button class="site-back" type="button" id="ancBack">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>'
      + '<span class="site-back-txt">返回公告列表</span></button>'
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
    /* W-UI-1 §3.3：消息中心「全部消息」→ announce.html?tab=msg（复用本页，加一个视图）。
       三类消息平铺：会员/学习提醒（按当前状态，天然置顶）+ 公告（按日期倒序）。 */
    if(/[?&]tab=msg/.test(location.search)){
      /* 🔴 消息视图要把公告页的「公告 / 更新日志」页头换掉 —— 否则她点「全部消息」进来，
         抬头还是「公告」，会以为走错页（首版截图实锤）。标题由本视图自己写。 */
      var kicker = document.querySelector('.anc-kicker');
      var h1 = document.querySelector('.anc-hero h1');
      var sub = document.querySelector('.anc-hero p');
      if(kicker) kicker.textContent = '消息中心';
      if(h1) h1.textContent = '全部消息';
      if(sub) sub.textContent = '公告、会员到期、学习提醒，都在这。';
      /* BACK-BTN-PAGES-1（10-31）：消息中心那条同理接线，href 仍 announce.html（去向不变）。 */
      list.innerHTML = '<div class="adetail"><a class="site-back" href="announce.html">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>'
        + '<span class="site-back-txt">返回公告列表</span></a><div id="msgAll"></div></div>';
      var box = document.getElementById('msgAll');
      /* 公告部分在下面 ancAll 遍历里统一加（含已读），这里只取会员/学习提醒，
         否则未读公告会出现两遍。 */
      var msgs = (typeof hubMsgs === 'function') ? hubMsgs().filter(function(m){ return m.kind !== 'a'; }) : [];
      var read = readSet();
      var rows = msgs.slice();
      var ancAll = (typeof ancLoad === 'function') ? ancLoad() : Promise.resolve({ items: [] });
      ancAll.then(function(j){
        ((j && j.items) || []).forEach(function(a){
          if(!a || !a.id) return;
          rows.push({ kind:'a', icon:'star', title:a.title || '', sub:'公告 · 更新日志',
            time:String(a.date || ''), href:'#' + encodeURIComponent(a.id),
            ancId:a.id, unread:!read.has(a.id) });
        });
        box.innerHTML = rows.map(function(m){
          return '<button class="mi ' + m.kind + (m.unread ? '' : ' read') + '" type="button" data-msg-href="' + encodeURIComponent(m.href) + '">'
            + '<span class="ic">' + (typeof hubMsgIcon === 'function' ? hubMsgIcon(m.icon) : '') + '</span>'
            + '<span class="bd"><span class="t">' + escapeHtml(m.title || '') + '</span>'
            + '<span class="m">' + escapeHtml(m.sub || '') + '</span>'
            + (m.time ? '<span class="d">' + escapeHtml(m.time) + '</span>' : '')
            + '</span>' + (m.unread ? '<span class="nv" aria-hidden="true"></span>' : '') + '</button>';
        }).join('') || '<div class="anc-empty">没有消息。</div>';
        Array.prototype.forEach.call(box.querySelectorAll('[data-msg-href]'), function(btn){
          btn.addEventListener('click', function(){
            var href = decodeURIComponent(btn.getAttribute('data-msg-href') || '');
            /* 🔴 从消息视图点公告条目：必须把 ?tab=msg 一起从地址里去掉 —— 只改 hash 的话
               render() 会再次命中 tab 分支回到消息视图，详情永远打不开（首跑 E5 实锤）。 */
            var toDetail = function(id){
              try{ history.replaceState(null, '', location.pathname + '#' + id); }catch(e){}
              render();
            };
            if(href.charAt(0) === '#'){ toDetail(href.slice(1)); return; }
            if(href.indexOf('announce.html#') === 0){ toDetail(href.split('#')[1]); return; }
            location.href = href;
          });
        });
      }).catch(function(){ box.innerHTML = '<div class="anc-empty">消息暂时读不出来。</div>'; });
      return;
    }
    ancLoad().then(function(j){
      var items = (j && j.items) || [];
      var hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      var cur = hash ? items.filter(function(a){ return a.id === hash; })[0] : null;
      if(cur) renderDetail(cur);
      else renderList(items);
    }).catch(function(){ renderList([]); });
    /* 🔴 软导航的时序坑（softNavigate 里 runPageScript 先于 pushState）：从消息中心点
       「全部消息」→ announce.js 重跑时 location.search 还是**上一个页面**的（query 没落上）
       → tab=msg 分支不命中，停在列表视图。这里补一次延迟复查：query 落上后重渲染。
       幂等靠 #msgAll 探测，不会叠渲染。 */
    if(!/[?&]tab=msg/.test(location.search)){
      setTimeout(function(){
        if(!/[?&]tab=msg/.test(location.search)) return;
        var l2 = document.getElementById('ancList');
        if(l2 && !l2.querySelector('#msgAll')) render();
      }, 150);
    }
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
