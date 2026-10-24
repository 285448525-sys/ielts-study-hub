/* M-2（10-24）：模考页搜索 + 没做过/做过分组 + 展开更多
   施工书：交接\给A2窗口-模考页四批-2026-10-24.md §M-2
   「627 篇题只有一根滚动条 —— 桌面最实的痛点」。

   🔴 数据源就是现有的本地记录（hub_bank_last_<id>），**零新增字段、零口径变化**。
   🔴 不许碰判分、SRS、hub_bank_last_* —— 本文件只做「展示层」：
       读 localStorage → 分组 → 首屏 N 条 → 展开更多。一个字节都不写回去。

   ⚠️ 与既有实现的边界：
     · 阅读侧 = js/bank.js 的 renderList() / listHtml()
     · 听力侧 = js/bank.js 的 renderListenList() / listHtml()
     · 写作侧 = js/writing.js 的 renderExamList()（数据源 WRITING_PROMPTS，无做过记录）
     · 搜索输入框直接复用站内 initListSearch() 的契约（data-search-input + data-search-target），
       但它只做「显隐」，和分组/分页会打架 → 本文件自己实现过滤（见 searchBankList）。

   实现方式 = 在 listHtml() 外面包一层 .bk-groups（两组），每组：
     · 组头：组名 + 计数 + （可选）展开箭头
     · 组体：首屏 PAGE 条 + 「展开更多」按钮
   这样原有 .bank-items 的 CSS 与点击逻辑一行不用改。 */

(function () {
  var PAGE = 20;                                    /* 每组首屏条数 / 展开步长 */
  var shown = {};                                   /* 每组已渲染条数 {listId|grp:n} */
  var groups = {};                                  /* 当前快照 {listId:{todo:[],done:[]}} */
  var renderFns = {};                               /* bank.js 传进来的 listHtml {listId:fn} */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 读一条本地记录（只读；口径与 listHtml 里那段一字不差） */
  function lastRec(id) {
    try {
      var raw = localStorage.getItem('hub_bank_last_' + id);
      if (!raw) return null;
      var r = JSON.parse(raw);
      return (r && typeof r === 'object') ? r : null;
    } catch (e) { return null; }
  }

  /* 按「没做过 / 做过」分两组。做过 = localStorage 里有 hub_bank_last_<id> */
  function split(units) {
    var todo = [], done = [];
    (units || []).forEach(function (u) {
      if (lastRec(u.id)) done.push(u); else todo.push(u);
    });
    return { todo: todo, done: done };
  }

  /* 组头 + 首屏 + 「展开更多」。返回整段 HTML（含外层 .bk-groups）。
     ⚠️ listHtml 是 bank.js 的内部函数，此处通过 html() 传进来；单条 DOM 全部由它生成。 */
  function groupsHtml(listId, g) {
    var listHtml = renderFns[listId];
    function slice(key) {
      var n = shown[listId + '|' + key] || 0;
      return (g[key] || []).slice(0, n);
    }
    function rest(key) {
      var n = shown[listId + '|' + key] || 0;
      return Math.max(0, (g[key] || []).length - n);
    }
    function bodyHtml(key, emptyTxt) {
      var items = slice(key);
      var rest_n = rest(key);
      var h = '';
      if (!items.length) {
        return '<li class="bk-grp-empty">' + esc(emptyTxt) + '</li>';
      }
      /* 🔴 单条 DOM 完全交给 bank.js 的 listHtml —— 结构零偏差。
         它返回的是 `<ul class="bank-items">…</ul>`，这里只要里面的 li。 */
      var inner = listHtml ? listHtml(items, key === 'done' ? '' : '') : '';
      var m = /<ul[^>]*>([\s\S]*)<\/ul>/.exec(inner);
      h += m ? m[1] : '';
      if (rest_n > 0) {
        h += '<li class="bk-grp-more"><button type="button" class="bk-more" '
          + 'data-more="' + esc(listId) + '|' + key + '">展开更多（还有 ' + rest_n + ' 篇）</button></li>';
      }
      return h;
    }
    return ''
      + '<div class="bk-groups">'
      +   '<div class="bk-grp" data-grp="todo">'
      +     '<div class="bk-grp-h"><b>没做过</b><span class="bk-grp-n">' + (g.todo || []).length + ' 篇</span></div>'
      +     '<ul class="bank-items">' + bodyHtml('todo', '这一类都做完了') + '</ul>'
      +   '</div>'
      +   '<div class="bk-grp" data-grp="done">'
      +     '<div class="bk-grp-h"><b>做过</b><span class="bk-grp-n">' + (g.done || []).length + ' 篇</span></div>'
      +     '<ul class="bank-items">' + bodyHtml('done', '还没有做过任何一篇') + '</ul>'
      +   '</div>'
      + '</div>';
  }

  /* 供 bank.js 调用：把一组 units 渲染成「分组 + 首屏」的完整 HTML。
     bank.js 只需在原来 host.innerHTML = listHtml(units, channel) 的地方改成：
       host.innerHTML = window.BankGroups.html(listId, units, channel, listHtml);
     第四个参数是 bank.js 自己的 listHtml —— 单条 DOM 全用它生成，本文件一行都不重写
     （否则两处各写一份 .bank-item，改一处忘一处必然漂移）。 */
  function html(listId, units, channel, listHtml) {
    var g = split(units);
    groups[listId] = g;
    shown[listId + '|todo'] = Math.min(PAGE, g.todo.length);
    shown[listId + '|done'] = Math.min(PAGE, g.done.length);
    renderFns[listId] = listHtml;                 /* 供 expand() 追加下一页时用 */
    return groupsHtml(listId, g);
  }

  /* 「展开更多」：追加下一页（保留已渲染的 DOM，不重建 —— 避免滚动位置丢失） */
  function expand(key) {
    var parts = key.split('|');
    var listId = parts[0], grp = parts[1];
    var g = groups[listId];
    var listHtml = renderFns[listId];
    if (!g || !listHtml) return;
    var all = g[grp] || [];
    var n = shown[key] || 0;
    var next = all.slice(n, n + PAGE);
    if (!next.length) return;
    shown[key] = n + next.length;
    var host = document.getElementById(listId);
    if (!host) return;
    var wrap = host.querySelector('.bk-grp[data-grp="' + grp + '"] .bank-items');
    if (!wrap) return;
    /* 🔴 追加的单条也走 bank.js 的 listHtml —— 与首屏完全同一套 DOM。 */
    var inner = listHtml(next, '');
    var m = /<ul[^>]*>([\s\S]*)<\/ul>/.exec(inner);
    var frag = m ? m[1] : '';
    var moreLi = wrap.querySelector('.bk-grp-more');
    if (moreLi) moreLi.insertAdjacentHTML('beforebegin', frag);
    else wrap.insertAdjacentHTML('beforeend', frag);
    var rest = all.length - shown[key];
    if (rest > 0) {
      if (moreLi) {
        var b = moreLi.querySelector('.bk-more');
        if (b) b.textContent = '展开更多（还有 ' + rest + ' 篇）';
      }
    } else if (moreLi) {
      moreLi.remove();
    }
  }

  /* 事件委托：软导航重跑本文件也不叠加（document 级只绑一次，用 flag） */
  if (!window.__bankGroupsBound) {
    window.__bankGroupsBound = true;
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.bk-more');
      if (btn && btn.dataset.more) { ev.preventDefault(); expand(btn.dataset.more); }
    });
  }

  window.BankGroups = { html: html, expand: expand, PAGE: PAGE };
})();
