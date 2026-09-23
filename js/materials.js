/* === 万能口语素材生成器（design/86：题库对症的动态漏斗问卷 + 故事骨架层 + 现成英文素材复用） ===
   输入：人设 A → AI 分析当季 P2 题库生成 4~6 张漏斗式动态问题卡（可跳过）→ 现成英文素材/自由经历
   处理：DeepSeek 整合为连贯故事卡（含 spineEn 最小骨架），逐卡对照当季题库产出 coverage
   输出：人设锚点卡 + 素材卡（骨架/完整故事/万能句/中文逻辑，可编辑/重生成/删除）
   红线：不动 mock 系列 / speaking 系列 / data.js / callRelay；纯前端 + 现有 DeepSeek relay。 */
(function(){
  const STORE_KEY = 'ielts_materials_v1';
  const CANON = ['喜欢的城市','水边的地方','难忘的旅行','常在一起的人','户外活动','你拍的照片','让你放松的事','家人','朋友','敬佩的人','帮助者','让我骄傲的人','学会的技能','克服的困难','目标','压力','习惯改变','搬家','电子设备','工具','礼物','离不开的东西','爱好','视频','网上学的','改观的事','喜欢的节目','书','电影','歌','诗','故事','网站','衣服','贵的东西','珍藏','法律','规则','传统','习俗','改变','分歧','犯错','投诉','道歉','尴尬','挑战'];

  /* 已降级（design/86）：静态问卷仅作离线兜底参考，正常问卷由 SYS_PLAN 按当季题库动态生成；
     正常路径不再渲染 QUESTIONS。deepDigCoverage 仍读旧字符串答案作辅助上下文（兼容老数据）。 */
  const QUESTIONS = [
    { id:'A',  group:'persona', required:true,  title:'一句话介绍你自己', hint:'城市、身份（学生/专业或工作）、性格、一个爱好。例：杭州，大三计算机，理性但开口说英语会紧张，喜欢无纸化学习。' },
    { id:'B1', group:'core', required:true,  title:'一次你和某个重要的人一起做的事 / 外出', hint:'写全：和谁 / 什么时候 / 去哪 / 具体做了什么 / 一个当时看到的细节 / 当时感受。例：去年八月和男友去厦门，鼓浪屿沙滩边吃现做的海蛎煎，晚上海边散步看对岸灯火，觉得很踏实。' },
    { id:'B2', group:'core', required:true,  title:'一件你学会 / 克服 / 坚持的事', hint:'写全：学什么 / 难在哪 / 怎么熬过来的 / 现在做得怎样 / 感受。例：备考雅思练口语，一开始开口就卡，每天用 AI 对话半小时，两个月后能说满 2 分钟，很有成就感。' },
    { id:'B3', group:'core', required:true,  title:'一个每天用或离不开的东西 / 日常爱好', hint:'写全：是什么 / 什么时候开始用 / 每天怎么用 / 一个具体场景 / 为什么离不开。例：笔记本电脑，学代码写作业全靠它，每天背单词软件刷 20 分钟，屏幕边贴着便利贴。' },
    { id:'B4', group:'core', required:true,  title:'一个在网上看到、让你改观或感兴趣的内容', hint:'写全：在哪看到 / 讲了什么 / 一个具体画面或细节 / 为什么打动你。例：B站看UP主讲间隔背单词法，照做两周记住了一直忘的词，才发现方法比硬背重要。' },
    { id:'B5', group:'core', required:true,  title:'一个对你重要的地方 / 一次印象深的经历', hint:'写全：什么地方 / 什么时候去或常去 / 在那做什么 / 一个细节 / 为什么重要。例：外婆家的老院子，夏天在葡萄架下写作业，她摇着蒲扇讲故事，现在想起来很安心。' },
    { id:'C1', group:'extra', required:false, title:'一本喜欢的书 / 一部电影', hint:'写全：名字 / 讲什么 / 印象最深的画面 / 感受（选填，当季相关：包含动物的故事或书 / 最不喜欢的电影）。' },
    { id:'C2', group:'extra', required:false, title:'一件想攒钱买的物品 / 常用的电子产品', hint:'写全：是什么 / 大概多少钱 / 为什么想要 / 买来做什么（选填，当季相关：攒钱买想要物品 / 电子设备）。' },
    { id:'C3', group:'extra', required:false, title:'一条你知道 / 想颁布的规则或法律', hint:'写全：内容 / 从哪知道 / 你怎么看 / 对生活的影响（选填，当季相关：想颁布的新法律 / 保护环境的法律）。' },
    { id:'C4', group:'extra', required:false, title:'一次遇到麻烦 / 改变主意的经历', hint:'写全：出了什么事 / 怎么应对 / 结果 / 感受（选填，当季相关：遇到的科技问题 / 近期改变的计划）。' }
  ];

  const SYS_MAT = '你是雅思口语串题素材教练。考生会给你一份人设 + 若干段真实生活经历（含可能来自你上一轮追问的补充回答）。\n'
  + '你的任务：把考生的全部经历整理成**若干个各自独立、连贯的故事**（通常 2~4 个）：把**自然相关**的经历合并成一条叙事线（自然相关的判断标准：时间相连 / 同一个人物 / 同一个地点 / 有因果关系，至少占其一）。**关联弱的经历严禁硬编进同一条叙事线**——宁可独立成篇，也严禁用生硬过渡把不相关的事缝在一起；**严禁按题族切分**（不得拆成「人物题一个故事 + 地点题一个故事」这种按题目类别切的形态）。每个故事不看其他故事也能独立背、独立成立。**必须把考生填入的每一段经历的关键事实完整纳入某一个故事，不得遗漏**——分到哪个故事由自然相关性决定，不为凑个数强行合并。**能半句带过的次要经历就半句带过，不为此展开篇幅。**\n'
  + '规则：\n'
  + '1. 故事必须基于考生原话，真实不编造。**事实完整性优先于语言精简**：若把几段相关经历合并成一个故事，它们的关键事实（人物/地点/事件/感受）都必须出现在**某一个** storyEn 或 logicZh 里——信息不能丢，但语言允许压缩重写；宁可把事实压缩成半句带过，也绝不丢弃考生填的事实，也绝不为此把不相关的经历硬并进同一条叙事线。\n'
  + '2. 每个故事含：title(标题) / storyEn(一段英文小故事，**不设死词数上限**——以「人物 / 地点 / 物品 / 事件 / 见闻与感受」五类元素齐全为准，齐全即收尾，通常落在 130~180 词；**190 词为硬顶**，超过时必须自行拆成两张卡；拆分优先级：**先拆次要补充情节与修饰性描述，主线故事与五类核心元素必须完整保留在一张卡里**，不得拆成两张都缺要素的残卡。**句子要能背，但不必都是简单句**——正文里至少 3~5 句带从句：because / when 状语从句、who / which / that 定语从句、and / but 并列句，其余句子保持 8~14 词简单句形成节奏差；词汇天花板从「初中」抬到「**高中常见词**」（如 realize / experience / especially / memory / although）；**单句硬顶 20 词**；严禁 ' + window.FORBIDDEN_WORDS.join(' / ') + ' 等生僻词（黑名单统一取全局常量 window.FORBIDDEN_WORDS，禁止硬编码）；**storyEn 里严禁出现任何中文字符**——考生经历里的中文词（如「考研」「恋综」「 高考」）必须译成简单英文（考研→the postgraduate exam，高考→the college entrance exam），专名也用基础英文说法。) / logicZh(中文**逻辑链**：用若干中文短语以 "—"（中文横杠/破折号）串接，把故事的关键步骤、转折、感受、细节都铺开——越长越细越好、数量不固定，例如"朋友送手机壳—觉得很有心—每天用手机—看到就想起朋友—珍藏") / spineEn(故事骨架句数组，规则见 5.4) / coverage(能套的当季 P2 题数组)。\n'
  + '3. 人设一致：每个故事至少一处与考生人设（性格/价值观）自然呼应（如「理性」「喜欢无纸化学习」这类考生自己的特质），为 Part 3 追问时的人设一致性打底，不要让故事像另一个人经历。\n'
  + '4. coverage 每个元素：{"topic":"题名","fit":"natural|loose","bridgeEn":"1 句英文点题句","note":"中文一句怎么套(如\'旅行中意识到环保法重要→套法律法规\';natural 可简写)"}。topic 必须**逐字取自下方【P2 题库对照清单】里的题目名**（这是考生网站当季真实题库），严禁自创题族名、严禁使用清单外的名字。bridgeEn 是把本故事嫁接到该题、考场可直接念的**英文点题句**：1 句 ≤15 词，主体仍为主谓宾，**最多含 1 个 because**，可用高中常见词。\n'
  + '4.1 **覆盖宁多勿漏，默认=能串（重要）**：把下方清单全量扫一遍。判断标准不是「故事里有没有讲到这个」，而是「**站在考场上，把 storyEn 原样讲出来，能不能很自然地引到这道题**」——考场串题的实际情况是：90% 就是原样背故事，只临场加 1~2 句过渡点题。所以：**稍微搭边的就算能串（loose）；拿不准的，也按 loose 列上**；只有加一句话都实在圆不上的才不列。故事是个素材库：里面的人、地点、物品、瞬间、感受都能辐射成题——旅行/学校/家庭这类日常故事更是万能辐射源，场景里合理出现的一切都能挂（建筑、比赛、食物、遇到的人、拥挤、照片、天气……）。每张卡通常能列 10~20 题，宁多勿漏：考场上不合适临场放弃就行，没列上考生才真的亏。\n'
  + '4.2 **抽象/观点类题更要放开想象**：想颁布的法律、规则、想做的改变、想解决的问题、传统、挑战、认为重要的事——这些题考的不是「经历」而是「想法」，而任何经历都能自然生出一个想法（看到某件事 → 有个感受 → I want to… / I think…）。比如旅行路上见到有人破坏环境 → 顺理成章想颁布环保法律；旅行让你想去看更大的世界 → 就是长久目标/抱负。把清单里的抽象题逐个想一遍：「这段经历能不能让人生出这个想法？」只要不是完全牵强，就按 loose 列上，note 里写清那句过渡怎么讲。\n'
  + '4.3 **通用性优先（合并时的取舍标准）**：合并故事时，尽量让最终的大故事同时含有**「人物（同行的朋友/帮助过你的人）+ 地点（城市/场所）+ 物品/食物 + 事件（比赛/购物/意外）+ 见闻与感受（可引出观点的瞬间）」五类元素**——这样一个故事本身就是万能辐射源，里面每个人、地点、物品、见闻都能独立辐射一批题。若某段经历能自然嵌进主线增加元素，就嵌进去（哪怕只是半句带过）；不要为了「故事主题纯粹」而把能合并的经历拆出去。\n'
  + '5. 不要产出 keyword 骨架 / 不要拆分多切面列表——考生基础弱，给词也不会说句型，必须给**成段的、能直接背的英文小故事**（句子可简单但必须连贯，靠连接词串成一件事）。\n'
  + '5.1 万能句 goldenEn（必填 3 句，**必须内嵌在 storyEn 正文里**）：每个故事要包含 **3 句万能高级句**（如 It was the first time I had ever... / What I remember most is that... / The reason why...），任何话题都能直接套用。**这 3 句必须原样作为 storyEn 正文的完整句子出现**——自然融进叙事，不得突兀；位置分散：约 1 句在故事前半、1 句在中后段转折/感受处、1 句收尾；并**逐字复制**进 goldenEn 数组（顺序与正文出现顺序一致）。**每句 10~20 词，宁短不长**；允许从句；严禁出现本故事专有名词（人名/地名/事件名），保证套任何题不用改词；3 句之间不得重复句式；3 句计入正文词数（正文 130~180 词口径与 190 硬顶不变）。若该卡含规则 5.2 的原样保护英文段，万能句编在该卡其余 AI 撰写的句子里，**严禁改动原样保护段的任何句子**。\n'
  + '5.2 纯英文原样保护：若某段经历的**中文字符占比 <5%**，即视为纯英文，该段**整段原样进入 storyEn**——不得改词、不得缩写、不得合并、不得翻译，且**豁免规则 2 的单句 ≤20 词上限**（考生自己写的句子自己背得出）；只允许在它前后添加过渡词衔接。**严禁为原样保护的段落自动拆句**。\n'
  + '5.3 覆盖率自检：生成后自评 coverageRate = 本题库中被 coverage 覆盖的题数 / 题库总题数（0~1 的小数）。**若 <0.9，优先靠给现有故事补细节（见闻 / 感受 / 物品）把覆盖率补到 0.9 以上**；确实有大块相关经历没被利用时，才把它独立成篇补充覆盖。**严禁为凑覆盖率把不相关的经历硬并进同一条叙事线。**\n'
  + '5.4 故事骨架 spineEn（必填）：从 storyEn 正文中逐字摘取 5~7 个完整原句，按叙事顺序覆盖「起因/背景 → 核心经过 → 转折 → 感受/收尾」，总词数 40~60 词。这是考生优先背诵的最小集合，完整故事用于考场展开润色。① 每句必须是 storyEn 中一字不差的完整句子（连同标点），严禁新写、改写、拼接；② 各句连读仍是一件完整的事；③ 可从规则 5.2 的原样保护段中原句摘取，但严禁改动该段。\n'
  + '【P2 题库对照清单】\n{BANK_P2_LIST}\n'
  + '输出严格 JSON：{"stories":[{"title":"","storyEn":"","spineEn":["","","","",""],"goldenEn":["","",""],"logicZh":"","coverage":[{"topic":"","fit":"","bridgeEn":"","note":""}]}],"coverageRate":0.9}，不要任何解释文字。';
  const SYS_PERSONA = '你是雅思口语人设分析师。根据用户一句话自我介绍，提取人设锚点，用于保证 Part 3 回答一致性。输出严格 JSON：{"persona":{"city":"城市","identity":"身份/专业或工作","values":["价值观1","价值观2"],"traits":["性格特点1","性格特点2"]}}';

  /* design/86 SYS_PLAN：动态问卷规划——AI 分析当季 P2 题库后对症出 4~6 张漏斗式问题卡。
     换季后题库清单变化，问卷必须重新生成；严禁拿本常量当「写死的问卷」。 */
  const SYS_PLAN = '你是雅思口语素材规划师。考生会给你【当季真实 P2 题库全量清单】（网站当季真实考题；换季后清单会变化，你的问卷必须只针对当前清单）。考生基础弱、记忆提取困难：面对抽象问题想不起具体事情。你的任务：在考生动笔前，先分析题库，设计一份「问题最少、覆盖最高、每题都好答」的经历问卷。\n'
    + '\n'
    + '工作方法：\n'
    + '1. 逐题通读清单，把「能被同一段真实生活经历辐射覆盖」的题目归为一组——判断标准：考场上把这段经历原样讲出来、再加一两句过渡就能引到该题。人物/地点/物品/事件/见闻感受五类元素齐全的一段日常经历是万能辐射源（例：一次和朋友的短途旅行，可同时辐射人物、地点、事件、照片、拥挤的地方、特别场合的食物、天气、一次散步、环保观点等）。\n'
    + '2. 用最少的问题卡覆盖清单：通常 4~6 张，硬上限 8 张；每张卡通常辐射 8~20 题。严禁一题一问、严禁按题目类别机械切分（人物题一卡、地点题一卡）。目标覆盖率（被 topics 覆盖的题 / 清单总题数）≥0.9；达不到就靠调整卡片主题、增强卡片元素覆盖，而不是增加卡片数量。\n'
    + '3. 每张卡对应一个具体、单一的经历主题，必须是学生或刚工作的年轻人真实生活里一定有的素材（如：最近一次和朋友出门 / 一件硬学会的事 / 每天离不开的东西 / 最近在网上刷到的内容 / 一个有画面的地方 / 由经历引出的一个观点）。严禁抽象主题、需要编造或需要专业背景的主题。\n'
    + '4. 每张卡必须按「漏斗式提问」展开 4~6 个 steps：\n'
    + '   ① 第一步必须是 yesno 或 choice，且带具体时间锚点（最近一周 / 最近半年 / 上周末 / 高中时 / 小时候），严禁无时间范围的「你有没有过……」；\n'
    + '   ② 每个 step 只提取一个事实（时间 / 人物地点 / 事件 / 细节 / 感受，每次一个），严禁连环问；严禁「说说 / 讲讲 / 描述 / 谈谈 / 你觉得」这类自由开放措辞；\n'
    + '   ③ choice 必须给 2~6 个具体、口语化的选项，并以「其他」为固定末项（选中后允许考生自填）；multi 题用 "multi":true；\n'
    + '   ④ 细节、感受类 step 设 "optional":true，允许留空；\n'
    + '   ⑤ yesno 必须给 noHint：选「没有」时展示的提示——引导考生回想具体时间节点（如「再想想：上周末、春节、暑假、谁的生日」），或提示可跳过此卡。\n'
    + '5. 每张卡给 topics（该卡预期覆盖的题，逐字取自清单，宁多勿漏，拿不准也列上）和 reason（一句中文，说明为什么问这段、能覆盖什么）。\n'
    + '6. 若考生提供了人设，主题与选项要贴合其身份：学生围绕学校/考试/同学/宿舍，工作者围绕职场/通勤/同事。\n'
    + '\n'
    + '输出严格 JSON，不要任何解释文字：\n'
    + '{"cards":[{"id":"q1","title":"具体经历主题","reason":"一句中文说明","topics":["逐字题名1","逐字题名2"],"steps":[{"k":"go","type":"yesno","label":"带时间锚点的封闭问题？","noHint":"选没有时的提示"},{"k":"when","type":"text","label":"单一事实小问","ph":"填写示例"},{"k":"pick","type":"choice","multi":true,"label":"挑你记得的","options":["具体选项1","具体选项2","其他"]},{"k":"detail","type":"text","optional":true,"label":"一个感官细节？","ph":"看到/听到/闻到（可留空）"},{"k":"feel","type":"choice","label":"当时什么感觉？","options":["开心","放松/踏实","累但值得","其他"]}]}]}';

  /* === 当季 P2 题库动态提取（P0：替代写死的 CANON 旧季快照）===
     每次生成/追问都以 DATA.speaking 真实题库为准（换季后自动跟随）；
     题库缺失时才回退 CANON 静态表（离线/异常兜底）。 */
  function getBankP2List(){
    const arr = (DATA.speaking || []).filter(s => s && s.type === 'P2');
    if(!arr.length) return null;
    return arr.map(s => ({
      title: s.titleZh || s.titleEn || '',
      req: (s.youShouldSay || []).slice(0, 3).join('；')
    })).filter(b => b.title);
  }
  function buildSysMat(){
    const bank = getBankP2List();
    const listStr = bank
      ? bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n')
      : CANON.join('、');
    return SYS_MAT.replace('{BANK_P2_LIST}', listStr);
  }

  let store = loadStore();
  let mode = 'q';
  let editing = -1;   // 当前正在「更改」编辑的素材卡下标；-1 表示无
  let shortWarned = false;   // P2：质检软门槛——短答案警告只弹一次，之后点生成直接放行
  let planLoading = false;   // design/86：动态问卷规划中（渲染 loading 态，防重复点击）
  let freeMode = false;      // design/86：规划失败兜底——自由填写模式（不依赖 plan 也能生成）

  function loadStore(){
    if(DATA.materials && typeof DATA.materials === 'object'){
      const s = DATA.materials; s.answers = s.answers || {};
      // design/86 新结构：cards（动态卡答案）/ customEn（现成英文素材）/ _legacy（旧答案留底）。
      // 旧的 gaps/followups/uncovered 字段不再初始化也不再消费（老数据静默兼容，严禁删用户数据）。
      s.answers.extraMore = s.answers.extraMore || [];
      s.answers.cards = s.answers.cards || {};
      s.answers.customEn = s.answers.customEn || [];
      s.answers._legacy = s.answers._legacy || {};
      s.materials = s.materials || []; s.deletedIds = s.deletedIds || [];
      return s;
    }
    // 一次性迁移：旧 localStorage 数据导入 DATA（此后走云同步）
    try{
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if(s && typeof s === 'object'){
        s.answers = s.answers || {};
        s.answers.extraMore = s.answers.extraMore || [];
        s.answers.cards = s.answers.cards || {};
        s.answers.customEn = s.answers.customEn || [];
        s.answers._legacy = s.answers._legacy || {};
        s.materials = s.materials || []; s.deletedIds = s.deletedIds || [];
        DATA.materials = s; return s;
      }
    }catch(_){}
    return { persona:null, materials:[], deletedIds:[], answers:{ extraMore:[], cards:{}, customEn:[], _legacy:{} } };
  }
  function saveStore(){
    // epoch 必须打在「即将写入的 store」上（与口语页旧内嵌版对齐的修复）：
    // 新用户首次 loadStore() 返回尚未挂到 DATA.materials 的新对象，若把 epoch 打在
    // DATA.materials 上再整体替换，首次保存的素材没有 epoch → 云端合并不走
    // 「较新端整体替换」分支，会出现「删了又并回来」。
    if(store && typeof store === 'object') store.materialsEpoch = Date.now();
    DATA.materials = store; hubSave();
  }
  function ans(id){ return (store.answers[id] || '').trim(); }

  /* 渲染容器双适配：materials.html 用 #matRoot；口语页 MAT tab 用 #matView */
  function rootEl(){ return $('#matRoot') || $('#matView'); }
  function init(){
    store = loadStore();
    // 9/19 事故自愈：旧版曾把 AI 失败的占位卡（storyEn 空、logicZh=问卷原话、_fallback:true）当素材保存。
    // 若素材集 100% 为占位卡 → 清空回问卷态（内容全由问卷答案可再生，零损失）；
    // saveStore 会打新 materialsEpoch，云端旧垃圾批次按「较新端整体替换」被覆盖，不会并回。
    if(store.materials.length && store.materials.every(m => m && m._fallback)){
      store.materials = [];
      if(store.persona && store.persona._fallback) store.persona = null;
      saveStore();
    }
    mode = store.materials.length ? 'result' : 'q';
    render();
  }

  /* ---------- 渲染分发 ---------- */
  function render(){
    const root = rootEl(); if(!root) return;
    if(mode === 'result' && store.materials.length){ renderResults(root); }
    else { renderQuestionnaire(root); }
  }

  /* ---------- 问卷页（design/86 动态漏斗问卷） ---------- */
  function renderQuestionnaire(root){
    /* 规划中：spinner 态 */
    if(planLoading){
      root.innerHTML = '<div class="mat-loading"><div class="mat-spinner"></div>正在分析当季题库、设计你的专属问题…（约 10~20 秒）</div>';
      return;
    }
    const plan = store.plan;
    const hasPlan = !!(plan && Array.isArray(plan.cards) && plan.cards.length);
    const bankLive = !!(DATA.speaking && DATA.speaking.length);
    let h = '<div class="mat-intro">先填一句人设，AI 会分析<b>当季最新题库</b>，只问你最少的几个问题；每步点选项就行，答不上的可以跳过，也能直接粘贴旧英文素材。</div>';
    // 无 Key 提示（4.7.2）：规划/生成都要 Key，但自由填写与英文素材可先填
    if(!(DATA.settings && DATA.settings.relayToken)){
      h += '<div class="mat-shortwarn"><b>还没配置 AI Key</b>：去「设置」填 DeepSeek Key 后才能分析题库出题和生成素材。下面的自由经历和英文素材可以先填着。</div>';
    }
    // 换季横幅（4.5）：plan 是按旧题库出的 → 提示手动重新出题（不自动重规划，避免打断填写）
    if(hasPlan && bankLive && plan.bankVersion !== (DATA.speakingVersion || 0)){
      h += '<div class="mat-shortwarn" id="matPlanStale"><b>口语题库已换季</b>，当前问题是按旧题库出的。<div class="mat-shortwarn-actions"><button class="btn btn-primary" id="matReplanBtn">按新题库重新出题</button><span class="mat-shortwarn-tip">会尽量把你已填的答案迁到新问题里</span></div></div>';
    }
    // 离线/题库缺失警示（4.4.3）
    if(hasPlan && plan.isFallback){
      h += '<div class="mat-shortwarn">当前离线或题库缺失，下面的问题基于通用题类生成、不保证是当季题；联网后点「重新分析题库出题」获取对症问题。</div>';
    }
    // 人设卡 A（固定）
    h += '<div class="mat-sec-title">人设卡 <span class="tag">1 题</span></div>';
    h += qCard('A');
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matPlanGen">' + (hasPlan ? '↻ 重新分析题库出题' : '生成我的专属问题') + '</button></div>';

    if(hasPlan){
      h += '<div class="mat-sec-title">你的专属经历问题 <span class="tag">' + plan.cards.length + ' 卡 · 按当季题库定制</span></div>';
      plan.cards.forEach(c => { h += planCard(c); });
    } else if(freeMode){
      // 4.7.1 兜底：规划失败/无 Key 时的自由填写模式（不依赖 plan 也能生成）
      h += '<div class="mat-sec-title">自由填写经历 <span class="tag">至少 1 段</span></div>';
    }

    // 现成英文素材区块（design/86 改动三）
    h += '<div class="mat-sec-title">复用我背过的英文素材 <span class="tag">选填</span></div>';
    h += '<div class="mat-q"><div class="mat-q-hint">粘贴你以前背过的英文原文（可多段），<b>原样进入故事、AI 一字不改</b>。</div>';
    (store.answers.customEn || []).forEach(x => {
      h += '<textarea data-en="' + x.id + '" placeholder="粘贴一段英文原文…（原样保留，不会改写）">' + escapeHtml(x.text || '') + '</textarea>'
        + '<div class="mat-char" data-enchar="' + x.id + '"></div>'
        + '<div style="text-align:right;margin:2px 0 8px"><button class="mat-mini danger" data-del-en="' + x.id + '">删除本段</button></div>';
    });
    h += '<button class="mat-add" id="matAddEn">＋ 添加一段英文原文</button></div>';

    // 自由经历（extraMore 沿用）
    (store.answers.extraMore || []).forEach(x => { h += qCard(x.id, true); });
    h += '<div class="mat-actions"><button class="mat-add" id="matAdd">＋ 添加一段经历</button></div>';

    // 旧答案留底折叠区（4.5/4.6：静态问卷时代字符串 + 换季未迁移答案；严禁静默丢弃）
    const legacy = store.answers._legacy || {};
    const legacyKeys = Object.keys(legacy).filter(k => String(legacy[k] || '').trim());
    if(legacyKeys.length){
      h += '<details class="mat-legacy"><summary>旧答案留底（' + legacyKeys.length + ' 条 · 可复制，不会丢）▸</summary>';
      legacyKeys.forEach(k => {
        h += '<div class="mat-legacy-item"><div class="mat-legacy-key">' + escapeHtml(k) + '</div>'
          + '<div class="mat-legacy-text">' + escapeHtml(String(legacy[k])) + '</div>'
          + '<button class="mat-mini" data-copy-legacy="' + escapeHtml(k) + '">复制</button></div>';
      });
      h += '</details>';
    }

    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2 0-2.8s-2-.8-3 0z"/><path d="M9 11l4 4"/><path d="M13 7l4 4 3-3a2 2 0 0 0-3-3l-4 2z"/><path d="M14 4l6 6"/></svg>生成我的专属素材</button></div>';
    root.innerHTML = h;

    /* ---- 绑定 ---- */
    // 人设 A / 自由经历 extraMore（沿用原 textarea 链路）
    root.querySelectorAll('textarea[data-q]').forEach(ta => {
      ta.addEventListener('input', () => {
        const id = ta.dataset.q;
        if(id && id[0] === 'X'){ const ex = (store.answers.extraMore || []).find(e => e.id === id); if(ex) ex.text = ta.value; }
        else store.answers[id] = ta.value;
        saveStore();
        updateChar(ta);
      });
      updateChar(ta);
    });
    // 现成英文素材
    root.querySelectorAll('textarea[data-en]').forEach(ta => {
      const save = () => {
        const x = (store.answers.customEn || []).find(e => e.id === ta.dataset.en);
        if(x) x.text = ta.value;
        saveStore();
        const ch = document.querySelector('[data-enchar="' + ta.dataset.en + '"]');
        if(ch) ch.textContent = ta.value.trim().length ? ('已粘贴 ' + ta.value.trim().length + ' 字符（将原样保留）') : '';
      };
      ta.addEventListener('input', save);
      save();
    });
    root.querySelectorAll('[data-del-en]').forEach(b => {
      b.onclick = () => {
        store.answers.customEn = (store.answers.customEn || []).filter(e => e.id !== b.dataset.delEn);
        saveStore(); render();
      };
    });
    const addEn = $('#matAddEn');
    if(addEn) addEn.onclick = () => {
      (store.answers.customEn = store.answers.customEn || []).push({ id: 'CE' + Date.now().toString(36), text: '' });
      saveStore(); render();
    };
    const addMore = $('#matAdd');
    if(addMore) addMore.onclick = () => {
      (store.answers.extraMore = store.answers.extraMore || []).push({ id: 'X' + Date.now(), text: '' });
      saveStore(); renderQuestionnaire(root);
    };
    // 动态卡交互（点击类统一重渲；文本类仅保存不重渲）
    root.querySelectorAll('[data-yn-card]').forEach(b => {
      b.onclick = () => {
        setStepVal(b.dataset.ynCard, b.dataset.ynK, b.dataset.ynVal);
        render();
      };
    });
    root.querySelectorAll('[data-pick-card]').forEach(b => {
      b.onclick = () => {
        pickOption(b.dataset.pickCard, b.dataset.pickK, b.dataset.pickOpt, b.dataset.multi === '1');
        render();
      };
    });
    root.querySelectorAll('[data-skip-card]').forEach(b => {
      b.onclick = () => { setSkipped(b.dataset.skipCard, true); render(); };
    });
    root.querySelectorAll('[data-unskip-card]').forEach(b => {
      b.onclick = () => { setSkipped(b.dataset.unskipCard, false); render(); };
    });
    root.querySelectorAll('[data-step-card]').forEach(ta => {
      ta.addEventListener('input', () => {
        const cid = ta.dataset.stepCard, k = ta.dataset.stepK;
        // multi 卡「其他」自填：文本并入数组（已勾选项保留，严禁整键覆盖）；单选/text 直接存字符串
        let ps = null;
        const pc = (store.plan && Array.isArray(store.plan.cards)) ? store.plan.cards.find(c => c && c.id === cid) : null;
        if(pc && Array.isArray(pc.steps)) ps = pc.steps.find(st => st && st.k === k) || null;
        if(ps && ps.multi){
          const st = cardState(cid);
          const prev = Array.isArray(st.s[k]) ? st.s[k] : [];
          const opts = Array.isArray(ps.options) ? ps.options : [];
          const kept = prev.filter(x => opts.indexOf(x) >= 0);
          const txt = ta.value.trim();
          st.s[k] = txt ? kept.concat([txt]) : kept;
          saveStore();
        } else {
          setStepVal(cid, k, ta.value);
        }
      });
    });
    // 规划 / 重新规划
    const pg = $('#matPlanGen');
    if(pg) pg.onclick = () => doPlan(!!(store.plan && Array.isArray(store.plan.cards) && store.plan.cards.length));
    const rp = $('#matReplanBtn');
    if(rp) rp.onclick = () => doPlan(true);
    // 旧答案复制
    root.querySelectorAll('[data-copy-legacy]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.copyLegacy;
        const txt = String((store.answers._legacy || {})[k] || '');
        copyText(txt, () => { b.textContent = '已复制'; setTimeout(() => { b.textContent = '复制'; }, 1500); });
      };
    });
    $('#matGen').onclick = generate;
  }

  /* 文本复制（clipboard API 优先，execCommand 兜底） */
  function copyText(txt, done){
    const fallback = () => {
      try{
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if(done) done();
      }catch(e){ toast('复制失败，请手动长按选择复制'); }
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(() => { if(done) done(); }).catch(fallback);
    } else fallback();
  }

  /* 人设卡 A / 自由经历 extraMore 的 textarea 卡（QUESTIONS 静态表兜底沿用） */
  function qCard(id, isExtraMore){
    const q = QUESTIONS.find(x => x.id === id);
    const title = q ? q.title : '补充经历';
    const hint = q ? q.hint : '补一段真实经历，兜底极端偏题（如交通工具/科学成就）。';
    const val = isExtraMore ? ((store.answers.extraMore || []).find(e => e.id === id) || {}).text || '' : store.answers[id] || '';
    const optCls = (q && q.group === 'extra') || isExtraMore ? ' optional' : '';
    const reqBadge = (q && q.required) ? '<span class="req">必填</span>' : (isExtraMore ? '' : '<span class="opt">选填</span>');
    return '<div class="mat-q' + optCls + '">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(title) + reqBadge + '</span></div>'
      + '<div class="mat-q-hint">' + escapeHtml(hint) + '</div>'
      + '<textarea data-q="' + id + '" placeholder="' + (q ? escapeHtml(q.title) : '真实经历…') + '">' + escapeHtml(val) + '</textarea>'
      + '<div class="mat-char" data-char="' + id + '"></div>'
      + '</div>';
  }
  function updateChar(ta){
    const id = ta.dataset.q;
    const el = document.querySelector('[data-char="' + id + '"]'); if(!el) return;
    const n = ta.value.trim().length;
    let tip = '已写 ' + n + ' 字';
    let cls = '';
    if(n > 0 && n < 20){ tip += ' · 太短，AI 没细节可用'; cls = 'warn'; }
    else if(n >= 20 && n < 60){ tip += ' · 再补 1-2 个细节（看到什么 / 当时感受）'; cls = 'ok'; }
    else if(n >= 60){ tip += ' · 够了'; cls = 'good'; }
    el.textContent = tip;
    el.classList.remove('warn','ok','good');
    if(cls) el.classList.add(cls);
  }

  /* ---- 动态卡：取值/写值 ---- */
  function cardState(cid){
    store.answers.cards = store.answers.cards || {};
    if(!store.answers.cards[cid]) store.answers.cards[cid] = { s:{}, skipped:false };
    return store.answers.cards[cid];
  }
  function setStepVal(cid, k, v){ cardState(cid).s[k] = v; saveStore(); }
  function setSkipped(cid, sk){ cardState(cid).skipped = sk; saveStore(); }
  function pickOption(cid, k, opt, multi){
    const st = cardState(cid);
    if(multi){
      let arr = Array.isArray(st.s[k]) ? st.s[k].slice() : [];
      if(arr.indexOf(opt) >= 0) arr = arr.filter(x => x !== opt);
      else arr.push(opt);
      st.s[k] = arr;
    } else {
      st.s[k] = (st.s[k] === opt) ? null : opt;   // 单选再点一次取消
    }
    saveStore();
  }

  /* 动态卡渲染（4.4.4） */
  function planCard(card){
    const st = cardState(card.id);
    if(st.skipped){
      return '<div class="mat-q mat-plan-skipped" data-unskip-card="' + escapeHtml(card.id) + '" title="点此恢复">已跳过：' + escapeHtml(card.title || '') + ' · 点此恢复</div>';
    }
    let h = '<div class="mat-q mat-plan-card">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(card.title || '') + '</span>'
      + '<button class="mat-mini" data-skip-card="' + escapeHtml(card.id) + '">跳过此卡</button></div>';
    if(card.reason) h += '<div class="mat-q-hint">' + escapeHtml(card.reason) + '</div>';
    if(Array.isArray(card.topics) && card.topics.length){
      h += '<details class="mat-topics"><summary>这张卡覆盖 ' + card.topics.length + ' 道当季题 ▸</summary>'
        + '<div class="mat-chips">' + card.topics.map(t => '<span class="mat-chip">' + escapeHtml(t) + '</span>').join('') + '</div></details>';
    }
    (card.steps || []).forEach(step => { h += planStep(card.id, step, st.s[step.k]); });
    h += '</div>';
    return h;
  }
  function planStep(cid, step, val){
    const reqTag = step.optional ? '<span class="opt-tag">可留空</span>' : '';
    let h = '<div class="mat-step"><div class="mat-step-label">' + escapeHtml(step.label || '') + reqTag + '</div>';
    if(step.type === 'yesno'){
      h += '<div class="mat-yn">'
        + '<button type="button" class="' + (val === '有' ? 'on' : '') + '" data-yn-card="' + escapeHtml(cid) + '" data-yn-k="' + escapeHtml(step.k) + '" data-yn-val="有">有</button>'
        + '<button type="button" class="' + (val === '没有' ? 'on' : '') + '" data-yn-card="' + escapeHtml(cid) + '" data-yn-k="' + escapeHtml(step.k) + '" data-yn-val="没有">没有</button>'
        + '</div>';
      if(val === '没有' && step.noHint) h += '<div class="mat-nohint">' + escapeHtml(step.noHint) + '</div>';
    } else if(step.type === 'choice' && Array.isArray(step.options) && step.options.length){
      const arr = Array.isArray(val) ? val : [];
      h += '<div class="mat-chips">' + step.options.map(o => {
        const on = arr.indexOf(o) >= 0 || val === o;
        return '<button type="button" class="mat-chip pick' + (on ? ' on' : '') + '" data-pick-card="' + escapeHtml(cid) + '" data-pick-k="' + escapeHtml(step.k) + '" data-pick-opt="' + escapeHtml(o) + '"' + (step.multi ? ' data-multi="1"' : '') + '>' + escapeHtml(o) + '</button>';
      }).join('') + '</div>';
      // 「其他」选中 → 自填输入框（multi：文本并入数组；单选：文本即值）
      const otherPicked = arr.indexOf('其他') >= 0 || val === '其他';
      const otherText = (typeof val === 'string' && val && val !== '其他' && step.options.indexOf(val) < 0) ? val : (arr.filter(x => step.options.indexOf(x) < 0)[0] || '');
      if(otherPicked || otherText){
        h += '<input type="text" data-step-card="' + escapeHtml(cid) + '" data-step-k="' + escapeHtml(step.k) + '" value="' + escapeHtml(otherText || '') + '" placeholder="具体说说（其他）…">';
      }
    } else {
      // text（默认）：单行输入 + 示例 ph
      h += '<input type="text" data-step-card="' + escapeHtml(cid) + '" data-step-k="' + escapeHtml(step.k) + '" value="' + escapeHtml(val || '') + '"' + (step.ph ? ' placeholder="' + escapeHtml(step.ph) + '"' : '') + '>';
    }
    h += '</div>';
    return h;
  }
  /* 卡答案 → 纯文本（喂给 SYS_MAT）。格式：label 去问号：值；多选顿号拼接；空步跳过（design/86 §6.2） */
  function labelNoQ(label){ return String(label || '').replace(/[？?]+\s*$/, ''); }
  function formatCard(card, st){
    const s = (st && st.s) || {};
    const parts = [];
    (card.steps || []).forEach(step => {
      const v = s[step.k];
      if(v == null) return;
      if(Array.isArray(v)){ if(v.length) parts.push(labelNoQ(step.label) + '：' + v.join('、')); return; }
      if(String(v).trim()) parts.push(labelNoQ(step.label) + '：' + String(v).trim());
    });
    return parts.join('；');
  }

  /* ---- design/86 改动一：动态问卷规划 genQuestionPlan ----
     AI 拿当季 P2 题库全量清单 → 聚类 → 4~6 张漏斗式问题卡（含预迁移 prefill）。 */
  async function genQuestionPlan(isReplan){
    const bank = getBankP2List();
    const isFallback = !bank;
    const listStr = bank
      ? bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n')
      : CANON.join('、');
    let sys = SYS_PLAN;
    // 换季重规划：携带旧卡已填答案概要，让 AI 尽量 prefill 迁移（4.5）
    const oldPlan = (isReplan && store.plan && Array.isArray(store.plan.cards)) ? store.plan : null;
    if(oldPlan){
      const oldAns = store.answers.cards || {};
      const summary = oldPlan.cards.map(c => {
        const raw = formatCard(c, oldAns[c.id]);
        return '· ' + (c.title || '') + '：' + (raw ? raw.slice(0, 300) : '（未填或已跳过）');
      }).join('\n');
      sys += '\n考生在旧题库问卷下已填了答案，见下。请在输出的每张新卡 step 中，对能沿用旧答案的 step 增加 "prefill":"旧答案原文" 字段（键为该 step 的 k）；按事实语义匹配，迁移不了的严禁硬迁。\n旧问卷答案概要：\n' + summary;
    }
    const user = '人设：' + (ans('A') || '（未提供）') + '\n\n【当季 P2 题库清单】\n' + listStr;
    const content = await callRelay('material_plan', [ { role:'system', content:sys }, { role:'user', content:user } ], 0.5, { max_tokens: 8192 });
    const j = aiJson(content);
    if(!j || !Array.isArray(j.cards) || !j.cards.length) throw new Error('问卷规划 JSON 解析失败');
    const bankTitles = bank ? bank.map(b => b.title) : null;
    const cards = cleanPlanCards(j.cards, bankTitles, isFallback);
    if(!cards.length) throw new Error('AI 没有返回可用的问题卡');

    // 4.6 老数据兼容：静态 QUESTIONS 时代的字符串答案（B1~B5/C1~C4 等）整体移入 _legacy 留底（A 人设沿用）
    store.answers = store.answers || {};
    Object.keys(store.answers).forEach(k => {
      if(['A','extraMore','cards','customEn','_legacy'].indexOf(k) >= 0) return;
      if(typeof store.answers[k] === 'string'){
        store.answers._legacy = store.answers._legacy || {};
        if(store.answers._legacy[k] == null || store.answers._legacy[k] === '') store.answers._legacy[k] = store.answers[k];
        delete store.answers[k];
      }
    });

    // 换季迁移对账（4.5）：旧卡已填 step 值未被任何新卡 prefill 采用 → 汇入 _legacy（严禁静默丢弃）
    if(oldPlan){
      const prefillVals = [];
      cards.forEach(c => (c.steps || []).forEach(st => { if(st && st.prefill != null && String(st.prefill).trim()) prefillVals.push(String(st.prefill).trim()); }));
      const oldAns = store.answers.cards || {};
      oldPlan.cards.forEach(c => {
        const st = oldAns[c.id];
        if(!st || st.skipped) return;
        (c.steps || []).forEach(step => {
          const v = st.s && st.s[step.k];
          if(v == null) return;
          const vs = Array.isArray(v) ? v.join('、') : String(v).trim();
          if(!vs) return;
          const migrated = prefillVals.some(p => p === vs || p.indexOf(vs) >= 0 || vs.indexOf(p) >= 0);
          if(!migrated){
            store.answers._legacy = store.answers._legacy || {};
            const key = '旧卡·' + (c.title || c.id) + '·' + labelNoQ(step.label);
            if(!store.answers._legacy[key]) store.answers._legacy[key] = vs;
          }
        });
      });
    }

    // prefill 预填：新卡带 prefill 的 step 写入 answers.cards 作初始值（不覆盖用户已填）
    store.answers.cards = store.answers.cards || {};
    cards.forEach(c => {
      const cur = store.answers.cards[c.id] || { s:{}, skipped:false };
      (c.steps || []).forEach(st => {
        if(st && st.prefill != null && String(st.prefill).trim() && cur.s[st.k] == null) cur.s[st.k] = String(st.prefill).trim();
      });
      store.answers.cards[c.id] = cur;
    });
    store.plan = { bankVersion: DATA.speakingVersion || 0, isFallback: !!isFallback, cards: cards };
    saveStore();
  }
  /* AI 返回卡清洗（4.3.4，前端必须做，不信任 AI 自觉） */
  function cleanPlanCards(rawCards, bankTitles, isFallback){
    const out = [];
    (Array.isArray(rawCards) ? rawCards : []).forEach((c, i) => {
      if(!c || !c.title || !Array.isArray(c.steps) || !c.steps.length) return;
      const card = {
        id: String(c.id || ('q' + Date.now().toString(36) + i)),
        title: String(c.title),
        reason: String(c.reason || ''),
        topics: [],
        steps: []
      };
      // topics 纠偏：落到当季题库真实题名（兜底模式跳过纠偏，原样保留 CANON 名）；去重
      const seenT = new Set();
      (Array.isArray(c.topics) ? c.topics : []).forEach(t => {
        let name = String(t || '').trim();
        if(!name) return;
        if(!isFallback && bankTitles){
          const bt = matchBankTitle(name, bankTitles);
          if(!bt) return;
          name = bt;
        }
        if(seenT.has(name)) return;
        seenT.add(name);
        card.topics.push(name);
      });
      // steps：最多 6 个；type 白名单；choice 降级；「其他」末项；yesno 补 noHint
      (c.steps || []).slice(0, 6).forEach(st => {
        if(!st || !st.k || !st.label) return;
        let type = ['yesno','choice','text'].indexOf(st.type) >= 0 ? st.type : 'text';
        const step = { k: String(st.k), type: type, label: String(st.label) };
        if(step.type === 'text' && st.ph) step.ph = String(st.ph);
        if(st.optional) step.optional = true;
        if(step.type === 'choice'){
          let opts = Array.isArray(st.options) ? st.options.map(x => String(x || '').trim()).filter(Boolean) : [];
          if(opts.length < 2){ step.type = 'text'; }   // choice 无 options/<2 → 降级 text
          else {
            if(opts[opts.length - 1] !== '其他') opts.push('其他');
            step.options = opts.slice(0, 7);
            if(st.multi) step.multi = true;
          }
        }
        if(step.type === 'yesno' && !st.noHint) step.noHint = '再想想：上周末、春节、暑假、谁的生日这些时间点有没有过类似的事；实在没有就跳过此卡。';
        if(st.prefill != null && String(st.prefill).trim()) step.prefill = String(st.prefill).trim();
        card.steps.push(step);
      });
      if(card.steps.length) out.push(card);
    });
    return out;
  }
  /* 规划入口（含 loading/失败兜底 4.7） */
  async function doPlan(isReplan){
    if(planLoading) return;
    planLoading = true;
    try{ render(); }catch(_){}
    try{
      await genQuestionPlan(isReplan);
      freeMode = false;
      toast('已按当季题库出好 ' + (store.plan.cards.length) + ' 张问题卡，逐卡点选就行');
    }catch(e){
      console.error('[materials] 问卷规划失败', e);
      // 4.7.1 兜底：没有旧 plan 可用 → 自由填写模式（人设 + ≥3 段自由经历 + 英文素材，照样能生成）
      const hasPlan = !!(store.plan && Array.isArray(store.plan.cards) && store.plan.cards.length);
      if(!hasPlan){
        freeMode = true;
        store.answers.extraMore = store.answers.extraMore || [];
        while(store.answers.extraMore.length < 3) store.answers.extraMore.push({ id: 'X' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), text: '' });
        saveStore();
        toast('按题库出题失败：' + e.message + '。已切换为自由填写模式，直接写经历也能生成');
      } else {
        toast('重新出题失败：' + e.message + '（旧问题保留，可重试）');
      }
    }finally{
      planLoading = false;
      try{ render(); }catch(_){}
    }
  }

  /* ---------- 生成 ---------- */
  async function generate(){
    editing = -1;   // 重新生成整体替换素材集，重置编辑态，避免旧下标错位指向错误的卡（f 类：跨操作状态隔离）
    // 收集经历（design/86 §6：A 人设 + 动态卡 + 现成英文素材 + 自由经历）
    const experiences = [];
    const personaText = (store.answers.A || '').trim();
    let answeredCards = 0, hasCustom = false, hasExtra = false;
    const shortTitles = [];
    const plan = store.plan;
    const cardAns = store.answers.cards || {};
    if(plan && Array.isArray(plan.cards)){
      plan.cards.forEach(c => {
        const st = cardAns[c.id];
        if(!st || st.skipped) return;
        const raw = formatCard(c, st);
        if(!raw) return;
        answeredCards++;
        experiences.push({ id: c.id, title: c.title || '经历', raw: raw });
        if(raw.length < 40) shortTitles.push(c.title || c.id);   // 短卡进软门槛
      });
    }
    (store.answers.customEn || []).forEach((x, i) => {
      const t = String(x.text || '').trim();
      if(!t) return;
      hasCustom = true;
      // 中文字符占比 <5% 的段 tryBatch 自动打「原样保护」标（规则 5.2），无需额外标记
      experiences.push({ id: 'CE' + i, title: '现成英文素材（原样保留）', raw: t });
    });
    (store.answers.extraMore || []).forEach(x => {
      if((x.text || '').trim()){ hasExtra = true; experiences.push({ id: x.id, title: '补充经历', raw: x.text.trim() }); }
    });
    // 校验
    if(!personaText){ toast('先填上面第一张「人设卡」再生成'); return; }
    if(!answeredCards && !hasCustom && !hasExtra){ toast('至少回答一个问题、添加一段经历，或粘贴一段英文素材，再生成。'); return; }

    // P2：素材质检软门槛——拼接后 <40 字的非跳过动态卡先提示补充（不强制拦截，可点「直接生成」放行）
    if(shortTitles.length && !shortWarned){
      shortWarned = true;
      showShortWarning(shortTitles);
      return;
    }

    const hasKey = !!(DATA.settings && DATA.settings.relayToken);
    if(!hasKey) toast('未配置 AI Key（设置里填 DeepSeek Key），无法生成');

    setLoading('正在把你的故事整合成万能素材…');
    try{
      // 1) 人设：失败沿用旧人设（没有旧的才用占位）；人设失败不拦截整批
      let persona = null;
      try{ persona = await genPersona(personaText); }
      catch(e){ persona = (store.persona && !store.persona._fallback) ? store.persona : fallbackPersona(personaText); }
      // 2) 整批生成（9/19 定版：失败绝不落库——旧「模板兜底」会把问卷原话当素材卡存进库，已废）
      const result = await genMaterialsBatch(experiences, personaText);
      if(!result.stories || !result.stories.length) throw new Error('AI 没有返回任何故事');

      // 重新生成 = 整库替换：旧素材一律不留（用户的问卷答案都在，重新生成即可复原等价故事）
      store.persona = persona; store.materials = result.stories;
      store.bankVersion = DATA.speakingVersion;   // P2：记录生成时题库版本
      // 给每张素材卡补稳定 id（AI 未必返回），供删除墓碑与跨设备去重使用
      store.materials.forEach(m => { if(m && m.id == null) m.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); });
      // 英文故事混入中文词时自动重写为纯英文（自愈，仅在检测到中文时才多一次调用）
      setLoading('正在检查英文稿…');
      try{ await fixStoryEnglish(); }catch(_){ /* 自愈失败不阻断批次 */ }
      store.materialsEpoch = Date.now();   // 生成批次戳：云端合并时凭此整体替换旧素材，避免旧卡片被并集回残留
      saveStore();
      mode = 'result';
      render();
      const dropMsg = (result.goldenDropped > 0) ? '；另有 ' + result.goldenDropped + ' 句万能句因未内嵌故事正文被丢弃，建议重新生成' : '';
      toast('已生成 ' + result.stories.length + ' 张全新素材卡，去口语页开练即可' + dropMsg);
    }catch(e){
      console.error('[materials] 生成失败', e);
      toast('素材生成失败：' + e.message + '（未保存任何内容，可重试）');
      render();
    }
  }

  function setLoading(msg){
    const root = rootEl(); if(!root) return;
    root.innerHTML = '<div class="mat-loading"><div class="mat-spinner"></div>' + escapeHtml(msg) + '</div>';
  }

  /* P2：质检软门槛提示——列出偏短的经历卡，给「直接生成」放行按钮 */
  function showShortWarning(titles){
    const root = rootEl(); if(!root) return;
    const old = document.querySelector('.mat-shortwarn'); if(old) old.remove();
    const div = document.createElement('div');
    div.className = 'mat-shortwarn';
    div.innerHTML = '<b>先补两个细节？</b>这几段经历偏短（不到 40 字），AI 只能干巴巴地拼，故事会不像真的：'
      + '<div class="mat-shortwarn-list">' + titles.map(n => '· ' + escapeHtml(n)).join('<br>') + '</div>'
      + '<div class="mat-shortwarn-actions"><button class="btn btn-primary" id="matShortGen">直接生成</button><span class="mat-shortwarn-tip">建议回上面补 1-2 个细节（看到什么 / 当时感受）再生成</span></div>';
    root.prepend(div);
    div.scrollIntoView({ behavior:'smooth', block:'center' });
    document.getElementById('matShortGen').onclick = () => { div.remove(); generate(); };
  }

  /* 单次尝试：调一次 material，只做 JSON 解析（normalize 留到合并后统一过一遍，保证 id 下标连续） */
  async function tryBatch(subset, personaText, batchLabel){
    const expText = subset.map(e => {
      const raw = String(e.raw || '');
      const zhCount = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
      const isEn = raw.length > 0 && (zhCount / raw.length) < 0.05;
      return '【' + e.title + '】' + (isEn ? '[原样保护·禁止改写]\n' : '\n') + raw;
    }).join('\n\n');
    // 拆批时明确告知 AI「只整合本批」，否则它会按全量答题、两批内容打架
    const headNote = batchLabel ? '（这是考生全部经历的第 ' + batchLabel + ' 批，只整合本批经历，stories 与 coverage 照常输出）\n\n' : '';
    const listNote = batchLabel ? '本批经历：\n' : '全部经历（含追问补充）：\n';
    const user = '人设：' + (personaText || '（未提供）') + '\n\n' + headNote + listNote + expText + '\n\n请按规则整合为尽量少的连贯大故事（coverage 按规则 4.x 放开挂题），输出 stories JSON。';
    const content = await callRelay('material', [ { role:'system', content:buildSysMat() }, { role:'user', content:user } ], 0.7, { max_tokens: 8192 });
    const j = aiJson(content);
    if(!j || !Array.isArray(j.stories)) throw new Error('素材 JSON 解析失败');
    return j;
  }
  /* design/86 §7.2：拆批只合并 stories 与 coverageRate（uncovered/followups 链路已删） */
  function collectBatch(j){
    return {
      stories: Array.isArray(j.stories) ? j.stories : [],
      coverageRate: (typeof j.coverageRate === 'number' ? j.coverageRate : null)
    };
  }
  function mergeBatch(a, b){
    let rate = a.coverageRate;
    if(b.coverageRate != null) rate = (rate == null) ? b.coverageRate : Math.max(rate, b.coverageRate);
    return { stories: a.stories.concat(b.stories), coverageRate: rate };
  }
  /* 截断自愈（9/21）：输出被 max_tokens 截断时 JSON 解析必然失败。此时按经历条数二分拆批重试，
     最多两级拆分——正常路径请求次数与改前一致（1 次），拆批只是异常兜底。 */
  async function genMaterialsBatch(exps, personaText){
    const FAIL_MSG = '素材生成失败（返回内容被截断或格式错误），请少填几条经历后重试';
    async function attempt(subset, depth, label){
      try{
        return collectBatch(await tryBatch(subset, personaText, label));
      }catch(e){
        // 全量失败要 >3 条才值得拆（≤3 条拆开也没多少 token 可省）；再往下最多拆到第二级
        const canSplit = subset.length > 1 && depth < 2 && (depth === 0 ? subset.length > 3 : true);
        if(!canSplit) throw new Error(FAIL_MSG);
        const half = Math.ceil(subset.length / 2);
        const ra = await attempt(subset.slice(0, half), depth + 1, '1/2');
        const rb = await attempt(subset.slice(half), depth + 1, '2/2');
        return mergeBatch(ra, rb);
      }
    }
    const res = await attempt(exps, 0, null);
    let dropped = 0;
    const stories = res.stories.map((s, i) => {
      const m = normalizeMaterial(s, i);
      dropped += (m._goldenDropped || 0);
      delete m._goldenDropped;      // 临时字段绝不落库
      return m;
    });
    return { stories: stories, coverageRate: res.coverageRate, goldenDropped: dropped };
  }
  async function genPersona(text){
    const content = await callRelay('material_persona', [ { role:'system', content:SYS_PERSONA }, { role:'user', content:'自我介绍：' + text } ], 0.4);
    const j = aiJson(content);
    if(!j || !j.persona) throw new Error('人设 JSON 解析失败');
    return j.persona;
  }

  function normalizeMaterial(s, i){
    const cov = Array.isArray(s.coverage) ? s.coverage : [];
    // 题名纠偏（与深挖同标准）：AI 返回的 topic 落回题库真实题名，落不上的丢弃 + 去重
    const bankTitles = (getBankP2List() || []).map(b => b.title);
    const seen = new Set();
    const covFixed = [];
    cov.forEach(c => {
      if(!c || !c.topic) return;
      const bt = matchBankTitle(String(c.topic), bankTitles);
      if(!bt || seen.has(bt)) return;
      seen.add(bt);
      covFixed.push({ topic: bt, fit: (String(c.fit) === 'natural' ? 'natural' : 'loose'), bridgeEn: String(c.bridgeEn || ''), note: String(c.note || '') });
    });
    const goldenRaw = Array.isArray(s.goldenEn) ? s.goldenEn.map(x => String(x || '').trim()).filter(Boolean) : [];
    const storyLower = String(s.storyEn || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
    // design/68 新口径：万能句必须是 storyEn 正文的子句（能在正文原样匹配到），孤儿万能句丢弃
    const goldenHit = goldenRaw.filter(g => {
      const key = g.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      return key.length >= 8 && storyLower.includes(key.slice(0, 40));
    });
    const golden = goldenHit.slice(0, 3);
    // 孤儿万能句不再静默丢弃：计数回传，由 generate() 在成功 toast 里提示（临时字段，落库前剥掉）
    const goldenDropped = goldenRaw.length - goldenHit.length;
    return {
      _goldenDropped: goldenDropped,
      id: s.id || ('m' + Date.now() + '_' + i),
      title: s.title || ('故事' + (i + 1)),
      storyEn: s.storyEn || '',
      // design/86 骨架层：AI 摘句校验（≥4 句取前 7），不足走兜底抽取，保证每卡非空
      spineEn: computeSpine(s.storyEn, s.spineEn),
      goldenEn: golden,
      logicZh: s.logicZh || '',
      coverage: covFixed,
      confidence: s.confidence || 'high',
      pinned: false
    };
  }
  /* design/86 5.2/5.4：骨架句计算——AI 摘句必须是 storyEn 原句（规范化后整句包含），
     按正文出现顺序去重排序；命中 ≥4 取前 7；<4 自动兜底抽取（首句 + 含从句/转折连接词的句子
     最多 4 句 + 末句，仍不足按正文顺序补足 4~7 句）。编辑保存后传 aiSpine=null 全量重抽。 */
  function computeSpine(story, aiSpine){
    const s = String(story || '');
    if(!s.trim()) return [];
    const storyNorm = s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const seen = new Set();
    const hit = [];
    (Array.isArray(aiSpine) ? aiSpine : []).forEach(x => {
      const g = String(x || '').trim();
      if(!g) return;
      const key = g.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if(key.length < 8 || seen.has(key) || !storyNorm.includes(key)) return;
      seen.add(key);
      hit.push({ g: g, pos: storyNorm.indexOf(key) });
    });
    hit.sort((a, b) => a.pos - b.pos);
    if(hit.length >= 4) return hit.map(x => x.g).slice(0, 7);
    const norm1 = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const sents = (s.match(/[^.!?]+[.!?]+["'\u201d\u2019)]*\s*|[^.!?]+$/g) || []).map(x => x.trim()).filter(Boolean);
    if(!sents.length) return hit.map(x => x.g);
    const out = hit.map(x => x.g);
    const push = x => { if(x && !out.some(y => norm1(y) === norm1(x))) out.push(x); };
    push(sents[0]);
    const kw = /\b(because|when|who|which|that|but|although|however)\b/i;
    for(const sn of sents){ if(out.length >= 5) break; if(kw.test(sn)) push(sn); }
    push(sents[sents.length - 1]);
    for(const sn of sents){ if(out.length >= 4) break; push(sn); }
    return out.slice(0, 7);
  }
  function fallbackPersona(text){
    return { city:'', identity:text || '', values:[], traits:[], _fallback:true };
  }

  /* === 覆盖深挖：每张素材卡对当季题库全量重评（默认能串、宁多勿漏、题名纠偏落库） ===
     结果页换季横幅的「一键重新映射题族」入口；silent=true 为程序内部调用。 */
  async function deepDigCoverage(silent){
    try{
      const bank = getBankP2List();
      const mats = (store.materials || []).filter(m => m && (m.coverage || []).length);
      if(!bank || !mats.length){
        // 9/23 她反馈：没有带 coverage 的卡时这里直接 return，版本号永远不对齐 → 换季横幅永远不消失。
        // 没有映射可过时，横幅已无意义：直接对齐版本号让横幅消失（bank 取不到时除外——那是数据异常，保留横幅）。
        if(bank && !mats.length && store.bankVersion !== DATA.speakingVersion){ store.bankVersion = DATA.speakingVersion; saveStore(); }
        return { applied: 0, failed: [] };
      }
      const newList = bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n');
      const bankTitles = bank.map(b => b.title);
      // 逐卡调用（单卡输出远小于全量，避免长输出被截断导致整体失败），
      // 每张卡对新题库【全量重评】，AI 返回的题名纠偏落回真实题库题名后再入库
      const rawAns = QUESTIONS.map(q => ans(q.id)).filter(v => v).map(v => '· ' + v.slice(0, 150)).join('\n');
      const sys = '你是雅思口语串题覆盖挖掘助手。考生正在对自己的素材卡做覆盖深挖。下面给出这张素材卡的故事内容（概要+中文逻辑）和考生问卷原始经历。你的任务是**把这张卡放到题库清单里全量重评一遍**。先理解考生的真实用法：考场上 90% 就是把故事原样讲出来，只临场加 1~2 句过渡点题——所以你的默认态度是「**能串**」，发挥想象力找联系，不要挑剔：\n'
        + '1. 判断标准不是「故事里有没有讲到这个」，而是「**站在考场上把故事讲出来，能不能自然引到这道题**」：直接讲就是 natural；稍微搭边、或临场加一句合理的话就能圆上，就是 loose；**拿不准的，也按 loose 列上**——考场上不合适临场放弃没有任何损失，漏列了考生才吃亏。允许即兴补充合理细节，这正是串题的实战用法。\n'
        + '2. 放开想：故事是个素材库，里面的人、地点、物品、瞬间、感受都能辐射成题。旅行/学校/家庭/常去的地方这类日常故事是万能辐射源——场景里合理出现的一切都能挂（建筑、比赛、食物、遇到的人、拥挤、嘈杂安静、天气、照片……）。例：去厦门的故事 → 高建筑（住的酒店楼层很高）、体育赛事（沙滩上正好有排球）、特别场合的食物（海鲜大餐）、拥挤的地方（轮渡人山人海）。\n'
        + '3. **抽象/观点类题更要放开想象**：想颁布的法律、规则、想做的改变、想解决的问题、传统、挑战、认为重要的事——这些题考的是「想法」，而任何经历都能自然生出一个想法（看到某件事 → 有个感受 → I want to… / I think…）。比如旅行路上见到有人破坏环境 → 顺理成章想颁布环保法律。把清单里的抽象题逐个想一遍：「这段经历能不能让人生出这个想法？」只要不是完全牵强，就按 loose 列上，note 写清那句过渡怎么讲。\n'
        + '4. 每张卡通常能列 10~20 题，宁多勿漏；topic **逐字复制题库清单里的题名**（「（要点：…）」前面的部分才是题名，不要改写、简写或合并近似题名——题库里「想颁布的新法律」「想要颁布的环保法律」「保护环境的法律」是三道不同的题，能挂就分别列出）；每条给 fit（natural|loose）、一句考场可直接念的英文点题句 bridgeEn（初中词汇、单一主谓简单句、15 词以内——这句就是考生临场要加的那句话）和中文 note（loose 写清那句过渡怎么讲，可写"即兴补：…"）。\n'
        + '输出严格 JSON：{"coverage":[{"topic":"","fit":"","bridgeEn":"","note":""}]}，不要任何解释文字。';
      let applied = 0; const failed = [];
      for(let i = 0; i < mats.length; i++){
        const m = mats[i];
        if(silent) setLoading('正在深挖覆盖 ' + (i + 1) + '/' + mats.length + '（提交后自动做，无需手动）…');
        const user = '素材卡：【' + (m.title || '未命名') + '】\n故事：' + String(m.storyEn || '').slice(0, 400) + '\n中文逻辑：' + (m.logicZh || '')
          + (rawAns ? '\n\n考生问卷原始经历（可从中取细节做即兴补充）：\n' + rawAns : '')
          + '\n\n题库清单：\n' + newList;
        let content;
        try{
          content = await callRelay('material_remap', [ { role:'system', content:sys }, { role:'user', content:user } ], 0.4, { max_tokens: 8192 });
        }catch(err){ failed.push((m.title || '未命名') + '：' + err.message); continue; }
        const j = aiJson(content);
        const covArr = (j && Array.isArray(j.coverage)) ? j.coverage : (j && Array.isArray(j.mappings) && j.mappings[0] && Array.isArray(j.mappings[0].coverage) ? j.mappings[0].coverage : null);
        if(!covArr){ failed.push((m.title || '未命名') + '：AI 返回格式异常'); continue; }
        // 题名纠偏 + 去重：AI 返回的题名先落到题库真实题名，落不上的丢弃（防止近似变体永不匹配矩阵）
        const seen = new Set();
        m.coverage = [];
        covArr.forEach(c => {
          if(!c || !c.topic) return;
          const bt = matchBankTitle(String(c.topic), bankTitles);
          if(!bt || seen.has(bt)) return;
          seen.add(bt);
          m.coverage.push({ topic: bt, fit: (String(c.fit) === 'natural' ? 'natural' : 'loose'), bridgeEn: String(c.bridgeEn || ''), note: String(c.note || '') });
        });
        applied++;
        saveStore();
        // 9/23 她反馈：逐卡 render 会把「⏳ 重新映射中…」按钮文字打回原样，看起来像点了没反应。
        // 改为只更新按钮进度文字，不整页重渲；全部完成后（handler 里）再 render 一次。
        if(!silent) remapProgress(applied, mats.length);
      }
      // 9/23 诚实口径：只要有失败卡就不对齐版本号（换季横幅保留，映射确实没完成，可再点重试）；
      // 旧代码全失败也盖版本号 → 横幅消失但映射还是旧的（假成功，违反「AI 失败绝不落库」）。
      if(!failed.length) store.bankVersion = DATA.speakingVersion;
      saveStore();
      if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
      if(!silent){
        render();
        if(applied && !failed.length) toast('深挖完成：' + applied + ' 张素材卡已对齐当季题库');
        else if(applied) toast('深挖完成 ' + applied + ' 张；' + failed.length + ' 张失败（' + failed[0] + (failed.length > 1 ? ' 等' : '') + '）');
        else toast('深挖失败：' + failed.join('；'));
      }
      return { applied: applied, failed: failed };
    }catch(e){
      if(!silent){ render(); toast('深挖失败：' + e.message); }
      return { applied: 0, failed: [e && e.message] };
    }
  }

  /* 题名纠偏：AI 返回的 topic 落到题库真实题名。
     逐字相等优先；其次去空格/标点后的包含匹配（长度差 ≤3）；最后编辑距离 ≤1 兜底
     （AI 常在近似题名里插/漏一个字，如把「想要颁布的环保法律」写成「想颁布的环保法律」）。
     落不上返回 null（丢弃）。 */  function matchBankTitle(raw, titles){
    const norm = s => String(s || '').replace(/[\s《》「」『』·，,、()（）]/g, '');
    const n = norm(raw);
    if(!n) return null;
    const nT = titles.map(t => ({ t: t, n: norm(t) }));
    const exact = nT.find(x => x.n === n);
    if(exact) return exact.t;
    const cands = nT.filter(x => x.n !== n && (
      (x.n.indexOf(n) !== -1 && x.n.length - n.length <= 3) ||
      (n.indexOf(x.n) !== -1 && n.length - x.n.length <= 3) ||
      (Math.abs(x.n.length - n.length) <= 2 && lev1(x.n, n))
    ));
    if(cands.length){ cands.sort((a, b) => a.n.length - b.n.length); return cands[0].t; }
    return null;
  }
  /* 编辑距离 ≤1（短题名够用）：长度差≤1 时允许一次插入/删除/替换 */
  function lev1(a, b){
    if(Math.abs(a.length - b.length) > 1) return false;
    if(a.length === b.length){
      let diff = 0;
      for(let i = 0; i < a.length; i++){ if(a[i] !== b[i] && ++diff > 1) return false; }
      return true;
    }
    const L = a.length > b.length ? a : b, S = a.length > b.length ? b : a;
    let i = 0, j = 0, skipped = false;
    while(i < L.length && j < S.length){
      if(L[i] === S[j]){ i++; j++; continue; }
      if(skipped) return false;
      skipped = true; i++;
    }
    return true;
  }

  /* storyEn 中文污染自愈：问卷答案里的中文词（如「考研」）被 AI 原样搬进英文故事时，
     自动让 AI 重写为纯英文（生成流程内自动执行，无按钮无弹窗）。 */
  async function fixStoryEnglish(){
    const bad = (store.materials || []).filter(m => m && /[\u4e00-\u9fff]/.test(m.storyEn || ''));
    if(!bad.length) return;
    for(const m of bad){
      try{
        const content = await callRelay('material_fixen', [
          { role: 'system', content: '你是英语润色助手。给定段落是雅思口语背诵稿，其中夹杂了个别中文词。把所有中文词替换成简单英文表达（只用初中词汇，如 考研→the postgraduate exam，高考→the college entrance exam，雅思→IELTS，恋综→a dating reality show），其余内容一字不改，保持段落原样。只输出修改后的纯英文段落，不要任何解释。' },
          { role: 'user', content: m.storyEn }
        ], 0.2);
        const fixed = String(content || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
        if(fixed && !/[\u4e00-\u9fff]/.test(fixed)) m.storyEn = fixed;
      }catch(_){}
    }
    saveStore();
  }

  /* ---------- 结果页 ---------- */
  /* 换季重映射运行态（模块级）：映射期间整页可能因软导航/切 tab 重渲，
     把进度挂变量而不是按钮文字上，render 时按变量还原「⏳ 重新映射中…」。 */
  var remapBusy = false, remapDone = 0, remapTotal = 0;
  function remapProgress(done, total){
    remapDone = done; remapTotal = total;
    const btn = document.getElementById('matRemapBtn');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ 重新映射中… ' + done + '/' + total; }
  }
  function renderResults(root){
    let h = '';
    // 换季横幅：素材是在旧题库版本下生成的，题族映射可能已过时 → 一键重映射（复用 .mat-shortwarn 现有样式）
    if((store.materials || []).length && store.bankVersion && store.bankVersion !== DATA.speakingVersion){
      const busyBtn = remapBusy
        ? '<button class="btn btn-primary" id="matRemapBtn" disabled>⏳ 重新映射中… ' + remapDone + '/' + remapTotal + '</button>'
        : '<button class="btn btn-primary" id="matRemapBtn">一键重新映射题族</button>';
      h += '<div class="mat-shortwarn" id="matBankWarn"><b>口语题库已换季</b>：这些素材是在旧版题库下生成的，每张卡「能串哪些题」的对照可能过时。'
        + '点下面的按钮，AI 会按当季题库把各卡重新串一遍（每张卡几秒、共约 1 分钟，完成后横幅自动消失；需要已配置 AI Key）。'
        + '<div class="mat-shortwarn-actions">' + busyBtn + '</div></div>';
    }
    // 覆盖率矩阵 / 深挖 / 缺题追问整套已移除（用户定案：素材出来直接去口语页练，
    // 串题在练题时按需进行）。coverage 数据仍在生成时随卡产出，供口语页串题提示使用。
    // 人设卡
    if(store.persona){
      const p = store.persona;
      const tags = [].concat((p.values || []).map(v => '<span class="pp-tag">' + escapeHtml(v) + '</span>'), (p.traits || []).map(t => '<span class="pp-tag">' + escapeHtml(t) + '</span>'));
      h += '<div class="mat-persona"><h3>人设锚点</h3>'
        + '<div class="pp-line">' + (p.city ? escapeHtml(p.city) + ' · ' : '') + escapeHtml(p.identity || '（未提取）') + '</div>'
        + (tags.length ? '<div class="pp-tags">' + tags.join('') + '</div>' : '')
        + '</div>';
    }
    // 故事卡
    (Array.isArray(store.materials) ? store.materials : []).forEach((m, i) => {
      if(!m) return;
      const isEditing = (editing === i);
      h += '<div class="mat-mat' + (isEditing ? ' open' : '') + '" data-i="' + i + '">'
        + '<div class="mat-mat-head" data-toggle="' + i + '"><span class="mat-mat-title">' + escapeHtml(m.title || '未命名') + '</span>'
        + '<span class="mat-caret">▶</span></div>'
        + '<div class="mat-body">';
      if(isEditing){
        h += '<div class="mat-sub">标题</div><input class="mat-edit-input" data-edit-title="' + i + '" value="' + escapeHtml(m.title || '') + '">'
          + (m.storyEn != null ? '<div class="mat-sub">英文可背（连贯小故事）（若你录入的是纯英文，系统自动保留你的原文句式结构，不做改写）</div><textarea class="mat-edit-input mat-edit-area" data-edit-story="' + i + '" placeholder="英文小故事…">' + escapeHtml(m.storyEn) + '</textarea>' : '')
          + (m.logicZh != null ? '<div class="mat-sub">中文逻辑链</div><textarea class="mat-edit-input mat-edit-area" data-edit-logic="' + i + '" placeholder="中文逻辑…">' + escapeHtml(m.logicZh) + '</textarea>' : '')
          + '<div class="mat-edit-hint">保存后会<b>直接覆盖</b>这张素材，旧内容不再保留；骨架（最小背诵集）保存后自动从正文重新抽取。</div>'
          + '<div class="mat-mat-actions"><button class="mat-mini btn-save" data-save="' + i + '">保存</button><button class="mat-mini" data-cancel="' + i + '">取消</button></div>';
      } else {
        // design/68 万能句内嵌：新口径卡 goldenEn ⊆ storyEn → 正文按句加粗、无独立万能句框；
        // 旧数据卡（goldenEn 与正文互斥）保持旧样式，老卡不受影响。
        const golden68 = Array.isArray(m.goldenEn) ? m.goldenEn.map(g => String(g || '').trim()).filter(Boolean) : [];
        const story68 = String(m.storyEn || '');
        const normEn = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const storyNorm68 = normEn(story68);
        const embedded68 = golden68.filter(g => { const k = normEn(g); return k.length >= 8 && storyNorm68.indexOf(k.slice(0, 40)) !== -1; });
        const inline68 = story68 && embedded68.length >= 2;
        let storyHtml68 = '';
        if(story68){
          if(inline68){
            const sents = story68.match(/[^.!?]+[.!?]+[\"'\u201d\u2019)]*\s*|[^.!?]+$/g) || [story68];
            storyHtml68 = sents.map(s => {
              const hit = embedded68.some(g => normEn(g) === normEn(s));
              return hit ? '<b>' + escapeHtml(s.trim()) + '</b>' : escapeHtml(s);
            }).join(' ');
          } else {
            storyHtml68 = escapeHtml(story68);
          }
        }
        // design/86 骨架层：正文之前先展示最小骨架（5~7 句原句，优先背诵的最小集合）
        const spine86 = Array.isArray(m.spineEn) ? m.spineEn.filter(x => String(x || '').trim()) : [];
        if(story68 && spine86.length){
          h += '<div class="mat-sub">最小骨架 · 先背这些（' + spine86.length + ' 句）</div><div class="mat-spine">'
            + spine86.map((s, si) => '<div class="mat-spine-line"><span class="mat-spine-n">' + (si + 1) + '</span><span>' + escapeHtml(s) + '</span></div>').join('')
            + '</div>';
        }
        h += (story68 ? '<div class="mat-sub">完整故事 · 展开润色</div><div class="mat-story-en">' + storyHtml68 + '</div>' : '')
          + (!inline68 && golden68.length ? '<div class="mat-sub">万能句（任何题都能套，优先背）</div><div class="mat-story-en">' + golden68.map(g => '<b>' + escapeHtml(String(g)) + '</b>').join('<br>') + '</div>' : '')
          + (m.logicZh ? '<div class="mat-sub">中文逻辑链</div><div class="mat-logic">' + escapeHtml(m.logicZh) + '</div>' : '')
          + '<div class="mat-mat-actions"><button class="mat-mini' + (m.pinned ? ' mat-pin-on' : '') + '" data-pin="' + i + '">' + (m.pinned ? '已置顶最熟 · 取消' : '置顶为最熟') + '</button><button class="mat-mini" data-regen-all="1" title="重新生成：全部素材整库替换为最新生成的版本">重新生成</button><button class="mat-mini danger" data-del="' + i + '">删除</button><button class="mat-mini" data-edit="' + i + '">更改</button></div>';
      }
      h += '</div></div>';
    });
    // 行动
    h += '<div class="mat-actions"><a class="btn btn-primary" href="speaking.html">去练口语 →</a><button class="mat-add" id="matRegen">↻ 重新填写 / 生成</button></div>';
    root.innerHTML = h;

    // 换季重映射：deepDigCoverage 内部逐卡落库并更新 store.bankVersion，完成后重渲横幅自然消失。
    // remapBusy 防重复点击/软导航重渲后重复触发；进度显示走 remapProgress（不整页重渲）。
    const remapBtn = $('#matRemapBtn');
    if(remapBtn) remapBtn.onclick = async () => {
      if(remapBusy) return;
      remapBusy = true;
      try{
        remapProgress(0, (store.materials || []).filter(m => m && (m.coverage || []).length).length);
        await deepDigCoverage(false);
      } finally{ remapBusy = false; render(); }
    };

    root.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = () => { const card = el.closest('.mat-mat'); card.classList.toggle('open'); };
    });
    root.querySelectorAll('[data-regen-all]').forEach(b => {
      b.onclick = () => { generate(); };
    });
    // 「置顶为最熟」：标记 + 置顶排序——speaking 页 aiStoryLink 按此顺序取材（排最前的最熟）
    root.querySelectorAll('[data-pin]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.pin;
        const m = store.materials[i];
        if(!m) return;
        m.pinned = !m.pinned;
        if(m.pinned){
          // 置顶卡移到最前（保持相对顺序），数组顺序即素材优先级
          store.materials = store.materials.filter(x => x && x.pinned).concat(store.materials.filter(x => !x || !x.pinned));
        }
        saveStore();
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
        toast(m.pinned ? '已置顶为最熟素材（AI 串题时优先使用）' : '已取消置顶');
      };
    });
    // 删除卡：两步 armed 确认（design/86 §7.1，照 words.js 范式）——原生 confirm 弹窗体验差且会打断软导航
    root.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        if(b.dataset.armed === '1'){
          const i = +b.dataset.del;
          const m = store.materials[i];
          // 记录删除墓碑：即使云端/另一份仍残留该卡，合并时也会按 id 过滤掉，避免"删了又回来"
          if(m && m.id != null){ store.deletedIds = store.deletedIds || []; if(!store.deletedIds.includes(m.id)) store.deletedIds.push(m.id); }
          store.materials.splice(i, 1);
          saveStore();
          // 删除后立即上传云端，让墓碑随同步传播，避免旧卡从云端合并回来
          if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
          render();
          return;
        }
        b.dataset.armed = '1';
        b.textContent = '确认删除？';
        b.classList.add('armed-danger');
        setTimeout(() => {
          if(!b.isConnected) return;   // 定时器回调判空：期间重渲/离页则放弃还原
          delete b.dataset.armed;
          b.textContent = '删除';
          b.classList.remove('armed-danger');
        }, 3000);
      };
    });
    // 「更改」：进入编辑态
    root.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => { editing = +b.dataset.edit; render(); };
    });
    // 「取消」：丢弃改动，退出编辑态
    root.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => { editing = -1; render(); };
    });
    // 「保存」：把改后的内容直接覆盖原素材（不新增、不保留旧内容）
    root.querySelectorAll('[data-save]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.save;
        const m = store.materials[i];
        if(!m) return;
        const card = b.closest('.mat-mat');
        const titleEl = card.querySelector('[data-edit-title]');
        const storyEl = card.querySelector('[data-edit-story]');
        const logicEl = card.querySelector('[data-edit-logic]');
        // 直接原地覆盖原素材：id 不变，只更新内容；旧内容不再保留
        m.title = (titleEl ? titleEl.value.trim() : '') || m.title || '未命名';
        m.storyEn = storyEl ? storyEl.value : (m.storyEn || '');
        m.logicZh = logicEl ? logicEl.value : (m.logicZh || '');
        // design/86 5.3：正文被改写 → 骨架自动从新正文重新抽取（不信任旧 spineEn）
        m.spineEn = computeSpine(m.storyEn, null);
        m.updatedAt = Date.now();
        editing = -1;
        saveStore();
        if(DATA.settings.autoSync && DATA.settings.syncCode && typeof cloudUpload === 'function') cloudUpload(true);
        render();
        toast('已保存（覆盖原素材）');
      };
    });
    $('#matRegen').onclick = () => { mode = 'q'; shortWarned = false; render(); };
  }

  /* ---------- 初始化 ---------- */
  // materials.html：页面加载即渲染
  ready(() => {
    if(store.materials.length) mode = 'result'; else mode = 'q';
    render();
  });
  // 口语页 MAT tab：挂 window.matGen（tab 点击时 init 从 DATA.materials 重载并渲染）
  // 并注册「云同步合并后无缝重渲染」，与旧内嵌版行为对齐
  // deepDig 供程序化调用（深挖已并入生成流程，无手动按钮）
  window.matGen = { init: init, render: render, deepDig: function(){ return deepDigCoverage(false); } };
  try{
    window.__hubRenderers = window.__hubRenderers || [];
    if(!window.__hubRenderers.includes(init)) window.__hubRenderers.push(init);
  }catch(_){}
})();
