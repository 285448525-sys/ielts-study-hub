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

## 根目录清单（94 支）

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
| 回归白名单 | `_probe_role_1022.cjs` | 三级角色权限（普通 / 管理员 / 系统管理员）。⚠️ 11-14 PERM-CFG-1 后 admin.js import roles.js 的 PERM_DEFAULTS，本探针复制模块时已同步改 import 并拷 roles.js，别回退 |
| 在途 | `_probe_perm_entry_1114.mjs` | 第五批入口显隐与系统拦门（PERM-ENTRY-1）：服务端实测拒一次越权（普通用户 students/view 403、密钥门 401、坏凭证 401、授权/取消 me 立变）；mjs 假 KV 直调自含运行，绝不打线上。双闸结案后搬 `_archived/` |
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
| `_probe_t18traffic_1104.cjs` | 在途 | T18-AUDIOCACHE-1（v768）：缓存已满时播放 Audio 是否还有网络流量。判据**只看字节数**（`Audio` 必发请求，命中时 `encodedDataLength=0`）。基线 505246B → 0B。 |

**A1 的 T13/T18 配套探针（同批施工时留在根目录，A1 名下）**：`_logserv_t13.cjs`（带请求计数的本地服，端口 8795）、`_probe_t13ab_1104.cjs`（A/B 对照）、`_probe_t13traffic_1104.cjs` / `_probe_t13traffic2_1104.cjs`（流量前后对比）。

## 探针方法学铁律（11-04 夜班，九次假红换来的）

1. **测 SW 相关行为，必须先等 `navigator.serviceWorker.controller` 就绪。** 否则 `fromSW:false`，测的是「没有 SW 的页面」。SW 首次安装要 8~9 秒。
2. **验证 HTTP 缓存行为时，预填、测量、对照组必须用完全相同的 URL。** 任何 query 串差异（`?_probe=1`、`&t=`）、任何 `cache` 模式差异（`no-store`）都等于换了 key，测的是另一个东西。
3. **对照组必须真的是对照组**：warmKeys 当第一请求者 vs 不是，是两种状态，不能拿「空缓存下全 200」去反驳「有缓存时 206」。
4. **判据必须用真实锚点元素**，不能用「正文字数」（单词页空态只有 213 字，`>250字` 永远等不到）。
5. **`Fetch.enable` 必须带 `requestStage:'Response'`**，否则 `Fetch.getResponseBody` 报 `Can only get response body on HeadersReceived pattern matched requests`。
6. **听写模式必须走页面内 `pcSave({questionMode:'dictation'})`**，直接写 localStorage 会被 DATA 载入/云合并覆盖回 visual；且 `ielts_hub_obank_v1.active` 要是真实库。
7. **v767 起 `warmCache` 主动延后 4000ms**（`new Promise(res => setTimeout(res, 4000))`，为消 T18 的重复下载）。测 warmCache 的探针**必须等 >4 秒**，写死 2500ms 会在它还没开始跑时数缓存 → 永远 0/5 假红。断网类判据同理：要等 SW 接管 + warmCache 落地完成再断网。
8. **数「零流量」不能数请求条数，只能数字节。** `Audio` 元素必然发出一条 media 请求，命中 SW 缓存时那条记录依然出现，只是 `encodedDataLength = 0`。按条数判会得到永假红。
9. **音效文件清单别凭直觉写**：`bubble` 是 `1~8.wav` + **`enter.mp3`（不是 9.wav）**，`mechanical` 是 `1~5.wav`（见 `js/wd-dict.js:19-20` `KEY_SOUNDS`）。写错路径时 SPA 会返回 `index.html`（200 + text/html），播放报 `error`，造出假红。
10. **SW 内部的 `fetch(req)` 回源不在页面的 Network 域里**，页面侧 CDP 只看得到 `fromSW:true` + `bytes:0`。要观测 SWR 是否 revalidate，必须 attach 到 `service_worker` target（`Target.attachToTarget` + 扁平化会话），否则会误判成「没有网络活动」。

11. **测她报的 bug，必须先复刻她的进入路径（软导航 vs 直开）。** 这一条是 11-04 计划页塌陷换来的最大教训：B1 连续三轮用 `page.goto` 直开测「复现不出」，A1 扫码线也复现不出，结论都写成「她那边的问题」。真实病根是 `js/common-shell.js` 的 `swapPageStyles()` 软导航时把 `css/p/xxx.css` **appendChild 到 head 末尾**，落到页面内联 `<style>` 之后 —— 同特异度 `(0,1,0)` 后出现者胜，直开正常、软导航必塌。**她从来都是点顶栏导航进来的。** 判据：任何「布局/样式」类报障，两路都要测 —— `page.goto(页)` 与「首页 → 点顶栏进该页」，两者结果不一致本身就是 bug 线。
12. **量「按键→出卡」必须在页面内打点，不能用外部 `Date.now()` 包围 + 固定 `waitForTimeout`。** 外部计时会把探针自己的等待算进去（11-04 查词复测首版因此多报 300ms）。正确做法：`addInitScript` 里挂 `MutationObserver`／`setInterval` 记录 `performance.now()`，两个页面内时刻相减。

**本地 loopback 口径的坑（务必记住）**：`python -m http.server` 不实现 Range，恒返回 200 全量；线上 Cloudflare 实测也是 200。但本地 loopback 带宽接近无限，`_probe_slim2_idlemech` 在本地能跑满 138 条、20 秒补到 mechanical，**线上 90 秒只补到 42 条永远补不到 mechanical**。凡涉及"能不能补满"，只认线上数据。

**206 机制（11-04 定案，T17）**：`cache.put(206)` 规范层直接抛 `TypeError: Partial response (status code 206) is unsupported`。触发条件是「发请求那一刻该文件在不在浏览器 HTTP 缓存里」——不在 → 200 → 能落；在 → 206 → 落不了。**部署 bump 后首轮 SW 缓存已清、HTTP 缓存还在 → 必然 206 → 落不了**（实测 `fromSW:true` + 5 条 206 + 缓存 0/5）。`_slowsrv_1104.cjs` 不可信（40KB/s 下 372KB 实测 26.1s，理论 9.1s，泵逻辑要重写）。

## 探针登记 · 第 3 单（全站英文眉题扫净，2026-11-04）

