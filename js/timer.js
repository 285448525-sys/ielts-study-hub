var active = null; // 本机「活跃计时」态：仅当本机是计时拥有者时存在。
                     // {timerId, ownerDevice, moduleId, moduleName, subId, subName,
                     //  startTs, paused, pauseStart, pauseAccum, targetSec, mode, updatedAt}

/* ── 计时器心跳：必须挂在 window 上，不能存在 active 里 ──────────────────
   软导航（common.js runPageScript）用 window.eval 重跑本脚本，每次 eval 的
   `let active` 都是全新的词法绑定；上一次 eval 的 setInterval 不会自动停，
   它还抓着旧的 active 对象继续往新 DOM 的 #liveTimer 里写 →
   表现为「点了结束计时器还在跑 / 同时跑好几份 / 数字乱跳」。
   用全局唯一句柄 window.__timerTick，每次进页面先清掉上一份，彻底断根。 */
function stopTick(){
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
}
function startTick(){
  stopTick();
  window.__timerTick = setInterval(() => { updateTimer(); updateRemoteTimer(); }, 1000);
}

/* ── 单一可信源：云端镜像 DATA.activeTimer ───────────────────────────────
   结构（v2）：
     { timerId, ownerDevice, moduleId, moduleName, subId, subName,
       startTs, paused, pauseStart, pauseAccum, targetSec, mode,
       updatedAt, lastBeat, ended }
   - timerId：全局唯一，一次计时生命周期内不变（跨端同一份）
   - ownerDevice：发起设备的 deviceId；非 owner 端只读不写
   - lastBeat：owner 每 5s 续租的心跳；运行态超过 REMOTE_MS(90s) 视为 owner 离线（暂停态永不判定离线，故长暂停不会被误抢）
   - ended：true 表示已结算，两端见此即清本地态、不再续租/恢复
   本机 ACTIVE_KEY 仅作「恢复锚点」，不参与跨端新旧判定（旧逻辑靠 updatedAt
   比大小会误把已结束计时当"较新进行中"复活，是累加 bug 的根因之一）。 */
const REMOTE_MS = 90000; // 远端计时「可显示 / 在线」窗口：远大于 30s 轮询间隔，避免正常轮询间隙被误判离线或被抢
function getDeviceId(){
  try{
    let id = localStorage.getItem('ielts_hub_device');
    if(!id){ id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); localStorage.setItem('ielts_hub_device', id); }
    return id;
  }catch(e){ return 'd' + Date.now().toString(36); }
}

/* 写本地恢复锚点（仅本机持有活跃计时时调，用于刷新后找回，不进云端判定） */
function persistLocalActive(){
  if(!active) return;
  saveActive({ timerId: active.timerId, ownerDevice: active.ownerDevice, moduleId: active.moduleId, subId: active.subId,
    startTs: active.startTs, paused: active.paused, pauseStart: active.pauseStart, pauseAccum: active.pauseAccum,
    targetSec: active.targetSec || null, mode: active.mode || 'up', updatedAt: active.updatedAt, lastBeat: active.lastBeat });
}

