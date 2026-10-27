/* ==========================================================================
   模考页（bank.html）· 第 1 期：阅读做题 + 自动判分
   --------------------------------------------------------------------------
   结构：大 tab「模考」→ 四小 tab（阅读/听力/写作/口语）。本文件负责：
     · 小 tab 切换
     · 阅读篇目列表（读 bank/manifest.json）
     · 做题页：左文章 / 右题目 → 交卷 → 本地判分 → 逐题解析
   数据：bank/<channel>/<id>.json（题面）+ bank/answers/<id>.json（答案）
   判分在浏览器端（离线可用）。

   ⚠️ 软导航契约（10/6 铁律）：
     ① 交互逻辑写在本文件，不写内联 <script>；② 功能容器必须在 <main> 内；
     ③ 事件用委托绑在 document 上；④ 本文件会被重复 eval → 渲染入口必须幂等。
   ========================================================================== */
(function(){
  'use strict';

  var MANIFEST = 'bank/manifest.json';

  /* ===== 小工具 ===== */
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function plain(s){ return String(s == null ? '' : s).replace(/<[^>]*>/g, ''); }
  /* 富文本净化：丢脚本/样式/外链/事件属性，保留结构与内联样式 */
  function clean(html){
    var s = String(html || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<link[^>]*>/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/javascript:/gi, '');
    return s;
  }
  /* contentHtml 常常是整份 HTML 文档 → 只取 body */
  function bodyOf(html){
    var s = String(html || '');
    var m = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    return m ? m[1] : s;
  }
  /* 判分归一：小写 / 去首尾空白 / 合并空格 / 去尾标点 */
  function norm(s){
    return String(s == null ? '' : s).toLowerCase().trim()
      .replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
  }
  function eqAns(user, right, alts){
    var u = norm(user); if(!u) return false;
    var list = [right].concat(alts || []);
    for(var i = 0; i < list.length; i++){
      var r = norm(list[i]);
      if(!r) continue;
      if(u === r) return true;
      if(u.replace(/ /g, '') === r.replace(/ /g, '')) return true;
    }
    return false;
  }

  /* ===== 状态 ===== */
  var _manifest = null, _loading = false;
  /* M-2：两个 pane 各记一份搜索词（切走再切回来，输入框内容与过滤结果都还在） */
  var _searchQ = { 'pane-reading': '', 'pane-listening': '' };
  var EX = null;              // 当前做题会话
  var _timer = null;
  var _ftTimer = null;        // 顶栏计时小徽章刷新interval（10/13）
  /* 10/12 23:2x 她「组卷改纯随机，不用提前写好题目在那」：原 _fullSet/_listenFullSet
     「渲染入口卡时组一次并缓存」的两变量已删 —— 现在点 Start 的那一刻才随机抽篇（见 openFullTest）。 */

  /* ===== 列表 ===== */
  function unitsOf(channel){
    var out = [], a = (_manifest && _manifest.albums) || [];
    for(var i = 0; i < a.length; i++){
      if(a[i].channel === channel){
        var us = a[i].units || [];
        for(var j = 0; j < us.length; j++) out.push(us[j]);
      }
    }
    return out;
  }
  var CHIP_CLS = { '判断': 't1', '填空': 't1', '配对': 't2', '选择': 't3', '多选': 't3', '地图': 't3' };
  function chipCls(t, i){ return CHIP_CLS[t] || ('t' + ((i % 3) + 1)); }
  function currentPart(){
    var root = document.getElementById('bankRoot');
    return (root && root.getAttribute('data-mock-part')) || 'Part 1';
  }

  /* 列表页相对时间（中文短式，与列表页现有「未做 / 13 题」同一语言）。
     ⚠️ 别复用 speaking.js/corpus.js 那两份中文 relTime：一个是「今天/昨天/N 天前」口径、
     一个是「N 小时前/N 天前」口径，都不带分钟，且它们挂在各自页面作用域里拿不到。
     本函数只服务题库列表，口径：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超 30 天给 M/D。 */
  function relTime(ts){
    var d = Date.now() - Number(ts || 0);
    if(!(d >= 0)) return '';
    var m = Math.floor(d / 60000);
    if(m < 1) return '刚刚';
    if(m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if(h < 24) return h + ' 小时前';
    var dd = Math.floor(h / 24);
    if(dd <= 30) return dd + ' 天前';
    var dt = new Date(Number(ts));
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  /* 篇目列表的标记（阅读 / 听力共用同一套 .bank-items 结构，只是挂在不同容器上） */
  function listHtml(units, channel){
    var h = '<ul class="bank-items">';
    for(var k = 0; k < units.length; k++){
      var u = units[k], st = '', oc = '未做', chips = '', when = '', pct = -1;
      try{
        var rec = localStorage.getItem('hub_bank_last_' + u.id);
        if(rec){
          var r = JSON.parse(rec); st = 'ok'; oc = r.correct + '/' + r.total;
          /* 10/17 #9 层次 1：列表页留痕 —— 相对时间 + 细进度条。
             此前只有「8/13」三个字符，用户看不出是刚才做的还是上个月做的。 */
          if(r.ts) when = relTime(r.ts);
          if(r.total > 0) pct = Math.round(r.correct / r.total * 100);
        }
      }catch(e){}
      (u.types || []).forEach(function(t, i){ chips += '<span class="bi-ch ' + chipCls(t, i) + '">' + esc(t) + '</span>'; });
      h += '<li class="bank-item" data-unit="' + esc(u.id) + '" data-ch="' + esc(channel) + '">'
        +    '<span class="bi-no">' + (k + 1) + '</span>'
        +    '<span class="bi-tt"><b>' + esc(u.title || '未命名') + '</b>'
        +      (u.titleZh ? '<i>' + esc(u.titleZh) + '</i>' : '') + '</span>'
        +    '<span class="bi-chips">' + chips + '</span>'
        +    '<span class="bi-qn">' + (u.qCount || 0) + ' 题</span>'
        +    '<span class="bi-st ' + st + '">'
        +      (st ? '<b>' + esc(oc) + '</b>' : esc(oc))
        +      (when ? '<i class="bi-when">' + esc(when) + '</i>' : '')
        +      (pct >= 0 ? '<i class="bi-bar"><i style="width:' + pct + '%"></i></i>' : '')
        +    '</span>'
        +    '<span class="bi-chev">›</span>'
        +  '</li>';
    }
    return h + '</ul>';
  }

  /* 🔴 10/11 体检发现的真 bug：manifest（目录）还没下载完时，切 tab 会走到这里，
     此时 units 是空的 → 渲染成「这一部分暂时没有篇目。」+「共 0 篇」。
     那是**错误的陈述**（明明有 68 篇阅读 / 347 篇听力），用户第一眼会以为站是空的/坏了。
     成熟做法：**加载中就明确说「加载中」，绝不用空态文案顶替**（空态只用于「确实没有」）。
     修法 = 数据未到时统一走 .bank-loading，等 boot() 拿到 manifest 后 paintTab 会重画。 */
  /* ===== B-1a 加载四态：骨架 → 内容 / 错误+重试 / 取消 / 空 =====
     方案 §3.2（她拍板选版一骨架屏；四态文案全中文，复用 .btn 族）
     ⚠️ 本段纯新增，第 2 步先不接线 —— 接线在第 3-5 小步，每步一验。 */
  var BK_OBJ = { reading:'阅读题库', listening:'听力题库', writing:'写作题', speaking:'口语题' };
  function bkStateBox(kind, title, sub, actText){
    return '<div class="bk-state" data-bk-state="' + kind + '">'
      + '<p class="bk-st-title">' + title + '</p>'
      + (sub ? '<p class="bk-st-sub">' + sub + '</p>' : '')
      + (actText ? '<button type="button" class="btn btn-ghost btn-sm bk-st-act" data-bk-act="' + kind + '">' + actText + '</button>' : '')
      + '</div>';
  }
  function bkSkeleton(rows){
    var n = (window.matchMedia && window.matchMedia('(max-width:420px)').matches) ? 4 : (rows || 6);
    var h = '<div class="bk-skel" data-bk-state="skeleton" aria-hidden="true">';
    for(var i = 0; i < n; i++){
      h += '<div class="sk-row"><span class="sk-no"></span><span class="sk-lines"><span class="sk-ln a"></span><span class="sk-ln b"></span></span></div>';
    }
    return h + '</div>';
  }
  /* fetchWithStates(container, objName, url, renderFn, opts)
     opts.noCancel = true 时不显示「取消」（用于「已点了开始」的正文加载，避免误取消丢上下文） */
  function fetchWithStates(container, objName, url, renderFn, opts){
    if(!container) return;
    opts = opts || {};
    if(container._bkAbort) { try{ container._bkAbort.abort(); }catch(e){} }   // 连续切换只保留最后一次
    var hasAC = (typeof AbortController === 'function');
    var ac = hasAC ? new AbortController() : null;
    container._bkAbort = ac;
    container.innerHTML = bkSkeleton(6)
      + bkStateBox('loading', '正在载入' + objName + '…', '大文件第一次加载要几秒', opts.noCancel ? '' : '取消');
    var cancelBtn = container.querySelector('[data-bk-act=loading]');
    if(cancelBtn){
      cancelBtn.addEventListener('click', function(){
        if(ac){ try{ ac.abort(); }catch(e){} }
        container.innerHTML = bkStateBox('cancelled', '已取消加载', '', '重新加载');
        var again = container.querySelector('[data-bk-act=cancelled]');
        if(again) again.addEventListener('click', function(){ fetchWithStates(container, objName, url, renderFn, opts); });
      });
    }
    var fo = { cache: 'no-cache' };
    if(ac) fo.signal = ac.signal;
    fetch(url, fo).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data){
      if(ac && container._bkAbort !== ac) return;              // 已被更新的请求取代
      if(!data || (Array.isArray(data.tests) && !data.tests.length)){
        container.innerHTML = bkStateBox('empty', '这一部分暂时没有篇目。', '', '');
        return;
      }
      renderFn(container, data);
    }).catch(function(e){
      if(e && e.name === 'AbortError') return;                 // 取消是自己的事，不当错误报
      if(window.console && console.error) console.error('[bank] 加载失败：', url, e);
      container.innerHTML = bkStateBox('error', objName + '没加载出来', '可能是网络问题，重试一下', '重试');
      var retry = container.querySelector('[data-bk-act=error]');
      if(retry) retry.addEventListener('click', function(){ fetchWithStates(container, objName, url, renderFn, opts); });
    });
  }

  var LOADING_HTML = '<div class="bank-loading">目录加载中…</div>';   // 旧文案，作兼容兜底保留
  /* B-1a 补（她 10-23 10:1x「阅读/听力 tab 的目录列表也要骨架屏，不用问我」）：
     目录加载态从「目录加载中…」一行字升级为骨架屏 + 中文标题 + 取消。
     objName 按 tab 给（复用 BK_OBJ），meta 那行同步说清在载什么。 */
  function paintLoading(host, meta){
    var obj = (typeof BK_OBJ !== 'undefined' && BK_OBJ[dirChannel()]) || '题库';
    if(host){
      host.innerHTML = bkSkeleton(6) + bkStateBox('loading', '正在载入' + obj + '…', '大文件第一次加载要几秒', '取消');
      /* ⚠️ 每次重画都要**重新绑一次取消** —— 切换 tab 会走到这里，innerHTML 一换，
         上一个按钮的监听器就没了（B-1a 补：不重绑的话 tab 切一次「取消」就点不动）。 */
      var c = host.querySelector('[data-bk-act=loading]');
      if(c) c.addEventListener('click', function(){ dirCancelLoading(); });
    }
    if(meta) meta.textContent = '正在载入' + obj + '…';
  }
  /* 目录加载的「取消」：中断 manifest 请求 → 两个列表一起进已取消态 */
  function dirCancelLoading(){
    if(typeof _bootAC !== 'undefined' && _bootAC){ try{ _bootAC.abort(); }catch(e){} }
    if(typeof _loading !== 'undefined') _loading = false;
    paintBothLists('cancelled', '已取消加载', '', '重新加载');
    ['bankList', 'listenList'].forEach(function(id){
      var h = document.getElementById(id);
      if(!h) return;
      var a = h.querySelector('[data-bk-act=cancelled]');
      if(a) a.addEventListener('click', function(){ boot(); });
    });
  }
  /* 当前 tab 对应的内容类型（目录骨架的文案与取消都要按它变） */
  function dirChannel(){
    var root = document.getElementById('bankRoot');
    var t = root ? (root.getAttribute('data-mock-tab') || 'reading') : 'reading';
    return t === 'listening' ? 'listening' : (t === 'writing' ? 'writing' : (t === 'speaking' ? 'speaking' : 'reading'));
  }
  /* 目录四态的统一出口：给两个列表同时写同一种态（boot 只跑一次，两个 pane 都可能被看到） */
  function paintBothLists(kind, title, sub, actText){
    ['bankList', 'listenList'].forEach(function(id){
      var h = document.getElementById(id);
      if(h) h.innerHTML = bkStateBox(kind, title, sub, actText);
    });
  }
  function renderList(channel, part){
    var host = document.getElementById('bankList');
    if(!host) return;
    if(channel !== 'reading'){ host.innerHTML = ''; return; }
    var meta = document.getElementById('partMeta');
    if(!_manifest){ paintLoading(host, meta); return; }
    part = part || currentPart();
    var units = unitsOf(channel).filter(function(u){ return (u.partNum || 'Part 1') === part; });
    /* M-2：搜索过滤（无搜索词时原样返回，零影响） */
    units = filterUnits(units);
    if(meta){
      var perQ = units.length ? (units[0].qCount || 0) : 0;
      meta.textContent = part + ' · 共 ' + units.length + ' 篇' + (perQ ? (' · 每篇 ' + perQ + ' 题') : '');
    }
    /* M-1：阅读的 Part 分栏也加篇数计数（原来只有听力有）。只填 .pt-n 文本，不重建 DOM。 */
    var ptHost = document.getElementById('partTabs');
    if(ptHost && _manifest){
      var allR = unitsOf('reading');
      ptHost.querySelectorAll('.pill-tab').forEach(function(b){
        var p = b.getAttribute('data-part');
        var n = allR.filter(function(u){ return (u.partNum || 'Part 1') === p; }).length;
        var badge = b.querySelector('.pt-n');
        if(badge) badge.textContent = n;
        else b.innerHTML = esc(p) + '<span class="pt-n">' + n + '</span>';
      });
    }
    if(!units.length){ host.innerHTML = '<div class="bank-empty"><p>这一部分暂时没有篇目。</p></div>'; return; }
    /* M-2（10-24）：改成「没做过 / 做过」两组 + 每组首屏 20 条 + 展开更多。
       ⚠️ 单条 DOM 仍是本文件的 listHtml() —— js/bank-groups.js 只负责分组与分页，
          它把 listHtml 当参数收下再用，所以 .bank-item 的结构零改动。 */
    host.innerHTML = (window.BankGroups && window.BankGroups.html)
      ? window.BankGroups.html('bankList', units, channel, listHtml)
      : listHtml(units, channel);
    renderFullEntry();
  }

  /* ===== 听力列表（10/11 第 9 项）=====
     与阅读同一套 .bank-items，但挂 #listenPartTabs / #listenList（独立 id，互不覆盖）。
     故意**不预筛地图题**：manifest 把 map 记成「匹配」，列表层认不出来；
     而配图已在数据里补回（tests/_patch_bank_assets_1011.cjs），直接正常出题即可。 */
  function currentListenPart(){
    var el = document.querySelector('#listenPartTabs .pill-tab.active');
    return (el && el.getAttribute('data-lpart')) || 'Part 1';
  }
  function renderListenParts(){
    var host = document.getElementById('listenPartTabs'); if(!host) return;
    /* 数据没到就别动它（保持 HTML 里静态的 Part 1–4），否则徽标会显示成 0 */
    if(!_manifest) return;
    var all = unitsOf('listening');
    host.querySelectorAll('.pill-tab').forEach(function(b){
      var p = b.getAttribute('data-lpart');
      var n = all.filter(function(u){ return (u.partNum || 'Part 1') === p; }).length;
      /* M-1：只填 .pt-n 里的数字，不再整块重写 innerHTML（否则会抹掉 HTML 里静态的
         Part 标签结构；而且这里改的是文本，不需要重建 DOM）。 */
      var badge = b.querySelector('.pt-n');
      if(badge) badge.textContent = n;
      else b.innerHTML = esc(p) + ' <span class="pt-n">' + n + '</span>';
    });
  }

  /* ===== M-1（10-24）：科目 tab 的篇数计数 =====
     她截图嫌药丸 tab 丑 → 改成「文字 + 篇数 + 上划线」。计数在这里填：
       · 阅读 / 听力：manifest 的 albums 数（unitsOf）
       · 写作：WRITING_PROMPTS 的 big + small 两数组长度
       · 口语：SPEAKING_TOPICS / 口语题库长度（按页面上实际数据源，取不到就留空）
     ⚠️ 只在数据真的到位后填 —— 没到就留空（空 span 不占视觉），别显示 0
         （10/11 体检教训：错误的「共 0 篇」比不显示更糟）。 */
  function renderMockTabCounts(){
    var wrap = document.getElementById('mockTabs'); if(!wrap) return;
    function set(k, n){
      var el = wrap.querySelector('.mt-n[data-mtn="' + k + '"]');
      if(el) el.textContent = (n > 0) ? String(n) : '';
    }
    /* 阅读 / 听力：manifest 到位才算 */
    if(_manifest){
      set('reading', unitsOf('reading').length);
      set('listening', unitsOf('listening').length);
    }
    /* 写作：WRITING_PROMPTS 到位才算（写作 pane 的脚本是按需加载的） */
    if(window.WRITING_PROMPTS && (window.WRITING_PROMPTS.big || window.WRITING_PROMPTS.small)){
      var big = window.WRITING_PROMPTS.big || [];
      var small = window.WRITING_PROMPTS.small || [];
      set('writing', big.length + small.length);
    }
    /* 口语：题库在 DATA.speaking 里（口径与 speaking.js:322 的 populate 一致：
       排除 framework 与 sp_p1_/sp_p2_ 自动生成的题）。 */
    var sp = (typeof DATA !== 'undefined' && Array.isArray(DATA.speaking)) ? DATA.speaking : [];
    var spReal = sp.filter(function(s){ return s && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || ''); });
    set('speaking', spReal.length);
  }
  /* ===== M-2（10-24）：搜索过滤（分组版）=====
     ⚠️ 不复用站内 initListSearch()：那个只做 `display:none` 显隐，和分组/分页会打架
        （隐藏了 .bank-item，但组头计数不变，「展开更多」还会把隐藏的加回来）。
     这里由自己过滤：**重新走一遍 renderList()**，让分组、计数、分页全部按新口径重画。
     🔴 只在当前激活的 pane 上生效（阅读 / 听力各一个输入框，互不干扰）。 */
  function searchBankList(){
    var act = document.querySelector('.mock-pane:not([hidden])');
    if(!act) return;
    var q = '';
    if(act.id === 'pane-reading'){
      var i1 = document.getElementById('bankSearch');
      q = i1 ? (i1.value || '').trim().toLowerCase() : '';
    } else if(act.id === 'pane-listening'){
      var i2 = document.getElementById('listenSearch');
      q = i2 ? (i2.value || '').trim().toLowerCase() : '';
    } else return;                                   /* 写作 / 口语 pane 不归本函数管 */
    _searchQ[act.id] = q;
    if(act.id === 'pane-reading') renderList('reading');
    else renderListenList(currentListenPart());
  }
  function filterUnits(units){
    var pane = document.querySelector('.mock-pane:not([hidden])');
    var q = pane ? (_searchQ[pane.id] || '') : '';
    if(!q) return units;
    return units.filter(function(u){
      var txt = ((u.title || '') + ' ' + (u.titleZh || '') + ' ' + ((u.types || []).join(' '))).toLowerCase();
      return txt.indexOf(q) !== -1;
    });
  }

  /* ===== M-2：搜索框绑定 + 清空按钮 =====
     🔴 绑前先摘（软导航会重跑本文件，不摘就叠加监听器）。
     🔴 清空按钮是 S-1 统一类的一部分（.ui-field-clear），这里只管它的显隐与点击。 */
  function bindBankSearch(){
    ['bankSearch', 'listenSearch'].forEach(function(id){
      var inp = document.getElementById(id);
      if(!inp || inp.__m2Bound) return;
      inp.__m2Bound = true;
      inp.addEventListener('input', searchBankList);
      var clear = inp.parentNode.querySelector('.ui-field-clear');
      if(clear && !clear.__m2Bound){
        clear.__m2Bound = true;
        var sync = function(){ clear.hidden = !(inp.value || '').trim(); };
        inp.addEventListener('input', sync);
        sync();
        clear.addEventListener('click', function(){
          inp.value = '';
          clear.hidden = true;
          searchBankList();
          inp.focus();
        });
      }
    });
  }

  function renderListenList(part){
    var host = document.getElementById('listenList'); if(!host) return;
    var meta = document.getElementById('listenMeta');
    /* 同上：加载中说加载中。⚠️ 原先这里是清空（把 HTML 里静态的「目录加载中…」也抹掉了 → 一片空白） */
    if(!_manifest){ paintLoading(host, meta); return; }
    part = part || currentListenPart();
    var units = unitsOf('listening').filter(function(u){ return (u.partNum || 'Part 1') === part; });
    /* M-2：搜索过滤（与阅读侧同一条路径） */
    units = filterUnits(units);
    if(meta){
      var perQ = units.length ? (units[0].qCount || 0) : 0;
      meta.textContent = part + ' · 共 ' + units.length + ' 篇' + (perQ ? (' · 每篇 ' + perQ + ' 题') : '');
    }
    if(!units.length){ host.innerHTML = '<div class="bank-empty"><p>这一部分暂时没有篇目。</p></div>'; return; }
    /* M-2：与阅读侧同一套分组 + 分页（bank-groups.js） */
    host.innerHTML = (window.BankGroups && window.BankGroups.html)
      ? window.BankGroups.html('listenList', units, 'listening', listHtml)
      : listHtml(units, 'listening');
    renderListenFullEntry();
  }

  /* ===== 完整模考卡「上次成绩」（10/18 · P0-2）=====
     竞品观察：雅思哥列表页每套卷直接给「已完成」状态，IELTS Mocks 的成绩页给上次总分——
     共同点是**进列表第一眼就知道自己做到哪了**。本站此前整张卡只有 Start，看不出做没做过。
     数据源 = DATA.mockRecords 里 src:'bank' + granularity:'whole' 的最近一条
     （交卷时已落库，10/17 #9 落的；unshift 入队 → [0] 即最新）。
     ⚠️ 不写假数字：没有记录就只给一句灰字；未判分的场次本来就不落库（10/17 B 口径），不会漏进来。 */
  function relDay(ds){
    if(!ds) return '';
    var d = new Date(ds + 'T00:00:00');
    if(isNaN(d.getTime())) return String(ds);
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var dd = Math.round((t.getTime() - d.getTime()) / 86400000);
    if(dd <= 0) return '今天';
    if(dd === 1) return '昨天';
    if(dd <= 30) return dd + ' 天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function paintFullLast(channel){
    var box = document.querySelector('[data-full-last="' + channel + '"]');
    if(!box) return;
    var rec = null;
    try{
      if(!Array.isArray(DATA.mockRecords)) DATA.mockRecords = [];
      var list = DATA.mockRecords.filter(function(r){
        return r && r.src === 'bank' && r.granularity === 'whole' && r.type === channel;
      });
      rec = list.length ? list[0] : null;
    }catch(e){}
    if(!rec){
      box.className = 'fc-last is-none';
      box.innerHTML = channel === 'listening' ? '还没做过完整听力模考' : '还没做过完整阅读模考';
      return;
    }
    var ok = 0, tot = 0;
    (rec.parts || []).forEach(function(p){ ok += (+p.correct || 0); tot += (+p.total || 0); });
    if(!tot){ box.className = 'fc-last is-none'; box.innerHTML = '上次未判分'; return; }
    var pct = Math.max(0, Math.min(100, Math.round(ok / tot * 100)));
    box.className = 'fc-last';
    box.innerHTML = '上次 <b>' + ok + '/' + tot + '</b>'
      + '<span class="fl-bar"><i style="width:' + pct + '%"></i></span>'
      + '<span>' + esc(relDay(rec.date)) + '</span>';
  }

  /* ===== 列表页「完整模考」入口卡（纯随机组卷，她 10/12 23:2x「不用提前写好题目在那」）=====
     口径：卡上**不再预组卷、不列具体篇目**；点 Start 的那一刻才从 Part 1/2/3 各随机抽 1 篇
     （openFullTest 内做，每次都不一样；退出回列表再进 = 再抽，与真机考「每套卷子都不同」体验一致）。
     题数口径可写死 40：库里阅读 Part 1/2 每篇恒 13 题、Part 3 恒 14 题 → 任意组合恒 40（10/12 全库实测）。
     composeFullTest 本体保持不变，只是调用时机从「渲染时」挪到「点 Start 时」。 */
  function composeFullTest(){
    var all = unitsOf('reading'), picked = [];
    ['Part 1', 'Part 2', 'Part 3'].forEach(function(part){
      var pool = all.filter(function(u){ return (u.partNum || 'Part 1') === part; });
      if(!pool.length){ picked.push(null); return; }
      picked.push(pool[Math.floor(Math.random() * pool.length)]);
    });
    return picked.indexOf(null) > -1 ? null : picked;
  }
  /* EXAM-E2P（10-26）：无 UI 的验证入口。
     openFullTest / picksFromIds 都在本 IIFE 内，探针与 E-2 的「重做」按钮都够不着 ——
     暴露两个只读入口（不渲染、不绑事件、不改变任何默认行为）：
       window.__hubOpenFullTestFromIds(ids)  → 按 id 还原并开考；还原失败返回 false（调用方降级）
       window.__hubPicksFromIds(channel, ids) → 纯查询，给探针用
     ⚠️ 必须等 manifest 到了才有篇目；没到就返回 false/null，不抛错。 */
  window.__hubOpenFullTestFromIds = function(ids){
    try{
      /* 传 null/空 = 明确要「随机开一场」（E-2 老记录降级就是这条路）。
         传了 ids 才去还原；还原失败返回 false，让调用方自己决定怎么提示。 */
      if(!ids || !ids.length){ openFullTest(); return true; }
      var picks = picksFromIds('reading', ids);
      if(!picks) return false;
      openFullTest(picks);
      return true;
    }catch(e){ console.warn('[bank] __hubOpenFullTestFromIds 失败', e); return false; }
  };
  window.__hubPicksFromIds = function(channel, ids){
    try{ var p = picksFromIds(channel || 'reading', ids); return p ? p.map(function(u){ return u.id; }) : null; }
    catch(e){ return null; }
  };
  /* 10/17 性能批 · 改为「静态卡 + 切状态」而不是 innerHTML 注入。
     why：原先 manifest 到达后才插入这张 242px 高的卡，把下面 .partbar/#bankList 顶下去，
     手机 Slow4G 实测 CLS 0.238（单次偏移占全部 99%，且发生在遮罩收起之后，用户看得见）。
     现在卡的结构写在 bank.html 里（首帧即有高度），这里只负责：
       ① 数据没到 → 保持 disabled（防止点 Start 什么都不发生）
       ② 数据就绪 → 去掉 disabled
       ③ 数据不足（某个 Part 没有篇目）→ 整块移除（此时移除发生在遮罩期/很早期，且是必须的行为） */
  function renderFullEntry(){
    var host = document.getElementById('fullEntry'); if(!host) return;
    paintFullLast('reading');   /* 10/18：上次成绩不依赖目录，先画（目录没到也能看） */
    var btn = host.querySelector('[data-fullstart]');
    if(!_manifest){ if(btn) btn.disabled = true; return; }
    /* 数据可用性检查：三个 Part 各至少 1 篇才出卡（Start 时 composeFullTest 还有兜底） */
    var all = unitsOf('reading');
    var ok = ['Part 1', 'Part 2', 'Part 3'].every(function(p){
      return all.some(function(u){ return (u.partNum || 'Part 1') === p; });
    });
    if(!ok){ host.innerHTML = ''; return; }
    if(btn) btn.disabled = false;
  }

  /* ===== 听力「完整模考」入口卡（10/12 第 10 项；同日晚改纯随机口径）=====
     与阅读同一套 .full-card（四科入口同构）。卡上不预组卷、不列篇目；点 Start 才从 Part 1–4
     各随机抽 1 篇（她 10/11「随机组卷：退出回列表重新抽」+ 10/12「不用提前写好题目在那」）。
     题数可写死 40：库里听力每篇恒 10 题 → 4 篇恒 40（10/12 全库实测）。 */
  function composeFullListenTest(){
    var all = unitsOf('listening'), picked = [];
    ['Part 1', 'Part 2', 'Part 3', 'Part 4'].forEach(function(part){
      var pool = all.filter(function(u){ return (u.partNum || 'Part 1') === part; });
      if(!pool.length){ picked.push(null); return; }
      picked.push(pool[Math.floor(Math.random() * pool.length)]);
    });
    return picked.indexOf(null) > -1 ? null : picked;
  }
  function renderListenFullEntry(){
    var host = document.getElementById('listenFullEntry'); if(!host) return;
    paintFullLast('listening');   /* 10/18：同上，先画上次成绩 */
    var btn = host.querySelector('[data-lfullstart]');
    if(!_manifest){ if(btn) btn.disabled = true; return; }
    var all = unitsOf('listening');
    var ok = ['Part 1', 'Part 2', 'Part 3', 'Part 4'].every(function(p){
      return all.some(function(u){ return (u.partNum || 'Part 1') === p; });
    });
    /* 同阅读侧：结构静态写在 bank.html（首帧即有高度），这里只切 disabled / 移除。
       听力 pane 首屏是 hidden 的（默认阅读 tab），所以它本来不会在首屏造成跳动；
       但若用户首访就落在听力 tab，同一套「空 div → 晚注入」会让 .partbar 与
       #listenList 被顶下去。两边保持同构，避免以后再踩一次。 */
    if(!ok){ host.innerHTML = ''; return; }
    if(btn) btn.disabled = false;
  }

  /* ===== 小 tab ===== */
  function showTab(tab){
    var root = document.getElementById('bankRoot'); if(!root) return;
    root.setAttribute('data-mock-tab', tab);
    var panes = root.querySelectorAll('.mock-pane');
    for(var i = 0; i < panes.length; i++) panes[i].hidden = (panes[i].id !== 'pane-' + tab);
    var btns = root.querySelectorAll('#mockTabs .pill-tab');
    for(var j = 0; j < btns.length; j++) btns[j].classList.toggle('active', btns[j].getAttribute('data-mtab') === tab);
  }

  /* 切到某个一级 tab 后要重画的东西（阅读列表一直是渲染着的；听力按需渲染） */
  function paintTab(tab){
    showTab(tab);
    renderList('reading');
    if(tab === 'listening'){ renderListenParts(); renderListenList(); }
    renderMockTabCounts();          /* M-1：每次切栏都刷一次计数（切到写作/口语时数据可能刚到） */
  }

  /* ===== 10/17 性能批（第二批 · 传输层）：写作 pane 的两个脚本按需加载 =====
     依据 = tests/_probe_ablate_1017.cjs 线上实测：单独拦掉 writing_prompts.js / writing.js，
     首屏照常渲染、零报错 → 不在首屏关键路径上。但它们合计约 75KB（压缩体），
     会和 common.css / common.js 抢同一条带宽（手机慢网 ~50KB/s ≈ 1.5 秒），
     所以从 bank.html 的 defer 队列里摘出来（数据在 #pane-writing 的 data-late-src 上）。
     ⚠️ 顺序契约不变：writing_prompts.js 必须先于 writing.js（后者用前者的题库数据）。
     ⚠️ 放在 <main> 内的属性上（而不是 <body> 末尾的 script 标签）是有意的：
       软导航只换 <main>，写在末尾的配置在软导航进来时就丢了。 */
  var _wrtLate = null;
  /* 10/17 首屏减重第二步：写作模板与起步语料已搬出 js/data.js（见 js/factory-writing.js），
     写作壳渲染强依赖它们 —— 先确保出厂内容就位，再上这两个脚本。
     出厂内容加载失败也放行（页面降级为空列表），下次切回来 / 预热仍可重试。 */
  function loadWritingScripts(){
    if(typeof HUB_FACTORY !== 'undefined' && typeof HUB_FACTORY.ensureWriting === 'function'){
      return HUB_FACTORY.ensureWriting().then(function(){ return _wrtLoadOnce(); });
    }
    return _wrtLoadOnce();
  }
  function _wrtLoadOnce(){
    /* ⚠️ 10/17 回归修复：软导航会重新 eval 本文件，模块级 _wrtLate 归零 —— 若只看它，软导航绕回
       题库后再点「写作」（或预热再跑一次）会把 writing.js **再 append 一次**，而 writing.js 顶层有
       `const ANCHOR_TABLE_EN`，重复执行会抛 "Identifier 'ANCHOR_TABLE_EN' has already been declared"
       （实测：_probe_spkmock_1011 的 S6b 抓到，软导航往返 bank↔speaking 后报错）。
       所以：① 先看 writing.js 的产物在不在；② promise 缓存同时挂 window，跨 eval 复用同一份加载过程。 */
    if(typeof window.renderExamList === 'function') return Promise.resolve();
    if(window.__wrtLateP) return window.__wrtLateP;
    var host = document.getElementById('pane-writing');
    var raw = host && host.getAttribute('data-late-src');
    if(!raw) return Promise.resolve();
    _wrtLate = raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean).reduce(function(chain, u){
      return chain.then(function(){
        return new Promise(function(res, rej){
          var s = document.createElement('script');
          s.setAttribute('data-late', '1');   /* 标记：运行时按需追加 */
          s.src = u;
          s.onload = res;
          s.onerror = function(){ rej(new Error('load failed ' + u)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).catch(function(e){
      _wrtLate = null;                                  // 失败不缓存，下次切回来还能重试
      window.__wrtLateP = null;
      if(window.console && console.error) console.error('[bank] 写作脚本加载失败：', e);
    });
    window.__wrtLateP = _wrtLate;
    return _wrtLate;
  }
  /* 首屏画完之后空闲预热一次：用户真去点「写作」时通常已经就位；
     放在 load 之后是为了绝不和首屏的 CSS / 三个核心脚本抢带宽（慢网下 load≈8s）。 */
  (function wrtPrewarm(){
    var go = function(){
      var idle = window.requestIdleCallback || function(f){ setTimeout(f, 1200); };
      idle(function(){ loadWritingScripts(); });
    };
    if(document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  })();

  /* ===== 载入 manifest =====
     B-1a 补（她 10-23 10:1x）：目录走四态 —— 骨架 → 内容 / 失败+重试 / 取消 / 空。
     ⚠️ manifest 是**一份数据喂两个 pane**（阅读/听力），所以不能用通用 fetchWithStates
        （它只认一个容器）→ 这里保留自己的 fetch，但四个态的渲染统一走 bkSkeleton /
        bkStateBox / paintBothLists，样式与正文那三路完全一致。 */
  var _bootAC = null;                                  // 目录加载的 AbortController（取消用）
  function boot(skipSkeleton){
    var root = document.getElementById('bankRoot');
    if(!root) return;                                  // 不在本页
    bindBankSearch();                                  /* M-2：搜索框（幂等，重跑不叠加） */
    if(_manifest){ paintTab(root.getAttribute('data-mock-tab') || 'reading'); return; }
    if(_loading) return;
    _loading = true;
    var obj = (typeof BK_OBJ !== 'undefined' && BK_OBJ[dirChannel()]) || '题库';
    /* ① 骨架态：两个列表都先出骨架（哪个 pane 被看到都不会是空白/一行英文） */
    if(!skipSkeleton){
      /* 两个 pane 各写各的物体名（隐藏着的那个也要写对 —— tab 切过去前它一直挂着） */
      [['bankList', '阅读题库'], ['listenList', '听力题库']].forEach(function(pair){
        var h = document.getElementById(pair[0]);
        if(h) h.innerHTML = bkSkeleton(6) + bkStateBox('loading', '正在载入' + pair[1] + '…', '大文件第一次加载要几秒', '取消');
      });
      /* 取消：走统一出口（中断 manifest 请求 → 已取消态 + 重新加载） */
      ['bankList', 'listenList'].forEach(function(id){
        var h = document.getElementById(id);
        if(!h) return;
        var c = h.querySelector('[data-bk-act=loading]');
        if(c) c.addEventListener('click', function(){ dirCancelLoading(); });
      });
    }
    var hasAC = (typeof AbortController === 'function');
    _bootAC = hasAC ? new AbortController() : null;
    var fo = { cache: 'no-cache' };
    if(_bootAC) fo.signal = _bootAC.signal;
    fetch(MANIFEST, fo)
      .then(function(r){ if(!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function(m){
        _manifest = m; _loading = false;
        var r2 = document.getElementById('bankRoot'); if(!r2) return;
        paintTab(r2.getAttribute('data-mock-tab') || 'reading');
      })
      .catch(function(err){
        _loading = false;
        if(err && err.name === 'AbortError') return;     // 取消是自己的事，不当失败报
        if(window.console && console.error) console.error('[bank] manifest 加载失败：', err);
        /* 🔴 10/11 顺带修：失败提示原先只写 #bankList，听力 tab 会一直停在「目录加载中…」
           B-1a：升级为四态的错误态（中文 + 重试按钮），两个列表都写。 */
        paintBothLists('error', '目录没加载出来', '可能是网络问题，重试一下', '重试');
        ['bankList', 'listenList'].forEach(function(id){
          var h = document.getElementById(id);
          if(!h) return;
          var b = h.querySelector('[data-bk-act=error]');
          if(b) b.addEventListener('click', function(){ boot(); });
        });
        /* 10/17 性能批：入口卡已改为静态写在 HTML 里，目录失败时它不该再挂在那儿
           （按钮虽 disabled 点不动，但「完整阅读模考」配一条失败提示会让人以为能用）。 */
        ['fullEntry', 'listenFullEntry'].forEach(function(id){
          var h = document.getElementById(id);
          if(h) h.innerHTML = '';
        });
      });
  }

  /* ===== 做题页 ===== */
  /* 每组题上面那行英文指令（按真机考的标准措辞，按题型给）
     听力：源数据自带平台官方指令原文 group.description（748 组都有），**优先直接用** —— 比我们拼的准。
     阅读：这一批刻意不动，仍走下面的拼接口径（避免顺手改出阅读的差异）。 */
  function instrFor(g, channel){
    var listen = (channel === 'listening');
    if(listen){
      var d = clean(String(g.description || '')).trim();
      if(d) return d;
    }
    var qs = g.questions || [], opts = ((qs[0] && qs[0].options) || []);
    var txt = opts.map(function(o){ return String(o.optionContent || ''); }).join(' ').toUpperCase();
    var src = listen ? 'recording' : 'passage';
    if(g.type === 'fill-in-the-blank'){
      var isTable = /<table/i.test(String(g.contentHtml || ''));
      return isTable
        ? 'Complete the table below.<br>Choose <b>ONE WORD AND/OR A NUMBER</b> from the ' + src + ' for each answer.'
        : 'Complete the notes below.<br>Choose <b>ONE WORD ONLY</b> from the ' + src + ' for each answer.';
    }
    if(g.type === 'matching'){
      var roman = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
      return roman
        ? 'The ' + (listen ? 'recording' : 'Reading Passage') + ' has several sections.<br>Choose the correct heading for each section from the list of headings below.'
        : 'Which section contains the following information?<br>Write the correct letter in each box.';
    }
    if(g.type === 'map'){
      if(listen) return 'Label the map below.<br>Write the correct letter, <b>A</b>–<b>H</b>, next to each answer.';
      return 'The Reading Passage has several paragraphs.<br>Which paragraph contains the following information?<br>Write the correct letter in each box.';
    }
    if(g.type === 'multiple-choice'){
      var want = /THREE/i.test(String((qs[0] && qs[0].question) || '')) ? 'THREE' : 'TWO';
      return 'Choose <b>' + want + '</b> letters.';
    }
    if(/TRUE|FALSE|NOT GIVEN/.test(txt))
      return 'Do the following statements agree with the information given in the ' + src + '?<br>Write <b>TRUE</b> if the statement agrees with the information, <b>FALSE</b> if the statement contradicts the information, <b>NOT GIVEN</b> if there is no information on this.';
    if(/YES|NO|NOT GIVEN/.test(txt))
      return 'Do the following statements agree with the claims of the writer?<br>Write <b>YES</b> if the statement agrees with the claims of the writer, <b>NO</b> if the statement contradicts the claims of the writer, <b>NOT GIVEN</b> if it is impossible to say what the writer thinks about this.';
    return 'Choose the correct letter, <b>A</b>, <b>B</b>, <b>C</b> or <b>D</b>.';
  }

  /* ===== 10/18 P1-2 考前操作指南（一次性 · 可跳过）=====
     竞品口径：雅思哥每科配一段 2 分钟「怎么操作」视频。我们不做视频（贵且没必要），
     用一张静态卡替代：4 条图标 + 一句话，只讲「点了会怎样」。
     出现时机 = **点进模考之后、答题页渲染之前** —— 倒计时还没开始，不会白扣她时间。
     按科目各记一次（阅读 / 听力分开；写作与口语不走这条入口）。
     ⚠️ 语言：这张卡挂在列表页 body 上、不在考场内，所以用中文。
        （「考试页零中文」管的是答题界面本身；这里若写英文，普通考生反而看不懂。）
     ⚠️ 她讨厌冗余浮层 → 只 4 条、一辈子只出现一次、一个按钮，右上 ✕ 与 Esc 都等于看过。 */
  var GUIDE_KEY = 'hub_exam_guide_v2_';
  function guidePassed(ch){ try{ return localStorage.getItem(GUIDE_KEY + ch) === '1'; }catch(e){ return true; } }
  function markGuidePassed(ch){ try{ localStorage.setItem(GUIDE_KEY + ch, '1'); }catch(e){} }
  function showExamGuide(ch, cb){
    var old = document.getElementById('exGuide'); if(old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.className = 'exg'; wrap.id = 'exGuide';
    wrap.innerHTML = '<div class="exg-c" role="dialog" aria-modal="true" aria-label="模考操作速览">'
      + '<button type="button" class="exg-x" data-exgclose aria-label="Close">\u2715</button>'
      + '<h4>开始前 30 秒：这 4 个地方点一下就够</h4>'
      + '<div class="exg-g">'
      /* 图标直接复用顶栏那两个 SVG —— 卡上长什么样，考场上就长什么样。
         10/20 她 ②：眼睛标（隐藏计时）删了 → 卡上这一项换成「音量 / 倍速」，
         因为音频条里现在多了倍速 select，考前顺手告诉她更省事。 */
      +   '<div class="exg-i"><span class="exg-ic">' + ICO_FULL + '</span><b>全屏</b>'
      +     '<span>右上角第一个图标。点了地址栏会藏起来，卷面更大。</span></div>'
      +   '<div class="exg-i"><span class="exg-ic exg-rate">1.0×</span><b>倍速 / 音量</b>'
      +     '<span>音频条右侧。倍速 0.8–1.5 直接选，音量滑杆随手拖。</span></div>'
      +   '<div class="exg-i"><span class="exg-ic exg-flag">' + ICO_FLAG + '</span><b>标记本题</b>'
      +     '<span>题目右上角的小旗子。拿不准先标上，交卷前会把这些题号列出来。</span></div>'
      +   '<div class="exg-i"><span class="exg-ic exg-part">Part</span><b>底栏切篇</b>'
      +     '<span>底栏 Part 1｜2｜3 直接点就跳过去，不用滚回去找。</span></div>'
      + '</div>'
      + '<div class="exg-b"><button type="button" class="exg-go" data-exgclose>知道了，开始</button></div>'
      + '</div>';
    document.body.appendChild(wrap);
    var fired = false, mo = null;
    function teardown(){
      var el = document.getElementById('exGuide');
      if(el && el.parentNode) el.parentNode.removeChild(el);
      document.removeEventListener('keydown', onKey, true);
      if(mo){ mo.disconnect(); mo = null; }
    }
    function done(){
      if(fired) return; fired = true;
      teardown();
      cb();
    }
    function onKey(ev){ if(ev.key === 'Escape' || ev.keyCode === 27){ ev.preventDefault(); done(); } }
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', function(ev){
      var t = ev.target;
      if(t === wrap || (t.closest && t.closest('[data-exgclose]'))){ ev.preventDefault(); done(); }
    });
    /* 🔴 卡片挂在 body 上（不在 <main> 里），而站内跳转是「只换 <main> 内容」的软导航 ——
       不盯着的话，用户点侧栏去别的页面时这张卡会**留在屏幕上挡住全站**（10/18 mock-immerse
       残留就是同一类事故）。所以观察 <main>：题库容器 #bankRoot 一旦不在文档里，直接收卡、
       且**不触发 cb**（人已经不在题库页了，不该再跳进考场）。 */
    var mainEl = document.querySelector('main');
    if(mainEl && typeof MutationObserver !== 'undefined'){
      mo = new MutationObserver(function(){
        if(document.getElementById('bankRoot')) return;
        fired = true;                 /* 标记为已完成，避免任何后续回调 */
        teardown();
      });
      mo.observe(mainEl, { childList: true });
    }
  }
  /* 入口闸：没看过就先给卡，看完（或关掉）才真的进考场 */
  function examGuideGate(ch, next){
    if(guidePassed(ch)){ next(); return; }
    showExamGuide(ch, function(){ markGuidePassed(ch); next(); });
  }

  function openExam(unitId, channel){
    if(!guidePassed(channel)){ examGuideGate(channel, function(){ openExam(unitId, channel); }); return; }
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){
      host.hidden = false;
      /* B-1a：正文也走四态。noCancel = 已点了开始，不给「取消」（避免误取消丢上下文），
         但失败态仍可「重试」，取消态不会出现。 */
      fetchWithStates(host, 'Test ' + String(unitId).replace(/^.*\//, ''), 'bank/' + channel + '/' + unitId + '.json', function(box, unit){
        startUnitExam(unit, unitId, channel);
      }, { noCancel: true });
    }
  }

  /* B-1a：openExam 拆出「拿到 unit 之后」的原有逻辑（原样搬进来，一行没改）。
     answers 文件仍在里面并行拉 —— 它失败不影响题目可用（10/17 B 口径不变）。 */
  function startUnitExam(unit, unitId, channel){
    var root = document.getElementById('bankRoot');
    var p2 = fetch('bank/answers/' + unitId + '.json', { cache: 'no-cache' })
                .then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; });

      Promise.all([Promise.resolve(unit), p2]).then(function(res){
      var ansFile = res[1] || {};
      annotateGroups(unit, ansFile.answers || {});   /* 10/16：组级答案标注（共享组判分/限数用） */
      var _hasAns = !!(ansFile.answers && Object.keys(ansFile.answers).length);
      EX = {
        unit: unit, channel: channel,
        answers: ansFile.answers || {}, alts: ansFile.alts || {},
        /* 10/17 B：答案文件缺失/解析失败 → 本篇不判分（不产假成绩、不写记录）。
           交卷后照常练习（题目/高亮/笔记全可用），只是没有对错与总分。 */
        scored: _hasAns,
        user: {}, submitted: false, groups: [], total: 0, correct: 0,
        /* 听力专用：开始一律练习模式 + 音频未播过；倍速复位 */
        listenMode: 'practice', audioStarted: false
      };
      _rateIx = 0; _audioBound = null; _audioRate = RATE_DEFAULT;
      /* 3-4：换篇/重进考场要清掉上一篇的句子条缓存，否则新篇会先闪一下旧篇的句子 */
      _stLines = null; _stBound = null;
      try{ EX.user = JSON.parse(localStorage.getItem('hub_bank_draft_' + unitId) || '{}') || {}; }catch(e){ EX.user = {}; }
      renderExam();
      bankStartTimer();                               /* C-3：进考试即开专注计时（幂等，不会双开） */
    }).catch(function(err){
      if(window.console && console.error) console.error('[bank] 题目加载失败：', err);
      var h = document.getElementById('examRoot');
      if(h) h.innerHTML = '<div class="bank-empty"><p>Could not load this test. Please go back and try again.</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>Back</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  function qNums(g){
    var ns = [];
    (g.questions || []).forEach(function(q){ if(q.qNumber != null) ns.push(Number(q.qNumber)); });
    return ns.filter(function(n){ return !isNaN(n); }).sort(function(a, b){ return a - b; });
  }
  function qRange(g){ var ns = qNums(g); return ns.length ? (ns[0] + '–' + ns[ns.length - 1]) : ''; }

  /* 判断题：选项是 TRUE/FALSE/NOT GIVEN 或 YES/NO/NOT GIVEN → 三个内联方块 */
  var TF_SET = ['TRUE', 'FALSE', 'NOT GIVEN', 'YES', 'NO'];
  function isTFGroup(g){
    if(g.type === 'matching' || g.type === 'multiple-choice') return false;
    var qs = g.questions || [], opts = (qs[0] && qs[0].options) || [];
    if(!opts.length || opts.length > 3) return false;
    return opts.every(function(o){
      return TF_SET.indexOf(String(o.optionContent || '').trim().toUpperCase()) > -1;
    });
  }
  /* numOf：把「篇内题号」映射成「卷面题号」。单篇练习 = 原样；完整模考 = 1–40 连续编号。 */
  function idNum(){ return function(n){ return n; }; }

  /* 🔴 BANK-MAP-OPT-1（10-27）：组内选项回退。
     病根：听力 map 组是「一份字母池 A–J，全组共用」（真机考同形），但题库里这份池子
     **只错落在组内前几题的 q.options 上**（实地统计：listening 37 个 map 组，组级 options 全空 37/37，
     而组内至少有一题带池子的 37/37）→ 原来按「每题自己的 options」渲染，
     没带池子的那几题就成了只有题干、没有任何可点控件的空行（她考到就答不了，判分还恒算错）。
     修法：本题没 options 时，在**同一组**里找第一份非空选项池借过来（与 :4084 判型同源的取法）。
     ⚠️ 只补渲染来源，不动 collect / 判分（值仍以 data-v 为准，链路零变化）。 */
  function groupOptPool(q, group){
    if((q.options || []).length) return q.options;
    var qs = (group && group.questions) || [];
    for(var i = 0; i < qs.length; i++){
      if((qs[i].options || []).length) return qs[i].options;
    }
    return [];
  }
  function pillsHtml(q, numOf, group){
    var n = numOf(q.qNumber);
    var h = '<div class="ex-pills" data-q="' + esc(n) + '">';
    groupOptPool(q, group).forEach(function(o){
      var v = o.optionNum || o.optionContent || '';
      h += '<span class="ex-pill" data-v="' + esc(v) + '">' + esc(o.optionContent || v) + '</span>';
    });
    return h + '</div>';
  }
  /* 配对题：选项胶囊（拖进虚线框用） */
  function chipHtml(o){
    var v = String(o.optionNum || '');
    var t = String(o.optionContent || o.option || '');
    return '<span class="ex-chip" data-v="' + esc(v) + '">' + esc(v) + ' <b>' + esc(t) + '</b></span>';
  }
  /* 单选题：圆点 + 字母加粗（对齐真机考） */
  function radioHtml(q, numOf){
    var n = numOf(q.qNumber);
    var h = '<div class="ex-opts ex-radio-box" data-q="' + esc(n) + '">';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || '';
      h += '<label class="ex-opt" data-v="' + esc(v) + '">'
        + '<input class="ex-radio" type="radio" name="exq_' + esc(n) + '" value="' + esc(v) + '">'
        + '<span><b>' + esc(v) + '</b>' + esc(o.optionContent || '') + '</span></label>';
    });
    return h + '</div>';
  }
  /* 多选题：方框 + 字母加粗；need = 题目要求勾几个（0 = 不限），选满其余变灰禁用（真机考行为）
     share = 共享这份选项的其他题号（空格分隔）—— 真机考「Questions X–Y Choose N letters」
     是**一份选项全组共用**，而题库数据里选项只挂在组内第一个题上（全库 109 个多选组
     102 个如此），其余题若不共享就完全没有作答 UI。collect 时勾选值会同步写给每个共享题号。 */
  function cboxHtml(q, numOf, need, share){
    var h = '<div class="ex-cbox ex-opts" data-q="' + esc(numOf(q.qNumber)) + '"'
      + (need ? ' data-need="' + need + '"' : '')
      + (share ? ' data-share="' + esc(share) + '"' : '') + '>';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || '';
      h += '<label class="ex-opt" data-v="' + esc(v) + '">'
        + '<input class="ex-check" type="checkbox" value="' + esc(v) + '">'
        + '<span><b>' + esc(v) + '</b>' + esc(o.optionContent || '') + '</span></label>';
    });
    return h + '</div>';
  }
  function selectHtml(q, opts){
    var h = '<select class="ex-sel" data-q="' + esc(q.qNumber) + '"><option value=""></option>';
    opts.forEach(function(o){
      var v = o.optionNum || o.option || '';
      h += '<option value="' + esc(v) + '">' + esc(v + '. ' + (o.optionContent || o.option || '')) + '</option>';
    });
    return h + '</select>';
  }
  function fillHtml(g, numOf){
    var html = clean(bodyOf(g.contentHtml));
    var had = 0;
    html = html.replace(/<input([^>]*)>/gi, function(m, attrs){
      var pm = /placeholder\s*=\s*["']?([0-9]+)["']?/i.exec(attrs);
      var n = pm ? pm[1] : '';
      if(n) had++;
      var gn = n ? numOf(n) : n;
      /* 三态框（样子稿 104 → 10/13 她截图 3 口径修正）：外层 .ex-blankw 管「数字/空白输入」切换，
         input 保持原类名供收集/判分。
         10/13：点击后不再让数字「硬消失」——input 带 placeholder=题号（灰显），
         光标在前、数字在后，输入第一个字符数字才让位（原生 placeholder 行为，她截图 3 指定口径）。 */
      return '<span class="ex-blankw" data-q="' + gn + '"><b>' + gn + '</b>'
        + '<input class="ex-blank" type="text" data-q="' + gn + '"'
        + ' placeholder="' + esc(gn) + '" autocomplete="off" spellcheck="false"></span>';
    });
    return { html: '<div class="ex-html">' + html + '</div>', had: had };
  }

  /* 逐题旗子（Mark）：题干右上（样子稿 104，迁移自底栏 Mark 按钮） */
  function flagHtml(n){
    return '<button type="button" class="ex-flagq" data-qn="' + esc(n) + '" title="Mark">\u2691</button>';
  }
  /* 多选要勾几个（Choose TWO/THREE/FOUR）。派生链（10/16 二修，她复报「多选能选超限」）：
     ① 组内答案文件的字母并集大小 —— 最可靠：题库有 39 组把「Choose TWO」的两个字母**拆到两个
        题号**（21="A" 22="C"，与 Playing Soccer 那种「两题都存 C,E」并存），题干也不一定写 TWO，
        只有答案并集能还原真实需要数；
     ② 题干文本（Which/Choose TWO/THREE…）；
     ③ 兜底 = 组内题数。
     实测全库 109 组 → need 全落在 2(99)/3(10)，无 0（10/16 一批只读 description → 109/109 缺 → 恒 0）。 */
  function groupNeed(g){
    var qs = g.questions || [];
    var src = plain(g.description || '');
    if(!src) src = qs.map(function(q){ return plain(q.question || ''); }).join(' ');
    var m = /TWO|THREE|FOUR/i.exec(src);
    var stemNeed = m ? ({ two:2, three:3, four:4 }[m[0].toLowerCase()] || 0) : 0;
    return Math.max(stemNeed, g._needAns || 0) || (qs.length > 1 ? qs.length : 0);
  }
  /* 共享选项形态：组内部分题带选项、部分不带（真机考「Questions X–Y Choose N」= 一份选项全组共用；
     题库 109 个多选组 102 个如此）。 */
  function isSharedGroup(g){
    var qs = g.questions || [];
    var withOpts = qs.filter(function(q){ return (q.options || []).length; }).length;
    return withOpts > 0 && withOpts < qs.length;
  }
  /* 10/16：组级答案标注（加载时算一次，单篇与完整模考两条路径都挂）。
     g._ansSet = 组内全部题号答案的**字母并集**（小写去重排序逗号串）——判分口径 = 勾选集合与它
     相等（真机考 "21 & 22 IN EITHER ORDER: A, C"，不区分哪个字母归哪一题）；
     g._needAns = 该并集大小 = 该组需要勾几个（答案文件是比题干更可靠的判据：39 组的题干没写 TWO）。 */
  function annotateGroups(unit, answers){
    (unit.parts || []).forEach(function(p){
      (p.groups || []).forEach(function(g){
        var set = {};
        (g.questions || []).forEach(function(q){
          var v = answers[q.qNumber];
          if(v == null) return;
          String(v).split(/[,\s\/]+/).forEach(function(c){ c = c.trim().toLowerCase(); if(c) set[c] = 1; });
        });
        g._ansSet = Object.keys(set).sort().join(',');
        g._needAns = Object.keys(set).length;
      });
    });
  }

  function groupHtml(g, idx, numOf, channel){
    numOf = numOf || idNum();
    channel = channel || (EX && EX.channel) || 'reading';
    var h = '<div class="ex-group" data-gtype="' + esc(g.type) + '" data-g="g' + idx + '">';
    var ns = qNums(g).map(numOf);
    h += '<p class="ex-grp-h">Questions ' + esc(ns.length ? (ns[0] + '–' + ns[ns.length - 1]) : '') + '</p>';
    h += '<p class="ex-grp-i">' + instrFor(g, channel) + '</p>';
    /* 题目配图（听力地图题 / 带图填空题）：图在 static.9fnnn.com，公开可直引，不下载。
       🔴 10/11 踩过的坑：旧建库脚本的字段白名单把 groups[].imageUrl 丢了 →
          我据此误判「听力地图题全站没图」，实际源数据 37/37 都有图。
          现已由 tests/_patch_bank_assets_1011.cjs 补回。查数据前先确认查的是不是源数据。
       🔴 10/11 二次修正：**不要给这张图加 `loading="lazy"`**。实测「懒加载 + 未声明宽高」= 图片先占 24px、
          几秒后撑到 536px，把下方题目整块往下推（教科书级 layout shift，正撞她「绝不切内容、绝不错位」的判据）；
          而且这张图就在打开篇目的首屏附近、又是做题必需内容 → 属「关键内容例外」，不该懒加载。
          多个独立来源口径一致（Cloudinary / Scrimba / OpenReplay / webperfclinic）：
          **above-the-fold 与 LCP 图必须 eager；防 CLS 要给 width/height 或 aspect-ratio**。
          我们没有图片尺寸信息（源数据未带），所以这里选「eager 加载」把抖动压到看不见，而不是留白占位。
          以后若要恢复 lazy，必须先拿到真实宽高（拿不到就别 lazy）。 */
    if(g.imageUrl) h += '<div class="ex-gimg"><img src="' + esc(g.imageUrl) + '" alt=""></div>';
    var qs = g.questions || [];

    if(g.type === 'fill-in-the-blank'){
      var f = fillHtml(g, numOf);
      h += f.html;
    } else if(g.type === 'matching'){
      var opts = (g.options && g.options.length) ? g.options : ((qs[0] && qs[0].options) || []);
      var gid = 'mg' + idx;
      var isHead = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
      /* 10/20 她 ⑦「题目放左、选项放右竖排」（真题口径，省空间）：
         **配对题（matching）且非 heading**，听力和阅读统一走左右布局。
         10/20 16:3x 她选 2B「A + 阅读词条匹配一起统一」：
           · A = 共用选项池的 matching（就是她图1 那种：选项池 + 每题一个槽）——**听力那批**
             （Climate Allergies 等 89 组）；原先被 `channel === 'reading'` 挡住，
             所以「两种 matching 形态不一致」（设计稿 §①「现在」那张实测截图就是听力的）。
           · 阅读词条匹配（131 组）本就是左右布局，栏宽参数与新形态调齐即可。
         Heading 题（isHead，选项是罗马数字 i–x）她 10/15 拍板必须拖放原样 → 不并。
         交互完全不变（还是 chip 拖进 .ex-drop，_dg 状态机/判分/清理全复用），
         变的只是**位置**：选项池从题干上方整块搬到右侧竖排一列。 */
      var lside = !!(opts.length && !isHead && qs.length >= 3);
      if(lside){
        /* 结构 = .ex-q--lside 容器 > 左列每题（题号 + 题干 + .ex-drop）+ 右列 .ex-q-side（竖排选项池）
           ⚠️ 池子仍是全组唯一一份（dgPool/dgPoolChip 按 data-g 找，复制会双双失效）。 */
        var poolHtml = '<div class="ex-pool ex-pool--side" data-g="' + gid + '">'
          + '<div class="ex-pool-t">Options</div>'
          + '<div class="ex-pool-c">' + opts.map(chipHtml).join('') + '</div></div>';
        h += '<div class="ex-q--lside" data-shared-opts="1"><div class="ex-q-lcol">';
        qs.forEach(function(q){
          var n = numOf(q.qNumber);
          h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
            + flagHtml(n) + '<span class="ex-qt">' + esc(plain(q.question)) + '</span>'
            + '<div class="ex-drop" data-q="' + esc(n) + '" data-g="' + gid + '"></div></div>';
        });
        h += '</div><div class="ex-q-side">' + poolHtml + '</div></div>';
        return h + '</div>';
      }
      h += '<div class="ex-pool" data-g="' + gid + '">'
        + (isHead ? '<div class="ex-pool-t">List of Headings</div>' : '')
        + '<div class="ex-pool-c">' + opts.map(chipHtml).join('') + '</div></div>';
      /* 10/15 回滚：她明确「heading 题就是要拖放的，你不要改错了」——
         我一度把 isHead 改成表格行，改错了，恢复原拖放槽形态（她 10/12 亲自拍板）。 */
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + flagHtml(n) + '<span class="ex-qt">' + esc(plain(q.question)) + '</span>'
          + '<div class="ex-drop" data-q="' + esc(n) + '" data-g="' + gid + '"></div></div>';
      });
    } else if(g.type === 'map' && channel === 'reading'){
      /* 🔴🔴 10/15 她纠正：「段落匹配题和 heading 题是两种题型，不能混为一谈」（我一度混过，改错了又回滚）。
         这两种在题库里分别是：
         · 本分支 = type "map" 的**段落匹配**（Matching Information：哪一段包含以下信息）
           —— 题干是「a contrast between...」这类信息描述，**无选项**，答案是**文章段落字母 A–I**
           —— 她 10/14 拍板：**字母框**（表格行：题号 | 题干 | 右侧字母下拉）
         · 上面 matching 分支里的 isHead（List of Headings）= **Heading 题**
           —— 题干是「Paragraph A」，选项是**罗马数字 i–x**
           —— 她 10/12 拍板、10/15 再次强调：**必须拖放**，不许改成字母框
         答案口径：EX.user[题号] = 段落字母 → 判分/落库/草稿全复用，与形态无关。 */
      var gid = 'loh' + idx;
      var letters = 'ABCDEFGHI'.split('');   /* 官方矩阵固定 A–I 9 列（她 15:41 官方截图同款）；同一字母可被多题使用 → 每题独立 radio */
      /* 🔴🔴 10/16 三修（她 15:41 官方截图：「表格不是这样下拉的，是这样的」）：
         段落匹配的「表格」= **官方答题卡矩阵**——表头 A–I 列，每行题干，每格一个圆圈 radio，点选即答。
         （15:19 我做成了「行+下拉」的表格，她指正形态不对。）
         答案口径零改动：EX.user[题号] = 段落字母；radio 带 data-q（collect/domKeys/复盘全兼容）。
         同一字母可重复使用（官方规则）→ 不做跨题互斥。 */
      h += '<div class="ex-lomatrix-wrap"><table class="ex-lomatrix"><thead><tr><th class="mx-stem-h"></th>'
        + letters.map(function(L){ return '<th>' + L + '</th>'; }).join('')
        + '</tr></thead><tbody>';
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<tr class="ex-q-lohr">'
          + '<td class="mx-stem">' + flagHtml(n) + '<b class="mx-no">' + esc(n) + '</b> ' + esc(plain(q.question)) + '</td>'
          + letters.map(function(L){
              return '<td class="mx-cell"><input type="radio" name="lomx-' + esc(n) + '" value="' + L + '" data-q="' + esc(n) + '" aria-label="Question ' + esc(n) + ' paragraph ' + L + '"></td>';
            }).join('')
          + '</tr>';
      });
      h += '</tbody></table></div>';
    } else if(g.type === 'map'){
      /* map 这一个 type 在题库里是两种题：
         · 阅读 —— 实为「哪一段包含以下信息」的段落信息匹配：字母指段落，靠左边文章作答；
         · 听力 —— 真地图标注题：字母指地图上的位置，靠上面的 g.imageUrl 配图作答。
         两者渲染方式相同（题干 + 一排字母），差别只在有没有配图 → 上面统一挂图即可。 */
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + flagHtml(n) + '<span class="ex-qt">' + esc(plain(q.question)) + pillsHtml(q, numOf, g) + '</span></div>';
      });
    } else if(g.type === 'multiple-choice'){
      var need = groupNeed(g);
      /* 🔴 10/16 修（她实测 Q9-10：题干被压成 40px 窄条 + 词中断 + Choose TWO 能勾 3 个 + Q10 无法作答）
         ＋ 10/16 二修（她复报「题型 UI 不像考试 / 多选能选超限 / 有题只有题干没选项」）：
         ① 选项原为 .ex-qt 的 flex 兄弟节点 → 长选项把题干栏压成窄条（1440px 实测仅 40px），
            文字溢出被选项底色盖住 = 截图里的「词中断」。改：选项移入 .ex-qt 内部（题干下竖排整行）
            —— 10/14 卷面格式批（597103d）写下的 `.ex-qt > .ex-opts{margin-top:8px}` 本意，
            当时只包了题干没移选项（死代码）。形态与 104 样子稿 cb-opts 一致。
         ② 共享选项组（102/109）逐题渲染 → 非承载题成了「有题干无选项」的孤儿行（她截图里的第 10 题）。
            真机考 = **合并题号 + 一份选项**（104 样子稿同形：`19-20` 合并框）→ 合并成一行「9–10」，
            承载题输出唯一 cbox + data-share 列出其余题号（collect 同步写全组 / 判分按集合）。
         ③ 选项形态对齐真机考（爱听写真题站逆向实证：多选 = checkbox 方框 + ✓，单选 = radio 圆环，
            见 bank.html .ex-cbox 样式）。 */
      if(isSharedGroup(g)){
        var carrier = null, nums = [];
        qs.forEach(function(q){
          nums.push(numOf(q.qNumber));
          if(carrier == null && (q.options || []).length) carrier = q;
        });
        if(carrier){
          var label = nums.length > 1 ? (nums[0] + '–' + nums[nums.length - 1]) : nums[0];
          var others = nums.filter(function(x){ return x !== numOf(carrier.qNumber); }).join(' ');
          var cst = numOf(carrier.qNumber);
          /* 🔴🔴 10/20 16:4x 她复报：「这里原本是没问题的我也没叫你改这里，现在被你改坏掉了」（截图 = Choose TWO 组）。
             根因 = **我超出了她拍板的范围**：她 10/20 拍板的是「配对题（matching）」改左题右选项，
             我在同一批里顺手把**多选题共享组**也改成了左右布局（.ex-q--lside + .ex-q-side）。
             → **多选题回滚到 10/16 二修形态**：合并题号一行（9–10）+ 题干与选项同在 .ex-qt 内竖排。
             配对题的左右布局保留（那是她拍板的），只共用 .ex-q--lside 这个容器类，互不影响。
             判分链路零改动：input 仍带 data-v + data-share（collect 同步写全组 / 判分按集合）。 */
          h += '<div class="ex-q ex-q--mgroup"><span class="ex-qn ex-qn--wide" data-qns="' + esc(nums.join(' ')) + '">' + esc(label) + '</span>'
            + flagHtml(cst) + '<span class="ex-qt">' + clean(carrier.question) + cboxHtml(carrier, numOf, need, others) + '</span></div>';
        }
      } else {
        qs.forEach(function(q){
          var n = numOf(q.qNumber);
          var inner = clean(q.question);
          if((q.options || []).length) inner += cboxHtml(q, numOf, need, '');
          h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
            + flagHtml(n) + '<span class="ex-qt">' + inner + '</span></div>';
        });
      }
    } else {
      var tf = isTFGroup(g);
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + flagHtml(n) + '<span class="ex-qt">' + clean(q.question) + (tf ? pillsHtml(q, numOf, g) : radioHtml(q, numOf)) + '</span></div>';
      });
    }
    return h + '</div>';
  }

  /* ===== 考试页外壳（单篇 / 完整模考共用，避免两份 HTML 漂移）=====
     10/12：顶栏照样子稿 104 窄单行；Aa 换三横杠 ☰ = Option 覆盖面板
     （Colour = 原 Contrast 三档 exCt / Size = 原 Text size 三档 exTs，控件与委托不变只换皮）。
     10/13：顶栏计时器旁加 #exFtMini 小徽章（她 10/13 报「左下绿胶囊太明显」→
     考场内隐藏全站 floatTimer，改在顶栏时间旁边显示小号计时；数据源与 floatTimer 同口径）。 */
  /* ===== 10/18 真机考工具栏：全屏 / 隐藏计时 =====
     依据：IELTS Mocks 听力答题页实测顶栏 = `Full Screen · Settings · Help · Hide`
     （截图见 design/竞品调研_2026-10-18/mocks-test-doing.png），真机考同款。
     我方原本只有 ☰(Option) 一个按钮 → 缺真机考最显眼的两个控件。
     · 全屏：走浏览器 Fullscreen API，不落库（会话级，退出即恢复常规）
     · 隐藏计时：只把显示文本换成 --:--，**倒计时照跑**（EX._leftSec 仍在更新、到点照收卷）；
       选择记 localStorage，下次沿用（她不用每次开考都点一次） */
  var ICO_FS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M21 3h-5v5M8 21H3v-5M21 21h-5v-5"/></svg>';
  var ICO_HIDE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c5 0 9 7 9 7a16 16 0 0 1-2.3 3M6.3 6.4A16 16 0 0 0 3 12s4 7 9 7c1.6 0 3-.5 4.2-1.2"/></svg>';
  /* 10/20 她 ①：全屏按钮「太丑，改好看的」→ 16:4x 复报「那个全屏按钮有问题重新改一下，好看一些」。
     前一版是 ICO_FULL（四角直角折线，17px 下糊成一团，看不出是全屏）。
     改成**对角箭头**式（成熟站点通用：Material Icons fullscreen / IELTS Mocks 顶栏同款）：
       · 进入全屏 = 四个角各一支朝外箭头
       · 退出全屏 = 四个角各一支朝内箭头（用户看得出「再点一次是退出」）
     依据：design/109 §④ 引用竞品实测条（design/竞品调研_2026-10-18/p03-listen-bar.png，
     IELTS Mocks 音频条右端工具组 = 全屏 + 静音 + ☰），其全屏键即为四向箭头形态。 */
  var _fsIconBound = null;
  function paintFsIcon(){
    var b = document.getElementById('exFsBtn');
    if(!b) return;
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    b.innerHTML = on ? ICO_FULL_X : ICO_FULL;
    b.title = on ? 'Exit full screen' : 'Full screen';
    b.setAttribute('aria-label', b.title);
  }
  if(!window.__BANK_FS_ICON){
    window.__BANK_FS_ICON = true;
    ['fullscreenchange','webkitfullscreenchange'].forEach(function(ev){
      document.addEventListener(ev, paintFsIcon);
    });
  }
  /* 进入全屏：四角朝外箭头（↖↗↙↘ 四个 L 形箭头） */
  /* 10-22 顶栏品牌图标：与本站顶栏壳 .tb-logo 同源（ICON.brand 的那枚白标），
     这里内联一份避免 bank.js 依赖 common.js 的加载顺序（bank.html 不引 common.js 的 ICON）。 */
  var ICO_BRAND = '<svg viewBox="0 0 512 512" width="16" height="16" fill="none" aria-hidden="true">'
  + '<g fill="#fff" stroke="#fff" stroke-width="38" stroke-linejoin="round" stroke-linecap="round">'
  + '<path d="M256 136 L344 194 L256 252 L168 194 Z"/><path d="M160 304 L212 304 L256 362 L300 304 L352 304 L352 354 Q352 394 256 394 Q160 394 160 354 Z"/></g></svg>';
  var ICO_FULL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><path d="M4 4l6 6"/><path d="M20 4l-6 6"/><path d="M20 20l-6-6"/><path d="M4 20l6-6"/></svg>';
  /* 退出全屏：四角朝内箭头（↘↙↗↖，箭头指向中心） */
  var ICO_FULL_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4"/><path d="M15 4v3.5A1.5 1.5 0 0 0 16.5 9H20"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20"/><path d="M9 20v-3.5A1.5 1.5 0 0 0 7.5 15H4"/><path d="M10 10h4v4h-4z"/></svg>';
  /* 10/20：音频条音量 / 静音图标（去 emoji，SVG 线性图标与全屏/隐藏计时同款） */
  var ICO_VOL  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h3.5L13 19V5L7.5 9H4z"/><path d="M16.5 9.5a4 4 0 0 1 0 5M19 7a7.5 7.5 0 0 1 0 10"/></svg>';
  var ICO_MUTE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h3.5L13 19V5L7.5 9H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>';
  /* 10/20：小旗子（标记本题）。考前指南卡与答题页旗标同款，卡上长什么样考场上就长什么样。
     原来用 ⚑ 字符，全站禁 emoji → 换 SVG。 */
  var ICO_FLAG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4.5h11l-2.2 4.2L17 12.8H6"/></svg>';
  /* 10/20：倍速档位 0.8–1.5、0.1 一档（她原话「0.8 到 1.5，0.1 一档」）= 8 档。
     默认 1.0（原 _rateIx=0 = 1.0，口径不变）。AUDIO_RATES 旧数组改名保留索引兼容，
     新路径一律走 rateValue()/setRate()。 */
  var RATE_MIN = 0.8, RATE_MAX = 1.5, RATE_STEP = 0.1, RATE_DEFAULT = 1.0;
  function rateOptions(){
    var s = '', i;
    for(i = 0; i <= 7; i++){
      var v = +(RATE_MIN + i * RATE_STEP).toFixed(1);
      s += '<option value="' + v + '"' + (Math.abs(v - RATE_DEFAULT) < 1e-9 ? ' selected' : '') + '>' + v.toFixed(1) + '×</option>';
    }
    return s;
  }
  function setRate(v){
    var n = parseFloat(v);
    if(!(n >= RATE_MIN - 1e-9 && n <= RATE_MAX + 1e-9)) return;
    n = Math.min(RATE_MAX, Math.max(RATE_MIN, +n.toFixed(2)));
    _audioRate = n;                     /* 10/20：记住选择，换 Part / 重进考场沿用 */
    try{ localStorage.setItem('hub_bank_rate', String(n)); }catch(e){}
    var a = document.getElementById('exAudio');
    if(a) a.playbackRate = n;
    var sel = document.getElementById('eaRate');
    if(sel && sel.value !== String(n)) sel.value = String(n);
    return n;
  }
  var HIDE_T_KEY = 'hub_exam_hide_timer_v1';
  var _hideT = false;
  try{ _hideT = localStorage.getItem(HIDE_T_KEY) === '1'; }catch(e){}
  /* 10/20 她 ②：眼睛标（隐藏计时）整块删除。setHideTimer 一并删除，
     但 HIDE_T_KEY 留在库里兼容旧 localStorage（有人存过 '1' 也不报错）。 */
  function fmtHMS(sec){
    var s = Math.max(0, sec | 0);
    return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
  }
  function toggleFullscreen(){
    try{
      var d = document.documentElement;
      if(!document.fullscreenElement && !document.webkitFullscreenElement){
        var req = d.requestFullscreen || d.webkitRequestFullscreen;
        if(req){ var r = req.call(d); if(r && r.catch) r.catch(function(){}); }
      } else {
        var ex = document.exitFullscreen || document.webkitExitFullscreen;
        if(ex){ var r2 = ex.call(document); if(r2 && r2.catch) r2.catch(function(){}); }
      }
    }catch(e){}
  }
  function wireExamTools(){
    /* 与 wireOptionPanel 同款：元素级绑定、每次渲染重绑（DOM 会重建，__bound 打在元素上防重复） */
    var fs = document.getElementById('exFsBtn');
    if(fs && !fs.__toolBound){ fs.__toolBound = true; fs.addEventListener('click', function(ev){ ev.preventDefault(); toggleFullscreen(); }); }
    paintFsIcon();                     /* 10/20 ①：每次渲染把全屏图标刷成当前态 */
    /* 10/20 她 ②：眼睛标删了 → 没有 #exHideBtn，这里什么都不用绑 */
  }
  /* ===== 听力答题页的工具区（10/18 补 10/14 漏洞）=====
     10/14「两行并一行」把 .ex-top 整行 display:none，顶栏里的整场倒计时 / ☰ Option / Saved
     就一起没了；10/16 音频条瘦身又把 #eaFullTimer 撤掉 → 听力考场既看不到剩余时间，也打不开
     字号与配色面板。这里把它们搬进音频条那一行：视觉上仍是一行，功能全部恢复。
     ⚠️ 只在「单篇听力」调用。完整听力模考的音频条会随换 Part 重建（renderListenPart 重写
     #exAudioHost.innerHTML），搬进去的节点会被一起冲掉 —— 那条路径保持顶栏可见即可。 */
  function mountListenTools(host){
    host = host || document.getElementById('examRoot');
    if(!host) return;
    var bar = host.querySelector('#exAudioBar');
    var top = host.querySelector('.ex-top');
    if(bar){
      /* 10/20 她 ⑤：听力单篇不显示整场计时 → 不再创建 #eaFullTimer。
         旧 DOM 若残留（软导航壳没重建）会由上一处 bar.innerHTML = ... 冲掉。 */
      var icons = host.querySelector('.ex-icons');
      if(icons) bar.appendChild(icons);
      bar.classList.add('has-tools');
    }
    if(top) top.style.display = 'none';      /* .ex-option 面板是 .ex-top 的兄弟，藏它不影响面板 */
  }
  function shellHtml(nameText, subText, timerText){
    /* 🔴 BUGFIX（10-25 停工期间只修 bug）：顶栏那颗「暂停」用的是 `showPause`，
       但那个变量定义在**另一个函数 barHtml() 的局部作用域**里（:1392），这里根本取不到
       → `ReferenceError: showPause is not defined`，而 shellHtml 是 renderExam 的必经之路，
       **整篇题目直接加载失败**（不是少个按钮，是打不开卷子）。
       由 W-EXTOP-1（顶栏加暂停）引入；探针 `_probe_guide_1018` 的 F1 那条一直红着在报它。
       修法：这里按**同一条表达式**自己算一次（= 与底栏完全同源，不另造判断）。
       为什么不提取成共用函数：两人都是 IIFE 内的局部，提出来要动调用约定；
       而这条判断只有三个字段，重复一次比多一层间接更不容易再错。 */
    var showPause = !!(EX && !EX.submitted && EX.listenMode !== 'exam');
    /* 🔴 10-22 她拍板照 IDP 官方 demo 复刻：「把左上角那个 iELTS 改成我们网站的那个网址
       yasihub.com 其他完全照抄」。官方顶栏 = 左「IELTS 红标 + Test taker ID」+ 右四个图标；
       我们 = 左「本站图标 + yasihub.com」+ 中篇名/计时 + 右工具组（Saved/全屏/Option）。
       ⚠️ 篇名/计时仍在原位不动（官方那条是考号，我们没有也不该编）；图标组沿用本站既有的
        Saved / 全屏 / ☰ Option（官方是 wifi/消息/菜单/笔记四个，功能不对等，不硬搬）。 */
    return '<div class="ex-top">'
      +    '<a class="ex-brand" href="home.html" title="yasihub.com">'
      +      '<i aria-hidden="true">' + ICO_BRAND + '</i><span>yasihub.com</span></a>'
      +    '<div class="ex-name">' + esc(nameText)
      +      (subText ? '<small>' + esc(subText) + '</small>' : '') + '</div>'
      +    '<span class="ex-timer" id="exTimer">' + timerText + '</span>'
      + ''   /* 10/14 她拍板：顶栏计时徽章关掉（音频长短不一，与整场计时并存重复） */
      /* 10/20 她：眼睛标删掉（顶栏不再提供「隐藏计时」；听力单篇本来就不显示计时，
         模考的计时是核心信息不该藏）。同时把整栏只留 Saved + Fullscreen + ☰。 */
      /* 10/20 她给的爱听写（idictation）真实机考实证截图：‹ › 前后箭头在**题目区右上角**、
         深色方块，底栏里没有箭头。放在顶栏右侧而不是绝对定位浮层 —— 浮层会压住右上角的
         题目文字（她「绝不切内容、绝不错位」的红线），顶栏位置视觉等价且永不错位。
         🔴 必须放在 .ex-icons **里面**：单篇听力会把整个 .ex-icons 搬进音频条、并藏掉
         .ex-top（mountListenTools）—— 箭头做成 .ex-top 的直接子节点会被一起藏掉，
         在听力单篇里直接消失。手机（≤860）由 CSS 隐藏：窄屏点 Part/题号就够。 */
      +    '<div class="ex-icons">'
      /* W-EXTOP-1（10-25）：她「头上那个黑的左右箭头也删了」→ .ex-step / .ex-arrow 整块下线。 翻题入口不受影响：底部 Part 题号行（.ex-nav 的题号按钮）一直都能点，是主入口。 */
      /* W-EXTOP-1（10-25）：顶栏右侧加「暂停」，与底栏 #exPauseBtn 同一个开关、状态双向同步。
         🔴 showPause 条件与底栏完全同源（同一变量）—— 听力考试模式本来就不渲染 Pause，此处不另造判断。
         🔴 手机（≤860）由 CSS 隐藏，底栏 Pause 还在，功能不丢（见 bank.html 的 .ex-top-pause 规则）。 */
      +      (showPause ? '<button class="ex-ico ex-top-pause" id="exTopPauseBtn" type="button" title="Pause">暂停</button>' : '')
      +      '<span class="ex-saved" id="exSaved" hidden>Saved</span>'
      +      '<button class="ex-ico ex-toolbtn" id="exFsBtn" type="button" title="Full screen" aria-label="Full screen">' + ICO_FULL + '</button>'
      +      '<button class="ex-ico ex-menubtn" type="button" title="Option">\u2630</button>'
      +    '</div></div>'
      + '<div class="ex-option" id="exOptionPanel">'
      +    '<button type="button" class="ex-opx" data-opclose>\u2715</button>'
      +    '<h3>Options</h3>'   /* 10/22 官方对照：标题是复数 Options（我们原来写成 Option 单数） */
      +    '<div class="ex-oplist" id="exOptMain">'
      +      '<div class="ex-oprow" data-sub="colour">Colour<span class="ar">\u203A</span></div>'
      +      '<div class="ex-oprow" data-sub="size">Size<span class="ar">\u203A</span></div>'
      /* 10/16 她：「第三个调节音频的删掉」（音频调节界面晚点再说）→ Audio 子面板整套删除 */
      +    '</div>'
      +    '<div class="ex-opsub" id="exOptColour">'
      +      '<label class="ex-oprow" data-theme=""><input type="radio" name="exCt" value="light" checked> Black on white</label>'
      +      '<label class="ex-oprow" data-theme="dark"><input type="radio" name="exCt" value="dark"> White on black</label>'
      +      '<label class="ex-oprow" data-theme="yellow"><input type="radio" name="exCt" value="yellow"> Yellow on black</label>'
      +    '</div>'
      +    '<div class="ex-opsub" id="exOptSize">'
      +      '<label class="ex-oprow" data-fs=""><input type="radio" name="exTs" value="regular" checked> Regular</label>'
      +      '<label class="ex-oprow" data-fs="large"><input type="radio" name="exTs" value="large"> Large</label>'
      +      '<label class="ex-oprow" data-fs="xl"><input type="radio" name="exTs" value="xl"> Extra large</label>'
      +    '</div>'
      /* 10/14 她拍板：音量滑杆与倍速从音频条移到这里（进度条折叠，三科顶栏一致）。
         data 属性与音频条时代完全相同 → 事件绑定（data-avsl / data-arate / data-avol）零改动。
         🔴 10/16：文案英文化（音量→Volume / 倍速→Speed / 静音→Mute / 已静音→Muted / 开启中→On）。 */
      /* 10/16 她：Audio 子面板已删（原音量/倍速/静音） */
      +    '<div class="ex-opback"><button type="button" data-opback>\u2039 Back</button></div>'
      + '</div>';
  }
  function splitHtml(artHtml, qHtml){
    return '<div class="ex-split" id="exSplit">'
      +    '<div class="ex-article" id="exArt">' + artHtml + '</div>'
      +    '<div class="ex-qcol" id="exQCol">' + qHtml + '</div>'
      +    '<aside class="ex-notes" id="exNotes">'
      +      '<div class="ex-notes-h"><b>Notes</b><button type="button" id="exNoteClose" title="Hide">×</button></div>'
      +      '<div id="exNoteList"></div>'
      +    '</aside>'
      +  '</div>';
  }
  /* ===== 10/14 补 Option 面板交互 =====
   既有 bug：Colour / Size / Audio 三个分组行点击无反应 —— .ex-opsub.on 这个类从来没有任何 JS 去加
   （CSS 写好了显示规则，JS 侧缺失）。本批补齐：点分组 → 显示子页；点 Back/✕ → 回主列表。 */
