/* 10/17 性能批第二批 · 关键路径分解
   目的：在手机 Slow4G 画像下，把 FCP 之前的串行链逐段拆开 ——
   到底是「TTFB 高」「资源体积大」「脚本阻塞」还是「CSS 阻塞渲染」。
   只测量，不判定。输出每一段：请求发起 → 响应首字节 → 响应结束 → 脚本求值结束。
   跑法：BASE=https://yasihub.com node tests/_probe_chain_1017.cjs
*/
const { chromium } = require('playwright-core');
const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || 'https://yasihub.com';
const PAGES = (process.env.PAGES || 'home.html,bank.html,speaking.html').split(',');

const SEED = () => {
  if (!localStorage.getItem('hub_onboarding_v2')) {
    localStorage.setItem('hub_onboarding_v2', JSON.stringify({ v: 2, entered: true, finished: true, snoozed: true, setup: { examDate: '2026-12-01', hours: 2, bank: 'custom' } }));
  }
  if (!localStorage.getItem('ielts_study_hub_v1')) {
    localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ settings: { examDate: '2026-12-01' } }));
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  for (const page of PAGES) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Moto G4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
    });
    await ctx.addInitScript(SEED);
    const pg = await ctx.newPage();
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });

    const t0 = Date.now();
    await pg.goto(BASE + '/' + page, { waitUntil: 'load', timeout: 60000 });   // 10/21：Slow4G+4xCPU 下 3 页压在 30s 临界，回归串联时偶发 TimeoutError，放宽到 60s（本支只测量不判定）
    await pg.waitForTimeout(3000);

    const data = await pg.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const fcpE = performance.getEntriesByName('first-contentful-paint')[0] || {};
      const res = performance.getEntriesByType('resource');
      const bare = n => (n || '').split('?')[0];
      const rows = res.map(r => ({
        n: bare(r.name).replace(location.origin, ''),
        q: (r.name.split('?')[1] || ''),
        start: Math.round(r.startTime),
        ttfb: Math.round((r.responseStart || 0) - r.startTime),
        dur: Math.round(r.duration),
        end: Math.round(r.responseEnd || 0),
        tr: r.transferSize || 0,
        dec: r.decodedBodySize || 0,
        type: r.initiatorType
      })).sort((a, b) => a.start - b.start);
      return {
        fcp: Math.round(fcpE.startTime || 0),
        dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
        ttfbNav: Math.round(nav.responseStart || 0),
        rows
      };
    });

    console.log('\n===== ' + page + ' @390 Slow4G/4xCPU =====');
    console.log('nav TTFB ' + data.ttfbNav + ' | FCP ' + data.fcp + ' | DCL ' + data.dcl + ' | load ' + data.load);
    console.log('--- 请求按发起时刻 ---');
    data.rows.forEach(r => {
      console.log(
        String(r.start).padStart(6) + 'ms →' +
        (' ttfb ' + r.ttfb).padStart(10) +
        (' end ' + r.end).padStart(10) +
        (' tr ' + (r.tr / 1024).toFixed(1) + 'KB').padStart(12) +
        (' dec ' + (r.dec / 1024).toFixed(1) + 'KB').padStart(13) +
        '  ' + r.n + (r.q ? '?' + r.q : '')
      );
    });
    // 关键链路：CSS / data.js / common.js 的结束时刻 vs FCP
    const cssEnd = Math.max(0, ...data.rows.filter(r => /\.css$/.test(r.n)).map(r => r.end));
    const jsEnd = Math.max(0, ...data.rows.filter(r => /\.js$/.test(r.n)).map(r => r.end));
    console.log('--- 汇总 ---');
    console.log('所有 CSS 结束 @' + cssEnd + 'ms（FCP 前必须）| 所有 JS 结束 @' + jsEnd + 'ms | FCP @' + data.fcp + 'ms');
    console.log('传输合计 ' + (data.rows.reduce((a, r) => a + r.tr, 0) / 1024).toFixed(0) + 'KB / 解压 ' + (data.rows.reduce((a, r) => a + r.dec, 0) / 1024).toFixed(0) + 'KB / ' + data.rows.length + ' 请求');
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
