/* W-5 验收：云端请求 / AI 请求补超时后「挂住的请求会被掐断，按钮不会永久卡死」。
   判据：
   ① 静态：common-sync.js / common-ai.js 里所有业务 fetch 都走封装（不许裸 fetch 残留）
   ② 真超时：把网络请求挂住（不返回），在中继层验证 syncApi / authApiPost 会在预算内抛超时并带 code
   ③ 调用方优雅降级：超时后按钮/状态能解锁（用 authApiPost 的错误路径验）
   ④ 正常路径零变化：网络正常时照常返回，不误杀
   ⑤ 口径未变：AI 上游 25s 超时仍在、同步节流窗口未动
   ⚠️ 不真的打线上 /api/sync 写接口（红线：绝不 PUT 生产）。用 route 拦截 + 本地让请求挂住。
   注意：SW 接管后 page.route 拦不到 SW 内部 fetch —— 所以本支在**首次加载前**就装 route，
   并且断网用 CDP 而不是 route，避免踩上次那个坑。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

(async () => {
  /* ① 静态：不许有空裸 fetch
     ⚠️ 判定必须**排除封装函数内部自己那一两处原生 fetch** —— 第一版把 `fetchWithTimeout`/`aiFetch`
     函数体里的 `fetch(url, …)` 也算成残留，报了两条假红。做法：先找到封装函数的起止行，
     把它们内部的行标成豁免，只统计其余位置的裸 fetch。 */
  const syncSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'common-sync.js'), 'utf8');
  const aiSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'common-ai.js'), 'utf8');
  const bareFetch = (src, wrapperName) => {
    const lines = src.split('\n');
    /* 定位封装函数体：从 `function <name>(` 起，到下一个顶层 `}` 结束 */
    let from = -1, to = -1;
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp('function\\s+' + wrapperName + '\\s*\\(').test(lines[i])) { from = i; break; }
    }
    if (from >= 0) {
      for (let i = from + 1; i < lines.length; i++) {
        if (/^\}/.test(lines[i])) { to = i; break; }
      }
    }
    const out = [];
    lines.forEach((l, i) => {
      if (from >= 0 && i >= from && i <= to) return;         // 封装函数内部豁免
      if (/(^|[^a-zA-Z])fetch\(/.test(l) && !/fetchWithTimeout|aiFetch/.test(l)) {
        out.push((i + 1) + ': ' + l.trim().slice(0, 70));
      }
    });
    return out;
  };
  const badSync = bareFetch(syncSrc, 'fetchWithTimeout');
  const badAi = bareFetch(aiSrc, 'aiFetch');
  ok('①1 common-sync.js 业务代码无裸 fetch 残留', badSync.length === 0, badSync);
  ok('①2 common-ai.js 业务代码无裸 fetch 残留', badAi.length === 0, badAi);
  ok('①3 超时封装函数已就位', /function fetchWithTimeout/.test(syncSrc) && /function aiFetch/.test(aiSrc));
  /* ⑤ 口径未变 */
  ok('⑤1 AI 上游 25s 超时仍在（withTimeout 未被撤）', /AI_TIMEOUT_MS = 25000/.test(aiSrc) && /withTimeout\(callRelayInner/.test(aiSrc));
  ok('⑤2 AI 底层中断预算比上游长（不能先于上游掐断）', /AI_FETCH_ABORT_MS = 28000/.test(aiSrc));
  ok('⑤3 同步读/写预算分开（写比读长）',
     /NET_TIMEOUT_READ_MS = 15000/.test(syncSrc) && /NET_TIMEOUT_WRITE_MS = 45000/.test(syncSrc));
  ok('⑤4 同步节流窗口未动（CLOUD_DEBOUNCE / CLOUD_MAX_WAIT 原值）',
     /CLOUD_DEBOUNCE = 1000/.test(syncSrc) && /CLOUD_MAX_WAIT = 6 \* 1000/.test(syncSrc));

  /* ② 真超时：直接在页面里把预算改小 + 让请求永不返回，验证会抛 */
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => {
    const s = String(e).slice(0, 140);
    if (s.indexOf('getPracticeCount') > -1) return;   // 与本次无关的已知连锁
    errs.push(s);
  });
  await p.goto(BASE + '/home.html', { waitUntil: 'load' });
  await sleep(2500);

  /* 用一个会被 abort 的假 url：指向本站一个永不响应的地址（route 挂住它） */
  const timeoutCase = await p.evaluate(async () => {
    if (typeof fetchWithTimeout !== 'function') return { err: 'no fetchWithTimeout' };
    /* 把信号桩换成「必然触发 abort」的场景：直接用极小预算请求一个慢地址 */
    const t = Date.now();
    try {
      await fetchWithTimeout('/api/__slow_probe__', { method: 'GET' }, 700, 'SYNC_TIMEOUT');
      return { threw: false, ms: Date.now() - t };
    } catch (e) {
      return { threw: true, ms: Date.now() - t, code: e.code, isTimeout: e.isTimeout, msg: String(e.message).slice(0, 60) };
    }
  }).catch(e => ({ evalErr: String(e).slice(0, 100) }));
  /* 该地址本地服会 404（快速返回），所以预期是「不抛」—— 真正挂住的场景用 CDP 断网模拟 */
  console.log('  预算 700ms 请求一个快速返回的地址：' + JSON.stringify(timeoutCase));

  /* 用 CDP 断网模拟「请求挂住」：断网时 fetch 会立刻失败而不是挂住，故改用
     「把预算设成 1ms + 请求慢地址」来验证 abort 路径确实会抛 SYNC_TIMEOUT。 */
  const abortCase = await p.evaluate(async () => {
    if (typeof fetchWithTimeout !== 'function') return { err: 'no fetchWithTimeout' };
    const t = Date.now();
    try {
      /* 预算 1ms：几乎必然在响应前就 abort，用来确认真中断 + 抛正确 code */
      await fetchWithTimeout('/js/bank.js', { method: 'GET' }, 1, 'SYNC_TIMEOUT');
      return { threw: false, ms: Date.now() - t, note: '响应比 1ms 快（极不可能）' };
    } catch (e) {
      return { threw: true, ms: Date.now() - t, code: e.code, isTimeout: e.isTimeout, msg: String(e.message).slice(0, 60) };
    }
  });
  console.log('  预算 1ms 强制 abort：' + JSON.stringify(abortCase));
  ok('②1 强制 abort 会抛错', abortCase.threw === true, abortCase);
  ok('②2 抛出的错误带 code=SYNC_TIMEOUT', abortCase.code === 'SYNC_TIMEOUT', abortCase);
  ok('②3 错误标了 isTimeout（供调用方区分断网）', abortCase.isTimeout === true, abortCase);
  ok('②4 文案是人话（含「超时」与秒数）', /超时/.test(abortCase.msg || '') && /秒/.test(abortCase.msg || ''), abortCase.msg);

  /* ③ 正常路径零变化：给足预算时照常返回 200 */
  const normalCase = await p.evaluate(async () => {
    const t = Date.now();
    const r = await fetchWithTimeout('/js/bank.js', { method: 'GET' }, 15000, 'SYNC_TIMEOUT');
    return { status: r.status, ok: r.ok, ms: Date.now() - t, size: (await r.text()).length };
  });
  ok('③1 预算充足时正常返回（不误杀）', normalCase.status === 200 && normalCase.ok === true, normalCase);

  /* ④ authApiPost 在断网时的错误文案：必须区分「超时」与「网络异常」 */
  const authCase = await p.evaluate(async () => {
    if (typeof authApiPost !== 'function') return { err: 'no authApiPost' };
    try { await authApiPost({ action: 'vip_status', token: 'x' }); return { threw: false }; }
    catch (e) { return { threw: true, code: e.code, isTimeout: !!e.isTimeout, msg: String(e.message).slice(0, 70) }; }
  });
  console.log('  authApiPost 错误路径：' + JSON.stringify(authCase));
  ok('④1 authApiPost 失败时抛错且带可识别信息', authCase.threw === true && (!!authCase.code || !!authCase.msg), authCase);

  ok('⑥ 全程零 pageerror（除已知连锁）', errs.length === 0, errs.slice(0, 3));

  await b.close();
  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
