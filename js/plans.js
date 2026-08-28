/* === 学习计划（每日清单 + 每周 AI 排程） === */

/* ---------- 每周 AI 排程：常量/状态必须声明在 ready() 之前，
   因为 defer 脚本在 DOMInteractive 时同步执行 ready 回调，
   若变量还没初始化会导致「Cannot read properties of undefined」崩溃。 ---------- */
var SUB = {
  listening: { name:'听力', tpl:['听力 S1+S4 填空 1 套','语料库听写 1 组（去「听力」页）','精听 1 段并跟读模仿'] },
  reading:   { name:'阅读', tpl:['阅读 1 篇 P1（计时 20min）','判断题 FALSE / NOT GIVEN 专项 10 题','复盘错题：分清"矛盾"与"没提"'] },
  writing:   { name:'写作', tpl:['写作 Task2 四段式练 1 篇','背 / 默写作模板 1 段','审题训练：5 个题目列提纲'] },
  speaking:  { name:'口语', tpl:['DeepSeek 口语对话 15min（P1 快问快答）','串题素材复述 1 个 P2，说满 2 分钟','录音自查流利度'] },
  mix:       { name:'综合', tpl:['阅读半篇 + 听力半套','DeepSeek 口语 10min','词库复习 20 词'] },
};
var WEEK = ['周日','周一','周二','周三','周四','周五','周六'];
var DAILY = ['词库复习 / 生词复盘 20 词','服专注达：把最难的任务放在药效前 6 小时'];
var currentWeek = null;

/* ---------- 每日计划 ---------- */
ready(() => {
  $('#planDate').value = todayKey();
  $('#planDate').addEventListener('change', render);
  $('#addPlan').addEventListener('click', addItem);
  $('#aiPlan').addEventListener('click', aiPlanItem);
  $('#planText').addEventListener('keydown', e => { if(e.key === 'Enter' && e.ctrlKey) addItem(); });

  // 每周 AI 排程
  $('#weekTasks').value = DATA.settings.weeklyTasks || '';
  renderWeekHint();
  $('#aiWeek').addEventListener('click', aiWeekPlan);
  $('#genWeek').addEventListener('click', () => {
    DATA.settings.weeklyTasks = $('#weekTasks').value.trim();
    hubSave();
    buildAndRender(getCustomTasks());
  });

  render();
});

function currentDate(){ return $('#planDate').value || todayKey(); }

function getPlan(date){ return DATA.plans.find(p => p.date === date); }

function ensurePlan(date){
  let p = getPlan(date);
  if(!p){ p = { id: uid(), date, items: [] }; DATA.plans.push(p); }
  return p;
}

function addItem(){
  const raw = $('#planText').value.trim();
  if(!raw){ toast('先写点计划内容'); return; }
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if(!lines.length){ toast('先写点计划内容'); return; }
  const p = ensurePlan(currentDate());
  lines.forEach(text => p.items.push({ id: uid(), text, done: false }));
  hubSave();
  $('#planText').value = '';
  render();
  toast('已添加 ' + lines.length + ' 个任务');
}

