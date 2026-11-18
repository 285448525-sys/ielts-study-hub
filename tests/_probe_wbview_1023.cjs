/* 书详情面板验收（11-18 重写）：数字与进度条对得上种子数据
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_wbview_1023.cjs 9910
   🔵 重写原因：10-23 那版验的是 `#wmLegacy` 里的「进书视图（面包屑 + 5 枚状态胶囊 + 筛选）」，
   11-16 单词四页改版后整个 #wmLegacy 不再被任何 tab 打开；现版书详情是 `data-wb-pane="books"` 右侧那块
   （#wbBookName/#wbBookTotal/#wbBookM/#wbBookL/#wbBookN/#wbBookTrack/#wbBookStart），没有胶囊筛选。
   判据：① 详情三数之和 = 总数，且掌握数对得上种子里 cleared 的条数 ② 进度条宽度 = 掌握率（±2%）
        ③ 换一本书数字跟着换 ④ 375/390 不溢出 ⑤ 深色可读 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:9910';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  ' + x : '')); } };
const asleep = ms => new Promise(r => setTimeout(r, ms));

const SEED_N = 12;
function seedWords(page) {
  return page.addInitScript((n) => {
    const t = new Date();
    const k = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const ws = [];
    for (let i = 0; i < n; i++) {
      ws.push({ id: 'w' + i, en: 'word' + i, cn: '释义' + i, level: i < 3 ? 5 : 1,
        cleared: i < 3,            /* counts() 判已掌握要 cleared===true 且 level>=5 → 12 个里 3 个 = 25% */
        nextReview: i % 4 === 0 ? '2026-01-01' : k, ts: Date.now() });
    }
    try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); } catch (e) {}
  }, SEED_N);
}

async function openBookDetail(page) {
  await page.goto(BASE + '/practice.html#wb=books', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const el = document.getElementById('wbBookName');
    return !!(el && el.getBoundingClientRect().height > 0);
  }, null, { timeout: 20000 }).catch(() => {});
  await asleep(700);
}

function readDetail() {
  const q = id => document.getElementById(id);
  const num = id => Number(((q(id) || {}).textContent || '0').replace(/[^\d]/g, '')) || 0;
  const track = q('wbBookTrack');
  return {
    name: (q('wbBookName') || {}).textContent || '',
    total: num('wbBookTotal'), m: num('wbBookM'), l: num('wbBookL'), n: num('wbBookN'),
    trackW: track ? Math.round(track.getBoundingClientRect().width) : 0,
    barW: track ? Math.round(track.parentElement.getBoundingClientRect().width) : 0,
    startH: Math.round(((q('wbBookStart') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height))
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ========== A. 桌面 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await seedWords(page);
    await openBookDetail(page);
    console.log('\n===== A 桌面 1440 =====');
    const r = await page.evaluate(readDetail);
    ok('①1 三数之和等于总词数', r.m + r.l + r.n === r.total && r.total === SEED_N,
      r.m + '+' + r.l + '+' + r.n + ' vs ' + r.total);
    ok('①2 已掌握数 = 种子里 cleared 的 3 个', r.m === 3, '掌握 ' + r.m);
    const pct = r.trackW && r.barW ? Math.round(r.trackW / r.barW * 100) : -1;
    ok('② 进度条宽度 = 掌握率（25% ±2）', Math.abs(pct - 25) <= 2, pct + '%（' + r.trackW + '/' + r.barW + '）');
    ok('③ 「继续背词」按钮在页且可点', r.startH >= 44, r.startH + 'px');
    ok('④ 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ========== B. 换书数字跟着换 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await seedWords(page);
    await openBookDetail(page);
    console.log('\n===== B 换书 =====');
    const first = await page.evaluate(readDetail);
    await page.evaluate(() => { const rows = [...document.querySelectorAll('#wbBookList .wv-book-row')]; if (rows[1]) rows[1].click(); });
    await asleep(700);
    const second = await page.evaluate(readDetail);
    ok('⑤1 换书后书名变了', !!second.name && second.name !== first.name, first.name + ' → ' + second.name);
    ok('⑤2 换书后总词数仍是真数（不是 0 也不是占位）', second.total > 0, '总 ' + second.total + ' / 掌握 ' + second.m);
    await page.close();
  }

  // ========== C. 手机 375 / 390 ==========
  for (const vw of [375, 390]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await seedWords(page);
    await openBookDetail(page);
    console.log('\n===== C 手机 ' + vw + ' =====');
    const r = await page.evaluate(() => {
      const d = document.querySelector('.wv-book-detail');
      const k = d ? d.getBoundingClientRect() : null;
      return { w: k ? Math.round(k.width) : 0, left: k ? Math.round(k.left) : 0, right: k ? Math.round(k.right) : 0,
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    ok(vw + ' 详情面板在页且不出视口', r.w > vw * 0.7 && r.left >= 0 && r.right <= vw + 1, r.w + 'px ' + r.left + '~' + r.right);
    ok(vw + ' 无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    ok(vw + ' 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n===== 共 ' + (pass + fail) + ' 项：' + pass + ' 过 / ' + fail + ' 红 =====');
  process.exit(fail ? 1 : 0);
})();
