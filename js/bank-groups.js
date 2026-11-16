/* BANK-V2（11-16）：机经目录只做一件展示层的事 —— 首屏 20 条 + 展开更多。
   单条 DOM 仍由 js/bank.js 的 listHtml() 生成；本文件不碰判分、不写学习记录。
   旧版的「没做过 / 做过」分组、来源选择、题型补全随 v2 成品稿退场。 */
(function () {
  'use strict';
  var PAGE = 20;
  var shown = {};
  var all = {};
  var channels = {};
  var renderFns = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function rowsHtml(units, channel) {
    var fn = renderFns[channel];
    var inner = fn ? fn(units, channel) : '';
    var m = /<ul[^>]*>([\s\S]*)<\/ul>/.exec(inner);
    return m ? m[1] : '';
  }
  function footHtml(listId, rest) {
    if (rest <= 0) return '<div class="bk2-list-foot" hidden></div>';
    return '<div class="bk2-list-foot"><button type="button" class="bk-more" data-more="'
      + esc(listId) + '">展开更多（还有 ' + rest + ' 篇）</button></div>';
  }
  function html(listId, units, channel, listHtml) {
    channels[listId] = channel;
    renderFns[channel] = listHtml;
    all[listId] = (units || []).slice();
    shown[listId] = Math.min(PAGE, all[listId].length);
    var first = listHtml ? listHtml(all[listId].slice(0, shown[listId]), channel) : '';
    return first + footHtml(listId, all[listId].length - shown[listId]);
  }
  function expand(listId) {
    var units = all[listId] || [];
    var n = shown[listId] || 0;
    if (n >= units.length) return;
    var next = units.slice(n, n + PAGE);
    if (!next.length) return;
    var host = document.getElementById(listId);
    if (!host) return;
    var ul = host.querySelector('.bank-items');
    if (!ul) return;
    shown[listId] = n + next.length;
    ul.insertAdjacentHTML('beforeend', rowsHtml(next, channels[listId]));
    var foot = host.querySelector('.bk2-list-foot');
    var rest = units.length - shown[listId];
    if (!foot) {
      host.insertAdjacentHTML('beforeend', footHtml(listId, rest));
    } else if (rest > 0) {
      foot.hidden = false;
      var btn = foot.querySelector('.bk-more');
      if (btn) btn.textContent = '展开更多（还有 ' + rest + ' 篇）';
    } else {
      foot.hidden = true;
    }
  }
  function onDocClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('.bk-more[data-more]');
    if (!btn) return;
    ev.preventDefault();
    expand(btn.getAttribute('data-more'));
  }
  if (window.__bankGroupsCleanup) {
    try { window.__bankGroupsCleanup(); } catch (e) {}
  }
  document.addEventListener('click', onDocClick);
  window.__bankGroupsCleanup = function () {
    document.removeEventListener('click', onDocClick);
  };
  window.BankGroups = {
    html: html,
    expand: expand,
    PAGE: PAGE,
    syncRail: function () {}
  };
})();
