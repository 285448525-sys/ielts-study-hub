/* === 句型页引擎 sentence-drill v2（design/16 P0）===
   接管口语页「练习」tab（#sentView），替换场景闯关（SD_DEFAULT_ON=false 退场）与老 pdLegacy。
   结构（照抄 scene-drill 成熟模式）：
   - 顶层一律 var（speaking 页软导航 window.eval 重跑不炸）+ window 缓存跨软导航状态
   - 提交按钮 onclick 单通道（sentOnSubmit 按当前态分派，禁止 addEventListener 双绑定）
   - 判定：本地归一化（5.5 放过：a/the/单复数/三单/大小写/标点）→ AI sentence_check 3.2s 兜底
   - AI 三态：true 过 / false 错 / null pending（design/15 口径：pending 不算过可重交，绝不无声放行；
     ⚠️ ok 收敛必须 === true，!==false 会把 pending 放进「过了」分支——design/15 已踩坑）
   - 进度：DATA.patternDrill.sentences.status = { [句型id]: { st:'mastered'|'wrong', ts } }，随云同步
     （common.js mergeData 按 ts 新者胜合并） */
window.__SENT_V2_ON = true;

var SENT_BANK = null;             // data/sentences.json 解析结果
var SENT_AUTO_T = null;           // 判对 1.1s 自动流转句柄（window 缓存防软导航残留）
if(window.__SENT_CUR == null) window.__SENT_CUR = null;
if(window.__SENT_OPEN == null) window.__SENT_OPEN = {};    // 列表折叠展开态（跨软导航保留）
if(window.__SENT_WRONG_OPEN == null) window.__SENT_WRONG_OPEN = false;
if(window.__SENT_QUEUE == null) window.__SENT_QUEUE = null;   // design/17 错题专项练队列（防软导航残留旧 bank 引用）
if(window.__sentBankCache == null) window.__sentBankCache = null;

/* design/17 focus 中文映射（薄弱条用；未列出的显示原值） */
var SENT_FOCUS_CN = {
  'missing-be': '缺be动词', 'past-tense': '时态', 'word-choice': '用词搭配', 'double-verb': '双谓语',
  'adj-after-feel': 'feel后用形容词', 'parallel': '并列结构', 'plural': '单复数',
  'let-sb-do': 'let sb do结构', 'find-it-adj': 'find it+形容词', 'negation': '否定句'
};
function sentFocusCn(f){ return SENT_FOCUS_CN[f] || f || ''; }

var SENT_CHECK_SYS = '你是雅思口语句型教练。学生按中文句意输出英文，你只按以下尺度挑错：词序错误、时态错误、双动词（一个句子里两个谓语）、缺 be 动词、词性用错。单复数、a/an/the 冠词、三单 -s 一律不算错、不标。只输出 JSON：\n{"ok":true} 或 {"ok":false,"errors":[{"type":"时态","old":"is","note":"描述过去用 was，≤12字"}],"right":"学生答案的最小改正版","fix":"一句话人话总结最关键错误"}\nright 必须基于学生答案改错：保留学生原有用词与句型，只改正 errors 中标出的错误，禁止重写成另一句标准句。\n错误片段 old 必须逐字摘自学生答案原文。';

function sentEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sent$(id){ return document.getElementById(id); }

/* ── 内容库加载（window 级缓存：软导航重进不打第二次） ── */
async function sentLoadBank(){
  if(window.__sentBankCache){ SENT_BANK = window.__sentBankCache; return SENT_BANK; }
  try{
    var res = await fetch('data/sentences.json?v=20260912b');
    SENT_BANK = await res.json();
    window.__sentBankCache = SENT_BANK;
    return SENT_BANK;
  }catch(e){
    console.warn('[sentence-drill] 句型库加载失败', (e && e.message) || e);
    return null;
  }
}
function sentBank(){ return window.__sentBankCache || SENT_BANK || { cats: [] }; }

