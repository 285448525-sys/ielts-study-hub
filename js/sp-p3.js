/* === js/sp-p3.js · 口语页 H 区：P3 追问与 AI ===
 *
 * 10-24 T-009 S-4b：从 js/speaking.js 原样搬来，函数体一个字没改。
 * 本文件取自 speaking.js 的 12 段 / 363 行。
 *
 * 内容清单：
 *   renderP3Step            P3 逐题追问渲染（题号 + 朗读 + 题目 + 回答框 + AI辅助 + 结果容器）
 *   toggleTranslateP3Q      单题中文翻译开关
 *   renderP3All / p3Tier    整组渲染 / 档位判定
 *   p3HelperSys / p3ReviewSys    两个 AI 提示词
 *   parseP3Helper / generateP3Helper    AI 辅助解析与调用
 *   reviewP3Answer / parseP3Review / renderP3ReviewHtml   复盘解析与渲染
 *   renderP3Helper          辅助结果渲染
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 依赖（全局 function，defer 全部执行完才调用，顺序不影响）：
 *   H → G  spTargetBand（5 处）
 *   另用 sp-core 的 $ / escapeHtml，sp-stats 的 aiJson / callRelay
 *
 * 加载位置：speaking.html 里排在 sp-story.js 之后、sp-diag.js 之前。
 */
/* === P3 逐题追问渲染 ===
   行为：把第 i 题（已生成）渲染进 #p3List 末尾；首题无"上一题"标注，续题标注"追问 N"。
   每题：题号 + 朗读 + 题目 + 回答框 + AI辅助按钮 + 结果容器。
   绑定朗读 / AI辅助 / 回填已存辅助结果。保存事件（#p3SaveBtn）由 openDetail 统一绑定。 */
function renderP3Step(s, container, i){
  if(!container) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions) || !p3.questions[i]) return;
  const q = p3.questions[i];
  const qDisp = purifyP3Question(q);
  const savedAns = (Array.isArray(p3.answers) && p3.answers[i]) || '';
  const div = document.createElement('div');
  div.className = 'sp-p3-q';
  div.dataset.i = i;
  div.innerHTML = '<div class="sp-p3-q-head">'
    + '<span class="sp-p3-q-num">Q3-' + (i + 1) + (i === 0 ? '' : ' · 追问') + '</span>'
    + '<span class="sp-p3-q-text">' + escapeHtml(qDisp) + '</span>'
    + ttsBtnHtml()
    + '<button class="sp-p3-trans-btn" data-i="' + i + '" type="button" title="翻译为中文">译</button>'
    + '</div>'
    + '<div class="sp-p3-cn-line" data-i="' + i + '" hidden></div>'
    + '<textarea class="sp-p3-textarea" data-i="' + i + '" placeholder="写下或贴出你的 P3 回答（中英文均可）；没思路点「AI 辅助」，有思路点「老师帮我改」。">' + escapeHtml(savedAns) + '</textarea>'
    + '<div class="sp-p3-helper-row">'
    + '<button class="sp-p3-helper-btn" data-i="' + i + '" type="button" data-mode="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.5l-.9-2.3-2.1-.9 2.1-.9z"/></svg>AI 辅助</button>'
    + '<button class="sp-p3-review-btn" data-i="' + i + '" type="button" data-mode="review"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>老师帮我改</button>'
    + '</div>'
    + '<div class="sp-p3-ai-result" data-i="' + i + '"></div>';
  container.appendChild(div);
  const ttsBtn = div.querySelector('.sp-tts');
  if(ttsBtn) ttsBtn.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(qDisp, ttsBtn); });
  const transBtn = div.querySelector('.sp-p3-trans-btn');
  if(transBtn) transBtn.addEventListener('click', e => { e.stopPropagation(); toggleTranslateP3Q(s.id, i, transBtn); });
  const cnLine = div.querySelector('.sp-p3-cn-line');
  if(cnLine && p3.questionsCN && p3.questionsCN[i]){ cnLine.textContent = p3.questionsCN[i]; cnLine.hidden = false; }
  const aiBtn = div.querySelector('.sp-p3-helper-btn');
  if(aiBtn) aiBtn.addEventListener('click', e => { e.stopPropagation(); generateP3Helper(s.id, i); });
  const reviewBtn = div.querySelector('.sp-p3-review-btn');
  if(reviewBtn) reviewBtn.addEventListener('click', e => { e.stopPropagation(); reviewP3Answer(s.id, i); });
  // 9/22 之之：回车即「老师帮我改」（Shift+Enter 换行）
  bindEnterSubmit(div.querySelector('.sp-p3-textarea[data-i="' + i + '"]'), reviewBtn);
  const savedHelper = (Array.isArray(p3.aiHelper)) ? p3.aiHelper[i] : null;
  if(savedHelper && (savedHelper.main || savedHelper.extend || savedHelper.cn || savedHelper.raw)){
    const rEl = div.querySelector('.sp-p3-ai-result');
    if(rEl){ rEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div>'; renderP3Helper(rEl, savedHelper); }
  }
}