/* AI 安排今天：根据用户输入的一句话目标 + 考生画像，生成今日任务清单 */
async function aiPlanItem(){
  const raw = $('#planText').value.trim();
  if(!raw){ toast('先写一句今天想完成的目标'); return; }
  if(!DATA.settings.relayToken){ toast('未配置 AI Key：请去「设置 / AI 接口」填写 DeepSeek Key'); return; }

  const weak = computeWeak();
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const t = DATA.settings.targets || {};
  const weakStr = weak.length ? weak.map(w => w.name + (w.gap >= 0 ? (' 差' + w.gap) : ' 已达标')).join('、') : '未设置目标分数，无法计算弱项';
  const latestStr = latest ? ('听' + latest.listening + '/读' + latest.reading + '/写' + latest.writing + '/口' + latest.speaking) : '暂无';
  const targetStr = '听' + (t.listening||'?') + '/读' + (t.reading||'?') + '/写' + (t.writing||'?') + '/口' + (t.speaking||'?');
  const cd = examCountdown();
  const dLeft = cd.daysLeft;
  const medToday = (DATA.meds || []).filter(m => m.date === todayKey()).sort((a,b)=>b.ts-a.ts)[0];
  const medStr = medToday ? ('今天已服专注达，药效窗口参考服药时间') : '今天未记录专注达';

  const sys = '你是雅思备考日计划教练。考生会写一句话描述今天想完成的目标。'
    + '请根据考生弱项、最近模考、目标分和考试倒计时，**仅对用户明确提到的目标进行拆分与排序**，生成今日任务清单。'
    + '任务要求：\n'
    + '① 只写任务本身，不要带时间段、不要写预估时长、不要用括号加任何说明或提示；\n'
    + '② **严格保留用户原句中的动作**，例如"过一遍"不能改成"背诵并默写"，"复习"不能改成"背诵"，不要增加用户没有要求的动作；\n'
    + '③ **只生成用户明确提到的学习任务，禁止基于弱项自行添加**"阅读模考""听力模考"等用户未提及的任务；弱项信息仅用于排序，不用于新增任务；\n'
    + '④ 弱项科目多排、优先排；同类任务分散，避免疲劳；把最难的任务排在前面；\n'
    + '⑤ 模考/套题必须整体出现，例如"听力限时模考""阅读限时模考"，不能拆成"听力 S1""阅读 P1"等；\n'
    + '⑥ 如果用户输入中包含用顿号/逗号/"各"字并列的多个独立学习单元，必须拆成独立任务，并**保留每个单元的完整原名称，不要合并或重组**。\n'
    + '   例如"观点型、讨论型模板各默写一遍"拆为"观点型模板默写一遍"和"讨论型模板默写一遍"；\n'
    + '   "口语P1高频、超高频全部过一遍"拆为"口语P1高频过一遍"和"口语P1超高频过一遍"；\n'
    + '   "口语P1超高频题（必考）、高频题全部过一遍"拆为"口语P1超高频题过一遍"和"口语P1高频题过一遍"；\n'
    + '   "背诵写作词伙 A 类、B 类"拆为"背诵写作词伙 A 类"和"背诵写作词伙 B 类"。\n'
    + '输出严格 JSON 数组：["任务1","任务2",...]。只输出 JSON，不要解释。';
  const user = '我今天想完成：' + raw
    + '\n\n弱项排序（差得最多在前）：' + weakStr
    + '\n最近模考：' + latestStr + '\n目标：' + targetStr
    + (dLeft !== null && dLeft > 0 ? '\n距考试 ' + dLeft + ' 天' : '')
    + '\n' + medStr
    + '\n\n请帮我安排今天的学习任务（JSON 数组），只输出任务名称，不要时间段、时长和括号说明。';

  const btn = $('#aiPlan');
  btn.disabled = true; btn.textContent = '安排中…';
  try{
    const content = await callRelay('daily', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);
    const arr = aiJson(content);
    if(!Array.isArray(arr) || arr.length === 0) throw new Error('AI 返回格式异常');
    const tasks = arr.map(x => String(x).trim()).filter(Boolean);
    if(!tasks.length) throw new Error('AI 没有生成任务');
    const p = ensurePlan(currentDate());
    tasks.forEach(text => p.items.push({ id: uid(), text, done: false }));
    hubSave();
    $('#planText').value = '';
    render();
    toast('AI 已安排今天 ' + tasks.length + ' 个任务');
  }catch(e){
    toast('AI 安排失败：' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = 'AI 安排今天';
  }
}

function toggleItem(id){
  const p = getPlan(currentDate()); if(!p) return;
  const it = p.items.find(i => i.id === id); if(!it) return;
  it.done = !it.done;
  hubSave(); render();
}

function deleteItem(id){
  const p = getPlan(currentDate()); if(!p) return;
  p.items = p.items.filter(i => i.id !== id);
  // 登记墓碑：同步合并(_mergePlans)靠 DATA.deletedIds 识别「已删除项」，
  // 否则云端/另一设备仍含该项的旧副本会在下次拉取时复活（表现为「删了又回来」）。
  // 其他模块(corpus/dictation/scores/meds/speaking/words/writing 等)删除点都已 push 墓碑，计划模块此前漏了。
  DATA.deletedIds = DATA.deletedIds || [];
  if(id != null && !DATA.deletedIds.includes(id)) DATA.deletedIds.push(id);
  hubSave(); render();
}

function startEdit(id){
  const p = getPlan(currentDate()); if(!p) return;
  const it = p.items.find(i => i.id === id); if(!it) return;
  const span = document.querySelector('.plan-text[data-id="' + id + '"]');
  if(!span) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'plan-input';
  input.value = it.text;
  input.dataset.editId = id;
  span.replaceWith(input);
  input.focus();
  input.select();

  function finish(save){
    const v = input.value.trim();
    if(save && v && v !== it.text){ it.text = v; hubSave(); }
    render();
  }
  input.addEventListener('blur', () => finish(true), {once:true});
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
    else if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
  });
}

