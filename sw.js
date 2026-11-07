/* v412（2026-10-17 · A 窗口 · 性能批第二批】
   1) speaking.html：materials.js / mock-report.js / mock-history.js / mock.js 四个视图脚本
      从首屏 defer 队列摘出，改由 js/speaking.js 的 lateLoad() 在真正切到「素材 / 模考」时
      按需加载（版本串放在视图容器的 data-late-src 上）。首屏少 78KB（压缩体）。
      · 属性放在 <main> 内 —— 软导航只换 <main>，放 body 末尾的配置会在软导航进来时丢。
      · 「素材」切进来先显示「素材加载中…」，脚本到位后由 matGen.init() 接管。
      · load 之后空闲预热一次；弱网下顺序明确让位给首屏（线上 Slow4G：load≈7.7s，
        四个脚本 8087~9411ms 才起 —— 由 tests/_probe_latespk_1017.cjs 钉住）。
   2) 🔴 软导航回归修复（bank.js + speaking.js 同一类 bug，由 _probe_spkmock_1011 的 S6b 抓到）：
      软导航会重新 eval 主脚本、模块级缓存归零 → 绕回本页再点一次会把已加载的脚本**再 append
      一次** → 重复执行 → 抛 "Identifier 'ANCHOR_TABLE_EN' has already been declared"（writing.js），
      materials.js / mock.js 同类。修法：先看脚本暴露的全局产物在不在（typeof window.xxx），
      再把 promise 缓存挂到 window（__wrtLateP / __spkLate）跨 eval 复用。
   3) 运行时追加的 <script> 带 data-late="1"，便于探针区分「首屏声明」与「按需追加」。 */
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
// 10/17 #8 成绩页复盘 + #9 逐题明细落盘：① 成绩卡加一行 meta（correct / incorrect / Time，爱听写实证：成绩页顶部就是一行 meta，不做 48px 大数字卡）+「All / Incorrect only」筛选（只筛底部答题卡、不隐藏题目——隐藏违反她「绝不切内容、绝不错位」判据）；② 交卷后题号行变答题卡（绿 hit / 红 miss，此前只有「已答」黑线态）；③ 逐题解析从「内联平铺」改「可折叠结论条」（原样每题 append .ex-expl 把页面撑爆；且 bank/answers 415 个文件 analyses 命中 = 0，无内容可放，不做解析弹层=不虚构能力）；④ Finish 按钮交卷后改灰底 + 文案 Submitted（原只 opacity:.5、仍是实心 teal、文案不变 → 她 18:3x 报「看着像没交卷」）；⑤ mockRecords 落盘补 detail[逐题] + usedSec + 200 条上限 —— 这是 #9 的真正前提（此前逐题明细只活在内存、刷新即丢）。bank.js → 20261012ab（仅 bank.html）。⚠️ 本轮自查抓到一个自己写进去的 bug：`startTimer` 被 `resumeExam()` 复用（传 EX._leftSec），而我在开头无条件写 `EX._totalSec = sec` → 暂停一次「开局时长」就被改写成剩余秒，交卷工期恒算成 0；已改为只在 `EX._totalSec == null` 时赋值，并把 usedSec 改为总是写（不再 if 判空，字段时有时无会让上层到处判空）。上一版 v407。
// 10/17 #9 层次 2 做题记录落地：回顾页「记录列表」每条记录加「详情」展开块 —— 逐题明细
// （对=绿、错=红，错题格并排给出「正确答案 / 你的答案」）+ 用时 M:SS + 错题数。数据消费
// 上一轮 bank.js 落盘的 mockRecords[].detail[]；🔴 无 detail 的历史记录不渲染入口（不报错）。
// 只在 review.html 内联 CSS + js/scores.js 加渲染，未动 common.js（避免全站 19 页 bump）。
// scores.js → 20261017a（仅 review.html）。上一版 v408。
// 10/17 性能批（网页整体流畅度优化）：本轮先量化再动手，改了「布局跳动」这一项 ——
// 手机 Slow4G + 4xCPU 实测 CLS：bank 0.238 / home 0.332，两页的偏移都**单发占 99%**，
// 且都发生在启动遮罩收起之后（用户完全看得见）：
//   ① bank：`#fullEntry` / `#listenFullEntry` 原先是空 div，manifest（114KB）到了才
//      由 JS innerHTML 注入一张 242px 高的「完整模考」入口卡，把 .partbar / #bankList
//      整体顶下去 258px。改法 = 卡片结构静态写在 bank.html（首帧即有高度），JS 只切
//      disabled 状态 / 数据不足时整块移除 → CLS 0.238 → 0.003。
//   ② home：`#threeThings`（三件事卡）与 section.meta（今日专注/今日待学）上下相邻，
//      而 index.js 的 ready() 开头会 await 官方词库 json；词库激活时该 await 把两卡渲染
//      推到遮罩收掉之后约 2.3 秒 → 卡片撑开 393~490px 把 section.meta 推下去。
//      改法 = 新增「首屏遮罩按住不放」握手（common.js + index.js）：页面置
//      __hubBootHold 表示没画完，画完调 __hubBootRelease 放行 → 位移发生在遮罩还在时，
//      AWL 态可见偏移 0.33 → 0。双向握手防竞态，8s 兜底 setTimeout 未动（绝不卡死遮罩）。
// 未改任何加载策略/脚本顺序（HANDOFF 铁律：defer 顺序是契约，动它会连带出事）。
// common.js → 20261013ad（25 页）、index.js → 20261017a（仅 home.html）、
// bank.js → 20261012ac（仅 bank.html）。上一版 v409。
const CACHE = 'ielts-hub-v814';  // 11-04 v769 = 查词提速（note85）+ v768 = T18（note84）+ v767 = T13 补笔（见下方 _prevCacheNote83）+ v766 = T13-AUDIOPUT-1（note82）+ v765 = SLIM-2 收尾（note81）+ v764 = SW-INSTALL-SLIM-2（idle 补装 92 条 / 4039KB + wd-dict mount 预热）：install 47 条一字未动，剩余 92 条 4039KB 挪到 activate 完成后的 requestIdleCallback 逐条串行补装（独立 Promise，绝不并入 _precoreReady——并进去 activate 就会挂到补装完，瘦身当场白做）；导航进行中让路、3g/slow-2g 与 saveData 不补、单条失败退避 3 次、先查缓存已有副本才拉。js/wd-dict.js 加 warmKeys：mount 时 keyAudio(type) 建 Audio 池（new Audio + preload='auto'）+ correct/error 两条，再对每个元素 volume=0 静音 play() 一次逼出解码，收尾两段定时器（500ms / 3000ms）按 `volume===0 && !paused` 收掉。**不是「只 fetch 不播放」**——它确实 play，只是全程 volume=0 她听不见；keyAudio / keyClick / fb 三个函数体一行未改，她「自动读是产品特性」红线不破。预热集合按音色不同：bubble 9+2=11 条、mechanical 5+2=7 条。缓存落地实测（_probe_slim2_warmonly_1104.cjs 单变量：3g 下 idle 被掐死，只剩 warmKeys 一条路）：mechanical 0/5 → 5/5，总条数 47 → 52，Audio 请求经 SW handleStatic 正常 putInCache。收益口径不变：在线首访一分不省，只在断网兜底与不让补装跟页面抢带宽。上一笔 v763 = SW-INSTALL-SLIM-1 第一批（她 11-03 报全站卡顿，B1 实锤第二抢带宽者=SW install）：PRECORE 138 条 5.96MB 拆为 install 47 条 2504KB（core js 9 → common.css → sfx 12 → html 25 尾部），6 条一波分波下发 + 单条超时 min(20s,剩余deadline) + 全局 30s deadline 必 skipWaiting（B2 定稿）；idle 补装 92 条属第二批（A1）不并入 _precoreReady。同批 W1-PRELOAD-1（8ad06e46）已在 main。
const _prevCacheNote129 = 'ielts-hub-v813'; // 11-07 v814 = WORDBOOK-TABS-1 任务1（她「单词功能我看了，那你可以开始做起来了，拆分成多个任务一个一个做」）：把 design/WORDBOOK-TABS-1-单词页侧栏各页UI样子稿-2026-11-07.html（她已点头）的5 个左栏 tab 补回单词页。v809 全站套壳时把 practice.html 原本 .wm-side 的 4 个 tab 连 .wm-right 一起收掉，只剩统一壳的今日待办，正是她说的「tab 不见了」。本任务只补骨架：新增 js/wb-tabs.js（页面专属，不动 7 页共用的 js/hub-side-shell.js，避免 7 页串号），静态写 #wbNav（左栏 5 tab 容器，属性用 data-wb-tab 不是 data-hub-sub，避开共用脚本 syncActive/onClick 误伤）+ #wbMobileTabs（≤860 横向 tab 条）+ 4 个 .wb-pane（与 #vMall 并列），show() 用 hidden 切 5 子态、首页仍是现有书架 #vMall 一行不动，其余 4 页只读真数据 + 诚实空态，交互/联动留任务2~5。首页数据接站内真字段：hubWrongCount()/practicedCount()/pc().dailyCap/window.__WM_BOOKS/localStorage['wm_pinned_books_v1']。串号：新增 js/wb-tabs.js?v=20261107e（仅 practice.html 一处）。js/common.js / css/common.css / js/hub-side-shell.js / js/practice.js / practice.css / hub-shell.css 一行未动，故 22 页通用串号不动。IDLE_PRECACHE 加 /js/wb-tabs.js。
const _prevCacheNote128 = 'ielts-hub-v812'; // 11-07 v813 = AV-BLANK-FIX-1（她「我想换头像另外几个都显示不出来」）：
  // 换头像弹层 8 个形象只有当前选中那张显示、其余 7 个空圆角框。诊断：本地/线上/宽屏/窄屏四套干净环境
  // 8 张 user-*.svg 全部 200 + image/svg+xml + naturalWidth=150，文件与 SW 缓存本身没坏；但 renderGrid 的
  // onerror=\"visibility:hidden\" 正好会造出空框，且 av-picker.js 里 10/20 那段注释记着同款事故 —— Pages 对
  // 一度缺失的 .svg 返回「200 + 落地页 HTML」带 max-age=86400，缓存里躺着内容是 HTML 的 .svg，解码失败即空；
  // 当时只给 COACH_AVATARS 加了 '?v=20261020' 缓存串修好，USER_AVATARS 8 张一直是裸路径没修。当前选中那张
  // 因账户卡/侧栏已提前以同 URL 加载过、内存是干净副本所以显示，其余 7 张首次加载命中脏副本 → 空框。另弹层
  // img 带 loading=lazy 且网格在弹层 hidden 时就填好，部分浏览器显示后不触发 lazy 加载，是第二个变量。
  // 修法（两层都盖住、同 10/20 已验证口径）：USER_AVATARS 每项补 src 全路径带 '?v=20261107a' 干净缓存键
  // （renderGrid 已支持 a.src，函数零改）+ 去掉 loading=lazy。不动 userSrc()/账户卡/侧栏、save 存文件名、
  // 云同步字段、CSS、其余页面。串号 js/av-picker.js?v=20261028j→20261107d（settings.html + speaking.html
  // 两页同串）。验证：node --check + A/B 负向（裸路径被污染成 HTML 时 OLD 全空 / NEW 8 张全好）+ 线上 8 张
  // 带 ?v= 全 200 + 弹层 8 格全显示截图。上一版 v812 = SYNC-LINK-1。