/* P3 单题翻译：点「译」把当前（已净化的）问题译为中文，内联显示在问题下方，不离开页面。
   结果缓存进 p3.questionsCN[i]，刷新或重开详情仍可见；再次点击切换显隐。 */
async function toggleTranslateP3Q(id, i, btn){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions) || !p3.questions[i]) return;
  const qDisp = purifyP3Question(p3.questions[i]);
  const cnLine = document.querySelector('#p3List .sp-p3-q[data-i="' + i + '"] .sp-p3-cn-line');
  if(!cnLine) return;
  // 已译过：切换显隐，不重复调接口
  if(p3.questionsCN && p3.questionsCN[i]){
    cnLine.hidden = !cnLine.hidden;
    return;
  }
  btn.disabled = true; const old = btn.textContent; btn.textContent = '…';
  try{
    const out = await callRelay('trans', [
      { role:'user', content:'把下面这道雅思口语 Part 3 问题翻译成自然、简单、易懂的中文。只输出中文译文本身，不要解释、不要英文、不要多余文字：\n\n' + qDisp }
    ], 0.3);
    const cn = String(out || '').trim();
    if(!cn) throw new Error('翻译结果为空');
    p3.questionsCN = p3.questionsCN || [];
    p3.questionsCN[i] = cn;
    hubSave();
    cnLine.textContent = cn;
    cnLine.hidden = false;
  }catch(e){
    toast('翻译失败：' + e.message);
  }finally{
    btn.disabled = false; btn.textContent = old;
  }
}

/* 重新渲染整段（用于回填已有 P3 数据：已有几题就渲染几题，并显示"下一道追问"到当前步） */
function renderP3All(s, container){
  if(!container) return;
  container.innerHTML = '';
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  const n = (p3 && Array.isArray(p3.questions)) ? p3.questions.length : 0;
  for(let i = 0; i < n; i++) renderP3Step(s, container, i);
}

/* P3 四档映射：L1≤5.0 / L2 5.5 / L3 6.0 / L4≥6.5（2026-10-12 取代 10/2 的 <6/≥6 二档；
   分档设计与档位文案经 Camille 批准，见 design/口语AI目标分分档_实施方案_2026-10-12.md。
   动机：原 prompt 按她个人 5.5 基础定制，宣发后涌入不同基础用户 → 按口语目标分分档。 */
function p3Tier(){
  const t = spTargetBand();
  return t <= 5 ? 'L1' : (t < 6 ? 'L2' : (t < 6.5 ? 'L3' : 'L4'));
}

