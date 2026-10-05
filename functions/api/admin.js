// Cloudflare Pages Function: /api/admin —— 站长管理面板后端（她 10/1 要求：不进 CF 后台也能管站）
// 页面入口 = admin.html（noindex，不进站内导航，不进 SW 预缓存）。
//
// 安全模型：全部 action 要求请求头 X-Admin-Key === 环境变量 ADMIN_KEY（密钥只在她的浏览器
// sessionStorage 里，不落库、不进学习站数据）。面板与学习站完全独立（admin.html 不加载 common.js）。
//
// 能力（她点名的「看到所有用户的数据」 + 商业化第一块基建）：
//   overview       一次性拉全量：用户列表（账号+注册时间）、邀请码列表（码/限用/已用）、
//                  AI 用量三维度（今日 aiqa: / 本周 aiqwv: / 本月 aiqmv:，含全站合计与分账号明细）、
//                  活跃 session 数、会员列表、意见反馈列表
//                  ⚠️ 10/5 P1：周/月维度依赖 ai.js 侧新写的 aiqwv: / aiqmv: 长 TTL 聚合键
//                     （TTL 400 天，自然月/ISO 周 UTC 口径，与额度闸同源）。
//   invite_mint    生成邀请码（随机 8 位或自定义 4-16 位字母数字；max = 可用次数）
//   invite_revoke  作废邀请码（直接删 inv:<code> 键；已注册的账号不受影响）
//   vip_grant      给账号开会员（10/1 晚她授权先搭框架）：KV 键 vip:<acct> = { type, expire, grantedAt, note }，
//                  续费 = max(现 expire, now) + days 顺延；只允许给已注册账号开（防手滑开错号）
//   vip_revoke     撤销会员（删 vip:<acct> 键）
//   fb_list        意见反馈列表（10/2 新增）：只含元数据（文字/页面/环境/已读态/图数），**绝不带图片体**
//   fb_get         单条详情（含图片 base64，admin.html 前端拼 data URL 显示大图）
//   fb_read        标记已读/未读 { id, read }
//   fb_del         删除一条（连同图片体，不可恢复 → 前端必须 confirm）
// 不做（风险控制，等真需要再说）：改/删用户数据、踢 session。
//
// ⚠️ 会员状态安全口径：vip:<acct> 只存 KV 服务端（站长面板发放），**绝不进 DATA 云同步 blob**
//    ——DATA 在客户端可被用户随意改，会员状态进 DATA 等于白送。前端显示会员态走 /api/auth
//    login 响应（vip 字段）或后续轻接口，一律以服务端为准。
//
// KV 键口径与 ai.js / auth.js 对齐：
//   user:<acct> / sess:<token> / inv:<CODE> / vip:<acct>
//   aiqa:<acct>:<YYYYMMDD>:<bucket>   —— ai.js 的按账号 AI 计量（10 个分钟桶轮转，TTL 48h）
//   aiqwv:<acct>:<YYYY-Www>           —— 面板「本周 AI 次数」（长 TTL 聚合键，TTL 400 天）
//   aiqmv:<acct>:<YYYY-MM>            —— 面板「本月 AI 次数」（长 TTL 聚合键，自然月 UTC）
//   fb:<id> / fbimg:<id>               —— feedback.js 的意见反馈（正文 / 图片体，分键避免列表拉图）

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Admin-Key',
  'access-control-max-age': '86400',
};
const INV_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 与旧恢复码同口径：去易混字符

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

function dayKeyUTC(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}

/* 自然月键（UTC）：面板「本月 AI 次数」口径，与 ai.js 的 monthKey / auth.js ai_usage 三处同源。
   她 10/5 拍板用自然月（对齐模考额度的 aiqmo 键），不用滚动 30 天。 */
function monthKeyUTC(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1);
}