const _prevCacheNote127 = 'ielts-hub-v811'; // 11-07 v812 = SYNC-LINK-1（她「尝尝后端的隐性联动bug修复一下」= 查查）：云同步「打戳层(js/common-sync.js stampSyncItemsForUpload) ↔ 合并层(js/common-merge.js _mergeArray)」口径不一致，无稳定 id 的同步条目（corpus.js:634 默写日志 {sourceId,title,date,mistakes} 无 id/无 ts）每次改动都跨端复制一份、只增不减。根因：打戳层用 _stampSyncItemKey = f|'h:'+内容指纹（内容一变 key 就变）→ 改动条目永远 prev===undefined、打不上 updatedAt；合并层 _mergeArray 对无 id 无 ts 条目用 'h:'+JSON.stringify(整对象含 updatedAt) 当配对 key → 打了戳身份就漂移、两端配不上对。两层都把「内容/时间戳」当身份，任何一方状态不同就分裂。修法（只改 common-sync.js 一处）：上传出口 _ensureSyncItemId 给无 id/无 ts 条目按「字段+首见内容指纹」补一个恒定 id（sg+hash，剔除 updatedAt/ts，故两端算出同一个），之后打戳层用 'id:' 识别改动、合并层用 'id:' 配对 + updatedAt 较新者胜，两层口径打通；补 id 当次不打戳不误判，id 不随内容/时间戳漂移（幂等）。零数据迁移：存量旧格式 blob 被新版设备上传时补 id，过渡期两轮同步即收敛为 1 条（探针实测 [1,1]）。A/B 验证 _verify_sync_link_1107.cjs 13/13：OLD 复现 touched=0/日志 [2,2,2] 重复，NEW touched=1/两端同 id/[1,1,1] 收敛，另含 settings 较新者胜、反向墓碑、plans done 取或、id 稳定性、存量过渡五组回归。串号 js/common-sync.js->20261107c（22 页）；sw.js 仅 bump + 本 note；js/common-merge.js、js/common-cloud.js、js/common.js、js/data.js、functions/api/sync.js、css 一行未动。上一版 v811 = PREFETCH-HIDDEN-1。
const _prevCacheNote126 = 'ielts-hub-v810'; // 11-07 v811 = PREFETCH-HIDDEN-1（她 11-07「查查bug并修复」）：进机经页必发一个 wrongbook.html 404。根因：js/common-shell.js 的 prefetchAll 只给「全量遍历 PAGES」那条路判 isNavHidden，漏了「左右邻居」与「收藏」两条路 —— bank 在 PAGES 里的右邻居正好是 10-23 已删除的 wrongbook.html（hidden 兼容条目），CDP 抓到调用链 navGetDoc(:1025) <- prefetchPage(:1584) <- prefetchAll.step(:1642)，每次进站都 fetch 一个已不存在的页面吃 404；计时/服药两个 hidden 页文件虽还在，邻居/收藏路径同样白下 HTML+JS，与 10-23「hidden 页不再预取」注释口径相悖。修法：把 hidden 过滤收进 push() 一处，三条来源（邻居/收藏/全量）统一走它；hidden 判定用 isNavHidden(pg)，函数缺席时退 pg.hidden 兜底，未改 PAGES 数据、未改导航白名单、未动任何可见入口。同一轮顺带核查听力路径（切科/Part1-4/搜索/进考场/交卷复盘/标记式精听三卡推进 1->2->3->4 与「已标记 N 句」/报告入口/手机 390 档）全部正常、零 pageerror；本单只修这一个真 bug。验证探针 _verify_prefetch_hidden_1107.cjs：改动前复现 404、改动后零 404 且邻居与收藏仍能预取、零 pageerror。串号 js/common-shell.js->20261107b（22 页 25 处，含 3 处 preload 同串）；sw.js 仅 bump + 本 note；js/common.js、css/common.css、js/bank.js、css/p/hub-shell.css、js/hub-side-shell.js 一行未动。上一版 v810 = 修单词页前端 bug。
const _prevCacheNote125 = 'ielts-hub-v809'; // 11-07 v810 = 修单词页前端 bug（她「修复一下单词的那个页面，现在前端bug比较严重」）。根因：v809 套壳后 practice.css:1428/1433 那组 `main.container:has(> #bankView ...)` 要求 #bankView 是 main 直接子级，套壳后它变成 .hub-main 子级 → 整组失配；且 v809 当时为压底部空带加的两条 `#vMall{height:auto!important}` 把单词页自己的 height:100% 铺满压没了，书架/学习态塌成内容高（A/B 实测 v808 满高 828 / v809 只剩 694）、全屏态底部露一大片灰带。修法：撤掉两条 !important，改为 .hub-main 满高 flex 列 + #bankView/#studyView flex:1 撑满（用 :has(#vMall:not([hidden])) 只限书架/学习两态，词书详情态保持普通滚动），body.word-fullscreen 下 main/hub-shell/hub-main 恢复满高、侧栏收起。验证 16/16 全绿（书架/学习/全屏/软导航进页/手机 390 五组 + 零 pageerror），7 张截图逐张人眼核过。串号 css/p/hub-shell.css->20261107a（6 页）；js/common.js、css/common.css、js/hub-side-shell.js 一行未动。上一版 v809 = HUB-SIDE-SHELL-3 全站侧栏统一。
const _prevCacheNote124 = 'ielts-hub-v808'; // 11-07 v809 = HUB-SIDE-SHELL-3 全站侧栏统一（她 11-06「上栏中除了首页全部都做这个侧栏全网页统一一下UI」）：把 bank.html 她点头的单侧栏壳推广到 speaking/writing/corpus/plans/review/practice 六页。共用壳 CSS 抽成 css/p/hub-shell.css（通用部分，bank 专属 order 规则仍留 bank.html 页内不动、零回归）；js/hub-side-shell.js 的 getConfig 按页分支转发各页原分栏按钮（DOM 只隐藏不删，.click() 转发），review 无分栏条走 deepLink 两个滚动目标，practice 收掉原右栏与内侧栏、书架本身不动、只留今日待办；壳 DOM 静态写在各页 <main> 内，CSS link 与壳脚本放 </body> 前保证外链顺序与 defer 队列末位；桌面隐藏原小 tab 条、手机 ≤860 保留，body flex 规则沿用 :not(.exam-fullscreen):not(.mock-immerse):not(.word-fullscreen)；practice.css 写死 calc(100vh-72px) 的两条用 !important 压掉（v808 同款底部空带根因）。串号 js/hub-side-shell.js->20261106b（bank+6 页）；css/p/hub-shell.css 新增并进 IDLE_PRECACHE；js/common.js 与 css/common.css 一行未动（22 页串号不动）。上一版 v808 = 机经页返工 + 全站两条色带修复。
const _prevCacheNote123 = 'ielts-hub-v807'; // 11-06 v808 = 机经页返工（她 11-06 两张线上截图四条 + 全站两条色带）：① 全站右边竖条 = common.css 的 html{scrollbar-gutter:stable} 常驻预留 15px 空槽，不竖滚的页内容只到 1425/1440 → 改 auto，22 页 common.css?v=20261101m→20261106a。② 底部横条 = 壳页 container 写死 calc(100vh-72px)，公告条关掉后 container top 变 44 但高度仍按 -72 算，底部空 28px 露背景 → 改 body flex 列 + container flex:1 吃剩余高度（:not() 排除做题全屏/沉浸/背词全屏），公告条在不在都铺到底。③ 右侧原四科胶囊 display:none（DOM 保留、壳脚本 .click() 转发仍生效）。④ 内容区 padding-top 与左栏小栏目对齐（16px / 矮窗口 12px），深绿卡顶部与左栏第一按钮齐平。⑤ 题库说明用 flex order 挪到深绿卡下面（pane display:contents，[hidden] 切换不受影响），四科 pane 逐一验过。只改 CSS/串号，js/hub-side-shell.js 与 js/bank.js 一行未动。上一版 v807 = HUB-SIDE-SHELL-1 机经页第一页落地。
const _prevCacheNote122 = 'ielts-hub-v806'; // 11-06 v807 = HUB-SIDE-SHELL-1 机经页第一页落地（她 11-06 点头的单侧栏样子稿 design/SITE-SHELL-3-单侧栏壳重设计样子稿-2026-11-06.html）：只加一个左侧栏（四科小 tab 竖排自由切换 + 今天的待办），右边原有功能块一行不动；首页等没有多个小 tab 的页不套壳。壳的 DOM 与 CSS 静态写进 bank.html —— 软导航 swapPageStyles 会克隆本页 head style 并在离开时移除，绝不注入 document.head（否则串页残留）。新增 js/hub-side-shell.js：只填左侧栏内容 + 绑事件（每轮 eval 先 remove 再 add，配合 common-shell 监听账本）；小 tab 点击转发给原 #mockTabs .pill-tab 的 .click()，切科/写作按需加载/篇数/做题全走原逻辑；今日待办读 DATA.plans 当天 items，勾选改 done + updatedAt + hubSave，与计划页 toggleItem 同口径。整屏定高沿用词库首页实测 calc(100vh - 72px)，#examRoot 留在 <main> 直接子级保住 fixed 全屏覆盖。新脚本加进 IDLE_PRECACHE；bank.html 在 PRECORE 裸路径。上一版 v806 = WORDBOOK-HOME-1。
const _prevCacheNote121 = 'ielts-hub-v805'; // 11-06 v806 = WORDBOOK-HOME-1（她 11-06 点头的样子稿）：词库首页重设计落地 —— 保留原有顶栏，在其下加内侧栏/中间书架/右侧今日，书卡铺满整屏不留下半截空白；「编辑书架」抽屉逐本挑哪几本放首页（默认 6 本、听力填空答案词收起），关掉的不丢；顶栏「单词」悬浮出来的「学习/词库」两个子项删掉，点 tab 直接进新首页。串号 common.js->20261106a（22 页）、practice.js->20261106a、practice.css->20261106a。上一版 v805 = RV-CN-RIGHT-1 + 阅读答案键全库订正。
const _prevCacheNote120 = 'ielts-hub-v804'; // 11-06 v805 = RV-CN-RIGHT-1 + 阅读答案键全库订正（她 11-05/11-06 连报三轮「改了没生效」）：① 根因：11-05 三笔改了 js/bank.js 的中文翻译却没 bump ?v=（还停在 20261103i），SW 对带 ?v= 的资源精确命中旧副本就返回 —— 她浏览器一直是旧脚本，翻译键点了没反应、答案键与绿字订正也刷不到。② 翻译覆盖右栏：rvCnRows() 除左栏 #exArt 段落外，纳入 #exQCol 的组指令 .ex-grp-i / 题干 .ex-qt / 流程图格 .ex-html td / 独立 .ex-opt（嵌套在题干行里的去重，不重翻），译文仍合并成一次 callRelay 请求、按篇缓存并校验行数；bank.html 配套 CSS 让选项译文另起一行。③ 题库 json 改走 network-first：bank/answers|reading|listening|timeline 下不带 ?v= 的 json 原走 SWR，命中旧缓存直接返回、后台才 revalidate，改了答案键她当天都拿不到；现在优先网络、断网才回落缓存副本（离线做题不受影响）。④ 全库 280 篇阅读 / 1035 填空答案审查：19 个答案文件 / 31 条答案值订正（键里存了原文没有的编造词 / 超题干字数 / 整组错位，含 Conformity Q31-40 整组平移一格、Mercator Q35-36、Synaesthesia Q38-39 对调），逐条对照题目自带 analyses 与原文定夺，answers 与 raw 同步、保持原文件格式；Q10 补官方写法 metal wedges 为备选，four hundred 补为 400 的等价写法，Conquering Q7 补 dog sleds 备选，William Gilbert Q12/Q13 补 raw。串号 bank.js->20261106a（preload 与 defer 两处同串）。上一版 v804 = 首页问候大小字层级恢复。
const _prevCacheNote119 = 'ielts-hub-v803'; // 11-05 v804 = HOME-HELLO-RESTORE-1（她 11-05 拍板选 A）：撤销 11-04 PAGEHEAD-SLIM-1 第 3 笔对首页左上角问候块的压缩，恢复「日期小字独立一行 + 问候 24px 大字独立一行 + chips 第三行」的大小字层级。只动 css/p/home.css 的 .hero .eyebrow / .hero h1 / .hero-sub 三条 + 删掉 .hero>div:first-child 的 flex 横排；同笔 .hero-setdate / .setup 两处收敛保留不改，零 js、27 个业务 id 未动。串号 home.css->20261105a。上一版 v803 = 回顾页 deepLink 滚动时机。
const _prevCacheNote89 = 'ielts-hub-v772'; // 11-04 v773 = 查词单红-2 补刀（B2 审计 v772 新引入的缺陷）：`ssDictLoadIndex` 的 `fetch('data/official-banks/_index.json')` 原来**没有超时**。请求挂住时（连接卡死、弱网掉包但不 RST）`_ssDictIdxLoading` 永远非空、`_ssDictIdxFailed` 永远不置位，v772 新加的「加载中不落 AI」守卫就一直成立 —— 词书内的词永远提示「稍等再回车」，**词书外的词 AI 也永远不触发**，查词整块永久不可用（改前 v769 至少能落到 AI）。修法：AbortController + **20 秒**硬超时，超时按失败处理（_ssDictIdxFailed=true）照原样落 AI。20 秒取法：40KB/s 实测索引 13 秒、30KB/s 极端约 17 秒，取 20 覆盖；真挂死的连接不会自己恢复，等 20 秒判失败远好于永久卡死。成功/失败两条路径都 clearTimeout（否则页面白挂一个 20 秒定时器）。另修 sw.js 两处注释算术：①IDLE「92 条」的正确算法是「原 138 条里 91 条 + v769 新增查词索引 1 条」（PRECORE 47 + IDLE 92 = 139，比原 138 多的一条就是 _index.json）；②「88 条裸路径命中率为零」→ 89 条。实测（索引请求永不返回）：挂死窗口内出「加载中」、api/ai 0 次；20 秒后不再永久卡住、确实落到 AI。串号 common.js?v=20261104h（22 页同步；preload 未引用 common.js）。上一版 v772 = 查词单整改。
const _prevCacheNote88 = 'ielts-hub-v771'; // 11-04 v772 = 查词单整改（B2 审计 v769 的 1 红 2 P2 + 两条尾巴，一笔提交）：①**红-1**：aiLookup 本地命中分支补 `_ssAiToken++`。本地命中是 v769 新增的提前 return，原来只清 _ssAiBusy 没递增 token，还在飞的旧 AI 响应回来时 token 校验照样通过 → 渲染卡片**并走 hubSave 写词库**。B2 实测：查 gewu（AI 等 3.5s）→ 立刻改查 potential（本地命中正确）→ 3.5s 后卡片被覆盖回 gewu、词库里多出 gewu。递增 token 后过期响应一律丢弃。②**P2-1**：索引**确实正在加载**（_ssDictIdxLoading 非空）时超时不落 AI，改为输入框下方一行「词库正在加载，稍等再回车」，加载完成自动恢复本地命中；只有确实失败（_ssDictIdxFailed）才按原样落 AI。原因：AI 路径会自动写词库（她早先拍板的产品特性），慢网首次查词会写进一条 AI 生成的词条、索引就绪后查同一个词又不写 —— 同一个词前后行为不一致、词库被污染（B2 40KB/s 下实测索引要 13 秒，窗口内连查三词全走 AI）。③**P2-2**：删 `-er` 砍两字母的变形规则（corner→corn 返回「玉蜀黍」；索引内 338 个 er 结尾词有 60 个砍完撞上另一个真词，-er 绝大多数是名词后缀不是比较级）。-est 保留。④尾巴：删死变量 mineMap；sw.js 四处注释「91 条」→「92 条 / 4039KB」（v769 加了 _index.json 后 IDLE_PRECACHE 实测 92 条 / 4038KB，原注释口径过时）。禁区未动：AI 路径本身、hubSave 写盘合并（R1）、喇叭与自动读、callRelay 收窄、变形规则里除 -er 外的全部条目。串号 common.js?v=20261104g（22 页同步；preload 未引用 common.js，无重复下载）。上一版 v771 = 查词预取。
const _prevCacheNote91 = 'ielts-hub-v774'; // 11-04 v775 = EYEBROW-VIP-REMOVE-1（她 11-04 令「所有页面不要前面那个废话标题」，B1 三遍交叉扫 30 个视图确认全站此类英文装饰眉题只剩一处）：**会员页那行 `MEMBERSHIP · 当前状态`**。vip.html 的 #vipHero 内容全由 js/vip.js 的 loadVipStatus() 注入，KICK 常量在 7 个状态分支里都被前置拼接 ——①删 js/vip.js 的 KICK 常量与全部 6 处 `KICK + ` 拼接（连同常量共 7 处）；②删 css/p/vip.css 两条 `.kv-eyebrow, .kv-kicker{...}` 规则（-eyebrow 全站零引用、-kicker 删完 js 也零引用，两条都成死规则）；③顶部两处注释改准（不再写「包 .kv-kicker」）。**会员状态卡的其它内容一个字未动**。实测五态全过（未登录 / 查询中 / 登录过期 / 会员生效 / 免费版）：无眉题、hero 非空壳（75~149px）、零 pageerror；375/390 无左右滑。**没删的**（领头牛裁定按字面执行，她只要英文眉题）：help 的「帮助」、announce 的「更新日志」（随页签变「消息中心」，是身份标签）、beginner 的「新手必读」（淡底圆角 chip）；home 的日期 eyebrow、index 的品牌条、speaking 的 LIVE、errorbook 的 PAGE MOVED 均复核在位；`.kv-section-label`（Pricing / Compare / FAQ 三条正文分区标）未动。上一版 v774 = 计划页软导航塌陷。
const _prevCacheNote118 = 'ielts-hub-v802'; // 11-05 v803 = RV-DEEPLINK-SCROLL-1 回顾页落点滚动时机（第 6 件第一笔）：原来 deepLink() 在 boot() 里紧跟 paint() 同步跑，records() 刚写完 innerHTML 就 scrollIntoView，那一刻布局还没算完 —— 滚了个空。现改成 deepLinkScroll()：等一帧再滚，按「#recAll 是否贴到视口顶」判到位、不到位就补（最多 5 次 ×120ms，到位即停，不死等）；不只依赖 scrollIntoView，窄档（滚动在内层 main.container）与桌面（滚 window）各按容器偏移直接设一次。另在 hub:data-merged 之后补跑一次 paint + deepLink —— 云数据合并会重绘整页把位置推回去（实测软导航滚到 401 又被推回 371）。只动 js/rvx-data.js，筛选逻辑与判分零碰。
const _prevCacheNote117 = 'ielts-hub-v801'; // 11-05 v802 = 绿字与错答的间距收口（领头牛裁定，B1 实测驱动）：她要的是「隔两个空格」。B1 实测她的字右缘到绿字左缘是 22.9px ≈ 4.6 个空格 —— 三段叠加：input 右内边距 7px + .ex-blankw 的 flex gap 4px + ::before 两个 NBSP 9.9px；盒到盒只有 4px。现去掉 ::before 那两个 NBSP（规则里其他声明不动：颜色、字体、display 都保留），视觉间距回落到约 11px ≈ 两个空格，跨窄档也少一层 white-space 折叠的心智负担。绿字本身样式（绿 #1f7a5c / font:inherit）不变。
const _prevCacheNote116 = 'ielts-hub-v800'; // 11-05 v801 = 翻译键返工（v800 打回后修两处硬伤）：①【B2 实锤红】rvCnRows() 原来只看 #exArt 的直接子元素，但阅读库 280 篇里 179 篇(64%)是 Lark 导出格式 —— 正文多包一层 div、每段是 .ace-line，直接子元素里没有 p/h4，取行恒为 0、点翻译只弹「这篇没有可翻译的原文」；现加 .ace-line 分支（并过滤掉 nbsp 空段落，防止白烧 token），普通格式仍走原路径。②【B1 实锤】取值写错了：callRelay 返回的是字符串（全站其它 14 处都是 const content = await callRelay(...)），这里却按 out.content/out.text/out.choices 取 —— 字符串上三个都取不到，译文恒空；这条从 11-02 的 v736 起就在，听力卷一直不能用。现改成先认字符串、再兜对象形态。③【B1 报】空译文不再写缓存：一次失败就把空结果落进 EX[RV_CN_CACHE_KEY]，之后关开命中缓存不再重试；现只有真拿到译文才落缓存，全空就复位开关 + 一句人话，下次点开重试。
const _prevCacheNote115 = 'ielts-hub-v799'; // 11-05 v800 = RV-SW-26 ② 阅读卷「中文翻译」开关补全（她今早点名「头顶的翻译键还没做」）：① 顶栏按钮原来被 isListenRv 挡掉、阅读卷压根不渲染，现改听力/阅读都出（「答案句」仍只听力）；② rvCnToggle/rvCnPaint 原来绑死听力逐句稿（.ex-script .sc-body .sc-line），阅读卷没有句子级节点，现加 rvCnRows()/rvCnTextOf()：听力走 .sc-line，阅读走文章容器 #exArt/.ex-article 的块级子元素（h4/p）逐段取行，取文本时克隆一份摘掉填空框/Mark 旗子/旧译文再取，不动真 DOM；③ 合并成一次 callRelay 请求 + 按篇缓存不变。bank.html 未动（.sc-cn 样式壳早就有）。探针 tests/_probe_cnbank_1105.cjs 26/26。
const _prevCacheNote114 = 'ielts-hub-v798'; // 11-05 v799 = 修绿字正答规则不生效（B2 抓的「主规则整条没生效、绿字是深灰」）：v795/v796 把 .ex-ca-in 两条规则放在 bank.html 第一个 style 块的 .ex-blankw 规则群里，浏览器解析完 styleSheets 里根本找不到这两条（同块内其它规则正常）—— 线上表现就是绿字不绿、两个空格也没有。现把两条规则整体搬到文件末尾新加的一个独立 style 块（id=rvCaInFix），复量恢复：caColor=rgb(31,122,92)（绿）、::before content 为两个 U+00A0、且 .ex-ca-in 主规则确实出现在 styleSheets 里。只动 bank.html 与 sw.js，js 零改动。
const _prevCacheNote113 = 'ielts-hub-v797'; // 11-05 v798 = 计时弹窗 ± 步长 5 分钟改 1 分钟（她今早第三条）：「这个地方加减只调一分钟不要五分钟」。只动 js/exam-timer.js：STEP_MIN 5→1，两条 aria-label 与两条注释里的「5 分钟」同步改 1（不做假无障碍）。上下限 1–180、各场景默认值（单篇阅读 20 / 整套阅读 60 / 听力 30 / 写作 60）、presets 档位、"不计时" 按钮、开卷倒计时逻辑一律未动。
const _prevCacheNote112 = 'ielts-hub-v796'; // 11-05 v797 = 机经题库答案键修正（Building A Castle Q10）：她今早点名「我现在写的答案（wedges）也是对的，答案是错的，答案只要求写一个词」。同篇 8/9/11/12/13 填空键各 1 词，只有 Q10 存了 2 词，键本身错。只改 bank/answers/2071422589235937282.json：answers 与 raw 的 "10" 由 "metal wedges" 改 "wedges"，alts 里冗余的 {"10": ["wedges"]} 清空为 {}。判分逻辑 js/bank.js eqAns() 一行未动；其余题、其余篇一律未碰。
const _prevCacheNote111 = 'ielts-hub-v795'; // 11-05 v796 = 正答样式补刀（B2 抓的那条）：「两个空格」原来写成普通空格 + white-space:pre，被 bank.html:685 那条 @media(max-width:860px) 里 #examRoot .ex-blankw.rv-open .ex-ca-in{white-space:normal}(1,2,1) 压过，普通空格在 normal 下会被折叠 → 手机档间距变 0；且 white-space:pre 与 11-03 为「窄屏绿字被右栏裁掉」加的 normal 直接打架。现改为 ::before content 用两个 U+00A0（不换行空格，折叠规则管不住），并把 white-space:pre 去掉、交给既有规则接管 —— 这样既保住两个空格、又不影响窄档换行。字体 font:inherit 不变。
const _prevCacheNote110 = 'ielts-hub-v794'; // 11-05 v795 = 机经做题页填空正答显示（她截图口径）：「正确答案要用框里一样的字体，只不过是绿色的，跟错误答案隔两个空格的间距就行了」。只改 bank.html 页内 style 的 .ex-ca-in 一条（+ 新增一条 ::before）：原来写死 font-size:12px + font-weight:700（比框里的字小一号又加粗）+ margin-left:6px；现改为 font:inherit + 与 #examRoot .ex-blankw input 同一条算式 font-size:calc(var(--exfs) * .725)、不再单独覆盖字重；与她的错答之间改由 ::before 里两个不换行空格实现（字面「两个空格」）。颜色 #1f7a5c 未动。js 一行未改（绿字仍由 js/bank.js:3776 生成，只是样式换了）。上一版 v794 = 回顾页死壳清理。
const _prevCacheNote109b = 'ielts-hub-v793'; // 11-05 v794 = REVIEW-DEADSHELL-1 回顾页死壳清理：删 review.html 里 #rvLegacy 内的三节点（#tab-score、#tab-record 两个空 panel + .review-pill-tabs 壳与两个 .tab-btn），并删 js/review.js 里整块 applySubTab()（含其注释）与 ready() 里的唯一调用。依据：B2 核过全仓没有别处读这三个节点、applySubTab 也只有一个调用点；A1 复验软导航点「轨迹」这条路径（URL /review.html?sub=record、recordFilter=all）删前删后逐值相同 —— 真正干活的是 js/rvx-data.js:280 的 deepLink()。applySubTab 为什么是纯空转：它读暗号后去 .click() 的是宽0高0的按钮，而 common-pwa.js:70 那条 .tab-btn 全局委托开头就 b.closest('.tabs')，壳上是 class="review-pill-tabs"（无 tabs 类）→ 直接 return。🔴 #rvLegacy 容器**保留不动**（js/rvx-data.js:266-269 有四处靠它转发删除/展开）；js/common-pwa.js:70 的全局 .tab-btn 委托与 js/scores.js:29 的绑定也保留（通用能力，空集合 forEach 零成本）。css/common.css 未动 —— 里面 :1700-1701 两条 .review-pill-tabs 规则与 :486 的 .tab-btn 媒体查询是死规则，属共享层，已报领头牛定。上一版 v793 = 作文页深色底条收窄。
const _prevCacheNote109 = 'ielts-hub-v792'; // 11-05 v793 = 深色底条补刀修正（B2 抓 1 红）：v792 那行深色覆盖写的选择器是 [data-theme="dark"] #writeTabs .pill-tab.active::after，特异度 (1,3,0) 与语料/评分那两条 #writeTabs .pill-tab[data-tab=...].active::after (1,3,0) 相等、又写在文件最后，于是把它们也一起覆盖成近黑 —— 深色档三枚底条全变 rgb(14,14,16)，「你在哪一栏」的提示失效。收窄为 [data-theme="dark"] #writeTabs .pill-tab[data-tab="tpl"].active::after (1,4,0)，只作用于模板那枚；语料仍 rgb(125,122,255) 靛、评分仍 rgb(255,149,0) 橙。教训记档：写深色/状态覆盖时必须把同族每一条都实测一遍，不能只看选择器「以为」只命中一个 —— v792 我正是照推断报了「另两枚没动」，B2 实测推翻。只改 writing.html 页内 style（一行 + 注释）+ sw.js；js 零改。上一版 v792 = 深色底条补刀。
const _prevCacheNote108 = 'ielts-hub-v791'; // 11-05 v792 = 作文页深色档底条补刀（B1 报的可辨识性）：B1 实测浅色档三枚分栏 tab 底条里，「模板」那枚取 --primary-900 压在实心主青底上对比度只有 3.15（勉强够 3:1），而深色档 --primary-900 翻成浅青 rgb(197,230,225) 压在深色档实心青底 rgb(92,179,171) 上只有 **1.86**，几乎看不见。修法：只给深色档的模板那一枚另取值 —— [data-theme="dark"] #writeTabs .pill-tab.active::after{background:var(--bg)}，近黑压在实心青底上形成挖空感、跳得开；语料靛 / 评分橙是色相差，深色下仍分得清，不动。只改 writing.html 页内 style 一段 + sw.js（CACHE + 本 note）；js 零改。上一版 v791 = 手机端回顾入口。
const _prevCacheNote107 = 'ielts-hub-v790'; // 11-05 v791 = 手机端补「回顾」入口（她报的「轨迹页进不去」真因修复）：只改 js/common.js 的 GROUPED_DOCK 一处数据（新增 {id:'review',page:'review'}，插在「计划」之后、「我的」之前）＋ me.members 移除 'review'（防底栏高亮漂移，me 组页那张回顾卡保留不动）；css/common.css 一行未改；sw.js 只 bump + 本 note；不新增页面、不动底栏 56px 通栏规则、不碰 home-quick.js 默认三条。背景：手机端整个顶栏 #mainNav 是 display:none，「回顾/成绩/轨迹」三个链接只在顶栏二级菜单里，首页那张「回顾」卡在手机上是 w=0 不可见 —— 手机用户没有任何一步可达的路径进回顾页。两处与派单口径不符（已在群里报）：① 底栏 href 由 PAGES[g.page].file 拼出，链路不吃 query，所以只能落裸 review.html（落点在概览卡顶部 y=38，记录/轨迹区在 1285px 以下、筛选仍是默认「最近三次」）；带 ?sub=record 才会 scrollTop=960 直落记录栏并切筛到「全部」——要真直落需在 injectGlobalDock 的 href 拼接里加 (g.query||'')，属禁区外的一处改动，已报领头牛待裁，本笔不擅自做。② 派单写的 icon:ICON.review 照字面会嵌套 svg（injectGlobalDock 用 svgOf() 自己再包一层 <svg viewBox…>，而 ICON.review 本身已是完整 <svg>）；已按代码事实取它里面的 path 裸串。上一版 v790 = 作文页配色补刀。
const _prevCacheNote106 = 'ielts-hub-v789'; // 11-05 v790 = 作文页配色补刀（B2 复审 2 红 + 1 P3）：① 🔴 .tpl-card 悬停时左条被刷成浅青：css/common.css:467 的 .card:hover{border-color:var(--primary-200)} 是 (0,2,0)，压住本笔 .tpl-card{border-left:3px solid var(--primary)} 的 (0,1,0) —— 鼠标滑过时整条左条变成与框线同色、像消失。修法：改写成 .tpl-card,.tpl-card:hover{border-left:3px solid var(--primary)}，同特异度且写在样式表更靠后，常态与悬停都保主青；悬停反馈（其余三边转浅青 + 上浮）保留。② 🔴 三枚分栏 tab 的「模板」底条看不见 + 高度不齐：原用 border-bottom，一是 tpl 那条取 --primary，与 .pill-tab.active 的实心主青底（common.css:965）完全同色、整条不可见；二是 border-bottom 让选中的那枚比另两枚高 3px、文字偏上（B2 实测 35 vs 32）。修法：改用 ::after 伪元素（需给 #writeTabs .pill-tab 加 position:relative），不动盒模型也不碰全局外投影，三枚高度恒等；tpl 底条改取 --primary-900（同色系深一档，在实心主青底上可见，不引入新色），bank/score 仍 --corpus/--warn。③ 🟡 P3 计数小字对比度：.fchip .lv-cnt 的 opacity:.75 在浅青底上合成后只有 3.02（不足 AA 4.5，改前实心白字是 2.58）；已加 #wbFilters .lv-cnt{opacity:1}（作用域限定筛选带内），与 chip 文字同色 4.77 达标。js 一行未改；css/common.css / css/p/writing.css 仍零改。上一版 v789 = 作文页配色。
const _prevCacheNote105 = 'ielts-hub-v788'; // 11-05 v789 = COLOR-LAYER-1 第 7 单第二笔（作文页配色层次）：定版《配色层次-示意图-1104.html》口径 + ssr 施工要点单第 5 条。只改 writing.html 第二个 <style> 块末尾追加一段 + sw.js（CACHE + 本 note）；js 一行未改（js/writing.js 零改）；css/common.css 零改；css/p/writing.css 零改，故其引用串 v=20261101m 不 bump（按「改了才 bump」）。四处落地：① #writeTabs 三枚分栏 tab 各加 3px 底条（tpl=--primary / bank=--corpus / score=--warn）；② .tpl-card 左边框由 1px 灰加粗成 3px 主青；③ #wbFilters .fchip.on 由实心主青+白字收成浅青底深字；④ .tpl-lv 徽章现状已合口径，不动。🔴 落点事实（记档）：writing.html 主块末尾有 @media (min-width:861px){#writeTabs{display:none}} —— 桌面端这三枚 tab 本来就不显示（10-23 批 B「撤页内小 tab」，桌面走顶栏二级、页内 tab 只留手机），所以 ① 只在窄档 ≤860 可见，是既有结构决定的，不是本笔漏做。用 border-bottom 而非 box-shadow 的理由：.pill-tab 全局自带外投影 box-shadow（common.css:965），写 box-shadow 会顶掉那条投影；border-bottom 不动阴影、box-sizing:border-box 下外高也不变。② 用 border-left 而非 inset box-shadow 的理由：卡外壳是全局 .card（common.css:466，1px 边框+圆角+外投影），加粗这条既有边框是最小改动、外宽不变；机经页的行本来没有边框才走 inset。上一版 v788 = 机经页配色。
const _prevCacheNote104 = 'ielts-hub-v787'; // 11-05 v788 = COLOR-LAYER-1 第 7 单（机经页配色层次）：定版《配色层次-示意图-1104.html》口径，列表行按科目有身份色。只改 bank.html 第二个 <style> 块末尾追加一段 + sw.js（CACHE + 本 note）；bank.html 的 <head> 里 css/p/bank.css 引用串没动 —— 本笔没改那个文件（全站样式都在页内 <style>，bank.css 只有 206B 一条 .bubble），按「改了才 bump」的口径不该虚假 bump。js 一行未改。🔴 落点偏差（实测得出，非照稿硬搬）：ssr 要点单原写「按 :has(.bi-ch.t1/.t2/.t3) 分三色」，但实测四个 tab 下 40 行里含 .bi-ch 的是 **0 行** —— 那批题目没有 u.types（标签由 js/bank.js:166 的 (u.types||[]).forEach 生成），标签组是空的，:has() 一条都命中不了，照原写法一根色条都出不来。领头牛 11-05 裁定：改用行上稳定存在的 data-ch 上色（实测每行都有，reading/listening 两值），与回顾页四科色系同源；:has(.bi-ch.tX) 三条照写保留、真有 types 时才细化生效（两组并存不冲突）。「三色」降级为「data-ch 两色 + 类型标签细化」已记档，要恢复三色需 js/bank.js 给行加类型属性（js 红线不动）。实测落点：.bank-item 20 行全带 data-ch="reading"（听力 tab 下混出 listening 行）；.bk-grp-h 分组头 2~4 个；.bi-chips 桌面 flex / 手机 none（BANK-DONE-ROW-1 既有取舍，没动）。改动：阅读行左边条 = --corpus 靛、听力行左边条 = --mock 青；分组头 .bk-grp-h 加 --primary-50 浅底 + 3px 左条 + 8px 圆角。**一律用 inset box-shadow 不用 border-left**（ssr 要点单第 4 条的口径，分组头同样照办）——不动盒模型，手机窄档零横滑是硬红线。实测（两档逐值对照）：1440 行内色条 rgb(88,86,214) 3px inset、borderLeftWidth 仍 0px、行高 44/45 未变；分组头 bg rgb(238,247,246)（--primary-50）、radius 8px、高 38 未变；390 同值、零横滑；深色靠令牌自动跟随（--corpus/--mock/--primary-50 都有深色覆盖，未另配）。上一版 v787 = 回顾页配色层次。
const _prevCacheNote103 = 'ielts-hub-v786'; // 11-05 v787 = COLOR-LAYER-1 第 6 单（回顾页配色层次）：定版《配色层次-示意图-1104.html》口径，四科各有身份色、成绩一眼能分栏。改动：css/p/review.css 末尾追加一段（四科卡片 + 达标徽章 + 记录行色条 + 趋势线加粗）；review.html 只 bump 串号 review.css?v=20261104c→d；sw.js 只本行。js 一行未改（全程红线）。四科→令牌（定版写明可调的设计取舍，要换只改那一段的令牌、不动布局）：听力 --mock 青 / 阅读 --corpus 靛 / 写作 --warn 橙 / 口语 --speak 粉，全部用 common.css 已有令牌（浅色 L61-86、深色覆盖 L270-287），一个新色值都没引入；深色档靠令牌自己的深色覆盖跟着变，没另写深色规则。⚠️ 特异度（ssr 要点单第 2 条，实测确认）：本文件前面已有 .rv2-subject.rvx-ok{border-left-color:var(--primary)} 和.rv2-subject.rvx-weak{...var(--warn)}，都是 (0,2,0)；只写 .rv2-subject#rvxCellL（0,1,1）会被它们盖掉、色块被状态色吃掉。所以身份色一律走 .rv2-subjects>#rvxCellX（id 特异度 1,1,0）稳压状态色。分工写死：左条与底色=科目身份（固定），>small 那枚徽章=状态（ok 主青系 / weak 警示系）。达标徽章是把原来那行纯文字（「目标 7 · 差 0.5」/「目标未设」）用 CSS 扮成小徽章（inline-block + 圆角 + 浅底），零新增节点、零 js 改动。记录行按领头牛裁定①的降级做法：记录行只有 data-cat 三类（whole/part/speaking）、没有科目属性，故按三类着现有色（整卷=主青 / 分项=靛 / 口语=粉），**用 inset box-shadow 不用 border-left**——不动盒模型，手机窄档零横滑是硬红线。要按四科分色需 js/rvx-data.js:194 加 data-subject，已记档明早报她定。趋势线只加粗 .rv2-chart svg polyline{stroke-width:3}（改前 2.5），**不覆写 stroke 颜色** ——🔴 11-05 更正（B1 实测推翻我原来的理由，结论不变）：我原先写「js/rvx-data.js 的 color 按五个科目标签动态变、覆写会打坏按科目变色」——**这条理由不成立**：js/rvx-data.js:79 就是一行固定的 var color='var(--primary)'，实测切总分/听力/阅读/写作/口语五个科目，polyline 的 stroke 全程 rgb(58,154,147) 从未变过。「只加粗不改色」这个做法保留（改色没有需求也没意义），但理由作废。加粗能生效的真实原因：js/rvx-data.js:127 的 stroke-width="2.5" 是 SVG presentation attribute，优先级低于 CSS 类选择器，所以 .rv2-chart svg polyline{stroke-width:3} 压得住 —— 哪天有人把它改成 style="stroke-width:2.5"（inline style），CSS 就再也压不住、这条会静默失效。实测（四档逐值对照）：1440 四科 cell 153x82→153x99、底色=各科 soft、左条 4px=各科身份色、科目名=各科 text 色、圆角 9px；窄档 360/375/390 左条收 3px、四科各 78x93、零横滑；深色令牌自动跟随（L 底 .12→.18、R 底换 --corpus 深色值、L 科名 rgb(92,200,240)）；L 未达标时左条仍是青不是橙（身份色压过状态色，实测确认）。功能回归真点全过：录入成绩弹窗、recent→all 筛选、详情弹窗；前 10 笔不回退。上一版 v786 = 服药页页头精简。
const _prevCacheNote102 = 'ielts-hub-v785'; // 11-04 v786 = PAGEHEAD-SLIM-1 第 10 笔（服药页页头精简）：照她 11-04 点头定版第 5 节「删装饰页头、进去直接用功能、功能一个不少、只藏不删」的口径。🔴 这页的页头只有一种来源，且不是静态 DOM：meds.html 的 <main> 里本来没有 h1，那句 <h1 class="page-title">服药</h1> 是 js/meds.js:6-10 在「服药模块未开启」（medsModuleOn 判据 = settings.adhd===true）时整段写进 main.innerHTML 的；模块开启时这页压根没有页头（静态 DOM 第一块直接是「今日状态」卡）。所以 js 一行不能动，只能纯 CSS 收。已实测确认：开启态 main 子元素是 SECTION.card + SECTION.card、无 .page-title。改动：css/p/meds.css 末尾追加一条 main.container > .page-title{1px + clip-path + position:absolute + 盒属性全零}；meds.html 只 bump 串号 css/p/meds.css?v=20261101m→20261104a（B1 今天记档的惯例，本笔起不许再漏）；sw.js 只本行。为何写 meds.css 而不是页内 style 或 common.css：本文件全仓只被 meds.html 引用，天然只影响本页 ——css/common.css 里的共通 .page-title 别页还在用，一律不碰。加载顺序也安全：meds.html 是标准顺序「common.css → css/p/meds.css → 内联 style」（不是素材页那种异类），本文件排在 common.css 之后、同特异度也赢；软导航 swapPageStyles 把新样式表插到第一条内联 style 之前，对本页正好是维持原顺序。选择器用 main.container > .page-title（0,1,1）而不是光秃秃的 .page-title：既明确「内容区第一层那个页头」，又高 common.css:465 一档、顺带压住 common.css @media 里那条同特异度的 .page-title{font-size:22px;margin-bottom:6px}。本页无 data-mod，故 common.css:1892 的 [data-mod] .page-title（0,2,0）不适用；本页也无 .page-head-row / .page-head-l 祖先，另两条高特异度规则同样不适用（逐条核过）。position:absolute 必须（只给 1px 留流里会白占 41px/36px + 外边距）；用 clip-path 不用 display:none / visibility:hidden，收起后 h1 仍在无障碍树（开启态本来没有 h1，未开启态这一个是唯一一级标题）。实测（未开启态）：1440 .page-title 1132x41→1x1、clientHeight=1（不白占），首卡 y 131→86（让出 45px）；390/375/360 首卡 y 80→38（让出 42px）；「去设置开启」入口一个字不少、可见、真点仍到设置页。开启态逐值零变化（首卡 y=86/38、#recordMed 与两张卡都在）—— 本笔未误伤静态功能。上一版 v785 = 素材页引导屏页头精简。
const _prevCacheNote101 = 'ielts-hub-v784'; // 11-04 v785 = PAGEHEAD-SLIM-1 第 9 笔（素材页引导屏页头精简）：她 11-04 点头定版第 5 节素材页那行「删标题、副标语与说明段；素材编辑、题卡列表等功能原位」。🔴 这页与前面八笔根本不同：页头不是静态 DOM，是 js/materials.js 的 MI_INTRO_HTML 字符串模板（10-25 从设计稿 machine 导出，注释明写「27 元素基线、勿手改」）运行时注入 #matRoot 的 ——所以 js 一个字不能动（一改就是 js 改动 + 机器导出基线失效），收页头只能靠纯 CSS。只动 css/p/materials.css（末尾追加一段规则）+ sw.js；materials.html 静态 DOM 未碰、js 零改动。收到两处：.mi-head（h1「万能素材 · 串题」+ .mi-sub 副标语）与 .mi-hero（眉题 + h2 + p 说明段 + .mi-nums 三个数字）。一个不少原位保留：.mi-pain（老办法 vs 串题对比）、.mi-card（流程四步）、.mi-vip-bar（会员条 + #goVip）、底部 .mi-card（#startGen 主按钮 + #backRes）—— 它们是功能与有效信息不是装饰。⚠️ 三个本页专属的坑，都实测确认过：① 本页 <head> 顺序是异类 ——「common.css → 内联 style → 内联 style → css/p/materials.css」，css/p 排在内联 style **之后**（其余 21 页是 css/p 在前）；好处是本文件同特异度也能压内联，但软导航 swapPageStyles 会把本页还原成「css/p 在前」，所以不能赌顺序。故用引导屏自己的根 id 做作用域 （#introView 是 MI_INTRO_HTML 最外层 div）——既稳压内联的 .mi-page .mi-head (0,2,0)，又不外泄到问卷态/结果态。② border-radius 必须单挂 !important：本页 MAT-INTRO-1（10-25）的「圆角二次钉死」把 .mi-page .mi-hero的圆角用 !important 钉在 14px。实测不带 !important 时本规则其余声明全部生效、只有 border-radius 读回 14px（!important 在普通声明之上，id 特异度压不过它）。照本页既定做法用「id 特异度 + !important」钉平，不打散那条锁。③ position:absolute 必须 —— 只给 1px 留流里会白占 59px 高度（桌面与窄档都 59px）。用 clip-path 不用 display:none/visibility:hidden：h1 是本页唯一一级标题，后两者会把它从无障碍树摘掉。已核 #introView 这套样式站点里只有 materials.html 与 speaking.html 两份拷贝，本文件不被 speaking.html 引用—— 本笔只动素材页，口语页字节级零变化。实测（反向对照过：注入 v784 的 materials.css 逐值回原）：1440 .mi-pain y 391→86（让出 305px）、.mi-vip-bar 921→616；390/375/360 .mi-pain y 503→38（让出 465px）、.mi-vip-bar 1566/1588/1664→1101/1123/1199。第一屏现在直接是老办法 vs 串题对比区。三按钮尺寸改前改后一致（#startGen 178×52），#startGen→问卷态 + 写 hub_mat_intro_skip、#goVip→跳 vip.html、#backRes 行为不变，全程零 pageerror；「56」当季题数仍由 js 动态填入（收起只影响可见性）。上一版 v784 = 法律页页头精简。
const _prevCacheNote100 = 'ielts-hub-v783'; // 11-04 v784 = PAGEHEAD-SLIM-1 第 8 笔（法律页页头精简）：她 11-04 点头定版第 5 节法律页那行「删大标题与 lead 长段；五个锚点条顶头，锚点功能保留」。本页无独立 css，样式全在页内 <style>（:21-23 + @media≤560 的 :52）。做法=整个 .legal-head（h1「隐私政策与用户协议」+ p.lead 那段长介绍）1px + clip-path:inset(50%) + position:absolute 收掉；h1 是本页唯一一级标题，用 clip-path 不用 display:none / visibility:hidden（后两者会把它从无障碍树摘掉）；absolute 是为了不留那 94px 占位。🔴 只收 .legal-head，不动 .legal-toc：锚点条是功能不是装饰 —— **实际有五条**（#privacy / #terms / #ai / #rights / #contact，派单里写的三条与页面不符），一个不少、href 一字未改；.legal-toc 自己的 margin:20px 0 32px 是卡片内留白，不在本笔范围，原样保留。选择器写成 .legal-wrap .legal-head（照第 20 条口径加的保险）：已用 document.styleSheets 扫过全站，命中 .legal-head 的规则只有本页 4 条，无跨文件特异度坑。实测：桌面 .legal-toc y 236→134、#privacy y 303→200（让出 103px）；窄档 .legal-toc y 199/223→78、#privacy y 308/374→229（让出 121/145px）。三节正文（privacy / terms / ai）与另两节（rights / contact）一字未改，common.css 未碰，任何 js 一行未改。⚠️ 两处照办但要记档：① lead 里那句「最后更新：2026 年 10 月 13 日」按定版口径随 lead 一起收掉了（未擅自挪位置，如需保留要另开位置，已上报）；② **既有问题（非本笔引入，反向对照过）**：窄档（带 dock）站点把 html,body 锁成 overflow:hidden、滚动交给 main.container，浏览器 hash 导航不会滚这层内层容器 —— 手机上点锚点条只改地址栏 hash、页面不滚。改前 v783 逐值相同（winY=0 / mainScrollTop=0 / aiTop=2883），已单独上报群。上一版 v783 = 新手页页头精简。
const _prevCacheNote99 = 'ielts-hub-v782'; // 11-04 v783 = PAGEHEAD-SLIM-1 第 7 笔（新手页页头精简）：她 11-04 点头定版第 5 节新手页那行「删眉题、大标题、长介绍；正文顶头」。本页没有业务 js、页头里也没有功能按钮，纯收装饰。做法=整个 .bn-hero（眉题「新手必读」+ h2「第一次考雅思？…」+ 后面那整段长介绍）1px + clip-path:inset(50%) + position:absolute 收掉。🔴 **最容易踩的一处：选择器必须写成 `.bn-page .bn-hero`，只写 `.bn-hero` 一定失败。** css/p/beginner.css 里对这块有**两套**规则：`:59` 一套 `.bn-hero`（0,1,0），另外 `:145 / :189 / :223` 又有一套 `.bn-page .bn-hero`（0,2,0，比单类高一级），后者同样给了 padding 26/28、白底、边框、圆角、阴影，@media ≤640 里还各有一条 padding 22/20。第一版只写 `.bn-hero{...padding:0;background:none;border:0;box-shadow:none}`，被高特异度那套压住 —— position/width/height 生效了（那几条只有我设），但 padding/bg/border/radius/shadow 全没生效，实测盒子 58×54、白底带边框的「幽灵卡片」还留在页面上。改成 `.bn-page .bn-hero` 对齐特异度（本页 <style> 排在 beginner.css 之后，同特异度后出现者胜）后实测 1×1、padding 0、底色透明、border 0、shadow none。另外 h2 是本页唯一标题级元素（本页**没有 h1**），用 clip-path 不用 display:none / visibility:hidden —— 后两者会把节点从无障碍树摘掉；改后 CDP getFullAXTree 实测 heading 共 8 个（页头 1 个 level=2 + 7 节）。实测：桌面 #bn-1 y 296→86（让出 210px）；窄档 390/375/360 的 #bn-1 y 694/720/720→438（让出 256/282/282px）；页面总高 3554→3344。7 节正文（bn-1~bn-7）标题与内容一字未改、id 未动，common.css 未碰，任何 js 一行未改，页内只加了一条收起规则（未新增样式类）。上一版 v782 = 公告页页头精简。
const _prevCacheNote98 = 'ielts-hub-v781'; // 11-04 v782 = PAGEHEAD-SLIM-1 第 6 笔（公告页页头精简）：她 11-04 点头定版第 5 节公告页那行「删眉题、大标题、副标语；公告条目顶头，读过的不再打扰逻辑保留」。本页样式只有 css/common.css（全站共享层，本笔不碰），所以覆盖规则写在 announce.html 的页内 <style> 里 —— 它排在 common.css 之后、同特异度，直接覆盖 common.css:2989 的 .anc-hero{margin:0 0 18px}。🔴 这块有个坑值得记：.anc-hero 不只是装饰 —— 本页 DOM 被「消息中心」视图复用（announce.html?tab=msg，见 js/announce.js:84-93），那个视图会把眉题/标题/副标语**整段改写成**「消息中心 / 全部消息 / 公告、会员到期、学习提醒，都在这。」，那是它自己的标题（js 注释写着首版没换、用户以为走错页），不是装饰。所以只收普通公告页那一次渲染：CSS 用 .anc-page:has(#ancList .site-back) .anc-hero 把页头还原 —— #ancList 里那条「返回公告列表」返回条只有消息视图才会写（js/announce.js:95）。实测两视图都正常：公告页 hero 1px、#ancList y 197→86（桌面）/149→38（窄档），让出 111px；消息中心 hero 仍 93px、文案仍是「消息中心 / 全部消息」，逐值未变；从消息面板点「全部消息」软导航进去实测无中间态（hero 从未被收）。本块没有任何功能节点：#ancList / #ancDetail id 一字未改，announce.js 一行未改。上一版 v781 = 帮助页页头精简。
const _prevCacheNote97 = 'ielts-hub-v780'; // 11-04 v781 = PAGEHEAD-SLIM-1 第 5 笔（帮助页页头精简）：她 11-04 点头定版第 5 节帮助页那行「删眉题、大标题、副标语；折叠问答列表直接顶头；写反馈入口保留」。本页没有独立 css 文件，样式全在 help.html 的内联 <style> 里，所以本笔只改这一处样式声明 + 本注。做法=只藏不删：整块 .help-hero（眉题「帮助」+ h1「常见问题」+ 副标语「找不到答案就用下面的『写反馈』…」三件套）用 1px + clip-path:inset(50%) + position:absolute 收掉 —— 用 clip-path 不用 display:none（后者会把本页唯一 h1 从无障碍树一并摘掉，改后 CDP getFullAXTree 实测仍是 role=heading / level=1）；走 absolute 是为了彻底退出文档流，不留那 93px 占位。🔴 这块里没有任何功能节点：「写反馈」data-fb-open（js/feedback.js:346 document 级委托 closest('[data-fb-open]')）与「联系站长」data-wx-open 都住在下面的 .help-acts 里，两个字面属性一字未动。实测：第一屏直接是折叠问答 —— 1440 档第一个 .faq-g y 195→86（让出 109px）、.help-acts y 766→657；360/375/390 档 y 147→38（让出 109px）。8 个 <details> 全在、能展开收起；两枚按钮命中点在途、写反馈真开层。上一版 v780 = 句子页页头精简。
const _prevCacheNote96 = 'ielts-hub-v779'; // 11-04 v780 = PAGEHEAD-SLIM-1 第 4 笔（句子页页头精简）：她 11-04 点头定版第 5 节句子页那行「删标题、收长标注」。做法=只藏不删、全在 CSS，任何 js 一行未改、11 个业务 id 一个没改：① .lsr-composer h1「粘贴长难句」用 1px + clip-path:inset(50%) 视觉隐藏（本页唯一 h1，节点与文字仍在无障碍树，CDP getFullAXTree 实测 role=heading/level=1）；**h1 走 position:absolute 退出文档流**，不能只加 1px —— 留在流里的话窄档（≤720 列布局）会白占一行高度；② .lsr-intro 那段长介绍同样 1px + clip-path 收掉（纯说明文字、无 id、js/corpus.js 零引用），position:absolute 让它不占那 20px 行高 + 13px 下边距；③ 🔴 #lsModeSeg（结构拆解 / 同传对照）跟 h1 **同住在 .lsr-composer-head 里**，是功能不是装饰：只藏 h1、按钮原位可点；h1 退出流后这一行只剩按钮，补 justify-content:flex-end 让它仍停在原来的右侧位置。窄档 media 里那三条（不足 720 时 head 竖排 + 分段条满宽 + 按钮 flex:1）是本笔之前就有的按钮形态，**原样保留未动**。实测：桌面粘贴框 y 188→168（Δ-20）、composer 297→277；窄档粘贴框 y 286→185（Δ-101，因标题与介绍让出）。串号 corpus.css→20261104a（全站只有 corpus.html 引用，无 preload 依赖）。上一版 v779 = 首页页头压缩。
const _prevCacheNote95 = 'ielts-hub-v778'; // 11-04 v779 = PAGEHEAD-SLIM-1 第 3 笔（首页页头压缩）：她 11-04 点头定版第 5 节首页那行「问候与『还没设考试日期』压成一行小字；去设置、30 秒搞定、四张统计卡、去计划页全部保留」。**首页这一笔跟前两笔不同 —— 不是删页头，是压缩**：日期（#dashDate）与问候（h1 #dashHello）都是她的功能信息，只降视觉权重、不隐藏。做法全部在 CSS，零 js 改动、27 个业务 id 一个没改：① .hero>div:first-child 从纵向三行改 flex 横排——.eyebrow（日期）与 h1（问候）同一基线一行，h1 24px→14px 降为次要层级配色 --ink-2，.hero-sub（连续天数 chip / 会员 chip）强制 flex:1 0 100% 换到第二行；② .hero-setdate「还没设考试日期 / 去设置 →」原来是一枚浅青底+边框+10px 圆角的 chip，收成纯文字一行（底色/边框/圆角/padding 全归零，字号 12px 保留可点，hover 改下划线）；③ 设置补齐条 .setup 只在 CSS 收空间（padding 14/18→10/14、图标 32→26、行高 1.7→1.55、进度条 120→88px），**文案一个字没动** —— 那句「还有 N 项没设置（…）配齐后…才准。30 秒搞定 →」是 js/index.js:489 拼出来的，本笔禁改 js，所以这条只收高度不改文字，两个链接照旧完整可点。实测（1440）：hero 79→39（Δ-40）、setup 62→48（Δ-14）、四张统计卡 y 253→195（Δ-58，上移半屏）；窄档 hero 同样 79→39。串号 home.css→20261104a（全站只有 home.html 引用，无 preload 依赖）。上一版 v778 = 回顾页窄屏按钮压字补刀。
const _prevCacheNote94 = 'ielts-hub-v777'; // 11-04 v778 = PAGEHEAD-SLIM-1 第 2 笔补刀（回顾页窄屏按钮压字）：B2 审计 v777 抓到红项 —— 概览卡内 `.rv2-target`（「目标 7.5 · 差 1.0」这行）在窄档被右上角那枚「录入成绩」压住右端，360 实测压 8px、B2 在更长数据下量到 23px，390 起不重叠。根因：按钮绝对定位到卡片右上角（top:17px;right:16px，≤760 档），`.rv2-latest{display:flex;gap:18px}` 在窄档把「最近一次 + 总分」与「目标」排成一行、右端到 x≈246，而按钮从 x≈238 起，正好骑上去。改前按钮在卡片外（页头里），没有被压的对象，是本笔把按钮移入卡内后才产生的遮挡。修法：只加一条 `@media(max-width:400px){.rv2-latest{flex-wrap:wrap;gap:8px 18px}.rv2-latest>.rv2-target{flex:1 0 100%}}` —— 让「目标」这行在窄档折到下一行、从卡片左内侧重新起排，按钮那块位置就空出来；不动按钮尺寸、不动字号、不加新外观、不改任何 js。360/375/390 三档实测 target 换到 y=141、文字右端 121，按钮从 238/253/268 起，重叠 0；430/1440 因在 400 断点之上完全不受影响，与 v777 逐值一致。串号 review.css→20261104c。上一版 v777 = 回顾页页头精简本体。
const _prevCacheNote93 = 'ielts-hub-v776'; // 11-04 v777 = PAGEHEAD-SLIM-1 第 2 笔（回顾页页头精简）：她 11-04 点头定版《页头精简》第 5 节回顾页那行。改前 .rv2-head 实测 60px 高 + 20px margin = 80px，概览卡要等到 y=166 才出现。做法=只藏文字不删节点：① <h1>回顾</h1> 是本页唯一 h1，连同副标语一起用 1px + clip-path:inset(50%) 裁剪（不用 display:none，那会把 h1 从无障碍树摘掉，CDP getFullAXTree 实测仍是 role=heading/level=1）；② .rv2-head 本身改成 position:relative;height:0 —— 零高不占位，但仍是按钮的定位容器；**不能用 position:absolute + 1px**，那样按钮会以 1px 盒为基准、直接跑到卡片外面（第一版就这么错的，探针当场抓到 x=32 落在卡外）；③ 「录入成绩」按钮 **DOM 原地不动**、class 与 data-rv2-add 一字不改 —— 绑定在 js/rvx-data.js:221 的 document 级事件委托里（el.closest('[data-rv2-add]')），跟它在哪个容器无关，搬 DOM 也不会断钩子，但原地不动更稳；只在 CSS 里绝对定位到概览卡右上角（top:22px;right:24px，与卡内 padding 对齐，手机档 17px/16px）；④ 空账号时 js/rvx-data.js:18 会把 #rv2Summary 整块重写成 .rv2-empty（自带一枚同样 data-rv2-add 的按钮），那种情况下页头这枚会悬在空卡上重复 —— 用 `.rv2-head:has(+ .rv2-summary > .rv2-empty) .rv2-primary{display:none}` 在空态收掉它，功能由空态卡里那枚承担。改后实测：概览卡 y 166→86、内容区 y 311→232（让出 80px）；1440/375/390 三档按钮都在卡内、可点、不压总分数字，四科色块 4/4 未被挤压；空账号按钮不重复、空态那枚能开弹窗。验收 47/47（桌面直开、空账号、375/390、软导航首页→回顾、深色），回归 shell5 46/46、dictslim 17/17、dictsearch 6/6、modedouble 8/0。串号 review.css→20261104b（全站只有 review.html 引用它，无 preload 依赖）。禁区未动：任何 js 一行未改、sw.js 只 bump CACHE + 本注、其他页面零改动。上一版 v776 = 计划页页头精简。
const _prevCacheNote92 = 'ielts-hub-v775'; // 11-04 v776 = PAGEHEAD-SLIM-1 第 1 笔（计划页页头精简）：她 11-04 点头定版《页头精简》第 1 节，本笔只做计划页一页。改前 .m-pghead 实测 73px 高 + margin-bottom 26px = 99px 纯空白，日期条要等到 y=197 才出现。做法=只藏文字不删节点：① <h1 class="m-h1">学习计划</h1> 是本页唯一 h1，用 1px + clip-path 的 visually-hidden 藏起来（不用 display:none，那会把 h1 从无障碍树一并摘掉）；② 副标语 .m-pgsub 一起藏；③ 阶段胶囊 .m-phase **不能藏也不能删** —— js/plans.js:608 syncSkeleton() 用 mk.querySelector('.m-phase') 取节点再填 .m-chip/.m-phatime，断了钩子首帧就被 try/catch 静默吞掉变空壳；所以整块搬到日期条右侧（连同「去设置 →」自动跟着走），DOM 里 id/class 一字未动；④ 日期条 grid 从 3 列扩成 4 列（前三条 44px/1fr/44px 与改前完全一致，新加的 auto 列给胶囊）；⑤ 手机 ≤760 胶囊用 grid-column:1/-1 换行到日期条下半行，不挤压 ‹/›。改后实测：日期条 y 197→98、任务卡 y 296→197（正好让出 99px），h1 仍在 DOM，胶囊文字照旧被 syncSkeleton 填上。验收 37/37（桌面直开、375/390、软导航首页→计划、加任务/翻日期/回到今天/往日切换/切回、深色），回归 shell5 46/46、dictslim 17/17、dictsearch 6/6、modedouble 8/0。串号 css/p/plans.css→20261104c（全站只有 plans.html 引用它，无 preload 依赖）。禁区未动：js/plans.js 一行未改、sw.js 只 bump CACHE + 本注、其他页面零改动。上一版 v775 = 会员页英文眉题删除。
const _prevCacheNote90 = 'ielts-hub-v773'; // 11-04 v774 = PLAN-SOFTNAV-COLLAPSE-1（她报「加任务那一块挤成一字一行的窄条」）：病根在**软导航** —— js/common-shell.js 的 swapPageStyles 原来把新 css/p/*.css `appendChild` 到 <head> 末尾，落到本页内联 <style> 之后；同特异度 (0,1,0) 下后出现者胜，plans.css 里老 .m-addrow 的 `display:flex` 就压掉了页面内联的 `display:block`。**直开 /plans.html 正常，点顶栏导航进来必塌，跟网速/缓存无关** —— 她一直是点导航进来的，所以只有她看得见，此前几轮 page.goto 都测不到。两处改动：①新 link 改成 insertBefore 第一条内联 <style>，无内联才 appendChild，对齐直开顺序语义（一处修所有同类页）；②css/p/plans.css 的老 .m-addrow **只摘掉 display:flex**，其余属性全留 —— 施工单原话是「删整条」，但直开实测 padding 18px 14px 10px 里的左右 14px/底部 10px 正是这条规则给的，整条删会让直开也变样、违反「直开零变化」（B1 三方核实一致）。⚠️ materials.html 的 css/p 目前排在内联 style **之后**（全站 22 页里唯一反序），B1 实测零差异；改那页样式时要重新核。串号 common-shell.js→20261104b（含 3 处 preload 同步）、plans.css→20261104b。上一版 v773 = 查词红-2 补刀。
const _prevCacheNote87 = 'ielts-hub-v770'; // 11-04 v771 = SS-DICT-WARM-1（查词单收尾补刀）：进站即预取查词索引。B1 实测「页面刚打开就立刻 Ctrl+K 查词」要等 0.9~1.2 秒，而本地查词本身只有 6~22ms，那段时间全花在首次拉取并解析 data/official-banks/_index.json（6462 条，gzip 163KB）。改动只有一处：js/common.js 的 bindSideSearch 里加 warmDictIndex —— **等 load 之后**再在 requestIdleCallback 里拉，绝不用预取跟首屏抢带宽（W1 preload 那次就是抢带宽把 FCP 挤慢）；无 rIC 退 1500ms；失败静默不重试。focus/input 两处预热原样保留作兜底。命中逻辑、词库、AI 路径一行未动。实测（三轮，元素一出现就查）：31/25/28ms 中位 28ms（判据 ≤300ms）；索引首次请求在 load 后 22~58ms。上一版 v770 = 删英文眉题。
const _prevCacheNote86 = 'ielts-hub-v769'; // 11-04 v770 = EYEBROW-REMOVE-1（她报「英文眉题批」）：删两处装饰性英文大写眉题 —— plans.html 的 `MY STUDY PLAN`、review.html 的 `REVIEW`（她点名要删的正是这俩），同步删 css/p/plans.css 的 `#mkToday .m-eyebrow{...}` 与 css/p/review.css 里的 `.rv2-eyebrow{...}` 段。**没删的**：home.html 那个 `.eyebrow` 里装的是日期（中文，她要看的）；index.html 的 `.kicker` 三处全是中文小标题；speaking 的 LIVE 徽章与 errorbook 的 PAGE MOVED 提示条都不是页头眉题。 design/*.html 样子稿里还有两处同样字样，那是设计存档不属产品页面，不动。纯 html/css 删除、零功能改动；两页 390 档实测 h1 仍在、无眉题残留、无左右滑、零 pageerror（8/8）。串号：plans.css→20261104a、review.css→20261104a。上一版 v769 = 查词提速。
const _prevCacheNote85 = 'ielts-hub-v768'; // 11-04 v769 = SS-DICT-LOCAL-1（她报「Ctrl+K 查词太慢」的 A+B）：①**A 本地先查**：aiLookup 回车后先查 DATA.words（她既往查过、已入词库的词）+ `data/official-banks/_index.json`（六本官方词书去重合并 6462 条 / 418KB raw / 163KB gzip，懒加载、失败静默、不进 install 那 47 条而走 idle 补装），命中即用本地字段渲染同格式卡、**不发 AI、不动词库**（查词卡是「查」不是「加」，她不点「加入词库」就不写 DATA.words）；未命中或索引未加载完则原样走 AI 路径，行为与改动前完全一致。变形归一只做「去词尾」单方向（复数 / -ed / -ing / -er / -est + 双写辅音），不做反向派生。②**B 上游收窄**：前端显式传 `{json_mode:true, max_tokens:256}`，服务端对 service==='words' 且前端没传时也兜底 256 —— 查词是微内容，4096 的默认窗口纯浪费生成时间；aiJson 容错与错误卡路径照旧，输出字段不变。**禁区未动**：stream/D 方案不动、callRelay 其它调用方与素材页/评分现有 json_mode 不动、喇叭与自动读不动、hubSave 写盘合并（R1 成果）不动。上一版 v768 = T18-AUDIOCACHE-1。
const _prevCacheNote84 = 'ielts-hub-v767'; // 11-04 v768 = T18-AUDIOCACHE-1：handleStatic 的无 query 分支里，`destination === 'audio'` 命中缓存时直接返回、不再后台重拉。病根：原代码 `const netPromise = fetch(req)` 在判断 cached **之前**就创建，命中时虽然返回 cached（快），但那份网络请求已经发出去了 —— 实测「只播 Audio、完全不碰 warmCache」= 11 笔 / 505246B，与「进一次听写」的总流量一模一样，她一天开十次听写就是 5MB 白流量。修复后：bubble 缓存已满场景 505246B → **0B**；mechanical 全空场景 189716B → 176242B（1.00x）。为什么只挑 audio：`destination === 'audio'` 只可能来自 Audio/Video 元素，页面自己的 fetch 恒为 ''（B2 实测：带 Range 的 fetch 也还是 ''），所以不会误伤 warmCache 的补写与任何页面请求。安全性实测：Audio 要 Range 却收到 200 全量时可以正常播放（playing=true / duration 0.348866 / readyState=4 / error=null）；断网重放也出声（bubble/2 498ms、bubble/4 413ms，均 playing=true）。**未动**（禁区）：非 audio 资源（js/css/json/png/ico/mp3/webmanifest）的 SWR 一字不动 —— 实测 fetch css 仍正常 revalidate；`?v=` 分支不动；PRECORE/IDLE_PRECACHE 清单不动；handleNavigate 不动；cacheable/putInCache 不动。**不采纳 B2 的第三条附加**（把 warmCache 的 setTimeout(res,4000) 改成 0）：他判断「Audio 不再落缓存所以 warmCache 成唯一来源、4 秒没意义」，但实测反证 —— 缓存 miss 时 Audio 那条照样走 handleStatic 的 miss 分支并 putInCache（实测落缓存 5/5、服务端 5 笔 176242B），Audio 并不是「永远不落缓存」，只有命中时才短路。4 秒延后的作用是「先让 Audio 那条 miss 路径把缓存填上，warmCache 只补落空的」，改成 0 会退回 v767 之前的 2.08x 双下载。上一版 v767 = T13 补笔。
const _prevCacheNote83 = 'ielts-hub-v766'; // 11-04 v767 = T13-AUDIOPUT-1 补笔（B2 审计 1 红 2 P2 全采纳）：①**红**：warmCache 加「已有副本就跳过」。原因是 sw.js 无 query 分支是 stale-while-revalidate，caches 命中也会 fetch(req) 并重写，所以裸 fetch 全是真下载 —— bubble 11 条本就在 PRECORE，每次进听写实测 +505KB（2.00x）。修后回 1.00x。②**P2**：缓存名不再「取最后一个匹配」（会被诱饵 v709 劫持）。改成：先对全部匹配缓存查一遍，任一已有就不拉；全没有才 fetch 一次、clone 后写进所有匹配缓存 —— 既不双下载，双缓存下也必定写进当前版本。③**P2**：退避 4×2s → 6×2s（12 秒），首访 SW 接管实测 8858ms，8 秒刚好差一点。④**P3**：两处注释改准 —— Range 不是 Audio 元素主动带，是浏览器 HTTP 缓存层对已缓存条目合成的切片请求；「B1 假 0/5 的根因」那句删掉（B1 那次是探针没等 SW 接管，与首访退避不是同一件事）。禁区未动：keyAudio/keyClick/fb 三个函数体、500ms/3000ms 两处守卫、PRECORE/IDLE 清单。上一版 v766 = T13-AUDIOPUT-1（warmKeys 显式落缓存）。
const _prevCacheNote82 = 'ielts-hub-v765'; // 11-04 v766 = T13-AUDIOPUT-1（她早上拍板「修」）：warmKeys 新增 warmCache()，对当前音色全部文件 + correct/error 显式 fetch 并 caches.put，不再依赖 SW 的 handleStatic 顺带写。修的是「部署 bump 后第一轮，断网敲键没声音」：那一轮 SW 缓存刚清空、浏览器 HTTP 缓存还在 → Audio 元素的 media 请求带 Range 拿到 206 → cache.put 在规范层抛 TypeError（Partial response (status code 206) is unsupported）→ 落不了缓存。实测证据：fromSW:true + 5 条 206 + 缓存 0/5（_probe_slim2_mediastatus_1104.cjs 形态 B 可复现）。三条硬约束写进 js/wd-dict.js 注释：①fetch 不带 Range（一加必 206）②只 put status===200 ③单条 catch 不打断循环。另处理一个坑：首访时 SW 要 8~9 秒才接管，caches.keys() 里还没有本版本缓存 → 退避重试 4 次×2 秒，覆盖装配窗口（B1 整晚那个 fromSW:false 假 0/5 就是它）。承重件一行未动：keyAudio 建池 + volume=0 静音 play 逼解码、500ms/3000ms 两处守卫、keyAudio/keyClick/fb 三个函数体 —— 判据 6（首键 ≤150ms）不回归。上一版 v765 = SLIM-2 收尾（warmKeys 3000ms 兜底 + 补 bump）。
const _prevCacheNote81 = 'ielts-hub-v764'; // 11-04 v765 = SLIM-2 收尾（warmKeys 3000ms 兜底 + 补 bump）：B2 的 P2 指出 play() 的 promise 在慢设备上可能数秒不 resolve，预热元素会一直占音频通道（volume=0 她听不见，但 11 个元素同时在播）。修法=在原 500ms 收尾之外再加一次 3000ms 收尾；⚠️ 两处都不是「无条件 pause」，全带 `volume === 0 && !el.paused` 判据 —— keyClick 与预热共用同一 Audio 对象，她进题 500ms~3s 内打字是常态，无条件 pause 会吃掉她那一键（B2 自己抓的竞态，竞态专项 9 个时间点 10/10 验证）。promise 路径（p.then/p.catch）同样带守卫，currentTime 一律不在预热里碰。补 bump 的原因：e0badaeb 改了 js 本体却漏 bump + 漏改 ?v= 串，SW 不重装、页面仍拿旧串，改动等于没上线。上一版 v764 = SW-INSTALL-SLIM-2（idle 补装 92 条 / 4039KB + mount 预热）。
const _prevCacheNote80 = 'ielts-hub-v763'; // 11-04 v763 世代：SW-INSTALL-SLIM-1 第一批（PRECORE 138→47 条分波 + min(20s,剩余deadline) 钳单条 + 全局 30s deadline）；同代三笔 ffe8db31/fcc6fe8d/a648f2c2。
const _prevCacheNote79 = 'ielts-hub-v762'; // 11-04 v762 世代：W0 PREFETCH-HTML-ONLY-1（预热只收 HTML + 等 SW ready 再让 3 秒）。
const _prevCacheNote78 = 'ielts-hub-v761';  // 11-04 v761 世代：PERF-WRITE-1 一次作答只落一次盘（js/practice.js →20261104a）。
const _prevCacheNote77 = 'ielts-hub-v760';  // 11-03 v760 世代：RV-FIX5-10c 窄屏断点 640→860px + break-word。
const _prevCacheNote76 = 'ielts-hub-v759'; // 11-03 v759 世代：RV-TIMER-DESC-1 计时弹窗文案与记住值对齐（记住值命中且≠默认时改说「上次用了 X 分钟」；exam-timer.js 20261102b→c 三处引用全改）。
const _prevCacheNote75 = 'ielts-hub-v758'; // 11-03 v758 世代：RV-FIX5-10b 手机档（≤640px）.ex-blankw.rv-open 封 max-width:100% + flex-wrap，绿字允许换行，390 档不再被右栏裁（桌面一行并排不动）。
const _prevCacheNote74 = 'ielts-hub-v757'; // 11-03 v757 世代：11-03 本世代两笔：【RV-FIX5-12】11-03 题干指令按题目原文（她真机：「系统答案两个词、题干却要求一个词」）——instrFor 阅读也改为自带 group.description 优先（与答案键同源、唯一权威），拼接口径降为兜底；另给 Building A Castle Q10 加备选答案 alts{'10':['wedges']}。bank.js →20261103h。上一版 v755 = RV-FIX5-10/11。 【RV-FIX5-13】11-03 RV-FIX5-13 错题点不出讲解（她真机）：aiExpTargetOf 加容器级兜底（祖先[data-q] → 所在行控件），填空整框 .ex-blankw / 框内绿字 .ex-ca-in / 矩阵格 / 共享组容器都能触发；答题卡 .ex-num[data-jump] 复盘态跳题后顺手打开该题讲解（题号行在底栏、原来 aiExpTargetOf 判空）。bank.js →20261103i。上一版 v756 = RV-FIX5-12。
const _prevCacheNote72 = 'ielts-hub-v755';  // 11-03 DICT-HEADER-SLIM-1（她 10:0x 截图 + 领头牛裁定形态 A）：听写态只留「输入横线 / 音标 / 音标右侧话筒 / 模式钮」，另留不知道与已掌握两个功能出口；头部回站链·上一词·书钮·设置齿轮·全屏、底部工具行、头部进度条、题内提示行、底部第二颗「再读一遍」、输入框下那行小字 全部在听写态不显示。实现只有 CSS（从 #practiceBody 的 .practice-word-area.pw-dict 反推）+ js 里一处隐藏 #wdExample 占位（挡住 practice.html 的 refreshExampleFor 异步补例句把答案拼写印出来）。零 DOM 删除、零判分/落盘/SRS 改动，看词选义与听音选义一个像素未动。验收 _probe_dictslim_1103 17/17 × 四档（1280/390 × 浅色/深色）；回归 precore 148/0、shell5 46/46、latespk 21/21、modedouble 8/0。css/p/practice.css →20261103a、js/practice.js →20261103b（practice.html 两处引用同 bump）。
const _prevCacheNote73 = 'ielts-hub-v756'; // 11-03 【RV-FIX5-10/11】她 11-03 晚场两条（SSR）：⑩「正确答案该在同一个框内右边，不是跑到框外把题干盖了」——根因=td 里 .ex-blankw 钉死 118px（段落档 min118/max200），她的错词+正答绿字排不进去、表格题还出 td 30px；修法=打开答案态框宽自适应（rv-open 放开 118/200 与 td 截断，input 按她的词长定宽 ch，绿字落在同框内紧跟红字右边），关闭态/重跑统一还原 rv-open+内联宽。⑪「未勾的正答绿太淡」——根因=做题态多选限数的 .dis 淡度 .35 带到复盘；修法=复盘打开答案态根标记 rv-ans-on + #examRoot.rv-ans-on .ex-opt.dis.right{opacity:1}，未勾普通项仍 .35 不加扰。判分数据零碰、做题态零碰。验收 _probe_fix5blank2_1103 14/14 + 六支回归全绿。bank.js/bank.css →20261103h/g。【合流说明】本笔从 3465440d 分出、与 A1 的 13e54274（v755）是兄弟——rebase 到 13e54274 之上后顺延 v756 + note72，两段 note 都留、版本号向前不重复。上一版 v755 = DICT-HEADER-SLIM-1（听写瘦身）。
const _prevCacheNote71 = 'ielts-hub-v754';  // 11-03 RV-FIX5-9 多选提交丢选择（她 11-03 真机②「多选题选的答案提交就消失了，变成我什么都没选」，B2 根因报告 + ssr 自查双根因都修）：①交卷链——collect() 的结果在 submit()/score() 里一直是局部变量从不回灌 EX.user，多选 ex-check onchange 又只调 syncCboxDis+paintSheet 不调 saveDraft（pill 单选写了）→ 只做多选直接交卷时 EX.user 还是 startTest 的空对象，判分对（score 读 DOM）但复盘态 applyAnswer 读 EX.user 全空 → 勾选消失。修：doSubmit 在 score() 之前 EX.user = collect() 回灌一行。②只读回看链——落库明细 d.user 是多选的逗号串（ua.join(',')），openLastResult 原样塞回 EX.user[qn]="A,D"，applyAnswer 多选分支原写法 [val] 包成 ["A,D"] 跟单值选项 "A"/"D" 永远配不上 → 查看上次结果勾选全空（radio 整串比对幸存，与她截图「radio 有选中、多选全空」吻合）。修：applyAnswer cbox 分支字符串值按逗号/斜杠/空格拆回数组（checkbox value 是单字母无内嵌逗号，拆分安全）；数组值（草稿链）原样走。辅修不加（多选 onchange 补 saveDraft 会每勾一项闪一次 Saved，不做）。判分数据零碰：EX.user 回灌只读 DOM、不写 d.ok/d.right/EX.marks。bank.js →20261103g。上一版 v753 = RV-FIX5-4/6/7/8（①③④⑤）。
const _prevCacheNote70 = 'ielts-hub-v753';  // 11-03 MODE-DOUBLE-READ-1：听音选义切走再切回同一个词连读 2 次（她 11-02 定的「每题一次」红线）。根因：自动朗读是裸 setTimeout(300)，句柄没人管 —— cancelSpeak 清不掉，切模式/切题时多个 pending 定时器各自 speakN；同一个词被渲染两次就排两次 300ms。修法：自动朗读统一走 _scheduleAutoSpeak（同一时刻只留一个定时器 + 同一个词 800ms 内不重复），cancelSpeak 连它一起清；手动点喇叭/快捷键 R 不去重，连点几次播几次，行为一字不变。判分/落盘/SRS 零改动。验收：_probe_modedouble2 8 项 0 红（桌面 1280 + 手机 390），未修版第 ④ 项红（同一词连渲染 2 次读 2 次）；回归 precore 148/0、shell5 46/46、latespk 21/21。js/practice.js →20261103a（practice.html 单处引用同 bump）。
const _prevCacheNote66 = 'ielts-hub-v749';  // 11-03 RV2-DETAIL-UNDEF-1（B1 报的 P2）：回顾页记录详情弹窗头部会渲染出「undefined 9/10」，根因是旧格式记录的 parts[0] 没有 label 字段，js/scores.js 的 renderMockList 直接把 p.label 拼进徽章。修法只在渲染处加空值兜底：无 label 时按该科 parts 定义取对应档位名（听力第 1 条 → P1），取不到就显 'Part'；有 label 的新格式记录一字不变。不动筛选/落库/删除转发，不动 v744 toast 挂层。验收：_probe_detailundef 10 项 0 红（造一条旧格式 + 一条新格式真开弹窗），同支探针跑未修的 HEAD 2 红；回归 precore 148/0、shell5 46/46、latespk 21/21。js/scores.js →20261103a（review.html 单处引用同 bump）。上一版 v748 = AUTO-READ-RESTORE-1。
const _prevCacheNote64 = 'ielts-hub-v747'; // 11-03 HEADING-BLOCK-DEL + MAP-MATRIX（heading 题整块隐藏仍可作答 + 地图题答题卡矩阵）。上一版 v746。 // 11-03 AUTO-READ-RESTORE-1（她 11-02 亲口翻案，领头牛放行）：「其实我想的是所有地方都是自动读……我没让你把这个功能删掉」。恢复两处自动读：①口语练习页切题自动读一次当前小题（js/sp-list.js 的 p1FlowInit render 里，只读当前这题、不连读）；②口语模考进题自动读一次题干（js/mock.js 的 askQuestion，P1 小问/P3 追问；P2 准备与陈述没有 allowTts → 照旧不读）。喇叭键全部保留=重播，不叠加。她 10-31 真正嫌的两件事本笔都不重演：不「读一半就停」、不「一直在读」——每题只有一个触发点。探针/调试一律 --mute-audio 静音（她反感的是外放吵她，不是自动读本身）。验收：_probe_autoread 14 项 0 红（基线 v745 上 8 红，证明判据有区分力），覆盖切题读一次/再切又只一次/喇叭重播一次/模考进题一次/模考下一题一次/en-GB；手机 390 档自动读正常且整页无横滑；回归 precore 148/0、shell5 46/46、latespk 21/21。sp-list.js 与 mock.js 均 →20261103a。上一版 v747 = HEADING-BLOCK-DEL + MAP-MATRIX。
const _prevCacheNote65 = 'ielts-hub-v748'; // 11-03 AUTO-READ-RESTORE-1 恢复口语页/模考页进题自动读。上一版 v747。
const _prevCacheNote63 = 'ielts-hub-v746'; // 11-03 BANK-KEY-FILL-1 补齐 8 篇答案键（33 题）。答案在 bank/answers/*.json、不带 ?v=，SW 对无 query 的 json 走 SWR → 已缓存过的用户不 bump 就一直拿旧答案文件（10/16 定过的规矩）。本笔只改数据：Hollies 15-20、Accommodation 15-20、Ocean Edge 16-20、Melbourne Zoo 16-20、Home Improvement 12-15、Outdoor Education 17-20、William Gilbert 12-13、Foot Injuries 30，共 32 个缺键 + 1 个错键（Foot 27 原存 "C,E"，E=冰敷在解析里被明确否定、且并集成 {A,C,E} 三字母对不上题干 Choose TWO → 这组两题恒判错，改为 C）。判分代码一行未动。上一版 v745 = BANK-SHARED-MAP-1。 // 11-03 BANK-SHARED-MAP-1 地图/配对题被误判成「共享选项组」：isSharedGroup 原来只看「组内部分题带 options」，于是 map 115 组 608 题 + matching 245 组 1233 题全被当成共享组，annotateGroups 把组内答案并成 gset。实测两处真错：①`_hasKey(key,gset)` 只要 gset 非空就不看单题有没有答案 → Home Improvement 地图组 4 道缺键题被算进分母还恒判红（该项全库仅此 1 组 4 题）②`detail.right` 取 gset 并集 → 复盘「正确答案」列显示成整组答案（实测 355 组 1814 题）。判对错本身没受影响：map/matching 作答值是字符串，Array.isArray(ua) 为假，从不进 setEq 分支，逐题各判。修法 = 收窄 isSharedGroup 到 multiple-choice 一行 guard，不动 annotateGroups/setEq/判分主链/渲染。真共享组（多选 102 组 213 题，含 William Gilbert 11-13 合并行）行为一字不变。验收 _probe_sharedmap 17 项 0 红（基线 07e25a53 上 5 红），覆盖缺键不进分母、复盘正答按单题 key、共享组照旧计分。回归 precore 148/0、shell5 46/46。js/bank.js →20261103b（bank.html 单处引用同 bump）。遗留：已落库的历史记录 detail.right 仍是旧并集值，不在本笔修（B2 点的 P2）。上一版 v744 = TOAST-TOP-LAYER-1。 // 11-03 HEADING-BLOCK-DEL + MAP-MATRIX（她口径两笔）：① heading/标题匹配题【做题态】题号下方那块「Paragraph/Section 占位词 + 答案胶囊 + ✕」整块不再显示（她原话：heading 题的题干就是原文的各自然段，下面这块是多余的）。做法是整行 .ex-q--headghost 视觉隐藏、**DOM 一行不删** —— 原文段落上方的虚线框靠它取题号与选项池，collect/判分也走同一套 .ex-drop；真删 DOM 会让题答不了。配套两处必要修补：原文段落槽加题号标签（题目行藏了，用户否则不知哪个框对应第几题，dgPlace/dgSyncQ/dgClearEl 三处重写都带上）；段落字母识别补「Section A」「Section A - 标题」写法（原先只认「A 正文」「(A) 正文」，Music Language We All Speak、New Zealand Seaweed 两篇因此零锚点槽 → 题目行一藏就没法作答）。选项池（罗马数字那排）、原文分段、判分链、复盘态一律不动。② 听力地图题按她给的官方答题卡形态改成矩阵（表头 A–I 一排、每行一道题、交叉处一个圆点），原来是每题下面竖排一列字母 → 一屏放不下。答案口径零改动（EX.user[题号]=字母，collect/判分/落库全复用）。验收：_probe_headmap 16 项 0 红（基线 07e25a53 上 11 红）；_probe_sharedmap 18 项 0 红（探针同步到矩阵口径）；全量 heading 槽覆盖 41/41 篇；手机 390 档 9 项 0 红（整页无左右滑，矩阵容器内滚动、格子触屏可点）；回归 precore 148/0、shell5 46/46。js/bank.js →20261103c（bank.html 单处引用同 bump）。上一版 v746 = BANK-KEY-FILL-1。
const _prevCacheNote62 = 'ielts-hub-v744'; // 11-03 TOAST-TOP-LAYER-1 弹层开着时提示被 top layer 盖住（回顾页空值保存「没提示」）。上一版 v743。
const _prevCacheNote61 = 'ielts-hub-v743'; // 11-03 COACH-ERR-KEEP-1 口语陪练 AI 失败不吞消息。上一版 v742。
const _prevCacheNote60 = 'ielts-hub-v742'; // 11-03 GRADE-RELAX-6 判分放宽（连字符/撇号/日期等价）。上一版 v741。
const _prevCacheNote59 = 'ielts-hub-v741'; // 11-02 LISTEN-RV-TOP-1（ssr）：单篇听力交卷复盘顶栏四钮不可达（源头 submitted 守卫 + mountReviewTools 兜底摘 inline）。上一版 v740。
const _prevCacheNote55 = 'ielts-hub-v738'; // 11-02 P2 清理批（.ex-opt .ex-ca 死规则删 + #exAiHandle 去 stopPropagation）。上一版 v737 = RV-FIX5 六笔。
const _prevCacheNote58 = 'ielts-hub-v740'; // 11-02 挑刺两修（SSR 第三道复查，v740）:多选 AI 触发兜底 + 分栏拖动固定参考。上一版 v739 = PLAN-VISIBLE-4（A1）/挑刺两修并行同轮。
const _prevCacheNote69 = 'ielts-hub-v752'; // 11-03 RV-FIX5-7/8 她④「这个note也有一堆毛病中间多出来一条线」=划词工具条中间 hr 竖线整删（B2 P2 同项）+⑤「note是蓝色高亮不是下划线」=.ex-nt 橙色下划线改蓝色高亮块 #b3d7ff（爱听写机考口径）。bank.js/bank.css →20261103f。上一版 v752 = RV-FIX5-6。
const _prevCacheNote68 = 'ielts-hub-v751'; // 11-03 RV-FIX5-6 她真机③「把右边分成两块，不是弄一个悬浮框」：AI 讲解从 sticky 浮层改文档流真分栏——点开讲解右栏上下两块（上 #exQScroll 题干滚动区 / 下 #exAiCard 面板定高 --ex-ai-h / 中缝 #exAiHandle 可拖），去 sticky 去投影；✕ 关闭摘 ai-open 还原单列；手机档 scroll 壳 display:contents 交还页面滚动、讲解贴题目下方限高 42vh；renderPassage 切篇重挂壳（幂等）。bank.js/bank.css →20261103e。上一版 v751 = RV-FIX5-4。
const _prevCacheNote67 = 'ielts-hub-v750'; // 11-03 RV-FIX5-4 她真机①「开不开答案都一样」根修：关闭答案态按「她勾没勾」收放正答标（胶囊 .right:not(.on) / 矩阵 td.mx-right:not(:has(input:checked)) 关闭态藏、勾对绿照显），applyReviewToggles 打开态补标未勾正答项（FIX5-2 承诺的「选项本题内 green 标」此前无人挂）。bank.js/bank.css →20261103d。上一版 v750 = MODE-DOUBLE-READ-1。
const _prevCacheNote57 = 'ielts-hub-v739'; // 11-02 PLAN-VISIBLE-4：计划页两个真 bug（tab 塌掉+标题写死，A1 修）。上一版 v738 = P2 清理批。
const _prevCacheNote56 = 'ielts-hub-v739'; // 11-02 挑刺两修（SSR 第三道复查实锤，她多选必踩）：①多选题 AI 讲解触发死路——aiExpTargetOf 的 qn 取值链缺 .ex-cbox[data-q] 容器兜底与 data-qns（合并题号 9 10）解析，多选/共享组点选项永远开不出讲解卡，补两条兜底；②AI 分栏拖动 sticky 自锁——面板 sticky bottom:0 高度一变 top 跟着动，move 里重读 top 让增量被吃掉（想拖大只挪 13px 咬死），改 pointerdown 固定参考（downH + downY - clientY）。bank.js →20261102i。上一版 v739 = PLAN-VISIBLE-4（A1 计划页两真 bug，与我笔并行同轮上线）。

