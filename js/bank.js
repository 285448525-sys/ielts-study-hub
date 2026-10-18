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
  var LOADING_HTML = '<div class="bank-loading">目录加载中…</div>';
  function paintLoading(host, meta){
    if(host) host.innerHTML = LOADING_HTML;
    if(meta) meta.textContent = '目录加载中…';
  }
  function renderList(channel, part){
    var host = document.getElementById('bankList');
    if(!host) return;
    if(channel !== 'reading'){ host.innerHTML = ''; return; }
    var meta = document.getElementById('partMeta');
    if(!_manifest){ paintLoading(host, meta); return; }
    part = part || currentPart();
    var units = unitsOf(channel).filter(function(u){ return (u.partNum || 'Part 1') === part; });
    if(meta){
      var perQ = units.length ? (units[0].qCount || 0) : 0;
      meta.textContent = part + ' · 共 ' + units.length + ' 篇' + (perQ ? (' · 每篇 ' + perQ + ' 题') : '');
    }
    if(!units.length){ host.innerHTML = '<div class="bank-empty"><p>这一部分暂时没有篇目。</p></div>'; return; }
    host.innerHTML = listHtml(units, channel);
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
      b.innerHTML = esc(p) + ' <span class="pt-n">' + n + '</span>';
    });
  }
  function renderListenList(part){
    var host = document.getElementById('listenList'); if(!host) return;
    var meta = document.getElementById('listenMeta');
    /* 同上：加载中说加载中。⚠️ 原先这里是清空（把 HTML 里静态的「目录加载中…」也抹掉了 → 一片空白） */
    if(!_manifest){ paintLoading(host, meta); return; }
    part = part || currentListenPart();
    var units = unitsOf('listening').filter(function(u){ return (u.partNum || 'Part 1') === part; });
    if(meta){
      var perQ = units.length ? (units[0].qCount || 0) : 0;
      meta.textContent = part + ' · 共 ' + units.length + ' 篇' + (perQ ? (' · 每篇 ' + perQ + ' 题') : '');
    }
    if(!units.length){ host.innerHTML = '<div class="bank-empty"><p>这一部分暂时没有篇目。</p></div>'; return; }
    host.innerHTML = listHtml(units, 'listening');
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

  /* ===== 载入 manifest ===== */
  function boot(){
    var root = document.getElementById('bankRoot');
    if(!root) return;                                  // 不在本页
    if(_manifest){ paintTab(root.getAttribute('data-mock-tab') || 'reading'); return; }
    if(_loading) return;
    _loading = true;
    fetch(MANIFEST, { cache: 'no-cache' })
      .then(function(r){ if(!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function(m){
        _manifest = m; _loading = false;
        var r2 = document.getElementById('bankRoot'); if(!r2) return;
        paintTab(r2.getAttribute('data-mock-tab') || 'reading');
      })
      .catch(function(err){
        _loading = false;
        if(window.console && console.error) console.error('[bank] manifest 加载失败：', err);
        /* 🔴 10/11 顺带修：失败提示原先只写 #bankList，听力 tab 会一直停在「目录加载中…」 */
        ['bankList', 'listenList'].forEach(function(id){
          var h = document.getElementById(id);
          if(h) h.innerHTML = '<div class="bank-empty"><p>目录加载失败，请刷新重试。</p></div>';
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

  function openExam(unitId, channel){
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){ host.hidden = false; host.innerHTML = '<div class="bank-loading" style="padding:60px">Loading…</div>'; }

    var p1 = fetch('bank/' + channel + '/' + unitId + '.json', { cache: 'no-cache' })
              .then(function(r){ if(!r.ok) throw new Error('unit ' + r.status); return r.json(); });
    var p2 = fetch('bank/answers/' + unitId + '.json', { cache: 'no-cache' })
              .then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; });

    Promise.all([p1, p2]).then(function(res){
      var unit = res[0], ansFile = res[1] || {};
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
      _rateIx = 0; _audioBound = null;
      try{ EX.user = JSON.parse(localStorage.getItem('hub_bank_draft_' + unitId) || '{}') || {}; }catch(e){ EX.user = {}; }
      renderExam();
      bankStartTimer();                               /* C-3：进考试即开专注计时（幂等，不会双开） */
    }).catch(function(err){
      if(window.console && console.error) console.error('[bank] 题目加载失败：', err);
      var h = document.getElementById('examRoot');
      if(h) h.innerHTML = '<div class="bank-empty" style="padding:60px"><p>Could not load this test. Please go back and try again.</p>'
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

  function pillsHtml(q, numOf){
    var n = numOf(q.qNumber);
    var h = '<div class="ex-pills" data-q="' + esc(n) + '">';
    (q.options || []).forEach(function(o){
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
          + flagHtml(n) + '<span class="ex-qt">' + esc(plain(q.question)) + pillsHtml(q, numOf) + '</span></div>';
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
          + flagHtml(n) + '<span class="ex-qt">' + clean(q.question) + (tf ? pillsHtml(q, numOf) : radioHtml(q, numOf)) + '</span></div>';
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
  var HIDE_T_KEY = 'hub_exam_hide_timer_v1';
  var _hideT = false;
  try{ _hideT = localStorage.getItem(HIDE_T_KEY) === '1'; }catch(e){}
  function fmtHMS(sec){
    var s = Math.max(0, sec | 0);
    return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
  }
  function setHideTimer(on){
    _hideT = !!on;
    try{ localStorage.setItem(HIDE_T_KEY, _hideT ? '1' : '0'); }catch(e){}
    /* 立刻重画一次（tick 每秒也会画，这里只是让点击有即时反馈） */
    var shown = _hideT ? '--:--' : (EX && EX._leftSec != null ? fmtHMS(EX._leftSec) : null);
    var el = document.getElementById('exTimer');
    if(el){
      el.textContent = _hideT ? '--:--' : (shown || el.textContent);
      if(_hideT){ el.classList.remove('warn'); el.classList.remove('soon'); }
    }
    var ft = document.getElementById('eaFullTimer');
    if(ft) ft.textContent = _hideT ? '--:--' : (shown || ft.textContent);
    var b = document.getElementById('exHideBtn');
    if(b){ b.classList.toggle('on', _hideT); b.title = _hideT ? 'Show time' : 'Hide time'; }
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
    var hb = document.getElementById('exHideBtn');
    if(hb && !hb.__toolBound){
      hb.__toolBound = true;
      hb.classList.toggle('on', _hideT);
      hb.title = _hideT ? 'Show time' : 'Hide time';
      hb.addEventListener('click', function(ev){ ev.preventDefault(); setHideTimer(!_hideT); });
    }
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
      /* 顺序即视觉顺序：[▶][Part 胶囊][进度][音频时间][🔊] …… [整场倒计时][Saved][工具] */
      var clock = document.createElement('span');
      clock.className = 'ea-full';
      clock.id = 'eaFullTimer';
      clock.textContent = (EX && EX._leftSec != null) ? fmtHMS(EX._leftSec) : '00:30:00';
      bar.appendChild(clock);
      var icons = host.querySelector('.ex-icons');
      if(icons) bar.appendChild(icons);      /* Saved + Full screen + Hide time + ☰ */
      bar.classList.add('has-tools');
    }
    if(top) top.style.display = 'none';      /* .ex-option 面板是 .ex-top 的兄弟，藏它不影响面板 */
  }
  function shellHtml(nameText, subText, timerText){
    return '<div class="ex-top">'
      +    '<div class="ex-name">' + esc(nameText)
      +      (subText ? '<small>' + esc(subText) + '</small>' : '') + '</div>'
      +    '<span class="ex-timer" id="exTimer">' + timerText + '</span>'
      + ''   /* 10/14 她拍板：顶栏计时徽章关掉（音频长短不一，与整场计时并存重复） */
      +    '<div class="ex-icons">'
      +      '<span class="ex-saved" id="exSaved" hidden>Saved</span>'
      +      '<button class="ex-ico ex-toolbtn" id="exFsBtn" type="button" title="Full screen" aria-label="Full screen">' + ICO_FS + '</button>'
      +      '<button class="ex-ico ex-toolbtn" id="exHideBtn" type="button" title="Hide time" aria-label="Hide time">' + ICO_HIDE + '</button>'
      +      '<button class="ex-ico ex-menubtn" type="button" title="Option">\u2630</button>'
      +    '</div></div>'
      + '<div class="ex-option" id="exOptionPanel">'
      +    '<button type="button" class="ex-opx" data-opclose>\u2715</button>'
      +    '<h3>Option</h3>'
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
   上报后，SW 遇到 inExam:true 的客户端只发提示、不导航，等考完再刷。 */
function reportExamState(inExam){
  try{
    if(navigator.serviceWorker && navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({ type: 'EXAM_STATE', inExam: !!inExam });
    }
  }catch(e){}
}
window.__reportExamState = reportExamState;

function barHtml(){
    /* 10/12 批A：底栏重构为爱听写/真机考形态（她 22:03「切换考题不该放上面，要放下面」）。
       结构 = .ex-nav（左：篇切换器 ‹ 当前篇·已答/总数 | 中：当前篇题号行 | 右：下一篇 ›）
              + .ex-actions（左：Pause | 中：Exit | 右：Finish section）
       · 题号行只列【当前篇】（根治「40 个题堆下面挤两行」）；全卷格子 .ex-sheet 退役
       · 篇切换器 full 模式才有；单篇只有题号行；写作是 Task 1/2 切换（见 paintPgSwitch）
       10/13 她报两件：①「题号和 Pause/Exit/Finish 分成两行不好，并成一行」→ 桌面 .ex-bar 改
         row（题号行 flex:1 占满，按钮行 flex:none 靠右）；≤860 移动端保持两行（390 宽放不下）。
       ②「Pause 是个摆设」→ 本批实现 pauseExam/resumeExam（见下）。
       ⚠️ Pause 只属于练习模式：真机考录音不可暂停（BC 官方 Progress Check FAQ「The Listening
         and Speaking tests are a recording and cannot be paused」；Zoju Strict/Breath 双模式、
         ieltsfreepractice Practice/Exam 双模式同口径）→ 考试模式与听力完整模考不渲染该按钮。 */
    var showPause = !!(EX && !EX.submitted && EX.listenMode !== 'exam' && !(EX.full && EX.channel === 'listening'));
    return '<div class="ex-bar">'
      +    '<div class="ex-nav" id="exNav">'
      /* 10/15 Part 并排切换器（她：「整卷考试的各个 Part 是可以这样切换的」，
         对标爱听写/IDP 真机考的 Question Navigator）——full 模式才有，单篇不渲染。
         内容由 paintPgSwitch() 填：Part 1 7/13 | Part 2 0/13 | Part 3 0/14 全部并排可见。 */
      +      '<div class="ex-parts" id="exParts"></div>'
      +      '<div class="ex-nums" id="exNums"></div>'
      +    '</div>'
      +    '<div class="ex-actions">'
      +      (showPause ? '<button type="button" class="btn-ghost ex-pause" id="exPauseBtn">Pause</button>' : '')
      +      '<button class="btn-ghost" type="button" data-exit>Exit</button>'
      +      '<button class="btn-primary" type="button" data-submit>Finish section</button>'
      +    '</div></div>';
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
    var exam = EX.listenMode === 'exam';
    /* 听力完整模考：全程考试模式，模式切换按钮整个不渲染（真机考没有「练习/考试」这一说） */
    var fullL = !!(EX.full && EX.channel === 'listening');
    /* 10/14 她拍板：去掉练习/考试切换，默认练习模式（可暂停/可拖/可倍速） */
    var modeBtn = '';
    var partChip = partLabel ? '<span class="ea-part">' + esc(partLabel) + '</span>' : '';
    /* 10/14 她拍板：两行并一行 —— 标题 + 整场倒计时并入音频条行首（原独立标题行撤销） */
    /* 10/16 三科上下栏统一：篇名与整场计时已在顶栏（阅读同款）→ 音频条瘦身为纯播放条
       （播放 | Part 胶囊 | 进度 | 时间 | 静音），不再重复渲染标题/计时。 */
    return '<div class="ex-audio' + (exam ? ' locked' : '') + '" id="exAudioBar">'

      + '<button class="ea-play" type="button" data-aplay aria-label="Play">▶</button>'
      + partChip
      + '<div class="ea-bar" id="eaBar"><div class="ea-fill" id="eaFill"></div><span class="ea-knob" id="eaKnob"></span></div>'
      + '<span class="ea-time" id="eaTime">00:00 / 00:00</span>'
      /* 10/14 她拍板：音量滑杆与倍速按钮移入 Option 面板（进度条折叠，三科顶栏一致）。
         静音按钮保留（一键静音是常用操作，只占一个图标位）。 */
      + '<button class="ea-vol" type="button" data-avol aria-label="Mute">' + (_audioMuted || _audioVol === 0 ? '🔇' : '🔊') + '</button>'
      + modeBtn
      + '</div>'
      + '<audio id="exAudio" preload="metadata" src="' + esc(p.audioUrl) + '"></audio>';
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
    var d = a.duration || 0, c = a.currentTime || 0, pct = d ? (c / d * 100) : 0;
    var fill = document.getElementById('eaFill'), knob = document.getElementById('eaKnob'),
        tm = document.getElementById('eaTime'), btn = document.querySelector('#exAudioBar [data-aplay]');
    if(fill) fill.style.width = pct + '%';
    if(knob) knob.style.left = pct + '%';
    if(tm) tm.textContent = fmtClock(c) + ' / ' + fmtClock(d);
    if(btn) btn.textContent = a.paused ? '▶' : '❙❙';
  }
  /* 🔴 10/16 她报「听力音频播放不了」→ 本地/线上都复现不出（音频 200、duration 正常、无报错），
     她那边是 00:00 / 00:00 + 进度条塌成小点 = 元数据没加载（旧缓存版布局也印证）。
     不管根因是缓存还是网络/插件拦截，**失败必须是可见且可自救的**：在音频条上给提示 + 一键重试。 */
  function showAudioErr(a){
    var bar = document.getElementById('exAudioBar'); if(!bar) return;
    if(bar.querySelector('.ea-err')) return;
    var e = document.createElement('button');
    e.type = 'button'; e.className = 'ea-err';
    e.textContent = 'Audio failed to load — tap to retry';
    e.addEventListener('click', function(){
      e.remove();
      try{ a.load(); }catch(err){}
      if(EX && EX.listenMode !== 'exam'){ try{ a.play(); }catch(err){} }
    });
    bar.appendChild(e);
  }
  function wireAudio(){
    var a = document.getElementById('exAudio');
    if(!a || a === _audioBound) return;                  /* 记住绑过哪个元素，别重复绑 */
    _audioBound = a;
    /* 音量：套用上次的值（模块加载时已回读） */
    a.volume = _audioVol;
    a.playbackRate = AUDIO_RATES[_rateIx];
    a.addEventListener('loadedmetadata', paintAudio);
    a.addEventListener('timeupdate', paintAudio);
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
    a.addEventListener('ended', paintAudio);
    paintAudio();
  }
  function lockAudioMode(){
    var b = document.querySelector('#exAudioBar [data-amode]');
    if(b && EX && EX.audioStarted && b.textContent !== 'Submitted'){ b.disabled = true; b.title = 'Playback has started; the mode cannot be changed'; }
  }
  function audioToggle(){
    var a = document.getElementById('exAudio'); if(!a || !EX) return;
    if(a.paused) a.play();
    else if(EX.listenMode !== 'exam') a.pause();          /* 考试模式：不给暂停 */
  }
  function audioSeek(e){
    var a = document.getElementById('exAudio'); if(!a || !EX) return;
    if(EX.listenMode === 'exam' && !EX.submitted) return;/* 考试模式：不给拖动（交卷后解锁） */
    var bar = document.getElementById('eaBar'); if(!bar || !a.duration) return;
    var r = bar.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  }
  function audioSetMode(exam){
    EX.listenMode = exam ? 'exam' : 'practice';
    var bar = document.getElementById('exAudioBar'); if(!bar) return;
    bar.classList.toggle('locked', !!exam);
    var b = bar.querySelector('[data-amode]');
    if(b){ b.classList.toggle('exam', !!exam); b.textContent = exam ? 'Exam mode' : 'Practice mode'; }
    var rt = bar.querySelector('[data-arate]');
    if(rt) rt.style.display = exam ? 'none' : '';
  }
  function audioToggleMode(){
    if(!EX || EX.audioStarted) return;                   /* 已经开始播 → 锁死 */
    if(EX.full) return;                                  /* 听力完整模考全程考试模式，不提供切换（按钮也不渲染） */
    audioSetMode(EX.listenMode !== 'exam');
  }
  /* 交卷后：听力原文出来 + 音频解锁（可自由回放/拖动复听 —— Zoju / PrepAsk 都是交卷后解锁） */
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
    var bar = document.getElementById('exAudioBar');
    if(bar){
      var b = bar.querySelector('[data-amode]');
      if(b){ b.disabled = true; b.classList.remove('exam'); b.textContent = 'Submitted'; }
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
    if(isListen) wireAudio();
    else { renderNotes(); replayMarks(); }
    wireOptionPanel();   /* 10/14 Option 面板交互（Colour/Size/Audio 分组点击） */
    wireExamTools();     /* 10/18 顶栏工具栏：全屏 / 隐藏计时 */
    reportExamState(true);   /* 10/15 告诉 SW：我在考试中，别刷我 */
    if(EX.submitted){ if(isListen) showScript(); decoratePassage(EX.curP); }
    startTimer(isListen ? 30 * 60 : 60 * 60);
    startFtMini();                                       /* 10/13：顶栏计时小徽章（考场内替代全站 floatTimer） */
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

  function openFullTest(){
    /* 纯随机组卷（她 10/12「不用提前写好题目在那」）：点 Start 这一刻才抽篇，每次都不一样 */
    var picks = composeFullTest();
    if(!picks) return;
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){ host.hidden = false; host.innerHTML = '<div class="bank-loading" style="padding:60px">Loading…</div>'; }

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
      if(h) h.innerHTML = '<div class="bank-empty" style="padding:60px"><p>Could not load this test. Please go back and try again.</p>'
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
    /* 同阅读：点 Start 这一刻才随机抽 Part 1–4 各一篇 */
    var picks = composeFullListenTest();
    if(!picks) return;
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){ host.hidden = false; host.innerHTML = '<div class="bank-loading" style="padding:60px">Loading…</div>'; }

    Promise.all(picks.map(function(u){ return loadPack('listening', u.id); })).then(function(packs){
      EX = {
        full: true, channel: 'listening', packs: packs, ids: picks.map(function(u){ return u.id; }),
        scored: packs.every(function(pk){ return pk.answers && Object.keys(pk.answers).length; }),
        user: {}, submitted: false, flagged: {}, seen: {}, curP: 1, cur: 1, qs: [], byKey: {}, byG: {},
        /* 听力完整模考全程考试模式（不给练习模式 —— 真机考没有这一说） */
        listenMode: 'exam', audioStarted: false, audioStartedBy: {}
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
      if(h) h.innerHTML = '<div class="bank-empty" style="padding:60px"><p>Could not load this test. Please go back and try again.</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>Back</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  /* 渲染某一个 Part（听力完整模考的「切篇」）：音频条随篇换 + 题目单栏 + 卷面题号映射。
     与 renderPassage 平行（阅读用左右分栏 + 文章；听力单栏 + 音频条）。 */
  function renderListenPart(pi){
    if(!EX || !EX.full) return;
    EX.curP = pi;
    var pk = EX.packs[pi - 1];
    EX.unit = pk.unit;                                  /* 音频条 / 原文按篇取 → 复用同一套取数路径 */
    var barHost = document.getElementById('exAudioHost');
    if(barHost) /* 10/14：计时文本从现有 DOM 读（tick 里会双向同步，见 startTimer），不新建函数 */
    var _t = (document.getElementById('exTimer') || {}).textContent || '00:30:00';
    barHost.innerHTML = audioBarHtml(partChipText(), (EX.unit && EX.unit.title) || '', _t);   /* 换篇 = 旧 <audio> 随 innerHTML 销毁（播放自动停）；Part 胶囊随篇更新 */
    wireAudio();                                        /* ⚠️ 新 <audio> 元素必须重绑事件（play 监听 = 「只播一遍」的记号来源） */
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
    if(EX.submitted){ showScript(); decoratePassage(pi); }
    else if(EX.audioStartedBy && EX.audioStartedBy[pi]){
      /* 这个 Part 的音频已经播过 → 不可重播（整场只播一遍）。交卷后不在此列（解锁复听口径不变）。 */
      var pb = document.querySelector('#exAudioBar [data-aplay]');
      if(pb){ pb.disabled = true; pb.title = 'This audio has already been played.'; }
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
      headSlotsInto();                                    /* 10/16：heading 题段前虚线槽（她 18:16 口径） */
    }
    if(qcol){
      var numOf = numOfPassage(pi), qi = 0, qh = '';
      (pk.unit.parts || []).forEach(function(p){
        (p.groups || []).forEach(function(g){ qh += groupHtml(g, qi++, numOf); });
      });
      qcol.innerHTML = qh; qcol.scrollTop = 0;
    }
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

      var anchor = qnEl || (bl ? bl.closest('.ex-group') : null);
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
    if(!art || !EX) return;
    art.querySelectorAll('.ex-hslot').forEach(function(s){ s.remove(); });     /* 幂等：重渲染先清 */
    /* heading 组 = matching 且选项首项是罗马数字（与 groupHtml 的 isHead 同判据）。
       ⚠️ 题库实测两种形态：① 题干带字母（"Paragraph A"，Termite Mounds 那种）；
       ② **题干只有 "Paragraph"（字母缺失，如 Bird Migration）** → 退化按顺序对应（题号升序 ↔ 段落字母升序）。 */
    var qns = [], hasLetter = false, letterMap = {};
    (EX.groups || []).forEach(function(g){
      var q0 = (g.questions || [])[0] || {};
      var opts = q0.options || [];
      if(!opts.length || !/^[ivx]+$/i.test(String(opts[0].optionNum || ''))) return;
      (g.questions || []).forEach(function(q){
        if(q.qNumber == null) return;
        qns.push(String(q.qNumber));
        var m = /(?:paragraph|section)\s+([A-Z])\b/i.exec(plain(q.question || ''));
        if(m){ hasLetter = true; letterMap[m[1].toUpperCase()] = String(q.qNumber); }
      });
    });
    if(!qns.length) return;
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
    var n = Math.min(seq.length, qns.length);
    for(var i = 0; i < n; i++){
      var L = seq[i].L;
      var qn = hasLetter ? letterMap[L] : qns[i];
      if(!qn) continue;
      if(art.querySelector('.ex-hslot[data-q="' + qn + '"]')) continue;       /* 同题号只插一个 */
      var host = art.querySelector('.ex-drop[data-q="' + qn + '"]');          /* 从题目区槽取同一个 gid */
      var gid = host ? host.getAttribute('data-g') : '';
      var slot = document.createElement('div');
      slot.className = 'ex-drop ex-hslot';
      slot.setAttribute('data-q', qn);
      if(gid) slot.setAttribute('data-g', gid);
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
    var box = document.getElementById('exNums'); if(!box) return;
    /* 10/12 批A：题号行只列【当前篇】（她 22:03「所有题堆在下面」的根治点）。
       三态（爱听写 + 新西兰官方 Quick Guide「答过的题上方出现线 / flag 由方变圆」）：
       cur  = 当前题，黑框包裹数字；done = 已答，数字上方一条黑色粗线；flag = 数字外套细圈。
       原四态（Not seen/No response/Completed/Marked）是 Review 总览口径，本产品无 Review 屏 → 退役。 */
    EX.seen = EX.seen || {};
    EX.seen[String(EX.cur)] = 1;
    var user = collect();
    /* full = 当前篇题号；单篇 = 本篇全部（allNums 本来就是单篇口径） */
    var nums = EX.full ? qsOfPassage(EX.curP).map(function(e){ return e.g; }) : allNums();
    /* 10/17 复盘：交卷后题号行变「答题卡」—— 绿=对 / 红=错（爱听写 bg-green-100 / bg-red-100 口径）。
       此前交卷后只有「已答」态（一道黑线），用户看不出哪题错，只能一路滚页面逐条找。
       full 模式 EX.byG 才有连续题号键；单篇的 detail[].qn 是 String(qNumber)，两者都能命中 mark。 */
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
    box.innerHTML = nums.map(function(n){
      var k = String(n);
      var answered = user[k] != null && String(user[k]).length;
      var cls = 'ex-num';
      if(answered) cls += ' ex-num--done';
      if(EX.flagged[k]) cls += ' ex-num--flag';
      if(String(EX.cur) === k) cls += ' ex-num--cur';
      if(mark && Object.prototype.hasOwnProperty.call(mark, k)) cls += mark[k] ? ' ex-num--hit' : ' ex-num--miss';
      return '<button type="button" class="' + cls + '" data-jump="' + esc(k) + '" title="Q' + esc(k) + '">' + esc(k) + '</button>';
    }).join('');
    paintPgSwitch();
  }

  /* A4. 篇切换器（full 模式）：左「‹ 当前篇 · 已答/总数」右「下一篇 · 0/总数 ›」，到头 disabled。
     听力文案 = Part N；阅读 = Passage N；写作 = Task N（无篇概念时不渲染，由 channel 分支处理）。 */
  function paintPgSwitch(){
    /* 10/15 她拍板：Part 并排切换器（对标爱听写/IDP 真机考 Question Navigator）。
       原「‹ Passage 1 · 0/13 ›」左右箭头一次只能看相邻两篇 →
       改成 Part 1 | Part 2 | Part 3(4) 全部并排，每个带 已答/总数，当前篇白底高亮。
       单篇练习（非 full）不渲染，只留题号行。 */
    var parts = document.getElementById('exParts');
    var nav = document.getElementById('exNav');
    if(!parts) return;
    if(!EX || !EX.full){ if(parts) parts.innerHTML = ''; if(nav) nav.classList.add('ex-nav--plain'); return; }
    nav.classList.remove('ex-nav--plain');
    var isL = EX.channel === 'listening', isW = EX.channel === 'writing';
    /* 10/15 口径对齐官方/爱听写：阅读是 Passage 1/2/3（官方卷面用词），听力才是 Part 1–4，
       写作两篇是 Task 1/2。此前阅读也写 Part（10/15 并排切换器那批的副作用），本次纠回。 */
    var lbl = isL ? 'Part' : (isW ? 'Task' : 'Passage');
    var n = isL ? 4 : (isW ? 2 : 3);
    var user = collect();
    /* 手机缩写：P1/P2…（省宽度，390px 放 4 个 + Finish/Exit） */
    var narrow = window.matchMedia && window.matchMedia('(max-width:860px)').matches;
    var h = '';
    for(var pi = 1; pi <= n; pi++){
      var tot = 0, done = 0;
      if(!isW){
        var list = qsOfPassage(pi) || [];
        tot = list.length;
        list.forEach(function(e){ if(user[e.g] != null && String(user[e.g]).length) done++; });
      }
      var on = (pi === EX.curP);
      var txt = narrow ? ('P' + pi) : (lbl + ' ' + pi);
      var prog = isW ? '' : ('<span class="ex-pt-n">' + done + '/' + tot + '</span>');
      h += '<button type="button" class="ex-pt' + (on ? ' on' : '') + '" data-pg="' + pi + '"'
        + (on ? ' aria-current="true"' : '') + '>'
        + '<span class="ex-pt-t">' + txt + '</span>' + prog + '</button>';
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
        if(_hideT){                       /* 10/18：隐藏计时 —— 只换显示，倒计时与收卷逻辑不变 */
          el.textContent = '--:--';
          el.classList.remove('warn'); el.classList.remove('soon');
        } else {
          var hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
          el.textContent = pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
          el.classList.toggle('warn', left <= 300 && left > 0);
          el.classList.toggle('soon', left <= 600 && left > 300);
        }
      }
      /* 10/14 听力顶栏一行化：音频条里的整场计时同步刷新（标题行 CSS 隐藏但 JS 仍跑，双写保平安）
         10/18：听力单篇的计时已搬进音频条（#eaFullTimer），这里同步给 10/5 分钟双档警示色。 */
      var ft = document.getElementById('eaFullTimer');
      if(ft){
        if(_hideT){
          ft.textContent = '--:--';
          ft.classList.remove('warn'); ft.classList.remove('soon');
        }
        else {
          var fh = Math.floor(left / 3600), fm = Math.floor((left % 3600) / 60), fs2 = left % 60;
          ft.textContent = pad2(fh) + ':' + pad2(fm) + ':' + pad2(fs2);
          ft.classList.toggle('warn', left <= 300 && left > 0);
          ft.classList.toggle('soon', left <= 600 && left > 300);
        }
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
  function pauseExam(){
    if(!EX || EX.submitted || EX.paused) return;
    if(EX.listenMode === 'exam') return;                   /* 考试模式没有暂停（按钮也不渲染，双保险） */
    EX.paused = true;
    if(EX._leftSec == null) EX._leftSec = 60 * 60;
    stopTimer();
    var a = document.getElementById('exAudio');
    EX._wasPlaying = !!(a && !a.paused);
    if(a) a.pause();
    var b = document.getElementById('exPauseBtn');
    if(b){ b.textContent = 'Resume'; b.classList.add('on'); }
    paintFtMini();
  }
  function resumeExam(){
    if(!EX || !EX.paused) return;
    EX.paused = false;
    startTimer(EX._leftSec == null ? 60 * 60 : EX._leftSec);
    var a = document.getElementById('exAudio');
    if(a && EX._wasPlaying) a.play();
    var b = document.getElementById('exPauseBtn');
    if(b){ b.textContent = 'Pause'; b.classList.remove('on'); }
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
    reportExamState(false);   /* 10/15 考试结束，可以刷新了 */
  }

  /* ===== 口语模考入口（10/11 第 8 项）=====
     点「开始模考」= 软导航到 speaking.html，导航 await 完成后替它点一下隐藏的「MOCK」tab。
     为什么能这么接：speaking.js 的 tab 点击是 ready() 里 addEventListener 绑的，而 softNavigate
     await 了 runPageScript → ready() 已同步跑完、处理器就位，外部 .click() 才生效。
     好处 = **口语页一行都不用改**（它的模考逻辑/题库全部原样复用）。 */
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
      if(t.closest && t.closest('#exAudioBar [data-aplay]')){ audioToggle(); return; }
      /* Pause / Resume（10/13 她报「Pause 是个摆设」→ 实现：暂停音频+倒计时，按钮互文切换） */
      if(t.closest && t.closest('#exPauseBtn')){
        if(EX && EX.paused) resumeExam(); else pauseExam();
        return;
      }
      if((el = t.closest && t.closest('#examRoot [data-arate]'))){
        var a1 = document.getElementById('exAudio'); if(!a1) return;
        _rateIx = (_rateIx + 1) % AUDIO_RATES.length;
        a1.playbackRate = AUDIO_RATES[_rateIx];
        el.textContent = rateLabel(AUDIO_RATES[_rateIx]);
        return;
      }
      if(t.closest && t.closest('#exAudioBar [data-amode]')){ audioToggleMode(); return; }
      if((el = t.closest && t.closest('#examRoot [data-avol]'))){
        _audioMuted = !_audioMuted;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioMuted ? 0 : _audioVol;
        el.textContent = _audioMuted ? '🔇' : '🔊';
        var sl0 = document.querySelector('#examRoot [data-avsl]');
        if(sl0) sl0.value = _audioMuted ? 0 : _audioVol;
        return;
      }
      if(t.closest && t.closest('#eaBar')){ audioSeek(e); return; }
      if((el = t.closest && t.closest('.ex-pill')) && !(EX && EX.submitted)){
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
      /* 听力音量：滑杆拖动实时生效 + 记住（两模式都可用 —— 真机考只有音量可控） */
      if(t.matches && t.matches('#examRoot [data-avsl]')){
        _audioVol = Math.max(0, Math.min(1, parseFloat(t.value) || 0));
        _audioMuted = _audioVol === 0;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioVol;
        var vb = document.querySelector('#examRoot [data-avol]');
        if(vb) vb.textContent = _audioMuted ? '🔇' : '🔊';
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
})();
