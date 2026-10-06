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
/* 来源标签 / 每 0.5 分保守需时（天，瓶颈取各科最大——官方口径「明显提分通常需数月/数百小时」，宁紧勿松）。
   ⭐ 10/2 commit3 修：这两个 var 原在 700 行附近（ready 注册之后），defer 执行期 readyState='interactive'，
   common.js ready(fn) 会同步执行 fn，首刷时 ready 回调内 diagBuildReport 读到的是提升后未赋值的
   undefined →「已诊断且有缺口的用户刷新即崩」。所有顶层 var 必须在 ready() 之前赋值（TDZ/提升铁律）。 */
var DIAG_SRC_LABEL = { mock:'模考记录', exam:'考试成绩', writing:'写作批改', practice:'口语练习', ref:'成绩换算', manual:'手动填写' };
var DIAG_RATE = { listening:18, reading:18, writing:35, speaking:35 };
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
'你是一位雅思写作与口语主讲老师，同时是备考规划师 —— 你带过大量 5.5 冲 6.5、6 冲 7 的学生。\n'
+ '你的判断标准是「考官怎么给分」，不是「怎么让考生开心」。像老师备课那样：先算差距，再排投入次序。\n'
+ '只输出一个 JSON 对象，不要输出 JSON 以外的任何文字，也不要 markdown 代码围栏。\n'
+ '\n'
+ '【第一步 · 先算差距，再排优先级（顺序不许颠倒）】\n'
+ '1) 对每一科算 gap = 目标分 − 现状分（按 0.5 步进）。\n'
+ '2) **只有 gap ≥ 0.5 的科目才允许出现在 focus（优先清单）里。**\n'
+ '   已达标的科目（gap < 0.5）**绝对不许**写进 focus —— 给一个已达标的科目标「优先」在专业上说不通，\n'
+ '   等于告诉她「再往已经够用的科目上砸时间」，这是错误建议。已达标科目最多在 bullets 里出现一次，\n'
+ '   作为「保持现状即可、别加码」的提醒。\n'
+ '3) 四科全部达标时，focus 给空数组 []。\n'
+ '4) focus 内部按「提分性价比 = gap ÷ 需要的有效投入」从高到低排：\n'
+ '   · 听力 / 阅读：靠技巧与刷题就能见效，提分最快；但 6.5 以上空间陡增、成本高，别许诺速成。\n'
+ '   · 写作 / 口语：判分主观、无法速成，只能靠持续输出 + 被纠正，投入大、见效慢。\n'
+ '   · 距考 ≤ 14 天：只保「最容易拿到的那一科」，别把时间押在最贵的一科上。\n'
+ '\n'
+ '【第二步 · 换算基准（不得凭空夸大或贬低）】\n'
+ '高考英语 120/150 → 听力 5.0-5.5、阅读 5.5、口语 5.0、写作 5.0\n'
+ '高考英语 130/150 → 听力 5.5-6.0、阅读 6.0、口语 5.5、写作 5.5\n'
+ '高考英语 140+/150 → 听力 6.0+、阅读 6.5+、口语 6.0、写作 6.0\n'
+ 'CET-4 425 及格线 → 听力 4.5-5.0（注意：及格≠够用，四级 425 考雅思通常只有 4.5）\n'
+ 'CET-4 500+ → 听力 5.5、阅读 6.0\n'
+ 'CET-4 550+ → 听力 6.0、阅读 6.5\n'
+ 'CET-6 550+ → 听力 6.5、阅读 7.0、口语 6.0、写作 6.0\n'
+ '六级高分对雅思帮助有限：雅思口语写作的判分与四六级体系不同，必须说明这一点。\n'
+ '\n'
+ '【第三步 · 诚实底线（老师该说的话）】\n'
+ '- 四级及格线以上≠雅思 5.5，必须直说差距（例：这种情况听力大概 4.5-5.0，差距主要在词汇量）。\n'
+ '- 提分难度必须说清：听力阅读提分快但高分段空间小；写作口语无法速成，只能靠持续稳定输出。\n'
+ '- 目标 7.0 而现状 4.5，必须明确说「需要 6 个月以上，不是短期能达成的」，不许迎合。\n'
+ '- 距考 ≤ 14 天：必须写明「这个目标现在来不及」，然后给**保底动作**（背单词维持词频、口语 Part 1 快答保流利度、\n'
+ '  写作模板默写作底），不许出现「再冲一冲」「加强练习」这类空话。\n'
+ '- 输入里 source 为 mock/exam/writing/practice 的分数是考生的雅思实证成绩，必须原样沿用，不许改动、压低或抬高；\n'
+ '  你只对 source 为 ref（校外成绩换算）、manual（手填）或 null 的科目给估计。\n'
+ '\n'
+ '【第四步 · weekly（每周时间分配）】\n'
+ '- 只给**未达标**的科目分时间；已达标科目不占时间。\n'
+ '- hours 为每周小时数（0.5 步进，0.5–20），所有 hours 之和不得超过输入里的每周总可用小时。\n'
+ '- why ≤ 40 字，说清「为什么这一科拿这个时间」（例：口语提分最慢，但你口语离达标最近）。\n'
+ '\n'
+ '【第五步 · bullets 规格（省额度 = 一次说清，不许注水）】\n'
+ '- 4-6 条，每条 ≤ 60 字，格式固定为「做什么 · 每周多少量 · 怎么算完成」。\n'
+ '- 每条要能今天就开始；禁止「多练」「保持语感」「坚持」「加强练习」这类空话。\n'
+ '- 按对提分的贡献从大到小排；已达标科目最多一条「保持」提醒。\n'
+ '\n'
+ '【输出 JSON 格式（只输出这个对象）】\n'
+ '{\n'
+ '  "bands": {"listening": 数字或 null, "reading": 数字或 null, "writing": 数字或 null, "speaking": 数字或 null},\n'
+ '  "bandNotes": {"listening": "给这个分数的一句依据", "reading": "...", "writing": "...", "speaking": "..."},\n'
+ '  "verdict": "3-4 句老师口吻的总评：现状离目标多远、时间够不够、最该做什么。必须诚实，不许哄人。",\n'
+ '  "focus": ["只放未达标科目（gap≥0.5），按性价比从高到低；全达标给空数组"],\n'
+ '  "weekly": [{"sub": "科目 key", "hours": 数字, "why": "为什么给这个时间"}],\n'
+ '  "bullets": ["4-6 条：做什么 · 每周多少量 · 怎么算完成"],\n'
+ '  "refNote": "关于校外成绩换算可信度的一句说明；没有校外成绩给空字符串"\n'
+ '}\n'
+ '分数只允许 0.5 步进、范围 3.0-9.0；没有依据的科目给 null，不许编造。';


/* ══════════════════════════════════════════════════════════════════════════════
   会员专属 · 深度版诊断（10/6 10:50 她拍板）
   ① 免费版**全部改成会员** —— 非会员只保留本地诚实底座（不调 AI）。
   ② 深度版三块：老师评语 / 分项诊断 / 科目级处方 / 阶段计划+通过线。
   ③ 接站内真实数据：我另查了 DATA 的实际结构（她原本以为「题库没内置所以做不了」）——
      听力 mockRecords.parts = Section 1-4 对错；阅读 = Passage 1-3；写作 writingScores.result.breakdown
      = TR/CC/LR/GRA；口语 mockRecords.parts = P1/P2/P3 × FC/LR/GRA。
      → **Part/Section 级诊断本版就做**（她 10:52 拍板纳入）；
        **考点级**（哪道题、哪种题型丢分）要有题目本体 + 逐题作答明细 → 已列待办。
   ⚠️ 诚实铁律（10/6 定）：AI 只能「解释 evidence 里已有的数字」，**不许自己编分数或 Section 号** ——
      护栏会把不在 evidence 里的 label 全部丢弃。宁可少说，不许编。 */