function optShowSub(key){
  var panel = document.getElementById("exOptionPanel"); if(!panel) return;
  /* 10/14 直接操作 style.display —— class 切换（.on）实测时灵时不灵
     （疑与软导航二次 eval bank.js 有关：旧监听器引用旧函数、DOM 却是新的），
     用最笨的 style 写法，100% 可控。 */
  var MAP = { colour: "exOptColour", size: "exOptSize" };   /* 10/16：audio 子面板已删 */
  var want = MAP[key] || "";
  var main = document.getElementById("exOptMain");
  if(main) main.style.display = "none";
  panel.querySelectorAll(".ex-opsub").forEach(function(x){
    x.style.display = (x.id === want) ? "block" : "none";
  });
  var back = panel.querySelector("[data-opback]"); if(back) back.style.display = "";
}
function optShowMain(){
  var panel = document.getElementById("exOptionPanel"); if(!panel) return;
  var main = document.getElementById("exOptMain");
  if(main) main.style.display = "";
  panel.querySelectorAll(".ex-opsub").forEach(function(x){ x.style.display = "none"; });
  var back = panel.querySelector("[data-opback]"); if(back) back.style.display = "none";
}
function wireOptionPanel(){
  /* 10/14 元素级绑定（document 委托实测对 audio 行不触发 —— colour/size 行却正常，
     查不出原因；元素级监听优先级最高、绝不丢失，且每次渲染重绑也不会叠）
     ⚠️ 不用 __optPanelWired 守卫：渲染会重建 DOM，必须每次重新绑。 */
  var panel = document.getElementById("exOptionPanel"); if(!panel) return;
  panel.querySelectorAll(".ex-oprow[data-sub]").forEach(function(row){
    if(row.__optBound) return; row.__optBound = true;
    row.addEventListener("click", function(ev){
      ev.stopPropagation();
      optShowSub(row.getAttribute("data-sub"));
    });
  });
  panel.querySelectorAll("[data-opback]").forEach(function(b){
    if(b.__optBound) return; b.__optBound = true;
    b.addEventListener("click", function(ev){ ev.stopPropagation(); optShowMain(); });
  });
  panel.querySelectorAll("[data-opclose]").forEach(function(c){
    if(c.__optBound) return; c.__optBound = true;
    c.addEventListener("click", function(ev){
      ev.stopPropagation();
      panel.classList.remove("on"); optShowMain();
    });
  });
}

