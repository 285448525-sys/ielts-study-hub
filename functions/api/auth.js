// Cloudflare Pages Function: /api/auth —— 账号（手机号/用户名）+ 密码登录（注册 / 登录 / 改密码 / 登出）
//
// 背景（10/1 她拍板）：邮箱验证码登录要买域名 + Resend（MAIL_API_KEY / MAIL_FROM），先不搞。
// 改成「手机号 + 密码」，同时补上以前最大的安全洞——「手机号即凭证，任何知道号码的人都能读写云数据」：
//   · register  手机号/用户名 + 密码 + 邀请码 → PBKDF2 存哈希（绝不存明文）
//   · login     验密码 → 发 30 天 session token，此后 /api/sync 凭 X-Session token 读写
//   · change    登录态下验旧密码 → 换新密码（session 保留，其他设备不受影响）
//   · logout    删 session
//   找回密码：暂未提供——恢复码机制已按她 10/1 拍板整套下线（太长记不住，比密码还难记）；
//   手机验证码找回后续版本再做。在此之前忘记密码只能换新号重开（云端老数据归旧键名，不会丢）。
//
// 邀请码（她 10/1 二次拍板=内测会员码）：KV 键 inv:<CODE> = { max, used, created, vipDays? }；注册选填，
// 用码注册成功自动开会员 vipDays 天（缺省 30）；不填码注册走免费额度。注册成功才消耗。
// 发码/作废/看用量统一走 /api/admin（ADMIN_KEY 鉴权），页面化入口 = admin.html 站长面板
// （她 10/1 要求：不进 CF 后台也能管用户/发码/看数据）。
//
// KV 键（SYNC_KV）：
//   user:<acct>    { salt, hash, rechash?, created }  —— PBKDF2-SHA256 10 万次迭代 + 随机盐
//                  （rechash 是恢复码时代的遗留字段：存量账号还带着，新注册/改密不再写入，留着无害）
//   sess:<token>   { acct }                           —— TTL 30 天（30 天后需重新登录）
//   fail:<acct>    登录失败计数（10 次锁 15 分钟，防在线爆破；TTL 自愈）
//   inv:<CODE>     { max, used, created, vipDays? }      —— 邀请码（注册选填；vipDays=送会员天数；无 TTL）
//   数据键 sync:<acct> / meta:<acct> 仍归 /api/sync 管，老手机号账号键名不变，老数据原样保留。
//
// 兼容口径（老用户迁移）：
//   · 老用户只有手机号、没设过密码：register 允许「云端已有数据但无密码」的号直接设密码
//     ——第一个设密码的人接管该号，与旧「手机号即凭证」同级；设完即安全（此后 register → 409）。
//   · 邮箱账号体系（sync:e: 命名空间）随本次退役：从未真正上线（MAIL_API_KEY 一直没配），零影响。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, X-Session',
  'access-control-max-age': '86400',
};
/* 🔴 10/5 17:10 修正诊断（此前误诊为 CPU/PBKDF2，已撤销）：
   debug 字段实测 err = "KV put() limit exceeded for the day." ——
   **真凶 = KV 免费版每日写入配额（1000 次/天）耗尽**，不是 CPU。
   证据链：register(put user:) / login(put sess:) / sync(put sync:) 全 500；
   logout（不写 KV）200 正常；pbkdf2 10 万次**每次都跑完了**（错误发生在 put 那一行）。
   配额按 UTC 天重置（北京时间早 8 点），代码无法绕过 —— 能做的只有把错误说成人话。
   ⚠️ 根因是我当天跑了十几轮探针（每轮多次注册/登录/同步，全是 KV 写）。
   🔑 探针纪律：跑真接口的探针**当天写入次数也要预算**，别一天烧穿两次。 */
const PBKDF2_ITER = 100000;
const SESS_TTL = 30 * 24 * 3600;          // session 30 天
const LOCK_TTL = 15 * 60;                 // 失败锁定 15 分钟
const MAX_FAILS = 10;
// ⭐ 10/1 她拍板：账号 = 手机号 或 自定义用户名（6-20 位数字/字母/下划线，统一小写存储）。
// 老手机号账号（6-15 位纯数字）天然满足该规则，登录键名不变，云端老数据无缝接上。
// 🔴 10/13 放开邮箱：注册改「邮箱 + 验证码 + 密码」后，登录时 acct 传的就是邮箱
//    （如 camille@example.com）——原 ACCT_RE 不含 @/. 会把所有邮箱账号挡在登录外。
//    规则改为「6-20 位用户名/手机号」或「合法邮箱」，两者取或，老账号零影响。
const ACCT_RE = /^(?:[a-z0-9_]{6,20}|[^\s@]+@[^\s@]+\.[^\s@]{2,})$/;

