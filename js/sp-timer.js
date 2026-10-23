/* === js/sp-timer.js · 口语页 L/M 区：口语自动计时 + 回车跳题钩子 ===
 *
 * 10-24 T-009 S-6b：从 js/speaking.js 原样搬来，函数体一个字未改。
 * 本文件取自 speaking.js 的 2 段 / 171 行。
 *
 * 内容清单：
 *   var SPK_TIMER_MODULE / SPK_TIMER_NAME / SPK_AUTO_MIN_SEC   三个常量
 *   spkTimerDeviceId / isSpkTimerActive / spkSettleForeignTimer
 *   maybeStartSpkTimer / commitSpkTimer                         计时启停与落库
 *   四个 if(!window.__xxx) 幂等 hook                            心跳 / 离页 / 聚焦 / 回车跳题
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   ⚠️ 本文件最要命的一条：SPK_AUTO_MIN_SEC 是 var 且必须排在 commitSpkTimer **之前**
 *      （defer 同步执行期即赋值，避免 TDZ）—— 搬家时两者必须同文件且保持这个先后。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 幂等 hook 说明：四个 hook 都用 if(!window.__xxx) 包着，软导航重跑时不会重复绑定；
 *   window.eval 逐文件重跑也能安全跳过。
 *
 * 加载位置：speaking.html 里排在 sp-mock.js 之后、speaking.js 之前。
 */
/* ======= 口语自动计时接入「计时」模块（9/22，照搬 practice.js 背词自动计时同款）=======
   用户常忘记开计时：开口语页即自动开一个「口语」计时（moduleId 与 data.js MODULES 的 speaking 一致），
   离页/切后台/关标签时结算进 DATA.sessions（首页「今日学习时长」与计时页都读它）。
   规则与 9/16 之之定版一致：已有别的模块在计 → 先正规结算前一个再开新表，绝不丢表、绝不双开。 */
var SPK_TIMER_MODULE = 'speaking';
var SPK_TIMER_NAME = '口语';
function spkTimerDeviceId(){
  try{
    let id = localStorage.getItem('hub_device_id');
    if(!id){ id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); localStorage.setItem('hub_device_id', id); }
    return id;
  }catch(e){ return 'd' + Date.now().toString(36); }
}
function isSpkTimerActive(){
  const a = window.active;
  if(a && !a.ended && a.moduleId === SPK_TIMER_MODULE) return true;
  const m = DATA.activeTimer;
  if(m && !m.ended && m.timerId && m.moduleId === SPK_TIMER_MODULE) return true;
  return false;
}
/* 正规结算「其他模块」的进行中计时（背词/听力/手动）：时长记到当前时刻，绝不丢表 */
function spkSettleForeignTimer(){
  const a = (window.active && !window.active.ended) ? window.active
          : ((DATA.activeTimer && !DATA.activeTimer.ended && DATA.activeTimer.timerId) ? DATA.activeTimer : null);
  if(!a || a.moduleId === SPK_TIMER_MODULE) return;
  const timerId = a.timerId;
  const endTs = Date.now();
  let pause = Number(a.pauseAccum) || 0;
  if(a.paused && a.pauseStart) pause += (endTs - a.pauseStart);
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs) - pause) / 1000));
  if(durationSec > 0 && !(DATA.sessions || []).some(s => s.timerId && s.timerId === timerId)){
    DATA.sessions = DATA.sessions || [];
    const names = (typeof resolveTimerNames === 'function')
      ? resolveTimerNames(a)
      : { moduleName: a.moduleName || '学习', subName: a.subName || '' };
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(a.startTs),
      moduleId: a.moduleId, subId: a.subId || a.moduleId,
      moduleName: names.moduleName, subName: names.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
}
function maybeStartSpkTimer(){
  // 首次引导没走完（全新用户，账号遮罩还挂着）时不自动开表：
  // 否则引导耗时会被记成口语练习时长；引导完成后再进页面即恢复正常自动计时。
  if(typeof getOnboarding === 'function'){
    // 9/30：新版引导（hub_onboarding_v2）用 finished 标记，不再有 account 字段 —— 继续读 account
    // 会让它恒为 undefined !== 'done' → 母语计时永远不自动开（静默故障）。
    const o = getOnboarding();
    const guided = o ? (o.finished !== true)
      : (typeof onbHasExistingData === 'function' ? !onbHasExistingData() : false);
    if(guided) return;
  }
  if(window.__spkTimerAuto && window.active && !window.active.ended && window.active.moduleId === SPK_TIMER_MODULE) return;
  if(isSpkTimerActive()) return;               // 本机已有口语表（手动开的）→ 不重复开
  spkSettleForeignTimer();                     // 别的模块在计 → 结算后再开新表
  const now = Date.now();
  const id = uid();
  const dev = spkTimerDeviceId();
  window.active = {
    timerId: id, ownerDevice: dev, moduleId: SPK_TIMER_MODULE, moduleName: SPK_TIMER_NAME,
    subId: SPK_TIMER_MODULE, subName: SPK_TIMER_NAME,
    startTs: now, startMonoNs: null, paused: false, pauseStart: null, pauseAccum: 0,
    pauseStartMonoNs: null, pauseAccumMonoNs: 0, targetSec: null, mode: 'up',
    updatedAt: now, lastBeat: now
  };
  DATA.activeTimer = {
    timerId: id, ownerDevice: dev, moduleId: SPK_TIMER_MODULE, moduleName: SPK_TIMER_NAME,
    subId: SPK_TIMER_MODULE, subName: SPK_TIMER_NAME,
    startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
    targetSec: null, mode: 'up', updatedAt: now, lastBeat: now, ended: false
  };
  window.__spkTimerAuto = true;
  hubSave();
}
// 9/26（她拍板 30s）：autostart 跳转自动开的口语计时，<30s 结束 = 误点，不落 session。
// ⚠️ 顶层 var、必须在 commitSpkTimer 之前（defer 同步执行期即赋值，避免 TDZ）。
var SPK_AUTO_MIN_SEC = 30;
function commitSpkTimer(){
  if(!window.__spkTimerAuto) return;
  const a = window.active;
  if(!a || a.ended || a.moduleId !== SPK_TIMER_MODULE){ window.__spkTimerAuto = false; window.__spkTimerByJump = false; return; }
  const timerId = a.timerId;
  const endTs = Date.now();
  const durationSec = Math.max(0, Math.round((endTs - (a.startTs || endTs)) / 1000));
  DATA.sessions = DATA.sessions || [];
  const already = DATA.sessions.some(s => s.timerId && s.timerId === timerId);
  const _minSec = window.__spkTimerByJump ? SPK_AUTO_MIN_SEC : 1;
  if(!already && durationSec >= _minSec){
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(), moduleId: a.moduleId, subId: a.subId,
      moduleName: a.moduleName, subName: a.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec: 0
    });
  }
  window.active = null;
  DATA.activeTimer = { timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
  window.__spkTimerAuto = false;
  window.__spkTimerByJump = false;
  try{
    document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
    document.dispatchEvent(new CustomEvent('hub:timer-state'));
  }catch(e){}
}
/* 心跳 30s 节流：只刷内存镜像 + lastBeat，同步交给 hubSave 自带 debounce */
if(!window.__spkTimerBeat){
  window.__spkTimerBeat = setInterval(() => {
    if(!window.__spkTimerAuto) return;
    const a = window.active;
    if(!a || a.ended){ return; }
    const now = Date.now();
    a.lastBeat = now; a.updatedAt = now;
    if(DATA.activeTimer && DATA.activeTimer.timerId === a.timerId){ DATA.activeTimer.lastBeat = now; DATA.activeTimer.updatedAt = now; }
    hubSave();
  }, 30000);
}
/* 离页兜底：切后台/关标签即结算本次计时（与背词页互抢时互相正规结算，不丢表）。
   9/23 她改口径：不再「进页自动开表 / 回前台自动续表」——计时只由她点到回答框触发
   （下方 focusin/click 委托），打开页面浏览不动笔的时间不算口语时长。 */
