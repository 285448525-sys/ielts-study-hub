/* 句型闯关（pattern-drill）：Repair Drill 引擎（design/06 方案落地）
   架构：数据(data/patterns.json) + 引擎(本文件) + AI 只做判定(callRelay)。
   流程：给中文 + 用户自己的错句 → 用户 repair → AI 只判对/错 → 答错出同类补题(retry)，答对才过
   → 新学组全过后显示组「易错点」总结（自由造句已按之之 9/9 反馈移除）→ mastered → 艾宾浩斯 +1/+2/+4/+7/+15 复习。
   复习模式混合连打、不逐题展开、答错降级 level 0；答错路径一律停住手动进下一题（9/9）。进度挂 DATA.patternDrill（云同步零额外代码）。
   AI 超时 3.2s 放行 + 标 pending（顶部计数），绝不卡流程。 */

var PD_NEW_PER_DAY = 5;
var PD_INTERVALS = [1, 2, 4, 7, 15]; // 掌握后下次复习间隔（天），level 0~4

/* 顶层一律 var：本文件同时被 pattern-drill.html（script 标签）与 speaking.html「练习」tab
   （软导航 window.eval 重跑）加载，let/const 顶层声明重跑会崩（见 speaking.js 同款注释）。 */
var PD_PATTERNS = null;
var PD_GROUPS = [];
var PD_PROGRESS = null;
var PD_QUEUE = [];
var PD_IDX = 0;
var PD_CUR = null;        // { item, mode:'new'|'review'|'free', wrongCount, demoted }
var PD_AUTO_NEXT = null;  // 自动跳转定时器
var PD_RETRY = null;      // 补题上下文 { cn, fix }（答错后 AI 出的同类中文短句）
var PD_RETRY_FAILS = 0;   // 同一道补题连续答错次数（≥2 放行，标 pending）
var PD_STAGES = [];       // 新学题全过后的阶段：组 tip
var PD_STAGE_IDX = 0;
var PD_NEW_GROUP_IDS = []; // 本轮新学涉及的组（决定 tip）
var PD_BUSY = false;      // 判定进行中，防连点
var PD_BOOTED = false;    // 引擎本页会话是否已启动（tab 切回不重建队列）

var PD_JUDGE_SYS = `你是雅思口语 5.5 分目标的语法裁判。用户在做"句子修复"练习：给她一句中文和她自己说错的英文，她要 repair 成正确句。你只判断用户这次的答案是否"正确"（意思和基本结构对即可）。
【只纠严重影响理解的错误】：词序错、时态错、双动词、缺 be 动词、词性混淆(形容词/名词/动词用错)、缺主语、缺助动词。
【一律放过，判 ok】：单复数、a/an/the 漏用、三单 -s、大小写、标点、拼写(除非改变词义)、there is/are 小误、英式/美式拼写差异。
【用户自述打错(typo)不算错】。
输出严格 JSON，不要任何前后文字、不要解释、不要寒暄：
- 正确：{"ok":true}
- 错误：{"ok":false,"fix":"中文一句话，点出错误在哪 + 怎么改","retry":"针对同一错误点的一句同类中文短句（新的句子，让她翻译重说）"}
绝不输出 6 分以上水平的改写，不要给整句正确翻译。`;

var PD_RETRY_SYS = `你是雅思口语 5.5 分目标的语法裁判。用户刚才在某句型上犯了错，现在做"补题"：给一句同类的中文，她翻译成英文。你只重点检查她是否修复了原来那个错误点，其余一律放过（单复数、冠词、三单、大小写、标点、拼写都不算错）。
输出严格 JSON，不要任何前后文字：
- 正确：{"ok":true}
- 错误：{"ok":false,"fix":"中文一句话，点出错误在哪 + 怎么改"}`;

var PD_IMPORT_SYS = `你在为雅思「句子修复」练习库做解析。用户会粘贴一段任意文本（可能是：中文句子、英文句子、他写错的英文+改正、句型笔记、混合内容）。把其中值得练习的内容解析成练习条目。
每条格式：{"cn":"中文提示句（她看中文说英文）","wrong":"英文错句，没有就空字符串","right":"正确英文句","fix":"中文一句话点出易错点，没有就空字符串"}
【规则】
1. 只提完整句子，最多 12 条，宁缺毋滥；标题、说明文字等无关内容忽略。
2. 原文是「错句 → 改正」对：wrong=错句，right=改正句，fix=点出错误类型。
3. 原文只是正确英文句：wrong 留空，right=该句，cn=对应中文。
4. 原文是中文句：right=地道的英文翻译，cn=原中文，wrong 留空。
5. fix 只点严重错误（词序/时态/双动词/缺 be/词性/缺主语），不纠结拼写标点。
输出严格 JSON，不要任何解释：{"items":[...]}
解析不出任何条目时输出 {"items":[]}。`;

