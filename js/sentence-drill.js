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
if(window.__sentBankCache == null) window.__sentBankCache = null;

var SENT_CHECK_SYS = '你是雅思口语句型教练。学生按中文句意输出英文，你只按以下尺度挑错：词序错误、时态错误、双动词（一个句子里两个谓语）、缺 be 动词、词性用错。单复数、a/an/the 冠词、三单 -s 一律不算错、不标。只输出 JSON：\n{"ok":true} 或 {"ok":false,"errors":[{"type":"时态","old":"is","note":"描述过去用 was，≤12字"}],"right":"完整标准句","fix":"一句话人话总结最关键错误"}\n错误片段 old 必须逐字摘自学生答案原文。';

function sentEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sent$(id){ return document.getElementById(id); }

/* ── 内容库加载（window 级缓存：软导航重进不打第二次） ── */
async function sentLoadBank(){
  if(window.__sentBankCache){ SENT_BANK = window.__sentBankCache; return SENT_BANK; }
  try{
    var res = await fetch('data/sentences.json?v=20260912a');
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
  var s = sentStatus(), n = 0;
  for(var k in s){ if(s[k] && s[k].st === 'wrong') n++; }
  return n;
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
  var html = '<div id="sentWeakBar" hidden></div>';
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
}
function sentBindPractice(){
  var host = sent$('sentBody');
  var back = host.querySelector('[data-sent-back]');
  if(back) back.addEventListener('click', function(){ window.__SENT_CUR = null; sentRender(); });
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
  var right = (ai.right && sentLocalJudge(ai.right, ref)) ? ai.right : ref;  // 以数据为准
  var html = '<div class="sent-orig">' + mark.html + '</div>' + mark.notes;
  if(c.revealed){
    html += '<div class="sent-right">✅ 正确句：' + sentEsc(right) + '</div>';
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
  }
  window.__SENT_CUR = null;
  sentRender();
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
