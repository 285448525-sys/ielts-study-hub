ready(() => {
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };
  const s = (DATA && DATA.settings) || {};

  safe(() => {
    $('#userName').textContent = s.name || 'Camille';
  });

  // v6 首页渲染（design/31 A 版）
  safe(renderDashV6);

  // 计时保存后整页指标就地刷新（软导航会重跑本文件：先移除旧监听再挂新监听）
  const prevHub = window.__hubSessionSaved;
  if(typeof prevHub === 'function') document.removeEventListener('hub:session-saved', prevHub);
  window.__hubSessionSaved = () => safe(renderDashV6);
  document.addEventListener('hub:session-saved', window.__hubSessionSaved);
});

/** v6 首页渲染：hero 倒计时 + 双卡 + 快速入口 + 今日记录（design/31 A 版） */
function renderDashV6(){
  const now = new Date();
  const wks = ['日','一','二','三','四','五','六'];
  const dateEl = $('#dashDate');
  if(dateEl) dateEl.textContent =
    (now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0')
    +' · 周'+wks[now.getDay()];

  // ---- 连续学习天数 chip ----
  const chipEl = $('#dashStreakChip');
  if(chipEl){
    const streak = calcStreakV6();
    if(streak > 0){
      chipEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 2c1 3-3 5 0 8 1 1 4-1 4 3 0 3-2 5-4 5s-4-2-4-5c0-3 2-4 4-4"/></svg>连续 '+streak+' 天';
    } else {
      chipEl.textContent = '';
    }
  }

  // ---- hero：考试倒计时 ----
  const cd = examCountdown();
  const numEl = $('#dashHeroNum');
  const targetEl = $('#dashHeroTarget');
  const statNumEl = $('#dashStatNum');
  const footEl = $('#dashHeroFoot');
  const totalDays = 45;
  if(cd.hasExam && numEl){
    if(cd.daysLeft >= 0){
      numEl.innerHTML = '<span class="big">'+cd.daysLeft+'</span><span class="unit">天</span>';
      if(targetEl) targetEl.textContent = cd.md + ' 机考 / 09·13 终考';
      const done = totalDays - cd.daysLeft;
      if(statNumEl) statNumEl.textContent = done;
      if(footEl) footEl.textContent = '跑道进度 '+Math.min(100,Math.round(done/totalDays*100))+'% · 09-13 终考冲刺中';
    } else {
      numEl.innerHTML = '<span class="big">已过</span>';
      if(targetEl) targetEl.textContent = cd.label || '';
      if(statNumEl) statNumEl.textContent = totalDays;
      if(footEl) footEl.textContent = '';
    }
  } else if(numEl){
    numEl.innerHTML = '<span class="big">--</span><span class="unit">天</span>';
    if(targetEl) targetEl.textContent = '未设置考试日期';
    if(statNumEl) statNumEl.textContent = '--';
  }

  // ---- 双卡：今日学习时长 / 待复习 ----
  const tkey = todayKey();
  const todays = (DATA.sessions||[]).filter(x => x.date === tkey);
  const totalSec = todays.reduce((a,x)=>a+(x.durationSec||0),0);
  const mods = new Set(todays.map(x=>x.moduleName||'未知').filter(Boolean));

  const timeEl = $('#dashTodayTime');
  const modsEl = $('#dashTodayMods');
  if(timeEl){
    const h = Math.floor(totalSec/3600);
    const m = Math.floor((totalSec%3600)/60);
    timeEl.innerHTML = h+'<span class="u">h</span>'+m+'<span class="u">m</span>';
  }
  if(modsEl) modsEl.textContent = mods.size > 0
    ? [...mods].slice(0,2).join(' · ')
    : '今天还没开始学习';

  const due = (DATA.words||[]).filter(w => !w.mcDue || w.mcDue <= tkey).length;
  const dueEl = $('#dashDueWords');
  const hintEl = $('#dashDueHint');
  if(dueEl) dueEl.innerHTML = due+'<span class="u">词</span>';
  if(hintEl) hintEl.textContent = due > 0 ? '建议先复习再学新词' : '暂无到期单词';

  // 快速入口「单词」卡上的待复习角标
  const qcDueEl = $('#qcDueWords');
  if(qcDueEl){
    if(due > 0){ qcDueEl.textContent = due; qcDueEl.hidden = false; }
    else { qcDueEl.hidden = true; }
  }

  // ---- 今日学习记录条形图 ----
  const bodyEl = $('#dashRecBody');
  const totalEl = $('#dashRecTotal');
  if(!bodyEl) return;

  const byModule = {};
  todays.forEach(s => {
    const nm = s.moduleName || '未知';
    byModule[nm] = (byModule[nm]||0) + (s.durationSec||0);
  });
  const modNames = Object.keys(byModule);
  const maxDur = Math.max(...Object.values(byModule), 1);

  if(modNames.length === 0){
    bodyEl.innerHTML = '<div class="empty-state">'
      +'<p style="text-align:center;padding:22px 0;color:var(--muted);font-size:14px;line-height:1.7">'
      +'今天还没有学习记录<br>'
      +'<a href="timer.html" style="color:var(--primary);font-weight:700;text-decoration:none">去「计时学习」开始打卡 →</a>'
      +'</p></div>';
  } else {
    let html = '';
    modNames.forEach(nm => {
      const sec = byModule[nm];
      const pct = Math.round((sec/maxDur)*100);
      const m = Math.floor(sec/60);
      html += '<div class="rec-row">'
        +'<span class="nm">'+escHtml(nm)+'</span>'
        +'<span class="bar"><i style="width:'+pct+'%"></i></span>'
        +'<span class="dur">'+m+'m</span>'
        +'</div>';
    });
    bodyEl.innerHTML = html;
  }

  if(totalEl){
    const th = Math.floor(totalSec/3600);
    const tm = Math.floor((totalSec%3600)/60);
    totalEl.textContent = th+'h'+tm+'m';
  }
}

/** 计算连续学习天数（从今天往前数连续有 session 的天数） */
function calcStreakV6(){
  const sessions = DATA.sessions || [];
  if(sessions.length === 0) return 0;
  const dates = [...new Set(sessions.map(s=>s.date))].sort().reverse();
  if(dates[0] !== todayKey()) return 0;
  let count = 1;
  for(let i=1;i<dates.length;i++){
    const d = new Date(dates[i-1]);
    d.setDate(d.getDate()-1);
    if(dates[i] === todayKey(d)) count++; else break;
  }
  return count;
}

/** 安全转义 HTML */
function escHtml(s){
  const d=document.createElement('div');d.textContent=s;return d.innerHTML;
}
