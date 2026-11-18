// 完整模考入口卡「上次成绩」（P0-2）专项探针
// 用法：node tests/_probe_fulllast_1018.cjs <baseUrl>
// 判据：有记录 → 「上次 32/40 · <相对日期>」+ 进度条宽度正确；无记录 → 明确灰字，不出现假数字。
// 11-15 PERM-REG-1 / T-001：页内 #mockTabs 在所有宽度收进顶栏二级，DOM 保留供程序点击；
// 听力改用隐藏 tab 的 JS .click()（paintTab 转发仍在），不再用 Playwright 可见点击。
// 11-12 P2 B：入口卡定版成一行细白条，空态 .fc-last.is-none 按设计隐藏；
// 原「空态行可见」「卡片 >100px」判据改成「文案仍在 DOM + 细白条本身不塌不溢出」。
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const R = [];
const ck = (n, ok, info) => R.push((ok ? '  ✅ ' : '  ❌ ') + n + (info ? '  ｜ ' + info : ''));

function dkey(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() - (offsetDays || 0));
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function readCard(page, ch) {
  return await page.evaluate((channel) => {
    const box = document.querySelector('[data-full-last="' + channel + '"]');
    if (!box) return { exists: false };
    const r = box.getBoundingClientRect();
    const bar = box.querySelector('.fl-bar i');
    return {
      exists: true,
      text: String(box.textContent || '').replace(/\s+/g, ' ').trim(),
      cls: box.className,
      w: Math.round(r.width), h: Math.round(r.height),
      barW: bar ? bar.style.width : null,
      visible: getComputedStyle(box).display !== 'none' && r.height > 0
    };
  }, ch);
}
async function showListeningTab(page) {
  return await page.evaluate(() => {
    const btn = document.querySelector('#mockTabs [data-mtab="listening"]');
    if (!btn) return false;
    btn.click();
    return document.getElementById('bankRoot').getAttribute('data-mock-tab') === 'listening';
  });
}

