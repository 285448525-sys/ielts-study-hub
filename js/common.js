/* 共享 UI：导航注入、主题、Toast、通用工具 */
/* 统一 teal 线性 SVG 图标（替换原 emoji），stroke=currentColor 跟随侧栏配色 */
const ICON = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  timer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  plans:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
  meds:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 20.5a4.95 4.95 0 11-7-7l7-7a4.95 4.95 0 017 7z"/><path d="M8.5 8.5l7 7"/></svg>',
  practice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6c-2-1.5-5-1.5-7 0v12c2-1.5 5-1.5 7 0 2-1.5 5-1.5 7 0V6c-2-1.5-5-1.5-7 0z"/><path d="M12 6v12"/></svg>',
  corpus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="13" width="4" height="7" rx="1.5"/><rect x="17.5" y="13" width="4" height="7" rx="1.5"/></svg>',
  words:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  speaking:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z"/></svg>',
  mock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  writing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  review:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4v16h15"/><path d="M9 14v4M13 10v8M17 6v12"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>'
};

const PAGES = [
  { id:'index',     file:'index.html',     icon:ICON.home,      name:'仪表盘',     desc:'今日概览' },
  { id:'timer',     file:'timer.html',     icon:ICON.timer,     name:'计时学习',   desc:'选模块开计时' },
  { id:'plans',     file:'plans.html',     icon:ICON.plans,     name:'学习计划',   desc:'每日清单 + AI 排周' },
  { id:'meds',      file:'meds.html',      icon:ICON.meds,      name:'服药记录',   desc:'专注达药效窗口' },
  { id:'practice',  file:'practice.html',  icon:ICON.practice,  name:'单词',       desc:'学习与管理你的单词' },
  { id:'corpus',    file:'corpus.html',    icon:ICON.corpus,    name:'听力语料库', desc:'场景词汇听写' },
  { id:'errorbook', file:'errorbook.html', icon:ICON.words,     name:'词句库',     desc:'长难句 + 错题本' },
  { id:'speaking',  file:'speaking.html',  icon:ICON.speaking,  name:'口语素材库', desc:'题库 + AI 串题' },
  { id:'writing',   file:'writing.html',   icon:ICON.writing,   name:'写作模板库', desc:'模板 + AI 评分' },
  { id:'review',    file:'review.html',    icon:ICON.review,    name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'settings',  file:'settings.html',  icon:ICON.settings,  name:'设置',       desc:'同步 / AI / 数据' },
];

/* 收藏页面（⭐）——侧边栏「常用」与仪表盘「快捷入口」共用同一份，永远同步。
   从未收藏过时给 3 个新手默认项，避免入口空着。 */
const DEFAULT_FAV = ['timer','practice','speaking'];
function favPageIds(){
  const f = DATA.settings && DATA.settings.fav;
  return (f && f.length) ? f : DEFAULT_FAV.slice();
}

/* 一级常驻（高频 4 项，始终可见）+ 更多▾（其余 9 项，默认折叠） */
const PRIMARY_NAV = ['index','timer','review','practice'];
const MORE_NAV    = ['plans','meds','corpus','errorbook','speaking','writing','settings'];

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed) document.body.classList.add('side-collapsed');
  const current = location.pathname.split('/').pop() || 'index.html';
  const pageById = id => PAGES.find(p => p.id === id);
  const collapsedMap = (DATA.settings && DATA.settings.groupCollapsed) || {};
  const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  let html = '';
  html += '<div class="side-head"><span class="nav-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;vertical-align:-3px" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg></span><span>雅思备考 Hub</span><button class="side-collapse-in" id="sideCollapseIn" type="button" title="收起侧边栏" aria-label="收起侧边栏">⟨</button></div>';
  // 方案1：全局计时徽标容器（任何页面常驻；计时进行中显示呼吸徽标 + 一键结束，解决 P1/P3）
  html += '<div class="side-timer-wrap" id="sideTimer"></div>';
  html += '<input class="side-search" id="sideSearch" placeholder="搜索功能…" aria-label="搜索功能" />';

  // 一级常驻（跳过已收藏）
  const favSet = new Set(favPageIds().filter(id => id !== 'index'));
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ if(favSet.has(pid)) continue; const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '</div>';

  // ⭐ 我的收藏：常驻于一级之后、更多之前，默认展开；仪表盘 index 不参与置顶/去重
  const favPages = [...favSet].map(id => PAGES.find(p => p.id === id)).filter(Boolean);
  if(favPages.length){
    const favCol = (collapsedMap['fav'] === true) ? ' collapsed' : '';
    html += '<div class="side-fav' + favCol + '" data-g="fav">'
          +   '<div class="side-group-title"><span class="side-g-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7L12 4z"/></svg>我的收藏</span>'
          +     '<span class="side-toggle-arrow" data-g="fav" role="button" tabindex="0" aria-label="展开/收起 我的收藏" aria-expanded="' + (favCol === '' ? 'true' : 'false') + '">' + chev + '</span>'
          +   '</div>'
          +   '<div class="side-group-body"><div class="side-group-inner">';
    for(const p of favPages) html += sideItem(p, current);
    html +=     '</div></div></div>';
  }

  // 更多▾（默认折叠：groupCollapsed['more'] 非 false 即折叠，跳过已收藏）
  const moreCol = (collapsedMap['more'] === false) ? '' : ' collapsed';
  html += '<div class="side-group' + moreCol + '" data-g="more"><div class="side-group-title"><span class="side-g-label">更多</span><span class="side-toggle-arrow" data-g="more" role="button" tabindex="0" aria-label="展开/收起 更多" aria-expanded="' + (moreCol === '' ? 'true' : 'false') + '">' + chev + '</span></div>';
  html += '<div class="side-group-body"><div class="side-group-inner">';
  for(const pid of MORE_NAV){ if(favSet.has(pid)) continue; const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '</div></div></div>';
  nav.innerHTML = html;
  bindSidebar();
  renderSideTimer();   // 方案1：注入/刷新全局计时徽标（有活动会话才显示）
}