/* ISO 周键（UTC，周一起始）：面板「本周 AI 次数」口径。
   ⚠️ 这段算法必须与 ai.js 的 isoWeekKey()、auth.js ai_usage 里的 isoWeekOf() **逐位一致**（三处同款，
   周四锚点法 + Math.round）。改任何一处必须同步另两处，否则面板周数会与额度扣减对不上。
   已用已知答案验证：2026-01-01→2026-W01 / 2025-12-29→2026-W01 / 2024-12-30→2025-W01 /
   2021-01-01→2020-W53 / 2026-10-05→2026-W41。 */
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

function randInviteCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 8; i++) s += INV_ALPHABET[b[i] % INV_ALPHABET.length];
  return s;
}

/* KV list 分页拉全（她的量级远不到一页 1000，循环只是防御性兜底） */
async function listAll(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: prefix, cursor: cursor });
    for (const k of (page.keys || [])) out.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

/* 由 'YYYYMMDD' 形式的 dayKey 反推其所属 ISO 周键。
   aitok:<day> 的键里只有日期，要按周筛就得反推 —— 算法与 isoWeekKeyUTC 同款（周四锚点法），
   改一处必须同步另两处（ai.js / auth.js）。 */
function weekOfDayKey(ds) {
  const s = String(ds || '');
  /* ⚠️ 严格校验：'+'' === 0'，空串会通过 isFinite 检查 → 算出 1899-W48 这种垃圾周键。
     必须先卡长度与「全数字」，再取值。 */
  if (!/^\d{8}$/.test(s)) return '';
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  if (!isFinite(y) || !isFinite(m) || !isFinite(d) || m < 0 || m > 11 || d < 1 || d > 31) return '';
  return isoWeekKeyUTC(new Date(Date.UTC(y, m, d)));
}

/* ---- 操作审计（10/5 P3）：谁在什么时候对谁做了什么 ----
   键：audit:<毫秒时间戳>-<随机后缀>（毫秒保证天然按时间排序，随机后缀防同毫秒互相覆盖）
   记录全部管理动作，是**只增不删**的账本 —— 将来内测多人时，"谁被谁开了会员"唯一可查的地方。
   ⚠️ 不含任何密钥（X-Admin-Key 绝不入库）。 */
async function audit(kv, act, detail) {
  try {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const rec = { ts: Date.now(), act: act, detail: detail || {} };
    await kv.put('audit:' + id, JSON.stringify(rec), { expirationTtl: 31536000 });   // 留一年
  } catch (e) { /* 审计写失败绝不能连带失败主操作 */ }
}

/* ---- 真人 / 探针判定（10/5 P3 她要「能区分到底是不是真人登录」）----
   她站里的账号大部分是 AI 写探针时注册的一次性测试号（截图 16 个里约 14 个），
   把它们混在真实用户里会污染所有用量/转化统计。

   ⭐ 判定**不靠猜账号名**，靠三条硬信号（可靠度从高到低）：
     ① 有云端数据  sync:<acct> 键存在 —— 真人注册后一定会同步学习数据；探针只登录不碰业务
     ② 有 AI 用量  aiqmv:<acct>:<YYYY-MM> 有值 —— 真人用 AI 功能
     ③ 走邀请码    vip:<acct>.note 含 'invite:' —— 她主动发码给的人
   账号名只作**辅助提示**（probe/test/ux/wx 这类前缀），因为真人也可能叫 testuser，
   反过来探针也可能起别的名 —— 命名永远不能当判据，只能当线索。

   判定结果三态：
     real  真人    —— 有 sync: 或 有 aiqmv:
     probe  探针    —— 三条硬信号全无，且账号名命中探针模式
     idle   待观察  —— 三条硬信号全无，名字也不像探针（可能刚注册还没动手）
   ⚠️ 允许人工推翻：手动标记存 manual:<acct>，覆盖自动判定。
   ⚠️ 绝不自动删号（删账号是破坏性操作，必须她本人勾选确认）。 */
