# tests/ 探针清单

> 本目录 **不入库**（`.gitignore` 的 `/tests/*` 只放行白名单那几十支），所以文件会自己乱长。
> 这份清单是唯一的事实来源：**新探针加进来要登记一行，搬走的要标状态**。

## 怎么用

- 跑全部回归：`node tests/_regress_1017.cjs`（60 支，约 15 分钟）
- 跑单支：`node tests/_with_server.cjs tests/<探针名>.cjs <端口>`
- 查白名单与 .gitignore 是否一致：`node tests/_gate_gitignore_whitelist_1031.cjs`
- **不要去跑 `_archived/` 里的东西**：那些是一次性探针，断言早就和现在 DOM 对不上，全量跑只会得到一片假红（实测 300 支 → 0 支全绿），而且其中一部分会打线上 `/api/sync` `/api/ai`，KV 每天只有 1000 次写，10/5 已经烧穿两次。

## 状态说明

| 状态 | 含义 |
|---|---|
| 回归白名单 | 长期资产。在 `_regress_1017.cjs` 里，每次改动相关面都要复跑 |
| 基建 | 服务器、夹具、模板、白名单本身；不是断言 |
| 在途 | 当前这一轮改动带出来的验收探针，双闸结案后应搬进 `_archived/` |

## 根目录清单（89 支）

