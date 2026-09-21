const WORD_FILTERS = { type: 'all', level: 'all', err: 'all' };

function setWordFilterType(type){
  WORD_FILTERS.type = type;
  document.querySelectorAll('#filterType .chip').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}
function setWordFilterLevel(level){
  WORD_FILTERS.level = level;
  document.querySelectorAll('#filterLevel .chip').forEach(b => b.classList.toggle('active', b.dataset.level === level));
}
function setWordFilterErr(err){
  WORD_FILTERS.err = err;
  document.querySelectorAll('#filterErr .chip').forEach(b => b.classList.toggle('active', b.dataset.err === err));
}

/* ===== 词库列表：分组折叠 + 分页渲染 + 勾选练习（1400+ 词防卡顿，9/17）=====
   渲染策略：默认按大类折叠（组头可点展开/收起），展开时每组先渲染 30 条、
   「展开更多」按钮逐步追加；收起时清空组体释放 DOM。搜索时平铺分页。
   删除/勾选/展开全部走 #wordList 容器级事件委托，不再逐条绑定。 */
const BANK_PAGE_SIZE = 30;              // 每组首屏条数 / 「展开更多」步长
let _bankExpanded = {};                 // 组折叠状态 {groupKey:bool}，默认全折叠
let _bankShown = {};                    // 各组已渲染条数 {groupKey:n}
let _bankChecked = new Set();           // 勾选中的词 id（内存，跨筛选保留）
let _bankGroups = {};                   // 当前渲染的分组快照 {groupKey:[word,...]}，供「展开更多」取数
let _bankReadonly = false;              // design/78：官方词库视图=只读行（无勾选/删除），renderWords 按词库设置

function bankErrTier(w){
  const e = Number((w.errTotal != null) ? w.errTotal : (w.mcLapses || 0)) || 0;
  if(e <= 0) return null;
  return e >= 5 ? '5p' : String(e);
}
function errTierLabel(t){ return t === '5p' ? '错 5 次及以上' : '错 ' + t + ' 次'; }

/* 「错误」筛选 chips（带各档词数）。chips 随词库变化重建，调用点=renderWords 开头。 */
function initErrFilter(){
  const box = $('#filterErr');
  if(!box) return;
  const counts = { '1':0, '2':0, '3':0, '4':0, '5p':0 };
  // design/78：数据源走 wbWords()（custom=DATA.words / official=内存词包）；ensureWordV12 迁移仅 custom 需要
  const _ob = wbActive() !== 'custom';
  (wbWords() || []).forEach(w => { if(!_ob) ensureWordV12(w); const t = bankErrTier(w); if(t) counts[t]++; });
  let html = '<button class="chip" data-err="all">全部</button>';
  ['1','2','3','4','5p'].forEach(t => {
    if(counts[t] > 0) html += `<button class="chip" data-err="${t}">${errTierLabel(t)}（${counts[t]}）</button>`;
  });
  box.innerHTML = html;
  // 该档已无词（删光）时回退「全部」，与 initLevelFilter 同口径
  if(WORD_FILTERS.err !== 'all' && !box.querySelector(`[data-err="${WORD_FILTERS.err}"]`)){
    WORD_FILTERS.err = 'all';
  }
  box.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.err === WORD_FILTERS.err);
    btn.addEventListener('click', () => { setWordFilterErr(btn.dataset.err); renderWords(); });
  });
}

function groupByType(list){
  const word = [], phrase = [];
  list.forEach(w => { (/\s/.test(String(w.en || '')) ? phrase : word).push(w); });
  const groups = [];
  if(word.length)   groups.push({ key:'t-word',   name:'单词', items:word });
  if(phrase.length) groups.push({ key:'t-phrase', name:'词组', items:phrase });
  return groups;
}
function groupByErr(list){
  const buckets = { '5p':[], '4':[], '3':[], '2':[], '1':[] };
  list.forEach(w => { const t = bankErrTier(w); if(t && buckets[t]) buckets[t].push(w); });
  // 错得多的档在前；同档内错误次数多的词排前
  return ['5p','4','3','2','1'].filter(t => buckets[t].length).map(t => {
    buckets[t].sort((a,b) => (Number(b.errTotal) || 0) - (Number(a.errTotal) || 0));
    return { key:'e' + t, name:errTierLabel(t), items:buckets[t] };
  });
}

function groupHeadHtml(g){
  const open = !!_bankExpanded[g.key];
  return `
  <div class="wl-group ${open ? 'open' : ''}" data-group="${g.key}">
    <button class="wl-group-head" data-toggle="${g.key}" type="button">
      <svg class="wl-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      <span class="wl-group-name">${escapeHtml(g.name)}</span>
      <span class="wl-group-count">${g.items.length}</span>
    </button>
    <div class="wl-group-body" data-body="${g.key}"><ul class="wl-group-list"></ul></div>
  </div>`;
}

function bankItemHtml(w){
  const lv = (w.level != null) ? (Number(w.level) || 0) : 0;
  // design/58 块3：词库行内展示下次复习时间（只读，wordIntervalDesc 定义在 practice.js，同页全局可用）
  const _info = (typeof wordIntervalDesc === 'function') ? wordIntervalDesc(w) : null;
  const dueText = (_info && _info.next) ? _info.next : '';
  const dueCls = (_info && _info.overdue) ? ' overdue' : '';
  const isPhrase = /\s/.test(String(w.en || ''));
  const meanHtml = isPhrase
    ? `<span class="wl-sense"><span class="wl-sense-pos">phrase.</span><span class="wl-sense-cn">${escapeHtml(w.cn || '')}</span></span>`
    : formatMean(w.pos, w.cn);
  const errN = Number((w.errTotal != null) ? w.errTotal : (w.mcLapses || 0)) || 0;
  const errHtml = errN > 0 ? `<span class="wl-err" title="累计答错 ${errN} 次">错 ${errN}</span>` : '';
  return `
    <li class="wl-item" data-en="${escapeHtml(w.en)}">
      <input type="checkbox" class="wl-check" data-check="${w.id}" aria-label="选中 ${escapeHtml(w.en)}" />
      <span class="wl-word">${escapeHtml(w.en)}</span>
      <div class="wl-senses">${meanHtml}</div>
      ${errHtml}
      <span class="wl-lv">Lv ${lv}${dueText ? '<span class="wl-due' + dueCls + '">· ' + dueText + '</span>' : ''}</span>
      <button class="wl-del" data-del="${w.id}" title="删除" aria-label="删除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </li>`;
}

/* design/78：官方词包按 sl 子列表分组（awl.json sl 1–10，第 1 组=最高频 60 词，第 10 组=30 词）。
   组名不带词数——wl-group-count 徽标已显示 items.length。 */
