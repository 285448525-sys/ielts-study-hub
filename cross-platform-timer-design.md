# 跨平台计时系统实现设计

> 目标：在所有使用场景下（高频调用、长时间运行、进程暂停/恢复、系统时间被手动调整或 NTP 同步、跨时区、休眠唤醒等）保证计时不丢失、不产生误差累积，并支持同一账号多端实时同步。

---

## 0. 核心原则（一句话版）

**计时基准只用「单调时钟 + 整数纳秒」，永不累加「经过的时间片段」，只存「开始时刻(单调)」；持久化只存「单调起点快照 + 墙上时钟锚点」，恢复时重新相减；多端同步只传「事件 + 单调起点」，不传当前已走时间。**

---

## 1. 计时基准：单调时钟（Monotonic Clock）

### 1.1 为什么不能用 `Date.now()` / `wall clock`
`Date.now()` 返回的是「墙上时钟（wall-clock）」，它会被以下事件改变，直接导致累加式计时错乱：
- 用户/系统手动改时间
- NTP 自动同步（向前跳或向后跳几秒到几分钟）
- 跨时区（带本地时区的 `Date` 还会受 DST 影响）
- 虚拟机/容器热迁移

### 1.2 各平台单调时钟来源
| 平台 | API | 精度 | 备注 |
|---|---|---|---|
| 浏览器 | `performance.now()` | 亚毫秒（微秒级，浮点但单调递增） | **不**受系统时间修改影响；页面休眠时停止走时（重要，见 §3.3） |
| Node.js | `process.hrtime.bigint()` | 纳秒（整数 BigInt） | **不**受系统时间修改影响；进程挂起时不走时 |
| Linux/macOS (C) | `clock_gettime(CLOCK_MONOTONIC)` | 纳秒 | 不受 NTP 影响 |
| Windows (C) | `QueryPerformanceCounter` | 100ns 级 | 不受系统时间影响 |
| Python | `time.monotonic_ns()` | 纳秒整数 | 不受系统时间影响 |

### 1.3 整数纳秒，避免浮点误差
- **绝对禁止** `elapsed += deltaPerTick`（累加式）——任何浮点累加都会产生舍入误差，长时间运行后偏差肉眼可见。
- **正确做法**：存储「单调起点 `startMonoNs`（整数）」，当前已走时间 = `nowMonoNs() - startMonoNs`。每次读取都是一次**减法**，不累积。
- `performance.now()` 返回浮点毫秒，转换时 `Math.round(ns)` 成整数纳秒再存，避免浮点传播。
- 使用 `BigInt` 承载纳秒（JS 中 `hrtime.bigint()` 天然 BigInt；浏览器侧 `performance.now()*1e6` 取整后可用 `BigInt` 或 `Number`——单段计时 < 285 年不会超 `Number.MAX_SAFE_INTEGER`，但跨「休眠累计」也安全用 BigInt 更稳）。

---

## 2. 状态模型（防丢失的核心数据结构）

活跃计时只保存**最少事实**，其余全部「现算」：

```ts
interface ActiveTimer {
  timerId:    string;        // 全局唯一，UUID
  ownerDevice:string;        // 谁开的（设备指纹）
  moduleId:   string;        // 听力/阅读…
  startMonoNs:bigint;        // 【基准】本机单调时钟起点（整数纳秒）
  startWallMs:number;        // 墙上时钟锚点（仅用于展示"开始于几点"，不参与计时）
  paused:     boolean;
  pauseStartMonoNs:bigint|null; // 暂停时的单调起点（暂停期间不计入）
  pauseAccumNs:bigint;       // 历史暂停总时长（整数纳秒，永不累加成浮点）
  targetSec:  number|null;   // 目标时长（可选）
  updatedAtWallMs:number;    // 最近一次状态变更墙上时间（用于冲突解决）
}
```

**已走时间计算（单一真源，永远减法）：**
```
elapsedNs =
  (paused ? pauseStartMonoNs : nowMonoNs())
  - startMonoNs
  - pauseAccumNs
```
- 暂停时：`pauseAccumNs += nowMonoNs() - pauseStartMonoNs`，并把 `pauseStartMonoNs` 置空。
- 恢复时：记录新的 `pauseStartMonoNs = nowMonoNs()`（此时 `pauseAccumNs` 已包含上次暂停）。
- **全程只做整数减法/一次性加法，不逐 tick 累加。**