/* ===== 方案1 · 全局计时徽标（侧边栏常驻，解决 P1 不可见 + P3 跨页结束） =====
   设计红线：徽标只读活动会话状态、不新增任何计时实例；计时/恢复逻辑仍在 timer.js，
   本模块只做"呈现"与"结束"。活动会话来源：优先 window.active（计时页实时对象），
   否则回退 localStorage（loadActive）以覆盖"从未访问计时页、但会话已持久化"的场景。 */
function getActiveSession(){
  if(window.active) return window.active;
  try { return loadActive(); } catch(e){ return null; }
}
/* 轻量刷新：只更新时长数字 + 暂停态，绝不重建 DOM（避免打断停止按钮点击） */
function updateSideTimerBadge(){
  const box = document.getElementById('sideTimer');
  if(!box) return;
  const a = getActiveSession();
  if(!a){
    if(box.childElementCount) box.innerHTML = '';
    if(window.__sideTimerTick){ clearInterval(window.__sideTimerTick); window.__sideTimerTick = null; }
    return;
  }
  let ms = Date.now() - a.startTs - (a.pauseAccum || 0);
  if(a.paused && a.pauseStart) ms -= (Date.now() - a.pauseStart);
  ms = Math.max(0, ms);
  const live = document.getElementById('sideTimerLive');
  if(live) live.textContent = fmtHMS(ms/1000);
  const badge = document.getElementById('sideTimerBadge');
  if(badge) badge.classList.toggle('paused', !!a.paused);
}
function ensureSideTimerTick(){
  if(window.__sideTimerTick) return;
  window.__sideTimerTick = setInterval(updateSideTimerBadge, 1000);
}
/* 构建/隐藏徽标；仅在"无→有"过渡时重建 DOM 并绑定事件，避免每秒重建丢事件 */
function renderSideTimer(){
  const box = document.getElementById('sideTimer');
  if(!box) return;
  const a = getActiveSession();
  if(!a){
    if(box.childElementCount) box.innerHTML = '';
    if(window.__sideTimerTick){ clearInterval(window.__sideTimerTick); window.__sideTimerTick = null; }
    return;
  }
  if(!box.querySelector('#sideTimerBadge')){
    box.innerHTML =
      '<div class="side-timer running-badge" id="sideTimerBadge" role="button" tabindex="0" title="点击回到计时页">'
      + '<span class="st-ico">⏱</span>'
      + '<span class="st-name">' + escapeHtml(a.moduleName || a.subName || '学习') + '</span>'
      + '<span class="st-live" id="sideTimerLive">00:00:00</span>'
      + '<button class="st-stop" id="sideTimerStop" type="button" title="结束本次计时">结束</button>'
      + '</div>';
    const badge = document.getElementById('sideTimerBadge');
    const goTimer = () => { try{ softNavigate({ id:'timer', file:'timer.html', href:'timer.html' }, false); }catch(e){ location.href = 'timer.html'; } };
    badge.addEventListener('click', goTimer);
    badge.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goTimer(); } });
    document.getElementById('sideTimerStop').addEventListener('click', e => { e.stopPropagation(); sideStopClick(); });
  }
  updateSideTimerBadge();
  ensureSideTimerTick();
}
/* 结束按钮：在计时页走 timer.js 原生的 stopSession（保证计时页 UI 一致、零逻辑重复）；
   其它页用 common.js 的 DOM 安全版 stopActiveSession（数据落库 + 同步计时页 DOM 若存在）。 */
function sideStopClick(){
  if(document.getElementById('liveTimer') && typeof stopSession === 'function'){ stopSession(); }
  else if(typeof window.stopActiveSession === 'function'){ window.stopActiveSession(); }
}
/* 跨页安全结束：复用 timer.js stopSession 的数据语义，但不依赖计时页 DOM（data.js 全局函数即可完成）。 */
window.stopActiveSession = function(){
  const a = window.active || (function(){ try{ return loadActive(); }catch(e){ return null; } })();
  if(!a) return;
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
  let totalPauseMs = a.pauseAccum || 0;
  if(a.paused && a.pauseStart) totalPauseMs += (Date.now() - a.pauseStart);
  const endTs = Date.now();
  const totalSec = Math.round((endTs - a.startTs)/1000);
  const pauseSec = Math.round(totalPauseMs/1000);
  const durationSec = Math.max(0, totalSec - pauseSec);
  if((DATA.settings.chimeOnDone !== false) && durationSec > 0 && typeof playChime === 'function') playChime();
  DATA.sessions.push({
    id: uid(), date: todayKey(), moduleId: a.moduleId, subId: a.subId,
    moduleName: a.moduleName, subName: a.subName,
    startTs: a.startTs, endTs, durationSec, pauseSec
  });
  clearActive();
  window.active = null;
  hubSave();
  // 同步计时页 DOM（仅在计时页有效，避免回看时还显示旧的"进行中"）
  const liveTimer = document.getElementById('liveTimer');
  if(liveTimer){ liveTimer.textContent = '00:00:00'; liveTimer.style.color = ''; }
  const stopBtn = document.getElementById('stopBtn'); if(stopBtn) stopBtn.disabled = true;
  const pauseBtn = document.getElementById('pauseBtn'); if(pauseBtn){ pauseBtn.disabled = true; pauseBtn.textContent = '暂停'; pauseBtn.className = 'btn'; }
  const activeInfo = document.getElementById('activeInfo'); if(activeInfo) activeInfo.textContent = '当前没有进行中的学习';
  const focusInfo = document.getElementById('focusInfo'); if(focusInfo) focusInfo.textContent = '';
  if(typeof renderTimer === 'function' && document.getElementById('timerMods')) renderTimer();
  document.dispatchEvent(new CustomEvent('hub:session-saved', { detail: { date: todayKey() } }));
  document.dispatchEvent(new CustomEvent('hub:timer-state'));
  toast('已保存 ' + a.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) : ''));
};