function render(){
  const date = currentDate();
  // 自动延续：当查看的是「今天」且今天还没有任何计划条目时，
  // 把「前一天」所有未勾选（done:false）的任务复制过来（新 id、done:false、标记 carried），
  // 实现「昨天没做完 → 今天自动续上」。
  if(date === todayKey()){
    const todayPlan = getPlan(date);
    // 仅在「今天计划对象还不存在」时自动延续一次（把昨天未完成的搬来）。
    // 注意：不能用 items.length===0 当触发条件——否则用户把今天任务删光后会
    // 反复把昨天的任务「复活」，表现为「删都删不掉」。
    // 注意：绝不能在这里对「已存在但无 initialized 标记」的今天计划执行 ensurePlan+hubSave，
    // 否则只看历史某天时也会反复写盘、触发云端同步乒乓，甚至把旧数据异常覆盖。
    if(!todayPlan){
      const yPlan = getPlan(addDays(date, -1));
      if(yPlan && yPlan.items.length){
        const carried = yPlan.items.filter(i => !i.done);
        if(carried.length){
          const tp = ensurePlan(date);
          carried.forEach(i => tp.items.push({ id: uid(), text: i.text, done: false, carried: true }));
          tp.initialized = true;
          hubSave();
        }
      }
      // 今天计划对象已存在（包括被上面 ensurePlan 创建的）：不再做任何写盘操作
    }
  }
  const p = getPlan(date);
  const items = p ? p.items : [];
  const done = items.filter(i => i.done).length;
  const total = items.length;

  $('#dateLabel').textContent = (date === todayKey() ? '今天 · ' : '') + date;
  $('#planCount').textContent = done + ' / ' + total;

  const pct = total ? done / total * 100 : 0;
  $('#planProgress').innerHTML = progressBar('完成进度', pct, 'var(--med)');

  const box = $('#planList');
  if(total === 0){
    box.innerHTML = renderEmpty('这天还没有计划，上面加一条吧。');
  } else {
    const carriedCount = items.filter(i => i.carried).length;
    const carriedTip = carriedCount
      ? `<div class="plan-carry-tip">↻ 其中 ${carriedCount} 条是昨天未完成的，已自动延续到今天</div>`
      : '';
    box.innerHTML = carriedTip + items.map(i => `
      <div class="plan-item ${i.done ? 'done' : ''} ${i.carried ? 'carried' : ''}">
        <input type="checkbox" ${i.done ? 'checked' : ''} data-toggle="${i.id}" />
        <span class="plan-text" data-id="${i.id}" title="点击编辑">${escapeHtml(i.text)}</span>
        <button class="plan-edit" data-edit="${i.id}" title="编辑">✎</button>
        <button class="plan-del" data-del="${i.id}" title="删除">✕</button>
      </div>
    `).join('');
    box.querySelectorAll('input[data-toggle]').forEach(c =>
      c.addEventListener('change', () => toggleItem(c.dataset.toggle)));
    box.querySelectorAll('.plan-text[data-id]').forEach(s =>
      s.addEventListener('click', () => startEdit(s.dataset.id)));
    box.querySelectorAll('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => startEdit(b.dataset.edit)));
    box.querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => deleteItem(b.dataset.del)));
  }

  renderHistory(date);
}

