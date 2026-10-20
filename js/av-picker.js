/* ============================================================
   10/3 头像选择（A窗口实现，她拍板：open-peeps 男4女4 = 用户 8 个可选）
   —— 素材来源：DiceBear（https://www.dicebear.com/styles/）
      · open-peeps（Pablo Stanley, CC0 1.0）= 用户 8 个（img/avatars/user-*.svg）
      · avataaars（Pablo Stanley, CC0 1.0）= 陪练 2 个卡通（img/avatars/exam-*.svg）
      两者均免署名可商用，SVG 已剥掉 <metadata> RDF 块，落在 img/avatars/。
   🔴🔴 10/20 晚她暴怒修（原话「考官用真人陪练用卡通头像啊我真服了你给我改了干嘛」）：
      根因 = 白天把「考官」从卡通换成 4 张真人照时，**陪练气泡头像一直复用 avExamSrc()**
      → 陪练也跟着变成真人。**现在三套彻底分开，字段互不影响**：
      · 我（用户）= USER_AVATARS 8 个 → 字段 settings.avatar（陪练聊天 / 侧栏 / 账户卡）
      · 陪练 = COACH_AVATARS 2 个卡通 → 字段 settings.coachAvatar（只给口语陪练页气泡用）
      · 考官 = EXAM_AVATARS 4 张真人照（img/examiner/*.jpg）→ 字段 settings.examAvatar
        （只给口语模考 mock.js 的考官视频窗用）
   —— **只存文件名**（avatar / coachAvatar / examAvatar），云同步只带几十字节，不存图片本身
   —— 三个字段都已登记 SYNC_SETTINGS_FIELDS（common-sync.js），保存自打 _fieldTs
   —— 暴露 window.avUser()/avUserSrc()、window.avCoach()/avCoachSrc()、window.avExam()/avExamSrc()
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
  /* 🔴 10/20 她报：「口语模考用的图不是考官的头像…考官的图片精度高一些要真实生动」
     → 考官从 2 个 avataaars（Q 版卡通）+ 2 个 SVG 插画，全部换成 **4 张 AI 实拍级照片**。
     目录 img/examiner/、扩展名 .jpg（用户头像仍是 img/avatars/*.svg，两者路径不同，
     所以这里用 src 字段显式给全路径，不再靠 DIR 拼接）。
     ⚠️ 老用户 localStorage 里存的 exam-f / exam-m 会走 valid() 失配 → 自动回落 FALLBACK_EXAM，不会白图。 */
  var EXAM_AVATARS = [
    { f: 'ex-sophia', label: 'Sophia', src: 'img/examiner/ex-sophia.jpg' },
    { f: 'ex-daniel', label: 'Daniel', src: 'img/examiner/ex-daniel.jpg' },
    { f: 'ex-emily',  label: 'Emily',  src: 'img/examiner/ex-emily.jpg' },
    { f: 'ex-james',  label: 'James',  src: 'img/examiner/ex-james.jpg' }
  ];
  /* 🔴 10/20 晚她暴怒修：「考官用真人陪练用卡通头像」—— 陪练与考官从此分开。
     陪练 = 白天被删的 2 个 avataaars Q 版卡通（已从 git b76cc35^ 恢复），只给口语陪练页用。
     ⚠️ 与 EXAM_AVATARS 字段/目录/扩展名全不同；老用户 localStorage 没有 coachAvatar
     → valid() 失配自动回落 FALLBACK_COACH，不会白图。 */
  var COACH_AVATARS = [
    { f: 'exam-f', label: '陪练 1', src: 'img/avatars/exam-f.svg' },
    { f: 'exam-m', label: '陪练 2', src: 'img/avatars/exam-m.svg' }
  ];
  var DIR = 'img/avatars/';
  var FALLBACK_USER = 'user-f1';
  var FALLBACK_EXAM = 'ex-sophia';
  var FALLBACK_COACH = 'exam-f';

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
  /* 考官 = 照片，路径与扩展名都跟用户头像不同 → 按 src 字段取，取不到才退回老规则 */
  function examSrc(){
    var f = avExam();
    for(var i = 0; i < EXAM_AVATARS.length; i++){
      if(EXAM_AVATARS[i].f === f) return EXAM_AVATARS[i].src;
    }
    return DIR + f + '.svg';
  }
  /** 当前陪练头像文件名（卡通，与考官真人照分开） */
  function avCoach(){
    var f = cur().coachAvatar;
    return valid(COACH_AVATARS, f) ? f : FALLBACK_COACH;
  }
  /* 陪练 = 卡通 SVG，按 src 字段取全路径，取不到退回 DIR 拼接 */
  function coachSrc(){
    var f = avCoach();
    for(var i = 0; i < COACH_AVATARS.length; i++){
      if(COACH_AVATARS[i].f === f) return COACH_AVATARS[i].src;
    }
    return DIR + f + '.svg';
  }

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
    /* 10/13 她截图要求「头像下面不要写男生女生 1234，直接显示头像让人选」：
       .av-lb 文字标签整块删；title/alt 改中性文案（alt 不能空——读屏需要）。 */
    box.innerHTML = list.map(function(a){
      var on = (curFn() === a.f) ? ' on' : '';
      /* 10/20：考官是照片（a.src 给全路径），用户头像是 SVG（走 DIR 拼接） */
      var src = a.src || (DIR + a.f + '.svg');
      return '<button type="button" class="av-opt' + on + '" data-av="' + a.f + '" role="radio"'
        + ' aria-checked="' + (curFn() === a.f ? 'true' : 'false') + '" title="选择这个头像">'
        + '<span class="av-box"><img src="' + src + '" alt="头像" loading="lazy"'
        + ' onerror="this.style.visibility=\'hidden\'"></span></button>';
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
    renderGrid('avCoachGrid', COACH_AVATARS, avCoach, 'coachAvatar');
    renderGrid('avExamGrid', EXAM_AVATARS, avExam, 'examAvatar');
    /* 10/3 22:55：设置页把「头像」整卡缩成弹层后，三个网格改为按页签互斥显示 */
    var _tab0 = document.body.getAttribute('data-avtab');
    avSwitchTab((_tab0 === 'exam' || _tab0 === 'coach') ? _tab0 : 'user');
  }

  /* ==== 10/3 22:55：头像从「一整卡网格」改成「点头像弹层」 ====
     她拍板：「不要摊开在下面，希望点头像才弹出来」。设置页点头像弹（kind='user'）；
     口语陪练页点气泡头像走同一个（kind='coach'，从 coach.js 调 window.avOpen）。 */
  function avSwitchTab(tab){
    var u = document.getElementById('avUserGrid'), e = document.getElementById('avExamGrid'), k = document.getElementById('avCoachGrid');
    var isExam = (tab === 'exam'), isCoach = (tab === 'coach');
    if(u) u.hidden = isExam || isCoach;
    if(e) e.hidden = !isExam;
    if(k) k.hidden = !isCoach;
    var t = document.getElementById('avPopTitle'), h = document.getElementById('avPopHint'), c = document.getElementById('avPopCount');
    if(t) t.textContent = isCoach ? '换陪练的样子' : (isExam ? '换考官的样子' : '换我的头像');
    if(h) h.textContent = isCoach ? '只用在口语陪练里，和模考考官分开；换设备自动同步'
      : (isExam ? '口语模考里会出现，选定的那位优先被抽到' : '用在陪练聊天、侧边栏这些地方，换设备自动同步');
    if(c) c.textContent = isCoach ? ('共 ' + COACH_AVATARS.length + ' 个形象')
      : (isExam ? ('共 ' + EXAM_AVATARS.length + ' 个形象') : ('共 ' + USER_AVATARS.length + ' 个形象'));
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
    /* 陪练页顶栏那个也要置上——coach.js initCoachAv 的轮询靠它判断弹层是否开着 */
    var cb = document.getElementById('coachExamAvBtn');
    if(cb) cb.setAttribute('aria-expanded', 'true');
  }
  function avClose(){
    var card = document.getElementById('avatarCard');
    if(card) card.hidden = true;
    var btn = document.getElementById('acctAvatarBtn');
    if(btn) btn.setAttribute('aria-expanded', 'false');
    /* 陪练页顶栏那个也要同步（initCoachAv 的轮询靠它判断弹层是否还开着） */
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
  window.avCoach = avCoach;
  window.avUserSrc = userSrc;
  window.avExamSrc = examSrc;
  window.avCoachSrc = coachSrc;
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
    +     '<button class="av-tab" type="button" role="tab" aria-selected="false" data-avtab="coach">陪练</button>'
    +     '<button class="av-tab" type="button" role="tab" aria-selected="false" data-avtab="exam">考官</button>'
    +   '</div>'
    +   '<div class="av-grid" id="avUserGrid" role="radiogroup" aria-label="我的头像"></div>'
    +   '<div class="av-grid av-grid-coach" id="avCoachGrid" role="radiogroup" aria-label="陪练头像" hidden></div>'
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
