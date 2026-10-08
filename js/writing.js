var curCat = null;
var curId = null;
var curTab = 'tpl';
var tplSearch = '';
var bankSearch = '';

/* 9/16 修：全文「词」的统计口径统一到这一个函数。改之前四处各算一套口水不平：
   - AI 评分 tab 的实时词数用 /\S+/g
   - 写作真题 tab 的实时词数用 /\b[\w'-]+\b/g（同一句/bootstrap两种数字，纯中文时前者算 1、后者算 0）
   - scoreEssay / examStopAndScore 的门槛用 essay.length（那是**字符数**，30 词≈390 字符，直接放行）
   雅思官方算法按「非空白字符段」计词，这里用 /\S+/g 对齐同站 AI 评分 tab 既有口径。 */
function wtCountWords(text){ return (String(text || '').trim().match(/\S+/g) || []).length; }
/* 9/17 之之拍板：评分门槛按官方要求分题型 —— Task 1 ≥150 词、Task 2 ≥250 词。
   真题页给考生的指令一直印着 "Write at least 250/150 words"，门槛必须跟它一致。 */
function wtMinWords(type){ return type === '大作文' ? 250 : 150; }
/* 写作目标分动态画像（商业化）：prompt 里的目标分描述统一从这里出 */
function wtTargetText(){
  const T = (DATA.settings && DATA.settings.targets) || {};
  const w = parseFloat(T.writing), o = parseFloat(T.overall);
  /* 10/2 修：空目标分落库值是数字 0（data.js 默认/settings 保存口径），
     不能只判 isNaN——0 会穿透成「目标写作 0 分（总分 0）」。0 一律按未填处理（全站同口径）。 */
  if(w > 0) return '考生目标写作 ' + w + ' 分' + (o > 0 ? '（总分 ' + o + '）' : '');
  if(o > 0) return '考生目标总分 ' + o + ' 分（写作单项目标未单独填写，按与总分匹配的水平给分）';
  return '考生未填写目标分，按雅思官方评分标准正常给分，不预设水平';
}

function switchWriteTab(tab){
  curTab = tab;
  const btn = $('#writeTabs').querySelector('[data-tab="' + tab + '"]');
  $('#writeTabs').querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === btn));
  $('#tplPanel').hidden = tab !== 'tpl';
  $('#bankPanel').hidden = tab !== 'bank';
  $('#scorePanel').hidden = tab !== 'score';
  $('#examPanel').hidden = tab !== 'exam';
  /* 10/2（她拍板）：「错句」Tab 已删——错句本并入 tplPanel 底部折叠区（#wbArea），随模板面板显隐 */
  $('#dictationPanel').hidden = tab !== 'dictation';
  if(tab === 'bank') renderBank();
  if(tab === 'score') renderScoreHist();
  if(tab === 'exam') renderExamList();
}

/* 10/2 模板会员闸状态：必须声明在 ready( 调用之前——common.js 的 ready 回调会同步执行（defer 场景），
   声明放后面会 TDZ「Cannot access before initialization」（老坑，见 HANDOFF 铁律） */
let tplVip = null;   // null=未知/查询中（详情暂锁，scheduleVipRecheck 复查）；true/false = 已确认

ready(() => {
  // 迁移：清洗写作模板分类名/标题里的括号后缀（如「观点型（第一优先级）」→「观点型」），就地改写并保存
  migrateWritingCategoryNames();

  // Tab 切换
  $('#writeTabs').querySelectorAll('[data-tab]').forEach(b => {
    b.addEventListener('click', () => switchWriteTab(b.dataset.tab));
  });

  // 模板库
  renderCats();
  // 会员闸：查完刷新列表（🔓/🔒 角标）与当前详情（若停在锁定视图则解锁重渲染）
  queryVipGate().then(v => { renderList(); if(curId && !$('#detailCard').hidden) openTpl(curId); scheduleVipRecheck(); });
  $('#backBtn').addEventListener('click', () => { $('#detailCard').hidden = true; $('#listCard').hidden = false; document.querySelector('.write-layout')?.classList.remove('detail-open'); });
  $('#addBtn').addEventListener('click', () => { $('#addCard').hidden = false; $('#listCard').hidden = true; $('#detailCard').hidden = true; });
  $('#a_cancel').addEventListener('click', () => { $('#addCard').hidden = true; $('#listCard').hidden = false; });
  $('#a_save').addEventListener('click', addTpl);
  $('#delBtn').addEventListener('click', delTpl);
  $('#tplRecheckBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = '检测中…';
    queryVipGate._tries = 0;
    await queryVipGate(true);          // 跳过缓存直查后端
    renderList();
    if(curId && !$('#detailCard').hidden) openTpl(curId);
    scheduleVipRecheck();
    btn.disabled = false; btn.textContent = '我是会员，重新检测一下';
    if(tplVip === true) toast('已识别为会员，模板已解锁');
    else if(tplVip === false) toast('这个账号当前不是会员，请到「会员」页查看');
    else toast('网络不通，没查到。稍等几秒会自动再试一次');
  });

  // 模板内联默写：把模板骨架当默写源（自包含默写 UI + AI 批改）
  $('#tplDictBtn').addEventListener('click', () => openTplDict(curId));
  $('#wtDictBack').addEventListener('click', () => switchWriteTab('tpl'));
  $('#wtDictSubmit').addEventListener('click', submitWtDict);
  $('#wtDictClear').addEventListener('click', () => { if(wtDictCurrent){ $('#wtDictInput').value = ''; clearWtDictDraft(wtDictCurrent.id); } toast('已清空，重新默写'); });
  $('#wtDictDiscardDraft').addEventListener('click', () => { if(wtDictCurrent){ clearWtDictDraft(wtDictCurrent.id); $('#wtDictInput').value = ''; $('#wtDictResult').hidden = true; $('#wtDictResult').innerHTML = ''; toast('已放弃草稿'); } });

  // AI 评分
  $('#scoreBtn').addEventListener('click', scoreEssay);
  $('#tplScoreBtn').addEventListener('click', scoreTemplate);
  $('#tplCopyBtn').addEventListener('click', copyFilled);

  // P1：语病卡「定位原文」事件委托（动态渲染的卡片无需重复绑定）
  document.addEventListener('click', e => {
    const locBtn = e.target.closest ? e.target.closest('.ts-loc') : null;
    if(locBtn){
      const gramCard = locBtn.closest('.ts-gram');
      const sEl = gramCard ? gramCard.querySelector('s') : null;
      if(!locateInPage(sEl ? sEl.textContent : '')) toast('原文里没定位到这句');
    }
  });

  // A4 实时词数
  const wcEl = $('#scoreWordCount');
  const wcInput = $('#scoreEssay');
  if(wcEl && wcInput){
    // 9/16 修：词数改走 wtCountWords，与评分门槛同一口径（原来这里是 /\S+/g、真题页是 /\b[\w'-]+\b/g）
    // 9/17：染色阈值跟随所选题型（Task 1 150 / Task 2 250）
    const updWc = () => {
      const n = wtCountWords(wcInput.value);
      const min = wtMinWords($('#scoreType') ? $('#scoreType').value : '大作文');
      wcEl.textContent = n + ' 词';
      wcEl.style.color = n >= min ? 'var(--primary)' : 'var(--warn-ink)';
    };
    wcInput.addEventListener('input', updWc);
    const stEl = $('#scoreType');
    if(stEl) stEl.addEventListener('change', updWc);   // 换题型时阈值跟着换
    updWc();
  }

  // 10/8 题目框：草稿存 localStorage（wt_score_topic_v1），不进 DATA 顶层（免登记 mergeData）
  const topicTa = $('#scoreTopic');
  if(topicTa){
    const TOPIC_KEY = 'wt_score_topic_v1';
    const topicChipRender = () => {
      const has = !!topicTa.value.trim();
      const clearBtn = $('#scoreTopicClear'), chip = $('#scoreTopicChip');
      if(clearBtn) clearBtn.style.display = has ? '' : 'none';
      if(chip) chip.textContent = has ? '已存题目：AI 评分会按它判切题度并给思路' : '';
    };
    try{ const saved = localStorage.getItem(TOPIC_KEY); if(saved) topicTa.value = saved; }catch(e){}
    topicTa.addEventListener('input', topicChipRender);
    topicTa.addEventListener('change', () => { try{ localStorage.setItem(TOPIC_KEY, topicTa.value.trim()); }catch(e){} });   // 失焦自动存，防忘点保存
    $('#scoreTopicSave').addEventListener('click', () => {
      try{ localStorage.setItem(TOPIC_KEY, topicTa.value.trim()); }catch(e){}
      topicChipRender();
      if(topicTa.value.trim()){
        /* 10/8 她拍板：点保存 = 直通真题全屏（左题右答），不再只是聚焦输入框 */
        openExamCustom();
      } else toast('先把题干粘进上面的框');
    });
    $('#scoreTopicClear').addEventListener('click', () => { topicTa.value = ''; try{ localStorage.removeItem(TOPIC_KEY); }catch(e){} topicChipRender(); });
    topicChipRender();
  }

  // A1 评分记录
  renderScoreHist();
  const histClear = $('#scoreHistClear');
  if(histClear) histClear.addEventListener('click', () => {
    if(!confirm('确定清空全部评分记录？')) return;
    // 修(a 播种复活)：writingScores 在 SYNC_ARRAY_FIELDS 内按 id 并集合并、靠 deletedIds 墓碑过滤。
    // 原写法直接置空数组、不写墓碑 → 下次云同步把云端旧记录原样并回来（删了又回来）。
    // 墓碑口径对齐 common.js mergeData 的 delKey：优先 id，老记录缺 id 用 ts 兜底。
    (DATA.writingScores || []).forEach(r => {
      const k = (r && r.id != null) ? r.id : (r && r.ts != null) ? r.ts : null;
      if(k != null){
        DATA.deletedIds = DATA.deletedIds || [];
        if(!DATA.deletedIds.includes(k)) DATA.deletedIds.push(k);
      }
    });
    DATA.writingScores = [];
    hubSave();
    renderScoreHist();
    toast('已清空');
  });

  // 语料库
  $('#bankFilter').addEventListener('change', renderBank);
  const tplSearchEl = document.getElementById('tplSearch');
  if(tplSearchEl) tplSearchEl.addEventListener('input', () => { tplSearch = tplSearchEl.value.trim().toLowerCase(); renderList(); });
  const bankSearchEl = document.getElementById('bankSearch');
  if(bankSearchEl) bankSearchEl.addEventListener('input', () => { bankSearch = bankSearchEl.value.trim().toLowerCase(); renderBank(); });
  $('#bankAddBtn').addEventListener('click', () => { $('#bankAddCard').hidden = false; });
  $('#ba_cancel').addEventListener('click', () => { $('#bankAddCard').hidden = true; });
  $('#ba_save').addEventListener('click', addPhrase);
  $('#ba_aiImport').addEventListener('click', aiImportPhrases);

  // 写作真题
  bindExam();
});

/* ===== 模板库 ===== */
// 注：cleanCatName 已上移到 common.js（共享工具，错句本等不引入 writing.js 的页面也需用到）
// 迁移：把 DATA.writing 里所有模板的 category/title 就地清洗（去掉括号后缀），并持久化，使渲染/过滤全程一致
function migrateWritingCategoryNames(){
  let changed = false;
  (DATA.writing || []).forEach(t => {
    if(!t) return;
    if(typeof t.category === 'string'){
      const c = cleanCatName(t.category);
      if(c !== t.category){ t.category = c; changed = true; }
    }
    if(typeof t.title === 'string'){
      const ti = cleanCatName(t.title);
      if(ti !== t.title){ t.title = ti; changed = true; }
    }
  });
  if(changed) hubSave();
}
function renderCats(){
  /* 10/2（她拍板）：分类栏固定显示雅思作文全类型——大作文补齐 5 类（新增「优缺点型」「双问题型」，
     暂无模板的先空着显示 ·0），小作文 4 类不动；数据里的自定义分类追加在「自定义」组。 */
  const CAT_TASK2 = ['观点型','讨论型','优缺点型','Report','双问题型'];
  const CAT_TASK1 = ['动态图','静态图','地图题','流程图'];
  const order = CAT_TASK2.concat(CAT_TASK1);
  const extra = [];
  DATA.writing.forEach(t => { const c = cleanCatName(t.category); if(!order.includes(c) && !extra.includes(c)) extra.push(c); });
  const all = order.concat(extra);
  const cntOf = c => DATA.writing.filter(t => cleanCatName(t.category) === c).length;
  const nav = $('#catNav');
  // 不存在就回落到一个还存在的分类（9/16 修的口径，保留）
  if(!curCat || !all.includes(curCat)) curCat = all[0];
  const btn = c => '<button class="btn' + (c===curCat?' active':'') + '" data-cat="' + escapeHtml(c) + '"><span class="cat-name">' + escapeHtml(c) + '</span><span class="cat-cnt">' + cntOf(c) + '</span></button>';
  nav.innerHTML = '<div class="cat-group-label">大作文 · Task 2</div>' + CAT_TASK2.map(btn).join('')
    + '<div class="cat-group-label">小作文 · Task 1</div>' + CAT_TASK1.map(btn).join('')
    + (extra.length ? '<div class="cat-group-label">自定义</div>' + extra.map(btn).join('') : '');
  nav.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { curCat = b.dataset.cat; renderCats(); renderList(); }));
  renderList();
}

function renderList(){
  let list = DATA.writing.filter(t => t.category === curCat);
  if(tplSearch){ list = list.filter(t => (cleanCatName(t.title)+' '+t.category).toLowerCase().indexOf(tplSearch) !== -1); }
  const lockTag = (tplVip === true) ? '' : '<span class="badge" style="position:absolute;top:10px;right:10px" title="会员专属">🔒</span>';
  /* 10/4（她 12:57 反馈「模板列表里套了一层空壳卡片」）：
     模板标题常与分类名相同（都叫「观点型」），原实现无条件渲染两行 → 同一句话显示两遍，
     看起来像一张空壳卡。标题与分类一致时不再重复渲染分类行。 */
  $('#tplList').innerHTML = list.map(t => {
    const tt = cleanCatName(t.title);
    const cat = t.category || '';
    const sub = (cat && cat !== tt)
      ? '<div class="muted" style="font-size:13px;margin-top:4px">' + escapeHtml(cat) + '</div>'
      : '';
    return '<div class="card tpl-card" data-id="' + t.id + '" style="position:relative">'
      + lockTag + '<b>' + escapeHtml(tt) + '</b>' + sub + '</div>';
  }).join('');
  $('#empty').hidden = list.length > 0;
  $('#tplList').querySelectorAll('[data-id]').forEach(c => c.addEventListener('click', () => openTpl(c.dataset.id)));
}

/* 10/2（她拍板）：作文模板 = 会员专属。展示层锁：
   免费用户能看模板列表（标题+分类+🔒 角标，留转化钩子），点开详情只显示会员引导卡，
   模板正文/填空练习/完整句/默写/评分入口全部不渲染。
   ⚠️ 局限（如实告知）：模板数据仍在本地 DATA（随云同步分发），前端锁防的是「页面上看不了」，
   防不住懂 devtools 的人从本地数据里翻；要硬隔离得把模板挪服务端按鉴权下发（破坏离线可用，暂不做）。
   会员判定：调 authApiPost({action:'vip_status'})，结果存 sessionStorage（会话级，切会话重查）。
   自建模板暂与官方模板同锁；若要「自建的自己能看」需给模板加内置/自建标记字段。 */


/* 🔴 10/6 20:55 重写（她报「我明明是 VIP 号，写作页却给我锁了」）。
   老口径的病：catch 里 tplVip=false 且把'0' 写进 sessionStorage —— 一次网络抖动/
   Worker 超限(1101)/401 就被永久记成非会员，而 sessionStorage 跨刷新存活，
   锁卡上「刷新本页」那句提示因此永远无效；vip.html 又是实时查的 → 两页自相矛盾。
   新口径：查失败 = null（未知）→ 当作「先不锁」并稍后自动复查；真非会员才锁。 */
async function queryVipGate(force){
  let v = null;
  try{ v = await authVipCheck(!!force); }catch(e){ v = null; }
  tplVip = (v === null) ? null : v;   // null = 未知（不放行内容，但会复查）
  return tplVip;
}

