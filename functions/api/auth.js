// Cloudflare Pages Function: /api/auth —— 邮箱验证码登录（注册 / 登录同一入口）
//
// POST /api/auth  { action:'send_code', email }   -> { ok:true, cooldown }   发 6 位验证码
// POST /api/auth  { action:'verify',   email, code } -> { ok:true, account }  校验通过
//
// 需要的环境变量（Cloudflare Pages → Settings → Environment variables，MAIL_API_KEY 建议设成 Secret）：
//   MAIL_API_KEY   必填。Resend 的 API Key（re_xxxx）
//   MAIL_FROM      必填。发信地址，如 "雅思备考站 <no-reply@你的域名>"
//                  ⚠️ 域名必须先在 Resend 里验证过（加 SPF/DKIM 两条 TXT），否则 Resend 会拒绝发信。
//   MAIL_PROVIDER  选填，默认 resend
//
// ⚠️ 未配 MAIL_API_KEY 时返回 503 mail_not_configured —— 前端据此提示「站长还没开通邮箱登录」，
//    并引导回手机号，不会卡死在「点了没反应」。
//
// 安全口径：验证码 6 位数字、5 分钟有效、最多试 5 次；同一邮箱 60 秒内只能发一次、每天最多 10 次；
// 同一 IP 每天最多 30 次发信（防刷短信/邮件轰炸）。
// ⚠️ 与手机号账号一致：**验证码只证明「这个邮箱你能收信」，登录后账号凭证就是邮箱本身**
//    （同 sync.js 的手机号口径，无会话 token）。要真做鉴权得再加 JWT + 每次请求校验，
//    当前阶段与手机号账号保持同一安全级别，先把「对外可用」跑通。

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400',
};
const CODE_TTL = 300;          // 验证码有效期（秒）
const RESEND_COOLDOWN = 60;    // 同一邮箱重发间隔（秒）
const MAX_TRIES = 5;
const DAY_LIMIT_EMAIL = 10;
const DAY_LIMIT_IP = 30;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, CORS),
  });
}

