const WORD_FILTERS = { type: 'all', level: 'all' };

function setWordFilterType(type){
  WORD_FILTERS.type = type;
  document.querySelectorAll('#filterType .chip').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}
function setWordFilterLevel(level){
  WORD_FILTERS.level = level;
  document.querySelectorAll('#filterLevel .chip').forEach(b => b.classList.toggle('active', b.dataset.level === level));
}

function initLevelFilter(){
  const box = $('#filterLevel');
  if(!box) return;
  // Number 归一：脏 level（字符串数字/乱值）不再产生重复 chip 或 NaN 排序
  const levels = Array.from(new Set(DATA.words.map(w => Number(w.level) || 0))).sort((a,b) => a-b);
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
  return {
    id: uid(), en, cn: cn || '', ts: Date.now(),
    level: 0, nextReview: todayKey(), errTotal: 0, errStreak: 0,
    hardWord: false, okStreak: 0, lastReview: null, keyWord: false,
    cleared: false, shortCount: 0, lastShortTouch: null, cleanRounds: 0,
    pos: '', ipa: ''
  };
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
    const existing = new Set(DATA.words.map(w => String(w.en || '').toLowerCase()));
    let added = 0, skipped = 0;
    rows.forEach(r => {
      if(existing.has(r.en.toLowerCase())){ skipped++; return; }
      existing.add(r.en.toLowerCase());
      DATA.words.push(newWordV12(r.en, ''));
      added++;
    });
    hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
    let msg = '成功导入 ' + added + ' 个（未配置 Key，未翻译）';
    if(skipped) msg += '，跳过重复 ' + skipped + ' 个';
    toast(msg); if(hint) hint.textContent = msg + '。去「设置 / AI 接口」填 DeepSeek Key 后可自动翻译。';
    return;
  }

  // ── 正常：调 DeepSeek 抽词 + 直出中文 ──
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
    const existing = new Set(DATA.words.map(w => String(w.en || '').toLowerCase()));
    let added = 0, skipped = 0;
    for(const item of arr){
      const en = String((item && item.en) || '').trim();
      const cn = String((item && item.cn) || '').trim();
      if(!en) continue;
      const key = en.toLowerCase();
      if(existing.has(key)){ skipped++; continue; }
      existing.add(key);
      DATA.words.push(newWordV12(en, cn));
      added++;
    }
    hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
    let msg = '成功导入 ' + added + ' 个';
    if(skipped) msg += '，跳过重复 ' + skipped + ' 个';
    toast(msg); if(hint) hint.textContent = msg;
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

/* 一键补全：给词库里「缺失中文释义 / 词性 / 音标」的词批量补 AI（每批 20 个，防超 token）。
   只补缺失的字段，不破坏已有数据；词组（含空格）只补中文释义，不补词性和音标。
   已填的 cn / pos / ipa 不会被覆盖。 */
