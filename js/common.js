/* 共享 UI：导航注入、主题、Toast、通用工具 */
const PAGES = [
  { id:'index',     file:'index.html',     icon:'🏠', name:'仪表盘',     desc:'今日概览' },
  { id:'timer',     file:'timer.html',     icon:'⏱', name:'计时学习',   desc:'选模块开计时' },
  { id:'plans',     file:'plans.html',     icon:'🗓', name:'学习计划',   desc:'每日清单 + AI 排周' },
  { id:'meds',      file:'meds.html',      icon:'💊', name:'服药记录',   desc:'专注达药效窗口' },
  { id:'words',     file:'words.html',     icon:'🗂', name:'我的词库',   desc:'生词导入与管理' },
  { id:'practice',  file:'practice.html',  icon:'🎮', name:'单词练习',   desc:'看词选义/听义选义' },
  { id:'corpus',    file:'corpus.html',    icon:'🎧', name:'听力语料库', desc:'场景词汇听写' },
  { id:'longsent',  file:'longsent.html',  icon:'🧩', name:'长难句拆解', desc:'括号法解码训练' },
  { id:'errorbook', file:'errorbook.html', icon:'📒', name:'错题本',     desc:'贴错题笔记自动理清错因' },
  { id:'speaking',  file:'speaking.html',  icon:'🗨', name:'口语素材库', desc:'题库 + AI 串题' },
  { id:'mock',      file:'mock.html',      icon:'🎤', name:'口语模考',   desc:'P1→P2→P3 全真模拟' },
  { id:'writing',   file:'writing.html',   icon:'✍', name:'写作模板库', desc:'模板 + AI 评分' },
  { id:'review',    file:'review.html',    icon:'📊', name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'settings',  file:'settings.html',  icon:'⚙️', name:'设置',       desc:'同步 / AI / 数据' },
];

/* 收藏页面（⭐）——侧边栏「常用」与仪表盘「快捷入口」共用同一份，永远同步。
   从未收藏过时给 3 个新手默认项，避免入口空着。 */
const DEFAULT_FAV = ['timer','words','practice'];
function favPageIds(){
  const f = DATA.settings && DATA.settings.fav;
  return (f && f.length) ? f : DEFAULT_FAV.slice();
}

/* 一级常驻（高频 4 项，始终可见）+ 更多▾（其余 9 项，默认折叠） */
const PRIMARY_NAV = ['index','timer','review','practice'];
const MORE_NAV    = ['plans','meds','words','corpus','longsent','errorbook','speaking','mock','writing','settings'];

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed) document.body.classList.add('side-collapsed');
  const current = location.pathname.split('/').pop() || 'index.html';
  const pageById = id => PAGES.find(p => p.id === id);
  const collapsedMap = (DATA.settings && DATA.settings.groupCollapsed) || {};
  const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  let html = '';
  html += '<div class="side-head"><span class="nav-logo">📚</span><span>雅思备考 Hub</span><button class="side-collapse-in" id="sideCollapseIn" type="button" title="收起侧边栏" aria-label="收起侧边栏">⟨</button></div>';
  html += '<input class="side-search" id="sideSearch" placeholder="搜索功能…" aria-label="搜索功能" />';
  // 一级常驻
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '</div>';
  // 更多▾（默认折叠：groupCollapsed['more'] 非 false 即折叠）
  const moreCol = (collapsedMap['more'] === false) ? '' : ' collapsed';
  html += '<div class="side-group' + moreCol + '" data-g="more"><div class="side-group-title"><span class="side-g-label">更多</span><span class="side-toggle-arrow" data-g="more" role="button" tabindex="0" aria-label="展开/收起 更多" aria-expanded="' + (moreCol === '' ? 'true' : 'false') + '">' + chev + '</span></div>';
  html += '<div class="side-group-body"><div class="side-group-inner">';
  for(const pid of MORE_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '</div></div></div>';
  nav.innerHTML = html;
  bindSidebar();
}

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
/* 从云端下载并覆盖本机。返回 true=已应用；false=云端无数据/取消/失败 */
async function cloudDownload(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先在「设置」绑定手机号'); return false; }
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){ toast('云端没有该手机号的数据'); return false; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    // Bug17：云端不是最新（不比本机新）时不要覆盖本机更新的数据
    const cloudTs = (data.ts != null && !isNaN(Number(data.ts))) ? Number(data.ts) : 0;
    const localTs = DATA._lastSaved || 0;
    if(cloudTs && localTs && cloudTs <= localTs){
      toast('云端数据不是最新（本机有更新的修改），已跳过下载');
      return false;
    }
    if(!confirm('从云端下载会覆盖本机全部数据，确定继续？\n建议先点「导出 JSON」备份。')) return false;
    DATA = Object.assign({ sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[], errorbook:[], energy:[], checkins:[], settings:{} }, data.data);
    hubSave(); location.reload();
    return true;
  }catch(e){ toast('云端下载失败：' + e.message); return false; }
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
   - 200 = 云端已有数据 → 直接登录（下载并覆盖本机，恢复之前的数据）；
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
      // 登录：云端已有数据 → 先确认再覆盖本机，与 cloudDownload 一致，
      // 避免本机有未同步的新增（刚加的词/错题）被云端旧数据静默抹掉
      if(!confirm('云端已有该手机号的数据，登录将用云端数据覆盖本机全部数据，确定继续？\n建议先点「导出 JSON」备份本机数据。')) return;
      const [res2, data] = await syncApi('GET');
      if(data && data.data){
        DATA = Object.assign({ sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[], errorbook:[], energy:[], checkins:[], settings:{} }, data.data);
        enableAutoSyncAfterLogin(phone);
        hubSave(); location.reload();
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

/* P0-A：清理上一页可能残留的全局心跳（计时 __timerTick / 服药 __medsTick）。
   各页面 ready 自身已清旧心跳、updateTimer/renderMeds 也会在 DOM 消失时自停，
   这里再兜底一道，确保软导航重进页面不会叠加“多个计时器同时跑 / 数字乱跳”。 */
function hubClearOrphanPageTimers(){
  if(window.__timerTick){ clearInterval(window.__timerTick); window.__timerTick = null; }
  if(window.__medsTick){ clearInterval(window.__medsTick); window.__medsTick = null; }
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
});

function registerSW(){ try{ if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{}); }catch(e){} }
