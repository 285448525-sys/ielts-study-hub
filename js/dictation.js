// ===== 作文默写功能 =====
// 默写本 CRUD + 常错句热身 + 全文默写提交（DeepSeek 逐句比对）+ 错处记录
// 复用 common.js 全局：ready / $ / DATA / hubSave / uid / toast / escapeHtml / callRelay / aiJson / todayKey

var dictCurrent = null;      // 当前打开的默写本
var dictWeakMap = {};        // 当前源的「loc -> 历史出错次数」（提交前）
var dictWarmSentences = [];  // 热身句索引 -> 原句（避免 HTML 转义污染）

// ---- 视图切换 ----
function showDictHome(){ $('#dictHomeCard').hidden = false; $('#dictPracticeCard').hidden = true; $('#dictLogCard').hidden = true; }
function showDictPractice(){ $('#dictHomeCard').hidden = true; $('#dictPracticeCard').hidden = false; $('#dictLogCard').hidden = true; }
function showDictLogs(){ $('#dictHomeCard').hidden = true; $('#dictPracticeCard').hidden = true; $('#dictLogCard').hidden = false; }

// ---- 历史 weakMap（聚合所有该源 logs 的 weakThisTime）----
function computeWeak(sourceId){
  const map = {};
  (DATA.dictationLogs || []).forEach(l => {
    if(l.sourceId !== sourceId) return;
    (l.weakThisTime || []).forEach(x => { map[x.loc] = (map[x.loc] || 0) + 1; });
  });
  return map;
}

// ========== 默写本 CRUD ==========
function renderDictationSources(){
  const box = $('#dictSrcList');
  if(!box) return;
  const list = DATA.dictationSources || [];
  if(!list.length){
    box.innerHTML = '<div class="muted">还没有默写本。把要背的范文粘进上面的框，起个名，保存就能反复默写。</div>';
    return;
  }
  box.innerHTML = list.map(s => {
    const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === s.id);
    const times = logs.length;
    const mistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
    return '<div class="card" data-id="' + s.id + '">'
      + '<b>' + escapeHtml(s.title) + '</b>'
      + '<div class="muted" style="font-size:12.5px;margin:4px 0">已默 ' + times + ' 次 · 历史错 ' + mistakes + ' 处</div>'
      + '<div class="bank-actions" style="margin-top:6px">'
      +   '<button class="bank-toggle dict-practice" type="button" data-id="' + s.id + '">默写</button>'
      +   '<button class="bank-del dict-del-src" type="button" data-id="' + s.id + '">删除</button>'
      + '</div></div>';
  }).join('');
  box.querySelectorAll('.dict-practice').forEach(b => b.addEventListener('click', () => openDictSource(b.dataset.id)));
  box.querySelectorAll('.dict-del-src').forEach(b => b.addEventListener('click', () => delDictSource(b.dataset.id)));
}

function saveDictSource(){
  const title = $('#dictTitle').value.trim();
  const text = $('#dictSource').value.trim();
  if(!title || !text){ toast('请填标题和范文'); return; }
  DATA.dictationSources.push({ id: uid(), title, text, createdAt: Date.now() });
  hubSave();
  $('#dictTitle').value = '';
  $('#dictSource').value = '';
  renderDictationSources();
  toast('已存入默写本');
}

