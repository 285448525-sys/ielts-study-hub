// hint 行最多列 2 个模块名，再多会撑爆卡片（视觉契约，勿改数值）
const MAX_HINT_MODS = 2;
// 倒计时日期的「周 X」后缀用
const WEEKDAY_CN = ['日','一','二','三','四','五','六'];

ready(() => {
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };
  const s = (DATA && DATA.settings) || {};

  safe(() => {
    $('#userName').textContent = s.name || '同学';
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
  const dateEl = $('#dashDate');
  if(dateEl) dateEl.textContent =
    (now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0')
    +' · 周'+WEEKDAY_CN[now.getDay()];

  // ---- 连续学习天数 chip ----
  const chipEl = $('#dashStreakChip');
  if(chipEl){
    const streak = calcStreakV6();
    if(streak > 0){
      chipEl.hidden = false;
      chipEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 2c1 3-3 5 0 8 1 1 4-1 4 3 0 3-2 5-4 5s-4-2-4-5c0-3 2-4 4-4"/></svg>连续 '+streak+' 天';
    } else {
      chipEl.hidden = true;
    }
  }

  // ---- hero：考试倒计时 ----
  // daysLeft === null 表示考试日期字符串非法（daysUntil 兜底返回），必须回退 "--"，不能掉进 <0 分支误显「已过」
  const cd = examCountdown();
  const numEl = $('#dashHeroNum');
  if(numEl){
    if(!cd.hasExam || cd.daysLeft === null){
      numEl.innerHTML = '<span class="big">--</span><span class="unit">天</span>';
    } else if(cd.daysLeft >= 0){
      numEl.innerHTML = '<span class="big">'+cd.daysLeft+'</span><span class="unit">天</span>';
    } else {
      numEl.innerHTML = '<span class="big">已过</span>';
    }
  }

  // ---- 双卡：今日学习时长 / 待复习 ----
  const tkey = todayKey();
  const todays = (DATA.sessions||[]).filter(x => x.date === tkey);
  const totalSec = todays.reduce((a,x)=>a+(x.durationSec||0),0);
  const mods = new Set(todays.map(x => x.moduleName || '未知'));

  const timeEl = $('#dashTodayTime');
  const modsEl = $('#dashTodayMods');
  if(timeEl){
    const hm = hmParts(totalSec);
    timeEl.innerHTML = hm.h+'<span class="u">h</span>'+hm.m+'<span class="u">m</span>';
  }
  if(modsEl) modsEl.textContent = mods.size > 0
    ? [...mods].slice(0, MAX_HINT_MODS).join(' · ')
    : '今天还没开始学习';

  // 待学习口径与背单词页一致：未掌握（cleared!==true）或今天到期（nextReview≤今天）
  const due = (DATA.words||[]).filter(w => w.cleared !== true || (w.nextReview || '') <= tkey).length;
  const dueEl = $('#dashDueWords');
  const hintEl = $('#dashDueHint');
  if(dueEl) dueEl.innerHTML = due+'<span class="u">词</span>';
  if(hintEl) hintEl.textContent = due > 0 ? '建议先背待学习的词' : '暂无待学习单词';

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
        +'<span class="nm">'+escapeHtml(nm)+'</span>'
        +'<span class="bar"><i style="width:'+pct+'%"></i></span>'
        +'<span class="dur">'+m+'m</span>'
        +'</div>';
    });
    bodyEl.innerHTML = html;
  }

  if(totalEl){
    const hm = hmParts(totalSec);
    totalEl.textContent = hm.h+'h'+hm.m+'m';
  }
}

/** 秒 → {h, m}（均向下取整，与历史口径一致不进位；负值/脏数据按 0 处理）。
    为什么抽：hero「今日学习」卡与右下角「总计」两处重复同一换算，防改一处漏一处。 */
function hmParts(sec){
  const t = Math.max(0, Number(sec) || 0);
  return { h: Math.floor(t/3600), m: Math.floor((t % 3600) / 60) };
}

/** 计算连续学习天数（从今天往前数连续有 session 的天数） */
function calcStreakV6(){
  const sessions = DATA.sessions || [];
  if(sessions.length === 0) return 0;
  // Set 按日期字符串去重（同一天多条 session 只算一天）；filter 丢弃缺 date 的脏记录，
  // 否则 undefined 经 sort+reverse 会排到首位，把整条 streak 误判为 0
  const dates = [...new Set(sessions.map(s=>s.date).filter(Boolean))].sort().reverse();
  if(dates[0] !== todayKey()) return 0;
  let count = 1;
  for(let i=1;i<dates.length;i++){
    // 用 addDays 做纯字符串日期算术：new Date('YYYY-MM-DD') 会按 UTC 解析，
    // 在非东八区会被本地化到前一天，导致 streak 断档——addDays 强制本地午夜解析，无此问题
    if(dates[i] === addDays(dates[i-1], -1)) count++; else break;
  }
  return count;
}
