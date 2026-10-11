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
    if(g.type === 'map') return 'Label the map below.';
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
  function pillsHtml(q){
    var h = '<div class="ex-pills" data-q="' + esc(q.qNumber) + '">';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || o.optionContent || '';
      h += '<span class="ex-pill" data-v="' + esc(v) + '">' + esc(o.optionContent || v) + '</span>';
    });
    return h + '</div>';
  }
  /* 单选题：圆点 + 字母加粗（对齐真机考） */
  function radioHtml(q){
    var h = '<div class="ex-opts ex-radio-box" data-q="' + esc(q.qNumber) + '">';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || '';
      h += '<label class="ex-opt" data-v="' + esc(v) + '">'
        + '<input class="ex-radio" type="radio" name="exq_' + esc(q.qNumber) + '" value="' + esc(v) + '">'
        + '<span><b>' + esc(v) + '</b>' + esc(o.optionContent || '') + '</span></label>';
    });
    return h + '</div>';
  }
  /* 多选题：方框 + 字母加粗（指令里已写 Choose TWO / THREE letters） */
  function cboxHtml(q){
    var h = '<div class="ex-cbox ex-opts" data-q="' + esc(q.qNumber) + '">';
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
  function fillHtml(g){
    var html = clean(bodyOf(g.contentHtml));
    var had = 0;
    html = html.replace(/<input([^>]*)>/gi, function(m, attrs){
      var pm = /placeholder\s*=\s*["']?([0-9]+)["']?/i.exec(attrs);
      var n = pm ? pm[1] : '';
      if(n) had++;
      return '<input class="ex-blank" type="text" data-q="' + n + '" placeholder="' + n + '"'
        + ' autocomplete="off" spellcheck="false">';
    });
    return { html: '<div class="ex-html">' + html + '</div>', had: had };
  }

  function groupHtml(g){
    var h = '<div class="ex-group" data-gtype="' + esc(g.type) + '">';
    h += '<p class="ex-grp-h">Questions ' + esc(qRange(g)) + '</p>';
    h += '<p class="ex-grp-i">' + instrFor(g) + '</p>';
    var qs = g.questions || [];

    if(g.type === 'fill-in-the-blank'){
      var f = fillHtml(g);
      h += f.html;
    } else if(g.type === 'matching'){
      var opts = (g.options && g.options.length) ? g.options : ((qs[0] && qs[0].options) || []);
      h += '<div class="ex-hdbox">';
      opts.forEach(function(o){ h += '<div><i>' + esc(o.optionNum || '') + '</i>' + esc(o.optionContent || o.option || '') + '</div>'; });
      h += '</div>';
      qs.forEach(function(q){
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(q.qNumber) + '">' + esc(q.qNumber) + '</span>'
          + esc(plain(q.question)) + '<div style="margin-top:6px">' + selectHtml(q, opts) + '</div></div>';
      });
    } else if(g.type === 'map'){
      h += '<p class="ex-grp-i">This map task is not available yet.</p>';
    } else if(g.type === 'multiple-choice'){
      qs.forEach(function(q){
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(q.qNumber) + '">' + esc(q.qNumber) + '</span>'
          + clean(q.question) + cboxHtml(q) + '</div>';
      });
    } else {
      var tf = isTFGroup(g);
      qs.forEach(function(q){
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(q.qNumber) + '">' + esc(q.qNumber) + '</span>'
          + clean(q.question) + (tf ? pillsHtml(q) : radioHtml(q)) + '</div>';
      });
    }
    return h + '</div>';
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

    var h = '';
    h += '<div class="ex-top">'
      +    '<div class="ex-name">' + (EX.channel === 'reading' ? 'Reading' : 'Listening')
      +      (u.title ? '<small>' + esc(u.title) + '</small>' : '') + '</div>'
      +    '<span class="ex-timer" id="exTimer">' + (EX.channel === 'reading' ? '01:00:00' : '00:30:00') + '</span>'
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
    h += '<div class="ex-split" id="exSplit">'
      +    '<div class="ex-article">' + artHtml + '</div>'
      +    '<div class="ex-qcol" id="exQCol">' + groups.map(groupHtml).join('') + '</div>'
      +  '</div>';
    h += '<div class="ex-bar">'
      +    '<button class="ex-ico" type="button" data-flag title="Review">▣</button>'
      +    '<div class="ex-sheet" id="exSheet"></div>'
      +    '<div class="ex-actions">'
      +      '<button class="ex-ico" type="button" data-prev title="Previous">‹</button>'
      +      '<button class="ex-ico" type="button" data-next title="Next">›</button>'
      +      '<button class="btn-ghost" type="button" data-exit>Exit</button>'
      +      '<button class="btn-primary" type="button" data-submit>Submit</button>'
      +    '</div></div>';
    host.innerHTML = h;

    Object.keys(EX.user || {}).forEach(function(qn){ applyAnswer(qn, EX.user[qn]); });
    paintSheet();
    startTimer(EX.channel === 'reading' ? 60 * 60 : 30 * 60);
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
    if(rb){ rb.querySelectorAll('input').forEach(function(i){ i.checked = (i.value === val); }); }
  }

  function collect(){
    var root = document.getElementById('examRoot'); if(!root) return {};
    var out = {};
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
    root.querySelectorAll('select[data-q]').forEach(function(s){ if(s.value) out[s.getAttribute('data-q')] = s.value; });
    return out;
  }

  function allNums(){
    var nums = [];
    (EX && EX.groups || []).forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); });
    return nums;
  }

  function saveDraft(){
    if(!EX) return;
    try{ localStorage.setItem('hub_bank_draft_' + EX.unit.id, JSON.stringify(collect())); }catch(e){}
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
  }

  function goTo(n){
    if(!EX) return;
    EX.cur = Number(n);
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
  function score(){
    var user = collect(), right = 0, total = 0, detail = [];
    EX.groups.forEach(function(g){
      (g.questions || []).forEach(function(q){
        var qn = String(q.qNumber), key = EX.answers[qn], ua = user[qn];
        var alts = (EX.alts && EX.alts[qn]) ? [].concat(EX.alts[qn]) : [];
        total++;
        var ok;
        if(Array.isArray(ua)){
          var rset = String(key || '').toLowerCase().split(/[,\s\/]+/).filter(Boolean).sort().join(',');
          ok = !!rset && ua.map(function(x){ return String(x).toLowerCase(); }).sort().join(',') === rset;
          ua = ua.join(',');
        } else {
          ok = eqAns(ua, key, alts);
        }
        if(ok) right++;
        detail.push({ qn: qn, user: ua == null ? '' : ua, right: key == null ? '' : key, ok: !!ok, q: q });
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
    var res = score(); EX.correct = res.right;
    var root = document.getElementById('examRoot');

    res.detail.forEach(function(d){
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

    /* 成绩条（英文） */
    var qcol = document.getElementById('exQCol');
    if(qcol){
      var raw = Math.round(res.right / (res.total || 1) * 40);
      var barEl = document.createElement('div');
      barEl.className = 'ex-expl';
      barEl.style.cssText = 'font-size:14px;background:var(--primary-50);border-left-color:var(--primary)';
      barEl.innerHTML = 'Score：<b>' + res.right + ' / ' + res.total + '</b>'
        + (EX.channel === 'reading' ? '（raw ≈ ' + raw + '/40）' : '');
      qcol.insertBefore(barEl, qcol.firstChild);
    }
    try{ localStorage.setItem('hub_bank_last_' + EX.unit.id, JSON.stringify({ correct: res.right, total: res.total, ts: Date.now() })); }catch(e){}

    EX.marks = {};
    res.detail.forEach(function(d){ EX.marks[d.qn] = d.ok ? 'hit' : 'miss'; });
    paintSheet();
    var sb = document.querySelector('#examRoot [data-submit]');
    if(sb){ sb.disabled = true; sb.style.opacity = '.5'; }
  }

  function exitExam(){
    stopTimer();
    if(EX && !EX.submitted) saveDraft();
    EX = null;
    var host = document.getElementById('examRoot'); if(host){ host.hidden = true; host.innerHTML = ''; }
    var root = document.getElementById('bankRoot'); if(root) root.style.display = '';
    boot();
  }

  /* ===== 事件委托 ===== */
  if(!window.__BANK_DELEGATE){
    window.__BANK_DELEGATE = true;

    document.addEventListener('click', function(e){
      var t = e.target, el;
      /* 一级：四科 */
      if((el = t.closest && t.closest('#mockTabs .pill-tab'))){
        showTab(el.getAttribute('data-mtab'));
        if(el.getAttribute('data-mtab') === 'reading') renderList('reading');
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
  }

  /* ===== 启动 ===== */
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('hub:page-shown', function(){ setTimeout(boot, 0); });
})();