function delDictSource(id){
  const s = (DATA.dictationSources || []).find(x => x.id === id);
  if(!s) return;
  if(!confirm('删除《' + s.title + '》？相关的错处记录也会一并删除。')) return;
  DATA.dictationSources = DATA.dictationSources.filter(x => x.id !== id);
  DATA.dictationLogs = (DATA.dictationLogs || []).filter(l => l.sourceId !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave();
  renderDictationSources();
  toast('已删除');
}

// ========== 进入默写 ==========
function openDictSource(id){
  const s = (DATA.dictationSources || []).find(x => x.id === id);
  if(!s) return;
  dictCurrent = s;
  dictWeakMap = computeWeak(s.id);
  showDictPractice();
  $('#dictPTitle').textContent = s.title;
  $('#dictInput').value = '';
  $('#dictResult').hidden = true;
  $('#dictResult').innerHTML = '';
  $('#dictShowSrc').checked = false;
  $('#dictSrcView').hidden = true;
  $('#dictSrcView').textContent = s.text;

  // 开始前提示
  const logs = (DATA.dictationLogs || []).filter(l => l.sourceId === id);
  const times = logs.length;
  const totalMistakes = logs.reduce((a, l) => a + (Array.isArray(l.mistakes) ? l.mistakes.length : 0), 0);
  let hint = '已默 ' + times + ' 次 · 历史错 ' + totalMistakes + ' 处';
  const weakArr = Object.entries(dictWeakMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if(weakArr.length){
    hint += ' · 常错：' + weakArr.map(([loc, c]) => '「第' + loc + '句」×' + c).join('、');
  }
  $('#dictPreHint').textContent = hint;

  renderDictWarmup(s, dictWeakMap, $('#dictWarmupOn').checked);
}

// ========== 常错句热身 ==========
function splitSentences(text){
  if(!text) return [];
  const out = [];
  text.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(p => {
    const segs = p.match(/[^.!?]+[.!?]*|\S+/g);
    if(segs){
      segs.forEach(s => { const t = s.trim(); if(t) out.push(t); });
    } else {
      const t = p.trim(); if(t) out.push(t);
    }
  });
  return out;
}

function renderDictWarmup(s, weakMap, on){
  const box = $('#dictWarmup');
  if(!box) return;
  if(!on){
    box.hidden = true; box.innerHTML = ''; dictWarmSentences = [];
    return;
  }
  const sentences = splitSentences(s.text);
  dictWarmSentences = sentences;
  const weakArr = Object.entries(weakMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if(!weakArr.length){
    box.hidden = true; box.innerHTML = ''; dictWarmSentences = [];
    return;
  }
  box.hidden = false;
  box.innerHTML = '<h3 style="margin:8px 0 6px;font-size:15px">🔥 常错句热身（凭记忆重打这几句，提交看错在哪）</h3>'
    + weakArr.map(([loc, c], i) => {
        const idx = Number(loc) - 1;
        const sent = sentences[idx] || '';
        return '<div class="dict-warm-item" data-i="' + i + '" style="border:1px solid var(--line);border-radius:var(--radius);padding:10px;margin-bottom:8px">'
          + '<div class="form-row" style="align-items:center;gap:6px">'
          +   '<span class="muted" style="font-size:12.5px">第 ' + loc + ' 句（历史错 ' + c + ' 次）</span>'
          +   '<button class="ph-hint dict-peek" type="button" data-i="' + i + '">👁 看原句</button>'
          + '</div>'
          + '<div class="dict-peek-src muted" data-i="' + i + '" hidden style="font-size:13px;margin:4px 0;white-space:pre-wrap">' + escapeHtml(sent) + '</div>'
          + '<textarea class="dict-warm-input" data-i="' + i + '" placeholder="凭记忆打这句…" style="width:100%;min-height:60px;padding:8px;border:1px solid var(--line);border-radius:var(--radius);font:inherit;background:var(--bg);color:var(--ink);resize:vertical;box-sizing:border-box"></textarea>'
          + '<button class="btn dict-warm-submit" type="button" data-i="' + i + '" style="margin-top:6px">这句提交</button>'
          + '<div class="dict-warm-res" data-i="' + i + '"></div>'
          + '</div>';
      }).join('');
  box.querySelectorAll('.dict-peek').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.i;
    const src = box.querySelector('.dict-peek-src[data-i="' + i + '"]');
    if(src) src.hidden = !src.hidden;
  }));
  box.querySelectorAll('.dict-warm-submit').forEach(b => b.addEventListener('click', () => {
    const i = b.dataset.i;
    const ta = box.querySelector('.dict-warm-input[data-i="' + i + '"]');
    const res = box.querySelector('.dict-warm-res[data-i="' + i + '"]');
    if(!ta || !res) return;
    const userText = ta.value.trim();
    if(!userText){ toast('先打这句'); return; }
    const correct = dictWarmSentences[Number(i)] || '';
    warmupCheck(correct, userText, res, b);
  }));
}

