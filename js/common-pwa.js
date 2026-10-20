/* ==SPLIT-BANNER== 本文件是共享外壳 js/common.js 的第 7 块（2026-10-19 按功能切分，代码逐字节未改）。*/
/* ==SPLIT-BANNER== PWA 安装 / 新用户引导 onboarding / 计划跳转工具 */
/* ==SPLIT-BANNER== ⚠️ 改动任一 common-*.js 后，20 个页面里这一组 <script> 的 ?v= 必须整组一起换；工具 scripts/bump-assets.cjs */

const ONB_KEY = 'hub_onboarding_v2';        // 9/30 引导；10/1 晚从 5 步压到 3 步（删欢迎介绍和完成总结独立 pane，合并进 exam/words）
const ONB_OLD_KEY = 'hub_onboarding_v1';    // 旧版引导状态键：读到它就迁成「已完成」，老用户零打扰
const ONB_TOTAL = 3;                        // 引导步数：考试日期 / 每日投入 / 词库（原 step1 欢迎文案并入 step1 导语，原 step5 done 总结并入 step3 底部）
let _onbLastDir = 1;                        // 步骤横滑方向（1 前进、-1 后退）
const ONB_GOTO_BANK = 'hub_onb_goto_bank';   // 「去导入词库」跳转 practice.html 的一次性暗号（sessionStorage）
/* 10/5 路线图②-2a：「落地直接抽 P1」的跨页暗号。
   ⚠️ 定义在 common.js 而不是写它的 index.js —— 它是 index.js（写）与 speaking.js（读）之间的**契约**，
   两页都引 common.js，才有唯一真值。踩过的坑：先写在 index.js 里，speaking.js 读不到那个 const，
   于是「暗号读走了但判定不成立」→ 点「练口语」过去什么都不发生、还不报错（最难查的一类静默失败）。 */
const QUICK_DRILL_KEY = 'hub_coach_quick';
const QUICK_DRILL_VAL = 'p1';
/* 「老用户判定」只看个人内容字段，绝不能把随 data.js 自带的官方内容算进来：
   speaking（官方题库）与 writing（写作模板）永远非空，用了会让所有新用户都被判成老用户。 */
const ONB_USER_FIELDS = ['words','sessions','plans','speakingStories','errorbook','corpus','scores',
  'mockRecords','writingScores','dictationSources','dictationLogs','checkins','longSent','energy'];
let _onbShownThisLoad = false;

ready(() => { hubLoad();
  if(typeof restoreCredsIfMissing === 'function') restoreCredsIfMissing();  // 早恢复：确保登录状态/Key/手机号在云端同步启动前已就位
  injectLoadingOverlay();                              // 注入全站跳转加载遮罩（默认隐藏，点击站内链接时显示）
  initBootLoader();                                    // 收起首屏内联遮罩（覆盖 Ctrl+F5 / 整页跳转的卡顿）
  initFloatTimer();                                   // 注入全站计时悬浮标签（跨页常驻，运行中显示）
  injectNav(); applyTheme(); restoreSideScroll(); initSoftNav();
  initOnboarding();                          // 首次进入引导（全新浏览器才弹，老用户静默回填零打扰）
  injectGlobalDock();                        // 全站玻璃底栏 dock（9/16 之之：+ FAB 砍掉——全站只有计划页有 data-fab-add 接杆，软导航残留后其他页全是死按钮）
  initListSearch();                          // 列表页 .ui-search 即时过滤（data-search-input + data-search-target）
  registerSW();
  initOfflineBar();                          // design/79 离线状态灯 + 自愈第三道闸（离线不判定、不计数、不自愈）
  // ⚡ 空闲时把其余页面的 HTML + 脚本预热进内存缓存，之后点任何 tab 都是零网络秒开
  (function(){
    const f = normalizePageFile(location.pathname.split('/').pop() || 'home.html');
    const cur = (PAGES.find(p => p.file === f) || { id:null }).id;
    setTimeout(() => prefetchAll(cur), 1200);
  })();
  // 计时保存后刷新侧边栏「今日已学」（侧边栏在所有页面可见，需即时更新）。
  // ⚠️ 关键修复（导航高亮闪烁 bug）：原来这里调 injectNav() 会「整条重建侧边栏 nav.innerHTML」，
  //    而页面 ready→hubSave→hub:session-saved 在软导航收尾后触发该重建，重建瞬间高亮被按「滞后/旧的
  //    _hubCurrentFile」重算 → 出现「正确→空白→跳回上一模块→再跳回正确」的可见闪烁。
  //    改为：只刷新计时徽标（renderSideTimer，纯文本更新不重建 DOM），绝不重建侧边栏；
  //    高亮由 updateActiveNav 专管（只切换 .active class，无重建、无闪烁）。
  document.addEventListener('hub:session-saved', () => { renderSideTimer(); });
  // 方案1：计时开始/结束/暂停时刷新全局徽标（无需重建整个侧边栏）
  document.addEventListener('hub:timer-state', renderSideTimer);
  // 通用 inner tab 切换：.tab-btn → .tab-panel（按 data-tab 匹配 #tab-<name>）
  // 修 review.html 内层 tab 死 tab（此前无 handler → 三面板堆叠+点击无效）；scores.html 已有 scores.js 同类 handler，叠加不冲突
  // v2：兼容 tab 按钮与面板不在同一父容器（review 页标题+tab 在右上角，面板在下方 section 内）
  document.addEventListener('click', function(e){
    var b = e.target.closest('.tab-btn');
    if(!b) return;
    var tabs = b.closest('.tabs');
    if(!tabs) return;
    // 清除本 tabs 内所有 tab-btn active
    tabs.querySelectorAll('.tab-btn').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active');
    // 找 panel：优先在 .tabs 父容器内找，找不到则全局按 id 找
    var panelId = 'tab-' + b.dataset.tab;
    var scope = tabs.parentElement || document.body;
    var panel = scope.querySelector('#' + panelId);
    if(!panel) panel = document.getElementById(panelId);
    if(!panel) return;
    // 在 panel 的父容器内清除其他 tab-panel active
    var panelScope = panel.parentElement;
    if(panelScope) panelScope.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    panel.classList.add('active');
  });
});

/* 2026-09-20 重新启用 Service Worker（sw.js 已重写：预缓存核心壳 + 分级缓存）。
   演进脉络：8/30「全网络直通」治农村弱网回退旧缓存；9/4 因纯线程开销停用并主动注销；
   现版 sw.js = HTML network-first（保新）+ 静态 SWR（缓存键去 ?v=）+ 核心壳预缓存，
   弱网/离线可打开，且版本一致性由页面侧 navDeployProbe / navSelfHealReload 自愈兜底（禁删）。 */
function registerSW(){
  try{
    if('serviceWorker' in navigator){
      // 根作用域注册；失败静默（隐私模式/极端环境照常在线使用，不影响任何功能）
      navigator.serviceWorker.register('sw.js').then(() => {
        // design/78：接管 sw.js 在 activate 时发的 {type:'SW_UPDATED'}（此前全站零消费端）。
        // ⚠️ 必须挂在 register 之后才安全：register 之前 navigator.serviceWorker 可能仍是 undefined。
        try{
          navigator.serviceWorker.addEventListener('message', e => {
            if(e.data && e.data.type === 'SW_UPDATED') maybeShowSwUpdatePrompt(e.data.version);
          });
        }catch(_){}
      }).catch(function(){});
    }
  }catch(e){}
}