var PD_SYNC_SYS = `你在为「句子修复」练习库生成中文提示。输入是 JSON 数组 [{"i":0,"right":"正确英文句"},...]。
对每句输出自然的口语化中文翻译（供用户看着中文说出这句英文）。
输出严格 JSON，不要任何解释：{"items":[{"i":0,"cn":"中文"}]}`;

function pdIsoDate(d){ d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function pdAddDays(iso, n){ const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate()+n); return pdIsoDate(d); }
function pdWithTimeout(p, ms){ return new Promise((res, rej) => { const t = setTimeout(() => res('__TIMEOUT__'), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); }); }

function pdEnsureProgress(){
  DATA.patternDrill = DATA.patternDrill || { items:{}, lastDate:'', todayDone:[] };
  PD_PROGRESS = DATA.patternDrill;
}

function pdGroupOf(it){ return PD_GROUPS.find(g => g.items.indexOf(it) >= 0) || {}; }

function pdBuildQueue(){
  const today = pdIsoDate();
  const queue = [];
  PD_NEW_GROUP_IDS = [];
  // 复习：已掌握且到期（混合连打，不做自由造句）
  for(const g of PD_GROUPS){
    for(const it of g.items){
      const st = PD_PROGRESS.items[it.id];
      if(st && st.status === 'mastered' && st.due && st.due <= today){
        queue.push({ item:it, mode:'review' });
      }
    }
  }
  // 新学：未掌握的，按 group 优先级顺序，每天最多推进 PD_NEW_PER_DAY 个
  const pending = [];
  for(const g of PD_GROUPS){
    for(const it of g.items){
      const st = PD_PROGRESS.items[it.id];
      if(!(st && st.status === 'mastered')) pending.push(it);
    }
  }
  for(let i = 0; i < Math.min(PD_NEW_PER_DAY, pending.length); i++){
    queue.push({ item:pending[i], mode:'new' });
    const gid = pdGroupOf(pending[i]).id;
    if(gid && PD_NEW_GROUP_IDS.indexOf(gid) === -1) PD_NEW_GROUP_IDS.push(gid);
  }
  return queue;
}

function pdSave(){
  PD_PROGRESS.lastDate = pdIsoDate();
  /* 必须走 hubSave：同步写 localStorage（进度当场落盘）+ 内部防抖云同步。
     只调 scheduleCloudUpload 是 9/9 冒烟实锤的 bug——内存有进度、localStorage 永远没写，
     刷新全丢。 */
  hubSave();
}

/* 顶部「未判定」计数（AI 超时/无 Key 时该题标 pending，下次判定成功自动清除） */
function pdUpdatePendingTop(){
  const el = document.getElementById('pdPendingTop');
  if(!el) return;
  let n = 0;
  for(const id in PD_PROGRESS.items){ if(PD_PROGRESS.items[id] && PD_PROGRESS.items[id].pending) n++; }
  if(n > 0){ el.hidden = false; el.textContent = '⏳ ' + n + ' 题未判定（网络或 Key 问题已放行），下次判对会自动清除'; }
  else el.hidden = true;
}

function pdShowOverview(){
  const total = PD_GROUPS.reduce((n,g) => n + g.items.length, 0);
  let mastered = 0; for(const id in PD_PROGRESS.items){ if(PD_PROGRESS.items[id].status === 'mastered') mastered++; }
  const newCount = PD_QUEUE.filter(q => q.mode === 'new').length;
  const revCount = PD_QUEUE.filter(q => q.mode === 'review').length;
  let html = '<div class="pd-ov-grid">'
    + '<div class="pd-ov-box"><h3>今日新学</h3><div class="num">' + newCount + '</div></div>'
    + '<div class="pd-ov-box"><h3>今日复习</h3><div class="num">' + revCount + '</div></div>'
    + '<div class="pd-ov-box"><h3>已掌握</h3><div class="num">' + mastered + ' / ' + total + '</div></div>'
    + '<div class="pd-ov-box"><h3>下次复习</h3><div class="num" style="font-size:16px">' + (revCount ? '今天有' : '待掌握后') + '</div></div>'
    + '</div>';
  if(PD_QUEUE.length){
    html += '<ul class="pd-ov-list">';
    for(const q of PD_QUEUE){
      const st = PD_PROGRESS.items[q.item.id];
      const done = (q.mode === 'review' && st && st.status === 'mastered' && st.due && st.due > pdIsoDate());
      const cls = done ? 'done' : (q.mode === 'review' ? 'rev' : 'new');
      html += '<li><span class="pd-dot ' + cls + '"></span>' + q.item.cn + '</li>';
    }
    html += '</ul>';
  } else {
    html += '<p class="pd-note">今天没有新任务。已掌握的全部还没到复习日——去练别的模块，或加新题库。</p>';
  }
  const customN = (PD_PROGRESS.custom || []).length;
  html += '<p class="pd-note">规则：给中文 + 你自己的错句，repair 成正确句。答错会提示错在哪，并出一道同类补题，答对才过关。AI 只判对/错，不剧透答案。'
    + (customN ? '句型库含 <b>' + customN + '</b> 句自建句子（模考错句自动同步 / 手动导入），之后的练习优先出现。' : '')
    + '</p>';
  $('#ovBody').innerHTML = html;
}

