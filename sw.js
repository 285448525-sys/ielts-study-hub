/* ielts-hub Service Worker — 2026-09-20 重写（预缓存核心壳 + 分级缓存，弱网/离线可打开）
   历史脉络（勿删注释，防后人再走弯路）：
   - 8/30 旧版「network-first + 回退缓存」在农村弱网回退旧 JS/CSS →「改了不生效」顽疾；
   - 9/4 改为「全网络直通 + 主动注销」——治了顽疾但离线完全不可用；
   - 现版：HTML network-first（保部署后先拿新 HTML）+ 静态资源 stale-while-revalidate
     （缓存键一律去 ?v= 的 pathname，不受手工版本号影响）+ 核心壳预缓存（离线首开可用）。
     版本一致性兜底 = 页面侧 navDeployProbe / navSelfHealReload 自愈机制（common.js，禁删）。
     离线态（design/79）由 common.js 的 online/offline 监听在页面侧驱动（状态灯 + 自愈离线闸），
     SW 不参与离线态的判定与渲染，缓存策略本文件零改动。
     本文件 activate 时发的 `SW_UPDATED` 消费端也在 common.js（maybeShowSwUpdatePrompt，
     design/78）：页面收到后只弹提示条，**是否刷新由用户点击决定，SW 侧绝不自动 reload**。 */
