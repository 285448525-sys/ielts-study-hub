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
      DATA.words.push({ id: uid(), en: r.en, cn: '', ts: Date.now() });
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
      DATA.words.push({ id: uid(), en, cn, ts: Date.now() });
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

function renderWords(){
  const kw = ($('#searchWord').value || '').toLowerCase();
  let list = DATA.words.slice().reverse();
  if(kw) list = list.filter(w => (w.en+' '+w.cn).toLowerCase().includes(kw));
  $('#wordCount').textContent = DATA.words.length;
  const box = $('#wordList');
  if(list.length === 0){ box.innerHTML = renderEmpty('没有匹配的单词。'); return; }
  box.innerHTML = list.map(w => `
    <div class="mod-card" style="padding:12px">
      <div style="font-weight:700">${escapeHtml(w.en)}</div>
      <div style="font-size:13px;color:var(--muted)">${escapeHtml(w.cn)}</div>
      <button class="btn btn-sm btn-ghost" data-del="${w.id}" style="margin-top:8px;width:100%">删除</button>
    </div>
  `).join('');
  box.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => deleteWord(b.dataset.del)));
}