function pdStart(){
  PD_BOOTED = true;
  PD_QUEUE = pdBuildQueue();
  PD_IDX = 0;
  PD_STAGES = []; PD_STAGE_IDX = 0;
  PD_RETRY = null; PD_RETRY_FAILS = 0; PD_BUSY = false;
  pdShowOverview();
  pdUpdatePendingTop();
  if(!PD_QUEUE.length){
    $('#trainCard').style.display = 'none';
    return;
  }
  $('#overview').scrollIntoView({ behavior:'smooth', block:'start' });
  pdNext();
}

/* 新学题全过后进入的阶段：各组 tip（直接告知不考）。
   自由造句阶段已按之之 9/9 反馈整步移除（「毫无头绪该说啥」）。 */
function pdBuildStages(){
  const stages = [];
  const hadNew = PD_QUEUE.some(q => q.mode === 'new');
  if(!hadNew) return stages;
  for(const g of PD_GROUPS){
    if(PD_NEW_GROUP_IDS.indexOf(g.id) !== -1 && g.tip) stages.push({ type:'tip', group:g });
  }
  return stages;
}

function pdNext(){
  if(PD_AUTO_NEXT){ clearTimeout(PD_AUTO_NEXT); PD_AUTO_NEXT = null; }
  PD_RETRY = null; PD_RETRY_FAILS = 0;
  pdShowOverview();
  if(PD_IDX < PD_QUEUE.length){
    PD_CUR = PD_QUEUE[PD_IDX];
    pdRenderItem();
    return;
  }
  // 队列完 → tip 阶段
  if(!PD_STAGES.length) PD_STAGES = pdBuildStages();
  if(PD_STAGE_IDX < PD_STAGES.length){
    pdRenderStage(PD_STAGES[PD_STAGE_IDX]);
    return;
  }
  pdFinish();
}

function pdRenderItem(){
  const it = PD_CUR.item;
  const g = pdGroupOf(it);
  $('#pdTag').textContent = (PD_CUR.mode === 'review' ? '复习 · ' : '新学 · ') + (g.name || '');
  $('#pdTag').className = 'pd-tag' + (PD_CUR.mode === 'review' ? ' rev' : '');
  $('#pdCn').textContent = it.cn;
  if(it.wrong){
    $('#pdWrong').style.display = '';
    $('#pdWrong').innerHTML = '你当时说：<b>' + (it.wrong || '—') + '</b>';
  } else {
    $('#pdWrong').style.display = 'none';
  }
  pdResetAnswer((PD_IDX + 1) + ' / ' + PD_QUEUE.length);
  const pct = Math.round(PD_IDX / Math.max(1, PD_QUEUE.length) * 100);
  $('#pdProgressFill').style.width = pct + '%';
  $('#trainCard').style.display = 'block';
  $('#pdAnswer').focus();
}

/* 补题卡片 */
function pdRenderRetry(){
  $('#pdTag').textContent = '补题 · 同类句（答对才过）';
  $('#pdTag').className = 'pd-tag';
  $('#pdCn').textContent = PD_RETRY.cn;
  $('#pdWrong').style.display = 'none';
  pdResetAnswer((PD_IDX + 1) + ' / ' + PD_QUEUE.length);
  $('#pdAnswer').focus();
}

function pdRenderStage(stage){
  if(stage.type === 'tip'){
    const g = stage.group;
    $('#pdTag').textContent = '易错点 · ' + g.name;
    $('#pdTag').className = 'pd-tag';
    $('#pdCn').textContent = '本组练完，记住这条：';
    $('#pdWrong').style.display = 'none';
    $('#pdAnswer').style.display = 'none';
    $('#pdHint').style.display = 'none';
    $('#pdSkip').style.display = 'none';
    $('#pdReveal').style.display = 'none';
    $('#pdStatus').textContent = '';
    $('#pdSubmit').textContent = '继续 ▸';
    $('#pdSubmit').disabled = false;
    $('#pdSubmit').onclick = () => {
      PD_STAGE_IDX++;
      $('#pdAnswer').style.display = '';
      $('#pdHint').style.display = '';
      $('#pdSkip').style.display = '';
      $('#pdSubmit').onclick = pdOnSubmit;
      pdNext();
    };
    const fb = $('#pdFeedback');
    fb.className = 'pd-feedback info';
    fb.textContent = g.tip;
    $('#trainCard').style.display = 'block';
    window.scrollTo({ top:0, behavior:'smooth' });
    return;
  }
}