if(!window.__spkTimerLeaveHook){
  window.__spkTimerLeaveHook = true;
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){ try{ commitSpkTimer(); }catch(e){} }
  });
  window.addEventListener('beforeunload', () => { try{ commitSpkTimer(); }catch(e){} });
}
/* 计时触发点：点到回答框（P1/P2 的 .sp-ans、P3 的 .sp-p3-textarea）才开「口语」计时。
   事件委托挂在 document 上：详情页是动态渲染的，focusin 冒泡覆盖所有现役/未来的作答框；
   click 兜底（个别场景点输入框不一定触发 focus）。 */
if(!window.__spkTimerFocusHook){
  window.__spkTimerFocusHook = true;
  const spkTimerTrigger = (e) => {
    const t = e.target;
    if(!t || !t.classList) return;
    if(!(t.classList.contains('sp-ans') || t.classList.contains('sp-p3-textarea'))) return;
    try{ window.__spkTimerByJump = false; maybeStartSpkTimer(); }catch(err){}
  };
  document.addEventListener('focusin', spkTimerTrigger);
  document.addEventListener('click', spkTimerTrigger);
}

/* 回车跳题（9/26 她拍板）：评分结果出来后按回车 = 下一题；最后一小题按回车 = 下一大题。
   焦点在输入框/文本域时不抢（回车要换行）；按钮不可见不触发。
   覆盖 P1 步进行（下一题 / 下一大题 / 完成）与 P2 详情页底部「下一大题」。 */
if(!window.__spEnterHook){
  window.__spEnterHook = true;
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || e.shiftKey) return;
    var t = e.target;
    if(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    var btn = null;
    var nav = document.querySelector('.sp-flow-nav');
    if(nav){
      var cands = ['.sp-flow-next', '#p1NextTopicBtn', '#p1FinishBtn'];
      for(var i = 0; i < cands.length; i++){
        var b = nav.querySelector(cands[i]);
        if(b && !b.hidden && b.offsetParent !== null){ btn = b; break; }
      }
    }
    if(!btn){
      var p2 = document.getElementById('p2NextBtn') || document.getElementById('p2NextBtn2');
      if(p2 && !p2.hidden && p2.offsetParent !== null) btn = p2;
    }
    if(btn){ e.preventDefault(); try{ btn.click(); }catch(err){} }
  });
}