/* ===== design/78 SW 更新提示（SW_UPDATED 前端接管） =====
   现状：SW 装好新版后靠 skipWaiting + clients.claim 静默接管，已打开的页面手里还是旧 HTML/JS，
   只能等 Ctrl+F5 或撞上自愈 reload —— 她本人的体验就是「改了东西不知道有没有生效」。
   现在：收到 SW_UPDATED → 顶部一条「发现新版本 · 刷新 / 稍后」。
   ⭐ 三条硬约束（与 design/75 去核武器化同源）：
   ① **绝不自动 reload**：只有她点「刷新」才 reload（自动刷新可能吃掉未落盘的作答）；
   ② **与自愈完全解耦**：不写任何自愈计数、不调 navSelfHealReload / navDeployProbe、不改那两道闸门；
   ③ 离线不弹（离线不可能拉到新版本）+ 答题中/引导遮罩中不弹（不打断心流）——
      这两种情况只 return、**不记 sessionStorage**，下次收到消息仍可再判。
   同一版本用 sessionStorage 守卫（hub_sw_prompted）→ 一次会话内不会反复弹；
   节点 body 直挂 + id 单例（软导航只换 <main>，提示条跨页常驻直到她点掉——这正是「待办事项不是 toast」）。 */
const SWU_BAR_ID = 'swUpdateBar';
const SWU_SEEN_KEY = 'hub_sw_prompted';     // sessionStorage：本会话已处理过的版本（不再弹）
const SWU_KNOWN_KEY = 'hub_sw_known';       // localStorage：本机已知装过的版本（区分「全新安装」与「真更新」）
function swMarkSwHandled(version){
  try{ sessionStorage.setItem(SWU_SEEN_KEY, String(version)); }catch(e){}
  try{ localStorage.setItem(SWU_KNOWN_KEY, String(version)); }catch(e){}
}
/* 「答题中」判定：背词全屏 / 引导遮罩 / 背词已出题未判定。
   ⚠️ pq 是 practice.js 的顶层 let —— 跨脚本可见但**不在 window 上**，必须用 typeof 探活
   （方案里写的 window.pq 恒为 undefined，守卫会永远失效）。 */
function swUpdateBusy(){
  try{
    /* 🔴 10/20 模考锁：模考中不弹「发现新版本」条。
       原因 = 它会往 body 尾部插一条 fixed 浮层（common.css .sw-update-bar），
       视觉上突然在屏幕顶部冒出一条 → 她感知到的「页面乱动」；
       而且点「刷新」就 location.reload() → 直接把模考刷掉。
       判据用全局模考锁（common-shell.js），四个模考页共用。 */
    if(typeof hubExamLocked === 'function' && hubExamLocked()) return true;
    if(document.body && document.body.classList.contains('hub-exam-locked')) return true;
    if(document.body && document.body.classList.contains('word-fullscreen')) return true;
    if(document.querySelector('#onbOverlay:not([hidden])')) return true;
    if(typeof pq !== 'undefined' && pq && pq.revealed === false && pq.queue && pq.queue.length) return true;
  }catch(e){}
  return false;
}
function swRemoveUpdateBar(){
  const el = document.getElementById(SWU_BAR_ID);
  if(el && el.parentNode) el.parentNode.removeChild(el);
}
function maybeShowSwUpdatePrompt(version){
  try{
    if(!version || !document.body) return;
    const v = String(version);
    /* ⭐ 首次安装不发提示（方案未预见）：sw.js 的 activate 在「全新安装」时也会跑一次并 postMessage
       （install→activate 一次跑完），此时她还没用过任何旧版，「发现新版本」是句废话、甚至像报错。
       首次只把版本号记进 localStorage，之后**真的换了版本**才提示。必须先于 sessionStorage 守卫判。 */
    let known = null;
    try{ known = localStorage.getItem(SWU_KNOWN_KEY); }catch(e){}
    if(!known){ try{ localStorage.setItem(SWU_KNOWN_KEY, v); }catch(e){} return; }
    if(sessionStorage.getItem(SWU_SEEN_KEY) === v) return;                  // 同一版本本会话只弹一次
    if(known === v) return;                                                 // 已知版本 = 无更新
    if(_isOffline || navigator.onLine === false) return;                    // design/79 离线闸：离线不弹
    if(swUpdateBusy()) return;                                              // 答题中/引导中不弹（且不计入已弹）
    if(document.getElementById(SWU_BAR_ID)) return;                         // 单例
    const bar = document.createElement('div');
    bar.id = SWU_BAR_ID;
    bar.className = 'sw-update-bar';
    bar.setAttribute('role', 'status');
    const txt = document.createElement('span');
    txt.className = 'sw-update-text';
    txt.textContent = '发现新版本';
    const refresh = document.createElement('button');
    refresh.className = 'btn btn-primary sw-update-btn';
    refresh.textContent = '刷新';
    refresh.addEventListener('click', () => {
      swMarkSwHandled(version);
      location.reload();
    });
    const later = document.createElement('button');
    later.className = 'btn sw-update-btn later';
    later.textContent = '稍后';
    later.addEventListener('click', () => {
      swMarkSwHandled(version);
      swRemoveUpdateBar();
    });
    bar.appendChild(txt); bar.appendChild(refresh); bar.appendChild(later);
    document.body.appendChild(bar);
  }catch(e){}
}

