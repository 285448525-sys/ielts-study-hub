/* 计时页渲染复现探针：本地静态服务 + Edge headless，截图 + 抓控制台 + 关键计算样式 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const PW_EXECUTABLE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8961';
const OUT = path.join(__dirname, '..', 'design', '_timer1017');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_EXECUTABLE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await pg.goto(BASE + '/timer.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForTimeout(2500);

  const info = await pg.evaluate(() => {
    const r = {};
    const g = (sel) => document.querySelector(sel);
    const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { w: s.width, h: s.height, disp: s.display, bg: s.backgroundColor, col: s.color, pad: s.padding, bd: s.borderRadius }; };
    r.stage = cs(g('.timer-stage'));
    r.live = cs(g('#liveTimer'));
    r.goalInput = cs(g('#goalMin'));
    r.mods = cs(g('#timerMods'));
    r.modCards = document.querySelectorAll('#timerMods .mod-card').length;
    r.recMini = cs(g('.rec-mini'));
    r.recEmptyHidden = g('#recEmpty') ? g('#recEmpty').hidden : null;
    r.mainW = g('main') ? getComputedStyle(g('main')).maxWidth : null;
    r.containerW = g('.container') ? Math.round(g('.container').getBoundingClientRect().width) : null;
    r.timerCssLoaded = Array.from(document.styleSheets).some(s => (s.href || '').indexOf('css/p/timer.css') > -1);
    r.timerCssOk = (() => { try { const s = Array.from(document.styleSheets).find(x => (x.href || '').indexOf('css/p/timer.css') > -1); return s ? s.cssRules.length : -1; } catch (e) { return 'err:' + e.message; } })();
    r.scrollW = document.documentElement.scrollWidth;
    return r;
  });
  console.log('INFO ' + JSON.stringify(info, null, 1));
  await pg.screenshot({ path: path.join(OUT, 'desktop.png') });

  // 手机
  const m = await ctx.newPage();
  m.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(BASE + '/timer.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await m.waitForTimeout(2000);
  await m.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
  const mInfo = await m.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, cards: document.querySelectorAll('#timerMods .mod-card').length }));
  console.log('MOBILE ' + JSON.stringify(mInfo));

  console.log('ERRORS ' + (errs.length ? errs.join(' | ') : '(none)'));
  await browser.close();
})().catch(e => { console.error('PROBE FAIL ' + e.message); process.exit(1); });