/* ── 进度 ── */
function sentStatus(){
  if(typeof DATA === 'undefined' || !DATA.patternDrill) return {};
  DATA.patternDrill.sentences = DATA.patternDrill.sentences || {};
  DATA.patternDrill.sentences.status = DATA.patternDrill.sentences.status || {};
  return DATA.patternDrill.sentences.status;
}
function sentMark(id, st){
  sentStatus()[id] = { st: st, ts: Date.now() };
  if(typeof hubSave === 'function') hubSave();
}
function sentWrongCount(){
  /* design/17：按 bank 遍历计数——孤儿 id（旧库已删句型）不显示也不计数（列表/错题库同口径） */
  var st = sentStatus(), bank = sentBank(), n = 0;
  bank.cats.forEach(function(cat){
    cat.sentences.forEach(function(s){ if(st[s.id] && st[s.id].st === 'wrong') n++; });
  });
  return n;
}

/* ── design/17 3.1 薄弱条：源 A = patternDrill.weakness（存量），源 B = 错题库句型 focus 计数；
   topFocus 取两源计数最大者，两源皆空 → 条隐藏 ── */
function sentWeakTop(){
  var wa = {}, best = null, bestN = 0, srcA = 0, srcB = 0;
  var w = (typeof DATA !== 'undefined' && DATA.patternDrill && DATA.patternDrill.weakness) || {};
  Object.keys(w).forEach(function(f){
    var n = (w[f] && Number(w[f].wrongCount)) || 0;
    if(n > 0){ wa[f] = n; if(n > bestN){ best = f; bestN = n; srcA = n; } }
  });
  var st = sentStatus(), bank = sentBank();
  var wb = {};
  bank.cats.forEach(function(cat){
    cat.sentences.forEach(function(s){
      if(st[s.id] && st[s.id].st === 'wrong' && s.focus){ wb[s.focus] = (wb[s.focus] || 0) + 1; }
    });
  });
  Object.keys(wb).forEach(function(f){
    if(wb[f] > bestN){ best = f; bestN = wb[f]; srcA = wa[f] || 0; srcB = wb[f]; }
    else if(wb[f] > 0 && !best){ best = f; bestN = wb[f]; srcA = 0; srcB = wb[f]; }
  });
  return { focus: best, srcA: srcA, srcB: srcB };
}
/* 薄弱条点击：展开含该 focus 句型的第一个分类 → 滚动到位 */
function sentWeakClick(){
  var top = sentWeakTop();
  if(!top.focus) return;
  var bank = sentBank();
  bank.cats.forEach(function(cat){
    var hit = cat.sentences.some(function(s){ return s.focus === top.focus; });
    if(hit) window.__SENT_OPEN[cat.id] = true;
  });
  window.__SENT_CUR = null;               // 若停在练习态，先回列表
  sentRender();
  var row = document.querySelector('[data-sent-weak]');
  if(row && row.scrollIntoView) row.scrollIntoView({ block: 'start' });
  window.__SENT_WEAK_JUMP = true;         // 展开后把含该 focus 的分类滚到可视区
  setTimeout(function(){
    var host = sent$('sentBody');
    if(!host || !window.__SENT_WEAK_JUMP) return;
    window.__SENT_WEAK_JUMP = false;
    var cats = bank.cats.filter(function(c){ return c.sentences.some(function(s){ return s.focus === top.focus; }); });
    for(var i = 0; i < cats.length; i++){
      var el = host.querySelector('[data-sent-cat="' + cats[i].id + '"]');
      if(el && el.scrollIntoView){ el.scrollIntoView({ block: 'start' }); break; }
    }
  }, 60);
}
function sentWeakHtml(){
  var top = sentWeakTop();
  if(!top.focus) return '';
  var parts = ['最近常错【' + sentFocusCn(top.focus) + '】'];
  if(top.srcA > 0) parts.push('（' + top.srcA + ' 次）');
  if(top.srcB > 0) parts.push(' · 句型错题 ' + top.srcB + ' 题');
  return '<div class="sent-weak" data-sent-weak>' + sentEsc(parts.join('')) + ' →</div>';
}

