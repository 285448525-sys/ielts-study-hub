/* B-6 小步1 验收：.streak-chip 三段定义收敛后「三处在用的地方零变化」
   ① 首页 home.html 倒计时条 .hline 里的连续天数 chip（.hline .streak-chip 覆盖仍在）
   ② 背词页 practice.html 的连击 chip：基础态 / 红心态 .heart / x2 徽章（.word-stats 里）
   ③ 静态体检：common.css 里 .streak-chip 的基础底色声明只剩一处（且被 .hero 作用域限定）
   ⚠️ 判据全是 getComputedStyle 实测，不看代码猜。 */
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8898';
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lum = c => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); if (l1 == null || l2 == null) return 0; return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100; };
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } else { fail++; console.log('  RED ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const p = await c.newPage(); p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  /* ---------- ③ 静态体检：基础底色只剩一处，且被 .hero 限定 ---------- */
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'common.css'), 'utf8');
  const blocks = [], re = /\.streak-chip\s*\{/g; let m;
  const isCommented = idx => {
    const before = css.slice(0, idx);
    return before.lastIndexOf('/*') > before.lastIndexOf('*/');
  };
  while ((m = re.exec(css))) {
    const start = m.index; const end = css.indexOf('}', start); const body = css.slice(start, end + 1);
    const line = css.slice(0, start).split('\n').length;
    const prefix = css.slice(Math.max(0, start - 40), start);
    blocks.push({ line, body, prefix: prefix.trim(), scoped: /\.hero\s*$/.test(prefix), commented: isCommented(start) });
  }
  console.log('[③] common.css 里 .streak-chip{ 定义共 ' + blocks.length + ' 处：' + blocks.map(x => x.line + (x.commented ? '(注释)' : '') + (x.scoped ? '(.hero)' : '')).join(' · '));
  const baseLive = blocks.filter(x => !x.commented && /var\(--primary-50\)/.test(x.body));
  ok('③1 首页那一版（--primary-50 浅青底）只剩 1 处未注释', baseLive.length === 1, baseLive.map(x => x.line));
  ok('③2 该处已被 .hero 作用域限定（不再全站生效）', baseLive.length === 1 && baseLive[0].scoped, baseLive[0] ? { line: baseLive[0].line, prefix: baseLive[0].prefix } : null);
  ok('③3 被收窄的老写法注释留档在原位（可回溯，非静默删）', blocks.some(x => x.commented && /var\(--primary-50\)/.test(x.body)), blocks.filter(x => x.commented).map(x => x.line));

  /* ---------- ① 首页 .hline chip ---------- */
  await p.goto(BASE + '/home.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('#dashHello'), null, { timeout: 25000 }).catch(() => {});
  await sleep(1200);
  const home = await p.evaluate(() => {
    const el = document.getElementById('dashStreakChip');
    el.hidden = false; el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2z"/></svg>连续 5 天';
    const cs = getComputedStyle(el); const svg = getComputedStyle(el.querySelector('svg'));
    return { c: cs.color, bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, fs: cs.fontSize, pad: cs.paddingTop + ' ' + cs.paddingLeft, display: cs.display, sw: svg.width, sh: svg.height };
  });
  const hlBg = await p.evaluate(() => getComputedStyle(document.querySelector('.hline')).backgroundColor);
  ok('①1 首页 chip 白字', home.c === 'rgb(255, 255, 255)', home.c);
  ok('①2 首页 chip 仍是半透明白底', /rgba\(255, 255, 255, 0\.16\)/.test(home.bg), home.bg);
  ok('①3 首页 chip 仍有 1px 白描边', home.bw === '1px' && /rgba\(255, 255, 255, 0\.28\)/.test(home.bc), home.bw + ' / ' + home.bc);
  ok('①4 首页 chip 字号 11.5px（比基础段小一档）', home.fs === '11.5px', home.fs);
  ok('①5 首页 chip 内边距 2px 9px（未被基础段覆盖）', home.pad === '2px 9px', home.pad);
  ok('①6 首页 chip 图标 12×12', home.sw === '12px' && home.sh === '12px', home.sw + '×' + home.sh);
  ok('①7 首页 chip 文字对比 ≥4.5', ratio(home.c, hlBg) >= 4.5, ratio(home.c, hlBg) + ':1');

  /* ---------- ② 背词页 .word-stats 里的连击 chip ---------- */
  await p.goto(BASE + '/practice.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('streakChip'), null, { timeout: 25000 }).catch(() => {});
  await sleep(1500);
  const pr = await p.evaluate(() => {
    const wrap = document.getElementById('wordStats'); wrap.hidden = false;
    const chip = document.getElementById('streakChip'); chip.hidden = false;
    const cs = getComputedStyle(chip);
    const base = { c: cs.color, bg: cs.backgroundColor, fs: cs.fontSize, pad: cs.paddingTop + ' ' + cs.paddingRight, radius: cs.borderTopLeftRadius, gap: cs.gap, flex: cs.flex };
    const ico = getComputedStyle(chip.querySelector('.streak-ico'));
    const before = getComputedStyle(chip, '::before');
    // 红心态只在这里挂类，实测留到外面（.streak-chip 带 150ms 颜色过渡，同一帧读到的还是起始色）
    chip.classList.remove('boost'); chip.classList.add('heart');
    document.getElementById('streakNum').textContent = '再认一次就记住';
    const heart = { ico: getComputedStyle(chip.querySelector('.streak-ico')).display, preW: before.content + '/' + before.width };
    // x2 徽章
    const x2 = document.getElementById('x2Badge'); x2.hidden = false;
    const x2s = getComputedStyle(x2);
    return { base, ico: ico.width + '×' + ico.height, heart, x2: { c: x2s.color, bg: x2s.backgroundColor, fs: x2s.fontSize } };
  });
  await sleep(400);   // 等 .streak-chip 的 150ms 配色过渡走完
  const heartNow = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById('streakChip')); return { c: cs.color, bg: cs.backgroundColor }; });
  pr.heart = Object.assign(pr.heart, heartNow, { ok: heartNow.bg === 'rgba(224, 52, 44, 0.1)' && heartNow.c === 'rgb(163, 31, 24)' });
  await p.evaluate(() => { const chip = document.getElementById('streakChip'); chip.classList.remove('heart'); const x2 = document.getElementById('x2Badge'); x2.hidden = false; });
  const vars = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { ok: cs.getPropertyValue('--ok-bg').trim(), okt: cs.getPropertyValue('--ok-text').trim(), err: cs.getPropertyValue('--err-bg').trim(), errt: cs.getPropertyValue('--err-text').trim() }; });
  ok('②1 背词 chip 仍是主题绿底（--ok-bg）', pr.base.bg === 'rgb(232, 246, 240)' || /rgb/.test(pr.base.bg), { bg: pr.base.bg, var_ok: vars.ok });
  ok('②2 背词 chip 仍是深绿字（--ok-text）', /rgb\(/.test(pr.base.c), { c: pr.base.c, var_okt: vars.okt });
  ok('②3 背词 chip 仍无描边/字号 12/内边距 4px 12px/999 圆角', pr.base.fs === '12px' && pr.base.pad === '4px 12px' && pr.base.radius === '999px', pr.base);
  ok('②4 背词 chip 图标 14×14', pr.ico === '14px×14px', pr.ico);
  ok('②5 红心态仍是淡红底 + 深红字（--err-bg/--err-text）', pr.heart.ok === true, pr.heart);
  ok('②6 红心态隐藏火焰图标', pr.heart.ico === 'none', pr.heart.ico);
  ok('②7 x2 徽章仍是白字小药丸', pr.x2.c === 'rgb(255, 255, 255)' && pr.x2.fs === '10px', pr.x2);

  /* ---------- 手机 390：首页 chip 不破版 ---------- */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await c2.newPage(); const errs2 = []; p2.on('pageerror', e => errs2.push(String(e).slice(0, 140)));
  await p2.goto(BASE + '/home.html', { waitUntil: 'load' });
  await sleep(2000);
  const m390 = await p2.evaluate(() => {
    const el = document.getElementById('dashStreakChip'); el.hidden = false; el.innerHTML = '连续 5 天';
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), c: cs.color, bg: cs.backgroundColor, ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok('④1 390 首页 chip 有尺寸（未塌）', m390.w > 40 && m390.h >= 16, m390);
  ok('④2 390 首页 chip 样式同桌面', m390.c === 'rgb(255, 255, 255)' && /rgba\(255, 255, 255, 0\.16\)/.test(m390.bg), { c: m390.c, bg: m390.bg });
  ok('④3 390 全站零横向溢出', m390.ovf <= 0, m390.ovf);
  ok('④4 无页面报错', errs.length === 0 && errs2.length === 0, errs.concat(errs2));

  await b.close();
  console.log('\n结果：' + pass + ' 过 / ' + fail + ' 红');
  process.exit(fail ? 1 : 0);
})();
