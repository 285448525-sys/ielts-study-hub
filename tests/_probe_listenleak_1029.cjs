/**
 * _probe_listenleak_1029.cjs · 软导航监听器泄漏（LISTEN-LEAK-1 验收）
 *
 * 量的是 window/document 上**净活跃**监听（add - remove），不是 addEventListener 调用次数。
 * 后者会把「绑在会被 main.innerHTML 替换掉的节点上的元素级监听」也数进来 ——
 * 那些节点销毁后监听随 GC 消失，不是泄漏（A2 首版踩过，量出每轮 +189 的假数）。
 *
 * 判据（LISTEN-LEAK-1 修后定稿口径）：
 *   **第 2 轮起净增必须 ≤ 0**。不是「首轮净增 < 3」——
 *   首轮必然有一次性 +若干：起点那批是**整页加载**时绑的（走 <script defer>，不在 eval 账本里），
 *   软导航回同一页时页面脚本再 eval 一遍又绑了一组 → 首轮那点增量是重复、不是增长。
 *   第 2 轮起收账器按指纹淘汰上一轮的，净增立刻归零。
 *   真泄漏的特征是**斜率不收敛**（每轮同量增长），所以看第 2 轮起。
 *
 * 端口：支持外部 BASE（_with_server.cjs 会传 http://127.0.0.1:PORT 作为 argv[2] 且自己起服务）；
 *      不传则自起静态服务（独立跑时用）。
 *
 * 跑法：
 *   node tests/_probe_listenleak_1029.cjs                              自起服务
 *   node tests/_probe_listenleak_1029.cjs 9300                         自起服务，指定端口
 *   node tests/_with_server.cjs tests/_probe_listenleak_1029.cjs 9300  外部服务（回归白名单用）
 */
const { chromium } = require('playwright-core');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ARG = process.argv[2] || '';
const EXT_BASE = /^https?:\/\//.test(ARG) ? ARG : (process.env.BASE || '');
const PORT = /^https?:\/\//.test(ARG) ? 0 : (Number(ARG) || 9300);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.woff2':'font/woff2' };
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  <<< ' + x : '')); } };

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
  console.log('BASE = ' + BASE + (EXT_BASE ? '（外部服务）' : '（自起服务）'));

  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--proxy-server=direct://'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message)));

  await p.addInitScript(() => {
    let w = 0, d = 0;
    const detail = new Map();
    const seen = new WeakMap();
    const origAdd = EventTarget.prototype.addEventListener;
    const origRem = EventTarget.prototype.removeEventListener;
    const sigOf = (tgt, type, cap) => (tgt === window ? 'w' : 'd') + '|' + type + '|' + (!!cap);
    EventTarget.prototype.addEventListener = function (type, fn, opt) {
      if ((this === window || this === document) && fn) {
        let s = seen.get(fn); if (!s) { s = new Set(); seen.set(fn, s); }
        const sig = sigOf(this, type, typeof opt === 'object' ? opt && opt.capture : opt);
        if (!s.has(sig)) {
          s.add(sig);
          if (this === window) w++; else d++;
          const k = (this === window ? 'window' : 'document') + ':' + type;
          detail.set(k, (detail.get(k) || 0) + 1);
        }
      }
      return origAdd.call(this, type, fn, opt);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, opt) {
      if ((this === window || this === document) && fn) {
        const s = seen.get(fn); const sig = sigOf(this, type, typeof opt === 'object' ? opt && opt.capture : opt);
        if (s && s.has(sig)) {
          s.delete(sig);
          if (this === window) w--; else d--;
          const k = (this === window ? 'window' : 'document') + ':' + type;
          detail.set(k, (detail.get(k) || 0) - 1);
        }
      }
      return origRem.call(this, type, fn, opt);
    };
    window.__leakProbe = {
      count: () => ({ window: w, document: d, total: w + d }),
      detail: () => { const o = {}; detail.forEach((v, k) => { if (v !== 0) o[k] = v; }); return o; }
    };
  });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 30000 });
  await p.waitForTimeout(1500);

  const start = await p.evaluate(() => window.__leakProbe.count());
  console.log('起点（干净）:', JSON.stringify(start));

  const rounds = [];
  for (let i = 1; i <= 6; i++) {
    await p.evaluate(async () => {
      const go = async (id, file) => {
        if (typeof softNavigate !== 'function') return 'no-fn';
        try { await softNavigate({ id, file, href: file, url: file }, false); } catch (e) {}
      };
      await go('practice', 'practice.html');
      await new Promise(r => setTimeout(r, 350));
      await go('index', 'home.html');
      await new Promise(r => setTimeout(r, 350));
    });
    await p.waitForTimeout(700);
    const c = await p.evaluate(() => window.__leakProbe.count());
    rounds.push(c.total);
    console.log(`第${i}轮 回首页后: window=${c.window} document=${c.document} 合计=${c.total}`);
  }

  const det = await p.evaluate(() => window.__leakProbe.detail());
  const deltas = rounds.map((v, i) => v - (i ? rounds[i - 1] : start.total));
  console.log('\n每轮净增:', deltas.join(' '));
  console.log('终态明细（前 8）:');
  Object.entries(det).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log('  ' + k + ' = ' + v));

  const tail = deltas.slice(1);
  const stable = tail.every(d => d <= 0);
  ok('第 2 轮起净增 ≤ 0（斜率不收敛即泄漏）', stable, 'tail=[' + tail.join(',') + ']');
  console.log('首轮一次性重复 +' + deltas[0] + '（整页加载那批不在 eval 账本里，有界不增长）');

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  if (srv) srv.close();
  console.log('\n===== 监听泄漏 ' + pass + ' 过 / ' + fail + ' 红 =====');
  process.exit(fail ? 1 : 0);
})();