const _prevCacheNote54 = 'ielts-hub-v732'; // 11-02 MAT-DEAD-THEMEBTN-1：素材页死按钮「切到深色」删除。上一版 v731 = RV-BLANK-CA-2。
const _prevCacheNote53 = 'ielts-hub-v731'; // 11-02 RV-BLANK-CA-2：填空正答框内绿显。bank.js →20261101v。上一版 v729 = WD-DICT-TYPE-2。
const _prevCacheNote52 = 'ielts-hub-v729'; // 11-02 WD-DICT-TYPE-2：听写打字型收尾（不泄答案/文案对上/模式菜单可反复开）。上一版 v728 = RV-COLOR-LOGIC-1。
const _prevCacheNote51 = 'ielts-hub-v728'; // 11-02 RV-COLOR-LOGIC-1：复盘对错颜色口径统一（对=浅绿/错=红），bank.js →20261101t。上一版 v727 = EXAM-QNBAR-LEFT-1。
const _prevCacheNote50 = 'ielts-hub-v727'; // 11-02 EXAM-QNBAR-LEFT-1：练习/模考题号栏统一移左。上一版 v726 = RV-AI-EXPLAIN-1。
const _prevCacheNote49 = 'ielts-hub-v726'; // 11-02 RV-AI-EXPLAIN-1：复盘态点答案右下角出 AI 讲解。bank.js →20261101s。上一版 v725 = WD-OPEN-LAG-1。const _prevCacheNote48 = 'ielts-hub-v725'; // 11-02 WD-OPEN-LAG-1：词库默认只展开第一组 + 换书 _readStore 整轮一次。wordbank.js/words.js 串 →20261102c。上一版 v724 = EXAM-TIMER-POP-DUP-1。
const _prevCacheNote47 = 'ielts-hub-v724'; // 11-02 EXAM-TIMER-POP-DUP-1：删计时弹框残留旧「自定义」死输入行（v723 两行时长并存，querySelector 永远绑步进器 input，旧行点了没反应）。exam-timer.js 20261102a→b，SW v723→v724。
const _prevCacheNote46 = 'ielts-hub-v723'; // 11-02 EXAM-TIMER-POP-DUP-1：删弹框残留旧「自定义」死输入行（v723 遗留，点不了）。exam-timer.js 20261102a→b（bank.html defer+预载、writing.html defer）。上一版 v723。
const _prevCacheNote45 = 'ielts-hub-v722'; // 11-02 RV-TOP390-1：复盘态手机 390 顶栏两开关出屏修复（rv-tooled 类放行换行）。js/bank.js 串 → 20261101q。
const _prevCacheNote44 = 'ielts-hub-v721'; // 11-02 BK-LOAD-CANCEL-1：进场载入页出「取消加载」+ 25s 超时兜底。js/bank.js 串 → 20261101p。上一版 v720。
const _prevCacheNote43 = 'ielts-hub-v720'; // 11-02 RV-RVROW-RETIRE-1：交卷后逐题结论条「Q1 Incorrect / Show」整块退役（渲染+样式+监听零残留，判分与上色一字未动）。js/bank.js 串 → 20261101o。上一版 v719。
const _prevCacheNote42 = 'ielts-hub-v719'; // 11-02 EXAM-SCORE-COMPACT-1（她 8 条口径）：成绩卡整删（.fx-score 分数块/WHAT TO DO NEXT/fx-chip 筛选全族删除，addScoreCard/fxNext 函数退役）；交卷=回看同页（不另做成绩视图）；对错个数顶栏一行小字 .ex-score-mini；「显示答案/显示高亮」开关住顶栏（mountReviewTools + rv-noans/rv-nohl 根类，默认答案关/高亮开）；答题卡红绿底色不动；分隔线拖动（exSplitHandle）交卷态不没收。bank.js/bank.css 串 → 20261101n。未判分横幅 .fx-noscore 保留（如实告知，非成绩卡）。上一版 v718 = WD-DICT-LOG-1。
const _prevCacheNote41 = 'ielts-hub-v717'; // 11-01 TREND-AXIS-1：趋势图纵轴自适应 + 按对题个数视图（她点头样子稿 1:1 落地）。
const _prevCacheNote40 = 'ielts-hub-v716'; // 11-01 AI-ERR-RELAY-1：全站 AI 失败提示统一说人话（共享层 js/common-ai.js 新增 aiErrMsg(e)，全站唯一一张 code→人话表）；PRECORE common*.js 串 20261031o→20261101k。
const _prevCacheNote39 = 'ielts-hub-v715'; // 11-01 BANK-ESC-DELEGATE-1（Esc 常驻委托，bank.js 串 20261101h）+ WD-BSPOP-FIT-1（practice.css 串 20261101b）。
const _prevCacheNote38 = 'ielts-hub-v714'; // 11-01 WD-BSPOP-FIT-1：手机档切书面板出界 + 最后一项被 dock 压住（practice.css ≤700 档），practice.css 串 20261101a→20261101b。
const _prevCacheNote37 = 'ielts-hub-v713'; // 11-01 WD-PERF-HANG-1：换词本落盘改增量 + 镜像只 diff 活跃库 + 切库重绘让帧（practice/home 的 wordbank.js、words.js 串 20261023s/20261023r→20261101a）。
const _prevCacheNote36 = 'ielts-hub-v712'; // 11-01 BANK-DONE-ROW-1 笔 2
const _prevCacheNote35 = 'ielts-hub-v711'; // 11-01 BANK-DONE-ROW-1 笔 2（做过篇目点击弹「看上次结果/再做一次」）
const _prevCacheNote34 = 'ielts-hub-v710'; // 11-01 RV-REBUILD-FULL-1 三笔（重建重挂 003acb4f + chip 补回 d087d703 + chip 语义粒度修 69ce7c47）：回顾页整页重建，修深链 ?sub=（含 breakdown/overall/speaking 三个老值）、openDetail 的 CSS.escape、整卷行「看上次结果/重新做一遍」两按钮；记录筛选按 recCat 语义粒度（整卷模考 kind 恒为 part，真粒度看 gran）。
const _prevCacheNote33 = 'ielts-hub-v709'; // 11-01 MOCK-SPLIT-DRAG-1：阅读练习/模考桌面端分栏可拖动，刷新保持，手机上下布局不变。
const _prevCacheNote32 = 'ielts-hub-v708'; // 11-01 BANK-DONE-ROW-1 笔 1（机经列表撤题数列 + 撤做过区进度条）
const _prevCacheNote31 = 'ielts-hub-v707'; // 11-01 READ-HIGHLIGHT-1：题干与原文共用划词高亮、保存和重开回显；题号旗标保留，答题控件不纳入标注。
const _prevCacheNote30 = 'ielts-hub-v706'; // 11-01 MOCK-RATE-RANGE-1（她 14:3x「倍速不要弄这么多档 0.7-1.5 就够了」）：RATE_MIN/MAX 0.5/2.0 → 0.7/1.5，档数 16→9（0.1 一档照旧，默认仍 1.0）。① 收回她 10/20 亲口定的原始区间，前一版 MOCK-AUDIO-CTRL-1 按 SSR v2 稿扩到 0.5–2.0 被她否掉；② 1.3 仍在区间内，_probe_examtools_1018 / _probe_t031_audio / _probe_72_1023 三支硬编码 selectOption('1.3') 不用改判据；③ 探针判据同步改口语：'覆盖 0.5–2.0 且至少 6 档' → '覆盖 0.7–1.5 且至少 6 档'（仍是序数比较，不写死档数）。实测 9 档 0.7/0.8/0.9/1/1.1/1.2/1.3/1.4/1.5，_probe_t031_audio 全绿、_probe_examtools_1018 16/17（D1 存量噪声）。js/bank.js 引用串 20261101b → 20261101c。上一版 v705 = UNIFIED-EXAM-UI-3 笔2 收尾。
const _prevCacheNote28 = 'ielts-hub-v704'; // 11-01 SPK-CORE-FALLBACK-1（普通级）：js/sp-core.js 没加载出来时口语页只剩空壳、题卡区一片空白（实测 h=2px），人不知道是网络抖了还是站坏了。speaking.js 的 ready 回调一开头先查 populateFreqOptions/getFiltered/freqTag/refreshStateOptions 四个函数在不在，缺了就插一张可读提示卡（标题「题库数据没加载出来」+ 一句「多半是网络抖了一下，点下面重试就行」+ 重试钮，走 location.reload）+ 给题卡区一个明确空态，然后跳过后续初始化（否则会连炸一串）。切 tab 那处 populateFreqOptions 也加了 typeof 软守卫。正常加载时这四个函数都在 → 一个分支都不进，原链路一行不变。speaking.html 在 PRECORE → CACHE v703→v704。 // 11-01 SETTINGS-BLANK-1（P0，她 09:47 报「设置页右侧全空」）：settings.html 去掉 PANES 里已不存在的 'profile'、默认组改 targets、别名链一步到 targets、兜底标记改 targets。settings.html 在 PRECORE（裸路径预缓存只在 install 刷）→ CACHE v701→v702。
const _prevCacheNote29 = 'ielts-hub-v702'; // 11-01 FE-DEAD-SWEEP-ALL-1-B5-A2（页面层）：删掉 24 个真零调用函数（10 个 js 文件，-240 行），换串 20261031n + CACHE v700→v701。const _prevCacheNote27 = 'ielts-hub-v700'; // 10-31 MOCK-AUDIO-CTRL-1 rebase 到 main 世代后换代（main 侧已到 v690）：她 10-28 报的四点：没进度条/不能调倍速/音量只能开关/播放键抖动；稿=design/MOCK-AUDIO-CTRL-1-模考上栏样子稿-v2-2026-10-31.html，B 17:0x 记档授权：音量滑杆新增✓、倍速扩 0.5-2.0✓、播放暂停合一跳过——paintAudio 早已按态换图标，稿子写重了）。【①播放键抖动·根因实测】「Audio is Playing」那行原为流内 flex 子项，播放时由 hidden 变可见 → 凭空多 96px+gap12=108px，整组右推：1280 播放键 x 163→270、进度条宽 660→552；390 播放键 12→116（出屏）。改成绝对定位顶部角标（position:absolute + pointer-events:none），节点与显隐逻辑一字未改，实测两个档位位移归零。【②音量滑杆·真缺失】CSS 里早就有 .ea-vsl 的样式，但**从来没有任何地方渲染这个节点** —— 所以滑杆从未存在，这才是「音量只能开关不能调大小」的真因。新节点用 0-1 取值（既有 [data-avsl] 处理器与静音键回写都是 0-1 口径，用 0-100 会互冲），带 aria-label，两模式都渲染、窄屏由 CSS 收起。【③倍速 0.5-2.0】原 0.8-1.5/8 档 → 16 档，v2 稿的六个标准档全在里面。**没砍成六个离散值**：四支回归探针（examtools / t031_audio / 72_1023 / 1020ui）读 #eaRate 的 options 与 value（有的直接 selectOption('1.3')），砍档会让它们集体转红，而它们守的是「考试模式不给倍速」这条口径铁律；且 0.1 一档是她 10/20 亲口定的，扩范围不改颗粒度才是最小改动。【④对齐 A1 上栏笔1】倍速 select 与音量键统一 36px 高/8px 圆角（原来 select 原生撑到 44px、圆角 7px）；播放键照 v2 稿放大到 44px 圆形（窄屏 40px 保可点区）。【口径没破】locked（考试模式）仍藏掉播放/进度/时间/倍速，音量键保留（真机考只有音量可控）；进度条拖动、键盘 ←/→、单句遍数、盲听眼睛键全部沿用。【验收】_probe_actrl_1031 34/0（倍速范围与真实 selectOption、滑杆拖动/静音联动/记忆、抖动零位移两档、考试模式口径、深色与暖色两档、窄屏无溢出与 36px 对齐）；回归 precore 133/0、examtools 16/1（那 1 红 D1 撤改动跑基线同样红，存量）、72_1023 全绿、t031_audio 全绿。js/bank.js 与 bank.html 都 bump 到 20261031b。上一版 v687 = MOCK-LOADING-PAGE-1。 // 10-31 MOCK-LOADING-PAGE-1（她 10-31 15:3x「进练习或模考时的加载页面不好看」）：只换**进考场那一刻**的载入页，目录列表的骨架屏与四态一个类都没动。【做法】js/bank.js 新增 bkLoadPage()：试卷图标（内嵌 svg 描边，不用字符/emoji）+ 外面一圈旋转进度环 + 右下三个脉冲点 + 标题 + 副行 + 不定量进度条 + 一行「第一次加载需要几秒钟」。fetchWithStates 原来那句 bkSkeleton(6)+bkStateBox('loading',…) 换成它 —— 六根灰条本是**目录列表**的形态，搬到全屏白底的考场上就成了她说的「不好看」。三处调用点各传 lpTitle/lpSub：单篇（IELTS Reading/Listening · 阅读练习/听力练习）、完整阅读模考（Full Test · 40 题）、完整听力模考（同）。【钩子一个字没改】仍是 .bk-state + data-bk-state="loading" + [data-bk-act=loading]，失败态「重试」、取消态「重新加载」两条链路照旧；_probe_examtools_1018 取 #examRoot .bk-state 的那条也照旧。【noCancel 口径照旧】三个调用点全是 noCancel:true（已点 Start 不给取消，防误取消丢上下文），本单没改这个决定，探针里改成断言「没有取消钮」。【三档外观】考场内是 #examRoot.ct-* 自己一套写死色、不跟 data-theme 走，按同一口径补了 ct-dark/ct-yellow 的标题、副行、提示、进度条底、图标与环底色。【验收】_probe_mockload_1031 39/0（单篇 1280、单篇 390、完整阅读、完整听力、三档外观、失败重试六组），手机 390 零横向溢出且整块在视口内不滚；撤改动跑基线 9 条转红（含「新载入页不存在」），对照组证明判据有效。js/bank.js 与 bank.html 在 PRECORE，两个都 bump 到 20261031a。上一版 v686 = PLANS-REDESIGN-CODE-1 笔 2。; // 10-31 PLANS-REDESIGN-CODE-1 笔 2／3（任务行内容对齐稿子）：任务行改成两行式——标题一行，下面一行「科目 · 分钟 · 昨天顺延」。类名一个没改（标题仍是 .m-t、科目仍是 .m-tagline），只多包一层 .m-taskbody／.m-tmeta，避免打断既有探针与脚本的取值判据；HTML 里那几行占位骨架也换成同构结构，否则「真数据追加的行」和「HTML 占位行」会长得不一样（老 bug 来源）。【两个刻意的取舍】① 分钟只在「标题里没写分钟数」时才单独补一行：手动任务本来就把分钟写在标题里（「听力 P1 精听一篇 30 分钟」），再补一行就是同一句说两遍（截图里正是这个重复，已修）；② 手动任务没有 module 字段，科目标签就不显示，不靠正则从文本猜科目——那是 10/5「跳错模块」的老毛病，明确不猜。【编辑态适配】行内编辑改成把整个 .m-taskbody 换成输入框：只换 .m-t 会留下「科目·分钟」悬在输入框下面，像两套内容并排；Esc 取消时手动把元信息补回来（不 render，不丢刚点的那一行），保存走 render() 全量对齐。【验收】任务行探针 20/20（三条任务、分钟重复/缺省两种边界、编辑态无悬空元信息、Esc 还原、勾选划线、零报错），手机 390×844 + 桌面 1280；壳 28/28、功能全流程 26/26；回归 P-1 27/0、precore 133/0、shell5 46/46。js/plans.js、css/p/plans.css、plans.html 均在 PRECORE，全部 bump 到 20261031b。上一版 v684 = 笔 1 壳。
const _prevCacheNote26 = 'ielts-hub-v697'; // 11-01 RV-REBUILD-BATCH-1 笔 1（回顾页首屏摘要卡）：她 10-31 23:1x「整个回顾页面还得优化，现在这个我不是很满意」→ SSR 出稿 design/review-redesign-SSR-2026-10-31.html，11-01 0:4x 她过目回「这个新方案可以」。本笔只做结构层第一块：首屏从「5 个等分格」改成「1 个大总分 + 4 科小格」。【为什么改】改前 390 手机上 .rvx-trf 是 repeat(5,1fr)，每格独占一行，整块 539px —— 第一屏全被分数占满，趋势卡要到 y=1011、记录到 y=1254 才看得见，这正是她说的「整个页面不满意」。【改了哪些】review.html 里首屏条重排成 .rvx-trf-lead（左，大总分 + 目标差距 + 「最近一次 · M月D日」）+ .rvx-trf-subjects（右，四科各一格）；js/rvx-data.js 的 paintStrip() 只补三件事 —— 左上日期标签、四科格子按达标与否挂 rvx-weak/rvx-ok 竖线、差距文案「还差 0.5」缩成「差 0.5」且目标整数不补 .0。**取值路径一个字没改**：仍是 rvxNumAll / rvxSubAll / rvxNumL·R·W·S / rvxSubL·R·W·S 那 10 个 id，旧的判定与 scores.js 的写入链路全部照旧。【特异性】旧规则 `.rvx-trf>div{padding:16px 18px;border-right:…}` 会打到新结构里的 lead/subjects 两个 div，新样式一律带 `.rvx-trf >` 前缀抬到 0,2,0，不用 !important。【实测】首屏条高度 390 手机 539→194、360 手机 →180、1280/1440 桌面 109→105；四科仍在同一行（87px 宽/格），差距文案折行只折在「目标 6 ·」之后、不把「差 0.5」拆两行；横向溢出 0、录入成绩按钮 elementFromPoint 命中、空态（没录过成绩）高度 180 且不画假数据、深色下竖线与文字对比正常、零 pageerror。【回归】precore 134/0、shell5 46/46。js/rvx-data.js 在 PRECORE（裸路径预缓存只在 install 刷）→ 须换代。review.html 里 js/rvx-data.js 的引用串 20261029b → 20261031k（严格大于当前全仓最大串 20261031j）。上一版 v697 = FE-DEAD-SWEEP-ALL-1 B3。
const _prevCacheNote25 = 'ielts-hub-v695'; // 11-01 WRT-PANE-SHELL-GAP-1（软导航后写作 pane 考场壳不重建）
const _prevCacheNote24 = 'ielts-hub-v693'; // 11-01 EXAM-TIMER-CHOICE-1 第二轮（越界时长一次点击就钳制并开始）
const _prevCacheNote23 = 'ielts-hub-v692'; // 10-31 EXAM-TIMER-CHOICE-1 之前的线上头 = AUDIO-MERGE-1 合流笔（v692）。
const _prevCacheNote22 = 'ielts-hub-v690'; // 10-31 a2-pages 合流后补换代（页面层 17 笔 + 2 处漏 bump 的引用串）：合流那一刻 CACHE 停在 v688，而 PRECORE 的裸路径预缓存只在 install 时刷 —— 不换代 = 121 个预缓存副本全是旧的，离线回退与裸路径引用会拿到旧版。【本单同时补两串】corpus.html 的 css/p/corpus.css 停在 20261029l（CORPUS-PANEL-REDESIGN-1 改了 176 行 CSS 却没换串）、plans.html 的 js/plans.js 停在 20261031b（PLANS 笔 3 改了 99 行 js 只 bump 了 css）→ 各自补到 20261031a / 20261031c。【合流范围】BACK-BTN-PAGES-1 九笔 + PLANS 笔 3／3 右栏 + PLAN-DIAG-EMPTY-COPY-1 + CORPUS-PANEL-REDESIGN-1 + MOCK-LOADING-PAGE-1 + WD-DICT-MODE-1 + SET-AV-POP-FIX-1 + HOME-QUICK-GUARD-1 + LISTEN-LEAK-ESC-1。分支上自编的 v680~v687 与 main 侧撞号，一律以 main 世代为准。
const _prevCacheNote21 = 'ielts-hub-v688'; // 10-31 合流前的头 = MOCK-AUTOSPEAK-OFF-1（模考自动朗读删除）
const _prevCacheNote17 = 'ielts-hub-v687'; // 10-31 MOCK-LOADING-PAGE-1（她 10-31 15:3x「进练习或模考时的加载页面不好看」）：只换**进考场那一刻**的载入页，目录列表的骨架屏与四态一个类都没动。【做法】js/bank.js 新增 bkLoadPage()：试卷图标（内嵌 svg 描边，不用字符/emoji）+ 外面一圈旋转进度环 + 右下三个脉冲点 + 标题 + 副行 + 不定量进度条 + 一行「第一次加载需要几秒钟」。fetchWithStates 原来那句 bkSkeleton(6)+bkStateBox('loading',…) 换成它 —— 六根灰条本是**目录列表**的形态，搬到全屏白底的考场上就成了她说的「不好看」。三处调用点各传 lpTitle/lpSub：单篇（IELTS Reading/Listening · 阅读练习/听力练习）、完整阅读模考（Full Test · 40 题）、完整听力模考（同）。【钩子一个字没改】仍是 .bk-state + data-bk-state="loading" + [data-bk-act=loading]，失败态「重试」、取消态「重新加载」两条链路照旧；_probe_examtools_1018 取 #examRoot .bk-state 的那条也照旧。【noCancel 口径照旧】三个调用点全是 noCancel:true（已点 Stconst _prevCacheNote16 = 'ielts-hub-v684'; // 10-31 PLANS-REDESIGN-CODE-1 笔 1／3（壳）：计划页整面按 SSR 定稿重做，她 10-31 回「通过」。【本笔范围】只换外层骨架，任务行内容与右栏留给笔 2／笔 3。页头改成 eyebrow + 大标题「学习计划」+ 副行 + 右侧阶段胶囊；日期条独立成条（‹ 日期·星期 今天 ›，副行报本周重点／非今天露「回到今天」）；主栏 + 右栏两列工作区。【同时修掉的真问题】① 页面上曾同时出现两个「备考诊断」——手写假卡（.m-dg）+ #diagRoot 真卡，且假卡永远显示「还没做过」，真做过诊断的账号也是这句；本笔删掉假卡，诊断只留真那套。② syncSkeleton 原来用 .m-mcard 下标取容器（cards[0]=进度 / cards[1]=任务），结构一变就静默指向错的卡 —— 改按 id（#mkSumCard / #mkTaskCard），下标那套删净。③ 新增任务筛选（全部／待完成／已完成），纯前端显隐、不重排顺序、不改数据；任务少于 2 条时整排隐藏（0 条时给筛选反而更困惑）。【口径约束】全部样式挂 #mkToday 作用域 + m- 类名双保险，不进 common.css；色值全取站点 token；#planTabs 仍留在 .m-phase 里（P-HEAD-1 定下的回归判据），胶囊外观交给 .m-phase-chip。【验收】壳探针 28/28（零横向溢出、页头/日期条/进度块/两栏位置、五枚入口 elementFromPoint 全 HIT、零报错），手机 390×844 + 桌面 1280；功能全流程 26/26（加两条→勾选→编辑→删除→翻日期→回今天→往日汇总）；回归 P-1 27/0（含深色对比最低 6.82）、precore 133/0、shell5 46/46。js/plans.js、css/p/plans.css、plans.html 三者均在 PRECORE，全部 bump 到 20261031a。上一版 v683 = SYNC-FIX-1。
const _prevCacheNote14 = 'ielts-hub-v683'; // 10-31 SYNC-FIX-1（S 级 · 数据正确性）：官方内容未就绪时禁止全量 PUT。三条路径都通向「云端被覆盖成缺字段版本」：①cloudUpload 只 await ensureStatic 且忽略返回值；②flushCloudUpload 走 sendBeacon 直接跳过一切检查还写已上传哈希；③_maybePublishLocal 拿本机缺字段快照比完整云快照，必然判成「本机有新增」且 _bootPublishTried 失败永不重试。修法：officialContentReady()（ensure 后复核 fieldReady）+ 3s/8s/20s 三轮退避 + 就绪钩子重排 pending；普通上传 / 开机发布 / 关页补传三路全挂闸。🔴 显式清空数据（settings.js resetData 与 common-cloud consumeResetPending）传 allowMissingOfficial 越过闸 —— 否则云端旧数据会在下次 30s 轮询整份合并回来，她刚清空的记录原地复活（反向的数据丢失级事故）。验收：gate_syncfix1.cjs 12 过 / 0 红；消融对照修前同一支 4 红。上一版 v682 = PLAN-ENTRY-VISIBLE-1。
const _prevCacheNote15 = 'ielts-hub-v682'; // 10-30 PLAN-ENTRY-VISIBLE-1：（她 23:1x 原话「这个加任务这个功能用不了，现在没有加任务的入口」；B 转单：手机档「新增任务/日期翻页/编辑/删除」四个入口全藏在不可见旧卡里，可见的「写一条」是静态文字点不动）【施工方式】不动任何既有结构与视觉，只把四个入口接到可见骨架上：① 添加行：plans.html 那条 .m-addrow 从纯静态文字改成「输入框 #mkAddText + 加一条 #mkAddBtn + AI 安排今天 #mkAiBtn」，回车即添加；② 日期翻页：原来当提示文字用的「‹ 前后翻天 ›」换成真的 #mkDayPrev / #mkDayNext 两枚按钮 + #mkDayToday（非今天才露出），全部走 #planDate 既有 change 链路；③ 编辑/删除：每行 .m-task 右侧补 ✎ / ✕ 两枚 .m-actbtn（触屏 30x30），编辑把 .m-t 就地换成 input（回车/失焦存、Esc 取消），删除走现有 deleteItem；④ 数据逻辑一律转发到 plans.js 现成的 addItem/aiPlanItem/startEdit/deleteItem，不另造一套。🔴 两个坑：a) 日期 span 上的 id 会被 syncSkeleton 的 h4.innerHTML 整体冲掉 → id 必须挂 h4 本身；b) 行内编辑 Enter 保存后 render() 换节点，紧随的 blur 会二次进 finish() 抛 NotFoundError（replaceWith 的节点已不是子节点）→ 用 done 单次守卫挡掉。【顺带修的真 bug】编辑/删除从来只存在于旧卡，可见界面上压根没有这两个入口（不是点了没反应）；lab 里那段假 affordance 也一并去掉。【验收】全流程 26/26（后一天生效+回到今天露出 → 加两条可见 2 行进度 0/2 → 点行勾选 done=1 → 编辑改名保存 → 删除剩 1 行 → 回今天隐藏且不串数据 → 往日页汇总正确 → 零报错），手机 390x700/390x844 + 桌面 1280 三档；手机三查 36/36（横向溢出 0px、九枚入口 elementFromPoint 全 HIT、无裁切、触控不小于 24px）；回归 P-1 27/0（深色对比最低 6.82）、precore 133/0。js/plans.js 与 plans.html 均在 PRECORE，两个都 bump 到 20261030a。上一版 v680 = COMMON-JS-SPLIT-1 笔 1。
const _prevCacheNote13 = 'ielts-hub-v680'; // 10-30 COMMON-JS-SPLIT-1 笔 1（解依赖，不改加载时机）：把三张同步白名单表 SYNC_ARRAY_FIELDS / SYNC_SETTINGS_FIELDS / WORD_PROG_FIELDS 从 js/common-sync.js 顶层 const 搬到 js/data.js 的 window.X 赋值。目的：让 common-merge.js 不再依赖 common-sync.js 先执行，为笔 3/笔 4 按需加载解掉 ReferenceError 风险。⚠️ 用 window.X 而非顶层 const —— 软导航 window.eval 重跑时顶层 const 跨文件不可见（PRECORE 铁律③）。⚠️ data.js 与 common-sync.js 必须同批上线，只升一边会 half-defined。验收：22 页逐页冷启动 + 软导航三常量就位断言；mergeData 真跑四路（单词进度取更掌握 / 设置字段级较新者胜 / 云端空值不覆盖本机 / 数组白名单并集）；precore 133/0、shell5 46/46、coachav 32/0、19 支回归 5 红逐支基线复跑无回归。上一版 v679 = MOCK-WRT-BAR-1 写作底栏按钮回右下。
const _prevCacheNote11 = 'ielts-hub-v681'; // 10-31 NAV-SOFTNAV-HANG-1：切换中再点保留最后目标，当前切换收尾后串行接续；真实手机连点红绿对照通过。上一版 v680 = COMMON-JS-SPLIT-1 笔 1。 // 10-30 MOCK-WRT-BAR-1（她 10-28 报、10-30 执行）：写作考场底栏两件。① Pause/Exit/Finish 三枚按钮没在右下角，手机档还掉出视口。根因①宽度：.ex-bar-main 是 flex 0 1 auto，宽度只由内容撑开（桌面 1280 实测 489px，底栏 1265px），.ex-actions 的 justify-content:flex-end 没有余量可用 → 按钮停在左边 189px 处；根因②高度：.wt-bar{height:44px;max-height:44px} 没写 media 外壳，而 <=860 时 .ex-bar-main 是竖排两行（约 76px）→ 动作那排整排溢出底栏下沿，按钮 bottom 857 掉到 844 视口外（360/390/412 三档全中，桌面 1280/1440 正常）。修法：main 撑满底栏宽度（桌面高度仍 44 单行），手机档放开高度钳制成 auto（bank.html:1173 段，必须写在那条 .wt-bar 之后——特异性同为 0,1,0，先写在 972 附近被反压，实测按钮一动不动，踩过一次）。② 「Task 1 还需 150 词 / 已达标」整段不显示，只留 Word count: N；未达标的暖色 low class 照旧切（她只反对文案没反对颜色）。验收：五档 360/390/412/1280/1440 共 30 项全过（三枚按钮完整在视口内且可点、桌面右键贴右内边距 1280 Pause l=783 / 1440 l=943、手机底栏 44→77px 按钮回到视口内、文案消失、零报错）；功能级 21 项全过（Pause/Resume、Task 1↔2 切换、Exit 退壳回列表、深色档）；writing.html 自练题路径同样 3 枚在视口内。回归 mockexit 19/0、shell5 46/46。js/writing.js → 20261030a（在 PRECORE，须 bump）；bank.html 与 writing.html 引用串同 bump。上一版 v678 = FE-DEAD-SWEEP-ALL-1 第 5 页。 // 10-30 FE-DEAD-SWEEP-ALL-1 第 2 批第 5 页：css/p/vip.css 清 23 个零引用死类的 77 条规则（.kv-* 整套会员页旧卡：kv-acts/kv-bar/kv-btn/kv-btn-primary/kv-design-note/kv-done/kv-done-ic/kv-eyebrow/kv-lb/kv-note/kv-order/kv-page-head/kv-plans/kv-purchase/kv-slip/kv-sub/kv-theme/kv-txt/kv-wrap，外加 .semi-qr/.semi-ghost/.semi-center/.qr-item —— 早期扫码壳子的残留）。体积 24384 → 17920 字节（规则 265 → 188 条）。证伪同 materials 那页：静态 grep 命中 0 + **真跑会员页收集 DOM class 90 个与 22 个死类求交 = 0**（硬证据）。验收：vip.html 桌面 1440/1280 + 手机 390/360 四档删前删后逐值完全一致（可见节点 365/385、区块几何全同），零报错；全站 60 张 0 问题。css/p/vip.css → 20261030a（在 PRECORE，须 bump）。上一版 v677 = materials.css 那笔。
const _prevCacheNote12 = 'ielts-hub-v679'; // 10-30 MOCK-WRT-BAR-1（她 10-28 报、10-30 执行）：写作考场底栏 Pause/Exit/Finish 三枚按钮回右下、手机档不再掉出视口；删「还需 N 词」文案只留 Word count。① 宽度根因：.ex-bar-main flex 0 1 auto 宽度只由内容撑开（桌面 1280 实测 489px / 底栏 1265px），.ex-actions 的 justify-content:flex-end 没有余量 → 按钮停在 189px；② 高度根因：.wt-bar height/max-height 44px 没套 media，≤860 时 .ex-bar-main 竖排两行约 76px → 动作那排溢出底栏下沿，按钮 bottom 857 掉到 844 视口外（360/390/412 三档全中）。bank.html:1173 段修，必须写在那条 .wt-bar 之后（特异性同 0,1,0，先写会被反压）。
const _prevCacheNote10 = 'ielts-hub-v677'; // 10-30 FE-DEAD-SWEEP-ALL-1 第 2 批第 4 页：css/p/materials.css 清 25 个零引用死类的 91 条规则（.mat-btn / -p / -sm / -danger 全套按钮 4 个、.mat-sec / .mat-tag / .mat-req、.mat-q-empty / .mat-q-prog、.mat-opt-tag、.mat-generate、.mat-pp-line / -tags / -tag、.mat-mm、.mat-presets-row、.mat-toolbar / -wrap / -head、.mat-persona、.mat-mat-add / -mat-head / -mat-q-title、.mat-spacer、.mat-design-note、.btn-p，含 640px 断点里那批）。体积 28288 → 20628 字节（规则 297 → 206 条）。🔴 这一页的证伪多做了一层：除了静态 grep，还**真跑页面把 DOM 里所有 class 收集出来求交** —— 111 个真实 class 与 26 个死类的交集是 0，这才是硬证据（静态 grep 会被 design/ 目录下的设计稿带偏：那些 .mat-sec-title / .mat-persona 全是在稿子里，不在运行时。扫描器已把 design/ 加进排除表）。另查无 mat-/mi- 前缀动态拼接。验收：materials.html 桌面 1440/1280 + 手机 390/360 四档，删前删后**逐值完全一致**（文档宽高、可见节点 233/253、区块几何全同），零报错；全站 60 张 0 问题；回归 shell5 46/46、precore 133/0。css/p/materials.css → 20261030a（在 PRECORE，须 bump）。上一版 v676 = home.css 那笔。
const _prevCacheNote9 = 'ielts-hub-v676'; // 10-30 FE-DEAD-SWEEP-ALL-1 第 2 批第 3 页：css/p/home.css 清 5 个零引用死类共 10 行（.metric-static 及其 :hover / .dots-l / .hl-l / .hl-mid / .hl-cta，最后两个含 860px 断点里那条）。其中 .metric-static 是 10-23「今日专注做成只读卡」那版的遗留——注释自己就写着「这组规则当前无人引用，保留备查」，10-24 T-1e 已改回可点卡，这组永久失效；本轮连注释一起删（注释留着反而让人以为还有这套形态）。.hl-l/.hl-mid/.hl-cta 是首页 hero 右侧那排旧结构的断点样式，全仓 `hl-` 前缀运行时命中 0（无动态拼接），该结构已不在 DOM 里。验收：home.html 桌面 1440/1280 + 手机 390/360 四档，删前删后**逐值完全一致**（文档宽高、可见节点 386/406、14 类区块几何全同），零报错；全站 60 张 0 问题；回归 shell5 46/46。css/p/home.css → 20261030a（在 PRECORE，须 bump）。上一版 v674 = corpus.css 那笔。
const _prevCacheNote8 = 'ielts-hub-v675'; //   10-30 MAT-BULK-EDIT-1（她 10-29 原话「给我加一个批量编辑素材的功能，我刚刚一次性加太多进去，删也删不完，太多了，删不过来」）：素材页加批量删除。素材区标题行右侧新增「批量管理」入口（素材 ≤1 张时不出现）；进批量后同一行换成「全选/取消全选」+「删除选中（N）」+「完成」，卡片头出现勾选方块、点卡头整块也能勾。删除走两步：第一次点变红「确认删除 N 张？」、再点才真删（照本页既有 armed 范式，不用原生 confirm，避免打断软导航；改勾选或点完成即回落）。🔴 三个容易出错的地方按规矩处理了：① 选中集存 **id 不存下标** —— 删一批后下标整体前移，存下标会错删；老数据可能没 id（历史只在「生成」时补过），进批量前 ensureMatIds() 统一补齐并去撞车。② 批量删同样写 deletedIds 墓碑 + 更新 materialsEpoch + 触发云上传，否则云端/另一份残留会把卡并回来（与单张删除同口径）。③ 批量态下卡头不再展开/收起（改成一整块可点选），退出批量恢复原行为。样式零新视觉语言：勾选方块照本站既有口径、选中态只加主圈描边不换底色。js/materials.js → 20261030a（在 PRECORE，须 bump）；materials.html 与 speaking.html 的 data-late-src 同 bump。上一版 v672 = FE-DEAD-SWEEP-ALL-1 第 1 批。
const _prevCacheNote7 = 'ielts-hub-v674'; // 10-30 FE-DEAD-SWEEP-ALL-1 第 2 批第 2 页：css/p/corpus.css 清 5 个零引用死类共 17 条规则（.kc-sample-label / .kc-result-block / .kc-wide / .kc-review-note / .kc-disclaimer，含 @media 里的同款）。判据升级：CSS 从右往左匹配，**只取选择器最右那个复合选择器里的类名** —— `.kc-page .kc-result-block` 这种祖先活着、目标死掉的规则永不命中，可删；`.vip-hero .badge` 这种最后一级还活着的绝不删。这条口径第 1 批写成了「选择器最后一级类名」，本批把扫描器按这个口径重写（scripts/_fe_dead_p2.cjs），并把注释替换改成等长空白（否则行号全错位）。「.kc-theme-btn」一并删：那是从计时页稿子照抄过来的按钮组规则，corpus 页 DOM 里没有这个容器（timer.css 注释里也写了「删掉 theme-btn 五组死样式」，这里是同源漏网）。验收：corpus.html 桌面 1440/1280 + 手机 390/360 四档，删前删后**逐值完全一致**（文档宽高、可见节点数 263/283、14 类区块几何与 padding/字号全同），零报错；全站 20 页 × 三态 60 张 0 问题；回归 shell5 46/46、precore 133/0。css/p/corpus.css → 20261030a（在 PRECORE，须 bump）。上一版 v673 = login.css 那笔。
const _prevCacheNote6 = 'ielts-hub-v673'; // 10-30 FE-DEAD-SWEEP-ALL-1 第 2 批：css/p/login.css 清 3 个全站零引用死类（.lg-top / .lg-stage / .lg-foot-note，都是 (max-width:560px) 段里给一个已经不存在的三栏结构留的内边距）。证伪口径照第 1 批：注释里的出现不算使用、类名带边界匹配（(^|[^\w-])name([^\w-]|$)）、「等着被别人用」的基类不删。三个类全仓运行时命中 0（另查无 lg- 前缀动态拼接），删的是 3 条规则；.lg-top 还牵着一处 `.lg-top a` —— 那条与活类 .lg-text-link 共选择器，按「复合选择器混着活类一律不动」的边界保留。验收：login.html 桌面 1440 / 手机 390 / 手机 360 三档，删前删后逐值完全一致（卡片 x/y/宽/高/padding、品牌条 margin、按钮几何、弹层 padding 全同），横向溢出 0、零报错；全站 20 页 × 三态 60 张检查 0 问题；回归 shell5 46/46、precore 133/0。css/p/login.css → 20261030a（在 PRECORE，须 bump）。上一版 v672 = FE-DEAD-SWEEP-ALL-1 第 1 批。
const _prevCacheNote5 = 'ielts-hub-v672'; // 10-29 SPK-BANK-DEDEXAM-1（她 20:3x 发火原话「我叫你们把题库的那个页面，手机端的改一下，把那个模考按钮删掉，有这么难吗？」+ 18:5x「这个筛选有没有练过的，这个筛选不能放在那个 P1 P2 筛选旁边吗？…为什么这个头这么重一个呀」）：口语题库页手机档一次改齐四件。① **删模考按钮 ×2**：可见的「模考」按钮（工具行行尾 #spMockJumpBtn 的可见形态）与驾驶舱里的「开始模考」（#spCockpitRandom）都不再渲染。🔴 关键取舍：#spMockJumpBtn 这个 id 是整条模考链路的承载点（speaking.js:210 绑定、sp-late.js 的加载态转圈、mock.js 出口兜底都找它），所以**节点保留但改成 hidden**，视觉上零按钮、转发能力照旧——实测隐藏后点它仍能进考场（考官 y=59、题目 138、横向溢出 0、零报错），顶栏与机经页的模考入口全不受影响。##spCockpitRandom 及其 .sp-cockpit .btn-main 四条样式是真删（无引用）。② **状态筛选归位**：把「状态（全部/未练过/已练过）」从第二行挪到第一行 P1/P2 分段右边（DOM 里移进 .sp-tb-row1）。③ **手机档头部瘦身**：驾驶舱 216px → **118px**（少 98px）——原 .sp-cockpit-top 是 column+gap:14（为旁边那枚按钮让位），按钮删后改回单行；三项统计从 column 一格一行（108px）改两列 grid（23px）；删掉手机档那根 56px 小进度条（两列排布后它在 360 宽顶出 3px → 整页能横滑，她自己报的那条；数字里本来就有「0 / 37 题」，信息不丢）。工具行高 138 不变。首屏内容起点 82+216+38+138=474 → **426**。④ 桌面 1280 逐值不变（驾驶舱 136、工具行 40、列表 368）。实测五档宽度 360/390/393/412/430：横向溢出全 0、触摸横滑全不能、三筛选全可见（状态 187~257 在 P1/P2 同一行、优先级/分类 164~199 并排）、零报错，共 35 项 0 红；功能级 12 项 0 红（状态筛选 89→0→89、分类 17/89、P1/P2 分段 P2=52、搜索命中、切走切回正常）。回归 shell5 46/46、m4spk 12/0、mockexit 19/0、precore 133/0。js/sp-list.js → 20261029a（在 PRECORE 须 bump）；speaking.html 在 PRECORE 须 bump。上一版 v667 = SPK-TOOLBAR-OVERFLOW-1。
const _prevCacheNote4 = 'ielts-hub-v667'; // 10-29 SPK-TOOLBAR-OVERFLOW-1（她 18:5x 报障，原话「我不是让你们改所有页面不能左右滑动吗？为什么题库这个页面还是可以左右滑动呢？…而且它这个搜索题目框，这个右边还有两个小框和两个箭头是什么意思啊」——两条其实是同一个 bug）：口语题库工具行在 393px 及以上宽度溢出，整页能横滑、三个筛选下拉被压成 0 宽只剩箭头戳在搜索框右边。根因是特异度：窄屏媒体查询（speaking.html:3316 段）给 .sp-search-wrap 只写了 flex、给 .sp-fsel 写 {flex:1 1 0;min-width:0}，而上面桌面段（:3280/:3282 段）的 `.sp-toolbar .sp-search-wrap{max-width:360px}` 与 `.sp-toolbar .sp-fsel{min-width:0}` 特异度更高（0,2,0 对 0,1,0），把窄屏「搜索独占一行、筛选有最小宽度」的意图全压掉了 → 393 宽时搜索仍钉在 360，行宽 369 只剩 9px 给三个筛选，第 1 个被压成 0 宽（露出 7px 的 ::after 箭头 = 她说的「两个小框和两个箭头」）、第 2 个被顶出视口，main scrollWidth 溢出 → 整页能横滑。390 及以下刚好换行逃过，所以以前 390 探针全绿、她手机上却中招（iPhone 14/15=393、Pixel=412、16 Pro Max=430 全在区间内）。修法：窄屏把 max-width 放开成 none + 筛选给 min-width:88px，让它们规矩换行三等分；桌面 1280 数值零变化。实测五档宽度（360/390/393/412/430）：横向溢出全 0、触摸横滑全不能、三个筛选宽度 106~129 且全部可见、工具行高 138 不变、零报错；负向验证（拿 origin/main 旧 speaking.html 跑同一套）：393 溢出 34px 能滑 / 412 溢出 26px 能滑 / 430 溢出 20px 能滑，筛选宽 [0,180,180] / [0,0,0] / [6,6,6] —— 与她的观感逐条对应。回归 shell5 46/46、m4spk 12/0、mockexit 19/0、precore 133/0。speaking.html 在 PRECORE，须 bump。上一版 v666 = AI-MAT-RELAY-ERR-1。
const _prevCacheNote3 = 'ielts-hub-v666'; // 10-29 AI-MAT-RELAY-ERR-1（她 18:3x 报障「添加素材 → AI 智能生成 → AI 暂时不可用」）：真凶不是按钮卡死（实测失败后按钮一直会复位，B 的猜测不成立），是 js/materials.js 的 genMaterialsBatch 拆批逻辑把真实原因吞了。她粘 7957 字/42 段，服务端没接住，但 catch 里一律 throw new Error(FAIL_MSG)，三种后果：① 504/502/429 中断、403 会员闸、25 秒超时全被改写成「返回内容被截断或格式错误，请少填几条经历」——她会以为是自己素材写坏了去删刚写好的东西；② 拆批只对「输出被 max_tokens 截断」有意义，对服务端故障拆了还是一样失败，实测 42 段走到底 3 次请求/4933ms，429 限流时越限越打；③ callRelay 失败自己弹一条「AI 服务暂时不可用」，拆 3 次弹 3 条，连上最后那条假诊断一共 4 条 toast。修法：catch 里加 `if(e && e.code) throw e` —— 只有无 code 的「素材 JSON 解析失败」（=真截断）才拆批；新增 relayErrMsg(e) 按 code 翻人话（AI_TIMEOUT/upstream_timeout → 想得太久超时了、文字没丢、过一分钟再点；rate_limit → 被点太频繁缓一分钟，文字还在不用重输；upstream_error/SITE_RELAY_FAIL/NO_SITE_RELAY → 忙不过来再点一次；vip_required → 会员功能，想原样存用左边「直接加上去」不需要会员；AUTH_REQUIRED → 先登录），三处失败 toast（导入整理 js/materials.js:751、整批生成 :1338、添加素材 :2009）统一改用它。验收 30/30：504/429/502/403 四种失败各只打 1 次请求、toast ≤2 次、屏上最后一条是按真实原因写的人话、按钮全部复位可再点、零报错；截断类仍允许拆批（≤3 次）并给出「少填几条」的正确建议。负向验证：回滚修复跑同一套 → 15 项转红（3 次请求、4 条 toast、文案全变假诊断）。回归 shell5 46/46、m4spk 12/0、mockexit 19/0。js/materials.js → 20261029a（在 PRECORE，须 bump）；materials.html 与 speaking.html 的 data-late-src 同 bump。上一版 v665 = TRAK-EXAMINER-ORDER-1。
const _prevCacheNote2 = 'ielts-hub-v665'; // 10-29 TRAK-EXAMINER-ORDER-1（她 18:4x 暴怒点名）：口语模考手机上考官视频窗掉到题目下面。根因是 15:49 PERF-AUDIT-1「手机一屏可达」那笔把 css/p/speaking.css 手机媒体查询里 .mock-examiner 的 order 写成 0 —— DOM 里题目区 .mock-left 在考官 aside 之前，.mock-main 是 flex column，单列下谁在上完全由 order 决定；0 与默认 0 同值，浏览器退回按 DOM 顺序排，题目跑到最上面、考官掉到底部。改回 order:-1（与 speaking.html:1014 基础规则、1047 P2 窄屏规则一致），72px 视频条的体积压缩全部保留，只还原顺序。实测 390x844 / 390x700 / 1280x900 三档真开考（走 window.__mockEnter，body.mock-immerse 生效）：考官窗分别在 y=59-131 / 57-113 / 96-390，题目区 138 起，考官在上；负向验证强制 order:0 后考官立刻掉到 758-830，与她的观感一致。三查全过：docScroll 0（不滚动）、横向溢出 0、scrollHeight==clientHeight（不裁切）、退出模考与下一题两枚按钮都在视口内且 elementFromPoint 命中。回归 mockexit 19/0、m4spk 12/0、mock_overlap 零重叠零报错。css/p/speaking.css → 20261029g（在 PRECORE，须 bump）。上一版 v664 = PLAN-SKELETON-FAKE-1。
const _prevCacheNote = 'ielts-hub-v664'; // 10-29 PLAN-SKELETON-FAKE-1（A2 自查挖出，她 10-29 16:1x「随便用一个功能就能用出来好多 bug」）：计划页可见骨架不跟真数据，两个独立缺陷同批修。① js/plans.js 的 syncSkeleton 在「没设考试日期」分支写了 return，注释说的却是「后面进度/任务照常接」——它跳出的是整个函数，于是没填考试日期的账号（新用户全在此列）后半段日期/进度/任务行/诊断卡一律不执行，可见骨架永久停在 plans.html 写死的假数据：日期永远「10-24 · 周五」、进度永远「3/7 · 43%」、任务永远是别人的「背词：List 7 复习 / 听力 P1 精听一篇 / 口语 P2 卡牌练 3 张 / 写作 Task 1 图表一篇」。改成把「有日期才画」的部分收进 if/else，无日期只跳过阶段条那一小块。② 同一函数里「多出来的占位行隐藏」写 style.display='none'，而循环里从没把 display 还原 → 某次渲染任务少（0/1 条）后那几行被永久焊死，之后加任务、再进页面文字写进去了却不显示（实测：空计划页加一条，存储真有 1 条，屏上一个字没有）。补 row.style.display=''。实测 PC+MOB 各 19 项共 38 项全绿（全新状态不显示假日期/假进度/假任务；加 1/3 条即时可见；勾选 1/3；软导航往返保持；设日期后阶段条正确；1 条精确显示、旧隐藏行能复活；零报错）。负向验证：用 origin/main 旧 plans.js 跑同一套 → 假日期、3/7、假任务全部复现，新增任务确实不可见。回归 p1plan 27/0、precore 133/0、shell5 46/46。js/plans.js → 20261029a（在 PRECORE，须 bump）。上一版 v663 = LISTEN-LEAK-1。
  // 10-24 S-1 全站搜索框统一类（她 11:4x 原话「现在很多搜索框都长这样太丑了，派一个人全部搜索框检查一下然后优化」；B 窗口真机走查 8 个框 → 同一个站 5 种圆角/4 种高度/3 种底色/3 种图标尺寸，病根是**没有统一规格**）：css/common.css 新增 .ui-field-search（高 36/44 触控 · 圆角 10 · 底色 --surface-2 · 边框 1px --line · 焦点 边框 --primary + 3px --primary-soft · 放大镜 16px --muted · 清空 ✕ 仅在有值时出现 · 字号 14 · placeholder --n-500），js/common.js 新增 initSearchClear() 一处绑定全站生效（有值显示 ✕ → 点了清空 + **派发 input 事件**（不派发页面过滤逻辑不知道清了）+ 焦点回输入框），MutationObserver 兜住软导航后新插入的框。🔴 红线守住：`.ui-search-input` 行为零变化（新类是新增不是替换）；顶栏那枚（全局 ⌘K 入口）不用本类；outline:none 都配了替代焦点态。⚠️ 踩坑记录：本类选择器必须加 :not() 提到 0,3,0，否则被 common.css:470 的全局 input 规则（0,3,0 但写在后面）压掉 padding 与字号；:focus-within 另加 :has() 兜底。SW v520 → v521。
  // 10-24 W-6 全局错误兜底（走查报告 §三 W-6）：全站 window.onerror / unhandledrejection 原本**一个都没挂** —— 页面脚本炸了她只看到白屏或按钮无反应，错误只进控制台（「点了没反应」那一类）。新增 initGlobalErrorGuard()，挂在 boot 链**最前**（要能接住后面 injectNav/initSoftNav 里抛的错）：① 记录进 console([hub-error]+页面+时间) 与内存环形缓冲 20 条（window.__hubErrors 现查，不上报不联网）；② 一条不打断操作的轻提示（复用全站 .toast，每会话最多 2 次、6 秒自动消失）。🔴 三条红线：绝不 alert / 绝不 reload 或自愈（HOTFIX-1023 刚降噪过）/ 不发任何网络请求。静默区（只记录不提示）：模考·背词全屏·引导中 · 扩展注入 · ResizeObserver loop · 跨域 Script error · AbortError/isTimeout/AI·SYNC·AUTH_TIMEOUT · 资源加载失败。SW v519 → v520。
  // 10-24 W-5 云端/AI 请求补超时（走查报告 §三 W-5）：`common-sync.js` 的 authApiPost / syncApi 与 `common-ai.js` 的两处 fetch 原来**都没有超时** —— 弱网下 await 永不返回、调用方 finally 永不执行，按钮就永久卡在「安排中…」（她报过多次「点了没反应只能刷新」）。做法照抄 bank.js:168 的 AbortController 范式（本项目既有口径）：读 15s / 写 45s / 鉴权 15s 分开预算（她是 1.8MB 级云端数据，写与读共用预算会误杀正常上传）；AI 侧底层中断 28s **比上游 withTimeout 25s 略长**，否则底层先掐断会让用户看到「网络错误」而不是「AI 超时」。超时错误带 code + isTimeout，调用方原有 catch/finally 照常解锁。🔴 只加超时，同步节流窗口 / 重试策略 / AI 25s 口径 / 判分数据一个没动。SW v518 → v519。
  // 10-24 Q-6 eval 输入面收紧（施工书 §Q-6；🔴 前提=不许删 eval、不许撤 unsafe-eval，两处 eval 是软导航承重墙）：eval 前加两道校验 —— ① 来源：只接受本站 js/*.js（拒绝跨域/协议相对/data:/blob:/爬出根/非 js）；② 形态：拒绝 HTML 文档、错误 JSON、空串（就是 SW 兜底串页那类东西被当脚本 eval 的现场）。校验失败只跳过/抛主脚本，绝不静默 eval；日志统一带 page id + 脚本名。另：站外脚本在 pageScriptSources 收集阶段就已排除，两层是叠加的，不是重复。SW v517 → v518。
  // 10-24 R-1 第一批 + 补 S-6 欠账：① 顶栏「回顾」二级菜单四项 → 两项（成绩 score / 轨迹 record），配合回顾页 R-2 合流；三个老深链值 breakdown/overall/speaking 由 review.html 内联映射落到成绩栏，旧书签不会变成空页。② 补 S-6（19fbee1）漏登的两个预缓存条目 /js/sp-late.js 与 /js/sp-timer.js —— 那批按规矩把 CACHE 留给 A 但忘了写「待 bump PRECORE」，线上 SW 一直停在 v516，弱网/离线下这两块从未进缓存，口语模考的按需加载与自动计时会静默缺失（不报错）。③ 新探针 tests/_precore_audit_1024.cjs 固化这条：speaking.html 加载的每一块都必须在 PRECORE 里，且登记的文件真实存在、无顶层 const/let（负向验证：拿修复前的 sw.js 跑同一套 → 2 项红）。只动共享层两处，页面层零改动。SW v516 → v517。
  // 10-23 HOTFIX 部署风暴降噪（她 20:34 直接报障「网站特别卡、闪来闪去、UI 一会有问题一会又恢复、点进子页弹到别的页」，原话「先别更新新东西了，先把这些毛病修好」）：根因 = 施工流水线当日 08:20~20:26 共 31 次 SW bump（平均 23 分钟一次）× 三重自动刷新机制全叠在她的慢网络上 —— ① 部署探针 60s 一探、一发现 ?v= 漂移就自动 reload；② SW activate 的 c.navigate 把已打开页面无声强刷；③ 连续两轮未恢复就 hard-heal 清空全部缓存重下（慢网下 = 数分钟卡顿）。改法（本文件只动 activate 段）：撤 c.navigate 强制导航，只发 SW_UPDATED 提示（前端 common-pwa.js 每会话最多弹 1 次「发现新版本」条）；版本收口交给 common-shell.js 的部署探针 —— 周期 60s → 10min、软导航进行中不打断（pushState 未落时 reload = 弹回旧页）、软自愈冷却 60s → 5min、hard-heal 冷却 60s → 30min。更新最多延迟 10 分钟生效，换来一整天的安静。SW v504 → v505。
  // 10-23 B-6 小步1 全站扫尾（方案 交接/方案/B-6-全站扫尾-方案.md §一.1 + §三.1）：.streak-chip 三段互覆盖收敛成「各归各的作用域」—— ① common.css 1159 那段是 10/1 首页 hero 版留下的，首页容器早换成 .hline 后它就成了空转规则，却排在背词段之前把连击 chip 的 --ok-bg/--ok-text 静默覆盖成浅青底深青字（三处定义谁赢只取决于书写顺序）→ 收窄成 .hero 作用域（与 home.css 的 .hline 段永不同时命中），老写法注释留档便于回溯；② 背词页连击 chip 恢复自己的主题绿底（连击/boost/红心态/x2 徽章四态实测不变）；③ 版本串审计：19 个引用共享外壳的页面 ?v= 口径一致（落地页 index.html 与草稿页 ui-mockup.html 不引 common.css，login.html / admin.html / errorbook.html 整页自带样式，三者本来就不参与 bump，属正常）。只动 css，JS 一行未改。SW v503 → v504。
  // 10-23 全站手机端摘顶栏 + 修「回顾」手机入口（她 08:1x 口径的**全站**范围，T-011 当时只做了三个组页）：① css/common.css ≤860 段：.hub-topbar{display:none} + body[data-shell="top"]{padding-top:0}（顶栏是 fixed，body 那 44px 是它自己的占位，不归零顶部会留空白）+ 离线/新版本条回到贴 safe-area。② js/hubgroup.js 删掉 T-011 那份 body[data-hub-group] 局部规则（全站规则已覆盖三个组页，留着反而两处 !important 打架，且它会把≤560px 的 container padding-top 顶掉）。③ 功能补偿：计时徽标 #sideTimer 就长在顶栏 .tb-right 里，新增 ensureSideTimerHost()（js/common.js）把**元素本身**搬到 body 直下 + .st-mobile（fixed 浮在底部 dock 上方，读 --dock-h），宽度>860 搬回原位。它是「停掉进行中计时」的唯一入口；而无会话时 box 本就是空的 → 平时零存在感，不违反「手机端少即是多」。④ 修回归：GROUPS.me.items 加回 review（T-014 摘掉它的前提是“已提为顶栏一级入口”，而手机端 .tb-caps 本就 display:none + “更多”面板又收到了会员/设置 → 手机端曾经零入口），tagline 改「回顾、会员与设置」。SW v473 → v474。  // 10-22 二轮修正（照官方复刻补漏）：① Options 面板标题单数 Option → 复数 Options（官方对照；bank.js + writing.js 两处）② 选项圆环/方框收成官方尺度 13x13 + 1px #535353（真载体是 .ex-pill::before —— 随机组卷绝大多数题走它；.ex-cbox/.ex-radio-box 老容器同改；选中态用官方黑，深/黄主题各自适配）③ 文章区不写 font-size（守住 --exfs 缩放链，防 10/16 那个「Size 只能调题目、文章不动」的旧 bug 复发）④ JS 串号：bank.js → 20261022c(仅 bank.html)、writing.js → 20261022c。上一版 v463。  // 10-22 IDP 官方机考一比一复刻（她拍板「照着它这个改...左上角 iELTS 改成 yasihub.com...上下栏适当比真卷子窄一些...颜色也跟那个弄一样」；参照 demo-ielts.inspera.com，23 张截图存 _mock-ref-20261022 目录）：① 顶栏左加品牌位 yasihub.com（本站渐变方块标 + 域名文字），官方纯白无阴影 44px（比官方 56px 窄）② Part 横幅官方米灰 #f1f2ec + 1px #d5d5d5（原淡绿）③ 阅读分栏白底黑字 + 2px rgba(0,0,0,.5) 重分隔线（原 1px 灰线）④ 题号方格 21x27 + 当前题 2px #418ec6 蓝框、删已答线⑤ 填空框 133x22 1px #535353 官方深灰方框⑥ 右下 Previous #ddd / Next #000 方块 40x40（官方 56x55，按她「适当窄一些」收窄）⑦ 底栏官方透明底 + 当前 Part 600 字重 + 灰「x of y」，品牌条第二行收掉⑧ 右下 Review 勾 #efefef⑨ 听力改官方整页遮罩（白耳机图标 + 官方原句 + 黑底 Play 键），播放中只显示「Audio is Playing」（进度/时间/倍速全撤）⑩ Option 面板官方白底大字行 ⑪ 交卷弹窗官方方角白底。颜色全部用官方 getComputedStyle 实测量，不碰本站 token。bank.js 走 PRECORE 裸路径 + 本版本 bump 覆盖；SW v462 → v463。  // 10-22 T-004 口语页视觉改版（样张 design/口语页改版样张-v2-20261022.html 落地，细则见桌面交接目录 T-004-口语页视觉改版.md）：① 新增「驾驶舱」区块（考试日/距考天数/还剩 N 道 P1 没练 + 主按钮「开始模考」转发 #spMockJumpBtn + 三格统计 P1 进度/P2 进度/口语平均分；无考试日退化成题库概览、无分数整格隐藏）② 题库 tab 药丸式改下划线式（选中 2.5px teal）③ 工具行改细边框平铺控件 ④ 分组标题 .sp-block-h（h3 + desc + 「全部开始」）⑤ 题卡合并成一张卡多条（通栏行 + hover 左 2px 标记）⑥ 「练这道题」从按钮改右栏文字链（与标题同行，行高 130 变 73px）⑦ 深色下 P1/P2/高频标签与成绩徽标文字改 --primary-200（原 --primary-900 深色无覆盖值 = 黑底黑字）。common.css 只新增 --sh-1/--sh-2 两档阴影 token（20 页 bump 到 20261022f）；speaking.js → 20261022e；speaking.html 页内样式块追加 T-004 段。上一版 v461 = T-006 考官纯随机 8 位。  // 10-22 T-006（她：「这个考官不让选择，模考的时候随机哪个考官就是哪个考官」+「可以多加一些考官的图你要不再生成几张」）：① 口语模考考官池 4 → 8（新增 Vivian Chen / Arjun Mehta / Carmen Ruiz / Eric Lam，img/examiner/ 共 8 张，规格与原 4 张一致：AI 实拍级照片、800px 宽、JPEG ~45KB）② **删掉「换考官的样子」页签**（设置页与陪练页弹层只剩「我 / 陪练」）—— examAvatar 字段从此无任何界面读取，mock.js 删掉「选中的考官 50% 优先」逻辑 = 每场 8 位纯随机、抽到谁是谁 ③ 口语陪练头像池 2 → 8（新增 coach-f2/f3/f4/f5/m2/m3 六个 avataaars 卡通，viewBox 0 0 280 280、3-8KB，与原有 exam-f/exam-m 同规格；弹层「陪练」页签 4 列 → 8 列）。mock.js → 20261022a（仅 speaking.html）、av-picker.js → 20261022a（settings.html + speaking.html 两页同串）、settings.html / speaking.html 同串。上一版 v460 = T-007 验证码。  // 10-22 T-007（她 15:01 报「验证码没发出去 + 失败后还锁 60 秒」）：auth.js 的 email_code 把三个 KV 挪到发信成功之后才写（此前写在发信前 -> 上游 403 域名未验证时冷却照样生效，她朋友连试三次每次白等一分钟）；新增 5 秒发送锁（连点只发一封）、失败只删锁不写冷却/计数、上游错误带 code（mail_domain_unverified / resend_401 / resend_timeout / resend_network）、发信后 KV 满时明说码已到邮箱。login.html 失败提示追加错误码小字。上一版 v459 = 换顶栏第 5 批 模考页接入顶栏壳。  // 10-22 换顶栏第 5 批（全站最后一批）：模考 bank.html 接入共享外壳（<body data-shell="top">）。至此 11 个功能页全部换成顶栏壳，288px 侧栏只剩未登录的落地页/登录页在用。bank.html 三处沉浸态（#examRoot 阅读听力 / body.exam-fullscreen 写作机考）本就是 position:fixed;inset:0 + z-index:900 的整屏覆盖层，天然盖住顶栏（z-index 50），本页零附加规则、零 css/js 改动 → 只换 SW 缓存版本。上一版 v458 = 第 4 批 单词/口语/写作；v457 = 第 3 批(2/2) 计时/句子/错句本/回顾；v456 = 第 3 批(1/2) 计划页；v455 = 首页今日任务超过 5 条只显示前 5 条 + 一行「还有 N 条去计划页」
   // 里命中已有词的分支原调 resetWordProgress（level=0 + nextReview=今天 = 归零重背），太狠——一个已 Lv 6（60 天档）的
   // 词只是词表里又出现一次就被打回今天。新增 demoteWordProgress(w)：level-1（Math.max(0,…) 兜底，最早到 Lv 0）
   // 🔑 **必须同步降 dh**：design/77 起 level 只是 dh 的显示代理（displayLevelFromH 由 dh 反推、答对时
   // `w.level = displayLevelFromH(w.dh)` 覆写），只改 level 不动 dh → 下次答对就把它算回原等级，降级等于没发生。
   // dh 取 LEVEL_INTERVAL[降级后档]（[1,2,4,7,15,30,60,90]），nextReview = 今天 + 同档间隔（Lv 0 = 1 天）。
   // cleared 置 false（降过级一律回复习队列，否则 Lv 5/6/7 仍挂「已掌握」永不再来）；okStreak/errStreak 归零
   // （连击属短期状态，退一档即断开）；**保留** errTotal / hist / lastReview / dd / hardWord / keyWord / ts / id / en
   // ——历史与主观标注不因降级抹掉。resetEpoch 照旧 +1 保证跨设备传播。新建词仍走 resetWordProgress（从零开始不变）。
   // 三处提示文案同步改「降级 N 个已有词（各降一级，最早到 Lv 0）」。⚠️「合并重复词」按钮不动（只去重不降级，超出她点名范围）。
   // ② 同批：她接着提「我其实想把 AI 补全这个按钮去掉，你还给我又加一个按钮，我希望这个功能导入的时候就是完全体」
   //    ⇒ 删掉 practice.html 头部的「AI 补全」按钮（#backfillBtn）与其处理器 backfillCn()，
   //      并把我上一批加的「合并重复词」按钮（#mergeDupBtn）一并撤销 —— 两个作用全部下沉为
   //      **进词库页自动静默跑一遍**的 autoTidyWords()：① 合并重复词（按英文小写分组，保留练得最久的一条，
   //      难词/重点/缺失字段并入；⚠️ 不写墓碑 —— 墓碑按 en 过滤，一写会把保留项一起抹掉）
   //      ② 全库释义过 salvageWordCn 重洗（幂等）③ 词组词性归一 phrase.。三步都幂等，
   //      只在真有改动时才 hubSave()+renderWords()（写本机，不额外打 KV）。
   //    ⇒ 「导入即完全体」由 AI 导入的阶段①（抽词+释义）+ 阶段②（词性/音标，20/批）保证；
   //      未登录降级路径的提示语改指「登录后重新导入一次即自动补全」，不再让她去点按钮。
   // js/words.js → 20261020c（仅 practice.html）。PRECORE 含 js/words.js → 必须 bump。上一版 v439。  // 10/20 深夜 口语题库按《考频版_1010》整库重建（P1 33 话题 197 小题 / P2 56 卡 = 89 条，旧库 59）：① 下线 10 条（P1 收集/电脑平板/街市/失物招领 已转非大陆 + 邮件/准时/亲戚 不在本季；P2 只见过一次的人/家里坏了修好的东西/传统庆祝）② 新增 40 条（P1 音乐/公园与花园/唱歌/购物/整洁/科学/镜子/外太空/衣着/笑话/耳机/早晨/机会 + P2 27 张卡）③ 必考题按「同类型合并」：居住的地方/所在城市 升必考，5 个话题 72 小题 → 58（学习与工作两套平行问法合一 6 组、住所 3 组、家乡 2 组、居住地 1 组、所在城市 1 组）④ 频次按 10/5–10/18 两周周报重算（P1 5必考/5高/18中/5低，P2 3高/15中/38低）⑤ SPEAKING_BANK_VERSION 16→17 强制迁移，旧答案按题干文本重映射。data.js → 20261020g（20 页）。上一版 v433。  // 10/20 深夜她暴怒两项（原话①「你为啥把我英语陪练的头像改了，我是说陪练和考官用不一样的图片你听不懂吗，考官用真人陪练用卡通头像啊我真服了你给我改了干嘛」②「这个思考文案换一个，比如让我想想，或者等我想一会之类的，然后每次思考的文案最后都不太一样那种，反正就多预设点这种思考文案」）：① 根因 = 白天 b76cc35 把考官换成 4 张真人照时，**陪练气泡头像一直复用 avExamSrc()** → 陪练也跟着变真人。现在三套彻底分开：我=USER_AVATARS（avatar）· 陪练=COACH_AVATARS 2 个 avataaars 卡通（coachAvatar，exam-f/exam-m.svg 从 git b76cc35^ 恢复）· 考官=EXAM_AVATARS 4 张真人照（examAvatar，只给 mock.js 考官视频窗）。头像弹层加第三页签「陪练」；coach.js initExamAv 更名 initCoachAv（avOpen('coach') + avCoachSrc 同步）；coachAvatar 已进 SYNC_SETTINGS_FIELDS 跨设备同步；data.js 加默认值但不 bump（20 页引用 + valid() FALLBACK 兜底，同 b76cc35 纪律）。② THINKING_TEXTS 整体换成「让我想想 / 等我想一会」家族并扩充到 10 条（showThinking 每次随机取一条的机制不变）。av-picker.js → 20261020b（settings.html + speaking.html 两页同串）· coach.js → 20261014a（speaking.html）· common-sync.js / data.js 只加字段不 bump。⚠️ 与 22:3x 底栏二次返工**同一批上线**（底栏批未提交），故 SW 版本仍 v433；上一版 v432。  // 10/20 22:3x 底栏二次返工（她发来爱听写 idictation 里**真实机考截图**，原话「底栏听力阅读模考的做成这个样子，你改错了」）—— 上一版 v432 照 IDP 英文文档做的「全卷 40 题 + 底栏前后箭头 + 左下角 Review」与真实软件不符，逐条纠回截图口径：① 题号行只展开**当前 Part**（截图：Part 3 → 21…30），其他 Part 只显示「Part N」+ 灰色「x of y」已答数；做完的 Part = 绿勾 + 篇名（截图：☑ Part 2）② 底栏箭头挪到**题目区右上角**（深色方块，全程连续、跨 Part 自动切篇）③ **删 Review 按钮**（flag 保留题干右上角小旗子，与题号圆圈同步）④ **整卷恢复 Pause**（截图里有；听力完整模考 listenMode==='exam' 仍不渲染 —— 她 10/20 定的「考试模式锁定播放」是行为铁律）⑤ 三个动作按钮同款浅灰（原来 Finish 主色蓝、Exit 红描边，均与截图不符）⑥ 22:5x 追加：底栏改**两行**，第二行品牌条「yasihub.com · 听力/阅读」（对标爱听写「爱听写 剑雅21 Test 4」；右侧留空 —— 整场计时在顶栏；手机 ≤860 整条隐藏）⑦ Part 胶囊改纯文字（不再白底高亮）+ .ex-pt 由 <button> 改 <div role=button>（当前 Part 里嵌题号按钮，button 不能嵌套 button，解析器会截断外层）+ keydown 补 Enter/Space。bank.js → 20261020f（仅 bank.html）。上一版 v432。  // 10/20 18:4x 写作页底栏按**真实机考**重做（她拍板 Q1「ABC 都不用，你去看看真实考试是怎么设计的就怎么做，我记得真实考试应该是接近 2 但也不一样」+ Q2 全屏放顶栏 ☰ 左边 + Q3「Part 1」→「Task 1」+ Q4 底栏 48→44px）：① 底栏 = 左下角两个**相邻的任务标签**（选中白底块深字 / 未选中透明灰字、32px 高、无边框无下划线、两个标签之间无间隙），依据三个独立来源 —— englishups.com/?p=5145 复刻官方 familiarisation test 的「Use the tabs at the bottom of the screen to switch between tasks」+ 新航道实地「点击屏幕下方的 task1 或 task2 按钮」+ 小站名师亲测「左下角任务栏显示 task 1 和 task 2 的标签」② 删 ‹ › 箭头 / 「1」徽章 / 「Task 1 / 2」重复文字 ③ 底栏 52→44px、左 padding 改 22px 与正文对齐、右三按钮 40→32px、全栏字号统一 13px（原来同一行 5 种字号 5 种高度）④ 顶栏新增全屏键（#wrtFsBtn，放 ☰ 左边，图标与 bank.js 逐字节相同，进出两态 + title/aria 同步）⑤ 写作左侧大标题 Part→Task ⑥ **同时修掉一个真 bug**：common.css 里早有 `.exam-bar` 组件（`#examPractice .exam-bar` 特异性更高），而写作壳 footer 只写了 `ex-bar` —— 两套都对不上，底栏切换器样式一直挂在死类 `.exam-bar` 上（实测 .ex-pg 24px 而非 30px、两个 Task 都是白底 → **选中态几乎看不出来**）。本批改用专用类 `.wt-bar` 彻底避开 common.css 冲突。writing.js → 20261020b（bank.html + writing.html 两页）。上一版 v430。  // 10/20 18:0x 口语模考两项（她 17:55 报）：①「点口语模考会跳到这个画面卡住一会再跳到模考页面」= 根因是 speaking.js 的 MOCK 分支**先显示 #mockView 空壳**（露出「模考加载中…」）再等 mock.js(62KB)+mock-report(9.5KB)+mock-history(7.5KB) 三个**串行**下完，视觉上跳两次；顺带查出预取那段的 requestIdleCallback **没传 timeout**（主线程一忙就拖几秒）+ 只在 window load 后才开工（硬刷时被图片字体拖晚）。改：预取提前到 DOM ready 后 300ms + timeout:1500 必触发、模考优先于素材，冷路径**不切视图**（保持题库列表 + MOCK tab 转小圈，下好一次性进考场 = 只跳一次），真失败才切视图给错误态。②「考官图不是考官」= 原来 4 位里 2 位是 avataaars Q版卡通、2 位是 SVG 插画 → 全换 img/examiner/*.jpg 四张 AI 实拍级照片（Sophia/Daniel/Emily/James，统一背景光线构图，800×469 各 ~45KB，裁掉底部 12% 去 AI 水印，原 1536×1024 PNG 1.8MB 不入库）；av-picker 考官列表 2→4 且改按 src 字段取全路径（考官是 .jpg 在 img/examiner/、用户头像仍是 .svg 在 img/avatars/），data.js 默认 examAvatar → ex-sophia（老值 exam-f/exam-m 走 valid() 失配自动回落），删旧 4 个 SVG。speaking.js → 20261020a、mock.js → 20261020b、av-picker.js → 20261020a（settings.html + speaking.html 两页同串）。data.js 的默认值也改了但**本批不 bump**（20 页引用，且改动有 FALLBACK 兜底不影响行为，留待下次实质改动一并 bump）。上一版 v429。  // 10/20 17:4x 配对题 C 布局 + 音频条重排 + heading 槽真 bug 修（她 10/20 拍板 ①②③④ + 2B 补充）：① **配对题（matching 且非 heading）统一走「左题 + 右栏白卡片选项」** —— 阅读词条匹配 + 听力共用选项池那批一起统一（右栏比例 1.25fr/1fr、最小 300px、白卡片带轻投影、无硬边框、桌面 sticky；≤900px 塌回单列）② **音频条整体重排**（她 4B）：倍速 select 固定 74px（原撑到 1401px）、进度条恢复 flex:1 吃满宽度 + hover 放大 + 显手柄、时间数字 tabular-nums 对齐、Part 胶囊瘦身到 141px、播放键加「正在播放」呼吸脉冲态（只加 class 不改结构 = 零布局位移）③ **全屏按钮重做**（字符 → SVG：进入=四角朝外箭头 / 退出=四角朝内箭头，title+aria-label 同步）④ **heading 题原文段落槽修真 bug**：headSlotsInto() 原来去 #exArt 里找题目区槽抄 data-g（题目区在 #exQCol）→ 原文槽拿不到 data-g → 拖进去只剩罗马数字；改为**全 DOM 驱动**（从题目区读 data-q/data-g/段落字母）+ renderPassage 里移到 qcol 渲染完再跑 + CSS 按真实结构（槽内是裸 <b>，无 .ex-chip 包裹层）→ 槽内显示「罗马数字 + 完整标题正文」⑤ **多选题共享组回滚**（我超她拍板范围改坏的：她只拍板配对题，我顺手把多选也改成左右布局 → 选项被挤成 252px 窄列、字号变大、文字截断 → 已回滚到 10/16 二修形态）。bank.js → 20261020b（仅 bank.html）、bank.html 内联 CSS。上一版 v428。（她报「模考时莫名其妙弹出去 + 页面乱动」）：① 全站模考锁 common-shell.js（hubExamLock：模考中拦站内链接点击/浏览器后退/跨文档卸载 + 锁住 location.href 赋值；侧栏与底栏在模考中隐藏 → 没有可点的出口。实测复现：模考中点侧栏 → 软导航换 <main> → #examRoot 连同已答内容被销毁）② navSelfHealReload 在模考中改为推迟（部署探针每 60s 探一次，探到线上新版就整页刷新 → 她在模考里待够 45s 就会被刷出去；改为记 _hubPendingHeal，退出模考后再刷，不卡旧版）③ SW 更新条/额度条/云同步提示条在模考中不出现（swUpdateBusy + limitStrip + syncTipShow 都加模考判定 + CSS 兜底）④ 写作机考与口语模考补报 EXAM_STATE 给 SW（10/15 只给 bank.js 加了，writing/speaking 一直漏 → SW 一更新就把人刷出模考）⑤ 模考中计时数字改等宽 tabular-nums（00:09:59→00:10:00 每秒变宽 → 整行跟着抖）。共享外壳 7 块 + css/common.css 整组 bump 到 20261020a（20 页）、bank.js/writing.js/mock.js 同串。上一版 v427。  // 10/20 模考工具栏/音频条/听力计时/阅读左右布局/口语退出 tab（她 10 项里的 ①②③④⑤⑥⑦⑨）：bank.js 大改（全屏+音量换 SVG、音量旁新增倍速 select 0.8–1.5 共 8 档、删眼睛标「隐藏计时」、听力单篇不跑整场计时、mountListenTools 搬进音频条、阅读词条匹配左右分栏、口语模考退出回 MOCK tab、指南卡旗标换 SVG）+ bank.html（CSS + bank.js?v=20261019c）+ js/mock.js。上一版 v426。  // 10/19 修段落信息匹配（type:"map" + reading）交卷后整组不挂逐题结论条：map 走矩阵表格，题号藏在 <b class="mx-no"> 里、也没有 .ex-blank → decoratePassage 的 anchor 恒 null → groupEl 恒 null → 该组一题都不挂 .ex-rv（实测 13 题只出 7 条）。补 mxEl.closest('tr') 兜底锚点，并新增闸 tests/_probe_maprv_1019.cjs（消融实验：去掉这行立刻掉回 0 条）。bank.js → 20261019b（仅 bank.html）。上一版 v425。  // 10/19 修 renderListenPart 的 if(barHost) 缺花括号：容器缺失时会抛 TypeError 并中断后续题目渲染（表现为「考场既没有音频条也没有题目」）；改显式花括号 + 失败给可见兜底提示。bank.js → 20261019a（仅 bank.html）。上一版 v424。  // 10/19 共享外壳按功能拆成 7 块（common.js + 6 块 common-*.js，20 页整组 bump 到 20261019a）+ 6 块全部进 PRECORE；软导航的「全局共享脚本排除表」与部署漂移指纹同步改为整组识别。上一版 v420。  // 10/18 19:5x 软导航补齐页面专属样式表（她 9 张手机截图报「这些页面 UI 都有问题」的根因）：软导航只搬了 <head> 内联 <style>，从不加载 css/p/*.css → 从底栏/侧栏点进去的页面一直挂着上一页的样式，设置页主题开关涨成 225×230、口语模考计时圆弧占半屏、热力图每格撑满整行。js/common.js 改到 20261018a（25 页）→ 必须 bump。上一版 v419。  // 10/18 16:5x 设置页指示条修复（她截图报「意见反馈像被选中」）：#setNavHit 是窄屏横向标签的滑动指示条，桌面竖排目录下 bottom:0 永远钉在最后一项「意见反馈」下 → @media(min-width:861px) 隐藏，桌面靠 .on 底色标记。settings.html 在 PRECORE 里 → 必须 bump 让缓存壳更新。上一版 v418。  // 10/18 模考第二批（P1-2 考前操作指南卡）：
