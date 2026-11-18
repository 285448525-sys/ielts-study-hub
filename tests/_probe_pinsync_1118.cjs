/* ===== 11-18 素材置顶（pinned）云同步复核 =====
   背景：置顶 = 「最熟」标记，跨设备必须同向传播。
   旧口径 _mergeMaterials 同 id 一律留本机 → 在另一台设备置的顶，拉回来被本机无 pin 的同 id 卡静默覆盖。
   判据（跑页面真实 mergeData，不是复制的一份）：
     ① 云端置顶 + 本机没顶 → 合并后置顶保留，且置顶卡排到最前
     ② 本机置顶 + 云端没顶 → 置顶不被云端抹掉（反向同向）
     ③ 两边都没顶 → 不凭空造顶，顺序不动，changes 为 0（不许每次轮询都报「已合并」）
     ④ 两边都顶 → 保持置顶、不重复计费
     ⑤ 墓碑优先：已删除 id 不因云端置顶而复活
     ⑥ 重新生成批次（materialsEpoch）里，另一侧同 id 的置顶也不丢
   跑法：node tests/_with_server.cjs tests/_probe_pinsync_1118.cjs <port> */
const { chromium } = require('playwright-core');

const EDGE = process.env.PW_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:8899';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  <<< ' + JSON.stringify(d) : '')); } };

const card = (id, pinned, extra) => Object.assign({ id, en: 'story ' + id, pinned: !!pinned }, extra || {});

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 160)));
  await p.goto(BASE + '/speaking.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof mergeData === 'function', null, { timeout: 20000 });

  const run = (local, cloud) => p.evaluate(([l, c]) => {
    const res = mergeData({ materials: l }, { materials: c });
    return {
      list: (res.data.materials.materials || []).map(m => ({ id: m.id, pinned: !!m.pinned })),
      changes: res.changes
    };
  }, [local, cloud]);

  /* ① 云端置顶 → 本机接受 */
  const r1 = await run({ materials: [card('b', false), card('a', false)] }, { materials: [card('b', false), card('a', true)] });
  ok('① 云端置顶拉回本机（a 变 true）', r1.list.find(x => x.id === 'a').pinned === true, r1.list);
  ok('①b 置顶卡排到最前', r1.list[0].id === 'a', r1.list);
  ok('①c 真的置顶才算一处变化', r1.changes >= 1, r1.changes);

  /* ② 本机置顶 → 不被云端无顶覆盖 */
  const r2 = await run({ materials: [card('a', true), card('b', false)] }, { materials: [card('a', false), card('b', false)] });
  ok('② 本机置顶不被云端抹掉', r2.list.find(x => x.id === 'a').pinned === true, r2.list);
  ok('②b 置顶卡在最前', r2.list[0].id === 'a', r2.list);

  /* ③ 两边都没顶 → 不凭空造顶、顺序不动、changes 0 */
  const r3 = await run({ materials: [card('b', false), card('a', false)] }, { materials: [card('a', false), card('b', false)] });
  ok('③ 无顶不伪造', r3.list.every(x => x.pinned === false), r3.list);
  ok('③b 顺序保持本机序（b 在前）', r3.list[0].id === 'b', r3.list);
  ok('③c changes = 0（轮询不刷「已合并」）', r3.changes === 0, r3.changes);

  /* ④ 两边都顶 → 仍只有一张顶、不重复 */
  const r4 = await run({ materials: [card('a', true), card('b', true)] }, { materials: [card('a', true), card('b', true)] });
  ok('④ 双端置顶保持两张、都在前', r4.list.filter(x => x.pinned).length === 2 && r4.list.slice(0, 2).every(x => x.pinned), r4.list);

  /* ⑤ 墓碑优先：已删 id 不因云端置顶复活 */
  const r5 = await run(
    { materials: [card('a', false)], deletedIds: ['gone'] },
    { materials: [card('gone', true), card('a', false)] }
  );
  ok('⑤ 已删素材不因云端置顶复活', !r5.list.some(x => x.id === 'gone'), r5.list);

  /* ⑥ 重新生成批次（epoch）里另一侧的置顶不丢 */
  const r6 = await run(
    { materials: [card('a', false), card('n', false)], materialsEpoch: 2 },
    { materials: [card('a', true)], materialsEpoch: 1 }
  );
  ok('⑥ epoch 新批次里同 id 的置顶仍保留', r6.list.find(x => x.id === 'a').pinned === true, r6.list);

  ok('⑦ 全程零页面错误', errs.length === 0, errs[0]);

  await b.close();
  console.log('\n结果: ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('探针崩溃：', e.message); process.exit(2); });
