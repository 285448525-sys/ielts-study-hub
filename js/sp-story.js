/* === js/sp-story.js · 口语页 G 区：P2 串题（design/87） ===
 *
 * 10-23 T-009 S-4：从 js/speaking.js 原样搬来，函数体一个字没改。
 * 本文件取自 speaking.js 的 24 段 / 685 行。
 *
 * 内容清单：
 *   var SYS_CHUAN_PLAN / SYS_CHUAN_FINAL / CHUAN_AIFILL_SUFFIX   三个串题提示词模板
 *   window.buildStoryPlainText                                    串题稿 → 可复制纯英文全文（挂 window 便于探针单测）
 *   storyWordBudget / spTargetBand / spDiagTierHead / spPersonaLine
 *   spGuideCardHtml / spBindMatGuideBtn
 *   chuanMatsText / chuanUserMsg / chuanSysWithMats / chuanFillPh
 *   aiStoryLink / planChuan / finalChuan / setStoryLinkBtn
 *   mdInline / copyTextFallback / copyStoryText
 *   renderStoryLink / renderStoryLinkV2 / chuanParas / renderChuanFinal
 *   extractStoryKeywords / renderChuanSlotFill / renderChuanUnfit
 *   bindStoryTools / watchSpeakEnd / resetSpeakBtn
 *
 * 🔴 红线一：只换文件住址，函数体一字未改（T-009 唯一要求）。
 * 🔴 红线二：所有顶层声明一律 var / function —— 软导航用 window.eval 逐文件重跑，
 *   const 只活在那一次 eval 的词法作用域，到隔壁文件里就是 undefined。
 *   （函数体内部的 const/let 不受影响，本文件保留原样。）
 * 🔴 红线三：不带 BOM。
 *
 * 依赖（全局 function，defer 全部执行完才调用，顺序不影响）：
 *   G → F  matLoadStore / matAddDetailBits
 *   被 F（详情页）、J（诊断）、H（P3）调用（含 spTargetBand / spDiagTierHead / spPersonaLine）
 *   另用 sp-core 的 $ / escapeHtml，sp-stats 的 aiJson / callRelay
 *
 * 加载位置：speaking.html 里排在 sp-core / sp-stats / sp-list 之后、sp-diag.js 之前。
 */
/* === 口语目标分 → 串题稿词数预算（P1：按考生目标语速校准，目标越低语速越慢/卡顿越多，稿子越短）=== */
function storyWordBudget(){
  const t = spTargetBand();   /* 10/12：与全站口语分档统一口径（原 parseFloat(...)||5.5 是独立第二套口径） */
  // 口径（9/21 修订）：考生慢语速约 100wpm、卡顿较多；正文(open+bridge+body+feel)目标念 70–85 秒，
  // 其余时间靠 paddingEn 加时句补足 2 分钟。padding 是必背项不是可选项。
  if(t >= 6.5) return { target: t, min: 140, max: 160 };
  if(t >= 6.0) return { target: t, min: 130, max: 150 };
  return { target: t, min: 120, max: 140 };
}

/* 口语目标分动态画像（商业化）：全部 prompt 的「目标/基础」描述统一从这里出，不再写死 5.5 */
function spTargetBand(){
  const tg = (DATA && DATA.settings && DATA.settings.targets) || {};
  const s = parseFloat(tg.speaking);
  /* 10/2 修：空目标分落库是数字 0（data.js 默认/settings 保存口径），isNaN(0)=false 会穿透，
     画像句变成「考生目标口语 0 分」，与「没填兜底 5.5」的设计相悖。0 一律按未填处理。
     10/12 分档改造：引导只写 overall（common.js onbWriteTarget），只走引导没进设置页的用户
     speaking=0 → 兜底链升级 speaking>0 → overall>0 → 5.5，否则整站口语 AI 全按 5.5 档伺候 6.5 用户。 */
  if(s > 0) return s;
  const o = parseFloat(tg.overall);
  if(o > 0) return o;
  return 5.5;
}
/* P1/P2 纠错（speaking_diagnose）档位头：SYS_DIAG/SYS_DIAG_P2 常量本体零改动（P1 prompt 铁律），
   只在调用点 system 前拼接目标分校准段，让 5 分和 7 分用户收到不同严格度的纠错（2026-10-12 四档改造）。 */
function spDiagTierHead(){
  const t = spTargetBand();
  return '【考生目标分】口语 ' + t + ' 分。纠错的严格度、词汇建议的难度、改写示范的档位，全部按这个水平校准：'
    + (t < 6
        ? '目标分较低：只纠明确的硬错（时态/词序/双动词/缺 be/词性一类），不给超出该水平的高级改法与生僻表达。'
        : '目标分较高：在纠错之外，可以给「更地道」的升级建议与更丰富的表达。')
    + '考生没写错的部分绝不挑刺。\n\n';
}

function spPersonaLine(){
  const t = spTargetBand();
  if(t >= 7)   return '考生目标口语 ' + t + ' 分：可以使用较复杂的句式与少量高级词汇，但必须自然、口语化，不堆砌大词、不背书面语。';
  if(t >= 6.5) return '考生目标口语 ' + t + ' 分：句子以简单句为主、适当穿插复合句，词汇可用少量较高级表达，整体仍须朴素自然、像真人聊天。';
  if(t >= 6)   return '考生目标口语 ' + t + ' 分：句子以简单句为主，每段可有一个复合句，词汇以初高中常见词为主，避免生僻学术词。';
  return '考生目标口语 ' + t + ' 分：句子以简单句为主，词汇难度上限=高中词汇水平（如 important, enjoy, convenient, improve 这类常见词），严禁使用生僻词、学术词、GRE/雅思高级词汇（如 detrimental, paramount, facilitate 一律不行）；拿不准的词一律换成最简单的说法。';
}

/* 空依赖引导卡（design/81）：AI 功能撞到「没素材」等空态时给一张可点的下一步卡片，
   替代一闪而过的 toast。btnHtml 由调用方传入（内部已 escape / 固定文案，不再二次处理）。
   （「去设置填 Key」按钮 spKeyGuideBtn 已随设置页 AI 模块下线删除，10/1。） */