// ===== 错句本聚合：从 dictationLogs 提取所有错句，按「标准句 + 错误写法」去重 =====
// 返回 [{key, sourceId, sourceTitle, right(标准英文), wrong(学生写法), type, note, count(出错次数), lastDate}]
function collectWrongSentences(){
  const logs = DATA.dictationLogs || [];
  const map = {};   // key = sourceId + '|' + right + '|' + wrong
  logs.forEach(log => {
    const ms = Array.isArray(log.mistakes) ? log.mistakes : [];
    ms.forEach(m => {
      const right = (m.right || '').trim();
      const wrong = (m.wrong || '').trim();
      if(!right) return;
      const key = log.sourceId + '|' + right.toLowerCase() + '|' + wrong.toLowerCase();
      if((DATA.deletedWrongKeys||[]).includes(key)) return;   // 墓碑：已删的错句永不聚合显示（根治「删了又回来」）
      if(!map[key]){
        map[key] = { key, sourceId: log.sourceId, sourceTitle: log.title || '', right, wrong, type: m.type || '', note: m.note || '', count: 0, lastDate: log.date || '' };
      }
      map[key].count++;
      if(log.date && (!map[key].lastDate || log.date > map[key].lastDate)) map[key].lastDate = log.date;
    });
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}
// 按 sourceId 过滤错句（用于写作模板下「我的错句」折叠区）
function collectWrongBySource(sourceId){
  return collectWrongSentences().filter(x => x.sourceId === sourceId);
}
// 删除某条错句聚合项（从所有 logs 中移除该 right+wrong 的 mistake）
function deleteWrongItem(key){
  const parts = key.split('|');
  const sourceId = parts[0], right = parts[1], wrong = parts[2];
  const logs = DATA.dictationLogs || [];
  const removedIds = [];
  const remaining = [];
  logs.forEach(log => {
    if(log.id == null) log.id = uid();   // 兜底：删除前确保 id 存在，墓碑/合并按 id 才稳定
    if(log.sourceId !== sourceId){ remaining.push(log); return; }
    if(!Array.isArray(log.mistakes)){ remaining.push(log); return; }
    const before = log.mistakes.length;
    log.mistakes = log.mistakes.filter(m =>
      !((m.right || '').trim().toLowerCase() === right && (m.wrong || '').trim().toLowerCase() === wrong));
    if(log.mistakes.length !== before) log.updatedAt = Date.now();   // 标记本机较新，同步合并优先保留
    if(log.mistakes.length === 0){ if(log.id != null) removedIds.push(log.id); }  // 整条删光 → 墓碑防云端复活
    else remaining.push(log);
  });
  DATA.dictationLogs = remaining;
  // 写 mistake 级墓碑：被删 (sourceId|right|wrong) 持久化，跨同步传播，云端旧数据带回也不显示
  DATA.deletedWrongKeys = DATA.deletedWrongKeys || [];
  const wk = sourceId + '|' + right + '|' + wrong;
  if(!DATA.deletedWrongKeys.includes(wk)) DATA.deletedWrongKeys.push(wk);
  if(removedIds.length){
    DATA.deletedIds = DATA.deletedIds || [];
    removedIds.forEach(id => { if(!DATA.deletedIds.includes(id)) DATA.deletedIds.push(id); });
  }
  hubSave();
}

/* =========================================================================
   首次进入引导（9/30 重写 · 五步）
   1 欢迎 → 2 考试日期 + 目标总分 → 3 每日投入 → 4 词库 → 5 完成
   与旧版 v1 的差异（她 9/30 拍板）：
   - 去掉「手机号登录 / 游客」步（不再是进站门槛），改在完成页给一条轻提醒 + 「去设置」按钮；
   - 去掉「AI Key」步（之后 Key 走 CF 中转内置，用户不再自己填）；
   - 骨架借 SaaS 引导：顶部细进度条 + 居中卡 + 左右横滑 + 完成页打勾；皮肤是本站 teal + 白卡。
   设计要点：
   - 状态独立存 localStorage 键 hub_onboarding_v2，不进 DATA、不参与云同步；
     读到老键 hub_onboarding_v1 → 自动迁移成「已完成」，绝不打扰（见 getOnboarding 迁移分支）。
   - 老用户零打扰（硬要求）：启动时若有有效 DATA → 按实际数据静默回填，绝不弹遮罩、不弹提示条；
     只有「全新浏览器」（无数据）才走完整引导。
   - 遮罩挂在 <body> 下、<main> 之外：软导航只替换 <main>，永远不会误删/重建它。
   - z-index 99990 < #bootLoader 99999，且等首屏 bootLoader 收起后再显示，不抢首屏。
   - ⚠️ 每写一个 settings 字段都要打 _fieldTs（9/26 e02adc0 同步坑：不打戳会被云端旧值盖回）。
   - 全程禁止 prompt/alert/confirm；用户输入一律走 value / textContent，绝不拼进 HTML。
   ========================================================================= */
function onbDefaults(){
  /* exp:null = 未回答「考过雅思吗」（10/13 分流卡）；true/false = 已选，不再问 */
  return { v:2, entered:false, finished:false, setup:{ exam:false, effort:false, words:false }, snoozed:false, exp:null, ts:0 };
}
/* 老 v1 → v2 迁移：一次性迁成「已完成 + 不再提示」，老用户零打扰。
   ⭐ 返回 null 的唯一含义是「全新浏览器」（既没 v2 也没 v1），只有这种情况才走引导。 */
function _onbMigrateOld(){
  let old = null;
  try{ old = localStorage.getItem(ONB_OLD_KEY); }catch(e){}
  if(!old) return null;
  const mig = { v:2, entered:true, finished:true, snoozed:true,
    setup:{ exam:true, effort:true, words:true }, ts:Date.now() };
  try{ localStorage.setItem(ONB_KEY, JSON.stringify(mig)); }catch(e){}
  return mig;
}
function getOnboarding(){
  try{
    const raw = localStorage.getItem(ONB_KEY);
    if(!raw) return _onbMigrateOld();
    const o = JSON.parse(raw);
    if(!o || typeof o !== 'object') return onbDefaults();
    const d = onbDefaults();
    return { v:2,
      entered: !!o.entered,
      finished: !!o.finished,
      setup: Object.assign({}, d.setup, (o.setup && typeof o.setup === 'object') ? o.setup : {}),
      snoozed: !!o.snoozed,
      exp: (o.exp === true || o.exp === false) ? o.exp : null,
      ts: Number(o.ts) || 0 };
  }catch(e){ return null; }
}
function setOnboarding(patch){
  const cur = getOnboarding() || onbDefaults();
  const next = Object.assign({}, cur, patch || {}, { ts:Date.now() });
  next.setup = Object.assign({}, cur.setup, ((patch && patch.setup) || {}));
  try{ localStorage.setItem(ONB_KEY, JSON.stringify(next)); }catch(e){}
  return next;
}
/* 是否「已有有效数据」= 老用户判定：主 blob 里任一个人内容字段非空，或有任一设置痕迹。
   （ONB_USER_FIELDS 常量声明在文件前部的启动块之前，见那里的说明。）
   注意时序：本函数读的是 localStorage 里的原始 blob，不看内存 DATA —— 这样即使当前 DATA 还是默认值，
   只要存储里已有用户内容就算老用户。 */
function onbHasExistingData(){
  let raw = null;
  try{ raw = localStorage.getItem(HUB_KEY); }catch(e){ return false; }
  if(!raw) return false;
  try{
    const d = JSON.parse(raw);
    if(!d || typeof d !== 'object') return false;
    for(const f of ONB_USER_FIELDS){
      const v = d[f];
      if(Array.isArray(v) ? v.length > 0 : (v != null && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)) return true;
    }
    if(d.materials && typeof d.materials === 'object' && (Array.isArray(d.materials.materials) ? d.materials.materials.length > 0 : Object.keys(d.materials).length > 0)) return true;
    // 注意：activeTimer 不再算「已有数据」——口语页进页面会自动开计时并写入 activeTimer，
    // 全新用户深链 speaking.html 会被误判成老用户（onb 探针 ① 抓到）。
    const s = d.settings || {};
    return !!(s.syncCode || s.relayToken || s.examDate || s.name);
  }catch(e){ return false; }
}
/* 老用户静默回填：按真实数据把三步标成已完成，绝不弹任何东西。
   ⭐ entered 保持 false —— 首页提示条的显示条件是 entered=true，回填出来的状态永远不显示提示条（零打扰）。 */
function onbBackfillFromData(){
  const s = (DATA && DATA.settings) || {};
  const pc = (s.practiceCfg && typeof s.practiceCfg === 'object') ? s.practiceCfg : {};
  let hasWords = false;
  try{
    hasWords = (Array.isArray(DATA.words) && DATA.words.length > 0) ||
      (typeof wbActive === 'function' && wbActive() !== 'custom');   // design/78：官方词库激活同样算已设
  }catch(e){}
  return setOnboarding({ entered:false, finished:true, snoozed:true,
    setup:{ exam: !!s.examDate,
            effort: (Number(s.dailyGoalHours) > 0 || Number(pc.dailyCap) > 0),
            words: hasWords } });
}
/* 遮罩容器：body 直属、main 之外；软导航替换 main 时不受影响。
   ⚠️ id 必须是 onbOverlay（SW 更新提示的「答题中」判定按 id 找它），样式走 .onb2-overlay */
function onbEnsureEl(){
  let el = document.getElementById('onbOverlay');
  if(el && el.parentNode === document.body) return el;
  if(el && el.parentNode) el.parentNode.removeChild(el);
  el = document.createElement('div');
  el.id = 'onbOverlay';
  el.className = 'onb-overlay onb2-overlay';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '首次进入引导');
  document.body.appendChild(el);
  return el;
}
function onbClose(){
  const el = document.getElementById('onbOverlay');
  if(!el) return;
  el.hidden = true;
  el.innerHTML = '';
}
/* 等首屏 #bootLoader 收起再显示（bootLoader 元素 400ms 后才移除，这里等它打上 done 标记再 +300ms） */
function _onbWhenBootDone(cb){
  let waited = 0;
  (function poll(){
    const bl = document.getElementById('bootLoader');
    if(!bl || bl.dataset.done === '1'){ setTimeout(cb, 300); return; }
    if(waited >= 4000){ cb(); return; }        // 兜底：绝不因为等遮罩而卡住引导
    waited += 80;
    setTimeout(poll, 80);
  })();
}
function initOnboarding(){
  try{
    /* 🔴 10/14 她拍板「只在首页问，其他页不弹」：新用户第一次就从模考页/单词页等进站时，
       分流卡（你之前考过雅思吗？）会挡住正在使用的功能，很突兀。
       首页（home.html / index.html）才问；其余页面直接跳过，等他自己点到首页再问。
       ?onb=1 强制重看不受限（调试/演示用）。 */
    let force0 = false;
    try{ force0 = /(?:^|[?&])onb=1(?:&|$)/.test(location.search || ''); }catch(e){}
    if(!force0){
      const f = String((typeof _hubCurrentFile === 'string' && _hubCurrentFile) || location.pathname.split('/').pop() || '').toLowerCase();
      const isHome = /^(home|index)\.html$/.test(f) || f === 'home' || f === 'index' || f === '';
      if(!isHome) return;
    }
    // 引导里点了「去导入词库」→ 落到 practice.html 后自动切到词库 tab
    let flag = null;
    try{ flag = sessionStorage.getItem(ONB_GOTO_BANK); sessionStorage.removeItem(ONB_GOTO_BANK); }catch(e){}
    if(flag === '1' && /practice\.html$/.test(location.pathname)) onbLandBankTab();
    // 已走过引导的人想重看：任意页加 ?onb=1 即可（同样适用于调试/演示）
    let force = false;
    try{ force = /(?:^|[?&])onb=1(?:&|$)/.test(location.search || ''); }catch(e){}
    const st = getOnboarding();
    if(st && st.finished && !force){
      // ⭐ 回填缺失的三步完成态：按真实数据只做 false→true 升级、绝不降级
      const sset = (DATA && DATA.settings) || {};
      const pcfg = (sset.practiceCfg && typeof sset.practiceCfg === 'object') ? sset.practiceCfg : {};
      const patch = {};
      if(!st.setup.words && ((Array.isArray(DATA.words) && DATA.words.length) || (typeof wbActive === 'function' && wbActive() !== 'custom'))) patch.words = true;
      if(!st.setup.exam && sset.examDate) patch.exam = true;
      if(!st.setup.effort && (Number(sset.dailyGoalHours) > 0 || Number(pcfg.dailyCap) > 0)) patch.effort = true;
      if(Object.keys(patch).length) setOnboarding({ setup: patch });
      if(typeof renderOnboardingBar === 'function'){ try{ renderOnboardingBar(); }catch(e){} }   // 仅首页渲染提示条
      return;
    }
    // ⭐ 账号阶段没走完时，只要此刻已有有效数据就按老用户处理（静默回填、绝不打扰）。
    if(!force && onbHasExistingData()){ onbBackfillFromData(); return; }
    if(!st) setOnboarding({});
    if(_onbShownThisLoad && !force) return;
    _onbShownThisLoad = true;
    // ⭐ 真正弹遮罩前再判一次「是否已经有数据」：启动瞬间判定可能早于数据到位
    _onbWhenBootDone(function(){
      if(!force && onbHasExistingData()){ onbBackfillFromData(); return; }
      /* 10/13 她要求「不要所有人进来都弹新手引导」→ 先问考过没考过（只问一次，exp 落 ONB）；
         ?onb=1 强制重看跳过本卡直接进三步。 */
      if(!force){
        const stx = getOnboarding() || {};
        if(stx.exp !== true && stx.exp !== false){ onbRenderGate(); return; }
      }
      _onbLastDir = 1;
      onbRenderSetup(1);
    });
  }catch(e){}
}
/* 落到词库 tab：practice.js 的 switchWordTab 可能还没执行到，轮询等它出现 */
function onbLandBankTab(){
  setTimeout(function(){
    let n = 25;
    (function wait(){
      if(typeof switchWordTab === 'function'){
        try{ switchWordTab('bank'); }catch(e){}
        try{ onbBankBackHint(); }catch(e){}
        return;
      }
      if(n-- <= 0) return;
      setTimeout(wait, 120);
    })();
  }, 200);
}
/* 10/10 批④：从引导点「去导入我的词库」跳过来的用户，落到词库页后**没有任何回来的线索**（走查实拍：
   页面只有 0 个单词 + 「没有匹配的单词」，用户不知道导完要干嘛）。在词库容器顶部插一条一次性提示。 */
function onbBankBackHint(){
  const host = document.getElementById('bankView');
  if(!host || document.getElementById('onbBankHint')) return;
  const box = document.createElement('div');
  box.id = 'onbBankHint';
  box.className = 'onb-bank-hint';
  const txt = document.createElement('span');
  txt.textContent = '把单词贴进下面的「批量导入单词」就行。导好了回首页，继续把设置配完。';
  const back = document.createElement('a');
  back.className = 'btn btn-sm btn-primary';
  back.href = 'home.html';
  back.textContent = '回首页继续 →';
  box.appendChild(txt); box.appendChild(back);
  host.insertBefore(box, host.firstChild);
}

/* ---------- 设置写入：统一打时间戳（跨端同步靠它，漏一个就是「改了不生效」） ---------- */
function onbWrite(field, value){
  try{
    DATA.settings = DATA.settings || {};
    DATA.settings[field] = value;
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs[field] = Date.now();
  }catch(e){}
}
function onbWriteTarget(v){
  try{
    const cur = ((DATA.settings || {}).targets || {});
    onbWrite('targets', { overall: v,
      listening: Number(cur.listening) || 0, reading: Number(cur.reading) || 0,
      writing: Number(cur.writing) || 0, speaking: Number(cur.speaking) || 0 });
  }catch(e){}
}
function onbWriteDailyCap(raw){
  let n = Number(raw);
  if(isNaN(n) || n < 0) n = 0;
  n = Math.min(999, Math.round(n));
  // practice.js 在场就用它（顺带触发配额当场重算），不在场直接写 DATA 同一份字段
  if(typeof pcSave === 'function'){ try{ pcSave({ dailyCap:n }); return n; }catch(e){} }
  const cur = ((DATA.settings || {}).practiceCfg && typeof DATA.settings.practiceCfg === 'object') ? DATA.settings.practiceCfg : {};
  onbWrite('practiceCfg', Object.assign({}, cur, { dailyCap:n }));
  return n;
}

/* ---------- 五步渲染 ---------- */
function onbSetupState(){ return (getOnboarding() || onbDefaults()).setup; }
function _onbH(text){ const e = document.createElement('h3'); e.className = 'onb2-h'; e.textContent = text; return e; }
function _onbNote(text){ const e = document.createElement('p'); e.className = 'onb2-note'; e.textContent = text; return e; }
function _onbField(pane, id, labelText, type, opts){
  const lb = document.createElement('label');
  lb.className = 'onb2-label'; lb.setAttribute('for', id); lb.textContent = labelText;
  pane.appendChild(lb);
  const inp = document.createElement('input');
  inp.className = 'ui-box-input'; inp.type = type; inp.id = id;
  if(opts){
    if(opts.min != null) inp.min = opts.min;
    if(opts.max != null) inp.max = opts.max;
    if(opts.step != null) inp.step = opts.step;
    if(opts.placeholder) inp.placeholder = opts.placeholder;
    if(opts.value != null && opts.value !== '') inp.value = opts.value;
    if(opts.inputMode) inp.setAttribute('inputmode', opts.inputMode);
  }
  pane.appendChild(inp);
  return inp;
}
function onbRenderSetup(step){
  const el = onbEnsureEl();
  const hook = typeof onbDebugHook === 'function' ? onbDebugHook : null;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'onb2-wrap';
  const bar = document.createElement('div');
  bar.className = 'onb2-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '1');
  bar.setAttribute('aria-valuemax', String(ONB_TOTAL));
  bar.setAttribute('aria-valuenow', String(step));
  const fill = document.createElement('i');
  fill.style.width = Math.round((step / ONB_TOTAL) * 100) + '%';
  bar.appendChild(fill);
  wrap.appendChild(bar);
  const stage = document.createElement('div');
  stage.className = 'onb2-stage';
  const pane = document.createElement('div');
  pane.className = 'onb2-step ' + (_onbLastDir < 0 ? 'from-l' : 'from-r');
  stage.appendChild(pane);
  wrap.appendChild(stage);
  if(step === 1) onbPaintExam(pane, true);       // 10/1：step1 exam 带欢迎导语
  else if(step === 2) onbPaintEffort(pane);
  else onbPaintWords(pane, true);               // 10/1：step3 words 带完成总结
  const nav = document.createElement('div');
  nav.className = 'onb2-nav';
  if(step > 1){
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'btn btn-ghost btn-sm onb2-back'; back.textContent = '上一步';
    back.addEventListener('click', function(){ _onbLastDir = -1; onbRenderSetup(step - 1); });
    nav.appendChild(back);
  }else{
    const later = document.createElement('button');
    later.type = 'button'; later.className = 'btn btn-ghost btn-sm onb2-later'; later.textContent = '跳过，直接进站';
    later.addEventListener('click', function(){ onbFinish(false); });
    nav.appendChild(later);
  }
  const ind = document.createElement('span');
  ind.className = 'onb2-ind'; ind.textContent = step + ' / ' + ONB_TOTAL;
  nav.appendChild(ind);
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'btn btn-primary btn-sm onb2-next';
  next.textContent = (step === 1 ? '开始配置 →' : (step === 3 ? '进站，看今天做什么 →' : '继续 →'));
  next.addEventListener('click', function(){ _onbStepNext(step); });
  nav.appendChild(next);
  wrap.appendChild(nav);
  el.appendChild(wrap);
  el.hidden = false;

  /* 关闭兜底三件套（P0 10/3 紧急修复的 stuck visible）：遮罩空白/Escape/30s 自动关。
     10/13 抽成 onbBindDismiss 共用（分流卡也要绑）。 */
  onbBindDismiss(el);

  // 回车 = 继续（避免在输入框里敲回车没反应）
  try{
    wrap.addEventListener('keydown', function(e){
      if(e && e.key === 'Enter' && e.target && e.target.tagName === 'INPUT'){ e.preventDefault(); next.click(); }
    });
  }catch(_){}
  try{ setTimeout(function(){ const f = pane.querySelector('input'); if(f) f.focus(); }, 80); }catch(_){}
  if(hook){ try{ hook(step); }catch(_){} }
}
/* 关闭兜底三件套（遮罩空白点击 / Escape / 30s 自动关）——10/13 抽成共用：
   分流卡与三步卡都走它。幂等按 el.dataset._onbDismissBound 守卫。 */
function onbBindDismiss(el){
  if(!el || el.dataset._onbDismissBound) return;
  el.dataset._onbDismissBound = '1';
  // 点遮罩空白处关闭（点到 wrap/dialog 内部：target !== el 不关闭）
  el.addEventListener('click', function(e){ if(e && e.target === el){ onbFinish(false); } });
  // Escape 键关闭（挂 document，避免 dialog 里 input 聚焦时收不到）
  el._onbEscape = function(e){ if(e && e.key === 'Escape' && !el.hidden){ onbFinish(false); } };
  document.addEventListener('keydown', el._onbEscape);
  // 30s 自动关闭（兜底——防止任何原因导致渲染之后无人调 onbFinish/onbClose）
  el._onbAuto = setTimeout(function(){ if(!el.hidden){ onbFinish(false); } }, 30000);
  // onbClose 时清理监听和计时器
  const origClose = window.onbClose;
  window.onbClose = function(){
    if(el._onbEscape){ document.removeEventListener('keydown', el._onbEscape); el._onbEscape = null; }
    if(el._onbAuto){ clearTimeout(el._onbAuto); el._onbAuto = null; }
    origClose();
  };
}
/* 10/13 她要求「不要所有人进来都弹新手引导——先问考过没考过，没考过才看新手页」：
   引导前置分流卡。没考过 → 跳 beginner.html 看 3 分钟新手必读（回来后 initOnboarding
   发现未 finished 会继续弹三步配置：考试日期/投入/词库照配）；考过 → 直接进三步。
   exp 存 ONB（null=未选；选过不再问；?onb=1 强制重看也跳过本卡）。 */
function onbRenderGate(){
  const el = onbEnsureEl();
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'onb2-wrap';
  const stage = document.createElement('div');
  stage.className = 'onb2-stage';
  const pane = document.createElement('div');
  pane.className = 'onb2-step from-r';
  pane.appendChild(_onbH('你之前考过雅思吗？'));
  pane.appendChild(_onbNote('没考过 = 先带你用 3 分钟看完新手必读（考什么、怎么报名、机考要注意什么），再回来 30 秒配好开练。考过 = 直接开始配置。'));
  const row = document.createElement('div');
  row.className = 'onb2-gate';
  const mk = (t, s, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'onb2-gate-btn';
    const bb = document.createElement('b'); bb.textContent = t;
    const ss = document.createElement('span'); ss.textContent = s;
    b.appendChild(bb); b.appendChild(ss);
    b.addEventListener('click', fn);
    return b;
  };
  row.appendChild(mk('没考过', '第一次考，先看新手必读', function(){
    setOnboarding({ exp:false });
    try{ location.href = 'beginner.html?from=onb'; }catch(e){}
  }));
  row.appendChild(mk('考过', '老考生，直接开始配置', function(){
    setOnboarding({ exp:true });
    _onbLastDir = 1;
    onbRenderSetup(1);
  }));
  pane.appendChild(row);
  stage.appendChild(pane);
  wrap.appendChild(stage);
  el.appendChild(wrap);
  el.hidden = false;
  onbBindDismiss(el);
}
function _onbStepNext(step){
  try{
    // step 1 = exam (原 step 2)；step 2 = effort (原 step 3)；step 3 = words (原 step 4+5 合并)
    if(step === 1){
      const d = ((document.getElementById('onb2Exam') || {}).value || '').trim();
      const err = document.getElementById('onb2Err');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){
        if(err){ err.textContent = '请先选择考试日期（选错了随时能在「设置」里改）'; err.hidden = false; }
        return;
      }
      if(err) err.hidden = true;
      try{
        DATA.settings = DATA.settings || {};
        DATA.settings.examDate = d;
        DATA.settings.examDates = [];
        DATA.settings._fieldTs = DATA.settings._fieldTs || {};
        DATA.settings._fieldTs.examDate = Date.now();
        const tv = Number(((document.getElementById('onb2Target') || {}).value || '').trim());
        if(!isNaN(tv) && tv > 0) onbWriteTarget(Math.min(9, Math.round(tv * 2) / 2));
        hubSave();
      }catch(_){}
      setOnboarding({ setup:{ exam:true } });
      try{ if(typeof renderDashV6 === 'function') renderDashV6(); }catch(_){}
      _onbLastDir = 1;
      onbRenderSetup(2);
      return;
    }
    if(step === 2){
      try{
        const rawH = ((document.getElementById('onb2Hours') || {}).value || '').trim();
        const h = Number(rawH);
        if(!isNaN(h) && h >= 0){
          DATA.settings = DATA.settings || {};
          DATA.settings.dailyGoalHours = Math.min(24, Math.round(h * 10) / 10);
          DATA.settings._fieldTs = DATA.settings._fieldTs || {};
          DATA.settings._fieldTs.dailyGoalHours = Date.now();
        }
        const rawC = ((document.getElementById('onb2Cap') || {}).value || '').trim();
        onbWriteDailyCap(rawC === '' ? 60 : rawC);
        hubSave();
      }catch(_){}
      setOnboarding({ setup:{ effort:true } });
      _onbLastDir = 1;
      onbRenderSetup(3);
      return;
    }
    if(step === 3){
      // 词库步 + 完成合并：点「进站开工 →」即完成
      const st0 = getOnboarding() || onbDefaults();
      const s0 = st0.setup || {};
      const all = !!(s0.exam && s0.effort && s0.words);
      onbFinish(all);
      /* 路线图2 · 2b（10/12）：给「今日 3 件事」留一次性落地标记 —— home 页读到就滚动定位 +
         轻高亮，让引导预告的「首页会告诉你今天先做哪三件事」真的被看见（原落点不可控、常要滚动）。
         sessionStorage 而非 localStorage：关标签自然失效；读后即删 = 一次性，刷新/重进不重复触发。 */
      try{ sessionStorage.setItem('hub_onb_landed', '1'); }catch(e){}
      if(!/home\.html$/.test(location.pathname)) location.href = 'home.html';
      return;
    }
    _onbLastDir = 1;
    onbRenderSetup(Math.min(ONB_TOTAL, step + 1));
  }catch(e){}
}
function onbPaintExam(pane, withIntro){
  if(withIntro){
    const k = document.createElement('div');
    k.className = 'onb2-kicker'; k.textContent = '雅思备考 Hub';
    pane.appendChild(k);
    pane.appendChild(_onbH('把这三件事配好，就可以开工了'));
    pane.appendChild(_onbNote('考试日期 · 每日投入 · 你的词库。大约 30 秒，之后随时能在「设置」里改。'));
  }
  const s = (DATA && DATA.settings) || {};
  pane.appendChild(_onbH('考试日期与目标总分'));
  pane.appendChild(_onbNote('日期填了首页才有倒计时；目标总分可以先不填。'));
  const tv = Number(((s.targets) || {}).overall || 0);
  _onbField(pane, 'onb2Exam', '考试日期', 'date', { value: String(s.examDate || '') });
  const tDom = _onbField(pane, 'onb2Target', '目标总分（0–9，选填）', 'number',
    { min:'0', max:'9', step:'0.5', placeholder:'例如 6.0', value: (tv > 0 ? String(tv) : ''), inputMode:'decimal' });
  const chips = document.createElement('div');
  chips.className = 'onb2-chips';
  [5.5, 6, 6.5, 7].forEach(function(v){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'onb2-chip'; b.textContent = v.toFixed(1);
    b.addEventListener('click', function(){ tDom.value = String(v); });
    chips.appendChild(b);
  });
  pane.appendChild(chips);
  const err = document.createElement('div');
  err.className = 'onb2-err'; err.id = 'onb2Err'; err.hidden = true;
  pane.appendChild(err);
}
function onbPaintEffort(pane){
  const s = (DATA && DATA.settings) || {};
  const pc = (s.practiceCfg && typeof s.practiceCfg === 'object') ? s.practiceCfg : {};
  pane.appendChild(_onbH('每天打算投入多少'));
  pane.appendChild(_onbNote('都是估算，随时能改；填 0 或留空表示不限 / 不强制。'));
  _onbField(pane, 'onb2Hours', '每日学习时长（小时）', 'number',
    { min:'0', max:'24', step:'0.5', placeholder:'留空不限', inputMode:'decimal' });
  _onbField(pane, 'onb2Cap', '每日背词上限（个，0 = 不限）', 'number',
    { min:'0', max:'999', step:'1', value:'60', inputMode:'numeric' });
}
function onbPaintWords(pane, withDone){
  pane.appendChild(_onbH('你的词库'));
  pane.appendChild(_onbNote('导入自己的词库最有效；没有的话先用内置的官方 AWL 570，之后随时能换。'));
  /* 10/10 批④：官方库**当场激活、不跳页**（原实现点了直接跳 practice.html，用户既看不到完成总结、
     也不知道回来干嘛）。已激活状态改显示「已启用 ✓」+ 一个换库入口。 */
  const _activeBank = (function(){ try{ return (typeof wbActive === 'function') ? wbActive() : 'custom'; }catch(e){ return 'custom'; } })();
  if(_activeBank !== 'custom'){
    const okBox = document.createElement('div');
    okBox.className = 'onb2-okbox';
    const okB = document.createElement('b'); okB.textContent = '✓ 已启用官方 AWL 570';
    const okS = document.createElement('span'); okS.textContent = '学术高频词 · 570 个，直接开始背就行';
    okBox.appendChild(okB); okBox.appendChild(okS);
    pane.appendChild(okBox);
    const swap = document.createElement('button');
    swap.type = 'button'; swap.className = 'btn btn-ghost btn-sm onb2-block onb2-goimport';
    swap.textContent = '换成我自己的词库 →';
    swap.addEventListener('click', function(){
      setOnboarding({ entered:true, setup:{ words:false } });
      try{ sessionStorage.setItem(ONB_GOTO_BANK, '1'); }catch(e){}
      location.href = 'practice.html';
    });
    pane.appendChild(swap);
  } else {
    const goImport = document.createElement('button');
    goImport.type = 'button'; goImport.className = 'btn btn-primary onb2-block onb2-goimport';
    goImport.textContent = '去导入我的词库';
    goImport.addEventListener('click', function(){
      setOnboarding({ entered:true, setup:{ words:false } });   // 标记「待完成」：回来仍未完成 → 提示条继续提醒
      try{ sessionStorage.setItem(ONB_GOTO_BANK, '1'); }catch(e){}
      location.href = 'practice.html';
    });
    pane.appendChild(goImport);
    const goAwl = document.createElement('button');
    goAwl.type = 'button'; goAwl.className = 'btn onb2-block onb2-goawl';
    goAwl.textContent = '用官方 AWL 570';
    goAwl.addEventListener('click', function(){
      try{ if(typeof wbSetActive === 'function') wbSetActive('awl'); }catch(e){}
      setOnboarding({ entered:true, setup:{ words:true } });
      try{ if(typeof hubSave === 'function') hubSave(); }catch(e){}
      _onbLastDir = 1;
      onbRenderSetup(3);   // 就地重渲染 → 显示「已启用 ✓」，用户继续走完引导
    });
    pane.appendChild(goAwl);
  }
  // 10/1：原 step5 done 总结合并进来（点「进站开工 →」之前让用户看到自己配了什么）
  if(withDone){
    const s = (DATA && DATA.settings) || {};
    const pc = (s.practiceCfg && typeof s.practiceCfg === 'object') ? s.practiceCfg : {};
    const cap = Number(pc.dailyCap) || 0;
    const hours = Number(s.dailyGoalHours) || 0;
    const target = Number((s.targets || {}).overall || 0);
    const days = onbDaysLeft();
    const sep = document.createElement('div'); sep.style.height = '14px'; pane.appendChild(sep);
    const list = document.createElement('ul');
    list.className = 'onb2-list';
    [['距考试', days == null ? '未设置' : (days > 0 ? (days + ' 天') : (days === 0 ? '就是今天' : '已过'))],
     ['目标总分', target > 0 ? target.toFixed(1) : '未设置'],
     ['每日投入', (hours > 0 ? (hours + ' 小时') : '未设置') + ' · 背词 ' + (cap > 0 ? (cap + ' 个') : '不限')],
     ['词库', _activeBank !== 'custom' ? '官方 AWL 570' : ((Array.isArray(DATA.words) && DATA.words.length) ? ('我自己的 ' + DATA.words.length + ' 个词') : '还没设')]
    ].forEach(function(x){
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = x[0];
      const sp = document.createElement('span'); sp.textContent = x[1];
      li.appendChild(b); li.appendChild(sp);
      list.appendChild(li);
    });
    pane.appendChild(list);
    /* 10/10 批④：把「进站之后会看到什么」说清楚，与首页「今天先做这三件事」接上（原实现两边互不知情） */
    const hint = document.createElement('p');
    hint.className = 'onb2-note onb2-after';
    hint.textContent = '进站后，首页会按你的进度告诉你今天先做哪三件事——照着做就行，别的先不用管。';
    pane.appendChild(hint);
  }
}
function onbDaysLeft(){
  try{
    if(typeof examCountdown === 'function'){
      const cd = examCountdown();
      if(cd && typeof cd.daysLeft === 'number') return cd.daysLeft;
    }
    const d = String(((DATA && DATA.settings) || {}).examDate || '');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const t = new Date(d + 'T00:00:00');
    return Math.ceil((t.getTime() - Date.now()) / 86400000);
  }catch(e){ return null; }
}
/* 结束引导：关遮罩 + 首页提示条按状态重渲染 */
function onbFinish(allDone){
  const st = getOnboarding() || onbDefaults();
  const s = st.setup || {};
  const done = (s.exam ? 1 : 0) + (s.effort ? 1 : 0) + (s.words ? 1 : 0);
  if(allDone && done >= 3) setOnboarding({ finished:true, entered:true, snoozed:true });
  else setOnboarding({ finished:true, entered:true });
  onbClose();
  if(typeof renderOnboardingBar === 'function'){ try{ renderOnboardingBar(); }catch(e){} }
  if(typeof renderDashV6 === 'function'){ try{ renderDashV6(); }catch(e){} }
  try{ document.dispatchEvent(new CustomEvent('hub:onboarding-done')); }catch(e){}
}
/* 首页提示条点某一步 → 重新打开对应引导；?onb=1 也会走这里 */
function onbOpenSetup(step){
  _onbShownThisLoad = true;
  setOnboarding({ entered:true });
  _onbLastDir = 1;
  onbRenderSetup(Math.max(1, Math.min(ONB_TOTAL, Number(step) || 1)));
}