var DIAG_PRO_SYSTEM =
'你是一位雅思写作与口语主讲老师，同时是备考规划师 —— 你带过大量 5.5 冲 6.5、6 冲 7 的学生。\n'
+ '你的判断标准是「考官怎么给分」，不是「怎么让考生开心」。像老师备课那样：先算差距，再排投入次序。\n'
+ '只输出一个 JSON 对象，不要输出 JSON 以外的任何文字，也不要 markdown 代码围栏。\n'
+ '\n'
+ '【铁律 · 只解释，不编造】\n'
+ '输入里的 evidence 是系统从考生站内真实记录里取出来的原始数据。\n'
+ '- **只允许引用 evidence 里真实存在的数字与名称**（分数、对错数、Section/Passage/P1-P3 标签、日期）。\n'
+ '- **绝对不许自己编分数、不许编 Section/Passage/Part 名称、不许编「她错了哪道题」。**\n'
+ '- evidence 里某科没有数据 → parts 里就不给这一科；在 verdict 里用一句话说明「这科没有可依据的记录，先做一次模考」。\n'
+ '- 输入里 source 为 mock/exam/writing/practice 的分数是雅思实证成绩，必须原样沿用；你只对 ref（校外换算）、manual（手填）或 null 的科目给估计。\n'
+ '\n'
+ '【第一步 · 先算差距，再排优先级】\n'
+ '1) gap = 目标分 − 现状分（0.5 步进）。\n'
+ '2) **只有 gap ≥ 0.5 的科目才允许进 focus。**已达标科目绝对不许进 —— 给已达标的科目标「优先」在专业上说不通。\n'
+ '3) 四科全部达标时 focus 给空数组 []。\n'
+ '4) focus 内按「提分性价比 = gap ÷ 需要的有效投入」从高到低：听力/阅读靠技巧见效最快但高分段陡增；\n'
+ '   写作/口语判分主观、无法速成；距考 ≤ 14 天只保最容易拿到的那一科。\n'
+ '\n'
+ '【第二步 · 换算基准（校外成绩才用，不得凭空夸大或贬低）】\n'
+ '高考英语 120/150 → 听力 5.0-5.5、阅读 5.5、口语 5.0、写作 5.0\n'
+ '高考英语 130/150 → 听力 5.5-6.0、阅读 6.0、口语 5.5、写作 5.5\n'
+ '高考英语 140+/150 → 听力 6.0+、阅读 6.5+、口语 6.0、写作 6.0\n'
+ 'CET-4 425 及格线 → 听力 4.5-5.0（及格≠够用）；CET-4 500+ → 听力 5.5、阅读 6.0；CET-4 550+ → 听力 6.0、阅读 6.5\n'
+ 'CET-6 550+ → 听力 6.5、阅读 7.0、口语 6.0、写作 6.0；六级高分对雅思帮助有限（判分体系不同），必须说明。\n'
+ '\n'
+ '【第三步 · 诚实底线】\n'
+ '- 提分难度必须说清：听力阅读提分快但高分段空间小；写作口语无法速成。\n'
+ '- 目标 7.0 而现状 4.5，必须说「需要 6 个月以上」，不许迎合。\n'
+ '- 距考 ≤ 14 天：必须写明「这个目标现在来不及」，然后给**保底动作**，不许出现「再冲一冲」「加强练习」这类空话。\n'
+ '\n'
+ '【第四步 · verdict 老师评语】\n'
+ '- 一整段话（3-5 句、≤300 字），像真实老师写在成绩单末尾的评语，不要条目化、不要 markdown 列表。\n'
+ '- 结构：先说她的问题本质是什么 → 再说最该做的一件事 → 最后一句给心态（考前几天要给现实但不打击）。\n'
+ '- 出现「数据不足」的科目要在这里点明，不要假装有依据。\n'
+ '\n'
+ '【第五步 · parts 分项诊断（只用 evidence 里真实存在的标签）】\n'
+ '- 听力：逐 Section（label/correct/total）；阅读：逐 Passage；口语：逐 P1/P2/P3（可带 FC/LR/GRA）；写作：TR/CC/LR/GRA。\n'
+ '- 每项 note ≤ 40 字，必须基于它自己的 correct/total 或维度分说话（例：Section 3 正确率 6/10，是全卷最弱一节）。\n'
+ '- 不要评价 evidence 里没有的维度。\n'
+ '\n'
+ '【第六步 · prescriptions 科目级处方】\n'
+ '- 只给 focus 里的科目写；每科 2-3 个动作 + 1 条验收标准。\n'
+ '- 动作的 go 只能从这些里选（对应站内真实存在的功能，不许编）：\n'
+ '  practice:listen 听音练习 · practice:read 阅读练习 · practice:mock 听力阅读模考 ·\n'
+ '  speaking:practice 口语练习 · writing:template 写作模板 · writing:fill 写作填空 · writing:essay 写作批改 ·\n'
+ '  words:review 背单词 · materials:practice 口语素材\n'
+ '- 动作 text ≤ 40 字，说清做什么；验收 check ≤ 50 字，必须可判断（例：连续 7 天听写正确率 ≥ 70%）。\n'
+ '\n'
+ '【第七步 · stages 阶段计划】\n'
+ '- 2-4 个阶段；days 之和**不得超过**输入里的 daysLeft；每阶段给 title、days、do（≤3 条）、pass（≤40 字，可判断）。\n'
+ '- 阶段顺序 = 从「保最容易拿到的分」到「补最贵的分」；越临近考试越保守。\n'
+ '\n'
+ '【输出 JSON（只输出这个对象）】\n'
+ '{\n'
+ '  "bands": {"listening": 数字或 null, "reading": 数字或 null, "writing": 数字或 null, "speaking": 数字或 null},\n'
+ '  "bandNotes": {"listening": "一句依据", "reading": "...", "writing": "...", "speaking": "..."},\n'
+ '  "verdict": "3-5 句老师评语，一整段，不要列表",\n'
+ '  "focus": ["只放未达标科目，按性价比从高到低"],\n'
+ '  "weekly": [{"sub": "科目 key", "hours": 数字, "why": "为什么给这个时间"}],\n'
+ '  "parts": {"listening": [{"label": "Section 1", "note": "≤40 字"}], "reading": [], "speaking": [], "writing": []},\n'
+ '  "prescriptions": [{"sub": "科目 key", "why": "≤40 字", "actions": [{"text": "≤40 字", "go": "practice:listen"}], "check": "≤50 字"}],\n'
+ '  "stages": [{"title": "≤12 字", "days": 数字, "subs": ["科目 key"], "do": ["≤30 字"], "pass": "≤40 字"}],\n'
+ '  "bullets": ["4-6 条，每条 ≤60 字：做什么 · 每周多少量 · 怎么算完成"],\n'
+ '  "refNote": "校外成绩换算可信度一句说明；没有就给空字符串"\n'
+ '}\n'
+ '分数只允许 0.5 步进、范围 3.0-9.0；没有依据的科目给 null，不许编造。';

/* =====================================================================================
   完整备考计划生成（第三十三批 commit3，新 callRelay key 'studyplan'，会员专属）
   定位：免费诊断 → 一键生成未来 14 天（距考更近按实际天数）每日任务：任务全部限定在
   站内白名单功能（每条都能一键跳进对应页面）、每条自带时长与完成标准、按距考倒排四档。
   护栏不达标整份不采；AI 失败绝不落库。落 DATA.plans（既有 plans 同步/墓碑机制，
   item 新字段 module/action/params/gen 随整项透传，_mergePlans 零改动）。
   ===================================================================================== */
var PLAN_GEN_TAG = 'diag';   // 生成项标记：重新生成只替换同日同标记的「未完成」项；已完成项与手动项保留
var PLAN_SPAN_MAX = 14;      // 单次排程上限（之后可重新生成滚动续排）
var PLAN_WL = {
  practice:  { file:'practice.html',  label:'听读练习', actions:{ listen:['part','count'], read:['part','count'], mock:['kind'] } },
  speaking:  { file:'speaking.html',  label:'口语练习', actions:{ practice:['part','qno'] } },
  materials: { file:'materials.html', label:'口语素材', actions:{ persona:[], story:[] } },
  writing:   { file:'writing.html',   label:'写作',     actions:{ template:[], fill:[], essay:[] } },
  words:     { file:'practice.html',  label:'背单词',   actions:{ review:[] } },
  corpus:    { file:'corpus.html',    label:'长难句',   actions:{ parse:['count'] } },
  wrongbook: { file:'wrongbook.html', label:'错题本',   actions:{ review:['count'] } }
};
/* ≤2 天保底三件套（本地硬护栏：AI 排别的也一律丢弃） */
var PLAN_SAFE = { words:['review'], speaking:['practice'], writing:['template'] };
var PLAN_AI_SYSTEM =
  '你是资深雅思备考教练。根据考生的诊断数据，生成从今天到考试日的完整每日任务计划。只输出一个 JSON 对象，禁止输出 JSON 以外的任何字。\n'
  + '\n'
  + '【任务只能来自下面的站内功能白名单——每个任务都必须能一键跳进对应功能，严禁编造白名单以外的任务、资料或 App】\n'
  + '1. {"module":"practice","action":"listen"} 听力精练：params.part 填 1-4（对应 Section 1-4），params.count 填篇数\n'
  + '2. {"module":"practice","action":"read"} 阅读精练：params.part 填 1-3，params.count 填篇数\n'
  + '3. {"module":"practice","action":"mock"} 限时模考：params.kind 只能填 listening、reading 或 full\n'
  + '4. {"module":"speaking","action":"practice"} 口语题库练习：params.part 填 1 或 2，params.qno 填题号\n'
  + '5. {"module":"materials","action":"persona"} 口语素材-人设准备；{"module":"materials","action":"story"} 口语素材-串题故事；均无 params\n'
  + '6. {"module":"writing","action":"template"} 写作模板背诵默写；action 为 fill 是模板套填；action 为 essay 是完整成篇；均无 params\n'
  + '7. {"module":"words","action":"review"} 背单词，无 params，固定 30 分钟\n'
  + '8. {"module":"corpus","action":"parse"} 长难句拆解：params.count 填句数\n'
  + '9. {"module":"wrongbook","action":"review"} 错题本复习：params.count 填题数\n'
  + '\n'
  + '【每条任务必须自带时长和完成标准】\n'
  + 'text 格式：模块加具体内容与数量，括号内写阿拉伯数字加「分钟」，必须包含「分钟」二字。\n'
  + '正例：听力 Section 4 第 1 篇精听（25 分钟）｜写作 观点型模板默写（30 分钟）｜口语 P1 题库第 3 题快答（20 分钟）｜背单词（30 分钟）\n'
  + '反例（严禁）：练听力｜保持语感｜加强阅读｜背单词（不带分钟数）\n'
  + '每个 task 对象：{"text":字符串,"module":白名单 key,"action":白名单 action,"params":{}}\n'
  + '\n'
  + '【倒排原则：越临近考试越保守】\n'
  + '- 距考 ≥21 天：打基础，四科均衡略偏听读输入项；写作口语从模板和 Part 1 积累起步\n'
  + '- 距考 8-20 天：向最大缺口科目倾斜，写作口语必须有成篇或开口输出\n'
  + '- 距考 3-7 天：只排真题精练、限时模考、口语串题，严禁排新知识、新技巧、没做过的题型\n'
  + '- 距考 ≤2 天：只允许三类保底任务：words/review 背单词（30 分钟）、speaking/practice 口语 Part 1 快答、writing/template 写作模板默写\n'
  + '- 没有考试日期时：按基础期口径均衡排满给定天数\n'
  + '\n'
  + '【容量是硬约束】\n'
  + 'dates 清单里每天给了 capMin（当天最多可学分钟）。当天所有任务分钟数之和严禁超过 capMin；宁可少排一件，也不许超。\n'
  + '\n'
  + '【输出 JSON（dates 里的每一天都要排，不许跳天、不许编造清单外日期）】\n'
  + '{"days":[{"date":"YYYY-MM-DD","focus":"当天主题，10 字以内","tasks":[...]}]}\n'
  + '每天 2-5 件任务。只输出 JSON。';