/* 未知态的兜底复查：3 秒后再问一次，仍失败就一直重试（最多 3 次），避免永久锁死。
   复查期间锁卡照常显示，但她刷新/切回页面时总能自愈，不必手动清缓存。 */
function scheduleVipRecheck(){
  if(tplVip !== null) return;
  if((queryVipGate._tries || 0) >= 3) return;
  queryVipGate._tries = (queryVipGate._tries || 0) + 1;
  setTimeout(async () => {
    await queryVipGate(true);
    renderList();
    if(curId && !$('#detailCard').hidden) openTpl(curId);
    scheduleVipRecheck();
  }, 3000);
}

/* 锁定视图：隐藏全部模板内容块，显示会员引导卡 */
function renderTplLocked(){
  document.querySelectorAll('#detailCard .tpl-edit, #detailCard .tpl-text').forEach(el => el.style.display = 'none');
  const hideIds = ['tips','tplWrongBox','tplDictBtn','delBtn'];
  hideIds.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
  const pr = document.getElementById('practice'); if(pr) pr.innerHTML = '';
  const pv = document.getElementById('preview'); if(pv) pv.innerHTML = '';
  const sb = document.getElementById('tplScoreBox'); if(sb){ sb.hidden = true; sb.innerHTML = ''; }
  const lock = document.getElementById('tplLockCard'); if(lock) lock.hidden = false;
}

/* 解锁恢复：会员进入详情时恢复被锁区块的显示 */
function restoreTplBlocks(){
  document.querySelectorAll('#detailCard .tpl-edit, #detailCard .tpl-text').forEach(el => el.style.display = '');
  /* 10/2 修：名单必须与 renderTplLocked 的 hideIds 完全一致——之前漏了 tplWrongBox，
     同一次会话里锁→解锁后「我的错句」折叠区带着内联 display:none，renderTplWrong 只翻 hidden 救不回来。 */
  ['tips','tplWrongBox','tplDictBtn','delBtn'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = ''; });
  const lock = document.getElementById('tplLockCard'); if(lock) lock.hidden = true;
}

function openTpl(id){
  const t = DATA.writing.find(x => x.id === id);
  if(!t) return;
  curId = id;
  $('#listCard').hidden = true; $('#detailCard').hidden = false;
  document.querySelector('.write-layout')?.classList.add('detail-open');
  $('#dTitle').textContent = cleanCatName(t.title);
  if(tplVip !== true){ renderTplLocked(); return; }   // 会员闸：非会员只给锁卡（10/2 她拍板）
  restoreTplBlocks();
  /* 「作文骨架」原文块已删（她 10/1：与填空练习/完整句重复）；骨架数据仍是填空/默写/评分的源，只删展示 */
  $('#tips').innerHTML = t.tips ? escapeHtml(t.tips).replace(/\n/g,'<br>') : '';
  const sb = $('#tplScoreBox');
  if(sb){ sb.hidden = true; sb.innerHTML = ''; }   // 换模板时清掉上一份评分
  buildPractice(t.skeleton);
  renderTplWrong('tpl_' + t.id);   // 本模板「我的错句」折叠区
}

