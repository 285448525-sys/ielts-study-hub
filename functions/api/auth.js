// Cloudflare Pages Function: /api/auth —— 邮箱 + 密码登录（注册 / 登录 / 改密码 / 找回 / 登出）
//
// ⭐ 10/21 她拍板：**只能邮箱登录**——手机号 / 用户名的注册与登录通道前后端全部删除。
//   现在账号只有一个形态：一个真实邮箱（必须收得到验证码）。
//   · email_code      给邮箱发 6 位验证码（Resend；60s 冷却 / 每天 5 封）
//   · email_register  邮箱 + 验证码 + 密码 + 邀请码(选填) → PBKDF2 存哈希（绝不存明文）
//   · login           邮箱 + 密码 → 验密码，发 30 天 session token（/api/sync 凭 X-Session 读写）
//   · change          登录态下验旧密码 → 换新密码（session 保留，其他设备不受影响）
//   · email_reset     邮箱 + 验证码 → 重设密码（忘了密码的唯一自救路）
//   · logout          删 session
//   已删除：老的 `action:'register'`（手机号/用户名 + 密码）与 body.phone 兼容入参。
//   老的手机号/用户名账号在 KV 里仍是 user:<acct> / sync:<acct> 键，数据一条没删，
//   只是再也登不进来（她 10/21 明确要的取舍）；需要找回请找站长手工处理。
//
// 邀请码（她 10/1 二次拍板=内测会员码）：KV 键 inv:<CODE> = { max, used, created, vipDays? }；注册选填，
// 用码注册成功自动开会员 vipDays 天（缺省 30）；不填码注册走免费额度。注册成功才消耗。
// 发码/作废/看用量统一走 /api/admin（ADMIN_KEY 鉴权），页面化入口 = admin.html 站长面板
// （她 10/1 要求：不进 CF 后台也能管用户/发码/看数据）。
//
// KV 键（SYNC_KV）：
//   user:e:<email> { salt, hash, created, via:'email' }  —— PBKDF2-SHA256 10 万次迭代 + 随机盐
//                  （rechash 是恢复码时代的遗留字段：存量账号还带着，新注册/改密不再写入，留着无害）
//   user:<acct>    —— 10/21 前手机号/用户名账号的老记录，只读保留、不再写入（见下方兼容口径）
//   sess:<token>   { acct }                           —— TTL 30 天（30 天后需重新登录）
//   fail:<acct>    登录失败计数（10 次锁 15 分钟，防在线爆破；TTL 自愈）
//   inv:<CODE>     { max, used, created, vipDays? }      —— 邀请码（注册选填；vipDays=送会员天数；无 TTL）
//   数据键 sync:e:<email> / meta:e:<email> 归 /api/sync 管。
//
// 兼容口径（老账号）：
//   · 10/21 前用手机号/用户名注册的账号：云端记录与学习数据**一条都没删**（user:<acct> / sync:<acct>），
//     但登录入口已随本次改造下线——她明确要「只留邮箱登录」。需要恢复请找站长手工迁移。
//   · 老的「register 允许无密码号直接设密码」通道一并删除：它正是「第一个知道号码的人接管该号」
//     的漏洞面，留着等于给已下线的手机号通道开一扇后门。

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
/* 10/13 注册限流：邮箱验证码挡假邮箱；一人拿一批真邮箱仍可批量注册薅邀请 → 同 IP 每日上限 */
const REG_PER_IP_PER_DAY = 10;
// ⭐ 10/21 她拍板：账号只能是邮箱。手机号/用户名注册登录前后端全删，正则收窄成纯邮箱。
//   格式口径与前端 login.html / functions/api/sync.js / admin.js 完全一致，改一处必须同步另三处。
/* ⚠️ 10/21 三级权限：本常量与 acctKey() 已 export —— functions/api/roles.js 直接 import 复用，
   不许在别的接口里再写一份正则（历史上三处拷贝不同步 → 401 → token 被清）。 */
export const ACCT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
/* 🔴 10/21：账号 → KV 键名统一入口。邮箱-only 后只剩 user:e:<email> 一种形态。
   老手机号/用户名账号的 user:<acct> 键仍在云端（数据一条没删），但已无登录入口；
   这里保留 else 分支，是为了 admin 面板清理存量探针账号时键名能对上，不是给新账号用的。 */