//   点进模考后、答题页渲染**之前**弹一张一次性卡片（4 条：全屏 / 隐藏计时 / 标记本题 / 底栏切篇），
//   点「知道了，开始」才真进考场 —— **倒计时尚未开始，不会白扣时间**。
//   按科目各记一次（hub_exam_guide_v2_reading / _listening），✕ 与 Esc 都算看过，之后永不再弹。
//   图标复用顶栏那两个真实 SVG（卡上长什么样，考场上就长什么样）；挂 body 上（列表页、不在考场内），
//   所以文案用中文 —— 普通考生看得懂比全英文更重要（「考试页零中文」管的是答题界面本身）。
//   覆盖三个入口：openExam（单篇阅读/听力）· openFullTest · openFullListenTest。
//   bank.js → 20261012aj（仅 bank.html）、bank.html 内联加 .exg 一组样式。上一版 v417。  // 10/18 模考三批（按竞品调研优先级实施 · 首批）：
//   ① P0-1 答题页工具栏：顶栏 ☰ 左侧新增 Full screen（requestFullscreen，Safari 走 webkit 前缀，失败静默）与 Hide time（计时显示 --:-- 并去掉 10/5 分钟警示色；**只隐藏显示，倒计时与到点强制交卷逻辑一字不动**，本地记忆 hub_exam_hide_timer_v1 跨卷保持）。
//   ② 🔴 顺带修掉一个既有 P0 级 bug：10/14「两行并一行」把听力答题页的 .ex-top 整行 display:none，
//      住在里面的整场倒计时与 ☰ Option 一起消失；10/16 音频条瘦身又撤掉 #eaFullTimer ——
//      实测听力考场**页面上没有任何可见的 mm:ss**，且字号/配色面板打不开。
//      修法：仍是「一行」，把「倒计时 + 工具组」搬进音频条末尾（mountListenTools；只在单篇听力调用，
//      完整听力模考的音频条会随换 Part 重建，那条路径保持顶栏可见）。
//   ③ P0-2 完整模考入口卡显示「上次 X/40 · N 天前」+ 细进度条（数据源 DATA.mockRecords 的
//      granularity:'whole' 最近一条；没做过给灰字、未判分说「上次未判分」，绝不显示假分数）。
//   ④ P0-3 成绩卡「WHAT TO DO NEXT」三卡：看错题（复用 Incorrect only 筛选 + 跳到第一道错题）/
//      再做一次（复用 openExam / 随机完整卷）/ 回列表。全部复用站内既有能力，不承诺没有的功能。
//   ⑤ P1-4 + P2-2 交卷确认弹窗：未答数从「只能看的字」变按钮（Go to the first unanswered → 跳到
//      第一道未答，未答在机考里是纯丢分），并把本场标记的题号列成可点小卡（Marked for review）。
//   ⑥ 🔴 搭车修既有 bug：goTo() 的跳题锚点选择器长期是错的（`.ex-qn[data-qn]` 与
//      `input.ex-blank[data-q]` 在真实 DOM 里都不存在）→ 除「多选合并组」外，点题号行/答题卡
//      **根本不会滚动**，且不报错（典型的「点了没反应」）。改按真实 DOM 找锚点并滚整行。
//   ⚠️ bank.html 内联 CSS 加 .ex-toolbtn / .ea-full / .fc-last / .fx-ncard / .ex-modal-jump 等规则。
//   🔴 血案记录：这批 CSS 一开始整段失效 —— 注释里写了 style 结束标签的字面量，
//      HTML 解析器不看 CSS 注释，当场闭合 <style>，后面几十条规则全部掉出样式表且无报错。
//   bank.js → 20261012ai（仅 bank.html）。上一版 v416。  // 10/17 #9 层次 3：回顾页新增「按题型看正确率」——做题页交卷落盘时给每道题补题型短代码（复用做题页既有的题型判定，含 Heading / 段落匹配细分），回顾页「表现统计」卡片新增一块按题型正确率 + 最弱题型提示。bank.js → 20261012ag（仅 bank.html）、scores.js → 20261017b（仅 review.html）。  // 10/16 字号设置作用域修复（她：Option>Size「只能调题目的字体大小，其他调不了」）：把考试内容区的字号全部改成 `calc(var(--exfs) * 系数)` —— 文章正文/文章标题（原 15px + !important 归一化，被 10/14 那批锁死）、组标题 Questions X–Y、组指令 Choose TWO…、填空框（输入 + 框高）、段落匹配下拉 .ex-lohsel、段落信息气泡 .ex-lohb/.ex-lohv、拖放槽 .ex-drop/.ex-pslot。默认档（--exfs:20px）数值与改前逐项相等 = 外观零变化（不回归 10/14「字太大」）。🔴 真凶是**特异性**：common.css:475 全局表单规则 `input:not([type=checkbox]):not([type=radio]):not([type=range])` 是 (0,3,1)，压过 `.ex-blankw input`(0,1,1) → 填空框字号/高度/内边距/边框一直由它决定；修法是给该规则加 `#examRoot` 前缀升到 (1,1,1)。顶栏/底栏（计时、题号行、按钮）保持固定不缩放（= chrome，与真机考一致）。仅 bank.html 内联 CSS，无 ?v= 变更。上一版 v395。  // 10/16 fix(bank)：修复「有的题没有题目」——建库白名单丢掉了 groups[].imageUrl/description，627 篇题组回填（阅读 7 篇图表填空 + 听力 37 组地图题/3 组图解题）+ 1340 组换平台官方英文指令。数据文件不带 ?v=、SW 对无 query 的 json 走 stale-while-revalidate → 已缓存的用户不会自行更新，故 bump 缓存版本让 activate 清旧缓存（考试中页面按 10/15 规则不强制刷新）。上一版 v402。  // 10/16 多选组二修（她复报三条：题型 UI 不像考试 / 多选能选超限 / 有题只有题干没选项）：① 共享选项组（109 组里 102 组）由「逐题渲染」改**合并成一行**（题号「9–10」宽框 + 一个题干 + 一份选项）——原来非承载题成了「有题干无选项」的孤儿行（她截图第 10 题）；② 选项形态对齐真机考（爱听写逆向实证：多选 = checkbox **方框 + ✓**，单选 = radio 圆环；推翻 10/15「多选=圆环」）+ 选项字母与文案间距 2px→7px；③ need 派生改 `max(题干, 答案字母并集) || 组题数`（题库 39 组把 Choose TWO 的两字母**拆到两题**、题干也不写 TWO → 旧口径给 0 = 不限数）；④ 判分改**组答案集合比较**（真机考 "21 & 22 in either order"，逐题比单题 key 会把拆开存答案的组全判错）+ 草稿恢复按 need 裁掉超限勾选。bank.js → 20261012s（仅 bank.html）。上一版 v394。  // 10/16 多选组三修（她 10:16 投诉排查批）：① 选项从 .ex-qt 的 flex 兄弟节点移入其内部 = 题干下方竖排整行，治「长选项把题干栏压成 40px/0px 窄条 + 文字溢出被选项底色盖住（词中断）」（10/14 写下的 .ex-qt > .ex-opts 规则自此生效；形态同 104 样子稿）；② 共享选项组（全库 109 个多选组 102 个是「选项只挂组首题」）：承载题输出唯一 cbox + data-share 列出共享题号，collect 把勾选值同步写给全组、取消勾选显式删除 → 修 Q10 等无选项题完全无法作答；③ needOf 兜底改读题干文本（description 字段 109/109 缺失致 Choose TWO 限数从未生效）+ fillSharedAnswers 把组首题答案键补给同组缺失题（修勾对也判错）。bank.js → 20261012r（仅 bank.html）。上一版 v393。  // 10/16 题型/按钮形态对齐爱听写批（她拍板 3 条：主色留 teal / 填空框改实线方框 / Exit 改浅底）：① 填空框 .ex-blankw 改 1px 实线灰边 + 无圆角 + 左对齐（爱听写 .question-input 口径，原 1.5px 深灰边+6px 圆角+居中）② 写作壳 Exit 去红描边改浅底弱化字色（common.css #examPractice .exam-bar .btn-exam-exit，原红描边）③ 题号行：已答线移到题号上方 2px（原在下方）、旗标改红色 ⚑ 挂题号上方（原黑圈）。common.css → 20261012i（26 页）。上一版 v392。  // 10/15 23:4x 底栏/顶栏口径对齐爱听写批：① 阅读篇切换器文案 Part→Passage（官方卷面用词；10/15 并排切换器那批把阅读也写成 Part 的副作用纠回）② 三科顶栏加「Saved」自动保存指示（写盘成功才亮 1.6s、写失败不亮，避免假承诺）③ 写作壳顶栏同步加 Saved。bank.js → 20261012q（仅 bank.html），writing.js → 20261011i（bank.html + writing.html 同串）。上一版 v391。  // 10/15 23:2x 写作模考 Task1/2 切换 + Option 面板（她 10/15 上午两条要求，本次补完工作区半成品）：底栏左侧加 Task 1/Task 2 并排切换器（深色底栏 → 白描边胶囊、当前篇白底高亮、左右箭头到头变灰）+ 双草稿（切走前存、切回后还原，解决切回来作答空白）+ 顶栏补 ☰ Option 面板（Colour 三档 白底/黑底白字/黄底黑字 + Size 三档复用 10/8 的 EXAM_FONT_KEY，写作页此前没有 Option）；写作页配色三档是本页新增（阅读/听力的三主题在 bank.html），全部走本机记忆不进 DATA。修两处半成品 bug：☰ 在顶栏不在面板内（原写法查 panel 内部恒 null，按钮打不开面板）、#examSplit 不存在（字号改走既有 examFontApply）。writing.js → 20261011h（bank.html + writing.html 两页共用同一串）。上一版 v390。  // 10/13 14:2x 会员页「为什么收费」真诚卡（她 13:44：「学成熟网站怎么劝开会员但别太过营销，真诚一点；要表达会员功能基本都是为 AI 服务——内置站长本人的 API key、使用有成本才收费，其他不 AI 的功能基本免费」）：价格卡上方插入「这个站为什么收费」卡（三段：① 会员功能基本都是在为 AI 买单——站长本人购买的接口，每篇批改/每轮陪练都产生真实费用，会员收的钱就是覆盖这部分成本 ② 不靠 AI 的功能永久免费且与会员无差别 ③ 收费只为让站一直开下去，不玩套路：免费规则全写在页面、7 天可退、到期数据不删）；对比表结语与 FAQ 第 2 条加「见上方先说清楚」指向。调研基线 ≥2 独立来源（whatled「定价与实际成本挂钩」/ vmobify「可预期性本身是产品价值」/ grizzlypeak「Communicate Value Not Features」），链接在 vip.html 注释。价格/功能表/结构不动。上一版 v355。  // 10/13 14:1x 新手引导分流 + 反馈文案微调批（她 14:0x + 13:44 两条，授权免问直办）：① 引导前置「考过雅思吗」分流卡（她：「不要所有人进来都弹新手引导，先选考过没考过」）——全新用户首访先弹二选一；选「没考过」→ 跳 beginner.html?from=onb 看 3 分钟新手必读，回来后继续原三步配置（考试日期/投入/词库照配）；选「考过」→ 直接三步。exp 落 ONB（null=未选只问一次；?onb=1 强制重看跳过分流；老用户零打扰不变）。关闭兜底三件套（遮罩/Esc/30s）抽成 onbBindDismiss 两卡共用。探针 tests/_probe_onbgate_1013.cjs 7/7。② 反馈弹层文案去「一个人在做」——改「你写下的每一条都是站长本人亲自看，提的意见也会认真斟酌」（她 13:44 截图要求）。common.js → 20261012i（19 页），feedback.js → 20261013b（14 页）。上一版 v354。  // 10/13 13:4x 头像选择器去文字标签批（她 13:3x 截图「每个头像下面不要写着男生女生1234，直接显示头像让人选」）：renderGrid 不再渲染 .av-lb 文字 span（settings.html 的 .av-lb 死样式一并清），img 的 alt/title 改中性（alt="头像"/title="选择这个头像"——alt 不能空，读屏要）；「我/考官」tab、选中勾、底部「共 8 个形象」、「完成」全部保留；点选迁移 + 侧栏/账户卡同步不变。av-picker.js → 20261004d（settings.html + speaking.html 两页引用）。本地截图自检：标签 0、8 方形头像、选中态/同步正常。上一版 v353。  // 10/13 13:1x 写作 pane 列表美化批（她 13:0x 截图报「一眼看不见重点 + 筛选条太长」，授权免问直办）：① 筛选条改一行窄条——两个 select 从「按最长 option 定宽各自通栏」改 nowrap + width:auto + max-width:172px（超宽横滑），选项文案「全部→全部作文」「全部题型→所有题型」（大作文（Task 2）→大作文 Task 2 缩短）；② 卡片层级重排——中文标题升 16px/800 两行 clamp（原 15px 单行 ellipsis 切内容，撞她「绝不切内容」判据）、来源 meta（同意与否|大陆 2019 原题）从顶行拆出独立成行降 12px 灰、「尚未练习」空态去边框去底色弱化为斜体灰字、分数徽章保持靠右。writing.js → 20261011c（bank.html + writing.html 两页共用同一串）。探针 examflow v4 扩 T20（S19/S20 静态 + 筛选条一行/卡片 clamp/meta 行/点击进场契约）89/89。上一版 v352。  // 10/13 12:5x 新手页文案重写 + 侧栏登录入口批（她 12:3x 报两件，授权免问直办）：① beginner.html 新手必读 4 节扩 7 节——新增「报名前两件事别搞错」（A/G 类看学校要求 + 认准 ielts.neea.cn + 口语预约趁早；机考考位多、考前 3 日截止报名）「现在全是机考改变了什么」（中国大陆 2026-9-1 起全面机考官方实锤；听力只一遍+仅 2 分钟检查=必须边听边打；阅读同屏滚动+右键高亮+可复制粘贴原文；写作电脑直打；Settings 调字号；出分 3-5 天）「考试当天带什么几点到」（证件+无标签水；上午 8:00/下午 13:00 前到；每科账号密码纸；试音）三节，原「机考一句话」删并并入新第 3 节。来源 ≥2 独立来源（官方 chinaielts.org 公告 + jiaoyubao/中国教育报道/新航道/川外四源交叉，链接在 beginner.html 注释）。② 侧栏左上角修她报的「bug」= 未登录也渲染默认陌生头像 → 改登录态才显头像、未登录显同尺寸「登录」入口（跳 login.html，顺手补上侧栏缺失的登录路径）。common.js → 20261012h（19 页）。自检：本地截图双态（guest=登录入口/logged=头像）+ examflow 84/84 回归。上一版 v351。  // 10/13 12:0x 做题页 UI 大优化 + 交互修 bug 批（她 11:0x 截图报 6 件，常设授权免问直办）：① 底栏并一行——题号行与 Pause/Exit/Finish section 桌面改单行 row（题号行 flex:1 占满），≤860 移动端保持两行；② 顶部三行缩两行——听力独立 Part 横幅（.ex-part）撤销，并入音频条行首胶囊 .ea-part（Part N · Questions X–Y），阅读无音频条仍留横幅；③ 左下全站绿胶囊（floatTimer）考场内隐藏（common.js syncFloatTimer 扩判断 #examRoot），改在顶栏计时器旁显示小徽章 #exFtMini（Timing/Paused + 时间，纯英文守「考试页零中文」铁律，数据源与 floatTimer 同口径）；④ Pause 从摆设变真功能——pauseExam/resumeExam：暂停音频+考试倒计时（剩余秒数入 EX._leftSec），按钮互文 Resume；⚠️ 只属练习模式（BC 官方 FAQ「recording cannot be paused」+ Zoju Strict/Breath + ieltsfreepractice Practice/Exam 三源一致 → 考试模式/听力完整模考不渲染该按钮）；⑤ 双击 Tab 窗口 600→800ms（她报没反应，慢双击 700ms 路径探针已验）；⑥ 填空框改真机考 placeholder 口径——点击后数字不硬消失，input placeholder=题号灰显、输第一个字符才让位（她截图 3 指定）。bank.js → 20261012i（仅 bank.html），common.js → 20261012g（19 页）。探针 examflow v4 84/84 + lfulltest 28/28 + 连带 randomfull 11/11 + dict 9/9。上一版 v350。  // 10/13 00:2x 意见反馈弹层文案真人化批（她 00:14「UI 大优化 + 文案写得真人感善解人意一点」，授权免问直办）：① 顶部加站长第一人称开场白「这个站就我一个人在做，你写下的每一条我都会自己看」；② 「遇到什么问题？必填」→「你遇到什么了？」（删红字必填），placeholder 从格式教学改真实例子（点「添加任务」没反应…）；③ 技术元信息「页面 settings.html · 1280×720 · 已登录」退到悬停提示，弹层只说「页面信息已自动附上」（提交数据仍原样带全，submit 独立重算）；④ 截图 label 说明价值「截图能帮我更快定位」；⑤「提交反馈」→「发给站长」，底部「未登录也能提交」→「不用登录也能发；截图只用来定位问题，不会外传」。成熟口径 ≥2 来源已核（corebee.ai「Every response is read by a real person / even one sentence helps」+ userguiding.com 反馈弹层五要素）。新增 .fb-greet 样式由 feedback.js 自注入（14 页引用，不动 common.css 免全站 bump）。feedback.js → 20261013a（14 页版本串同 bump），PRECORE 已含。上一版 v349。  // 10/13 00:0x 会员页修渲染 bug + 美化批（她 23:52「UI 大优化 + 渲染还有 bug」）：🔴 三个真 bug——① sprite #i-check/#i-lock 全站从未定义（10/12 批1 把静态表搬进 pricing.js 时丢了 sprite）→ 勾/锁图标全空白，且 <svg> 无尺寸默认 300×150px 直接把对比表列撑爆（她截图的列宽失衡/表头漂移元凶）→ sprite 补进 vip.html + common.css 给 svg 固定 15px；② 会员列金色高亮样式写的 .vip-col 与 pricing.js 输出类 c3 不匹配，从未生效（死代码已删，金色调统一收进 common.css .vip-cmp td.c3，她 10/1 授权）；③ 表格无 table-layout:fixed，长 sub 撑爆首列 → fixed + 首列 44%。美化：会员列金底、行 hover、主推价格卡轻投影、图例图标上色。common.css → 20261013a（仅 vip.html 引用 bump——.vip-cmp/.plan-card 样式只有会员页用）；SW v348→v349。上一版 v348。  // 10/12 23:5x 计划页「今日/规划」美化批（她 23:39「两个页面 UI 太丑」）：纯视觉层，交互/id/数据流零改动——今日 tab 添加区成面板（.pt-add 浅底圆角，手机端 display:contents 无盒零影响）+ textarea focus 环 + 空态一行小字改居中浅底卡 + 进度条主色 --med 药用紫→teal；规划 tab 四科目卡居中+色点+分数加重+差距/达标胶囊徽章 + 结论框大圆角左色条 + 「已生成 N 天计划」裸行改浅 teal 卡（emoji 🗓→线性日历图标）+ 报告大按钮轻投影。plans.js → 20261012b（仅 plans.html 引用）。上一版 v347。  // 10/12 23:4x 句子页「听写」tab 全面改版（她 23:31「全面大更新…现在这样完全不对」）：① 入口层改「练法模式双卡」——逐句默写（原「表格默写（隐藏英文列）」按钮退役，文案开发者视角）+ 听写（startDict 功能完整但此前页面从未给按钮，本次一并暴露）；② 句子库区「语料表（左中文·右英文）」改名「我的句子库」+ 搜索框补 placeholder；③ 添加入口由嵌套两层 <details> 改平铺三 tab（单条/批量/AI 识别），点「＋ 添加句子」展开；④ 库空态改大 CTA（图标+一句话+「＋ 添加句子」），且库空时两个练法按钮置灰（Quizlet「先建材料再学习」通例）。来源 ≥2 独立来源已核（listenmemo.com / sublearn.com / dictationtoday.com，链接在 corpus.html 注释）。corpus.js → 20261012a（仅 corpus.html 引用）。上一版 v346。  // 10/12 23:3x 完整模考改纯随机组卷（她 23:2x「组卷改成纯随机，不用提前写好题目在那」）：阅读/听力入口卡不再预组卷、不再列出具体篇目（原 _fullSet/_listenFullSet 渲染时组一次缓存的两变量已删），点 Start 那一刻才从 Part 各随机抽 1 篇（每次都不一样，退出回列表再进=再抽）；题数口径写死 40（全库实测：阅读 Part1/2 恒 13 题 + Part3 恒 14 = 恒 40；听力每篇恒 10 × 4 = 恒 40），卡上 pills 改「随机组卷 · Part 各抽 1 篇 / 每次 Start 重新抽」。bank.js → 20261012h（仅 bank.html 引用）。上一版 v345。  // 10/12 23:1x 口语模考入口页改版（她 23:01「页面太空泛」+ 作答方式口径）：「作答方式是打字」→「语音输入 + 推荐豆包输入法（识别最准）」；页面结构照成熟站通例改「Part 1/2/3 流程三卡（编号+名称+时长，来源 ieltsmentor.ai / ieltsbeacon.com / english-secrets.com，≥2 独立来源已核）+ 说明条目两列小卡网格」，替换原 5 条长列表（「全程 12–15 分钟」并入入口卡）。只动 bank.html 内联区，SW v344→v345。上一版 v344。  // 10/12 23:0x 模考做题页两批：【批A 底部条重构】顶栏 Part/Passage 切换删 + 40 格答题卡 .ex-sheet/.ex-sq 整体退役 → 底栏 = 篇切换器(#exPgPrev/#exPgNext) + 题号行(#exNums .ex-num，只列当前篇、四态 done/cur/flag、点号跳题) + .ex-actions(Pause/Exit/Finish section)，根治「所有题堆在下面」，写作 Task 1-2 同构；【批D 阅读段落信息匹配改版】题库存为 g.type='map' 的阅读组改真机考形态：文章每段前插虚线槽 .ex-pslot(A–G) + 题号气泡 .ex-lohb，拖入/点选两路放入（复用匹配题 pointer 拖拽状态机），答案口径不变(EX.user[题号]=段落字母)。bank.js → 20261012g（bank/home/practice 3 页）+ bank.html 配套 CSS。上一版 v343。  // 10/12 22:2x 侧栏导航模考优先重排（她拍板）+ 口语换话筒/模考换试卷图标（ICON.speaking/ICON.mock 互换归位）+ 学习组页卡序同口径。common.js → 20261012f（19 页），hubgroup.js → 20261011c（3 组页）。  // 10/12 口语 AI 按目标分四档：coach.js 去个人档案（写死 5.5/实考 5.0/ADHD → 读 targets 分档，多用户正确性）+ P3 辅助/复盘四档（L1≤5/L2 5.5/L3 6/L4≥6.5，锚句库 8→12 条，for example 按档放开——6 分最缺展开一层）+ P1/P2 纠错档位头 + spTargetBand 兜底链 speaking→overall→5.5。coach.js → 20261012a，speaking.js → 20261012b。上一版 v337。  // 10/12 第 10 项：听力「完整模考」（Part 1–4 各随机一篇 = 40 题 / 30 分钟，随机组卷同阅读口径）：听力 pane 加入口卡；考试页 Part 1→4 连续切篇（单栏壳 renderListenPart，与阅读 renderPassage 平行——goTo 与 Part tab 点击两处硬编码 renderPassage 已修为按 channel 分叉）；每个 Part 自己的音频、整场只播一遍不可回退不可重播（audioStartedBy 按篇记录，交卷后解锁复听口径不变）；全程考试模式（模式切换按钮不渲染）；30 分钟总倒计时；成绩卡 PART 1–4 分项 + bandOfListening 换算。bank.js → 20261012d。上一版 v329。  // 10/12 考场复查修三处（她拍板归档前质检）：① ☰ 再点 = 关闭 Option 面板 + 选完 Colour/Size 自动关面板 + 点面板空白关闭（面板是 inset:0 全屏覆盖层，选完不关会挡住后面一切点击——v4 实测踩坑）② 多选 dis 同步 input.disabled（只加 class 的话键盘 Tab 仍能勾，绕过限数）③ 交卷确认弹层开着时 Tab 归弹层（不拦）。common.js → 20261012c，bank.js → 20261012c。上一版 v328。  // 10/12 做题页 UI 统一对齐真机考（样子稿 104 v4 标准，她拍板「统一成这样」）：窄单行顶栏 + ☰ Option 覆盖面板（Colour 三主题整屏反色 / Size 三档，交互在 common.js —— bank/writing 共用壳）；Part 一行横幅；题号黑框方块；判断/单选/多选改竖排 radio/checkbox 整行（选中=圈实心+行浅 teal，颜色本站 teal）；填空框三态（未点=框中数字/点击=空白输入/失焦显示值）；多选限数（Choose TWO 选满其余变灰，题号「19-20」合并框）；逐题旗子 Mark（从底栏迁题干右上）；删底栏 Mark/prev/next，Submit→Finish section，交卷确认文案同步；双击 Tab 跳下一题；右下悬浮导航产品本就没有。bank.js → 20261012b，common.js → 20261012b（全站）。上一版 v327。  // 10/12 考试流程对齐（她拍板「对齐现行真机考」）：高亮棕底白字(#8b3a2e 她定的色值)+重复高亮变玫红+单击已高亮直出 Remove；划词选中即弹（右键保留）；交卷二次确认(含未答数)+到点强制交卷；计时 10/5 分钟双档；答题卡四态(Not seen/No response/Completed/Marked)+Mark 按钮纠偏；听力音量控制(跨页记住)。bank.js → 20261012a。修 selectionchange 异步竞态（右键开条被它晚到收掉，T13 真案）。上一版 v326。  // 10/11 体检修 bug：目录（manifest）还没下载完时切 tab 会显示「这一部分暂时没有篇目 / 共 0 篇」+ 听力 Part 徽标显示 0 —— 是错误陈述（明明有 68/347 篇），用户会以为站是空的。改：数据未到统一显示「目录加载中…」；目录加载失败时听力列表也给失败提示。：听力单篇（列表分栏 90/66/64/127 + 音频条「练习/考试」双模式 + 5 种题型 + 交卷后原文 + 地图配图）＋修 CSP（img-src/media-src 放行 static.9fnnn.com，否则远程 mp3 与配图全被拦）＋修匹配题「同一字母不可重复用」的判分 bug＋地图配图去掉 loading="lazy"（懒加载+无宽高 → 图到位时把题目整块推下去）。bank.js → 20261011p。上一版 v325 同批首发（去 lazy）。
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
  /* SW-INSTALL-SLIM-1（11-04 夜，领头牛终裁 47 条/2504KB 版）：install 只装 47 条，按「掉了最疼」排序——
     core js 9 → common.css → sfx 12 → 25 个 html 放尾（network-first 被 abort 损失最小）。
     配套：6 条一波分波下发 + 单条超时 min(20s,剩余deadline) + 全局 30s deadline；idle 补装 92 条属第二批（A1）。
     红线：html 一条不许摘——fetch 处 isKnownPage 查本数组判「登记过的真页面」，摘了离线 503 退化成冒充首页。 */
