/* === 学习计划（每日清单 + 每周 AI 排程） === */

/* ---------- 每周 AI 排程：常量/状态必须声明在 ready() 之前，
   因为 defer 脚本在 DOMInteractive 时同步执行 ready 回调，
   若变量还没初始化会导致「Cannot read properties of undefined」崩溃。 ---------- */
var SUB = {
  /* 9/30 同 data.js MODULES：听力 / 阅读站内没有题目，模板任务名必须标明是真题网站的活。
     「语料库听写」是听力里唯一站内真能做的（corpus.html），指向也修正成「语料库」页（旧文案写「去『听力』页」，但根本没有听力页）。 */
  listening: { name:'听力', tpl:['听力 P1 第1篇（真题网站）','语料库听写 1 组（去「语料库」页）','精听 P4 第1篇并跟读（真题网站）'] },
  reading:   { name:'阅读', tpl:['阅读 P1 第1篇（真题网站，20min）','阅读 P2 判断题 T/F/NG 专项（真题网站）','复盘今天阅读错题（真题网站）'] },
  writing:   { name:'写作', tpl:['写作 Task2 四段式练 1 篇','背 / 默写作模板 1 段','审题训练：5 个题目列提纲'] },
  speaking:  { name:'口语', tpl:['DeepSeek 口语对话 15min（P1 快问快答）','串题素材复述 1 个 P2，说满 2 分钟','录音自查流利度'] },
  mix:       { name:'综合', tpl:['阅读半篇 + 听力半套','DeepSeek 口语 10min','词库复习 20 词'] },
};
var WEEK = ['周日','周一','周二','周三','周四','周五','周六'];
var DAILY = ['词库复习 / 生词复盘 20 词','服专注达：把最难的任务放在药效前 6 小时'];
/* 9/26 她拍板：阅读/听力任务名必须写清是哪一篇（她的冲刺计划按 part + 篇号排，如「阅读 P2 16–19」「听力 P4 1–6」）。
   旧口径「阅读不写 P1/P2/P3、听力不写 S1/S2」会把她写进输入框的 part 与篇号全抹掉，
   生成出来只剩「阅读 第1篇」——看不出今天该做哪个 part（她 9/26 报）。
   日计划(aiPlanItem)与周计划(aiWeekPlan)共用这一份，避免两边口径漂移。 */
var PART_RULE = '\n'
  + '【阅读 / 听力必须标出是哪一篇（part 标注）】\n'
  + '- 阅读 = Passage，写作 P1/P2/P3；听力 = Section，按本产品的命名习惯写作 P1/P2/P3/P4（**严禁写 S1/S2**）。\n'
  + '- 任务名固定为「科目 + Part + 第N篇」，如「阅读 P2 第1篇」「听力 P4 第1篇」。\n'
  + '- 考生写出了 part 与篇号区间（如「阅读 P2 1–5」「听力 P4 1–6」「P2 16–19 (4)」「P4 19–23(5)+P3 1–2(2)」）：**严格按考生写的 part 与起始篇号逐个展开**，一个篇号一个独立任务——「阅读 P2 16–19」→「阅读 P2 第16篇」「阅读 P2 第17篇」「阅读 P2 第18篇」「阅读 P2 第19篇」；多 part 组合（如「P4 19–23 + P3 1–2」）按考生写的先后顺序依次展开，各段从考生写的起点开始编号。\n'
  + '- 考生只写了 part 没写篇号（如「阅读 P2」「听力 P4 3 篇」）：从「第1篇」起编，编到考生写的篇数。\n'
  + '- 考生没写 part（如「R3」「L4」「阅读 3 篇」「听力 4 篇」）：**由你按 P1→P2→P3(→P4) 顺序依次分配具体 part**——「R3」→「阅读 P1 第1篇」「阅读 P2 第1篇」「阅读 P3 第1篇」；「L4」→「听力 P1 第1篇」「听力 P2 第1篇」「听力 P3 第1篇」「听力 P4 第1篇」（篇数超过 4 就从 P1 再轮一轮）。**绝不输出不带 part 的「阅读 第1篇」「听力 第2篇」**。\n'
  + '- ⚠️ 括号里的数字（如「P2 16–19 (4)」的 (4)）只是篇数小计，**不要写进任务名**；任务名一律不带括号说明。\n'
  + '- 考生同时写了时长（如「听力 P4 30 分钟」）：时长放在最后，如「听力 P4 第1篇 30 分钟」。\n';
var currentWeek = null;
/* ⭐ TDZ 铁律：页面级 const 必须在 ready() 之前——ready 回调在脚本求值期同步执行，
   声明放后面（render 附近）会在首次 render 时 hit TDZ 整页崩（9/17 reload 实测）。 */

/* ================= 备考诊断（第三十三批 · 规划 Tab 改造，10/2 她已拍板） =================
   定位：面向未来新考生的通用功能。问卷全可选 → 本地提取成绩/换算 → 免费诊断报告（诚实铁律）
   → 完整 N 天计划走会员（后续 commit）。诊断结果整体存 DATA.settings.diagnosis（已登记
   SYNC_SETTINGS_FIELDS，字段级较新者胜；保存必须自打 _fieldTs.diagnosis）。 */
var DIAG_SUBS = [['listening','听力'],['reading','阅读'],['writing','写作'],['speaking','口语']];
/* 6 个可选时段（她自己的洞察：不问每天几小时，问一周哪些时段有空）。group: wd=工作日 / we=周末 */
var DIAG_SLOTS = [
  { k:'wdMorning',   label:'工作日早上', group:'wd' },
  { k:'wdForenoon',  label:'工作日上午', group:'wd' },
  { k:'wdAfternoon', label:'工作日下午', group:'wd' },
  { k:'wdEvening',   label:'工作日晚上', group:'wd' },
  { k:'weDay',       label:'周末白天',   group:'we' },
  { k:'weNight',     label:'周末晚上',   group:'we' },
];
/* 身份 → 默认时段模板（她可在问卷里任意改勾，模板只负责预填） */
var DIAG_IDENTITY = {
  worker:   { label:'上班族',   slots:['wdEvening','weDay','weNight'] },
  student:  { label:'在校生',   slots:['wdAfternoon','wdEvening','weDay','weNight'] },
  fulltime: { label:'全职备考', slots:['wdMorning','wdForenoon','wdAfternoon','wdEvening','weDay','weNight'] },
  other:    { label:'其他',     slots:['wdEvening','weDay'] },
};
/* 参考成绩 → 雅思 Band 锚点（降序）。施工方案 9.1 的换算基准；档间线性插值到 0.5。
   ⚠️ 这是「无 AI/无 token 时」的本地保守兜底；commit2 接 AI（diag key）后由 AI 评定覆盖。
   写作/口语锚点在方案只给了六级 550 一处，其余按「四六级与雅思写作口语体系不同、从低」补保守值。 */
var DIAG_REF_TABLE = {
  gaokao: { label:'高考英语', max:150, anchors:[
    [140, { listening:6.0, reading:6.5, writing:6.0, speaking:6.0 }],
    [130, { listening:5.75, reading:6.0, writing:5.5, speaking:5.5 }],
    [120, { listening:5.25, reading:5.5, writing:5.0, speaking:5.0 }],
  ], floorScore:90,  floorBand:{ listening:4.5, reading:4.5, writing:4.0, speaking:4.0 } },
  cet4: { label:'大学英语四级', max:710, anchors:[
    [550, { listening:6.0, reading:6.5, writing:5.5, speaking:5.5 }],
    [500, { listening:5.5, reading:6.0, writing:5.0, speaking:5.0 }],
    [425, { listening:4.75, reading:5.0, writing:4.5, speaking:4.5 }],
  ], floorScore:380, floorBand:{ listening:4.0, reading:4.0, writing:3.5, speaking:3.5 } },
  cet6: { label:'大学英语六级', max:710, anchors:[
    [550, { listening:6.5, reading:7.0, writing:6.0, speaking:6.0 }],
    [500, { listening:6.0, reading:6.5, writing:5.5, speaking:5.5 }],
    [425, { listening:5.0, reading:5.5, writing:4.5, speaking:4.5 }],
  ], floorScore:380, floorBand:{ listening:4.0, reading:4.5, writing:4.0, speaking:4.0 } },
};
var DIAG_PHASES = [
  { k:'foundation', min:21,  label:'基础构建期', desc:'距考 ≥21 天：打基础，四科均衡偏听读（听读提分空间最大），写作口语开始积累素材。' },
  { k:'weak',       min:8,   label:'弱项倾斜期', desc:'距考 8–20 天：向弱项倾斜，写作口语要开始成篇输出，听读保持题感。' },
  { k:'sprint',     min:3,   label:'真题冲刺期', desc:'距考 3–7 天：只做真题 / 模考 + 口语串题，不碰新知识、不学新技巧。' },
  { k:'safeguard',  min:-999,label:'考前保底期', desc:'距考 ≤2 天：只保能拿的分——背单词 30 分钟 + 口语 P1 快答 + 写作模板默写。' },
];
var diagFormState = null;   // 问卷进行中的临时态（仅内存，不落库；点生成才存）