// 10/4 11:25 设置页/会员页 .rv 加自愈保护：页尾「负责显示」的程序没跑起来时自动解除隐藏，
// 杜绝「页面在、内容永久空白」（她 11:15 报设置页时好时坏）。v203→v204
// 10/4 11:35 她反馈三处：①设置页头像点不动（实测线上正常，是旧页面）②头像右下角小笔角标太丑→删除
// ③登录页写了她自己 10/9 考试→改成「备考踩过的坑都做成了功能」。v204→v205
// 10/4 11:50 P0 修「点头像换不了头像」：账户卡 .acct-card 带 overflow:hidden，把定位在卡片下沿
// 之外的头像弹层整块裁掉（实测可见高度 0px，弹层其实已打开但完全看不见）。v205→v206
// 10/4 12:50 她反馈手机端 5 个标签要滑动 → 「数据管理」与「账号与同步」合并为一组「数据与账号」，
// 共 4 组；手机端标签等宽铺满不再滑动；顺手修「清空所有数据」按钮文字被折成两行的问题。v207→v208
// 10/4 13:05 单词页（背词）移动端改版第一步：词库卡头部窄屏改上下堆叠，
// 根除「复习计划 / AI 补全」文字被挤成竖排；导入条手机端只留一行。v208→v209
// 10/4 13:20 四页重做第 2 页 · 口语题库移动端：倒计时提示条改块级（原 flex 把文字拆成
// 四段，窄屏各自折行 → 她截图里的错位）；题卡标签不再被 max-width:46% 硬裁。v209→v210
// 10/4 13:30 四页重做第 3 页 · 口语陪练：空态（未开口时）把问候与快捷按钮竖向居中，
// 不再让下方空出一大片；用户一开口 hideChips() 移除按钮 → 选择器失效、自动回到顶部对齐。v210→v211
// 10/4 13:45 四页重做第 4 页 · 写作模板：模板卡标题与分类名相同时不再重复渲染分类行
//（原来「观点型 / 观点型」两行同文，看起来像空壳卡）；分类按钮手机端收紧。v211→v212
// 10/4 13:20 口语陪练按她要求改版：头像从顶栏搬到气泡左边（气泡头像即换考官入口，两者合一
// 后换考官才会同步到气泡）；顶栏只留「AI 口语陪练 / 自由对话」；顶栏按钮统一为「本轮教练台」
// 开合（窄屏原本点了开记忆弹层、且教练台整块隐藏→现在展开态显示为浮层）；发送框收到 36px。v212→v213
// 10/4 13:36 她看过实机后补一条：手机端教练台改为**默认收起**（点开才出现）；
// 桌面维持默认展开。窄屏开合只记内存、不写回设置，避免「手机收起把电脑右栏也收掉」。v213→v214
const CACHE = 'ielts-hub-v353';  // 10/13 13:1x 写作 pane 列表美化批（她 13:0x 截图报「一眼看不见重点 + 筛选条太长」，授权免问直办）：① 筛选条改一行窄条——两个 select 从「按最长 option 定宽各自通栏」改 nowrap + width:auto + max-width:172px（超宽横滑），选项文案「全部→全部作文」「全部题型→所有题型」（大作文（Task 2）→大作文 Task 2 缩短）；② 卡片层级重排——中文标题升 16px/800 两行 clamp（原 15px 单行 ellipsis 切内容，撞她「绝不切内容」判据）、来源 meta（同意与否|大陆 2019 原题）从顶行拆出独立成行降 12px 灰、「尚未练习」空态去边框去底色弱化为斜体灰字、分数徽章保持靠右。writing.js → 20261011c（bank.html + writing.html 两页共用同一串）。探针 examflow v4 扩 T20（S19/S20 静态 + 筛选条一行/卡片 clamp/meta 行/点击进场契约）89/89。上一版 v352。  // 10/13 12:5x 新手页文案重写 + 侧栏登录入口批（她 12:3x 报两件，授权免问直办）：① beginner.html 新手必读 4 节扩 7 节——新增「报名前两件事别搞错」（A/G 类看学校要求 + 认准 ielts.neea.cn + 口语预约趁早；机考考位多、考前 3 日截止报名）「现在全是机考改变了什么」（中国大陆 2026-9-1 起全面机考官方实锤；听力只一遍+仅 2 分钟检查=必须边听边打；阅读同屏滚动+右键高亮+可复制粘贴原文；写作电脑直打；Settings 调字号；出分 3-5 天）「考试当天带什么几点到」（证件+无标签水；上午 8:00/下午 13:00 前到；每科账号密码纸；试音）三节，原「机考一句话」删并并入新第 3 节。来源 ≥2 独立来源（官方 chinaielts.org 公告 + jiaoyubao/中国教育报道/新航道/川外四源交叉，链接在 beginner.html 注释）。② 侧栏左上角修她报的「bug」= 未登录也渲染默认陌生头像 → 改登录态才显头像、未登录显同尺寸「登录」入口（跳 login.html，顺手补上侧栏缺失的登录路径）。common.js → 20261012h（19 页）。自检：本地截图双态（guest=登录入口/logged=头像）+ examflow 84/84 回归。上一版 v351。  // 10/13 12:0x 做题页 UI 大优化 + 交互修 bug 批（她 11:0x 截图报 6 件，常设授权免问直办）：① 底栏并一行——题号行与 Pause/Exit/Finish section 桌面改单行 row（题号行 flex:1 占满），≤860 移动端保持两行；② 顶部三行缩两行——听力独立 Part 横幅（.ex-part）撤销，并入音频条行首胶囊 .ea-part（Part N · Questions X–Y），阅读无音频条仍留横幅；③ 左下全站绿胶囊（floatTimer）考场内隐藏（common.js syncFloatTimer 扩判断 #examRoot），改在顶栏计时器旁显示小徽章 #exFtMini（Timing/Paused + 时间，纯英文守「考试页零中文」铁律，数据源与 floatTimer 同口径）；④ Pause 从摆设变真功能——pauseExam/resumeExam：暂停音频+考试倒计时（剩余秒数入 EX._leftSec），按钮互文 Resume；⚠️ 只属练习模式（BC 官方 FAQ「recording cannot be paused」+ Zoju Strict/Breath + ieltsfreepractice Practice/Exam 三源一致 → 考试模式/听力完整模考不渲染该按钮）；⑤ 双击 Tab 窗口 600→800ms（她报没反应，慢双击 700ms 路径探针已验）；⑥ 填空框改真机考 placeholder 口径——点击后数字不硬消失，input placeholder=题号灰显、输第一个字符才让位（她截图 3 指定）。bank.js → 20261012i（仅 bank.html），common.js → 20261012g（19 页）。探针 examflow v4 84/84 + lfulltest 28/28 + 连带 randomfull 11/11 + dict 9/9。上一版 v350。  // 10/13 00:2x 意见反馈弹层文案真人化批（她 00:14「UI 大优化 + 文案写得真人感善解人意一点」，授权免问直办）：① 顶部加站长第一人称开场白「这个站就我一个人在做，你写下的每一条我都会自己看」；② 「遇到什么问题？必填」→「你遇到什么了？」（删红字必填），placeholder 从格式教学改真实例子（点「添加任务」没反应…）；③ 技术元信息「页面 settings.html · 1280×720 · 已登录」退到悬停提示，弹层只说「页面信息已自动附上」（提交数据仍原样带全，submit 独立重算）；④ 截图 label 说明价值「截图能帮我更快定位」；⑤「提交反馈」→「发给站长」，底部「未登录也能提交」→「不用登录也能发；截图只用来定位问题，不会外传」。成熟口径 ≥2 来源已核（corebee.ai「Every response is read by a real person / even one sentence helps」+ userguiding.com 反馈弹层五要素）。新增 .fb-greet 样式由 feedback.js 自注入（14 页引用，不动 common.css 免全站 bump）。feedback.js → 20261013a（14 页版本串同 bump），PRECORE 已含。上一版 v349。  // 10/13 00:0x 会员页修渲染 bug + 美化批（她 23:52「UI 大优化 + 渲染还有 bug」）：🔴 三个真 bug——① sprite #i-check/#i-lock 全站从未定义（10/12 批1 把静态表搬进 pricing.js 时丢了 sprite）→ 勾/锁图标全空白，且 <svg> 无尺寸默认 300×150px 直接把对比表列撑爆（她截图的列宽失衡/表头漂移元凶）→ sprite 补进 vip.html + common.css 给 svg 固定 15px；② 会员列金色高亮样式写的 .vip-col 与 pricing.js 输出类 c3 不匹配，从未生效（死代码已删，金色调统一收进 common.css .vip-cmp td.c3，她 10/1 授权）；③ 表格无 table-layout:fixed，长 sub 撑爆首列 → fixed + 首列 44%。美化：会员列金底、行 hover、主推价格卡轻投影、图例图标上色。common.css → 20261013a（仅 vip.html 引用 bump——.vip-cmp/.plan-card 样式只有会员页用）；SW v348→v349。上一版 v348。  // 10/12 23:5x 计划页「今日/规划」美化批（她 23:39「两个页面 UI 太丑」）：纯视觉层，交互/id/数据流零改动——今日 tab 添加区成面板（.pt-add 浅底圆角，手机端 display:contents 无盒零影响）+ textarea focus 环 + 空态一行小字改居中浅底卡 + 进度条主色 --med 药用紫→teal；规划 tab 四科目卡居中+色点+分数加重+差距/达标胶囊徽章 + 结论框大圆角左色条 + 「已生成 N 天计划」裸行改浅 teal 卡（emoji 🗓→线性日历图标）+ 报告大按钮轻投影。plans.js → 20261012b（仅 plans.html 引用）。上一版 v347。  // 10/12 23:4x 句子页「听写」tab 全面改版（她 23:31「全面大更新…现在这样完全不对」）：① 入口层改「练法模式双卡」——逐句默写（原「表格默写（隐藏英文列）」按钮退役，文案开发者视角）+ 听写（startDict 功能完整但此前页面从未给按钮，本次一并暴露）；② 句子库区「语料表（左中文·右英文）」改名「我的句子库」+ 搜索框补 placeholder；③ 添加入口由嵌套两层 <details> 改平铺三 tab（单条/批量/AI 识别），点「＋ 添加句子」展开；④ 库空态改大 CTA（图标+一句话+「＋ 添加句子」），且库空时两个练法按钮置灰（Quizlet「先建材料再学习」通例）。来源 ≥2 独立来源已核（listenmemo.com / sublearn.com / dictationtoday.com，链接在 corpus.html 注释）。corpus.js → 20261012a（仅 corpus.html 引用）。上一版 v346。  // 10/12 23:3x 完整模考改纯随机组卷（她 23:2x「组卷改成纯随机，不用提前写好题目在那」）：阅读/听力入口卡不再预组卷、不再列出具体篇目（原 _fullSet/_listenFullSet 渲染时组一次缓存的两变量已删），点 Start 那一刻才从 Part 各随机抽 1 篇（每次都不一样，退出回列表再进=再抽）；题数口径写死 40（全库实测：阅读 Part1/2 恒 13 题 + Part3 恒 14 = 恒 40；听力每篇恒 10 × 4 = 恒 40），卡上 pills 改「随机组卷 · Part 各抽 1 篇 / 每次 Start 重新抽」。bank.js → 20261012h（仅 bank.html 引用）。上一版 v345。  // 10/12 23:1x 口语模考入口页改版（她 23:01「页面太空泛」+ 作答方式口径）：「作答方式是打字」→「语音输入 + 推荐豆包输入法（识别最准）」；页面结构照成熟站通例改「Part 1/2/3 流程三卡（编号+名称+时长，来源 ieltsmentor.ai / ieltsbeacon.com / english-secrets.com，≥2 独立来源已核）+ 说明条目两列小卡网格」，替换原 5 条长列表（「全程 12–15 分钟」并入入口卡）。只动 bank.html 内联区，SW v344→v345。上一版 v344。  // 10/12 23:0x 模考做题页两批：【批A 底部条重构】顶栏 Part/Passage 切换删 + 40 格答题卡 .ex-sheet/.ex-sq 整体退役 → 底栏 = 篇切换器(#exPgPrev/#exPgNext) + 题号行(#exNums .ex-num，只列当前篇、四态 done/cur/flag、点号跳题) + .ex-actions(Pause/Exit/Finish section)，根治「所有题堆在下面」，写作 Task 1-2 同构；【批D 阅读段落信息匹配改版】题库存为 g.type='map' 的阅读组改真机考形态：文章每段前插虚线槽 .ex-pslot(A–G) + 题号气泡 .ex-lohb，拖入/点选两路放入（复用匹配题 pointer 拖拽状态机），答案口径不变(EX.user[题号]=段落字母)。bank.js → 20261012g（bank/home/practice 3 页）+ bank.html 配套 CSS。上一版 v343。  // 10/12 22:2x 侧栏导航模考优先重排（她拍板）+ 口语换话筒/模考换试卷图标（ICON.speaking/ICON.mock 互换归位）+ 学习组页卡序同口径。common.js → 20261012f（19 页），hubgroup.js → 20261011c（3 组页）。  // 10/12 口语 AI 按目标分四档：coach.js 去个人档案（写死 5.5/实考 5.0/ADHD → 读 targets 分档，多用户正确性）+ P3 辅助/复盘四档（L1≤5/L2 5.5/L3 6/L4≥6.5，锚句库 8→12 条，for example 按档放开——6 分最缺展开一层）+ P1/P2 纠错档位头 + spTargetBand 兜底链 speaking→overall→5.5。coach.js → 20261012a，speaking.js → 20261012b。上一版 v337。  // 10/12 第 10 项：听力「完整模考」（Part 1–4 各随机一篇 = 40 题 / 30 分钟，随机组卷同阅读口径）：听力 pane 加入口卡；考试页 Part 1→4 连续切篇（单栏壳 renderListenPart，与阅读 renderPassage 平行——goTo 与 Part tab 点击两处硬编码 renderPassage 已修为按 channel 分叉）；每个 Part 自己的音频、整场只播一遍不可回退不可重播（audioStartedBy 按篇记录，交卷后解锁复听口径不变）；全程考试模式（模式切换按钮不渲染）；30 分钟总倒计时；成绩卡 PART 1–4 分项 + bandOfListening 换算。bank.js → 20261012d。上一版 v329。  // 10/12 考场复查修三处（她拍板归档前质检）：① ☰ 再点 = 关闭 Option 面板 + 选完 Colour/Size 自动关面板 + 点面板空白关闭（面板是 inset:0 全屏覆盖层，选完不关会挡住后面一切点击——v4 实测踩坑）② 多选 dis 同步 input.disabled（只加 class 的话键盘 Tab 仍能勾，绕过限数）③ 交卷确认弹层开着时 Tab 归弹层（不拦）。common.js → 20261012c，bank.js → 20261012c。上一版 v328。  // 10/12 做题页 UI 统一对齐真机考（样子稿 104 v4 标准，她拍板「统一成这样」）：窄单行顶栏 + ☰ Option 覆盖面板（Colour 三主题整屏反色 / Size 三档，交互在 common.js —— bank/writing 共用壳）；Part 一行横幅；题号黑框方块；判断/单选/多选改竖排 radio/checkbox 整行（选中=圈实心+行浅 teal，颜色本站 teal）；填空框三态（未点=框中数字/点击=空白输入/失焦显示值）；多选限数（Choose TWO 选满其余变灰，题号「19-20」合并框）；逐题旗子 Mark（从底栏迁题干右上）；删底栏 Mark/prev/next，Submit→Finish section，交卷确认文案同步；双击 Tab 跳下一题；右下悬浮导航产品本就没有。bank.js → 20261012b，common.js → 20261012b（全站）。上一版 v327。  // 10/12 考试流程对齐（她拍板「对齐现行真机考」）：高亮棕底白字(#8b3a2e 她定的色值)+重复高亮变玫红+单击已高亮直出 Remove；划词选中即弹（右键保留）；交卷二次确认(含未答数)+到点强制交卷；计时 10/5 分钟双档；答题卡四态(Not seen/No response/Completed/Marked)+Mark 按钮纠偏；听力音量控制(跨页记住)。bank.js → 20261012a。修 selectionchange 异步竞态（右键开条被它晚到收掉，T13 真案）。上一版 v326。  // 10/11 体检修 bug：目录（manifest）还没下载完时切 tab 会显示「这一部分暂时没有篇目 / 共 0 篇」+ 听力 Part 徽标显示 0 —— 是错误陈述（明明有 68/347 篇），用户会以为站是空的。改：数据未到统一显示「目录加载中…」；目录加载失败时听力列表也给失败提示。：听力单篇（列表分栏 90/66/64/127 + 音频条「练习/考试」双模式 + 5 种题型 + 交卷后原文 + 地图配图）＋修 CSP（img-src/media-src 放行 static.9fnnn.com，否则远程 mp3 与配图全被拦）＋修匹配题「同一字母不可重复用」的判分 bug＋地图配图去掉 loading="lazy"（懒加载+无宽高 → 图到位时把题目整块推下去）。bank.js → 20261011p。上一版 v325 同批首发（去 lazy）。
// 10/5 14:35 设置页合并目标分数+口语自评 + 删竖排版本标记 + 顶栏显昵称（common.js/settings.js 改版）
  // 10/4 19:20 题库卡片「显示不全、被截掉一截」（她 19:10 报，点名「住所」与「对结果开心的重要决定」，说了好几遍）