function pdResetAnswer(statusText){
  $('#pdAnswer').value = '';
  $('#pdAnswer').disabled = false;
  $('#pdAnswer').placeholder = '输入你的英文（也可以用输入法语音转文字后粘贴）';
  $('#pdFeedback').className = 'pd-feedback';
  $('#pdFeedback').textContent = '';
  $('#pdStatus').textContent = statusText || '';
  $('#pdReveal').style.display = 'none';
  $('#pdHint').style.display = '';
  $('#pdSkip').style.display = '';
  $('#pdSubmit').textContent = '提交';
  $('#pdSubmit').disabled = false;
  $('#pdSubmit').onclick = pdOnSubmit;
}

async function pdAskAI(sys, userContent){
  const raw = await pdWithTimeout(
    callRelay('pattern_judge',
      [{ role:'system', content: sys }, { role:'user', content: userContent }],
      0, { max_tokens: 150 }),
    3200);
  if(raw === '__TIMEOUT__') return { ok:null, err:'判定超时' };
  const j = aiJson(raw);
  if(!j || typeof j.ok !== 'boolean') return { ok:null, err:'判定结果异常' };
  return { ok:!!j.ok, fix: j.fix || '', retry: j.retry || '' };
}

async function pdOnSubmit(){
  if(PD_BUSY) return;
  const answer = $('#pdAnswer').value.trim();
  if(!answer){ toast('先输入你的英文'); return; }
  PD_BUSY = true;
  $('#pdSubmit').disabled = true;
  $('#pdStatus').textContent = '判定中…';
  let r;
  try{
    if(PD_RETRY){
      // 补题判定：无参考句，按原错误点判
      r = await pdAskAI(PD_RETRY_SYS, '原来的错误点：' + (PD_RETRY.fix || '（未知）') + '\n补题中文：' + PD_RETRY.cn + '\n用户答案：' + answer + '\n只重点检查原错误点是否修复，其余一律放过。');
    } else {
      const it = PD_CUR.item;
      r = await pdAskAI(PD_JUDGE_SYS, '题目：' + it.cn + '\n参考正确句：' + it.right + '\n用户答案：' + answer + '\n只判定用户答案是否正确（意思和基本结构对即可，细节如拼写/单复数放过）。');
    }
  }catch(e){
    r = { ok:null, err: (e && e.message) ? e.message : 'AI 调用失败' };
  }
  PD_BUSY = false;
  pdHandleResult(r);
}

function pdClearPending(it){
  const st = PD_PROGRESS.items[it.id];
  if(st && st.pending){ delete st.pending; pdSave(); }
  pdUpdatePendingTop();
}