| 状态 | 文件 | 管什么 |
|---|---|---|
| 基建 | `_anc_seed.cjs` | 夹具：关掉「未读公告」变量 |
| 基建 | `_gate_gitignore_whitelist_1031.cjs` | 闸：白名单与 .gitignore 放行清单必须一致 |
| 基建 | `_harness.cjs` | 共用 Playwright 测试底座 |
| 基建 | `_regress_1017.cjs` | 回归白名单（60 支），一支支依次跑 |
| 基建 | `_review_util.cjs` | 夹具：挑一篇有答案的篇目并按真实答案作答 |
| 基建 | `_run_all.cjs` | 批量跑探针出汇总表 |
| 基建 | `_serve.cjs` | 只起本地静态服务器，不跑探针 |
| 基建 | `_static_server.cjs` | 零依赖静态服务器（_with_server 的子进程） |
| 基建 | `_template.cjs` | 新探针模板，复制改名即用 |
| 回归白名单 | `_diag_interact_1025.cjs` | 常见交互路径实测（点、切、跳页，只读） |
| 回归白名单 | `_diag_sitesweep_1025.cjs` | 全站 20 页 × 明暗 × 桌机/手机，扫报错与横向溢出 |
| 回归白名单 | `_precore_audit_1024.cjs` | PRECORE 预缓存名单完整性 |
| 回归白名单 | `_probe_admin_agg_1005.cjs` | 站长面板周/月聚合逻辑 |
| 回归白名单 | `_probe_admin_judge_1005.cjs` | 真人/探针判定 + 成本聚合 |
| 回归白名单 | `_probe_adminui_1020.cjs` | 站长面板 UI 改版（三段式 + 6 主指标） |
| 回归白名单 | `_probe_ai_caliber_1026.cjs` | AI 额度口径闸（纯静态读源码，不烧钱不占额度） |
| 回归白名单 | `_probe_b6sweep_1023.cjs` | .streak-chip 三段定义收敛后三处在用点零变化 |
| 回归白名单 | `_probe_bars_1020.cjs` | 三类模考底栏（按真实机考截图口径） |
| 回归白名单 | `_probe_bootgate_1017.cjs` | 开机闸「遮罩按住不放」握手 |
| 回归白名单 | `_probe_chain_1017.cjs` | 首屏关键路径分解（TTFB / 体积 / 阻塞） |
| 回归白名单 | `_probe_coachav_1020.cjs` | 口语陪练头像与思考文案 |
| 回归白名单 | `_probe_coachctx_1020.cjs` | 口语陪练点控制台整卡变暗（遮罩误伤） |
| 回归白名单 | `_probe_examtools_1018.cjs` | 模考工具栏 |
| 回归白名单 | `_probe_factorygate_1017.cjs` | 写作出厂内容外移：惰性 + 按需 + 兜底 |
| 回归白名单 | `_probe_fullentry_1017.cjs` | 完整模考入口卡静态化（CLS 修复） |
| 回归白名单 | `_probe_fulllast_1018.cjs` | 完整模考入口卡「上次成绩」 |
| 回归白名单 | `_probe_guide_1018.cjs` | 考前操作指南卡 |
| 回归白名单 | `_probe_homea3a_1021.cjs` | 首页 113A3a 落地批（胶囊顶栏 + A3b 搜索框 + 四数字卡） |
| 回归白名单 | `_probe_landing114_1021.cjs` | 落地页 114A1「真诚务实」版 |
| 回归白名单 | `_probe_latespk_1017.cjs` | 口语页视图脚本按需加载 |
| 回归白名单 | `_probe_latewrt_1017.cjs` | 写作脚本按需加载 |
| 回归白名单 | `_probe_listenleak_1029.cjs` | 软导航监听器泄漏（净活跃监听数） |
| 回归白名单 | `_probe_manifestfail_1017.cjs` | manifest 加载失败时入口卡的兜底 |
| 回归白名单 | `_probe_maprv_1019.cjs` | map 组（矩阵表格）判分上色回归 |
| 回归白名单 | `_probe_mobile_1017.cjs` | 手机真实画像（4x 降速 + 慢 4G）下卡在哪 |
| 回归白名单 | `_probe_nav_1017.cjs` | 软导航耗时拆三段（拿文档 / 换 DOM / 跑脚本） |
| 回归白名单 | `_probe_nextstep_1018.cjs` | 成绩卡「下一步」三卡 |
| 回归白名单 | `_probe_noans_1017.cjs` | 没有答案的篇目交卷后的行为 |
| 回归白名单 | `_probe_noans2_1017.cjs` | 没有答案的篇目要拦住不给判分 |
| 回归白名单 | `_probe_prac42_1023.cjs` | 背词页 4-2（空态 / 今日卡 / 批量条 / 列表） |
| 回归白名单 | `_probe_pracdarks_1023.cjs` | 背词页 4-1 三处深色 bug |
| 回归白名单 | `_probe_q6eval_1024.cjs` | eval 输入面收紧：该跑的跑、不该跑的拒 |
| 回归白名单 | `_probe_qtype_1017.cjs` | 按题型看正确率（交卷 → 明细 → 落盘 → 回顾） |
| 回归白名单 | `_probe_r1review_1024.cjs` | 顶栏「回顾」二级菜单四项收成两项 |
| 回归白名单 | `_probe_role_1022.cjs` | 三级角色权限（普通 / 管理员 / 系统管理员） |
| 回归白名单 | `_probe_shell_1022.cjs` | 全站换顶栏第 0+1 批（五张已换壳页） |
| 回归白名单 | `_probe_shell2_1022.cjs` | 全站换顶栏第 2 批（五张表单类页） |
| 回归白名单 | `_probe_shell3_1022.cjs` | 全站换顶栏第 3 批（五张长列表页） |
| 回归白名单 | `_probe_shell4_1022.cjs` | 全站换顶栏第 4 批（单词练习 / 口语 / 写作） |
| 回归白名单 | `_probe_shell5_1022.cjs` | 全站换顶栏第 5 批（模考 bank） |
| 回归白名单 | `_probe_softnav_guard_1029.cjs` | 软导航往返后页面幂等守卫与监听是否同步 |
| 回归白名单 | `_probe_softnav_queue_1031.cjs` | 手机底栏连点：最后目标必达且状态一致 |
| 回归白名单 | `_probe_speakbank_1020.cjs` | 口语题库重建（按考频版） |
| 回归白名单 | `_probe_submitjump_1018.cjs` | 交卷确认弹窗（未答可跳 / 标记题号清单） |
| 回归白名单 | `_probe_taskcap_1022.cjs` | 首页今日任务超 5 条的收口 |
| 回归白名单 | `_probe_teacher_1022.cjs` | 老师端「学生数据」页（三级权限第二批） |
| 回归白名单 | `_probe_timeline_1017.cjs` | 晚到内容的出现时间线（渲染晚还是布局晚） |
| 回归白名单 | `_probe_timer_1017.cjs` | 计时页渲染与关键计算样式 |
| 回归白名单 | `_probe_todaynum_1023.cjs` | 备考页「今天要复习」三处数字同口径 |
| 回归白名单 | `_probe_w5net_1024.cjs` | 云端/AI 请求补超时后不会永久卡死 |
| 回归白名单 | `_probe_warmup_1029.cjs` | WARMUP-THROTTLE-1 预热节流 |
| 回归白名单 | `_probe_wbdeck_1023.cjs` | 词书卡片网格 4-3 |
| 回归白名单 | `_probe_wbview_1023.cjs` | 进书视图 4-4（面包屑 + 状态胶囊） |
| 回归白名单 | `_probe_worddemote_1020.cjs` | 重复导入降一级 + 静默整理 |
| 回归白名单 | `_probe_wordimport_1020.cjs` | 单词 AI 导入：合并重复 + 翻译补全 |
| 回归白名单 | `_probe_wrtbar_1020.cjs` | 写作顶栏/底栏 Q1-Q4 拍板口径 |
| 回归白名单 | `_probe_wrte2e_1027.cjs` | 写作打分端到端数值回归（截断救回 / 上浮 / 封顶） |
| 回归白名单 | `_probe_wrttpl_1021.cjs` | 写作模板页（卡直露结构 + 列表视图） |
| 回归白名单 | `_with_server.cjs` | 起服务器 → 跑目标探针 → 收尾（所有探针都从它进） |
| 在途 | `_probe_ablate_1017.cjs` | 脚本依赖实测：拦掉单个脚本看首屏是否照常（被 bank.html 注释点名，留根目录） |
| 在途 | `_probe_examcompact_1102.cjs` | EXAM-SCORE-COMPACT-1 八条口径（在途） |
| 在途 | `_probe_rvbottom_1102.cjs` | RV-BOTTOM-23 复盘底部布局三条口径（在途）**文件不在本工作区**（11-04 归档时未见，`tests/` 不入库故无 git 记录，可能在其他窗口 worktree；名录保留供追溯） |
| 在途 | `_probe_rvtop_1102.cjs` | RV-TOP-24/25 复盘顶部布局+用时进顶栏（在途）**文件不在本工作区**（同上） |
| 在途 | `_probe_rvcolor_1102.cjs` | RV-COLOR-LOGIC-1/RV-BLANK-CA-2 对错颜色+框内正答（在途）**文件不在本工作区**（同上） |
| 在途 | `_probe_timerpop_1102.cjs` | EXAM-TIMER-POP 两笔 计时弹窗四条口径（在途）**文件不在本工作区**（同上） |
| 在途 | `_probe_aiexplain_1102.cjs` | RV-AI-EXPLAIN-1 复盘态 AI 讲解（v737 分栏口径）**文件不在本工作区**（同上） |
| 在途 | `_probe_rvfix5_1102.cjs` | RV-FIX5 v737 六笔（底栏/判色/填空/绿标/分栏/工具条）**文件不在本工作区**（同上） |
| 在途 | `_probe_sharedmap_1103.cjs` | BANK-SHARED-MAP-1 地图/配对题不再走共享组判分（缺键不进分母 / 复盘正答按单题 key / 真共享组照旧计分；基线 5 红） |
| 在途 | `_probe_headmap_1103.cjs` | HEADING-BLOCK-DEL + MAP-MATRIX（heading 题目行整块隐藏仍可作答 / 段落槽带题号 / 地图题答题卡矩阵；基线 07e25a53 上 11 红，改后 0 红） |
| 在途 | `_probe_headmap_mobile_1103.cjs` | 同上手机档 390 复核（整页无左右滑 / 矩阵容器内滚 / 触屏点格 / heading 槽尺寸） |
| 在途 | `_probe_keyfill_matrix_1103.cjs` | 交叉验证：v746 补键（6 篇地图题按官方键点满）+ v747 地图矩阵化叠在一起 —— 每题进分母、判对、复盘正答一致、无缺键题混入；37/0 |
| 在途 | `_probe_autoread_1103.cjs` | AUTO-READ-RESTORE-1 自动读恢复（口语切题读一次/再切又只一次/喇叭重播一次/模考进题一次/模考下一题一次/en-GB；基线 v745 上 8 红） |
| 在途 | `_probe_detailundef_1103.cjs` | RV2-DETAIL-UNDEF-1 回顾页记录详情弹窗 undefined 兜底（造旧格式无 label + 新格式两条，真开弹窗；未修 HEAD 上 2 红） |
| 在途 | `_probe_modedouble_1103.cjs` | MODE-DOUBLE-READ-1 自动朗读去重（进场/切走/切回/连渲染 2 次/点喇叭/连点喇叭/下一题共 8 项；未修版第 ④ 项红） |
| 在途 | `_probe_dictslim_1103.cjs` | DICT-HEADER-SLIM-1 听写态瘦身（剩下什么/该删的全不可见/例句不泄答案/模式往返/判分落盘/自动读/无横滑，17 项；四档 1280·390 × 浅色·深色） |
| 在途 | `_probe_examui3_p1_1031.cjs` | UNIFIED-EXAM-UI-3 笔1（在途） |
| 在途 | `_probe_hl_1101.cjs` | HIGHLIGHT-REGRESS-1101 划词高亮（在途） |
| 在途 | `_probe_perfnav_1104.cjs` | PERF-VERIFY-B1-1 全站启动基线（七页冷/热 responseEnd·FCP·load + 首页→今日单词路径 + 长任务/pageerror；v760 40821c23 首跑 17 过 0 红 4 WARN 即基线） |
| 在途 | `smoke_sd_1415.cjs` | 14 砍换词 + 15 堵 AI 超时静默放行 回归 |