//
//  根因（探针 tests/_verify_bankcards.cjs 实锤，不是猜的）：
//  卡片原来是**四块横排** rail | main | tags | go，而 .sp-card-main 只有 min-width:0（可无限压缩）。
//  英文标题一长（"An important decision you were happy with"）空间就不够，于是：
//    ① .sp-card-title 的 white-space:nowrap + overflow:hidden + text-overflow:ellipsis
//       -> 标题真的被**切**成一行加省略号（她说的「被截掉一截」）；
//    ② .sp-card-tags 的 max-width:46% + overflow:hidden + flex-wrap:nowrap
//       -> 标签被**硬切**（P2/事件 后面还有标签就看不见）；
//    ③ 圆箭头 sp-card-go 被挤到**下一行、又绕回最左**（实测 x=14 而卡右缘=377、topGap=94）。
//
//  修法（speaking.js 结构 + speaking.html 样式）：
//  · 结构改**两栏**：左栏竖排（标题 / 中文 / 标签，全在 .sp-card-main 内）+ 右栏只有箭头。
//  · 标题**允许换行**（去 nowrap+ellipsis，加 word-break:break-word）—— 长标题只会让卡变高。
//  · 标签**允许换行**（去 max-width:46% / overflow:hidden / nowrap）。
//  · align-items 改 flex-start，箭头与标题首行齐平。
//  ⚠️ 一句话判据（以后别改回去）：**卡片可以变高，但绝不切内容、绝不错位。**
//
//  🔴 顺带挖出一条 10/3 的历史隐患：窄屏块里有一条
//     `.sp-card-row{flex-wrap:wrap} + order:1/2/3`（当时为「把标签换到第二行」加的），
//     它假设 **.sp-card-tags 是 .sp-card-row 的直接子元素**。结构改成两栏后这条规则反噬：
//     flex-wrap:wrap 把箭头甩到第二行绕回最左、order:3 + flex:1 1 100% 把标签拉满整行留白。
//     已删（两栏结构下标题/标签自己就会换行，不需要任何 order / wrap）。
//
//  探针 _verify_bankcards 25/25：88 张卡零裁剪/零越界/零错位；她点名的两张卡逐项完整；
//  箭头全部贴卡内右上；长标题换行不裁；四档频次色条 + 三分组 + 点卡进详情全没坏。
//  回归 题库 B 31/31 · coach3 21/21 · hubpages 56/56 · p2B 18/18。
  // 10/4 18:42 组页改成**完整页面**（她 18:41 原话：「我不要这样子弹起来，我就要一整个界面就行了」）
//  上一版是底部弹出的浮层（#dockGroupSheet / .dgs-*），她不接受 —— 已整套删除。
//
//  现在：底部 4 格**全部是 <a> 直达整页**
//    首页 -> home.html（直达）
//    计划 -> plans-hub.html（组内：计划 / 计时）
//    学习 -> study.html（组内：单词 / 口语 / 写作 / 句子）
//    我的 -> me.html（组内：回顾 / 会员 / 设置 + 服药仅开启时）
//  组页里每张卡点进**原页面**（plans.html / timer.html / speaking.html …），原页面零改动。
//  三页共用 js/hubgroup.js，组定义在脚本里的 GROUPS（唯一数据源）；
//  差异只有 body 上的 data-hub-group + <title>。加第四个组页 = 加一个 HTML + GROUPS 加一条。
//
// 🔴 本批踩到三个坑（都在 hubgroup.js，已写进注释）：
//  ① **软导航只换 <main>，不动 <body> 的属性** —— 靠 body[data-hub-group] 认组会拿到上一页的值，
//     探针实锤「从底部『计划』格进组页 → 卡片 0 张 + 显示『页面配置有误』」。
//     修：hostGroup() 改成**从 URL 文件名认**（body 属性只作首屏双保险），并认 _hubCurrentFile。
//  ② **软导航时 pushState 可能还没发生**，脚本执行那一刻 location.pathname 还是上一页 ——
//     所以 boot() 的门控要等**两个**条件：PAGES 可用 **且** hostGroup() 认得出组，否则继续等（≤4s）。
//  ③ **跨组软导航会显示上一组的内容**：study -> plans-hub 时旧卡列表还留在 <main> 里，
//     探针实锤「点『计划』落地 plans-hub.html 但 h1=学习、4 张卡」。
//     修：window.__HUBG_WATCH 单例注册一次「组变了就重画」，监听 <main> 子树变化，
//     render() 写 data-shown-group 供比对。
//
//  另外 pageScriptSources 修了一处：组页**没有** js/{id}.js（共用 hubgroup.js），
//  原 `if(mainIdx === -1) unshift(mainSrc)` 会硬塞一个 404 进去 —— 改成 doc 有声明就不补。
//
//  探针：_verify_hubpages 56/56（三页渲染/项数 2·4·3+服药/四格全 <a>/浮层已绝迹/
//  跳原页 + 高亮跟随/跨组软导航/侧栏与旧弹层未坏）· _verify_dockgroup 25/25（改整页口径）
//  回归 mobile4 29/29 · settings_tap 30/30 · 题库 31/31
  // 10/4 17:55 移动端 dock 分组重构（她 17:12 提 + 17:54 拍板「甲版」）
