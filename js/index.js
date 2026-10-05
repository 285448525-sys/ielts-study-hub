// hint 行最多列 2 个模块名，再多会撑爆卡片（视觉契约，勿改数值）
const MAX_HINT_MODS = 2;
// 倒计时日期的「周 X」后缀用
const WEEKDAY_CN = ['日','一','二','三','四','五','六'];
// 10/5 路线图②-2a「今天先做这三件事」的折叠态键（纯本机 UI 偏好，**不进 DATA** ——
// 进了就得登记 mergeData + 起合并探针，而折叠状态跨设备同步毫无价值）。
const THREE_FOLD_KEY = 'hub_three_folded';
// ⚠️「落地直接抽 P1」的跨页暗号（QUICK_DRILL_KEY / QUICK_DRILL_VAL）**定义在 common.js** ——
//   它是 index.js（写）与 speaking.js（读）之间的契约，两边都引 common.js 才有一处真值。
//   曾把它写在本文件里，speaking.js 读不到 → 暗号读走但判定不成立 → 静默什么都不发生。

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

  // 10/5 路线图②-2a：给新用户的「今天先做这三件事」（有真实数据才出，且已做过的不重复给）
  safe(renderThreeThings);

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

  // 10/1 UI v2 · 底部轻量条：PWA 安装链接（复用 design/80 的 hubPwaState/hubPwaInstall，零新机制）
  // 已装彻底隐藏（不留死按钮，原则②）；iOS 走文字引导；prompt 事件晚到也没关系——点击时实时查状态
  safe(initFootInstall);
  // 10/1 晚 · 会员小标：AI 转化卡删掉后，会员态收进 hero 问候旁的小徽章（她拍板「不明显但不能不显示」）
  safe(initVipChip);
});
function initFootInstall(){
  const tip = document.getElementById('footInstallTip');
  if(!tip) return;
  const st = (typeof hubPwaState === 'function') ? hubPwaState() : 'unsupported';
  if(st === 'installed'){ tip.style.display = 'none'; return; }
  tip.addEventListener('click', async () => {
    const s = (typeof hubPwaState === 'function') ? hubPwaState() : 'unsupported';
    if(s === 'promptable' && typeof hubPwaInstall === 'function'){
      const r = await hubPwaInstall();
      if(r === 'accepted'){ tip.style.display = 'none'; toast('安装成功，桌面直接打开'); }
      // dismissed：不打扰，链接保留
    }else if(s === 'ios-manual'){
      toast('iOS：用 Safari 打开 → 分享 → 「添加到主屏幕」');
    }else{
      toast('当前浏览器不支持一键安装，可在浏览器菜单里找「安装应用」');
    }
  });
}

// 10/1 晚 · hero 会员小标：登录才显示；会员=黄色「VIP」纯文字，非会员=灰色「免费版」；点击跳会员页。
// vip_status 实时查不缓存（会员状态必须准，与 vip.html 同口径）；未登录/请求失败保持隐藏，绝不打扰首屏。
async function initVipChip(){
  const el = document.getElementById('heroVipChip');
  if(!el) return;
  let token = '';
  try{ token = localStorage.getItem('hub_auth_token') || ''; }catch(e){}
  if(!token) return;
  try{
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session': token },
      body: JSON.stringify({ action: 'vip_status' })
    });
    const j = await r.json();
    if(!j || j.ok !== true) return;
    if(j.vip){
      el.className = 'vip-chip vip';
      el.textContent = 'VIP';   // 10/1 晚：气泡改纯文字（她拍板），皇冠 svg 退役
      el.hidden = false;
    } else {
      el.className = 'vip-chip free';
      el.textContent = '免费版';
      el.hidden = false;
    }
  }catch(e){}
}

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
  // ⚠️ 9/24 晚她追加：上限同时也是真配额——背满就停（practice 页不再开新一轮，见 renderQuotaDone）。
  //    「每日新词上限」是另一个设置（管每天引入多少生词），两者别混。
  const _cap = (DATA && DATA.settings && DATA.settings.practiceCfg) ? Number(DATA.settings.practiceCfg.dailyCap) : 0;
  // 9/25：已背改读「今日已练习」practiced（背一个记一个，背词页节流落盘）——
  // 旧口径 wbDayStats().totalWords 只在背完整轮时回写，中途改上限/刷新会显示成 0（她 9/25 实测的 bug）
  const _done = (typeof wbPracticed === 'function') ? ((wbPracticed().words || []).length) : 0;
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


