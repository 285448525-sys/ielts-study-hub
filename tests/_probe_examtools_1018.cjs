// 模考工具栏探针（10/20 重写）
// 原版断言「眼睛标（隐藏计时按钮）」整套行为 —— 她 10/20 明确「眼睛标删了」（顶栏/音频条都不该有），
// 且「听力单篇不显示计时」。所以旧探针测的功能已不存在，不是产品回归。
// 新版口径（全部对着她 10/20 的 ①②③④⑤ 写）：
//   A #exFsBtn 存在、可见、且里面装的是 SVG（不是 emoji 字符）
//   B #exHideBtn 整个不存在（阅读 + 听力单篇都查）
//   C 听力单篇：工具栏真的可见（mountListenTools 搬进音频条后没被 display:none 吞掉）
//   D 点 #exFsBtn 调用了 requestFullscreen
//   E 音频条：音量按钮是 SVG；倍速是 <select>（MOCK-AUDIO-CTRL-1 起 0.5–2.0，0.1 一档）
//   F 眼睛标的本地存储键不再被写入
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => { const l = (ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  | ' + info : ''); R.push(l); console.log(l); };

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true }));
      localStorage.setItem('hub_exam_guide_v2_reading', '1');
      localStorage.setItem('hub_exam_guide_v2_listening', '1');
    } catch (e) { }
  });

  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(1500);

  const s = await page.evaluate(() => {
    const fs = document.getElementById('exFsBtn');
    const hb = document.getElementById('exHideBtn');
    return {
      fsExists: !!fs,
      fsVisible: !!(fs && fs.getBoundingClientRect().width > 0),
      fsSvg: !!(fs && fs.querySelector('svg')),
      fsEmoji: !!(fs && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fs.textContent || '')),
      hideExists: !!hb,
      stored: (() => { try { return localStorage.getItem('hub_exam_hide_timer_v1'); } catch (e) { return 'ERR'; } })()
    };
  });
  ck('A1 #exFsBtn 存在且可见', s.fsExists && s.fsVisible, JSON.stringify(s));
  ck('A2 全屏按钮里是 SVG（不是 emoji）', s.fsSvg && !s.fsEmoji);
  ck('A3 眼睛标 #exHideBtn 已彻底不存在', s.hideExists === false);

  // D：点全屏 → 确实调了 Fullscreen API（headless 下只验证调用发生）
  await page.evaluate(() => {
    window.__fsCalls = 0;
    const d = document.documentElement;
    d.requestFullscreen = function () { window.__fsCalls++; return Promise.resolve(); };
    d.exitFullscreen = function () { window.__fsCalls++; return Promise.resolve(); };
  });
  await page.click('#exFsBtn');
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__fsCalls);
  ck('A4 点 #exFsBtn → 调用了 requestFullscreen', calls >= 1, 'calls=' + calls);

  // C/E：听力单篇，工具栏搬进音频条后仍可见；音量 SVG、倍速 select
  await page.click('#examRoot [data-exit]');
  /* 🔴 3-2 补：退出考场 → hubExamLock(false,…,flushHeal=true) 会把模考期间攒下的
     「待刷新」在 **800ms 后 location.reload()**（js/common-shell.js:78-90）。
     不等它打完就去 goto/点击，reload 会把点击的 DOM 竞速掉 —— 实测听力单篇永远点不进。 */
  await page.waitForTimeout(1600);
  /* 🔴 10-23 3-2 修：2-1d 批 B 撤了桌面页内小 tab（bank.html:1679 @media(min-width:861px)
     #mockTabs{display:none}），探针原来点 [data-mtab="listening"] 在 1440 宽必超时。
     桌面切分栏的正规途径 = 顶栏「模考」二级（tbSubHandoff）或直达 ?sub=listening
     （js/bank.js:4230 tbApplySub 的 URL 通道，等 manifest 后 paintTab）。
     这里走 URL 通道，等效于用户点顶栏二级落地。 */
  await page.goto(BASE + '/bank.html?sub=listening', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#listenList [data-unit]', { timeout: 30000 });
  /* 防竞速：挂窗口标记，1.2s 后还在 = 没有被 reload 冲掉，点击才有效 */
  await page.evaluate(() => { window.__probeMark = Date.now(); });
  await page.waitForTimeout(1200);
  const markAlive = await page.evaluate(() => !!window.__probeMark);
  if (!markAlive) {
    // 标记没了 = 期间被 reload → 重新等列表并重挂一次
    await page.waitForSelector('#listenList [data-unit]', { timeout: 30000 });
    await page.waitForTimeout(800);
  }
  const tabNow = await page.evaluate(() => document.getElementById('bankRoot').getAttribute('data-mock-tab'));
  ck('B0 ?sub=listening 落地后 tab = listening（顶栏二级通道活着）', tabNow === 'listening', 'tab=' + tabNow);
  await page.evaluate(() => { const el = document.querySelector('#listenList [data-unit]'); if (el) el.click(); });
  await page.waitForTimeout(2200);
  /* 3-2 调试：B 段失败时把现场打出来（audioBar 没挂上看是哪一环断了） */
  const dbg = await page.evaluate(() => ({
    examDisp: (document.getElementById('examRoot') || {}).style ? getComputedStyle(document.getElementById('examRoot')).display : 'no-el',
    audioBar: !!document.getElementById('exAudioBar'),
    listenHead: (document.getElementById('listenList') || {}).textContent ? document.getElementById('listenList').textContent.trim().slice(0, 60) : null,
    stateBox: (document.querySelector('#examRoot .bk-state') || {}).textContent ? document.querySelector('#examRoot .bk-state').textContent.trim().slice(0, 60) : null
  }));
  if (!dbg.audioBar) console.log('  [dbg] 听力单篇未进考场:', JSON.stringify(dbg));
  const lv = await page.evaluate(() => {
    const box = el => { const r = el && el.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; };
    const bar = document.getElementById('exAudioBar');
    return {
      hasAudioBar: !!bar,
      fs: box(document.getElementById('exFsBtn')),
      hide: box(document.getElementById('exHideBtn')),
      inBar: !!(bar && bar.contains(document.getElementById('exFsBtn'))),
      volSvg: (() => { const v = document.querySelector('#exAudioBar [data-avol]'); return !!(v && v.querySelector('svg') && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(v.textContent || '')); })(),
      rateSel: !!document.getElementById('eaRate'),
      rateN: (() => { const s = document.getElementById('eaRate'); return s ? s.options.length : 0; })(),
      rateMin: (() => { const s = document.getElementById('eaRate'); return s ? s.options[0].value : ''; })(),
      rateMax: (() => { const s = document.getElementById('eaRate'); return s ? s.options[s.options.length - 1].value : ''; })(),
      fullTimer: !!document.getElementById('eaFullTimer')
    };
  });
  ck('B1 听力单篇：音频条在', lv.hasAudioBar);
  ck('B2 听力单篇：工具栏真实可见（没被 display:none 吞掉）', !!(lv.fs && lv.fs.w > 0), JSON.stringify(lv.fs));
  ck('B3 听力单篇：工具栏就在音频条那一行', lv.inBar === true);
  ck('B4 听力单篇：没有眼睛标', !lv.hide);
  ck('B5 听力单篇：不显示整场计时（她 ⑤）', lv.fullTimer === false);
  ck('B6 音量按钮是 SVG、无 emoji', lv.volSvg === true);
  /* MOCK-AUDIO-CTRL-1（10-31）：倍速扩到 0.5–2.0。判据改成**序数比较**，不再写死档数与端值
     （写死字面量今天已经过期一次）。守的仍是同一件事：倍速是个可选档位的下拉、范围覆盖常用区间。 */
  ck('B7 倍速是 select，覆盖 0.5–2.0 且至少 6 档', lv.rateSel && lv.rateN >= 6 && Number(lv.rateMin) <= 0.5 && Number(lv.rateMax) >= 2,
     'n=' + lv.rateN + ' min=' + lv.rateMin + ' max=' + lv.rateMax);

  await page.selectOption('#eaRate', '1.3');
  await page.waitForTimeout(300);
  const rate = await page.evaluate(() => { const a = document.getElementById('exAudio'); return a ? a.playbackRate : null; });
  ck('B8 选 1.3 → playbackRate = 1.3', rate === 1.3, 'rate=' + rate);

  /* D 段：2-1d 批 B 口径 —— 桌面 ≥861 页内小 tab 撤、手机 ≤860 保留（顶栏隐藏时的唯一入口） */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  ck('D1 桌面 1280：页内小 tab 已撤（display:none）', await page.evaluate(() => getComputedStyle(document.getElementById('mockTabs')).display === 'none'));
  await page.setViewportSize({ width: 860, height: 900 });
  await page.waitForTimeout(600);
  ck('D2 手机 860：页内小 tab 保留（可见）', await page.evaluate(() => { const t = document.getElementById('mockTabs'); return t && t.getBoundingClientRect().width > 0; }));

  const stored = await page.evaluate(() => { try { return localStorage.getItem('hub_exam_hide_timer_v1'); } catch (e) { return 'ERR'; } });
  ck('C1 眼睛标的旧存储键没被新代码写入', stored === null, 'stored=' + stored);

  const real = errs.filter(x => !/Failed to load resource: the server responded with a status of 404/.test(x)
    && !/ERR_PROXY_CONNECTION_FAILED/.test(x));
  ck('Z1 无 JS 报错（代理类 console 报错排除）', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