function spGuideCardHtml(title, desc, btnHtml){
  return '<div class="sp-guide"><div class="sp-guide-title">' + escapeHtml(title) + '</div>'
    + '<div class="sp-guide-desc">' + desc + '</div>'
    + (btnHtml ? '<div class="sp-guide-actions">' + btnHtml + '</div>' : '')
    + '</div>';
}
/* 无素材引导卡的「去素材生成」：复用顶部 pill-tabs 的 MAT 按钮（点它 = 走现有切换入口，不另写切换） */
function spBindMatGuideBtn(el){
  const b = el && el.querySelector('#spGoMatBtn');
  if(!b) return;
  b.addEventListener('click', () => {
    const tab = document.querySelector('#tabs [data-type="MAT"]');
    if(tab) tab.click();
  });
}

/* === design/87：P2 串题要点驱动（bullet-driven）=== */
/* 阶段一规划 prompt：{FORBIDDEN} 为禁词表占位，调用时替换，严禁硬编码。
   她拍板（9/23）：只出一段整段稿、字数够用——不出「标准版/加时版」两版，词数固定 180~200（约 100wpm 念满 2 分钟）。 */
var SYS_CHUAN_PLAN = `你是雅思口语 P2 串题规划师。{SP_TARGET} 语速平稳。你拿到一道 P2 真题（含 You should say 四个 bullet）和考生的真实素材库。

⚠️⚠️ 本题最重要的前提，先读懂它⚠️⚠️
官方 P2 的 bullet 全部是**问句标签**（形如 "What difficult thing this person did"、"Why this person was successful"），
它们只说明"要讲哪一类内容"，**完全没有规定必须讲什么具体内容**。这是本题最大的坑：
· 如果你只照着 bullet 的字面意思去凑，就会把素材里跟题目无关的细节拉进来充数，
  最后几句才想起来点一下题 —— 这种稿子一眼就能看出是背题套的，**严禁**。
· 你必须先做"**内容落地**"：把每个 bullet 结合**本题题意**翻译成**一句具体的、必须出现在稿子里的事实要求**
  （写清"要说哪件事"，不是"要说哪类事"），然后拿这个要求去素材里找对应事实。
  找不到就如实标 missing —— **宁可拒绕，也绝不硬凑**。

核心原则：【题目要点驱动 + 内容落地 + 不够就说不够】
· 不是把素材故事包装成这道题，而是先看题目要考生讲哪几件事，再去素材里找能回应这些要点的事实；
· 严禁头尾点题、中间跑题的硬串；
· **判定能不能串，看"每个 bullet 能不能落到素材里的具体事实上"，不看"这个故事听起来像不像这类题"。**

工作步骤：
0. 【新增·最关键】先写 contentMap：把每个 bullet 翻译成一句**具体的事实要求**（中文，一句话，必须能被素材满足）。
   例：题目 "Describe a person you know who did something difficult and was successful"
   →bullet[1]"What difficult thing this person did" 的 contentMap 不能写"要讲他做的困难的事"（这是复述 bullet，没用），
     而要写"**要说清他遇到的那个具体困难是什么**（不是'生活有挑战'这种空话）"。
1. 建 slotCheck：把每个 bullet 作为一个槽位（用 contentMap 的要求去核对，不是用 bullet 字面意思）：
   · covered：素材里有明确、直接的事实能回应（给 evidence，中文引素材原事实）；
   · weak：沾边但不直接，需要换角度叙述（给 evidence 与换角度说明）；
   · missing：素材里完全没有对应事实。
2. 定 fit（**判定标准只看"bullet 能不能落到素材的具体事实上"，不看故事像不像这类题**）：
   · natural：**四个 bullet 全部 covered**（允许最多 1 个 weak 且换角度后能自然说），素材故事主体内容与题目同向，
     把故事原样讲、自然过渡即可；
   · adaptable：**至少 1 个 bullet 真的 missing**，但题目主干（多数 bullet）可由素材承担，
     考生补几条真实细节就能完整回应；
   · unfit：**题目主干槽（≥2 个 bullet）missing，或素材主题与题目要求的方向相反** —— 补一两句过渡也圆不上。

   ⚠️ **判定纪律（防止你为了交差硬凑）**：
   · 「这段素材里有某种困难」≠ 能回答 "What difficult thing this person did"。
     只有素材里**具体的、可复述的那件事**才算 covered；泛泛的"他生活不易""他很努力"一律算 missing。
   · 判natural 前必须**逐条自问**："如果我把稿子给一个只看过题的人看，他能不能指出这句在回答哪个 bullet？"
     指不出来的句子就是跑题句，必须删。
   · **宁可给 unfit 也不要给一段跑题稿**—— unfit 会引导她去素材页补一段真素材（一次投入，长期能用），
     而跑题稿她背了就是白背、考场还会被追问击穿。
3. adaptable 时给 missingQuestions：为每个 missing/weak 槽出一个补槽小问，2~5 个，严格遵守：
   · 漏斗式：yesno 或 choice 为主（2~5 个具体口语化选项 + 固定末项「其他」自填），必要时才用 text；
   · 带时间锚点（那次旅行 / 当时 / 出发前）；一次只问一件事；严禁「说说/讲讲/谈谈/你觉得」；
   · k 为槽位短英文键；label 为中文问题；type 为 yesno|choice|text；options 为选项数组。
4. natural 时直接给 fullEn（写作铁律见下）。
5. unfit 时给 unfitReason（一句中文说明为什么串不动）和 suggestCard（建议补什么主题的素材，一句中文）。

【讲稿写作铁律】
A. 事实分层（核心）：故事骨架——核心事件、时间、地点、人物、结果——必须来自素材库或考生补充答案，严禁改动或虚构；血肉细节——天气、颜色、气味、声音、一句简短对话、内心独白、身体反应（心跳加速/手心出汗/笑出声）——鼓励适度虚构，让画面真实可信。细节不得与骨架矛盾、不得新增核心事件、不得离谱（不出现名人露面/夸张巧合/奇观堆叠）。
B. 讲故事，不念清单（核心）：第一人称，像当面跟朋友聊一段亲身经历；全篇至少体现一种真实情绪（期待/紧张/惊喜/遗憾/温暖/自豪）；句与句之间必须用自然的口语过渡与连接（You know, / To be honest, / At first, / and then, / What made it special was / The funny thing is / Looking back, / That's why...），严禁一句一个事实的平铺罗列；可适度自嘲或感叹，增加活人感。
C. 素材句处理：保留素材句的信息要点与关键实词，允许为流畅而重组语序、增删修饰成分；新写的句子用简单句 + 初高中常见词；严禁 {FORBIDDEN}。
D. fullEn 为整段讲稿（只出一段，不出两版），**词数 110~150（P2 考试说满 2 分钟约 250-300 词，但这是「素材」不是「考场稿」，
   考场稿长度由你另出；这里给的是背诵素材，写太长你背不下来）**；
   按说话顺序：开头 1 句自然点题（I'd like to talk about... 或等价自然说法，融入正文，不要单列）
   → **主体按四个 bullet 顺序逐点回应，每个 bullet 2-3 句**
   → 结尾 1 句收束在普适感受上（如 it's still one of my favorite memories / it taught me that...）。
   ⚠️ 词数是**上限意识**：宁可 110 词每句都扣题，不要 180 词里一半在写氛围。
   ⚠️ **段落划分要服务于 bullet**：用 and then / What's more / And another thing 等连接词，
   让考生能听出"这段在回答第几点"。
E. 扣题比例（硬约束，改为**按 bullet 逐个验**，不是按句子比例）：
   · **每一个 bullet 都必须至少有一句明确回应它的句子**（四个 bullet → 四处明确回应，一处都不能靠"顺便提到"）。
     原来的「≥60% 句子回应」太松：一句话可以又长又空，凑够数量但没答到点上 —— **本条已废止**。
   · 跑题句的判定：这句话删掉后，读者能不能看出少了哪个 bullet 的信息？能 → 不算跑题。**不能 → 必须删或重写。**
   · **写完逐 bullet 自检并输出 selfCheck**：对四个 bullet 各自写出「由稿中哪一句回应」（引原句）+
     判 covered/weak/missing。只要有一个 missing 就**不要出 fullEn**，改判 fit。
   · 背景/氛围/外貌描写**总共不得超过稿子的 1/3**；超过就是拿氛围话凑字数。
   · **开头点题句只点题、不承担 bullet**；结尾 1 句收束即可。中间主体按 bullet 顺序逐点回应。
   · **严禁"最后两句才点题"**：开头/中间必须就在扣题，末尾补一句点题不算扣题。
F. fullEn 为纯英文、可直接朗读；不要任何 STEP 编号、不要中文。
G. logicChain：中文短语用横杠「-」串接的完整逻辑链（事件内核-情感内核-可迁移点）；mappingZh：固定四段——用哪张卡 → 走哪个角度 → 各 bullet 用素材什么事实填 → 点题怎么转。
H. keywords：从 fullEn 提取 8~14 个按叙事顺序排列的英文关键词短语，每项 2~5 个实词（保留稿中原文措辞，不解释、不编号、不写中文），覆盖开头点题→逐 bullet→结尾收束的完整脉络。

输出严格 JSON，不要解释文字：
{"fit":"natural|adaptable|unfit",
 "contentMap":[{"idx":0,"bullet":"","need":"把该bullet 翻译成的一句具体事实要求（中文）","素材里对应的事实":"中文引素材原句；没有就空字符串"}],
 "slotCheck":[{"bullet":"","need":"同上 contentMap 的 need","status":"covered|weak|missing","evidence":""}],
 "selfCheck":[{"idx":0,"by":"稿中回应这个 bullet 的原句（引英文）","ok":true}],
 "missingQuestions":[{"k":"","type":"yesno|choice|text","label":"","options":[]}],
 "fullEn":"",
 "logicChain":"","mappingZh":"",
 "keywords":[""],
 "unfitReason":"","suggestCard":""}`;

