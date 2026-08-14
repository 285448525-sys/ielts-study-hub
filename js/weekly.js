const SUB = {
  listening: { name:'听力', tpl:['听力 S1+S4 填空 1 套','语料库听写 1 组（去「听力语料库」页）','精听 1 段并跟读模仿'] },
  reading:   { name:'阅读', tpl:['阅读 1 篇 P1（计时 20min）','判断题 FALSE / NOT GIVEN 专项 10 题','复盘错题：分清"矛盾"与"没提"'] },
  writing:   { name:'写作', tpl:['写作 Task2 四段式练 1 篇','背 / 默写作模板 1 段','审题训练：5 个题目列提纲'] },
  speaking:  { name:'口语', tpl:['GPT 口语对话 15min（P1 快问快答）','串题素材复述 1 个 P2，说满 2 分钟','录音自查流利度'] },
  mix:       { name:'综合', tpl:['阅读半篇 + 听力半套','GPT 口语 10min','词库复习 20 词'] },
};
const WEEK = ['周日','周一','周二','周三','周四','周五','周六'];
const DAILY = ['词库复习 / 生词复盘 20 词','服专注达：把最难的任务放在药效前 6 小时'];

let currentWeek = null;

ready(() => {
  renderStatus();
  $('#examTasks').value = DATA.settings.examGoals || '';
  $('#weekTasks').value = DATA.settings.weeklyTasks || '';
  renderExamHint();
  $('#genExamGoal').addEventListener('click', genExamGoal);
  $('#importExamGoal').addEventListener('click', importExamGoalToWeek);
  $('#autoAssign').addEventListener('click', autoAssign);
  $('#genWeek').addEventListener('click', () => { buildAndRender(getCustomTasks()); });
  $('#fillAll').addEventListener('click', fillAll);
});

