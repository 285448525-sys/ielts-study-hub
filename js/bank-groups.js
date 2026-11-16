/* M-2（10-24）：搜索 + 没做过/做过分组 + 展开更多。
   2026-11-16：仅增强目录展示。原 listHtml 行、hub_bank_last_*、分页键与点击委托不变；
   来源取 bank/manifest.json，题型按需读当前已渲染的真题 JSON，失败时安静留空。 */
(function () {
  'use strict';
  var PAGE = 20;
  var shown = {};
  var groups = {};
  var renderFns = {};
  var channels = {};
  var allUnits = {};
  var sources = { reading: '', listening: '' };
  var sourceNames = { reading: [], listening: [] };
  var manifestP = null;
  var meta = {};
  var typeCache = {};
  var queue = [], active = 0;
  var MAX_Q = 4;
  var QT = { fill: '填空题', single: '单选题', multi: '多选题', match: '匹配题', head: 'Heading 题', para: '段落匹配题', map: '地图题' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lastRec(id) {
    try {
      var raw = localStorage.getItem('hub_bank_last_' + id);
      if (!raw) return null;
      var r = JSON.parse(raw);
      return (r && typeof r === 'object') ? r : null;
    } catch (e) { return null; }
  }
  function split(units) {
    var todo = [], done = [];
    (units || []).forEach(function (u) {
      if (lastRec(u.id)) done.push(u); else todo.push(u);
    });
    return { todo: todo, done: done };
  }
  function rowsHtml(units, channel) {
    var fn = renderFns[channels[channel]] || renderFns.bankList;
    var inner = fn ? fn(units, channel) : '';
    var m = /<ul[^>]*>([\s\S]*)<\/ul>/.exec(inner);
    return m ? m[1] : '';
  }
  function groupsHtml(listId, g, channel) {
    function bodyHtml(key, emptyTxt) {
      var n = shown[listId + '|' + key] || 0;
      var items = (g[key] || []).slice(0, n);
      var rest = Math.max(0, (g[key] || []).length - n);
      if (!items.length) return '<li class="bk-grp-empty">' + esc(emptyTxt) + '</li>';
      var h = rowsHtml(items, channel);
      if (rest > 0) h += '<li class="bk-grp-more"><button type="button" class="bk-more" data-more="'
        + esc(listId) + '|' + key + '">展开更多（还有 ' + rest + ' 篇）</button></li>';
      return h;
    }
    return '<div class="bk-groups">'
      + '<div class="bk-grp" data-grp="todo"><div class="bk-grp-h"><b>还没练过</b><span class="bk-grp-n">' + g.todo.length + ' 篇</span></div>'
      + '<ul class="bank-items">' + bodyHtml('todo', '这一组都练过了，做过记录收在下方。') + '</ul></div>'
      + '<div class="bk-grp" data-grp="done"><div class="bk-grp-h"><b>最近练过</b><span class="bk-grp-n">' + g.done.length + ' 篇</span></div>'
      + '<ul class="bank-items">' + bodyHtml('done', '练过的篇目和上次成绩会收在这里。') + '</ul></div></div>';
  }
  function selected(listId) {
    return sources[channels[listId]] || '';
  }
  function html(listId, units, channel, listHtml) {
    channels[listId] = channel;
    renderFns[listId] = listHtml;
    allUnits[listId] = (units || []).slice();
    var filtered = allUnits[listId].filter(function (u) {
      var m = meta[String(u.id)];
      return !selected(listId) || (m && m.source === selected(listId));
    });
    var g = split(filtered);
    groups[listId] = g;
    shown[listId + '|todo'] = Math.min(PAGE, g.todo.length);
    shown[listId + '|done'] = Math.min(PAGE, g.done.length);
    ensureManifest();
    scheduleEnhance(listId);
    if (!filtered.length && allUnits[listId].length) {
      return '<div class="bank-empty"><p>当前筛选下没有篇目。</p><p>可以换关键词、Part 或来源再试。</p></div>';
    }
    return groupsHtml(listId, g, channel);
  }
  function expand(key) {
    var parts = key.split('|'), listId = parts[0], grp = parts[1];
    var g = groups[listId], listHtml = renderFns[listId];
    if (!g || !listHtml) return;
    var all = g[grp] || [], n = shown[key] || 0;
    var next = all.slice(n, n + PAGE);
    if (!next.length) return;
    var host = document.getElementById(listId);
    var wrap = host && host.querySelector('.bk-grp[data-grp="' + grp + '"] .bank-items');
    if (!wrap) return;
    shown[key] = n + next.length;
    var moreLi = wrap.querySelector('.bk-grp-more');
    var frag = rowsHtml(next, channels[listId]);
    if (moreLi) moreLi.insertAdjacentHTML('beforebegin', frag);
    else wrap.insertAdjacentHTML('beforeend', frag);
    var rest = all.length - shown[key];
    if (moreLi) {
      if (rest > 0) moreLi.querySelector('.bk-more').textContent = '展开更多（还有 ' + rest + ' 篇）';
      else moreLi.remove();
    }
    scheduleEnhance(listId);
  }

  /* 目录元数据只请求一次。album.name 是真实来源，不从标题或 Part 猜难度。 */
  function ensureManifest() {
    if (manifestP) return manifestP;
    manifestP = fetch('bank/manifest.json').then(function (r) {
      if (!r.ok) throw new Error('manifest');
      return r.json();
    }).then(function (m) {
      var seen = { reading: {}, listening: {} };
      ((m && m.albums) || []).forEach(function (a) {
        var ch = a.channel;
        if (!seen[ch]) seen[ch] = {};
        var name = String(a.name || '题库收录');
        if (sourceNames[ch].indexOf(name) < 0) sourceNames[ch].push(name);
        (a.units || []).forEach(function (u) {
          meta[String(u.id)] = {
            source: name, part: String(u.partNum || 'Part 1'), file: String(u.file || ''),
            qCount: Number(u.qCount) || 0, channel: ch
          };
        });
      });
      updateSources();
      paintSummary();
      Object.keys(channels).forEach(scheduleEnhance);
      Object.keys(sources).forEach(function (ch) {
        if (sources[ch]) refreshChannel(ch);
      });
      return meta;
    }).catch(function () {
      updateSources();
      paintSummary();
      return meta;
    });
    return manifestP;
  }
  function refreshChannel(ch) {
    var sel = ch === 'listening' ? '#listenPartTabs .pill-tab.active' : '#partTabs .pill-tab.active';
    var b = document.querySelector(sel);
    if (b) b.click();
  }
  function updateSources() {
    var select = document.getElementById('bkSourceSelect');
    if (!select) return;
    var root = document.getElementById('bankRoot');
    var ch = root && root.getAttribute('data-mock-tab') === 'listening' ? 'listening' : 'reading';
    var names = sourceNames[ch] || [];
    if (sources[ch] && names.indexOf(sources[ch]) < 0) sources[ch] = '';
    select.innerHTML = '<option value="">全部来源</option>' + names.map(function (name) {
      return '<option value="' + esc(name) + '"' + (sources[ch] === name ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    select.disabled = !names.length;
    select.setAttribute('aria-label', ch === 'listening' ? '按听力题库来源筛选' : '按阅读题库来源筛选');
  }
  function channelUnits(ch) {
    return Object.keys(meta).map(function (id) { return meta[id]; }).filter(function (m) { return m.channel === ch; });
  }
  function paintSummary() {
    var host = document.getElementById('bkRailSummary');
    if (!host) return;
    var root = document.getElementById('bankRoot');
    var ch = root && root.getAttribute('data-mock-tab') === 'listening' ? 'listening' : 'reading';
    var all = channelUnits(ch);
    /* 完成数直接读本地键对应的真实目录，而不是读首屏 20 行。 */
    var done = 0;
    Object.keys(meta).forEach(function (id) {
      if (meta[id].channel === ch && lastRec(id)) done++;
    });
    var qs = all.reduce(function (n, m) { return n + (m.qCount || 0); }, 0);
    var sourceCount = sourceNames[ch].length;
    var label = ch === 'listening' ? '听力' : '阅读';
    host.innerHTML = '<div class="bk-sum"><b>' + all.length + '<small> 篇</small></b><span>' + label + '题库</span></div>'
      + '<div class="bk-sum"><b>' + qs + '<small> 题</small></b><span>目录题量</span></div>'
      + '<div class="bk-sum"><b>' + done + '<small> 篇</small></b><span>本机练过</span></div>'
      + '<div class="bk-sum"><b>' + sourceCount + '<small> 个</small></b><span>收录来源</span></div>'
      + (done ? '' : '<p class="bk-rail-note">还没有' + label + '练习记录。做完一篇后，上次成绩会显示在对应篇目右侧。</p>');
    updateSources();
  }
  function currentChannel() {
    var root = document.getElementById('bankRoot');
    return root && root.getAttribute('data-mock-tab') === 'listening' ? 'listening' : 'reading';
  }
  function syncRail() {
    updateSources();
    paintSummary();
    var root = document.getElementById('bankRoot');
    var rail = document.getElementById('bkRail');
    if (rail && root) rail.setAttribute('aria-label', currentChannel() === 'listening' ? '听力题库筛选与练习概况' : '阅读题库筛选与练习概况');
  }

  /* 题型与 bank.js qtypeCode() 同口径。cache 只在内存，绝不写学习记录。 */
  function qtypeCode(g, ch) {
    if (!g) return '';
    var t = g.type, qs = g.questions || [];
    if (t === 'fill-in-the-blank') return 'fill';
    if (t === 'matching') {
      var opts = (g.options && g.options.length) ? g.options : ((qs[0] && qs[0].options) || []);
      var isHead = opts.length && /^[ivx]+$/i.test(String(opts[0].optionNum || ''));
      return isHead ? 'head' : 'match';
    }
    if (t === 'map') return ch === 'reading' ? 'para' : 'map';
    if (t === 'multiple-choice') return 'multi';
    if (t === 'single-choice') return 'single';
    return '';
  }
  function getTypes(id) {
    var m = meta[id];
    if (!m || !m.file) return Promise.resolve([]);
    if (typeCache[id]) return typeCache[id];
    typeCache[id] = fetch('bank/' + m.file).then(function (r) {
      if (!r.ok) throw new Error('unit');
      return r.json();
    }).then(function (data) {
      var names = [], seen = {};
      ((data && data.parts) || []).forEach(function (p) {
        (p.groups || []).forEach(function (g) {
          var c = qtypeCode(g, m.channel), name = QT[c];
          if (name && !seen[name]) { seen[name] = true; names.push(name); }
        });
      });
      return names;
    }).catch(function () { return []; });
    return typeCache[id];
  }
  function pump() {
    while (active < MAX_Q && queue.length) {
      var job = queue.shift();
      if (!job.row.isConnected || job.row.getAttribute('data-unit') !== job.id) continue;
      active++;
      getTypes(job.id).then(function (names) {
        active--;
        if (this.row.isConnected && this.row.getAttribute('data-unit') === this.id) {
          var host = this.row.querySelector('.bi-chips');
          if (host) host.innerHTML = baseMeta(this.id) + names.map(function (name) {
            return '<span class="bi-ch">' + esc(name) + '</span>';
          }).join('');
        }
        pump();
      }.bind(job));
    }
  }
  function baseMeta(id) {
    var m = meta[id];
    return m ? '<span class="bi-meta">' + esc(m.part) + '</span><span class="bi-meta">' + m.qCount + ' 题</span>' : '';
  }
  function scheduleEnhance(listId) {
    var token = (scheduleEnhance.tokens[listId] = (scheduleEnhance.tokens[listId] || 0) + 1);
    setTimeout(function () {
      if (scheduleEnhance.tokens[listId] !== token) return;
      var host = document.getElementById(listId);
      if (!host) return;
      host.querySelectorAll('.bank-item[data-unit]').forEach(function (row) {
        var id = String(row.getAttribute('data-unit')), m = meta[id];
        if (!m) return;
        var chips = row.querySelector('.bi-chips');
        if (chips && !chips.querySelector('.bi-meta,.bi-ch')) chips.innerHTML = baseMeta(id);
        var title = row.querySelector('.bi-tt');
        if (title && !row.querySelector('.bi-source')) {
          title.insertAdjacentHTML('afterend', '<span class="bi-source"><span class="bi-source-label">来源</span><span>' + esc(m.source) + '</span></span>');
        }
        row.setAttribute('aria-label', (row.querySelector('.bi-tt b') || {}).textContent + '，' + m.part + '，' + m.qCount + ' 题，来源 ' + m.source);
        queue.push({ row: row, id: id });
      });
      pump();
      if (listId === (currentChannel() === 'listening' ? 'listenList' : 'bankList')) paintSummary();
    }, 0);
  }
  scheduleEnhance.tokens = {};

  function onDocClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('.bk-more');
    if (btn && btn.dataset.more) { ev.preventDefault(); expand(btn.dataset.more); return; }
    var tab = t.closest('#mockTabs [data-mtab]');
    if (tab) setTimeout(syncRail, 0);
  }
  function onSourceChange(ev) {
    var select = ev.target;
    if (!select || select.id !== 'bkSourceSelect') return;
    var ch = currentChannel();
    sources[ch] = select.value || '';
    refreshChannel(ch);
    paintSummary();
  }
  /* 软导航会重新 eval：先解掉旧闭包持有的事件和旧 root 观察器。 */
  if (window.__bankGroupsCleanup) { try { window.__bankGroupsCleanup(); } catch (e) {} }
  var railObserver = null;
  if (typeof MutationObserver !== 'undefined') {
    var root = document.getElementById('bankRoot');
    if (root) {
      railObserver = new MutationObserver(syncRail);
      railObserver.observe(root, { attributes: true, attributeFilter: ['data-mock-tab'] });
    }
  }
  document.addEventListener('click', onDocClick);
  document.addEventListener('change', onSourceChange);
  window.__bankGroupsCleanup = function () {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('change', onSourceChange);
    if (railObserver) railObserver.disconnect();
  };
  window.__bankGroupsBound = true;
  ensureManifest();
  syncRail();
  window.BankGroups = { html: html, expand: expand, PAGE: PAGE, syncRail: syncRail };
})();