// 写作模板详情下的「我的错句」折叠区：聚合该模板默写错句
function renderTplWrong(sourceId){
  const box = $('#tplWrongBox');
  if(!box) return;
  const items = collectWrongBySource(sourceId);
  if(!items.length){ box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<details class="tpl-wrong-wrap"><summary class="tpl-wrong-sum" style="cursor:pointer;padding:9px 12px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);font-size:13.5px;user-select:none">我的错句（' + items.length + ' 条 · 点开回顾）</summary>'
    + '<div class="tpl-wrong-list" style="background:var(--surface-2);border:1px solid var(--line);border-top:none;border-radius:0 0 var(--radius) var(--radius);padding:10px 12px">'
    + items.map(it => '<div class="tpl-wrong-item" style="padding:6px 0;border-bottom:1px dashed var(--line);font-size:13.5px">'
        + '<div>正确：<code>' + escapeHtml(it.right) + '</code>' + (it.count > 1 ? ' <span class="dict-weak-tag" title="错 ' + it.count + ' 次">★×' + it.count + '</span>' : '') + '</div>'
        + (it.wrong ? '<div class="muted" style="font-size:12.5px">你写：' + escapeHtml(it.wrong) + '</div>' : '<div class="muted" style="font-size:12.5px">（漏写）</div>')
      + '</div>').join('')
    + '</div></details>';
}

// 填空框宽度：用隐藏 mirror <span> 按真实渲染字体精确测量，保证随文字增长且不溢出
let __phMirror = null;
function fitInput(inp){
  if(!__phMirror){
    __phMirror = document.createElement('span');
    __phMirror.style.position = 'absolute';
    __phMirror.style.visibility = 'hidden';
    __phMirror.style.whiteSpace = 'pre';
    __phMirror.style.left = '-9999px';
    __phMirror.style.top = '0';
    document.body.appendChild(__phMirror);
  }
  const t = (inp.value || inp.dataset.ph || ' ');
  // 复制输入框的真实字体样式，保证测量与渲染完全一致（canvas 测字体栈会回退默认字体导致偏窄）
  const cs = window.getComputedStyle(inp);
  __phMirror.style.font = cs.font;
  __phMirror.style.fontFamily = cs.fontFamily;
  __phMirror.style.fontSize = cs.fontSize;
  __phMirror.style.fontWeight = cs.fontWeight;
  __phMirror.style.fontStyle = cs.fontStyle;
  __phMirror.style.letterSpacing = cs.letterSpacing;
  __phMirror.textContent = t;
  // 真实占用宽度 = 文字宽 + 输入框左右内边距 + 左右边框（box-sizing:border-box 下都算进 width）
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const borderX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const w = Math.max(__phMirror.offsetWidth + padX + borderX + 6, 60);   // +6px buffer，不封顶
  inp.style.width = w + 'px';
}

function buildPractice(skeleton){
  const parts = skeleton.split(/(【[^】]*】)/g);
  let html = '';
  let phIdx = 0;
  parts.forEach(p => {
    const m = p.match(/^【(.+?)】$/);
    if(m){
      const esc = escapeHtml(m[1]);
      html += '<span class="ph-wrap" data-idx="' + phIdx + '">'
            +   '<input class="ph-input" data-ph="' + esc + '" placeholder="' + esc + '">'
            +   '<button class="ph-hint" type="button" data-ph="' + esc + '" title="AI 给这个空的建议"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.5-1 2.5h-6c0-1-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/></svg></button>'
            +   '<span class="ph-hint-box" data-for="' + esc + '" hidden></span>'
            + '</span>';
      phIdx++;
    } else { html += escapeHtml(p); }
  });
  const box = $('#practice');
  box.innerHTML = html;
  box.querySelectorAll('.ph-input').forEach(inp => { fitInput(inp); inp.addEventListener('input', () => { fitInput(inp); updatePreview(); }); });
  box.querySelectorAll('.ph-hint').forEach(btn => btn.addEventListener('click', () => hintBlank(btn)));
  updatePreview();
}

async function hintBlank(btn){
  const wrap = btn.closest('.ph-wrap');
  if(!wrap) return;
  const inp = wrap.querySelector('.ph-input');
  const box = wrap.querySelector('.ph-hint-box');
  if(!box) return;
  const ph = inp.dataset.ph;   // 占位提示文本仍用于拼 prompt
  const t = DATA.writing.find(x => x.id === curId);
  const others = [];
  document.querySelectorAll('.ph-input').forEach(el => { const v = el.value.trim(); if(v) others.push(el.dataset.ph + ' → ' + v); });
  box.hidden = false;
  box.innerHTML = '<span class="ph-load">AI 想这个空的填法…</span>';
  /* 10/2 修：词汇难度规则随目标分走（与上方 wtTargetText() 同口径）——之前头部动态化了，
     规则 5 还硬编码「目标分只要 5.5」，≥6 分用户会同时收到两条互斥指令。
     写作目标没填就看总分；都没填（0）按 5.5 档。 */
  const _T = (DATA.settings && DATA.settings.targets) || {};
  const _w = parseFloat(_T.writing), _o = parseFloat(_T.overall);
  const _band = _w > 0 ? _w : (_o > 0 ? _o : 0);
  const vocabRule = _band >= 6
    ? '5. 【词汇难度与目标分匹配】考生目标分 ' + _band + ' 分：可以使用该分数段地道、准确的雅思写作词汇与搭配（如 phenomenon / significant / contribute to / play a role in 这一档），允许复合句；但用词必须自然准确，不许为了显高级堆砌生僻大词或自己没把握的表达。'
    : '5. 【词汇难度硬限制】目标分只要 5.5，所以你给的英文**必须全部是高中（高考）词汇范围内的词**，绝对不许用雅思高级词/学术词/生僻词。判定标准：每个单词都应该是普通高中生认识、能拼写出来的词（如 people / job / money / important / because / improve / environment / health / problem / government / children）。禁止出现以下类型：长词（如 phenomenon / significant / crucial / beneficial / consequently / undermine）、抽象学术词、GRE/雅思词汇。如果某个意思只能用难词表达，就换一种更简单的说法，不要硬塞难词。填进去的词组合必须是她看得懂、自己也能写出来的词。';
  const messages = [
    { role:'system', content:
`你是雅思写作陪练。本产品采用"模板骨架 + 现场填空"的备考方法，${wtTargetText()}。
现在考生卡在一个填空位上，需要你给一个**适合填进这个空**的英文（短语或短句，1-6 词最佳，必须是地道的雅思写作表达）。
只输出 JSON，不要解释、不要 markdown 围栏：
{"fill":"填进空的英文（不要带括号、不要带句号）","why":"一句中文说明为什么合适、贴什么题"}
规则：
1. 必须与模板语境、她已填的其他空的话题一致，不能跑题。
2. 优先给"按话题领域、能填进空里的实质内容词组"（如 get a good job / protect the environment / live a healthy life / help poor people）——也就是模板之外的"内容搭配"，而不是衔接词/过渡句（模板里 already 自带那些，无需再给）。
3. 不要造长难句，填空就是填空，短而准。
4. 若空是"观点/话题"类，给一个可替换的名词短语或 -ing 短语。
${vocabRule}` },
    { role:'user', content:
`模板分类：${t ? t.category : ''}
模板标题：${t ? t.title : ''}
模板骨架（【】是填空位，不要评价骨架）：
${t ? t.skeleton : ''}

她已填的其他空：
${others.join('\n') || '（还没填其他空）'}

当前这个空的占位提示是：【${ph}】
请给适合填进【${ph}】的英文与一句中文说明。` }
  ];
  try{
    const content = await callRelay('writing_hint', messages, 0.5);   // service 形参未被使用，纯转发 messages，无需后端改动
    const r = aiJson(content);
    if(!r || !r.fill){ box.innerHTML = '<span class="ph-hint-err">AI 没给到建议，换个空或手填吧</span>'; return; }
    box.innerHTML = '<span class="ph-fill">' + escapeHtml(r.fill) + '</span>'
      + (r.why ? '<span class="ph-why">' + escapeHtml(r.why) + '</span>' : '')
      + '<button class="ph-use" type="button">填入</button>';
    const useBtn = box.querySelector('.ph-use');
    if(useBtn) useBtn.addEventListener('click', () => {
      if(inp){ inp.value = r.fill; inp.dispatchEvent(new Event('input')); }
      box.hidden = true; box.innerHTML = '';
    });
  }catch(e){
    box.innerHTML = '<span class="ph-hint-err">AI 调不通：' + escapeHtml(e.message) + '</span>';
  }
}

function updatePreview(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return;
  // 修(e 转义纪律)：骨架是用户可新增/编辑的数据（addTpl），原先未转义直插 innerHTML —— 骨架含 < > 时
  // 会破坏结构甚至注入标签。先整体转义再做填空替换（【】与占位文本不受 escapeHtml 影响，split/join 口径不变），
  // 填入值本身在下一步已过 escapeHtml。
  let out = escapeHtml(t.skeleton);
  document.querySelectorAll('.ph-input').forEach(inp => {
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    out = out.split('【' + ph + '】').join(val ? escapeHtml(val) : '【' + ph + '】');
  });
  $('#preview').innerHTML = out.replace(/\n/g, '<br>');
  const hint = $('#tplFillHint');
  if(hint){
    const s = filledState();
    hint.textContent = s.blank > 0 ? ('还有 ' + s.blank + ' 个空没填') : (s.total ? '空都填好了，可以评分' : '');
  }
}

/* ===== 模板填空 → AI 按官方 4 维度评分 ===== */
/* 取「填好的纯文本」（不走 #preview 的 HTML，避免转义污染）
   容错规则：用户整框留空的填空位，从拼接文本里剥离（用 ____ 占位），
   既不让中文占位符【话题】原样进 AI，也不把留空框算作错误。 */
function filledState(){
  const t = DATA.writing.find(x => x.id === curId);
  if(!t) return { text:'', total:0, blank:0, filled:[], skipped:[] };
  let out = t.skeleton;
  let total = 0, blank = 0;
  const filled = [];
  const skipped = [];
  document.querySelectorAll('.ph-input').forEach(inp => {
    total++;
    const ph = inp.dataset.ph;
    const val = inp.value.trim();
    if(!val){ blank++; skipped.push(ph); }
    else filled.push(ph + ' → ' + val);
    // 留空的框用 ____ 占位（明显"此处跳过"），已填的框替换成用户填的内容
    out = out.split('【' + ph + '】').join(val || '____');
  });
  return { text: out.trim(), total, blank, filled, skipped, tpl: t };
}

/* ===== P0 含金量：考官评分标准原话锚点（官方 band descriptor 短语，引用时一字不改） ===== */
const ANCHOR_TABLE_EN = [
'TR·B7: presents a clear position throughout the response',
'TR·B7: presents, extends and supports main ideas',
'TR·B6: presents a relevant position although the conclusions may become unclear or repetitive',
'TR·B6: presents relevant main ideas but some may be inadequately developed or unclear',
'TR·B5: expresses a position but the development is not always clear throughout',
'TR·B5: presents some main ideas but these are limitedly developed and repetitive',
'TR·B4: presents a position but this is unclear',
'CC·B7: logically organises information and ideas; there is clear progression throughout',
'CC·B6: arranges information and ideas coherently and there is a clear overall progression',
'CC·B6: uses cohesive devices effectively, but cohesion may be faulty or mechanical at times',
'CC·B5: makes inadequate, inaccurate or over-use of cohesive devices',
'CC·B4: presents information and ideas but these are not arranged coherently',
'LR·B7: uses a sufficient range of vocabulary to allow some flexibility and precision',
'LR·B6: uses an adequate range of vocabulary for the task',
'LR·B6: attempts less common vocabulary but with some inaccuracy',
'LR·B5: uses a limited range of vocabulary, but this is minimally adequate for simple tasks',
'LR·B5: makes noticeable errors in spelling or word formation',
'LR·B4: uses only basic vocabulary which may be used repetitively or with some inaccuracy',
'GRA·B7: uses a variety of complex structures',
'GRA·B7: produces frequent error-free sentences',
'GRA·B6: uses a mix of simple and complex sentence forms',
'GRA·B6: makes some errors in grammar and punctuation but they rarely reduce communication',
'GRA·B5: uses only a limited range of structures',
'GRA·B5: attempts complex sentences but these tend to be less accurate than simple sentences',
'GRA·B4: uses only a very limited range of structures'
].join('\n');

const ANCHOR_PHRASES = ANCHOR_TABLE_EN.split('\n').map(l => {
  const m = l.match(/^(TR|CC|LR|GRA|TA)·B(\d):\s*(.+)$/);
  return m ? { dim: m[1], band: +m[2], ph: m[3] } : null;
}).filter(Boolean);

function normEn(s){
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
// 防 AI 编造原话：quote 必须能与表内短语双向包含匹配，命中后一律用表内原话渲染；不命中返回 null（不渲染）
function anchorMatch(a){
  if(!a || !a.quote) return null;
  const q = normEn(a.quote);
  if(q.split(' ').length < 4) return null;
  for(const p of ANCHOR_PHRASES){
    const ph = normEn(p.ph);
    if(q.includes(ph) || ph.includes(q)){
      return { dim: a.dim || p.dim, band: a.band || p.band, quote: p.ph };
    }
  }
  return null;
}
function anchorHtml(a){
  const m = anchorMatch(a);
  if(!m) return '';
  return '<div class="ts-anchor">📘 考官评分标准（' + escapeHtml(m.dim) + ' · Band ' + m.band + ' 原话）：<em>"' + escapeHtml(m.quote) + '"</em></div>';
}
function goodHtml(good){
  const g = (Array.isArray(good) ? good : []).filter(Boolean);
  if(!g.length) return '';
  return '<div class="ts-sec"><h4>考官会喜欢这句</h4>' +
         g.map(x => '<div class="ts-good">' + escapeHtml(x) + '</div>').join('') + '</div>';
}
// gap.target 一律前端自己算（overall 向上取到下一个 0.5），不信任 AI 给的数
function gapHtml(gap, overall){
  if(!gap || !Array.isArray(gap.steps)) return '';
  const steps = gap.steps.filter(Boolean).slice(0, 3);
  if(!steps.length) return '';
  const target = (overall != null && overall >= 0 && overall < 9)
    ? (Math.floor(overall * 2) / 2 + 0.5) : 6.0;
  return '<div class="ts-sec"><h4>距 ' + target + ' 只差这 ' + steps.length + ' 步</h4>' +
         '<div class="ts-gap"><ol>' + steps.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ol></div></div>';
}

/* ===== P1：语病卡联动（定位原文 / tag 高频统计） ===== */
const GRAM_TAGS = ['搭配','中式','时态','单复数','冠词','介词','句式','用词','其他'];

// 共享语法区块：tplScoreHtml / essayScoreHtml / examStopAndScore 三处共用
function gramSectionHtml(gram){
  const g = (Array.isArray(gram) ? gram : []).filter(x => x && (x.wrong || x.fix));
  let h = '<div class="ts-sec"><h4>语法 / 表达问题</h4>';
  if(!g.length) return h + '<div class="muted" style="font-size:13.5px">没挑出明显语法错误。</div></div>';
  g.forEach(item => {
    h += '<div class="ts-gram">'
       + (item.wrong ? '<s>' + escapeHtml(item.wrong) + '</s> → ' : '')
       + '<b>' + escapeHtml(item.fix || '') + '</b>'
       + (item.why ? '<br><span class="muted">' + escapeHtml(item.why) + '</span>' : '')
       + '<span class="ts-gram-foot">'
       + (item.tag ? '<span class="hist-tagchip">' + escapeHtml(item.tag) + '</span>' : '')
       + '<button class="ts-loc" type="button">📍 定位原文</button>'
       + '</span>'
       + anchorHtml(item.anchor)
       + '</div>';
  });
  return h + '</div>';
}
// 定位原文：整篇评分 textarea（选区高亮）→ 真题模考回看原文（mark 高亮）→ 模板填空框（描边高亮）
function locateInPage(needle){
  const n = (needle || '').trim();
  if(!n) return false;
  const nLow = n.toLowerCase();
  const ta = document.getElementById('scoreEssay');
  if(ta && ta.value && ta.offsetParent !== null){
    const i = ta.value.toLowerCase().indexOf(nLow);
    if(i >= 0){
      ta.focus();
      ta.setSelectionRange(i, i + n.length);
      ta.scrollIntoView({ block:'center', behavior:'smooth' });
      return true;
    }
  }
  const orig = document.getElementById('examEssayOrig');
  if(orig && orig.textContent && orig.offsetParent !== null){
    const t = orig.textContent;
    const i = t.toLowerCase().indexOf(nLow);
    if(i >= 0){
      orig.innerHTML = escapeHtml(t.slice(0, i)) + '<mark>' + escapeHtml(t.slice(i, i + n.length)) + '</mark>' + escapeHtml(t.slice(i + n.length));
      orig.scrollIntoView({ block:'center', behavior:'smooth' });
      return true;
    }
  }
  const inputs = Array.from(document.querySelectorAll('#practice .ph-input'))
    .filter(el => el.value && el.value.trim().length >= 2 && nLow.includes(el.value.trim().toLowerCase()));
  if(inputs.length){
    inputs.forEach(el => el.classList.add('ph-loc'));
    inputs[0].scrollIntoView({ block:'center', behavior:'smooth' });
    setTimeout(() => inputs.forEach(el => el.classList.remove('ph-loc')), 4000);
    return true;
  }
  return false;
}
// 评分记录顶部摘要：近 10 次分数折线（虚线 = 目标 6.0）+ 高频错误 top3（按 tag 计数）
function histSummaryHtml(){
  const recs = (DATA.writingScores || []).filter(r => r && r.parsed && r.result && typeof r.result === 'object' && r.result.overall != null);
  if(recs.length < 2) return '';
  const scores = recs.slice(-10).map(r => Number(r.result.overall) || 0);
  const avg = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
  const cur = scores[scores.length-1].toFixed(1);
  const W = 180, H = 44, P = 4;
  const lo = Math.min(...scores, 5.5), hi = Math.max(...scores, 6.5);
  const pts = scores.map((s, i) => {
    const x = scores.length > 1 ? P + i * (W - 2*P) / (scores.length - 1) : W / 2;
    const y = H - P - (s - lo) / ((hi - lo) || 1) * (H - 2*P);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const yT = H - P - (6 - lo) / ((hi - lo) || 1) * (H - 2*P);
  const tagCnt = {};
  recs.slice(-10).forEach(r => (Array.isArray(r.result.grammar) ? r.result.grammar : []).forEach(g => {
    if(g && g.tag) tagCnt[g.tag] = (tagCnt[g.tag] || 0) + 1;
  }));
  const top = Object.entries(tagCnt).sort((a,b) => b[1] - a[1]).slice(0, 3);
  let h = '<div class="hist-summary">';
  h += '<svg class="hist-spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近10次评分趋势">'
     + '<line x1="' + P + '" y1="' + yT.toFixed(1) + '" x2="' + (W-P) + '" y2="' + yT.toFixed(1) + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 3"/>'
     + '<polyline points="' + pts + '" fill="none" stroke="var(--primary)" stroke-width="2"/>'
     + '</svg>';
  h += '<div class="hist-sum-t"><b>近 ' + scores.length + ' 次均分 ' + avg + '</b>'
     + '<span class="muted">最新 ' + cur + ' ｜ 虚线 = 目标 6.0</span>';
  if(top.length){
    h += '<div class="hist-top">' + top.map(t => '<span class="hist-tagchip">' + escapeHtml(t[0]) + ' ×' + t[1] + '</span>').join('') + '</div>';
  }
  h += '</div></div>';
  return h;
}

async function scoreTemplate(){
  const s = filledState();
  if(!s.tpl){ toast('先打开一个模板'); return; }
  if(s.total === 0){ toast('这个模板没有填空位'); return; }
  if(s.blank === s.total){ toast('先把空填上再评分'); return; }
  if(s.blank > 0 && !confirm('还有 ' + s.blank + ' 个空没填，仍然要让 AI 评分吗？（留空的框不算错，AI 只评你填了的部分）')) return;

  const isTask1 = /^(动态图|静态图|地图题|流程图)$/.test(s.tpl.category || '');
  const dimName = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';

  const btn = $('#tplScoreBtn');
  const btnHtml = btn.innerHTML;   // B2：缓存原 SVG，评分后恢复
  const box = $('#tplScoreBox');
  btn.disabled = true; btn.textContent = '评分中…';
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在按官方 4 维度看你填的内容，十几秒…</div>';

  const messages = [
    { role:'system', content:
`你是雅思写作考官，按官方四项评分标准给分：${dimName}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。
${wtTargetText()}。本产品的备考方法是"模板骨架 + 现场填空"，这是产品设定。

⚠️ 铁律（违反就算答错）：
1. 这是"模板骨架 + 她填的内容"的产物，可能只有一句或一小段。不许因为篇幅短、字数不足、不是完整作文而扣分或提这件事。
2. 只评价她填进去的内容（是否贴题、搭配是否地道、语法是否接得上、逻辑有没有断层），模板框架本身一个字都不许评价，更不许建议她换模板/换句式。
3. 分数按"如果整篇都是这个水平，大概是几分"来给，0-9，可用 0.5。
4. 理由必须短、具体、能改：每维度一句话（不超过 40 字），直接说问题在哪或哪里做得对，不要"建议丰富词汇"这种空话。
5. 语法错误逐条列，含原错处、改法、一句话错因；同类错误合并成一条。没有明显错误就给空数组。
6. 全部用简体中文（错句和改法里的英文原文保留英文）。
7. 完整文本里出现的 ____ 是她**主动整框留空、选择跳过的填空位，不是没写完，更不算错误**。绝对不要因为 ____ 的存在扣分、不要把它当成"遗漏/未完成"来评价、不要在语法问题里列出它。只评她实际填了文字的部分。

8. good：从她填的内容里挑 1-2 句写得地道/立场清晰的原句（必须是完整文本里一字不改的原句），每条格式"原句 —— 半句说明为什么好"。没有够格的就给空数组。
9. grammar 每条加 anchor 字段：从下方短语表挑一条与该错误最对应的官方评分原话，一字不改地照抄，标明分项与档位；表里没有贴切的就省略 anchor 字段，不要自己编原话。gap：如果这段整体水平要上一个 0.5 分档，写 2-3 条最关键的改法，每条不超过 30 字、点名分项（如 TR/CC/LR/GRA）。每条标 tag，只能从这个集合选：搭配/中式/时态/单复数/冠词/介词/句式/用词/其他。

【官方评分原话短语表（引用时一字不改）】
${ANCHOR_TABLE_EN}

只输出 JSON，不要解释、不要 markdown 围栏：
{"overall":5.5,"breakdown":{"TR":5.5,"CC":6.0,"LR":5.5,"GRA":5.0},"reasons":{"TR":"","CC":"","LR":"","GRA":""},"grammar":[{"wrong":"","fix":"","why":"","tag":"搭配","anchor":{"dim":"TR","band":5,"quote":""}}],"good":["原句 —— 为什么好"],"gap":{"steps":["",""]},"fixes":[""]}
（小作文时 breakdown/reasons 的第一项 key 也用 "TR"，我知道它代表 TA。fixes 是"这段最优先改的 1-2 件事"，gap 是升级版，两者都要给。）` },
    { role:'user', content:
`模板分类：${s.tpl.category}
模板标题：${s.tpl.title}
模板骨架（不要评价它）：
${s.tpl.skeleton}

我填的内容（空位 → 我填的，只列填了的）：
${s.filled.join('\n') || '（全部留空）'}

我主动整框跳过、没填的空（这些不算错，文本里对应 ____，不要评价）：
${s.skipped.length ? s.skipped.map(p => '【' + p + '】').join('、') : '（无，都填了）'}

拼出来的完整文本（评这个，____ 是跳过的空，不算错）：
${s.text}` }
  ];

  try{
    const content = await callRelay('writing_score', messages, 0.35);
    const r = aiJson(content);
    if(!r){
      box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      DATA.writingScores.push({ id: uid(), date: todayKey(), mode:'template', tplId: s.tpl.id, tplTitle: s.tpl.title, tplCat: s.tpl.category, essay: s.text, result: content, parsed:false });
      hubSave();
      return;
    }
    box.innerHTML = tplScoreHtml(r, isTask1);
    DATA.writingScores.push({ id: uid(), date: todayKey(), mode:'template', tplId: s.tpl.id, tplTitle: s.tpl.title, tplCat: s.tpl.category, essay: s.text, result: r, parsed:true });
    writeSyncMock(isTask1 ? '小作文' : '大作文', r);   // 方案 23：模板评分也回流看板
    hubSave();
    toast('评分完成');
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.innerHTML = btnHtml;   // B2：恢复 SVG
    renderScoreHist();
  }
}

function tplScoreHtml(r, isTask1){
  const labels = {
    TR:  isTask1 ? 'TA 任务完成' : 'TR 任务回应',
    CC:  'CC 连贯衔接',
    LR:  'LR 词汇',
    GRA: 'GRA 语法'
  };
  const bd = r.breakdown || {};
  const rs = r.reasons || {};
  let html = '';
  html += '<div class="ts-top"><span class="ts-overall">' + escapeHtml(r.overall != null ? r.overall : '—') + '</span>' +
          '<span class="muted" style="font-size:13px">这段的水平折算总分（0-9）</span></div>';
  html += '<div class="ts-dims">';
  ['TR','CC','LR','GRA'].forEach(k => {
    html += '<div class="ts-dim"><div class="ts-dim-h"><b>' + escapeHtml(bd[k] != null ? bd[k] : '—') + '</b>' + labels[k] + '</div>' +
            (rs[k] ? '<div class="ts-dim-r">' + escapeHtml(rs[k]) + '</div>' : '') + '</div>';
  });
  html += '</div>';
  /* 10/2 修：语法区块只对「真做过语法检查」的新记录渲染——P1 之前的记录没有 grammar 字段，
     无条件渲染会给旧记录凭空加一句「没挑出明显语法错误」（当时根本没检查）。
     新记录模型返回空数组时仍正常显示该句（那是真实结论）。 */
  if(Array.isArray(r.grammar)) html += gramSectionHtml(r.grammar);
  html += goodHtml(r.good);
  const gapCard = gapHtml(r.gap, r.overall);
  if(gapCard){
    html += gapCard;
  } else {
    // 兼容回退：AI 没给 gap 或旧记录 → 维持原「最优先改这个」
    const fixes = Array.isArray(r.fixes) ? r.fixes.filter(Boolean) : [];
    if(fixes.length){
      html += '<div class="ts-sec"><h4>最优先改这个</h4><div class="ts-fix">' + fixes.map(escapeHtml).join('<br>') + '</div></div>';
    }
  }
  return html;
}

/* 整篇评分渲染（scoreEssay 与 histDetailHtml 整篇路径共用） */
function essayScoreHtml(r, isTask1){
  let h = '';
  h += '<div class="score-overall" style="font-size:20px">预估总分：' + escapeHtml(r.overall != null ? r.overall : 'N/A') + '</div>';
  /* 10/8 切题度块（有题目时 AI 返回 topicJudge；旧记录无该字段自动跳过） */
  if(r.topicJudge && r.topicJudge.verdict){
    const v = String(r.topicJudge.verdict);
    const cls = v === '切题' ? 'var(--primary)' : (v === '偏题' ? 'var(--danger)' : 'var(--warn)');
    h += '<div class="score-section" style="border-left:3px solid ' + cls + ';padding-left:12px;margin-bottom:14px"><h4>切题度：<span style="color:' + cls + '">' + escapeHtml(v) + '</span></h4>'
      + (r.topicJudge.reason ? '<p style="margin:4px 0;font-size:13.5px;line-height:1.7">' + escapeHtml(r.topicJudge.reason) + '</p>' : '')
      + (Array.isArray(r.topicJudge.approach) && r.topicJudge.approach.length
          ? '<p style="margin:4px 0 0;font-size:13.5px;line-height:1.8"><b>这道题可以怎么讲：</b></p><ul style="margin:4px 0 0;padding-left:18px;font-size:13.5px;line-height:1.8">' + r.topicJudge.approach.map(x => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>'
          : '')
      + '</div>';
  }
  if(r.breakdown){
    h += '<div class="score-breakdown">';
    ['TR','CC','LR','GRA'].forEach(k => {
      if(r.breakdown[k] != null){
        const label = (k === 'TR' && isTask1) ? 'TA' : k;
        h += '<div class="score-item"><b>' + escapeHtml(r.breakdown[k]) + '</b><span>' + label + '</span></div>';
      }
    });
    h += '</div>';
  }
  const anchors = (Array.isArray(r.anchors) ? r.anchors : []).map(anchorHtml).filter(Boolean);
  if(anchors.length){
    h += '<div class="score-section"><h4>考官评分标准对照</h4>' + anchors.join('') + '</div>';
  }
  h += goodHtml(r.good);
  h += gapHtml(r.gap, r.overall);
  if(Array.isArray(r.grammar)) h += gramSectionHtml(r.grammar);   // 10/2 修：旧记录无 grammar 字段，不渲染语法区块
  if(Array.isArray(r.longSentences) && r.longSentences.length){
    h += '<div class="score-section"><h4>长 / 复杂句分析</h4><ul>';
    r.longSentences.forEach(ls => {
      h += '<li><b>（' + escapeHtml(ls.wordCount != null ? ls.wordCount : '?') + ' 词）</b>' + escapeHtml(ls.sentence || '') + '<br><span class="muted">建议：' + escapeHtml(ls.suggestion || '') + '</span></li>';
    });
    h += '</ul></div>';
  }
  if(Array.isArray(r.suggestions) && r.suggestions.length){
    h += '<div class="score-section"><h4>改进建议</h4><ul>';
    r.suggestions.forEach(s => { h += '<li>' + escapeHtml(s) + '</li>'; });
    h += '</ul></div>';
  }
  return h;
}

/* ===== 评分记录（A1） ===== */
function renderScoreHist(){
  const box = $('#scoreHistList');
  if(!box) return;
  const sumBox = document.getElementById('scoreHistSummary');
  if(sumBox) sumBox.innerHTML = histSummaryHtml();
  const list = (DATA.writingScores || []).slice().reverse().slice(0, 20);
  if(!list.length){ box.innerHTML = '<div class="hist-empty">还没有评分记录，去上面评一篇吧。</div>'; return; }
  box.innerHTML = list.map((rec, i) => {
    const modeTag = rec.mode === 'template' ? '模板评分' : (rec.mode === 'exam' ? '真题模考' : '整篇评分');
    const title = rec.mode === 'template' ? (rec.tplTitle || '模板')
                : rec.mode === 'exam' ? ((rec.examNo ? '#'+rec.examNo+' ' : '') + (rec.type || '真题'))
                : (rec.type || '整篇');
    const overall = (!rec.parsed || !rec.result || rec.result.overall == null) ? '未解析' : rec.result.overall;
    return '<div class="hist-row" data-idx="' + i + '">'
      + '<div class="hist-h">'
      +   '<span class="hist-date">' + escapeHtml(rec.date || '') + '</span>'
      +   '<span class="hist-tag">' + modeTag + '</span>'
      +   '<span class="hist-title">' + escapeHtml(title) + '</span>'
      +   '<span class="hist-score">' + escapeHtml(String(overall)) + '</span>'
      +   '<span class="hist-caret">▶</span>'
      + '</div>'
      + '<div class="hist-body">' + histDetailHtml(rec) + '</div>'
      + '</div>';
  }).join('');
  box.querySelectorAll('.hist-row').forEach(row => {
    const head = row.querySelector('.hist-h');
    if(head) head.addEventListener('click', () => row.classList.toggle('open'));
  });
}

function histDetailHtml(rec){
  const r = rec.result;
  if(!rec.parsed || !r || typeof r === 'string'){
    const raw = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
    return '<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.7;margin:0">' + escapeHtml(raw) + '</pre>';
  }
  // 模板评分 → 复用 tplScoreHtml
  if(rec.mode === 'template'){
    // 修(d 前缀启发式)：原用 /小作文/.test(tplTitle) 判 Task1，但默认模板标题是「动态图（线/柱带年份）」
    // 这类、不含「小作文」→ 历史记录重渲染时 Task1 模板错标成 TR 任务回应。
    // 优先按评分时落库的 category 判定（与 scoreTemplate 同一口径），旧记录无 tplCat 时退化为前缀匹配。
    const cat = rec.tplCat || rec.tplTitle || '';
    const isTask1 = /^(动态图|静态图|地图题|流程图)/.test(cat) || /小作文/.test(rec.tplTitle || '');
    return tplScoreHtml(r, isTask1);
  }
  // 整篇评分 → 共享渲染（含考官锚点 / 正反馈 / gap 卡）
  return essayScoreHtml(r, rec.type === '小作文');
}

function copyFilled(){
  const s = filledState();
  if(!s.text){ toast('还没内容'); return; }
  const done = () => toast('已复制填好的内容');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s.text).then(done).catch(() => fallbackCopy(s.text, done));
  } else fallbackCopy(s.text, done);
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); cb(); }catch(e){ toast('复制失败，手动选中吧'); }
  document.body.removeChild(ta);
}

function addTpl(){
  const cat = $('#a_cat').value;
  const title = $('#a_title').value.trim();
  const skeleton = $('#a_skeleton').value.trim();
  if(!title || !skeleton){ toast('请填标题和骨架'); return; }
  DATA.writing.push({ id: uid(), category: cat, title, skeleton, tips: $('#a_tips').value.trim() });
  hubSave();
  // 9/16 修：原先保存后不清空表单（addPhrase 是清的，这里是遗漏）→ 再点「新增模板」时
  // 上一条的标题/骨架/提示还躺在输入框里，连加几条就会把旧骨架当新模板存成重复项。
  $('#a_title').value = '';
  $('#a_skeleton').value = '';
  $('#a_tips').value = '';
  curCat = cat;
  $('#addCard').hidden = true; $('#listCard').hidden = false;
  renderCats(); renderList();
  toast('已添加模板');
}

function delTpl(){
  if(!curId) return;
  if(!confirm('确定删除这个模板？')) return;
  DATA.writing = DATA.writing.filter(x => x.id !== curId);
  DATA.deletedIds = DATA.deletedIds || [];
  if(curId != null && !DATA.deletedIds.includes(curId)) DATA.deletedIds.push(curId);
  hubSave();
  $('#detailCard').hidden = true; $('#listCard').hidden = false;
  document.querySelector('.write-layout')?.classList.remove('detail-open');
  curId = null;
  renderCats(); renderList();
  toast('已删除');
}

/* ===== 模板内联默写（自包含实现，不依赖 dictation.js） =====
   把模板骨架当默写源，复用 common.js 的 callRelay + aiJson 做 AI 批改。
   骨架里的【xxx】填空位先转成 ____，提交比对时整框留空不算错。 */
function wtSplitSentences(text){
  return (text || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}
function wtComputeWeak(sourceId){
  const map = {};
  (DATA.dictationLogs || []).forEach(l => {
    if(l.sourceId !== sourceId || !Array.isArray(l.mistakes)) return;
    l.mistakes.forEach(m => { const k = String(m.loc); if(k && k !== '0') map[k] = (map[k] || 0) + 1; });
  });
  return map;
}

// 把文本标准化为纯英文小写单词序列（只看英文单词，标点/下划线/横线/符号全忽略）
function wtNormalizeWords(text){
  return (text || '').toLowerCase()
    .replace(/[^a-z\s]/g, ' ')   // 非字母字符全部换成空格
    .replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean);
}

// 兜底过滤 AI 仍可能返回的误判：填空位差异、标准化后无差异、AI 自创 diff
function wtFilterMistakes(ms, sourceText){
  return (ms || []).filter(m => {
    const w = String(m.wrong || '');
    const r = String(m.right || '');
    // 1. 模板填空位差异：right 含 ____ 而 wrong 不含 ____，只是没写/多写了填空位
    if(r.includes('____') && !w.includes('____')) return false;
    // 2. 标准化后单词序列完全一致 → 忽略（大小写/空格/标点/连字符缺失等）
    if(wtNormalizeWords(w).join(' ') === wtNormalizeWords(r).join(' ')) return false;
    // 3. wrong 是 AI 自创 diff（含箭头）
    if(w.includes('→')) return false;
    // 4. 用户这边没有实质英文内容，且原句该位置包含可跳过片段（填空位/括号/【】），不算错
    if(sourceText){
      const wWords = wtNormalizeWords(w);
      if(!wWords.length){
        const sents = wtSplitSentences(sourceText);
        const idx = Number(m.loc || '0') - 1;
        if(idx >= 0 && idx < sents.length){
          const src = sents[idx];
          if(/____|[（(].*?[）)]|【.*?】/.test(src)) return false;
        }
      }
    }
    return true;
  });
}

let wtDictCurrent = null;   // 当前默写源 {id,title,text}
let wtDictSentences = [];   // 当前源按句拆分后的句子数组（1-based 与勾选区序号一致）
let wtDictWeak = {};        // 当前源 loc -> 历史出错次数

// ---- 模板默写草稿（瞬态 localStorage，切走/刷新后可续；不进云同步）----
/* 修(f/b)：writing.js 软导航重 eval 时这句 var 会把防抖句柄重置为 null，旧 setTimeout 无人清理 ——
   旧 eval 闭包里的 saveWtDictDraft 照常触发，而此刻 #wtDictInput 可能已随页面切换销毁 → 回调崩溃。
   重声明前先清旧句柄；collectWtDictDraft 内再做元素缺失守卫。 */
if(window.wtDictDraftTimer){ clearTimeout(window.wtDictDraftTimer); }
var wtDictDraftTimer = null;
function wtDictDraftKey(id){ return 'ielts_wt_dict_draft_' + id; }
function loadWtDictDraft(id){
  try{
    const raw = localStorage.getItem(wtDictDraftKey(id));
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d || (!d.text && !(d.checked && d.checked.length) && !d.result)) return null;
    return d;
  }catch(e){ return null; }
}
function collectWtDictDraft(){
  if(!wtDictCurrent) return null;
  // 修(h 空数据降级)：防抖定时器回调可能在页面已切换后触发，#wtDictInput/#wtDictResult 可能已不存在
  const inpEl = $('#wtDictInput');
  const resEl = $('#wtDictResult');
  if(!inpEl || !resEl) return null;
  const text = inpEl.value || '';
  const checked = [];
  document.querySelectorAll('.wt-dict-sent-chk').forEach(c => { if(c.checked) checked.push(Number(c.dataset.idx)); });
  const resultHtml = resEl.hidden ? '' : resEl.innerHTML;
  const hasText = text.trim().length > 0;
  const hasPick = checked.length > 0 && checked.length !== wtDictSentences.length; // 仅当不是"全选默认"才存勾选（全选=无信息量）
  if(!hasText && !hasPick && !resultHtml) return null;
  return { text, checked: hasPick ? checked : [], result: resultHtml, ts: Date.now() };
}
function saveWtDictDraft(){
  if(!wtDictCurrent) return;
  const d = collectWtDictDraft();
  if(!d){ try{ localStorage.removeItem(wtDictDraftKey(wtDictCurrent.id)); }catch(e){} return; }
  try{ localStorage.setItem(wtDictDraftKey(wtDictCurrent.id), JSON.stringify(d)); }catch(e){}
}
function scheduleWtDictDraftSave(){
  if(wtDictDraftTimer) clearTimeout(wtDictDraftTimer);
  wtDictDraftTimer = setTimeout(saveWtDictDraft, 400);
}
function clearWtDictDraft(id){
  try{ localStorage.removeItem(wtDictDraftKey(id)); }catch(e){}
  const note = $('#wtDictDraftNote'); if(note) note.hidden = true;
}
function wtAgoText(ts){
  const diff = Date.now() - (ts || 0);
  const m = Math.floor(diff / 60000);
  if(m < 1) return '刚刚';
  if(m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if(h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}
function showWtDictDraftNote(ts){
  const note = $('#wtDictDraftNote');
  if(!note) return;
  note.hidden = false;
  const ago = $('#wtDictDraftNoteAgo'); if(ago) ago.textContent = wtAgoText(ts);
}

// 实时更新「选择要默写的句子」折叠标题里的已选句数
function updateWtSentCount(){
  const el = $('#wtDictSentCount');
  if(!el) return;
  let n = 0;
  document.querySelectorAll('.wt-dict-sent-chk').forEach(c => { if(c.checked) n++; });
  el.textContent = n;
}

// 偷看原文：只显示当前勾选要默写的句子（按原顺序），未勾选句不显示
function renderWtSrcView(){
  const box = $('#wtDictSrc');
  if(!box || !wtDictSentences.length) return;
  const checked = new Set();
  document.querySelectorAll('.wt-dict-sent-chk').forEach(c => { if(c.checked) checked.add(Number(c.dataset.idx)); });
  const kept = wtDictSentences
    .map((t, i) => ({ n: i + 1, t }))
    .filter(o => checked.has(o.n))
    .map(o => o.n + '. ' + o.t);
  box.textContent = kept.length ? kept.join('\n\n') : '（本次没有勾选要默写的句子）';
}

function openTplDict(tplId){
  const t = DATA.writing.find(x => x.id === tplId);
  if(!t) return;
  // 骨架 → 纯默写文本：把【占位符】替换成 ____，让用户整框留空时不算错
  const plain = (t.skeleton || '').replace(/【[^】]*】/g, '____');
  wtDictCurrent = { id: 'tpl_' + t.id, title: cleanCatName(t.title) + '（模板默写）', text: plain };
  wtDictSentences = wtSplitSentences(plain);   // 按句拆分，供勾选区与提交过滤使用

  switchWriteTab('dictation');   // 切到默写面板

  $('#wtDictTitle').textContent = wtDictCurrent.title;
  renderWtSrcView();          // 预设原文为勾选句（默认隐藏，点「偷看原文」展开）
  $('#wtDictSrc').hidden = true;
  $('#wtDictPeek').setAttribute('aria-expanded', 'false');
  $('#wtDictInput').value = '';
  $('#wtDictResult').hidden = true;
  $('#wtDictResult').innerHTML = '';

  // 历史常错（loc -> 次数），用于勾选区标记"常错句" + 「重默错句」开关自动优先
  const weak = wtComputeWeak(wtDictCurrent.id);
  wtDictWeak = weak;

  // 句子勾选区：默认全勾（=本次全默），常错句标注 ★
  const pick = $('#wtDictSentPick');
  if(pick){
    if(!wtDictSentences.length){
      pick.innerHTML = '<span class="muted">本模板无法按句拆分，将整篇默写。</span>';
    } else {
      pick.innerHTML = '<div style="margin-bottom:6px;font-weight:600">选择本次要默写的句子（默认全选）：</div>'
        + wtDictSentences.map((s, i) => {
            const n = i + 1;
            const w = weak[n] || 0;
            const tag = w > 0 ? ' <span class="dict-weak-tag" title="历史错 ' + w + ' 次">★常错×' + w + '</span>' : '';
            const prev = s.length > 22 ? s.slice(0, 22) + '…' : s;
            return '<label class="dict-sent-item" style="display:block;margin:3px 0;cursor:pointer">'
              + '<input type="checkbox" class="wt-dict-sent-chk" data-idx="' + n + '" checked> 第' + n + '句：' + escapeHtml(prev) + tag
              + '</label>';
          }).join('');
    }
    // 勾选变化实时更新折叠标题句数
    pick.querySelectorAll('.wt-dict-sent-chk').forEach(c => { c.addEventListener('change', updateWtSentCount); });
  }
  updateWtSentCount();   // 初始全勾 → 显示总句数

  // 草稿恢复：若上次切走/刷新前有未完成的默写，还原勾选句 + 输入 + 已批改结果
  const draft = loadWtDictDraft(wtDictCurrent.id);
  if(draft){
    if(draft.checked && draft.checked.length){
      pick.querySelectorAll('.wt-dict-sent-chk').forEach(c => {
        c.checked = draft.checked.indexOf(Number(c.dataset.idx)) >= 0;
      });
      updateWtSentCount();
      renderWtSrcView();
    }
    if(draft.text){ $('#wtDictInput').value = draft.text; }
    if(draft.result){
      const box = $('#wtDictResult');
      box.hidden = false; box.innerHTML = draft.result;
    }
    showWtDictDraftNote(draft.ts);
  }

  // 输入与勾选变化 → 防抖存草稿（切走/刷新可续）
  // 9/16 修：#wtDictInput 是常驻 DOM，原先每进一次默写就 addEventListener 一次
  // （实测进 3 次 = 3 个 input 监听）。这几个监听都指向同一个防抖句柄，互相 clearTimeout，
  // 实际只落一次盘、没有可见后果，但闭包会一直累积。加一次性标记，只绑第一次。
  const dictInp = $('#wtDictInput');
  if(dictInp && !dictInp.dataset.dictBound){
    dictInp.dataset.dictBound = '1';
    dictInp.addEventListener('input', scheduleWtDictDraftSave);
  }
  pick.querySelectorAll('.wt-dict-sent-chk').forEach(c => { c.addEventListener('change', scheduleWtDictDraftSave); });

  // 「重默错句」开关：开启时自动只勾选常错句（其余取消勾选），实现"每次做前重默错过的句子"
  const redo = $('#wtDictRedoWrong');
  if(redo){
    redo.onchange = () => {
      const only = redo.checked;
      pick.querySelectorAll('.wt-dict-sent-chk').forEach(c => {
        const n = Number(c.dataset.idx);
        const isWeak = (wtDictWeak[n] || 0) > 0;
        c.checked = only ? isWeak : true;   // 开=只勾常错句；关=恢复全勾
      });
      if(!$('#wtDictSrc').hidden) renderWtSrcView();   // 若原文已展开，同步刷新为勾选句
      updateWtSentCount();   // 勾选数变了，更新折叠标题
      toast(only ? '已自动勾选常错句，本次只重默错过的句子' : '已恢复全选');
    };
  }
  // 偷看原文：展开/收起（折叠）—— 只显示本次勾选要默的句子，不是全部
  const peek = $('#wtDictPeek');
  if(peek){
    peek.onclick = () => {
      const hidden = $('#wtDictSrc').hidden;
      if(hidden) renderWtSrcView();          // 展开前按当前勾选刷新内容
      $('#wtDictSrc').hidden = !hidden;
      peek.setAttribute('aria-expanded', String(hidden));
      peek.textContent = hidden ? '🙈 收起原文' : '👁 偷看原文';
    };
  }

  // 历史提示
  const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === wtDictCurrent.id);
  const times = logs.length;
  const totalMistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
  $('#wtDictHint').textContent = '已默 ' + times + ' 次 · 历史错 ' + totalMistakes + ' 处';

  toast('已进入模板默写：' + cleanCatName(t.title) + '。骨架里的填空位整框留空不算错。');
}

async function submitWtDict(){
  if(!wtDictCurrent) return;
  const userText = $('#wtDictInput').value.trim();
  if(!userText){ toast('先把整段默出来再提交'); return; }

  const btn = $('#wtDictSubmit');
  btn.disabled = true; btn.textContent = '核对中…';
  const box = $('#wtDictResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在逐句比对你的默写，十几秒…</div>';

  // 仅取用户勾选要默的句子（正向勾选）；按勾选顺序连续编号 1..N，与学生默写行序一一对应，杜绝 loc 错位
  const checked = [];
  document.querySelectorAll('.wt-dict-sent-chk').forEach(c => { if(c.checked) checked.push(Number(c.dataset.idx)); });
  if(!checked.length && wtDictSentences.length){
    toast('请至少勾选一句要默写的句子');
    btn.disabled = false; btn.textContent = '提交核对';
    return;
  }
  // picked: 按勾选原顺序的 [{orig:原句编号, text}]；连续编号 k=1..N 对应学生默写第 k 行
  const picked = wtDictSentences
    .map((t, i) => ({ orig: i + 1, text: t }))
    .filter(o => checked.includes(o.orig));
  const srcNumbered = picked.map((o, k) => (k + 1) + '. ' + o.text).join('\n');
  // origByK: 连续编号 k+1 -> 原句编号，用于把 AI 返回的 loc 映射回原模板句存 weakHistory
  const origByK = {};
  picked.forEach((o, k) => { origByK[k + 1] = o.orig; });
  const weakBefore = wtComputeWeak(wtDictCurrent.id);

  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原文（已按句编号）」和「学生默写」，找出英文单词层面的差异。
【预处理规则】比对前，请在心里对「标准原文」和「学生默写」统一做如下标准化：
1. 只保留英文字母和空格；删除所有标点、下划线、横线、连字符、数字、中文、括号、【】、() 等符号。
2. 全部转小写。
3. 连续空格合并为单空格；首尾空格去掉。
4. 原文中的 ____（连续下划线）是模板骨架的「填空位」，不是需要默写的英文单词，标准化时直接删除。学生没写这个填空位不算错。
5. 学生输入里的占位符 -- — ___ 【】 () 等也直接删除。

比对只基于标准化后的纯英文单词序列：单词顺序一致、拼写一致即为正确。标点和各种符号差异一律不算错。
对齐规则（关键）：下方「标准原文」已按勾选顺序连续编号为 1、2、3…；「学生默写」请按行拆分，第 k 行对应标准原文第 k 句（即学生默写第 1 行对标准第 1 句，第 2 行对标准第 2 句，依此类推）。不要跨行对齐，不要因为某行多写/少写就整体错位。
铁律：
1. loc 使用下方「标准原文」给出的连续编号（如 "2" 表示第 2 句）；无法归到某句用 "0"。
2. 未被跳过的句子定位差异，type 分：漏写 / 错词 / 拼写 / 语法 / 语序。
3. 拼写错误在 type 标"拼写"，在清单里附带即可，不要像语法错那样在正文重点标红。
4. 连字符豁免：标准原文里带连字符的词（如 short-lived），学生默写若只是少了横杠写成 short lived、或连写成 shortlived、或换成空格，这属于语音输入常见现象，【不算错】。词义与单词组成一致即可视为正确；只有换成完全不同的词才判错。
5. wrong 字段必须是学生原始输入里真实存在的连续英文片段，漏写则空字符串。严禁返回 AI 自己生成的带横线、箭头或合并符号的 diff。
6. 返回严格 JSON：
{"overall":"一句话总体反馈","mistakes":[{"loc":"3","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":"一句说明"}],"weakHistory":[{"loc":"3","times":历史出错次数}]}
only JSON，无解释无围栏。` },
    { role:'user', content:
`标准原文（句编号请沿用）：
${srcNumbered}

学生默写：
${userText}

历史常错统计（loc -> 历史出错次数）：
${JSON.stringify(weakBefore)}` }
  ];

  try{
    const content = await callRelay('dictation_check', messages, 0.4);
    const r = aiJson(content);
    if(!r){
      box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      return;
    }
    const rawMistakes = Array.isArray(r.mistakes) ? r.mistakes : [];
    // 过滤 AI 仍可能返回的豁免项：大小写/空格/标点/连字符缺失/填空位未填等都不算错
    const pickedSource = picked.map(o => o.text).join('\n');
    const mistakes = wtFilterMistakes(rawMistakes, pickedSource);
    const overall = mistakes.length === 0 ? '太棒了！英文单词序列与原文一致，没有实质差异。' : (r.overall || '核对完成。');
    let html = '<div class="ts-sec"><h4>总体反馈</h4><div style="line-height:1.8">' + escapeHtml(overall) + '</div></div>';
    if(mistakes.length){
      html += '<div class="ts-sec"><h4>差异明细（' + mistakes.length + ' 处）</h4><div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">';
      mistakes.forEach(m => {
        const loc = m.loc || '0';
        const origLoc = origByK[Number(loc)] || Number(loc);   // 连续编号 -> 原模板句编号
        const wrong = m.wrong ? escapeHtml(m.wrong) : '<span class="muted">（漏写）</span>';
        const right = m.right ? escapeHtml(m.right) : '';
        html += '<div class="ts-fix" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px">'
          + '<b>第' + origLoc + '句</b> · ' + escapeHtml(m.type || '差异') + '：你写 <code>' + wrong + '</code> → 应为 <code>' + right + '</code>'
          + (m.note ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + escapeHtml(m.note) + '</div>' : '')
          + '</div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="ts-fix">✅ 没有实质差异，默写得很准。</div>';
    }
    box.innerHTML = html;

    // 记录到 dictationLogs：把过滤后的连续 loc 映射回原模板句编号，保证常错统计准确
    const mappedMistakes = mistakes.map(m => {
      const k = Number(m.loc);
      return Object.assign({}, m, { loc: String(origByK[k] != null ? origByK[k] : (m.loc || '0')) });
    });
    DATA.dictationLogs = DATA.dictationLogs || [];
    DATA.dictationLogs.push({ sourceId: wtDictCurrent.id, title: wtDictCurrent.title, date: todayKey(), mistakes: mappedMistakes });
    hubSave();
    clearWtDictDraft(wtDictCurrent.id);   // 提交成功 → 本次默写完成，清草稿
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '提交核对';
  }
}

/* ===== 万能语料库（表格：英文 | 中文/例句 | 操作） ===== */
function renderBank(){
  const filter = $('#bankFilter').value;
  let list = DATA.writingPhrases.filter(p => filter === 'all' || p.type === filter);
  if(bankSearch){ list = list.filter(p => ((p.en||'')+' '+(p.cn||'')+' '+(p.tag||'')+' '+(p.example||'')).toLowerCase().indexOf(bankSearch) !== -1); }
  const box = $('#bankList');
  if(!list.length){ box.innerHTML = '<div class="muted">' + (DATA.writingPhrases.length ? '没有匹配“'+escapeHtml(bankSearch)+'”的语料。' : '还没有语料。点「+ 新增语料」添加，或先用默认起步语料。') + '</div>'; return; }
  const rows = list.map(p => {
    const ex = p.example ? '<div class="bank-ex">例：' + escapeHtml(p.example) + '</div>' : '';
    const cn = p.cn ? '<div class="bank-detail">' + escapeHtml(p.cn) + '</div>' : '';
    const tag = p.tag ? '<span class="bank-tag">' + escapeHtml(p.tag) + '</span>' : '';
    return '<tr data-id="' + p.id + '">'
      + '<td class="bank-td-en">' + escapeHtml(p.en) + ' ' + tag + '</td>'
      + '<td class="bank-td-cn">' + (cn || '') + (ex || '') + '</td>'
      + '<td class="bank-td-actions"><button class="bank-del" type="button">删除</button></td>'
      + '</tr>';
  }).join('');
  box.innerHTML = '<table class="bank-table"><thead><tr><th>英文</th><th>中文 / 例句</th><th style="width:70px">操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
  box.querySelectorAll('.bank-del').forEach(btn => {
    btn.addEventListener('click', () => { const tr = btn.closest('tr'); if(tr) delPhrase(tr.dataset.id); });
  });
}
function addPhrase(){
  const type = $('#ba_type').value;
  const en = $('#ba_en').value.trim();
  if(!en){ toast('请填英文'); return; }
  DATA.writingPhrases.push({ id: uid(), type, en, cn: $('#ba_cn').value.trim(), tag: $('#ba_tag').value.trim(), example: $('#ba_ex').value.trim() });
  hubSave();
  $('#ba_en').value = $('#ba_cn').value = $('#ba_tag').value = $('#ba_ex').value = '';
  $('#bankAddCard').hidden = true;
  renderBank();
  toast('已添加');
}
function delPhrase(id){
  if(!confirm('删除这条语料？')) return;
  DATA.writingPhrases = DATA.writingPhrases.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave();
  renderBank();
}

/* AI 智能导入：粘贴任意英文材料 → AI 拆成可套用词组/句式 + 补中文 + 按领域分类 → 落库 DATA.writingPhrases
   领域(type)是主分类维度（= bankFilter 的 12 个枚举），不做「词组/句式」二元分桶；功能区分用 tag 表达。 */
async function aiImportPhrases(){
  const box = $('#ba_bulkInput');
  const raw = (box && box.value || '').trim();
  if(!raw){ toast('先粘贴要导入的内容'); return; }
  const btn = $('#ba_aiImport');
  const hint = $('#ba_importHint');
  btn.disabled = true; btn.textContent = 'AI 识别中…';
  if(hint) hint.textContent = '正在拆分词组/句式并按领域分类…';
  try{
    const DOMAINS = ['教育','科技','环境','健康','文化','社会','政府','经济','犯罪','交通','工作','通用'];
    const DOMAIN_SET = new Set(DOMAINS);
    const messages = [
      { role:'system', content:
`你是雅思写作语料整理助手。用户输入一段英文材料（文章、笔记、词表、网页复制均可，可能夹中文），请整理成可直接套进写作模板的「词组 / 句式」语料。
要求：
1) 按语义切分成独立的条目（一个词组或一句可用句式=一条，不要把整段当一个条目，也不要拆得过于零碎）。
2) 每条给出：
   en（英文原词/短语/句式，保留原样含标点）、
   cn（准确中文释义）、
   type（领域，必须从以下 12 个里选最贴切的一个：教育、科技、环境、健康、文化、社会、政府、经济、犯罪、交通、工作、通用；无法确定时填「通用」）、
   tag（功能标签，从 支持、反对、原因、方案、意义、影响、观点、对比、举例、因果、结论、建议 里选最贴切的一个，没有就填空字符串）、
   example（用该词组的例句，没有就填空字符串）。
3) 领域(type)是主分类维度，不要另设「词组/句式」这样的二元分类；功能上的区分用 tag 表达。
4) 只输出严格 JSON，无解释无围栏：{"items":[{"en":"","cn":"","type":"通用","tag":"","example":""}]}` },
      { role:'user', content: raw }
    ];
    const content = await callRelay('writing_bank', messages, 0.3);
    const r = aiJson(content);
    const items = (r && Array.isArray(r.items)) ? r.items : [];
    if(!items.length){ toast('AI 没识别出条目，换个格式再试'); if(hint) hint.textContent = '未识别到条目'; return; }
    const existing = new Set((DATA.writingPhrases || []).map(p => (p.en || '').toLowerCase()));
    DATA.writingPhrases = DATA.writingPhrases || [];
    let added = 0, skipped = 0;
    items.forEach(it => {
      const en = (it.en || '').trim();
      const cn = (it.cn || '').trim();
      if(!en) return;
      const key = en.toLowerCase();
      if(existing.has(key)){ skipped++; return; }
      existing.add(key);
      let type = (it.type || '通用').trim();
      if(!DOMAIN_SET.has(type)) type = '通用';
      DATA.writingPhrases.push({ id: uid(), type, en, cn, tag: (it.tag || '').trim(), example: (it.example || '').trim() });
      added++;
    });
    if(added){ hubSave(); renderBank(); }
    let msg = added ? ('AI 导入 ' + added + ' 条') : '没有新增（可能都重复）';
    if(skipped) msg += '，跳过重复 ' + skipped + ' 条';
    toast(msg);
    if(hint) hint.textContent = msg;
    if(box) box.value = '';
    $('#bankAddCard').hidden = true;
  }catch(e){
    toast('AI 导入失败：' + e.message);
    if(hint) hint.textContent = '失败：' + e.message;
  }finally{
    btn.disabled = false; btn.textContent = 'AI 识别并导入';
  }
}

/* ===== AI 作文评分 ===== */
/* 雅思官方评分细则（压缩版，LR/GRA 两卷共用；对照逐档给分） */
const RULES_LR = [
'【LR 词汇】',
'9 词汇丰富，能自然使用并掌握复杂的词汇特征；极少轻微错误，仅属笔误。',
'8 流畅灵活地使用丰富词汇，达意准确；熟练使用不常用词汇，但词语选择/搭配偶有错误；拼写/构词错误极少。',
'7 词汇足够，体现一定灵活性与准确性；使用不常见词汇，对语体与搭配有一定认识；选词、拼写/构词可能偶尔出错。',
'6 词汇足够开展写作任务；试图使用不常用词汇但有时不准确；拼写/构词有错误但不影响交流。',
'5 词汇范围有限，但能达到写作任务的最低限度；拼写/构词可能有明显错误，给读者造成一定阅读困难。',
'4 只使用基本词汇，有时重复或用词不当；构词/拼写掌握有限；错误可能造成阅读困难。',
'3 词汇及表达方式非常有限，构词/拼写掌握非常有限；错误可能严重影响信息传达。',
'2 词汇使用极其有限，基本未能掌握构词/拼写。',
'1 仅能孤立地使用少数单词。'
].join('\n');

const RULES_GRA = [
'【GRA 语法】',
'9 完全灵活准确地运用丰富多样的语法结构；极少轻微错误，仅属笔误。',
'8 运用丰富多样的语法结构；大多数句子准确；极偶然出现错误或不当。',
'7 运用各种复杂语法结构；多数句子准确；语法标点掌握较好，但有时有少许错误。',
'6 综合使用简单与复杂句式；语法标点有些错误，但很少影响交流。',
'5 仅能使用有限语法结构；复杂句准确性常不及简单句；可能经常出现语法标点错误，造成一定阅读困难。',
'4 语法结构非常有限，只能偶尔使用从句；一些结构正确但错误占多数，标点经常出错。',
'3 尝试造句，但语法标点错误占多数，意思被扭曲。',
'2 除预先背诵的短语外，无法造句。',
'1 完全无法造句。'
].join('\n');

const RULES_TASK1 = [
'【TA 任务完成】',
'9 完全满足所有写作任务要求；清晰呈现充分展开的内容。',
'8 充分涵盖所有任务要求；就主要内容/要点进行清晰恰当的呈现、强调与阐述。',
'7 涵盖任务要求；清晰地呈现主要趋势、区别或不同阶段的概述；清晰呈现与强调主要内容/要点，但未能更充分展开。',
'6 根据任务要求作文；选择恰当的信息概述；呈现并充分强调主要内容/要点，但有时含不相关、不恰当或不准确的细节。',
'5 基本能就任务作文，但格式有时不当；机械地描述细节，缺乏清晰概述；有时未能用数据支持所描述的内容。',
'4 试图行文但未包含所有主要信息/要点；格式有时不恰当；有时混淆主要信息与细节。',
'3 可能因完全曲解任务而未能行文；观点有限，大部分不相关或重复。',
'2 写作内容与任务几乎无关。',
'1 写作内容与任务几乎无关。',
'【CC 连贯与衔接】',
'9 衔接手段运用自如，行文连贯；熟练地运用分段。',
'8 信息与观点有逻辑排序；各种衔接手段运用得当；充分且合理地使用分段。',
'7 有逻辑地组织信息与观点；清晰的行文推进贯穿全文；恰当地使用一系列衔接手段，尽管有时不足或过多。',
'6 连贯组织信息与观点，总体能清晰推进行文；有效使用衔接手段，但句内句间有时有误或过于机械；有时无法保持一贯清晰的指代。',
'5 有一定组织性，但总体有时缺乏清晰的行文推进；衔接手段不足、不准确或过度；指代与替换不足致行文重复。',
'4 呈现了信息与观点，但未能连贯组织、未能清晰推进行文；使用一些基本衔接，但有时不准确或重复。',
'3 不能有逻辑地组织观点；衔接手段非常有限，有时未能体现观点间的逻辑。',
'2 在内容组织方面能力非常有限。',
'1 未能传达任何信息。'
].join('\n') + '\n' + RULES_LR + '\n' + RULES_GRA;

const RULES_TASK2 = [
'【TR 任务回应】',
'9 全面地回应各部分写作任务；提出充分展开的观点，以及相关、充分延伸、论据充分的论点。',
'8 充分地回应各部分写作任务；进行较充分展开的回应，提出相关、延伸且含有论据的论点。',
'7 回应各部分写作任务；回应过程中始终呈现清晰观点；呈现、发展主要论点并论证，但有时过于一概而论/论点缺乏重点；每个段落有清晰的中心主题。',
'6 回应了各部分写作任务，但某些部分论证可能更充分；提出切题观点，尽管结论有时不甚清晰或重复；提出多个相关主要论点，但某些未充分展开或不甚清晰。',
'5 仅回应了部分写作任务；格式有时不当；表述观点但展开论证未能保持一贯清晰，可能缺乏结论；主要论点十分有限且未充分展开；有时出现无关细节。',
'4 仅最低限度地回应写作任务或所答相关性不大；观点不清晰；主要论点难以确认，可能重复、不相关或缺乏论据支持。',
'3 未能足以回应任一部分写作任务；未能表达清晰论点；论点甚少且基本未展开或观点不切题。',
'2 几乎未回应写作任务；未能表达观点；可能试图提出一两个论点但未展开论证。',
'1 写作内容与写作任务几乎无关。',
'【CC 连贯与衔接】',
'9 衔接手段运用自如，行文连贯；熟练地运用分段。',
'8 信息与观点有逻辑排序；各种衔接手段运用得当；充分且合理地使用分段。',
'7 有逻辑地组织信息与观点；清晰的行文推进贯穿全文；恰当地使用一系列衔接手段，尽管有时不足或过多。',
'6 连贯组织信息与观点，总体能清晰推进行文；有效使用衔接手段，但句内句间有时有误或过于机械；有时无法保持一贯清晰的指代；使用段落写作，但未能保持段落间逻辑。',
'5 有一定组织性，但总体有时缺乏清晰的行文推进；衔接手段不足、不准确或过度；指代与替换不足致行文重复；没有使用段落写作或分段不足。',
'4 呈现了信息与观点，但未能连贯组织、未能清晰推进行文；使用一些基本衔接，但有时不准确或重复；没有使用段落写作或分段造成疑惑。',
'3 不能有逻辑地组织观点；衔接手段非常有限，有时未能体现观点间的逻辑。',
'2 在内容组织方面能力非常有限。',
'1 未能传达任何信息。'
].join('\n') + '\n' + RULES_LR + '\n' + RULES_GRA;

async function scoreEssay(){
  const essay = $('#scoreEssay').value.trim();
  const type = $('#scoreType').value;
  const topic = $('#scoreTopic') ? $('#scoreTopic').value.trim() : '';   // 10/8 题目框（可选）
  // 9/16/9/17 的门槛拦截于 10/8 她拍板退役（与真题交卷同规则）：不写够也能评，AI 提醒最好写够；
  // 缺 ≤10 词不扣分、缺 >10 词才扣（写进 prompt【词数规则】）。只拦空白。
  const min = wtMinWords(type);
  const wc = wtCountWords(essay);
  if(!wc){ toast('先粘贴或写下你的作文，再开始评分'); return; }

  const isTask1 = type === '小作文';
  const dim = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';

  const btn = $('#scoreBtn');
  const btnHtml = btn.innerHTML;   // 缓存原文，评分后恢复
  btn.disabled = true; btn.textContent = '评分中…';
  const resultEl = $('#scoreResult');
  const bodyEl = $('#scoreResultBody');
  resultEl.style.display = 'block';
  bodyEl.innerHTML = '<p class="muted">正在分析你的作文，请稍候…</p>';

  /* 10/8 有题目时追加切题度判定要求（无题目 = 与旧版 prompt 完全一致） */
  const topicBlock = topic ? `