/* ===== 10/5 路线图②-2a · 「今天先做这三件事」 =====
   豆包评审 P0（全站最大流失点）：新用户打开站点，30 秒内还在看说明 / 不知道点什么。
   做法：**升级现有引导**、不新建页 —— 引导填完（填了考期 + 选了目标）→ 首页顶部直接给
   3 件今天就能做完的小事，每件一个「开始」按钮直达。核心指标落地。

   候选怎么选（全部按**她本机真实数据**算，给不存在的入口 = 骗人）：
     ① 今天到期的单词（>0）→ 去背词  ⭐ 最高优先，间隔重复到期就该马上做
     ② 今天有口语练习记录吗？有 → 提示去模考；没有 → 「练口语」（陪练抽 P1）
     ③ 今天还没计时 → 「开一段专注」
   ⚠️ 与「继续上次」卡**分工不重叠**：那张给「回到上次那件事」，这张给「今天还没做的第一件事」。
   ⚠️ 已完成的候选直接剔除；一条都不剩 → **整卡不渲染**（不硬凑三条凑数）。
   折叠态存 localStorage，不进 DATA。 */
function threeThingsList(){
  const tkey = todayKey();
  const out = [];

  // ① 今日到期词（口径同 practice.js buildQueue / wbDueCount，不做字段修复）
  const due = (typeof wbDueCount === 'function') ? (wbDueCount(tkey) || 0) : 0;
  if(due > 0){
    out.push({
      key:'words', title:'背 ' + due + ' 个到期单词',
      sub:'间隔重复到期了，现在背最省力', file:'practice.html', cta:'开始'
    });
  }

  // ② 今日是否已练口语（有记录 → 建议模考；没记录 → 去陪练抽题）
  const spokeToday = (DATA.sessions || []).some(x => x && x.date === tkey && /口语/.test(String(x.moduleName || '')));
  if(spokeToday){
    /* ⚠️ 模考 tab 没有 query 入口（站内只认 open/autostart/senttab/drill），
       所以**不带任何参数**—— speaking.js 默认落题库 tab，她自己点「模考」pill。
       写一个站内不认的 query（我第一版写的是 ?tab=mock）＝ 点过去落在错的 tab，
       看起来像「点了没反应」。同 10/5「继续上次」跳错模块是同一类错。 */
    out.push({
      key:'mock', title:'来一次口语模考', sub:'今天练过了，用模考检验一下',
      file:'speaking.html', cta:'去模考'
    });
  }else{
    out.push({
      key:'speak', title:'练一题口语', sub:'陪练会抽一道 P1 真题，直接开口说',
      file:'speaking.html?drill=p1', cta:'开始'
    });
  }

  // ③ 今天还没计时 → 给一段专注（站外真题网站练的计时入口也在这）
  const studiedToday = (DATA.sessions || []).some(x => x && x.date === tkey && (x.durationSec || 0) > 0);
  if(!studiedToday){
    out.push({
      key:'timer', title:'开一段专注', sub:'先学 25 分钟，边听边记',
      file:'timer.html?autostart=1', cta:'开始'
    });
  }
  return out;
}