/* ===== 计划任务 → 站内跳转（9/24 自 plans.js 迁入：计划页删跳转钮，首页今日任务行整行可点） =====
   口语题号解析：题库N = DATA.speaking 数组顺序（1 起）；「P1/P2 第N题」= 该 part 列表第 N 题
   （排除框架母本，与口语页题库同口径）。autostart=1：落地页直接开始学习计时（她 9/24 拍板）。 */

/* 10/2 commit4：AI 生成任务（item.module/action/params，plans.js PLAN_WL 白名单同源）→ 落地页。
   放 common 是因为首页（index.js，不加载 plans.js）与计划页都要用：结构化映射优先于下面的
   planJumpInfo 文本猜测。
   🔴 10/13 修（她报「今日任务跳转页面都不对，点阅读跳去单词页」）：
   10/11 第 6-8 项已把四科模考统一搬进 bank.html（大 tab「模考」+ 阅读/听力/写作/口语四小 tab），
   但本表还停在 10/2 的老映射：practice/read 与 practice/listen 都指 practice.html（单词页）
   → 阅读、听力任务点了跳去单词页。改为按 action 细分：
     practice+read/listen/mock → bank.html（站内阅读/听力内容只在模考页）
     words（背单词）→ practice.html
   ⚠️ plans.js 的 PLAN_WL 有同名键但那是「AI 能生成哪些任务」的白名单，与落点页是两件事；
     两边本就允许不同（words→practice.html 即先例），本次只纠正 read/listen 的落点。 */
