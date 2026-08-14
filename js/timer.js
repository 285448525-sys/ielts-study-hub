let active = null; // {subId, moduleId, moduleName, subName, startTs, tick, paused, pauseStart, pauseAccum}

function renderGrid(){
  const grid = $('#moduleGrid'); grid.innerHTML = '';
  for(const m of MODULES){
    const card = document.createElement('div');
    card.className = 'mod-card';
    let html = `<div class="mod-title"><span>${m.icon}</span>${m.name}</div>`;
    for(const c of m.children){
      const running = active && active.subId === c.id;
      const disabled = active && !running ? 'disabled' : '';
      const txt = running ? '进行中…' : '开始';
      const cls = running ? 'btn-primary' : 'btn';
      html += `<div class="sub-row">
        <span class="sub-name">${c.icon ? c.icon+' ' : ''}${c.name}</span>
        <button class="btn ${cls}" data-sub="${c.id}" ${disabled}>${txt}</button>
      </div>`;
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
  $('#activeInfo').innerHTML = `<strong>${f.m.name} › ${f.c.name}</strong> 进行中`;
  $('#focusInfo').textContent = '';
  $('#stopBtn').disabled = false;
  $('#pauseBtn').disabled = false;
  $('#pauseBtn').textContent = '⏸ 暂停';
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
    $('#pauseBtn').textContent = '▶ 继续';
    $('#pauseBtn').className = 'btn btn-primary';
    toast('已暂停，回来点「继续」就好');
  } else {
    active.pauseAccum = (active.pauseAccum || 0) + (Date.now() - active.pauseStart);
    active.paused = false;
    active.pauseStart = null;
    $('#pauseBtn').textContent = '⏸ 暂停';
    $('#pauseBtn').className = 'btn';
    toast('继续学习，加油～');
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
  clearActive();
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
  $('#pauseBtn').textContent = '⏸ 暂停';
  $('#pauseBtn').className = 'btn';
  $('#liveTimer').textContent = '00:00:00';
  $('#liveTimer').style.color = '';
  renderGrid();
  const focusPct = totalSec > 0 ? Math.round(durationSec/totalSec*100) : 100;
  toast(`已保存 ${d.subName}：学习 ${fmtHM(durationSec)}` + (pauseSec > 0 ? ` · 暂停 ${fmtHM(pauseSec)} · 专注度 ${focusPct}%` : ''));
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

ready(() => {
  $('#stopBtn').addEventListener('click', stopSession);
  $('#pauseBtn').addEventListener('click', togglePause);
  // 番茄钟
  $('#pomostartBtn').addEventListener('click', pomoStart);
  $('#pomoresetBtn').addEventListener('click', pomoReset);
  $('#pomoStudy').addEventListener('change', pomoReset);
  $('#pomoBreak').addEventListener('change', pomoReset);
  pomoReset();
  const saved = loadActive();
  if(saved && todayKey(new Date(saved.startTs)) === todayKey()){
    const f = findSub(saved.subId);
    if(f){
      active = { subId: saved.subId, moduleId: f.m.id, moduleName: f.m.name, subName: f.c.name,
        startTs: saved.startTs, paused: saved.paused || false, pauseStart: saved.pauseStart || null,
        pauseAccum: saved.pauseAccum || 0 };
      $('#activeInfo').innerHTML = `<strong>${f.m.name} › ${f.c.name}</strong> 进行中`;
      $('#stopBtn').disabled = false;
      $('#pauseBtn').disabled = false;
      $('#pauseBtn').textContent = active.paused ? '▶ 继续' : '⏸ 暂停';
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

/* ===== 番茄钟 ===== */
let pomo = { phase:'idle', remain:0, total:0, tick:null, studyMin:25, breakMin:5 };
function pomoRender(){
  const mm = String(Math.floor(pomo.remain/60)).padStart(2,'0');
  const ss = String(pomo.remain%60).padStart(2,'0');
  const el = $('#pomoTimer'); if(el) el.textContent = mm + ':' + ss;
  const st = $('#pomoState'); if(st) st.textContent = pomo.phase === 'study' ? '🍅 学习中' : pomo.phase === 'break' ? '☕ 休息中' : '🍅 待开始';
}
function pomoStart(){
  pomo.studyMin = Math.max(1, parseInt($('#pomoStudy').value) || 25);
  pomo.breakMin = Math.max(1, parseInt($('#pomoBreak').value) || 5);
  if(pomo.phase === 'idle' || pomo.phase === 'done'){
    pomo.phase = 'study';
    pomo.total = pomo.studyMin * 60;
    pomo.remain = pomo.total;
  }
  if(DATA.settings.notifyEnabled) requestNotify();
  if(pomo.tick) clearInterval(pomo.tick);
  pomo.tick = setInterval(pomoTick, 1000);
  pomoRender();
  toast(pomo.phase === 'study' ? '🍅 番茄钟开始，专注 ' + pomo.studyMin + ' 分钟' : '☕ 休息 ' + pomo.breakMin + ' 分钟');
}
function pomoTick(){
  if(pomo.remain > 0){ pomo.remain--; pomoRender(); return; }
  if(pomo.tick){ clearInterval(pomo.tick); pomo.tick = null; }
  if(pomo.phase === 'study'){
    notify('🍅 番茄钟', '学习时段结束，起来休息 ' + pomo.breakMin + ' 分钟吧～');
    pomo.phase = 'break'; pomo.total = pomo.breakMin*60; pomo.remain = pomo.total;
    pomo.tick = setInterval(pomoTick, 1000); pomoRender();
  } else if(pomo.phase === 'break'){
    notify('☕ 休息结束', '该回来继续学习啦，加油！');
    pomo.phase = 'done'; pomoRender(); toast('✅ 一个番茄钟完成！');
  }
}
function pomoReset(){
  if(pomo.tick) clearInterval(pomo.tick);
  pomo.studyMin = Math.max(1, parseInt($('#pomoStudy').value) || 25);
  pomo.breakMin = Math.max(1, parseInt($('#pomoBreak').value) || 5);
  pomo.phase = 'idle'; pomo.total = 0; pomo.tick = null;
  pomo.remain = pomo.studyMin * 60;
  pomoRender();
}
