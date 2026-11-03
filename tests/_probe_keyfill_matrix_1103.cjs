/* 交叉验证：补键（v746）+ 地图题矩阵化（v747）两笔叠在一起，地图题还能不能答、能不能判对。
   背景：v746 把 8 篇 33 个缺键补齐，v747 把地图题的作答控件从「每题竖排一列圆点」换成答题卡矩阵。
   两笔分开验过，但答案落点（EX.user[题号]=字母 / collect 读 .ex-lomatrix input）是同一条链，
   必须合在一起真跑一遍：按补好的键在矩阵上点满 → 交卷 → 每道图题都要判对、复盘正答要对得上。
   静音跑（--mute-audio），只读产品行为不改数据。 */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('PASS  ' + n + (e ? '  ' + e : ''))) : (fail++, console.log('RED   ' + n + (e ? '  ' + e : ''))); };

/* 补键后的官方答案（来源=平台 review 接口，见 44f92488 提交说明） */
const CASES = [
  { unit: '2038484558166986753', title: 'Home Improvement Store Plan', ans: { '11': 'H', '12': 'C', '13': 'G', '14': 'E', '15': 'D' } },
  { unit: '2017124496773320706', title: 'Hollies Supermarket',       ans: { '15': 'A', '16': 'D', '17': 'B', '18': 'E', '19': 'G', '20': 'C' } },
  { unit: '2017124496773320707', title: 'Ocean Edge Hotel Plan',     ans: { '16': 'I', '17': 'F', '18': 'B', '19': 'H', '20': 'C' } },
  { unit: '2068971790152564737', title: 'Melbourne Zoo',             ans: { '16': 'C', '17': 'E', '18': 'A', '19': 'D', '20': 'B' } },
  { unit: '2059466137298075649', title: 'Outdoor Education Center',  ans: { '17': 'E', '18': 'A', '19': 'F', '20': 'B' } },
  { unit: '2069246295986995201', title: 'Accommodation Options',     ans: { '15': 'E', '16': 'I', '17': 'J', '18': 'A', '19': 'C', '20': 'G' } }
];

async function enterUnit(p, unit, title) {
  await p.goto(BASE + '/bank.html', { waitUntil: 'commit', timeout: 30000 });
  await p.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const t = document.querySelector('.pill-tab[data-mtab="listening"]'); if (t) t.click(); });
  await p.waitForTimeout(1600);
  const n = await p.evaluate(() => document.querySelectorAll('#listenPartTabs .pill-tab').length || 4);
  let found = false;
  for (let i = 1; i <= n; i++) {
    await p.evaluate(k => { const t = document.querySelectorAll('#listenPartTabs .pill-tab')[k - 1]; if (t) t.click(); }, i);
    await p.waitForTimeout(1000);
    await p.fill('#listenSearch', title).catch(() => {});
    await p.waitForTimeout(1500);
    if (await p.evaluate(u => !!document.querySelector('.bank-item[data-unit="' + u + '"]'), unit)) { found = true; break; }
  }
  if (!found) return false;
  const box = await p.evaluate(u => { const el = document.querySelector('.bank-item[data-unit="' + u + '"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, unit);
  if (!box) return false;
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(1400);
  for (let i = 0; i < 5; i++) {
    const t = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /知道了|开始|确定|继续|不计时|按时/.test(b.innerText || '')); if (b) { b.click(); return true; } return false; });
    if (!t) break;
    await p.waitForTimeout(1300);
  }
  await p.waitForTimeout(2400);
  /* 听力篇有音频门：点「先看题」让门退场（不需要放音，探针全程静音） */
  await p.evaluate(() => { const g = document.querySelector('#exAudioGate'); const sk = g && g.querySelector('[data-askip]'); if (sk) sk.click(); });
  await p.waitForTimeout(1200);
  return await p.evaluate(() => !!document.getElementById('examRoot'));
}

async function submitAndRead(p, unit) {
  await p.evaluate(() => { const b = document.querySelector('#examRoot [data-submit]'); if (b) b.click(); });
  await p.waitForTimeout(1300);
  await p.evaluate(() => { const b = document.querySelector('#exSubmitModal [data-sok]'); if (b) b.click(); });
  await p.waitForTimeout(3000);
  return await p.evaluate(uid => {
    const d = JSON.parse(localStorage.getItem('ielts_study_hub_v1') || '{}');
    const all = (d.mockRecords || []);
    const rec = all.reverse().find(x => String(x.unitId || '') === String(uid)) || all[0];
    if (!rec) return null;
    const det = rec.detail || [];
    return { total: rec.parts && rec.parts[0] ? rec.parts[0].total : det.length, right: det.filter(x => x.ok).length,
      detail: det.map(x => ({ qn: String(x.qn), ok: x.ok, user: x.user, right: x.right, noKey: x.right === '' || x.right == null })) };
  }, unit);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--mute-audio'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  for (const c of CASES) {
    const entered = await enterUnit(p, c.unit, c.title);
    ok('进入 ' + c.title, entered);
    if (!entered) continue;

    /* 矩阵点选：按补好的键逐题点 */
    const filled = await p.evaluate(ans => {
      const done = {};
      for (const q in ans) {
        const inp = document.querySelector('#examRoot .ex-lomatrix input[type=radio][data-q="' + q + '"][value="' + ans[q] + '"]');
        if (inp) { inp.click(); done[q] = ans[q]; }
      }
      return done;
    }, c.ans);
    const want = Object.keys(c.ans).length;
    ok(c.title + '：矩阵上能逐题点进答案（' + want + ' 题）', Object.keys(filled).length === want, JSON.stringify(filled));

    await p.waitForTimeout(500);
    const rec = await submitAndRead(p, c.unit);
    ok(c.title + '：有成绩记录生成', !!rec);
    if (!rec) continue;

    const mine = rec.detail.filter(x => Object.prototype.hasOwnProperty.call(c.ans, x.qn));
    ok(c.title + '：图题全部进分母且判对（' + want + ' 题）',
       mine.length === want && mine.every(x => x.ok === true),
       JSON.stringify(mine.map(x => ({ qn: x.qn, ok: x.ok, user: x.user, right: x.right }))));
    ok(c.title + '：复盘「正确答案」与题库键逐条一致',
       mine.every(x => String(x.right || '').toUpperCase() === String(c.ans[x.qn]).toUpperCase()),
       JSON.stringify(mine.map(x => x.qn + ':' + x.right)));
    ok(c.title + '：没有缺键题混进分母',
       rec.detail.every(x => !x.noKey), 'noKey=' + rec.detail.filter(x => x.noKey).map(x => x.qn).join(','));
  }

  ok('零 pageerror', errs.length === 0, errs.slice(0, 2));
  console.log('\n=== 补键 + 地图矩阵 交叉验证：' + pass + ' 过 / ' + fail + ' 红 ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
