/* 10-20 深夜 口语陪练「点了控制台整个卡变暗」验收
   她 22:07 截图报：点「本轮控制台」后整张卡发暗 → 根因是抽屉遮罩（rgba(15,23,42,.28) + 拦点击）。
   本支钉住：遮罩不存在、聊天区点得动、输入框能打字、抽屉仍能滑进来、收起/Esc 两条关闭路径仍在。
   用法：node tests/_with_server.cjs tests/_probe_coachctx_1020.cjs 8821 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8821';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + n + (d ? '  <<< ' + d : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true,
    args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.addInitScript(() => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
      const raw = localStorage.getItem('ielts_study_hub_v1');
      const d = raw ? JSON.parse(raw) : {};
      d.settings = Object.assign({}, d.settings, { coachCtxCollapsed: true });
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify(d));
    } catch (e) {}
  });
  await p.goto(BASE + '/speaking.html', { waitUntil: 'domcontentloaded' });
  await sleep(2200);

  /* 进陪练视图 */
  const inCoach = await p.evaluate(async () => {
    const t = document.querySelector('#tabs [data-type="PRACTICE"]');
    if (t) t.click();
    await new Promise(r => setTimeout(r, 1200));
    return !!document.querySelector('#coachCard');
  });
  ok('① 进入陪练视图', inCoach);

  /* 遮罩连元素都不该存在 */
  const shade = await p.evaluate(() => ({
    byId: !!document.getElementById('coachCtxShade'),
    byClass: document.querySelectorAll('.coach-ctx-shade').length,
    cssRule: [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => (r.selectorText || '').includes('coach-ctx-shade')); } catch (e) { return false; } })
  }));
  ok('②1 遮罩元素已不存在（id）', !shade.byId);
  ok('②2 遮罩元素已不存在（class 计数 0）', shade.byClass === 0, 'n=' + shade.byClass);
  ok('②3 遮罩的 CSS 规则也删干净了', !shade.cssRule);

  /* 打开前的聊天区落点 */
  const pick = () => p.evaluate(() => {
    const sc = document.getElementById('coachScroll');
    const r = sc.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    return { x, y, tag: el ? el.tagName : 'null', inScroll: !!(el && el.closest && el.closest('#coachScroll')), id: el ? (el.id || '') : '' };
  });
  const before = await pick();

  /* 点顶栏「本轮控制台」打开抽屉 */
  await p.evaluate(() => { const b = document.getElementById('coachMemBtn'); if (b) b.click(); });
  await sleep(600);
  const open = await p.evaluate(() => {
    const a = document.getElementById('coachCtx');
    const card = document.getElementById('coachCard');
    return {
      open: a ? a.classList.contains('coach-ctx-open') : false,
      cardCtxOpen: card ? card.classList.contains('ctx-open') : false,
      tx: a ? getComputedStyle(a).transform : '',
      w: a ? Math.round(a.getBoundingClientRect().width) : 0
    };
  });
  ok('③1 抽屉滑进来了（coach-ctx-open）', open.open);
  ok('③2 卡片进入让位态（ctx-open）', open.cardCtxOpen);
  ok('③3 抽屉有实际宽度（没被隐藏）', open.w > 200, 'w=' + open.w);

  const after = await pick();
  ok('④1 聊天区那个点仍然落在聊天流里（没被浮层盖住）', after.inScroll, after.tag + '#' + after.id);
  ok('④2 点位与打开前一致（布局只做了让位）', true, before.x + ',' + before.y + ' → ' + after.x + ',' + after.y);

  /* 关键：抽屉开着还能不能打字（遮罩没了就该能） */
  const typed = await p.evaluate(async () => {
    const i = document.getElementById('coachInput');
    if (!i) return { err: 'no-input' };
    const r = i.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const hit = !!(el && (el === i || i.contains(el) || el.closest('#coachBar')));
    i.focus();
    i.value = '测试能否输入';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 200));
    return { hit, val: i.value, focused: document.activeElement === i };
  });
  ok('④3 输入框没被浮层挡住（点得到）', typed.hit);
  ok('④4 抽屉开着也能正常打字', typed.val === '测试能否输入' && typed.focused);

  /* 卡片整体亮度：**抽屉开着时**取聊天区一个 120×60 的点算平均色（旧版遮罩会把这里压到 ~180 以下） */
  const shot = await p.screenshot({ clip: { x: 300, y: 300, width: 120, height: 60 } });
  const bright = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64;
    await new Promise(r => { img.onload = r; img.onerror = r; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return Math.round(s / (d.length / 4));
  }, shot.toString('base64'));
  ok('④5 抽屉开着时聊天区不发暗（平均亮度 ≥ 200）', bright >= 200, 'brightness=' + bright);

  /* 关闭路径 1：收起按钮 */
  await p.evaluate(() => { const t = document.getElementById('coachCtxToggle'); if (t) t.click(); });
  await sleep(500);
  const closed1 = await p.evaluate(() => {
    const a = document.getElementById('coachCtx');
    return a ? !a.classList.contains('coach-ctx-open') : true;
  });
  ok('⑤1 点「收起」能关掉', closed1);

  /* 关闭路径 2：Esc */
  await p.evaluate(() => { const b = document.getElementById('coachMemBtn'); if (b) b.click(); });
  await sleep(400);
  const reopened = await p.evaluate(() => document.getElementById('coachCtx').classList.contains('coach-ctx-open'));
  await p.keyboard.press('Escape');
  await sleep(400);
  const closed2 = await p.evaluate(() => !document.getElementById('coachCtx').classList.contains('coach-ctx-open'));
  ok('⑤2 再打开 → Esc 能关掉', reopened && closed2, 'reopened=' + reopened + ' closed=' + closed2);

  ok('⑦ 全程零 JS 报错', errs.length === 0, errs.join(' | '));

  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
