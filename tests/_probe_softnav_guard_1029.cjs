/**
 * _probe_softnav_guard_1029.cjs · 软导航往返后「页面幂等守卫」是否仍与监听同步
 *
 * 为什么单开这支：LISTEN-LEAK-1 返工时踩到一类**逐页 goto 绝对查不出**的回归 ——
 *   页面脚本写的是「`window.__X = true` + 绑 document 委托」，收账器把监听摘了、
 *   标记还在 → 守卫挡住重绑 → 该页 document 级交互**永久死亡**。
 *   只有在「同一 document 里反复软导航、再进那一页点东西」时才暴露。
 *   （A2 的 _mini10.cjs 只覆盖 bank 一页；这支把它泛化成多页 + 守卫标记一致性检查。）
 *
 * 本探针只查一件事：**守卫标记为 true 时，它声称绑好的监听必须真实存在**。
 * 纯粹的「监听数不增长」由 _probe_listenleak_1029.cjs 负责，这里不重复测
 *   （那支判据是「第 2 轮起净增 ≤ 0」；本探针早期版本拿「0 轮 vs 6 轮」比，
 *    会被首轮一次性重复误判成红 —— 同一个坑，这里不再踩）。
 *
 * 跑法：node tests/_probe_softnav_guard_1029.cjs <PORT>
 */
const { chromium } = require('playwright-core');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
/* 端口/服务：支持外部 BASE（_with_server.cjs 传 http://127.0.0.1:PORT 作 argv[2] 且自己起服务），
   不传则自起静态服务。回归白名单跑的是外部模式。 */
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

  const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--proxy-server=direct://'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await p.addInitScript(() => {
    const live = new Map();
    const seen = new WeakMap();
    const origAdd = EventTarget.prototype.addEventListener;
    const origRem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opt) {
      if ((this === window || this === document) && fn) {
        let s = seen.get(fn); if (!s) { s = new Set(); seen.set(fn, s); }
        const sig = (this === window ? 'w' : 'd') + '|' + type + '|' + (!!(opt && opt.capture));
        if (!s.has(sig)) {
          s.add(sig);
          let full = '';
          try { full = String(fn); } catch (e) {}
          live.set(sig + '@@' + (fn.__id || (fn.__id = Math.random().toString(36).slice(2, 8))),
            { tgt: this === window ? 'w' : 'd', type, src: full });
        }
      }
      return origAdd.call(this, type, fn, opt);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, opt) {
      if ((this === window || this === document) && fn) {
        const s = seen.get(fn); const sig = (this === window ? 'w' : 'd') + '|' + type + '|' + (!!(opt && opt.capture));
        if (s && s.has(sig)) { s.delete(sig); live.delete(sig + '@@' + (fn.__id || '')); }
      }
      return origRem.call(this, type, fn, opt);
    };
    window.__hasListener = (featureStr) => {
      let n = 0;
      live.forEach(v => { if (v.src.indexOf(featureStr) !== -1) n++; });
      return n;
    };
  });

  await p.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 25000 });
  await p.waitForTimeout(1600);

  const go = async (id, file) => {
    await p.evaluate(async ({ id, file }) => {
      if (typeof softNavigate !== 'function') return;
      try { await softNavigate({ id, file, href: file, url: file }, false); } catch (e) {}
    }, { id, file });
    await p.waitForTimeout(750);
  };

  console.log('\n■ 软导航往返 6 轮');
  for (let i = 0; i < 6; i++) { await go('practice', 'practice.html'); await go('index', 'home.html'); }
  console.log('  已完成');

  console.log('\n■ G1 守卫标记 true ⇒ 监听真实存在 / G2 交互仍可用');

  await go('bank', 'bank.html');
  const bank = await p.evaluate(async () => {
    const flag = !!window.__BANK_DELEGATE;
    const listeners = window.__hasListener('pill-tab');
    const tab = Array.from(document.querySelectorAll('.pill-tab')).find(x => /听力/.test(x.textContent || ''));
    if (!tab) return { flag, listeners, noTab: true };
    tab.click();
    await new Promise(r => setTimeout(r, 900));
    const pane = document.querySelector('#pane-listening');
    return { flag, listeners, active: Array.from(document.querySelectorAll('.pill-tab.active')).map(x => (x.textContent || '').trim()), disp: pane ? getComputedStyle(pane).display : 'none' };
  });
  ok('G1 bank 守卫为真时监听真实存在', !bank.flag || bank.listeners > 0, JSON.stringify(bank));
  ok('G2 6 轮后 bank 科目切换仍生效', bank.disp === 'block' && (bank.active || []).some(t => /听力/.test(t)), JSON.stringify(bank));

  /* 特征串取 listener **函数体内**真实出现的标记（'wb-seg-btn' 是委托里 closest 的选择器）。
     ⚠️ 别拿附近别的函数的名字（如 _switcherHtml）当特征 —— 那不在监听体里，永远匹配 0 条 → 假红。 */
  const wb = await p.evaluate(() => ({ flag: !!window.__wbSegBound, listeners: window.__hasListener('wb-seg-btn') }));
  ok('G1 wordbank 守卫标记与监听同步', !wb.flag || wb.listeners > 0, JSON.stringify(wb));

  await go('practice', 'practice.html');
  const pr = await p.evaluate(() => ({ flag: !!window.__wordKbdBound, listeners: window.__hasListener('revealed') }));
  ok('G1 practice 键盘守卫标记与监听同步', !pr.flag || pr.listeners > 0, JSON.stringify(pr));

  ok('全程零 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close(); if(srv) srv.close();
  console.log(`\n===== 软导航守卫一致性 ${pass} 过 / ${fail} 红 =====`);
  process.exit(fail ? 1 : 0);
})();