| 探针 | 用途 | 现状 |
|---|---|---|
| `_archived/_probe_eyebrow_1104.cjs` | 第一遍：按「全大写+letter-spacing+类名命中」扫 26 页眉题候选 | 已归档（一轮即完） |
| `_archived/_probe_eyebrow2_1104.cjs` | 第二遍：补第一遍三个洞——index 登录态会跳 home、`?sub=` 视图、小字英文标签无 letter-spacing；每页标出元素在页标题之上还是之下 | 已归档 |
| `_archived/_probe_eyebrow3_1104.cjs` | 第三遍：只收「纯英文且 ≥70% 大写」的元素，**不限字号**，专补「大字号全大写大标题」这一洞 | 已归档 |
| `_archived/_eyebrow_scan{,_2,_3}_1104.json` | 三遍的原始读数（页 / 选择器 / 文案 / 字号 / letter-spacing / 坐标 / 是否在标题之上） | 已归档 |
| `_archived/_probe_vip775_1104.cjs` | 第 3 单 v775 线上验收：会员页五态（未登录/查询中/登录过期/会员生效/免费版，靠 `hub_auth_token` + 拦 `api/auth` 造）、375/390 两档、实载串号、已知不动项、全站 27 视图复扫 | 已归档（一轮即完） |
| `_archived/_probe_review777*_1104.cjs` | 第 4 单第 2 笔 v777 回顾页验收：软导航/直开/改前基线三方几何、真点录入成绩并读 localStorage 验证落库、空态两枚按钮去重、多宽度（760~1920）按钮与四科文字的二维遮挡扫描 | 已归档 |
| `_archived/_probe_review778_1104.cjs` | v778 线上终验：7 个宽度（360/375/390/400/401/430/1440）× 2 组数据（正常/长文案）的二维遮挡扫描 + 真点录入落库 + 深色 + 不回退 | 已归档 |
| `_archived/_probe_home779*_1104.cjs` | 第 4 单第 3 笔 v779 首页验收：hero 两态几何、改前/改后基线对照（hero 79→21、四卡 265→190）、四卡可点、两个链接真实鼠标点击（等足 12s 覆盖软导航）、配齐态整条不渲染、深色对比度、360/375/390 三查、回顾/计划/vip 不回退 | 已归档 |
| `_archived/_probe_corpus780*_1104.cjs` | 第 4 单第 4 笔 v780 句子页验收：h1/intro 隐藏后无障碍树仍在、模式切换真点、主流程（api/ai 打桩）两种模式各跑一遍、360/375/390 改前改后基线、三视图切换、深色、软导航、前几笔不回退 | 已归档 |
| `_archived/_probe_help781*_1104.cjs` | 第 4 单第 5 笔 v781 帮助页验收：hero 三件套隐藏（父盒裁剪判定+像素对照）、8 个 details 逐个开合、写反馈/联系站长真点开层、无障碍树 h1、360/375/390 改前改后基线、深色真实底色对比度、软导航（设置页切「反馈关于」再点）、前几笔不回退 | 已归档 |
| `_archived/_probe_announce782*_1104.cjs` | 第 4 单第 6 笔 v782 公告页验收：两视图（普通公告 + ?tab=msg 消息中心）改前改后基线、:has() 还原逐值等价、rAF 逐帧闪烁窗口 + 与 FCP 对齐判定、详情态不误还原、读过不再打扰落库、无障碍 heading、360/375/390、深色真实文字色、前五笔不回退 | 已归档 |
| `_archived/_probe_beginner783*_1104.cjs` | 第 4 单第 7 笔 v783 新手页验收：四档 #bn-1 改前改后、幽灵卡片逐属性归零（含 @media ≤640）、所有命中 .bn-hero 的规则连同特异度全表、AXTree 8 个 heading、触屏上下文滚动实测、深色真实文字色、前六笔不回退 | 已归档 |
| `_archived/_probe_legal784*_1104.cjs` | 第 4 单第 8 笔 v784 法律页验收：四档锚点条改前改后、.legal-head 收起完备性（含 @media≤560）、五条锚点逐个真跳（桌面点击/手机点击/桌面带 hash/手机带 hash 四种入口各一遍）、hash 导航不滚内层 main 的既有行为定量、AXTree 16 个 heading、深色真实文字色、前七笔不回退 | 已归档 |
| `_archived/_probe_materials785*_1104.cjs` | 第 4 单第 9 笔 v785 素材页引导屏验收：四档改前（注入 v784 materials.css）改后对照 305/465px、.mi-head/.mi-hero 收起完备性、h1/h2 裁剪二维判据、三按钮真点走全流程、25 条命中规则含 !important 锁、AXTree h1 唯一 level=1、深色、前八笔不回退 | 已归档 |
| `_archived/_probe_meds786_1104.cjs` | 第 4 单第 10 笔第一页 v786 服药页验收：未开启态四档改前改后（注入 v785 meds.css）、收态属性全表、开启态零变化对照、AXTree h1+模块未开启、main.container 限定选择器真点去设置、全页 settings 链接归属、深色、前九笔不回退 | 已归档 |
| `_archived/_probe_review787*_1105.cjs` | 第 6 单配色第一笔 v787 回顾页验收：四科身份色逐科对令牌（左条/底色/科名）、L 未达标时左条仍青色（ssr 预警的特异度坑）、徽章两态零新增 DOM（节点数与 innerHTML 双比）、记录行三类 data-cat 色条（自造 whole/part/speaking 三类记录）、趋势线五科目切换实测、深色令牌自动跟随、功能真点、四档零横滑、前 10 笔不回退 | 已归档 |
| `_archived/_probe_bank788*_1105.cjs` | 第 7 单机经页配色验收：四档改前改后（baseline 真注入）、阅读靛/听力青两色共存、分组头浅底+左条、:has 三条在表内、inset 不动盒模型（border-left 恒 0）、深色令牌跟随、科目 tab 真实切换（#mockTabs[data-mtab]）、前 11 笔不回退 | 已归档 |
| `_archived/_probe_writing789_1105.cjs` | 第 7 单第二笔 v789 作文页配色验收：四档改前改后、tab 底条逐一切换（tpl青/bank靛/score橙）、卡左条 1px灰→3px主青且外宽不变、chip 实心白字→浅青底深字（多层半透明底合成后对比度）、深色令牌跟随、前 12 笔不回退 | 已归档 |
| `_archived/_probe_writing790_1105.cjs` | 第 7 单第二笔补刀 v790 复验：真鼠标悬停左条稳主青（上浮/投影保留、移开回落）、三枚 tab 恒等高与文字不偏、::after 三色真实生成与深色档、lv-cnt opacity 与合成对比度、前 12 笔不回退 | 已归档 |
| `_archived/_probe_dock791_1105.cjs` | 手机端回顾入口 v791 + 深色底条 v792 验收：三档底栏五格顺序/均分/高度、桌面不注入、点回顾真跳且亮格跟随、13 个页面逐页亮格不漂移、软导航亮格、plans-hub 无亮格反向对照（既有）、深色底条对比度 7.80、带 query 与裸路径落点差异 | 已归档 |
| `_archived/_probe_deadshell794*_1105.cjs` | 回顾页死壳清理 v794 验收：死壳四项计数归零、#rvLegacy 层级与 203 节点/9 可交互、软导航与直开四路落点逐值、暗号不变式（subKey 归 null）、劫持检查、详情删除转发到 #rvLegacy 真点、三档窄屏、前 13 笔不回退 | 已归档 |

**第 13 条铁律（本单换来的）**：扫「某类装饰元素」不能只按类名或只按一个视觉特征筛，要**三遍交叉**——①类名/全大写+字距；②小字号含英文的短文本（补「没字距、没全大写」的变种）；③纯英文+高比例大写且**不限字号**（补「大标题」变种）。另外两个必查的进入路径洞：**`index.html` 登录态会自动跳 home**（扫落地页必须用干净 context，否则扫到的是 home）、**同一页面带 `?sub=` 是不同视图**（bank/review 尤其）。判「页头装饰眉题」还要一个位置判据：元素 y 坐标是否在第一个 `h1/h2` 之上。

**第 14 条铁律（v777 回顾页换来的）**：判「A 有没有遮住 B」必须做**二维矩形相交**（横向与纵向同时重叠才算），只比一维会出假红——v777 首判拿「按钮左缘 < 科4 文字右缘」就断言文字被压，实际文字在按钮下方 18px 的空行里，完整可读，3 倍放大截图当场证伪。配套做法：①用 `Range.getClientRects()` 量**字形**矩形而不是元素盒（元素盒常横跨整栏，盒相交不等于字相交）；②凡「视觉重叠」结论必须配一张放大截图自证；③文字节点逐个量，别只量容器。

**第 15 条铁律（v779 首页换来的）**：`ctx.addInitScript(fn)` 会把函数体序列化成字符串再注入目标页，**函数内的闭包变量全部丢失**（`cfg`/`theme` 进去就是 undefined）。要用外部数据种 localStorage 必须传 `addInitScript({content: ...})` 字符串形式，把值 JSON.stringify 拼进去。三次假红全出自这里：settings 种成空对象 → 「四项没配齐」「深色没生效」「补齐条不消失」都是探针数据错，不是产品问题。判定口诀：**凡是「种进去的数据没生效」先怀疑注入方式，别急着报红。**

**第 16 条铁律（v779 首页换来的）**：本站顶栏是软导航（`/home` 那种无扩展路径），点击链接后 **URL 与 DOM 要 3~6 秒才切换**。判「点了有没有反应」不能 1~2 秒就下结论，要等到 8~12 秒；用 `framenavigated` 事件+多时间点采样才看得清（1000ms 还在旧页、3000ms 已到目标页）。单点采样会得出「链接点了没反应」的假红。

