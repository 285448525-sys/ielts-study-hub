ready(() => {
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };
  const s = (DATA && DATA.settings) || {};

  safe(() => {
    $('#userName').textContent = s.name || 'Camille';
  });

  // v5 首页：纵向信息流渲染（倒计时 / 今日学习 / 待复习 / 模块时长 / 连续天数）
  safe(renderDashV5);

  // 计时保存后整页指标就地刷新（今日学习时长 + 模块条形图 + 连续天数）
  // 软导航会重跑本文件：先移除旧监听再挂新监听，避免重复注册
  const prevHub = window.__hubSessionSaved;
  if(typeof prevHub === 'function') document.removeEventListener('hub:session-saved', prevHub);
  window.__hubSessionSaved = () => safe(renderDashV5);
  document.addEventListener('hub:session-saved', window.__hubSessionSaved);
});

/**
 * 首页 v5 渲染：纵向信息流（design/30 首页Dashboard+导航全面简化_详细方案v5.md D2）
 * - 格1：考试倒计时（合并原 dashCountdown + reminderLine 的倒计时）
 * - 格2：今日学习时长（聚合 DATA.sessions）
 * - 格3：待复习单词数
 * - 详情卡：按 moduleName 分组的时长条形图
 */
function renderDashV5(){
  // ---- 日期 ----
  const now = new Date();
  const wks = ['日','一','二','三','四','五','六'];
  const dateEl = $('#dashDate');
  if(dateEl) dateEl.textContent =
    (now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0')
    +' · 周'+wks[now.getDay()];

  // ---- 格1：考试倒计时 ----
  const cd = examCountdown();
  const numEl = $('#dashCDNum');
  const subEl = $('#dashCDSub');
  const barEl = $('#dashCDBar');
  if(cd.hasExam && numEl && subEl && barEl){
    if(cd.daysLeft >= 0){
      numEl.innerHTML = '<span class="num">'+cd.daysLeft+'</span><span class="unit">天</span>';
      subEl.textContent = cd.md + ' 机考';
      // 备考进度估算：假设从首考到目标共 45 天跑道
      const totalDays = 45;
      const pct = Math.min(100, Math.max(0, ((totalDays - cd.daysLeft) / totalDays) * 100));
      barEl.style.width = pct.toFixed(0)+'%';
    } else {
      numEl.innerHTML = '<span class="num">已过</span>';
      subEl.textContent = cd.label || '';
      barEl.style.width='100%';
    }
  } else if(numEl){ numEl.innerHTML='<span class="num">--</span><span class="unit">天</span>'; }
  if(!cd.hasExam && subEl) subEl.textContent = '未设置考试日期';

  // ---- 格2：今日学习时长 ----
  const tkey = todayKey();
  const todays = (DATA.sessions||[]).filter(x => x.date === tkey);
  const totalSec = todays.reduce((a,x)=>a+(x.durationSec||0),0);
  const mods = new Set(todays.map(x=>x.moduleName||'未知').filter(Boolean));

  const timeEl = $('#dashTodayTime');
  const modsEl = $('#dashTodayMods');
  if(timeEl){
    const h = Math.floor(totalSec/3600);
    const m = Math.floor((totalSec%3600)/60);
    timeEl.innerHTML = '<span class="num">'+h+'</span><span class="unit">h</span>'
                      +'<span class="num">'+m+'</span><span class="unit">m</span>';
  }
  if(modsEl) modsEl.textContent = mods.size+' 个模块已记录';

  // ---- 格3：待复习单词 ----
  const due = (DATA.words||[]).filter(w => !w.mcDue || w.mcDue <= tkey).length;
  const dueEl = $('#dashDueWords');
  const hintEl = $('#dashDueHint');
  if(dueEl) dueEl.innerHTML = '<span class="num">'+due+'</span><span class="unit">词</span>';
  if(hintEl) hintEl.textContent = due > 0 ? '建议先复习再学新词' : '暂无到期单词';

  // ---- 详情卡：按模块聚合时长 ----
  const bodyEl = $('#dashRecBody');
  const totalEl = $('#dashRecTotal');
  if(!bodyEl) return;

  // 聚合
  const byModule = {};
  todays.forEach(s => {
    const nm = s.moduleName || '未知';
    byModule[nm] = (byModule[nm]||0) + (s.durationSec||0);
  });
  const modNames = Object.keys(byModule);
  const maxDur = Math.max(...Object.values(byModule), 1);

  if(modNames.length === 0){
    bodyEl.innerHTML = '<div class="empty-state">'
      +'<p style="text-align:center;padding:26px 0;color:var(--muted);font-size:14px;line-height:1.7">'
      +'今天还没有学习记录<br>'
      +'<a href="timer.html" style="color:var(--primary);font-weight:700;text-decoration:none">去「计时学习」开始打卡 →</a>'
      +'</p></div>';
  } else {
    let html = '';
    modNames.forEach(nm => {
      const sec = byModule[nm];
      const pct = Math.round((sec/maxDur)*100);
      const m = Math.floor(sec/60);
      html += '<div class="dash-rec-row">'
        +'<span class="nm">'+escHtml(nm)+'</span>'
        +'<span class="bar"><i style="width:'+pct+'%"></i></span>'
        +'<span class="dur">'+m+'m</span>'
        +'</div>';
    });
    bodyEl.innerHTML = html;
  }

  // 总计
  if(totalEl){
    const th = Math.floor(totalSec/3600);
    const tm = Math.floor((totalSec%3600)/60);
    totalEl.textContent = th+'h'+tm+'m';
  }

  // ---- 连续学习天数 ----
  const streakEl = $('#dashStreak');
  if(streakEl){
    const streak = calcStreak(); // 见下方辅助函数
    if(streak > 0){
      streakEl.innerHTML = '连续学习 <b>'+streak+'</b> 天';
    } else {
      streakEl.textContent = '';
    }
  }
}

/** 计算连续学习天数（从今天往前数连续有 session 的天数；与打卡数据无关） */
function calcStreak(){
  const sessions = DATA.sessions || [];
  if(sessions.length === 0) return 0;
  const dates = [...new Set(sessions.map(s=>s.date))].sort().reverse();
  if(dates[0] !== todayKey()) return 0; // 今天没学，断链
  let count = 1;
  for(let i=1;i<dates.length;i++){
    const d = new Date(dates[i-1]);
    d.setDate(d.getDate()-1);
    // todayKey(d) 与 session.date 同格式 YYYY-MM-DD（data.js:757）
    if(dates[i] === todayKey(d)) count++; else break;
  }
  return count;
}

/** 安全转义 HTML */
function escHtml(s){
  const d=document.createElement('div');d.textContent=s;return d.innerHTML;
}
