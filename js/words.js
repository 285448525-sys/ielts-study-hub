ready(() => {
  $('#addWord').addEventListener('click', () => autoAddWord({ fromBtn:true }));
  $('#wordEn').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); autoAddWord(); } });
  $('#wordEn').addEventListener('blur', () => autoAddWord());
  $('#importWords').addEventListener('click', importBulk);
  $('#searchWord').addEventListener('input', renderWords);
  $('#filterTag').addEventListener('change', renderWords);
  renderWords();
});

let _lastAuto = '';   // 防止 blur + 回车 / 重复触发时重复处理同一个词

async function autoAddWord({ fromBtn=false } = {}){
  const en = $('#wordEn').value.trim();
  if(!en){ if(fromBtn) toast('先输入英文单词'); return; }
  if(en === _lastAuto) return;   // 同一词正在/已被处理（blur 与 按钮/回车 重复触发），跳过避免重复存
  _lastAuto = en;
  const status = $('#wordStatus');

  // 1) 词库已有 → 直接回显，不再重复存
  const existing = DATA.words.find(w => w.en.toLowerCase() === en.toLowerCase());
  if(existing){
    status.textContent = '词库里已有 ✓'; status.className = 'word-status ok';
    $('#wordCn').value = existing.cn || '';
    return;
  }

  // 2) 先保存（中文先留空），再查词回填
  const rec = { id: uid(), en, cn:'', tag: $('#wordTag').value, ts: Date.now() };
  DATA.words.push(rec); hubSave(); renderWords();

  if(!DATA.settings.relayToken){
    status.textContent = '已保存（未配置 API Key，中文需手动填；去「设置 / AI 接口」填 Key 可自动查）';
    status.className = 'word-status warn';
    toast('已保存：' + en + '（去设置填 Key 可自动查中文）');
    resetEntry();
    return;
  }

  status.textContent = '翻译中…'; status.className = 'word-status loading';
  try{
    const cn = await translateWord(en);
    rec.cn = cn; hubSave(); renderWords();
    $('#wordCn').value = cn;
    status.textContent = '已保存 + 已查词：' + cn;
    status.className = 'word-status ok';
    toast('已添加并查词：' + en);
  }catch(e){
    status.textContent = '已保存（查词失败：' + e.message + '，中文可手填）';
    status.className = 'word-status err';
    toast('已保存 ' + en + '，但查词失败：' + e.message);
  }
  resetEntry();
}

// 录入后清空英文框、复位标记，焦点回到英文框 → 方便连续录词
function resetEntry(){
  $('#wordEn').value = '';
  $('#wordCn').value = '';
  _lastAuto = '';
  $('#wordEn').focus();
}

// 复用 common.js 的 callTrans（词库翻译，独立 service=trans，与口语GPT隔离）
async function translateWord(en){
  const sys = '你是精准的英汉词典。用户会给你一个英文单词或短词组，请只返回简洁的中文释义，最多列 3 个常见义项，用"；"分隔，不要任何多余说明、不要英文。示例："algorithm" → "算法；运算法则"';
  const text = await callTrans([{ role:'system', content: sys }, { role:'user', content: en }]);
  return text.replace(/\n/g, ' ').trim();
}

async function importBulk(){
  const raw = $('#bulkWords').value.trim(); if(!raw){ toast('粘贴内容后再导入'); return; }
  const tag = $('#importTag').value;
  const hint = $('#importHint');
  let skipped = 0;
  const existing = new Set(DATA.words.map(w => w.en.toLowerCase()));
  const rows = [];
  raw.split(/\n/).forEach(line => {
    line = line.trim(); if(!line) return;
    let en = '', cn = '';
    const cjk = line.search(/[一-鿿]/);
    if(cjk >= 0){
      const eng = line.slice(0, cjk).match(/[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*/);
      en = eng ? eng[0].trim() : '';
      cn = line.slice(cjk).replace(/^[\s，,：:：\-—()（）/|]+/, '').replace(/[\s，,：:：\-—()（）/|]+$/, '').trim();
    } else {
      const eng = line.match(/[A-Za-z][A-Za-z'.\-]*(?:\s+[A-Za-z][A-Za-z'.\-]*)*/);
      en = eng ? eng[0].trim() : '';
    }
    if(!en) return;
    const key = en.toLowerCase();
    if(existing.has(key)){ skipped++; return; }
    existing.add(key);
    rows.push({ en, cn, tag });
  });
  if(!rows.length){ toast(skipped ? ('全部 ' + skipped + ' 个都是重复，已跳过') : '没有识别到有效单词'); return; }

  let added = 0, translated = 0, noCn = 0, done = 0;
  hint.textContent = '识别到 ' + rows.length + ' 个新词，正在翻译…';
  for(const r of rows){
    if(!r.cn && DATA.settings.relayToken){
      try{ r.cn = await translateWord(r.en); translated++; }catch(_){ r.cn = ''; }
    }
    if(!r.cn) noCn++;
    DATA.words.push({ id: uid(), en: r.en, cn: r.cn, tag: r.tag, ts: Date.now() });
    added++; done++;
    hint.textContent = '翻译中… ' + done + '/' + rows.length;
  }
  hubSave(); $('#bulkWords').value=''; renderWords();
  let msg = '成功导入 ' + added + ' 个';
  if(skipped) msg += '，跳过重复 ' + skipped + ' 个';
  if(translated) msg += '，自动翻译 ' + translated + ' 个';
  if(noCn) msg += '（' + noCn + ' 个未翻到中文，可手动补）';
  toast(msg); hint.textContent = msg;
}

function deleteWord(id){
  DATA.words = DATA.words.filter(w => w.id !== id); hubSave(); renderWords();
}

function renderWords(){
  const kw = ($('#searchWord').value || '').toLowerCase();
  const tag = $('#filterTag').value;
  let list = DATA.words.slice().reverse();
  if(kw) list = list.filter(w => (w.en+' '+w.cn).toLowerCase().includes(kw));
  if(tag) list = list.filter(w => w.tag === tag);
  $('#wordCount').textContent = DATA.words.length;
  const box = $('#wordList');
  if(list.length === 0){ box.innerHTML = renderEmpty('没有匹配的单词。'); return; }
  box.innerHTML = list.map(w => `
    <div class="mod-card" style="padding:12px">
      <div style="font-weight:700">${escapeHtml(w.en)}</div>
      <div style="font-size:13px;color:var(--muted)">${escapeHtml(w.cn)}${w.tag ? ' · '+w.tag : ''}</div>
      <button class="btn btn-sm btn-ghost" data-del="${w.id}" style="margin-top:8px;width:100%">删除</button>
    </div>
  `).join('');
  box.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => deleteWord(b.dataset.del)));
}

