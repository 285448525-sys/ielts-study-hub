/* 10/17 性能批 · 手机上到底卡在哪：用真实设备画像（4x CPU 降速 + 4G/慢 4G 网络）
   为什么必须降速：桌面 headless 上 DCL 109~135ms、长任务 1 个，看不出问题；
   她的实际场景是手机 + 4G。Chrome DevTools 的标准移动画像（Moto G4 / Slow 4G）。
   同时量 CLS（布局抖动）—— 这是「不流畅」最容易被忽略的一半。
   跑法：node tests/_with_server.cjs tests/_probe_mobile_1017.cjs 8863
*/
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8863';
const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function measure(b, label, page, opts) {
  const c = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
  });
  await c.addInitScript(() => {
    try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true })); } catch (e) {}
    try { if (!localStorage.getItem('ielts_study_hub_v1')) localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } })); } catch (e) {}
  });
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  // 4x CPU 降速（DevTools 标准移动画像）
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu || 4 });
  // Slow 4G：下行 400kbps / 上行 400kbps / RTT 400ms（DevTools「Slow 4G」预设）
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: opts.rtt || 400,
    downloadThroughput: (opts.dl || 400) * 1024 / 8, uploadThroughput: 400 * 1024 / 8
  });

  await p.addInitScript(() => {
    window.__lt = []; window.__cls = 0; window.__shifts = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    try {
      new PerformanceObserver(l => l.getEntries().forEach(e => {
        if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(Math.round(e.value * 1000) / 1000); }
      })).observe({ entryTypes: ['layout-shift'] });
    } catch (e) {}
  });

  const t0 = Date.now();
  await p.goto(BASE + '/' + page, { waitUntil: 'load', timeout: 120000 }).catch(() => {});
  // 等首屏稳定（她感知的“能用了”）
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
    const res = performance.getEntriesByType('resource');
    let tr = 0, dec = 0;
    res.forEach(r => { tr += r.transferSize || 0; dec += r.decodedBodySize || 0; });
    const lt = window.__lt || [];
    // 首屏可交互：main 里出现实际内容的时间粗估（DOM 数够多）
    const mainEl = document.querySelector('main');
    return {
      ttfb: Math.round(nav.responseStart || 0), fcp: Math.round(fcp),
      dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0),
      lt, ltSum: lt.reduce((a, x) => a + x, 0), ltMax: Math.max(0, ...lt),
      cls: Math.round((window.__cls || 0) * 1000) / 1000, shifts: (window.__shifts || []).slice(0, 6),
      reqs: res.length, transfer: Math.round(tr / 1024), decoded: Math.round(dec / 1024),
      mainLen: mainEl && mainEl.textContent ? mainEl.textContent.trim().length : 0,
      jank: lt.filter(x => x > 150).length
    };
  });
  console.log('\n--- ' + label + '（' + page + '）');
  console.log('   TTFB ' + m.ttfb + ' · FCP ' + m.fcp + ' · DCL ' + m.dcl + ' · load ' + m.load + ' · 挂钟 ' + (Date.now() - t0) + 'ms');
  console.log('   请求 ' + m.reqs + ' 条 · 传输 ' + m.transfer + 'KB · 解压 ' + m.decoded + 'KB · main ' + m.mainLen + ' 字');
  console.log('   长任务 ' + m.lt.length + ' 个（>150ms 卡顿 ' + m.jank + ' 个）· 合计 ' + m.ltSum + 'ms · 最长 ' + m.ltMax + 'ms');
  console.log('   CLS ' + m.cls + (m.shifts.length ? '  偏移明细 ' + m.shifts.join(' / ') : ''));
  await c.close();
  return m;
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const pages = ['home.html', 'bank.html', 'speaking.html', 'words.html'];
  for (const pg of pages) {
    // 冷启动（无缓存）
    await measure(b, '手机 Slow4G + 4xCPU · 冷启动', pg, {});
  }
  console.log('\n===== 对照：不降速（桌面条件）看同一页 =====');
  await measure(b, '无降速', 'home.html', { cpu: undefined, rtt: 0, dl: 100000 });
  await b.close();
})().catch(e => { console.error('MOBILE PERF ERROR', e); process.exit(1); });
