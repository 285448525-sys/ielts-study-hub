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
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  wrongbook:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M9 7l1.5 3 3 .5-2 2 .5 3-3-1.5-3 1.5.5-3-2-2 3-.5z"/></svg>',
  /* vip：钻石图标 stroke 写死金色（转化入口要跟学习模块区分开；不动 CSS 免全站 bump） */
  vip:'<svg viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9.5 9L12 3l2.5 6M12 21L9.5 9M12 21l2.5-12"/></svg>'
};

/* ⭐ 9/30：学习主页从 index.html 改名为 home.html（根 / 交给落地页 landing）。
   软导航 / 侧栏高亮 / 部署探针 / 兜底跳转全部以这里为准，改文件名必须先改本表。 */
const PAGES = [
  { id:'index',     file:'home.html',       icon:ICON.home,      name:'首页',       desc:'今日概览' },
  { id:'timer',     file:'timer.html',     icon:ICON.timer,     name:'计时',   desc:'选模块开计时' },
  { id:'plans',     file:'plans.html',     icon:ICON.plans,     name:'计划',   desc:'每日清单 + AI 排周' },
  { id:'practice',  file:'practice.html',  icon:ICON.practice,  name:'单词',       desc:'学习与管理你的单词' },
  // 三合一入口：长难句 + 错题 + 听写（原听力 corpus + 词句 errorbook 合并）
  { id:'corpus',    file:'corpus.html',    icon:ICON.corpus,    name:'句子', desc:'长难句 · 错题 · 听写' },
  { id:'speaking',  file:'speaking.html',  icon:ICON.speaking,  name:'口语', desc:'题库 + AI 串题' },
  // Repair Drill：中文+错句 → 自己 repair 正确版，AI 只当裁判（design/06）
  // ⚠️ id 必须与文件名一致（软导航按 js/{id}.js 找主脚本），不能用缩写 pdrill
  /* 句型闯关已并入口语页「练习」tab（2026-09-09 之之拍板），主导航不再单列入口；
     pattern-drill.html 保留为独立直达页 */
  { id:'writing',   file:'writing.html',   icon:ICON.writing,   name:'写作',       desc:'模板 + AI 评分' },
  { id:'wrongbook', file:'wrongbook.html', icon:ICON.wrongbook, name:'错句本',     desc:'写作/语料默写错句汇总' },
  { id:'review',    file:'review.html',    icon:ICON.review,    name:'回顾',       desc:'模考成绩 + 学习轨迹' },
  { id:'vip',       file:'vip.html',       icon:ICON.vip,       name:'会员',       desc:'AI 无限用 + 专属权益' },  // 10/1 付费方案：非学习功能，不进 PRIMARY_NAV
  { id:'settings',  file:'settings.html',  icon:ICON.settings,  name:'设置',       desc:'同步 / AI / 数据' },
  { id:'meds',      file:'meds.html',      icon:ICON.meds,      name:'服药',   desc:'专注达药效窗口' },  // ← 移到最后
  /* 10/4 18:42 她拍板「我就要一整个界面就行了」：三个组页（真实页面，不是弹出的浮层）。
     id 必须与文件名一致（软导航按 js/{id}.js 找主脚本）→ 组页共用 js/hubgroup.js，
     所以在 PAGES 里显式声明 hubScript:'hubgroup'，由软导航那段特殊处理。 */
  { id:'plans-hub', file:'plans-hub.html', icon:ICON.plans,     name:'计划组', desc:'计划 + 计时' },
  { id:'study',     file:'study.html',     icon:ICON.practice,  name:'学习组', desc:'单词 · 口语 · 写作 · 句子' },
  { id:'me',        file:'me.html',        icon:ICON.settings,  name:'我的组', desc:'回顾 · 会员 · 设置' }
];

/* 收藏页面（⭐）——侧边栏「常用」与首页「快捷入口」共用同一份，永远同步。
   从未收藏过时给 3 个新手默认项，避免入口空着。 */
const DEFAULT_FAV = ['timer','practice','speaking'];
/* 服药模块开关（9/15 之之：设置页「启用『服药』模块」→ 选是才启用服药模块）。
   默认开启 = 历史用户已有入口，不因新增开关而凭空消失；关闭后入口从侧栏/更多/搜索/收藏全部隐藏，
   已记录的服药数据一律保留，随时可再开启。判定只认显式 false，undefined/true 都算开。 */
/* 服药模块开关：判定只认显式 true，undefined/false 都算关（9/21 翻转：可选模块默认不对新人露出）。
   老用户（已有服药记录）由 data.js migrateMedsDefault 一次性显式开启。已记录数据一律保留，随时可再开启。 */
function medsModuleOn(){ return !!(DATA.settings && DATA.settings.adhd === true); }
function favPageIds(){
  const f = DATA.settings && DATA.settings.fav;
  const list = (f && f.length) ? f : DEFAULT_FAV.slice();
  return medsModuleOn() ? list : list.filter(id => id !== 'meds');
}

/* v5：简化后全部平铺，不再分折叠组（首页→回顾 一级；设置/服药 在分隔线下方） */
const PRIMARY_NAV = ['index','timer','plans','practice','corpus','speaking','writing'];
/* 10/1 付费方案：vip 放分隔线下方首位（销售入口显眼但不挤占学习导航；她看过效果可再调位置） */
const MORE_NAV    = ['vip','review','meds','settings'];
const TAB_NAV     = ['index','timer','practice','speaking'];   // 旧 tabbar 主项（组件已删，仅用于计算「更多」弹层要收纳哪些页面）
// 底部 Tab 标签覆盖：practice 在站内含「单词」，但原型/验收确认为「背词」，单独对齐（不改 PAGES 以免影响桌面侧栏）
const TAB_LABEL   = { practice:'背词' };

function injectNav(){
  const nav = document.getElementById('mainNav');
  if(!nav) return;
  if(DATA.settings && DATA.settings.collapsed) document.body.classList.add('side-collapsed');
  const current = _hubCurrentFile || normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  _hubCurrentFile = current;   // 记住真实当前页，供软导航期间被 injectNav 复用（pathname 此时滞后）
  const pageById = id => PAGES.find(p => p.id === id);

  let html = '';
  /* 10/3 头像选择：侧栏品牌位右侧加一枚用户头像（点它跳设置页选头像）。
     ⚠️ 这里**内联解析**而不是依赖 window.avUserSrc —— 因为 common.js 早于 av-picker.js 执行
       （av-picker 只在 settings/speaking 引，侧栏是全站 14 页都要显示的）。
       读 DATA.settings.avatar 存的文件名，非法/未设回退默认；**只存文件名不存图片**。 */
  const _AV_SET = new Set(['user-f1','user-f2','user-f3','user-f4','user-m1','user-m2','user-m3','user-m4']);
  const _avRaw = (typeof DATA !== 'undefined' && DATA.settings) ? DATA.settings.avatar : '';
  const _avMe2 = 'img/avatars/' + (_AV_SET.has(_avRaw) ? _avRaw : 'user-f1') + '.svg';
  html += '<div class="side-head">'
    + '<span class="side-brand-mark" aria-hidden="true"><svg viewBox="0 0 512 512" width="40" height="40" fill="none" style="display:block" aria-hidden="true"><g fill="#ffffff" stroke="#ffffff" stroke-width="38" stroke-linejoin="round" stroke-linecap="round"><path d="M256 136 L344 194 L256 252 L168 194 Z"/><path d="M160 304 L212 304 L256 362 L300 304 L352 304 L352 354 Q352 394 256 394 Q160 394 160 354 Z"/></g></svg></span>'
    + '<div class="side-brand"><span class="bn">IELTS</span><span class="bs">雅思备考站</span></div>'
    + (_avMe2 ? '<a class="side-me" href="settings.html" title="换头像" aria-label="换头像"><img src="' + _avMe2 + '" alt=""></a>' : '')
    + '<button id="sideCollapseIn" class="side-collapse-in" type="button" aria-label="收起侧边栏" title="收起侧边栏">⟨</button>'
    + '</div>';
  // 方案1：全局计时徽标容器（任何页面常驻；计时进行中显示呼吸徽标 + 一键结束，解决 P1/P3）
  html += '<div class="side-timer-wrap" id="sideTimer"></div>';
  // AI 智能搜索：输入中文搜站内功能跳转；输入英文单词/词组 AI 查词并自动入词库
  html += '<div class="side-search-wrap">'
    + '<div class="ui-search">'
    + '<svg class="ui-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    + '<input class="ui-search-input" type="search" id="sideSearch" placeholder="搜功能 / 查单词" aria-label="搜索" autocomplete="off" title="输入中文搜功能；输入英文单词 AI 查词" /></div>'
    + '<div class="ss-panel" id="ssPanel" hidden><div id="ssList"></div></div>'
    + '</div>';

  // v5：全部平铺无折叠 —— 首页→回顾 一级；设置/服药 在分隔线下方
  html += '<div class="side-primary">';
  for(const pid of PRIMARY_NAV){ const p = pageById(pid); if(p) html += sideItem(p, current); }
  html += '<div class="side-sep" role="separator"></div>';
  for(const pid of MORE_NAV){
    if(pid === 'meds' && !medsModuleOn()) continue;    // 服药模块未开启 → 侧栏不出现
    const p = pageById(pid); if(p) html += sideItem(p, current);
  }
  /* 10/5 她 14:36 要求：侧栏/抽屉不再单独挂「意见反馈」入口，**收进设置页最后一个分组**。
     理由 = 设置页本来就是「个人配置 + 账号 + 反馈」的地方，侧栏条目越加越长反而不是核心功能。
     ⚠️ 移动端「更多」抽屉（MORE_NAV 那条）**保留** —— 抽屉在窄屏是主导航，
        反馈从抽屉里挪走会让手机用户找不到入口。桌面侧栏（下面这条）删掉。 */
  html += '</div>';
  nav.innerHTML = html;
  bindSidebar();
  bindSideSearch();   // AI 智能搜索（功能跳转 + AI 查词）
  renderSideTimer();   // 方案1：注入/刷新全局计时徽标（有活动会话才显示）
}

/* ===== 侧边栏 AI 智能搜索：中文搜功能跳转 + 英文 AI 查词自动入词库 ===== */
const SIDE_SEARCH_PAGES = [
  { id:'index',     kw:'首页 主页 概览 今日 overview' },
  { id:'timer',     kw:'计时 计时器 番茄钟 专注 时钟 timer' },
  { id:'plans',     kw:'计划 任务 清单 待办 每日 周计划 排程 plan' },
  { id:'practice',  kw:'单词 背单词 背词 词库 词汇 练习 学习 word' },
  { id:'corpus',    kw:'句子 长难句 错题 听写 语料 翻译 解码 sentence' },
  { id:'speaking',  kw:'口语 题库 串题 跟读 影子 part1 part2 part3 speaking' },
  { id:'writing',   kw:'写作 作文 模板 真题 评分 大作文 小作文 task1 task2 writing' },
  { id:'wrongbook', kw:'错句本 错句 默写 wrong' },
  { id:'review',    kw:'回顾 复习 成绩 模考 记录 轨迹 历史 看板 review' },
  { id:'settings',  kw:'设置 配置 同步 api key 账号 数据 导出 导入 settings' },
  { id:'meds',      kw:'服药 用药 药 专注达 健康 药效 meds' }
];
let _ssAiToken = 0;   // 查词请求序号：过期响应直接丢弃
let _ssAiBusy = false;
let _ssAiQuery = '';  // design/83：在飞请求的查询词（归一后），同词再回车防重复、异词顶替

function ssNormQuery(q){ return String(q || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function ssHasCn(q){ return /[\u4e00-\u9fff]/.test(q); }

function ssMatchPages(q){
  if(!q) return [];
  const hits = [];
  for(const p of SIDE_SEARCH_PAGES){
    if(p.id === 'meds' && !medsModuleOn()) continue;    // 服药模块未开启 → 搜索不命中
    const page = PAGES.find(x => x.id === p.id);
    if(!page) continue;
    const hay = (page.name + ' ' + p.kw + ' ' + (page.desc || '')).toLowerCase();
    if(hay.indexOf(q) !== -1) hits.push(page);
    if(hits.length >= 6) break;
  }
  return hits;
}

/* 词性归一化（words.js normPos 的内置精简版，全站可用） */
function ssNormPos(s){
  s = String(s || '').trim().toLowerCase();
  if(!s) return '';
  const dict = { n:'n.', noun:'n.', 名词:'n.', v:'v.', verb:'v.', 动词:'v.', adj:'adj.', adjective:'adj.', 形容词:'adj.',
    adv:'adv.', adverb:'adv.', 副词:'adv.', prep:'prep.', 介词:'prep.', conj:'conj.', 连词:'conj.',
    pron:'pron.', 代词:'pron.', num:'num.', 数词:'num.', int:'int.', 感叹词:'int.', art:'art.', 冠词:'art.' };
  const parts = s.split(/[;/,、\s]+/).map(x => x.trim()).filter(Boolean);
  const out = parts.map(x => dict[x.replace(/\.$/, '')] || dict[x] || (/^(n|v|adj|adv|prep|conj|pron|num|int|art)\.$/.test(x) ? x : '')).filter(Boolean);
  return Array.from(new Set(out)).join(';');
}

/* ===== 单词墓碑（9/17）=====
   背景：practice.js 的「已掌握」与 words.js 的 deleteWord 会往 DATA.deletedIds 写 'en:'+小写
   作为墓碑，mergeData 的 out.words 每轮合并都按墓碑过滤 → 已掌握/已删的词不会从云端复活。
   此前只有 words.js 的三条导入路径查墓碑，另外四条「显式加词」入口（corpus/errorbook 的
   「加入词库」、侧边搜索 AI 查词、通用 ssNewWord 调用方）完全没查 → 后果是「加进去了、
   toast 也说了成功，下次合并（最长 30s）就被墓碑静默抹掉」，看起来就是同步丢了词。
   口径（两条并行、不得混用）：
   - 批量导入（AI 导入 / Excel / 粘贴）→ 命中墓碑就跳过，计数进「跳过已掌握 N 个」；
   - 显式单个加词（点按钮收这一个词）→ 视为明确的「我要把它加回来」，撤销墓碑再加。 */
function wordTombKey(en){ return 'en:' + String(en || '').trim().toLowerCase(); }
function isWordTombstoned(en){
  return (DATA.deletedIds || []).indexOf(wordTombKey(en)) >= 0;
}
function addWordTombstone(en){
  const k = wordTombKey(en);
  DATA.deletedIds = Array.isArray(DATA.deletedIds) ? DATA.deletedIds : [];
  if(!DATA.deletedIds.includes(k)) DATA.deletedIds.push(k);
  // 反向墓碑必须一并撤销：否则这个词一旦「加回来」过，就再也删不掉了
  if(Array.isArray(DATA.revivedIds)){
    const i = DATA.revivedIds.indexOf(k);
    if(i >= 0) DATA.revivedIds.splice(i, 1);
  }
}
function clearWordTombstone(en){
  const k = wordTombKey(en);
  let hit = false;
  if(Array.isArray(DATA.deletedIds)){
    const i = DATA.deletedIds.indexOf(k);
    if(i >= 0){ DATA.deletedIds.splice(i, 1); hit = true; }
  }
  // 光删本机 deletedIds 不够：另一端那份会在下一次合并里被 union 回来、把词再次抹掉
  // （探针 ⑨b 复现：A 撤了墓碑，B 一推又回来了）。
  // revivedIds 与 deletedIds 同口径随同步 union 传播，合并时按 deleted \ revived 生效。
  DATA.revivedIds = Array.isArray(DATA.revivedIds) ? DATA.revivedIds : [];
  if(!DATA.revivedIds.includes(k)) DATA.revivedIds.push(k);
  return hit;
}

/* 新建词条（newWordV12 的内置版，结构与词库 v1.2 完全一致；练习页在线时优先复用） */
function ssNewWord(en, cn){
  if(typeof newWordV12 === 'function'){
    try{ const w = newWordV12(en, cn); if(w) return w; }catch(_){}
  }
  return { id: uid(), en: en, cn: cn || '', ts: Date.now(), level: 0, nextReview: todayKey(),
    errTotal: 0, errStreak: 0, hardWord: false, okStreak: 0, lastReview: null, keyWord: false,
    cleared: false, shortCount: 0, lastShortTouch: null, cleanRounds: 0, pos: '', ipa: '' };
}

function bindSideSearch(){
  const input = document.getElementById('sideSearch');
  const panel = document.getElementById('ssPanel');
  const list = document.getElementById('ssList');
  if(!input || !panel || !list) return;

  function show(){ panel.hidden = false; }
  function hide(){ panel.hidden = true; }

  function renderMatch(){
    const q = ssNormQuery(input.value);
    /* 10/1 晚（她拍板）：空输入（刚点搜索框还没打字）不弹白色提示框——面板只在有实际内容时出现 */
    if(!q){ list.innerHTML = ''; hide(); return; }
    const hits = ssMatchPages(q);
    const isEn = q && !ssHasCn(q);
    let html = '';
    if(isEn){
      html += '<button class="ss-item ss-ai" type="button" data-ai="1" title="AI 查询释义并加入词库">'
        + '<span class="ss-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>'
        + '<span>AI 查词「' + escapeHtml(q) + '」</span><span class="ss-hint">回车</span></button>';
    }
    for(const p of hits){
      html += '<button class="ss-item" type="button" data-file="' + p.file + '">'
        + '<span class="ss-ico">' + p.icon + '</span><span class="ss-name">' + escapeHtml(p.name) + '</span>'
        + '<span class="ss-desc">' + escapeHtml(p.desc || '') + '</span></button>';
    }
    if(!html && !q) html = '<div class="ss-empty">输入中文搜功能跳转；输入英文单词 AI 查词（自动加入词库）</div>';
    else if(!html) html = '<div class="ss-empty">没有匹配的功能' + (isEn ? '，可回车用 AI 查这个词' : '') + '</div>';
    // design/83：结果卡归属词——输入新词（未回车）时旧词的结果卡丢弃；空 query 不保留任何卡
    const card = list.querySelector('.ss-card');
    const keep = (card && q && card.dataset.word === q) ? card.outerHTML : '';
    list.innerHTML = html + keep;
    show();
  }

  function ssCardHtml(inner, word){
    return '<div class="ss-card"' + (word ? ' data-word="' + escapeHtml(word) + '"' : '') + '>' + inner + '</div>';
  }

  async function aiLookup(word){
    const wq = ssNormQuery(word);
    // design/83：查词进行中再回车——同词忽略防重复；异词不拦截，新请求顶替旧请求
    // （旧响应返回时 `token !== _ssAiToken` 判定已会丢弃，finally 也按 token 复位 _ssAiBusy）
    if(_ssAiBusy && wq === _ssAiQuery){ return; }
    _ssAiQuery = wq;
    _ssAiBusy = true;
    const token = ++_ssAiToken;
    let card = list.querySelector('.ss-card');
    const loading = ssCardHtml('<div class="sc-cn muted">AI 正在查询「' + escapeHtml(word) + '」…</div>', wq);
    if(card) card.outerHTML = loading; else list.insertAdjacentHTML('beforeend', loading);
    show();
    try{
      const messages = [
        { role:'system', content:
'你是雅思词库助手。查询用户给的英文单词或词组，只输出严格 JSON（不要 markdown 围栏、不要解释）：\n'
+ '{"en":"原词小写","ipa":"英式音标，如 /ɡɪv ʌp/，查不到留空字符串","pos":"词性缩写，多个用;分隔（如 n. 或 n.;v.），词组留空字符串","cn":"简明中文释义；多词性时按词性顺序用；分隔对应"}' },
        { role:'user', content: word }
      ];
      const content = await callRelay('words', messages, 0.3);
      if(token !== _ssAiToken) return;
      const r = aiJson(content);
      if(!r || !r.en || !r.cn) throw new Error('AI 返回格式异常，请稍后重试');
      const en = String(r.en).trim().toLowerCase();
      const cn = String(r.cn).trim();
      const pos = ssNormPos(r.pos);
      const ipa = String(r.ipa || '').trim();
      if(!en) throw new Error('AI 返回的单词为空');
      let existed = false;
      let dup = null;
      let addedId = null;   // design/83：本次新加入词的 id（撤销按钮用；复活词同样走新增分支）
      (DATA.words || []).forEach(w => { if(String(w.en || '').trim().toLowerCase() === en) dup = w; });
      // 已掌握/已删除（墓碑）：显式对它 AI 查词 = 明确的「加回来」→ 撤销墓碑，不再被下次合并抹掉
      const _revived = !dup && isWordTombstoned(en) && clearWordTombstone(en);
      if(dup){
        existed = true;
        if(!dup.pos && pos) dup.pos = pos;
        if(!dup.ipa && ipa) dup.ipa = ipa;
        if(!dup.cn && cn) dup.cn = cn;
      } else {
        const w = ssNewWord(en, cn);
        w.pos = pos; w.ipa = ipa;
        DATA.words.push(w);
        addedId = w.id;
      }
      hubSave();
      const tag = existed ? '✓ 已在词库（释义已补全）'
        : (_revived ? '✓ 已重新加入词库（已从「已掌握」移回）' : '✓ 已自动加入词库（去「单词」页可背诵）');
      // design/83：喇叭朗读（复用全站 speakQuestion，en-GB）+ 操作行（去背词 / 撤销加入）
      const speakBtn = '<button class="sc-speak" type="button" data-speak="' + escapeHtml(en) + '" aria-label="朗读">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg></button>';
      const inner = '<div class="sc-head"><span class="sc-en">' + escapeHtml(en) + '</span>' + speakBtn
        + (ipa ? '<span class="sc-ipa">' + escapeHtml(ipa) + '</span>' : '') + '</div>'
        + '<div class="sc-cn">' + (pos ? '<b>' + escapeHtml(pos) + '</b> ' : '') + escapeHtml(cn) + '</div>'
        + '<div class="sc-tag">' + tag + '</div>'
        + '<div class="sc-actions">'
        + '<button class="ss-item sc-link" type="button" data-file="practice.html">去背词页背诵 →</button>'
        + (!existed ? '<button class="ss-item sc-link" type="button" data-undo-en="' + escapeHtml(en) + '" data-undo-id="' + escapeHtml(String(addedId || '')) + '">撤销（不加入词库）</button>' : '')
        + '</div>';
      card = list.querySelector('.ss-card');
      if(card) card.outerHTML = ssCardHtml(inner, wq);
      toast(existed ? '「' + en + '」已在词库' : (_revived ? '「' + en + '」已重新加入词库' : '「' + en + '」已加入词库'));
    }catch(e){
      if(token !== _ssAiToken) return;
      const msg = (e && e.message) ? e.message : '查询失败';
      let inner = '<div class="sc-err">「' + escapeHtml(word) + '」查询失败：' + escapeHtml(msg) + '</div>';
      card = list.querySelector('.ss-card');
      if(card) card.outerHTML = ssCardHtml(inner, wq);
    }finally{
      if(token === _ssAiToken) _ssAiBusy = false;
    }
  }

  input.addEventListener('focus', renderMatch);
  input.addEventListener('input', renderMatch);
  /* design/83：type=search 原生 × 只触发 search 不触发 input，结果清空后面板要跟着回空态。
     注意 Chrome 里 Escape 也会清值并触发 search——Escape 分支刚把面板关掉 + blur，
     此刻 input 已失焦，必须跳过重渲染，否则面板被 search 事件重新弹开。 */
  input.addEventListener('search', () => {
    if(document.activeElement !== input) return;
    renderMatch();
  });
  // design/83：面板内可键盘选择的项（排除结果卡里的动作按钮，只含 ss-ai 查词条 + 功能跳转项）
  function ssNavItems(){
    return Array.prototype.filter.call(list.querySelectorAll('.ss-item'), el => !el.closest('.ss-card'));
  }
  function ssClearActive(){
    list.querySelectorAll('.ss-active').forEach(el => el.classList.remove('ss-active'));
  }
  function gotoFile(f){ hide(); input.value = ''; location.href = f; }

  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;   // design/83：中文输入法组词中不拦截方向键/回车
    const nav = ssNavItems();
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if(!nav.length) return;
      e.preventDefault();
      let idx = nav.findIndex(el => el.classList.contains('ss-active'));
      if(e.key === 'ArrowDown') idx = (idx + 1) % nav.length;                       // 循环下移，不越界
      else idx = (idx <= 0 ? nav.length - 1 : idx - 1);                             // 循环上移
      ssClearActive();
      nav[idx].classList.add('ss-active');
      nav[idx].scrollIntoView({ block:'nearest' });
      return;
    }
    if(e.key === 'Enter'){
      const q = ssNormQuery(input.value);
      if(!q) return;
      const active = list.querySelector('.ss-item.ss-active');
      if(active){
        if(active.dataset.file){ gotoFile(active.dataset.file); return; }
        if(active.dataset.ai){ if(!ssHasCn(q)) aiLookup(q); return; }
      }
      if(ssHasCn(q)){
        const hits = ssMatchPages(q);
        if(hits[0]){ gotoFile(hits[0].file); }
        return;
      }
      aiLookup(q);   // 英文：AI 查词
    } else if(e.key === 'Escape'){
      ssClearActive();
      hide(); input.blur();
    }
  });
  panel.addEventListener('mousedown', (e) => {
    const fileBtn = e.target.closest('[data-file]');
    if(fileBtn){
      e.preventDefault();
      gotoFile(fileBtn.dataset.file);
      return;
    }
    const aiBtn = e.target.closest('[data-ai]');
    if(aiBtn){
      e.preventDefault();
      const q = ssNormQuery(input.value);
      if(q && !ssHasCn(q)) aiLookup(q);
    }
  });
  /* design/83：结果卡动作（喇叭朗读 / 撤销加入）——click 委托 + stopPropagation */
  panel.addEventListener('click', (e) => {
    const sp = e.target.closest('.sc-speak');
    if(sp){
      e.stopPropagation();
      speakQuestion.speak(sp.dataset.speak || '', sp);
      return;
    }
    const undoBtn = e.target.closest('[data-undo-en]');
    if(undoBtn){
      e.stopPropagation();
      const en = undoBtn.dataset.undoEn || '';
      const wid = undoBtn.dataset.undoId || '';
      if(wid){
        const idx = (DATA.words || []).findIndex(w => w.id === wid);
        if(idx >= 0) DATA.words.splice(idx, 1);   // 移除本次新增的词条（按 push 时记录的 id）
      }
      addWordTombstone(en);   // 打墓碑（内部同步清 revivedIds），云同步不会把词 union 回来
      hubSave();
      const c = undoBtn.closest('.ss-card');
      if(c) c.outerHTML = '<div class="ss-card"><div class="sc-cn">已撤销，「' + escapeHtml(en) + '」不会进入背词列表</div></div>';
      toast('已撤销，「' + en + '」不会进入背词列表');
    }
  });
  document.addEventListener('click', (e) => {
    if(!panel.hidden && !e.target.closest('.side-search-wrap')) hide();
  });
}

