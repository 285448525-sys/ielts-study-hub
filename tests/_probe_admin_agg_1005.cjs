/* P1 探针 · admin 面板周/月聚合逻辑（纯函数级，不烧 token）
 *
 * 验三件事（都是「看起来对但很容易错」的地方）：
 *   1. aggPeriod 的键名解析：<prefix>:<acct>:<period> 三段，acct 里若含 ':' 会解析错
 *   2. 残值隔离：上周/上月的键不能串进本期（否则面板周数会虚高）
 *   3. week/month 口径与 ai.js / auth.js 三处同源（ISO 周四锚点法 + 自然月 UTC）
 *
 * 跑法：node tests/_probe_admin_agg_1005.cjs
 * ⚠️ 本探针不碰线上，纯本地跑 admin.js 里的算法复刻版 + 与真文件的源码一致性比对。
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0; const fails = [];
function ok(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; fails.push(n + (d ? ' → ' + d : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }

/* ---- 复刻 admin.js 里的 aggPeriod（与真文件同逻辑）---- */
async function aggPeriod(kv, prefix, period) {
  const out = {};
  const keys = await kv.list(prefix);
  for (const name of keys) {
    const parts = name.split(':');
    if (parts.length !== 3 || parts[2] !== period) continue;
    const n = parseInt((await kv.get(name)) || '0', 10) || 0;
    if (!n) continue;
    out[parts[1]] = (out[parts[1]] || 0) + n;
  }
  return out;
}
/* 假 KV：list 按前缀过滤，get/put 走内存 */
function fakeKV(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    map: m,
    async list(prefix) { return Array.from(m.keys()).filter(k => k.startsWith(prefix)); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
  };
}

const ADMIN = 'C:/Users/Camille/Desktop/雅思/ielts-study-hub/functions/api/admin.js';
const AISRC = 'C:/Users/Camille/Desktop/雅思/ielts-study-hub/functions/api/ai.js';
const AUTHSRC = 'C:/Users/Camille/Desktop/雅思/ielts-study-hub/functions/api/auth.js';