function renderThreeThings(){
  const host = document.getElementById('threeThings');
  if(!host) return;
  const list = threeThingsList();
  if(!list.length){ host.hidden = true; host.innerHTML = ''; return; }

  let folded = false;
  try{ folded = localStorage.getItem(THREE_FOLD_KEY) === '1'; }catch(e){}
  if(folded){
    host.hidden = false;
    host.innerHTML = '<button type="button" class="three-fold" data-three-open>'
      + '<span class="tf-dot" aria-hidden="true"></span><span class="tf-tx">今天先做这些</span></button>';
    const b = host.querySelector('[data-three-open]');
    if(b) b.addEventListener('click', () => {
      try{ localStorage.setItem(THREE_FOLD_KEY, '0'); }catch(e){}
      renderThreeThings();
    });
    return;
  }

  const head = list.length === 1 ? '今天先做这件事' : '今天先做这三件事';
  host.hidden = false;
  host.innerHTML = '<div class="three-card">'
    + '<div class="three-h"><h3>' + head + '</h3>'
      + '<button type="button" class="three-foldbtn" data-three-fold aria-label="收起" title="收起">收起</button>'
    + '</div>'
    + list.map(t => '<div class="three-row">'
        + '<div class="three-l"><div class="three-t">' + escapeHtml(t.title) + '</div>'
        + '<div class="three-s">' + escapeHtml(t.sub) + '</div></div>'
        + '<a class="three-go" href="' + escapeHtml(t.file) + '" data-three-key="' + t.key + '">' + escapeHtml(t.cta) + '</a>'
      + '</div>').join('')
    + '</div>';
  const fb = host.querySelector('[data-three-fold]');
  if(fb) fb.addEventListener('click', () => {
    try{ localStorage.setItem(THREE_FOLD_KEY, '1'); }catch(e){}
    renderThreeThings();
  });
  /* 「练口语」那一条：软导航到 speaking 页后直接抽题 —— 省掉「到了还要再点一次」。
     ⚠️ 暗号值必须与 speaking.js 里的判定**逐字一致**（'p1'）：两处各写各的必然对不上，
     而失败形态是「静默什么都不发生」—— 暗号被读走、判定不成立、什么都不报。
     暗号值集中在下面 ONE 常量里，改只改这一处。 */
  const sp = host.querySelector('[data-three-key="speak"]');
  if(sp) sp.addEventListener('click', e => {
    e.preventDefault();
    try{ sessionStorage.setItem(QUICK_DRILL_KEY, QUICK_DRILL_VAL); }catch(e){}
    if(typeof hubSoftGo === 'function') hubSoftGo('speaking.html?drill=' + QUICK_DRILL_VAL);
    else location.href = 'speaking.html?drill=' + QUICK_DRILL_VAL;
  });
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
  // 她报的 bug：每天第一次开首页时今日任务为空（要先进一次计划页才有）——
  // 原延续逻辑只在 plans.js render() 里触发，首页不进计划页就不搬。
  // 现在首页也触发（common.js ensureTodayPlanCarried，幂等：今天有计划对象就 no-op）。
  try{ ensureTodayPlanCarried(); }catch(e){}
  // 10/2 commit4：首页也是「打开今日计划」——同步打卡，3 天未回来由计划页给重排提示
  try{ touchPlanOpen(); }catch(e){}
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

  // 任务行：未完成在前、已完成在后（组内保持原顺序）；文本全部 escapeHtml。
  // 9/24：跳转能力从计划页迁来——能识别目标的任务整行可点，点击直达 + autostart=1 落地即开计时；
  // 识别不出（如听力第N篇）不可点。题号任务（口语 P1 第N题）hover 提示显示解析出的真实题名。
  const sorted = items.slice().sort((a, b) => (a && a.done) === !!(b && b.done) ? 0 : (a && a.done ? 1 : -1));
  html += sorted.map(i => {
    // commit4：AI 生成项（module/action）优先走结构化跳转；识别不出再退回文本猜测
    const jmp = ((typeof planGenJump === 'function') && planGenJump(i))
      || ((typeof planJumpInfo === 'function') ? planJumpInfo(i && i.text) : null);
    return '<div class="plan-item ' + (i && i.done ? 'done' : '') + (jmp ? ' jumpable' : '') + '"'
      + (jmp ? ' data-jfile="' + escapeHtml(jmp.file) + '"'
        + (jmp.open ? ' data-jopen="' + escapeHtml(jmp.open) + '"' : '')
        + ' title="' + escapeHtml((jmp.label || '去学习') + '，点击直达并计时') + '"' : '')
      + '>'
      + '<input type="checkbox" ' + (i && i.done ? 'checked' : '') + ' data-toggle="' + escapeHtml(String(i.id)) + '" />'
      + '<span class="plan-text">' + escapeHtml(i && i.text) + '</span>'
      + '</div>';
  }).join('');
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
      it.updatedAt = Date.now();   // 9/25 修：首页勾选也必须戳时间戳——不戳则云端合并视为「旧数据」，
      hubSave();                   // 另一端同条目带更新 ts 时会把勾选冲掉（她实测：勾了好多刷新就没了）
      renderDashTasks();
    });
  });
  // 9/24：整行点击 → 跳转（planJumpUrl 带 autostart=1，落地页直接开计时）。
  // 点在勾选框上不跳（那是打钩）；识别不出目标的行没有 jumpable 类，根本不绑。
  host.querySelectorAll('.plan-item.jumpable').forEach(row => {
    row.addEventListener('click', e => {
      if(e.target && e.target.tagName === 'INPUT') return;
      const url = (typeof planJumpUrl === 'function') ? planJumpUrl({ file: row.dataset.jfile, open: row.dataset.jopen || '' }) : '';
      // commit4：与站内链接同走软导航（不整页刷新）；hubSoftGo 内部对异常/非站内页有兜底
      if(url){
        if(typeof hubSoftGo === 'function') hubSoftGo(url);
        else location.href = url;
      }
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
    { key:'exam',   n:2, name:'考试日期' },
    { key:'effort', n:3, name:'每日投入' },
    { key:'words',  n:4, name:'词库' }
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
  // ⭐ 实际完成态（见 design/74 / 9/30 新版三步）：除「标记已完成」外还要按真实数据算，
  //  否则出现「明明填过却永远显示未设置」。chip 文案 / done 计数 / 自动 snoozed 都用这个口径。
  //  - exam：settings.examDate 有值
  //  - effort：每日时长或背词上限任一 > 0
  //  - words：自定义词库有词，或当前词源是官方库（design/78）
  const _pcfg = ((DATA.settings || {}).practiceCfg) || {};
  const actualDone = {};
  ONB_STEPS.forEach(function(x){
    if(x.key === 'exam') actualDone[x.key] = !!(s.exam || (DATA.settings || {}).examDate);
    else if(x.key === 'effort') actualDone[x.key] = !!(s.effort || Number(DATA.settings.dailyGoalHours) > 0 || Number(_pcfg.dailyCap) > 0);
    else actualDone[x.key] = (s.words === true || (Array.isArray(DATA.words) && DATA.words.length > 0) || (typeof wbActive === 'function' && wbActive() !== 'custom'));
  });
  const done = ONB_STEPS.filter(x => actualDone[x.key]).length;
  // 显示条件：确实走过引导（entered）+ 没有被按下「不再提示」+ 还有没配完的项
  if(st.snoozed || !st.entered || done >= ONB_STEPS.length){
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