async function warmupCheck(correctText, userText, resEl, btn){
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }
  btn.disabled = true; btn.textContent = '核对中…';
  resEl.innerHTML = '<div class="ts-load">AI 核对这句…</div>';
  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原句」和「学生默写」，逐字比对，标出差异。
铁律：
1. 学生默写里的占位符 -- — ___ 【】 () 视为跳过未默，不判错。
2. 只标实质差异：漏写 / 错词 / 拼写 / 语法 / 语序。
3. 拼写错误 type 标"拼写"，在清单轻量附带，不要重点标红。
4. 返回严格 JSON：{"mistakes":[{"loc":"1","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":""}]}，无错则 mistakes:[]。
只输出 JSON，无解释无围栏。` },
    { role:'user', content:
`标准原句：
${correctText}

学生默写：
${userText}` }
  ];
  try{
    const content = await callRelay('dictation_check', messages, 0.4);
    const r = aiJson(content);
    if(!r){
      resEl.innerHTML = '<div class="ts-load">AI 返回异常：' + escapeHtml(content.slice(0, 120)) + '</div>';
      return;
    }
    const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
    if(!ms.length){
      resEl.innerHTML = '<div class="ts-fix">✅ 这句没错，棒。</div>';
      return;
    }
    resEl.innerHTML = ms.map(m =>
      '<div class="ts-gram"><s>' + escapeHtml(m.wrong || '（漏写）') + '</s> → <b>' + escapeHtml(m.right || '') + '</b>'
      + '<br><span class="muted">[' + escapeHtml(m.type || '') + '] ' + (m.note ? escapeHtml(m.note) : '') + '</span></div>'
    ).join('');
  }catch(e){
    resEl.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '这句提交';
  }
}

// ========== 正式默写提交 ==========
async function submitDictation(){
  if(!dictCurrent) return;
  const userText = $('#dictInput').value.trim();
  if(!userText){ toast('先把整段默出来再提交'); return; }
  if(!DATA.settings.relayToken){ toast('还没填 DeepSeek Key，去「设置 / AI 接口」填一下'); return; }

  const btn = $('#dictSubmit');
  btn.disabled = true; btn.textContent = '核对中…';
  const box = $('#dictResult');
  box.hidden = false;
  box.innerHTML = '<div class="ts-load">AI 正在逐句比对你的默写，十几秒…</div>';

  // 提交前的历史 weakMap（用于标注"本次又错在历史常错点"）
  const weakBefore = computeWeak(dictCurrent.id);

  const messages = [
    { role:'system', content:
`你是雅思写作默写陪练。给定「标准原文」和「学生默写」，逐句比对，识别差异。
铁律：
1. 学生默写里出现的占位符 -- — ___ 【】 () 等，视为"此处跳过未默"，绝不判为错误；只比对实际写出的文字与原文对应部分是否一致。
2. 把标准原文按句号/问号/感叹号/换行切成句，从 1 开始编号。逐句定位差异，type 分：漏写 / 错词 / 拼写 / 语法 / 语序。loc 用该句的数字编号（如 "3"），无法归到某句用 "0"。
3. 拼写错误在 type 标"拼写"，在清单里附带即可，不要像语法错那样在正文重点标红。
4. 返回严格 JSON：
{"overall":"一句话总体反馈","mistakes":[{"loc":"3","wrong":"学生写法(漏写则空字符串)","right":"正确写法","type":"漏写|错词|拼写|语法|语序","note":"一句说明"}],"weakHistory":[{"loc":"3","times":历史出错次数}]}
weakHistory 里填你根据「历史常错统计」判断本次又错在历史常错点的（loc + 历史次数）；没有就为空数组。
only JSON，无解释无围栏。` },
    { role:'user', content:
`标准原文：
${dictCurrent.text}

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
      pushDictLog(dictCurrent, userText, dictCurrent.text, [], weakBefore, false);
      return;
    }
    const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
    renderDictResult(r, userText, weakBefore);
    pushDictLog(dictCurrent, userText, dictCurrent.text, ms, weakBefore, true);
    toast('核对完成');
  }catch(e){
    box.innerHTML = '<div class="ts-load">AI 调不通：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false; btn.textContent = '提交核对';
  }
}

