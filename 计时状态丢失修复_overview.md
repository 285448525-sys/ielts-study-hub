# 计时功能状态丢失 Bug 修复

## 问题
用户点击「开始」计时后，左上角显示计时状态；过一会儿点击计时模块卡跳回倒计时页面，计时被清零。

## 根因（精确定位）
`js/timer.js` 顶部用 `var active = null` 声明活跃计时态。
软导航（`common.js` 的 `runPageScript`）用 `window.eval` 重跑 timer.js，每次 eval 都会**重新声明并把 `active` 重置为 `null`**。
而 `common.js` 的全局徽标 / 跨页结束逻辑（`getActiveSession` / `stopActiveSession` / `sideStopClick`）全部读 `window.active`，但 timer.js 从未把 `active` 同步到 `window.active`。

→ 点计时模块卡软导航回计时页时，旧 `active` 被清空；恢复逻辑只从 `DATA.activeTimer`（云端镜像，`persistMirror` 走 `hubSave` 防抖上传，刚开计时几秒内可能还没同步上去）和 `loadActive()` 本地锚点找。若两者时机都不对齐，恢复失败 → 计时清零。

## 修复
把活跃计时态从脚本级 `var active` 改为**全局句柄 `window.active`**：
- 顶部：`window.active = window.active || null;`
- 全文件所有 `active.xxx` 读写改为 `window.active.xxx`（86 处插入 / 81 处删除，仅 timer.js 一个文件）
- `stopTick` 仍挂 `window.__timerTick` 断孤儿心跳，保持不变

效果：无论 `runPageScript` 重跑多少次 timer.js，`window.active` 都保留真实活跃态；timer.js、侧栏徽标、跨页结束三处读取源统一，恢复逻辑能正确找回。

## 验证（agent-browser 0.27.0 + Chromium，localhost:8778）
1. 点「听力」开始 → `window.active` 记录 timerId/startTs，liveTimer `00:00:02`
2. 调 `softNavigate` 重跑 timer.js（复现 bug 路径）→ timerId/startTs **不变**，liveTimer 自然续到 `00:00:11`，stopBtn 可用，听力卡显「进行中」
3. 离开到首页再软导航回计时页 → 侧栏徽标仍显示运行中；回页后 liveTimer 续到 `00:00:23`，状态**零丢失**

✅ 计时数值与运行状态在切换/误触计时模块页面后正确保持，不再被重置。

## 部署
- 改动文件：`C:\Users\Camille\Desktop\雅思\ielts-study-hub\js\timer.js`（1 file）
- commit `d386bb0`，已 `git push origin main`（`5e1f692..d386bb0`）→ Cloudflare Pages 自动部署
- 红线：未动 timer.html / css / 其他页面，未引入新依赖

## 附带教训
凡脚本会被 `runPageScript` 用 `window.eval` 重跑，需跨重跑保留的业务状态必须挂 `window.*`，绝不能做脚本级 `var/let`。`window.eval` 重跑只清 `setInterval` 句柄（如 `window.__timerTick`），不清业务状态。
