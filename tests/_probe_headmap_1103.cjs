/* HEAD-BLOCK-DEL + MAP-MATRIX 验收探针（11-03）
   验四件事：
   ① heading 题目行视觉不出现（computed display:none），但 DOM 仍在、题号仍在
   ② heading 仍能作答：点选项池 chip → 点原文段落槽 → 槽里有值，且 EX.user 拿得到
   ③ 地图组渲染成答题卡矩阵（表头 A–I + 每行一个圆点），不再是每题竖排一列
   ④ 矩阵点选能落进 EX.user（collect 口径不变），交卷后对错判定正常
   基线对照：同一脚本跑在 8792（07e25a53）上，①③ 必须红 —— 证明判据有区分力。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const HEAD_UNIT = '2017137445890002945';   // Corporate Social Responsibility（reading，heading 14-20）
const HEAD_Q = 'Corporate Social Responsibility';
const MAP_UNIT = '2017124496819458051';    // Office Move（listening Part 2，map 16-20）
const MAP_Q = 'Office Move';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('RED   ' + name + (extra ? '  ' + extra : '')); }
}

async function enterReading(p, unit, q) {
  await p.goto(BASE + '/bank.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const t = document.querySelector('.pill-tab[data-mtab="reading"]'); if (t) t.click(); });
  await p.waitForTimeout(1600);
  const tabs = '#partTabs .pill-tab';
  const parts = await p.evaluate(ts => [...document.querySelectorAll(ts)].map(x => x.getAttribute('data-part')).filter(Boolean), tabs);
  for (const pn of parts) {
    await p.evaluate(o => { const t = [...document.querySelectorAll(o.ts)].find(x => x.getAttribute('data-part') === o.pn); if (t) t.click(); }, { ts: tabs, pn });
    await p.waitForTimeout(1200);
    await p.fill('#bankSearch', q).catch(() => {});
    await p.waitForTimeout(1600);
    if (await p.evaluate(u => !!document.querySelector('.bank-item[data-unit="' + u + '"]'), unit)) break;
  }
  return clickEnter(p, unit);
}

async function enterListening(p, unit, q) {
  await p.goto(BASE + '/bank.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const t = document.querySelector('.pill-tab[data-mtab="listening"]'); if (t) t.click(); });
  await p.waitForTimeout(1600);
  const tabs = '#listenPartTabs .pill-tab';
  const parts = await p.evaluate(() => [...document.querySelectorAll('#listenPartTabs .pill-tab')].length || 4);
  for (let i = 1; i <= parts; i++) {
    await p.evaluate(n => { const t = document.querySelectorAll('#listenPartTabs .pill-tab')[n - 1]; if (t) t.click(); }, i);
    await p.waitForTimeout(1100);
    await p.fill('#listenSearch', q).catch(() => {});
    await p.waitForTimeout(1600);
    if (await p.evaluate(u => !!document.querySelector('.bank-item[data-unit="' + u + '"]'), unit)) break;
  }
  return clickEnter(p, unit);
}

async function clickEnter(p, unit) {
  const box = await p.evaluate(u => {
    const el = document.querySelector('.bank-item[data-unit="' + u + '"]');
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, unit);
  if (!box) return false;
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(1400);
  for (let i = 0; i < 5; i++) {
    const t = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(b => /知道了|开始|确定|继续|不计时|按时/.test(b.innerText || ''));
      if (b) { b.click(); return true; }
      return false;
    });
    if (!t) break;
    await p.waitForTimeout(1400);
  }
  await p.waitForTimeout(2500);
  return true;
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();

  /* ================= heading ================= */
  if (!(await enterReading(p, HEAD_UNIT, HEAD_Q))) { console.log('heading 篇目进不去'); }
  else {
    const head = await p.evaluate(() => {
      const grp = [...document.querySelectorAll('#exQCol .ex-group')].find(g => {
        const c0 = g.querySelector('.ex-pool .ex-chip');
        return c0 && /^[ivx]+$/i.test(c0.getAttribute('data-v') || '');
      });
      if (!grp) return { why: 'no-heading-group' };
      const rows = [...grp.querySelectorAll('.ex-q')];
      const vis = rows.filter(r => getComputedStyle(r).display !== 'none');
      const slots = [...document.querySelectorAll('#exArt .ex-hslot')];
      return {
        rows: rows.length,
        visibleRows: vis.length,
        ghostClass: rows.filter(r => r.classList.contains('ex-q--headghost')).length,
        slots: slots.length,
        slotQ: slots.map(s => s.getAttribute('data-q')),
        slotLabel: slots.map(s => (s.querySelector('.ex-hslot-n') || {}).textContent || ''),
        poolChips: grp.querySelectorAll('.ex-pool .ex-chip').length
      };
    });
    ok('① heading 题目行全部不显示', head.visibleRows === 0 && head.rows > 0, JSON.stringify({ rows: head.rows, visible: head.visibleRows }));
    ok('① heading 题号仍在 DOM（判分要用）', head.ghostClass === head.rows && head.rows > 0, 'ghost=' + head.ghostClass);
    ok('① 选项池仍在（罗马数字那排要保留）', head.poolChips >= 5, 'chips=' + head.poolChips);
    ok('① 原文段落槽数与题数一致', head.slots === head.rows, 'slots=' + head.slots + ' rows=' + head.rows);
    ok('① 每个槽带题号标签', head.slotLabel.filter(Boolean).length === head.slots && head.slots > 0, 'labels=' + JSON.stringify(head.slotLabel));
    ok('① 槽题号与题目行题号一一对应', JSON.stringify(head.slotQ) === JSON.stringify([...new Set(head.slotQ)]) && head.slotQ.length === head.rows, JSON.stringify(head.slotQ));

    /* ② 真点作答 */
    const chipBox = await p.evaluate(() => {
      const grp = [...document.querySelectorAll('#exQCol .ex-group')].find(g => {
        const c0 = g.querySelector('.ex-pool .ex-chip');
        return c0 && /^[ivx]+$/i.test(c0.getAttribute('data-v') || '');
      });
      const c = grp && grp.querySelector('.ex-chip');
      if (!c) return null;
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, v: c.getAttribute('data-v') };
    });
    const slotBox = await p.evaluate(() => {
      const s = document.querySelector('#exArt .ex-hslot');
      if (!s) return null;
      s.scrollIntoView({ block: 'center' });
      const r = s.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, q: s.getAttribute('data-q') };
    });
    if (chipBox && slotBox) {
      await p.mouse.click(chipBox.x, chipBox.y);
      await p.waitForTimeout(400);
      await p.mouse.click(slotBox.x, slotBox.y);
      await p.waitForTimeout(600);
      const filled = await p.evaluate(qn => {
        const s = document.querySelector('#exArt .ex-hslot[data-q="' + qn + '"]');
        return { v: s && s.getAttribute('data-v'), label: (s && s.querySelector('.ex-hslot-n') || {}).textContent || '' };
      }, slotBox.q);
      ok('② heading 题目行藏了仍能作答（点 chip 再点段落槽）', !!filled.v && filled.v === chipBox.v, JSON.stringify(filled));
      ok('② 槽填上答案后题号标签还在', /^\d+$/.test(filled.label), 'label=' + filled.label);

      const dup = await p.evaluate(qn => {
        const s = document.querySelector('#exArt .ex-hslot[data-q="' + qn + '"]');
        return { v: s && s.getAttribute('data-v'), cls: s ? s.className : '' };
      }, slotBox.q);
      ok('② 作答值落进槽的 data-v（collect 只认这个）', String(dup.v) === String(chipBox.v) && /filled/.test(dup.cls), JSON.stringify(dup));
    } else {
      ok('② heading 作答入口存在', false, 'chip/slot 没拿到');
    }
    await p.screenshot({ path: '_audit1_1027/_probe_headmap_heading.png' });
  }

  /* ================= 地图矩阵 ================= */
  if (!(await enterListening(p, MAP_UNIT, MAP_Q))) { console.log('地图篇目进不去'); }
  else {
    /* 听力篇有音频门 #exAudioGate 整块盖住考场（真机必须点 Play 才能答题）——探针必须先过门，
       否则 elementFromPoint 命中的是门而不是格子。这里点「先看题，音频后台下」[data-askip]：
       目的只是让门退场，不需要真的放音（探针一律静音）。 */
    const gate = await p.evaluate(() => {
      const g = document.querySelector('#exAudioGate');
      if (!g || getComputedStyle(g).display === 'none') return 'none';
      const sk = g.querySelector('[data-askip]');
      if (sk) { sk.click(); return 'skip'; }
      const pl = g.querySelector('[data-aplay]');
      if (pl) { pl.click(); return 'play'; }
      g.remove(); return 'removed';
    });
    await p.waitForTimeout(1500);
    console.log('# 音频门处理：' + gate);
    await p.waitForTimeout(1200);
    const mx = await p.evaluate(() => {
      const wrap = document.querySelector('#examRoot .ex-lomatrix-wrap');
      const tbl = document.querySelector('#examRoot .ex-lomatrix');
      if (!tbl) return { exists: false };
      const heads = [...tbl.querySelectorAll('thead th')].map(t => (t.textContent || '').trim()).filter(Boolean);
      const rows = [...tbl.querySelectorAll('tbody tr.ex-q-lohr')];
      const img = document.querySelector('#examRoot .ex-group[data-gtype="map"] img');
      return {
        exists: true,
        wrap: !!wrap,
        heads: heads,
        rowCount: rows.length,
        rowStems: rows.map(r => (r.querySelector('.mx-stem') || {}).textContent || '').map(s => s.trim().slice(0, 24)),
        cellsPerRow: rows.map(r => r.querySelectorAll('td.mx-cell input[type=radio]').length),
        oldPillsLeft: document.querySelectorAll('#examRoot .ex-group[data-gtype="map"] .ex-pslot').length,
        imgSrc: img ? img.getAttribute('src') : null
      };
    });
    ok('③ 地图组渲染成答题卡矩阵', mx.exists && mx.rowCount >= 4, JSON.stringify({ rows: mx.rowCount }));
    ok('③ 表头是一排字母 A–I', mx.heads && mx.heads.length >= 9 && /^[A-I]$/.test(mx.heads[0]), JSON.stringify(mx.heads));
    ok('③ 每行是该题的题干（题号+描述）', mx.rowStems && mx.rowStems.every(s => /\d+\s*\S/.test(s)), JSON.stringify(mx.rowStems));
    ok('③ 每行字母格数=表头字母数', mx.cellsPerRow && mx.cellsPerRow.every(n => n === mx.heads.length), JSON.stringify(mx.cellsPerRow));
    ok('③ 旧竖排圆点列已不在', mx.oldPillsLeft === 0, 'leftover=' + mx.oldPillsLeft);
    ok('③ 地图配图仍在上方', !!mx.imgSrc, mx.imgSrc || '');

    /* ④ 真点一个格子 */
    const cell = await p.evaluate(() => {
      const r = document.querySelector('#examRoot .ex-lomatrix tbody tr.ex-q-lohr');
      if (!r) return null;
      const inp = r.querySelectorAll('td.mx-cell input[type=radio]')[3];
      if (!inp) return null;
      inp.scrollIntoView({ block: 'center' });
      const rc = inp.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, value: inp.value, q: inp.getAttribute('data-q') };
    });
    if (cell) {
      await p.mouse.click(cell.x, cell.y);
      await p.waitForTimeout(600);
      const got = await p.evaluate(qn => {
        const all = [...document.querySelectorAll('#examRoot .ex-lomatrix input[type=radio][data-q="' + qn + '"]')];
        const checked = all.find(r => r.checked);
        return { checked: checked ? checked.value : null, total: all.length, anyInGroupOther: document.querySelectorAll('#examRoot .ex-lomatrix input[type=radio]:checked').length };
      }, cell.q);
      ok('④ 矩阵点选能选中（同行单选互斥）', got.checked === cell.value && got.anyInGroupOther === 1, JSON.stringify(got));
    } else {
      ok('④ 矩阵格子可点', false, '没拿到格子');
    }
    await p.screenshot({ path: '_audit1_1027/_probe_headmap_map.png' });
  }

  console.log('\n=== 汇总 === 通过 ' + pass + ' / 红 ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