//  病根：旧 dock = 4 格 +「更多」，13 个页面里 **8 个全藏在「更多」弹层**（vip/review/corpus/
//        writing/timer/settings/meds/wrongbook）—— 句子、写作、计时这些**每天都要用**的
//        页面被埋到第二层。她 12:10 报过一次「入口找不到」，这次彻底重做。
//
//  新结构（GROUPED_DOCK，js/common.js 单一数据源）：
//    首页 → 直达 home.html（她 17:12「第一个是首页是确定的」；组只有 1 项，弹面板是多余一跳）
//    计划 → 组：plans / timer（她原话「计划和计时也可以放在一个板块」）
//    学习 → 组：practice / speaking / writing / corpus（17:54 拍板：不含计时）
//    我的 → 组：review / vip / settings + meds（**服药仅在 medsModuleOn() 时出现**，她 17:54「平常不开着」）
//    错句本 wrongbook 按她 17:54「我的里面没有这个错句本」**从组里移除**，
//      但**页面/侧栏入口一律不删**（她自己以后想用还能进；想加回「我的」组随时可以）。
//
//  🔴 三处必须记住的坑：
//   ① updateActiveNav 的高亮**不能**再靠 `.ui-menu-item[data-id]` —— 组按钮是 <button>、
//      没有 data-id，只在直达型上。原写法会让软导航后 dock **一个都不亮**（探针实锤：
//      从学习组点进 writing.html，路径对了但 dock 全灰）。修：抽出全局 dockGroupOfPage(file)，
//      首屏高亮与软导航高亮**共用这一个判定**，避免两处口径漂移。
//   ② 旧「更多」弹层**不能删函数**（openMoreSheet 被侧栏/反馈入口引用，删会连带炸 3 处调用点），
//      只把 moreIds 算空 → 退化成「只放意见反馈」。
//   ③ ensureDockGroupSheet 建面板前必须 document.body.classList.remove('dgs-open') ——
//      软导航换页时若上一轮面板还开着，遮罩会留在 DOM 里挡住全页点击
//      （onbOverlay 10/3 同类事故：页面能开但什么都点不动）。
//
//  探针 tests/_verify_dockgroup.cjs 36/36（4 格结构 / 三组项数 2·4·3（+服药=4）/ 三种关闭方式 /
//  软导航高亮跟随 / 跳转真的到位 / 13 个页面里 12 个可从组到达、仅错句本不可达 / 桌面侧栏与
//  旧弹层未坏 / --dock-h 仍实测写入）。回归 mobile4 29/29（口径已改：底部无 [data-more] 了）。
  // 10/4 17:20 陪练三修（她 17:12 手机截图逐条报）：
//  ① 每条 AI 气泡头像都是考官头像（她说「只有第一个对话框头像是那个头像，第二个就不对了」）
//     根因：AV_AI 曾是**字符串常量**、img.src 写死空串，initExamAv 的 sync() 只在 build() 后跑一次
//     -> 之后 assistantHtml() 每次新建的气泡都带空 src -> 露学士帽兜底。
//     修：AV_AI 改成 **函数 avAiHtml()**，每次生成当场读 window.avExamSrc()（与 avMeHtml 同思路）。
//  ② 「思考中」气泡（她说「他思考的时候得有个对话框在思考的动画」「文案要多个备选」）
//     原来只有发送键文字变「思考中…」，聊天区完全没动静。
//     新增 showThinking()/hideThinking()：3 个跳动圆点 + 8 条随机文案（她要「不要固定一句」）；
//     🔴 失败分支必须 hideThinking()，否则思考中会留在屏幕上冒充答案。
//  ③ 输入框与发送键齐平 + placeholder 垂直居中（她说「框看着非常不规整」）
//     根因：.coach-cbox 靠 padding 撑高、textarea 又是 height:38px + padding:8px 0 -> 两者不等。
//     修：统一 44px 固定高 + flex 居中 + padding 归零；发送键 align-self:stretch。
//     ⚠️ 连带回归（探针 coachB 实锤）：textarea 自身盒高 = 行高 ≈22px，
//     **远小于 36/44px 触控标准**（探针量到的就是它）-> 必须 min-height 撑起来，
//     否则「视觉居中」修好了、「点击命中区」却破了。
//
// 🔴 探针坑（本批）：route 挂起后再 unroute 换 401 会抛「Route is already handled」未捕获异常
//    -> 用**一个 route + 可变 mode 变量**，永不 unroute。
//    验「多文案随机」不能对**同一个**思考节点重复采样（它只创建一次，必然永远是同一句）
//    -> 必须反复「触发 -> 采样」，攒够样本。
  // 10/4 16:50 设置页「改了个寂寞、依旧点不动」（她 16:40 报）—— 三件事：
//
// ① 🔴 真 bug：自动保存**只绑 change**。change 只在「值改变且失焦」时触发，
//    她填完不点别处就切走 = **没保存、一刷新就没**，观感正是「点不动、没反应」。
//    探针实锤：逐字 type 后不点别处 -> DATA.settings.targets 恒为原值。
//    修（js/settings.js）：AUTO_SAVE_IDS 逐个绑 **input + change**（防抖 600ms 不变）。
//
// ② 标签交互反馈（她 16:00 同类抱怨：交互效果不见了）：
//    - :active 补深底 primary-700 + 白字 + scale(.94)（原规则只有 --n-100 浅灰 + .985，几乎看不出）
//    - 新增 #setNavHit 滑动指示条（微信分段控件同款），随当前标签滑动
//    - 切组时命中的面板重播 setPaneIn 入场动画（淡入 + 轻微下移）-> 形成「换了一屏」的感知
//
// ③ 🔑 新增**常驻版本标记** #setVer（右上角竖排极小字 v1004a，窄屏隐藏）——
//    她两次报「改了没生效」，根因都是跑着旧缓存；有了自证标记，以后一眼看出版本，不用来回猜。
//
// ⚠️ 探针方法论教训（本批踩了两轮）：
//  a) 上一批用 page.click()（鼠标）测出「4/4 切组成功」就收工 —— 她用**手指**。
//     本批全改用 page.tap()（真 touch）重测，方法对了才能定位到真问题。
//  b) 读页面全局 DATA 必须用【裸 DATA】；window.DATA 从未赋值（顶层 let 不挂 window）恒 undefined。
//     我写 window.DATA && ... 拿到 null，误判「输入没保存」，白查 20 分钟。
  // 10/4 16:10 陪练页整体改版（她 16:00 拍板四条，逐条对应）：
//  ① 「AI口语教练 几个字肯定要左边对齐的呀，不可能是放在中间的」
//     -> #coachTop 由 justify-content:space-between 改 flex-start，按钮自己 margin-left:auto
//  ② 「这个界面就是模仿微信聊天页面的那个界面」+「也可以弄一个卡片呀，其他页面不都是有卡片的吗」
//     -> 新增 #coachCard 白卡壳（圆角+阴影+border），顶栏/聊天区/输入条全收进卡内；
//        卡内聊天区浅灰底(--n-100)衬托白色气泡，顶栏与输入条留白 -> 层次分明（微信同款观感）
//  ③ 「这个什么本地教练台那个东西，放在右边。哎。」
//     -> #coachCtx 从常驻 274px 面板改成**右侧抽屉**（absolute 浮层 + translateX 进出 + 遮罩）
//        默认收起，聊天列吃满整张卡片；点遮罩/Esc 也能收起（onbOverlay 10/3 同类教训）
//  ④ 顺带把 #coachCol 的 max-width:760px 放开（旧值在 flex 里让聊天列只占 425px）
//
// 🔴 三处权重陷阱（都实测踩到）：
//  a) #coachBar 的 position:fixed 来自 speaking.html:1048（无 #coachView 前缀，权重 0,1,0）
//     -> 改版块必须显式写 position:static + left/right/bottom/z-index 全清，不依赖书写顺序
//  b) 旧块 :1395  权重 (0,3,0) 会压住抽屉态，
//     且带着 position:static / max-height:50% / overflow:hidden / margin:10px 0 四个致命残留
//     -> 抽屉三态全部提到 (0,4,0)：，并显式清掉那四条
//  c) .coach-ctx-mini{display:none}（:1400）会把抽屉整个藏掉 -> 抽屉态改 display:flex 保持挂载
//
// ⚠️ 一次性迁移：settings._ctxDrawerV1 标记（未登记 SYNC_SETTINGS_FIELDS = 设备本地 UI 偏好，
//   跨设备不同步是**要的**）。条件写成 `=== undefined || === false` 会把用户主动展开的状态也改回收起，
//   变成「点开一刷新又关」（探针实锤）—— 必须用独立标记字段而非值判断。
  // 10/4 15:45-15:50 她拍板新增「＋ 添加素材」（素材卡结果页底部第三个按钮）+「导入整理」独立入口：
