// WARMUP-THROTTLE-1 验收（口径修准版）
// 判据：
//   A 首屏关键期（3 秒内）除首页自身依赖外，无预热请求
//   B 8 秒后预热仍会发生（机制保留）
//   C 预热按页节流（相邻两页 HTML 间隔 ≥1.0s）
//   D 点击后预热让路
const { chromium } = require('playwright-core');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.resolve('C:/Users/Camille/Desktop/雅思/ielts-study-hub');
/* 端口/服务：支持外部 BASE（_with_server.cjs 传 http://127.0.0.1:PORT 作 argv[2] 且自己起服务），
   不传则自起静态服务。回归白名单跑的是外部模式。 */
const ARG = process.argv[2] || '';
const EXT_BASE = /^https?:\/\//.test(ARG) ? ARG : (process.env.BASE || '');
const PORT = /^https?:\/\//.test(ARG) ? 0 : (Number(ARG) || 9203);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg' };
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  <<< ' + x : '')); } };

// home.html 自身引用的脚本（静态解析，作为「首页依赖」白名单）
const homeHtml = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
const homeDeps = new Set();
for (const m of homeHtml.matchAll(/src="(\/?(?:js\/)?[\w.\-]+\.js)(?:\?[^"]*)?"/g)) homeDeps.add(m[1].replace(/^\//, ''));
for (const m of homeHtml.matchAll(/data-late-src="([^"]+)"/g)) m[1].split(',').forEach(s => homeDeps.add(s.split('?')[0].replace(/^\//, '')));

(async () => {
  let srv = null, BASE = EXT_BASE;
  if (!BASE) {
  srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/home.html';
    const f = path.resolve(ROOT, '.' + u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(PORT);
  BASE = 'http://127.0.0.1:' + PORT;
  }

  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--proxy-server=direct://'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const reqs = [];
  const t0 = Date.now();
  p.on('request', r => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    const clean = u.replace(/^http:\/\/127\.0\.0\.1:\d+/, '').split('?')[0];
    const isHtml = /\.html$/.test(clean);
    const isJs = /\/js\/[\w.-]+\.js$/.test(clean);
    if (isHtml || isJs) reqs.push({ t: Date.now() - t0, url: clean, raw: u, kind: isHtml ? 'html' : 'js' });
  });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 25000 });
  await p.waitForTimeout(3000);

  // A：3 秒内不属于首页依赖、且不是部署探针的请求
  /* ⚠️ 口径：`js/data-static.js` 不算预热。它是 DATA-1（10-26）的口语题库按需加载
     （common-pwa.js 的 loadStaticLater → HUB_FACTORY.ensureStatic，requestIdleCallback
     timeout 3000），brotli ~21KB，是云合并/上传的就绪闸，**故意在页面可用后拉**。
     把它也延后 = 改 DATA-1 的行为，超出本单范围（她的红线：功能上不许发挥）。 */
  const NOT_PREFETCH = new Set(['js/data-static.js']);
  const in3s = reqs.filter(r => r.t <= 3000 && !/_probe=/.test(r.raw));
  const warm3 = in3s.filter(r => {
    const rel = r.url.replace(/^\//, '');
    if (NOT_PREFETCH.has(rel)) return false;
    if (r.kind === 'html') return rel !== 'home.html';        // 别的页 HTML = 预热
    return !homeDeps.has(rel);                                 // 不在首页依赖白名单 = 预热
  });
  console.log('\n■ A 首屏关键期（3 秒内）');
  console.log('  总请求 ' + in3s.length + ' 条，其中预热类 ' + warm3.length + ' 条');
  if (warm3.length) console.log('  ' + warm3.map(r => r.t + 'ms ' + r.url).join('\n  '));
  ok('A 3 秒内无预热请求', warm3.length === 0, warm3.length + ' 条');

  await p.waitForTimeout(13000);
  const after8 = reqs.filter(r => r.t > 8000 && !/_probe=/.test(r.raw));
  ok('B 8 秒后预热仍会发生（机制保留，不是关掉）', after8.length > 0, after8.length + ' 条');

  // C：预热页 HTML 间隔
  const pages = after8.filter(r => r.kind === 'html' && r.url !== '/home.html');
  let minGap = Infinity, gaps = [];
  for (let i = 1; i < pages.length; i++) { const g = pages[i].t - pages[i - 1].t; gaps.push(g); minGap = Math.min(minGap, g); }
  console.log('\n■ C 预热页序列: ' + pages.map(r => r.t + 'ms ' + r.url).join(' | '));
  ok('C 相邻两页 HTML 间隔 ≥ 1.0s（一次空闲只预取一页）',
    pages.length < 2 || minGap >= 1000,
    pages.length < 2 ? ('只预取 ' + pages.length + ' 页') : ('最小间隔 ' + minGap + 'ms（共 ' + (pages.length + 1) + ' 页）'));

  // D：点击后让路
  const tClick = Date.now() - t0;
  await p.evaluate(() => { try { softNavigate({ id: 'practice', file: 'practice.html', href: 'practice.html', url: 'practice.html' }, false); } catch (e) {} });
  await p.waitForTimeout(2600);
  const duringPause = reqs.filter(r => r.t > tClick && r.t < tClick + 2600 && r.kind === 'html' && r.url !== '/practice.html' && !/_probe=/.test(r.raw));
  ok('D 点击后 2.6 秒内不再发起新的预热页', duringPause.length === 0,
    duringPause.length ? duringPause.map(r => r.url).join(',') : '0 条');

  await b.close(); if(srv) srv.close();
  console.log(`\n===== WARMUP ${pass} 过 / ${fail} 红 =====`);
  process.exit(fail ? 1 : 0);
})();
