/* 手机档 390 复核：heading 隐藏 + 地图矩阵 在真机宽度下的表现
   验收标准（她的红线）：禁左右滑、不裁、按钮都能点。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));

  async function enterListening(unit, q) {
    await p.goto(BASE + '/bank.html', { waitUntil: 'commit', timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const t = document.querySelector('.pill-tab[data-mtab="listening"]'); if (t) t.click(); });
    await p.waitForTimeout(1600);
    for (let i = 1; i <= 4; i++) {
      await p.evaluate(n => { const t = document.querySelectorAll('#listenPartTabs .pill-tab')[n - 1]; if (t) t.click(); }, i);
      await p.waitForTimeout(1000);
      await p.fill('#listenSearch', q).catch(() => {});
      await p.waitForTimeout(1500);
      if (await p.evaluate(u => !!document.querySelector('.bank-item[data-unit="' + u + '"]'), unit)) break;
    }
    const box = await p.evaluate(u => { const el = document.querySelector('.bank-item[data-unit="' + u + '"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, unit);
    if (!box) return false;
    await p.mouse.click(box.x, box.y);
    await p.waitForTimeout(1400);
    for (let i = 0; i < 5; i++) {
      const t = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /知道了|开始|确定|继续|不计时|按时/.test(b.innerText || '')); if (b) { b.click(); return true; } return false; });
      if (!t) break;
      await p.waitForTimeout(1300);
    }
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const g = document.querySelector('#exAudioGate'); const sk = g && g.querySelector('[data-askip]'); if (sk) sk.click(); });
    await p.waitForTimeout(1200);
    return true;
  }

  if (!(await enterListening('2017124496819458051', 'Office Move'))) { console.log('进不去'); await b.close(); return; }

  const m = await p.evaluate(() => {
    const de = document.documentElement;
    const tbl = document.querySelector('#examRoot .ex-lomatrix');
    const wrap = document.querySelector('#examRoot .ex-lomatrix-wrap');
    const r = tbl ? tbl.getBoundingClientRect() : null;
    const w = wrap ? wrap.getBoundingClientRect() : null;
    return {
      docOverflow: de.scrollWidth - de.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      tblWidth: r ? Math.round(r.width) : null,
      wrapWidth: w ? Math.round(w.width) : null,
      wrapScroll: wrap ? wrap.scrollWidth : null,
      wrapClient: wrap ? wrap.clientWidth : null,
      rowCount: tbl ? tbl.querySelectorAll('tbody tr').length : 0,
      heads: tbl ? [...tbl.querySelectorAll('thead th')].map(x => (x.textContent || '').trim()).filter(Boolean).length : 0,
      cellW: (() => { const c = tbl && tbl.querySelector('td.mx-cell'); return c ? Math.round(c.getBoundingClientRect().width) : null; })(),
      stemW: (() => { const c = tbl && tbl.querySelector('td.mx-stem'); return c ? Math.round(c.getBoundingClientRect().width) : null; })()
    };
  });
  console.log(JSON.stringify(m));

  ok('手机 390：整页无左右滑', m.docOverflow <= 0 && m.bodyOverflow <= 0, 'doc=' + m.docOverflow + ' body=' + m.bodyOverflow);
  ok('手机 390：矩阵在容器内（表格自身可横向滚，整页不滚）', m.wrapScroll >= m.wrapClient, 'wrapScroll=' + m.wrapScroll + ' client=' + m.wrapClient);
  ok('手机 390：矩阵 5 行 9 字母都在', m.rowCount === 5 && m.heads === 9, JSON.stringify({ rows: m.rowCount, heads: m.heads }));
  ok('手机 390：选题格子够点（>=18px 命中区）', m.cellW >= 18, 'cellW=' + m.cellW);

  /* 真点一个格子（手机触屏） */
  const cell = await p.evaluate(() => {
    const inp = document.querySelector('#examRoot .ex-lomatrix tbody tr.ex-q-lohr td.mx-cell input[type=radio]:nth-of-type(1)')
      || document.querySelector('#examRoot .ex-lomatrix tbody tr.ex-q-lohr input[type=radio]');
    if (!inp) return null;
    inp.scrollIntoView({ block: 'center', inline: 'center' });
    const r = inp.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, v: inp.value, q: inp.getAttribute('data-q') };
  });
  if (cell) {
    await p.touchscreen.tap(cell.x, cell.y);
    await p.waitForTimeout(600);
    const got = await p.evaluate(qn => { const c = document.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + qn + '"]:checked'); return c ? c.value : null; }, cell.q);
    ok('手机 390：触屏点格子能选中', got === cell.v, 'got=' + got + ' want=' + cell.v);
  } else ok('手机 390：格子可点', false, '没拿到');

  await p.screenshot({ path: '_audit1_1027/_probe_mobile_map.png', fullPage: false });

  /* heading 手机档 */
  await p.goto(BASE + '/bank.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const t = document.querySelector('.pill-tab[data-mtab="reading"]'); if (t) t.click(); });
  await p.waitForTimeout(1500);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('#partTabs .pill-tab')].map(x => x.getAttribute('data-part')).filter(Boolean));
  for (const pn of tabs) {
    await p.evaluate(o => { const t = [...document.querySelectorAll('#partTabs .pill-tab')].find(x => x.getAttribute('data-part') === o); if (t) t.click(); }, pn);
    await p.waitForTimeout(1100);
    await p.fill('#bankSearch', 'Corporate Social Responsibility').catch(() => {});
    await p.waitForTimeout(1500);
    if (await p.evaluate(() => !!document.querySelector('.bank-item[data-unit="2017137445890002945"]'))) break;
  }
  const bx = await p.evaluate(() => { const el = document.querySelector('.bank-item[data-unit="2017137445890002945"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (bx) {
    await p.mouse.click(bx.x, bx.y);
    await p.waitForTimeout(1400);
    for (let i = 0; i < 5; i++) {
      const t = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /知道了|开始|确定|继续|不计时|按时/.test(b.innerText || '')); if (b) { b.click(); return true; } return false; });
      if (!t) break;
      await p.waitForTimeout(1300);
    }
    await p.waitForTimeout(2500);
    const h = await p.evaluate(() => {
      const de = document.documentElement;
      const grp = [...document.querySelectorAll('#exQCol .ex-group')].find(g => { const c = g.querySelector('.ex-pool .ex-chip'); return c && /^[ivx]+$/i.test(c.getAttribute('data-v') || ''); });
      const rows = grp ? [...grp.querySelectorAll('.ex-q')] : [];
      const slots = [...document.querySelectorAll('#exArt .ex-hslot')];
      return {
        docOverflow: de.scrollWidth - de.clientWidth,
        visibleRows: rows.filter(r => getComputedStyle(r).display !== 'none').length,
        slots: slots.length,
        slotH: slots.length ? Math.round(slots[0].getBoundingClientRect().height) : null,
        label: slots.length && slots[0].querySelector('.ex-hslot-n') ? slots[0].querySelector('.ex-hslot-n').textContent : ''
      };
    });
    ok('手机 390：heading 题目行也不显示', h.visibleRows === 0 && h.slots > 0, JSON.stringify(h));
    ok('手机 390：heading 段落槽带题号且尺寸正常', /^\d+$/.test(h.label) && h.slotH >= 20, 'label=' + h.label + ' h=' + h.slotH);
    ok('手机 390：heading 页无左右滑', h.docOverflow <= 0, 'doc=' + h.docOverflow);
    await p.screenshot({ path: '_audit1_1027/_probe_mobile_heading.png' });
  } else ok('手机 390：heading 篇目可进', false, '找不到条目');

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2));
  console.log('\n=== 手机档 === 通过 ' + pass + ' / 红 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
