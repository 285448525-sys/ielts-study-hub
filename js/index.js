// hint 行最多列 2 个模块名，再多会撑爆卡片（视觉契约，勿改数值）
const MAX_HINT_MODS = 2;
// 倒计时日期的「周 X」后缀用
const WEEKDAY_CN = ['日','一','二','三','四','五','六'];

ready(async () => {
  const safe = fn => { try{ fn(); }catch(e){ console.error('[index] 渲染失败', fn.name || '', e); } };
  const s = (DATA && DATA.settings) || {};

  // design/78：官方词库激活时先等词包就绪再渲染首页（custom 不 fetch、零额外请求）
  if(typeof wbActive === 'function' && wbActive() !== 'custom' && typeof obBankReady === 'function'){
    try{ await obBankReady(wbActive()); }catch(e){ console.error('[index] 官方词库加载失败', e); }
  }

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

  // 今日任务卡实时刷新：云合并 / 计时状态变化就地重渲染（同样先摘旧监听再挂，防软导航重复绑定）
  if(typeof window.__hubDashTasksMerged === 'function') document.removeEventListener('hub:data-merged', window.__hubDashTasksMerged);
  window.__hubDashTasksMerged = () => { safe(renderDashTasks); safe(renderOnboardingBar); };
  document.addEventListener('hub:data-merged', window.__hubDashTasksMerged);
  if(typeof window.__hubDashTasksTimer === 'function') document.removeEventListener('hub:timer-state', window.__hubDashTasksTimer);
  window.__hubDashTasksTimer = () => safe(renderDashTasks);
  document.addEventListener('hub:timer-state', window.__hubDashTasksTimer);
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
  // design/78：词源走 wbWords()（custom=DATA.words 原样；official=官方词包），口径注释不变
  const due = (wbWords()||[]).filter(w => w.cleared !== true || (w.nextReview || '') <= tkey).length;
  // 9/24（她拍板）：首页显示改成「今日待学」= 今日配额剩余量，不再直接甩未掌握总数（1000+ 看着劝退）。
  // 口径 = max(0, min(剩余待学习, 每日学习上限 − 今日已背))；上限取设置「每日学习上限」（0=不限 → 退回原口径）。
  // 三个例子都对得上：待学习 2000 / 上限 400 → 400；已背 220 → 180；待学习 340 / 上限 400 → 340。
  // ⚠️ 上限只影响这个数字的显示，不限制实际能背多少；「每日新词上限」是另一个设置（管每天引入多少生词），两者别混。
  const _cap = (DATA && DATA.settings && DATA.settings.practiceCfg) ? Number(DATA.settings.practiceCfg.dailyCap) : 0;
  const _done = (typeof wbDayStats === 'function') ? (Number(wbDayStats().totalWords) || 0) : 0;
  const shown = (_cap > 0) ? Math.max(0, Math.min(due, _cap - _done)) : due;
  const dueEl = $('#dashDueWords');
  const hintEl = $('#dashDueHint');
  if(dueEl) dueEl.innerHTML = shown+'<span class="u">词</span>';
  if(hintEl) hintEl.textContent = (_cap > 0)
    ? ('每日计划 ' + _cap + ' 个 · 今日已背 ' + _done)
    : (shown > 0 ? '建议先背待学习的词' : '暂无待学习单词');

  // ---- 今日任务卡（9/20：到期词建议 + 今日计划清单，详见 renderDashTasks）----
  // 注意：safe 是 ready() 闭包内常量，本函数在闭包外够不着 → renderDashTasks 自带 try/catch 兜底
  renderDashTasks();

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

/* ===== 首页 · 今日任务卡（9/20）=====
   打开首页就知道今天该做什么：顶部系统建议（今天到期词）+ DATA.plans 今日清单。
   - 到期词口径严格同 practice.js buildQueue：en 非空 且（无 nextReview 或 nextReview<=今天）。
     不引入 practice.js，只在本地按同条件过滤 DATA.words（纯计数，不做任何字段修复/写库）。
   - 勾选立即写 item.done 并 hubSave()；不新增任何 DATA 字段（结构同 plans.js 现有口径）。
   - 计划的新增/编辑/删除仍只在计划页；本卡只读展示 + 勾选回写。 */
function renderDashTasks(){
  // 自带兜底：本函数被 ready 闭包（safe 包裹）与顶层 renderDashV6 两处调用，闭包外的调用点没有 safe
  try{
  const host = document.getElementById('dashTodayTasks');
  if(!host) return;
  const tkey = todayKey();
  const plan = (DATA.plans || []).find(p => p && p.date === tkey);
  const items = (plan && Array.isArray(plan.items)) ? plan.items : [];
  const doneN = items.filter(i => i && i.done).length;
  const pct = items.length ? Math.round(doneN / items.length * 100) : 0;

  // 到期词计数（buildQueue 同口径，不含任何副作用）；design/78：改走 wbDueCount（按词库路由取数）
  const dueWords = wbDueCount(tkey) || 0;

  // design/78：官方词库激活时「去背词」带暗号跳转（practice.html ready 读 hub_wb_goto 后切词源）；
  // 新人「背官方词库」按钮写死 awl 暗号。两个链接都存在时各自绑定。
  const bindWbLinks = () => {
    const goP = document.getElementById('dashGoPractice');
    if(goP && typeof wbActive === 'function' && wbActive() !== 'custom'){
      goP.addEventListener('click', () => {
        try{ sessionStorage.setItem('hub_wb_goto', wbActive()); }catch(e){}
      });
    }
    const goOff = document.getElementById('dashGoOfficialBank');
    if(goOff){
      goOff.addEventListener('click', () => {
        try{ sessionStorage.setItem('hub_wb_goto', 'awl'); }catch(e){}
      });
    }
  };

  // 卡头：标题 + 进度（有任务才显示）+ 细进度条
  let html = '<div class="dash-tasks-h"><h3>今日任务</h3>'
    + (items.length ? '<span class="dash-tasks-count">已完成 <b>' + doneN + '/' + items.length + '</b></span>' : '')
    + '</div>';
  if(items.length) html += '<div class="dash-tasks-bar"><i style="width:' + pct + '%"></i></div>';

  // 系统建议行：非任务、不可勾选。design/78：新人（custom 且词库为空）改为双选项文案；
  // 其余按到期数显示（N=0 时显示「今天没有到期单词」且不可点）
  const _off = (typeof wbActive === 'function' && wbActive() !== 'custom');
  const _newbie = !_off && (!Array.isArray(DATA.words) || DATA.words.length === 0);
  if(_newbie){
    html += '<div class="dash-tasks-tip"><span class="txt">还没有自己的词库：可导入单词，或直接背官方 AWL 570 学术词</span>'
      + '<a href="practice.html" id="dashGoOfficialBank">背官方词库 →</a>'
      + '</div>';
  } else {
    html += '<div class="dash-tasks-tip"><span class="txt">'
      + (dueWords > 0 ? '今天有 ' + dueWords + ' 个单词到期复习' : '今天没有到期单词')
      + '</span>'
      + (dueWords > 0 ? '<a href="practice.html" id="dashGoPractice">去背词 →</a>' : '')
      + '</div>';
  }

  // 空状态（今天无计划或无 items）：引导去计划页
  if(items.length === 0){
    html += '<div class="dash-tasks-empty">'
      + '<div class="tip">今天还没有学习计划</div>'
      + '<div class="btn-row">'
      + '<a class="btn" id="dashAiPlanBtn" href="plans.html">AI 帮我安排今天</a>'
      + '<a class="btn" href="plans.html">手动添加</a>'
      + '</div></div>';
    host.innerHTML = html;
    bindWbLinks();
    // AI 按钮跳转信标：计划页 ready() 读取后聚焦输入框并清除（不改 AI 排程逻辑）
    const ai = document.getElementById('dashAiPlanBtn');
    if(ai) ai.addEventListener('click', () => {
      try{ sessionStorage.setItem('hub_focus_plan_input', '1'); }catch(e){}
    });
    return;
  }

  // 任务行：未完成在前、已完成在后（组内保持原顺序）；文本全部 escapeHtml
  const sorted = items.slice().sort((a, b) => (a && a.done) === !!(b && b.done) ? 0 : (a && a.done ? 1 : -1));
  html += sorted.map(i =>
    '<div class="plan-item ' + (i && i.done ? 'done' : '') + '">'
    + '<input type="checkbox" ' + (i && i.done ? 'checked' : '') + ' data-toggle="' + escapeHtml(String(i.id)) + '" />'
    + '<span class="plan-text">' + escapeHtml(i && i.text) + '</span>'
    + '</div>'
  ).join('');
  // 全部任务完成（items 非空且 done=100%）→ 一行正向反馈，不引入 XP/积分字段
  if(doneN === items.length) html += '<div class="dash-tasks-done">今天的任务完成了</div>';
  host.innerHTML = html;
  bindWbLinks();

  // 勾选/取消：立即写 item.done + hubSave + 就地刷新（进度条/完成态同步更新）
  host.querySelectorAll('input[data-toggle]').forEach(c => {
    c.addEventListener('change', () => {
      const p = (DATA.plans || []).find(x => x && x.date === todayKey());
      const it = p && Array.isArray(p.items) ? p.items.find(x => x && String(x.id) === c.dataset.toggle) : null;
      if(!it) return;
      it.done = c.checked;
      hubSave();
      renderDashTasks();
    });
  });
  }catch(e){ console.error('[index] 渲染失败 renderDashTasks', e); }
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
  // ⭐ 实际完成态：words 这一步除了 setup.words===true，还要看 DATA.words 是否真有词
  // （引导第 2 步「去导入词库」把 setup.words 写死 false、之后无回填路径 → 已导入词库却永远显示「未设置」）。
  // chip 文案 / done 计数 / done>=3 自动 snoozed 都用这个「实际完成」口径（design/74）。
  // design/78：官方词库激活（awl）同样算「词库已设」。
  const actualDone = {};
  ONB_STEPS.forEach(function(x){
    actualDone[x.key] = (x.key === 'words')
      ? (s.words === true || (Array.isArray(DATA.words) && DATA.words.length > 0) || (typeof wbActive === 'function' && wbActive() !== 'custom'))
      : !!s[x.key];
  });
  const done = ONB_STEPS.filter(x => actualDone[x.key]).length;
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
    b.className = 'onb-chip' + (actualDone[x.key] ? ' ok' : '');
    b.textContent = actualDone[x.key] ? (x.name + ' 已设 ✓') : (x.name + ' 未设置 →');
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