function pdHandleResult(r){
  const it = PD_CUR.item;
  const fb = $('#pdFeedback');
  if(r.ok === true){
    if(PD_RETRY){
      // 补题答对 → 原题过
      const wasRetry = true;
      PD_RETRY = null;
      if(!PD_CUR.demoted) pdMarkMastered(it);
      pdClearPending(it);
      fb.className = 'pd-feedback ok';
      fb.textContent = '✓ 补题也过了，这条算修复。';
      pdAdvance('下一题 ▸', wasRetry);
    } else {
      if(!PD_CUR.demoted) pdMarkMastered(it);
      pdClearPending(it);
      fb.className = 'pd-feedback ok';
      fb.textContent = '✓ 正确，过关。';
      pdAdvance('下一题 ▸', false);
    }
  } else if(r.ok === false){
    if(PD_RETRY){
      // 补题错 → 原句重说；两次仍错放行标 pending
      PD_RETRY_FAILS++;
      fb.className = 'pd-feedback bad';
      fb.innerHTML = '✗ ' + (r.fix || '还有问题，再试一次。');
      $('#pdAnswer').value = '';
      $('#pdAnswer').focus();
      $('#pdSubmit').disabled = false;
      $('#pdStatus').textContent = '补题重说 ' + PD_RETRY_FAILS + '/2';
      if(PD_RETRY_FAILS >= 2){
        fb.innerHTML += '<br>先过，这条下次还会作为新题出现。';
        PD_RETRY = null;
        // 之之 9/9：答错一律停住，手动进下一题，不自动跳
        pdAdvance('下一题 ▸', false, true);   // 判过错不算 pending，明天作为新题重来
      }
      return;
    }
    PD_CUR.wrongCount = (PD_CUR.wrongCount || 0) + 1;
    if(PD_CUR.mode === 'review' && !PD_CUR.demoted){
      // 复习答错 → 立即降级 level 0，明天的复习名额里再见（方案：答错降级回 level 0）
      PD_CUR.demoted = true;
      pdDemote(it);
    }
    fb.className = 'pd-feedback bad';
    fb.innerHTML = '✗ ' + (r.fix || '有错误，再想想。');
    if(r.retry){
      // 同类补题：答对才过（方案七）。之之 9/9：不自动切卡——先看错在哪，手动点「看补题 ▸」再进
      fb.innerHTML += '<br><b>补题</b>：同一错误点换个说法，看完错在哪点按钮继续——';
      PD_RETRY = { cn: r.retry, fix: r.fix || '' };
      PD_RETRY_FAILS = 0;
      $('#pdSubmit').textContent = '看补题 ▸';
      $('#pdSubmit').disabled = false;
      $('#pdSubmit').onclick = () => pdRenderRetry();
      return;
    }
    fb.innerHTML += '　→ 重说一遍试试。';
    $('#pdAnswer').value = '';
    $('#pdAnswer').focus();
    $('#pdSubmit').disabled = false;
    if(PD_CUR.wrongCount >= 2){ $('#pdReveal').style.display = ''; }
    $('#pdReveal').onclick = () => {
      fb.className = 'pd-feedback info';
      fb.innerHTML = '正确句：<b>' + it.right + '</b><br>看一眼就行，这条下次还会作为新题出现。';
      $('#pdReveal').style.display = 'none';
      PD_RETRY = null;
      pdAdvance('下一题 ▸', false, true);   // 答错路径：手动进下一题
    };
  } else {
    // 未判定（超时 / 无 Key / 异常）→ 放行不卡流程，标 pending
    fb.className = 'pd-feedback info';
    fb.textContent = '⚠️ ' + (r.err || '未判定') + '。没填 Key 或网络问题也能练——你觉得对了就手动过。';
    $('#pdReveal').style.display = '';
    $('#pdReveal').onclick = () => {
      fb.className = 'pd-feedback info';
      fb.innerHTML = '正确句：<b>' + it.right + '</b>';
      $('#pdReveal').style.display = 'none';
      PD_RETRY = null;
      pdMarkPending(it);
      pdAdvance('下一题 ▸', false);
    };
    if(PD_RETRY){
      $('#pdReveal').style.display = 'none';   // 补题无参考句，不展示正确句
      PD_RETRY = null;
      pdMarkPending(it);
      pdAdvance('下一题 ▸', false);
      return;
    }
    pdMarkPending(it);
    $('#pdSubmit').textContent = '我过了，下一题 ▸';
    $('#pdSubmit').disabled = false;
    $('#pdSubmit').onclick = () => { PD_IDX++; pdNext(); };
    PD_AUTO_NEXT = setTimeout(() => { PD_IDX++; pdNext(); }, 4000);
  }
}

/* 未判定放行：标 pending（顶部计数），进度照常。
   首次遇到的新题（从未 mastered）items 里没有条目——必须补建，否则 pending 静默丢失（9/9 冒烟实锤）。 */
function pdMarkPending(it){
  if(!it || !it.id || it.id === '__free__') return;
  const st = PD_PROGRESS.items[it.id] || (PD_PROGRESS.items[it.id] = { status:'new', level:0, due:'' });
  st.pending = true;
  pdSave();
  pdUpdatePendingTop();
}

function pdAdvance(btnText, wasRetry, manual){
  $('#pdProgressFill').style.width = Math.round((PD_IDX + 1) / Math.max(1, PD_QUEUE.length) * 100) + '%';
  $('#pdSubmit').textContent = btnText;
  $('#pdSubmit').disabled = false;
  $('#pdSubmit').onclick = () => { PD_IDX++; pdNext(); };
  /* manual=true：答错路径停住，不自动跳（之之 9/9：答错后自己手动选下一题） */
  if(!manual) PD_AUTO_NEXT = setTimeout(() => { PD_IDX++; pdNext(); }, 1100);
}

function pdMarkMastered(it){
  const st = PD_PROGRESS.items[it.id] || { status:'new', level:0, due:'' };
  const today = pdIsoDate();
  let level = st.level || 0;
  if(st.status === 'mastered'){
    level = Math.min(level + 1, PD_INTERVALS.length - 1);
  } else {
    level = 0;
  }
  PD_PROGRESS.items[it.id] = { status:'mastered', level: level, due: pdAddDays(today, PD_INTERVALS[level]), updated: today };
  pdSave();
}

/* 复习答错降级（方案：答错降级回 level 0，明天再来） */
function pdDemote(it){
  const st = PD_PROGRESS.items[it.id];
  if(!st) return;
  st.level = 0;
  st.due = pdAddDays(pdIsoDate(), PD_INTERVALS[0]);
  st.updated = pdIsoDate();
  pdSave();
}