function sideItem(p, current){
  const active = (p.file === current) ? 'active' : '';
  const isFav = favPageIds().includes(p.id);
  return `<a class="side-item ${active}" href="${p.file}" data-name="${p.name}" data-id="${p.id}">
    <span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span>
    <span class="side-star${isFav ? ' is-fav' : ''}" data-id="${p.id}" role="button" tabindex="0" title="收藏 / 取消收藏" aria-label="收藏">${isFav ? '♥' : '♡'}</span>
  </a>`;
}
function bindSidebar(){
  const nav = document.getElementById('mainNav');
  const inBtn = nav.querySelector('#sideCollapseIn');
  if(inBtn) inBtn.addEventListener('click', toggleSidebar);
  const search = nav.querySelector('#sideSearch');
  if(search){
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      nav.querySelectorAll('.side-item').forEach(a => {
        const name = (a.dataset.name || '').toLowerCase();
        const id = (a.dataset.id || '').toLowerCase();
        a.style.display = (!q || name.includes(q) || id.includes(q)) ? '' : 'none';
      });
      nav.querySelectorAll('.side-group, .side-fav').forEach(grp => {
        const any = [...grp.querySelectorAll('.side-item')].some(a => a.style.display !== 'none');
        grp.style.display = any ? '' : 'none';
      });
    });
  }
  nav.querySelectorAll('.side-star').forEach(star => {
    const toggleFav = e => {
      e.preventDefault(); e.stopPropagation();
      const id = star.dataset.id;
      // 从未收藏过时先把默认项落地，否则点掉默认项的 ♥ 会变成「反而加进去」
      if(!DATA.settings.fav || !DATA.settings.fav.length) DATA.settings.fav = DEFAULT_FAV.slice();
      DATA.settings.fav = DATA.settings.fav.includes(id)
        ? DATA.settings.fav.filter(x => x !== id)
        : DATA.settings.fav.concat(id);
      hubSave();
      injectNav();
      // 收藏列表变更：统一走 hub:favchange 事件让仪表盘「快捷入口」就地刷新。
      // 不再直接调 renderQuickLinks —— 软导航后该函数可能指向旧 eval 作用域（B 窗口已确认偶发失效），
      // 且直接调用若抛错会阻塞下方事件广播。事件由 index.js 监听、读取最新 DATA 重绘，最稳。
      document.dispatchEvent(new CustomEvent('hub:favchange'));
    };
    star.addEventListener('click', toggleFav);
    star.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleFav(e); }
    });
  });
  nav.querySelectorAll('.side-item').forEach(a => {
    a.addEventListener('click', () => {
      if(window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
    });
  });
  // 分组折叠：整条标题行可点击（含「常用」收藏区）
  nav.querySelectorAll('.side-group-title').forEach(title => {
    const toggle = () => {
      const g = title.querySelector('.side-toggle-arrow').dataset.g;
      const group = nav.querySelector(`.side-group[data-g="${g}"], .side-fav[data-g="${g}"]`);
      if(!group) return;
      const nowCol = group.classList.toggle('collapsed');
      const arrow = title.querySelector('.side-toggle-arrow');
      if(arrow) arrow.setAttribute('aria-expanded', String(!nowCol));
      DATA.settings.groupCollapsed = DATA.settings.groupCollapsed || {};
      DATA.settings.groupCollapsed[g] = nowCol;
      hubSave();
    };
    title.addEventListener('click', e => {
      // 点击标题行内任意位置都触发折叠，但不要干扰收藏星星按钮
      if(e.target.closest('.side-star')) return;
      e.stopPropagation(); toggle();
    });
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); }
    });
  });
  ensureMobileChrome();
}

function syncNavToggle(){
  const b = document.getElementById('sideToggle');
  if(!b) return;
  const open = document.body.classList.contains('nav-open');
  b.textContent = open ? '✕' : '☰';
  b.setAttribute('aria-label', open ? '关闭功能菜单' : '功能菜单');
  b.setAttribute('aria-expanded', String(open));
}

function ensureMobileChrome(){
  if(document.getElementById('sideToggle')) return;
  const btn = document.createElement('button');
  btn.id = 'sideToggle'; btn.className = 'side-toggle'; btn.innerHTML = '☰'; btn.setAttribute('aria-label', '功能菜单');
  const bd = document.createElement('div');
  bd.id = 'sideBackdrop'; bd.className = 'side-backdrop';
  document.body.appendChild(bd); document.body.appendChild(btn);
  btn.addEventListener('click', () => { document.body.classList.toggle('nav-open'); syncNavToggle(); });
  bd.addEventListener('click', () => { document.body.classList.remove('nav-open'); syncNavToggle(); });

  // 收起后左上角的展开按钮（桌面）
  const col = document.createElement('button');
  col.id = 'sideCollapse'; col.className = 'side-collapse';
  document.body.appendChild(col);
  col.addEventListener('click', toggleSidebar);
  syncCollapseIcon();
  syncNavToggle();
}

function toggleSidebar(){
  const now = document.body.classList.toggle('side-collapsed');
  DATA.settings.collapsed = now;
  hubSave();
  syncCollapseIcon();
}

function syncCollapseIcon(){
  const col = document.getElementById('sideCollapse');
  if(!col) return;
  const collapsed = document.body.classList.contains('side-collapsed');
  col.textContent = collapsed ? '☰' : '⟨';
  col.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
}

/* 侧栏滚动位置记忆：跳转子页面后导航栏保持原位、不跳回顶部
   pagehide 在导航离开当前页前触发（含 bfcache 场景），写入 sessionStorage；
   新页面加载后（injectNav 注入完条目、有真实高度时）再恢复 scrollTop。 */
const SIDE_SCROLL_KEY = 'hub_side_scroll';
function saveSideScroll(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  try{ sessionStorage.setItem(SIDE_SCROLL_KEY, String(nav.scrollTop)); }catch(e){}
}
function restoreSideScroll(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  try{
    const v = sessionStorage.getItem(SIDE_SCROLL_KEY);
    if(v != null) nav.scrollTop = Number(v) || 0;
  }catch(e){}
}
window.addEventListener('pagehide', saveSideScroll);