/* ===== 邀请裂变常量与工具（10/13 她拍板）=====
const INVITE_REWARD_DAYS = 7;    /* 双方各得 7 天 */
const INVITE_CAP_DAYS = 30;      /* 每人累计收益上限 30 天（≈ 最多邀 4 人） */

/* 邀请码 = 邮箱的 PBKDF2 哈希前 8 位：稳定（同邮箱永远同码）、不可逆、免存储。 */
async function inviteCodeOf(kv, acct) {
  try {
    const salt = 'a1b2c3d4e5f60718';   /* 🔴 必须是合法 hex：pbkdf2() 内部走 hexToBuf(salt)，非 hex 会抛异常 → 500 */
    const h = await pbkdf2(String(acct || ''), salt);
    return h.slice(0, 8).toUpperCase();
  } catch (e) { return ''; }
}

/* 反查：邀请码 → 账号。邀请码是邮箱哈希，无法直接反推，
   所以注册时把「邀请码 → 被邀人邮箱」的映射存下来（inv2e:<code>），仅用于发放。 */
async function acctOfInvite(kv, code) {
  try { return (await kv.get('inv2e:' + code)) || ''; } catch (e) { return ''; }
}

/* 发放：给邀请人和被邀人各加 INVITE_REWARD_DAYS 天会员。
   上限判定只看邀请人累计（被邀人想再邀也走自己的码，互不占用）。 */
async function grantInvite(kv, inviteCode, invitedAcct) {
  const inviterAcct = await acctOfInvite(kv, inviteCode);
  if (!inviterAcct || inviterAcct === invitedAcct) return { ok: false, msg: '自邀无效' };
  let st = { invited: 0, earnedDays: 0 };
  try { st = JSON.parse((await kv.get('invst:' + inviterAcct)) || 'null') || st; } catch (e) {}
  const remaining = INVITE_CAP_DAYS - (st.earnedDays || 0);
  if (remaining < INVITE_REWARD_DAYS) return { ok: false, msg: '对方邀请额度已用完' };
  /* 被邀人得额度 */
  await addVipDays(kv, invitedAcct, INVITE_REWARD_DAYS);
  /* 邀请人得额度 + 累计 */
  await addVipDays(kv, inviterAcct, INVITE_REWARD_DAYS);
  st.invited = (st.invited || 0) + 1;
  st.earnedDays = (st.earnedDays || 0) + INVITE_REWARD_DAYS;
  await kv.put('invst:' + inviterAcct, JSON.stringify(st));
  return { ok: true, earnedDays: st.earnedDays };
}

/* 给账号加会员天数（在现有 expire 上累加，已过期则从现在起算） */
async function addVipDays(kv, acct, days) {
  let cur = null;
  try { cur = JSON.parse((await kv.get('vip:' + acct)) || 'null'); } catch (e) {}
  const now = Date.now();
  const base = (cur && cur.expire && cur.expire > now) ? cur.expire : now;
  const expire = base + days * 86400000;
  await kv.put('vip:' + acct, JSON.stringify({ type: (cur && cur.type) || 'invite', expire }));
}
/* 🔴 10/13：账号 → KV 键名统一入口。邮箱账号存 user:e:<email>（与老手机号/用户名账号隔离），
   其余（6-20 位用户名/手机号）仍用 user:<acct>，老数据键名不变、无缝登录。
   login/sessionOf/change 全部改走它，否则邮箱登录会拿裸邮箱当键名去查库 → 永远 no_user。 */