function groupBySl(list){
  const buckets = {};
  list.forEach(w => { const s = Number(w.sl) || 10; (buckets[s] || (buckets[s] = [])).push(w); });
  return Object.keys(buckets).map(Number).sort((a,b) => a-b).map(s => ({
    key: 's' + s,
    name: '第 ' + s + ' 组' + (s === 1 ? '・最高频' : ''),
    items: buckets[s]
  }));
}

/* design/78：官方词包只读行——复用 bankItemHtml 的 Lv / 下次复习 / 错次展示，
   去掉 checkbox 与删除按钮，行点击无操作（详情面板是以后的任务）。 */
function obBankItemHtml(w){
  const lv = (w.level != null) ? (Number(w.level) || 0) : 0;
  // design/58 块3：词库行内展示下次复习时间（只读，wordIntervalDesc 定义在 practice.js，同页全局可用）
  const _info = (typeof wordIntervalDesc === 'function') ? wordIntervalDesc(w) : null;
  const dueText = (_info && _info.next) ? _info.next : '';
  const dueCls = (_info && _info.overdue) ? ' overdue' : '';
  const meanHtml = formatMean(w.pos, w.cn);
  const errN = Number((w.errTotal != null) ? w.errTotal : (w.mcLapses || 0)) || 0;
  const errHtml = errN > 0 ? `<span class="wl-err" title="累计答错 ${errN} 次">错 ${errN}</span>` : '';
  return `
    <li class="wl-item">
      <span class="wl-word">${escapeHtml(w.en)}</span>
      <div class="wl-senses">${meanHtml}</div>
      ${errHtml}
      <span class="wl-lv">Lv ${lv}${dueText ? '<span class="wl-due' + dueCls + '">· ' + dueText + '</span>' : ''}</span>
    </li>`;
}

/* 向组体追加下一页条目，并维护「展开更多」按钮 */
function renderGroupSlice(gkey, items, body){
  if(!body) return;
  const shown = _bankShown[gkey] || 0;
  const slice = items.slice(shown, shown + BANK_PAGE_SIZE);
  _bankShown[gkey] = shown + slice.length;
  const ul = body.querySelector('.wl-group-list');
  if(ul){
    ul.insertAdjacentHTML('beforeend', slice.map(w => _bankReadonly ? obBankItemHtml(w) : bankItemHtml(w)).join(''));
    ul.querySelectorAll('.wl-check').forEach(cb => { if(_bankChecked.has(cb.dataset.check)) cb.checked = true; });
  }
  let more = body.querySelector('.wl-more');
  const rest = items.length - (_bankShown[gkey] || 0);
  if(rest > 0){
    if(!more){
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'wl-more';
      body.appendChild(more);
    }
    more.dataset.more = gkey;
    more.textContent = `展开更多（还有 ${rest} 个）`;
  } else if(more) more.remove();
}

function toggleBankGroup(gkey){
  const grp = document.querySelector(`.wl-group[data-group="${gkey}"]`);
  if(!grp) return;
  const body = grp.querySelector('.wl-group-body');
  if(!body) return;
  const open = !_bankExpanded[gkey];
  _bankExpanded[gkey] = open;
  grp.classList.toggle('open', open);
  if(open && !body.dataset.init){
    body.dataset.init = '1';
    renderGroupSlice(gkey, _bankGroups[gkey] || [], body);
  } else if(!open){
    // 收起时清空组体释放 DOM（防展开过多后 DOM 常驻拖慢页面）
    body.innerHTML = '<ul class="wl-group-list"></ul>';
    delete body.dataset.init;
    _bankShown[gkey] = 0;
  }
}

function bankUpdateActionBar(){
  const bar = $('#bankActionBar');
  if(!bar) return;
  const n = _bankChecked.size;
  bar.hidden = n === 0;
  const el = $('#bankCheckedN');
  if(el) el.textContent = n;
}

/* 勾选词 id → 小写 en 列表（供 startSessionFromPool） */
function bankCheckedEns(){
  const ids = Array.from(_bankChecked);
  return (DATA.words || []).filter(w => ids.includes(w.id)).map(w => String(w.en || '').trim().toLowerCase());
}

/* ===== 大分类折叠面板（9/17 定稿：类型/等级/错误三个大分类按钮，默认全收起，
   点哪个展开哪个的小分类 chips 行；筛选非「全部」时按钮高亮并显示当前值）===== */
let _bankOpenCat = null;   // 'type' | 'level' | 'err' | null

function catBtnValue(cat){
  if(cat === 'type')  return WORD_FILTERS.type  === 'all'    ? '' : (WORD_FILTERS.type === 'phrase' ? '词组' : '单词');
  if(cat === 'level') return WORD_FILTERS.level === 'all'    ? '' : 'Lv ' + WORD_FILTERS.level;
  if(cat === 'err')   return WORD_FILTERS.err   === 'all'    ? '' : errTierLabel(WORD_FILTERS.err);
  return '';
}

function syncCatBtns(){
  ['type','level','err'].forEach(cat => {
    const btn = document.querySelector(`.wl-cat-btn[data-cat="${cat}"]`);
    if(!btn) return;
    const val = catBtnValue(cat);
    btn.classList.toggle('filtered', !!val);
    btn.classList.toggle('open', _bankOpenCat === cat);
    let lab = btn.querySelector('.wl-cat-val');
    if(!lab){ lab = document.createElement('span'); lab.className = 'wl-cat-val'; btn.insertBefore(lab, btn.querySelector('.wl-cat-caret')); }
    lab.textContent = val;
    const panel = document.getElementById('catPanel-' + cat);
    if(panel) panel.hidden = _bankOpenCat !== cat;
  });
}

function toggleCatPanel(cat){
  _bankOpenCat = (_bankOpenCat === cat) ? null : cat;
  syncCatBtns();
}

function initLevelFilter(){
  const box = $('#filterLevel');
  if(!box) return;
  // Number 归一：脏 level（字符串数字/乱值）不再产生重复 chip 或 NaN 排序（design/78：数据源走 wbWords()）
  const levels = Array.from(new Set((wbWords() || []).map(w => Number(w.level) || 0))).sort((a,b) => a-b);
  let html = '<button class="chip" data-level="all">全部</button>';
  levels.forEach(lv => { html += `<button class="chip" data-level="${lv}">Lv ${lv}</button>`; });
  box.innerHTML = html;
  // 重建后恢复筛选状态：当前筛的等级还有词则保持高亮；已无词（如该等级删光）回退「全部」。
  // 旧实现把「全部」硬编码为高亮，但 WORD_FILTERS.level 仍是旧值 → 界面显示「全部」、实际仍按旧等级过滤。
  if(WORD_FILTERS.level !== 'all' && !levels.some(lv => String(lv) === String(WORD_FILTERS.level))){
    WORD_FILTERS.level = 'all';
  }
  box.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', String(btn.dataset.level) === String(WORD_FILTERS.level));
    btn.addEventListener('click', () => { setWordFilterLevel(btn.dataset.level); renderWords(); });
  });
}