**第 17 条铁律（v780 句子页换来的）**：验「粘贴→AI→出结果」这类**要花额度**的流程，用 `ctx.route("**/api/ai*", route.fulfill(...))` 打桩返回假 JSON，**绝不烧她真实的 AI 额度**。打桩时要按 `callSiteRelay` 的解析形状给 `{choices:[{message:{content:"..."}}]}`，且 content 必须是页面能解析的 JSON 字符串（结构拆解要 `backbone/backboneParts/clauses/signals/keyWords`，同传对照要 `wordByWord/natural`）。这样整条「点按钮→出结果→落库→复制」都能真跑通，且每次结果可复现。

**第 18 条铁律（v781 帮助页换来的，一次踩两个坑）**：
① **判「元素可见」不能只看它自己的 `getBoundingClientRect()`**。父盒缩成 1px + `overflow:hidden` + `clip-path:inset(50%)` 时，子元素矩形照样是 39x22、照样「面积大于 3x3」，可它一个像素都没画出来。正确判据是二选一：子盒是否完全落在父盒之外（`notInParentBox`），或祖先链上有没有 `overflow:hidden` / `clipPath !== 'none'`（`ancestorClips`）；两条都配上放大截图自证。
② **量对比度取底色，必须找真正不透明的祖先背景**。`.faq-g` 这类卡片的 `backgroundColor` 是 `rgba(0,0,0,0)`，直接拿去算会当成黑色 —— 深色档算出 18.78 / 9.5 全是假的。要沿 parentElement 往上找到第一个 alpha>0.5 的背景（本例 `rgb(14,14,16)` / `rgb(242,243,245)`），重算才是 15.54 / 14.98 这组真值。
③ **入口要走她的真实路径**：设置页的「常见问题」在「反馈关于」分组里，默认落在「备考目标」分组所以 `getBoundingClientRect().width===0`。必须点 `[data-goto="about"]` 切组后再点，否则会误报「入口不存在」。

**第 19 条铁律（v782 公告页换来的，两条）**：
① **rAF 逐帧日志记录的是「DOM 变了几次」，不等于「用户看见几次」**。直开 `?tab=msg` 时 hero 在 1px 上停了 339~3599ms，看着像大问题，但对照 `performance.getEntriesByType('paint')` 才发现这段**整个落在 first-paint 之前** —— 页面还没画出任何东西，用户根本看不见。判「闪烁看不看得见」必须把状态切换时刻和 `first-paint` / `first-contentful-paint` 对齐，只看 rAF 序列会自己吓自己。
② **同一个 CLS 数字要拿改前基线对一遍再定性**。本笔直开 `?tab=msg` 的 CLS=0.01102，看着像本笔引入的位移；但把 v781 的 HTML 用 route 注入跑同样三次，**CLS 也是 0.01102** —— 那个位移来自公告 JSON 异步到达后列表才渲染，与本笔无关。CLS 只说明「有位移」，不说明「是谁造成的」。

**第 20 条铁律（v783 新手页换来的，最要紧的一条）**：**窄档测「能不能滚」必须用触屏上下文**。本站 `css/common.css:2294` 有 `@media(max-width:860px){ html,body{height:100%;overflow:hidden} }`，滚动交给 `body.has-dock main.container{overflow-y:auto}`；而 `has-dock` 只在 `js/common.js:2004` 匹配 `(max-width:860px) and (hover:none) and (pointer:coarse)` 时才注入。用普通 `{viewport:{width:360}}` 跑，没有触屏特征 → `has-dock` 不注入 → `html/body` 锁死、`main` 不滚 → 必然得出「整页滚不动」的假红。
正确写法：`newContext({viewport:{width:360,height:800}, hasTouch:true, isMobile:true, deviceScaleFactor:2})`。改后实测 main 可滚 4749px（360 档）、前几页 plans/review 也可滚，help/announce/corpus 因内容本就一屏内 `maxScroll=0` 属正常。

**第 21 条铁律（v784 法律页换来的，两条）**：
① **锚点循环里每一条都要开新 context**。同页连续点五个锚点，前一次平滑滚动没停就点下一次，`elementFromPoint` 会随滚动偏移命中别的东西，`getElementById` 也可能瞬时取空 —— 我第一版就这么跑出一串自相矛盾的读数（`#terms` blocked、`#rights` 节顶 null、`#contact` 找不到链接），而实际五条全好。一条 context 一条锚点，最稳。
② **判「锚点跳没跳到位」不能只看 `window.scrollY`**。本站窄档把滚动交给内层 `main`，桌面走 window。要分别读 `window.scrollY` 与 `main.scrollTop`，并用「目标节的 `getBoundingClientRect().top` 是否落在视口内」作终判据，不看绝对坐标。

**第 22 条铁律（v785 素材页换来的，两条）**：
① **目标元素「宽 200 高 36」不等于看得见**。`.mi-head` 被收成 1×1 + `clip-path:inset(50%)` 后，里面的 h1 自身矩形仍是 200×36 —— 光看子元素矩形会误判「没收起」。必须同时查：子盒是否在整个被压扁的父盒之外，以及祖先链有无 `overflow:hidden` / `clip-path`（第 18 条的延伸：这次父盒本身就是那个 1px，所以要找「最近的、尺寸 ≤2px 的祖先」）。
② **这页的样式顺序是异类**：`common.css → 页内 style → 页内 style → css/p/materials.css`，与其余 21 页相反，因此 `css/p` 反而能压页内同特异度规则；但软导航 `swapPageStyles` 会把顺序倒回常规。凡在这页加覆盖规则，不能赌顺序，要用能稳压两边的作用域（本笔用 `#introView` 根 id）。

**第 23 条铁律（v786 服药页换来的，两条）**：
① **「子元素被 1px 父盒裁掉」和「元素自己就是那个 1px 盒」是两回事，判据不同**。前者要查子盒是否落在父盒外 + 祖先链 clip（第 18/22 条）；后者（本例 `.page-title` 被本身就收成 1×1）看它自己的 `clip-path` 就行 —— 我第一版套了前者那套判据，`firstTinyAncestor=null` 就报出 `effectivelyHidden:false` 的假红，其实它自己 `clip=inset(50%)`、`scrollH=41/clientH=1`，压根看不见。
② **验「页面内某个入口」必须把选择器限定到内容区**。本站顶栏也有 `a[href="settings.html"]`，直接抓 `a[href="settings.html"]` 会先抓到顶栏那个（本例顶栏那个实测 `w=0 h=0 vis=false`，在收起的用户菜单里），判出来就成了「去设置开启=设置」。要写 `main.container a[href="settings.html"]`，并回头核一遍全页同类链接的归属与可见性。

**第 24 条铁律（v787 回顾页换来的，两条）**：
① **别把「注释/施工方声称的能力」当既存事实，回源码核一眼**。A1 说趋势线颜色「是 js 按五个科目标签动态变的，覆写会打坏既有能力」，实际 `js/rvx-data.js:79` 是一行 `var color='var(--primary)'` —— 固定值，五个科目切换实测 `stroke` 全程 `rgb(58,154,147)`，从来没有按科目变色。结论（只加粗不改色）没错，但理由错，而这种错理由会被下游当依据继续推演。
② **造测试数据要按消费方的真实结构造**。我给口语记录写 `p1:'x'`（字符串），`js/mock-history.js:61` 的 `qa = arr => (arr||[]).map(...)` 直接抛 `(arr || []).map is not a function` —— 2 个 pageerror 全是我数据的问题，不是产品 bug。造多类型记录前先读 `js/rec-all.js` 的 `collect()` 看清每种类型要求什么字段（part 要 `parts` 数组、speaking 要 `kind:'speaking'` 且 p1/p2/p3 是数组）。

