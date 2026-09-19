/* === 句型页引擎 sentence-drill v2（design/16 P0）===
   接管口语页「练习」tab（#sentView），替换场景闯关（SD_DEFAULT_ON=false 退场）与老 pdLegacy。
   结构（照抄 scene-drill 成熟模式）：
   - 顶层一律 var（speaking 页软导航 window.eval 重跑不炸）+ window 缓存跨软导航状态
   - 提交按钮 onclick 单通道（sentOnSubmit 按当前态分派，禁止 addEventListener 双绑定）
   - 判定：本地归一化（5.5 放过：a/the/单复数/三单/大小写/标点）→ AI sentence_check 3.2s 兜底
   - AI 三态：true 过 / false 错 / null pending（design/15 口径：pending 不算过可重交，绝不无声放行；
     ⚠️ ok 收敛必须 === true，!==false 会把 pending 放进「过了」分支——design/15 已踩坑）
   - 进度：DATA.patternDrill.sentences.status = { [句型id]: { st:'mastered'|'wrong', ts } }，随云同步
     （common.js mergeData 按 ts 新者胜合并）
   - design/19 素材驱动通用化：题干/判定基准/AI 参照三者同源走 sentCurView()（9/13「AI 收到主句基准」
     的教训固化）；内容层=data/sentences.json v3 模板 + data/materialsets.json 素材集，配置层=DATA.materialSets
     （随云同步）。全路径回落：主题缺槽位 → 换主题 → 槽位示例值 → 原句。默认内置示例集通用虚构零个人信息；
     关联素材只取 title/storyEn，禁读 persona。 */
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

/* 9/17 之之拍板：批改分两条线——①题意线：对照「句意」判学生是否理解错题目（答非所问），
   偏题时输出 misread + 贴题版改进表达（按她的用词改到题目上，禁甩标准句）；
   ②语法线：只看学生答案本身的语法（5.5 尺度不变），与题意无关。 */
var SENT_CHECK_SYS = '你是雅思口语句型教练。学生按中文句意输出英文。你做两件事，只输出 JSON：\n'
  + '一、判题意：对照「句意」与学生答案，判断是否理解错题目（答非所问）。同义改写不算偏题，只判内容方向明显对不上句意的。字段："misread":true/false，"misreadNote"：一句话说题目在问什么、学生答了什么，≤25字；misread 为 false 时给空串。\n'
  + '二、挑语法错：只看学生答案本身的语法，与题意无关，按以下尺度挑错：词序错误、时态错误、双动词（一个句子里两个谓语）、缺 be 动词、词性用错。单复数、a/an/the 冠词、三单 -s 一律不算错、不标。语法错照常标在学生原句上（即使偏题也照标）。\n'
  + '输出：{"ok":true} 或 {"ok":false,"misread":false,"misreadNote":"","errors":[{"type":"时态","old":"is","note":"描述过去用 was，≤12字"}],"right":"…","fix":"…"}\n'
  + '**misread=true 时 right 同样必填**（贴题版改进句，按规则见上），严禁只给 misreadNote 不给 right。\n'
  + 'ok=false 的条件：有语法错或 misread=true（偏题不算过）。\n'
  + 'right 规则：未偏题=学生答案的最小改正版，保留学生原有用词与句型，只改正 errors 标出的错误，禁止重写成另一句标准句；misread=true=贴题版，用学生答案的用词与句式，把内容改到能回答题目在问的事（同样保留学生用词，不甩标准句），并顺带改掉语法错。\n'
  + 'fix 规则：一句话人话总结最关键问题；misread=true 时先说偏在哪。\n'
  + '错误片段 old 必须逐字摘自学生答案原文。';

function sentEsc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function sent$(id){ return document.getElementById(id); }

/* ── 内容库加载（window 级缓存：软导航重进不打第二次） ── */
async function sentLoadBank(){
  if(window.__sentBankCache){ SENT_BANK = window.__sentBankCache; return SENT_BANK; }
  try{
    var res = await fetch('data/sentences.json?v=20260914a');
    SENT_BANK = await res.json();
    window.__sentBankCache = SENT_BANK;
    return SENT_BANK;
  }catch(e){
    console.warn('[sentence-drill] 句型库加载失败', (e && e.message) || e);
    return null;
  }
}
function sentBank(){ return window.__sentBankCache || SENT_BANK || { cats: [] }; }

/* ═══════ design/19 素材驱动通用化：素材集 / 主题 / 模板填充 ═══════ */
if(!('__sentSetsRaw' in window)) window.__sentSetsRaw = null;
if(window.__SENT_TOPIC == null) window.__SENT_TOPIC = '';
if(!('__SENT_MSET_OPEN' in window)) window.__SENT_MSET_OPEN = false;