async function seed(page, recs) {
  await page.evaluate((list) => {
    let d;
    try { d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || 'null'); } catch (e) { d = null; }
    if (!d) { d = {}; }
    d.mockRecords = list;
    localStorage.setItem('ielts_study_hub_v1', JSON.stringify(d));
  }, recs);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights/.test(m.text())) errs.push('[c] ' + m.text()); });
  await page.addInitScript(() => { try{localStorage.setItem('hub_exam_timer_auto','20');}catch(e){} try { localStorage.setItem('hub_onboarding_v2', JSON.stringify({ finished: true })); localStorage.getItem('hub_exam_guide_v2_reading') || localStorage.setItem('hub_exam_guide_v2_reading','1'); localStorage.getItem('hub_exam_guide_v2_listening') || localStorage.setItem('hub_exam_guide_v2_listening','1'); } catch (e) { } });

  console.log('=== A. 空白账号：不该出现假成绩 ===');
  await page.goto(BASE + '/bank.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await seed(page, []);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  let c = await readCard(page, 'reading');
  console.log('  ' + JSON.stringify(c));
  ck('A1 卡片里存在「上次成绩」行', c.exists);
  ck('A2 空账号给明确的灰字提示', /还没做过完整阅读模考/.test(c.text), c.text);
  ck('A3 空账号不出现假分数（无 数字/数字）', !/\d+\s*\/\s*\d+/.test(c.text), c.text);
  /* 11-15：11-12 P2 B 把空态 fc-last 改成 display:none（is-none），
     不再拿隐藏小行量高度；改验文案 DOM 在 + 整张细白条有真实高度。 */
  const aCardH = await page.evaluate(() => Math.round(document.querySelector('#fullEntry .full-card').getBoundingClientRect().height));
  ck('A4 空态文案仍在 DOM，入口细白条不塌（' + aCardH + 'px）', c.exists && !c.visible && aCardH >= 40 && aCardH < 160, 'h=' + c.h + ' card=' + aCardH);

  console.log('=== B. 有记录：显示上次正确数 / 总数 + 相对日期 ===');
  await seed(page, [{
    id: 'probe-rec-1', date: dkey(1), granularity: 'whole', type: 'reading', src: 'bank',
    parts: [{ label: 'P1', correct: 10, total: 13 }, { label: 'P2', correct: 11, total: 13 }, { label: 'P3', correct: 11, total: 14 }],
    overall: 6.5, usedSec: 3000, note: '模考自动记录'
  }]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  c = await readCard(page, 'reading');
  console.log('  ' + JSON.stringify(c));
  ck('B1 显示「上次 32/40」', /上次\s*32\/40/.test(c.text), c.text);
  ck('B2 显示相对日期「昨天」', /昨天/.test(c.text), c.text);
  ck('B3 进度条宽度 = 80%（32/40）', c.barW === '80%', 'barW=' + c.barW);
  ck('B4 不再是空态样式', !/is-none/.test(c.cls), c.cls);

  console.log('=== C. 多条记录取最近一条 ===');
  await seed(page, [
    { id: 'new', date: dkey(0), granularity: 'whole', type: 'reading', src: 'bank', parts: [{ label: 'P1', correct: 13, total: 40 }] },
    { id: 'old', date: dkey(9), granularity: 'whole', type: 'reading', src: 'bank', parts: [{ label: 'P1', correct: 10, total: 40 }] }
  ]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  c = await readCard(page, 'reading');
  ck('C1 取最新一条（13/40，不是 9 天前的 10/40）', /上次\s*13\/40/.test(c.text) && /今天/.test(c.text), c.text);

  console.log('=== D. 听力卡独立统计（不能串到阅读）===');
  ck('D0 顶栏二级切到听力（隐藏 #mockTabs 仍可转发）', await showListeningTab(page));
  await page.waitForTimeout(1800);
  let cl = await readCard(page, 'listening');
  console.log('  ' + JSON.stringify(cl));
  ck('D1 听力没记录 → 自己的空态文案', /还没做过完整听力模考/.test(cl.text), cl.text);
  await seed(page, [
    { id: 'l1', date: dkey(3), granularity: 'whole', type: 'listening', src: 'bank', parts: [{ label: 'P1', correct: 9, total: 40 }] }
  ]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  ck('D0b reload 后顶栏二级仍能切到听力', await showListeningTab(page));
  await page.waitForTimeout(1800);
  cl = await readCard(page, 'listening');
  ck('D2 听力记录显示 9/40 + 3 天前', /上次\s*9\/40/.test(cl.text) && /3 天前/.test(cl.text), cl.text);
  c = await readCard(page, 'reading');
  ck('D3 阅读卡不受听力记录影响（仍是空态）', /还没做过完整阅读模考/.test(c.text), c.text);

  console.log('=== E. 不计入/不判分的记录不显示假分数 ===');
  await seed(page, [{ id: 'x', date: dkey(0), granularity: 'whole', type: 'reading', src: 'bank', parts: [] }]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  c = await readCard(page, 'reading');
  ck('E1 空 parts → 不显示 0/0，改说「上次未判分」', /上次未判分/.test(c.text) && !/0\/0/.test(c.text), c.text);

  console.log('=== F. 布局：卡片变高但不切内容 ===');
  const box = await page.evaluate(() => {
    const card = document.querySelector('#fullEntry .full-card');
    const body = card ? card.querySelector('.fc-body') : null;
    const r = card ? card.getBoundingClientRect() : null;
    return { h: r ? Math.round(r.height) : 0, hasStart: !!(card && card.querySelector('[data-fullstart]')), bodyH: body ? Math.round(body.getBoundingClientRect().height) : 0, scrollW: card ? card.scrollWidth : 0, clientW: card ? card.clientWidth : 0 };
  });
  console.log('  ' + JSON.stringify(box));
  ck('F1 Start 按钮仍在卡内', box.hasStart);
  ck('F2 细白条高度正常、不压塌不横向溢出', box.h >= 40 && box.h < 160 && box.scrollW <= box.clientW + 1, 'h=' + box.h + ' scroll=' + box.scrollW + '/' + box.clientW);

  console.log('=== G. 控制台错误 ===');
  const real = errs.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e));
  ck('G1 无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  console.log('\n================ 结果 ================');
  R.forEach(l => console.log(l));
  const bad = R.filter(l => l.startsWith('  ❌')).length;
  console.log('\n合计 ' + R.length + ' 项，通过 ' + (R.length - bad) + '，失败 ' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