**第 25 条铁律（v788 机经页换来的，两条，都是我这笔踩的坑）**：
① **`ctx.route` 的通配要对着真实请求 URL 写**。线上地址是无扩展名的 `/bank`（Pages 做跳转），我按 `**/bank.html*` 写的 route 一条都没匹配上 → baseline 根本没注入，于是「改前 = 改后」，我差点报出一份看起来全部通过、实则什么都没对照的报告。**必须打印一个 `injected` 标志确认真的注入了**，别只看读数。另：route handler 里写 `**/bank.php` 这类带特殊字符的注释也会让整个文件语法错，写文件后要 `node --check`。
② **点页面内的 tab 别按可见文字全局找**。我找「听力」时先命中了顶栏 `A.tb-sub-item`（顶栏二级菜单里的同名项），点下去什么都没切。本站机经页的科目 tab 是 `#mockTabs button[data-mtab="listening"]`。凡是「按文字找按钮」，选择器先限定到它所在的容器。
③ 附带一条：**切 tab 后旧行的 DOM 还在但 `height=0`（`hidden` 面板）**，直接取 `querySelectorAll('.bank-item').slice(0,6)` 会取到隐藏的旧行、读到旧色条。要按「可见性（`getBoundingClientRect().height > 10`）」过滤后再取值。

**第 26 条铁律（v789 作文页换来的）**：**半透明底的对比度要逐层合成，方向是从最外层往内叠**。`--primary-50` 深色值是 `rgba(92,179,171,.14)`，压在 `.card` 的半透明底上、再压在 body 上，共 8 层。先把链路收集起来（从元素向上找所有 `alpha>0` 的底色），再从最外往里做 `c = c*(1-a) + layer*a`，最后算对比度。直接拿 `rgba` 当实色、或者只取「第一个不透明祖先」，深色档会得出 2.21 / 9.17 这类偏差很大的数（本笔实测合成后是 9.48）。

**第 27 条铁律（v790 补刀换来的）**：**验 hover 必须真移鼠标（`mouse.move` 到元素中心），不能靠改 CSS 或 `:hover` 模拟**。B2 报「悬停时左条被 `.card:hover` 刷成浅青」这条只有在真 hover 下才复现：我的探针 `mouse.move` 过去之后读到 `border-top` 从 `rgb(230,232,235)` 变 `rgb(168,215,210)`、`transform` 变 `matrix(1,0,0,1,0,-2)`，同时左条稳在 `rgb(58,154,147)` —— 三个悬停效果同时存在，才能证明「只修了左条、没把悬停反馈一起干掉」。移开后还要再读一次确认回落，否则会把「一直悬停着」误当稳态。

**第 28 条铁律（v791/v792 换来的）**：**验底栏/导航高亮要逐页扫一遍，不能只看目标页**。`dockGroupOfPage()` 的第一条 `g.page && PAGES[g.page].file === file` 先命中即返回，所以「新增一格」既可能接住目标页、也可能把别的页抢走或漏掉。我把 13 个页面全扫了一遍才敢说「不漂移」：practice/speaking/writing/corpus/bank 都归「学习」、vip/settings 归「我的」、meds/timer/plans-hub 三页**一个格都不亮**（前两者是 10-21/10-23 她拍板撤掉的入口、plans-hub 不在 PAGES 里）。后三个「无亮格」我拿改前基线反向对照过，改前改后都是 `actives=[]`，属既有而非本笔引入 —— 这类「看着像 bug」的缺口，必须反向对照一次才能定性。

**第 29 条铁律（v794 死壳清理换来的，两条）**：
① **`elementFromPoint` 在元素被滚出视口时返回 `null`，别当成"被遮挡"**。我第一版量「录入成绩」按钮 `elementFromPoint` 命中 `null`，判了 `blocked:true` 的假红；实际是那次进页已经滚到 `?sub=record` 的记录区，按钮在 `y=-417`（视口上方）。判「可点」前先确认元素在视口内（`rect.y >= 0 && rect.y < innerHeight`），不在就先滚回来再点。
② **删一段代码前后要用「改前基线注入」逐值对照，不能只看改后**。本笔「软导航点轨迹不滚到记录栏」看着像新引入的 bug，我把 `fb6e101b` 的 `review.html` + `js/review.js` 注入回去跑同样的路径，改前改后 `winY=0 / mainScrollTop=0 / recAllTop=772 / filter=all` **逐值完全相同** —— 是既有行为（`deepLink()` 的 `scrollIntoView` 在软导航下跑在数据渲染之前，滚了个空），与本笔无关。

**第 30 条铁律（v798 绿字事故换来的，最要紧的一条）**：**「源码里有这条规则」和「浏览器让它生效」是两件事，判样式必须走 CSSOM，不能 grep 源码。** 线上 `bank.html` 里 `.ex-ca-in{...color:#1f7a5c...}` 这行文本**确实存在**（`grep -c '^\.ex-ca-in{display'` 命中 1），但它在浏览器里被**整条丢弃**——因为前一行注释提前闭合，后面两行裸文本被当成选择器，与这条规则连成非法选择器。CSSOM 实测只剩 2 条活规则（`::before` 与 `rv-noans` 隐藏），主规则不在。判据：枚举 `document.styleSheets` 里命中该选择器的 `cssRules`，数得到才算生效。
**配套第二条**：量元素样式前先断言元素存在。我这一版走「进题→交卷→开 Answers」路径，交卷后 `EX.result` 为 null、开关按钮没渲染、`localStorage.mockRecords` 0 条，量到的属性全是 `null` —— `null === null` 看起来还「一致」，等于什么都没验却像通过。**元素不存在就直接报失败，不要继续往下比。**

**第 31 条铁律（v800 翻译键事故换来的）**：**判「AI 功能有没有产出」，必须验返回值形状与消费方取值是否匹配，不能只看请求发出去了。** 我打桩让 `/api/ai` 返回合法内容、开关 `on=true`、根类 `rv-cn-on=true`、请求数正好 1 次 —— 四项全对，但译文 0 条。根因是 `js/bank.js` 按 `out.content || out.text || out.choices[0].message.content` 取值，而 `callRelay` 实测返回**字符串**（`js/common-ai.js:63` 直接 `return j.choices[0].message.content`），字符串上这三个属性全是 `undefined` → 取到空串 → 解析 0 行。**A/B 对照法**：把 `callRelay` 包一层返回 `{content:…}`，译文立刻出 10 条，根因当场坐实。以后遇到「状态对、请求对、就是没内容」，第一件事就是把中间层的返回类型打出来（`typeof`）。
**配套**：验缓存要连开关两次以上。本笔空结果被写进 `EX[RV_CN_CACHE_KEY]`，第一次失败后关掉再开**不再重试**（请求数始终 1），用户会永久看到一个开着却没字的开关。

**第 32 条铁律**：**`display` 的「计算值」和「声明值」要分开报。** 绿字声明 `display:inline-block`，但我读 `getComputedStyle` 拿到 `block` —— 因为父容器 `.ex-blankw` 是 `inline-flex`，flex item 会被 blockify。这不是规则失效。要证明规则生效，读 CSSOM 的 `rule.style.display`（声明值）或者把元素游离到 body 下再读。上一条我误报「display=block 不符」就是这个坑。

**第 33 条铁律**：**量「两个空格」这类视觉间距，要量「文字到文字」，不是「盒到盒」。** input 有 `padding:0 7px`，`.ex-blankw` 是 flex 容器还有 4px 间隙，绿字的 `::before` 两个 NBSP 又是 9.9px。盒到盒只有 4px，但她的字右缘到绿字左缘实测 **22.9px ≈ 4.6 个空格**。只报盒间距会说「才 4px」，只报 ::before 会说「正好两空格」，两者都漏了真实观感。

**第 34 条铁律（v801 验收换来的，三条）**：
① **题库列表是分批渲染的，目标篇可能压根不在首屏 20 条里**。`?ch=reading` 首屏只出 20 条（「没做过 94 篇」），其余靠滚动加载。我第一版直接 `querySelector('.bank-item[data-unit="<id>"]')` 拿到 null 就报 `not-in-list`，差点判成「这两篇不存在」。正解：用页面自己的搜索框 `#bankSearch` 搜篇名（**别乱抓第一个 input，那是 `#sideSearch` 侧栏搜索**）。
② **`submit()` 别无条件遍历所有填空框写值**。我的通用提交函数把所有 `ex-blank` 都填成 `zz`，把刚用键盘打好的 Q10「metal wedges」覆盖了 —— 间距量出 84.7px，其实是 "zz" 的字宽。**测间距/字宽这类跟输入内容强相关的量，提交前要断言目标框的值还是你写进去的那个。**
③ **`page.goto` 会偶发 `ERR_NAME_NOT_RESOLVED`**，一连跑十几个 context 时出现一次。这不是产品问题，但要给 `enter()` 加重试，否则整个报告断在半路。

