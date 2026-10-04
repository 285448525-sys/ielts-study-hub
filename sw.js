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
const CACHE = 'ielts-hub-v218';  // 10/4 00:50 P0 修模考报告「未作答不扣分」（她 00:38 报「P1 全部跳过、P2P3 答得一坨屎，结果还给我打5.5」）——🚨 **根因（探针 outputs/design/_diag_score_empty.cjs 实锤）**：js/mock.js:646 用 `(a.transcript || '(空)')` 拼 block，**P1 全未答时拼出的 block 仍非空**（98 字符，因为还有 Q: 题面）→ 唯一防线 `if(!block.trim()) return null` **拦不住** → 照样调 AI → AI 面对一屏「(空)」按默认中位给 5.5 → 总分 (5.5+P2+P3)/3 把她的真实水平拉平。同时 fixes 里出现**根本没作答的题的编造点评**（她截图里「About more than 10 years → More than 10 years」）。
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
  '/vip.html',        // 10/1 付费方案：会员中心页（价格/权益/开通流程）
  '/css/common.css',
  '/js/av-picker.js',  // 10/4 09:30 补缓存：设置页头像弹层 + 口语陪练考官选择器都依赖它。
                       // 之前只在 network-first 名单里 → 弱网/离线时拿不到或拿旧版，
                       // 表现是「点头像没反应」「弹层里完成/叉/我页签全点不动」。
  '/js/common.js',
  '/js/corpus.js',
  '/js/data.js',
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
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐条预缓存且单条失败不炸整体（cache:'reload' 绕过 HTTP 缓存拿部署源最新）：
    // 某一条 404/弱网失败只丢那一条的离线可用，不能让整个 install 失败导致 SW 永远装不上
    await Promise.all(PRECORE.map(async u => {
      try{
        const res = await fetch(u, { cache: 'reload' });
        if(res && res.ok){ await cache.put(u, res); }
      }catch(_){ /* 单条失败静默：只丢该条的离线可用 */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 删除所有非当前版本缓存（含历史 v1~v13）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 通知已打开页面「SW 已更新」（可选通知：页面现有自愈机制决定是否 reload，SW 绝不自行强制刷新）
    try{
      const cs = await self.clients.matchAll();
      cs.forEach(c => { try{ c.postMessage({ type: 'SW_UPDATED', version: CACHE }); }catch(_){} });
    }catch(_){}
  })());
});

/* ---- 工具：响应是否可入缓存（只缓存同源 200 全量响应，防 206/opaque 混入） ---- */
function cacheable(res){
  return res && res.status === 200 && res.type === 'basic';
}

/* ---- 工具：把响应写入缓存（键 = 去 ?v= 的 pathname，与预缓存统一） ---- */
function putInCache(url, res){
  return caches.open(CACHE)
    .then(c => c.put(new Request(url.pathname), res.clone()))
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
  const cached = await caches.match(url.pathname);
  if(cached) return cached;
  const shell = await caches.match('/home.html');   // 9/30：离线兜底进学习主页，不再回退落地页
  if(shell) return shell;
  // 缓存全无（如首次访问即弱网）：等网络最终结果，仍失败给明确 503（绝不白屏无响应）
  const final = await netPromise;
  return final || new Response('离线', { status: 503, statusText: 'Offline' });
}

/* ---- 分级②：静态资源 stale-while-revalidate ---- */
async function handleStatic(req, url){
  const cached = await caches.match(url.pathname);
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  if(cached){
    netPromise.catch(() => {});   // 后台 revalidate 用原始 URL（保留 ?v=），失败静默
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
