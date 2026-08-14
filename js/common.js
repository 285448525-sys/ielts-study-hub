/* 共享 UI：导航注入、主题、Toast、通用工具 */
const PAGES = [
  { id:'index',     file:'index.html',     icon:'🏠', name:'仪表盘' },
  { id:'timer',     file:'timer.html',     icon:'⏱', name:'计时学习' },
  { id:'plans',     file:'plans.html',     icon:'🗓', name:'学习计划' },
  { id:'weekly',    file:'weekly.html',    icon:'🗓️', name:'每周建议' },
  { id:'notes',     file:'notes.html',     icon:'📝', name:'学习心得' },
  { id:'meds',      file:'meds.html',      icon:'💊', name:'服药记录' },
  { id:'words',     file:'words.html',     icon:'🗂', name:'我的词库' },
  { id:'practice',  file:'practice.html',  icon:'🎮', name:'单词练习' },
  { id:'corpus',    file:'corpus.html',    icon:'🎧', name:'听力语料库' },
  { id:'longsent',  file:'longsent.html',  icon:'🧩', name:'长难句拆解' },
  { id:'scores',    file:'scores.html',    icon:'📈', name:'模考记录' },
  { id:'errorbook', file:'errorbook.html', icon:'📒', name:'错题本' },
  { id:'speaking',  file:'speaking.html',  icon:'🗨', name:'口语素材库' },
  { id:'writing',   file:'writing.html',  icon:'✍', name:'写作模板库' },
  { id:'history',   file:'history.html',   icon:'🗄', name:'历史统计' },
  { id:'mock',      file:'mock.html',      icon:'🧪', name:'模考' },
    { id:'settings',  file:'settings.html',  icon:'⚙️', name:'设置' },
];

/* 母导航（分组） + 子导航（页面），悬停/点击展开 */
const NAV_GROUPS = [
  { name:'学习', icon:'🎯', pages:['index','timer','plans','weekly'] },
  { name:'积累', icon:'📝', pages:['notes','meds','words','practice','corpus','longsent'] },
  { name:'实战', icon:'💻', pages:['scores','errorbook','speaking','writing','mock'] },
  { name:'数据', icon:'📊', pages:['history','settings'] },
];

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed) document.body.classList.add('side-collapsed');
  const current = location.pathname.split('/').pop() || 'index.html';
  const curPage = PAGES.find(p => p.file === current);
  const currentId = curPage ? curPage.id : null;
  const pageById = id => PAGES.find(p => p.id === id);
  const fav = (DATA.settings.fav && DATA.settings.fav.length) ? DATA.settings.fav : ['timer','words','practice'];

  const todaySec = (DATA.sessions || []).filter(s => s.date === todayKey()).reduce((a, s) => a + (s.durationSec || 0), 0);
  const med = (DATA.meds || []).filter(m => m.date === todayKey()).sort((a, b) => b.ts - a.ts)[0];
  let medTxt = '未记录';
  if(med){ const remain = MED_DURATION_MS - (Date.now() - med.ts); medTxt = remain > 0 ? '药效中' : '已失效'; }

  let html = '';
  html += '<div class="side-head"><span class="nav-logo">📚</span><span>雅思备考 Hub</span><button class="side-collapse-in" id="sideCollapseIn" type="button" title="收起侧边栏" aria-label="收起侧边栏">⟨</button></div>';
  html += '<input class="side-search" id="sideSearch" placeholder="搜索功能…" aria-label="搜索功能" />';
  html += `<div class="side-today">今日已学 <b>${fmtHM(todaySec)}</b> · 服药：<b>${medTxt}</b></div>`;
  const collapsedMap = (DATA.settings && DATA.settings.groupCollapsed) || {};
  const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const favCol = collapsedMap['fav'] ? ' collapsed' : '';
  html += `<div class="side-fav${favCol}" id="sideFav" data-g="fav"><div class="side-group-title"><span class="side-g-label">⭐ 常用</span><span class="side-toggle-arrow" data-g="fav" role="button" tabindex="0" aria-label="展开/收起 常用" aria-expanded="${!favCol}">${chev}</span></div>`;
  html += '<div class="side-group-body"><div class="side-group-inner">';
  for(const fid of fav){ const p = pageById(fid); if(p) html += sideItem(p, current); }
  html += '</div></div></div>';
  html += '<div class="side-groups" id="sideGroups">';
  for(const g of NAV_GROUPS){
    const col = collapsedMap[g.name] ? ' collapsed' : '';
    html += `<div class="side-group${col}" data-g="${g.name}"><div class="side-group-title"><span class="side-g-label">${g.icon} ${g.name}</span><span class="side-toggle-arrow" data-g="${g.name}" role="button" tabindex="0" aria-label="展开/收起 ${g.name}" aria-expanded="${!col}">${chev}</span></div>`;
    html += '<div class="side-group-body"><div class="side-group-inner">';
    for(const pid of g.pages){ const p = pageById(pid); if(p) html += sideItem(p, current); }
    html += '</div></div></div>';
  }
  html += '</div>';
  nav.innerHTML = html;
  bindSidebar();
}