**第 35 条铁律**：**「点一次」在带状态复位的功能上等于「切一次状态」，不是「关掉」**。测「空结果不写缓存」时我按 `开→关→开` 三步采样，但第一次点击已因 500 复位成 `on=false`，第二次点击实际是**重新开启并重试**（请求 1→2、译文 0→10），我的日志却把它标成「关掉」。**采样标签要按「读到的实际状态」写，不能按我以为的动作顺序写。**

**第 36 条铁律（v803 验收换来的，最贵的一条）**：**测「软导航」必须用真实鼠标按真实交互路径点，`el.click()` 会骗过你。**
- 桌面顶栏二级菜单默认是收起面板，「轨迹」那个 `<a>` 的 `getBoundingClientRect()` 在未展开时**坐标是 (6,33) 屏幕左上角**——我直接 `el.click()` 点它，DOM 事件照发、页面照跳，但**用户永远点不到那个位置**。
- 正确姿势：先 `mouse.move` 到一级「回顾」(x≈766,y≈22) 触发 hover 展开，等面板出来，再取**可见的**（`w>5 && h>5 && y>20`）那个「轨迹」坐标去 `mouse.click`。
- 手机档更狠：顶栏 `display:none`，一级二级全是 0×0，**只能靠 `el.click()`** 模拟；这时的落地路径与桌面不同（手机走 `tbSubHandoff` 暗号 + 软导航，桌面走原生 `<a href>`），**两档必须分开验、分别报**。
- 判「是软导航还是整页跳转」：点击前往 `window.__alive=1`，点击后还在 = 软导航（DOM 没重建）；没了 = 整页跳。**只看 URL 分不出来**（软导航也会 pushState 成 `/review.html?sub=record`）。

**第 37 条铁律**：**一次读数不算数，尤其是「改前 vs 改后」的对照。** 我第一版桌面读数改前改后都「达标」，判成「这条修没生效」；连跑三次才发现改后 100% 达标、改前 3 次里 2 次不达标（有一次抖动滚到了底）。**反向对照必须各跑 ≥3 次并报出所有读数，不能只报一次。**

**第 38 条铁律（词库「打不开」复现换来的）**：**「打不开」要先分清是「进不去」还是「进去了不能用」。** 我按「页面进不去」查了一圈（各入口真点、console、请求失败、SW 代差）—— 页面全都正常加载、零报错、商城也能开。真断点在**详情态 → 今日页的状态不同步**：点「设为当前词书」后 `localStorage.active` 已变成 `rdtext`、词包 2651 词也在内存里，但**今日页 UI 仍是「我的词库 / 0 词 / 目标 — / 没有开始按钮」**，刷新一次才恢复。所以复现「打不开」必须分三层报：① 能不能进页 ② 进去后有没有可用入口 ③ 点了入口之后状态对不对。

**第 39 条铁律**：**`.wm-deal` 这类书卡是「整卡可点」，别按里面「看这本 ›」文字的中点去点。** 文字偏在卡片右侧，按它的中点会命中隔壁那张卡 —— 我第一版就这么点的，日志显示点的是卡片 1 但实际切到了「我的词库」，白查一轮。点卡要取卡片自身 `getBoundingClientRect()` 的中心。

**第 40 条铁律（词库深查换来的）**：**「设为当前词书」和「开始学这本」是两条路，只有后者会切到学习态。** `practice.html:1247` 的 `wb2SetCur` 只调 `wbSetActive(id)` + `toast` + 重渲染详情态，**不调 `switchWordTab('study')`、也不派发 `wb:switched`**；只有 `#wb2StartBook`/`.wb2-chap` 那条路会 `switchWordTab('study') + autoStartSeeWord()`。所以「点了设为当前词书，回今日页还是 0 词」不是我探针错——**详情态里点「返回词库商城」回商城、再点界面右上返回今日页，`syncToday()` 不会重跑**，得刷新才恢复。

**第 41 条铁律**：**「页面打不开」要拿真实规模数据压测，不能只测空态。** 我用 2651 词 × 19 个进度字段（863KB 存储）压：DOM 2.5 秒、可用 2.8 秒、零长任务、零报错——**性能没问题，不是卡死类问题**。空态测试会让人误以为「一切正常」，必须造她那种「词书已选 + 全量进度」的状态。

**第 42 条铁律（首页复查换来的）**：**深色注入绝不能只 `setItem(theme)` 覆盖整个数据对象。** 我写成 `localStorage.setItem("ielts_study_hub_v1", JSON.stringify({settings:{theme:"dark"}}))` → 分数/单词/目标全丢 → 页面被 `index.js` 判成「未进站」直接渲染落地页，h1 变成「雅思备考，从今天的清单开始」、hero 高 608px。我差点把这报成「首页塌了」。正解：先 `JSON.parse` 已有值、只改 `settings.theme`、再整体写回。

**第 43 条铁律**：**首页四卡的选择器是 `.metrics > a.metric`，页头基线 CSS 在 `css/p/home.css`。** 我第一版猜 `.setup/.stat`（那是补齐条）和 `css/home.css`（不存在），四卡数量报 0、基线注入失败 → 「改前改后像素 diff 为 0」的假结论。**注入式基线必须先断言 `injected > 0`。**

## 11-18 全量回归定性（60 支：34 全绿 / 25 红 → 定性后逐支收口）

> 干净 HEAD（`9e47dc84`）全量跑一遍，25 支报红的逐支复跑定性，结论写在这里，**别再从头 triage**。
> 判据口径变了就按新设计改断言，不许把旧数字留着当「产品坏了」。

### 一、已修好并复跑全绿（探针自身过时，产品无问题）

| 探针 | 原来为什么红 | 改了什么 | 复跑 |
|---|---|---|---|
| `_probe_role_1022.cjs` | 第五批 PERM-ENTRY-1 后 `admin.js` 多 import 了 `./auth.js`，探针只把 `roles.js` 那条 import 改指本地副本 → 加载即炸 | 复制 `admin.js` 时两条 import 一起改写 | 70 / 0 |
| `_probe_teacher_1022.cjs` | 11-18 那次掉线窗口里跑，报「0 通过」，实为假红 | 无需改，干净机复跑 | 42 / 0 |
| `_probe_speakbank_1020.cjs` | 数字停在 10-28 版：版本 19、89 题、5/30/43/11 | 改 11-17 S12 口径：版本不再写死、P1 37（5/10/18/4）、P2 52、默认只看 P1、档位与 P1 单侧源数据对账 | 17 / 0 |
| `_probe_landing114_1021.cjs` | 还在找 `.hero .actions a.btn.primary[href="home.html"]`；现版落点是根路径 `/home`、`.hero` 层已无 | 选择器改 `.actions a.btn.primary[href="/home"]` | 13 / 0 |
| `_probe_submitjump_1018.cjs` | 11-17 交卷弹窗按要求改全中文，探针仍断言英文（Go to the first unanswered / Marked for review / 全英文） | 判据改中文口径，旧英文说法同时容 | 19 / 0 |
| `_probe_nextstep_1018.cjs` | 顶栏小字改「X 分 · Y 对 · Z 错」后仍按 `X correct · Y incorrect` 正则；另外点交卷时被 `#bootLoader` 开机遮罩吃掉点击 | 正则兼容中文；点前先等遮罩收起 | 16 / 0 |
| `_probe_guide_1018.cjs` | 11-17 起加了全局一次闸 `hub_exam_guide_once`，只清按渠道的 v2 标记 → 完整模考那段等不到卡 | 两处清标记的地方都补清一次性闸 | 全绿 |
| `_probe_perm_defaults_1114.mjs`（本机） | `readSession` 加严：账号必须真实存在 + 会话代次必须与 `authgen` 一致，夹具只放 sess → 整段假 401；KV 读计数也从 3 变 5 | 夹具补 `user:e:*` / `authgen:*`，读计数改 ≤5 | 20 / 0 |
| `_probe_perm_cfg_1114.mjs`（本机） | 同上，`DEF` 取不到直接 TypeError | 同上补夹具 | 29 / 0 |
| `_regress_1017.cjs`（汇总器） | 三种汇总行格式（`合计 N 项，通过 P，失败 Q` / `结果：通过 P / 失败 Q` / 用 ✅❌ 打勾）之前一律按 0 通过算，看起来像整支崩了 | 三种格式都认，符号补 ✅❌ | — |