/* 写云端镜像（单一可信源）。仅在「本机是 owner 且未结束」时调用。 */
function persistMirror(){
  if(!active) return;
  active.updatedAt = Date.now();
  active.lastBeat = Date.now();
  DATA.activeTimer = {
    timerId: active.timerId, ownerDevice: active.ownerDevice,
    moduleId: active.moduleId, moduleName: active.moduleName, subId: active.subId, subName: active.subName,
    startTs: active.startTs, paused: active.paused, pauseStart: active.pauseStart, pauseAccum: active.pauseAccum,
    targetSec: active.targetSec || null, mode: active.mode || 'up',
    updatedAt: active.updatedAt, lastBeat: active.lastBeat, ended: false
  };
  hubSave();   // 走防抖上传，另一端 30s 内合并可见
}
/* 广播结束（带 timerId，另一端合并后清本地态、不二次入库） */
function broadcastEnded(timerId){
  DATA.activeTimer = { timerId: timerId || (active && active.timerId) || null, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  hubSave();
}
/* 镜像是否「可显示」（本端只读展示）：未结束、非本机持有；
   暂停态始终可显示（暂停是主动空闲，不应被误判离线）；运行态要求 lastBeat 在 REMOTE_MS 内 */
function remoteShowable(m){
  if(!m || m.ended || !m.timerId) return false;
  if((m.ownerDevice || '') === getDeviceId()) return false;
  if(m.paused) return true;
  return (Date.now() - _num(m.lastBeat)) < REMOTE_MS;
}
/* 是否应「接管」离线设备：仅当运行态且 lastBeat 过期（暂停态绝不接管，否则长暂停会被误抢） */
function shouldTakeover(m){
  if(!m || m.ended || !m.timerId) return false;
  if((m.ownerDevice || '') === getDeviceId()) return false;
  if(m.paused) return false;
  return (Date.now() - _num(m.lastBeat)) >= REMOTE_MS;
}
/* 镜像是否由「他人」持有且本端应只读（用于禁用其他模块卡开新计时） */
function mirrorHeldByOther(m){ return remoteShowable(m); }

function setModeUI(mode){
  document.querySelectorAll('#modeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

/* 本地合成轻柔提示音：Web Audio 振荡器，不引入音频文件（离线可用、无版权/加载问题） */
var audioCtx = null;
function ensureAudio(){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }catch(e){}
}
function playChime(){
  try{
    if(!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [[660,0],[880,0.18]].forEach(([f,dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt);
      g.gain.linearRampToValueAtTime(0.18, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.55);
    });
  }catch(e){}
}
function doneNotify(title, body){
  try{
    if(DATA.settings.notifyOnDone && 'Notification' in window && Notification.permission === 'granted'){
      new Notification(title, { body });
    }
  }catch(e){}
}

/* 远端计时只读展示（他人持有且可显示时调用）：本机不持有 active，按云端镜像的
   startTs / 暂停状态本地计算并每秒刷新，使两端显示完全一致的实时计时。 */
function renderRemoteActive(){
  const m = DATA.activeTimer;
  if(!remoteShowable(m)) return false;
  const mod = MODULES.find(x => x.id === m.moduleId);
  const mName = m.moduleName || (mod && mod.name) || '学习';
  $('#activeInfo').innerHTML = '📱 另一设备正在计时：<strong>' + escapeHtml(mName) + '</strong>';
  $('#stopBtn').disabled = true;
  $('#pauseBtn').disabled = true;
  window.__timerActive = true;
  updateRemoteTimer();   // 立即渲染一次（含暂停态），之后由 startTick 每秒刷新
  startTick();
  renderTimer();
  return true;
}
/* 远端计时每秒刷新：按镜像 startTs + 暂停累积本地计算 elapsed（与拥有端同源、实时一致） */
function updateRemoteTimer(){
  const m = DATA.activeTimer;
  if(!m || m.ended || (m.ownerDevice || '') === getDeviceId()) return;   // 仅展示他人计时
  const liveTimer = $('#liveTimer');
  if(!liveTimer) return;
  const started = _num(m.startTs);
  let pause = _num(m.pauseAccum);
  if(m.paused && m.pauseStart) pause += (Date.now() - _num(m.pauseStart));
  const elapsed = Math.max(0, (Date.now() - started - pause) / 1000);
  const mode = m.mode || 'up';
  if(m.paused){
    liveTimer.textContent = '已暂停 ' + fmtHMS(pause);
    liveTimer.style.color = 'var(--muted)';
    $('#focusInfo').textContent = '在「' + (m.ownerDevice || '其他设备') + '」上已暂停 · 本机只读展示';
  } else if(mode === 'down' && m.targetSec){
    const remain = Math.max(0, m.targetSec - elapsed);
    liveTimer.textContent = fmtHMS(remain);
    liveTimer.style.color = remain <= 0 ? 'var(--med)' : 'var(--primary)';
    $('#focusInfo').textContent = '在「' + (m.ownerDevice || '其他设备') + '」上进行中 · 本机只读展示';
  } else {
    liveTimer.textContent = fmtHMS(elapsed);
    liveTimer.style.color = 'var(--primary)';
    $('#focusInfo').textContent = '在「' + (m.ownerDevice || '其他设备') + '」上进行中 · 本机只读展示';
  }
}

/* 模块图标：单色线性 SVG（emoji → SVG，与全站图标规范一致；仅计时页用） */
const MOD_ICONS = {
  listening:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/></svg>',
  reading:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z"/></svg>',
  writing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L15.5 5.5a2 2 0 0 1 3 3L8 19z"/><line x1="14" y1="7" x2="17" y2="10"/></svg>',
  speaking:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10H9l-4 4z"/><line x1="8" y1="9" x2="15" y2="9"/></svg>',
  vocab:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6"/></svg>'
};

/* 一个模块 = 一个 chip + 一个小「开始」按钮（不再下钻子任务） */
function moduleCard(m){
  const running = active && active.moduleId === m.id;
  const otherRunning = (active && active.moduleId !== m.id) || mirrorHeldByOther(DATA.activeTimer);
  const btnTxt = running ? '进行中' : (mirrorHeldByOther(DATA.activeTimer) ? '占用中' : '开始');
  const btnCls = running ? 'btn-primary running-badge' : 'btn';
  const disabled = otherRunning ? 'disabled' : '';
  const card = document.createElement('div');
  card.className = 'mod-card' + (running ? ' running' : '');
  card.innerHTML = '<div class="mod-ic">' + (MOD_ICONS[m.id] || m.icon) + '</div>' +
    '<div class="mod-name">' + m.name + '</div>' +
    '<button class="btn ' + btnCls + ' timer-start" data-mod="' + m.id + '" ' + disabled + '>' + btnTxt + '</button>';
  return card;
}

function renderTimer(){
  const box = document.getElementById('timerMods');
  if(!box) return;
  box.innerHTML = '';
  // 顺序：听力 / 阅读 / 写作 / 口语 / 背单词，桌面端呈现 3+2 居中布局
  const order = ['listening','reading','writing','speaking','vocab'];
  order.forEach(id => {
    const m = MODULES.find(x => x.id === id);
    if(m) box.appendChild(moduleCard(m));
  });
  bindStartButtons();
}

function bindStartButtons(){
  document.querySelectorAll('.timer-start').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.mod;
      if(active && active.moduleId === id) stopSession();
      else if(!active) startSession(id);
    });
  });
}

