/* ===== 首页「快速入口」渲染层 + 编辑面板（B-7a 5-1 / 5-2）=====
   她 10-23 11:0x 选定版一（勾选式自定义）。
   5-1 = 把 home.html 写死的三条 <a> 改成由这里渲染，视觉零变化（已上线）。
   5-2 = 编辑面板 + 存取 + 权限过滤（本文件）。

   🔴 不碰 js/common.js 的 DEFAULT_FAV / DATA.settings.fav —— 侧栏「常用」、搜索、prefetch 全靠它。
      本站「快速入口」是**另一份清单**，独立存 DATA.settings.homeQuick（唯一新增字段）。
   🔴 不新增存储键（只在 settings 里加一个字段，云同步/导出导入自动跟着走）。
   🔴 不引新图标库：三个默认项用 home.html 原来那三个 SVG，新增项从 js/common.js 的 ICON 里抄同一套。
   🔴 面板配色全走 token。别用 --primary-800/900 —— 本站深色主题没定义这两档（踩过）。 */
(function(){
  'use strict';

  var MAX = 6;   /* 侧轨高度有限 */

  var ARROW = '<svg class="ar" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';

  /* 图标：计划/听写/回顾 三项照搬 home.html 原来那三个；
     其余五项拿 js/common.js 里同名导航图标（结构形状一致，只是个别路径写法不同，视觉同族）。 */
  var ICO = {
    plans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    corpus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 13a7.5 7.5 0 0 1 15 0v4a2.5 2.5 0 0 1-2.5 2.5h-1.5a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2h4.9"/><path d="M4.5 13v4a2.5 2.5 0 0 0 2.5 2.5h1.5a2 2 0 0 0 2-2v-2.5a2 2 0 0 0-2-2H5.6"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M4.5 12V7"/><path d="M4.5 12H9.5"/></svg>',
    practice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-2-1.5-5-1.5-7 0v12c2-1.5 5-1.5 7 0 2-1.5 5-1.5 7 0V6c-2-1.5-5-1.5-7 0z"/><path d="M12 6v12"/></svg>',
    speaking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    writing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7V3z"/><path d="M14 3v5h5"/><path d="M10 12h6M10 16h6"/></svg>',
    vip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>'
  };

  /* 顺序 = 面板里「没选的」那一区的排列顺序；默认三条排最前 */
  var QUICK_POOL = [
    { k:'plans',    t:'计划', d:'今日清单 · AI 排周',   href:'plans.html',    ico:'plans',    needLogin:false },
    { k:'corpus',   t:'听写', d:'长难句 · 错题 · 听写',   href:'corpus.html',   ico:'corpus',   needLogin:false },
    { k:'review',   t:'回顾', d:'成绩与学习轨迹',         href:'review.html',   ico:'review',   needLogin:false },
    { k:'practice', t:'背词', d:'单词页 · 记忆曲线',     href:'practice.html', ico:'practice', needLogin:false },
    { k:'speaking', t:'口语', d:'题库 + 陪练',           href:'speaking.html', ico:'speaking', needLogin:false },
    { k:'writing',  t:'写作', d:'模板 + 评分',           href:'writing.html',  ico:'writing',  needLogin:false },
    { k:'bank',     t:'模考', d:'真题题库 · 四科',        href:'bank.html',     ico:'bank',     needLogin:false },
    { k:'vip',      t:'会员', d:'权益与开通',            href:'vip.html',      ico:'vip',      needLogin:true  },
    { k:'settings', t:'设置', d:'账号与同步',            href:'settings.html', ico:'settings', needLogin:false }
  ];

  /* 默认三条 = 老用户沿用，不换页（顺序与 home.html 原来一致） */
  var QUICK_DEFAULT = ['plans','corpus','review'];

  var poolByK = {};
  QUICK_POOL.forEach(function(p){ poolByK[p.k] = p; });

  /* ⚠️ DATA 是 js/data.js 顶层的 `let DATA` —— 顶层 let **不挂 window**，
     所以这里必须用 typeof 判定而不是 window.DATA（写 window.DATA 会永远 undefined，
     表现为「配置存了读不出来、刷新后回到三条」）。 */
  function dataRef(){
    try{ return (typeof DATA !== 'undefined' && DATA) ? DATA : null; }catch(e){ return null; }
  }

  /* 登录态判据与 js/common.js:178 同一套，不另造 */
  function logged(){
    try{
      var d = dataRef();
      return !!(d && d.settings && d.settings.syncCode &&
                typeof authToken === 'function' && authToken());
    }catch(e){ return false; }
  }

  /* 权限过滤：会员这类进不去的页不摆出来（未登录=进不去 vip.html 的付费区） */
  function visiblePool(){
    var lg = logged();
    return QUICK_POOL.filter(function(p){ return !p.needLogin || lg; });
  }

  function readList(){
    var raw = null;
    var d = dataRef();
    try{ raw = d && d.settings && d.settings.homeQuick; }catch(e){}
    if(!Array.isArray(raw) || !raw.length) return QUICK_DEFAULT.slice();
    /* 清洗：只留还在池子里的 key、去重、截到上限（防手改数据把页面搞崩） */
    var pool = visiblePool().map(function(p){ return p.k; });
    var out = [];
    raw.forEach(function(k){
      if(out.indexOf(k) < 0 && pool.indexOf(k) >= 0) out.push(k);
    });
    if(!out.length) return QUICK_DEFAULT.slice();
    return out.slice(0, MAX);
  }

  function writeList(list){
    var d = dataRef();
    if(!d) return false;
    d.settings = d.settings || {};
    d.settings.homeQuick = list.slice(0, MAX);
    /* 打时间戳：换设备登录时云端合并才认得出这是最新值（与 saveSettings 同一口径） */
    d.settings._fieldTs = d.settings._fieldTs || {};
    d.settings._fieldTs.homeQuick = Date.now();
    if(typeof hubSave === 'function') hubSave();
    return true;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function itemHtml(k){
    var it = poolByK[k];
    if(!it) return '';
    return '<a class="qk" href="' + esc(it.href) + '" data-quick="' + esc(it.k) + '">'
         +   '<span class="ic">' + (ICO[it.ico] || ICO.plans) + '</span>'
         +   '<span class="tx"><b>' + esc(it.t) + '</b><span>' + esc(it.d) + '</span></span>'
         +   ARROW
         + '</a>';
  }

  /* 对外：renderQuick(list) —— 传 key 数组；不传就用已存的配置 */
  function renderQuick(list){
    var host = document.getElementById('rqList');
    if(!host) return;
    var arr = (list && list.length) ? list : readList();
    host.innerHTML = arr.map(itemHtml).join('');
  }

  /* ===================== 编辑面板（5-2）===================== */

  var draft = null;      /* 面板打开期间的草稿；关掉不保存就丢弃 */

  function popEl(){ return document.getElementById('rqPop'); }

  function popRow(k, on){
    var it = poolByK[k];
    if(!it) return '';
    return '<button type="button" class="rq-row' + (on ? ' on' : '') + '" data-k="' + esc(k) + '">'
         +   '<span class="rq-ck" aria-hidden="true">' + (on ? '✓' : '') + '</span>'
         +   '<span class="rq-row-tx"><b>' + esc(it.t) + '</b><span>' + esc(it.d) + '</span></span>'
         + '</button>';
  }

  function paintPop(){
    var pop = popEl();
    if(!pop || !draft) return;
    var pool = visiblePool();
    var onKeys = draft.filter(function(k){ return poolByK[k]; });
    var offKeys = pool.map(function(p){ return p.k; }).filter(function(k){ return onKeys.indexOf(k) < 0; });
    var full = onKeys.length >= MAX;

    var html = ''
      + '<div class="rq-pop-h"><b>编辑快速入口</b>'
      +   '<span class="rq-cnt">' + onKeys.length + '/' + MAX + '</span>'
      +   '<button type="button" class="rq-x" id="rqClose" aria-label="关闭">×</button>'
      + '</div>'
      + '<div class="rq-pop-body">'
      +   '<div class="rq-pop-h2">已选 <span>点一下取消</span></div>'
      +   '<div class="rq-pop-list">' + onKeys.map(function(k){ return popRow(k, true); }).join('') + '</div>'
      +   (offKeys.length
          ? '<div class="rq-pop-h2">没选的 <span>' + (full ? '最多 ' + MAX + ' 个，取消一个再加' : '点一下加上') + '</span></div>'
            + '<div class="rq-pop-list">' + offKeys.map(function(k){
                return popRow(k, false).replace('<button type="button" class="rq-row"',
                  '<button type="button" class="rq-row' + (full ? ' dis' : '') + '"' + (full ? ' disabled' : ''));
              }).join('') + '</div>'
          : '')
      + '</div>'
      + '<div class="rq-pop-f">'
      +   '<button type="button" class="rq-btn" id="rqReset">恢复默认</button>'
      +   '<button type="button" class="rq-btn rq-btn-p" id="rqDone">完成</button>'
      + '</div>';

    pop.innerHTML = html;
    pop.hidden = false;

    /* ⚠️ 用 **索引** 分辨两区：`.rq-pop-list:first-of-type` 靠不住 ——
       .rq-pop-body 的第一个 div 是 .rq-pop-h2，所以那个选择器恒为空，已选区永远点不动（自测抓到）。 */
    var lists = pop.querySelectorAll('.rq-pop-list');
    if(lists[0]){
      lists[0].querySelectorAll('.rq-row').forEach(function(btn){
        btn.addEventListener('click', function(){
          var k = btn.getAttribute('data-k');
          if(draft.length <= 1){ toast('至少留一个'); return; }
          draft = draft.filter(function(x){ return x !== k; });
          paintPop();
        });
      });
    }
    if(lists[1]){
      lists[1].querySelectorAll('.rq-row').forEach(function(btn){
        btn.addEventListener('click', function(){
          var k = btn.getAttribute('data-k');
          if(draft.length >= MAX){ toast('最多 ' + MAX + ' 个，取消一个再加'); return; }
          if(draft.indexOf(k) < 0) draft.push(k);
          paintPop();
        });
      });
    }

    var closeBtn = pop.querySelector('#rqClose');
    if(closeBtn) closeBtn.addEventListener('click', closePop);
    var resetBtn = pop.querySelector('#rqReset');
    if(resetBtn) resetBtn.addEventListener('click', function(){
      draft = QUICK_DEFAULT.slice();
      paintPop();
    });
    var doneBtn = pop.querySelector('#rqDone');
    if(doneBtn) doneBtn.addEventListener('click', function(){
      var keep = draft.slice();
      writeList(keep);
      renderQuick(keep);
      closePop();
      toast('已保存');
    });
  }

  function toast(msg){
    var el = document.getElementById('rqToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'rqToast';
      el.className = 'rq-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.classList.remove('on'); el.hidden = true; }, 1800);
  }

  /* 面板挂在 body 直下 + position:fixed：父级 overflow 裁不掉它（本站顶栏「更多」面板踩过这个坑） */
  function placePop(){
    var pop = popEl(), btn = document.getElementById('rqEdit');
    if(!pop || !btn || pop.hidden) return;
    var r = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var narrow = vw <= 640;
    /* 手机按方案的「从右侧滑入占 88% 宽」给宽度（CSS 里的 300px 是桌面口径） */
    pop.style.width = narrow ? Math.round(vw * 0.88) + 'px' : '';
    var w = pop.offsetWidth || 300, h = pop.offsetHeight || 400;
    if(narrow){
      /* 手机：从右侧滑入，占 88% 宽（方案要求复用小浮层范式，不造第三种定位） */
      pop.style.left = Math.round((vw - w) / 2) + 'px';
      pop.style.top = Math.round(Math.max(12, (vh - h) / 2)) + 'px';
    }else{
      var left = Math.min(r.right - w, vw - w - 12);
      left = Math.max(12, left);
      var top = Math.min(r.bottom + 6, vh - h - 12);
      top = Math.max(12, top);
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
    }
  }

  function openPop(){
    var pop = popEl();
    if(!pop) return;
    draft = readList();
    paintPop();
    document.body.dataset.rqEdit = '1';
    var btn = document.getElementById('rqEdit');
    if(btn) btn.setAttribute('aria-expanded', 'true');
    placePop();
    var first = pop.querySelector('.rq-row');
    if(first && first.focus) first.focus();
  }

  function closePop(){
    var pop = popEl();
    if(!pop) return;
    pop.hidden = true;
    draft = null;                                  /* 不保存 */
    delete document.body.dataset.rqEdit;
    var btn = document.getElementById('rqEdit');
    if(btn) btn.setAttribute('aria-expanded', 'false');
  }

  function popOpen(){ var p = popEl(); return !!(p && !p.hidden); }

  function boot(){
    var host = document.getElementById('rqList');
    if(!host) return;                              /* 不是首页就什么也不做 */
    renderQuick();

    var edit = document.getElementById('rqEdit');
    if(edit){
      edit.addEventListener('click', function(e){
        e.stopPropagation();
        if(popOpen()) closePop(); else openPop();
      });
    }

    /* 🔴 HOME-QUICK-GUARD-1（10-29）：这四条原先是**裸绑**（无守卫、无 removeEventListener 对冲），
       而 `boot()` 每次进首页都会跑（软导航重跑本文件即重跑 boot）→ document/window 上每进一次
       首页就多一份，永不摘除。实测首页往返后 document:keydown / pointerdown 各 2 份。
       当前没有可见缺陷（`popOpen()` 为假时处理器立刻 return，重复不产生重复动作），
       但它是真泄漏，且与 LISTEN-LEAK-1 同族 —— 顺手补上。
       ⚠️ 闸挂在 window 上而不是元素上：这四条绑的都是 document/window（长生命周期），
          用 window 级标记才拦得住；处理器内部一律**现取** rqEdit/rqPanel，不缓存闭包
          （软导航换 <main> 后旧节点已成孤儿，缓存着会操作死节点）。 */
    if(!window.__rqDocBound){
      window.__rqDocBound = true;
      /* Esc 关（不保存） */
      document.addEventListener('keydown', function(e){
        if(!popOpen()) return;
        if(e.key === 'Escape'){ e.preventDefault(); closePop(); }
      });
      /* 点面板外关（不保存）；点面板内不关 */
      document.addEventListener('pointerdown', function(e){
        if(!popOpen()) return;
        var pop = popEl();
        if(pop && pop.contains(e.target)) return;
        var btn = document.getElementById('rqEdit');
        if(btn && btn.contains(e.target)) return;
        closePop();
      });
      window.addEventListener('resize', placePop);
      window.addEventListener('hub:data-merged', function(){ renderQuick(); });
    }
    renderQuick();   /* 登录态可能在 boot 之后才落定 → 再渲染一次（readList 会重新过滤） */
  }

  window.renderQuick = renderQuick;
  window.QUICK_DEFAULT = QUICK_DEFAULT;
  window.QUICK_POOL = QUICK_POOL;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