// P3 单题 AI 辅助的 system prompt（四档化；结构仍是「锚句 + because 尾巴」，锚句库 8→12 条）
function p3HelperSys(){
  const t = spTargetBand(), tier = p3Tier();
  const head = `身份：雅思口语 Part 3 答题辅助工具，考生目标口语 ${t} 分（${tier} 档）。直接产出考场可说的完整英文回答——观点明确、带一个 because 拓展，词汇与句式严格匹配目标分，仍须口语化。`;
  /* 规则1 词汇四档：L1 保留 24 词池硬锁（低分用户举例子易跑偏）；L2 池优先+少量高中词；L3/L4 按分匹配 */
  const p3Rule1 = {
    L1: '1. 词汇：只用初中-高中最基础词。because 后面的理由（即「尾巴」）只能用以下「词汇池」里的词或其最简单变形：happy, tired, relax, relaxed, bored, boring, easy, hard, same, different, need, want, like, feel, study, work, family, friends, food, money, time, life, people, day。严禁使用 pool 以外的任何抽象词、学术词、生僻形容词/副词（如 cognitive, flexible, enhance, identity, landmark, concrete, construct, symbolize 等）。',
    L2: '1. 词汇：优先用「词汇池」里的最简单词（happy, tired, relax, easy, hard, same, different, study, work, family, friends, time, life, people, day 等），允许少量高中常见词（如 popular, convenient, healthy, important, improve）；严禁学术词与生僻词（如 cognitive, enhance, identity, landmark, concrete）。',
    L3: `1. 词汇与句式：与目标口语 ${t} 分匹配——可使用该分数段地道、自然的词汇与搭配（如 essential, efficient, responsibility, technology, environment 这一档），允许 1 个从句展开；必须像真人聊天一样口语化，不许堆砌书面大词。锚句可按题目用同档词汇自然改写，但结构仍是「锚句 + because 尾巴」。`,
    L4: `1. 词汇与句式：与目标口语 ${t} 分匹配——地道习语与自然搭配，允许从句展开与较高级表达；但必须像真人聊天一样口语化，不许背书面语、不许堆砌大词。锚句仅作结构参考，可按题目用同档词汇自然改写。`
  }[tier];
  /* 规则2 长度四档（10-15s → 20-30s 梯度） */
  const p3Rule2 = {
    L1: '2. 输出只给「一句话英文」：结构 = 锚句 + 尾巴（尾巴里已含 because，直接拼接，绝对不要再额外写 because）。总长度 2 句以内、10-15 秒说完。',
    L2: '2. 输出只给「一句话英文」：结构 = 锚句 + 尾巴（尾巴里已含 because，直接拼接，绝对不要再额外写 because）。总长度 2 句、10-20 秒说完。',
    L3: '2. 输出给「一小段话英文」：结构 = 锚句 + because 尾巴（直接拼接，不要再额外写 because），再接一个泛化例子句。总长度 2-3 句、15-25 秒说完。',
    L4: '2. 输出给「一小段话英文」：结构 = 锚句 + because 尾巴（直接拼接，不要再额外写 because），再接一个例子或补充句。总长度 3 句左右、20-30 秒说完。'
  }[tier];
  /* 规则3 例子环分档（原「全档禁 for example」是按 5.5 定制的短板：6 分最缺的正是展开一层） */
  const p3Rule3 = {
    L1: '3. 绝对禁止：for example / for instance / such as（一个都不许出现）；禁止中文、禁止解释「为什么这样答」、禁止三段式拆解；禁止出现两个 because。',
    L2: '3. 绝对禁止：for example / for instance / such as（一个都不许出现）；禁止中文、禁止解释「为什么这样答」、禁止三段式拆解；禁止出现两个 because。',
    L3: '3. 允许且仅允许一个泛化例子环：可用 "for example, ..." 引出概念性例子（如 for example, young people often...），禁止个人具体故事（不出现 I once / my family / last year 这类）；禁止中文与解释；禁止出现两个 because。',
    L4: '3. 允许泛化例子环：可用 "for example, ..." 或 "such as" 引出概念性例子；仍禁止长篇个人故事；禁止中文与解释；禁止出现两个 because。'
  }[tier];
  const p3Rule4 = '4. 重复问题：若考生连续追问，可用 "Well, like I said..." / "Well, what I mean is..." 换词重复，但不超过两次，第三次直接简化。';
  /* 答题逻辑的微调口径四档 */
  const p3PoolLogic = {
    L1: '- 如需结合当前题目微调，只能把尾巴里的词换成「词汇池」内的其他简单词（例如题目谈学习，就把 tired 换成 study is hard），不可引入 pool 外词汇；',
    L2: '- 如需结合当前题目微调，优先把尾巴里的词换成池内简单词，允许用少量高中常见词改写（如 convenient, popular），不可引入学术词；',
    L3: '- 如需结合当前题目微调，可在保持「锚句 + because 尾巴」结构的前提下，用与目标分匹配的地道词汇改写尾巴；例子句须泛化、贴合题目主题；',
    L4: '- 如需结合当前题目微调，可在保持「锚句 + because 尾巴」结构的前提下，用地道搭配改写尾巴；例子句须泛化、贴合题目主题；'
  }[tier];
  /* 输出格式示例随档位变（L3/L4 含例子环） */
  const tierOutEx = {
    L1: "锚句 + 尾巴，例如：Actually, I don't think there is much difference, because the feeling is the same.",
    L2: "锚句 + 尾巴，例如：Actually, I don't think there is much difference, because the feeling is the same.",
    L3: "锚句 + 尾巴 + 泛化例子，例如：It has both good and bad sides, because it is convenient but sometimes boring. For example, it saves time but costs more.",
    L4: "锚句 + 尾巴 + 例子或补充句，例如：It has both good and bad sides, because it is convenient but sometimes boring. For example, it saves time but costs more."
  }[tier];
  return `${head}

考生特点：P3 通常只能说 2-3 句话、说话会磨叽带停顿；听不懂题目时靠判断「题型」来兜底。你的任务：根据「当前 P3 题目 + 考生 P2 素材」，直接产出考场可说的完整英文回答——锚句（观点）紧跟 because 拓展，说完即止，不解释、不乱加。

【绝对强制硬规则】
${p3Rule1}
${p3Rule2}
${p3Rule3}
${p3Rule4}

【题型 → 锚句库（按题型命中，不得自创；锚句不含 because，尾巴已含 because，直接拼接）】
- 区别/变化类（听到 different / change / same）：Actually, I don't think there is much difference.
  尾巴：because the feeling is the same.
- 原因类（听到 why / reason）：I think it's because people want to relax.
  尾巴：because they are tired and need a break.
- 好坏类（听到 good / bad / advantage）：It has both good and bad sides.
  尾巴：because it is convenient but sometimes boring.
- 应不应该类（听到 should / necessary）：It depends on the person.
  尾巴：because some people need it, some don't.
- 未来类（听到 future / will）：I think it will be the same as now.
  尾巴：because people still want the same things in daily life.
- 同意与否类（听到 agree / opinion）：I partly agree.
  尾巴：because it is true for some, not for all.
- 重要性类（听到 important）：Yes, I think it is important.
  尾巴：because it makes life happier.
- 过去与变化类（听到 did you ... when you were a child / used to）：Yes, I did when I was younger.
  尾巴：because it was a big part of my life back then.
- 喜好偏向类（听到 prefer / which do you like better）：I prefer the former, to be honest.
  尾巴：because it fits my daily life better.
- 频率习惯类（听到 how often / do you usually）：Not that often, maybe once or twice a week.
  尾巴：because I am usually busy with study.
- 感受描述类（听到 how do you feel about / what is it like）：It makes me feel relaxed.
  尾巴：because it helps me slow down a little.
- 没听懂/空白（听不清题）：That's a hard one.
  尾巴：because I just want to be happy and relaxed.

【答题逻辑】
- 先判断题型（看题目里的信号词），命中上面对应锚句；
- 输出 = 该行「锚句」+「尾巴」，直接拼接（锚句结尾无句号，尾巴以 ", because" 开头）；绝对不要再单独写 because；
${p3PoolLogic}
- 如果考生提供了 P2 素材且贴合，可在尾巴后用 and 接一个贴合素材的简单短语（不举具体人名/地名故事）。

【输出格式：严格按下面示例的结构输出，不要任何前缀 / 解释 / 换行分段】
<${tierOutEx}>`;
}

