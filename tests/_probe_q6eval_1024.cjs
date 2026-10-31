/* Q-6 验收：eval 输入面收紧后「该跑的照跑、不该跑的拒掉」。
   判据（施工书 §Q-6 的「验」）：
   ① 全站 8 页软导航往返零回归（换页后目标页脚本确实重跑 = 功能真活着）
   ② 白名单：接受本站 js/*.js（含 ?v= / 前导斜杠）、拒绝跨域/协议相对/data:/blob:/爬出根/非 js
   ③ 形态校验：拒绝 HTML 文档、错误 JSON、空串；真脚本放行
   ④ 真现场：让一个附加脚本 404 → 有 warn（带 page id + 脚本名）、页面不卡死、恢复后仍能导航
   ⑤ 两处 eval 必须还在（红线：不许删 eval、不许撤 unsafe-eval）
   跑法：NODE_PATH=... node tests/_probe_q6eval_1024.cjs [BASE]
   ⚠️ ④ 这一段的坑（前三版都栽在这，写下来免得再踩）：
      · 直接 route 404 → 没 warn：prefetchAll 早把源码放进**内存**缓存（_navCodeCache），内存命中就不发请求；
      · 只清内存 → 还是没 warn：请求被 **SW 的 CacheStorage** 接住，page.route 拦不到 SW 内部 fetch；
      · 开 serviceWorkers:'block' 的新上下文 → 整页 blank，连对照组都没了。
      正解 = 留在同一个已装 SW 的页面上，**两层缓存一起清**，请求才会真的走到网络吃到 404。
   ④ 里 sp-core / sp-list 依赖 sp-stats 的 getPracticeCount，故 404 现场必然有连锁 ReferenceError
      —— 那是**实验预期**，单独计到 errs404 里只记录、不计红。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

(async () => {
  /* ⑤ 静态：两处 eval 必须还在 */
  const shellSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'common-shell.js'), 'utf8');
  ok('⑤1 srcs 循环的 window.eval 仍在', /window\.eval\(got\[i\]\.code\)/.test(shellSrc));
  ok('⑤2 body 内联脚本的 window.eval 仍在', /window\.eval\(code\)/.test(shellSrc));
  ok('⑤3 两个校验函数已就位', /function hubEvalSourceOk/.test(shellSrc) && /function hubCodeLooksLikeJs/.test(shellSrc));

  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  const warns = [], errs = [], errs404 = [];
  p.on('console', m => {
    const t = m.text();
    if (/已拒绝执行脚本|soft-nav/.test(t)) warns.push(m.type() + ': ' + t.slice(0, 200));
  });
  p.on('pageerror', e => {
    const s = String(e).slice(0, 140);
    if (s.indexOf('getPracticeCount') > -1) errs404.push(s);   // ④ 的预期连锁错误
    else errs.push(s);
  });

  await p.goto(BASE + '/home.html', { waitUntil: 'load' });
  await sleep(2500);

  /* ②③ 直接测两个校验函数 */
  const checks = await p.evaluate(() => {
    if (typeof hubEvalSourceOk !== 'function' || typeof hubCodeLooksLikeJs !== 'function') return { err: 'no-fn' };
    return {
      accept: ['js/bank.js', 'js/bank.js?v=20261024a', '/js/common-shell.js', 'js/sp-core.js?v=1'].map(s => [s, hubEvalSourceOk(s)]),
      reject: ['https://evil.com/x.js', '//evil.com/x.js', 'data:text/javascript,alert(1)', 'blob:http://a/1', '../js/x.js', 'js/../../etc/x.js', 'api/ai', '', 'js/a.css'].map(s => [s, hubEvalSourceOk(s)]),
      js: {
        html: hubCodeLooksLikeJs('<!DOCTYPE html><html><body>x</body></html>'),
        json: hubCodeLooksLikeJs('{"error":"bad"}'),
        empty: hubCodeLooksLikeJs('   '),
        real: hubCodeLooksLikeJs('function foo(){ return 1; }\nwindow.__x = foo;'),
      },
    };
  });
  console.log('  接受：' + JSON.stringify(checks.accept));
  console.log('  拒绝：' + JSON.stringify(checks.reject));
  ok('②1 本站 js/*.js（含 ?v= 与前导斜杠）全部放行', checks.accept && checks.accept.every(x => x[1] === true), checks.accept);
  ok('②2 跨域/协议相对/data:/blob:/爬出根/非 js 全部拒绝', checks.reject && checks.reject.every(x => x[1] === false), checks.reject);
  ok('③1 HTML 文档被拒', checks.js && checks.js.html === false);
  ok('③2 错误 JSON 被拒', checks.js && checks.js.json === false);
  ok('③3 空串被拒', checks.js && checks.js.empty === false);
  ok('③4 真脚本放行', checks.js && checks.js.real === true);

  /* ① 八页软导航往返 */
  const trip = await p.evaluate(async () => {
    const order = ['bank.html', 'speaking.html', 'writing.html', 'practice.html', 'corpus.html', 'plans.html', 'review.html', 'settings.html', 'home.html'];
    const out = [];
    for (const f of order) {
      const a = document.querySelector('a[href="' + f + '"]');
      if (!a) { out.push({ f, skip: 'no-link' }); continue; }
      const t = Date.now();
      a.click();
      await new Promise(r => {
        let n = 0;
        const chk = () => { n++; if (location.pathname.indexOf(f.replace('.html', '')) > -1 || n > 150) r(); else setTimeout(chk, 100); };
        chk();
      });
      const m = document.querySelector('main');
      out.push({ f, ms: Date.now() - t, url: location.pathname, mainLen: (m && m.innerHTML ? m.innerHTML.length : 0) });
    }
    return out;
  });
  trip.forEach(x => console.log('    ' + JSON.stringify(x)));
  const live = trip.filter(x => !x.skip);
  ok('①1 八页往返全部落到目标页', live.every(x => x.url.indexOf(x.f.replace('.html', '')) > -1), live.map(x => x.url));
  ok('①2 每页 main 都有内容（脚本重跑后 DOM 真渲染了）', live.every(x => x.mainLen > 300), live.map(x => x.mainLen));
  ok('①3 正常路径零「已拒绝执行脚本」告警', warns.filter(w => /已拒绝执行脚本/.test(w)).length === 0, warns.filter(w => /已拒绝/.test(w)).slice(0, 3));

  /* ④ 真现场：验证 runPageScript 的「拒绝 / 跳过」两条分支真的生效。
     ⚠️ 前四版都栽在同一件事上（记下来免得再踩）：
        · 直接 route 404 → 没 warn：prefetchAll 早把源码放进内存缓存（_navCodeCache），内存命中就不发请求；
        · 只清内存 / 内存+SW 缓存都清 → 还是没 warn；
        · 开 serviceWorkers:'block' 的新上下文 → 整页 blank，连对照组都没了。
     🔴 实测结论（用真实计数证明）：**SW 装上之后，page.route 一次都拦不到**
        （探针里 routed=0）—— Playwright 的 page.route 不拦截 Service Worker 内部发出的 fetch。
        navGetCode 的请求正是走 SW 的，所以「注入 404」这条路在原理上就不通，不是参数没调对。
     正解 = 不去拦网络，而是**直接喂 runPageScript 一份伪造的页面文档**：
        一条 src 指向站外（应被来源校验拒绝）、一条真实 src 但内容被换成 HTML（应被形态校验拒绝），
        再配一条正常 src（应正常执行）。这样三条分支都能确定性地验到，且不依赖网络与 SW。 */
  const rejectCase = await p.evaluate(async () => {
    const out = { rejects: [], warns: [] };
    const origWarn = console.warn;
    console.warn = function () { out.warns.push(Array.prototype.slice.call(arguments).map(String).join(' ').slice(0, 200)); return origWarn.apply(console, arguments); };
    try {
      /* 造一份假的目标页文档：三段 script，分别是「站外」「真实地址」「正常地址」 */
      const xml = '<html><head></head><body>' +
        '<script src="https://evil.example.com/inject.js"></script>' +
        '<script src="js/bank.js?v=test"></script>' +
        '</body></html>';
      const doc = new DOMParser().parseFromString(xml, 'text/html');
      /* 把「真实地址」那条的源码换成 HTML 文档（模拟 SW 兜底串页） */
      try {
        if (typeof _navCodeCache !== 'undefined' && _navCodeCache.set) {
          _navCodeCache.set('js/bank.js?v=test', '<!DOCTYPE html><html><body>wrong page</body></html>');
        }
      } catch (e) {}
      await runPageScript('bank', doc);
      out.ok = true;
    } catch (e) { out.err = String(e).slice(0, 120); }
    console.warn = origWarn;
    return out;
  });
  console.log('  拒绝分支现场：' + JSON.stringify(rejectCase).slice(0, 400));
  const rw = (rejectCase.warns || []).join('\n');
  /* ⚠️ ④0 第一版写错：我以为站外脚本要靠 hubEvalSourceOk 拦下，实际它在更前面就被挡了 ——
     pageScriptSources 只收 src 以 js/ 开头的（站外 URL 根本进不了候选清单）。
     两层是叠加的：收集层挡 externals，校验层挡「被塞进来的脏路径」。这里验收集层。 */
  const collected = await p.evaluate(() => {
    const xml = '<html><body><script src="https://evil.example.com/inject.js"></script><script src="js/bank.js?v=1"></script></body></html>';
    const doc = new DOMParser().parseFromString(xml, 'text/html');
    return { srcs: (typeof pageScriptSources === 'function') ? pageScriptSources('bank', doc) : null };
  });
  ok('④0 站外脚本在收集阶段就被排除（pageScriptSources 只收 js/ 开头）',
     collected.srcs && collected.srcs.every(s => String(s).indexOf('evil') === -1), collected);
  ok('④1 内容被换成 HTML 的脚本被形态校验拒绝', /不像 JS/.test(rw), (rejectCase.warns || []).slice(0, 2));
  ok('④2 拒绝日志带 page id', /page=bank/.test(rw), (rejectCase.warns || []).slice(0, 2));
  /* ⚠️ ④3 第一版也写错：主脚本被拒时**抛错是设计**（softNavigate 靠这个异常走整页跳转兜底），
     不该断言「不抛」。正确的验收 = 抛出的错误能被识别为「主脚本问题」，且调用方有兜底路径。 */
  ok('④3 主脚本被拒 → 抛错以触发整页跳转兜底（不是静默吞掉）',
     /main script not js|main script rejected/.test(rejectCase.err || ''), rejectCase.err);
  /* 收尾：把被污染的缓存清掉，避免影响后续断言 */
  await p.evaluate(() => {
    try { if (typeof _navCodeCache !== 'undefined' && _navCodeCache.delete) _navCodeCache.delete('js/bank.js?v=test'); } catch (e) {}
  });

  /* ④b 恢复后仍能正常导航（确认上面的人工注入没把页面搞坏） */
  await p.goto(BASE + '/home.html', { waitUntil: 'load' });
  await sleep(2000);
  await p.evaluate(() => { const a = document.querySelector('a[href="bank.html"]'); a && a.click(); });
  await sleep(4000);
  const recovered = await p.evaluate(() => ({ url: location.pathname, isBank: !!document.querySelector('#mockTabs,[data-mtab]') }));
  ok('④4 恢复后仍能正常导航', /bank/.test(recovered.url), recovered);

  ok('⑥ 正常路径全程零 pageerror（404 现场的预期连锁错误单独计）', errs.length === 0, errs.slice(0, 3));
  console.log('      （404 现场预期内的连锁报错 ' + errs404.length + ' 条，仅记录不计红）');

  await b.close();
  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