const PRECORE = [
  '/js/common.js',
  '/js/common-shell.js',
  '/js/common-pwa.js',
  '/js/data.js',
  '/js/data-static.js',
  '/js/common-merge.js',
  '/js/common-sync.js',
  '/js/common-ai.js',
  '/js/common-cloud.js',
  // —— 9 条 core js（common*/data* 家族 0.61MB）：任何页面开机都要 ——
  '/css/common.css',  // 213KB 全站样式壳
  '/sfx/bubble/8.wav',
  '/sfx/bubble/1.wav',
  '/sfx/bubble/6.wav',
  '/sfx/bubble/4.wav',
  '/sfx/bubble/3.wav',
  '/sfx/bubble/2.wav',
  '/sfx/bubble/5.wav',
  '/sfx/bubble/enter.mp3',
  '/sfx/bubble/7.wav',
  '/sfx/correct.mp3',
  '/sfx/keys/default.mp3',
  '/sfx/error.mp3',
  // —— sfx 12（bubble 9 + default/correct/error）：原 138 条并发时排 76+ 位被淘汰，听写首键无声 ——
  '/speaking.html',
  '/bank.html',
  '/practice.html',
  '/admin.html',
  '/writing.html',
  '/settings.html',
  '/plans.html',
  '/materials.html',
  '/login.html',
  '/timer.html',
  '/corpus.html',
  '/index.html',
  '/vip.html',
  '/beginner.html',
  '/home.html',
  '/legal.html',
  '/review.html',
  '/pay.html',
  '/meds.html',
  '/study.html',
  '/plans-hub.html',
  '/help.html',
  '/me.html',
  '/errorbook.html',
  '/announce.html',
  // —— 25 个 html（1.16MB）放尾；isKnownPage 依赖本数组，一条不许少 ——
];