// P3「老师帮我改」：2026-10-12 四档化（取代 10/2 的 <6/≥6 二档，设计见 design/口语AI目标分分档_实施方案_2026-10-12.md）。
// 🔴 输出格式两行也要按档参数化——原「（2句以内，无例子）」写死，L3/L4 放开例子环后会与规则互斥（10/2 互斥病同款）。
function p3ReviewSys(){
  const t = spTargetBand(), tier = p3Tier();
  const head = `你是雅思口语Part3答题老师，考生目标口语 ${t} 分（${tier} 档）。直接给一版与目标分匹配的改动后回答（英文），表达自然、准确即可，词汇句式严格匹配目标分。`;
  const rvIntro = `直接给一版与目标口语 ${t} 分匹配的改动后回答（英文）：词汇句式自然达到该分数段，但口语化、不堆砌书面大词。`;
  const rvRule1 = {
    L1: '1. 词汇：只能用初中-高中最基础词汇，禁止identity, landmark, concrete, shape, construct, symbolize等；统一用look, famous, tall building等简单词。',
    L2: '1. 词汇：优先初高中最基础词，允许少量高中常见词（如 popular, convenient, healthy, important）；禁止学术词与生僻词（identity, landmark, concrete, construct, symbolize等）。',
    L3: `1. 词汇：与目标口语 ${t} 分匹配，可使用该分数段地道的口语词汇与搭配，允许 1 个从句展开；表达必须准确、自然、口语化，不生硬堆大词。`,
    L4: `1. 词汇：与目标口语 ${t} 分匹配，地道习语与自然搭配，允许从句展开与较高级表达；表达必须准确、自然、口语化，不背书面语。`
  }[tier];
  const rvRule2 = {
    L1: '2. 主回答铁则：2句以内、10-15秒；只含观点+1个最简单原因；绝对禁止for example/for instance/such as；最多1个简单复合结构。',
    L2: '2. 主回答铁则：2句、10-20秒；观点明确并带原因展开；绝对禁止for example/for instance/such as；最多1个简单复合结构。',
    L3: '2. 主回答铁则：2-3句、15-25秒；观点明确并带原因展开，可再接1个泛化例子句（for example + 概念性例子，禁止个人具体故事）；允许与目标分匹配的复合结构。',
    L4: '2. 主回答铁则：3句左右、20-30秒；观点+原因展开+例子或补充；可用for example/such as引出概念性例子；允许自然长句。'
  }[tier];
  /* 输出格式行四档（防互斥指令） */
  const rvFmt = {
    L1: '主回答：xxx（2句以内，无例子）',
    L2: '主回答：xxx（2句，无例子）',
    L3: '主回答：xxx（2-3句，可含1个泛化例子）',
    L4: '主回答：xxx（3句左右，可含例子）'
  }[tier];
  return `${head}
考生会贴出自己针对某道P3题目的回答（可能是中文，也可能是英文）。请你只做一件事：${rvIntro}不要挑问题、不要写中文说明、不要寒暄。

【绝对强制硬规则】
${rvRule1}
${rvRule2}
3. 追问拓展铁则：3句以内，必须含1个because从句；最多额外1个固定结构（especially for / which means二选一）；用抽象化P2素材举例，禁止具体个人故事。
4. 若考生贴的是中文：按合规的英文主回答直接翻译，不解释。

【输出格式：严格只输出下面两段，不要任何前缀/解释/寒暄】
${rvFmt}
追问拓展：xxx（3句以内，含because，可选）`;
}