// 场景（她原话）：「我自己可能也有一套已经准备好了的素材，就不需要这个平台给我生成素材了」
// 「自己写一些素材，然后点击AI可以自动帮我整理成几个万能素材，然后给我套」
// 两个入口，同一套整理口径（tryBatch 第 4 参 isImport）：
//  A. 问卷页「我已经有素材了，直接导入整理」= 整库替换（她的既有素材是唯一真源）
//  B. 结果页「＋ 添加素材」= **追加**（已有素材一张不丢），两个选择：
//     B1「直接加上去」= **零 AI 调用 / 零额度 / 零等待**，原文做卡；逐段判中英，
//        纯英文进 storyEn（能背）、含中文进 logicZh（等她写或用 AI 补）
//     B2「AI 智能生成」= 调 genMaterialsBatch(..., true) 整理成故事 + coverage
// 纪律：① 严禁编造素材里没有的事实 ② 人称一律视为考生本人 ③ 纯英文按 5.2 原样保留
  // 10/4 14:45 P0-2（她 14:45 截图「点了重新出题还是旧卡、prompt 没用」）—— 上一批只治了 symptom，没治根：
// 根因：store.plan 存在 localStorage 里，页面只判断 bankVersion（换季才提示）→
//  14:00 改的是**出题算法**不是题库（都 v15）→ 判断永远 false → 旧 plan 一直赖着，
//  她的 8 张旧卡原封不动继续渲染，看着就像「prompt 改了也没用」。
// 修法（materials.js + speaking.html 样式）：
// ① plan 里写独立算法版本号 PLAN_ALGO=2，渲染层按 algo 独立判定 stale → 旧卡一张不渲染 + 顶部强制重出提示
// ② 旧卡答案全量搬进 _legacy（抽成 harvestLegacyFromStalePlan，渲染时与重出时各调一次）
// ③ doPlan 失败分支：stale plan 不再算「可用旧 plan」→ 直接进 freeMode，**绝不把旧卡留在专属经历位冒充新题**
// ④ freeMode 分支必须排在 algoStale 前面（否则失败后那段永远执行不到）
  // 10/4 14:15 移动端一批（她用手机实测报的问题，探针逐条实锤）：
// ① 设置页「点不了」= 假象：深绿框下还压着「设置」标题 + 「共 4 组…」说明共 92px，
//    内容区只换一小段 → 观感等于没反应。已删那两行（.set-head 整块），并让切组后
//    视口回到 sticky 导航条下方（不调视口 = 站在原地看内容变），选中态加 inset 标记条 + :active 反馈。
// ② 「更多弹不出来」= 假象：功能正常（能弹/7 项/能关），但遮罩 .35 黑 + 弹层与页面底色太像。
//    已加深遮罩 .5 + 模糊 + 描边 + 顶部拖拽条，JS 零改动。
// ③ 题库页「有些卡没有绿条」= 真 bug：只定义了 ultra/high 两档色条，medium(31)+low(26)=57 张
//    落回灰色 var(--line)。已补四档递进色 + 无 data-freq 兜底。
// ④ 题库页「两个箭头」= 真 bug：10/1 旧规则 .sp-card::after 画了一个裸箭头伪元素，
//    与 10/3 B 版的真箭头 .sp-card-go 重复。已删伪元素及其 26px 占位 padding。
// 全站 common.css buster j->a（14 页全量）
  // 10/4 13:43 P0 修串题出题「完全不看题库」（她 13:43 报「出的题跟上个赛季我自己弄出来的素材库相关、问的根本不是题目」）。