---

## 3. 防丢失机制（四层)

### 3.1 内存句柄全局化（避免软导航/重入丢失）
把 `active` 挂在 `globalThis`（浏览器 `window`、Node `global`），而非函数局部/模块级 `let`。这样：
- SPA 软导航重跑脚本 → 旧 `active` 不丢（详见上一轮 timer.js 修复）。
- 同一进程内多次 `import`/`eval` 不会互相清零。

### 3.2 本地持久化（localStorage / IndexedDB / 文件）
每次状态变更（start / pause / resume / stop）**同步**写一份「锚点」到本地存储：
```json
{ "activeTimer": { "timerId":"…", "startMonoNs":"…(字符串化BigInt)", "pauseAccumNs":"…", "paused":false, "..." } }
```
- 用 **字符串化 BigInt**（JSON 不认识 BigInt）。
- 恢复时：读取锚点 → 用「当前单调时钟 - 存储的 startMonoNs」重建，不依赖任何外部状态。
- 注意：单调时钟在**进程重启/设备重启后会重置为 0**（这是单调时钟的固有特性），所以单纯存 `startMonoNs` 无法跨重启恢复。→ 见 3.3。

### 3.3 跨重启/跨休眠恢复（墙上时钟锚点兜底）
单调时钟重启归零，所以持久化还需同时存「`startWallMs`（开计时时的墙上时间）」+「开计时时的单调值 `startMonoNs`」+「写盘时的 `wallAtWrite` 与 `monoAtWrite`」配对：
- **恢复算法（双锚点）：**
  1. 读 `monoNow = nowMonoNs()`，`wallNow = Date.now()`。
  2. 估算「写盘后到现在的墙上流逝」≈ `wallNow - wallAtWrite`（仅作参考，因 NTP 可能跳）。
  3. 用「单调流逝」`monoNow - monoAtWrite` 反推真实起点：`effectiveStartMono = startMonoNs + (monoNow - monoAtWrite)`。
  4. 若单调时钟明显被重置（如 `monoNow < monoAtWrite` 或差值异常），**降级用墙上时钟**：`effectiveStartWall = startWallMs`，已走 = `wallNow - startWallMs - pauseAccumWall`。此时接受「NTP 跳变可能引入误差」但**不丢计时**（最差差几秒，不会清零）。
- **休眠唤醒**：`performance.now()` 在标签页休眠时停止，唤醒后继续——天然正确（休眠期间不计入，符合「实际学习时长」语义）。Node `hrtime` 同理。无需特殊处理，因为我们用的是「减法」而非「累加」。

### 3.4 心跳 + 服务端同步（多端实时）
- **心跳**：持有活跃计时的端，每 `HEARTBEAT_MS`（如 5s）向服务端 `PUT /timers/active` 上报 `{timerId, ownerDevice, startMonoNs(本地), startWallMs, paused, pauseAccumNs, updatedAtWallMs}`。
- **服务端为权威镜像**：存 latest heartbeat。其他端 `GET /timers/active` 轮询（或 WebSocket 推送）拿到镜像。
- **接管（takeover）**：B 端发现 A 端心跳超时（> `HEARTBEAT_MS*2`）→ 视为 A 端崩溃/离线，B 端可申请接管（或仅本地显示「最后已知状态」）。
- **单调时钟跨端不可比**：A、B 的 `startMonoNs` 各自 monotonic，不能相减。所以**同步传「墙上锚点 `startWallMs` + 各端本地暂停累计(墙上)」**，B 端显示时用「自己本地 `Date.now() - startWallMs - pauseAccumWall`」估算——两端看到的是「同一墙上起点」推导出的近似一致值（秒级一致，足够 UI 展示）。
- **停止同步**：任一端 `POST /timers/stop` → 服务端删镜像 → 所有端 WebSocket 收到 `timer-ended` → 本地 `clearActive()`。

---

## 4. 多端同步协议（事件驱动，不传已走时间）