/* 阶段二成稿 prompt：素材事实 + 考生补槽答案 → 一段完整独白 */
var SYS_CHUAN_FINAL = `你是雅思口语 P2 串题成稿助手。考生对一道 P2 题已完成素材核对，并通过几个小问题补充了真实细节（见下）。请把【素材事实 + 考生补充答案】按题目 bullet 的顺序写成一段可直接朗读的完整独白。

铁律：
1. 考生补充的每条答案都是真实事实，必须自然写进对应 bullet 的段落，不得遗漏；补充答案与素材事实冲突时以补充答案为准。
2. 若考生选择「不补直接出稿」（补充答案为空或部分为空）：没有事实的 bullet 严禁编造具体新事件，用素材已有事实 + 通用感受句自然带过（可以写情绪反应，不写具体新事实）；并在 weakBullets 中列出仍偏弱的 bullet 下标（从 0 开始）。
3. 写作铁律沿用阶段一 A~G：骨架事实不编造、血肉细节（感官/情绪/过渡）鼓励适度虚构、讲故事不念清单、**fullEn 110~150 词**、词汇分级与禁词（{FORBIDDEN}）、纯英文无 STEP。
4. 开头点题与结尾收束自然成段，不要单列模块。

⚠️⚠️ 阶段二同样要扣题（最容易被破坏的一环）⚠️⚠️
阶段一已经把每个 bullet 翻译成了"具体事实要求"，**成稿时必须照着那份要求逐条落笔**：
· **每个 bullet 至少 2-3 句明确回应**，按 bullet 原顺序推进，用 and then / What's more / And another thing 标出转折，让考生听得出"这段在答第几点"。
· **严禁把补槽答案塞进"最后两句"草草带过** —— 补的细节要织进对应 bullet 的段落中间，与周围句子自然连上。
· **严禁注水**：背景/外貌/氛围描写合计不超过 1/3；宁可用信息量，不要用形容词凑长度。
· **自检后再交**：逐 bullet 引稿中原句说明由哪句回应（selfCheck），**任一 bullet 找不到对应句→ 不要出 fullEn**，
  把 fit 降为 adaptable 并把该 bullet 下标写进 weakBullets，让前端提示"这题还有 N 处偏弱，别死背"。
· 考生补的答案若与题目主干方向冲突（他要讲困难却补了件顺利事），**照实写但标进 weakBullets** —— 不要硬拗成扣题的样子。

输出严格 JSON：
{"fit":"adaptable|natural","fullEn":"","selfCheck":[{"idx":0,"by":"稿中回应该 bullet 的原句（引英文）"}],
 "logicChain":"","mappingZh":"","keywords":[""],"weakBullets":[]}`;