const PLAN_GEN_PAGES = {
  practice:  { file:'bank.html',      label:'听读练习' },
  speaking:  { file:'speaking.html', label:'口语练习' },
  materials: { file:'materials.html', label:'口语素材' },
  writing:   { file:'writing.html',   label:'写作' },
  words:     { file:'practice.html',  label:'背单词' },
  corpus:    { file:'corpus.html',    label:'长难句' },
  wrongbook: { file:'wrongbook.html', label:'错题本' }
};
function planGenJump(item){
  if(!item || !item.module) return null;
  /* 10/13：practice 下的「背单词」类任务（AI 偶尔用 practice/review 表达）仍应去单词页。
     判定：action 属 read/listen/mock 且不带 words 语义 → 模考页；其余 practice 一律单词页。 */
  if(item.module === 'practice'){
    const act = String(item.action || '');
    const txt = String((item.params && item.params.text) || item.text || '');
    if(/read|listen|mock/i.test(act) && !/单词|词汇|词库/i.test(txt)){
      return { file: 'bank.html', open: '', label: '去模考' };
    }
    return { file: 'practice.html', open: '', label: '去背词' };
  }
  const g = PLAN_GEN_PAGES[item.module];
  if(!g) return null;
  let open = '';
  if(item.module === 'speaking' && item.params && item.params.qno){
    const s = bankAt(item.params.qno);
    if(s && s.id) open = s.id;
  }
  return { file: g.file, open: open, label: g.label };
}
function bankAt(n){
  const q = (DATA.speaking || [])[Number(n) - 1];
  return q || null;
}
function planJumpInfo(text){
  const t = String(text || '');
  /* 10/12 C-2（她拍板 A：只补全正则覆盖面，不新增机制）。
     原正则只认 口语/背词/写作/错题本/素材 五个，她高频用的 阅读、听力、长难句（句子）、
     模考、回顾 全落空 → 手动/AI 纯文本任务点不动（静默形态：行不可点）。
     🔴 顺序即优先级，两处必须这样排：
       ① 「模考」必须**先于**各科目练习页判断 —— 10/11 第 6-8 项已把四科模考统一搬进
          bank.html（大 tab「模考」+ 阅读/听力/写作/口语四小 tab）。若让 /写作|作文/ 先匹配，
          「写作模考」会跳去 writing.html（那是旧的写作练习页）= 跳错模块，
          正是 10/5「继续上次」下线的同款教训。
       ② 「模考·阅读/听力」要在泛「模考」之前 —— 带上具体科语时落更准的小 tab 由 bank 自己认。 */
  if(/模考|全套|一套题/.test(t)){
    if(/阅读/.test(t)) return { file: 'bank.html', open: '', label: '去模考·阅读' };
    if(/听力/.test(t)) return { file: 'bank.html', open: '', label: '去模考·听力' };
    if(/写作|作文/.test(t)) return { file: 'bank.html', open: '', label: '去模考·写作' };
    if(/口语/.test(t)) return { file: 'bank.html', open: '', label: '去模考·口语' };
    return { file: 'bank.html', open: '', label: '去模考' };
  }
  /* 10/13 补：计时/专注类任务（「计时 25 分钟」「开一段专注」）→ timer.html。
     10/12 C-2 漏了这条，导致首页「开一段专注」的任务行不可点（点了没反应）。
     🔴 不能只写 /专注/ —— DAILY 模板里有「服专注达：把最难的任务放在药效前 6 小时」
     （服药提醒，含"专注"二字），会被误判成计时。所以要求：
       · 「计时」「番茄」直接认（无歧义）；
       · 「专注」必须搭配学习语义（一段/次/分钟/学习），排除「服专注达」。
     ⚠️ 服药模块任务（meds）本来就没有跳转目标，保持不可点是对的。 */
  if(/计时|番茄/.test(t)) return { file: 'timer.html', open: '', label: '去计时' };
  if(/专注/.test(t) && /一段|一次|分钟|学习|小时/.test(t) && !/服|药/.test(t))
    return { file: 'timer.html', open: '', label: '去计时' };
  if(/口语/.test(t)){
    let m = t.match(/题库(\d+)/);
    if(m){
      const s = bankAt(m[1]);
      return { file: 'speaking.html', open: (s && s.id) || '', label: '去口语' + (s ? '（' + (s.titleEn || s.titleZh || '') + '）' : '') };
    }
    m = t.match(/P([12])\s*第(\d+)\s*题/);
    if(m){
      const list = (DATA.speaking || []).filter(x => x && x.type === ('P' + m[1]) && !x.framework && !/^sp_p[12]_\d+$/.test(x.id || ''));
      const s = list[Number(m[2]) - 1] || null;
      return { file: 'speaking.html', open: (s && s.id) || '', label: s ? ('去口语 ' + (s.titleEn || s.titleZh || '')) : '去口语' };
    }
    return { file: 'speaking.html', open: '', label: '去口语' };
  }
  if(/背单词|背词|词库|单词/.test(t)) return { file: 'practice.html', open: '', label: '去背词' };
  if(/阅读/.test(t)) return { file: 'bank.html', open: '', label: '去模考·阅读' };
  if(/听力/.test(t)) return { file: 'bank.html', open: '', label: '去模考·听力' };
  if(/写作|作文/.test(t)) return { file: 'writing.html', open: '', label: '去写作' };
  if(/错题|错句本/.test(t)) return { file: 'wrongbook.html', open: '', label: '去错题本' };
  if(/素材|串题/.test(t)) return { file: 'materials.html', open: '', label: '去素材库' };
  if(/长难句|句子/.test(t)) return { file: 'corpus.html', open: '', label: '去长难句' };
  if(/回顾|轨迹|复盘/.test(t)) return { file: 'review.html', open: '', label: '去回顾' };
  return null;
}
/* 跳转 URL：带 open 直达该题；一律带 autostart=1 → 落地即开计时 */
function planJumpUrl(jmp){
  if(!jmp || !jmp.file) return '';
  return jmp.open
    ? (jmp.file + '?open=' + encodeURIComponent(jmp.open) + '&autostart=1')
    : (jmp.file + '?autostart=1');
}