/* =====================================================================================
   每日重排（第三十三批 commit4，新 callRelay key 'rebalance'，永久免费）
   只重排「今天」：已完成项与手动项本地原样保留不送 AI；AI 只决定今天未完成的生成项
   怎么重新分配。AI 没排进去的旧任务由本地顺延到明天（墓碑+carried，跨端不丢不重）。
   「今天只能学 X 分钟」→ capMin 压到 X，AI 按三级优先级取舍，本地容量护栏再兜底。
   ===================================================================================== */
var REBALANCE_AI_SYSTEM =
  '你是资深雅思备考教练。考生今天的计划需要重新安排。只输出今天一天的 JSON 对象，禁止输出 JSON 以外的任何字。\n'
  + '\n'
  + '【任务只能来自站内功能白名单，与生成完整计划时完全相同】\n'
  + '{"module":"practice","action":"listen"} 听力精练（params.part 1-4、params.count 篇数）；'
  + 'action="read" 阅读精练（part 1-3）；action="mock" 限时模考（params.kind=listening/reading/full）\n'
  + '{"module":"speaking","action":"practice"} 口语题库（params.part 1 或 2、params.qno 题号）\n'
  + '{"module":"materials","action":"persona"} 人设准备；{"module":"materials","action":"story"} 串题故事；无 params\n'
  + '{"module":"writing","action":"template"} 模板默写；"fill" 模板套填；"essay" 完整成篇；无 params\n'
  + '{"module":"words","action":"review"} 背单词，固定 30 分钟，无 params\n'
  + '{"module":"corpus","action":"parse"} 长难句拆解（params.count 句数）\n'
  + '{"module":"wrongbook","action":"review"} 错题本复习（params.count 题数）\n'
  + '\n'
  + '【铁律：未完成的任务严禁静默丢弃】\n'
  + 'pending 里是今天还没做的任务，carried=true 的是「昨天未完成、已顺延到今天」的，必须优先安排，\n'
  + '不得因为想换新任务就把它们吞掉。容量实在排不下时，优先保留 carried 与保底类，\n'
  + '排不进的任务不要再写进输出（系统会自动把它们顺延到明天，不算丢弃），但绝不允许凭空忽略后什么都不交代。\n'
  + '\n'
  + '【容量是硬约束】capMin 是今天实际可用的分钟数，所有任务分钟数之和严禁超过 capMin，宁可少排。\n'
  + '当 onlyMin 有值（考生说今天只能学这么多分钟）时，capMin 已经等于它，按下面顺序砍任务：\n'
  + '① 先砍了解性/新知识类：materials.persona、materials.story、corpus.parse\n'
  + '② 再砍重复练习类：practice.listen/read/mock、speaking.practice 的 Part 2、writing.fill、writing.essay、wrongbook.review\n'
  + '③ 最后才动保底类：words.review 背单词、speaking.practice 的 Part 1 快答、writing.template 模板默写\n'
  + '绝不允许简单按比例砍。时间再少也要尽量保住一件保底类。\n'
  + '\n'
  + '【每条 text 必须含具体内容数量与阿拉伯数字「分钟」，60 字以内，例如：听力 Section 3 第 1 篇精听（25 分钟）】\n'
  + '\n'
  + '【输出 JSON（只允许 date 等于今天这一天）】\n'
  + '{"days":[{"date":"YYYY-MM-DD","focus":"今天主题，10 字以内","tasks":[...]}]}\n'
  + '2-5 件任务。只输出 JSON。';
var rbBusy = false;   // 重排请求进行中（防重复点；顶层 var 必须在 ready 前赋值，见 TDZ 铁律）

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

  // commit4：每日重排工具条（静态 DOM，显隐由 render 管；只在有 AI 任务时可见）
  const _rbAll = document.getElementById('rbAll');
  if(_rbAll) _rbAll.addEventListener('click', () => diagRebalance(0));
  const _rbCapGo = document.getElementById('rbCapGo');
  const _rbMin = document.getElementById('rbMin');
  if(_rbCapGo) _rbCapGo.addEventListener('click', () => {
    const v = parseInt((_rbMin && _rbMin.value) || '0', 10);
    if(!(v > 0)){ toast('填一下今天能学多少分钟，比如 30'); return; }
    diagRebalance(v);
  });
  if(_rbMin) _rbMin.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); _rbCapGo.click(); } });

  /* 10/4 01:15 丙版：「时间不够？」展开/收起（纯 UI，不碰 diagRebalance 逻辑） */
  const _rbMore = document.getElementById('rbMore');
  const _rbBar  = document.getElementById('rbBar');
  if(_rbMore && _rbBar){
    const setOpen = (open) => {
      _rbBar.classList.toggle('rb-open', open);
      _rbMore.setAttribute('aria-expanded', open ? 'true' : 'false');
      _rbMore.textContent = open ? '收起' : '时间不够？';
      if(open){ const m = document.getElementById('rbMin'); if(m) m.focus(); }
    };
    _rbMore.addEventListener('click', () => setOpen(!_rbBar.classList.contains('rb-open')));
    // 恢复态：已有分钟数就默认展开，否则用户以为上次填的值丢了
    if(String((_rbMin && _rbMin.value) || '').trim()) setOpen(true);
    // Esc 收起（只在展开态生效，且不影响输入框的正常 Esc 行为）
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && _rbBar.classList.contains('rb-open')) setOpen(false);
    });
  }

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
  const isToday = date === todayKey();
  // 自动延续：当查看的是「今天」且今天还没有任何计划条目时，
  // 把「前一天」所有未勾选（done:false）的任务复制过来（新 id、done:false、标记 carried），
  // 实现「昨天没做完 → 今天自动续上」。
  if(isToday){
    // 自动延续逻辑抽到 common.js ensureTodayPlanCarried()（首页也要触发，见 index.js）
    ensureTodayPlanCarried();
    // commit4：今日打卡（跨天首次写盘）；返回距上次打开的天数 → 决定是否提示「计划过期」
    var _openGap = touchPlanOpen();
  }
  const p = getPlan(date);
  const items = (p && Array.isArray(p.items)) ? p.items : [];
  const done = items.filter(i => i.done).length;
  const total = items.length;

  $('#dateLabel').textContent = (isToday ? '今天 · ' : '') + date;
  $('#planCount').textContent = done + ' / ' + total;

  const pct = total ? done / total * 100 : 0;
  $('#planProgress').innerHTML = progressBar('完成进度', pct, 'var(--med)');

  /* commit4：重排工具条只在「今天且有未完成 AI 任务」时出现；3 天没回来给过期提示 */
  const hasGenPending = items.some(i => i && i.module && !i.done);
  const rbBar = document.getElementById('rbBar');
  if(rbBar) rbBar.hidden = !(isToday && hasGenPending);
  renderRbStale(isToday && hasGenPending && _openGap >= 3 ? _openGap : 0);

  const box = $('#planList');
  if(total === 0){
    box.innerHTML = renderEmpty('这天还没有计划，上面加一条吧。');
  } else {
    const carriedCount = items.filter(i => i.carried).length;
    const carriedTip = carriedCount
      ? `<div class="plan-carry-tip">↻ 其中 ${carriedCount} 条是昨天未完成的，已自动延续到今天</div>`
      : '';
    box.innerHTML = carriedTip + items.map(i => {
      const jmp = planGenJump(i);   // commit4：AI 生成项整行可点直达学习页；手动项照旧只能编辑
      return `
      <div class="plan-item ${i.done ? 'done' : ''} ${i.carried ? 'carried' : ''} ${jmp ? 'jumpable' : ''}"${
        jmp ? ` data-gfile="${escapeHtml(jmp.file)}"${jmp.open ? ` data-gopen="${escapeHtml(jmp.open)}"` : ''}`
            + ` title="去${escapeHtml(jmp.label)}，点击直达并自动计时"` : ''}>
        <input type="checkbox" ${i.done ? 'checked' : ''} data-toggle="${i.id}" />
        <span class="plan-text ${jmp ? 'js-jump-text' : ''}" data-id="${i.id}"${jmp ? '' : ' title="点击编辑"'}>${escapeHtml(i.text)}</span>
        <button class="plan-edit" data-edit="${i.id}" title="编辑">✎</button>
        <button class="plan-del" data-del="${i.id}" title="删除">✕</button>
      </div>
    `;
    }).join('');
    box.querySelectorAll('input[data-toggle]').forEach(c =>
      c.addEventListener('change', () => toggleItem(c.dataset.toggle)));
    box.querySelectorAll('.plan-text[data-id]:not(.js-jump-text)').forEach(s =>
      s.addEventListener('click', () => startEdit(s.dataset.id)));
    box.querySelectorAll('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => startEdit(b.dataset.edit)));
    box.querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => deleteItem(b.dataset.del)));
    /* commit4：gen 行点击软导航；点勾选框/编辑/删除不跳 */
    box.querySelectorAll('.plan-item.jumpable').forEach(row => {
      row.addEventListener('click', e => {
        if(e.target && e.target.closest && e.target.closest('input,button')) return;
        const url = planJumpUrl({ file: row.dataset.gfile, open: row.dataset.gopen || '' });
        if(url) hubSoftGo(url);
      });
    });
  }

  renderHistory(date);
}