/* 素材分级注入（沿用旧口径）：pinned 优先；第 1 张发全文，其余只发摘要（storyEn 是最长字段，多卡时 90% 输入 token 烧在它身上） */
function chuanMatsText(){
  const store = matLoadStore();
  const mats = ((store && store.materials) || []).filter(Boolean).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  let t = mats.map((m, i) => {
    const head = '【素材 ' + (i + 1) + '：' + (m.title || '未命名') + '】';
    const golden = '万能句（任何题都能套，优先整句使用）：' + ((m.goldenEn || []).join(' | '));
    const cov = '可套题族（搭边也行）：' + (m.coverage || []).map(c => c.topic + (c.fit === 'loose' ? '(搭边:' + c.note + ')' : '')).join('、');
    const logic = '中文逻辑链：' + (m.logicZh || '');
    if(i === 0) return head + '\n英文可背故事：' + (m.storyEn || '') + '\n' + logic + '\n' + golden + '\n' + cov;
    return head + '（仅摘要·无英文正文）\n' + logic + '\n' + golden + '\n' + cov;
  }).join('\n---\n');
  // v7.2 细节碎片库：她记住的细节（自己补的 + AI 代补的）随素材一起注入，任何题的槽位都能用
  const bits = ((store && store.detailBits) || []).filter(b => b && (b.en || b.zh)).slice(-12);
  if(bits.length){
    t += (t ? '\n\n' : '') + '【考生已记住的细节碎片（真实事实，可直接用于填充任何题的槽位，优先使用）】';
    t += bits.map((b, i) => '\n' + (i + 1) + '. ' + (b.en ? b.en + (b.zh ? '（' + b.zh + '）' : '') : b.zh)).join('');
  }
  return t;
}
function chuanUserMsg(s){
  return 'P2 题目：' + (s.promptEn || s.title || '') +
    '\n中文题意：' + (s.promptZh || '') +
    '\nYou should say: ' + ((s.youShouldSay || []).join('; '));
}
function chuanSysWithMats(base){
  // 把语料库写进 system（而非仅 user），弱模型读漏就会编，写死为唯一积木更稳
  return base + '\n\n【考生真实素材库】（唯一事实来源，严禁编造；已按考生标记的熟悉度排序，排在最前的最熟）：\n' + chuanMatsText();
}
function chuanFillPh(base){
  return String(base)
    .replace(/\{FORBIDDEN\}/g, window.FORBIDDEN_WORDS.join(' / '))
    .replace(/\{SP_TARGET\}/g, spPersonaLine());
}

async function aiStoryLink(id){
  const s = DATA.speaking.find(x => x.id === id);
  if(!s) return;
  const resultEl = $('#aiResult');

  // 无素材：直接在结果区给可点引导卡
  const store = matLoadStore();
  if(!store || !store.materials || !store.materials.length){
    if(resultEl){
      resultEl.innerHTML = spGuideCardHtml('还没有万能素材',
        '先去素材 tab 用几段真实经历生成你的故事卡，之后每道 P2 都能自动串题。',
        '<button class="btn btn-primary sp-guide-btn" id="spGoMatBtn" type="button">去素材生成</button>');
      resultEl.style.display = 'block';
      spBindMatGuideBtn(resultEl);
    }
    toast('还没有万能素材，先去「素材」页生成');
    return;
  }
  await planChuan(s);
}

/* design/87 阶段一：逐 bullet 核对素材。natural → 整段稿；adaptable → 补槽卡；unfit → 拒绝硬串卡 */
async function planChuan(s){
  const resultEl = $('#aiResult');
  const linkBtn = document.getElementById('aiStoryLinkBtn');
  setStoryLinkBtn(linkBtn, '⏳ 核对素材中…', true);
  if(resultEl){ resultEl.style.display = 'block'; resultEl.innerHTML = '<div class="diag-note">正在逐条核对题目要点与你的素材库…</div>'; }
  try{
    const sys = chuanSysWithMats(chuanFillPh(SYS_CHUAN_PLAN));
    const user = chuanUserMsg(s);
    const content = await callRelay('speaking_chuan_plan', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);   // 结构化 JSON 输出：降温度减少同题重开的波动
    const j = aiJson(content);
    if(!(j && (j.fit === 'natural' || j.fit === 'adaptable' || j.fit === 'unfit') && Array.isArray(j.slotCheck) && j.slotCheck.length)){
      throw new Error('__RAW__' + (content || ''));
    }
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    // 草稿（阶段一结果 + 已补答案）实时落库：关页/切题再回来可恢复；成稿后清掉
    s.answers.p2.linkDraft = { plan: j, supplements: {}, ts: Date.now() };
    s.updatedAt = Date.now();
    hubSave();
    renderStoryLinkV2(resultEl, j, s);
  }catch(e){
    if(resultEl){
      if(String(e && e.message || '').indexOf('__RAW__') === 0){
        resultEl.innerHTML = '<div class="diag-note">AI 这次没按格式回，先把它说的原样贴在这儿：</div><pre>' + escapeHtml(String(e.message).slice(7)) + '</pre>';
      } else {
        resultEl.innerHTML = '<div class="diag-note">AI 服务暂不可用：' + escapeHtml(e.message) + '</div>';
      }
    }
  }finally{
    setStoryLinkBtn(linkBtn, '重新生成串题思路', false);
  }
}

/* v7.2 AI 代补模式附加指令：她不想自己补 → AI 按铁律 A 亲自为 missing/weak 槽位设计可信细节，
   织进讲稿并逐条输出 inventedDetails（en=织进稿子的英文句，zh=中文对照），供存入细节碎片库 */
var CHUAN_AIFILL_SUFFIX = `\n\n【AI 代补模式】考生明确不想自己补充细节。请你按写作铁律 A 的血肉细节规则，亲自为上面 slotCheck 中 missing/weak 的槽位设计可信细节（与故事骨架一致、不离谱、只用初高中常见词），把它们自然织进 fullEn；并额外输出 "inventedDetails" 数组：每项 {"slot":"槽位短句","en":"织进讲稿的英文细节句","zh":"中文对照"}。inventedDetails 里的英文句必须原样出现在 fullEn 中。`;

/* design/87 阶段二：补槽答案 + 素材 → 一段完整讲稿。失败不落库、不盖旧结果（AI 红线）
   v7.2 aiFill=true = AI 代补模式（她不想自己补细节，让 AI 编可信细节并沉淀进碎片库） */