/* ===== 全站玻璃底栏 dock（移动端 ≤860px 显示，作为移动端主底部导航；桌面用侧栏，不显示）===== */
/* ==========================================================================
   10/4 17:55 移动端底部 dock 分组重构（她 17:12 提 + 17:54 拍板「甲版」）

   她的原话（17:12）：
     「5 个栏…第一个是首页是确定的，然后把剩下的这些栏就是几个归到一个，然后放在一个页面，
       几个归到一个放一个页面…第二个也可以是计划页，然后第三个页面可以是学习页，
       学习页面点下去之后可以选择背单词、背口语、写作、句子等等，
       哦对，然后计划和计时也可以放在一个板块，就是以此类推」
   拍板（17:54）：**甲版 4 格**；「我的」组**没有错句本**（她不常用），
     服药**平常不开着**所以默认不显示 → 我的组只有 **回顾 / 会员 / 设置** 3 项。

   ── 为什么改（现状的病）──────────────────────────────────────────────
   旧 dock = 4 格 +「更多」，13 个页面里 **8 个全藏在「更多」弹层**（vip/review/corpus/
   writing/timer/settings/meds/wrongbook）—— 句子、写作、计时这些**每天都要用**的页面被埋到
   第二层，找东西要「点更多 → 再找」。她 12:10 报过一次「入口找不到」，这次是彻底重做。

   ── 新的结构（GROUPED_DOCK，单一数据源）──────────────────────────────
     首页   → 直达 home.html（她 17:12 明确「第一个是首页是确定的」）
     计划   → 组：plans / timer（她原话「计划和计时也可以放在一个板块」）
     学习   → 组：practice / speaking / writing / corpus（17:54 拍板：不含计时）
     我的   → 组：review / vip / settings + meds（仅开了服药才出现）

   ── 为什么不进组、当场跳页 ───────────────────────────────────────────
   首页组只有 1 项 → 弹列表是多余的一次点击，直接跳。她 17:54 问「计划要不要也弹列表」，
   选了「弹」→ 计划组虽然只有 2 项也照样弹，保持 4 格交互一致（点哪格都是同一种行为）。

   ── 错句本（wrongbook）去哪了 ───────────────────────────────────────
   她 17:54 明说「我记得我的里面没有这个错句本」—— 但文件真实存在（writing.html 有入口、
   sidebar 也有）。**本轮按她说的从「我的」组移除**，但**不删页面、不删侧栏入口**
   （她自己以后想用还能从侧栏/写作页进）。⚠️ 若她之后发现还需要，加回「我的」组即可。
   ========================================================================== */

/* 分组定义：唯一的结构来源。g.page 存在 = 直达；无 page = 弹组面板。 */
const GROUPED_DOCK = [
  { id:'index',  label:'首页', icon:'<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', page:'index' },
  { id:'plans',  label:'计划', icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/>',
    page:'plans-hub', members:['plans','timer'] },
  { id:'study',  label:'学习', icon:'<path d="M4 19.5V6a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-1.5z"/><path d="M4 19.5A2 2 0 0 1 6 18h13"/>',
    page:'study',     members:['practice','speaking','writing','corpus'] },
  { id:'me',     label:'我的', icon:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    page:'me',        members:['review','vip','settings','meds'] }
];

/* 当前页属于哪个 dock 组 —— injectGlobalDock（首屏高亮）与 updateActiveNav（软导航高亮）
   共同用这一个判定，避免两处口径漂移（漂移过一次：探针从学习组点进 writing.html 后 dock 全灰）。 */
function dockGroupOfPage(file){
  if(!file) return null;
  const byId = id => PAGES.find(x => x.id === id);
  for(const g of GROUPED_DOCK){
    if(g.page && (byId(g.page) || {}).file === file) return g.id;
    if(g.members && g.members.some(m => (byId(m) || {}).file === file)) return g.id;
  }
  return null;
}

function injectGlobalDock(){
  if(document.getElementById('hubDock')) return;
  const current = _hubCurrentFile || normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  const pageById = id => PAGES.find(x => x.id === id);
  const curGroup = dockGroupOfPage(current);

  const svgOf = raw => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + raw + '</svg>';
  let inner = '';
  for(const g of GROUPED_DOCK){
    const on = (g.id === curGroup) ? ' active' : '';
    /* 10/4 18:42 她拍板「我要一整个界面就行了」-> 四格**全部是 <a> 直达整页**：
       首页 -> home.html；计划/学习/我的 -> 各自的组页（plans-hub / study / me）。
       组内模块再由组页里的卡片跳原页面（plans.html / timer.html / …），原页面零改动。 */
    const file = (pageById(g.page) || {}).file || (g.page + '.html');
    inner += '<a class="ui-menu-item dock-group-item' + on + '" href="' + file + '"'
      + ' data-dock-group="' + g.id + '" data-id="' + g.page + '"'
      + ' title="' + g.label + '">'
      + svgOf(g.icon) + '<span>' + g.label + '</span></a>';
  }
  const dock = document.createElement('nav');
  dock.id = 'hubDock';
  dock.className = 'ui-menu ui-menu-grouped';
  dock.setAttribute('aria-label', '快捷导航');
  dock.innerHTML = inner;
  document.body.appendChild(dock);
  document.body.classList.add('has-dock');

  /* 10/2 dock 重设计（她拍板）：实测 dock 真实高度写进 :root 的 --dock-h。
     全站「内容区净空 / 浮钮锚点 / toast / 额度轻条」一律读这个变量，不写死 88px。
     为什么必须实测：safe-area（iPhone 34 / iPad 20）+ 系统字号放大都会让高度浮动，
     写死数字在真机上必然对不上——本批要消灭的正是「dock 上方 20px 幽灵白带」。
     h > 0 守卫是必须的：沉浸态（模考 / 背词全屏）dock 是 display:none，rect 高 0，
     照写会把 --dock-h 打成 0px 导致净空塌掉。 */
  const syncDockH = () => {
    const h = Math.round(dock.getBoundingClientRect().height);
    if(h > 0) document.documentElement.style.setProperty('--dock-h', h + 'px');
  };
  syncDockH();
  if(window.ResizeObserver) new ResizeObserver(syncDockH).observe(dock);
  window.addEventListener('resize', syncDockH);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(syncDockH, () => {});
}


/* ===== 全站 + 浮动按钮（已砍，9/16 之之反馈不知道它是干嘛的：全站仅计划页有 data-fab-add 接杆，
   且 fab 挂 body 上软导航残留，其他页面点了静默无效 = 死按钮。原 injectFab() 已删。）===== */

/* ===== 列表页即时搜索（.ui-search 组件配套） =====
   用法：<input class="ui-search-input" data-search-input data-search-target="#planList" />
   过滤目标容器内「直接子元素」的文本；空查询恢复全部显示。无匹配选择器时安全跳过。 */
function initListSearch(){
  document.querySelectorAll('[data-search-input]').forEach(inp => {
    const sel = inp.getAttribute('data-search-target');
    if(!sel) return;
    const box = document.querySelector(sel);
    if(!box) return;
    inp.addEventListener('input', () => {
      const q = (inp.value || '').trim().toLowerCase();
      const items = Array.prototype.slice.call(box.children);
      if(!items.length) return;
      items.forEach(it => {
        const hit = !q || (it.textContent || '').toLowerCase().indexOf(q) !== -1;
        it.style.display = hit ? '' : 'none';
      });
    });
  });
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
  /* 显示口径与悬浮条一致：倒计时模式显示剩余时间（floatDisplaySec），否则正计时 */
  const dispSec = floatDisplaySec(a);
  const live = document.getElementById('sideTimerLive');
  if(live) live.textContent = fmtHMS(dispSec);
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
      + '<span class="st-name">' + escapeHtml(a.subName || a.moduleName || '学习') + '</span>'   /* 9/17 任务名优先 */
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
/* 根据 moduleId/subId 补全 moduleName/subName；本地锚点只存 id 没存名字，
   跨页结束时若直接从 loadActive() 取，会缺名字导致记录显示成「学习」。
   以后 persistLocalActive 会同时写名字，但旧锚点和异常数据仍靠这里兜底。 */
function resolveTimerNames(a){
  if(!a) return { moduleName:'学习', subName:'学习' };
  let moduleName = a.moduleName || '';
  let subName = a.subName || '';
  const mod = (typeof MODULES !== 'undefined') ? MODULES.find(x => x.id === a.moduleId) : null;
  const child = mod && mod.children ? mod.children.find(c => c.id === a.subId) : null;
  if(!moduleName && mod) moduleName = mod.name || '';
  if(!subName){
    if(child) subName = child.name || '';
    else if(moduleName) subName = moduleName;
  }
  return { moduleName: moduleName || '学习', subName: subName || moduleName || '学习' };
}
/* 生僻词黑名单（系统规则，全站唯一数据源）：素材生成(materials.js)与串题(speaking.js)两端共用同一份。
   只用于拼装给 AI 的提示词文本，**禁止对 AI 输出做正则过滤**（删词会把句子删残）。 */
window.FORBIDDEN_WORDS = ['landmark','construct','symbolize','architecture','breathtaking',
  'incredible','entrepreneurship','cognitive','authentic'];
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
  // 入库去重：同一 timerId 只结算一次（防双端各自结束 → 两段计时叠加进当日统计）
  const already = DATA.sessions.some(s => s.timerId && s.timerId === a.timerId);
  if(!already && durationSec > 0 && typeof playChime === 'function') playChime();
  if(!already && durationSec > 0){
    const names0 = resolveTimerNames(a);
    DATA.sessions.push({
      id: uid(), timerId: a.timerId, date: todayKey(), moduleId: a.moduleId, subId: a.subId,
      moduleName: names0.moduleName, subName: names0.subName,
      startTs: a.startTs, endTs, durationSec, pauseSec
    });
  }
  // toast 文案需要名字：无条件计算（names 只在上方 if 块内声明的话，出了块就访问不到 → ReferenceError）
  const names = resolveTimerNames(a);
  clearActive();                                   // 清本地恢复锚 点
  // 云镜像同步结束（对齐 timer.js stopSession 的口径）：不标记的话浮窗按 DATA.activeTimer
  // 继续显示幽灵计时，且另一端 30s 轮询合并 _mergeActiveTimer 时拿不到 ended → 不清态、可二次入库
  if(DATA.activeTimer && !DATA.activeTimer.ended && (!DATA.activeTimer.timerId || DATA.activeTimer.timerId === a.timerId)){
    DATA.activeTimer = { timerId: a.timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  }
  // 广播 ended：计时页恢复逻辑见此即清态、不二次入库。
  // broadcastEnded 定义在 timer.js（仅计时页加载）；其他页跨页结束时不存在，必须守卫，
  // 否则此处 ReferenceError 会中断后续 window.active 清理 + hubSave 落盘 + toast（实测崩溃路径）。
  if(typeof broadcastEnded === 'function') broadcastEnded(a.timerId);
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
  toast('已保存 ' + names.subName + '：学习 ' + fmtHM(durationSec) + (pauseSec > 0 ? ' · 暂停 ' + fmtHM(pauseSec) : ''));
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
  // 桌面展开态常驻「收起」按钮
  const cin = document.getElementById('sideCollapseIn');
  if(cin){ cin.addEventListener('click', toggleSidebar); }
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
  // 移动端：「更多」弹层（底部导航已由全站 dock 接管，旧 tabbar 组件 2026-09-08 删除）
  if(!document.getElementById('moreSheet')){
    const pageById = id => PAGES.find(p => p.id === id);
    const cur = _hubCurrentFile;

    /* 🔴 10/4 17:55 dock 分组重构：底部 dock 已经是 GROUPED_DOCK（首页/计划/学习/我的），
       **每个页面都有组可归**，所以「更多」弹层**不再需要收纳入口**。
       改法：moreIds 直接算空 → 弹层只剩「意见反馈」一个按钮（她 10/2 拍板要有）。
       ⚠️ 为什么不是删掉整个弹层：openMoreSheet() 还被别处引用（侧栏 / 反馈入口），
         删函数会连带炸 3 处调用点。这里让它退化成「只放反馈」，风险最小。
       ⚠️ 错句本 wrongbook 按她 17:54 的话从「我的」组移除，但**侧栏仍是 13 项全列**
         （desktopSidebarIds 没动）—— 她自己以后想用还能从侧栏进。 */
    const moreIds = [];   // 分组 dock 后不再需要收纳任何页面
    let sh = '<div class="sheet-head"><span>更多功能</span>'
      + '<button class="sheet-close" type="button" aria-label="关闭">✕</button></div>'
      + '<div class="sheet-list">';
    for(const pid of moreIds){
      const p = pageById(pid); if(!p) continue;
      const active = (p.file === cur) ? 'active' : '';
      sh += `<a class="sheet-item ${active}" href="${p.file}" data-id="${p.id}">`
        + `<span class="nav-icon">${p.icon}</span><span class="side-label">${p.name}</span></a>`;
    }
    /* 10/2 意见反馈入口（她拍板「更多抽屉 + 设置页各一个」）：非跳转项，所以是 button 不是 a。
       点击由 js/feedback.js 的 [data-fb-open] 委托接管（打开全站共用弹层）。 */
    sh += '<button class="sheet-item" data-fb-open type="button">'
      + '<span class="nav-icon">💬</span><span class="side-label">意见反馈</span></button>';
    sh += '</div>';
    const bd = document.createElement('div'); bd.id = 'sheetBackdrop'; bd.className = 'sheet-backdrop';
    const sheet = document.createElement('div'); sheet.id = 'moreSheet'; sheet.className = 'sheet'; sheet.innerHTML = sh;
    document.body.appendChild(bd); document.body.appendChild(sheet);

    bd.addEventListener('click', closeMoreSheet);
    sheet.querySelector('.sheet-close').addEventListener('click', closeMoreSheet);
    sheet.querySelectorAll('.sheet-item').forEach(a => a.addEventListener('click', closeMoreSheet));
  }

  // 收起后左上角的展开按钮（桌面浮出）—— 保持不动
  if(!document.getElementById('sideCollapse')){
    const col = document.createElement('button');
    col.id = 'sideCollapse'; col.className = 'side-collapse';
    document.body.appendChild(col);
    col.addEventListener('click', toggleSidebar);
    syncCollapseIcon();
  }
}
function openMoreSheet(){ document.body.classList.add('sheet-open'); }
function closeMoreSheet(){ document.body.classList.remove('sheet-open'); }

function toggleSidebar(){
  const now = document.body.classList.toggle('side-collapsed');
  DATA.settings.collapsed = now;
  hubSave();
  syncCollapseIcon();
}

function syncCollapseIcon(){
  const collapsed = document.body.classList.contains('side-collapsed');
  // 收起后浮出的「展开」按钮
  const col = document.getElementById('sideCollapse');
  if(col){
    col.textContent = collapsed ? '☰' : '⟨';
    col.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
  }
  // 展开态常驻在侧栏头部的「收起」按钮
  const cin = document.getElementById('sideCollapseIn');
  if(cin){
    cin.textContent = collapsed ? '☰' : '⟨';
    cin.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
  }
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
  // 状态栏配色随主题联动（iOS/Android 浏览器顶栏）
  var tc = document.querySelector('meta[name="theme-color"]');
  if(tc) tc.setAttribute('content', theme === 'dark' ? '#0e1c1b' : '#3a9a93');
}

function toast(msg){
  let t = document.getElementById('toast');
  if(!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2400);
}

/* 10/1 免费额度/会员专属轻条（她拍板口径：不打扰——不用大弹窗不自动跳页，
   就一条底部小提示条带「开会员」小按钮，8 秒自动消失，可手动关）。
   msg 用服务端返回的文案（单点维护在 ai.js）；同一时刻只保留一条。 */
function limitStrip(msg){
  try{
    const old = document.getElementById('hubLimitStrip');
    if(old) old.remove();
    const strip = document.createElement('div');
    strip.id = 'hubLimitStrip';
    const txt = document.createElement('span');
    txt.className = 'ls-txt'; txt.textContent = msg || '免费额度已用完';
    const btn = document.createElement('a');
    btn.className = 'ls-btn'; btn.href = 'vip.html'; btn.textContent = '开会员';
    const x = document.createElement('button');
    x.className = 'ls-x'; x.type = 'button'; x.setAttribute('aria-label', '关闭'); x.textContent = '✕';
    x.addEventListener('click', () => strip.remove());
    strip.appendChild(txt); strip.appendChild(btn); strip.appendChild(x);
    document.body.appendChild(strip);
    setTimeout(() => { try{ strip.remove(); }catch(e){} }, 8000);
  }catch(e){}
}

/* === 全站统一「回车即提交」（9/22 之之）===
   Enter（无 Shift、非输入法组词态）→ 触发该输入框对应提交按钮的 click；
   Shift+Enter = 换行；按钮 disabled（AI 忙碌/已判定）时 click 天然无效，防连击。
   submitBtn 传当前状态下的主行动按钮——按钮 onclick 被状态改写的模块（pd/sd/sent）
   传按钮元素本身即可，Enter 永远跟按钮当前行为一致，不会绕过状态机。 */
function bindEnterSubmit(input, submitBtn){
  if(!input || !submitBtn || typeof input.addEventListener !== 'function') return;
  if(input.__enterSubmitBound) return;          // 防重复绑定（软导航重建后是新节点，不受影响）
  input.__enterSubmitBound = true;
  input.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    try{ submitBtn.click(); }catch(_){}
  });
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

/* 取"下一次考试"：优先用户显式设置的单个 examDate，再回退 examDates 数组（多场日程）。
   选今天及之后最早的一场；若全部已过，返回最近一场（供"已结束"提示）。 */