ready(() => {
  $('#smartImport').addEventListener('click', importSmart);
  $('#searchWord').addEventListener('input', renderWords);
  $('#backfillBtn').addEventListener('click', backfillCn);
  document.querySelectorAll('#filterType .chip').forEach(btn => {
    btn.addEventListener('click', () => { setWordFilterType(btn.dataset.type); renderWords(); });
  });
  bindDrop();
  initLevelFilter();
  document.querySelectorAll('.wl-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleCatPanel(btn.dataset.cat));
  });
  // 词库列表事件委托（一次绑定，替代旧版逐条 addEventListener —— 1400+ 词不再卡顿）
  const listBox = $('#wordList');
  if(listBox){
    listBox.addEventListener('click', e => {
      const more = e.target.closest('.wl-more');
      if(more){
        const gkey = more.dataset.more;
        const body = more.closest('.wl-group-body');
        renderGroupSlice(gkey, _bankGroups[gkey] || [], body);
        return;
      }
      const head = e.target.closest('.wl-group-head');
      if(head){ toggleBankGroup(head.dataset.toggle); return; }
      const del = e.target.closest('.wl-del');
      if(del){
        _bankChecked.delete(del.dataset.del);
        deleteWord(del.dataset.del);
        return;
      }
    });
    listBox.addEventListener('change', e => {
      const cb = e.target.closest('.wl-check');
      if(!cb) return;
      if(cb.checked) _bankChecked.add(cb.dataset.check);
      else _bankChecked.delete(cb.dataset.check);
      bankUpdateActionBar();
    });
  }
  const pracBtn = $('#bankPracticeBtn');
  if(pracBtn){
    pracBtn.addEventListener('click', () => {
      const ens = bankCheckedEns();
      if(ens.length < 2){
        const hint = $('#importHint');
        if(hint) hint.textContent = '至少勾选 2 个词才能开始选词义练习。';
        return;
      }
      const ok = (typeof startSessionFromPool === 'function') ? startSessionFromPool(ens) : false;
      if(ok){
        _bankChecked.clear();
        document.querySelectorAll('#wordList .wl-check').forEach(cb => { cb.checked = false; });
        bankUpdateActionBar();
      }
    });
  }
  const clrBtn = $('#bankClearBtn');
  if(clrBtn){
    clrBtn.addEventListener('click', () => {
      _bankChecked.clear();
      document.querySelectorAll('#wordList .wl-check').forEach(cb => { cb.checked = false; });
      bankUpdateActionBar();
    });
  }
  // ── design/78：官方词库视图按钮 ──
  const offStart = $('#officialStartBtn');
  if(offStart){
    offStart.addEventListener('click', () => {
      if(wbActive() !== 'awl') wbSetActive('awl');
      pq = null;
      switchWordTab('study');   // pq 为空 → switchWordTab 内部 autoStartSeeWord() 出题，不重复调用
    });
  }
  const offReset = $('#officialResetBtn');
  if(offReset){
    offReset.addEventListener('click', () => {
      // 两步内联确认：首次点击进入武装态（3 秒不复点自动还原），再点才真正重置
      if(offReset.dataset.armed !== '1'){
        offReset.dataset.armed = '1';
        offReset.classList.add('wb-danger-armed');
        offReset.textContent = '再点一次确认重置';
        setTimeout(() => {
          if(offReset.dataset.armed === '1'){
            offReset.dataset.armed = '';
            offReset.classList.remove('wb-danger-armed');
            offReset.textContent = '重置进度';
          }
        }, 3000);
        return;
      }
      offReset.dataset.armed = '';
      offReset.classList.remove('wb-danger-armed');
      offReset.textContent = '重置进度';
      wbResetBank(wbActive());
      pq = null;
      toast('官方词库进度已重置');
      renderWords();
    });
  }
  // 切换词库：重置筛选与折叠/分页/勾选状态后重渲（renderWords 按 wbActive 取数）
  document.addEventListener('wb:switched', () => {
    setWordFilterType('all'); setWordFilterLevel('all'); setWordFilterErr('all');
    _bankExpanded = {}; _bankShown = {}; _bankGroups = {};
    _bankChecked.clear(); _bankOpenCat = null;
    initLevelFilter();
    renderWords();
    bankUpdateActionBar();
  });
  renderWords();
});

/* 从任意文本抽取英文词（不翻译）：供「无 Key 降级」与复用。
   中英文混排时只取中文前面的英文片段；纯英文行直接取首个英文词/词组。 */