async function finalChuan(s, aiFill){
  const resultEl = $('#aiResult');
  const linkBtn = document.getElementById('aiStoryLinkBtn');
  setStoryLinkBtn(linkBtn, '⏳ 出稿中…', true);
  if(resultEl){ resultEl.style.display = 'block'; resultEl.innerHTML = '<div class="diag-note">' + (aiFill ? '正在让 AI 替你补细节、整合成整段讲稿…' : '正在把素材与你的补充细节整合成整段讲稿…') + '</div>'; }
  try{
    const p2 = (s.answers && s.answers.p2) || {};
    const draft = p2.linkDraft || {};
    const plan = draft.plan || {};
    const sup = draft.supplements || {};
    const sys = chuanSysWithMats(chuanFillPh(SYS_CHUAN_FINAL)) + (aiFill ? chuanFillPh(CHUAN_AIFILL_SUFFIX) : '');
    const user = chuanUserMsg(s)
      + '\n\n【阶段一素材核对结果】' + JSON.stringify(plan.slotCheck || [])
      + (Array.isArray(plan.missingQuestions) && plan.missingQuestions.length ? '\n【补槽问题】' + JSON.stringify(plan.missingQuestions) : '')
      + '\n【考生补充的真实细节】（空对象=不补直接出稿' + (aiFill ? '，请按 AI 代补模式自行设计细节' : '') + '）' + JSON.stringify(sup);
    const content = await callRelay('speaking_chuan_final', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.5);
    const j = aiJson(content);
    if(!(j && typeof j.fullEn === 'string' && j.fullEn.trim())){
      throw new Error('__RAW__' + (content || ''));
    }
    const out = { ...j, fit: (j.fit === 'natural' ? 'natural' : 'adaptable'), v: 2, ts: Date.now(), raw: content };
    if(aiFill && Array.isArray(j.inventedDetails)){
      out.aiInvented = j.inventedDetails.filter(d => d && (d.en || d.zh));
    }
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    s.answers.p2.aiStoryLink = out;
    delete s.answers.p2.linkDraft;
    s.updatedAt = Date.now();
    // v7.2 沉淀进素材碎片库：①考生自己补的细节 ②AI 代补的细节——她记过的每一句都复用到别的题
    const missQ = Array.isArray(plan.missingQuestions) ? plan.missingQuestions : [];
    const supBits = Object.keys(sup || {}).map(k => {
      const v = sup[k];
      const zh = Array.isArray(v) ? v.join('、') : (typeof v === 'string' ? v.trim() : '');
      return (zh && zh !== '有' && zh !== '没有') ? { zh, en: '', from: (s && s.id) || '' } : null;
    }).filter(Boolean);
    const invBits = (out.aiInvented || []).map(d => ({ en: String(d.en || '').trim(), zh: String(d.zh || '').trim(), from: (s && s.id) || '' }));
    const addedBits = matAddDetailBits(supBits.concat(invBits));
    hubSave();
    renderStoryLinkV2(resultEl, out, s);
    toast('讲稿已生成' + (addedBits ? '，' + addedBits + ' 条细节已存入素材库' : ''));
  }catch(e){
    // 失败不落库：数据里旧稿原样保留；界面回到草稿态（补槽/判定卡）让她能直接重试
    if(resultEl){
      if(String(e && e.message || '').indexOf('__RAW__') === 0){
        resultEl.innerHTML = '<div class="diag-note">AI 这次没按格式回，先把它说的原样贴在这儿：</div><pre>' + escapeHtml(String(e.message).slice(7)) + '</pre>';
      } else {
        resultEl.innerHTML = '<div class="diag-note">讲稿生成失败：' + escapeHtml(e.message) + '（旧稿保留未动，可直接重试）</div>';
      }
    }
    toast('讲稿生成失败：' + (e.message || ''));
    const p2b = (s.answers && s.answers.p2) || {};
    if(p2b.linkDraft && p2b.linkDraft.plan) renderStoryLinkV2(resultEl, p2b.linkDraft.plan, s);
  }finally{
    setStoryLinkBtn(linkBtn, '重新生成串题思路', false);
  }
}

/* 串题按钮换文案：只替换文字部分，保留 SVG 图标 */
function setStoryLinkBtn(btn, text, disabled){
  if(!btn) return;
  const svg = btn.querySelector('svg');
  btn.disabled = !!disabled;
  btn.innerHTML = (svg ? svg.outerHTML : '') + text;
}

// 把 AI 输出的 **文字** 转成 <b>文字</b>（串题稿里改动句用 ** 标注）
function mdInline(t){
  if(!t) return '';
  return escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/* 串题稿 → 可复制/可朗读的纯英文全文（design/81）。
   只取英文字段，中文的逻辑链 / 映射讲解一律不带（复制到备忘录里背时不需要，也避免中英混排）。
   挂 window 便于探针单测。 */
window.buildStoryPlainText = function(j, version){
  if(!j || typeof j !== 'object') return '';
  // design/87 新结构（v2）：单版整段稿，version 参数仅为兼容旧调用签名（copy/朗读统一取 fullEn）
  if(j.v === 2 || (typeof j.fullEn === 'string' && j.fullEn)){
    return String(j.fullEn || '').trim();
  }
  const parts = [];
  const push = v => { const t = String(v == null ? '' : v).trim(); if(t) parts.push(t); };
  const pushArr = a => { if(Array.isArray(a)) a.forEach(x => push(x)); };
  if(j.article){
    // 老结构：整段 article 即为正文
    push(j.article);
  } else {
    push(j.openEn);
    push(j.bridgeEn);
    pushArr(j.bodyEn);
    pushArr(j.feelEn);
  }
  let out = parts.join('\n');
  if(Array.isArray(j.paddingEn) && j.paddingEn.length){
    const pad = j.paddingEn.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
    if(pad.length) out += (out ? '\n\n' : '') + '【加时必背句】\n' + pad.join('\n');
  }
  return out.trim();
};

/* 复制：优先 navigator.clipboard，不可用时退回 textarea + execCommand（http/旧浏览器兜底） */
function copyTextFallback(text){
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const okd = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!okd;
  }catch(e){ return false; }
}
function copyStoryText(text){
  const done = () => toast('已复制英文稿，可粘贴去背');
  const fail = () => toast('复制失败，可长按选中文本手动复制');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, () => { copyTextFallback(text) ? done() : fail(); });
      return;
    }
  }catch(e){}
  copyTextFallback(text) ? done() : fail();
}