```
A 端                              服务端                            B 端
 │  start                          │                                │
 │──POST /timers/start──────────▶ │  存镜像(owner=A)               │
 │                                │──WS: timer-started───────────▶ │ 显示「A 正在听力 00:00」
 │  heartbeat(每5s)                │                                │
 │──PUT /timers/active──────────▶ │  更新镜像                      │
 │                                │──WS: timer-tick(mirror)──────▶ │ 刷新显示
 │                                │                                │
 │                          B 端用户点「停止」                     │
 │                                │ ◀──POST /timers/stop────────── │
 │                                │ 删镜像                          │
 │ ◀──WS: timer-ended────────────│                                │
 │ clearActive(); 本地计时停       │                                │
```

**冲突解决（同一账号两处都点开始）：**
- 服务端以 `updatedAtWallMs` 最新者胜；后到的 start 若发现已有活跃且 `ownerDevice != me` 且未超时，则**拒绝并回传当前 owner**（避免双开）。
- 或由客户端在 start 前先 `GET` 镜像，若他人持有且未超时则进入「旁观模式」而非新开。

---

## 5. 误差控制策略（汇总）

| 误差来源 | 控制手段 |
|---|---|
| 浮点舍入累积 | 只用整数纳秒 + **减法**，永不逐 tick 累加 |
| NTP/手动改时间 | 计时基准用单调时钟，完全隔离 wall-clock |
| 跨时区 | 计时算的是「流逝」，与时区无关；展示「开始于几点」才用本地时区格式化 |
| 进程/设备重启 | 双锚点（mono+wall）恢复，单调归零时降级 wall 但不丢 |
| 休眠唤醒 | 单调时钟休眠期间不走 → 自然不计入，语义正确 |
| 多端不同步 | 传墙上锚点 + 各端本地暂停累计，秒级一致 |
| 重复累积 | `pauseAccumNs` 只在 pause/resume 边界一次性结算，tick 里绝不 `+` |

---

## 6. 边界场景与异常处理

1. **单调时钟回退（极少数平台 bug）**：`nowMonoNs() < lastMonoNs` → 钳制为 `lastMonoNs`，不更新起点，避免负 elapsed。
2. **BigInt 溢出**：纳秒计数需 ~285 年才超 `Number.MAX_SAFE_INTEGER`；用 BigInt 则无上限。单段计时无需担心。
3. **localStorage 配额/隐私模式抛错**：持久化包 `try/catch`，失败仅丢失「跨重启恢复」能力，不影响本次会话计时。
4. **心跳失败/网络抖动**：本地计时继续（本地是真相）；下次心跳补传。服务端以「最新成功心跳」为准，不要求连续。
5. **多标签同端**：用 `globalThis.active` + `storage` 事件广播，避免两个标签各开一份。
6. **服务端时间 vs 客户端时间差很大**：同步只用 `updatedAtWallMs` 比新旧，不比绝对时刻，避免时差误判冲突。
7. **暂停期间系统时间被改**：因暂停时段从 `pauseAccumNs` 走，且恢复时重新取单调起点，`Date.now()` 跳变不影响 elapsed。
8. **极端长运行（>24h）**：纳秒整数减法无精度问题；UI 格式化按 `天/时/分/秒` 拆分即可。

---

## 7. 参考实现（JavaScript，浏览器/Node 通用内核）

见同目录 `cross-platform-timer-core.js`。该文件：
- 用 `monoNowNs()` 统一封装各平台单调时钟（浏览器 `performance.now()`、Node `hrtime.bigint()`）。
- `ActiveTimer` 状态机：start/pause/resume/stop，全部基于「单调起点减法」。
- `persistLocal()` / `loadLocal()` 双锚点持久化（含重启降级）。
- `TickEngine`：单一 `setInterval` 驱动 UI 刷新，**tick 内只做减法渲染，绝不累加**。
- `SyncClient`（桩）：heartbeat + 事件回调，展示多端同步接线点。
- 完整边界处理（单调回退钳制、持久化异常吞掉、BigInt 字符串化）。

> 设计要点落地到代码后，可与现有 `ielts-study-hub/js/timer.js` 合并：把其中 `var active` 改为 `globalThis.active`、把 elapsed 计算改为「单调起点减法」、把 `hubSave` 防抖改为「双锚点 + 心跳」即可彻底消除状态丢失与误差累积。
