/* === 万能口语素材生成器（design/86：题库对症的动态漏斗问卷 + 故事骨架层 + 现成英文素材复用） ===
   输入：人设 A → AI 分析当季 P2 题库生成 10~14 张漏斗式动态问题卡（可跳过）→ 现成英文素材/自由经历
   处理：DeepSeek 整合为连贯故事卡（含 spineEn 最小骨架），逐卡对照当季题库产出 coverage
   输出：人设锚点卡 + 素材卡（骨架/完整故事/万能句/中文逻辑，可编辑/重生成/删除）
   红线：不动 mock 系列 / speaking 系列 / data.js / callRelay；纯前端 + 现有 DeepSeek relay。
   🚨 10/4 13:43 P0（她报「出的题跟题库无关、跟上个赛季我自己弄的素材库相关、问的根本不是题目」）：
       ① 旧答案 prefill 已整段删除 → 新卡一律从零出（旧答案全量进 _legacy，页面有常驻入口可查）
       ② SYS_PLAN 加「title 必须是能直接开口的疑问句」硬规则 + 前端 ensureQuestionTitle 兜底
       ③ 卡片数 4~8 → 10~14（覆盖 55 道 P2 要够密）
       ④ P1 只给人设卡用，出题纯 P2 —— getBankP2List 保持只筛 P2，这是她的原话口径 */
