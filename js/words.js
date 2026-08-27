ready(() => {
  $('#smartImport').addEventListener('click', importSmart);
  $('#searchWord').addEventListener('input', renderWords);
  $('#backfillBtn').addEventListener('click', backfillCn);
  bindDrop();
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
    level: 0, nextReview: todayKey(), errTotal: 0, errStreak: 0, fuzzyStreak: 0,
    hardWord: false, okStreak: 0, lastReview: null, keyWord: false,
    cleared: false   // 短线：是否曾达成"当场连对3次"。新词=false（需连对3次）；已学过的词迁移时置 true（复习对1次即过）
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
    const existing = new Set(DATA.words.map(w => w.en.toLowerCase()));
    let added = 0, skipped = 0;
    rows.forEach(r => {
      if(existing.has(r.en.toLowerCase())){ skipped++; return; }
      existing.add(r.en.toLowerCase());
      DATA.words.push(newWordV12(r.en, ''));
      added++;
    });
    hubSave(); $('#smartInput').value = ''; renderWords();
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
    const existing = new Set(DATA.words.map(w => w.en.toLowerCase()));
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
    hubSave(); $('#smartInput').value = ''; renderWords();
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

/* 一键补全：给词库里「没有中文释义」的老词批量补 AI 翻译（每批 20 个，防超 token）。只写 cn，不破坏其它字段。 */
async function backfillCn(){
  const miss = DATA.words.filter(w => !(w.cn && w.cn.trim()));
  if(!miss.length){ toast('没有缺失释义的词'); return; }
  if(!DATA.settings.relayToken){ toast('去「设置 / AI 接口」填 DeepSeek Key 才能补全'); return; }
  const btn = $('#backfillBtn');
  btn.disabled = true; btn.textContent = '补全中…';
  try{
    for(let i=0; i<miss.length; i+=20){      // 每批 20 个，防超 token
      const chunk = miss.slice(i, i+20);
      const enList = chunk.map(w => w.en).join('\n');
      const sys = '你是英文词库助手。下面每行一个英文单词，请给出每个词的简洁中文释义（最多 3 个义项，用"；"分隔）。只返回 JSON 数组：[{"en":"algorithm","cn":"算法；运算法则"}, ...]，顺序与输入一致，不要任何解释文字、不要 markdown 围栏。';
      const content = await callRelay('words', [{ role:'system', content: sys }, { role:'user', content: enList }], 0.3);
      const arr = aiJson(content);
      if(Array.isArray(arr)){
        const map = {};
        arr.forEach(x => { if(x && x.en) map[String(x.en).toLowerCase()] = String(x.cn || '').trim(); });
        chunk.forEach(w => { const c = map[w.en.toLowerCase()]; if(c) w.cn = c; });
      }
      hubSave(); renderWords();
    }
    const left = DATA.words.filter(w => !(w.cn && w.cn.trim())).length;
    toast(left ? ('已补全一批，还剩 '+left+' 个未识别，可再点一次') : '全部释义已补全 ✅');
  }catch(e){
    toast('补全失败：' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = '🔄 补全缺失释义';
  }
}

/* 拖文件进框：读取纯文本文件内容并填入输入框，随后走原「导入」流程（importSmart）。仅支持 .txt/.md/.csv/.json。 */
function bindDrop(){
  const box = $('#smartInput');
  const zone = $('#dropZone') || box;
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(!f) return;
    const okExt = /\.(txt|md|csv|json|text)$/i.test(f.name);
    if(!okExt){ toast('目前只支持 .txt/.md/.csv/.json 文本文件'); return; }
    const reader = new FileReader();
    reader.onload = () => { box.value = reader.result; toast('已读入「'+f.name+'」，点「导入」即可'); };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsText(f);
  });
}

function deleteWord(id){
  const w = DATA.words.find(x => x.id === id);
  DATA.words = DATA.words.filter(x => x.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(w && w.en){ const wkey = 'en:'+String(w.en).toLowerCase(); if(!DATA.deletedIds.includes(wkey)) DATA.deletedIds.push(wkey); }
  hubSave(); renderWords();
}

/* 词库手动标记（与学习算法 v1.2 字段一致）：
   key=切换重点词；hard=切换高频难词；master=直接标已掌握(Lv7)；forgot=标不认识(降级+明天复习+记当日错) */
function markWord(en, action){
  if(!en) return;
  const w = DATA.words.find(x => x.en && String(x.en).toLowerCase() === String(en).toLowerCase());
  if(!w) return;
  ensureWordV12(w);
  const t = todayKey();
  if(action === 'key'){ w.keyWord = !w.keyWord; }
  else if(action === 'hard'){ w.hardWord = !w.hardWord; }
  else if(action === 'master'){ w.level = 7; w.nextReview = addDays(t, 90); w.lastReview = t; }
  else if(action === 'forgot'){
    w.level = Math.max(0, (w.level || 0) - 2);
    w.nextReview = addDays(t, 1);
    w.errTotal = (w.errTotal || 0) + 1;
    w.lastReview = t;
    if(typeof recordDailyWrong === 'function') recordDailyWrong(w.en);
  }
  hubSave(); renderWords();
}

function renderWords(){
  const kw = ($('#searchWord').value || '').toLowerCase();
  let list = DATA.words.slice().reverse();
  if(kw) list = list.filter(w => (w.en+' '+w.cn).toLowerCase().includes(kw));
  // 旧 mc* → v1.2 迁移（幂等），迁移后落盘
  let migrated = false;
  list.forEach(w => { const b = JSON.stringify(w); ensureWordV12(w); if(JSON.stringify(w) !== b) migrated = true; });
  if(migrated) hubSave();
  $('#wordCount').textContent = DATA.words.length;
  const box = $('#wordList');
  if(list.length === 0){ box.innerHTML = renderEmpty('没有匹配的单词。'); return; }
  const t = todayKey();
  box.innerHTML = list.map(w => {
    ensureWordV12(w);
    const lv = (w.level != null) ? w.level : 0;
    const due = (w.nextReview || '').toString();
    let dueTxt = '新词';
    if(due){
      if(due < t)            dueTxt = '<span class="due-over">已逾期 ' + escapeHtml(due) + '</span>';
      else if(due === t)     dueTxt = '<span class="due-soon">今天复习</span>';
      else                   dueTxt = '下次 ' + escapeHtml(due);
    }
    const tags = ['<span class="lv-badge">Lv ' + lv + '</span>'];
    if(w.hardWord) tags.push('<span class="wtag wtag-hard">难</span>');
    if(w.keyWord)  tags.push('<span class="wtag wtag-key">重</span>');
    return `
      <div class="wcard" data-en="${escapeHtml(w.en)}">
        <div class="wcard-top">
          <div class="wcard-en">${escapeHtml(w.en)}</div>
          <div class="wcard-tags">${tags.join('')}</div>
        </div>
        <div class="wcard-cn">${escapeHtml(w.cn || '')}</div>
        <div class="wcard-meta">${dueTxt}</div>
        <div class="wmark-row">
          <button class="wmark-btn act-key ${w.keyWord?'active':''}" data-en="${escapeHtml(w.en)}" data-act="key">重点</button>
          <button class="wmark-btn act-hard ${w.hardWord?'active':''}" data-en="${escapeHtml(w.en)}" data-act="hard">难词</button>
          <button class="wmark-btn" data-en="${escapeHtml(w.en)}" data-act="master">已掌握</button>
          <button class="wmark-btn" data-en="${escapeHtml(w.en)}" data-act="forgot">不认识</button>
          <button class="wmark-btn wmark-del" data-del="${w.id}">删除</button>
        </div>
      </div>`;
  }).join('');
  box.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => deleteWord(b.dataset.del)));
  box.querySelectorAll('.wmark-btn[data-act]').forEach(b => b.addEventListener('click', () => markWord(b.dataset.en, b.dataset.act)));
}