function getCustomTasks(){
  const raw = (DATA.settings.weeklyTasks || '').trim();
  return raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

function renderExamHint(){
  const dLeft = daysUntil(DATA.settings.examDate);
  const el = $('#examGoalHint');
  if(!el) return;
  if(dLeft === null) el.textContent = '提示：先去「设置」填写考试日期。';
  else if(dLeft <= 0) el.textContent = '提示：考试日期已过，请去「设置」更新。';
  else el.textContent = '提示：距考试还有 ' + dLeft + ' 天（约 ' + Math.max(1, Math.ceil(dLeft/7)) + ' 周）。';
}

function computeWeak(){
  const t = DATA.settings.targets || {};
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const subs = [['listening','听力',t.listening||5.5],['reading','阅读',t.reading||6.5],['writing','写作',t.writing||5.5],['speaking','口语',t.speaking||5.5]];
  return subs.map(([k,name,tg]) => ({ k, name, gap: latest ? Math.round((tg-(latest[k]||0))*2)/2 : tg }))
    .sort((a,b)=>b.gap-a.gap);
}

function renderStatus(){
  const t = DATA.settings.targets || {};
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const weak = computeWeak();
  const dLeft = daysUntil(DATA.settings.examDate);
  let html = '<div class="stat-grid">' +
    statCard('距考试', (dLeft===null?'--':(dLeft<0?'已过':dLeft)) + ' 天', 'var(--primary)') +
    statCard('最弱科目', weak[0].name + '（差 ' + Math.abs(weak[0].gap).toFixed(1) + '）', 'var(--danger)') +
    '</div>';
  if(latest){
    const lo = Math.round(((latest.listening+latest.reading+latest.writing+latest.speaking)/4)*2)/2;
    html += '<p class="muted" style="margin-top:8px">最近模考（' + latest.date + '）总分 ' + lo.toFixed(1) +
      ' · 听' + latest.listening + ' / 读' + latest.reading + ' / 写' + latest.writing + ' / 口' + latest.speaking +
      ' ｜ 目标 听' + (t.listening||5.5) + ' 读' + (t.reading||6.5) + ' 写' + (t.writing||5.5) + ' 口' + (t.speaking||5.5) + '</p>';
  } else {
    html += '<p class="muted" style="margin-top:8px">还没有模考记录，建议先去「模考记录」登记一次，建议会更准。</p>';
  }
  html += '<p class="muted">各科差距：' + weak.map(w => w.name + ' ' + (w.gap>=0?('差'+w.gap):'已超')).join(' · ') + '</p>';
  $('#statusBox').innerHTML = html;
}

/* ===== 考试目标模块：把考试前的任务按周分配 ===== */
function genExamGoal(){
  const raw = $('#examTasks').value.trim();
  DATA.settings.examGoals = raw;
  hubSave();
  const tasks = raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const dLeft = daysUntil(DATA.settings.examDate);
  const box = $('#examGoalBox');
  if(dLeft === null || dLeft <= 0){
    box.innerHTML = renderEmpty('请先在「设置」里填写一个未来的考试日期。');
    return;
  }
  if(tasks.length === 0){
    box.innerHTML = renderEmpty('先在上面写下考试前想完成的任务（一行一个）。');
    return;
  }
  const weeks = Math.max(1, Math.ceil(dLeft / 7));
  const perWeek = Math.max(1, Math.ceil(tasks.length / weeks));
  const perDay = (dLeft / tasks.length).toFixed(1);
  let html = '<div class="stat-grid">' +
    statCard('距考试', dLeft + ' 天', 'var(--primary)') +
    statCard('剩余约', weeks + ' 周', 'var(--med)') +
    statCard('任务数', tasks.length + ' 个', 'var(--warn)') +
    statCard('建议节奏', '每 ' + perDay + ' 天 1 个', 'var(--primary)') +
    '</div>';
  html += '<p class="muted" style="margin:6px 0 12px">建议每周完成约 <b>' + perWeek + '</b> 个任务。下面是按周分配的大致目标，可参考它来安排每周计划：</p>';
  for(let w = 0; w < weeks; w++){
    const weekTasks = tasks.slice(w * perWeek, (w + 1) * perWeek);
    if(weekTasks.length === 0) break;
    const startDay = w * 7 + 1;
    const endDay = Math.min((w + 1) * 7, dLeft);
    html += '<div class="card" style="margin-top:10px"><div class="plan-meta">' +
      '<h2 style="margin:0">第 ' + (w + 1) + ' 周（第 ' + startDay + '-' + endDay + ' 天）</h2>' +
      '<span class="badge">' + weekTasks.length + ' 个任务</span></div>' +
      '<ul class="suggest-list">' + weekTasks.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul></div>';
  }
  box.innerHTML = html;
  toast('已生成考试目标建议：' + tasks.length + ' 个任务分到 ' + Math.min(weeks, Math.ceil(tasks.length/perWeek)) + ' 周');
}

/* ===== 联动：把考试目标「本周」该做的任务带入每周任务框 ===== */
function importExamGoalToWeek(){
  const raw = (DATA.settings.examGoals || '').trim();
  if(!raw){ toast('先在上方「考试目标」写下任务'); return; }
  const tasks = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const dLeft = daysUntil(DATA.settings.examDate);
  if(dLeft === null || dLeft <= 0){ toast('请先在「设置」里填写未来的考试日期'); return; }
  const weeks = Math.max(1, Math.ceil(dLeft / 7));
  const perWeek = Math.max(1, Math.ceil(tasks.length / weeks));
  const weekTasks = tasks.slice(0, perWeek); // 本周 = 第 1 周
  const ta = $('#weekTasks');
  const existing = ta.value.trim();
  // 去重：已存在的不再带入
  const existLines = existing ? existing.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const add = weekTasks.filter(t => !existLines.includes(t));
  if(add.length === 0){ toast('本周目标任务已全部在列表中'); return; }
  const merged = existing ? existing + '\n' + add.join('\n') : add.join('\n');
  ta.value = merged;
  DATA.settings.weeklyTasks = merged;
  hubSave();
  toast('已带入本周 ' + add.length + ' 个考试目标任务，可继续编辑后点「自动分配」');
}

/* ===== 每周自定义任务：自动分配到 7 天 ===== */
function autoAssign(){
  const raw = $('#weekTasks').value.trim();
  DATA.settings.weeklyTasks = raw;
  hubSave();
  const tasks = raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  buildAndRender(tasks);
  if(tasks.length){
    toast('已把 ' + tasks.length + ' 个任务自动分配到本周');
  } else {
    toast('还没有写任务，已按弱项生成本周计划');
  }
}

function buildAndRender(customTasks){
  customTasks = customTasks || [];
  const weak = computeWeak();
  const weakK = [weak[0].k, weak[1].k];
  // 7 天类型：覆盖核心科目 + 重点加练最弱两项
  const types = ['reading','listening','writing','speaking','mix', weakK[0], weakK[1]];
  const start = new Date(); start.setHours(0,0,0,0);
  currentWeek = [];
  for(let i = 0; i < 7; i++){
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = todayKey(d);
    const type = types[i];
    const tasks = [];
    if(type === weakK[0] || type === weakK[1]){
      tasks.push('⚠️ 重点突破：' + SUB[type].name + ' 加练 1 组');
    }
    tasks.push(...SUB[type].tpl);
    tasks.push(...DAILY);
    currentWeek.push({ key, date: d, type, tasks });
  }
  // 把用户自定义任务均匀分配到 7 天（轮询，每天约 1-2 个）
  customTasks.forEach((t, i) => {
    const dayIdx = i % 7;
    currentWeek[dayIdx].tasks.splice(1, 0, '📌 ' + t);
  });
  renderWeek();
}

function renderWeek(){
  if(!currentWeek){ $('#weekBox').innerHTML = renderEmpty('点「自动分配」或「按弱项生成」先看建议。'); return; }
  $('#weekBox').innerHTML = currentWeek.map((day, idx) => {
    const wd = WEEK[day.date.getDay()];
    return `<div class="card">
      <div class="plan-meta">
        <h2 style="margin:0">${day.key} · ${wd} · ${SUB[day.type].name}日</h2>
        <button class="btn btn-sm" data-fill="${idx}">填入学习计划</button>
      </div>
      <ul class="suggest-list">${day.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
    </div>`;
  }).join('');
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
  if(!currentWeek){ buildAndRender(getCustomTasks()); }
  let total = 0;
  currentWeek.forEach((day, idx) => {
    const before = (DATA.plans.find(p => p.date === day.key) || {items:[]}).items.length;
    fillDay(idx);
    const after = (DATA.plans.find(p => p.date === day.key) || {items:[]}).items.length;
    total += after - before;
  });
  toast('整周已生成，共新增 ' + total + ' 项到学习计划');
}