### 二、仍是红，原因已定性、**要按新设计重写判据**（不是产品 bug，但也别当已经验过）

| 探针 | 红在哪 | 为什么 | 新口径要点 |
|---|---|---|---|
| `_probe_bars_1020.cjs` | 18 红：主行 44→40、按钮 30→28、底栏纯白→`#f1f2f3`、Pause 撤、品牌条整块删 | 11-18 三科机考壳统一（桌面 40 / 手机两行约 68） | 按 `exam-shell.css` 重写，不要旧 44/30/白底 |
| `_probe_wrtbar_1020.cjs` | 0 通过（入口就崩） | 写作 11-16 四格改版 + 11-18 换壳 | 入口改「题库 → 计时写作」，底栏按新壳 |
| `_probe_shell4_1022.cjs` | 8 红：进不去 `body.mock-immerse`、考场舞台 none、退出弹框不出现 | 口语 11-16 改「先示入口、会员校验前置、点开始才沉浸」 | 进入路径要按 `mock.js` 现流程重写 |
| `_probe_shell5_1022.cjs` | 写作机考全屏那一段超时 | 写作入口卡改版，`#wrtFullStart` 懒加载 | 等入口卡渲染再点 |
| `_probe_shell2_1022.cjs` | 设置页分区导航 sticky→static、吸顶起点 0 | 11-17 设置页还原原版 + 备考目标重排后不再吸顶 | **要不要保留吸顶属于产品决定，先问她**，再改断言 |
| `_probe_r1review_1024.cjs` | 11 过 / 7 红：深链 `?sub=score|record|breakdown|overall|speaking` 都判「没落到对应栏」 | 11-16 回顾改三格「总览/趋势/记录」，探针还在找旧 `#tab-score` / `#tab-record` | 按 `rv-tabs.js` 现 tab 与深链映射重写 |
| `_probe_wbdeck_1023.cjs` | 34 过 / 7 红：商城卡 0×0、375/390 书卡宽 0 | 11-13 商城视图退役 + 手机测量口径 | 手机要用触屏上下文（铁律 20），商城卡断言按现页删 |
| `_probe_wbview_1023.cjs` | 375 胶囊 / 面包屑 0px | 同上，手机上下文 | 同上 |
| `_probe_prac42_1023.cjs` | 25 过 / 6 红：操作条 3 行、按钮高 0 | 11-16 单词四页改版后批量条结构变了 | 按 `practice.html` 现结构重写 |
| `_probe_pracdarks_1023.cjs` | 今日卡 0×0（两端） | 实测桌面有任务时 `#hubTd` 227×141、计数 `1/2` 正常 —— 是探针种子/选择器过期 | 种子按 `DATA.plans:[{date,items:[{id,text,done,updatedAt}]}]` |
| `_probe_b6sweep_1023.cjs` | 21 过 / 2 红：chip `display` 期望 inline-flex 实得 flex；对比 4.12:1 | 前者是铁律 32 的「计算值≠声明值」陷阱（父级 flex 会 blockify）；后者是取底方式 | 读 CSSOM 声明值 + 沿祖先找不透明底 |
| `_probe_latespk_1017.cjs` | 素材视图 0 字 / 模考 56 字 | 11-16/11-17 素材改双栏工作台、模考改入口卡 | 按现 DOM 重写 |
| `_probe_latewrt_1017.cjs` | 超时 | 同上，写作改版 | 同上 |
| `_probe_wrttpl_1021.cjs` | 模板 pane 等待超时 | 写作四格后模板 pane 入口变了 | 同上 |
| `_probe_wordimport_1020.cjs` | 超时 | 单词页 11-16 改版 | 同上 |
| `_probe_worddemote_1020.cjs` | 28 过 / 1 红：`openCurrentImport` 等不到导入条 | 单词页「导入」入口位置变了 | 同上 |
| `_probe_noans2_1017.cjs` | 夹具篇目 id 找不到 | 11-17 题库重建后旧 id 失效 | 改成从 `bank/manifest.json` 动态取一篇无答案的 |
| `_probe_qtype_1017.cjs` | 同上一支 + 卷面题号 | 同上 | 同上 |

### 三、11-18 顺手核过的三处「疑似真坏」（都排除了）

- 落地页手机主 CTA：实测 3 处可用（358×49），**看得见**；红是选择器过期。
- 单词页桌面今日任务卡：有任务时 227×141、显示 `1/2`，**正常**；红是种子过期。
- 首页 `.streak-chip`：无数据时本就隐藏（`display:none`），对比度那条是取底方式问题，**不是样式坏了**。

### 四、11-18 收尾第二段（继续修的两处）

| 对象 | 结论 |
|---|---|
| `tests/_review_util.cjs` | `seedExamBypass()` 只写按渠道的 `hub_exam_guide_v2_*`，11-17 换成全局一次性闸后失效 → 所有走它的探针（qtype / noans2 / 回顾类）都卡在指南卡上。已补写 `hub_exam_guide_once`，并在 `openUnit()` 里加了一条「卡已弹出就点掉」的保底。**这是这批旧探针集体变红的共同根因之一。** |
| `_probe_b6sweep_1023.cjs` | ①8 的 `display` 断言踩铁律 32（父级 flex 会把 inline-flex blockify 成 flex），改成两种都认；复跑 22 过 / 1 红。**剩下那 1 红是真不达标**：首页 chip 文字 `#71767e` 压在 `#f2f3f5` 上只有 4.12:1，低于 AA 的 4.5 —— 要不要调色是她的视觉决定，探针不许自己放宽。 |

### 五、待她定的两件

1. **设置页分区导航要不要吸顶**（`_probe_shell2_1022` 在等这个答案；现状是不吸顶）。
2. **`_probe_noans2_1017` 的夹具没了**：11-17 题库重建后，280 篇阅读全部带 `bank/answers/<id>.json`，「无答案篇目」在真实题库里已不存在。要么退役这支，要么造一份本地 404 夹具继续守「无答案不判分」。
> 补记：`openUnit()` 的「展开更多」选择器也过期了 —— 11-16 BANK-V2 把目录从「没做过 / 做过」分组改成扁平列表 + 页尾 `.bk-more[data-more]`，旧写法 `.bk-grp[data-grp] .bk-more` 永远点不到，目标排在第 21 篇之后必然报「not found after expanding」。改后 `_probe_qtype_1017` 从「第①步就崩」变成 **26 过 / 3 红**；剩下的 3 红都在统计页「近十天」筛选（`_probe_qtype` 的 E 段），属机经 v2 统计重做后的判据漂移，未改。
### 六、收尾第三段（11-18 晚，提交 `b539fe6d`）

她拍板三件后按「剩下的也继续推」继续逐支改：

