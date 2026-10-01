// Cloudflare Pages Function: /api/auth —— 账号（手机号/用户名）+ 密码登录（注册 / 登录 / 改密码 / 登出）
//
// 背景（10/1 她拍板）：邮箱验证码登录要买域名 + Resend（MAIL_API_KEY / MAIL_FROM），先不搞。
// 改成「手机号 + 密码」，同时补上以前最大的安全洞——「手机号即凭证，任何知道号码的人都能读写云数据」：
//   · register  手机号/用户名 + 密码 → PBKDF2 存哈希（绝不存明文）
//   · login     验密码 → 发 30 天 session token，此后 /api/sync 凭 X-Session token 读写
//   · change    登录态下验旧密码 → 换新密码（session 保留，其他设备不受影响）
//   · logout    删 session
//   找回密码：暂未提供——恢复码机制已按她 10/1 拍板整套下线（太长记不住，比密码还难记）；
//   手机验证码找回后续版本再做。在此之前忘记密码只能换新号重开（云端老数据归旧键名，不会丢）。
//
// KV 键（SYNC_KV）：
//   user:<acct>    { salt, hash, rechash?, created }  —— PBKDF2-SHA256 10 万次迭代 + 随机盐
//                  （rechash 是恢复码时代的遗留字段：存量账号还带着，新注册/改密不再写入，留着无害）
//   sess:<token>   { acct }                           —— TTL 30 天（30 天后需重新登录）
//   fail:<acct>    登录失败计数（10 次锁 15 分钟，防在线爆破；TTL 自愈）
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
const PBKDF2_ITER = 100000;   // Workers 的 WebCrypto PBKDF2 是原生实现，10 万次在 CPU 限额内
const SESS_TTL = 30 * 24 * 3600;          // session 30 天
const LOCK_TTL = 15 * 60;                 // 失败锁定 15 分钟
const MAX_FAILS = 10;
// ⭐ 10/1 她拍板：账号 = 手机号 或 自定义用户名（6-20 位数字/字母/下划线，统一小写存储）。
// 老手机号账号（6-15 位纯数字）天然满足该规则，登录键名不变，云端老数据无缝接上。
const ACCT_RE = /^[a-z0-9_]{6,20}$/;

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
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBuf(saltHex), iterations: PBKDF2_ITER }, key, 256);
  return bufToHex(bits);
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

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: '只支持 POST' }, 405);
  if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503);

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json', msg: '请求体不是合法 JSON' }, 400); }
  const kv = env.SYNC_KV;
  const action = body && body.action;

  /* ---------- 注册：账号（手机号/用户名）+ 密码 ---------- */
  if (action === 'register') {
    const acct = String(body.acct || body.phone || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (badPhone(acct)) return json({ ok: false, error: 'bad_phone', msg: '账号格式：6-20 位数字/字母/下划线' }, 400);
    if (badPass(password)) return json({ ok: false, error: 'bad_password', msg: '密码至少 6 位（最长 64 位）' }, 400);
    if (await kv.get('user:' + acct)) {
      return json({ ok: false, error: 'already_registered', msg: '该账号已设置过密码，直接登录即可' }, 409);
    }
    const salt = randHex(16);
    const hash = await pbkdf2(password, salt);
    await kv.put('user:' + acct, JSON.stringify({ salt, hash, created: Date.now() }));
    return json({ ok: true });
  }

  /* ---------- 登录 ---------- */
  if (action === 'login') {
    const acct = String(body.acct || body.phone || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (badPhone(acct) || badPass(password)) return json({ ok: false, error: 'bad_credentials', msg: '账号或密码不正确' }, 400);
    if (await failLock(kv, '', acct, false)) return json({ ok: false, error: 'locked', msg: '尝试次数过多，请 15 分钟后再试' }, 429);
    let rec = null;
    try { rec = JSON.parse((await kv.get('user:' + acct)) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'no_user', msg: '该账号还没设置过密码，先「设置密码」（老用户数据会自动接上）' }, 404);
    const h = await pbkdf2(password, rec.salt);
    if (h !== rec.hash) {
      await failLock(kv, '', acct, true);
      return json({ ok: false, error: 'bad_credentials', msg: '账号或密码不正确' }, 401);
    }
    await failClear(kv, '', acct);
    const token = randHex(32);
    await kv.put('sess:' + token, JSON.stringify({ acct }), { expirationTtl: SESS_TTL });
    return json({ ok: true, token, acct });
  }

  /* ---------- 修改密码（需登录态） ---------- */
  if (action === 'change') {
    const sess = await sessionOf(kv, request, body);
    if (!sess) return json({ ok: false, error: 'unauthorized', msg: '登录已过期，请重新登录' }, 401);
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');
    if (badPass(newPassword)) return json({ ok: false, error: 'bad_password', msg: '新密码至少 6 位（最长 64 位）' }, 400);
    let rec = null;
    try { rec = JSON.parse((await kv.get('user:' + sess.acct)) || 'null'); } catch (e) {}
    if (!rec) return json({ ok: false, error: 'no_user', msg: '账号异常（无密码记录）' }, 404);
    const oldH = await pbkdf2(oldPassword, rec.salt);
    if (oldH !== rec.hash) return json({ ok: false, error: 'bad_old', msg: '当前密码不正确' }, 401);
    const salt = randHex(16);
    rec.salt = salt;
    rec.hash = await pbkdf2(newPassword, salt);
    await kv.put('user:' + sess.acct, JSON.stringify(rec));
    return json({ ok: true });
  }

  /* ---------- 登出 ---------- */
  if (action === 'logout') {
    const sess = await sessionOf(kv, request, body);
    if (sess) { try { await kv.delete('sess:' + sess.tok); } catch (e) {} }
    return json({ ok: true });
  }

  return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
}