const PROBE_NAME_RE = /^(probe|test|qa|debug|tmp|demo|fake|ux|wx|kw|fix|ci)[-_0-9a-z]*/i;
async function judgeAccounts(kv, users, usageMonth) {
  /* 三个前缀各拉一次全量键，避免逐账号 N 次 kv.get */
  const syncKeys = await listAll(kv, 'sync:');
  const vipKeys = await listAll(kv, 'vip:');
  const monthUsers = new Set(Object.keys(usageMonth || {}));
  const hasSync = new Set(syncKeys.map(k => k.slice(5)));
  const vipNote = {};
  for (const k of vipKeys) {
    try {
      const v = JSON.parse((await kv.get(k)) || 'null');
      if (v) vipNote[k.slice(4)] = String(v.note || '');
    } catch (e) {}
  }
  /* 人工标记优先（她手动推翻的永远算数） */
  const manual = {};
  for (const k of await listAll(kv, 'manual:')) {
    try { manual[k.slice(7)] = JSON.parse((await kv.get(k)) || 'null'); } catch (e) {}
  }

  for (const u of users) {
    const a = u.acct;
    const sig = [];
    if (hasSync.has(a)) sig.push('sync');
    if (monthUsers.has(a)) sig.push('ai');
    if (/invite:/.test(vipNote[a] || '')) sig.push('invite');
    let verdict;
    if (sig.length) verdict = 'real';
    else if (PROBE_NAME_RE.test(a)) verdict = 'probe';
    else verdict = 'idle';
    u.sig = sig;
    u.nameHint = PROBE_NAME_RE.test(a);
    /* 人工标记覆盖自动判定；manual 为 1=真人 0=探针 */
    if (manual[a] != null) u.verdict = (manual[a] === 1 || manual[a] === '1') ? 'real' : 'probe';
    else u.verdict = verdict;
  }
  return users;
}

/* 聚合一个「长 TTL 聚合键」前缀成 { acct: 次数 }。键形如 <prefix>:<acct>:<period>。
   只统计 period === 当前 period 的键（上周/上月的残值不串进本期）。
   键由 ai.js 在每次成功调用后写入（TTL 400 天），与 ai_usage 读的是同一份 KV 真值。 */