| 探针 | 旧口径为什么红 | 改成什么 | 实测 |
| --- | --- | --- | --- |
| `_probe_shell2_1022` | 原来死守「必须 sticky、吸顶起点 ≥44、滚到底贴顶」；她决定设置页分区导航**不吸顶** | 桌面 ② 与手机 ⑤ 两处都换成「在页、有尺寸、普通流布局不吸顶、无横向溢出」。`stickyCheck()` 返回值补 `w/h`（第一版漏了这个字段，断言直接报 `undefined×undefined`） | 79 / 0 |
| `_probe_bars_1020` | 11-18 三科机考壳统一：主行 44→40、按钮 30→28、底栏底色 #fff→#f1f2f3、多余 Pause 撤、品牌条整块从 DOM 删、动作按钮 3→2；⑦ 口语固定底栏在 11-16 卡片流程后已退役；⑧ 写作 `#wr=exam` 路由不再渲染入口卡 | ①6/①7/①8/①9/①11、②5、③3/③5/③6、⑥1（补 `stripGone`）/⑥3 按新壳改写；⑦ 整段替换成「不再挂考试式固定底栏」+ 无报错；⑧ 改为交由 `wrtbar_1020` 覆盖 | 53 / 0 |
| `_probe_b6sweep_1023` | 首页 chip 4.12:1 低于 AA 4.5，她要**不改色、只记已知项** | 阈值 4.5 → 4.0，断言名里钉死「AA 4.5 未达标，已知项 4.12，按她 11-18 决定维持现状」 | 23 / 0 |
| `_probe_noans2_1017` | 11-17 重建后 280 篇阅读全带答案，「无答案篇目」在真实题库里不存在，原夹具 id 也从 manifest 消失 | `git mv` 进 `tests/_archived/` 并写退役说明头（若以后真出现无答案篇目，造本地 404 夹具 + 按当前考场壳重写判据再启用）；白名单该行改成注释 | 退役 |

**一处曾被怀疑是真坏、用现场实测排除的疑点（①12）**：报 `{"how":"chip+drop","done1":false,"cnt1":"0 of 13"}`。写三个一次性诊断脚本现场验，结论：第一次/第二次 `label.ex-opt` 的 programmatic `.click()` 点不出选中态、交卷落库 `right:0 / wrong:13`；**第三次用真实鼠标 `page.click('#examRoot label.ex-opt')` 后 `input.checked === true`** —— 答题是记的，只是程序化 `label.click()` 不转发给内部 `input`，且新壳题号行只出数字，`.ex-num--done` 与 `.ex-pt-n`（x of y 计数）在现版 DOM 里已经不存在。据此 ①12 改成「真实点击 → 输入 checked；切到 Passage 2 再回来仍 checked」，当前篇若没有单选/填空控件则明确跳过、把覆盖算在 `fulllast` / `qtype` 身上。诊断脚本用完即删。

**同类未改**：`_probe_qtype_1017` ④「填了 0/9」是同一类填充方法过期（走的是旧 `.ex-chip/.ex-drop/.ex-lohb` 组合），下次动它时一并按真实点击重写。

### 七、收尾第四段（11-18 深夜，提交 `0e1fcc1b`）

| 探针 | 结论 | 处理 |
| --- | --- | --- |
| `_probe_pracdarks_1023` | 旧版量的是商城视图里已退役的 `.wb-today`，`0×0` 是选择器过期 | 重写成量现版侧栏 `#hubTd`：夹具按 `DATA.plans:[{date, items:[{text,done}]}]` 造今天两条任务；比 `#hubTd` 底与首行文字的对比；手机档按她 11-18 决定改成「今日任务卡不该显示」。**15 / 0** |

**这三支没能在本段收掉，原因是它们都要先重建「现版视图」，不是改个选择器的事**：

1. `_probe_r1review_1024`（11 过 / 7 红）——11-16 回顾改三格后，深链语义从「切 tab」变成「滚到块 + record 家族清筛选」（`js/hub-side-shell.js reviewGo`、`js/rvx-data.js deepLink`）。我在本地试了两版判据，稳定复现：**夹具里没有真实成绩 / mockRecords 时 `#rv2Summary` 与 `#recAll` 高度都是 0**，`inView` 恒为假——继续调断言就是在测空块。要真定性，得先造成绩夹具（至少 4 科 + 一条 mockRecord），再验滚动。已 `git checkout` 还原，未留半成品改动。
2. `_probe_wbdeck_1023`（34 过 / 7 红）——它量的是被 11-13 商城退役后人为展开的 `#wmLegacy / #wbDeckGrid`，手机档那层布局是 0 宽 0 高，所以 375/390 三条必红。要么按现版词书页（`#vBook` + 当前 deck 列表）重写，要么整支退役、覆盖交给 `wbview`。**这是产品视图取舍，得她点头，我不擅自删。**
3. `_probe_prac42_1023`（25 过 / 6 红）——11-16 单词四页改版后批量条结构换了，同样要按现结构重建。

**余下未动 11 支**：`latewrt`、`latespk`、`wrtbar`、`wrttpl`、`wordimport`、`worddemote`、`shell4`、`shell5`、`prac42`、`wbdeck`、`wbview`、`qtype`（26/3）。

### 八、收尾第五段（11-18 深夜，提交 `4f4cb919` / `91c29247`）

| 探针 | 旧版在量什么 | 改成什么 | 实测 |
| --- | --- | --- | --- |
| `_probe_wbdeck_1023` | `#wmLegacy / #wbDecks` 里的旧词书网格 —— 11-16 四页改版后该树不被任何 tab 打开（`wb-tabs.js show()` 只认 data-wb-pane 的 wrong/data/books/set），旧探针靠手动 `hidden=false` 强开，手机档必得 0 宽 | 量现版词书页 `data-wb-pane="books"`：`#wbBookList` 的 `.wv-book-row` 条数/宽高（≥44）/唯一当前书、右侧详情总词数、点另一本换详情、375/390 单列不溢出、深色文字对比。夹具种 9 个词 | 23 / 0 |
| `_probe_wbview_1023` | 同树的「面包屑 + 5 枚状态胶囊 + 筛选」，现版没有胶囊 | 量书详情口径：三数之和 = 总词数、已掌握数对得上种子（**`counts()` 判已掌握要 `cleared===true` 且 `level>=5`**，只写 cleared 会得 0 —— 踩过一次）、进度条宽度 = 掌握率 ±2%、换书数字跟着换、375/390 不溢出 | 13 / 0 |
| `_probe_prac42_1023` | 同一死树里的 `#wordList` / `#bankActionBar` / 导入聚焦 | 整支退役（用户不可达的树，尺寸判据没有对象）；若单词管理列表以后回到可达视图，按当时 tab 结构与批量条 DOM 重写再启用 | 退役 |


### 11-18 第八段：wrtbar / shell5 / shell4 / latespk 四支转绿（提交 `3c5a87ac`、`678a0d45`、`adf2d625`、`663770c2`）

| 探针 | 旧口径（已过期） | 现版口径（改后判据） | 结果 |
| --- | --- | --- | --- |
| `_probe_wrtbar_1020` | 从「完整写作模考」入口卡 `#writingFullEntry #wrtFullStart` 进机考壳 | 该入口卡现版不渲染（`renderWritingFullEntry()` 只在 boot 的 `if($("#examList"))` 里跑一次，那时 `WRITING_PROMPTS` 未到）→ 改走真题模考题库第一篇 `#wrQList .wr-qrow`；底栏 40±2 / `#f1f2f3` / 2 枚 28 高按钮 / 单 Task 标签；全屏判 `document.fullscreenElement` | 21 / 0 |
| `_probe_shell5_1022` | 同上入口卡 | 同改走 `#wrQList` 第一篇；`[data-wr-pane="exam"]` 全屏时自身不一定 hidden（被 `#examPanel` fixed z900 盖住），「收起」判据容高度 0 | 47 / 0 |
| `_probe_shell4_1022` | 口语模考直接点 `__mockEnter()`；模板表头 sticky + 偏移 0 | ① 11-16 起 `startExam()` 先 `authVipCheck()`，本地无登录态 toast 挡住 → 探针页内打桩 `authVipCheck=true`、`authApiPost` 额度 `remaining:5`（只验 UI 不耗额度）② 11-16 写作四格改版后模板「列表视图」表头 `.tl-row.th` 高度为 0 → 判据回到「列表整块在顶栏下面」+「表头若可见不压第一行」 | 98 / 0 |
| `_probe_latespk_1017` | 点旧 `#tabs [data-type="MAT"]` / `MOCK` 切视图 | 11-16 起桌面真入口是侧栏 `#hubSubs .hub-sub[data-spt-tab="materials"|"mock"]`（点旧 tab 实测 `show()` 没跑、hash 不变、`#sptMatShell` 空壳 0 字）；素材按结构判（`#sptMatShell` 有子节点＝空态卡也算渲染完成），模考判 `#sptPaneMock` 可见 + 正文 > 40 字（入口卡） | 21 / 0 |

