# 修复：手机端 API key / 手机号 / 口语发音分「几分钟就消失」

## 真凶
`index.html` 之外两个页面的 `<head>` 里有个内联脚本 `autoCleanOldBank`：
只要题库里任意一题的 `titleEn` 包含 **"early morning"**（这是雅思正常高频话题，而且会从云端同步下来），
它就执行 `localStorage.removeItem('ielts_study_hub_v1')` 把**整个本地存储连人带枪清空**再 reload。
结果：账号、API key、发音分、全部学习数据，每次刷新 / 云端一合并就被清一次 → 死亡循环。

## 已做 4 处修改（均已本地提交 a5560c7，待 push 上线）
1. **`speaking.html` + `practice.html`**：`autoCleanOldBank` 由「整库清空」改为「只精准剔除 3 个已知脏 id（`sb_p1_home`/`sb_p2_travel`/`sb_p2_earlymorning`），用 `localStorage.setItem` 局部覆盖」，绝不碰账号/key/分数/学习数据。
2. **`js/common.js` `mergeData`**：合并设置字段时加「空值防御」——云端未填的空值（null/空串/空数组/空对象）**永不覆盖**本机已有值，根治「空值带新时间戳把本机 key 冲掉」的链路。
3. **`js/common.js` `SYNC_SETTINGS_FIELDS`**：新增 `theme`、`chimeOnDone`，实现「设置页填过的个人数据全部跨设备同步」；`relayToken`(key) / `pronunciationScore`(发音分) 本就在白名单，登录 `syncLoginOrRegister` 走 `mergeData`+`hubSave` 即时恢复。
4. **缓存 bust**：`common.js ?v=20260823k → l`（13 个页面）；`sw.js` 缓存名 `ielts-hub-v1 → v2`，强制手机端下次访问必拉新文件。

## 浏览器实测（agent-browser 真实浏览器）
- 隔离跑 `autoCleanOldBank`：种子含 "Early morning" 话题 + key/手机号/分数 → 修复后三者全保留、话题保留、只删脏 id；对照组旧逻辑确认会整库清空。
- `mergeData` 防御三项全过：本机key + 云端空值(更ts)→留本机；本机空 + 云端key→恢复；本机旧 + 云端新→取云端。

## 当前状态
- 本地 commit 已落盘，修复代码安全。
- `git push origin main` 因 GitHub 443 持续 `Connection reset` 暂未成功，**线上仍是旧代码**；网络恢复后 push 即触发 Cloudflare 自动部署。
- 部署后请 **Ctrl+F5 强刷** 一次。