function pdFinish(){
  $('#trainCard').style.display = 'none';
  // 找最近一次复习日
  let nextDue = null;
  for(const id in PD_PROGRESS.items){
    const st = PD_PROGRESS.items[id];
    if(st.status === 'mastered' && st.due){
      if(!nextDue || st.due < nextDue) nextDue = st.due;
    }
  }
  $('#finishCard').style.display = 'block';
  $('#finishTitle').textContent = '今天练完啦 🎉';
  $('#finishBody').innerHTML = '<p class="pd-note">本次共 ' + PD_QUEUE.length + ' 题。已掌握 ' + Object.keys(PD_PROGRESS.items).filter(k => PD_PROGRESS.items[k].status === 'mastered').length + ' 条。'
    + (nextDue ? '　下次复习日：<b>' + nextDue + '</b>。' : '') + '</p>'
    + '<div class="pd-actions"><button class="btn btn-primary" id="pdAgain">再来一轮</button><button class="btn btn-ghost" id="pdBack">看今日任务</button></div>';
  $('#pdAgain').onclick = () => { PD_IDX = 0; PD_STAGES = []; PD_STAGE_IDX = 0; pdStart(); };
  $('#pdBack').onclick = () => { $('#finishCard').style.display = 'none'; $('#overview').scrollIntoView(); };
}

function pdHint(){
  if(!PD_CUR) return;
  const it = PD_CUR.item;
  const fb = $('#pdFeedback');
  fb.className = 'pd-feedback info';
  fb.innerHTML = '提示（易错点）：' + (it.fix || '') + '<br>正确句先别看，自己 repair 一遍。';
}

/* ===== 我的句型库（模考错句自动联动 + 自定义导入，2026-09-09）=====
   存 DATA.patternDrill.custom[]（随 hubSave 云同步）：
   { id, cn, wrong, right, fix, focus, src:'mock'|'import', added }
   模考来源：DATA.mockRecords[].parts.{p1,p2,p3}.fixes[].errors[]{wrong,correct,note}，
   已同步的按签名记入 patternDrill.mockSynced[]，不重复导入。 */

function pdErrSig(w, c){ return (String(w || '') + '→' + String(c || '')).toLowerCase().replace(/\s+/g, ' ').trim(); }

/* 把 custom 条目包装成第一个组（她的错句优先出） */
function pdEnsureCustomGroup(){
  PD_GROUPS = PD_GROUPS.filter(g => g.id !== 'GCUSTOM');
  const items = DATA.patternDrill.custom || [];
  if(items.length) PD_GROUPS.unshift({ id:'GCUSTOM', name:'我的句型', priority:0, why:'', tip:'', items: items });
}

function pdCollectMockErrors(){
  const out = []; const seen = new Set();
  (DATA.mockRecords || []).forEach(rec => {
    const parts = rec && rec.parts; if(!parts) return;
    ['p1', 'p2', 'p3'].forEach(k => {
      const p = parts[k]; if(!p || !p.fixes) return;
      (p.fixes || []).forEach(f => {
        (f.errors || []).forEach(e => {
          const w = String((e && e.wrong) || '').trim(), c = String((e && e.correct) || '').trim();
          if(!w || !c || w.toLowerCase() === c.toLowerCase()) return;
          const sig = pdErrSig(w, c);
          if(seen.has(sig)) return; seen.add(sig);
          out.push({ wrong: w, right: c, fix: String((e && e.note) || '').trim(), sig: sig });
        });
      });
    });
  });
  return out;
}

function pdSyncPending(){
  const synced = new Set(DATA.patternDrill.mockSynced || []);
  const mine = new Set((DATA.patternDrill.custom || []).map(it => pdErrSig(it.wrong, it.right)));
  return pdCollectMockErrors().filter(e => !synced.has(e.sig) && !mine.has(e.sig));
}

function pdSetSyncNote(html){ const el = document.getElementById('pdSyncNote'); if(el) el.innerHTML = html || ''; }

/* 若引擎还没开练（还在第 1 题、没在判定中），重建队列让新句型立即生效 */
function pdRefreshQueueIfIdle(){
  if(PD_BOOTED && PD_IDX === 0 && !PD_BUSY && !PD_RETRY && !$('#pdAnswer').value){
    PD_QUEUE = pdBuildQueue(); PD_STAGES = []; PD_STAGE_IDX = 0; PD_RETRY = null;
    pdShowOverview(); pdUpdatePendingTop();
    if(PD_QUEUE.length) pdRenderItem();
  }
}