/* ---- commit2：AI 评定（diag key）常量。放 ready 前守 TDZ 铁律；函数声明在文件后部 ---- */
var DIAG_AI_REAL_SRC = { mock:1, exam:1, writing:1, practice:1 };  // 雅思实证来源，AI 不许动这些科的分
var DIAG_AI_SYSTEM =
'你是雅思备考规划助手，正在为一位中国考生做「水平评定」。只输出一个 JSON 对象，不要输出 JSON 以外的任何文字，也不要 markdown 代码围栏。\n'
+ '\n'
+ '【换算基准（必须遵守，不得凭空夸大或贬低）】\n'
+ '高考英语 120/150 → 听力 5.0-5.5、阅读 5.5、口语 5.0、写作 5.0\n'
+ '高考英语 130/150 → 听力 5.5-6.0、阅读 6.0、口语 5.5、写作 5.5\n'
+ '高考英语 140+/150 → 听力 6.0+、阅读 6.5+、口语 6.0、写作 6.0\n'
+ 'CET-4 425 及格线 → 听力 4.5-5.0（注意：及格≠够用，四级 425 考雅思通常只有 4.5）\n'
+ 'CET-4 500+ → 听力 5.5、阅读 6.0\n'
+ 'CET-4 550+ → 听力 6.0、阅读 6.5\n'
+ 'CET-6 550+ → 听力 6.5、阅读 7.0、口语 6.0、写作 6.0\n'
+ '六级高分对雅思帮助有限：雅思口语写作的判分与四六级体系不同，必须说明这一点。\n'
+ '\n'
+ '【铁律：必须诚实】\n'
+ '- 四级及格线以上≠雅思 5.5，必须直说差距（例：这种情况听力大概 4.5-5.0，差距主要在词汇量）。\n'
+ '- 提分难度必须说清：听力阅读提分最快但高分段空间小；写作口语无法速成，只能靠持续稳定输出。\n'
+ '- 如果目标 7.0 而现状 4.5，必须明确说「需要 6 个月以上，不是短期能达成的」，不许迎合。\n'
+ '- 如果只剩 7 天却想提 1 分，必须说不可能，并给保底策略（背单词、口语 Part 1 快答、写作模板默写）。\n'
+ '- 输入里 source 为 mock/exam/writing/practice 的分数是考生的雅思实证成绩，必须原样沿用，不许改动、压低或抬高；你只对 source 为 ref（校外成绩换算）、manual（手填）或 null 的科目给估计。\n'
+ '\n'
+ '【输出 JSON 格式（只输出这个对象）】\n'
+ '{\n'
+ '  "bands": {"listening": 数字或 null, "reading": 数字或 null, "writing": 数字或 null, "speaking": 数字或 null},\n'
+ '  "bandNotes": {"listening": "给这个分数的一句依据", "reading": "...", "writing": "...", "speaking": "..."},\n'
+ '  "verdict": "2-4 句总评：现状离目标多远、时间够不够、最该做什么。必须诚实，不许哄人。",\n'
+ '  "bullets": ["4-8 条具体建议，每条一句话、可执行（说清做什么、做多少），禁止「多练听力」「保持语感」这类空话"],\n'
+ '  "focus": ["按优先级排列最该投入的科目 key，从 listening/reading/writing/speaking 中选，最多 4 个"],\n'
+ '  "refNote": "关于校外成绩换算可信度的一句说明；没有校外成绩给空字符串"\n'
+ '}\n'
+ '分数只允许 0.5 步进、范围 3.0-9.0；没有依据的科目给 null，不许编造。';

/* ⭐ TDZ 铁律：页面级 const 必须在 ready() 之前——ready 回调在脚本求值期同步执行，
   声明放后面（render 附近）会在首次 render 时 hit TDZ 整页崩（9/17 reload 实测）。 */

/* 口语题库取题助手 bankAt 已迁 common.js（9/24：首页今日任务行也要用）。
/* AI 返回的任务里「题库N」→ 自动补真实题名：「口语 题库1」→「口语 题库1 Feeling bored」。
   AI 已自己带题名（题库N 后紧跟同题名）时不重复补；编号越界保持原样。 */
function enrichSpeakingTasks(arr){
  return (Array.isArray(arr) ? arr : []).map(t0 => {
    const s = String(t0);
    if(s.indexOf('题库') === -1) return s;
    return s.replace(/题库(\d+)/g, (m, ns, off) => {
      const q = bankAt(ns);
      if(!q) return m;
      const title = String(q.titleEn || q.titleZh || '').trim();
      if(!title) return m;
      const after = s.slice(off + m.length).replace(/^[\s：:、]*/, '');
      if(after.slice(0, title.length).toLowerCase() === title.toLowerCase()) return m;
      return '题库' + ns + ' ' + title;
    });
  });
}

/* ---------- 子 Tab（10/1 她拍板拆分：「今日」= 今天的任务，「规划」= 未来 N 天总体计划 + AI 分配；
   10/1 下午她拍板历史计划收进第三个 Tab「历史」） ----------
   三个 panel 始终在 DOM 只显隐，AI 回调里对 planText/weekBox 的判空逻辑不受影响。
   视图态存 sessionStorage（全站惯例）；软导航重进本页 ready 重跑，恢复上次所在 Tab。 */
function setPlanTab(name){
  const tabs = document.querySelectorAll('#planTabs .pill-tab');
  if(!tabs.length) return;
  tabs.forEach(b => b.classList.toggle('active', b.dataset.ptab === name));
  const pt = document.getElementById('ptabToday');
  const pp = document.getElementById('ptabPlan');
  const ph = document.getElementById('ptabHistory');
  if(pt) pt.classList.toggle('active', name === 'today');
  if(pp) pp.classList.toggle('active', name === 'plan');
  if(ph) ph.classList.toggle('active', name === 'history');
  try{ sessionStorage.setItem('hub_plan_ptab', name); }catch(e){}
}