function nextExamDate(){
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const push = v => { if(!v) return null; const d = new Date(v + 'T00:00:00'); if(isNaN(d)) return null; return { raw:v, d }; };

  // 用户通过「设置/回顾」显式设置的"下次考试日期"优先级最高
  const single = push(DATA.settings.examDate);
  if(single){
    if(single.d >= today0) return { raw:single.raw, passed:false };
    return { raw:single.raw, passed:true };
  }

  // 回退到历史多场日程
  const arr = (DATA.settings.examDates || []).map(push).filter(Boolean);
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

/* 日期偏移：输入 'YYYY-MM-DD'，返回 +/- n 天后的 'YYYY-MM-DD'。
   原在 practice.js，plans.js 软导航时因 practice.js 未加载而崩溃，故上提到 common.js。 */
function addDays(dateStr, n){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

/* 连续学习天数（今天往前数连续有 session 的天数）。首页与计时页共用一份实现。
   - 用 addDays 做纯字符串日期算术：new Date('YYYY-MM-DD') 按 UTC 解析，非东八区会错位断档；
   - filter(Boolean) 丢弃缺 date 的脏记录：undefined 经 sort+reverse 排首位会把整条 streak 误判 0。 */
function calcStreak(){
  const sessions = DATA.sessions || [];
  if(sessions.length === 0) return 0;
  const dates = [...new Set(sessions.map(s => s.date).filter(Boolean))].sort().reverse();
  if(dates[0] !== todayKey()) return 0;
  let count = 1;
  for(let i = 1; i < dates.length; i++){
    if(dates[i] === addDays(dates[i-1], -1)) count++; else break;
  }
  return count;
}

/* Cloudflare Pages 会开启 Pretty URLs，把 /plans.html 改写成 /plans。
   软导航与直接访问的 pathname 可能不带 .html，但 PAGES 中统一存 .html。
   用此函数把文件名标准化，保证高亮匹配不出错。 */
function normalizePageFile(file){
  if(!file || file === '/' || file === '') return 'home.html';   // 9/30：/ 现在是落地页，学习主页是 home.html
  if(!/\.html$/i.test(file)) return file + '.html';
  return file;
}

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

/* ===== AI 不可用提示（10/1 商业化改造）=====
   站内通道（/api/ai，Key 只在站长服务端）成为默认路径，「用户自备 Key」概念随设置页 AI 模块
   一起下线，design/81 的「去设置填 Key」引导卡整套退役。AI 不可用时只提示稍后再试。 */
function notifyNoKey(){ toast('AI 服务暂时不可用，请稍后再试'); }

/* 共享 AI 出口：站内中转（/api/ai）为主路径，本机自带 Key 直连 DeepSeek 为遗留兼容。
   10/1 商业化改造：设置页 AI 模块已删，「用户自备 Key」入口下线——新用户一律走站内；
   存量设备 DATA 里还留着 relayToken/aiChannel 字段，auto 逻辑（有本机 Key 用本机）继续生效，零迁移。
   service ∈ 'gpt' | 'trans' | 'longsent' | 'speaking_assist' | 'writing_score' | 'words'
   （统一用 deepseek-chat，service 仅作语义标记，不影响调用）。

   站内中转（functions/api/ai.js）：站长在 Cloudflare 环境变量 AI_API_KEY 里配 Key，
      全站每日限额 AI_DAILY_LIMIT（默认 3000）、单 IP 每日 AI_IP_LIMIT（默认 200）。
      aiChannel 兼容口径：auto（默认）= 本机有 Key 用自己的，没有走站内；site = 强制站内；own = 只用本机 Key。 */
const AI_BASE = 'https://api.deepseek.com/v1';
const AI_MODEL = 'deepseek-chat';
const SITE_AI_URL = 'api/ai';

async function callSiteRelay(service, messages, temperature, opts){
  const body = { service: service, messages: messages, temperature: temperature };
  if(opts && opts.max_tokens) body.max_tokens = opts.max_tokens;
  if(opts && opts.json_mode) body.json_mode = true;
  // ⭐ 10/1 收口登录：站内 AI 必须带 session token，服务端未登录直接 401 auth_required
  const res = await fetch(SITE_AI_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Session': (typeof authToken === 'function' ? (authToken() || '') : '') }, body: JSON.stringify(body) });
  const txt = await res.text();
  let j = null; try{ j = JSON.parse(txt); }catch(_){}
  if(res.status === 501 || (j && j.error === 'relay_not_configured')){
    const e = new Error('站内通道未配置'); e.code = 'NO_SITE_RELAY'; throw e;
  }
  if(!res.ok){
    const e = new Error((j && j.msg) || ('站内 AI 通道返回 ' + res.status));
    e.code = (j && j.error) || 'SITE_RELAY_FAIL';
    throw e;
  }
  if(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content != null) return j.choices[0].message.content;
  if(j && typeof j.content === 'string') return j.content;
  throw new Error('站内 AI 通道返回格式异常');
}

/* 10/3 全站 AI 超时保护（她手机端报「计划按钮点了没反应，只能刷新」）。
   根因：各 AI 按钮都是「点 → disabled + 文案改『安排中…』→ await callRelay → finally 解锁」。
   弱网/网络挂住时 await 永不返回，finally 永不执行 → 按钮永久卡死；
   且 callSiteRelay 内的 fetch 本身也无自带超时，等多久全看浏览器。

   修法：**在最上游的 callRelay 加超时**，一处覆盖全部 AI 调用点
   （corpus / pattern-drill / scene-drill / sentence-drill / speaking /
     materials / mock-summary / feedback / plans / coach 等），以后新增 AI 功能自动免疫——
   **不需要逐个改按钮，也不新增任何交互**。
   超时后抛 code='AI_TIMEOUT' 的错，各调用点原有的 catch/finally 就能正常解锁按钮并提示。 */
const AI_TIMEOUT_MS = 25000;   // 25 秒：够 DeepSeek 长回答（陪练 P2 连讲 + 资料 4096 token）跑完，又不至于让人干等
function withTimeout(promise, ms){
  ms = ms || AI_TIMEOUT_MS;
  let timer = null;
  /* 超时赢了之后，原始 promise 仍会在稍后 settle。若那时它是 reject 状态，
     因为已经没人再挂 catch，会在控制台抛 unhandledrejection。
     这里先挂一个 catch 把这个孤儿 rejection 吃掉。
     注意：只在「超时已胜出」时才吞——正常路径下原始 promise 的错误照常抛给调用方。 */
  let timedOut = false;
  const guarded = Promise.resolve(promise).catch(e => {
    if(timedOut) return undefined;    // 超时后迟到的错误：静默丢弃（用户已看到超时提示）
    throw e;                          // 正常路径：错误原样上抛
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const e = new Error('AI 响应超时（' + Math.round(ms / 1000) + ' 秒无响应），请重试');
      e.code = 'AI_TIMEOUT';
      e.isTimeout = true;
      reject(e);
    }, ms);
  });
  /* 无论成功失败都必须清掉定时器，否则每个调用都留一个 25 秒的孤儿 setTimeout
     （页面开久了会堆积几百个）。finally 在 Promise.race 的两条路上都会跑。 */
  return Promise.race([guarded, timeout]).finally(() => { if(timer) clearTimeout(timer); });
}

async function callRelay(service, messages, temperature, opts){
  return withTimeout(callRelayInner(service, messages, temperature, opts), AI_TIMEOUT_MS);
}

async function callRelayInner(service, messages, temperature, opts){
  const s = DATA.settings || {};
  const key = s.relayToken || '';
  const ch = s.aiChannel || 'auto';                 // auto | site | own
  const wantSite = (ch === 'site') || (ch === 'auto' && !key);
  let siteErr = null;
  if(wantSite){
    try{ return await callSiteRelay(service, messages, temperature, opts); }
    catch(e){ siteErr = e; }                        // 站内没成 → 有 Key 就静默回退，没有才报错
  }
  if(!key){
    if(siteErr && siteErr.code === 'auth_required'){    // 未登录：明确引导登录，不走「服务不可用」话术
      toast('请先登录，登录后即可使用 AI 功能');
      const ea = new Error('请先登录，登录后即可使用 AI 功能');
      ea.code = 'AUTH_REQUIRED';
      throw ea;
    }
    /* 10/1 分功能额度闸的统一前端口径：服务端返回什么文案就显示什么（limitStrip 轻条+「开会员」按钮，
       她拍板不弹窗不自动跳）。错误码映射见 ai.js；code 原样透传给调用方自行处理。 */
    if(siteErr && /^(user_limit|mock_limit|writing_limit|trans_limit|vip_required)$/.test(siteErr.code)){
      limitStrip(siteErr.message || '免费额度已用完，周卡首购 ¥19 立享无限用');
      const eu = new Error(siteErr.message || '免费额度已用完');
      eu.code = siteErr.code;
      throw eu;
    }
    notifyNoKey();                                     // AI 不可用：一句 toast（引导卡已随「自备 Key」下线）
    const e0 = new Error(siteErr
      ? ('AI 服务暂时不可用：' + siteErr.message)
      : 'AI 服务暂时不可用，请稍后再试');
    e0.code = siteErr ? (siteErr.code || 'SITE_RELAY_FAIL') : 'NO_RELAY_KEY';
    throw e0;
  }
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
  // 可选覆盖（如素材深挖需要更大输出窗口：{ max_tokens: 8192 }，默认 4096 会被长 JSON 截断）
  if(opts && typeof opts === 'object') Object.assign(body, opts);
  const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
  if(!res.ok){
    let detail = '';
    try{
      const j = await res.json();
      // DeepSeek/OpenAI 4xx 返回 {error:{message,type,...}}——不展开对象会拼出 "[object Object]"，用户看不到真实原因
      const err = j && j.error;
      detail = (typeof err === 'object' && err && err.message) ? err.message
        : (j && (j.error || j.detail || j.message)) || '';
      if(typeof detail !== 'string') detail = '';
    }catch(_){}
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
  const mObj = s.match(/\{[\s\S]*\}/);
  if(mObj){ try{ return JSON.parse(mObj[0]); }catch(_){} }
  // 9/15 之之实锤：AI 偶发把同一段 JSON 输出两遍拼在一起（或前后夹说明文字）→ 贪婪正则
  // 取「第一段开头+最后一段结尾」必然 parse 失败。改为扫描第一个括号平衡的 {...}
  // （跳过字符串字面量内部的引号/转义/花括号），取到即解析返回。
  const i0 = s.indexOf('{');
  if(i0 !== -1){
    let depth = 0, inStr = false, esc = false;
    for(let i = i0; i < s.length; i++){
      const ch = s[i];
      if(inStr){
        if(esc){ esc = false; continue; }
        if(ch === '\\'){ esc = true; continue; }
        if(ch === '"') inStr = false;
        continue;
      }
      if(ch === '"'){ inStr = true; continue; }
      if(ch === '{') depth++;
      else if(ch === '}'){
        depth--;
        if(depth === 0){
          try{ return JSON.parse(s.slice(i0, i + 1)); }catch(_){}
          break;
        }
      }
    }
  }
  const mArr = s.match(/\[[\s\S]*\]/);
  if(mArr){ try{ return JSON.parse(mArr[0]); }catch(_){} }
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

*** ADAPT DIFFICULTY TO THE CANDIDATE (added 2026-10-03) ***
A real examiner calibrates question difficulty to how the candidate is actually performing. Read the candidate's Part 2 answer (and any earlier answers) and pick the matching tier. This is NOT optional — it is the single most important rule here.

TIER A — candidate's Part 2 was WEAK (many long pauses / restarts, short choppy sentences, grammar slips, very basic vocabulary, ran out of things to say):
  → Ask SIMPLE questions. Keep the question UNDER 12 WORDS.
  → Use only everyday words (grade-school level). No idioms, no phrasal verbs, no collocations, no abstract nouns.
  → One idea per question. Prefer direct "Do you...?" / "Is it...?" / "Why do you...?" / "What about...?" forms.
  → Do NOT stack two ideas with "and" or "or". Do NOT ask about reasons, impacts or comparisons yet.
  → GOOD: "Do you like it?" · "Why do you like it?" · "Is it easy?" · "What do you think?"
  → BAD: "To what extent has your attitude towards that particular phenomenon evolved over the past decade?"

TIER B — candidate's Part 2 was ACCEPTABLE (some hesitation but can produce connected sentences, uses a mix of simple and intermediate vocabulary):
  → Ask MEDIUM questions. Under 18 words. Everyday-to-intermediate vocabulary. May use one "because/why" clause.
  → GOOD: "Why do you think people enjoy it?" · "Has that changed in recent years?"

TIER C — candidate's Part 2 was STRONG (fluent, long connected sentences, varied and accurate vocabulary, clear opinions with reasons, easy to follow):
  → Ask DEEPER questions. Up to 25 words. Intermediate-to-advanced vocabulary is fine. May use comparison, cause, impact, prediction.
  → GOOD: "Why do you think some people are drawn to that while others aren't?" · "Has the way people approach it changed in the past ten years?"

Default to TIER B when the answer is missing, very short, or you cannot tell.

ALSO — the question must be rooted in WHAT THEY ACTUALLY SAID:
- Build the question on a specific concrete thing they mentioned (a job, a place, a feeling, an object, a reason they gave). Example: if they said "my favourite job would be a psychologist", ask "What made you want to be a psychologist?" or "Do people in China often want that kind of job?" — NOT a generic "What is your favourite job?".
- If an earlier answer mentions something specific, the next question may return to it from a wider angle.
- If an earlier answer is vague or empty, ask something simple to draw more detail out, rather than jumping ahead.

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
        ? "\nThis is the FIRST follow-up (Q1): base it on something SPECIFIC the candidate actually said in their Part 2 talk (a detail, a person, a place, a feeling or a reason they gave) - then widen it to a general angle. Difficulty must already match their tier: if their Part 2 was weak, Q1 must be under 12 words and elementary."
        : "\nThis is a CONTINUING follow-up (Q" + (step + 1) + "): it must directly build on the candidate's PREVIOUS answer below - dig deeper (cause / impact / comparison / classification / prediction). Stay on the SAME tier as Q1 unless their new answer clearly shows they can handle more; if it got weaker, step DOWN. Do NOT introduce an unrelated new topic.")
    + '\nGenerate ONLY the single next question string now.';
  let user = 'Part 2 cue card (English): ' + (p2.promptEn || '') + '\nChinese: ' + (p2.promptZh || '')
    + '\nYou should say: ' + ((p2.youShouldSay || []).join('; '))
    + '\n\nThe candidate\'s Part 2 talk:\n' + (p2Text || '(no answer given)');
  /* 10/3 23:05 她报「P3 难度不随我 P2 表现变」：光在 system 里写规则不够，
     必须在 user 里**显式给出水平判定依据**（长度/句数/停顿痕迹/用词），
     否则模型没有客观标尺可依，只能按 TIER B 默认走。 */
  if(p2Text){
    const words = p2Text.trim().split(/\s+/).filter(Boolean).length;
    const sents = p2Text.trim().split(/[.!?]+/).filter(s => s.trim()).length;
    const avgLen = sents ? Math.round(words / sents) : words;
    const fillers = (p2Text.match(/\b(um|uh|erm|er|like|you know|i mean|sort of|kind of)\b/gi) || []).length;
    user += '\n\n--- Candidate performance analysis (use this to pick the difficulty tier) ---'
      + '\nWord count: ' + words
      + '\nSentence count: ' + sents
      + '\nAverage sentence length: ' + avgLen + ' words'
      + '\nHesitation/filler markers (' + fillers + '): ' + (fillers >= 3 ? 'MANY → hesitant delivery' : (fillers > 0 ? 'a few' : 'none'))
      + '\nInterpret it as: WEAK if (words < 60 AND (fillers >= 3 OR avgLen < 7)) or avgLen < 7. '
      + 'STRONG if words >= 130 AND avgLen >= 11 AND fillers <= 1. Otherwise ACCEPTABLE.'
      + '\nThen apply the matching tier (A = under 12 words / elementary vocabulary / one idea; '
      + 'B = under 18 words / everyday-to-intermediate; C = up to 25 words / may use cause, impact, comparison).';
  }
  if(!isFirst){
    user += '\n\n--- Previous Part 3 exchange ---'
      + '\nExaminer asked: ' + (prevQ || '')
      + '\nCandidate answered: ' + (prevA || '(no answer given)')
      + '\n\nNow ask the NEXT follow-up question. It must grow out of a SPECIFIC thing the candidate '
      + 'just said (a detail, a reason, a feeling, an object they mentioned) — not out of the Part 2 topic in general. '
      + 'Match the difficulty to their overall performance as analysed above.';
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

/* ===== 云端同步（Cloudflare Pages Function + KV） =====
   10/1 起账号 = 手机号/用户名 + 密码（/api/auth），/api/sync 凭 session token（X-Session 头）读写。
   旧「X-Sync-Key 手机号直连」通道已下线（无鉴权的安全账）。
   非 Cloudflare 部署时 /api/sync 会 404，所有调用都会优雅降级（不报错、不弹窗刷屏）。 */
let _cloudTimer = null;
let _lastUploadedHash = '';
let _pendingUpload = false;
let _firstPendingAt = 0;
let _lastCloudHash = '';   // 上次拉到的云端内容哈希：相同则跳过 mergeData（性能优化，见 cloudDownload）
let _lastUploadedCloudHash = '';   // v7.1：最近一次成功上传的 payload 哈希——拉取命中它=自己刚传的回声，跳过合并不弹窗不计变更
let _bootPublishTried = false;   // ⭐ 9/19 每次页面加载只做一次「开机发布」（见 _maybePublishLocal）

/* ===== 9/30「同步很憋屈」专项：乐观锁基线 + 自适应节流 + 多标签 leader =====
 * 背景（她原话：「反正就是经常同步不上啊」「出现过同步失败或被覆盖」）：
 * 之前 PUT 是无条件整份覆盖，两台设备各自推自己的快照 = 互相抹掉对方的进度。
 * 服务端 9/30 起支持乐观锁（409），这里负责：带上 baseTs、遇到 409 先合并再重试。 */
let _cloudBaseTs = 0;      // 最后一次「已验证」的云端 ts；0 = 还不知道（此时不锁，走老语义）
let _lastPutAt = 0;        // 上次 PUT 成功时刻
let _lastChangeAt = 0;     // 上次挂起变更的时刻（用于「静默一段时间后重置节流」）
let _putGap = 6000;        // 当前两次 PUT 的最小间隔：安静时 6s，连续写盘时逐步放宽到 60s
/* ⭐ 起步 6s、每次 ×1.6、上限 60s：6 → 9.6 → 15 → 25 → 39 → 60。
   意思是「刚动第一下」基本秒到（≤10s），但如果是在连续做题/计时，一分钟内就自己退到几十秒一次，
   8 小时连续学习约 150 次 PUT —— 比旧方案还省，且再也不会出现「写盘不停就永远不传」。 */
const PUT_GAP_MIN = 6000, PUT_GAP_MAX = 60000, PUT_IDLE_RESET = 45000;

/* ⭐ 9/30 多标签页 leader 选举：同一台机器开着 3 个标签页时，只有 leader 做定时轮询。
 * 为什么需要：每个标签页各有自己的内存 DATA，各自拉各自合并，既浪费配额又互相制造冲突（409）。
 * 现在：
 *   - leader = 「前台标签优先，其次 id 最小」；一旦 leader 切到前台，会立刻接管（isLeader 变化时马上补一次探测）。
 *   - 非 leader 完全不轮询，靠 leader 广播 'poll' 通知「云端有变化」再各拉一次。
 *   - 不支持 BroadcastChannel（老浏览器）时恒为 leader —— 退化和今天一样，不会变砖。
 * 注意：上传不做 leader 限制。谁改了谁传，正确性由乐观锁保证（409 会自动合并重试）。
 * ⚠️ 必须在调用点之前初始化 —— defer 脚本的 ready() 回调可能同步执行，
 *    写在文件后段的 const 会落进 TDZ，被 catch(_){} 静默吞掉（9/26 踩过的坑）。 */
const _tabId = 't' + Math.random().toString(36).slice(2, 9);
const _syncBC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('hub-sync-v1') : null;
let _syncPeers = {};      // tabId -> { ts, hidden }
let _isLeader = true;     // 保守默认 true：单标签页时本来就该干活
function _syncElectLeader(){
  const now = Date.now();
  Object.keys(_syncPeers).forEach(k => { if(now - _syncPeers[k].ts > 12000) delete _syncPeers[k]; });
  const self = {}; self[_tabId] = { ts: now, hidden: !!(typeof document !== 'undefined' && document.hidden) };
  const all = Object.assign({}, _syncPeers, self);
  const ids = Object.keys(all).sort((a, b) => {
    const ha = all[a].hidden ? 1 : 0, hb = all[b].hidden ? 1 : 0;
    if(ha !== hb) return ha - hb;      // 前台优先
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  const was = _isLeader;
  _isLeader = (ids[0] === _tabId);
  if(_isLeader && !was && typeof _cloudPollSoon === 'function') _cloudPollSoon();   // 刚接任：立刻补一次
}
function _syncBcPing(){
  try{ if(_syncBC) _syncBC.postMessage({ t:'ping', id:_tabId, hidden: !!(typeof document !== 'undefined' && document.hidden) }); }catch(e){}
}
if(_syncBC){
  _syncBC.onmessage = function(ev){
    const m = ev.data;
    if(!m || !m.id || m.id === _tabId) return;
    if(m.t === 'ping'){ _syncPeers[m.id] = { ts: Date.now(), hidden: !!m.hidden }; _syncElectLeader(); }
    else if(m.t === 'bye'){ delete _syncPeers[m.id]; _syncElectLeader(); }
    else if(m.t === 'poll'){ try{ cloudPollOnce(); }catch(e){} }   // leader 说云端变了
    else if(m.t === 'uploaded'){ if(!_isLeader) try{ setTimeout(cloudPollOnce, 400); }catch(e){} }   // 别的标签页传过东西：跟一次，别等到下一轮轮询
  };
}

/* ⭐ 9/19 修「两台设备数据对不上/来回跳」第二刀：开机发布。
 * 上一刀（eb5c9b9）修了「背完就传」，但只覆盖「本机刚写过」的场景；她实测又暴露出另一半：
 * 手机上滞留的独有进度（早前没传出去的那批），在「只打开页面对比、不做任何操作」时永远没有上传出口——
 * pull 合并只进不出，旧注释假设「本端独有数据会在下次操作时自然上传」，不成立。
 * 同时两台设备各自把自己的快照推上云，云端在两份快照间来回翻（她看到 2h16m→3h7m 跳变）。
 * 修法：每次页面加载的首次拉取完成（此刻 DATA=本机∪云端 并集）后，
 * 若并集与云端内容不一致（或云端为空 404）→ 立即把「并集」回传云端。
 * 云端从此只被「并集」覆盖，单调收敛不再互相踩；已收敛时内容一致→不推，不浪费 KV 配额。
 * 只在首次拉取时机做一次（30s 轮询不推），最坏情况=每次打开页面 1 次 PUT，配额无压力。 */
function _syncComparableSnapshot(src){
  try{
    const c = JSON.parse(JSON.stringify(src || {}));
    if(c && c.settings){ delete c.settings.lastSyncTs; delete c.settings.relayToken; }   // 这两个是上传动作自身的副产品，不参与「内容是否一致」判断
    return c;
  }catch(e){ return null; }
}
function _maybePublishLocal(cloudEmpty, cloudBlob){
  if(_bootPublishTried) return;
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  _bootPublishTried = true;   // 先占位再尝试：失败也不重试（下次打开页面再试），防轮询期反复推
  try{
    if(cloudEmpty){ cloudUpload(false); return; }   // 云端没数据（404）=本机就是最全的 → 直接发布
    const mine = JSON.stringify(_syncComparableSnapshot(stripCloudFields(DATA)));
    const theirs = JSON.stringify(_syncComparableSnapshot(cloudBlob));
    if(mine && theirs && mine !== theirs) cloudUpload(false);
  }catch(e){}
}

function hashData(x){
  // 简单稳定哈希：把 DATA JSON 做 djb2，够用来判断「内容是否真变了」。
  // x 可选：传云端数据则哈希云端内容（cloudDownload 用它判断「云端是否变化」）；
  // 不传则哈希当前内存 DATA（cloudUpload 判断「本机是否有实质变更」）。
  const s = JSON.stringify(x === undefined ? DATA : x);
  let h = 5381;
  for(let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return String(h);
}

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

/* ===== 10/1 账号认证（手机号 + 密码）=====
   老体系「手机号即凭证、X-Sync-Key 直连」已彻底下线（那正是本次要还的安全账）。
   现在：/api/auth register/login/change/reset/logout，/api/sync 只认 session token。
   token 存 localStorage['hub_auth_token']（绝不进 DATA——DATA 会整份上云）；
   DATA.settings.syncCode 继续当「账号标识」用（大量旧逻辑读它），由登录流程写入。
   忘记密码走「恢复码找回」（注册时生成、明文只显示一次，服务端只存哈希）——她拍板的方案。 */
const AUTH_TOKEN_KEY = 'hub_auth_token';
function authToken(){ try{ return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }catch(e){ return ''; } }
function setAuthToken(t){
  try{
    if(t) localStorage.setItem(AUTH_TOKEN_KEY, t); else localStorage.removeItem(AUTH_TOKEN_KEY);
    /* 10/2 修：登录态一变（登录/登出/401 过期都走这里），写作模板会员闸的会话级缓存必须作废。
       否则同标签卡登录会员后「刷新本页」仍命中旧的 '0' 被锁（锁卡指引失效）；
       登出/换号后又会命中旧的 '1' 保持解锁（会员锁被绕过）。 */
    sessionStorage.removeItem('hub_vip_flag_v1');
  }catch(e){}
}

async function authApiPost(payload){
  let res = null;
  try{
    res = await fetch('api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }catch(e){ throw new Error('网络异常，稍后再试'); }
  let j = null;
  try{ j = await res.json(); }catch(_){}
  if(!res.ok || !j || !j.ok){
    const e = new Error((j && j.msg) || ('请求失败（HTTP ' + res.status + '）'));
    e.code = (j && j.error) || 'AUTH_FAIL';
    e.status = res.status;
    throw e;
  }
  return j;
}

/* 统一的云端请求封装：自动带 X-Session 头（session token）。
   path 可选：'/?meta=1' 之类的附加查询串（9/30 轻量探测用）。
   返回 [Response, json] 二元组，调用方自行判断 status。 */
async function syncApi(method, body, path){
  const headers = { 'Content-Type': 'application/json' };
  const tok = authToken();
  if(tok) headers['X-Session'] = tok;
  const opts = { method, headers };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/sync' + (path || ''), opts);
  let data = null;
  try { data = await res.json(); } catch(e){}
  return [res, data];
}

/* ⭐ 9/30 重写「什么时候真的上传」——解决「改完另一头要等很久」。
 * 旧口径：debounce 60s + maxWait 3min。意思是连续写盘时最长要 3 分钟才落地，
 *        她体感就是「背完了另一台设备上看不到」。当时这么保守是担心 KV 写配额（1000/天）。
 *        实测她的写量只有几十次/天，配额根本碰不到 —— 真正稀缺的是「及时」，不是省钱。
 * 新口径（三层）：
 *   1) 合并窗口 2.5s：连着改几下算一次，避免一次点击发好几个 PUT。
 *   2) 最小上传间隔 _putGap：空闲后第一次改动 8s 内必达；同一次连续学习里逐步放宽到 60s。
 *      →  bursts 不炸配额（最密 8s 一次，理论上限约 450 次/小时，只在疯狂连点时出现），
 *         稳态退化为 60s 一次，8 小时连续学习 ≈ 30~60 次，配额压力小于旧方案的零散突发。
 *   3) 硬上限 90s：任何情况下有变更不会超过 90s 不上传。
 * 另外加宽到 macrotask 之外：首次改动后立刻排定时器，不等下一次写盘。
 */
const CLOUD_DEBOUNCE = 2500;
const CLOUD_MAX_WAIT = 90 * 1000;
function scheduleCloudUpload(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  const now = Date.now();
  // 静默超过 45s 后重新开始改 → 节流档位重新从最快开始（ responsiveness 优先）
  if(_lastChangeAt && now - _lastChangeAt > PUT_IDLE_RESET) _putGap = PUT_GAP_MIN;
  _lastChangeAt = now;
  if(!_pendingUpload){ _pendingUpload = true; _firstPendingAt = now; }
  if(_cloudTimer) clearTimeout(_cloudTimer);
  let target = Math.max(_lastPutAt + _putGap, now + CLOUD_DEBOUNCE);
  if(target > _firstPendingAt + CLOUD_MAX_WAIT) target = _firstPendingAt + CLOUD_MAX_WAIT;
  const wait = Math.max(0, target - Date.now());
  _cloudTimer = setTimeout(function(){
    // 到点才发现距离上次 PUT 还不够久（被 maxWait 提前叫醒）→ 再睡够剩下的时间，绝不放宽节奏
    const gapLeft = _lastPutAt + _putGap - Date.now();
    if(gapLeft > 0){ _cloudTimer = setTimeout(function(){ cloudUpload(false); }, gapLeft + 30); return; }
    cloudUpload(false);
  }, wait);
}
/* showToast 是否提示；force 是否跳过「内容未变化」早退；opts.noLock 跳过乐观锁（重置/强制覆盖云端时用） */
async function cloudUpload(showToast, force, opts){
  showToast = showToast !== false;
  opts = opts || {};
  _pendingUpload = false;
  const phone = DATA.settings.syncCode;
  if(!phone){ if(showToast) toast('请先登录（设置 → 云端同步）'); return false; }
  if(!authToken()){ if(showToast) toast('登录已过期，请到「设置 → 云端同步」重新登录'); return false; }
  // 先给本机改过的条目打 updatedAt（可能改 DATA），hash 必须在打戳之后再算，
  // 否则同一次修改会被判两次「有变化」。见 stampSyncItemsForUpload 的说明。
  stampSyncItemsForUpload();
  const h = hashData();
  if(h === _lastUploadedHash && !force){
    // 数据自上次成功上传后没有实质变化，跳过本次 PUT，节省 KV 写入次数
    if(showToast) toast('数据未变化，无需上传');
    return true;   // 内容与云端一致，视为成功
  }
  try{
    const _payload = stripCloudFields(DATA);   // v7.1：先落变量——成功后记它的哈希做「自回声」基线
    const putBody = { data: _payload, ts: Date.now(), deviceId: getDeviceId() };
    // ⭐ 乐观锁：已知云端版本才带 baseTs（0=还不知道 → 不带，维持老的无条件覆盖语义）
    if(_cloudBaseTs && !opts.noLock) putBody.baseTs = _cloudBaseTs;
    const [res, body] = await syncApi('PUT', putBody);
    if(res.status === 404) throw new Error('云端未启用（需先部署 Functions）');
    if(res.status === 503) throw new Error('云端存储未绑定（Cloudflare 后台需绑定 SYNC_KV）');
    if(res.status === 401){
      setAuthToken('');   // token 已失效，清掉让设置页显示「需要登录」；本机数据绝不动
      throw new Error('登录已过期，请到「设置 → 云端同步」重新登录');
    }
    if(res.status === 409){
      // ⭐ 9/30 核心修复：期间有别端（另一台设备 / 另一个标签页）写过。
      //    绝不硬覆盖——先把它拉下来合并，再基于新版本重试。最多 2 次，防死循环。
      const tries = (opts.retry || 0) + 1;
      if(tries <= 2){
        syncSetStatus('云端有新版本，先合并再上传…', '');
        const dl = await cloudDownload(true);
        // cloudDownload 已把 _cloudBaseTs 更新到服务端最新 ts
        if(dl) return await cloudUpload(showToast, true, { retry: tries, noLock: opts.noLock });
      }
      throw new Error('云端在此期间被其他设备更新，已自动重试仍未成功，请点「立即同步」再试一次');
    }
    if(!res.ok){
      const detail = body && body.error ? body.error : ('HTTP ' + res.status);
      throw new Error(detail);
    }
    DATA.settings.lastSyncTs = Date.now();
    _lastUploadedHash = hashData();   // ⭐ 9/19：成功后重算基线——lastSyncTs 在上传成功瞬间自变化，沿用上传前快照 h 会让下次比对永远失配，hash 去重形同虚设
    _lastUploadedCloudHash = hashData(_payload);   // v7.1：自回声基线（云端存的就是这份，下次拉到相同哈希=自己传的，不再当「云端更新」合并）
    _lastPutAt = Date.now();
    _putGap = Math.min(Math.round(_putGap * 1.6), PUT_GAP_MAX);   // 连续写盘时逐步退让，稳态 60s 一次
    // PUT 成功即等于「云端此刻的内容已知」：下一次 PUT 可以直接当乐观锁基线，
    // 轮询也可以直接短路（省掉一次全量下载）
    if(body && body.ts) _cloudBaseTs = Number(body.ts) || _cloudBaseTs;
    if(body && body.hash) _lastCloudHash = String(body.hash);
    if(_syncBC){ try{ _syncBC.postMessage({ t:'uploaded', id:_tabId }); }catch(e){} }
    if(showToast) toast('已上传到云端');
    syncSetStatus('✅ 已同步到云端', 'ok');
    renderLastSync();
    return true;
  }catch(e){
    const size = Math.round(JSON.stringify(DATA).length / 1024);
    const msg = e.message + '（本机数据约 ' + size + ' KB）';
    if(showToast) toast('云端上传失败：' + msg);
    syncSetStatus('同步失败：' + msg, 'error');
    renderLastSync();
    // 失败后恢复未传标记：beforeunload/切后台时 flushCloudUpload 仍会用 sendBeacon 尽力补传；
    // 否则失败即清标记，本批改动既无提示也无任何补传通道（静默丢失窗口）。
    // 同时把 maxWait 锚点推到「现在」，避免失败后 _firstPendingAt 一直超时 → 每次 hubSave 立刻重试、刷爆配额。
    _pendingUpload = true;
    _firstPendingAt = Date.now();
    return false;
  }
}
/* 页面关闭/切后台前，若还有未上传的变更，尽量上传一次。
   sendBeacon 限制约 64KB，无法携带自定义头，故把 session token 放 URL 参数 session=（sync.js 兼容）。
   数据超过 60KB 时不在 beforeunload 中强传（会失败或阻塞），下次打开页面后 60s 内会自动补传，
   或用户可手动点「立即同步到云端」。 */
function flushCloudUpload(){
  if(!_pendingUpload) return;
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return;
  const tok = authToken();
  if(!tok) return;   // 未登录：无凭证可传
  try{
    stampSyncItemsForUpload();   // 关页/切后台补传也要先打戳，保证云端拿到时间戳
    const _payloadObj = { data: stripCloudFields(DATA), ts: Date.now(), deviceId: getDeviceId() };
    const payload = JSON.stringify(_payloadObj);
    if(payload.length > 60 * 1024) return; // sendBeacon 传不了，交给下次自动上传或手动同步
    navigator.sendBeacon('/api/sync?session=' + encodeURIComponent(tok), new Blob([payload], { type: 'application/json' }));
    try{ _lastUploadedCloudHash = hashData(_payloadObj.data); }catch(e){}   // v7.1：beacon 也记自回声基线
  }catch(e){}
}
window.addEventListener('beforeunload', flushCloudUpload);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden) return;
  // ⭐ 9/19 修「换设备背词丢一截」：切后台时若数据超过 60KB（整库词库必然超过），
  // flushCloudUpload 的 sendBeacon 会静默放弃 → 最后一批改动永远上不了云。
  // 改为直接异步 PUT：切后台页面仍存活，fetch 能正常完成；成功后 _pendingUpload 清零，
  // beforeunload 的 sendBeacon 兜底自动跳过（天然防双传）；失败则恢复 pending 交给下次。
  if(_pendingUpload && typeof cloudUpload === 'function'){ try{ cloudUpload(false); }catch(e){} return; }
  flushCloudUpload();
});
/* ===== 字段级合并（替代整份覆盖，避免双设备互相抹掉进度） ===== */
/* plans/checkins 已改为特判合并（_mergePlans / Set 去重），不在通用数组里 */
/* 同步字段白名单（个人数据，跨设备合并）。
 * ⚠️ 写作模板(writing)仍是官方共享题集，不进同步（避免手动删模板被另一端覆盖）。
 * ⚠️ 口语题库(speaking)【现已纳入同步】——用户要求口语串题答案/练习记录跨设备恢复。
 *    早期曾因"清缓存变101题"而剔除，但 v20260823u 已改 mergeSpeakingKeepAnswers 按id回填，
 *    不再有旧脏题库复活风险，故放开同步。合并时按 id 双向回填 answers，题干以官方为准。 */
const SYNC_ARRAY_FIELDS = ['sessions','notes','meds','corpus','scores','errorbook',
  'energy','writingScores','speakingStories','writingPhrases',
  'mockRecords','dictationSources','dictationLogs','longSent'];
/* 上传/合并前剔除「官方共享、个人不应同步」的字段（仅 writing 模板），保持 DATA 其余逻辑不变。
 * 注意：speaking 现已纳入同步，不再剔除。 */
function stripCloudFields(d){
  const c = Object.assign({}, d);
  delete c.writing;    // 写作模板：所有用户一致，永远用本机默认模板
  /* design/62：AI Key 严禁落云端。
     ⚠️ 必须先浅拷贝 settings 再删——c.settings 与 DATA.settings 是同一引用，
     直接 delete c.settings.relayToken 会把本机 Key 一起删掉，全站 AI 功能当场失效。 */
  if(c.settings && typeof c.settings === 'object'){
    c.settings = Object.assign({}, c.settings);
    delete c.settings.relayToken;
  }
  return c;
}
/* 设置里允许跨设备同步的字段。
   说明：pronunciationScore（发音分）/ fluencyScore（流利度自填分）/ theme（主题）/ chimeOnDone（完成提示音）纳入同步。
   ⚠️ relayToken（AI Key）自 design/62 起**不再同步**：上传出口 stripCloudFields 已剥离、服务端二次剥离；
   换设备 / 清缓存后需在本机重填一次 Key。理由：手机号即全部凭证，Key 落云端等于额度可被凭手机号取走。
   syncCode 是账号标识本身不重复同步；autoSync 是本地开关、不跨设备同步（设计：绑了账号就自动同步）。
   合并规则见 mergeData：空值（未填/被清空）永不覆盖另一侧已填值，杜绝「空值带新时间戳把本机 Key 冲掉」。 */
/* 9/26：补 practiceCfg —— 背词设置整体（每日学习上限 dailyCap / 题型 / 选项数 / 自动发音 …）
   以前不在白名单里，等于「背词设置完全不跨端」：电脑上把上限改成 200，手机仍是旧值。
   ⚠️ 必须配套：practice.js pcSave 要自己打 _fieldTs.practiceCfg，否则两端时间戳都是 0 →
   合并走「时间戳相同取云端」分支 → 本机刚改的上限会被云端旧值当场盖回去。 */
const SYNC_SETTINGS_FIELDS = ['name','examDate','examDates','targets','dailyGoalHours','pronunciationScore','fluencyScore','theme','chimeOnDone','adhd','practiceCfg','diagnosis','planLastOpen','avatar','examAvatar'];

/* ===== 同步条目时间戳维护（9/17 修：_mergeArray 缺时间戳导致云端修改永不并入）=====
   根因：_mergeArray 以 ts/updatedAt 判「较新者胜」，但 11 个同步数组的条目大多只有 id、
   没有任何时间戳 → tsOf 恒为 0、0>0 为假 → 本机一旦存在同 id 条目就永久压制云端，
   另一台设备的修改永远合并不进来（实测 11/11 数组复现，之之确认两台设备在用）。
   方案：上传出口按「内容指纹」检测变更条目并补 updatedAt（避开 hubSave 热路径，写盘频率太高）：
   - 首次见到（无快照）→ 只记快照不打戳，防历史老数据突然变成「最新」反过来盖掉另一端；
   - 指纹与上次不同 → 视为本机刚改 → updatedAt = now；
   - 指纹相同 → 不动（幂等，不产生无意义 PUT）。
   快照存内存 Map（不入库、不上传；指纹剔除 updatedAt/ts 自身防自指）。 */
var _syncStampSnap = new Map();
function _stampSyncItemFp(it){
  const c = Object.assign({}, it);
  delete c.updatedAt; delete c.ts;
  try { return JSON.stringify(c); } catch(e){ return null; }
}
function _stampSyncItemKey(f, it, fp){
  return f + '|' + (it && it.id != null ? ('id:' + it.id) : (it && it.ts != null ? ('ts:' + it.ts) : ('h:' + fp)));
}
/* 上传前调用：给本机改过的条目打 updatedAt。返回打戳条数。 */
function stampSyncItemsForUpload(){
  const now = Date.now();
  let touched = 0;
  for(const f of SYNC_ARRAY_FIELDS){
    const arr = DATA[f];
    if(!Array.isArray(arr)) continue;
    for(const it of arr){
      if(!it || typeof it !== 'object') continue;
      const fp = _stampSyncItemFp(it);
      if(fp == null) continue;
      const key = _stampSyncItemKey(f, it, fp);
      const prev = _syncStampSnap.get(key);
      if(prev === undefined){ _syncStampSnap.set(key, fp); }        // 首次见到：只记快照
      else if(prev !== fp){ it.updatedAt = now; _syncStampSnap.set(key, fp); touched++; }
    }
  }
  return touched;
}
/* 云端合并写回后调用：用合并结果重建快照。
   否则云端版本与本机旧快照指纹不同 → 下次上传会把云端来的条目误打上本机时间戳，
   再传回另一端形成一轮无意义覆盖与「已合并 N 处」噪音。 */
function refreshSyncStampSnap(){
  _syncStampSnap.clear();
  for(const f of SYNC_ARRAY_FIELDS){
    const arr = DATA[f];
    if(!Array.isArray(arr)) continue;
    for(const it of arr){
      if(!it || typeof it !== 'object') continue;
      const fp = _stampSyncItemFp(it);
      if(fp == null) continue;
      _syncStampSnap.set(_stampSyncItemKey(f, it, fp), fp);
    }
  }
}

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
/* 受 resetEpoch 支配的「客观进度字段」：epoch 大者整组胜出（见 words.js resetWordProgress 注释）。
   ⚠️ hardWord / keyWord 不在内——主观标注，重置也不清，永远取「或」。
   ⚠️ cn / pos / ipa 属内容字段，无论 epoch 如何都按下方取优规则合并（重构不回退释义）。 */
const WORD_PROG_FIELDS = ['level','nextReview','lastReview','errTotal','errStreak','fuzzyStreak',
  'okStreak','shortCount','lastShortTouch','cleanRounds','cleared','hist','dh','dd'];   // design/77：dh/dd 随 resetEpoch 整组胜负
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
    // id/ts：合并基准是「云端副本」，云端若来自没有 id 的老快照会把本机 id 抹掉
    // （后果：词库页删除/勾选按 data-id 走 → 点了没反应）。缺则补，ts 取较晚。
    if(!ex.id && w.id){ ex.id = w.id; changed = true; }
    if(_num(w.ts) > _num(ex.ts)){ ex.ts = w.ts; changed = true; }
    const _eq = (f) => JSON.stringify(ex[f]) === JSON.stringify(w[f]);
    // ── 重置世代：谁更晚执行了「重置进度/重新导入」，谁的整组进度字段说了算 ──
    const lep = _num(w.resetEpoch), cep = _num(ex.resetEpoch);
    if(lep > cep){
      WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)){ ex[f] = w[f]; changed = true; } });
      if(ex.resetEpoch !== lep){ ex.resetEpoch = lep; changed = true; }
    } else if(cep > lep){
      // 对端重置得更晚：沿用云端这份进度（ex 本就是云端副本），勿用本机旧最大值回填
      WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)) changed = true; });
    } else {
    // ── 同世代（含双方都从未重置）──
    // design/84（9/22）：任一侧带 lastPracticeAt（练习写点戳的「最后练习时间」毫秒）→ 整组进度字段
    // （WORD_PROG_FIELDS 含 level/nextReview/okStreak/dh/dd/hist 等）按「最后练习者胜」，取代逐字段
    // max/later——答错造成的退步（okStreak 归零、nextReview 提前到明天、dh 缩短）才能传到另一端，
    // 复习调度不再偏乐观。双方都没有 lastPracticeAt（两台设备都从未在新版练过该词）→ 回退原口径。
    const _lpa = Number(w.lastPracticeAt) || 0, _epa = Number(ex.lastPracticeAt) || 0;
    if(_lpa || _epa){
      const winIsLocal = _lpa >= _epa;   // 最后练习者胜；相等=同一动作已同步，逐字段判变保幂等
      if(winIsLocal){
        WORD_PROG_FIELDS.forEach(f => { if(!_eq(f)){ ex[f] = w[f]; changed = true; } });
        if(!_eq('lastPracticeAt')){ ex.lastPracticeAt = w.lastPracticeAt; changed = true; }
      }
      // 云端更新：ex 本就是云端副本，勿用本机旧值回填（同 resetEpoch 分支口径）
    } else {
    // ── 原「单向取优」口径（老数据兜底：双方都无 lastPracticeAt）──
    const ns = Math.max(_num(ex.mcStreak), _num(w.mcStreak)); if(ns !== _num(ex.mcStreak)){ ex.mcStreak = ns; changed = true; }
    const ni = Math.max(_num(ex.mcInterval), _num(w.mcInterval)); if(ni !== _num(ex.mcInterval)){ ex.mcInterval = ni; changed = true; }
    const ne = Math.max(_num(ex.mcEase), _num(w.mcEase)); if(ne !== _num(ex.mcEase)){ ex.mcEase = ne; changed = true; }
    const nd = Math.min(_num(ex.mcDiff), _num(w.mcDiff)); if(nd !== _num(ex.mcDiff)){ ex.mcDiff = nd; changed = true; }
    const ndue = _later(ex.mcDue, w.mcDue); if(ndue !== (ex.mcDue||'')){ ex.mcDue = ndue; changed = true; }
    // ── v1.2 字段合并：level 取更高、间隔日期取更晚、计数取更大、布尔取或 ──
    const nl = Math.max(_num(ex.level)||0, _num(w.level)||0); if(nl !== (_num(ex.level)||0)){ ex.level = nl; changed = true; }
    const nrev = _later(ex.nextReview, w.nextReview); if(nrev !== (ex.nextReview||'')){ ex.nextReview = nrev; changed = true; }
    const nlrev = _later(ex.lastReview, w.lastReview); if(nlrev !== (ex.lastReview||'')){ ex.lastReview = nlrev; changed = true; }
    const net = Math.max(_num(ex.errTotal)||0, _num(w.errTotal)||0); if(net !== (_num(ex.errTotal)||0)){ ex.errTotal = net; changed = true; }
    const nest = Math.max(_num(ex.errStreak)||0, _num(w.errStreak)||0); if(nest !== (_num(ex.errStreak)||0)){ ex.errStreak = nest; changed = true; }
    const nfs = Math.max(_num(ex.fuzzyStreak)||0, _num(w.fuzzyStreak)||0); if(nfs !== (_num(ex.fuzzyStreak)||0)){ ex.fuzzyStreak = nfs; changed = true; }
    const nos = Math.max(_num(ex.okStreak)||0, _num(w.okStreak)||0); if(nos !== (_num(ex.okStreak)||0)){ ex.okStreak = nos; changed = true; }
    const ncleared = !!(ex.cleared || w.cleared); if(ncleared !== !!ex.cleared){ ex.cleared = ncleared; changed = true; }
    // 短线分散进度字段：必须随单词同步，否则另一端/云端旧数据会把本机刚积累的 shortCount 清零
    const nsc = Math.max(_num(ex.shortCount)||0, _num(w.shortCount)||0); if(nsc !== (_num(ex.shortCount)||0)){ ex.shortCount = nsc; changed = true; }
    const ncr = Math.max(_num(ex.cleanRounds)||0, _num(w.cleanRounds)||0); if(ncr !== (_num(ex.cleanRounds)||0)){ ex.cleanRounds = ncr; changed = true; }
    const nlst = _later(ex.lastShortTouch, w.lastShortTouch); if(nlst !== (ex.lastShortTouch||'')){ ex.lastShortTouch = nlst; changed = true; }
    // design/77 DHP：(dh,dd) 成对合并，整对取 dh 更大一侧（记忆更强侧）胜出；dh 相等 dd 取大。
    // 判变全走 (_num(x)||0) 口径防 undefined↔0 幻影（9/19 幻影物化教训）。
    const adh = _num(ex.dh)||0, bdh = _num(w.dh)||0;
    if(adh !== bdh){
      const win = (bdh > adh) ? w : ex;
      if((_num(ex.dh)||0) !== (_num(win.dh)||0)){ ex.dh = win.dh; changed = true; }
      if((_num(ex.dd)||0) !== (_num(win.dd)||0)){ ex.dd = win.dd; changed = true; }
    } else if((_num(ex.dd)||0) !== (_num(w.dd)||0)){
      ex.dd = Math.max(_num(ex.dd)||0, _num(w.dd)||0); changed = true;
    }
    // design/59 hist：同世代取「长者胜」，等长不动（幂等）；epoch 差异已由 WORD_PROG_FIELDS 整组覆盖
    const _wh = Array.isArray(w.hist) ? w.hist : null, _eh = Array.isArray(ex.hist) ? ex.hist : null;
    if(_wh && (!_eh || _wh.length > _eh.length)){ ex.hist = _wh.slice(); changed = true; }
    }   // 内层 else（老数据回退口径）闭合
    }
    // 主观标注：与「重置」无关（resetWordProgress 明确保留这两个），永远取「或」
    const nh = !!(ex.hardWord || w.hardWord); if(nh !== !!ex.hardWord){ ex.hardWord = nh; changed = true; }
    const nkey = !!(ex.keyWord || w.keyWord); if(nkey !== !!ex.keyWord){ ex.keyWord = nkey; changed = true; }
    // 内容字段：无论哪侧重置过都按取优规则合并——重置进度不应该连带回退刚补全好的释义/词性/音标
    const cn1 = (ex.cn||'').trim(), cn2 = (w.cn||'').trim();
    const ncn = (cn1 && cn2) ? (cn1.length >= cn2.length ? cn1 : cn2) : (cn1 || cn2);
    if(ncn !== (ex.cn||'').trim()){ ex.cn = ncn; changed = true; }   // 与 trim 后比较，避免首尾空格造成每次误判"更新"
    // pos/ipa 合并：本机刚 AI 补全的字段必须被保留，不能被云端空值覆盖
    const pos1 = (ex.pos||'').trim(), pos2 = (w.pos||'').trim();
    const npos = (pos1 && pos2) ? pos2 : (pos1 || pos2);
    if(npos !== (ex.pos||'').trim()){ ex.pos = npos; changed = true; }
    const ipa1 = (ex.ipa||'').trim(), ipa2 = (w.ipa||'').trim();
    const nipa = (ipa1 && ipa2) ? ipa2 : (ipa1 || ipa2);
    if(nipa !== (ex.ipa||'').trim()){ ex.ipa = nipa; changed = true; }
    if(changed) changes++;
  }
  // 云端独有词 = 真正新增
  for(const w of (cloud||[])){ if(w && w.en && !localSeen.has(String(w.en).toLowerCase())) changes++; }
  // ── 出口统一清洗（2026-09-06 晚）：cn 合并取「较长者」，而云端老脏 cn（混音标/词频/时间戳/例句）
  // 比本机洗净后的短 cn 长 → 每次拉云端合并都会把清洗结果回滚成脏数据（之之「叫你删你删了吗」根因）。
  // 在合并出口对全部词统一过 salvageWordCn（幂等，与 _cnCleanV1/V2 迁移同口径）：
  // 脏的洗净（音标抢救进 ipa、噪声丢弃），已干净的零改动；不碰 pos（词组 phrase. 由补全统一，别打架）。
  // data.js 未加载的页面自动跳过（typeof 守卫）。
  if(typeof window !== 'undefined' && typeof window.salvageWordCn === 'function'){
    for(const mw of map.values()){
      const cn0 = (typeof mw.cn === 'string') ? mw.cn : '';
      if(!cn0) continue;
      try{
        const r = window.salvageWordCn(cn0, mw.ipa, /\s/.test(String(mw.en || '')));
        if(r.cn !== cn0){ mw.cn = r.cn; changes++; }
        if(r.ipa && r.ipa !== String(mw.ipa || '').trim()){ mw.ipa = r.ipa; changes++; }
      }catch(_){}
    }
  }
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
/* 口语题库跨设备合并：以官方 SPEAKING_BANK 为基准（当前 9-12 月版 79 题），本机答案优先、云端补缺。
   1) 先用 mergeSpeakingKeepAnswers(local) 得到官方基准+本机答案（丢弃非官方题）
   2) 再按 id 把云端 speaking 的 answers 回填（云端有答案且本机无 → 取云端；都有 → 保留本机较新端）
   保证：跨设备恢复串题答案/练习记录，且不复活旧脏题库。 */