var SENT_LEVEL_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 };
var SENT_REVIEW_DAYS = 7;               // 主题超过 N 天没练 → 顶部复习提醒
var SENT_SLOT_KEYS = ['who', 'what', 'where', 'when', 'why', 'feel'];
var SENT_CAT_OPTS = ['place', 'person', 'event', 'thing', 'habit'];
/* 主题 category → 题库类目（P2 题 category 为中文：人物/事件/地点/事物；habit 无对应 → 回落随机） */
var SENT_CAT2BANK = { place: '地点', person: '人物', event: '事件', thing: '事物' };
var SENT_LEVEL_OPTS = ['A1', 'A2', 'B1', 'B2'];

/* 素材集 JSON（内容层，B 交付；window 级缓存，软导航重进不打第二次） */
async function sentLoadSets(){
  if(window.__sentSetsRaw) return window.__sentSetsRaw;
  try{
    var r = await fetch('data/materialsets.json?v=20260914a');
    window.__sentSetsRaw = await r.json();
  }catch(e){
    window.__sentSetsRaw = null;         // 加载失败 = 无素材集，全路径回落原句，绝不崩
  }
  return window.__sentSetsRaw;
}
/* 用户配置：DATA.materialSets = { active, topic, enabled, sets:{...}, updatedAt } */
function sentStore(){
  if(typeof DATA === 'undefined') return null;
  if(!DATA.materialSets || typeof DATA.materialSets !== 'object') DATA.materialSets = { active: '', topic: '', enabled: true, sets: {}, updatedAt: 0 };
  var m = DATA.materialSets;
  if(!m.sets || typeof m.sets !== 'object') m.sets = {};
  if(typeof m.enabled !== 'boolean') m.enabled = true;
  return m;
}
/* 内置集首次 / JSON 版本更新时写进 DATA（用户改过的内置主题按 _seedV 判断，不被覆盖掉 lastPracticedAt）。
   ⚠️ 只改内存不落盘：播种是幂等版本门控的，下次 boot 会重跑；boot 期 hubSave 会把刚载入的
   localStorage 整库回写，存在覆盖并发写入的竞态（9/14 smoke_sentp1 薄弱条被清实锤）。
   用户真正改配置时（选主题/新增/开关）才由那条路径 hubSave。 */
function sentSeedBuiltin(){
  var raw = window.__sentSetsRaw, m = sentStore();
  if(!raw || !raw.sets || !m) return;
  var rv = Number(raw.version || 1);
  Object.keys(raw.sets).forEach(function(k){
    var s = raw.sets[k], cur = m.sets[k];
    if(!cur || (cur.source === 'builtin' && Number(cur._seedV || 0) < rv)){
      var cp = JSON.parse(JSON.stringify(s || {}));
      cp._seedV = rv;
      m.sets[k] = cp;
    }
  });
  if(!m.active || !m.sets[m.active]) m.active = raw.active || 'builtin_demo';
  if(!window.__SENT_TOPIC) window.__SENT_TOPIC = m.topic || '';
}
function sentUseMine(){ var m = sentStore(); return !!(m && m.enabled !== false); }
/* 当前素材集：开关关 → 强制内置示例集（通用虚构，零个人信息，毕设投屏/换设备安全） */
function sentActiveSet(){
  var m = sentStore(); if(!m) return null;
  var key = sentUseMine() ? (m.active || 'builtin_demo') : 'builtin_demo';
  return m.sets[key] || m.sets['builtin_demo'] || null;
}
function sentActiveTopics(){
  var s = sentActiveSet();
  if(!s || s.enabled === false) return [];
  return (s.topics || []).filter(function(t){ return t && t.slots; });
}
/* 挑主题：优先「当前主题」，缺所需槽位则换第一个含全部槽位的主题；都缺 → null（调用方回落）
   excludeId：换场景时用，强制换一个不同的主题，保证「同句型 + 换话题」真跨话题 */