## `_archived/`（448 个文件）

历史一次性探针，对应改动早已上线且双闸结案。**不删除、不再跑、不被任何脚本引用**；
留在这里只为将来有人问「当初那个问题是拿什么量的」时能翻回来。

搬进来时按三条判据筛的：①不在回归白名单；②不是基建/夹具；③没被任何脚本 require、没被产品注释点名、最近 3 天没改过。

| `_probe_perfwrite_1104.cjs` | 在途 | PERF-WRITE-1（v761）：一次作答只落一次盘。八项判据 × 390/1280：①OB_KEY 每答写入 ≤2.3 次（基线 3.2）②HUB_KEY 写入≈题数 ③单题落盘阻塞 ≤45ms ④续背回归 ⑤答错降级 ⑥跨天补写 ⑦已掌握写盘 ⑧零 pageerror。用 `addInitScript` 包 `Storage.prototype.setItem` 按调用栈归类（answer/next/mastered/book/other），**不要替换 wbSave**（会打断作答链）。`_base.txt` 可切本地/线上。 |

## 11-04 夜班（v761–v765）探针

**已归档（`_archived/`，一次性用完，见 `_archived/` 目录）**：`_probe_perfall/_probe_perfbw/_probe_perfclick/_probe_perfdisk/_probe_perfredeploy/_probe_perfslow/_probe_perfw0/_probe_perfw0verify/_probe_perfword/_probe_perfword2/_probe_sfxbaseline/_probe_sfxnow/_probe_slim1_weaknet/_probe_swthrottle/_probe_swtimeline/_probe_w1preload/_probe_w1preload2/_slowsrv_1104.cjs` + `swricprobe.js`（19 支），
以及 32 支 `_probe_slim2_*.cjs` 探索版（`_1104.cjs/_min/_warm/_key/_race/_mech/_dictenter/_idlemech/_wavdiag/_range206/_pauseabort/_concur/_concurrency/_onlinewav/_onlinewarm/_ric/_206put/_206clean/_httpcache/_httpcache2/_autoplay/_judge8/_activate/_netinfo/_noplay/_noplay2/_order/_warmonly/_idle8s/_idlekick/_mediastatus`）+ `_probe_slimverify_1104.cjs`。

