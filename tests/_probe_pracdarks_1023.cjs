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

/* WORDBOOK-TABS-1（11-07）/ 11-13 商城默认页：#wmLegacy 默认 hidden，
   旧今日卡 .wb-today 在其中。10-26 WORD-4 只视觉下线、DOM 保留；
   本探针显式恢复父容器（仅测试视图），量真实宽高与当前主题下的计算渐变。 */
async function revealTodayCard(p, t) {
  await p.waitForFunction(() => {
    const mall = document.getElementById('vMall');
    return mall && !mall.hidden && document.querySelector('#wmDeals .wm-deal');
  }, null, { timeout: 15000 }).catch(() => {});
  await p.evaluate((theme) => {
    const bv = document.getElementById('bankView'); if (bv) bv.hidden = false;
    const mall = document.getElementById('vMall'); if (mall) mall.hidden = true;
    const book = document.getElementById('vBook'); if (book) book.hidden = true;
    const legacy = document.getElementById('wmLegacy'); if (legacy) legacy.hidden = false;
    const tc = document.getElementById('wbTodayCard'); if (tc) tc.hidden = false;
    /* 页面 boot 会按 DATA.settings 重贴主题；等 boot 后再定主题，确保读到当前深色补丁。 */
    document.documentElement.setAttribute('data-theme', theme);
    if (window.applyTheme) try { applyTheme(theme); } catch (e) {}
    try { localStorage.setItem('hub_theme', theme); } catch (e) {}
  }, t);
  await p.waitForFunction((theme) => {
    const el = document.querySelector('.wb-today');
    return document.documentElement.getAttribute('data-theme') === theme && el && el.getBoundingClientRect().width > 300;
  }, t, { timeout: 10000 }).catch(() => {});
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
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await asleep(600);
    console.log('\n===== ' + theme + ' =====');
    await revealTodayCard(page, theme);

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
        /* 10-25 DK-4b 在 common.css 钉的深墨绿补丁 #2c4f4c→#1a3b38
           是当前深色真值；practice.html 页内的 var(--primary-800/900) 旧写法已被它覆盖。 */
        const l0 = lum(rgb[0] || '');
        ok('深色下渐变首端确实是深色', l0 != null && l0 < 0.25, '亮度 ' + (l0 || 0).toFixed(3));
        ok('深色下用的是 DK-4b 深墨绿渐变', /rgb\(44,\s*79,\s*76\)/.test(rgb[0] || '') && /rgb\(26,\s*59,\s*56\)/.test(rgb[1] || ''), rgb.join(' → '));
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

    // 第六批本地维修：不再把截图写进 design/；渐变、对比与尺寸都用计算样式实测。
    await page.evaluate(() => { const h = document.getElementById('__probe_rw'); if (h) h.remove(); });
    await page.close();
  }

  // 反着验：390 手机端今日卡不破版（本批只改颜色，尺寸不该变）
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
    await asleep(600);
    await revealTodayCard(page, 'dark');
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
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
