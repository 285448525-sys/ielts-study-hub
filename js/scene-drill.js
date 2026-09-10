/* 场景闯关 v2（design/07）：一关 = 一段迷你对话
   —— 看/听对话 → 逐句说（中文 L0 → 提示词 L1 → 结构规则 L2）→ 立刻反馈
   → （阶段 3）同句型换词连练 → （阶段 6）整段无提示复现 → 通关小结。

   【上线开关】window.__SCENE_V2_ON 默认 false → 本文件不接管 #pdView，
   老的 pattern-drill.js 引擎照常工作（pdLegacy 兜底）。外部可预先注入 true
   （测试 addInitScript / 未来阶段 6 直接把下方 SD_DEFAULT_ON 切 true）。

   顶层一律 var：本文件被 speaking.html 软导航重跑（window.eval），let/const 顶层声明重跑会崩。
   缓存一律挂 window 且顶层只读不重置（同 pattern-drill.js __pdPatternsCache 的教训）。
   提交按钮只用 onclick 单通道（pd 9/9 双 handler 竞态教训）。 */

/* 上线开关：若外部已注入（真值/假值都算）则尊重外部，否则用默认 false。
   阶段 6 把 SD_DEFAULT_ON 改 true 即整体上线；改回 false 即整体回滚。 */
var SD_DEFAULT_ON = false;
var SD_V2_ON = (typeof window !== 'undefined' && typeof window.__SCENE_V2_ON !== 'undefined') ? !!window.__SCENE_V2_ON : SD_DEFAULT_ON;
window.__SCENE_V2_ON = SD_V2_ON;

/* 数据句柄：顶层只做「有缓存就恢复」，绝不重置为 null */
var SD_SCENES = (typeof window !== 'undefined' && window.__pdScenesCache) || null;
var SD_WEAKNESS = (typeof window !== 'undefined' && window.__pdWeaknessCache) || null;

var SD_SCENE_PER_DAY = 1;   // design/07 §十三：每日一关
var SD_CUR = null;          // { scene, steps, idx, log, date, stuck, recordedStuck }
var SD_BUSY = false;        // 判定进行中，防连点
var SD_AUTO_NEXT = null;    // 答对自动流转定时器
var SD_HINT_SHOWN = 0;      // 当前句提示层级：0=只显中文(L0) 1=提示单词(L1) 2=结构规则(L2，=卡住)
var SD_WRONG_N = 0;         // 当前句已错次数：1=只给 fix 可重交，2=给整句+看答案进下一句（design/09 改动 4）
/* 阶段 3 换词连练（design/10 §3.2）：顶层 var 声明带初始化 → 软导航重跑自动清残留 */
var SD_VARIANT = null;      // { list:[{fill,pattern}], i:0, src: lineObj } 进行中的换词子队列
var SD_VARIANT_FILL = '';   // 当前换词目标句（用于判定）
var SD_VARIANT_PATTERN = '';// 当前换词句型（用于提示）

/* ── 本地判定（design/07 §六）：本地优先 AI 兜底 ──
   归一化 → token 序列比对。放过（判对口径同 PD_JUDGE_SYS 5.5）：
   大小写/标点/a-an-the 漏用/单复数/三单 -s/拼写差异里的撇号。
   不放过：词序、时态（is/was 不折算）、双动词、缺 be、词性——token 对不上就交给 AI。 */