/* ===== 今日计划自动延续（9/25 自 plans.js 抽出供首页共用） =====
   她 9/25 实测的 bug：昨天没做完的任务，只有打开「计划」页才会被延续到今天（延续逻辑原来
   只挂在 plans.js 的 render 里）→ 每天第一次打开首页「今日任务」永远是空的。
   口径与原实现完全一致：仅当「今天还没有计划对象」时，把昨天未完成的条目复制过来
   （新 id、done:false、carried:true、fromId 指回原条目——云端合并按 fromId 去重，跨端自动收敛）。
   今天计划对象已存在（包括被删空）→ 绝不写盘，防止「删都删不掉」。
   10/2 commit4：AI 生成项（module/action/params/gen）整组透传——顺延项仍能一键跳转、
   重排时仍被识别为生成项；手动项没有这些键，行为与以前完全一致。 */
function ensureTodayPlanCarried(){
  const t = todayKey();
  if((DATA.plans || []).some(p => p && p.date === t)) return false;
  const yp = (DATA.plans || []).find(p => p && p.date === addDays(t, -1));
  if(!yp || !Array.isArray(yp.items) || !yp.items.length) return false;
  const carried = yp.items.filter(i => i && !i.done);
  if(!carried.length) return false;
  DATA.plans.push({
    id: uid(), date: t, initialized: true,
    items: carried.map(i => {
      const row = { id: uid(), text: i.text, done: false, carried: true, fromId: i.id, updatedAt: Date.now() };
      if(i.module){ row.module = i.module; row.action = i.action; row.params = i.params || {}; row.gen = i.gen; }
      return row;
    })
  });
  try{ hubSave(); }catch(e){}
  return true;
}