function applyTheme(theme){
  theme = theme || DATA.settings.theme || 'light';
  if(theme === 'auto') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2400);
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return null;                 // 非法/非 ISO 格式（如 2026/8/25）直接判空，避免渲染 NaN
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
}

/* 取"下一次考试"：优先 examDates 数组（多场日程），回退单个 examDate。
   选今天及之后最早的一场；若全部已过，返回最近一场（供"已结束"提示）。 */
function nextExamDate(){
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const arr = [];
  const push = v => { if(!v) return; const d = new Date(v + 'T00:00:00'); if(isNaN(d)) return; arr.push({ raw:v, d }); };
  (DATA.settings.examDates || []).forEach(push);
  push(DATA.settings.examDate);
  if(arr.length === 0) return null;
  const upcoming = arr.filter(x => x.d >= today0).sort((a,b) => a.d - b.d);
  if(upcoming.length) return { raw: upcoming[0].raw, passed:false };
  const past = arr.slice().sort((a,b) => b.d - a.d);
  return { raw: past[0].raw, passed:true };
}

/* 倒计时文案：修复原"已过 天"格式 bug（负数时不应再拼" 天"）。
   返回 { raw, md(MM-DD), daysLeft, label, hasExam }，label 为"还有"之后的部分。 */
function examCountdown(){
  const ne = nextExamDate();
  if(!ne) return { raw:'', md:'', daysLeft:null, label:'--', hasExam:false };
  const daysLeft = daysUntil(ne.raw);
  let label;
  if(daysLeft === null) label = '--';
  else if(daysLeft < 0) label = '已结束（' + Math.abs(daysLeft) + ' 天前）';
  else if(daysLeft === 0) label = '就是今天';
  else label = daysLeft + ' 天';
  return { raw: ne.raw, md: ne.raw.slice(5), daysLeft, label, hasExam:true };
}

function expireStr(ts){ const d=new Date(ts+MED_DURATION_MS); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }
function pad2(n){ return String(n).padStart(2,'0'); }

function statCard(label, value, color){
  return `<div class="stat-card" style="--accent:${color||'var(--primary)'};">
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

function progressBar(label, percent, color){
  return `<div class="bar-row">
    <div class="bar-info"><span>${label}</span><span>${Math.round(percent)}%</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,percent)}%;background:${color||'var(--primary)'};"></div></div>
  </div>`;
}

function renderEmpty(msg){ return `<div class="empty">${msg}</div>`; }

/* 共享：直接调用 DeepSeek（OpenAI 兼容 /chat/completions）。
   只需在「设置 / AI 接口」填一个 DeepSeek API Key，地址与模型已内置，降低门槛。
   Key 存在浏览器本地 localStorage；口语/翻译/长难句/写作等所有 AI 功能共用。
   service ∈ 'gpt' | 'trans' | 'longsent' | 'speaking_assist' | 'writing_score' | 'words'
   （统一用 deepseek-chat，service 仅作语义标记，不影响调用）。 */
const AI_BASE = 'https://api.deepseek.com/v1';
const AI_MODEL = 'deepseek-chat';
async function callRelay(service, messages, temperature){
  const s = DATA.settings || {};
  const key = s.relayToken || '';
  if(!key){ throw new Error('未配置 API Key（去「设置 / AI 接口」填写）'); }
  // 所有文本 AI 固定走内置 DeepSeek（地址与模型已写死），彻底移除中转代理开关
  const base = AI_BASE;
  const model = AI_MODEL;
  const url = base + '/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key
  };
  const body = {
    model: model,
    messages: messages,
    temperature: (temperature == null) ? 0.7 : temperature,
    stream: false
  };
  const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
  if(!res.ok){
    let detail = '';
    try{ const j = await res.json(); detail = (j && (j.error || j.detail || j.message || (j.error && j.error.message))) || ''; }catch(_){}
    if(!detail){ try{ detail = (await res.text()).slice(0,200); }catch(_){} }
    throw new Error('AI 接口返回 ' + res.status + (detail ? '：' + detail : ''));
  }
  const j = await res.json();
  if(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content != null){
    return j.choices[0].message.content;
  }
  if(j && typeof j.content === 'string') return j.content;
  throw new Error('AI 接口返回格式异常（缺少 choices[0].message.content）');
}

/* 视觉模型中继：已移除（P1-B，2026-08-16）。错题本改为纯文字粘贴，所有 AI 统一走 DeepSeek。 */

/* 从 AI 回复里抠出 JSON（模型常会带 ```json 围栏或前后废话）。
   解析失败返回 null，调用方自行降级显示原文。 */
function aiJson(content){
  if(!content) return null;
  let s = String(content).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try{ return JSON.parse(s); }catch(_){}
  const m = s.match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(_){} }
  return null;
}

/* 口语 GPT 对话 */
async function callGPT(messages){ return callRelay('gpt', messages, 0.8); }
/* 词库专用翻译（与口语GPT隔离，独立 service 区分，不回退） */
async function callTrans(messages){ return callRelay('trans', messages, 0.3); }
/* 长难句拆解 */
async function callLongsent(messages){ return callRelay('longsent', messages, 0.4); }

