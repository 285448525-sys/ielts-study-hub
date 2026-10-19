# 模块地图 · 雅思学习网站

> **给 AI 的第一份文件**：改任何功能前先在这里定位；**只读列出的文件**，不要再全目录搜索；碰到大文件先看 §3 的行号，**禁止整文件通读**。
> 为什么必须这么做：`js/common.js` 5153 行 / 312KB，24 个真实页面里有 20 个都加载它 —— 改一个小功能若整读它，等于先烧掉几万 token 才找到那一行。这是本站最大的读取成本来源，也是本文件存在的唯一理由。
> 数据来源 = **实测生成**（2026-10-19）：页面→文件关系取自各页面的 `<script src>` / `<link rel=stylesheet>`；功能命名与分组取自 `js/common.js:24` 的 `PAGES` 与 `js/common.js:531` 的 `GROUPED_DOCK` —— **以代码为准，不凭印象**。刷新方法见 §5。

## 1 功能 → 文件

| 功能（导航名） | 入口页 | 主脚本 | 专属样式 | 数据 / 后端 |
|---|---|---|---|---|
| 首页 · 今日概览 | `home.html` | `js/index.js`、`js/wordbank.js` | `css/p/home.css` | `js/data.js` 的 DATA |
| 模考 · 题库（阅读/听力/写作/口语） | `bank.html` | `js/bank.js` | `css/p/bank.css` | `bank/answers/`(463) · `bank/listening/`(347) · `bank/reading/`(280) · `bank/manifest.json` |
| 口语 · 题库 + AI 串题 | `speaking.html` | `js/speaking.js`、`js/sentence-drill.js`、`js/pattern-drill.js`、`js/scene-drill.js`、`js/coach.js`、`js/av-picker.js` | `css/p/speaking.css` | `data/sentences.json` · `data/scenes.json` · `data/patterns.json` · `js/data.js` 的 SPEAKING_BANK(`data.js:87`) |
| 写作 · 模板 + AI 评分 | `writing.html` | `js/writing.js`、`js/writing_prompts.js`、`js/factory-writing.js` | `css/p/writing.css` | `data/writing_prompts.json` |
| 单词 · 背词 | `practice.html` | `js/practice.js`、`js/words.js`、`js/wordbank.js`、`js/dhp_policy.js` | `css/p/practice.css` | `js/data.js` 的 words；导入 Excel 用 `js/vendor/xlsx.full.min.js`(861KB，按需加载) |
| 句子 · 长难句/错题/听写 | `corpus.html` | `js/corpus.js` | `css/p/corpus.css` | `js/data.js` 的 corpus |
| 计划 | `plans.html`（组页 `plans-hub.html`） | `js/plans.js` | `css/p/plans.css` | `js/data.js` 的 plans |
| 计时 | `timer.html`（组页 `plans-hub.html`） | `js/timer.js` | `css/p/timer.css` | `js/data.js` 的 activeTimer |
| 回顾 · 成绩与轨迹 | `review.html`（组页 `me.html`） | `js/scores.js` + `js/history.js` + `js/mock-report.js` + `js/mock-history.js` + `js/mock-summary.js` + `js/speaking-practice.js` + `js/progress.js` + `js/review.js` + `js/sprint.js` | `css/p/review.css` | `js/data.js` 的 mockRecords / scores |
| 错句本 | `wrongbook.html` | `js/wrongbook.js`、`js/factory-writing.js` | 用 `css/common.css` | `js/data.js` 的 wrongbook |
| 会员 · 定价 | `vip.html` | `js/vip.js`、`js/pricing.js` | `css/p/vip.css` | 价格口径唯一来源 = `index.html` + `vip.html`（登录/注册页零商业信息） |
| 设置 · 同步/AI/数据 | `settings.html`（组页 `me.html`） | `js/settings.js`、`js/av-picker.js` | `css/p/settings.css` | `js/data.js` 的 settings |
| 服药（**她的东西，别动**） | `meds.html` | `js/meds.js` | `css/p/meds.css` | `js/data.js` 的 adhd |
| 组页（计划组 / 学习组 / 我的组） | `plans-hub.html`、`study.html`、`me.html` | `js/hubgroup.js` | 用 `css/common.css` | — |
| 登录 / 注册 / 改密 | `login.html`（整页自带样式与脚本） | — | — | `functions/api/auth.js` |
| 落地页（商业信息唯一出口） | `index.html`（整页自带） | — | — | — |
| 条款 / 隐私 | `legal.html` | — | `css/common.css` | — |
| 管理后台 | `admin.html`（整页自带） | — | — | `functions/api/admin.js` |
| 资料 / 素材 | `materials.html` | `js/materials.js` | 用 `css/common.css` | `data/materialsets.json` · `js/data.js` 的 materials |
| 新手引导 / 最简页 | `beginner.html` | —（只需 `data.js` + `common.js`） | `css/common.css` | — |
| 句型闯关（独立直达页） | `pattern-drill.html` | `js/pattern-drill.js` | 用 `css/common.css` | `data/patterns.json` |
| 错题重做（极简壳） | `errorbook.html`（整页自带） | — | — | — |
| **公共外壳** · 导航/主题/软导航/缓存/PWA | 所有页 | `js/common.js` | `css/common.css`（+`css/legacy.css`） | `sw.js` · `manifest.json` · `_headers` · `wrangler.toml` · `icons/` |
| 全站反馈 | 所有页 | `js/feedback.js` | — | `functions/api/feedback.js` |
| AI 能力（全站共用） | — | `js/common.js` 的 `1084`–`1430` 段 | — | `functions/api/ai.js` |
| 云同步 · 数据本体 | — | `js/data.js`（`hubLoad:1688` / `hubSave:2107`）+ `js/common.js` 的 `1445`–`3210` 段 | — | `functions/api/sync.js`（云端数据保管，改动需格外谨慎） |

