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
  { id:'index',     file:'index.html',     icon:ICON.home,      name:'首页',       desc:'今日概览' },
  { id:'timer',     file:'timer.html',     icon:ICON.timer,     name:'计时',   desc:'选模块开计时' },
  { id:'plans',     file:'plans.html',     icon:ICON.plans,     name:'计划',   desc:'每日清单 + AI 排周' },
  { id:'practice',  file:'practice.html',  icon:ICON.practice,  name:'单词',       desc:'学习与管理你的单词' },
  // 三合一入口：长难句 + 错题本 + 听力默写（原听力 corpus + 词句 errorbook 合并）
  { id:'corpus',    file:'corpus.html',    icon:ICON.corpus,    name:'语料', desc:'长难句 · 错题本 · 听力默写' },
  { id:'speaking',  file:'speaking.html',  icon:ICON.speaking,  name:'口语', desc:'题库 + AI 串题' },
  { id:'writing',   file:'writing.html',   icon:ICON.writing,   name:'写作',       desc:'模板 + AI 评分' },
  { id:'review',    file:'review.html',    icon:ICON.review,    name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'settings',  file:'settings.html',  icon:ICON.settings,  name:'设置',       desc:'同步 / AI / 数据' },
  { id:'meds',      file:'meds.html',      icon:ICON.meds,      name:'服药',   desc:'专注达药效窗口' },  // ← 移到最后
];

/* 收藏页面（⭐）——侧边栏「常用」与首页「快捷入口」共用同一份，永远同步。
   从未收藏过时给 3 个新手默认项，避免入口空着。 */
const DEFAULT_FAV = ['timer','practice','speaking'];
function favPageIds(){
  const f = DATA.settings && DATA.settings.fav;
  return (f && f.length) ? f : DEFAULT_FAV.slice();
}