/* HTML 导航 network-first 的网络超时（弱网 4s 拿不到就回退缓存，绝不让用户干等白屏） */
/* 10/8 晚 4s→10s：她的网络到 pages.dev 经常 >4s，此前每次加载都在 4s 处放弃回落旧缓存，
   = 她永远拿不到新版 HTML 的第二把锁（第一把 = install 挂起，已修）。race 首个成功即返回，
   快网络不受影响；只有慢网络时多等几秒换来「必然拿到新版」。 */
const NAV_TIMEOUT_MS = 10000;

let _swIsUpdate = false;   // 10/8 晚：install 时记录本次是「更新」还是「首次安装」，activate 只在更新时迁移旧页面
// 10-24 W-1（A3 报的真 bug「ready is not defined」，全文见 交接/方案/ready未定义根因与修复-2026-10-24.md）：
// install 里 PRECORE 预缓存的 Promise 存到模块级，activate 先 await 它再删旧缓存。
// 病根：原来 activate 一进门就 caches.delete 掉所有非当前版本缓存，而新缓存可能还没落盘完
//   → 窗口期内页面请求 /js/common-shell.js?v=xxx：缓存里没有、网络又一抖 → 拿到 503 的 JS。
//   浏览器把 503 的 script 当执行成功 → window.ready 从未定义 → 25 个页面脚本集体罁绎。
// 线上实证：vip.html 40 轮 1 次异常（typeof ready=undefined、价格卡 0 张）。
// 不动单条超时钳位（10/8 晚修 install 挂起的，动了回归）；不动 skipWaiting 位置。

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    _swIsUpdate = !!self.registration.active;   // 已有 active SW = 本次是版本更替；无 = 首次安装
    const cache = await caches.open(CACHE);
    // 逐条预缓存且单条失败不炸整体（cache:'reload' 绕过 HTTP 缓存拿部署源最新）：
    // 某一条 404/弱网失败只丢那一条的离线可用，不能让整个 install 失败导致 SW 永远装不上
    // ⚠️ 10/8 晚致命修复：慢网络下单条 fetch 可能无限挂起（不报错不返回）→ await 永远不结束
    //    → skipWaiting 永远不执行 → 新版本永远不接管 → 用户无论怎么刷新都卡旧版（她 10/8 晚实锤，
    //    无痕窗口正常+正常窗口卡旧版=唯一能解释的机制）。每条加 10s 硬超时。
    const fetchPrecache = async (u, timeoutMs) => {
      try{
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
        const res = await fetch(u, { cache: 'reload', signal: ctl.signal });
        clearTimeout(timer);
        if(res && res.ok){ await cache.put(u, res); }
      }catch(_){ /* 单条失败/超时静默：只丢该条的离线可用 */ }
    };
    // SW-INSTALL-SLIM-1（11-04 夜定稿，领头牛裁定=三方案合并）：6 条一波分波下发——原 138 条 Promise.all
    // 并发时每条的 10s 定时器同时起跑，排队时间全算进自己的超时窗口，sfx 排 76+ 位 fetch 还没开始 timer
    // 已数完（实测装成 0~2/17 随机态、听写首键无声）。分波后排队病自愈，单条超时恢复 20s 弱网保护：
    // （原写「30KB/s 下波2 10s 会整波 abort」——30KB/s 源自流体模型推算，已被 B1 实测长尾 2.58/2.64
    //  否掉：均分模型预测 2.89、流体模型预测 1.00，现实贴近均分端。真实门槛 65~73KB/s，
    //  台账口径=「40KB/s 以下不承诺保命底线，只承诺 core 6 条」。20s 钳位仍是对的方向，只是别拿 30KB/s 当承诺。）
    // 且每波单条用 min(20s, 剩余 deadline) 钳住（B1 合并方案）——只查波首会把最坏耗时拖到 40s，钳住后=30s 整。
    // allSettled 在这里是纯防御层，不是承重件（11-04 B2 审计 + A1 复核）：
    //   真正让「单条 abort 不炸整波」的是 fetchPrecache 自带的 try/catch（sw.js:582-593）——
    //   它是 async 函数、catch 吞掉全部异常、永不 reject，所以 map 出来的 6 个 promise 100% fulfilled，
    //   Promise.all 与 allSettled 在上面的输入下行为完全一致、零可观测差异。
    //   保留 allSettled 的收益只有一个：以后有人往 map 里塞可能 reject 的东西，也不会炸整波。
    //   不要把 allSettled 写成「承重件」——将来要么误以为改回 all 会坏，要么在别处依赖错对象。
    // deadline break 后代码直接掉出循环走 skipWaiting，_precoreReady 循环外赋值一次、break 后必 resolve
    // ——activate（下方 await _precoreReady）绝不挂死，10/8「怎么刷都卡旧版」底线不变。
    // 47 条装完耗时：B1 线上实测 10.0s（v763）/ 9.1s（v4 定稿），本机乐观值，她的网络未知；
    //   ~17s 是 151KB/s 的推算值，别当实测引用。
    // 验收：装成条数必须=47 整（防最后一波 await 漏写提前 resolve）。
    const _slimT0 = Date.now();
    _precoreReady = (async () => {
      for(let i = 0; i < PRECORE.length; i += 6){
        const remain = 30000 - (Date.now() - _slimT0);   // 30s 全局 deadline
        if(remain <= 0) break;                            // 弱网弃装尾部（html 掉了不心疼，卡旧版才是大忌）
        const per = Math.min(20000, remain);              // 单条 20s 上限，但不超过剩余 deadline
        await Promise.allSettled(PRECORE.slice(i, i + 6).map(u => fetchPrecache(u, per)));
      }
    })();
    await _precoreReady;
    await self.skipWaiting();
  })());
});

