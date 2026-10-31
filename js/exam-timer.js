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

  /* 五个场景：default 是她口径里的默认值，presets 是快捷档位（分钟） */
  var SCENES = {
    read_part:   { title: '这篇阅读要计时吗？', desc: '单篇练习默认 20 分钟，可以自己改。',  def: 20, presets: [10, 15, 20, 30] },
    read_full:   { title: '这套阅读要计时吗？', desc: '完整模考默认 60 分钟，可以自己改。',  def: 60, presets: [40, 50, 60, 75] },
    listen_full: { title: '这套听力要计时吗？', desc: '完整模考默认 30 分钟，可以自己改。',  def: 30, presets: [20, 25, 30, 40] },
    wrt:         { title: '这篇写作要计时吗？', desc: '默认按官方时长，可以自己改。',      def: 40, presets: [20, 30, 40, 60] },
    wrt_full:    { title: '这场写作要计时吗？', desc: '完整模考默认 60 分钟，可以自己改。',  def: 60, presets: [40, 50, 60, 75] }
  };

  var MIN_MIN = 1, MAX_MIN = 180;

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
      + '.tmr-ps{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}'
      + '.tmr-p{appearance:none;font:inherit;font-size:13.5px;font-weight:700;color:#111;cursor:pointer;'
      +   'border:1px solid #d5d9de;background:#fff;border-radius:9px;padding:8px 14px;line-height:1.2}'
      + '.tmr-p:hover{border-color:#111}'
      + '.tmr-p.on{background:#237a74;border-color:#237a74;color:#fff}'
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
      + '[data-theme="dark"] .tmr-p,[data-theme="dark"] .tmr-i,[data-theme="dark"] .tmr-no{'
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

    injectCss();
    var old = document.getElementById('tmrBox');
    if(old && old.parentNode) old.parentNode.removeChild(old);

    var wrap = document.createElement('div');
    wrap.className = 'tmr'; wrap.id = 'tmrBox';
    wrap.innerHTML = '<div class="tmr-c" role="dialog" aria-modal="true" aria-label="计时设置">'
      + '<button type="button" class="tmr-x" data-tmrclose aria-label="Close">\u2715</button>'
      + '<h4>' + cfg.title + '</h4>'
      + '<p class="tmr-d">' + cfg.desc + '</p>'
      + '<div class="tmr-ps">'
      +   presets.map(function(m){
            return '<button type="button" class="tmr-p' + (m === cur ? ' on' : '') + '" data-tmrp="' + m + '">'
              + m + ' 分钟</button>';
          }).join('')
      + '</div>'
      + '<div class="tmr-row"><span>自定义</span>'
      +   '<input class="tmr-i" type="number" inputmode="numeric" min="' + MIN_MIN + '" max="' + MAX_MIN
      +     '" step="1" value="' + cur + '" data-tmrin aria-label="自定义分钟数"><span>分钟</span>'
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
      var v = Number(input && input.value);
      wrap.querySelectorAll('[data-tmrp]').forEach(function(b){
        b.classList.toggle('on', Number(b.getAttribute('data-tmrp')) === v);
      });
    }
    function teardown(){
      var el = document.getElementById('tmrBox');
      if(el && el.parentNode) el.parentNode.removeChild(el);
      document.removeEventListener('keydown', onKey, true);
    }
    /* 关闭 = 不计时（✕ 与 Esc 同一个语义；弹框里永远有一个明确出口） */
    function finish(min){
      if(fired) return; fired = true;
      teardown();
      if(min > 0) saveMin(scene, min);
      cb(min > 0 ? min : null);
    }
    function onKey(ev){
      if(ev.key === 'Escape' || ev.keyCode === 27){ ev.preventDefault(); finish(null); }
    }
    document.addEventListener('keydown', onKey, true);

    wrap.addEventListener('click', function(ev){
      var t = ev.target;
      if(!t || !t.closest) return;
      if(t === wrap || t.closest('[data-tmrclose]')){ ev.preventDefault(); finish(null); return; }
      if(t.closest('[data-tmrno]')){ ev.preventDefault(); finish(null); return; }
      var pb = t.closest('[data-tmrp]');
      if(pb){
        ev.preventDefault();
        if(input) input.value = pb.getAttribute('data-tmrp');
        paint();
        return;
      }
      if(t.closest('[data-tmrgo]')){
        ev.preventDefault();
        var v = Math.round(Number(input && input.value));
        if(!(v >= MIN_MIN && v <= MAX_MIN)){
          /* 越界不静默接受：夹到合法区间并当场回写，用户看得见自己最终拿到多少 */
          v = Math.min(MAX_MIN, Math.max(MIN_MIN, v || defMin));
          if(input) input.value = String(v);
          paint();
          return;
        }
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