/* 当前活跃学习时长（毫秒，已扣除暂停） */
function activeMs(){
  if(!active) return 0;
  let ms = Date.now() - active.startTs - (active.pauseAccum || 0);
  if(active.paused && active.pauseStart) ms -= (Date.now() - active.pauseStart);
  return Math.max(0, ms);
}
/* 当前累计暂停时长（毫秒） */
function pauseMs(){
  if(!active) return 0;
  let ms = active.pauseAccum || 0;
  if(active.paused && active.pauseStart) ms += (Date.now() - active.pauseStart);
  return Math.max(0, ms);
}

/* 直接以「模块」开始计时（不再选子任务） */
function startSession(moduleId){
  // 单一可信源守卫：若云端镜像显示「他人正持有活跃计时」，禁止本机再开（消除双端同时计时）
  if(mirrorHeldByOther(DATA.activeTimer)){
    renderTimer();
    toast('另一设备正在进行「' + (DATA.activeTimer.moduleName || '学习') + '」计时，请先在那边结束', 3500);
    return;
  }
  const m = MODULES.find(x => x.id === moduleId); if(!m) return;
  const gm = parseInt($('#goalMin').value, 10);
  const targetSec = (!isNaN(gm) && gm > 0) ? gm*60 : null;
  const modeEl = document.querySelector('#modeSeg .seg-btn.active');
  const mode = (modeEl && modeEl.dataset.mode) || 'up';
  const now = Date.now();
  active = { timerId: uid(), ownerDevice: getDeviceId(), moduleId, moduleName: m.name, subId: m.id, subName: m.name,
    startTs: now, paused: false, pauseStart: null, pauseAccum: 0,
    targetSec, mode, updatedAt: now, lastBeat: now };
  persistLocalActive();
  persistMirror();        // 立即写云端可信源
  ensureAudio();
  if(DATA.settings.notifyOnDone && 'Notification' in window && Notification.permission === 'default'){ Notification.requestPermission(); }
  $('#activeInfo').innerHTML = '<strong>' + m.name + '</strong> 进行中';
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = false;
  $('#pauseBtn').disabled = false;
  $('#pauseBtn').textContent = '暂停';
  $('#pauseBtn').className = 'btn';
  toast('已开始：' + m.name);
  startTick();
  startHeartbeat();   // 开始续租云端心跳，另一端据 lastBeat 判断本机在线
  renderTimer();
  document.dispatchEvent(new CustomEvent('hub:timer-state'));   // 通知全局徽标出现
}