/* 10/15 修「模考突然刷新跳出」：记录哪些页面正在考试中（由页面主动上报）。
   SW 更新时跳过这些页面，避免把正在答题的人刷出去。 */
const _examClients = new Set();
self.addEventListener('message', function(ev){
  const d = ev && ev.data;
  if(!d || !d.type) return;
  if(d.type === 'EXAM_STATE' && ev.source && ev.source.id){
    if(d.inExam) _examClients.add(ev.source.id);
    else _examClients.delete(ev.source.id);
  }
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // 10-24 W-1：先等新 PRECORE 真的落盘，再删旧缓存。
    //    否则「先删后取」的窗口期里，页面拿不到 JS/CSS（缓存空的、网络抖）→ 503 script → ready 未定义。
    //    _precoreReady 在 install 里就建好，正常情况下到这里早已 resolve，几乎零延迟；
    //    只有「install 还没跑完就 activate」的病态场景才会真的等 —— 那正是要治的。
    try{ await _precoreReady; }catch(_){}
    // 删除所有非当前版本缓存（含历史 v1~v13）
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 通知已打开页面「SW 已更新」。
    // 🔴 10-23 HOTFIX 部署风暴：撤掉 activate 的 Client.navigate 强制刷新，只发提示条。
    // 原设计（10/8 晚）：仅版本更替时把已打开页面 c.navigate(c.url) 直接刷到新版，用户零操作。
    // 问题 = 施工进入多窗口流水线后一天 bump 31 次 SW（平均 23 分钟一次）：她每次切回标签页
    // 都可能被「无声刷新」一次 —— 页面突然重载 = 她报的「UI 一会有问题一会又恢复 / 点进子页弹回别的页」
    // （c.navigate 落在页面当前 URL 上，若那一刻她正在旧页链接上，就被刷回旧页）。
    // 现在：activate 只 postMessage；前端 common-pwa.js 的「发现新版本」条每会话最多弹 1 次、
    // 真正的版本收口交给 common-shell.js 的部署探针（10 分钟一轮、软导航中不打断、页面稳定才刷）。
    // （10/15 考试中不发强刷的守卫随之失效为纯提示，保留 _examClients 记录不动。）
    try{
      const cs = await self.clients.matchAll({ type: 'window' });
      cs.forEach(c => {
        try{
          try{ c.postMessage({ type: 'SW_UPDATED', version: CACHE, deferred: _examClients.has(c.id) }); }catch(_){}
        }catch(_){}
      });
    }catch(_){}
    // SLIM-2：activate 全部收尾（含旧 cache 清理与 claim）之后才排 idle 补装。
    // 放这里是刻意的：补装若跑在 activate 前面，就等于把瘦身又拖回原样。
    _idleKick();
  })());
});