// 根因一 materials.js:607-613 换季重规划时把旧卡已填答案整段拼进 prompt 并要求 AI 沿用 -> AI 被旧素材牵着走；已整段删除。
// 根因二 SYS_PLAN 只喂 P2（她口径：P1 只给人设卡用，出题纯 P2）；卡片数 4~8 -> 10~14；新增 title 必须是疑问句硬规则 + 前端 ensureQuestionTitle 兜底。
// 旧卡答案不删：全量进 answers._legacy，页面新增常驻入口「我以前填过什么（N 条）」可查可复制，但不再 prefill 到新卡。
  // 10/4 10:50 P0 修她 10:08 报的三处（①陪练弹层完成/✕点不动 ②计划页诊断卡 ③会员页渲染）
  // 🚨【①陪练弹层「完成/✕/我·考官页签」全点不动】探针 _diag_av_dbg.cjs 实锤：
  //    avBindDelegated 里我上一版加了「本页要有任一头像入口才绑」的守卫 —— 但**陪练页的头像按钮
  //    是切 tab 时coach.js build() 才动态插进去的**，而 av-picker 的 ready 早于那一刻 →
  //    守卫判定「无入口」→ **委托从未绑定**（`__avDelegated` 一直是 undefined）。
  //    修法：**无条件绑定**（靠 closest() 命中判断），元素何时插进来都生效。
  //    顺带：avBind 改逐元素幂等（el.__avBound）—— 原来用全局标记会把后来插入的元素永久排除；
  //    avOpen/avClose 同步 #coachExamAvBtn 的 aria-expanded（initExamAv 轮询靠它判断）。
  // 🚨【③会员页四张卡全空白（只剩状态卡）】**这是我 10/4 01:45 那版 .rv 进场动画的严重失误**：
  //    CSS 把 .rv 硬编码成 opacity:0，等 IntersectionObserver 加 .in 才显示，而那段脚本
  //    写在 `</body>` 之后、`</html>` 之后（位置不对没跑到）→ **卡片永久隐身**。
  //    修法（三重保险，从根上不可能再藏内容）：
  //      ① CSS 改成 `.js .rv{opacity:0}` —— 默认可见，只有 JS 可用（html.js）才隐藏；
  //         两页 <head> 最早期加 `document.documentElement.className+=' js'`
  //      ② 脚本移到 </body> 之前（vip.html 那份原本在 </html> 之后）
  //      ③ 1.2s 兜底：observer 没触发就全显示；仍有 .rv 没显示则**摘掉 js 类**让 CSS 回落可见
  // 探针：avatar 32/32 · settingsB 44/44 · quality_c 14/14 · coachB 39/39（本地全绿）
  // ⚠️ 探针坑：本地静态服**不认**无扩展名 URL（线上 CF Pages 才做 .html→/重写）→
  //    探针要能同时跑本地和线上，就把 URL 写成 .html，线上靠等待时长兜（≥5s）。
  // 版本 av-picker.js 20261004b→c · common.css i→j（14 页全量）。SW v202→v203。
  // 10/4 10:25 头像弹层交互加固（她 01:44 报「设置页头像点了没反应 / 弹层里完成和✕点不动 / 我这个字也交互不了」）
  //探针 _diag_nav.cjs 抓到关键：线上 `/settings.html` 会被 **Cloudflare Pages 301 到 `/settings`（实测 3 次导航）**，
  //   弱网下 boot() 可能跑在导航前的旧文档里 → 事件绑在已被丢弃的节点上，点什么都没反应。
  // 修法（av-picker.js + coach.js）：除原有直接绑事件外，**再加一层 document 级事件委托**
  //   （capture 阶段 + __avDelegated / __coachAvDelegated 幂等标记防重复绑）：
  //   节点被 CF 跳转丢弃重建后，委托依然生效。并加 setTimeout(1200) + window load 兜底重绑。
  //⚠️ 教训：跑多个探针别共用同一个端口（并发污染会报出假 FAIL，
  //   我一度以为「加固导致重复触发」，单独复跑是 32/32 全过）。
  // 版本 av-picker.js 20261004a→b（settings + speaking）· coach.js 20261004a→b。SW v201→v202。
  // 10/4 09:55 修她 01:44 报的三个交互 bug + 题库页 A 版（她 01:10 授权自选 A=分区清晰）
  // 🚨【P0 头像弹层全线失灵】根因：js/av-picker.js **不在 SW 的 PRECORE 名单里** → 只走 network-first，
  //    弱网/离线时拿不到或拿旧版 → 表现：设置页点头像没反应、陪练页弹层里「完成/✕/我页签」全点不动。
  //    探针 outputs/design/_repro_avatar_bug.cjs 复现：本地全正常、线上点头像直接触发页面跳转（导航毁上下文）。
  //    修法：PRECORE 加 '/js/av-picker.js'（设置页头像 + 陪练考官选择器都依赖它）。
  // 🚨【P0 陪练页手机端自动弹键盘】探针 _diag_focus.cjs 实锤：切到陪练 tab 后 activeElement=TEXTAREA#coachInput，
  //    而代码三处 focus() 插桩计数=0 —— 是 **build() 末尾那行无条件 ta.focus()**（用户还没点任何东西）。
  //    修法：st.userTouched 标记（输入框 focus 事件置位），build/setBusy 只在 true 时才自动聚焦。
  // 🎨【陪练页两处按她 01:44 的意见改】① 开场白改「我是你的口语陪练。今天准备练什么？」（旧版「今天想怎么练都行」
  //    等于没说）；② 窄屏顶栏「它记住的事」→「它记住的 N 件事」（光看旧文案不知道点开会是什么）。
  // 📝 题库页（素材）A 版：① intro 绿条 + 「为什么要填人设」两个绿块合并成一段（8 行常驻→点开才展开）
  //    ② 三步编号（1 人设/必答 · 2 复用素材/选填 · 3 生成）③ 已有素材入口提到顶部常驻（她 00:57 拍板）。
  // 探针：_verify_coachB 39/39 + _verify_coachfix_mobile 9/9 + _verify_coachfix 28/28 + _verify_settingsB 44/44
  //      + _verify_avatar 32/32 + _verify_mock5 35/35 + _verify_mockscore_empty 18/18。
  // ⚠️ 探针坑：教练台宽度由 `#coachWrap:has(.coach-ctx-mini)` + 顶栏文本长度共同决定（实测改 GREETING 一个字
  //    col 就 393→553），「折叠后聊天列变宽」那条断言不稳定 → 改验「右栏宽归零 + 聊天列没变窄」两个不变量。
  // 版本 coach.js 20261003f→20261004a · materials.js 20261002b→20261004a。SW v200→v201。
  // 10/4 01:55 定价页质感丙方案（她 00:19 选丙 = 甲进场动画 + 乙会员页对齐 + 落地页）
  // ① common.css 尾部加两个全站可复用类：.kicker（12.5px/letter-spacing .09em/uppercase/primary-700）
  //    和 .rv 进场动画（opacity:0→1 + translateY(16px)→0，data-d 1/2/3 分级延迟，prefers-reduced-motion 降级）。
  // ② vip.html：四张卡加 kicker（Pricing/Compare/How to/FAQ）+ rv 分级进场；对比表插三行分组表头
  //    （学习功能（会员不独占）/ AI 能力（这里才是会员的核心）/ 数据与设备）——先分组再对比。
  // ③ settings.html：四张 set-card 加 kicker（Profile/Targets/Speaking/Data）+ rv。
  // ④ 落地页 index.html：只给六个 section 补 data-rev（用它自己的 data-rev 动画与 observer，零新样式），
  //    hero「口语不用背稿，写作不用练」文案零改动。
  // ⑤ 更多弹层 .sheet 本来就有滑入动画（translateY 100%→0），零改动。
  // 零功能改动、零文案改动（落地页 hero 探针断言原文）、零价格改动、零 AI 调用。
  // 探针 outputs/design/_verify_quality_c.cjs 14/14（kicker 三页 / rv 触发 / 分组表头三行 / 落地页 data-rev / hero 原文）。
  // 版本 common.css h→i（14 页全量）。SW v199→v200。
  // 10/4 01:40 句子页语料表 B 版（她 23:37 选 B「工具条+双栏卡列表」）
  // 表格 → 双栏卡列表：她 22:57 报语料表「手机上特别挤」——表格左中文右英文在 375px 下每列只剩 ~150px，
  // 雅思长难句（普遍 15-30 词）被压成竖排。renderList()（js/corpus.js:192）的 <table> 输出改成 .cc-card 卡片：
  // 桌面「中文左英文右」双栏观感保留；≤560 上下堆叠；删除按钮改右上角 44px 触控（原 36px）。
  // 功能零回归：搜索过滤/空态 renderEmpty/倒序/删除 confirm+墓碑/计数 #corpusCount 全保留。
  // 探针 outputs/design/_verify_corpusB.cjs 16/16（含删除墓碑验证）。
  // ⚠️ 探针坑两个：a) 进语料表视图要用 switchCorpusSub('dict')（corpus.js:692），点文字「语料」的按钮匹配不到；
  //    b) 列表倒序，第一条卡可能是「无英文」的测试卡（cc-en 里是空 span），量中英文布局要挑 en 非空的卡。
  // 版本 corpus.js a→20261004a（仅 corpus.html）。SW v198→v199。
  // 10/4 01:25 计划页重排区丙版（她 23:30 报「重排怪、手机端更怪」+ 00:32 选丙，施工文档 plan/计划页重排区丙版_施工方案_2026-10-04.md）
  // 根因三条（探针 outputs/design/_diag_rb.cjs 量出）：① 提示文字手机端 4 行 80px（桌面 1 行）→ 整条手机 208px vs 桌面 94px
  // ② 「今天只能学 [30] 分钟 [压缩重排]」三元素塞在 inline <span> 里，手机被 flex-wrap 断成两截、中间大片空白
  // ③ plans.html 根本没有 #rbBar 的移动端媒体查询（只有 #diagRoot 的）→ 手机端裸奔
  // 丙版改法：说明压一行 +「时间不够？」开关（rb-numwrap 只用 CSS class 控显隐，HTML 不加 hidden —— 两者叠加会失灵）
  // + 主按钮改 btn-primary（此前用的 .btn.pri/.btn.sec 在 common.css 里不存在！真实变体是 btn-primary/btn-ghost）
  // + 移动端媒体查询（≤640 上下堆叠、主按钮满宽）；diagRebalance / setRbBusy 的 rbBusy 锁一行未动（只改文案 + 加 #rbMore 禁用）
  // 顺带：填过分钟数则默认展开（否则用户以为值丢了）；Esc 可收起；展开后焦点落 rbMin。
  // 探针 outputs/design/_verify_rb.cjs 24/24。⚠️ 探针坑三个：
  // ① diagRebalance 有两个前置：DATA.settings.diagnosis 缺 → toast return 不发请求；
  //    diagCapacity（plans.js:940）读 d.wdHours/weHours，缺 → wdMin=0 → capMin=max(10,min(45,0))=10，
  //    看起来像「没读到45」实际是容量上限为 0（假 FAIL）。
  // ② 判「同一行」要比【垂直中心】不是顶部：按钮 44px vs 文字 20px，基线对齐时顶部必然差 ~12px（我第一版误判）。
  // ③ #rbMin 是静态 DOM，reload 后值本来就不留 → 不能验「reload 后值还在」，只能验同会话内展开态保持。
  // 版本 plans.js a→20261004a（仅 plans.html）。SW v197→v198。
  // 10/4 01:10 登录页左栏 A 版（她 01:02「登录页用A方案」）—— 一整块深色大字 + 四条真实功能。
  // 【背景】她 00:29 提「左栏写的是不痛不痒的点，改成真正卖点」；我第一版把「7天卡¥19（原价¥39）」写进左栏，
  //      她 00:34 发火：「谁家好人在登录页提收费」→ 已 git checkout 回滚，本版**零价格零套餐**（价格只属落地页/会员页）。
  // 【A版结构】深色大字块 =「这个网站，是 / 一个正在备考雅思的人给自己做的 / 备考踩过的坑都做成了功能」
  // 10/4 11:35 她拍板：去掉原句里的个人考试日期（对用户无意义），保留「作者也在备考、为提效而做」
  //      (1) 这条是最强差异化——机构/产品都说不出「我自己在备考」这句话。
  //  下面四条功能（全部 grep 核实站里真有其功能，非编造）：
  //      ① AI 定制备考方案（诊断 diagnosis + 每日重排 REBALANCE_AI_SYSTEM 两条 AI 线）
  //      ② 口语串题（素材卡对照当季题库算 coverage）
  //      ③ 题库分高低频（ultra/high/medium/low 四档，超高频优先背）
  //      ④ AI 陪练口语（读完你的故事才追问，难度跟着你变）
  //  底部一行真实数据背书「当季 88 个话题卡 · 223 个 P2 考点 · 题库已迭代 15 版」（探针 outputs/design/_diag_bank_size.cjs 实测，
  //      取代旧的「100 题 / 570 词」——那两个数是虚的且过时）。
  // 【顺带修】右栏表单卡加了「为什么要登录」说明（不登录数据只在本机、清缓存/换设备就没了），
  //      把左栏变高后右下角的空白填实；.form 改 flex 垂直居中。
  // ⚠️ 坑：login.html 是**独立精简 token 集**（只有 --p-50/100/200/500/600/700/900 与 --n-0/300/500/600/700/900），
  //      **没有 --primary-400 / --primary-50**（那是 common.css 的全站 token）→ 第一版写了会取不到色，已改成 --p-200 / --p-50。
  //      改 login.html 前先 grep 它的 :root 定义。
  // 探针 outputs/design/_verify_loginbrand.cjs 29/29 + _verify_loginfrom.cjs 12/12（回跳逻辑零回归）。SW v196→v197。
  // 10/4 00:50 P0 修模考报告「未作答不扣分」（她 00:38 报「P1 全部跳过、P2P3 答得一坨，结果还给我打 5.5」）
  // 🚨 根因（探针 outputs/design/_diag_score_empty.cjs 实锤）：js/mock.js:646 用 (a.transcript || '(空)') 拼 block，
  //    P1 全未答时拼出的 block 仍非空（98 字符，因为还有 Q: 题面）→ 唯一防线 if(!block.trim()) return null 拦不住
  //    → 照样调 AI → AI 面对一屏「(空)」按默认中位给 5.5 → 总分 (5.5+P2+P3)/3 把真实水平拉平。
  //    同时 fixes 里出现根本没作答的题的编造点评（她截图里 About more than 10 years → More than 10 years）。
  // ✅ 修法（她 00:38 拍板两个口径：①未答按比例扣 FC ②整 Part 全空给最低分 4 并单列）：
  //   ① 先按实际作答筛（allQ/answered/skipped 三个计数），只把真作答的题送 AI，未答的连 block 都不进
  //   ② 整 Part 全空 → 直接返回 {fc:4,lr:4,gra:4,unanswered:true}，不调 AI、不参与总分平均
  //      （mock-report 渲染成虚线卡 +「未作答 · 不计入总分」）
  //   ③ 部分未答 → p.fc = Math.max(4, before * answered/total) 对齐 0.5 步长，只调 FC
  //      （LR/GRA 靠实际用出来的词句，答了的题不受影响），summary 里明写扣分来源
  //   ④ prompt 加 CRITICAL 规则：只评 input 里出现的题，未作答的题绝不编造点评（输入侧已过滤 + prompt 再禁一句）
  //   ⑤ 总分区标清口径「总 Band（仅含已作答的 Part · 作答 4/14 题）」+ 作答率 <60% 时黄色可信度提示
  //      （这个总 Band 只能代表你答过的那部分水平）+ 删掉死代码 partOv
  // 探针 outputs/design/_verify_mockscore_empty.cjs 18/18（旧 bug 复现 + 新逻辑 + 报告渲染口径 + 源码六项校验）
  //   + 回归 模考 35/35 · P2 18/18 · 题库 31/31。
  // ⚠️ 探针坑：MockReport.render(report) 返回 HTML 字符串、不写进 DOM（mock-report.js:168），
  //   探针要读返回值而非 #mockReport.innerHTML（第一版就踩了，4 条假 FAIL）。
  // 版本 mock.js b→20261004a · mock-report.js 20260830u→20261004a · common.css g→h（14 页全量）。SW v195→v196。

