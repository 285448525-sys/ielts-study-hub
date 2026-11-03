/* ===== EXAM-TIMER-CHOICE-1（10-31）=====
   她 10-31 23:0x 原话：「阅读模考练习页面只有一篇的计时只有20分钟…最好有这样一个框让你自己选择
   要不要计时，阅读模考计时一小时单篇20分钟可以自己调，听力不用计时，写作也可以自己选计时不计时」。
   11-01 0:0x 补充拍板：「听力模考可以计时，练习不计时」→ 最终口径：

     · 模考类（阅读完整 / 听力完整 / 写作完整 / 写作单篇 Task）→ 进场弹选择框，时长可自调
     · 单篇练习：阅读弹框（默认 20 分钟，可调）；听力单篇不弹、不计时

   🔴 为什么不复用 examGuideGate：那套靠 localStorage「看过就永久跳过」，而「要不要计时」
      是**每一次进场都要问**的东西；复用会让她第二次进场就再也看不到选择框。
      外观沿用 .exg 那套视觉（同一张卡、同样的 ✕/Esc/点遮罩关闭），逻辑完全独立。
   🔴 只把「上次选的分钟数」记下来当**下次的默认选中值**，绝不因此跳过弹框。

   本文件被 bank.html 与 writing.html 共用（阅读/听力 + 写作走同一套弹框），
   样式与节点由自己注入，不依赖任何一页的页内 CSS，也不进 common.css。
   对外只暴露 window.ExamTimerChoice。 */
