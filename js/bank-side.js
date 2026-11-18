/* BANK-V2（11-16）：机经五格侧栏与手机五入口。
   只服务 bank.html；阅读 / 听力转发 #mockTabs 原按钮，记录 / 错题 / 统计转发 __bankRecords。
   今日任务沿用 DATA.plans 当天 items，勾选写回与计划页一致。 */
(function () {
  'use strict';
  var $ = function (s) { return document.getElementById(s); };
  var SUBS = [
    { id: 'reading', nm: '阅读', ic: 'book' },
    { id: 'listening', nm: '听力', ic: 'headphones' },
    { id: 'records', nm: '记录', ic: 'list' },
    { id: 'wrong', nm: '错题', ic: 'ban' },
    { id: 'stats', nm: '统计', ic: 'chart' }
  ];
  var ICONS = {
    book: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M7 9h2M15 9h2"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="2"/><rect x="17" y="13" width="4" height="7" rx="2"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>'
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayItems() {
    try {
      var day = typeof todayKey === 'function' ? todayKey() : '';
      var plans = (typeof DATA !== 'undefined' && DATA && Array.isArray(DATA.plans)) ? DATA.plans : [];
      var p = null;
      for (var i = 0; i < plans.length; i++) {
        if (plans[i] && plans[i].date === day) { p = plans[i]; break; }
      }
      return (p && Array.isArray(p.items)) ? p.items : [];
    } catch (e) { return []; }
  }
  var MOD_LABEL = { listening: '听力', reading: '阅读', writing: '写作', speaking: '口语', mix: '综合' };
  function minOf(it) {
    if (it && typeof it.min === 'number' && it.min) return Math.round(it.min);
    var m = String((it && it.text) || '').match(/(\d+(?:\.\d+)?)\s*分钟/);
    return m ? Math.round(parseFloat(m[1])) : 0;
  }
  function taskHtml(it) {
    var min = minOf(it);
    var meta = (min ? min + ' 分钟' : '') + (min && it.module ? ' · ' : '') + (it.module ? (MOD_LABEL[it.module] || '') : '');
    return '<button class="hub-task' + (it.done ? ' done' : '') + '" type="button"'
      + ' data-bank-todo="' + esc(it.id) + '" aria-pressed="' + (it.done ? 'true' : 'false') + '">'
      + '<span class="hub-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4 4 8-9"/></svg></span>'
      + '<span class="hub-tx"><b>' + esc(it.text || '') + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</span></button>';
  }
  function renderToday() {
    var box = $('hubTdList');
    if (!box) return;
    var items = todayItems().filter(function (x) { return !!x; });
    var a = items.filter(function (x) { return !x.done; });
    var b = items.filter(function (x) { return x.done; });
    box.innerHTML = a.concat(b).map(taskHtml).join('');
    var cnt = $('hubTdCount');
    if (cnt) { cnt.textContent = b.length + '/' + items.length; cnt.hidden = !items.length; }
    var empty = $('hubTdEmpty');
    if (empty) empty.hidden = items.length > 0;
  }
  function currentPage() {
    var root = $('bankRoot');
    return (root && root.getAttribute('data-bank-page')) || 'reading';
  }
  function renderSubs() {
    var cur = currentPage();
    var box = $('hubSubs');
    if (box) {
      box.innerHTML = SUBS.map(function (s) {
        return '<button class="hub-sub' + (s.id === cur ? ' on' : '') + '" type="button" data-bank-sub="' + s.id + '">'
          + '<span class="hub-sub-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[s.ic] + '</svg></span>'
          + '<span class="hub-sub-nm">' + s.nm + '</span></button>';
      }).join('');
    }
    var mob = $('bk2MobileNav');
    if (mob) {
      mob.innerHTML = SUBS.map(function (s) {
        return '<button type="button" role="tab" aria-selected="' + (s.id === cur ? 'true' : 'false') + '"'
          + ' class="' + (s.id === cur ? 'on' : '') + '" data-bank-sub="' + s.id + '">' + s.nm + '</button>';
      }).join('');
    }
  }
  function applyTab(id) {
    if (window.__bankRecords && typeof window.__bankRecords.applyTab === 'function') {
      window.__bankRecords.applyTab(id);
    } else if (id === 'reading' || id === 'listening') {
      var btn = document.querySelector('#mockTabs [data-mtab="' + id + '"]');
      if (btn) btn.click();
    }
    renderSubs();
  }
  function toggleTodo(id) {
    var arr = todayItems(), it = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === id) { it = arr[i]; break; } }
    if (!it) return;
    it.done = !it.done;
    it.updatedAt = Date.now();
    try { if (typeof hubSave === 'function') hubSave(); } catch (e) {}
    renderToday();
    try { document.dispatchEvent(new CustomEvent('hub:plan-toggled', { detail: { id: id } })); } catch (e) {}
  }
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var sub = t.closest('[data-bank-sub]');
    if (sub) { e.preventDefault(); applyTab(sub.getAttribute('data-bank-sub')); return; }
    var todo = t.closest('.hub-task[data-bank-todo]');
    if (todo) { e.preventDefault(); toggleTodo(todo.getAttribute('data-bank-todo')); }
  }
  function onPage(e) {
    renderSubs();
    if (e && e.detail && e.detail.page) {
      try { $('bk2MobileNav') && $('bk2MobileNav').setAttribute('data-page', e.detail.page); } catch (err) {}
    }
  }
  function bind() {
    if (window.__bankSideClick) {
      try { document.removeEventListener('click', window.__bankSideClick); } catch (e) {}
    }
    window.__bankSideClick = onClick;
    document.addEventListener('click', onClick);
    if (window.__bankSideMerge) {
      try { document.removeEventListener('hub:data-merged', window.__bankSideMerge); } catch (e) {}
    }
    window.__bankSideMerge = renderToday;
    document.addEventListener('hub:data-merged', renderToday);
    if (window.__bankSidePage) {
      try { document.removeEventListener('bank:page', window.__bankSidePage); } catch (e) {}
    }
    window.__bankSidePage = onPage;
    document.addEventListener('bank:page', onPage);
    var root = $('bankRoot');
    if (root) {
      if (window.__bankSideObs) { try { window.__bankSideObs.disconnect(); } catch (e) {} }
      window.__bankSideObs = new MutationObserver(renderSubs);
      try { window.__bankSideObs.observe(root, { attributes: true, attributeFilter: ['data-bank-page', 'data-mock-tab'] }); } catch (e) {}
    }
  }
  renderSubs();
  renderToday();
  bind();
})();
