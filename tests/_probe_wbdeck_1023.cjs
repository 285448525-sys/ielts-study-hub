/* 词书页验收（11-18 重写）：左侧书卡列表 + 右侧书详情
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_wbdeck_1023.cjs 9908
   🔵 重写原因：10-23 那版量的是 `#wmLegacy` 里的旧词书网格 `#wbDecks` —— 11-16 单词四页改版后
   整个 #wmLegacy 不再被任何 tab 打开（wb-tabs.js 的 show() 只认 data-wb-pane 的 wrong/data/books/set），
   所以那套 DOM 是死的；旧探针靠手动 hidden=false 强开，量出来的尺寸在手机上恒为 0。
   现版词书页 = `data-wb-pane="books"`：#wbBookList（.wv-book-row）+ 右侧 .wv-book-detail。
   判据：① 书卡列表在页、条数对、可点 ② 数字对得上种子 ③ 点卡能切详情
        ④ 375/390 单列不溢出、行高 ≥44 ⑤ 深色下文字与底对比 ≥4.5 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:9908';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  RED ' + name + (extra ? '  ' + extra : '')); }
};
const asleep = ms => new Promise(r => setTimeout(r, ms));

function lum(rgb) {
  const m = String(rgb).match(/[\d.]+/g);
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map(v => {
    const s = Number(v) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return 0;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

async function openBooks(page) {
  /* 种 9 个词进「我的词库」，让详情里的总数 / 已掌握 / 待学有真数可对（否则永远是 0 词） */
  await page.addInitScript(() => {
    const t = new Date();
    const k = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const ws = [];
    for (let i = 0; i < 9; i++) ws.push({ id: 'w' + i, en: 'word' + i, cn: '释义' + i, level: 1,
      cleared: i % 9 === 0, nextReview: k, ts: Date.now() });
    try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); } catch (e) {}
  });
  await page.goto(BASE + '/practice.html#wb=books', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const l = document.getElementById('wbBookList');
    return !!l && !l.closest('[data-wb-pane]').hidden && l.querySelectorAll('.wv-book-row').length >= 3;
  }, null, { timeout: 20000 }).catch(() => {});
  await asleep(700);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ========== A. 桌面 1440 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await openBooks(page);
    console.log('\n===== A 桌面 1440 =====');
    const r = await page.evaluate(() => {
      const list = document.getElementById('wbBookList');
      const rows = [...(list ? list.querySelectorAll('.wv-book-row') : [])];
      const box = el => { const k = el.getBoundingClientRect(); return { w: Math.round(k.width), h: Math.round(k.height) }; };
      return {
        rows: rows.map(x => ({ t: (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24), on: x.classList.contains('on'), ...box(x) })),
        detail: {
          name: (document.getElementById('wbBookName') || {}).textContent || '',
          total: (document.getElementById('wbBookTotal') || {}).textContent || '',
          m: (document.getElementById('wbBookM') || {}).textContent || '',
          l: (document.getElementById('wbBookL') || {}).textContent || '',
          n: (document.getElementById('wbBookN') || {}).textContent || '',
          start: box(document.getElementById('wbBookStart') || document.createElement('div')),
          visible: !!(document.querySelector('.wv-book-detail') && document.querySelector('.wv-book-detail').getBoundingClientRect().height > 60)
        },
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    });
    ok('①1 书卡列表在页且有 3 本以上', r.rows.length >= 3, r.rows.length + ' 本');
    ok('①2 书卡都有宽度和可点高度（≥44）', r.rows.every(x => x.w > 120 && x.h >= 44),
      r.rows.map(x => x.w + '×' + x.h).slice(0, 4).join(' | '));
    ok('①3 有且仅有一本是当前书（.on）', r.rows.filter(x => x.on).length === 1, r.rows.filter(x => x.on).map(x => x.t).join(''));
    ok('②1 右侧详情在页且报了总词数', r.detail.visible && Number(r.detail.total) > 0, r.detail.name + ' · ' + r.detail.total + ' 词');
    ok('②2 已掌握 / 学习中 / 待学三个数都在', !!r.detail.m && !!r.detail.l && !!r.detail.n,
      '掌握 ' + r.detail.m + ' / 学习中 ' + r.detail.l + ' / 待学 ' + r.detail.n);
    ok('②3 「继续背词」按钮可点（高 ≥44）', r.detail.start.h >= 44, r.detail.start.w + '×' + r.detail.start.h);
    ok('③1 桌面无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);

    // 点第二本书 → 详情标题跟着换
    const before = r.detail.name;
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#wbBookList .wv-book-row')];
      if (rows[1]) rows[1].click();
    });
    await asleep(600);
    const after = await page.evaluate(() => ({
      name: (document.getElementById('wbBookName') || {}).textContent || '',
      on: [...document.querySelectorAll('#wbBookList .wv-book-row')].filter(x => x.classList.contains('on')).length
    }));
    ok('③2 点另一本书 → 详情标题换成本书、仍只有一个当前', after.name && after.name !== before && after.on === 1,
      before + ' → ' + after.name);
    ok('③3 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ========== B. 手机 375 / 390 ==========
  for (const vw of [375, 390]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await openBooks(page);
    console.log('\n===== B 手机 ' + vw + ' =====');
    const r = await page.evaluate(() => {
      const list = document.getElementById('wbBookList');
      const rows = [...(list ? list.querySelectorAll('.wv-book-row') : [])].map(x => {
        const k = x.getBoundingClientRect();
        return { w: Math.round(k.width), h: Math.round(k.height), left: Math.round(k.left), right: Math.round(k.right) };
      });
      const cols = list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : 0;
      const start = document.getElementById('wbBookStart');
      const sk = start ? start.getBoundingClientRect() : null;
      return { rows, cols, startH: sk ? Math.round(sk.height) : 0, startW: sk ? Math.round(sk.width) : 0,
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    ok(vw + ' 书卡单列', r.cols === 1, r.cols + ' 列');
    ok(vw + ' 书卡占满宽度且不出视口', r.rows.length > 0 && r.rows.every(x => x.w > vw * 0.7 && x.left >= 0 && x.right <= vw + 1),
      r.rows.length ? r.rows[0].w + 'px 首行' : '无书卡');
    ok(vw + ' 书卡高度 ≥44（可点）', r.rows.length > 0 && r.rows.every(x => x.h >= 44), r.rows.length ? r.rows[0].h + 'px' : '');
    ok(vw + ' 「继续背词」按钮撑满且 ≥44 高', r.startW > vw * 0.6 && r.startH >= 44, r.startW + '×' + r.startH);
    ok(vw + ' 无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    ok(vw + ' 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  // ========== C. 深色 ==========
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    await openBooks(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (window.applyTheme) { try { applyTheme('dark'); } catch (e) {} }
      try { localStorage.setItem('hub_theme', 'dark'); } catch (e) {}
    });
    await asleep(500);
    console.log('\n===== C 深色 =====');
    const r = await page.evaluate(() => {
      const row = document.querySelector('#wbBookList .wv-book-row');
      const pane = document.querySelector('[data-wb-pane="books"]');
      if (!row) return null;
      const cs = getComputedStyle(row);
      const bg = getComputedStyle(pane).backgroundColor;
      return { color: cs.color, bg, name: (document.getElementById('wbBookName') || {}).textContent || '' };
    });
    ok('C1 深色下书卡文字与底对比 ≥4.5', !!r && contrast(r.bg, r.color) >= 4.5,
      r ? (r.bg + ' / ' + r.color + ' = ' + contrast(r.bg, r.color).toFixed(2) + ':1') : 'no row');
    ok('C2 深色下详情书名照常显示', !!r && !!r.name, r ? r.name : '');
    await page.close();
  }

  await browser.close();
  console.log('\n===== 共 ' + (pass + fail) + ' 项：' + pass + ' 过 / ' + fail + ' 红 =====');
  process.exit(fail ? 1 : 0);
})();
