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
const CACHE = 'ielts-hub-v184';  // 10/3 P0 修「计划页诊断卡按钮交互不了」：.dg-text-btn 基类 width:100% 进 #diagRoot .dg-planline 的 flex 行后抢满整行宽度（实测 641/667px）→ 文字被挤到第一行、按钮 wrap 到第二行居中，25px 高灰字下划线完全不像可点。修：#diagRoot .dg-planline .dg-text-btn 改 flex:none + width:auto + min-height 44px + 白底 teal 描边胶囊，文字包 .dg-planline-txt(flex:1) 才正确分配；≤420px 回落整行。js/plans.js 1103 行文字包 span，plans.js buster f→20261003a。SW bump v183→v184（plans.js 在 PRECORE）。上一版 v183：设计系统组件层统一第3轮（landing index.html 组件对齐）  // 10/3 设计系统 2026-10-03 组件层统一 第3轮（收尾 landing index.html）：landing 全内联不走 common.css，自己定义 .btn h:40→44px/fw:500→600/fs:14→14.5px/radius:10→12px+gap:7px+text-decoration:none；.btn-lg h:50→52px/pad:26→28px/radius:12→14px/fs:15.5→16px+gap:8px；.pill radius:8→999px 药丸+display:inline-flex+gap:6px+padding 对齐。布局文案深绿块绝对不动。SW bump v182→v183。上一版 v182：10/3 第2轮（plans diagOverlay input 44px + speaking 7 处 token 化 + 14 页 buster）  // 10/3 设计系统 2026-10-03 组件层统一 第2轮：plans.html #diagOverlay input 内联 padding:9px 撑 36px → height 44px + padding:0 14px + 3.5px 聚焦环；speaking.html 内联 style block 7 处语义色替换为 common.css token（sent-err/danger、sent-misread warn-ink/warn-soft、mat-outline-err err-text、mat-persona gradient primary-600、mat-cov-badge.loose warn-ink/warn-soft、me-live-dot danger、mock-timer.low danger）；14 正式页 common.css buster 统一 20261003e→20261003f。残留：freq 橙(#ea580c/#f59e0b)、adapt 蓝(#dbeafe/#1d4ed8)、meta theme-color、#fff 白、var() fallback、bootLoader fallback 全部保留（无 token 等价或安全 fallback）。PRECORE 已收录 common.css，SW activate 自动刷新。上一版 v181：10/3 组件层统一 第1轮（btn 44px 固定 + 四变体 + pill/dcard 标准类）  // 10/3 设计系统 2026-10-03 组件层统一：common.css .btn 固定 height 44px + gap 7px + fontSize 14.5px + tight 3.5px 聚焦环 + 四变体(primary 600/700 三级铁律/secondary/success/ghost hover/三级铁律/danger) + btn-sm 34px/btn-lg 52px/btn-block/disabled 规范化；input/select 统一 height 44px + 3.5px 聚焦环 + hover 过渡；新增 pill(ok/err/warn/info)/dcard(field) 标准组件类。PRCORE 已收录 common.css，SW activate 自动刷新。上一版 v180：10/3 P0 紧急修 onbOverlay stuck bug（遮罩 click-outside + Escape + 30s 自动关闭）  // 10/3 P0 紧急修 onbOverlay stuck bug：js/common.js onbRenderSetup 加 click-outside-to-dismiss（点遮罩空白处=onbFinish false）+ Escape 键关闭 + 30s 超时兜底三条；css/common.css .onb-overlay 加 cursor:pointer 暗示可点关（> * 恢复 default 遮罩内不动）。PRECORE 已收录 common.js + common.css，SW activate 自动刷新。上一版 v179：10/3 Landing 卖点重构（design/94，仅 index.html 一个文件；index.html 在 PRECORE 故 bump）：Hero 大标题「口语不用背稿，写作不用练」+新 lead+三承诺条（AI 模考不限次/学习功能全免费/作者本人在用）；对比区左右各 +2 行（模考按次收费没人批 vs AI 不限次+逐句点评）圆点 5→7；口语区文案升级（不是背稿是聊人生、几个故事覆盖全题库）；新增写作模板默写区（id=writing，静态三步示意卡）+AI 能力区（id=ai，三卡+¥19 价格条链 vip）；「三步」区升级为「备考诊断」三步（id=start 与导航锚点保留，功能 v169-v171 已上线满足同步红线）；背单词专区整段删除（含记忆曲线 SVG 与底部 vocabPaths 绘图 JS——不删会 getElementById null 连带中断口语辐射图绘制），降为「更多模块」一卡（词/错/计/划/据/同/写作模板库共 7 卡）；结尾信任小字升正文段；导航 5 锚点（speak/writing/ai/vs/start，#vocab 零残留）；meta description 与 og:description 同步（title 不动，SEO 守卫只验存在性 66/66 不受影响）。上一版 v178：10/3 第3批「陪练重构成完全自由对话 + 跨会话长期记忆」（她拍板否决 Workbarly 文档的 P1/P2+正则识别指令+分模式 JSON 契约方案，要像聪明 AI 而非焊死的答题机）：①js/coach.js 整体重写（旧 v1 整文件替换，window.__COACH_ON 旗/懒渲染 #coachView/__coachShow/visualViewport 键盘上浮/scrollBottom 滚 main.container/失败撤气泡回填口径全部保留）：删 P1/P2 分段、删 json_mode 强制单 JSON 契约（must_fix/natural_version/praise/cn_hint/done）、删一次一题/不跳题铁律、删 phase review 与 #coachNext；对话全程自由文本 callRelay('speaking_coach',..,0.8,{max_tokens:1400}) 无 json_mode，history 存真实对话直接透传不再 userPayload 包【学员作答】（根治"先过其他题"被当答案批改）；真题库降级为 3 个快捷 chips（抽 P1/抽 P2/只练高频），drawP1/drawP2 保留 v1 频次 ultra→low 排序与 WORK_BLOCK 就业硬黑名单 3 题，抽题以 assistant【系统安排的当前话题】注入上下文且 system 铁律严禁 AI 改题、抽题不耗 AI 调用；纠错=她英文有错默认纠（system 约定【必改】/【更地道】两块，前端渲染红卡/地道卡，语音输入不纠标点大小写），口头「别纠语法」会话内 correctOn=false（正则即时态+AI 应声），「继续纠」恢复；system prompt 保留她的全部学员档案（计算机/杭州/ADHD 专注达/口语5.0/冠词三单动名词过去分词介词弱点/5.5 档词汇/不主动抛就业题/P2 连贯性优先）；②长期记忆 DATA.coachMem（data.js 默认 [{t,text}] 已加）——每轮 AI 正文后 @@MEM@@ 追加中文事实行，前端 stripReply 剥离（用户不可见）、去重/限长 4-80 字、按 text 去重 push、上限 40 条、hubSave；common.js mergeData 登记 coachMem 跨设备并集（按 text 去重同文留新 t、时间升序、上限 40；e02adc0 铁律不登记云端整份丢）；顶栏「长期记忆」弹层可查看/全部忘记（confirm+清空+toast）；会话线程仅内存刷新即新对话，跨天留下的只有记忆。③speaking.html：#coachView 作用域新增 ca 气泡/cc chips/cq 题卡/cmp 记忆弹层样式约 30 行（旧 .coach-seg/#coachNext 旧规则残留无害不删，去 coach.js 引用即可完整回滚旧句型引擎），chips 手机端 min-height 44px。buster：coach.js b→20261003a（speaking.html）、data.js b→20261003a、common.js h→20261003a（14 正式页全量）。上一版 v177：10/3 第2批「移动端宽度统一 + 桌面陪练对齐」：①css/common.css 锁壳块 main.container 加 width:100%——body.has-dock flex column 下 .container 的 margin:0 auto 吃掉横向剩余空间导致容器宽被内容反推（实测 14 页 390/352/327/283 四种、plans 283 最窄、异步渲染后抖动、切 tab 顶部平移），修复后 14 页统一 390；560 断点 .container 左右 padding 10→12（她拍板），与 860 断点一致；②speaking.html 桌面陪练：#coachView 显示时 tab 组居中对齐 760 聊天列（:has 作用域，题库/素材态零影响），#coachBar 按侧栏内容区 288/32 定位（原贴视口居中偏左 128px 与聊天列错位，side-collapsed 回 0），#coachScroll 左右 2px 杂边归零与输入条齐。css buster m→n（14 页），speaking.html inline CSS network-first。上一版 v176：10/3 第1批「全站 AI 超时保护」（她手机端实测计划页 AI 按钮弱网卡死、永久「安排中…」只能刷新）：js/common.js callRelay 最上游包 withTimeout（25s，覆盖全站 16+ 个 callRelay 调用点，以后新增 AI 功能自动免疫），超时抛 code='AI_TIMEOUT'，各调用点既有 catch/finally 正常解锁按钮+toast；迟到 rejection 用 timedOut 守卫静默防 unhandledrejection，finally 必清定时器防堆积；零新增交互、超时代码块不写 DATA。探针 tests/_probe_timeout_1003.cjs 20/20 PASS。common.js buster 20261002g→h（14 正式页）。上一版 v175：10/3 全站真实用户走查修复 2 处：①corpus 语料表补单条删除 UI（deleteCorpus 函数早就在但无调用入口，导错句子无法清理；行尾加删除钮+confirm 二次确认+墓碑防同步拉回），corpus.js buster 20261002a→20261003a（corpus.html）；②speaking.html 模考考官头像 <img id="mockExaminerImg" src=""> 空 src 会被浏览器解析成页面自身多发一次请求并显破图框，默认 src 改 img/examiner-a.svg（开考后 renderExaminer 仍随机换人），HTML network-first 无需 buster。上一版 v174：10/3 剥掉「ADHD 友好」标签（她指出：网站面向大众考生，不是专门给 ADHD 做的，那句标注会误导定位）——纯文案/注释零逻辑。来源澄清：此前记忆里的「ADHD 友好设计规范」实为三件互不相干的事被记成一条——①css/common.css 的 .btn{min-height:44px} 是移动端触控行业标准（Apple HIG/WCAG 2.5.5，2026-08-15 提交 712eba1 修移动端导航点不动时一起加的，与 ADHD 无关，本批保留不动）②coach.js 人设卡「ADHD 服用专注达」是她的串题 persona 素材（保留）③设置页服药模块开关是功能不是规范（保留，仅文案中性化）。本批实际改动 4 处：css/common.css 2944 行「命中区 ≥44px（ADHD 友好铁律）」→「移动端触控标准」、352 行补「（移动端通用触控标准）」；common.js 49 行「ADHD 专属模块」→「可选模块」、46 行注释同步设置项新文案；meds.js 2 行注释同步；settings.html 150 行「启用「服药」模块（ADHD 专注达药效窗口记录）」→「（记录用药后的药效窗口）」（唯一露给用户的一处）。版本 css l→m（14 页）、common.js f→g（14 页）、meds.js 20260921f→g。上一版 v173：10/3 coach 跟进修复：scrollBottom 原写 #coachScroll.scrollTop 是 no-op（#coachScroll 不是滚动容器——≤860 App Shell 锁 html/body 后滚的是 main.container，桌面才是 window），手机端收到纠错反馈/出新题后视图不跟随，她得手动下滑；改为有 main 滚 main（scrollHeight>clientHeight 守卫）+ window.scrollTo 兜底，底部既有净空（main dock+10、#coachScroll 72px）保证最后一条露在固定底栏上方。coach.js buster 20261002a→b（speaking.html 引用同步），speaking.js 本批零改动仍 d。上一版 v172：10/2 AI 口语陪练 coach 上线（口语陪练coach_施工方案_2026-10-02，她当晚拍板接管口语页「陪练」tab，原句型闯关引擎文件全保留、去 coach.js 引用即回滚）——①新文件 js/coach.js（buster 20261002a，PRECORE 收录）：顶层 window.__COACH_ON 旗（在 speaking.js 前加载），懒渲染 #coachView（P1 句型跟练/P2 连讲双模式）；抽题永远前端（SPEAKING_BANK 按频次 ultra→low 稳定排序，同频保持题库序，P1 一卡 5-8 题不重复、P2 一卡一讲；Work 卡 3 句就业题 What work do you do/Why that job/change another job 前端硬黑名单，学生身份兜底铁律 4）；callRelay('speaking_coach',...) 走通用额度不命中任何特殊闸（functions/api/ai.js 零改动），json_mode 契约 must_fix/natural_version/praise/cn_hint/done，aiJson 解析失败降级原文进对话流；system prompt 全文固化 5 小时实练教学规则（练习阶段不漏英文、一次一题、不跳题、不纠标点只纠语法、必改+完整地道版两层、I like→I'm really into 升级锁 5.5 档、P2 FC 优先抓碎片并列）；历史只传最近 12 轮防 token 爆；失败（AUTH_REQUIRED/user_limit/网络）toast 不推进、答案回填原样重发；视觉全走全站 teal token（#3E9BE8 弃用，必改 --danger、地道框 --primary-50 左边框、表扬 --warn），底栏 fixed+visualViewport 防键盘遮挡；会话仅内存 P0 不写 DATA。②speaking.html：coach.js script 置 speaking.js 前、#coachView 容器、约 45 行 #coachView 作用域样式、tab 文案「练习」→「陪练」（data-type=PRACTICE 不变）、speaking.js buster c→d。③js/speaking.js 三个 PRACTICE 入口全部加 __COACH_ON 最优先分支：tab 点击主分支（统一隐藏链加 #coachView）、?senttab=1 落地分支、spGoPracticeCat 题库详情「去练该类」（原方案漏的第三个入口）；旧 __SENT_V2_ON/pdView 回退链原样。上一版 v171：10/2 第三十三批 commit4「每日重排 + 任务直达」——①js/plans.js：gen 任务行（item.module）整行可点 planGenJump（PLAN_WL module→file；speaking.practice 的 params.qno 经 bankAt 换题 id 走 ?open= 直达，其余模块落地页 ?autostart=1；params 随数据保留待目标页支持），手动项照旧不可点零回归；REBALANCE_AI_SYSTEM 新 callRelay key 'rebalance'（永久免费）：只出今天单日 JSON，顺延铁律（carried「昨天未完成」优先、排不进的本地顺延明天不算丢）、onlyMin 压缩三级砍（先 materials.persona/story、corpus.parse 新知识→再 practice 精练/模考、P2、writing fill/essay、wrongbook 重复练习→最后 words.review/口语 P1/writing.template 保底，禁按比例），复用 planApplyAi 单日护栏；planRebalancePersist 只动今天——done 项与无 module 手动项保留、未完成 gen 旧 id 全登墓碑、AI 未覆盖的旧任务顺延明天（新 id/carried/fromId，明天已有同文本未完成项幂等不重）、d.plan.ts 刷新+元信息 tasks 重数+自打 _fieldTs；diagRebalance 无会员闸（onlyMin 夹 10…当日容量；AUTH_REQUIRED/user_limit/坏 JSON 一律 toast 不落库）；#rbBar 工具条（重新安排今天/今天只能学 X 分钟压缩重排，rbBusy 防重复）与 #rbStale（touchPlanOpen 返回 ≥3 天显示过期提示，重排后消失）；②common.js：ensureTodayPlanCarried 顺延透传 module/action/params/gen（手动项无键零变化）、touchPlanOpen（settings.planLastOpen 跨天首写+自打 _fieldTs.planLastOpen，首页与计划页各调一次幂等）、hubSoftGo（程序式软导航，PAGES 外或异常 location.href 兜底）；③data.js 默认 settings.planLastOpen='' + SYNC_SETTINGS_FIELDS 登记；index.js 首页行 gen 优先 planGenJump→planJumpInfo 文本兜底、点击改走 hubSoftGo、首页打卡；④functions/api/ai.js rebalance 周兜底闸豁免（&& service !== 'rebalance'）+ 周计数 IIFE 同豁免，studyplan 会员闸与 diag 豁免不变，日/IP/分钟风控不松。buster：data.js a→b、common.js e→f（13 正式页全量）、plans.js e→f、index.js 20261001e→20261002a（home.html）；plans.html 加 #rbBar/#rbStale/跳转样式 13 行（id 作用域）。上一版 v170：10/2 第三十三批 commit3「完整备考计划」会员功能——①js/plans.js 新增 studyplan 生成流：PLAN_WL 站内白名单 7 模块（practice 听读精练/模考、speaking 题库、materials 人设/串题、writing 模板/套填/成篇、words 背词固定 30 分钟、corpus 长难句、wrongbook 错题），item 新字段 module/action/params/gen='diag' 随 _mergePlans 整项透传（合并零改动）；planSpanDates 按本地容量（工作日 wdMin/周末 weMin，14 天上限，距考更近按实际天数），PLAN_AI_SYSTEM 三段硬约束（白名单+每条必带阿拉伯数字分钟与完成标准+倒排四档 ≥21/8-20/3-7/≤2 只留保底三件套），planApplyAi 纯护栏（日期限清单、module/action 白名单、params 只收白名单键、同日同 text 去重、超 cap×1.15 从尾部砍首条保留防空天、≤2 天只留 words/speaking P1/writing template、最终 0 天整份不采），planPersist 多日落 DATA.plans（覆盖日期内同标记未完成项登 DATA.deletedIds 墓碑后替换；已完成 gen 项与手动项保留），元信息 d.plan 落 settings.diagnosis 子对象自打 _fieldTs；diagVipCheck 与 writing.js queryVipGate 完全同口径（sessionStorage hub_vip_flag_v1 + vip_status，未登录/查询失败按非会员）；报告屏 #dgPlan 六态 idle/checking/loading/success/locked/error，概览卡加计划状态行+「去今日任务」（closeDiagOverlay+setPlanTab('today')+render）；AI 失败/vip_required/未登录一律不落库。②functions/api/ai.js 非 vip 调 studyplan → 403 vip_required（diag 仍豁免每周兜底；rebalance 每日重排留待 commit4 免费）。③plans.html #dgPlan/#diagRoot 样式 12 行（金色会员徽，id 作用域压 common.css 表单重置），plans.js buster d→e。上一版 v169：10/2 第三十三批 commit1「备考诊断」规划 Tab 改造（她已拍板，面向未来新考生；诊断免费、生成完整计划留待 commit3 会员闸）——①规划 Tab 旧周计划 UI 移除（weekTasks/aiWeek/genWeek/weekBox；aiWeekPlan/buildAndRender 等函数一字不删，ready 绑定加元素存在守卫防软导航缓存页崩），改为 #diagRoot 诊断入口卡/已诊断概览 + body 末尾 #diagOverlay 全屏问卷与报告（plans.html 内覆盖层，不新开页）；②js/plans.js 新增诊断模块（常量全部声明在 ready 前避 TDZ）：现状分逐科独立降级提取 diagExtractBands——听读 mockRecords whole 优先（partIsScore 按 partWeight 加权，correct/total 汇总走 estimateBand，单篇次之）、写作同口径取 type=writing、口语取 isSpeakingMockRec 整卷 overall → DATA.scores 最新考试成绩 → writingScores（parsed 且 result.overall）→ 口语练习四维均分（scores.js 在场就复用 aggregateSpeakingPracticeScores，否则内置同口径轻量聚合）；高考/四六级→Band 锚点表 DIAG_REF_TABLE 线性插值（超顶档向满分外推最多 +0.5，低于 floorScore 不给估计；写口锚点按「体系不同从低」保守补）；身份 4 选 1（上班族/在校生/全职备考/其他）→6 时段（工作日早/上/下/晚+周末白天/晚）默认模板；容量=工作日每天时长（默认读 dailyGoalHours，0 才给 1.5）×5 + 周末每天时长（勾段×2h 初值，手改后不覆盖）×2；本地诚实报告 diagBuildReport 纯函数：逐科缺口、保守需时（听读 18 天/写口 35 天每 0.5，瓶颈取最大科）、可行性 yes/tight/no/reached/unknown——≤2 天只说保底三件套（背单词 30 分钟+口语 P1 快答+写作模板默写）、≤7 天差≥1 分直说不可能+数百小时、4.5→7.0 且不足 180 天直说 6 个月+并给现实可达分、四级 <500 提示「及格不等于够用（425≈4.5–5.0）」；问卷数字输入全自由可留空，来源标 mock/考试成绩/批改/练习/换算/手填，支持「跳过直接用默认」（什么都没填也能出 unknown 报告）；③数据：DATA.settings.diagnosis 整体子对象（data.js 默认 null）+ SYNC_SETTINGS_FIELDS 登记 'diagnosis'（e02adc0 教训：漏登记=本机永远赢云端整份丢），diagPersist 自打 _fieldTs.diagnosis 后 hubSave；④plans.html 页内 dg- 样式约 75 行，input/select 选择器全挂 #diagOverlay/#diagRoot id 作用域（权重 ≥1,1,0 压过 common.css:438 全站表单重置 0,2,1），:has() 高亮选中时段胶囊，380px 降单列。版本 plans.js b→c、data.js 20261001b→20261002a、common.js d→e（14 页 buster 全量 bump）。上一版 v168：10/2 二轮审查修复：mock 模考入口竞态（bug 9）——ensureMockLib() 动态注入报告库最长有 2.5s 空窗，旧代码 startExam 在 await 之后才写 mockState、window.__mockEnter 无锁，「ready 自动续考」与「题库页手动点模考」可在空窗内并发跑起两个 runExam（双计时器/双考官/快照互踩）。修法：①新增模块级 mockEntering 锁；②resumeFromSnapshot/startExam 入口统一「if(mockEntering || mockState) return」并在第一个 await 之前同步把 mockState 就位（锁随即释放，重入改由 mockState 挡），快照为空早退复位；③终态收口：finishExam 末尾与 runExam 中断 catch 分支补 mockState=null（exitToStart 原本已有），保证考完/中断后能再开一场；④ready 的自动续考改为统一走 window.__mockEnter（不再直调 resumeFromSnapshot），所有入口同一把锁。验证：竞态探针 19/19（注入窗口内双入口连发只开一场、speak 单例证据、中断后可重开、零 pageerror/rejection）+ allpages 56/56 + appshell 56/0 + tpllock 13/13 + p0/p1 金路径各 13/13。版本 js/mock.js b→c（speaking.html；PRECORE 裸路径缓存随 SW bump 刷新）。上一版 v167 微信信息全站收口——①settings.html 删「意见反馈」卡（⑤b，含写反馈按钮 + 「也可以在「更多」菜单里找到入口」）与底部「加站长微信」一行条（wx-strip 类名 + 其内联死样式 + 孤儿注释一并清）；②js/feedback.js 弹层内新增底部急事出口：超链接「等不及回复？加站长微信」→ **原位展开**联系方式块（她选「弹窗内原位展开」而非另开弹窗/直接复制，理由：不丢已写内容、上下文连贯）；微信号写进 FB_WX 常量作为**全站唯一出口**；展开块支持点微信号即复制（clipboard API + execCommand 双通道兜底）、aria-expanded/aria-controls、每次 open 收回起态、暗色同构图；③vip.html 开通方式「加站长微信转账」改「联系站长开通（去意见反馈说明档位+账号）」+ 邀请码 FAQ + 底部独立联系方式卡三处全部去微信号（她选「全删，只留反馈 Tab 里的」；她确认会员功能暂未上线，付款路径断链无影响）；④login.html 找回密码同改走意见反馈（保留「老数据不会丢」承诺）；⑤后端 feedback.js 限频/满额提示与前端网络异常提示一律改引导「点弹层底部超链接」，不再直发微信号。CSS 新增 fb-wx*41 行（--primary-soft 浅底 + 左主色描边，微信号等宽虚线块，三个命中区 ≥44px）。验证：源码探针 65/65 + 真实浏览器交互 28/28（展开/收起/复制/已写内容不丢/不遮挡提交按钮/重开复位/暗色/移动端贴底/设置页 4 卡清单）+ allpages 56/56。版本 feedback.js a→b、common.css k→l（各 14 页）。上一版 v165 计划页措辞收尾
  // 10/2 P1 答题框架融合（她刷到的高频题型框架 DP F/DWC/DCF/OREO + 同义替换句库 + 频率四档）——①js/speaking.js P1「AI 辅助」prompt 新增【题型骨架】段：先判题型（喜好/频率习惯/童年过去/事实背景/未来愿望/细节感受）再按对应骨架组织，**只当结构骨架用，框架名严禁写进输出**（她明确：考场上不会去看用了哪个框架，框架是背后的大脑不该出现在屏幕上），也**不生成整段模板给她背**；新增【直答句同义替换表】（yes→Absolutely/Definitely、no→Not really/Definitely not、I like it→I'm really into it/I'm a big fan of it、I don't like it→I'm not that into it/It's not really my thing）和【频率四档】（almost every day/from time to time three times a week/rarely once in a blue moon/never），替换掉原「稍高级」段里仅两条的 like→be really into、good→enjoyable；②新增选填「想法」输入框 .sp-idea（每道 P1 小题一条，placeholder「想法（选填，中英文都行；填了我就按你的思路来）」）：**空着点 AI 辅助 = 与原先完全一致（AI 自己全想）；填一句中文/碎片英文再点 = prompt 里加一段【考生填了想法时的处理规则】四条（最高优先级压倒骨架：严格按她想法组织不得另起炉灶/中文混杂直接翻地道英文/只补全不偏离/逻辑链第一环对应想法核心），想法随 aiHelper.idea 落库并在重进时回填（否则退出再进来白填），结果区顶部显示「已按你填的想法生成」小标记（不显示任何框架名）；③js/materials.js 万用人设卡 8 条全部重写为「性格/成长背景/身份标签」三角度结构（正是 DPF 里P 环要用的三样，AI 辅助取素材时能直接拆出来铺回答），并给每条加 fit 字段→按钮 title 悬停提示「能撑的题」；UI 与按钮零改动，往数组加一条的约定继续有效。④speaking.html 加 .sp-idea（虚线浅底、聚焦 teal 边、已填转实线、:not(:placeholder-shown) 也转实线）与 .sp-ref-note 样式。本次**不碰 P3**（p3HelperSys/p3ReviewSys 一个字未动）——她 10/9 机考，P3 那套锚句库她已练出肌肉记忆，考前 7 天换 prompt 风险大于收益；考后再议「锚句库只有 8 条、超出类别会硬套」与「禁 for example 导致永不展开」两个已知短板（届时可用 P1 骨架里的 R/E 环补展开）。版本 speaking.js b→c、materials.js a→b（speaking.html / materials.html 两页）。另：本批 commit 前先把另一 AI 审查修好的 8 个 bug（common/speaking/writing 目标分 0 穿透、会员闸缓存作废、grammar 旧记录凭空显示、tplWrongBox 恢复漏项、大作文分组漏渲染）单独提交为 916ce20，两件事不混。上一版 v166 微信信息全站收口

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