function sideItem(p, current){
  const active = (p.file === current) ? 'active' : '';
  const favArr = (DATA.settings.fav && DATA.settings.fav.length) ? DATA.settings.fav : ['timer','words','practice'];
  const isFav = favArr.includes(p.id);
  return `<a class="side-item ${active}" href="${p.file}" data-name="${p.name}" data-id="${p.id}">
    <span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span>
    <button class="side-star" data-id="${p.id}" title="钉到常用 / 取消" aria-label="收藏">${isFav ? '★' : '☆'}</button>
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
  nav.querySelectorAll('.side-star').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const id = btn.dataset.id;
      DATA.settings.fav = DATA.settings.fav || [];
      DATA.settings.fav = DATA.settings.fav.includes(id)
        ? DATA.settings.fav.filter(x => x !== id)
        : DATA.settings.fav.concat(id);
      hubSave();
      injectNav();
    });
  });
  nav.querySelectorAll('.side-item').forEach(a => {
    a.addEventListener('click', () => {
      if(window.matchMedia('(max-width:860px)').matches) document.body.classList.remove('nav-open');
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

function ensureMobileChrome(){
  if(document.getElementById('sideToggle')) return;
  const btn = document.createElement('button');
  btn.id = 'sideToggle'; btn.className = 'side-toggle'; btn.innerHTML = '☰'; btn.setAttribute('aria-label', '功能菜单');
  const bd = document.createElement('div');
  bd.id = 'sideBackdrop'; bd.className = 'side-backdrop';
  document.body.appendChild(bd); document.body.appendChild(btn);
  btn.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  bd.addEventListener('click', () => document.body.classList.remove('nav-open'));

  // 收起后左上角的展开按钮（桌面）
  const col = document.createElement('button');
  col.id = 'sideCollapse'; col.className = 'side-collapse';
  document.body.appendChild(col);
  col.addEventListener('click', toggleSidebar);
  syncCollapseIcon();
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
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
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

/* 共享：通过「后端中转服务」调用 OpenAI 兼容接口（口语GPT / 词库翻译 / 长难句拆解 都复用）
   前端【只】持有中转地址 DATA.settings.relayUrl，绝不在浏览器里保存任何真实 API Key。
   真实密钥只存在你服务器上的 relay-config.json 里；中转服务按 service 选择对应 base/key/model 并转发。
   service ∈ 'gpt' | 'trans' | 'longsent'
   请求体不携带任何密钥；返回沿用 OpenAI 兼容结构 { choices:[{message:{content}}] } */
async function callRelay(service, messages, temperature){
  if(!DATA.settings.relayUrl){ throw new Error('未配置 AI 接口地址（去「设置」填写）'); }
  const mode = DATA.settings.relayMode || 'direct';
  const base = DATA.settings.relayUrl.replace(/\/+$/, '');
  let url, headers, body;

  if(mode === 'direct'){
    // 直连模式：走标准 OpenAI /chat/completions 格式
    // service 语义上是前端三个功能（gpt/trans/longsent），直连时仅作模型选择的 hint
    const models = DATA.settings.relayModels || {};
    // 如果用户没单独为每个 service 配模型，给合理默认：
    // DeepSeek 默认 deepseek-chat，其它给一个通用默认（后端或平台会处理）
    const defaultModel = /deepseek/i.test(base) ? 'deepseek-chat'
      : /siliconflow|silicon/i.test(base) ? 'deepseek-ai/DeepSeek-V3'
      : /groq/i.test(base) ? 'llama-3.3-70b-versatile'
      : 'gpt-4o-mini';
    const model = (models[service] || defaultModel);
    url = base + '/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (DATA.settings.relayToken || '')
    };
    body = {
      model: model,
      messages: messages,
      temperature: (temperature == null) ? 0.7 : temperature,
      stream: false
    };
  } else {
    // 中转模式：走原来自定义的 body 格式
    url = base;
    headers = { 'Content-Type': 'application/json' };
    body = {
      service: service,
      messages: messages,
      temperature: (temperature == null) ? 0.7 : temperature
    };
    if(DATA.settings.relayToken) body.token = DATA.settings.relayToken;
  }

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

/* 口语 GPT 对话 */
async function callGPT(messages){ return callRelay('gpt', messages, 0.8); }
/* 词库专用翻译（与口语GPT隔离，由中转服务按 service=trans 选独立配置，不回退） */
async function callTrans(messages){ return callRelay('trans', messages, 0.3); }
/* 长难句拆解（中转服务按 service=longsent 选配置） */
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

/* ===== 云端同步（Cloudflare Pages Function + KV，6 位登录码） =====
   相同登录码 = 同一份云端数据（多设备共享）。非 Cloudflare 部署时 /api/sync
   会 404，所有调用都会优雅降级（不报错、不弹窗刷屏）。 */
let _cloudTimer = null;
function scheduleCloudUpload(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  if(_cloudTimer) clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(() => { cloudUpload(false); }, 1500); // 防抖，避免每次按键都上传
}
/* 生成 6 位登录码（100000~999999，纯数字） */
function genSyncCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}
function _syncUrl(code){
  return '/api/sync?code=' + encodeURIComponent(code);
}
async function cloudUpload(showToast){
  showToast = showToast !== false;
  const code = DATA.settings.syncCode;
  if(!code){ if(showToast) toast('请先在「设置」生成登录码'); return; }
  try{
    const res = await fetch(_syncUrl(code), {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ data: DATA, ts: Date.now() })
    });
    if(res.status === 404) throw new Error('云端未启用（需先部署 Functions）');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(showToast) toast('已上传到云端');
  }catch(e){ if(showToast) toast('云端上传失败：' + e.message); }
}
async function cloudDownload(){
  const code = DATA.settings.syncCode;
  if(!code){ toast('请先在「设置」生成登录码'); return; }
  if(!confirm('从云端下载会覆盖本机全部数据，确定继续？\n建议先点「导出 JSON」备份。')) return;
  try{
    const res = await fetch(_syncUrl(code));
    if(res.status === 404){ toast('云端没有该登录码的数据（或云端未启用）'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if(!j || !j.data) throw new Error('返回格式异常');
    DATA = Object.assign({ sessions:[], notes:[], meds:[], words:[], plans:[], corpus:[], scores:[], errorbook:[], energy:[], checkins:[], settings:{} }, j.data);
    hubSave(); location.reload();
  }catch(e){ toast('云端下载失败：' + e.message); }
}
async function cloudDelete(){
  const code = DATA.settings.syncCode;
  if(!code){ toast('请先在「设置」生成登录码'); return; }
  if(!confirm('确定删除云端该登录码的数据？此操作不可恢复。')) return;
  try{
    const res = await fetch(_syncUrl(code), { method:'DELETE' });
    if(res.status === 404){ toast('云端未启用（需先部署 Functions）'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    toast('已删除云端数据');
  }catch(e){ toast('云端删除失败：' + e.message); }
}

/* ===== 桌面通知（番茄钟阶段切换 / 智能提醒） ===== */
function notifySupported(){ try{ return ('Notification' in window); }catch(e){ return false; } }
function requestNotify(){
  try{
    if(!notifySupported()) return false;
    if(Notification.permission === 'granted') return true;
    if(Notification.permission === 'denied') return false;
    try{ Notification.requestPermission(); }catch(e){}
    return Notification.permission === 'granted';
  }catch(e){ return false; }
}
function notify(title, body){
  try{
    if(!notifySupported() || Notification.permission !== 'granted') return;
    new Notification(title, { body: body || '' });
  }catch(e){}
}

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
  if(_softNavBusy) return;
  _softNavBusy = true;
  try{
    if(window.matchMedia && window.matchMedia('(max-width:860px)').matches) document.body.classList.remove('nav-open');
    const res = await fetch(t.href, { cache: 'force-cache' });
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
  const res = await fetch('js/' + id + '.js', { cache: 'force-cache' });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const src = await res.text();
  window.eval(src);
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

ready(() => { hubLoad(); injectNav(); applyTheme(); restoreSideScroll(); initSoftNav(); });