/* 10/15 修「模考突然刷新跳出」：把「我正在考试中」告诉 SW。
   SW 更新时原本会 c.navigate() 强制刷新所有页面 —— 正在答题的人会被刷出去、考试中断。
   上报后，SW 遇到 inExam:true 的客户端只发提示、不导航，等考完再刷。
   🔴 10/20：同时开/关全局「模考锁」（common-shell.js）。
   锁解决的是另一条路径 —— 软导航换 <main> 会直接销毁 #examRoot（它就在 <main> 里），
   模考中点侧栏 = 考场连同已答内容瞬间消失（实测 examRoot 从 6 个子节点变「不存在」）。
   两条路径互补：EXAM_STATE 挡 SW 强刷，模考锁挡页面内跳转。 */
function reportExamState(inExam, flushHeal){
  try{
    if(typeof hubExamLock === 'function'){
      hubExamLock(!!inExam, '模考进行中，先交卷或退出模考再切换页面', flushHeal);
    }
  }catch(e){}
  try{
    if(navigator.serviceWorker && navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({ type: 'EXAM_STATE', inExam: !!inExam });
    }
  }catch(e){}
}
window.__reportExamState = reportExamState;

  function barHtml(){
    /* 10/12 批A：底栏重构为真机考形态（她 22:03「切换考题不该放上面，要放下面」）。
       10/13 她报两件：①「题号和 Pause/Exit/Finish 分成两行不好，并成一行」→ 桌面 .ex-bar 改
         row（题号行 flex:1 占满，按钮行 flex:none 靠右）；≤860 移动端保持两行（390 宽放不下）。
       ②「Pause 是个摆设」→ 本批实现 pauseExam/resumeExam（见下）。
       🔴🔴🔴 10/20 22:3x 她发来爱听写（idictation）里**真实机考的截图**（剑雅21 Test 4 听力），
       原话「底栏听力阅读模考的做成这个样子，你改错了」—— 我 10/20 上一批照 IDP 英文文档做的
       「全卷 40 题 + 底栏前后箭头 + 左下角 Review」与真实软件不符，本批逐条纠回截图口径：
         · Part 行（左）：当前 Part 加粗 + 紧跟**本 Part 全部题号**（截图：Part 3 → 21…30）；
           其他 Part 只有「Part N」+ 灰色「x of y」已答数；做完的 Part = 绿勾 + 篇名
           （截图：☑ Part 2），不显示数字。
         · 底栏**没有**前后箭头（10-25 W-EXTOP-1 之后**顶栏也没有箭头了**（她「黑的左右箭头删了」），翻题走底部题号行）、
           **没有** Review 按钮（flag 保留题干右上角小旗子，与题号圆圈同步）。
         · Pause 恢复渲染（截图里 Finish section / Pause / Exit 三个按钮同在底栏）。
           ⚠️ 听力完整模考（listenMode==='exam'）仍不渲染：她 10/20 定的「考试模式锁定播放」
           是行为铁律（录音不可暂停/不可拖动），渲染了也是摆设。
         · 视觉：44px / #eef0f2 不变（与写作页 .wt-bar 同一套）；Part 不再是白胶囊，改纯文字；
           三个动作按钮同款浅灰（截图里三者同色，Finish section 不再是主色蓝）。 */
    var full = !!(EX && EX.full);
    var showPause = !!(EX && !EX.submitted && EX.listenMode !== 'exam');
    /* 第二行品牌条（她 22:5x：「跟他们一样在左下角弄一个自己网站的名字……弄成两行」）。
       爱听写那条 = 左「爱听写 剑雅21 Test 4」+ 右系统时钟；我们右侧不放东西（整场计时在顶栏，
       10/14 她拍板的位置，不重复），左边 = 站点名 + 当前科目。手机（≤860）由 CSS 整条隐藏。
       牌子取 yasihub.com（她 22:5x 给的两个候选里选带域名的 —— 光写 yasihub 像内部代号，
       带上 .com 顺便提醒用户这是哪）。 */
    var chLabel = (EX && EX.channel === 'listening') ? '听力' : '阅读';
    return '<div class="ex-bar">'
      +    '<div class="ex-bar-main">'
      +      '<div class="ex-nav' + (full ? '' : ' ex-nav--plain') + '" id="exNav">'
      /* full = Part 行（当前 Part 内嵌题号容器 #exNums，由 paintPgSwitch 建、paintSheet 填）；
         单篇 = 只有题号行（#exNums 直接由 barHtml 建）。 */
      +        (full ? '<div class="ex-parts" id="exParts"></div>'
      :               '<div class="ex-nums" id="exNums"></div>')
      +      '</div>'
      +      '<div class="ex-actions">'
      +        (showPause ? '<button type="button" class="btn-ghost ex-pause" id="exPauseBtn">Pause</button>' : '')
      +        '<button class="btn-ghost" type="button" data-exit>Exit</button>'
      +        '<button class="btn-primary" type="button" data-submit>Finish section</button>'
      +      '</div>'
      +    '</div>'
      +    '<div class="ex-strip">'
      +      '<span class="ex-strip-b">yasihub.com</span>'
      +      '<span class="ex-strip-d" aria-hidden="true">·</span>'
      +      '<span class="ex-strip-t">' + chLabel + '</span>'
      +    '</div>'
      +    '</div>';
  }
  /* 底栏箭头图标（与全屏键同款 stroke 风格，1.9 粗、圆头） */
  /* 底栏箭头图标（与全屏键同款 stroke 风格）。⚠️ 用 function 声明而不是 var ——
     函数声明会提升，barHtml() 在任何位置调用都拿得到；上次写 var 渲染成 "undefined" 就是这么踩的。 */
  /* 10-24 7-3：盲听遮罩用的眼睛图标（描边风格，与全屏/箭头一致） */
  function icoEye(){
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  }
  function icoStar(){
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75L6.8 19.65l1-5.8-4.2-4.1 5.8-.85z"/></svg>';
  }
  function icoEyeOff(){
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l16 16"/><path d="M9.6 6.3A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7"/><path d="M6.2 8.2A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.4-.6"/></svg>';
  }
  function icoArrow(dir){
    var d = dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function ctxHtml(){
    /* 10/12 改：由竖排五项改横向浮动工具条。
       🔴 10/16 按她的指示 + 真实机考实证再次校正（她 18:34 两条）：
          · 选中**普通文字** → 只有 Note / Highlight
            —— 原先多给的 "Clear all" **真题里没有**，已整块删掉（她原话「真题里没有的功能不要加」）。
          · 选中**已高亮文字** → 只有 Clear Highlight
            —— 她记的「好像是 delete」（NOTE 按钮删除笔记），实际这条是 Clear Highlight，
               来源 = 爱听写（idictation.cn，还原机考的真题站）线上产物实证：
               其划词工具条的取消按钮渲染的是两个独立 span → `<span>Clear</span><span>Highlight</span>`
               （tests/_rea_out/idict/toolbar-702282c8.js 的 cancelHighlight 分支）；
               未高亮时则是 `Note` + `Highlight` 两项，**没有 Clear all / Remove 这类第三项**。
            → 「Remove」这个我自己编的词一并去掉，改成机考实际用的 Clear Highlight。
       显示哪一个由 paintCtxButtons() 按上下文决定。 */
    return '<div class="ex-ctx" id="exCtx">'
      +    '<button type="button" data-hact="hl">Highlight</button>'
      +    '<button type="button" data-hact="note">Note</button>'
      +    '<hr>'
      +    '<button type="button" data-hact="unhl">Clear Highlight</button>'
      +  '</div>';
  }

  /* ===== 听力音频条（10/11 第 9 项）=====
     双模式做法来自成熟练习站（来源与结论见 bank.html 内联样式里那段注释）：
       练习模式 = 可暂停 / 可拖进度 / 可倍速（默认）
       考试模式 = 直通：不给暂停、不给拖动、不给倍速，还原「录音只播一遍」
     首次播放后模式锁死（防考到一半切回练习模式）；交卷后解锁，可自由复听。 */
  var AUDIO_RATES = [1, 1.25, 1.5, 0.75], _rateIx = 0, _audioBound = null;
  /* 10/20：倍速改 0.8–1.5 / 0.1 一档（8 档，默认 1.0），用 <select> 直接选。
     AUDIO_RATES/_rateIx 保留只为兼容旧调用点，新逻辑一律走 _audioRate + setRate()。 */
  var _audioRate = 1.0;
  /* 音量：真机考界面**只有音量控制，没有暂停/回退/重播**（IDP 官方问答等四处口径一致）
     → 两种模式下都必须可用，且音量要跨页记住（练习场景比考场更需要）。
     模块加载时就读回 —— audioBarHtml() 早于 wireAudio() 渲染，这里不读的话首屏滑杆会显示 100%。 */
  var _audioVol = 1, _audioMuted = false;
  try{
    var _v0 = parseFloat(localStorage.getItem('hub_bank_vol'));
    if(isFinite(_v0)){ _audioVol = Math.max(0, Math.min(1, _v0)); _audioMuted = _audioVol === 0; }
  }catch(e){}
  /* 1 → "1.0×"，1.25 → "1.25×"（别用 toFixed(1)：1.25 会显示成 1.3，看着像另一个倍速） */
  function rateLabel(r){ return (r % 1 === 0 ? r.toFixed(1) : String(r)) + '×'; }
  /* 10/20：倍速跨页记忆（音量已有 hub_bank_vol，倍速同款）。模块加载时就读回，
     audioBarHtml() 早于 wireAudio() 渲染，这里不读首屏 select 会显示默认 1.0。 */
  try{
    var _r0 = parseFloat(localStorage.getItem('hub_bank_rate'));
    if(isFinite(_r0) && _r0 >= RATE_MIN - 1e-9 && _r0 <= RATE_MAX + 1e-9) _audioRate = _r0;
  }catch(e){}

  /* ===== 10-24 7-3 · 复盘态三件套（盲听优先 / 单句遍数 / 收藏星）=====
     口径：全部只在「听力 + 已交卷」出现，考试态一律不给（考试态没有回退/重播这一说）。
     存储全部走 localStorage（本机），不碰 DATA → 不参与云端同步，也不影响判分。 */
  var REPEAT_KEY = 'hub_bank_repeat';
  var STAR_KEY   = 'hub_bank_stars';
  var BLIND_KEY  = 'hub_bank_blind';
  var _audioRepeat = 1;
  try{
    var _p0 = parseInt(localStorage.getItem(REPEAT_KEY), 10);
    if(_p0 === 1 || _p0 === 2 || _p0 === 3) _audioRepeat = _p0;
  }catch(e){}
  function repeatOptions(){
    var s = '', i;
    for(i = 1; i <= 3; i++){
      s += '<option value="' + i + '"' + (i === _audioRepeat ? ' selected' : '') + '>' + i + ' 遍</option>';
    }
    return s;
  }
  function setRepeat(n){
    if(n !== 1 && n !== 2 && n !== 3) return;
    _audioRepeat = n;
    try{ localStorage.setItem(REPEAT_KEY, String(n)); }catch(e){}
    var sel = document.getElementById('eaRepeat');
    if(sel && sel.value !== String(n)) sel.value = String(n);
  }
  /* 收藏：按 unitId + 句索引存，一篇一张星图；结构 { "<unitId>": [i0,i2,...] } */
  function starStore(){
    try{ return JSON.parse(localStorage.getItem(STAR_KEY) || '{}') || {}; }catch(e){ return {}; }
  }
  function saveStarStore(o){ try{ localStorage.setItem(STAR_KEY, JSON.stringify(o)); }catch(e){} }
  function unitIdOf(){ return EX && EX.ids ? EX.ids[EX.curP || 0] : (EX && EX.unit && EX.unit.id); }
  function starsOf(){
    var id = unitIdOf(); if(!id) return {};
    var o = starStore(), a = o[id];
    if(!a || !a.length) return {};
    var m = {}; a.forEach(function(i){ m[i] = 1; });
    return m;
  }
  function isStarred(i){ return !!starsOf()[i]; }
  function toggleStar(i){
    var id = unitIdOf(); if(!id) return false;
    var o = starStore(), a = o[id] || [], k = a.indexOf(i), now;
    if(k >= 0){ a.splice(k, 1); now = false; }
    else { a.push(i); now = true; }
    a.sort(function(x, y){ return x - y; });
    if(a.length) o[id] = a; else delete o[id];
    saveStarStore(o);
    paintStarCount();
    return now;
  }
  /* 10-24 7-3：盲听开关的两个按钮是同一枚硬币的两面 —— 统一在这里切，
     杜绝「只藏自己不亮对面」的半截状态（那样按钮会一起消失，她就回不来了）。
     blind=true：原文藏起 → 亮「显示原文」；false：原文可见 → 亮「收起」。 */
  function setBlindBtns(blind){
    var bar = document.getElementById('exAudioBar');
    if(!bar) return;
    var bRev = bar.querySelector('[data-screveal]');
    var bHid = bar.querySelector('[data-schide]');
    if(bRev) bRev.hidden = !blind;
    if(bHid) bHid.hidden = !!blind;
  }
  /* 「已收藏 N 句」：挂在原文区底部那一行，换篇/重进都实时重算 */
  function paintStarCount(){
    var el = document.getElementById('scStarCount');
    if(!el) return;
    var a = starStore()[unitIdOf()] || [];
    el.textContent = '已收藏 ' + a.length + ' 句';
    el.hidden = a.length === 0;
  }
  /* 盲听优先：一次决定跨刷新（她不会再被同一个遮罩烦第二次） */
  function blindRevealed(){ try{ return localStorage.getItem(BLIND_KEY) === '1'; }catch(e){ return false; } }
  function markBlindRevealed(){ try{ localStorage.setItem(BLIND_KEY, '1'); }catch(e){} }

  /* ===== 10-25 7-4a · 标记式精听（理解度标记）=====
     口径（她 10-25 拍板的默认）：
       ① 两种模式并存，默认停在「连续播放」（7-3 那套），不打扰现有用法
       ② 标记模式 = 一轮一句：听 → 选「听懂/模糊/茫然」→ 自动跳下一句
       ③ 只标记、不自动排复习（爱听写同口径）；报告页留到 7-4b
       ④ 存储走 localStorage，不碰 DATA → 不参与云端同步、不影响判分 */
  var MARK_KEY    = 'hub_bank_marks';
  var INTMODE_KEY = 'hub_bank_intmode';
  var _intMode = 'cont';
  try{ if(localStorage.getItem(INTMODE_KEY) === 'mark') _intMode = 'mark'; }catch(e){}
  /* 当前精听走到第几句（模块级；换篇由 render 重建时重算） */
  var _mkIdx = 0;
  function setIntMode(m){
    _intMode = (m === 'mark') ? 'mark' : 'cont';
    try{ localStorage.setItem(INTMODE_KEY, _intMode); }catch(e){}
    /* 标记模式本身就是「先听后看」，盲听遮罩在它没有意义（遮罩会让三卡失去作用对象）→ 撤掉。
       ⚠️ 只撤当前这次的遮罩，不改 BLIND_KEY：切回连续播放仍按她原来的记忆走。 */
    if(_intMode === 'mark'){
      var host = document.getElementById('exListenIn');
      if(host && host.hasAttribute('data-blind')){ host.removeAttribute('data-blind'); renderBlindCard(); setBlindBtns(false); }
      /* 7-4b: record when this marking pass started - the report page derives elapsed from it.
         Not reset while re-entering the same item (she comes back via「返回继续练习」). */
      if(!_mkStartTs) _mkStartTs = Date.now();
    }
    mountIntensive();
  }
  /* 理解度：按 unitId + 句索引存，一篇一张图；结构 { "<unitId>": { "3":"mid", ... } } */
  function markStore(){
    try{ return JSON.parse(localStorage.getItem(MARK_KEY) || '{}') || {}; }catch(e){ return {}; }
  }
  function saveMarkStore(o){ try{ localStorage.setItem(MARK_KEY, JSON.stringify(o)); }catch(e){} }
  function marksOf(){
    var id = unitIdOf(); if(!id) return {};
    var m = markStore()[id];
    return (m && typeof m === 'object') ? m : {};
  }
  var MK_TX = { ok: '听懂', mid: '模糊', no: '茫然' };
  function setMark(i, k){
    if(k !== 'ok' && k !== 'mid' && k !== 'no') return;
    var id = unitIdOf(); if(!id) return;
    var o = markStore(), m = o[id] || {};
    /* 再点同一档 = 取消（三档统一 —— 只有一档能取消会让人以为另两个按钮坏了）。
       改档直接点别的档；取消留给「这句我不标」。 */
    if(m[i] === k) delete m[i];
    else m[i] = k;
    var empty = true; for(var q in m){ if(m.hasOwnProperty(q)){ empty = false; break; } }
    if(empty) delete o[id]; else o[id] = m;
    saveMarkStore(o);
    paintMarks();
  }
  /* 把理解度画到句子条上（行首小标签 + 左侧色条）；已渲染的行就地改类，不重建 innerHTML */
  function paintMarks(){
    var m = marksOf();
    var rows = document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line');
    rows.forEach(function(el){
      var i = el.getAttribute('data-i'), k = m[i] || '';
      el.classList.remove('mk-ok', 'mk-mid', 'mk-no');
      var tag = el.querySelector('.sc-mk');
      if(k){
        el.classList.add('mk-' + k);
        if(!tag){ tag = document.createElement('i'); tag.className = 'sc-mk'; el.insertBefore(tag, el.querySelector('.sc-tx')); }
        tag.className = 'sc-mk ' + k; tag.textContent = MK_TX[k];
      } else if(tag){ tag.remove(); }
    });
    paintMarkCount();
  }
  function paintMarkCount(){
    var el = document.getElementById('scMarkCount'); if(!el) return;
    var m = marksOf(), n = { ok: 0, mid: 0, no: 0 }, tot = 0;
    for(var k in m){ if(m.hasOwnProperty(k) && n[m[k]] !== undefined){ n[m[k]]++; tot++; } }
    if(!tot){ el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '已标记 ' + tot + ' 句：<b class="ok">' + n.ok + '</b> 听懂 · '
      + '<b class="mid">' + n.mid + '</b> 模糊 · <b class="no">' + n.no + '</b> 茫然';
  }
  /* ===== 10-25 7-4b · 标记式精听报告页 =====
     她 10-25 拍板的默认口径（照抄 7-4b 条目 note，别再问）：
       ① 走完一遍出报告：四格（听懂% / 模糊% / 茫然% / 用时）
       ② 每句一行：左边彩色标签复述当时的选择，右边复用 7-3 那颗收藏星
       ③ 底部「返回继续练习 / 完成练习」两件；**导出 PDF 不做**（要引库，她平时不导出）
       ④ 「茫然」只标、不排复习（爱听写同口径）—— 报告只展示，不写任何复习计划
     数据来源全是现成的：marksOf()（理解度）+ 时间轴 lines（原文与中文）+ _mkStartTs（本场用时）
     零新增存储、不碰 DATA、不参与云同步、不影响判分。 */
  var _mkStartTs = 0;          /* 进标注模式那一刻（算「用时」的起点） */
  function mkElapsed(){
    if(!_mkStartTs) return 0;
    return Math.max(0, Math.round((Date.now() - _mkStartTs) / 1000));
  }
  function mkPct(n, tot){ return tot > 0 ? Math.round(n / tot * 100) : 0; }
  function openMarkReport(){
    var host = document.getElementById('exListenIn') || document.getElementById('examRoot');
    if(!host) return;
    var box = document.querySelector('#examRoot .ex-script .sc-body.sc-tl');
    var lines = _stLines || [];
    if(!box || !lines.length) return;
    var m = marksOf();
    var n = { ok: 0, mid: 0, no: 0 }, marked = 0;
    for(var k in m){ if(m.hasOwnProperty(k) && n[m[k]] !== undefined){ n[m[k]]++; marked++; } }
    var tot = lines.length;
    var secs = mkElapsed();
    var unit = (EX && EX.unit && (EX.unit.title || EX.unit.name)) || '本场';
    var sub = (EX && EX.subName) ? (' · ' + EX.subName) : '';

    var rows = lines.map(function(l, i){
      var mk = m[i] || '';
      var tg = mk ? ('<span class="rpt-tg ' + mk + '">' + MK_TX[mk] + '</span>') : '<span class="rpt-tg none">未标</span>';
      var cn = String(l.cn || '').trim();
      return '<div class="rpt-line' + (mk ? ' ' + mk : '') + '">'
        + tg
        + '<span class="rpt-tx">' + esc(l.text || '') + (cn ? '<small>' + esc(cn) + '</small>' : '') + '</span>'
        + '<button class="rpt-st" type="button" data-star="' + i + '" aria-pressed="' + (starred(i) ? 'true' : 'false') + '"'
        + ' title="' + (starred(i) ? '取消收藏' : '收藏这句') + '" aria-label="' + (starred(i) ? '取消收藏' : '收藏这句') + '">'
        + icoStar() + '</button></div>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.className = 'rpt';
    wrap.id = 'exMarkReport';
    wrap.innerHTML =
        '<h3 class="rpt-head">' + esc(unit) + esc(sub) + ' · 精听报告</h3>'
      + '<div class="rpt-grid">'
      +   '<div class="rpt-cell ok"><div class="n">' + mkPct(n.ok, tot) + '%</div><div class="t">听懂</div></div>'
      +   '<div class="rpt-cell mid"><div class="n">' + mkPct(n.mid, tot) + '%</div><div class="t">模糊</div></div>'
      +   '<div class="rpt-cell no"><div class="n">' + mkPct(n.no, tot) + '%</div><div class="t">茫然</div></div>'
      +   '<div class="rpt-cell tm"><div class="n">' + fmtClock(secs) + '</div><div class="t">用时</div></div>'
      + '</div>'
      + (marked === 0
          ? '<p class="rpt-empty">这一遍还没有标过任何一句。回到「标记式精听」听一句点一档，走完再来看报告。</p>'
          : '<p class="rpt-meta">共 ' + tot + ' 句 · 已标 ' + marked + ' 句（没标的保持「未标」）。'
            + '听不懂的句子只做标记，不会自动排进复习。</p>')
      + '<div class="rpt-lines">' + rows + '</div>'
      + '<div class="rpt-acts">'
      +   '<button class="btn btn-ghost" type="button" id="rptBack">返回继续练习</button>'
      +   '<button class="btn btn-primary" type="button" id="rptDone">完成练习</button>'
      + '</div>';

    /* 插到原文区上方（不删原文：她可能想边看报告边对原文） */
    var old = document.getElementById('exMarkReport');
    if(old) old.remove();
    var script = document.querySelector('#examRoot .ex-script');
    if(script && script.parentNode) script.parentNode.insertBefore(wrap, script);
    else host.appendChild(wrap);

    /* 报告里的收藏星：复用 7-3 的 toggleStar，只改按钮自身状态，不重建列表 */
    wrap.addEventListener('click', function(ev){
      var st = ev.target.closest && ev.target.closest('[data-star]');
      if(st){
        ev.stopPropagation();
        var i = parseInt(st.getAttribute('data-star'), 10);
        if(!isFinite(i)) return;
        var now = toggleStar(i);
        st.setAttribute('aria-pressed', now ? 'true' : 'false');
        st.setAttribute('title', now ? '取消收藏' : '收藏这句');
        st.setAttribute('aria-label', now ? '取消收藏' : '收藏这句');
        return;
      }
      var b = ev.target.closest && ev.target.closest('button, .btn');
      if(!b) return;
      if(b.id === 'rptBack'){
        wrap.remove();
        /* 回到刚才那句，方便接着听 */
        try{ playLine(_mkIdx || 0); }catch(e){}
      }else if(b.id === 'rptDone'){
        wrap.remove();
        /* 「完成练习」= 收起精听区回连续播放（不弹窗、不打断，她最烦弹窗） */
        setIntMode('cont');
        try{ toast('这一遍练完了。标记都留着，下次还能看。'); }catch(e){}
      }
    });

    wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* 跳到第 i 句并播（三卡选完自动递进 + 点句子条共用） */
  function playLine(i){
    var a = document.getElementById('exAudio'); if(!a) return;
    var rows = document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line');
    var el = rows && rows.length > i ? rows[i] : null; if(!el) return;
    var st = parseFloat(el.getAttribute('data-t')); if(!isFinite(st)) return;
    _mkIdx = i;
    try{ a.currentTime = st; }catch(e){}
    /* 标记模式下「一轮一句」= 不套用单句遍数（那是连续精听的参数，两套玩法不混） */
    _repeatLeft = 0; _repeatFrom = null;
    try{ a.play(); }catch(e){}
  }
  function fmtClock(s){ if(!isFinite(s) || s < 0) s = 0; var m = Math.floor(s / 60), x = Math.floor(s % 60); return (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function listenPart(){
    var parts = (EX && EX.unit && EX.unit.parts) || [];
    for(var i = 0; i < parts.length; i++) if(parts[i].audioUrl) return parts[i];
    return null;
  }
  function listenPartLabel(){ var p = listenPart(); return (p && p.partNum) || 'Audio'; }
  function audioBarHtml(partLabel, nameText, timerText, showModes){   /* 10/16：nameText/timerText 参数保留签名兼容（顶栏已承载，不再渲染） */
    var p = listenPart();
    if(!p || !p.audioUrl) return '<div class="ex-audio" id="exAudioBar"><span class="ea-label">No audio for this part</span></div>';   /* 🔴 10/16：原「本部分没有音频」= 考场内中文，违反零中文铁律 */
    /* 🔴 10-22 她拍板照 IDP 官方 demo 复刻（截图 01/02/13/19 存档在 _mock-ref-20261022/）：
       官方听力 = 进 Part 时**整页深色遮罩**（白耳机图标 + 「You will be listening to an audio clip
       during this test. You will not be permitted to pause or rewind the audio while answering the
       questions.」+「To continue, click Play.」+ 黑底 Play 键），点 Play 后遮罩消失，
       顶栏只多一行小字「Audio is Playing」—— 进度条 / 时间 / 倍速**统统没有**（真机考不给拖）。
       ⚠️ 本站保留的：音量键（真机考有音量控制，官方 FAQ 口径一致）+ 音频元素本身（JS 全靠它）。
       ⚠️ 遮罩里那句「不许暂停/回退」对**练习模式**是假话（练习模式就是给暂停回拖的）——
          文案按 listenMode 分流：考试模式用官方原句，练习模式换成「practice 可暂停可回拖」，
          不骗用户（她「真诚不要套路」的规矩）。 */
    var exam = EX.listenMode === 'exam';
    var gateTx = exam
      ? 'You will be listening to an audio clip during this test. You will not be permitted to pause or rewind the audio while answering the questions.'
      : 'You will be listening to an audio clip. In practice mode you can pause and rewind freely.';
    var partChip = partLabel ? '<span class="ea-part">' + esc(partLabel) + '</span>' : '';
    /* 🔵 10-23 3-1：**恒渲染**播放控制组，靠 `.locked`（考试模式）用 CSS 隐藏 ——
       而不是按 exam 分支不渲染。理由：练习⇄考试可以来回切，按分支渲染的话切回来
       就没有节点了（也没人重渲染音频条）。现在切模式只换一个类，节点与监听都不动。
       考试模式下被 CSS 藏起来 → 真机考「不给暂停/回退/倍速」的口径一点没破。 */
    var ctrl = '<button class="ea-play" type="button" data-aplay aria-label="Play">'
      +   '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
      + '</button>'
      + '<div class="ea-bar" id="eaBar" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'
      +   '<i class="ea-fill" id="eaFill" style="width:0%"></i>'
      +   '<i class="ea-knob" id="eaKnob" style="left:0%"></i>'
      + '</div>'
      + '<span class="ea-time" id="eaTime">00:00 / 00:00</span>'
      + '<select class="ea-rate" id="eaRate" aria-label="Speed" title="Speed">' + rateOptions() + '</select>'
      /* 10-24 7-3：单句遍数（复盘态专属）。放在倍速右边 —— 二者是同一类「抠句子」参数，
         挨着才看得出可叠加；CSS 在考试/未交卷时藏掉（见 bank.html 的 .ea-repeat 段）。 */
      + '<span class="ea-repeat" id="eaRepeatWrap" title="点句子时这一句播几遍">'
      +   '<span class="ea-repeat-lb">单句</span>'
      +   '<select class="ea-rate ea-repeat-sel" id="eaRepeat" aria-label="单句播放遍数" title="单句播放遍数">' + repeatOptions() + '</select>'
      + '</span>'
      /* 10-24 7-3：复盘态「显示/收起原文」入口挂在音频条（sticky，永远够得着）。
         盲听遮罩出现时「显示原文」亮起；揭开过一次就换成「收起」。 */
      + '<button class="ea-ico ea-blind-btn" type="button" data-screveal hidden'
      +   ' title="显示原文" aria-label="显示原文">' + icoEye() + '</button>'
      + '<button class="ea-ico ea-blind-btn" type="button" data-schide hidden'
      +   ' title="收起原文，回到盲听" aria-label="收起原文，回到盲听">' + icoEyeOff() + '</button>';
    return '<div class="ex-audio' + (exam ? ' locked' : '') + '" id="exAudioBar">'
      + '<span class="ea-label" id="eaLabel" hidden>Audio is Playing</span>'
      + partChip
      + ctrl
      /* 音量键两种模式都保留（官方实锤有音量控制）。 */
      + '<button class="ea-vol" type="button" data-avol aria-label="Mute" title="Mute">' + (_audioMuted || _audioVol === 0 ? ICO_MUTE : ICO_VOL) + '</button>'
      + '</div>'
      + '<div class="ex-gate" id="exAudioGate">'
      +   '<svg class="ex-gate-ic" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h2.5a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 6.5 20H5a1 1 0 0 1-1-1z"/><path d="M20 14h-2.5a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 17.5 20H19a1 1 0 0 0 1-1z"/></svg>'
      /* 10-23 她报（音频加载静默、点 Play 没声音）：遮罩改成「音频就绪状态机」——
         未就绪时显示真实进度 + 可跳过（先看题、音频后台下）；就绪后才显示官方那句 + Play。
         进度用 <audio> 的 progress 事件算（buffered/duration），不轮询。 */
      +   '<div class="ex-gate-tx">' + gateTx + '</div>'
      +   '<div class="ex-gate-load" id="exAudioLoad" hidden>'
      +     '<div class="ex-gate-bar"><i id="exAudioLoadBar" style="width:0%"></i></div>'
      +     '<div class="ex-gate-loadtx"><span id="exAudioLoadTx">正在载入音频…</span><span id="exAudioLoadPct">0%</span></div>'
      +     '<button class="ex-gate-skip" type="button" data-askip>先看题，音频后台下</button>'
      +   '</div>'
      +   '<div class="ex-gate-go" id="exAudioGateGo">To continue, click Play.</div>'
      +   '<button class="ex-gate-btn" type="button" data-aplay aria-label="Play">'
      +     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Play</button>'
      + '</div>'
      + '<audio id="exAudio" preload="auto" src="' + esc(p.audioUrl) + '"></audio>';
  }
  /* 10-22 官方口径：点 Play → 遮罩消失、开始播。遮罩只在「本篇没播过」时出现，
     状态记在 EX.audioGateDone[part] 上 —— 切 Part 再切回来不重出（官方同行为）。 */
  function hideAudioGate(){
    var g = document.getElementById('exAudioGate');
    if(g) g.hidden = true;
    var l = document.getElementById('eaLabel');
    if(l) l.hidden = false;
  }
  function showAudioGate(){
    var g = document.getElementById('exAudioGate');
    if(g) g.hidden = false;
    var l = document.getElementById('eaLabel');
    if(l) l.hidden = true;
  }
  /* ===== 10-23 音频就绪状态机（她报「点 Play 没声音」）=====
     题库与音频是两次独立请求：题库先到、音频还在下 → 旧形态直接放人进考场，
     点 Play 时音频可能没就绪（静默卡住）。现在进听力先把音频 preload=auto 拉起来，
     遮罩里显示真实进度（buffered/duration），并给「先看题，音频后台下」的跳过链。 */
  var _audioReadyWatch = null;
  function audioPct(){
    var a = document.getElementById('exAudio'); if(!a) return 0;
    try{
      if(a.buffered && a.buffered.length && a.duration > 0){
        return Math.max(0, Math.min(100, Math.round(a.buffered.end(0) / a.duration * 100)));
      }
    }catch(e){}
    return 0;
  }
  function paintAudioGate(){
    var a = document.getElementById('exAudio');
    var box = document.getElementById('exAudioLoad');
    var go  = document.getElementById('exAudioGateGo');
    var btn = document.querySelector('#exAudioGate [data-aplay]');
    if(!a || !box) return;
    /* 已就绪（有元数据且能播）→ 收进度区、显示官方那句 + Play。
       ⚠️ 失败（a.error）不算就绪 —— 走失败分支：显示错误原因 + 重试（既有 showAudioErr 兜底），
       但不把 Play 藏死（练习模式下她可能想再点一次触发重载）。 */
    if(a.readyState >= 1){
      box.hidden = true;
      if(go) go.hidden = false;
      if(btn) btn.hidden = false;
      if(_audioReadyWatch){ clearInterval(_audioReadyWatch); _audioReadyWatch = null; }
      return;
    }
    if(a.error){
      /* 音频失败：进度区改成一句失败说明 + 重试按钮；Play 仍可点（audioToggle 内部会 reload） */
      box.hidden = false;
      if(go) go.hidden = true;
      if(btn) btn.hidden = false;
      var why = (AUDIO_ERR_WHY[a.error.code] || 'Unknown error');
      var t2 = document.getElementById('exAudioLoadTx');
      if(t2) t2.textContent = '音频没加载出来：' + why;
      var p2 = document.getElementById('exAudioLoadPct');
      if(p2) p2.textContent = '重试';
      var sk2 = document.querySelector('#exAudioGate [data-askip]');
      if(sk2) sk2.textContent = '先看题，音频后台重试';
      if(_audioReadyWatch){ clearInterval(_audioReadyWatch); _audioReadyWatch = null; }
      return;
    }
    box.hidden = false;
    if(go) go.hidden = true;
    if(btn) btn.hidden = true;                 /* 没就绪不给点 Play（点了也是静默卡住） */
    var pct = audioPct();
    var bar = document.getElementById('exAudioLoadBar');
    if(bar) bar.style.width = pct + '%';
    var pEl = document.getElementById('exAudioLoadPct');
    if(pEl) pEl.textContent = pct + '%';
    var tx = document.getElementById('exAudioLoadTx');
    if(tx) tx.textContent = pct > 0 ? ('正在载入音频… ' + pct + '%') : '正在获取音频信息…';
  }
  function watchAudioReady(){
    if(_audioReadyWatch) clearInterval(_audioReadyWatch);
    paintAudioGate();
    /* 轮询只为刷新遮罩里的进度（浏览器 progress 事件对大文件不总是细粒度），
       就绪即停；30 秒还没动静 → 保留跳过链 + 让 Play 可点（点了由既有 error 兜底提示）。 */
    var n = 0;
    _audioReadyWatch = setInterval(function(){
      n++;
      paintAudioGate();
      if(n > 60){
        var a = document.getElementById('exAudio');
        if(a && a.readyState < 1 && !a.error){
          var box = document.getElementById('exAudioLoad');
          var go = document.getElementById('exAudioGateGo');
          var btn = document.querySelector('#exAudioGate [data-aplay]');
          if(box) box.hidden = true;
          if(go){ go.hidden = false; go.textContent = '音频加载较慢，可先看题，稍后点播放。'; }
          if(btn) btn.hidden = false;
        }
        clearInterval(_audioReadyWatch); _audioReadyWatch = null;
      }
    }, 500);
  }
  /* 跳过：收遮罩、开始看题；音频继续在后台下（preload=auto 已挂着），
     就绪后顶栏音频条照常可点播放（audioToggle 首播会补收遮罩）。 */
  function skipAudioGate(){
    var a = document.getElementById('exAudio');
    if(a){ try{ a.preload = 'auto'; a.load(); }catch(e){} }
    hideAudioGate();
    if(EX && EX.audioGateDone) EX.audioGateDone[EX.curP] = true;
  }
  /* Part 行内标签文案（音频条行首胶囊）：听力口径「Part N · Questions X–Y」（她 10/13 截图 1 口径） */
  function partChipText(){
    var u = EX && EX.unit, parts = (u && u.parts) || [];
    var nums = [];
    parts.forEach(function(pp){ (pp.groups || []).forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); }); });
    var lbl = (parts[0] && parts[0].partNum) || (u && u.partNum) || 'Part 1';
    return nums.length ? (lbl + ' · Questions ' + nums[0] + '\u2013' + nums[nums.length - 1]) : lbl;
  }
  function paintAudio(){
    var a = document.getElementById('exAudio'); if(!a) return;
    var lbl = document.getElementById('eaLabel');
    if(lbl) lbl.hidden = a.paused;
    var playing = !a.paused && !a.ended;
    var bar = document.getElementById('exAudioBar');
    if(bar) bar.classList.toggle('playing', playing);
    /* 🔵 10-23 3-1：练习模式的进度条 / 时间 / 播放键三态（考试模式这些节点根本不存在，判空跳过）。
       进度用 <audio> 自己的 currentTime/duration，不另存状态；拖动时临时用 _seekDrag 冻住，
       否则 timeupdate 会把手指正拖的位置抢回去。 */
    var play = bar && bar.querySelector('.ea-play');
    if(play){
      play.classList.toggle('playing', playing);
      play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      play.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    }
    var fill = document.getElementById('eaFill');
    var knob = document.getElementById('eaKnob');
    var tm = document.getElementById('eaTime');
    var seekBar = document.getElementById('eaBar');
    var dur = isFinite(a.duration) ? a.duration : 0;
    var cur = isFinite(a.currentTime) ? a.currentTime : 0;
    var pct = dur > 0 ? Math.max(0, Math.min(100, cur / dur * 100)) : 0;
    if(!_seekDrag){
      if(fill) fill.style.width = pct + '%';
      if(knob) knob.style.left = pct + '%';
    }
    if(tm) tm.textContent = fmtClock(cur) + ' / ' + fmtClock(dur);
    if(seekBar){
      seekBar.setAttribute('aria-valuenow', String(Math.round(pct)));
      seekBar.setAttribute('aria-valuetext', fmtClock(cur) + ' / ' + fmtClock(dur));
    }
  }
  /* 拖动中标记（paintAudio 读它决定要不要覆盖进度） */
  var _seekDrag = false;
  /* 🔴 10/16 她报「听力音频播放不了」→ 本地/线上都复现不出（音频 200、duration 正常、无报错），
     她那边是 00:00 / 00:00 + 进度条塌成小点 = 元数据没加载（旧缓存版布局也印证）。
     不管根因是缓存还是网络/插件拦截，**失败必须是可见且可自救的**：在音频条上给提示 + 一键重试。 */
  /* 音频失败原因文案（10/20 升级：她那边所有听力都没声音，但 CDN 实测 200/8.5MB/CORS 全通
     → 根因只可能在她本机浏览器（插件拦截 / 网络 / 旧缓存）。既然远程复现不了，就把
     「到底哪种失败」直接显示在音频条上，她不用开 F12 也能回贴给我。 */
  var AUDIO_ERR_WHY = {
    1: 'Loading aborted',
    2: 'Network error (request never reached the server — usually an ad blocker, VPN or firewall)',
    3: 'Decode error (file reached the browser but could not be decoded)',
    4: 'Source not supported (the URL is empty or not an audio file)'
  };
  function audioErrText(a){
    var code = a && a.error ? a.error.code : 0;
    var why = AUDIO_ERR_WHY[code] || 'Unknown error';
    var src = '';
    try{ src = (a && a.currentSrc || (a && a.src)) || ''; }catch(e){}
    if(src) src = src.length > 60 ? src.slice(0, 30) + '…' + src.slice(-24) : src;
    return 'Audio failed to load (' + why + ')' + (src ? ' · ' + src : '') + ' — tap to retry';
  }
  function showAudioErr(a){
    var bar = document.getElementById('exAudioBar'); if(!bar) return;
    if(bar.querySelector('.ea-err')) return;
    var e = document.createElement('button');
    e.type = 'button'; e.className = 'ea-err';
    e.textContent = audioErrText(a);
    e.addEventListener('click', function(){
      e.remove();
      try{ a.load(); }catch(err){}
      if(EX && EX.listenMode !== 'exam'){ try{ a.play(); }catch(err){} }
      /* 重试后再给一次兜底提示（6 秒还没起来就再报一次） */
      setTimeout(function(){
        var cur = document.getElementById('exAudio');
        if(cur && cur === a && !(cur.duration > 0) && !cur.error) showAudioErr(a);
      }, 6000);
    });
    bar.appendChild(e);
  }
  function wireAudio(){
    var a = document.getElementById('exAudio');
    if(!a || a === _audioBound) return;                  /* 记住绑过哪个元素，别重复绑 */
    _audioBound = a;
    /* 音量：套用上次的值（模块加载时已回读） */
    a.volume = _audioVol;
    a.playbackRate = _audioRate;   /* 10/20：倍速改成 _audioRate（0.8–1.5），旧 _rateIx 路径退役 */
    var sel = document.getElementById('eaRate');
    if(sel) sel.value = String(_audioRate);
    a.addEventListener('loadedmetadata', function(){ paintAudio(); paintAudioGate(); });
    a.addEventListener('timeupdate', paintAudio);
    a.addEventListener('progress', function(){ paintAudioGate(); });
    a.addEventListener('canplay', function(){ paintAudioGate(); });
    /* 🔴 10/16 她报「听力音频播放不了」：先在本地/线上复现——都正常（duration 正常、无报错），
       她那边时间停在 00:00 / 00:00 + 进度条塌成一个小圆点 = **元数据没加载**（旧缓存版本）。
       不管她那边是缓存还是网络/插件拦截，现在的失败形态是**完全静默**的（只有 00:00/00:00，
       谁也看不出原因）→ 加自解释：加载失败时在音频条上给明确提示 + 一键重试（reload）。 */
    a.addEventListener('error', function(){ showAudioErr(a); });
    /* 6 秒兜底：既没 error 也没 metadata（请求挂起/被拦）= 同样静默 → 也给提示 */
    setTimeout(function(){
      var cur = document.getElementById('exAudio');
      if(cur && cur === a && !(cur.duration > 0) && !cur.error) showAudioErr(a);
    }, 6000);
    a.addEventListener('play', function(){
      if(EX){
        /* 听力完整模考：按 Part 记「这部分的音频已播过」→ 切走再切回来不许重播（整场只播一遍） */
        if(EX.full && EX.channel === 'listening'){
          EX.audioStartedBy = EX.audioStartedBy || {};
          EX.audioStartedBy[EX.curP] = true;
        }
        EX.audioStarted = true; lockAudioMode(); paintAudio();
      }
    });
    a.addEventListener('pause', paintAudio);
    /* 10-24 7-3：单句遍数续播 —— 播放自然结束后补下一遍。
       只在「复盘态 + 还有遍数 + 还是起点那一句」时续；任何一条不满足就清状态。
       ⚠️ 不在这里判断是否交卷之外的场景：遍数只在复盘态选过一次才非 1。 */
    a.addEventListener('ended', function(){
      paintAudio();
      if(_repeatLeft > 0 && _repeatFrom != null && EX && EX.submitted && EX.channel === 'listening'){
        var rows = document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line');
        var el = rows && rows.length ? rows[parseInt(_repeatFrom, 10)] : null;
        if(el){
          var st = parseFloat(el.getAttribute('data-t'));
          if(isFinite(st)){
            try{ a.currentTime = st; }catch(e){}
            _repeatLeft--;
            try{ a.play(); }catch(e){}
            return;
          }
        }
      }
      _repeatLeft = 0; _repeatFrom = null;
    });
    /* 🔵 10-23 3-1：进度条拖动（练习模式）
       点击已经在事件委托里走 audioSeek；这里补「按住拖动」——
       pointerdown 起拖 → pointermove 实时改 currentTime → pointerup 结束。
       ⚠️ 用 pointer 事件而不是 mouse：触屏 / 手写笔一起覆盖，一套代码。
       ⚠️ setPointerCapture：手指拖出条外也要继续跟手，否则一动出条就断。 */
    var seekBar = document.getElementById('eaBar');
    if(seekBar && seekBar !== seekBar.__seekBound){
      seekBar.__seekBound = seekBar;
      var _seekTo = function(ev){
        var a2 = document.getElementById('exAudio');
        if(!a2 || !EX || !a2.duration) return;
        if(EX.listenMode === 'exam' && !EX.submitted) return;
        var r = seekBar.getBoundingClientRect();
        var pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        a2.currentTime = pct * a2.duration;
        var f = document.getElementById('eaFill'), k = document.getElementById('eaKnob');
        if(f) f.style.width = (pct * 100) + '%';
        if(k) k.style.left = (pct * 100) + '%';
      };
      seekBar.addEventListener('pointerdown', function(ev){
        if(EX && EX.listenMode === 'exam' && !EX.submitted) return;
        _seekDrag = true;
        try{ seekBar.setPointerCapture(ev.pointerId); }catch(e){}
        _seekTo(ev);
        ev.preventDefault();
      });
      seekBar.addEventListener('pointermove', function(ev){
        if(!_seekDrag) return;
        _seekTo(ev);
      });
      var _endDrag = function(ev){
        if(!_seekDrag) return;
        _seekDrag = false;
        try{ seekBar.releasePointerCapture(ev.pointerId); }catch(e){}
        paintAudio();
      };
      seekBar.addEventListener('pointerup', _endDrag);
      seekBar.addEventListener('pointercancel', _endDrag);
      /* 键盘：左右箭头 ±5 秒（进度条 tabindex=0，能 Tab 到才谈得上可访问） */
      seekBar.addEventListener('keydown', function(ev){
        if(ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        var a3 = document.getElementById('exAudio');
        if(!a3 || !a3.duration) return;
        if(EX && EX.listenMode === 'exam' && !EX.submitted) return;
        ev.preventDefault();
        a3.currentTime = Math.max(0, Math.min(a3.duration, a3.currentTime + (ev.key === 'ArrowLeft' ? -5 : 5)));
        paintAudio();
      });
    }
    paintAudio();
  }
  function lockAudioMode(){
    var b = document.querySelector('#exAudioBar [data-amode]');
    if(b && EX && EX.audioStarted && b.textContent !== 'Submitted'){ b.disabled = true; b.title = 'Playback has started; the mode cannot be changed'; }
  }
  function audioToggle(){
    var a = document.getElementById('exAudio'); if(!a || !EX) return;
    if(a.paused){
      /* 🔴 10-22 官方口径：第一次点 Play 就收掉整页遮罩（官方遮罩出现一次即不再来）。
         记在 EX.audioGateDone[curP] 上：完整模考切 Part 回来不重出。 */
      if(EX.audioGateDone) EX.audioGateDone[EX.curP] = true;
      hideAudioGate();
      a.play();
    }
    else if(EX.listenMode !== 'exam') a.pause();          /* 考试模式：不给暂停 */
  }
  function audioSeek(e){
    var a = document.getElementById('exAudio'); if(!a || !EX) return;
    if(EX.listenMode === 'exam' && !EX.submitted) return;/* 考试模式：不给拖动（交卷后解锁） */
    var bar = document.getElementById('eaBar'); if(!bar || !a.duration) return;
    var r = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    a.currentTime = pct * a.duration;
    /* 10-24 7-3：手动拖了进度条 = 明确不想被「连播 N 遍」纠缠 → 作废续播 */
    _repeatLeft = 0; _repeatFrom = null;
    /* 拖动即时反馈（不等 timeupdate，手感才跟得上） */
    var fill = document.getElementById('eaFill'), knob = document.getElementById('eaKnob');
    if(fill) fill.style.width = (pct * 100) + '%';
    if(knob) knob.style.left = (pct * 100) + '%';
  }
  function audioSetMode(exam){
    EX.listenMode = exam ? 'exam' : 'practice';
    var bar = document.getElementById('exAudioBar'); if(!bar) return;
    bar.classList.toggle('locked', !!exam);
    var b = bar.querySelector('[data-amode]');
    if(b){ b.classList.toggle('exam', !!exam); b.textContent = exam ? 'Exam mode' : 'Practice mode'; }
    var rt = bar.querySelector('[data-arate]');
    if(rt) rt.style.display = exam ? 'none' : '';
    /* 🔵 10-23 3-1：练习/考试切换后播放控制组的显隐完全由 `.locked` 这个类决定
       （CSS：`.ex-audio.locked .ea-play/.ea-bar/.ea-time/.ea-rate{display:none}`）——
       所以这里不用重建 DOM、不用重绑监听，切回练习模式倍速和进度条就自己回来。
       ⚠️ 早先写成「exam 分支干脆不渲染这些节点」，那样切模式就回不来了（本次已改成恒渲染 + 按类隐藏）。 */
    try{ localStorage.setItem('hub_bank_lmode', exam ? 'exam' : 'practice'); }catch(e){}
  }
  function audioToggleMode(){
    if(!EX || EX.audioStarted) return;                   /* 已经开始播 → 锁死 */
    if(EX.full) return;                                  /* 听力完整模考全程考试模式，不提供切换（按钮也不渲染） */
    audioSetMode(EX.listenMode !== 'exam');
  }
  /* 交卷后：听力原文出来 + 音频解锁（可自由回放/拖动复听 —— Zoju / PrepAsk 都是交卷后解锁）
     🔵 10-23 3-4：原文按「句子时间轴」渲染成可点句子条 —— 点哪句跳哪句、播放时当前句高亮、
     自动滚到可见区。没有时间轴的篇目（bank/timeline/<unitId>.json 不存在）就退回原来的
     整段 HTML（一句一行、不可点），行为与这次改动之前一模一样。 */
  function showScript(){
    var inner = document.getElementById('exListenIn'); if(!inner) return;
    if(!inner.querySelector('.ex-script')){
      var html = '';
      ((EX && EX.unit && EX.unit.parts) || []).forEach(function(p){ html += clean(p.article || ''); });
      if(html){
        var d = document.createElement('details');
        d.className = 'ex-script'; d.open = true;
        d.innerHTML = '<summary>Script</summary><div class="sc-body">' + html + '</div>';   /* 🔴 10/16：原「听力原文 Script」= 考场内中文 */
        inner.insertBefore(d, inner.firstChild);
      }
    }
    audioSetMode(false);
    /* 10-24 7-3：复盘态必须能直接听 —— 交卷后「点 Play 才进」那层音频遮罩要撤掉。
       此前只有切篇/换 Part 的两条路径（2251 / 2470）撤过它，**直接交卷这条路径从来没撤**
       → 她交完卷看到的是一块黑底遮罩挡在最上面，「显示原文」按钮被它盖住点不到。 */
    hideAudioGate();
    var bar = document.getElementById('exAudioBar');
    if(bar){
      var b = bar.querySelector('[data-amode]');
      if(b){ b.disabled = true; b.classList.remove('exam'); b.textContent = 'Submitted'; }
      /* 3-2（7-2 核心三条之一、二）：交卷后仍然可播、可拖、可调倍速 —— 精听就是在复盘页发生的。
         原来 audioSetMode(false) 已经把 .locked 摘掉（播放控制组回来），这里只补两件事：
         ① 音频条加 .review 标记（CSS 让它在复盘区固定显眼）
         ② 确保倍速 select 不被禁用（曾经 exam 模式把它 display:none，切回练习后要显式复原） */
      bar.classList.add('review');
      var rt2 = bar.querySelector('.ea-rate');
      if(rt2){ rt2.style.display = ''; rt2.disabled = false; }
      /* 10-24 7-3：复盘态才让「显示/收起原文」两个按钮现身。
         未揭开过 → 显示「显示原文」（data-screveal）亮着；揭开过 → 亮「收起」。
         audioBarHtml 里两个按钮都带 hidden，这里按状态显。 */
      var bRev = bar.querySelector('[data-screveal]');
      var bHid = bar.querySelector('[data-schide]');
      if(bRev) bRev.hidden = blindRevealed();
      if(bHid) bHid.hidden = !blindRevealed();
      /* 若这次是「收起」状态（mountBlindCover 之前就挂了遮罩），两个按钮要跟着当前状态 */
      var inner0 = document.getElementById('exListenIn');
      if(inner0 && inner0.hasAttribute('data-blind')) setBlindBtns(true);
    }
    /* 10-24 7-3：盲听优先遮罩 —— 只在「没揭开过」时挂，且只挂在有时间轴的篇
       （没时间轴仍是整段 <p>，遮罩没有意义：那里本来就没有逐句回听）。 */
    mountBlindCover();
    /* 10-25 7-4a：模式切换先挂出来（句子条 fetch 回来后 render 会再算一次进度） */
    mountIntensive();
    /* 3-4：时间轴到了就把原文换成可点句子条 */
    mountScriptTimeline();
  }

  /* ===== 10-24 7-3 · 盲听优先遮罩 =====
     形态：原文区被一层卡片挡住，中间一个大按钮「点击显示原文」。
     口径：① 只在复盘态第一次进这篇时挡（揭开过一次 → 记住，跨刷新不再挡）
          ② 遮罩期间音频条照常可用（可以整段播 —— 遮的是字不是声）
          ③ 揭开后可以随时「收起原文，回到盲听」再听一遍 */
  /* 只管「按当前 data-blind 属性画卡片」—— 决策（要不要挡）不在这里，
     这样「收起」走的是同一条渲染路径，不会出现「属性设了但卡片没画出来」的半截状态。 */
  function renderBlindCard(){
    var inner = document.getElementById('exListenIn'); if(!inner) return;
    var old = inner.querySelector('.sc-blind');
    if(old) old.remove();
    if(!inner.hasAttribute('data-blind')) return;
    var d = document.createElement('div');
    d.className = 'sc-blind';
    d.innerHTML = '<button class="sc-blind-btn" type="button" data-screveal>'
      + icoEye() + '<span>点击显示原文</span></button>'
      + '<p class="sc-blind-tip">先听一遍，不看字。听完再点开原文，对着刚没听清的地方逐句回听。</p>'
      + '<p class="sc-blind-tip2" id="scBlindTip2"></p>';
    inner.appendChild(d);
  }
  function mountBlindCover(){
    var inner = document.getElementById('exListenIn'); if(!inner) return;
    /* 已经手动收起过 → 尊重当前状态，不要再按「揭开过」把它翻回来 */
    if(inner.hasAttribute('data-blind')){ renderBlindCard(); return; }
    /* 揭开过 → 不挡；没有句子条 → 不挡（整段原文，遮了没意义） */
    if(blindRevealed()){ inner.removeAttribute('data-blind'); renderBlindCard(); return; }
    if(!inner.querySelector('.ex-script .sc-body.sc-tl')) return;
    inner.setAttribute('data-blind', '1');
    renderBlindCard();
    setBlindBtns(true);
  }

  /* ===== 10-25 7-4a · 精听面板（模式切换 + 三卡）=====
     形态：原文区上方一条分段控件「连续播放 / 标记式精听」；切到标记式才展开三卡。
     口径：
       ① 只在「听力 + 已交卷 + 有句子条」时出现（没时间轴的篇没有逐句，不给空壳）
       ② 默认连续播放（7-3 那套），切过一次记在本机
       ③ 三卡 = 听懂 / 模糊 / 茫然；选完立刻记 + 自动跳下一句（一轮一句）
       ④ 快捷键 1 / 2 / 3（见下方 keydown；输入框内不抢） */
  function mountIntensive(){
    var inner = document.getElementById('exListenIn'); if(!inner) return;
    if(!EX || EX.channel !== 'listening' || !EX.submitted) return;
    if(!inner.querySelector('.ex-script .sc-body.sc-tl')) return;
    var sw = inner.querySelector(':scope > .sc-int');
    if(!sw){
      sw = document.createElement('div');
      sw.className = 'sc-int';
      inner.insertBefore(sw, inner.querySelector('.ex-script'));
    }
    var mark = (_intMode === 'mark');
    var total = (document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line') || []).length;
    sw.innerHTML =
        '<div class="sc-int-sw" role="group" aria-label="复盘模式">'
      +   '<button type="button" class="sc-int-b' + (mark ? '' : ' on') + '" data-intmode="cont">连续播放</button>'
      +   '<button type="button" class="sc-int-b' + (mark ? ' on' : '') + '" data-intmode="mark">标记式精听</button>'
      + '</div>'
      + (mark
        ? '<div class="sc-markbar">'
        +   '<div class="sc-mk-prog"><b id="scMkNow">' + Math.min(_mkIdx + 1, Math.max(total, 1)) + '</b> / ' + total + ' 句</div>'
        +   '<div class="sc-mk-cards" role="group" aria-label="理解度">'
        +     '<button type="button" class="sc-card ok" data-mark="ok"><span class="sc-card-lb">听懂</span><span class="sc-card-sub">快捷键 1</span></button>'
        +     '<button type="button" class="sc-card mid" data-mark="mid"><span class="sc-card-lb">模糊</span><span class="sc-card-sub">快捷键 2</span></button>'
        +     '<button type="button" class="sc-card no" data-mark="no"><span class="sc-card-lb">茫然</span><span class="sc-card-sub">快捷键 3</span></button>'
        +   '</div>'
        +   '<p class="sc-mk-tip">听一句 → 选一档 → 自动跳下一句。走完一遍再回头看标出来的句子。'
        +     '<button type="button" class="sc-mk-rpt" data-mkreport="1">看报告 →</button></p>'
        + '</div>'
        : '');
    /* 「已标记 N 句」：与 7-3 的「已收藏 N 句」并排挂在原文区底部 */
    var box = inner.querySelector('.ex-script .sc-body.sc-tl');
    if(box && !box.querySelector('#scMarkCount')){
      var c = document.createElement('p');
      c.className = 'sc-mark-count'; c.id = 'scMarkCount'; c.hidden = true;
      box.appendChild(c);
    }
    paintMarks();
  }

  /* ===== 3-4 复盘句子条 =====
     数据：bank/timeline/<unitId>.json（3-3 定的格式：{lines:[{i,start,end,text}]}）
     口径：
       ① 只在「听力 + 已交卷」时有；没时间轴就静默不接（不报错、不提示、不显示空壳）
       ② 点一句 = 音频跳到这句开头并播放；播放中当前句高亮
       ③ 高亮变化时若该句不在可视区，平滑滚进去（只在 .sc-body 里滚，不带动整页）
       ④ 当前句判定：start <= t < 下一句 start。句间空档（官方报幕/看题时间）保留上一句高亮，
          不清空 —— 否则播到报幕处句子条会闪一下没有当前句 */
  var _stLines = null, _stBound = null;
  /* 10-24 7-3：单句遍数的续播状态。_repeatFrom = 从哪句开始（data-i），
     _repeatLeft = 还要补播几遍；中途点了别的句子或拖了进度条就清掉。 */
  var _repeatLeft = 0, _repeatFrom = null;
  function starred(i){ return isStarred(i); }
  function scriptTimelineUrl(unitId){
    return 'bank/timeline/' + unitId + '.json';
  }
  function mountScriptTimeline(){
    if(!EX || EX.channel !== 'listening' || !EX.submitted) return;
    var box = document.querySelector('#examRoot .ex-script .sc-body'); if(!box) return;
    var a = document.getElementById('exAudio'); if(!a) return;
    var unitId = EX.ids ? EX.ids[EX.curP || 0] : (EX.unit && EX.unit.id);
    if(!unitId) return;

    var paint = function(){
      if(!_stLines || !_stLines.length) return;
      var t = a.currentTime || 0;
      var idx = -1;
      for(var i = 0; i < _stLines.length; i++){
        if(t >= _stLines[i].start) idx = i; else break;
      }
      if(idx < 0) idx = 0;
      var rows = box.querySelectorAll('.sc-line');
      if(!rows.length) return;
      var changed = false;
      rows.forEach(function(el, i){
        var on = (i === idx);
        if(el.classList.contains('on') !== on){ el.classList.toggle('on', on); changed = true; }
        /* 3-2：播到答案句时额外加 .hit（更醒目的底 + 徽章点亮）；只在这一句时成立 */
        el.classList.toggle('hit', on && el.classList.contains('sc-ans'));
        if(on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
      });
      /* 10-25 7-4a：播放中的当前句 = 精听走到第几句（三卡是对「当前句」打分） */
      if(_stLines && _stLines.length && idx >= 0){
        _mkIdx = idx;
        var now = document.getElementById('scMkNow');
        if(now) now.textContent = String(idx + 1);
      }
      if(changed && EX._stFollow !== false){
        var cur = rows[idx];
        /* 只在句子滚出可视区时才滚（否则每句都滚，正在看上面几句会被强行拖走） */
        var bh = box.getBoundingClientRect(), rh = cur.getBoundingClientRect();
        if(rh.top < bh.top + 6 || rh.bottom > bh.bottom - 6){
          try{ cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          catch(e){ cur.scrollIntoView(false); }
        }
      }
    };

    var render = function(lines){
      _stLines = lines;
      box.classList.add('sc-tl');
      /* 3-2（7-2 核心三条之三）：答案句高亮。
         answerQ / answerText 由 bank/timeline/*.json 预先标注（答案取自 bank/answers/*.json，
         按「答案串出现在该句里」反查，只加字段、没改任何时间与原文）。
         行首挂 Q 徽章；音频播到该句时整行加 .hit。 */
      box.innerHTML = lines.map(function(l, i){
        var qs = (l.answerQ && l.answerQ.length) ? l.answerQ : null;
        var badge = qs ? '<i class="sc-q" title="第 ' + qs.join(' / ') + ' 题答案句">Q' + qs.join('·Q') + '</i>' : '<i class="sc-q sc-q--none" aria-hidden="true"></i>';
        var mk = (marksOf()[i] && MK_TX[marksOf()[i]]) ? marksOf()[i] : '';
        return '<p class="sc-line' + (qs ? ' sc-ans' : '') + (mk ? ' mk-' + mk : '') + '" data-i="' + i + '" data-t="' + l.start + '"'
             + (qs ? ' data-q="' + qs.join(',') + '"' : '') + '>'
             + '<i class="sc-t">' + fmtClock(l.start) + '</i>'
             + (mk ? '<i class="sc-mk ' + mk + '">' + MK_TX[mk] + '</i>' : '')
             + badge
             + '<span class="sc-tx">' + esc(l.text || '') + '</span>'
             /* 10-24 7-3：每句收藏星 —— 只读态也能点（点星不触发跳播，见下面 stopPropagation） */
             + '<button class="sc-star" type="button" data-star="' + i + '" aria-pressed="' + (starred(i) ? 'true' : 'false') + '"'
             +   ' title="' + (starred(i) ? '取消收藏' : '收藏这句') + '" aria-label="' + (starred(i) ? '取消收藏' : '收藏这句') + '">' + icoStar() + '</button>'
             + '</p>';
      }).join('');
      /* 事件：点句子 → 跳到这句开头并播（复听场景，点就是想听这句） */
      if(_stBound !== box){
        _stBound = box;
        box.addEventListener('click', function(ev){
          /* 10-24 7-3：点星 = 只收藏，不跳播（点它是为了记住这句，不是想听这句） */
          var starBtn = ev.target.closest && ev.target.closest('[data-star]');
          if(starBtn){
            ev.stopPropagation();
            var si = parseInt(starBtn.getAttribute('data-star'), 10);
            if(!isFinite(si)) return;
            var now = toggleStar(si);
            starBtn.setAttribute('aria-pressed', now ? 'true' : 'false');
            starBtn.setAttribute('title', now ? '取消收藏' : '收藏这句');
            starBtn.setAttribute('aria-label', now ? '取消收藏' : '收藏这句');
            return;
          }
          var el = ev.target.closest && ev.target.closest('.sc-line'); if(!el) return;
          var st = parseFloat(el.getAttribute('data-t'));
          if(!isFinite(st)) return;
          try{ a.currentTime = st; }catch(e){}
          /* 10-24 7-3：单句遍数 > 1 时这句要连播 N 遍 —— 用 ended 事件续播，不轮询。
             ⚠️ 只记「从哪句开始 + 还要播几遍」；中途手点别的句子/拖进度条就作废。 */
          if(_audioRepeat > 1){
            _repeatLeft = _audioRepeat - 1;
            _repeatFrom = el.getAttribute('data-i');
          } else {
            _repeatLeft = 0; _repeatFrom = null;
          }
          try{ a.play(); }catch(e){}
          paint();
        });
      }
      /* 10-24 7-3：「已收藏 N 句」挂在句子条后面（换篇会跟着重算，因为 render 会重建 innerHTML） */
      var cnt = document.getElementById('scStarCount');
      if(!cnt){
        cnt = document.createElement('p');
        cnt.className = 'sc-star-count';
        cnt.id = 'scStarCount';
        box.appendChild(cnt);
      }
      paintStarCount();
      /* 10-24 7-3：句子条是异步 fetch 回来才有的 —— 遮罩要等它就位再挂，
         否则 showScript 那次调用会因找不到 .sc-tl 而静默跳过（她就不会看到盲听层）。 */
      mountBlindCover();
      /* 10-25 7-4a：同理，模式切换 + 三卡也要等句子条就位（没句子条就没有「逐句」可言） */
      mountIntensive();
      paint();
    };

    if(_stLines){ render(_stLines); return; }
    fetch(scriptTimelineUrl(unitId), { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; })
      .then(function(j){
        var lines = j && j.lines;
        if(!lines || !lines.length) return;      /* 没时间轴 → 什么都不做，保持原整段原文 */
        render(lines);
      });

    /* 播放/跳转时刷高亮（每 250ms 一次：timeupdate 在 seek 后不一定立刻触发，且 250ms 对高亮足够细） */
    if(!a.__stTick){
      a.__stTick = setInterval(function(){
        if(!document.getElementById('examRoot')) { clearInterval(a.__stTick); a.__stTick = null; return; }
        if(_stLines) paint();
      }, 250);
    }
  }

  /* Part 横幅（样子稿 104）：一行淡绿，Part 名 + 题号范围；阅读附 20 分钟说明，
     听力不附（她截图 1 口径：听力只有「Part 4 / Questions 31-40」）。完整模考切篇时更新内容。 */
  function partBannerHtml(label, from, to, withTime){
    var span = (from != null && to != null)
      ? (withTime ? ' \u00b7 You should spend about 20 minutes on Questions ' + from + '\u2013' + to
                  : ' \u00b7 Questions ' + from + '\u2013' + to)
      : '';
    return '<div class="ex-part" id="exPartBanner"><b>' + esc(label) + '</b><span>' + esc(span) + '</span></div>';
  }
  function updatePartBanner(label, from, to, withTime){
    /* withTime=false = 听力口径「Part N · Questions X–Y」（她截图 1：听力不附 20 分钟说明）；
       缺省/true = 阅读口径（阅读完整模考切篇沿用原文案，行为不变）。 */
    var el = document.getElementById('exPartBanner'); if(!el) return;
    var span = (from != null)
      ? (withTime === false ? ' \u00b7 Questions ' + from + '\u2013' + to
                            : ' \u00b7 You should spend about 20 minutes on Questions ' + from + '\u2013' + to)
      : '';
    el.innerHTML = '<b>' + esc(label) + '</b><span>' + esc(span) + '</span>';
  }

  /* 渲染后统一同步：填空三态（草稿值→filled）、多选限数灰、旗子态 */
  function syncExamStates(){
    var root = document.getElementById('examRoot'); if(!root) return;
    root.querySelectorAll('.ex-blankw').forEach(function(w){
      var i = w.querySelector('input');
      if(i) w.classList.toggle('filled', !!i.value);
    });
    root.querySelectorAll('.ex-cbox').forEach(syncCboxDis);
    if(EX && EX.flagged){
      root.querySelectorAll('.ex-flagq').forEach(function(b){
        b.classList.toggle('on', !!EX.flagged[b.getAttribute('data-qn')]);
      });
    }
  }

  function renderExam(){
    var host = document.getElementById('examRoot'); if(!host || !EX) return;
    var u = EX.unit, parts = u.parts || [], groups = [];
    parts.forEach(function(p){ (p.groups || []).forEach(function(g){ groups.push(g); }); });
    EX.groups = groups;
    EX.flagged = EX.flagged || {};
    EX.audioGateDone = EX.audioGateDone || {};   /* 🔴 10-22 官方口径：听力遮罩「只出一次」记忆表 */
    if(EX.listenMode !== 'exam') EX.listenMode = 'practice';
    if(!EX.cur) EX.cur = 1;

    var nums = [];
    groups.forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); });
    EX.total = nums.length;
    if(EX.cur == null && nums.length) EX.cur = Number(nums[0]);

    var isListen = EX.channel === 'listening';

    if(isListen){
      /* 听力：窄顶栏（音频控制并入）+ Part 胶囊并入音频条行首 + 单栏题目（听力没有独立文章区，不做左右分栏）。
         Highlight/Note 菜单依赖 #exArt，听力没有 → 不渲染，避免出现点不动的入口。
         10/13 她报「上面三行缩两行」→ 原独立 Part 横幅（.ex-part）撤销，信息并入音频条。 */
      /* 10/14 她拍板：两行并一行省空间——不渲染独立标题行，标题+计时并入音频条（见 audioBarHtml 第三参） */
      host.classList.add('ex-listen-on');   /* 10/14：CSS 靠这个类把标题行压掉，只留音频条一行 */
      host.innerHTML = shellHtml(u.title, '', '')
        + audioBarHtml(partChipText(), u.title, '00:30:00')
        + '<div class="ex-listen" id="exListen"><div class="ex-listen-in" id="exListenIn">'
        + groups.map(function(g, i){ return groupHtml(g, i, null, 'listening'); }).join('')
        + '</div></div>'
        + barHtml();
      /* 10/14 她拍板：两行并一行省空间 → 标题行藏掉。
         🔴 10/18 修这里留下的漏洞：顶栏整行 display:none 之后，**住在顶栏里的东西一起消失**——
            整场倒计时（#exTimer）、☰ Option（字号/配色从这里进）、以及本批新加的全屏/隐藏计时，
            在听力答题页全部不可达；10/16 又把 #eaFullTimer 从音频条撤走，
            结果是听力考场连倒计时都看不见（探针实测：页面上没有任何可见的 mm:ss）。
         修法 = 仍是「一行」，但把「倒计时 + 工具组」搬进音频条那一行（见 mountListenTools）。
         ⚠️ 用 style.display 而非 class：examRoot 的 class 会被后续 render 重建清掉（实测踩过）。 */
      mountListenTools(host);
    } else {
      var artHtml = '';
      parts.forEach(function(p){ artHtml += clean(p.article || ''); });
      host.innerHTML = shellHtml(u.title, '', '01:00:00')
        + partBannerHtml((parts[0] && parts[0].partNum) || u.partNum || 'Part 1', nums.length ? nums[0] : null, nums.length ? nums[nums.length - 1] : null)
        + splitHtml(artHtml, groups.map(function(g, i){ return groupHtml(g, i, null, 'reading'); }).join(''))
        + barHtml() + ctxHtml();
    }

    /* 10/16：heading 题的原文段落槽（她 18:16 口径）——须早于 applyAnswer，草稿恢复才找得到槽 */
    if(!isListen) headSlotsInto();
    Object.keys(EX.user || {}).forEach(function(qn){ applyAnswer(qn, EX.user[qn]); });
    syncExamStates();
    paintSheet();
    if(EX.scored === false) showNoAnsBanner();
    if(isListen){ wireAudio(); mountListenTools(); watchAudioReady(); }
    else { renderNotes(); replayMarks(); }
    wireOptionPanel();   /* 10/14 Option 面板交互（Colour/Size/Audio 分组点击） */
    wireExamTools();     /* 10/18 顶栏工具栏：全屏（眼睛标 10/20 删除） */
    reportExamState(true);   /* 10/15 告诉 SW：我在考试中，别刷我 */
    if(EX.submitted){ if(isListen){ showScript(); decoratePassage(EX.curP); hideAudioGate(); } }
    /* 🔴 10/20 她 ⑤：听力单篇不显示计时（音频长短不一，30 分钟倒计时对单篇没意义），
       只有「完整模考」才开倒计时（line 1500 / line 1435 那两处）。这里不再起表，
       顺带顶栏计时小徽章也不显示 —— 单篇页面整个不出现时间数字。 */
    if(!isListen) startTimer(60 * 60);
    if(!isListen) startFtMini();                     /* 10/13：顶栏计时小徽章（考场内替代全站 floatTimer） */
  }

  /* ===== 完整模考（3 篇一套 · 40 题 / 60 分钟 · 随机组卷）=====
     卷面题号 1–40 连续：P1 → 1..N1，P2 → N1+1.. ，P3 → …
     内部按 (篇, 篇内题号) 映射回各篇自己的 unit + 答案文件；答案统一存在 EX.user（键 = 卷面题号）。 */
  function loadPack(channel, unitId){
    var p1 = fetch('bank/' + channel + '/' + unitId + '.json', { cache: 'no-cache' })
              .then(function(r){ if(!r.ok) throw new Error('unit ' + r.status); return r.json(); });
    var p2 = fetch('bank/answers/' + unitId + '.json', { cache: 'no-cache' })
              .then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; });
    return Promise.all([p1, p2]).then(function(res){
      var a = res[1] || {};
      annotateGroups(res[0], a.answers || {});   /* 10/16：组级答案标注（完整模考同路） */
      return { id: unitId, unit: res[0], answers: a.answers || {}, alts: a.alts || {} };
    });
  }

  /* EXAM-E2P（10-26）：ids → picks 还原（「重做一遍」要用）。
     按 id 在 unitsOf(channel) 里找 unit；**任一篇找不到就整组返回 null**，
     绝不「跳过继续」—— 三篇少一篇 = 卷子题数不是 40，判分分母就错，
     会给出系统性偏低的假分数（HANDOFF §三 那条判分红线）。调用方拿到 null 自行降级。 */
  function picksFromIds(channel, ids){
    if(!Array.isArray(ids) || !ids.length) return null;
    var all = unitsOf(channel) || [];
    var map = {}; all.forEach(function(u){ if(u && u.id) map[u.id] = u; });
    var out = ids.map(function(id){ return map[id]; });
    if(out.some(function(x){ return !x; })) return null;
    return out;
  }
  /* EXAM-E2P（10-26）：整卷入口加可选参数 —— 传了就按这三篇开，不传还是老行为（现抽）。
     🔴 examGuideGate 的回调**必须把 fixedPicks 原样传下去**：她第一次点「重做」会先弹考前指南，
        看完指南若把参数丢了，卷子就变成随机的新题 —— 她以为在重做原题，其实分数不可比（本质是骗人）。 */
  function openFullTest(fixedPicks){
    if(!guidePassed('reading')){ examGuideGate('reading', function(){ openFullTest(fixedPicks); }); return; }
    /* 纯随机组卷（她 10/12「不用提前写好题目在那」）：点 Start 这一刻才抽篇，每次都不一样 */
    var picks = fixedPicks || composeFullTest();
    if(!picks) return;
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    /* B-1a：完整模考也走四态（noCancel：已点 Start；失败可重试 = 重新抽篇组卷） */
    if(host){
      host.hidden = false;
      fetchWithStates(host, 'Test', 'bank/reading/' + picks[0].id + '.json', function(box){
        startFullTest(picks);
      }, { noCancel: true });
      return;
    }
    startFullTest(picks);
  }

  /* B-1a：完整阅读模考「拿到加载信号后」的原有逻辑（原样搬入，一行没改） */
  function startFullTest(picks){
    var root = document.getElementById('bankRoot');
    Promise.all(picks.map(function(u){ return loadPack('reading', u.id); })).then(function(packs){
      EX = {
        full: true, channel: 'reading', packs: packs, ids: picks.map(function(u){ return u.id; }),
        /* 10/17 B：随机抽到的篇子可能有没有答案的 → 混合卷按「全有答案才判分」，
           缺一篇就整场不判分（不做「部分判分」：那会给出一个偏低的假分数）。 */
        scored: packs.every(function(pk){ return pk.answers && Object.keys(pk.answers).length; }),
        user: {}, submitted: false, flagged: {}, curP: 1, cur: 1, qs: [], byKey: {}, byG: {}
      };
      packs.forEach(function(pk, pi){
        (pk.unit.parts || []).forEach(function(part){
          (part.groups || []).forEach(function(g){
            var gset = isSharedGroup(g) ? (g._ansSet || '') : '';   /* 10/16：共享组判分集合 */
            (g.questions || []).forEach(function(q){
              if(q.qNumber == null) return;
              var ent = { g: EX.qs.length + 1, p: pi + 1, loc: String(q.qNumber), q: q, pack: pk, gset: gset, grp: g };
              EX.qs.push(ent); EX.byKey[(pi + 1) + '|' + ent.loc] = ent; EX.byG[ent.g] = ent;
            });
          });
        });
      });
      try{
        var d = JSON.parse(localStorage.getItem('hub_bank_full_draft') || 'null');
        if(d && d.ids && d.ids.join(',') === EX.ids.join(',') && d.user) EX.user = d.user;
      }catch(e){}
      EX.total = EX.qs.length;
      if(EX.qs.length) EX.cur = EX.qs[0].g;

      var host2 = document.getElementById('examRoot');
      if(host2){
        var gAll = [];
        packs.forEach(function(pk){ (pk.unit.parts || []).forEach(function(pt){ (pt.groups || []).forEach(function(g){ gAll.push(g); }); }); });
        var pnAll = [];
        gAll.forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) pnAll.push(q.qNumber); }); });
        host2.innerHTML = shellHtml('Reading Test', 'Full Test', '01:00:00')

          + partBannerHtml('Passage 1', pnAll.length ? pnAll[0] : null, pnAll.length ? pnAll[pnAll.length - 1] : null)
          + splitHtml('', '') + barHtml() + ctxHtml();
      }
      renderPassage(1);
      renderNotes();
      wireOptionPanel();   /* 10/14 Option 面板交互 —— 完整模考不走 renderExam，必须在这里也调一次 */
      wireExamTools();     /* 10/18 同上（完整模考路径也要绑一次） */
      reportExamState(true);
      if(EX.scored === false) showNoAnsBanner();
      startTimer(60 * 60);
      startFtMini();                                     /* 10/13：顶栏计时小徽章 */
      bankStartTimer();                               /* C-3：完整模考（阅读）开专注计时 */
    }).catch(function(err){
      if(window.console && console.error) console.error('[bank] 完整模考加载失败：', err);
      var h = document.getElementById('examRoot');
      if(h) h.innerHTML = '<div class="bank-empty"><p>Could not load this test. Please go back and try again.</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>Back</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  /* ===== 听力完整模考（10/12 第 10 项 · Part 1–4 各一篇 = 40 题 / 30 分钟）=====
     复用阅读完整模考的骨架（EX.full / packs / 卷面题号连续映射 / 答题卡 / 交卷确认），
     差异三点：① 单栏布局（听力无文章区）② 每个 Part 自己的音频，**整场只播一遍且不可回退**
     （真机考口径：官方录音只播一遍、不可暂停/拖动；切走再切回来也不能重播 —— 真机考各 Part
     录音只在「到这一部分」时播一次）③ 30 分钟总倒计时。 */
  function openFullListenTest(){
    if(!guidePassed('listening')){ examGuideGate('listening', function(){ openFullListenTest(); }); return; }
    /* 同阅读：点 Start 这一刻才随机抽 Part 1–4 各一篇 */
    var picks = composeFullListenTest();
    if(!picks) return;
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    /* B-1a：同阅读完整模考，走四态（noCancel；失败可重试） */
    if(host){
      host.hidden = false;
      fetchWithStates(host, 'Test', 'bank/listening/' + picks[0].id + '.json', function(box){
        startFullListenTest(picks);
      }, { noCancel: true });
      return;
    }
    startFullListenTest(picks);
  }

  /* B-1a：听力完整模考「拿到加载信号后」的原有逻辑（原样搬入，一行没改） */
  function startFullListenTest(picks){
    var root = document.getElementById('bankRoot');
    Promise.all(picks.map(function(u){ return loadPack('listening', u.id); })).then(function(packs){
      EX = {
        full: true, channel: 'listening', packs: packs, ids: picks.map(function(u){ return u.id; }),
        scored: packs.every(function(pk){ return pk.answers && Object.keys(pk.answers).length; }),
        user: {}, submitted: false, flagged: {}, seen: {}, curP: 1, cur: 1, qs: [], byKey: {}, byG: {},
        /* 听力完整模考全程考试模式（不给练习模式 —— 真机考没有这一说） */
        listenMode: 'exam', audioStarted: false, audioStartedBy: {}
      };
      _stLines = null; _stBound = null;   /* 3-4：换场清句子条缓存 */
      packs.forEach(function(pk, pi){
        (pk.unit.parts || []).forEach(function(part){
          (part.groups || []).forEach(function(g){
            var gset = isSharedGroup(g) ? (g._ansSet || '') : '';   /* 10/16：共享组判分集合 */
            (g.questions || []).forEach(function(q){
              if(q.qNumber == null) return;
              var ent = { g: EX.qs.length + 1, p: pi + 1, loc: String(q.qNumber), q: q, pack: pk, gset: gset, grp: g };
              EX.qs.push(ent); EX.byKey[(pi + 1) + '|' + ent.loc] = ent; EX.byG[ent.g] = ent;
            });
          });
        });
      });
      try{
        var d = JSON.parse(localStorage.getItem('hub_bank_full_l_draft') || 'null');
        if(d && d.ids && d.ids.join(',') === EX.ids.join(',') && d.user) EX.user = d.user;
      }catch(e){}
      EX.total = EX.qs.length;
      if(EX.qs.length) EX.cur = EX.qs[0].g;

      var host2 = document.getElementById('examRoot');
      if(host2){
        /* 10/13 她报「上面三行缩两行」→ 听力完整模考不渲染独立 Part 横幅，
           Part 信息并入音频条行首胶囊（renderListenPart 里随篇更新）。 */
        host2.innerHTML = shellHtml('Listening Test', 'Full Test', '00:30:00')
          + '<div id="exAudioHost"></div>'
          + '<div class="ex-listen" id="exListen"><div class="ex-listen-in" id="exListenIn"></div></div>'
          + barHtml();
      }
      renderListenPart(1);
      if(EX.scored === false) showNoAnsBanner();
      startTimer(30 * 60);
      startFtMini();                                     /* 10/13：顶栏计时小徽章 */
      bankStartTimer();                               /* C-3：完整模考（听力）开专注计时 */
    }).catch(function(err){
      if(window.console && console.error) console.error('[bank] 听力完整模考加载失败：', err);
      var h = document.getElementById('examRoot');
      if(h) h.innerHTML = '<div class="bank-empty"><p>Could not load this test. Please go back and try again.</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>Back</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  /* 渲染某一个 Part（听力完整模考的「切篇」）：音频条随篇换 + 题目单栏 + 卷面题号映射。
     与 renderPassage 平行（阅读用左右分栏 + 文章；听力单栏 + 音频条）。 */
  function renderListenPart(pi){
    if(!EX || !EX.full) return;
    EX.curP = pi;
    /* 🔴 10-22 官方口径：遮罩「只出一次」的记忆表（切 Part 回来不重出） */
    EX.audioGateDone = EX.audioGateDone || {};
    var pk = EX.packs[pi - 1];
    EX.unit = pk.unit;                                  /* 音频条 / 原文按篇取 → 复用同一套取数路径 */
    var barHost = document.getElementById('exAudioHost');
    /* 🔴 10/19 修：原来这里是 `if(barHost)` **不带花括号** —— 只护住了紧随的一行
       （`var _t = ...` 因为 var 提升本来也无所谓），而下一行 `barHost.innerHTML = ...`
       完全裸奔。一旦 #exAudioHost 不存在（DOM 结构变动 / 软导航换了壳 / 渲染顺序变化），
       这里抛 TypeError，**并直接中断本函数后续的题目渲染**（下面 inner.innerHTML = qh
       整段不执行）→ 表现就是「考场打开了但没有题目、音频条也没有」，静默无提示。
       改成显式花括号护住两行，且失败时给可见兜底提示（不静默中断）。 */
    if(barHost){
      /* 10/14：计时文本从现有 DOM 读（tick 里会双向同步，见 startTimer），不新建函数 */
      var _t = (document.getElementById('exTimer') || {}).textContent || '00:30:00';
      barHost.innerHTML = audioBarHtml(partChipText(), (EX.unit && EX.unit.title) || '', _t);   /* 换篇 = 旧 <audio> 随 innerHTML 销毁（播放自动停）；Part 胶囊随篇更新 */
      wireAudio();                                      /* ⚠️ 新 <audio> 元素必须重绑事件（play 监听 = 「只播一遍」的记号来源） */
    } else {
      /* 容器丢了也要让用户看见「哪里不对」，而不是一个没有音频、没有题目的空考场 */
      try{
        if(typeof toast === 'function') toast('音频条容器缺失（#exAudioHost），已跳过音频');
        console.warn('[bank] renderListenPart: #exAudioHost 不存在，音频条未渲染');
      }catch(e){}
    }
    var inner = document.getElementById('exListenIn');
    var list = qsOfPassage(pi);
    if(inner){
      var numOf = numOfPassage(pi), qi = 0, qh = '';
      (pk.unit.parts || []).forEach(function(p){
        (p.groups || []).forEach(function(g){ qh += groupHtml(g, qi++, numOf, 'listening'); });
      });
      inner.innerHTML = qh; inner.scrollTop = 0;
    }
    if(list.length) EX.cur = list[0].g;
    list.forEach(function(e){ if(EX.user[e.g] != null) applyAnswer(e.g, EX.user[e.g]); });
    syncExamStates();
    if(EX.submitted){ showScript(); decoratePassage(pi); hideAudioGate(); }
    else if(EX.audioStartedBy && EX.audioStartedBy[pi]){
      /* 这个 Part 的音频已经播过 → 不可重播（整场只播一遍）。交卷后不在此列（解锁复听口径不变）。
         🔴 10-22 官方口径：播过的 Part 直接进题，不再出遮罩（官方同行为）。 */
      hideAudioGate();
    }
    else {
      /* 没播过的 Part → 官方那一屏整页遮罩（点 Play 才进） */
      showAudioGate();
    }
    /* 10/13：Part 横幅已并入音频条行首胶囊（#exPartBanner 不存在了）→ 切篇只刷题号行 */
    paintSheet();
  }

  function qsOfPassage(pi){ return ((EX && EX.qs) || []).filter(function(e){ return e.p === pi; }); }
  function numOfPassage(pi){
    return function(loc){ var e = EX.byKey[pi + '|' + String(loc)]; return e ? e.g : loc; };
  }
  function renderPassage(pi){
    if(!EX || !EX.full) return;
    EX.curP = pi;
    var pk = EX.packs[pi - 1];
    EX.unit = pk.unit;                                  /* 标注 / 便签按篇存 → 复用同一套键 */
    var art = document.getElementById('exArt'), qcol = document.getElementById('exQCol');
    if(art){
      var ah = '';
      (pk.unit.parts || []).forEach(function(p){ ah += clean(p.article || ''); });
      art.innerHTML = ah; art.scrollTop = 0;
    }
    if(qcol){
      var numOf = numOfPassage(pi), qi = 0, qh = '';
      (pk.unit.parts || []).forEach(function(p){
        (p.groups || []).forEach(function(g){ qh += groupHtml(g, qi++, numOf); });
      });
      qcol.innerHTML = qh; qcol.scrollTop = 0;
    }
    /* 10/16：heading 题段前虚线槽（她 18:16 口径）
       ⚠️ 10/20 17:1x 移位：headSlotsInto() 现在**从题目区 DOM 读 data-q / data-g**（原来是从 #exArt 里
       找题目区槽，永远找不到）→ 必须等 qcol.innerHTML 渲染完再跑，否则读到的是上一篇的题目区。 */
    if(art) headSlotsInto();
    var list = qsOfPassage(pi);
    if(list.length) EX.cur = list[0].g;
    list.forEach(function(e){ if(EX.user[e.g] != null) applyAnswer(e.g, EX.user[e.g]); });
    syncExamStates();
    if(EX.submitted) decoratePassage(pi);
    replayMarks();
    updatePartBanner('Passage ' + pi, list.length ? list[0].g : null, list.length ? list[list.length - 1].g : null);
    paintSheet();
  }

  /* ===== 复盘：逐题结论条（10/17）=====
     背景：原实现把每题的 Correct/Yours 直接 append 到题组末尾，答对的题也挂 → 整卷 40 题时
     解析墙把题目顶下去（她 18:3x 报的「解析滚不完」）。
     改法（对齐爱听写实证）：
       · 每题只留一条【折叠的结论条】= "Q14  Correct: X  Yours: Y"，默认收起
       · 只有错题的结论条预置 ▶ 展开提示；答对的题不展开也不给解析入口
       · 展开后列出该题的正确答案/你的答案（解析文本全站为空 → 不虚构「AI 解析」栏目）
     ⚠️ 铁律：站内没有的能力不能出现在入口文案 —— analyses 实测 0 命中，所以不写「查看解析」。 */
  var RVIEW_MAXN = 3;   /* 单组可完全展开的题数上限（爱听写同款防失控） */

  /* 结论条展开/收起：组内同时展开数超上限时，自动收起最早展开的那一题 */
  function rviewToggle(box){
    if(!box || !EX || !EX._rview) return;
    var gid = box.getAttribute('data-g') || '';
    var qn = box.getAttribute('data-q') || '';
    var open = EX._rview.open[gid] || (EX._rview.open[gid] = []);
    var idx = open.indexOf(qn);
    if(idx > -1){ open.splice(idx, 1); }
    else {
      if(open.length >= RVIEW_MAXN){
        var oldest = open.shift();
        var ob = document.querySelector('.ex-rv[data-g="' + gid + '"][data-q="' + oldest + '"]');
        if(ob) ob.classList.remove('open');
      }
      open.push(qn);
    }
    box.classList.toggle('open', open.indexOf(qn) > -1);
    var btn = box.querySelector('.ex-rv-tg');
    if(btn) btn.textContent = box.classList.contains('open') ? 'Hide' : 'Show';
  }

  /* 交卷后给「当前这一篇」逐题上色 + 挂解析（切篇时按篇重跑） */
  function decoratePassage(pi){
    var root = document.getElementById('examRoot'); if(!root || !EX || !EX.result) return;
    EX.result.detail.forEach(function(d){
      if(EX.full){
        var ent = EX.byG[d.qn];
        if(!ent || ent.p !== pi) return;
      }
      var qnEl = root.querySelector('.ex-qn[data-qn="' + d.qn + '"]') || root.querySelector('.ex-qn[data-qns~="' + d.qn + '"]');
      if(qnEl) qnEl.classList.add(d.ok ? 'hit' : 'miss');

      root.querySelectorAll('.ex-pills[data-q="' + d.qn + '"] .ex-pill').forEach(function(p){
        var v = p.getAttribute('data-v');
        if(norm(v) === norm(d.right)) p.classList.add('right');
        else if(p.classList.contains('on')) p.classList.add('wrong');
      });
      var sel = root.querySelector('select[data-q="' + d.qn + '"]'); if(sel) sel.disabled = true;
      root.querySelectorAll('.ex-cbox[data-q="' + d.qn + '"] input').forEach(function(b){ b.disabled = true; });
      /* 选项（单选/多选）：正确的标绿、选错的标红 */
      var rights = String(d.right == null ? '' : d.right).toUpperCase().split(/[,\s\/]+/).filter(Boolean);
      root.querySelectorAll('.ex-opts[data-q="' + d.qn + '"] .ex-opt').forEach(function(lb){
        var inp = lb.querySelector('input'); if(inp) inp.disabled = true;
        var v = String(lb.getAttribute('data-v') || '').toUpperCase();
        if(v && rights.indexOf(v) > -1) lb.classList.add('right');
        else if(inp && inp.checked) lb.classList.add('wrong');
      });
      /* 配对题：拖入的答案标对错 */
      /* 10/16：同题号可能有原文槽 + 题目区槽两个（heading 题）→ 都上色 */
      root.querySelectorAll('.ex-drop[data-q="' + d.qn + '"]').forEach(function(dpEl){
        if(!dpEl.getAttribute('data-v')) return;
        dpEl.classList.add(norm(dpEl.getAttribute('data-v')) === norm(d.right) ? 'right' : 'wrong');
        dpEl.style.pointerEvents = 'none';
      });
      /* 段落信息匹配：槽位按对错上色（答案字母 vs 正确字母） */
      var psEl = root.querySelector('.ex-pslot[data-q="' + d.qn + '"]');
      if(psEl && psEl.getAttribute('data-v')){
        psEl.classList.add(norm(psEl.getAttribute('data-v')) === norm(d.right) ? 'right' : 'wrong');
        psEl.style.pointerEvents = 'none';
      }
      /* 10/16 三修：段落匹配矩阵——正确字母的格子标绿、错选标红、全部禁用（复盘口径与其他题型一致） */
      root.querySelectorAll('#examRoot .ex-lomatrix input[type=radio][data-q="' + d.qn + '"]').forEach(function(r){
        r.disabled = true;
        var td = r.closest('td');
        if(td){
          if(norm(r.value) === norm(d.right)) td.classList.add('mx-right');
          else if(r.checked) td.classList.add('mx-wrong');
        }
      });
      var bl = root.querySelector('input.ex-blank[data-q="' + d.qn + '"]'); if(bl) bl.disabled = true;
      if(bl && !d.ok){ bl.style.borderBottomColor = '#e6b3ae'; bl.style.color = '#b3261e'; }

      /* 🔴 10/19 修（HANDOFF §二 挂了两天的「map 组交卷后没有逐题结论条」）：
         段落信息匹配（`type:"map"` + reading）走的是**矩阵表格**，题号在 `<b class="mx-no">` 里，
         不是 `.ex-qn[data-qn]`；也没有 `.ex-blank`。于是 anchor 恒 null → groupEl 恒 null →
         这一组一题都不挂结论条（实测 Muscle Loss 13 题只出 7 条 = 单选 2 + 填空 5）。
         补一条矩阵行的兜底锚点：找到该题号所在 <tr>，再拿它所属的 .ex-group。 */
      var mxEl = root.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + d.qn + '"]');
      var anchor = qnEl || (bl ? bl.closest('.ex-group') : null) || (mxEl ? mxEl.closest('tr') : null);
      var groupEl = anchor ? anchor.closest('.ex-group') : null;
      if(groupEl){
        /* 10/17：改挂「可折叠的结论条」（原 .ex-expl 平铺会把题目顶下去）。
           错题默认收起但带 ▶ Show；答对的题也给条（要让用户能核对），只是不预展开。 */
        var gid = groupEl.getAttribute('data-g') || ('g' + pi);
        var box = document.createElement('div');
        box.className = 'ex-rv' + (d.ok ? ' rv-ok' : ' rv-no');
        box.setAttribute('data-g', gid);
        box.setAttribute('data-q', String(d.qn));
        var yourTxt = d.user ? esc(String(d.user)) : '—';
        box.innerHTML = '<div class="ex-rv-h">'
          +   '<span class="ex-rv-no">Q' + esc(d.qn) + '</span>'
          +   '<span class="ex-rv-v">' + (d.ok ? 'Correct' : 'Incorrect') + '</span>'
          +   '<button type="button" class="ex-rv-tg" data-rvtoggle="' + esc(d.qn) + '">Show</button>'
          + '</div>'
          + '<div class="ex-rv-b">'
          +   '<div><span>Correct answer</span><b>' + esc(d.right || '—') + '</b></div>'
          +   '<div><span>Your answer</span><b class="' + (d.ok ? '' : 'bad') + '">' + yourTxt + '</b></div>'
          + '</div>';
        groupEl.appendChild(box);
      }
    });
  }

  /* 阅读 raw score（40 题）→ 总分换算（Academic Reading 通用对照） */
  function bandOfReading(raw){
    var t = [[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],
             [15,5],[13,4.5],[10,4],[6,3.5],[4,3],[3,2.5],[2,2],[1,1],[0,0]];
    for(var i = 0; i < t.length; i++){ if(raw >= t[i][0]) return t[i][1]; }
    return 0;
  }
  /* 听力 raw score（40 题）→ 总分换算。听力表与阅读表**不一样**（门槛更低），别混用。
     来源：ieltsworldly.com/ielts-ac-gt-listening-faq-paper-based-and-computer-based
     （与 IDP 官方换算口径一致，两个独立来源核对过） */
  function bandOfListening(raw){
    var t = [[39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],
             [16,5],[13,4.5],[11,4],[8,3.5],[6,3],[4,2.5],[3,2],[2,1.5],[1,1],[0,0]];
    for(var i = 0; i < t.length; i++){ if(raw >= t[i][0]) return t[i][1]; }
    return 0;
  }
  function isListen(){ return !!(EX && EX.channel === 'listening'); }
  function addScoreCard(res){
    var root = document.getElementById('examRoot'); if(!root) return;
    var old = root.querySelector('.fx-score'); if(old && old.parentNode) old.parentNode.removeChild(old);
    var raw = Math.round(res.right / (res.total || 1) * 40);
    var cards = '';
    if(EX.full){
      var isLf = !!(EX && EX.channel === 'listening');
      var pn = isLf ? 4 : 3, plabel = isLf ? 'PART ' : 'PASSAGE ';
      for(var fpi = 1; fpi <= pn; fpi++){
        var tot = 0, ok = 0;
        qsOfPassage(fpi).forEach(function(e){
          var d = null;
          for(var i = 0; i < res.detail.length; i++){ if(res.detail[i].qn === String(e.g)){ d = res.detail[i]; break; } }
          if(!d) return;
          tot++; if(d.ok) ok++;
        });
        cards += '<div class="fx-pcard"><b>' + plabel + fpi + '</b><div>' + ok + ' / ' + tot + '</div></div>';
      }
    }
    var lsn = isListen();
    var wrong = res.detail.filter(function(d){ return !d.ok; }).length;
    /* 用时 mm:ss（EX._usedSec 由 doSubmit 算好：开局秒 − 剩余秒） */
    var used = Math.max(0, Math.round(EX._usedSec || 0));
    var mm = Math.floor(used / 60), ss = used % 60;
    var usedTxt = mm + ':' + (ss < 10 ? '0' : '') + ss;
    var el = document.createElement('div');
    el.className = 'fx-score';
    el.innerHTML = '<div class="fx-top"><b>' + res.right + ' / ' + res.total + '</b>'
      /* 🔴 10/16 修：成绩卡里的「总分」「题换算」是中文 → 违反「考试页零中文」铁律（体检抓到）。改英文。 */
      + '<span class="fx-band">Overall ' + Number((lsn ? bandOfListening : bandOfReading)(raw)).toFixed(1) + '</span>'
      + '<span>' + (lsn ? 'Listening' : 'Academic Reading') + ' · converted from ' + res.total + ' questions</span></div>'
      /* 10/17：一行 meta（爱听写实证：成绩页顶部就是「分数 / 正确题数 / 用时」一行，不是大数字卡）
         —— 版面让给答题卡和错题，不做 48px 大数字。 */
      + '<div class="fx-meta">'
      +   '<span><b>' + (res.total - wrong) + '</b> correct</span>'
      +   '<span><b>' + wrong + '</b> incorrect</span>'
      +   '<span>Time <b>' + usedTxt + '</b></span>'
      /* 10/17：「只看错题」通道（她 18:3x 报的第 4 个问题）。
         做法 = 让底部答题卡只列出错题号（点一下跳过去），而不是隐藏题目本身 ——
         隐藏题目会改变页面内容与定位（违反她「绝不切内容、绝不错位」的判据），
         而「答题卡筛选」是爱听写同款做法（答题卡在顶部/底部，颜色区分 + 点击跳转）。 */
      +   '<span class="fx-filt">'
      +     '<button type="button" class="fx-chip on" data-fxfilter="all">All</button>'
      +     '<button type="button" class="fx-chip" data-fxfilter="wrong">Incorrect only</button>'
      +   '</span>'
      + '</div>'
      + (cards ? '<div class="fx-pgrid">' + cards + '</div>' : '')
      /* 10/18 P0-3「下一步」三卡（对标 IELTS Mocks 成绩页的 WHAT TO DO NEXT）：
         交卷后最常做的三件事一次给全，不用自己在页面里找入口。
         ⚠️ 只给站内**真实存在**的能力（她 10/6 铁律：没有的能力不许出现在入口文案里）：
            ① 看错题 = 复用 10/17 的 Incorrect only 筛选 + 跳到第一道错题（不是新功能）
            ② 再做一次 = 复用 openExam / openFullTest（换一套随机卷）
            ③ 回列表 = 复用既有 Exit */
      + '<div class="fx-next">'
      +   '<div class="fx-next-h">WHAT TO DO NEXT</div>'
      +   '<div class="fx-next-g">'
      +   (wrong
            ? '<button type="button" class="fx-ncard" data-fxnext="wrong"><b>Review the ' + wrong + ' incorrect</b>'
              + '<span>Jump to the first one, and show only wrong numbers in the answer sheet</span></button>'
            : '<div class="fx-ncard is-done"><b>No incorrect answers</b><span>Nothing to review in this test</span></div>')
      +     '<button type="button" class="fx-ncard" data-fxnext="retake"><b>'
      +       (EX.full ? 'Start another full test' : ('Retake this ' + (lsn ? 'part' : 'passage')))
      +     '</b><span>' + (EX.full ? 'A new random set, with a fresh timer' : 'Same passage, answers cleared') + '</span></button>'
      +     '<button type="button" class="fx-ncard" data-fxnext="exit"><b>Back to the test list</b>'
      +     '<span>Pick a different test</span></button>'
      +   '</div>'
      + '</div>';
    /* 「看错题」要跳到第一道错题 —— 题号此刻算好存进 EX，点击时直接取（点击时 res 已不在作用域） */
    EX._firstWrong = 0;
    for(var wi = 0; wi < res.detail.length; wi++){
      if(!res.detail[wi].ok){ EX._firstWrong = Number(res.detail[wi].qn) || 0; break; }
    }
    root.insertBefore(el, root.firstChild);   // 10/12 批A：ptabs 已删，直接插最前
  }

  /* 成绩卡「下一步」三卡的行为（10/18 P0-3）。全部复用既有能力，不新增状态。 */
  function fxNext(act){
    if(!EX) return;
    if(act === 'wrong'){
      EX._filt = 'wrong';
      var chips = document.querySelectorAll('#examRoot .fx-chip');
      for(var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', chips[i].getAttribute('data-fxfilter') === 'wrong');
      paintSheet();
      if(EX._firstWrong) goTo(EX._firstWrong);
      return;
    }
    if(act === 'retake'){
      var id = (EX.unit && EX.unit.id) || '', ch = EX.channel, full = !!EX.full;
      exitExam();
      /* exitExam 里 boot() 会重画列表；等它落一拍再进考场（避免两条渲染互相覆盖） */
      setTimeout(function(){
        if(full){ if(ch === 'listening') openFullListenTest(); else openFullTest(); }
        else openExam(id, ch);
      }, 60);
      return;
    }
    exitExam();
  }

  /* 10/17 B：「本次未判分」横幅 —— 没有对错、没有总分、不进记录。
     位置与 addScoreCard 相同（插到 examRoot 最前），版面语言沿用成绩卡的同一套。 */
  function addNoScoreCard(){
    var root = document.getElementById('examRoot'); if(!root) return;
    var old = root.querySelector('.fx-score, .fx-noscore');
    if(old && old.parentNode) old.parentNode.removeChild(old);
    var used = Math.max(0, Math.round(EX._usedSec || 0));
    var mm = Math.floor(used / 60), ss = used % 60;
    var usedTxt = mm + ':' + (ss < 10 ? '0' : '') + ss;
    var el = document.createElement('div');
    el.className = 'fx-noscore';
    el.innerHTML = '<div class="fx-top"><b>Not scored</b>'
      + '<span>' + (isListen() ? 'Listening' : 'Academic Reading') + ' &middot; no answer key for this test</span></div>'
      + '<div class="fx-meta">'
      +   '<span><b>' + (EX.total || 0) + '</b> questions answered as practice</span>'
      +   '<span>Time <b>' + usedTxt + '</b></span>'
      + '</div>';
    root.insertBefore(el, root.firstChild);
  }
  /* 10/17 B：进场提示条（可关闭）—— 交卷前就告诉用户这篇不计分，
     别等交卷后才知道。sessionStorage 记「已关闭」：同一次会话内不再弹。 */
  function showNoAnsBanner(){
    var root = document.getElementById('examRoot'); if(!root) return;
    var key = 'hub_noans_banner_' + (EX.unit ? EX.unit.id : '');
    try{ if(sessionStorage.getItem(key)) return; }catch(e){}
    if(root.querySelector('.ex-noans')) return;
    var el = document.createElement('div');
    el.className = 'ex-noans';
    el.innerHTML = '<span class="ex-noans-ic">!</span>'
      + '<span class="ex-noans-t">This test has no answer key yet. Practice freely &mdash; '
      + 'it will not be scored and will not appear in your records.</span>'
      + '<button type="button" class="ex-noans-x" title="Dismiss">&times;</button>';
    root.insertBefore(el, root.firstChild);
    var x = el.querySelector('.ex-noans-x');
    if(x) x.addEventListener('click', function(){
      if(el.parentNode) el.parentNode.removeChild(el);
      try{ sessionStorage.setItem(key, '1'); }catch(e){}
    });
  }

  /* ===== 配对题拖拽（Pointer Events：鼠标 + 触屏通用；不用 HTML5 DnD —— 它在触屏完全不工作）===== */
  var _dg = null, _ghost = null, _dgOff = { x: 0, y: 0 }, _dgStart = { x: 0, y: 0 }, _sel = null;
  function dgDrops(){ return [].slice.call(document.querySelectorAll('#examRoot .ex-drop, #examRoot .ex-pslot')); }
  function dgPool(gid){ return document.querySelector('#examRoot .ex-pool[data-g="' + gid + '"]'); }
  function dgPoolChip(v, gid){ var p = dgPool(gid); return p ? p.querySelector('.ex-chip[data-v="' + v + '"]') : null; }
  function dgMark(v, used, gid){ var c = dgPoolChip(v, gid); if(c) c.classList.toggle('used', !!used); }
  function dgClearSel(){ if(_sel){ _sel.classList.remove('sel'); _sel = null; } }
  function dgReset(){
    if(_ghost){ _ghost.remove(); _ghost = null; }
    if(_dg && _dg.el) _dg.el.classList.remove('dragging');
    _dg = null; dgClearSel();
    dgDrops().forEach(function(d){ d.classList.remove('over'); });
  }
  function dgPlace(drop, v, silent){
    var gid = drop.getAttribute('data-g');
    var old = drop.getAttribute('data-v');
    if(old) dgMark(old, false, gid);                        /* 换掉的退回池子 */
    var src = dgPoolChip(v, gid);
    drop.setAttribute('data-v', v);
    drop.classList.add('filled');
    drop.classList.remove('right', 'wrong');
    drop.innerHTML = (src ? src.innerHTML : esc(v)) + '<span class="ex-x" title="Remove">✕</span>';
    dgMark(v, true, gid);
    dgSyncQ(drop);
    if(!silent){ saveDraft(); paintSheet(); }
  }
  /* 10/16：同一题号可能有两个槽（原文段落上方 .ex-hslot + 题目区行内 .ex-drop）→ 填入/清除后互相同步 */
  function dgSyncQ(drop){
    var q = drop.getAttribute('data-q'); if(!q) return;
    var v = drop.getAttribute('data-v');
    document.querySelectorAll('#examRoot .ex-drop[data-q="' + q + '"]').forEach(function(o){
      if(o === drop) return;
      if(v){
        if(o.getAttribute('data-v') === v) return;
        var src = dgPoolChip(v, drop.getAttribute('data-g'));
        o.setAttribute('data-v', v);
        o.classList.add('filled'); o.classList.remove('right', 'wrong');
        o.innerHTML = (src ? src.innerHTML : esc(v)) + '<span class="ex-x" title="Remove">✕</span>';
      } else {
        o.removeAttribute('data-v');
        o.classList.remove('filled', 'right', 'wrong');
        o.innerHTML = '';
      }
    });
  }
  function dgClearEl(drop){
    if(!drop || !drop.getAttribute('data-v')) return;
    dgMark(drop.getAttribute('data-v'), false, drop.getAttribute('data-g'));
    drop.removeAttribute('data-v');
    drop.classList.remove('filled', 'right', 'wrong');
    drop.innerHTML = '';
    dgSyncQ(drop);
    saveDraft(); paintSheet();
  }
  function dgDropAt(x, y){ var el = document.elementFromPoint(x, y); return el ? el.closest('.ex-drop, .ex-pslot') : null; }

  /* ===== 段落信息匹配（阅读 map 改版 · 她 10/12 22:16 截图要求的真机考形态）=====
     文章每段上方虚线槽 + 题号气泡：Pointer Events 拖拽与点选两路（与配对题同一套手势层，
     触屏可用——HTML5 DnD 在触屏完全不工作，10/12 教训）。
     存储不变：答案 = 段落字母，EX.user[题号] = 字母，collect/判分/落库全部复用。 */
  function lohSlots(){ return [].slice.call(document.querySelectorAll('#examRoot .ex-pslot')); }
  function lohBubble(qn){ return document.querySelector('#examRoot .ex-lohb[data-q="' + qn + '"]'); }
  function lohSlotOf(qn){ return document.querySelector('#examRoot .ex-pslot[data-q="' + qn + '"]'); }
  function lohPaintRow(qn){
    var b = lohBubble(qn); if(!b) return;
    var row = b.closest('.ex-q'), v = row ? row.querySelector('.ex-lohv') : null;
    var s = lohSlotOf(qn);
    if(v){
      v.textContent = s ? s.getAttribute('data-v') : '';
      if(s) v.setAttribute('data-q', qn); else v.removeAttribute('data-q');
    }
    b.classList.toggle('used', !!s);
  }
  function lohPlace(slot, qn, silent){
    qn = String(qn);
    var old = slot.getAttribute('data-q');
    lohSlots().forEach(function(s){ if(s !== slot && s.getAttribute('data-q') === qn) lohClear(s, true); });
    slot.setAttribute('data-q', qn);
    slot.classList.add('filled');
    var box = slot.querySelector('.ex-psl-box'); if(box) box.textContent = qn;
    lohPaintRow(qn);
    if(old && old !== qn) lohPaintRow(old);
    if(!silent){ saveDraft(); paintSheet(); }
  }
  function lohClear(slot, silent){
    var qn = slot.getAttribute('data-q'); if(!qn) return;
    slot.removeAttribute('data-q');
    slot.classList.remove('filled', 'right', 'wrong');
    var box = slot.querySelector('.ex-psl-box'); if(box) box.textContent = '';
    lohPaintRow(qn);
    if(!silent){ saveDraft(); paintSheet(); }
  }
  /* 文章侧：每个段落字母前插虚线槽。字母集取自该篇 map 组题目的 options（A–G），
     只认块级元素开头的独立字母（飞书导出形态 = <strong>A</strong> 开头），不猜文本。
     单篇练习走 EX.unit；完整模考走 EX.packs[EX.curP-1]。 */
  /* 🔴🔴 10/16 五修（她 18:16：「这个 heading 题是把右边的选项拖到原文里的，每一段的上面会有一个
     虚像框让你拖的」）——Heading 题（List of Headings）的落点从「只在题目区行内」扩到**原文每段上方**：
     在 #exArt 里给每个段落字母（题干 "Paragraph A"）插一个虚线槽 .ex-drop.ex-hslot（data-q=该段题号，
     data-g 与题目区同题号槽一致），拖放/点选/清除全部复用既有手势层（.ex-drop 选择器自动收录）。
     两处槽（原文 + 题目区）同 data-q → dgSyncQ 保持显示一致；答案口径仍 EX.user[题号]=罗马数字。 */
  function headSlotsInto(){
    var art = document.getElementById('exArt');
    var qcol = document.getElementById('exQCol');
    if(!art || !EX) return;
    art.querySelectorAll('.ex-hslot').forEach(function(s){ s.remove(); });     /* 幂等：重渲染先清 */
    if(!qcol) return;
    /* 🔴🔴 10/20 17:0x 修 bug（她 2B 补充：「heading题是拖到原文里而且拖进去之后得全部显示不能只留一个数字标题」）：
       旧实现两处错，叠一起 → 原文段落槽里只剩罗马数字：
       ① 用 `art.querySelector('.ex-drop[data-q=...]')` 去题目区抄 data-g ——
          **题目区在 #exQCol，不在 #exArt 里**（splitHtml：文章 | 题目 两栏）→ 永远查不到
          → 原文槽没有 data-g → 拖放时 dgPoolChip(v, '') 找不到源 chip
          → dgPlace 退化成 `esc(v)` = 只写罗马数字（= 她说的「只留一个数字标题」）。
       ② 用题库内局部题号 q.qNumber 当 data-q —— 完整模考里显示题号是全局号（numOfPassage 映射），
          两者对不上 → 槽与题目区槽的 data-q 不同步。
       **改法：全部以 DOM 为准** —— 从题目区读出 heading 组的 (显示题号, 池 gid, 段落字母)，
       再把文章里的段落块按字母/顺序对上，槽带正确的 data-q + data-g。
       这样原文槽与题目区槽 data-q 相同 → dgSyncQ 双向同步，答案口径也一致。 */
    var rows = [];
    qcol.querySelectorAll('.ex-group').forEach(function(grp){
      var pool = grp.querySelector('.ex-pool');
      if(!pool) return;
      var c0 = pool.querySelector('.ex-chip');
      /* heading 组判据 = 选项池首个 chip 是罗马数字（与 groupHtml 的 isHead 同判据） */
      if(!c0 || !/^[ivx]+$/i.test(String(c0.getAttribute('data-v') || ''))) return;
      var gid = pool.getAttribute('data-g');
      grp.querySelectorAll('.ex-q').forEach(function(q){
        var d = q.querySelector('.ex-drop');
        if(!d) return;
        var qt = q.querySelector('.ex-qt');
        var m = /(?:paragraph|section)\s+([A-Z])\b/i.exec(qt ? (qt.textContent || '') : '');
        rows.push({ q: d.getAttribute('data-q'), g: gid, L: m ? m[1].toUpperCase() : '' });
      });
    });
    if(!rows.length) return;
    var byL = {};
    rows.forEach(function(r){ if(r.L) byL[r.L] = r; });
    /* 扫文章块级元素找段落起始标记（题库形态 = 块首「A 正文…」或「(A) 正文…」），
       用**字母增量序列**校验（A→B→C…）排除正文里偶然以大写字母开头的句子。 */
    var seq = [], expected = 65;
    art.querySelectorAll('p, div, h1, h2, h3, h4, li').forEach(function(b){
      var t = (b.textContent || '').replace(/\u00a0/g, ' ').trim();
      if(!t) return;
      var m = /^\(([A-Z])\)/.exec(t) || /^([A-Z])[\s\.\)]/.exec(t);
      if(!m) return;
      if(m[1].charCodeAt(0) !== expected) return;
      expected++;
      seq.push({ L: m[1], el: b });
    });
    if(!seq.length) return;
    var n = Math.min(seq.length, rows.length);
    for(var i = 0; i < n; i++){
      var L = seq[i].L;
      /* 题干带字母（"Paragraph A"）按字母对；题干只有 "Paragraph"（字母缺失）按顺序对 */
      var row = byL[L] || rows[i];
      if(!row || !row.q) continue;
      var qn = row.q;
      if(art.querySelector('.ex-hslot[data-q="' + qn + '"]')) continue;       /* 同题号只插一个 */
      var slot = document.createElement('div');
      slot.className = 'ex-drop ex-hslot';
      slot.setAttribute('data-q', qn);
      if(row.g) slot.setAttribute('data-g', row.g);
      slot.setAttribute('title', 'Drag a heading here');
      /* ⚠️ 10/16 踩坑：题库文章是**嵌套 div**，命中的段落块往往不是 #exArt 的直接子节点 →
         `art.insertBefore(slot, block)` 会抛 NotFoundError（整个考场加载被 catch 吞掉、白屏）。
         正确做法：插到**该块自己的父节点**里、紧挨它前面。 */
      var parent = seq[i].el.parentNode;
      if(!parent) continue;
      parent.insertBefore(slot, seq[i].el);                                   /* 段落**上方** */
    }
  }
  function lohSlotsInto(){
    /* 10/14 停用：段落信息匹配改表格行（她拍板），不再往文章里插拖放虚线槽。
       10/16 起：heading 题的原文段落槽走独立的 headSlotsInto()（她 18:16 要求），本函数保持空壳。 */
    return;
  }

  /* ===== Highlight / Note（划词即弹 · 按篇存本地，下次打开还在）=====
     10/12 改：原来**必须右键**才能出菜单 —— 与成熟站通例不符（Notion / Medium 的 selection
     bubble menu 都是「选中即弹」，四来源口径一致，详见 bank.html 内联注释）。
     现在：mouseup 时若选区内是文章文字 → 直接在选区上方浮出工具条；
     右键一并保留（真机考两种都支持：申友雅思「右键单击 Highlight 和 Note」）。
     ⚠️ 两个坑：① 右键按下那一下浏览器会把选区折叠掉 → pointerdown(button=2) 先 cloneRange() 缓存；
              ② 点工具条按钮的 mousedown 会把选区清掉 → 对 #exCtx 做 preventDefault。 */
  var _hlRange = null, _hlSpan = null, _hlCache = null;

  function artEl(){ return document.getElementById('exArt'); }
  function marksKey(){ return (EX && EX.unit) ? 'hub_bank_marks_' + EX.unit.id : ''; }
  function loadMarks(){
    try{ var a = JSON.parse(localStorage.getItem(marksKey()) || '[]'); return (a && a.length) ? a : []; }catch(e){ return []; }
  }
  function saveMarks(list){ try{ localStorage.setItem(marksKey(), JSON.stringify(list)); }catch(e){} }
  function unwrapEl(el){
    var p = el.parentNode; if(!p) return;
    while(el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
  }
  function wrapRange(range, cls, id){
    var span = document.createElement('span');
    span.className = cls;
    if(id) span.setAttribute('data-id', id);
    try{ span.appendChild(range.extractContents()); range.insertNode(span); return span; }catch(e){ return null; }
  }
  function textMap(root){
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], full = '', n;
    while((n = walker.nextNode())){ nodes.push({ node: n, s: full.length }); full += n.nodeValue; }
    return { nodes: nodes, full: full };
  }
  function locAt(map, off){
    for(var i = 0; i < map.nodes.length; i++){
      var it = map.nodes[i], len = it.node.nodeValue.length;
      if(off >= it.s && off <= it.s + len) return { node: it.node, offset: off - it.s };
    }
    return null;
  }
  function selQuote(range){
    var art = artEl(); if(!art || !range) return null;
    var t = range.toString();
    if(!t) return null;
    var map = textMap(art), start = -1;
    if(range.startContainer && range.startContainer.nodeType === 3){
      for(var i = 0; i < map.nodes.length; i++){
        if(map.nodes[i].node === range.startContainer){ start = map.nodes[i].s + range.startOffset; break; }
      }
    }
    if(start < 0) return { text: t, pre: '', post: '' };
    return {
      text: t,
      pre:  map.full.slice(Math.max(0, start - 24), start),
      post: map.full.slice(start + t.length, start + t.length + 24)
    };
  }
  function markRange(a, b, cls, id){
    var r = document.createRange();
    try{ r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); }catch(e){ return null; }
    return wrapRange(r, cls, id);
  }
  /* 按「原文片段 + 前后文」把标注重新贴回文章（文本没变就能定位） */
  function replayMarks(){
    var art = artEl(); if(!art) return;
    loadMarks().forEach(function(m){
      if(!m || !m.text || art.querySelector('[data-id="' + m.id + '"]')) return;
      var map = textMap(art), start = -1;
      if(m.pre || m.post){
        var i0 = map.full.indexOf((m.pre || '') + m.text + (m.post || ''));
        if(i0 > -1) start = i0 + (m.pre ? m.pre.length : 0);
      }
      if(start < 0) start = map.full.indexOf(m.text);
      if(start < 0) return;
      var a = locAt(map, start), b = locAt(map, start + m.text.length);
      if(!a || !b) return;
      var sp = markRange(a, b, m.kind === 'hl' ? 'ex-hl' : 'ex-nt', m.id);
      if(sp && m.rep) sp.classList.add('rep');          /* 玫红态（重复高亮）也要复原 */
    });
  }
  function renderNotes(){
    var host = document.getElementById('exNoteList'); if(!host) return;
    var list = loadMarks().filter(function(m){ return m.kind === 'nt'; });
    host.innerHTML = list.length
      ? list.map(function(m){
          return '<div class="ex-ncard" data-id="' + esc(m.id) + '">'
            + '<button class="ex-ndel" type="button" data-ndel="' + esc(m.id) + '" title="Delete">✕</button>'
            + '<q>' + esc(String(m.text || '').slice(0, 90)) + '</q>'
            + '<textarea placeholder="Type your note…">' + esc(m.note || '') + '</textarea></div>';
        }).join('')
      : '<p class="ex-notes-empty">Select text in the passage, then pick Highlight or Note.</p>';
  }
  function focusNote(id){
    var sp = document.getElementById('exSplit'); if(sp) sp.classList.add('hasnotes');
    document.querySelectorAll('#examRoot .ex-ncard').forEach(function(c){ c.classList.remove('on'); });
    var card = document.querySelector('#examRoot .ex-ncard[data-id="' + id + '"]');
    if(card){ card.classList.add('on'); var t = card.querySelector('textarea'); if(t) t.focus(); }
  }
  function delNote(id){
    var el = artEl() && artEl().querySelector('.ex-nt[data-id="' + id + '"]');
    if(el) unwrapEl(el);
    saveMarks(loadMarks().filter(function(m){ return m.id !== id; }));
    renderNotes();
  }
  function newMarkId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function doHlAct(act){
    var art = artEl(); if(!art) return;
    var list = loadMarks();
    if(act === 'hl' && _hlRange){
      /* 真机考 2026 新版行为（课窝/搜狐/雅思无忧三来源一致）：
         对同一处重复高亮 → 变玫红（再点一次变回棕），双色分区标记定位词/干扰项。
         → 选区压到已有高亮时不新建（会套娃），改为 toggle 这些高亮的玫红态。 */
      var hitHl = marksInRange(_hlRange).filter(function(sp){ return sp.classList.contains('ex-hl'); });
      if(hitHl.length){
        var ids = {}, toRep = !hitHl[0].classList.contains('rep');
        hitHl.forEach(function(sp){ var i = sp.getAttribute('data-id'); if(i) ids[i] = 1; sp.classList.toggle('rep', toRep); });
        list.forEach(function(m){ if(ids[m.id]){ if(toRep) m.rep = 1; else delete m.rep; } });
        saveMarks(list);
      } else {
        var q = selQuote(_hlRange);
        if(q){
          var id = newMarkId('h');
          if(wrapRange(_hlRange, 'ex-hl', id)){
            list.push({ id: id, kind: 'hl', text: q.text, pre: q.pre, post: q.post });
            saveMarks(list);
          }
        }
      }
      var s = window.getSelection(); if(s) s.removeAllRanges();
    } else if(act === 'note' && _hlRange){
      var q2 = selQuote(_hlRange);
      if(q2){
        var id2 = newMarkId('n');
        if(wrapRange(_hlRange, 'ex-nt', id2)){
          list.push({ id: id2, kind: 'nt', text: q2.text, pre: q2.pre, post: q2.post, note: '' });
          saveMarks(list);
          var sp = document.getElementById('exSplit'); if(sp) sp.classList.add('hasnotes');
          renderNotes(); focusNote(id2);
        }
      }
      var s2 = window.getSelection(); if(s2) s2.removeAllRanges();
    } else if(act === 'unhl'){
      /* 取消标注：选区压到几个就取消几个；右键只压到一个就走 _hlSpan 那条 */
      var spans = _hlRange ? marksInRange(_hlRange) : (_hlSpan ? [_hlSpan] : []);
      if(spans.length){
        var ids = {};
        spans.forEach(function(sp){
          var i = sp.getAttribute('data-id'); if(i) ids[i] = 1;
          unwrapEl(sp);
        });
        saveMarks(list.filter(function(m){ return !ids[m.id]; }));
        renderNotes();
        var s3 = window.getSelection(); if(s3) s3.removeAllRanges();
      }
    }
    /* 10/16 删：`clearall` 分支（清空本篇全部标注）—— 真实机考没有这个功能，她明确要求下线
       （「真题里没有的功能不要加」）。按钮已从 ctxHtml 移除，这里一并删掉处理分支，
       避免留下「没有入口却还能被调」的死路径。 */
    _hlRange = null; _hlSpan = null;
  }
  function hlReset(){
    _hlRange = null; _hlSpan = null; _hlCache = null;
    closeCtx();
    var sp = document.getElementById('exSplit'); if(sp) sp.classList.remove('hasnotes');
  }

  /* ===== 划词浮动工具条（选中即弹）—— 定位 / 显隐 / 开合 =====
     成熟做法（四来源一致）：锚在选区上方、上方没空间翻下方、左右不出屏、点按钮不清选区。 */
  function marksInRange(range){
    var art = artEl(); if(!art || !range) return [];
    var out = [];
    art.querySelectorAll('.ex-hl, .ex-nt').forEach(function(sp){
      try{ if(range.intersectsNode(sp)) out.push(sp); }catch(e){}
    });
    return out;
  }
  function closeCtx(){ var c = document.getElementById('exCtx'); if(c) c.classList.remove('on'); }
  function placeCtx(rect){
    var ctx = document.getElementById('exCtx'); if(!ctx || !rect) return;
    ctx.classList.add('on');                        /* 先显示才能量到宽高 */
    var w = ctx.offsetWidth, h = ctx.offsetHeight;
    var x = rect.left + rect.width / 2 - w / 2;      /* 水平居中于选区 */
    var y = rect.top - h - 8;                        /* 优先选区上方 */
    if(y < 8) y = rect.bottom + 8;                   /* 上方没空间 → 翻到下方 */
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    ctx.style.left = x + 'px';
    ctx.style.top = y + 'px';
  }
  /* 按钮显隐规则（10/16 按真实机考校正）：
      · 有选区且是普通文字 → Highlight + Note；
      · 压到已有笔记 → Note 隐藏（再记会套娃）；
      · 压到任何已有标注（或右键单个标注）→ Clear Highlight。
     没有可显示的按钮就不弹工具条（返回 false）。 */
  function paintCtxButtons(){
    var ctx = document.getElementById('exCtx'); if(!ctx){ return false; }
    var hasR = !!_hlRange, span = !!_hlSpan;
    var spans = hasR ? marksInRange(_hlRange) : [];
    var overlapHl = spans.some(function(sp){ return sp.classList.contains('ex-hl'); });
    var overlapNt = spans.some(function(sp){ return sp.classList.contains('ex-nt'); });
    var canClear = overlapHl || overlapNt || span;
    function set(act, on){
      var b = ctx.querySelector('[data-hact="' + act + '"]');
      if(b){ b.style.display = on ? '' : 'none'; }
    }
    set('hl', hasR && !canClear);
    set('note', hasR && !overlapNt && !canClear);
    set('unhl', canClear);
    var hr = ctx.querySelector('hr');
    /* 分隔线只在「左半边确实有按钮」时才画：压到已有标注时 Highlight/Note 都藏了，
       再留一条竖线会变成孤零零一根（她最反感的「多余标注」）。 */
    if(hr){ hr.style.display = (hasR && !overlapNt && !canClear) ? '' : 'none'; }
    return hasR || span;
  }
  function openCtx(range, spanEl, rect){
    var ctx = document.getElementById('exCtx'); if(!ctx) return;
    _hlRange = range || null; _hlSpan = spanEl || null;
    if(!paintCtxButtons()){ closeCtx(); return; }
    placeCtx(rect);
  }

  function applyAnswer(qn, val){
    var root = document.getElementById('examRoot'); if(!root) return;
    var inp = root.querySelector('input.ex-blank[data-q="' + qn + '"]');
    if(inp){
      inp.value = Array.isArray(val) ? (val[0] || '') : val;
      var w = inp.closest('.ex-blankw');
      if(w) w.classList.toggle('filled', !!inp.value);   /* 三态同步：草稿恢复后显示内容而非数字 */
      return;
    }
    var sel = root.querySelector('select[data-q="' + qn + '"]');
    if(sel){ sel.value = val; return; }
    /* 10/16 三修：段落匹配矩阵 radio（官方答题卡形态）——草稿恢复/答案回显按 value 勾选 */
    var mxr = root.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + qn + '"]');
    if(mxr){
      root.querySelectorAll('#examRoot .ex-lomatrix input[type=radio][data-q="' + qn + '"]').forEach(function(r){ r.checked = false; });
      var hit = root.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + qn + '"][value="' + val + '"]');
      if(hit) hit.checked = true;
      return;
    }
    var box = cboxForQ(qn);
    if(box){
      var need = Number(box.getAttribute('data-need') || 0);
      var arr = Array.isArray(val) ? val.slice() : (val ? [val] : []);
      /* 10/16：旧草稿里可能存着超限的勾选（限数修复前留下的）→ 恢复时裁到 need，避免「又超限了」 */
      if(need && arr.length > need) arr = arr.slice(0, need);
      box.querySelectorAll('input[type=checkbox]').forEach(function(c){ c.checked = arr.indexOf(c.value) > -1; });
      syncCboxDis(box);
      return;
    }
    var pills = root.querySelector('.ex-pills[data-q="' + qn + '"]');
    if(pills){ pills.querySelectorAll('.ex-pill').forEach(function(p){ p.classList.toggle('on', p.getAttribute('data-v') === val); }); return; }
    var rb = root.querySelector('.ex-radio-box[data-q="' + qn + '"]');
    if(rb){ rb.querySelectorAll('input').forEach(function(i){ i.checked = (i.value === val); }); return; }
    var dp = root.querySelector('.ex-drop[data-q="' + qn + '"]');
    if(dp){
      var dv = (val == null) ? '' : String(val);
      if(dv && dgPoolChip(dv, dp.getAttribute('data-g'))) dgPlace(dp, dv, true);
    }
    var ps = root.querySelector('.ex-pslot[data-v="' + esc(String(val == null ? '' : val)) + '"]:not([data-q])');
    if(ps){ lohPlace(ps, qn, true); return; }
    var lv = root.querySelector('.ex-lohb[data-q="' + qn + '"]');
    if(lv){
      /* 兜底：该字母的槽被别的题占了（数据里同字母多题）→ 只显示答案不进槽 */
      var row = lv.closest('.ex-q'), v2 = row ? row.querySelector('.ex-lohv') : null;
      if(v2){ v2.textContent = (val == null ? '' : String(val)); if(val != null && val !== '') v2.setAttribute('data-q', qn); else v2.removeAttribute('data-q'); }
      return;
    }
  }
  /* 按题号找多选框：先找自带 data-q 的，再找 data-share 里共享给它的（10/16 共享选项组）。
     草稿恢复/答案回显都要能通过共享题号找到那份唯一选项框。 */
  function cboxForQ(qn){
    var root = document.getElementById('examRoot'); if(!root) return null;
    var boxes = root.querySelectorAll('.ex-cbox[data-q]');
    for(var i = 0; i < boxes.length; i++){
      if(boxes[i].getAttribute('data-q') === qn) return boxes[i];
      var sh = (boxes[i].getAttribute('data-share') || '').split(/[\s,]+/);
      if(sh.indexOf(qn) > -1) return boxes[i];
    }
    return null;
  }
  /* 多选限数的「选满变灰」：need 个勾满 → 未勾的选项 dis；否则全恢复。
     ⚠️ 统计口径必须与 CSS 选中态一致：选中靠 :has(input:checked) 渲染，
     所以这里也统计 input.ex-check:checked，不能数 .on class（10/12 T14 实测踩坑）。
     ⚠️ dis 必须同时禁用 input —— 只加 class 的话键盘 Tab 到 input 仍能勾，绕过限数（10/12 复查抓到的）。 */
  function syncCboxDis(box){
    if(!box) return;
    var need = Number(box.getAttribute('data-need') || 0);
    if(!need) return;
    var onN = box.querySelectorAll('input.ex-check:checked').length;
    box.querySelectorAll('.ex-opt').forEach(function(lb){
      var cb = lb.querySelector('input.ex-check');
      var dis = onN >= need && cb && !cb.checked;
      lb.classList.toggle('dis', dis);
      if(cb) cb.disabled = !!dis;
    });
  }

  function collect(){
    var root = document.getElementById('examRoot');
    var out = {};
    /* 完整模考：未渲染的那两篇答案只在 EX.user 里 → 先铺底，再用 DOM 现值覆盖 */
    if(EX && EX.user){ Object.keys(EX.user).forEach(function(k){ out[k] = EX.user[k]; }); }
    if(!root) return out;
    var domKeys = {};
    root.querySelectorAll('[data-q]').forEach(function(el){
      var k = el.getAttribute('data-q');
      if(k){ domKeys[k] = 1; delete out[k]; }        /* 当前渲染出来的题以 DOM 为准（可能刚被清空） */
    });
    root.querySelectorAll('input.ex-blank[data-q]').forEach(function(i){
      if(i.getAttribute('data-q') && i.value.trim()) out[i.getAttribute('data-q')] = i.value.trim();
    });
    root.querySelectorAll('.ex-pills[data-q]').forEach(function(p){
      var on = p.querySelector('.ex-pill.on'); if(on) out[p.getAttribute('data-q')] = on.getAttribute('data-v');
    });
    root.querySelectorAll('.ex-cbox[data-q]').forEach(function(b){
      var vals = []; b.querySelectorAll('input:checked').forEach(function(c){ vals.push(c.value); });
      /* 10/16 共享选项组（Questions X–Y Choose N）：一份选项全组共用 → 勾选值同步写给
         data-share 里的每个题号；取消勾选时也要显式 delete（这些题号没有自己的 data-q 元素，
         domKeys 兜底删不到，不删会残留上一条草稿的旧答案）。 */
      var keys = [b.getAttribute('data-q')];
      var sh = b.getAttribute('data-share') || '';
      if(sh) keys = keys.concat(sh.split(/[\s,]+/).filter(Boolean));
      keys.forEach(function(k){
        if(vals.length) out[k] = vals.slice(); else delete out[k];
      });
    });
    root.querySelectorAll('.ex-radio-box[data-q]').forEach(function(b){
      var c = b.querySelector('input:checked'); if(c) out[b.getAttribute('data-q')] = c.value;
    });
    root.querySelectorAll('.ex-drop[data-q]').forEach(function(d){
      var v = d.getAttribute('data-v');
      if(v) out[d.getAttribute('data-q')] = v;
    });
    /* 段落信息匹配：槽位（data-q=题号, data-v=段落字母）为主，行尾答案为兜底 */
    root.querySelectorAll('.ex-pslot[data-q]').forEach(function(s){ out[s.getAttribute('data-q')] = s.getAttribute('data-v'); });
    root.querySelectorAll('.ex-lohv[data-q]').forEach(function(v){ var t = v.textContent.trim(); if(t) out[v.getAttribute('data-q')] = t; });
    root.querySelectorAll('select[data-q]').forEach(function(s){ if(s.value) out[s.getAttribute('data-q')] = s.value; });
    /* 10/16 三修：段落匹配矩阵（官方答题卡形态）——每题一格 radio，值 = 段落字母 */
    root.querySelectorAll('#examRoot .ex-lomatrix input[type=radio]:checked').forEach(function(c){
      out[c.getAttribute('data-q')] = c.value;
    });
    /* 完整模考：没渲染成控件的题（另外两篇 / 漏渲染）→ 保留 EX.user 里已存的值 */
    if(EX && EX.full){
      qsOfPassage(EX.curP).forEach(function(e){
        var k = String(e.g);
        if(domKeys[k]) return;
        if(EX.user && EX.user[k] != null) out[k] = EX.user[k];
      });
    }
    return out;
  }

  function allNums(){
    if(EX && EX.full && EX.qs) return EX.qs.map(function(e){ return String(e.g); });
    var nums = [];
    (EX && EX.groups || []).forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); });
    return nums;
  }

  function saveDraft(){
    if(!EX) return;
    var c = collect();
    EX.user = c;
    try{
      if(EX.full && EX.channel === 'listening') localStorage.setItem('hub_bank_full_l_draft', JSON.stringify({ ids: EX.ids, user: c, ts: Date.now() }));
      else if(EX.full) localStorage.setItem('hub_bank_full_draft', JSON.stringify({ ids: EX.ids, user: c, ts: Date.now() }));
      else localStorage.setItem('hub_bank_draft_' + EX.unit.id, JSON.stringify(c));
      exSavedFlash();   /* 10/15 对标爱听写：顶栏右侧亮一下「Saved」，让她确信作答已落盘 */
    }catch(e){}
  }

  /* 10/15 自动保存指示（爱听写顶栏同款「Saved」）：写盘成功后亮 1.6s 再隐。
     只在真的写成功时亮 —— 写失败（隐私模式/配额满）不亮，避免「假承诺」。 */
  var _savedT = null;
  function exSavedFlash(){
    var el = document.getElementById('exSaved'); if(!el) return;
    el.hidden = false; el.classList.add('on');
    if(_savedT) clearTimeout(_savedT);
    _savedT = setTimeout(function(){ el.classList.remove('on'); }, 1600);
  }

  function paintSheet(){
    var root = document.getElementById('examRoot'); if(!root || !EX) return;
    /* 🔴🔴🔴 10/20 22:3x 照她发来的爱听写真实机考截图重做（她原话「做成这个样子，你改错了」）：
       底栏只展开【当前 Part】的题号（截图：Part 3 → 21 22 … 30），其他 Part 在 Part 行里
       只显示「x of y」已答数 / 绿勾。上一批照 IDP 英文文档改成「全卷 40 题全列」被她当场判错。
       三态照旧（爱听写 + 新西兰官方 Quick Guide「答过的题上方出现线 / flag 由方变圆」）：
       cur = 当前题黑框 / done = 数字上方黑线 / flag = 圆圈。
       单篇练习（非 full）仍旧列本篇全部题号。 */
    EX.seen = EX.seen || {};
    EX.seen[String(EX.cur)] = 1;
    var user = collect();
    /* full = 当前 Part 的题号；单篇 = 本篇全部（allNums 本来就是单篇口径） */
    var nums = (EX.full && EX.qs) ? qsOfPassage(EX.curP).map(function(e){ return e.g; }) : allNums();
    /* 10/17 复盘：交卷后题号行变「答题卡」—— 绿=对 / 红=错（爱听写 bg-green-100 / bg-red-100 口径）。
       此前交卷后只有「已答」态（一道黑线），用户看不出哪题错，只能一路滚页面逐条找。 */
    var mark = null;
    if(EX.submitted && EX.result){
      mark = {};
      EX.result.detail.forEach(function(d){ mark[String(d.qn)] = !!d.ok; });
    }
    /* 10/17「只看错题」：EX._filt='wrong' 时答题卡只列错题号（点一下跳过去）。
       不改题目本身的显示——隐藏内容会违反她「绝不切内容、绝不错位」的判据。 */
    if(EX.submitted && EX._filt === 'wrong' && mark){
      nums = nums.filter(function(n){ return mark[String(n)] === false; });
    }
    var numsHtml = nums.map(function(n){
      var k = String(n);
      var answered = user[k] != null && String(user[k]).length;
      var cls = 'ex-num';
      if(answered) cls += ' ex-num--done';
      if(EX.flagged[k]) cls += ' ex-num--flag';
      if(String(EX.cur) === k) cls += ' ex-num--cur';
      if(mark && Object.prototype.hasOwnProperty.call(mark, k)) cls += mark[k] ? ' ex-num--hit' : ' ex-num--miss';
      return '<button type="button" class="' + cls + '" data-jump="' + esc(k) + '" title="Q' + esc(k) + '">' + esc(k) + '</button>';
    }).join('');
    /* Part 行先重建（当前 Part 里才有 #exNums 容器），再把题号填进去。
       ⚠️ 顺序不能反：paintPgSwitch 会整块替换 #exParts 的 innerHTML。 */
    paintPgSwitch();
    var box = document.getElementById('exNums');
    if(box) box.innerHTML = numsHtml;
    /* W-EXTOP-1（10-25）：顶栏 ‹ › 已删 → 这段「到头置灰」随之退役（没有箭头可置灰了）。
       翻题主入口是底部 Part 题号行（.ex-nav），不受影响。 */
    /* 溢出兜底：题号行横向滚时把当前题滚进可视区（点 ‹ › 跨 Part 后用户要看得见自己在哪）。 */
    var curBtn = box && box.querySelector('.ex-num--cur');
    if(curBtn && box.scrollWidth > box.clientWidth + 2){
      var bx = curBtn.offsetLeft, bw = curBtn.offsetWidth;
      if(bx < box.scrollLeft || bx + bw > box.scrollLeft + box.clientWidth){
        box.scrollLeft = Math.max(0, bx - box.clientWidth / 2 + bw / 2);
      }
    }
  }

  /* 整卷题序（顶栏箭头「到头没」/ 前后步进用）：full = EX.byG 全部键升序；单篇 = 本篇全部。
     🔴 不能改用 `#exNums .ex-num` 的 DOM 顺序 —— 10/20 起题号行只渲染当前 Part，
     按 DOM 顺序算的话，Part 1 最后一题就会被当成「最后一题」把 › 置灰。 */
  function allOrder(){
    if(!EX) return [];
    if(EX.full && EX.byG){
      var ks = Object.keys(EX.byG).map(Number).filter(function(n){ return !isNaN(n); });
      ks.sort(function(a, b){ return a - b; });
      if(ks.length) return ks;
    }
    return allNums().map(Number);
  }
  /* 做完的 Part 的绿勾（爱听写实证：☑ Part 2，绿底白勾小方块） */
  function icoCheck(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
  }

  /* Part 行（full 模式才有）—— 🔴 10/20 22:3x 照她发来的爱听写真实机考截图重画
     （她原话「底栏听力阅读模考的做成这个样子，你改错了」）：
       · 当前 Part：加粗篇名 + 紧跟本 Part 全部题号（题号容器就是 #exNums，paintSheet 填）
       · 其他 Part：篇名 + 灰色「x of y」已答数
       · 已做完的 Part：绿色小勾 + 篇名（截图：☑ Part 2），不显示数字
       · 点击切换 Part 的功能不变（10/15 她拍板「各个 Part 是可以这样切换的」）
       · ⚠️ .ex-pt 从 <button> 改成 <div role="button" tabindex="0">：当前 Part 里要嵌题号
         <button>，而 <button> 不能嵌套 <button>（HTML 解析器会强行截断外层，DOM 直接烂掉）。
         键盘 Enter/Space 激活在 keydown 监听里补（见文件末尾）。
     阅读文案 = Passage N（官方卷面用词，10/15 与爱听写核对过）；听力 = Part N；写作 = Task N。 */
  function paintPgSwitch(){
    var parts = document.getElementById('exParts');
    if(!parts) return;                      /* 单篇模式没有 Part 行，只有题号行 */
    if(!EX || !EX.full){ parts.innerHTML = ''; return; }
    var isL = EX.channel === 'listening', isW = EX.channel === 'writing';
    /* 10/15 口径对齐官方/爱听写：阅读是 Passage 1/2/3（官方卷面用词），听力才是 Part 1–4，
       写作两篇是 Task 1/2。此前阅读也写 Part（10/15 并排切换器那批的副作用），本次纠回。 */
    var lbl = isL ? 'Part' : (isW ? 'Task' : 'Passage');
    var n = isL ? 4 : (isW ? 2 : 3);
    var user = collect();
    /* 手机/窄桌面缩写：P1/P2…（省宽度）。
       🔴 10/20 阈值 860 → 1180：1080/1280 窄桌面里「Passage 1 0 of 13」四个全称会把
       题号行挤到剩二十几个、还得横向滑。题号导航是官方底栏的核心信息，优先级高于全称。 */
    var narrow = window.matchMedia && window.matchMedia('(max-width:1180px)').matches;
    var h = '';
    for(var pi = 1; pi <= n; pi++){
      var on = (pi === EX.curP);
      var txt = narrow ? ('P' + pi) : (lbl + ' ' + pi);
      h += '<div class="ex-pt' + (on ? ' on' : '') + '" data-pg="' + pi + '" role="button" tabindex="0"'
        + (on ? ' aria-current="true"' : '') + '>';
      if(isW){ h += '<span class="ex-pt-t">' + txt + '</span></div>'; continue; }
      var list = qsOfPassage(pi) || [];
      var tot = list.length, done = 0;
      list.forEach(function(e){ if(user[e.g] != null && String(user[e.g]).length) done++; });
      var alldone = tot > 0 && done === tot;
      if(alldone) h += '<span class="ex-pt-ck" aria-hidden="true">' + icoCheck() + '</span>';
      h += '<span class="ex-pt-t">' + txt + '</span>';
      if(on) h += '<span class="ex-nums" id="exNums"></span>';           /* 当前 Part 展开题号 */
      else if(!alldone) h += '<span class="ex-pt-n">' + done + ' of ' + tot + '</span>';
      h += '</div>';
    }
    parts.innerHTML = h;
  }

  /* 🔴 10/18 修既有 bug（本批搭车）：跳题锚点选择器长期是错的。
     原来写的 `.ex-qn[data-qn]` 与 `input.ex-blank[data-q]` 在真实 DOM 里都**不存在**
     （题号宽框只有 data-qns；填空 input 没有 ex-blank 类），所以除「多选合并组」外，
     点题号行/答题卡基本不会滚动 —— 属于「点了没反应、也不报错」那类最难自查的失灵。
     改按真实 DOM 找锚点，并滚到整行（只有小旗子会被滚到屏幕中间、看着像没动）。 */
  function qAnchor(n){
    var root = document.getElementById('examRoot'); if(!root) return null;
    return root.querySelector('.ex-qn[data-qns~="' + n + '"]')
        || root.querySelector('.ex-flagq[data-qn="' + n + '"]')
        || root.querySelector('.ex-blankw[data-q="' + n + '"]')
        || root.querySelector('input[data-q="' + n + '"]');
  }
  function scrollToQ(n){
    var el = qAnchor(n);
    if(!el) return;
    var row = (el.closest && el.closest('.ex-q')) || el;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function goTo(n, edit){
    if(!EX) return;
    n = Number(n);
    if(EX.full){
      var ent = EX.byG[n]; if(!ent) return;
      if(ent.p !== EX.curP){
        if(EX.channel === 'listening') renderListenPart(ent.p);   /* 听力完整模考：切 Part（单栏壳） */
        else renderPassage(ent.p);                                /* 阅读完整模考：切 Passage（分栏壳） */
      }
      EX.cur = n;
      paintSheet();
      scrollToQ(n);
      if(edit && !EX.submitted) focusBlank(n);
      return;
    }
    EX.cur = n;
    paintSheet();
    scrollToQ(n);
    if(edit && !EX.submitted) focusBlank(n);
  }
  /* 双击 Tab 跳到下一题：若该题是填空，直接进输入态 */
  function focusBlank(n){
    var w = document.querySelector('#examRoot .ex-blankw[data-q="' + n + '"]');
    if(w){ var i = w.querySelector('input'); if(i) i.focus(); }
  }

  /* ===== 计时（倒计时，格式与写作机考一致：时:分:秒）=====
     双档提醒对齐真机考「10 分钟和 5 分钟自动闪烁」（eickaopei 机考复盘）：
       10 分钟 = 琥珀色常亮（轻提醒，不闪 —— 还有 10 分钟就闪会干扰答题）
        5 分钟 = 红色闪烁（强提醒）
     到点 = 强制交卷（所有成熟机考模拟器的通例；原文 `left<=0` 只是停表，考卷会一直挂在那）。 */
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  /* 10/13 Pause 支持：暂停时把剩余秒数存 EX._leftSec，resume 用它重启倒计时（不重算、不丢已过时间）。 */
  function startTimer(sec){
    stopTimer();
    /* 10/16：记下开局时长 —— 复盘要显示「用时」= 开局秒 − 剩余秒（此前没有 elapsed 概念）。
       🔴 只在头一次赋值：resumeExam() 也走 startTimer(EX._leftSec)，每次都覆盖的话
       「开局时长」会被改写成「剩余秒」，暂停一次用时就算错。 */
    if(EX && EX._totalSec == null) EX._totalSec = sec;
    var left = sec, el = document.getElementById('exTimer');
    function tick(){
      if(el){
        /* W-EXTOP-1（10-25）：她「模考页面我就叫你改一个计时的 UI」→ 顶栏计时改官方**分钟制**。
           原来 HH:MM:SS，现在固定「N minutes remaining」（N = Math.floor(left/60)，不显示秒）。
           ⚠️ 单数不特判：官方自己就写「1 minutes remaining」，照抄（施工书 §一 规则 2）。
           ⚠️ 颜色分级一行不动：下面两条 classList.toggle 原样保留（warn ≤300s / soon ≤600s）。 */
        el.textContent = Math.floor(left / 60) + ' minutes remaining';
        el.classList.toggle('warn', left <= 300 && left > 0);
        el.classList.toggle('soon', left <= 600 && left > 300);
      }
      /* 10/14 听力顶栏一行化：音频条里的整场计时同步刷新（标题行 CSS 隐藏但 JS 仍跑，双写保平安）
         10/18：听力单篇的计时已搬进音频条（#eaFullTimer），这里同步给 10/5 分钟双档警示色。 */
      var ft = document.getElementById('eaFullTimer');
      if(ft){
        var fh = Math.floor(left / 3600), fm = Math.floor((left % 3600) / 60), fs2 = left % 60;
        ft.textContent = pad2(fh) + ':' + pad2(fm) + ':' + pad2(fs2);
        ft.classList.toggle('warn', left <= 300 && left > 0);
        ft.classList.toggle('soon', left <= 600 && left > 300);
      }
      if(EX) EX._leftSec = left;
      if(left <= 0){ stopTimer(); doSubmit(); return; }
      left--;
    }
    tick(); _timer = setInterval(tick, 1000);
  }
  function stopTimer(){ if(_timer){ clearInterval(_timer); _timer = null; } }

  /* ===== Pause / Resume（10/13 她报「Pause 是个摆设」→ 本批实现）=====
     语义按成熟站双模式口径：真机考录音不可暂停（BC 官方 FAQ「The Listening and Speaking tests
     are a recording and cannot be paused」；Zoju Strict/Breath、ieltsfreepractice Practice/Exam
     同款）→ 本站 Pause 只属于练习模式（考试模式/听力完整模考连按钮都不渲染，见 barHtml）。
     暂停 = 音频停 + 考试倒计时停（剩余秒数入 EX._leftSec）；按钮变 Resume，再点恢复。 */
  /* W-EXTOP-1（10-25）：底栏 #exPauseBtn 与顶栏 #exTopPauseBtn 的状态**一处刷**，
     避免「两处 if 各自漂移」（施工书 §二.2 明确要求抽函数）。
     ⚠️ 底栏保持英文 Pause/Resume（与官方一致）；顶栏按设计稿用中文「暂停/继续」。 */
  function paintPauseBtn(){
    var on = !!(EX && EX.paused);
    ['exPauseBtn', 'exTopPauseBtn'].forEach(function(id){
      var b = document.getElementById(id);
      if(!b) return;
      if(id === 'exTopPauseBtn') b.textContent = on ? '继续' : '暂停';
      else b.textContent = on ? 'Resume' : 'Pause';
      b.classList.toggle('on', on);
    });
  }
  function pauseExam(){
    if(!EX || EX.submitted || EX.paused) return;
    if(EX.listenMode === 'exam') return;                   /* 考试模式没有暂停（按钮也不渲染，双保险） */
    EX.paused = true;
    if(EX._leftSec == null) EX._leftSec = 60 * 60;
    stopTimer();
    var a = document.getElementById('exAudio');
    EX._wasPlaying = !!(a && !a.paused);
    if(a) a.pause();
    paintPauseBtn();
    paintFtMini();
  }
  function resumeExam(){
    if(!EX || !EX.paused) return;
    EX.paused = false;
    startTimer(EX._leftSec == null ? 60 * 60 : EX._leftSec);
    var a = document.getElementById('exAudio');
    if(a && EX._wasPlaying) a.play();
    paintPauseBtn();
    paintFtMini();
  }

  /* ===== 顶栏计时小徽章（#exFtMini，10/13 她报「左下绿胶囊太明显，放时间旁边、小一点」）=====
     考场内隐藏全站 floatTimer（common.js syncFloatTimer 已扩判断），改在顶栏显示同数据源的小徽章：
     window.active（计时页实时态）优先，回落 DATA.activeTimer 云端镜像；口径与 floatTimer 一致
     （正计时/倒计时、暂停中/计时中）。暂停态由 pauseExam 直接 paintFtMini() 刷，不等 1s。 */
  function ftSource(){
    if(window.active && window.active.startTs && !window.active.ended) return window.active;
    var m = (typeof DATA !== 'undefined') && DATA.activeTimer;
    if(m && !m.ended && m.startTs) return m;
    return null;
  }
  function ftSec(src){
    if(!src || !src.startTs) return 0;
    var now = Date.now(), pause = Number(src.pauseAccum) || 0;
    if(src.paused && src.pauseStart) pause += (now - src.pauseStart);
    var el = (now - src.startTs - pause) / 1000;
    if(src.paused && src.pauseStart) el = (src.pauseStart - src.startTs - (Number(src.pauseAccum) || 0)) / 1000;
    return Math.max(0, el);
  }
  function paintFtMini(){
    var box = document.getElementById('exFtMini'); if(!box) return;
    var src = ftSource();
    if(!src){ box.hidden = true; return; }
    /* 🔴 考试页零中文铁律（10/11 她定）：徽章文案纯英文最小集（Timing/Paused + 时间），
       不显示中文模块名（ bankTimerModule 的「听力模考」只用于落库，不上屏）。 */
    var lb = document.getElementById('exFtLabel'), tm = document.getElementById('exFtTime');
    if(lb) lb.textContent = (src.paused || (EX && EX.paused)) ? 'Paused' : 'Timing';
    if(tm){
      var s = ftSec(src);
      if(src.mode === 'down' && src.targetSec) s = Math.max(0, (Number(src.targetSec) || 0) - s);
      tm.textContent = (typeof fmtHMS === 'function') ? fmtHMS(s) : '00:00:00';
    }
    box.hidden = false;
  }
  function startFtMini(){ stopFtMini(); paintFtMini(); _ftTimer = setInterval(paintFtMini, 1000); }
  function stopFtMini(){ if(_ftTimer){ clearInterval(_ftTimer); _ftTimer = null; } }

  /* ===== C-3 模考时长计入「今日专注」（她 10/12 拍板「计入」，与口语/写作模考一致）=====
     照搬 speaking.js maybeStartSpkTimer / commitSpkTimer 范式（那边 9/22 定版）：
     · 开考即开一个「阅读/听力」计时表（moduleId 对齐 data.js MODULES 的 reading/listening）
     · 三种结算路径全覆盖：交卷 doSubmit / 未交卷退出 exitExam / 刷新关闭（写 DATA.activeTimer
       镜像，由 common.js settleOrphanActiveTimer 心跳>10min 遗弃自愈兜底，不自己造恢复逻辑）
     · durationSec = 实际做题时长（startTs→结算，扣暂停），与页内考试倒计时并行不混用
     · <30s 误点不落 session（与口语 autostart 同口径，她 9/26 拍板） */
  var BANK_TIMER_MIN_SEC = 30;
  function bankTimerModule(){
    var ch = (EX && EX.channel) || 'reading';
    return ch === 'listening'
      ? { moduleId: 'listening', moduleName: '听力', subId: 'bank_listening', subName: '听力模考' }
      : { moduleId: 'reading',   moduleName: '阅读', subId: 'bank_reading',   subName: '阅读模考' };
  }
  function bankStartTimer(){
    if(!EX) return;
    try{
      /* 已有本模块的表在计（含刷新恢复的）→ 不重复开；别的模块在计 → 先正规结算再开新表 */
      var m = DATA.activeTimer;
      var cur = (window.active && !window.active.ended) ? window.active
              : ((m && !m.ended && m.timerId) ? m : null);
      if(cur && cur.moduleId === bankTimerModule().moduleId && cur.subId === bankTimerModule().subId) return;
      if(cur) bankSettleForeignTimer();
      var now = Date.now(), id = uid(), mm = bankTimerModule();
      window.active = {
        timerId: id, moduleId: mm.moduleId, moduleName: mm.moduleName,
        subId: mm.subId, subName: mm.subName,
        startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
        mode: 'up', updatedAt: now, lastBeat: now
      };
      DATA.activeTimer = {
        timerId: id, moduleId: mm.moduleId, moduleName: mm.moduleName,
        subId: mm.subId, subName: mm.subName,
        startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
        mode: 'up', updatedAt: now, lastBeat: now, ended: false
      };
      hubSave();
    }catch(e){ console.warn('[bank] 计时开表失败', e); }
  }
  /* 正规结算「其他模块」的进行中计时（背词/口语/手动）：时长记到当前时刻，绝不丢表。
     与 speaking.js spkSettleForeignTimer 同构（含 resolveTimerNames 名称解析 + 同 timerId 去重）。 */
  function bankSettleForeignTimer(){
    var a = (window.active && !window.active.ended) ? window.active
            : ((DATA.activeTimer && !DATA.activeTimer.ended && DATA.activeTimer.timerId) ? DATA.activeTimer : null);
    if(!a) return;
    var timerId = a.timerId, endTs = Date.now();
    var pause = Number(a.pauseAccum) || 0;
    if(a.paused && a.pauseStart) pause += (endTs - a.pauseStart);
    var durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs) - pause) / 1000));
    if(durationSec > 0 && !(DATA.sessions || []).some(function(s){ return s.timerId && s.timerId === timerId; })){
      DATA.sessions = DATA.sessions || [];
      var names = (typeof resolveTimerNames === 'function')
        ? resolveTimerNames(a)
        : { moduleName: a.moduleName || '学习', subName: a.subName || '' };
      DATA.sessions.push({
        id: uid(), timerId, date: todayKey(a.startTs),
        moduleId: a.moduleId, subId: a.subId || a.moduleId,
        moduleName: names.moduleName, subName: names.subName,
        startTs: a.startTs, endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
      });
    }
    window.active = null;
    DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
    hubSave();
  }
  function bankCommitTimer(){
    try{
      var a = window.active;
      if(!a || a.ended){ window.active = null; return; }
      var timerId = a.timerId, endTs = Date.now();
      var pause = Number(a.pauseAccum) || 0;
      if(a.paused && a.pauseStart) pause += (endTs - a.pauseStart);
      var durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs) - pause) / 1000));
      if(durationSec >= BANK_TIMER_MIN_SEC && !(DATA.sessions || []).some(function(s){ return s.timerId && s.timerId === timerId; })){
        DATA.sessions = DATA.sessions || [];
        DATA.sessions.push({
          id: uid(), timerId, date: todayKey(a.startTs),
          moduleId: a.moduleId, subId: a.subId || a.moduleId,
          moduleName: a.moduleName, subName: a.subName,
          startTs: a.startTs, endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
        });
      }
      window.active = null;
      DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
      hubSave();
      try{
        document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
        document.dispatchEvent(new CustomEvent('hub:timer-state'));
      }catch(e){}
    }catch(e){ console.warn('[bank] 计时结算失败', e); }
  }
  /* 心跳 30s 节流：刷 lastBeat + DATA.activeTimer 镜像（settleOrphanActiveTimer 靠它判活，
     缺心跳会被当遗弃表提前结算）。hubSave 自带 debounce，不担心写放大。 */
  if(!window.__bankTimerBeat){
    window.__bankTimerBeat = setInterval(function(){
      var a = window.active;
      if(!a || a.ended) return;
      var now = Date.now();
      a.lastBeat = now; a.updatedAt = now;
      if(DATA.activeTimer && DATA.activeTimer.timerId === a.timerId){
        DATA.activeTimer.lastBeat = now; DATA.activeTimer.updatedAt = now;
      }
      hubSave();
    }, 30000);
  }
  /* 关标签兜底：beforeunload 结算（与口语同款）。刷新/崩溃没跑到的，
     由 common.js settleOrphanActiveTimer 按心跳>10min 遗弃自愈，不自己造恢复逻辑。 */
  if(!window.__bankTimerLeaveHook){
    window.__bankTimerLeaveHook = true;
    window.addEventListener('beforeunload', function(){ try{ bankCommitTimer(); }catch(e){} });
  }

  /* ===== 判分 =====
     10/16 二修：共享选项组（一份选项全组共用）的判分必须按**组答案集合**比，不能按单题 key。
     题库两种答案存储并存：① 同一对字母存两题（Playing Soccer 20/21 都存 "C,E"）
     ② 两个字母拆到两题（Learning from the Romans 21="A" 22="C"）。collect 把整组勾选写给每题，
     若逐题比单题 key，②型会全判错（用户勾 A,C → 与 key "A" 不等）。真机考口径 =
     "21 & 22 IN EITHER ORDER: A, C" → 勾选集合 == 组答案集合 ⇒ 组内每题都算对。 */
  function setEq(ua, gset){
    return !!gset && ua.map(function(x){ return String(x).toLowerCase(); }).sort().join(',') === gset;
  }
  function judgeOne(key, alts, ua){
    if(Array.isArray(ua)){
      var rset = String(key || '').toLowerCase().split(/[,\s\/]+/).filter(Boolean).sort().join(',');
      var ok = !!rset && ua.map(function(x){ return String(x).toLowerCase(); }).sort().join(',') === rset;
      return { ok: ok, shown: ua.join(',') };
    }
    return { ok: eqAns(ua, key, alts), shown: ua };
  }
  /* 10/17 #9 层次 3：逐题明细的题型口径。
     必须与 groupHtml 的渲染分支一致（她 10/15 纠正：「段落匹配题和 heading 题是两种题型，不能混为一谈」）：
       · fill-in-the-blank        → 填空题
       · matching + 选项是罗马数字 → Heading 题（List of Headings）
       · matching                 → 匹配题
       · map + 阅读                → 段落匹配题（Matching Information，答案=段落字母 A–I）
       · map + 听力                → 地图题（靠配图作答）
       · multiple-choice / single-choice → 多选题 / 单选题
     只落一个短代码进 detail（约 6B/题）；标签文案在回顾页（js/scores.js 的 QTYPE_LABELS），
     这里不写中文 —— 考试页全英文，且代码短、跨版本稳定。 */
  function qtypeCode(g, channel){
    if(!g) return 'other';
    var t = g.type, qs = g.questions || [];
    if(t === 'fill-in-the-blank') return 'fill';
    if(t === 'matching'){
      var opts = (g.options && g.options.length) ? g.options : ((qs[0] && qs[0].options) || []);
      var isHead = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
      return isHead ? 'head' : 'match';
    }
    if(t === 'map') return channel === 'reading' ? 'para' : 'map';
    if(t === 'multiple-choice') return 'multi';
    if(t === 'single-choice') return 'single';
    return t ? String(t) : 'other';
  }
  function score(){
    /* 10/17 B：本篇没有答案 → 不判分。空 detail + right 0 / total 0，
       调用方（doSubmit）按 EX.scored===false 走「未判分」分支，不会拿这组数当成绩。 */
    if(EX && EX.scored === false) return { right: 0, total: 0, detail: [], scored: false };
    var user = collect(), right = 0, total = 0, detail = [];
    if(EX.full){
      EX.qs.forEach(function(e){
        var key = e.pack.answers[e.loc], ua = user[e.g];
        var alts = (e.pack.alts && e.pack.alts[e.loc]) ? [].concat(e.pack.alts[e.loc]) : [];
        total++;
        var j = (e.gset && Array.isArray(ua))
          ? { ok: setEq(ua, e.gset), shown: ua.join(',') }
          : judgeOne(key, alts, ua);
        if(j.ok) right++;
        detail.push({ qn: String(e.g), user: j.shown == null ? '' : j.shown,
                      right: e.gset ? e.gset.toUpperCase() : (key == null ? '' : key), ok: !!j.ok, t: qtypeCode(e.grp, EX.channel), q: e.q });
      });
      return { right: right, total: total, detail: detail };
    }
    EX.groups.forEach(function(g){
      var gset = isSharedGroup(g) ? (g._ansSet || '') : '';
      (g.questions || []).forEach(function(q){
        var qn = String(q.qNumber), key = EX.answers[qn], ua = user[qn];
        var alts = (EX.alts && EX.alts[qn]) ? [].concat(EX.alts[qn]) : [];
        total++;
        var j = (gset && Array.isArray(ua))
          ? { ok: setEq(ua, gset), shown: ua.join(',') }
          : judgeOne(key, alts, ua);
        if(j.ok) right++;
        detail.push({ qn: qn, user: j.shown == null ? '' : j.shown,
                      right: gset ? gset.toUpperCase() : (key == null ? '' : key), ok: !!j.ok, t: qtypeCode(g, EX.channel), q: q });
      });
    });
    return { right: right, total: total, detail: detail };
  }

  function buildExpl(q){
    var a = (q && q.analyses) || [], out = '';
    for(var i = 0; i < a.length; i++){
      var label = plain(a[i].labelsOne || ''), text = plain(a[i].content || '');
      if(!text) continue;
      if(label.indexOf('句') > -1) out += '<div>原文：' + esc(text) + '</div>';
      else out += '<div>' + esc(text) + '</div>';
    }
    return out;
  }

  /* ===== 交卷 =====
     10/12 改：原来点 Submit 直接判分 → 与成熟机考不符（IDP / 申友 / 雅思哥模拟器交卷前都弹一次确认，
     并告知还有几题没答）。现在先弹确认；「时间到」的强制交卷走 doSubmit() 不经确认（没时间犹豫）。 */
  function submit(){
    if(!EX || EX.submitted) return;
    var user = collect();
    var unanswered = allNums().filter(function(n){ return user[n] == null || !String(user[n]).length; }).length;
    showSubmitConfirm(unanswered);
  }
  function showSubmitConfirm(unanswered){
    var host = document.getElementById('examRoot'); if(!host) return;
    closeSubmitConfirm();
    /* 10/18 P2-2：把本场「标记」的题号也列进交卷确认里。
       此前 flag 只影响颜色，标完没有任何后续动作（用户标了「回头再看」却没地方集中看）。
       这里做成可点题号 —— 点一个就直接跳回那道题，弹窗顺手关掉。 */
    var flags = [];
    if(EX && EX.flagged){
      Object.keys(EX.flagged).forEach(function(k){ if(EX.flagged[k]) flags.push(Number(k)); });
      flags.sort(function(a, b){ return a - b; });
    }
    var MARK_MAX = 12;
    var ov = document.createElement('div');
    ov.className = 'ex-modal'; ov.id = 'exSubmitModal';
    ov.innerHTML = '<div class="ex-modal-c" role="dialog" aria-modal="true" aria-label="Finish section">'
      + '<h4>Finish section?</h4>'
      + (unanswered
          ? '<p>You still have <b>' + unanswered + '</b> unanswered question' + (unanswered > 1 ? 's' : '') + '. '
            + 'You can go back and check them, or finish now.</p>'
            /* 10/18 P1-4：未答数从「只能看的文字」变成本按钮 —— 点了回第一道没答的题。
               未答在机考里是纯丢分，把「糊里糊涂交卷」变成「补完再交」。 */
            + '<button type="button" class="ex-modal-jump" data-sjump="first">Go to the first unanswered \u203A</button>'
          : '<p>You have answered all questions. Finish now?</p>')
      + (flags.length
          ? '<div class="ex-modal-marks"><span class="ex-modal-mk-h">Marked for review</span>'
            + flags.slice(0, MARK_MAX).map(function(n){
                return '<button type="button" class="ex-modal-chip" data-sjumpmark="' + n + '">' + n + '</button>';
              }).join('')
            + (flags.length > MARK_MAX ? '<span class="ex-modal-more">+' + (flags.length - MARK_MAX) + ' more</span>' : '')
            + '</div>'
          : '')
      + '<div class="ex-modal-b">'
      + '<button class="btn-ghost" type="button" data-scancel>Keep working</button>'
      + '<button class="btn-primary" type="button" data-sok>Finish</button>'
      + '</div></div>';
    host.appendChild(ov);
  }
  function closeSubmitConfirm(){ var m = document.getElementById('exSubmitModal'); if(m) m.remove(); }

  function doSubmit(){
    if(!EX || EX.submitted) return;
    EX.submitted = true; stopTimer(); stopFtMini();      /* 10/13：小徽章随交卷停 */
    /* 🔴 10/20：交卷 = 解锁导航（成绩与作答已落库，可以离开了），
       但**不执行**待刷新（flushHeal 不传）—— 她刚交卷要在这看成绩解析，
       此刻刷掉等于「页面乱动」。等她点 Exit 真正离开时再刷。 */
    reportExamState(false, false);
    var res = score(); EX.correct = res.right; EX.result = res;
    /* 10/17 B：本篇无答案 → 「本次未判分」。
       跳过逐题结论条（decoratePassage）、成绩卡（addScoreCard）、答题卡对错底色
       （paintSheet 的 mark 段靠 EX.result.detail，空 detail 自然不会涂色）与全部落库
       （DATA.mockRecords / hub_bank_last_*）—— 不产假分数、不写假记录。 */
    var _noAns = !!(EX && EX.scored === false);
    EX.marks = {};
    res.detail.forEach(function(d){ EX.marks[d.qn] = d.ok ? 'hit' : 'miss'; });
    if(_noAns) addNoScoreCard();

    /* 10/17：复盘状态初始化（结论条展开表）。必须在 decoratePassage 之前 —— 它要读 EX._rview。 */
    EX._rview = { open: {}, expanded: false };
    /* 用时 = 开局秒 − 剩余秒（startTimer 已记 _totalSec；EX._leftSec 每 tick 更新） */
    EX._usedSec = (EX._totalSec && EX._leftSec != null) ? (EX._totalSec - EX._leftSec) : 0;

    if(!_noAns){
      decoratePassage(EX.curP);
      addScoreCard(res);
    }
    if(isListen()) showScript();                       /* 交卷后才给听力原文 + 解锁音频复听 */

    /* C-1 回顾自动记录：阅读/听力模考成绩落库 DATA.mockRecords（回顾页直接消费，已登记云同步）
       口径：完整模考=whole 每次追加（随机组卷）；单篇=part 同日同篇覆盖（仿 writeSyncMock）。
       band 用全站统一 estimateBand（内部折算 40 题，<4 题不估分），不用本文件 bandOfXxx（口径未对齐）。 */
    /* 10/17 B：未判分不进任何统计（DATA.mockRecords） */
    if(_noAns) hubSave();
    if(!_noAns) try {
      var _ch = EX.channel === 'listening' ? 'listening' : 'reading';
      var _parts = [], _unitId = '';
      if (EX.full) {
        EX.packs.forEach(function(pk, i) {
          var tot = 0, ok = 0;
          res.detail.forEach(function(d) {
            var e = EX.byG[d.qn]; if (!e || e.p !== (i + 1)) return;
            tot++; if (d.ok) ok++;
          });
          if (tot) _parts.push({ label: 'P' + (i + 1), correct: ok, total: tot });
        });
      } else {
        /* 🔴 单篇不能用 EX.byG[d.qn] 逐篇统计 —— 单篇的 detail[].qn 是题号字符串（String(q.qNumber)），
           而 EX.byG 的键是连续整数（EX.qs.length+1），两者对不上，逐题匹配恒 0 → _parts 空 → 静默不落库。
           单篇就一段，直接用 score() 的汇总值（res.right/res.total），不需要逐题遍历。 */
        _unitId = (EX.unit && EX.unit.id) || '';
        _parts.push({ label: (EX.unit && EX.unit.title) || '单篇', correct: res.right, total: res.total });
      }
      if (_parts.length) {
        /* 🔴 老账号数据（localStorage 里的旧 DATA）可能没有 mockRecords 字段 ——
           指令只核了 data.js 的默认值，没核「旧数据迁移」这条路，首版直接 unshift 抛错被 try 吞掉
           表现为静默失败（localStorage 兜底成功、mockRecords 恒 0）。老用户缺字段要兜底建数组。 */
        if (!Array.isArray(DATA.mockRecords)) DATA.mockRecords = [];
        var _band = estimateBand(_ch, res.right, res.total);
        var _rec = {
          id: uid(), date: todayKey(),
          granularity: EX.full ? 'whole' : 'part',
          type: _ch, parts: _parts,
          src: 'bank', note: '模考自动记录'
        };
        if (_band != null) _rec.overall = _band;          /* estimateBand 可能返回 null（<4 题），此时不写 overall */
        if (_unitId) _rec.unitId = _unitId;              /* 单篇覆盖匹配用 */
        /* EXAM-PLAN-1 · E-1（10-26）：整卷记录补「这一场用了哪三篇」——「重做一遍」的地基。
           为什么必须现在补：EX.ids 一直只活在内存（见上面 startFullTest 里的 ids: picks.map…），
           落库时没写 → 每场考完就再也还原不出当时那套卷，重做只能退化成随机（等于骗人）。
           体积：3 个 id ≈ 60~80B/条，相对 detail（1~3KB）可忽略。
           同步：mockRecords 早已在 SYNC_ARRAY_FIELDS，加字段天然随云同步走，不用改白名单。
           🔴 只在 EX.full 写。单篇用 unitId —— 两者语义不同（unitId 是"覆盖匹配用的那一个篇"，
              不是"这一场用了哪几篇"），**不许合并**。 */
        if (EX.full && Array.isArray(EX.ids)) _rec.ids = EX.ids.slice();
        /* 10/17 #9 前提：逐题明细落盘。
           此前只存 parts（篇级汇总），res.detail[]（每题 qn/user/right/ok）只活在内存 → 刷新即丢，
           做「做题记录」必须先把它存住。体量：13~40 题 × 约 80B ≈ 1~3KB/次。
           ⚠️ 只存标量，不存 d.q（整个 question 对象含题干/解析，体积大且没必要）。 */
        _rec.detail = res.detail.map(function(d){
          return { qn: String(d.qn), user: d.user == null ? '' : String(d.user),
                   right: d.right == null ? '' : String(d.right), ok: !!d.ok, t: d.t ? String(d.t) : '' };
        });
        /* 用时总是写（哪怕 0）：记录页要显示「用时」，字段时有时无会让上层到处判空 */
        _rec.usedSec = Math.max(0, Math.round(EX._usedSec || 0));
        /* 单篇重做覆盖：同 date + type + src:bank + granularity:part + unitId → 改写旧条 */
        var _old = null;
        if (!EX.full && _unitId) {
          _old = DATA.mockRecords.find(function(r) {
            return r.src === 'bank' && r.granularity === 'part' && r.type === _ch
              && r.date === _rec.date && r.unitId === _unitId;
          });
        }
        if (_old) {
          _old.parts = _rec.parts;
          _old.overall = _rec.overall;                   /* 覆盖时 band 可能从 null→数字或反之 */
          if (_old.overall == null) delete _old.overall;
          _old.detail = _rec.detail;                     /* 明细随重做一起刷新 */
          _old.usedSec = _rec.usedSec;                   /* 用时随重做一起刷新 */
          _old.updatedAt = Date.now();
        } else {
          DATA.mockRecords.unshift(_rec);
        }
        /* 10/17：条数上限（每类最近 200 条）。否则几年后 DATA 会大到拖慢云同步
           （CF 免费版 KV 每天 1000 次写、单次 PUT 有体积上限）。
           只淘汰 src==='bank' 的自动记录，手工记录（回顾页录入）不动。 */
        var _bankRecs = DATA.mockRecords.filter(function(r){ return r.src === 'bank'; });
        if (_bankRecs.length > 200) {
          var _drop = _bankRecs.slice(200);
          DATA.mockRecords = DATA.mockRecords.filter(function(r){ return _drop.indexOf(r) === -1; });
        }
        hubSave();
      }
    } catch (e) { console.warn('[bank] mockRecords 落库失败', e); }

    try{
      /* 10/17 B：未判分不写「上次成绩」—— 否则列表页会显示 0/0 的假成绩 */
      if(!_noAns){
        if(EX.full){
          /* 三篇各自写各自的成绩 → 列表页每篇还能显示「上次成绩」 */
          EX.packs.forEach(function(pk, i){
            var tot = 0, ok = 0;
            res.detail.forEach(function(d){
              var e = EX.byG[d.qn]; if(!e || e.p !== (i + 1)) return;
              tot++; if(d.ok) ok++;
            });
            if(tot) localStorage.setItem('hub_bank_last_' + pk.id, JSON.stringify({ correct: ok, total: tot, ts: Date.now() }));
          });
        } else {
          localStorage.setItem('hub_bank_last_' + EX.unit.id, JSON.stringify({ correct: res.right, total: res.total, ts: Date.now() }));
        }
      }
      /* 草稿清理与判分无关：交卷即本次作答结束，照常清 */
      if(EX.full) localStorage.removeItem(EX.channel === 'listening' ? 'hub_bank_full_l_draft' : 'hub_bank_full_draft');
    }catch(e){}

    /* 10/17 B：未判分也照常走 paintSheet —— 空 detail → mark 全空 → 只显示「已答」态，不涂红 */
    paintSheet();
    /* 10/17：交卷后 Finish 按钮必须「明确已交卷」——此前只 disabled + opacity .5，
       按钮仍是实心 teal、文案还是 "Finish section"，用户（她 18:3x 原话）会以为没交上。
       改成灰底 + 文案 Submitted，与 button:disabled 的状态语义一致。 */
    var sb = document.querySelector('#examRoot [data-submit]');
    if(sb){ sb.disabled = true; sb.textContent = 'Submitted'; sb.classList.add('is-done'); }
    bankCommitTimer();                                /* C-3：交卷即结算专注计时（含 <30s 过滤） */
  }

  function exitExam(){
    stopTimer();
    stopFtMini();                                        /* 10/13：顶栏小徽章随之停 */
    dgReset();
    hlReset();
    var au = document.getElementById('exAudio');
    if(au){ try{ au.pause(); }catch(e){} }
    _audioBound = null;                                /* 音频元素随 innerHTML 一起没了，解绑记录 */
    if(EX && !EX.submitted) saveDraft();
    bankCommitTimer();                                /* C-3：未交卷退出也要结算（别只挂交卷上） */
    EX = null;
    var host = document.getElementById('examRoot'); if(host){ host.hidden = true; host.innerHTML = ''; }
    var root = document.getElementById('bankRoot'); if(root) root.style.display = '';
    /* 组卷缓存 _fullSet/_listenFullSet 已随「纯随机」口径删除（10/12）：每次 Start 现抽，无需重置 */
    boot();
    reportExamState(false, true);   /* 10/15 考试结束，可以刷新了 · 10/20 真正离开考场 → 执行待刷新 */
  }

  /* ===== 口语模考入口（10/11 第 8 项）=====
     点「开始模考」= 软导航到 speaking.html，导航 await 完成后替它点一下隐藏的「MOCK」tab。
     为什么能这么接：speaking.js 的 tab 点击是 ready() 里 addEventListener 绑的，而 softNavigate
     await 了 runPageScript → ready() 已同步跑完、处理器就位，外部 .click() 才生效。
     好处 = **口语页一行都不用改**（它的模考逻辑/题库全部原样复用）。
     🔴 10/20 她 ⑨：口语模考退出后回的是「口语」tab（bank 里 BANK），而她预期回「口语模考」tab。
     真正的出口在 js/mock.js 的 exitToBank()（退出/中断都走它）—— 已改成点隐藏的 MOCK tab。
     这里只负责「进去」，hash 不写死（speaking.js 不读 hash 还原 tab），所以入口侧无需改。 */
  function spkStartMock(){
    var go = { id: 'speaking', file: 'speaking.html', href: 'speaking.html' };
    if(typeof softNavigate !== 'function'){ location.href = 'speaking.html'; return; }
    Promise.resolve(softNavigate(go, false)).then(function(){
      var mb = document.querySelector('#tabs [data-type="MOCK"]');
      if(mb) mb.click();
    }).catch(function(err){
      /* 不写裸 catch：软导航内部虽有整页兜底，这里也留痕，避免异常被吞成「点了没反应」 */
      console.warn('[bank] 口语模考跳转失败，回退整页跳转', err);
      location.href = 'speaking.html';
    });
  }

  /* ===== 事件委托 ===== */
  if(!window.__BANK_DELEGATE){
    window.__BANK_DELEGATE = true;

    document.addEventListener('click', function(e){
      var t = e.target, el;
      /* Highlight / Note：菜单项优先 */
      if((el = t.closest && t.closest('#exCtx button'))){
        doHlAct(el.getAttribute('data-hact'));
        var cx = document.getElementById('exCtx'); if(cx) cx.classList.remove('on');
        return;
      }
      if((el = t.closest && t.closest('#exNoteClose'))){ document.getElementById('exSplit').classList.remove('hasnotes'); return; }
      if((el = t.closest && t.closest('[data-ndel]'))){ delNote(el.getAttribute('data-ndel')); return; }
      if((el = t.closest && t.closest('#exArt .ex-nt'))){ focusNote(el.getAttribute('data-id')); return; }
      /* 真机考 2026 新版：单击已高亮文字直接出 Remove Highlight（搜狐来源口径一致）。
         仅在选区折叠（真单击）时触发 —— 拖选结束浏览器补发的 click 不走这里。 */
      if((el = t.closest && t.closest('#exArt .ex-hl')) && window.getSelection().isCollapsed){
        openCtx(null, el, el.getBoundingClientRect());
        return;
      }
      /* 一级：四科 */
      if((el = t.closest && t.closest('#mockTabs .pill-tab'))){
        var _mt = el.getAttribute('data-mtab');
        paintTab(_mt);
        /* 10/11 第 7 项：写作 pane 的真题列表由 writing.js 提供（函数挂在 window 上）。
           每次切进来重渲染一次 —— 刚练完一道题回来，✓/上次分数才会即时更新。
           10/17 性能批：这两个脚本已改为按需加载（见 loadWritingScripts），所以这里
           要先等它们到位再渲染；已加载过则直接进 then（缓存命中，无额外等待）。 */
        if(_mt === 'writing'){
          loadWritingScripts().then(function(){
            if(typeof window.renderExamList === 'function') window.renderExamList();
            renderMockTabCounts();     /* M-1：写作脚本刚到，此时才有篇数可填 */
          });
        }
        return;
      }
      /* 二级：阅读的 Part 1 / 2 / 3 */
      if((el = t.closest && t.closest('#partTabs .pill-tab'))){
        var rt = document.getElementById('bankRoot');
        if(rt) rt.setAttribute('data-mock-part', el.getAttribute('data-part'));
        document.querySelectorAll('#partTabs .pill-tab').forEach(function(b){ b.classList.toggle('active', b === el); });
        renderList('reading');
        return;
      }
      /* 二级：听力的 Part 1 / 2 / 3 / 4（10/11 第 9 项） */
      if((el = t.closest && t.closest('#listenPartTabs .pill-tab'))){
        document.querySelectorAll('#listenPartTabs .pill-tab').forEach(function(b){ b.classList.toggle('active', b === el); });
        renderListenList(el.getAttribute('data-lpart'));
        return;
      }
      if((el = t.closest && t.closest('[data-fullstart]'))){ openFullTest(); return; }
      if((el = t.closest && t.closest('[data-lfullstart]'))){ openFullListenTest(); return; }
      /* 10/11 第 8 项：口语 pane「开始模考」→ 软导航到口语页并自动进其模考流程 */
      if((el = t.closest && t.closest('[data-spkstart]'))){ spkStartMock(); return; }
      /* 完整模考：Passage 1/2/3（阅读）或 Part 1–4（听力）切篇 —— 10/12 批A 已挪到底部切换器（paintPgSwitch） */
      if((el = t.closest && t.closest('.bank-item[data-unit]'))){
        openExam(el.getAttribute('data-unit'), el.getAttribute('data-ch'));
        return;
      }
      if(t.closest && t.closest('[data-fxfilter]')){
        /* 10/17：成绩卡「All / Incorrect only」——只筛底部答题卡，不动题目本身 */
        if(EX && EX.submitted){
          EX._filt = t.closest('[data-fxfilter]').getAttribute('data-fxfilter');
          var fs = document.querySelectorAll('#examRoot .fx-chip');
          for(var fi = 0; fi < fs.length; fi++){
            fs[fi].classList.toggle('on', fs[fi].getAttribute('data-fxfilter') === EX._filt);
          }
          paintSheet();
        }
        return;
      }
      /* 10/18 P0-3：成绩卡「下一步」三卡 */
      if((el = t.closest && t.closest('[data-fxnext]'))){
        fxNext(el.getAttribute('data-fxnext'));
        return;
      }
      if(t.closest && t.closest('[data-rvtoggle]')){
        /* 复盘结论条展开/收起 */
        if(EX && EX._rview) rviewToggle(t.closest('.ex-rv'));
        return;
      }
      if(t.closest && t.closest('[data-exit]')){ exitExam(); return; }
      if(t.closest && t.closest('[data-submit]')){ submit(); return; }
      if(t.closest && t.closest('[data-sok]')){ closeSubmitConfirm(); doSubmit(); return; }
      if(t.closest && t.closest('[data-scancel]')){ closeSubmitConfirm(); return; }
      /* 10/18 P1-4 / P2-2：交卷确认里的两个跳转 —— 「去看第一道未答」与点题号回看标记题。
         都复用 goTo（Part 栏跳题同一套），关弹窗后直接定位到那道题。 */
      if((el = t.closest && t.closest('[data-sjump="first"]'))){
        var user0 = collect(), firstUn = 0;
        var order = allNums();
        for(var ui = 0; ui < order.length; ui++){
          if(user0[order[ui]] == null || !String(user0[order[ui]]).length){ firstUn = order[ui]; break; }
        }
        closeSubmitConfirm();
        if(firstUn) goTo(firstUn);
        return;
      }
      if((el = t.closest && t.closest('[data-sjumpmark]'))){
        var mk = Number(el.getAttribute('data-sjumpmark'));
        closeSubmitConfirm();
        if(mk) goTo(mk);
        return;
      }
      /* 听力音频条（10/11 第 9 项）：播放/暂停、倍速、练习⇄考试模式、点进度条跳转 */
      if(t.closest && (t.closest('#exAudioBar [data-aplay]') || t.closest('#exAudioGate [data-aplay]'))){ audioToggle(); return; }
      /* 10-23：遮罩里「先看题，音频后台下」跳过链 */
      if(t.closest && t.closest('#exAudioGate [data-askip]')){ skipAudioGate(); return; }
      /* Pause / Resume（10/13 她报「Pause 是个摆设」→ 实现：暂停音频+倒计时，按钮互文切换） */
      /* W-EXTOP-1（10-25）：顶栏那颗 #exTopPauseBtn 与底栏是同一个开关，接在同一分支。 */
      if(t.closest && (t.closest('#exPauseBtn') || t.closest('#exTopPauseBtn'))){
        if(EX && EX.paused) resumeExam(); else pauseExam();
        return;
      }
      /* 10/20：旧「点一下循环切倍速」按钮（data-arate）退役 —— 换成 #eaRate <select>，
         事件走 input 委托（见 input 监听开头）。这里保留 closest 判据只为接住历史 DOM，
         命中时把 select 弹出来，逻辑仍走 setRate。 */
      if((el = t.closest && t.closest('#examRoot [data-arate]'))){
        var selR = document.getElementById('eaRate');
        if(selR){ selR.focus(); }
        return;
      }
      if(t.closest && t.closest('#exAudioBar [data-amode]')){ audioToggleMode(); return; }
      /* 10-24 7-3：复盘态「收起原文，回到盲听」—— 只作用于当前这一篇的复盘区。
         ⚠️ 两个按钮必须成对切换：这一组是同一个开关的两面，
           只藏自己不亮对面 = 收起后按钮全没了，她想看回来就没路了。 */
      /* 10-25 7-4a：模式切换 —— 两个按钮是同一枚硬币的两面，点了立刻重挂面板 */
      if(t.closest && t.closest('[data-intmode]')){
        var mb = t.closest('[data-intmode]');
        setIntMode(mb.getAttribute('data-intmode'));
        return;
      }
      /* 10-25 7-4a：三卡 —— 给当前句打档，然后自动跳下一句（一轮一句）。
         走到最后一句就不再跳（停在末句，她可以自己回头点） */
      if(t.closest && t.closest('[data-mark]')){
        var mk = t.closest('[data-mark]');
        setMark(_mkIdx, mk.getAttribute('data-mark'));
        var nRows = document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line').length;
        if(_mkIdx + 1 < nRows) playLine(_mkIdx + 1);
        return;
      }
      /* 10-25 7-4b：打开精听报告（随时可看，不必等走完） */
      if(t.closest && t.closest('[data-mkreport]')){
        openMarkReport();
        return;
      }
      if(t.closest && t.closest('[data-schide]')){
        var host = document.getElementById('exListenIn');
        if(host){
          host.setAttribute('data-blind', '1');
          renderBlindCard();
          setBlindBtns(true);
        }
        return;
      }
      /* 10-24 7-3：盲听遮罩里的「点击显示原文」—— 揭开即记住（这个决定跨刷新） */
      if(t.closest && t.closest('[data-screveal]')){
        var host2 = document.getElementById('exListenIn');
        if(host2) host2.removeAttribute('data-blind');
        renderBlindCard();
        setBlindBtns(false);
        markBlindRevealed();
        return;
      }
      if((el = t.closest && t.closest('#examRoot [data-avol]'))){
        _audioMuted = !_audioMuted;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioMuted ? 0 : _audioVol;
        el.innerHTML = _audioMuted ? ICO_MUTE : ICO_VOL;
        var sl0 = document.querySelector('#examRoot [data-avsl]');
        if(sl0) sl0.value = _audioMuted ? 0 : _audioVol;
        return;
      }
      if(t.closest && t.closest('#eaBar')){ audioSeek(e); return; }      if((el = t.closest && t.closest('.ex-pill')) && !(EX && EX.submitted)){
        var box = el.closest('.ex-pills');
        box.querySelectorAll('.ex-pill').forEach(function(p){ p.classList.remove('on'); });
        el.classList.add('on');
        if(EX) EX.user[box.getAttribute('data-q')] = el.getAttribute('data-v');
        saveDraft(); paintSheet();
        return;
      }
      /* Option 面板（☰）交互在 common.js（bank.html 与 writing.html 共用壳，全站委托） */
      /* 逐题旗子（Mark，从底栏迁到题干右上）：写 EX.flagged + 题号条联动 */
      if((el = t.closest && t.closest('.ex-flagq')) && EX && !EX.submitted){
        var qn = el.getAttribute('data-qn');
        EX.flagged[qn] = !EX.flagged[qn];
        el.classList.toggle('on', !!EX.flagged[qn]);
        paintSheet();
        return;
      }
      /* 填空框三态：点框即进输入态（数字消失）。
         ⚠️ input 未点态是 display:none —— 对不可见元素 focus() 静默失败，
         必须先挂 editing 类让 input 显示出来，再 focus（10/12 T17 实测踩坑）。 */
      if((el = t.closest && t.closest('.ex-blankw')) && !(EX && EX.submitted)){
        el.classList.add('editing');
        var inp = el.querySelector('input');
        if(inp) inp.focus();
        return;
      }
      /* W-EXTOP-1（10-25）：顶栏 ‹ › 已删（她「黑的左右箭头删了」）→ 这条点击分支整段退役。
         跨 Part 翻题仍可走底部题号行（.ex-nav）与 Part 切换，不断路。 */
      /* 题号行跳题（10/12 批A：.ex-sq 答题卡退役 → .ex-num 题号行） */
      if((el = t.closest && t.closest('.ex-num[data-jump]')) && EX){
        goTo(el.getAttribute('data-jump'));
        return;
      }
      /* Part 并排切换器（10/15：Part 1|2|3 全部并排，对标爱听写/IDP 真机考） */
      if((el = t.closest && (t.closest('.ex-pt[data-pg]') || t.closest('.ex-pg[data-pg]'))) && EX && !el.disabled){
        var pi = Number(el.getAttribute('data-pg'));
        if(pi >= 1 && pi !== EX.curP){
          if(EX.channel === 'listening') renderListenPart(pi);
          else renderPassage(pi);
        }
        return;
      }
      /* 点菜单外 → 收起浮动工具条。
         ⚠️ 但拖拽划词结束后浏览器仍可能补一个 click（落点是文章）→ 会把刚弹出的工具条立刻收掉。
         判据：此刻若还有「文章内的活选区」，说明是刚划完 → 不收。 */
      if(!t.closest || !t.closest('#exCtx')){
        var sel = window.getSelection();
        var art = artEl();
        var liveSel = !!(sel && !sel.isCollapsed && sel.anchorNode && art && art.contains(sel.anchorNode));
        if(!liveSel){ closeCtx(); _hlCache = null; }   /* 左键点外面 = 新交互开始，旧选区缓存作废 */
      }
    }, true);

    document.addEventListener('change', function(e){
      var t = e.target;
      /* 字号（exTs）/对比度（exCt）已迁 common.js 统一处理（bank/writing 共用壳） */
      if(!EX || EX.submitted) return;
      if(t.matches && (t.matches('input.ex-blank[data-q]') || t.matches('.ex-opts input') || t.matches('select[data-q]'))){
        saveDraft(); paintSheet();
      }
    });
    document.addEventListener('input', function(e){
      var t = e.target;
      /* 10/20：倍速 <select>（id=eaRate）—— 选了立刻生效，不必点别处 */
      if(t.id === 'eaRate'){
        setRate(t.value);
        return;
      }
      /* 10-24 7-3：单句遍数 <select>（id=eaRepeat）—— 复盘态专属，跨篇/跨场记忆。
         ⚠️ 只在复盘态存在（audioBarHtml 里恒渲染、CSS 在考试/未交卷时藏），
         与倍速可叠加；选 1 遍 = 关掉（等于原来的行为）。 */
      if(t.id === 'eaRepeat'){
        setRepeat(parseInt(t.value, 10) || 1);
        return;
      }
      /* 听力音量：滑杆拖动实时生效 + 记住（两模式都可用 —— 真机考只有音量可控） */
      if(t.matches && t.matches('#examRoot [data-avsl]')){
        _audioVol = Math.max(0, Math.min(1, parseFloat(t.value) || 0));
        _audioMuted = _audioVol === 0;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioVol;
        var vb = document.querySelector('#examRoot [data-avol]');
        if(vb) vb.innerHTML = _audioMuted ? ICO_MUTE : ICO_VOL;
        try{ localStorage.setItem('hub_bank_vol', String(_audioVol)); }catch(e2){}
        return;
      }
      /* 填空三态：有值 = filled（显示输入内容）；联动题号条 */
      if(t.matches && t.matches('.ex-blankw input')){
        var w = t.closest('.ex-blankw');
        if(w) w.classList.toggle('filled', !!t.value.trim());
        if(EX && !EX.submitted) paintSheet();
        return;
      }
      if(EX && !EX.submitted && t.matches && t.matches('.ex-blank[data-q]')) paintSheet();
    });
    /* 填空三态：聚焦进编辑态（数字消失），失焦退出 */
    document.addEventListener('focusin', function(e){
      var w = e.target.closest && e.target.closest('.ex-blankw');
      if(w) w.classList.add('editing');
    });
    document.addEventListener('focusout', function(e){
      var w = e.target.closest && e.target.closest('.ex-blankw');
      if(w) w.classList.remove('editing');
    });
    document.addEventListener('change', function(e){
      var t = e.target;
      /* 10/16 三修：段落匹配矩阵 radio（官方答题卡形态）→ 写 EX.user（判分/落库/草稿口径不变） */
      if(t.matches && t.matches('#examRoot .ex-lomatrix input[type=radio][data-q]')){
        var _q = t.getAttribute('data-q'), _v = t.value;
        if(EX && !EX.submitted){
          if(t.checked){ EX.user[_q] = _v; }
          else { delete EX.user[_q]; }
          paintSheet();
        }
        return;
      }
      /* 10/14 段落信息匹配改表格行：select 选字母 → 写 EX.user（判分/落库/草稿口径不变） */
      if(t.matches && t.matches('#examRoot .ex-lohsel[data-q]')){
        var _q = t.getAttribute('data-q'), _v = t.value;
        if(EX && !EX.submitted){
          if(_v){ EX.user[_q] = _v; t.classList.add('filled'); }
          else { delete EX.user[_q]; t.classList.remove('filled'); }
          paintSheet();
        }
        return;
      }
      if(t.matches && t.matches('#examRoot [name="exTs"]')){
        /* 文字大小：三档字号 → 挂 .ex-split（写作页壳共用）*/
        var sp = document.getElementById('exSplit'); if(!sp) return;
        sp.classList.toggle('ts-large', t.value === 'large');
        sp.classList.toggle('ts-xl', t.value === 'xl');
        sp.style.setProperty('--exfs', t.value === 'large' ? '23px' : t.value === 'xl' ? '27px' : '');
        return;
      }
      if(t.matches && t.matches('#examRoot [name="exCt"]')){
        /* 对比度：整屏反色（Option>Colour 三档）—— 类挂 #examRoot（含顶栏底栏）*/
        var root = document.getElementById('examRoot'); if(!root) return;
        root.classList.toggle('ct-dark', t.value === 'dark');
        root.classList.toggle('ct-yellow', t.value === 'yellow');
        return;
      }
      /* 多选限数（真机考：Choose TWO 就只能勾两个，选满其余变灰禁用） */
      if(t.matches && t.matches('#examRoot .ex-cbox .ex-check')){
        var box = t.closest('.ex-cbox');
        var need = Number(box.getAttribute('data-need') || 0);
        if(need && t.checked){
          var onN = box.querySelectorAll('.ex-check:checked').length;
          if(onN > need){
            t.checked = false;
            return;
          }
        }
        syncCboxDis(box);
        if(EX && !EX.submitted) paintSheet();
        return;
      }
      if(t.matches && t.matches('#examRoot .ex-radio')){
        if(EX && !EX.submitted) paintSheet();
        return;
      }
      if(EX && !EX.submitted && t.matches && t.matches('#examRoot .ex-opts input')) paintSheet();
    });
    /* 下一题快捷键 = 双击 Tab（她 10/12 指定；连按两次跳下一题并直接进输入态）。
       判定放宽到「考场可见」——焦点在 body（如刚点过被移除的按钮）时也要能跳。
       10/13：双击窗口 600→800ms（她报「双击 Tab 没反应」——人类双击间隔常见 300-700ms，
       600ms 对慢双击太紧；本地探针两条焦点路径均验过再放款）。 */
    document.addEventListener('keydown', function(e){
      /* 10/20：Part 行从 <button> 改成 <div role="button">（当前 Part 里要嵌题号 <button>，
         <button> 不能嵌套 <button>，HTML 解析器会强行截断外层）→ 这里补 Enter/Space 激活，
         把原生按钮自带的键盘能力还回来。嵌套里的题号按钮是 BUTTON，走原生激活，不重复处理。 */
      if(e.key === 'Enter' || e.key === ' '){
        var zone0 = document.getElementById('examRoot');
        var pt = e.target && e.target.closest && e.target.closest('.ex-pt[data-pg]');
        if(zone0 && pt && zone0.contains(pt) && e.target.tagName !== 'BUTTON' && !(EX && EX.submitted)){
          e.preventDefault();
          pt.click();
        }
        return;
      }
      /* 10-25 7-4a：标记模式的三档快捷键 1 / 2 / 3。
         ⚠️ 只在「标记模式 + 焦点不在输入控件里」时抢键 —— 否则填空题里打数字全被吃掉。 */
      if(e.key === '1' || e.key === '2' || e.key === '3'){
        var tg = e.target, tn = tg && tg.tagName;
        if(tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT') return;
        if(_intMode !== 'mark') return;
        var z0 = document.getElementById('examRoot');
        if(!z0 || z0.hidden || !EX || !EX.submitted) return;
        e.preventDefault();
        var kk = e.key === '1' ? 'ok' : (e.key === '2' ? 'mid' : 'no');
        setMark(_mkIdx, kk);
        var n2 = document.querySelectorAll('#examRoot .ex-script .sc-body.sc-tl .sc-line').length;
        if(_mkIdx + 1 < n2) playLine(_mkIdx + 1);
        return;
      }
      if(e.key !== 'Tab') return;
      var zone = document.getElementById('examRoot');
      if(!zone || zone.hidden) return;
      if(!EX) return;
      if(document.getElementById('exSubmitModal')) return;   /* 交卷确认弹层开着时 Tab 归弹层（按钮间切换） */
      e.preventDefault();
      var now = Date.now();
      if(now - (document.__lastBankTab || 0) < 800){
        document.__lastBankTab = 0;
        var an = allNums().map(Number), i = an.indexOf(Number(EX.cur));
        goTo(an[Math.min(an.length - 1, i + 1)], true);
      } else {
        document.__lastBankTab = now;
      }
    });

    /* 配对题拖拽：pointerdown/move/up（鼠标 + 触屏同一套） */
    document.addEventListener('pointerdown', function(e){
      if(!EX || EX.submitted) return;
      var t = e.target, el, r;
      if((el = t.closest && t.closest('.ex-x'))){ dgClearEl(el.closest('.ex-drop')); return; }
      if((el = t.closest && t.closest('#examRoot .ex-chip'))){
        /* 🔴 10/11 第 9 项修 bug：原先是 `if(el.classList.contains('used')) return;`
           —— 把「用过」当成不可再用。但雅思匹配题同一个字母允许重复用
           （123 组 matching 里 23 组答案字母重复，占 18.7%），禁用就会让这些题永远答不对。
           `used` 现在只是视觉提示（虚线边框），不再挡操作。 */
        e.preventDefault();
        _dg = { el: el, from: 'pool', v: el.getAttribute('data-v'), moved: false };
        _dgStart.x = e.clientX; _dgStart.y = e.clientY;
        r = el.getBoundingClientRect();
        _dgOff.x = e.clientX - r.left; _dgOff.y = e.clientY - r.top;
        try{ el.setPointerCapture(e.pointerId); }catch(err){}
        return;
      }
      if((el = t.closest && t.closest('#examRoot .ex-lohb'))){
        /* 段落信息匹配气泡：拖 / 点选两路（与 .ex-chip 同一套 _dg 状态机） */
        e.preventDefault();
        _dg = { el: el, from: 'lohb', v: el.getAttribute('data-q'), moved: false };
        _dgStart.x = e.clientX; _dgStart.y = e.clientY;
        r = el.getBoundingClientRect();
        _dgOff.x = e.clientX - r.left; _dgOff.y = e.clientY - r.top;
        try{ el.setPointerCapture(e.pointerId); }catch(err3){}
        return;
      }
      if((el = t.closest && t.closest('#examRoot .ex-drop'))){
        if(el.getAttribute('data-v')){
          e.preventDefault();
          _dg = { el: el, from: 'drop', v: el.getAttribute('data-v'), moved: false };
          _dgStart.x = e.clientX; _dgStart.y = e.clientY;
          r = el.getBoundingClientRect();
          _dgOff.x = e.clientX - r.left; _dgOff.y = e.clientY - r.top;
          try{ el.setPointerCapture(e.pointerId); }catch(err2){}
          return;
        }
        if(_sel){ dgPlace(el, _sel.getAttribute('data-v')); dgClearSel(); return; }
      }
      if((el = t.closest && t.closest('#examRoot .ex-pslot'))){
        /* 段前槽：有选中气泡 = 放入（已占则替换，旧题号回气泡）；无选中且已占 = 点一下清除 */
        e.preventDefault();
        if(_sel && _sel.classList.contains('ex-lohb')){ lohPlace(el, _sel.getAttribute('data-q')); dgClearSel(); return; }
        if(el.getAttribute('data-q')){ lohClear(el); return; }
      }
      if(_sel) dgClearSel();
    });

    document.addEventListener('pointermove', function(e){
      if(!_dg) return;
      if(!_dg.moved && (Math.abs(e.clientX - _dgStart.x) + Math.abs(e.clientY - _dgStart.y)) > 6){
        _dg.moved = true;
        _ghost = _dg.el.cloneNode(true);
        var gx = _ghost.querySelector('.ex-x'); if(gx) gx.parentNode.removeChild(gx);
        _ghost.classList.add('ghost');
        _ghost.style.width = _dg.el.offsetWidth + 'px';
        document.body.appendChild(_ghost);
        _dg.el.classList.add('dragging');
        dgClearSel();
      }
      if(!_dg.moved) return;
      _ghost.style.left = (e.clientX - _dgOff.x) + 'px';
      _ghost.style.top = (e.clientY - _dgOff.y) + 'px';
      var hit = dgDropAt(e.clientX, e.clientY);
      dgDrops().forEach(function(d){ d.classList.toggle('over', d === hit); });
    });

    document.addEventListener('pointerup', function(e){
      if(!_dg) return;
      var d = _dg; _dg = null;
      dgDrops().forEach(function(x){ x.classList.remove('over'); });
      if(_ghost){ _ghost.remove(); _ghost = null; }
      d.el.classList.remove('dragging');
      if(!d.moved){
        if(d.from === 'pool' || d.from === 'lohb'){
          if(_sel === d.el){ dgClearSel(); }
          else { dgClearSel(); _sel = d.el; d.el.classList.add('sel'); }
        } else {
          dgClearEl(d.el);
        }
        return;
      }
      var target = dgDropAt(e.clientX, e.clientY);
      if(d.from === 'pool'){
        if(target && target.getAttribute('data-v') !== d.v) dgPlace(target, d.v);
      } else if(d.from === 'lohb'){
        /* 段落信息匹配：拖气泡到槽位（槽已被占 = 替换，旧题号回收） */
        if(target && target.classList.contains('ex-pslot')) lohPlace(target, d.v);
      } else {
        var mine = d.el;
        if(target && target !== mine){ dgClearEl(mine); dgPlace(target, d.v); }
        else if(!target){ dgClearEl(mine); }
      }
    });

    document.addEventListener('pointercancel', function(){ dgReset(); });

    /* Highlight / Note：① 点浮动工具条不清选区 ② 右键按下先缓存选区
       ⚠️ ① 必须挂在 mousedown 上（TipTap / ProseMirror 的 bubble menu 标准做法）：
          mousedown 的默认动作 = 折叠选区，preventDefault 就能保住选区，且不影响 click 触发；
          而 pointerdown 上 preventDefault 有把后续 click 一并吃掉的风险（按钮会点不动）。 */
    document.addEventListener('mousedown', function(e){
      if(e.target && e.target.closest && e.target.closest('#exCtx')) e.preventDefault();
    }, true);
    document.addEventListener('pointerdown', function(e){
      if(e.button !== 2) return;
      var art = artEl(); if(!art) return;
      var s = window.getSelection();
      if(s && !s.isCollapsed && s.anchorNode && art.contains(s.anchorNode)){
        try{ _hlCache = s.getRangeAt(0).cloneRange(); }catch(err){ _hlCache = null; }
      }
    }, true);
    /* 选中即弹：松开鼠标若选区内是文章文字 → 在选区上方浮出工具条；
       选区已没了（点了别处 / 右键 up）→ 收起。 */
    document.addEventListener('mouseup', function(e){
      var art = artEl(); if(!art) return;
      if(e.target && e.target.closest && e.target.closest('#exCtx')) return;   /* 点工具条自己 → 别动 */
      var sel = window.getSelection();
      if(!sel || sel.isCollapsed){ closeCtx(); return; }
      if(!sel.anchorNode || !art.contains(sel.anchorNode)) return;
      if(!sel.focusNode || !art.contains(sel.focusNode)) return;               /* 跨出文章的选区不接 */
      try{
        var r = sel.getRangeAt(0).cloneRange();
        _hlCache = null;
        openCtx(r, null, r.getBoundingClientRect());
      }catch(err){}
    });
    /* selectionchange 只负责「持续缓存活选区」：
       ⚠️ 两点血的教训（10/12 T13 真案）——
       ① 右键 down 会把选区折叠 → 等 pointerdown 再抓偶发拿不到，这里活着就缓存，右键永远有得用；
       ② selectionchange 是**异步派发**，右键「折叠 → contextmenu 开条」竞态里它会晚到，
          若在这里收工具条，会把 contextmenu 刚开的条收掉（本地复现时序相反，极具迷惑性）。
       收起职责归 mouseup（collapsed）/ click（点外面）/ scroll。 */
    document.addEventListener('selectionchange', function(){
      var sel = window.getSelection();
      var art = artEl();
      if(sel && !sel.isCollapsed && sel.anchorNode && art && art.contains(sel.anchorNode)
         && sel.focusNode && art.contains(sel.focusNode) && sel.rangeCount){
        try{ _hlCache = sel.getRangeAt(0).cloneRange(); }catch(err){}
      }
    });
    document.addEventListener('contextmenu', function(e){
      var art = artEl(); if(!art || !art.contains(e.target)) return;
      var sel = window.getSelection();
      _hlSpan = e.target.closest ? e.target.closest('.ex-hl, .ex-nt') : null;
      var live = (sel && !sel.isCollapsed && sel.anchorNode && art.contains(sel.anchorNode)
                  && sel.focusNode && art.contains(sel.focusNode))
        ? sel.getRangeAt(0).cloneRange() : null;
      var r = live || _hlCache;
      if(!r && !_hlSpan) return;
      e.preventDefault();
      _hlCache = null;
      var rect = r ? r.getBoundingClientRect()
                   : _hlSpan.getBoundingClientRect();
      openCtx(r, _hlSpan, rect);
    });
    document.addEventListener('scroll', function(){
      closeCtx();
    }, true);
    document.addEventListener('input', function(e){
      var ta = e.target.closest && e.target.closest('#examRoot .ex-ncard textarea');
      if(!ta) return;
      var card = ta.closest('.ex-ncard'); if(!card) return;
      var id = card.getAttribute('data-id'), list = loadMarks();
      list.forEach(function(m){ if(m.id === id) m.note = ta.value; });
      saveMarks(list);
    });
  }

  /* ===== 启动 ===== */
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('hub:page-shown', function(){ setTimeout(boot, 0); });

  /* 🔴 10-23 T-001：顶栏二级菜单「模考」落地分栏（?sub=reading|listening|writing|speaking）。
     ⚠️ 必须在 boot() **之后**、且判 manifest 是否已就绪才行：
        boot() 拿到 manifest 会调 paintTab() 重画，它会把 tab 打回页面属性上的值。
        所以这里包一层：先按请求写 data-mock-tab，再在 manifest 就绪后再 paintTab 一次。
     只读参数 → 调已有 paintTab，不重写任何切换逻辑。 */
  function tbApplySub(){
    var want = '';
    try{ want = (typeof tbSubPending === 'function') ? tbSubPending('bank') : ''; }catch(e){}
    if(!want) return;
    if(['reading','listening','writing','speaking'].indexOf(want) < 0) return;
    var root = document.getElementById('bankRoot'); if(!root) return;
    root.setAttribute('data-mock-tab', want);
    /* 等 manifest：boot 是异步的，_manifest 到位后再画一次。最多等 8 秒（慢网），
       超时就按当前请求先画（列表可能还是骨架，但 tab 位置是对的，不会卡死）。 */
    var t0 = Date.now();
    (function wait(){
      var r2 = document.getElementById('bankRoot'); if(!r2) return;
      if(_manifest){ paintTab(want); return; }
      if(Date.now() - t0 > 8000){ paintTab(want); return; }
      setTimeout(wait, 120);
    })();
  }
  /* hub:page-shown 是软导航每次进页都会发的（见 common-shell.js），冷启动时 boot 自己跑。
     两个入口都接上；tbApplySub 内部对「没有 sub」是空操作，重复调用安全。 */
  if(document.readyState !== 'loading') setTimeout(tbApplySub, 0);
  else document.addEventListener('DOMContentLoaded', function(){ setTimeout(tbApplySub, 0); });
  window.addEventListener('hub:page-shown', function(){ setTimeout(tbApplySub, 0); });
})();
