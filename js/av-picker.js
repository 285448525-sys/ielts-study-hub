/* ============================================================
   10/3 头像选择（A窗口实现，她拍板：open-peeps 男4女4 = 用户可选，avataaars F/M = 考官可选）
   —— 素材来源：DiceBear（https://www.dicebear.com/styles/）
      · open-peeps（Pablo Stanley, CC0 1.0）= 用户 8 个
      · avataaars（Pablo Stanley, CC0 1.0）= 考官 2 个
      两者均免署名可商用，SVG 已剥掉 <metadata> RDF 块，落在 img/avatars/。
   —— **只存文件名**（DATA.settings.avatar / examAvatar），云同步只带几十字节，不存图片本身
   —— 字段已登记 SYNC_SETTINGS_FIELDS（common.js），保存自打 _fieldTs
   —— 暴露 window.avUser() / window.avExam() 供其他页（陪练气泡、模考考官）取 src
   ============================================================ */
(function(){
  'use strict';

  /* 用户可选 8 个（open-peeps）：女 4 + 男 4 */
  var USER_AVATARS = [
    { f: 'user-f1', label: '女生 1' },
    { f: 'user-f2', label: '女生 2' },
    { f: 'user-f3', label: '女生 3' },
    { f: 'user-f4', label: '女生 4' },
    { f: 'user-m1', label: '男生 1' },
    { f: 'user-m2', label: '男生 2' },
    { f: 'user-m3', label: '男生 3' },
    { f: 'user-m4', label: '男生 4' }
  ];
  /* 考官 2 个（avataaars，更精细的 Q 版） */
  var EXAM_AVATARS = [
    { f: 'exam-f', label: '考官 1' },
    { f: 'exam-m', label: '考官 2' }
  ];
  var DIR = 'img/avatars/';
  var FALLBACK_USER = 'user-f1';
  var FALLBACK_EXAM = 'exam-f';

  function valid(list, f){
    if(!f) return false;
    return list.some(function(x){ return x.f === f; });
  }
  function cur(){ return (DATA && DATA.settings) || {}; }

  /** 当前用户头像文件名（无设置/非法值 → 默认第一个） */
  function avUser(){
    var f = cur().avatar;
    return valid(USER_AVATARS, f) ? f : FALLBACK_USER;
  }
  /** 当前考官头像文件名 */
  function avExam(){
    var f = cur().examAvatar;
    return valid(EXAM_AVATARS, f) ? f : FALLBACK_EXAM;
  }
  function userSrc(){ return DIR + avUser() + '.svg'; }
  function examSrc(){ return DIR + avExam() + '.svg'; }

  function save(field, f){
    if(!DATA.settings) return;
    DATA.settings[field] = f;
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs[field] = Date.now();
    if(typeof hubSave === 'function') hubSave();
  }

  function renderGrid(boxId, list, curFn, field){
    var box = document.getElementById(boxId);
    if(!box) return;
    box.innerHTML = list.map(function(a){
      var on = (curFn() === a.f) ? ' on' : '';
      return '<button type="button" class="av-opt' + on + '" data-av="' + a.f + '" role="radio"'
        + ' aria-checked="' + (curFn() === a.f ? 'true' : 'false') + '" title="' + a.label + '">'
        + '<span class="av-box"><img src="' + DIR + a.f + '.svg" alt="' + a.label + '" loading="lazy"'
        + ' onerror="this.style.visibility=\'hidden\'"></span>'
        + '<span class="av-lb">' + a.label + '</span></button>';
    }).join('');
    box.onclick = function(e){
      var b = e.target.closest ? e.target.closest('.av-opt') : null;
      if(!b) return;
      var f = b.getAttribute('data-av');
      if(!f) return;
      save(field, f);
      // 本页重渲染选中态 + 顶部账户卡 + 侧栏头像
      renderAll();
      syncAccountCard();
      syncSide();
    };
  }

  function renderAll(){
    renderGrid('avUserGrid', USER_AVATARS, avUser, 'avatar');
    renderGrid('avExamGrid', EXAM_AVATARS, avExam, 'examAvatar');
    /* 10/3 22:55：设置页把「头像」整卡缩成弹层后，两个网格改为按页签互斥显示 */
    avSwitchTab(document.body.getAttribute('data-avtab') === 'exam' ? 'exam' : 'user');
  }

  /* ==== 10/3 22:55：头像从「一整卡网格」改成「点头像弹层」 ====
     她拍板：「不要摊开在下面，希望点头像才弹出来」。设置页点头像弹（kind='user'）；
     口语陪练页顶栏点考官头像也走同一个（kind='exam'，从 coach.js 调 window.avOpen）。 */
  function avSwitchTab(tab){
    var u = document.getElementById('avUserGrid'), e = document.getElementById('avExamGrid');
    var isExam = (tab === 'exam');
    if(u) u.hidden = isExam;
    if(e) e.hidden = !isExam;
    var t = document.getElementById('avPopTitle'), h = document.getElementById('avPopHint'), c = document.getElementById('avPopCount');
    if(t) t.textContent = isExam ? '换考官的样子' : '换我的头像';
    if(h) h.textContent = isExam ? '口语模考和陪练里会出现，选定的那位优先被抽到' : '用在陪练聊天、侧边栏这些地方，换设备自动同步';
    if(c) c.textContent = isExam ? ('共 ' + EXAM_AVATARS.length + ' 个形象') : ('共 ' + USER_AVATARS.length + ' 个形象');
    var tabs = document.querySelectorAll('.av-tab');
    for(var i = 0; i < tabs.length; i++){
      var on = tabs[i].getAttribute('data-avtab') === tab;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    document.body.setAttribute('data-avtab', tab);
  }
  function avOpen(kind){
    var card = document.getElementById('avatarCard');
    if(!card) return;
    /* 陪练页可能是 coach.js 后建的空壳 → 先确保弹层结构在（探针抓过：#avatarPop 为 null） */
    ensurePop(card);
    if(!card.querySelector('#avUserGrid').children.length) renderAll();
    card.hidden = false;
    avSwitchTab(kind || 'user');
    var btn = document.getElementById('acctAvatarBtn');
    if(btn) btn.setAttribute('aria-expanded', 'true');
    /* 陪练页顶栏那个也要置上——coach.js initExamAv 的轮询靠它判断弹层是否开着 */
    var cb = document.getElementById('coachExamAvBtn');
    if(cb) cb.setAttribute('aria-expanded', 'true');
  }
  function avClose(){
    var card = document.getElementById('avatarCard');
    if(card) card.hidden = true;
    var btn = document.getElementById('acctAvatarBtn');
    if(btn) btn.setAttribute('aria-expanded', 'false');
    /* 陪练页顶栏那个也要同步（initExamAv 的轮询靠它判断弹层是否还开着） */
    var cb = document.getElementById('coachExamAvBtn');
    if(cb) cb.setAttribute('aria-expanded', 'false');
  }
  function avBind(){
    /* ⚠️ 幂等按「元素」打标记，不能用全局 __avBound 一次性封死：
       第一次跑时陪练页的头像按钮还没被 coach.js 插进来，标记会把它永远排除在外。
       改成逐元素判断（el.__avBound），元素换了（新节点）就重新绑一次。 */
    function once(el, fn){ if(!el) return; if(el.__avBound) return; el.__avBound = true; el.addEventListener('click', fn); }
    var btn = document.getElementById('acctAvatarBtn');
    once(btn, function(){ avOpen('user'); });
    var x = document.getElementById('avPopClose');
    once(x, avClose);
    var d = document.getElementById('avPopDone');
    once(d, avClose);
    var tabs = document.querySelectorAll('.av-tab');
    for(var i = 0; i < tabs.length; i++){
      once(tabs[i], function(){ avSwitchTab(this.getAttribute('data-avtab')); });
    }
    if(!document.__avEscBound){ document.__avEscBound = true; document.addEventListener('keydown', function(e){ if(e.key === 'Escape') avClose(); }); }
  }

  /** 顶部账户卡（52px）跟随选择 */
  function syncAccountCard(){
    var img = document.getElementById('acctAvatarImg');
    if(img){
      var want = userSrc();
      if(img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }
  /* 侧栏头像：common.js 注入的是静态 HTML（injectNav 只在首次 ready 跑一次），
     选完头像必须手动换 src，否则要刷新页面才生效。 */
  function syncSide(){
    var img = document.querySelector('.side-me img');
    if(img){
      var want = userSrc();
      if(img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }

  /* 挂到 window：陪练气泡（coach.js）、模考考官（mock.js）都从这里取 */
  window.avUser = avUser;
  window.avExam = avExam;
  window.avUserSrc = userSrc;
  window.avExamSrc = examSrc;
  window.avSyncAccountCard = syncAccountCard;
  window.avSyncSide = syncSide;
  window.avOpen = avOpen;      // 10/3 22:55：陪练页顶栏点考官头像走这个开弹层
  window.avClose = avClose;

  /* 弹层骨架：设置页与陪练页各有一个 #avatarCard 空容器，本函数把同一份结构塞进去。
     ⚠️ 10/3 22:55：陪练页（coach.js build）只输出 `<div id="avatarCard" hidden></div>` 空壳，
     若不注入内容，avOpen() 会把空 div 显示出来而点不出任何东西 —— 探针实测 #avatarPop 为 null。 */
  var POP_HTML =
      '<div class="av-pop" id="avatarPop" role="dialog" aria-modal="true" aria-label="更换头像">'
    +   '<div class="av-pop-head">'
    +     '<div><b id="avPopTitle">换我的头像</b><span id="avPopHint">用在陪练聊天、侧边栏这些地方，换设备自动同步</span></div>'
    +     '<button class="av-pop-x" id="avPopClose" type="button" aria-label="关闭">✕</button>'
    +   '</div>'
    +   '<div class="av-pop-tabs" role="tablist">'
    +     '<button class="av-tab on" type="button" role="tab" aria-selected="true" data-avtab="user">我</button>'
    +     '<button class="av-tab" type="button" role="tab" aria-selected="false" data-avtab="exam">考官</button>'
    +   '</div>'
    +   '<div class="av-grid" id="avUserGrid" role="radiogroup" aria-label="我的头像"></div>'
    +   '<div class="av-grid av-grid-exam" id="avExamGrid" role="radiogroup" aria-label="考官头像" hidden></div>'
    +   '<div class="av-pop-foot"><span id="avPopCount"></span>'
    +     '<button class="av-pop-done" id="avPopDone" type="button">完成</button></div>'
    + '</div>';
  /* 只在容器为空时注入（设置页 HTML 已内联过同一份结构，不重复插） */
  function ensurePop(card){
    if(!card) return;
    if(!card.querySelector('#avatarPop')) card.innerHTML = POP_HTML;
  }

  /* 设置页 ready 后渲染一次；其它页只做账户卡同步（若页面上有这个元素） */
  function boot(){
    var box = document.getElementById('avatarCard');
    /* ⚠️ box 现在是 hidden 的弹层容器，**不能因为 hidden 就跳过渲染** ——
       弹层里的网格要先填好，点开时才不会空白。 */
    if(box){
      ensurePop(box);
      renderAll();
      avBind();
    }
    syncAccountCard();
    syncSide();
  }
  if(typeof ready === 'function') ready(boot);
  else if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 10/4 10:20 加固（她 01:44 报「设置页头像点了没反应 / 弹层里完成和✕ 点不动」）
     —— 探针 _diag_nav.cjs 抓到线上 `/settings.html` 会被 CF Pages 301 到 `/settings`（3 次导航），
        弱网下 boot() 可能跑在导航前的旧文档里 → 事件绑在已被丢弃的节点上，点击毫无反应。
     —— 两道保险：
        ① avBind 幂等（__avBound 标记），可重复调用
        ② 延迟兜底再绑一次（覆盖「DOM 已被换掉」的情况），并用事件委托挂在 document 上，
           这样即便按钮节点被重建，委托依然生效。 */
  function avBindDelegated(){
    if(window.__avDelegated) return;
    /* 🚨 10/4 10:45 二次修（她 10:08 图1「完成/✕ 点不动」）：
       上一版我加了「本页要有任一头像入口才绑」的守卫 —— 但**陪练页的头像按钮是切 tab 时
       才由 coach.js build() 动态插进去的**，而 av-picker 的 ready 早于那一刻 →
       守卫判定「无入口」→ **委托从未绑定** → 完成/✕/页签全点不动。
       探针 _diag_av_dbg.cjs 实锤：切 tab 前 coachExamAvBtn/avatarCard 全不存在，
       `__avDelegated` 一直是 undefined。
       正确做法：**无条件绑定**，靠 `closest()` 命中判断（没匹配到就什么都不做）。
       这样无论元素何时被插进来，委托都已经在 document 上了。 */
    window.__avDelegated = true;
    document.addEventListener('click', function(e){
      var t = e.target;
      if(!t || !t.closest) return;
      if(t.closest('#acctAvatarBtn')){ avOpen('user'); return; }
      if(t.closest('#coachExamAvBtn')){ avOpen('exam'); return; }
      if(t.closest('#avPopClose') || t.closest('#avPopDone')){ avClose(); return; }
      var tab = t.closest('.av-tab');
      if(tab){ avSwitchTab(tab.getAttribute('data-avtab')); }
    }, true);
  }
  function avBindLate(){
    try{ avBindDelegated(); }catch(_){}
    try{
      var box = document.getElementById('avatarCard');
      if(box){ ensurePop(box); if(!box.querySelector('#avUserGrid').children.length) renderAll(); }
      avBind();
    }catch(_){}
  }
  if(typeof ready === 'function') ready(avBindLate);
  setTimeout(avBindLate, 1200);
  window.addEventListener('load', avBindLate);
  /* 第三道保险：陪练页的头像按钮是切 tab 时动态插入的，隔一小段时间再补一次
     （委托已无条件绑上，这里只是把「直接绑定」也补齐，让 aria 状态与弹层同步）。 */
  [2000, 4000, 6000].forEach(function(ms){ setTimeout(avBindLate, ms); });
})();