/* 口语答案按「小题」粒度合并。
   ⚠️ 9/18 之前这里的写法是「整份单向取本机」：
       if(official.answers) keep.answers = official.answers; else if(cloud.answers) keep.answers = cloud.answers;
     answers 的结构是 { 0:{text,ts,…}, 1:{…}, p2:{text,ts,p3:{…}} }，每个 key 是一条彼此独立的答案。
     于是「本机只要在任何一小题上写过一个字」就把整份 answers 判成「本机较新」，导致：
       ① 另一端在同一话题下的其它小题答案 / P2 答案 / P3 追问全被静默丢弃；
       ② 本机已有的小题永远收不到云端的更新（A 改了 q0 文本，B 永远停在旧值）。
     注意 speaking.js 的 spDraftSave 一直有在写 s.answers[qi].ts，合并函数却从没用过它。
   现在：两端独有的小题各自保留；同 key 比 ts，大者胜（ts 相同且内容不同 → 操作端优先）。 */
function _spAnsTs(a){ return Number(a && (a.ts || a.updatedAt || a.lastTs)) || 0; }
function _mergeSpeakingAnswers(localAns, cloudAns){
  const isObj = v => v && typeof v === 'object';
  if(!isObj(localAns)) return isObj(cloudAns) ? Object.assign({}, cloudAns) : undefined;
  if(!isObj(cloudAns)) return localAns;
  const out = Object.assign({}, cloudAns);        // 起点=云端：保证云端独有的小题不丢
  Object.keys(localAns).forEach(k => {
    const l = localAns[k], c = out[k];
    if(!isObj(l)) return;
    if(!isObj(c)){ out[k] = l; return; }          // 本机独有该小题
    const lt = _spAnsTs(l), ct = _spAnsTs(c);
    if(lt > ct) out[k] = l;                                                     // 本机较新
    else if(lt === ct && JSON.stringify(l) !== JSON.stringify(c)) out[k] = l;   // ts 相同内容不同：操作端优先
    // lt < ct：保留云端的较新版本（原实现这里会永久停在旧值）
  });
  return out;
}
function _mergeSpeaking(localSp, cloudSp){
  if(!Array.isArray(localSp) && !Array.isArray(cloudSp)) return { arr: [], changes: 0 };
  // 基准：官方题 + 本机答案
  let base = (typeof mergeSpeakingKeepAnswers === 'function')
    ? mergeSpeakingKeepAnswers(localSp || [])
    : (localSp || []);
  const cloudById = {};
  (cloudSp || []).forEach(s => { if(s && s.id) cloudById[s.id] = s; });
  let changes = 0;
  base = base.map(official => {
    const cloud = cloudById[official.id];
    if(!cloud) return official;
    const keep = Object.assign({}, official);
    // answers：按小题 key 粒度合并（原来是整份覆盖，会把另一端的答案整片抹掉）
    const beforeAns = JSON.stringify(keep.answers || null);
    const mergedAns = _mergeSpeakingAnswers(keep.answers, cloud.answers);
    if(mergedAns !== undefined) keep.answers = mergedAns;
    if(beforeAns !== JSON.stringify(keep.answers || null)) changes++;
    // 素材：按 id + ts 合并（原来也是「本机有就整份用本机」，另一端新建的素材一样收不到）
    const ls = Array.isArray(official.speakingStories) ? official.speakingStories : [];
    const cs = Array.isArray(cloud.speakingStories) ? cloud.speakingStories : [];
    if(ls.length || cs.length){
      const m = _mergeArray(ls, cs);
      keep.speakingStories = m.arr;
      changes += m.changes;
    }
    return keep;
  });
  return { arr: base, changes };
}

/* 阶段 5（design/11 §2.2）：weakness.daily 按日期 sum 合并（跨设备收敛到各设备当日之和，幂等）。
   键排序输出保证稳定，避免 JSON 比较抖动引发重复同步。 */
function _sdMergeDaily(a, b){
  var out = {};
  var seen = {};
  var keys = Object.keys(a || {}).concat(Object.keys(b || {}));
  keys.sort();
  keys.forEach(function(d){
    if(seen[d]) return; seen[d] = 1;
    out[d] = (Number((a || {})[d]) || 0) + (Number((b || {})[d]) || 0);
  });
  return out;
}

/* 背词「当日 session」合并（10/1 从 mergeData 内联块抽取：DATA.dailySession 与官方词库
   DATA.obank[bid].session 共用一套口径，防两边漂移）。
   返回 { v, changed }：changed = 云端带来变化（本机视角）。
   同 date 时取 passed 并集、queueOrder/planEn 以本机为准、total/stats/lastTouch 取较大者，
   保证在 A 设备背的词在 B 设备合并后仍然保留，而不是被 B 刚打开页面时产生的空 session 冲掉。 */
function _mergeWbSession(_ld, _cd){
  if(_ld && _cd){
    if(_ld.date !== _cd.date){
      const _win = (_ld.date > _cd.date) ? _ld : _cd;
      return { v: _win, changed: _win !== _ld };
    }
    const mergedSession = Object.assign({}, _ld);
    // 只有两端锁定的是同一轮词表（planEn 完全一致）时，才合并 passed 实现续背；
    // planEn 不同意味着不是同一轮，合并 passed 会把本机未背的词标记为已背，导致一打开就是 20/20。
    const _normPlan = arr => (arr || []).map(e => String(e).trim().toLowerCase()).sort().join('\u0001');
    const _samePlan = _normPlan(_ld.planEn) && _normPlan(_ld.planEn) === _normPlan(_cd.planEn);
    const passedSet = _samePlan
      ? new Set([...(_ld.passed || []), ...(_cd.passed || [])])
      : new Set(_ld.passed || []);
    mergedSession.passed = Array.from(passedSet);
    mergedSession.total = Math.max(_ld.total || 0, _cd.total || 0);
    mergedSession.stats = {
      known: Math.max(((_ld.stats && _ld.stats.known) || 0), ((_cd.stats && _cd.stats.known) || 0)),
      unknown: Math.max(((_ld.stats && _ld.stats.unknown) || 0), ((_cd.stats && _cd.stats.unknown) || 0))
    };
    mergedSession.lastTouch = Math.max(_ld.lastTouch || 0, _cd.lastTouch || 0);
    mergedSession.sessionStart = Math.min(_ld.sessionStart || Date.now(), _cd.sessionStart || Date.now());
    // planEn / queueOrder：本机已锁定的轮次计划优先；本机没有才取云端
    mergedSession.planEn = (_ld.planEn && _ld.planEn.length) ? _ld.planEn : (_cd.planEn || []);
    mergedSession.queueOrder = (_ld.queueOrder && _ld.queueOrder.length) ? _ld.queueOrder : (_cd.queueOrder || []);
    // currentEn：取 lastTouch 较新的一侧；都不新则保持本机
    mergedSession.currentEn = (_ld.lastTouch || 0) >= (_cd.lastTouch || 0) ? _ld.currentEn : _cd.currentEn;
    // finished：仅当两端都结束才算结束，避免一端空 session 让本轮提前结束
    mergedSession.finished = !!_ld.finished && !!_cd.finished;
    return { v: mergedSession, changed: JSON.stringify(mergedSession) !== JSON.stringify(_ld) };
  }
  if(_cd && !_ld) return { v: _cd, changed: true };
  return { v: _ld || null, changed: false };
}