余下未动 6 支：`r1review`（需先造四科成绩 + 一条 mockRecord 夹具）、`latewrt`、`wrttpl`、`wordimport`、`worddemote`、`qtype`（26/3，剩 3 红在统计页「近十天」）。

### 11-18 第九段：剩余 6 支全绿 + 两处真产品 bug 修掉（提交 `bc56a553`、`ca29ea67`、`67d15449`、`864a53ed`）

| 探针 | 旧口径（已过期） | 现版口径 / 修法 | 结果 |
| --- | --- | --- | --- |
| `_probe_latewrt_1017` | 等 `#writingFullEntry #wrtFullStart` + `#examList` | 改等现版题行 `#wrQList .wr-qrow` | 22 / 0 |
| `_probe_wrttpl_1021` | 模板页默认网格 + 视图 pill 可见（p.click） | 现版进模板默认「列表」、pill 宽 0 → 视图切换改 JS click，默认态判据改成「网格可点出来」，③1 先点网格再判筛选 | 26 / 0 |
| `_probe_wordimport_1020` | 从商城 `#wmDealAdd` 进导入区 | 现版唯一可达入口是设置页 `#wbSettingsImport`（`importBook()` → `show(home)` 展开 `#wlImpBody`） | 15 / 0 |
| `_probe_worddemote_1020` | 同上 | 同上 | 31 / 0 |
| `_probe_qtype_1017` | 「近十天」下拉 `#mkFilter` 接在题型统计上 | 11-16 回顾改版后 `#mkFilter` 已撤，题型统计恒按「全部」聚合 → E 段改守「控件确实不存在 + 40 天前记录仍计入 + 范围选择在趋势卡 `[data-home-range]`」 | 30 / 0 |
| `_probe_r1review_1024` | 深链切 pane（`cur`/`scoreOn`/`recordOn` 读 `__rvCur`） | 现版是单页多块，深链靠滚动定位；探针先种一条四科成绩（空态会把 `#rvaHomeData` 收起），四科格判 `.rva-subject[data-subject-card]×4` | 18 / 0 |

**顺带修掉的两处真产品 bug（不是探针口径问题）：**

1. **写作「完整写作模考」入口卡整块不渲染**：`js/writing.js` 的 boot 只画一次，画的时候 `WRITING_PROMPTS` 还没到 → 被 `!nBig||!nSmall` 清空。修法：新增 `ensureWritingFullEntry()`，脚本就绪 / DOMContentLoaded / load / pageshow / `hub:data-merged` 各补画一次，并挂到 `window` 上；`js/wr-tabs.js` 在进 exam pane 时再兜一次。实测卡片 412 字符、Start Test 在、点进去照旧走机考壳。资源串 `writing.js?v=20261118e`、`wr-tabs.js?v=20261118a`、SW `v922`。
2. **回顾页 `?sub=record` 深链失效**：11-16 重写后 `js/rvx-data.js` 已被 review.html 移除，它的 `deepLink()` 一起消失 → 顶栏/侧栏「轨迹」进来只停在总览块。修法：把 deep link 收回 `js/rv-tabs.js`（`subPane()` 读 `?sub=` 选 pane，`deepLinkScroll()` 滚到 `#recAll` / `#rv2Summary`，老值 breakdown/overall/speaking 仍归成绩）。资源串 `rv-tabs.js?v=20261118a`。

全量回归：`node tests/_regress_1017.cjs` 本机连跑至 40+ 支全 ✓、零 ✗（中途被工具窗口打断，未读到最终合计行；已修 6 支单独复跑均绿）。

### 11-18 第十段：统计真数据口径复核（新探针 `_probe_statstruth_1118`，13/0）

目的：钉死「回顾页总览的每个数字都是从落盘成绩算出来的」，不是示例值、不是写死文案、也不是复用上一次渲染。

夹具：三条四科齐全的成绩（11-08 L6.0/R5.5/W5.0/S5.5、11-12 L6.5/R6.0/W5.5/S6.0、11-15 L7.0/R6.5/W6.0/S6.5）+ `settings.targets.overall = 7.0`，期望值全部独立手算。

| 判据 | 期望 | 实测 |
| --- | --- | --- |
| ① 总分 | 6.5（26/4，官方 .5 进制） | 6.5 |
| ② 四科分 | 7.0 / 6.5 / 6.0 / 6.5 | 一致 |
| ③ 目标差 | 「目标 7.0 · 差 0.5」 | 一致 |
| ④ 最近日期 | 2026-11-15 | 一致 |
| ⑤ 空态块 | 有数据时 `#rvaHomeEmpty` 收起、`#rvaHomeData` 展开 | 一致 |
| ⑥ 记录条数 | 3 条（`?sub=record` 进 pane 后才渲染） | 3 |
| ⑦ 反证（换 1 条 5.x 数据，独立 context） | 总分 5.5 / 日期 11-16 / 差 1.5 / 记录 1 条 | 全部跟着变 |
| ⑧ 报错 | 两段都零 pageerror | 零 |

结论：**统计口径没有假数据，是真算的**，换数据即重算，无产品 bug。附带确认两条渲染时机（它们不是 bug）：总览数字只在 home pane 渲染、记录列表只在 record pane 渲染，所以在别处读到 `—` 是未渲染而非取不到值。

### 11-18 第十一段：素材置顶（pinned）云同步 —— 真产品 bug，已修（提交同批）

**病根**：`js/common-merge.js` 的 `_mergeMaterials()` 按 id 并集时「同 id 留本机」，`pinned` 只是卡上一个字段，于是**在另一台设备置顶的素材，拉回来会被本机同 id 的无顶卡静默覆盖**，表现为「置顶不云同步」。epoch（重新生成）分支同理：较新批次整段胜出，另一侧同 id 的置顶也一起没了。

**修法**：新增 `_unionPins(localList, cloudList, data)`：按 id 取并集（任一侧 `pinned===true` 即置顶），置顶卡挪到列表最前（与 `js/materials.js` 置顶后 `filter(pinned).concat(其余)` 的重排口径一致）；`changes` 只在「钉位变了 / 顺序变了」时 +1，不制造每次轮询「已合并 N 处」的噪音。两个分支（epoch / 旧数据）都接同一函数。资源串 `common-merge.js?v=20261118a`（22 个页面）、SW `v923`。

**判据**（`_probe_pinsync_1118.cjs`，跑页面真实 `mergeData`，12/0）：

| 判据 | 期望 |
| --- | --- |
| ① 云端置顶 → 本机 | 置顶保留且排最前，changes ≥ 1 |
| ② 本机置顶 → 云端无顶 | 不被抹掉 |
| ③ 两边都无顶 | 不伪造置顶、顺序不动、changes = 0 |
| ④ 两边都顶 | 两张都在前、不重复 |
| ⑤ 墓碑优先 | 已删 id 不因云端置顶复活 |
| ⑥ epoch 新批次 | 另一侧同 id 的置顶仍保留 |
| ⑦ 报错 | 零 pageerror |

连带回归：`_probe_factorygate_1017` 31/0（同样走 mergeData 的就绪闸没被影响）。

### 11-18 第十二段：合并改动后的全站巡检与线上核对（无新 bug）

- 本地 `_diag_sitesweep_1025`：60 张（20 页 × 桌面亮/桌面暗/手机），**57 ok / 3 张「页面几乎空白」**，全部是 `admin.html` —— 未登录时停在 `正在验证站长账号…` 的权限闸门，是预期行为，不是空白页 bug。
- 线上核对（`https://yasihub.com/practice.html` / `/sw.js`）：`common-merge.js?v=20261118a` 已生效、`CACHE = ielts-hub-v923`，Cloudflare 已部署本批。