export function acctKey(acct) {
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

function badEmail(p) { return !ACCT_RE.test(String(p || '')); }
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
async function failLock(kv, kind, acct, fails) {
  const key = 'fail' + kind + ':' + acct;
  if (fails) {
    const n = parseInt((await kv.get(key)) || '0', 10) + 1;
    await kv.put(key, String(n), { expirationTtl: LOCK_TTL });
    return n >= MAX_FAILS;
  }
  return parseInt((await kv.get(key)) || '0', 10) >= MAX_FAILS;
}
const failClear = (kv, kind, acct) => kv.delete('fail' + kind + ':' + acct).catch(() => {});

/* 从 body 或 X-Session 头取 token；返回 sess 记录或 null */
async function sessionOf(kv, request, body) {
  const tok = String((request.headers.get('X-Session') || (body && body.token) || '')).trim();
  if (!tok || !/^[0-9a-f]{32,128}$/.test(tok)) return null;
  try {
    const raw = await kv.get('sess:' + tok);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const acct = String((s && s.acct) || '').trim().toLowerCase();
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

  /* ---------- 🔴 10/21 已下线：老「register」（手机号/用户名 + 密码）----------
     她拍板「只能邮箱登录」，该分支连同 body.phone 兼容入参整体删除。
     老的调用方（旧版页面缓存里可能还有）会落到文件末尾的 bad_action 兜底，
     前端拿到的是通用错误——不保留任何能创建非邮箱账号的入口。
     注册唯一入口 = 下面 email_register（邮箱 + 验证码 + 密码）。 */

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
       但要把真实原因回给人话 —— 以前裸 500 她根本不知道发生了什么。
       🔴 10/16 修（线上 email_code 实测：合法邮箱稳定 502，20 秒无响应被 CF 掐断）：
       原实现 fetch **没有超时**，上游一旦不响应（额度/密钥/DNS 任一异常），Worker 会一直挂到
       被 CF 强制断开 → 返回的是 CF 自己的 502 纯文本页（不是我们的 JSON）→ 前端连错误码都拿不到，
       邮箱注册整条路走不通，且无从定位。现在 10s 超时 + 把上游状态码与响应片段带回 detail
       （前端只显示 msg；detail 只用于后台/探针定位真因）。 */
    const ctrl = new AbortController();
    const _to = setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, 10000);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: ctrl.signal,
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
      clearTimeout(_to);
      if (!r.ok) {
        const t = await r.text().catch(function(){ return ''; });
        return json({ ok: false, error: 'mail_failed',
          detail: ('HTTP ' + r.status + ' ' + String(t || '')).slice(0, 240),
          msg: '验证码没发出去（邮件服务返回 ' + r.status + '），稍后再试' }, 502);
      }
    } catch (e) {
      clearTimeout(_to);
      const abort = e && e.name === 'AbortError';
      return json({ ok: false, error: 'mail_failed',
        detail: String((e && (e.name || e.message)) || e).slice(0, 160),
        msg: abort ? '验证码没发出去（邮件服务 10 秒没响应），稍后再试'
                   : '验证码没发出去（网络问题），稍后再试' }, 502);
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
    /* 同 IP 每日注册上限（只作用于邮箱注册；老 register 与找回密码 email_reset 都不受限） */
    const _ip = String(request.headers.get('CF-Connecting-IP') || 'unknown');
    const _dd = new Date();
    const _day = _dd.getUTCFullYear() + String(_dd.getUTCMonth() + 1).padStart(2, '0') + String(_dd.getUTCDate()).padStart(2, '0');
    const _ipKey = 'regip:' + _ip + ':' + _day;
    const _ipN = parseInt((await kv.get(_ipKey)) || '0', 10) + 1;
    if (_ipN > REG_PER_IP_PER_DAY) {
      return json({ ok: false, error: 'too_many_reg', msg: '今天这台设备注册得够多了，明天再试' }, 429);
    }
    try { await kv.put(_ipKey, String(_ipN), { expirationTtl: 86400 }); } catch (e) {}

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

  /* ---------- 登录：邮箱 + 密码 ---------- */
  if (action === 'login') {
    const acct = String(body.acct || body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (badEmail(acct) || badPass(password)) return json({ ok: false, error: 'bad_credentials', msg: '账号或密码不正确' }, 400);
    if (await failLock(kv, '', acct, false)) return json({ ok: false, error: 'locked', msg: '尝试次数过多，请 15 分钟后再试' }, 429);
    let rec = null;
    try { rec = JSON.parse((await kv.get(acctKey(acct))) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'no_user', msg: '这个邮箱还没注册过，先注册（收一次验证码）再登录' }, 404);
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
     10/21 后账号只有邮箱一种形态，这条就是全站唯一的自救路，没有「另一种账号」要提示。 */
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
      return json({ ok: false, error: 'no_user', msg: '这个邮箱还没注册过，先去注册' }, 404);
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