**命名陷阱**：首页入口是 `home.html`，但它的脚本叫 `js/index.js`（**没有 `js/home.js`**）；`index.html` 不是学习首页，是给站外访问者的落地页（9/30 改的名，见 `js/common.js:22`）。

## 2 目录职责

- 根 `*.html`：**网址就是文件名**。改文件名或新增页面**必须同步改 `js/common.js:24` 的 `PAGES` 表**（软导航按 `js/{id}.js` 找主脚本，id 必须与文件名一致）—— 动之前先读 `js/common.js:22`–`50` 的注释。
- `js/`：业务脚本 38 支 + `vendor/`；`css/`：`common.css`（全站）+ `legacy.css` + `p/`（每页一支，10/18 起分片）
- `bank/`：题库数据（answers 463 / listening 347 / reading 280）；`data/`：5 张素材表
- `functions/api/`：5 个后端（admin / ai / auth / feedback / sync）
- `design/`：截图与方案稿（不入库）；**`design/_scratch/`：本机临时件与预览稿**（10-19 起从根目录归位 36 份，不入库）；`plan/`：施工方案（不入库）；`tests/`：探针与回归（不入库）；`outputs/`：产物（不入库）；`docs/`：交接与说明文档
- 根目录仍留 2 个**已入库**的本机件：`ui-mockup.html`（UI 草稿页）与 `_diag_home.png`（诊断截图）。`.gitignore` 对已入库文件不生效，搬走等于从线上删掉它们，故原地保留 —— 要真正下线需单独决定。

## 3 巨型文件锚点（只读需要的行段）

**`js/common.js`（5153 行 / 312KB，20 页共用 —— 改任何页面前先确认它有没有同名逻辑）**