function renderHistory(curDate){
  const others = DATA.plans
    .filter(p => p.date !== curDate && p.items.length)
    .slice().sort((a,b) => b.date.localeCompare(a.date));
  const meta = $('#historyMeta');
  if(meta) meta.textContent = others.length ? ('共 ' + others.length + ' 天 · 点击展开') : '暂无历史计划';
  const box = $('#histPlans');
  if(others.length === 0){
    box.innerHTML = renderEmpty('还没有其它日期的计划。');
    return;
  }
  // 可折叠：默认收起，只显示日期 + 完成数摘要；点开才展开当天任务明细。
  box.innerHTML = others.map(p => {
    const done = p.items.filter(i => i.done).length;
    const itemsHtml = p.items.map(i =>
      `<li class="${i.done ? 'done' : ''}">${i.done ? '✓' : '○'} ${escapeHtml(i.text)}</li>`
    ).join('');
    return `<details class="hist-plan">
      <summary>
        <span class="hist-date">${p.date}</span>
        <span class="badge">${done} / ${p.items.length} 完成</span>
        <span class="hist-chev">▸</span>
      </summary>
      <div class="hist-body">
        <ul class="hist-items">${itemsHtml}</ul>
        <button class="btn btn-sm" data-open="${p.date}">打开编辑这天</button>
      </div>
    </details>`;
  }).join('');
  box.querySelectorAll('button[data-open]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      $('#planDate').value = b.dataset.open;
      render();
      const top = document.querySelector('.container .card');
      if(top) top.scrollIntoView({ behavior:'smooth', block:'start' });
    }));
}


function upcomingDates(n){
  const arr = [];
  const start = new Date(); start.setHours(0,0,0,0);
  for(let i = 0; i < n; i++){ const d = new Date(start); d.setDate(start.getDate() + i); arr.push(d); }
  return arr;
}
function getCustomTasks(){
  const raw = (DATA.settings.weeklyTasks || '').trim();
  return raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : [];
}
function renderWeekHint(){
  const el = $('#weekHint'); if(!el) return;
  const weak = computeWeak();
  let msg;
  if(weak.length >= 2){
    msg = '弱项：' + weak[0].name + '、' + weak[1].name + '（AI 会优先多排）。';
  } else if(weak.length === 1){
    msg = '弱项：' + weak[0].name + '（AI 会优先多排）。';
  } else {
    msg = '还没设目标分数，去「设置 / 目标分数」填一下，AI 才好按弱项排序。';
  }
  const cd = examCountdown();
  if(cd.hasExam && cd.daysLeft !== null && cd.daysLeft > 0) msg += ' 距考试 ' + cd.daysLeft + ' 天。';
  el.textContent = msg;
}
function computeWeak(){
  const t = DATA.settings.targets || {};
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const subs = [['listening','听力',t.listening||0],['reading','阅读',t.reading||0],['writing','写作',t.writing||0],['speaking','口语',t.speaking||0]];
  return subs.map(([k,name,tg]) => ({ k, name, gap: latest ? Math.round((tg-(latest[k]||0))*2)/2 : tg }))
    .filter(x => x.gap > 0)
    .sort((a,b)=>b.gap-a.gap);
}

/* 无 AI：按弱项固定模板 + 任务量自动铺开 N 天（N 由任务数估算，2-7） */
function buildAndRender(customTasks){
  customTasks = customTasks || [];
  const weak = computeWeak();
  const weakK = [weak[0] && weak[0].k, weak[1] && weak[1].k].filter(Boolean);
  const baseTypes = ['reading','listening','writing','speaking','mix', weakK[0] || 'review', weakK[1] || 'review'];
  // 天数：有自定义任务按任务数估算（每约 2 条压一天），否则默认 5 天
  const n = customTasks.length
    ? Math.max(2, Math.min(7, Math.ceil(customTasks.length / 2)))
    : 5;
  const dates = upcomingDates(n);
  currentWeek = [];
  for(let i = 0; i < n; i++){
    const d = dates[i];
    const key = todayKey(d);
    const type = baseTypes[i % baseTypes.length];
    const tasks = [];
    if(type === weakK[0] || type === weakK[1]){
      tasks.push('⚠️ 重点突破：' + SUB[type].name + ' 加练 1 组');
    }
    tasks.push(...SUB[type].tpl);
    tasks.push(...DAILY);
    currentWeek.push({ key, date: d, type, tasks });
  }
  customTasks.forEach((t, i) => {
    const dayIdx = i % n;
    currentWeek[dayIdx].tasks.splice(1, 0, '📌 ' + t);
  });
  renderWeek();
}