function extractWords(raw){
  const rows = [];
  const seen = new Set();
  raw.split(/\n/).forEach(line => {
    line = line.trim(); if(!line) return;
    let en = '';
    const cjk = line.search(/[一-鿿]/);
    if(cjk >= 0){
      const eng = line.slice(0, cjk).match(/[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*/);
      en = eng ? eng[0].trim() : '';
    } else {
      const eng = line.match(/[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*/);
      en = eng ? eng[0].trim() : '';
    }
    if(!en) return;
    const key = en.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    rows.push({ en });
  });
  return rows;
}

/* 新建单词对象（v1.2 字段默认值）。新词 level=0、nextReview=今天、lastReview=null（未学过）。 */
function newWordV12(en, cn){
  const w = {
    id: uid(), en, cn: cn || '', ts: Date.now(),
    hardWord: false, keyWord: false, pos: '', ipa: ''
  };
  return resetWordProgress(w);
}

/* 把单词进度归零到第一阶段（level 0 / 今天到期）。design/08：已有词重新导入时
   =「更新释义 + 重置进度」，与新建共用同一口径，保证两处字段永不漂移。
   只动客观进度字段：cn/pos/ipa 属内容、由调用方处理；hardWord / keyWord 是她的主观
   标注（词还是难的、还是重点），重置进度时保留；ts / id / en 一律不动。
   ⚠️ resetEpoch（9/17）：每次重置 +1。云合并 _mergeWords 对 level/errTotal/nextReview 等
   字段走「取较大/较晚」单向收敛，导致本机重置出来的 0 会被另一端旧的最大值拉回去
   ——表现为「重新导入想从头背，过一会儿进度又变回去了」。epoch 让「重置」这个
   主观意图能跨设备传播：epoch 大者该组进度字段整组胜出，epoch 相同才走原 max 口径。 */
function resetWordProgress(w){
  w.resetEpoch = (Number(w.resetEpoch) || 0) + 1;
  w.level = 0;
  w.nextReview = todayKey();
  w.errTotal = 0;
  w.errStreak = 0;
  w.okStreak = 0;
  w.lastReview = null;
  w.cleared = false;
  w.shortCount = 0;
  w.lastShortTouch = null;
  w.cleanRounds = 0;
  w.hist = [];   // design/59：重置进度=从零开始，作答历史随 resetEpoch 组语义一并清空
  return w;
}

/* 主入口：粘贴任意内容 → AI 挑出所有英文词 + 直出中文释义 → 批量导入。
   未配置 DeepSeek Key 时降级为纯正则抽取（不翻译），保证无 Key 也能用。 */
async function importSmart(){
  const raw = $('#smartInput').value.trim();
  const hint = $('#importHint');
  const btn = $('#smartImport');
  if(!raw){ toast('先粘贴点内容（单词 / 句子 / 段落都行）'); return; }

  // ── 降级：无 Key → 正则抽取，不翻译 ──
  if(!DATA.settings.relayToken){
    const rows = extractWords(raw);
    if(!rows.length){ toast('没有识别到有效英文单词'); return; }
    const byKey = new Map();
    DATA.words.forEach(w => { const k = String(w.en || '').toLowerCase(); if(k && !byKey.has(k)) byKey.set(k, w); });
    let added = 0, updated = 0, skippedDeleted = 0;
    rows.forEach(r => {
      const key = r.en.toLowerCase();
      const tomb = 'en:' + key;
      if((DATA.deletedIds || []).includes(tomb)){ skippedDeleted++; return; }   // 已掌握/已删除：不复活
      const exist = byKey.get(key);
      if(exist){
        /* 本路径不产出 cn（extractWords 只抽词、丢掉中文），释义无从更新；
           这里只重置进度，提示语也不宣称「释义已更新」。 */
        resetWordProgress(exist);
        updated++;
      } else {
        const w = newWordV12(r.en, '');
        byKey.set(key, w);
        DATA.words.push(w);
        added++;
      }
    });
    hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
    let msg = '成功导入 ' + added + ' 个（未配置 Key，未翻译）';
    if(updated) msg += '，重置 ' + updated + ' 个已有词（进度回到第一阶段）';
    if(skippedDeleted) msg += '，跳过已掌握 ' + skippedDeleted + ' 个';
    toast(msg); if(hint) hint.textContent = msg + '。去「设置 / AI 接口」填 DeepSeek Key 后可自动翻译。';
    return;
  }

  // ── 正常：调 DeepSeek 抽词 + 直出中文释义 → 再自动补词性/音标（导入即完全体，9/17 之之：
  //    不再要求她导入后手动点「AI 补全」。两阶段制：阶段①抽词+释义输出小、绝不截断；
  //    阶段②完全体（含 ipa/pos）按 20/批走「AI 补全」同一套批量逻辑，批间落盘渐进渲染。 ──
  btn.disabled = true; btn.textContent = 'AI 提取中…';
  if(hint) hint.textContent = 'AI 正在从内容里挑英文词并翻译…';
  const sys = '你是一个英文词库助手。从用户输入（可能是单个单词、一行词表、整段英文、或中英文混排）中，抽取所有值得记忆的英文单词或词组。' +
    '对每个词给出简洁中文释义（最多列 3 个常见义项，用“；”分隔）。' +
    '只返回 JSON 数组，格式：[{"en":"algorithm","cn":"算法；运算法则"}, ...]。不要任何解释文字、不要 markdown 围栏。' +
    '如果输入里没有英文单词，返回空数组 []。';
  try{
    const content = await callRelay('words', [{ role:'system', content: sys }, { role:'user', content: raw }], 0.3);
    const arr = aiJson(content);
    if(!Array.isArray(arr)) throw new Error('AI 返回格式异常');
    const byKey = new Map();
    DATA.words.forEach(w => { const k = String(w.en || '').toLowerCase(); if(k && !byKey.has(k)) byKey.set(k, w); });
    let added = 0, updated = 0, skippedDeleted = 0;
    const touched = [];   // 本次导入涉及（新增+重置）的词对象：阶段②只对这批补全，不碰全库
    for(const item of arr){
      const en = String((item && item.en) || '').trim();
      const cn = String((item && item.cn) || '').trim();
      if(!en) continue;
      const key = en.toLowerCase();
      const tomb = 'en:' + key;
      if((DATA.deletedIds || []).includes(tomb)){ skippedDeleted++; continue; }   // 已掌握/已删除：不复活
      const clean = salvageWordCn(cn, '', /\s/.test(en)).cn || cn;   // 修复：旧代码调 isPhrase(en)，但该标识符在词法作用域内不存在 → ReferenceError 导致 AI 导入永远失败
      const exist = byKey.get(key);
      if(exist){
        exist.cn = clean;          // 已有词：覆盖释义（同口径清洗）
        resetWordProgress(exist);  // + 进度回到第一阶段（hardWord/keyWord 保留）
        touched.push(exist);
        updated++;
      } else {
        const w = newWordV12(en, clean);
        byKey.set(key, w);
        DATA.words.push(w);
        touched.push(w);
        added++;
      }
    }
    // 词组词性本地即统一 phrase.（与 backfillCn 同口径）：列表渲染本就自动显示 phrase.，
    // 这里补齐字段让背词/练习页同源，且词组不进阶段②（cn 已有即完全体，音标可选不阻塞）
    touched.forEach(w => { if(/\s/.test(w.en) && w.pos !== 'phrase.') w.pos = 'phrase.'; });
    hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
    let msg = '成功导入 ' + added + ' 个';
    if(updated) msg += '，重置 ' + updated + ' 个已有词（释义已更新，进度回到第一阶段）';
    if(skippedDeleted) msg += '，跳过已掌握 ' + skippedDeleted + ' 个';
    toast(msg); if(hint) hint.textContent = msg;
    // ── 阶段②：自动补全词性/音标（只对本次导入的词；失败不影响已导入的释义） ──
    const miss2 = touched.filter(wordNeedsFill);
    if(miss2.length){
      try{
        if(hint) hint.textContent = '导入完成，AI 正在补全词性与音标…（0/' + miss2.length + '）';
        const r2 = await aiFillWords(miss2, hint);
        if(r2 === 'format'){
          const fMsg = msg + '；词性/音标补全格式异常，点「AI 补全」重试';
          toast(fMsg); if(hint) hint.textContent = fMsg;
        } else {
          const left = DATA.words.filter(wordNeedsFill).length;
          const okMsg = msg + (left ? '（其中 ' + left + ' 个 AI 查不到音标，不影响使用）' : '，均含词性与音标');
          toast(okMsg); if(hint) hint.textContent = okMsg;
        }
      }catch(e2){
        const fMsg = msg + '；词性/音标补全失败：' + e2.message + '（点「AI 补全」重试）';
        toast(fMsg); if(hint) hint.textContent = fMsg;
      }
    }
  }catch(e){
    toast('AI 提取失败：' + e.message + '（可重试，或先去「设置」填 Key）');
    if(hint) hint.textContent = 'AI 提取失败：' + e.message;
  }finally{
    btn.disabled = false; btn.textContent = 'AI 导入';
  }
}

/* 词性归一化：把 AI 返回的各种写法规范为标准缩写（n./v./adj./adv./prep./conj./pron./num.），
   多个词性用分号连接（如 n.;v.）。兼容英文全写 / 中文 / 带不带点。 */
function normPos(s){
  s = String(s || '').trim().toLowerCase();
  if(!s) return '';
  const parts = s.split(/[;/,、\s]+/).map(p => p.trim()).filter(Boolean);
  const dict = {
    n:'n.', noun:'n.', 名词:'n.',
    v:'v.', verb:'v.', 动词:'v.',
    adj:'adj.', adjective:'adj.', 形容词:'adj.',
    adv:'adv.', adverb:'adv.', 副词:'adv.',
    prep:'prep.', preposition:'prep.', 介词:'prep.',
    conj:'conj.', conjunction:'conj.', 连词:'conj.',
    pron:'pron.', pronoun:'pron.', 代词:'pron.',
    num:'num.', numeral:'num.', 数词:'num.',
    int:'int.', interjection:'int.', 感叹词:'int.',
    art:'art.', article:'art.', 冠词:'art.'
  };
  const out = [];
  for(const p of parts){
    const key = p.replace(/\.+$/, '');
    let v = dict[key] || dict[p];
    if(!v){
      if(/^n/.test(p)) v = 'n.';
      else if(/^v/.test(p)) v = 'v.';
      else if(/^adj/.test(p)) v = 'adj.';
      else if(/^adv/.test(p)) v = 'adv.';
      else if(/^prep/.test(p)) v = 'prep.';
      else if(/^conj/.test(p)) v = 'conj.';
      else if(/^pron/.test(p)) v = 'pron.';
      else if(/^num/.test(p)) v = 'num.';
      else if(/^int/.test(p)) v = 'int.';
      else if(/^art/.test(p)) v = 'art.';
      else v = p; // 兜底保留原值
    }
    if(v && !out.includes(v)) out.push(v);
  }
  return out.join(';');
}

/* 判断一个词是否「仍需 AI 补全」（抽成独立函数便于单测）：
   - 词组（含空格）：只需中文释义，音标可选（模型常查不到，不应阻塞"已补全"）；
   - 单词：需 cn + pos + ipa 三者齐全。 */
function wordNeedsFill(w){
  const isPhrase = en => /\s/.test(String(en || ''));
  const phrase = isPhrase(w.en);
  const missCn = !(w.cn && w.cn.trim());
  if(phrase) return missCn;                                   // 词组只看释义，音标可选
  return missCn || !(w.pos && w.pos.trim()) || !(w.ipa && w.ipa.trim());
}

/* AI 完全体填充一批词（cn/pos/ipa），每批 20 个防超 token。
   只补缺失字段、绝不覆盖已有数据；词组（含空格）词性统一为 phrase.，音标可选
   （模型对词组常查不到，不作为「已补全」的阻塞条件）。
   「AI 补全」与「AI 导入」共用（9/17 之之：导入时就该是完全体，不要二次点补全）。
   返回 'ok' | 'format'（AI 返回无法解析为 JSON 数组，已打印控制台并中断）；
   网络/接口异常直接 throw，由调用方定提示语。 */
async function aiFillWords(words, hint){
  const isPhrase = en => /\s/.test(String(en || ''));
  for(let i=0; i<words.length; i+=20){      // 每批 20 个，防超 token
    const chunk = words.slice(i, i+20);
    const enList = chunk.map(w => w.en).join('\n');
    const sys = '你是英文词库助手。下面每行一个英文单词或词组。请给每个词返回：' +
      '①简洁中文释义（最多 3 个义项，用";"分隔）；' +
      '②词性，用标准英文缩写（n./v./adj./adv./prep./conj./pron./num.），多个词性用分号分隔如 n.;v.；' +
      '词组（含空格）务必输出 pos:"phrase."；' +
      '③音标，用 IPA 格式，如 /ˈælɡərɪðəm/（单词尽量给出，词组查不到可留空字符串）。' +
      '注意：每个词都必须给出①和②，不要留空；顺序与输入一致。' +
      '只返回 JSON 数组：[{"en":"algorithm","cn":"算法；运算法则","pos":"n.","ipa":"/ˈælɡərɪðəm/"}, ...]，不要任何解释文字、不要 markdown 围栏。';
    const content = await callRelay('words', [{ role:'system', content: sys }, { role:'user', content: enList }], 0.3);
    const arr = aiJson(content);
    if(!Array.isArray(arr)){
      console.error('[aiFillWords] AI 返回无法解析为 JSON 数组：', content);
      return 'format';
    }
    // 两端都 trim，避免模型在 en 上附带首尾空格导致匹配失败（旧逻辑因此漏填）
    const map = {};
    arr.forEach(x => { if(x && x.en) map[String(x.en).toLowerCase().trim()] = x; });
    let filled = 0;
    chunk.forEach(w => {
      const it = map[String(w.en).toLowerCase().trim()];
      if(!it) return;
      if(!w.cn || !w.cn.trim()){ const c = String(it.cn || '').trim(); if(c){ w.cn = (salvageWordCn(c, w.ipa, isPhrase(w.en)).cn || c); filled++; } }
      if(isPhrase(w.en)){
        if(w.pos !== 'phrase.'){ w.pos = 'phrase.'; filled++; }   // 词组词性统一为 phrase.
      } else if(!w.pos || !w.pos.trim()){ const p = normPos(it.pos); if(p){ w.pos = p; filled++; } }
      if(!w.ipa || !w.ipa.trim()){ const ipa = String(it.ipa || '').trim(); if(ipa){ w.ipa = ipa; filled++; } }
    });
    hubSave(); renderWords();
    if(hint) hint.textContent = 'AI 正在补全词性与音标… ' + Math.min(i+20, words.length) + '/' + words.length;
    console.log('[aiFillWords] 批次', i/20+1, '命中', arr.length, '条，填充', filled, '处');
  }
  return 'ok';
}

/* 一键补全：给词库里「缺失中文释义 / 词性 / 音标」的词批量补 AI。
   只补缺失字段，不破坏已有数据；词组（含空格）补中文释义 + 音标（可选），且词性统一为 phrase.。
   已填的 cn / pos / ipa 不会被覆盖。
   修复：词组只需释义即可判定"已补全"（旧逻辑要求音标，而模型对词组基本不返回音标，
   导致缺音标的词组永远卡在"还剩 N 个"）。 */
async function backfillCn(){
  const isPhrase = en => /\s/.test(String(en || ''));
  // ── 一键格式化（之之 9/7 要求「弄到 AI 补全按钮上，一劳永逸」）：全库释义过 salvageWordCn 重洗——
  // 例句残片/词频/屈折说明/未闭合语法标注/尾部裸英文等老垃圾，点一次按钮即全库清洗，不依赖迁移门控。
  let cleanN = 0;
  if(Array.isArray(DATA.words)){
    for(const w of DATA.words){
      if(!w) continue;
      const cn0 = typeof w.cn === 'string' ? w.cn : '';
      if(!cn0) continue;
      try{
        const r = salvageWordCn(cn0, w.ipa, isPhrase(w.en));
        if(r.cn !== cn0){ w.cn = r.cn; cleanN++; }
        if(r.ipa && r.ipa !== String(w.ipa || '').trim()){ w.ipa = r.ipa; cleanN++; }
      }catch(_){}
    }
  }
  if(cleanN){ hubSave(); renderWords(); console.log('[backfillCn] 格式化清洗', cleanN, '处'); }
  // 先把所有词组词性统一为 phrase.（用户要求"统一成phrase"），与是否需补释义无关
  let posN = 0;
  DATA.words.forEach(w => { if(isPhrase(w.en) && w.pos !== 'phrase.'){ w.pos = 'phrase.'; posN++; } });
  if(posN){ hubSave(); renderWords(); }
  const miss = DATA.words.filter(wordNeedsFill);
  if(!miss.length){ toast(posN ? ('已统一 '+posN+' 个词组词性为 phrase. ✅') : (cleanN ? ('格式化完成：清洗 '+cleanN+' 处 ✅') : '没有需要补全的词')); return; }
  if(!DATA.settings.relayToken){ toast('去「设置 / AI 接口」填 DeepSeek Key 才能补全'); return; }
  const btn = $('#backfillBtn');
  btn.disabled = true; btn.textContent = '补全中…';
  try{
    const r = await aiFillWords(miss);
    if(r === 'format'){
      toast('AI 返回格式异常，已打印到控制台（F12 → Console）');
    } else {
      const left = DATA.words.filter(wordNeedsFill).length;
      toast(left ? ('已补全一批，还剩 '+left+' 个（多为 AI 查不到释义的专名/片段），可手动补或忽略') : '全部已补全 ✅');
    }
  }catch(e){
    toast('补全失败：' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = '🔄 AI 补全';
  }
}

/* 拖文件进框：读取纯文本文件内容并填入输入框，随后走原「导入」流程（importSmart）。
   .txt/.md/.csv/.json 走文本；.xlsx/.xls/.xlsm 由 SheetJS 解析（按需懒加载 js/vendor/xlsx.full.min.js）。 */
function bindDrop(){
  const box = $('#smartInput');
  const zone = $('#dropZone') || box;
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(!f) return;
    const m = f.name.match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : '';
    if(ext === 'xlsx' || ext === 'xls' || ext === 'xlsm'){ handleExcelFile(f); return; }
    const okExt = ['txt','md','csv','json','text'].includes(ext);
    if(!okExt){ toast('目前只支持 .txt/.md/.csv/.json 文本文件，或 .xlsx/.xls Excel 文件'); return; }
    const reader = new FileReader();
    reader.onload = () => { box.value = reader.result; toast('已读入「'+f.name+'」，点「导入」即可'); };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsText(f);
  });
}

/* 按需加载 Excel 解析库（约 880KB，只在拖入 Excel 时才下载一次，之后浏览器缓存）。 */
function ensureXLSX(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/xlsx.full.min.js?v=20260906a';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('解析库下载失败，请检查网络后重试'));
    document.head.appendChild(s);
  });
}