8. 用户消息里提供了「题目」。额外输出 topicJudge：
   a. verdict：只能选「切题」「部分偏题」「偏题」——判全文是否真正回答了题目问的问题（立场有没有答、论点有没有跑出题目范围）。
   b. reason：≤40 字说明判定理由；偏题时点出哪几段跑题。
   c. approach：2-3 条「这道题可以怎么讲」——立场选项或论点方向，每条 ≤40 字，简体中文。
   顶层 JSON 加 "topicJudge":{"verdict":"","reason":"","approach":["",""]}；没有题目就绝不输出该字段。` : '';

  const messages = [
    { role:'system', content:
`你是雅思写作${isTask1 ? ' Task 1 小作文（学术类图表/数据题）' : ' Task 2 大作文（议论文）'}考官，严格按官方评分细则给分。
评分标准：${dim}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。

【${isTask1 ? 'Task 1 小作文' : 'Task 2 大作文'}官方评分细则（逐档对照评分）】
${isTask1 ? RULES_TASK1 : RULES_TASK2}

输出要求：
1. 对照细则逐档比对，给出 0-9 的预估分（可用 0.5）。
2. breakdown 第一项 key 统一用 "TR" 输出（${isTask1 ? '小作文时我知道它代表 TA' : '即 TR'}）。
3. 指出文中超过 35 词或含多层从句的复杂句，给出简化建议。
4. 全部用简体中文。