function isEmail(s) {
  return typeof s === 'string' && s.length <= 64 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s);
}
function dayKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}
function ipOf(request) {
  return (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim();
}

function mailHtml(code) {
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
    + '<div style="font-size:13px;color:#8a94a6;letter-spacing:.08em">IELTS 备考站</div>'
    + '<h2 style="margin:8px 0 16px;font-size:20px;color:#1f2d3d">你的登录验证码</h2>'
    + '<div style="font-size:32px;font-weight:800;letter-spacing:.32em;color:#3a9a93;background:#f2f8f7;border-radius:12px;padding:18px 0;text-align:center">' + code + '</div>'
    + '<p style="color:#5b6675;font-size:14px;line-height:1.7;margin:18px 0 0">5 分钟内有效。如果不是你本人操作，忽略这封邮件即可，你的数据不会有任何变化。</p>'
    + '</div>';
}

async function sendMail(env, to, code) {
  const provider = (env && env.MAIL_PROVIDER) || 'resend';
  if (provider !== 'resend') return { ok: false, msg: '暂不支持的发信服务：' + provider };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + env.MAIL_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject: '【雅思备考站】登录验证码 ' + code,
      html: mailHtml(code),
    }),
  });
  if (r.ok) return { ok: true };
  let msg = 'Resend 返回 ' + r.status;
  try {
    const j = await r.json();
    if (j && (j.message || j.error)) msg = (typeof j.message === 'string' ? j.message : '') || j.error;
  } catch (e) {}
  return { ok: false, msg: msg };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, error: '只支持 POST' }, 405);

  if (!env || !env.SYNC_KV) return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503);
  if (!env.MAIL_API_KEY || !env.MAIL_FROM) {
    return json({ ok: false, error: 'mail_not_configured', msg: '邮箱登录还没开通（缺 MAIL_API_KEY / MAIL_FROM）' }, 503);
  }

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json', msg: '请求体不是合法 JSON' }, 400); }
  const action = body && body.action;
  const email = (body && typeof body.email === 'string') ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return json({ ok: false, error: 'bad_email', msg: '邮箱格式不正确' }, 400);

  const kv = env.SYNC_KV;
  const codeKey = 'authcode:' + email;
  const cdKey = 'authcd:' + email;
  const dayKeyEmail = 'authday:' + email + ':' + dayKey(new Date());
  const dayKeyIp = 'authdayip:' + ipOf(request) + ':' + dayKey(new Date());

  if (action === 'send_code') {
    // 冷却：60 秒内不重发
    const last = parseInt((await kv.get(cdKey)) || '0', 10);
    const now = Date.now();
    if (last && (now - last) < RESEND_COOLDOWN * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN * 1000 - (now - last)) / 1000);
      return json({ ok: false, error: 'cooldown', msg: '请 ' + wait + ' 秒后再试', wait: wait }, 429);
    }
    const nEmail = parseInt((await kv.get(dayKeyEmail)) || '0', 10);
    const nIp = parseInt((await kv.get(dayKeyIp)) || '0', 10);
    if (nEmail >= DAY_LIMIT_EMAIL) return json({ ok: false, error: 'email_limit', msg: '该邮箱今日验证码已达上限' }, 429);
    if (nIp >= DAY_LIMIT_IP) return json({ ok: false, error: 'ip_limit', msg: '当前网络今日请求过多，请稍后再试' }, 429);

    // crypto.getRandomValues 在 Workers 里可用，比 Math.random 安全得多
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const code = String(buf[0] % 1000000).padStart(6, '0');

    await kv.put(codeKey, JSON.stringify({ code: code, exp: now + CODE_TTL * 1000, tries: 0 }), { expirationTtl: CODE_TTL });
    await kv.put(cdKey, String(now), { expirationTtl: RESEND_COOLDOWN });
    await kv.put(dayKeyEmail, String(nEmail + 1), { expirationTtl: 172800 });
    await kv.put(dayKeyIp, String(nIp + 1), { expirationTtl: 172800 });

    const r = await sendMail(env, email, code);
    if (!r.ok) return json({ ok: false, error: 'mail_failed', msg: r.msg || '邮件发送失败' }, 502);
    return json({ ok: true, cooldown: RESEND_COOLDOWN });
  }

  if (action === 'verify') {
    const code = String((body && body.code != null) ? body.code : '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return json({ ok: false, error: 'bad_code', msg: '验证码是 6 位数字' }, 400);
    const raw = await kv.get(codeKey);
    if (!raw) return json({ ok: false, error: 'no_code', msg: '验证码不存在或已过期，请重新获取' }, 400);
    let rec = null;
    try { rec = JSON.parse(raw); } catch (e) { return json({ ok: false, error: 'no_code', msg: '验证码异常，请重新获取' }, 400); }
    if (!rec || Date.now() > (rec.exp || 0)) {
      await kv.delete(codeKey);
      return json({ ok: false, error: 'expired', msg: '验证码已过期，请重新获取' }, 400);
    }
    if ((rec.tries || 0) >= MAX_TRIES) {
      await kv.delete(codeKey);
      return json({ ok: false, error: 'too_many_tries', msg: '尝试次数过多，请重新获取验证码' }, 429);
    }
    if (String(rec.code) !== code) {
      rec.tries = (rec.tries || 0) + 1;
      await kv.put(codeKey, JSON.stringify(rec), { expirationTtl: CODE_TTL });
      return json({ ok: false, error: 'bad_code', msg: '验证码不正确，还可试 ' + (MAX_TRIES - rec.tries) + ' 次' }, 400);
    }
    await kv.delete(codeKey);
    return json({ ok: true, account: email });
  }

  return json({ ok: false, error: 'bad_action', msg: '未知 action' }, 400);
}