/* 核心壳预缓存清单（Node 脚本枚举目录生成，2026-09-20；与 14 页实际引用核对无遗漏）。
   不含 js/vendor/xlsx.full.min.js（861KB 体积大 → 走运行时 SWR 缓存）。 */
const PRECORE = [
  '/corpus.html',
  '/errorbook.html',
  '/index.html',      // 9/30：根 = 落地页（产品介绍），仍要能离线打开
  '/home.html',       // 9/30：学习主页由 index.html 改名而来（离线回退壳也用它）
  '/login.html',      // 10/1：独立登录页（落地页底部引导键/右上角登录键都跳这里）
  '/beginner.html',   // 10/10：新手入门页（落地页「first time?」入口）。必须进 PRECORE —— 不进则弱网/直访会被回退成 index 壳
  '/materials.html',
  '/meds.html',
  '/pattern-drill.html',
  '/plans.html',
  '/practice.html',
  '/review.html',
  '/settings.html',
  '/speaking.html',
  '/timer.html',
  '/writing.html',
  '/wrongbook.html',
  '/bank.html',       // 10/11：题库页（学习组第 5 成员）。不进 PRECORE 则弱网/直访会被回退成 index 壳
  // 10/4 18:42 三个组页（必须进 PRECORE：直接访问/弱网时否则会被回退成 index 壳，
  // 表现为「页面不存在跳回主页」—— 10/1 她撞过一次同款事故）
  '/plans-hub.html',
  '/study.html',
  '/me.html',
  '/js/hubgroup.js',
  // 10/5 15:25 站长面板 admin.html 必须进 PRECORE —— 她 15:24 报「手机端打不开」。
  // 病根：① CF 会 308 把 /admin.html 跳到 /admin，而缓存键是 pathname（带 .html）→ 跳转后 caches.match 拿不到；
  //       ② /admin.html 不在 PRECORE，弱网/离线时 handleNavigate 拿不到缓存 → 掉进 '/home.html' 兜底
  //          → 手机上表现为「打不开」或「莫名跳到学习主页」（与 10/1 她撞过的 index 壳事故同款）。
  // 预缓存 /admin.html 而不是 /admin：PRECORE 走 cache:'reload' 请求的是真实文件路径，
  // 而 CF 只对 .html 文件名做 308 —— 两者一致才能在跳转后仍命中缓存。
  '/admin.html',
  '/vip.html',        // 10/1 付费方案：会员中心页（价格/权益/开通流程）
  '/css/common.css',
  '/js/av-picker.js',  // 10/4 09:30 补缓存：设置页头像弹层 + 口语陪练考官选择器都依赖它。
                       // 之前只在 network-first 名单里 → 弱网/离线时拿不到或拿旧版，
                       // 表现是「点头像没反应」「弹层里完成/叉/我页签全点不动」。
  '/js/common.js',
  '/js/corpus.js',
  '/js/data.js',
  '/js/bank.js',      // 10/11：题库页目录脚本。⚠️ bank/manifest.json 与 bank/*/*.json 不进 PRECORE（415 篇体积大，运行时 SWR 按需拉）
  '/js/feedback.js',
  '/js/dhp_policy.js',
  '/js/history.js',
  '/js/index.js',
  '/js/materials.js',
  '/js/meds.js',
  '/js/mock-history.js',
  '/js/mock-report.js',
  '/js/mock-summary.js',
  '/js/mock.js',
  '/js/pattern-drill.js',
  '/js/plans.js',
  '/js/practice.js',
  '/js/progress.js',
  '/js/review.js',
  '/js/scene-drill.js',
  '/js/scores.js',
  '/js/sentence-drill.js',
  '/js/settings.js',
  '/js/speaking-practice.js',
  '/js/speaking.js',
  '/js/sprint.js',   // 10/7 补进 PRECORE：回顾页模考 Tab 的考前冲刺卡，一直漏着。
                     // 漏的原因 = 审计脚本 tests/_audit_class_names.cjs 自己的 PRECORE 正则是坏的
                     // （从注释里首次出现的 'PRECORE' 开始抓 → 一个数组元素都没抓到 → 一直误报「全漏」，
                     //  反而把这种真漏淹没了）。修好脚本后才第一次看到真实的唯一缺口。
  '/js/coach.js',
  '/js/timer.js',
  '/js/vip.js',
  '/js/wordbank.js',
  '/js/words.js',
  '/js/writing.js',
  '/js/writing_prompts.js',
  '/js/wrongbook.js',
  '/data/materialsets.json',
  '/data/official-banks/awl.json',
  '/data/patterns.json',
  '/data/scenes.json',
  '/data/sentences.json',
  '/data/writing_prompts.json',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

/* HTML 导航 network-first 的网络超时（弱网 4s 拿不到就回退缓存，绝不让用户干等白屏） */
/* 10/8 晚 4s→10s：她的网络到 pages.dev 经常 >4s，此前每次加载都在 4s 处放弃回落旧缓存，
   = 她永远拿不到新版 HTML 的第二把锁（第一把 = install 挂起，已修）。race 首个成功即返回，
   快网络不受影响；只有慢网络时多等几秒换来「必然拿到新版」。 */
const NAV_TIMEOUT_MS = 10000;

let _swIsUpdate = false;   // 10/8 晚：install 时记录本次是「更新」还是「首次安装」，activate 只在更新时迁移旧页面

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    _swIsUpdate = !!self.registration.active;   // 已有 active SW = 本次是版本更替；无 = 首次安装
    const cache = await caches.open(CACHE);
    // 逐条预缓存且单条失败不炸整体（cache:'reload' 绕过 HTTP 缓存拿部署源最新）：
    // 某一条 404/弱网失败只丢那一条的离线可用，不能让整个 install 失败导致 SW 永远装不上
    // ⚠️ 10/8 晚致命修复：慢网络下单条 fetch 可能无限挂起（不报错不返回）→ await 永远不结束
    //    → skipWaiting 永远不执行 → 新版本永远不接管 → 用户无论怎么刷新都卡旧版（她 10/8 晚实锤，
    //    无痕窗口正常+正常窗口卡旧版=唯一能解释的机制）。每条加 10s 硬超时，install 最坏 ~10s 必完成。
    const fetchPrecache = async u => {
      try{
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 10000);
        const res = await fetch(u, { cache: 'reload', signal: ctl.signal });
        clearTimeout(timer);
        if(res && res.ok){ await cache.put(u, res); }
      }catch(_){ /* 单条失败/超时静默：只丢该条的离线可用 */ }
    };
    await Promise.all(PRECORE.map(fetchPrecache));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 删除所有非当前版本缓存（含历史 v1~v13）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 通知已打开页面「SW 已更新」。
    // 10/8 晚升级：她要求「刷新之后立马可以用」——**仅版本更替时**（非首次安装）旧页面由新 SW 接管后
    // 直接被导航到新版（Client.navigate 走新 SW 的 fetch handler → 新 PRECORE 必命中），用户零操作。
    // navigate 失败才退回 postMessage 提示条（页面现有「发现新版本」横幅兜底）。
    // 无循环风险：activate 只在版本更替时触发一次，重载后的页面不会再触发 activate。
    try{
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => {
        try{
          if(_swIsUpdate && c.url && c.url.indexOf(self.location.origin) === 0 && typeof c.navigate === 'function'){
            c.navigate(c.url).catch(() => { try{ c.postMessage({ type: 'SW_UPDATED', version: CACHE }); }catch(_){} });
          } else {
            try{ c.postMessage({ type: 'SW_UPDATED', version: CACHE }); }catch(_){}
          }
        }catch(_){}
      });
    }catch(_){}
  })());
});

