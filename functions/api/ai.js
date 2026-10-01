// Cloudflare Pages Function: /api/ai
// 站内 AI 中转：浏览器 → 本站 Function → DeepSeek（OpenAI 兼容 /chat/completions）。
// 存在的意义：访客不必自己申请 / 填写 API Key 就能用全站 AI 功能（口语对练、词库翻译、
// 长难句拆解、写作批改、串题素材…）。Key 只存在服务端环境变量里，永远不下发到浏览器。
//
// 需要的环境变量（Cloudflare Pages → Settings → Environment variables，密钥建议设成 Secret）：
//   AI_API_KEY           必填。DeepSeek 的 sk-xxxx（也可填任何 OpenAI 兼容服务的 Key）
//   AI_BASE_URL          选填，默认 https://api.deepseek.com/v1
//   AI_MODEL             选填，默认 deepseek-chat
//   AI_DAILY_LIMIT       选填，全站每日总调用上限，默认 3000
//   AI_IP_LIMIT          选填，单 IP 每日上限，默认 200
//   AI_USER_DAILY_LIMIT  选填，单账号每日 AI 额度（免费/会员分层用），默认 0 = 不限；
//                        她拍板具体数值后配这个变量即可，代码不用动
// 访问规则（她 10/1 拍板「必须登录才能用 AI」）：登录闸先于一切——未登录（无/无效 X-Session）
// 一律 401 auth_required，即使 AI_API_KEY 未配也不给未登录用户探出任何信息。
// 未配 AI_API_KEY 时（已登录用户）返回 501 { ok:false, error:'relay_not_configured' }。
//
// 为什么只透传白名单字段：请求体由浏览器提供，若整段转发上游，任何人都能借本站 Key
// 调任意参数（甚至换 model 打贵模型）。因此只取 model/messages/temperature/max_tokens/
// response_format，其余一律忽略。
//
// 限流实现说明：计数落在 SYNC_KV，键按「天 + 10 个轮转桶」打散，避开 KV「同一 key 每秒 1 次写」
// 的限制。当前流量（每日几十~几百次）完全够用；真到每天上万次请换 D1 / Durable Objects。

/* 默认对任意来源开放（本站要能在 pages.dev / 本地 / 自定义域下都调用）。
   若担心别人盗刷额度，把环境变量 AI_ALLOW_ORIGIN 设成自己的域名（如 https://ielts.example.com），
   这里就只给这一个来源回 CORS 头 —— 浏览器层面其它站点直接调不通。 */
function corsHeaders(env) {
  return {
    'access-control-allow-origin': (env && env.AI_ALLOW_ORIGIN) || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '86400',
  };
}

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const MAX_MAX_TOKENS = 8192;
const MAX_INPUT_CHARS = 60000;      // messages 序列化后的字符上限，防超大请求拖爆上游
const UPSTREAM_TIMEOUT_MS = 55000;  // Pages Function 上限 60s（免费版 CPU/墙钟），留 5s 余量

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }, corsHeaders(env)),
  });
}

function dayKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}

/* 计数键按 10 个桶轮转：同一秒内多次调用会散到不同 key，绕开 KV 写频率限制。 */
function bucketOf(d) { return Math.floor(d.getUTCMinutes() % 10); }

async function bumpCount(kv, prefix, day, bucket) {
  const key = prefix + ':' + day + ':' + bucket;
  let n = 1;
  try {
    const cur = await kv.get(key);
    n = (cur ? parseInt(cur, 10) : 0) + 1;
    await kv.put(key, String(n), { expirationTtl: 172800 });
  } catch (e) { /* 计数失败不影响主流程：宁可不限流，也不让 AI 用不了 */ }
  return n;
}

async function sumBuckets(kv, prefix, day) {
  let total = 0;
  for (let b = 0; b < 10; b++) {
    try {
      const v = await kv.get(prefix + ':' + day + ':' + b);
      if (v) total += parseInt(v, 10) || 0;
    } catch (e) {}
  }
  return total;
}

/* 登录收口（她 10/1 拍板「必须登录才能用 AI」）：凭 X-Session 头查 sess:<token>，
   与 /api/auth 的 session 同源。未登录 → 401 auth_required。 */