/* ---------- 每日计划 ---------- */
ready(() => {
  // 软导航重新进入本页时，重置上次遗留的周计划状态（模块级全局），
  // 否则 currentWeek 会残留上一次生成的建议在内存里，与已清空的 DOM 不一致（f 类：跨页状态隔离）。
  currentWeek = null;
  $('#planDate').value = todayKey();
  $('#planDate').addEventListener('change', render);
  $('#addPlan').addEventListener('click', addItem);
  $('#aiPlan').addEventListener('click', aiPlanItem);
  bindEnterSubmit($('#planText'), $('#addPlan'));   // 9/22 之之：回车即添加（原 Ctrl+Enter；换行用 Shift+Enter）

  // 子 Tab 切换 + 恢复上次所在 Tab（默认「今日」；支持「规划」「历史」）
  document.querySelectorAll('#planTabs .pill-tab').forEach(b =>
    b.addEventListener('click', () => setPlanTab(b.dataset.ptab)));
  try{
    const lastTab = sessionStorage.getItem('hub_plan_ptab');
    if(lastTab === 'plan' || lastTab === 'history') setPlanTab(lastTab);
  }catch(e){}

  // 每周 AI 排程（第三十三批：规划 Tab 改造为「备考诊断」后旧 DOM 已移除；
  // aiWeekPlan/buildAndRender 函数一字未动地保留，仅在旧元素仍存在时绑定——软导航缓存页/旧预览不崩）
  const _wt = document.getElementById('weekTasks');
  if(_wt){
    _wt.value = DATA.settings.weeklyTasks || '';
    document.getElementById('aiWeek').addEventListener('click', aiWeekPlan);
    document.getElementById('genWeek').addEventListener('click', () => {
      DATA.settings.weeklyTasks = _wt.value.trim();
      hubSave();
      buildAndRender(getCustomTasks());
    });
  }

  render();
  renderDiagEntry();   // 备考诊断入口卡 / 已诊断概览（规划 Tab）

  // 首页「今日任务」空态卡「AI 帮我安排今天」的跳转信标：
  // 跳到本页后聚焦输入框并清除（一次性），不触碰任何 AI 排程逻辑。软导航重进本页 ready 会重跑，同样生效。
  try{
    if(sessionStorage.getItem('hub_focus_plan_input')){
      sessionStorage.removeItem('hub_focus_plan_input');
      setPlanTab('today');   // 首页「AI 帮我安排今天」信标 → 必落在「今日」Tab，聚焦输入框才可见
      const box = document.getElementById('planText');
      if(box){ box.focus(); box.scrollIntoView({ block:'center' }); }
    }
  }catch(e){}
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
  const _now = Date.now();
  lines.forEach(text => p.items.push({ id: uid(), text, done: false, updatedAt: _now }));
  hubSave();
  $('#planText').value = '';
  render();
  toast('已添加 ' + lines.length + ' 个任务');
}

/* AI 安排今天：根据用户输入的一句话目标 + 考生画像，生成今日任务清单 */
async function aiPlanItem(){
  const raw = $('#planText').value.trim();
  if(!raw){ toast('先写一句今天想完成的目标'); return; }

  const weak = computeWeak();
  const latest = DATA.scores.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const t = DATA.settings.targets || {};
  const weakStr = weak.length ? weak.map(w => w.name + (w.gap >= 0 ? (' 差' + w.gap) : ' 已达标')).join('、') : '未设置目标分数，无法计算弱项';
  const latestStr = latest ? ('听' + latest.listening + '/读' + latest.reading + '/写' + latest.writing + '/口' + latest.speaking) : '暂无';
  const targetStr = '听' + (t.listening||'?') + '/读' + (t.reading||'?') + '/写' + (t.writing||'?') + '/口' + (t.speaking||'?');
  const cd = examCountdown();
  const dLeft = cd.daysLeft;
  // 9/21：服药模块关闭时 AI prompt 不再拼服药上下文（此前无条件拼接，会把「专注达」发给无关用户）
  const medOn = (typeof medsModuleOn === 'function') ? medsModuleOn() : false;
  const medToday = (DATA.meds || []).filter(m => m.date === todayKey()).sort((a,b)=>b.ts-a.ts)[0];
  const medStr = !medOn ? ''
    : (medToday ? '今天已服专注达，药效窗口参考服药时间' : '今天未记录专注达');

  const sys = '你是雅思备考日计划教练。考生会写一句话描述今天想完成的目标，常使用考生自己的缩写习惯（L=听力篇数、R=阅读篇数）。请读懂考生真实意图，仅对用户明确提到的目标进行拆分与排序，生成今日任务清单。\n'
    + '\n'
    + '【考生的缩写与含义（必须先理解再拆分）】\n'
    + '- L = 听力（篇数）。"L4" = 今天做 4 篇听力，展开成 4 个独立任务；命名见下方【阅读 / 听力必须标出是哪一篇】。\n'
    + '- R = 阅读（篇数）。"R3" = 今天做 3 篇阅读，展开成 3 个独立任务；命名同样见下方【阅读 / 听力必须标出是哪一篇】。\n'
    + '- "L4 R3""L4+R3""听力4 阅读3"等都表示听力 4 篇 + 阅读 3 篇，各自展开成对应篇数的平白编号任务。\n'
    + '- 口N / 口语N（N=数字）= 今天练 N 道口语题，展开成 N 个独立任务，命名"口语 P1 第1题""口语 P2 第1题"…（按 P1→P2 轮流编号，一律用"第N题"，禁用"第N刷"）；考生写明各 Part 题数（如"口1 P1 口2 P2"）则严格按写明的分布展开。\n'
    + '- ⚠️ 考生写了题库编号（如"题库1-5""口语题库12-16""口语 题3、7、9""题库20"）：每个编号一个独立任务，命名固定为「口语 题库N」（N 替换为编号，如"口语 题库1""口语 题库2"…"口语 题库20"）。**不要自己编题名、不要加时长/做法说明**——系统会自动在任务名后补上真实题名。考生写"题库1-5"就是题库第 1 到第 5 共 5 个任务，逐个列出。\n'
    + '- 写N / 写作N（N=数字）或"写N篇" = 今天写 N 篇作文，全部拆开成"写作 第1篇""写作 第2篇"…"写作 第N篇"；考生写明 Task1/Task2 则按写明的照写。\n'
    + '- 模考 = 完整限时模考（默认听力模考+阅读模考）；"口语1h"这类只写时长的口语 = 1 个任务按原话保留；背词/背单词 = 背单词（用户写了时长就按用户的写，没写才默认 30 分钟）。这些按用户原话保留，不擅自改动作。\n'
    + '\n'
    + '【任务要求】\n'
    + '① 只写任务本身，不要带时间段、不要用括号加说明；**考生原话里明确说出的时长必须原样保留在任务名里**（如"背单词 1 小时"→"背单词 1 小时"、"听力 20 分钟"→"听力 20 分钟"），这是考生自己的安排，严禁丢掉或擅自改数；考生没说时长的任务不要编造时长；\n'
    + '② 严格保留用户原句的科目与动作（"过一遍"不改"背诵默写"，"复习"不改"背诵"），不增加用户没要求的动作；\n'
    + '③ 只生成用户明确提到的学习任务，禁止基于弱项自行添加"阅读模考""听力模考"等未提及任务；弱项仅用于排序；\n'
    + '④ 弱项科目多排、优先排；同类任务分散；最难排最前；\n'
    + '⑤ 模考/套题必须整体出现（"听力限时模考""阅读限时模考"），不拆成单篇、也不标 part；\n'
    + '⑥ 输入含顿号/逗号/"各"并列的多个独立单元，必须拆成独立任务并保留原名称（如"观点型、讨论型模板各默写一遍"→"观点型模板默写一遍""讨论型模板默写一遍"）；\n'
    + '⑦ L/R 缩写必须按上面展开成独立任务，不得原样保留"L4""R3"这种缩写。\n'
    + '⑧ 口语题数缩写（口N/口语N）与写作篇数缩写（写N/写作N/写N篇）同样必须展开成独立任务，不得原样保留"口3""写2"。\n'
    + PART_RULE
    + '\n'
    + '输出严格 JSON 数组：["任务1","任务2",...]。只输出 JSON，不要解释。';
  const user = '我今天想完成：' + raw
    + '\n\n弱项排序（差得最多在前）：' + weakStr
    + '\n最近模考：' + latestStr + '\n目标：' + targetStr
    + (dLeft !== null && dLeft > 0 ? '\n距考试 ' + dLeft + ' 天' : '')
    + (medStr ? '\n' + medStr : '')   // 模块关闭时完全不追加（留 '\n' 会喂给 AI 一行空噪声）
    + '\n\n请帮我安排今天的学习任务（JSON 数组），只输出任务名称，不要时间段和括号说明；考生明确说出的时长（如"背单词 40 分钟"）必须保留在任务名里，没说时长的任务不要编造时长。';

  const btn = $('#aiPlan');
  btn.disabled = true; btn.textContent = '安排中…';
  try{
    const content = await callRelay('daily', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);
    const arr = aiJson(content);
    if(!Array.isArray(arr) || arr.length === 0) throw new Error('AI 返回格式异常');
    const tasks = enrichSpeakingTasks(arr.map(x => String(x).trim()).filter(Boolean));
    if(!tasks.length) throw new Error('AI 没有生成任务');
    const p = ensurePlan(currentDate());
    let added = 0;
    tasks.forEach(text => {
      // 9/23 她拍板：同名任务她就是要重复做（同一天排两条「听力 第2篇」），AI 安排的一律照加，
      // 不做同名去重（之前「拦未完成同名」把她的重复需求吞了）。AI 单次返回内部的重复极罕见，不处理。
      p.items.push({ id: uid(), text, done: false, updatedAt: Date.now() });
      added++;
    });
    hubSave();
    // 软导航可能在 AI 等待期间离开计划页；数据已落盘，DOM 不存在则跳过渲染（f 类：跨页闭包隔离）。
    if(!document.getElementById('planText')) return;
    $('#planText').value = '';
    render();
    toast('AI 已安排今天 ' + added + ' 个任务');
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
  it.updatedAt = Date.now();   // design/84：勾选/取消都戳时间戳——合并按新者整项胜，取消勾选才能传到另一端
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

  let cancelled = false;
  function finish(save){
    const v = input.value.trim();
    if(save && v && v !== it.text){ it.text = v; it.updatedAt = Date.now(); hubSave(); }
    render();
  }
  input.addEventListener('blur', () => { if(!cancelled) finish(true); }, {once:true});
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
    else if(e.key === 'Escape'){ e.preventDefault(); cancelled = true; finish(false); }
  });
}

/* 9/24 她拍板：计划页任务行只留 编辑 + 删除。
   原「直接计时」(planModIdOf/planActiveSrc/onPlanTimerBtn) 与「↗ 跳转」(planJumpInfo/onPlanJump)
   整块删除；跳转能力迁到首页今日任务行（common.js planJumpInfo/planJumpUrl）。 */