/* ---- 分级③：idle 补装 92 条 / 4039KB（SLIM-2，11-04 夜）-----------------------------
   ⚠️ 红线：本段的 Promise 是独立的，**绝不并入 _precoreReady**。
   _precoreReady 一旦被拖到补装完成，activate 的 await（上面那行）就会挂到补装结束，
   瘦身当场白做 —— 这是第一批定的硬红线，谁改谁负责。
   ⚠️ 为什么补装：install 只装 47 条（2504KB）。原 138 条里剩下 91 条（3611KB）+ v769 新增的查词索引 1 条（428KB）
   = 本批 92 条 / 4039KB（PRECORE 47 + IDLE 92 = 139 条，比原 138 条多的那 1 条就是 _index.json）
   在线时 89 条裸路径命中率为零（页面请求带 ?v= 走精确键），只在断网时兜底。
   放 idle 装的收益不是「打开更快」，是「部署重装窗口不被这 3.5MB 拖长」。
   纪律：导航 fetch 进行中时暂停（不跟页面抢带宽）、3g/slow-2g 不补、
   单条失败同会话内退避最多 3 次。
*/
const IDLE_PRECACHE = [
  '/data/official-banks/_index.json',   // SS-DICT-LOCAL-1：查词本地索引（6462 词 / 418KB）
  '/css/p/bank.css', '/css/p/beginner.css', '/css/p/corpus.css', '/css/p/home.css',
  '/css/p/login.css', '/css/p/materials.css', '/css/p/meds.css', '/css/p/pay.css',
  '/css/p/hub-shell.css', '/css/p/plans.css', '/css/p/practice.css', '/css/p/review.css', '/css/p/settings.css',
  '/css/p/speaking.css', '/css/p/timer.css', '/css/p/vip.css', '/css/p/writing.css',
  '/data/announce.json', '/data/materialsets.json', '/data/official-banks/awl.json', '/data/official-banks/lstans.json',
  '/data/official-banks/qstem.json', '/data/scenes.json', '/data/sentences.json', '/data/writing_prompts.json',
  '/favicon.ico', '/favicon.svg', '/icons/apple-touch-icon.png', '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/js/announce.js', '/js/av-picker.js', '/js/bank-groups.js', '/js/bank.js',
  '/js/coach.js', '/js/corpus.js', '/js/dhp_policy.js', '/js/exam-timer.js',
  '/js/factory-writing.js', '/js/feedback.js', '/js/history.js', '/js/home-quick.js',
  '/js/hub-side-shell.js', '/js/hubgroup.js', '/js/index.js', '/js/materials.js', '/js/meds.js',
  '/js/mock-history.js', '/js/mock-report.js', '/js/mock-summary.js', '/js/mock.js',
  '/js/pay.js', '/js/plans.js', '/js/practice.js', '/js/pricing.js',
  '/js/progress.js', '/js/rec-all.js', '/js/review.js', '/js/rv-record.js',
  '/js/rvx-data.js', '/js/scene-drill.js', '/js/scores.js', '/js/sentence-drill.js',
  '/js/settings.js', '/js/sp-core.js', '/js/sp-detail.js', '/js/sp-diag.js',
  '/js/sp-late.js', '/js/sp-list.js', '/js/sp-p3.js', '/js/sp-q.js',
  '/js/sp-stats.js', '/js/sp-story.js', '/js/sp-timer.js', '/js/speaking-practice.js',
  '/js/speaking.js', '/js/sprint.js', '/js/timer.js', '/js/vip.js',
  '/js/wb-tabs.js', '/js/wd-dict.js', '/js/wordbank.js', '/js/words.js', '/js/writing.js',
  '/js/writing_prompts.js', '/manifest.json', '/sfx/mechanical/1.wav', '/sfx/mechanical/2.wav',
  '/sfx/mechanical/3.wav', '/sfx/mechanical/4.wav', '/sfx/mechanical/5.wav',
];

let _idleStarted = false;          // 同会话只启一次
const _idleFail = Object.create(null);   // path -> 已失败次数（退避用，最多 3）
let _navInFlight = 0;              // 进行中的页面导航数，>0 时补装让路

function _idleNetOk(){
  try{
    const c = self.navigator && self.navigator.connection;
    if(!c) return true;            // 老浏览器无 connection API：按可补装处理
    const t = c.effectiveType || '';
    if(t === 'slow-2g' || t === '2g' || t === '3g') return false;
    if(c.saveData) return false;   // 她开了省流量：不补
    return true;
  }catch(_){ return true; }
}

/* 单条补装：失败记一次，同一会话最多试 3 次 */
async function _idleOne(u){
  const tried = _idleFail[u] | 0;
  if(tried >= 3) return;
  try{
    const hit = await caches.match(u);
    if(hit) return;                            // 已有副本（install 装的或导航顺手写的）
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let res = null;
    try{
      res = await fetch(u, { cache: 'reload', signal: ctl.signal });
    }finally{
      clearTimeout(timer);   // 11-04 B2 指出：原来只在成功路径 clear，fetch 抛异常时 timer 白跑 20 秒，
                             // 会把 SW 存活期拖长（SW 空闲 30 秒就会被浏览器回收，这 20 秒很贵）
    }
    if(res && res.ok){
      const cache = await caches.open(CACHE);
      await cache.put(u, res);
    }
  }catch(_){
    _idleFail[u] = (_idleFail[u] | 0) + 1;
  }
}

/* 补装主循环：一条一条来（不并发，绝不跟页面抢带宽），每步前查让路条件 */
async function _idleRun(){
  for(const u of IDLE_PRECACHE){
    if(_navInFlight > 0){                      // 页面正在拉东西：等它，最多等 5 秒再试
      let waited = 0;
      while(_navInFlight > 0 && waited < 5000){
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }
    }
    if(!_idleNetOk()) return;                  // 网络变差：本次不补了
    if((_idleFail[u] | 0) >= 3) continue;
    await _idleOne(u);
    await new Promise(r => setTimeout(r, 60));  // 条间小间隔，留出主线程
  }
}

/* 启动：activate 完成后（clients.claim 之后）才排 idle，绝不早于 install/activate */
function _idleKick(){
  if(_idleStarted) return;
  _idleStarted = true;
  const go = () => { try{ _idleRun(); }catch(_){} };
  if(self.requestIdleCallback) self.requestIdleCallback(go, { timeout: 8000 });
  else setTimeout(go, 8000);
}
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
  /* 🔴 10-23 T-015：错句本独立页已删（她拍板「整个板块前后端删干净」）→
     老链接 / 书签 / 已分享的 wrongbook.html 不能白屏 404：软导航到写作页
     （她明说保留的「我的错句」折叠区就在写作页底部 #wbArea）。
     任务书要求「老链接有兜底（跳转或 404 页不白屏）」—— 这里选跳转，比 404 页友好。 */
  if(url.pathname === '/wrongbook.html' || url.pathname === '/wrongbook'){
    const wbShell = await caches.match('/writing.html');
    if(wbShell) return wbShell;
    return Response.redirect(url.origin + '/writing.html', 302);
  }
  if(url.pathname === '/admin' || url.pathname === '/admin.html'){
    const finalAdmin = await netPromise;
    return finalAdmin || new Response('站长面板暂时离线（网络未连通）。连上网络后重试；完整网址 + Ctrl+F5 可强制刷新。',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  /* 🔴 10-23 HOTFIX-2：这里原来是 `await caches.match('/home.html')` 无条件兜底 ——
     即**任何页面**在「网络失败/超时 + 该页不在缓存」时都会拿到**首页文档**当自己的内容。
     客户端 softNavigate 拿到后 DOMParser 解析，把首页的 <main> 塞进当前页 ——
     结果是「地址与标题是模考、内容却是别的页」，且完全无声（她报「点模考出现别的页面」的第二条根因）。
     现在按目标身份分开处理：
       ① 目标是**登记过的真页面**（PRECORE 里的 .html）→ 只认它自己的缓存副本；
          拿不到返回 503 + 人话文案，让客户端走「整页跳转」兜底 —— 绝不拿别的页冒充，
          因为静默错页比报错难查一百倍（这次就是这么被藏住的）。
       ② 目标是未知路径（手输 / 老书签 / 拼错）→ 保留退回首页，那是「友好的 404」，
          不是把首页冒充成她点的页面。
     判据直接复用 PRECORE 名单，不另造一份清单（漏维护就会重新长出这个 bug）。 */
  const asPagePath = url.pathname.replace(/\/$/, '/index.html');
  const isKnownPage = PRECORE.some(f => f === url.pathname || f === asPagePath);
  if(isKnownPage){
    const selfRetry = await netPromise;            // 再给后台那次网络请求一次收口机会
    if(selfRetry && selfRetry.status === 200) return selfRetry;
    return new Response('这一页暂时没能加载出来（网络没连上，本地也还没有它的副本）。检查网络后重试即可。',
      { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const shell = await caches.match('/home.html');   // 9/30：未知路径的友好兜底，进学习主页
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
    // 10-24 W-1 ②：.js/css 硬走一次网络，让浏览器报明确网络错误（不给 503 script）
    if(/\.(js|css)$/.test(url.pathname)){
      const hard = await fetch(req).catch(() => null);
      return hard || bare || Response.error();   // Response.error() = 网络故障，浏览器会当脚本加载失败处理
    }
    return bare || new Response('离线', { status: 503, statusText: 'Offline' });
  }
  const cached = await caches.match(url.pathname);
  /* T18（v768）：Audio/Video 元素的 media 请求命中缓存时直接返回，**不再后台重拉**。
     为什么单挑 audio：
       · `destination === 'audio'` 只可能来自 Audio/Video 元素，页面自己的 fetch 恒为 ''，
         所以带 Range 的 fetch 也不会被误判（B2 实测确认）。
       · 这批流量是实打实的浪费：只播 Audio、完全不碰 warmCache 的对照组 = 11 笔 / 505246B，
         与「进一次听写」的总流量一模一样（她一天开十次听写就是 5MB）。
       · 音效是「播一次就完」的即时文件，不 revalidate 没有陈旧风险；
         真要换音效，warmCache 的显式 fetch+put（destination=''）仍走原路径，能补写。
     禁区：非 audio 的资源（js/css/json/png/ico/mp3/webmanifest）SWR 行为一字不动。
     安全性已实测：Audio 要 Range 却收到 200 全量时可以正常播放
     （playing=true、duration=0.348866、readyState=4、error=null、currentTime 走完）。 */
  if(cached && req.destination === 'audio') return cached;
  const netPromise = fetch(req).then(res => {
    if(cacheable(res)) putInCache(url, res);
    return res;
  }).catch(() => null);
  if(cached){
    netPromise.catch(() => {});   // 后台 revalidate，失败静默
    return cached;
  }
  // 10-24 W-1 ②：同上 —— js/css 不给 503，让浏览器自己报网络错误
  const net = await netPromise;
  if(net) return net;
  if(/\.(js|css)$/.test(url.pathname)) return Response.error();
  return new Response('离线', { status: 503, statusText: 'Offline' });
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
    _navInFlight++;                     // SLIM-2：页面导航进行中，idle 补装让路
    e.respondWith(handleNavigate(req, url).finally(() => { _navInFlight--; }));
    return;
  }
  // ①-b 题库数据（答案 / 原文 / 时间轴 / 目录）：network-first，别再让 SWR 把旧答案灌给她
  //    她 11-05「答案改了没生效 / 说过好几遍」：这些文件不带 ?v=，原走 ② 的 SWR ——
  //    handleStatic 命中旧缓存就直接返回（后台才 revalidate），改了键她浏览器当天都拿不到。
  //    现在优先走网络、拿到就顺手更新缓存；断网才回落缓存副本（离线做题不受影响）。
  if(url.pathname.startsWith('/bank/') && /\.json$/.test(url.pathname)){
    e.respondWith(
      fetch(req).then(res => { if(cacheable(res)) putInCache(url, res); return res; })
        .catch(() => caches.match(url.pathname).then(c => c || new Response('离线', { status: 503, statusText: 'Offline' })))
    );
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