// 把 AI 返回的 🔹 三段式文本拆成 {main, extend, cn}
function parseP3Helper(content){
  const r = { main:'', extend:'', cn:'', raw: content || '' };
  if(!content) return r;
  const parts = String(content).split('🔹');
  const take = (txt) => {
    txt = (txt || '').trim();
    const nl = txt.indexOf('\n');
    return nl >= 0 ? txt.slice(nl + 1).trim() : txt;
  };
  if(parts[1] != null) r.main = take(parts[1]);
  if(parts[2] != null) r.extend = take(parts[2]);
  if(parts[3] != null) r.cn = take(parts[3]);
  if(!r.main && !r.extend && !r.cn) r.main = String(content).trim();
  return r;
}

async function generateP3Helper(id, i){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  if(!p3 || !Array.isArray(p3.questions)){ toast('还没有 P3 题目，先点「P3追问」生成'); return; }
  const q = p3.questions[i];
  if(!q){ toast('题目为空'); return; }
  // 考生 P2 回答文本：优先实时框内，否则已存
  const ta = document.getElementById('p2Ans');
  const p2Text = (ta && ta.value && ta.value.trim()) || (s.answers.p2 && s.answers.p2.text) || '';

  const qDiv = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"]');
  const btn = qDiv ? qDiv.querySelector('.sp-p3-helper-btn') : null;
  const resultEl = qDiv ? qDiv.querySelector('.sp-p3-ai-result') : null;

  if(btn){ btn.disabled = true; btn.innerHTML = 'AI 在生成…'; }
  if(resultEl){ resultEl.innerHTML = '<div class="diag-note">正在按 ' + spTargetBand() + ' 分策略生成 P3 参考答案…</div>'; resultEl.style.display = 'block'; }

  try{
    const content = await callRelay('p3_aihelper', [
      { role:'system', content: p3HelperSys() },
      { role:'user', content:'当前P3题目：' + q + '\n\n用户的P2回答内容：\n' + (p2Text || '（考生暂未填写 P2 回答，请用通用素材作答）') }
    ], 0.7);
    const parsed = parseP3Helper(content);
    p3.aiHelper = p3.aiHelper || [];
    p3.aiHelper[i] = { main: parsed.main, extend: parsed.extend, cn: parsed.cn, raw: content, ts: Date.now() };
    s.updatedAt = Date.now();
    hubSave();
    if(resultEl){ resultEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div>'; renderP3Helper(resultEl, p3.aiHelper[i]); }
  }catch(e){
    if(resultEl) resultEl.innerHTML = '<div class="sp-p3-result-tag">AI 辅助 · 参考答案</div><div class="diag-note">生成失败：' + escapeHtml(e.message) + '</div>';
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.5l-.9-2.3-2.1-.9 2.1-.9z"/></svg>AI 辅助'; }
  }
}

// 考生用同一个回答框里的内容，老师按 5.5 规则挑问题 + 给改后合规版本
async function reviewP3Answer(id, i){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const qDiv = document.querySelector('#p3List .sp-p3-q[data-i="'+i+'"]');
  const ta = qDiv ? qDiv.querySelector('.sp-p3-textarea') : null;
  const btn = qDiv ? qDiv.querySelector('.sp-p3-review-btn') : null;
  const resultEl = qDiv ? qDiv.querySelector('.sp-p3-ai-result') : null;
  if(!ta || !btn || !resultEl) return;
  const userText = (ta.value || '').trim();
  if(!userText){ toast('先在上面写或贴一下你的 P3 回答'); ta.focus(); return; }
  const p3 = s.answers && s.answers.p2 && s.answers.p2.p3;
  const q = (p3 && Array.isArray(p3.questions) && p3.questions[i]) || '';
  const p2TextEl = document.getElementById('p2Ans');
  const p2Text = (p2TextEl && p2TextEl.value && p2TextEl.value.trim()) || (s.answers.p2 && s.answers.p2.text) || '';

  btn.disabled = true; btn.innerHTML = '老师在看…';
  resultEl.innerHTML = '<div class="diag-note">老师正在按 ' + spTargetBand() + ' 分规则看你刚写的回答…</div>';
  resultEl.style.display = 'block';
  try{
    const content = await callRelay('p3_review', [
      { role:'system', content: p3ReviewSys() },
      { role:'user', content:'当前P3题目：' + q + '\n\n用户的P2回答内容：\n' + (p2Text || '（考生暂未填写 P2 回答）') + '\n\n考生自己的P3回答（待修改）：\n' + userText }
    ], 0.6);
    const parsed = parseP3Review(content);
    resultEl.innerHTML = '<div class="sp-p3-result-tag">老师改动</div>' + renderP3ReviewHtml(parsed);
    resultEl.style.display = 'block';
    // 绑定朗读
    resultEl.querySelectorAll('.sp-p3-tts').forEach(b => {
      const body = b.closest('.sp-p3-block').querySelector('.sp-p3-block-body');
      const txt = body ? body.textContent.trim() : '';
      if(txt) b.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(txt, b); });
    });
  }catch(e){
    resultEl.innerHTML = '<div class="sp-p3-result-tag">老师改动</div><div class="diag-note">老师暂时改不了：' + escapeHtml(e.message) + '</div>';
  }finally{
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:15px;height:15px;flex:none"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>老师帮我改';
  }
}

