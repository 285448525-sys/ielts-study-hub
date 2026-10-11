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
  var TYPE_HINT = {
    'fill-in-the-blank': '按题号填空：在对应的空格里填词。',
    'single-choice': '选择一个选项。',
    'multiple-choice': '按题目要求选择（可能不止一个）。',
    'matching': '为每一项选择对应的标题 / 选项。',
    'map': '在图上选出对应的位置。'
  };

  function openExam(unitId, channel){
    var root = document.getElementById('bankRoot');
    if(root) root.style.display = 'none';
    var host = document.getElementById('examRoot');
    if(host){ host.hidden = false; host.innerHTML = '<div class="bank-loading" style="padding:60px">正在加载题目…</div>'; }

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
      if(h) h.innerHTML = '<div class="bank-empty" style="padding:60px"><p>题目加载失败，请返回重试。</p>'
        + '<p><button class="btn-ghost" type="button" data-exit>返回</button></p></div>';
      if(root) root.style.display = '';
    });
  }

  function qNums(g){
    var ns = [];
    (g.questions || []).forEach(function(q){ if(q.qNumber != null) ns.push(Number(q.qNumber)); });
    return ns.filter(function(n){ return !isNaN(n); }).sort(function(a, b){ return a - b; });
  }
  function qRange(g){ var ns = qNums(g); return ns.length ? (ns[0] + '–' + ns[ns.length - 1]) : ''; }

  function pillsHtml(q){
    var h = '<div class="ex-pills" data-q="' + esc(q.qNumber) + '">';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || o.optionContent || '';
      h += '<span class="ex-pill" data-v="' + esc(v) + '">' + esc(o.optionContent || v) + '</span>';
    });
    return h + '</div>';
  }
  function cboxHtml(q){
    var h = '<div class="ex-cbox" data-q="' + esc(q.qNumber) + '">';
    (q.options || []).forEach(function(o){
      var v = o.optionNum || '';
      h += '<label class="row"><input type="checkbox" value="' + esc(v) + '">'
        + '<span><b>' + esc(v) + '.</b> ' + esc(o.optionContent || '') + '</span></label>';
    });
    return h + '</div>';
  }
  function selectHtml(q, opts){
    var h = '<select class="ex-sel" data-q="' + esc(q.qNumber) + '"><option value="">请选择</option>';
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
    h += '<p class="ex-grp-i">' + esc(TYPE_HINT[g.type] || '作答后交卷判分。') + '</p>';
    var qs = g.questions || [];

    if(g.type === 'fill-in-the-blank'){
      var f = fillHtml(g);
      h += f.html;
      if(!f.had) h += '<p class="ex-grp-i">（这组填空题缺少可填的空位）</p>';
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
      h += '<p class="ex-grp-i">地图题需要配图（素材待补），暂不可作答。</p>';
    } else if(g.type === 'multiple-choice'){
      qs.forEach(function(q){
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(q.qNumber) + '">' + esc(q.qNumber) + '</span>'
          + clean(q.question) + cboxHtml(q) + '</div>';
      });
    } else {
      qs.forEach(function(q){
        h += '<div class="ex-q"><span class="ex-qn" data-qn="' + esc(q.qNumber) + '">' + esc(q.qNumber) + '</span>'
          + clean(q.question) + pillsHtml(q) + '</div>';
      });
    }
    return h + '</div>';
  }

  function renderExam(){
    var host = document.getElementById('examRoot'); if(!host || !EX) return;
    var u = EX.unit, parts = u.parts || [], groups = [];
    parts.forEach(function(p){ (p.groups || []).forEach(function(g){ groups.push(g); }); });
    EX.groups = groups;

    var nums = [];
    groups.forEach(function(g){ (g.questions || []).forEach(function(q){ if(q.qNumber != null) nums.push(String(q.qNumber)); }); });
    EX.total = nums.length;

    var artHtml = '';
    parts.forEach(function(p){ artHtml += clean(p.article || ''); });

    var h = '';
    h += '<div class="ex-top">'
      +    '<div class="ex-name">' + esc(u.title || '') + (u.titleZh ? '<small>' + esc(u.titleZh) + '</small>' : '') + '</div>'
      +    '<div class="ex-mid"><span id="exProg">已答 0/' + EX.total + '</span>'
      +      (EX.channel === 'reading' ? '<span class="ex-timer" id="exTimer">60:00</span>' : '') + '</div>'
      +    '<div class="ex-actions">'
      +      '<button class="btn-ghost" type="button" data-exit>退出</button>'
      +      '<button class="btn-primary" type="button" data-submit>交卷</button>'
      +    '</div></div>';
    h += '<div class="ex-split">'
      +    '<div class="ex-article">' + artHtml + '</div>'
      +    '<div class="ex-qcol">' + groups.map(groupHtml).join('') + '</div>'
      +  '</div>';
    h += '<div class="ex-bar"><div class="ex-sheet" id="exSheet"></div>'
      +    '<div class="ex-legend" id="exLegend">灰=未答 ｜ 绿=已答</div></div>';
    host.innerHTML = h;

    Object.keys(EX.user || {}).forEach(function(qn){ applyAnswer(qn, EX.user[qn]); });
    paintSheet();
    if(EX.channel === 'reading') startTimer(60 * 60);
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
    if(pills){ pills.querySelectorAll('.ex-pill').forEach(function(p){ p.classList.toggle('on', p.getAttribute('data-v') === val); }); }
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
    var user = collect(), nums = allNums();
    var sheet = document.getElementById('exSheet');
    if(sheet){
      sheet.innerHTML = nums.map(function(n){
        var done = user[n] != null && String(user[n]).length;
        return '<span class="ex-sq' + (done ? ' done' : '') + '" data-jump="' + esc(n) + '">' + esc(n) + '</span>';
      }).join('');
    }
    var prog = document.getElementById('exProg');
    if(prog){
      var c = 0; nums.forEach(function(n){ if(user[n] != null && String(user[n]).length) c++; });
      prog.textContent = '已答 ' + c + '/' + EX.total;
    }
  }

  /* ===== 计时（阅读 60 分钟）===== */
  function startTimer(sec){
    stopTimer();
    var left = sec, el = document.getElementById('exTimer');
    function tick(){
      if(el){
        var m = Math.floor(left / 60), s = left % 60;
        el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
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
      var bl = root.querySelector('input.ex-blank[data-q="' + d.qn + '"]'); if(bl) bl.disabled = true;
      if(bl && !d.ok){ bl.style.borderBottomColor = '#e6b3ae'; bl.style.color = '#b3261e'; }

      var anchor = qnEl || (bl ? bl.closest('.ex-group') : null);
      var groupEl = anchor ? anchor.closest('.ex-group') : null;
      if(groupEl){
        var box = document.createElement('div'); box.className = 'ex-expl';
        box.innerHTML = '<b>第 ' + esc(d.qn) + ' 题</b>　正确答案：<b>' + esc(d.right || '—') + '</b>'
          + '　你的答案：' + (d.user ? esc(d.user) : '未作答') + buildExpl(d.q);
        groupEl.appendChild(box);
      }
    });

    var mid = document.querySelector('#examRoot .ex-mid');
    if(mid){
      var raw = Math.round(res.right / (res.total || 1) * 40);
      mid.innerHTML = '<b style="font-size:17px;font-weight:800">' + res.right + ' / ' + res.total + '</b>'
        + '<span style="font-size:13px;color:var(--muted)">答对' + (EX.channel === 'reading' ? '（≈ ' + raw + '/40）' : '') + '</span>';
    }
    try{ localStorage.setItem('hub_bank_last_' + EX.unit.id, JSON.stringify({ correct: res.right, total: res.total, ts: Date.now() })); }catch(e){}

    var sheet = document.getElementById('exSheet');
    if(sheet){
      sheet.innerHTML = res.detail.map(function(d){
        return '<span class="ex-sq ' + (d.ok ? 'hit' : 'miss') + '">' + esc(d.qn) + '</span>';
      }).join('');
    }
    var legend = document.getElementById('exLegend');
    if(legend) legend.textContent = '绿=答对 ｜ 红=答错 ｜ 每题解析已展开，往下滚查看';
    var sb = document.querySelector('#examRoot [data-submit]');
    if(sb){ sb.textContent = '已交卷'; sb.disabled = true; sb.style.opacity = '.6'; }
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
      if((el = t.closest && t.closest('.ex-sq[data-jump]'))){
        var qn = el.getAttribute('data-jump');
        var target = document.querySelector('#examRoot .ex-qn[data-qn="' + qn + '"], #examRoot input.ex-blank[data-q="' + qn + '"]');
        if(target) target.scrollIntoView({ block: 'center' });
        return;
      }
    }, true);

    document.addEventListener('change', function(e){
      var t = e.target;
      if(!EX || EX.submitted) return;
      if(t.matches && (t.matches('input.ex-blank[data-q]') || t.matches('.ex-cbox input') || t.matches('select[data-q]'))){
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