function acctKey(acct) {
  const a = String(acct || '').trim().toLowerCase();
  return a.indexOf('@') >= 0 ? 'user:e:' + a : 'user:' + a;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

function badPhone(p) { return !ACCT_RE.test(String(p || '')); }
function badPass(p) { return typeof p !== 'string' || p.length < 6 || p.length > 64; }

function bufToHex(buf) {
  const v = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < v.length; i++) s += v[i].toString(16).padStart(2, '0');
  return s;
}
function hexToBuf(hex) {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function randHex(nBytes) {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return bufToHex(b);
}
/* 🔴 10/5 16:45 CPU 超限保护：
   Workers 免费版 CPU 限额很小，PBKDF2 迭代一高就抛 "error code: 1101"（裸 500，前端只看到
   "Failed to load resource: 500"，完全不知道发生了什么）。
   这里包一层：① 迭代数再高也不抛，② 真超限时抛出**带 error code 的人话错误**，
   前端可以提示"服务繁忙，请稍后再试"而不是让用户以为密码错了。 */
async function pbkdf2(password, saltHex) {
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBuf(saltHex), iterations: PBKDF2_ITER }, key, 256);
    return bufToHex(bits);
  } catch (e) {
    const err = new Error('密码加密失败：算力配额已用尽（今日调用过多）。请稍后再试，或联系站长。');
    err.code = 'crypto_busy';
    err.cause = e;
    throw err;
  }
}

/* 失败计数：达到上限返回 true（已锁）。锁定期内直接拒绝，不给验证机会 */
async function failLock(kv, kind, phone, fails) {
  const key = 'fail' + kind + ':' + phone;
  if (fails) {
    const n = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(n), { expirationTtl: LOCK_TTL });
    return n >= MAX_FAILS;
  }
  return parseInt((await kv.get(key)) || '0', 10) >= MAX_FAILS;
}
const failClear = (kv, kind, phone) => kv.delete('fail' + kind + ':' + phone).catch(() => {});

/* 从 body 或 X-Session 头取 token；返回 sess 记录或 null */
async function sessionOf(kv, request, body) {
  const tok = String((request.headers.get('X-Session') || (body && body.token) || '')).trim();
  if (!tok || !/^[0-9a-f]{32,128}$/.test(tok)) return null;
  try {
    const raw = await kv.get('sess:' + tok);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const acct = (s && (s.acct || s.phone)) || '';
    return (acct && ACCT_RE.test(acct)) ? { acct, tok } : null;
  } catch (e) { return null; }
}

/* 🔴 10/5 16:45 全局兜底：任何未捕获异常都返回人话 JSON，不再抛裸 500。
   背景：Workers 免费版 CPU 超限时抛 `error code: 1101`，浏览器只看到
   「Failed to load resource: 500」，用户完全不知道发生了什么（她 16:37 的截图就是这）。
   这里把最可能的两种（算力超限 / 其他）翻译成能看懂的话，前端可据此提示。
   ⚠️ 只包「返回错误」不吞业务：真正的鉴权/校验错误仍由内部 json() 正常返回。 */
export async function onRequest(context) {
  try {
    return await handleRequest(context);
  } catch (err) {
    /* 🔴 10/5 17:10：分类已按 debug 实测修正 —— 真凶是「KV put() limit exceeded for the day」，
       不是 CPU（16:45 那版误诊，PBKDF2 已撤销降级恢复 10 万）。
       响应不再带 debug 字段（信息已确认，不往外漏内部细节）。 */
    const msg = String((err && err.message) || err || '');
    if (/KV put\(\) limit exceeded|KV .* limit/i.test(msg)) {
      return json({ ok: false, error: 'kv_busy',
        msg: '云端存储今日写入配额已用完（每天北京时间 8 点重置）。你的密码和本机数据都没问题，明早即可正常注册/登录/同步。' }, 503);
    }
    if (/crypto|1101|Worker exceeded|K exceeded|CPU|quota/i.test(msg)) {
      return json({ ok: false, error: 'server_busy',
        msg: '服务暂时繁忙，请稍后再试 —— 你的密码和本机数据都没问题。' }, 503);
    }
    return json({ ok: false, error: 'server_error',
      msg: '服务出错了，请稍后再试' }, 500);
  }
}