function render(){
  const date = currentDate();
  // 自动延续：当查看的是「今天」且今天还没有任何计划条目时，
  // 把「前一天」所有未勾选（done:false）的任务复制过来（新 id、done:false、标记 carried），
  // 实现「昨天没做完 → 今天自动续上」。
  if(date === todayKey()){
    // 自动延续逻辑抽到 common.js ensureTodayPlanCarried()（首页也要触发，见 index.js）
    ensureTodayPlanCarried();
  }
  const p = getPlan(date);
  const items = (p && Array.isArray(p.items)) ? p.items : [];
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
    box.innerHTML = carriedTip + items.map(i => {
      return `
      <div class="plan-item ${i.done ? 'done' : ''} ${i.carried ? 'carried' : ''}">
        <input type="checkbox" ${i.done ? 'checked' : ''} data-toggle="${i.id}" />
        <span class="plan-text" data-id="${i.id}" title="点击编辑">${escapeHtml(i.text)}</span>
        <button class="plan-edit" data-edit="${i.id}" title="编辑">✎</button>
        <button class="plan-del" data-del="${i.id}" title="删除">✕</button>
      </div>
    `;
    }).join('');
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
    .filter(p => p.date !== curDate && Array.isArray(p.items) && p.items.length)
    .slice().sort((a,b) => b.date.localeCompare(a.date));
  const box = $('#histPlans');
  if(others.length === 0){
    box.innerHTML = renderEmpty('还没有其它日期的计划。');
    return;
  }
  // 10/1 晚 v2（她拍板）：每天一张独立日卡——日期块 + 完成度进度条 + 徽章；点开展开当天明细
  box.innerHTML = others.map(p => {
    const pItems = Array.isArray(p.items) ? p.items : [];
    const done = pItems.filter(i => i.done).length;
    const pct = pItems.length ? Math.round(done / pItems.length * 100) : 0;
    const dt = new Date(p.date + 'T00:00:00');
    const wd = isNaN(dt) ? '' : ('周' + '日一二三四五六'.charAt(dt.getDay()));
    const itemsHtml = pItems.map(i =>
      `<div class="hist-item ${i.done ? 'done' : ''}"><span class="hist-dot">${i.done ? '✓' : ''}</span><span class="hist-txt">${escapeHtml(i.text)}</span></div>`
    ).join('');
    return `<details class="hist-plan">
      <summary>
        <span class="hist-date"><b>${escapeHtml(p.date.slice(8, 10))}</b><small>${escapeHtml(p.date.slice(5, 7))}月 ${wd}</small></span>
        <span class="hist-mid"><span class="hist-bar"><i class="${pct === 100 ? 'full' : ''}" style="width:${pct}%"></i></span><small class="hist-pct">${pct}%</small></span>
        <span class="badge">${done} / ${p.items.length} 完成</span>
        <span class="hist-chev">▸</span>
      </summary>
      <div class="hist-body">
        ${itemsHtml}
        <div class="hist-foot"><button class="btn btn-sm btn-ghost" data-open="${p.date}">打开编辑这天 ↗</button></div>
      </div>
    </details>`;
  }).join('');
  box.querySelectorAll('button[data-open]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      setPlanTab('today');   // 「打开编辑这天」：编辑器（日期/列表）在「今日」Tab，切回去填日期
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
  const baseTypes = ['reading','listening','writing','speaking','mix', weakK[0] || 'mix', weakK[1] || 'mix'];
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
  day.tasks.forEach(t => { if(!plan.items.some(i => String(i.text||'').trim().toLowerCase() === String(t).trim().toLowerCase())) plan.items.push({ id: uid(), text: t, done: false, updatedAt: Date.now() }); });
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

  const sys = '你是资深雅思备考计划教练。考生会在文本框里写下"接下来几天内要做的一些任务 + 具体安排"，可能是自由格式（含"今天/明天/周X/上午/下午/具体日期"等时间词），也可能只是一份任务清单，且常使用考生自己的缩写习惯。请读懂考生的真实意图，把这些任务智能分配到合适的日期。\n'
    + '\n'
    + '【考生的缩写与含义（必须先理解再分配）】\n'
    + '- L = 听力（Listening）。"L4" = 做 4 篇听力练习；"L" 后数字 = 篇数。每篇约 15 分钟（做题 5–6 分钟 + 重听错题复盘约等量）。展开成独立任务时命名见下方【阅读 / 听力必须标出是哪一篇】。\n'
    + '- R = 阅读（Reading）。"R3" = 做 3 篇阅读练习；"R" 后数字 = 篇数。每篇约 40 分钟（做题 20 分钟 + 长难句/错题复盘 20 分钟）。展开时命名同样见下方【阅读 / 听力必须标出是哪一篇】。\n'
    + '- "L4 R3""L4+R3""听力4 阅读3"等都表示听力 4 篇 + 阅读 3 篇，必须各自展开成对应篇数的独立任务。\n'
    + '- 模考 = 完整限时模考。只写"模考"默认 = 听力模考（4 part，约 60 分钟）+ 阅读模考（3 passage，约 60 分钟）；可写"听力模考""阅读模考"单独一门。模考必须整体出现，不拆成段落；模考后必须紧跟对应复盘（听力重听错题 / 阅读错题复盘）。\n'
    + '- 口N / 口语N（N=数字）= N 道口语题，展开成"口语 P1 第1题""口语 P2 第1题""口语 P1 第2题"…（按 P1→P2 轮流编号，N 个独立任务，可分摊到不同天；一律用"第N题"，禁用"第N刷"）；考生写明各 Part 分布则严格照写。只写时长的（"口语 30min/1h"）仍记作 1 个任务，名称如"口语 30 分钟"。\n'
    + '- ⚠️ 考生写了题库编号（如"题库1-5""口语题库12-16"）：每个编号一个独立任务，命名固定为「口语 题库N」——不要自己编题名、不要加时长/做法说明（系统会自动补真实题名）；"题库1-5"= 5 个任务，可分摊到不同天。\n'
    + '- 写N / 写作N（N=数字）或"写N篇" = N 篇作文，全部拆开成"写作 第1篇""写作 第2篇"…（每篇约 40 分钟：写作 20 分钟 + 对照模板复盘 20 分钟，可分摊到不同天）；模板背诵/套填/审题这类非成篇练习仍按原话 1 个任务。\n'
    + '- 背词 / 背单词 / 词库 = 背单词，固定每日约 30 分钟，记作"背单词 30 分钟"。\n'
    + '\n'
    + '【分配规则】\n'
    + '1. 考生写了明确时间词（今天/明天/周X/上午/下午/具体日期）的，严格按时间词归位，不要自行挪动。\n'
    + '2. 没有明确时间词的，根据任务总量判断需要几天：任务少压 2–3 天，任务多铺 4–7 天，不强行塞满 7 天也不全堆 1 天。\n'
    + '3. 容量估算：用上面的单篇耗时把 L/R/模考/口语/背词折算成分钟，对照后台"每天目标学习时长"（' + dailyHours + ' 小时）；考生明确写出的 L/R/模考篇数优先尊重，接近上限也不要擅自删减篇数——超载用"拆到更多天"解决。\n'
    + '4. 考生列出的任务（含每个 L/R 篇数）必须全部分配，不能遗漏；列得多就提高每天密度或增加天数（上限 7 天）。\n'
    + '5. 每个任务只写名称，不要括号说明；**考生原话里明确写出的时长必须原样保留在任务名里**（如"口语 30 分钟""背单词 1 小时"），这是考生自己的安排，严禁丢掉或擅自改数；考生没写时长的任务不要编造预估时长；任务名称用平白中文（如"听力 P4 第1篇""阅读 P2 第16篇""写作 第1篇""口语 P1 第1题""模考 听力+阅读"），不要出现 S1/S2、S3/S4 这类代号；模考/刷题后必须紧跟对应复盘（错题复盘 / 精听 / 精读）；L 篇之间、R 篇之间同类分散避免疲劳；最难的 task 排最前。\n'
    + '6. 口语题库必须按天拆分，一天只过一部分。\n'
    + '7. 每天可补 1 条例行（背单词 30 分钟）；最难的 task 排最前。\n'
    + PART_RULE
    + '\n'
    + '只从下面提供的日期清单里选日期，不要发明其它日期：\n' + dateListStr + '\n'
    + '输出严格 JSON：{"days":[{"date":"YYYY-MM-DD（必须是上面清单里的某一天）","focus":"当天主题（如 听力突破 / 混合 / 写作）","tasks":["任务1","任务2",...]}]}。days 的数量由你根据任务量自行决定（通常 2–7 天）。只输出 JSON，不要解释。';
  const user = '接下来几天我想做的事（原文）：\n' + raw
    + '\n\n考生画像：\n弱项（差得最多在前）：' + weakStr
    + '\n最近模考：' + latestStr + '\n目标分数：' + targetStr
    + '\n每天目标学习时长：' + dailyHours + ' 小时'
    + (dLeft !== null && dLeft > 0 ? '\n距考试 ' + dLeft + ' 天' : '')
    + '\n\n请智能分配到合适的日期（JSON）。注意：有具体时间词的严格按时间词归位；没有的按任务量决定天数（2-7 天）；所有任务必须分配完；任务只写名称不要括号说明，考生明确写出的时长必须保留在任务名里，没写时长不要编。';

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
      const wb = document.getElementById('weekBox');
      if(wb) wb.innerHTML = '<div class="card"><div class="muted">AI 返回格式异常，原文如下：\n\n' + escapeHtml(content) + '</div></div>';
      return;
    }
    currentWeek = days.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      return {
        key: d.date,
        date: dt,
        type: 'mix',
        focus: (Array.isArray(d.focus) ? d.focus.join(' / ') : (d.focus == null ? '' : String(d.focus))),
        tasks: Array.isArray(d.tasks) ? enrichSpeakingTasks(d.tasks.map(String)) : []
      };
    }).sort((a, b) => a.key.localeCompare(b.key));
    // 软导航可能在 AI 等待期间离开计划页；仅当周计划容器仍在当前 DOM 才渲染（f 类：跨页闭包隔离）。
    if(document.getElementById('weekBox')) renderWeek();
    toast('AI 已把你的安排分配到 ' + currentWeek.length + ' 天');
  }catch(e){
    const wb = document.getElementById('weekBox');
    if(wb) wb.innerHTML = '<div class="card"><div class="muted">AI 服务暂不可用：' + escapeHtml(e.message) + '</div></div>';
  }
}

/* =====================================================================================
   备考诊断（第三十三批）
   流程：入口卡 → 全屏问卷（自动提取成绩/手填/高考四六级换算 + 身份 + 6 时段）→ 免费本地报告
   数据：DATA.settings.diagnosis（同步白名单已登记 'diagnosis'，保存自打 _fieldTs）
   诚实铁律：目标不切实际/时间不够/及格不等于够用——必须直说，不输出哄人的话。
   ===================================================================================== */

var DIAG_SRC_LABEL = { mock:'模考记录', exam:'考试成绩', writing:'写作批改', practice:'口语练习', ref:'成绩换算', manual:'手动填写' };
/* 每 0.5 分保守需时（天），瓶颈取各科最大——官方口径「明显提分通常需数月/数百小时」，宁紧勿松 */
var DIAG_RATE = { listening:18, reading:18, writing:35, speaking:35 };

function diagRoundHalf(n){ const x = Number(n); if(!(x > 0)) return null; return Math.round(x*2)/2; }

/* ---------- 现状成绩提取：逐科独立降级（比方案的整份降级更诚实——哪科有据用哪科） ---------- */

/* 听/读/写 模考记录 → band。whole 优先（单篇 P1 偏简单会虚高），同粒度取最新。
   口径与 scores.js renderMockList 一致：score 型按 partWeight 加权；correct/total 汇总后 estimateBand。 */
function diagMockTypeBand(type){
  const recs = (DATA.mockRecords || []).filter(r => r && r.type === type && Array.isArray(r.parts) && MOCK_TYPES[r.type]);
  const dateKey = r => String(r.date || '');
  recs.sort((a,b) => dateKey(b).localeCompare(dateKey(a)) || ((b.ts||0)-(a.ts||0)));
  for(const preferWhole of [true,false]){
    for(const r of recs){
      if(preferWhole && (r.granularity === 'part')) continue;
      try{
        const cfg = MOCK_TYPES[type];
        if(r.parts.some(partIsScore)){
          let s = 0, w = 0;
          r.parts.filter(partIsScore).forEach(p => {
            s += Number(p.score) * partWeight(cfg, p.label);
            w += partWeight(cfg, p.label);
          });
          if(w > 0) return { band: diagRoundHalf(s/w), date:r.date };
        }else{
          const c = r.parts.reduce((x,p) => x + (Number(p.correct)||0), 0);
          const t = r.parts.reduce((x,p) => x + (Number(p.total)||0), 0);
          if(t > 0){ const b = estimateBand(type, c, t); if(b != null) return { band: diagRoundHalf(b), date:r.date }; }
        }
      }catch(e){}
    }
  }
  return null;
}

function diagSpeakingMockBand(){
  const recs = (DATA.mockRecords || []).filter(r => { try{ return isSpeakingMockRec(r); }catch(e){ return false; } });
  recs.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')) || ((b.ts||0)-(a.ts||0)));
  const r = recs[0];
  if(r && Number(r.overall) > 0) return { band: diagRoundHalf(r.overall), date:r.date };
  return null;
}

/* 写作批改分：parsed 且 result.overall 可用的最新一条（口径同 writing.js 列表过滤） */
function diagWritingScoreBand(){
  const recs = (DATA.writingScores || []).filter(r => r && r.parsed && r.result && typeof r.result === 'object' && r.result.overall != null);
  recs.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
  const r = recs[0];
  return r ? { band: diagRoundHalf(r.result.overall), date:r.date } : null;
}

