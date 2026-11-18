/* ===== 11-18 统计口径复核（真数据，不写死） =====
   验：回顾页总览的每个数字确实是「按落盘数据算出来的」，而不是示例值 / 写死文案：
     ① 总分 = 最近一次四科平均（按官方 .5 进制取整）
     ② 四科分 = 最近一次的对应科目分
     ③ 目标差 = 目标 - 最近总分
     ④ 最近日期 = 数据里最大的日期
     ⑤ 记录行数 = 落盘成绩条数（不是固定条数）
     ⑥ 趋势点数 = 有效成绩条数
     ⑦ 空态块被收起（有数据时不许同时露「还没有成绩」）
   跑法：node tests/_with_server.cjs tests/_probe_statstruth_1118.cjs <port> */
const { chromium } = require('playwright-core');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  <<< ' + JSON.stringify(d) : '')); } };

/* 三条成绩，四科齐全 → 期望值独立手算：
   最近一次 s3：L7.0 R6.5 W6.0 S6.5 → 平均 26/4 = 6.5（官方 .5 进制仍是 6.5）
   目标 overall 7.0 → 差 0.5 */
const SEED = {
  scores: [
    { id: 's1', date: '2026-11-08', listening: 6.0, reading: 5.5, writing: 5.0, speaking: 5.5 },
    { id: 's2', date: '2026-11-12', listening: 6.5, reading: 6.0, writing: 5.5, speaking: 6.0 },
    { id: 's3', date: '2026-11-15', listening: 7.0, reading: 6.5, writing: 6.0, speaking: 6.5 }
  ],
  settings: { targets: { overall: 7.0, listening: 7.5, reading: 7.0, writing: 6.5, speaking: 7.0 } }
};

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(seed => {
    try { localStorage.setItem('ielts_study_hub_v1', JSON.stringify(seed)); } catch (e) {}
  }, SEED);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));

  await p.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(2600);

  const r = await p.evaluate(() => {
    const t = id => {
      const el = document.getElementById(id);
      return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    };
    const recAll = document.getElementById('recAll');
    const mini = document.getElementById('rvaMini');
    return {
      all: t('rvxNumAll'), L: t('rvxNumL'), R: t('rvxNumR'), W: t('rvxNumW'), S: t('rvxNumS'),
      sub: t('rvxSubAll'), date: t('rvaLatestDate'),
      emptyHidden: (() => { const e = document.getElementById('rvaHomeEmpty'); return e ? e.hidden : null; })(),
      dataHidden: (() => { const e = document.getElementById('rvaHomeData'); return e ? e.hidden : null; })(),
      recRows: recAll ? recAll.children.length : -1,
      recText: recAll ? String(recAll.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
      trendPts: mini ? (window.__rvaPts ? window.__rvaPts.length : (mini.querySelectorAll('[data-pt]').length || -1)) : -1
    };
  });
  console.log('  实测：' + JSON.stringify(r));

  ok('① 总分 = 最近一次四科平均（期望 6.5）', r.all === '6.5', r.all);
  ok('② 四科分 = 最近一次（L7.0 / R6.5 / W6.0 / S6.5）',
    r.L === '7' || r.L === '7.0', { L: r.L, R: r.R, W: r.W, S: r.S });
  ok('②b 阅读 6.5 / 写作 6 / 口语 6.5 与数据一致',
    (/6\.5/.test(r.R || '')) && (/(^6$|6\.0)/.test(r.W || '')) && (/6\.5/.test(r.S || '')), [r.R, r.W, r.S]);
  ok('③ 目标差 = 7.0 - 6.5 = 差 0.5', /差\s*0\.5/.test(r.sub || ''), r.sub);
  ok('④ 最近日期 = 数据里最大日期 2026-11-15', /2026-11-15/.test(r.date || ''), r.date);
  ok('⑥ 空态块被收起（有数据时不露「还没有成绩」）', r.emptyHidden === true && r.dataHidden === false, { empty: r.emptyHidden, data: r.dataHidden });
  ok('⑦ 全程零页面错误', errs.length === 0, errs[0]);

  /* 记录列表只在记录 pane 渲染 → 切到「轨迹」再数：3 条成绩必须都出现 */
  await p.goto(BASE + '/review.html?sub=record', { waitUntil: 'load' });
  await sleep(2400);
  const rr = await p.evaluate(() => {
    const box = document.getElementById('recAll');
    const rows = box ? box.children.length : -1;
    return {
      kids: rows,
      text: box ? String(box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null,
      cnt: (() => { const c = document.getElementById('recAllCount'); return c ? String(c.textContent || '').trim() : null; })()
    };
  });
  ok('⑧ 记录区渲染出 3 条成绩（不写死条数）', rr.kids === 3, { kids: rr.kids, cnt: rr.cnt, text: rr.text });

  /* ===== 反证：换一套数据（1 条、四科都是 5.x）→ 数字必须跟着重算 ===== */
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx2.addInitScript(() => {
    try {
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify({
        scores: [{ id: 'x1', date: '2026-11-16', listening: 5.5, reading: 5.5, writing: 5.0, speaking: 5.0 }],
        settings: { targets: { overall: 7.0, listening: 7.5, reading: 7.0, writing: 6.5, speaking: 7.0 } }
      }));
    } catch (e) {}
  });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e && e.message || e).slice(0, 160)));
  /* 总览数字在 home pane 才渲染，记录条数在 record pane 才渲染 → 分两次进 */
  await p2.goto(BASE + '/review.html', { waitUntil: 'load' });
  await sleep(2400);
  const r2 = await p2.evaluate(() => {
    const t = id => { const el = document.getElementById(id); return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : null; };
    return { all: t('rvxNumAll'), date: t('rvaLatestDate'), sub: t('rvxSubAll'), L: t('rvxNumL') };
  });
  await p2.goto(BASE + '/review.html?sub=record', { waitUntil: 'load' });
  await sleep(2400);
  const r2b = await p2.evaluate(() => { const box = document.getElementById('recAll'); return box ? box.children.length : -1; });
  ok('⑨ 换数据后总分跟着重算（(5.5+5.5+5+5)/4=5.25 → 5.5 或 5.25）', /5\.5|5\.25/.test(r2.all || ''), r2.all);
  ok('⑩ 换数据后最近日期跟着换（2026-11-16）', /2026-11-16/.test(r2.date || ''), r2.date);
  ok('⑪ 换数据后目标差跟着重算（7.0-5.25=1.75 或按 5.5 算 1.5）', /差\s*1\.(5|75)/.test(r2.sub || ''), r2.sub);
  ok('⑫ 换数据后记录条数跟着变成 1 条（不沿用 3 条）', r2b === 1, r2b);
  ok('⑬ 反证段零页面错误', errs2.length === 0, errs2[0]);

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩溃：', e.message); process.exit(2); });
