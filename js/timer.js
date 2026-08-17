var active = null; // {moduleId, moduleName, subId, subName, startTs, paused, pauseStart, pauseAccum}

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
  window.__timerTick = setInterval(updateTimer, 1000);
}

/* 统一写入活动会话：saveActive 是整对象替换，所有字段必须在此列全，
   否则新增的 targetSec/mode 会被覆盖清空（软导航重跑也不会丢）。 */
function persistActive(){
  if(!active) return;
  saveActive({ moduleId: active.moduleId, subId: active.subId, startTs: active.startTs,
    paused: active.paused, pauseStart: active.pauseStart, pauseAccum: active.pauseAccum,
    targetSec: active.targetSec || null, mode: active.mode || 'up' });
}

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

/* 一个模块 = 一张卡片 + 一个「开始」按钮（不再下钻子任务） */
function moduleCard(m){
  const running = active && active.moduleId === m.id;
  const otherRunning = active && active.moduleId !== m.id;
  const btnTxt = running ? '进行中' : '开始';
  const btnCls = running ? 'btn-primary running-badge' : 'btn';
  const disabled = otherRunning ? 'disabled' : '';
  const card = document.createElement('div');
  card.className = 'mod-card' + (running ? ' running' : '');
  card.style.borderTopColor = m.color;
  card.innerHTML = '<div class="mod-title"><span>' + m.icon + '</span>' + m.name + '</div>' +
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
  const m = MODULES.find(x => x.id === moduleId); if(!m) return;
  const gm = parseInt($('#goalMin').value, 10);
  const targetSec = (!isNaN(gm) && gm > 0) ? gm*60 : null;
  const modeEl = document.querySelector('#modeSeg .seg-btn.active');
  const mode = (modeEl && modeEl.dataset.mode) || 'up';
  active = { moduleId, moduleName: m.name, subId: m.id, subName: m.name,
    startTs: Date.now(), paused: false, pauseStart: null, pauseAccum: 0,
    targetSec, mode };
  persistActive();
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
  renderTimer();
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
  persistActive();
  updateTimer();
}

function stopSession(){
  if(!active) return;
  stopTick();
  let totalPauseMs = active.pauseAccum || 0;
  if(active.paused && active.pauseStart) totalPauseMs += (Date.now() - active.pauseStart);
  const endTs = Date.now();
  const totalSec = Math.round((endTs - active.startTs)/1000);
  const pauseSec = Math.round(totalPauseMs/1000);
  const durationSec = Math.max(0, totalSec - pauseSec);
  if((DATA.settings.chimeOnDone !== false) && durationSec > 0) playChime();
  DATA.sessions.push({
    id: uid(), date: todayKey(), moduleId: active.moduleId, subId: active.subId,
    moduleName: active.moduleName, subName: active.subName,
    startTs: active.startTs, endTs, durationSec, pauseSec
  });
  clearActive();   // 关键：结束后必须清掉 localStorage 里的活动会话，
                   // 否则下次进页面会被当成「未结束的计时」按旧 startTs 恢复，
                   // 再结束一次就重复入库、时长虚高。
  hubSave();
  // 通知仪表盘/侧边栏刷新「今日已学」（解耦：只广播事件，不直接调其他页函数）
  document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
  const d = active; active = null;
  $('#activeInfo').textContent = '当前没有进行中的学习';
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = true;
  $('#pauseBtn').disabled = true;
  $('#pauseBtn').textContent = '暂停';
  $('#pauseBtn').className = 'btn';
  $('#liveTimer').textContent = '00:00:00';
  $('#liveTimer').style.color = '';
  renderTimer();
  const focusPct = totalSec > 0 ? Math.round(durationSec/totalSec*100) : 100;
  toast('已保存 ' + d.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) + ' · 专注度 ' + focusPct + '%' : ''));
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