(async function () {
  const now = new Date();
  const p2 = n => String(n).padStart(2, '0');

  /* ---------- 段 1：与真文件源码逐位比对（三处周算法不能漂） ---------- */
  section('段1 三处 ISO 周算法一致性（源码比对）');
  const aSrc = fs.readFileSync(AISRC, 'utf8');
  const adSrc = fs.readFileSync(ADMIN, 'utf8');
  const auSrc = fs.readFileSync(AUTHSRC, 'utf8');

  // 抓三处的算法指纹：setUTCDate 次数 + Math.round 次数 + 周四锚点注释
  function fp(src, re) {
    const m = src.match(re);
    if (!m) return null;
    return { round: (m[0].match(/Math\.round/g) || []).length, setDate: (m[0].match(/setUTCDate/g) || []).length };
  }
  const fpAi = fp(aSrc, /function isoWeekKey[\s\S]*?\n\}/);
  const fpAd = fp(adSrc, /function isoWeekKeyUTC[\s\S]*?\n\}/);
  const fpAu = fp(auSrc, /const isoWeekOf[\s\S]*?\n    \};/);
  ok('ai.js 存在 isoWeekKey', !!fpAi, JSON.stringify(fpAi));
  ok('admin.js 存在 isoWeekKeyUTC', !!fpAd, JSON.stringify(fpAd));
  ok('auth.js 存在 isoWeekOf', !!fpAu, JSON.stringify(fpAu));
  if (fpAi && fpAd) {
    ok('admin 与 ai 的周算法指纹一致（1 处 Math.round / 3 处 setUTCDate）',
       fpAi.round === fpAd.round && fpAi.setDate === fpAd.setDate,
       'ai=' + JSON.stringify(fpAi) + ' admin=' + JSON.stringify(fpAd));
  }
  if (fpAi && fpAu) {
    ok('admin 侧与 auth 的周算法指纹一致',
       fpAi.round === fpAu.round && fpAi.setDate === fpAu.setDate,
       'ai=' + JSON.stringify(fpAi) + ' auth=' + JSON.stringify(fpAu));
  }

  /* ---------- 段 2：ISO 周算法正确性（含跨年陷阱） ---------- */
  section('段2 ISO 周算法正确性（已知答案）');
  function isoWeekKeyUTC(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dn = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dn + 3);
    const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const fdn = (ft.getUTCDay() + 6) % 7;
    ft.setUTCDate(ft.getUTCDate() - fdn + 3);
    const w = 1 + Math.round((t - ft) / (7 * 86400000));
    return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
  }
  const known = [
    ['2026-01-01', '2026-W01', '1/1 是周四 → 本年 W01'],
    ['2025-12-29', '2026-W01', '去年最后一天周一 → 已属次年 W01（跨年陷阱）'],
    ['2024-12-30', '2025-W01', '跨年陷阱 2'],
    ['2021-01-01', '2020-W53', '元旦周五 → 属上一年 W53（最难的那种）'],
    ['2026-12-31', '2026-W53', '年末'],
    ['2026-10-05', '2026-W41', '今天'],
  ];
  for (const [ds, exp, why] of known) {
    const got = isoWeekKeyUTC(new Date(ds + 'T00:00:00Z'));
    ok(ds + ' → ' + exp + '（' + why + '）', got === exp, '实际=' + got);
  }

  section('段2b 自然月口径');
  function monthKeyUTC(d) { const p = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1); }
  ok('本月 = ' + monthKeyUTC(now), /^\d{4}-\d{2}$/.test(monthKeyUTC(now)), monthKeyUTC(now));
  ok('1 月补零 = 2026-01', monthKeyUTC(new Date('2026-01-15T00:00:00Z')) === '2026-01');
  ok('12 月不补零 = 2026-12', monthKeyUTC(new Date('2026-12-15T00:00:00Z')) === '2026-12');
  ok('ai.js 里 monthKey 与 admin 的 monthKeyUTC 同口径（都是 UTC 自然月）',
     /getUTCFullYear\(\)\s*\+\s*'-'\s*\+/.test(aSrc) && /getUTCFullYear\(\)\s*\+\s*'-'\s*\+/.test(adSrc));

  /* ---------- 段 3：aggPeriod 残值隔离 ---------- */
  section('段3 aggPeriod 残值隔离（上周/上月不能串进本期）');
  const wk = isoWeekKeyUTC(now), mo = monthKeyUTC(now);
  const lastWk = isoWeekKeyUTC(new Date(now.getTime() - 7 * 86400000));
  const lastMo = now.getUTCMonth() === 0 ? (now.getUTCFullYear() - 1) + '-12'
                                          : now.getUTCFullYear() + '-' + p2(now.getUTCMonth());
  const kv = fakeKV({});
  kv.map.set('aiqwv:alice:' + wk, '3');
  kv.map.set('aiqwv:bob:' + wk, '5');
  kv.map.set('aiqwv:carol:' + lastWk, '99');       // 上周残值 → 必须被排除
  kv.map.set('aiqwv:alice:' + lastWk, '50');       // 同账号上周 → 也必须排除
  kv.map.set('aiqmv:alice:' + mo, '10');
  kv.map.set('aiqmv:dave:' + mo, '2');
  kv.map.set('aiqmv:carol:' + lastMo, '77');       // 上月残值 → 必须被排除
  kv.map.set('aiqmv:alice:' + lastMo, '88');
  const uW = await aggPeriod(kv, 'aiqwv:', wk);
  const uM = await aggPeriod(kv, 'aiqmv:', mo);
  ok('本周只含当期两个账号', Object.keys(uW).length === 2, JSON.stringify(uW));
  ok('alice 本周 = 3', uW.alice === 3, '实际=' + uW.alice);
  ok('bob 本周 = 5', uW.bob === 5, '实际=' + uW.bob);
  ok('上周残值 carol 未串入', uW.carol === undefined, '实际=' + uW.carol);
  ok('上周 alice(50) 未叠加到本周(3)', uW.alice === 3, '实际=' + uW.alice);
  ok('本月只含当期两个账号', Object.keys(uM).length === 2, JSON.stringify(uM));
  ok('alice 本月 = 10', uM.alice === 10, '实际=' + uM.alice);
  ok('上月残值 carol 未串入', uM.carol === undefined, '实际=' + uM.carol);
  ok('上月 alice(88) 未叠加到本月(10)', uM.alice === 10, '实际=' + uM.alice);

  /* ---------- 段 4：边界值 ---------- */
  section('段4 aggPeriod 边界值');
  const P = 'aiqwv:';
  const kv2 = fakeKV({});
  kv2.map.set(P + 'x:' + wk, '0');                              // 0 值应被跳过（不产生条目）
  kv2.map.set(P + 'y:' + wk, 'abc');                            // 非法数字 → parseInt NaN → 跳过
  kv2.map.set(P + 'z:' + wk, '');                               // 空值 → 跳过
  kv2.map.set(P + ':' + wk, '9');                               // 空账号名 → 仍 3 段（记录该行为）
  kv2.map.set(P + 'toolong:' + wk + ':extra:9', '9');           // 4 段 → 必须排除
  const u2 = await aggPeriod(kv2, 'aiqwv:', wk);
  ok('0 值不计入', u2.x === undefined, '实际=' + u2.x);
  ok('非法数字不计入', u2.y === undefined, '实际=' + u2.y);
  ok('空值不计入', u2.z === undefined, '实际=' + u2.z);
  ok('4 段键被排除（防注入到别的命名空间）', u2.toolong === undefined, '实际=' + u2.toolong);
  console.log('     （注：空账号名 "' + Object.keys(u2).filter(k => !k).map(k => JSON.stringify(k)) + '" 会产生一个空键，'
            + '账号名本身有 6-20 位校验，实际不会出现，仅记录行为）');

  /* ---------- 段 5：ai.js 侧新键名与 admin 侧读取前缀一致 ---------- */
  section('段5 写入侧与读取侧键名一致');
  /* 🔵 AIQ-1（10-26）更新：`aiqwv:` 在 10-20 深夜**已被主动下线**（全仓无读方，写它纯浪费 KV 写量），
     admin 面板本周改用 aistat 累加近 7 天 → 「ai.js 必须写 aiqwv」这条断言已经过时，删掉。 */
  const WRITES = [
    ["aiqmv:' + acct + ':' + month", 'aiqmv: 写入'],
  ];
  for (const [pat, label] of WRITES) ok('ai.js 存在 ' + label, aSrc.includes(pat), '未找到 ' + pat);
  ok("ai.js 不再写 aiqwv（10-20 主动下线，省一次 KV 写）", !/aiqwv:' \+ acct/.test(aSrc));
  /* 10/6 11:22 改口径：`aiqwv:` 从来没被写入过（10/5 加维度时只写读侧），面板「本周」已改为
     **累加 aistat 近 7 天**（零新增写量）→ 断言跟着改成「不再依赖 aiqwv，而是按 7 天 aistat 累加」。 */
  ok("admin.js 不再依赖从不写入的 'aiqwv:'（改按 aistat 近 7 天累加）",
    !adSrc.includes("aggPeriod(kv, 'aiqwv:'") && /weekKeys/.test(adSrc) && /aiWeek \+= statByDay\[d\]\.n/.test(adSrc));
  ok("admin.js 仍读 'aiqmv:'（本月按账号，10/6 已补上写入侧）", adSrc.includes("aggPeriod(kv, 'aiqmv:', month)"));
  ok("admin.js 读 'aiqmv:' 前缀", adSrc.includes("aggPeriod(kv, 'aiqmv:', month)"));
  ok('overview 返回 aiWeek', adSrc.includes('aiWeek: aiWeek'));
  ok('overview 返回 aiMonth', adSrc.includes('aiMonth: aiMonth'));
  ok('overview 返回 week/month 口径标记', adSrc.includes('week: week, month: month'));

  /* ---------- 段 6：admin.html 前端接线 ---------- */
  section('段6 admin.html 前端接线');
  const hSrc = fs.readFileSync('C:/Users/Camille/Desktop/雅思/ielts-study-hub/admin.html', 'utf8');
  ok('有 stAiWeek 卡位', hSrc.includes('id="stAiWeek"'));
  ok('有 stAiMonth 卡位', hSrc.includes('id="stAiMonth"'));
  ok('render 里有 stAiWeek 取值', /\$\('stAiWeek'\)\.textContent\s*=\s*DATA\.aiWeek/.test(hSrc));
  ok('render 里有 stAiMonth 取值', /\$\('stAiMonth'\)\.textContent\s*=\s*DATA\.aiMonth/.test(hSrc));
  ok('用户表有「本周 AI」列', hSrc.includes('<th>本周 AI</th>'));
  ok('用户表有「本月 AI」列（10/6 起带 data-usk 可排序）', hSrc.includes('<th data-usk="aiMonth">本月 AI</th>'));
  ok('用户表渲染读 usageWeek', hSrc.includes('uWeek[u.acct]'));
  ok('用户表渲染读 usageMonth', hSrc.includes('uMonth[u.acct]'));
  ok('用户表 usageWeek 有兜底 || 0', /uWeek\[u\.acct\]\s*\|\|\s*0/.test(hSrc));
  ok('用户表 usageMonth 有兜底 || 0', /uMonth\[u\.acct\]\s*\|\|\s*0/.test(hSrc));
  /* 统计卡数量与栅格。
     🔵 AIQ-1（10-26）更新：面板早改成 `.kpis > .kpi` + `<div class="v" id="stXxx">` 结构了
     （不再是 `<div><b id="stXxx">`、也不再是 10 格）→ 断言按当前真实结构改写，改量「KPI 格数」与
     「.kpis 是否自适应」。这类断言只要结构一变就会假红，写的时候一律以当前 DOM 为准。 */
  const kpiCount = (hSrc.match(/<div class="kpi">/g) || []).length;
  ok('统计卡（.kpi）≥5 格且结构在位', kpiCount >= 5, '实际=' + kpiCount);
  ok('面板 KPI 区自适应（.kpis 存在）', /class="kpis"/.test(hSrc));
  ok('旧的 720px 两列断点已移除', !/@media \(max-width:720px\)\{ \.stats/.test(hSrc));
  // 列数一致性：表头 = #/账号/注册/判定/今日/本周/本月/本月成本/会员（10/5 P3 加了判定与成本两列）
  /* 10/6 加了第 10 列「操作」（行内快捷开通会员）+ 5 个表头变成可排序 data-usk */
  const ths = (hSrc.match(/<th data-usk="acct">账号<\/th>/) || []).length;
  const thOps = (hSrc.match(/<th>操作<\/th>/) || []).length;
  ok('用户表头 10 列（末列是「操作」）且带 5 个可排序表头', ths === 1 && thOps === 1);
  ok('可排序表头共 5 个（账号/注册/今日/本月/成本）',
    (hSrc.match(/data-usk="/g) || []).length === 5, '实际=' + (hSrc.match(/data-usk="/g) || []).length);
  // 数数据行：必须锚定「用户表」独有的 uWeek 变量，否则会抓到前面邀请码表的 tr（那里也有 createElement('tr')）
  // ⚠️ 模式是 /<td[ >]/ 不是 /<td>/ —— 账号列是 '<td style="cursor:pointer" ...'，用 <td> 会漏掉它（我踩过，报了假 FAIL）
  const ui = hSrc.indexOf('var uWeek = DATA.usageWeek');
  ok('用户表渲染块存在（uWeek 锚点）', ui > 0);
  const uj = hSrc.indexOf('ub.appendChild(tr);', ui);
  const rowBlk = hSrc.slice(ui, uj);
  const tdCount = (rowBlk.match(/<td[ >]/g) || []).length;
  ok('用户表数据行输出 10 个 td（末列是行内开通按钮）', tdCount === 10, '实际=' + tdCount);
  ok('行内有「开通」快捷按钮（data-vipquick）', /data-vipquick/.test(rowBlk));
  ok('数据行含本周/本月两个取值', /uWeek\[u\.acct\]/.test(rowBlk) && /uMonth\[u\.acct\]/.test(rowBlk));

  /* ---------- 汇总 ---------- */
  console.log('\n' + '='.repeat(56));
  console.log('结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  console.log('='.repeat(56));
  process.exit(fail ? 1 : 0);
})();