/* 模考错句 → 自动同步（AI 只补中文提示，错/对句直接取报告） */
async function pdAutoSyncMock(){
  if(!DATA.settings.relayToken){ return; }
  const pending = pdSyncPending();
  if(!pending.length){ pdSetSyncNote(''); return; }
  const batch = pending.slice(0, 30);
  pdSetSyncNote('⏳ 正在同步 ' + batch.length + ' 句模考错句…');
  let r;
  try{
    const raw = await pdWithTimeout(callRelay('pattern_sync',
      [{ role:'system', content: PD_SYNC_SYS }, { role:'user', content: JSON.stringify(batch.map((e, i) => ({ i: i, right: e.right }))) }],
      0, { max_tokens: 1500 }), 20000);
    if(raw === '__TIMEOUT__'){ r = { ok:null, err:'同步超时' }; }
    else {
      const j = aiJson(raw);
      // 容错：模型偶尔直接回裸数组而不是 {items:[...]}
      const arr = j ? (Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : null)) : null;
      if(!arr){ r = { ok:null, err:'同步结果格式异常' }; }
      else r = { ok:true, items: arr };
    }
  }catch(e){ r = { ok:null, err: (e && e.message) || '同步失败' }; }
  if(r.ok !== true){
    pdSetSyncNote('⚠️ 模考错句同步失败（' + r.err + '）· <a href="javascript:void(0)" id="pdSyncRetry" style="color:var(--primary)">重试</a>');
    const rb = document.getElementById('pdSyncRetry');
    if(rb) rb.onclick = () => pdAutoSyncMock();
    return;
  }
  const cnMap = {};
  (r.items || []).forEach(x => { if(x && x.cn != null) cnMap[x.i] = String(x.cn).trim(); });
  const today = pdIsoDate();
  DATA.patternDrill.mockSynced = DATA.patternDrill.mockSynced || [];
  batch.forEach((e, i) => {
    DATA.patternDrill.custom.push({
      id: 'M' + Date.now().toString(36) + i,
      cn: cnMap[i] || e.right,
      wrong: e.wrong, right: e.right, fix: e.fix || '',
      focus: '模考错句', src: 'mock', added: today
    });
    DATA.patternDrill.mockSynced.push(e.sig);
  });
  pdSave();
  pdEnsureCustomGroup();
  pdSetSyncNote('✓ 已自动同步 ' + batch.length + ' 句模考错句进「我的句型」');
  toast('已同步 ' + batch.length + ' 句模考错句，之后的练习优先出现');
  pdRefreshQueueIfIdle();
}

/* ===== 自定义导入：粘贴 → AI 解析 → 预览 → 加库；失败可重试/换一段 ===== */
var PD_IMPORT_LAST = [];

function pdImportToggle(force){
  const panel = document.getElementById('pdImportPanel');
  if(!panel) return;
  panel.hidden = (force != null) ? !force : !panel.hidden;
  if(!panel.hidden) document.getElementById('pdImportText').focus();
}

function pdImportReset(){
  document.getElementById('pdImportText').value = '';
  document.getElementById('pdImportResult').innerHTML = '';
  PD_IMPORT_LAST = [];
}

async function pdImportParse(){
  const text = document.getElementById('pdImportText').value.trim();
  const resEl = document.getElementById('pdImportResult');
  if(!text){ toast('先粘贴你想练的句型内容'); return; }
  const parseBtn = document.getElementById('pdImportParse');
  parseBtn.disabled = true;
  resEl.innerHTML = '<div class="pd-note">⏳ AI 正在识别内容与结构…</div>';
  let r;
  try{
    const raw = await pdWithTimeout(callRelay('pattern_import',
      [{ role:'system', content: PD_IMPORT_SYS }, { role:'user', content: text.slice(0, 4000) }],
      0, { max_tokens: 2000 }), 30000);
    if(raw === '__TIMEOUT__'){ r = { ok:null, err:'识别超时' }; }
    else {
      const j = aiJson(raw);
      // 容错：模型偶尔直接回裸数组而不是 {items:[...]}
      const arr = j ? (Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : null)) : null;
      if(!arr){ r = { ok:null, err:'返回格式异常' }; }
      else r = { ok:true, items: arr.filter(x => x && String(x.right || '').trim()) };
    }
  }catch(e){ r = { ok:null, err: (e && e.message) || '识别失败' }; }
  parseBtn.disabled = false;
  const fallbackBtns = '<a href="javascript:void(0)" class="pd-import-retry" style="color:var(--primary)">重试</a>　<a href="javascript:void(0)" class="pd-import-new" style="color:var(--primary)">换一段</a>';
  if(r.ok !== true || !r.items.length){
    resEl.innerHTML = '<div class="pd-note">⚠️ ' + (r.ok !== true ? ('识别失败：' + r.err) : '没识别出可练习的完整句子') + '　' + fallbackBtns + '</div>';
  } else {
    PD_IMPORT_LAST = r.items.map(x => ({
      cn: String(x.cn || '').trim(),
      wrong: String(x.wrong || '').trim(),
      right: String(x.right).trim(),
      fix: String(x.fix || '').trim()
    }));
    resEl.innerHTML = '<div class="pd-note">识别出 <b>' + PD_IMPORT_LAST.length + '</b> 句，预览：</div>'
      + PD_IMPORT_LAST.map(it =>
        '<div class="pd-wrong" style="border-left-color:var(--primary);margin-top:8px">'
        + (it.wrong ? '<b>' + escapeHtml(it.wrong) + '</b> → ' : '')
        + '<b style="color:var(--primary)">' + escapeHtml(it.right) + '</b>'
        + (it.cn ? '<br>' + escapeHtml(it.cn) : '')
        + (it.fix ? '<br><span style="color:var(--muted)">' + escapeHtml(it.fix) + '</span>' : '')
        + '</div>').join('')
      + '<div class="pd-bar"><button class="btn btn-primary" id="pdImportAdd2">全部加入句型库（' + PD_IMPORT_LAST.length + '）</button><button class="btn btn-ghost" id="pdImportRetry3">重试</button><button class="btn btn-ghost" id="pdImportNew3">换一段</button></div>';
  }
  const add2 = document.getElementById('pdImportAdd2'); if(add2) add2.onclick = pdImportAdd;
  resEl.querySelectorAll('.pd-import-retry').forEach(a => a.onclick = pdImportParse);
  const rt3 = document.getElementById('pdImportRetry3'); if(rt3) rt3.onclick = pdImportParse;
  resEl.querySelectorAll('.pd-import-new').forEach(a => a.onclick = () => { pdImportReset(); document.getElementById('pdImportText').focus(); });
  const nw3 = document.getElementById('pdImportNew3'); if(nw3) nw3.onclick = () => { pdImportReset(); document.getElementById('pdImportText').focus(); };
}