function renderStoryLink(el, j, s){
  if(!el) return;
  const CHAIN = { '人物':'人物链：是谁→如何得知→做了什么→为什么→感受', '事件':'事件链：时间→地点→人物→经过→感受', '事物':'事物链：是什么→如何得到→感受', '地点':'地点链：位置→如何得知→做了什么→为什么→感受' };
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 串题素材（AI 根据万能故事库匹配）'
    + '<span class="mp-actions">'
    + '<button class="btn btn-sm mp-btn" id="storyCopyBtn" type="button">📋 复制英文稿</button>'
    + '<button class="btn btn-sm mp-btn" id="storySpeakBtn" type="button">▶ 朗读全文</button>'
    + '</span></div>';
  if(j.article){
    // 老结构（本期改版前已生成的数据）：维持原三块渲染，不得让历史串题变空白
    if(j.logicChain) h += '<div class="mat-plan-sec"><b>串题逻辑</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
    h += '<div class="mat-plan-sec"><b>串题原文</b><div class="mat-story-en">' + mdInline(j.article) + '</div></div>';
    if(Array.isArray(j.paddingEn) && j.paddingEn.length){
      h += '<div class="mat-plan-sec"><b>加时必背句（正文约 1 分多钟；说得快或考官没打断时，按顺序补念，凑满 2 分钟）</b><ul class="sp-padding">'
        + j.paddingEn.map(x => '<li>' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
  } else {
    if(j.logicChain) h += '<div class="mat-plan-sec"><b>串题逻辑</b><div class="mat-logic">' + escapeHtml(j.logicChain) + '</div></div>';
    if(j.openEn) h += '<div class="mat-plan-sec"><b>STEP1 直答（≤3 词）</b><div class="mat-story-en">' + mdInline(String(j.openEn)) + '</div></div>';
    if(j.bridgeEn) h += '<div class="mat-plan-sec"><b>STEP2 点题句</b><div class="mat-story-en">' + mdInline(String(j.bridgeEn)) + '</div></div>';
    if(Array.isArray(j.bodyEn) && j.bodyEn.length){
      const ct = CHAIN[j.chainType] ? j.chainType : '';
      h += '<div class="mat-plan-sec"><b>主体' + (ct ? ' · ' + escapeHtml(ct) + '链' : '') + '</b>'
        + (CHAIN[j.chainType] ? '<div class="mat-logic">' + escapeHtml(CHAIN[j.chainType]) + '</div>' : '')
        + '<div class="mat-story-en">' + j.bodyEn.map(x => mdInline(String(x))).join('<br>') + '</div></div>';
    }
    if(Array.isArray(j.feelEn) && j.feelEn.length){
      const FEEL = ['以前', '变化', '现在', '希望'];
      h += '<div class="mat-plan-sec"><b>STEP3 感受链</b><ul class="sp-padding">'
        + j.feelEn.map((x, i) => '<li><b>' + (FEEL[i] || ('第' + (i + 1) + '句')) + '</b> · ' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
    if(Array.isArray(j.paddingEn) && j.paddingEn.length){
      h += '<div class="mat-plan-sec"><b>加时必背句（正文约 1 分多钟；说得快或考官没打断时，按顺序补念，凑满 2 分钟）</b><ul class="sp-padding">'
        + j.paddingEn.map(x => '<li>' + mdInline(String(x)) + '</li>').join('')
        + '</ul></div>';
    }
    if(j.mappingZh) h += '<div class="mat-plan-sec"><b>怎么串过来的（照这个逻辑自己也能串）</b><div class="mat-logic">' + escapeHtml(j.mappingZh) + '</div></div>';
  }
  h += '<div class="mat-plan-tips">💡 方案根据你的万能故事库跨故事拼细节生成；点「AI 串题思路」可重新生成。</div>';
  // design/87：旧稿只读保留，但给一个手动入口走新逻辑（她拍板：不主动点旧稿永远原样）
  if(s && s.id){
    h += '<div class="sp-chuan-actions"><button class="mat-mini" id="spReplanV2" type="button">按新逻辑重新生成</button><span class="sp-slot-evidence">按题目要点逐条核对素材，出一段整段讲稿；会替换这份旧稿</span></div>';
  }
  h += '</div>';
  el.innerHTML = h;
  el.style.display = 'block';
  if(s && s.id){
    const rv = el.querySelector('#spReplanV2');
    if(rv) rv.addEventListener('click', () => aiStoryLink(s.id));
  }
  bindStoryTools(el, j);
}

/* === design/87 新结构渲染分发：final 成稿态 / adaptable 补槽态 / unfit 拒绝卡；其余兜底旧渲染（旧稿只读保留，用户已拍板） === */
function renderStoryLinkV2(el, j, s){
  if(!el || !j || typeof j !== 'object'){ return; }
  if(typeof j.fullEn === 'string' && j.fullEn){ renderChuanFinal(el, j, s); return; }
  if(j.fit === 'adaptable' && Array.isArray(j.slotCheck) && j.slotCheck.length){ renderChuanSlotFill(el, j, s); return; }
  if(j.fit === 'unfit' && Array.isArray(j.slotCheck) && j.slotCheck.length){ renderChuanUnfit(el, j, s); return; }
  renderStoryLink(el, j, s);
}

/* 整段稿按语义粗分 2~3 自然段（句子计数均分），段间留白，无任何拼装痕迹 */
function chuanParas(t){
  const s0 = String(t || '').trim();
  const sents = s0.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || (s0 ? [s0] : []);
  const per = Math.max(1, Math.ceil(sents.length / 3));
  const paras = [];
  for(let i = 0; i < sents.length; i += per) paras.push(sents.slice(i, i + per).join('').trim());
  return paras.filter(Boolean);
}

function renderChuanFinal(el, j, s, kwMode){
  const fitBadge = j.fit === 'natural'
    ? '<span class="sp-fit-badge nat">自然贴合</span>'
    : '<span class="sp-fit-badge adp">改编串题</span>';
  const hasKw = Array.isArray(j.keywords) && j.keywords.length > 0;
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 串题讲稿 ' + fitBadge
    + '<span class="mp-actions">'
    + '<button class="btn btn-sm mp-btn" id="storyCopyBtn" type="button">📋 复制</button>'
    + '<button class="btn btn-sm mp-btn" id="storySpeakBtn" type="button">▶ 朗读</button>'
    // design/88：关键词切换/提取按钮
    + (hasKw
      ? '<button class="btn btn-sm mp-btn" id="storyKwBtn" type="button">' + (kwMode ? '📄 全文' : '🔑 关键词') + '</button>'
      : '<button class="btn btn-sm mp-btn" id="storyKwBtn" type="button">🔑 提取关键词</button>')
    + '</span></div>';
  // 讲稿渲染：kwMode=true 时显示 chips，否则显示段落
  if(kwMode && hasKw){
    h += '<div class="mat-story-en sp-fulldraft sp-story-kw">'
      + j.keywords.map(k => '<span class="sp-kw-chip">' + escapeHtml(k) + '</span>').join('')
      + '</div>';
  } else {
    h += '<div class="mat-story-en sp-fulldraft">' + chuanParas(j.fullEn).map(p => '<p>' + escapeHtml(p) + '</p>').join('') + '</div>';
  }
  if(Array.isArray(j.weakBullets) && j.weakBullets.length){
    h += '<div class="sp-weak-note">第 ' + j.weakBullets.map(n => Number(n) + 1).join('、') + ' 个要点素材偏弱，考官 P3 可能追问，建议补细节'
      + (s && s.id ? ' · <a href="javascript:void(0)" id="spWeakFix">去补细节</a>' : '') + '</div>';
  }
  if(Array.isArray(j.aiInvented) && j.aiInvented.length){
    h += '<div class="sp-weak-note">🧩 AI 补的 ' + j.aiInvented.length + ' 条细节已存入素材库，其他题自动复用</div>';
  }
  if(j.mappingZh || j.logicChain){
    h += '<details class="sp-chuan-why"><summary>串题原理（想学怎么串再展开 ▸）</summary>';
    if(j.mappingZh) h += '<div class="mat-logic">' + escapeHtml(j.mappingZh) + '</div>';
    if(j.logicChain) h += '<div class="mat-logic">' + escapeHtml(j.logicChain) + '</div>';
    h += '</details>';
  }
  if(s && s.id) h += '<div class="sp-chuan-actions"><button class="mat-mini" id="spRegenChuan" type="button">↻ 重新生成</button></div>';
  h += '</div>';
  el.innerHTML = h;
  el.style.display = 'block';
  const fix = el.querySelector('#spWeakFix');
  if(fix) fix.addEventListener('click', () => aiStoryLink(s.id));
  const regen = el.querySelector('#spRegenChuan');
  if(regen) regen.addEventListener('click', () => aiStoryLink(s.id));
  // design/88：关键词按钮
  const kwBtn = el.querySelector('#storyKwBtn');
  if(kwBtn) kwBtn.addEventListener('click', async () => {
    // 切换/提取前先停朗读（朗读取全文，状态挂死会闹）
    if(typeof speakQuestion === 'function') speakQuestion.stop();
    const resetBtn = el.querySelector('#storySpeakBtn');
    if(resetBtn){ resetBtn.textContent = '▶ 朗读'; resetBtn.classList.remove('playing'); }
    if(hasKw){
      // 已有 keywords → 切换态
      renderChuanFinal(el, j, s, !kwMode);
    } else {
      // 无 keywords → 走提取流程
      if(typeof extractStoryKeywords === 'function') await extractStoryKeywords(el, j, s);
    }
  });
  // 复制/朗读永远取全文（bindStoryTools 读 j.fullEn，不受 kwMode 影响）
  bindStoryTools(el, j);
}

async function extractStoryKeywords(el, j, s){
  const btn = el.querySelector('#storyKwBtn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ 提取中…'; }
  try{
    const sys = '从这段雅思口语 P2 讲稿提取 8~14 个按叙事顺序排列的英文关键词短语，每项 2~5 个实词，保留原文措辞。输出严格 JSON：{"keywords":["..."]}';
    const user = j.fullEn || '';
    const raw = await callRelay('speaking_chuan_final', [
      { role:'system', content: sys },
      { role:'user', content: user }
    ], 0.3);
    let j2 = null;
    try{ j2 = JSON.parse(raw); } catch(e){}
    if(!j2 || !Array.isArray(j2.keywords) || j2.keywords.length < 4){
      throw new Error('AI 返回无效（可能短路），可重试');
    }
    // 成功：写入 keywords，**绝不改 fullEn/fit/mappingZh 等任何其他字段**
    j.keywords = j2.keywords;
    if(s && s.id){
      s.updatedAt = Date.now();
      if(typeof hubSave === 'function') hubSave();
      else if(typeof saveData === 'function') saveData();
    }
    // 以关键词态重渲（用户点的就是看关键词）
    renderChuanFinal(el, j, s, true);
  } catch(e){
    const msg = (e && e.message) || '未知错误';
    toast('关键词提取失败：' + msg + '（旧稿未动，可重试）');
    // 重渲恢复按钮
    if(btn){ btn.disabled = false; btn.textContent = '🔑 提取关键词'; }
  }
}

function renderChuanSlotFill(el, j, s){
  const p2 = (s.answers && s.answers.p2) || {};
  const draft = p2.linkDraft || { plan: j, supplements: {} };
  draft.supplements = draft.supplements || {};
  const sup = draft.supplements;
  const miss = (Array.isArray(j.missingQuestions) ? j.missingQuestions : []).filter(q => q && q.k && q.label);
  const MARK = { covered:'<span class="sp-slot-mark ok">✓ 有事实</span>', weak:'<span class="sp-slot-mark mid">△ 沾边</span>', missing:'<span class="sp-slot-mark bad">✗ 缺</span>' };
  let h = '<div class="mat-plan">';
  h += '<div class="mat-plan-head">🧩 补 ' + miss.length + ' 个小细节，这题就能串自然</div>';
  h += '<div class="sp-slot-list">';
  (j.slotCheck || []).forEach(sc => {
    h += '<div class="sp-slot-row">' + (MARK[sc.status] || '<span class="sp-slot-mark mid">△</span>')
      + '<span class="sp-slot-bullet">' + escapeHtml(sc.bullet || '') + '</span>'
      + (sc.evidence ? '<div class="sp-slot-evidence">' + escapeHtml(sc.evidence) + '</div>' : '')
      + '</div>';
  });
  h += '</div>';
  miss.forEach(q => {
    const val = sup[q.k];
    h += '<div class="mat-step"><div class="mat-step-label">' + escapeHtml(q.label || '') + '</div>';
    if(q.type === 'yesno'){
      h += '<div class="mat-yn">'
        + '<button type="button" class="' + (val === '有' ? 'on' : '') + '" data-slot-yn="' + escapeHtml(q.k) + '" data-slot-val="有">有</button>'
        + '<button type="button" class="' + (val === '没有' ? 'on' : '') + '" data-slot-yn="' + escapeHtml(q.k) + '" data-slot-val="没有">没有</button>'
        + '</div>';
    } else if(q.type === 'choice' && Array.isArray(q.options) && q.options.length){
      const arr = Array.isArray(val) ? val : [];
      h += '<div class="mat-chips">' + q.options.map(o =>
        '<button type="button" class="mat-chip pick' + ((arr.indexOf(o) >= 0 || val === o) ? ' on' : '') + '"'
        + ' data-slot-pick="' + escapeHtml(q.k) + '" data-slot-opt="' + escapeHtml(o) + '"' + (q.multi ? ' data-multi="1"' : '') + '>'
        + escapeHtml(o) + '</button>').join('') + '</div>';
      const otherPicked = arr.indexOf('其他') >= 0 || val === '其他';
      const otherText = (typeof val === 'string' && val && q.options.indexOf(val) < 0) ? val : (arr.filter(x => q.options.indexOf(x) < 0)[0] || '');
      if(otherPicked || otherText){
        h += '<input type="text" data-slot-text="' + escapeHtml(q.k) + '" value="' + escapeHtml(otherText || '') + '" placeholder="具体说说（其他）…">';
      }
    } else {
      h += '<input type="text" data-slot-text="' + escapeHtml(q.k) + '" value="' + escapeHtml(val || '') + '" placeholder="用一句话回答…">';
    }
    h += '</div>';
  });
  h += '<div class="sp-chuan-actions">'
    + '<button class="btn btn-primary" id="spFinalBtn" type="button">生成我的讲稿</button>'
    + '<button class="btn" id="spAiFillBtn" type="button">AI 帮我补细节出稿</button>'
    + '<button class="sp-linklike" id="spSkipSupBtn" type="button">不补，直接出稿</button>'
    + '<button class="sp-linklike" id="spGoMatBtn" type="button">这题放弃，去素材库补专属素材 →</button>'
    + '</div></div>';
  el.innerHTML = h;
  el.style.display = 'block';
  const saveSup = () => {
    s.answers = s.answers || {};
    s.answers.p2 = s.answers.p2 || {};
    s.answers.p2.linkDraft = draft;
    s.updatedAt = Date.now();
    hubSave();
  };
  el.querySelectorAll('[data-slot-yn]').forEach(b => b.addEventListener('click', () => {
    sup[b.dataset.slotYn] = b.dataset.slotVal;
    saveSup();
    renderChuanSlotFill(el, j, s);
  }));
  el.querySelectorAll('[data-slot-pick]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.slotPick, o = b.dataset.slotOpt;
    const q = miss.find(x => x.k === k) || {};
    if(q.multi){
      const arr = Array.isArray(sup[k]) ? sup[k].slice() : [];
      const at = arr.indexOf(o);
      if(at >= 0) arr.splice(at, 1); else arr.push(o);
      sup[k] = arr;
    } else {
      sup[k] = (sup[k] === o) ? '' : o;   // 单选再点同项=取消
    }
    saveSup();
    renderChuanSlotFill(el, j, s);
  }));
  el.querySelectorAll('[data-slot-text]').forEach(ta => ta.addEventListener('input', () => {
    sup[ta.dataset.slotText] = ta.value;   // 文本输入静默保存不重渲（保光标）
    saveSup();
  }));
  const fin = el.querySelector('#spFinalBtn');
  if(fin) fin.addEventListener('click', () => finalChuan(s));
  const aif = el.querySelector('#spAiFillBtn');
  if(aif) aif.addEventListener('click', () => finalChuan(s, true));   // v7.2：AI 代补模式，细节自动沉淀进素材库
  const skip = el.querySelector('#spSkipSupBtn');
  if(skip) skip.addEventListener('click', () => finalChuan(s));   // supplements 原样传（可能为空），SYS_CHUAN_FINAL 第 2 条处理
  spBindMatGuideBtn(el);
}

function renderChuanUnfit(el, j, s){
  const desc = escapeHtml(j.unfitReason || '素材主题与这道题的核心要点对不上，硬串会像背范文。')
    + (j.suggestCard ? '<br>建议补的素材卡：<b>' + escapeHtml(j.suggestCard) + '</b>' : '');
  el.innerHTML = spGuideCardHtml('这道题和你的素材串不动', desc,
    '<button class="btn btn-primary sp-guide-btn" id="spGoMatBtn" type="button">去素材库补：' + escapeHtml(j.suggestCard || '专属素材') + '</button>'
    + '<button class="sp-linklike" id="spForceChuan" type="button">仍要硬试（不推荐，考官易判背题）</button>');
  el.style.display = 'block';
  spBindMatGuideBtn(el);
  const force = el.querySelector('#spForceChuan');
  if(force) force.addEventListener('click', () => { if(s) finalChuan(s); });
}

function bindStoryTools(el, j){
  if(!el) return;
  const copyBtn = el.querySelector('#storyCopyBtn');
  const speakBtn = el.querySelector('#storySpeakBtn');
  const getText = () => (typeof window.buildStoryPlainText === 'function') ? window.buildStoryPlainText(j, 'long') : '';
  if(copyBtn) copyBtn.addEventListener('click', () => {
    const t = getText();
    if(!t){ toast('这份串题稿没有可复制的英文'); return; }
    copyStoryText(t);
  });
  if(speakBtn) speakBtn.addEventListener('click', () => {
    const t = getText();
    if(!t){ toast('这份串题稿没有可朗读的英文'); return; }
    if(speakBtn.classList.contains('playing')){ speakQuestion.stop(); resetSpeakBtn(speakBtn); return; }
    speakBtn.classList.add('playing');
    speakBtn.textContent = '■ 停止';
    try{
      // speakQuestion.speak 内部先 cancel，重复点击不会叠加朗读；但它不返回 utterance，
      // 用「轮询 speechSynthesis 状态」感知结束（含点停止的 cancel），结束后还原文案。
      speakQuestion.speak(t, speakBtn, tdSpeakRate());   // T-017d：接上限速选项，默认 0.95 与改前一致
      watchSpeakEnd(speakBtn);
    }catch(e){ resetSpeakBtn(speakBtn); toast('朗读失败：' + e.message); }
  });
}

function watchSpeakEnd(btn){
  if(!btn || !btn.isConnected) return;
  setTimeout(() => {
    if(!btn.isConnected) return;
    let speaking = false;
    try{ speaking = typeof speechSynthesis !== 'undefined' && !!(speechSynthesis.speaking || speechSynthesis.pending); }catch(e){}
    if(!speaking){ resetSpeakBtn(btn); return; }
    watchSpeakEnd(btn);
  }, 350);
}
function resetSpeakBtn(btn){
  if(!btn) return;
  btn.classList.remove('playing');
  btn.textContent = '▶ 朗读全文';
}