5. anchors：从下方短语表挑 1-3 条与这篇最突出的问题对应的官方评分原话（一字不改照抄），标明分项与档位；表里没有贴切的就给空数组，不要自己编原话。
6. good：从作文里挑 1-2 句写得地道的原句（一字不改），每条格式"原句 —— 半句说明为什么好"；gap：距下一个 0.5 分档最关键的 2-3 条改法，每条 ≤30 字、点名分项。
7. grammar：逐条列出语法/表达错误，含原错处、改法、一句错因；每条标 tag，只能从这个集合选：搭配/中式/时态/单复数/冠词/介词/句式/用词/其他；同类错误合并成一条；没有明显错误就给空数组。
${topicBlock}
【词数规则（真实考试口径，10/8 她拍板）】用户消息会给出「本次实际词数 / 最低要求」。
缺口 ≤10 词：不因词数扣分；缺口 >10 词：在 TR/TA 中体现但总差距不超过 0.5，并在 gap 里给一条「下次写够词数」提醒。
绝不因词数单项把总分压到明显不合理的档位。

【官方评分原话短语表（引用时一字不改）】
${ANCHOR_TABLE_EN}

只输出严格 JSON，不要其他文字：
{"overall":6.0,"breakdown":{"TR":6.0,"CC":6.0,"LR":6.0,"GRA":5.5},"anchors":[{"dim":"TR","band":5,"quote":""}],"good":["原句 —— 为什么好"],"gap":{"steps":["",""]},"grammar":[{"wrong":"","fix":"","why":"","tag":"搭配"}],"longSentences":[{"sentence":"原文句子","wordCount":42,"suggestion":"拆分建议"}],"suggestions":["建议1","建议2","建议3"]}` },
    { role:'user', content: (topic ? '题目：\n' + topic + '\n\n' : '') + '题型：' + type + '\n\n本次实际词数：' + wc + '（最低要求 ' + min + ' 词）\n\n作文：\n' + essay }
  ];

  try{
    const content = await callRelay('writing_score', messages, 0.4);
    // Bug18：复用 aiJson 解析（已处理 ```json 围栏与前后废话），避免重复解析逻辑
    const result = aiJson(content);
    if(!result){
      // JSON 解析失败，降级显示原始文本
      bodyEl.innerHTML = '<div class="score-section"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">' + escapeHtml(content) + '</div></div>';
      DATA.writingScores.push({ id: uid(), date: todayKey(), type, topic, essay, result: content, parsed: false });
      hubSave();
      return;
    }

    // 渲染结果（共享 essayScoreHtml：含考官锚点 / 正反馈 / gap 卡）
    bodyEl.innerHTML = essayScoreHtml(result, isTask1);

    // 保存记录
    DATA.writingScores.push({ id: uid(), date: todayKey(), type, topic, essay, result, parsed: true });
    writeSyncMock(type, result);   // 方案 23：回流到分项模考看板
    hubSave();
    toast('评分完成');
  }catch(e){
    bodyEl.innerHTML = '<p class="muted">AI 服务暂不可用：' + escapeHtml(e.message) + '</p><p class="muted" style="font-size:13px">请检查「设置」中的 AI 接口地址。</p>';
  }finally{
    btn.disabled = false; btn.innerHTML = btnHtml;
    renderScoreHist();
  }
}

