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
var SD_CUR = null;          // { scene, steps, idx, log, date, stuck }
var SD_BUSY = false;        // 判定进行中，防连点
var SD_AUTO_NEXT = null;    // 答对自动流转定时器
var SD_HINT_SHOWN = 0;      // 当前句提示层级：0=只显中文(L0) 1=提示单词(L1) 2=结构规则(L2，=卡住)

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
  var hb = sd$('sdHintBtn'); if(hb) hb.onclick = sdOnHint;
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
  sub.disabled = false; sub.textContent = '提交';
  hb.style.display = ''; nx.style.display = 'none';
  sdRenderHints();
}
function sdOnHint(){
  var c = SD_CUR; if(!c || SD_BUSY) return;
  if(SD_HINT_SHOWN >= 2) return;
  SD_HINT_SHOWN++;
  if(SD_HINT_SHOWN >= 2) c.stuck = true;    // 卡住定义 = 显过 L2（§七），阶段 4 用它回写
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
  var line = c.steps[c.idx].line;
  var ok = sdLocalJudge(answer, line.right);
  var fix = '';
  if(!ok){
    var r = await sdAskAI(line, answer);
    /* B2（阶段 4 补）：超时/异常放行目前无 pending 标记，该句会被算成「一次说过」。
       v1 可接受；阶段 4 建 pdRecordWrong 时一并给超时错句补 pending/不计「一次说过」。 */
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
  c.log.push({ ok: ok, right: line.right, focus: line.focus || '', answer: answer, stuck: !!c.stuck });
  if(ok){
    if(fb){ fb.className = 'pd-feedback ok'; fb.textContent = '过了'; }
    if(st) st.textContent = '';
    SD_AUTO_NEXT = setTimeout(sdAdvance, 1100);   // 答对自动流转；答错停住手动进（9/9 定版）
  } else {
    if(fb){
      fb.className = 'pd-feedback bad';           // 答错立刻给正确句（不再等 2 次，§一/§四）
      fb.innerHTML = '<b>正确句：</b>' + sdEsc(line.right) + '<br>' + sdEsc(fix || line.fix || '');
    }
    if(st) st.textContent = '';
    if(sub) sub.disabled = true;
    if(hb) hb.style.display = 'none';
    if(nx) nx.style.display = '';
    if(ans) ans.disabled = true;
  }
}
function sdAdvance(){
  var c = SD_CUR; if(!c) return;
  if(SD_AUTO_NEXT){ clearTimeout(SD_AUTO_NEXT); SD_AUTO_NEXT = null; }
  c.idx++;
  if(c.idx >= c.steps.length){ sdFinish(); return; }
  SD_HINT_SHOWN = 0;
  c.stuck = false;
  sdRender();
  // TODO 阶段 3：此处插入同句型换词连练（scene.variants after=当前 lineId）
}
function sdFinish(){
  var c = SD_CUR; if(!c) return;
  var wrong = c.log.filter(function(x){ return !x.ok; }).length;
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
  // TODO 阶段 4：答错/卡住的句子回写 custom(src:practice) + weakness 计数
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
    SD_CUR = { scene: scene, steps: sdStepsOf(scene), idx: 0, log: [], date: sdToday(), stuck: false };
    SD_HINT_SHOWN = 0;
    if(SD_CUR.steps && !SD_CUR.steps.length){ SD_CUR = null; return; }
  }
  sdTakeOver();
  sdBind();
  sdRender();
}

ready(function(){ sdBoot(); });
