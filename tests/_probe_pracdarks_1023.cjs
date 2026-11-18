/* 4-1 验收（11-18 重写）：背词页深色三处（今日任务卡底 / 卡上文字 / .rw-row 分隔线）
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_pracdarks_1023.cjs 8811
   判据：① 浅色下卡片在页、文字对比 ≥4.5 ② 深色下卡片是真深底 + 白字对比 ≥4.5
        ③ 深浅两档 .rw-row 分隔线都能与卡片底区分
   🔵 11-18 重写原因：10-23 那版量的还是商城视图里的旧 .wb-today（11-13 商城退役后已不在真实布局里，
   `got 0×0` 是选择器过期，不是产品坏）。现版今日任务卡是侧栏 #hubTd，数据来自 DATA.plans，
   所以夹具按 `{date, items:[{text,done}]}` 造今天的两条任务。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  RED ' + name + (extra ? '  ' + extra : '')); }
};
const asleep = ms => new Promise(r => setTimeout(r, ms));

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 造今天的两条任务（完成 1 条），让 #hubTd 有真实内容可量 */
async function seedToday(page) {
  await page.addInitScript((day) => {
    try {
      const raw = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
      raw.plans = [{ date: day, items: [
        { id: 'p1', text: '背 20 个雅思核心词', done: true },
        { id: 'p2', text: '精听一篇 Section 3', done: false }
      ] }];
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify(raw));
    } catch (e) {}
  }, todayStr());
}

async function applyTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    if (window.applyTheme) { try { applyTheme(t); } catch (e) {} }
    try { localStorage.setItem('hub_theme', t); } catch (e) {}
  }, theme);
  await asleep(400);
}

function lum(rgb) {
  const m = rgb.match(/[\d.]+/g);
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

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await seedToday(page);
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await asleep(900);
    await applyTheme(page, theme);
    console.log('\n===== ' + theme + ' =====');

    const card = await page.evaluate(() => {
      const el = document.getElementById('hubTd');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const rows = el.querySelectorAll('#hubTdList > *').length;
      const cnt = (document.getElementById('hubTdCount') || {}).textContent || '';
      const firstRow = el.querySelector('#hubTdList > *');
      return { bg: cs.backgroundColor, color: firstRow ? getComputedStyle(firstRow).color : cs.color,
        w: r.width, h: r.height, rows, cnt };
    });
    ok(theme + ' 今日任务卡在页且有内容', !!card && card.w > 200 && card.h > 40 && card.rows >= 2,
      card ? ('宽 ' + Math.round(card.w) + ' 高 ' + Math.round(card.h) + ' 行 ' + card.rows + ' 计数 ' + card.cnt) : 'no #hubTd');
    if (card) {
      const bg = card.bg.match(/rgba?\([^)]*\)/) ? card.bg : 'rgb(255,255,255)';
      ok(theme + ' 任务卡文字对比 ≥4.5', contrast(bg, card.color) >= 4.5,
        bg + ' / ' + card.color + ' = ' + contrast(bg, card.color).toFixed(2) + ':1');
      if (theme === 'dark') {
        const l0 = lum(bg);
        ok('深色下任务卡底确实是深色', l0 != null && l0 < 0.25, '亮度 ' + (l0 || 0).toFixed(3));
      }
    }

    // .rw-row 分隔线：直接注入两条行测 border-color，并比对卡片底
    const rw = await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'rw-card';
      host.id = '__probe_rw';
      host.innerHTML = '<div class="rw-list"><div class="rw-row"><b>alpha</b><span class="rw-cn">a</span></div>' +
        '<div class="rw-row"><b>beta</b><span class="rw-cn">b</span></div></div>';
      document.body.appendChild(host);
      const rows = host.querySelectorAll('.rw-row');
      const cs1 = getComputedStyle(rows[0]);
      const cs2 = getComputedStyle(rows[1]);
      const cardCs = getComputedStyle(host);
      return {
        firstTop: cs1.borderTopWidth + ' ' + cs1.borderTopStyle + ' ' + cs1.borderTopColor,
        secondTop: cs2.borderTopWidth + ' ' + cs2.borderTopStyle + ' ' + cs2.borderTopColor,
        cardBg: cardCs.backgroundColor
      };
    });
    console.log('    rw-row 第二行上边框: ' + rw.secondTop + ' / 卡片底 ' + rw.cardBg);
    const bw = parseFloat(rw.secondTop);
    ok(theme + ' rw-row 有分隔线', bw > 0, rw.secondTop);
    if (bw > 0) {
      const col = (rw.secondTop.match(/rgba?\([^)]*\)/) || [''])[0];
      const c = contrast(col, rw.cardBg);
      ok(theme + ' rw-row 分隔线可与卡片底区分', c >= 1.15, '对比 ' + c.toFixed(2) + ':1');
    }
    ok(theme + ' 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));

    await page.evaluate(() => { const h = document.getElementById('__probe_rw'); if (h) h.remove(); });
    await page.close();
  }

  // 手机 390：今日任务卡不破版
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await seedToday(page);
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await asleep(900);
    await applyTheme(page, 'dark');
    console.log('\n===== 手机 390 =====');
    const m = await page.evaluate(() => {
      const el = document.getElementById('hubTd');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const firstRow = el.querySelector('#hubTdList > *');
      const rowPos = firstRow ? getComputedStyle(firstRow).position : '';
      return {
        w: r.width, h: r.height, left: r.left, right: r.right,
        rowPos,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    });
    /* 🔵 她 11-18 明确：手机不要每日任务卡。所以手机档不是「不破版」而是「不该出现」。 */
    ok('390 今日任务卡按她 11-18 的决定不显示', !m || m.w === 0, m ? Math.round(m.w) + '×' + Math.round(m.h) : 'no #hubTd');
    if (m) {
      ok('390 今日卡不超出视口', m.left >= 0 && m.right <= 390, '左 ' + Math.round(m.left) + ' 右 ' + Math.round(m.right));
      ok('390 无横向溢出', m.scrollW <= m.clientW + 1, m.scrollW + ' / ' + m.clientW);
    }
    ok('390 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n===== 共 ' + (pass + fail) + ' 项：' + pass + ' 过 / ' + fail + ' 红 =====');
  process.exit(fail ? 1 : 0);
})();