/* 方案 23：写作 AI 评分结果回流到回顾页「分项模考」看板（DATA.mockRecords, type:'writing'）。
   加权：Task 1 ×1，Task 2 ×2（与 MOCK_TYPES.writing 一致）。同日期同题型不重复叠加——覆盖式更新。 */
function writeSyncMock(type, result){
  if(!result || typeof result.overall === 'undefined') return;
  const isTask1 = type === '小作文';
  const t1 = isTask1 ? Number(result.overall) : (result.breakdown && result.breakdown.TA != null ? Number(result.breakdown.TA) : null);
  const t2 = !isTask1 ? Number(result.overall) : (result.breakdown && result.breakdown.TR != null ? Number(result.breakdown.TR) : null);
  // 用 breakdown 四维均值作为缺失项的兜底
  const dims = result.breakdown ? ['TR','CC','LR','GRA'].map(k => result.breakdown[k]).filter(v => v != null).map(Number) : [];
  const fallback = dims.length ? Math.round(dims.reduce((a,b)=>a+b,0)/dims.length*2)/2 : Number(result.overall);
  const parts = [];
  if(isTask1){
    if(t1 != null) parts.push({ label:'Task 1', score:t1, weight:1 });
    parts.push({ label:'Task 2', score:fallback, weight:2 });
  } else {
    parts.push({ label:'Task 1', score:fallback, weight:1 });
    if(t2 != null) parts.push({ label:'Task 2', score:t2, weight:2 });
  }
  const wsum = parts.reduce((s,x)=>s+x.weight,0);
  const overall = Math.round(parts.reduce((s,x)=>s+x.score*x.weight,0)/wsum*2)/2;
  // 覆盖式：同日期同题型只留一条
  const date = todayKey();
  const existing = DATA.mockRecords.find(r => r.type === 'writing' && r.date === date && r.ai === true);
  if(existing){ existing.parts = parts; existing.overall = overall; existing.note = 'AI 评分自动同步'; }
  else { DATA.mockRecords.unshift({ id:uid(), date, granularity:'whole', type:'writing',  parts, overall, note:'AI 评分自动同步', ai:true }); }
}

/* ===================== 写作真题模块 ===================== */
/* 修(f 场景状态隔离)：writing.js 会被软导航 window.eval 重跑，这句 var 会把 examTimer 重置成新对象，
   旧 setInterval 句柄随之丢失且无人清理 —— 离开写作页后旧心跳每秒照跑，而 #examTimerText 已不在 DOM，
   examTick 里 null.textContent 每秒抛一次 TypeError。重声明前先清旧句柄；examTick 内再做元素缺失自停兜底。 */
if(window.examTimer && window.examTimer.tick){ clearInterval(window.examTimer.tick); }
/* 9/30 考场模式：mode 'up' = 普通正计时（原行为）；'down' = 机考倒计时，到点强制停笔。
   ⚠️ 修：#examTimerText 原本只有 CSS（.exam-timer）没有 DOM 元素，examStartTimer 一直在跑但页面上看不见任何计时
   —— 计时器是隐形的。本次把计时 UI 补回 .exam-a-foot，倒计时/停笔才有地方显示。 */
var examTimer = { start: 0, elapsed: 0, running: false, tick: null, cur: null,
                  mode:'up', limitMs:0, locked:false };

/* Task 2 = 40 分钟 / Task 1 = 20 分钟：与真题页印刷指令（wtMinWords 同份口径）一致。
   10/8 她拍板：考场模式/强制停笔整块退役 —— 恒倒计时，到点弹框让她自己选（提交/继续写）。 */
var EXAM_LIMIT_MIN = { big: 40, small: 20 };
function examLimitMs(isBig){ return (EXAM_LIMIT_MIN[isBig ? 'big' : 'small'] || 40) * 60000; }

function fmtExamTime(ms){
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  const p = n => String(n).padStart(2,'0');
  return p(h)+':'+p(m)+':'+p(sec);
}
function examUsedMs(){ return examTimer.elapsed + (examTimer.running ? Date.now()-examTimer.start : 0); }
function examTick(){
  const el = $('#examTimerText');
  if(!el){   // 修(f)：元素已随页面切换销毁 → 自停心跳，避免每秒 TypeError、也堵住跨页残留
    if(examTimer.tick){ clearInterval(examTimer.tick); examTimer.tick = null; }
    return;
  }
  const ms = examUsedMs();
  const isDown = examTimer.mode === 'down';
  const remain = isDown ? (examTimer.limitMs - ms) : 0;
  el.textContent = fmtExamTime(isDown ? Math.max(0, remain) : ms);
  const wrap = $('#examTimerWrap');
  if(wrap){
    wrap.classList.toggle('over', isDown && remain <= 0);
    wrap.classList.toggle('warn', isDown && remain > 0 && remain <= 5 * 60000);
  }
  if(isDown && remain <= 0 && examTimer.running) examTimeUp();
}
/* 10/8 她拍板重做到点行为：不再强制停笔（旧版锁输入框+红条+解锁打勾全部退役）——
   暂停计时、存草稿，弹英文框让她自己选 Submit now / Keep writing。 */