function renderWeek(){
  if(!currentWeek){ $('#weekBox').innerHTML = renderEmpty('点「AI 帮我想」或「按弱项生成」先看建议。'); return; }
  let html = '<div class="plan-meta" style="margin:4px 0 10px"><h2 style="margin:0">计划安排（' + currentWeek.length + ' 天）</h2>'
    + '<button class="btn btn-sm" id="fillAllBtn">全部填入学习计划</button></div>';
  html += currentWeek.map((day, idx) => {
    const wd = WEEK[day.date.getDay()];
    const tag = day.focus ? '<span class="badge">' + escapeHtml(day.focus) + '</span>' : '';
    return `<div class="card">
      <div class="plan-meta">
        <h2 style="margin:0">${day.key} · ${wd}</h2>
        ${tag}<button class="btn btn-sm" data-fill="${idx}">填入</button>
      </div>
      <ul class="suggest-list">${day.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>`;
  }).join('');
  $('#weekBox').innerHTML = html;
  const all = document.getElementById('fillAllBtn');
  if(all) all.addEventListener('click', fillAll);
  $('#weekBox').querySelectorAll('button[data-fill]').forEach(b =>
    b.addEventListener('click', () => fillDay(Number(b.dataset.fill))));
}

function fillDay(idx){
  const day = currentWeek[idx]; if(!day) return;
  let plan = DATA.plans.find(p => p.date === day.key);
  if(!plan){ plan = { id: uid(), date: day.key, items: [] }; DATA.plans.push(plan); }
  const before = plan.items.length;
  day.tasks.forEach(t => { if(!plan.items.some(i => i.text === t)) plan.items.push({ id: uid(), text: t, done: false }); });
  hubSave();
  toast('已把 ' + day.key + ' 的建议加入学习计划（新增 ' + (plan.items.length - before) + ' 项）');
}
function fillAll(){
  if(!currentWeek) return;
  let total = 0;
  currentWeek.forEach((day, idx) => {
    const before = (DATA.plans.find(p => p.date === day.key) || {items:[]}).items.length;
    fillDay(idx);
    const after = (DATA.plans.find(p => p.date === day.key) || {items:[]}).items.length;
    total += after - before;
  });
  toast('整周已生成，共新增 ' + total + ' 项到学习计划');
}