function mergeData(local, cloud){
  cloud = cloud || {};
  // 写作模板(writing)是官方共享题集，不进同步，合并时强制忽略云端版本，永远以本机默认模板为准。
  // 口语题库(speaking)【已纳入同步】：不在此删除，函数末尾按 id 双向合并 answers（见下方 _mergeSpeaking）。
  cloud = Object.assign({}, cloud);
  delete cloud.writing;
  const out = Object.assign({}, local);
  const deleted = new Set([...(local.deletedIds||[]), ...(cloud.deletedIds||[])]);
  // 单词「加回来」的反向墓碑：deleted \ revived（见 clearWordTombstone 说明）
  const revivedWords = new Set([...(local.revivedIds||[]), ...(cloud.revivedIds||[])]);
  revivedWords.forEach(k => deleted.delete(k));
  const deletedWrong = new Set([...(local.deletedWrongKeys||[]), ...(cloud.deletedWrongKeys||[])]);  // 错句级墓碑（合并传播）
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
  // 错句级墓碑落地：合并 dictationLogs 后，真正移除属于墓碑的 mistake 子项（含云端带回的旧 mistake），并丢弃变空的 log，使数据自洽
  if(out.dictationLogs && deletedWrong.size){
    out.dictationLogs = out.dictationLogs.map(log => {
      if(!Array.isArray(log.mistakes)) return log;
      log.mistakes = log.mistakes.filter(mm =>
        !deletedWrong.has((log.sourceId||'') + '|' + (mm.right||'').trim().toLowerCase() + '|' + (mm.wrong||'').trim().toLowerCase()));
      return log;
    }).filter(log => (log.mistakes||[]).length > 0);
  }
  // 万能素材：素材卡按 id 并集；persona/gaps/answers 云端非空取云端（素材自有 deletedIds 墓碑，不叠加全局过滤）
  const mt = _mergeMaterials(local.materials, cloud.materials); out.materials = mt.data; changes += mt.changes;
  // 进行中计时（单一可信源合并）：以 timerId 为生命周期锚点
  //   规则：ended 优先（任一侧 ended → 结果 ended，防双端各自结束叠加）；
  //        同 timerId 进行中 → 心跳 lastBeat 较新者胜（owner 在线续租，另一端看到最新）；
  //        不同 timerId（一端开新计时、另一端旧计时）→ 进行中且未 ended 者优先，都进行中则 lastBeat 新者胜。
  const at = _mergeActiveTimer(local.activeTimer, cloud.activeTimer);
  if(JSON.stringify(at) !== JSON.stringify(local.activeTimer || null)){ out.activeTimer = at; changes++; }
  // 设置白名单：字段级「较新者胜」——对比本机与云端各自的 _fieldTs 时间戳，取更晚保存的一侧。
  // 根治经典 bug：本机刚填的发音分等同步字段，被 10 秒轮询拉到的云端旧值覆盖（"去别的模块回来设置又没了"）。
  // 注：relayToken（AI Key）自 design/62 起已彻底不进同步（上传剥离 + 服务端剥离 + 不在下方白名单），
  //     它只存本机并由 CREDS_KEY 凭证镜像兜底恢复，这里的字段级合并与它无关。
  // 时间戳缺失时回退旧逻辑：云端非空且不同→取云端（兼容早期无 _fieldTs 的云端数据）。
  const ls = local.settings || {}; const cs = cloud.settings || {};
  out.settings = Object.assign({}, ls);
  const lTs = ls._fieldTs || {}; const cTs = cs._fieldTs || {};
  out.settings._fieldTs = Object.assign({}, lTs);
  // 空值判定：null/undefined/空串/空数组/空对象 视为「未填」；未填值绝不覆盖另一侧已填值。
  // 这是「几分钟就清空 Key」死亡循环的关键防御：云端哪怕带更新的时间戳，只要是空值就永不冲掉本机已填的 Key/分数。
  const _isEmpty = v => v == null || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
  // targets 全 0 = 语义上的「未设置」（默认值就是全 0，表单留空保存出来就是全 0）：
  // 绝不能凭「本机时间戳较新」压过云端真值，否则换设备登录目标分必丢（之之 9/6 反馈，S2 复现）。
  const _fieldEmpty = (f, v) => {
    if(_isEmpty(v)) return true;
    if(f === 'targets' && v && typeof v === 'object' && !Array.isArray(v)){
      const ks = Object.keys(v);
      return ks.length === 0 || ks.every(k => !_num(v[k]));   // 全 0 / 全空
    }
    return false;
  };
  for(const f of SYNC_SETTINGS_FIELDS){
    const lEmpty = _fieldEmpty(f, ls[f]);
    const cEmpty = _fieldEmpty(f, cs[f]);
    const cl = (lTs[f] != null) ? lTs[f] : 0;
    const cc = (cTs[f] != null) ? cTs[f] : 0;
    if(cEmpty) continue;                       // 云端未填：永不覆盖本机（无论本机是否填写）
    if(lEmpty){                                 // 本机未填、云端有值 → 取云端（含云端时间戳）
      out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; continue;
    }
    // 两端都已填：较新者胜；时间戳相同则取云端（保留恢复能力），仅值不同才计为合并应用
    if(cc > cl){ out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; }
    else if(cl > cc){ /* 本机较新：保持本机，无需操作 */ }
    else if(JSON.stringify(cs[f]) !== JSON.stringify(ls[f])){ out.settings[f] = cs[f]; out.settings._fieldTs[f] = cc; changes++; }
  }
  // 口语题库(speaking)按 id 双向合并：以官方 SPEAKING_BANK 为基准建库（题数以数组实际为准），
  // 本机与云端同 id 题的 answers/练习记录取「较新一侧」（按 _lastSaved 时间戳或内容非空判断），题干永远用官方。
  // 这样既跨设备恢复串题答案，又不会因早期脏题库复活成 100+ 题（mergeSpeakingKeepAnswers 已保证非官方题丢弃）。
  if(Array.isArray(cloud.speaking) || Array.isArray(local.speaking)){
    const ms = _mergeSpeaking(local.speaking, cloud.speaking);
    out.speaking = ms.arr;
    changes += ms.changes;
  }
  out.deletedIds = Array.from(deleted);
  out.revivedIds = Array.from(revivedWords);   // 反向墓碑随合并传播（与 deletedIds 同口径 union）
  out.deletedWrongKeys = Array.from(deletedWrong);   // 错句级墓碑随合并传播
  // 10/3 AI 陪练长期记忆 coachMem：跨设备按 text 并集（同文本保留较新 t），按时间升序、上限 40。
  // 不用 settings 字段级「较新整份胜」——两端各自追加事实时并集才不丢（e02adc05 铁律：新字段必须在此登记，否则云端那份被整份丢弃）。
  if(Array.isArray(cloud.coachMem)){
    const _normMem = x => (x && typeof x.text === 'string' && x.text.trim())
      ? { t: Number(x.t) || 0, text: String(x.text).trim().slice(0, 80) } : null;
    const _lm = (local.coachMem || []).map(_normMem).filter(Boolean);
    const _cm = (cloud.coachMem || []).map(_normMem).filter(Boolean);
    const _by = new Map();
    _lm.concat(_cm).forEach(x => { const ex = _by.get(x.text); if(!ex || x.t > ex.t) _by.set(x.text, x); });
    const _merged = Array.from(_by.values()).sort((a, b) => a.t - b.t).slice(-40);
    if(JSON.stringify(_merged) !== JSON.stringify(_lm)){ out.coachMem = _merged; changes++; }
  }
  // 当日背词会话（dailySession）：跨设备合并，杜绝云端旧/空会话覆盖本地新进度。
  // 10/1：逻辑抽到 _mergeWbSession（官方词库 obank session 共用同一套），行为逐字保留。
  const _msess = _mergeWbSession(local.dailySession, cloud.dailySession);
  if(_msess.changed && JSON.stringify(_msess.v) !== JSON.stringify(local.dailySession || null)){
    out.dailySession = _msess.v; changes++;
  }
  // 今日背词进度跨设备合并（修复：网页端练了 50 个，手机端「今日已练」仍显示 0）
  // wordSeenToday / wordPracticedToday：同日取 unique 词集合并集（该集合长度即展示值）；wordDayStats：按天取 max
  {
    const _tk = todayKey();
    // ⭐ 9/26 修：wordPracticedToday（9/25 新增的「答一个记一个」，就是首页/背词页的「今日已背」）
    // 此前根本没进合并分支，而 mergeData 的语义是「未显式处理的字段一律以本机为准」→ 云端那份
    // 被整份丢弃、本机永远赢 → 两端各自守着自己的数字互不收敛（实测同时刻 26 vs 200，差的就是它）。
    // 抽成闭包两处共用，避免以后再加「当日 xxx 词集合」时又漏一次。
    const _mergeTodayWordSet = (key) => {
      const lt = local[key], ct = cloud[key];
      let merged = null;
      if(lt && ct){
        if(lt.date === _tk && ct.date === _tk){
          merged = { date: _tk, words: Array.from(new Set([...(lt.words || []), ...(ct.words || [])])) };
        } else if(lt.date === _tk){ merged = lt; }
        else if(ct.date === _tk){ merged = ct; }
      } else if(lt || ct){
        const _only = lt || ct;
        merged = (_only.date === _tk) ? _only : null;   // 非今日的旧记录不回填（本机下次 getTodaySeen 会重置）
      }
      if(merged && JSON.stringify(merged) !== JSON.stringify(local[key] || null)){
        out[key] = merged; changes++;
      }
    };
    _mergeTodayWordSet('wordSeenToday');
    _mergeTodayWordSet('wordPracticedToday');
    /* 当日错词 dailyWrong = { [dateKey]: [en] }：同上也从未进过合并分支
       （9/26 补）——另一端今天答错的词在「今日错词/重练」里永远不出现。
       按天逐 key 取 unique 并集；空的日期不写，避免往云端塞空对象。 */
    {
      const lw = (local.dailyWrong && typeof local.dailyWrong === 'object') ? local.dailyWrong : {};
      const cw = (cloud.dailyWrong && typeof cloud.dailyWrong === 'object') ? cloud.dailyWrong : {};
      const _mergedWrong = {};
      for(const k of new Set([...Object.keys(lw), ...Object.keys(cw)])){
        const u = Array.from(new Set([...(lw[k] || []), ...(cw[k] || [])]));
        if(u.length) _mergedWrong[k] = u;
      }
      if(JSON.stringify(_mergedWrong) !== JSON.stringify(lw)){ out.dailyWrong = _mergedWrong; changes++; }
    }
    const lds = local.wordDayStats || {}, cds = cloud.wordDayStats || {};
    const _allKeys = new Set([...Object.keys(lds), ...Object.keys(cds)]);
    const _mergedStats = {};
    for(const _k of _allKeys){
      const _a = lds[_k] || { totalWords:0, totalMs:0, sessions:0 };
      const _b = cds[_k] || { totalWords:0, totalMs:0, sessions:0 };
      // 关键：用 max 而非 sum —— 云端已含本机上次上传的贡献，重复同步若求和会把本机部分再加一遍导致虚高；
      // max 幂等（max(max(a,b),a)=max(a,b)），永不重复累加，跨设备收敛到「单设备当日最大值」。
      // 「今日已练」主数字走 wordSeenToday 并集（已正确），此处 dayStats 为次级明细，取 max 最稳妥。
      _mergedStats[_k] = {
        totalWords: Math.max(_a.totalWords || 0, _b.totalWords || 0),
        totalMs: Math.max(_a.totalMs || 0, _b.totalMs || 0),
        sessions: Math.max(_a.sessions || 0, _b.sessions || 0)
      };
    }
    if(JSON.stringify(_mergedStats) !== JSON.stringify(local.wordDayStats || {})){
      out.wordDayStats = _mergedStats; changes++;
    }
  }
  /* ── 官方词库进度云同步（10/1 她拍板「背词进度纳入云同步」，Task #25）──
     DATA.obank = { [bankId]: { prog, session, seen, practiced } }，镜像自 wordbank.js 的独立
     localStorage（ielts_hub_obank_v1）。只同步进度四件套；词库本体（静态 json / wrong / dayStats）
     永不上云。合并口径：
     - prog：逐词取 (lastPracticeAt || ts) 更晚一侧（与 _mergeWords design/84「最后练习者胜」同源；
       词库页重置进度会给每个词打新 ts 基准 → 重置结果不会被另一端旧进度复活）；
       同刻视为同一动作已同步，内容相同不计变化（幂等）。
     - seen / practiced：{date,words} 同日 unique 并集、异日取晚（与 wordSeenToday 同思路）。
     - session：_mergeWbSession（与 dailySession 同一套口径）。 */
  {
    const lob = (local.obank && typeof local.obank === 'object') ? local.obank : {};
    const cob = (cloud.obank && typeof cloud.obank === 'object') ? cloud.obank : {};
    if(Object.keys(lob).length || Object.keys(cob).length){
      const _pk = p => (Number(p && (p.lastPracticeAt || p.ts)) || 0);
      const _daySet = (l, c) => {
        if(l && c) return (l.date === c.date)
          ? { date: l.date, words: Array.from(new Set([...(l.words || []), ...(c.words || [])])) }
          : ((String(l.date || '') >= String(c.date || '')) ? l : c);
        return l || c || { date: '', words: [] };
      };
      const _obOut = {};
      let _obCh = 0;
      const _bankIds = Array.from(new Set([...Object.keys(lob), ...Object.keys(cob)]));
      for(const bid of _bankIds){
        const lb = (lob[bid] && typeof lob[bid] === 'object') ? lob[bid] : {};
        const cb = (cob[bid] && typeof cob[bid] === 'object') ? cob[bid] : {};
        const lp = (lb.prog && typeof lb.prog === 'object') ? lb.prog : {};
        const cp = (cb.prog && typeof cb.prog === 'object') ? cb.prog : {};
        const mp = Object.assign({}, cp);   // 起点云端副本：云端独有词天然保留
        for(const k in lp){
          if(!Object.prototype.hasOwnProperty.call(lp, k)) continue;
          const a = lp[k], b = mp[k];
          if(!b || typeof b !== 'object'){ mp[k] = a; _obCh++; continue; }   // 本机独有词条
          const ka = _pk(a), kb = _pk(b);
          if(ka > kb){ mp[k] = a; _obCh++; }   // 本机练习得更晚：本机胜（含答错造成的退步）
        }
        const _s = _daySet(lb.seen, cb.seen);
        const _pr = _daySet(lb.practiced, cb.practiced);
        const _sess = _mergeWbSession(lb.session || null, cb.session || null);
        const mb = { prog: mp, seen: _s, practiced: _pr, session: _sess.v };
        if(JSON.stringify(_s) !== JSON.stringify(lb.seen || null)) _obCh++;
        if(JSON.stringify(_pr) !== JSON.stringify(lb.practiced || null)) _obCh++;
        if(_sess.changed) _obCh++;
        _obOut[bid] = mb;
      }
      // 终闸：合并结果与本机完全一致就不写（防自回声噪音与无谓 PUT）
      if(JSON.stringify(_obOut) !== JSON.stringify(lob)){ out.obank = _obOut; changes += _obCh; }
    }
  }
  /* 句型闯关（patternDrill）跨设备合并（2026-09-09 修复：云端拉取时整份丢弃 +
     手机端任意操作全量上传会把云端进度/我的句型库冲掉——移动端「练习页进度没了」根因）。
     规则：items 按条目 id 取「更进步」一侧（mastered > 未掌握；level 大者胜；同级 updated 新者胜；
     pending 标记做 OR 保留，下次判对自动清除）；custom[] 按 id 并集（同 id 留本机）；
     mockSynced[] 签名并集（同步去重，永不重复导入）；weakness 按 focus 合并
     （wrongCount 取 max 幂等防重复同步累加、lastWrongAt 取较新，design/07 §5.4）。 */
  if(cloud.patternDrill && typeof cloud.patternDrill === 'object'){
    const _pdRank = s => (s && s.status === 'mastered') ? 1 : 0;
    const _pdItems = Object.assign({}, (local.patternDrill && local.patternDrill.items) || {});
    let _pdCh = 0;
    const _cItems = cloud.patternDrill.items || {};
    for(const id in _cItems){
      const a = _pdItems[id], b = _cItems[id];
      if(!b || typeof b !== 'object') continue;
      if(!a){ _pdItems[id] = b; _pdCh++; continue; }
      let win;
      const ra = _pdRank(a), rb = _pdRank(b);
      if(ra !== rb) win = (ra > rb) ? a : b;
      else {
        const la = a.level || 0, lb = b.level || 0;
        if(la !== lb) win = (la > lb) ? a : b;
        else win = (String(a.updated || '') >= String(b.updated || '')) ? a : b;
      }
      if(win !== a){
        _pdItems[id] = win; _pdCh++;
      }
      if((a.pending || b.pending) && !_pdItems[id].pending){ _pdItems[id] = Object.assign({}, _pdItems[id], { pending: true }); _pdCh++; }
    }
    const _pdOut = Object.assign({}, local.patternDrill || {}, { items: _pdItems });
    // custom：按 id 并集（同 id 留本机）；mockSynced：签名并集
    const _lc = Array.isArray(local.patternDrill && local.patternDrill.custom) ? local.patternDrill.custom.slice() : [];
    const _cc = Array.isArray(cloud.patternDrill.custom) ? cloud.patternDrill.custom : [];
    const _ids = new Set(_lc.map(x => x && x.id));
    _cc.forEach(x => { if(x && x.id != null && !_ids.has(x.id)){ _lc.push(x); _pdCh++; } });
    _pdOut.custom = _lc;
    const _ms = Array.from(new Set([
      ...((Array.isArray(local.patternDrill && local.patternDrill.mockSynced)) ? local.patternDrill.mockSynced : []),
      ...((Array.isArray(cloud.patternDrill.mockSynced)) ? cloud.patternDrill.mockSynced : [])
    ]));
    if(_ms.length !== ((local.patternDrill && local.patternDrill.mockSynced) || []).length) _pdCh++;
    _pdOut.mockSynced = _ms;
    // weakness（design/07 §5.4）：按 focus 合并；wrongCount 取 max 不取 sum（幂等——云端已含本机
    // 上次上传的贡献，sum 在重复同步时反复累加虚高），lastWrongAt 取较新。
    // 不显式处理会被上方 Object.assign({}, local.patternDrill) 起步的 _pdOut 整份丢弃云端那份。
    const _lw = (local.patternDrill && local.patternDrill.weakness) || {};
    const _cw = (cloud.patternDrill && cloud.patternDrill.weakness) || {};
    const _mw = {};
    let _wCh = 0;
    Array.from(new Set([...Object.keys(_lw), ...Object.keys(_cw)])).forEach(k => {
      const a = _lw[k] || {}, b = _cw[k] || {};
      const wc = Math.max(Number(a.wrongCount) || 0, Number(b.wrongCount) || 0);
      const lwa = String(a.lastWrongAt || '') >= String(b.lastWrongAt || '') ? (a.lastWrongAt || '') : (b.lastWrongAt || '');
      const md = _sdMergeDaily(a.daily, b.daily);
      _mw[k] = { wrongCount: wc, lastWrongAt: lwa, daily: md };
      if((Number(a.wrongCount) || 0) !== wc || String(a.lastWrongAt || '') !== lwa) _wCh++;
      // daily 跨设备收敛：合并结果任一侧不等 → 计变化并上传，否则下次同步仍不一致
      if(JSON.stringify(md) !== JSON.stringify(a.daily || {}) || JSON.stringify(md) !== JSON.stringify(b.daily || {})) _wCh++;
    });
    if(Object.keys(_lw).length !== Object.keys(_mw).length) _wCh++;
    _pdOut.weakness = _mw;
    _pdCh += _wCh;
    // design/16：句型页进度 patternDrill.sentences = { status: { [句型id]: {st, ts} } }——
    // 按 ts 新者胜（两端同 id 各有状态时取 ts 大的一侧；单侧有则取有的一侧），幂等不累加。
    // design/17：sentences.replay = { [catId]: ts }（拼接验证已做标记）同款按 ts 新者胜。
    const _lss = (local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.status) || {};
    const _css = (cloud.patternDrill && cloud.patternDrill.sentences && cloud.patternDrill.sentences.status) || {};
    const _mss = {};
    Array.from(new Set([...Object.keys(_lss), ...Object.keys(_css)])).forEach(id => {
      const a = _lss[id], b = _css[id];
      if(a && b) _mss[id] = ((Number(b.ts) || 0) > (Number(a.ts) || 0)) ? b : a;
      else _mss[id] = a || b;
    });
    const _lsr = (local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.replay) || {};
    const _csr = (cloud.patternDrill && cloud.patternDrill.sentences && cloud.patternDrill.sentences.replay) || {};
    const _msr = {};
    Array.from(new Set([...Object.keys(_lsr), ...Object.keys(_csr)])).forEach(id => {
      const a = _lsr[id], b = _csr[id];
      _msr[id] = (a && b) ? Math.max(Number(a) || 0, Number(b) || 0) : (a || b);
    });
    /* 10/1 她拍板：「我的语法错题」整模块下线（诊断收录按钮 + 练习分组 + 数据读写全删）。
       sentences.custom 不再参与合并，且合并时强制清空——本地与云端的存量错题随下一次同步整体洗掉。
       （原 design/77 的按 id 并集 + 墓碑 + key 去重逻辑随之退役。） */
    const _hadCustom = ((local.patternDrill && local.patternDrill.sentences && local.patternDrill.sentences.custom) || []).length;
    if(JSON.stringify(_mss) !== JSON.stringify(_lss) || JSON.stringify(_msr) !== JSON.stringify(_lsr)
       || _hadCustom){
      _pdOut.sentences = Object.assign({}, (local.patternDrill && local.patternDrill.sentences) || {},
        { status: _mss, replay: _msr, custom: [] });
      _pdCh++;
    }
    if(_pdCh){ out.patternDrill = _pdOut; changes += _pdCh; }
  }
  /* design/19：素材集配置 materialSets = { active, topic, enabled, sets:{ [setId]:{topics:[...]} }, updatedAt }
     规则（与 patternDrill.sentences 同款思路，幂等不累加）：
     ① 整体按 updatedAt 新者胜；② sets 逐 id 合并（同 id 时集内 topics 再逐 id 合并：
        lastPracticedAt 取较大、slots 取并集「后者补缺」）；③ 内置集(builtin)永远由本地 JSON 播种，
        合并只是补 lastPracticedAt，不让云端旧快照把本机内置集改回旧版。 */
  if(cloud.materialSets && typeof cloud.materialSets === 'object'){
    const _lm = (local.materialSets && typeof local.materialSets === 'object') ? local.materialSets : {};
    const _cm = cloud.materialSets;
    const _lTs = Number(_lm.updatedAt) || 0, _cTs = Number(_cm.updatedAt) || 0;
    const _win = (_cTs > _lTs) ? _cm : _lm, _lose = (_cTs > _lTs) ? _lm : _cm;
    const _sets = Object.assign({}, (_win.sets || {}));
    Object.keys(_lose.sets || {}).forEach(k => {
      const a = _sets[k], b = _lose.sets[k];
      if(!b || typeof b !== 'object') return;
      if(!a){ _sets[k] = b; return; }
      const map = new Map();
      [...(a.topics || []), ...(b.topics || [])].forEach(t => {
        if(!t || t.id == null) return;
        const ex = map.get(t.id);
        if(!ex){ map.set(t.id, t); return; }
        map.set(t.id, Object.assign({}, ex, t, {
          slots: Object.assign({}, (ex.slots || {}), (t.slots || {})),
          lastPracticedAt: Math.max(Number(ex.lastPracticedAt) || 0, Number(t.lastPracticedAt) || 0)
        }));
      });
      _sets[k] = Object.assign({}, a, b, { topics: Array.from(map.values()),
        updatedAt: Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0) });
    });
    const _act = [(_win.active), (_lose.active)].find(x => x && _sets[x]) || Object.keys(_sets)[0] || 'builtin_demo';
    const _outMs = {
      active: _act,
      topic: _win.topic || _lose.topic || '',
      enabled: (typeof _win.enabled === 'boolean') ? _win.enabled : true,
      sets: _sets,
      updatedAt: Math.max(_lTs, _cTs)
    };
    if(JSON.stringify(_outMs) !== JSON.stringify(_lm)){ out.materialSets = _outMs; changes++; }
  }
  // 合并后同步镜像账号凭证到隔离键（云端可能带来/更新 Key/手机号/发音分，务必落盘镜像）
  if(typeof saveCredsMirror === 'function') saveCredsMirror();
  return { data: out, changes };
}

/* plans 嵌套合并：外层按 date，内层 items 按 id 并集、done 冲突取 true */
/* design/84 任务同步修正（9/22）：
   ① 同 id item：双方都有 updatedAt（毫秒，勾选/取消/改名/新增时由 plans.js 写点统一戳）→ 新者整项胜，
      修复「勾选只能 true 永远回不去 false」「编辑任务名不同步」两个单向合并硬伤；
      任一侧缺 updatedAt（老数据）→ 回退旧口径（done 单向或、text 不动），保证旧快照平滑过渡。
   ② 同 date 内 text 归一去重 + fromId 归并：两台设备同一天各自「自动延续」（各发新 uid）/各自 fillDay
      /各自 AI 安排产生的重复条目，合并时按 fromId（延续来源 id）或归一 text 去重，保留 updatedAt 新者。 */