async function backfillCn(){
  const isPhrase = en => /\s/.test(String(en || ''));
  const needFill = w => {
    const phrase = isPhrase(w.en);
    const missCn = !(w.cn && w.cn.trim());
    if(phrase) return missCn;                       // 词组只补中文
    return missCn || !(w.pos && w.pos.trim()) || !(w.ipa && w.ipa.trim());
  };
  const miss = DATA.words.filter(needFill);
  if(!miss.length){ toast('没有需要补全的词'); return; }
  if(!DATA.settings.relayToken){ toast('去「设置 / AI 接口」填 DeepSeek Key 才能补全'); return; }
  const btn = $('#backfillBtn');
  btn.disabled = true; btn.textContent = '补全中…';
  try{
    for(let i=0; i<miss.length; i+=20){      // 每批 20 个，防超 token
      const chunk = miss.slice(i, i+20);
      const enList = chunk.map(w => w.en).join('\n');
      const sys = '你是英文词库助手。下面每行一个英文单词或词组。请给每个词返回：' +
        '①简洁中文释义（最多 3 个义项，用";"分隔）；' +
        '②词性，用标准英文缩写（n./v./adj./adv./prep./conj./pron./num.），多个词性用分号分隔如 n.;v.；' +
        '③音标，用 IPA 格式，如 /ˈælɡərɪðəm/。' +
        '对于词组（含空格），只返回中文释义，pos 和 ipa 留空字符串。' +
        '只返回 JSON 数组：[{"en":"algorithm","cn":"算法；运算法则","pos":"n.","ipa":"/ˈælɡərɪðəm/"}, ...]，顺序与输入一致，不要任何解释文字、不要 markdown 围栏。';
      const content = await callRelay('words', [{ role:'system', content: sys }, { role:'user', content: enList }], 0.3);
      const arr = aiJson(content);
      if(!Array.isArray(arr)){
        console.error('[backfillCn] AI 返回无法解析为 JSON 数组：', content);
        toast('AI 返回格式异常，已打印到控制台（F12 → Console）');
        break;
      }
      const map = {};
      arr.forEach(x => { if(x && x.en) map[String(x.en).toLowerCase()] = x; });
      let filled = 0;
      chunk.forEach(w => {
        const it = map[w.en.toLowerCase()];
        if(!it) return;
        if(!w.cn || !w.cn.trim()){ w.cn = String(it.cn || '').trim(); filled++; }
        if(!isPhrase(w.en)){
          if(!w.pos || !w.pos.trim()){ const p = normPos(it.pos); if(p){ w.pos = p; filled++; } }
          if(!w.ipa || !w.ipa.trim()){ const ipa = String(it.ipa || '').trim(); if(ipa){ w.ipa = ipa; filled++; } }
        }
      });
      hubSave(); renderWords();
      console.log('[backfillCn] 批次', i/20+1, '命中', arr.length, '条，填充', filled, '处');
    }
    const left = DATA.words.filter(needFill).length;
    toast(left ? ('已补全一批，还剩 '+left+' 个未识别，可再点一次') : '全部已补全 ✅');
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
      const existing = new Set(DATA.words.map(w => String(w.en || '').toLowerCase()));
      let added = 0, skipped = 0;
      entries.forEach(e => {
        const key = e.en.toLowerCase();
        if(existing.has(key)){ skipped++; return; }
        existing.add(key);
        const w = newWordV12(e.en, e.cn);
        if(e.pos) w.pos = normPos(e.pos);
        DATA.words.push(w);
        added++;
      });
      hubSave(); $('#smartInput').value = ''; initLevelFilter(); renderWords();
      let msg = 'Excel 直读导入 ' + added + ' 个（释义原样保留，未走 AI）';
      if(skipped) msg += '，跳过重复 ' + skipped + ' 个';
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
   （行首词性标记如 "n. " 拆出归 pos）；纯词性单元格（如 "n."）归 pos；自动剥行首序号。 */
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
    for(const v of vals){
      const hasCn = /[一-鿿]/.test(v);
      if(!en && !hasCn && /^[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*$/.test(v)){ en = v; continue; }
      if(hasCn){
        const pm = v.match(/^((?:[A-Za-z]{1,4}\.\s*)+)([一-鿿].*)$/);
        if(pm){ posParts.push(pm[1].trim()); cnParts.push(pm[2]); } else cnParts.push(v);
        continue;
      }
      if(/^[A-Za-z]{1,4}\.$/i.test(v)){ posParts.push(v); continue; }
      if(en) cnParts.push(v);
    }
    if(!en) return;
    const key = en.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push({ en, cn: cnParts.join('；'), pos: posParts.join(';') });
  });
  return out;
}

function deleteWord(id){
  const w = DATA.words.find(x => x.id === id);
  DATA.words = DATA.words.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(w && w.en){ const wkey = 'en:'+String(w.en).toLowerCase(); if(!DATA.deletedIds.includes(wkey)) DATA.deletedIds.push(wkey); }
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

function renderWords(){
  const kw = ($('#searchWord').value || '').toLowerCase();
  let list = DATA.words.slice().reverse();
  list.sort((a,b) => (a.level || 0) - (b.level || 0)); // 等级低的排在前面
  const type = WORD_FILTERS.type;
  if(type !== 'all'){
    list = list.filter(w => {
      const isPhrase = /\s/.test(String(w.en || ''));
      return type === 'phrase' ? isPhrase : !isPhrase;
    });
  }
  const level = WORD_FILTERS.level;
  if(level !== 'all'){
    list = list.filter(w => String(Number(w.level) || 0) === level);   // 与 initLevelFilter 的 Number 归一口径一致
  }
  if(kw) list = list.filter(w => (w.en+' '+w.cn).toLowerCase().includes(kw));
  // 旧 mc* → v1.2 迁移（幂等），迁移后落盘
  let migrated = false;
  list.forEach(w => { const b = JSON.stringify(w); ensureWordV12(w); if(JSON.stringify(w) !== b) migrated = true; });
  if(migrated) hubSave();
  $('#wordCount').textContent = DATA.words.length;
  const box = $('#wordList');
  if(list.length === 0){ box.innerHTML = renderEmpty('没有匹配的单词。'); return; }
  box.innerHTML = list.map(w => {
    ensureWordV12(w);
    const lv = (w.level != null) ? (Number(w.level) || 0) : 0;
    const isPhrase = /\s/.test(String(w.en || ''));
    const meanHtml = isPhrase
      ? `<span class="wl-sense"><span class="wl-sense-cn">${escapeHtml(w.cn || '')}</span></span>`
      : formatMean(w.pos, w.cn);
    return `
      <li class="wl-item" data-en="${escapeHtml(w.en)}">
        <span class="wl-word">${escapeHtml(w.en)}</span>
        <div class="wl-senses">${meanHtml}</div>
        <span class="wl-lv">Lv ${lv}</span>
        <button class="wl-del" data-del="${w.id}" title="删除" aria-label="删除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </li>`;
  }).join('');
  box.querySelectorAll('.wl-del').forEach(b => b.addEventListener('click', () => deleteWord(b.dataset.del)));
}

