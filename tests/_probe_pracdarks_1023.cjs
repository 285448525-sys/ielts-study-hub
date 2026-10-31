/* 10-23 4-1 验收：背词页三处深色 bug（今日卡渐变 / .wb-today-go 文字 / .rw-row 分隔线）
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_pracdarks_1023.cjs 8811
   判据：① 浅色下三处与改动前等价 ② 深色下今日卡是真深底+白字（对比 ≥4.5）
        ③ 深色下 .rw-row 分隔线可见（能与卡片底色区分） */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  RED ' + name + (extra ? '  ' + extra : '')); }
};
const asleep = ms => new Promise(r => setTimeout(r, ms));

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
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    // 播种一份含到期词的 DATA，让今日卡有内容；再强制主题
    await page.evaluate((t) => {
      const d = JSON.parse(localStorage.getItem('hub_data_v1') || '{}');
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('hub_theme', t); } catch (e) {}
    }, theme);
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      if (window.applyTheme) try { applyTheme(t); } catch (e) {}
    }, theme);
    await asleep(600);

    console.log('\n===== ' + theme + ' =====');

    // 今日卡默认在「词库」标签里且 hidden → 强制显示再量宽度、截图
    await page.evaluate(() => {
      const bv = document.getElementById('bankView');
      const tc = document.getElementById('wbTodayCard');
      if (bv) bv.hidden = false;
      if (tc) tc.hidden = false;
    });
    await asleep(400);

    const card = await page.evaluate(() => {
      const el = document.querySelector('.wb-today');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { bgImage: cs.backgroundImage, color: cs.color, box: r.width, h: r.height };
    });
    ok(theme + ' 今日卡存在且可见', !!card && card.box > 300, card ? '宽 ' + Math.round(card.box) + ' 高 ' + Math.round(card.h) : '');
    if (card) {
      const rgb = card.bgImage.match(/rgb\([^)]*\)/g) || [];
      console.log('    渐变: ' + (rgb.join(' → ') || card.bgImage));
      // 渐变首端与白色的对比（最深/最浅那端取最低对比）
      const cs = rgb.map(c => contrast(c, card.color));
      const worst = cs.length ? Math.min.apply(null, cs) : 0;
      ok(theme + ' 今日卡白字对比 ≥4.5', worst >= 4.5, '最差 ' + worst.toFixed(2) + ':1');
      if (theme === 'dark') {
        const l0 = lum(rgb[0] || '');
        ok('深色下渐变首端确实是深色', l0 != null && l0 < 0.25, '亮度 ' + (l0 || 0).toFixed(3));
      }
    }

    const btn = await page.evaluate(() => {
      const el = document.querySelector('.wb-today-go');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    ok(theme + ' 开始复习按钮存在', !!btn);
    if (btn) {
      const c = contrast(btn.bg, btn.color);
      ok(theme + ' 按钮文字对比 ≥4.5', c >= 4.5, btn.bg + ' / ' + btn.color + ' = ' + c.toFixed(2) + ':1');
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

    // 落截图（落 design/，不落 tests/）
    await page.screenshot({ path: 'C:\\Users\\Camille\\Desktop\\雅思\\design\\_shot_pracdark_' + theme + '_1023.png', clip: await page.evaluate(() => {
      const r = document.querySelector('.wb-today').getBoundingClientRect();
      return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(1200, r.width + 24), height: r.height + 24 };
    }) });

    await page.evaluate(() => { const h = document.getElementById('__probe_rw'); if (h) h.remove(); });
    await page.close();
  }

  // 反着验：390 手机端今日卡不破版（本批只改颜色，尺寸不该变）
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const bv = document.getElementById('bankView');
      const tc = document.getElementById('wbTodayCard');
      if (bv) bv.hidden = false;
      if (tc) tc.hidden = false;
    });
    await asleep(600);
    console.log('\n===== 手机 390 =====');
    const m = await page.evaluate(() => {
      const el = document.querySelector('.wb-today');
      const r = el.getBoundingClientRect();
      const btn = document.querySelector('.wb-today-go').getBoundingClientRect();
      return {
        w: r.width, h: r.height, left: r.left, right: r.right,
        btnW: btn.width, btnH: btn.height,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    });
    ok('390 今日卡不超出视口', m.left >= 0 && m.right <= 390, '左 ' + Math.round(m.left) + ' 右 ' + Math.round(m.right));
    ok('390 无横向溢出', m.scrollW <= m.clientW + 1, m.scrollW + ' / ' + m.clientW);
    ok('390 开始复习按钮全宽且 44 高', m.btnW > 240 && m.btnH >= 44, Math.round(m.btnW) + '×' + Math.round(m.btnH));
    ok('390 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await page.screenshot({ path: 'C:\\Users\\Camille\\Desktop\\雅思\\design\\_shot_pracdark_390_1023.png', fullPage: false });
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