/* commit4：「3 天没回来」过期提示（#rbStale 在重排工具条上方） */
function renderRbStale(gap){
  const host = document.getElementById('rbStale');
  if(!host) return;
  if(!gap){ host.innerHTML = ''; return; }
  host.innerHTML = '<div class="rb-stale">🗓 距你上次打开已 ' + gap
    + ' 天，今天的计划可能已经不顺手了——<button type="button" class="btn btn-sm" id="rbStaleGo">重新安排今天</button></div>';
  const b = document.getElementById('rbStaleGo');
  if(b) b.addEventListener('click', () => diagRebalance(0));
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
    + (d.plan ? '<div class="dg-planline"><span class="dg-planline-ic">🗓</span><span class="dg-planline-txt">已生成 '
      + d.plan.days + ' 天计划 · ' + planMd(d.plan.firstDate) + ' 起 · ' + d.plan.tasks + ' 个任务</span>'
      + '<button type="button" id="dgGoToday" class="dg-text-btn">去今日任务</button></div>' : '')
    + '<button type="button" id="dgView" class="btn-primary dg-block-btn">查看完整诊断报告</button>'
    + '</div>';
  document.getElementById('dgRedo').addEventListener('click', openDiagForm);
  document.getElementById('dgView').addEventListener('click', () => openDiagReport());
  const _go = document.getElementById('dgGoToday');
  if(_go) _go.addEventListener('click', diagGoToday);
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
    /* 完整备考计划生成（commit3）：会员专属，六态：idle/checking/loading/success/locked/error */
    + '<section class="dg-sec dg-plan" id="dgPlan" aria-live="polite"></section>'
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
  /* 计划区：现读 d.plan 推断（重新诊断会造新 diagnosis 对象，旧元信息清空、已落库任务保留，
     下次生成时 planPersist 按覆盖日期用墓碑替换同标记未完成项）。 */
  const _dp = DATA.settings.diagnosis && DATA.settings.diagnosis.plan;
  renderDiagPlanBox(_dp ? 'success' : 'idle');
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


/* ── 深度版：站内实证数据摘要（10/6）────────────────────────────────────────
   只汇总「站内真有的记录」，缺就是缺（AI 那边会在评语里点明「这科没数据」）。
   ⚠️ 听力/阅读的 mock 记录里 parts 就是 Section / Passage 级对错（correct/total 或 score），
      口语的 parts 是 p1/p2/p3 × fc/lr/gra，写作的 breakdown 是 TR/CC/LR/GRA —— 都已内置，**不需要题库**。
      唯独「考点级」（错的是哪道题、哪种题型）需要题目本体 + 逐题作答明细 → 已列待办。 */
function diagProEvidence(){
  const D = DATA || {};
  const mock = Array.isArray(D.mockRecords) ? D.mockRecords : [];
  const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || ((b.ts || 0) - (a.ts || 0));
  const num = v => (v == null || !isFinite(Number(v))) ? null : Number(v);
  const ev = { mockBySub: {}, handScores: [], errorbookN: 0, checkinsN: 0, daysLeft: 0, note: '' };

  ['listening', 'reading'].forEach(t => {
    const recs = mock.filter(r => r && r.type === t && Array.isArray(r.parts) && r.parts.length).sort(byDate);
    const r = recs[0];
    if(!r) return;
    ev.mockBySub[t] = {
      date: r.date || '',
      parts: r.parts.slice(0, 6).map(p => ({
        label: String(p.label || ''),
        score: num(p.score), correct: num(p.correct), total: num(p.total),
      })).filter(p => p.label),
    };
  });

  /* 口语整卷记录：kind==='speaking'（旧记录无 parts 但有 p1）*/
  const spk = mock.filter(r => r && (r.kind === 'speaking' || (!Array.isArray(r.parts) && (r.p1 || r.p2)))).sort(byDate)[0];
  if(spk){
    const g = (p) => (p && typeof p === 'object' && !Array.isArray(p))
      ? { fc: num(p.fc), lr: num(p.lr), gra: num(p.gra), unanswered: !!p.unanswered } : null;
    const P = (spk.parts && typeof spk.parts === 'object') ? spk.parts : null;
    if(P && (P.p1 || P.p2 || P.p3)){
      ev.mockBySub.speaking = { date: spk.date || '', overall: num(spk.overall), p1: g(P.p1), p2: g(P.p2), p3: g(P.p3) };
    }else if(spk.dims && typeof spk.dims === 'object'){
      ev.mockBySub.speaking = { date: spk.date || '', overall: num(spk.overall), dims: spk.dims };
    }
  }

  /* 写作：最近一次 AI 批改的官方四项（结构化存在 result.breakdown）*/
  const ws = (Array.isArray(D.writingScores) ? D.writingScores : [])
    .filter(x => x && x.parsed && x.result && typeof x.result === 'object' && x.result.breakdown)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if(ws[0]){
    const bd = ws[0].result.breakdown || {};
    ev.mockBySub.writing = {
      date: ws[0].date || '', cat: ws[0].tplCat || '', overall: num(ws[0].result.overall),
      TR: num(bd.TR), CC: num(bd.CC), LR: num(bd.LR), GRA: num(bd.GRA),
    };
  }

  ev.handScores = (Array.isArray(D.scores) ? D.scores : []).slice(-4)
    .map(x => ({ date: x.date || '', listening: num(x.listening), reading: num(x.reading), writing: num(x.writing), speaking: num(x.speaking) }));
  ev.errorbookN = Array.isArray(D.errorbook) ? D.errorbook.length : 0;
  ev.checkinsN = Array.isArray(D.checkins) ? D.checkins.length : 0;
  ev.note = '以上全部来自站内真实记录；某科没有数据就直接说没有，不要推测。';
  return ev;
}

/* 深度版 messages：本地问卷 + 站内实证证据 */
function diagProMessages(st, r){
  const tg = {};
  DIAG_SUBS.forEach(([k]) => { tg[k] = Number(r.tg[k]) > 0 ? Number(r.tg[k]) : null; });
  if(Number(r.tg.overall) > 0) tg.overall = Number(r.tg.overall);
  const ev = diagProEvidence();
  ev.daysLeft = r.cd.hasExam ? r.days : 0;
  const payload = {
    now: todayKey(),
    exam: r.cd.hasExam ? { date: r.cd.raw, daysLeft: r.days } : null,
    target: tg,
    bands: DIAG_SUBS.map(([k]) => ({ sub: k, band: (st.bands[k] == null ? null : st.bands[k]), source: (st.src[k] ? st.src[k].s : null) })),
    refExam: st.ref || null,
    weeklyCapacity: { weekdayHoursPerDay: st.wdHours, weekendHoursPerDay: st.weHours, totalMinutesPerWeek: r.caps.weekMin },
    identity: st.identity,
    localConclusion: { key: r.verdict.k, needDays: r.needDays, text: r.verdict.text },
    evidence: ev,
  };
  return [
    { role: 'system', content: DIAG_PRO_SYSTEM },
    { role: 'user', content: '请按约定的 JSON 格式，为下面这位考生做深度评定：\n' + JSON.stringify(payload) },
  ];
}

/* 站内可跳转目标白名单（处方动作只能指到这里 —— 站内没有的能力不许出现在按钮里） */
function diagProGoMap(){
  const m = {};
  Object.keys(PLAN_WL).forEach(mod => {
    const acts = PLAN_WL[mod].actions || {};
    Object.keys(acts).forEach(a => { m[mod + ':' + a] = { file: PLAN_WL[mod].file, label: PLAN_WL[mod].label }; });
  });
  return m;
}

/* ── 深度版护栏（10/6）──────────────────────────────────────────────────────
   诚实第一：① parts 的 label 必须真实存在于 evidence（**编造的 Section 号会被丢掉**）
             ② prescriptions 只给未达标科目写，动作必须映射到站内白名单
             ③ stages 天数总和 ≤ 距考天数
             任一关键块不合规就整份不采（沿用「AI 失败绝不落库」的既有口径）。 */
function diagProApplyAi(st, ai, r){
  const base = diagApplyAi(st, ai);
  if(!base) return null;
  const ev = diagProEvidence();

  /* ① 分项诊断：label 白名单 = evidence 里真实存在的标签 */
  const allowLabel = {};
  const put = (k, lab) => { if(!allowLabel[k]) allowLabel[k] = []; if(lab && allowLabel[k].indexOf(lab) < 0) allowLabel[k].push(lab); };
  const L = ev.mockBySub.listening, R = ev.mockBySub.reading, S = ev.mockBySub.speaking, W = ev.mockBySub.writing;
  (L && L.parts || []).forEach(p => put('listening', p.label));
  (R && R.parts || []).forEach(p => put('reading', p.label));
  if(S){ ['p1', 'p2', 'p3'].forEach(k => { if(S[k]) put('speaking', k.toUpperCase()); }); }
  if(W){ ['TR', 'CC', 'LR', 'GRA'].forEach(k => { if(W[k] != null) put('writing', k); }); }

  const parts = {};
  const src = (ai.parts && typeof ai.parts === 'object') ? ai.parts : {};
  DIAG_SUBS.forEach(([k]) => {
    const list = Array.isArray(src[k]) ? src[k] : [];
    const rows = list.map(x => {
      if(!x || typeof x !== 'object') return null;
      const lab = String(x.label || '').trim();
      if(!lab || !((allowLabel[k] || []).indexOf(lab) >= 0)) return null;   // 编造的标签 → 丢
      const o = { label: lab, note: (typeof x.note === 'string' ? x.note.trim().slice(0, 40) : '') };
      if(x.correct != null) o.correct = Number(x.correct);
      if(x.total != null) o.total = Number(x.total);
      if(x.dims && typeof x.dims === 'object'){
        o.dims = {};
        ['fc', 'lr', 'gra'].forEach(d => { if(x.dims[d] != null) o.dims[d] = Number(x.dims[d]); });
        if(!Object.keys(o.dims).length) delete o.dims;
      }
      return (o.note || o.correct != null || o.dims) ? o : null;
    }).filter(Boolean).slice(0, 6);
    if(rows.length) parts[k] = rows;
  });
  if(!Object.keys(parts).length) return null;      // 一条分项都站不住 → 整份不采（不显示半截）

  /* ② 处方：只给 focus 里的科目；动作必须映射到站内白名单 */
  const goMap = diagProGoMap();
  const focusSet = {};
  base.focus.forEach(k => { focusSet[k] = 1; });
  const prescriptions = (Array.isArray(ai.prescriptions) ? ai.prescriptions : []).map(x => {
    if(!x || typeof x !== 'object') return null;
    const k = String(x.sub || '');
    if(!focusSet[k]) return null;                                     // 已达标科目不给处方
    const actions = (Array.isArray(x.actions) ? x.actions : []).map(a => {
      if(!a || typeof a !== 'object') return null;
      const go = String(a.go || '');
      if(!goMap[go]) return null;                                      // 站内没这个功能 → 丢
      const text = (typeof a.text === 'string' ? a.text.trim().slice(0, 40) : '');
      if(!text) return null;
      return { text: text, go: go, file: goMap[go].file, label: goMap[go].label };
    }).filter(Boolean).slice(0, 3);
    const check = (typeof x.check === 'string' ? x.check.trim().slice(0, 50) : '');
    if(!actions.length || !check) return null;                          // 动作全被丢 or 没验收线 → 丢整条
    return { sub: k, why: (typeof x.why === 'string' ? x.why.trim().slice(0, 40) : ''), actions: actions, check: check };
  }).filter(Boolean).slice(0, 4);
  if(!prescriptions.length) return null;

  /* ③ 阶段计划：2-4 个；days 正整数且总和 ≤ 距考天数；subs ⊆ focus */
  const daysLeft = (r && r.cd && r.cd.hasExam) ? Number(r.days) : 0;
  const cap = (daysLeft > 0) ? daysLeft : 14;
  let used = 0;
  const stages = (Array.isArray(ai.stages) ? ai.stages : []).map(x => {
    if(!x || typeof x !== 'object') return null;
    const dd = Math.round(Number(x.days));
    if(!isFinite(dd) || dd <= 0) return null;
    if(used + dd > cap) return null;                                   // 超过剩余天数 → 丢
    const doList = (Array.isArray(x.do) ? x.do : []).map(v => String(v || '').trim()).filter(Boolean).slice(0, 3);
    const pass = (typeof x.pass === 'string' ? x.pass.trim().slice(0, 40) : '');
    const title = (typeof x.title === 'string' ? x.title.trim().slice(0, 12) : '');
    if(!title || !doList.length || !pass) return null;
    used += dd;
    const subs = (Array.isArray(x.subs) ? x.subs : []).map(String).filter(k => focusSet[k]).slice(0, 4);
    return { title: title, days: dd, subs: subs, do: doList, pass: pass };
  }).filter(Boolean).slice(0, 4);
  if(stages.length < 2) return null;

  return Object.assign({}, base, { parts: parts, prescriptions: prescriptions, stages: stages, pro: 1 });
}

/* 纯护栏：AI JSON → 可落库 d.ai；关键字段不合规返回 null（调用方保留本地底座，不采半截）。
   实证科目（mock/考试/批改/练习）强制沿用她的真实分；AI 分值只对 ref/manual/空 科目生效。 */
/* 🔴 10/6 10:17 她批「已达标的科目也显示成『XX 优先』，非常不合常理」（真 bug，两道门都漏了）。
   过滤规则（**渲染层与落库层共用**，所以她**已经存过的旧记录**打开也会立刻变对）：
   gap = 目标 − 现状（用合并后的最终分，实证分优先）；gap < 0.5 = 已达标 → 不进优先清单、不占每周时间。 */
function diagAiGap(bands, k){
  const tg = (DATA.settings && DATA.settings.targets) || {};
  const t = Number(tg[k]) || 0;
  if(!t) return null;                 // 没设目标 → 不参与
  const v = bands ? bands[k] : null;
  if(v == null) return null;          // AI 没能给分 → 不参与
  return Math.round((t - v) * 2) / 2;
}
function diagAiFocusList(bands, raw){
  return (Array.isArray(raw) ? raw : [])
    .map(x => String(x))
    .filter(k => DIAG_SUBS.some(([x2]) => x2 === k))
    .filter((k, i, a) => a.indexOf(k) === i)
    .filter(k => { const g = diagAiGap(bands, k); return g != null && g >= 0.5; })
    .slice(0, 4);
}
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
  /* 🔴 10/6 10:17 她批「作文和口语已经达标，它却显示四门科全部都优先，非常不合常理」。
     根因两层：① prompt 只写了「focus 按优先级排列最该投入的科目」，**从没说已达标的不许进**；
             ② 前端校验只做了「合法 key + 去重 + 截 4 个」，**没剔除已达标的科目** → 两道门都漏了。
     现在双保险：prompt 写死规则（已重写）+ 这里按本地算的 gap 硬过滤。
     gap = 目标 − 现状，用**合并后的最终分**（实证分优先），<0.5 一律剔除；AI 没给分的科目也剔掉。 */
  const focus = diagAiFocusList(bands, ai.focus);
  /* 每周时间分配（新字段，缺失就整块不渲染，老记录零影响） */
  const weekly = (Array.isArray(ai.weekly) ? ai.weekly : [])
    .map(x => {
      if(!x || typeof x !== 'object') return null;
      const k = String(x.sub || '');
      if(!DIAG_SUBS.some(([k2]) => k2 === k)) return null;
      const h = Number(x.hours);
      if(!isFinite(h) || h <= 0 || h > 20) return null;
      const why = (typeof x.why === 'string') ? x.why.trim().slice(0, 40) : '';
      return { sub:k, hours:Math.round(h * 2) / 2, why:why };
    })
    .filter(Boolean)
    .filter(x => { const g = diagAiGap(bands, x.sub); return g == null || g >= 0.5; })   // 已达标的不占时间
    .slice(0, 4);
  const refNote = (typeof ai.refNote === 'string') ? ai.refNote.trim().slice(0, 200) : '';
  return { ts:Date.now(), bands, bandNotes, verdict, bullets, focus, weekly, refNote };
}

