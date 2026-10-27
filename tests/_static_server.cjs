/* 零依赖静态服务器（给 _with_server.cjs 当子进程用）
   🔴 10/19 为什么要有这个文件：原来 _with_server.cjs 的 Node 兜底服务器是**在父进程里**起的，
      而父进程下一步就是 spawnSync 阻塞等探针 —— 事件循环被卡死，服务器一个请求都答不了，
      表现为探针全部 `page.goto: Timeout 30000ms exceeded`（内置 Python 还能用时走的是 Python
      子进程分支，所以这个坑一直没暴露；Python 挂了以后 20 支回归全假红）。
      修法：服务器独立成进程，父进程 spawn 它就行。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\Camille\\Desktop\\雅思\\ielts-study-hub';
const PORT = Number(process.argv[2]) || 8778;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const abs = path.join(ROOT, p);
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(abs, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',           /* 本地探针一律不缓存，免得看到旧文件 */
      'Content-Length': st.size
    });
    fs.createReadStream(abs).pipe(res);
  });
}).listen(PORT, '127.0.0.1');
