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

  // ③ 轨迹折叠（她 10/1 拍板：每日记录/口语练习默认折叠，展开态 sessionStorage 本会话记忆）
  function initRvFold() {
    const KEY = 'hub_rev_fold';
    let st = {};
    try { st = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) {}
    const secs = document.querySelectorAll('.rv-fold');
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i];
      const key = sec.getAttribute('data-foldkey');
      const head = sec.querySelector('.rv-fold-head');
      const body = sec.querySelector('.rv-fold-body');
      if (!key || !head || !body) continue;
      const apply = open => { sec.classList.toggle('open', open); body.hidden = !open; };
      apply(st[key] === true);
      head.addEventListener('click', () => {
        const open = body.hidden;
        apply(open);
        st[key] = open;
        try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
      });
    }
  }


  /* 🔴 11-05 死壳清理（REVIEW-DEADSHELL-1）：这里原本有一个 applySubTab()，作用是读 sessionStorage
     交接暗号 hub_sub_review → 去 .click() 桌面已撤掉的那两个 .review-pill-tabs 药丸按钮。
     实测（B2 核 + A1 复验）它**完全不产生任何效果**，纯空转，故整块删除：
       ① 那两个按钮宽 0 高 0、文本为空，用户点不到；
       ② 它触发的 common-pwa.js:70 那条 .tab-btn 全局委托，开头就是 b.closest('.tabs')，
          而壳上是 class="review-pill-tabs"（没有 tabs 类）→ 直接 return，什么都不做；
       ③ 真正让「顶栏二级 → 轨迹」落点的是 js/rvx-data.js:280 的 deepLink()（读 location.search 的 sub），
          与这条死壳无关 —— 实测软导航点「轨迹」后 URL 是 /review.html?sub=record、筛选切到 all，
          删前删后这一路径的读数逐值相同。
     ⚠️ 交接暗号机制本身没废，别处还在用（bank / corpus / plans / practice / speaking / writing），
     只是 review 这一路不再需要它了。 */
  ready(() => {
    ensureMockHistory();
    ensureSpeakingPractice();
    initRvFold();
    /* 死壳删掉后 hub_sub_review 这个交接暗号不再有人消费 —— 顶栏二级的落点现在由
       js/rvx-data.js:280 的 deepLink() 读 URL query 完成（软导航下 URL 已带 ?sub=，实测过）。
       这里只把可能残留的暗号取走丢掉：暗号机制的不变式是「取用即删」，留着它的话，
       下一次「普通进入」回顾页（无 sub 意图）会被上一次的交接劫持 —— 正是 :614 注释要防的那种。
       只为维持不变式，不做任何落点动作。 */
    try { if (typeof tbSubPending === 'function') tbSubPending('review'); } catch (e) {}
  });
})();