/* ===== 连续打卡 ===== */
function computeStreak(checkins){
  if(!checkins || !checkins.length) return 0;
  const set = new Set(checkins);
  let streak = 0;
  const d = new Date();
  if(!set.has(todayKey(d))) d.setDate(d.getDate() - 1); // 今天没打卡则从昨天起算
  while(set.has(todayKey(d))){ streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ===== 云端同步（Cloudflare Pages Function + KV，手机号账号） =====
   账号 = 手机号（6~15 位数字），与考研站完全一致。相同手机号 = 同一份云端数据
   （多设备共享）。非 Cloudflare 部署时 /api/sync 会 404，所有调用都会优雅降级
   （不报错、不弹窗刷屏）。账号通过 X-Sync-Key 请求头传递，兼容旧的 ?code= 参数。 */
let _cloudTimer = null;

/* 设备唯一标识：每台浏览器生成一次，写入 localStorage，用于云端记录来源 */
function getDeviceId(){
  let id = '';
  try { id = localStorage.getItem('hub_device_id') || ''; } catch(e){}
  if(!id){
    id = 'd' + uid();
    try { localStorage.setItem('hub_device_id', id); } catch(e){}
  }
  return id;
}

/* 统一的云端请求封装：自动带 X-Sync-Key 头（手机号即账号）。
   返回 [Response, json] 二元组，调用方自行判断 status。 */
async function syncApi(method, body){
  const headers = { 'Content-Type': 'application/json' };
  const phone = DATA.settings.syncCode || '';
  if(phone) headers['X-Sync-Key'] = phone;
  const opts = { method, headers };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/sync', opts);
  let data = null;
  try { data = await res.json(); } catch(e){}
  return [res, data];
}

function scheduleCloudUpload(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  if(_cloudTimer) clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(() => { cloudUpload(false); }, 1500); // 防抖，避免每次按键都上传
}
async function cloudUpload(showToast){
  showToast = showToast !== false;
  const phone = DATA.settings.syncCode;
  if(!phone){ if(showToast) toast('请先在「设置」绑定手机号'); return; }
  try{
    const [res] = await syncApi('PUT', { data: DATA, ts: Date.now(), deviceId: getDeviceId() });
    if(res.status === 404) throw new Error('云端未启用（需先部署 Functions）');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(showToast) toast('已上传到云端');
  }catch(e){ if(showToast) toast('云端上传失败：' + e.message); }
}
/* ===== 字段级合并（替代整份覆盖，避免双设备互相抹掉进度） ===== */
/* plans/checkins 已改为特判合并（_mergePlans / Set 去重），不在通用数组里 */
const SYNC_ARRAY_FIELDS = ['sessions','notes','meds','corpus','scores','errorbook',
  'energy','speaking','writing','writingScores','speakingStories','writingPhrases',
  'mockRecords','dictationSources','dictationLogs','longSent'];
/* 设置里允许跨设备同步的字段；relayToken/syncCode/autoSync/theme 永不同步 */
const SYNC_SETTINGS_FIELDS = ['name','examDate','examDates','targets','dailyGoalHours','links'];

/* 安全取数字：非有限数→0 */
function _num(x){ const n = Number(x); return isFinite(n) ? n : 0; }
/* 取更晚的日期/数值（ISO 日期串或时间戳均可；空值视为最旧） */
function _later(a, b){
  const av = (a == null || a === '') ? '' : a;
  const bv = (b == null || b === '') ? '' : b;
  return (av >= bv) ? av : bv;
}
/* 背单词：以 en（大小写不敏感）为 key，逐字段取「更掌握」状态，不丢任何一端进度。
   返回 {arr, changes}：changes = 云端新增词 + 被云端更新（更掌握/补 cn）的已有词数 */
function _mergeWords(local, cloud){
  const map = new Map();
  (cloud||[]).forEach(w => { if(w && w.en) map.set(String(w.en).toLowerCase(), Object.assign({}, w)); });
  let changes = 0;
  const localSeen = new Set();
  for(const w of (local||[])){
    if(!w || !w.en) continue;
    const k = String(w.en).toLowerCase();
    localSeen.add(k);
    const ex = map.get(k);
    if(!ex){ map.set(k, Object.assign({}, w)); continue; } // 本机独有：保留（非云端更新）
    let changed = false;
    const ns = Math.max(_num(ex.mcStreak), _num(w.mcStreak)); if(ns !== _num(ex.mcStreak)){ ex.mcStreak = ns; changed = true; }
    const ni = Math.max(_num(ex.mcInterval), _num(w.mcInterval)); if(ni !== _num(ex.mcInterval)){ ex.mcInterval = ni; changed = true; }
    const ne = Math.max(_num(ex.mcEase), _num(w.mcEase)); if(ne !== _num(ex.mcEase)){ ex.mcEase = ne; changed = true; }
    const nd = Math.min(_num(ex.mcDiff), _num(w.mcDiff)); if(nd !== _num(ex.mcDiff)){ ex.mcDiff = nd; changed = true; }
    const ndue = _later(ex.mcDue, w.mcDue); if(ndue !== ex.mcDue){ ex.mcDue = ndue; changed = true; }
    const cn1 = (ex.cn||'').trim(), cn2 = (w.cn||'').trim();
    const ncn = (cn1 && cn2) ? (cn1.length >= cn2.length ? cn1 : cn2) : (cn1 || cn2);
    if(ncn !== (ex.cn||'').trim()){ ex.cn = ncn; changed = true; }   // 与 trim 后比较，避免首尾空格造成每次误判"更新"
    if(changed) changes++;
  }
  // 云端独有词 = 真正新增
  for(const w of (cloud||[])){ if(w && w.en && !localSeen.has(String(w.en).toLowerCase())) changes++; }
  return { arr: Array.from(map.values()), changes };
}
/* 其他数组：按 id/ts 去重，冲突取较新；保留本机独有条目（不删）。
   返回 {arr, changes}：changes = 云端新增/更新的条目数 */
function _mergeArray(local, cloud){
  local = Array.isArray(local) ? local : [];
  cloud = Array.isArray(cloud) ? cloud : [];
  const keyOf = it => (it && it.id != null) ? ('id:'+it.id) : (it && it.ts != null) ? ('ts:'+it.ts) : (it != null ? 'h:'+JSON.stringify(it) : null);
  const tsOf  = it => _num(it && (it.ts || it.updatedAt));
  const byKey = new Map();
  let changes = 0;
  for(const it of local){ const k = keyOf(it); if(k) byKey.set(k, it); }
  for(const it of cloud){
    const k = keyOf(it);
    if(!k){ byKey.set('__nk_'+(byKey.size), it); changes++; continue; } // 无 key：各自保留，计为新增
    const ex = byKey.get(k);
    if(!ex){ byKey.set(k, it); changes++; }                  // 云端新增
    else if(tsOf(it) > tsOf(ex)){ byKey.set(k, it); changes++; } // 云端更新（较新者胜）
    // 否则保留本机（非云端更新），不计 changes
  }
  return { arr: Array.from(byKey.values()), changes };
}
/* 整体合并：以本机为基准，云端增量并入；不覆盖本机设置与任何独有数据。
   返回 {data, changes}：changes = 实际应用的合并处数（新增 + 更新），用于决定是否写盘/提示 */
function mergeData(local, cloud){
  cloud = cloud || {};
  const out = Object.assign({}, local);
  let changes = 0;
  const w = _mergeWords(local.words, cloud.words); out.words = w.arr; changes += w.changes;
  // plans：嵌套结构按 date 合并（同一天 items 按 id 并集、done 取或）
  const pl = _mergePlans(local.plans, cloud.plans); out.plans = pl.arr; changes += pl.changes;
  // checkins：日期字符串数组，Set 去重并集
  const ci = Array.from(new Set([...(local.checkins||[]), ...(cloud.checkins||[])]));
  if(ci.length !== (local.checkins||[]).length){ changes += ci.length - (local.checkins||[]).length; }
  out.checkins = ci;
  // 其余对象数组按原逻辑
  for(const f of SYNC_ARRAY_FIELDS){
    if(Array.isArray(cloud[f])){ const r = _mergeArray(local[f], cloud[f]); out[f] = r.arr; changes += r.changes; }
  }
  // 万能素材：素材卡按 id 并集；persona/gaps/answers 云端非空取云端
  const mt = _mergeMaterials(local.materials, cloud.materials); out.materials = mt.data; changes += mt.changes;
  // 进行中计时：updatedAt 新者胜（含 ended 广播）
  const at = _pickNewer(local.activeTimer, cloud.activeTimer);
  if(JSON.stringify(at) !== JSON.stringify(local.activeTimer || null)){ out.activeTimer = at; changes++; }
  // 设置白名单：云端非空且不同 → 取云端
  const ls = local.settings || {}; const cs = cloud.settings || {};
  out.settings = Object.assign({}, ls);
  for(const f of SYNC_SETTINGS_FIELDS){
    if(cs[f] != null && JSON.stringify(cs[f]) !== JSON.stringify(ls[f])){ out.settings[f] = cs[f]; changes++; }
  }
  return { data: out, changes };
}

/* plans 嵌套合并：外层按 date，内层 items 按 id 并集、done 冲突取 true */
function _mergePlans(local, cloud){
  local = Array.isArray(local) ? local : []; cloud = Array.isArray(cloud) ? cloud : [];
  const byDate = new Map(); let changes = 0;
  local.forEach(p => byDate.set(p.date, p));
  cloud.forEach(p => {
    const ex = byDate.get(p.date);
    if(!ex){ byDate.set(p.date, p); changes++; return; }
    const seen = new Set(ex.items.map(i => i.id));
    (p.items||[]).forEach(it => {
      if(!seen.has(it.id)){ ex.items.push(it); changes++; }
      else { const mine = ex.items.find(i => i.id === it.id); if(it.done && !mine.done){ mine.done = true; changes++; } }
    });
  });
  return { arr: Array.from(byDate.values()), changes };
}

/* 万能素材合并：素材卡按 id 并集（同 id 留本机）；persona/gaps/answers 云端非空取云端 */
function _mergeMaterials(local, cloud){
  local = local || {}; cloud = cloud || {};
  const out = Object.assign({}, local);
  let changes = 0;
  const map = new Map();
  (local.materials||[]).forEach(m => { if(m && m.id) map.set(m.id, m); });
  (cloud.materials||[]).forEach(m => { if(m && m.id && !map.has(m.id)){ map.set(m.id, m); changes++; } });
  out.materials = Array.from(map.values());
  if(cloud.persona && JSON.stringify(cloud.persona) !== JSON.stringify(local.persona)){ out.persona = cloud.persona; changes++; }
  if(Array.isArray(cloud.gaps) && cloud.gaps.length && JSON.stringify(cloud.gaps) !== JSON.stringify(local.gaps)){ out.gaps = cloud.gaps; changes++; }
  out.answers = Object.assign({}, local.answers||{}, cloud.answers||{});
  return { data: out, changes };
}
/* 进行中计时镜像：取 updatedAt 较新者（ended 广播也算较新方） */
function _pickNewer(a, b){ return (_num(b && b.updatedAt) > _num(a && a.updatedAt)) ? b : (a || null); }
/* 从云端合并拉取（替代整份覆盖）。silent=true 时仅在有更新时提示，用于自动拉取 */
async function cloudDownload(silent){
  const phone = DATA.settings.syncCode;
  if(!phone){ if(!silent) toast('请先在「设置」绑定手机号'); return false; }
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){ if(!silent) toast('云端没有该手机号的数据'); return false; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    const m = mergeData(DATA, data.data);
    if(m.changes > 0){
      DATA = m.data; // 合并而非覆盖：保留本机进度，并入云端新增/更新
      // 直接写 localStorage，不走 hubSave——避免「合并云端数据后又触发上传→另一端又拉到→乒乓刷屏」。
      // 本端独有数据会在用户下次操作（hubSave）时自然上传，无需在合并时立即回传。
      try{ localStorage.setItem(HUB_KEY, JSON.stringify(DATA)); }catch(e){}
      toast('已合并云端 ' + m.changes + ' 处更新');
      document.dispatchEvent(new CustomEvent('hub:data-merged'));
      // 自动同步有更新时刷新页面显示新数据（800ms 内先让用户看到 toast）；
      // 手动下载（!silent）只 toast 不 reload；进行中的计时页不 reload（避免打断计时）。
      // 不乒乓（合并不回传）→ 不会循环 reload，仅真有新数据时刷新一次。
      if(silent && !window.__timerActive) setTimeout(() => location.reload(), 800);
    } else if(!silent){
      toast('云端没有比本机更新的内容');
    }
    return true;
  }catch(e){ if(!silent) toast('云端下载失败：' + e.message); return false; }
}
async function cloudDelete(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先在「设置」绑定手机号'); return; }
  if(!confirm('确定删除云端该手机号的数据？此操作不可恢复。')) return;
  try{
    const [res] = await syncApi('DELETE');
    if(res.status === 404){ toast('云端未启用（需先部署 Functions）'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    toast('已删除云端数据');
  }catch(e){ toast('云端删除失败：' + e.message); }
}
/* 绑定并同步（注册 / 登录统一入口，单按钮）：
   - 点一下按钮：先 GET 探活。
   - 404 = 该手机号云端无数据 → 注册（直接 PUT 上传本机数据）；
   - 200 = 云端已有数据 → 直接登录（合并云端数据，非覆盖，避免本机进度被抹掉）；
   - 成功后自动开启自动同步。不做二次确认，与单按钮设计一致。 */
async function syncLoginOrRegister(){
  const phone = ($('#sSyncCode') ? $('#sSyncCode').value : '').replace(/\D/g, '');
  if(!phone){ syncSetStatus('请先输入手机号', 'error'); return; }
  if(phone.length < 6 || phone.length > 15){ syncSetStatus('手机号格式不正确（应为 6-15 位数字）', 'error'); return; }
  DATA.settings.syncCode = phone; hubSave();
  syncSetStatus('正在连接云端…', '');
  try{
    const [probe] = await syncApi('GET');
    if(probe.status === 404){
      // 注册：上传本机数据
      await syncApi('PUT', { data: DATA, ts: Date.now(), deviceId: getDeviceId() });
      enableAutoSyncAfterLogin(phone);
      syncSetStatus('✅ 注册成功，数据已上传云端', 'ok');
      renderSyncState();
    } else if(probe.ok){
      // 登录：云端已有数据 → 合并（非覆盖），避免本机未同步新增被云端数据抹掉
      const [res2, data] = await syncApi('GET');
      if(data && data.data){
        const m = mergeData(DATA, data.data);
        DATA = m.data;
        enableAutoSyncAfterLogin(phone);
        hubSave();
        syncSetStatus('✅ 登录成功，已合并云端数据', 'ok');
        renderSyncState();
        location.reload();
      } else {
        syncSetStatus('云端返回格式异常', 'error');
      }
    } else {
      syncSetStatus('云端连接失败（HTTP ' + probe.status + '）', 'error');
    }
  }catch(e){
    syncSetStatus('云端连接失败：' + e.message, 'error');
  }
}
/* 登录/注册成功后：写入手机号、默认开启自动同步、触发一次上传 */
function enableAutoSyncAfterLogin(phone){
  DATA.settings.syncCode = phone;
  DATA.settings.autoSync = true;
  hubSave();
  if(typeof scheduleCloudUpload === 'function') scheduleCloudUpload();
}
/* 设置页状态行（无对应 DOM 时静默） */
function syncSetStatus(msg, kind){
  const el = $('#syncStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'muted' + (kind ? ' sync-status-' + kind : '');
}
/* 设置页同步状态概览 */
function renderSyncState(){
  const el = $('#syncState');
  if(!el) return;
  const phone = DATA.settings.syncCode || '';
  if(!phone){ el.textContent = '尚未绑定手机号'; return; }
  el.textContent = '已绑定：' + phone + (DATA.settings.autoSync ? '（自动同步：开）' : '（自动同步：关）');
}

/* 自动双向同步：启动静默合并拉取一次 + 定时/回到页面时拉取（均为合并，不覆盖、不弹确认刷屏） */
function initCloudSync(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  cloudDownload(true); // 启动静默合并拉取（有更新才提示）
  setInterval(() => { if(!document.hidden) cloudDownload(true); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) cloudDownload(true); });
}
ready(initCloudSync);

/* ===== 桌面通知（番茄钟阶段切换 / 智能提醒）已移除：不再申请浏览器通知权限 ===== */

window.$ = s => document.querySelector(s);
function ready(fn){ if(document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

/* =========================================================================
   软导航（SPA-lite）：点击站内链接只替换 <main>，不整页刷新 → 消除换页卡顿
   设计红线（保证导航永远不被改坏）：
   - 在 document 上拦截 a[href] 点击；外部链接 / 新标签 / 下载 / 锚点 / 非 .html
     一律放行，走浏览器原生跳转。
   - 仅当目标是已知站内页面才软切换；其余（如导出 blob、mailto）放行。
   - 软切换任何一步失败（fetch 404/解析失败/异常）→ 立即 location.href 原生
     兜底跳转，用户永远不会“点不动”。
   - 每个页面脚本在切换后“重新执行一次”，天然复用其既有的 ready() 与事件绑定，
     不需要改 17 个页面 JS；DATA 与全部全局函数始终保留在内存里。
   ========================================================================= */
let _softNavReady = false;
let _softNavBusy = false;

function initSoftNav(){
  if(_softNavReady) return;
  _softNavReady = true;
  document.addEventListener('click', onHubLinkClick);
  window.addEventListener('popstate', onHubPopState);
}

/* 判断一个 <a> 是否指向已知站内页面；不是则返回 null（交回原生处理） */
function hubLinkTarget(a){
  if(!a || a.tagName !== 'A') return null;
  if(a.hasAttribute('download')) return null;
  const tgt = a.getAttribute('target');
  if(tgt && tgt !== '_self' && tgt !== '') return null;            // 新标签/指定窗口
  const href = (a.getAttribute('href') || '').trim();
  if(!href) return null;
  if(href.startsWith('#') || href.startsWith('?')) return null;    // 锚点 / 纯查询
  if(/^(https?:)?\/\//i.test(href)) return null;                   // 绝对/协议相对
  if(/^(mailto:|tel:|blob:|data:)/i.test(href)) return null;       // 非站内资源
  const file = href.split('#')[0].split('?')[0].split('/').pop();
  if(!file || !/\.html$/i.test(file)) return null;
  const page = PAGES.find(p => p.file === file);
  if(!page) return null;
  return { id: page.id, file: page.file, href };
}

function onHubLinkClick(e){
  if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  const t = hubLinkTarget(a);
  if(!t) return;                 // 放行：由浏览器原生处理
  e.preventDefault();            // 拦下，走软切换
  softNavigate(t, false);
}

function onHubPopState(){
  const file = location.pathname.split('/').pop() || 'index.html';
  const page = PAGES.find(p => p.file === file);
  if(page) softNavigate({ id: page.id, file: page.file, href: file }, true);
  else location.reload();
}

async function softNavigate(t, isPop){
  if(_softNavBusy){ if(typeof toast === 'function') toast('页面切换中，请稍候…'); return; }
  _softNavBusy = true;
  try{
    if(window.matchMedia && window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
    hubClearOrphanPageTimers();   // P0-A：离开旧页前清掉残留的计时/服药轮询心跳，避免软导航重进页面叠加“多个计时器同时跑 / 数字乱跳”
    const res = await fetch(t.href, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main');
    const main = document.querySelector('main');
    if(!newMain || !main) throw new Error('目标页缺少 <main>');
    swapPageStyles(doc, t.id);                          // 同步页面专属 <style>，避免样式丢失
    main.innerHTML = newMain.innerHTML;                 // 只换内容区，侧边栏/全局状态保留
    if(doc.title) document.title = doc.title;
    updateActiveNav(t.file);
    await runPageScript(t.id);                          // 重新执行目标页脚本（复用 ready + 事件绑定）
    if(!isPop) history.pushState({ hub: t.id }, '', t.href);
    prefetchNeighbors(t.id);
  }catch(err){
    console.warn('[soft-nav] 软切换失败，回退整页跳转：', err);
    location.href = t.href;                            // 兜底：绝不让导航“卡死”
  }finally{
    _softNavBusy = false;
  }
}

/* 软导航时同步目标页的 <head> 内联 <style>（页面专属样式），避免切页后样式丢失 */
function swapPageStyles(doc, pageId){
  document.querySelectorAll('style[data-hub-style]').forEach(el => el.remove());
  doc.querySelectorAll('head style').forEach((style, idx) => {
    const clone = style.cloneNode(true);
    clone.setAttribute('data-hub-style', pageId + '-' + idx);
    document.head.appendChild(clone);
  });
}

/* 更新侧边栏高亮（不重建侧边栏，避免丢失滚动位置/搜索态） */
function updateActiveNav(file){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  nav.querySelectorAll('.side-item').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === file);
  });
}

/* 重新执行目标页脚本：
   用间接 eval（window.eval）在全局作用域执行脚本源码。
   - function 声明挂到全局 → 跨页调用（如 restoreDefaultLinks 调 renderFavLinks/renderLinks）仍然可用；
   - let/const 只存在于本次 eval 的词法作用域 → 多次访问不会“标识符重复声明”报错，且状态随每次访问重置。
   脚本里的 ready(fn) 在已加载完成的文档上会立即同步运行 → 页面初始化自然发生。 */
async function runPageScript(id){
  const p = PAGES.find(p => p.id === id);
  if(!p) return;
  const res = await fetch('js/' + id + '.js', { cache: 'no-cache' });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const src = await res.text();
  try{
    window.eval(src);   // 幂等重跑：页面 ready 内部已各自清旧心跳 / 重绑事件，多次进入不叠加
  }catch(err){
    // P0-A：脚本执行异常（极偶发）→ 记日志后由 softNavigate 的兜底走整页跳转，绝不卡死
    console.error('[soft-nav] 页面脚本执行失败，将回退整页跳转：', id, err);
    throw err;
  }
}

/* P0-A：清理上一页可能残留的全局心跳（计时 __timerTick / 服药 __medsTick / 模考 __mockTick）。
   各页面 ready 自身已清旧心跳、updateTimer/renderMeds 也会在 DOM 消失时自停，
   这里再兜底一道，确保软导航重进页面不会叠加“多个计时器同时跑 / 数字乱跳”。
   模考 __mockTick 离开时清掉，可让“剩余时间”在断点续考时冻结在离开那一刻，而非继续走表。 */
function hubClearOrphanPageTimers(){
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
  if(window.__medsTick){ clearInterval(window.__medsTick); window.__medsTick = null; }
  if(window.__mockTick){ clearInterval(window.__mockTick); window.__mockTick = null; }
}

/* 空闲时预取同组相邻页面 HTML（走浏览器缓存，下次软切换近乎瞬时） */
function prefetchNeighbors(id){
  const grp = NAV_GROUPS.find(g => g.pages.includes(id));
  const neighbors = (grp && grp.pages) || [];
  if(!neighbors.length) return;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 800));
  idle(() => {
    neighbors.forEach(nid => {
      if(nid === id) return;
      const p = PAGES.find(p => p.id === nid);
      if(p) fetch(p.file, { cache: 'force-cache', method: 'GET' }).catch(() => {});
    });
  });
}

ready(() => { hubLoad(); injectNav(); applyTheme(); restoreSideScroll(); initSoftNav();
  registerSW();
  // 计时保存后刷新侧边栏「今日已学」（侧边栏在所有页面可见，需即时更新）
  document.addEventListener('hub:session-saved', () => injectNav());
  // 方案1：计时开始/结束/暂停时刷新全局徽标（无需重建整个侧边栏）
  document.addEventListener('hub:timer-state', renderSideTimer);
  // 通用 inner tab 切换：.tab-btn → .tab-panel（按 data-tab 匹配 #tab-<name>）
  // 修 review.html 内层 tab 死 tab（此前无 handler → 三面板堆叠+点击无效）；scores.html 已有 scores.js 同类 handler，叠加不冲突
  document.addEventListener('click', function(e){
    var b = e.target.closest('.tab-btn');
    if(!b) return;
    var wrap = b.closest('.tabs');
    if(!wrap) return;
    wrap = wrap.parentElement;
    if(!wrap) return;
    wrap.querySelectorAll('.tab-btn').forEach(function(x){ x.classList.remove('active'); });
    wrap.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    b.classList.add('active');
    var panel = wrap.querySelector('#tab-' + b.dataset.tab);
    if(panel) panel.classList.add('active');
  });
});

function registerSW(){ try{ if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{}); }catch(e){} }
