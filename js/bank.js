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

  function renderList(channel, part){
    var host = document.getElementById('bankList');
    if(!host) return;
    if(channel !== 'reading'){ host.innerHTML = ''; return; }
    part = part || currentPart();
    var all = unitsOf(channel);
    var units = all.filter(function(u){ return (u.partNum || 'Part 1') === part; });
    var meta = document.getElementById('partMeta');
    if(meta){
      var perQ = units.length ? (units[0].qCount || 0) : 0;
      meta.textContent = part + ' · 共 ' + units.length + ' 篇' + (perQ ? (' · 每篇 ' + perQ + ' 题') : '');
    }
    if(!units.length){ host.innerHTML = '<div class="bank-empty"><p>这一部分暂时没有篇目。</p></div>'; return; }
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
    h += '</ul>';
    host.innerHTML = h;
    renderFullEntry();
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

  /* ===== 载入 manifest ===== */
  function boot(){
    var root = document.getElementById('bankRoot');
    if(!root) return;                                  // 不在本页
    if(_manifest){ showTab(root.getAttribute('data-mock-tab') || 'reading'); renderList('reading'); return; }
    if(_loading) return;
    _loading = true;
    fetch(MANIFEST, { cache: 'no-cache' })
      .then(function(r){ if(!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function(m){
        _manifest = m; _loading = false;
        var r2 = document.getElementById('bankRoot'); if(!r2) return;
        showTab(r2.getAttribute('data-mock-tab') || 'reading');
        renderList('reading');
      })
      .catch(function(err){
        _loading = false;
        if(window.console && console.error) console.error('[bank] manifest 加载失败：', err);
        var h = document.getElementById('bankList');
        if(h) h.innerHTML = '<div class="bank-empty"><p>目录加载失败，请刷新重试。</p></div>';
      });
  }

  /* ===== 做题页 ===== */
  /* 每组题上面那行英文指令（按真机考的标准措辞，按题型给） */
  function instrFor(g){
    var qs = g.questions || [], opts = ((qs[0] && qs[0].options) || []);
    var txt = opts.map(function(o){ return String(o.optionContent || ''); }).join(' ').toUpperCase();
    if(g.type === 'fill-in-the-blank'){
      var isTable = /<table/i.test(String(g.contentHtml || ''));
      return isTable
        ? 'Complete the table below.<br>Choose <b>ONE WORD AND/OR A NUMBER</b> from the passage for each answer.'
        : 'Complete the notes below.<br>Choose <b>ONE WORD ONLY</b> from the passage for each answer.';
    }
    if(g.type === 'matching'){
      var roman = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
      return roman
        ? 'The Reading Passage has several sections.<br>Choose the correct heading for each section from the list of headings below.'
        : 'Which section contains the following information?<br>Write the correct letter in each box.';
    }
    if(g.type === 'map')
      return 'The Reading Passage has several paragraphs.<br>Which paragraph contains the following information?<br>Write the correct letter in each box.';
    if(g.type === 'multiple-choice'){
      var want = /THREE/i.test(String((qs[0] && qs[0].question) || '')) ? 'THREE' : 'TWO';
      return 'Choose <b>' + want + '</b> letters.';
    }
    if(/TRUE|FALSE|NOT GIVEN/.test(txt))
      return 'Do the following statements agree with the information given in the passage?<br>Write <b>TRUE</b> if the statement agrees with the information, <b>FALSE</b> if the statement contradicts the information, <b>NOT GIVEN</b> if there is no information on this.';
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
        user: {}, submitted: false, groups: [], total: 0, correct: 0
      };
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

  function groupHtml(g, idx, numOf){
    numOf = numOf || idNum();
    var h = '<div class="ex-group" data-gtype="' + esc(g.type) + '">';
    var ns = qNums(g).map(numOf);
    h += '<p class="ex-grp-h">Questions ' + esc(ns.length ? (ns[0] + '–' + ns[ns.length - 1]) : '') + '</p>';
    h += '<p class="ex-grp-i">' + instrFor(g) + '</p>';
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
      /* 平台把这批「哪段包含以下信息」题标成 map（原始数据 image/imageUrl 全为 null，不是真地图题）
         → 实际是段落信息匹配：每题自带 A~J 字母选项，渲染成一排字母 */
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
    return '<div class="ex-bar">'
      +    '<button class="ex-ico" type="button" data-flag title="Review">▣</button>'
      +    '<div class="ex-sheet" id="exSheet"></div>'
      +    '<div class="ex-actions">'
      +      '<button class="ex-ico" type="button" data-prev title="Previous">‹</button>'
      +      '<button class="ex-ico" type="button" data-next title="Next">›</button>'
      +      '<button class="btn-ghost" type="button" data-exit>Exit</button>'
      +      '<button class="btn-primary" type="button" data-submit>Submit</button>'
      +    '</div></div>';
  }
  function ctxHtml(){
    return '<div class="ex-ctx" id="exCtx">'
      +    '<button type="button" data-hact="hl">Highlight</button>'
      +    '<button type="button" data-hact="note">Note</button>'
      +    '<hr>'
      +    '<button type="button" data-hact="clear">Clear</button>'
      +    '<button type="button" data-hact="clearall">Clear all</button>'
      +  '</div>';
  }

  function renderExam(){
    var host = document.getElementById('examRoot'); if(!host || !EX) return;
    var u = EX.unit, parts = u.parts || [], groups = [];
    parts.forEach(function(p){ (p.groups || []).forEach(function(g){ groups.push(g); }); });
    EX.groups = groups;
    EX.flagged = EX.flagged || {};
    if(!EX.cur) EX.cur = 1;

    var nums = [];
    groups.forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); });
    EX.total = nums.length;
    if(EX.cur == null && nums.length) EX.cur = Number(nums[0]);

    var artHtml = '';
    parts.forEach(function(p){ artHtml += clean(p.article || ''); });

    host.innerHTML = shellHtml(EX.channel === 'reading' ? 'Reading' : 'Listening', u.title,
                        EX.channel === 'reading' ? '01:00:00' : '00:30:00')
      + splitHtml(artHtml, groups.map(function(g, i){ return groupHtml(g, i); }).join(''))
      + barHtml() + ctxHtml();

    Object.keys(EX.user || {}).forEach(function(qn){ applyAnswer(qn, EX.user[qn]); });
    paintSheet();
    renderNotes();
    replayMarks();
    startTimer(EX.channel === 'reading' ? 60 * 60 : 30 * 60);
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
    var el = document.createElement('div');
    el.className = 'fx-score';
    el.innerHTML = '<div class="fx-top"><b>' + res.right + ' / ' + res.total + '</b>'
      + '<span class="fx-band">总分 ' + Number(bandOfReading(raw)).toFixed(1) + '</span>'
      + '<span>Academic Reading · ' + res.total + ' 题换算</span></div>'
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

  /* ===== Highlight / Note（划词 → 右键；按篇存本地，下次打开还在）=====
     ⚠️ 关键：右键按下那一下浏览器会把选区折叠掉 → 若只在 contextmenu 里读选区会拿不到划的词。
     所以 pointerdown(button=2) 时先把选区 cloneRange() 缓存，contextmenu 优先用实时选区、没有就用缓存。 */
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
      markRange(a, b, m.kind === 'hl' ? 'ex-hl' : 'ex-nt', m.id);
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
      : '<p class="ex-notes-empty">Select text in the passage and right-click to add a note.</p>';
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
      var q = selQuote(_hlRange);
      if(q){
        var id = newMarkId('h');
        if(wrapRange(_hlRange, 'ex-hl', id)){
          list.push({ id: id, kind: 'hl', text: q.text, pre: q.pre, post: q.post });
          saveMarks(list);
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
    } else if(act === 'clear' && _hlSpan){
      var idc = _hlSpan.getAttribute('data-id');
      unwrapEl(_hlSpan);
      saveMarks(list.filter(function(m){ return m.id !== idc; }));
      renderNotes();
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
    var c = document.getElementById('exCtx'); if(c) c.classList.remove('on');
    var sp = document.getElementById('exSplit'); if(sp) sp.classList.remove('hasnotes');
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
    var user = collect();
    sheet.innerHTML = allNums().map(function(n){
      var cls = 'ex-sq';
      if(user[n] != null && String(user[n]).length) cls += ' done';
      if(EX.flagged[n]) cls += ' flag';
      if(String(EX.cur) === n) cls += ' cur';
      if(EX.marks && EX.marks[n]) cls += ' ' + EX.marks[n];
      return '<span class="' + cls + '" data-jump="' + esc(n) + '">' + esc(n) + '</span>';
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

  /* ===== 计时（倒计时，格式与写作机考一致：时:分:秒）===== */
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function startTimer(sec){
    stopTimer();
    var left = sec, el = document.getElementById('exTimer');
    function tick(){
      if(el){
        var hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
        el.textContent = pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
        el.classList.toggle('warn', left <= 300);
      }
      if(left <= 0){ stopTimer(); return; }
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

  function submit(){
    if(!EX || EX.submitted) return;
    EX.submitted = true; stopTimer();
    var res = score(); EX.correct = res.right; EX.result = res;

    EX.marks = {};
    res.detail.forEach(function(d){ EX.marks[d.qn] = d.ok ? 'hit' : 'miss'; });

    decoratePassage(EX.curP);
    addScoreCard(res);

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
    if(EX && !EX.submitted) saveDraft();
    EX = null;
    var host = document.getElementById('examRoot'); if(host){ host.hidden = true; host.innerHTML = ''; }
    var root = document.getElementById('bankRoot'); if(root) root.style.display = '';
    _fullSet = null;                                   /* 回到列表 → 下次组一套新的（随机组卷） */
    boot();
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
      /* 一级：四科 */
      if((el = t.closest && t.closest('#mockTabs .pill-tab'))){
        var _mt = el.getAttribute('data-mtab');
        showTab(_mt);
        if(_mt === 'reading') renderList('reading');
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
      if((el = t.closest && t.closest('[data-fullstart]'))){ openFullTest(_fullSet); return; }
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
      /* 点菜单外 → 收起 Highlight 菜单 */
      if(!t.closest || !t.closest('#exCtx')){
        var c2 = document.getElementById('exCtx');
        if(c2 && c2.classList.contains('on')) c2.classList.remove('on');
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
      if(EX && !EX.submitted && t.matches && t.matches('input.ex-blank[data-q]')) paintSheet();
    });

    /* 配对题拖拽：pointerdown/move/up（鼠标 + 触屏同一套） */
    document.addEventListener('pointerdown', function(e){
      if(!EX || EX.submitted) return;
      var t = e.target, el, r;
      if((el = t.closest && t.closest('.ex-x'))){ dgClearEl(el.closest('.ex-drop')); return; }
      if((el = t.closest && t.closest('#examRoot .ex-chip'))){
        if(el.classList.contains('used')) return;
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

    /* Highlight / Note：右键按下时先缓存选区（右键那一下会把选区折叠掉） */
    document.addEventListener('pointerdown', function(e){
      if(e.button !== 2) return;
      var art = artEl(); if(!art) return;
      var s = window.getSelection();
      if(s && !s.isCollapsed && s.anchorNode && art.contains(s.anchorNode)){
        try{ _hlCache = s.getRangeAt(0).cloneRange(); }catch(err){ _hlCache = null; }
      }
    }, true);
    document.addEventListener('contextmenu', function(e){
      var art = artEl(); if(!art || !art.contains(e.target)) return;
      var sel = window.getSelection();
      _hlSpan = e.target.closest ? e.target.closest('.ex-hl, .ex-nt') : null;
      var live = (sel && !sel.isCollapsed && sel.anchorNode && art.contains(sel.anchorNode))
        ? sel.getRangeAt(0).cloneRange() : null;
      var r = live || _hlCache;
      if(!r && !_hlSpan) return;
      e.preventDefault();
      _hlRange = r; _hlCache = null;
      var ctx = document.getElementById('exCtx'); if(!ctx) return;
      ctx.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
      ctx.style.top = Math.min(e.clientY, window.innerHeight - 170) + 'px';
      ctx.classList.add('on');
      ctx.querySelector('[data-hact="hl"]').style.display = r ? '' : 'none';
      ctx.querySelector('[data-hact="note"]').style.display = r ? '' : 'none';
      ctx.querySelector('[data-hact="clear"]').style.display = _hlSpan ? '' : 'none';
    });
    document.addEventListener('scroll', function(){
      var c = document.getElementById('exCtx'); if(c) c.classList.remove('on');
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