async function sessAcctOf(kv, request) {
  const tok = String(request.headers.get('X-Session') || '').trim();
  if (!tok || !/^[0-9a-f]{32,128}$/.test(tok)) return null;
  try {
    const raw = await kv.get('sess:' + tok);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && s.acct) || null;
  } catch (e) { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: '只支持 POST' }, 405, env);
  }
  if (!env || !env.SYNC_KV) {
    return json({ ok: false, error: 'kv_not_bound', msg: '云端存储未绑定（SYNC_KV）' }, 503, env);
  }

  /* 登录闸：未登录一律 401（先于 AI_API_KEY 检查——没配 Key 时也别给未登录用户探出任何信息） */
  const acct = await sessAcctOf(env.SYNC_KV, request);
  if (!acct) {
    return json({ ok: false, error: 'auth_required', msg: '请先登录，登录后即可使用 AI 功能' }, 401, env);
  }

  const apiKey = (env && env.AI_API_KEY) || '';
  if (!apiKey) {
    return json({ ok: false, error: 'relay_not_configured', msg: '站内 AI 通道未配置（缺 AI_API_KEY）' }, 501, env);
  }

  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: '请求体不是合法 JSON' }, 400, env); }

  const messages = Array.isArray(body && body.messages) ? body.messages : null;
  if (!messages || !messages.length) {
    return json({ ok: false, error: '缺少 messages' }, 400, env);
  }
  // 只保留 role/content 两个字段，且 content 必须是字符串或数组（多模态文本块）
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m.role === 'assistant' || m.role === 'system') ? m.role : 'user';
    if (typeof m.content === 'string') clean.push({ role, content: m.content });
    else if (Array.isArray(m.content)) clean.push({ role, content: m.content });
  }
  if (!clean.length) return json({ ok: false, error: 'messages 为空或格式不支持' }, 400, env);

  const chars = JSON.stringify(clean).length;
  if (chars > MAX_INPUT_CHARS) {
    return json({ ok: false, error: '输入过长（上限 ' + MAX_INPUT_CHARS + ' 字符）' }, 413, env);
  }

  /* ---- 配额：全站每日 + 单 IP 每日 ---- */
  const now = new Date();
  const day = dayKey(now);
  const bucket = bucketOf(now);
  const dailyLimit = parseInt((env && env.AI_DAILY_LIMIT) || '3000', 10) || 3000;
  const ipLimit = parseInt((env && env.AI_IP_LIMIT) || '200', 10) || 200;
  const ip = (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim();

  const usedTotal = await sumBuckets(env.SYNC_KV, 'aiq', day);
  if (usedTotal >= dailyLimit) {
    return json({ ok: false, error: 'daily_limit', msg: '站内 AI 通道今日额度已用完' }, 429, env);
  }
  const usedIp = await sumBuckets(env.SYNC_KV, 'aiqip:' + ip, day);
  if (usedIp >= ipLimit) {
    return json({ ok: false, error: 'ip_limit', msg: '今日调用次数已达上限' }, 429, env);
  }
  /* 按账号每日额度（免费/会员分层用）：AI_USER_DAILY_LIMIT 环境变量，0 = 不限（默认）。
     具体免费额度数值等她拍板后配环境变量即可，代码无需再动。 */
  const acctLimit = parseInt((env && env.AI_USER_DAILY_LIMIT) || '0', 10) || 0;
  if (acctLimit > 0) {
    const usedAcct = await sumBuckets(env.SYNC_KV, 'aiqa:' + acct, day);
    if (usedAcct >= acctLimit) {
      return json({ ok: false, error: 'user_limit', msg: '你今日的免费 AI 额度已用完' }, 429, env);
    }
  }

  const base = ((env && env.AI_BASE_URL) || DEFAULT_BASE).replace(/\/+$/, '');
  const model = (env && env.AI_MODEL) || DEFAULT_MODEL;
  let maxTokens = parseInt(body && body.max_tokens, 10);
  if (!maxTokens || isNaN(maxTokens) || maxTokens <= 0) maxTokens = 4096;
  if (maxTokens > MAX_MAX_TOKENS) maxTokens = MAX_MAX_TOKENS;
  let temperature = Number(body && body.temperature);
  if (isNaN(temperature) || temperature < 0) temperature = 0.7;
  if (temperature > 2) temperature = 2;

  const upstreamBody = {
    model,
    messages: clean,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  // 需要 strict JSON 输出的场景（词库导入 / 评分）由前端显式声明
  if (body && body.json_mode === true) upstreamBody.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(upstreamBody),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e && e.name === 'AbortError');
    return json({ ok: false, error: aborted ? 'upstream_timeout' : 'upstream_error', msg: aborted ? 'AI 响应超时' : '无法连接 AI 服务' }, (aborted ? 504 : 502), env);
  }
  clearTimeout(timer);

  const text = await upstream.text();
  if (!upstream.ok) {
    let detail = '';
    try {
      const j = JSON.parse(text);
      const err = j && j.error;
      detail = (typeof err === 'object' && err && err.message) ? err.message
        : (typeof err === 'string' ? err : '') || (j && (j.message || j.detail)) || '';
    } catch (e) { detail = text.slice(0, 200); }
    return json({ ok: false, error: 'upstream_' + upstream.status, msg: detail || ('AI 服务返回 ' + upstream.status) }, (upstream.status === 429 ? 429 : 502), env);
  }

  /* 只有真的拿到 2xx 才计额度：上游报错 / 超时 / Key 失效不该吃掉用户配额 */
  bumpCount(env.SYNC_KV, 'aiq', day, bucket);
  bumpCount(env.SYNC_KV, 'aiqip:' + ip, day, bucket);
  bumpCount(env.SYNC_KV, 'aiqa:' + acct, day, bucket);   // 按账号计量（免费额度框架，阈值 AI_USER_DAILY_LIMIT）

  // 直接透传上游响应体（前端现有解析逻辑 choices[0].message.content 不用改）
  return new Response(text, {
    status: 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-ai-model': model,
    }, corsHeaders(env)),
  });
}
