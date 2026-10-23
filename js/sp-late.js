/* === js/sp-late.js · 口语页 B 区：按需加载框架 + 模考忙碌态 ===
 *
 * 🔴 为什么叫 sp-late 不叫 sp-mock：站点已有一个真正的模考脚本 js/mock.js（23KB，
 *    按需加载的那四个之一）。叫 sp-mock 会让 tests/_probe_latespk_1017.cjs 的正則
 *    /(materials|mock(-report|-history)?)\.js/ 把它误判成「按需加载脚本」，
 *    而它其实是首屏 defer 声明的 → 探针「四个脚本都不在首屏声明里」假红。
 *    本文件职责是「按需加载框架」= late，改名后歧义消失。
 *
 * 10-24 T-009 S-6a：从 js/speaking.js 原样搬来，函数体一个字没改。
 * 本文件取自 speaking.js 的 2 段 / 77 行。
 *
 * 内容清单：
 *   var _spkLate                                     已加载脚本的登记本
 *   lateReady / lateLoad                             按需加载的两个入口
 *   spMockTip / spMockTipClear                       模考加载态提示条
 *   spMockTabBusy                                    模考按钮转圈（10/20 她报「跳两次」的修法所在）
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 依赖：lateLoad 被入口 ready() 的空闲预热与模考跳转调用；spMockTip* 被入口模考分支调用。
 * 全部是全局 function，defer 全载完才调用，顺序不影响。
 *
 * 加载位置：speaking.html 里排在 sp-stats.js 之后、sp-timer.js 之前。
 */
/* ===== 10/17 性能批（第二批 · 传输层）：视图脚本按需加载 =====
   背景：materials.js(47KB) + mock-report.js(4KB) + mock-history.js(4KB) + mock.js(23KB)
   合计 78KB（压缩体）过去跟着首屏一起下载，但它们服务的「素材」不是默认 tab（默认 = 题库）、
   「模考」tab 目前还是 hidden（功能未开）。依据 = tests/_probe_ablate_1017.cjs 线上实测：
   单独拦掉它们，首屏照常渲染、零 pageerror。版本串在各自视图容器的 data-late-src 属性上。
   ⚠️ 属性放在 <main> 内、不放 body 末尾 —— 软导航只换 <main>，写在末尾的配置在软导航进来时会丢。
   ⚠️ 顺序契约：data-late-src 里的顺序就是原 <script> 声明顺序（mock-report → mock-history → mock）。 */
var _spkLate = {};
/* 脚本「已在」的判据 = 它暴露的全局产物（不能用 _spkLate 自己，理由见 lateLoad 注释） */
function lateReady(hostId){
  if(hostId === 'matView') return typeof window.matGen !== 'undefined';
  if(hostId === 'mockView') return typeof window.__mockEnter === 'function';
  return false;
}
function lateLoad(hostId){
  /* ⚠️ 10/17 回归修复：软导航会重新 eval 本文件，模块级 _spkLate 归零 —— 若只看它，软导航绕回
     本页后再点一次「素材/模考」会把已加载过的脚本**再 append 一次**，而 materials.js / mock.js
     顶层有 const，重复执行会抛 "Identifier '...' has already been declared"（实测：bank 软导航
     进本页 → 回题库 → 再回头，页面报错 —— 由 _probe_spkmock_1011 的 S6b 抓到）。
     所以：① 先看全局产物在不在；② promise 缓存同时挂 window，跨 eval 复用同一份加载过程。 */
  if(lateReady(hostId)) return Promise.resolve();
  window.__spkLate = window.__spkLate || {};
  if(window.__spkLate[hostId]) return window.__spkLate[hostId];
  var host = document.getElementById(hostId);
  var raw = host && host.getAttribute('data-late-src');
  if(!raw) return Promise.resolve();
  _spkLate[hostId] = raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean).reduce(function(chain, u){
    return chain.then(function(){
      return new Promise(function(res, rej){
        var s = document.createElement('script');
        s.setAttribute('data-late', '1');   /* 标记：运行时按需追加（探针用它区分「首屏声明」与「延后加载」） */
        s.src = u;
        s.onload = res;
        s.onerror = function(){ rej(new Error('load failed ' + u)); };
        document.head.appendChild(s);
      });
    });
  }, Promise.resolve()).catch(function(e){
    delete _spkLate[hostId];                 // 失败不缓存：下次切回来还能重试
    if(window.__spkLate) delete window.__spkLate[hostId];
    if(window.console && console.error) console.error('[speaking] 视图脚本加载失败：', e);
  });
  window.__spkLate[hostId] = _spkLate[hostId];
  return _spkLate[hostId];
}
/* 10/17 修：模考视图的 loading / 错误态占位。
   ⚠️ 只能「插入一张卡」，绝不能像素材那样写 mv.innerHTML —— #mockView 里住着 #mockStage / #mockReport
      两个静态容器，innerHTML 一写就把它们连同 mock.js 绑好的事件一起抹掉（舞台永远起不来）。 */
function spMockTip(html){
  const mv = $('#mockView');
  if(!mv) return null;
  let tip = document.getElementById('mockLoadTip');
  if(!tip){
    tip = document.createElement('div');
    tip.id = 'mockLoadTip';
    tip.className = 'card';
    mv.insertBefore(tip, mv.firstChild);   // 插在最前：舞台/报告一旦显示，它在上面不影响布局
  }
  tip.innerHTML = html;
  return tip;
}
function spMockTipClear(){ const t = document.getElementById('mockLoadTip'); if(t) t.remove(); }

/* 10/20：模考加载态（只有冷路径才出现）。
   为什么不在视图里放「加载中」：她报「点了会跳到加载画面卡住一会再跳」——那是**跳两次**。
   这里改成按钮上转圈、内容不动，下好了一次性切进考场，只跳一次。
   ⚠️ 必须挂在 #spMockJumpBtn 上：模考真正的入口是题库筛选行那个按钮，
      顶部 data-type="MOCK" 的 pill-tab 是 hidden 的承载节点（10/15 把入口移出去了）——
      加在那个隐藏节点上等于没加，用户一个像素都看不到。 */
function spMockTabBusy(on){
  const targets = [document.getElementById('spMockJumpBtn'), document.querySelector('#tabs [data-type="MOCK"]')];
  targets.forEach(function(el){
    if(!el) return;
    el.classList.toggle('is-loading', !!on);
    if(on) el.setAttribute('aria-busy', 'true');
    else el.removeAttribute('aria-busy');
  });
}
