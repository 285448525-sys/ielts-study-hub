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
  var _fullSet = null;        // 当前列表页展示的「完整模考」随机组卷结果（3 篇）

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

  /* 篇目列表的标记（阅读 / 听力共用同一套 .bank-items 结构，只是挂在不同容器上） */
  function listHtml(units, channel){
    var h = '<ul class="bank-items">';
    for(var k = 0; k < units.length; k++){
      var u = units[k], st = '', oc = '未做', chips = '';
      try{
        var rec = localStorage.getItem('hub_bank_last_' + u.id);
        if(rec){ var r = JSON.parse(rec); st = 'ok'; oc = r.correct + '/' + r.total; }
      }catch(e){}
      (u.types || []).forEach(function(t, i){ chips += '<span class="bi-ch ' + chipCls(t, i) + '">' + esc(t) + '</span>'; });
      h += '<li class="bank-item" data-unit="' + esc(u.id) + '" data-ch="' + esc(channel) + '">'
        +    '<span class="bi-no">' + (k + 1) + '</span>'
        +    '<span class="bi-tt"><b>' + esc(u.title || '未命名') + '</b>'
        +      (u.titleZh ? '<i>' + esc(u.titleZh) + '</i>' : '') + '</span>'
        +    '<span class="bi-chips">' + chips + '</span>'
        +    '<span class="bi-qn">' + (u.qCount || 0) + ' 题</span>'
        +    '<span class="bi-st ' + st + '">' + esc(oc) + '</span>'
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
  }

  /* ===== 列表页「完整模考」入口卡（3 篇一套 · 随机组卷）=====
     组卷方式：每次从 Part 1 / Part 2 / Part 3 各随机抽一篇（她 10/11 拍板「随机组卷」）。
     卡上列出的三篇 = 点 Start 真正会用的那三篇（渲染时组一次，Start 直接用同一批）。 */
  function composeFullTest(){
    var all = unitsOf('reading'), picked = [];
    ['Part 1', 'Part 2', 'Part 3'].forEach(function(part){
      var pool = all.filter(function(u){ return (u.partNum || 'Part 1') === part; });
      if(!pool.length){ picked.push(null); return; }
      picked.push(pool[Math.floor(Math.random() * pool.length)]);
    });
    return picked.indexOf(null) > -1 ? null : picked;
  }
  function renderFullEntry(){
    var host = document.getElementById('fullEntry'); if(!host) return;
    if(!_manifest){ host.innerHTML = ''; return; }
    if(!_fullSet) _fullSet = composeFullTest();
    if(!_fullSet){ host.innerHTML = ''; return; }
    var total = 0;
    _fullSet.forEach(function(u){ total += (u.qCount || 0); });
    host.innerHTML = '<div class="full-card">'
      + '<div class="fc-num">' + total + '</div>'
      + '<div class="fc-body"><b>Full Reading Test · 完整阅读模考</b>'
      +   '<span>3 passages · ' + total + ' questions · 60 minutes</span>'
      +   '<div class="fc-pills">' + _fullSet.map(function(u, i){
            return '<span class="fc-pill" data-unit="' + esc(u.id) + '">Passage ' + (i + 1) + ' · ' + esc(u.title || '') + '</span>';
          }).join('') + '</div>'
      + '</div>'
      + '<button class="btn-primary" type="button" data-fullstart>Start Test</button>'
      + '</div>';
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
      EX = {
        unit: unit, channel: channel,
        answers: ansFile.answers || {}, alts: ansFile.alts || {},
        user: {}, submitted: false, groups: [], total: 0, correct: 0,
        /* 听力专用：开始一律练习模式 + 音频未播过；倍速复位 */
        listenMode: 'practice', audioStarted: false
      };
      _rateIx = 0; _audioBound = null;
      try{ EX.user = JSON.parse(localStorage.getItem('hub_bank_draft_' + unitId) || '{}') || {}; }catch(e){ EX.user = {}; }
      renderExam();
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
  /* 多选题：方框 + 字母加粗（指令里已写 Choose TWO / THREE letters） */
  function cboxHtml(q, numOf){
    var h = '<div class="ex-cbox ex-opts" data-q="' + esc(numOf(q.qNumber)) + '">';
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
      return '<input class="ex-blank" type="text" data-q="' + gn + '" placeholder="' + gn + '"'
        + ' autocomplete="off" spellcheck="false">';
    });
    return { html: '<div class="ex-html">' + html + '</div>', had: had };
  }

  function groupHtml(g, idx, numOf, channel){
    numOf = numOf || idNum();
    channel = channel || (EX && EX.channel) || 'reading';
    var h = '<div class="ex-group" data-gtype="' + esc(g.type) + '">';
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
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + esc(plain(q.question))
          + '<div class="ex-drop" data-q="' + esc(n) + '" data-g="' + gid + '"></div></div>';
      });
    } else if(g.type === 'map'){
      /* map 这一个 type 在题库里是两种题：
         · 阅读 —— 实为「哪一段包含以下信息」的段落信息匹配：字母指段落，靠左边文章作答；
         · 听力 —— 真地图标注题：字母指地图上的位置，靠上面的 g.imageUrl 配图作答。
         两者渲染方式相同（题干 + 一排字母），差别只在有没有配图 → 上面统一挂图即可。 */
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + esc(plain(q.question)) + pillsHtml(q, numOf) + '</div>';
      });
    } else if(g.type === 'multiple-choice'){
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + clean(q.question) + cboxHtml(q, numOf) + '</div>';
      });
    } else {
      var tf = isTFGroup(g);
      qs.forEach(function(q){
        var n = numOf(q.qNumber);
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(n) + '">' + esc(n) + '</span>'
          + clean(q.question) + (tf ? pillsHtml(q, numOf) : radioHtml(q, numOf)) + '</div>';
      });
    }
    return h + '</div>';
  }

  /* ===== 考试页外壳（单篇 / 完整模考共用，避免两份 HTML 漂移）===== */
  function shellHtml(nameText, subText, timerText){
    return '<div class="ex-top">'
      +    '<div class="ex-name">' + esc(nameText)
      +      (subText ? '<small>' + esc(subText) + '</small>' : '') + '</div>'
      +    '<span class="ex-timer" id="exTimer">' + timerText + '</span>'
      +    '<div class="ex-icons">'
      +      '<button class="ex-ico" type="button" data-gear title="Settings">Aa</button>'
      +      '<div class="ex-pop" id="exSetPop">'
      +        '<h5>Text size</h5>'
      +        '<label><input type="radio" name="exTs" value="regular" checked> Regular</label>'
      +        '<label><input type="radio" name="exTs" value="large"> Large</label>'
      +        '<label><input type="radio" name="exTs" value="xl"> Extra large</label>'
      +        '<hr><h5>Contrast</h5>'
      +        '<label><input type="radio" name="exCt" value="light" checked> Black on white</label>'
      +        '<label><input type="radio" name="exCt" value="dark"> White on black</label>'
      +        '<label><input type="radio" name="exCt" value="yellow"> Yellow on black</label>'
      +      '</div>'
      +    '</div></div>';
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
  function barHtml(){
    /* 真机考屏幕下方四按钮 = Mark / Review / Previous / Next（eickaopei 机考复盘）。
       Review 的职能由始终可见的答题卡承担（比弹层更直接），这里 ▣ 只做 Mark。
       10/12 纠偏：原来 title 写 "Review" 但行为是标记当前题 → 名不副实。 */
    return '<div class="ex-bar">'
      +    '<button class="ex-ico" type="button" data-flag title="Mark" aria-label="Mark for review">▣</button>'
      +    '<div class="ex-sheet" id="exSheet"></div>'
      +    '<div class="ex-actions">'
      +      '<button class="ex-ico" type="button" data-prev title="Previous">‹</button>'
      +      '<button class="ex-ico" type="button" data-next title="Next">›</button>'
      +      '<button class="btn-ghost" type="button" data-exit>Exit</button>'
      +      '<button class="btn-primary" type="button" data-submit>Submit</button>'
      +    '</div></div>';
  }
  function ctxHtml(){
    /* 10/12 改：由竖排五项改横向浮动工具条；`unhl` 合并了原来的单项 Clear
       （选中/右键压到已有标注时，Highlight/Note 会套娃 → 只给 Remove）。
       显示哪一个由 paintCtxButtons() 按上下文决定。 */
    return '<div class="ex-ctx" id="exCtx">'
      +    '<button type="button" data-hact="hl">Highlight</button>'
      +    '<button type="button" data-hact="note">Note</button>'
      +    '<hr>'
      +    '<button type="button" data-hact="unhl">Remove</button>'
      +    '<button type="button" data-hact="clearall">Clear all</button>'
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
  function audioBarHtml(){
    var p = listenPart();
    if(!p || !p.audioUrl) return '<div class="ex-audio" id="exAudioBar"><span class="ea-label">本部分没有音频</span></div>';
    var exam = EX.listenMode === 'exam';
    return '<div class="ex-audio' + (exam ? ' locked' : '') + '" id="exAudioBar">'
      + '<button class="ea-play" type="button" data-aplay aria-label="Play">▶</button>'
      + '<span class="ea-label">' + esc(listenPartLabel()) + '</span>'
      + '<div class="ea-bar" id="eaBar"><div class="ea-fill" id="eaFill"></div><span class="ea-knob" id="eaKnob"></span></div>'
      + '<span class="ea-time" id="eaTime">00:00 / 00:00</span>'
      + '<button class="ea-vol" type="button" data-avol aria-label="Mute">' + (_audioMuted || _audioVol === 0 ? '🔇' : '🔊') + '</button>'
      + '<input class="ea-vsl" type="range" min="0" max="1" step="0.05" value="' + (_audioMuted ? 0 : _audioVol) + '" data-avsl aria-label="Volume">'
      + '<button class="ea-rate" type="button" data-arate' + (exam ? ' style="display:none"' : '') + '>' + rateLabel(AUDIO_RATES[_rateIx]) + '</button>'
      + '<button class="ea-mode' + (exam ? ' exam' : '') + '" type="button" data-amode'
      + (EX.audioStarted ? ' disabled' : '')
      + ' title="' + (EX.audioStarted ? '已经开始播放，本次不能再切换' : '切到考试模式后音频直通，不能暂停/拖动') + '">'
      + (exam ? '考试模式' : '练习模式') + '</button>'
      + '</div>'
      + '<audio id="exAudio" preload="metadata" src="' + esc(p.audioUrl) + '"></audio>';
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
  function wireAudio(){
    var a = document.getElementById('exAudio');
    if(!a || a === _audioBound) return;                  /* 记住绑过哪个元素，别重复绑 */
    _audioBound = a;
    /* 音量：套用上次的值（模块加载时已回读） */
    a.volume = _audioVol;
    a.playbackRate = AUDIO_RATES[_rateIx];
    a.addEventListener('loadedmetadata', paintAudio);
    a.addEventListener('timeupdate', paintAudio);
    a.addEventListener('play', function(){ if(EX) EX.audioStarted = true; lockAudioMode(); paintAudio(); });
    a.addEventListener('pause', paintAudio);
    a.addEventListener('ended', paintAudio);
    paintAudio();
  }
  function lockAudioMode(){
    var b = document.querySelector('#exAudioBar [data-amode]');
    if(b && EX && EX.audioStarted && b.textContent !== '已交卷'){ b.disabled = true; b.title = '已经开始播放，本次不能再切换'; }
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
    if(b){ b.classList.toggle('exam', !!exam); b.textContent = exam ? '考试模式' : '练习模式'; }
    var rt = bar.querySelector('[data-arate]');
    if(rt) rt.style.display = exam ? 'none' : '';
  }
  function audioToggleMode(){
    if(!EX || EX.audioStarted) return;                   /* 已经开始播 → 锁死 */
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
        d.innerHTML = '<summary>听力原文 Script</summary><div class="sc-body">' + html + '</div>';
        inner.insertBefore(d, inner.firstChild);
      }
    }
    audioSetMode(false);
    var bar = document.getElementById('exAudioBar');
    if(bar){
      var b = bar.querySelector('[data-amode]');
      if(b){ b.disabled = true; b.classList.remove('exam'); b.textContent = '已交卷'; }
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
      /* 听力：顶部音频条 + 单栏题目（听力没有独立文章区，不做左右分栏）。
         Highlight/Note 菜单依赖 #exArt，听力没有 → 不渲染，避免出现点不动的入口。 */
      host.innerHTML = shellHtml('Listening', listenPartLabel() + ' · ' + u.title, '00:30:00')
        + audioBarHtml()
        + '<div class="ex-listen" id="exListen"><div class="ex-listen-in" id="exListenIn">'
        + groups.map(function(g, i){ return groupHtml(g, i, null, 'listening'); }).join('')
        + '</div></div>'
        + barHtml();
    } else {
      var artHtml = '';
      parts.forEach(function(p){ artHtml += clean(p.article || ''); });
      host.innerHTML = shellHtml('Reading', u.title, '01:00:00')
        + splitHtml(artHtml, groups.map(function(g, i){ return groupHtml(g, i, null, 'reading'); }).join(''))
        + barHtml() + ctxHtml();
    }

    Object.keys(EX.user || {}).forEach(function(qn){ applyAnswer(qn, EX.user[qn]); });
    paintSheet();
    if(isListen) wireAudio();
    else { renderNotes(); replayMarks(); }
    if(EX.submitted){ if(isListen) showScript(); decoratePassage(EX.curP); }
    startTimer(isListen ? 30 * 60 : 60 * 60);
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
      return { id: unitId, unit: res[0], answers: a.answers || {}, alts: a.alts || {} };
    });
  }

  function openFullTest(set){
    var picks = (set && set.length === 3) ? set : composeFullTest();
    if(!picks) return;
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){ host.hidden = false; host.innerHTML = '<div class="bank-loading" style="padding:60px">Loading…</div>'; }

    Promise.all(picks.map(function(u){ return loadPack('reading', u.id); })).then(function(packs){
      EX = {
        full: true, channel: 'reading', packs: packs, ids: picks.map(function(u){ return u.id; }),
        user: {}, submitted: false, flagged: {}, curP: 1, cur: 1, qs: [], byKey: {}, byG: {}
      };
      packs.forEach(function(pk, pi){
        (pk.unit.parts || []).forEach(function(part){
          (part.groups || []).forEach(function(g){
            (g.questions || []).forEach(function(q){
              if(q.qNumber == null) return;
              var ent = { g: EX.qs.length + 1, p: pi + 1, loc: String(q.qNumber), q: q, pack: pk };
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
        host2.innerHTML = shellHtml('Reading Test', 'Full Test', '01:00:00')
          + '<div class="ex-ptabs" id="exPtabs">' + ptabsInner() + '</div>'
          + splitHtml('', '') + barHtml() + ctxHtml();
      }
      renderPassage(1);
      renderNotes();
      startTimer(60 * 60);
    }).catch(function(err){
      if(window.console && console.error) console.error('[bank] 完整模考加载失败：', err);
      var h = document.getElementById('examRoot');
      if(h) h.innerHTML = '<div class="bank-empty" style="padding:60px"><p>Could not load this test. Please go back and try again.</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>Back</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  function qsOfPassage(pi){ return ((EX && EX.qs) || []).filter(function(e){ return e.p === pi; }); }
  function numOfPassage(pi){
    return function(loc){ var e = EX.byKey[pi + '|' + String(loc)]; return e ? e.g : loc; };
  }
  function ptabsInner(){
    var h = '';
    [1, 2, 3].forEach(function(pi){
      h += '<button class="ex-ptab' + (pi === EX.curP ? ' on' : '') + '" type="button" data-ep="' + pi + '">'
        + '<span class="ex-dot"></span>Passage ' + pi + ' · ' + qsOfPassage(pi).length + ' Qs</button>';
    });
    return h;
  }
  function paintPtabs(){
    var box = document.getElementById('exPtabs'); if(!box || !EX || !EX.full) return;
    var user = collect();
    box.innerHTML = ptabsInner();
    box.querySelectorAll('.ex-ptab').forEach(function(b){
      var pi = Number(b.getAttribute('data-ep')), all = 0, done = 0;
      qsOfPassage(pi).forEach(function(e){ all++; if(user[e.g] != null && String(user[e.g]).length) done++; });
      b.classList.toggle('done', all > 0 && done === all);
    });
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
    var list = qsOfPassage(pi);
    if(list.length) EX.cur = list[0].g;
    list.forEach(function(e){ if(EX.user[e.g] != null) applyAnswer(e.g, EX.user[e.g]); });
    if(EX.submitted) decoratePassage(pi);
    replayMarks();
    paintSheet();
  }

  /* 交卷后给「当前这一篇」逐题上色 + 挂解析（切篇时按篇重跑） */
  function decoratePassage(pi){
    var root = document.getElementById('examRoot'); if(!root || !EX || !EX.result) return;
    EX.result.detail.forEach(function(d){
      if(EX.full){
        var ent = EX.byG[d.qn];
        if(!ent || ent.p !== pi) return;
      }
      var qnEl = root.querySelector('.ex-qn[data-qn="' + d.qn + '"]');
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
      var dpEl = root.querySelector('.ex-drop[data-q="' + d.qn + '"]');
      if(dpEl && dpEl.getAttribute('data-v')){
        dpEl.classList.add(norm(dpEl.getAttribute('data-v')) === norm(d.right) ? 'right' : 'wrong');
        dpEl.style.pointerEvents = 'none';
      }
      var bl = root.querySelector('input.ex-blank[data-q="' + d.qn + '"]'); if(bl) bl.disabled = true;
      if(bl && !d.ok){ bl.style.borderBottomColor = '#e6b3ae'; bl.style.color = '#b3261e'; }

      var anchor = qnEl || (bl ? bl.closest('.ex-group') : null);
      var groupEl = anchor ? anchor.closest('.ex-group') : null;
      if(groupEl){
        var box = document.createElement('div'); box.className = 'ex-expl';
        box.innerHTML = '<b>' + esc(d.qn) + '</b>　Correct: <b>' + esc(d.right || '—') + '</b>'
          + '　Yours: ' + (d.user ? esc(d.user) : '—') + buildExpl(d.q);
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
      [1, 2, 3].forEach(function(pi){
        var tot = 0, ok = 0;
        qsOfPassage(pi).forEach(function(e){
          var d = null;
          for(var i = 0; i < res.detail.length; i++){ if(res.detail[i].qn === String(e.g)){ d = res.detail[i]; break; } }
          if(!d) return;
          tot++; if(d.ok) ok++;
        });
        cards += '<div class="fx-pcard"><b>PASSAGE ' + pi + '</b><div>' + ok + ' / ' + tot + '</div></div>';
      });
    }
    var lsn = isListen();
    var el = document.createElement('div');
    el.className = 'fx-score';
    el.innerHTML = '<div class="fx-top"><b>' + res.right + ' / ' + res.total + '</b>'
      + '<span class="fx-band">总分 ' + Number((lsn ? bandOfListening : bandOfReading)(raw)).toFixed(1) + '</span>'
      + '<span>' + (lsn ? 'Listening' : 'Academic Reading') + ' · ' + res.total + ' 题换算</span></div>'
      + (cards ? '<div class="fx-pgrid">' + cards + '</div>' : '');
    var pt = root.querySelector('.ex-ptabs');
    root.insertBefore(el, pt || root.firstChild);
  }

  /* ===== 配对题拖拽（Pointer Events：鼠标 + 触屏通用；不用 HTML5 DnD —— 它在触屏完全不工作）===== */
  var _dg = null, _ghost = null, _dgOff = { x: 0, y: 0 }, _dgStart = { x: 0, y: 0 }, _sel = null;
  function dgDrops(){ return [].slice.call(document.querySelectorAll('#examRoot .ex-drop')); }
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
    if(!silent){ saveDraft(); paintSheet(); }
  }
  function dgClearEl(drop){
    if(!drop || !drop.getAttribute('data-v')) return;
    dgMark(drop.getAttribute('data-v'), false, drop.getAttribute('data-g'));
    drop.removeAttribute('data-v');
    drop.classList.remove('filled', 'right', 'wrong');
    drop.innerHTML = '';
    saveDraft(); paintSheet();
  }
  function dgDropAt(x, y){ var el = document.elementFromPoint(x, y); return el ? el.closest('.ex-drop') : null; }

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
    } else if(act === 'clearall'){
      art.querySelectorAll('.ex-hl, .ex-nt').forEach(unwrapEl);
      saveMarks([]);
      renderNotes();
      var sp2 = document.getElementById('exSplit'); if(sp2) sp2.classList.remove('hasnotes');
    }
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
  /* 按钮显隐规则：有选区 → Highlight（压到已有高亮也显示：再点 = 玫红 toggle）；
     压到已有笔记时 Note 隐藏（再记会套娃）；压到任何已有标注 → Remove；
     有标注时永远给 Clear all。返回「有没有可显示的按钮」。 */
  function paintCtxButtons(){
    var ctx = document.getElementById('exCtx'); if(!ctx) return false;
    var hasR = !!_hlRange, span = !!_hlSpan;
    var spans = hasR ? marksInRange(_hlRange) : [];
    var overlapHl = spans.some(function(sp){ return sp.classList.contains('ex-hl'); });
    var overlapNt = spans.some(function(sp){ return sp.classList.contains('ex-nt'); });
    var anyMark = loadMarks().length > 0;
    function set(act, on){
      var b = ctx.querySelector('[data-hact="' + act + '"]');
      if(b) b.style.display = on ? '' : 'none';
    }
    set('hl', hasR);
    set('note', hasR && !overlapNt);
    set('unhl', overlapHl || overlapNt || span);
    set('clearall', anyMark);
    var hr = ctx.querySelector('hr');
    if(hr) hr.style.display = (overlapHl || overlapNt || span) ? '' : 'none';
    return hasR || span || anyMark;
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
    if(inp){ inp.value = Array.isArray(val) ? (val[0] || '') : val; return; }
    var sel = root.querySelector('select[data-q="' + qn + '"]');
    if(sel){ sel.value = val; return; }
    var box = root.querySelector('.ex-cbox[data-q="' + qn + '"]');
    if(box){
      var arr = Array.isArray(val) ? val : (val ? [val] : []);
      box.querySelectorAll('input[type=checkbox]').forEach(function(c){ c.checked = arr.indexOf(c.value) > -1; });
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
      if(vals.length) out[b.getAttribute('data-q')] = vals;
    });
    root.querySelectorAll('.ex-radio-box[data-q]').forEach(function(b){
      var c = b.querySelector('input:checked'); if(c) out[b.getAttribute('data-q')] = c.value;
    });
    root.querySelectorAll('.ex-drop[data-q]').forEach(function(d){
      var v = d.getAttribute('data-v');
      if(v) out[d.getAttribute('data-q')] = v;
    });
    root.querySelectorAll('select[data-q]').forEach(function(s){ if(s.value) out[s.getAttribute('data-q')] = s.value; });
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
      if(EX.full) localStorage.setItem('hub_bank_full_draft', JSON.stringify({ ids: EX.ids, user: c, ts: Date.now() }));
      else localStorage.setItem('hub_bank_draft_' + EX.unit.id, JSON.stringify(c));
    }catch(e){}
  }

  function paintSheet(){
    var root = document.getElementById('examRoot'); if(!root || !EX) return;
    var sheet = document.getElementById('exSheet'); if(!sheet) return;
    /* 真机考 Review 总览的四态（eickaopei 机考复盘 + 申友雅思答题卡口径一致）：
       Not seen / No response / Completed / Marked。
       「看过」以「当前题被画过」为准 —— paintSheet 在进考场/跳题/答题后都会跑，够用且不用额外钩子。 */
    EX.seen = EX.seen || {};
    EX.seen[String(EX.cur)] = 1;
    var user = collect();
    sheet.innerHTML = allNums().map(function(n){
      var answered = user[n] != null && String(user[n]).length;
      var mk = EX.marks && EX.marks[n];
      var cls = 'ex-sq';
      if(answered) cls += ' done';
      if(EX.flagged[n]) cls += ' flag';
      if(!answered && EX.seen[n]) cls += ' seen';
      if(mk) cls += ' ' + mk;
      if(String(EX.cur) === n) cls += ' cur';
      var st = mk ? (mk === 'hit' ? 'Correct' : 'Incorrect')
             : EX.flagged[n] ? 'Marked'
             : answered ? 'Completed'
             : EX.seen[n] ? 'No response' : 'Not seen';
      return '<span class="' + cls + '" data-jump="' + esc(n) + '" title="Q' + esc(n) + ' · ' + st + '">' + esc(n) + '</span>';
    }).join('');
    paintPtabs();
  }

  function goTo(n){
    if(!EX) return;
    n = Number(n);
    if(EX.full){
      var ent = EX.byG[n]; if(!ent) return;
      if(ent.p !== EX.curP) renderPassage(ent.p);      /* 跳到别的篇 → 先换篇 */
      EX.cur = n;
      paintSheet();
      var el2 = document.querySelector('#examRoot .ex-qn[data-qn="' + n + '"]')
             || document.querySelector('#examRoot input.ex-blank[data-q="' + n + '"]');
      if(el2) el2.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    EX.cur = n;
    paintSheet();
    var el = document.querySelector('#examRoot .ex-qn[data-qn="' + n + '"]')
          || document.querySelector('#examRoot input.ex-blank[data-q="' + n + '"]');
    if(el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ===== 计时（倒计时，格式与写作机考一致：时:分:秒）=====
     双档提醒对齐真机考「10 分钟和 5 分钟自动闪烁」（eickaopei 机考复盘）：
       10 分钟 = 琥珀色常亮（轻提醒，不闪 —— 还有 10 分钟就闪会干扰答题）
        5 分钟 = 红色闪烁（强提醒）
     到点 = 强制交卷（所有成熟机考模拟器的通例；原文 `left<=0` 只是停表，考卷会一直挂在那）。 */
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function startTimer(sec){
    stopTimer();
    var left = sec, el = document.getElementById('exTimer');
    function tick(){
      if(el){
        var hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
        el.textContent = pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
        el.classList.toggle('warn', left <= 300 && left > 0);
        el.classList.toggle('soon', left <= 600 && left > 300);
      }
      if(left <= 0){ stopTimer(); doSubmit(); return; }
      left--;
    }
    tick(); _timer = setInterval(tick, 1000);
  }
  function stopTimer(){ if(_timer){ clearInterval(_timer); _timer = null; } }

  /* ===== 判分 ===== */
  function judgeOne(key, alts, ua){
    if(Array.isArray(ua)){
      var rset = String(key || '').toLowerCase().split(/[,\s\/]+/).filter(Boolean).sort().join(',');
      var ok = !!rset && ua.map(function(x){ return String(x).toLowerCase(); }).sort().join(',') === rset;
      return { ok: ok, shown: ua.join(',') };
    }
    return { ok: eqAns(ua, key, alts), shown: ua };
  }
  function score(){
    var user = collect(), right = 0, total = 0, detail = [];
    if(EX.full){
      EX.qs.forEach(function(e){
        var key = e.pack.answers[e.loc], ua = user[e.g];
        var alts = (e.pack.alts && e.pack.alts[e.loc]) ? [].concat(e.pack.alts[e.loc]) : [];
        total++;
        var j = judgeOne(key, alts, ua);
        if(j.ok) right++;
        detail.push({ qn: String(e.g), user: j.shown == null ? '' : j.shown, right: key == null ? '' : key, ok: !!j.ok, q: e.q });
      });
      return { right: right, total: total, detail: detail };
    }
    EX.groups.forEach(function(g){
      (g.questions || []).forEach(function(q){
        var qn = String(q.qNumber), key = EX.answers[qn], ua = user[qn];
        var alts = (EX.alts && EX.alts[qn]) ? [].concat(EX.alts[qn]) : [];
        total++;
        var j = judgeOne(key, alts, ua);
        if(j.ok) right++;
        detail.push({ qn: qn, user: j.shown == null ? '' : j.shown, right: key == null ? '' : key, ok: !!j.ok, q: q });
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
    var ov = document.createElement('div');
    ov.className = 'ex-modal'; ov.id = 'exSubmitModal';
    ov.innerHTML = '<div class="ex-modal-c" role="dialog" aria-modal="true" aria-label="Submit test">'
      + '<h4>Submit test?</h4>'
      + (unanswered
          ? '<p>You still have <b>' + unanswered + '</b> unanswered question' + (unanswered > 1 ? 's' : '') + '. '
            + 'You can go back and check them, or submit now.</p>'
          : '<p>You have answered all questions. Submit now?</p>')
      + '<div class="ex-modal-b">'
      + '<button class="btn-ghost" type="button" data-scancel>Keep working</button>'
      + '<button class="btn-primary" type="button" data-sok>Submit</button>'
      + '</div></div>';
    host.appendChild(ov);
  }
  function closeSubmitConfirm(){ var m = document.getElementById('exSubmitModal'); if(m) m.remove(); }

  function doSubmit(){
    if(!EX || EX.submitted) return;
    EX.submitted = true; stopTimer();
    var res = score(); EX.correct = res.right; EX.result = res;

    EX.marks = {};
    res.detail.forEach(function(d){ EX.marks[d.qn] = d.ok ? 'hit' : 'miss'; });

    decoratePassage(EX.curP);
    addScoreCard(res);
    if(isListen()) showScript();                       /* 交卷后才给听力原文 + 解锁音频复听 */

    try{
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
        localStorage.removeItem('hub_bank_full_draft');
      } else {
        localStorage.setItem('hub_bank_last_' + EX.unit.id, JSON.stringify({ correct: res.right, total: res.total, ts: Date.now() }));
      }
    }catch(e){}

    paintSheet();
    var sb = document.querySelector('#examRoot [data-submit]');
    if(sb){ sb.disabled = true; sb.style.opacity = '.5'; }
  }

  function exitExam(){
    stopTimer();
    dgReset();
    hlReset();
    var au = document.getElementById('exAudio');
    if(au){ try{ au.pause(); }catch(e){} }
    _audioBound = null;                                /* 音频元素随 innerHTML 一起没了，解绑记录 */
    if(EX && !EX.submitted) saveDraft();
    EX = null;
    var host = document.getElementById('examRoot'); if(host){ host.hidden = true; host.innerHTML = ''; }
    var root = document.getElementById('bankRoot'); if(root) root.style.display = '';
    _fullSet = null;                                   /* 回到列表 → 下次组一套新的（随机组卷） */
    boot();
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
           每次切进来重渲染一次 —— 刚练完一道题回来，✓/上次分数才会即时更新。 */
        if(_mt === 'writing' && typeof window.renderExamList === 'function') window.renderExamList();
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
      if((el = t.closest && t.closest('[data-fullstart]'))){ openFullTest(_fullSet); return; }
      /* 10/11 第 8 项：口语 pane「开始模考」→ 软导航到口语页并自动进其模考流程 */
      if((el = t.closest && t.closest('[data-spkstart]'))){ spkStartMock(); return; }
      /* 完整模考：Passage 1 / 2 / 3 切篇 */
      if((el = t.closest && t.closest('#exPtabs .ex-ptab')) && EX && EX.full){
        if(!EX.submitted) saveDraft();
        renderPassage(Number(el.getAttribute('data-ep')));
        return;
      }
      if((el = t.closest && t.closest('.bank-item[data-unit]'))){
        openExam(el.getAttribute('data-unit'), el.getAttribute('data-ch'));
        return;
      }
      if(t.closest && t.closest('[data-exit]')){ exitExam(); return; }
      if(t.closest && t.closest('[data-submit]')){ submit(); return; }
      if(t.closest && t.closest('[data-sok]')){ closeSubmitConfirm(); doSubmit(); return; }
      if(t.closest && t.closest('[data-scancel]')){ closeSubmitConfirm(); return; }
      /* 听力音频条（10/11 第 9 项）：播放/暂停、倍速、练习⇄考试模式、点进度条跳转 */
      if(t.closest && t.closest('#exAudioBar [data-aplay]')){ audioToggle(); return; }
      if((el = t.closest && t.closest('#exAudioBar [data-arate]'))){
        var a1 = document.getElementById('exAudio'); if(!a1) return;
        _rateIx = (_rateIx + 1) % AUDIO_RATES.length;
        a1.playbackRate = AUDIO_RATES[_rateIx];
        el.textContent = rateLabel(AUDIO_RATES[_rateIx]);
        return;
      }
      if(t.closest && t.closest('#exAudioBar [data-amode]')){ audioToggleMode(); return; }
      if((el = t.closest && t.closest('#exAudioBar [data-avol]'))){
        _audioMuted = !_audioMuted;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioMuted ? 0 : _audioVol;
        el.textContent = _audioMuted ? '🔇' : '🔊';
        var sl0 = document.querySelector('#exAudioBar [data-avsl]');
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
      /* Settings 开关 */
      if((el = t.closest && t.closest('[data-gear]'))){
        var pop = document.getElementById('exSetPop');
        if(pop) pop.classList.toggle('on');
        return;
      }
      if(!t.closest || !t.closest('#exSetPop')){
        var pop2 = document.getElementById('exSetPop');
        if(pop2 && pop2.classList.contains('on')) pop2.classList.remove('on');
      }
      /* Review：标记当前题 */
      if((el = t.closest && t.closest('[data-flag]')) && EX && !EX.submitted){
        var cn = String(EX.cur);
        EX.flagged[cn] = !EX.flagged[cn];
        el.classList.toggle('on', !!EX.flagged[cn]);
        el.style.background = EX.flagged[cn] ? '#111' : '';
        el.style.color = EX.flagged[cn] ? '#fff' : '';
        paintSheet();
        return;
      }
      /* 上一题 / 下一题 */
      if((el = t.closest && t.closest('[data-prev]')) && EX){
        var an = allNums().map(Number), i0 = an.indexOf(Number(EX.cur));
        goTo(an[Math.max(0, i0 - 1)]);
        return;
      }
      if((el = t.closest && t.closest('[data-next]')) && EX){
        var an2 = allNums().map(Number), i1 = an2.indexOf(Number(EX.cur));
        goTo(an2[Math.min(an2.length - 1, i1 + 1)]);
        return;
      }
      /* 答题卡跳题 */
      if((el = t.closest && t.closest('.ex-sq[data-jump]')) && EX){
        goTo(el.getAttribute('data-jump'));
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
      /* 设置：字号 / 对比度 */
      if(t.name === 'exTs'){
        var sp = document.getElementById('exSplit'); if(!sp) return;
        sp.classList.remove('ts-large', 'ts-xl');
        if(t.value === 'large') sp.classList.add('ts-large');
        if(t.value === 'xl') sp.classList.add('ts-xl');
        return;
      }
      if(t.name === 'exCt'){
        var sp2 = document.getElementById('exSplit'); if(!sp2) return;
        sp2.classList.remove('ct-dark', 'ct-yellow');
        if(t.value === 'dark') sp2.classList.add('ct-dark');
        if(t.value === 'yellow') sp2.classList.add('ct-yellow');
        return;
      }
      if(!EX || EX.submitted) return;
      if(t.matches && (t.matches('input.ex-blank[data-q]') || t.matches('.ex-opts input') || t.matches('select[data-q]'))){
        saveDraft(); paintSheet();
      }
    });
    document.addEventListener('input', function(e){
      var t = e.target;
      /* 听力音量：滑杆拖动实时生效 + 记住（两模式都可用 —— 真机考只有音量可控） */
      if(t.matches && t.matches('#exAudioBar [data-avsl]')){
        _audioVol = Math.max(0, Math.min(1, parseFloat(t.value) || 0));
        _audioMuted = _audioVol === 0;
        var au = document.getElementById('exAudio');
        if(au) au.volume = _audioVol;
        var vb = document.querySelector('#exAudioBar [data-avol]');
        if(vb) vb.textContent = _audioMuted ? '🔇' : '🔊';
        try{ localStorage.setItem('hub_bank_vol', String(_audioVol)); }catch(e2){}
        return;
      }
      if(EX && !EX.submitted && t.matches && t.matches('input.ex-blank[data-q]')) paintSheet();
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
        if(d.from === 'pool'){
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