(function(){
  const STORE_KEY = 'ielts_materials_v1';
  /* 🚨 10/4 14:45 P0 第二次：出题算法改版后，**旧 plan 会一直赖着不走**。
     原判断只有 `plan.bankVersion !== DATA.speakingVersion`（换季才提示）—— 但 14:00 这次改的是
     **出题算法**（删旧答案 prefill / 卡片数 4~8→10~14 / title 必须是问句），题库版本没变（都 v15），
     于是 `store.plan` 里那 8 张旧卡永远被当成有效结果渲染，她点了新按钮也一样看到旧内容
     （截图实证：标题「和同桌男友从认识到一起」、正文「同桌变成男友」全是上赛季素材）。
     修法：plan 里写 **独立的算法版本号 PLAN_ALGO**，与题库版本**独立判断**——
     algo 变了就弹强制重出提示，且旧 plan 直接判定为不可用。 */
  const PLAN_ALGO = 2;   // 1 = 旧算法（含 prefill 污染）；2 = 14:45 修复后的算法
  const CANON = ['喜欢的城市','水边的地方','难忘的旅行','常在一起的人','户外活动','你拍的照片','让你放松的事','家人','朋友','敬佩的人','帮助者','让我骄傲的人','学会的技能','克服的困难','目标','压力','习惯改变','搬家','电子设备','工具','礼物','离不开的东西','爱好','视频','网上学的','改观的事','喜欢的节目','书','电影','歌','诗','故事','网站','衣服','贵的东西','珍藏','法律','规则','传统','习俗','改变','分歧','犯错','投诉','道歉','尴尬','挑战'];

  /* ===== 平台自带万用人设（10/2 她拍板：想不出自己的人设就用这些）=====
     设计口径：全部写成「任何 P1/P2/P3 题都能往上套」的通用底子，不含任何真实个人信息。
     每条的 text 内含三个角度（性格 / 成长背景 / 身份标签）——正是 P1 答题骨架 DPF 里的 P 环要用的三样，
     考生点一下填进人设卡后，AI 辅助取素材时能直接拆出这三样来铺回答。
     她后续会喂一批好用的万用人设 —— 往这个数组里加一条即可，UI 与按钮零改动。 */
  const PERSONA_PRESETS = [
    { name:'大学生', text:'在校大学生，城市里读书，成绩中等偏上。性格偏慢热但熟人面前话很多，属于好奇、愿意尝试新事的类型。成长中家里给的空间比较大，习惯自己安排时间。身份是一个普通在校大学生。', fit:'校园日常、朋友、学习安排、便宜好用的东西、年轻人爱好' },
    { name:'考研/留学党', text:'正在集中备考的学生，每天大部分时间在自习室和图书馆。性格安静、自律，靠反复练习积累信心，不太擅长主动跟陌生人搭话。成长中习惯了靠成绩衡量自己，家里也支持但期望较高。身份是一个备考中的学生。', fit:'学习习惯、时间安排、压力、独自坚持、图书馆与住处' },
    { name:'刚工作的年轻人', text:'毕业没几年，在一线城市上班，做需要天天跟人打交道的工作。性格随和但有点社恐，熟起来话很多。成长中从老家到城市独立生活，所以很在意归属感。身份是一个刚工作不久的年轻人。', fit:'通勤、工作与同事、租房、朋友聚会、周末怎么过' },
    { name:'独居自由职业', text:'一个人住，做自由职业/远程工作。性格安静独立，时间自由但作息不规律，习惯一个人吃饭和散步。成长中养成了一个人也能把日子过好的能力，最近在学做饭。身份是一个独居的自由职业者。', fit:'在家做饭、独处习惯、自由与不自律、城市生活、社区与宠物' },
    { name:'爱旅行的人', text:'喜欢旅行，每年至少出门两三次。性格开朗爱分享，习惯提前做攻略、住青旅民宿。成长中家里常带出去玩，对不同地方的人情最有兴趣。身份是一个把旅行当习惯的人。', fit:'景点、拍照、路上遇到的人、当地食物、行程与预算' },
    { name:'爱运动的年轻人', text:'保持规律运动，每周会跑两三次步或者去健身房。性格有毅力、喜欢挑战自己，朋友不多但一起运动的关系都很铁。成长中因为体测不达标开始跑步，久了变成习惯。身份是一个坚持运动的人。', fit:'运动习惯、健身房与跑鞋、比赛、结伴运动、身心状态' },
    { name:'爱看剧/看书的人', text:'下班后主要在家看剧、看书，最近迷上一部剧。性格细腻、观点不算极端但愿意讲清楚理由，习惯边看边在社交平台写短评。成长中受母亲影响养成了阅读习惯。身份是一个内容爱好者。', fit:'追剧、书与电影、网上看到的内容、推荐给朋友、独处夜晚' },
    { name:'养宠物的人', text:'养了一只猫（狗），每天固定时间照顾它。性格耐心、喜欢安静，比较在意家里的整洁。成长中一个人住久了觉得需要伴，最近几年一直在养。身份是一个宠物主人。', fit:'养宠、花钱、照顾、出行安排、邻里与独处' }
  ];

  /* 已降级（design/86）：静态问卷仅作离线兜底参考，正常问卷由 SYS_PLAN 按当季题库动态生成；
     正常路径不再渲染 QUESTIONS。deepDigCoverage 仍读旧字符串答案作辅助上下文（兼容老数据）。 */
  const QUESTIONS = [
    /* 10/2 她拍板：标题只写「人设卡」，不要「一句话介绍你自己」这种一句话介绍式标题；
       也不要在 hint 里举例子（原 hint 带「例：杭州，大三计算机…」被她明确否掉），
       举例职责交给下面的 mat-persona-note 说明段。 */
    { id:'A',  group:'persona', required:true,  title:'人设卡', hint:'城市、身份（学生/专业或工作）、性格、一个爱好。',
      ph:'一句话说清你是谁、在哪、性格怎样、有什么爱好' },
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

  /* design/89 SYS_PLAN：动态问卷规划——真题锚定 + 独白答题 + 追问可选（design/86 漏斗版改版）。
     换季后题库清单变化，问卷必须重新生成；严禁拿本常量当「写死的问卷」。
     anchor 的 promptEn/req 由前端从题库取真值回填（AI 只出逐字 topic，防编造原题）。 */
  const SYS_PLAN = '你是雅思口语素材规划师。考生会给你【当季真实 P2 题库全量清单】（网站当季真实考题；换季后清单会变化，你的问卷必须只针对当前清单）。考生基础弱、记忆提取困难：面对抽象问题想不起具体事情。你的任务：在考生动笔前，先分析题库，设计一份「真题锚定、问题最少、以独白作答」的经历问卷。\n'
    + '\n'
    + '⚠️ **这是纯 P2 任务**：清单里全是 P2 题，一道 P1 题都没有。不要提 P1、不要按 P1 的话题结构组织问题。\n'
    + '工作方法：\n'
    + '1. 逐题通读清单，把「能被同一段真实生活经历辐射覆盖」的题目归为一组——判断标准：考场上把这段经历原样讲出来、再加一两句过渡就能引到该题。人物/地点/物品/事件/见闻感受五类元素齐全的一段日常经历是万能辐射源（例：一次和朋友的短途旅行，可同时辐射人物、地点、事件、照片、拥挤的地方、特别场合的食物、天气、一次散步、环保观点等）。\n'
    + '2. 每张问题卡必须锚定当季真题：从清单里挑 1~2 道题绑定本卡（能被同一段经历覆盖的两道题合并绑一卡），放进 anchor 数组，topic 逐字取自清单题名。答题即练题：考生答完这张卡，锚定真题的素材就备好了。\n'
    + '3. 卡片数量：**10~14 张**（这是硬要求，不是建议）。题少就说明没吃透题库。判断标准：把清单逐题过一遍，每道题都问自己「这段经历能不能自然引到它」——能归到某张卡就算这张卡覆盖了，**宁可多切几张薄卡，也不要几张大卡漏掉半份题库**。每张卡宁可只锚 1 道题。目标覆盖率（被 topics 覆盖的题 / 清单总题数）≥0.9；达不到就靠多切几张卡、增强卡片元素覆盖，绝不是减少卡片数。\n'
    + '4. 每张卡对应一个具体、单一的经历主题，必须是学生或刚工作的年轻人真实生活里一定有的素材（如：最近一次和朋友出门 / 一件硬学会的事 / 每天离不开的东西 / 最近在网上刷到的内容 / 一个有画面的地方 / 由经历引出的一个观点）。严禁抽象主题、需要编造或需要专业背景的主题。\n'
    + '5. 🔴 **title 必须是一个可以直接开口回答的疑问句，不是主题标签**。这是硬要求：\n'
    + '   ✗ 错（主题标签，学员看着不知道要说什么）：「和同桌男友一起学语言、一起玩的经历」「边做项目边自学网页设计」「一个对穿搭有自己坚持的人」\n'
    + '   ✓ 对（能直接开口问的问题）：「你有没有过一个关系特别好的同桌？后来变成男女朋友了吗？」「你学过什么技能是硬啃下来的？最难的是哪一段？」\n'
    + '   自检：把 title 念给一个没读过卡片内容的人听，他应该能**不猜**就开始讲。带「的经历」「的人」「的一段」结尾的一律不合格，必须改写成疑问句或明显的口语提问。\n'
    + '6. 答题形态=独白为主：每张卡只给一个大独白框（type:"mono"），考生用中文口语把这段经历完整讲一遍（什么时候、和谁、发生了什么、细节、感受），越具体越好。严禁把大独白拆成一串小问题当主体、严禁连环追问式提问。\n'
    + '7. 每张卡另附 2~3 个可选「追问题」（followups，沿用小问 schema），全部 "optional":true，只给答得短或想被引导的考生展开用：\n'
    + '   ① 只用 text 或 choice 类型，严禁 yesno 门问题、严禁存在性问题；\n'
    + '   ② 每问只提取一个事实（时间 / 人物地点 / 细节 / 感受），严禁连环问；严禁「说说 / 讲讲 / 描述 / 谈谈 / 你觉得」这类自由开放措辞；\n'
    + '   ③ choice 必须给 2~6 个具体、口语化的选项，并以「其他」为固定末项（选中后允许考生自填）；multi 题用 "multi":true；\n'
    + '   ④ 细节、感受类 followup 也一律 "optional":true（全部选填）。\n'
    + '8. 每张卡给 topics（该卡预期覆盖的题，逐字取自清单，宁多勿漏，拿不准也列上）和 reason（一句中文，说明为什么问这段、能覆盖什么类别；**不要在 reason 里写具体题名**）。\n'
    + '9. 若考生提供了人设，主题与选项要贴合其身份：学生围绕学校/考试/同学/宿舍，工作者围绕职场/通勤/同事。\n'
    + '\n'
    + '输出严格 JSON，不要任何解释文字：\n'
    + '{"cards":[{"id":"q1","type":"mono","title":"能直接开口回答的疑问句","anchor":[{"topic":"逐字题名1"},{"topic":"逐字题名2"}],"reason":"一句中文说明","topics":["逐字题名1","逐字题名2"],"followups":[{"k":"when","type":"text","optional":true,"label":"单一事实小问","ph":"填写示例"},{"k":"pick","type":"choice","optional":true,"multi":true,"label":"挑你记得的","options":["具体选项1","具体选项2","其他"]}]}]}';

  /* === 当季 P2 题库动态提取（P0：替代写死的 CANON 旧季快照）===
     每次生成/追问都以 DATA.speaking 真实题库为准（换季后自动跟随）；
     题库缺失时才回退 CANON 静态表（离线/异常兜底）。 */
  function getBankP2List(){
    const arr = (DATA.speaking || []).filter(s => s && s.type === 'P2');
    if(!arr.length) return null;
    return arr.map(s => ({
      title: s.titleZh || s.titleEn || '',
      promptEn: s.promptEn || '',
      req: (s.youShouldSay || []).slice(0, 3).join('；'),
      reqArr: (s.youShouldSay || []).slice(0, 3)
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
    mode = restoreMode();
    render();
  }

  /* 视图态恢复：问卷填到一半被整页刷新（SW 更新/手动刷新）打回列表 = 她反馈的打断之一。
     问卷态记入 sessionStorage；有 plan 时刷新后自动回到问卷（答案都在 DATA.materials.answers，零丢失）。 */
  function restoreMode(){
    let saved = null;
    try{ saved = sessionStorage.getItem('hub_mat_mode'); }catch(e){}
    if(saved === 'q' && store.plan && Array.isArray(store.plan.cards) && store.plan.cards.length) return 'q';
    return store.materials.length ? 'result' : 'q';
  }

  /* ---------- 渲染分发 ---------- */
  function render(){
    const root = rootEl(); if(!root) return;
    try{ sessionStorage.setItem('hub_mat_mode', mode); }catch(e){}
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
    const bankLive = !!(DATA.speaking && DATA.speaking.length);
    /* 🚨 14:45：旧算法出的 plan 一律判定不可用（与题库版本**独立**判断）。
       14:00 改的是出题算法不是题库 → bankVersion 判断永远为 false → 旧 plan 一直赖着，
       她的截图里「和同桌男友」那张卡就是这么来的。 */
    const _hasPlan = !!(plan && Array.isArray(plan.cards) && plan.cards.length);
    const planAlgo = plan ? (plan.algo || 1) : 0;
    const algoStale = _hasPlan && planAlgo !== PLAN_ALGO;
    const hasPlan = _hasPlan && !algoStale;
    /* 10/4 02:00 题库页 A 版（她 01:10 授权自选，选 A=分区清晰改动最小）
       ① 顶部「mat-intro 绿条」+「mat-why 浅绿块」上下贴着像重复说话 → 合并成一段：
          intro 一行说明 + 「为什么要先填人设？」折叠（点开才展开那 8 行）
       ② 已有素材入口（原 matBackToResult 在下面）提到最顶（她拍板「顶部常驻」） */
    let h = '<div class="mat-intro">先填一次<b>人设</b>，点下面的按钮，AI 会读一遍<b>当季最新题库</b>，'
      + '自动出<b>十几道最能概括题库的问题</b>；你每题用中文口语把那段经历讲一遍就行，'
      + '最后 AI 会把答案合成<b>几个能串住整份题库的故事</b>。'
      + '<button type="button" class="mat-why-link" id="matWhyToggle" aria-expanded="false" aria-controls="matWhyBody">为什么要先填人设？</button></div>';
    // ② 已有素材卡入口：提到页面最顶（她 00:57 拍板「顶部常驻」）
    if(store.materials && store.materials.length){
      h += '<div style="margin:-2px 0 10px"><a href="javascript:void(0)" id="matBackToResult" style="color:var(--primary);font-weight:600;font-size:13px">← 查看已有素材卡（' + store.materials.length + ' 张）</a></div>';
    }
    // 「为什么要先填人设」折叠体（原 mat-why 整块内容，收进来）
    h += '<div class="mat-why-fold" id="matWhyBody" hidden><div class="mat-why-l">人设卡是<b>专门用来串题的</b>——它决定后面出的问题贴不贴你、生成的素材像不像你自己。'
      + '填的时候尽量写一份<b>万用人设</b>：城市 + 身份 + 性格 + 一个爱好，P1 / P2 / P3 都能往上套的那种。<br>'
      + '接下来你只要<b>按顺序把十几张卡逐个讲一遍</b>，AI 会把答案合成几个故事——'
      + '这些故事考场上加一两句过渡就能接到很多道真题上，<b>不用准备十篇范文</b>。你不需要知道哪道题对应哪张卡，照着问题讲就行。</div></div>';
    /* 🚨 14:45 P0：出题算法改版（旧 plan 含 prefill 污染）→ 顶部强制重出提示。
       与换季提示**并存但优先级更高**：换季只是题库变了，这个是「算法变了」，旧卡一律作废。 */
    if(algoStale){
      h += '<div class="mat-shortwarn mat-algo-stale"><b>这批问题是旧版算法出的</b>（会照着你以前填过的内容问，已经不准了）。'
        + '<div class="mat-shortwarn-actions"><button class="btn btn-primary" id="matReplanBtn">按当前题库重新出题</button>'
        + '<span class="mat-shortwarn-tip">你以前填的内容不会丢，会收进下面的「我以前填过什么」里</span></div></div>';
    }
    // 换季横幅（4.5）：plan 是按旧题库出的 → 提示手动重新出题（不自动重规划，避免打断填写）
    if(hasPlan && bankLive && plan.bankVersion !== (DATA.speakingVersion || 0)){
      h += '<div class="mat-shortwarn" id="matPlanStale"><b>口语题库已换季</b>，当前问题是按旧题库出的。<div class="mat-shortwarn-actions"><button class="btn btn-primary" id="matReplanBtn">按新题库重新出题</button><span class="mat-shortwarn-tip">会尽量把你已填的答案迁到新问题里</span></div></div>';
    }
    // 离线/题库缺失警示（4.4.3）
    if(hasPlan && plan.isFallback){
      h += '<div class="mat-shortwarn">当前离线或题库缺失，下面的问题基于通用题类生成、不保证是当季题；联网后点「重新分析题库出题」获取对症问题。</div>';
    }
    // 人设卡 A（固定）—— 三步之一
    // 🚨 10/4 13:43 她拍板：人设卡是**专门为 P1 准备的**（P2 能串则串，但主要串 P1）→ 卡上明写。
    h += '<div class="mat-sec-title"><span class="mat-step-n">1</span>人设卡 <span class="tag">必答</span>'
      + '<span class="mat-sec-note" style="font-weight:400;font-size:12.5px;color:var(--text-2,#6b7280);margin-left:8px">主要用来串 P1</span></div>';
    h += qCard('A');
    // 平台自带万用人设：想不出自己的就点一条填进去，之后还能接着改
    h += '<div class="mat-presets"><div class="mat-presets-t">想不出来？用平台自带的万用人设，点一下就填进去（填完可以继续改成你自己的）</div>'
      + '<div class="mat-presets-row">'
      + PERSONA_PRESETS.map((p, i) => '<button class="mat-mini" type="button" data-preset="' + i + '"' + (p.fit ? ' title="能撑的题：' + escapeHtml(p.fit) + '"' : '') + '>' + escapeHtml(p.name) + '</button>').join('')
      + '</div></div>';
    // 10/1 UI polish：hasPlan 时按钮降为次级（主操作是下方「生成我的专属素材」）
    h += '<div class="mat-actions"><button class="btn ' + (hasPlan ? 'btn-ghost' : 'btn-primary btn-lg') + '" id="matPlanGen">' + (hasPlan ? '↻ 重新分析题库出题' : '生成我的专属问题') + '</button></div>';

    if(hasPlan){
      h += '<div class="mat-sec-title">你的专属经历问题 <span class="tag">' + plan.cards.length + ' 卡 · 按当季题库定制</span></div>';
      plan.cards.forEach(c => { h += planCard(c); });
    } else if(freeMode){
      /* 4.7.1 兜底：规划失败/无 Key 时的自由填写模式（不依赖 plan 也能生成）。
         ⚠️ 14/45：**必须排在 algoStale 前面** —— 出题失败后 plan 仍是 stale 的，
         若 stale 分支在前，freeMode 这段永远执行不到（我第一版就踩了）。 */
      h += '<div class="mat-sec-title">自由填写经历 <span class="tag">至少 1 段</span></div>';
    } else if(algoStale){
      /* 14/45：旧算法的 plan 一律不渲染。**但先把它的答案搬进留底** ——
         否则她点「重新出题」时 answers.cards 被清空，这些内容就真没了（违反「严禁静默丢弃」）。 */
      harvestLegacyFromStalePlan(plan);
      saveStore();
      h += '<div class="mat-empty-tip">下面是按<b>当前题库</b>重新出的问题。点上面的「按当前题库重新出题」生成。</div>';
    }
    // 现成英文素材区块（design/86 改动三）
    h += '<div class="mat-sec-title"><span class="mat-step-n">2</span>复用我背过的英文素材 <span class="tag">选填</span></div>';
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

    // 旧答案留底区（她 13:46：「之前填过的 8 张旧卡不能完全删掉，点一下能显示之前填过的一些内容」）
    //  → 提成**常驻可点入口**（原先只在有内容时渲染一个 <details>，换季后新卡一填就找不到旧内容了）
    const legacy = store.answers._legacy || {};
    const legacyKeys = Object.keys(legacy).filter(k => String(legacy[k] || '').trim());
    h += '<div class="mat-legacybar"><button type="button" class="mat-legacybar-btn" id="matLegacyToggle" aria-expanded="false" aria-controls="matLegacyBody">'
      + '我以前填过什么（' + legacyKeys.length + ' 条）<span class="mat-legacybar-caret">▸</span></button></div>';
    if(legacyKeys.length){
      h += '<div class="mat-legacy" id="matLegacyBody" hidden><div class="mat-legacy-tip">这些是你之前填过的内容，<b>仅供参考、不会自动套进新问题</b>。想到哪段可以用，就复制到下面的框里。</div>';
      legacyKeys.forEach(k => {
        h += '<div class="mat-legacy-item"><div class="mat-legacy-key">' + escapeHtml(k) + '</div>'
          + '<div class="mat-legacy-text">' + escapeHtml(String(legacy[k])) + '</div>'
          + '<button class="mat-mini" data-copy-legacy="' + escapeHtml(k) + '">复制</button></div>';
      });
      h += '</div>';
    }

    h += '<div class="mat-sec-title"><span class="mat-step-n">3</span>生成</div>';
    h += '<div class="mat-actions"><button class="btn btn-primary btn-lg" id="matGen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:-2px;margin-right:5px" aria-hidden="true"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2 0-2.8s-2-.8-3 0z"/><path d="M9 11l4 4"/><path d="M13 7l4 4 3-3a2 2 0 0 0-3-3l-4 2z"/><path d="M14 4l6 6"/></svg>生成我的专属素材</button></div>';
    root.innerHTML = h;

    /* ===== 10/4 15:30 她拍板新增：导入我已有的素材 → AI 整理成万能素材 =====
       场景（她原话）：「我自己可能也有一套已经准备好了的素材，就不需要这个平台给我生成素材了」。
       **独立入口，旁跳过人设与问卷** —— 不答题、不填人设，直接粘贴 → AI 整理。
       输入是中英混杂的零散文字（她积累的句子/段落/笔记/范文都行）；
       输出与「生成我的专属素材」完全同构（2~4 个故事卡 + coverage + spineEn + goldenEn），
       复用同一套 SYS_MAT 规则与 normalizeMaterial / collectBatch / mergeBatch 链路，零新规则。 */
    h += '<div class="mat-import">'
      + '<button class="btn btn-ghost btn-block" type="button" id="matImportToggle" aria-expanded="false" aria-controls="matImportBody">'
        + '我已经有素材了，直接导入整理</button>'
      + '<div class="mat-import-body" id="matImportBody" hidden>'
        + '<div class="mat-q-hint">把你以前积累的<b>任何文字</b>粘进来——中文经历、零散笔记、写过的英文句子或段落，<b>中英混着也行</b>。'
          + 'AI 会合并去重、归类成几个能反复用的故事，并算出每段能串当季题库的哪些题。'
          + '<b>不需要填人设、不需要答题。</b></div>'
        + '<textarea id="matImportText" rows="9" placeholder="把你已有的素材粘在这里，一段一段分开写就行（空两行分段更清楚）…"></textarea>'
        + '<div class="mat-char" id="matImportChar"></div>'
        + '<div class="mat-actions"><button class="btn btn-primary" id="matImportGo" disabled>AI 整理成万能素材</button></div>'
        + '<div class="mat-import-tip">AI 只会重新组织、合并、补过渡，<b>不会编造你没写过的经历</b>。纯英文段落按原样保留、一字不改。</div>'
      + '</div></div>';
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
    // 10/2 平台自带万用人设：点一下把该 preset 填进人设卡输入框（不自动 submit，让她看清再改）
    root.querySelectorAll('[data-preset]').forEach(b => {
      b.onclick = () => {
        const p = PERSONA_PRESETS[Number(b.dataset.preset)];
        if (!p) return;
        store.answers.A = p.text;
        saveStore();
        render();
        const ta = document.querySelector('[data-q="A"]');
        if (ta) { ta.focus(); if (ta.scrollIntoView) ta.scrollIntoView({ block:'center' }); }
        toast('已填入「' + p.name + '」人设，可以直接改成你自己的');
      };
    });
    root.querySelectorAll('[data-step-card]').forEach(ta => {
      ta.addEventListener('input', () => {
        const cid = ta.dataset.stepCard, k = ta.dataset.stepK;
        // mono 独白：自增高 + 字数提示
        if(ta.tagName === 'TEXTAREA'){
          ta.style.height = 'auto';
          ta.style.height = (ta.scrollHeight + 2) + 'px';
          if(k === 'mono'){
            const mc = document.querySelector('[data-monochar="' + cid + '"]');
            if(mc) mc.textContent = monoCounterTip(ta.value);
          }
        }
        // multi 卡「其他」自填：文本并入数组（已勾选项保留，严禁整键覆盖）；单选/text 直接存字符串
        let ps = null;
        const pc = (store.plan && Array.isArray(store.plan.cards)) ? store.plan.cards.find(c => c && c.id === cid) : null;
        if(pc && Array.isArray(pc.steps)) ps = pc.steps.find(st => st && st.k === k) || null;
        if(pc && pc.type === 'mono' && Array.isArray(pc.followups)) ps = pc.followups.find(st => st && st.k === k) || null;
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
    // mono 独白初始自增高（恢复已填内容时不被 rows=5 截断）
    root.querySelectorAll('textarea[data-step-card][data-step-k="mono"]').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight + 2) + 'px';
    });
    const backLink = $('#matBackToResult');
    if(backLink) backLink.onclick = () => { mode = 'result'; render(); };
    /* 10/4 02:00 A 版：「为什么要先填人设？」折叠开关（原 8 行常驻 → 点开才展开） */
    const whyT = $('#matWhyToggle'), whyB = $('#matWhyBody');
    if(whyT && whyB){
      whyT.onclick = () => {
        const open = whyB.hidden;
        whyB.hidden = !open;
        whyT.setAttribute('aria-expanded', open ? 'true' : 'false');
        whyT.classList.toggle('on', open);
      };
    }
    // 规划 / 重新规划
    const pg = $('#matPlanGen');
    if(pg) pg.onclick = () => doPlan(!!(store.plan && Array.isArray(store.plan.cards) && store.plan.cards.length));
    const rp = $('#matReplanBtn');
    if(rp) rp.onclick = () => doPlan(true);
    /* 10/4 13:46 她拍板：旧卡内容不能删，要有入口能翻出来看（原先是 <details> 原生折叠，
       换季后新卡一填就找不到在哪 → 改成常驻按钮 + 显式 hidden 切换）。 */
    const lgT = $('#matLegacyToggle'), lgB = $('#matLegacyBody');
    if(lgT){
      lgT.onclick = () => {
        if(!lgB) return;
        const open = lgB.hidden;
        lgB.hidden = !open;
        lgT.setAttribute('aria-expanded', open ? 'true' : 'false');
        const car = lgT.querySelector('.mat-legacybar-caret');
        if(car) car.textContent = open ? '▾' : '▸';
      };
    }
    // 旧答案复制
    root.querySelectorAll('[data-copy-legacy]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.copyLegacy;
        const txt = String((store.answers._legacy || {})[k] || '');
        copyText(txt, () => { b.textContent = '已复制'; setTimeout(() => { b.textContent = '复制'; }, 1500); });
      };
    });
    $('#matGen').onclick = generate;
    bindImport(root);
  }

  /* ================================================================
     10/4 15:30 新功能：导入我已有的素材 → AI 整理成万能素材
     —— 场景：她自己有一套准备好的素材，不需要平台再生成一遍。
     —— 独立入口，**旁跳过人设与问卷**：不答题、不填人设，粘贴 → AI 整理。
     —— 输出与「生成我的专属素材」同构，直接进 store.materials，走既有素材卡渲染
        （可编辑 / 重生成 / 删除 / 详情看 coverage），零新渲染逻辑。
     设计要点：复用 SYS_MAT 全部规则（合并去重 / 覆盖宁多勿漏 / 纯英文原样保护 /
     spineEn / goldenEn / 130~180 词硬顶）—— 导入素材与答题素材**本质是同一件事**，
     只是输入来源不同，所以不另立 prompt，只换一个 user 包装。 */
  let importBusy = false;
  function splitImportedText(txt){
    // 空两行分段；单段内也允许用「1. / 2. / · 」这类序号行再切一刀，兼容她整坨粘贴
    return String(txt || '').split(/\n\s*\n+/)
      .map(s => s.trim()).filter(Boolean)
      .map(seg => seg.length > 400
        ? seg.split(/\n(?=\s*(?:\d+[.、)]|[-·*])\s)/).map(x => x.trim()).filter(Boolean)
        : [seg])
      .reduce((a, b) => a.concat(b), []);
  }
  function bindImport(root){
    const tg = $('#matImportToggle'), body = $('#matImportBody');
    const ta = $('#matImportText'), go = $('#matImportGo'), cnt = $('#matImportChar');
    if(!tg || !body || !ta) return;
    // 面板状态存 store（换 tab / 重渲染后保持展开，不丢她已粘的内容）
    tg.onclick = () => {
      const open = body.hidden;
      body.hidden = !open;
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      store.answers.importOpen = open;
      saveStore();
      if(open) setTimeout(() => ta.focus(), 60);
    };
    if(store.answers.importOpen){ body.hidden = false; tg.setAttribute('aria-expanded', 'true'); }
    // 文本持久化（只存文本，不进 DATA.materials.plan，跨设备同步照旧走 answers）
    const paint = () => {
      const n = String(ta.value || '').trim().length;
      if(cnt) cnt.textContent = n ? ('已粘 ' + n + ' 字 · 识别为 ' + splitImportedText(ta.value).length + ' 段') : '';
      if(go) go.disabled = n < 10;
    };
    ta.value = store.answers.importText || '';
    ta.addEventListener('input', () => { store.answers.importText = ta.value; saveStore(); paint(); });
    paint();
    if(go) go.onclick = () => doImport(ta.value);
  }

  async function doImport(txt){
    if(importBusy) return;
    const segs = splitImportedText(txt);
    if(!segs.length){ toast('先粘点素材进来'); return; }
    importBusy = true;
    const go = $('#matImportGo');
    const old = go ? go.textContent : '';
    if(go){ go.disabled = true; go.textContent = 'AI 正在整理…'; }
    try{
      // 每段包成 {title, raw} 交给同一条链路；title 用「导入第 N 段」，
      // 让 AI 在 logicZh / coverage 的说明里有可读的来源标识。
      const exps = segs.map((s, i) => ({ id: 'IM' + i, title: '导入第 ' + (i + 1) + ' 段', raw: s }));
      const res = await genMaterialsBatch(exps, ans('A'), true);   // 人设可选（她可能没填）；true = 导入整理模式
      const stories = (res.stories || []).map((s, i) => { const m = normalizeMaterial(s, i); delete m._goldenDropped; return m; })
                      .filter(m => m && String(m.storyEn || '').trim());
      if(!stories.length) throw new Error('AI 没有整理出可用的素材（导入的文字可能太短，试试多粘几段）');
      store.materials = stories;      // 直接替换 = 她的既有素材就是唯一真源，避免新旧混着看不清
      saveStore();
      mode = 'result';
      render();
      toast('已按你的素材整理出 ' + stories.length + ' 个故事，每段都算了能串哪些题');
    }catch(e){
      console.error('[materials] 导入整理失败', e);
      toast('整理失败：' + e.message);
      if(go){ go.disabled = false; go.textContent = old || 'AI 整理成万能素材'; }
    }finally{
      importBusy = false;
    }
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

  /* 人设卡 A / 自由经历 extraMore 的 textarea 卡（QUESTIONS 静态表兜底沿用）
     10/2：placeholder 优先用 q.ph（人设卡专用引导句），没有才退回标题。 */
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
      + '<textarea data-q="' + id + '" placeholder="' + escapeHtml(q && q.ph ? q.ph : (q ? q.title : '真实经历…')) + '">' + escapeHtml(val) + '</textarea>'
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

  /* 动态卡渲染（4.4.4；design/89：mono 独白卡与旧 steps 卡双型分发，存量旧卡一行不动） */
  function planCard(card){
    if(card && card.type === 'mono') return planMonoCard(card);
    const st = cardState(card.id);
    if(st.skipped){
      return '<div class="mat-q mat-plan-skipped" data-unskip-card="' + escapeHtml(card.id) + '" title="点此恢复">已跳过：' + escapeHtml(ensureQuestionTitle(card.title || '')) + ' · 点此恢复</div>';
    }
    let h = '<div class="mat-q mat-plan-card">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(ensureQuestionTitle(card.title || '')) + '</span>'
      + '<button class="mat-mini" data-skip-card="' + escapeHtml(card.id) + '">跳过此卡</button></div>';
    if(card.reason) h += '<div class="mat-q-hint">' + escapeHtml(card.reason) + '</div>';
    // 10/2 她拍板删掉「这张卡覆盖 N 道当季题」折叠区：填卡阶段只管讲经历，覆盖题数是出素材后
    // 在口语页才用得上的信息，在这里show 出来只让人分心。card.topics 数据仍保留（formatCard
    // 生成素材时照样喂给 AI，coverage 矩阵照旧），此处纯 UI 层删除。
    // 门逻辑（她 9/23 反馈：答了「没有出去玩」还继续问「去了哪里」不通顺）：yesno 答「没有」→ 本卡后续步骤全部收起，
    // 改回「有」即恢复（setStepVal 会重渲）。答案侧无需清理——空值在 formatCard 里本来就不进素材。
    let gateClosed = false;
    (card.steps || []).forEach(step => {
      if(gateClosed) return;
      const v = st.s[step.k];
      h += planStep(card.id, step, v);   // 门步骤本身照常渲染（含 noHint），只收它后面的
      if(step.type === 'yesno' && v === '没有') gateClosed = true;
    });
    if(gateClosed){
      h += '<div class="mat-nohint">上一步选了「没有」，这张卡后面的问题先收起了——没有这段经历就不用编；点回「有」会恢复。</div>';
    }
    h += '</div>';
    return h;
  }
  /* design/89：mono 独白卡渲染——锚定真题展示 + 大独白框 + 折叠追问（followups 全选填）。
     独白走 data-step-card/data-step-k="mono" 复用既有存储链路（s.mono）；跳过/恢复逻辑照旧。 */
  function planMonoCard(card){
    const st = cardState(card.id);
    if(st.skipped){
      return '<div class="mat-q mat-plan-skipped" data-unskip-card="' + escapeHtml(card.id) + '" title="点此恢复">已跳过：' + escapeHtml(ensureQuestionTitle(card.title || '')) + ' · 点此恢复</div>';
    }
    let h = '<div class="mat-q mat-plan-card mat-mono-card">'
      + '<div class="mat-q-head"><span class="mat-q-title">' + escapeHtml(ensureQuestionTitle(card.title || '')) + '</span>'
      + '<button class="mat-mini" data-skip-card="' + escapeHtml(card.id) + '">跳过此卡</button></div>';
    if(card.reason) h += '<div class="mat-q-hint">' + escapeHtml(card.reason) + '</div>';
    // 10/2 她拍板删掉两处 UI：① 锚定真题块（把当季题目原文 + youShouldSay 要点整块写出来）
    // ② 「这张卡覆盖 N 道当季题」折叠区。她说「只要提出一个简单的问题，然后给一个对话框就行」。
    // anchor 数组本身一字未动 —— formatCard 生成素材时仍要靠它把真题喂给 AI，口语页覆盖矩阵照旧。
    // 大独白框（s.mono）
    // 🚨 10/4 13:43 她报「又让我填一个框填东西，我不知道这是何意味」→ placeholder 改成
    // 「把这道题当聊天题，answer 后面那几行」的口吻，明确「用中文讲就行、当聊天说」。
    const monoVal = st.s.mono || '';
    h += '<textarea class="mat-mono-ta" data-step-card="' + escapeHtml(card.id) + '" data-step-k="mono" rows="5" placeholder="就像跟朋友聊天一样，用中文把上面这道题讲一遍：什么时候、和谁、发生了什么、有什么细节、当时什么感觉…想到哪说到哪，不用组织语言。">' + escapeHtml(monoVal) + '</textarea>'
      + '<div class="mat-char" data-monochar="' + escapeHtml(card.id) + '">' + monoCounterTip(monoVal) + '</div>';
    // 折叠追问（followups 全部 optional，渲染复用 planStep；choice「其他」自填走既有链路）
    const fus = Array.isArray(card.followups) ? card.followups : [];
    if(fus.length){
      h += '<details class="mat-fu"><summary>AI 追问 · ' + fus.length + ' 问（选填，想不起来细节再展开）▸</summary>';
      fus.forEach(step => { h += planStep(card.id, step, st.s[step.k]); });
      h += '</details>';
    }
    h += '</div>';
    return h;
  }
  function monoCounterTip(v){
    const n = String(v || '').trim().length;
    if(!n) return '还没写。目标 80 字以上，细节越多，AI 归纳出的素材越好用';
    if(n < 40) return '已写 ' + n + ' 字 · 偏短，AI 可能归纳不出足够细节，建议再补';
    if(n < 80) return '已写 ' + n + ' 字 · 可以了，再补 1-2 个画面细节更好';
    return '已写 ' + n + ' 字 · 够了';
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
  /* 卡答案 → 纯文本（喂给 SYS_MAT）。格式：label 去问号：值；多选顿号拼接；空步跳过（design/86 §6.2）。
     design/89：mono 独白卡 raw = 【锚定真题】+ 独白全文 + 已答 followups。 */
  function labelNoQ(label){ return String(label || '').replace(/[？?]+\s*$/, ''); }
  function formatCard(card, st){
    const s = (st && st.s) || {};
    if(card && card.type === 'mono'){
      const mono = String(s.mono || '').trim();
      const fuParts = [];
      (card.followups || []).forEach(step => {
        if(!step || !step.k) return;
        const v = s[step.k];
        if(v == null) return;
        if(Array.isArray(v)){ if(v.length) fuParts.push(labelNoQ(step.label) + '：' + v.join('、')); return; }
        if(String(v).trim()) fuParts.push(labelNoQ(step.label) + '：' + String(v).trim());
      });
      if(!mono && !fuParts.length) return '';
      const anchors = Array.isArray(card.anchor) ? card.anchor : [];
      const zh = anchors.map(a => a && a.topic).filter(Boolean).join(' / ') || card.title || '';
      const en = anchors.map(a => a && a.promptEn).filter(Boolean)[0] || '';
      const lines = ['【锚定真题】' + zh + (en ? '（' + en + '）' : '')];
      if(mono) lines.push('我的回答：' + mono);
      if(fuParts.length) lines.push('追问补充：' + fuParts.join('；'));
      return lines.join('\n');
    }
    const parts = [];
    (card.steps || []).forEach(step => {
      const v = s[step.k];
      if(v == null) return;
      if(Array.isArray(v)){ if(v.length) parts.push(labelNoQ(step.label) + '：' + v.join('、')); return; }
      if(String(v).trim()) parts.push(labelNoQ(step.label) + '：' + String(v).trim());
    });
    return parts.join('；');
  }

  /* 把 store.plan 里那些卡的已填答案（独白 + 追问）全量搬进 answers._legacy。
     14:45 抽成独立函数：两处调用 —— ① 渲染时发现 plan 是旧 algo（先把答案保住再丢弃 plan）
     ② 重新出题成功后。**严禁静默丢弃用户已填内容**是本项目的硬约束。 */
  function harvestLegacyFromStalePlan(plan){
    const oldAnsAll = (store.answers && store.answers.cards) || {};
    if(!Object.keys(oldAnsAll).length) return;
    const cardsOf = (plan && Array.isArray(plan.cards)) ? plan.cards : [];
    store.answers._legacy = store.answers._legacy || {};
    Object.keys(oldAnsAll).forEach(cid => {
      const st = oldAnsAll[cid];
      if(!st) return;
      const oldCard = cardsOf.find(c => c && c.id === cid);
      const title = (oldCard && oldCard.title) || ('旧卡 ' + cid);
      const s = st.s || {};
      if(s.mono != null && String(s.mono).trim()){
        const key = '旧卡·' + title + '·独白';
        if(!store.answers._legacy[key]) store.answers._legacy[key] = String(s.mono).trim();
      }
      Object.keys(s).forEach(k => {
        if(k === 'mono') return;
        const v = s[k];
        if(v == null) return;
        const vs = Array.isArray(v) ? v.join('、') : String(v).trim();
        if(!vs) return;
        const step = ((oldCard && Array.isArray(oldCard.followups) ? oldCard.followups : [])
          .concat((oldCard && Array.isArray(oldCard.steps) ? oldCard.steps : []))).find(x => x && x.k === k);
        const key = '旧卡·' + title + '·' + labelNoQ((step && step.label) || k);
        if(!store.answers._legacy[key]) store.answers._legacy[key] = vs;
      });
    });
  }

  /* ---- design/86 改动一：动态问卷规划 genQuestionPlan ----
     AI 拿当季 P2 题库全量清单 → 聚类 → 10~14 张漏斗式问题卡。
     🚨 10/4 13:43 她报 P0：「出的题跟上个赛季我自己弄出来的素材库相关，完全跟题库无关」。
        根因 = 本函数原先在 isReplan 时把旧卡已填答案整段拼进 prompt 并要求 AI 沿用，
        AI 被旧素材牵着走。**现已整段删除旧答案 prefill —— 新卡一律从零出。**
        旧卡答案不丢：全部汇入 answers._legacy（见下方「旧卡答案全量留底」），页面上有常驻入口可查可复制。 */
  async function genQuestionPlan(isReplan){
    const bank = getBankP2List();
    const isFallback = !bank;
    const listStr = bank
      ? bank.map(b => b.title + (b.req ? '（要点：' + b.req + '）' : '')).join('\n')
      : CANON.join('、');
    let sys = SYS_PLAN;
    /* 10/4 13:43 P0 修法：旧答案不再进 prompt（isReplan 参数保留仅用于日志/未来，
       严禁再把 store.answers 的内容拼进 sys —— 那会让 AI 照着旧素材出题）。 */
    void isReplan;
    const user = '人设：' + (ans('A') || '（未提供）') + '\n\n【当季 P2 题库清单】\n' + listStr;
    const content = await callRelay('material_plan', [ { role:'system', content:sys }, { role:'user', content:user } ], 0.5, { max_tokens: 8192 });
    const j = aiJson(content);
    if(!j || !Array.isArray(j.cards) || !j.cards.length) throw new Error('问卷规划 JSON 解析失败');
    const bankTitles = bank ? bank.map(b => b.title) : null;
    const cards = cleanPlanCards(j.cards, bankTitles, isFallback, bank);
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

    /* 🚨 10/4 13:43：旧卡答案**全量**留底（原先只留「没被 prefill 采用的」，现在 prefill 已删，
       等于全部旧答案都是「没被采用」→ 直接整体搬进 _legacy，一条不丢）。
       新卡从零出，但玩家还能在页面上翻到之前填过什么。 */
    harvestLegacyFromStalePlan(store.plan);
    // 旧卡答案搬走后清空 cards（新卡从零填），但 _legacy 里已留底，不会丢
    store.answers.cards = {};

    // 新卡若有 prefill 字段（AI 仍可能返回）也照收，但正常路径下不会有
    cards.forEach(c => {
      const cur = store.answers.cards[c.id] || { s:{}, skipped:false };
      if(c.type === 'mono'){
        if(c.prefillMono != null && String(c.prefillMono).trim() && cur.s.mono == null) cur.s.mono = String(c.prefillMono).trim();
        (c.followups || []).forEach(st => {
          if(st && st.prefill != null && String(st.prefill).trim() && cur.s[st.k] == null) cur.s[st.k] = String(st.prefill).trim();
        });
      } else {
        (c.steps || []).forEach(st => {
          if(st && st.prefill != null && String(st.prefill).trim() && cur.s[st.k] == null) cur.s[st.k] = String(st.prefill).trim();
        });
      }
      store.answers.cards[c.id] = cur;
    });
    store.plan = { bankVersion: DATA.speakingVersion || 0, isFallback: !!isFallback, cards: cards, algo: PLAN_ALGO };
    saveStore();
  }
  /* AI 返回卡清洗（4.3.4，前端必须做，不信任 AI 自觉）。
     design/89：mono 独白卡（type:'mono'，anchor 锚定真题 + followups 折叠追问）与旧 steps 卡双型兼容；
     anchor 的 topic 走 matchBankTitle 纠偏后，promptEn/req 一律由题库真值回填（AI 侧字段仅兜底）。 */
  /* 🚨 10/4 13:43 P0 兜底：AI 输出的卡片标题必须是「能直接开口回答的疑问句」，
     不是「和同桌男友一起学语言的经历」这种主题标签（她原话：「问的根本就不是题目了，而是一句话陈述」）。
     本函数只做展示层兜底 —— 把陈述句改写成问句；本来是问句的原样返回。 */
  function ensureQuestionTitle(t){
    let s = String(t || '').trim();
    if(!s) return s;
    // 🚨 只剥**句尾**标点：句中的问号必须留着
    // （反例：「有没有一个关系特别好的同桌？后来怎么样了？」→ 中间那个 ? 不能被吃掉）
    const clean = s.replace(/[。！!?]+$/g, '').trim();
    // 已是问句：以问号收尾，或带「吗/呢/吧」等口语疑问语气
    const hasQMark = /[？?]/.test(clean);
    const hasQParticle = /(吗|呢|吧)[？?]?$/.test(clean);
    // 以疑问词开头但**没有问号**（如「为什么你觉得自己适合这个专业」）—— 这类必须补问号，
    // 否则学员看到还是不知道这是在问自己什么（10/4 单测实锤）。
    const startsInterrogative = /^(你|您|有没有|是不是|为什么|怎么|什么|哪|谁|多少|能不能|要不要|会不会|哪个|哪些|什么时候)/.test(clean);
    if(hasQMark || hasQParticle) return clean;
    if(startsInterrogative) return clean + '？';
    // 陈述句 → 按结尾特征改写
    if(/(的经历|的一段|的人|的事|那次|那次经历)$/.test(clean)){
      const stem = clean.replace(/(的经历|的一段|的人|的事)$/, '');
      // 「A 的经历」→「关于 A，你还记得什么？」类
      if(/(的人)$/.test(clean)){
        const who = clean.replace(/的一个?人$/, '').replace(/的人$/, '');
        return '你身边有没有这样一个人：' + who + '？他/她身上有什么让你印象深刻的？';
      }
      if(/(的经历|的一段)$/.test(clean)){
        return '能不能讲讲' + stem + '这段经历？当时具体发生了什么？';
      }
      return '关于' + stem + '，你能讲讲具体是怎么发生的吗？';
    }
    if(/^一次/.test(clean)){
      return '最近一次' + clean.replace(/^一次/, '') + '，是什么时候、和谁、发生了什么？';
    }
    // 兜底：句尾补一个中性追问
    return clean + '——具体是什么时候、和谁一起发生的？';
  }
  function cleanPlanCards(rawCards, bankTitles, isFallback, bankFull){
    const out = [];
    (Array.isArray(rawCards) ? rawCards : []).forEach((c, i) => {
      const isMono = !!(c && c.type === 'mono');
      if(!c || !c.title) return;
      if(!isMono && (!Array.isArray(c.steps) || !c.steps.length)) return;   // 旧 steps 卡仍要求 steps 非空
      const card = {
        id: String(c.id || ('q' + Date.now().toString(36) + i)),
        title: String(c.title),
        reason: String(c.reason || ''),
        topics: []
      };
      /* 🚨 10/4 13:43 她报「问的根本不是题目，是一句话陈述」—— AI 仍可能无视 prompt 输出主题标签。
         前端兜一层：把「…的经历 / …的人 / …的一段 / 一次…」这类陈述句改写成疑问句。
         改不动的（本来就是问句）原样保留。**纯展示层兜底，不影响 AI 侧真值。** */
      card.title = ensureQuestionTitle(card.title);
      if(isMono){
        card.type = 'mono';
        card.anchor = [];
        card.followups = [];
      } else {
        card.steps = [];
      }
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
      if(isMono){
        // anchor：1~2 道真题，topic 纠偏；promptEn/req 从题库真值回填（AI 给的只做兜底）
        const seenA = new Set();
        (Array.isArray(c.anchor) ? c.anchor : []).slice(0, 2).forEach(a => {
          if(!a) return;
          let name = (typeof a === 'string') ? a.trim() : String(a.topic || '').trim();
          if(!name || seenA.has(name)) return;
          if(!isFallback && bankTitles){
            const bt = matchBankTitle(name, bankTitles);
            if(!bt) return;
            name = bt;
          }
          seenA.add(name);
          const hit = (Array.isArray(bankFull) ? bankFull : []).find(b => b.title === name);
          card.anchor.push({
            topic: name,
            promptEn: (hit && hit.promptEn) || String(a.promptEn || ''),
            req: (hit && hit.reqArr && hit.reqArr.length) ? hit.reqArr.slice() : (Array.isArray(a.req) ? a.req.map(x => String(x || '').trim()).filter(Boolean).slice(0, 3) : [])
          });
        });
        // anchor 全部没锚上且非兜底模式 → 弃卡（锚定是 mono 卡的立卡前提）
        if(!card.anchor.length && !isFallback) return;
        // followups：最多 3 个；禁 yesno；强制 optional；choice 降级；「其他」末项
        (Array.isArray(c.followups) ? c.followups : []).slice(0, 3).forEach(st => {
          if(!st || !st.k || !st.label) return;
          if(st.type === 'yesno') return;
          let type = ['choice','text'].indexOf(st.type) >= 0 ? st.type : 'text';
          const step = { k: String(st.k), type: type, label: String(st.label), optional: true };
          if(step.type === 'text' && st.ph) step.ph = String(st.ph);
          if(step.type === 'choice'){
            let opts = Array.isArray(st.options) ? st.options.map(x => String(x || '').trim()).filter(Boolean) : [];
            if(opts.length < 2){ step.type = 'text'; }   // choice 无 options/<2 → 降级 text
            else {
              if(opts[opts.length - 1] !== '其他') opts.push('其他');
              step.options = opts.slice(0, 7);
              if(st.multi) step.multi = true;
            }
          }
          card.followups.push(step);
        });
        if(c.prefillMono != null && String(c.prefillMono).trim()) card.prefillMono = String(c.prefillMono).trim();
        if(card.anchor.length || card.topics.length) out.push(card);
      } else {
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
      }
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
      /* 🚨 14:45 她 14:45 截图里「点了重新出题还是旧卡」的**真凶就在这**：
         原来只判断 `store.plan` 有没有卡 → 旧算法 plan（stale）也算「有」→ 走 else 分支
         「旧问题保留，可重试」→ **旧卡原封不动留在页面上**，她看到的就是「prompt 没用」。
         修：stale plan 不算可用旧 plan（与渲染层 algoStale 同一把尺），
             失败时直接进自由填写模式，**绝不把旧卡留在「专属经历问题」位上冒充新题**。 */
      const planAlgoNow = store.plan ? (store.plan.algo || 1) : 0;
      const hasUsablePlan = !!(store.plan && Array.isArray(store.plan.cards) && store.plan.cards.length)
                            && planAlgoNow === PLAN_ALGO;
      if(!hasUsablePlan){
        freeMode = true;
        // 旧答案先进留底，别丢
        try{ harvestLegacyFromStalePlan(store.plan); }catch(_){}
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
  async function tryBatch(subset, personaText, batchLabel, isImport){
    const expText = subset.map(e => {
      const raw = String(e.raw || '');
      const zhCount = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
      const isEn = raw.length > 0 && (zhCount / raw.length) < 0.05;
      return '【' + e.title + '】' + (isEn ? '[原样保护·禁止改写]\n' : '\n') + raw;
    }).join('\n\n');
    // 拆批时明确告知 AI「只整合本批」，否则它会按全量答题、两批内容打架
    const headNote = batchLabel ? '（这是考生全部经历的第 ' + batchLabel + ' 批，只整合本批经历，stories 与 coverage 照常输出）\n\n' : '';
    const listNote = batchLabel ? '本批经历：\n' : '全部经历（含追问补充）：\n';
    /* 10/4 15:30 导入路径：她是自己已有的素材，不是答题填出来的经历。
       换一句口径 + 三条纪律：① 素材里的人称一律当考生本人（她粘的可能是范文/别人的句子）
       ② **严禁编造素材里没有的事实** —— 只能重组 / 合并 / 补过渡 ③ 纯英文按 5.2 原样保留 */
    const importNote = isImport
      ? '【本次是「导入整理」模式】下面这些文字是考生自己早就准备好的素材（可能中英混杂、可能是零散笔记或句子）。'
        + '你的任务是**重新组织**它们，不是续写新内容。纪律：\n'
        + '1. **严禁编造素材里没有的事实、人物、地点、事件**。素材没写的绝对不能出现。\n'
        + '2. 允许做的事：合并同一件事的零散描述、补写连接片段的过渡句、把中英混杂统一成通顺英文、合并重复表述。\n'
        + '3. 素材里的人称（I / he / she / you）一律视为**考生本人**；若原文是第三人称叙述某人，改成第一人称。\n'
        + '4. 纯英文段落按规则 5.2 原样保留、一字不改。\n'
      : '';
    const user = '人设：' + (personaText || '（未提供）') + '\n\n' + importNote + headNote + listNote + expText + '\n\n请按规则整合为尽量少的连贯大故事（coverage 按规则 4.x 放开挂题），输出 stories JSON。';
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
  async function genMaterialsBatch(exps, personaText, isImport){
    const FAIL_MSG = '素材生成失败（返回内容被截断或格式错误），请少填几条经历后重试';
    async function attempt(subset, depth, label){
      try{
        return collectBatch(await tryBatch(subset, personaText, label, isImport));
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
    const res = await attempt(exps, 0, null, !!isImport);
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
    // v7.2 细节碎片库：串题时她补的 / AI 代补的细节自动沉淀在这里，之后任何题串题都自动复用
    const bits86 = Array.isArray(store.detailBits) ? store.detailBits.filter(b => b && (b.en || b.zh)) : [];
    if(bits86.length){
      h += '<div class="mat-sec-title">记住的细节碎片 <span class="tag">' + bits86.length + ' 条 · 串题自动复用</span></div>';
      h += '<div class="mat-shortwarn" style="background:var(--card);">串题时补过的细节都在这里，其他题自动复用。'
        + '<div style="margin-top:8px">' + bits86.map(b =>
          '<div class="sp-slot-row" style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px"><span style="flex:1">'
          + (b.en ? escapeHtml(b.en) : '') + (b.en && b.zh ? ' <span style="opacity:.65">（' + escapeHtml(b.zh) + '）</span>' : (b.zh ? escapeHtml(b.zh) : ''))
          + '</span><button class="mat-mini danger" data-delbit="' + escapeHtml(b.id || '') + '">删</button></div>').join('')
        + '</div></div>';
    }
    // 行动
    /* 15:45 她拍板：结果页底部加第三个按钮「＋ 添加素材」。点开一个弹层，里面：
       ① 大文本框粘自己的文字 ② 两个选择 —— 「直接加上去」（自己的文字原样作为一张素材卡）
       ③「AI 智能生成素材」（把刚粘的文字整理成故事卡 + 算能串哪些题）。
       她原话：「自己写一些素材，然后点击AI可以自动帮我整理成几个万能素材，然后给我套」+
       「加一些我自己的文字素材，直接加上去或者AI智能生成素材，都行」。 */
    h += '<div class="mat-actions mat-result-acts">'
      + '<a class="btn btn-primary" href="speaking.html">去练口语 →</a>'
      + '<button class="mat-add" id="matRegen">↻ 重新填写 / 生成</button>'
      + '<button class="mat-add" id="matAddMatToggle" aria-expanded="false" aria-controls="matAddMatBody">＋ 添加素材</button>'
      + '</div>'
      + '<div class="mat-import-body" id="matAddMatBody" hidden>'
        + '<div class="mat-q-hint">把你自己写的<b>任何文字</b>粘进来（中文、英文、中英混着都行）。然后选一种加法：</div>'
        + '<textarea id="matAddMatText" rows="8" placeholder="把你写的素材粘在这里，一段一段分开写（空两行分段更清楚）…"></textarea>'
        + '<div class="mat-char" id="matAddMatChar"></div>'
        + '<div class="mat-actions mat-add-mat-acts">'
          + '<button class="btn btn-ghost" id="matAddRaw" disabled>直接加上去</button>'
          + '<button class="btn btn-primary" id="matAddAI" disabled>AI 智能生成素材</button>'
        + '</div>'
        + '<div class="mat-import-tip"><b>直接加上去</b>：把你这段文字原样做成一张素材卡，不改一个字（适合你只想存起来、以后自己再改）。<br>'
          + '<b>AI 智能生成素材</b>：AI 把它整理成能背的英文故事，并算出能串当季题库的哪些题。'
          + '只会重新组织、合并、补过渡，<b>不会编造你没写过的经历</b>；纯英文段落按原样保留、一字不改。</div>'
      + '</div>';
    root.innerHTML = h;
    // v7.2 删除单条细节碎片
    root.querySelectorAll('[data-delbit]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.delbit;
        store.detailBits = (store.detailBits || []).filter(x => (x.id || '') !== id);
        saveStore();
        render();
        toast('已删除该细节碎片');
      };
    });

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
    bindAddMaterial(root);
  }

  /* ================================================================
     10/4 15:45 她拍板：素材卡结果页底部第三个按钮「＋ 添加素材」
     —— 场景：她自己也写了一些素材，想加进这个素材库里。
     —— 两种加法（她原话「直接加上去或者 AI 智能生成素材，都行」）：
        ① 直接加上去：她的文字**原样做成一张素材卡**，一字不改（不调 AI、不花额度）
        ② AI 智能生成：粘进来的文字交给 AI 整理成能背的英文故事 + 算 coverage
     —— 与「导入整理」入口的区别：那个是**整库替换**（她要的是自己的素材当唯一真源），
        这个是**追加**（已有素材保留，她新写的补进去）。两者共用 tryBatch 的 import 口径。
     ⚠️ store.materials 是数组，追加不覆盖；不写 plan / 不答题 / 不填人设。 */
  let addMatBusy = false;
  function bindAddMaterial(root){
    const tg = $('#matAddMatToggle'), body = $('#matAddMatBody');
    const ta = $('#matAddMatText'), cnt = $('#matAddMatChar');
    const bRaw = $('#matAddRaw'), bAI = $('#matAddAI');
    if(!tg || !body || !ta) return;
    tg.onclick = () => {
      const open = body.hidden;
      body.hidden = !open;
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) setTimeout(() => ta.focus(), 60);
    };
    const paint = () => {
      const n = String(ta.value || '').trim().length;
      if(cnt) cnt.textContent = n ? ('已写 ' + n + ' 字 · ' + splitImportedText(ta.value).length + ' 段') : '';
      if(bRaw) bRaw.disabled = n < 1;
      if(bAI) bAI.disabled = n < 10;
    };
    ta.addEventListener('input', paint);
    paint();
    if(bRaw) bRaw.onclick = () => addMaterialRaw(ta.value);
    if(bAI) bAI.onclick = () => addMaterialByAI(ta.value);
  }

  /* ① 直接加上去：原样做成素材卡。**零 AI 调用、零额度、零等待。**
     🔴 10/4 15:50 修正：**逐段判定中英**，不是整段一起判 —— 她可能中英混粘，
     整段判会把她那段纯英文塞进「中文逻辑链」栏（storyEn 空着没法背）。 */
  function addMaterialRaw(txt){
    const segs = splitImportedText(txt);
    if(!segs.length){ toast('先写点内容'); return; }
    store.materials = store.materials || [];
    let nEn = 0, nZh = 0;
    segs.forEach((s, i) => {
      const zhCount = (s.match(/[一-鿿]/g) || []).length;
      const isPureEn = s.length > 0 && (zhCount / s.length) < 0.05;
      if(isPureEn) nEn++; else nZh++;
      const firstLine = s.split('\n')[0].trim().slice(0, 24) || ('我的素材 ' + (i + 1));
      store.materials.push({
        title: segs.length > 1 ? (firstLine + '（' + (i + 1) + '）') : firstLine,
        // 纯英文 → storyEn（能直接背）；含中文 → logicZh（等她写完或用 AI 补英文）
        storyEn: isPureEn ? s : '',
        logicZh: isPureEn ? '' : s,
        spineEn: [], goldenEn: [], coverage: [], coverageRate: null,
        pinned: false, _raw: true
      });
    });
    saveStore();
    render();
    toast('已加上 ' + segs.length + ' 张素材卡（原样保存，一个字没改）'
          + (nEn ? '，其中 ' + nEn + ' 段英文已放进「完整故事」' : '')
          + (nZh ? '，' + nZh + ' 段中文放在「中文逻辑链」' : ''));
  }

  /* ② AI 智能生成：追加（不是替换）—— 她已有素材必须保留 */
  async function addMaterialByAI(txt){
    if(addMatBusy) return;
    const segs = splitImportedText(txt);
    if(!segs.length){ toast('先写点内容'); return; }
    addMatBusy = true;
    const btn = $('#matAddAI'), old = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'AI 正在整理…'; }
    try{
      const exps = segs.map((s, i) => ({ id: 'AM' + i, title: '我的素材第 ' + (i + 1) + ' 段', raw: s }));
      const res = await genMaterialsBatch(exps, ans('A'), true);   // true = 导入整理口径（禁编造 + 人称归一）
      const stories = (res.stories || []).map((s, i) => { const m = normalizeMaterial(s, i); delete m._goldenDropped; return m; })
                      .filter(m => m && String(m.storyEn || '').trim());
      if(!stories.length) throw new Error('AI 没有整理出可用的素材（内容可能太短，试试多写几段）');
      store.materials = (store.materials || []).concat(stories);   // **追加，不覆盖已有**
      saveStore();
      render();
      toast('AI 整理出 ' + stories.length + ' 个故事，已加到你现有素材后面');
    }catch(e){
      console.error('[materials] 添加素材（AI）失败', e);
      toast('整理失败：' + e.message);
      if(btn){ btn.disabled = false; btn.textContent = old || 'AI 智能生成素材'; }
    }finally{
      addMatBusy = false;
    }
  }

  /* ---------- 初始化 ---------- */
  // materials.html：页面加载即渲染（问卷态从 sessionStorage 恢复，填一半刷新不丢视图）
  ready(() => {
    store = loadStore();
    mode = restoreMode();
    render();
  });
  // 口语页 MAT tab：挂 window.matGen（tab 点击时 init 从 DATA.materials 重载并渲染）
  // 并注册「云同步合并后无缝重渲染」，与旧内嵌版行为对齐
  // deepDig 供程序化调用（深挖已并入生成流程，无手动按钮）
  window.matGen = { init: init, render: render, deepDig: function(){ return deepDigCoverage(false); } };
  try{
    // 她反馈（9/23）：合并触发 init 会把 mode 强设回 result → 填到一半的问卷被打回素材列表。
    // 问卷态原地重渲（答案实时存在 store 里，重渲后照常显示）；其余视图照旧走 init。
    const mergeRender = function(){
      store = loadStore();
      if(mode === 'q'){ render(); return; }
      init();
    };
    window.__hubRenderers = window.__hubRenderers || [];
    if(!window.__hubRenderers.includes(mergeRender)) window.__hubRenderers.push(mergeRender);
  }catch(_){}
})();