function examTimeUp(){
  examPauseTimer();
  if(examTimer.tick){ clearInterval(examTimer.tick); examTimer.tick = null; }
  examSaveDraft();
  const ta = $('#examEssay');
  const n = wtCountWords(ta ? ta.value : '');
  const min = wtMinWords(examTimer.cur && examTimer.cur.kind === 'big' ? '大作文' : '小作文');
  const w = $('#examTuWords');
  if(w) w.textContent = 'You wrote ' + n + ' words (min ' + min + ').' + (n < min ? ' Under the minimum — but it is your call.' : '');
  const tb = $('#examTimerBtn'); if(tb) tb.textContent = '▶';
  const m = $('#examTimeUpModal'); if(m) m.hidden = false;
}
/* 弹框两选：提交评分 / 继续写（切正计时，随时可 Finish，永不再锁） */
function examTimeUpSubmit(){
  const m = $('#examTimeUpModal'); if(m) m.hidden = true;
  examStopAndScore();
}
function examTimeUpKeep(){
  const m = $('#examTimeUpModal'); if(m) m.hidden = true;
  examStartTimer('up', 0);
  toast('计时切为正计时，继续写；随时点 Finish section 提交');
}
function examResetLock(){
  const ta = $('#examEssay'); if(ta) ta.readOnly = false;
  const m = $('#examTimeUpModal'); if(m) m.hidden = true;
  const wrap = $('#examTimerWrap'); if(wrap) wrap.classList.remove('over','warn');
}
function examSaveDraft(){
  try{
    const cur = examTimer.cur || {};
    const ta = $('#examEssay');
    if(!cur.kind || cur.no == null || !ta) return;
    const txt = ta.value || '';
    const key = 'ielts_wt_draft_' + cur.kind + '_' + cur.no;
    /* 10/8 自练题已交卷 → 草稿必须清掉并不再回存（否则 Exit 再存一份已交卷的作文，
       下一场弹「发现草稿」让她恢复一篇交过的——探针实抓的流程 bug） */
    if(cur.custom && cur.submitted){ localStorage.removeItem(key); return; }
    if(txt.trim()) localStorage.setItem(key, JSON.stringify({ essay: txt, date: Date.now() }));
    else localStorage.removeItem(key);
  }catch(e){ console.warn('draft save failed', e); }
}
function examStartTimer(mode, limitMs){
  examTimer.mode = (mode === 'down' && Number(limitMs) > 0) ? 'down' : 'up';
  examTimer.limitMs = Number(limitMs) || 0;
  examTimer.start = Date.now(); examTimer.elapsed = 0; examTimer.running = true;
  examResetLock();
  if(examTimer.tick) clearInterval(examTimer.tick);
  examTimer.tick = setInterval(examTick, 1000); examTick();
  const tb = $('#examTimerBtn'); if(tb) tb.textContent = '⏸';
}
function examPauseTimer(){
  if(!examTimer.running) return;
  examTimer.elapsed += Date.now()-examTimer.start; examTimer.running = false; examTick();
}
function examResumeTimer(){
  if(examTimer.running) return;
  examTimer.start = Date.now(); examTimer.running = true; examTick();
}
function examStopTimer(){
  examPauseTimer();
  if(examTimer.tick){ clearInterval(examTimer.tick); examTimer.tick = null; }
}

// 10 字内题目总结（替换卡片原标题 / 折叠条标题）
function summarizeExamTitle(kind, it){
  // 优先用各题自带的中文 summary（若有），否则从英文/中文题面截取核心短语
  if(it.summary && it.summary.trim()) return it.summary.trim();   // 不限字数：一句通顺的话概括题面
  const src = kind === 'big'
    ? (it.zh || it.en || '')
    : (it.title || '');
  const s = (src || '').replace(/\s+/g, ' ').trim();
  if(!s) return (kind === 'big' ? '大作文' : '小作文');
  // 去掉常见引导词
  const cleaned = s.replace(/^(some people think|some people believe|in some countries|it is sometimes argued|many people believe)\s*,?\s*/i, '');
  return cleaned.slice(0, 30);   // 无 summary 时退化截取，30 字保证一句完整话
}

function renderExamList(){
  const data = window.WRITING_PROMPTS || { big:[], small:[] };
  const filter = $('#examFilter').value || 'all';
  const subFilter = $('#examSubFilter').value || 'all';
  const box = $('#examList');
  if(!box) return;

  // 题型自动判定（10/2：大作文扩到 5 类——优缺点型/双问题型从 Report/观点型 里分出来）
  function detectBigSubType(en, meta){
    const t = (en || '').toLowerCase(), m = (meta || '').toLowerCase();
    if(/discuss both (views|sides)|discuss these two points/.test(t)) return '讨论型';
    if(/advantages? and disadvantages|advantages? outweigh|benefits? and drawbacks?|positive or negative/.test(t)) return '优缺点型';
    if(/to what extent do you agree or disagree|do you agree or disagree|what is your opinion/.test(t)) return '观点型';
    if(/what are the (main )?(causes|reasons|problems|solutions|effects|impacts)/.test(t) || m.indexOf('report') >= 0) return 'Report';
    /* 双问题型：一段题干里出现两个及以上问号（如 Why is this the case? Do you think…），且没落进上面任何一类 */
    if(((en || '').match(/\?/g) || []).length >= 2) return '双问题型';
    return '观点型';
  }
  function detectSmallSubType(title){
    const t = (title || '').toLowerCase();
    if(!t) return '未分类';
    if(/\b(process|flow|cycle|life cycle|stages|diagram|is made|how .* (is|are))\b/.test(t)) return '流程图';
    if(/\b(plan|map|layout)\b|development of (an|the) (area|town|city|site)/.test(t)) return '地图题';
    if(/\b(19|20)\d{2}\b[\s\S]*\b(19|20)\d{2}\b|between .*\d{4}.* and .*\d{4}|from .*\d{4}.* to .*\d{4}|over .*(period|years|decades)|from .* to .* (years|period)/.test(t)) return '动态图';
    return '静态图';
  }

  // 建立 examNo → 最新评分记录 索引（用于卡片打勾 + 总分）
  const scoreMap = {};
  (DATA.writingScores || []).forEach(rec => {
    // 修(g 键口径)：小作文真题记录存 examNo 时带 'T' 前缀（'T3'，见 examStopAndScore 的写入），
    // 而下方 recKey 用裸题号（3）→ 键对不上，小作文真题练完后 ✓ 与预估分永不显示。剥前缀归一化，兼容旧记录。
    const key = (rec.type === '大作文' ? 'big:' : 'small:') + String(rec.examNo != null ? rec.examNo : '').replace(/^T/, '');
    // 仅取第一条（最新写入的为最后一条，这里覆盖为最新）
    scoreMap[key] = rec;
  });

  const makeItem = (it, kind) => {
    const typeLabel = kind === 'big' ? '大作文' : '小作文';
    const subType = it.subType || '未分类';
    const meta = kind === 'big' ? (it.meta || '') : ('雅思预测 · ' + typeLabel);
    const zh = kind === 'big' ? it.zh : '';
    const en = kind === 'big' ? it.en : (it.title || '');
    const summary = summarizeExamTitle(kind, it);
    // 评分记录匹配
    const recKey = (kind === 'big' ? 'big:' : 'small:') + it.no;
    const rec = scoreMap[recKey];
    const doneMark = rec ? '<span class="ei-done" title="已练过">✓</span>' : '';
    const scoreMark = rec && rec.result && rec.result.overall != null
      ? '<span class="ei-score" title="预估总分">'+escapeHtml(rec.result.overall)+'<i>/9</i></span>'
      : '';
    // 原文预览（取作文前 40 字）
    const preview = rec && rec.essay
      ? '<div class="ei-prev">'+escapeHtml(rec.essay.replace(/\s+/g,' ').slice(0, 40))+(rec.essay.length > 40 ? '…' : '')+'</div>'
      : '<div class="ei-prev ei-prev-empty">尚未练习</div>';
    const chartThumb = (kind !== 'big' && it.img && it.img.length)
      ? '<div class="ei-chart"><img src="assets/writing/'+escapeHtml(it.img[0])+'" alt="chart"></div>'
      : '';
    return '<div class="exam-item'+(rec ? ' is-done' : '')+'" data-kind="'+kind+'" data-no="'+it.no+'">'
      + '<div class="ei-top">'
      + '<span class="ei-no">#'+(kind==='big'?it.no:'T'+it.no)+'</span>'
      + doneMark
      + scoreMark
      + '<span class="ei-type">'+typeLabel+'</span>'
      + '<span class="ei-sub">'+escapeHtml(subType)+'</span>'
      + '<span class="ei-meta">'+escapeHtml(meta)+'</span></div>'
      + '<div class="ei-title">'+escapeHtml(summary)+'</div>'
      + preview
      + chartThumb
      + '</div>';
  };

  let html = '';
  const kinds = filter === 'all' ? ['big','small'] : [filter];
  kinds.forEach(kind => {
    const typeLabel = kind === 'big' ? '大作文' : '小作文';
    let items = (data[kind] || []).slice();
    items.forEach(it => { it.subType = kind === 'big' ? detectBigSubType(it.en, it.meta) : detectSmallSubType(it.title); });
    const groups = {};
    items.forEach(it => { (groups[it.subType] = groups[it.subType] || []).push(it); });
    /* 10/2 修：顺序表必须与 detectBigSubType 的全部分组一致——之前漏了新分出来的
       「优缺点型/双问题型」，归进这两组的题（如大作文 #56）建了组却永不渲染。 */
    const order = kind === 'big' ? ['观点型','讨论型','优缺点型','双问题型','Report','未分类'] : ['动态图','静态图','地图题','流程图','未分类'];
    order.filter(st => groups[st] && groups[st].length).forEach(st => {
      if(subFilter !== 'all' && st !== subFilter) return;
      const list = groups[st];
      html += '<div class="exam-group-title"><span class="exam-kind-tag">'+typeLabel+'</span><span class="exam-sub-tag">'+escapeHtml(st)+'</span><span class="exam-count">'+list.length+' 题</span></div>';
      html += list.map(it => makeItem(it, kind)).join('');
    });
  });

  box.innerHTML = html || '<div class="muted">没有符合筛选条件的题目</div>';
  box.querySelectorAll('.exam-item').forEach(el => {
    el.addEventListener('click', () => {
      const kind = el.dataset.kind, no = Number(el.dataset.no);
      const item = (kind==='big'?data.big:data.small).find(x => x.no === no);
      openExam(item, kind);
    });
  });
}

/* 10/8 字号三档（对齐官方机考 Text Size：Regular 20 / Large 23 / Extra large 27 —— 官方依据
   IDP 官网「How IELTS on Computer works」+ 官方 Quick Guide，两个独立来源一致）。
   0=Regular 1=Large 2=Extra large，本机记忆（不进 DATA，免登记 mergeData）；作用范围 = 题面 + 作答区。 */
const EXAM_FONT_KEY = 'ielts_wt_font_v1';
function examFontLevel(){
  try{ const v = Number(localStorage.getItem(EXAM_FONT_KEY)); return (v === 1 || v === 2) ? v : 0; }catch(e){ return 0; }
}
function examFontApply(){
  const pr = $('#examPractice'); if(!pr) return;
  const lv = examFontLevel();
  pr.classList.remove('exam-fs-0','exam-fs-1','exam-fs-2');
  pr.classList.add('exam-fs-' + lv);
  const b = $('#examFontBtn');
  if(b) b.textContent = 'Aa · ' + ['Regular','Large','Extra large'][lv];
}
function examFontCycle(){
  const next = (examFontLevel() + 1) % 3;
  try{ localStorage.setItem(EXAM_FONT_KEY, String(next)); }catch(e){}
  examFontApply();
  toast('Text size: ' + ['Regular (20px)','Large (23px)','Extra large (27px)'][next]);
}

function openExam(item, kind){
  examTimer.cur = { kind, no: item.no };
  $('#examHome').hidden = true;
  $('#examPractice').hidden = false;
  document.body.classList.add('exam-fullscreen');   // 进入全屏沉浸式
  const isBig = kind === 'big';
  const partNo = isBig ? 2 : 1;
  const typeLabel = isBig ? '大作文 Task 2' : '小作文 Task 1';
  $('#examPartLabel').textContent = 'Part ' + partNo;
  $('#examStepBadge').textContent = String(partNo);
  $('#examStepLabel').textContent = 'Part ' + partNo;
  $('#examInstr').textContent = isBig
    ? 'You should spend about 40 minutes on this task. Write at least 250 words.'
    : 'You should spend about 20 minutes on this task. Write at least 150 words.';
  if(isBig){
    $('#examQuestion').innerHTML =
      '<div class="ei-en">' + escapeHtml(item.en) + '</div>';
    $('#examQNote').textContent = 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.';
  } else {
    const charts = (item.img && item.img.length)
      ? '<div class="eq-charts">' + item.img.map(f => '<img src="assets/writing/'+escapeHtml(f)+'" alt="chart">').join('') + '</div>'
      : '';
    $('#examQuestion').innerHTML = charts + '<div class="ei-en">' + escapeHtml(item.title) + '</div>';
    $('#examQNote').textContent = 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.';
  }
  $('#examEssay').value = '';

  // 草稿恢复：若该题已有未提交草稿，弹框询问「重新写 / 继续写」
  let draftEssay = '';
  try{
    const dk = 'ielts_wt_draft_' + kind + '_' + item.no;
    const raw = localStorage.getItem(dk);
    if(raw){
      const d = JSON.parse(raw);
      if(d && d.essay && d.essay.trim()) draftEssay = d.essay;
    }
  }catch(e){ console.warn('draft read failed', e); }
  if(draftEssay){
    const ok = window.confirm('A draft was found for this task.\n\nOK = continue (restore draft)\nCancel = start over (clear draft)');
    if(ok){
      $('#examEssay').value = draftEssay;
    } else {
      try{ localStorage.removeItem('ielts_wt_draft_' + kind + '_' + item.no); }catch(e){}
      $('#examEssay').value = '';
    }
    // 9/16 修：同样改走 wtCountWords（原 /\b[\w'-]+\b/g 遇到中文算 0 词，与 AI 评分 tab 口径不一致）
    const n = wtCountWords($('#examEssay').value);
    $('#examWordCount').textContent = 'Word count: ' + n;
  } else {
    // 修：原写法在 if 块之后无条件把词数清零，刚恢复的草稿词数立刻被盖成 0
    $('#examWordCount').textContent = 'Word count: 0';
  }
  $('#examResult').hidden = true;
  const fold = $('#examEssayFold'); if(fold){ fold.hidden = true; fold.open = false; }   // 我的作文收起栏：提交后才显示，练习中隐藏（9/10 之之）
  const eo = $('#examEssayOrig'); if(eo) eo.textContent = '';
  $('#examEssay').hidden = false;   // 恢复输入区（上一题提交时被隐藏）
  const ft = $('#examAFoot'); if(ft) ft.hidden = false;
  // 10/8 她拍板：考场模式 checkbox 退役 —— 恒倒计时（Task 2 40min / Task 1 20min），到点弹框自选
  examFontApply();   // 10/8 官方字号三档：进场应用本机档位
  examStartTimer('down', examLimitMs(isBig));
}

/* 10/8 她拍板：评分面板「保存题目，开始练」→ 直通真题全屏（左题右答，复用 #examPractice）。
   cur.custom 标记自练题：评分走 examStopAndScore 同一条链（prompt 带题目 → 切题度判定），
   落库 examNo 为空、topic 带题干。 */