function togglePause(){
  if(!active) return;
  if(!active.paused){
    active.paused = true;
    active.pauseStart = Date.now();
    $('#pauseBtn').textContent = '继续';
    $('#pauseBtn').className = 'btn btn-primary';
    toast('已暂停，回来点「继续」就好');
  } else {
    active.pauseAccum = (active.pauseAccum || 0) + (Date.now() - active.pauseStart);
    active.paused = false;
    active.pauseStart = null;
    $('#pauseBtn').textContent = '暂停';
    $('#pauseBtn').className = 'btn';
    toast('继续学习，加油');
  }
  persistLocalActive();
  persistMirror();
  updateTimer();
  document.dispatchEvent(new CustomEvent('hub:timer-state'));   // 暂停/继续时同步徽标状态
}

function stopSession(){
  if(!active) return;
  stopTick();
  stopHeartbeat();
  const timerId = active.timerId;
  let totalPauseMs = active.pauseAccum || 0;
  if(active.paused && active.pauseStart) totalPauseMs += (Date.now() - active.pauseStart);
  const endTs = Date.now();
  const totalSec = Math.round((endTs - active.startTs)/1000);
  const pauseSec = Math.round(totalPauseMs/1000);
  const durationSec = Math.max(0, totalSec - pauseSec);
  // 入库去重：同一 timerId 只结算一次（防双端各自结束 → 两段计时叠加进当日统计）
  const already = DATA.sessions.some(s => s.timerId && s.timerId === timerId);
  if(!already && durationSec > 0){
    if((DATA.settings.chimeOnDone !== false)) playChime();
    DATA.sessions.push({
      id: uid(), timerId, date: todayKey(), moduleId: active.moduleId, subId: active.subId,
      moduleName: active.moduleName, subName: active.subName,
      startTs: active.startTs, endTs, durationSec, pauseSec
    });
    hubSave();   // 入库走 hubSave：本机持久化 + 防抖上传（含 ended 广播）
  }
  clearActive();              // 清本机恢复锚点
  broadcastEnded(timerId);    // 广播 ended（带 timerId），另一端合并后清本地态、不二次入库
  const d = active; active = null;
  window.__timerActive = false;
  // 通知首页/侧边栏刷新「今日已学」
  document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
  document.dispatchEvent(new CustomEvent('hub:timer-state'));   // 通知全局徽标消失
  $('#activeInfo').textContent = '当前没有进行中的学习';
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = true;
  $('#pauseBtn').disabled = true;
  $('#pauseBtn').textContent = '暂停';
  $('#pauseBtn').className = 'btn';
  $('#liveTimer').textContent = '00:00:00';
  $('#liveTimer').style.color = '';
  renderTimer();
  if(already){
    toast('该段计时已在其他设备结算，本端不再重复记录');
  } else {
    const focusPct = totalSec > 0 ? Math.round(durationSec/totalSec*100) : 100;
    toast('已保存 ' + d.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) + ' · 专注度 ' + focusPct + '%' : ''));
  }
}

