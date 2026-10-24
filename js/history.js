ready(() => {
  renderRecordStats();
  renderHeatmap();
  renderDays();
});

/* 🔴 R-5（10-24）：轨迹栏热力图上方那三个数。
   全部复用现成口径，一个新算法都没写：
     · 连续打卡     → calcStreak()（common.js，首页 #railStreakN 用的同一个函数）
     · 近 30 天活跃 → 与下面 renderHeatmap 同一套按天聚合（byDay[date] += durationSec），
                      数 durationSec>0 的天数。窗口必须与热力图一致（近 30 天），否则
                      「活跃 23/30 天」和下面的格子对不上。
     · 累计专注     → DATA.sessions 的 durationSec 求和（同 renderDays 里 total 的算法）。
   为什么单独一个函数而不是塞进 renderHeatmap：热力图那块改过好几轮，
   分开写以后动热力图不会顺手打翻这三个数。 */
function renderRecordStats(){
  const sessions = Array.isArray(DATA.sessions) ? DATA.sessions : [];

  // 1) 连续打卡 —— 直接借 common.js 的，别重写（首页也是它，两处数字必须永远相等）
  const streakEl = document.getElementById('rvStatStreak');
  if(streakEl){
    const s = (typeof calcStreak === 'function') ? calcStreak() : 0;
    streakEl.textContent = String(s);
  }

  // 2) 近 30 天活跃天数 —— 与热力图同一个 30 天窗口
  const byDay = {};
  sessions.forEach(s => { if(s && s.date) byDay[s.date] = (byDay[s.date] || 0) + (s.durationSec || 0); });
  const activeEl = document.getElementById('rvStatActive');
  if(activeEl){
    let active = 0;
    for(let i = 0; i < 30; i++){
      const d = new Date(); d.setDate(d.getDate() - i);
      if((byDay[todayKey(d)] || 0) > 0) active++;
    }
    activeEl.textContent = String(active);
  }

  // 3) 累计专注时长 —— 全部会话求和，>1 小时才换「小时」，否则给「分钟」
  const focusEl = document.getElementById('rvStatFocus');
  const unitEl = document.getElementById('rvStatFocusUnit');
  if(focusEl){
    const sec = sessions.reduce((a, s) => a + (s && s.durationSec ? s.durationSec : 0), 0);
    if(sec >= 3600){
      focusEl.textContent = (Math.round(sec / 360) / 10).toFixed(1);
      if(unitEl) unitEl.textContent = '小时';
    }else{
      focusEl.textContent = String(Math.round(sec / 60));
      if(unitEl) unitEl.textContent = '分钟';
    }
  }
}

function renderHeatmap(){
  const sessions = Array.isArray(DATA.sessions) ? DATA.sessions : [];   // h 类：corrupt/legacy 数据缺 sessions 不再崩整页
  const byDay = {};
  sessions.forEach(s => byDay[s.date] = (byDay[s.date]||0) + s.durationSec);
  const days = [];
  for(let i=29;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    days.push({ key: todayKey(d), sec: byDay[todayKey(d)] || 0, today: i===0 });
  }
  $('#heatmap').innerHTML = '<div class="cal-heatmap">' + days.map(d => {
    const alpha = Math.min(1, d.sec / 14400); // max at 4h
    const bg = d.sec ? `rgba(58,154,147,${0.15 + alpha*0.85})` : '';
    const col = d.sec ? '#fff' : '';
    return `<div class="cal-day ${d.sec?'has':''} ${d.today?'today':''}" title="${d.key} ${fmtHM(d.sec)}" style="${bg?'background:'+bg+';color:'+col:''}">${d.key.slice(5)}</div>`;
  }).join('') + '</div>';

  const scale = [
    { c: 'var(--line)', t: '无（没学）' },
    { c: 'rgba(58,154,147,.3)', t: '较少（<1h）' },
    { c: 'rgba(58,154,147,.55)', t: '中等（1-2h）' },
    { c: 'rgba(58,154,147,.8)', t: '较多（2-4h）' },
    { c: 'rgba(58,154,147,1)', t: '很多（≥4h）' },
  ];
  $('#heatLegend').innerHTML = scale.map(s =>
    `<span class="sw"><span class="dot" style="background:${s.c}"></span>${s.t}</span>`
  ).join('');
}

function renderDays(){
  const wd = ['周日','周一','周二','周三','周四','周五','周六'];
  const getWeekday = dStr => wd[new Date(dStr.replace(/-/g,'/')).getDay()];
  const byDay = {};
  (Array.isArray(DATA.sessions) ? DATA.sessions : []).forEach(s => {
    byDay[s.date] = byDay[s.date] || [];
    byDay[s.date].push(s);
  });
  const keys = Object.keys(byDay).sort().reverse();
  const box = $('#dayList');
  if(keys.length === 0){ box.innerHTML = renderEmpty('暂无历史记录。'); return; }
  box.innerHTML = keys.map(k => {
    const arr = byDay[k];
    const total = arr.reduce((a,s) => a + s.durationSec, 0);
    const pause = arr.reduce((a,s) => a + (s.pauseSec||0), 0);
    const parts = {};
    arr.forEach(s => parts[s.subName] = (parts[s.subName]||0) + s.durationSec);
    const isLong = total >= 3600;
    const chips = Object.entries(parts).sort((a,b)=>b[1]-a[1]).map(([n,s]) => {
      const longCls = (isLong && s >= 3600) ? ' chip-long' : '';
      return `<span class="chip${longCls}"><span class="chip-name">${escapeHtml(String(n))}</span><span class="chip-val">${fmtHM(s)}</span></span>`;
    }).join('');
    let focusChip = '';
    if(pause > 0){
      const focusPct = (total + pause) > 0 ? Math.round(total/(total+pause)*100) : 100;
      focusChip = `<span class="chip-focus">专注 <b>${focusPct}%</b></span>`;
    }
    return `<div class="day-card">
      <div class="day-header">
        <span class="day-date">${k}<span class="weekday">${getWeekday(k)}</span></span>
        <span class="day-total">总时长 ${fmtHM(total)}</span>
      </div>
      <div class="day-chips">${chips}${focusChip}</div>
    </div>`;
  }).join('');
}



