#!/usr/bin/env node
/**
 * _probe_wrte2e_1027.cjs · WRT-E2E-REG 写作打分端到端数值回归（进白名单）
 *
 * 为什么要这支：写作打分这条链 10-27 一天内坏过两次 ——
 *   ① 88659bd3 加结构校验时顺手把 +0.5 上浮整个弄丢（同链误伤，读代码看不出来）
 *   ② 截断时整份作废、逼用户重交
 * 单测都过、页面照样坏。唯一能防第三次的办法 = 把「输入 → 出分」这条链的
 * 数值钉成回归判据，每批改动后跑一次。
 *
 * 五个判据（她就是拿这些数字反复报的）：
 *   ① 截断串救回 → 5.0 上调成 5.5
 *   ② 完整串 5.5 → 6.0（+0.5 生效）
 *   ③ 纯文本非 JSON → 降级 null（不许当成功）
 *   ④ 缺 grammar 但分数齐 → 保住，不许让她重交
 *   ⑤ 8.5 → 9.0 封顶不溢出，且幂等不重复加
 *
 * 用法：node tests/_with_server.cjs tests/_probe_wrte2e_1027.cjs 8781
 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = (process.env.BASE || process.argv[2] || 'http://127.0.0.1:8781').replace(/\/$/, '');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ✗ ' + n + (x ? '  <<< ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/api/**', r => r.abort());          // 不打 AI 接口，零消耗
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + '/writing.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(2600);

  /* 五个场景全部在页面里跑（用的是页面真实的 wtSalvageScore / wtBandUp，不是我复制的一份）。
     ⚠️ 回归探针必须打真实函数，否则改了页面而探针还绿，等于没测。 */
  const res = await p.evaluate(() => {
    const out = {};
    if (typeof wtSalvageScore !== 'function') { out.fatal = 'wtSalvageScore 不在页面上'; return out; }
    if (typeof wtBandUp !== 'function') { out.fatal = 'wtBandUp 不在页面上'; return out; }
    const parse = c => { try { return JSON.parse(c); } catch (e) { return null; } };
    const run = c => wtSalvageScore(parse(c), c);

    /* ① 截断串：她截图2那次，停在 gap.grammar 第 5 条 */
    const trunc = '{"overall":5.0,"breakdown":{"TR":5.0,"CC":5.0,"LR":5.0,"GRA":4.5},"gap":{"steps":["a"],"grammar":[{"wrong":"x","fix":"y","why":"means 后误接动词原形，old 不能作名';
    const t1 = run(trunc);
    out.c1 = t1 ? { overall: t1.overall, bd: t1.breakdown } : null;

    /* ② 完整串 */
    const t2 = run(JSON.stringify({ overall: 5.5, breakdown: { TR: 5.5, CC: 5.5, LR: 5.5, GRA: 5.0 }, grammar: [], good: [] }));
    out.c2 = t2 ? { overall: t2.overall, bd: t2.breakdown } : null;

    /* ③ 纯文本 */
    out.c3 = run('AI 说了一堆话，没有 JSON');

    /* ④ 缺 grammar 但分数齐 */
    const t4 = run(JSON.stringify({ overall: 6.0, breakdown: { TR: 6.0, CC: 6.0, LR: 6.0, GRA: 5.5 } }));
    out.c4 = t4 ? { overall: t4.overall } : null;

    /* ⑤ 封顶 + 幂等 */
    const t5 = run(JSON.stringify({ overall: 8.5, breakdown: { TR: 8.5, CC: 8.5, LR: 8.5, GRA: 8.0 }, grammar: [], good: [] }));
    out.c5 = t5 ? { overall: t5.overall, bd: t5.breakdown } : null;
    if (t5) { const again = wtBandUp(t5); out.c5idem = (again.overall === t5.overall); }

    return out;
  });

  if (res.fatal) { ok('页面暴露打分函数', false, res.fatal); await br.close(); console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 ====='); process.exitCode = 1; return; }

  console.log('\n■ ① 截断串（她截图2那次）');
  ok('救回而不是作废', !!res.c1, res.c1 ? 'overall=' + res.c1.overall : 'null');
  ok('分数 = 5.0 + 0.5 = 5.5', !!res.c1 && res.c1.overall === 5.5, res.c1 ? String(res.c1.overall) : '');
  ok('四科同口径 +0.5', !!res.c1 && res.c1.bd.TR === 5.5 && res.c1.bd.GRA === 5.0, res.c1 ? JSON.stringify(res.c1.bd) : '');

  console.log('\n■ ② 完整正常 JSON');
  ok('+0.5 生效：5.5 → 6.0', !!res.c2 && res.c2.overall === 6, res.c2 ? String(res.c2.overall) : '');
  ok('四科同步', !!res.c2 && res.c2.bd.TR === 6 && res.c2.bd.GRA === 5.5, res.c2 ? JSON.stringify(res.c2.bd) : '');

  console.log('\n■ ③ 非 JSON 文本');
  ok('正确降级为 null（不许当成功）', res.c3 === null, JSON.stringify(res.c3));

  console.log('\n■ ④ 缺 grammar 但分数齐');
  ok('保住结果不逼重交', !!res.c4, res.c4 ? 'overall=' + res.c4.overall : 'null');
  ok('值 = 6.0 + 0.5 = 6.5', !!res.c4 && res.c4.overall === 6.5, res.c4 ? String(res.c4.overall) : '');

  console.log('\n■ ⑤ 高分封顶');
  ok('8.5 → 9.0 封顶', !!res.c5 && res.c5.overall === 9, res.c5 ? String(res.c5.overall) : '');
  ok('四科不溢出 9.0', !!res.c5 && res.c5.bd.TR === 9 && res.c5.bd.GRA === 8.5, res.c5 ? JSON.stringify(res.c5.bd) : '');
  ok('幂等：再调一次不叠加', res.c5idem === true, String(res.c5idem));

  console.log('\n■ 页面健康');
  ok('零 pageerror', errs.length === 0, errs.join(' | '));

  await br.close();
  console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  if (fail) process.exitCode = 1;
})();