// 把 AI 返回的「主回答：x / 追问拓展：y」拆成 {main, extend}
function parseP3Review(content){
  const r = { main:'', extend:'', raw: content || '' };
  if(!content) return r;
  const txt = String(content);
  // 抽「主回答：」段到「追问拓展：」或末尾之间
  const mMain = txt.match(/主回答[：:]\s*([\s\S]*?)(?=(?:\n\s*追问拓展[：:])|$)/);
  if(mMain) r.main = mMain[1].trim();
  // 抽「追问拓展：」段到末尾
  const mExtend = txt.match(/追问拓展[：:]\s*([\s\S]*?)$/);
  if(mExtend) r.extend = mExtend[1].trim();
  // 兜底：若 AI 没按格式输出，整段当主回答
  if(!r.main && !r.extend) r.main = txt.trim();
  return r;
}

// 渲染「老师帮我改」结果：只一个块，里面包含主回答 + 追问拓展，整块可朗读
function renderP3ReviewHtml(r){
  if(!r) return '';
  const all = [];
  if(r.main) all.push('主回答：' + r.main);
  if(r.extend) all.push('追问拓展：' + r.extend);
  if(!all.length) return '<div class="diag-note">（返回格式异常，已保留原文）</div><pre>' + escapeHtml(r.raw || '') + '</pre>';
  let body = all.join('\n\n');
  let h = '';
  h += '<div class="sp-p3-block">';
  h += '<div class="sp-p3-block-title">改后回答<span class="sp-p3-sub">可直接照着说</span></div>';
  h += '<div class="sp-p3-block-body">' + escapeHtml(body) + '</div>';
  h += '<div class="sp-p3-block-tools">' + ttsBtnHtml('sp-p3-tts') + '</div>';
  h += '</div>';
  return h;
}

