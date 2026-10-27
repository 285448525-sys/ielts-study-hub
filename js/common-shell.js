/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 6 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== 软导航 / 加载遮罩 / 悬浮计时 / 离线条 / 预热 */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */

/* ===== 桌面通知（番茄钟阶段切换 / 智能提醒）已移除：不再申请浏览器通知权限 ===== */

window.$ = s => document.querySelector(s);
/* 10-24 SW-3：ready() 已搬到 js/common.js（本文件是第 6 块、84KB，32 个页面脚本靠它 ——
   定义放这里等于让全站页面脚本吊在最大的一块上；common.js 是每页第一个加载的共享块）。
   内部所有 ready() 调用一律不动，函数本体见 common.js。 */

/* 取某个 js 模块「页面实际声明的那份 URL」（含 ?v= 版本号），取不到再退回裸文件名。
   ⚠️ 9/17 回顾页陈旧 UI 事故的根因类问题：凡是手工拼 'js/xxx.js' 去 fetch / 注入的地方，
   URL 上没有 ?v= 版本号就等于在向「浏览器 HTTP 缓存里任意年代的旧副本」要代码，
   eval 之后会把刚按页面声明装好的新版同名函数整体覆盖回去。
   动态加载脚本一律走这里，跟页面声明同源，版本号永远不会漂移。 */