function updateTimer(){
  if(!active) return;
  const liveTimer = $('#liveTimer');
  if(!liveTimer){ stopTick(); return; }   // 已软导航离开计时页：DOM 没了就停掉心跳
  const elapsed = activeMs()/1000;
  const pg = $('#timerProgress');
  if(active.paused){
    liveTimer.textContent = '已暂停 ' + fmtHMS(pauseMs()/1000);
    liveTimer.style.color = 'var(--muted)';
    $('#focusInfo').textContent = '已学习 ' + fmtHM(elapsed) + ' · 点「继续」恢复计时';
    if(pg) pg.innerHTML = '';
    return;
  }
  if(active.mode === 'down' && active.targetSec){
    const remain = Math.max(0, active.targetSec - elapsed);
    liveTimer.textContent = fmtHMS(remain);
    liveTimer.style.color = remain <= 0 ? 'var(--med)' : 'var(--primary)';
    const pct = active.targetSec>0 ? Math.min(100, elapsed/active.targetSec*100) : 0;
    if(pg) pg.innerHTML = progressBar('距目标', pct, remain<=0 ? 'var(--med)' : 'var(--primary)');
    if(remain <= 0 && !active._done){
      active._done = true;
      playChime();
      doneNotify('🎉 专注目标达成', '本次计划专注已结束，休息一下吧～');
      toast('🎉 本次目标达成！');
    }
  } else {
    liveTimer.textContent = fmtHMS(elapsed);
    liveTimer.style.color = 'var(--primary)';
    if(active.targetSec && pg){
      const pct = Math.min(100, elapsed/active.targetSec*100);
      pg.innerHTML = progressBar('距目标', pct);
    } else if(pg){ pg.innerHTML = ''; }
  }
  const p = pauseMs();
  $('#focusInfo').textContent = p > 0 ? '中途暂停过 ' + fmtHM(p/1000) : '';
}

/* 心跳续租：owner 每 5s 刷新 mirror.lastBeat，让另一端能判断「本机在线」 */
function startHeartbeat(){
  stopHeartbeat();
  window.__timerBeat = setInterval(() => {
    if(active && !active.paused){ persistMirror(); }   // 暂停时不续租：留给另一端判定托管
  }, 5000);
}
function stopHeartbeat(){
  if(window.__timerBeat){ clearInterval(window.__timerBeat); window.__timerBeat = null; }
}
/* 跨端接管：打开计时页时，若云端镜像由「他人」持有但已离线（lastBeat 过期），
   本机作为新 owner 接管该计时（保留 startTs/暂停累积，不重复起算） */
function maybeTakeover(){
  const m = DATA.activeTimer;
  if(!m || m.ended || !m.timerId) return false;
  const me = getDeviceId();
  if((m.ownerDevice || '') === me) return false;          // 自己拥有：不接管
  if(!shouldTakeover(m)) return false;                    // 他人仍在线或已暂停：不抢
  // 他人离线 → 接管：用镜像数据重建本机 active，owner 改为本机
  const mod = MODULES.find(x => x.id === m.moduleId);
  active = { timerId: m.timerId, ownerDevice: me,
    moduleId: m.moduleId, moduleName: m.moduleName || (mod && mod.name) || '学习',
    subId: m.subId || m.moduleId, subName: m.subName || (mod && mod.name) || '学习',
    startTs: _num(m.startTs), paused: !!m.paused, pauseStart: m.pauseStart ? _num(m.pauseStart) : null,
    pauseAccum: _num(m.pauseAccum), targetSec: m.targetSec || null, mode: m.mode || 'up',
    updatedAt: Date.now(), lastBeat: Date.now() };
  persistLocalActive();
  persistMirror();   // 接管后立即可信源刷新为「本机拥有」
  return true;
}