**留活（根目录，仍有验收职责）**：

| 文件 | 状态 | 说明 |
|---|---|---|
| `_probe_slim2deploy_1104.cjs` | 在途 | **T13-AUDIOPUT-1 验收工具**。三步构造：①SW 接管后首次 warmKeys（期望 5/5）②只删 SW cache 里的 mechanical（期望 0/5，确认删干净）③重载重跑（= 部署 bump 后首轮，修好后期望 5/5）。**判据只看缓存条数，不看 media 状态码**——修好后 media 仍会返 206（HTTP 缓存还在），但显式 `fetch` 拿 200、`put` 成功。 |
| `_probe_slim2key6_1104.cjs` | 在途 | 判据 6 专项：mechanical 首键 `keydown→playing`，连跑 3 次取中位数。**取值只认 `keyToSound != null && vol > 0`**，排除 warmKeys 的静音预热 play（`volume=0` 被 headless 拒属正常）。 |
| `_probe_slim2neg_1104.cjs` | 在途 | 判据 8：断网首键，**必须独立 context**（同一 context 先敲过键再断网，测到的是 HTTP 磁盘缓存命中，假绿 66ms）。 |
| `_probe_slim2sfx_1104.cjs` | 在途 | 判据 6 主跑 + 7 不回归 + 9 假旧 cache + 10 实况条数 + 8 断网，多判据串跑版。 |
| `_probe_perfnav_1104.cjs` | 在途 | PERF-VERIFY-B1-1 全站启动基线（七页冷/热 responseEnd·FCP·load + 首页→今日单词路径 + 长任务/pageerror；v760 40821c23 首跑 17 过 0 红 4 WARN 即基线）。 |
| `_probe_perfwrite_1104.cjs` | 在途 | PERF-WRITE-1（v761）：一次作答只落一次盘，八项判据 × 390/1280。`FILL_PROG=1` 灌真实规模（2651 词），`HISTN` 控历史条数。 |
| `_probe_t13accept_1104.cjs` | 在途 | T13-AUDIOPUT-1 验收（A1 自测口径，与 B1 的 `_probe_slim2deploy` 互补）：①部署后首轮 5/5 ②首次 warmKeys 5/5 不回归 ③判据 6 ≤150ms ④零 pageerror。 |

