// 考前操作指南卡（P1-2）专项探针
// 用法：node tests/_probe_guide_1018.cjs <baseUrl>
// 判据要点：① 只在第一次进某科时出现 ② 出现时答题页还没渲染、倒计时没开始
// ③ 点「知道了」才进考场 ④ 之后永不再弹 ⑤ 阅读/听力各记一次（互不影响）
// 11-15 PERM-REG-1 / T-001：页内 #mockTabs 收进顶栏二级，听力改用隐藏 tab 的
// JS .click()（paintTab 转发仍在）；外部 mp3 CDN 证书 / 资源错精确排除，不吞真实 JS 错。
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => R.push((ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  ｜ ' + info : ''));

const guideState = () => {
  const g = document.getElementById('exGuide');
  if (!g) return { exists: false };
  const r = g.getBoundingClientRect();
  const items = Array.from(g.querySelectorAll('.exg-i')).map(el => ({
    // 10/20：4 个图标全是 SVG（她 ③ 全站禁 emoji，旗标字符 ⚑ 也已换成 ICO_FLAG SVG）
    icon: !!el.querySelector('svg') || /^[A-Za-z0-9.×]+$/.test(String(el.querySelector('.exg-ic').textContent || '')),
    title: String(el.querySelector('b').textContent || '').trim(),
    sub: String(el.querySelector('span:last-child').textContent || '').trim()
  }));
  return {
    exists: true, w: Math.round(r.width), h: Math.round(r.height),
    title: String(g.querySelector('h4').textContent || '').trim(),
    items, n: items.length,
    btn: String((g.querySelector('.exg-go') || {}).textContent || '').trim(),
    hasClose: !!g.querySelector('.exg-x'),
    examVisible: (() => { const e = document.getElementById('examRoot'); return e ? !e.hidden : null; })(),
    timerStarted: !!document.getElementById('exTimer')
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await page.addInitScript(() => { try{localStorage.setItem('hub_exam_timer_auto','20');}catch(e){} try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true })); } catch (e) { } });

  console.log('=== A. 第一次进阅读：先出指南，不直接开考 ===');
  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1300);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(700);
  let g = await page.evaluate(guideState);
  console.log('  ' + JSON.stringify(g).slice(0, 400));
  ck('A1 弹出指南卡', g.exists === true);
  ck('A2 卡可见（有宽高）', g.exists && g.w > 300 && g.h > 100, g.w + 'x' + g.h);
  ck('A3 正好 4 条', g.n === 4, 'n=' + g.n);
  ck('A4 四条标题对得上', g.exists && g.items.map(i => i.title).join('|') === '全屏|倍速 / 音量|标记本题|底栏切篇', JSON.stringify(g.items.map(i => i.title)));
  ck('A5 每条都有图标（不是空方块）', g.exists && g.items.every(i => i.icon));
  ck('A6 每条都有一句说明', g.exists && g.items.every(i => i.sub.length > 6));
  ck('A7 答题页还没渲染、倒计时没开始', g.examVisible === false && g.timerStarted === false, 'exam=' + g.examVisible + ' timer=' + g.timerStarted);
  ck('A8 有「知道了，开始」按钮和右上关闭', /知道了/.test(g.btn) && g.hasClose);

  console.log('=== B. 点「知道了」→ 才进考场，且不再弹 ===');
  await page.click('.exg-go');
  await page.waitForTimeout(2200);
  g = await page.evaluate(guideState);
  const b = await page.evaluate(() => {
    const e = document.getElementById('examRoot');
    return { guideGone: !document.getElementById('exGuide'), examVisible: e ? !e.hidden : null, hasQ: !!document.querySelector('#examRoot .ex-flagq'), once: (() => { try { return localStorage.getItem('hub_exam_guide_once'); } catch (e2) { return 'ERR'; } })() };
  });
  console.log('  ' + JSON.stringify(b));
  ck('B1 指南卡已消失', b.guideGone === true);
  ck('B2 真的进了考场且有题目', b.examVisible === true && b.hasQ === true);
  ck('B3 看过标记已落本地（全局一次闸）', b.once === '1', 'once=' + b.once);

  console.log('=== C. 退出再进同一科：不再弹 ===');
  await page.click('#examRoot [data-exit]');
  await page.waitForTimeout(1600);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(1500);
  g = await page.evaluate(guideState);
  ck('C1 第二次进阅读不再弹卡', g.exists === false);
  const c2 = await page.evaluate(() => { const e = document.getElementById('examRoot'); return { v: e ? !e.hidden : null, q: !!document.querySelector('#examRoot .ex-flagq') }; });
  ck('C2 直接进了考场', c2.v === true && c2.q === true, JSON.stringify(c2));

  console.log('=== D. 清掉一次性闸后再进（听力）：仍弹一次，Esc 关掉也算看过 ===');
  await page.click('#examRoot [data-exit]');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.removeItem('hub_exam_guide_once'); } catch (e) {} });
  /* 11-15 T-001：隐藏页内 tab 仍保留 DOM 与 paintTab 转发，走产品自己的 click 通道。 */
  const listeningShown = await page.evaluate(() => {
    const t = document.querySelector('#mockTabs [data-mtab="listening"]');
    if (!t) return false;
    t.click();
    return document.getElementById('bankRoot').getAttribute('data-mock-tab') === 'listening';
  });
  ck('D0 顶栏二级切到听力（隐藏页内 tab 仍可转发）', listeningShown);
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('#listenList [data-unit]').click());
  await page.waitForTimeout(800);
  g = await page.evaluate(guideState);
  ck('D1 清了闸之后进听力仍然弹卡', g.exists === true && g.n === 4);
  // 用 Esc 关闭，验证「关掉也算看过」
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2200);
  const d2 = await page.evaluate(() => ({
    gone: !document.getElementById('exGuide'),
    exam: (() => { const e = document.getElementById('examRoot'); return e ? !e.hidden : null; })(),
    once: (() => { try { return localStorage.getItem('hub_exam_guide_once'); } catch (e) { return 'ERR'; } })(),
    legacyRead: (() => { try { return localStorage.getItem('hub_exam_guide_v2_reading'); } catch (e) { return 'ERR'; } })()
  }));
  console.log('  ' + JSON.stringify(d2));
  ck('D2 Esc 也能关，且算作看过（全局一次闸）', d2.gone === true && d2.once === '1');
  ck('D3 关掉后照样进考场', d2.exam === true);
  ck('D4 不再写按渠道的旧标记（一次性口径已取代）', d2.legacyRead === null, 'legacy=' + d2.legacyRead);

  console.log('=== E. 完整模考入口也走同一道闸（换新账号视角：清标记）===');
  /* 🔵 11-17「操作引导一次性，老用户不再弹」：新增全局一次闸 hub_exam_guide_once，
     它会盖过按渠道的 v2 标记 —— 这里三个键都要清，否则完整模考那一段永远等不到卡。 */
  await page.evaluate(() => { try { localStorage.removeItem('hub_exam_guide_v2_reading'); localStorage.removeItem('hub_exam_guide_v2_listening'); localStorage.removeItem('hub_exam_guide_once'); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1300);
  await page.waitForSelector('[data-fullstart]:not([disabled])', { timeout: 30000 });
  await page.click('[data-fullstart]');
  await page.waitForTimeout(700);
  g = await page.evaluate(guideState);
  ck('E1 完整阅读模考也先弹卡', g.exists === true);
  await page.click('.exg-go');
  await page.waitForTimeout(3000);
  const e2 = await page.evaluate(() => ({ gone: !document.getElementById('exGuide'), exam: (() => { const e = document.getElementById('examRoot'); return e ? !e.hidden : null; })(), q: !!document.querySelector('#examRoot .ex-flagq') }));
  ck('E2 关掉后进完整模考', e2.gone && e2.exam === true && e2.q === true, JSON.stringify(e2));

  console.log('=== G. 卡片开着时软导航离开：不能留在屏幕上挡住全站 ===');
  await page.evaluate(() => { try { localStorage.removeItem('hub_exam_guide_v2_reading'); localStorage.removeItem('hub_exam_guide_once'); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1300);
  await page.waitForSelector('#bankList [data-unit]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('#bankList [data-unit]').click());
  await page.waitForTimeout(700);
  const gOpen = await page.evaluate(() => !!document.getElementById('exGuide'));
  ck('G1 卡片已弹出（准备软导航）', gOpen === true);
  const nav = await page.evaluate(() => {
    const a = document.querySelector('a[data-id][href$=".html"]');
    if (!a) return 'no-link';
    a.click(); return a.getAttribute('href');
  });
  await page.waitForTimeout(2600);
  const g2 = await page.evaluate(() => ({
    guideGone: !document.getElementById('exGuide'),
    examGone: !document.getElementById('examRoot') || document.getElementById('examRoot').hidden === true,
    url: location.pathname,
    leaked: !!(document.body.classList.contains('mock-immerse'))
  }));
  console.log('  nav=' + nav + ' ' + JSON.stringify(g2));
  ck('G2 软导航后卡片已自动收起（不残留遮罩）', g2.guideGone === true);
  ck('G3 没有顺手跳进考场', g2.examGone === true);
  ck('G4 确实软导航走了（URL 已变）', nav !== 'no-link' && !/bank/.test(g2.url), 'url=' + g2.url);

  console.log('=== F. 控制台错误 ===');
  // 10/20：本机系统代理 127.0.0.1:7897 对某些外链不通 → net::ERR_PROXY_CONNECTION_FAILED
  // 是机器网络噪音、不是页面 JS 错，排除掉（noans2 / examtools 两支同样口径）。
  const real = errs.filter(x => !/Failed to load resource: the server responded with a status of 404/.test(x)
    && !/ERR_PROXY_CONNECTION_FAILED/.test(x)
    && !/ERR_CERT_AUTHORITY_INVALID/.test(x)
    && !/\[hub-error\] resource.*part-exam-audio.*\.mp3/.test(x));
  ck('F1 无 JS 报错（代理类 console 报错排除）', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
