/* P3 探针 · 真人/探针判定 + 成本聚合 + 审计（10/5）
 *
 * 三件事各自都有"看起来对但会静默错"的地方，纯本地验，不烧 token：
 *   1. 判定逻辑：sync: 有值 = 真人（最硬信号）；人工标记必须能覆盖自动判定
 *   2. 成本聚合：weekOfDayKey 反推周键；单价未配时必须「不瞎算」
 *   3. 审计：vip_grant 必须区分 新开/续费/设永久 三种情形（否则事后对账无从追）
 *
 * 跑法：node tests/_probe_admin_judge_1005.cjs
 */
const fs = require('fs');
const ROOT = 'C:/Users/Camille/Desktop/雅思/ielts-study-hub/';
let pass = 0, fail = 0; const fails = [];
function ok(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; fails.push(n + (d ? ' → ' + d : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 复刻 admin.js 的判定逻辑（与真文件同规则） */
const PROBE_NAME_RE = /^(probe|test|qa|debug|tmp|demo|fake|ux|wx|kw|fix|ci|pqa|pqb|pqc|pqd|pqe|pqf|p1probe|p1fin|p1v|p3probe|p3v|p3tok)[-_0-9a-z]*/i;
function judgeOne(acct, opts) {
  const sig = [];
  if (opts.src === 'probe') { sig.unshift('探针注册'); }
  if (opts.hasSync) sig.push('sync');
  if (opts.hasAi) sig.push('ai');
  if (opts.inviteNote && /invite:/.test(opts.inviteNote)) sig.push('invite');
  let verdict;
  const nameProbe = PROBE_NAME_RE.test(acct);
  if (opts.src === 'probe') verdict = 'probe';
  else if (nameProbe) verdict = 'probe';
  else if (sig.length) verdict = 'real';
  else verdict = 'idle';
  if (opts.manual != null) verdict = (opts.manual === 1 || opts.manual === '1') ? 'real' : 'probe';
  return { verdict: verdict, sig: sig };
}

(async function () {
  const adSrc = fs.readFileSync(ROOT + 'functions/api/admin.js', 'utf8');
  const aiSrc = fs.readFileSync(ROOT + 'functions/api/ai.js', 'utf8');
  const hSrc = fs.readFileSync(ROOT + 'admin.html', 'utf8');

  /* ---------- 段 1：判定逻辑 ---------- */
  section('段1 真人/探针判定');
  const cases = [
    ['15715725815', { hasSync: true }, 'real', '有云端数据 = 真人（你的号）'],
    ['19710579473', { hasAi: true }, 'real', '有 AI 用量 = 真人'],
    ['pqb280747732', { src: 'probe', hasAi: true }, 'probe', '⭐新探针自报 src → 探针（压过 AI 用量信号）'],
    ['pqa79023341', { hasAi: true }, 'probe', '⭐老探针无 src 但有 AI 用量 → 靠名字归探针（她截图那批）'],
    ['p3tok0007x', { hasAi: true }, 'probe', '⭐p3tok 前缀探针 → 探针'],
    ['testprobe01', {}, 'probe', '名字像探针 + 无任何信号'],
    ['probeadm1005x', {}, 'probe', '我今天建的探针'],
    ['ux87352033', {}, 'probe', '10/3 那批批量探针'],
    ['kwtest532833', {}, 'probe', 'kwtest 前缀'],
    ['13800138000', {}, 'idle', '纯数字手机号但没信号 → 待观察（不靠名字乱判真人）'],
    ['realuser2026', { hasSync: true }, 'real', '即使名字不含关键词，有数据就是真人'],
    ['zhangsan', { inviteNote: 'invite:ABC123' }, 'real', '走邀请码 = 真人'],
  ];
  for (const [acct, o, exp, why] of cases) {
    const r = judgeOne(acct, o);
    ok(acct + ' → ' + exp + '（' + why + '）', r.verdict === exp, '实际=' + r.verdict + ' sig=' + JSON.stringify(r.sig));
  }
  ok('真人判定最多产 3 个依据信号', judgeOne('x', { hasSync: true, hasAi: true, inviteNote: 'invite:A' }).sig.length === 3);

  section('段1b 人工标记覆盖自动判定');
  ok('探针被人工标为真人 → real', judgeOne('probe1', { manual: 1 }).verdict === 'real');
  ok('真人被人工标为探针 → probe', judgeOne('alice', { hasSync: true, manual: 0 }).verdict === 'probe');
  ok('未标记时用自动判定', judgeOne('probe1', { manual: null }).verdict === 'probe');
  ok('manual 字符串 "1" 也算真人（前端可能传字符串）', judgeOne('x', { manual: '1' }).verdict === 'real');

  /* ---------- 段 2：成本聚合 ---------- */
  section('段2 weekOfDayKey 反推周键');
  const isoWeekKeyUTC = new Function('d', `
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3);
    const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const fdn = (ft.getUTCDay() + 6) % 7; ft.setUTCDate(ft.getUTCDate() - fdn + 3);
    const w = 1 + Math.round((t - ft) / (7 * 86400000));
    return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');`);
  function weekOf(ds) {
    const s = String(ds || '');
    if (!/^\d{8}$/.test(s)) return '';
    const y = parseInt(s.slice(0, 4), 10), m = parseInt(s.slice(4, 6), 10) - 1, d = parseInt(s.slice(6, 8), 10);
    if (!isFinite(y) || !isFinite(m) || !isFinite(d) || m < 0 || m > 11 || d < 1 || d > 31) return '';
    return isoWeekKeyUTC(new Date(Date.UTC(y, m, d)));
  }
  let bad = 0;
  for (let i = 0; i < 800; i++) {
    const dt = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
    const p = n => String(n).padStart(2, '0');
    const ds = dt.getUTCFullYear() + p(dt.getUTCMonth() + 1) + p(dt.getUTCDate());
    if (isoWeekKeyUTC(dt) !== weekOf(ds)) { bad++; if (bad < 3) console.log('    MISMATCH', ds); }
  }
  ok('800 天 dayKey→周键反推零误差', bad === 0, 'bad=' + bad);
  ok('非法 dayKey 返回空串（不抛）', weekOf('abcd') === '' && weekOf('') === '' && weekOf(null) === '' && weekOf(undefined) === '');
  ok('⭐ 空串不得算出 1899-W48 垃圾周键（\'+\'\'===0 的坑）', weekOf('') === '' , '实际=' + JSON.stringify(weekOf('')));
  ok('长度不足 8 位返回空串', weekOf('2026100') === '' && weekOf('202610051') === '');
  ok('月份越界返回空串', weekOf('20261301') === '' && weekOf('20260001') === '');
  ok('admin.js 的 weekOfDayKey 有同样的严格校验', /\^\\d\{8\}\$/.test(adSrc));
  ok('admin.js 确有 weekOfDayKey', /function weekOfDayKey/.test(adSrc));

  section('段2b 单价未配时不能瞎算');
  function cost(tok, pin, pout) {
    const okPrice = isFinite(pin) && isFinite(pout);
    return okPrice ? (tok / 1e6) * (pin + pout) : 0;
  }
  ok('单价未配 → 成本 0（不是 NaN 也不是瞎估）', cost(1000000, NaN, NaN) === 0);
  ok('单价已配 → 正确换算', Math.abs(cost(1000000, 0.001, 0.002) - 0.003) < 1e-9);
  // 10/5 14:42 P0 键合并后，单价读取统一在 admin.js（ai.js 只记 token 不算钱，更合理）
  ok('单价读环境变量而非写死（admin.js 统一算）', /env\.AI_PRICE_IN/.test(adSrc) && /env\.AI_PRICE_OUT/.test(adSrc));
  ok('ai.js 不含任何单价（只记 token）', !/AI_PRICE/.test(aiSrc));
  ok('admin.js 也读同两个变量', /env\.AI_PRICE_IN/.test(adSrc) && /env\.AI_PRICE_OUT/.test(adSrc));
  ok('overview 返回 priceOk 供前端决定显示', /priceOk: priceOk/.test(adSrc));
  ok('前端未配单价时显示「未配单价」', hSrc.includes("'未配单价'"));

  section('段2c 分功能统计的 service 白名单');
  const svcOk = s => /^[a-z0-9_]{1,32}$/.test(s) ? s : 'other';
  ok('正常 service 原样保留', svcOk('mock_q') === 'mock_q');
  ok('含冒号的注入串归到 other', svcOk('a:b') === 'other');
  ok('超长归到 other', svcOk('x'.repeat(33)) === 'other');
  ok('空串归到 other', svcOk('') === 'other');
  ok('ai.js 侧有白名单判断', /\[a-z0-9_\]\{1,32\}/.test(aiSrc));

  /* ---------- 段 3：审计 ---------- */
  section('段3 操作审计');
  ok('admin.js 有 audit() 写账本', /async function audit\(/.test(adSrc));
  ok('audit 键带毫秒时间戳前缀（天然按时间排序）', /'audit:' \+ id/.test(adSrc) && /Date\.now\(\) \+ '-'/ .test(adSrc));
  ok('审计留一年（TTL 31536000）', /expirationTtl: 31536000/.test(adSrc));
  ok('审计不含任何密钥字段', !/audit[\s\S]{0,200}ADMIN_KEY/.test(adSrc) && !/audit[\s\S]{0,200}adminKey/i.test(adSrc));
  ok('vip_grant 埋了审计', /await audit\(kv, 'vip_' \+ kind/.test(adSrc));
  ok('vip_revoke 埋了审计', /await audit\(kv, 'vip_revoke'/.test(adSrc));
  ok('invite_mint 埋了审计', /await audit\(kv, 'invite_mint'/.test(adSrc));
  ok('撤销前先读原值（记清撤的是什么状态）', /hadVip/.test(adSrc) && /prevExpire/.test(adSrc));
  ok('区分 新开/续费/设永久 三种', /set_permanent/.test(adSrc) && /renew/.test(adSrc) && /'grant'/.test(adSrc));
  ok('judge_set 改动也留痕', /judge_mark_real/.test(adSrc) && /judge_mark_probe/.test(adSrc));

  /* ---------- 段 4：前端接线 ---------- */
  section('段4 admin.html 接线');
  ok('有「只看真人」开关', /id="onlyReal"/.test(hSrc));
  ok('开关绑定 render 重渲', /\$\('onlyReal'\)\.addEventListener\('change', render\)/.test(hSrc));
  ok('用户表有「判定」列', /<th>判定<\/th>/.test(hSrc));
  ok('用户表有「本月成本」列（10/6 起该列带 data-usk 可排序）', /<th data-usk="cost">本月成本<\/th>/.test(hSrc));
  ok('有 stReal 卡位', /id="stReal"/.test(hSrc));
  ok('有 stProbe 卡位', /id="stProbe"/.test(hSrc));
  ok('有 stCostMonth 卡位', /id="stCostMonth"/.test(hSrc));
  ok('排序把真人排前（order real:0）', /var order = \{ real: 0, idle: 1, probe: 2 \}/.test(hSrc));
  ok('判定标签三态齐全', hSrc.includes("'real' ? '真人'") && hSrc.includes("'probe' ? '探针'") && hSrc.includes("'待观察'"));
  ok('判定依据可见（sig 标签）', /class="tag v-sig"/.test(hSrc));
  ok('有「改」按钮手动推翻', /data-judge=/.test(hSrc));
  ok('手动改判前有 confirm', /confirm\('把 ' \+ acct \+ ' 标记为/.test(hSrc));
  ok('改判提示写明不删号不改数据', /不会删账号、不改任何数据/.test(hSrc));
  ok('有审计页签', /data-tab="audit"/.test(hSrc));
  ok('有审计表格', /id="auditBody"/.test(hSrc));
  ok('审计动作中文映射齐全', /vip_set_permanent: '设为永久会员'/.test(hSrc) && /vip_revoke: '撤销会员'/.test(hSrc));
  ok('切到审计页渲染', /name === 'audit' && DATA/.test(hSrc));
  ok('无删号功能（她 10/5 明确「不用删号」）', !/vip_del|user_del|delete_user|删号/.test(hSrc) && !/action === 'user_del'/.test(adSrc));

  /* ---------- 段 5：回归（本次不能碰坏 P0/P1） ---------- */
  section('段5 回归检查');
  const auSrc = fs.readFileSync(ROOT + 'functions/api/auth.js', 'utf8');
  ok('P1 的三口径仍在', /usageWeek/.test(adSrc) && /usageMonth/.test(adSrc) && /isoWeekKeyUTC/.test(adSrc));
  ok('P0 的计数段仍在 await', /await \(async \(\) => \{/.test(aiSrc));
  ok('三处周算法仍一致（各 1 处 Math.round((t - ft)）',
     (aiSrc.match(/Math\.round\(\(t - ft\)/g) || []).length === 1
     && (adSrc.match(/Math\.round\(\(t - ft\)/g) || []).length === 1
     && (auSrc.match(/Math\.round\(\(t - ft\)/g) || []).length === 1,
     'ai=' + (aiSrc.match(/Math\.round\(\(t - ft\)/g) || []).length
     + ' admin=' + (adSrc.match(/Math\.round\(\(t - ft\)/g) || []).length
     + ' auth=' + (auSrc.match(/Math\.round\(\(t - ft\)/g) || []).length);
  ok('overview 仍返回 aiToday/aiWeek/aiMonth', /aiToday: aiToday/.test(adSrc) && /aiWeek: aiWeek/.test(adSrc) && /aiMonth: aiMonth/.test(adSrc));
  ok('fb 段未被碰坏', /fb_list/.test(adSrc) && /id="fbList"/.test(hSrc));
  ok('阈值零改动（无 AI_*_LIMIT 被写进新代码）', !/AI_DAILY_LIMIT\s*=|AI_USER_WEEKLY_LIMIT\s*=|AI_RATE_PER_MIN\s*=/.test(adSrc + aiSrc));

  /* ---------- 汇总 ---------- */
  console.log('\n' + '='.repeat(58));
  console.log('结果: ' + pass + ' PASS / ' + fail + ' FAIL');
  if (fail) { console.log('\n失败项:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  console.log('='.repeat(58));
  process.exit(fail ? 1 : 0);
})();