// ========== 结果渲染 ==========
function renderDictResult(r, userText, weakBefore){
  const box = $('#dictResult');
  const ms = Array.isArray(r.mistakes) ? r.mistakes : [];
  let html = '';

  // 总体反馈
  html += '<div class="ts-fix" style="margin-bottom:10px">' + escapeHtml(r.overall || '') + '</div>';

  // 上半：用户默写 + 错处按句标红
  html += '<div class="ts-sec"><h4>你的默写（标红=有差异）</h4><div class="skeleton-box">';
  const userSentences = splitSentences(userText);
  if(ms.length){
    const byLoc = {};
    ms.forEach(m => { const k = String(m.loc); (byLoc[k] = byLoc[k] || []).push(m); });
    html += userSentences.map((sent, idx) => {
      const arr = byLoc[String(idx + 1)];
      if(arr && arr.length){
        return '<div style="margin-bottom:6px">' + escapeHtml(sent)
          + arr.map(m => '<div class="ts-gram"><s>' + escapeHtml(m.wrong || '（漏写）') + '</s> → <b>' + escapeHtml(m.right || '') + '</b> <span class="muted">[' + escapeHtml(m.type || '') + ']</span></div>').join('')
          + '</div>';
      }
      return '<div style="margin-bottom:6px">' + escapeHtml(sent) + '</div>';
    }).join('');
  } else {
    html += escapeHtml(userText);
  }
  html += '</div></div>';

  // 下半：错处清单
  html += '<div class="ts-sec"><h4>错处清单</h4>';
  if(ms.length){
    html += '<table style="width:100%;border-collapse:collapse;font-size:13.5px">'
      + '<thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px">句</th><th>你的写法</th><th>正确</th><th>类型</th><th>说明</th></tr></thead><tbody>';
    ms.forEach(m => {
      html += '<tr style="border-top:1px solid var(--line)">'
        + '<td style="padding:4px">' + escapeHtml(m.loc || '') + '</td>'
        + '<td><s style="color:var(--muted)">' + escapeHtml(m.wrong || '（漏写）') + '</s></td>'
        + '<td><b style="color:var(--primary-d)">' + escapeHtml(m.right || '') + '</b></td>'
        + '<td>' + escapeHtml(m.type || '') + '</td>'
        + '<td class="muted">' + escapeHtml(m.note || '') + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="muted">🎉 这次默写没有挑出实质差异，太强了。</div>';
  }
  html += '</div>';

  // 历史常错点
  const weakArr = Object.entries(weakBefore).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  const hitWeak = ms.filter(m => weakBefore[String(m.loc)]);
  if(weakArr.length || hitWeak.length){
    html += '<div class="ts-sec"><h4>⚠️ 历史常错点</h4>';
    if(hitWeak.length){
      html += '<div class="ts-gram">本次又错在历史常错点：' + hitWeak.map(m => '第' + escapeHtml(m.loc) + '句').join('、') + '，注意！</div>';
    }
    if(weakArr.length){
      html += weakArr.map(([loc, c]) => '<div class="ts-fix">第 ' + escapeHtml(loc) + ' 句：你累计错 ' + c + ' 次，是反复出错点。</div>').join('');
    }
    html += '</div>';
  }

  // 底部按钮
  html += '<div class="form-row" style="margin-top:10px;flex-wrap:wrap;gap:8px">'
    + '<button class="btn btn-primary" id="dictAgain">再默一次</button>'
    + '<button class="btn" id="dictBackToList2">返回列表</button>'
    + '<button class="btn" id="dictGotoLogs2">查看我的错处记录</button>'
    + '</div>';

  box.innerHTML = html;
  const again = box.querySelector('#dictAgain');
  if(again) again.addEventListener('click', () => openDictSource(dictCurrent.id));
  const back = box.querySelector('#dictBackToList2');
  if(back) back.addEventListener('click', () => { showDictHome(); renderDictationSources(); });
  const logs = box.querySelector('#dictGotoLogs2');
  if(logs) logs.addEventListener('click', () => { showDictLogs(); renderDictLogs(); });
}

// ========== 错处记录 ==========
function pushDictLog(s, userText, correctText, mistakes, weakBefore, parsed){
  const weakThisTime = mistakes.map(m => ({ loc: String(m.loc || '0'), times: 1 }));
  DATA.dictationLogs.push({
    id: uid(),
    sourceId: s.id,
    sourceTitle: s.title,
    date: todayKey(),
    userText,
    correctText,
    mistakes,
    weakThisTime,
    parsed
  });
  hubSave();
}

function renderDictLogs(){
  const box = $('#dictLogList');
  if(!box) return;
  const logs = DATA.dictationLogs || [];
  if(!logs.length){
    box.innerHTML = '<div class="muted">还没有错处记录。去默写本默一次，错的地方会自动记下来。</div>';
    return;
  }
  const groups = {};
  logs.forEach(l => { (groups[l.sourceTitle] = groups[l.sourceTitle] || []).push(l); });
  let html = '';
  Object.keys(groups).forEach(title => {
    const items = groups[title].slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    html += '<div style="margin-bottom:16px"><h3 style="font-size:15px;margin:6px 0">' + escapeHtml(title) + '</h3>';
    html += items.map(l => {
      const n = Array.isArray(l.mistakes) ? l.mistakes.length : 0;
      return '<div class="card" data-id="' + l.id + '" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:10px">'
        + '<div style="flex:1"><span class="muted" style="font-size:13px">' + escapeHtml(l.date || '') + '</span> · 错 ' + n + ' 处</div>'
        + '<button class="bank-del dict-log-del" type="button" data-id="' + l.id + '">删除</button></div>';
    }).join('');
    html += '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.dict-log-del').forEach(b => b.addEventListener('click', () => delDictLog(b.dataset.id)));
}

function delDictLog(id){
  if(!confirm('删除这条记录？')) return;
  DATA.dictationLogs = (DATA.dictationLogs || []).filter(l => l.id !== id);
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave();
  renderDictLogs();
}

function clearAllLogs(){
  if(!confirm('清空全部错处记录？此操作不可撤销。')) return;
  DATA.dictationLogs = [];
  hubSave();
  renderDictLogs();
  toast('已清空');
}

// ========== 事件绑定 ==========
ready(() => {
  const bind = (id, fn) => { const el = $('#' + id); if(el) el.addEventListener('click', fn); };
  bind('dictSaveSrc', saveDictSource);
  bind('dictViewLogs', () => { showDictLogs(); renderDictLogs(); });
  bind('dictLogBack', () => { showDictHome(); renderDictationSources(); });
  bind('dictBack', () => { showDictHome(); renderDictationSources(); });
  bind('dictSubmit', submitDictation);
  bind('dictClearAll', clearAllLogs);

  const showSrc = $('#dictShowSrc');
  if(showSrc) showSrc.addEventListener('change', e => { $('#dictSrcView').hidden = !e.target.checked; });

  const warmOn = $('#dictWarmupOn');
  if(warmOn) warmOn.addEventListener('change', () => {
    if(dictCurrent) renderDictWarmup(dictCurrent, dictWeakMap, warmOn.checked);
  });
});