function declaredSrc(name){
  try{
    const base = 'js/' + name.replace(/^.*\//, '');
    const s = document.querySelector('script[src*="' + base + '"]');
    const src = s && s.getAttribute('src');
    if(src) return src;
  }catch(e){}
  return 'js/' + name.replace(/^.*\//, '');
}

/* =========================================================================
   软导航（SPA-lite）：点击站内链接只替换 <main>，不整页刷新 → 消除换页卡顿
   设计红线（保证导航永远不被改坏）：
   - 在 document 上拦截 a[href] 点击；外部链接 / 新标签 / 下载 / 锚点 / 非 .html
     一律放行，走浏览器原生跳转。
   - 仅当目标是已知站内页面才软切换；其余（如导出 blob、mailto）放行。
   - 软切换任何一步失败（fetch 404/解析失败/异常）→ 立即 location.href 原生
     兜底跳转，用户永远不会“点不动”。
   - 每个页面脚本在切换后“重新执行一次”，天然复用其既有的 ready() 与事件绑定，
     不需要改 17 个页面 JS；DATA 与全部全局函数始终保留在内存里。
   ========================================================================= */
/* =========================================================================
   全站「模考锁」（10/20 她报「模考时经常会莫名其妙弹出去 + 页面乱动」）
   -------------------------------------------------------------------------
   实测根因（tests/_stab_navkill_1020.cjs 复现，非推测）：
     bank.html 的 #examRoot 在 <main> 之内（bank.html:1464），
     而软导航只换 <main> 的 innerHTML（下方 softNavigate）。
     → 模考中点侧栏任一链接（12 个，全部在 .top-nav 里、模考态一个都没藏），
       软导航直接 main.innerHTML = 新页内容 → **整个模考界面连同已答内容被销毁**，
       浏览器实测 examRoot 从 6 个子节点变成「不存在」，URL 跳到 /login.html。
     这就是「莫名其妙弹出去」的机制，与她点没点错、点的是哪个链接无关。
   修法（两道闸，不改任何答题/判分/草稿/云同步逻辑）：
     ① 导航闸：模考中拦截站内链接点击 + 浏览器后退 + location.href → 弹提示、不换页。
     ② 视觉闸：模考中隐藏 .top-nav（侧栏）与 #hubDock（底栏）→ 没有可点的出口。
   ⭐ 为什么放全局外壳而不是各页自己判：
     模考页有 4 个（bank 读/听、writing、speaking），共用一套外壳 common-shell.js，
     闸门放这里 = 一次改动全覆盖，新增模考页默认也被保护（不用记得补）。
   ========================================================================= */
const _hubExamLock = { on: false, msg: '' };
/* 开锁：各模考页在「进入考试」时调用。on=true = 正在考试，锁住导航。
   flushHeal=true = 「彻底离开考场」时才把模考期间攒下的待刷新执行掉。
   ⭐ 交卷（还停在成绩页看解析）传 false：解锁导航但先不刷 —— 否则她刚交卷想看成绩，
   页面就被刷没了（那还是「页面乱动」）。等她真正退出模考再刷。 */
function hubExamLock(on, msg, flushHeal){
  _hubExamLock.on = !!on;
  if(msg) _hubExamLock.msg = msg;
  try{
    if(document.body){
      document.body.classList.toggle('hub-exam-locked', _hubExamLock.on);
      document.body.classList.remove('nav-open');   // 顺带收起移动端侧栏，避免半开状态
    }else if(_hubExamLock.on){
      /* body 还没就绪（脚本 defer 在 body 解析前执行）→ 等 DOMContentLoaded 再挂 class，
         否则视觉闸（隐藏侧栏/底栏）会漏挂，导航闸还在但界面看着能点。 */
      document.addEventListener('DOMContentLoaded', function(){
        try{
          document.body.classList.add('hub-exam-locked');
          document.body.classList.remove('nav-open');
        }catch(e){}
      }, { once: true });
    }
  }catch(e){}
  /* 🔴 10/20：解锁时若模考期间攒下了「待刷新」（线上出了新版）→ 现在刷。
     用户已交卷/已退出，成绩与作答都已落库，此刻刷新是安全的。 */
  if(!_hubExamLock.on && _hubPendingHeal && flushHeal){
    _hubPendingHeal = false;
    setTimeout(function(){
      try{
        var last = Number(sessionStorage.getItem('hub_nav_v_rl') || 0);
        if(Date.now() - last < 5000) return;      // 刚自愈过就不再刷
        sessionStorage.setItem('hub_nav_v_rl', String(Date.now()));
      }catch(e){}
      try{ location.reload(); }catch(e){}
    }, 800);
  }
  return _hubExamLock.on;
}
function hubExamLocked(){ return _hubExamLock.on; }
/* 锁住时的统一提示文案（不出现分数承诺、不用她禁用的术语） */
function hubExamLockNotice(){
  return _hubExamLock.msg || '模考进行中，先交卷或退出模考再切换页面';
}
/* 导航闸的唯一入口：任何「要离开考场」的站内导航都必须先过这里。
   返回 true = 已拦截，调用方必须 return（不要继续导航）。 */
function hubExamGuardNav(){
  if(!_hubExamLock.on) return false;
  try{ if(typeof toast === 'function') toast(hubExamLockNotice()); }catch(e){}
  return true;
}
/* 整页跳转兜底：模考中任何 location.href / assign / replace 都得先问一句。
   ⚠️ 拦截后浏览器地址栏不变、页面不离开 —— 用户不会被骗走。 */
(function(){
  try{
    const _assign = Location.prototype.assign;
    const _replace = Location.prototype.replace;
    const _hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    Location.prototype.assign = function(u){
      if(hubExamLocked()){ hubExamGuardNav(); return; }
      return _assign.call(this, u);
    };
    Location.prototype.replace = function(u){
      if(hubExamLocked()){ hubExamGuardNav(); return; }
      return _replace.call(this, u);
    };
    if(_hrefDesc && _hrefDesc.set){
      Object.defineProperty(Location.prototype, 'href', {
        configurable: true, enumerable: _hrefDesc.enumerable,
        get: _hrefDesc.get,
        set: function(v){
          if(hubExamLocked()){ hubExamGuardNav(); return; }
          _hrefDesc.set.call(this, v);
        }
      });
    }
  }catch(e){}
})();
let _softNavReady = false;
let _softNavBusy = false;
/* 模考中推迟的自愈刷新（navSelfHealReload 被模考锁挡下时置 true） */
let _hubPendingHeal = false;
/* 10/8 「导航优先」闸（她 10:53 报「点每个页面跳转要加载好久，之前很快」）：
   软导航进行中 + 结束后 2s 内，同步三路流量（3s meta 探测 / 全量下载 / 自动 PUT 上传）
   与后台预热全部让路 —— 手机端这些请求与页面 HTML/JS 抢同一条到 pages.dev 的慢链路，
   是「点哪都要转圈」的主因之一。只让路不砍功能：2s 后自动恢复 3s 节拍（10/6 她拍板的秒级同步语义不变）。 */
let _lastNavAt = 0;
function navBusyGrace(){ return _softNavBusy || (Date.now() - _lastNavAt < 2000); }

/* ===== 全站跳转加载遮罩（果冻水珠 · 纯图案无文字） =====
   - 运行时注入 <body>，避免每页改 HTML。
   - 软导航点击站内链接当帧显示，内容切换 + 脚本执行完毕（DOM 就绪）后淡出。
   - 整页兜底跳转（location.href）时旧页卸载、遮罩随页面消失，新页默认隐藏（无残留）。
   - 3s 兜底强制隐藏，避免卡死。 */
function injectLoadingOverlay(){
  if(document.getElementById('hubLoader')) return;
  const el = document.createElement('div');
  el.id = 'hubLoader';
  el.className = 'hub-loader';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="ui-loader" role="status" aria-label="Loading"><span class="ui-loader-dot"></span><span class="ui-loader-dot m2"></span><span class="ui-loader-dot m3"></span><span class="ui-loader-shadow"></span><span class="ui-loader-shadow m2"></span><span class="ui-loader-shadow m3"></span></div>';
  document.body.appendChild(el);
}
/* 遮罩显示策略：
   - HUB_LOADER_DELAY：延迟展示阈值（9/9 性能）。旧实现「点击即显示 + 最短展示 250ms」，
     导致页面 15ms 就切好了也要卡满 250ms 的 loading —— 正是「点 tab 加载时间过长」的体感主因。
     现在：120ms 内切完就完全不显示遮罩；只有真慢（>120ms）才出现，避免闪一下。
   - HUB_LOADER_MIN：已展示后的最短展示，避免遮罩「闪一下」像坏了一样；
   - HUB_LOADER_MAX：安全上限，极端慢网 / 重脚本 eval 卡住时也不残留遮罩（softNavigate 的 finally 也会兜底收起）。 */
let _hubLoaderHideTimer = null;
let _hubLoaderMaxTimer = null;
let _hubLoaderShowTimer = null;
let _hubLoaderShownAt = 0;
const HUB_LOADER_DELAY = 120;
const HUB_LOADER_MIN = 250;
const HUB_LOADER_MAX = 5000;
function showHubLoader(){
  if(_hubLoaderShowTimer) clearTimeout(_hubLoaderShowTimer);
  _hubLoaderShowTimer = setTimeout(() => {           // 延迟展示：秒切不显示，慢了才盖遮罩
    _hubLoaderShowTimer = null;
    const el = document.getElementById('hubLoader');
    if(!el) return;
    el.classList.add('show');
    // .ui-loader 由 CSS 无限动画驱动，无需 JS 重置
    _hubLoaderShownAt = Date.now();
    if(_hubLoaderHideTimer){ clearTimeout(_hubLoaderHideTimer); _hubLoaderHideTimer = null; }
    if(_hubLoaderMaxTimer) clearTimeout(_hubLoaderMaxTimer);
    _hubLoaderMaxTimer = setTimeout(_doHideHubLoader, HUB_LOADER_MAX);
  }, HUB_LOADER_DELAY);
}
function hideHubLoader(){
  if(_hubLoaderShowTimer){ clearTimeout(_hubLoaderShowTimer); _hubLoaderShowTimer = null; }  // 还没来得及显示就切完了 → 直接取消
  const el = document.getElementById('hubLoader');
  if(!el) return;
  if(!el.classList.contains('show')){ _clearLoaderTimers(); return; }   // 已收起，忽略重复调用
  const remain = HUB_LOADER_MIN - (Date.now() - _hubLoaderShownAt);
  if(remain > 0){                                                      // 未达最短展示，延时收起
    if(_hubLoaderHideTimer) clearTimeout(_hubLoaderHideTimer);
    _hubLoaderHideTimer = setTimeout(_doHideHubLoader, remain);
    return;
  }
  _doHideHubLoader();
}
function _doHideHubLoader(){
  const el = document.getElementById('hubLoader');
  if(el) el.classList.remove('show');
  _clearLoaderTimers();
}
function _clearLoaderTimers(){
  if(_hubLoaderHideTimer){ clearTimeout(_hubLoaderHideTimer); _hubLoaderHideTimer = null; }
  if(_hubLoaderMaxTimer){ clearTimeout(_hubLoaderMaxTimer); _hubLoaderMaxTimer = null; }
  if(_hubLoaderShowTimer){ clearTimeout(_hubLoaderShowTimer); _hubLoaderShowTimer = null; }
}

/* ===== 首屏启动遮罩（覆盖硬刷新 / 整页跳转的卡顿） =====
   说明：上面的 #hubLoader 是「软导航」遮罩，由 JS 注入、仅在点击站内链接时显示。
   但它赶不上 Ctrl+F5 / 整页跳转——那种情况下 JS 还没跑、body 还是空的，卡顿完全没遮住。
   所以各页面 HTML 里直接内联了一个 #bootLoader（含内联 <style>，首字节即渲染），
   本函数负责在「页面真正可用」后把它收起，并对任何卡死情况兜底。
   - window.load：所有子资源（脚本/样式/字体/图片）就绪，覆盖整段硬刷新卡顿；
   - 8s 安全上限：极端情况 load 不触发也不残留；
   - 暴露 window.__hubBootDone：若某页要在自己的重脚本跑完后才收起，可主动调用。 */
/* 🔴 CLS-1（2026-10-26）：启动绘制期让 <main> 在**渲染期不可见**，遮罩收起那一刻才放出来。
   她 16:0x 报「首页启动主区被侧栏盖住（CLS）」，实测（线上 390/1280 + CPU 4x + Slow4G）：
     · 桌面 0.084 位移源 = section.hmods / section.hstats / div.rail-quick（首页首屏渲染把兄弟块推下去）
     · 手机+桌面 0.023 位移源 = main.container（公告条 34px 在后插入，把 main 推下去）
   两条位移都发生在**遮罩还完全不透明的时候**，照样计分 —— 实测证明「挡在遮罩后面」没用
   （见 _cls_diag6：位移发生时遮罩 op=1 hide=false，CLS 照记）。
   正解 = 让被推的元素**在位移发生时不是「可见元素」**：位移不算、放出来只是一次「出现」。
   代价 0：遮罩本来就把整屏盖住，用户看不到这期间的任何变化（放出来与遮罩淡出同一帧）。
   ⚠️ 刻意写成 **JS 设置**而不是 CSS —— AGENTS §10「先藏后显不得把『藏』写死在 CSS」：
      JS 挂了（或没有遮罩的页）内容默认就是可见的；本函数另有 8s 兜底必放行。
   ⚠️ 幂等：_finishBootLoader 可能被页面、兜底定时器各调一次，放行必须每次都执行。 */
function _bootMainVisible(on){
  try{
    var m = document.querySelector('main');
    if(m) m.style.visibility = on ? '' : 'hidden';
  }catch(e){}
}
/* CLS-1（10-26）：公告条的决定还没落地时，先别放行 main。
   为什么：公告条是 body 直下的 34px 条，网络回来才插 → 把 main 推下 34px（实测 0.023/0.040）。
   什么时候必须等：顶栏壳（会挂公告条）且**本机没有公告清单**（首次进站）。
   什么时候不等：本机有清单（ancEnsure 已给出最终决定）/ 非顶栏壳 / 超过 900ms（绝不许把启动卡在网络上）。 */
var _bootAncWaited = false;
function _bootAncGateOk(){
  try{
    if(_bootAncWaited) return true;
    if(document.body.getAttribute('data-shell') !== 'top') return true;
    if(window.__hubAncDecided) return true;
    if(typeof ancSettled !== 'function') return true;
    /* 🔵 PERF-NAV-2C（10-26）：**本机已经读过公告的人，一次都不用等**。
       这道闸是 CLS-1 为「公告条插进来把 main 推下 34px」设的 ——
       但公告一旦读过（hub_anc_read 有记录），ancPending() 就返回 null、
       公告条**根本不会挂**，那 34px 位移压根不会发生 → 等它就是纯白等。
       她每次硬进站都要吃这最多 900ms（Ctrl+F5 之后尤其明显）。
       ⚠️ 判据是「读过任何一条公告」而不是「有没有本机清单」：
          清单在但读过了 → 不挂条、不必等；清单在没读过 → 仍然要等它插入（保 CLS）。 */
    try{
      if(typeof ancReadSet === 'function' && ancReadSet().size > 0) return true;
    }catch(e){}
    return false;
  }catch(e){ return true; }
}
function _finishBootLoader(){
  var el = document.getElementById('bootLoader');
  if(el && !el.dataset.done){
    if(!_bootAncGateOk()){
      _bootAncWaited = true;    // 只等一次，等完这条路径不再拦
      /* 🔵 PERF-NAV-2C：上限 900 → 300ms。
         900ms 是 CLS-1 当初的保守值；但现在这条路径只剩「从没读过公告的首次访问」，
         且 ancLoad 走的是 PRECORE 裸路径（首帧就可能命中缓存）——300ms 足够覆盖常规情况，
         真拿不到就按「不挂条」放行（下面 then 里 ancEnsure 仍会补挂，位移发生在遮罩淡出前）。
         ⚠️ 8s 兜底与「main 最终必放行」两条一行不动。 */
      var t = setTimeout(function(){ _finishBootLoader(); }, 300);
      try{
        ancSettled().then(function(){
          try{ if(typeof ancEnsure === 'function') ancEnsure(); }catch(e){}
          clearTimeout(t);
          _finishBootLoader();
        });
      }catch(e){ clearTimeout(t); _finishBootLoader(); }
      return;
    }
    el.dataset.done = '1';
    el.classList.add('hide');
    setTimeout(function(){ if(el && el.parentNode) el.parentNode.removeChild(el); }, 400);
  }
  /* 放行 main 与遮罩淡出在同一帧：用户看到的是「遮罩淡掉、页面已经是最终样子」 */
  _bootMainVisible(true);
}
function initBootLoader(){
  var el = document.getElementById('bootLoader');
  if(!el) return;   // 没有遮罩的页（如全内联落地页/自带头样式页）不藏 main —— 藏了没人放
  _bootMainVisible(false);
  window.__hubBootDone = _finishBootLoader;
  // 优化：遮罩在「DOM 解析完成 + 本批 defer 脚本渲染完」即收起，
  // 不再等 window.load（window.load 还会等图片/字体/慢网资源，农村代理网络下会卡很久）。
  // 本 App 内容全靠 JS 渲染、几乎无图片，DOMContentLoaded 时页面已就绪。
  var _bootFinishSoon = function(){
    // 2026-09-04 提速：原固定 250ms 是纯死等。defer 脚本与各页 ready 的同步渲染
    // 在 DOMContentLoaded 前后即已完成，两帧 rAF（约 32ms）足以让首帧绘制发生，
    // 遮罩即可收起 → 新开标签页「可用」体感提前约 200ms。
    var raf = window.requestAnimationFrame || function(cb){ setTimeout(cb, 16); };
    raf(function(){ raf(function(){
      /* 10/17 性能批：页面可声明「我的首屏内容还没渲染完」，请求遮罩先别收。
         动机：home.html 的 #threeThings 与 section.meta 是上下相邻关系，而
         index.js 的 ready() 开头会 await 官方词库 json（obBankReady）。词库激活时
         该 await 把两卡渲染推到遮罩收掉之后 2.3 秒 → 卡片撑开 393~490px 把
         section.meta 推下去 = 完全可见的布局位移（实测 CLS 0.33，手机 Slow4G）。
         握手协议（目前唯一使用方 = index.js，双向防竞态）：
           · 页面置 window.__hubBootHold = true  →「还没画完，先别收」
           · 页面置 window.__hubBootReady = true →「画完了，可以收」
         两者到达顺序不定（custom 词库时 index.js 根本没有 await，会先于本函数执行到
         release 那一行），所以两边都要能兜住对方：
           · 本函数：hold 且未 ready → 把 _finishBootLoader 挂给页面，等它回头调
           · 页面  ：若挂的函数还没出现，就先只置 ready 旗标，本函数随即自行收尾
         ⚠️ 拿不到 release 也不会卡死：下面那条 8s 兜底 setTimeout 照旧生效。 */
      if(window.__hubBootHold && !window.__hubBootReady){
        window.__hubBootRelease = _finishBootLoader;
        return;
      }
      _finishBootLoader();
    }); });
  };
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    _bootFinishSoon();
  } else {
    document.addEventListener('DOMContentLoaded', _bootFinishSoon, { once:true });
  }
  setTimeout(_finishBootLoader, 8000);   // 兜底：绝不卡死在遮罩上
}

/* ===== 全站计时悬浮标签（底部居中 · 跨页常驻） =====
   - 运行时注入 <body>，所有页面可见；默认 hidden。
   - 数据源：本页 timer.js 的 window.active（计时页内，含实时暂停累计），
     或 DATA.activeTimer 云端镜像（跨页 / 其他页也能显示本地计时）。
   - timer.js 在 开始/暂停/结束/继续 时 dispatch 'hub:timer-state' → 立即同步；
     另起 1s 间隔持续刷新 elapsed 并自愈（ended 时自动隐藏）。
   - 只显示「未结束」的活跃计时。 */
function injectFloatTimer(){
  if(document.getElementById('floatTimer')) return;
  const el = document.createElement('div');
  el.id = 'floatTimer';
  el.className = 'float-timer';
  el.setAttribute('hidden', '');
  el.innerHTML = '<span class="ft-dot"></span>'
    + '<span id="ft-label" class="ft-label">计时中</span>'
    + '<span id="ft-time" class="ft-time">00:00:00</span>'
    + '<button id="ft-stop" class="ft-stop" type="button">结束</button>';
  document.body.appendChild(el);
  const stop = document.getElementById('ft-stop');
  if(stop) stop.addEventListener('click', floatStopTimer);
}
function floatTimerSource(){
  if(window.active && window.active.startTs && !window.active.ended) return window.active;
  const a = DATA.activeTimer;
  if(a && !a.ended && a.startTs) return a;
  return null;
}
function floatElapsedSec(src){
  if(!src || !src.startTs) return 0;
  const now = Date.now();
  let pause = Number(src.pauseAccum) || 0;
  if(src.paused && src.pauseStart) pause += (now - src.pauseStart);
  let elapsed = (now - src.startTs - pause) / 1000;
  if(src.paused && src.pauseStart) elapsed = (src.pauseStart - src.startTs - (Number(src.pauseAccum) || 0)) / 1000;
  return Math.max(0, elapsed);
}
/* 倒计时模式显示剩余时间，与计时页主卡口径一致（她 9/19 反馈：点倒计时 40 分钟，
   悬浮标也得走倒计时，不能是正计时）。非倒计时/旧数据（无 mode/targetSec）回退正计时。 */
function floatDisplaySec(src){
  const elapsed = floatElapsedSec(src);
  if(src && src.mode === 'down' && src.targetSec){
    return Math.max(0, (Number(src.targetSec) || 0) - elapsed);
  }
  return elapsed;
}
function syncFloatTimer(){
  const src = floatTimerSource();
  const el = document.getElementById('floatTimer');
  if(!el) return;
  /* 10/2（她反馈模考答题卡被悬浮胶囊挡住）：沉浸式模考进行中不显示跨页胶囊。
     计时照跑不中断，只是不显示；退出模考（#mockView hidden）自动恢复。
     10/13 她报「做题页左下绿框太明显」→ bank.html 考场（#examRoot 可见）同样隐藏，
     改由 bank.js 在考场顶栏计时器旁显示小号徽章 #exFtMini（同数据源、不抢眼）。 */
  const mockView = document.getElementById('mockView');
  const examRoot = document.getElementById('examRoot');
  const immersive = (mockView && !mockView.hidden) || (examRoot && !examRoot.hidden);
  if(immersive){
    if(!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
    return;
  }
  if(!src){
    if(!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
    return;
  }
  const name = src.subName || src.moduleName || '学习';   // 9/17 任务计时：subName=任务文本（如「听力 第3篇」），优先显示
  const label = document.getElementById('ft-label');
  if(label) label.textContent = (src.paused ? name + ' 暂停中' : name + ' 计时中');
  const t = document.getElementById('ft-time');
  if(t) t.textContent = (typeof fmtHMS === 'function') ? fmtHMS(floatDisplaySec(src)) : '00:00:00';
  if(el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
function floatStopTimer(){
  if(typeof window.stopSession === 'function'){ window.stopSession(); return; }
  // 非计时页：直接跳到计时页，由那里的「结束并保存」正规结算（避免丢失记录）
  location.href = 'timer.html';
}
let _floatTimerInterval = null;
/* 遗弃计时自愈：打开任意页面时，若云端镜像存在一个「未结束但已离线/跨天」的遗弃计时，
   把它结算为结束（记录真实时长 = startTs→lastBeat，不含离线空隙），避免被浮窗按墙钟累加成 17 小时幽灵计时，
   也解除它对另一端「isWordTimerActive」的占用，让另一台设备能正常开新计时。（之之 8/31 反馈） */
function settleOrphanActiveTimer(){
  const m = DATA.activeTimer;
  if(!m || m.ended || !m.timerId || !m.startTs) return;
  if(m.paused) return;                       // 暂停是主动空闲，绝不误抢
  const lastBeat = _num(m.lastBeat) || 0;
  const now = Date.now();
  const prevDay = todayKey(_num(m.startTs)) !== todayKey();
  const ABANDON_MS = 10 * 60 * 1000;
  // 仅当「跨天」或「运行态心跳过期超过 10 分钟」才判定为遗弃（避免误杀短暂后台节流的正常计时）
  if(!(prevDay || (lastBeat && (now - lastBeat) > ABANDON_MS))) return;
  // 结算真实时长：结束点取 lastBeat（最后在线时刻），不把离线空隙算进学习时长
  const endTs = Math.min(lastBeat || now, now);
  let pause = _num(m.pauseAccum) || 0;
  if(m.pauseStart) pause += (endTs - _num(m.pauseStart));
  const durationSec = Math.max(0, Math.round((endTs - _num(m.startTs) - pause) / 1000));
  const dayKey = todayKey(_num(m.startTs));
  if(durationSec > 0 && !(DATA.sessions || []).some(s => s.timerId && s.timerId === m.timerId)){
    const names = (typeof resolveTimerNames === 'function')
      ? resolveTimerNames(m)
      : { moduleName: m.moduleName || '学习', subName: m.subName || '' };
    DATA.sessions = DATA.sessions || [];
    DATA.sessions.push({
      id: (typeof uid === 'function') ? uid() : ('s' + Date.now()),
      timerId: m.timerId, date: dayKey,
      moduleId: m.moduleId, subId: m.subId || m.moduleId,
      moduleName: names.moduleName, subName: names.subName,
      startTs: _num(m.startTs), endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
    });
  }
  DATA.activeTimer = { timerId: m.timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  if(typeof hubSave === 'function') hubSave();
  try{ document.dispatchEvent(new CustomEvent('hub:timer-state')); }catch(e){}
}
function initFloatTimer(){
  injectFloatTimer();
  settleOrphanActiveTimer();                        // 打开即清理被遗弃的计时（防 17 小时幽灵计时）
  syncFloatTimer();                                  // 若已有运行中的计时，立即显示
  document.addEventListener('hub:timer-state', syncFloatTimer);
  if(_floatTimerInterval) clearInterval(_floatTimerInterval);
  _floatTimerInterval = setInterval(syncFloatTimer, 1000);   // 每秒刷新 elapsed + 自愈 ended
}
/* 逻辑当前页（文件名的 .html）：软导航期间 location.pathname 滞后于真实目标页
   （pushState 在 runPageScript 之后才执行），若此刻 injectNav 按 pathname 算高亮会回退到旧页。
   故用本变量记录「真实当前页」，updateActiveNav 写入、injectNav 优先读取。 */
let _hubCurrentFile = null;

function initSoftNav(){
  if(_softNavReady) return;
  _softNavReady = true;
  document.addEventListener('click', onHubLinkClick);
  window.addEventListener('popstate', onHubPopState);
  // ⚡ 按下/悬停即预热（9/9 性能）：pointerdown 早于 click 触发，鼠标 hover 也提前几百 ms。
  //    只拉资源进内存缓存、不执行不渲染，与随后的软导航天然去重（navGetDoc 命中缓存直接返回）。
  /* 🔵 PERF-NAV-2B（10-26）：把「悬停」这一路补全 —— 原来只有 mouseover（冒泡到 document）+
     pointerdown，而**键盘 Tab 聚焦**和**触屏轻触**都拿不到预热。
     她 22:1x「每打开一个页面就要卡好久」：桌面用户把鼠标移向顶栏时，这段时间本来是免费的
     预热窗口；聚焦（Tab 键盘操作）同理，焦点落到链接上就说明大概率要按下去。
     做法：mouseenter 不冒泡 → 用 capture 挂在 document 上同样能收到；
     focusin（冒泡版 focus）覆盖键盘；click 前那几百毫秒足够把 HTML + 主脚本拉进内存。
     ⚠️ 仍然只预取、不执行不渲染；重复调用由 prefetchPage 内部 `_navDocCache.has` 去重。 */
  const warm = (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if(!a) return;
    const t = hubLinkTarget(a);
    if(t) prefetchPage(t.id);
  };
  document.addEventListener('pointerdown', warm, { capture: true, passive: true });
  document.addEventListener('mouseover', warm, { capture: true, passive: true });
  document.addEventListener('mouseenter', warm, { capture: true, passive: true });
  document.addEventListener('focusin', warm, { capture: true, passive: true });
}

/* 判断一个 <a> 是否指向已知站内页面；不是则返回 null（交回原生处理） */
function hubLinkTarget(a){
  if(!a || a.tagName !== 'A') return null;
  if(a.hasAttribute('download')) return null;
  const tgt = a.getAttribute('target');
  if(tgt && tgt !== '_self' && tgt !== '') return null;            // 新标签/指定窗口
  const href = (a.getAttribute('href') || '').trim();
  if(!href) return null;
  if(href.startsWith('#') || href.startsWith('?')) return null;    // 锚点 / 纯查询
  if(/^(https?:)?\/\//i.test(href)) return null;                   // 绝对/协议相对
  if(/^(mailto:|tel:|blob:|data:)/i.test(href)) return null;       // 非站内资源
  const file = normalizePageFile(href.split('#')[0].split('?')[0].split('/').pop());
  const page = PAGES.find(p => p.file === file);
  if(!page) return null;
  /* 🔴 10-24 G4：把查询串一起带回去。
     原来只回 page.file（裸文件名），于是 softNavigate 末尾那句 pushState 写的是裸文件名，
     把链接上原有的 ?pane= / ?sub= / ?drill= 一律抹掉：地址栏停在**上一个**分栏的参数，
     刷新回旧分栏、收藏与分享出去的网址也是错的（实测：点头像菜单「账号数据」，
     地址栏仍写着 pane=targets）。
     ⚠️ 但**取文档的那条路必须继续用裸文件名**：prefetchPage 按 p.file 预热、
     _navDocCache 以该串为键；拿带参数的串去 fetch，每个不同参数都要重新下一遍整页文档，
     预热永远命中不了（口语/写作页会被打成首屏变慢）。
     ⇒ 分家：href = 裸文件名（取文档 / 兜底整页跳转用），url = 原始完整串（只给 pushState 用）。 */
  return { id: page.id, file: page.file, href: page.file, url: href.split('#')[0] };
}

function onHubLinkClick(e){
  if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  /* 🔴 10/20 模考锁（第一道，位置最靠前）：**任何**站内链接都不能在模考中点走。
     ⚠️ 必须放在 hubLinkTarget() 判定**之前** —— 因为 login.html / meds.html /
     wrongbook.html（10-23 T-015 删页后）不在可用 PAGES 里（条目 hidden），
     hubLinkTarget 对它们返回 null → 早前的代码直接
     「放行：由浏览器原生处理」→ 整页跳转 → 模考连同已答内容全丢（实测复现：
     examRoot 从 6 个子节点变「不存在」，URL 跳 /login.html）。
     所以这里不能用「是否软导航目标」来判，只要 href 指向站内 .html 就拦。
     放行的白名单：外链协议 / 跨域 / 新标签 / 下载 / 锚点 / mailto|tel|blob|data。 */
  if(hubExamLocked()){
    /* ⚠️ a 可能为 null（点到非链接元素时 closest 返回 null）——
       `a && (...)` 的结果就是 null，后面再 .trim() 就炸（实测 pageerror:
       Cannot read properties of null (reading 'trim')，由探针 _probe_nextstep_1018 抓到）。 */
    const href = a ? (a.getAttribute('href') || '').trim() : '';
    if(a && href && !a.hasAttribute('download')){
      const tgt = a.getAttribute('target');
      const isExternal = /^(https?:)?\/\//i.test(href) || /^(mailto:|tel:|blob:|data:)/i.test(href);
      const isAnchor = href.startsWith('#') || href.startsWith('?');
      const isNewTab = tgt && tgt !== '_self' && tgt !== '';
      if(!isExternal && !isAnchor && !isNewTab){
        e.preventDefault();
        hubExamGuardNav();
        return;
      }
    }
  }
  const t = hubLinkTarget(a);
  if(!t) return;                 // 放行：由浏览器原生处理
  /* 🔴 10/20 模考锁：模考中点站内链接 = 换掉整个 <main> → 模考界面连同已答内容被销毁
     （实测 examRoot 直接消失，URL 跳走）。这里必须拦在软导航之前。 */
  if(hubExamGuardNav()){ e.preventDefault(); return; }
  e.preventDefault();            // 拦下，走软切换
  closeMoreSheet();             // 移动端：点任意站内链接即收起「更多」弹层
  /* 🔴 10-23 HOTFIX-2：点站内链接必关顶栏二级面板。
     不关的后果（实测复现「点模考出现计划的页面」）：面板是 position:fixed 浮层，
     软导航换 <main> 时不会重建导航（同壳换页不调 injectNav）→ 旧面板留在原位继续盖着内容区，
     她下一次点击落在面板里的子项上（plans.html?sub=today 等），于是去错页且毫无提示。 */
  try{ if(typeof tbCloseSub === 'function') tbCloseSub(); }catch(_){}
  try{ if(typeof tbCloseMe === 'function') tbCloseMe(); }catch(_){}
  updateActiveNav(t.file);       // ⚠️ 关键修复（导航高亮闪烁）：点击瞬间同步高亮目标模块，
                                  //    不等 fetch/脚本执行。否则在「点击→fetch→runPageScript(重脚本 eval)」
                                  //    这段异步窗口里，旧模块高亮仍挂着，表现为「先闪其他模块、再跳回」。
  /* 🔵 PERF-NAV-2A（10-26）：点击即反馈 —— 别让她「点了没反应」。
     她 22:1x 原话「每打开一个页面就要卡好久，而且还会跳回首页」。
     B 在线上实测：点顶栏后 0~1500ms 内 **URL 仍是 /home、标题仍是「首页」、内容还是首页**
     → 她看到的「跳回首页」其实就是「压根没走」。
     这里补三样**观感层**的即时反馈（都不改软导航契约）：
       ① 标题立刻换成目标页名（原来要等 pushState 之后才变）
       ② 顶部 2px 不确定进度条（已有高亮之外的第二重「正在动」信号）
       ③ 旧内容降到 40% 不透明（原来 showHubLoader 的遮罩要 HUB_LOADER_DELAY 才出，
          这中间是「完全没动静」；降透明度立刻给出变化，且不清空 main → 不白屏） */
  try{ if(t && t.file){ const pg = PAGES.find(x => x.file === t.file); if(pg && pg.name) document.title = pg.name + ' · 雅思备考 Hub'; } }catch(_){}
  try{ navPendingFeedback(true); }catch(_){}
  showHubLoader();                // 软导航异步窗口（fetch + 重脚本 eval）期间盖住，避免白屏闪烁
  softNavigate(t, false);
}

/* ===== PERF-NAV-2A（10-26）：软导航的「点击即反馈」三件 =====
   ① navPendingFeedback(on)：顶部 2px 不确定进度条 + 旧 main 降透明度
      · 进度条：body 直下的固定条，2px，纯 CSS 动画（不占布局、不引位移）
      · 降透明度：只动 opacity，**不清空 main** —— 白屏比「旧内容淡一点」更吓人
      · 幂等：重复调用只是重新计时；off 时必须清干净（含动画结束态）
   ② 与模考锁互斥：模考中根本不走软导航（第一道闸就拦了），所以这里不用再判。 */
let _navPendingTimer = null;
function navPendingFeedback(on){
  const bar = _ensureNavProgressBar();
  const main = document.querySelector('main');
  if(on){
    if(bar) bar.classList.add('on');
    if(main) main.style.opacity = '.4';
    if(_navPendingTimer) clearTimeout(_navPendingTimer);
    /* 兜底：万一某条路径忘了 off（异常/回退整页跳转前），6s 后自己收起，绝不能把页面留在半透明 */
    _navPendingTimer = setTimeout(() => { try{ navPendingFeedback(false); }catch(e){} }, 6000);
  }else{
    if(_navPendingTimer){ clearTimeout(_navPendingTimer); _navPendingTimer = null; }
    if(bar) bar.classList.remove('on');
    if(main) main.style.opacity = '';
  }
}
function _ensureNavProgressBar(){
  let el = document.getElementById('navProgress');
  if(el) return el;
  try{
    el = document.createElement('div');
    el.id = 'navProgress';
    el.setAttribute('aria-hidden', 'true');
    el.className = 'nav-progress';
    document.body.appendChild(el);
    return el;
  }catch(e){ return null; }
}

function onHubPopState(){
  /* 🔴 10/20 模考锁：浏览器后退键同样会离开考场 → 拦下并把状态条补回去。
     注意：popstate 触发时 URL 已经变了，这里用 pushState 把当前 URL 写回去（不刷新页面）。 */
  if(hubExamLocked()){
    try{ history.pushState({ hub: _hubCurrentFile || '' }, '', location.href); }catch(e){}
    hubExamGuardNav();
    return;
  }
  const file = normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  const page = PAGES.find(p => p.file === file);
  if(page) softNavigate({ id: page.id, file: page.file, href: file }, true);
  else location.reload();
}

/* 🔴 10/20 模考锁：popstate 只覆盖「同文档内后退」。
   若她的历史栈里 mod考前一页是**别的文档**（如从别的站外页进来、或刷新过），
   后退会直接卸载本文档 → 考场连同已答内容一起没了，popstate 根本来不及跑。
   beforeunload 是最后一道：模考中卸载 → 弹浏览器原生确认框（「离开后作答会丢失」）。
   ⚠️ 必须用 e.preventDefault() + e.returnValue = ''（现代浏览器要求 returnValue 非空才显示框），
   且这个框由浏览器原生渲染，不可定制文案 —— 这是唯一能拦住「跨文档离开」的机制。 */
window.addEventListener('beforeunload', function(e){
  if(!hubExamLocked()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});

/* ===== 软导航资源缓存（9/9 性能专项） =====
   旧实现：每次切 tab 都重新 fetch 目标页 HTML，再串行 fetch 该页每个脚本（cache:'no-cache' 强制重新下载）。
   口语页 6 个脚本 ≈210KB、写作页 ≈140KB —— 每次切换都重下一遍，慢网/手机下单次 1s+，
   这是「点各 tab 加载时间过长」的根因。
   现实现：HTML（已解析的 Document）与脚本源码进内存 Map：
   - 二次切同一页 = 零网络请求、零等待；
   - 首次也能命中「空闲预热」（见 prefetchAll）提前拉好的缓存；
   - 只活在当前会话（刷新即失效），部署新版（?v= 变化）不会被永久缓存住。 */
const _navDocCache = new Map();     // file -> { doc, v }（v=该页 HTML 引用的脚本版本，用于部署漂移检测）
const _navCodeCache = new Map();    // src  -> 源码文本
/* 🔵 PERF-NAV-2A（10-26）：20s → 5s。
   原来 20 秒才回退整页跳转 —— 慢网下等于「让她盯着旧页面最多 20 秒」，
   正是她说的「点了半天不动」。5 秒拿不到就走整页跳转：整页跳转虽然要重新加载，
   但**一定会到**，比无限等更符合预期。 */
const NAV_FETCH_TIMEOUT = 5000;
function navFetchOpts(){
  if(typeof AbortController === 'function'){
    const ac = new AbortController();
    setTimeout(() => ac.abort(), NAV_FETCH_TIMEOUT);
    return { cache: 'default', signal: ac.signal };
  }
  return { cache: 'default' };
}
/* 9/15 修「长驻标签页一直显示更新前的 UI」：内存缓存/已执行脚本只反映「本次 boot 时的版本」，
   标签页跨睡眠/跨部署不关闭时，软导航永远用旧文档+旧脚本（表现为 9/13 模考 tab 改版、十天内筛选修复等
   全部“没生效”），硬刷新才恢复。9/20 design/75 起改为「同页基线比对 + 探针兜底」两级自愈：
   ① 同页基线（navVersionCheck）：本会话内同一页指纹变化才算真部署；② 探针（navDeployProbe，权威）：
   线上 home.html（no-store）指纹 vs 启动指纹。动作端 soft heal=仅 reload，
   hard heal（注销 SW + 清空缓存）仅在「连续 ≥2 轮探针仍漂移」时执行一次。
   9/15 二修（之之实锤：本次只 bump 了 data.js/scores.js/common.css，common.js 没动 → 单点比对失效，
   回顾页首进旧渲染+旧样式、硬刷新才好）：指纹从 common.js 单点扩为「common.js + data.js + common.css」
   三项全局共有资产（14 页同 bump 部署纪律保证三项永远同步变），任一不同即自愈。 */
function assetVer(el){
  try{
    const ref = el.getAttribute('src') || el.getAttribute('href') || '';
    const m = ref.match(/v=([0-9a-z]+)/);
    return m ? m[1] : '';
  }catch(e){ return ''; }
}
function assetSig(root){
  try{
    const parts = [];
    /* 10/19 共享外壳拆成 7 块后，指纹必须覆盖**全部 common-*.js**：只盯 common.js 的话，
       某次只改了 common-shell.js 这类块而没动 common.js 时，本函数察觉不到部署漂移
       （9/15 就是「只 bump 了 data.js/scores.js/common.css」导致单点比对失效的事故）。 */
    root.querySelectorAll('script[src^="js/"]').forEach(el => {
      const base = (el.getAttribute('src') || '').split('?')[0];
      if(base === 'js/data.js' || base === 'js/common.js' || base.indexOf('js/common-') === 0){
        parts.push(base.replace(/^js\//, '') + ':' + assetVer(el));
      }
    });
    const css = root.querySelector('link[href*="common.css"]');
    parts.push('common.css:' + (css ? assetVer(css) : ''));
    return parts.join('|');
  }catch(e){ return ''; }
}
const BOOT_SCRIPT_V = assetSig(document);
function docScriptVersion(doc){
  return assetSig(doc);
}
let _navSelfHealing = false;
/* 9/20 design/75 自愈去核武器化——SW v14 的分级缓存已是正式离线能力，9/4「SW 是故障源」时代的
   「注销 SW + 清空全部 CacheStorage」核武动作降级为独立的 hard heal，只在「连续多轮探针仍报漂移、
   普通 reload 无法恢复（真 SW 缓存病态）」时才执行一次。常规自愈（soft heal）只 reload。 */
function navSelfHealReload(){
  if(_navOfflineHold) return;               // design/79 离线闸：离线期间不自愈（探针必失败，reload 只会连放）
  if(_navSelfHealing) return;
  /* 🔴 10-23 HOTFIX 部署风暴：软导航进行中绝不自愈 reload。
     pushState 在 runPageScript 之后才执行 —— 导航中途 reload 会落在**旧页 URL** 上，
     她感知到的就是「点进一个子页面又突然弹回别的页面」。改为：导航中的漂移只记录，
     由周期探针（现 10 分钟一探）在页面稳定后收口。 */
  if(_softNavBusy){ console.warn('[hub] 软导航进行中 → 本次自愈推迟（不打断切换）'); return; }
  /* 🔴 10/20 模考锁：自愈 reload 会把正在模考的人整页刷出去（=「莫名其妙弹出去」）。
     探针周期 10-23 起从 60s 放宽到 10min（见 navDeployProbe），她只要在模考里待够几分钟，
     探针一探到线上有新版就 navSelfHealReload() → location.reload() → 考场连同已答内容全没。
     修法：模考中**推迟**自愈（把「现在不能刷」记下来），交卷/退出模考后若仍需要再刷。
     ⚠️ 用「延迟」而不是「跳过」：否则她退出模考后会一直卡在旧版本，
     直到下次用户手动刷新（那正是 10/8「卡旧版整晚」事故的形态）。 */
  if(typeof hubExamLocked === 'function' && hubExamLocked()){
    _hubPendingHeal = true;
    console.warn('[hub] 模考进行中 → 推迟自愈刷新（考完再刷）');
    return;
  }
  try{
    const last = Number(sessionStorage.getItem('hub_nav_v_rl') || 0);
    if(Date.now() - last < 300000) return;   // 10-23 HOTFIX：5 分钟内已自愈过不再 reload（原 60s，部署密集日会连环刷）
    sessionStorage.setItem('hub_nav_v_rl', String(Date.now()));
  }catch(e){ return; }                       // sessionStorage 不可用（隐私模式等）→ 放弃自愈，绝不敢乱 reload
  _navSelfHealing = true;
  location.reload();                         // 整页刷新：内存缓存随会话重建，新 HTML+JS 全量生效
}
/* hard heal（核武，仅 navDeployProbe 在 sessionStorage 计数 ≥2 时调用一次并清零计数）：
   注销 SW + 清空 CacheStorage + reload。SW v14 的 SWR / network-first / SW_UPDATED 机制本身不动。 */
function navHardHeal(){
  if(_navOfflineHold) return;               // design/79 离线闸：离线期间绝不注销 SW / 清缓存
  /* 🔴 NAV-HEAL-GUARD-1（10-27）：软自愈 navSelfHealReload 早就有这两道守卫，**硬自愈一条都没有** ——
     而 hard heal 比软 reload 更狠（注销 SW + 清空 CacheStorage），一旦在软导航中途或模考里放出去，
     后果是一模一样的「点进去又弹回来」/「考场连同已答内容全没」，只是恢复代价更高。
     所以这里补齐同样两道，**只加守卫、不改现有行为**：
       ① 软导航进行中 → 本次推迟（pushState 还没落，现在刷会回落到旧页 URL，她感知就是「弹回首页」）；
       ② 模考进行中 → 推迟并记 pending（考完再刷，与软自愈同口径，避免「卡旧版整晚」）。
     ⚠️ 用「推迟」不用「跳过」：跳过会让她停在旧版本直到手动刷新。 */
  if(_softNavBusy){ console.warn('[hub] 软导航进行中 → 本次硬自愈推迟（不打断切换）'); return; }
  if(typeof hubExamLocked === 'function' && hubExamLocked()){
    _hubPendingHeal = true;
    console.warn('[hub] 模考进行中 → 推迟硬自愈（考完再刷）');
    return;
  }
  try{
    const lastHard = Number(sessionStorage.getItem('hub_nav_hard_rl') || 0);
    if(Date.now() - lastHard < 1800000) return;   // 10-23 HOTFIX：30 分钟内只允许一次核武（原 60s；每次核武=整站缓存清空重下，慢网下就是数分钟卡顿）
    sessionStorage.setItem('hub_nav_hard_rl', String(Date.now()));
    sessionStorage.setItem('hub_nav_v_rl', String(Date.now()));   // 记入节流：hard heal 后 60s 内不再软自愈
    sessionStorage.setItem('hub_nav_heal_n', '0');                // 清零漂移计数
  }catch(e){ return; }
  _navSelfHealing = true;
  console.warn('[hub] 硬自愈：连续多轮探针漂移且 reload 无法恢复，注销 SW 并清空缓存重建');
  try{
    if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
      navigator.serviceWorker.getRegistrations().then(rs => (rs || []).forEach(r => { try{ r.unregister(); }catch(_){} })).catch(function(){});
    }
    if(window.caches && caches.keys){
      caches.keys().then(ks => (ks || []).forEach(k => { try{ caches.delete(k); }catch(_){} })).catch(function(){});
    }
  }catch(e){}
  location.reload();
}
/* 9/20 design/75 检测端重写：「目标页指纹 vs BOOT_SCRIPT_V 跨页比对」在分页 buster 时代是设计缺陷
   —— 某页 buster 与 boot 页静态不同（9/20 任务二漏改部分页 css buster 就真实发生过）→ 每次软导航
   都误判部署漂移 → 核武自愈把离线能力整体打残。现改「同页基线比对」：
   - 内存命中：不比对（命中即本会话已确认过该页）；
   - 网络获取：与 _navDocCache 中同 file 旧记录的指纹比，不同 = 本会话内该页确实发生部署 → 自愈；
   - 首次获取该页（无基线）绝不比对 —— 分页 buster 静态不一致因此永不触发。
   权威兜底仍是 navDeployProbe（home.html no-store vs BOOT_SCRIPT_V，SW 对 _probe 已透传）。 */
function navVersionCheck(file, doc){
  const prev = _navDocCache.get(file);
  if(!prev || !prev.v) return;               // 首次获取该页：没有同页基线，绝不比对
  const v = docScriptVersion(doc);
  if(!v || v === prev.v) return;
  /* 🔴 10-23 HOTFIX 部署风暴：软导航途中的「同页基线漂移」只记录不打断。
     原实现这里直接 navSelfHealReload() → 正在切换的路上整页 reload →
     URL 还停在旧页（pushState 未执行）→ 她看到「点进 A 页又弹回 B 页」。
     现在：软导航中只更新基线（下次该页走内存缓存，不会再误判），
     版本收口交给 navDeployProbe 在页面稳定后的下一轮探测。 */
  console.warn('[hub] 检测到本页部署更新（基线 ' + prev.v + ' / 最新 ' + v + '）' + (_softNavBusy ? ' · 软导航中，不打断切换，等周期探针收口' : '，自动刷新以加载新版'));
  if(!_softNavBusy) navSelfHealReload();
}
/* 9/15 二修补充——内存命中路径的残余漏洞：缓存命中时校验的是「缓存文档 vs 启动指纹」，
   部署“之前”就已缓存的页面二者相同，永远检不出漂移（之之实锤：回顾页跨部署二次进入仍是旧渲染）。
   现补后台部署探针：每次软导航触发（60s 节流）拉一次最新 home.html（no-store 绕过一切缓存），
   解析资产指纹与启动指纹比对，不同 → navSelfHealReload。探测不阻塞导航（fire-and-forget），
   60s 内多次切换只发一次请求，成本近乎为零。 */
let _probeAt = 0, _probeBusy = false, _probeHandledThisBoot = false;

/* ===== design/79 离线状态灯 + 自愈第三道闸（离线闸） =====
   SW v25 已让全站离线可用（navigate 走缓存、静态 SWR），但断网时她完全无感知：分不清
   「背单词生词卡住了」还是「网络挂了」，AI 功能（口语诊断/翻译）断网必失败会以为是自己 Key 出问题。
   本段只做两件事：
   ① 状态灯：offline 立即显示「当前离线 · 已显示缓存内容」，online 延迟 1.5s 收起
      （弱网下 online/offline 会瞬时抖动，立即收起会「闪一下就没了」），常驻至恢复，不是 toast；
   ② ⭐ 自愈第三道闸 _navOfflineHold：navDeployProbe 是网络请求，断网必失败；不闸住就会出现
      「断网→探针判漂移→reload→再断网…」的连放风暴（与 9/20 那次数十次硬自愈同源）。
      离线期间不判定/不计数/不 reload；恢复时清空漂移计数（断网期的「漂移」是假象，不该累积）。
   ⚠️ 与 design/75 的两道防风暴闸门（_probeHandledThisBoot 每 boot 一次 + hard heal 60s 封顶）
      是叠加关系：本闸只新增，不删改前两道。
   节点直挂 body（软导航只换 <main>，天然不被误删），id 单例 + ensure-once，重复渲染不叠加。
   ⭐ 与 design/78（SW 更新提示）互斥：78 接进来时，「发现新版本」提示只允许在
      setOfflineState(false) 收起离线条之后显示（离线不可能有新版可刷）。 */
const OFFLINE_BAR_ID = 'offlineBar';
const OFFLINE_BAR_TEXT = '当前离线 · 已显示缓存内容';
let _navOfflineHold = false;      // true = 离线期：自愈判定/计数/reload 一律不执行
let _isOffline = false;           // 当前网络态（状态灯只在 true 时存在）
let _offlineHideTimer = null;     // online 后的延迟收起计时器
function setOfflineState(isOffline){
  _isOffline = !!isOffline;
  if(_isOffline){
    if(_offlineHideTimer){ clearTimeout(_offlineHideTimer); _offlineHideTimer = null; }
    _navOfflineHold = true;                       // 先落闸，再渲染（渲染异常也不能漏闸）
    try{ if(document.body) renderOfflineBar(); }catch(e){}
  } else {
    // 重连：断网期间的漂移计数是假象 → 清零（键名以自愈实测为准：hub_nav_heal_n）
    try{ sessionStorage.setItem('hub_nav_heal_n', '0'); }catch(e){}
    if(_offlineHideTimer) clearTimeout(_offlineHideTimer);   // 抖动连发 online：只保留最后一个计时器
    _offlineHideTimer = setTimeout(() => {
      _offlineHideTimer = null;
      _navOfflineHold = false;                    // 延迟撤闸：给网络一个稳定窗口，再允许自愈判定
      removeOfflineBar();
      /* design/78 接入口：此处（已在线且离线条已收起）才允许显示「发现新版本 · 点此刷新」。 */
    }, 1500);
  }
}
function renderOfflineBar(){
  if(!document.body || document.getElementById(OFFLINE_BAR_ID)) return;   // 单例：已存在不重复插
  const el = document.createElement('div');
  el.id = OFFLINE_BAR_ID;
  el.className = 'offline-bar';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = OFFLINE_BAR_TEXT;
  document.body.appendChild(el);
}
function removeOfflineBar(){
  const el = document.getElementById(OFFLINE_BAR_ID);
  if(el && el.parentNode) el.parentNode.removeChild(el);
}
function initOfflineBar(){
  if(window.__offlineBarBound) return;            // 一次性守卫：软导航/重复调用不叠加监听
  window.__offlineBarBound = true;
  window.addEventListener('offline', () => setOfflineState(true));
  window.addEventListener('online',  () => setOfflineState(false));
  if(navigator.onLine === false) setOfflineState(true);   // 冷启动即断网（事件不会补发）
  // 兜底轮询：部分代理/VPN 环境不触发 online/offline 事件。只读 navigator.onLine，不发任何请求。
  setInterval(() => {
    const off = (navigator.onLine === false);
    if(off !== _isOffline) setOfflineState(off);
  }, 30000);
  /* ⭐ 10/8 晚：部署探针补第四触发源——定时器。
     此前 navDeployProbe 只在软导航时触发（navGetDoc），她今晚整晚停在写作页里点 tab/考试，
     没有任何软导航 → 自愈永远不跑 → 卡旧版整晚（10/8 第五次事故的直接放大器）。
     🔴 10-23 HOTFIX 部署风暴：周期从 60s 放宽到 10min。
     背景 = 施工进入多窗口流水线（当日 08:20~20:26 共 31 次 SW bump，平均 23 分钟一次），
     60s 一探意味着「每次部署后的 1 分钟内她必被自动刷新一次」，再叠上 SW activate 的
     c.navigate 强刷与 hard-heal 清缓存，就是她报的「闪来闪去 / UI 时好时坏 / 特别卡」。
     10min 探测下更新最多延迟 10 分钟生效——远优于每小时被打断数次。
     （函数自带节流 + 每 boot 一次升级闸 + 离线闸 + 5min 自愈冷却，防风暴闸门全部沿用。） */
  setInterval(() => {
    try{ if(typeof navDeployProbe === 'function' && !_navOfflineHold) navDeployProbe(); }catch(e){}
  }, 600000);
  // 首探延后 2min：给 boot 自身的 PRECORE/同步让路（她的慢网络），避免开机就抢带宽
  setTimeout(() => { try{ if(!_navOfflineHold) navDeployProbe(); }catch(e){} }, 120000);
}

function navDeployProbe(){
  if(_navOfflineHold) return;   // design/79 离线闸：离线期间不探测（不判定、不计数、不 reload）
  // 节流间隔可由 localStorage hub_probe_interval 覆盖（回归测试注入短间隔用；普通用户无此 key = 10min）
  let iv = 600000;
  try{ iv = Number(localStorage.getItem('hub_probe_interval')) || 600000; }catch(e){}
  if(_probeBusy || Date.now() - _probeAt < iv) return;
  _probeAt = Date.now(); _probeBusy = true;
  fetch('home.html?_probe=' + Date.now(), { cache: 'no-store' })
    .then(r => (r && r.ok) ? r.text() : '')
    .then(t => {
      _probeBusy = false;
      if(!t || !BOOT_SCRIPT_V) return;
      const doc = new DOMParser().parseFromString(t, 'text/html');
      const v = docScriptVersion(doc);
      if(v && v !== BOOT_SCRIPT_V){
        // ⭐ 每个 boot 只做一次升级判定：prefetchAll 会在同一 boot 内连打多轮探针
        //   （本地把 hub_probe_interval 压到 400ms 时一 boot 能打十几轮），
        //   不闸门的话计数会被瞬间刷到 2 → 核武连放、reload 风暴。
        if(_probeHandledThisBoot) return;
        _probeHandledThisBoot = true;
        // 漂移轮数（sessionStorage，跨 reload 保留）：≥2 说明普通 reload 无法恢复 → 才升级为 hard heal
        let n = 0;
        try{ n = Number(sessionStorage.getItem('hub_nav_heal_n') || 0); }catch(e){}
        n += 1;
        try{ sessionStorage.setItem('hub_nav_heal_n', String(n)); }catch(e){}
        // 🔴 10-23 HOTFIX 部署风暴：软导航进行中不打断（pushState 未落 → reload 会弹回旧页）。
        //    导航中的漂移本 boot 已被 _probeHandledThisBoot 记录，页面稳定后的下一轮探测会再收口。
        if(_softNavBusy){ console.warn('[hub] 探针检测到站点已更新（运行 ' + BOOT_SCRIPT_V + ' / 线上 ' + v + '）· 软导航中，本轮不打断，等页面稳定后收口'); return; }
        console.warn('[hub] 探针检测到站点已更新（运行 ' + BOOT_SCRIPT_V + ' / 线上 ' + v + '）' +
          (n >= 2 ? '，连续 ' + n + ' 轮未恢复 → 硬自愈' : '，自动刷新'));
        if(n >= 2){ navHardHeal(); return; }
        navSelfHealReload();
      } else {
        // 探针确认线上指纹与运行指纹一致 → 清零漂移计数（离线/取不到响应时不动计数，见 catch）
        try{ sessionStorage.setItem('hub_nav_heal_n', '0'); }catch(e){}
      }
    })
    .catch(() => { _probeBusy = false; });
}
function navCached(file){ return _navDocCache.has(file); }
async function navGetDoc(file){
  navDeployProbe();                        // 后台部署探针（节流）：内存命中路径也绕不开的漂移检测
  if(_navDocCache.has(file)){
    const hit = _navDocCache.get(file);
    return hit.doc;                            // 内存命中不再比对：同页基线机制下命中即本会话已知状态
  }
  const res = await fetch(file, navFetchOpts());   // 走 HTTP 缓存：未变动 304，部署后 ?v= 变化拿新
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  navVersionCheck(file, doc);                  // 与同页旧基线比对，首获该页不比对
  _navDocCache.set(file, { doc, v: docScriptVersion(doc) });
  return doc;
}
async function navGetCode(src){
  if(_navCodeCache.has(src)) return _navCodeCache.get(src);
  const res = await fetch(src, navFetchOpts());
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const code = await res.text();
  _navCodeCache.set(src, code);
  return code;
}
/* 目标页要执行的脚本清单（按 HTML 声明顺序；主脚本下标记在 list.mainIdx）
   ⚠️ 9/15 之之实锤：旧版强制「主脚本在前」，破坏 HTML 声明顺序——speaking.html 里
   sentence-drill.js（顶层置 window.__SENT_V2_ON 旗）声明在 speaking.js 之前，
   软导航首进时 speaking.js 先 eval、读到旗还是 undefined → 默认落空 pdView（页面空白），
   第二次进时旗已在 window 残留为 true 才正常。必须严格按声明顺序 eval。 */
function pageScriptSources(id, doc){
  const list = [];
  const mainBase = 'js/' + id + '.js';
  let mainSrc = mainBase;
  if(doc){
    const s = doc.querySelector('script[src*="' + mainBase + '"]');
    if(s && s.getAttribute('src')) mainSrc = s.getAttribute('src');
  }
  let mainIdx = -1;
  if(doc){
    doc.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src');
      if(!src || !src.startsWith('js/')) return;
      const base = src.split('?')[0];
      /* 10/19：共享外壳已拆成 js/common.js + 6 块 js/common-*.js，它们和 data.js 一样是
         「全局共享」而不是页面脚本 —— 漏排任何一块，那一块都会被当成页面脚本在每次软导航时
         重跑一遍（云同步 / 软导航自身被重复初始化 → 监听器与心跳叠加）。 */
      if(base === 'js/data.js' || base === 'js/common.js' || base.indexOf('js/common-') === 0) return;
      if(base === mainBase){ mainIdx = list.length; list.push(mainSrc); return; }
      if(list.indexOf(src) === -1) list.push(src);
    });
  }
  /* 🔴 10/4 18:42 组页（plans-hub / study / me）共用 js/hubgroup.js，**没有** js/{id}.js。
     原写法 `if(mainIdx === -1){ list.unshift(mainSrc) }` 会把一个**不存在的 js/study.js**
     硬塞进清单最前 -> 软导航时必然吃一发 404（虽然有 catch 静默，但会拖慢且污染控制台）。
     正解：doc 存在且里面**确实声明了别的业务脚本**时就不补 mainSrc（那些声明才是真脚本）；
     只有 doc 缺失（fetch 失败）才退回按 id 猜。 */
  if(mainIdx === -1){
    if(doc){
      if(list.indexOf(mainSrc) === -1 && list.length > 0) mainIdx = 0;   // 已有声明 -> 用它，不补
      else if(list.length === 0) throw new Error('no-script:' + id);     // 一个都没有 -> 交由上层兜底
    }else{
      list.unshift(mainSrc); mainIdx = 0;   // doc 缺失才退回按 id 猜
    }
  }
  list.mainIdx = mainIdx;
  return list;
}

async function softNavigate(t, isPop){
  /* 🔴 10/20 模考锁（最后一道兜底）：softNavigate 会被点击、popstate、以及各页的
     程序化调用（bank.js spkStartMock / writing / speaking 入口）触发。
     统一在最外层拦一次 —— 任何来源的「离开考场」都走同一条闸。 */
  if(hubExamGuardNav()) return;
  if(_softNavBusy){ if(typeof toast === 'function') toast('页面切换中，请稍候…'); return; }
  _softNavBusy = true;
  _lastNavAt = Date.now();   // 10/8 导航优先：同步三路流量让路（见 navBusyGrace 注释）
  /* 🔴 10/20 模考锁的「残留保险」：软导航能走到这里，说明**没被模考锁拦住**（正常路径）。
     那就把锁显式清掉 —— 万一之前有别的路径（比如某页直接改 DOM、某处 history.pushState）
     把锁留在开着的状态，换页后新页面会被「门锁死」（导航全被拦、她哪都去不了）。
     ⚠️ 顺序很重要：解锁放在 hubExamGuardNav() 之后 —— 模考中点链接仍必须被拦住。
     副作用检查：解锁时 flushHeal 不传 → 不会触发待刷新（那由模考页自己的 exit 路径处理）。 */
  try{ hubExamLock(false, '', false); }catch(e){}
  try{
    if(window.matchMedia && window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
    hubClearOrphanPageTimers();   // P0-A：离开旧页前清掉残留的计时/服药轮询心跳，避免软导航重进页面叠加“多个计时器同时跑 / 数字乱跳”
    // 命中内存缓存时这一步是同步的（微任务级），零网络、零等待
    const doc = await navGetDoc(t.href);
    const newMain = doc.querySelector('main');
    const main = document.querySelector('main');
    if(!newMain || !main) throw new Error('目标页缺少 <main>');
    await swapPageStyles(doc, t.id);                    // 同步页面专属样式（内联 <style> + css/p/*.css），避免样式丢失/串页
    main.innerHTML = newMain.innerHTML;                 // 只换内容区，侧边栏/全局状态保留
    /* 🔵 PERF-NAV-2A（10-26）：内容已经换成目标页了 → 立刻把「半透明等待态」收掉。
       不等脚本 eval 完（那还要一会儿），先把观感恢复成正常不透明；
       进度条留到 runPageScript 结束再收（hideHubLoader 那一行会一起收）。 */
    try{ if(main) main.style.opacity = ''; }catch(e){}
    if(doc.title) document.title = doc.title;
    /* 🔴 10/6 01:12 「当前页身份」在这里一次性对齐 —— 覆盖**全部入口**（点击 / 后退 / 直接调用 softNavigate）。
       原来只有 onHubLinkClick 会写 _hubCurrentFile，popstate（浏览器后退）那条路根本不写 → 身份滞后。 */
    _hubCurrentFile = t.file;
    /* 10-26 KIMI-THEME-1：三套外观跨页生效 —— 软导航只换 <main>，<html> 上的 data-scheme 不会自己跟着换。
       放在 _hubCurrentFile 已写之后，并且把**目标页文件名**显式传进去（此刻 location 还没换，
       与「runPageScript 先于 pushState」是同一个时序坑）。bank.html 由 applyScheme 自己删属性。 */
    try{ if(typeof applyScheme === 'function') applyScheme(t.file); }catch(e){}
    /* 🔴 design/113A3a 落地批：home 用顶栏、其他页用侧栏，而软导航只换 <main> 不重建导航。
       跨边界（home↔其他页）必须补一次 injectNav 换壳，否则从 home 进 bank 会顶着
       首页的顶栏（侧栏永不渲染）、从 bank 回 home 会留着侧栏（顶栏永不出现）。
       放在 _hubCurrentFile 已写之后：injectNav 重读它 → 渲染正确外壳 + 正确高亮。
       重建只发生在跨边界那一次（顶栏 44px / 侧栏一次性重建，观感等价整页跳转但无刷新）。
       点击路径有 showHubLoader 遮住；popstate 路径在内容交换后同帧完成，无可感闪烁。 */
    /* 🔴 10-22 全站换顶栏（design/116 第 0 批）：壳现在由**目标页自己**的 <body data-shell="top"> 决定，
       不再写死 home。软导航只换 <main>，body 属性不会跟着变 → 跨壳边界时必须先把属性同步过来再重建导航，
       否则就是「内容是新页、壳还是上一页的」（这个坑 homea3a 那批已经实锤过一次）。
       hub-home 仍只表示「首页驾驶舱」：从首页进组页时壳没变、但布局类必须摘掉，所以也进同一个判断。 */
    try{
      const _wantTop  = !!(doc.body && doc.body.getAttribute('data-shell') === 'top');
      const _hasTop   = document.body.getAttribute('data-shell') === 'top';
      const _wantHome = (t.file === 'home.html');
      const _hasHome  = document.body.classList.contains('hub-home');
      if(_wantTop !== _hasTop || _wantHome !== _hasHome){
        if(_wantTop) document.body.setAttribute('data-shell', 'top');
        else document.body.removeAttribute('data-shell');
        if(typeof injectNav === 'function') injectNav();
      }else if(typeof updateActiveNav === 'function'){
        /* 壳没变（例如「首页 → 我的组」都是顶栏）→ 不重建导航（重建会重复绑监听），
           但高亮必须跟着走，否则顶栏一直亮着上一页。 */
        updateActiveNav(t.file);
      }
    }catch(e){ console.error('[soft-nav] 导航换壳失败', e); }
    syncBodyPageAttrs(doc);
    /* 🔴 10-23 HOTFIX-2：软导航换完内容后，把顶栏浮层统一收口。
       这条是**兜底**：点击路径已在 onHubLinkClick 关过，但 popstate（浏览器后退）与
       各页程序化调用 softNavigate 的路径不经过那里 —— 旧面板会继续浮在新页面上（幽灵热区）。 */
    try{ if(typeof tbCloseSub === 'function') tbCloseSub(); }catch(_){}
    try{ if(typeof tbCloseMe === 'function') tbCloseMe(); }catch(_){}
    try{ closeMoreSheet(); }catch(_){}
    /* 🔴 10/6 01:55 换页必须回到顶部 —— 修「每次点进单词页都默认滑在底部，学习和词库被遮住」。
       移动端真正的滚动容器是 `main.container`（css/common.css ≤860px 段给它 overflow-y:auto），
       软导航只换 `main.innerHTML`、**容器本身没被替换**，于是上一页的 scrollTop 原样带过来。
       浏览器原生的「新文档从顶部开始」在这里不成立，得自己归零。 */
    hubResetPageScroll();
    // ⚠️ 性能修复（口语/写作打开卡顿）：runPageScript 会 eval 2140 行的 speaking.js + 4 个附加脚本并同步渲染
    //    官方题库/P2/P3 诊断树，若直接 await 会阻塞主线程、画面“冻住”。先让本次内容交换 + 高亮先 paint，
    //    再用 requestAnimationFrame 把重脚本执行推到下一帧，打开即流畅。
    //    兜底：rAF 在后台标签页会被暂停（注释承诺过 setTimeout 兜底但原实现没有）→ rAF + 50ms 定时器竞速，
    //    哪个先到都放行，绝不因标签失焦把软导航永久卡死（_softNavBusy 无法释放）。
    await new Promise(res => {
      let done = false;
      const fin = () => { if(!done){ done = true; res(); } };
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(fin);
      setTimeout(fin, 50);
    });
    await runPageScript(t.id, doc);                     // 重新执行目标页脚本（复用 ready + 事件绑定）
    // ⚠️ 不再在这里二次 updateActiveNav：点击瞬间(onHubLinkClick)已写好正确高亮，
    //    page 脚本经代码审计确认不触碰侧栏 .active，二次写只会增加一次无效重绘、
    //    在重脚本 eval 阻塞主线程后触发“高亮闪一下”的观感。单一写入点 = 零闪烁。
    if(!isPop) history.pushState({ hub: t.id }, '', t.url || t.href);
    prefetchAll(t.id);
    try{ navPendingFeedback(false); }catch(e){}        // PERF-NAV-2A：进度条与半透明一起收
    hideHubLoader();                                   // 内容切换 + 脚本执行完毕（DOM 就绪）→ 淡出遮罩
  }catch(err){
    console.warn('[soft-nav] 软切换失败，回退整页跳转：', err);
    try{ navPendingFeedback(false); }catch(e){}        // PERF-NAV-2A：回退前必须收掉等待态，否则整页跳走后也不该留残影
    location.href = t.href;                            // 兜底：绝不让导航“卡死”
  }finally{
    _softNavBusy = false;
    _lastNavAt = Date.now();   // 10/8 导航优先：宽限窗口从导航结束起算
    hideHubLoader();                                   // 兜底：任何异常路径下都不残留遮罩
  }
}

/* 软导航时同步目标页的「页面专属样式」：内联 <style> + 外链样式表（css/p/*.css）。
   🔴 10/18 修（她 9 张手机截图报「这些页面 UI 都有问题」的根因）：
   原实现只克隆 <head> 里的 <style>，对 <link rel="stylesheet" href="css/p/xxx.css"> 完全不管。
   于是从底栏/侧栏点进去的页面一直挂着**上一页**的专属样式表，本页的从未加载 ——
   设置页主题开关涨成 225×230 的一团、口语模考计时圆弧占半屏、学习热力图每格撑满整行、
   模考记录日期竖着排……全是「缺本页样式」的同一个病。
   修法：切页时把旧页的 css/p/*.css 摘掉、换成目标页的；新表 onload 之后才摘旧的 → 不闪、不丢样式。 */
async function swapPageStyles(doc, pageId){
  document.querySelectorAll('style[data-hub-style]').forEach(el => el.remove());
  doc.querySelectorAll('head style').forEach((style, idx) => {
    const clone = style.cloneNode(true);
    clone.setAttribute('data-hub-style', pageId + '-' + idx);
    document.head.appendChild(clone);
  });
  const isPageCss = el => (el.getAttribute('href') || '').indexOf('css/p/') >= 0;
  const nextHrefs = [...doc.querySelectorAll('link[rel="stylesheet"]')]
    .map(l => l.getAttribute('href') || '').filter(h => h.indexOf('css/p/') >= 0);
  const oldLinks = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(isPageCss);
  if(nextHrefs.join('|') === oldLinks.map(l => l.getAttribute('href')).join('|')) return;
  await Promise.all(nextHrefs.map(href => new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-hub-css', pageId);
    let done = false;
    const fin = () => { if(!done){ done = true; res(); } };
    l.onload = fin;
    l.onerror = fin;
    document.head.appendChild(l);
    setTimeout(fin, 4000);   // 兜底：慢网/加载失败也不让软导航卡住
  })));
  oldLinks.forEach(el => el.remove());
}

/* 更新侧边栏高亮（不重建侧边栏，避免丢失滚动位置/搜索态） */
function updateActiveNav(file){
  if(file) _hubCurrentFile = file;   // 软导航先把真实当前页记下来，避免后续 injectNav 按滞后 pathname 错配高亮
  const nav = document.getElementById('mainNav');
  if(nav){
    nav.querySelectorAll('.side-item').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === file);
    });
    /* design/113A3a：home 顶栏胶囊 + 「更多」面板条目高亮（与 .side-item 同一写入点）
       10-22：文件→胶囊的归属映射走 capActiveFile（学习组亮「单词」等），保证与顶栏渲染同口径 */
    const _capFile = (typeof capActiveFile === 'function') ? capActiveFile(file) : file;
    nav.querySelectorAll('.tb-item').forEach(a => {
      a.classList.toggle('on', a.getAttribute('href') === _capFile);
    });
    nav.querySelectorAll('.tb-more-item').forEach(a => {
      a.classList.toggle('on', a.getAttribute('href') === _capFile);
    });
  }
  // 同步「更多」弹层高亮（design/56；旧 tabbar 高亮已随组件删除）
  document.querySelectorAll('.sheet-item[data-id]').forEach(a => {
    const p = PAGES.find(pp => pp.id === a.dataset.id);
    a.classList.toggle('active', !!(p && p.file === file));
  });
  /* 🔴 10/4 17:55 dock 分组后，dock 的高亮**不能**再靠 `.ui-menu-item[data-id]` ——
     组按钮（计划/学习/我的）没有 data-id（它们是 button，data-id 只在直达型上）。
     原写法会让软导航后 dock **一个都不亮**（探针实锤：从学习组点进 writing.html，
     路径对了但 dock 全灰）。修：按「当前页属于哪个组」来点亮。
     —— 仍走 updateActiveNav 这个单一写入点，避免闪烁。 */
  if(typeof dockGroupOfPage === 'function'){
    const gid = dockGroupOfPage(file);
    document.querySelectorAll('#hubDock [data-dock-group]').forEach(b => {
      b.classList.toggle('active', !!gid && b.getAttribute('data-dock-group') === gid);
    });
  }
}

/* ===== Q-6（10-24）eval 输入面收紧 =====
   🔴 前提：**不能删 eval、不能撤 unsafe-eval**。两处 eval 是软导航的承重墙 ——
      · 下面 srcs 循环 = 换页时重跑目标页 script[src]（不跑的话口语/写作/设置页的 tab 全是死的）
      · 下面 inlineCodes 循环 = 重跑 body 内联脚本（10/6「按钮点不了」的真根因）
   所以改「只收紧输入面」：eval 之前先确认这段代码**确实来自本站 HTML 声明**，而不是任何
   用户输入 / 远程可写内容（URL 参数、localStorage、剪贴板、API 回包等）。
   三道校验，任一不过就拒绝并 warn，绝不 eval：
     ① 脚本 URL 必须是本站相对路径 js/*.js，且不含协议/跨域/查询串之外的怪东西
     ② 拿到的源码必须是「看起来真的是一段 JS」（非 HTML 文档 / 非空 / 不带 <script 包裹）
     ③ 内联脚本只接受 body 里的（pageInlineScripts 已保证），且同样过 ② 的形态校验
   ⚠️ 校验失败一律**跳过这一块**而不是让软导航整页跳转 —— 附加脚本失败原本就是 skip 语义；
      只有主脚本失败才抛（保持原有兜底路径）。 */
function hubEvalSourceOk(src){
  try{
    const s = String(src || '').trim();
    if(!s) return false;
    /* ① 相对路径 + js/ 前缀；禁协议相对、绝对 URL、跨域、data/blob（这些都不是页面声明的脚本） */
    if(/^(https?:)?\/\//i.test(s)) return false;
    if(/^(data:|blob:|javascript:)/i.test(s)) return false;
    if(s.indexOf('../') >= 0) return false;          // 不许爬出站点根
    if(s.charAt(0) === '/') { /* 允许 /js/xxx.js 形式 */ }
    const pathOnly = s.split('?')[0].split('#')[0];
    return /^\/?js\/[A-Za-z0-9._-]+\.js$/.test(pathOnly);
  }catch(e){ return false; }
}
function hubCodeLooksLikeJs(code){
  try{
    const c = String(code || '');
    if(c.trim().length < 8) return false;            // 空/几乎空 = 不是脚本
    if(/^\s*<!DOCTYPE/i.test(c)) return false;       // 拿回来的是 HTML 文档（SW 兜底那类）
    if(/^\s*<html[\s>]/i.test(c)) return false;
    if(/^\s*\{[\s\S]*"error"/.test(c)) return false; // API 错误 JSON 被当脚本
    return true;
  }catch(e){ return false; }
}
/* 统一口径的失败日志（带页面 id + 脚本名，施工书要求） */
function hubEvalReject(pageId, what, reason){
  console.warn('[soft-nav] 已拒绝执行脚本（' + reason + '）：page=' + (pageId || '?') + ' · ' + what);
}

/* 重新执行目标页脚本：
   用间接 eval（window.eval）在全局作用域执行脚本源码。
   - function 声明挂到全局 → 跨页调用仍然可用；
   - let/const 只存在于本次 eval 的词法作用域 → 多次访问不会“标识符重复声明”报错，且状态随每次访问重置。
   脚本里的 ready(fn) 在已加载完成的文档上会立即同步运行 → 页面初始化自然发生。
   软导航只换 <main>，原 head 里的页面专属脚本（如 speaking.html 的 mock.js / progress.js）不会自动重跑，
   因此从目标页 HTML 里收集其余 js/*.js（排除全局 data.js / common.js 与主脚本）一并 eval，避免 tab 组件未初始化。 */
async function runPageScript(id, doc){
  const p = PAGES.find(p => p.id === id);
  if(!p) return;
  const srcs = pageScriptSources(id, doc);
  const MAIN = srcs.mainIdx || 0;   // 主脚本在声明顺序中的下标（主脚本失败才回退整页跳转）
  // ⚡ 并行拉取全部脚本（命中内存缓存时零网络）：旧实现串行 await，每多一个脚本多一个网络 RTT，
  //    口语页 6 个脚本 = 6 次串行往返；现在一次并发搞定，再按原顺序 eval（顺序不变，行为一致）。
  const got = await Promise.all(srcs.map(s =>
    navGetCode(s).then(code => ({ code })).catch(err => ({ err }))
  ));
  for(let i = 0; i < srcs.length; i++){
    if(got[i].err){
      if(i === MAIN){        // 主脚本失败：记日志后由 softNavigate 兜底走整页跳转，绝不卡死
        console.error('[soft-nav] 页面脚本加载失败，将回退整页跳转：page=' + id + ' · ' + srcs[i], got[i].err);
        throw got[i].err;
      }
      console.warn('[soft-nav] 附加脚本加载失败，已跳过：page=' + id + ' · ' + srcs[i], got[i].err);
      continue;
    }
    /* Q-6 ①：eval 前校验来源与形态（见 hubEvalSourceOk / hubCodeLooksLikeJs 注释） */
    if(!hubEvalSourceOk(srcs[i])){
      hubEvalReject(id, srcs[i], '来源不在本站 js/ 白名单');
      if(i === MAIN) throw new Error('main script rejected: ' + srcs[i]);
      continue;
    }
    if(!hubCodeLooksLikeJs(got[i].code)){
      hubEvalReject(id, srcs[i], '拿到的内容不像 JS（可能是 HTML 兜底页或错误 JSON）');
      if(i === MAIN) throw new Error('main script not js: ' + srcs[i]);
      continue;
    }
    try{
      window.eval(got[i].code);   // 幂等重跑：页面 ready 内部已各自清旧心跳 / 重绑事件，多次进入不叠加
    }catch(err){
      if(i === MAIN){
        console.error('[soft-nav] 页面脚本执行失败，将回退整页跳转：page=' + id + ' · ' + srcs[i], err);
        throw err;
      }
      console.warn('[soft-nav] 附加脚本执行失败，已跳过：page=' + id + ' · ' + srcs[i], err);
    }
    /* 🔵 PERF-NAV-2B（10-26）：主脚本 eval 完先让出一帧，再 eval 附加脚本。
       为什么：runPageScript 原来是**一个 for 循环同步 eval 全部脚本** ——
       practice.html 要跑 practice.js(170KB) + words.js + wordbank.js，bank.html 要跑 bank.js(300KB)，
       eval 大文件是同步阻塞，全程不给浏览器画一帧 → 她感受到的就是「点完卡住」。
       让出一帧不减少总工作量，但把**一个长任务切成两段**：
       画面能刷新（进度条继续动、半透明态正常），体感从「卡死」变成「在加载」。
       ⚠️ 只在这一段插帧，脚本**执行顺序完全不变**（附加脚本仍按原顺序、仍在主脚本之后）。 */
    if(i === MAIN && i < srcs.length - 1){
      await new Promise(function(r){
        if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function(){ setTimeout(r, 0); });
        else setTimeout(r, 16);
      });
    }
  }

/* 🔴 10/6 00:40 补（她连报 5 次「按钮点不了」的真根因）：**body 内联 <script> 也要重跑**。
     此前只 eval script[src]，而软导航换的是 <main>、head/body 内联脚本从不执行，于是：
       · settings.html 左目录切换（内联）→ 委托监听压根没绑 → 点了零反应、零报错
       · vip / settings 的 .rv 进场动画（内联）→ 新插入的 .rv 停在 opacity:0 永久隐形
       · 组页（me/study/plans-hub）自收 #bootLoader 遮罩（内联）→ 没人撤遮罩
     安全边界：只取 **body 内**的内联脚本（head 的 cls/CSP 类逻辑不重复跑）；
     脚本必须自身幂等（重绑前先 removeEventListener，见 settings.html 的 __hubSetNavHandler）。 */
  const inlineCodes = pageInlineScripts(doc);
  for(const code of inlineCodes){
    /* Q-6 ②：内联脚本同样先验形态 —— 软导航只从**目标页 body** 里取（pageInlineScripts 已保证），
       这里再挡一次「内容其实是 HTML 文档/错误 JSON」这种被 SW 兜底串页的极端情况。 */
    if(!hubCodeLooksLikeJs(code)){
      hubEvalReject(id, 'body 内联脚本', '内容不像 JS');
      continue;
    }
    try{ window.eval(code); }
    catch(err){ console.warn('[soft-nav] 页面内联脚本执行失败，已跳过：page=' + id, err); }
  }
}

  /* 🔴 10/6 01:55 把页面的滚动位置归零（软导航换页用）。
   同时处理两个可能的滚动容器：移动端的 `main.container`（overflow-y:auto）
   与整文档（桌面端/无 dock 页面仍是 window 滚动）。
   ⚠️ 不能用「有没有滚动条」来决定要不要归零 —— 容器存在就要写，写 0 无害。 */
var _hubScrollLockUntil = 0;
function hubResetPageScroll(){
  try{
    const m = document.querySelector('main.container');
    if(m && m.scrollTop) m.scrollTop = 0;
    if(window.scrollY) window.scrollTo(0, 0);
  }catch(_){}
  /* 10/13：软导航后 600ms 内持续锁顶。
     只归零一次不够 —— 页面脚本（runPageScript）在归零之后才跑，这期间任何 focus()/
     scrollIntoView() 都会把容器重新顶走（实例：coach 输入框 focus() 默认把元素滚进视野，
     从首页软导航进口语页时 scrollTop 被顶到 2942，用户看到页面中间、题卡被切一半）。 */
  _hubScrollLockUntil = Date.now() + 600;
  /* 🔴 10-24 Q-4：原来是 `if(!window.__hubScrollLock)` 才建 —— 而这个句柄要等 600ms 到点才自清，
     于是**每次软导航都新建一个 50ms 的 interval**，旧的还没到期、新的又叠上去
     （实测 5 次软导航新增 5 个 50ms interval，同时最多并存十几个，全在抢主线程）。
     改法：不管句柄在不在，先把**旧的清掉**再按新的截止时间建 —— 同一时刻只有一个在跑，
     锁顶时长仍由 _hubScrollLockUntil 决定（600ms 语义不变）。 */
  if(window.__hubScrollLock){ clearInterval(window.__hubScrollLock); window.__hubScrollLock = null; }
  window.__hubScrollLock = setInterval(function(){
    if(Date.now() > _hubScrollLockUntil){
      clearInterval(window.__hubScrollLock); window.__hubScrollLock = null; return;
    }
    try{
      const m = document.querySelector('main.container');
      if(m && m.scrollTop) m.scrollTop = 0;
      if(window.scrollY) window.scrollTo(0, 0);
    }catch(_){}
  }, 50);
}

/* 🔴 10/6 01:55 「内容装得下就不要能滑动」——修「明明整屏能显示完却还能滑一点」。
   移动端 `main.container` 带 `padding-bottom:calc(dock高 + 10px)` 用于避让底部 dock，
   这段 padding 也让 scrollHeight 略大于 clientHeight，于是内容明明看得全却还能滑出一段空白。
   ⚠️ 只在**连 padding 一起都装得下**时才禁滑 —— 此时内容必然没被 dock 遮住，安全。
   （若内容溢出，保持 auto；否则用户够不到底部内容。） */
function hubFitPageScroll(){
  try{
    const m = document.querySelector('main.container');
    if(!m) return;
    m.style.overflowY = (m.scrollHeight > m.clientHeight + 2) ? 'auto' : 'hidden';
  }catch(_){}
}

/* 🔴 10/6 01:12 同步 <body> 上的**页面级**属性 —— 修「点计划/我的，渲染出来全是学习页」。
   背景：软导航只换 <main>，从不碰 <body>，于是 `body[data-hub-group]` 永远停留在
   **第一次硬加载的那张组页**（`<body data-hub-group="study">` 写在 HTML 里）。
   hubgroup.js 的 hostGroup() 又把它排在第一优先 → 之后进任何组页都渲染成那一个组。
   ⭐ 探针证据（tests/_probe_dock_group_1006.cjs）：先硬开 study → 走到主页 → 点计划 → 渲染「学习」。
   ⚠️ **只精确动 data-hub-group 这一族，不清空 body 的全部 data-*** ——
      运行时还有别人在用 body 的 data-*：av-picker 的 `data-avtab`、words 的 `body.dataset.init`，
      一把全删会把它们的中间状态抹掉。对这类只做「目标有就覆盖」，不删除。 */
function syncBodyPageAttrs(doc){
  try{
    const src = doc && doc.body, cur = document.body;
    if(!src || !cur) return;
    const GROUP = 'data-hub-group';
    const v = src.getAttribute(GROUP);
    if(v) cur.setAttribute(GROUP, v); else cur.removeAttribute(GROUP);
  }catch(_){}
}

/* 收集目标页 body 内的内联脚本源码（无 src 的 <script>），供软导航时 eval。 */
function pageInlineScripts(doc){
  if(!doc || !doc.body || !doc.body.querySelectorAll) return [];
  const out = [];
  doc.body.querySelectorAll('script').forEach(s => {
    if(s.hasAttribute('src')) return;                 // 外部脚本由 pageScriptSources 负责
    const t = (s.textContent || '').trim();
    if(t) out.push(t);
  });
  return out;
}

/* P0-A：清理上一页可能残留的全局心跳（计时 __timerTick / 服药 __medsTick / 模考 __mockTick）。
   各页面 ready 自身已清旧心跳、updateTimer/renderMeds 也会在 DOM 消失时自停，
   这里再兜底一道，确保软导航重进页面不会叠加“多个计时器同时跑 / 数字乱跳”。
   模考 __mockTick 离开时清掉，可让“剩余时间”在断点续考时冻结在离开那一刻，而非继续走表。 */
function hubClearOrphanPageTimers(){
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
  if(window.__medsTick){ clearInterval(window.__medsTick); window.__medsTick = null; }
  if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
}

/* ===== 空闲预热（9/9 性能专项） =====
   旧 prefetchNeighbors 只预取「前后各 1 个邻居」，而 tab 是平铺的、她随手跳任意页 → 预取命中率极低，
   等于每次切页都要现拉 100~300KB 脚本。现在改为全量预热：页面 HTML + 该页全部脚本源码进内存缓存。
   - 顺序：当前页相邻 → 收藏页 → 其余，逐个 requestIdleCallback 排队，不与当前页渲染抢主线程；
   - 幂等：已缓存的页直接跳过；切换后再调用也几乎零成本；
   - 省流/2G 下自动关闭（她农村网络，避免后台偷跑流量）。 */
function navPrefetchAllowed(){
  try{
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(!c) return true;
    if(c.saveData) return false;
    return !(c.effectiveType && /^(slow-)?2g$/.test(c.effectiveType));
  }catch(e){ return true; }
}
function prefetchPage(id){
  const p = PAGES.find(pp => pp.id === id);
  if(!p || _navDocCache.has(p.file)) return Promise.resolve();
  return navGetDoc(p.file).then(doc => {
    const srcs = pageScriptSources(id, doc);
    return Promise.all(srcs.map(s => navGetCode(s).catch(() => '')));
  }).catch(() => {});
}
let _prefetchRunning = false;
function prefetchAll(curId){
  if(_softNavBusy) return;   // 10/8 导航优先：切页瞬间不排新的预热请求
  if(!navPrefetchAllowed()) return;
  if(_prefetchRunning) return;
  _prefetchRunning = true;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 800));
  const order = [];
  const push = id => { if(id && order.indexOf(id) === -1 && PAGES.some(p => p.id === id)) order.push(id); };
  if(curId){                                   // 先照顾当前页左右邻居（最可能下一个点的）
    const idx = PAGES.findIndex(p => p.id === curId);
    if(idx > -1){ push(PAGES[idx - 1] && PAGES[idx - 1].id); push(PAGES[idx + 1] && PAGES[idx + 1].id); }
  }
  try{ (typeof favPageIds === 'function' ? favPageIds() : []).forEach(push); }catch(e){}
  /* 10-23：hidden 页（计时/服药）不再预取 —— 入口都撤了，为它多下两个 HTML+JS 是白费流量。
     ⚠️ timer.html 的**停止结算**跳转走 location.href（common.js:336），不依赖预取，照常可用。 */
  PAGES.forEach(p => { if(!(typeof isNavHidden === 'function' && isNavHidden(p))) push(p.id); });
  /* 10-22：老师端页面只对管理员开放 —— 普通用户不必为它多下一次 HTML+JS（约 40KB）。
     判定用同步缓存（hubIsAdmin），角色还没拉回来时不预取；真管理员首次进页面照常加载，
     之后 prefetchAll 的下一轮会补上。 */
  if(typeof hubIsAdmin === 'function' && !hubIsAdmin()){
    const iT = order.indexOf('teacher');
    if(iT >= 0) order.splice(iT, 1);
  }
  let i = 0;
  const step = () => {
    if(_softNavBusy){ idle(step); return; }   // 10/8 导航优先：预热链在切页期间挂起（不丢进度，i 不前进）
    if(i >= order.length){ _prefetchRunning = false; return; }
    const id = order[i++];
    const p = PAGES.find(pp => pp.id === id);
    if(!p || _navDocCache.has(p.file)){ idle(step); return; }   // 已缓存 → 跳过
    prefetchPage(id).then(() => idle(step)).catch(() => idle(step));
  };
  idle(step);
}

/* ⭐ 引导用的常量必须声明在「本文件末尾的引导函数区」之前：common.js 是 defer 脚本，
   ready(fn) 在 readyState 已 interactive 时会同步执行 —— 若常量声明在文件末尾，
   同步执行那一刻它们还在 TDZ 里，访问即抛 ReferenceError（且被 initOnboarding 的 try 吞掉，
   表现为「引导死活不弹」）。同理：任何在启动流程里被同步用到的 const/let 都要写在启动块之前。 */
/* ===== design/80 PWA 安装引导（加固版） =====
   前提核实：manifest（start_url / display:standalone / 3 图标含 maskable）、SW 注册、图标**全已现成**，
   她桌面也装过一次 PWA。所以本条不是「从零做安装能力」，只补「想装但不知道怎么装」的缺口。
   ⭐ 三原则：① 只放设置页（新增浮动/交互默认被砍）；② 已装就彻底隐藏（不给点了没反应的按钮）；
   ③ beforeinstallprompt 事件对象只能用一次 → 用完立刻清空，二次 prompt() 会 reject。
   ⚠️ _deferredPrompt 必须在启动块之前声明：defer 脚本里 ready(fn) 会同步执行（TDZ 铁律）。 */
let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  try{ e.preventDefault(); }catch(_){}          // 拦掉浏览器 mini-infobar，改由设置页自己给入口
  _deferredPrompt = e;
  try{ document.dispatchEvent(new CustomEvent('hub:pwa-available')); }catch(_){}
});
window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;                        // 已装：事件作废，卡片交给设置页隐藏
  try{ document.dispatchEvent(new CustomEvent('hub:pwa-installed')); }catch(_){}
});
function hubPwaState(){
  try{
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
    if(standalone) return 'installed';           // 已装：直接隐藏整块，绝不留死按钮
    if(_deferredPrompt) return 'promptable';
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    if(iOS) return 'ios-manual';                 // iOS 永远没有该事件，只能文字引导
    return 'unsupported';
  }catch(e){ return 'unsupported'; }
}
async function hubPwaInstall(){
  const p = _deferredPrompt;
  if(!p) return 'none';
  _deferredPrompt = null;                        // ⭐ 该事件对象只能用一次，调 prompt 前先作废引用
  try{
    p.prompt();
    const r = await p.userChoice;
    return (r && r.outcome) || 'dismissed';
  }catch(e){ return 'error'; }
}