/* 口语日常练习四维均分。scores.js 可能已被软导航加载：在就直接用，不在用内置同口径轻量版。 */
function diagSpeakingPracticeBand(){
  let agg = null;
  try{ if(typeof aggregateSpeakingPracticeScores === 'function') agg = aggregateSpeakingPracticeScores(); }catch(e){}
  if(agg && agg.overall) return { band: diagRoundHalf(agg.overall.sum / agg.overall.wsum) };
  let sum = 0, n = 0;
  const eat = sc => { ['fluency','vocabulary','grammar','pronunciation'].forEach(k => {
    const v = parseFloat(sc && sc[k]); if(!isNaN(v)){ sum += v; n++; }
  });};
  (DATA.speaking || []).forEach(s => {
    if(!s || !s.answers) return;
    Object.values(s.answers).forEach(a => {
      (a && a.records || []).forEach(r => { if(r && r.score) eat(r.score); });
      if(a && a.score && !Array.isArray(a.records)) eat(a.score);
    });
  });
  return n ? { band: diagRoundHalf(sum/n) } : null;
}

function diagLatestExam(){
  const arr = (DATA.scores || []).filter(s => s && s.date);
  arr.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return arr[0] || null;
}

/* → { bands:{listening:5.5|null,...}, src:{listening:{s,date}|null} } */
function diagExtractBands(){
  const bands = { listening:null, reading:null, writing:null, speaking:null };
  const src = { listening:null, reading:null, writing:null, speaking:null };
  const exam = diagLatestExam();
  DIAG_SUBS.forEach(([k]) => {
    let v = null;
    if(k === 'speaking') v = diagSpeakingMockBand();
    else v = diagMockTypeBand(k);   // listening / reading / writing
    if(v){ bands[k] = v.band; src[k] = { s:'mock', date:v.date }; return; }
    if(exam && Number(exam[k]) > 0){ bands[k] = diagRoundHalf(exam[k]); src[k] = { s:'exam', date:exam.date }; return; }
    if(k === 'writing'){ const w = diagWritingScoreBand(); if(w){ bands[k] = w.band; src[k] = { s:'writing', date:w.date }; return; } }
    if(k === 'speaking'){ const p = diagSpeakingPracticeBand(); if(p){ bands[k] = p.band; src[k] = { s:'practice' }; return; } }
  });
  return { bands, src };
}

/* ---------- 高考 / 四六级 → 雅思 Band 保守换算（锚点线性插值；无 AI 时的兜底） ---------- */

function diagRefBands(type, scoreRaw){
  const t = DIAG_REF_TABLE[type]; if(!t) return null;
  const score = Number(scoreRaw); if(!(score > 0)) return null;
  const out = {};
  DIAG_SUBS.forEach(([k]) => {
    const pts = t.anchors.map(a => [a[0], a[1][k]]);
    let v;
    if(score >= pts[0][0]){
      const span = Math.max(1, t.max - pts[0][0]);   // 超最高档：外推到满分，最多 +0.5
      v = pts[0][1] + 0.5 * Math.min(1, (score - pts[0][0]) / span);
    }else{
      v = null;
      for(let i = 1; i < pts.length; i++){
        if(score >= pts[i][0]){
          v = pts[i][1] + (pts[i-1][1] - pts[i][1]) * (score - pts[i][0]) / (pts[i-1][0] - pts[i][0]);
          break;
        }
      }
      if(v == null){   // 低于最低锚：在 floorBand 与最低锚间线性；低于 floorScore 不给估计（不可信）
        const lo = pts[pts.length - 1];
        if(score >= t.floorScore) v = t.floorBand[k] + (lo[1] - t.floorBand[k]) * (score - t.floorScore) / (lo[0] - t.floorScore);
      }
    }
    out[k] = v == null ? null : diagRoundHalf(v);
  });
  return out;
}

/* ---------- 档位 / 容量 / 诚实报告（纯函数，AI 版上线后本地版作为兜底保留） ---------- */

function diagPhaseOf(days){
  if(days == null) return null;
  return DIAG_PHASES.find(p => days >= p.min) || DIAG_PHASES[DIAG_PHASES.length-1];
}

function diagCapacity(d){
  const wdMin = Math.round((Math.max(0, Number(d.wdHours) || 0)) * 60);
  const weMin = Math.round((Math.max(0, Number(d.weHours) || 0)) * 60);
  const weekMin = wdMin * 5 + weMin * 2;
  return { wdMin, weMin, weekMin, avgMin: Math.round(weekMin/7) };
}

function diagBuildReport(d){
  const tg = (DATA.settings && DATA.settings.targets) || {};
  const cd = examCountdown();
  const days = cd.daysLeft;
  const phase = diagPhaseOf(days);
  const caps = diagCapacity(d);
  const gaps = {};
  DIAG_SUBS.forEach(([k]) => {
    const cur = d.bands ? d.bands[k] : null, want = Number(tg[k]);
    gaps[k] = (cur != null && want > 0) ? Math.round((want - cur) * 2) / 2 : null;
  });
  let maxGap = 0, maxSub = null;
  DIAG_SUBS.forEach(([k,lab]) => { if(gaps[k] != null && gaps[k] > maxGap){ maxGap = gaps[k]; maxSub = k; } });
  const maxLab = maxSub ? (DIAG_SUBS.find(x => x[0] === maxSub) || [])[1] : '';
  const targetsMissing = DIAG_SUBS.filter(([k]) => !(Number(tg[k]) > 0)).map(([,lab]) => lab);
  const bandsMissing = DIAG_SUBS.filter(([k]) => !d.bands || d.bands[k] == null).map(([,lab]) => lab);
  let needDays = 0;
  DIAG_SUBS.forEach(([k]) => { if(gaps[k] > 0) needDays = Math.max(needDays, Math.round(gaps[k]/0.5) * DIAG_RATE[k]); });
  /* 瓶颈科现实可达分（时间不够时用它说实话） */
  const reachable = {};
  if(days != null && maxSub){
    const cur = d.bands[maxSub] || 0;
    reachable[maxSub] = diagRoundHalf(Math.min(Number(tg[maxSub])||9, cur + Math.floor(days / DIAG_RATE[maxSub] * 2) / 2));
  }

  let verdict = { k:'unknown', text:'信息还不够，没法给你打包票。' };
  if(maxGap <= 0 && bandsMissing.length < 4 && DIAG_SUBS.some(([k]) => d.bands && d.bands[k] != null && Number(tg[k]) > 0 && d.bands[k] >= Number(tg[k]))){
    verdict = { k:'reached', text:'按现有成绩，你已经达到目标分了。接下来重点是稳住状态、熟悉考试流程，别手生。' };
  }else if(maxGap > 0){
    if(days == null){
      verdict = { k:'unknown', text:'缺口已经能看出来（' + maxLab + '差 ' + maxGap + ' 分），但你还没设考试日期，时间够不够没法判断——先去「我的」填上考试日期。' };
    }else if(days <= 2){
      verdict = { k:'no', text:'说实话：只剩 ' + days + ' 天，现在学新东西性价比极低，' + maxLab + '不可能在这几天提 ' + maxGap + ' 分。只做三件能保底的事：背单词 30 分钟、口语 Part 1 快答、写作模板默写。' };
    }else if(days <= 7 && maxGap >= 1){
      verdict = { k:'no', text:'说实话：' + days + ' 天内把' + maxLab + '从 ' + d.bands[maxSub] + ' 提到 ' + tg[maxSub] + '（+' + maxGap + '）基本不可能——雅思一次明显提分通常需要数百小时。别再铺新内容，这几天只做真题模考和保底三件事。' };
    }else{
      const longShot = d.bands[maxSub] <= 4.5 && Number(tg[maxSub]) >= 7;
      if(longShot && days < 180){
        verdict = { k:'no', text:'说实话：从 ' + d.bands[maxSub] + ' 分到 7.0 通常是 6 个月以上的工程，你只有 ' + days + ' 天。' + days + ' 天内' + maxLab + '现实可达约 ' + (reachable[maxSub]||'--') + ' 分。建议把这次考试当模考，同时报一场更晚的。' };
      }else if(days >= needDays * 1.25){
        verdict = { k:'yes', text:'时间够用：补上最大缺口（' + maxLab + ' +' + maxGap + '）约需 ' + needDays + ' 天，你有 ' + days + ' 天，还留得出复盘和模考的余量。' };
      }else if(days >= needDays * 0.7){
        verdict = { k:'tight', text:'时间偏紧：补' + maxLab + '的缺口约需 ' + needDays + ' 天，你有 ' + days + ' 天。时间必须集中投给' + maxLab + '；按现实节奏，' + days + ' 天' + maxLab + '大约能到 ' + (reachable[maxSub]||tg[maxSub]) + ' 分。' };
      }else{
        verdict = { k:'no', text:'说实话：时间不够。补' + maxLab + ' ' + maxGap + ' 分约需 ' + needDays + ' 天，你只有 ' + days + ' 天。' + days + ' 天内' + maxLab + '现实可达约 ' + (reachable[maxSub]||'--') + ' 分——要么调低目标，要么把这次当练兵、准备再考一次。' };
      }
    }
  }else if(bandsMissing.length === 4){
    verdict = { k:'unknown', text:'还没有任何现状成绩，先做一次模考，或填一个高考 / 四六级分数，结论会立刻具体起来。' };
  }

  const bullets = [];
  if(!cd.hasExam) bullets.push('你还没设置考试日期，时间策略没法倒排。去「我的」填好考试日期后重新诊断，结论会准很多。');
  if(targetsMissing.length) bullets.push('目标分没填全（缺：' + targetsMissing.join('、') + '），这些科目没算缺口。');
  if(bandsMissing.length) bullets.push(bandsMissing.join('、') + ' 没有成绩依据，计划只能按目标分倒推；建议先做一次对应科目的模考校准。');
  if(d.ref && DIAG_SUBS.some(([k]) => d.bandSrc && d.bandSrc[k] && d.bandSrc[k].s === 'ref')){
    const refName = (DIAG_REF_TABLE[d.ref.type] || {}).label || '校外成绩';
    bullets.push(refName + '与雅思的题型、评分差异很大，换算分只是保守起点，建议用一套雅思真题模考校准。');
    if(d.ref.type === 'cet4' && d.ref.score < 500) bullets.push('特别提醒：四级及格不等于雅思够用——四级 425 大约只对应雅思 4.5–5.0，而多数学校门槛是 5.5 / 6.0。');
  }
  if(gaps.writing >= 1) bullets.push('写作差 ' + gaps.writing + ' 分：写作是输出项，每 0.5 分通常要 4–6 周成篇练习加批改，考前几天突击没有用。');
  if(gaps.speaking >= 1) bullets.push('口语差 ' + gaps.speaking + ' 分：口语也是输出项，每 0.5 分约需 4–6 周持续开口，最后一周只能保流利度、提不了档。');
  if((gaps.listening > 0 || gaps.reading > 0) && (gaps.listening < 1.5 && gaps.reading < 1.5)) bullets.push('听读是输入项、提分最快（每 0.5 分约 2–3 周精练），时间紧时优先把时间投在这里。');
  if(gaps.listening >= 1.5 || gaps.reading >= 1.5) bullets.push('听读缺口不小：6.5 以下靠精练真题提分快，6.5 以上每一步都更慢，要留足时间。');
  if(caps.weekMin <= 0) bullets.push('你填的每周可学时间是 0——计划排不出来，至少给工作日或周末填一点时间。');
  else bullets.push('你一周约有 ' + (caps.weekMin/60).toFixed(1) + ' 小时可学（工作日 ' + (d.weHours!=null && d.wdHours!=null ? d.wdHours : '--') + ' 小时/天，周末 ' + d.weHours + ' 小时/天）。');
  if(phase) bullets.push(phase.desc);

  return { tg, cd, days, phase, caps, gaps, maxGap, maxSub, maxLab, needDays,
           targetsMissing, bandsMissing, verdict, bullets, reachable };
}

