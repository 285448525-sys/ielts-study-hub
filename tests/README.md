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

## 根目录清单（74 支）

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
| 在途 | `_probe_rvbottom_1102.cjs` | RV-BOTTOM-23 复盘底部布局三条口径（在途） |
| 在途 | `_probe_rvtop_1102.cjs` | RV-TOP-24/25 复盘顶部布局+用时进顶栏（在途） |
| 在途 | `_probe_rvcolor_1102.cjs` | RV-COLOR-LOGIC-1/RV-BLANK-CA-2 对错颜色+框内正答（在途） |
| 在途 | `_probe_timerpop_1102.cjs` | EXAM-TIMER-POP 两笔 计时弹窗四条口径（在途） |
| 在途 | `_probe_aiexplain_1102.cjs` | RV-AI-EXPLAIN-1 复盘态 AI 讲解（v737 分栏口径） |
| 在途 | `_probe_rvfix5_1102.cjs` | RV-FIX5 v737 六笔（底栏/判色/填空/绿标/分栏/工具条） |
| 在途 | `_probe_sharedmap_1103.cjs` | BANK-SHARED-MAP-1 地图/配对题不再走共享组判分（缺键不进分母 / 复盘正答按单题 key / 真共享组照旧计分；基线 5 红） |
| 在途 | `_probe_headmap_1103.cjs` | HEADING-BLOCK-DEL + MAP-MATRIX（heading 题目行整块隐藏仍可作答 / 段落槽带题号 / 地图题答题卡矩阵；基线 07e25a53 上 11 红，改后 0 红） |
| 在途 | `_probe_headmap_mobile_1103.cjs` | 同上手机档 390 复核（整页无左右滑 / 矩阵容器内滚 / 触屏点格 / heading 槽尺寸） |
| 在途 | `_probe_keyfill_matrix_1103.cjs` | 交叉验证：v746 补键（6 篇地图题按官方键点满）+ v747 地图矩阵化叠在一起 —— 每题进分母、判对、复盘正答一致、无缺键题混入；37/0 |
| 在途 | `_probe_autoread_1103.cjs` | AUTO-READ-RESTORE-1 自动读恢复（口语切题读一次/再切又只一次/喇叭重播一次/模考进题一次/模考下一题一次/en-GB；基线 v745 上 8 红） |
| 在途 | `_probe_detailundef_1103.cjs` | RV2-DETAIL-UNDEF-1 回顾页记录详情弹窗 undefined 兜底（造旧格式无 label + 新格式两条，真开弹窗；未修 HEAD 上 2 红） |
| 在途 | `_probe_examui3_p1_1031.cjs` | UNIFIED-EXAM-UI-3 笔1（在途） |
| 在途 | `_probe_hl_1101.cjs` | HIGHLIGHT-REGRESS-1101 划词高亮（在途） |
| 在途 | `smoke_sd_1415.cjs` | 14 砍换词 + 15 堵 AI 超时静默放行 回归 |

## `_archived/`（393 个文件）

历史一次性探针，对应改动早已上线且双闸结案。**不删除、不再跑、不被任何脚本引用**；
留在这里只为将来有人问「当初那个问题是拿什么量的」时能翻回来。

搬进来时按三条判据筛的：①不在回归白名单；②不是基建/夹具；③没被任何脚本 require、没被产品注释点名、最近 3 天没改过。