function _mergePlans(local, cloud, deleted){
  local = Array.isArray(local) ? local : []; cloud = Array.isArray(cloud) ? cloud : [];
  const byDate = new Map(); let changes = 0;
  // 9/25 修：本机同日双对象不再「后者整吞前者」——原 byDate.set 后写覆盖前写，
  // 会把先到对象（可能含用户刚勾的条目）连壳丢掉。现条目并入先到对象（按 id 去重）。
  local.forEach(p => {
    if(!p || !p.date) return;
    const ex = byDate.get(p.date);
    if(!ex){ byDate.set(p.date, p); return; }
    const seenIds = new Set((ex.items || []).map(i => i && i.id));
    (p.items || []).forEach(it => {
      if(!it || it.id == null || seenIds.has(it.id)) return;
      ex.items.push(it); seenIds.add(it.id); changes++;
    });
  });
  cloud.forEach(p => {
    const ex = byDate.get(p.date);
    if(!ex){ byDate.set(p.date, p); changes++; return; }
    const seen = new Set(ex.items.map(i => i.id));
    (p.items||[]).forEach(it => {
      if(!it || it.id == null) return;
      if(!seen.has(it.id)){ ex.items.push(it); seen.add(it.id); changes++; return; }
      const mine = ex.items.find(i => i.id === it.id);
      const mt = Number(mine.updatedAt) || 0, ct = Number(it.updatedAt) || 0;
      if(mt && ct){
        // 双方都有时间戳：新者整项胜（含 done/text/updatedAt 全字段）；相等 = 同一动作已同步，不动（幂等）
        if(ct > mt){ ex.items[ex.items.indexOf(mine)] = it; changes++; }
      } else if(!mt && ct){
        // 9/25 修：本机已勾选但条目无时间戳（老数据/旧版首页勾选）时，绝不被云端「未勾版」冲掉——
        // 勾选是用户动作，进度不因合并倒退；其余字段仍以云端（另一端更新过）为准。
        if(!(mine.done && !it.done)){
          ex.items[ex.items.indexOf(mine)] = it;       // 仅云端有：云端是更新过的客户端，胜
          changes++;
        }
      } else if(!mt && !ct){
        // 双方都是老数据（从未被新写点动过）：回退旧口径（done 单向或、text 不动）
        if(it.done && !mine.done){ mine.done = true; changes++; }
      }
      // mt && !ct：仅本机有 → 本机胜，不动
    });
  });
  for(const p of byDate.values()){
    if(p.items && deleted){ p.items = p.items.filter(it => !deleted.has(it.id)); }
    if(Array.isArray(p.items) && p.items.length > 1){
      const seen = new Map(); const kept = []; let deduped = false;
      p.items.forEach(it => {
        if(!it) return;
        // 9/23 她拍板：同名任务她就是要重复做（同一天排两条「听力 第2篇」），text 去重会把
        // 手动/AI 加的重复条目在跨端同步时吞掉 → 去掉 text 去重，只保留 fromId 去重——
        // 9/25 修：fromId 去重键不再含 done 态。原「f:id+d/o 分键」会让同一来源的两个副本
        // 在勾选态分歧后永久共存（两端各留一条，越合越多）；现统一收敛为 1 条，
        // updatedAt 新者胜；等值时勾选态优先（进度不倒退）。
        const k1 = (it.fromId != null) ? 'f:' + it.fromId : null;
        const hit = (k1 && seen.has(k1)) ? seen.get(k1) : null;
        if(hit){
          deduped = true;
          const ht = Number(hit.updatedAt) || 0, nt = Number(it.updatedAt) || 0;
          if(nt > ht || (nt === ht && it.done && !hit.done)){ kept[kept.indexOf(hit)] = it; seen.set(k1, it); }
          return;
        }
        kept.push(it);
        if(k1) seen.set(k1, it);
      });
      if(deduped){ p.items = kept; changes++; }
    }
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
    _mergeDetailBitsInto(local, cloud, out);   // v7.2：细节碎片库跨设备并集（epoch 重生成也不丢碎片）
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
  // 答案本机优先（与上方 epoch 分支对齐）：云端旧快照不应覆盖用户刚在本机改的内容
  out.answers = Object.assign({}, cloud.answers||{}, local.answers||{});
  _mergeDetailBitsInto(local, cloud, out);   // v7.2：细节碎片库跨设备并集
  const changes = Math.max(0, out.materials.length - (local.materials||[]).length);
  return { data: out, changes };
}
/* v7.2 细节碎片库（DATA.materials.detailBits）跨设备合并：按 id 并集（无 id 用内容哈希），
   同 id 取 ts 较新者；单侧缺失照常并另一侧——她补的/AI 代补的细节不因重生成或换设备丢失 */
function _mergeDetailBitsInto(local, cloud, out){
  const dbL = Array.isArray(local.detailBits) ? local.detailBits : [];
  const dbC = Array.isArray(cloud.detailBits) ? cloud.detailBits : [];
  if(!dbL.length && !dbC.length) return;
  const map = new Map();
  const put = b => {
    if(!b || (!String(b.en||'').trim() && !String(b.zh||'').trim())) return;
    const k = b.id || ('t' + hashStr(String(b.en||'').trim() + '|' + String(b.zh||'').trim()));
    const prev = map.get(k);
    if(!prev || _num(b.ts) >= _num(prev.ts)) map.set(k, b);
  };
  dbL.forEach(put); dbC.forEach(put);
  out.detailBits = Array.from(map.values());
}
/* 分类名防御性清洗：去掉「（xxx）」「(xxx)」等括号及括号内后缀（如「观点型（第一优先级）」→「观点型」）。
   上移到 common.js：错句本等不引入 writing.js 的页面也需要用到，避免 ReferenceError 导致整页渲染中断。 */
function cleanCatName(c){
  if(!c) return c;
  return c.replace(/[（(][^）)]*[）)]/g, '').trim();
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
/* ⭐ 9/30 轮询改用「廉价探测」替代「整份下载」：
 * 服务端新增 meta 影子键（约 200B：ts / bytes / hash）。轮询先问 meta，
 * 哈希没变就直接回来 —— 不搬运那份 1.7MB、不跑 mergeData、不打扰 UI。
 * 只有真的变了才走 cloudDownload 的原合并链路。
 * ⚠️ 服务端还是旧版时会把 ?meta=1 当普通 GET（回整份）—— meta.hash 取不到 → 自动退回全量，
 *    功能不受影响，只是省不了流量。升级部署自然生效，无需开关。 */
async function cloudPollOnce(){
  if(!DATA.settings.autoSync || !DATA.settings.syncCode) return false;
  if(!authToken()) return false;   // 未登录/已过期：轮询静默退出（401 提示由手动同步与上传链路给出）
  try{
    const [res, meta] = await syncApi('GET', null, '?meta=1');
    if(res.status === 401){ setAuthToken(''); syncSetStatus('登录已过期，请重新登录', 'error'); renderSyncState(); return false; }
    if(res.status === 404){ _maybePublishLocal(true, null); return false; }
    if(!res.ok) return false;
    // 服务端还是旧版时不认 ?meta=1，会直接回整份：那就自己算哈希去重，别白下去再拉一次
    if(meta && meta.data){
      if(meta.ts) _cloudBaseTs = Number(meta.ts) || _cloudBaseTs;
      const _ch = hashData(meta.data);
      if(_ch === _lastCloudHash || _ch === _lastUploadedCloudHash){ _lastCloudHash = _ch; return true; }
      return await cloudDownload(true);
    }
    if(meta && meta.hash && meta.hash === _lastCloudHash) return true;   // 最常见：零下载
    return await cloudDownload(true);
  }catch(e){ return false; }
}
let _pollSoonTimer = null;
function _cloudPollSoon(){
  if(_pollSoonTimer) clearTimeout(_pollSoonTimer);
  _pollSoonTimer = setTimeout(function(){ try{ cloudPollOnce(); }catch(e){} }, 250);
}

async function cloudDownload(silent){
  const phone = DATA.settings.syncCode;
  if(!phone){ if(!silent) toast('请先登录（设置 → 云端同步）'); return false; }
  if(!authToken()){ if(!silent) toast('登录已过期，请到「设置 → 云端同步」重新登录'); return false; }
  /* 10/5 14:52：显示"正在同步"转圈（她要的行为）。⛔ 只在**首屏那次**拉取显示 ——
     12s 轮询的 cloudPollOnce 走的是 meta 探测（200B、很快），每次都闪一下会很刺眼。 */
  if(!silent) syncTipShow('正在与云端同步…');
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){
      // ⭐ 9/19：云端没数据而本机有 → 开机发布本机（原语义只提示，两台设备都只拉不推时云端永远空着）
      _maybePublishLocal(true, null);
      if(!silent) toast('云端没有该账号的数据');
      syncTipHide();   // 404 早退也要收起提示
      return false;
    }
    if(res.status === 503) throw new Error('云端存储未绑定（Cloudflare 后台需绑定 SYNC_KV）');
    if(res.status === 401){
      setAuthToken('');
      throw new Error('登录已过期，请到「设置 → 云端同步」重新登录');
    }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    if(data.ts) _cloudBaseTs = Number(data.ts) || _cloudBaseTs;   // ⭐ 9/30：记下云端版本，PUT 时当乐观锁基线
    // 性能优化：云端内容哈希未变则跳过合并（省去每次轮询的 mergeData + 两次全量 stringify 比较，
    // DATA 越大这波 CPU 越重，是「有时候卡」的头号来源；单设备用户基本用不上 10s 实时性）
    const _ch = hashData(data.data);
    /* ⛔ 10/5：三个早退出口都要隐藏提示，否则转圈会卡住不消失。
       （统一放这里逐个显式隐藏，而不是靠 finally —— 因为成功路径要"闪一下已更新"，
         finally 会立刻把它清掉，两者冲突。） */
    if(_ch === _lastCloudHash){ syncTipHide(); return true; }
    // v7.1 自回声短路：拉到的就是自己刚传上去的那份（单标签页上传后的常规轮询必然命中）
    // → 跳过 mergeData + 跳过「已合并」判定。此前它会被当「云端更新」跑一次全量合并 + 计一次
    // 「已合并 0 处更新」噪音弹窗；多标签页/双设备时表现为「每几十秒莫名其妙合并一次」。
    if(_ch === _lastUploadedCloudHash){ _lastCloudHash = _ch; syncTipHide(); return true; }
    const m = mergeData(DATA, data.data);
    // 终极保险：比较合并前后内容，真的变化才算「更新」。
    // 场景：本机比云端进步（背单词 streak/释义更掌握）时，_mergeWords 内部 changes 每次都会计，
    // 但合并结果内容与本机一致——若不比较内容，会「每次拉取都弹已合并 + reload」形成无限刷新循环。
    const reallyChanged = JSON.stringify(_stripBeat(m.data)) !== JSON.stringify(_stripBeat(DATA));
    if(reallyChanged){
      DATA = m.data; // 合并而非覆盖：保留本机进度，并入云端新增/更新
      refreshSyncStampSnap();   // 合并写回后重建时间戳快照，防云端来的条目被误打本机戳再传回去
      // 关键修复：背单词页内存中的 pq.queue 引用的是旧 DATA.words 里的对象；
      // 合并后 DATA.words 已换成新数组/副本，若不同步引用，用户继续答题改的是旧对象，
      // hubSave 保存的新数组不会包含这些修改 → 表现为「背了不计数/待学习不变」。
      if(typeof window !== 'undefined' && window.pq && Array.isArray(window.pq.queue) && Array.isArray(DATA.words)){
        window.pq.queue = window.pq.queue.map(oldW => {
          const k = String(oldW.en || '').trim().toLowerCase();
          if(!k) return oldW;
          const newW = DATA.words.find(x => String(x.en || '').trim().toLowerCase() === k);
          return newW || oldW;
        });
      }
      DATA.settings.lastSyncTs = Date.now();
      // 直接写 localStorage，不走 hubSave——避免「合并云端数据后又触发上传→另一端又拉到→乒乓刷屏」。
      // 本端独有数据会在用户下次操作（hubSave）时自然上传，无需在合并时立即回传。
      try{ localStorage.setItem(HUB_KEY, JSON.stringify(DATA)); }catch(e){}
      // v7.1：后台轮询（silent）一律不弹 toast——弹窗只留给手动同步；
      // m.changes===0 说明只是字段规范化（如 materials 补默认结构），内容零变化，手动同步也不该弹「已合并 0 处」
      if(!silent && m.changes > 0) toast('已合并云端 ' + m.changes + ' 处更新');
      document.dispatchEvent(new CustomEvent('hub:data-merged'));
      // ⭐ 9/30：告诉同机的其他标签页「云端刚刚有变化」，别各自每隔几十秒重复拉同一份 1.7MB
      if(_syncBC){ try{ _syncBC.postMessage({ t:'poll', id:_tabId }); }catch(e){} }
      // 无缝刷新：合并成功后主动重渲染当前页面，无需用户手动刷新即可看到另一端的变化。
      renderAllOnMerge();
      syncSetStatus('✅ 已同步（已合并云端更新）', 'ok');
      renderLastSync();
      /* 10/5：合并完闪一句「已更新 N 处」再消失（她要"更新完立刻覆盖"的明确反馈）。
         ⚠️ 有变化走 show+定时隐藏；**无变化/异常走 hide** —— 不能先 show 再无条件 hide，
         否则定时器被立刻清掉、"闪一下"根本不显示（我第一版就犯了这个，已修）。 */
      if(m.changes > 0 && !silent) syncTipShow('已更新 ' + m.changes + ' 处', 1600);
      else syncTipHide();
    } else if(!silent){
      toast('云端没有比本机更新的内容');
    }
    // ⭐ 9/19 开机发布：首次拉取合并完成后，DATA 已是「本机∪云端」并集；与云端不一致就回传并集
    _maybePublishLocal(false, data.data);
    _lastCloudHash = _ch;   // 记录云端内容哈希：下次拉到相同哈希直接早退，不再跑合并
    return true;
  }catch(e){
    if(!silent) toast('云端下载失败：' + e.message);
    syncSetStatus('同步失败：' + e.message, 'error');
    renderLastSync();
    syncTipHide();   // 失败也要收起提示（否则报错后还在转圈）
    return false;
  }
}
async function cloudDelete(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先登录（设置 → 云端同步）'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  if(!confirm('确定删除云端该账号的数据？此操作不可恢复。')) return;
  try{
    const [res] = await syncApi('DELETE');
    if(res.status === 404){ toast('云端未启用（需先部署 Functions）'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    toast('已删除云端数据');
  }catch(e){ toast('云端删除失败：' + e.message); }
}
/* ===== 模考估分基础设施（10/1 从 scores.js 挪入：首页冲刺卡 sprint.js 也要用，而 home.html 不加载 scores.js） ===== */

var MOCK_TYPES = {
  listening: { name:'听力', icon:'🎧', mode:'accuracy', color:'var(--mock)',
    parts:[ {label:'P1',defaultTotal:10},{label:'P2',defaultTotal:10},
            {label:'P3',defaultTotal:10},{label:'P4',defaultTotal:10} ] },
  reading:   { name:'阅读', icon:'📖', mode:'accuracy', color:'var(--vocab)',
    parts:[ {label:'P1',defaultTotal:13},{label:'P2',defaultTotal:13},{label:'P3',defaultTotal:14} ] },
  speaking:  { name:'口语', icon:'🗣', mode:'score', color:'var(--med)',
    parts:[ {label:'流利度 Fluency',weight:1},{label:'词汇 Lexical',weight:1},{label:'语法 Grammar',weight:1},{label:'发音 Pronunciation',weight:1} ] },
  writing:   { name:'写作', icon:'✏️', mode:'score', color:'var(--warn)',
    parts:[ {label:'Task 1',weight:1},{label:'Task 2',weight:2} ] }, // Task 2 权重更高
};

/* 整卷客观题（听/读）按「答对率 → 雅思 band」近似估分（9/15 IDP 官方表二次校准，
   官方整数档锚点：听力 5=16/6=23/7=30/8=35；阅读A 5=15/6=23/7=30/8=35）。
   非满分 40 制先按比例折算再查表；低于 4 题（约 2.0 以下）不估分。 */
var BAND_TABLE = {
  reading: [ [39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5] ],
  listening: [ [39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[11,4],[8,3.5],[6,3],[4,2.5] ],
};

function partIsScore(p){ return typeof p.score === 'number'; }
function partWeight(cfg, label){
  const p = (cfg.parts || []).find(x => x.label === label);
  return (p && typeof p.weight === 'number') ? p.weight : 1;
}
function estimateBand(type, correct, total){
  const tbl = BAND_TABLE[type];
  if(!tbl || !(total > 0)) return null;
  const eq = correct / total * 40;
  if(eq < 4) return null;
  for(const [min, band] of tbl){ if(eq >= min) return band; }
  return null;
}
/* 9/15 整卷「目标对个数」：目标分对应档位最低个数 + 2（上限 40） */
function targetCorrectFor(type, bandTarget){
  const tbl = BAND_TABLE[type];
  const t = Number(bandTarget);
  if(!tbl || !(t > 0)) return null;
  for(let i = 0; i < tbl.length; i++){
    if(tbl[i][1] === t){
      return Math.min(40, tbl[i][0] + 2);
    }
  }
  return null;
}
/* 判定是否为口语整卷模考记录（口语页自动存；与 mock-history.js / mock.js 保持一致）
   新版：kind==='speaking'；旧版：无 kind，但有 p1 且无数组 parts */
function isSpeakingMockRec(r){
  return r && (r.kind === 'speaking' || (!Array.isArray(r.parts) && r.p1));
}

/* 账号 = 手机号或自定义用户名（6-20 位数字/字母/下划线，不区分大小写）。
   只含数字且 6-15 位的老手机号账号，登录后键名不变，云端老数据无缝接上。 */
function normalizeAcct(s){
  return (typeof s === 'string') ? s.trim().toLowerCase().replace(/\s+/g, '') : '';
}
const ACCT_RE = /^[a-z0-9_]{6,20}$/;
function acctBad(s){ return !ACCT_RE.test(s); }

/* ===== 登录/注册/改密码/找回（服务端 /api/auth 真鉴权） ===== */

/* 登录成功共用动作：存 token、记账号、启动同步、拉云端合并（404 时开机发布上传本机） */
function applyAuthSuccess(acct, token){
  setAuthToken(token);
  DATA.settings.syncCode = acct;
  DATA.settings.autoSync = true;
  hubSave();
  _cloudBaseTs = 0;   // 新 session、云端版本未知：PUT 成功 / 拉取成功后会重新确立
  initCloudSync();    // 幂等：已启动则跳过
  Promise.resolve(cloudDownload(true)).then(function(){
    renderAllOnMerge();
    if(typeof populateSettingsForm === 'function') populateSettingsForm();
  });
  renderSyncState();
}

/* 登录（手机号/用户名 + 密码） */
async function authLogin(acct, password){
  acct = normalizeAcct(acct);
  if(acctBad(acct)){ syncSetStatus('账号格式：6-20 位数字或字母', 'error'); return { ok:false, msg:'账号格式不正确' }; }
  if(!password){ syncSetStatus('请输入密码', 'error'); return { ok:false, msg:'请输入密码' }; }
  syncSetStatus('正在登录…', '');
  let j;
  try{ j = await authApiPost({ action:'login', acct: acct, password: password }); }
  catch(e){
    if(e.code === 'no_user'){
      syncSetStatus('该账号还没设置过密码：点「设置密码」完成首次绑定，本机/云端数据会自动接上', 'error');
      return { ok:false, needRegister:true, msg:e.message };
    }
    syncSetStatus('❌ ' + e.message, 'error');
    return { ok:false, msg:e.message };
  }
  applyAuthSuccess(acct, j.token);
  syncSetStatus('✅ 登录成功，云端数据已合并', 'ok');
  toast('登录成功');
  return { ok:true, msg:'登录成功' };
}

/* 首次设置密码（= 注册）。老用户（只绑过手机号）同样走这里，云端老数据自动接上。
   inviteCode：站长邀请码（10/1 商业化拍板，注册必填；服务端校验 inv:<CODE> 键，注册成功才消耗）。
   成功返回 { ok, acct, password }（恢复码已按她 10/1 拍板整套下线，注册成功由 UI 层直接走 authFinishRegister 自动登录）。 */
async function authRegister(acct, password, inviteCode){
  acct = normalizeAcct(acct);
  if(acctBad(acct)){ syncSetStatus('账号格式：6-20 位数字或字母', 'error'); return { ok:false }; }
  if(typeof password !== 'string' || password.length < 6 || password.length > 64){
    syncSetStatus('密码至少 6 位（最长 64 位）', 'error'); return { ok:false };
  }
  syncSetStatus('正在设置密码…', '');
  const payload = { action:'register', acct: acct, password: password };
  const ic = String(inviteCode || '').trim();
  if(ic) payload.inviteCode = ic;
  let j;
  try{ j = await authApiPost(payload); }
  catch(e){
    if(e.code === 'already_registered'){
      syncSetStatus('该账号已设置过密码，直接登录即可', 'error');
      return { ok:false, needLogin:true, msg:e.message };
    }
    syncSetStatus('❌ ' + e.message, 'error');
    return { ok:false, msg:e.message };
  }
  return { ok:true, acct: acct, password: password, vipGranted: (j && j.vipGranted) || 0 };   // vipGranted>0 = 内测码注册送了会员 N 天（她 10/1 二次拍板）
}
/* 注册成功后：自动登录进同步状态 */
async function authFinishRegister(acct, password){
  return authLogin(acct, password);
}

/* 修改密码（登录态）。session 保留，其他设备不受影响 */
async function authChangePassword(oldPassword, newPassword){
  if(!authToken()){ syncSetStatus('登录已过期，请重新登录', 'error'); return { ok:false }; }
  if(typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 64){
    syncSetStatus('新密码至少 6 位（最长 64 位）', 'error'); return { ok:false };
  }
  syncSetStatus('正在修改密码…', '');
  try{
    const j = await authApiPost({ action:'change', token: authToken(), oldPassword: oldPassword, newPassword: newPassword });
    syncSetStatus('✅ 密码已修改', 'ok');
    return { ok:true };
  }catch(e){
    syncSetStatus('❌ ' + e.message, 'error');
    return { ok:false, msg:e.message };
  }
}

/* 退出登录：删云端 session + 清本地登录态。本机数据一律保留 */
async function authLogout(){
  try{ await authApiPost({ action:'logout', token: authToken() }); }catch(e){}
  setAuthToken('');
  DATA.settings.syncCode = '';
  DATA.settings.autoSync = false;
  hubSave();
  renderSyncState();
  toast('已退出登录（本机数据保留）');
}
/* 诊断：明确告诉用户后端到底卡在哪一步（不静默） */
async function syncDiagnose(){
  const phone = DATA.settings.syncCode;
  if(!phone){ syncSetStatus('请先登录（手机号/用户名 + 密码）', 'error'); return; }
  if(!authToken()){ syncSetStatus('账号 ' + phone + ' 还没设置密码或登录已过期：请重新登录', 'error'); return; }
  syncSetStatus('正在探测云端…', '');
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){
      syncSetStatus('探测结果：HTTP 404 —— 云端 Functions 未启用或未部署。即 Cloudflare Pages 项目的 Pages Functions 没开启，/api/sync 不存在。需在 Cloudflare 后台确认 Functions 已启用。', 'error');
    } else if(res.status === 401){
      syncSetStatus('探测结果：HTTP 401 —— 登录已过期，请重新登录。', 'error');
    } else if(res.status === 503){
      syncSetStatus('探测结果：HTTP 503 —— 云端存储未绑定。Cloudflare Pages 项目未绑定 KV 命名空间「SYNC_KV」。需在后台 Settings → Storage/KV 绑定一个名为 SYNC_KV 的命名空间。', 'error');
    } else     if(res.ok){
      const size = Math.round(JSON.stringify(DATA).length / 1024);
      syncSetStatus('探测结果：HTTP 200 ✅ 云端连通正常。本机数据约 ' + size + ' KB。若仍显示「尚未同步」，点一下「绑定并同步」或刷新页面即可。', 'ok');
      renderLastSync();
    } else {
      syncSetStatus('探测结果：HTTP ' + res.status + '（' + ((data && data.error) || '未知错误') + '）', 'error');
    }
  }catch(e){
    syncSetStatus('探测失败：' + e.message + '（可能是网络无法访问 pages.dev，或浏览器拦了请求）', 'error');
  }
}
/* 设置页状态行（无对应 DOM 时静默） */
function syncSetStatus(msg, kind){
  const el = $('#syncStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.className = 'muted' + (kind ? ' sync-status-' + kind : '');
}
/* 设置页同步状态概览（三态：未登录 / 有账号未设密码（迁移）/ 已登录） */
function renderSyncState(){
  const el = $('#syncState');
  if(!el) return;
  const phone = DATA.settings.syncCode || '';
  if(!phone){ el.textContent = '尚未绑定账号'; renderLastSync(); return; }
  if(!authToken()){ el.textContent = '账号 ' + phone + '：还没设置密码（或登录已过期），登录后才能同步'; renderLastSync(); return; }
  /* 10/5 她 14:29：「已登录已登录，它旁边这个自动同步开，这句话不用显示，反正都是默认开着的」
     → 删掉「（自动同步：开/关）」。**但「关」的情况不能静默消失** —— 那是有用信息，
     只在真的关掉时才提示（否则用户以为同步开着其实没开）。 */
  el.textContent = '已登录：' + phone + (DATA.settings.autoSync ? '' : ' · 自动同步已关闭');
  renderLastSync();
}
/* 上次同步时间（可读） */
function renderLastSync(){
  const el = $('#lastSyncTs');
  if(!el) return;
  const ts = DATA.settings.lastSyncTs;
  el.textContent = ts ? ('上次同步：' + new Date(ts).toLocaleString('zh-CN')) : '尚未同步';
}
/* 强制：本机覆盖云端（无视合并，直接 PUT 整份）
   ⭐ 9/30 noLock：用户明确要本机覆盖，跳过乐观锁（否则会被 409 拦回去先合并，与本按钮语义相反） */
function syncForcePush(){
  if(!DATA.settings.syncCode){ toast('请先登录'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  cloudUpload(true, true, { noLock: true });
  setTimeout(renderLastSync, 1800);
}
/* 强制：云端覆盖本机（GET 后整体替换，不保留本机独有数据） */
async function syncForcePull(){
  const phone = DATA.settings.syncCode;
  if(!phone){ toast('请先登录'); return; }
  if(!authToken()){ toast('登录已过期，请重新登录'); return; }
  if(!confirm('⚠️ 此操作将用云端数据替换本机所有数据（含素材），本机未同步的内容会丢失！确定继续？')) return;
  try{
    const [res, data] = await syncApi('GET');
    if(res.status === 404){ toast('云端没有该账号的数据'); return; }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    if(!data || !data.data) throw new Error('返回格式异常');
    // h 类防御：云端数据理论上只缺 writing（官方模板 stripCloudFields 剔除后从不上传）；
    // 若云端数据异常缺 settings/words 等骨架字段，直接覆盖会让全站无 settings 可用（变砖）→ 拒绝执行。
    if(!data.data.settings || !Array.isArray(data.data.words)) throw new Error('云端数据不完整（缺 settings/words），已取消覆盖以保护本机数据');
    const _keepWriting = DATA.writing;
    DATA = data.data;
    if(!DATA.writing && _keepWriting) DATA.writing = _keepWriting;   // writing 永远用本机官方模板
    DATA.settings.lastSyncTs = Date.now();
    hubSave();
    toast('已用云端数据覆盖本机');
    setTimeout(() => location.reload(), 800);
  }catch(e){ toast('云端拉取失败：' + e.message); }
}

/* 合并成功后无缝重渲染当前页：优先调用页面注册的渲染入口；未注册则退回「调用已知 render 函数名」。
   目的：另一台设备保存的变更合并进来后，本端页面自动刷新、无需手动刷新。 */
function renderAllOnMerge(){
  // 1) 页面主动注册的渲染器（推荐，精确）
  if(Array.isArray(window.__hubRenderers)){
    window.__hubRenderers.forEach(fn => { try{ fn(); }catch(e){} });
  }
  // 2) 退回：调用各页面可能存在的全局 render 入口（命名各异，存在才调）
  ['render','renderList','renderWords','renderMeds','renderHistory','renderMock',
   'renderSyncState','renderPlan','renderPlanList','renderMaterials','renderStory',
   'renderCorpus','renderErrorbook','renderScores','renderTimer','renderDaily',
   'renderHome','renderReports'].forEach(name => {
    try{ if(typeof window[name] === 'function') window[name](); }catch(e){}
  });
}
/* 自动双向同步：启动静默合并拉取一次 + 定时/回到页面时拉取（均为合并，不覆盖、不弹确认刷屏） */
let _cloudSyncStarted = false;
/* ===== 同步指示器（10/5 14:52 她要：打开立刻看本机内容 + 转圈提示「还在更新」+ 更新完自动覆盖）=====
   ⚠️ **先澄清事实再改**：首屏拉取**本来就是非阻塞的**（下面 initCloudSync 用
      `requestIdleCallback(..., {timeout:2000})` + 800ms 兜底），页面 DCL 实测 217~341ms。
      她感受到的 4 秒 = 早就在看本机内容了，**只是没有任何"正在更新"的提示**，像是卡住。
      所以本批**只加提示，不动同步时序** —— 时序是"检查与计数同链"级别的敏感区（P0 的教训），不动它。
   用法：syncTipShow('正在与云端同步…') / syncTipHide()。元素懒建、幂等。
   ⚠️ 弱网时可能长时间转圈 → 加 12s 自动隐藏兜底，绝不让提示常驻挡路（它 pointer-events:none 也不挡点击）。 */
let _syncTipEl = null, _syncTipTimer = null, _syncTipOn = false;
function syncTipEnsure(){
  if(_syncTipEl) return _syncTipEl;
  let el = document.getElementById('hubSyncTip');
  if(!el){
    el = document.createElement('div');
    el.id = 'hubSyncTip';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = '正在与云端同步…';
    document.body.appendChild(el);
  }
  _syncTipEl = el;
  return el;
}
function syncTipShow(text, holdMs){
  if(!text) return;
  try{
    const el = syncTipEnsure();
    if(text) el.textContent = text;
    el.classList.add('on');
    _syncTipOn = true;
    clearTimeout(_syncTipTimer);
    // 兜底：弱网/云端卡住时 12s 后自动消失，绝不常驻挡路
    _syncTipTimer = setTimeout(syncTipHide, holdMs || 12000);
  }catch(e){}
}
function syncTipHide(){
  try{
    clearTimeout(_syncTipTimer);
    if(_syncTipEl) _syncTipEl.classList.remove('on');
    _syncTipOn = false;
  }catch(e){}
}

function initCloudSync(){
  if(_cloudSyncStarted) return;   // 幂等：登录后补调用 / 重复 ready 都不重复起轮询
  if(!DATA.settings.autoSync || !  DATA.settings.syncCode) return;
  if(!authToken()) return;   // ⭐ 10/1：无 session token（迁移老用户还没设密码）不启动云同步，设完密码 applyAuthSuccess 会再调进来
  _cloudSyncStarted = true;
  // 清空数据补传：resetData 时若云端上传失败（断网），本地已空、云端仍是旧数据，
  // 此时若先拉取会把旧数据整份合并回来复活。有补传标记则先强制推空、跳过本次首屏拉取（30s 轮询保留）。
  let skipFirstDownload = false;
  try{
    if(localStorage.getItem('hub_reset_pending') === '1'){
      localStorage.removeItem('hub_reset_pending');
      skipFirstDownload = true;
      Promise.resolve(cloudUpload(false, true, { noLock: true })).then(ok => {
        if(ok === false){ try{ localStorage.setItem('hub_reset_pending', '1'); }catch(e){} }   // 仍失败：重记标记，下次启动再补传
      });
    }
  }catch(e){}
  // 优化：首屏拉取延迟到首屏渲染之后，避免「下载+合并大数组」阻塞首屏（数据越大越明显）。
  // 10s 轮询与切回前台拉取保留原逻辑。
  if(!skipFirstDownload){
    if(typeof requestIdleCallback === 'function') requestIdleCallback(function(){ cloudDownload(true); }, { timeout: 2000 });
    else setTimeout(function(){ cloudDownload(true); }, 800);
  }
  /* ⭐ 9/30 leader 心跳 + 轮询改道：
   * - 每 4s 广播一次 ping（前台/后台状态），12s 收不到就认为对方已关 → 自动重新选举。
   *   所以「唯一的标签页」永远是 leader，绝不会出现「没人干活 → 同步彻底停摆」。
   * - 轮询只由 leader 执行，且从整份下载降级为 200B 的 meta 探测，因此 30s → 12s 也不增加负担。
   * - 非 leader 靠 leader 的 'poll'/'uploaded' 广播被动跟进；切前台/回来还会再补一次。 */
  _syncBcPing();
  _syncElectLeader();
  setInterval(function(){ _syncBcPing(); _syncElectLeader(); }, 4000);
  setInterval(() => { if(!document.hidden && _isLeader) cloudPollOnce(); }, 12 * 1000);
  document.addEventListener('visibilitychange', () => {
    if(document.hidden) return;
    _syncBcPing();
    if(_isLeader) cloudPollOnce();   // 回到前台立刻问一次（200B），不用等下一轮
  });
  window.addEventListener('beforeunload', function(){ try{ if(_syncBC) _syncBC.postMessage({ t:'bye', id:_tabId }); }catch(e){} });
}
ready(initCloudSync);

/* ===== 桌面通知（番茄钟阶段切换 / 智能提醒）已移除：不再申请浏览器通知权限 ===== */

window.$ = s => document.querySelector(s);
function ready(fn){ if(document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

/* 取某个 js 模块「页面实际声明的那份 URL」（含 ?v= 版本号），取不到再退回裸文件名。
   ⚠️ 9/17 回顾页陈旧 UI 事故的根因类问题：凡是手工拼 'js/xxx.js' 去 fetch / 注入的地方，
   URL 上没有 ?v= 版本号就等于在向「浏览器 HTTP 缓存里任意年代的旧副本」要代码，
   eval 之后会把刚按页面声明装好的新版同名函数整体覆盖回去。
   动态加载脚本一律走这里，跟页面声明同源，版本号永远不会漂移。 */
function declaredSrc(name){
  try{
    const base = 'js/' + name.replace(/^.*\//, '');
    const s = document.querySelector('script[src*="' + base + '"]');
    const src = s && s.getAttribute('src');
    if(src) return src;
  }catch(e){}
  return 'js/' + name.replace(/^.*\//, '');
}

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

/* ===== 全站跳转加载遮罩（果冻水珠 · 纯图案无文字） =====
   - 运行时注入 <body>，避免每页改 HTML。
   - 软导航点击站内链接当帧显示，内容切换 + 脚本执行完毕（DOM 就绪）后淡出。
   - 整页兜底跳转（location.href）时旧页卸载、遮罩随页面消失，新页默认隐藏（无残留）。
   - 3s 兜底强制隐藏，避免卡死。 */
function injectLoadingOverlay(){
  if(document.getElementById('hubLoader')) return;
  const el = document.createElement('div');
  el.id = 'hubLoader';
  el.className = 'hub-loader';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="ui-loader" role="status" aria-label="Loading"><span class="ui-loader-dot"></span><span class="ui-loader-dot m2"></span><span class="ui-loader-dot m3"></span><span class="ui-loader-shadow"></span><span class="ui-loader-shadow m2"></span><span class="ui-loader-shadow m3"></span></div>';
  document.body.appendChild(el);
}
/* 遮罩显示策略：
   - HUB_LOADER_DELAY：延迟展示阈值（9/9 性能）。旧实现「点击即显示 + 最短展示 250ms」，
     导致页面 15ms 就切好了也要卡满 250ms 的 loading —— 正是「点 tab 加载时间过长」的体感主因。
     现在：120ms 内切完就完全不显示遮罩；只有真慢（>120ms）才出现，避免闪一下。
   - HUB_LOADER_MIN：已展示后的最短展示，避免遮罩「闪一下」像坏了一样；
   - HUB_LOADER_MAX：安全上限，极端慢网 / 重脚本 eval 卡住时也不残留遮罩（softNavigate 的 finally 也会兜底收起）。 */
let _hubLoaderHideTimer = null;
let _hubLoaderMaxTimer = null;
let _hubLoaderShowTimer = null;
let _hubLoaderShownAt = 0;
const HUB_LOADER_DELAY = 120;
const HUB_LOADER_MIN = 250;
const HUB_LOADER_MAX = 5000;
function showHubLoader(){
  if(_hubLoaderShowTimer) clearTimeout(_hubLoaderShowTimer);
  _hubLoaderShowTimer = setTimeout(() => {           // 延迟展示：秒切不显示，慢了才盖遮罩
    _hubLoaderShowTimer = null;
    const el = document.getElementById('hubLoader');
    if(!el) return;
    el.classList.add('show');
    // .ui-loader 由 CSS 无限动画驱动，无需 JS 重置
    _hubLoaderShownAt = Date.now();
    if(_hubLoaderHideTimer){ clearTimeout(_hubLoaderHideTimer); _hubLoaderHideTimer = null; }
    if(_hubLoaderMaxTimer) clearTimeout(_hubLoaderMaxTimer);
    _hubLoaderMaxTimer = setTimeout(_doHideHubLoader, HUB_LOADER_MAX);
  }, HUB_LOADER_DELAY);
}
function hideHubLoader(){
  if(_hubLoaderShowTimer){ clearTimeout(_hubLoaderShowTimer); _hubLoaderShowTimer = null; }  // 还没来得及显示就切完了 → 直接取消
  const el = document.getElementById('hubLoader');
  if(!el) return;
  if(!el.classList.contains('show')){ _clearLoaderTimers(); return; }   // 已收起，忽略重复调用
  const remain = HUB_LOADER_MIN - (Date.now() - _hubLoaderShownAt);
  if(remain > 0){                                                      // 未达最短展示，延时收起
    if(_hubLoaderHideTimer) clearTimeout(_hubLoaderHideTimer);
    _hubLoaderHideTimer = setTimeout(_doHideHubLoader, remain);
    return;
  }
  _doHideHubLoader();
}
function _doHideHubLoader(){
  const el = document.getElementById('hubLoader');
  if(el) el.classList.remove('show');
  _clearLoaderTimers();
}
function _clearLoaderTimers(){
  if(_hubLoaderHideTimer){ clearTimeout(_hubLoaderHideTimer); _hubLoaderHideTimer = null; }
  if(_hubLoaderMaxTimer){ clearTimeout(_hubLoaderMaxTimer); _hubLoaderMaxTimer = null; }
  if(_hubLoaderShowTimer){ clearTimeout(_hubLoaderShowTimer); _hubLoaderShowTimer = null; }
}

/* ===== 首屏启动遮罩（覆盖硬刷新 / 整页跳转的卡顿） =====
   说明：上面的 #hubLoader 是「软导航」遮罩，由 JS 注入、仅在点击站内链接时显示。
   但它赶不上 Ctrl+F5 / 整页跳转——那种情况下 JS 还没跑、body 还是空的，卡顿完全没遮住。
   所以各页面 HTML 里直接内联了一个 #bootLoader（含内联 <style>，首字节即渲染），
   本函数负责在「页面真正可用」后把它收起，并对任何卡死情况兜底。
   - window.load：所有子资源（脚本/样式/字体/图片）就绪，覆盖整段硬刷新卡顿；
   - 8s 安全上限：极端情况 load 不触发也不残留；
   - 暴露 window.__hubBootDone：若某页要在自己的重脚本跑完后才收起，可主动调用。 */
function _finishBootLoader(){
  var el = document.getElementById('bootLoader');
  if(!el || el.dataset.done) return;
  el.dataset.done = '1';
  el.classList.add('hide');
  setTimeout(function(){ if(el && el.parentNode) el.parentNode.removeChild(el); }, 400);
}
function initBootLoader(){
  var el = document.getElementById('bootLoader');
  if(!el) return;
  window.__hubBootDone = _finishBootLoader;
  // 优化：遮罩在「DOM 解析完成 + 本批 defer 脚本渲染完」即收起，
  // 不再等 window.load（window.load 还会等图片/字体/慢网资源，农村代理网络下会卡很久）。
  // 本 App 内容全靠 JS 渲染、几乎无图片，DOMContentLoaded 时页面已就绪。
  var _bootFinishSoon = function(){
    // 2026-09-04 提速：原固定 250ms 是纯死等。defer 脚本与各页 ready 的同步渲染
    // 在 DOMContentLoaded 前后即已完成，两帧 rAF（约 32ms）足以让首帧绘制发生，
    // 遮罩即可收起 → 新开标签页「可用」体感提前约 200ms。
    var raf = window.requestAnimationFrame || function(cb){ setTimeout(cb, 16); };
    raf(function(){ raf(function(){ _finishBootLoader(); }); });
  };
  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    _bootFinishSoon();
  } else {
    document.addEventListener('DOMContentLoaded', _bootFinishSoon, { once:true });
  }
  setTimeout(_finishBootLoader, 8000);   // 兜底：绝不卡死在遮罩上
}

/* ===== 全站计时悬浮标签（底部居中 · 跨页常驻） =====
   - 运行时注入 <body>，所有页面可见；默认 hidden。
   - 数据源：本页 timer.js 的 window.active（计时页内，含实时暂停累计），
     或 DATA.activeTimer 云端镜像（跨页 / 其他页也能显示本地计时）。
   - timer.js 在 开始/暂停/结束/继续 时 dispatch 'hub:timer-state' → 立即同步；
     另起 1s 间隔持续刷新 elapsed 并自愈（ended 时自动隐藏）。
   - 只显示「未结束」的活跃计时。 */
function injectFloatTimer(){
  if(document.getElementById('floatTimer')) return;
  const el = document.createElement('div');
  el.id = 'floatTimer';
  el.className = 'float-timer';
  el.setAttribute('hidden', '');
  el.innerHTML = '<span class="ft-dot"></span>'
    + '<span id="ft-label" class="ft-label">计时中</span>'
    + '<span id="ft-time" class="ft-time">00:00:00</span>'
    + '<button id="ft-stop" class="ft-stop" type="button">结束</button>';
  document.body.appendChild(el);
  const stop = document.getElementById('ft-stop');
  if(stop) stop.addEventListener('click', floatStopTimer);
}
function floatTimerSource(){
  if(window.active && window.active.startTs && !window.active.ended) return window.active;
  const a = DATA.activeTimer;
  if(a && !a.ended && a.startTs) return a;
  return null;
}
function floatElapsedSec(src){
  if(!src || !src.startTs) return 0;
  const now = Date.now();
  let pause = Number(src.pauseAccum) || 0;
  if(src.paused && src.pauseStart) pause += (now - src.pauseStart);
  let elapsed = (now - src.startTs - pause) / 1000;
  if(src.paused && src.pauseStart) elapsed = (src.pauseStart - src.startTs - (Number(src.pauseAccum) || 0)) / 1000;
  return Math.max(0, elapsed);
}
/* 倒计时模式显示剩余时间，与计时页主卡口径一致（她 9/19 反馈：点倒计时 40 分钟，
   悬浮标也得走倒计时，不能是正计时）。非倒计时/旧数据（无 mode/targetSec）回退正计时。 */
function floatDisplaySec(src){
  const elapsed = floatElapsedSec(src);
  if(src && src.mode === 'down' && src.targetSec){
    return Math.max(0, (Number(src.targetSec) || 0) - elapsed);
  }
  return elapsed;
}
function syncFloatTimer(){
  const src = floatTimerSource();
  const el = document.getElementById('floatTimer');
  if(!el) return;
  /* 10/2（她反馈模考答题卡被悬浮胶囊挡住）：沉浸式模考进行中不显示跨页胶囊。
     计时照跑不中断，只是不显示；退出模考（#mockView hidden）自动恢复。 */
  const mockView = document.getElementById('mockView');
  if(mockView && !mockView.hidden){
    if(!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
    return;
  }
  if(!src){
    if(!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
    return;
  }
  const name = src.subName || src.moduleName || '学习';   // 9/17 任务计时：subName=任务文本（如「听力 第3篇」），优先显示
  const label = document.getElementById('ft-label');
  if(label) label.textContent = (src.paused ? name + ' 暂停中' : name + ' 计时中');
  const t = document.getElementById('ft-time');
  if(t) t.textContent = (typeof fmtHMS === 'function') ? fmtHMS(floatDisplaySec(src)) : '00:00:00';
  if(el.hasAttribute('hidden')) el.removeAttribute('hidden');
}
function floatStopTimer(){
  if(typeof window.stopSession === 'function'){ window.stopSession(); return; }
  // 非计时页：直接跳到计时页，由那里的「结束并保存」正规结算（避免丢失记录）
  location.href = 'timer.html';
}
let _floatTimerInterval = null;
/* 遗弃计时自愈：打开任意页面时，若云端镜像存在一个「未结束但已离线/跨天」的遗弃计时，
   把它结算为结束（记录真实时长 = startTs→lastBeat，不含离线空隙），避免被浮窗按墙钟累加成 17 小时幽灵计时，
   也解除它对另一端「isWordTimerActive」的占用，让另一台设备能正常开新计时。（之之 8/31 反馈） */
function settleOrphanActiveTimer(){
  const m = DATA.activeTimer;
  if(!m || m.ended || !m.timerId || !m.startTs) return;
  if(m.paused) return;                       // 暂停是主动空闲，绝不误抢
  const lastBeat = _num(m.lastBeat) || 0;
  const now = Date.now();
  const prevDay = todayKey(_num(m.startTs)) !== todayKey();
  const ABANDON_MS = 10 * 60 * 1000;
  // 仅当「跨天」或「运行态心跳过期超过 10 分钟」才判定为遗弃（避免误杀短暂后台节流的正常计时）
  if(!(prevDay || (lastBeat && (now - lastBeat) > ABANDON_MS))) return;
  // 结算真实时长：结束点取 lastBeat（最后在线时刻），不把离线空隙算进学习时长
  const endTs = Math.min(lastBeat || now, now);
  let pause = _num(m.pauseAccum) || 0;
  if(m.pauseStart) pause += (endTs - _num(m.pauseStart));
  const durationSec = Math.max(0, Math.round((endTs - _num(m.startTs) - pause) / 1000));
  const dayKey = todayKey(_num(m.startTs));
  if(durationSec > 0 && !(DATA.sessions || []).some(s => s.timerId && s.timerId === m.timerId)){
    const names = (typeof resolveTimerNames === 'function')
      ? resolveTimerNames(m)
      : { moduleName: m.moduleName || '学习', subName: m.subName || '' };
    DATA.sessions = DATA.sessions || [];
    DATA.sessions.push({
      id: (typeof uid === 'function') ? uid() : ('s' + Date.now()),
      timerId: m.timerId, date: dayKey,
      moduleId: m.moduleId, subId: m.subId || m.moduleId,
      moduleName: names.moduleName, subName: names.subName,
      startTs: _num(m.startTs), endTs, durationSec, pauseSec: Math.max(0, Math.round(pause / 1000))
    });
  }
  DATA.activeTimer = { timerId: m.timerId, ended: true, updatedAt: Date.now(), lastBeat: 0 };
  if(typeof hubSave === 'function') hubSave();
  try{ document.dispatchEvent(new CustomEvent('hub:timer-state')); }catch(e){}
}
function initFloatTimer(){
  injectFloatTimer();
  settleOrphanActiveTimer();                        // 打开即清理被遗弃的计时（防 17 小时幽灵计时）
  syncFloatTimer();                                  // 若已有运行中的计时，立即显示
  document.addEventListener('hub:timer-state', syncFloatTimer);
  if(_floatTimerInterval) clearInterval(_floatTimerInterval);
  _floatTimerInterval = setInterval(syncFloatTimer, 1000);   // 每秒刷新 elapsed + 自愈 ended
}
/* 逻辑当前页（文件名的 .html）：软导航期间 location.pathname 滞后于真实目标页
   （pushState 在 runPageScript 之后才执行），若此刻 injectNav 按 pathname 算高亮会回退到旧页。
   故用本变量记录「真实当前页」，updateActiveNav 写入、injectNav 优先读取。 */
let _hubCurrentFile = null;

function initSoftNav(){
  if(_softNavReady) return;
  _softNavReady = true;
  document.addEventListener('click', onHubLinkClick);
  window.addEventListener('popstate', onHubPopState);
  // ⚡ 按下/悬停即预热（9/9 性能）：pointerdown 早于 click 触发，鼠标 hover 也提前几百 ms。
  //    只拉资源进内存缓存、不执行不渲染，与随后的软导航天然去重（navGetDoc 命中缓存直接返回）。
  const warm = (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    const t = hubLinkTarget(a);
    if(t) prefetchPage(t.id);
  };
  document.addEventListener('pointerdown', warm, { capture: true, passive: true });
  document.addEventListener('mouseover', warm, { capture: true, passive: true });
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
  const file = normalizePageFile(href.split('#')[0].split('?')[0].split('/').pop());
  const page = PAGES.find(p => p.file === file);
  if(!page) return null;
  return { id: page.id, file: page.file, href: page.file };
}

function onHubLinkClick(e){
  if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  const t = hubLinkTarget(a);
  if(!t) return;                 // 放行：由浏览器原生处理
  e.preventDefault();            // 拦下，走软切换
  closeMoreSheet();             // 移动端：点任意站内链接即收起「更多」弹层
  updateActiveNav(t.file);       // ⚠️ 关键修复（导航高亮闪烁）：点击瞬间同步高亮目标模块，
                                  //    不等 fetch/脚本执行。否则在「点击→fetch→runPageScript(重脚本 eval)」
                                  //    这段异步窗口里，旧模块高亮仍挂着，表现为「先闪其他模块、再跳回」。
  showHubLoader();                // 软导航异步窗口（fetch + 重脚本 eval）期间盖住，避免白屏闪烁
  softNavigate(t, false);
}

function onHubPopState(){
  const file = normalizePageFile(location.pathname.split('/').pop() || 'home.html');
  const page = PAGES.find(p => p.file === file);
  if(page) softNavigate({ id: page.id, file: page.file, href: file }, true);
  else location.reload();
}

/* ===== 软导航资源缓存（9/9 性能专项） =====
   旧实现：每次切 tab 都重新 fetch 目标页 HTML，再串行 fetch 该页每个脚本（cache:'no-cache' 强制重新下载）。
   口语页 6 个脚本 ≈210KB、写作页 ≈140KB —— 每次切换都重下一遍，慢网/手机下单次 1s+，
   这是「点各 tab 加载时间过长」的根因。
   现实现：HTML（已解析的 Document）与脚本源码进内存 Map：
   - 二次切同一页 = 零网络请求、零等待；
   - 首次也能命中「空闲预热」（见 prefetchAll）提前拉好的缓存；
   - 只活在当前会话（刷新即失效），部署新版（?v= 变化）不会被永久缓存住。 */
const _navDocCache = new Map();     // file -> { doc, v }（v=该页 HTML 引用的脚本版本，用于部署漂移检测）
const _navCodeCache = new Map();    // src  -> 源码文本
const NAV_FETCH_TIMEOUT = 20000;    // 单请求 20s 超时：极端慢网下让 softNavigate 走「整页跳转」兜底，绝不无限占住 _softNavBusy
function navFetchOpts(){
  if(typeof AbortController === 'function'){
    const ac = new AbortController();
    setTimeout(() => ac.abort(), NAV_FETCH_TIMEOUT);
    return { cache: 'default', signal: ac.signal };
  }
  return { cache: 'default' };
}
/* 9/15 修「长驻标签页一直显示更新前的 UI」：内存缓存/已执行脚本只反映「本次 boot 时的版本」，
   标签页跨睡眠/跨部署不关闭时，软导航永远用旧文档+旧脚本（表现为 9/13 模考 tab 改版、十天内筛选修复等
   全部“没生效”），硬刷新才恢复。9/20 design/75 起改为「同页基线比对 + 探针兜底」两级自愈：
   ① 同页基线（navVersionCheck）：本会话内同一页指纹变化才算真部署；② 探针（navDeployProbe，权威）：
   线上 home.html（no-store）指纹 vs 启动指纹。动作端 soft heal=仅 reload，
   hard heal（注销 SW + 清空缓存）仅在「连续 ≥2 轮探针仍漂移」时执行一次。
   9/15 二修（之之实锤：本次只 bump 了 data.js/scores.js/common.css，common.js 没动 → 单点比对失效，
   回顾页首进旧渲染+旧样式、硬刷新才好）：指纹从 common.js 单点扩为「common.js + data.js + common.css」
   三项全局共有资产（14 页同 bump 部署纪律保证三项永远同步变），任一不同即自愈。 */
function assetVer(el){
  try{
    const ref = el.getAttribute('src') || el.getAttribute('href') || '';
    const m = ref.match(/v=([0-9a-z]+)/);
    return m ? m[1] : '';
  }catch(e){ return ''; }
}
function assetSig(root){
  try{
    const parts = [];
    ['common.js', 'data.js'].forEach(n => {
      const el = root.querySelector('script[src*="' + n + '"]');
      parts.push(n + ':' + (el ? assetVer(el) : ''));
    });
    const css = root.querySelector('link[href*="common.css"]');
    parts.push('common.css:' + (css ? assetVer(css) : ''));
    return parts.join('|');
  }catch(e){ return ''; }
}
const BOOT_SCRIPT_V = assetSig(document);
function docScriptVersion(doc){
  return assetSig(doc);
}
let _navSelfHealing = false;
/* 9/20 design/75 自愈去核武器化——SW v14 的分级缓存已是正式离线能力，9/4「SW 是故障源」时代的
   「注销 SW + 清空全部 CacheStorage」核武动作降级为独立的 hard heal，只在「连续多轮探针仍报漂移、
   普通 reload 无法恢复（真 SW 缓存病态）」时才执行一次。常规自愈（soft heal）只 reload。 */
function navSelfHealReload(){
  if(_navOfflineHold) return;               // design/79 离线闸：离线期间不自愈（探针必失败，reload 只会连放）
  if(_navSelfHealing) return;
  try{
    const last = Number(sessionStorage.getItem('hub_nav_v_rl') || 0);
    if(Date.now() - last < 60000) return;   // 60s 内已自愈过：不再 reload（病态环境下防循环）
    sessionStorage.setItem('hub_nav_v_rl', String(Date.now()));
  }catch(e){ return; }                       // sessionStorage 不可用（隐私模式等）→ 放弃自愈，绝不敢乱 reload
  _navSelfHealing = true;
  location.reload();                         // 整页刷新：内存缓存随会话重建，新 HTML+JS 全量生效
}
/* hard heal（核武，仅 navDeployProbe 在 sessionStorage 计数 ≥2 时调用一次并清零计数）：
   注销 SW + 清空 CacheStorage + reload。SW v14 的 SWR / network-first / SW_UPDATED 机制本身不动。 */
function navHardHeal(){
  if(_navOfflineHold) return;               // design/79 离线闸：离线期间绝不注销 SW / 清缓存
  try{
    const lastHard = Number(sessionStorage.getItem('hub_nav_hard_rl') || 0);
    if(Date.now() - lastHard < 60000) return;   // 60s 内已放过一次核武：绝不连放（防 unregister/reload 风暴）
    sessionStorage.setItem('hub_nav_hard_rl', String(Date.now()));
    sessionStorage.setItem('hub_nav_v_rl', String(Date.now()));   // 记入节流：hard heal 后 60s 内不再软自愈
    sessionStorage.setItem('hub_nav_heal_n', '0');                // 清零漂移计数
  }catch(e){ return; }
  _navSelfHealing = true;
  console.warn('[hub] 硬自愈：连续多轮探针漂移且 reload 无法恢复，注销 SW 并清空缓存重建');
  try{
    if('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations){
      navigator.serviceWorker.getRegistrations().then(rs => (rs || []).forEach(r => { try{ r.unregister(); }catch(_){} })).catch(function(){});
    }
    if(window.caches && caches.keys){
      caches.keys().then(ks => (ks || []).forEach(k => { try{ caches.delete(k); }catch(_){} })).catch(function(){});
    }
  }catch(e){}
  location.reload();
}
/* 9/20 design/75 检测端重写：「目标页指纹 vs BOOT_SCRIPT_V 跨页比对」在分页 buster 时代是设计缺陷
   —— 某页 buster 与 boot 页静态不同（9/20 任务二漏改部分页 css buster 就真实发生过）→ 每次软导航
   都误判部署漂移 → 核武自愈把离线能力整体打残。现改「同页基线比对」：
   - 内存命中：不比对（命中即本会话已确认过该页）；
   - 网络获取：与 _navDocCache 中同 file 旧记录的指纹比，不同 = 本会话内该页确实发生部署 → 自愈；
   - 首次获取该页（无基线）绝不比对 —— 分页 buster 静态不一致因此永不触发。
   权威兜底仍是 navDeployProbe（home.html no-store vs BOOT_SCRIPT_V，SW 对 _probe 已透传）。 */
function navVersionCheck(file, doc){
  const prev = _navDocCache.get(file);
  if(!prev || !prev.v) return;               // 首次获取该页：没有同页基线，绝不比对
  const v = docScriptVersion(doc);
  if(!v || v === prev.v) return;
  console.warn('[hub] 检测到本页部署更新（基线 ' + prev.v + ' / 最新 ' + v + '），自动刷新以加载新版');
  navSelfHealReload();
}
/* 9/15 二修补充——内存命中路径的残余漏洞：缓存命中时校验的是「缓存文档 vs 启动指纹」，
   部署“之前”就已缓存的页面二者相同，永远检不出漂移（之之实锤：回顾页跨部署二次进入仍是旧渲染）。
   现补后台部署探针：每次软导航触发（60s 节流）拉一次最新 home.html（no-store 绕过一切缓存），
   解析资产指纹与启动指纹比对，不同 → navSelfHealReload。探测不阻塞导航（fire-and-forget），
   60s 内多次切换只发一次请求，成本近乎为零。 */
let _probeAt = 0, _probeBusy = false, _probeHandledThisBoot = false;

/* ===== design/79 离线状态灯 + 自愈第三道闸（离线闸） =====
   SW v25 已让全站离线可用（navigate 走缓存、静态 SWR），但断网时她完全无感知：分不清
   「背单词生词卡住了」还是「网络挂了」，AI 功能（口语诊断/翻译）断网必失败会以为是自己 Key 出问题。
   本段只做两件事：
   ① 状态灯：offline 立即显示「当前离线 · 已显示缓存内容」，online 延迟 1.5s 收起
      （弱网下 online/offline 会瞬时抖动，立即收起会「闪一下就没了」），常驻至恢复，不是 toast；
   ② ⭐ 自愈第三道闸 _navOfflineHold：navDeployProbe 是网络请求，断网必失败；不闸住就会出现
      「断网→探针判漂移→reload→再断网…」的连放风暴（与 9/20 那次数十次硬自愈同源）。
      离线期间不判定/不计数/不 reload；恢复时清空漂移计数（断网期的「漂移」是假象，不该累积）。
   ⚠️ 与 design/75 的两道防风暴闸门（_probeHandledThisBoot 每 boot 一次 + hard heal 60s 封顶）
      是叠加关系：本闸只新增，不删改前两道。
   节点直挂 body（软导航只换 <main>，天然不被误删），id 单例 + ensure-once，重复渲染不叠加。
   ⭐ 与 design/78（SW 更新提示）互斥：78 接进来时，「发现新版本」提示只允许在
      setOfflineState(false) 收起离线条之后显示（离线不可能有新版可刷）。 */
const OFFLINE_BAR_ID = 'offlineBar';
const OFFLINE_BAR_TEXT = '当前离线 · 已显示缓存内容';
let _navOfflineHold = false;      // true = 离线期：自愈判定/计数/reload 一律不执行
let _isOffline = false;           // 当前网络态（状态灯只在 true 时存在）
let _offlineHideTimer = null;     // online 后的延迟收起计时器
function setOfflineState(isOffline){
  _isOffline = !!isOffline;
  if(_isOffline){
    if(_offlineHideTimer){ clearTimeout(_offlineHideTimer); _offlineHideTimer = null; }
    _navOfflineHold = true;                       // 先落闸，再渲染（渲染异常也不能漏闸）
    try{ if(document.body) renderOfflineBar(); }catch(e){}
  } else {
    // 重连：断网期间的漂移计数是假象 → 清零（键名以自愈实测为准：hub_nav_heal_n）
    try{ sessionStorage.setItem('hub_nav_heal_n', '0'); }catch(e){}
    if(_offlineHideTimer) clearTimeout(_offlineHideTimer);   // 抖动连发 online：只保留最后一个计时器
    _offlineHideTimer = setTimeout(() => {
      _offlineHideTimer = null;
      _navOfflineHold = false;                    // 延迟撤闸：给网络一个稳定窗口，再允许自愈判定
      removeOfflineBar();
      /* design/78 接入口：此处（已在线且离线条已收起）才允许显示「发现新版本 · 点此刷新」。 */
    }, 1500);
  }
}
function renderOfflineBar(){
  if(!document.body || document.getElementById(OFFLINE_BAR_ID)) return;   // 单例：已存在不重复插
  const el = document.createElement('div');
  el.id = OFFLINE_BAR_ID;
  el.className = 'offline-bar';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = OFFLINE_BAR_TEXT;
  document.body.appendChild(el);
}
function removeOfflineBar(){
  const el = document.getElementById(OFFLINE_BAR_ID);
  if(el && el.parentNode) el.parentNode.removeChild(el);
}
function initOfflineBar(){
  if(window.__offlineBarBound) return;            // 一次性守卫：软导航/重复调用不叠加监听
  window.__offlineBarBound = true;
  window.addEventListener('offline', () => setOfflineState(true));
  window.addEventListener('online',  () => setOfflineState(false));
  if(navigator.onLine === false) setOfflineState(true);   // 冷启动即断网（事件不会补发）
  // 兜底轮询：部分代理/VPN 环境不触发 online/offline 事件。只读 navigator.onLine，不发任何请求。
  setInterval(() => {
    const off = (navigator.onLine === false);
    if(off !== _isOffline) setOfflineState(off);
  }, 30000);
}

function navDeployProbe(){
  if(_navOfflineHold) return;   // design/79 离线闸：离线期间不探测（不判定、不计数、不 reload）
  // 节流间隔可由 localStorage hub_probe_interval 覆盖（回归测试注入短间隔用；普通用户无此 key = 60s）
  let iv = 60000;
  try{ iv = Number(localStorage.getItem('hub_probe_interval')) || 60000; }catch(e){}
  if(_probeBusy || Date.now() - _probeAt < iv) return;
  _probeAt = Date.now(); _probeBusy = true;
  fetch('home.html?_probe=' + Date.now(), { cache: 'no-store' })
    .then(r => (r && r.ok) ? r.text() : '')
    .then(t => {
      _probeBusy = false;
      if(!t || !BOOT_SCRIPT_V) return;
      const doc = new DOMParser().parseFromString(t, 'text/html');
      const v = docScriptVersion(doc);
      if(v && v !== BOOT_SCRIPT_V){
        // ⭐ 每个 boot 只做一次升级判定：prefetchAll 会在同一 boot 内连打多轮探针
        //   （本地把 hub_probe_interval 压到 400ms 时一 boot 能打十几轮），
        //   不闸门的话计数会被瞬间刷到 2 → 核武连放、reload 风暴。
        if(_probeHandledThisBoot) return;
        _probeHandledThisBoot = true;
        // 漂移轮数（sessionStorage，跨 reload 保留）：≥2 说明普通 reload 无法恢复 → 才升级为 hard heal
        let n = 0;
        try{ n = Number(sessionStorage.getItem('hub_nav_heal_n') || 0); }catch(e){}
        n += 1;
        try{ sessionStorage.setItem('hub_nav_heal_n', String(n)); }catch(e){}
        console.warn('[hub] 探针检测到站点已更新（运行 ' + BOOT_SCRIPT_V + ' / 线上 ' + v + '）' +
          (n >= 2 ? '，连续 ' + n + ' 轮未恢复 → 硬自愈' : '，自动刷新'));
        if(n >= 2){ navHardHeal(); return; }
        navSelfHealReload();
      } else {
        // 探针确认线上指纹与运行指纹一致 → 清零漂移计数（离线/取不到响应时不动计数，见 catch）
        try{ sessionStorage.setItem('hub_nav_heal_n', '0'); }catch(e){}
      }
    })
    .catch(() => { _probeBusy = false; });
}
function navCached(file){ return _navDocCache.has(file); }
async function navGetDoc(file){
  navDeployProbe();                        // 后台部署探针（节流）：内存命中路径也绕不开的漂移检测
  if(_navDocCache.has(file)){
    const hit = _navDocCache.get(file);
    return hit.doc;                            // 内存命中不再比对：同页基线机制下命中即本会话已知状态
  }
  const res = await fetch(file, navFetchOpts());   // 走 HTTP 缓存：未变动 304，部署后 ?v= 变化拿新
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  navVersionCheck(file, doc);                  // 与同页旧基线比对，首获该页不比对
  _navDocCache.set(file, { doc, v: docScriptVersion(doc) });
  return doc;
}
async function navGetCode(src){
  if(_navCodeCache.has(src)) return _navCodeCache.get(src);
  const res = await fetch(src, navFetchOpts());
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const code = await res.text();
  _navCodeCache.set(src, code);
  return code;
}
/* 目标页要执行的脚本清单（按 HTML 声明顺序；主脚本下标记在 list.mainIdx）
   ⚠️ 9/15 之之实锤：旧版强制「主脚本在前」，破坏 HTML 声明顺序——speaking.html 里
   sentence-drill.js（顶层置 window.__SENT_V2_ON 旗）声明在 speaking.js 之前，
   软导航首进时 speaking.js 先 eval、读到旗还是 undefined → 默认落空 pdView（页面空白），
   第二次进时旗已在 window 残留为 true 才正常。必须严格按声明顺序 eval。 */
function pageScriptSources(id, doc){
  const list = [];
  const mainBase = 'js/' + id + '.js';
  let mainSrc = mainBase;
  if(doc){
    const s = doc.querySelector('script[src*="' + mainBase + '"]');
    if(s && s.getAttribute('src')) mainSrc = s.getAttribute('src');
  }
  let mainIdx = -1;
  if(doc){
    doc.querySelectorAll('script[src]').forEach(s => {
      const src = s.getAttribute('src');
      if(!src || !src.startsWith('js/')) return;
      const base = src.split('?')[0];
      if(base === 'js/data.js' || base === 'js/common.js') return;
      if(base === mainBase){ mainIdx = list.length; list.push(mainSrc); return; }
      if(list.indexOf(src) === -1) list.push(src);
    });
  }
  /* 🔴 10/4 18:42 组页（plans-hub / study / me）共用 js/hubgroup.js，**没有** js/{id}.js。
     原写法 `if(mainIdx === -1){ list.unshift(mainSrc) }` 会把一个**不存在的 js/study.js**
     硬塞进清单最前 -> 软导航时必然吃一发 404（虽然有 catch 静默，但会拖慢且污染控制台）。
     正解：doc 存在且里面**确实声明了别的业务脚本**时就不补 mainSrc（那些声明才是真脚本）；
     只有 doc 缺失（fetch 失败）才退回按 id 猜。 */
  if(mainIdx === -1){
    if(doc){
      if(list.indexOf(mainSrc) === -1 && list.length > 0) mainIdx = 0;   // 已有声明 -> 用它，不补
      else if(list.length === 0) throw new Error('no-script:' + id);     // 一个都没有 -> 交由上层兜底
    }else{
      list.unshift(mainSrc); mainIdx = 0;   // doc 缺失才退回按 id 猜
    }
  }
  list.mainIdx = mainIdx;
  return list;
}

async function softNavigate(t, isPop){
  if(_softNavBusy){ if(typeof toast === 'function') toast('页面切换中，请稍候…'); return; }
  _softNavBusy = true;
  try{
    if(window.matchMedia && window.matchMedia('(max-width:860px)').matches){ document.body.classList.remove('nav-open'); syncNavToggle(); }
    hubClearOrphanPageTimers();   // P0-A：离开旧页前清掉残留的计时/服药轮询心跳，避免软导航重进页面叠加“多个计时器同时跑 / 数字乱跳”
    // 命中内存缓存时这一步是同步的（微任务级），零网络、零等待
    const doc = await navGetDoc(t.href);
    const newMain = doc.querySelector('main');
    const main = document.querySelector('main');
    if(!newMain || !main) throw new Error('目标页缺少 <main>');
    swapPageStyles(doc, t.id);                          // 同步页面专属 <style>，避免样式丢失
    main.innerHTML = newMain.innerHTML;                 // 只换内容区，侧边栏/全局状态保留
    if(doc.title) document.title = doc.title;
    /* 🔴 10/6 01:12 「当前页身份」在这里一次性对齐 —— 覆盖**全部入口**（点击 / 后退 / 直接调用 softNavigate）。
       原来只有 onHubLinkClick 会写 _hubCurrentFile，popstate（浏览器后退）那条路根本不写 → 身份滞后。 */
    _hubCurrentFile = t.file;
    syncBodyPageAttrs(doc);
    /* 🔴 10/6 01:55 换页必须回到顶部 —— 修「每次点进单词页都默认滑在底部，学习和词库被遮住」。
       移动端真正的滚动容器是 `main.container`（css/common.css ≤860px 段给它 overflow-y:auto），
       软导航只换 `main.innerHTML`、**容器本身没被替换**，于是上一页的 scrollTop 原样带过来。
       浏览器原生的「新文档从顶部开始」在这里不成立，得自己归零。 */
    hubResetPageScroll();
    // ⚠️ 性能修复（口语/写作打开卡顿）：runPageScript 会 eval 2140 行的 speaking.js + 4 个附加脚本并同步渲染
    //    官方题库/P2/P3 诊断树，若直接 await 会阻塞主线程、画面“冻住”。先让本次内容交换 + 高亮先 paint，
    //    再用 requestAnimationFrame 把重脚本执行推到下一帧，打开即流畅。
    //    兜底：rAF 在后台标签页会被暂停（注释承诺过 setTimeout 兜底但原实现没有）→ rAF + 50ms 定时器竞速，
    //    哪个先到都放行，绝不因标签失焦把软导航永久卡死（_softNavBusy 无法释放）。
    await new Promise(res => {
      let done = false;
      const fin = () => { if(!done){ done = true; res(); } };
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(fin);
      setTimeout(fin, 50);
    });
    await runPageScript(t.id, doc);                     // 重新执行目标页脚本（复用 ready + 事件绑定）
    // ⚠️ 不再在这里二次 updateActiveNav：点击瞬间(onHubLinkClick)已写好正确高亮，
    //    page 脚本经代码审计确认不触碰侧栏 .active，二次写只会增加一次无效重绘、
    //    在重脚本 eval 阻塞主线程后触发“高亮闪一下”的观感。单一写入点 = 零闪烁。
    if(!isPop) history.pushState({ hub: t.id }, '', t.href);
    prefetchAll(t.id);
    hideHubLoader();                                   // 内容切换 + 脚本执行完毕（DOM 就绪）→ 淡出遮罩
  }catch(err){
    console.warn('[soft-nav] 软切换失败，回退整页跳转：', err);
    location.href = t.href;                            // 兜底：绝不让导航“卡死”
  }finally{
    _softNavBusy = false;
    hideHubLoader();                                   // 兜底：任何异常路径下都不残留遮罩
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
  if(file) _hubCurrentFile = file;   // 软导航先把真实当前页记下来，避免后续 injectNav 按滞后 pathname 错配高亮
  const nav = document.getElementById('mainNav');
  if(nav){
    nav.querySelectorAll('.side-item').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === file);
    });
  }
  // 同步「更多」弹层高亮（design/56；旧 tabbar 高亮已随组件删除）
  document.querySelectorAll('.sheet-item[data-id]').forEach(a => {
    const p = PAGES.find(pp => pp.id === a.dataset.id);
    a.classList.toggle('active', !!(p && p.file === file));
  });
  /* 🔴 10/4 17:55 dock 分组后，dock 的高亮**不能**再靠 `.ui-menu-item[data-id]` ——
     组按钮（计划/学习/我的）没有 data-id（它们是 button，data-id 只在直达型上）。
     原写法会让软导航后 dock **一个都不亮**（探针实锤：从学习组点进 writing.html，
     路径对了但 dock 全灰）。修：按「当前页属于哪个组」来点亮。
     —— 仍走 updateActiveNav 这个单一写入点，避免闪烁。 */
  if(typeof dockGroupOfPage === 'function'){
    const gid = dockGroupOfPage(file);
    document.querySelectorAll('#hubDock [data-dock-group]').forEach(b => {
      b.classList.toggle('active', !!gid && b.getAttribute('data-dock-group') === gid);
    });
  }
}

/* 重新执行目标页脚本：
   用间接 eval（window.eval）在全局作用域执行脚本源码。
   - function 声明挂到全局 → 跨页调用仍然可用；
   - let/const 只存在于本次 eval 的词法作用域 → 多次访问不会“标识符重复声明”报错，且状态随每次访问重置。
   脚本里的 ready(fn) 在已加载完成的文档上会立即同步运行 → 页面初始化自然发生。
   软导航只换 <main>，原 head 里的页面专属脚本（如 speaking.html 的 mock.js / progress.js）不会自动重跑，
   因此从目标页 HTML 里收集其余 js/*.js（排除全局 data.js / common.js 与主脚本）一并 eval，避免 tab 组件未初始化。 */
async function runPageScript(id, doc){
  const p = PAGES.find(p => p.id === id);
  if(!p) return;
  const srcs = pageScriptSources(id, doc);
  const MAIN = srcs.mainIdx || 0;   // 主脚本在声明顺序中的下标（主脚本失败才回退整页跳转）
  // ⚡ 并行拉取全部脚本（命中内存缓存时零网络）：旧实现串行 await，每多一个脚本多一个网络 RTT，
  //    口语页 6 个脚本 = 6 次串行往返；现在一次并发搞定，再按原顺序 eval（顺序不变，行为一致）。
  const got = await Promise.all(srcs.map(s =>
    navGetCode(s).then(code => ({ code })).catch(err => ({ err }))
  ));
  for(let i = 0; i < srcs.length; i++){
    if(got[i].err){
      if(i === MAIN){        // 主脚本失败：记日志后由 softNavigate 兜底走整页跳转，绝不卡死
        console.error('[soft-nav] 页面脚本执行失败，将回退整页跳转：', id, got[i].err);
        throw got[i].err;
      }
      console.warn('[soft-nav] 附加脚本加载失败，已跳过：', srcs[i], got[i].err);
      continue;
    }
    try{
      window.eval(got[i].code);   // 幂等重跑：页面 ready 内部已各自清旧心跳 / 重绑事件，多次进入不叠加
    }catch(err){
      if(i === MAIN){
        console.error('[soft-nav] 页面脚本执行失败，将回退整页跳转：', id, err);
        throw err;
      }
      console.warn('[soft-nav] 附加脚本执行失败，已跳过：', srcs[i], err);
    }
  }

/* 🔴 10/6 00:40 补（她连报 5 次「按钮点不了」的真根因）：**body 内联 <script> 也要重跑**。
     此前只 eval script[src]，而软导航换的是 <main>、head/body 内联脚本从不执行，于是：
       · settings.html 左目录切换（内联）→ 委托监听压根没绑 → 点了零反应、零报错
       · vip / settings 的 .rv 进场动画（内联）→ 新插入的 .rv 停在 opacity:0 永久隐形
       · 组页（me/study/plans-hub）自收 #bootLoader 遮罩（内联）→ 没人撤遮罩
     安全边界：只取 **body 内**的内联脚本（head 的 cls/CSP 类逻辑不重复跑）；
     脚本必须自身幂等（重绑前先 removeEventListener，见 settings.html 的 __hubSetNavHandler）。 */
  const inlineCodes = pageInlineScripts(doc);
  for(const code of inlineCodes){
    try{ window.eval(code); }
    catch(err){ console.warn('[soft-nav] 页面内联脚本执行失败，已跳过：', err); }
  }
}

  /* 🔴 10/6 01:55 把页面的滚动位置归零（软导航换页用）。
   同时处理两个可能的滚动容器：移动端的 `main.container`（overflow-y:auto）
   与整文档（桌面端/无 dock 页面仍是 window 滚动）。
   ⚠️ 不能用「有没有滚动条」来决定要不要归零 —— 容器存在就要写，写 0 无害。 */
function hubResetPageScroll(){
  try{
    const m = document.querySelector('main.container');
    if(m && m.scrollTop) m.scrollTop = 0;
    if(window.scrollY) window.scrollTo(0, 0);
  }catch(_){}
}

/* 🔴 10/6 01:55 「内容装得下就不要能滑动」——修「明明整屏能显示完却还能滑一点」。
   移动端 `main.container` 带 `padding-bottom:calc(dock高 + 10px)` 用于避让底部 dock，
   这段 padding 也让 scrollHeight 略大于 clientHeight，于是内容明明看得全却还能滑出一段空白。
   ⚠️ 只在**连 padding 一起都装得下**时才禁滑 —— 此时内容必然没被 dock 遮住，安全。
   （若内容溢出，保持 auto；否则用户够不到底部内容。） */
function hubFitPageScroll(){
  try{
    const m = document.querySelector('main.container');
    if(!m) return;
    m.style.overflowY = (m.scrollHeight > m.clientHeight + 2) ? 'auto' : 'hidden';
  }catch(_){}
}

/* 🔴 10/6 01:12 同步 <body> 上的**页面级**属性 —— 修「点计划/我的，渲染出来全是学习页」。
   背景：软导航只换 <main>，从不碰 <body>，于是 `body[data-hub-group]` 永远停留在
   **第一次硬加载的那张组页**（`<body data-hub-group="study">` 写在 HTML 里）。
   hubgroup.js 的 hostGroup() 又把它排在第一优先 → 之后进任何组页都渲染成那一个组。
   ⭐ 探针证据（tests/_probe_dock_group_1006.cjs）：先硬开 study → 走到主页 → 点计划 → 渲染「学习」。
   ⚠️ **只精确动 data-hub-group 这一族，不清空 body 的全部 data-*** ——
      运行时还有别人在用 body 的 data-*：av-picker 的 `data-avtab`、words 的 `body.dataset.init`，
      一把全删会把它们的中间状态抹掉。对这类只做「目标有就覆盖」，不删除。 */
function syncBodyPageAttrs(doc){
  try{
    const src = doc && doc.body, cur = document.body;
    if(!src || !cur) return;
    const GROUP = 'data-hub-group';
    const v = src.getAttribute(GROUP);
    if(v) cur.setAttribute(GROUP, v); else cur.removeAttribute(GROUP);
  }catch(_){}
}

/* 收集目标页 body 内的内联脚本源码（无 src 的 <script>），供软导航时 eval。 */
function pageInlineScripts(doc){
  if(!doc || !doc.body || !doc.body.querySelectorAll) return [];
  const out = [];
  doc.body.querySelectorAll('script').forEach(s => {
    if(s.hasAttribute('src')) return;                 // 外部脚本由 pageScriptSources 负责
    const t = (s.textContent || '').trim();
    if(t) out.push(t);
  });
  return out;
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

/* ===== 空闲预热（9/9 性能专项） =====
   旧 prefetchNeighbors 只预取「前后各 1 个邻居」，而 tab 是平铺的、她随手跳任意页 → 预取命中率极低，
   等于每次切页都要现拉 100~300KB 脚本。现在改为全量预热：页面 HTML + 该页全部脚本源码进内存缓存。
   - 顺序：当前页相邻 → 收藏页 → 其余，逐个 requestIdleCallback 排队，不与当前页渲染抢主线程；
   - 幂等：已缓存的页直接跳过；切换后再调用也几乎零成本；
   - 省流/2G 下自动关闭（她农村网络，避免后台偷跑流量）。 */
function navPrefetchAllowed(){
  try{
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(!c) return true;
    if(c.saveData) return false;
    return !(c.effectiveType && /^(slow-)?2g$/.test(c.effectiveType));
  }catch(e){ return true; }
}
function prefetchPage(id){
  const p = PAGES.find(pp => pp.id === id);
  if(!p || _navDocCache.has(p.file)) return Promise.resolve();
  return navGetDoc(p.file).then(doc => {
    const srcs = pageScriptSources(id, doc);
    return Promise.all(srcs.map(s => navGetCode(s).catch(() => '')));
  }).catch(() => {});
}
let _prefetchRunning = false;
function prefetchAll(curId){
  if(!navPrefetchAllowed()) return;
  if(_prefetchRunning) return;
  _prefetchRunning = true;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 800));
  const order = [];
  const push = id => { if(id && order.indexOf(id) === -1 && PAGES.some(p => p.id === id)) order.push(id); };
  if(curId){                                   // 先照顾当前页左右邻居（最可能下一个点的）
    const idx = PAGES.findIndex(p => p.id === curId);
    if(idx > -1){ push(PAGES[idx - 1] && PAGES[idx - 1].id); push(PAGES[idx + 1] && PAGES[idx + 1].id); }
  }
  try{ (typeof favPageIds === 'function' ? favPageIds() : []).forEach(push); }catch(e){}
  PAGES.forEach(p => push(p.id));
  let i = 0;
  const step = () => {
    if(i >= order.length){ _prefetchRunning = false; return; }
    const id = order[i++];
    const p = PAGES.find(pp => pp.id === id);
    if(!p || _navDocCache.has(p.file)){ idle(step); return; }   // 已缓存 → 跳过
    prefetchPage(id).then(() => idle(step)).catch(() => idle(step));
  };
  idle(step);
}

/* ⭐ 引导用的常量必须声明在「本文件末尾的引导函数区」之前：common.js 是 defer 脚本，
   ready(fn) 在 readyState 已 interactive 时会同步执行 —— 若常量声明在文件末尾，
   同步执行那一刻它们还在 TDZ 里，访问即抛 ReferenceError（且被 initOnboarding 的 try 吞掉，
   表现为「引导死活不弹」）。同理：任何在启动流程里被同步用到的 const/let 都要写在启动块之前。 */
/* ===== design/80 PWA 安装引导（加固版） =====
   前提核实：manifest（start_url / display:standalone / 3 图标含 maskable）、SW 注册、图标**全已现成**，
   她桌面也装过一次 PWA。所以本条不是「从零做安装能力」，只补「想装但不知道怎么装」的缺口。
   ⭐ 三原则：① 只放设置页（新增浮动/交互默认被砍）；② 已装就彻底隐藏（不给点了没反应的按钮）；
   ③ beforeinstallprompt 事件对象只能用一次 → 用完立刻清空，二次 prompt() 会 reject。
   ⚠️ _deferredPrompt 必须在启动块之前声明：defer 脚本里 ready(fn) 会同步执行（TDZ 铁律）。 */
let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  try{ e.preventDefault(); }catch(_){}          // 拦掉浏览器 mini-infobar，改由设置页自己给入口
  _deferredPrompt = e;
  try{ document.dispatchEvent(new CustomEvent('hub:pwa-available')); }catch(_){}
});
window.addEventListener('appinstalled', () => {
  _deferredPrompt = null;                        // 已装：事件作废，卡片交给设置页隐藏
  try{ document.dispatchEvent(new CustomEvent('hub:pwa-installed')); }catch(_){}
});
function hubPwaState(){
  try{
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
    if(standalone) return 'installed';           // 已装：直接隐藏整块，绝不留死按钮
    if(_deferredPrompt) return 'promptable';
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    if(iOS) return 'ios-manual';                 // iOS 永远没有该事件，只能文字引导
    return 'unsupported';
  }catch(e){ return 'unsupported'; }
}
async function hubPwaInstall(){
  const p = _deferredPrompt;
  if(!p) return 'none';
  _deferredPrompt = null;                        // ⭐ 该事件对象只能用一次，调 prompt 前先作废引用
  try{
    p.prompt();
    const r = await p.userChoice;
    return (r && r.outcome) || 'dismissed';
  }catch(e){ return 'error'; }
}

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
  return { v:2, entered:false, finished:false, setup:{ exam:false, effort:false, words:false }, snoozed:false, ts:0 };
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
      if(typeof switchWordTab === 'function'){ try{ switchWordTab('bank'); }catch(e){} return; }
      if(n-- <= 0) return;
      setTimeout(wait, 120);
    })();
  }, 200);
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
  next.textContent = (step === 1 ? '开始配置 →' : (step === 3 ? '进站开工 →' : '继续 →'));
  next.addEventListener('click', function(){ _onbStepNext(step); });
  nav.appendChild(next);
  wrap.appendChild(nav);
  el.appendChild(wrap);
  el.hidden = false;

  /* P0 10/3 紧急修复：onbOverlay 偶尔 stuck visible（initOnboarding 之后无 handler 关闭）
     —— 遮罩空白处点击关闭（onbFinish(false)）；Escape 键关闭；30s 自动关闭（兜底）
     三条互不冲突，都是幂等安全（onbClose 重复调零成本）。 */
  if(!el.dataset._onbDismissBound){
    el.dataset._onbDismissBound = '1';
    // 点遮罩空白处关闭（点到 wrap/dialog 内部：target !== el 不关闭）
    el.addEventListener('click', function(e){ if(e && e.target === el){ onbFinish(false); } });
    // Escape 键关闭（挂 document，避免 dialog 里 input 聚焦时收不到）
    el._onbEscape = function(e){ if(e && e.key === 'Escape' && !el.hidden){ onbFinish(false); } };
    document.addEventListener('keydown', el._onbEscape);
    // 30s 自动关闭（兜底——防止任何原因导致 onbRenderSetup 之后无人调 onbFinish/onbClose）
    el._onbAuto = setTimeout(function(){ if(!el.hidden){ onbFinish(false); } }, 30000);
    // onbClose 时清理监听和计时器
    const origClose = window.onbClose;
    window.onbClose = function(){
      if(el._onbEscape){ document.removeEventListener('keydown', el._onbEscape); el._onbEscape = null; }
      if(el._onbAuto){ clearTimeout(el._onbAuto); el._onbAuto = null; }
      origClose();
    };
  }

  // 回车 = 继续（避免在输入框里敲回车没反应）
  try{
    wrap.addEventListener('keydown', function(e){
      if(e && e.key === 'Enter' && e.target && e.target.tagName === 'INPUT'){ e.preventDefault(); next.click(); }
    });
  }catch(_){}
  try{ setTimeout(function(){ const f = pane.querySelector('input'); if(f) f.focus(); }, 80); }catch(_){}
  if(hook){ try{ hook(step); }catch(_){} }
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
    try{ sessionStorage.setItem('hub_wb_goto', 'awl'); }catch(e){}
    location.href = 'practice.html';
  });
  pane.appendChild(goAwl);
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
     ['每日投入', (hours > 0 ? (hours + ' 小时') : '未设置') + ' · 背词 ' + (cap > 0 ? (cap + ' 个') : '不限')]
    ].forEach(function(x){
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = x[0];
      const sp = document.createElement('span'); sp.textContent = x[1];
      li.appendChild(b); li.appendChild(sp);
      list.appendChild(li);
    });
    pane.appendChild(list);
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
   planJumpInfo 文本猜测。file/label 必须与 plans.js PLAN_WL 保持一致（diag4 探针有一致性断言）。
   目前落地页认的 query 只有 speaking 的 ?open=（题 id）与全站 ?autostart=1；speaking.practice 的
   params.qno 按题库顺序换题 id 直达，其余模块落到功能页自动计时；其余 params 随任务数据保留。 */
const PLAN_GEN_PAGES = {
  practice:  { file:'practice.html',  label:'听读练习' },
  speaking:  { file:'speaking.html', label:'口语练习' },
  materials: { file:'materials.html', label:'口语素材' },
  writing:   { file:'writing.html',   label:'写作' },
  words:     { file:'practice.html',  label:'背单词' },
  corpus:    { file:'corpus.html',    label:'长难句' },
  wrongbook: { file:'wrongbook.html', label:'错题本' }
};
function planGenJump(item){
  if(!item || !item.module) return null;
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
  if(/写作|作文/.test(t)) return { file: 'writing.html', open: '', label: '去写作' };
  if(/错题|错句本/.test(t)) return { file: 'wrongbook.html', open: '', label: '去错题本' };
  if(/素材|串题/.test(t)) return { file: 'materials.html', open: '', label: '去素材库' };
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