function pdImportAdd(){
  if(!PD_IMPORT_LAST.length) return;
  const today = pdIsoDate();
  PD_IMPORT_LAST.forEach((it, i) => {
    DATA.patternDrill.custom.push({
      id: 'C' + Date.now().toString(36) + i,
      cn: it.cn || it.right,
      wrong: it.wrong, right: it.right, fix: it.fix,
      focus: '自定义导入', src: 'import', added: today
    });
  });
  const n = PD_IMPORT_LAST.length;
  pdSave();
  pdEnsureCustomGroup();
  pdImportReset();
  pdImportToggle(false);
  toast('已加入 ' + n + ' 句句型，之后的练习优先出现');
  pdRefreshQueueIfIdle();
}

function pdImportInit(){
  const btn = document.getElementById('pdImportBtn');
  if(!btn) return;
  btn.onclick = () => pdImportToggle();
  const cancel = document.getElementById('pdImportCancel');
  if(cancel) cancel.onclick = () => pdImportToggle(false);
  const parse = document.getElementById('pdImportParse');
  if(parse) parse.onclick = pdImportParse;
}

ready(async () => {
  pdEnsureProgress();
  /* 题库走 window 级缓存：口语页软导航每次重进都会重跑本 ready，
     不缓存则每次进口语 tab 都打一次 patterns.json（nav 冒烟 req2 5→3 实锤） */
  if(window.__pdPatternsCache){
    PD_PATTERNS = window.__pdPatternsCache;
    PD_GROUPS = PD_PATTERNS.groups || [];
  } else {
    try{
      const res = await fetch('data/patterns.json?v=20260909a');
      PD_PATTERNS = await res.json();
      window.__pdPatternsCache = PD_PATTERNS;
      PD_GROUPS = PD_PATTERNS.groups || [];
    }catch(e){
      $('#ovBody').innerHTML = '<p class="pd-note">题库加载失败：' + (e.message || e) + '</p>';
      return;
    }
  }
  /* 提交按钮只用 onclick 单通道（pdResetAnswer/pdAdvance/各分支各自赋值）。
     禁止再 addEventListener 同一函数：双 handler + AI 微任务内即时 resolve 时，
     onclick 槽会在同一 click 派发中途被 pdAdvance 换成「下一题」箭头导致跳题（9/9 冒烟实锤）。 */
  $('#pdHint').addEventListener('click', pdHint);
  $('#pdSkip').addEventListener('click', () => {
    PD_RETRY = null;
    PD_IDX++; pdNext();
  });
  $('#pdAnswer').addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); pdOnSubmit(); }
  });
  /* 我的句型库：custom/mockSynced 缺字段补齐（老数据兼容）→ 自建组插队首 → 绑导入 UI */
  DATA.patternDrill.custom = DATA.patternDrill.custom || [];
  DATA.patternDrill.mockSynced = DATA.patternDrill.mockSynced || [];
  pdEnsureCustomGroup();
  pdImportInit();
  pdStart();
  pdAutoSyncMock();   // 异步：不阻塞首屏；同步失败在概览区显示可重试提示
});
