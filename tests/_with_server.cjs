/* 起本地静态服务器 -> 跑目标脚本 -> 收尾（Bash shim 坏了，统一从这里跑）
   🔴 10/17：内置 Python 掉了 Lib 目录（"Failed to import encodings module"），起不来服务器，
   → 改成 **Node 自带的静态服务**（零依赖），Python 可用时仍优先用 Python（保持行为一致）。 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\Users\\Camille\\Desktop\\雅思\\ielts-study-hub';
const PY = process.env.PROBE_PY || 'C:\\Users\\Camille\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe';
const NODE = process.execPath;
const target = process.argv[2];
const PORT = Number(process.argv[3]) || 8778;

/* 🔴 10/19：Node 兜底改成**独立子进程** tests/_static_server.cjs。
   原来是 `srv = nodeServer()` 在本进程里起服务器，而下一步就是 spawnSync 阻塞等探针 ——
   本进程事件循环被卡死，服务器一个请求都答不了，探针全部 goto 超时（内置 Python 好的时候
   走的是 Python 子进程分支，所以这个坑一直没暴露）。现在两条兜底路径都是子进程。 */

function pythonWorks() {
  try { const r = spawnSync(PY, ['-c', 'print(1)'], { encoding: 'utf8', timeout: 8000 }); return r.status === 0; }
  catch (e) { return false; }
}

function alive() {
  return new Promise(res => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/practice.html' }, r => { r.resume(); res(true); });
    req.on('error', () => res(false));
    req.setTimeout(800, () => { req.destroy(); res(false); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let srv = null;
  if (!(await alive())) {
    if (pythonWorks()) {
      console.log('server: python http.server');
      srv = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: false });
    } else {
      console.log('server: node 静态服务（内置 python 不可用：' + PY + '）');
      srv = spawn(NODE, [path.join(__dirname, '_static_server.cjs'), String(PORT)], { stdio: 'ignore' });
    }
    for (let i = 0; i < 40 && !(await alive()); i++) await sleep(250);
  }
  console.log('server ready:', await alive());
  const r = spawnSync(NODE, [target, 'http://127.0.0.1:' + PORT], {
    cwd: ROOT, encoding: 'utf8', stdio: 'inherit',
    /* 🔴 10/5 23:50 补BASE 环境变量：部分老探针（如 _probe_coach_ui_1005.cjs 第 7 行）
       写的是 `const BASE = process.env.BASE || 'https://ielts-study-hub.pages.dev'` ——
       只传 argv[2] 的话它们**静默打线上站**，于是本地改了什么它一概看不见，
       还会把线上状态误报成本地回归（10/5 23:45 一次假 FAIL 的根因）。
       传 baseURL 覆盖，探针默认打本地。 */
    env: { ...process.env, BASE: 'http://127.0.0.1:' + PORT,
           NODE_PATH: 'C:\\Users\\Camille\\.workbuddy\\binaries\\node\\workspace\\node_modules' }
  });
  if (srv) { try { srv.kill(); } catch (e) {} }
  process.exit(r.status === null ? 1 : r.status);
})();