/* ---------- 问卷临时态 ---------- */

function diagDefaultForm(){
  const ex = diagExtractBands();
  const s = DATA.settings || {};
  const dH = Number(s.dailyGoalHours) > 0 ? Number(s.dailyGoalHours) : 1.5;
  return { identity:'other', slots:DIAG_IDENTITY.other.slots.slice(), wdHours:dH, weHours:4,
           ref:null, bands:ex.bands, src:ex.src };
}

function diagCloneForm(d){
  return { identity:d.identity || 'other', slots:(d.slots || []).slice(),
           wdHours:d.wdHours, weHours:d.weHours, ref:d.ref || null,
           bands:Object.assign({ listening:null, reading:null, writing:null, speaking:null }, d.bands || {}),
           src:Object.assign({ listening:null, reading:null, writing:null, speaking:null }, d.bandSrc || {}) };
}

function diagCollectForm(){
  const st = diagFormState; if(!st) return null;
  DIAG_SUBS.forEach(([k]) => {
    const el = document.getElementById('dgB_' + k);
    const old = parseFloat(el.getAttribute('data-old'));
    const v = parseFloat(el.value);
    if(v >= 0 && v <= 9){
      st.bands[k] = diagRoundHalf(v);
      // 没动过预填值 → 保留原来源。必须数值比较：data-old="6.0" 而 String(6)==="6"，字符串比会误判手改
      st.src[k] = (!isNaN(old) && Math.abs(v - old) < 1e-9) ? st.src[k] : { s:'manual' };
    }else{
      st.bands[k] = null; st.src[k] = null;   // 清空=她明确表示这科不评估
    }
  });
  const rt = document.getElementById('dgRefType').value;
  const rs = parseFloat(document.getElementById('dgRefScore').value);
  st.ref = (rt && rs > 0) ? { type:rt, score:rs } : null;
  if(st.ref){   // 换算只补仍为空的科目，不覆盖她填的雅思分
    const rb = diagRefBands(st.ref.type, st.ref.score);
    if(rb) DIAG_SUBS.forEach(([k]) => { if(st.bands[k] == null && rb[k] != null){ st.bands[k] = rb[k]; st.src[k] = { s:'ref' }; } });
  }
  st.identity = document.getElementById('dgIdentity').value || 'other';
  st.slots = DIAG_SLOTS.map(s => s.k).filter(k => {
    const el = document.getElementById('dgSlot_' + k); return el && el.checked;
  });
  const wd = parseFloat(document.getElementById('dgWdHours').value);
  const we = parseFloat(document.getElementById('dgWeHours').value);
  st.wdHours = (wd > 0) ? wd : 0;
  st.weHours = (we > 0) ? we : 0;
  return st;
}

function diagPersist(st){
  const d = { v:1, ts:Date.now(), identity:st.identity, slots:st.slots,
              wdHours:st.wdHours, weHours:st.weHours, ref:st.ref,
              bands:st.bands, bandSrc:st.src };
  DATA.settings.diagnosis = d;
  DATA.settings._fieldTs = DATA.settings._fieldTs || {};
  DATA.settings._fieldTs.diagnosis = Date.now();
  hubSave();
  return d;
}

/* ---------- 入口卡 / 概览（规划 Tab 内） ---------- */

function diagBandTxt(v){ return v == null ? '<span class="dg-na">未评估</span>' : v.toFixed(1); }

function renderDiagEntry(){
  const root = document.getElementById('diagRoot'); if(!root) return;
  const d = DATA.settings && DATA.settings.diagnosis;
  if(!d){
    root.innerHTML =
      '<div class="card dg-hero">'
      + '<div class="dg-hero-ic">🎯</div>'
      + '<h2>备考诊断</h2>'
      + '<p class="dg-hero-p">3 分钟，看清你现在的水平离目标多远、时间够不够、该把力气花在哪科。</p>'
      + '<ul class="dg-hero-steps">'
      + '<li>自动读取你在站内的模考与练习成绩，也可以手填，或用高考 / 四六级成绩换算</li>'
      + '<li>告诉我们你一周哪些时段有空</li>'
      + '<li>得到一份说实话的诊断报告——目标不切实际会直接告诉你，不哄人</li>'
      + '</ul>'
      + '<button type="button" id="dgStart" class="btn-primary dg-block-btn">开始诊断</button>'
      + '<button type="button" id="dgSkip" class="dg-text-btn">跳过，直接用默认</button>'
      + '</div>';
    document.getElementById('dgStart').addEventListener('click', openDiagForm);
    document.getElementById('dgSkip').addEventListener('click', diagQuickDefault);
    return;
  }
  const r = diagBuildReport(d);
  const chips = DIAG_SUBS.map(([k,lab]) => {
    const cur = d.bands[k], t = Number(r.tg[k]);
    const gap = r.gaps[k];
    return '<div class="dg-chip"><span class="dg-chip-lab">' + lab + '</span>'
      + '<span class="dg-chip-bands">' + diagBandTxt(cur) + ' → ' + (t > 0 ? t.toFixed(1) : '<span class="dg-na">--</span>') + '</span>'
      + (gap > 0 ? '<span class="dg-chip-gap">差 ' + gap.toFixed(1) + '</span>' : (cur != null && t > 0 ? '<span class="dg-chip-ok">已达线</span>' : ''))
      + '</div>';
  }).join('');
  root.innerHTML =
    '<div class="card dg-summary">'
    + '<div class="dg-sum-head"><div><div class="dg-sum-title">备考诊断'
    + (d.ai ? '<span class="dg-sum-ai">含 AI 评定</span>' : '') + '</div>'
    + '<div class="dg-sum-sub">' + (r.phase ? escapeHtml(r.phase.label) + ' · ' : '') + (r.cd.hasExam ? '距考试 ' + r.days + ' 天' : '未设置考试日期')
    + ' · 每周约 ' + (r.caps.weekMin/60).toFixed(1) + ' 小时</div></div>'
    + '<button type="button" id="dgRedo" class="dg-text-btn">重新诊断</button></div>'
    + '<div class="dg-verdict dg-v-' + r.verdict.k + '">' + escapeHtml(r.verdict.text) + '</div>'
    + '<div class="dg-chips">' + chips + '</div>'
    + '<button type="button" id="dgView" class="btn-primary dg-block-btn">查看完整诊断报告</button>'
    + '</div>';
  document.getElementById('dgRedo').addEventListener('click', openDiagForm);
  document.getElementById('dgView').addEventListener('click', () => openDiagReport());
}

/* 「跳过，直接用默认」：提取成绩 + other 模板 + 默认时长，直接出报告（什么都没有也能出） */
function diagQuickDefault(){
  diagFormState = diagDefaultForm();
  const d = diagPersist(diagFormState);
  renderDiagEntry();
  openDiagReport(d, 'loading');
}

/* ---------- 全屏覆盖层（问卷 / 报告两屏） ---------- */

function closeDiagOverlay(){
  const ov = document.getElementById('diagOverlay');
  if(!ov) return;
  ov.hidden = true;
  ov.innerHTML = '';
  diagFormState = null;
  /* AI 请求可能在报告打开期间刚回来（只刷了 #dgAi）；关闭时把入口卡的「含 AI 评定」标等状态补齐 */
  if(document.getElementById('diagRoot')) renderDiagEntry();
}

function openDiagForm(){
  diagFormState = (DATA.settings && DATA.settings.diagnosis)
    ? diagCloneForm(DATA.settings.diagnosis) : diagDefaultForm();
  renderDiagForm();
}