var SD_NO_STEM = {
  this: true, was: true, is: true, has: true, does: true, its: true, yes: true,
  less: true, miss: true, always: true, bus: true, us: true, as: true, gas: true,
  plus: true, status: true, focus: true, campus: true, virus: true, news: true,
  means: true, alias: true, canvas: true, chaos: true
};
function sdNormalize(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function sdStem(t){
  if(t.length <= 3 || SD_NO_STEM[t]) return t;
  if(/ies$/.test(t) && t.length > 4) return t.slice(0, -3) + 'y';   // stories→story
  if(/(?:sh|ch|x|z|ss)es$/.test(t)) return t.slice(0, -2);          // boxes→box, watches→watch
  if(/oes$/.test(t)) return t.slice(0, -2);                          // goes→go
  if(/[^s]s$/.test(t)) return t.slice(0, -1);                        // restaurants→restaurant, makes→make
  return t;
}
function sdTokens(s){
  return sdNormalize(s).split(' ').filter(Boolean).map(function(t){ return t.replace(/'/g, ''); })
    .filter(function(t){ return t && t !== 'a' && t !== 'an' && t !== 'the'; })
    .map(sdStem);
}
function sdLocalJudge(user, right){
  var u = sdTokens(user), r = sdTokens(right);
  if(!u.length || !r.length || u.length !== r.length) return false;
  for(var i = 0; i < u.length; i++){ if(u[i] !== r[i]) return false; }
  return true;
}

/* AI 兜底：callRelay pattern_judge（同 pdAskAI 约定），3.2s 超时/异常 → 放行不卡流程 */
function sdWithTimeout(p, ms){
  return new Promise(function(res, rej){
    var t = setTimeout(function(){ res('__TIMEOUT__'); }, ms);
    p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
  });
}
async function sdAskAI(line, answer){
  try{
    var raw = await sdWithTimeout(
      callRelay('pattern_judge',
        [{ role: 'system', content: (typeof PD_JUDGE_SYS !== 'undefined' && PD_JUDGE_SYS) || '' },
         { role: 'user', content: '中文：' + (line.cn || '') + '\n参考正确句：' + (line.right || '') + '\n用户答案：' + answer + '\n只判定用户答案是否正确（意思和基本结构对即可，细节如拼写/单复数放过）。' }],
        0, { max_tokens: 150 }),
      3200);
    if(raw === '__TIMEOUT__') return { ok: null, err: '判定超时' };
    var j = aiJson(raw);
    if(!j || typeof j.ok !== 'boolean') return { ok: null, err: '判定结果异常' };
    return { ok: !!j.ok, fix: j.fix || '' };
  }catch(e){
    return { ok: null, err: (e && e.message) || 'AI 调用失败' };
  }
}

/* ── 数据 ── */
async function sdLoadScenes(){
  if(window.__pdScenesCache){ SD_SCENES = window.__pdScenesCache; return SD_SCENES; }
  try{
    var res = await fetch('data/scenes.json?v=20260909a');
    SD_SCENES = await res.json();
    window.__pdScenesCache = SD_SCENES;
    return SD_SCENES;
  }catch(e){
    console.warn('[scene-drill] 场景库加载失败', (e && e.message) || e);
    return null;
  }
}
/* weakness 句柄（§5.2）：落盘交给 pattern-drill.js 的 _sceneV1 迁移门，此处不 hubSave */
function sdWeakness(){
  if(window.__pdWeaknessCache) return window.__pdWeaknessCache;
  if(typeof DATA === 'undefined' || !DATA.patternDrill) return {};
  if(!DATA.patternDrill.weakness) DATA.patternDrill.weakness = {};
  window.__pdWeaknessCache = DATA.patternDrill.weakness;
  return window.__pdWeaknessCache;
}
/* 每日一关：按日期轮转，同一天稳定同一关 */
function sdPickScene(scenes){
  var day = Math.floor(Date.now() / 86400000);
  return scenes[day % scenes.length];
}
/* 练习步 = 非引导句（lead:true 是考官提问，只做上下文不练，§5.5）；ask = 前一句引导句 */
function sdStepsOf(scene){
  var steps = [], lines = scene.lines || [];
  for(var i = 0; i < lines.length; i++){
    if(lines[i].lead || !lines[i].right) continue;
    steps.push({ line: lines[i], ask: (i > 0 && lines[i-1].lead) ? lines[i-1] : null });
  }
  return steps;
}
function sdToday(){
  return (typeof pdIsoDate === 'function') ? pdIsoDate() : new Date().toISOString().slice(0, 10);
}
function sdEsc(s){
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sd$(id){ return document.getElementById(id); }

/* ── UI ── */
function sdTakeOver(){
  var sc = sd$('sceneCard'); if(sc) sc.style.display = '';
  var ov = sd$('overview'); if(ov) ov.style.display = 'none';
  var tc = sd$('trainCard'); if(tc) tc.style.display = 'none';
  var fc = sd$('finishCard'); if(fc) fc.style.display = 'none';
}
function sdBind(){
  var sub = sd$('sdSubmit'); if(sub) sub.onclick = sdOnSubmit;          // onclick 单通道
  var hb = sd$('sdHintBtn');
  if(hb) hb.onclick = function(){ if(SD_VARIANT) sdVariantHint(); else sdOnHint(); };   // 阶段 3：换词态提示分流
  var nx = sd$('sdNext'); if(nx) nx.onclick = sdAdvance;
  var ans = sd$('sdAnswer');
  if(ans) ans.onkeydown = function(e){ if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); sdOnSubmit(); } };
}
function sdRenderHints(){
  var c = SD_CUR; if(!c) return;
  var box = sd$('sdHints'); if(!box) return;
  var line = c.steps[c.idx].line, h = '';
  if(SD_HINT_SHOWN >= 1 && line.hints && line.hints[0]) h += '<div class="sd-hint">提示：' + sdEsc(line.hints[0].text) + '</div>';
  if(SD_HINT_SHOWN >= 2 && line.hints && line.hints[1]) h += '<div class="sd-hint">规则：' + sdEsc(line.hints[1].text) + '</div>';
  box.innerHTML = h;
}
function sdRender(){
  var c = SD_CUR; if(!c) return;
  var tag = sd$('sdSceneTag'), step = sd$('sdSceneStep'), flow = sd$('sdFlow');
  var cn = sd$('sdCn'), ans = sd$('sdAnswer'), fb = sd$('sdFeedback'), st = sd$('sdStatus');
  var sub = sd$('sdSubmit'), hb = sd$('sdHintBtn'), nx = sd$('sdNext'), fill = sd$('sdProgressFill');
  if(!tag) return;
  tag.textContent = c.scene.topic + ' · ' + c.scene.part;
  step.textContent = '第 ' + (c.idx + 1) + ' / ' + c.steps.length + ' 句';
  if(fill) fill.style.width = Math.round(c.idx / c.steps.length * 100) + '%';

  var html = '';
  if(c.scene.goal) html += '<div class="pd-note" style="margin-top:0">本关目标：' + sdEsc(c.scene.goal) + '</div>';
  for(var i = 0; i < c.idx; i++){                                  // 已过句回显（对/错 + 正确句）
    var s = c.steps[i];
    html += '<div class="sd-hint">' + (c.log[i] && c.log[i].ok ? '过了：' : '补的：') + sdEsc(s.line.right) + '</div>';
  }
  var cur = c.steps[c.idx];
  if(cur.ask) html += '<div class="sd-hint">考官：' + sdEsc(cur.ask.right) + '</div>';   // 引导句只做上下文
  flow.innerHTML = html;

  cn.textContent = cur.line.cn || '';
  ans.value = ''; ans.disabled = false;
  fb.className = 'pd-feedback'; fb.innerHTML = '';
  st.textContent = '';
  sub.disabled = false; sub.textContent = '提交'; sub.onclick = sdOnSubmit;   // 单通道恢复（上一句可能停在「看答案」态）
  hb.style.display = ''; nx.style.display = 'none';
  sdRenderHints();
}

/* ── 阶段 3 · 换词连练（design/10 §三）──
   每场景 variants[]: { after: lineId, pattern, fills[] }，pattern 用 X/Y/Z 占位符标要换的词。
   该 line 答对后自动进入换词子队列，逐条按 pattern 说出 fills 目标句，全部连完才进下一句。 */
/* 取某 line 的换词变体（pattern 占位符 X/Y/Z 标注要换的词） */
function sdVariantsOf(lineId){
  var c = SD_CUR; if(!c || !c.scene.variants) return null;
  var out = [];
  (c.scene.variants || []).forEach(function(v){
    if(v.after === lineId && Array.isArray(v.fills)){
      v.fills.forEach(function(f){ out.push({ fill: f, pattern: v.pattern || '' }); });
    }
  });
  return out.length ? out : null;
}
/* 从 pattern 抽出要换的词做 L1 提示：单占位符显该词；多占位符直接显整句（稳妥） */
function sdVariantSlot(pattern, fill){
  if(!/[XYZ]/.test(pattern)) return fill;          // 无占位符 → 直接给整句
  var pt = pattern.replace(/（[^）]*）/g,' ').replace(/\([^)]*\)/g,' ').split(/\s+/);
  var ft = fill.split(/\s+/);
  var slots = [];
  for(var i=0;i<pt.length;i++){ if(/^[XYZ]$/.test(pt[i]) && ft[i]) slots.push(ft[i]); }
  return slots.length ? slots.join(', ') : fill;
}
/* 渲染一条换词练习 */
function sdRenderVariant(){
  var c = SD_CUR, v = SD_VARIANT; if(!c || !v) return;
  var fill = v.list[v.i].fill, pat = v.list[v.i].pattern || '';
  var tag = sd$('sdSceneTag'), step = sd$('sdSceneStep'), cn = sd$('sdCn'), ans = sd$('sdAnswer');
  var fb = sd$('sdFeedback'), st = sd$('sdStatus'), sub = sd$('sdSubmit'), hb = sd$('sdHintBtn'), nx = sd$('sdNext');
  var fillp = sd$('sdProgressFill'), flow = sd$('sdFlow'), hints = sd$('sdHints');
  if(!tag) return;
  tag.textContent = c.scene.topic + ' · ' + c.scene.part + ' · 换词连练';
  step.textContent = '换词 ' + (v.i+1) + ' / ' + v.list.length;
  if(fillp) fillp.style.width = Math.round((c.idx + (v.i+1)/(v.list.length+1)) / (c.steps.length+1) * 100) + '%';
  var html = '';
  if(c.scene.goal) html += '<div class="pd-note" style="margin-top:0">本关目标：' + sdEsc(c.scene.goal) + '</div>';
  if(v.src.cn) html += '<div class="sd-hint">原句：' + sdEsc(v.src.cn) + '</div>';
  if(pat) html += '<div class="sd-hint">换词句型：' + sdEsc(pat) + '</div>';
  if(flow) flow.innerHTML = html;
  cn.textContent = '用上面的句型，换一个说法说出口';
  ans.value=''; ans.disabled=false;
  fb.className='pd-feedback'; fb.innerHTML=''; st.textContent='';
  sub.disabled=false; sub.textContent='提交'; sub.onclick=sdOnSubmit;   // 单通道恢复
  hb.style.display=''; nx.style.display='none'; nx.onclick=sdAdvance;
  SD_HINT_SHOWN=0; c.stuck=false; c.recordedStuck=false; SD_WRONG_N=0;
  if(hints) hints.innerHTML='';
  SD_VARIANT_FILL = fill; SD_VARIANT_PATTERN = pat;
}
/* 换词提示按钮：单占位符显「换 X」，多占位符显整句 */
function sdVariantHint(){
  var hints = sd$('sdHints'); if(!hints || !SD_VARIANT) return;
  var slot = sdVariantSlot(SD_VARIANT_PATTERN, SD_VARIANT_FILL);
  hints.innerHTML = '<div class="sd-hint">提示：' + sdEsc(slot) + '</div>';
}
/* 换词全部连完 → 回到单句流程进下一句 */
function sdVariantNext(){
  var c = SD_CUR; if(!c || !SD_VARIANT) return;
  if(SD_AUTO_NEXT){ clearTimeout(SD_AUTO_NEXT); SD_AUTO_NEXT = null; }
  SD_VARIANT.i++;
  if(SD_VARIANT.i < SD_VARIANT.list.length){ sdRenderVariant(); return; }
  SD_VARIANT = null;
  sdAdvanceLine();
}
/* 换词条目判定结果（design/10 §3.5：本地判，判对自动连下一条；判错立刻给正确句锁死，兜底出口进下一条） */
function sdHandleVariantResult(ok){
  var c = SD_CUR, v = SD_VARIANT; if(!c || !v) return;
  var fb = sd$('sdFeedback'), st = sd$('sdStatus'), sub = sd$('sdSubmit');
  var ans = sd$('sdAnswer'), nx = sd$('sdNext'), hb = sd$('sdHintBtn');
  if(ok){
    if(fb){ fb.className = 'pd-feedback ok'; fb.textContent = '过了'; }
    if(st) st.textContent = '';
    SD_AUTO_NEXT = setTimeout(sdVariantNext, 1100);   // 答对自动连下一条
  } else {
    if(SD_AUTO_NEXT){ clearTimeout(SD_AUTO_NEXT); SD_AUTO_NEXT = null; }   // 清掉 ok 时设的自动流转：判错锁死态不被旧定时器跳走
    if(fb){
      fb.className = 'pd-feedback bad';
      fb.innerHTML = '<b>正确句：</b>' + sdEsc(SD_VARIANT_FILL);
    }
    if(st) st.textContent = '';
    if(hb) hb.style.display = 'none';
    if(sub) sub.disabled = true;
    if(nx){ nx.style.display = ''; nx.textContent = '看答案，下一句 ▸'; nx.onclick = sdVariantNext; }   // 单通道：换词态下一句
    if(ans) ans.disabled = true;
  }
}
function sdOnHint(){
  var c = SD_CUR; if(!c || SD_BUSY) return;
  if(SD_HINT_SHOWN >= 2) return;
  SD_HINT_SHOWN++;
  if(SD_HINT_SHOWN >= 2){
    c.stuck = true;    // 卡住定义 = 显过 L2（§七），阶段 4 用它回写
    /* 阶段 4（design/10 §4.2.2）：卡住即记一条，c.recordedStuck 防与随后的错句回写双记 */
    if(!c.recordedStuck){
      c.recordedStuck = true;
      var ln = c.steps[c.idx].line;
      sdRecordWrong({ cn: ln.cn, wrong: '(卡住未答)', right: ln.right, focus: ln.focus, note: '卡在 ' + (ln.fix || ''), stuck: true });
    }
  }
  sdRenderHints();
}
async function sdOnSubmit(){
  var c = SD_CUR; if(!c || SD_BUSY) return;
  var ans = sd$('sdAnswer');
  var answer = ((ans && ans.value) || '').trim();
  if(!answer){ toast('先说出/输入这句英文'); return; }
  SD_BUSY = true;
  var sub = sd$('sdSubmit'), st = sd$('sdStatus');
  if(sub) sub.disabled = true;
  if(st) st.textContent = '判定中…';
  /* 阶段 3：换词态判定分流（right = SD_VARIANT_FILL，design/10 §3.5） */
  if(SD_VARIANT){
    var okV = sdLocalJudge(answer, SD_VARIANT_FILL);
    if(!okV){
      /* 判错 → 立刻回写（换词错句 focus 用原句 focus）并给整句锁死 */
      sdRecordWrong({ cn: SD_VARIANT.src.cn + '（换词）', wrong: answer, right: SD_VARIANT_FILL, focus: SD_VARIANT.src.focus, note: '换词连练', stuck: false });
    }
    SD_BUSY = false;
    sdHandleVariantResult(okV);
    return;
  }
  var line = c.steps[c.idx].line;
  var ok = sdLocalJudge(answer, line.right);
  var fix = '';
  if(!ok){
    var r = await sdAskAI(line, answer);
    /* B2（design/10 §五，已按此口径）：超时/异常 r.ok===null → 静默放行不记回写，
       仅 r.ok===false 走下面的 wrong 分支（sdRecordWrong 只在 wrong 分支调用）。 */
    ok = (r.ok !== false);        // 超时/异常放行，绝不卡流程（design/06 口径）
    fix = r.fix || '';
  }
  SD_BUSY = false;
  sdHandleResult(ok, fix, answer, line);
}
function sdHandleResult(ok, fix, answer, line){
  var c = SD_CUR; if(!c) return;
  var fb = sd$('sdFeedback'), st = sd$('sdStatus'), sub = sd$('sdSubmit');
  var hb = sd$('sdHintBtn'), nx = sd$('sdNext'), ans = sd$('sdAnswer');
  if(ok){
    /* log 只在该句解决时 push（对/两次错），与 c.steps 索引对齐（回显 c.log[i] 依赖） */
    c.log.push({ ok: true, tries: SD_WRONG_N, right: line.right, focus: line.focus || '', answer: answer, stuck: !!c.stuck });
    if(fb){ fb.className = 'pd-feedback ok'; fb.textContent = '过了'; }
    if(st) st.textContent = '';
    SD_AUTO_NEXT = setTimeout(sdAfterLinePassed, 1100);   // 答对 → 先看有没有换词连练，再进下一句（阶段 3）
  } else {
    SD_WRONG_N++;
    if(SD_AUTO_NEXT){ clearTimeout(SD_AUTO_NEXT); SD_AUTO_NEXT = null; }   // 清掉可能残留的自动流转：答错停住态不被旧定时器跳走
    /* 阶段 4（design/10 §4.2.1）：line 答错回写；卡住已记过（recordedStuck）则跳过防双记 */
    if(!c.recordedStuck){
      sdRecordWrong({ cn: line.cn, wrong: answer, right: line.right, focus: line.focus, note: (fix || line.fix || ''), stuck: !!c.stuck });
    }
    if(SD_WRONG_N === 1){
      /* 第 1 次错：只给 fix（不给整句正确句），ans/sub 不禁用可重交，判对才过（design/09 改动 4） */
      if(fb){
        fb.className = 'pd-feedback bad';
        fb.innerHTML = '<b>AI 提示：</b>' + sdEsc(fix || line.fix || '');
      }
      if(st) st.textContent = '再试一次：把这句重新说一遍';
      if(hb) hb.style.display = 'none';
      if(sub){ sub.disabled = false; sub.textContent = '再交一次'; }
      if(nx) nx.style.display = 'none';
    } else {
      /* 第 2 次仍错：给整句正确句；按钮变「看答案，下一句 ▸」，点击进下一句（正确句留在「补的：」回显） */
      c.log.push({ ok: false, right: line.right, focus: line.focus || '', answer: answer, stuck: !!c.stuck });
      if(fb){
        fb.className = 'pd-feedback bad';
        fb.innerHTML = '<b>正确句：</b>' + sdEsc(line.right) + '<br>' + sdEsc(fix || line.fix || '');
      }
      if(st) st.textContent = '';
      if(hb) hb.style.display = 'none';
      if(nx) nx.style.display = 'none';
      if(sub){ sub.disabled = false; sub.textContent = '看答案，下一句 ▸'; sub.onclick = sdAdvance; }
      if(ans) ans.disabled = true;
    }
  }
}
/* 阶段 3 拆分（design/10 §3.4）：sdAdvanceLine = 原进下一句逻辑；sdAfterLinePassed = 答对后先换词再进下一句 */
function sdAdvanceLine(){
  var c = SD_CUR; if(!c) return;
  if(SD_AUTO_NEXT){ clearTimeout(SD_AUTO_NEXT); SD_AUTO_NEXT = null; }
  c.idx++;
  if(c.idx >= c.steps.length){ sdFinish(); return; }
  SD_HINT_SHOWN = 0;
  SD_WRONG_N = 0;
  c.stuck = false; c.recordedStuck = false;
  sdRender();
}
/* 答对后入口：有换词 → 进换词子队列；无 → 直接进下一句 */
function sdAfterLinePassed(){
  var c = SD_CUR; if(!c) return;
  if(!SD_VARIANT){
    var line = c.steps[c.idx].line;
    var list = sdVariantsOf(line.id);
    if(list){ SD_VARIANT = { list: list, i: 0, src: line }; sdRenderVariant(); return; }
  }
  sdAdvanceLine();
}
function sdAdvance(){
  /* 答错兜底出口（看答案，下一句）：直接进下一句，不进换词——卡住的句不连练，避免加压（design/10 §3.4） */
  sdAdvanceLine();
}
function sdFinish(){
  var c = SD_CUR; if(!c) return;
  var wrong = c.log.filter(function(x){ return (x.tries || 0) > 0; }).length;   // 当场纠了=错过至少 1 次（含 1 错 1 对）
  var stuck = c.log.filter(function(x){ return x.stuck; }).length;
  var fill = sd$('sdProgressFill');
  if(fill) fill.style.width = '100%';
  var flow = sd$('sdFlow');
  if(flow) flow.innerHTML = '';
  var cn = sd$('sdCn');
  if(cn) cn.textContent = '场景完成';
  var box = sd$('sdHints');
  if(box) box.innerHTML =
    '<div class="sd-hint">共 ' + c.log.length + ' 句：一次说过 ' + (c.log.length - wrong) + ' 句，当场纠了 ' + wrong + ' 句'
    + (stuck ? '，卡住 ' + stuck + ' 句' : '') + '。</div>'
    + '<div class="sd-hint">' + sdEsc(c.scene.goal || '') + '</div>';
  var ans = sd$('sdAnswer'); if(ans){ ans.value = ''; ans.disabled = true; }
  var sub = sd$('sdSubmit'); if(sub){ sub.disabled = true; }
  var hb = sd$('sdHintBtn'); if(hb) hb.style.display = 'none';
  var nx = sd$('sdNext'); if(nx){ nx.style.display = 'none'; nx.textContent = '下一句 ▸'; }
  var fb = sd$('sdFeedback'); if(fb){ fb.className = 'pd-feedback ok'; fb.textContent = '通关，明天继续下一关'; }
  var st = sd$('sdStatus'); if(st) st.textContent = '';
  // TODO 阶段 5：完成页加「这周哪类在变好」排行（weakness 聚合，文字+小数字）
  // TODO 阶段 6：整段无提示复现
}

/* ── 阶段 4 · 错句回写 + weakness 计数（design/10 §四）──
   落库格式对齐 pattern-drill.js custom 条目（id 前缀 P / src:practice / focus / added）。
   同日同句限速（§十六）：只 +wrongCount 不复制条目；focus 空跳过（lead 引导句不计，§5.5）。 */
function sdRecordWrong(o){
  var focus = (o.focus || '').trim();
  if(!focus) return;                                  // lead / 空 focus 不计
  var today = (typeof pdIsoDate === 'function') ? pdIsoDate() : new Date().toISOString().slice(0,10);
  var w = (typeof DATA !== 'undefined' && DATA.patternDrill) ? DATA.patternDrill : null;
  if(!w) return;
  w.custom = w.custom || [];
  var sigFn = (typeof pdErrSig === 'function') ? pdErrSig : function(a,b){ return (a+'→'+b).toLowerCase().replace(/\s+/g,' ').trim(); };
  var sig = sigFn(o.wrong, o.right);
  var hit = null;
  for(var i=0;i<w.custom.length;i++){
    var it = w.custom[i];
    if(it && it.src === 'practice' && it.added === today && sigFn(it.wrong, it.right) === sig){ hit = it; break; }
  }
  if(hit){ hit.wrongCount = (Number(hit.wrongCount)||0)+1; hit.lastWrongAt = today; }
  else {
    w.custom.push({
      id: 'P' + Date.now().toString(36) + Math.floor(Math.random()*1000),
      cn: o.cn || '', wrong: o.wrong || '', right: o.right || '',
      fix: o.note || '', focus: focus, src: 'practice', added: today,
      wrongCount: 1, lastWrongAt: today
    });
  }
  var wk = sdWeakness();                              // window.__pdWeaknessCache 或 DATA.patternDrill.weakness
  if(!wk[focus]) wk[focus] = { wrongCount: 0, lastWrongAt: '' };
  wk[focus].wrongCount = (Number(wk[focus].wrongCount)||0) + 1;
  wk[focus].lastWrongAt = today;
  if(typeof hubSave === 'function') hubSave();        // 落 localStorage + 云同步
}

/* ── 启动 ── */
async function sdBoot(){
  if(!window.__SCENE_V2_ON) return;   // 阶段 6 前不接管，零副作用
  var scenes = await sdLoadScenes();
  if(!scenes || !scenes.scenes || !scenes.scenes.length) return;
  if(!sd$('sceneCard')) return;       // 不在口语页
  var c = SD_CUR;
  if(!c || c.date !== sdToday()){     // 新一天或首次进入 → 开今日关。
    // 注：SD_CUR 是顶层 var，软导航重跑会重置 → 同日重进口语页是「重开今日关」而非续练
    //（5 句量无实害，验收 B3 按实修正注释；若未来要真续练，需挂 window 缓存恢复）。
    var scene = sdPickScene(scenes.scenes);
    if(!scene) return;
    SD_CUR = { scene: scene, steps: sdStepsOf(scene), idx: 0, log: [], date: sdToday(), stuck: false, recordedStuck: false };
    SD_HINT_SHOWN = 0;
    SD_WRONG_N = 0;
    SD_VARIANT = null;                // 防软导航重跑残留（design/10 §3.2）
    if(SD_CUR.steps && !SD_CUR.steps.length){ SD_CUR = null; return; }
  }
  sdTakeOver();
  sdBind();
  sdRender();
}

ready(function(){ sdBoot(); });