- 外壳与导航：`3` ICON 图标表 · `22` PAGES 页面表 · `71` PRIMARY_NAV / MORE_NAV / TAB_NAV · `78` injectNav 侧栏 · `531` GROUPED_DOCK 底部分组 · `1048` normalizePageFile
- 侧栏：`152` 侧栏 AI 释义 · `194` 生词本墓碑 · `233` bindSideSearch · `629` getActiveSession · `655` renderSideTimer · `690` resolveTimerNames
- 通用工具：`885` toast · `895` limitStrip · `1006` examCountdown · `1033` calcStreak · `1054` statCard / progressBar
- AI 中继：`1084` AI_BASE · `1088` callSiteRelay · `1146` callRelay · `1224` aiJson · `1290` P3_GEN_SYS · `1353` genSpeakingP3
- 云同步（`1445`–`3210` 整段）：`1498` _syncBcPing · `1689` cloudUpload · `1768` flushCloudUpload · `1829` stripCloudFields · `1875` stampSyncItemsForUpload · `2719` cloudPollOnce · `2754` cloudDownload · `2842` cloudDelete · `3156` initCloudSync
- **数据合并（改数据结构必读这一段）**：`1936` _mergeWords · `2048` _mergeArray · `2083` _mergeSpeakingAnswers · `2184` mergeData · `2546` _mergePlans · `2618` _mergeMaterials · `2688` _mergeActiveTimer
- 分数与账号：`2856` MOCK_TYPES · `2881` estimateBand · `2909` normalizeAcct · `2933` authLogin · `2957` authRegister · `2985` authChangePassword · `3012` syncDiagnose · `3065` syncForcePush / Pull
- 外壳运行时：`3278` showHubLoader · `3379` injectFloatTimer · `3498` initSoftNav · `3835` softNavigate · `3894` swapPageStyles · `3955` runPageScript · `4096` prefetchPage · `4245` registerSW · `4295` maybeShowSwUpdatePrompt
- 新用户引导：`4174` ONB_KEY · `4517` initOnboarding；计划跳转：`4998` PLAN_GEN_PAGES · `5028` bankAt · `5144` hubSoftGo

**`js/data.js`（2254 行 / 93KB）**：`48` MODULES 模块表 · `87` SPEAKING_BANK 口语题库（`1482` 起是版本号 / 季）· `1527` 保留式答案合并 · `1577` HUB_FACTORY 出厂模板 · `1617` DATA 数据结构 · **`1688` hubLoad（老数据迁移全在这段）** · `2107` hubSave · `2210` 起日期与词条工具

**`js/bank.js`（3466 行 / 202KB）**：**先读文件头 `1`–`14` 行的「软导航契约四条铁律」**（交互不写内联 `<script>`／容器必须在 `<main>` 内／事件委托绑 document／渲染入口幂等）· 顶层声明从 `958` 起（选项面板 `958`/`979`、交卷状态上报 `1007`）

**`js/speaking.js`（3718 行 / 233KB）**：`188`–`900` 列表渲染与筛选 · `911`–`1500` 详情与串题 · `1572`–`2210` 串题 AI · `2230`–`2600` P3 小步走 · `2721` 提交记录 · `2791`–`3454` 诊断与纠错 · `3551`–`3629` 口语计时

**`js/scores.js`（829 行）**：`94` 总览 render · `202` 趋势图 · `267` 雷达图 · `571` 按题型统计 · `609` 模考统计 · `723`–`827` 模考列表与逐题明细

**`sw.js`（698 行）**：**`69` CACHE 版本号（改任何 js/css 必须 +1）** · **`399` PRECORE 预缓存名单（「本地好线上坏」先查这里）** · `600` 导航策略 · `644` 静态资源策略 · `398` 注释说明 xlsx 为何不进预缓存

**`css/common.css`（2430 行 / 160KB）**：全站共享；**页面专属样式一律写 `css/p/<页名>.css`**，别再往 common.css 里加

## 4 回归探针（`tests/_regress_1017.cjs` 白名单里的 19 支 = 长期资产）

- 开机与落地：bootgate · chain · factorygate · manifestfail
- **模考（动 `js/bank.js` 必须跑这 9 支）**：fullentry · noans · noans2 · qtype · examtools_1018 · fulllast_1018 · nextstep_1018 · submitjump_1018 · guide_1018
- 写作 / 口语按需加载：latewrt · latespk
- 导航与手机：nav · mobile
- 计时：timer · timeline
- ⚠️ 其余 600+ 支是历史探针：**别全量跑**（会得到一片假失败，且部分会打线上同步与 AI 服务，消耗每日写入额度）

## 5 刷新本文件

改完页面加载关系或大文件结构后，跑 `node tests/_gen_module_map.cjs` 重新生成 §1 与 §3，把输出回填本文件（同时同步本机 `AGENTS.md` 的对应一节）。