function diagFmtTs(ts){
  const x = new Date(ts), p = n => String(n).padStart(2, '0');
  return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
}

/* 请求 AI 评定。落库与 UI 解耦：成功必落 d.ai（覆盖层关了也不浪费），DOM 前一律先查元素。 */
/* 深度版请求（10/6 10:50 起）：会员闸在前 + 后端 diagpro 也拦（双保险）。
   老记录（d.ai）继续能看，但它没有 parts/prescriptions/stages —— 渲染层会自动标「轻量版 · 升级」。 */
async function diagRequestAi(st){
  try{
    const d0 = DATA.settings && DATA.settings.diagnosis;
    if(!d0) return;
    renderDiagAiBox('checking');
    let isVip = null;
    try{ isVip = await diagVipCheck(); }catch(e){ isVip = null; }
    /* 🔴 未知态（网络失败/超限）不再当非会员弹付费卡 —— 会员点一下才被告知要充值，
       是 10/6 她报「明明是 VIP 号却给我锁了」的同款病根。改成提示重试。 */
    if(isVip === null){ renderDiagAiBox('error', 'fail'); return; }
    if(!isVip){ renderDiagAiBox('locked'); return; }
    const r = diagBuildReport(d0);
    const raw = await callRelay('diagpro', diagProMessages(st, r), 0.3, { max_tokens:3000, json_mode:true });
    const ai = diagProApplyAi(st, aiJson(raw), r);
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
/* #dgAi 渲染（10/6 10:50 起 = 会员专属深度版）：七态
   checking / locked / loading / stored / error(bad|fail|login) / idle
   深度版四块：老师评语(verdict) + 分项诊断(parts) + 科目级处方(prescriptions) + 阶段计划(stages)，
   下面是原有六段（分值 / 依据 / 优先 / 每周时间 / 建议 / 换算说明）。
   ⚠️ 老记录（d.ai，无 pro 标记）仍能看，但会标「轻量版 · 升级深度版」——不假装它有深度内容。 */
function renderDiagAiBox(mode, sub){
  const box = document.getElementById('dgAi'); if(!box) return;
  const d = DATA.settings && DATA.settings.diagnosis;
  const lab = (k) => (DIAG_SUBS.find(x => x[0] === k) || [,''])[1];
  const head = '<div class="dg-ai-head"><span class="dg-ai-badge">AI</span><strong>AI 深度诊断</strong>'
    + '<span class="dg-ai-free">会员功能</span></div>';
  const kick = (st) => { renderDiagAiBox('loading'); diagRequestAi(st); };

  if(mode === 'checking'){
    box.innerHTML = head + '<div class="dg-ai-loading"><span class="dg-spinner" aria-hidden="true"></span>正在确认会员权益…</div>';
    return;
  }
  if(mode === 'locked'){
    box.innerHTML = head
      + '<div class="dg-plan-lock-msg">🔒 AI 深度诊断是会员功能。开通后得到：</div>'
      + '<ul class="dg-plan-perks">'
      + '<li>一段老师手写风格的评语：你的问题本质是什么、最该做哪一件事</li>'
      + '<li>分项诊断：听力逐 Section、阅读逐 Passage、口语逐 P1-P3、写作 TR/CC/LR/GRA</li>'
      + '<li>每个未达标科目一张处方：2-3 个动作（能一键跳进站内功能）+ 一条验收标准</li>'
      + '<li>阶段计划：从保最容易拿的分，到补最贵的分，每阶段都有通过线</li>'
      + '</ul>'
      + '<a class="btn-primary dg-block-btn" href="vip.html" style="text-decoration:none;text-align:center">开通会员 · 周卡 ¥19</a>'
      + '<div class="dg-plan-note">诊断结论与每日重排永久免费；深度诊断与完整计划是会员功能。</div>';
    return;
  }
  if(mode === 'loading'){
    box.innerHTML = head + '<div class="dg-ai-loading"><span class="dg-spinner" aria-hidden="true"></span>'
      + '正在读你的模考记录、批改结果与练习数据，做深度诊断，通常 15 秒左右…</div>';
    return;
  }
  if(mode === 'stored' && d && d.ai){
    const ai = d.ai;
    const isPro = !!ai.pro;
    const bandCards = DIAG_SUBS.map(([k, l]) => {
      const v = ai.bands[k], real = !!(d.bandSrc[k] && DIAG_AI_REAL_SRC[d.bandSrc[k].s] && d.bands[k] != null);
      return '<div class="dg-ai-band"><span class="dg-ai-band-lab">' + l + (real ? '<i class="dg-ai-tag">沿用你的'
        + escapeHtml(DIAG_SRC_LABEL[d.bandSrc[k].s] || d.bandSrc[k].s) + '</i>' : '') + '</span>'
        + '<b>' + (v == null ? '--' : v.toFixed(1)) + '</b>'
        + (ai.bandNotes[k] ? '<span class="dg-ai-band-note">' + escapeHtml(ai.bandNotes[k]) + '</span>' : '') + '</div>';
    }).join('');
    const fList = diagAiFocusList(ai.bands, ai.focus);
    const focus = fList.length
      ? '<div class="dg-ai-focus">' + fList.map(k => '<span class="dg-ai-fchip">' + escapeHtml(lab(k)) + ' 优先</span>').join('') + '</div>' : '';
    const wList = (Array.isArray(ai.weekly) ? ai.weekly : []).filter(x => x && x.sub)
      .filter(x => { const g = diagAiGap(ai.bands, x.sub); return g == null || g >= 0.5; });
    const weekly = wList.length
      ? '<div class="dg-ai-weekly"><div class="dg-ai-weekly-t">每周时间这样分</div>'
        + wList.map(w => '<div class="dg-ai-weekly-row"><span class="dg-ai-weekly-sub">' + escapeHtml(lab(w.sub)) + '</span>'
          + '<span class="dg-ai-weekly-h">' + (Number(w.hours) || 0) + ' 小时</span>'
          + (w.why ? '<span class="dg-ai-weekly-why">' + escapeHtml(w.why) + '</span>' : '') + '</div>').join('')
        + '</div>' : '';

    /* ① 老师评语：整段，不条目化 */
    const verdict = ai.verdict
      ? '<div class="dg-pro-verdict"><span class="dg-pro-tag">老师评语</span><p>' + escapeHtml(ai.verdict) + '</p></div>' : '';

    /* ② 分项诊断：label 已由护栏按 evidence 白名单校验过，这里只渲染 */
    const partsHtml = (ai.parts && typeof ai.parts === 'object')
      ? DIAG_SUBS.map(([k, l]) => {
          const rows = Array.isArray(ai.parts[k]) ? ai.parts[k] : [];
          if(!rows.length) return '';
          return '<div class="dg-pro-parts"><div class="dg-pro-parts-t">' + escapeHtml(l) + '</div>'
            + rows.map(p => {
                let numTxt = '';
                if (p.correct != null && p.total != null) numTxt = ' ' + p.correct + '/' + p.total;
                else if(p.score != null) numTxt = ' ' + p.score;
                let dims = '';
                if(p.dims && typeof p.dims === 'object'){
                  const dn = [];
                  if(p.dims.fc != null) dn.push('流利 ' + p.dims.fc);
                  if(p.dims.lr != null) dn.push('词汇 ' + p.dims.lr);
                  if(p.dims.gra != null) dn.push('语法 ' + p.dims.gra);
                  if(dn.length) dims = '（' + dn.join(' · ') + '）';
                }
                return '<div class="dg-pro-parts-row"><span class="dg-pro-parts-l">' + escapeHtml(p.label) + numTxt + dims + '</span>'
                  + (p.note ? '<span class="dg-pro-parts-n">' + escapeHtml(p.note) + '</span>' : '') + '</div>';
              }).join('') + '</div>';
        }).join('')
      : '';

    /* ③ 科目级处方：动作只指向站内白名单（护栏已校验），点击直接跳对应功能 */
    const rxHtml = (Array.isArray(ai.prescriptions) ? ai.prescriptions : []).map((x, ix) => {
      const acts = (x.actions || []).map((a, ai2) => '<button type="button" class="dg-pro-act" data-pro-go="' + a.file + '" title="去' + escapeHtml(a.label) + '">' + escapeHtml(a.text) + '</button>').join('');
      return '<div class="dg-pro-rx"><div class="dg-pro-rx-h"><span class="dg-pro-rx-sub">' + escapeHtml(lab(x.sub)) + '</span>'
        + (x.why ? '<span class="dg-pro-rx-why">' + escapeHtml(x.why) + '</span>' : '') + '</div>'
        + '<div class="dg-pro-acts">' + acts + '</div>'
        + '<div class="dg-pro-check">验收 · ' + escapeHtml(x.check) + '</div></div>';
    }).join('');

    /* ④ 阶段计划 */
    const stHtml = (Array.isArray(ai.stages) ? ai.stages : []).map(x =>
      '<div class="dg-pro-stage"><div class="dg-pro-stage-h"><b>' + escapeHtml(x.title) + '</b><span>' + x.days + ' 天</span></div>'
      + '<ul class="dg-pro-stage-do">' + (x.do || []).map(v => '<li>' + escapeHtml(v) + '</li>').join('') + '</ul>'
      + '<div class="dg-pro-stage-p">通过线 · ' + escapeHtml(x.pass) + '</div></div>').join('');

    box.innerHTML = head
      + (isPro ? '' : '<div class="dg-pro-oldnote">这是升级前的轻量版评定。开通会员并重新评定，可得老师评语、分项诊断、处方与阶段计划。</div>')
      + verdict
      + (partsHtml ? '<div class="dg-pro-sec-t">分项诊断</div>' + partsHtml : '')
      + (rxHtml ? '<div class="dg-pro-sec-t">弱项处方</div><div class="dg-pro-rxs">' + rxHtml + '</div>' : '')
      + (stHtml ? '<div class="dg-pro-sec-t">阶段计划</div><div class="dg-pro-stages">' + stHtml + '</div>' : '')
      + '<div class="dg-pro-sec-t">四科结论</div>'
      + '<p class="dg-ai-verdict">' + escapeHtml(ai.verdict || '') + '</p>'
      + focus
      + '<div class="dg-ai-bands">' + bandCards + '</div>'
      + weekly
      + '<ul class="dg-ai-bullets">' + (ai.bullets || []).map(b => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul>'
      + (ai.refNote ? '<div class="dg-ai-ref">' + escapeHtml(ai.refNote) + '</div>' : '')
      + '<div class="dg-ai-ts">AI 评定时间 ' + diagFmtTs(ai.ts) + '（结论仅供参考，最终以你的雅思真题模考分为准）</div>';
    box.querySelectorAll('[data-pro-go]').forEach(b => b.addEventListener('click', () => {
      const url = b.getAttribute('data-pro-go');
      if(url) hubSoftGo(url);
    }));
    return;
  }
  if(mode === 'error' && sub === 'login'){
    box.innerHTML = head + '<div class="dg-ai-msg">登录后可以获取 AI 深度诊断。</div>'
      + '<a class="btn-primary dg-block-btn" href="login.html" style="text-decoration:none;text-align:center">去登录 / 注册</a>';
    return;
  }
  if(mode === 'error'){
    const msg = sub === 'vip'
      ? '深度诊断是会员功能，开通后即可获取。'
      : (sub === 'bad' ? 'AI 这次返回的内容不完整，换个时间再试一次。'
        : '深度诊断暂时没拿到（网络或服务波动）。上面的本地结论不受影响，可以先用。');
    box.innerHTML = head + '<div class="dg-ai-msg">' + msg + '</div>'
      + '<button type="button" class="dg-text-btn" id="dgAiRetry">重试深度诊断</button>';
    document.getElementById('dgAiRetry').addEventListener('click', () =>
      kick(d ? { bands:d.bands, src:d.bandSrc } : { bands:{}, src:{} }));
    return;
  }
  /* idle：未评定（含上次失败后重进） */
  box.innerHTML = head + '<div class="dg-ai-msg">AI 会读你的模考记录、批改结果与练习数据，给一段老师评语 + 分项诊断 + 弱项处方 + 阶段计划。会员功能，一次约 15 秒。</div>'
    + '<button type="button" class="btn-primary dg-block-btn" id="dgAiGo">获取 AI 深度诊断</button>'
    + '<div class="dg-plan-note">开通后一次生成，结论长期有效；改了答案可以重新评定。</div>';
  document.getElementById('dgAiGo').addEventListener('click', () =>
    kick(d ? { bands:d.bands, src:d.bandSrc } : { bands:{}, src:{} }));
}

/* =====================================================================================
   完整备考计划生成（commit3）
   ===================================================================================== */

/* 本次要排的日期清单：距考更近按实际天数（考试当天 0 天也排 1 天保底），否则排 14 天；
   每天按工作日/周末给容量。已过考（负数）按无考试处理排满 14 天。 */
function planSpanDates(daysLeft, caps){
  const hasExamDays = daysLeft != null && daysLeft >= 0;
  const raw = hasExamDays ? Math.max(1, daysLeft) : PLAN_SPAN_MAX;
  const n = Math.max(1, Math.min(PLAN_SPAN_MAX, raw));
  const arr = [];
  for(let i = 0; i < n; i++){
    const iso = addDays(todayKey(), i);
    const dow = new Date(iso + 'T00:00:00').getDay();   // 禁 toISOString（UTC 跨日）
    const weekend = dow === 0 || dow === 6;
    arr.push({ iso, weekend, capMin: weekend ? caps.weMin : caps.wdMin });
  }
  return arr;
}

function planMd(iso){
  if(!iso) return '';
  const x = new Date(iso + 'T00:00:00');
  return isNaN(x.getTime()) ? String(iso) : ((x.getMonth() + 1) + ' 月 ' + x.getDate() + ' 日');
}

/* 组装 studyplan 请求：system 锁白名单/时长/倒排/容量，user 喂诊断上下文与日期清单 */
function planBuildMessages(d, r, dates){
  const tg = {};
  DIAG_SUBS.forEach(([k]) => { tg[k] = Number(r.tg[k]) > 0 ? Number(r.tg[k]) : null; });
  if(Number(r.tg.overall) > 0) tg.overall = Number(r.tg.overall);
  const payload = {
    now: todayKey(),
    exam: r.cd.hasExam ? { date:r.cd.raw, daysLeft:r.days } : null,
    phase: r.phase ? r.phase.k : null,
    target: tg,
    bands: DIAG_SUBS.map(([k]) => ({ sub:k, band:(d.bands[k] == null ? null : d.bands[k]),
      source:(d.bandSrc[k] ? d.bandSrc[k].s : null) })),
    gaps: r.gaps,
    capacity: { weekdayMin:r.caps.wdMin, weekendMin:r.caps.weMin, totalMinutesPerWeek:r.caps.weekMin },
    localConclusion: { key:r.verdict.k, needDays:r.needDays, text:r.verdict.text },
    dates: dates.map(x => ({ date:x.iso, weekend:x.weekend, capMin:x.capMin }))
  };
  return [
    { role:'system', content:PLAN_AI_SYSTEM },
    { role:'user', content:'请按约定的 JSON 格式为下面这位考生排完整每日计划：\n' + JSON.stringify(payload) }
  ];
}

function planMinOf(text){
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*分钟/);
  return m ? Math.round(parseFloat(m[1])) : 0;
}

/* 纯护栏：AI JSON → 可落库的 days（tasks 带 min）。
   日期必须在清单内；module/action 必须在白名单；text 必须非空且含分钟数；
   params 只留白名单键；同日同 text 去重；当天累计超 capMin×1.15 从尾部砍（首条保留防空天）；
   ≤2 天只留保底三件套。任何不合规都只丢当条/当天；最终 0 天返回 null（调用方整份不采）。 */
function planApplyAi(json, dates, daysLeft){
  if(!json || typeof json !== 'object' || !Array.isArray(json.days)) return null;
  const capOf = {};
  dates.forEach(x => { capOf[x.iso] = x.capMin; });
  const allowDate = iso => Object.prototype.hasOwnProperty.call(capOf, iso);
  const safe = daysLeft != null && daysLeft >= 0 && daysLeft <= 2;
  const out = [];
  const seenDate = new Set();
  for(const day of json.days){
    if(!day || typeof day !== 'object' || !allowDate(day.date) || seenDate.has(day.date)) continue;
    if(!Array.isArray(day.tasks)) continue;
    seenDate.add(day.date);
    const focus = (typeof day.focus === 'string') ? day.focus.trim().slice(0, 10) : '';
    const cap = Math.round((capOf[day.date] || 0) * 1.15);
    const tasks = [];
    const seenText = new Set();
    let usedMin = 0;
    for(const t0 of day.tasks){
      if(!t0 || typeof t0 !== 'object') continue;
      const text = String(t0.text == null ? '' : t0.text).trim();
      if(!text || text.length > 60) continue;
      const min = planMinOf(text);
      if(min <= 0) continue;
      const mod = PLAN_WL[t0.module];
      if(!mod || !Object.prototype.hasOwnProperty.call(mod.actions, t0.action)) continue;
      if(safe && (PLAN_SAFE[t0.module] || []).indexOf(t0.action) === -1) continue;
      const params = {};
      const allowParams = mod.actions[t0.action] || [];
      if(t0.params && typeof t0.params === 'object' && !Array.isArray(t0.params)){
        allowParams.forEach(k => {
          const v = t0.params[k];
          if(typeof v === 'number' && isFinite(v)) params[k] = v;
          else if(typeof v === 'string'){ const s = v.trim(); if(s && s.length <= 12) params[k] = s; }
        });
      }
      if(seenText.has(text)) continue;
      if(cap > 0 && tasks.length && usedMin + min > cap) continue;
      seenText.add(text); usedMin += min;
      tasks.push({ text, min, module:t0.module, action:t0.action, params });
    }
    if(tasks.length) out.push({ date:day.date, focus, tasks });
  }
  return out.length ? out : null;
}

/* 落库：覆盖日期内，旧的同标记未完成项登墓碑后替换；已完成生成项与手动项原样保留。
   元信息写 d.plan（settings.diagnosis 子对象，随既有字段级同步走）。 */
function planPersist(days){
  let added = 0;
  const tombstones = [];
  days.forEach(day => {
    const p = ensurePlan(day.date);
    p.items = Array.isArray(p.items) ? p.items : [];
    p.items.forEach(it => { if(it && it.gen === PLAN_GEN_TAG && !it.done) tombstones.push(it.id); });
    p.items = p.items.filter(it => !(it && it.gen === PLAN_GEN_TAG && !it.done));
    day.tasks.forEach(t => {
      p.items.push({ id:uid(), text:t.text, done:false, updatedAt:Date.now(),
        module:t.module, action:t.action, params:t.params, gen:PLAN_GEN_TAG });
      added++;
    });
  });
  if(tombstones.length){
    DATA.deletedIds = DATA.deletedIds || [];
    tombstones.forEach(id => { if(DATA.deletedIds.indexOf(id) === -1) DATA.deletedIds.push(id); });
  }
  const d = DATA.settings && DATA.settings.diagnosis;
  if(d){
    d.plan = { ts:Date.now(), days:days.length, firstDate:days[0].date,
               lastDate:days[days.length - 1].date, tasks:added };
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs.diagnosis = Date.now();
  }
  hubSave();
  return { added, replaced:tombstones.length };
}

/* 会员闸：10/6 20:55 起直接复用 common.js 的 authVipCheck（与 writing.js 同源同口径，
   同一个 sessionStorage 键 + 同一个 vip_status 接口，避免两份实现再次跑偏）。
   🔴 老口径的病：catch 里 isVip=false 并把 '0' 写死进缓存 —— 一次网络抖动就把永久会员
   按成非会员，且跨刷新消不掉。查失败现在返回 null（未知），由调用方给「重试」出路，
   不再静默锁死。 */
async function diagVipCheck(){
  let v = null;
  try{ v = await authVipCheck(); }catch(e){ v = null; }
  return v === true;   // 未知态按「暂不拦」，并已请调用方提示重试
}

function diagGoToday(){
  closeDiagOverlay();
  setPlanTab('today');
  render();
}

/* 生成完整计划：会员闸 → studyplan → 护栏 → 落库 → 跳今日 Tab。任何失败不落库。 */
async function diagGenPlan(){
  const d0 = DATA.settings && DATA.settings.diagnosis;
  if(!d0 || !document.getElementById('dgPlan')) return;
  renderDiagPlanBox('checking');
  let isVip = null;
  try{ isVip = await diagVipCheck(); }catch(e){ isVip = null; }
  if(isVip === null){ renderDiagPlanBox('error', 'fail'); return; }   // 查不到 = 提示重试，不谎报要充值
  if(!isVip){ renderDiagPlanBox('locked'); return; }
  renderDiagPlanBox('loading');
  try{
    const d = DATA.settings.diagnosis;
    const r = diagBuildReport(d);
    const dates = planSpanDates(r.days, r.caps);
    const raw = await callRelay('studyplan', planBuildMessages(d, r, dates), 0.4, { max_tokens:4000, json_mode:true });
    const plan = planApplyAi(aiJson(raw), dates, r.days);
    if(!plan){
      if(document.getElementById('dgPlan')) renderDiagPlanBox('error', 'bad');
      return;
    }
    const st = planPersist(plan);
    renderDiagEntry();
    toast('已生成 ' + plan.length + ' 天、' + st.added + ' 个任务，去今日 Tab 开始做');
    diagGoToday();
  }catch(e){
    if(!document.getElementById('dgPlan')) return;
    if(e && e.code === 'AUTH_REQUIRED') renderDiagPlanBox('error', 'login');
    else if(e && e.code === 'vip_required') renderDiagPlanBox('locked');
    else renderDiagPlanBox('error', 'fail');
  }
}

/* #dgPlan 渲染：idle / checking / loading / success / locked / error(bad|fail|login)。只刷本 section。 */
function renderDiagPlanBox(mode, sub){
  const box = document.getElementById('dgPlan'); if(!box) return;
  const d = DATA.settings && DATA.settings.diagnosis;
  const head = '<div class="dg-ai-head"><span class="dg-plan-badge">计</span><strong>完整备考计划</strong>'
    + '<span class="dg-ai-free">会员功能</span></div>';
  const spanN = (function(){
    if(!d) return PLAN_SPAN_MAX;
    const r = diagBuildReport(d);
    return planSpanDates(r.days, r.caps).length;
  })();
  if(mode === 'checking'){
    box.innerHTML = head + '<div class="dg-ai-loading"><span class="dg-spinner" aria-hidden="true"></span>正在确认会员权益…</div>';
    return;
  }
  if(mode === 'loading'){
    box.innerHTML = head + '<div class="dg-ai-loading"><span class="dg-spinner" aria-hidden="true"></span>'
      + '正在按你的容量倒排 ' + spanN + ' 天任务（全部可一键跳去做），通常 15 秒左右…</div>';
    return;
  }
  if(mode === 'success' && d && d.plan){
    const p = d.plan;
    box.innerHTML = head
      + '<div class="dg-plan-done">✓ 已生成计划：' + planMd(p.firstDate) + ' 起 ' + p.days + ' 天，共 ' + p.tasks + ' 个任务。'
      + '任务已排进每日计划，做完一件勾一件。</div>'
      + '<button type="button" class="btn-primary dg-block-btn" id="dgPlanGo">去今日任务开始做</button>'
      + '<button type="button" class="dg-text-btn" id="dgPlanAgain">重新生成计划</button>';
    document.getElementById('dgPlanGo').addEventListener('click', diagGoToday);
    document.getElementById('dgPlanAgain').addEventListener('click', diagGenPlan);
    return;
  }
  if(mode === 'locked'){
    box.innerHTML = head
      + '<div class="dg-plan-lock-msg">🔒 完整备考计划是会员功能。开通后一键得到：</div>'
      + '<ul class="dg-plan-perks">'
      + '<li>未来 ' + spanN + ' 天每天具体做什么，2-5 件事，全部能一键跳进对应功能</li>'
      + '<li>严格按你每天可学的分钟数排，不超量；按距考天数倒排，越临近越保守</li>'
      + '<li>每天免费自动重排：没做完的顺延不丢，时间不够按优先级压缩</li>'
      + '</ul>'
      + '<a class="btn-primary dg-block-btn" href="vip.html" style="text-decoration:none;text-align:center">开通会员 · 周卡 ¥19</a>'
      + '<div class="dg-plan-note">诊断报告与每日重排永久免费。</div>';
    return;
  }
  if(mode === 'error' && sub === 'login'){
    box.innerHTML = head + '<div class="dg-ai-msg">登录后才能生成完整备考计划。</div>'
      + '<a class="btn-primary dg-block-btn" href="login.html" style="text-decoration:none;text-align:center">去登录 / 注册</a>';
    return;
  }
  if(mode === 'error'){
    const msg = sub === 'bad' ? 'AI 这次排的计划没过本地校验（任务或时长不合规），没有落库，再试一次。'
      : '计划暂时没拿到（网络或服务波动），没有写入任何任务，再试一次。';
    box.innerHTML = head + '<div class="dg-ai-msg">' + msg + '</div>'
      + '<button type="button" class="dg-text-btn" id="dgPlanRetry">重试生成</button>';
    document.getElementById('dgPlanRetry').addEventListener('click', diagGenPlan);
    return;
  }
  /* idle：从未生成 */
  box.innerHTML = head
    + '<div class="dg-ai-msg">把诊断变成每天的具体任务：AI 按你每天能学的时间，排好未来 ' + spanN
    + ' 天的任务清单——每件都能一键跳进对应功能开始做，时间不够时还能每天免费重排。</div>'
    + '<button type="button" class="btn-primary dg-block-btn" id="dgPlanGen">生成我的 ' + spanN + ' 天备考计划</button>'
    + '<div class="dg-plan-note">诊断永久免费 · 完整计划为会员功能 · 每日重排免费</div>';
  document.getElementById('dgPlanGen').addEventListener('click', diagGenPlan);
}

/* =====================================================================================
   每日重排（commit4）：gen 任务一键跳转 + rebalance 免费重排 + 3 天未回来提示
   ===================================================================================== */

/* gen 任务 → 跳转信息 planGenJump 定义在 common.js（首页 index.js 不加载本文件，必须共用）：
   module → PLAN_GEN_PAGES 落地页；speaking.practice 的 params.qno 经 bankAt 换题 id 走 ?open=，
   其余落地 ?autostart=1；file 映射与本文件 PLAN_WL 同源（探针断言一致性）。 */

/* rebalance 请求载荷：只送今天未完成的生成项（done 的与手动项本地保留，不送 AI）。 */
function planRebalanceMessages(d, r, todayRow, capMin, onlyMin, pending){
  const t = todayKey();
  const p = getPlan(t);
  const doneToday = (p && Array.isArray(p.items)) ? p.items.filter(i => i && i.done).length : 0;
  const payload = {
    today: todayRow.iso,
    daysLeft: r.days,
    phase: r.phase ? r.phase.k : null,
    capacity: { weekdayMin:r.caps.wdMin, weekendMin:r.caps.weMin },
    capMin: capMin,
    onlyMin: onlyMin || 0,
    gaps: r.gaps,
    localConclusion: { key:r.verdict.k, text:r.verdict.text },
    doneToday: doneToday,
    pending: pending.map(i => ({
      text: i.text, module: i.module, action: i.action,
      carried: !!i.carried, minutes: planMinOf(i.text)
    }))
  };
  return [
    { role:'system', content:REBALANCE_AI_SYSTEM },
    { role:'user', content:'请按约定的 JSON 格式重新安排考生今天的任务：\n' + JSON.stringify(payload) }
  ];
}

/* 重排落库（只动今天）：
   - 已完成项（含 gen）与手动项（无 module）原样保留；
   - 今天所有未完成 gen 项被新清单替换，旧 id 全部登墓碑（跨端不复活）；
   - AI 新清单没覆盖到的旧任务 → 顺延明天（新 id、carried:true、fromId 指回；明天已有同文本
     未完成项则不重复），严禁静默丢弃；
   - d.plan.ts 刷新（3 天过期提示以此为准）+ 自打 _fieldTs。 */
function planRebalancePersist(day){
  const t = todayKey();
  const p = ensurePlan(t);
  p.items = Array.isArray(p.items) ? p.items : [];
  const oldGen = p.items.filter(i => i && i.module && !i.done);
  const keep = p.items.filter(i => !(i && i.module && !i.done));
  const newTexts = new Set(day.tasks.map(x => x.text));
  const moved = oldGen.filter(i => !newTexts.has(i.text));

  const tm = addDays(t, 1);
  let movedAdded = 0;
  if(moved.length){
    const tp = ensurePlan(tm);
    tp.items = Array.isArray(tp.items) ? tp.items : [];
    const existTexts = new Set(tp.items.filter(i => i && !i.done).map(i => i.text));
    moved.forEach(i => {
      if(existTexts.has(i.text)) return;
      existTexts.add(i.text);
      tp.items.push({ id:uid(), text:i.text, done:false, updatedAt:Date.now(),
        module:i.module, action:i.action, params:i.params || {}, gen:PLAN_GEN_TAG,
        carried:true, fromId:i.id });
      movedAdded++;
    });
  }

  const tombstones = oldGen.map(i => i.id);
  if(tombstones.length){
    DATA.deletedIds = DATA.deletedIds || [];
    tombstones.forEach(id => { if(DATA.deletedIds.indexOf(id) === -1) DATA.deletedIds.push(id); });
  }

  const now = Date.now();
  const fresh = day.tasks.map(x => ({ id:uid(), text:x.text, done:false, updatedAt:now,
    module:x.module, action:x.action, params:x.params, gen:PLAN_GEN_TAG }));
  p.items = fresh.concat(keep);   // 新任务在前；keep 自身相对顺序不变（done 项渲染时沉底）

  const d = DATA.settings && DATA.settings.diagnosis;
  if(d && d.plan){
    d.plan.ts = now;
    /* tasks 元信息重数：原排程日期范围内的 gen 项总数（顺延到明天的滚动项不计入本程） */
    let n = 0;
    (DATA.plans || []).forEach(pl => {
      if(pl && pl.date >= d.plan.firstDate && pl.date <= d.plan.lastDate && Array.isArray(pl.items)){
        n += pl.items.filter(it => it && it.module).length;
      }
    });
    d.plan.tasks = n;
    DATA.settings._fieldTs = DATA.settings._fieldTs || {};
    DATA.settings._fieldTs.diagnosis = now;
  }
  hubSave();
  return { added: fresh.length, moved: movedAdded, replaced: oldGen.length };
}

function setRbBusy(busy){
  rbBusy = !!busy;
  ['rbAll','rbCapGo'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.disabled = busy;
  });
  const a = document.getElementById('rbAll');
  /* 10/4 01:15 丙版：#rbAll 文案由「重新安排今天」缩为「重新安排」（省宽度） */
  if(a) a.textContent = busy ? '重排中…' : '重新安排';
  const c = document.getElementById('rbCapGo');
  if(c) c.textContent = busy ? '重排中…' : '压缩重排';
  /* 10/4 01:15：AI 跑的时候连「时间不够？」开关一起禁掉，避免中途点开导致状态错乱 */
  const m2 = document.getElementById('rbMore');
  if(m2){ m2.disabled = busy; m2.style.opacity = busy ? '.55' : ''; }
}

/* 每日重排：免费、无会员闸。onlyMin>0 = 「今天只能学 X 分钟」压缩。任何失败绝不落库。 */
async function diagRebalance(onlyMin){
  if(rbBusy) return;
  const t = todayKey();
  const p0 = getPlan(t);
  const pending = (p0 && Array.isArray(p0.items)) ? p0.items.filter(i => i && i.module && !i.done) : [];
  if(!pending.length){ toast('今天还没有可重排的 AI 任务'); return; }
  const d = DATA.settings && DATA.settings.diagnosis;
  if(!d){ toast('诊断数据缺失，先去「规划」完成诊断'); return; }

  const r = diagBuildReport(d);
  const dates = planSpanDates(r.days, r.caps);
  const todayRow = dates[0];
  let capMin = todayRow.capMin;
  if(onlyMin && onlyMin > 0){
    capMin = Math.max(10, Math.min(Math.round(onlyMin), todayRow.capMin));   // 下限 10 分钟，上限不超过日常容量
  }

  setRbBusy(true);
  try{
    const msgs = planRebalanceMessages(d, r, todayRow, capMin, (onlyMin && onlyMin > 0) ? capMin : 0, pending);
    const raw = await callRelay('rebalance', msgs, 0.4, { max_tokens:1500, json_mode:true });
    const out = planApplyAi(aiJson(raw), [{ iso:t, weekend:todayRow.weekend, capMin:capMin }], r.days);
    const day = out && out.length === 1 && out[0].date === t ? out[0] : null;
    if(!day){ toast('重排结果没过本地校验（任务或时长不合规），原计划未动'); return; }
    const st = planRebalancePersist(day);
    toast('已重新安排今天：' + st.added + ' 件任务' + (st.moved ? '，' + st.moved + ' 件顺延到明天' : ''));
    render();
    renderDiagEntry();
  }catch(e){
    if(e && e.code === 'AUTH_REQUIRED') toast('登录后才能使用每日重排');
    else if(e && e.code === 'user_limit') toast(e.msg || '免费额度暂时用完，稍后再试');
    else toast('重排没成功（网络或服务波动），原计划未动');
  }finally{
    setRbBusy(false);
  }
}
