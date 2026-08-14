let active = null; // {subId, moduleId, moduleName, subName, startTs, tick, paused, pauseStart, pauseAccum}
let timerMode = 'vocab'; // 'vocab' | 'subject'

function renderModeTabs(){
  $('#modeTabs').querySelectorAll('[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === timerMode);
  });
}

function renderGrid(){
  const grid = $('#moduleGrid'); grid.innerHTML = '';
  const modules = MODULES.filter(m => timerMode === 'vocab' ? m.id === 'vocab' : m.id !== 'vocab');
  for(const m of modules){
    const card = document.createElement('div');
    card.className = 'mod-card';
    let html = '<div class="mod-title"><span>' + m.icon + '</span>' + m.name + '</div>';
    for(const c of m.children){
      const running = active && active.subId === c.id;
      const disabled = active && !running ? 'disabled' : '';
      const txt = running ? '进行中' : '开始';
      const cls = running ? 'btn-primary' : 'btn';
      html += '<div class="sub-row"><span class="sub-name">' + (c.icon ? c.icon + ' ' : '') + c.name + '</span><button class="btn ' + cls + '" data-sub="' + c.id + '" ' + disabled + '>' + txt + '</button></div>';
    }
    card.innerHTML = html;
    grid.appendChild(card);
  }
  grid.querySelectorAll('button[data-sub]').forEach(b => {
    b.addEventListener('click', () => {
      const subId = b.dataset.sub;
      if(active && active.subId === subId) stopSession();
      else if(!active) startSession(subId);
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

function startSession(subId){
  const f = findSub(subId); if(!f) return;
  active = { subId, moduleId: f.m.id, moduleName: f.m.name, subName: f.c.name,
    startTs: Date.now(), paused: false, pauseStart: null, pauseAccum: 0 };
  saveActive({ subId, startTs: active.startTs, paused: false, pauseStart: null, pauseAccum: 0 });
  $('#activeInfo').innerHTML = '<strong>' + f.m.name + ' › ' + f.c.name + '</strong> 进行中';
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = false;
  $('#pauseBtn').disabled = false;
  $('#pauseBtn').textContent = '暂停';
  $('#pauseBtn').className = 'btn';
  toast('已开始：' + f.c.name);
  active.tick = setInterval(updateTimer, 1000);
  renderGrid();
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
  saveActive({ subId: active.subId, startTs: active.startTs, paused: active.paused,
    pauseStart: active.pauseStart, pauseAccum: active.pauseAccum });
  updateTimer();
}

function stopSession(){
  if(!active) return;
  clearInterval(active.tick);
  let totalPauseMs = active.pauseAccum || 0;
  if(active.paused && active.pauseStart) totalPauseMs += (Date.now() - active.pauseStart);
  const endTs = Date.now();
  const totalSec = Math.round((endTs - active.startTs)/1000);
  const pauseSec = Math.round(totalPauseMs/1000);
  const durationSec = Math.max(0, totalSec - pauseSec);
  DATA.sessions.push({
    id: uid(), date: todayKey(), moduleId: active.moduleId, subId: active.subId,
    moduleName: active.moduleName, subName: active.subName,
    startTs: active.startTs, endTs, durationSec, pauseSec
  });
  hubSave();
  const d = active; active = null;
  $('#activeInfo').textContent = '当前没有进行中的学习';
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = true;
  $('#pauseBtn').disabled = true;
  $('#pauseBtn').textContent = '暂停';
  $('#pauseBtn').className = 'btn';
  $('#liveTimer').textContent = '00:00:00';
  $('#liveTimer').style.color = '';
  renderGrid();
  const focusPct = totalSec > 0 ? Math.round(durationSec/totalSec*100) : 100;
  toast('已保存 ' + d.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) + ' · 专注度 ' + focusPct + '%' : ''));
}

function updateTimer(){
  if(!active) return;
  const liveTimer = $('#liveTimer');
  if(active.paused){
    liveTimer.textContent = '已暂停 ' + fmtHMS(pauseMs()/1000);
    liveTimer.style.color = 'var(--muted)';
    $('#focusInfo').textContent = '已学习 ' + fmtHM(activeMs()/1000) + ' · 点「继续」恢复计时';
  } else {
    liveTimer.textContent = fmtHMS(activeMs()/1000);
    liveTimer.style.color = 'var(--primary)';
    const p = pauseMs();
    $('#focusInfo').textContent = p > 0 ? '中途暂停过 ' + fmtHM(p/1000) : '';
  }
}

function switchMode(newMode){
  if(newMode === timerMode) return;
  if(active){
    if(!confirm('切换模式会停止当前计时并保存，是否继续？')) return;
    stopSession();
  }
  timerMode = newMode;
  renderModeTabs();
  renderGrid();
}

ready(() => {
  $('#modeTabs').querySelectorAll('[data-mode]').forEach(b => {
    b.addEventListener('click', () => switchMode(b.dataset.mode));
  });
  $('#stopBtn').addEventListener('click', stopSession);
  $('#pauseBtn').addEventListener('click', togglePause);
  renderModeTabs();
  const saved = loadActive();
  if(saved && todayKey(new Date(saved.startTs)) === todayKey()){
    const f = findSub(saved.subId);
    if(f){
      active = { subId: saved.subId, moduleId: f.m.id, moduleName: f.m.name, subName: f.c.name,
        startTs: saved.startTs, paused: saved.paused || false, pauseStart: saved.pauseStart || null,
        pauseAccum: saved.pauseAccum || 0 };
      // 根据恢复的子项自动切换到对应模式
      timerMode = (f.m.id === 'vocab') ? 'vocab' : 'subject';
      renderModeTabs();
      $('#activeInfo').innerHTML = '<strong>' + f.m.name + ' › ' + f.c.name + '</strong> 进行中';
      $('#stopBtn').disabled = false;
      $('#pauseBtn').disabled = false;
      $('#pauseBtn').textContent = active.paused ? '继续' : '暂停';
      $('#pauseBtn').className = active.paused ? 'btn btn-primary' : 'btn';
      active.tick = setInterval(updateTimer, 1000);
      updateTimer();
      renderGrid();
      toast('已恢复未结束的计时：' + f.c.name + (active.paused ? '（暂停中）' : ''));
      return;
    }
  }
  if(saved) clearActive();
  renderGrid();
});
