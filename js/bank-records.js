/* BANK-V2（11-16）：机经「记录 / 错题 / 统计」三页。
   只读 DATA.mockRecords 与 bank/manifest.json，不碰判分、不写学习记录。
   错题页本轮只出「即将上线」罩衫，等后续单独做。 */
(function () {
  if (window.__bankRecords) {
    try { window.__bankRecords.mount(); } catch (e) {}
    return;
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var Q1 = String.fromCharCode(39), Q2 = String.fromCharCode(34);
  function esc(s) {
    return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;')
      .split('>').join('&gt;').split(Q2).join('&quot;').split(Q1).join('&#39;');
  }
  function pad(n) { n = Number(n) || 0; return n < 10 ? ('0' + n) : String(n); }
  function cutoff(range) {
    if (range !== 'recent') return '';
    var d = new Date(); d.setDate(d.getDate() - 9);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDate(s) {
    var p = String(s || '').split('-');
    return p.length >= 3 ? (Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : (String(s || '') || '—');
  }
  function fmtUsed(sec) {
    var u = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(u / 60) + ':' + pad(u % 60);
  }
  function chName(t) { return t === 'listening' ? '听力' : '阅读'; }
  var QT = { fill: '填空题', single: '单选题', multi: '多选题', match: '匹配题', head: 'Heading 题', para: '段落匹配题', map: '地图题', other: '其他题型' };
  function qtName(c) { return QT[c] || c || '其他'; }
  function pct(a) { return a.t ? Math.round(a.c / a.t * 100) : 0; }
  function byPct(a, b) { return (a.pct - b.pct) || (b.t - a.t) || (a.name < b.name ? -1 : 1); }

  function recs(range) {
    var out = [], C = cutoff(range);
    try {
      var A = (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.mockRecords)) ? DATA.mockRecords : [];
      for (var i = 0; i < A.length; i++) {
        var r = A[i];
        if (!r || r.src !== 'bank') continue;
        if (!Array.isArray(r.detail) || !r.detail.length) continue;
        if (C && String(r.date || '') < C) continue;
        out.push(r);
      }
    } catch (e) {}
    return out;
  }
  function sstat(r) {
    var ok = 0, tot = 0, d = r.detail || [];
    for (var i = 0; i < d.length; i++) { tot++; if (d[i] && d[i].ok) ok++; }
    return { ok: ok, tot: tot };
  }

  var _mfP = null, _mf = {};
  function partNum(v) {
    var s = String(v == null ? '' : v), n = '';
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c >= '0' && c <= '9') n += c; }
    return n ? ('Part ' + Number(n)) : (s || '');
  }
  function manifest() {
    if (_mfP) return _mfP;
    _mfP = fetch('bank/manifest.json').then(function (x) { return x.json(); }).then(function (m) {
      var map = {}, al = (m && m.albums) || [];
      for (var i = 0; i < al.length; i++) {
        var ch = al[i].channel, us = al[i].units || [];
        for (var j = 0; j < us.length; j++) {
          var u = us[j];
          if (u && u.id != null) {
            map[String(u.id)] = {
              part: partNum(u.partNum), ch: ch,
              title: String(u.titleZh || u.title || ''),
              titleEn: String(u.title || ''),
              titleZh: String(u.titleZh || '')
            };
          }
        }
      }
      _mf = map; return map;
    }).catch(function () { _mf = {}; return _mf; });
    return _mfP;
  }
  function qtypeAgg(R) {
    var g = {};
    R.forEach(function (r) {
      (r.detail || []).forEach(function (d) {
        var c = (d && d.t) ? String(d.t) : '';
        if (!c) return;
        var a = g[c] || (g[c] = { c: 0, t: 0, name: qtName(c) });
        a.t++; if (d.ok) a.c++;
      });
    });
    return Object.keys(g).map(function (k) { var a = g[k]; return { key: k, name: a.name, c: a.c, t: a.t, pct: pct(a) }; }).sort(byPct);
  }
  function partAgg(R) {
    var g = {};
    R.forEach(function (r) {
      var ch = chName(r.type);
      if (r.granularity === 'whole') {
        var ps = r.parts || [], ids = r.ids || [];
        for (var i = 0; i < ps.length; i++) {
          var e = _mf[String(ids[i])];
          if (!e || !e.part) continue;
          var k = ch + ' ' + e.part;
          var a = g[k] || (g[k] = { c: 0, t: 0 });
          a.c += Number(ps[i] && ps[i].correct) || 0;
          a.t += Number(ps[i] && ps[i].total) || 0;
        }
      } else {
        var e2 = _mf[String(r.unitId)];
        if (e2 && e2.part) {
          var k2 = ch + ' ' + e2.part;
          var a2 = g[k2] || (g[k2] = { c: 0, t: 0 });
          var st = sstat(r);
          a2.c += st.ok; a2.t += st.tot;
        }
      }
    });
    return Object.keys(g).map(function (k) { var a = g[k]; return { key: k, name: k, c: a.c, t: a.t, pct: pct(a) }; }).sort(byPct);
  }
  function uidForDetail(r, k) {
    if (r.granularity !== 'whole') return r.unitId != null ? String(r.unitId) : '';
    var ps = r.parts || [], ids = r.ids || [], acc = 0;
    for (var i = 0; i < ps.length; i++) {
      var t = Number(ps[i] && ps[i].total) || 0;
      if (k < acc + t) return ids[i] != null ? String(ids[i]) : '';
      acc += t;
    }
    return ids.length ? String(ids[ids.length - 1]) : '';
  }
  function wrongGroups(R) {
    var g = {};
    R.forEach(function (r) {
      var ch = chName(r.type), d = r.detail || [], date = String(r.date || '');
      for (var k = 0; k < d.length; k++) {
        var it = d[k];
        if (!it || it.ok) continue;
        var uid = uidForDetail(r, k) || ('r' + String(r.id || ''));
        var qn = String(it.qn != null ? it.qn : (k + 1));
        var key = ch + '|' + uid + '|' + qn;
        var w = g[key] || (g[key] = { key: key, ch: ch, uid: uid, qn: qn, times: 0, lastDate: '', lastUser: '', lastRight: '', t: (it.t ? String(it.t) : '') });
        w.times++;
        if (!w.lastDate || date >= w.lastDate) {
          w.lastDate = date;
          w.lastUser = String(it.user == null ? '' : it.user);
          w.lastRight = String(it.right == null ? '' : it.right);
          if (it.t) w.t = String(it.t);
        }
      }
    });
    var arr = Object.keys(g).map(function (k) { return g[k]; });
    arr.sort(function (a, b) { return b.times - a.times || (b.lastDate > a.lastDate ? 1 : -1); });
    return arr;
  }

  var S = { rtype: 'all', rkind: 'all', rrange: 'all', sr: 'all', jump: null, open: null, extra: false };
  function recHasPart(r, label) {
    var ch = chName(r.type);
    if (r.granularity === 'whole') {
      var ids = r.ids || [];
      for (var i = 0; i < ids.length; i++) {
        var e = _mf[String(ids[i])];
        if (e && e.part && (ch + ' ' + e.part) === label) return true;
      }
    } else {
      var e2 = _mf[String(r.unitId)];
      if (e2 && e2.part && (ch + ' ' + e2.part) === label) return true;
    }
    return false;
  }
  function recFiltered() {
    var R = recs(S.rrange);
    return R.filter(function (r) {
      if (S.rtype !== 'all' && r.type !== S.rtype) return false;
      if (S.rkind === 'whole' && r.granularity !== 'whole') return false;
      if (S.rkind === 'part' && r.granularity !== 'part') return false;
      if (S.jump) {
        if (S.jump.kind === 'type') {
          var has = false;
          (r.detail || []).forEach(function (d) { if (d && String(d.t || '') === S.jump.val) has = true; });
          if (!has) return false;
        } else if (S.jump.kind === 'part') {
          if (!recHasPart(r, S.jump.val)) return false;
        }
      }
      return true;
    });
  }

  function seg(group, val, label) {
    return '<button type="button" class="' + (S[group] === val ? 'on' : '') + '" data-bk2' + group + '="' + esc(val) + '">' + esc(label) + '</button>';
  }
  function chip(group, val, label) {
    return '<button type="button" class="bk2-chip' + (S[group] === val ? ' on' : '') + '" data-bk2' + group + '="' + esc(val) + '">' + esc(label) + '</button>';
  }
  function detailHtml(r) {
    var d = r.detail || [];
    var cells = d.map(function (it) {
      var hit = !!(it && it.ok);
      var u = String(it && it.user != null ? it.user : '');
      var right = String(it && it.right != null ? it.right : '');
      var title = '你的答案：' + (u || '—') + ' · 正确答案：' + (right || '—') + ' · ' + qtName(it && it.t ? String(it.t) : '');
      return '<div class="bk2-qcell ' + (hit ? 'hit' : 'miss') + '" title="' + esc(title) + '"><b>' + esc(String(it && it.qn != null ? it.qn : '')) + '</b><span>' + (hit ? '✓' : '✕') + '</span></div>';
    }).join('');
    return '<div class="bk2-qgrid">' + cells + '</div><div class="bk2-qlegend"><span><i class="ok"></i>答对</span><span><i class="bad"></i>答错</span></div>';
  }
  function emptyState(kind) {
    var art = {
      records: '<svg viewBox="0 0 48 40" aria-hidden="true"><rect x="7" y="9" width="34" height="25" rx="5"/><path d="M14 6v6M34 6v6M7 16h34"/><path d="M14 23h7M14 27h13M28 23h6"/><circle cx="36" cy="28" r="5"/><path d="m34 28 1.5 1.5L38 26.5"/></svg>',
      stats: '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M9 33V23M19 33V14M29 33V19M39 33V8"/><path d="M6 33h36"/><circle cx="35" cy="11" r="6"/><path d="m35 8 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>'
    };
    var copy = {
      records: ['还没有练习记录', '完成一套阅读或听力后，成绩、用时和逐题作答会自动留在这里。', '去练一套'],
      stats: ['练一篇，再来看统计', '题型和 Part 的正确率，会按你的真实作答自动汇总。', '去练一篇']
    }[kind];
    return '<div class="bk2-empty ' + kind + '"><div class="bk2-empty-visual">' + art[kind] + '</div><b>' + copy[0] + '</b><p>' + copy[1] + '</p>'
      + '<button type="button" class="bk2-empty-act" data-bk2-go="reading">' + copy[2]
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></div>';
  }

  function renderRec() {
    var box = $('#bk2Rec');
    if (!box) return;
    var all = recs('all');
    if (!all.length) {
      box.innerHTML = '<div class="bk2-page">' + emptyState('records') + '</div>';
      return;
    }
    var R = recFiltered();
    var qs = 0, ok = 0, last = '';
    all.forEach(function (r) {
      var st = sstat(r); qs += st.tot; ok += st.ok;
      if (String(r.date || '') > last) last = String(r.date || '');
    });
    var pv = qs ? Math.round(ok / qs * 100) + '<small>%</small>' : '—';
    var top = '<div class="bk2-top"><div class="bk2-seg">'
      + seg('rtype', 'all', '全部') + seg('rtype', 'reading', '阅读') + seg('rtype', 'listening', '听力')
      + '</div><span class="bk2-spacer"></span><button type="button" class="bk2-btn-sm" data-bk2more>更多筛选</button></div>';
    var jump = S.jump ? '<span class="bk2-jump">只看 ' + esc(S.jump.name) + ' <button type="button" data-bk2clearjump aria-label="清除筛选">×</button></span>' : '';
    var extra = '<div class="bk2-extra"' + (S.extra ? '' : ' hidden') + '>'
      + '<div><span class="lab">范围</span>' + chip('rkind', 'all', '全部') + chip('rkind', 'whole', '整卷') + chip('rkind', 'part', '单篇') + '</div>'
      + '<div><span class="lab">时间</span>' + chip('rrange', 'all', '全部时间') + chip('rrange', 'recent', '近十天') + '</div>'
      + jump + '</div>';
    var summary = '<div class="bk2-summary">'
      + '<div class="bk2-sum lead"><div class="k">总正确率</div><div class="v">' + pv + '</div></div>'
      + '<div class="bk2-sum"><div class="k">练习场次</div><div class="v">' + all.length + '</div></div>'
      + '<div class="bk2-sum"><div class="k">累计做题</div><div class="v">' + qs + '<small>题</small></div></div>'
      + '<div class="bk2-sum"><div class="k">最近一次</div><div class="v date">' + (last ? esc(fmtDate(last)) : '—') + '</div></div>'
      + '</div>';
    var rows = R.map(function (r, i) {
      var st = sstat(r), whole = r.granularity === 'whole';
      var sub = whole
        ? ('完整模考 · ' + ((r.parts || []).length || (r.ids || []).length) + ' 篇')
        : String((r.parts && r.parts[0] && r.parts[0].label) || (_mf[String(r.unitId)] && _mf[String(r.unitId)].title) || '单篇');
      var open = S.open === i;
      return '<div class="bk2-sess"><button type="button" class="bk2-srow" data-bk2sess="' + i + '" aria-expanded="' + (open ? 'true' : 'false') + '">'
        + '<span class="bk2-sdate">' + esc(fmtDate(r.date)) + '</span>'
        + '<span class="bk2-smain"><b>' + chName(r.type) + ' · ' + (whole ? '整卷' : '单篇') + '</b><small>' + esc(sub) + '</small></span>'
        + '<span class="bk2-sscore">' + st.ok + '/' + st.tot + '</span>'
        + '<span class="bk2-stime">' + fmtUsed(r.usedSec) + '</span>'
        + '<span class="bk2-schev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span></button>'
        + (open ? '<div class="bk2-sdetail">' + detailHtml(r) + '</div>' : '')
        + '</div>';
    }).join('');
    var list = '<div class="bk2-sessions">' + (rows || '<div class="bk2-list-empty">当前筛选没有记录</div>') + '</div>';
    box.innerHTML = '<div class="bk2-page">' + top + extra + summary + list + '</div>';
  }

  function bars(list, kind) {
    if (!list.length) return '<div class="bk2-list-empty">还没有可统计的明细</div>';
    return list.map(function (b, i) {
      var weak = kind === 'type' && i === 0 && list.length > 1;
      var attr = kind === 'type'
        ? 'data-bkjump="type" data-bkval="' + esc(b.key) + '" data-bkname="' + esc(b.name) + '"'
        : 'data-bkpartjump="' + esc(b.key) + '"';
      return '<button type="button" class="bk2-bar' + (weak ? ' weak' : '') + '" ' + attr + '>'
        + '<span class="bk2-bar-label">' + esc(b.name) + (weak ? ' <em>最弱</em>' : '') + '</span>'
        + '<span class="bk2-bar-track"><i style="width:' + b.pct + '%"></i></span>'
        + '<span class="bk2-bar-val"><b>' + b.pct + '%</b><small>' + b.c + ' / ' + b.t + ' 题</small></span></button>';
    }).join('');
  }
  function renderStatsInner() {
    var box = $('#bk2Stats');
    if (!box) return;
    var R = recs(S.sr);
    if (!R.length) {
      box.innerHTML = '<div class="bk2-page">' + emptyState('stats') + '</div>';
      return;
    }
    var types = qtypeAgg(R), parts = partAgg(R);
    var top = '<div class="bk2-top"><div class="bk2-seg">'
      + seg('sr', 'all', '全部时间') + seg('sr', 'recent', '近十天')
      + '</div><span class="bk2-spacer"></span><span class="bk2-hint">只统计机经逐题明细</span></div>';
    var w = types[0] || parts[0] || null;
    var callout = '';
    if (w) {
      var isType = types.length > 0;
      var attr = isType
        ? 'data-bkjump="type" data-bkval="' + esc(w.key) + '" data-bkname="' + esc(w.name) + '"'
        : 'data-bkpartjump="' + esc(w.key) + '"';
      callout = '<div class="bk2-callout"><span class="cir"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg></span>'
        + '<div><b>当前最弱：' + esc(w.name) + ' ' + w.pct + '%</b><span>' + w.c + ' / ' + w.t + ' 题，点下面的条可以回到对应记录。</span></div>'
        + '<button type="button" class="bk2-btn-sm" ' + attr + '>看相关记录</button></div>';
    }
    var grid = '<div class="bk2-stat-grid">'
      + '<section class="bk2-panel"><div class="bk2-panel-head"><h2>按题型</h2><span>点一条看对应记录</span></div>' + bars(types, 'type') + '</section>'
      + '<section class="bk2-panel"><div class="bk2-panel-head"><h2>按 Part</h2><span>阅读 P1–P3 · 听力 P1–P4</span></div>' + bars(parts, 'part') + '</section>'
      + '</div>';
    box.innerHTML = '<div class="bk2-page">' + top + callout + grid + '</div>';
  }
  function renderStats() {
    manifest().then(function () { renderStatsInner(); });
  }

  function renderWrong() {
    var box = $('#bk2Wrong');
    if (!box) return;
    box.innerHTML = '<div class="bk2-page"><div class="bk2-soon"><div class="bk2-soon-icon">'
      + '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="25" r="14"/><path d="M24 17v8l5 3"/><path d="M36 10l1.2 2.8L40 14l-2.8 1.2L36 18l-1.2-2.8L32 14l2.8-1.2z"/></svg>'
      + '</div><b>即将上线</b></div></div>';
  }

  function currentPage() {
    var root = $('#bankRoot');
    return (root && root.getAttribute('data-bank-page')) || 'reading';
  }
  function sync(page) {
    var isPanel = page === 'records' || page === 'wrong' || page === 'stats';
    var root = $('#bankRoot'), panels = $('#bk2Panels');
    if (root) {
      root.hidden = isPanel;
      root.setAttribute('data-bank-page', page);
    }
    if (panels) panels.hidden = !isPanel;
    $$('#bk2Panels [data-bkpanel]').forEach(function (el) {
      el.hidden = el.getAttribute('data-bkpanel') !== page;
    });
  }
  function applyTab(name) {
    if (!name) name = 'reading';
    if (name === 'reading' || name === 'listening') {
      var btn = null;
      $$('#mockTabs .pill-tab').forEach(function (b) {
        if (b.getAttribute('data-mtab') === name) btn = b;
      });
      if (btn) btn.click();
      sync(name);
    } else {
      sync(name);
      if (name === 'records') renderRec();
      else if (name === 'wrong') renderWrong();
      else if (name === 'stats') renderStats();
    }
    try { document.dispatchEvent(new CustomEvent('bank:page', { detail: { page: name } })); } catch (e) {}
    try {
      var main = $('.hub-main');
      if (main) main.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch (e2) {}
  }

  function bindHelp() {
    var btns = $$('[data-bk2-help], #bk2HelpBtn'), dlg = $('#bk2HelpDialog'), close = $('#bk2HelpClose');
    btns.forEach(function (btn) {
      if (btn.__bk2Bound) return;
      btn.__bk2Bound = true;
      btn.addEventListener('click', function () {
        if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
        else if (dlg) dlg.setAttribute('open', '');
      });
    });
    if (close && !close.__bk2Bound) {
      close.__bk2Bound = true;
      close.addEventListener('click', function () { if (dlg && typeof dlg.close === 'function') dlg.close(); else if (dlg) dlg.removeAttribute('open'); });
    }
    if (dlg && !dlg.__bk2Bound) {
      dlg.__bk2Bound = true;
      dlg.addEventListener('click', function (e) { if (e.target === dlg && typeof dlg.close === 'function') dlg.close(); });
    }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el;
    if ((el = t.closest('[data-bk2rtype]'))) { S.rtype = el.getAttribute('data-bk2rtype'); S.open = null; renderRec(); return; }
    if ((el = t.closest('[data-bk2rkind]'))) { S.rkind = el.getAttribute('data-bk2rkind'); S.open = null; renderRec(); return; }
    if ((el = t.closest('[data-bk2rrange]'))) { S.rrange = el.getAttribute('data-bk2rrange'); S.open = null; renderRec(); return; }
    if (t.closest('[data-bk2more]')) { S.extra = !S.extra; renderRec(); return; }
    if ((el = t.closest('[data-bk2sess]'))) {
      var i = Number(el.getAttribute('data-bk2sess'));
      S.open = (S.open === i ? null : i);
      renderRec(); return;
    }
    if (t.closest('[data-bk2clearjump]')) { S.jump = null; S.open = null; renderRec(); return; }
    if ((el = t.closest('[data-bk2sr]'))) { S.sr = el.getAttribute('data-bk2sr'); renderStats(); return; }
    if ((el = t.closest('[data-bkjump]'))) {
      S.jump = { kind: el.getAttribute('data-bkjump'), val: el.getAttribute('data-bkval'), name: el.getAttribute('data-bkname') };
      S.rtype = 'all'; S.rkind = 'all'; S.rrange = 'all'; S.open = null; S.extra = true;
      applyTab('records'); return;
    }
    if ((el = t.closest('[data-bkpartjump]'))) {
      var label = el.getAttribute('data-bkpartjump');
      S.jump = { kind: 'part', val: label, name: label };
      S.rtype = 'all'; S.rkind = 'all'; S.rrange = 'all'; S.open = null; S.extra = true;
      applyTab('records'); return;
    }
    if ((el = t.closest('[data-bk2-go]'))) { applyTab(el.getAttribute('data-bk2-go')); return; }
  }

  function renderAll() { renderRec(); renderWrong(); renderStats(); }
  function bind() {
    if (window.__bk2Click) {
      try { document.removeEventListener('click', window.__bk2Click); } catch (e) {}
    }
    window.__bk2Click = onClick;
    document.addEventListener('click', onClick);
    if (window.__bk2Merged) {
      try { document.removeEventListener('hub:data-merged', window.__bk2Merged); } catch (e) {}
    }
    window.__bk2Merged = renderAll;
    document.addEventListener('hub:data-merged', renderAll);
    bindHelp();
  }
  function mount() {
    var main = $('.hub-main');
    if (!main) return;
    if (!$('#bk2Panels')) {
      main.insertAdjacentHTML('beforeend', '<div id="bk2Panels" hidden>'
        + '<section class="bk2-pane" data-bkpanel="records" id="bk2Rec"></section>'
        + '<section class="bk2-pane" data-bkpanel="wrong" id="bk2Wrong"></section>'
        + '<section class="bk2-pane" data-bkpanel="stats" id="bk2Stats"></section></div>');
    }
    bind();
    renderAll();
    sync(currentPage());
  }

  var API = {
    mount: mount,
    applyTab: applyTab,
    sync: sync,
    renderAll: renderAll,
    recs: recs,
    qtypeAgg: qtypeAgg,
    partAgg: partAgg,
    wrongGroups: wrongGroups,
    manifest: manifest,
    state: function () { return S; },
    setData: function (a) {
      try {
        DATA.mockRecords = a;
        S.open = null; S.jump = null;
        renderAll();
      } catch (e) {}
    }
  };
  window.__bankRecords = API;
  mount();
})();