/* ── design/17 3.2 错题专项练队列 ── */
function sentNextFromQueue(){
  var q = window.__SENT_QUEUE;
  if(!q || !q.length){ window.__SENT_QUEUE = null; return false; }
  var nid = q.shift();
  if(nid && sentFind(nid)){ sentStart(nid); return true; }
  window.__SENT_QUEUE = null; return false;
}
function sentStartWrongAll(){
  var st = sentStatus(), ids = [], bank = sentBank();
  bank.cats.forEach(function(cat){
    cat.sentences.forEach(function(s){ if(st[s.id] && st[s.id].st === 'wrong') ids.push(s.id); });
  });
  if(!ids.length){ toast('错题库是空的'); return; }
  window.__SENT_QUEUE = ids.slice(1);
  sentStart(ids[0]);
  toast('专项练 ' + ids.length + ' 题，过完自动下一题');
}

/* ── 本地判定（5.5 放过：a/an/the 冠词、单复数、三单 -s、大小写、标点）── */
function sentTokens(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function sentNoArt(t){ return t.filter(function(w){ return w !== 'a' && w !== 'an' && w !== 'the'; }); }
function sentDeS(w){ return (w.length > 3 && /s$/.test(w)) ? w.slice(0, -1) : w; }
function sentLocalJudge(u, r){
  var a = sentNoArt(sentTokens(u)), b = sentNoArt(sentTokens(r));
  if(!a.length || !b.length || a.length !== b.length) return false;
  for(var i = 0; i < a.length; i++){
    if(a[i] !== b[i] && sentDeS(a[i]) !== sentDeS(b[i])) return false;
  }
  return true;
}

/* ── AI 兜底：sentence_check（3.2s 超时；三态 true/false/null）── */
function sentWithTimeout(p, ms){
  return new Promise(function(res, rej){
    var t = setTimeout(function(){ res('__TIMEOUT__'); }, ms);
    p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
  });
}
async function sentAskAI(sent, answer){
  try{
    var raw = await sentWithTimeout(
      callRelay('sentence_check',
        [{ role: 'system', content: SENT_CHECK_SYS },
         { role: 'user', content: '句意：' + (sent.cn || '') + '\n标准句：' + (sent.right || '') + '\n学生答案：' + answer }],
        0, { max_tokens: 200 }),
      3200);
    if(raw === '__TIMEOUT__') return { ok: null, err: '判定超时' };
    var j = aiJson(raw);
    if(!j || typeof j.ok !== 'boolean') return { ok: null, err: '判定结果异常' };
    return { ok: j.ok, errors: Array.isArray(j.errors) ? j.errors : [], right: j.right || '', fix: j.fix || '' };
  }catch(e){
    return { ok: null, err: (e && e.message) || 'AI 调用失败' };
  }
}

/* ── 原文内标红（design/16 §1.3.4）：errors[].old 在原答案中按顺序定位 → 红字+上标序号；
   任一片段定位失败 → 降级为原样显示 + 错误单列，绝不崩 ── */
function sentRenderErrors(answer, errors){
  var items = (errors || []).filter(function(e){ return e && e.old; });
  if(!items.length) return { html: sentEsc(answer), notes: '', degraded: items.length > 0 };
  var parts = [], notes = [], pos = 0, miss = false;
  var low = String(answer).toLowerCase();
  items.forEach(function(e, i){
    var old = String(e.old);
    var at = low.indexOf(old.toLowerCase(), pos);
    if(at < 0){ miss = true; return; }
    parts.push(sentEsc(answer.slice(pos, at)));
    parts.push('<span class="sent-err">' + sentEsc(answer.slice(at, at + old.length)) + '<sup>' + (i + 1) + '</sup></span>');
    pos = at + old.length;
    notes.push('<div class="sent-err-note"><sup>' + (i + 1) + '</sup> ' + sentEsc(((e.type ? e.type + '：' : '') + (e.note || ''))) + '</div>');
  });
  parts.push(sentEsc(answer.slice(pos)));
  var notesHtml = notes.join('');
  if(miss){
    notesHtml = items.map(function(e, i){
      return '<div class="sent-err-note"><sup>' + (i + 1) + '</sup> ' + sentEsc(((e.type ? e.type + '：' : '') + (e.note || ''))) + '</div>';
    }).join('');
    return { html: sentEsc(answer), notes: notesHtml, degraded: true };
  }
  return { html: parts.join(''), notes: notesHtml, degraded: false };
}

/* ── 状态（跨软导航走 window）── */
function sentCur(){
  if(!window.__SENT_CUR){
    window.__SENT_CUR = { view: 'list', catId: '', sentId: '', phase: 'main', sceneIdx: 0, tries: 0, revealed: false, draft: '', fb: null };
  }
  return window.__SENT_CUR;
}
function sentClearAuto(){ if(SENT_AUTO_T){ clearTimeout(SENT_AUTO_T); SENT_AUTO_T = null; } }

/* ── 渲染 ── */
function sentRender(){
  var host = sent$('sentBody');
  if(!host) return;                       // 不在口语页
  sentClearAuto();
  var c = sentCur();
  host.innerHTML = (c.view === 'practice') ? sentPracticeHtml() : sentListHtml();
  if(c.view === 'list') sentBindList(); else sentBindPractice();
}

/* 列表：薄弱条占位（P0 留空）+ 5 类折叠（顺序=sentences.json 固定 P2 答题顺序）+ 错题库入口 */
function sentListHtml(){
  var bank = sentBank(), st = sentStatus();
  var wh = sentWeakHtml();
  var html = '<div id="sentWeakBar"' + (wh ? '' : ' hidden') + '>' + wh + '</div>';
  html += '<div class="sent-list">';
  bank.cats.forEach(function(cat){
    var mastered = cat.sentences.filter(function(s){ return st[s.id] && st[s.id].st === 'mastered'; }).length;
    var open = !!window.__SENT_OPEN[cat.id];
    html += '<div class="sent-cat" data-sent-cat="' + cat.id + '">'
      + '<div class="sent-cat-row"><b>' + sentEsc(cat.name) + '</b>'
      + '<span class="sent-cat-pos">' + sentEsc(cat.pos || '') + '</span>'
      + '<span class="sent-cat-count">已掌握 ' + mastered + '/' + cat.sentences.length + '</span>'
      + '<span class="sent-caret">' + (open ? '▾' : '▸') + '</span></div>';
    if(open){
      html += '<div class="sent-cat-body">';
      cat.sentences.forEach(function(s){
        var stat = st[s.id] && st[s.id].st;
        var tag = stat === 'mastered' ? '<span class="sent-st st-mastered">已掌握</span>'
          : (stat === 'wrong' ? '<span class="sent-st st-wrong">错题</span>' : '');
        html += '<div class="sent-item" data-sent-item="' + s.id + '"><span class="sent-item-cn">' + sentEsc(s.cn) + '</span>' + tag + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  var wn = sentWrongCount();
  html += '<div class="sent-wrong-entry" data-sent-wrong>错题库（' + wn + ' 题）<span class="sent-caret">' + (window.__SENT_WRONG_OPEN ? '▾' : '▸') + '</span></div>';
  if(window.__SENT_WRONG_OPEN){
    var wrongIds = [];
    bank.cats.forEach(function(cat){ cat.sentences.forEach(function(s){ if(st[s.id] && st[s.id].st === 'wrong') wrongIds.push(s); }); });
    html += '<div class="sent-wrong-list">';
    if(!wrongIds.length) html += '<div class="sent-err-note">错题库是空的，练错一句它就会出现在这里。</div>';
    else html += '<div class="sent-wrong-all" data-sent-wrong-all>全部重练（' + wrongIds.length + ' 题）→</div>';
    wrongIds.forEach(function(s){
      html += '<div class="sent-item" data-sent-item="' + s.id + '"><span class="sent-item-cn">' + sentEsc(s.cn) + '</span><span class="sent-st st-wrong">错题</span></div>';
    });
    html += '</div>';
  }
  return html;
}

/* 单句练习：题干区（小字分类 · 用途 + 大字纯中文，无英文提示）+ 输入 + 提交 + 反馈区 */
function sentPracticeHtml(){
  var bank = sentBank(), c = sentCur();
  var cat = null, sent = null;
  bank.cats.forEach(function(x){ x.sentences.forEach(function(s){ if(s.id === c.sentId){ cat = x; sent = s; } }); });
  if(!cat || !sent){ c.view = 'list'; return sentListHtml(); }
  var fb = c.fb || { cls: '', html: '', notes: '' };
  var btnText = '提交';
  if(c.revealed) btnText = c.phase === 'main' ? '看答案，回列表 ▸' : '看答案，回列表 ▸';
  else if(c.tries > 0) btnText = '再交一次';
  var sceneTag = c.phase === 'scene' ? ' · 换场景巩固 ' + (c.sceneIdx + 1) + '/2' : '';
  return '<div class="sent-back" data-sent-back>&larr; 返回句型列表</div>'
    + '<div class="sent-tag">【' + sentEsc(cat.name) + ' · ' + sentEsc(cat.pos || '') + '】' + sentEsc(sceneTag) + '</div>'
    + '<div class="sent-cn">' + sentEsc(c.phase === 'scene' ? (sent.scene[c.sceneIdx] || {}).cn || '' : sent.cn) + '</div>'
    + '<input id="sentAnswer" class="pd-input" placeholder="用英文说出这句" autocomplete="off" value="' + sentEsc(c.draft) + '"' + (c.revealed ? ' disabled' : '') + '>'
    + '<div class="pd-bar"><button class="btn btn-primary" id="sentSubmit" type="button">' + btnText + '</button>'
    + '<span class="pd-status" id="sentStatus" aria-live="polite"></span></div>'
    + '<div class="pd-feedback ' + fb.cls + '" id="sentFeedback">' + fb.html + (fb.notes || '') + '</div>';
}

/* ── 绑定（每次渲染都是全新节点，无重复绑定风险；提交按钮 onclick 单通道） ── */
function sentBindList(){
  var host = sent$('sentBody');
  host.querySelectorAll('[data-sent-cat]').forEach(function(row){
    row.querySelector('.sent-cat-row').addEventListener('click', function(e){
      e.stopPropagation();
      var id = row.getAttribute('data-sent-cat');
      window.__SENT_OPEN[id] = !window.__SENT_OPEN[id];
      sentRender();
    });
  });
  host.querySelectorAll('[data-sent-item]').forEach(function(item){
    item.addEventListener('click', function(e){
      e.stopPropagation();
      sentStart(item.getAttribute('data-sent-item'));
    });
  });
  var we = host.querySelector('[data-sent-wrong]');
  if(we) we.addEventListener('click', function(){ window.__SENT_WRONG_OPEN = !window.__SENT_WRONG_OPEN; sentRender(); });
  var wk = host.querySelector('[data-sent-weak]');
  if(wk) wk.addEventListener('click', function(e){ e.stopPropagation(); sentWeakClick(); });
  var wa = host.querySelector('[data-sent-wrong-all]');
  if(wa) wa.addEventListener('click', function(e){ e.stopPropagation(); sentStartWrongAll(); });
}
function sentBindPractice(){
  var host = sent$('sentBody');
  var back = host.querySelector('[data-sent-back]');
  if(back) back.addEventListener('click', function(){ window.__SENT_QUEUE = null; window.__SENT_CUR = null; sentRender(); });
  var inp = sent$('sentAnswer');
  if(inp) inp.addEventListener('input', function(){ sentCur().draft = inp.value; });
  var sub = sent$('sentSubmit');
  if(sub) sub.onclick = sentOnSubmit;    // onclick 单通道（照抄 pattern-drill 9/9 教训）
}

function sentStart(sentId){
  window.__SENT_CUR = { view: 'practice', catId: '', sentId: sentId, phase: 'main', sceneIdx: 0, tries: 0, revealed: false, draft: '', fb: null };
  sentRender();
  var inp = sent$('sentAnswer');
  if(inp && inp.focus) inp.focus();
}

/* ── 提交分派（onclick 单通道入口）── */
async function sentOnSubmit(){
  var c = sentCur();
  if(!c || c.view !== 'practice') return;
  var inp = sent$('sentAnswer');
  var answer = ((inp && inp.value) || '').trim();
  if(!answer){ toast('先说出/输入这句英文'); return; }
  if(c.revealed){ sentReveal(); return; }          // 兜底态：按钮变「看答案，回列表」
  var sub = sent$('sentSubmit'), st = sent$('sentStatus');
  if(sub) sub.disabled = true;
  if(st) st.textContent = '判定中…';
  var sent = sentFind(c.sentId);
  var ok = sentLocalJudge(answer, c.phase === 'scene' ? (sent.scene[c.sceneIdx] || {}).right || '' : sent.right);
  var ai = null;
  if(!ok){
    ai = await sentAskAI(sent, answer);
    /* design/15 口径：三态。⚠️ ok 必须 === true 收敛——pending(null) 不算过（灰字可重交），
       绝不静默放行；连续两次（错+pending 合计 tries）落「看答案」兜底不卡死。 */
    ok = (ai.ok === true);
  }
  c.tries++;
  c.draft = answer;
  if(sub) sub.disabled = false;
  if(ok){
    sentPass();
  } else if(ai && ai.ok === false){
    c.lastAi = ai;
    if(c.tries >= 2){ c.revealed = true; }
    sentRenderFail(ai);
  } else {
    /* pending：超时/异常 → 灰字不算过、原答案保留可重交、零数据写入 */
    if(c.tries >= 2){ c.revealed = true; }
    sentRenderPending();
  }
}

function sentFind(id){
  var out = null;
  sentBank().cats.forEach(function(x){ x.sentences.forEach(function(s){ if(s.id === id) out = s; }); });
  return out;
}

/* 判对：主句 → 1.1s 后进换场景；场景 1 → 1.1s 后进场景 2；场景 2 → mastered 回列表 */
function sentPass(){
  var c = sentCur();
  var fb = sent$('sentFeedback'), st = sent$('sentStatus'), sub = sent$('sentSubmit'), inp = sent$('sentAnswer');
  if(fb){ fb.className = 'pd-feedback ok'; fb.textContent = '过了'; }
  if(st) st.textContent = '';
  if(inp) inp.disabled = true;
  if(sub) sub.disabled = true;
  SENT_AUTO_T = setTimeout(function(){
    if(c.phase === 'main'){
      c.phase = 'scene'; c.sceneIdx = 0; c.tries = 0; c.revealed = false; c.draft = ''; c.fb = null; c.lastAi = null;
      sentRender();
    } else if(c.sceneIdx === 0){
      c.sceneIdx = 1; c.tries = 0; c.revealed = false; c.draft = ''; c.fb = null; c.lastAi = null;
      sentRender();
    } else {
      sentMark(c.sentId, 'mastered');
      toast('已掌握');
      sentMaybeReplay(c.sentId);            // design/17 3.4：一类练满 → 拼接验证弹窗（过/跳过写 replay）
      if(sentNextFromQueue()) return;       // design/17 专项练队列还有题 → 自动下一题
      window.__SENT_CUR = null;
      sentRender();
    }
  }, 1100);
}

/* 判错反馈：① 原文内标红+角标（5.5 尺度内错误）② 第 1 次不含整句 ③ 第 2 次给整句 + 看答案兜底
   📌 句型公式 / 💡 用法 仅主句态显示（替换题以 fix 为主，保持轻） */
function sentRenderFail(ai){
  var c = sentCur();
  var sent = sentFind(c.sentId);
  var ans = c.draft;
  var mark = sentRenderErrors(ans, ai.errors || []);
  /* 参考句按当前 phase 取：场景替换题 reveal 给该场景的 right，不给主句（学生答的是场景） */
  var ref = (c.phase === 'scene') ? ((sent.scene[c.sceneIdx] || {}).right || sent.right) : sent.right;
  /* design/17 最小改正口径：reveal 首选「她原句的最小改正版」（AI right），只在改写与参考说法
     本质不同时才另起一行给参考——判定口径不动，这里只管展示 */
  var fixed = (ai.right && String(ai.right).trim()) ? String(ai.right).trim() : '';
  var sameAsRef = fixed && sentLocalJudge(fixed, ref);
  var html = '<div class="sent-orig">' + mark.html + '</div>' + mark.notes;
  if(c.revealed){
    if(fixed){ html += '<div class="sent-right">✅ 改正后（只改错处）：' + sentEsc(fixed) + '</div>'; }
    if(fixed && !sameAsRef){ html += '<div class="sent-note">📄 参考说法：' + sentEsc(ref) + '</div>'; }
    if(!fixed){ html += '<div class="sent-right">✅ 正确句：' + sentEsc(ref) + '</div>'; }
  }
  if(c.phase === 'main'){
    html += '<div class="sent-formula">📌 ' + sentEsc(sent.formula || '') + '</div>';
  }
  html += '<div class="sent-note">💡 ' + sentEsc(sent.note || '') + '</div>';
  if(ai.fix && !c.revealed) html = '<div class="sent-fix">' + sentEsc(ai.fix) + '</div>' + html;
  c.fb = { cls: 'bad', html: html, notes: '' };
  var statusText = c.revealed ? '' : '再试一次：把这句重新说一遍';
  sentRender();
  var st = sent$('sentStatus');          // 渲染后取新节点再写（render 前写会被 innerHTML 重建冲掉）
  if(st) st.textContent = statusText;
}

/* pending 反馈：灰字中性（非红），不算过可重交 */
function sentRenderPending(){
  var c = sentCur();
  c.fb = { cls: '', html: 'AI 没来得及判，这句不算过——再交一次或看答案', notes: '' };
  var statusText = c.revealed ? '' : '网络慢了，等一下再交';
  sentRender();
  var st = sent$('sentStatus');          // 渲染后写（同 sentRenderFail）
  if(st) st.textContent = statusText;
}

/* 兜底出口：主句/替换题最终没过 → 标错题进错题库，回列表（不污染 mastered） */
function sentReveal(){
  var c = sentCur();
  if(c.phase === 'main' || c.phase === 'scene'){
    sentMark(c.sentId, 'wrong');
    toast('已放进错题库，下次重点练');
    if(sentNextFromQueue()) return;         // design/17：专项练队列没过的留错题库，自动进下一题
  }
  window.__SENT_CUR = null;
  sentRender();
}

/* ── design/17 3.4 拼接验证：一类全部 mastered 且该类未 replay 过 → 弹面板拿真实 P2 题练一手 ── */
function sentReplayDone(catId){
  try{
    var pd = (typeof DATA !== 'undefined' && DATA.patternDrill) ? DATA.patternDrill : null;
    if(pd){
      pd.sentences = pd.sentences || {};
      pd.sentences.replay = pd.sentences.replay || {};
      pd.sentences.replay[catId] = Date.now();
      if(typeof hubSave === 'function') hubSave();
    }
  }catch(_){}
  var m = document.getElementById('sentReplayMask');
  if(m) m.remove();
}
async function sentReplaySubmit(cat, topic){
  var inp = document.getElementById('sentReplayAns');
  var go = document.getElementById('sentReplayGo');
  var st = document.getElementById('sentReplayStatus');
  var fb = document.getElementById('sentReplayFb');
  var answer = ((inp && inp.value) || '').trim();
  if(!answer){ toast('先写出这句英文'); return; }
  if(go) go.disabled = true;
  if(st) st.textContent = '判定中…';
  var pseudo = {
    cn: '为这道题写一句' + cat.name + '：' + (topic.titleZh || topic.titleEn || topic.title || ''),
    right: (cat.sentences[0] || {}).right || ''
  };
  var ai = await sentAskAI(pseudo, answer);
  var ok = (ai.ok === true);                    // design/15 口径：pending 不算过
  if(go) go.disabled = false;
  if(ok){
    sentReplayDone(cat.id);
    toast(cat.name + '通关 ✅');
    return;
  }
  if(fb) fb.className = 'pd-feedback' + (ai && ai.ok === false ? ' bad' : '');
  if(ai && ai.ok === false){
    var mark = sentRenderErrors(answer, ai.errors || []);
    if(fb) fb.innerHTML = '<div class="sent-orig">' + mark.html + '</div>' + mark.notes
      + (ai.fix ? '<div class="sent-fix">' + sentEsc(ai.fix) + '</div>' : '');
    if(st) st.textContent = '再试一次或跳过';
  } else {
    if(fb) fb.textContent = 'AI 没来得及判，这句不算过——再交一次或跳过';
    if(st) st.textContent = '网络慢了，等一下再交';
  }
}
function sentReplayOpen(cat, topic){
  var old = document.getElementById('sentReplayMask');
  if(old) old.remove();
  var mask = document.createElement('div');
  mask.id = 'sentReplayMask';
  mask.className = 'sent-replay-mask';
  var tName = topic.titleZh || topic.titleEn || topic.title || '';
  mask.innerHTML = '<div class="sent-replay-panel">'
    + '<div class="sent-replay-title">' + sentEsc(cat.name) + '通关 ✅</div>'
    + '<div class="sent-replay-tip">拿真实题练一手：' + sentEsc(tName) + '——用这一类句型，为这道题写一句' + sentEsc(cat.name) + '位置的话。</div>'
    + '<input id="sentReplayAns" class="pd-input" placeholder="用英文写出这句" autocomplete="off">'
    + '<div class="pd-bar"><button class="btn btn-primary" id="sentReplayGo" type="button">提交</button>'
    + '<span class="pd-status" id="sentReplayStatus" aria-live="polite"></span></div>'
    + '<div class="pd-feedback" id="sentReplayFb"></div>'
    + '<div class="sent-replay-skip" data-sent-replay-skip>跳过</div>'
    + '</div>';
  document.body.appendChild(mask);
  var go = mask.querySelector('#sentReplayGo');
  if(go) go.onclick = function(){ sentReplaySubmit(cat, topic); };   // onclick 单通道
  var skip = mask.querySelector('[data-sent-replay-skip]');
  if(skip) skip.addEventListener('click', function(){ sentReplayDone(cat.id); toast('已跳过，下次练满不再弹'); });
  var inp = mask.querySelector('#sentReplayAns');
  if(inp && inp.focus) inp.focus();
}
function sentMaybeReplay(sentId){
  try{
    var catId = null, cat = null;
    sentBank().cats.forEach(function(x){
      x.sentences.forEach(function(s){ if(s.id === sentId){ catId = x.id; cat = x; } });
    });
    if(!cat || !catId) return false;
    var st = sentStatus();
    var allDone = cat.sentences.every(function(s){ return st[s.id] && st[s.id].st === 'mastered'; });
    if(!allDone) return false;
    var rep = (DATA.patternDrill.sentences && DATA.patternDrill.sentences.replay) || {};
    if(rep[catId]) return false;
    var pool = (DATA.speaking || []).filter(function(s){
      return s && s.type === 'P2' && !s.framework && !/^sp_p[12]_\d+$/.test(s.id || '');
    });
    if(!pool.length){                           // 无 P2 题可抽 → 不弹，直接写 replay 标记
      DATA.patternDrill.sentences = DATA.patternDrill.sentences || {};
      DATA.patternDrill.sentences.replay = rep;
      rep[catId] = Date.now();
      if(typeof hubSave === 'function') hubSave();
      return false;
    }
    var topic = pool[Math.floor(Math.random() * pool.length)];
    sentReplayOpen(cat, topic);
    return true;
  }catch(e){ return false; }
}

/* ── 启动 ── */
async function sentBoot(){
  if(!window.__SENT_V2_ON) return;
  if(!sent$('sentBody')) return;         // 不在口语页
  var bank = await sentLoadBank();
  if(!bank || !bank.cats || !bank.cats.length) return;
  var c = sentCur();
  if(c.view === 'practice' && !sentFind(c.sentId)){ window.__SENT_CUR = null; }   // 防脏状态
  sentRender();
}
ready(function(){ sentBoot(); });
