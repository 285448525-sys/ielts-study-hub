/* RV2-DETAIL-UNDEF-1 验收探针（11-03）
   B1 报：点记录「详情」，弹窗头部出现「undefined 9/10」——旧记录 parts[0] 没有 label 字段。
   验三件：
   ① 旧格式记录（parts[0].label 缺失）打开详情弹窗：正文不含 "undefined"，且能看出是第几档
   ② 新格式记录（有 label）显示与改动前一致（P1 9/10 这种）
   ③ 弹窗关闭再开正常，不串记录
   基线对照：同一支脚本跑 v748（未修）→ ①必须红。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

const SEED = `
  (function(){
    try {
      var raw = localStorage.getItem('ielts_study_hub_v1');
      var d = raw ? JSON.parse(raw) : {};
      d.mockRecords = d.mockRecords || [];
      /* 旧格式：parts[0] 完全没有 label 字段（B1 报的那种历史数据） */
      d.mockRecords.push({
        id: 'probe_old_nolabel', date: '2026-11-03', type: 'listening', granularity: 'part',
        parts: [{ correct: 9, total: 10 }], src: '自己录', note: '', overall: null,
        detail: [{ qn: '1', user: 'B', right: 'B', ok: true }], usedSec: 600
      });
      /* 新格式：带 label，应与改动前显示一样 */
      d.mockRecords.push({
        id: 'probe_new_label', date: '2026-11-02', type: 'listening', granularity: 'part',
        parts: [{ label: 'P1', correct: 8, total: 10 }], src: '自己录', note: '', overall: null,
        detail: [{ qn: '1', user: 'A', right: 'B', ok: false }], usedSec: 500
      });
      localStorage.setItem('ielts_study_hub_v1', JSON.stringify(d));
    } catch(e) { window.__seedErr = String(e); }
  })();
`;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  await p.goto(BASE + '/review.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(SEED);
  await p.reload({ waitUntil: 'commit' });
  await p.waitForTimeout(3000);

  ok('种子数据写入无异常', !(await p.evaluate(() => window.__seedErr)), await p.evaluate(() => window.__seedErr || ''));

  /* 打开旧格式那条的详情 */
  async function openDetailOf(id) {
    const box = await p.evaluate(x => {
      const row = document.querySelector('.rv2-rec-row[data-id="' + x + '"]') || document.querySelector('.rec-row[data-id="' + x + '"]');
      if (!row) return null;
      const btn = row.querySelector('[data-rv2-detail], .rec-det');
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    if (!box) return null;
    await p.mouse.click(box.x, box.y);
    await p.waitForTimeout(900);
    return await p.evaluate(() => {
      const d = document.querySelector('#rv2DetailDialog');
      const body = document.querySelector('#rv2DetailBody');
      return {
        open: !!(d && d.open),
        text: body ? (body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : ''
      };
    });
  }

  const oldOne = await openDetailOf('probe_old_nolabel');
  ok('① 旧格式记录能打开详情', oldOne && oldOne.open, JSON.stringify(oldOne));
  if (oldOne) {
    ok('① 详情里不出现 undefined', oldOne.text.indexOf('undefined') < 0, JSON.stringify(oldOne.text.slice(0, 160)));
    ok('① 缺 label 时用档位名兜底（P1 或 Part），且对题数照旧显示', /(P1|Part)\s*9\s*\/\s*10/.test(oldOne.text), JSON.stringify(oldOne.text.slice(0, 160)));
  }

  /* 关掉弹窗再开新的 */
  await p.evaluate(() => { const d = document.querySelector('#rv2DetailDialog'); if (d && d.open) d.close(); });
  await p.waitForTimeout(600);
  const closed = await p.evaluate(() => { const d = document.querySelector('#rv2DetailDialog'); return d ? d.open : null; });
  ok('③ 弹窗能关闭', closed === false);

  const newOne = await openDetailOf('probe_new_label');
  ok('② 新格式记录能打开详情', newOne && newOne.open);
  if (newOne) {
    ok('② 新格式显示不变（P1 8/10），无 undefined', /P1\s*8\s*\/\s*10/.test(newOne.text) && newOne.text.indexOf('undefined') < 0, JSON.stringify(newOne.text.slice(0, 160)));
    ok('③ 重开不串记录（不会把上一条的内容带过来）', newOne.text.indexOf('9/10') < 0 || newOne.text.indexOf('8/10') >= 0, JSON.stringify(newOne.text.slice(0, 160)));
  }

  await p.screenshot({ path: '_audit1_1027/_probe_detailundef.png' });

  /* 清掉探针造的记录，别留脏数据 */
  await p.evaluate(() => {
    const raw = localStorage.getItem('ielts_study_hub_v1');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.mockRecords)) {
      d.mockRecords = d.mockRecords.filter(x => String(x.id || '').indexOf('probe_') !== 0);
    }
    localStorage.setItem('ielts_study_hub_v1', JSON.stringify(d));
  });
  const cleaned = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
    return (d.mockRecords || []).filter(x => String(x.id || '').indexOf('probe_') === 0).length;
  });
  ok('探针自造数据已清干净', cleaned === 0, 'left=' + cleaned);

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2));
  console.log('\n=== RV2-DETAIL-UNDEF-1：' + pass + ' 过 / ' + fail + ' 红 ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