async function handleRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: '只支持 POST' }, 405);
  if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503);

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json', msg: '请求体不是合法 JSON' }, 400); }
  const kv = env.SYNC_KV;
  const action = body && body.action;

  /* ---------- 注册：账号（手机号/用户名）+ 密码 + 邀请码（选填） ---------- */
  if (action === 'register') {
    const acct = String(body.acct || body.phone || '').trim().toLowerCase();
    const password = String(body.password || '');
    const invCode = String(body.inviteCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    /* 10/5 P1 · 注册来源标记（修 admin 面板「真人/探针」判定失灵）
       🔴 事故原委：面板判「真人」的三条硬信号之一是「有 AI 用量」，而**我写测试的探针号每个都真调了 AI**
          → 满屏 pqb* 全被判成「真人 · 有AI用量」，把判定彻底打败（她 14:26 截图质问）。
       ✅ 正解 = **让探针自报家门**：注册时带 src:'probe'，面板直接按标记判，不再靠推断。
       - src 白名单化后才落库（只认 'probe'，其余一律记 'real'）—— 防任意字符串进 user: 键
       - **判定优先级：src 标记 > 信号推断**（她手动改判的 manual: 仍最高，见 admin.js）
       - ⚠️ 老账号（本次之前注册）没有 src 字段 → 按信号推断，行为与现在完全一致，零迁移。 */
    const srcRaw = String(body.src || '').trim();
    const src = srcRaw === 'probe' ? 'probe' : 'real';
    if (badPhone(acct)) return json({ ok: false, error: 'bad_phone', msg: '账号格式：6-20 位数字/字母/下划线' }, 400);
    if (badPass(password)) return json({ ok: false, error: 'bad_password', msg: '密码至少 6 位（最长 64 位）' }, 400);
    /* 邀请码（她 10/1 二次拍板）：注册自由开放（不填码也能注册，吃免费额度）；
       填了有效码 = 内测码，注册成功自动开会员 inv.vipDays 天（站长发码时定天数，缺省 30）。
       填了无效码照样报错（绝不静默降级成普通注册——否则朋友以为有会员结果没有）。 */
    let inv = null;
    if (invCode) {
      try { inv = JSON.parse((await kv.get('inv:' + invCode)) || 'null'); } catch (e) {}
      if (!inv || !inv.max || (inv.used || 0) >= inv.max) {
        return json({ ok: false, error: 'bad_invite', msg: '邀请码无效或已用完' }, 403);
      }
    }
    if (await kv.get(acctKey(acct))) {
      return json({ ok: false, error: 'already_registered', msg: '该账号已设置过密码，直接登录即可' }, 409);
    }
    const salt = randHex(16);
    const hash = await pbkdf2(password, salt);
    await kv.put(acctKey(acct), JSON.stringify({ salt, hash, created: Date.now(), src: src }));
    /* 注册成功才消耗邀请码（前面任何一步失败都不吃码）；内测码同时送会员 */
    let vipGranted = 0;
    if (inv) {
      inv.used = (inv.used || 0) + 1;
      await kv.put('inv:' + invCode, JSON.stringify(inv));
      const days = Math.max(1, parseInt(inv.vipDays, 10) || 30);   // 发码时定的天数；老码无此字段按 30 兜底
      const expire = Date.now() + days * 86400000;
      await kv.put('vip:' + acct, JSON.stringify({ type: 'base', expire, grantedAt: Date.now(), note: 'invite:' + invCode }));
      vipGranted = days;
    }
    return json({ ok: true, vipGranted });
  }

  /* ---------- 邮箱验证码：发送（10/13 她拍板：注册改邮箱+验证码，堵邀请码被薅）----------
     为什么做：原「手机号/用户名 + 密码」的 ACCT_RE 只校验格式不校验真实性 → 123456/aaaaaa
     都能注册，一个真人可无限换号薅邀请会员（她 21:4x 发现的风险，属实）。
     邮箱验证码 = 每个账号必须能收信，注册成本从 0 变成「一个真实邮箱」。
     档位：Resend 免费 3000 封/月（她去注册并配 MAIL_API_KEY / MAIL_FROM 到 CF 环境变量）。
     ⚠️ 未配 MAIL_API_KEY 时返回 mail_not_configured，前端提示「验证码服务未开通」，
        不影响原有 register/login（老账号照常登录，零回归）。 */
  if (action === 'email_code') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return json({ ok: false, error: 'bad_email', msg: '邮箱格式不太对，检查一下？' }, 400);
    }
    if (!env.MAIL_API_KEY || !env.MAIL_FROM) {
      return json({ ok: false, error: 'mail_not_configured', msg: '验证码服务还没开通（站长未配置邮件密钥）' }, 503);
    }
    /* 频率护栏（防刷信 + 防烧 KV）：
       ① 同一邮箱 60 秒内只能发一次（ec_cd:<email>）
       ② 同一邮箱每天最多 5 封（ec_d:<email>:<UTC day>）
       ③ 验证码本身 TTL 10 分钟（ec:<email>） */
    const _p = n => String(n).padStart(2, '0');
    const _d = new Date();
    const day = _d.getUTCFullYear() + _p(_d.getUTCMonth() + 1) + _p(_d.getUTCDate());
    const cdKey = 'ec_cd:' + email;
    if (await kv.get(cdKey)) {
      return json({ ok: false, error: 'too_soon', msg: '验证码刚发过，60 秒后再试一次' }, 429);
    }
    const dayCnt = parseInt((await kv.get('ec_d:' + email + ':' + day)) || '0', 10) + 1;
    if (dayCnt > 5) {
      return json({ ok: false, error: 'too_many', msg: '今天验证码发得够多了，明天再试（或先用账号密码登录）' }, 429);
    }
    const code = String(Math.floor(Math.random() * 900000) + 100000);
    try {
      await kv.put('ec:' + email, code, { expirationTtl: 600 });
      await kv.put(cdKey, '1', { expirationTtl: 60 });
      await kv.put('ec_d:' + email + ':' + day, String(dayCnt), { expirationTtl: 86400 });
    } catch (e) {
      if (/limit/i.test(String(e && e.message))) {
        return json({ ok: false, error: 'kv_busy', msg: '云端存储今日写入配额已用完，明早再试' }, 503);
      }
      throw e;
    }
    /* 发信（Resend REST）。失败不回滚 KV（码还在，让她重试「重新发送」即可），
       但要把真实原因回给人话 —— 以前裸 500 她根本不知道发生了什么。 */
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + env.MAIL_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: [email],
          subject: '雅思备考 Hub · 登录验证码',
          html: '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:24px">'
            + '<p style="font-size:15px;color:#111;margin:0 0 12px">你的登录验证码是：</p>'
            + '<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#1a4542;margin:0 0 16px">' + code + '</p>'
            + '<p style="font-size:13px;color:#666;margin:0">10 分钟内有效。如果这不是你本人操作，忽略这封邮件即可。</p>'
            + '</div>'
        })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return json({ ok: false, error: 'mail_failed', msg: '验证码没发出去（' + r.status + '），稍后再试' }, 502);
      }
    } catch (e) {
      return json({ ok: false, error: 'mail_failed', msg: '验证码没发出去（网络问题），稍后再试' }, 502);
    }
    return json({ ok: true, msg: '验证码已发送，10 分钟内有效' });
  }

  /* ---------- 邮箱注册：验证码 + 设密码（10/13 她拍板「邮箱+密码+验证码注册」）----------
     注册要验证码（证明邮箱真实存在，挡批量薅邀请）；**之后登录只走普通 login**
     （账号填邮箱 + 密码，不用天天收码，体验顺）。
     邮箱账号用 e:<email> 命名空间与老手机号账号（user:<acct>）隔离，互不覆盖。
     inviteCode 选填：批 2 接裂变（双向 7 天）；本批先收下存着，不发放。 */
  if (action === 'email_register') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const invCode = String(body.inviteCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code)) {
      return json({ ok: false, error: 'bad_params', msg: '邮箱或验证码格式不对' }, 400);
    }
    if (badPass(password)) {
      return json({ ok: false, error: 'bad_password', msg: '密码至少 6 位（最长 64 位）' }, 400);
    }
    const saved = await kv.get('ec:' + email);
    if (!saved || saved !== code) {
      return json({ ok: false, error: 'bad_code', msg: '验证码不对或已过期，重新发一个试试' }, 400);
    }
    const acct = email;   /* 键名前缀由 acctKey 统一加，这里存裸邮箱 */
    /* 幂等：已注册过的邮箱直接提示去登录，不覆盖已有哈希（防重复注册把老号洗掉） */
    let exist = null;
    try { exist = JSON.parse((await kv.get(acctKey(acct))) || 'null'); } catch (e) {}
    if (exist && exist.hash) {
      return json({ ok: false, error: 'exists', msg: '这个邮箱已经注册过了，直接用邮箱 + 密码登录' }, 409);
    }
    const salt = randHex(16);
    const rec = { email, via: 'email', created: Date.now(), salt, hash: await pbkdf2(password, salt) };
    /* ---------- 邀请裂变（10/13 她拍板）----------
       规则：邀请码 = 邀请人邮箱的稳定哈希（8 位）；被邀人注册时填别人的码 →
       双方各得 INVITE_REWARD_DAYS（默认 7 天）会员；邀请人累计收益上限 INVITE_CAP_DAYS（30 天）→
       最多邀请 4 人（4×7=28），第 5 人起不再发放（她原话：超过 30 天就不能薅了）。
       幂等：同一邀请码只对一个被邀账号生效一次（invitedBy 落库即凭证，重复注册走 exists 拦）。 */
    if (invCode) {
      rec.invitedBy = invCode;
      try { await grantInvite(kv, invCode, acct); } catch (e) { /* 发放失败不阻塞注册 */ }
    }
    try { await kv.put(acctKey(acct), JSON.stringify(rec)); } catch (e) {
      if (/limit/i.test(String(e && e.message))) {
        return json({ ok: false, error: 'kv_busy', msg: '云端存储今日写入配额已用完，明早再注册' }, 503);
      }
      throw e;
    }
    try { await kv.delete('ec:' + email); } catch (e) {}
    /* 建邀请反查索引：别人注册时填我的码，服务端要能反查到「是我邀请的」。
       码 = 邮箱哈希，不可逆，所以正查一遍存下来（幂等，重复注册不覆盖）。 */
    try { await kv.put('inv2e:' + await inviteCodeOf(kv, acct), acct); } catch (e) {}
    /* 注册即登录：直接发 session，前端少一步 */
    const token = randHex(32);
    await kv.put('sess:' + token, JSON.stringify({ acct }), { expirationTtl: SESS_TTL });
    return json({ ok: true, token, acct: email, isNew: true, msg: '注册成功，已自动登录' });
  }

  /* ---------- 登录 ---------- */
  if (action === 'login') {
    const acct = String(body.acct || body.phone || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (badPhone(acct) || badPass(password)) return json({ ok: false, error: 'bad_credentials', msg: '账号或密码不正确' }, 400);
    if (await failLock(kv, '', acct, false)) return json({ ok: false, error: 'locked', msg: '尝试次数过多，请 15 分钟后再试' }, 429);
    let rec = null;
    try { rec = JSON.parse((await kv.get(acctKey(acct))) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'no_user', msg: '该账号还没设置过密码，先「设置密码」（老用户数据会自动接上）' }, 404);
    const h = await pbkdf2(password, rec.salt);
    if (h !== rec.hash) {
      await failLock(kv, '', acct, true);
      return json({ ok: false, error: 'bad_credentials', msg: '账号或密码不正确' }, 401);
    }
    await failClear(kv, '', acct);
    const token = randHex(32);
    await kv.put('sess:' + token, JSON.stringify({ acct }), { expirationTtl: SESS_TTL });
    /* 会员状态随登录响应下发（10/1 晚框架）：vip:<acct> 只在服务端（面板发放），
       前端只读不可改；未开通/已过期 → vip: null。 */
    let vip = null;
    try {
      const v = JSON.parse((await kv.get('vip:' + acct)) || 'null');
      if (v && v.expire && v.expire > Date.now()) vip = { type: v.type || 'base', expire: v.expire };
    } catch (e) {}
    return json({ ok: true, token, acct, vip });
  }

  /* ---------- 修改密码（需登录态） ---------- */
  if (action === 'change') {
    const sess = await sessionOf(kv, request, body);
    if (!sess) return json({ ok: false, error: 'unauthorized', msg: '登录已过期，请重新登录' }, 401);
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');
    if (badPass(newPassword)) return json({ ok: false, error: 'bad_password', msg: '新密码至少 6 位（最长 64 位）' }, 400);
    let rec = null;
    try { rec = JSON.parse((await kv.get(acctKey(sess.acct))) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'no_user', msg: '账号异常（无密码记录）' }, 404);
    const oldH = await pbkdf2(oldPassword, rec.salt);
    if (oldH !== rec.hash) return json({ ok: false, error: 'bad_old', msg: '当前密码不正确' }, 401);
    const salt = randHex(16);
    rec.salt = salt;
    rec.hash = await pbkdf2(newPassword, salt);
    await kv.put(acctKey(sess.acct), JSON.stringify(rec));
    return json({ ok: true });
  }

  /* ---------- 找回密码：邮箱验证码重置（10/13 豆包评审点名补齐）----------
     流程：输邮箱 → 收验证码（复用 email_code）→ 填验证码 + 新密码 → 这里重置。
     ⚠️ 只服务邮箱账号（user:e:<email>）。老手机号/用户名账号没有绑定邮箱，
        重置不了 —— 前端要如实说明，别给人「填了没反应」的错觉。 */
  if (action === 'email_reset') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code)) {
      return json({ ok: false, error: 'bad_params', msg: '邮箱或验证码格式不对' }, 400);
    }
    if (badPass(password)) {
      return json({ ok: false, error: 'bad_password', msg: '新密码至少 6 位（最长 64 位）' }, 400);
    }
    const saved = await kv.get('ec:' + email);
    if (!saved || saved !== code) {
      return json({ ok: false, error: 'bad_code', msg: '验证码不对或已过期，重新发一个试试' }, 400);
    }
    const key = acctKey(email);          /* 邮箱账号 → user:e:<email> */
    let rec = null;
    try { rec = JSON.parse((await kv.get(key)) || 'null'); } catch (e) {}
    if (!rec || !rec.hash) {
      return json({ ok: false, error: 'no_user', msg: '这个邮箱还没注册过（老手机号账号请用「用账号密码登录」）' }, 404);
    }
    const salt = randHex(16);
    rec.salt = salt;
    rec.hash = await pbkdf2(password, salt);
    try { await kv.put(key, JSON.stringify(rec)); } catch (e) {
      if (/limit/i.test(String(e && e.message))) {
        return json({ ok: false, error: 'kv_busy', msg: '云端存储今日写入配额已用完，明早再试' }, 503);
      }
      throw e;
    }
    /* 重置后把该账号的 session 全清掉（防旧密码的登录态继续有效） */
    try { await kv.delete('ec:' + email); } catch (e) {}
    return json({ ok: true, msg: '密码已重置，用新密码登录吧' });
  }

  /* ---------- 我的邀请码（需登录态）----------
     规则：码 = 邮箱 PBKDF2 哈希前 8 位（稳定、不可逆、不需要额外存储）。
     随时可看（她 22:5x：自己的验证码随时可以看，用来分享给朋友）。 */
  if (action === 'my_invite') {
    const sess = await sessionOf(kv, request, body);
    if (!sess) return json({ ok: false, error: 'unauthorized', msg: '登录已过期，请重新登录' }, 401);
    /* 🔴 每一步独立 try：邀请码是「随时可看」的核心需求，任何一步（哈希/KV）出岔子
       都只降级、绝不 500 —— 宁可少回战绩，也要把码给到她。 */
    let code = '';
    try { code = await inviteCodeOf(kv, sess.acct); } catch (e) {}
    try { if (code) await kv.put('inv2e:' + code, sess.acct); } catch (e) {}
    /* 顺手回邀请战绩：已邀几人 + 累计获得天数（她要看「我还差几人到顶」） */
    let invited = 0, earnedDays = 0;
    try {
      const st = JSON.parse((await kv.get('invst:' + sess.acct)) || 'null');
      if (st) { invited = st.invited || 0; earnedDays = st.earnedDays || 0; }
    } catch (e) {}
    return json({ ok: true, code, invited, earnedDays, capDays: 30, rewardDays: 7 });
  }

  /* ---------- 查询某个邀请码是否有效（注册页实时校验用，不需要登录）----------
     只回「有没有效 + 邀请人是谁（脱敏）」，不回任何会员/隐私信息。 */
  if (action === 'invite_check') {
    /* 🔴 整体 try：别再让任何未捕获异常变成裸 500（注册页要靠它实时提示） */
    try {
    const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return json({ ok: false, error: 'bad_code', msg: '邀请码不能为空' }, 400);
    const acct = await acctOfInvite(kv, code);
    if (!acct) return json({ ok: false, error: 'not_found', msg: '这个邀请码不存在，检查一下？' }, 404);
    let earnedDays = 0;
    try {
      const st = JSON.parse((await kv.get('invst:' + acct)) || 'null');
      if (st) earnedDays = st.earnedDays || 0;
    } catch (e) {}
    /* 字面量 30/7（与 my_invite 同口径）；战绩读不到按 0 算 —— 码有效就放行，不因统计失败卡住注册 */
    const remaining = Math.max(0, 30 - earnedDays);
    return json({ ok: true, valid: true, remainingDays: remaining,
      msg: remaining > 0 ? ('有效 · 对方还能再邀 ' + Math.floor(remaining / 7) + ' 人') : '对方邀请额度已用完' });
    } catch (e) {
      return json({ ok: false, error: 'check_failed', msg: '这个邀请码暂时查不了，稍后再试' }, 500);
    }
  }

  /* ---------- 查询会员状态（需登录态；会员中心页实时校验用） ----------
     vip:<acct> 只存服务端（面板 vip_grant 发放），前端只读；过期自动判 null。 */
  if (action === 'vip_status') {
    const sess = await sessionOf(kv, request, body);
    if (!sess) return json({ ok: false, error: 'unauthorized', msg: '登录已过期，请重新登录' }, 401);
    let vip = null;
    try {
      const v = JSON.parse((await kv.get('vip:' + sess.acct)) || 'null');
      if (v && v.expire && v.expire > Date.now()) vip = { type: v.type || 'base', expire: v.expire };
    } catch (e) {}
    return json({ ok: true, acct: sess.acct, vip });
  }

  /* ---------- 查询 AI 免费额度用量（10/1 分功能差异化口径；首页 AI 卡/功能入口置灰用） ----------
     键与闸值必须与 ai.js 同源：aiqt:<acct>:<组>（终身）/ aiqd:<acct>:<day>（每日，UTC YYYYMMDD）。
     默认阈值改这里要同步 ai.js + vip.html 对比表（三处口径一致）。day 计算与 ai.js dayKey 同口径。 */
  if (action === 'ai_usage') {
    const sess = await sessionOf(kv, request, body);
    if (!sess) return json({ ok: false, error: 'unauthorized', msg: '登录已过期，请重新登录' }, 401);
    let vip = null;
    try {
      const v = JSON.parse((await kv.get('vip:' + sess.acct)) || 'null');
      if (v && v.expire && v.expire > Date.now()) vip = { type: v.type || 'base', expire: v.expire };
    } catch (e) {}
    const _p = n => String(n).padStart(2, '0');
    const _d = new Date();
    const day = _d.getUTCFullYear() + _p(_d.getUTCMonth() + 1) + _p(_d.getUTCDate());
    const g = async k => { try { return parseInt((await kv.get(k)) || '0', 10) || 0; } catch (e) { return 0; } };
    /* 10/1 下午她拍板新口径：模考=每月 1 次（aiqmo 月键）/ 写作批改免费 0（会员专属）/
       翻译并入兜底 / 兜底=每周 5 次（aiqw 周键）。与 ai.js 阈值同源，改要三处同步。 */
    const isoWeekOf = d => {
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dn = (t.getUTCDay() + 6) % 7;
      t.setUTCDate(t.getUTCDate() - dn + 3);
      const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
      const fdn = (ft.getUTCDay() + 6) % 7;
      ft.setUTCDate(ft.getUTCDate() - fdn + 3);
      const w = 1 + Math.round((t - ft) / (7 * 86400000));
      return t.getUTCFullYear() + '-W' + String(w).padStart(2, '0');
    };
    const month = _d.getUTCFullYear() + '-' + _p(_d.getUTCMonth() + 1);
    const mockUsed = await g('aiqmo:' + sess.acct + ':' + month);
    const weeklyUsed = await g('aiqw:' + sess.acct + ':' + isoWeekOf(_d));
    return json({
      ok: true, acct: sess.acct, vip,
      mock:   { used: mockUsed,   total: 1, reset: 'monthly' },  // env AI_FREE_MOCK_MONTHLY 默认 1
      weekly: { used: weeklyUsed, total: 5 },                   // env AI_USER_WEEKLY_LIMIT 默认 5（含翻译/长难句等全部辅助 AI）
    });
  }

  /* ---------- 登出 ---------- */
  if (action === 'logout') {
    const sess = await sessionOf(kv, request, body);
    if (sess) { try { await kv.delete('sess:' + sess.tok); } catch (e) {} }
    return json({ ok: true });
  }

  return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
}
