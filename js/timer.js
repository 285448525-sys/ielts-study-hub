let active = null; // {moduleId, moduleName, subId, subName, startTs, paused, pauseStart, pauseAccum}

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

/* 一个模块 = 一张卡片 + 一个「开始」按钮（不再下钻子任务） */
function moduleCard(m){
  const running = active && active.moduleId === m.id;
  const otherRunning = active && active.moduleId !== m.id;
  const btnTxt = running ? '进行中' : '开始';
  const btnCls = running ? 'btn-primary' : 'btn';
  const disabled = otherRunning ? 'disabled' : '';
  const card = document.createElement('div');
  card.className = 'mod-card' + (running ? ' running' : '');
  card.style.borderTopColor = m.color;
  card.innerHTML = '<div class="mod-title"><span>' + m.icon + '</span>' + m.name + '</div>' +
    '<button class="btn ' + btnCls + ' timer-start" data-mod="' + m.id + '" ' + disabled + '>' + btnTxt + '</button>';
  return card;
}

function renderTimer(){
  const vocabCol = document.getElementById('vocabCol');
  const subjectsCol = document.getElementById('subjectsCol');
  if(!vocabCol || !subjectsCol) return;
  const vocab = MODULES.find(m => m.id === 'vocab');
  const subjects = MODULES.filter(m => m.id !== 'vocab');
  vocabCol.innerHTML = '<div class="timer-col-title">单词</div>';
  vocabCol.appendChild(moduleCard(vocab));
  subjectsCol.innerHTML = '<div class="timer-col-title">雅思科目</div>';
  const grid = document.createElement('div');
  grid.className = 'timer-subjects';
  subjects.forEach(m => grid.appendChild(moduleCard(m)));
  subjectsCol.appendChild(grid);
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
  active = { moduleId, moduleName: m.name, subId: m.id, subName: m.name,
    startTs: Date.now(), paused: false, pauseStart: null, pauseAccum: 0 };
  saveActive({ moduleId, subId: m.id, startTs: active.startTs, paused: false, pauseStart: null, pauseAccum: 0 });
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
  saveActive({ moduleId: active.moduleId, subId: active.subId, startTs: active.startTs,
    paused: active.paused, pauseStart: active.pauseStart, pauseAccum: active.pauseAccum });
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
  DATA.sessions.push({
    id: uid(), date: todayKey(), moduleId: active.moduleId, subId: active.subId,
    moduleName: active.moduleName, subName: active.subName,
    startTs: active.startTs, endTs, durationSec, pauseSec
  });
  clearActive();   // 关键：结束后必须清掉 localStorage 里的活动会话，
                   // 否则下次进页面会被当成「未结束的计时」按旧 startTs 恢复，
                   // 再结束一次就重复入库、时长虚高。
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
  renderTimer();
  const focusPct = totalSec > 0 ? Math.round(durationSec/totalSec*100) : 100;
  toast('已保存 ' + d.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) + ' · 专注度 ' + focusPct + '%' : ''));
}

function updateTimer(){
  if(!active) return;
  const liveTimer = $('#liveTimer');
  if(!liveTimer){ stopTick(); return; }   // 已软导航离开计时页：DOM 没了就停掉心跳
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
  stopTick();   // 进页面第一件事：清掉上一次 eval 遗留的孤儿心跳
  $('#stopBtn').addEventListener('click', stopSession);
  $('#pauseBtn').addEventListener('click', togglePause);
  const saved = loadActive();
  let m = null, fallbackSub = null;
  if(saved){
    if(saved.moduleId) m = MODULES.find(x => x.id === saved.moduleId);
    if(!m && saved.subId){ const f = findSub(saved.subId); if(f){ m = f.m; fallbackSub = f.c.name; } }
  }
  if(m && todayKey(new Date(saved.startTs)) === todayKey()){
    active = { moduleId: m.id, moduleName: m.name, subId: m.id, subName: fallbackSub || m.name,
      startTs: saved.startTs, paused: saved.paused || false, pauseStart: saved.pauseStart || null,
      pauseAccum: saved.pauseAccum || 0 };
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
  if(saved) clearActive();
  renderTimer();
});