## 探针方法学铁律（11-04 夜班，六次假红换来的）

1. **测 SW 相关行为，必须先等 `navigator.serviceWorker.controller` 就绪。** 否则 `fromSW:false`，测的是「没有 SW 的页面」。SW 首次安装要 8~9 秒。
2. **验证 HTTP 缓存行为时，预填、测量、对照组必须用完全相同的 URL。** 任何 query 串差异（`?_probe=1`、`&t=`）、任何 `cache` 模式差异（`no-store`）都等于换了 key，测的是另一个东西。
3. **对照组必须真的是对照组**：warmKeys 当第一请求者 vs 不是，是两种状态，不能拿「空缓存下全 200」去反驳「有缓存时 206」。
4. **判据必须用真实锚点元素**，不能用「正文字数」（单词页空态只有 213 字，`>250字` 永远等不到）。
5. **`Fetch.enable` 必须带 `requestStage:'Response'`**，否则 `Fetch.getResponseBody` 报 `Can only get response body on HeadersReceived pattern matched requests`。
6. **听写模式必须走页面内 `pcSave({questionMode:'dictation'})`**，直接写 localStorage 会被 DATA 载入/云合并覆盖回 visual；且 `ielts_hub_obank_v1.active` 要是真实库。

**本地 loopback 口径的坑（务必记住）**：`python -m http.server` 不实现 Range，恒返回 200 全量；线上 Cloudflare 实测也是 200。但本地 loopback 带宽接近无限，`_probe_slim2_idlemech` 在本地能跑满 138 条、20 秒补到 mechanical，**线上 90 秒只补到 42 条永远补不到 mechanical**。凡涉及"能不能补满"，只认线上数据。

**206 机制（11-04 定案，T17）**：`cache.put(206)` 规范层直接抛 `TypeError: Partial response (status code 206) is unsupported`。触发条件是「发请求那一刻该文件在不在浏览器 HTTP 缓存里」——不在 → 200 → 能落；在 → 206 → 落不了。**部署 bump 后首轮 SW 缓存已清、HTTP 缓存还在 → 必然 206 → 落不了**（实测 `fromSW:true` + 5 条 206 + 缓存 0/5）。`_slowsrv_1104.cjs` 不可信（40KB/s 下 372KB 实测 26.1s，理论 9.1s，泵逻辑要重写）。