function sentPickTopic(need, excludeId){
  var ts = sentActiveTopics(); if(!ts.length) return null;
  var need2 = need || [];
  var cand = ts.filter(function(t){
    if(!need2.length) return true;
    for(var i = 0; i < need2.length; i++){ if(!(t.slots && t.slots[need2[i]])) return false; }
    return true;
  });
  if(!cand.length) return null;
  if(window.__SENT_TOPIC){
    for(var i = 0; i < cand.length; i++){
      if(cand[i].id === window.__SENT_TOPIC && cand[i].id !== excludeId) return cand[i];
    }
  }
  for(var j = 0; j < cand.length; j++){ if(cand[j].id !== excludeId) return cand[j]; }
  return cand[0];
}
/* 最后兜底：sentences.json 槽位元信息里的「例：xxx」（通用虚构），保证永不出现 {{占位符}} */
function sentDefaultSlot(k){
  var meta = (sentBank().slots || {})[k] || '';
  var mm = /例[:：]\s*([^）)]+)/.exec(String(meta));
  return mm ? String(mm[1]).trim() : '';
}
/* 填充：成功返回字符串；任一槽位连兜底都没有 → null（调用方回落原句）。英文句首自动大写 */
function sentFill(str, topic){
  if(str == null) return '';
  var miss = false;
  var out = String(str).replace(/\{\{(\w+)\}\}/g, function(_, k){
    var v = (topic && topic.slots) ? topic.slots[k] : '';
    if(!v) v = sentDefaultSlot(k);
    if(!v){ miss = true; return ''; }
    return v;
  });
  if(miss) return null;
  if(/^[a-z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}
/* 兜底清理：任何路径都不要把 {{占位符}} 甩到界面上——用槽位示例值补，实在没有就去掉 */
function sentLoose(str){
  var out = String(str == null ? '' : str);
  if(out.indexOf('{{') < 0) return out;
  return out.replace(/\{\{(\w+)\}\}/g, function(_, k){ return sentDefaultSlot(k) || ''; });
}
/* 取「句意对象」：填充成功用填充版，否则原句（scene 无占位符时原样） */
function sentViewOf(sent, sceneIdx, excludeId){
  var t = sentPickTopic(sent.slots || [], excludeId);
  var base = (sceneIdx != null) ? (sent.scene[sceneIdx] || {}) : sent;
  if(t && (sent.slots || []).length){
    var cn = sentFill(base.cn, t), right = sentFill(base.right, t);
    if(cn && right) return { cn: cn, right: right, topic: t };
  }
  return { cn: sentLoose(base.cn), right: sentLoose(base.right), topic: t };
}
/* 换场景巩固：有槽位的句 → 同模板 + 换一个主题（真跨话题）；主题不够 → 回落 scene[idx] 原句 */
function sentSceneView(sent, c){
  if((sent.slots || []).length){
    var t = sentPickTopic(sent.slots, c.topicId);
    if(t){
      var cn = sentFill(sent.cn, t), right = sentFill(sent.right, t);
      if(cn && right) return { cn: cn, right: right, topic: t, byTopic: true };
    }
  }
  var v = sentViewOf(sent, c.sceneIdx, null);
  v.byTopic = false;
  return v;
}
/* ⭐ 当前题的「句意对象」：题干 / 判定基准 / AI 参照 三者同源（design/19 §2） */
function sentCurView(){
  var c = sentCur(), sent = sentFind(c.sentId);
  if(!sent) return { cn: '', right: '', topic: null };
  return (c.phase === 'scene') ? sentSceneView(sent, c) : sentViewOf(sent, null, null);
}
/* 练过就记时间（本地帧毫秒，禁 toISOString）；复习提醒按它算天数 */
function sentTouchTopic(tid){
  if(!tid) return;
  var m = sentStore(), set = sentActiveSet();
  if(!m || !set) return;
  (set.topics || []).forEach(function(t){
    if(t.id === tid){ t.lastPracticedAt = Date.now(); m.updatedAt = t.lastPracticedAt; }
  });
  if(typeof hubSave === 'function') hubSave();
}

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
/* topicName：design/19 素材主题名，作为上下文告知 AI（5.5 尺度与最小改正口径不动） */
async function sentAskAI(sent, answer, topicName){
  try{
    var raw = await sentWithTimeout(
      callRelay('sentence_check',
        [{ role: 'system', content: SENT_CHECK_SYS },
         { role: 'user', content: '句意：' + (sent.cn || '') + '\n标准句：' + (sent.right || '')
           + '\n当前素材主题：' + (topicName || '通用') + '\n学生答案：' + answer }],
        0, { max_tokens: 600 }),
      3200);
    if(raw === '__TIMEOUT__') return { ok: null, err: '判定超时' };
    var j = aiJson(raw);
    if(!j || typeof j.ok !== 'boolean') return { ok: null, err: '判定结果异常' };
    /* 9/17：misread=理解错题目（答非所问），misreadNote=一句话说明偏在哪 */
    return { ok: j.ok, errors: Array.isArray(j.errors) ? j.errors : [], right: j.right || '', fix: j.fix || '',
      misread: j.misread === true, misreadNote: String(j.misreadNote || '') };
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
    window.__SENT_CUR = { view: 'list', catId: '', sentId: '', phase: 'main', sceneIdx: 0, topicId: '', curTopicId: '', tries: 0, revealed: false, draft: '', fb: null };
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

/* ── design/19 §4 素材集配置 UI（内联在 #sentBody 内，不新增任何 body 级浮层／悬浮元素）── */
function sentMsetRowHtml(){
  var set = sentActiveSet();
  if(!set) return '';
  var ts = sentActiveTopics(), t = null;
  ts.forEach(function(x){ if(x.id === window.__SENT_TOPIC) t = x; });
  if(!t) t = ts[0];
  var name = (set.name || '素材集') + ' · ' + ((t && t.name) || '未选主题');
  return '<div class="sent-mset" data-sent-mset>当前素材：' + sentEsc(name)
    + '<span class="sent-caret">' + (window.__SENT_MSET_OPEN ? '▾' : '▸') + '</span></div>'
    + (window.__SENT_MSET_OPEN ? sentMsetPanelHtml(set, ts) : '');
}
function sentMsetPanelHtml(set, ts){
  var h = '<div class="sent-mset-panel">';
  h += '<div class="sent-mset-lab">主题（单选）</div>';
  if(!ts.length) h += '<div class="sent-err-note">这个素材集还没有主题，先新增或关联一个。</div>';
  ts.forEach(function(x, i){
    var on = (x.id === window.__SENT_TOPIC) || (!window.__SENT_TOPIC && i === 0);
    h += '<div class="sent-mset-topic' + (on ? ' on' : '') + '" data-sent-topic="' + sentEsc(x.id) + '">'
      + '<b>' + sentEsc(x.name) + '</b>'
      + '<span class="sent-mset-meta">' + sentEsc((x.category || '') + ' · ' + (x.level || '')) + '</span></div>';
  });
  h += '<div class="sent-mset-lab">+ 新增主题</div>'
    + '<input id="sentNewName" class="pd-input" placeholder="主题名（例：我的毕设）" autocomplete="off">'
    + '<div class="sent-mset-row">'
    + '<select id="sentNewCat" class="sp-select">' + SENT_CAT_OPTS.map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join('') + '</select>'
    + '<select id="sentNewLevel" class="sp-select">' + SENT_LEVEL_OPTS.map(function(c){ return '<option value="' + c + '"' + (c === 'A2' ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>'
    + '</div>'
    + '<div class="sent-mset-lab">槽位（可留空）</div><div class="sent-mset-slots">';
  SENT_SLOT_KEYS.forEach(function(k){
    h += '<input class="pd-input sent-slot" data-sent-slot="' + k + '" placeholder="' + k + '" autocomplete="off">';
  });
  h += '</div><button class="btn btn-primary" id="sentNewTopic" type="button">新增主题</button>';
  /* 关联素材：只取 title / storyEn，禁读 persona（隐私红线） */
  var mats = (typeof DATA !== 'undefined' && DATA.materials && DATA.materials.materials) || [];
  h += '<div class="sent-mset-lab">关联素材（只取标题与故事，不读人设）</div>';
  if(!mats.length) h += '<div class="sent-err-note">还没有素材卡，先去「素材」tab 生成。</div>';
  else {
    h += '<select id="sentLinkMat" class="sp-select">';
    mats.forEach(function(m){
      h += '<option value="' + sentEsc(m.id) + '">' + sentEsc(m.title || '未命名素材') + '</option>';
    });
    h += '</select><button class="btn" id="sentLinkGo" type="button">一键生成主题</button>';
  }
  h += '<div class="sent-mset-lab">导入 / 导出</div><div class="sent-mset-row">'
    + '<button class="btn" id="sentSetsExport" type="button">导出 JSON</button>'
    + '<button class="btn" id="sentSetsImport" type="button">导入 JSON</button></div>'
    + '<textarea id="sentSetsJson" class="sp-p3-textarea" placeholder="把 JSON 粘到这里再点「导入 JSON」；点「导出」会填到这里"></textarea>'
    + '<div class="sent-mset-sw" data-sent-mset-sw>用我的素材集：' + (sentUseMine() ? '开' : '关')
    + '<span class="sent-mset-hint">关 = 只用内置示例集（通用虚构，零个人信息）</span></div>';
  return h + '</div>';
}
/* 复习提醒：主题超过 SENT_REVIEW_DAYS 天没练 → 一行，点它切到该主题 */
function sentReviewHtml(){
  var set = sentActiveSet(); if(!set) return '';
  var out = '';
  (set.topics || []).forEach(function(t){
    if(!t.lastPracticedAt) return;
    var n = Math.floor((Date.now() - Number(t.lastPracticedAt)) / 86400000);
    if(n > SENT_REVIEW_DAYS) out += '<div class="sent-review" data-sent-review="' + sentEsc(t.id) + '">'
      + sentEsc(t.name) + ' 已经 ' + n + ' 天没练了 →</div>';
  });
  return out;
}
/* 难度提示：当前主题 level < B1 时，c6/c7 两类在类名旁加小字「进阶」（只提示，不改结构/可练性） */
function sentAdvMark(catId){
  if(catId !== 'c6' && catId !== 'c7') return '';
  var t = sentPickTopic([], null);
  if(!t || !t.level) return '';
  if((SENT_LEVEL_RANK[t.level] || 0) >= SENT_LEVEL_RANK.B1) return '';
  return '<span class="sent-adv">进阶</span>';
}

/* 列表：薄弱条占位（P0 留空）+ 5 类折叠（顺序=sentences.json 固定 P2 答题顺序）+ 错题库入口 */
function sentListHtml(){
  var bank = sentBank(), st = sentStatus();
  var wh = sentWeakHtml();
  var html = '<div id="sentWeakBar"' + (wh ? '' : ' hidden') + '>' + wh + '</div>';
  html += sentReviewHtml();                    // design/19：久未练的主题提醒
  html += sentMsetRowHtml();                   // design/19：当前素材集 · 主题（点开=内联配置面板）
  html += '<div class="sent-list">';
  bank.cats.forEach(function(cat){
    var mastered = cat.sentences.filter(function(s){ return st[s.id] && st[s.id].st === 'mastered'; }).length;
    var open = !!window.__SENT_OPEN[cat.id];
    html += '<div class="sent-cat" data-sent-cat="' + cat.id + '">'
      + '<div class="sent-cat-row"><b>' + sentEsc(cat.name) + '</b>'
      + '<span class="sent-cat-pos">' + sentEsc(cat.pos || '') + '</span>'
      + sentAdvMark(cat.id)
      + '<span class="sent-cat-count">已掌握 ' + mastered + '/' + cat.sentences.length + '</span>'
      + '<span class="sent-caret">' + (open ? '▾' : '▸') + '</span></div>';
    if(open){
      html += '<div class="sent-cat-body">';
      cat.sentences.forEach(function(s){
        var stat = st[s.id] && st[s.id].st;
        var tag = stat === 'mastered' ? '<span class="sent-st st-mastered">已掌握</span>'
          : (stat === 'wrong' ? '<span class="sent-st st-wrong">错题</span>' : '');
        html += '<div class="sent-item" data-sent-item="' + s.id + '"><span class="sent-item-cn">' + sentEsc(sentViewOf(s, null, null).cn) + '</span>' + tag + '</div>';
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
      html += '<div class="sent-item" data-sent-item="' + s.id + '"><span class="sent-item-cn">' + sentEsc(sentViewOf(s, null, null).cn) + '</span><span class="sent-st st-wrong">错题</span></div>';
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
  var v = sentCurView();                       // design/19：题干取自同一个句意对象
  c.curTopicId = (v.topic && v.topic.id) || '';// 供 sentTouchTopic / 换主题排除用（确定性派生，重渲染幂等）
  return '<div class="sent-back" data-sent-back>&larr; 返回句型列表</div>'
    + '<div class="sent-tag">【' + sentEsc(cat.name) + ' · ' + sentEsc(cat.pos || '') + '】' + sentEsc(sceneTag) + '</div>'
    + '<div class="sent-cn">' + sentEsc(v.cn) + '</div>'
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
  sentBindMset(host);
}

/* ── design/19 素材集面板绑定（全部内联在 #sentBody 内，零浮层）── */
function sentBindMset(host){
  var ms = host.querySelector('[data-sent-mset]');
  if(ms) ms.addEventListener('click', function(e){
    e.stopPropagation();
    window.__SENT_MSET_OPEN = !window.__SENT_MSET_OPEN;
    sentRender();
  });
  host.querySelectorAll('[data-sent-topic]').forEach(function(el){
    el.addEventListener('click', function(e){ e.stopPropagation(); sentSetTopic(el.getAttribute('data-sent-topic')); });
  });
  host.querySelectorAll('[data-sent-review]').forEach(function(el){
    el.addEventListener('click', function(e){ e.stopPropagation(); sentSetTopic(el.getAttribute('data-sent-review')); });
  });
  var nt = sent$('sentNewTopic');
  if(nt) nt.onclick = function(){
    var name = ((sent$('sentNewName') || {}).value || '').trim();
    if(!name){ toast('先给主题起个名'); return; }
    var slots = {};
    host.querySelectorAll('[data-sent-slot]').forEach(function(inp){
      var v = (inp.value || '').trim();
      if(v) slots[inp.getAttribute('data-sent-slot')] = v;
    });
    var t = sentAddTopic(name, (sent$('sentNewCat') || {}).value || 'event', (sent$('sentNewLevel') || {}).value || 'A2', slots);
    if(t){ toast('已新增主题「' + name + '」'); }
  };
  var lg = sent$('sentLinkGo');
  if(lg) lg.onclick = function(){
    var id = (sent$('sentLinkMat') || {}).value || '';
    var list = (typeof DATA !== 'undefined' && DATA.materials && DATA.materials.materials) || [];
    var m = null;
    list.forEach(function(x){ if(String(x.id) === String(id)) m = x; });
    if(!m){ toast('没找到这张素材卡'); return; }
    /* 隐私红线：只取 title / storyEn 两个字段，绝不读 persona 与任何个人字段 */
    var t = sentAddTopic(String(m.title || '未命名素材').slice(0, 40), 'event', 'A2', {});
    if(!t) return;
    t.linkedMaterialId = m.id;
    t.storyEn = String(m.storyEn || '').slice(0, 400);      // 仅故事正文，供她照着填槽位
    var mm = sentStore(); if(mm) mm.updatedAt = Date.now();
    if(typeof hubSave === 'function') hubSave();
    sentRender();
    toast('已生成主题，去填槽位就能用它出题');
  };
  var ex = sent$('sentSetsExport');
  if(ex) ex.onclick = function(){
    var ta = sent$('sentSetsJson');
    var m = sentStore();
    if(!ta || !m) return;
    ta.value = JSON.stringify(m, null, 2);
    toast('已导出到下方文本框，复制走即可');
  };
  var im = sent$('sentSetsImport');
  if(im) im.onclick = function(){
    var ta = sent$('sentSetsJson');
    if(!ta) return;
    var obj = null;
    try{ obj = JSON.parse(ta.value || ''); }catch(e){ obj = null; }
    if(!obj || !obj.sets || typeof obj.sets !== 'object'){ toast('JSON 不对，需要含 sets 字段'); return; }
    var m = sentStore(); if(!m) return;
    m.sets = obj.sets;
    m.active = obj.active || Object.keys(obj.sets)[0] || 'builtin_demo';
    m.topic = obj.topic || '';
    m.enabled = obj.enabled !== false;
    m.updatedAt = Date.now();
    window.__SENT_TOPIC = m.topic || '';
    if(typeof hubSave === 'function') hubSave();
    sentRender();
    toast('已导入素材配置');
  };
  var sw = host.querySelector('[data-sent-mset-sw]');
  if(sw) sw.addEventListener('click', function(e){
    e.stopPropagation();
    var m = sentStore(); if(!m) return;
    m.enabled = !sentUseMine();
    m.updatedAt = Date.now();
    if(typeof hubSave === 'function') hubSave();
    sentRender();
    toast(m.enabled ? '已开启：用我的素材集' : '已关闭：只用内置示例集（零个人信息）');
  });
}
/* 用户自建主题落「我的素材集」，绝不写进内置集（否则下次 JSON 升级会被覆盖） */
function sentUserSet(){
  var m = sentStore(); if(!m) return null;
  if(!m.sets.my_set) m.sets.my_set = { id: 'my_set', name: '我的素材集', enabled: true, updatedAt: 0, topics: [] };
  return m.sets.my_set;
}
function sentAddTopic(name, cat, level, slots){
  var m = sentStore(), set = sentUserSet();
  if(!m || !set) return null;
  var t = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name, category: cat, level: level, tags: [],
    slots: slots || {}, linkedMaterialId: null, lastPracticedAt: 0, source: 'user'
  };
  set.topics.push(t);
  set.updatedAt = Date.now();
  m.active = 'my_set';
  m.topic = t.id;
  m.updatedAt = set.updatedAt;
  window.__SENT_TOPIC = t.id;
  if(typeof hubSave === 'function') hubSave();
  sentRender();
  return t;
}
function sentSetTopic(id){
  var m = sentStore(); if(!m) return;
  window.__SENT_TOPIC = id || '';
  m.topic = window.__SENT_TOPIC;
  m.updatedAt = Date.now();
  if(typeof hubSave === 'function') hubSave();
  sentRender();
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
  window.__SENT_CUR = { view: 'practice', catId: '', sentId: sentId, phase: 'main', sceneIdx: 0, topicId: '', curTopicId: '', tries: 0, revealed: false, draft: '', fb: null };
  sentRender();
  /* 9/18 修：拼接验证弹窗（#sentReplayMask，fixed z-index 999）在场时不抢焦点。
     原链：sentPass 分支里 sentMaybeReplay() 弹窗并 focus #sentReplayAns，紧接着
     sentNextFromQueue()→sentStart() 又把焦点抢回被遮罩盖住的 #sentAnswer
     → 她看着弹窗打字却一个字都进不去。触发条件：错题库「全部重练」且这句正好让某类首次练满。 */
  if(document.getElementById('sentReplayMask')) return;
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
  /* design/19：判定基准走 sentCurView()——与题干、AI 参照三者同源。
     原实现按 phase 分头取 scene[c.sceneIdx].right vs sent.right，场景态一旦是「换主题填充」
     就对不上题干（9/13 同类 bug 的根因：基准取自另一层）。 */
  var v = sentCurView();
  var ok = sentLocalJudge(answer, v.right);
  var ai = null;
  if(!ok){
    ai = await sentAskAI({ cn: v.cn, right: v.right }, answer, (v.topic && v.topic.name) || '');
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
  sentTouchTopic(c.curTopicId);               // design/19：练过就记主题时间（复习提醒用）
  SENT_AUTO_T = setTimeout(function(){
    if(c.phase === 'main'){
      /* topicId = 上一题用过的主题 → 换场景时强制换一个（同句型 + 换话题） */
      c.phase = 'scene'; c.sceneIdx = 0; c.topicId = c.curTopicId || '';
      c.tries = 0; c.revealed = false; c.draft = ''; c.fb = null; c.lastAi = null;
      sentRender();
    } else if(c.sceneIdx === 0){
      c.sceneIdx = 1; c.topicId = c.curTopicId || '';
      c.tries = 0; c.revealed = false; c.draft = ''; c.fb = null; c.lastAi = null;
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
   ④ 9/17 偏题标注：misread 时置顶「⚠️ 你可能理解错题目了」（第 1 次就给，她需要立刻知道重答方向），
   reveal 态改进版标签随偏题切换为「贴着题目说」（AI 的 right 语义在偏题时=贴题版）
   📌 句型公式 / 💡 用法 仅主句态显示（替换题以 fix 为主，保持轻） */
function sentRenderFail(ai){
  var c = sentCur();
  var sent = sentFind(c.sentId);
  var ans = c.draft;
  var mark = sentRenderErrors(ans, ai.errors || []);
  /* 参考句同走 sentCurView()：与她看到的题干、AI 判定基准一致（design/19 §2） */
  var ref = sentCurView().right;
  /* design/17 最小改正口径：reveal 首选「她原句的最小改正版」（AI right），只在改写与参考说法
     本质不同时才另起一行给参考——判定口径不动，这里只管展示 */
  var fixed = (ai.right && String(ai.right).trim()) ? String(ai.right).trim() : '';
  var sameAsRef = fixed && sentLocalJudge(fixed, ref);
  var misHtml = (ai.misread && ai.misreadNote)
    ? '<div class="sent-misread">⚠️ 你可能理解错题目了：' + sentEsc(ai.misreadNote) + '</div>' : '';
  var html = '<div class="sent-orig">' + mark.html + '</div>' + mark.notes;
  if(c.revealed){
    if(fixed){ html += '<div class="sent-right">✅ ' + (ai.misread ? '改进版（贴着题目说，用你的词）：' : '改正后（只改错处）：') + sentEsc(fixed) + '</div>'; }
    if(fixed && !sameAsRef){ html += '<div class="sent-note">📄 参考说法：' + sentEsc(ref) + '</div>'; }
    if(!fixed){ html += '<div class="sent-right">✅ 正确句：' + sentEsc(ref) + '</div>'; }
  } else if(ai.misread){
    /* 9/19：偏题首交也闭环——偏题不是改个词的事，不给方向她没法重答（语法错仍守「首交不含整句」）。
       AI 给了贴题版 → 直接展示；AI 漏给 right（截断/省略）→ 退而给参考说法兜底。 */
    if(fixed){ html += '<div class="sent-right">✅ 改进版（贴着题目说，用你的词，照这个方向再交一次）：' + sentEsc(fixed) + '</div>'; }
    else { html += '<div class="sent-right">✅ 参考说法（照这个方向改）：' + sentEsc(ref) + '</div>'; }
  }
  if(c.phase === 'main'){
    html += '<div class="sent-formula">📌 ' + sentEsc(sent.formula || '') + '</div>';
  }
  html += '<div class="sent-note">💡 ' + sentEsc(sent.note || '') + '</div>';
  if(ai.fix && !c.revealed) html = '<div class="sent-fix">' + sentEsc(ai.fix) + '</div>' + html;
  if(misHtml) html = misHtml + html;
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
    if(pd && catId){                       // catId 为空 = 只是关闭（切 tab/切页），不写 replay 标记
      pd.sentences = pd.sentences || {};
      pd.sentences.replay = pd.sentences.replay || {};
      pd.sentences.replay[catId] = Date.now();
      if(typeof hubSave === 'function') hubSave();
    }
  }catch(_){}
  if(window.__sentReplayKey){ document.removeEventListener('keydown', window.__sentReplayKey); window.__sentReplayKey = null; }
  var m = document.getElementById('sentReplayMask');
  if(m) m.remove();
}
function sentReplayClose(){ sentReplayDone(null); }   /* 关闭但不写 replay 标记：切 tab/切页用，下次练满还会再弹 */
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
    if(fb) fb.innerHTML = ((ai.misread && ai.misreadNote) ? '<div class="sent-misread">⚠️ 你可能理解错题目了：' + sentEsc(ai.misreadNote) + '</div>' : '')
      + '<div class="sent-orig">' + mark.html + '</div>' + mark.notes
      + (ai.fix ? '<div class="sent-fix">' + sentEsc(ai.fix) + '</div>' : '');
    if(st) st.textContent = '再试一次或跳过';
  } else {
    if(fb) fb.textContent = 'AI 没来得及判，这句不算过——再交一次或跳过';
    if(st) st.textContent = '网络慢了，等一下再交';
  }
}
function sentReplayOpen(cat, topic, topicName){
  var old = document.getElementById('sentReplayMask');
  if(old) old.remove();
  var mask = document.createElement('div');
  mask.id = 'sentReplayMask';
  mask.className = 'sent-replay-mask';
  var tName = topic.titleZh || topic.titleEn || topic.title || '';
  var msetTip = topicName ? '<div class="sent-replay-tip">素材主题：' + sentEsc(topicName) + '</div>' : '';
  mask.innerHTML = '<div class="sent-replay-panel">'
    + '<div class="sent-replay-title">' + sentEsc(cat.name) + '通关 ✅</div>'
    + '<div class="sent-replay-tip">拿真实题练一手：' + sentEsc(tName) + '——用这一类句型，为这道题写一句' + sentEsc(cat.name) + '位置的话。</div>'
    + msetTip
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
  /* 9/13 修：给遮罩留自救出口。原实现只有「提交 / 跳过」两个按钮能关，
     一旦她不处理就走人（切页/软导航），fixed inset:0 z-index:999 的遮罩会继续盖住整页，
     之后所有点击全部失效（实测题库卡片 elementFromPoint 命中遮罩 = BLOCKED）。 */
  mask.addEventListener('click', function(e){ if(e.target === mask){ sentReplayDone(cat.id); toast('已跳过，下次练满不再弹'); } });
  if(window.__sentReplayKey) document.removeEventListener('keydown', window.__sentReplayKey);
  window.__sentReplayKey = function(e){
    if(e && (e.key === 'Escape' || e.key === 'Esc')){ sentReplayDone(cat.id); toast('已跳过，下次练满不再弹'); }
  };
  document.addEventListener('keydown', window.__sentReplayKey);
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
    /* design/19 §5：优先按「启用主题」的 category 抽同类的真实 P2 题（主题 → 题库类目映射）；
       没匹配到（或主题是 habit 这类题库没有的类目）→ 回落原有全库随机，行为不变。 */
    var t = sentPickTopic([], null);
    var bankCat = SENT_CAT2BANK[(t && t.category) || ''] || '';
    var pref = bankCat ? pool.filter(function(s){ return s.category === bankCat; }) : [];
    var from = pref.length ? pref : pool;
    var topic = from[Math.floor(Math.random() * from.length)];
    sentReplayOpen(cat, topic, (t && t.name) || '');
    return true;
  }catch(e){ return false; }
}

/* ── 启动 ── */
async function sentBoot(){
  if(!window.__SENT_V2_ON) return;
  if(!sent$('sentBody')) return;         // 不在口语页
  var bank = await sentLoadBank();
  if(!bank || !bank.cats || !bank.cats.length) return;
  await sentLoadSets();                    // design/19：素材集（失败=无，全路径回落原句）
  sentSeedBuiltin();
  var c = sentCur();
  if(c.view === 'practice' && !sentFind(c.sentId)){ window.__SENT_CUR = null; }   // 防脏状态
  sentRender();
}
ready(function(){ sentBoot(); });
