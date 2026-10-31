/* 4-2 验收：① 空词库空态带「去导入」按钮、点了就地展开导入条 ② 今日卡不再有假「正在算…」
   ③ 375/390 批量操作条两行、按钮等分且 ≥44px、不遮内容 ④ 有词时词库列表照常
   跑法：NODE_PATH=... node tests/_with_server.cjs tests/_probe_prac42_1023.cjs 8818 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8818';
const EXE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  RED ' + n + (x ? '  ' + x : '')); } };
const asleep = ms => new Promise(r => setTimeout(r, ms));

async function openBank(page) {
  await page.goto(BASE + '/practice.html', { waitUntil: 'domcontentloaded' });
  await asleep(700);
  await page.evaluate(() => {
    const tab = document.querySelector('[data-wtab="bank"]');
    if (tab) tab.click();
    const bv = document.getElementById('bankView');
    if (bv) bv.hidden = false;
  });
  await asleep(400);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });

  // ---------- A. 空词库：空态 + 今日卡 ----------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: [], settings: {}, sessions: [] })); } catch (e) {} });
    await openBank(page);
    await asleep(900);
    console.log('\n===== A 空词库 1440 =====');

    const r = await page.evaluate(() => {
      const list = document.getElementById('wordList');
      const first = list && list.firstElementChild;
      const card = document.getElementById('wbTodayCard');
      const sub = document.getElementById('wbTodaySub');
      const btn = document.getElementById('emptyOpenImport');
      return {
        hasEmpty: !!first && first.className.indexOf('empty') >= 0,
        hasBtn: !!btn,
        btnText: btn ? btn.textContent.trim() : '',
        hasHintWord: list ? list.textContent.indexOf('还没有单词') >= 0 : false,
        cardHidden: card ? card.hidden : null,
        subText: sub ? sub.textContent.trim() : 'n/a',
        oldText: list ? list.textContent.indexOf('点上面的') >= 0 : false
      };
    });
    ok('空词库用全站 .empty 容器', r.hasEmpty);
    ok('空态给了「去导入单词」按钮', r.hasBtn, r.btnText);
    ok('空态标题是「还没有单词」', r.hasHintWord);
    ok('不再是一长串「点上面的…」指路文案', !r.oldText);
    ok('今日卡在空词库时隐藏（不冒充有数据）', r.cardHidden === true);
    ok('今日卡副标题不再预置「正在算…」', r.subText !== '正在算…', '「' + r.subText + '」');
    ok('无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));

    // 点按钮 → 导入条就地展开
    const acted = await page.evaluate(() => {
      const b = document.getElementById('emptyOpenImport');
      if (!b) return null;
      b.click();
      const body = document.getElementById('wlImpBody');
      const card = document.getElementById('bankImportCard');
      return { open: body ? !body.hidden : null, cardOpen: card ? card.classList.contains('open') : null, aria: document.getElementById('wlImpBar').getAttribute('aria-expanded') };
    });
    await asleep(500);
    ok('点「去导入单词」就地展开导入条', acted && acted.open === true && acted.cardOpen === true, acted ? 'aria-expanded=' + acted.aria : '');
    ok('展开后输入框拿到焦点', await page.evaluate(() => document.activeElement && document.activeElement.id === 'smartInput'), await page.evaluate(() => document.activeElement && document.activeElement.id));
    await page.screenshot({ path: 'C:\\Users\\Camille\\Desktop\\雅思\\design\\_shot_prac42_empty_1023.png' });
    await page.close();
  }

  // ---------- B. 有词：列表照常 + 操作栏窄屏 ----------
  for (const vw of [1440, 390, 375]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 }, isMobile: vw < 500, hasTouch: vw < 500, deviceScaleFactor: vw < 500 ? 2 : 1 });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(() => {
      const today = new Date(); const k = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const ws = [];
      for (let i = 0; i < 9; i++) ws.push({ id: 'w' + i, en: 'word' + i, cn: '释义' + i, level: 1, nextReview: k, ts: Date.now() });
      try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify({ words: ws, settings: {}, sessions: [] })); } catch (e) {}
    });
    await openBank(page);
    await asleep(900);
    console.log('\n===== B 有词 ' + vw + ' =====');

    const r = await page.evaluate(() => {
      const bar = document.getElementById('bankActionBar');
      if (bar) { bar.hidden = false; const n = document.getElementById('bankCheckedN'); if (n) n.textContent = '3'; }
      const list = document.getElementById('wordList');
      const out = {
        itemCount: list ? list.querySelectorAll('.wl-item').length : 0,
        emptyShown: list ? !!list.querySelector('.empty') : false,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
      if (bar) {
        const b = bar.getBoundingClientRect();
        const kids = [...bar.children].map(c => { const k = c.getBoundingClientRect(); return { t: (c.textContent || '').trim().slice(0, 8), w: Math.round(k.width), h: Math.round(k.height), top: Math.round(k.top), bot: Math.round(k.bottom), left: Math.round(k.left), right: Math.round(k.right) }; });
        // 行数按「垂直区间是否重叠」判定（flex align-items:center 下不同高度的 top 本就不同，用 top 相等会误判成两行）
        const rows = kids.reduce((acc, k) => {
          const hit = acc.find(r => k.top < r.bot - 2 && k.bot > r.top + 2);
          if (hit) { hit.top = Math.min(hit.top, k.top); hit.bot = Math.max(hit.bot, k.bot); }
          else acc.push({ top: k.top, bot: k.bot });
          return acc;
        }, []).length;
        out.bar = { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), kids, rows };
      }
      return out;
    });
    ok(vw + ' 有词时不显示空态', !r.emptyShown);
    ok(vw + ' 词条正常渲染', r.itemCount > 0, r.itemCount + ' 条');
    ok(vw + ' 无横向溢出', r.scrollW <= r.clientW + 1, r.scrollW + ' / ' + r.clientW);
    if (r.bar) {
      const btns = r.bar.kids.filter(k => /练习|取消/.test(k.t));
      ok(vw + ' 操作条不出视口', r.bar.left >= 0 && r.bar.right <= r.clientW, r.bar.left + '~' + r.bar.right + ' 宽 ' + r.bar.w);
      if (vw < 500) {
        ok(vw + ' 操作条两行（提示一行、按钮一行）', r.bar.rows === 2, '行数 ' + r.bar.rows);
        ok(vw + ' 两个按钮等分撑满', btns.length === 2 && Math.abs(btns[0].w - btns[1].w) <= 2, btns.map(b => b.w).join(' / '));
        ok(vw + ' 按钮高度 ≥44', btns.length === 2 && btns.every(b => b.h >= 44), btns.map(b => b.h).join(' / '));
      } else {
        ok(vw + ' 桌面操作条仍是横排一行', r.bar.rows === 1, '行数 ' + r.bar.rows);
      }
      console.log('    ' + vw + ' 操作条 ' + r.bar.w + '×' + r.bar.h + ' 子项 ' + JSON.stringify(r.bar.kids.map(k => k.t + ':' + k.w + 'x' + k.h)));
    }
    ok(vw + ' 无页面报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    if (vw < 500) await page.screenshot({ path: 'C:\\Users\\Camille\\Desktop\\雅思\\design\\_shot_prac42_bar_' + vw + '_1023.png' });
    await page.close();
  }

  await browser.close();
  console.log('\n================ ' + pass + ' 过 / ' + fail + ' 红 ================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针自身出错: ' + e); process.exit(2); });