function openExamCustom(){
  const isBig = $('#scoreType').value !== '小作文';
  const topic = ($('#scoreTopic') ? $('#scoreTopic').value.trim() : '') || (function(){ try{ return localStorage.getItem('wt_score_topic_v1') || ''; }catch(e){ return ''; } })();
  examTimer.cur = { kind: isBig ? 'big' : 'small', no: 'custom', custom: true };
  /* ⚠️ #examPractice 住在 #examPanel 里，而入口在评分 tab —— examPanel 必须跟着打开，
     同时把其他 tab 面板（含评分面板自己）全部藏掉，否则全屏考试上面叠着一截评分页
     （她 16:16 截图实抓；与模考 showOnlyMockView 同一族教训：视图互斥别指望 tab 切换器）。 */
  $('#examPanel').hidden = false;
  $('#tplPanel').hidden = true;
  $('#bankPanel').hidden = true;
  $('#scorePanel').hidden = true;
  $('#dictationPanel').hidden = true;
  $('#examHome').hidden = true;
  $('#examPractice').hidden = false;
  document.body.classList.add('exam-fullscreen');
  const partNo = isBig ? 2 : 1;
  $('#examPartLabel').textContent = 'Part ' + partNo;
  $('#examStepBadge').textContent = String(partNo);
  $('#examStepLabel').textContent = 'Part ' + partNo;
  $('#examInstr').textContent = isBig
    ? 'You should spend about 40 minutes on this task. Write at least 250 words.'
    : 'You should spend about 20 minutes on this task. Write at least 150 words.';
  $('#examQuestion').innerHTML = '<div class="ei-en">' + escapeHtml(topic) + '</div>';
  $('#examQNote').textContent = isBig
    ? 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.'
    : 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.';
  // 草稿恢复（同 openExam 的英文弹框口径）
  let draftEssay = '';
  try{
    const raw = localStorage.getItem('ielts_wt_draft_' + examTimer.cur.kind + '_custom');
    if(raw){ const d = JSON.parse(raw); if(d && d.essay && d.essay.trim()) draftEssay = d.essay; }
  }catch(e){ console.warn('draft read failed', e); }
  if(draftEssay){
    const ok = window.confirm('A draft was found for this task.\n\nOK = continue (restore draft)\nCancel = start over (clear draft)');
    $('#examEssay').value = ok ? draftEssay : '';
    if(!ok){ try{ localStorage.removeItem('ielts_wt_draft_' + examTimer.cur.kind + '_custom'); }catch(e){} }
  } else $('#examEssay').value = '';
  const n = wtCountWords($('#examEssay').value);
  $('#examWordCount').textContent = 'Word count: ' + n;
  $('#examResult').hidden = true;
  const fold = $('#examEssayFold'); if(fold){ fold.hidden = true; fold.open = false; }
  const eo = $('#examEssayOrig'); if(eo) eo.textContent = '';
  $('#examEssay').hidden = false;
  const ft = $('#examAFoot'); if(ft) ft.hidden = false;
  examFontApply();   // 10/8 官方字号三档：进场应用本机档位
  examStartTimer('down', examLimitMs(isBig));
}

function examStopAndScore(){
  // 自动评分（复用官方 4 维度 prompt）。此处独立实现，避免依赖 scoreEssay 的 DOM。
  const essay = $('#examEssay').value.trim();
  const cur = examTimer.cur || {};
  const type = cur.kind === 'big' ? '大作文' : '小作文';
  /* 10/8 自练题（cur.custom）带题目评分：prompt 追加切题度判定（与评分面板 10/8 同款）；
     真题流程无题目 → 与旧版 prompt 完全一致。 */
  const customTopic = cur.custom ? (function(){ try{ return localStorage.getItem('wt_score_topic_v1') || ''; }catch(e){ return ''; } })() : '';
  // 9/16/9/17 的「字数不足拦截」于 10/8 她拍板退役：不写够也能交，AI 在反馈里提醒最好写够。
  // 真实规则：缺 ≤10 词不扣分，缺 >10 词才扣（写进 prompt，见【词数规则】）。只拦空白卷。
  const min = wtMinWords(type);
  const wc2 = wtCountWords(essay);
  if(!wc2){ toast('Nothing to score yet — write your response first.'); return; }
  const isTask1 = type === '小作文';
  const dim = isTask1 ? 'TA（Task Achievement 任务完成）' : 'TR（Task Response 任务回应）';
  const btn = $('#examScoreBtn');   // 手动评分按钮可能不存在（HTML 未提供），空值安全
  // 修：finally 里原本引用了未声明的 btnHtml（作用域内只有 scoreEssay/scoreTemplate 各自的局部
  // btnHtml）→ ReferenceError；且 btn 为 null 时 btn.disabled 也直接 TypeError。声明处缓存 + finally 统一守卫。
  const btnHtml = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.textContent = '评分中…'; }
  const box = $('#examResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">Scoring your response…</div>';
  /* 10/8 有题目（自练题）时追加切题度判定要求 */
  const topicBlock = customTopic ? `
8. 用户消息里提供了「题目」。额外输出 topicJudge：
   a. verdict：只能选「切题」「部分偏题」「偏题」——判全文是否真正回答了题目问的问题（立场有没有答、论点有没有跑出题目范围）。
   b. reason：≤40 字说明判定理由；偏题时点出哪几段跑题。
   c. approach：2-3 条「这道题可以怎么讲」——立场选项或论点方向，每条 ≤40 字，简体中文。
   顶层 JSON 加 "topicJudge":{"verdict":"","reason":"","approach":["",""]}；没有题目就绝不输出该字段。` : '';
  const messages = [
    { role:'system', content:
`你是雅思写作${isTask1 ? ' Task 1 小作文（学术类图表/数据题）' : ' Task 2 大作文（议论文）'}考官，严格按官方评分细则给分。
评分标准：${dim}、CC（Coherence & Cohesion 连贯与衔接）、LR（Lexical Resource 词汇）、GRA（Grammatical Range & Accuracy 语法）。
${isTask1 ? RULES_TASK1 : RULES_TASK2}
输出要求：
1. 对照细则逐档比对，给出 0-9 的预估分（可用 0.5）。
2. breakdown 第一项 key 统一用 "TR" 输出（${isTask1 ? '小作文时我知道它代表 TA' : '即 TR'}）。
3. 指出文中超过 35 词或含多层从句的复杂句，给出简化建议。
4. 全部用简体中文。
5. anchors：从下方短语表挑 1-3 条与这篇最突出的问题对应的官方评分原话（一字不改照抄），标明分项与档位；表里没有贴切的就给空数组，不要自己编原话。
6. good：从作文里挑 1-2 句写得地道的原句（一字不改），每条格式"原句 —— 半句说明为什么好"；gap：距下一个 0.5 分档最关键的 2-3 条改法，每条 ≤30 字、点名分项。
7. grammar：逐条列出语法/表达错误，含原错处、改法、一句错因；每条标 tag，只能从这个集合选：搭配/中式/时态/单复数/冠词/介词/句式/用词/其他；同类错误合并成一条；没有明显错误就给空数组。
${topicBlock}
【词数规则（真实考试口径，10/8 她拍板）】用户消息会给出「本次实际词数 / 最低要求」。
缺口 ≤10 词：不因词数扣分；缺口 >10 词：在 TR/TA 中体现但总差距不超过 0.5，并在 gap 里给一条「下次写够词数」提醒。
绝不因词数单项把总分压到明显不合理的档位。

【官方评分原话短语表（引用时一字不改）】
${ANCHOR_TABLE_EN}

只输出严格 JSON，不要其他文字：
{"overall":6.0,"breakdown":{"TR":6.0,"CC":6.0,"LR":6.0,"GRA":5.5},"anchors":[{"dim":"TR","band":5,"quote":""}],"good":["原句 —— 为什么好"],"gap":{"steps":["",""]},"grammar":[{"wrong":"","fix":"","why":"","tag":"搭配"}],"longSentences":[{"sentence":"原文句子","wordCount":42,"suggestion":"拆分建议"}],"suggestions":["建议1","建议2","建议3"]}` },
    { role:'user', content: (customTopic ? '题目：\n' + customTopic + '\n\n' : '') + '题型：' + type + '\n\n本次实际词数：' + wc2 + '（最低要求 ' + min + ' 词）\n\n作文：\n' + essay }
  ];
  (async () => {
    try{
      const content = await callRelay('writing_score', messages, 0.4);
      const result = aiJson(content);
      if(!result){
        box.innerHTML = '<div class="ts-sec"><h4>AI 返回（非标准格式）</h4><div style="white-space:pre-wrap;font-size:14px;line-height:1.8">'+escapeHtml(content)+'</div></div>';
        toast('AI 返回格式异常，已显示原文');
        return;
      }
      let html = '<div class="ts-top"><span class="ts-overall">'+escapeHtml(result.overall || 'N/A')+'</span><span class="muted">预估总分</span></div>';
      /* 10/8 切题度块（自练题带题目时 AI 返回 topicJudge；真题无该字段自动跳过） */
      if(result.topicJudge && result.topicJudge.verdict){
        const v = String(result.topicJudge.verdict);
        const cls = v === '切题' ? 'var(--primary)' : (v === '偏题' ? 'var(--danger)' : 'var(--warn)');
        html += '<div class="ts-sec" style="border-left:3px solid ' + cls + ';padding-left:12px"><h4>切题度：<span style="color:' + cls + '">' + escapeHtml(v) + '</span></h4>'
          + (result.topicJudge.reason ? '<p style="margin:4px 0;font-size:13.5px;line-height:1.7">' + escapeHtml(result.topicJudge.reason) + '</p>' : '')
          + (Array.isArray(result.topicJudge.approach) && result.topicJudge.approach.length
              ? '<p style="margin:4px 0 0;font-size:13.5px;line-height:1.8"><b>这道题可以怎么讲：</b></p><ul style="margin:4px 0 0;padding-left:18px;font-size:13.5px;line-height:1.8">' + result.topicJudge.approach.map(x => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>'
              : '')
          + '</div>';
      }
      if(result.breakdown){
        html += '<div class="ts-dims">';
        ['TR','CC','LR','GRA'].forEach(k => {
          if(result.breakdown[k] != null){
            const label = (k==='TR'&&isTask1) ? 'TA' : k;
            html += '<div class="ts-dim"><div class="ts-dim-h">'+label+' <b>'+escapeHtml(result.breakdown[k])+'</b></div></div>';
          }
        });
        html += '</div>';
      }
      const anchors = (Array.isArray(result.anchors) ? result.anchors : []).map(anchorHtml).filter(Boolean);
      if(anchors.length){
        html += '<div class="ts-sec"><h4>考官评分标准对照</h4>' + anchors.join('') + '</div>';
      }
      html += goodHtml(result.good);
      html += gapHtml(result.gap, result.overall);
      if(Array.isArray(result.grammar)) html += gramSectionHtml(result.grammar);   // 10/2 修：旧模考记录无 grammar 字段，不渲染
      if(result.longSentences && result.longSentences.length){
        html += '<div class="ts-sec"><h4>长 / 复杂句分析</h4>';
        result.longSentences.forEach((ls,i) => {
          html += '<div class="ts-gram"><b>第 '+(i+1)+' 句（'+(ls.wordCount||'?')+' 词）：</b>'+escapeHtml(ls.sentence||'')+'<br><span class="ts-fix">建议：'+escapeHtml(ls.suggestion||'')+'</span></div>';
        });
        html += '</div>';
      }
      if(result.suggestions && result.suggestions.length){
        html += '<div class="ts-sec"><h4>改进建议</h4><ul>';
        result.suggestions.forEach(s => { html += '<li>'+escapeHtml(s)+'</li>'; });
        html += '</ul></div>';
      }
      box.innerHTML = html;
      // 提交后：右栏=AI 评分（隐藏输入区）；左栏题目保持展开，我的作文默认收起、可展开回看
      $('#examEssay').hidden = true;
      const ft2 = $('#examAFoot'); if(ft2) ft2.hidden = true;
      const eo2 = $('#examEssayOrig'); if(eo2) eo2.textContent = essay;
      const fo2 = $('#examEssayFold'); if(fo2) fo2.hidden = false;   // 提交后左栏显示「我的作文」回看（9/10 之之）
      // 存盘：真题模考评分记录持久化（刷新不丢），并回流到回顾页「分项模考」看板
      try{
        const cur = examTimer.cur || {};
        const examType = type; // '大作文' / '小作文'
        DATA.writingScores = DATA.writingScores || [];
        DATA.writingScores.push({
          id: uid(), date: todayKey(), mode:'exam',
          examNo: cur.custom ? '' : (cur.no != null ? (cur.kind==='big' ? cur.no : 'T'+cur.no) : ''),   // 10/8 修：自练题不再算出 'Tcustom'
          topic: cur.custom ? customTopic : undefined,
          type: examType, essay: essay, result: result, parsed: true
        });
        hubSave();
        writeSyncMock(examType, result); // 与整篇评分一致，回流分项模考看板
        /* 10/8 自练题交卷成功 → 标记已交卷（Exit 存草稿时据此跳过）+ 清掉本场草稿：
           不然下一场弹「发现草稿」让她恢复一篇已经交过卷的作文 */
        if(cur.custom){
          examTimer.cur.submitted = true;
          try{ localStorage.removeItem('ielts_wt_draft_' + cur.kind + '_custom'); }catch(e){}
        }
        renderScoreHist(); // 同步刷新「AI 评分」tab 的记录列表
      }catch(e){ console.warn('exam score save failed', e); }
      toast('评分完成');
    }catch(e){
      box.innerHTML = '<p class="muted">AI 服务暂不可用：'+escapeHtml(e.message)+'</p><p class="muted" style="font-size:13px">请检查「设置」中的 AI 接口地址。</p>';
    }finally{
      // 修：原 finally 无空值守卫（btn 可能为 null）且引用未声明的 btnHtml → 该块每次执行必抛
      if(btn){ btn.disabled = false; btn.innerHTML = btnHtml; }
    }
  })();
}

function bindExam(){
  const f = $('#examFilter');
  const sf = $('#examSubFilter');
  const updateSubOptions = () => {
    if(!sf) return;
    const val = f ? f.value : 'all';
    let opts = '<option value="all">全部题型</option>';
    if(val === 'big'){
      opts += '<option value="观点型">观点型</option>'
            + '<option value="讨论型">讨论型</option>'
            + '<option value="优缺点型">优缺点型</option>'
            + '<option value="双问题型">双问题型</option>'
            + '<option value="Report">Report</option>';
    } else if(val === 'small'){
      opts += '<option value="动态图">动态图</option>'
            + '<option value="静态图">静态图</option>'
            + '<option value="地图题">地图题</option>'
            + '<option value="流程图">流程图</option>';
    }
    sf.innerHTML = opts;
    sf.value = 'all';
  };
  if(f){ f.addEventListener('change', () => { updateSubOptions(); renderExamList(); }); }
  if(sf){ sf.addEventListener('change', renderExamList); }
  updateSubOptions();

  const exitExam = () => {
    // 退出前自动保存草稿（仅当有内容）——9/30 抽成 examSaveDraft，停笔时也要存一份
    examSaveDraft();
    examResetLock();
    examStopTimer();
    document.body.classList.remove('exam-fullscreen');
    $('#examPractice').hidden = true;
    /* 10/8：自练题退回评分面板（题目框还留着）；真题流程照旧回列表。
       10/8 她要求：退出全屏后作文同步回评分面板的输入框——
       只在有内容且内容确实不同才覆盖（避免把她已粘的外层内容清掉），派发 input 让词数徽标一起刷新。 */
    if(examTimer.cur && examTimer.cur.custom){
      const ee = $('#examEssay'), se = $('#scoreEssay');
      if(ee && se && ee.value.trim() && se.value.trim() !== ee.value.trim()){
        se.value = ee.value;
        se.dispatchEvent(new Event('input', { bubbles: true }));
      }
      switchWriteTab('score');
    }
    else $('#examHome').hidden = false;
  };
  const back = $('#examBack');
  if(back) back.addEventListener('click', exitExam);
  const exitBtn = $('#examExit');
  if(exitBtn) exitBtn.addEventListener('click', exitExam);
  const exitFull = $('#examExitFull');
  if(exitFull) exitFull.addEventListener('click', exitExam);

  /* 10/8 官方字号三档：右上角 Aa 按钮循环 Regular → Large → Extra large（本机记忆） */
  const fontBtn = $('#examFontBtn');
  if(fontBtn) fontBtn.addEventListener('click', examFontCycle);

  const finish = $('#examFinish');
  if(finish) finish.addEventListener('click', () => { examStopAndScore(); });

  const tb = $('#examTimerBtn');
  if(tb) tb.addEventListener('click', () => {
    if(examTimer.running){ examPauseTimer(); tb.textContent = '▶'; }
    else { examResumeTimer(); tb.textContent = '⏸'; }
  });
  /* 10/8：到点弹框两选（考场模式 checkbox 与解锁按钮已随强制停笔机制退役） */
  const tuSubmit = $('#examTuSubmit');
  if(tuSubmit) tuSubmit.addEventListener('click', examTimeUpSubmit);
  const tuKeep = $('#examTuKeep');
  if(tuKeep) tuKeep.addEventListener('click', examTimeUpKeep);
  const essay = $('#examEssay');
  if(essay) essay.addEventListener('input', () => {
    const n = wtCountWords(essay.value);
    $('#examWordCount').textContent = 'Word count: ' + n;
  });
  const sb = $('#examScoreBtn');
  if(sb) sb.addEventListener('click', examStopAndScore);

}