/* ===== 10/2 commit4：「最近打开今日计划」打卡（3 天未回来 → 计划页提示重排）=====
   存 settings.planLastOpen（YYYY-MM-DD），字段级同步白名单已登记；跨天第一次写入才落盘并自打
   _fieldTs（不打时间戳会同 practiceCfg 的教训：时间戳 0 被云端旧值盖回去）。返回距上次打开的天数
   （首次/异常返回 0；调用方据此判断是否显示「计划过期」提示）。首页与计划页各调一次，幂等。 */
function touchPlanOpen(){
  try{
    const s = DATA.settings;
    const t = todayKey();
    if(!s || s.planLastOpen === t) return 0;
    let gap = 0;
    if(s.planLastOpen){
      const diff = Math.round((new Date(t + 'T00:00:00') - new Date(s.planLastOpen + 'T00:00:00')) / 86400000);
      gap = diff > 0 ? diff : 0;
    }
    s.planLastOpen = t;
    s._fieldTs = s._fieldTs || {};
    s._fieldTs.planLastOpen = Date.now();
    hubSave();
    return gap;
  }catch(e){ return 0; }
}

/* ===== 10/2 commit4：程序式软导航（任务行点击直达学习页）=====
   与点侧栏链接同一条 softNavigate 通道（高亮/遮罩/历史栈都一致）；目标不在 PAGES（如
   materials.html 非主导航页）或软导航异常时整页跳转兜底。href 可带 query（open/autostart）。 */
function hubSoftGo(href){
  try{
    const file = String(href || '').split('?')[0].split('#')[0] || 'home.html';
    const page = PAGES.find(p => p.file === file);
    if(!page){ location.href = href; return; }
    if(typeof showHubLoader === 'function') showHubLoader();
    if(typeof updateActiveNav === 'function') updateActiveNav(file);
    softNavigate({ id:page.id, file:page.file, href:href }, false);
  }catch(e){ location.href = href; }
}