ready(() => {
  stopTick();   // 进页面第一件事：清掉上一次 eval 遗留的孤儿心跳
  $('#stopBtn').addEventListener('click', stopSession);
  $('#pauseBtn').addEventListener('click', togglePause);
  document.querySelectorAll('#modeSeg .seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      setModeUI(b.dataset.mode);
      if(active) active.mode = b.dataset.mode;   // 运行中可即时切换模式
      persistActive();
      updateTimer();
    });
  });
  const saved = loadActive();
  let m = null, fallbackSub = null;
  if(saved){
    if(saved.moduleId) m = MODULES.find(x => x.id === saved.moduleId);
    if(!m && saved.subId){ const f = findSub(saved.subId); if(f){ m = f.m; fallbackSub = f.c.name; } }
  }
  const startDay = saved ? todayKey(new Date(saved.startTs)) : '';
  const sameDay = !!saved && startDay === todayKey();
  const modName = m ? m.name : (saved && saved.moduleId) || '学习';
  const subName = fallbackSub || modName;

  if(m && sameDay){
    active = { moduleId: m.id, moduleName: m.name, subId: m.id, subName: fallbackSub || m.name,
      startTs: saved.startTs, paused: saved.paused || false, pauseStart: saved.pauseStart || null,
      pauseAccum: saved.pauseAccum || 0 };
    active.targetSec = saved.targetSec || null;
    active.mode = saved.mode || 'up';
    if(active.targetSec) $('#goalMin').value = Math.round(active.targetSec/60);
    setModeUI(active.mode);
    $('#activeInfo').innerHTML = '<strong>' + m.name + '</strong> 进行中';
    $('#stopBtn').disabled = false;
    $('#pauseBtn').disabled = false;
    $('#pauseBtn').textContent = active.paused ? '继续' : '暂停';
    $('#pauseBtn').className = active.paused ? 'btn btn-primary' : 'btn';
    startTick();
    updateTimer();
    renderTimer();
    toast('已恢复未结束的计时：' + m.name + (active.paused ? '（暂停中）' : ''));
    return;
  }
  // Bug11：跨天计时不再丢弃，自动结算昨天那段时长，今天从 0 点重新计时
  if(saved && !sameDay){
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const endPrev = startOfToday.getTime();
    let pauseMsPrev = saved.pauseAccum || 0;
    if(saved.paused && saved.pauseStart) pauseMsPrev += (endPrev - saved.pauseStart);
    const totalSec = Math.max(0, Math.round((endPrev - saved.startTs)/1000));
    const pauseSec = Math.min(totalSec, Math.max(0, Math.round(pauseMsPrev/1000)));
    const durationSec = Math.max(0, totalSec - pauseSec);
    if(durationSec > 0){
      DATA.sessions.push({
        id: uid(), date: startDay, moduleId: saved.moduleId, subId: saved.subId,
        moduleName: modName, subName,
        startTs: saved.startTs, endTs: endPrev, durationSec, pauseSec
      });
      hubSave();
    }
    if(m){
      active = { moduleId: m.id, moduleName: modName, subId: saved.subId, subName: subName,
        startTs: startOfToday.getTime(), paused: false, pauseStart: null, pauseAccum: 0,
        targetSec: saved.targetSec || null, mode: saved.mode || 'up' };
      persistActive();
      $('#activeInfo').innerHTML = '<strong>' + modName + '</strong> 进行中';
      $('#stopBtn').disabled = false;
      $('#pauseBtn').disabled = false;
      $('#pauseBtn').textContent = '暂停';
      $('#pauseBtn').className = 'btn';
      toast('检测到跨天计时：已结算昨天 ' + fmtHM(durationSec) + '，并从今天 0 点继续计时');
      startTick();
      updateTimer();
      renderTimer();
      return;
    }
    // 原模块已不存在：只结算昨天那段，清掉活动会话
    if(durationSec > 0) toast('检测到跨天计时：已结算昨天 ' + fmtHM(durationSec) + '（原模块已不存在，今日计时已清零）');
    clearActive();
    renderTimer();
    return;
  }
  if(saved) clearActive();
  renderTimer();
});