/* v5：简化后全部平铺，不再分折叠组（首页→回顾 一级；设置/服药 在分隔线下方） */
const PRIMARY_NAV = ['index','timer','plans','practice','corpus','speaking','writing'];
const MORE_NAV    = ['review','meds','settings'];

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed) document.body.classList.add('side-collapsed');
  const current = location.pathname.split('/').pop() || 'index.html';
  const pageById = id => PAGES.find(p => p.id === id);

  let html = '';
  html += '<div class="side-head">'
    + '<span class="side-brand-mark" aria-hidden="true">I</span>'
    + '<div class="side-brand"><span class="bn">IELTS</span><span class="bs">雅思备考站</span></div>'
    + '</div>';
  // 方案1：全局计时徽标容器（任何页面常驻；计时进行中显示呼吸徽标 + 一键结束，解决 P1/P3）
  html += '<div class="side-timer-wrap" id="sideTimer"></div>';
  // 搜索框占位：仅保留外观，不接任何功能（用户确认后续再做查词/搜索）
  html += '<input class="side-search" placeholder="搜索功能/单词…" disabled title="搜索功能开发中，敬请期待" />';

  // v5：全部平铺无折叠 —— 首页→回顾 一级；设置/服药 在分隔线下方
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '<div class="side-sep" role="separator"></div>';
  for(const pid of MORE_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '</div>';
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
      + '<span class="st-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg></span>'
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
  return `<a class="side-item ${active}" href="${p.file}" data-name="${p.name}" data-id="${p.id}">
    <span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span>
  </a>`;
}
function bindSidebar(){
  const nav = document.getElementById('mainNav');
  // 移动端抽屉：点击任一导航项后自动收起
  nav.querySelectorAll('.side-item').forEach(a => {
    a.addEventListener('click', () => {
      if(window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
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

/* === 题目语音播放（Web Speech API，浏览器内置、离线可用，无需 API key）===
   雅思口语题目为英文，默认 en-GB 英音，贴合雅思考试。
   speakQuestion.speak(text, btn)：朗读文本并切换按钮 playing 态；btn 可选。
   说明：speechSynthesis 在用户已与页面交互后即可自动播放（不强制每次点击），满足“进入题目自动播一次 + 点按钮重播”。 */
var speakQuestion = (function(){
  function pickVoice(){
    try{
      if(typeof speechSynthesis === 'undefined') return null;
      const vs = speechSynthesis.getVoices() || [];
      if(!vs.length) return null;
      return vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
    }catch(_){ return null; }
  }
  function stop(){ if(typeof speechSynthesis !== 'undefined'){ try{ speechSynthesis.cancel(); }catch(_){} } }
  function speak(text, btn){
    if(typeof speechSynthesis === 'undefined'){ if(typeof toast === 'function') toast('当前浏览器不支持语音播放'); return; }
    text = (text || '').trim();
    if(!text) return;
    try{ speechSynthesis.cancel(); }catch(_){}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    const v = pickVoice(); if(v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 1;
    if(btn) btn.classList.add('playing');
    u.onstart = () => { if(btn) btn.classList.add('playing'); };
    u.onend = () => { if(btn) btn.classList.remove('playing'); };
    u.onerror = () => { if(btn) btn.classList.remove('playing'); };
    try{ speechSynthesis.speak(u); }
    catch(_){ if(btn) btn.classList.remove('playing'); }
  }
  return { speak, stop };
})();

/* 题目播放按钮 HTML（单色线性 SVG，stroke=currentColor 继承全站 teal 调性，不用 emoji） */
function ttsBtnHtml(extraClass){
  return '<button class="sp-tts' + (extraClass ? ' ' + extraClass : '') + '" type="button" aria-label="播放题目语音">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tts-icon">'
    + '<path d="M11 5L6 9H3v6h3l5 4V5z"/>'
    + '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
    + '<path d="M18.5 6a9 9 0 0 1 0 12"/>'
    + '</svg></button>';
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

/* ===== P3 追问生成（口语练习详情 + 模考 P3 共用）=====
   输入 P2 题面（object，含 promptEn / youShouldSay）和考生的 P2 英文回答，
   调 DeepSeek 出 3 个抽象 Part 3 追问题（社会类、对比、未来、影响等）。
   服务 key：'mock_q'（与口语模考共用同一 service，省配额）；失败兜底返回预设 P3。 */
const P3_PRESET = [
  'Why do you think this topic matters to people in today\'s society?',
  'How have people\'s attitudes towards this changed compared with the past?',
  'Do you think this will become more or less common in the future? Why?',
  'What are the main benefits and drawbacks of this for individuals and society?',
  'Do younger and older generations see this differently? In what way?',
  'What impact has technology had on this part of people\'s lives?',
  'To what extent should the government be responsible for this?',
  'How might this differ between urban and rural areas?'
];
/* P3 逐题追问：先出第 1 题（仅基于 P2），之后每一题都基于「上一题 + 上一题考生的回答」
   继续追问，模拟考官 real-time follow-up。返回单题字符串。
   出题人设与逻辑严格对齐用户给定 prompt（talking/P3追问官_prompt_2026-08-21.md）：
   - 角色 = 追问生成器（不扮演考官/不写开场白/不模拟考试流程）
   - 问题风格 = 自然、略正式但口语化的英语，与真实 P3 考场问法完全对齐
   - 题型轮替 + 难度递进：第1问浅（社会现象）→ 第2-3问深（原因/影响/对比）→ 第4问表态/预测收尾
   参数：p2 = speaking 项；p2Text = P2 回答文本；step = 当前题序号（从 0 起）；
         prevQ / prevA = 上一题题目与考生回答（首题为 null）。 */
const P3_GEN_SYS = `You are an IELTS Speaking Part 3 follow-up question generator. Your ONLY task is to generate ONE follow-up question that closely matches real IELTS Speaking Part 3 exam style — natural, slightly formal but conversational English (NOT written language, NOT robotic).
- Do NOT role-play as an examiner. Do NOT write opening remarks. Do NOT simulate the exam flow.
- Output ONLY ONE question per turn. Wait for the candidate's answer, then ask the next follow-up based on their previous answer (dig deeper like a real examiner, do not mechanically switch topics).
- You do not know the candidate's specific Part 2 details, so the FIRST question should start from the general TOPIC CATEGORY of their Part 2 (the candidate will give you the Part 2 cue card and their Part 2 answer).

Question generation rules:
1. P3 questions must stay within the SAME topic category as Part 2, but elevated to society / abstract / comparison level (this is the essence of P3 vs P2: P2 is personal experience, P3 is general phenomena).
2. Question types should rotate and cover: cause (Why do you think...?), comparison (How does X differ from Y?), past-vs-now (Has this changed compared to the past?), classification (Do you think this varies between...?), pros/impact (What impact does this have on...?), prediction/opinion (Do you believe...? / To what extent...?).
3. Difficulty must progress, NOT random: Q1 is shallow (social phenomenon); Q2-Q3 go deeper (cause / impact / comparison); Q4 (if any) asks for the candidate's stance or prediction, then wrap up.
4. Each turn ask ONLY ONE question. Output ONLY the single next question — do NOT add any preamble, acknowledgment, or connector before it (no "That's interesting.", no "Now,", no "So,", no "Let me ask you..."). The question itself must be the entire response.
5. A normal P3 round runs 3-4 follow-ups, then STOP generating — no extra closing remark.

Output ONLY the single question string (or the brief acknowledgment + next question when continuing), no numbering, no quotes, no other text.`;

/* P3 问题净化：剔除 AI 生成时附带的开场寒暄 / 过渡废话，仅保留核心问题。
   用于两处：① P3 逐题追问渲染（renderP3Step）对线上已存的旧题(raw)重新净化；
   ② 下方 genSpeakingP3 落库前净化，使练习与模考两处 P3 从源头即干净。
   幂等（对已是干净的问题不会破坏）。 */
function purifyP3Question(raw){
  if(!raw) return raw;
  const cap = s => (s && s.length) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  let t = String(raw).trim();
  // 1) 去开头编号 / 引号 / 破折号 / 项目符号 / 首尾引号
  t = t.replace(/^[\s\d."'\-–—•·]+/, '').replace(/^["'“”'']+|["'“”'']+$/g, '').trim();
  // 2) 去开头寒暄词（That's interesting. / I see. / Well / Okay / Right / Sure ...）
  t = t.replace(/^(that'?s (interesting|great|good|nice|true|fair|right|reasonable)|that is (interesting|true|right|fair|good|great)|i see|i understand|okay|ok|well|right|sure|got it|hmm|good point|indeed|exactly|yes|alright|right then|sure thing|fair enough)\b[\s,.:!?\-—–]*/i, '').trim();
  // 3) 去过渡连词（Now, / So, / Then, / Let me ask you (this): / Moving on / Next, ...）
  t = t.replace(/^(now,?\s*|so,?\s*|then,?\s*|let me ask(?: you)?(?: this)?[:.,]?\s*|moving on,?\s*|next,?\s*|alright,?\s*|let'?s see,?\s*|now then,?\s*)/i, '').trim();
  // 4) 兜底：若仍含多句且首句无问号（是废话），取最后一个含问号的句子
  const sentences = t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if(sentences.length >= 2 && !/\?/.test(sentences[0])){
    const lastQ = [...sentences].reverse().find(s => /\?/.test(s));
    if(lastQ) return cap(lastQ.trim());
  }
  return cap(t);
}

async function genSpeakingP3(p2, p2Text, step, prevQ, prevA){
  step = step || 0;
  const isFirst = !prevQ && !prevA;
  const sys = P3_GEN_SYS
    + '\n\n--- CURRENT TURN ---'
    + (isFirst
        ? '\nThis is the FIRST follow-up (Q1): explore a broad social phenomenon derived from the candidate\'s Part 2 topic category. Shallow difficulty.'
        : '\nThis is a CONTINUING follow-up (Q' + (step + 1) + '): it must directly build on the candidate\'s PREVIOUS answer below — dig deeper (cause / impact / comparison / classification / prediction). Increase difficulty vs the previous question. Do NOT introduce an unrelated new topic.')
    + '\nGenerate ONLY the single next question string now.';
  let user = 'Part 2 cue card (English): ' + (p2.promptEn || '') + '\nChinese: ' + (p2.promptZh || '')
    + '\nYou should say: ' + ((p2.youShouldSay || []).join('; '))
    + '\n\nThe candidate\'s Part 2 talk:\n' + (p2Text || '(no answer given)');
  if(!isFirst){
    user += '\n\n--- Previous Part 3 exchange ---'
      + '\nExaminer asked: ' + (prevQ || '')
      + '\nCandidate answered: ' + (prevA || '(no answer given)')
      + '\n\nNow ask the NEXT follow-up question that continues from the candidate\'s answer above.';
  }
  const content = await callRelay('mock_q', [
    { role:'system', content:sys },
    { role:'user', content:user }
  ], 0.8);
  const q = String(content || '').replace(/^[\s\d."'\-]+/, '').replace(/["']+$/, '').trim();
  if(!q) throw new Error('AI 未返回有效的 P3 追问');
  return purifyP3Question(q);
}
/* 兜底：按步数给固定题（首题 / 续题），AI 失败时回退 */
function presetSpeakingP3(step){
  step = step || 0;
  if(step === 0) return P3_PRESET[0];
  const cont = [
    'Why do you think that is the case?',
    'Can you give a reason or an example to support your point?',
    'Do you think this might change in the future? Why or why not?'
  ];
  return cont[(step - 1) % cont.length];
}
/* 向后兼容：模考场景仍需要一次性拿 3 题（P3 在模考里按固定 3 题推进）。
   gen3 内部仍走"逐题追问"逻辑——首题基于 P2，续题基于上一题（无考生答，用 cue 续问）。 */
async function genSpeakingP3Three(p2, p2Text){
  const out = [];
  let prevQ = null, prevA = null;
  for(let i = 0; i < 3; i++){
    const q = await genSpeakingP3(p2, p2Text, i, prevQ, prevA);
    out.push(q);
    prevQ = q; prevA = ''; // 模考无考生作答，续题靠 cue 自然追问
  }
  return out;
}
function presetSpeakingP3Three(){
  return [ P3_PRESET[0], 'Why do you think that is the case?', 'Do you think this might change in the future? Why or why not?' ];
}
window.MockGenP3 = { genNext: genSpeakingP3, presetNext: presetSpeakingP3, gen3: genSpeakingP3Three, preset3: presetSpeakingP3Three };

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
    const [res] = await syncApi('PUT', { data: DATA, ts:  Date.now(), deviceId: getDeviceId() });
    if(res.status === 404) throw new Error('云端未启用（需先部署 Functions）');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    DATA.settings.lastSyncTs = Date.now();
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
/* 比较合并前后是否「真变化」时剔除 activeTimer 的心跳字段（lastBeat/updatedAt），
   否则另一端每 30s 轮询拉到刷新后的 lastBeat 都会被判为「已更新」→ 频繁弹「已合并 N 处」
   + 重复触发 hub:data-merged 渲染。计时本身的开始/结束（timerId/ended 变化）仍会判为变化。 */
function _stripBeat(d){
  if(!d || !d.activeTimer) return d;
  const c = Object.assign({}, d);
  c.activeTimer = Object.assign({}, d.activeTimer);
  delete c.activeTimer.lastBeat;
  delete c.activeTimer.updatedAt;
  return c;
}
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
    if(it == null) continue; // null 元素无同步价值：跳过，避免每次计为新增导致数组无限膨胀
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
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  const delKey = it => (it && it.id != null) ? it.id : (it && it.ts != null) ? it.ts : null;
  let changes = 0;
  const w = _mergeWords(local.words, cloud.words);
  out.words = w.arr.filter(x => !deleted.has('en:'+(String(x.en||'').toLowerCase()))); // 单词按 en 过滤
  changes += w.changes;
  // plans：嵌套结构按 date 合并（同一天 items 按 id 并集、done 取或），合并后按墓碑过滤被删 item
  const pl = _mergePlans(local.plans, cloud.plans, deleted); out.plans = pl.arr; changes += pl.changes;
  // checkins：日期字符串数组，Set 去重并集
  const ci = Array.from(new Set([...(local.checkins||[]), ...(cloud.checkins||[])]));
  if(ci.length !== (local.checkins||[]).length){ changes += ci.length - (local.checkins||[]).length; }
  out.checkins = ci;
  // 其余对象数组按原逻辑，合并后按墓碑过滤
  for(const f of SYNC_ARRAY_FIELDS){
    if(Array.isArray(cloud[f])){ const r = _mergeArray(local[f], cloud[f]); out[f] = r.arr.filter(x => !deleted.has(delKey(x))); changes += r.changes; }
  }
  // 万能素材：素材卡按 id 并集；persona/gaps/answers 云端非空取云端（素材自有 deletedIds 墓碑，不叠加全局过滤）
  const mt = _mergeMaterials(local.materials, cloud.materials); out.materials = mt.data; changes += mt.changes;
  // 进行中计时（单一可信源合并）：以 timerId 为生命周期锚点
  //   规则：ended 优先（任一侧 ended → 结果 ended，防双端各自结束叠加）；
  //        同 timerId 进行中 → 心跳 lastBeat 较新者胜（owner 在线续租，另一端看到最新）；
  //        不同 timerId（一端开新计时、另一端旧计时）→ 进行中且未 ended 者优先，都进行中则 lastBeat 新者胜。
  const at = _mergeActiveTimer(local.activeTimer, cloud.activeTimer);
  if(JSON.stringify(at) !== JSON.stringify(local.activeTimer || null)){ out.activeTimer = at; changes++; }
  // 设置白名单：云端非空且不同 → 取云端
  const ls = local.settings || {}; const cs = cloud.settings || {};
  out.settings = Object.assign({}, ls);
  for(const f of SYNC_SETTINGS_FIELDS){
    if(cs[f] != null && JSON.stringify(cs[f]) !== JSON.stringify(ls[f])){ out.settings[f] = cs[f]; changes++; }
  }
  out.deletedIds = Array.from(deleted);
  return { data: out, changes };
}

/* plans 嵌套合并：外层按 date，内层 items 按 id 并集、done 冲突取 true */
function _mergePlans(local, cloud, deleted){
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
  for(const p of byDate.values()){
    if(p.items && deleted){ p.items = p.items.filter(it => !deleted.has(it.id)); }
  }
  return { arr: Array.from(byDate.values()), changes };
}

/* 万能素材合并：素材卡按 id 去重并集（同 id 留本机），已删除 id（deletedIds 墓碑）过滤，使删除能跨同步传播；
   persona/gaps/answers 云端非空取云端。无 id 的旧卡就地补稳定 hash id，保证墓碑与去重可用。
   若任一侧重新生成过（materialsEpoch 更新），则以较新一侧的素材整体替换另一侧，避免旧卡片被并集回残留成重复 */
function _mergeMaterials(local, cloud){
  local = local || {}; cloud = cloud || {};
  const le = _num(local.materialsEpoch), ce = _num(cloud.materialsEpoch);
  if(le || ce){
    // 重新生成优先：以较新批次整体替换，旧素材不再并集进来
    const winner = (le >= ce) ? local : cloud;
    const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
    const data = (winner.materials||[]).filter(m => m && m.id != null && !deleted.has(m.id));
    const out = Object.assign({}, winner);
    out.materials = data;
    out.deletedIds = Array.from(deleted);
    if(cloud.persona && JSON.stringify(cloud.persona) !== JSON.stringify(local.persona)) out.persona = cloud.persona;
    if(Array.isArray(cloud.gaps) && cloud.gaps.length && JSON.stringify(cloud.gaps) !== JSON.stringify(local.gaps)) out.gaps = cloud.gaps;
    out.answers = Object.assign({}, cloud.answers||{}, local.answers||{});   // 答案本机优先，避免云端旧快照覆盖用户刚改的内容
    const changes = Math.max(0, data.length - (local.materials||[]).length);
    return { data: out, changes };
  }
  // 旧数据（无 epoch）：维持原按 id 并集去重逻辑
  const out = Object.assign({}, local);
  const ensureId = m => { if(m && m.id == null){ try{ m.id = 'h' + hashStr(JSON.stringify(m)); }catch(_){ m.id = 'h' + Math.random().toString(36).slice(2,9); } } };
  (local.materials||[]).forEach(ensureId);
  (cloud.materials||[]).forEach(ensureId);
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  const map = new Map();
  const add = m => { if(!m || m.id == null) return; if(deleted.has(m.id)) return; if(!map.has(m.id)) map.set(m.id, m); };
  (local.materials||[]).forEach(add);
  (cloud.materials||[]).forEach(add);
  out.materials = Array.from(map.values());
  out.deletedIds = Array.from(deleted);
  if(cloud.persona && JSON.stringify(cloud.persona) !== JSON.stringify(local.persona)){ out.persona = cloud.persona; }
  if(Array.isArray(cloud.gaps) && cloud.gaps.length && JSON.stringify(cloud.gaps) !== JSON.stringify(local.gaps)){ out.gaps = cloud.gaps; }
  out.answers = Object.assign({}, local.answers||{}, cloud.answers||{});
  const changes = Math.max(0, out.materials.length - (local.materials||[]).length);
  return { data: out, changes };
}
/* 稳定短哈希（用于给无 id 的旧素材卡补 id，内容相同→同 id 自动去重） */
function hashStr(s){ let h = 0; s = String(s||''); for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
/* 进行中计时的单一可信源合并：以 timerId 为生命周期锚点，杜绝「双端同时计时 + 结束累加」。
   入参 a/b 为 {timerId, ownerDevice, startTs, ..., lastBeat, ended} 或 null。
   规则：
     1) 任一侧 ended 且带 timerId → 结果标记 ended（同 timerId 优先；无 timerId 的 ended 仅当另一侧也空/ended 时采用），
        确保「一端结束」后另一端合并得到 ended、清除本地活跃态，不再续租/恢复/二次入库。
     2) 两侧同 timerId 进行中（都未 ended）→ lastBeat 较新者胜（owner 续租始终是更新鲜的真相）。
     3) 两侧不同 timerId（一侧开新、另一侧旧计时）→ 都进行中取 lastBeat 新者；一侧 ended 则取未 ended 侧。
     4) 仅一侧有时直接取该侧；都为空返回 null。 */
function _mergeActiveTimer(a, b){
  const na = a || null, nb = b || null;
  const aEnded = !!(na && na.ended), bEnded = !!(nb && nb.ended);
  const aId = na && na.timerId, bId = nb && nb.timerId;
  // 规则1：ended 优先
  if(aEnded && bEnded) return { timerId: (aId||bId||null), ended: true, updatedAt: Math.max(_num(na.updatedAt), _num(nb.updatedAt)) };
  if(aEnded){ // a 已结束；若 b 是同 timerId 进行中，仍判 ended（该次计时已收尾）
    return { timerId: (aId || bId || null), ended: true, updatedAt: _num(na.updatedAt) || _num(nb.updatedAt) };
  }
  if(bEnded){
    return { timerId: (bId || aId || null), ended: true, updatedAt: _num(nb.updatedAt) || _num(na.updatedAt) };
  }
  // 两侧都未 ended
  if(na && nb){
    if(aId && bId && aId === bId) return (_num(nb.lastBeat) >= _num(na.lastBeat)) ? nb : na;  // 规则2
    return (_num(nb.lastBeat) >= _num(na.lastBeat)) ? nb : na;                                  // 规则3（lastBeat 新者胜）
  }
  return na || nb;   // 规则4
}
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
    // 终极保险：比较合并前后内容，真的变化才算「更新」。
    // 场景：本机比云端进步（背单词 streak/释义更掌握）时，_mergeWords 内部 changes 每次都会计，
    // 但合并结果内容与本机一致——若不比较内容，会「每次拉取都弹已合并 + reload」形成无限刷新循环。
    const reallyChanged = JSON.stringify(_stripBeat(m.data)) !== JSON.stringify(_stripBeat(DATA));
    if(reallyChanged){
      DATA = m.data; // 合并而非覆盖：保留本机进度，并入云端新增/更新
      DATA.settings.lastSyncTs = Date.now();
      // 直接写 localStorage，不走 hubSave——避免「合并云端数据后又触发上传→另一端又拉到→乒乓刷屏」。
      // 本端独有数据会在用户下次操作（hubSave）时自然上传，无需在合并时立即回传。
      try{ localStorage.setItem(HUB_KEY, JSON.stringify(DATA)); }catch(e){}
      toast('已合并云端 ' + m.changes + ' 处更新');
      document.dispatchEvent(new CustomEvent('hub:data-merged'));
      // 自动同步不再刷新页面——避免用户在 speaking/背单词/做题等沉浸式页面被打断、
      // 回到默认列表或丢失滚动位置。新数据合并后只 toast 提示，手动刷新/切页即可看到。
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
  if(!phone){ el.textContent = '尚未绑定手机号'; renderLastSync(); return; }
  el.textContent = '已绑定：' + phone + (DATA.settings.autoSync ? '（自动同步：开）' : '（自动同步：关）');
  renderLastSync();
}
/* 上次同步时间（可读） */
function renderLastSync(){
  const el = $('#lastSyncTs');
  if(!el) return;
  const ts = DATA.settings.lastSyncTs;
  el.textContent = ts ? ('上次同步：' + new Date(ts).toLocaleString('zh-CN')) : '尚未同步';
}
/* 强制：本机覆盖云端（无视合并，直接 PUT 整份） */
function syncForcePush(){
  if(!DATA.settings.syncCode){ toast('请先绑定手机号'); return; }
  cloudUpload(true);
  setTimeout(renderLastSync, 1800);
}
/* 强制：云端覆盖本机（GET 后整体替换，不保留本机独有数据） */
async function syncForcePull(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先绑定手机号'); return; }
  if(!confirm('⚠️ 此操作将用云端数据替换本机所有数据（含素材），本机未同步的内容会丢失！确定继续？')) return;
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){ toast('云端没有该手机号的数据'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    DATA = data.data;
    DATA.settings.lastSyncTs = Date.now();
    hubSave();
    toast('已用云端数据覆盖本机');
    setTimeout(() => location.reload(), 800);
  }catch(e){ toast('云端拉取失败：' + e.message); }
}

/* 自动双向同步：启动静默合并拉取一次 + 定时/回到页面时拉取（均为合并，不覆盖、不弹确认刷屏） */
function initCloudSync(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  cloudDownload(true); // 启动静默合并拉取（有更新才提示）
  // 轮询拉取：30 秒一次（页面可见时）。曾为 5 分钟——跨设备计时同步体验差（手机开始计时，电脑最长 5 分钟才显示）。
  // 请求量：每设备每 30 秒 1 次 GET，CF Functions 免费额度内；内容未变时不弹不刷（reallyChanged 保险），不会刷屏。
  setInterval(() => { if(!document.hidden) cloudDownload(true); }, 30 * 1000);
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
    await runPageScript(t.id, doc);                     // 重新执行目标页脚本（复用 ready + 事件绑定）
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
   脚本里的 ready(fn) 在已加载完成的文档上会立即同步运行 → 页面初始化自然发生。
   软导航只换 <main>，原 head 里的页面专属脚本（如 speaking.html 的 mock.js / progress.js）不会自动重跑，
   因此从目标页 HTML 里收集其余 js/*.js（排除全局 data.js / common.js 与主脚本）一并 eval，避免 tab 组件未初始化。 */
async function runPageScript(id, doc){
  const p = PAGES.find(p => p.id === id);
  if(!p) return;
  const evalScript = async (src) => {
    const res = await fetch(src, { cache: 'no-cache' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const code = await res.text();
    window.eval(code);   // 幂等重跑：页面 ready 内部已各自清旧心跳 / 重绑事件，多次进入不叠加
  };
  // 主脚本 js/{id}.js
  try{
    await evalScript('js/' + id + '.js');
  }catch(err){
    // P0-A：脚本执行异常（极偶发）→ 记日志后由 softNavigate 的兜底走整页跳转，绝不卡死
    console.error('[soft-nav] 页面脚本执行失败，将回退整页跳转：', id, err);
    throw err;
  }
  // 目标页 HTML 中声明的其他页面专属脚本
  if(doc){
    const extras = [];
    doc.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src');
      if(!src || !src.startsWith('js/')) return;
      if(src === 'js/data.js' || src === 'js/common.js' || src === 'js/' + id + '.js') return;
      extras.push(src);
    });
    for(const src of extras){
      try{ await evalScript(src); }
      catch(err){ console.warn('[soft-nav] 附加脚本执行失败，已跳过：', src, err); }
    }
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

/* 空闲时预取相邻页面 HTML（走浏览器缓存，下次软切换近乎瞬时）
   v5 导航已平铺无分组，直接按 PAGES 顺序取前后各 1 个邻居 */
function prefetchNeighbors(id){
  const idx = PAGES.findIndex(p => p.id === id);
  if(idx === -1) return;
  const neighbors = [];
  if(idx > 0) neighbors.push(PAGES[idx - 1].id);
  if(idx < PAGES.length - 1) neighbors.push(PAGES[idx + 1].id);
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