/* ---- 工具：响应是否可入缓存（只缓存同源 200 全量响应，防 206/opaque 混入） ---- */
function cacheable(res){
  return res && res.status === 200 && res.type === 'basic';
}

/* ---- 工具：把响应写入缓存 ----
   ⚠️ 10/8 晚 关键修复：此前一律按「去掉 ?v= 的 pathname」存 —— 于是版本号形同虚设：
   只要缓存里有一份旧副本，请求任何 ?v= 都命中它、拿到旧文件（她侧「线上是对的/我这边是旧的」
   这个持续两个月的病灶的技术根基之一；Workbox 的默认行为是按**完整 URL 含 query** 缓存）。
   现在：带 ?v= 的按完整 URL 存（各自独立），不带 query 的仍按 pathname 存（预缓存/离线兜底）。 */
function putInCache(url, res){
  const key = url.search ? (url.pathname + url.search) : url.pathname;
  /* ⚠️ 必须先同步 clone：放进 .then 里再造副本时，响应体可能已被页面读走 →
     clone 抛「body already used」被 catch 静默吞掉 = 什么都没缓存（vsemantics 探针②实抓）。 */
  let copy;
  try{ copy = res.clone(); }catch(_e){ return Promise.resolve(); }
  return caches.open(CACHE)
    .then(c => c.put(new Request(key), copy))
    .catch(() => {});
}

/* ---- 分级①：页面导航 network-first（4s 超时）→ 缓存该页 → 缓存 /home.html ---- */
async function handleNavigate(req, url){
  // 网络请求竞速 4s；成功顺手写缓存（后台继续，不阻塞响应路径）
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  // ⚠️ fetch 离线/失败时 netPromise 是「resolve(null)」而非 reject——
  //    必须对「拿到 null」也走缓存兜底，绝不能把 null 交给 respondWith（= 网络错误页）
  let net = null;
  try{
    net = await Promise.race([
      netPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('nav timeout')), NAV_TIMEOUT_MS))
    ]);
  }catch(_){ /* 超时 → 走缓存兜底；netPromise 继续后台完成写缓存 */ }
  if(net) return net;
  let cached = await caches.match(url.pathname);
  /* 10/5 15:25 站长面板：CF 把 /admin.html **308 跳到 /admin**（无扩展名），
     而 putInCache 的键是 pathname —— 首次网络失败时 caches.match('/admin') 拿不到
     （预缓存里存的是 '/admin.html'），就掉进下面的 home 兜底 → 手机上「打不开/莫名跳主页」。
     这里补一次「去扩展名再试」，覆盖所有同类 308 页面（不是只给 admin 打补丁）。 */
  if(!cached && /\.html$/.test(url.pathname) === false){
    const alt = await caches.match(url.pathname + '.html');
    if(alt) cached = alt;
  }
  if(cached) return cached;
  /* 10/5：管理员页面**绝不能回退到学习主页** —— 那既是误导（她会以为自己在看学习站）
     也等于把一个内部工具暴露给误点的人。给它明确 503，附一句人话说明。 */
  if(url.pathname === '/admin' || url.pathname === '/admin.html'){
    const finalAdmin = await netPromise;
    return finalAdmin || new Response('站长面板暂时离线（网络未连通）。连上网络后重试；完整网址 + Ctrl+F5 可强制刷新。',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const shell = await caches.match('/home.html');   // 9/30：离线兜底进学习主页，不再回退落地页
  if(shell) return shell;
  // 缓存全无（如首次访问即弱网）：等网络最终结果，仍失败给明确 503（绝不白屏无响应）
  const final = await netPromise;
  return final || new Response('离线', { status: 503, statusText: 'Offline' });
}

/* ---- 分级②：静态资源 stale-while-revalidate ----
   ⚠️ 10/8 晚 关键修复（?v= 语义）：带版本号的请求 = 内容契约，**精确键未命中必须走网络**
   （CF Pages 对任意 ?v= 都返回当前部署的文件体，所以旧页面请求旧 ?v= 也能立刻拿到新代码）。
   此前无脑 caches.match(pathname) 会把旧副本灌给新/旧任何 ?v= 的请求 → 版本号被架空。 */
async function handleStatic(req, url){
  if(url.search){
    const exact = await caches.match(url.pathname + url.search);
    if(exact){
      fetch(req).then(res => { if(cacheable(res)) putInCache(url, res); }).catch(() => {});   // 后台刷新同 ?v= 副本
      return exact;
    }
    const net = await fetch(req).then(res => { if(cacheable(res)) putInCache(url, res); return res; }).catch(() => null);
    if(net) return net;
    const bare = await caches.match(url.pathname);   // 离线：回落预缓存的裸路径副本
    return bare || new Response('离线', { status: 503, statusText: 'Offline' });
  }
  const cached = await caches.match(url.pathname);
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  if(cached){
    netPromise.catch(() => {});   // 后台 revalidate，失败静默
    return cached;
  }
  const net = await netPromise;
  return net || new Response('离线', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;                    // 非 GET 透传
  let url;
  try{ url = new URL(req.url); }catch(_){ return; }
  if(url.origin !== location.origin) return;          // 跨域（api.deepseek.com 等）透传，不缓存不回退
  if(url.pathname.startsWith('/api/')) return;        // 云同步 API 永远透传
  if(url.search.indexOf('_probe') > -1) return;       // navDeployProbe 部署探针永远透传（保自愈机制有效）

  // ① 页面导航（request.mode==='navigate' 或 .html）→ network-first
  if(req.mode === 'navigate' || /\.html$/.test(url.pathname)){
    e.respondWith(handleNavigate(req, url));
    return;
  }
  // ② 静态资源 → stale-while-revalidate
  if(/\.(js|css|json|png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|mp3|wav|webmanifest)$/.test(url.pathname)){
    e.respondWith(handleStatic(req, url));
    return;
  }
  // ③ 其他同源 GET → network-first 失败回退缓存
  e.respondWith(
    fetch(req).then(res => {
      if(cacheable(res)) putInCache(url, res);
      return res;
    }).catch(() =>
      caches.match(url.pathname).then(c => c || Promise.reject(new Error('offline')))
    ).catch(() => new Response('离线', { status: 503, statusText: 'Offline' }))
  );
});
