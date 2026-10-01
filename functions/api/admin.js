// Cloudflare Pages Function: /api/admin —— 站长管理面板后端（她 10/1 要求：不进 CF 后台也能管站）
// 页面入口 = admin.html（noindex，不进站内导航，不进 SW 预缓存）。
//
// 安全模型：全部 action 要求请求头 X-Admin-Key === 环境变量 ADMIN_KEY（密钥只在她的浏览器
// sessionStorage 里，不落库、不进学习站数据）。面板与学习站完全独立（admin.html 不加载 common.js）。
//
// 能力（她点名的「看到所有用户的数据」 + 商业化第一块基建）：
//   overview       一次性拉全量：用户列表（账号+注册时间）、邀请码列表（码/限用/已用）、
//                  今日每账号 AI 调用次数、活跃 session 数、全站今日 AI 总量、会员列表
//   invite_mint    生成邀请码（随机 8 位或自定义 4-16 位字母数字；max = 可用次数）
//   invite_revoke  作废邀请码（直接删 inv:<code> 键；已注册的账号不受影响）
//   vip_grant      给账号开会员（10/1 晚她授权先搭框架）：KV 键 vip:<acct> = { type, expire, grantedAt, note }，
//                  续费 = max(现 expire, now) + days 顺延；只允许给已注册账号开（防手滑开错号）
//   vip_revoke     撤销会员（删 vip:<acct> 键）
// 不做（风险控制，等真需要再说）：改/删用户数据、踢 session。
//
// ⚠️ 会员状态安全口径：vip:<acct> 只存 KV 服务端（站长面板发放），**绝不进 DATA 云同步 blob**
//    ——DATA 在客户端可被用户随意改，会员状态进 DATA 等于白送。前端显示会员态走 /api/auth
//    login 响应（vip 字段）或后续轻接口，一律以服务端为准。
//
// KV 键口径与 ai.js / auth.js 对齐：
//   user:<acct> / sess:<token> / inv:<CODE> / vip:<acct>
//   aiqa:<acct>:<YYYYMMDD>:<bucket>   —— ai.js 的按账号 AI 计量（10 个分钟桶轮转）

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
        invites.push({ code: name.slice(4), max: v.max || 0, used: v.used || 0, created: v.created || null });
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

    const sessCount = (await listAll(kv, 'sess:')).length;

    /* 会员列表：vip:<acct> = { type, expire(ms), grantedAt, note }；到期剩余天数一并算好 */
    const vipKeys = await listAll(kv, 'vip:');
    const now = Date.now();
    const vips = [];
    for (const name of vipKeys) {
      try {
        const v = JSON.parse((await kv.get(name)) || 'null');
        if (!v || !v.expire) continue;
        vips.push({ acct: name.slice(4), type: v.type || 'base', expire: v.expire, daysLeft: Math.ceil((v.expire - now) / 86400000), note: v.note || '' });
      } catch (e) {}
    }
    vips.sort((a, b) => a.expire - b.expire);   // 快到期的排前面

    return json({ ok: true, day: day, users: users, invites: invites, usage: usage, aiToday: aiToday, sessCount: sessCount, vips: vips });
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
    await kv.put('inv:' + code, JSON.stringify({ max: max, used: 0, created: Date.now() }));
    return json({ ok: true, code: code, max: max });
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
    const days = parseInt(body.days, 10);
    if (!Number.isFinite(days) || days < 1 || days > 3650) return json({ ok: false, error: 'bad_days', msg: '会员天数限 1-3650' }, 400);
    if (!(await kv.get('user:' + acct))) return json({ ok: false, error: 'no_user', msg: '该账号还没注册（会员只开给已注册账号）' }, 404);
    let cur = null;
    try { cur = JSON.parse((await kv.get('vip:' + acct)) || 'null'); } catch (e) {}
    /* 未过期则从现到期日顺延（续费不吃亏），已过期/新开从现在起算 */
    const base = (cur && cur.expire > Date.now()) ? cur.expire : Date.now();
    const rec = {
      type: 'base',                                        // 单档会员（她拍板：免费版→基础会员，无复杂分级）
      expire: base + days * 86400000,
      grantedAt: Date.now(),
      note: String(body.note || '').slice(0, 100),
    };
    await kv.put('vip:' + acct, JSON.stringify(rec));
    return json({ ok: true, acct: acct, expire: rec.expire, daysLeft: Math.ceil((rec.expire - Date.now()) / 86400000) });
  }

  /* ---------- 撤销会员 ---------- */
  if (action === 'vip_revoke') {
    const acct = String(body.acct || '').trim().toLowerCase();
    if (!acct) return json({ ok: false, error: 'bad_acct', msg: '缺少账号' }, 400);
    await kv.delete('vip:' + acct);
    return json({ ok: true, acct: acct });
  }

  return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
}