ready(() => {
  stopTick();   // 进页面第一件事：清掉上一次 eval 遗留的孤儿心跳
  stopHeartbeat();
  // 运行中不自动 reload——reload 会导致页面频繁刷新（手机端切前台触发 visibilitychange→cloudDownload→merged→reload 循环）。
  // 跨设备计时恢复改为仅在页面加载时（ready）从镜像恢复，运行中不自动重载。手动刷新即可看到最新状态。
  document.removeEventListener('hub:data-merged', window.__timerMerged);
  window.__timerMerged = () => {
    const m = DATA.activeTimer;
    // 场景A：另一端结束（ended 广播），本机仍持同 timerId 活跃态 → 清掉、不二次入库
    if(m && m.ended && active && m.timerId && active.timerId === m.timerId){
      stopTick(); stopHeartbeat();
      clearActive();
      active = null; window.__timerActive = false;
      $('#activeInfo').textContent = '当前没有进行中的学习';
      $('#focusInfo').textContent = '';
      $('#stopBtn').disabled = true; $('#pauseBtn').disabled = true;
      $('#pauseBtn').textContent = '暂停'; $('#pauseBtn').className = 'btn';
      $('#liveTimer').textContent = '00:00:00'; $('#liveTimer').style.color = '';
      renderTimer();
      toast('该段计时已在其他设备结束');
      return;
    }
    // 场景B：本机无活跃态，但镜像显示他人正计时 → 实时只读展示（不刷新打断）
    if(!active && m && !m.ended && m.timerId && (m.ownerDevice || '') !== getDeviceId()){
      renderRemoteActive();
    }
  };
  document.addEventListener('hub:data-merged', window.__timerMerged);
  $('#stopBtn').addEventListener('click', stopSession);
  $('#pauseBtn').addEventListener('click', togglePause);
  document.querySelectorAll('#modeSeg .seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      setModeUI(b.dataset.mode);
      if(active) active.mode = b.dataset.mode;   // 运行中可即时切换模式
      persistLocalActive();
      persistMirror();
      updateTimer();
    });
  });

  /* ── 恢复逻辑（单一可信源 = 云端镜像 DATA.activeTimer） ──
     优先级：
       1) 镜像 ended          → 本机若有同 timerId 活跃态则清掉（防二次入库），不恢复
       2) 镜像由他人持有且在线 → 只读展示「他人进行中」，本机禁止开新计时
       3) 镜像由他人持有但离线 → maybeTakeover 接管为本地活跃
       4) 镜像由本机持有（owner=me）→ 直接用镜像恢复为本地活跃
       5) 本机仅有 ACTIVE_KEY 锚点（未同步过云端，如离线起步）→ 以本地锚点恢复
     跨天：镜像 startTs 非今日 → 结算昨日段，今日 0 点起重开（沿用旧逻辑） */

  const mirror = DATA.activeTimer || null;
  const localSaved = loadActive();
  const me = getDeviceId();
  let restored = false;

  // 1) 已结束：清本机活跃态，不恢复
  if(mirror && mirror.ended){
    if(active && mirror.timerId && active.timerId === mirror.timerId){ /* 不应发生，ready 时 active 还空 */ }
    if(localSaved && mirror.timerId && localSaved.timerId === mirror.timerId) clearActive();
    else if(localSaved) clearActive();
    renderTimer();
    return;
  }

  // 2) 他人持有且可显示：只读展示（实时 tick，与拥有端一致）
  if(remoteShowable(mirror)){
    renderRemoteActive();
    return;
  }

  // 3) 他人持有但已离线（运行态 lastBeat 过期）→ 接管
  if(shouldTakeover(mirror)){
    if(maybeTakeover()){
      const mod = MODULES.find(x => x.id === active.moduleId);
      if(active.targetSec) $('#goalMin').value = Math.round(active.targetSec/60);
      setModeUI(active.mode || 'up');
      $('#activeInfo').innerHTML = '<strong>' + (active.moduleName || (mod&&mod.name) || '学习') + '</strong> 进行中（已接管离线设备）';
      $('#stopBtn').disabled = false; $('#pauseBtn').disabled = false;
      $('#pauseBtn').textContent = active.paused ? '继续' : '暂停';
      $('#pauseBtn').className = active.paused ? 'btn btn-primary' : 'btn';
      startTick(); startHeartbeat(); updateTimer(); renderTimer();
      window.__timerActive = true;
      toast('已接管离线设备的计时：' + (active.moduleName || (mod&&mod.name) || '学习') + (active.paused ? '（暂停中）' : ''));
      return;
    }
  }

  // 4) 本机是 owner（含镜像无 ownerDevice 的旧数据）→ 用镜像恢复
  // 5) 仅有本地锚点（离线起步、云端无镜像）→ 用本地锚点恢复
  let saved = null;
  if(mirror && mirror.timerId && (mirror.ownerDevice || '') === me){
    saved = mirror;
  } else if(localSaved && localSaved.timerId){
    saved = localSaved;   // 离线起步：本地锚点优先，进入后 persistMirror 会补回云端
  } else if(mirror && mirror.timerId){
    saved = mirror;       // 旧镜像无 ownerDevice 字段：兼容恢复
  }

  if(saved){
    const mod = MODULES.find(x => x.id === saved.moduleId);
    const startDay = todayKey(_num(saved.startTs));
    const sameDay = startDay === todayKey();
    // 跨天结算（沿用旧逻辑）
    if(!sameDay){
      const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
      const endPrev = startOfToday.getTime();
      let pPrev = _num(saved.pauseAccum);
      if(saved.paused && saved.pauseStart) pPrev += (endPrev - _num(saved.pauseStart));
      const totalSec = Math.max(0, Math.round((endPrev - _num(saved.startTs))/1000));
      const pauseSec = Math.min(totalSec, Math.max(0, Math.round(pPrev/1000)));
      const durationSec = Math.max(0, totalSec - pauseSec);
      const mName = saved.moduleName || (mod && mod.name) || '学习';
      const already = DATA.sessions.some(s => s.timerId && s.timerId === saved.timerId);
      if(durationSec > 0 && !already){
        DATA.sessions.push({ id: uid(), timerId: saved.timerId || null, date: startDay,
          moduleId: saved.moduleId, subId: saved.subId || saved.moduleId, moduleName: mName, subName: saved.subName || mName,
          startTs: _num(saved.startTs), endTs: endPrev, durationSec, pauseSec });
        hubSave();
      }
      // 今日从 0 点重新计时（owner 改本机）
      active = { timerId: saved.timerId || uid(), ownerDevice: me, moduleId: saved.moduleId,
        moduleName: mName, subId: saved.subId || saved.moduleId, subName: saved.subName || mName,
        startTs: startOfToday.getTime(), paused: false, pauseStart: null, pauseAccum: 0,
        targetSec: saved.targetSec || null, mode: saved.mode || 'up', updatedAt: Date.now(), lastBeat: Date.now() };
      persistLocalActive(); persistMirror();
      $('#activeInfo').innerHTML = '<strong>' + mName + '</strong> 进行中';
      $('#stopBtn').disabled = false; $('#pauseBtn').disabled = false;
      $('#pauseBtn').textContent = '暂停'; $('#pauseBtn').className = 'btn';
      if(active.targetSec) $('#goalMin').value = Math.round(active.targetSec/60);
      setModeUI(active.mode || 'up');
      toast('检测到跨天计时：已结算昨天 ' + fmtHM(durationSec) + '，并从今天 0 点继续计时');
      startTick(); startHeartbeat(); updateTimer(); renderTimer();
      window.__timerActive = true;
      return;
    }
    // 同日恢复
    active = { timerId: saved.timerId || uid(), ownerDevice: (saved.ownerDevice || me),
      moduleId: saved.moduleId, moduleName: saved.moduleName || (mod && mod.name) || '学习',
      subId: saved.subId || saved.moduleId, subName: saved.subName || (mod && mod.name) || '学习',
      startTs: _num(saved.startTs), paused: !!saved.paused, pauseStart: saved.pauseStart ? _num(saved.pauseStart) : null,
      pauseAccum: _num(saved.pauseAccum), targetSec: saved.targetSec || null, mode: saved.mode || 'up',
      updatedAt: Date.now(), lastBeat: Date.now() };
    persistLocalActive();
    if((saved.ownerDevice || '') !== me) persistMirror();   // 旧镜像无 owner：补写 owner 回云端
    else persistMirror();
    if(active.targetSec) $('#goalMin').value = Math.round(active.targetSec/60);
    setModeUI(active.mode || 'up');
    $('#activeInfo').innerHTML = '<strong>' + active.moduleName + '</strong> 进行中';
    $('#stopBtn').disabled = false; $('#pauseBtn').disabled = false;
    $('#pauseBtn').textContent = active.paused ? '继续' : '暂停';
    $('#pauseBtn').className = active.paused ? 'btn btn-primary' : 'btn';
    startTick(); startHeartbeat(); updateTimer(); renderTimer();
    window.__timerActive = true;
    toast('已恢复未结束的计时：' + active.moduleName + (active.paused ? '（暂停中）' : ''));
    return;
  }

  // 无任何活跃源
  renderTimer();
});