function renderDiagForm(){
  const st = diagFormState;
  const ov = document.getElementById('diagOverlay'); if(!ov) return;
  const tg = (DATA.settings && DATA.settings.targets) || {};
  const cd = examCountdown();
  const slotChk = (g) => DIAG_SLOTS.filter(s => s.group === g).map(s =>
    '<label class="dg-slot" for="dgSlot_' + s.k + '"><input type="checkbox" id="dgSlot_' + s.k + '"'
    + (st.slots.indexOf(s.k) >= 0 ? ' checked' : '') + '><span>' + s.label + '</span></label>').join('');
  const bandInput = (k, lab) => {
    const v = st.bands[k], sr = st.src[k];
    return '<div class="dg-band-field"><label for="dgB_' + k + '">' + lab + '</label>'
      + '<input type="number" id="dgB_' + k + '" class="dg-num" data-old="' + (v == null ? '' : v.toFixed(1)) + '"'
      + ' value="' + (v == null ? '' : v.toFixed(1)) + '" min="0" max="9" step="0.5" inputmode="decimal" placeholder="--">'
      + '<span class="dg-band-src">' + (sr ? escapeHtml(DIAG_SRC_LABEL[sr.s] || sr.s) + (sr.date ? ' ' + sr.date.slice(5) : '') : '可留空') + '</span></div>';
  };
  const identOpts = Object.keys(DIAG_IDENTITY).map(k =>
    '<option value="' + k + '"' + (st.identity === k ? ' selected' : '') + '>' + DIAG_IDENTITY[k].label + '</option>').join('');
  const refOpts = [['','没考过雅思，也不填校外成绩'],['gaokao','高考英语（满分 150）'],['cet4','大学英语四级'],['cet6','大学英语六级']]
    .map(o => '<option value="' + o[0] + '"' + ((st.ref && st.ref.type) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
  const autoFound = DIAG_SUBS.some(([k]) => st.bands[k] != null && st.src[k] && st.src[k].s !== 'manual');
  ov.innerHTML =
    '<div class="dg-page">'
    + '<div class="dg-top"><strong>备考诊断</strong><button type="button" id="dgClose" class="dg-x" aria-label="关闭">×</button></div>'
    + '<div class="dg-body">'
    + (!cd.hasExam ? '<div class="dg-warn">还没设置考试日期，时间策略没法倒排。<a href="settings.html">去设置考试日期</a>（设置完回到本页重新打开即可）</div>' : '')
    + '<section class="dg-sec"><h3>① 你现在的水平</h3>'
    + (autoFound ? '<p class="dg-hint">已自动读取你在站内的成绩（可直接修改，数字就是你的真实估计）：</p>'
                : '<p class="dg-hint">没找到你的模考成绩。可以先做模考，或现在手填，也可以用下面的高考 / 四六级成绩换算。</p>')
    + '<div class="dg-band-grid">' + DIAG_SUBS.map(([k,lab]) => bandInput(k, lab)).join('') + '</div>'
    + '<div class="dg-ref-row"><select id="dgRefType">' + refOpts + '</select>'
    + '<input type="number" id="dgRefScore" class="dg-num" value="' + (st.ref ? st.ref.score : '') + '" min="0" inputmode="numeric" placeholder="填分数，如 480 / 120"></div>'
    + '<p class="dg-hint">校外成绩只用来补你留空的科目，且按保守口径换算；以雅思真题模考分为最准。</p>'
    + '</section>'
    + '<section class="dg-sec"><h3>② 你的目标与考试</h3>'
    + '<div class="dg-readonly-row"><span>目标分</span><span>'
    + DIAG_SUBS.map(([k,lab]) => lab + ' ' + (Number(tg[k]) > 0 ? tg[k] : '--')).join(' · ')
    + (Number(tg.overall) > 0 ? ' · 总分 ' + tg.overall : '') + '</span>'
    + '<a href="settings.html">修改</a></div>'
    + '<div class="dg-readonly-row"><span>考试日期</span><span>' + (cd.hasExam ? cd.raw + '（' + cd.label + '）' : '未设置') + '</span>'
    + '<a href="settings.html">修改</a></div>'
    + '</section>'
    + '<section class="dg-sec"><h3>③ 你一周哪些时段有空</h3>'
    + '<div class="dg-field-row"><label for="dgIdentity">你的身份</label><select id="dgIdentity">' + identOpts + '</select></div>'
    + '<p class="dg-hint">勾选通常能学习的时段（选身份会先帮你勾一套，可随意改）：</p>'
    + '<div class="dg-slots"><div class="dg-slot-group"><span class="dg-slot-gl">工作日</span>' + slotChk('wd') + '</div>'
    + '<div class="dg-slot-group"><span class="dg-slot-gl">周末</span>' + slotChk('we') + '</div></div>'
    + '<div class="dg-field-row"><label for="dgWdHours">工作日每天能学</label>'
    + '<input type="number" id="dgWdHours" class="dg-num dg-hours" value="' + st.wdHours + '" min="0" step="0.5" inputmode="decimal"> 小时</div>'
    + '<div class="dg-field-row"><label for="dgWeHours">周末每天能学</label>'
    + '<input type="number" id="dgWeHours" class="dg-num dg-hours" value="' + st.weHours + '" min="0" step="0.5" inputmode="decimal"> 小时</div>'
    + '</section>'
    + '</div>'
    + '<div class="dg-foot"><button type="button" id="dgGen" class="btn-primary dg-block-btn">生成我的诊断报告（免费）</button>'
    + '<button type="button" id="dgSkip2" class="dg-text-btn">全部跳过，直接用默认</button></div>'
    + '</div>';
  ov.hidden = false;
  document.getElementById('dgClose').addEventListener('click', closeDiagOverlay);
  document.getElementById('dgGen').addEventListener('click', () => {
    const st2 = diagCollectForm();
    const d = diagPersist(st2);
    renderDiagEntry();
    openDiagReport(d, 'loading');
  });
  document.getElementById('dgSkip2').addEventListener('click', () => {
    diagFormState = diagDefaultForm();
    const d = diagPersist(diagFormState);
    renderDiagEntry();
    openDiagReport(d, 'loading');
  });
  document.getElementById('dgIdentity').addEventListener('change', e => {
    const tpl = DIAG_IDENTITY[e.target.value] || DIAG_IDENTITY.other;
    DIAG_SLOTS.forEach(s => { const el = document.getElementById('dgSlot_' + s.k); if(el) el.checked = tpl.slots.indexOf(s.k) >= 0; });
  });
  /* 勾周末时段时给周末时长一个顺手默认（2h/段）；她手动改过数字后不再覆盖 */
  let weTouched = false;
  const weInput = document.getElementById('dgWeHours');
  weInput.addEventListener('input', () => { weTouched = true; });
  DIAG_SLOTS.filter(s => s.group === 'we').forEach(s => {
    document.getElementById('dgSlot_' + s.k).addEventListener('change', () => {
      if(weTouched) return;
      const n = DIAG_SLOTS.filter(x => x.group === 'we' && document.getElementById('dgSlot_' + x.k).checked).length;
      if(n > 0) weInput.value = n * 2;
    });
  });
  ov.scrollTop = 0;
}

/* ---------- 报告屏 ---------- */

function openDiagReport(d, aiMode){
  d = d || (DATA.settings && DATA.settings.diagnosis);
  const ov = document.getElementById('diagOverlay'); if(!ov || !d) return;
  const r = diagBuildReport(d);
  const rows = DIAG_SUBS.map(([k,lab]) => {
    const cur = d.bands[k], t = Number(r.tg[k]), gap = r.gaps[k], sr = d.bandSrc[k];
    return '<tr><td>' + lab + '</td><td>' + (cur == null ? '--' : cur.toFixed(1))
      + (sr ? '<div class="dg-rsrc">' + escapeHtml(DIAG_SRC_LABEL[sr.s] || sr.s) + (sr.date ? ' · ' + sr.date : '') + '</div>' : '') + '</td>'
      + '<td>' + (t > 0 ? t.toFixed(1) : '--') + '</td>'
      + '<td>' + (gap == null ? '--' : (gap > 0 ? '差 ' + gap.toFixed(1) : '已达线')) + '</td></tr>';
  }).join('');
  ov.innerHTML =
    '<div class="dg-page">'
    + '<div class="dg-top"><strong>诊断报告</strong><button type="button" id="dgClose" class="dg-x" aria-label="关闭">×</button></div>'
    + '<div class="dg-body">'
    + '<div class="dg-verdict dg-v-' + r.verdict.k + ' dg-verdict-lg">' + escapeHtml(r.verdict.text) + '</div>'
    + '<div class="dg-cards">'
    + '<div class="dg-mini card"><div class="dg-mini-k">距考试</div><div class="dg-mini-v">' + (r.cd.hasExam ? r.days + ' 天' : '--') + '</div>'
    + '<div class="dg-mini-s">' + (r.phase ? escapeHtml(r.phase.label) : '先设考试日期') + '</div></div>'
    + '<div class="dg-mini card"><div class="dg-mini-k">每周可学</div><div class="dg-mini-v">' + (r.caps.weekMin/60).toFixed(1) + 'h</div>'
    + '<div class="dg-mini-s">工作日 ' + d.wdHours + 'h · 周末 ' + d.weHours + 'h</div></div>'
    + '<div class="dg-mini card"><div class="dg-mini-k">最大缺口</div><div class="dg-mini-v">' + (r.maxSub ? r.maxLab + ' +' + r.maxGap.toFixed(1) : '--') + '</div>'
    + '<div class="dg-mini-s">' + (r.needDays > 0 ? '约需 ' + r.needDays + ' 天' : '保持题感即可') + '</div></div>'
    + '</div>'
    + '<section class="dg-sec"><h3>四科明细</h3>'
    + '<table class="dg-table"><thead><tr><th>科目</th><th>现状</th><th>目标</th><th>缺口</th></tr></thead><tbody>'
    + rows + '</tbody></table></section>'
    + '<section class="dg-sec"><h3>给你的实话</h3><ul class="dg-bullets">'
    + r.bullets.map(b => '<li>' + escapeHtml(b).replace(
        '去「我的」填好考试日期后重新诊断，结论会准很多。',
        '<a href="settings.html">去「我的」填考试日期</a>，填完重新诊断结论会准很多。') + '</li>').join('')
    + '</ul></section>'
    /* AI 个性化评定：本地诚实底座之上的免费增量，五态：stored/loading/idle/error/login */
    + '<section class="dg-sec dg-ai" id="dgAi" aria-live="polite"></section>'
    + '</div>'
    + '<div class="dg-foot"><button type="button" id="dgRedo2" class="btn-primary dg-block-btn">重新诊断 / 修改答案</button></div>'
    + '</div>';
  ov.hidden = false;
  document.getElementById('dgClose').addEventListener('click', closeDiagOverlay);
  document.getElementById('dgRedo2').addEventListener('click', openDiagForm);
  /* aiMode：'loading'=刚提交自动请求；'stored'=已有评定直接展示；'idle'=没评过/上次没成（给手动入口）。
     不传 aiMode（从概览重进）时现读 d.ai 自动推断——概览卡可能持有落库前的旧 d 闭包，不能信快照。 */
  if(aiMode === 'loading'){
    renderDiagAiBox('loading');
    diagRequestAi({ bands:d.bands, src:d.bandSrc });
  }else if(aiMode === 'stored' || (!aiMode && d.ai)){
    renderDiagAiBox('stored');
  }else{
    renderDiagAiBox('idle');
  }
  ov.scrollTop = 0;
}

/* =====================================================================================
   AI 个性化评定（第三十三批 commit2，新 callRelay key 'diag'）
   定位：本地诚实报告是永远可用的底座（verdict/缺口由我们自己的代码保证，AI 改不动它）；
   AI 只做增量——逐科评定依据 + 个性化建议。任何失败都不影响底座、不落半截结果。
   后端 functions/api/ai.js：diag 豁免每周 5 次兜底（10/2「诊断免费」拍板），仍需登录、
   仍受全站日闸/IP/分钟风控。
   ===================================================================================== */

/* 组装 diag 请求：system 锁口径，user 喂问卷上下文（含本地结论，供 AI 解释但不许软化） */
function diagAiMessages(st, r){
  const tg = {};
  DIAG_SUBS.forEach(([k]) => { tg[k] = Number(r.tg[k]) > 0 ? Number(r.tg[k]) : null; });
  if(Number(r.tg.overall) > 0) tg.overall = Number(r.tg.overall);
  const payload = {
    now: todayKey(),
    exam: r.cd.hasExam ? { date:r.cd.raw, daysLeft:r.days } : null,
    target: tg,
    bands: DIAG_SUBS.map(([k]) => ({ sub:k, band:(st.bands[k] == null ? null : st.bands[k]),
      source:(st.src[k] ? st.src[k].s : null) })),
    refExam: st.ref || null,
    weeklyCapacity: { weekdayHoursPerDay:st.wdHours, weekendHoursPerDay:st.weHours, totalMinutesPerWeek:r.caps.weekMin },
    identity: st.identity,
    localConclusion: { key:r.verdict.k, needDays:r.needDays, text:r.verdict.text }
  };
  return [
    { role:'system', content:DIAG_AI_SYSTEM },
    { role:'user', content:'请按约定的 JSON 格式评定以下考生：\n' + JSON.stringify(payload) }
  ];
}

/* 纯护栏：AI JSON → 可落库 d.ai；关键字段不合规返回 null（调用方保留本地底座，不采半截）。
   实证科目（mock/考试/批改/练习）强制沿用她的真实分；AI 分值只对 ref/manual/空 科目生效。 */
function diagApplyAi(st, ai){
  if(!ai || typeof ai !== 'object' || Array.isArray(ai)) return null;
  if(!Array.isArray(ai.bullets)) return null;
  const bullets = ai.bullets.map(x => (typeof x === 'string') ? x.trim() : '').filter(Boolean).slice(0, 8);
  if(!bullets.length) return null;
  if(bullets.some(x => x.length > 120)) return null;   // 冗长失控整份不采（比悄悄截断诚实，调用方可重试）
  const verdict = (typeof ai.verdict === 'string') ? ai.verdict.trim().slice(0, 500) : '';
  if(!verdict) return null;
  const clampBand = v => { const n = diagRoundHalf(v); return (n != null && n >= 3 && n <= 9) ? n : null; };
  const bands = {}, bandNotes = {};
  DIAG_SUBS.forEach(([k]) => {
    const isReal = !!(st.src[k] && DIAG_AI_REAL_SRC[st.src[k].s] && st.bands[k] != null);
    if(isReal) bands[k] = st.bands[k];   // 实证分：无视 AI 给值
    else bands[k] = (ai.bands && typeof ai.bands === 'object') ? clampBand(ai.bands[k]) : null;
    if(ai.bandNotes && typeof ai.bandNotes === 'object' && typeof ai.bandNotes[k] === 'string'){
      const note = ai.bandNotes[k].trim();
      if(note) bandNotes[k] = note.slice(0, 80);
    }
  });
  const focus = Array.isArray(ai.focus)
    ? ai.focus.map(x => String(x)).filter(k => DIAG_SUBS.some(([x2]) => x2 === k))
          .filter((k, i, a) => a.indexOf(k) === i).slice(0, 4)
    : [];
  const refNote = (typeof ai.refNote === 'string') ? ai.refNote.trim().slice(0, 200) : '';
  return { ts:Date.now(), bands, bandNotes, verdict, bullets, focus, refNote };
}

function diagFmtTs(ts){
  const x = new Date(ts), p = n => String(n).padStart(2, '0');
  return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
}

/* 请求 AI 评定。落库与 UI 解耦：成功必落 d.ai（覆盖层关了也不浪费），DOM 前一律先查元素。 */
async function diagRequestAi(st){
  try{
    const d0 = DATA.settings && DATA.settings.diagnosis;
    if(!d0) return;
    const r = diagBuildReport(d0);
    const raw = await callRelay('diag', diagAiMessages(st, r), 0.3, { max_tokens:2000, json_mode:true });
    const ai = diagApplyAi(st, aiJson(raw));
    if(!ai){
      const box0 = document.getElementById('dgAi'); if(box0) renderDiagAiBox('error', 'bad');
      return;
    }
    const d = DATA.settings && DATA.settings.diagnosis;
    if(!d) return;
    DATA.settings.diagnosis = Object.assign({}, d, { ai });
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs.diagnosis = Date.now();
    hubSave();
    if(document.getElementById('dgAi')) renderDiagAiBox('stored');
    else renderDiagEntry();   // 覆盖层已关：至少把入口卡的「含 AI 评定」刷出来
  }catch(e){
    if(!document.getElementById('dgAi')) return;   // 她已离开：静默，下次打开给手动重试
    renderDiagAiBox('error', (e && e.code === 'AUTH_REQUIRED') ? 'login' : 'fail');
  }
}

/* #dgAi 五态渲染：loading / stored / idle / error(fail|bad|login)。只刷本 section。 */
function renderDiagAiBox(mode, sub){
  const box = document.getElementById('dgAi'); if(!box) return;
  const d = DATA.settings && DATA.settings.diagnosis;
  const head = '<div class="dg-ai-head"><span class="dg-ai-badge">AI</span><strong>AI 个性化评定</strong>'
    + '<span class="dg-ai-free">免费 · 不占每周额度</span></div>';
  const kick = (st) => { renderDiagAiBox('loading'); diagRequestAi(st); };
  if(mode === 'loading'){
    box.innerHTML = head + '<div class="dg-ai-loading"><span class="dg-spinner" aria-hidden="true"></span>'
      + '正在结合你的成绩与备考时间做评定，通常 10 秒左右…</div>';
    return;
  }
  if(mode === 'stored' && d && d.ai){
    const ai = d.ai;
    const bandCards = DIAG_SUBS.map(([k, lab]) => {
      const v = ai.bands[k], real = !!(d.bandSrc[k] && DIAG_AI_REAL_SRC[d.bandSrc[k].s] && d.bands[k] != null);
      return '<div class="dg-ai-band"><span class="dg-ai-band-lab">' + lab + (real ? '<i class="dg-ai-tag">沿用你的'
        + escapeHtml(DIAG_SRC_LABEL[d.bandSrc[k].s] || d.bandSrc[k].s) + '</i>' : '') + '</span>'
        + '<b>' + (v == null ? '--' : v.toFixed(1)) + '</b>'
        + (ai.bandNotes[k] ? '<span class="dg-ai-band-note">' + escapeHtml(ai.bandNotes[k]) + '</span>' : '') + '</div>';
    }).join('');
    const focus = ai.focus.length
      ? '<div class="dg-ai-focus">' + ai.focus.map(k =>
          '<span class="dg-ai-fchip">' + escapeHtml((DIAG_SUBS.find(x => x[0] === k) || [,''])[1]) + ' 优先</span>').join('') + '</div>' : '';
    box.innerHTML = head
      + '<p class="dg-ai-verdict">' + escapeHtml(ai.verdict) + '</p>'
      + focus
      + '<div class="dg-ai-bands">' + bandCards + '</div>'
      + '<ul class="dg-ai-bullets">' + ai.bullets.map(b => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul>'
      + (ai.refNote ? '<div class="dg-ai-ref">' + escapeHtml(ai.refNote) + '</div>' : '')
      + '<div class="dg-ai-ts">AI 评定时间 ' + diagFmtTs(ai.ts) + '（结论仅供参考，最终以你的雅思真题模考分为准）</div>';
    return;
  }
  if(mode === 'error' && sub === 'login'){
    box.innerHTML = head + '<div class="dg-ai-msg">登录后可以免费获取 AI 个性化评定（不占每周免费 AI 额度）。</div>'
      + '<a class="btn-primary dg-block-btn" href="login.html" style="text-decoration:none;text-align:center">去登录 / 注册</a>';
    return;
  }
  if(mode === 'error'){
    const msg = sub === 'bad' ? 'AI 这次返回的内容不完整，换个时间再试一次。'
      : 'AI 评定暂时没拿到（网络或服务波动）。上面的本地评定不受影响，可以先用。';
    box.innerHTML = head + '<div class="dg-ai-msg">' + msg + '</div>'
      + '<button type="button" class="dg-text-btn" id="dgAiRetry">重试 AI 评定</button>';
    document.getElementById('dgAiRetry').addEventListener('click', () =>
      kick(d ? { bands:d.bands, src:d.bandSrc } : { bands:{}, src:{} }));
    return;
  }
  /* idle：未评定（含上次失败后重进） */
  box.innerHTML = head + '<div class="dg-ai-msg">想让 AI 结合你的具体成绩、考试日期和每周可学时间，给一份个性化的水平评定与备考重心吗？免费，一次约 10 秒。</div>'
    + '<button type="button" class="btn-primary dg-block-btn" id="dgAiGo">免费获取 AI 评定</button>';
  document.getElementById('dgAiGo').addEventListener('click', () =>
    kick(d ? { bands:d.bands, src:d.bandSrc } : { bands:{}, src:{} }));
}