/* Excel 文件导入：读第一个 Sheet → 行转词条。
   全部行都带中文释义 → 直接入库（释义原样保留，不走 AI、不耗额度）；
   有行缺释义 → 转文本填框，点「AI 导入」补全翻译。 */
async function handleExcelFile(f){
  const hint = $('#importHint');
  try{
    toast('正在读取 Excel…');
    await ensureXLSX();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if(!ws){ toast('Excel 里没有工作表'); return; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    const entries = excelRowsToEntries(rows);
    if(!entries.length){ toast('Excel 里没识别到英文单词'); return; }
    if(entries.every(e => e.cn)){
      const byKey = new Map();
      DATA.words.forEach(w => { const k = String(w.en || '').toLowerCase(); if(k && !byKey.has(k)) byKey.set(k, w); });
      let added = 0, updated = 0, skippedDeleted = 0;
      entries.forEach(e => {
        const key = e.en.toLowerCase();
        const tomb = 'en:' + key;
        if((DATA.deletedIds || []).includes(tomb)){ skippedDeleted++; return; }   // 已掌握/已删除：不复活
        const r = salvageWordCn(e.cn, e.ipa, /\s/.test(e.en));   // 直读释义同口径清洗（例句/词频/屈折说明等）
        const exist = byKey.get(key);
        if(exist){
          exist.cn = r.cn;                                       // 已有词：覆盖释义
          if(e.pos) exist.pos = normPos(e.pos);                  // 顺带补词性/音标
          if(e.ipa) exist.ipa = e.ipa; else if(r.ipa) exist.ipa = r.ipa;
          resetWordProgress(exist);
          updated++;
        } else {
          const w = newWordV12(e.en, r.cn);
          if(e.pos) w.pos = normPos(e.pos);
          if(e.ipa) w.ipa = e.ipa; else if(r.ipa) w.ipa = r.ipa;
          byKey.set(key, w);
          DATA.words.push(w);
          added++;
        }
      });
      hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
      let msg = 'Excel 直读导入 ' + added + ' 个（释义原样保留，未走 AI）';
      if(updated) msg += '，重置 ' + updated + ' 个已有词（释义已更新，进度回到第一阶段）';
      if(skippedDeleted) msg += '，跳过已掌握 ' + skippedDeleted + ' 个';
      toast(msg); if(hint) hint.textContent = msg;
      return;
    }
    $('#smartInput').value = entries.map(e => e.cn ? (e.en + ' ' + e.cn) : e.en).join('\n');
    const miss = entries.filter(e => !e.cn).length;
    const msg = '已读入 ' + entries.length + ' 行（' + miss + ' 行缺释义），点「AI 导入」补全翻译';
    toast(msg); if(hint) hint.textContent = msg;
  }catch(err){
    toast('Excel 读取失败：' + err.message);
    if(hint) hint.textContent = 'Excel 读取失败：' + err.message;
  }
}

/* Excel 行数组 → 词条：每行取第一个纯英文词/词组单元格为 en；含中文的单元格为释义
   （行首词性标记如 "n. " 拆出归 pos）；纯词性单元格（如 "n."）归 pos；自动剥行首序号。
   老词库工具导出表的元数据 cell（词频/时间戳/音标/例句等）一律过滤，不进释义。 */
function excelRowsToEntries(rows){
  const out = [];
  const seen = new Set();
  (rows || []).forEach(cells => {
    if(!Array.isArray(cells)) return;
    const vals = cells.map(c => String(c == null ? '' : c).trim().replace(/^\d+[.、)]\s*/, ''))
      .map(s => s.trim()).filter(Boolean);
    if(!vals.length) return;
    let en = '';
    const cnParts = [], posParts = [];
    let ipa = '';
    for(const v of vals){
      const hasCn = /[一-鿿]/.test(v);
      if(!en && !hasCn && /^[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*$/.test(v)){ en = v; continue; }
      if(hasCn){
        if(/^(?:词组|单词)?\d+(?:\s*[~～]\s*\d+)?\s*次(?:\s*(?:及以上|以上|\+))?$/.test(v)) continue;      // 词频 120~149次 / 词组11~19次 / 词组20次及以上
        if(/\d{4}-\d{1,2}-\d{1,2}/.test(v)) continue;          // 日期时间戳
        const ph = v.match(/^(?:phrase|phr|短语)\s*[.、:：]?\s*([一-鿿].*)$/i);   // phrase. 标签 → 剥掉，词组不留词性
        if(ph){ cnParts.push(ph[1]); continue; }
        const pm = v.match(/^((?:[A-Za-z]{1,4}\.\s*)+)([一-鿿].*)$/);
        if(pm){ posParts.push(pm[1].trim()); cnParts.push(pm[2]); } else cnParts.push(v);
        continue;
      }
      if(/^[A-Za-z]{1,4}\.$/i.test(v)){ posParts.push(v); continue; }
      if(!ipa && /[ˈˌːəɪʊɛɔæʃŋθðɑʌɜˑʒʤ]/.test(v)){ ipa = v.replace(/^[/\s]+|[/\s]+$/g, ''); continue; }  // 音标 cell → ipa 字段
      /* 其余纯英文 cell（例句/错误数/误拼记录等元数据）→ 丢弃，不进释义 */
    }
    if(!en) return;
    const key = en.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push({ en, cn: cnParts.join('；'), pos: posParts.join(';'), ipa });
  });
  return out;
}

function deleteWord(id){
  const w = DATA.words.find(x => x.id === id);
  DATA.words = DATA.words.filter(x => x.id !== id);
  // 统一走 addWordTombstone：写 'en:'+小写墓碑的同时撤销反向墓碑，
  // 保证「删除 → 加回来 → 再删除」这条链闭得上（否则加回来过一次的词就永远删不掉了）。
  if(w && w.en && typeof addWordTombstone === 'function') addWordTombstone(w.en);
  hubSave(); initLevelFilter(); renderWords();
}

/* 把 pos + cn 拆成「词性+中文」释义块，多词性横向排列。
   例如 pos="n.;v." cn="算法；运转" → n.算法 / v.运转 */
function formatMean(pos, cn){
  const cnStr = String(cn || '').trim();
  if(!cnStr) return '<span class="wl-sense"><span class="wl-sense-cn" style="color:var(--muted-light)">无释义</span></span>';
  const posList = String(pos || '').split(';').map(s => s.trim()).filter(Boolean);
  const cnList = cnStr.split('；').map(s => s.trim()).filter(Boolean);
  if(!posList.length){
    return `<span class="wl-sense"><span class="wl-sense-cn">${escapeHtml(cnStr)}</span></span>`;
  }
  if(cnList.length >= posList.length){
    return posList.map((p, i) => `<span class="wl-sense"><span class="wl-sense-pos">${escapeHtml(p)}</span><span class="wl-sense-cn">${escapeHtml(cnList[i])}</span></span>`).join('');
  }
  return `<span class="wl-sense"><span class="wl-sense-pos">${escapeHtml(posList[0])}</span><span class="wl-sense-cn">${escapeHtml(cnStr)}</span></span>`;
}

// design/59 · 词库掌握度统计条（纯只读，无事件绑定）。口径写死：
// 已掌握 = cleared===true 且 level≥5（进入 30 天档）；学习中 = cleared===true 且 level<5；未掌握 = 其余（减法兜底，三项和恒等于总数）。
// 全库口径：不受搜索/筛选影响，永远统计整个 DATA.words。
function renderBankStats(){
  const box = document.getElementById('bankStats');
  if(!box) return;
  const ws = wbWords() || [];   // design/78：数据源走 wbWords()，计数随词库切换变化
  let mastered = 0, learning = 0;
  ws.forEach(w => { if(!w) return; const lv = Number(w.level) || 0; if(w.cleared === true){ (lv >= 5) ? mastered++ : learning++; } });
  const fresh = ws.length - mastered - learning;
  const pct = n => ws.length ? (n / ws.length * 100) : 0;
  // 今日错词入口（9/21）：与学习页空态同口径；design/78 起按词库路由（wbTodayWrongEns），N=0 不渲染按钮
  let wrongEns = [];
  try{ wrongEns = wbTodayWrongEns() || []; }catch(e){ wrongEns = []; }
  box.innerHTML = '<span class="wl-stats-bar">' +
      '<i class="wl-stats-seg s-ok" style="width:' + pct(mastered).toFixed(1) + '%"></i>' +
      '<i class="wl-stats-seg s-mid" style="width:' + pct(learning).toFixed(1) + '%"></i>' +
      '<i class="wl-stats-seg s-new" style="width:' + pct(fresh).toFixed(1) + '%"></i>' +
    '</span>' +
    '<span class="wl-stats-txt">已掌握 ' + mastered + ' · 学习中 ' + learning + ' · 未掌握 ' + fresh + '</span>' +
    (wrongEns.length ? '<button class="btn btn-sm" id="dailyWrongBankBtn" style="margin-left:10px;flex:none" title="重练今天答错/不认识的词">今日错词（' + wrongEns.length + '）</button>' : '');
  // 点击按 en 取活词对象（已不在词库的自动过滤）走通用重练通道；重练不修改/不清空 dailyWrong。
  // 词库 tab 发起：先建 pq（题渲染在学习视图）再切回学习 tab（pq.queue 非空，switchWordTab 不会重开出题）
  const dwb = document.getElementById('dailyWrongBankBtn');
  if(dwb && typeof startWrongReview === 'function'){
    dwb.addEventListener('click', () => {
      const words = wrongEns.map(en => (typeof findWordByEn === 'function') ? findWordByEn(en) : null).filter(Boolean);
      if(words.length){
        startWrongReview(words);
        if(typeof switchWordTab === 'function') switchWordTab('study');
      }
    });
  }
}

function renderWords(){
  const official = wbActive() !== 'custom';   // design/78：词库 tab 双视图
  _bankReadonly = official;
  initErrFilter();   // 错误档 chips 随词库变化重建（带各档词数）
  renderBankHead(official);   // design/78：词库卡标题/按钮组/导入区按词库切换
  const kw = ($('#searchWord').value || '').toLowerCase();
  const src = wbWords() || [];
  let list = src.slice();
  if(official){
    // 官方词包保持 json 顺序（sl 1→10 已是文件序），仅按等级稳定排序（稳定排序不破坏组内 sl 序）
    list.sort((a,b) => (a.level || 0) - (b.level || 0));
  } else {
    list.reverse();
    list.sort((a,b) => (a.level || 0) - (b.level || 0)); // 等级低的排在前面
  }
  const type = WORD_FILTERS.type;
  if(!official && type !== 'all'){
    list = list.filter(w => {
      const isPhrase = /\s/.test(String(w.en || ''));
      return type === 'phrase' ? isPhrase : !isPhrase;
    });
  }
  const level = WORD_FILTERS.level;
  if(level !== 'all'){
    list = list.filter(w => String(Number(w.level) || 0) === level);   // 与 initLevelFilter 的 Number 归一口径一致
  }
  const err = WORD_FILTERS.err;
  if(err !== 'all'){
    list = list.filter(w => bankErrTier(w) === err);
  }
  if(kw) list = list.filter(w => (w.en+' '+w.cn).toLowerCase().includes(kw));
  // 旧 mc* → v1.2 迁移（幂等），迁移后落盘——官方词包运行时只读，迁移仅 custom
  if(!official){
    let migrated = false;
    list.forEach(w => { const b = JSON.stringify(w); ensureWordV12(w); if(JSON.stringify(w) !== b) migrated = true; });
    if(migrated) hubSave();
  }
  $('#wordCount').textContent = src.length;
  renderBankStats();   // design/59：统计条在 early return 之前渲染，空列表也显示 0/0/0

  const box = $('#wordList');
  _bankShown = {};   // 重置各组分页计数；折叠状态 _bankExpanded 保留
  if(list.length === 0){
    _bankGroups = {};
    // 官方词包固定 570 词不应为空；src 为空=词包尚未加载成功（走加载失败重试流程中）
    box.innerHTML = (official && src.length === 0) ? renderEmpty('词包加载中…') : renderEmpty('没有匹配的单词。');
    bankUpdateActionBar();
    return;
  }

  if(kw){
    // 搜索：平铺分页（无组头），快速定位（官方视图同样跨组平铺）
    _bankGroups = { flat: list };
    box.innerHTML = '<div class="wl-group open" data-group="flat"><div class="wl-group-body" data-body="flat"><ul class="wl-group-list"></ul></div></div>';
    renderGroupSlice('flat', list, box.querySelector('.wl-group-body'));
  } else {
    // 错误筛选激活 → 按错误次数分组（错得多的在前）；官方 → 按 sl 子列表分组；custom → 单词/词组分组，默认全折叠
    const groups = (err !== 'all') ? groupByErr(list) : (official ? groupBySl(list) : groupByType(list));
    _bankGroups = {};
    groups.forEach(g => { _bankGroups[g.key] = g.items; });
    box.innerHTML = groups.map(g => groupHeadHtml(g)).join('');
    groups.forEach(g => {   // 恢复此前展开的组（只渲染首屏）
      if(_bankExpanded[g.key]){
        const body = box.querySelector(`[data-body="${g.key}"]`);
        if(body){ body.dataset.init = '1'; renderGroupSlice(g.key, g.items, body); }
      }
    });
  }
  bankUpdateActionBar();
  syncCatBtns();   // 同步大分类按钮高亮/当前值（initErrFilter 可能回退 err=all）
}

/* design/78：词库卡头部按词库切换。custom 视图 DOM 与改造前逐字节等价（标题/按钮组还原）；
   official：标题=meta.name、副标题=meta.desc（title 收 meta.source）、右侧「开始学习/重置进度」、
   隐藏导入区/类型筛选/批量条/复习计划/AI 补全。 */
function renderBankHead(official){
  const title = document.getElementById('bankTitle');
  const sub = document.getElementById('bankSub');
  const customBtns = document.getElementById('bankCustomBtns');
  const officialBtns = document.getElementById('bankOfficialBtns');
  const importCard = document.getElementById('bankImportCard');
  const planPanel = document.getElementById('planPanel');
  const typeCatBtn = document.querySelector('.wl-cat-btn[data-cat="type"]');
  const actionBar = document.getElementById('bankActionBar');
  if(!title || !customBtns || !officialBtns) return;   // 元素未就绪（理论上不会发生）
  const isOff = !!official;
  if(isOff){
    const meta = (wbBankMeta(wbActive()) || {});
    title.textContent = meta.name || '学术阅读 AWL';
    sub.textContent = meta.desc || '';
    sub.title = meta.source || '';
    sub.hidden = !sub.textContent;
  } else {
    title.textContent = '我的词库';
    sub.textContent = ''; sub.title = ''; sub.hidden = true;
  }
  customBtns.hidden = isOff;
  officialBtns.hidden = !isOff;
  if(importCard) importCard.hidden = isOff;
  if(typeCatBtn) typeCatBtn.hidden = isOff;   // 官方全是单词：类型筛选无意义
  if(planPanel && isOff) planPanel.hidden = true;   // 复习计划面板官方视图不出现
  if(actionBar && isOff) actionBar.hidden = true;   // 官方只读：批量条不出现
}