(function(){
  'use strict';

  var KEY = 'hub_exam_timermin_';

  /* 五个场景：default 是她口径里的默认值。
     EXAM-TIMER-POP-FIX-1：presets 档位排已退役（不再渲染），字段保留只为 opts.presets 兼容不炸。 */
  var SCENES = {
    read_part:   { title: '这篇阅读要计时吗？', desc: '单篇练习默认 20 分钟，可以自己改。',  def: 20, presets: [10, 15, 20, 30] },
    read_full:   { title: '这套阅读要计时吗？', desc: '完整模考默认 60 分钟，可以自己改。',  def: 60, presets: [40, 50, 60, 75] },
    listen_full: { title: '这套听力要计时吗？', desc: '完整模考默认 30 分钟，可以自己改。',  def: 30, presets: [20, 25, 30, 40] },
    wrt:         { title: '这篇写作要计时吗？', desc: '默认按官方时长，可以自己改。',      def: 40, presets: [20, 30, 40, 60] },
    wrt_full:    { title: '这场写作要计时吗？', desc: '完整模考默认 60 分钟，可以自己改。',  def: 60, presets: [40, 50, 60, 75] }
  };

  var MIN_MIN = 1, MAX_MIN = 180, STEP_MIN = 5;

  function clampMin(n){
    return Math.min(MAX_MIN, Math.max(MIN_MIN, Math.round(Number(n) || 0)));
  }
  function bumpMin(v, dir){
    var n = (Number(v) || 0) + dir * STEP_MIN;
    return clampMin(n < 1 && dir < 0 ? MAX_MIN : n);
  }

  function lastMin(scene){
    try{
      var v = parseInt(localStorage.getItem(KEY + scene), 10);
      if(v >= MIN_MIN && v <= MAX_MIN) return v;
    }catch(e){}
    return null;
  }
  function saveMin(scene, m){
    try{ localStorage.setItem(KEY + scene, String(m)); }catch(e){}
  }

  var _cssDone = false;
  function injectCss(){
    if(_cssDone || document.getElementById('tmrCss')) return;
    _cssDone = true;
    var st = document.createElement('style');
    st.id = 'tmrCss';
    /* 视觉与 bank.html 的 .exg（考前指南卡）同一套：同一张白卡、同一个 ✕、同一颗主按钮 */
    st.textContent = ''
      + '.tmr{position:fixed;inset:0;z-index:9600;background:rgba(17,24,39,.45);display:flex;'
      +   'align-items:center;justify-content:center;padding:20px}'
      + '.tmr-c{position:relative;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);'
      +   'max-width:420px;width:100%;padding:24px 22px 16px;box-sizing:border-box}'
      + '.tmr-x{position:absolute;top:9px;right:9px;width:34px;height:34px;border:none;background:none;'
      +   'font-size:16px;color:#6b7280;cursor:pointer;border-radius:8px;line-height:1}'
      + '.tmr-x:hover{background:#f3f4f6;color:#111}'
      + '.tmr-c h4{margin:0 14px 6px 0;font-size:16px;font-weight:800;color:#111;line-height:1.45}'
      + '.tmr-d{font-size:12.5px;color:#6b7280;line-height:1.6;margin:0 0 14px}'
      + '.tmr-stepper{gap:10px}'
      + '.tmr-arr{appearance:none;font:inherit;font-size:16px;font-weight:800;color:#111;cursor:pointer;'
      +   'width:40px;height:40px;border:1px solid #d5d9de;background:#fff;border-radius:9px;line-height:1;'
      +   'flex:none;display:inline-flex;align-items:center;justify-content:center;user-select:none}'
      + '.tmr-arr:hover{border-color:#111}'
      + '.tmr-arr:focus-visible{outline:2px solid #237a74;outline-offset:2px}'
      + '.tmr-unit{color:#374151}'
      + '.tmr-row{display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;margin:0 0 16px}'
      + '.tmr-i{appearance:none;font:inherit;font-size:13.5px;font-weight:700;color:#111;width:74px;'
      +   'text-align:center;border:1px solid #d5d9de;background:#fff;border-radius:9px;padding:7px 6px;'
      +   'box-sizing:border-box}'
      + '.tmr-i:focus{outline:none;border-color:#237a74;box-shadow:0 0 0 3px rgba(35,122,116,.15)}'
      + '.tmr-b{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}'
      + '.tmr-go,.tmr-no{appearance:none;font:inherit;font-size:14px;font-weight:800;cursor:pointer;'
      +   'border-radius:10px;padding:10px 18px;line-height:1.2}'
      + '.tmr-go{color:#fff;background:#237a74;border:1px solid #237a74}'
      + '.tmr-go:hover{filter:brightness(.94)}'
      + '.tmr-no{color:#374151;background:#fff;border:1px solid #d5d9de}'
      + '.tmr-no:hover{border-color:#111;color:#111}'
      + '.tmr-go:focus-visible,.tmr-no:focus-visible{outline:2px solid #237a74;outline-offset:2px}'
      + '[data-theme="dark"] .tmr-c{background:#1b1b1b;box-shadow:0 20px 60px rgba(0,0,0,.55)}'
      + '[data-theme="dark"] .tmr-c h4{color:#f2f2f4}'
      + '[data-theme="dark"] .tmr-d,[data-theme="dark"] .tmr-row{color:#9aa0a6}'
      + '[data-theme="dark"] .tmr-i,[data-theme="dark"] .tmr-no,[data-theme="dark"] .tmr-arr{'
      +   'background:#262626;border-color:#3a3f45;color:#f2f2f4}'
      + '[data-theme="dark"] .tmr-x{color:#9aa0a6}'
      + '[data-theme="dark"] .tmr-x:hover{background:#262626;color:#f2f2f4}'
      + '@media(max-width:640px){.tmr-c{padding:20px 18px 14px}.tmr-b{flex-direction:column-reverse}'
      +   '.tmr-go,.tmr-no{width:100%;text-align:center}}';
    document.head.appendChild(st);
  }

  /* show(scene, opts, cb)
       scene : SCENES 的键
       opts  : { def: 覆盖默认分钟（写作 Task2=40 / Task1=20 要按题变）, presets: 覆盖档位 }
       cb    : function(minutes|null) —— null 表示「不计时」 */
  /* show(scene, opts, cb) 的 cb 取值契约：Number=分钟数（>0，计时进场）/
     null=不计时进场 / 'exit'=放弃退出（消费方退列表，不开卷）。 */
  function show(scene, opts, cb){
    /* 🔴 自动化旁路闸（只给探针用，产品路径不受影响）：
       tests/ 里有 12 支回归探针靠「点 Start Test / 点一条题」直接进考场做断言，
       选择框一弹，它们全卡在进考场这一步（实测 shell5 37/46、examtools 直接超时）。
       探针在进考场前写 localStorage['hub_exam_timer_auto'] = 分钟数（'0' = 不计时）即可直达；
       真实用户从不写这个键 → 照旧每次弹框问。与既有的 hub_exam_guide_v2_* 同一类做法。 */
    try{
      var auto = localStorage.getItem('hub_exam_timer_auto');
      if(auto !== null && auto !== ''){
        var am = Number(auto);
        cb(isFinite(am) && am > 0 ? am : null);
        return;
      }
    }catch(e){}
    opts = opts || {};
    var cfg = SCENES[scene] || SCENES.read_part;
    var presets = opts.presets || cfg.presets;
    var defMin = (opts.def > 0) ? opts.def : cfg.def;
    var remembered = lastMin(scene);
    var cur = remembered || defMin;
    /* RV-TIMER-DESC-1（B1 11-03 模考深查 P2）：文案写死「默认 X 分钟」，但输入框预填的是上次记住的值——
       用过一次以后文案就与实际不符。记住值命中且与本场景默认值不同时，改说「上次用了 X 分钟」。 */
    var desc = cfg.desc;
    if(remembered && remembered !== defMin) desc = '上次用了 ' + remembered + ' 分钟，可以自己改。';

    injectCss();
    var old = document.getElementById('tmrBox');
    if(old && old.parentNode) old.parentNode.removeChild(old);

    var wrap = document.createElement('div');
    wrap.className = 'tmr'; wrap.id = 'tmrBox';
    /* EXAM-TIMER-POP-FIX-1（11-02 她四条口径）：
       ① 档位排整删（presets 不再渲染，data-tmrp 分支退役）；
       ② 时长只有一行：「− 输入框 ＋」左右箭头，一次 5 分钟，钳 1–180（旧「自定义」重复行已删，EXAM-TIMER-POP-DUP-1）；
       ③ ✕/Esc = 放弃退出回列表（cb 传 'exit'，消费方识别后不开卷）；
       ④ 「不计时」「按这个时长开始」两按钮保留（❌ 与「不计时」语义分开：❌ 是不做这篇）。
       ❌ 退出协议：cb('exit') —— bank.js/writing.js 消费方判 'exit' 走退列表路径。 */
    wrap.innerHTML = '<div class="tmr-c" role="dialog" aria-modal="true" aria-label="计时设置">'
      + '<button type="button" class="tmr-x" data-tmrclose aria-label="Close">✕</button>'
      + '<h4>' + cfg.title + '</h4>'
      + '<p class="tmr-d">' + desc + '</p>'
      + '<div class="tmr-row tmr-stepper">'
      +   '<button type="button" class="tmr-arr" data-tmrdn aria-label="减少 5 分钟">−</button>'
      +   '<input class="tmr-i" type="number" inputmode="numeric" min="' + MIN_MIN + '" max="' + MAX_MIN
      +     '" step="' + STEP_MIN + '" value="' + cur + '" data-tmrin aria-label="自定义分钟数">'
      +   '<button type="button" class="tmr-arr" data-tmrup aria-label="增加 5 分钟">＋</button>'
      +   '<span class="tmr-unit">分钟</span>'
      + '</div>'
      + '<div class="tmr-b">'
      +   '<button type="button" class="tmr-no" data-tmrno>不计时</button>'
      +   '<button type="button" class="tmr-go" data-tmrgo>按这个时长开始</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(wrap);

    var input = wrap.querySelector('[data-tmrin]');
    var fired = false;

    function paint(){
      /* 档位排已退役，paint 不再有档位点亮职责（保留空钩子，越界回写仍调用它） */
    }
    function teardown(){
      var el = document.getElementById('tmrBox');
      if(el && el.parentNode) el.parentNode.removeChild(el);
      document.removeEventListener('keydown', onKey, true);
    }
    /* finish('exit')=放弃退出；finish(null)=不计时进场。✕/Esc 走 exit。 */
    function finish(min){
      if(fired) return; fired = true;
      teardown();
      if(min === 'exit'){ cb('exit'); return; }   /* ✕/Esc = 放弃这篇，消费方退回列表 */
      if(min > 0) saveMin(scene, min);
      cb(min > 0 ? min : null);
    }
    function onKey(ev){
      if(ev.key === 'Escape' || ev.keyCode === 27){ ev.preventDefault(); finish('exit'); }
    }
    document.addEventListener('keydown', onKey, true);

    wrap.addEventListener('click', function(ev){
      var t = ev.target;
      if(!t || !t.closest) return;
      if(t === wrap || t.closest('[data-tmrclose]')){ ev.preventDefault(); finish('exit'); return; }
      if(t.closest('[data-tmrno]')){ ev.preventDefault(); finish(null); return; }
      /* ± 箭头：一次 5 分钟，1–180 钳制（减到 0 以下绕回 180，与数字输入 min/max 同口径） */
      var dn = t.closest('[data-tmrdn]');
      if(dn){
        ev.preventDefault();
        if(input) input.value = String(bumpMin(input.value, -1));
        return;
      }
      var up = t.closest('[data-tmrup]');
      if(up){
        ev.preventDefault();
        if(input) input.value = String(bumpMin(input.value, +1));
        return;
      }
      if(t.closest('[data-tmrgo]')){
        ev.preventDefault();
        /* 🔴 一次点击就必须开始，不许把用户挡成「点两次」。
           第一版写成「越界时先回写输入框再 return」，实测（_ptc_edge 11 红）就是：
           打 999 点开始 → 弹框不动、输入框变 180、人愣在那得再点一次。
           她按「按这个时长开始」表达的就是「开始」，中途拦一道是多余的摩擦。
           现在的钳制口径（都在这一次点击里完成，没有第二次）：
             · 非数字 / 空 / 0 / 负数 → 回落到本场景默认分钟（她自己选的场景默认值）
             · 超过 180               → 夹到 180
           回写输入框只为让返回值与屏幕一致，然后立刻 finish。 */
        var raw = (input && input.value != null) ? String(input.value).trim() : '';
        var n = Number(raw);
        var v;
        if(raw === '' || !isFinite(n) || n <= 0) v = defMin;
        else v = Math.min(MAX_MIN, Math.max(MIN_MIN, Math.round(n)));
        if(input) input.value = String(v);
        paint();
        finish(v);
      }
    });
    if(input){
      input.addEventListener('input', paint);
      input.addEventListener('keydown', function(ev){
        if(ev.key === 'Enter'){ ev.preventDefault(); var g = wrap.querySelector('[data-tmrgo]'); if(g) g.click(); }
      });
      try{ input.focus({ preventScroll: true }); input.select(); }catch(e){}
    }
  }

  window.ExamTimerChoice = { show: show, scenes: SCENES, last: lastMin };
})();
