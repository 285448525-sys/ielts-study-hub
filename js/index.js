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

  // 首次进入引导提示条（仅首页）：三步没走完时出现，三步齐了或点「不再提示」后永久消失
  safe(renderOnboardingBar);

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
    const streak = calcStreak();   // 统一实现见 common.js（首页/计时页共用）
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

  // 首页「待学习」= 未掌握总词数口径（cleared!==true 即计入，不管排到哪天）。
  // ⚠️ 与背单词页的「出题口径」不同：buildQueue(practice.js) 只取 nextReview≤今天的词，
  //    所以首页这个数会明显大于今天真正能背到的量（2026-09-08 修复「再来一轮显示没词」时确认）。
  //    两处口径是刻意保留的：首页看总进度，出题按记忆曲线；不要随手改成一致。
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

/* ===== 首次进入引导提示条（仅首页显示）=====
   状态与遮罩共用 common.js 的 hub_onboarding_v1；只有「确实走过引导（entered）且未三步齐全」才显示，
   老用户被静默回填的状态 entered=false → 永不打扰。三步齐全 / 点「不再提示」→ 写 snoozed 永久消失。 */
function renderOnboardingBar(){
  // ⭐ 定义在函数内：index.js 是 defer 脚本，ready() 会同步执行到本函数，
  // 顶层 const 声明在文件末尾此时仍在 TDZ（访问即 ReferenceError）。引导三步骤的顺序表不需要跨函数共享。
  const ONB_STEPS = [
    { key:'exam',  n:1, name:'考试日期' },
    { key:'words', n:2, name:'词库' },
    { key:'key',   n:3, name:'Key' }
  ];
  const main = document.querySelector('main.container');
  if(!main || typeof getOnboarding !== 'function') return;
  let host = document.getElementById('onbBarHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'onbBarHost';
    main.insertBefore(host, main.firstChild);
  }
  const st = getOnboarding();
  if(!st){ host.hidden = true; host.innerHTML = ''; return; }
  const s = st.setup || {};
  const done = ONB_STEPS.filter(x => s[x.key]).length;
  if(st.snoozed || !st.entered || st.account !== 'done' || done >= 3){
    if(done >= 3 && !st.snoozed && typeof setOnboarding === 'function') setOnboarding({ snoozed:true });
    host.hidden = true; host.innerHTML = ''; return;
  }
  host.hidden = false;
  host.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'onb-bar';
  const title = document.createElement('span');
  title.className = 'onb-bar-title';
  title.textContent = '初始设置 ' + done + '/3';
  bar.appendChild(title);
  ONB_STEPS.forEach(function(x){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'onb-chip' + (s[x.key] ? ' ok' : '');
    b.textContent = s[x.key] ? (x.name + ' 已设 ✓') : (x.name + ' 未设置 →');
    b.addEventListener('click', function(){ if(typeof onbOpenSetup === 'function') onbOpenSetup(x.n); });
    bar.appendChild(b);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'onb-chip ghost';
  close.textContent = '不再提示';
  close.addEventListener('click', function(){
    if(typeof setOnboarding === 'function') setOnboarding({ snoozed:true });
    host.hidden = true; host.innerHTML = '';
  });
  bar.appendChild(close);
  host.appendChild(bar);
}
