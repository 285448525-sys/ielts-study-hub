/* ===== 首页「快速入口」渲染层（B-7a 5-1）=====
   她 10-23 11:0x 选定版一（勾选式自定义）。本批只做第一步：
   **把 home.html 里写死的三条 <a> 改成由这里渲染，视觉零变化**。
   编辑面板 / 存取 / 权限过滤是 5-2 的事，本文件暂不涉及。

   🔴 三条默认项必须和原来**逐像素一致**：
      结构 = <a class="qk" href><span class="ic">SVG</span><span class="tx"><b>标题</b><span>副标题</span></span><span class="ar">箭头</span></a>
      图标 = 从 home.html 原来那三个 SVG 原样搬过来（不重画、不引新图标库）
   🔴 不许碰 js/common.js 的 DEFAULT_FAV / DATA.settings.fav —— 侧栏「常用」与搜索在用。
   🔴 不新增存储键。本批连 settings.homeQuick 都还没读，纯渲染。 */
(function(){
  'use strict';

  var ARROW = '<svg class="ar" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';

  var ICO = {
    plans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    corpus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 13a7.5 7.5 0 0 1 15 0v4a2.5 2.5 0 0 1-2.5 2.5h-1.5a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2h4.9"/><path d="M4.5 13v4a2.5 2.5 0 0 0 2.5 2.5h1.5a2 2 0 0 0 2-2v-2.5a2 2 0 0 0-2-2H5.6"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M4.5 12V7"/><path d="M4.5 12H9.5"/></svg>'
  };

  /* 与 home.html 原来三条完全对应（顺序、文案、href 一字不差） */
  var QUICK_DEFAULT = [
    { k:'plans',  t:'计划', d:'今日清单 · AI 排周',  href:'plans.html',  ico:'plans'  },
    { k:'corpus', t:'听写', d:'长难句 · 错题 · 听写', href:'corpus.html', ico:'corpus' },
    { k:'review', t:'回顾', d:'成绩与学习轨迹',       href:'review.html', ico:'review' }
  ];

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function itemHtml(it){
    var ico = ICO[it.ico] || ICO.plans;
    return '<a class="qk" href="' + esc(it.href) + '" data-quick="' + esc(it.k) + '">'
         +   '<span class="ic">' + ico + '</span>'
         +   '<span class="tx"><b>' + esc(it.t) + '</b><span>' + esc(it.d) + '</span></span>'
         +   ARROW
         + '</a>';
  }

  /* 对外：renderQuick(list) —— 5-2 的编辑面板保存后也调它重渲染 */
  function renderQuick(list){
    var host = document.getElementById('rqList');
    if(!host) return;
    var arr = (list && list.length) ? list : QUICK_DEFAULT;
    host.innerHTML = arr.map(itemHtml).join('');
  }

  window.renderQuick = renderQuick;
  window.QUICK_DEFAULT = QUICK_DEFAULT;

  function boot(){
    if(!document.getElementById('rqList')) return;   /* 不是首页就什么也不做 */
    renderQuick(QUICK_DEFAULT);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