async function aggPeriod(kv, prefix, period) {
  const out = {};
  const keys = await listAll(kv, prefix);
  for (const name of keys) {
    const parts = name.split(':');
    if (parts.length !== 3 || parts[2] !== period) continue;
    const n = parseInt((await kv.get(name)) || '0', 10) || 0;
    if (!n) continue;
    out[parts[1]] = (out[parts[1]] || 0) + n;
  }
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: '只支持 POST' }, 405);
  if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503);
  if (!env.ADMIN_KEY) return json({ ok: false, error: 'no_admin_key', msg: '未配置 ADMIN_KEY 环境变量（Cloudflare 后台 → Settings → Environment variables）' }, 503);
  const key = String(request.headers.get('X-Admin-Key') || '');
  if (!key || key !== env.ADMIN_KEY) return json({ ok: false, error: 'forbidden', msg: '管理员密钥不正确' }, 401);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const kv = env.SYNC_KV;
  const action = body.action;
  const day = dayKeyUTC(new Date());

  /* ---------- 面板一次拉全 ---------- */
  if (action === 'overview') {
    const userKeys = await listAll(kv, 'user:');
    const users = [];
    for (const name of userKeys) {
      const acct = name.slice(5);
      let created = null;
      try { created = (JSON.parse((await kv.get(name)) || '{}') || {}).created || null; } catch (e) {}
      users.push({ acct: acct, created: created });
    }
    users.sort((a, b) => (a.created || 0) - (b.created || 0));

    const invKeys = await listAll(kv, 'inv:');
    const invites = [];
    for (const name of invKeys) {
      try {
        const v = JSON.parse((await kv.get(name)) || '{}');
        invites.push({ code: name.slice(4), max: v.max || 0, used: v.used || 0, created: v.created || null, vipDays: v.vipDays || 0 });
      } catch (e) {}
    }
    invites.sort((a, b) => (b.created || 0) - (a.created || 0));

    /* 今日 AI 用量：键形如 aiqa:<acct>:<day>:<bucket>，只聚合今天的 */
    const usageKeys = await listAll(kv, 'aiqa:');
    const usage = {};
    let aiToday = 0;
    for (const name of usageKeys) {
      const parts = name.split(':');
      if (parts.length !== 4 || parts[2] !== day) continue;
      const n = parseInt((await kv.get(name)) || '0', 10) || 0;
      if (!n) continue;
      usage[parts[1]] = (usage[parts[1]] || 0) + n;
      aiToday += n;
    }

    /* 10/5 P1（她要「本月/本周」维度）：读 ai.js 侧新写的长 TTL 聚合键。
       aiqa: 只有 48h TTL 存不下月维度，故 ai.js 另写 aiqwv:（周）/ aiqmv:（月），TTL 400 天。
       口径：周 = ISO 周（周一至周日，UTC），月 = 自然月（UTC）—— 均与额度闸同源。
       残值处理：只聚合 period === 当前 period 的键，上周/上月残值不串进本期。 */
    const week = isoWeekKeyUTC(new Date());
    const month = monthKeyUTC(new Date());
    const usageWeek = await aggPeriod(kv, 'aiqwv:', week);
    const usageMonth = await aggPeriod(kv, 'aiqmv:', month);
    const aiWeek = Object.keys(usageWeek).reduce((s, k) => s + usageWeek[k], 0);
    const aiMonth = Object.keys(usageMonth).reduce((s, k) => s + usageMonth[k], 0);

    /* 10/5 P3 · 成本估算：aitok:<day>（全站当日 token）+ aitoku:<acct>:<day>（分账号）。
       单价读环境变量 AI_PRICE_IN / AI_PRICE_OUT（元 / 百万 token）——**代码里不写死价**，
       DeepSeek 调价只改 CF 环境变量。env 未配 → priceOk=false，前端显示「未配置单价」不瞎算。 */
    const priceIn = parseFloat(env.AI_PRICE_IN);
    const priceOut = parseFloat(env.AI_PRICE_OUT);
    const priceOk = isFinite(priceIn) && isFinite(priceOut);
    const yuanPerM = function (tok) { return priceOk ? (tok / 1e6) * (priceIn + priceOut) : 0; };
    const tokToday = parseInt((await kv.get('aitok:' + day)) || '0', 10) || 0;
    const tokWeek = 0, tokMonth = 0;
    for (const k of await listAll(kv, 'aitok:')) {
      const p = k.split(':');
      if (p.length !== 2) continue;
      const v = parseInt((await kv.get(k)) || '0', 10) || 0;
      if (!v) continue;
      /* 按天累加：周 = 最近 7 天、月 = 本月（自然月，与 aiqmv 口径一致）。
         ⚠️ 键里只有日期无法判周，改用「键名日期落在当前 ISO 周 / 本月内」来筛。 */
      const ds = p[1];
      if (weekOfDayKey(ds) === week) tokWeek += v;
      if (ds.slice(0, 6) === month.replace('-', '')) tokMonth += v;
    }
    const tokByAcct = {};
    for (const k of await listAll(kv, 'aitoku:')) {
      const p = k.split(':');
      if (p.length !== 3 || p[2] !== day) continue;
      const v = parseInt((await kv.get(k)) || '0', 10) || 0;
      if (v) tokByAcct[p[1]] = (tokByAcct[p[1]] || 0) + v;
    }
    /* 分功能统计：aitoks:<service>:<day> —— 知道哪个功能最费钱 */
    const byService = {};
    for (const k of await listAll(kv, 'aitoks:')) {
      const p = k.split(':');
      if (p.length !== 3 || p[2] !== day) continue;
      const v = parseInt((await kv.get(k)) || '0', 10) || 0;
      if (v) byService[p[1]] = (byService[p[1]] || 0) + v;
    }
    const svcSorted = Object.keys(byService).map(k => ({ svc: k, n: byService[k] })).sort((a, b) => b.n - a.n);

    /* 10/5 P3 · 真人/探针判定（她要「能区分到底是不是真人登录」） */
    await judgeAccounts(kv, users, usageMonth);
    const nReal = users.filter(u => u.verdict === 'real').length;
    const nProbe = users.filter(u => u.verdict === 'probe').length;
    /* 真人/探针各自的 AI 用量与成本（她真正关心的是这部分，不是被探针污染的全站数） */
    const aiMonthReal = users.filter(u => u.verdict === 'real')
      .reduce((s, u) => s + (usageMonth[u.acct] || 0), 0);
    const costMonthReal = users.filter(u => u.verdict === 'real')
      .reduce((s, u) => s + yuanPerM(tokByAcct[u.acct] || 0), 0);

    /* 10/5 P3 · 操作审计（谁何时给谁开了会员 —— 内测多人时唯一可查的地方） */
    const auditKeys = await listAll(kv, 'audit:');
    const audits = [];
    for (const name of auditKeys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (v && v.ts) audits.push(v);
      } catch (e) {}
    }
    audits.sort((a, b) => b.ts - a.ts);

    const sessCount = (await listAll(kv, 'sess:')).length;

    /* 会员列表：vip:<acct> = { type, expire(ms), grantedAt, note }；到期剩余天数一并算好。
       永久会员（她 10/1：站长本人）expire=9999999999999（2286 年）→ permanent 标记，前端显示「永久」不显示天数。 */
    const VIP_PERMANENT_EXPIRE = 9999999999999;
    const vipKeys = await listAll(kv, 'vip:');
    const now = Date.now();
    const vips = [];
    for (const name of vipKeys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (!v || !v.expire) continue;
        vips.push({ acct: name.slice(4), type: v.type || 'base', expire: v.expire, permanent: v.expire >= VIP_PERMANENT_EXPIRE, daysLeft: Math.ceil((v.expire - now) / 86400000), note: v.note || '' });
      } catch (e) {}
    }
    vips.sort((a, b) => a.expire - b.expire);   // 快到期的排前面

    /* 意见反馈（10/2）：只拉元数据，图片体在 fbimg:<id> 另行按需取。
       her 反馈量级很小（几十~几百条），一次性聚合进 overview 省一个往返。 */
    const fbKeys = await listAll(kv, 'fb:');
    const feedbacks = [];
    for (const name of fbKeys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (!v || !v.id) continue;
        feedbacks.push(v);
      } catch (e) {}
    }
    feedbacks.sort((a, b) => (b.ts || 0) - (a.ts || 0));   // 新的在前
    const fbUnread = feedbacks.filter((v) => !v.read).length;

    return json({ ok: true, day: day, week: week, month: month,
      users: users, invites: invites,
      usage: usage, aiToday: aiToday,
      usageWeek: usageWeek, aiWeek: aiWeek,
      usageMonth: usageMonth, aiMonth: aiMonth,
      /* 10/5 P3：真人/探针判定 + 只看真人的口径 */
      nReal: nReal, nProbe: nProbe, nIdle: users.length - nReal - nProbe, aiMonthReal: aiMonthReal,
      /* 10/5 P3：成本 + 分功能 */
      priceOk: priceOk, priceIn: priceOk ? priceIn : 0, priceOut: priceOk ? priceOut : 0,
      tokToday: tokToday, tokWeek: tokWeek, tokMonth: tokMonth, tokByAcct: tokByAcct,
      costToday: yuanPerM(tokToday), costWeek: yuanPerM(tokWeek), costMonth: yuanPerM(tokMonth),
      costMonthReal: costMonthReal, byService: svcSorted,
      /* 10/5 P3：操作审计 */
      audits: audits.slice(0, 100),
      sessCount: sessCount, vips: vips, feedbacks: feedbacks, fbUnread: fbUnread });
  }

  /* ---------- 生成邀请码 ---------- */
  if (action === 'invite_mint') {
    /* ⚠️ 不用 `|| 1` 兜底：max 填 0/留空/非数字要明确报 bad_max，而不是静默发一个 max=1 的码 */
    const max = parseInt(body.max, 10);
    if (!Number.isFinite(max) || max < 1 || max > 1000) return json({ ok: false, error: 'bad_max', msg: '可用次数限 1-1000' }, 400);
    let code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) code = randInviteCode();
    if (code.length < 4 || code.length > 16) return json({ ok: false, error: 'bad_code', msg: '自定义邀请码须 4-16 位字母数字' }, 400);
    if (await kv.get('inv:' + code)) return json({ ok: false, error: 'invite_exists', msg: '该邀请码已存在' }, 409);
    /* vipDays（她 10/1 内测码语义）：>0 = 用此码注册自动开会员 N 天；0/留空 = 纯注册码不送会员 */
    const vipDays = parseInt(body.vipDays, 10);
    const rec = { max: max, used: 0, created: Date.now() };
    if (Number.isFinite(vipDays) && vipDays > 0) rec.vipDays = Math.min(vipDays, 3650);
    await kv.put('inv:' + code, JSON.stringify(rec));
    await audit(kv, 'invite_mint', { code: code, max: max, vipDays: rec.vipDays || 0 });
    return json({ ok: true, code: code, max: max, vipDays: rec.vipDays || 0 });
  }

  /* ---------- 作废邀请码 ---------- */
  if (action === 'invite_revoke') {
    const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return json({ ok: false, error: 'bad_code', msg: '缺少邀请码' }, 400);
    await kv.delete('inv:' + code);
    return json({ ok: true, code: code });
  }

  /* ---------- 开通/续费会员（她收到转账后在这里手动开；档位价格是她的商业决策，面板只管时长） ---------- */
  if (action === 'vip_grant') {
    const acct = String(body.acct || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{6,20}$/.test(acct)) return json({ ok: false, error: 'bad_acct', msg: '账号格式：6-20 位数字/字母/下划线' }, 400);
    const permanent = !!body.permanent;   // 她 10/1 拍板：站长本人要永久会员——expire 用超大值（2286 年），所有判定（expire > now）零改动
    const days = permanent ? 1 : parseInt(body.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ ok: false, error: 'bad_days', msg: '会员天数限 1-3650' }, 400);
    if (!(await kv.get('user:' + acct))) return json({ ok: false, error: 'no_user', msg: '该账号还没注册（会员只开给已注册账号）' }, 404);
    let cur = null;
    try { cur = JSON.parse((await kv.get('vip:' + acct)) || 'null'); } catch (e) {}
    /* 未过期则从现到期日顺延（续费不吃亏），已过期/新开从现在起算；永久=直接覆盖成超大值 */
    const VIP_PERMANENT_EXPIRE = 9999999999999;   // = 2286-11-20，够「永久」；date(0) 时代之上任意巨大值均可
    const base = (!permanent && cur && cur.expire > Date.now() && cur.expire < VIP_PERMANENT_EXPIRE) ? cur.expire : Date.now();
    const rec = {
      type: 'base',                                        // 单档会员（她拍板：免费版→基础会员，无复杂分级）
      expire: permanent ? VIP_PERMANENT_EXPIRE : base + days * 86400000,
      grantedAt: Date.now(),
      note: permanent ? (String(body.note || '').slice(0, 90) + ' [永久]').slice(0, 100) : String(body.note || '').slice(0, 100),
    };
    await kv.put('vip:' + acct, JSON.stringify(rec));
    /* 审计：区分「新开 / 续费 / 改永久」三种情形 —— 将来对账时这是唯一线索 */
    const prevLeft = cur && cur.expire ? Math.ceil((cur.expire - Date.now()) / 86400000) : null;
    const kind = permanent ? 'set_permanent' : (cur && cur.expire > Date.now() ? 'renew' : 'grant');
    await audit(kv, 'vip_' + kind, {
      acct: acct, days: permanent ? 0 : days, permanent: permanent,
      expire: rec.expire, prevDaysLeft: prevLeft, note: rec.note || '',
    });
    return json({ ok: true, acct: acct, permanent: permanent, expire: rec.expire, daysLeft: permanent ? null : Math.ceil((rec.expire - Date.now()) / 86400000) });
  }

  /* ---------- 撤销会员 ---------- */
  if (action === 'vip_revoke') {
    const acct = String(body.acct || '').trim().toLowerCase();
    if (!acct) return json({ ok: false, error: 'bad_acct', msg: '缺少账号' }, 400);
    /* 撤销前先看一眼原值，审计里记清「撤的是个什么状态的会员」（否则事后无从追） */
    let prev = null;
    try { prev = JSON.parse((await kv.get('vip:' + acct)) || 'null'); } catch (e) {}
    await kv.delete('vip:' + acct);
    await audit(kv, 'vip_revoke', {
      acct: acct,
      hadVip: !!(prev && prev.expire),
      prevExpire: (prev && prev.expire) || 0,
      prevNote: (prev && prev.note) || '',
    });
    return json({ ok: true, acct: acct });
  }

  /* ---------- 人工标记真人/探针（10/5 P3 她要能自己推翻自动判定） ----------
     存 manual:<acct> = 1（真人）/ 0（探针）。传 clear:1 则删除标记、回到自动判定。 */
  if (action === 'judge_set') {
    const acct = String(body.acct || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{6,20}$/.test(acct)) return json({ ok: false, error: 'bad_acct', msg: '账号格式：6-20 位数字/字母/下划线' }, 400);
    if (body.clear) {
      await kv.delete('manual:' + acct);
      await audit(kv, 'judge_clear', { acct: acct });
      return json({ ok: true, acct: acct, manual: null });
    }
    const isReal = (body.verdict === 'real' || body.verdict === 1 || body.verdict === '1') ? 1 : 0;
    await kv.put('manual:' + acct, String(isReal));
    await audit(kv, isReal ? 'judge_mark_real' : 'judge_mark_probe', { acct: acct });
    return json({ ok: true, acct: acct, manual: isReal });
  }

  /* ---------- 操作审计列表（10/5 P3）---------- */
  if (action === 'audit_list') {
    const keys = await listAll(kv, 'audit:');
    const list = [];
    for (const name of keys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (v && v.ts) list.push(v);
      } catch (e) {}
    }
    list.sort((a, b) => b.ts - a.ts);          // 新的在前
    return json({ ok: true, audits: list.slice(0, 200) });   // 一次最多回 200 条，够她看了
  }

  /* ---------- 意见反馈（10/2）----------
     ⚠️ id 一律白名单化再拼键：fb:<id> 里的 id 来自用户提交，只允许 [0-9a-f-]{1,64}，
        挡掉 '../' 'a:b' 这类把键写到别的命名空间去的构造。 */
  const fbId = () => {
    const s = String(body.id || '').trim();
    return /^[0-9a-f-]{1,64}$/i.test(s) ? s : '';
  };

  if (action === 'fb_list') {
    const keys = await listAll(kv, 'fb:');
    const list = [];
    for (const name of keys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (v && v.id) list.push(v);
      } catch (e) {}
    }
    list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return json({ ok: true, feedbacks: list, unread: list.filter((v) => !v.read).length });
  }

  if (action === 'fb_get') {
    const id = fbId();
    if (!id) return json({ ok: false, error: 'bad_id', msg: '缺少/非法 id' }, 400);
    let rec = null;
    try { rec = JSON.parse((await kv.get('fb:' + id)) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'not_found', msg: '反馈不存在或已删除' }, 404);
    let imgs = [];
    if (rec.imgs) {
      try { imgs = JSON.parse((await kv.get('fbimg:' + id)) || '[]') || []; } catch (e) {}
    }
    return json({ ok: true, fb: rec, imgs: imgs });
  }

  if (action === 'fb_read') {
    const id = fbId();
    if (!id) return json({ ok: false, error: 'bad_id', msg: '缺少/非法 id' }, 400);
    let rec = null;
    try { rec = JSON.parse((await kv.get('fb:' + id)) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'not_found', msg: '反馈不存在或已删除' }, 404);
    rec.read = body.read ? 1 : 0;
    await kv.put('fb:' + id, JSON.stringify(rec));
    return json({ ok: true, id: id, read: rec.read });
  }

  if (action === 'fb_del') {
    const id = fbId();
    if (!id) return json({ ok: false, error: 'bad_id', msg: '缺少/非法 id' }, 400);
    await kv.delete('fb:' + id);
    await kv.delete('fbimg:' + id);
    return json({ ok: true, id: id });
  }

  return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
}
