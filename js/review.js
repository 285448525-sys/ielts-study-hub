/* 回顾页（合并页）：软导航时由 common.js 的 runPageScript('review') 调用。
   本页同时承载 scores（模考成绩）+ history（学习轨迹）+ 口语两块，没有单一业务脚本，
   四个业务模块（scores / history / mock-history / speaking-practice）在 review.html 的
   <head> 里都用带 ?v= 的 <script defer> 声明好了，runPageScript 会按声明顺序重新 eval 它们，
   而它们各自末尾都有 ready() 自动渲染 —— 也就是说，本文件其实不需要再拉任何源码。

   ⚠️ 2026-09-17 修复「第一次进去是旧页面、Ctrl+F5 才变新、过一会又变旧」：
   本文件原本自己 fetch('js/scores.js', { cache:'force-cache' }) 把源码拉回来 eval。
   那个 URL 不带 ?v= 版本号 → 命中的是浏览器 HTTP 缓存里任意年代的旧副本，eval 之后
   把 runPageScript 刚按 review.html 声明（?v=新）装好的同名函数整体覆盖回去，
   最后再手动调一次 render → 稳定渲染出旧 UI。
   而整页加载路径根本不跑本文件（review.js 原本不在 review.html 的 <script> 里），
   所以硬刷新永远是对的 —— 症状与现象完全对得上。

   现在的职责收窄为「幂等兜底协调器」：保证两块内容最终一定被渲染出来，
   谁先渲染的不重要，重复渲染也不会叠加事件（容器 content 是整体重建的）。
   不再发起任何无版本号请求。 */
(function () {
  // 等到校验函数为真（软导航下紧跟的 eval 循环会同步把模块装进来，通常下一拍就命中）
  async function waitUntil(test, ms) {
    const end = Date.now() + (ms || 3000);
    while (Date.now() < end) {
      let ok = false;
      try { ok = !!test(); } catch (e) { ok = false; }
      if (ok) return true;
      await new Promise(r => setTimeout(r, 40));
    }
    return false;
  }
  const filled = el => !!(el && String(el.innerHTML || '').trim());

  // ① 口语整卷模考历史（mock-history.js）
  async function ensureMockHistory() {
    const list = document.getElementById('mockHistoryList');
    if (!list) return;
    await waitUntil(() => window.MockHistory && typeof window.MockHistory.render === 'function');
    if (!window.MockHistory || typeof window.MockHistory.render !== 'function') return;
    if (filled(list)) return;                     // ready() 已渲染过 → 不重复重建 DOM
    window.MockHistory.render(list, { countEl: document.getElementById('mockHistCount') });
  }

  // ② 口语单题日常练习沉淀（speaking-practice.js）
  async function ensureSpeakingPractice() {
    if (typeof waitUntil !== 'function') return;
    await waitUntil(() => typeof window.renderSpeakingPractice === 'function');
    if (typeof window.renderSpeakingPractice !== 'function') return;
    const box = document.getElementById('spPracticeList');
    if (filled(box)) return;
    window.renderSpeakingPractice();
  }

  ready(() => {
    ensureMockHistory();
    ensureSpeakingPractice();
  });
})();