// 渲染 P3 单题 AI 辅助结果（极简：仅显示一句英文，不附加说明）
function renderP3Helper(el, r){
  if(!el || !r) return;
  let h = '';
  // 仅渲染主回答（英文，可朗读）；新 prompt 只返回一句英文，落在 main 上
  if(r.main){
    h += '<div class="sp-p3-block">';
    h += '<div class="sp-p3-block-title">AI 辅助 · 参考答案<span class="sp-p3-sub">考场直接说 · 一句即可</span></div>';
    h += '<div class="sp-p3-block-body">' + escapeHtml(r.main) + '</div>';
    h += '<div class="sp-p3-block-tools">' + ttsBtnHtml('sp-p3-tts') + '</div>';
    h += '</div>';
  }
  if(!h){
    h = '<div class="diag-note">（生成结果格式异常，已保留原文）</div><pre>' + escapeHtml(r.raw || '') + '</pre>';
  }
  el.innerHTML = h;
  el.style.display = 'block';
  // 绑定朗读（每个英文块右上角的 TTS 朗读该块正文）
  el.querySelectorAll('.sp-p3-tts').forEach(b => {
    const body = b.closest('.sp-p3-block').querySelector('.sp-p3-block-body');
    const txt = body ? body.textContent.trim() : '';
    if(txt) b.addEventListener('click', e => { e.stopPropagation(); speakQuestion.speak(txt, b); });
  });
}
