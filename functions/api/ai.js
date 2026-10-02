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
//   AI_USER_WEEKLY_LIMIT 选填，免费账号每周 AI 兜底额度，默认 5。
//                        10/1 下午她拍板口径：口语模考免费每月 1 次 / 写作批改免费 0 次（会员专属）/
//                        其余辅助 AI（含翻译·长难句）每周合计 5 次；会员跳过全部免费额度闸。
//                        （原 AI_USER_DAILY_LIMIT=10 每日兜底口径同日退役。）
//   AI_FREE_MOCK_MONTHLY 选填，口语模考免费次数/自然月，默认 1
//   AI_FREE_WRITING_TOTAL 选填，写作批改免费次数，默认 0（=会员专属；配正数恢复终身体验额度）
//   AI_RATE_PER_MIN      选填，单账号每分钟调用上限（防脚本刷量），默认 10；会员同样受限
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

/* 自然月键（UTC）：口语模考「每月 1 次」按自然月清零，键里带月份故 TTL 只防残留。 */
function monthKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1);
}

/* ISO 周键（UTC，周一起始）：「每周 5 次」兜底按自然周清零。标准 ISO 8601 周号算法。 */
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = (t.getUTCDay() + 6) % 7;               // 周一=0 … 周日=6
  t.setUTCDate(t.getUTCDate() - dn + 3);            // 移到本周四（ISO 周锚点）
  const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fdn = (ft.getUTCDay() + 6) % 7;
  ft.setUTCDate(ft.getUTCDate() - fdn + 3);         // 1 月 4 日所在周的周四 = 第 1 周锚点
  const week = 1 + Math.round((t - ft) / (7 * 86400000));
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
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
  /* 会员身份（10/1 晚框架先搭好）：vip:<acct>.expire 未过期 = 会员。
     会员不受 AI_USER_DAILY_LIMIT 限制（权益口径先按豆包方案「会员无限 AI」实现，
     她拍板改口径时只动这里）。vip 键只在服务端，绝不进 DATA 云同步（客户端可篡改）。 */
  let isVip = false;
  try {
    const v = JSON.parse((await env.SYNC_KV.get('vip:' + acct)) || 'null');
    isVip = !!(v && v.expire && v.expire > Date.now());
  } catch (e) {}

  /* 按账号每周兜底额度（免费/会员分层）：AI_USER_WEEKLY_LIMIT 环境变量，默认 5。
     ⚠️ 10/1 下午她拍板：原「每日 10 次」口径取消，改为每周 5 次兜底（口语模考/写作批改/
     串题在下面对应功能闸先行；其余辅助 AI 全部走这里）。会员跳过。 */
  const week = isoWeekKey(now);
  const weekLimit = parseInt((env && env.AI_USER_WEEKLY_LIMIT) != null ? env.AI_USER_WEEKLY_LIMIT : '5', 10) || 0;
  if (weekLimit > 0 && !isVip) {
    let usedWeek = 0;
    try { usedWeek = parseInt((await env.SYNC_KV.get('aiqw:' + acct + ':' + week)) || '0', 10) || 0; } catch (e) {}
    if (usedWeek >= weekLimit) {
      return json({ ok: false, error: 'user_limit', msg: '你本周的免费 AI 额度（' + weekLimit + ' 次）已用完，周卡首购 ¥19 立享无限用' }, 429, env);
    }
  }

  /* ---- 分功能差异化额度（10/1 下午她拍板新口径）----
     ① 口语模考 mock_q：免费每月 1 次（自然月 UTC 清零；开考出题时闸+计，评分/总结属同场不重复计）
     ② 写作批改 writing_score：免费 0 次 = 会员专属（她拍板删掉原「终身 2 次」；
        env AI_FREE_WRITING_TOTAL 配正数可恢复终身体验额度）
     ③ 串题素材 material_* / speaking_chuan_*：会员专属（免费 403 vip_required）
     ④ 翻译/长难句不再单独设组，并入上面每周 5 次兜底（原 aiqd 每日键口径退役）
     计量键：aiqmo:<acct>:<YYYY-MM>（月）/ aiqt:<acct>:writing（终身，默认 0 不启用）。
     默认阈值改这里要同步：auth.js ai_usage + vip.html 对比表（三处口径一致）。 */
  const service = String((body && body.service) || '').trim();
  const month = monthKey(now);
  if (!isVip) {
    // ③ 串题素材会员专属
    if (/^(material_|speaking_chuan_)/.test(service)) {
      return json({ ok: false, error: 'vip_required', msg: '串题素材是会员专属功能，周卡首购 ¥19 起开通' }, 403, env);
    }
    // ② 写作批改：免费默认 0（会员专属）
    if (service === 'writing_score') {
      const wt = parseInt((env && env.AI_FREE_WRITING_TOTAL) != null ? env.AI_FREE_WRITING_TOTAL : '0', 10) || 0;
      if (wt <= 0) {
        return json({ ok: false, error: 'vip_required', msg: '写作批改是会员专属功能，周卡首购 ¥19 起开通' }, 403, env);
      }
      let wUsed = 0;
      try { wUsed = parseInt((await env.SYNC_KV.get('aiqt:' + acct + ':writing')) || '0', 10) || 0; } catch (e) {}
      if (wUsed >= wt) {
        return json({ ok: false, error: 'writing_limit', msg: '写作批改免费体验已用完（共 ' + wt + ' 次），周卡首购 ¥19 立享无限批改' }, 429, env);
      }
    }
    // ① 口语模考：每月 1 次
    if (service === 'mock_q') {
      const mLimit = parseInt((env && env.AI_FREE_MOCK_MONTHLY) != null ? env.AI_FREE_MOCK_MONTHLY : '1', 10) || 0;
      let mUsed = 0;
      try { mUsed = parseInt((await env.SYNC_KV.get('aiqmo:' + acct + ':' + month)) || '0', 10) || 0; } catch (e) {}
      if (mLimit > 0 && mUsed >= mLimit) {
        return json({ ok: false, error: 'mock_limit',
          msg: '口语模考免费额度已用完（每月 ' + mLimit + ' 次），下月再来，或周卡首购 ¥19 无限练' }, 429, env);
      }
    }
  }

  /* 分钟级风控（防脚本刷量，豆包 10/1 方案采纳；会员同样受限——防的是盗刷站内 Key）：
     AI_RATE_PER_MIN 默认 10 次/分钟（豆包建议 1 次/分钟，太紧会误伤连续对话，先放宽到 10，
     待她拍板）。键按分钟分片 + TTL 2 分钟自愈。 */
  const ratePerMin = parseInt((env && env.AI_RATE_PER_MIN) || '10', 10) || 10;
  const p2 = n => String(n).padStart(2, '0');
  const minKey = 'aiqm:' + acct + ':' + day + ':' + p2(now.getUTCHours()) + p2(now.getUTCMinutes());
  let usedMin = 0;
  try { usedMin = parseInt((await env.SYNC_KV.get(minKey)) || '0', 10) || 0; } catch (e) {}
  if (usedMin >= ratePerMin) {
    return json({ ok: false, error: 'rate_limit', msg: '调用太频繁，请稍后再试' }, 429, env);
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
  bumpCount(env.SYNC_KV, 'aiqa:' + acct, day, bucket);   // 按账号计量（会员也计数：面板「今日 AI 次数」要看得到会员用量，只是会员不受额度闸限制）
  /* 10/1 下午新口径分功能计量（只对免费用户累计；会员无限用不必计）：
     月度模考 aiqmo:<acct>:<YYYY-MM>（TTL 40 天防残留）/ 写作终身 aiqt:<acct>:writing（默认 0 不启用）
     / 周兜底 aiqw:<acct>:<YYYY-Www>（TTL 10 天防残留）。写失败不影响主流程。 */
  if (!isVip) {
    if (service === 'mock_q') {
      (async () => {
        try {
          const mk = 'aiqmo:' + acct + ':' + month;
          const cur = parseInt((await env.SYNC_KV.get(mk)) || '0', 10) || 0;
          await env.SYNC_KV.put(mk, String(cur + 1), { expirationTtl: 3456000 });
        } catch (e) {}
      })();
    }
    if (service === 'writing_score') {
      (async () => {
        try {
          const lk = 'aiqt:' + acct + ':writing';
          const cur = parseInt((await env.SYNC_KV.get(lk)) || '0', 10) || 0;
          await env.SYNC_KV.put(lk, String(cur + 1));
        } catch (e) {}
      })();
    }
    (async () => {
      try {
        const wk = 'aiqw:' + acct + ':' + week;
        const cur = parseInt((await env.SYNC_KV.get(wk)) || '0', 10) || 0;
        await env.SYNC_KV.put(wk, String(cur + 1), { expirationTtl: 864000 });
      } catch (e) {}
    })();
  }
  /* 分钟风控计数（TTL 2 分钟自愈；写失败不影响主流程，与 bumpCount 同口径） */
  (async () => {
    try {
      const curMin = parseInt((await env.SYNC_KV.get(minKey)) || '0', 10) || 0;
      await env.SYNC_KV.put(minKey, String(curMin + 1), { expirationTtl: 120 });
    } catch (e) {}
  })();

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