/* 有 AI：让 DeepSeek 读懂文本框里的自由格式安排，智能分配到合适的天数（不再固定 7 天） */
async function aiWeekPlan(){
  const raw = $('#weekTasks').value.trim();
  DATA.settings.weeklyTasks = raw;
  hubSave();
  if(!raw){ toast('先在上面写下接下来几天要做的任务（含具体安排）'); return; }

  const weak = computeWeak();
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const t = DATA.settings.targets || {};
  const dailyHours = DATA.settings.dailyGoalHours || 0;
  const cd = examCountdown();
  const dLeft = cd.daysLeft;
  const weakStr = weak.length ? weak.map(w => w.name + (w.gap >= 0 ? (' 差' + w.gap) : ' 已达标')).join('、') : '未设置目标分数，无法计算弱项';
  const latestStr = latest ? ('听' + latest.listening + '/读' + latest.reading + '/写' + latest.writing + '/口' + latest.speaking) : '暂无';
  const targetStr = '听' + (t.listening||'?') + '/读' + (t.reading||'?') + '/写' + (t.writing||'?') + '/口' + (t.speaking||'?');

  // 无 AI：按弱项 + 任务量自动铺开
  if(!DATA.settings.relayToken){
    const tasks = raw.split('\n').map(s => s.trim()).filter(Boolean);
    buildAndRender(tasks.length ? tasks : getCustomTasks());
    return;
  }

  // 提供未来 14 天可选日期清单，约束 AI 只从这些日期里选，避免它乱编日期
  const span = 14;
  const optDates = [];
  for(let i = 0; i < span; i++){
    const iso = addDays(todayKey(), i);
    const dt = new Date(iso + 'T00:00:00');
    const wd = WEEK[dt.getDay()];
    const label = i === 0 ? '今天' : (i === 1 ? '明天' : wd);
    optDates.push({ iso, wd, label });
  }
  const dateListStr = optDates.map(d => d.iso + '（' + d.label + '）').join('、');

  const sys = '你是资深雅思备考计划教练。考生会在文本框里写下"接下来几天内要做的一些任务 + 具体安排"，可能是自由格式（含"今天/明天/周X/上午/下午/具体日期"等时间词），也可能只是一份任务清单。请**读懂考生的真实意图**，把这些任务智能分配到合适的日期，严格遵循：\n'
    + '1. 考生写了明确时间词（今天/明天/周X/上午/下午/具体日期）的，严格按时间词归位，不要自行挪动；\n'
    + '2. 没有明确时间词的，根据任务总量判断需要几天：任务少就压在 2-3 天，任务多就铺到 4-7 天，既不要强行塞满 7 天，也不要全部堆在 1 天；\n'
    + '3. 每天总时长参考 ' + dailyHours + ' 小时（后台目标时长），只少不多、尽量填满；任务之间同类分散，弱项（' + weakStr + '）多排、排在前面；\n'
    + '4. 考生列出的任务**必须全部分配**，不能遗漏；如果用户列得多就提高每天密度，但仍受 ' + dailyHours + ' 小时上限约束；\n'
    + '5. 每个任务只写名称，不要写预估时长、不要括号说明；模考/刷题后必须紧跟对应复盘（错题复盘 / 精听 / 精读）；\n'
    + '6. 口语题库（P1 约 30-40 题、P2 约 50 话题）必须按天拆分，一天只能过一部分，绝不能一天过完；\n'
    + '7. 每天可补 1 条例行（词库复习 20 词）；最难的 task 排在最前。\n'
    + '只从下面提供的日期清单里选日期，不要发明其它日期：\n' + dateListStr + '\n'
    + '输出严格 JSON：{"days":[{"date":"YYYY-MM-DD（必须是上面清单里的某一天）","focus":"当天主题（如 听力突破 / 混合 / 写作）","tasks":["任务1","任务2",...]}]}。days 的数量由你根据任务量自行决定（通常 2-7 天）。只输出 JSON，不要解释。';
  const user = '接下来几天我想做的事（原文）：\n' + raw
    + '\n\n考生画像：\n弱项（差得最多在前）：' + weakStr
    + '\n最近模考：' + latestStr + '\n目标分数：' + targetStr
    + '\n每天目标学习时长：' + dailyHours + ' 小时'
    + (dLeft !== null && dLeft > 0 ? '\n距考试 ' + dLeft + ' 天' : '')
    + '\n\n请智能分配到合适的日期（JSON）。注意：有具体时间词的严格按时间词归位；没有的按任务量决定天数（2-7 天）；所有任务必须分配完；任务只写名称不要时长。';

  $('#weekBox').innerHTML = '<div class="card"><div class="muted">正在让 AI 读懂你的安排并分配…</div></div>';
  try{
    const content = await callRelay('weekly', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.6);
    const j = aiJson(content);
    const validSet = new Set(optDates.map(d => d.iso));
    const days = (j && Array.isArray(j.days)) ? j.days.filter(d => d && validSet.has(d.date)) : [];
    if(days.length === 0){
      $('#weekBox').innerHTML = '<div class="card"><div class="muted">AI 返回格式异常，原文如下：\n\n' + escapeHtml(content) + '</div></div>';
      return;
    }
    currentWeek = days.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      return {
        key: d.date,
        date: dt,
        type: 'mix',
        focus: (Array.isArray(d.focus) ? d.focus.join(' / ') : (d.focus == null ? '' : String(d.focus))),
        tasks: Array.isArray(d.tasks) ? d.tasks.map(String) : []
      };
    }).sort((a, b) => a.key.localeCompare(b.key));
    renderWeek();
    toast('AI 已把你的安排分配到 ' + currentWeek.length + ' 天');
  }catch(e){
    $('#weekBox').innerHTML = '<div class="card"><div class="muted">AI 服务暂不可用：' + escapeHtml(e.message) + '</div></div>';
  }
}
